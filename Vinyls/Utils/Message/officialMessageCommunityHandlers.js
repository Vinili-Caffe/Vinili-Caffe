const path = require("path");
const mongoose = require("mongoose");
const {
  EmbedBuilder,
  escapeMarkdown,
  AuditLogEvent,
  OverwriteType,
  PermissionFlagsBits,
} = require("discord.js");
const { inspect } = require("node:util");
const { getCountingConfigFromBucket } = require("../Global/globalSettingsBucket");
const { getAfk, clearAfk, listMentionReactions } = require("../../Services/Community/profileStore");
const { getCustomReactionMax } = require("../Community/mentionReactionPanelUtils");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const IDs = require("../Config/ids");
const { EPHEMERAL_TTL_NORMAL_MS, scheduleMessageDeletion } = require("../Config/ephemeralMessageTtl");
const COUNTING_CHANNEL_ID = IDs.channels.counting;
const COUNTING_ALLOWED_REGEX = /^[0-9+\-*/x:() ]+$/;
const AFK_RETURN_TTL_MS = 3000;
const WORD_REACTIONS_CONFIG_PATH = path.join(__dirname, "..", "Config", "wordReactions.json");
const WORD_REACTIONS_MAX_REACTIONS = 20;
const WORD_REACTIONS_TIMEZONE = "Europe/Rome";
const WELCOME_CONTEXT_DURATION_MS = 10 * 60 * 1000;
let wordReactionsConfigCache = null;
const welcomeContextUntilByChannelId = new Map();

function getWelcomeContextChannelIds() {
  const rules = getWordReactionsConfig();
  const ids = new Set();
  for (const rule of rules) {
    if (!rule.onlyInWelcomeContext || !Array.isArray(rule.contextChannelIds)) continue;
    for (const idOrKey of rule.contextChannelIds) {
      const resolved = IDs.channels?.[String(idOrKey)] ?? String(idOrKey || "").trim();
      if (resolved) ids.add(resolved);
    }
  }
  return Array.from(ids);
}

function setWelcomeContextActive(guildId, client) {
  if (!guildId || !client?.channels?.cache) return;
  const channelIds = getWelcomeContextChannelIds();
  const until = Date.now() + WELCOME_CONTEXT_DURATION_MS;
  for (const channelId of channelIds) {
    const ch = client.channels.cache.get(channelId);
    if (ch?.guild?.id === guildId) welcomeContextUntilByChannelId.set(channelId, until);
  }
}

function isWelcomeContextActive(channelId) {
  const until = welcomeContextUntilByChannelId.get(String(channelId || ""));
  return typeof until === "number" && Date.now() < until;
}

function getWordReactionsRomeHour(now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: WORD_REACTIONS_TIMEZONE, hour: "2-digit", hour12: false });
  const hour = Number(formatter.format(now)) || 0;
  return Math.max(0, Math.min(23, hour));
}

function isWithinTimeWindow(now, timeWindow) {
  if (!timeWindow || typeof timeWindow.startHour !== "number" || typeof timeWindow.endHour !== "number") return true;
  const hour = getWordReactionsRomeHour(now);
  const start = Math.max(0, Math.min(23, Math.floor(timeWindow.startHour)));
  const end = Math.max(0, Math.min(23, Math.floor(timeWindow.endHour)));
  if (start <= end) return hour >= start && hour <= end;
  return hour >= start || hour <= end;
}

