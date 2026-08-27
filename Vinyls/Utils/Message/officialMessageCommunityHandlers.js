const path = require("path");
const mongoose = require("mongoose");
const { EmbedBuilder, escapeMarkdown, AuditLogEvent, PermissionFlagsBits } = require("discord.js");
const { inspect } = require("node:util");
const { getCountingConfigFromBucket } = require("../Global/globalSettingsBucket");
const { getAfk, clearAfk, listMentionReactions, listMentionResponses } = require("../../Services/Community/profileStore");
const { getCustomReactionMax } = require("../Community/mentionReactionPanelUtils");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const IDs = require("../Config/ids");
const { EPHEMERAL_TTL_NORMAL_MS, PROFILE_CUSTOM_RESPONSE_TTL_MS, scheduleMessageDeletion } = require("../Config/ephemeralMessageTtl");
const { validateMentionResponseText } = require("../Community/mentionResponseValidation");
const { memberHasMentionResponseAccess } = require("../Community/mentionResponseAccessUtils");
const { messageAllowsMentionInteraction } = require("../Community/mentionInteractionChannelUtils");
const { revokeCountingChannelSend, applyObviousWrongDayBan, formatBanUntilRomeTime } = require("../Community/countingChannelBanService");
const COUNTING_CHANNEL_ID = IDs.channels.counting;
const COUNTING_ALLOWED_REGEX = /^[0-9+\-*/x:() ]+$/;
const AFK_RETURN_TTL_MS = 3000;
const WORD_REACTIONS_CONFIG_PATH = path.join(__dirname, "..", "Config", "wordReactions.json");
const WORD_REACTIONS_MAX_REACTIONS = 20;
const WORD_REACTIONS_TIMEZONE = "Europe/Rome";
const WELCOME_CONTEXT_DURATION_MS = 2* 60 * 1000;
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");
const WELCOME_SESSION_DOC_TYPE = SITE_DOCUMENT_TYPE.COMMUNITY_WELCOME_SESSION;
let wordReactionsConfigCache = null;
const welcomeContextByChannelId = new Map();
const welcomeJoinTargetByGuildId = new Map();

function normalizeWelcomeJoinTargetUserId(userId) {
  const id = String(userId || "").trim();
  if (!/^\d{16,22}$/u.test(id)) return "";
  return id;
}

function isValidWelcomeJoinTargetUserId(userId) {
  return normalizeWelcomeJoinTargetUserId(userId).length > 0;
}

function readCtxJoinTargetUserId(ctx) {
  if (!ctx || typeof ctx !== "object") return "";
  const direct = normalizeWelcomeJoinTargetUserId(ctx.joinTargetUserId);
  if (direct) return direct;
  return normalizeWelcomeJoinTargetUserId(ctx.sessionId);
}

function resolveWelcomeRuleChannelIdSet(rule) {
  const ids = new Set();
  const keyGroups = [
    rule?.contextChannelIds,
    rule?.expChannelIds,
    rule?.channelIds,
  ];
  for (const keys of keyGroups) {
    if (!Array.isArray(keys)) continue;
    for (const idOrKey of keys) {
      const resolved = IDs.channels?.[String(idOrKey)] ?? String(idOrKey || "").trim();
      if (resolved) ids.add(resolved);
    }
  }
  return ids;
}

function getWelcomeContextChannelIds() {
  const rules = getWordReactionsConfig();
  const ids = new Set();
  for (const rule of rules) {
    if (!rule.onlyInWelcomeContext) continue;
    for (const resolved of resolveWelcomeRuleChannelIdSet(rule)) ids.add(resolved);
  }
  return Array.from(ids);
}

function applyWelcomeContext(guildId, joinTargetUserId, untilMs, channelIds) {
  const gid = String(guildId || "").trim();
  const targetId = normalizeWelcomeJoinTargetUserId(joinTargetUserId);
  const until = Math.floor(Number(untilMs) || 0);
  if (!gid || !targetId || until <= Date.now()) return;
  welcomeJoinTargetByGuildId.set(gid, { joinTargetUserId: targetId, until });
  for (const channelId of channelIds) {
    const cid = String(channelId || "").trim();
    if (!cid) continue;
    welcomeContextByChannelId.set(cid, { until, joinTargetUserId: targetId, guildId: gid });
  }
}

function persistWelcomeSession(guildId, joinTargetUserId, untilMs) {
  const gid = String(guildId || "").trim();
  const targetId = normalizeWelcomeJoinTargetUserId(joinTargetUserId);
  if (!gid || !targetId) return;
  SiteDocument.findOneAndUpdate(
    { docType: WELCOME_SESSION_DOC_TYPE, guildId: gid, dedupeKey: targetId },
    { $set: { status: "active", cooldownUntil: new Date(untilMs), userId: targetId } },
    { upsert: true },
  ).catch((err) => {
    global.logger?.warn?.("[welcome-context] persist session:", err?.message || err);
  });
}

async function persistWelcomeSessionAwait(guildId, joinTargetUserId, untilMs) {
  const gid = String(guildId || "").trim();
  const targetId = normalizeWelcomeJoinTargetUserId(joinTargetUserId);
  if (!gid || !targetId || mongoose.connection?.readyState !== 1) return false;
  await SiteDocument.findOneAndUpdate(
    { docType: WELCOME_SESSION_DOC_TYPE, guildId: gid, dedupeKey: targetId },
    { $set: { status: "active", cooldownUntil: new Date(untilMs), userId: targetId } },
    { upsert: true },
  ).catch((err) => {
    global.logger?.warn?.("[welcome-context] persist session:", err?.message || err);
    return null;
  });
  return true;
}

function setWelcomeContextForJoin(guildId, joinTargetUserId) {
  const gid = String(guildId || "").trim();
  const targetId = normalizeWelcomeJoinTargetUserId(joinTargetUserId);
  if (!gid || !targetId) return "";
  const channelIds = getWelcomeContextChannelIds();
  const until = Date.now() + WELCOME_CONTEXT_DURATION_MS;
  applyWelcomeContext(gid, targetId, until, channelIds);
  persistWelcomeSession(gid, targetId, until);
  return targetId;
}

function setWelcomeContextActive(guildId, joinTargetUserId) {
  const explicit = normalizeWelcomeJoinTargetUserId(joinTargetUserId);
  if (explicit) return setWelcomeContextForJoin(guildId, explicit);
  return refreshWelcomeContextForGuild(guildId);
}

