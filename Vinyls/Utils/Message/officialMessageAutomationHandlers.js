const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require("discord.js");
const { recordDiscadiaBump, recordDiscadiaVote, recordBump, awardBumpVoteExp, getVoteCooldownMs, isVoteListingRecordedAtOrAfter } = require("../../Services/Bump/bumpService");
const { addExpWithLevel, shouldIgnoreExpForMember } = require("../../Services/Community/expService");
const { upsertVoteRole } = require("../../Services/Community/communityOpsService");
const { PAUSE_REQUEST_ROLE_IDS, parsePauseChannelMessageContent } = require("../Pause/pauseRequestRuntime");
const { submitPauseRequestForMember } = require("../Pause/pauseRequestSubmitRuntime");
const { maybeRepositionPauseSticky, isPauseStickyPanelMessage } = require("../Pause/pauseStickyPanelRuntime");
const {
  maybeRepositionModerationSticky,
  isModerationStickyPanelMessage,
  getSanzioniChannelId,
} = require("../Moderation/moderationStickyPanelRuntime");
const IDs = require("../Config/ids");
const { getGuildChannelCached, getGuildMemberCached } = require("../Interaction/interactionEntityCache");
const { EPHEMERAL_TTL_NORMAL_MS, scheduleMessageDeletion } = require("../Config/ephemeralMessageTtl");
const {
  normalizeMovieNightProposalForCompare,
  movieNightTitlesMatch,
  extractMovieNightProposalTitle,
} = require("../Community/movieNightProposal");
const {
  ensureWatchedMovieNightTitlesReady,
  isProposedMovieNightTitleAlreadyWatched,
} = require("../Community/movieNightWatchedTitles");
const { validateMovieNightProposalContent } = require("../Community/movieNightProposalRules");
const { getBotState } = require("../BotState/botStateStore");
const MOVIE_NIGHT_STATE_KEY = "movieNightAnnouncement.v1";
const { TENANT_EMBED_COLOR } = require("../../MultiGuild/utils/tenantEmbedBranding");
const VOTE_CHANNEL_ID = IDs.channels.supporters;
const COMMANDS_CHANNEL_ID = IDs.channels.commands;
const PAUSE_CHANNEL_ID = IDs.channels.pause;
const SANZIONI_CHANNEL_ID = getSanzioniChannelId();
const VOTE_ROLE_ID = IDs.roles.Voter;
const VOTE_URL = IDs.links.vote;
const DEFAULT_THREAD_VOTE_REACTION = "👍";
const DEFAULT_THREAD_VOTE_LOOKBACK_LIMIT = 100;
const MOVIE_NIGHT_THREAD_PARENT_ID = String(IDs.channels?.eventAnnouncements || "1481660281032675510");
const MOVIE_NIGHT_THREAD_NAME = "SERATA FILM";
const MOVIE_NIGHT_THREAD_REACTION = "<a:VC_Vote:1482535223001485473>";
const MOVIE_NIGHT_THREAD_DUPLICATE_LOOKBACK_MAX = 500;
const MEDIA_BLOCK_ROLE_IDS = [IDs.roles.PicPerms].filter(Boolean);
const processedBumpMessages = new Map();
const bumpDetectionLogAtByGuild = new Map();
const bumpSkipDebugLogAtByKey = new Map();
const BUMP_DETECTION_LOG_COOLDOWN_MS = 10 * 60 * 1000;
const BUMP_SKIP_DEBUG_LOG_TTL_MS = 30 * 60 * 1000;
const MEMBER_FETCH_CACHE_TTL_MS = 15_000;
const memberFetchCache = new Map();
const { resolveVoteRoleIdForGuild } = require("../Community/resolveVoteRoleId");
function hasMediaPermission(member) {
  return MEDIA_BLOCK_ROLE_IDS.some((roleId) =>
    member?.roles?.cache?.has(roleId),
  );
}

function channelAllowsMedia(message) {
  const channel = message?.channel;
  const member = message?.member;
  if (!channel || !member) return false;
  const perms = channel.permissionsFor(member);
  if (!perms) return false;
  const hasAttachment = Boolean(message.attachments?.size);
  const hasLink = /https?:\/\/\S+/i.test(String(message.content || "")) || /discord\.gg\/\S+|\.gg\/\S+/i.test(String(message.content || ""));
  if (hasAttachment) return perms.has("AttachFiles");
  if (hasLink) return perms.has("EmbedLinks");
  return perms.has("AttachFiles") || perms.has("EmbedLinks");
}

function normalizeUrlToken(raw) {
  return String(raw || "")
    .trim()
    .replace(/[.,;:!?)>\]]+$/g, "");
}

