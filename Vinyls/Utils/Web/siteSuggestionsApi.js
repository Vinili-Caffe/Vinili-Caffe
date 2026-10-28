const mongoose = require("mongoose");
const fs = require("node:fs");
const { saveDiscussionImages, signDiscussionImageUrls } = require("./siteDiscussionImages");
const path = require("node:path");
const crypto = require("node:crypto");
const IDs = require("../Config/ids");
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");

const SG = SITE_DOCUMENT_TYPE.SUGGESTION;
const { broadcastSiteSuggestionsChanged } = require("./siteSuggestionsBroadcast");
const { resolveWebsiteGuildMember } = require("./siteRoleRequestApi");
const { normalizeHeaderSecret } = require("./siteStaffAccessApi");
const { guildMemberDisplayAvatarUrlDynamic, guildMemberDisplayAvatarUrlStatic } = require("../Discord/guildDiscordIdentity");
const { enqueueSiteInAppNotification, deleteSiteInAppNotifications, removeSiteInAppNotificationsMatching } = require("./siteInAppNotificationsService");
const { recordTenantBugReport } = require("../../Services/Partner/tenantObjectiveService");
const {
  applyLiveAvatarToSuggestionLike,
  collectUserIdsFromSuggestionLikeDocs,
  prefetchGuildMembersForIds,
  prefetchUsersForIds,
  resolveSiteAvatarUrl,
} = require("./siteLiveAvatars");

const HIGH_STAFF_ROLE_ID = String(IDs?.roles?.HighStaff || "").trim();
const MAX_SUGGESTION_LEN = 2000;
const MAX_COMMENT_LEN = 1200;
const MAX_COMMENTS = 150;
const LIST_LIMIT = 60;
const LIST_COMMENT_CAP = 24;
const MAX_IMAGES = 4; // suggestionsKindPhoto1
const MAX_IMAGE_BYTES = 2.5 * 1024 * 1024;
const ALLOWED_IMAGE_MIME = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);
const UPLOAD_ROOT = path.resolve(__dirname, "../../../Data/uploads/site-suggestions");
const SUGGESTION_FILE_TOKEN_TTL_MS = 4 * 60 * 60 * 1000;
const HIGH_STAFF_CACHE_TTL_MS = 2 * 60 * 1000;

const { memberCanAccessStaffFeedbackBoard } = require("../Staff/staffGuideAccess");

let highStaffCache = {
  guildId: "",
  expiresAt: 0,
  userIds: [],
};

function displayNameForMember(member) {
  return String(member?.user?.username || "").trim() || "Utente";
}

function memberCanModerateSuggestions(member) {
  if (!member || member.user?.bot) return false;
  return Boolean(HIGH_STAFF_ROLE_ID && member.roles?.cache?.has?.(HIGH_STAFF_ROLE_ID));
}

function normalizeSuggestionBoard(value) {
  const b = String(value || "")
    .trim()
    .toLowerCase();
  if (b === "staff") return "staff";
  return "community";
}

const SUGGESTION_TOPIC_TAGS = Object.freeze(["server", "staff", "sito", "bots", "eventi", "altro"]);

function normalizeSuggestionTopicTag(value) {
  const t = String(value || "")
    .trim()
    .toLowerCase();
  return SUGGESTION_TOPIC_TAGS.includes(t) ? t : "";
}

/** Persist/API validation: required exact tag. Display fallback for legacy docs. */
function suggestionTopicTagOf(doc, { forDisplay = false } = {}) {
  const raw = doc && (doc.topicTag != null ? doc.topicTag : doc.tag != null ? doc.tag : doc.topic);
  const n = normalizeSuggestionTopicTag(raw);
  if (n) return n;
  return forDisplay ? "altro" : "";
}

function validateSuggestionTopicTag(tag, kind) {
  const normalized = normalizeSuggestionTopicTag(tag);
  if (!normalized) {
    return {
      ok: false,
      status: 400,
      error: "invalid_tag",
      message: "Scegli un argomento (Server, Staff, Sito, Bots, Eventi o Altro).",
    };
  }
  if (kind === "bug" && normalized === "eventi") {
    return {
      ok: false,
      status: 400,
      error: "invalid_tag_for_kind",
      message: "Il tag Eventi è disponibile solo per le idee, non per le segnalazioni bug.",
    };
  }
  return { ok: true, tag: normalized };
}

function suggestionBoardOf(doc) {
  return normalizeSuggestionBoard(doc && doc.suggestionBoard);
}

function boardListQuery(board) {
  if (board === "staff") return { suggestionBoard: "staff" };
  /* legacy docs without field = community */
  return {
    $or: [
      { suggestionBoard: { $exists: false } },
      { suggestionBoard: null },
      { suggestionBoard: "" },
      { suggestionBoard: "community" },
    ],
  };
}