function refreshWelcomeContextForGuild(guildId, joinTargetUserId) {
  const gid = String(guildId || "").trim();
  if (!gid) return "";
  const explicit = normalizeWelcomeJoinTargetUserId(joinTargetUserId);
  if (explicit) return setWelcomeContextForJoin(gid, explicit);
  const current = getWelcomeJoinTargetUserId(gid);
  if (!current) return "";
  return setWelcomeContextForJoin(gid, current);
}

async function activateWelcomeContextForGuild(guildId, joinTargetUserId) {
  const gid = String(guildId || "").trim();
  const targetId = setWelcomeContextForJoin(gid, joinTargetUserId);
  if (!targetId) return "";
  const until = Date.now() + WELCOME_CONTEXT_DURATION_MS;
  await persistWelcomeSessionAwait(gid, targetId, until);
  return targetId;
}

function extendWelcomeContextForMessage(message) {
  const guildId = String(message?.guild?.id || "").trim();
  if (!guildId) return;
  const until = Date.now() + WELCOME_CONTEXT_DURATION_MS;
  const joinTargetUserId = getWelcomeSessionIdForChannel(String(message?.channelId || ""), message?.channel || null) || getWelcomeJoinTargetUserId(guildId);
  if (!isValidWelcomeJoinTargetUserId(joinTargetUserId)) return;
  for (const channelId of getWelcomeContextChannelIds()) {
    const cid = String(channelId || "").trim();
    if (!cid) continue;
    const ctx = welcomeContextByChannelId.get(cid);
    if (!ctx || String(ctx.guildId || "") !== guildId) continue;
    welcomeContextByChannelId.set(cid, { ...ctx, until, joinTargetUserId });
  }
  welcomeJoinTargetByGuildId.set(guildId, { joinTargetUserId, until });
  persistWelcomeSession(guildId, joinTargetUserId, until);
}

function pickLatestWelcomeSessionDoc(docs) {
  if (!Array.isArray(docs) || !docs.length) return null;
  const now = Date.now();
  let best = null;
  let bestUntil = 0;
  for (const doc of docs) {
    const targetId = normalizeWelcomeJoinTargetUserId(doc?.dedupeKey) || normalizeWelcomeJoinTargetUserId(doc?.userId);
    const until = doc?.cooldownUntil instanceof Date ? doc.cooldownUntil.getTime() : 0;
    if (!targetId || until <= now) continue;
    if (!best || until > bestUntil) {
      best = doc;
      bestUntil = until;
    }
  }
  return best;
}

async function findLatestActiveWelcomeSessionDoc(guildId) {
  const gid = String(guildId || "").trim();
  if (!gid) return null;
  const now = new Date();
  const docs = await SiteDocument.find({
    docType: WELCOME_SESSION_DOC_TYPE,
    guildId: gid,
    cooldownUntil: { $gt: now },
  })
    .select("guildId dedupeKey userId cooldownUntil")
    .lean()
    .catch(() => []);
  return pickLatestWelcomeSessionDoc(docs);
}

async function ensureWelcomeContextHydratedForGreeting(message) {
  if (isWelcomeContextActiveForMessage(message)) return true;
  const guildId = String(message?.guild?.id || "").trim();
  if (!guildId) return false;
  const doc = await findLatestActiveWelcomeSessionDoc(guildId);
  if (!doc) return false;
  const joinTargetUserId = normalizeWelcomeJoinTargetUserId(doc?.dedupeKey) || normalizeWelcomeJoinTargetUserId(doc?.userId);
  const untilMs = doc?.cooldownUntil instanceof Date ? doc.cooldownUntil.getTime() : 0;
  if (!joinTargetUserId || untilMs <= Date.now()) return false;
  const channelIds = getWelcomeContextChannelIds();
  applyWelcomeContext(guildId, joinTargetUserId, untilMs, channelIds);
  return true;
}

async function restoreWelcomeSessionsFromDb() {
  const now = new Date();
  const docs = await SiteDocument.find({
    docType: WELCOME_SESSION_DOC_TYPE,
    cooldownUntil: { $gt: now },
  })
    .select("guildId dedupeKey userId cooldownUntil")
    .sort({ cooldownUntil: -1, dedupeKey: -1 })
    .lean()
    .catch(() => []);
  if (!Array.isArray(docs) || !docs.length) return;
  const channelIds = getWelcomeContextChannelIds();
  const latestByGuildId = new Map();
  for (const doc of docs) {
    const guildId = String(doc?.guildId || "").trim();
    if (!guildId) continue;
    const prev = latestByGuildId.get(guildId);
    const until = doc?.cooldownUntil instanceof Date ? doc.cooldownUntil.getTime() : 0;
    const prevUntil = prev?.cooldownUntil instanceof Date ? prev.cooldownUntil.getTime() : 0;
    if (!prev || until > prevUntil) latestByGuildId.set(guildId, doc);
  }
  for (const doc of latestByGuildId.values()) {
    const guildId = String(doc?.guildId || "").trim();
    const joinTargetUserId = normalizeWelcomeJoinTargetUserId(doc?.dedupeKey) || normalizeWelcomeJoinTargetUserId(doc?.userId);
    const untilMs = doc?.cooldownUntil instanceof Date ? doc.cooldownUntil.getTime() : 0;
    if (!guildId || !joinTargetUserId || untilMs <= Date.now()) continue;
    applyWelcomeContext(guildId, joinTargetUserId, untilMs, channelIds);
  }
}

function getWelcomeChannelContext(channelId) {
  const ctx = welcomeContextByChannelId.get(String(channelId || ""));
  if (!ctx || typeof ctx.until !== "number" || Date.now() >= ctx.until) {
    if (ctx) welcomeContextByChannelId.delete(String(channelId || ""));
    return null;
  }
  return ctx;
}

function getWelcomeJoinTargetUserId(guildId) {
  const gid = String(guildId || "").trim();
  if (!gid) return "";
  const entry = welcomeJoinTargetByGuildId.get(gid);
  if (!entry || typeof entry.until !== "number" || Date.now() >= entry.until) {
    if (entry) welcomeJoinTargetByGuildId.delete(gid);
    return "";
  }
  return normalizeWelcomeJoinTargetUserId(entry.joinTargetUserId);
}

function getWelcomeSessionId(guildId) {
  return getWelcomeJoinTargetUserId(guildId);
}

function getWelcomeSessionIdForChannel(channelId, channel = null) {
  const ctx = getWelcomeChannelContext(channelId);
  const fromCtx = readCtxJoinTargetUserId(ctx);
  if (fromCtx) return fromCtx;
  if (channel?.isThread?.()) {
    const parentCtx = getWelcomeChannelContext(String(channel.parentId || ""));
    const fromParent = readCtxJoinTargetUserId(parentCtx);
    if (fromParent) return fromParent;
  }
  return "";
}

