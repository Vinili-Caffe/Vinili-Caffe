const path = require("path") as typeof import("path");
const mongoose = require("mongoose") as typeof import("mongoose");
const { escapeMarkdown } = require("discord.js") as typeof import("discord.js");
const { inspect } = require("node:util") as typeof import("node:util");
const { getAfk, clearAfk, listMentionReactions, listMentionResponses } = require("./profileStore") as typeof import("./profileStore");
const { getCustomReactionMax } = require("../utils/mentionReactionPanelUtils") as typeof import("../utils/mentionReactionPanelUtils");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime") as typeof import("../../../shared/discord/replyRuntime");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { EPHEMERAL_TTL_NORMAL_MS, PROFILE_CUSTOM_RESPONSE_TTL_MS, scheduleMessageDeletion } = require("../../../shared/utils/ephemeralMessageTtl") as typeof import("../../../shared/utils/ephemeralMessageTtl");
const { validateMentionResponseText } = require("../utils/mentionResponseValidation") as typeof import("../utils/mentionResponseValidation");
const { memberHasMentionResponseAccess } = require("../utils/mentionResponseAccessUtils") as typeof import("../utils/mentionResponseAccessUtils");
const { messageAllowsMentionInteraction } = require("../utils/mentionInteractionChannelUtils") as typeof import("../utils/mentionInteractionChannelUtils");
const AFK_RETURN_TTL_MS = 3000;
const WORD_REACTIONS_CONFIG_PATH = path.join(__dirname, "..", "config", "wordReactions.json");
const WORD_REACTIONS_MAX_REACTIONS = 20;
const WORD_REACTIONS_TIMEZONE = "Europe/Rome";
const WELCOME_CONTEXT_DURATION_MS = 2* 60 * 1000;
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../schemas/communitySchemas") as typeof import("../schemas/communitySchemas");
const WELCOME_SESSION_DOC_TYPE = SITE_DOCUMENT_TYPE.COMMUNITY_WELCOME_SESSION;
let wordReactionsConfigCache = null;
const welcomeContextByChannelId = new Map();
const welcomeJoinTargetByGuildId = new Map();

function normalizeWelcomeJoinTargetUserId(userId?) {
  const id = String(userId || "").trim();
  if (!/^\d{16,22}$/u.test(id)) return "";
  return id;
}

function isValidWelcomeJoinTargetUserId(userId?) {
  return normalizeWelcomeJoinTargetUserId(userId).length > 0;
}

function readCtxJoinTargetUserId(ctx?) {
  if (!ctx || typeof ctx !== "object") return "";
  const direct = normalizeWelcomeJoinTargetUserId(ctx.joinTargetUserId);
  if (direct) return direct;
  return normalizeWelcomeJoinTargetUserId(ctx.sessionId);
}

