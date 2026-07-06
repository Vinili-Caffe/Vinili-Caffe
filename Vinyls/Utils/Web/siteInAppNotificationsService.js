const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");
const mongoose = require("mongoose");

const NOTIF = SITE_DOCUMENT_TYPE.IN_APP_NOTIFICATION;
const MAX_PER_USER = 150;
const DEDUPE_KEY_MAX = 120;

function normalizeUserId(userId) {
  const s = String(userId || "").trim();
  return /^\d{17,22}$/.test(s) ? s : "";
}

function normalizeKind(kind) {
  const k = String(kind || "info").trim().toLowerCase();
  if (["vote", "vote_reminder", "success", "info", "review", "mod", "suggestion"].includes(k)) return k;
  return "info";
}

async function saveInboxItems(userId, items) {
  const uid = normalizeUserId(userId);
  if (!uid) return false;
  const merged = mergeItemsSortTrim(items);
  const existing = await SiteDocument.findOne(inboxQuery(uid)).catch(() => null);
  if (existing) {
    existing.inAppNotifItems = merged;
    try {
      await existing.save();
      return true;
    } catch (err) {
      global.logger?.warn?.("[siteInAppNotifications] inbox save failed:", err?.message || err);
      return false;
    }
  }
  try {
    await SiteDocument.create({
      docType: NOTIF,
      userId: uid,
      guildId: "",
      inAppNotifAggregate: true,
      inAppNotifItems: merged,
    });
    return true;
  } catch (err) {
    if (Number(err?.code) === 11000) {
      const again = await SiteDocument.findOne(inboxQuery(uid)).catch(() => null);
      if (!again) return false;
      again.inAppNotifItems = mergeItemsSortTrim([...(again.inAppNotifItems || []), ...merged]);
      try {
        await again.save();
        return true;
      } catch (saveErr) {
        global.logger?.warn?.("[siteInAppNotifications] inbox retry save failed:", saveErr?.message || saveErr);
        return false;
      }
    }
    global.logger?.warn?.("[siteInAppNotifications] inbox create failed:", err?.message || err);
    return false;
  }
}

function legacyFlatQuery(userId) {
  return {
    docType: NOTIF,
    userId,
    inAppNotifAggregate: { $ne: true },
  };
}

function inboxQuery(userId) {
  return { docType: NOTIF, userId, inAppNotifAggregate: true };
}

function flatDocToItem(doc) {
  return {
    _id: doc._id,
    guildId: String(doc.guildId || "").trim() || "",
    title: String(doc.title || "").trim().slice(0, 120),
    body: String(doc.body || "").trim().slice(0, 500),
    notifKind: normalizeKind(doc.notifKind || doc.kind),
    openUrl: String(doc.openUrl || "").trim().slice(0, 400),
    dedupeKey: doc.dedupeKey != null ? String(doc.dedupeKey).trim().slice(0, DEDUPE_KEY_MAX) : null,
    readAt: doc.readAt || null,
    createdAt: doc.createdAt || new Date(),
    updatedAt: doc.updatedAt || new Date(),
  };
}

function mergeItemsSortTrim(items) {
  const arr = Array.isArray(items) ? items.slice() : [];
  arr.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  return arr.slice(0, MAX_PER_USER);
}

async function migrateLegacyInAppNotificationsForUser(userId) {
  const uid = normalizeUserId(userId);
  if (!uid) return;
  const legacy = await SiteDocument.find(legacyFlatQuery(uid))
    .sort({ createdAt: 1 })
    .lean()
    .catch(() => []);
  if (!Array.isArray(legacy) || !legacy.length) return;
  const items = mergeItemsSortTrim(
    legacy
      .filter((d) => String(d.title || "").trim() && String(d.body || "").trim())
      .map(flatDocToItem),
  );
  if (!items.length) {
    await SiteDocument.deleteMany({ _id: { $in: legacy.map((d) => d._id) } }).catch(() => null);
    return;
  }
  const legacyIds = legacy.map((d) => d._id);
  let done = false;
  const existing = await SiteDocument.findOne(inboxQuery(uid)).catch(() => null);
  if (existing) {
    const merged = mergeItemsSortTrim([...(existing.inAppNotifItems || []), ...items]);
    existing.inAppNotifItems = merged;
    done = await existing.save().then(() => true).catch(() => false);
  } else {
    try {
      await SiteDocument.create({
        docType: NOTIF,
        userId: uid,
        guildId: "",
        inAppNotifAggregate: true,
        inAppNotifItems: items,
      });
      done = true;
    } catch (e) {
      if (Number(e?.code) === 11000) {
        const again = await SiteDocument.findOne(inboxQuery(uid)).catch(() => null);
        if (again) {
          again.inAppNotifItems = mergeItemsSortTrim([...(again.inAppNotifItems || []), ...items]);
          done = await again.save().then(() => true).catch(() => false);
        }
      }
    }
  }
  if (done) await SiteDocument.deleteMany({ _id: { $in: legacyIds } }).catch(() => null);
}