function escapeRegex(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsWholeWord(haystack, word) {
  const w = String(word || "").trim().toLowerCase();
  if (!w) return false;
  const lastChar = w.slice(-1);
  const trailingRepeat = lastChar ? `${escapeRegex(lastChar)}*` : "";
  const pattern = new RegExp(`(?:^|[\\s\\p{P}])(?:${escapeRegex(w)})${trailingRepeat}(?:[\\s\\p{P}]|$)`, "iu");
  return pattern.test(haystack);
}

function stripLeadingNoiseForGreeting(text) {
  let s = String(text || "").trim().toLowerCase();
  if (!s) return "";
  for (let i = 0; i < 8; i += 1) {
    const before = s;
    s = s.replace(/^<@[^>]+>\s*/u, "");
    s = s.replace(/^<#\d{16,20}>\s*/u, "");
    s = s.replace(/^<a?:[a-zA-Z0-9_]{2,}:\d{16,20}>\s*/u, "");
    s = s.replace(/^[\s\p{P}#]+/u, "");
    if (s === before) break;
  }
  return s;
}

function matchesAtMessageStart(haystack, wordOrPhrase) {
  const h = stripLeadingNoiseForGreeting(haystack);
  const needle = String(wordOrPhrase || "").trim().toLowerCase();
  if (!needle || !h) return false;
  const lastChar = needle.slice(-1);
  const repeatedNeedle = lastChar ? `${escapeRegex(needle)}${escapeRegex(lastChar)}*` : escapeRegex(needle);
  const phrasePattern = new RegExp(`^${repeatedNeedle}(?:$|[\\s\\p{P}])`, "u");
  if (needle.includes(" ")) {
    return phrasePattern.test(h);
  }
  const firstToken = h.match(/^([^\s]+)/u);
  if (!firstToken) return false;
  const raw = firstToken[1];
  const first = raw.replace(/[\p{P}]+$/gu, "").toLowerCase();
  if (first === needle) return true;
  if (first.startsWith(needle) && new RegExp(`^${repeatedNeedle}$`, "u").test(first)) return true;
  if (phrasePattern.test(h)) return true;
  return false;
}

function isLoneWordMessage(normalized, word) {
  const w = String(word || "").trim().toLowerCase();
  if (!w) return false;
  let s = stripLeadingNoiseForGreeting(normalized);
  s = s.replace(/[\p{P}\s]+$/gu, "").trim();
  if (s === w) return true;
  const lastChar = w.slice(-1);
  const repeatedNeedle = lastChar ? `${escapeRegex(w)}${escapeRegex(lastChar)}*` : escapeRegex(w);
  return new RegExp(`^${repeatedNeedle}$`, "u").test(s);
}

function getWordReactionsConfig() {
  if (wordReactionsConfigCache) return wordReactionsConfigCache;
  try {
    const data = require(WORD_REACTIONS_CONFIG_PATH);
    wordReactionsConfigCache = Array.isArray(data) ? data : [];
    return wordReactionsConfigCache;
  } catch {
    wordReactionsConfigCache = [];
    return [];
  }
}
const COUNTING_CACHE_TTL_MS = 60_000;
const countingConfigCache = new Map();

async function getCountingConfig(guildId) {
  if (mongoose.connection?.readyState !== 1) return null;
  const key = String(guildId || "");
  if (!key) return null;
  const now = Date.now();
  const cached = countingConfigCache.get(key);
  if (cached?.value && now < Number(cached.expiresAt || 0)) {
    return cached.value;
  }
  const doc = await getCountingConfigFromBucket(key).catch(() => null);
  countingConfigCache.set(key, {
    value: doc || null,
    expiresAt: now + COUNTING_CACHE_TTL_MS,
  });
  return doc || null;
}

function invalidateCountingConfig(guildId) {
  const key = String(guildId || "");
  if (!key) return;
  countingConfigCache.delete(key);
}

const IT_ONE_UNIT_AGO = [
  [/^1 minuto fa$/u, "un minuto fa"],
  [/^1 ora fa$/u, "un'ora fa"],
  [/^1 giorno fa$/u, "un giorno fa"],
  [/^1 settimana fa$/u, "una settimana fa"],
  [/^1 mese fa$/u, "un mese fa"],
  [/^1 anno fa$/u, "un anno fa"],
];

function normalizeItalianUnitAgo(s) {
  const t = String(s || "");
  for (const [re, rep] of IT_ONE_UNIT_AGO) {
    if (re.test(t)) return rep;
  }
  return t;
}

function formatItalianTimeAgo(dateLike) {
  const thenMs = new Date(dateLike).getTime();
  if (Number.isNaN(thenMs)) return "da poco";
  let diffSec = Math.floor((Date.now() - thenMs) / 1000);
  if (diffSec < 0) diffSec = 0;
  const rtf = new Intl.RelativeTimeFormat("it", { numeric: "auto" });
  if (diffSec < 45) return "da poco";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return normalizeItalianUnitAgo(rtf.format(-diffMin, "minute"));
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return normalizeItalianUnitAgo(rtf.format(-diffHr, "hour"));
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return normalizeItalianUnitAgo(rtf.format(-diffDay, "day"));
  const diffWeek = Math.floor(diffDay / 7);
  if (diffWeek < 5) return normalizeItalianUnitAgo(rtf.format(-diffWeek, "week"));
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return normalizeItalianUnitAgo(rtf.format(-diffMonth, "month"));
  const diffYear = Math.max(1, Math.floor(diffDay / 365));
  return normalizeItalianUnitAgo(rtf.format(-diffYear, "year"));
}

async function handleAfk(message) {
  if (mongoose.connection?.readyState !== 1) return;
  const guildId = message.guild?.id;
  if (!guildId) return;
  const userId = message.author.id;
  const afkData = await getAfk(guildId, userId);
  if (afkData) {
    const member = message.guild.members.cache.get(userId);
    if (member) {
      const originalName = afkData.originalName == null ? null : String(afkData.originalName);
      await member.setNickname(originalName).catch(() => { });
    }
    await clearAfk(guildId, userId);
    const msg = await safeMessageReply(
      message,
      `Bentornato <@${userId}>, ho rimosso il tuo AFK.`,
    );
    if (msg) scheduleMessageDeletion(msg, AFK_RETURN_TTL_MS);
  }

  const afkCandidates = new Map();
  const mentionUsers = message.mentions?.users;
  if (mentionUsers) {
    for (const [id, u] of mentionUsers) {
      if (!u.bot) afkCandidates.set(id, u);
    }
  }
  const repliedUser = message.mentions?.repliedUser;
  if (repliedUser && !repliedUser.bot && !afkCandidates.has(repliedUser.id)) {
    afkCandidates.set(repliedUser.id, repliedUser);
  }
  if (afkCandidates.size === 0) return;

  for (const [mentionedId, mentionedUser] of afkCandidates) {
    if (mentionedId === userId) continue;
    const targetAfk = await getAfk(guildId, mentionedId);
    if (!targetAfk) continue;

    const reason = String(targetAfk.message || "").trim();
    const since = targetAfk.timestamp ? new Date(targetAfk.timestamp) : new Date();
    const ago = formatItalianTimeAgo(since);
    const safeName = escapeMarkdown(mentionedUser.username);
    const safeReason = escapeMarkdown(reason);
    const line = reason
      ? `\`${safeName}\` è AFK: ${safeReason} - ${ago}`
      : `\`${safeName}\` è AFK - ${ago}`;
    const msg = await safeMessageReply(message, line);
    if (msg) scheduleMessageDeletion(msg, EPHEMERAL_TTL_NORMAL_MS);
  }
}

function resolveReactionToken(token) {
  const value = String(token || "");
  if (value.startsWith("custom:")) return value.slice("custom:".length);
  if (value.startsWith("unicode:")) return value.slice("unicode:".length);
  return value;
}

function resolveReactionForMessage(message, token) {
  const value = resolveReactionToken(token);
  if (!value) return null;
  const snowflake = /^\d{16,20}$/.test(value) ? value : null;
  if (snowflake) {
    const client = message?.client;
    const guild = message?.guild;
    const emoji = client?.emojis?.cache?.get(snowflake) ?? guild?.emojis?.cache?.get(snowflake);
    if (emoji) return { key: snowflake, value: emoji };
  }
  return { key: value, value };
}

async function reactToMessageWithStoredToken(message, token) {
  const value = resolveReactionToken(token);
  if (!value) return;
  const snowflake = /^\d{16,20}$/.test(value) ? value : null;
  if (snowflake) {
    const guild = message.guild;
    const client = message.client;
    let emoji =
      guild?.emojis?.cache?.get(snowflake) ||
      client?.emojis?.cache?.get(snowflake);
    if (!emoji && guild?.emojis?.fetch) {
      emoji = await guild.emojis.fetch(snowflake).catch(() => null);
    }
    if (emoji) {
      await message.react(emoji).catch(() => {});
      return;
    }
    await message.react({ id: snowflake, name: "emoji" }).catch(() => {});
    return;
  }
  await message.react(value).catch(() => {});
}
async function handleMentionAutoReactions(message) {
  try {
    const mentionedUsers = message.mentions?.users;
    if (!mentionedUsers || mentionedUsers.size === 0) return;

    const explicitMentionIds = new Set();
    const mentionRegex = /<@!?(\d{16,20})>/g;
    let match = null;
    const content = String(message.content || "");
    while ((match = mentionRegex.exec(content)) !== null) {
      explicitMentionIds.add(String(match[1]));
    }

    if (explicitMentionIds.size === 0) return;
    const targetIds = Array.from(
      new Set(
        mentionedUsers
          .filter((user) => !user.bot && explicitMentionIds.has(user.id))
          .map((user) => user.id),
      ),
    );

    if (!targetIds.length) return;

    const docs = await listMentionReactions(message.guild.id, targetIds).catch(() => []);
    if (!Array.isArray(docs) || !docs.length) return;

    const uniqueTokens = new Set();
    for (const doc of docs) {
      const member =
        message.guild.members.cache.get(String(doc?.userId || "")) ||
        (await message.guild.members.fetch(String(doc?.userId || "")).catch(() => null));
      const maxReactions = getCustomReactionMax(member);
      const list = Array.isArray(doc?.reactions) ? doc.reactions.slice(0, maxReactions) : [];
      for (const token of list) {
        if (token) uniqueTokens.add(String(token));
        if (uniqueTokens.size >= 10) break;
      }
      if (uniqueTokens.size >= 10) break;
    }

    for (const token of uniqueTokens) {
      await reactToMessageWithStoredToken(message, token);
    }
  } catch (error) {
    global.logger?.error?.("[MENTION-REACTION] Fatal error:", error);
  }
}

async function handleWordReactions(message) {
  if (!message?.guild || !message.content || typeof message.react !== "function") return;
  const content = String(message.content || "").trim();
  if (!content || content.startsWith("+")) return;

  const rules = getWordReactionsConfig();
  if (!Array.isArray(rules) || !rules.length) return;

  const normalized = content.toLowerCase();
  const seen = new Set();
  const toReact = [];

  const now = new Date();
  for (const rule of rules) {
    if (Array.isArray(rule.channelIds) && rule.channelIds.length > 0) {
      const resolved = rule.channelIds.map((idOrKey) => IDs.channels?.[String(idOrKey)] ?? String(idOrKey || "").trim()).filter(Boolean);
      if (!resolved.includes(String(message.channelId || ""))) continue;
    }
    if (!isWithinTimeWindow(now, rule.timeWindow)) continue;
    if (rule.onlyInWelcomeContext && Array.isArray(rule.contextChannelIds)) {
      const resolvedIds = rule.contextChannelIds.map((idOrKey) => IDs.channels?.[String(idOrKey)] ?? String(idOrKey || "").trim()).filter(Boolean);
      const inAllowedChannel = resolvedIds.includes(String(message.channelId || ""));
      if (!inAllowedChannel || !isWelcomeContextActive(message.channelId)) continue;
    }
    const words = Array.isArray(rule.words) ? rule.words : [];
    const loneWords = Array.isArray(rule.loneWords) ? rule.loneWords : [];
    const reactions = Array.isArray(rule.reactions) ? rule.reactions : [];
    const matchAtStart = rule.matchAtStart === true;
    let match = false;
    for (const w of words) {
      const term = String(w || "").trim();
      if (!term) continue;
      if (matchAtStart) {
        if (matchesAtMessageStart(normalized, term)) {
          match = true;
          break;
        }
      } else if (containsWholeWord(normalized, term)) {
        match = true;
        break;
      }
    }
    if (!match && loneWords.length) {
      match = loneWords.some((lw) => isLoneWordMessage(normalized, lw));
    }
    if (!match) continue;
    for (const token of reactions) {
      const resolved = resolveReactionForMessage(message, token);
      if (!resolved || seen.has(resolved.key) || toReact.length >= WORD_REACTIONS_MAX_REACTIONS) continue;
      seen.add(resolved.key);
      toReact.push(resolved.value);
    }
  }

  for (const emoji of toReact) {
    await message.react(emoji).catch(() => { });
  }
}

function logEventError(client, label, error) {
  const normalizeErrorText = (value) => { if (value instanceof Error) { return value.stack || value.message || String(value); } if (typeof value === "string") return value; if (typeof value === "undefined") return "Unknown error"; try { return inspect(value, { depth: 3, colors: false }); } catch { return String(value); } };

  const payload = `[${label}] ${normalizeErrorText(error)}`;
  setImmediate(() => {
    if (client?.logs?.error) {
      client.logs.error(payload);
      return;
    }
    if (global.logger?.error) {
      global.logger.error(payload);
      return;
    }
    try {
      console.error(payload);
    } catch {
      /* ignore */
    }
  });
}

async function sendCountingFailureReply(message, embed, client) {
  try {
    return await message.reply({
      embeds: [embed],
      allowedMentions: { repliedUser: false },
    });
  } catch (err) {
    logEventError(client, "COUNTING REPLY", err);
    return null;
  }
}

const MESSAGE_DELETE_AUDIT = AuditLogEvent?.MessageDelete ?? 72;
const MESSAGE_BULK_DELETE_AUDIT = AuditLogEvent?.MessageBulkDelete ?? 73;
const COUNTING_AUDIT_LOOKBACK_MS = 9000;

function sleep(ms) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    t.unref?.();
  });
}

function isCountingNumericContent(raw) {
  const content = String(raw || "").trim();
  if (!content || !COUNTING_ALLOWED_REGEX.test(content)) return false;
  try {
    const math = require("mathjs");
    const expression = content.replace(/\s+/g, "").replace(/x/g, "*").replace(/:/g, "/");
    const value = math.evaluate(expression);
    return Number.isFinite(Number(value));
  } catch {
    return false;
  }
}

async function resolveCountingTextChannel(guild) {
  if (!guild?.id) return null;
  const countdata = await getCountingConfig(guild.id);
  if (!countdata) return null;
  const mainGuildId = IDs.guilds?.main || null;
  const countingChannelId =
    countdata.Channel ||
    (String(guild.id) === String(mainGuildId) ? COUNTING_CHANNEL_ID : null);
  if (!countingChannelId) return null;
  const cached = guild.channels.cache.get(countingChannelId);
  if (cached?.isTextBased?.()) return cached;
  const fetched = await guild.channels.fetch(countingChannelId).catch(() => null);
  return fetched?.isTextBased?.() ? fetched : null;
}

async function resolveSingleMessageDeleteExecutor(guild, channelId, messageAuthorId) {
  const me = guild.members?.me;
  if (!me?.permissions?.has?.(PermissionFlagsBits.ViewAuditLog)) return null;
  const now = Date.now();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const logs = await guild
      .fetchAuditLogs({ type: MESSAGE_DELETE_AUDIT, limit: 18 })
      .catch(() => null);
    for (const entry of logs?.entries?.values?.() || []) {
      if (entry.action !== MESSAGE_DELETE_AUDIT) continue;
      const created = Number(entry.createdTimestamp || 0);
      if (!created || now - created > COUNTING_AUDIT_LOOKBACK_MS) continue;
      const chId = String(entry.extra?.channel?.id || "");
      if (chId !== String(channelId)) continue;
      if (String(entry.targetId || "") !== String(messageAuthorId)) continue;
      const ex = entry.executor;
      if (!ex || ex.bot) return null;
      return ex.id;
    }
    if (attempt < 2) await sleep(450);
  }
  return null;
}