function extractHttpUrlsFromContent(content) {
  const text = String(content || "");
  const re = /https?:\/\/[^\s<>`]+/gi;
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push(normalizeUrlToken(m[0]));
  }
  return out;
}

function isSameGuildDiscordChannelOrJumpUrl(url, guildId) {
  if (!url || !guildId) return false;
  const base = String(url).split("?")[0].split("#")[0];
  const m = base.match(
    /^https?:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/channels\/(\d{17,22})\/(\d{17,22})(?:\/(\d{17,22}))?\/?$/i,
  );
  if (!m) return false;
  return String(m[1]) === String(guildId);
}

function isMediaMessage(message) {
  if (message.attachments?.size) return true;
  const content = String(message.content || "");
  if (/discord\.gg\/\S+|\.gg\/\S+/i.test(content)) return true;
  const guildId = message.guild?.id;
  const urls = extractHttpUrlsFromContent(content);
  if (!urls.length) return false;
  if (!guildId) return true;
  for (const url of urls) {
    if (!isSameGuildDiscordChannelOrJumpUrl(url, guildId)) return true;
  }
  return false;
}

function isDiscordInviteLinkMessage(message) {
  const content = String(message?.content || "");
  return /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/[a-z0-9-]{2,}/i.test(
    content,
  );
}

function normalizeThreadVoteText(raw) {
  return String(raw || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeNamedVoteThreadName(raw) {
  return String(raw || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function normalizeNamedThreadRule(rule, fallbackReactionEmoji) {
  if (!rule || typeof rule !== "object") return null;
  const parentChannelId = String(rule.parentChannelId || "").trim();
  const threadName = normalizeNamedVoteThreadName(rule.threadName || "");
  if (!/^\d{16,20}$/.test(parentChannelId) || !threadName) return null;
  const reactionEmoji =
    String(rule.reactionEmoji || fallbackReactionEmoji || DEFAULT_THREAD_VOTE_REACTION).trim()
    || DEFAULT_THREAD_VOTE_REACTION;
  return {
    parentChannelId,
    threadName,
    reactionEmoji,
    preventDuplicates: rule.preventDuplicates === true,
    lookbackLimit: Math.max(
      20,
      Math.min(200, Number(rule.duplicateLookbackLimit || DEFAULT_THREAD_VOTE_LOOKBACK_LIMIT)),
    ),
  };
}

function threadMatchesNamedVoteRule(thread, rule) {
  if (!thread?.isThread?.() || !rule) return false;
  if (String(thread.parentId || "") !== rule.parentChannelId) return false;
  const currentName = normalizeNamedVoteThreadName(thread.name || "");
  return currentName === rule.threadName || currentName.includes(rule.threadName);
}

async function ensureBotJoinedVoteThread(thread) {
  const me = String(thread?.guild?.members?.me?.id || thread?.client?.user?.id || "").trim();
  if (!me || !thread?.members?.add) return;
  await thread.members.add(me).catch(() => null);
}

function resolveThreadVoteRule(message, cfg) {
  if (!message?.channel?.isThread?.() || !cfg) return null;
  const threadId = String(message.channelId || "");
  if (cfg.threadIds.includes(threadId)) {
    return {
      reactionEmoji: cfg.reactionEmoji,
      preventDuplicates: cfg.preventDuplicates,
      lookbackLimit: cfg.lookbackLimit,
    };
  }
  for (const rule of cfg.namedThreads || []) {
    if (!threadMatchesNamedVoteRule(message.channel, rule)) continue;
    return {
      reactionEmoji: rule.reactionEmoji,
      preventDuplicates: rule.preventDuplicates,
      lookbackLimit: rule.lookbackLimit,
    };
  }
  return null;
}

function normalizeMovieNightThreadName(raw) {
  return String(raw || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function isMovieNightVoteThread(message) {
  if (!message?.channel?.isThread?.()) return false;
  const parentId = String(message.channel?.parentId || "");
  if (parentId !== MOVIE_NIGHT_THREAD_PARENT_ID) return false;
  const threadName = normalizeMovieNightThreadName(message.channel?.name || "");
  return threadName === MOVIE_NIGHT_THREAD_NAME || threadName.includes(MOVIE_NIGHT_THREAD_NAME);
}

function movieNightProposalTextsMatch(leftRaw, rightRaw) {
  /* threadDupEpisode1: confronta titoli estratti — "Kung Fu Panda 1" ≡ "Kung Fu Panda" */
  const leftExtracted = extractMovieNightProposalTitle(leftRaw) || String(leftRaw || "").trim();
  const rightExtracted = extractMovieNightProposalTitle(rightRaw) || String(rightRaw || "").trim();
  if (leftExtracted && rightExtracted && movieNightTitlesMatch(leftExtracted, rightExtracted)) return true;
  if (movieNightTitlesMatch(leftRaw, rightRaw)) return true;
  const leftTitle = normalizeMovieNightProposalForCompare(leftRaw);
  const rightTitle = normalizeMovieNightProposalForCompare(rightRaw);
  if (leftTitle && rightTitle && leftTitle === rightTitle) return true;
  if (leftTitle && rightTitle && movieNightTitlesMatch(leftTitle, rightTitle)) return true;
  const leftText = normalizeThreadVoteText(leftRaw);
  const rightText = normalizeThreadVoteText(rightRaw);
  return Boolean(leftText && rightText && leftText === rightText);
}

function messageHasMovieNightProposalContent(raw) {
  return Boolean(normalizeMovieNightProposalForCompare(raw) || normalizeThreadVoteText(raw));
}

async function fetchMovieNightThreadMessages(thread, max = MOVIE_NIGHT_THREAD_DUPLICATE_LOOKBACK_MAX) {
  if (!thread?.messages?.fetch) return [];
  const cap = Math.max(20, Math.min(500, Number(max) || MOVIE_NIGHT_THREAD_DUPLICATE_LOOKBACK_MAX));
  const collected = [];
  let before;
  while (collected.length < cap) {
    const limit = Math.min(100, cap - collected.length);
    const batch = await thread.messages.fetch({ limit, ...(before ? { before } : {}) }).catch(() => null);
    if (!batch?.size) break;
    const rows = [...batch.values()];
    collected.push(...rows);
    if (rows.length < limit) break;
    before = rows[rows.length - 1]?.id;
  }
  return collected;
}

async function findDuplicateMovieNightProposal(thread, message) {
  if (!thread || !message || !messageHasMovieNightProposalContent(message.content)) return null;
  const rows = await fetchMovieNightThreadMessages(thread);
  return (
    rows.find((msg) => {
      if (!msg || String(msg.id) === String(message.id)) return false;
      if (msg.author?.bot || msg.webhookId || msg.system) return false;
      return movieNightProposalTextsMatch(message.content, msg.content);
    }) || null
  );
}

async function rejectMovieNightProposal(message, reasonText) {
  await message.delete().catch((err) => {
    global.logger?.warn?.("[MOVIE NIGHT VOTE] reject delete failed:", err?.message || err);
  });
  const warning = await message.channel
    .send({ content: `${message.author} ${reasonText}` })
    .catch(() => null);
  if (warning) scheduleMessageDeletion(warning, EPHEMERAL_TTL_NORMAL_MS);
  return true;
}

async function movieNightStrictProposalRulesEnabled(message) {
  const state = await getBotState(MOVIE_NIGHT_STATE_KEY, null).catch(() => null);
  if (!state || state.strictProposalRules !== true) return false;
  const stateThreadId = String(state.threadId || "").trim();
  const channelId = String(message?.channel?.id || "").trim();
  if (stateThreadId && channelId && stateThreadId === channelId) return true;
  /* se lo state punta a un thread nuovo, non applicare strict su thread vecchi */
  return false;
}

async function handleMovieNightVoteMessage(message) {
  if (!message?.guild) return false;
  if (message.author?.bot || message.webhookId || message.system) return false;
  if (!isMovieNightVoteThread(message)) return false;

  if (!messageHasMovieNightProposalContent(message.content)) return false;

  await ensureWatchedMovieNightTitlesReady(message.client).catch(() => null);

  /* movieNightStrictProposal1: anno/durata solo se lo state del thread corrente ha strictProposalRules */
  if (await movieNightStrictProposalRulesEnabled(message)) {
    const validation = await validateMovieNightProposalContent(message.content, { enforceMeta: true }).catch(
      () => ({ ok: true }),
    );
    if (validation && validation.ok === false) {
      return rejectMovieNightProposal(message, validation.message || "proposta non valida.");
    }
  }

  const proposalTitle = extractMovieNightProposalTitle(message.content) || String(message.content || "").trim();
  if (proposalTitle && (await isProposedMovieNightTitleAlreadyWatched(proposalTitle))) {
    return rejectMovieNightProposal(message, "questo film è già stato visto in una serata precedente.");
  }

  const duplicate = await findDuplicateMovieNightProposal(message.channel, message);
  if (duplicate) {
    return rejectMovieNightProposal(message, "questo film è già stato suggerito nel thread.");
  }

  const reacted = await message.react(MOVIE_NIGHT_THREAD_REACTION).then(() => true).catch(() => false);
  if (!reacted && MOVIE_NIGHT_THREAD_REACTION !== DEFAULT_THREAD_VOTE_REACTION) {
    await message.react(DEFAULT_THREAD_VOTE_REACTION).catch(() => {});
  }
  return false;
}

function getThreadVoteConfig(client) {
  const cfg = client?.config?.threadVote;
  if (!cfg || typeof cfg !== "object") return null;
  const threadIds = Array.isArray(cfg.threadIds)
    ? cfg.threadIds.map((id) => String(id || "").trim()).filter((id) => /^\d{16,20}$/.test(id))
    : [];
  const fallbackReaction =
    String(cfg.reactionEmoji || DEFAULT_THREAD_VOTE_REACTION).trim() || DEFAULT_THREAD_VOTE_REACTION;
  const namedThreads = (Array.isArray(cfg.namedThreads) ? cfg.namedThreads : [])
    .map((rule) => normalizeNamedThreadRule(rule, fallbackReaction))
    .filter(Boolean);
  return {
    enabled: cfg.enabled !== false,
    preventDuplicates: cfg.preventDuplicates !== false,
    reactionEmoji: fallbackReaction,
    lookbackLimit: Math.max(
      20,
      Math.min(200, Number(cfg.duplicateLookbackLimit || DEFAULT_THREAD_VOTE_LOOKBACK_LIMIT)),
    ),
    threadIds,
    namedThreads,
  };
}

async function handleThreadVoteMessage(message, client) {
  if (!message?.guild) return false;
  if (message.author?.bot || message.webhookId || message.system) return false;
  if (!message.channel?.isThread?.()) return false;
  const cfg = getThreadVoteConfig(client);
  if (!cfg?.enabled) return false;
  const rule = resolveThreadVoteRule(message, cfg);
  if (!rule) return false;

  const normalizedCurrent = normalizeThreadVoteText(message.content);
  if (rule.preventDuplicates && normalizedCurrent) {
    const lookback = Math.max(20, Math.min(200, Number(rule.lookbackLimit || cfg.lookbackLimit)));
    const recent = await message.channel.messages
      .fetch({ limit: lookback })
      .catch(() => null);
    const duplicate = recent?.find((msg) => {
      if (!msg || String(msg.id) === String(message.id)) return false;
      if (msg.author?.bot || msg.webhookId || msg.system) return false;
      return normalizeThreadVoteText(msg.content) === normalizedCurrent;
    });
    if (duplicate) {
      await message.delete().catch(() => {});
      const warning = await message.channel
        .send({
          content: `${message.author} questa proposta è già presente nel thread. Evita duplicati.`,
        })
        .catch(() => null);
      if (warning) scheduleMessageDeletion(warning, EPHEMERAL_TTL_NORMAL_MS);
      return true;
    }
  }

  await ensureBotJoinedVoteThread(message.channel);
  const reacted = await message.react(rule.reactionEmoji).then(() => true).catch(() => false);
  if (!reacted && rule.reactionEmoji !== DEFAULT_THREAD_VOTE_REACTION) {
    await message.react(DEFAULT_THREAD_VOTE_REACTION).catch(() => {});
  }
  return false;
}

function getRandomExp() {
  const min = 100;
  const max = 250;
  const step = 5;
  const count = Math.floor((max - min) / step) + 1;
  return min + Math.floor(Math.random() * count) * step;
}

function extractUserIdFromText(text) {
  if (!text) return null;
  const match = text.match(/<@!?(\d+)>/);
  return match ? match[1] : null;
}

const BUMP_MESSAGE_DEDUPE_TTL_MS = 48 * 60 * 60 * 1000;

function claimBumpDedupeKey(key, ttlMs = BUMP_MESSAGE_DEDUPE_TTL_MS) {
  if (!key) return true;
  const now = Date.now();
  const last = processedBumpMessages.get(key) || 0;
  if (last && now - last < ttlMs) return false;
  processedBumpMessages.set(key, now);
  for (const [k, ts] of processedBumpMessages.entries()) {
    if (now - ts > ttlMs) processedBumpMessages.delete(k);
  }
  return true;
}

function releaseBumpDedupeKey(key) {
  if (!key) return;
  processedBumpMessages.delete(key);
}

function logBumpDetectionOnce(tag, guildId, details) {
  void tag;
  void guildId;
  void details;
}

function isBumpDetectDebugEnabled() {
  return false;
}

function logBumpSkipDebug(tag, message, reason, details = "") {
  if (!isBumpDetectDebugEnabled()) return;
  const gid = String(message?.guild?.id || "");
  const msgId = String(message?.id || "");
  const channelId = String(message?.channelId || "");
  if (!gid || !msgId) return;
  const key = `${tag}:${gid}:${msgId}:${reason}`;
  const now = Date.now();
  const prev = Number(bumpSkipDebugLogAtByKey.get(key) || 0);
  if (prev && now - prev < BUMP_SKIP_DEBUG_LOG_TTL_MS) return;
  bumpSkipDebugLogAtByKey.set(key, now);
  for (const [k, ts] of bumpSkipDebugLogAtByKey.entries()) {
    if (now - ts > BUMP_SKIP_DEBUG_LOG_TTL_MS) bumpSkipDebugLogAtByKey.delete(k);
  }
  const line = `${tag} [SKIP] guild=${gid} msg=${msgId} channel=${channelId} reason=${reason}${details ? ` ${details}` : ""}`;
  global.logger?.warn?.(line);
  try {
    console.log(line);
  } catch (_) { }
}

async function hasExistingBumpThanksReply(channel, bumpMessageId, botUserId) {
  if (!channel?.messages?.fetch || !bumpMessageId || !botUserId) return false;
  const bumpId = String(bumpMessageId);
  const thanksRe = /Grazie per aver [`']?bumpato[`']?|grazie per aver bumpato/i;
  if (channel.messages?.cache?.some?.(
    (m) => String(m.author?.id || "") === String(botUserId) && String(m.reference?.messageId || "") === bumpId,
  )) {
    return true;
  }
  const bumpMsg = channel.messages.cache.get(bumpId) || (await channel.messages.fetch(bumpId).catch(() => null));
  const bumpTs = Number(bumpMsg?.createdTimestamp || 0);
  const recent = await channel.messages.fetch({ limit: 100, ...(bumpMsg?.id ? { around: bumpMsg.id } : {}) }).catch(() => null);
  if (!recent) return false;
  for (const m of recent.values()) {
    if (String(m.author?.id || "") !== String(botUserId)) continue;
    if (String(m.reference?.messageId || "") === bumpId) return true;
    const ts = Number(m.createdTimestamp || 0);
    if (bumpTs && ts >= bumpTs && ts <= bumpTs + 10 * 60 * 1000 && thanksRe.test(String(m.content || ""))) return true;
  }
  return false;
}