function resolveWelcomeContextChannelIdsForMessage(message) {
  const ids = [];
  const cid = String(message?.channelId || "").trim();
  if (cid) ids.push(cid);
  const channel = message?.channel;
  if (channel?.isThread?.()) {
    const parentId = String(channel.parentId || "").trim();
    if (parentId) ids.push(parentId);
  }
  return ids;
}

function isWelcomeContextActive(channelId) {
  return getWelcomeChannelContext(channelId) != null;
}

function isWelcomeContextActiveForMessage(message) {
  for (const channelId of resolveWelcomeContextChannelIdsForMessage(message)) {
    if (isWelcomeContextActive(channelId)) return true;
  }
  return false;
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

function stripDiscordMarkdownForWordMatch(content) {
  let s = String(content || "");
  s = s.replace(/```[\s\S]*?```/gu, " ");
  s = s.replace(/`[^`\n]+`/gu, " ");
  for (let i = 0; i < 6; i += 1) {
    const before = s;
    s = s.replace(/\*\*([^*]+)\*\*/gu, "$1");
    s = s.replace(/\*([^*\n]+)\*/gu, "$1");
    s = s.replace(/__([^_]+)__/gu, "$1");
    s = s.replace(/_([^_\n]+)_/gu, "$1");
    s = s.replace(/~~([^~]+)~~/gu, "$1");
    if (s === before) break;
  }
  return s;
}

function normalizeMessageContentForWordMatch(content) {
  return stripDiscordMarkdownForWordMatch(content)
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\u2060\uFEFF\u00AD]/gu, "")
    .replace(/\u00a0/gu, " ")
    .trim()
    .toLowerCase();
}

const WORD_MATCH_BOUNDARY = "[\\s\\p{P}\\p{S}\\p{Extended_Pictographic}]";

function isLaughConfigWord(word) {
  return ["lol", "haha", "ahah"].includes(String(word || "").trim().toLowerCase());
}

function isStretchedLolToken(token) {
  const t = String(token || "").trim().toLowerCase();
  if (t.length < 3 || t.length > 24 || !/^[lo]+$/u.test(t)) return false;
  if (!/l/u.test(t) || !/o/u.test(t)) return false;
  return /^(?:l+o+l+|lo+l+|l+ol+)$/u.test(t);
}

function isStretchedAhLaughToken(token) {
  const t = String(token || "").trim().toLowerCase();
  if (t.length < 4 || t.length > 40 || !/^[ah]+$/u.test(t)) return false;
  if (!/a/u.test(t) || !/h/u.test(t)) return false;
  return true;
}

function matchesStretchedLaughToken(token, word) {
  const w = String(word || "").trim().toLowerCase();
  const t = String(token || "").trim().toLowerCase();
  if (!w || !t || /\s/u.test(t)) return false;
  if (!/^[a-z]+$/u.test(t)) return false;
  if (w === "lol") return isStretchedLolToken(t);
  if (w === "haha" || w === "ahah") return isStretchedAhLaughToken(t);
  return false;
}

function tokenizeForWordMatch(normalized) {
  return String(normalized || "")
    .split(/\s+/u)
    .map((tok) => tok.replace(/^[\p{P}]+|[\p{P}]+$/gu, "").toLowerCase())
    .filter(Boolean);
}

function matchesExactTokenWord(normalized, word) {
  const w = String(word || "").trim().toLowerCase();
  if (!w || w.includes(" ")) return false;
  const tokens = tokenizeForWordMatch(normalized);
  return tokens.some((tok) => {
    if (tok === w) return true;
    return matchesStretchedLaughToken(tok, w);
  });
}

function shouldUseExactTokenWordMatch(word) {
  const w = String(word || "").trim().toLowerCase();
  if (!w || w.includes(" ")) return false;
  if (isLaughConfigWord(w)) return false;
  return w.length <= 4;
}

function containsWholeWord(haystack, word) {
  const w = String(word || "").trim().toLowerCase();
  if (!w) return false;
  if (isLaughConfigWord(w)) {
    return matchesExactTokenWord(haystack, w);
  }
  if (shouldUseExactTokenWordMatch(w)) {
    return matchesExactTokenWord(haystack, w);
  }
  const lastChar = w.slice(-1);
  const trailingRepeat = lastChar ? `${escapeRegex(lastChar)}*` : "";
  const pattern = new RegExp(`(?:^|${WORD_MATCH_BOUNDARY})(?:${escapeRegex(w)})${trailingRepeat}(?:${WORD_MATCH_BOUNDARY}|$)`, "iu");
  if (pattern.test(haystack)) return true;
  return false;
}

function stripLeadingNoiseForGreeting(text) {
  let s = normalizeMessageContentForWordMatch(text);
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

function welcomeSlashTokenParts(token) {
  const bare = String(token || "").replace(/^[\p{P}]+|[\p{P}]+$/gu, "").toLowerCase();
  if (!bare.includes("/")) return [];
  return bare
    .split("/")
    .map((part) => part.replace(/^[\p{P}]+|[\p{P}]+$/gu, "").toLowerCase())
    .filter(Boolean);
}

function welcomeTokenPartMatchesNeedle(part, needle, repeatedNeedle) {
  const p = String(part || "").replace(/^[\p{P}]+|[\p{P}]+$/gu, "").toLowerCase();
  if (!p || !needle) return false;
  if (p === needle) return true;
  return p.startsWith(needle) && new RegExp(`^${repeatedNeedle}$`, "u").test(p);
}

function welcomeTokenMatchesNeedle(token, needle, repeatedNeedle) {
  const first = String(token || "").replace(/[\p{P}]+$/gu, "").toLowerCase();
  if (!first || !needle) return false;
  if (first === needle) return true;
  if (first.startsWith(needle) && new RegExp(`^${repeatedNeedle}$`, "u").test(first)) return true;
  if (first.includes("/")) {
    return welcomeSlashTokenParts(first).some((part) => welcomeTokenPartMatchesNeedle(part, needle, repeatedNeedle));
  }
  return false;
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
  if (welcomeTokenMatchesNeedle(firstToken[1], needle, repeatedNeedle)) return true;
  if (phrasePattern.test(h)) return true;
  return false;
}

function isLoneWordMessage(normalized, word) {
  const w = String(word || "").trim().toLowerCase();
  if (!w) return false;
  let s = stripLeadingNoiseForGreeting(normalized);
  s = s.replace(/[\p{P}\s]+$/gu, "").trim();
  if (s === w) return true;
  if (matchesStretchedLaughToken(s, w)) return true;
  const lastChar = w.slice(-1);
  const repeatedNeedle = lastChar ? `${escapeRegex(w)}${escapeRegex(lastChar)}*` : escapeRegex(w);
  return new RegExp(`^${repeatedNeedle}$`, "u").test(s);
}

function matchWelcomeRuleWord(normalized, rawTerm) {
  const t = String(rawTerm || "").trim().toLowerCase();
  if (!t) return false;
  const stripped = stripLeadingNoiseForGreeting(normalized);
  if (t.endsWith("*")) {
    const prefix = t.slice(0, -1);
    if (prefix.length < 3) return false;
    const tokens = stripped.split(/\s+/u).filter(Boolean);
    if (tokens.some((tok) => {
      const bare = tok.replace(/^[\p{P}]+|[\p{P}]+$/gu, "").toLowerCase();
      if (bare.startsWith(prefix)) return true;
      return welcomeSlashTokenParts(bare).some((part) => part.startsWith(prefix));
    })) {
      return true;
    }
    return stripped.includes(prefix);
  }
  if (containsWholeWord(normalized, t) || containsWholeWord(stripped, t)) return true;
  if (matchesAtMessageStart(normalized, t)) return true;
  if (t.includes(" ")) {
    return normalized.includes(t) || stripped.includes(t);
  }
  if (messageContainsWelcomeSlashTerm(normalized, t)) return true;
  if (t.includes("/")) {
    return welcomeGreetingSlashVariants(t, 2).some((part) =>
      containsWholeWord(normalized, part) || containsWholeWord(stripped, part) || matchesAtMessageStart(normalized, part),
    );
  }
  return false;
}

function matchesWelcomeGreetingTerm(normalized, term) {
  return matchWelcomeRuleWord(normalized, term);
}

function messageContainsWelcomeSlashTerm(normalized, term) {
  const t = String(term || "").trim().toLowerCase();
  if (!t || t.endsWith("*")) return false;
  const minPartLen = t.includes("/") ? 2 : 4;
  const stripped = stripLeadingNoiseForGreeting(normalized);
  const tokens = stripped.split(/\s+/u).filter(Boolean);
  for (const tok of tokens) {
    const bare = tok.replace(/^[\p{P}]+|[\p{P}]+$/gu, "").toLowerCase();
    if (!bare.includes("/")) continue;
    if (t.includes("/") && bare === t) return true;
    for (const part of welcomeSlashTokenParts(bare)) {
      if (part.length < minPartLen) continue;
      if (t.includes("/")) {
        if (part === t || bare === t) return true;
        continue;
      }
      if (part === t || part.startsWith(t)) return true;
    }
  }
  return false;
}

function matchesWelcomeGreetingWildcardToken(stripped, prefix) {
  const p = String(prefix || "").trim().toLowerCase();
  if (p.length < 6) return false;
  const pattern = new RegExp(
    `(?:^|[\\s\\p{P}])${escapeRegex(p)}[\\p{L}]*(?=[\\s\\p{P}]|$)`,
    "iu",
  );
  return pattern.test(stripLeadingNoiseForGreeting(stripped));
}

function matchesWelcomeGreetingTermForExp(normalized, term) {
  return matchesWelcomeGreetingTerm(normalized, term);
}

function welcomeGreetingSlashVariants(rawTerm, minPartLength = 4) {
  const t = String(rawTerm || "").trim().toLowerCase();
  if (!t.includes("/")) return [];
  const minLen = Math.max(2, Number(minPartLength || 4));
  return t
    .split("/")
    .map((part) => String(part || "").trim().toLowerCase())
    .filter((part) => part.length >= minLen);
}

function termMatchesWelcomeGreetingWord(normalized, rawTerm) {
  return matchWelcomeRuleWord(normalized, rawTerm);
}

function termMatchesWelcomeGreetingWordForExp(normalized, rawTerm) {
  const t = String(rawTerm || "").trim().toLowerCase();
  if (!t) return false;
  if (matchesWelcomeGreetingTermForExp(normalized, t)) return true;
  const variants = welcomeGreetingSlashVariants(t, 4);
  if (!variants.length) return false;
  return variants.some((part) => matchesWelcomeGreetingTermForExp(normalized, part));
}

function matchesWelcomeGreetingForExp(message, options = {}) {
  const rule = getWelcomeGreetingRule();
  if (!rule) return false;
  if (!options.skipContextCheck && !isWelcomeContextActiveForMessage(message)) return false;
  if (!isMessageInWelcomeExpChannel(message)) return false;
  const content = String(message.content || "").trim();
  if (!content || content.startsWith("+")) return false;
  return messageMatchesWordReactionRule(message, rule, new Date(), {
    skipWelcomeContextCheck: options.skipContextCheck === true,
  });
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
/** Coda per-guild: evita race tra messaggi ravvicinati (stesso Count letto due volte). */
const countingGuildQueues = new Map();

function withCountingGuildLock(guildId, work) {
  const key = String(guildId || "") || "_";
  const prev = countingGuildQueues.get(key) || Promise.resolve();
  const run = prev.catch(() => null).then(() => work());
  countingGuildQueues.set(
    key,
    run.then(
      () => null,
      () => null,
    ),
  );
  return run;
}

async function getCountingConfig(guildId, { bypassCache = false } = {}) {
  if (mongoose.connection?.readyState !== 1) return null;
  const key = String(guildId || "");
  if (!key) return null;
  const now = Date.now();
  if (!bypassCache) {
    const cached = countingConfigCache.get(key);
    if (cached?.value && now < Number(cached.expiresAt || 0)) {
      return cached.value;
    }
  } else {
    countingConfigCache.delete(key);
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
    const msg = await safeMessageReply(message, {
      content: `Bentornato/a <@${userId}>, ho rimosso il tuo AFK.`,
    });
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
    if (!messageAllowsMentionInteraction(message)) return;
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

async function handleMentionAutoResponses(message) {
  try {
    if (!messageAllowsMentionInteraction(message)) return;
    const mentionedUsers = message.mentions?.users;
    if (!mentionedUsers || mentionedUsers.size === 0) return;

    const explicitMentionIds = new Set();
    const mentionRegex = /<@!?(\d{16,20})>/g;
    let match = null;
    const content = String(message.content || "");
    while ((match = mentionRegex.exec(content)) !== null) {
      explicitMentionIds.add(String(match[1]));
    }
    explicitMentionIds.delete(String(message.author?.id || ""));
    if (explicitMentionIds.size === 0) return;

    const targetIds = Array.from(
      new Set(
        mentionedUsers
          .filter((user) => !user.bot && explicitMentionIds.has(user.id))
          .map((user) => user.id),
      ),
    );
    if (!targetIds.length) return;

    const docs = await listMentionResponses(message.guild.id, targetIds).catch(() => []);
    if (!Array.isArray(docs) || !docs.length) return;

    let sent = 0;
    for (const doc of docs) {
      if (sent >= 3) break;
      const member =
        message.guild.members.cache.get(String(doc?.userId || "")) ||
        (await message.guild.members.fetch(String(doc?.userId || "")).catch(() => null));
      if (!memberHasMentionResponseAccess(member)) continue;
      const text = String(doc?.text || "").trim();
      if (!text) continue;
      const validation = validateMentionResponseText(text);
      if (!validation.ok) continue;
      const mentionerId = String(message.author?.id || "").trim();
      const content = validation.text;
      const replyMsg = await safeMessageReply(message, {
        content,
        __skipNoticeEmbed: true,
        allowedMentions: {
          parse: [],
          users: mentionerId ? [mentionerId] : [],
          roles: [],
          repliedUser: false,
        },
      }).catch(() => null);
      if (replyMsg) scheduleMessageDeletion(replyMsg, PROFILE_CUSTOM_RESPONSE_TTL_MS);
      sent += 1;
    }
  } catch (error) {
    global.logger?.error?.("[MENTION-RESPONSE] Fatal error:", error);
  }
}

function messageMatchesWordReactionRule(message, rule, now = new Date(), options = {}) {
  if (!message?.guild || !rule || typeof rule !== "object") return false;
  const content = String(message.content || "").trim();
  if (!content || content.startsWith("+")) return false;
  if (Array.isArray(rule.channelIds) && rule.channelIds.length > 0) {
    const resolved = rule.channelIds.map((idOrKey) => IDs.channels?.[String(idOrKey)] ?? String(idOrKey || "").trim()).filter(Boolean);
    const messageChannelIds = [String(message.channelId || "")];
    if (message?.channel?.isThread?.()) {
      const parentId = String(message.channel.parentId || "").trim();
      if (parentId) messageChannelIds.push(parentId);
    }
    if (!messageChannelIds.some((id) => resolved.includes(id))) return false;
  }
  if (!isWithinTimeWindow(now, rule.timeWindow)) return false;
  if (rule.onlyInWelcomeContext && !options.skipWelcomeContextCheck && !isWelcomeContextActiveForMessage(message)) return false;
  const normalized = normalizeMessageContentForWordMatch(content);
  const words = Array.isArray(rule.words) ? rule.words : [];
  const loneWords = Array.isArray(rule.loneWords) ? rule.loneWords : [];
  const matchAtStart = rule.matchAtStart === true;
  const welcomeTerms = rule.onlyInWelcomeContext === true;
  const sortedWords = [...words].sort((a, b) => String(b || "").length - String(a || "").length);
  for (const w of sortedWords) {
    const term = String(w || "").trim();
    if (!term) continue;
    if (matchAtStart) {
      if (matchesAtMessageStart(normalized, term)) return true;
    } else if (welcomeTerms) {
      if (matchWelcomeRuleWord(normalized, term)) return true;
    } else if (containsWholeWord(normalized, term)) {
      return true;
    }
  }
  if (loneWords.length) {
    return loneWords.some((lw) => isLoneWordMessage(normalized, lw));
  }
  return false;
}

function resolveWordReactionChannelIds(channelIdKeys) {
  if (!Array.isArray(channelIdKeys)) return [];
  return channelIdKeys
    .map((idOrKey) => IDs.channels?.[String(idOrKey)] ?? String(idOrKey || "").trim())
    .filter(Boolean);
}

function getWelcomeGreetingRule() {
  const rules = getWordReactionsConfig();
  if (!Array.isArray(rules)) return null;
  return rules.find((rule) => rule?.onlyInWelcomeContext) || null;
}

function matchesWelcomeGreetingMessage(message) {
  const rules = getWordReactionsConfig();
  if (!Array.isArray(rules) || !rules.length) return false;
  const now = new Date();
  return rules.some((rule) => rule?.onlyInWelcomeContext && messageMatchesWordReactionRule(message, rule, now));
}

function messageChannelIdsForWelcomeExp(message) {
  const ids = new Set();
  const cid = String(message?.channelId || "").trim();
  if (cid) ids.add(cid);
  const parentId = String(message?.channel?.parentId || "").trim();
  if (message?.channel?.isThread?.() && parentId) ids.add(parentId);
  return ids;
}

function isMessageInWelcomeRuleChannel(message) {
  const rule = getWelcomeGreetingRule();
  if (!rule) return false;
  const resolved = new Set(resolveWordReactionChannelIds([
    ...(Array.isArray(rule.channelIds) ? rule.channelIds : []),
    ...(Array.isArray(rule.contextChannelIds) ? rule.contextChannelIds : []),
    ...(Array.isArray(rule.expChannelIds) ? rule.expChannelIds : []),
  ]));
  const messageIds = messageChannelIdsForWelcomeExp(message);
  return [...resolved].some((id) => messageIds.has(String(id || "").trim()));
}

function isMessageInWelcomeExpChannel(message) {
  const rule = getWelcomeGreetingRule();
  if (!rule) return false;
  const expKeys = new Set();
  if (Array.isArray(rule.expChannelIds)) {
    for (const key of rule.expChannelIds) expKeys.add(String(key || "").trim());
  }
  if (Array.isArray(rule.contextChannelIds)) {
    for (const key of rule.contextChannelIds) expKeys.add(String(key || "").trim());
  }
  if (!expKeys.size && Array.isArray(rule.channelIds)) {
    for (const key of rule.channelIds) expKeys.add(String(key || "").trim());
  }
  if (!expKeys.size) expKeys.add("chat");
  const resolved = new Set(resolveWordReactionChannelIds(Array.from(expKeys)));
  const messageIds = messageChannelIdsForWelcomeExp(message);
  return [...resolved].some((id) => messageIds.has(String(id || "").trim()));
}

function matchesWelcomeGreetingExpMessage(message) {
  return matchesWelcomeGreetingForExp(message);
}

function resolveWelcomeGreetingSessionId(message, options = {}) {
  const channelId = String(message?.channelId || "").trim();
  const guildId = String(message?.guild?.id || "").trim();
  const channel = message?.channel || null;
  const trusted = options.trustedFromWordReaction === true;
  const fromChannel = getWelcomeSessionIdForChannel(channelId, channel);
  if (isValidWelcomeJoinTargetUserId(fromChannel)) return fromChannel;
  if (trusted && guildId) {
    const fromGuild = getWelcomeJoinTargetUserId(guildId);
    if (isValidWelcomeJoinTargetUserId(fromGuild)) return fromGuild;
  }
  if (guildId && isWelcomeContextActiveForMessage(message)) {
    const fromGuild = getWelcomeJoinTargetUserId(guildId);
    if (isValidWelcomeJoinTargetUserId(fromGuild)) return fromGuild;
  }
  if (guildId) {
    const now = Date.now();
    for (const ctx of welcomeContextByChannelId.values()) {
      if (String(ctx?.guildId || "") !== guildId) continue;
      if (typeof ctx.until !== "number" || now >= ctx.until) continue;
      const targetId = readCtxJoinTargetUserId(ctx);
      if (isValidWelcomeJoinTargetUserId(targetId)) return targetId;
    }
  }
  return "";
}

async function resolveWelcomeGreetingSessionIdAsync(message, options = {}) {
  const syncId = resolveWelcomeGreetingSessionId(message, options);
  if (isValidWelcomeJoinTargetUserId(syncId)) return syncId;
  const guildId = String(message?.guild?.id || "").trim();
  if (!guildId) return "";
  const doc = await findLatestActiveWelcomeSessionDoc(guildId);
  if (!doc) return "";
  return normalizeWelcomeJoinTargetUserId(doc?.dedupeKey) || normalizeWelcomeJoinTargetUserId(doc?.userId);
}

async function resolveWelcomeGreetingSessionIdWithRetry(message, options = {}) {
  const attempts = Math.max(1, Math.min(8, Math.floor(Number(options.attempts) || 5)));
  const delayMs = Math.max(100, Math.floor(Number(options.delayMs) || 400));
  for (let i = 0; i < attempts; i += 1) {
    await ensureWelcomeContextHydratedForGreeting(message);
    const joinTargetUserId = await resolveWelcomeGreetingSessionIdAsync(message, options);
    if (isValidWelcomeJoinTargetUserId(joinTargetUserId)) return joinTargetUserId;
    if (i < attempts - 1) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return "";
}

async function handleWordReactions(message) {
  if (!message?.guild || !message.content || typeof message.react !== "function") return;
  const content = String(message.content || "").trim();
  if (!content || content.startsWith("+")) return;

  const rules = getWordReactionsConfig();
  if (!Array.isArray(rules) || !rules.length) return;

  const seen = new Set();
  const toReact = [];
  const now = new Date();
  const welcomeRule = getWelcomeGreetingRule();
  if (welcomeRule && isMessageInWelcomeRuleChannel(message)) {
    await ensureWelcomeContextHydratedForGreeting(message);
  }
  let welcomeRuleMatched = false;
  for (const rule of rules) {
    if (!messageMatchesWordReactionRule(message, rule, now)) continue;
    if (rule?.onlyInWelcomeContext === true) welcomeRuleMatched = true;
    const reactions = Array.isArray(rule.reactions) ? rule.reactions : [];
    for (const token of reactions) {
      const resolved = resolveReactionForMessage(message, token);
      if (!resolved || seen.has(resolved.key) || toReact.length >= WORD_REACTIONS_MAX_REACTIONS) continue;
      seen.add(resolved.key);
      toReact.push(resolved.value);
    }
  }

  if (welcomeRuleMatched && isMessageInWelcomeExpChannel(message)) {
    extendWelcomeContextForMessage(message);
    await ensureWelcomeContextHydratedForGreeting(message);
    const pinnedJoinTargetUserId = await resolveWelcomeGreetingSessionIdWithRetry(message, { trustedFromWordReaction: true });
    try {
      const { awardWelcomeGreetingExpFromReaction, scheduleWelcomeGreetingExpBackup } = require("../../Services/Community/messageCommunityExpBonusesService");
      await awardWelcomeGreetingExpFromReaction(message, {
        joinTargetUserId: pinnedJoinTargetUserId,
        welcomeRuleMatched: true,
      });
      scheduleWelcomeGreetingExpBackup(message, { joinTargetUserId: pinnedJoinTargetUserId });
    } catch (err) {
      global.logger?.warn?.("[welcome-greeting-exp] before reactions:", err?.message || err);
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
    }
  });
}

function isBenignCountingReactionError(err) {
  const code = Number(err?.code ?? err?.rawError?.code);
  if (code === 90001) return true;
  return /reaction blocked/i.test(String(err?.message || err?.rawError?.message || ""));
}

function logCountingReactionError(client, err) {
  if (isBenignCountingReactionError(err)) return;
  logEventError(client, "COUNTING", err);
}

async function sendCountingFailureReply(message, embed, client, restoreContext = null) {
  const { createRestoreToken, attachRestoreMessageId, buildCountingRestoreRow } = require("../Community/countingRestoreService");
  const components = [];
  const lostCount = Math.max(0, Math.floor(Number(restoreContext?.lostCount || 0)));
  const guildId = String(restoreContext?.guildId || message?.guild?.id || "");
  let restoreToken = null;
  if (lostCount > 0 && guildId) {
    restoreToken = await createRestoreToken({
      guildId,
      lostCount,
      lostLastUser: restoreContext?.lostLastUser,
      channelId: message?.channel?.id,
    });
    components.push(buildCountingRestoreRow(restoreToken));
  }
  try {
    const sent = await safeMessageReply(message, {
      embeds: [embed],
      components,
      allowedMentions: { repliedUser: false },
    });
    if (sent?.id && restoreToken) {
      await attachRestoreMessageId(restoreToken, sent.id, client);
    }
    return sent;
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

function evaluateCountingContent(raw) {
  const content = String(raw || "").trim();
  if (!content || !COUNTING_ALLOWED_REGEX.test(content)) return null;
  try {
    const math = require("mathjs");
    const expression = content.replace(/\s+/g, "").replace(/x/g, "*").replace(/:/g, "/");
    const value = math.evaluate(expression);
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function isCountingNumericContent(raw) {
  return evaluateCountingContent(raw) !== null;
}

/** Messaggio già registrato nel DB (catch-up che riprocessa lo stesso numero → falso "da solo"). */
function isCountingMessageAlreadyAccepted(countdata, messageValue, authorId) {
  const value = Math.floor(Number(messageValue));
  const count = Math.floor(Number(countdata?.Count || 0));
  if (!Number.isFinite(value)) return false;
  if (value === count && String(authorId || "") === String(countdata?.LastUser || "")) return true;
  return false;
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

async function resolveCountingMember(message) {
  if (message.member) return message.member;
  const guild = message.guild || message.channel?.guild;
  const authorId = message.author?.id;
  if (!guild || !authorId || message.author?.bot) return null;
  const cached = guild.members.cache.get(authorId);
  if (cached) return cached;
  return guild.members.fetch(authorId).catch(() => null);
}

async function handleCounting(message, client) {
  const guildId =
    message?.guild?.id || message?.channel?.guild?.id || message?.guildId;
  if (!guildId) return;
  return withCountingGuildLock(guildId, () => handleCountingLocked(message, client, guildId));
}

async function handleCountingLocked(message, client, guildId) {
  // Sempre fresco sotto lock: la cache condivisa faceva valutare 987 con Count ancora a 985.
  const countdata = await getCountingConfig(guildId, { bypassCache: true });
  if (!countdata) return;
  const member = await resolveCountingMember(message);
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
  try {
    const sendPerms = countchannel.permissionsFor?.(member);
    // Deny SendMessages: non processare numeri, ma i non-numerici sono già stati cancellati sopra.
    if (sendPerms && !sendPerms.has(PermissionFlagsBits.SendMessages)) return;
  } catch {
    /* ignore */
  }
  const messageValue = evaluateCountingContent(message.content);
  if (messageValue === null) {
    return message.delete().catch(() => { });
  }
  const reaction = "<:success:1461731530333229226>";
  if (isCountingMessageAlreadyAccepted(countdata, messageValue, message.author.id)) {
    if (!messageHasBotSuccessReaction(message)) {
      await message.react(reaction).catch((err) => logCountingReactionError(client, err));
    }
    return;
  }
  if (messageHasBotSuccessReaction(message)) return;
  const countNow = Math.floor(Number(countdata.Count || 0));
  const expectedNext = countNow + 1;
  // Confronti numerici: Count da bucket/legacy a volte arriva come stringa
  // (`738 !== "738"`) e faceva partire "Hai sbagliato" sul numero corretto.
  const isWrongNumber =
    messageValue - 1 !== countNow ||
    messageValue === countNow ||
    messageValue > countNow + 1;
  const isAlone = String(message.author.id) === String(countdata.LastUser || "").trim();
  // Numero sbagliato prima di "da solo": se LastUser scrive 1 con count alto
  // prima finiva nel ramo alone e saltava il ban giornaliero.
  if (isWrongNumber) {
    const lostCount = countNow;
    const lostLastUser = countdata.LastUser;
    const banOutcome = await applyObviousWrongDayBan({
      member,
      channel: countchannel,
      client,
      expectedNext,
      submittedValue: messageValue,
    });
    let failureText =
      `<:cancel:1461730653677551691> Hai sbagliato numero! Counting perso a: **${lostCount}**! Riparti scrivendo **1**.`;
    if (banOutcome?.applied) {
      failureText += `\n<a:VC_uaskelly:1507868393305411655> Numero **molto** lontano da **${expectedNext}**: bloccato/a in questo canale fino a **${formatBanUntilRomeTime(banOutcome.banUntilMs)}**.`;
    }
    await sendCountingFailureReply(
      message,
      new EmbedBuilder()
        .setDescription(failureText)
        .setColor("#6f4e37"),
      client,
      { guildId, lostCount, lostLastUser },
    );
    countdata.Count = 0;
    countdata.LastUser = " ";
    message
      .react("<:cancel:1461730653677551691>")
      .catch((err) => logCountingReactionError(client, err));
  } else if (isAlone) {
    const lostCount = countNow;
    const lostLastUser = countdata.LastUser;
    await sendCountingFailureReply(
      message,
      new EmbedBuilder()
        .setDescription(
          `<:cancel:1461730653677551691> Non puoi contare da solo! Counting perso a: **${lostCount}**! Riparti scrivendo **1**.`,
        )
        .setColor("#6f4e37"),
      client,
      { guildId, lostCount, lostLastUser },
    );
    countdata.Count = 0;
    countdata.LastUser = " ";
    message
      .react("<:cancel:1461730653677551691>")
      .catch((err) => logCountingReactionError(client, err));
  } else {
    countdata.Count = countNow + 1;
    countdata.LastUser = message.author.id;
    message
      .react(reaction)
      .catch((err) => logCountingReactionError(client, err));
  }
  await countdata.save();
  invalidateCountingConfig(guildId);
}

const COUNTING_CATCHUP_FETCH_LIMIT = 100;
const COUNTING_SUCCESS_EMOJI_ID = "1461731530333229226";
const COUNTING_CANCEL_EMOJI_ID = "1461730653677551691";
let countingCatchUpInFlight = null;

function messageHasBotCountingReaction(message) {
  return message.reactions.cache.some((r) => r.me === true);
}

function messageHasBotSuccessReaction(message) {
  return message.reactions.cache.some(
    (r) =>
      r.me === true &&
      (String(r.emoji?.id || "") === COUNTING_SUCCESS_EMOJI_ID ||
        String(r.emoji?.name || "").toLowerCase() === "success"),
  );
}

function messageHasBotCancelReaction(message) {
  return message.reactions.cache.some(
    (r) =>
      r.me === true &&
      (String(r.emoji?.id || "") === COUNTING_CANCEL_EMOJI_ID ||
        String(r.emoji?.name || "").toLowerCase() === "cancel"),
  );
}

function findLastBotSuccessTimestamp(messages) {
  let lastTs = 0;
  for (const message of messages.values()) {
    if (!messageHasBotSuccessReaction(message)) continue;
    if (message.createdTimestamp > lastTs) lastTs = message.createdTimestamp;
  }
  return lastTs;
}

async function resolveCountingTextChannelForSync(guild, client, channelId) {
  if (!channelId) return null;
  const cached = guild.channels.cache.get(channelId) || client.channels.cache.get(channelId);
  if (cached?.messages?.fetch) return cached;
  const fetched = await guild.channels.fetch(channelId).catch(() => null);
  if (fetched?.messages?.fetch) return fetched;
  return null;
}

/**
 * Catch-up soft: avanza solo la catena consecutiva valida.
 * Mai reset/ban/reply di fallimento (un restart non deve far perdere il counting).
 */
async function softSyncCountingCatchUpForGuild(guild, client, countdata) {
  const mainGuildId = IDs.guilds?.main || null;
  const channelId = countdata.Channel || (guild.id === mainGuildId ? COUNTING_CHANNEL_ID : null);
  const channel = await resolveCountingTextChannelForSync(guild, client, channelId);
  if (!channel?.messages?.fetch) return { advanced: 0 };

  let messages;
  try {
    messages = await channel.messages.fetch({ limit: COUNTING_CATCHUP_FETCH_LIMIT });
  } catch (err) {
    global.logger?.warn?.("[COUNTING] catch-up fetch failed:", guild.id, err?.message || err);
    return { advanced: 0 };
  }

  invalidateCountingConfig(guild.id);
  const fresh = (await getCountingConfig(guild.id)) || countdata;
  let counterNow = Math.floor(Number(fresh.Count || 0));
  let lastUser = String(fresh.LastUser || "").trim();
  const successReaction = "<:success:1461731530333229226>";

  const chronological = [...messages.values()]
    .filter((m) => !m.author?.bot && COUNTING_ALLOWED_REGEX.test(m.content))
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  // Se il DB è stato resettato/avanti a torto, ancora all'ultimo successo pulito (no cancel).
  // Race catch-up poteva lasciare success+cancel sullo stesso messaggio.
  // Non ripristinare se dopo quel successo c'è già un fail (cancel): altrimenti un restart
  // dopo "Counting perso" rimetteva il counter e il click su Ripristina toglieva il bottone.
  let dirty = false;
  let lastCleanSuccess = null;
  for (let i = chronological.length - 1; i >= 0; i -= 1) {
    const m = chronological[i];
    if (!messageHasBotSuccessReaction(m)) continue;
    if (messageHasBotCancelReaction(m)) continue;
    const v = Math.floor(Number(evaluateCountingContent(m.content)));
    if (!Number.isFinite(v)) continue;
    lastCleanSuccess = {
      value: v,
      authorId: String(m.author?.id || "").trim(),
      createdTimestamp: m.createdTimestamp,
    };
    break;
  }
  const hasFailAfterLastSuccess = lastCleanSuccess
    ? chronological.some(
        (m) =>
          m.createdTimestamp > lastCleanSuccess.createdTimestamp &&
          messageHasBotCancelReaction(m),
      )
    : false;
  if (lastCleanSuccess && !hasFailAfterLastSuccess) {
    const { value: v, authorId } = lastCleanSuccess;
    if (v !== counterNow || authorId !== lastUser) {
      counterNow = v;
      lastUser = authorId || lastUser;
      fresh.Count = counterNow;
      fresh.LastUser = lastUser || " ";
      dirty = true;
      global.logger?.info?.(
        `[COUNTING] catch-up guild ${guild.id}: ripristino da ultimo successo → ${counterNow}`,
      );
    }
  } else if (lastCleanSuccess && hasFailAfterLastSuccess && counterNow === 0) {
    global.logger?.info?.(
      `[COUNTING] catch-up guild ${guild.id}: fail dopo ultimo successo → lascio counter a 0 (Ripristina)`,
    );
  }

  // Pulisci success spurii su messaggi già marcati cancel.
  for (const m of chronological) {
    if (!messageHasBotCancelReaction(m) || !messageHasBotSuccessReaction(m)) continue;
    const success = m.reactions.cache.find(
      (r) =>
        r.me === true &&
        (String(r.emoji?.id || "") === COUNTING_SUCCESS_EMOJI_ID ||
          String(r.emoji?.name || "").toLowerCase() === "success"),
    );
    if (success) {
      await success.users.remove(client.user.id).catch(() => null);
    }
  }

  const pending = chronological.filter((m) => {
    if (messageHasBotCancelReaction(m)) return false;
    if (messageHasBotSuccessReaction(m)) return false;
    const v = Math.floor(Number(evaluateCountingContent(m.content)));
    if (!Number.isFinite(v)) return false;
    return v > counterNow;
  });
  if (!pending.length && !dirty) return { advanced: 0 };
  if (pending.length) {
    global.logger?.info?.(
      `[COUNTING] catch-up guild ${guild.id}: ${pending.length} messaggio/i da allineare (counter DB: ${counterNow})`,
    );
  }

  let advanced = 0;
  for (const message of pending) {
    const value = Math.floor(Number(evaluateCountingContent(message.content)));
    if (!Number.isFinite(value)) break;
    const authorId = String(message.author?.id || "");
    if (value === counterNow && authorId && authorId === lastUser) {
      if (!messageHasBotSuccessReaction(message)) {
        await message.react(successReaction).catch((err) => logCountingReactionError(client, err));
      }
      continue;
    }
    if (value !== counterNow + 1) break;
    if (authorId && authorId === lastUser) break;

    counterNow = value;
    lastUser = authorId || lastUser;
    fresh.Count = counterNow;
    fresh.LastUser = lastUser || " ";
    dirty = true;
    advanced += 1;
    if (!messageHasBotSuccessReaction(message)) {
      await message.react(successReaction).catch((err) => logCountingReactionError(client, err));
    }
  }

  if (dirty) {
    await fresh.save();
    invalidateCountingConfig(guild.id);
    global.logger?.info?.(
      `[COUNTING] catch-up guild ${guild.id}: allineato a ${counterNow} (+${advanced})`,
    );
  }
  return { advanced, counterNow };
}

async function processPendingCountingMessages(client) {
  if (!client?.user?.id) return;
  if (mongoose.connection?.readyState !== 1) return;
  if (countingCatchUpInFlight) return countingCatchUpInFlight;

  countingCatchUpInFlight = (async () => {
    try {
      for (const guild of client.guilds.cache.values()) {
        try {
          await withCountingGuildLock(guild.id, async () => {
            const countdata = await getCountingConfig(guild.id, { bypassCache: true });
            if (!countdata) return;
            await softSyncCountingCatchUpForGuild(guild, client, countdata);
          });
        } catch (err) {
          global.logger?.warn?.("[COUNTING] catch-up guild failed:", guild.id, err?.message || err);
        }
      }
    } finally {
      countingCatchUpInFlight = null;
    }
  })();

  return countingCatchUpInFlight;
}

module.exports = { handleAfk, handleCounting, handleMentionAutoReactions, handleMentionAutoResponses, handleWordReactions, logEventError, processPendingCountingMessages, setWelcomeContextActive, activateWelcomeContextForGuild, refreshWelcomeContextForGuild, restoreWelcomeSessionsFromDb, ensureWelcomeContextHydratedForGreeting, isWelcomeContextActive, getWelcomeSessionId, getWelcomeJoinTargetUserId, getWelcomeSessionIdForChannel, normalizeWelcomeJoinTargetUserId, isValidWelcomeJoinTargetUserId, resolveWelcomeGreetingSessionId, resolveWelcomeGreetingSessionIdAsync, resolveWelcomeGreetingSessionIdWithRetry, isMessageInWelcomeExpChannel, matchesWelcomeGreetingMessage, matchesWelcomeGreetingForExp, matchesWelcomeGreetingExpMessage, maybePunishCountingOnDelete, maybePunishCountingOnEdit, maybePunishCountingOnBulkDelete, invalidateCountingConfig, withCountingGuildLock };