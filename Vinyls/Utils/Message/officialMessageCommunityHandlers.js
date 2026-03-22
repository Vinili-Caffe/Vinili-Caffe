const path = require("path");
const mongoose = require("mongoose");
const { EmbedBuilder } = require("discord.js");
const { inspect } = require("node:util");
const { getCountingConfigFromBucket } = require("../Global/globalSettingsBucket");
const { getAfk, clearAfk, listMentionReactions } = require("../../Services/Community/profileStore");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const IDs = require("../Config/ids");
const { EPHEMERAL_TTL_NORMAL_MS, EPHEMERAL_TTL_LONG_MS, scheduleMessageDeletion } = require("../Config/ephemeralMessageTtl");
const COUNTING_CHANNEL_ID = IDs.channels.counting;
const COUNTING_ALLOWED_REGEX = /^[0-9+\-*/x:() ]+$/;
const WORD_REACTIONS_CONFIG_PATH = path.join(__dirname, "..", "Config", "wordReactions.json");
const WORD_REACTIONS_MAX_REACTIONS = 20;
const WORD_REACTIONS_TIMEZONE = "Europe/Rome";
const WELCOME_CONTEXT_DURATION_MS = 5 * 60 * 1000;
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
  if (needle.includes(" ")) {
    return (
      h.startsWith(needle) &&
      (h.length === needle.length || /^[\s\p{P}]/.test(h.slice(needle.length)))
    );
  }
  const firstToken = h.match(/^([^\s]+)/u);
  if (!firstToken) return false;
  const raw = firstToken[1];
  const first = raw.replace(/[\p{P}]+$/gu, "").toLowerCase();
  if (first === needle) return true;
  if (h.startsWith(needle) && (h.length === needle.length || /^[\s\p{P}]/.test(h[needle.length]))) return true;
  return false;
}

function isLoneWordMessage(normalized, word) {
  const w = String(word || "").trim().toLowerCase();
  if (!w) return false;
  let s = stripLeadingNoiseForGreeting(normalized);
  s = s.replace(/[\p{P}\s]+$/gu, "").trim();
  return s === w;
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
    const msg = await safeMessageReply(message, `<:VC_PepeWave:1331589315175907412> Bentornato <@${userId}>! Ho rimosso il tuo stato AFK.`,
    );
    if (msg) scheduleMessageDeletion(msg, EPHEMERAL_TTL_LONG_MS);
  }

  const mentions = message.mentions?.users;
  if (!mentions || mentions.size === 0) return;

  for (const [mentionedId, mentionedUser] of mentions) {
    if (mentionedUser.bot) continue;
    const targetAfk = await getAfk(guildId, mentionedId);
    if (!targetAfk) continue;

    const reason = targetAfk.reason ? `\n <:VC_reason:1478517122929004544> Motivo: ${targetAfk.reason}` : "";
    const msg = await safeMessageReply(message, `**${mentionedUser.username}** è AFK dal <t:${Math.floor(new Date(targetAfk.since || targetAfk.createdAt || Date.now()).getTime() / 1000,)}:R>.${reason}`,
    );
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
      const list = Array.isArray(doc?.reactions) ? doc.reactions : [];
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
    safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setDescription(
            `<:cancel:1461730653677551691> Non puoi contare da solo! Counting perso a: **${countdata.Count}**! Riparti scrivendo **1**.`,
          )
          .setColor("#6f4e37"),
      ],
    });
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
    safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setDescription(
            `<:cancel:1461730653677551691> Hai sbagliato numero! Counting perso a: **${countdata.Count}**! Riparti scrivendo **1**.`,
          )
          .setColor("#6f4e37"),
      ],
    });
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

module.exports = { handleAfk, handleCounting, handleMentionAutoReactions, handleWordReactions, logEventError, processPendingCountingMessages, setWelcomeContextActive };