async function resolveBulkMessageDeleteExecutor(guild, channelId, deletedCount) {
  const me = guild.members?.me;
  if (!me?.permissions?.has?.(PermissionFlagsBits.ViewAuditLog)) return null;
  const now = Date.now();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const logs = await guild
      .fetchAuditLogs({ type: MESSAGE_BULK_DELETE_AUDIT, limit: 12 })
      .catch(() => null);
    const candidates = [];
    for (const entry of logs?.entries?.values?.() || []) {
      if (entry.action !== MESSAGE_BULK_DELETE_AUDIT) continue;
      const created = Number(entry.createdTimestamp || 0);
      if (!created || now - created > COUNTING_AUDIT_LOOKBACK_MS) continue;
      const sameChannel =
        String(entry.extra?.channel?.id || "") === String(channelId) ||
        String(entry.target?.id || "") === String(channelId);
      if (!sameChannel) continue;
      const count = Number(entry.extra?.count || 0);
      const wanted = Number(deletedCount || 0);
      let score = 0;
      if (sameChannel) score += 4;
      if (count > 0 && count === wanted) score += 4;
      else if (count > 0 && wanted > 0 && Math.abs(count - wanted) <= 2) score += 2;
      candidates.push({ entry, score, created });
    }
    if (candidates.length) {
      candidates.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.created - a.created;
      });
      const best = candidates[0];
      if (best?.score >= 4) {
        const ex = best.entry?.executor;
        if (!ex || ex.bot) return null;
        return ex.id;
      }
    }
    if (attempt < 2) await sleep(650);
  }
  return null;
}