function itemMatchesDedupeWindow(item, dedupeKeyRaw, since) {
  if (!item || String(item.dedupeKey || "") !== dedupeKeyRaw) return false;
  const t = item.createdAt ? new Date(item.createdAt).getTime() : 0;
  return t >= since.getTime();
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
  await migrateLegacyInAppNotificationsForUser(userId).catch(() => null);
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
    const inbox = await SiteDocument.findOne(inboxQuery(userId)).select("inAppNotifItems").lean().catch(() => null);
    const items = Array.isArray(inbox?.inAppNotifItems) ? inbox.inAppNotifItems : [];
    if (items.some((it) => itemMatchesDedupeWindow(it, dedupeKeyRaw, since))) return;
    const dupLegacy = await SiteDocument.findOne({
      ...legacyFlatQuery(userId),
      dedupeKey: dedupeKeyRaw,
      createdAt: { $gte: since },
    })
      .select("_id")
      .lean()
      .catch(() => null);
    if (dupLegacy) return;
  }
  const newItem = {
    _id: new mongoose.Types.ObjectId(),
    guildId,
    title,
    body,
    notifKind: kind,
    openUrl: openUrl || "",
    dedupeKey: dedupeKeyRaw || null,
    readAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const inbox = await SiteDocument.findOne(inboxQuery(userId)).select("inAppNotifItems").lean().catch(() => null);
  const currentItems = Array.isArray(inbox?.inAppNotifItems) ? inbox.inAppNotifItems : [];
  const saved = await saveInboxItems(userId, [...currentItems, newItem]);
  if (saved) {
    try {
      const { broadcastSiteNotificationsChanged } = require("./siteSuggestionsBroadcast");
      broadcastSiteNotificationsChanged();
    } catch (_) {}
  } else {
    global.logger?.warn?.("[siteInAppNotifications] enqueue failed:", { userId, kind, title });
  }
}

async function pruneSiteInAppNotificationsForUser(userId) {
  const uid = normalizeUserId(userId);
  if (!uid) return;
  await migrateLegacyInAppNotificationsForUser(uid).catch(() => null);
  const inbox = await SiteDocument.findOne(inboxQuery(uid)).select("inAppNotifItems").lean().catch(() => null);
  const items = Array.isArray(inbox?.inAppNotifItems) ? inbox.inAppNotifItems : [];
  if (items.length <= MAX_PER_USER) return;
  const sorted = mergeItemsSortTrim(items);
  await SiteDocument.updateOne(inboxQuery(uid), { $set: { inAppNotifItems: sorted } }).catch(() => null);
}

