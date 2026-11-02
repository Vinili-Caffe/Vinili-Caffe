/** Suggerimenti: notifiche allo staff e all'autore. */
const mongoose = require("mongoose") as typeof import("mongoose");
const crypto = require("node:crypto") as typeof import("node:crypto");
const { normalizeSuggestionKind } = require("./suggestionFields") as typeof import("./suggestionFields");
const { enqueueSiteInAppNotification, deleteSiteInAppNotifications, removeSiteInAppNotificationsMatching } = require("../notifications/siteInAppNotificationsService") as typeof import("../notifications/siteInAppNotificationsService");
const { HIGH_STAFF_ROLE_ID } = require("./suggestionFiles") as typeof import("./suggestionFiles");

const HIGH_STAFF_CACHE_TTL_MS = 2 * 60 * 1000;

let highStaffCache = {
  guildId: "",
  expiresAt: 0,
  userIds: [],
};

function clipNotifBody(text?, maxLen?) {
  const s = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length <= maxLen) return s;
  return `${s.slice(0, Math.max(0, maxLen - 1))}…`;
}

function suggestionNotifOpenUrl(suggestionId?, board?) {
  const id = String(suggestionId || "").trim();
  const staff = board === "staff" || board === true;
  /* trailingSlash: /feedback#… senza / finale → redirect e hash perso → tab/scheda sbagliata */
  if (!id || !mongoose.isValidObjectId(id)) {
    return staff ? "/feedback/?board=staff" : "/feedback/";
  }
  return staff ? `/feedback/?board=staff#vc-suggestion-${id}` : `/feedback/#vc-suggestion-${id}`;
}

async function getHighStaffUserIds(guild?) {
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
        .filter((member?: any) => member && !member.user?.bot)
        .map((member?: any) => String(member.id))
    : [];
  highStaffCache = { guildId, expiresAt: Date.now() + HIGH_STAFF_CACHE_TTL_MS, userIds };
  return userIds;
}

async function notifyHighStaffNewSuggestion(guild?, suggestion?, authorName?) {
  const guildId = String(guild?.id || "").trim();
  if (!guildId) return;
  const highStaffIds = await getHighStaffUserIds(guild);
  if (!highStaffIds.length) return;
  const sid = String(suggestion?._id || suggestion?.id || "").trim();
  const authorId = String(suggestion?.userId || "").trim();
  const recipients = highStaffIds.filter((userId?) => String(userId || "").trim() && String(userId) !== authorId);
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
    recipients.map((userId?) =>
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

async function deleteSuggestionNotifications(guildId?, suggestionId?) {
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
function suggestionCommentContentFingerprint(content?) {
  const norm = String(content || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 160);
  if (!norm) return "empty";
  return crypto.createHash("sha1").update(norm).digest("hex").slice(0, 16);
}

async function notifySuggestionAuthor(guildId?, authorUserId?, payload?) {
  const gid = String(guildId || "").trim();
  const aid = String(authorUserId || "").trim();
  if (!gid || !aid) return;
  const opts: Record<string, any> = {
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
function collectSuggestionDiscussionParticipantIds(doc?, { excludeUserId }: any = {}) {
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

export = { clipNotifBody, suggestionNotifOpenUrl, notifyHighStaffNewSuggestion, deleteSuggestionNotifications, suggestionCommentContentFingerprint, notifySuggestionAuthor, collectSuggestionDiscussionParticipantIds };