async function revokeCountingChannelSend(guild, channel, userId, client, reason) {
  if (!guild || !channel?.permissionOverwrites?.edit || !userId) return false;
  if (String(userId) === String(guild.ownerId || "")) return false;
  const me = guild.members?.me;
  if (!me?.permissions?.has?.(PermissionFlagsBits.ManageChannels)) {
    logEventError(
      client,
      "COUNTING WRITE-BAN",
      new Error("Bot needs ManageChannels to deny SendMessages in counting"),
    );
    return false;
  }
  const member =
    guild.members?.cache?.get(String(userId)) ||
    (await guild.members?.fetch(String(userId)).catch(() => null));
  if (!member) return false;
  try {
    await channel.permissionOverwrites.edit(userId, {
      SendMessages: false,
      SendMessagesInThreads: false,
      CreatePublicThreads: false,
      CreatePrivateThreads: false,
    }, { type: OverwriteType.Member, reason: String(reason || "Counting").slice(0, 450) });
    return true;
  } catch (err) {
    if (err?.code === 10009 || err?.code === 10013 || err?.code === 10026) return false;
    logEventError(client, "COUNTING WRITE-BAN", err);
    return false;
  }
}

async function maybePunishCountingOnDelete(message, client) {
  try {
    const guild = message?.guild;
    if (!guild || message.author?.bot) return;
    const channelId = String(message.channelId || message.channel?.id || "");
    if (!channelId) return;
    const countChannel = await resolveCountingTextChannel(guild);
    if (!countChannel || countChannel.id !== channelId) return;
    const content = String(message.content || "");
    if (!isCountingNumericContent(content)) return;
    const authorId = message.author?.id;
    if (!authorId) return;
    const executorId = await resolveSingleMessageDeleteExecutor(
      guild,
      channelId,
      authorId,
    );
    const targetUserId = executorId || authorId;
    await revokeCountingChannelSend(
      guild,
      countChannel,
      targetUserId,
      client,
      "Counting: eliminazione messaggio numerico",
    );
  } catch (err) {
    logEventError(client, "COUNTING DELETE SANCTION", err);
  }
}