async function deleteSiteInAppNotifications(filter = {}) {
  if (!filter || typeof filter !== "object" || Array.isArray(filter)) return 0;
  const { kind, ...rest } = filter;
  const legacyFilter = { docType: NOTIF, inAppNotifAggregate: { $ne: true }, ...rest };
  if (kind != null && String(kind).trim() !== "") legacyFilter.notifKind = String(kind).trim();
  const delLegacy = await SiteDocument.deleteMany(legacyFilter).catch(() => null);
  let count = Number(delLegacy?.deletedCount ?? delLegacy?.n ?? 0);

  const uid = normalizeUserId(rest.userId);
  const restKeys = Object.keys(rest).filter((k) => rest[k] !== undefined && rest[k] !== null);
  const onlyUser = uid && restKeys.length === 1 && restKeys[0] === "userId";
  if (onlyUser) {
    const delBox = await SiteDocument.deleteOne(inboxQuery(uid)).catch(() => null);
    count += Number(delBox?.deletedCount ?? delBox?.n ?? 0);
  } else {
    const pullSpec = { ...rest };
    if (kind != null && String(kind).trim() !== "") pullSpec.notifKind = String(kind).trim();
    if (Object.keys(pullSpec).length) {
      const res = await SiteDocument.updateMany(
        {
          docType: NOTIF,
          inAppNotifAggregate: true,
          inAppNotifItems: { $elemMatch: pullSpec },
        },
        { $pull: { inAppNotifItems: pullSpec } },
      ).catch(() => null);
      count += Number(res?.modifiedCount ?? res?.nModified ?? 0);
    }
  }
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
  await migrateLegacyInAppNotificationsForUser(uid).catch(() => null);
  const oid = new mongoose.Types.ObjectId(nid);
  const out = await SiteDocument.updateOne(
    inboxQuery(uid),
    { $set: { "inAppNotifItems.$[i].readAt": new Date() } },
    { arrayFilters: [{ "i._id": oid }] },
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
  await migrateLegacyInAppNotificationsForUser(uid).catch(() => null);
  const doc = await SiteDocument.findOne(inboxQuery(uid)).catch(() => null);
  if (!doc || !Array.isArray(doc.inAppNotifItems) || !doc.inAppNotifItems.length) return 0;
  let n = 0;
  const now = new Date();
  for (let i = 0; i < doc.inAppNotifItems.length; i += 1) {
    const it = doc.inAppNotifItems[i];
    if (it && !it.readAt) {
      it.readAt = now;
      n += 1;
    }
  }
  if (n > 0) {
    await doc.save().catch(() => null);
    try {
      const { broadcastSiteNotificationsChanged } = require("./siteSuggestionsBroadcast");
      broadcastSiteNotificationsChanged();
    } catch (_) {}
  }
  return n;
}

async function listSiteInAppNotificationsForUser(userId, limit = 50) {
  const uid = normalizeUserId(userId);
  if (!uid) return [];
  await migrateLegacyInAppNotificationsForUser(uid).catch(() => null);
  const inbox = await SiteDocument.findOne(inboxQuery(uid)).select("inAppNotifItems").lean().catch(() => null);
  const items = Array.isArray(inbox?.inAppNotifItems) ? inbox.inAppNotifItems : [];
  const lim = Math.min(100, Math.max(1, Number(limit) || 50));
  const sorted = items.slice().sort((a, b) => {
    const ta = new Date(a.createdAt || 0).getTime();
    const tb = new Date(b.createdAt || 0).getTime();
    return tb - ta;
  });
  return sorted.slice(0, lim).map((doc) => {
    let kind = normalizeKind(doc.notifKind || doc.kind);
    const title = String(doc.title || "");
    const body = String(doc.body || "");
    if (
      kind === "vote" &&
      (/promemoria/i.test(title) || /promemoria/i.test(body) || /puoi votare di nuovo/i.test(body))
    ) {
      kind = "vote_reminder";
    }
    return {
      id: String(doc._id),
      title,
      body,
      kind,
    at: doc.createdAt ? new Date(doc.createdAt).getTime() : Date.now(),
    openUrl: String(doc.openUrl || "").trim(),
    read: Boolean(doc.readAt),
    readAt: doc.readAt ? new Date(doc.readAt).getTime() : null,
  };
  });
}

async function deleteSiteInAppNotificationForUser(userId, notificationId) {
  const uid = normalizeUserId(userId);
  const nid = String(notificationId || "").trim();
  if (!uid || !isValidNotificationId(nid)) return false;
  await migrateLegacyInAppNotificationsForUser(uid).catch(() => null);
  const oid = new mongoose.Types.ObjectId(nid);
  const out = await SiteDocument.updateOne(
    inboxQuery(uid),
    { $pull: { inAppNotifItems: { _id: oid } } },
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

async function deleteAllSiteInAppNotificationsForUser(userId) {
  const uid = normalizeUserId(userId);
  if (!uid) return 0;
  return deleteSiteInAppNotifications({ userId: uid });
}

module.exports = {
  enqueueSiteInAppNotification,
  listSiteInAppNotificationsForUser,
  pruneSiteInAppNotificationsForUser,
  deleteSiteInAppNotifications,
  deleteAllSiteInAppNotificationsForUser,
  deleteSiteInAppNotificationForUser,
  markSiteInAppNotificationRead,
  markAllSiteInAppNotificationsRead,
  migrateLegacyInAppNotificationsForUser,
};