async function getCachedOrFetchMember(guild, userId) {
  if (!guild || !userId) return null;
  const cachedMember = guild.members.cache.get(userId);
  if (cachedMember) return cachedMember;

  const cacheKey = `${String(guild.id)}:${String(userId)}`;
  const now = Date.now();
  const cached = memberFetchCache.get(cacheKey);
  if (cached?.member && now < Number(cached.expiresAt || 0)) {
    return cached.member;
  }
  if (cached?.promise) {
    return cached.promise;
  }

  const promise = getGuildMemberCached(guild, userId);
  memberFetchCache.set(cacheKey, { member: null, expiresAt: 0, promise });
  const member = await promise;
  memberFetchCache.set(cacheKey, {
    member,
    expiresAt: Date.now() + MEMBER_FETCH_CACHE_TTL_MS,
    promise: null,
  });
  return member;
}

function extractNameFromText(text) {
  if (!text) return null;
  const match = text.match(/(?:^|[\r\n])\s*!?\s*([^\s]+)\s+has voted/i) || text.match(/!?\s*([^\s]+)\s+has voted/i);
  return match?.[1] || null;
}

function sanitizeName(name) {
  if (!name) return null;
  return name.replace(/^[!@#:_*`~\\-\\.]+|[!@#:_*`~\\-\\.]+$/g, "");
}

function flattenEmbedText(embed) {
  if (!embed) return "";
  const parts = [];
  const push = (value) => { if (typeof value === "string" && value.trim()) parts.push(value); };
  push(embed.title);
  push(embed.description);
  push(embed.url);
  push(embed.author?.name);
  push(embed.footer?.text);
  if (Array.isArray(embed.fields)) {
    for (const field of embed.fields) {
      push(field?.name);
      push(field?.value);
    }
  }
  const data = embed.data || embed._data;
  if (data) {
    push(data.title);
    push(data.description);
    push(data.url);
    push(data.author?.name);
    push(data.footer?.text);
    if (Array.isArray(data.fields)) {
      for (const field of data.fields) {
        push(field?.name);
        push(field?.value);
      }
    }
  }
  return parts.join("\n");
}

function getMessageTextParts(message) {
  const embed0 = message.embeds?.[0];
  let embedText = "";
  if (Array.isArray(message.embeds) && message.embeds.length) {
    embedText = message.embeds.map((e) => flattenEmbedText(e)).filter(Boolean).join("\n");
  }
  return {
    content: message.content || "",
    embedText,
    embedTitle: embed0?.title || "",
    fieldsText: "",
  };
}

async function hydrateAutomationMessage(message) {
  if (!message?.channel?.messages?.fetch) return message;
  try {
    if (message.partial) {
      return (await message.fetch().catch(() => null)) || message;
    }
    const { content, embedText } = getMessageTextParts(message);
    const hasEmbedsArray = Array.isArray(message.embeds) && message.embeds.length > 0;
    if (!content && !embedText && !hasEmbedsArray) {
      const fresh = await message.channel.messages.fetch(message.id).catch(() => null);
      if (fresh) return fresh;
    }
    return message;
  } catch {
    return message;
  }
}

async function resolveUserFromMessage(message) {
  const mentioned = message.mentions?.users?.first();
  if (mentioned) return mentioned;

  const { content, embedText, embedTitle, fieldsText } = getMessageTextParts(message);
  const idFromContent = extractUserIdFromText(content) || extractUserIdFromText(embedText) || extractUserIdFromText(fieldsText);
  if (idFromContent) {
    return getGuildMemberCached(message.guild, idFromContent).then((m) => m?.user ?? null);
  }

  const nameRaw = extractNameFromText(content) || extractNameFromText(embedText) || extractNameFromText(embedTitle) || extractNameFromText(fieldsText);
  const nameClean = sanitizeName(nameRaw);
  if (nameClean) {
    const name = nameClean.toLowerCase();
    const cached = message.guild.members.cache.find((m) => m.user.username.toLowerCase() === name || m.displayName.toLowerCase() === name,);
    if (cached) return cached.user;
    const searched = await message.guild.members.fetch({ query: nameClean, limit: 5 }).catch(() => null);
    if (searched?.size) {
      const exact = searched.find((m) => m.user.username.toLowerCase() === name || m.displayName.toLowerCase() === name,);
      return (exact || searched.first()).user || null;
    }
  }

  return null;
}

function getDisboardAuthorIdSet(client) {
  const cfg = client?.config?.disboard || {};
  return new Set(
    [IDs.bots?.DISBOARD, cfg.botId, ...(Array.isArray(cfg.botIds) ? cfg.botIds : [])]
      .filter(Boolean)
      .map((id) => String(id)),
  );
}

function isMessageFromDisboardBot(message, client) {
  const authorId = String(message?.author?.id || "");
  if (!authorId) return false;
  if (getDisboardAuthorIdSet(client).has(authorId)) return true;
  const name = String(message.author?.username || message.author?.globalName || "").toLowerCase();
  return Boolean(message.author?.bot && /disboard/i.test(name));
}

function collectDisboardBumpHaystacks(message) {
  const haystacks = [];
  if (message.content) haystacks.push(message.content);
  if (Array.isArray(message.embeds)) {
    for (const embed of message.embeds) {
      const flat = flattenEmbedText(embed);
      if (flat) haystacks.push(flat);
    }
  }
  return haystacks;
}

function getVoteManagerBotIds(client) {
  const discadiaCfg = client?.config?.discadia || {};
  const extraDiscadiaIds = Array.isArray(discadiaCfg.botIds) ? discadiaCfg.botIds : [];
  return new Set(
    [
      IDs.bots?.DISBOARD,
      IDs.bots?.Discadia,
      IDs.bots?.VoteManager,
      IDs.roles?.Discadia,
      client?.config?.disboard?.botId,
      discadiaCfg?.botId,
      ...extraDiscadiaIds,
    ]
      .filter(Boolean)
      .map((id) => String(id)),
  );
}

async function handleVoteManagerMessage(message, client, options = {}) {
  if (!message.guild) return false;
  if (message.channel?.id !== VOTE_CHANNEL_ID) return false;
  const isAutomatedSource = Boolean(message.author?.bot || message.applicationId || message.webhookId,);
  if (!isAutomatedSource) return false;
  const allowedBotIds = getVoteManagerBotIds(client);
  const isVoteManagerAuthor = allowedBotIds.has(String(message.author?.id || ""));
  const isVoteManagerApp = allowedBotIds.has(String(message.applicationId || ""));
  const sourceName = String(`${message.author?.globalName || ""}${message.author?.username || ""}`,
  ).toLowerCase();
  const hasVoteLikeBotName = /(vote|discadia|disboard)/i.test(sourceName);
  const fromIncomingWebhook = Boolean(message.webhookId);
  if (!isVoteManagerAuthor && !isVoteManagerApp && !hasVoteLikeBotName && !fromIncomingWebhook) {
    return false;
  }

  message = await hydrateAutomationMessage(message);

  const { content, embedText, embedTitle, fieldsText } = getMessageTextParts(message);
  const voteText = `${content}${embedText}${embedTitle}${fieldsText}`.toLowerCase();
  const looksLikeVote =
    /has voted|voted for|just voted|cast (?:a )?vote|thank you for voting/i.test(voteText) ||
    /ha votato|votato|ha espresso (?:il )?voto/i.test(voteText) ||
    /gave?\s+(?:\d+\s+)?gems?|sent?\s+(?:\d+\s+)?gems?|boost(?:ed)?\s+with\s+gems?/i.test(voteText) ||
    /ha (?:dato|regalato|inviato)\s+(?:\d+\s+)?gemme?|gemme?\s+(?:inviate|donate|ricevute)/i.test(voteText) ||
    /grazie(?:\s+\w+){0,8}\s+(?:per\s+)?(?:aver\s+)?votat/i.test(voteText) ||
    /thank(?:s| you)?(?:\s+\w+){0,8}\s+for\s+(?:your\s+)?(?:vote|voting|gems?)/i.test(voteText) ||
    /(?:^|\n)\s*(?:💎|gem|gems|gemme)\b/i.test(voteText) ||
    (voteText.includes("discadia") && /(vote|voto|votato|voting|gem)/i.test(voteText)) ||
    (voteText.includes("disurl") && /(vote|voto|votato|voting|gem)/i.test(voteText));
  if (!looksLikeVote) return false;
  const looksLikeBumpSuccess = /(server has been bumped|has been successfully bumped|bump(?:ed)?\s*successfully|successfully bumped|bump complete|bump done|thanks for bumping|you can bump again|\bbumped\.?\s*(?:\+\s*)?(?:\d+\s*)?boosts?\s+earned|(?:\+\s*)?\d+\s*boosts?\s+earned)/i.test(voteText);
  if (looksLikeBumpSuccess) return false;

  let user = await resolveUserFromMessage(message);
  if (user?.bot) user = null;
  if (!user) return false;

  const voteListing = /top\.gg|\btopgg\b/i.test(voteText) ? "topgg" : "discadia";
  if (options?.skipIfAlreadyRecorded) {
    const voteAtMs = Number(options.voteAtMs ?? message.createdTimestamp);
    if (await isVoteListingRecordedAtOrAfter(message.guild.id, user.id, voteListing, voteAtMs)) {
      return false;
    }
  }
  const handled = await processDiscadiaVote(message.guild, user, client, { voteListing });
  if (handled) {
    if (!options?.keepSourceMessage) {
      await message.delete().catch(() => { });
    }
  }
  return handled;
}

function resolvePublicVoteHubUrl(client) {
  const fromTopgg = String(client?.config?.topgg?.votePageUrl || "").trim();
  const fromDiscadia = String(client?.config?.discadiaVoteReminder?.voteUrl || "").trim();
  const fromIds = String(IDs.links?.vote || "").trim();
  return fromTopgg || fromDiscadia || fromIds;
}

async function processDiscadiaVote(guild, user, client, options = {}) {
  if (!guild || !user || !client) return false;
  const voteListing = options?.voteListing === "topgg" ? "topgg" : "discadia";
  const voteCooldownMs = getVoteCooldownMs(client, voteListing);
  const userId = String(user?.id || "").trim();
    const userMention = /^\d{16,22}$/.test(userId) ? `<@${userId}>` : "Utente";

  let expValue = 0;
  let resolvedVoteCount = null;
  const voteRewardExtras = [];

  try {
    const result = await recordDiscadiaVote(client, guild.id, userId, { voteListing });
    if (result && typeof result.voteCount === "number") resolvedVoteCount = result.voteCount;
    const baseExpRandom = resolvedVoteCount === 1 ? 250 : getRandomExp();
    const reward = await awardBumpVoteExp(client, guild, userId, "discadia_vote", result?.previousLastVoteAt ?? null, voteCooldownMs, baseExpRandom);
    if (reward?.effectiveExp != null) {
      expValue = reward.effectiveExp;
    }
    if (reward?.fastBonus > 0) voteRewardExtras.push("<a:VC_Flame:1482725674711126140> Risposta rapida **+" + reward.fastBonus + " exp**");
    if (reward?.streakBonus > 0) voteRewardExtras.push("<a:VC_Flame:1482725674711126140> Streak " + reward.newStreak + " **+" + reward.streakBonus + " exp**");
  } catch (err) {
    global.logger?.warn?.("[officialMessageAutomation] record vote error: ", err?.message || err);
  }

  const { DIVIDER_URL: dividerUrl } = require("../../../shared/discord/constants");
  const { userAvatarUrlStatic } = require("../Discord/guildDiscordIdentity");
  const voteCooldownHours = Math.max(1, Math.round(voteCooldownMs / (60 * 60 * 1000)));
  const voteAgainHoursLabel = voteCooldownHours === 1 ? "1 ora" : `${voteCooldownHours} ore`;
  const voteLabel = typeof resolvedVoteCount === "number" ? `${resolvedVoteCount}°` : "";
  const votePlatformLabel = voteListing === "topgg" ? "Top.gg" : "Discadia";
  const resolvedVoteRoleId = await resolveVoteRoleIdForGuild(guild).catch(() => "");
  const voteRoleText = resolvedVoteRoleId
    ? `<a:VC_Money:1482724694699278487> <a:VC_Arrow:1482706699365257397> Il ruolo <@&${resolvedVoteRoleId}> per ${voteAgainHoursLabel}`
    : `<a:VC_Money:1482724694699278487> <a:VC_Arrow:1482706699365257397> Reward voto assegnata per ${voteAgainHoursLabel}`;
  const thankLine =
    voteListing === "topgg"
      ? `<a:VC_ThankYou:1330186319673950401> Grazie ${userMention} per aver votato su **Top.gg**!`
      : `<a:VC_ThankYou:1330186319673950401> Grazie ${userMention} per aver votato su **Discadia**!`;
  const descriptionLines = [
    thankLine,
    "",
    "`Hai guadagnato:`",
    `<:VC_EXP:1482534670896730143> <a:VC_Arrow:1482706699365257397> **${expValue} EXP** per il tuo ${voteLabel ? `**${voteLabel} voto** su **${votePlatformLabel}**` : `**voto** su **${votePlatformLabel}**`}`,
    ...(voteRewardExtras.length > 0 ? voteRewardExtras : []),
    voteRoleText,
    "",
    `<:VC_update:1478721333096349817> Vota di nuovo tra __${voteAgainHoursLabel}__ per ottenere **altri exp** dal **bottone sottostante**.`,
  ];
  const botFooterIcon =
    userAvatarUrlStatic(client?.user, { size: 64 }) ||
    (typeof client?.user?.displayAvatarURL === "function"
      ? client.user.displayAvatarURL({ size: 64, extension: "png", forceStatic: true })
      : null);
  const embed = new EmbedBuilder()
    .setColor(TENANT_EMBED_COLOR)
    .setTitle("<a:VC_Vote:1482535223001485473> **Un nuovo voto!**")
    .setDescription(descriptionLines.join("\n"))
    .setFooter({
      text: "Ogni volta che voterai il valore dell'exp guadagnata varierà",
      iconURL: botFooterIcon || undefined,
    })
    .setImage(dividerUrl);

  const components = [];
  const linkVoteUrl = resolvePublicVoteHubUrl(client) || VOTE_URL;
  if (linkVoteUrl) {
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setEmoji("<a:VC_HeartPink:1448673486603292685>")
          .setLabel("Vota cliccando qui")
          .setURL(linkVoteUrl),
      ),
    );
  }

  const channel = client.channels.cache.get(VOTE_CHANNEL_ID) || await client.channels.fetch(VOTE_CHANNEL_ID).catch(() => null);
  if (channel?.isTextBased?.()) {
    await channel.send({ content: userMention, embeds: [embed], components, }).catch(() => { });
  }

  void (async () => {
    try {
      const expiresAt = new Date(Date.now() + voteCooldownMs);
      await upsertVoteRole(guild.id, userId, expiresAt);
      const member = await getCachedOrFetchMember(guild, userId);
      const roleIdToGrant = resolvedVoteRoleId || VOTE_ROLE_ID;
      if (member && roleIdToGrant && !member.roles.cache.has(roleIdToGrant)) {
        await member.roles.add(roleIdToGrant).catch(() => { });
      }
    } catch (err) {
      global.logger?.warn?.("[officialMessageAutomation] role/event error: ", err?.message || err);
    }
  })();

  return true;
}

