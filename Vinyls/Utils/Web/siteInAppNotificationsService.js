const { SiteInAppNotification } = require("../../Schemas/Community/communitySchemas");
const mongoose = require("mongoose");

const MAX_PER_USER = 150;
const DEDUPE_KEY_MAX = 120;

function normalizeUserId(userId) {
  const s = String(userId || "").trim();
  return /^\d{17,20}$/.test(s) ? s : "";
}

function normalizeKind(kind) {
  const k = String(kind || "info").trim().toLowerCase();
  if (["vote", "success", "info", "review", "mod", "suggestion"].includes(k)) return k;
  return "info";
}

/**
 * @param {object} opts
 * @param {string} opts.guildId
 * @param {string} opts.userId destinatario Discord
 * @param {string} opts.title
 * @param {string} opts.body
 * @param {string} [opts.kind]
 * @param {string} [opts.openUrl] path o URL assoluto
 * @param {string} [opts.dedupeKey]
 * @param {number} [opts.dedupeWindowMs]
 */
async function enqueueSiteInAppNotification(opts = {}) {
  const userId = normalizeUserId(opts.userId);
  if (!userId) return;
  const guildId = String(opts.guildId || "").trim() || "global";
  const title = String(opts.title || "").trim().slice(0, 120);
  const body = String(opts.body || "").trim().slice(0, 500);
  if (!title || !body) return;
  const kind = normalizeKind(opts.kind);
  const openUrl = String(opts.openUrl || "").trim().slice(0, 400);
  const dedupeKeyRaw = opts.dedupeKey != null ? String(opts.dedupeKey).trim().slice(0, DEDUPE_KEY_MAX) : "";
  const dedupeWindowMs = Number(opts.dedupeWindowMs) || 0;
  if (dedupeKeyRaw && dedupeWindowMs > 0) {
    const since = new Date(Date.now() - dedupeWindowMs);
    const dup = await SiteInAppNotification.findOne({
      userId,
      dedupeKey: dedupeKeyRaw,
      createdAt: { $gte: since },
    })
      .select("_id")
      .lean()
      .catch(() => null);
    if (dup) return;
  }
  const created = await SiteInAppNotification.create({
    guildId,
    userId,
    title,
    body,
    kind,
    openUrl: openUrl || undefined,
    dedupeKey: dedupeKeyRaw || undefined,
  }).catch(() => null);
  await pruneSiteInAppNotificationsForUser(userId).catch(() => null);
  if (created) {
    try {
      const { broadcastSiteNotificationsChanged } = require("./siteSuggestionsBroadcast");
      broadcastSiteNotificationsChanged();
    } catch (_) {}
  }
}

async function pruneSiteInAppNotificationsForUser(userId) {
  const uid = normalizeUserId(userId);
  if (!uid) return;
  const count = await SiteInAppNotification.countDocuments({ userId: uid }).catch(() => 0);
  if (count <= MAX_PER_USER) return;
  const drop = count - MAX_PER_USER;
  const oldest = await SiteInAppNotification.find({ userId: uid })
    .sort({ createdAt: 1 })
    .limit(drop)
    .select("_id")
    .lean()
    .catch(() => []);
  const ids = (Array.isArray(oldest) ? oldest : []).map((d) => d._id).filter(Boolean);
  if (ids.length) await SiteInAppNotification.deleteMany({ _id: { $in: ids } }).catch(() => null);
}

async function deleteSiteInAppNotifications(filter = {}) {
  if (!filter || typeof filter !== "object" || Array.isArray(filter)) return 0;
  const del = await SiteInAppNotification.deleteMany(filter).catch(() => null);
  const count = Number(del?.deletedCount ?? del?.n ?? 0);
  if (count > 0) {
    try {
      const { broadcastSiteNotificationsChanged } = require("./siteSuggestionsBroadcast");
      broadcastSiteNotificationsChanged();
    } catch (_) {}
  }
  return count;
}

function isValidNotificationId(id) {
  const sid = String(id || "").trim();
  return Boolean(sid) && mongoose.isValidObjectId(sid);
}

async function markSiteInAppNotificationRead(userId, notificationId) {
  const uid = normalizeUserId(userId);
  const nid = String(notificationId || "").trim();
  if (!uid || !isValidNotificationId(nid)) return false;
  const out = await SiteInAppNotification.updateOne(
    { _id: nid, userId: uid, readAt: null },
    { $set: { readAt: new Date() } },
  ).catch(() => null);
  const modified = Number(out?.modifiedCount ?? out?.nModified ?? 0) > 0;
  if (modified) {
    try {
      const { broadcastSiteNotificationsChanged } = require("./siteSuggestionsBroadcast");
      broadcastSiteNotificationsChanged();
    } catch (_) {}
  }
  return modified;
}

async function markAllSiteInAppNotificationsRead(userId) {
  const uid = normalizeUserId(userId);
  if (!uid) return 0;
  const out = await SiteInAppNotification.updateMany(
    { userId: uid, readAt: null },
    { $set: { readAt: new Date() } },
  ).catch(() => null);
  const modified = Number(out?.modifiedCount ?? out?.nModified ?? 0);
  if (modified > 0) {
    try {
      const { broadcastSiteNotificationsChanged } = require("./siteSuggestionsBroadcast");
      broadcastSiteNotificationsChanged();
    } catch (_) {}
  }
  return modified;
}

async function listSiteInAppNotificationsForUser(userId, limit = 50) {
  const uid = normalizeUserId(userId);
  if (!uid) return [];
  const rows = await SiteInAppNotification.find({ userId: uid })
    .sort({ createdAt: -1 })
    .limit(Math.min(100, Math.max(1, Number(limit) || 50)))
    .lean()
    .catch(() => []);
  return (Array.isArray(rows) ? rows : []).map((doc) => ({
    id: String(doc._id),
    title: String(doc.title || ""),
    body: String(doc.body || ""),
    kind: normalizeKind(doc.kind),
    at: doc.createdAt ? new Date(doc.createdAt).getTime() : Date.now(),
    openUrl: String(doc.openUrl || "").trim(),
    read: Boolean(doc.readAt),
    readAt: doc.readAt ? new Date(doc.readAt).getTime() : null,
  }));
}

module.exports = {
  enqueueSiteInAppNotification,
  listSiteInAppNotificationsForUser,
  pruneSiteInAppNotificationsForUser,
  deleteSiteInAppNotifications,
  markSiteInAppNotificationRead,
  markAllSiteInAppNotificationsRead,
};