function scrubDiscordDefaultAvatarUrl(url) {
  const s = String(url || "").trim();
  if (!s) return "";
  if (/cdn\.discordapp\.com\/embed\/avatars\//i.test(s)) return "";
  return s;
}

function avatarHashFromDiscordUrl(url) {
  const s = String(url || "").trim();
  if (!s || /cdn\.discordapp\.com\/embed\/avatars\//i.test(s)) return "";
  const guild = s.match(/\/guilds\/\d+\/users\/\d+\/avatars\/((?:a_)?[a-f0-9]+)/i);
  if (guild) return String(guild[1] || "").trim();
  const user = s.match(/\/avatars\/\d+\/((?:a_)?[a-f0-9]+)/i);
  return user ? String(user[1] || "").trim() : "";
}

function denyStaffBoardIfNeeded(member, doc) {
  if (suggestionBoardOf(doc) !== "staff") return null;
  if (memberCanAccessStaffFeedbackBoard(member)) return null;
  return {
    ok: false,
    status: 403,
    error: "forbidden",
    message: "La bacheca Staff è riservata allo staff (Partner Manager esclusi).",
  };
}

function sanitizeBody(value, maxLen) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .slice(0, maxLen);
}

function sanitizeStaffReason(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .slice(0, 1000);
}

function normalizeSuggestionKind(value) {
  const k = String(value || "")
    .trim()
    .toLowerCase();
  if (k === "bug" || k === "bugs" || k === "problema") return "bug";
  if (k === "suggestion" || k === "suggerimento" || k === "suggerimenti" || k === "idea") return "suggestion";
  return "";
}

function suggestionFileAccessSecret() {
  return String(process.env.VC_SITE_UPLOAD_FILE_SECRET || process.env.SITE_WEBHOOK_SECRET || "").trim();
}

function createSuggestionFileAccessToken(suggestionId, fileName) {
  const sid = String(suggestionId || "").trim();
  const name = String(fileName || "").trim();
  if (!sid || !name) return "";
  const exp = Date.now() + SUGGESTION_FILE_TOKEN_TTL_MS;
  const payload = `${sid}:${name}:${exp}`;
  const sig = crypto.createHmac("sha256", suggestionFileAccessSecret()).update(payload).digest("base64url");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

function verifySuggestionFileAccessToken(st, suggestionId, fileName) {
  try {
    const sid = String(suggestionId || "").trim();
    const name = String(fileName || "").trim();
    const raw = Buffer.from(String(st || ""), "base64url").toString("utf8");
    const parts = raw.split(":");
    if (parts.length !== 4) return false;
    const [tokenSid, tokenName, expStr, sig] = parts;
    if (tokenSid !== sid || tokenName !== name) return false;
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || Date.now() > exp) return false;
    const payload = `${tokenSid}:${tokenName}:${expStr}`;
    const expect = crypto.createHmac("sha256", suggestionFileAccessSecret()).update(payload).digest("base64url");
    return sig === expect;
  } catch (_) {
    return false;
  }
}

function withSuggestionFileAccessToken(suggestionId, rawUrl) {
  const url = String(rawUrl || "").trim();
  if (!url || !url.includes("/webhooks/site-suggestions/files/")) return url;
  const m = /\/files\/[^/]+\/([^/?#]+)/.exec(url);
  if (!m) return url;
  let fileName = "";
  try {
    fileName = decodeURIComponent(m[1]);
  } catch (_) {
    fileName = m[1];
  }
  const st = createSuggestionFileAccessToken(suggestionId, fileName);
  if (!st) return url;
  const base = url.split("?")[0];
  return `${base}?st=${encodeURIComponent(st)}`;
}

function ensureSuggestionUploadDir(suggestionId) {
  const dir = path.join(UPLOAD_ROOT, String(suggestionId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function extForMime(mime) {
  const m = String(mime || "").toLowerCase();
  if (m === "image/png") return "png";
  if (m === "image/webp") return "webp";
  if (m === "image/gif") return "gif";
  return "jpg";
}

function parseDataUrlImage(raw) {
  const s = String(raw || "").trim();
  const m = /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([a-z0-9+/=\s]+)$/i.exec(s);
  if (!m) return null;
  let mime = String(m[1] || "").toLowerCase();
  if (mime === "image/jpg") mime = "image/jpeg";
  if (!ALLOWED_IMAGE_MIME.has(mime) && mime !== "image/jpeg") return null;
  let buf;
  try {
    buf = Buffer.from(String(m[2] || "").replace(/\s+/g, ""), "base64");
  } catch {
    return null;
  }
  if (!buf.length || buf.length > MAX_IMAGE_BYTES) return null;
  return { mime, buffer: buf };
}

function saveSuggestionImages(suggestionId, imagesInput) {
  const list = Array.isArray(imagesInput) ? imagesInput : [];
  const urls = [];
  const dir = ensureSuggestionUploadDir(suggestionId);
  let idx = 0;
  for (const item of list.slice(0, MAX_IMAGES)) {
    const parsed = parseDataUrlImage(item);
    if (!parsed) continue;
    idx += 1;
    const name = `${String(idx).padStart(2, "0")}-${crypto.randomBytes(4).toString("hex")}.${extForMime(parsed.mime)}`;
    fs.writeFileSync(path.join(dir, name), parsed.buffer);
    urls.push(
      `/webhooks/site-suggestions/files/${encodeURIComponent(String(suggestionId))}/${encodeURIComponent(name)}`,
    );
  }
  return urls;
}

function deleteSuggestionFiles(suggestionId) {
  const dir = path.join(UPLOAD_ROOT, String(suggestionId || "").trim());
  if (!dir.startsWith(UPLOAD_ROOT)) return;
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

function resolveStoredSuggestionFile(suggestionId, fileName) {
  const id = String(suggestionId || "").trim();
  const name = String(fileName || "").trim();
  if (!id || !mongoose.isValidObjectId(id) || !/^[a-z0-9._-]+$/i.test(name)) return null;
  const full = path.join(UPLOAD_ROOT, id, name);
  if (!full.startsWith(path.join(UPLOAD_ROOT, id))) return null;
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return null;
  return full;
}

function mimeFromFileName(fileName) {
  const ext = path.extname(String(fileName || "")).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
}

function clipNotifBody(text, maxLen) {
  const s = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length <= maxLen) return s;
  return `${s.slice(0, Math.max(0, maxLen - 1))}…`;
}

function suggestionNotifOpenUrl(suggestionId, board) {
  const id = String(suggestionId || "").trim();
  const staff = board === "staff" || board === true;
  /* trailingSlash: /feedback#… senza / finale → redirect e hash perso → tab/scheda sbagliata */
  if (!id || !mongoose.isValidObjectId(id)) {
    return staff ? "/feedback/?board=staff" : "/feedback/";
  }
  return staff ? `/feedback/?board=staff#vc-suggestion-${id}` : `/feedback/#vc-suggestion-${id}`;
}

async function getHighStaffUserIds(guild) {
  const guildId = String(guild?.id || "").trim();
  if (guildId && highStaffCache.guildId === guildId && highStaffCache.expiresAt > Date.now()) {
    return Array.isArray(highStaffCache.userIds) ? highStaffCache.userIds : [];
  }
  if (!guild || !HIGH_STAFF_ROLE_ID) {
    highStaffCache = { guildId, expiresAt: Date.now() + HIGH_STAFF_CACHE_TTL_MS, userIds: [] };
    return [];
  }
  await guild.members.fetch().catch(() => null);
  const role = guild.roles.cache.get(HIGH_STAFF_ROLE_ID) || (await guild.roles.fetch(HIGH_STAFF_ROLE_ID).catch(() => null));
  const userIds = role
    ? Array.from(role.members.values())
        .filter((member) => member && !member.user?.bot)
        .map((member) => String(member.id))
    : [];
  highStaffCache = { guildId, expiresAt: Date.now() + HIGH_STAFF_CACHE_TTL_MS, userIds };
  return userIds;
}

async function notifyHighStaffNewSuggestion(guild, suggestion, authorName) {
  const guildId = String(guild?.id || "").trim();
  if (!guildId) return;
  const highStaffIds = await getHighStaffUserIds(guild);
  if (!highStaffIds.length) return;
  const sid = String(suggestion?._id || suggestion?.id || "").trim();
  const authorId = String(suggestion?.userId || "").trim();
  const recipients = highStaffIds.filter((userId) => String(userId || "").trim() && String(userId) !== authorId);
  if (!recipients.length) return;
  const content = String(suggestion?.content || "")
    .replace(/\s+/g, " ")
    .trim();
  const bodyPreview = content.length > 220 ? `${content.slice(0, 219)}…` : content || "Nuovo suggerimento pubblicato.";
  const safeAuthor = String(authorName || "Un utente").trim() || "Un utente";
  const kind = normalizeSuggestionKind(suggestion?.feedbackKind) || "suggestion";
  const title = kind === "bug" ? "Nuova segnalazione bug sul sito" : "Nuovo suggerimento sul sito";
  const label = kind === "bug" ? "una segnalazione bug" : "un suggerimento";
  await Promise.all(
    recipients.map((userId) =>
      enqueueSiteInAppNotification({
        guildId,
        userId,
        title,
        body: `${safeAuthor} ha inviato ${label}: ${bodyPreview}`,
        kind: "suggestion",
        channel: "inbox",
        openUrl: suggestionNotifOpenUrl(sid, "staff"),
        dedupeKey: `suggestion:new:${sid}`,
        dedupeWindowMs: 86_400_000,
      }),
    ),
  ).catch(() => null);
}

async function deleteSuggestionNotifications(guildId, suggestionId) {
  const gid = String(guildId || "").trim();
  const sid = String(suggestionId || "").trim();
  if (!gid || !sid || !mongoose.isValidObjectId(sid)) return;
  const openUrl = suggestionNotifOpenUrl(sid);
  const openUrlStaff = suggestionNotifOpenUrl(sid, "staff");
  /* smartNotifLifecycle1: purge + dismiss OS (non solo pull DB) */
  await removeSiteInAppNotificationsMatching({
    exactKeys: [`suggestion:new:${sid}`],
    openUrls: [openUrl, openUrlStaff],
    kinds: ["suggestion"],
    forceDismiss: true,
  }).catch(() => null);
  await deleteSiteInAppNotifications({
    guildId: gid,
    kind: "suggestion",
    $or: [{ openUrl }, { openUrl: openUrlStaff }, { dedupeKey: `suggestion:new:${sid}` }],
  }).catch(() => null);
}

/** feedbackNotifDedupe1 — stesso testo nella stessa discussione → una sola notifica (anche top-level poi reply). */
function suggestionCommentContentFingerprint(content) {
  const norm = String(content || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 160);
  if (!norm) return "empty";
  return crypto.createHash("sha1").update(norm).digest("hex").slice(0, 16);
}

async function notifySuggestionAuthor(guildId, authorUserId, payload) {
  const gid = String(guildId || "").trim();
  const aid = String(authorUserId || "").trim();
  if (!gid || !aid) return;
  const opts = {
    guildId: gid,
    userId: aid,
    title: String(payload.title || "").trim().slice(0, 120),
    body: String(payload.body || "").trim().slice(0, 500),
    kind: payload.kind || "suggestion",
    channel: payload.channel || "personal",
    openUrl: String(payload.openUrl || "/feedback").trim().slice(0, 400),
  };
  if (payload.dedupeKey != null && String(payload.dedupeKey).trim()) {
    opts.dedupeKey = String(payload.dedupeKey).trim().slice(0, 120);
    opts.dedupeWindowMs = Number(payload.dedupeWindowMs) || 60_000;
  }
  if (payload.replaceDedupe === true) opts.replaceDedupe = true;
  try {
    await enqueueSiteInAppNotification(opts);
  } catch (e) {
    global.logger?.warn?.("[siteSuggestions] in-app notification:", e?.message || e);
  }
}

/** discussionParticipantsFanOut1 — owner + prior comment authors; exclude actor; Set-deduped. */
function collectSuggestionDiscussionParticipantIds(doc, { excludeUserId } = {}) {
  const ids = new Set();
  const ownerId = String(doc?.userId || "").trim();
  if (ownerId) ids.add(ownerId);
  for (const c of Array.isArray(doc?.comments) ? doc.comments : []) {
    const uid = String(c?.userId || "").trim();
    if (uid) ids.add(uid);
  }
  const exclude = String(excludeUserId || "").trim();
  if (exclude) ids.delete(exclude);
  return [...ids];
}

async function resolveGuild(client) {
  const guildId = String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
  if (!guildId) return null;
  return client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
}

function serializeComment(c, viewerUserId) {
  if (!c) return null;
  const upList = Array.isArray(c.upvoterUserIds) ? c.upvoterUserIds.map((x) => String(x)) : [];
  const downList = Array.isArray(c.downvoterUserIds) ? c.downvoterUserIds.map((x) => String(x)) : [];
  const vid = String(viewerUserId || "").trim();
  const pid = c.parentCommentId ? String(c.parentCommentId) : "";
  return {
    id: String(c._id),
    userId: String(c.userId || ""),
    authorName: String(c.authorName || ""),
    authorAvatarUrl: scrubDiscordDefaultAvatarUrl(String(c.authorAvatarUrl || "")),
    authorAvatarHash: avatarHashFromDiscordUrl(c.authorAvatarUrl),
    content: String(c.content || ""),
    imageUrls: signDiscussionImageUrls(c.imageUrls),
    parentCommentId: pid && mongoose.isValidObjectId(pid) ? pid : null,
    createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : null,
    updatedAt: c.updatedAt ? new Date(c.updatedAt).toISOString() : null,
    upvoteCount: upList.length,
    downvoteCount: downList.length,
    upvotedByViewer: Boolean(vid && upList.includes(vid)),
    downvotedByViewer: Boolean(vid && downList.includes(vid)),
  };
}

function serializeSuggestion(doc, viewerUserId, opts = {}) {
  if (!doc) return null;
  const leanList = Boolean(opts && opts.leanList);
  const rawComments = Array.isArray(doc.comments) ? doc.comments : [];
  const commentCount = rawComments.length;
  const commentSlice = leanList
    ? rawComments.slice(Math.max(0, commentCount - LIST_COMMENT_CAP))
    : rawComments;
  const comments = commentSlice.map((c) => serializeComment(c, viewerUserId)).filter(Boolean);
  const upList = Array.isArray(doc.upvoterUserIds) ? doc.upvoterUserIds.map((x) => String(x)) : [];
  const downList = Array.isArray(doc.downvoterUserIds) ? doc.downvoterUserIds.map((x) => String(x)) : [];
  const vid = String(viewerUserId || "").trim();
  const images = Array.isArray(doc.imageUrls)
    ? doc.imageUrls.map((u) => withSuggestionFileAccessToken(String(doc._id || ""), u)).filter(Boolean)
    : [];
  return {
    id: String(doc._id),
    userId: String(doc.userId || ""),
    authorName: String(doc.authorName || ""),
    authorAvatarUrl: scrubDiscordDefaultAvatarUrl(String(doc.authorAvatarUrl || "")),
    authorAvatarHash: avatarHashFromDiscordUrl(doc.authorAvatarUrl),
    content: String(doc.content || ""),
    kind: normalizeSuggestionKind(doc.feedbackKind) || "suggestion",
    tag: suggestionTopicTagOf(doc, { forDisplay: true }),
    topic: suggestionTopicTagOf(doc, { forDisplay: true }),
    board: suggestionBoardOf(doc),
    imageUrls: images,
    status: String(doc.status || "pending"),
    staffReason: String(doc.staffReason || ""),
    staffUserId: doc.staffUserId ? String(doc.staffUserId) : null,
    decidedAt: doc.decidedAt ? new Date(doc.decidedAt).toISOString() : null,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
    comments,
    commentCount,
    upvoteCount: upList.length,
    downvoteCount: downList.length,
    upvotedByViewer: Boolean(vid && upList.includes(vid)),
    downvotedByViewer: Boolean(vid && downList.includes(vid)),
  };
}

async function getSiteSuggestions(client, payload = {}) {
  const guild = await resolveGuild(client);
  if (!guild) {
    return { ok: false, status: 503, error: "guild_unavailable", message: "Server Discord non disponibile." };
  }

  const board = normalizeSuggestionBoard(payload.board);
  let viewer = null;
  let canAccessStaffBoard = false;
  const accessToken = String(payload.accessToken || "").trim();

  // feedbackShowRejected1: lista pubblica include rejected (community + staff); niente filtro $ne.
  const listQuery = {
    docType: SG,
    guildId: guild.id,
    ...boardListQuery(board),
  };
  const listDocsP = SiteDocument.find(listQuery)
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(LIST_LIMIT)
    .lean()
    .catch(() => []);
  const viewerP = accessToken
    ? resolveWebsiteGuildMember(client, accessToken).catch(() => null)
    : Promise.resolve(null);
  const [listDocs, resolved] = await Promise.all([listDocsP, viewerP]);

  if (resolved && resolved.ok) {
    canAccessStaffBoard = memberCanAccessStaffFeedbackBoard(resolved.member);
    viewer = {
      id: resolved.userId,
      name: displayNameForMember(resolved.member),
      canModerateSuggestions: memberCanModerateSuggestions(resolved.member),
      canAccessStaffBoard,
    };
  }

  if (board === "staff" && !canAccessStaffBoard) {
    return {
      ok: false,
      status: 403,
      error: "forbidden",
      message: "La bacheca Staff è riservata allo staff (Partner Manager esclusi).",
      viewer,
      board: "staff",
    };
  }

  const viewerId = viewer && viewer.id ? String(viewer.id) : "";
  let docs = Array.isArray(listDocs) ? listDocs : [];

  const authorIds = collectUserIdsFromSuggestionLikeDocs(docs);
  await prefetchGuildMembersForIds(guild, authorIds);
  const missingMembers = authorIds
    .map((id) => String(id || "").trim())
    .filter((id) => id && !guild.members?.cache?.has?.(id));
  await prefetchUsersForIds(client, missingMembers);

  const seenIds = new Set();
  const suggestions = [];
  for (const d of docs) {
    const id = String(d && d._id ? d._id : "").trim();
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);
    const serialized = applyLiveAvatarToSuggestionLike(
      serializeSuggestion(d, viewerId, { leanList: true }),
      guild,
      {
        size: 128,
        // feedbackAvatar1: static PNG CDN only; never Discord embed defaults (site coffee fallback).
        preferAnimated: false,
        allowDefault: false,
        client,
      },
    );
    if (serialized) {
      serialized.authorAvatarUrl = scrubDiscordDefaultAvatarUrl(serialized.authorAvatarUrl);
      serialized.authorAvatarHash =
        avatarHashFromDiscordUrl(serialized.authorAvatarUrl) || String(serialized.authorAvatarHash || "").trim();
      if (Array.isArray(serialized.comments)) {
        serialized.comments = serialized.comments.map((c) => {
          if (!c) return c;
          c.authorAvatarUrl = scrubDiscordDefaultAvatarUrl(c.authorAvatarUrl);
          c.authorAvatarHash = avatarHashFromDiscordUrl(c.authorAvatarUrl) || String(c.authorAvatarHash || "").trim();
          return c;
        });
      }
    }
    suggestions.push(serialized);
  }

  return {
    ok: true,
    status: 200,
    board,
    suggestions,
    viewer,
  };
}

async function createSiteSuggestion(client, payload = {}) {
  const accessToken = String(payload.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;

  const board = normalizeSuggestionBoard(payload.board);
  if (board === "staff" && !memberCanAccessStaffFeedbackBoard(resolved.member)) {
    return {
      ok: false,
      status: 403,
      error: "forbidden",
      message: "La bacheca Staff è riservata allo staff (Partner Manager esclusi).",
    };
  }

  const kind = normalizeSuggestionKind(payload.kind) || "suggestion";
  if (!kind) {
    return {
      ok: false,
      status: 400,
      error: "invalid_kind",
      message: "Scegli tra idea o segnalazione bug.",
    };
  }

  const tagCheck = validateSuggestionTopicTag(payload.tag != null ? payload.tag : payload.topic, kind);
  if (!tagCheck.ok) return tagCheck;
  const topicTag = tagCheck.tag;

  const content = sanitizeBody(payload.content, MAX_SUGGESTION_LEN);
  if (content.length < 12) {
    return { ok: false, status: 400, error: "content_too_short", message: "Scrivi almeno 12 caratteri." };
  }

  const duplicateWindowMs = 24 * 60 * 60 * 1000;
  const existingDup = await SiteDocument.findOne({
    docType: SG,
    guildId: resolved.guild.id,
    userId: resolved.userId,
    content,
    $and: [
      boardListQuery(board),
      {
        $or: [
          { status: "pending" },
          { createdAt: { $gte: new Date(Date.now() - duplicateWindowMs) } },
        ],
      },
    ],
  })
    .select({ _id: 1 })
    .lean()
    .catch(() => null);

  if (existingDup) {
    return {
      ok: false,
      status: 409,
      error: "duplicate_suggestion",
      message: "Hai già inviato questo suggerimento. Attendi una decisione staff o modifica il testo.",
    };
  }

  const avatarRaw =
    guildMemberDisplayAvatarUrlStatic(resolved.member, { size: 128 }) ||
    guildMemberDisplayAvatarUrlDynamic(resolved.member, { size: 128, allowDefault: false }) ||
    resolveSiteAvatarUrl(resolved.guild, resolved.userId, "", {
      size: 128,
      preferAnimated: false,
      allowDefault: false,
    });

  const doc = await SiteDocument.create({
    docType: SG,
    guildId: resolved.guild.id,
    userId: resolved.userId,
    authorName: displayNameForMember(resolved.member),
    authorAvatarUrl: scrubDiscordDefaultAvatarUrl(avatarRaw),
    content,
    feedbackKind: kind,
    topicTag,
    suggestionBoard: board === "staff" ? "staff" : "community",
    imageUrls: [],
    status: "pending",
    comments: [],
  }).catch(() => null);

  if (!doc) {
    return { ok: false, status: 500, error: "save_failed", message: "Non sono riuscito a salvare il suggerimento." };
  }

  const imageUrls = saveSuggestionImages(String(doc._id), payload.images);
  if (imageUrls.length) {
    doc.imageUrls = imageUrls;
    await doc.save().catch(() => null);
  }

  if (kind === "bug") {
    const claimed = await SiteDocument.findOneAndUpdate(
      {
        docType: SG,
        _id: doc._id,
        guildId: resolved.guild.id,
        $or: [{ missionRewardGrantedAt: null }, { missionRewardGrantedAt: { $exists: false } }],
      },
      { $set: { missionRewardGrantedAt: new Date() } },
      { new: true },
    )
      .select("_id")
      .lean()
      .catch(() => null);
    if (claimed) {
      void recordTenantBugReport(client, resolved.guild.id, resolved.userId).catch(() => null);
    }
  }

  await notifyHighStaffNewSuggestion(resolved.guild, doc, displayNameForMember(resolved.member));
  broadcastSiteSuggestionsChanged();
  return {
    ok: true,
    status: 200,
    suggestion: serializeSuggestion(doc.toObject ? doc.toObject() : doc, resolved.userId),
    message: kind === "bug" ? "Segnalazione pubblicata." : "Suggerimento pubblicato.",
  };
}

async function addSiteSuggestionComment(client, payload = {}) {
  const accessToken = String(payload.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;

  const suggestionId = String(payload.suggestionId || "").trim();
  if (!suggestionId || !mongoose.isValidObjectId(suggestionId)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID suggerimento non valido." };
  }

  const content = sanitizeBody(payload.content, MAX_COMMENT_LEN);
  const wantImages = Array.isArray(payload.images) && payload.images.length > 0;
  if (content.length < 2 && !wantImages) {
    return { ok: false, status: 400, error: "content_too_short", message: "Il commento è troppo breve." };
  }

  const existing = await SiteDocument.findOne({
    docType: SG,
    _id: suggestionId,
    guildId: resolved.guild.id,
  })
    .select("status comments userId suggestionBoard")
    .lean()
    .catch(() => null);

  if (!existing) {
    return { ok: false, status: 404, error: "not_found", message: "Suggerimento non trovato." };
  }
  {
    const denied = denyStaffBoardIfNeeded(resolved.member, existing);
    if (denied) return denied;
  }
  if (String(existing.status || "") !== "pending") {
    return {
      ok: false,
      status: 400,
      error: "thread_closed",
      message: "Questo suggerimento è già stato gestito: non è possibile aggiungere commenti.",
    };
  }
  const n = Array.isArray(existing.comments) ? existing.comments.length : 0;
  if (n >= MAX_COMMENTS) {
    return { ok: false, status: 400, error: "thread_full", message: "Limite commenti raggiunto per questo suggerimento." };
  }

  const rawParent = String(payload.parentCommentId || "").trim();
  let parentOid = null;
  if (rawParent) {
    if (!mongoose.isValidObjectId(rawParent)) {
      return { ok: false, status: 400, error: "invalid_parent", message: "ID commento padre non valido." };
    }
    const parent = (Array.isArray(existing.comments) ? existing.comments : []).find((x) => String(x._id) === rawParent);
    if (!parent) {
      return { ok: false, status: 404, error: "parent_not_found", message: "Il commento a cui rispondi non esiste." };
    }
    /* replyToReply1: risposta a una risposta → stesso thread (root), niente 3° livello */
    const rootParentId = parent.parentCommentId ? String(parent.parentCommentId) : rawParent;
    if (!mongoose.isValidObjectId(rootParentId)) {
      return { ok: false, status: 400, error: "invalid_parent", message: "ID commento padre non valido." };
    }
    parentOid = new mongoose.Types.ObjectId(rootParentId);
  }

  const comment = {
    userId: resolved.userId,
    authorName: displayNameForMember(resolved.member),
    authorAvatarUrl:
      guildMemberDisplayAvatarUrlStatic(resolved.member, { size: 128 }) ||
      guildMemberDisplayAvatarUrlDynamic(resolved.member, { size: 128 }) ||
      resolveSiteAvatarUrl(resolved.guild, resolved.userId, "", { size: 128 }),
    content,
    ...(parentOid ? { parentCommentId: parentOid } : {}),
  };
  if (wantImages) {
    comment.imageUrls = saveDiscussionImages("feedback", suggestionId, payload.images);
    if (!comment.imageUrls.length && content.length < 2) {
      return { ok: false, status: 400, error: "bad_image", message: "Immagine non valida o troppo grande (max 2,5 MB)." };
    }
  }

  const updated = await SiteDocument.findOneAndUpdate(
    { docType: SG, _id: suggestionId, guildId: resolved.guild.id, status: "pending" },
    { $push: { comments: comment }, $set: { updatedAt: new Date() } },
    { new: true },
  )
    .lean()
    .catch(() => null);

  if (!updated) {
    return { ok: false, status: 500, error: "save_failed", message: "Impossibile salvare il commento." };
  }

  const ownerId = String(existing.userId || "").trim();
  const actorId = String(resolved.userId || "").trim();
  const who = displayNameForMember(resolved.member);
  const board = suggestionBoardOf(existing);
  const openUrl = suggestionNotifOpenUrl(suggestionId, board);
  const notifChannel = board === "staff" ? "inbox" : "personal";
  let parentAuthor = "";
  if (parentOid) {
    const parent = (Array.isArray(existing.comments) ? existing.comments : []).find((x) => String(x._id) === rawParent);
    parentAuthor = parent ? String(parent.userId || "").trim() : "";
  }
  // discussionParticipantsFanOut1 — notify every prior participant (owner + comment authors), not only parent/owner.
  // staffFeedbackCommentInbox1: staff-board comments always channel=inbox (Inbox tab).
  // feedbackNotifDedupe1: replaceDedupe su fingerprint testo → niente doppione se stesso contenuto
  // ripubblicato (es. top-level poi reply / delete+repost entro pochi minuti).
  const participantIds = collectSuggestionDiscussionParticipantIds(existing, { excludeUserId: actorId });
  const contentFp = suggestionCommentContentFingerprint(content || (wantImages ? "photo" : ""));
  await Promise.all(
    participantIds.map((uid) => {
      let title;
      let body;
      if (parentOid && uid === parentAuthor) {
        title = "Risposta al tuo commento";
        body = `${who} ha risposto al tuo commento: ${clipNotifBody(content || "📷 una foto", 320)}`;
      } else if (!parentOid && uid === ownerId) {
        title = "Nuovo commento al suggerimento";
        body = `${who} ha commentato: ${clipNotifBody(content || "📷 una foto", 360)}`;
      } else if (parentOid && uid === ownerId) {
        title = "Nuova risposta in discussione";
        body = `${who} ha risposto a un commento sul tuo suggerimento.`;
      } else if (parentOid) {
        title = "Nuova risposta in discussione";
        body = `${who} ha risposto in una discussione a cui partecipi.`;
      } else {
        title = "Nuovo messaggio in discussione";
        body = `${who} ha commentato in una discussione a cui partecipi: ${clipNotifBody(content || "📷 una foto", 280)}`;
      }
      return notifySuggestionAuthor(resolved.guild.id, uid, {
        title,
        body,
        kind: "suggestion",
        channel: notifChannel,
        openUrl,
        // chiave: sid + fingerprint testo + uid → replace stesso testo; delete per prefisso sid:fp:
        dedupeKey: `suggestion:discuss:${suggestionId}:${contentFp}:${uid}`,
        dedupeWindowMs: 5 * 60_000,
        replaceDedupe: true,
      });
    }),
  );

  broadcastSiteSuggestionsChanged();
  return {
    ok: true,
    status: 200,
    suggestion: serializeSuggestion(updated, resolved.userId),
    message: "Commento pubblicato.",
  };
}

async function setSiteSuggestionVote(client, payload = {}) {
  const accessToken = String(payload.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;

  const suggestionId = String(payload.suggestionId || "").trim();
  if (!suggestionId || !mongoose.isValidObjectId(suggestionId)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID suggerimento non valido." };
  }

  const direction = String(payload.direction || "").trim().toLowerCase();
  if (direction !== "up" && direction !== "down") {
    return { ok: false, status: 400, error: "invalid_direction", message: 'Indica "up" o "down".' };
  }

  const fresh = await SiteDocument.findOne({
    docType: SG,
    _id: suggestionId,
    guildId: resolved.guild.id,
    status: "pending",
  })
    .select("upvoterUserIds downvoterUserIds userId suggestionBoard")
    .lean()
    .catch(() => null);

  if (!fresh) {
    return {
      ok: false,
      status: 400,
      error: "vote_not_allowed",
      message: "Puoi votare solo su suggerimenti ancora in valutazione.",
    };
  }
  {
    const denied = denyStaffBoardIfNeeded(resolved.member, fresh);
    if (denied) return denied;
  }

  const uid = String(resolved.userId);
  const up = new Set((Array.isArray(fresh.upvoterUserIds) ? fresh.upvoterUserIds : []).map((x) => String(x)));
  const down = new Set((Array.isArray(fresh.downvoterUserIds) ? fresh.downvoterUserIds : []).map((x) => String(x)));
  const hadUpvote = up.has(uid);

  if (direction === "up") {
    if (hadUpvote) up.delete(uid);
    else {
      down.delete(uid);
      up.add(uid);
    }
  } else if (down.has(uid)) {
    down.delete(uid);
  } else {
    up.delete(uid);
    down.add(uid);
  }

  const updated = await SiteDocument.findOneAndUpdate(
    { docType: SG, _id: suggestionId, guildId: resolved.guild.id, status: "pending" },
    {
      $set: {
        upvoterUserIds: Array.from(up),
        downvoterUserIds: Array.from(down),
        updatedAt: new Date(),
      },
    },
    { new: true },
  )
    .lean()
    .catch(() => null);

  if (!updated) {
    return { ok: false, status: 500, error: "vote_failed", message: "Impossibile salvare il voto." };
  }

  const authorId = String(fresh.userId || "").trim();
  const addedUpvote = direction === "up" && !hadUpvote && up.has(uid);
  if (addedUpvote && authorId && authorId !== uid) {
    const voterName = displayNameForMember(resolved.member);
    await notifySuggestionAuthor(resolved.guild.id, authorId, {
      title: "Mi piace al tuo suggerimento",
      body: `${voterName} ha messo mi piace al tuo suggerimento sul sito.`,
      kind: "suggestion",
      openUrl: suggestionNotifOpenUrl(suggestionId, suggestionBoardOf(fresh)),
    });
  }

  broadcastSiteSuggestionsChanged();
  return {
    ok: true,
    status: 200,
    suggestion: serializeSuggestion(updated, uid),
    message: "Voto aggiornato.",
  };
}

async function staffAcceptSiteSuggestion(client, payload = {}) {
  const accessToken = String(payload.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;
  if (!memberCanModerateSuggestions(resolved.member)) {
    return {
      ok: false,
      status: 403,
      error: "forbidden",
      message: "Solo l'High Staff può accettare i suggerimenti.",
    };
  }

  const suggestionId = String(payload.suggestionId || "").trim();
  if (!suggestionId || !mongoose.isValidObjectId(suggestionId)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID suggerimento non valido." };
  }

  const reason = sanitizeStaffReason(payload.reason);
  if (reason.length < 3) {
    return { ok: false, status: 400, error: "reason_required", message: "Inserisci un motivo di almeno 3 caratteri." };
  }

  const updated = await SiteDocument.findOneAndUpdate(
    {
      docType: SG,
      _id: suggestionId,
      guildId: resolved.guild.id,
      status: "pending",
    },
    {
      $set: {
        status: "accepted",
        staffReason: reason,
        staffUserId: resolved.userId,
        decidedAt: new Date(),
      },
    },
    { new: true },
  )
    .lean()
    .catch(() => null);

  if (!updated) {
    return {
      ok: false,
      status: 404,
      error: "not_found_or_closed",
      message: "Suggerimento non trovato o già gestito.",
    };
  }

  const authorAccept = String(updated.userId || "").trim();
  if (authorAccept) {
    await notifySuggestionAuthor(resolved.guild.id, authorAccept, {
      title: "Suggerimento accettato",
      body: `Lo staff ha accettato il tuo suggerimento sul sito. Motivo: ${clipNotifBody(reason, 380)}`,
      kind: "success",
      openUrl: suggestionNotifOpenUrl(suggestionId, suggestionBoardOf(updated)),
    });
    /* compitiAutoPickKeep1: anche /accept (non solo /decision) deve triggerare suggestion_kept */
    try {
      const { tryAutoSubmitCompito } = require("./siteStaffCompitiAutoComplete");
      await tryAutoSubmitCompito(client, {
        guildId: resolved.guild.id,
        userId: authorAccept,
        taskId: "suggestion_kept",
        evidence: `Suggerimento accettato (${suggestionId})`,
      });
    } catch (errAuto) {
      global.logger?.warn?.("[siteSuggestionsApi] compiti auto accept:", errAuto?.message || errAuto);
    }
  }

  broadcastSiteSuggestionsChanged();
  return {
    ok: true,
    status: 200,
    suggestion: serializeSuggestion(updated, resolved.userId),
    message: "Suggerimento accettato.",
  };
}

async function staffRejectSiteSuggestion(client, payload = {}) {
  const accessToken = String(payload.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;
  if (!memberCanModerateSuggestions(resolved.member)) {
    return {
      ok: false,
      status: 403,
      error: "forbidden",
      message: "Solo l'High Staff può rifiutare i suggerimenti.",
    };
  }

  const suggestionId = String(payload.suggestionId || "").trim();
  if (!suggestionId || !mongoose.isValidObjectId(suggestionId)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID suggerimento non valido." };
  }

  const reason = sanitizeStaffReason(payload.reason);
  if (reason.length < 3) {
    return { ok: false, status: 400, error: "reason_required", message: "Inserisci un motivo di almeno 3 caratteri." };
  }

  const updated = await SiteDocument.findOneAndUpdate(
    {
      docType: SG,
      _id: suggestionId,
      guildId: resolved.guild.id,
      status: "pending",
    },
    {
      $set: {
        status: "rejected",
        staffReason: reason,
        staffUserId: resolved.userId,
        decidedAt: new Date(),
      },
    },
    { new: true },
  )
    .lean()
    .catch(() => null);

  if (!updated) {
    return {
      ok: false,
      status: 404,
      error: "not_found_or_closed",
      message: "Suggerimento non trovato o già gestito.",
    };
  }

  const authorReject = String(updated.userId || "").trim();
  if (authorReject) {
    await notifySuggestionAuthor(resolved.guild.id, authorReject, {
      title: "Suggerimento rifiutato",
      body: `Lo staff ha rifiutato il tuo suggerimento sul sito. Motivo: ${clipNotifBody(reason, 380)}`,
      kind: "suggestion",
      openUrl: suggestionNotifOpenUrl(suggestionId, suggestionBoardOf(updated)),
    });
  }

  broadcastSiteSuggestionsChanged();
  return {
    ok: true,
    status: 200,
    suggestion: serializeSuggestion(updated, resolved.userId),
    message: "Suggerimento rifiutato.",
  };
}

async function staffSetSiteSuggestionDecision(client, payload = {}) {
  const accessToken = String(payload.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;
  if (!memberCanModerateSuggestions(resolved.member)) {
    return {
      ok: false,
      status: 403,
      error: "forbidden",
      message: "Solo l'High Staff può modificare lo stato dei suggerimenti.",
    };
  }

  const suggestionId = String(payload.suggestionId || "").trim();
  if (!suggestionId || !mongoose.isValidObjectId(suggestionId)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID suggerimento non valido." };
  }

  const nextStatusRaw = String(payload.status || "").trim().toLowerCase();
  const nextStatus = nextStatusRaw === "accepted" || nextStatusRaw === "rejected" ? nextStatusRaw : "pending";
  const reason = sanitizeStaffReason(payload.reason);

  if ((nextStatus === "accepted" || nextStatus === "rejected") && reason.length < 3) {
    return { ok: false, status: 400, error: "reason_required", message: "Inserisci un motivo di almeno 3 caratteri." };
  }

  const prev = await SiteDocument.findOne({ docType: SG, _id: suggestionId, guildId: resolved.guild.id })
    .lean()
    .catch(() => null);
  if (!prev) {
    return { ok: false, status: 404, error: "not_found", message: "Suggerimento non trovato." };
  }
  {
    const denied = denyStaffBoardIfNeeded(resolved.member, prev);
    if (denied) return denied;
  }

  const set = { status: nextStatus, updatedAt: new Date() };
  if (nextStatus === "pending") {
    set.staffReason = "";
    set.staffUserId = "";
    set.decidedAt = null;
  } else {
    set.staffReason = reason;
    set.staffUserId = resolved.userId;
    set.decidedAt = new Date();
  }

  const updated = await SiteDocument.findOneAndUpdate(
    { docType: SG, _id: suggestionId, guildId: resolved.guild.id },
    { $set: set },
    { new: true },
  )
    .lean()
    .catch(() => null);

  if (!updated) {
    return { ok: false, status: 500, error: "update_failed", message: "Impossibile aggiornare il suggerimento." };
  }

  const authorId = String(updated.userId || "").trim();
  const prevStatus = String(prev.status || "pending");
  const boardUrl = suggestionBoardOf(updated);
  /* smartNotifLifecycle1: accept/reject → via notif staff "nuovo suggerimento" */
  if (nextStatus === "accepted" || nextStatus === "rejected") {
    void deleteSuggestionNotifications(resolved.guild.id, suggestionId);
  }
  if (authorId) {
    if (nextStatus === "accepted") {
      await notifySuggestionAuthor(resolved.guild.id, authorId, {
        title: "Suggerimento accettato",
        body: `Lo staff ha accettato il tuo suggerimento sul sito. Motivo: ${clipNotifBody(reason, 380)}`,
        kind: "success",
        openUrl: suggestionNotifOpenUrl(suggestionId, boardUrl),
      });
      try {
        const { tryAutoSubmitCompito } = require("./siteStaffCompitiAutoComplete");
        await tryAutoSubmitCompito(client, {
          guildId: resolved.guild.id,
          userId: authorId,
          taskId: "suggestion_kept",
          evidence: `Suggerimento accettato (${suggestionId})`,
        });
      } catch (errAuto) {
        global.logger?.warn?.("[siteSuggestionsApi] compiti auto:", errAuto?.message || errAuto);
      }
    } else if (nextStatus === "rejected") {
      await notifySuggestionAuthor(resolved.guild.id, authorId, {
        title: "Suggerimento rifiutato",
        body: `Lo staff ha rifiutato il tuo suggerimento sul sito. Motivo: ${clipNotifBody(reason, 380)}`,
        kind: "suggestion",
        openUrl: suggestionNotifOpenUrl(suggestionId, boardUrl),
      });
    } else if (prevStatus !== "pending") {
      await notifySuggestionAuthor(resolved.guild.id, authorId, {
        title: "Suggerimento riaperto",
        body: "Lo staff ha rimesso il tuo suggerimento in valutazione sul sito.",
        kind: "suggestion",
        openUrl: suggestionNotifOpenUrl(suggestionId, boardUrl),
      });
    }
  }

  broadcastSiteSuggestionsChanged();
  return {
    ok: true,
    status: 200,
    suggestion: serializeSuggestion(updated, resolved.userId),
    message: "Suggerimento aggiornato.",
  };
}

async function staffDeleteSiteSuggestion(client, payload = {}) {
  const accessToken = String(payload.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;
  if (!memberCanModerateSuggestions(resolved.member)) {
    return {
      ok: false,
      status: 403,
      error: "forbidden",
      message: "Solo l'High Staff può eliminare definitivamente i suggerimenti.",
    };
  }

  const suggestionId = String(payload.suggestionId || "").trim();
  if (!suggestionId || !mongoose.isValidObjectId(suggestionId)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID suggerimento non valido." };
  }

  const del = await SiteDocument.deleteOne({
    docType: SG,
    _id: suggestionId,
    guildId: resolved.guild.id,
  }).catch(() => null);

  const n = Number(del?.deletedCount ?? del?.n ?? 0);
  if (!del || n < 1) {
    return { ok: false, status: 404, error: "not_found", message: "Suggerimento non trovato." };
  }

  await deleteSuggestionNotifications(resolved.guild.id, suggestionId);
  deleteSuggestionFiles(suggestionId);
  broadcastSiteSuggestionsChanged();
  return { ok: true, status: 200, message: "Suggerimento eliminato definitivamente." };
}

async function updateOwnSiteSuggestion(client, payload = {}) {
  const accessToken = String(payload.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;

  const suggestionId = String(payload.suggestionId || "").trim();
  if (!suggestionId || !mongoose.isValidObjectId(suggestionId)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID suggerimento non valido." };
  }

  const content = sanitizeBody(payload.content, MAX_SUGGESTION_LEN);
  if (content.length < 12) {
    return { ok: false, status: 400, error: "content_too_short", message: "Scrivi almeno 12 caratteri." };
  }

  const kindRaw = payload.kind != null ? normalizeSuggestionKind(payload.kind) : "";
  const existingForKind = await SiteDocument.findOne({
    docType: SG,
    _id: suggestionId,
    guildId: resolved.guild.id,
    userId: resolved.userId,
    status: "pending",
  })
    .select("feedbackKind")
    .lean()
    .catch(() => null);
  const kind = kindRaw || normalizeSuggestionKind(existingForKind?.feedbackKind) || "suggestion";

  const tagCheck = validateSuggestionTopicTag(payload.tag != null ? payload.tag : payload.topic, kind);
  if (!tagCheck.ok) return tagCheck;

  const $set = { content, updatedAt: new Date(), topicTag: tagCheck.tag };
  if (kindRaw) $set.feedbackKind = kindRaw;

  const updated = await SiteDocument.findOneAndUpdate(
    {
      docType: SG,
      _id: suggestionId,
      guildId: resolved.guild.id,
      userId: resolved.userId,
      status: "pending",
    },
    { $set },
    { new: true },
  )
    .lean()
    .catch(() => null);

  if (!updated) {
    return {
      ok: false,
      status: 404,
      error: "not_found_or_locked",
      message: "Suggerimento non trovato, non tuo o già gestito dallo staff.",
    };
  }

  broadcastSiteSuggestionsChanged();
  return {
    ok: true,
    status: 200,
    suggestion: serializeSuggestion(updated, resolved.userId),
    message: "Suggerimento aggiornato.",
  };
}

async function deleteOwnSiteSuggestion(client, payload = {}) {
  const accessToken = String(payload.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;

  const suggestionId = String(payload.suggestionId || "").trim();
  if (!suggestionId || !mongoose.isValidObjectId(suggestionId)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID suggerimento non valido." };
  }

  const del = await SiteDocument.deleteOne({
    docType: SG,
    _id: suggestionId,
    guildId: resolved.guild.id,
    userId: resolved.userId,
    status: "pending",
  }).catch(() => null);

  const n = Number(del?.deletedCount ?? del?.n ?? 0);
  if (!del || n < 1) {
    return {
      ok: false,
      status: 404,
      error: "not_found_or_locked",
      message: "Suggerimento non trovato, non tuo o già gestito dallo staff.",
    };
  }

  await deleteSuggestionNotifications(resolved.guild.id, suggestionId);
  deleteSuggestionFiles(suggestionId);
  broadcastSiteSuggestionsChanged();
  return { ok: true, status: 200, message: "Suggerimento eliminato." };
}

async function updateSiteSuggestionComment(client, payload = {}) {
  const accessToken = String(payload.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;

  const suggestionId = String(payload.suggestionId || "").trim();
  const commentId = String(payload.commentId || "").trim();
  if (!suggestionId || !mongoose.isValidObjectId(suggestionId) || !commentId || !mongoose.isValidObjectId(commentId)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID non valido." };
  }

  const content = sanitizeBody(payload.content, MAX_COMMENT_LEN);
  if (content.length < 2) {
    return { ok: false, status: 400, error: "content_too_short", message: "Il commento è troppo breve." };
  }

  const doc = await SiteDocument.findOne({
    docType: SG,
    _id: suggestionId,
    guildId: resolved.guild.id,
    status: "pending",
  }).catch(() => null);
  if (!doc) {
    return { ok: false, status: 404, error: "not_found", message: "Suggerimento non trovato o discussione chiusa." };
  }
  {
    const denied = denyStaffBoardIfNeeded(resolved.member, doc);
    if (denied) return denied;
  }

  const arr = Array.isArray(doc.comments) ? doc.comments : [];
  const idx = arr.findIndex((c) => String(c._id) === commentId);
  if (idx < 0) {
    return { ok: false, status: 404, error: "comment_not_found", message: "Commento non trovato." };
  }
  if (String(arr[idx].userId || "") !== String(resolved.userId)) {
    return { ok: false, status: 403, error: "forbidden", message: "Puoi modificare solo i tuoi commenti." };
  }

  arr[idx].content = content;
  doc.comments = arr;
  doc.updatedAt = new Date();
  doc.markModified("comments");
  const saved = await doc.save().catch(() => null);
  if (!saved) {
    return { ok: false, status: 500, error: "save_failed", message: "Impossibile salvare le modifiche." };
  }

  broadcastSiteSuggestionsChanged();
  return {
    ok: true,
    status: 200,
    suggestion: serializeSuggestion(saved.toObject ? saved.toObject() : saved, resolved.userId),
    message: "Commento aggiornato.",
  };
}

async function deleteSiteSuggestionComment(client, payload = {}) {
  const accessToken = String(payload.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;

  const suggestionId = String(payload.suggestionId || "").trim();
  const commentId = String(payload.commentId || "").trim();
  if (!suggestionId || !mongoose.isValidObjectId(suggestionId) || !commentId || !mongoose.isValidObjectId(commentId)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID non valido." };
  }

  const canMod = memberCanModerateSuggestions(resolved.member);
  const doc = await SiteDocument.findOne({
    docType: SG,
    _id: suggestionId,
    guildId: resolved.guild.id,
    status: "pending",
  }).catch(() => null);
  if (!doc) {
    return { ok: false, status: 404, error: "not_found", message: "Suggerimento non trovato o discussione chiusa." };
  }
  {
    const denied = denyStaffBoardIfNeeded(resolved.member, doc);
    if (denied) return denied;
  }

  const arr = Array.isArray(doc.comments) ? doc.comments : [];
  const idx = arr.findIndex((c) => String(c._id) === commentId);
  if (idx < 0) {
    return { ok: false, status: 404, error: "comment_not_found", message: "Commento non trovato." };
  }
  const authorId = String(arr[idx].userId || "").trim();
  const isOwn = authorId === String(resolved.userId);
  if (!isOwn && !canMod) {
    return { ok: false, status: 403, error: "forbidden", message: "Non puoi eliminare questo commento." };
  }

  const removeIds = new Set([commentId]);
  arr.forEach((c) => {
    if (String(c.parentCommentId || "") === commentId) removeIds.add(String(c._id));
  });
  const removedContents = arr
    .filter((c) => removeIds.has(String(c._id)))
    .map((c) => String(c.content || "").trim())
    .filter(Boolean);
  doc.comments = arr.filter((c) => !removeIds.has(String(c._id)));
  doc.updatedAt = new Date();
  doc.markModified("comments");
  const saved = await doc.save().catch(() => null);
  if (!saved) {
    return { ok: false, status: 500, error: "save_failed", message: "Impossibile eliminare il commento." };
  }

  // feedbackNotifDedupe1: purge solo notif del testo eliminato (prefisso sid:fp:).
  try {
    const fps = [
      ...new Set(removedContents.map((txt) => suggestionCommentContentFingerprint(txt)).filter((x) => x && x !== "empty")),
    ];
    if (fps.length) {
      await removeSiteInAppNotificationsMatching({
        prefixes: fps.map((fp) => `suggestion:discuss:${suggestionId}:${fp}:`),
        kinds: ["suggestion"],
        forceDismiss: true,
      }).catch(() => null);
    }
  } catch (_) {
    /* ignore */
  }

  broadcastSiteSuggestionsChanged();
  return {
    ok: true,
    status: 200,
    suggestion: serializeSuggestion(saved.toObject ? saved.toObject() : saved, resolved.userId),
    message: "Commento eliminato.",
  };
}

async function setSiteSuggestionCommentVote(client, payload = {}) {
  const accessToken = String(payload.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;

  const suggestionId = String(payload.suggestionId || "").trim();
  const commentId = String(payload.commentId || "").trim();
  if (!suggestionId || !mongoose.isValidObjectId(suggestionId) || !commentId || !mongoose.isValidObjectId(commentId)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID non valido." };
  }

  const direction = String(payload.direction || "").trim().toLowerCase();
  if (direction !== "up" && direction !== "down") {
    return { ok: false, status: 400, error: "invalid_direction", message: 'Indica "up" o "down".' };
  }

  const doc = await SiteDocument.findOne({
    docType: SG,
    _id: suggestionId,
    guildId: resolved.guild.id,
    status: "pending",
  }).catch(() => null);
  if (!doc) {
    return {
      ok: false,
      status: 400,
      error: "vote_not_allowed",
      message: "Puoi votare solo su suggerimenti ancora in valutazione.",
    };
  }
  {
    const denied = denyStaffBoardIfNeeded(resolved.member, doc);
    if (denied) return denied;
  }

  const arr = Array.isArray(doc.comments) ? doc.comments : [];
  const idx = arr.findIndex((c) => String(c._id) === commentId);
  if (idx < 0) {
    return { ok: false, status: 404, error: "comment_not_found", message: "Commento non trovato." };
  }

  const c = arr[idx];
  if (String(c.userId || "") === String(resolved.userId)) {
    return { ok: false, status: 400, error: "self_vote", message: "Non puoi votare il tuo stesso commento." };
  }

  const uid = String(resolved.userId);
  const up = new Set((Array.isArray(c.upvoterUserIds) ? c.upvoterUserIds : []).map((x) => String(x)));
  const down = new Set((Array.isArray(c.downvoterUserIds) ? c.downvoterUserIds : []).map((x) => String(x)));
  const hadUpvote = up.has(uid);

  if (direction === "up") {
    if (hadUpvote) up.delete(uid);
    else {
      down.delete(uid);
      up.add(uid);
    }
  } else if (down.has(uid)) {
    down.delete(uid);
  } else {
    up.delete(uid);
    down.add(uid);
  }

  c.upvoterUserIds = Array.from(up);
  c.downvoterUserIds = Array.from(down);
  doc.comments = arr;
  doc.updatedAt = new Date();
  doc.markModified("comments");
  const saved = await doc.save().catch(() => null);
  if (!saved) {
    return { ok: false, status: 500, error: "vote_failed", message: "Impossibile salvare il voto." };
  }

  broadcastSiteSuggestionsChanged();
  return {
    ok: true,
    status: 200,
    suggestion: serializeSuggestion(saved.toObject ? saved.toObject() : saved, uid),
    message: "Voto aggiornato.",
  };
}

async function serveSiteSuggestionFile(client, req, res) {
  const suggestionId = String(req.params?.suggestionId || "").trim();
  const fileName = String(req.params?.fileName || "").trim();
  const st = String(req.query?.st || "").trim();
  let allowed = verifySuggestionFileAccessToken(st, suggestionId, fileName);
  if (!allowed) {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const resolved = await resolveWebsiteGuildMember(client, accessToken);
    if (!resolved.ok) {
      res.status(Number(resolved.status) || 401).json({
        ok: false,
        error: resolved.error || "unauthorized",
        message: resolved.message || "Accesso negato.",
      });
      return;
    }
    const doc = await SiteDocument.findOne({
      docType: SG,
      _id: suggestionId,
      guildId: resolved.guild.id,
    })
      .select({ userId: 1, suggestionBoard: 1 })
      .lean();
    if (!doc) {
      res.status(404).json({ ok: false, error: "not_found" });
      return;
    }
    const denied = denyStaffBoardIfNeeded(resolved.member, doc);
    if (denied) {
      res.status(denied.status).json(denied);
      return;
    }
    const isOwner = String(doc.userId || "") === String(resolved.userId || "");
    const isStaff = memberCanModerateSuggestions(resolved.member);
    const canStaffBoard = suggestionBoardOf(doc) === "staff" && memberCanAccessStaffFeedbackBoard(resolved.member);
    if (!isOwner && !isStaff && !canStaffBoard) {
      res.status(403).json({ ok: false, error: "forbidden", message: "Accesso negato." });
      return;
    }
    allowed = true;
  }
  if (!allowed) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }
  const full = resolveStoredSuggestionFile(suggestionId, fileName);
  if (!full) {
    res.status(404).json({ ok: false, error: "not_found" });
    return;
  }
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Type", mimeFromFileName(req.params?.fileName));
  fs.createReadStream(full).pipe(res);
}

module.exports = {
  getSiteSuggestions,
  createSiteSuggestion,
  updateOwnSiteSuggestion,
  deleteOwnSiteSuggestion,
  addSiteSuggestionComment,
  updateSiteSuggestionComment,
  deleteSiteSuggestionComment,
  setSiteSuggestionCommentVote,
  setSiteSuggestionVote,
  staffAcceptSiteSuggestion,
  staffRejectSiteSuggestion,
  staffSetSiteSuggestionDecision,
  staffDeleteSiteSuggestion,
  serveSiteSuggestionFile,
  MAX_IMAGES,
  SUGGESTION_TOPIC_TAGS,
};