async function maybePunishCountingOnEdit(previous, updated, client) {
  try {
    if (!updated?.guild || updated.author?.bot) return;
    const countChannel = await resolveCountingTextChannel(updated.guild);
    if (!countChannel || countChannel.id !== updated.channelId) return;
    const before = String(previous?.content || "");
    const after = String(updated?.content || "");
    if (before === after) return;
    if (!isCountingNumericContent(before)) return;
    await revokeCountingChannelSend(
      updated.guild,
      countChannel,
      updated.author.id,
      client,
      "Counting: modifica messaggio numerico",
    );
  } catch (err) {
    logEventError(client, "COUNTING EDIT SANCTION", err);
  }
}

async function maybePunishCountingOnBulkDelete(messages, client) {
  try {
    if (!messages?.size) return;
    const sample = messages.first();
    const guild = sample?.guild;
    if (!guild) return;
    const channelId = String(sample.channelId || sample.channel?.id || "");
    const countChannel = await resolveCountingTextChannel(guild);
    if (!countChannel || countChannel.id !== channelId) return;
    let anyCounting = false;
    for (const m of messages.values()) {
      if (m?.author?.bot) continue;
      if (isCountingNumericContent(m?.content)) {
        anyCounting = true;
        break;
      }
    }
    if (!anyCounting) return;
    const executorId = await resolveBulkMessageDeleteExecutor(
      guild,
      channelId,
      messages.size,
    );
    if (!executorId) return;
    await revokeCountingChannelSend(
      guild,
      countChannel,
      executorId,
      client,
      "Counting: eliminazione massiva messaggi nel canale",
    );
  } catch (err) {
    logEventError(client, "COUNTING BULK SANCTION", err);
  }
}