function resolveWelcomeRuleChannelIdSet(rule?) {
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

function applyWelcomeContext(guildId?, joinTargetUserId?, untilMs?, channelIds?) {
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

function isMongoConnected() {
  return mongoose.connection?.readyState === 1;
}

function isMongoNotConnectedError(err?) {
  return (
    err?.name === "MongoNotConnectedError" ||
    /Client must be connected before running operations/i.test(String(err?.message || err || ""))
  );
}

function persistWelcomeSession(guildId?, joinTargetUserId?, untilMs?) {
  const gid = String(guildId || "").trim();
  const targetId = normalizeWelcomeJoinTargetUserId(joinTargetUserId);
  if (!gid || !targetId) return;
  /* In-memory context already applied; skip DB until mongoose is ready (boot race). */
  if (!isMongoConnected()) return;
  SiteDocument.findOneAndUpdate(
    { docType: WELCOME_SESSION_DOC_TYPE, guildId: gid, dedupeKey: targetId },
    { $set: { status: "active", cooldownUntil: new Date(untilMs), userId: targetId } },
    { upsert: true },
  ).catch((err?) => {
    if (isMongoNotConnectedError(err)) return;
    global.logger?.warn?.("[welcome-context] persist session:", err?.message || err);
  });
}

async function persistWelcomeSessionAwait(guildId?, joinTargetUserId?, untilMs?) {
  const gid = String(guildId || "").trim();
  const targetId = normalizeWelcomeJoinTargetUserId(joinTargetUserId);
  if (!gid || !targetId || !isMongoConnected()) return false;
  try {
    await SiteDocument.findOneAndUpdate(
      { docType: WELCOME_SESSION_DOC_TYPE, guildId: gid, dedupeKey: targetId },
      { $set: { status: "active", cooldownUntil: new Date(untilMs), userId: targetId } },
      { upsert: true },
    );
    return true;
  } catch (err) {
    if (!isMongoNotConnectedError(err)) {
      global.logger?.warn?.("[welcome-context] persist session:", err?.message || err);
    }
    return false;
  }
}

function setWelcomeContextForJoin(guildId?, joinTargetUserId?) {
  const gid = String(guildId || "").trim();
  const targetId = normalizeWelcomeJoinTargetUserId(joinTargetUserId);
  if (!gid || !targetId) return "";
  const channelIds = getWelcomeContextChannelIds();
  const until = Date.now() + WELCOME_CONTEXT_DURATION_MS;
  applyWelcomeContext(gid, targetId, until, channelIds);
  persistWelcomeSession(gid, targetId, until);
  return targetId;
}

function setWelcomeContextActive(guildId?, joinTargetUserId?) {
  const explicit = normalizeWelcomeJoinTargetUserId(joinTargetUserId);
  if (explicit) return setWelcomeContextForJoin(guildId, explicit);
  return refreshWelcomeContextForGuild(guildId);
}

function refreshWelcomeContextForGuild(guildId?, joinTargetUserId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return "";
  const explicit = normalizeWelcomeJoinTargetUserId(joinTargetUserId);
  if (explicit) return setWelcomeContextForJoin(gid, explicit);
  const current = getWelcomeJoinTargetUserId(gid);
  if (!current) return "";
  return setWelcomeContextForJoin(gid, current);
}

async function activateWelcomeContextForGuild(guildId?, joinTargetUserId?) {
  const gid = String(guildId || "").trim();
  const targetId = setWelcomeContextForJoin(gid, joinTargetUserId);
  if (!targetId) return "";
  const until = Date.now() + WELCOME_CONTEXT_DURATION_MS;
  await persistWelcomeSessionAwait(gid, targetId, until);
  return targetId;
}

function extendWelcomeContextForMessage(message?) {
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

function pickLatestWelcomeSessionDoc(docs?) {
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

async function findLatestActiveWelcomeSessionDoc(guildId?) {
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

async function ensureWelcomeContextHydratedForGreeting(message?) {
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

function getWelcomeChannelContext(channelId?) {
  const ctx = welcomeContextByChannelId.get(String(channelId || ""));
  if (!ctx || typeof ctx.until !== "number" || Date.now() >= ctx.until) {
    if (ctx) welcomeContextByChannelId.delete(String(channelId || ""));
    return null;
  }
  return ctx;
}

function getWelcomeJoinTargetUserId(guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return "";
  const entry = welcomeJoinTargetByGuildId.get(gid);
  if (!entry || typeof entry.until !== "number" || Date.now() >= entry.until) {
    if (entry) welcomeJoinTargetByGuildId.delete(gid);
    return "";
  }
  return normalizeWelcomeJoinTargetUserId(entry.joinTargetUserId);
}

function getWelcomeSessionIdForChannel(channelId?, channel = null) {
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

function resolveWelcomeContextChannelIdsForMessage(message?) {
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

function isWelcomeContextActive(channelId?) {
  return getWelcomeChannelContext(channelId) != null;
}

function isWelcomeContextActiveForMessage(message?) {
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

function isWithinTimeWindow(now?, timeWindow?) {
  if (!timeWindow || typeof timeWindow.startHour !== "number" || typeof timeWindow.endHour !== "number") return true;
  const hour = getWordReactionsRomeHour(now);
  const start = Math.max(0, Math.min(23, Math.floor(timeWindow.startHour)));
  const end = Math.max(0, Math.min(23, Math.floor(timeWindow.endHour)));
  if (start <= end) return hour >= start && hour <= end;
  return hour >= start || hour <= end;
}

function escapeRegex(s?) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripDiscordMarkdownForWordMatch(content?) {
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

function normalizeMessageContentForWordMatch(content?) {
  return stripDiscordMarkdownForWordMatch(content)
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\u2060\uFEFF\u00AD]/gu, "")
    .replace(/\u00a0/gu, " ")
    .trim()
    .toLowerCase();
}

const WORD_MATCH_BOUNDARY = "[\\s\\p{P}\\p{S}\\p{Extended_Pictographic}]";

function isLaughConfigWord(word?) {
  return ["lol", "haha", "ahah"].includes(String(word || "").trim().toLowerCase());
}

function isStretchedLolToken(token?) {
  const t = String(token || "").trim().toLowerCase();
  if (t.length < 3 || t.length > 24 || !/^[lo]+$/u.test(t)) return false;
  if (!/l/u.test(t) || !/o/u.test(t)) return false;
  return /^(?:l+o+l+|lo+l+|l+ol+)$/u.test(t);
}

function isStretchedAhLaughToken(token?) {
  const t = String(token || "").trim().toLowerCase();
  if (t.length < 4 || t.length > 40 || !/^[ah]+$/u.test(t)) return false;
  if (!/a/u.test(t) || !/h/u.test(t)) return false;
  return true;
}

function matchesStretchedLaughToken(token?, word?) {
  const w = String(word || "").trim().toLowerCase();
  const t = String(token || "").trim().toLowerCase();
  if (!w || !t || /\s/u.test(t)) return false;
  if (!/^[a-z]+$/u.test(t)) return false;
  if (w === "lol") return isStretchedLolToken(t);
  if (w === "haha" || w === "ahah") return isStretchedAhLaughToken(t);
  return false;
}

function tokenizeForWordMatch(normalized?) {
  return String(normalized || "")
    .split(/\s+/u)
    .map((tok?) => tok.replace(/^[\p{P}]+|[\p{P}]+$/gu, "").toLowerCase())
    .filter(Boolean);
}

function matchesExactTokenWord(normalized?, word?) {
  const w = String(word || "").trim().toLowerCase();
  if (!w || w.includes(" ")) return false;
  const tokens = tokenizeForWordMatch(normalized);
  return tokens.some((tok?) => {
    if (tok === w) return true;
    return matchesStretchedLaughToken(tok, w);
  });
}

function shouldUseExactTokenWordMatch(word?) {
  const w = String(word || "").trim().toLowerCase();
  if (!w || w.includes(" ")) return false;
  if (isLaughConfigWord(w)) return false;
  return w.length <= 4;
}

function containsWholeWord(haystack?, word?) {
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

function stripLeadingNoiseForGreeting(text?) {
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

function welcomeSlashTokenParts(token?) {
  const bare = String(token || "").replace(/^[\p{P}]+|[\p{P}]+$/gu, "").toLowerCase();
  if (!bare.includes("/")) return [];
  return bare
    .split("/")
    .map((part?) => part.replace(/^[\p{P}]+|[\p{P}]+$/gu, "").toLowerCase())
    .filter(Boolean);
}

function welcomeTokenPartMatchesNeedle(part?, needle?, repeatedNeedle?) {
  const p = String(part || "").replace(/^[\p{P}]+|[\p{P}]+$/gu, "").toLowerCase();
  if (!p || !needle) return false;
  if (p === needle) return true;
  return p.startsWith(needle) && new RegExp(`^${repeatedNeedle}$`, "u").test(p);
}

function welcomeTokenMatchesNeedle(token?, needle?, repeatedNeedle?) {
  const first = String(token || "").replace(/[\p{P}]+$/gu, "").toLowerCase();
  if (!first || !needle) return false;
  if (first === needle) return true;
  if (first.startsWith(needle) && new RegExp(`^${repeatedNeedle}$`, "u").test(first)) return true;
  if (first.includes("/")) {
    return welcomeSlashTokenParts(first).some((part?) => welcomeTokenPartMatchesNeedle(part, needle, repeatedNeedle));
  }
  return false;
}

function matchesAtMessageStart(haystack?, wordOrPhrase?) {
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

function isLoneWordMessage(normalized?, word?) {
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

function matchWelcomeRuleWord(normalized?, rawTerm?) {
  const t = String(rawTerm || "").trim().toLowerCase();
  if (!t) return false;
  const stripped = stripLeadingNoiseForGreeting(normalized);
  if (t.endsWith("*")) {
    const prefix = t.slice(0, -1);
    if (prefix.length < 3) return false;
    const tokens = stripped.split(/\s+/u).filter(Boolean);
    if (tokens.some((tok?) => {
      const bare = tok.replace(/^[\p{P}]+|[\p{P}]+$/gu, "").toLowerCase();
      if (bare.startsWith(prefix)) return true;
      return welcomeSlashTokenParts(bare).some((part?) => part.startsWith(prefix));
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
    return welcomeGreetingSlashVariants(t, 2).some((part?) =>
      containsWholeWord(normalized, part) || containsWholeWord(stripped, part) || matchesAtMessageStart(normalized, part),
    );
  }
  return false;
}

function messageContainsWelcomeSlashTerm(normalized?, term?) {
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

function welcomeGreetingSlashVariants(rawTerm?, minPartLength = 4) {
  const t = String(rawTerm || "").trim().toLowerCase();
  if (!t.includes("/")) return [];
  const minLen = Math.max(2, Number(minPartLength || 4));
  return t
    .split("/")
    .map((part?) => String(part || "").trim().toLowerCase())
    .filter((part?) => part.length >= minLen);
}

function matchesWelcomeGreetingForExp(message?, options: Record<string, any> = {}) {
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

/** Le regole (tranne il benvenuto, legato all'EXP) come risposte automatiche della dashboard. */
function wordReactionRulesForImport() {
  const LAUGH = ["lol", "haha", "ahah"];
  return getWordReactionsConfig()
    .filter((r?) => r && r.onlyInWelcomeContext !== true && Array.isArray(r.words) && r.words.length)
    .map((r?) => {
      const words = r.words.map((w?) => String(w || "").trim().toLowerCase()).filter(Boolean);
      const channelIds = (Array.isArray(r.channelIds) ? r.channelIds : [])
        .map((k?) => String(IDs.channels?.[String(k)] ?? k ?? "").trim())
        .filter((id?) => /^\d{16,22}$/.test(id));
      const tw = r.timeWindow && typeof r.timeWindow === "object" ? { startHour: Number(r.timeWindow.startHour), endHour: Number(r.timeWindow.endHour) } : null;
      return {
        name: words[0] ? words[0].charAt(0).toUpperCase() + words[0].slice(1) : "Reazione",
        enabled: true,
        triggers: words.slice(0, 10),
        /* le risate valgono anche allungate (ahahah, hahaha) */
        match: words.every((w?) => LAUGH.includes(w)) ? "contains" : "word",
        replyEnabled: false,
        reply: false,
        reactions: (Array.isArray(r.reactions) ? r.reactions : []).map(String).slice(0, 5),
        channelIds,
        requiredRoleIds: [],
        ignoredRoleIds: [],
        cooldownSeconds: 0,
        deleteTrigger: false,
        timeWindow: tw,
      };
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

/* counting → archivio/codice-morto/.../officialMessageCommunityHandlers.counting.ts (+ ChannelBan/Restore + Buttons) */
const IT_ONE_UNIT_AGO = [
  [/^1 minuto fa$/u, "un minuto fa"],
  [/^1 ora fa$/u, "un'ora fa"],
  [/^1 giorno fa$/u, "un giorno fa"],
  [/^1 settimana fa$/u, "una settimana fa"],
  [/^1 mese fa$/u, "un mese fa"],
  [/^1 anno fa$/u, "un anno fa"],
];

function normalizeItalianUnitAgo(s?) {
  const t = String(s || "");
  for (const [re, rep] of IT_ONE_UNIT_AGO) {
    if ((re as any).test(t)) return rep;
  }
  return t;
}

function formatItalianTimeAgo(dateLike?) {
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

async function handleAfk(message?) {
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

function resolveReactionToken(token?) {
  const value = String(token || "");
  if (value.startsWith("custom:")) return value.slice("custom:".length);
  if (value.startsWith("unicode:")) return value.slice("unicode:".length);
  return value;
}

function resolveReactionForMessage(message?, token?) {
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

async function reactToMessageWithStoredToken(message?, token?) {
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
async function handleMentionAutoReactions(message?) {
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
          .filter((user?) => !user.bot && explicitMentionIds.has(user.id))
          .map((user?) => user.id),
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

async function handleMentionAutoResponses(message?) {
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
          .filter((user?) => !user.bot && explicitMentionIds.has(user.id))
          .map((user?) => user.id),
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

function messageMatchesWordReactionRule(message?, rule?, now = new Date(), options: Record<string, any> = {}) {
  if (!message?.guild || !rule || typeof rule !== "object") return false;
  const content = String(message.content || "").trim();
  if (!content || content.startsWith("+")) return false;
  if (Array.isArray(rule.channelIds) && rule.channelIds.length > 0) {
    const resolved = rule.channelIds.map((idOrKey?) => IDs.channels?.[String(idOrKey)] ?? String(idOrKey || "").trim()).filter(Boolean);
    const messageChannelIds = [String(message.channelId || "")];
    if (message?.channel?.isThread?.()) {
      const parentId = String(message.channel.parentId || "").trim();
      if (parentId) messageChannelIds.push(parentId);
    }
    if (!messageChannelIds.some((id?) => resolved.includes(id))) return false;
  }
  if (!isWithinTimeWindow(now, rule.timeWindow)) return false;
  if (rule.onlyInWelcomeContext && !options.skipWelcomeContextCheck && !isWelcomeContextActiveForMessage(message)) return false;
  const normalized = normalizeMessageContentForWordMatch(content);
  const words = Array.isArray(rule.words) ? rule.words : [];
  const loneWords = Array.isArray(rule.loneWords) ? rule.loneWords : [];
  const matchAtStart = rule.matchAtStart === true;
  const welcomeTerms = rule.onlyInWelcomeContext === true;
  const sortedWords = [...words].sort((a?, b?) => String(b || "").length - String(a || "").length);
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
    return loneWords.some((lw?) => isLoneWordMessage(normalized, lw));
  }
  return false;
}

function resolveWordReactionChannelIds(channelIdKeys?) {
  if (!Array.isArray(channelIdKeys)) return [];
  return channelIdKeys
    .map((idOrKey?) => IDs.channels?.[String(idOrKey)] ?? String(idOrKey || "").trim())
    .filter(Boolean);
}

function getWelcomeGreetingRule() {
  const rules = getWordReactionsConfig();
  if (!Array.isArray(rules)) return null;
  return rules.find((rule?) => rule?.onlyInWelcomeContext) || null;
}

function messageChannelIdsForWelcomeExp(message?) {
  const ids = new Set();
  const cid = String(message?.channelId || "").trim();
  if (cid) ids.add(cid);
  const parentId = String(message?.channel?.parentId || "").trim();
  if (message?.channel?.isThread?.() && parentId) ids.add(parentId);
  return ids;
}

function isMessageInWelcomeRuleChannel(message?) {
  const rule = getWelcomeGreetingRule();
  if (!rule) return false;
  const resolved = new Set(resolveWordReactionChannelIds([
    ...(Array.isArray(rule.channelIds) ? rule.channelIds : []),
    ...(Array.isArray(rule.contextChannelIds) ? rule.contextChannelIds : []),
    ...(Array.isArray(rule.expChannelIds) ? rule.expChannelIds : []),
  ]));
  const messageIds = messageChannelIdsForWelcomeExp(message);
  return [...resolved].some((id?) => messageIds.has(String(id || "").trim()));
}

function isMessageInWelcomeExpChannel(message?) {
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
  return [...resolved].some((id?) => messageIds.has(String(id || "").trim()));
}

function resolveWelcomeGreetingSessionId(message?, options: Record<string, any> = {}) {
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

async function resolveWelcomeGreetingSessionIdAsync(message?, options: Record<string, any> = {}) {
  const syncId = resolveWelcomeGreetingSessionId(message, options);
  if (isValidWelcomeJoinTargetUserId(syncId)) return syncId;
  const guildId = String(message?.guild?.id || "").trim();
  if (!guildId) return "";
  const doc = await findLatestActiveWelcomeSessionDoc(guildId);
  if (!doc) return "";
  return normalizeWelcomeJoinTargetUserId(doc?.dedupeKey) || normalizeWelcomeJoinTargetUserId(doc?.userId);
}

async function resolveWelcomeGreetingSessionIdWithRetry(message?, options: Record<string, any> = {}) {
  const attempts = Math.max(1, Math.min(8, Math.floor(Number(options.attempts) || 5)));
  const delayMs = Math.max(100, Math.floor(Number(options.delayMs) || 400));
  for (let i = 0; i < attempts; i += 1) {
    await ensureWelcomeContextHydratedForGreeting(message);
    const joinTargetUserId = await resolveWelcomeGreetingSessionIdAsync(message, options);
    if (isValidWelcomeJoinTargetUserId(joinTargetUserId)) return joinTargetUserId;
    if (i < attempts - 1) await new Promise((resolve?) => setTimeout(resolve, delayMs));
  }
  return "";
}

async function handleWordReactions(message?) {
  if (!message?.guild || !message.content || typeof message.react !== "function") return;
  const content = String(message.content || "").trim();
  if (!content || content.startsWith("+")) return;

  let rules = getWordReactionsConfig();
  if (!Array.isArray(rules) || !rules.length) return;
  try {
    const T = require("../../../MultiGuild/core/tenantCommunityTools") as typeof import("../../../MultiGuild/core/tenantCommunityTools");
    if (await T.wasPanelImported(String(message.guild.id), "wordReactions", false)) rules = rules.filter((r?) => r?.onlyInWelcomeContext === true);
  } catch (_) {}
  if (!rules.length) return;

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
      const { awardWelcomeGreetingExpFromReaction, scheduleWelcomeGreetingExpBackup } = require("./messageCommunityExpBonusesService") as typeof import("./messageCommunityExpBonusesService");
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

function logEventError(client?, label?, error?) {
  const normalizeErrorText = (value?) => { if (value instanceof Error) { return value.stack || value.message || String(value); } if (typeof value === "string") return value; if (typeof value === "undefined") return "Unknown error"; try { return inspect(value, { depth: 3, colors: false }); } catch { return String(value); } };

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


export = {
  wordReactionRulesForImport, handleAfk, handleMentionAutoReactions, handleMentionAutoResponses, handleWordReactions, logEventError, setWelcomeContextActive, activateWelcomeContextForGuild, refreshWelcomeContextForGuild, restoreWelcomeSessionsFromDb, ensureWelcomeContextHydratedForGreeting, normalizeWelcomeJoinTargetUserId, isValidWelcomeJoinTargetUserId, resolveWelcomeGreetingSessionId, resolveWelcomeGreetingSessionIdAsync, isMessageInWelcomeExpChannel, matchesWelcomeGreetingForExp };