async function handleDisboardBump(message, client) {
  const disboard = client?.config?.disboard;
  if (!disboard || !message.guild) return false;
  if (!message.author) return false;
  if (String(message.author.id) === String(client.user?.id)) return false;

  const configuredPatterns = Array.isArray(disboard.bumpSuccessPatterns)
    ? disboard.bumpSuccessPatterns.map((p) => String(p).toLowerCase())
    : [];
  const defaultPatterns = [
    "bump done",
    "bump successful",
    "has been bumped",
    "successfully bumped",
    "you can bump again",
    "bump will be available again",
    "was bumped",
    "server bumped",
  ];
  const patterns = Array.from(new Set([...configuredPatterns, ...defaultPatterns]));
  const haystacks = collectDisboardBumpHaystacks(message);
  const rawHaystackJoin = haystacks.map((text) => String(text || "")).join("\n");
  const lowered = haystacks.map((text) => String(text || "").toLowerCase());
  const hasPatternMatch = patterns.some((pattern) => lowered.some((text) => text.includes(pattern)));
  const joined = lowered.join("\n");
  const authorName = String(message.author?.globalName || message.author?.username || "");
  const sourceName = String(
    [
      message.author?.globalName || "",
      message.author?.username || "",
      message.author?.tag || "",
      message.author?.id || "",
      message.applicationId || "",
    ]
      .filter(Boolean)
      .join(" "),
  );
  const sourceFingerprint = `${authorName} ${sourceName}`.toLowerCase();
  const hasDisboardWord = /\bdisboard\b/i.test(joined);
  const hasDisboardDomain = /disboard\.org/i.test(joined);
  const hasDiscadiaWord = /\bdiscadia\b/i.test(joined) || /discadia\.com/i.test(joined);
  const isAutomatedSource = Boolean(
    message.author?.bot || message.applicationId || message.webhookId,
  );
  const interactionCommandName = String(
    message.interaction?.commandName || message.interactionMetadata?.name || "",
  )
    .trim()
    .toLowerCase();
  const isBumpInteraction = interactionCommandName === "bump";
  const isLikelyCommandChannel =
    String(message.channelId || "") === String(IDs.channels.commands || "");
  const isFromDisboardBot = isMessageFromDisboardBot(message, client);
  const hasRegexSuccess =
    /(bump(?:ed)?\s*(?:done|successful|successfully)|has been bumped|\bwas bumped\b|server bumped|you can bump again|bump will be available again)/i.test(joined);
  const hasBumpWord = /\bbump(?:ed)?\b/i.test(joined);
  const hasBumpSuccessText = hasPatternMatch || hasRegexSuccess || (hasBumpWord && isFromDisboardBot);
  const hasHardDisboardBumpFailure =
    /already bumped|cannot bump|can\s*'t bump|can't bump|failed to bump|bump failed|must be (?:\*\*)?(?:owner|admin)|permission to bump|don't have permission|do not have permission|missing permission|you must be|unable to bump|not allowed to bump|manage server.*bump|bump.*manage server/i.test(joined);
  const hasCooldownLikeText = /please wait|too early|wait before/i.test(joined);
  const hasDisboardBumpFailure =
    hasHardDisboardBumpFailure ||
    (hasCooldownLikeText && !hasBumpSuccessText);
  const isStrictDisboardSource = isFromDisboardBot;
  const isDisboardByContentFallback =
    isAutomatedSource &&
    hasBumpSuccessText &&
    !hasDiscadiaWord &&
    (hasDisboardWord ||
      hasDisboardDomain ||
      /\bdisboard\b/i.test(sourceFingerprint));
  const isDisboardByBotFallback =
    isFromDisboardBot &&
    !hasDisboardBumpFailure &&
    (hasBumpSuccessText || hasBumpWord || isBumpInteraction || isLikelyCommandChannel);
  const isBump =
    !hasDisboardBumpFailure &&
    ((hasBumpSuccessText && (isStrictDisboardSource || isDisboardByContentFallback)) ||
      isDisboardByBotFallback);
  if (!isBump) {
    const reason = hasDisboardBumpFailure
      ? "disboard_failure_text"
      : (!hasBumpSuccessText ? "missing_success_text" : "source_not_recognized");
    logBumpSkipDebug(
      "[DISBOARD BUMP DETECT]",
      message,
      reason,
      `flags={success:${hasBumpSuccessText},failure:${hasDisboardBumpFailure},strict:${isStrictDisboardSource},contentFallback:${isDisboardByContentFallback},botFallback:${isDisboardByBotFallback},automated:${isAutomatedSource},discadiaWord:${hasDiscadiaWord}}`,
    );
    return false;
  }
  const dedupeKey = `disboard:${message.guild.id}:${message.id}`;
  if (!claimBumpDedupeKey(dedupeKey)) {
    logBumpSkipDebug("[DISBOARD BUMP DETECT]", message, "duplicate_message_dedupe");
    return true;
  }
  const channel = message.channel || (await getGuildChannelCached(message.guild, message.channelId));
  if (channel?.isTextBased?.() && (await hasExistingBumpThanksReply(channel, message.id, client.user?.id))) {
    logBumpSkipDebug("[DISBOARD BUMP DETECT]", message, "already_thanked");
    return true;
  }
  let bumpUserId =
    message.interaction?.user?.id ||
    message.interactionMetadata?.user?.id ||
    null;
  if (!bumpUserId) {
    const resolvedUser = await resolveUserFromMessage(message);
    if (resolvedUser && !resolvedUser.bot) bumpUserId = resolvedUser.id;
  }
  if (!bumpUserId) {
    bumpUserId = extractUserIdFromText(message.content) || extractUserIdFromText(rawHaystackJoin) || null;
    if (!bumpUserId) {
      logBumpSkipDebug("[DISBOARD BUMP DETECT]", message, "user_not_resolved", "fallback=record_with_null_user");
    }
  }
  const detectionSource =
    isStrictDisboardSource ? "strict" : "fallback";
  logBumpDetectionOnce(
    "[DISBOARD BUMP DETECT]",
    message.guild.id,
    `source=${detectionSource} msg=${message.id} channel=${message.channelId}`,
  );
  const bumpMention = bumpUserId ? `<@${bumpUserId}>` : "";
  const disboardCooldownMs = (client?.config?.disboard?.cooldownMinutes ?? 120) * 60 * 1000;
  let recordResult;
  try {
    const bumpAtFromMessage = (() => {
      const ts = Number(message.createdTimestamp);
      return Number.isFinite(ts) && ts > 0 ? new Date(ts) : new Date();
    })();
    recordResult = await recordBump(client, message.guild.id, bumpUserId, { bumpAt: bumpAtFromMessage });
  } catch (err) {
    releaseBumpDedupeKey(dedupeKey);
    throw err;
  }
  let thanksMessage = "<a:VC_ThankYou:1330186319673950401> **__Grazie per aver `bumpato` il server!__**\n" +
    "<:VC_HelloKittyGun:1329447880150220883> Ci __vediamo__ nuovamente tra **due ore!**\n" +
    bumpMention;
  if (bumpUserId && recordResult?.previousLastBumpAt !== undefined) {
    const reward = await awardBumpVoteExp(client, message.guild, bumpUserId, "disboard", recordResult.previousLastBumpAt, disboardCooldownMs, undefined, recordResult?.previousReminderSentAt || null, recordResult?.previousLastBumpUserId || null).catch(() => null);
    if (reward?.effectiveExp != null) {
      const parts = ["<a:VC_ThankYou:1330186319673950401> **__Grazie per aver `bumpato` il server!__**", "<:VC_EXP:1482534670896730143> **" + reward.effectiveExp + " exp** guadagnati!"];
      if (reward.fastBonus > 0) parts.push("<a:VC_Flame:1482725674711126140> Risposta rapida +" + reward.fastBonus + " exp");
      if (reward.streakBonus > 0) parts.push("<a:VC_Flame:1482725674711126140> Streak " + reward.newStreak + " +" + reward.streakBonus + " exp");
      parts.push("<:VC_HelloKittyGun:1329447880150220883> Ci __vediamo__ nuovamente tra **due ore!**\n" + bumpMention);
      thanksMessage = parts.join("\n");
    }
  }
  if (channel?.isTextBased?.()) {
    try {
      await channel.send({
        content: thanksMessage.trim(),
        reply: { messageReference: message.id, failIfNotExists: false },
      });
    } catch {
      await channel.send({ content: thanksMessage.trim() }).catch(() => { });
    }
  }
  return true;
}