async function handleCounting(message, client) {
  const guildId =
    message?.guild?.id || message?.channel?.guild?.id || message?.guildId;
  if (!guildId) return;

  const countdata = await getCountingConfig(guildId);
  if (!countdata) return;
  const member = message.member;
  if (!member) return;
  const mainGuildId = IDs.guilds?.main || null;
  const countingChannelId = countdata.Channel || (String(guildId) === String(mainGuildId) ? COUNTING_CHANNEL_ID : null);
  if (!countingChannelId) return;
  const guild = message.guild || message.channel?.guild;
  if (!guild?.channels?.cache) return;
  const countchannel = guild.channels.cache.get(countingChannelId);
  if (!countchannel) {
    logEventError(
      client,
      "COUNTING",
      `Counting channel not found for guild: ${guildId}`,
    );
    return;
  }
  const messageChannelId = message?.channel?.id;
  if (!messageChannelId) return;
  if (messageChannelId !== countchannel.id) return;
  try {
    const sendPerms = countchannel.permissionsFor?.(member);
    if (sendPerms && !sendPerms.has(PermissionFlagsBits.SendMessages)) return;
  } catch {
    /* ignore */
  }
  if (!COUNTING_ALLOWED_REGEX.test(message.content)) {
    return message.delete().catch(() => { });
  }
  let messageValue;
  try {
    const math = require("mathjs");
    const expression = message.content.replace(/\s+/g, "").replace(/x/g, "*").replace(/:/g, "/");
    messageValue = math.evaluate(expression);
  } catch {
    return message.delete().catch(() => { });
  }
  const reaction = "<:success:1461731530333229226>";
  if (message.author.id === countdata.LastUser) {
    await sendCountingFailureReply(
      message,
      new EmbedBuilder()
        .setDescription(
          `<:cancel:1461730653677551691> Non puoi contare da solo! Counting perso a: **${countdata.Count}**! Riparti scrivendo **1**.`,
        )
        .setColor("#6f4e37"),
      client,
    );
    countdata.Count = 0;
    countdata.LastUser = " ";
    message
      .react("<:cancel:1461730653677551691>")
      .catch((err) => logEventError(client, "COUNTING", err));
  } else if (
    messageValue - 1 !== countdata.Count ||
    messageValue === countdata.Count ||
    messageValue > countdata.Count + 1
  ) {
    await sendCountingFailureReply(
      message,
      new EmbedBuilder()
        .setDescription(
          `<:cancel:1461730653677551691> Hai sbagliato numero! Counting perso a: **${countdata.Count}**! Riparti scrivendo **1**.`,
        )
        .setColor("#6f4e37"),
      client,
    );
    countdata.Count = 0;
    message
      .react("<:cancel:1461730653677551691>")
      .catch((err) => logEventError(client, "COUNTING", err));
  } else {
    countdata.Count += 1;
    countdata.LastUser = message.author.id;
    message
      .react(reaction)
      .catch((err) => logEventError(client, "COUNTING", err));
  }
  await countdata.save();
  invalidateCountingConfig(guildId);
}