async function handleDiscadiaBump(message, client) {
  const discadia = client?.config?.discadia;
  if (!discadia || !message.guild) return false;
  if (isMessageFromDisboardBot(message, client)) return false;
  if (String(message.author?.id) === String(client.user?.id)) return false;
  const discadiaBotIds = new Set(
    [
      IDs.bots?.Discadia,
      IDs.roles?.Discadia,
      discadia?.botId,
      ...(Array.isArray(discadia?.botIds) ? discadia.botIds : []),
    ]
      .filter(Boolean)
      .map((id) => String(id)),
  );
  const authorName = String(message.author?.globalName || message.author?.username || "",);
  const sourceName = String([message.author?.globalName || "", message.author?.username || "", message.author?.tag || "", message.author?.id || "", message.applicationId || "",].filter(Boolean).join(" "),);
  const isAutomatedSource = Boolean(message.author?.bot || message.applicationId || message.webhookId,);
  const patterns = Array.isArray(discadia.bumpSuccessPatterns) ? discadia.bumpSuccessPatterns.map((p) => String(p).toLowerCase()) : ["has been successfully bumped", "successfully bumped", "bumped successfully", "boost earned", "+1 boost earned",];
  const haystacks = [];
  if (message.content) haystacks.push(message.content);
  if (Array.isArray(message.embeds)) {
    for (const embed of message.embeds) {
      if (embed?.description) haystacks.push(embed.description);
      if (embed?.title) haystacks.push(embed.title);
      if (embed?.footer?.text) haystacks.push(embed.footer.text);
      if (embed?.author?.name) haystacks.push(embed.author.name);
      if (Array.isArray(embed?.fields)) {
        for (const field of embed.fields) {
          if (field?.name) haystacks.push(field.name);
          if (field?.value) haystacks.push(field.value);
        }
      }
    }
  }
  const normalized = haystacks.map((text) => String(text).toLowerCase()).map((text) => text.replace(/\s+/g, " ").trim());
  const joined = normalized.join("\n");
  if (/already bumped recently/i.test(joined)) {
    logBumpSkipDebug("[DISCADIA BUMP DETECT]", message, "already_bumped_recently_text");
    return false;
  }
  const hasPatternLegacy = patterns.some((pattern) => joined.includes(pattern) && !/boost\s+earned/i.test(pattern));
  const hasBoostEarnedPattern = patterns.some((pattern) => /boost\s+earned/i.test(pattern) && joined.includes(pattern));
  /* discadiaBumpFmt2026: "**Server** bumped. +1 Boost earned." (+ optional streak / Next bump) */
  const hasNewDiscadiaBumpFmt =
    (/\bbumped\b/i.test(joined) && /(?:\+\s*)?(?:\d+\s*)?boosts?\s+earned/i.test(joined)) ||
    (hasBoostEarnedPattern && /\bbumped\b/i.test(joined));
  const hasPattern = hasPatternLegacy || hasNewDiscadiaBumpFmt;
  const hasSuccessWord =
    hasNewDiscadiaBumpFmt ||
    /(server has been bumped|has been successfully bumped|bump(?:ed)?successfully|successfully bumped|successful bump|bump complete|bump done|thanks for bumping|you can bump again|bump effettuato|bump eseguito|bump completato|bump andato a buon fine|server bumpato con successo|bump riuscito|puoi bumpare di nuovo|potrai bumpare di nuovo)/i.test(
      joined,
    );
  const hasBumpWord = /\bbump(?:ed)?\b/i.test(joined);
  const hasFailureWord = /already bumped|already has been bumped|cannot bump|can\s*'t bump|can't bump|please wait|too early|wait before|failed to bump|bump failed|errore bump|impossibile bumpare|devi aspettare|attendi prima di bumpare|troppo presto per bumpare|bump non riuscito|bump fallito|must be (?:\*\*)?(?:owner|admin)|manage server|permission to bump|don't have permission|do not have permission|missing permission|you must be|unable to bump|not allowed to bump|unauthorized|can't use this command|cannot use this command|non hai i permessi|permesso negato/i.test(joined);
  const hasDiscadiaWord = /\bdiscadia\b/i.test(joined);
  const hasDiscadiaDomain = /discadia\.com/i.test(joined);
  const interactionCommandName = String(message.interaction?.commandName || message.interactionMetadata?.name || "",).trim().toLowerCase();
  const isBumpInteraction = interactionCommandName === "bump";
  const isLikelyCommandChannel = String(message.channelId || "") === String(IDs.channels.commands || "");
  const authorId = String(message.author?.id || "");
  const isFromDiscadiaBot = Boolean(authorId && discadiaBotIds.has(authorId));
  const sourceFingerprint = `${authorName} ${sourceName}`.toLowerCase();
  const looksLikeDiscadiaSource = isFromDiscadiaBot || /\bdiscadia\b/i.test(sourceFingerprint) || hasDiscadiaWord || hasDiscadiaDomain;
  const looksLikeDisboardSource = /\bdisboard\b/i.test(sourceFingerprint);
  const hasBumpSuccessText = hasPattern || hasSuccessWord;
  const isLikelyDiscadiaViaAutomation = isAutomatedSource && !looksLikeDisboardSource && (looksLikeDiscadiaSource || (isLikelyCommandChannel && hasBumpSuccessText && hasBumpWord));
  const isLikelyDiscadiaGenericSuccess = isAutomatedSource && !looksLikeDisboardSource && hasBumpSuccessText && (hasBumpWord || isBumpInteraction) && (Boolean(message.webhookId) || isBumpInteraction);
  const isStrictDiscadiaSource = isFromDiscadiaBot || isLikelyDiscadiaViaAutomation || isLikelyDiscadiaGenericSuccess;
      const isDiscadiaByContentFallback = !looksLikeDisboardSource && hasBumpSuccessText && (hasDiscadiaWord || hasDiscadiaDomain || /\bdiscadia\b/i.test(sourceFingerprint));
  const isBump = !hasFailureWord && hasBumpSuccessText && (isStrictDiscadiaSource || isDiscadiaByContentFallback);
  if (!isBump) {
    const reason = hasFailureWord
      ? "discadia_failure_text"
      : (!hasBumpSuccessText ? "missing_success_text" : "source_not_recognized");
    logBumpSkipDebug(
      "[DISCADIA BUMP DETECT]",
      message,
      reason,
      `flags={success:${hasBumpSuccessText},failure:${hasFailureWord},strict:${isStrictDiscadiaSource},contentFallback:${isDiscadiaByContentFallback},automated:${isAutomatedSource},looksDisboard:${looksLikeDisboardSource}}`,
    );
    return false;
  }

  const dedupeKey = `discadia:${message.guild.id}:${message.id}`;
  if (!claimBumpDedupeKey(dedupeKey)) {
    logBumpSkipDebug("[DISCADIA BUMP DETECT]", message, "duplicate_message_dedupe");
    return true;
  }
  const channel = message.channel || (message.channelId ? await getGuildChannelCached(message.guild, message.channelId) : null);
  if (channel?.isTextBased?.() && (await hasExistingBumpThanksReply(channel, message.id, client.user?.id))) {
    logBumpSkipDebug("[DISCADIA BUMP DETECT]", message, "already_thanked");
    return true;
  }
  let bumpUserId = message.interaction?.user?.id || message.interactionMetadata?.user?.id || extractUserIdFromText(message.content) || extractUserIdFromText(joined) || null;
  if (!bumpUserId) {
    const resolvedUser = await resolveUserFromMessage(message);
    if (resolvedUser && !resolvedUser.bot) bumpUserId = resolvedUser.id;
    if (!bumpUserId) {
      logBumpSkipDebug("[DISCADIA BUMP DETECT]", message, "user_not_resolved", "fallback=record_with_null_user");
    }
  }
  const bumpMention = bumpUserId ? `<@${bumpUserId}>` : "";
  try {
    const discadiaBumpAt = (() => {
      const ts = Number(message.createdTimestamp);
      return Number.isFinite(ts) && ts > 0 ? new Date(ts) : new Date();
    })();
    await recordDiscadiaBump(client, message.guild.id, bumpUserId, { bumpAt: discadiaBumpAt });
  } catch (err) {
    releaseBumpDedupeKey(dedupeKey);
    throw err;
  }
  let thanksMessage = "<a:VC_ThankYou:1330186319673950401> **__Grazie per aver `bumpato` il server!__**\n" +
    "<:VC_HelloKittyGun:1329447880150220883> Ci __vediamo__ nuovamente tra **24 ore!**\n" +
    bumpMention;
  if (channel?.isTextBased?.()) {
    try {
      await channel.send({
        content: thanksMessage.trim(),
        reply: { messageReference: message.id, failIfNotExists: false },
      });
    } catch {
      await channel.send({ content: thanksMessage.trim() }).catch(() => { });
    }
  }
  return true;
}

async function handleSanzioniChannelMessage(message) {
  if (!message?.guild) return false;

  const sanzioniChannelId = String(SANZIONI_CHANNEL_ID || "");
  const isSanzioniChannel = Boolean(sanzioniChannelId && String(message.channelId) === sanzioniChannelId);
  if (!isSanzioniChannel) return false;

  const content = String(message.content || "");
  const isAutomodTransient =
    content.includes("AutoMod Discord ha bloccato") ||
    content.includes("AutoMod ha bloccato") ||
    content.includes("Messaggio bloccato da AutoMod");

  if (message.author?.bot || message.webhookId || message.system) {
    if (!isModerationStickyPanelMessage(message)) {
      if (isAutomodTransient) return false;
      void maybeRepositionModerationSticky(message.channel, message.client).catch(() => null);
    }
    return false;
  }

  void maybeRepositionModerationSticky(message.channel, message.client).catch(() => null);
  return false;
}

async function handlePauseChannelMessage(message) {
  if (!message?.guild) return false;

  const pauseChannelId = String(IDs.channels.pause || "");
  const isPauseChannel = Boolean(pauseChannelId && String(message.channelId) === pauseChannelId);
  if (!isPauseChannel) return false;

        if (message.author?.bot || message.webhookId || message.system) {
    if (!isPauseStickyPanelMessage(message)) {
      void maybeRepositionPauseSticky(message.channel, message.client).catch(() => null);
    }
    return false;
  }

  const finish = () => {
    void maybeRepositionPauseSticky(message.channel, message.client).catch(() => null);
  };

  try {
    const {
      isDiscordWorkflowUiEnabled,
      siteWorkflowUrl,
    } = require("../Web/discordWorkflowUiGate");
    if (!isDiscordWorkflowUiEnabled()) {
      const warning = await message.channel
        .send({
          content: `${message.author} le richieste pausa si inviano **solo sul sito**:\n${siteWorkflowUrl("pause")}`,
        })
        .catch(() => null);
      await message.delete().catch(() => {});
      if (warning) scheduleMessageDeletion(warning, EPHEMERAL_TTL_NORMAL_MS);
      finish();
      return true;
    }
  } catch (_) {}

  if (!message.member && message.guild?.id && message.author?.id) {
    message.member = await getGuildMemberCached(message.guild, message.author.id);
  }
  const allowedRoleIds = new Set(PAUSE_REQUEST_ROLE_IDS.map(String));
  const hasAllowedRole = Array.from(allowedRoleIds).some((roleId) => message.member?.roles?.cache?.has(roleId));
  if (!hasAllowedRole) {
    finish();
    return false;
  }

  const raw = String(message.content || "").trim();
  if (!raw) {
    finish();
    return false;
  }
  const parsed = parsePauseChannelMessageContent(raw);
  if (!parsed) {
    const warning = await message.channel.send({ content: `${message.author} formato non valido. Usa il pulsante **Richiedi pausa** qui sotto oppure invia: data inizio, data fine e motivo (es. \`20/05 - 22/05 - viaggio\`).` }).catch(() => null);
    await message.delete().catch(() => { });
    if (warning) scheduleMessageDeletion(warning, EPHEMERAL_TTL_NORMAL_MS);
    finish();
    return true;
  }

  const result = await submitPauseRequestForMember({
    guild: message.guild,
    member: message.member,
    rawStart: parsed.rawStart,
    rawEnd: parsed.rawEnd,
    reason: parsed.reason,
    replyChannel: message.channel,
  });
  if (!result.ok) {
    const errText = result.error === "Selezione ruolo scaduta." ? "Selezione ruolo pausa scaduta. Riinvia la richiesta." : result.error;
    const warning = await message.channel.send({ content: `${message.author} <:vegax:1443934876440068179> ${errText}` }).catch(() => null);
    await message.delete().catch(() => { });
    if (warning) scheduleMessageDeletion(warning, EPHEMERAL_TTL_NORMAL_MS);
    finish();
    return true;
  }

  await message.delete().catch(() => { });
  finish();
  return true;
}