const COUNTING_CATCHUP_LOOKBACK_MS = 10 * 60 * 1000; // 10 min

function messageHasBotCountingReaction(message) {
  return message.reactions.cache.some((r) => r.me === true);
}

async function processPendingCountingMessages(client) {
  if (!client?.user?.id) return;
  const mainGuildId = IDs.guilds?.main || null;
  for (const guild of client.guilds.cache.values()) {
    const countdata = await getCountingConfig(guild.id);
    if (!countdata) continue;
    const channelId = countdata.Channel || (guild.id === mainGuildId ? COUNTING_CHANNEL_ID : null);
    if (!channelId) continue;
    const channel = guild.channels.cache.get(channelId) || client.channels.cache.get(channelId);
    if (!channel?.messages?.fetch) continue;
    let messages;
    try {
      messages = await channel.messages.fetch({ limit: 50 });
    } catch {
      continue;
    }
    const pending = messages
      .filter(
        (m) =>
          !m.author.bot &&
          COUNTING_ALLOWED_REGEX.test(m.content) &&
          !messageHasBotCountingReaction(m),
      )
      .sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    const cutoff = Date.now() - COUNTING_CATCHUP_LOOKBACK_MS;
    const recent = pending.filter((m) => m.createdTimestamp >= cutoff);
    for (const message of recent) {
      try {
        await handleCounting(message, client);
      } catch (err) {
        global.logger?.warn?.("[READY] counting catch-up item failed:", err?.message || err);
      }
    }
  }
}

module.exports = {
  handleAfk,
  handleCounting,
  handleMentionAutoReactions,
  handleWordReactions,
  logEventError,
  processPendingCountingMessages,
  setWelcomeContextActive,
  maybePunishCountingOnDelete,
  maybePunishCountingOnEdit,
  maybePunishCountingOnBulkDelete,
};