const RECENT_VOTE_LOOKBACK_MS = 72 * 60 * 60 * 1000;
const RECENT_VOTE_FETCH_LIMIT = 100;
const RECENT_VOTE_MAX_PAGES = 5;

const RECENT_BUMP_LOOKBACK_MS = 24 * 60 * 60 * 1000;

async function fetchRecentChannelMessages(channel, { lookbackMs, pageLimit, maxPages }) {
  if (!channel?.messages?.fetch) return [];
  const cutoff = Date.now() - lookbackMs;
  const byId = new Map();
  let before;
  for (let page = 0; page < maxPages; page += 1) {
    const batch = await channel.messages
      .fetch({ limit: pageLimit, ...(before ? { before } : {}) })
      .catch(() => null);
    if (!batch?.size) break;
    let oldestTs = Number.POSITIVE_INFINITY;
    let oldestId = null;
    for (const msg of batch.values()) {
      byId.set(String(msg.id), msg);
      const ts = Number(msg.createdTimestamp || 0);
      if (ts && ts < oldestTs) {
        oldestTs = ts;
        oldestId = String(msg.id);
      }
    }
    if (!oldestId || oldestTs < cutoff) break;
    before = oldestId;
  }
  return [...byId.values()];
}

function isOurDiscadiaThankYouMessage(message, client) {
  if (!message || String(message.author?.id || "") !== String(client?.user?.id || "")) return false;
  const { content, embedText, embedTitle, fieldsText } = getMessageTextParts(message);
  const voteText = `${content}${embedText}${embedTitle}${fieldsText}`;
  if (/top\.gg|\btopgg\b/i.test(voteText)) return false;
  return /votato su\s+\*?\*?Discadia\*?\*?|Un nuovo voto/i.test(voteText) && /Discadia/i.test(voteText);
}

async function tryRecoverVoteFromOurThankYou(message, client) {
  if (!isOurDiscadiaThankYouMessage(message, client)) return false;
  let user = await resolveUserFromMessage(message);
  if (user?.bot) user = null;
  if (!user) {
    const mentioned = message.mentions?.users?.first?.();
    if (mentioned && !mentioned.bot) user = mentioned;
  }
  if (!user) return false;
  const voteAtMs = Number(message.createdTimestamp || 0);
  if (await isVoteListingRecordedAtOrAfter(message.guild.id, user.id, "discadia", voteAtMs)) {
    return false;
  }
  return processDiscadiaVote(message.guild, user, client, { voteListing: "discadia" });
}

async function processRecentVoteChannelMessages(client) {
  if (!client || !VOTE_CHANNEL_ID) return { recovered: 0, scanned: 0 };
  const channel = client.channels.cache.get(VOTE_CHANNEL_ID) || (await client.channels.fetch(VOTE_CHANNEL_ID).catch(() => null));
  if (!channel?.isTextBased?.() || !channel.messages) return { recovered: 0, scanned: 0 };
  const cutoff = Date.now() - RECENT_VOTE_LOOKBACK_MS;
  let messages = [];
  try {
    messages = await fetchRecentChannelMessages(channel, {
      lookbackMs: RECENT_VOTE_LOOKBACK_MS,
      pageLimit: RECENT_VOTE_FETCH_LIMIT,
      maxPages: RECENT_VOTE_MAX_PAGES,
    });
  } catch (err) {
    global.logger?.warn?.("[VOTE EMBED] Failed to fetch recent messages for startup:", err?.message || err);
    return { recovered: 0, scanned: 0 };
  }
  const ourId = String(client.user?.id || "");
  const sorted = [...messages.values()]
    .filter((m) => (m.createdTimestamp || 0) >= cutoff)
    .sort((a, b) => (a.createdTimestamp || 0) - (b.createdTimestamp || 0));
  let recovered = 0;
  for (const message of sorted) {
    try {
      if (String(message.author?.id || "") === ourId) {
        const handledThankYou = await tryRecoverVoteFromOurThankYou(message, client);
        if (handledThankYou) recovered += 1;
        continue;
      }
      const handled = await handleVoteManagerMessage(message, client, {
        skipIfAlreadyRecorded: true,
        voteAtMs: message.createdTimestamp,
        keepSourceMessage: true,
      });
      if (handled) recovered += 1;
    } catch (err) {
      global.logger?.warn?.("[VOTE EMBED] Startup process message error:", err?.message || err);
    }
  }
  if (recovered > 0) {
    global.logger?.info?.(`[VOTE EMBED] Recuperati ${recovered} voti da #supporters (scansionati ${sorted.length} messaggi)`);
  }
  return { recovered, scanned: sorted.length };
}

async function processRecentCommandsChannelMessages(client) {
  if (!client || !COMMANDS_CHANNEL_ID) return;
  const channel = client.channels.cache.get(COMMANDS_CHANNEL_ID) || (await client.channels.fetch(COMMANDS_CHANNEL_ID).catch(() => null));
  if (!channel?.isTextBased?.() || !channel.messages) return;
  const cutoff = Date.now() - RECENT_BUMP_LOOKBACK_MS;
  let messages = [];
  try {
    messages = await channel.messages.fetch({ limit: RECENT_VOTE_FETCH_LIMIT });
  } catch (err) {
    global.logger?.warn?.("[BUMP] Failed to fetch recent commands channel for startup:", err?.message || err);
    return;
  }
  const ourId = client.user?.id;
  const sorted = [...messages.values()].sort((a, b) => (b.createdTimestamp || 0) - (a.createdTimestamp || 0));
  for (const message of sorted) {
    if ((message.createdTimestamp || 0) < cutoff) continue;
    if (message.author?.id === ourId) continue;
    try {
      const handledDiscadia = await handleDiscadiaBump(message, client);
      if (handledDiscadia) continue;
      await handleDisboardBump(message, client);
    } catch (err) {
      global.logger?.warn?.("[BUMP] Startup process message error:", err?.message || err);
    }
  }
}

async function processRecentPauseChannelMessages(client) {
  if (!client || !PAUSE_CHANNEL_ID) return;
  const channel = client.channels.cache.get(PAUSE_CHANNEL_ID) || (await client.channels.fetch(PAUSE_CHANNEL_ID).catch(() => null));
  if (!channel?.isTextBased?.() || !channel.messages) return;
  const cutoff = Date.now() - RECENT_BUMP_LOOKBACK_MS;
  let messages = [];
  try {
    messages = await channel.messages.fetch({ limit: RECENT_VOTE_FETCH_LIMIT });
  } catch (err) {
    global.logger?.warn?.("[PAUSE] Failed to fetch recent pause channel for startup:", err?.message || err);
    return;
  }
  const ourId = client.user?.id;
  const sorted = [...messages.values()].sort((a, b) => (b.createdTimestamp || 0) - (a.createdTimestamp || 0));
  for (const message of sorted) {
    if ((message.createdTimestamp || 0) < cutoff) continue;
    if (message.author?.id === ourId) continue;
    try {
      await handlePauseChannelMessage(message);
    } catch (err) {
      global.logger?.warn?.("[PAUSE] Startup process message error:", err?.message || err);
    }
  }
}

async function processAllRecentAutomationMessages(client) {
  await processRecentVoteChannelMessages(client);
  await processRecentCommandsChannelMessages(client);
}

module.exports = { channelAllowsMedia, getCachedOrFetchMember, handleDisboardBump, handleDiscadiaBump, handlePauseChannelMessage, handleSanzioniChannelMessage, handleThreadVoteMessage, handleMovieNightVoteMessage, handleVoteManagerMessage, hasMediaPermission, isDiscordInviteLinkMessage, isMediaMessage, processRecentVoteChannelMessages, processRecentCommandsChannelMessages, processRecentPauseChannelMessages, processAllRecentAutomationMessages, processDiscadiaVote };