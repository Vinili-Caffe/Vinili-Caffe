/** Notifiche del sito: segna come lette ed elimina. */
const { SiteDocument } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const mongoose = require("mongoose") as typeof import("mongoose");
const { normalizeUserId } = require("./notifKinds") as typeof import("./notifKinds");
const { normalizeTicketId, ticketIdFromOpenUrl, inboxItemMatchesTicket } = require("./notifCopy") as typeof import("./notifCopy");
const { NOTIF, inboxQuery, migrateLegacyInAppNotificationsForUser } = require("./notifStore") as typeof import("./notifStore");
const { invalidateUnreadCountCache, fireNotifDismissPush, broadcastInboxChanged, clearPushRetriesForInboxItem } = require("./notifPush") as typeof import("./notifPush");

async function deleteSiteInAppNotifications(filter: Record<string, any> = {}) {
  if (!filter || typeof filter !== "object" || Array.isArray(filter)) return 0;
  const { kind, ...rest } = filter;
  const legacyFilter: Record<string, any> = { docType: NOTIF, inAppNotifAggregate: { $ne: true }, ...rest };
  if (kind != null && String(kind).trim() !== "") legacyFilter.notifKind = String(kind).trim();
  const delLegacy = await SiteDocument.deleteMany(legacyFilter).catch(() => null);
  let count = Number(delLegacy?.deletedCount ?? delLegacy?.n ?? 0);

  const uid = normalizeUserId(rest.userId);
  const restKeys = Object.keys(rest).filter((k?) => rest[k] !== undefined && rest[k] !== null);
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
      if (uid) {
        invalidateUnreadCountCache(uid);
        broadcastInboxChanged(uid);
      } else {
        invalidateUnreadCountCache();
        broadcastInboxChanged();
      }
    } catch (_) {}
  }
  return count;
}

function isValidNotificationId(id?) {
  const sid = String(id || "").trim();
  return Boolean(sid) && mongoose.isValidObjectId(sid);
}

async function markSiteInAppNotificationRead(userId?, notificationId?) {
  const uid = normalizeUserId(userId);
  const nid = String(notificationId || "").trim();
  if (!uid || !isValidNotificationId(nid)) return false;
  await migrateLegacyInAppNotificationsForUser(uid).catch(() => null);
  const oid = new mongoose.Types.ObjectId(nid);
  const inbox = await SiteDocument.findOne(inboxQuery(uid)).select("inAppNotifItems").lean().catch(() => null);
  const item = (Array.isArray(inbox?.inAppNotifItems) ? inbox.inAppNotifItems : []).find(
    (it?) => String(it?._id || "") === nid,
  );
  const ticketId = item ? normalizeTicketId(item.ticketId) || ticketIdFromOpenUrl(item.openUrl) : "";
  const out = await SiteDocument.updateOne(
    inboxQuery(uid),
    { $set: { "inAppNotifItems.$[i].readAt": new Date() } },
    { arrayFilters: [{ "i._id": oid }] },
  ).catch(() => null);
  const modified = Number(out?.modifiedCount ?? out?.nModified ?? 0) > 0;
  /* pushBadgeVisitFix1 + iosDismissTag1: dismiss OS anche se già letta — badge/banner altri device */
  if (item || modified) {
    try {
      clearPushRetriesForInboxItem(uid, item || { _id: nid, id: nid });
    } catch (_) {}
    const openUrl = String(item?.openUrl || "").trim();
    const dedupeKey = String(item?.dedupeKey || "").trim();
    fireNotifDismissPush(uid, {
      id: nid,
      ticketId,
      openUrls: openUrl ? [openUrl] : [],
      dedupeKeys: dedupeKey ? [dedupeKey] : [],
      force: true,
    });
  }
  if (modified || item) {
    try {
      invalidateUnreadCountCache(uid);
      broadcastInboxChanged(uid);
    } catch (_) {}
  }
  return modified;
}

async function markSiteInAppNotificationsReadMany(userId?, notificationIds?) {
  const uid = normalizeUserId(userId);
  const ids = Array.isArray(notificationIds)
    ? [...new Set(notificationIds.map((x?) => String(x || "").trim()).filter((id?) => isValidNotificationId(id)))]
    : [];
  if (!uid || !ids.length) return 0;
  if (ids.length === 1) {
    const ok = await markSiteInAppNotificationRead(uid, ids[0]);
    return ok ? 1 : 0;
  }
  await migrateLegacyInAppNotificationsForUser(uid).catch(() => null);
  const oids = ids.map((id?) => new mongoose.Types.ObjectId(id));
  const inbox = await SiteDocument.findOne(inboxQuery(uid)).select("inAppNotifItems").lean().catch(() => null);
  const items = Array.isArray(inbox?.inAppNotifItems) ? inbox.inAppNotifItems : [];
  const idSet = new Set(ids);
  const openUrls = [];
  const ticketIds = [];
  for (const it of items) {
    const nid = String(it?._id || "").trim();
    if (!nid || !idSet.has(nid)) continue;
    const ou = String(it?.openUrl || "").trim();
    if (ou && !openUrls.includes(ou)) openUrls.push(ou);
    const tid = normalizeTicketId(it?.ticketId) || ticketIdFromOpenUrl(it?.openUrl) || "";
    if (tid && !ticketIds.includes(tid)) ticketIds.push(tid);
  }
  const out = await SiteDocument.updateOne(
    inboxQuery(uid),
    { $set: { "inAppNotifItems.$[i].readAt": new Date() } },
    { arrayFilters: [{ "i._id": { $in: oids } }] },
  ).catch(() => null);
  const modified = Number(out?.modifiedCount ?? out?.nModified ?? 0) > 0 ? ids.length : 0;
  try {
    for (const it of items) {
      const iid = String(it?._id || "").trim();
      if (iid && idSet.has(iid)) clearPushRetriesForInboxItem(uid, it);
    }
  } catch (_) {}
  const dedupeKeys = [];
  for (const it of items) {
    const nid = String(it?._id || "").trim();
    if (!nid || !idSet.has(nid)) continue;
    const dk = String(it?.dedupeKey || "").trim();
    if (dk && !dedupeKeys.includes(dk) && dedupeKeys.length < 40) dedupeKeys.push(dk);
  }
  /* notifReadDismissOs1 + iosDismissTag1: dismiss OS anche se già lette */
  fireNotifDismissPush(uid, {
    ids,
    ticketIds,
    openUrls,
    dedupeKeys,
    all: ids.length > 40,
    force: true,
  });
  if (modified > 0 || ids.length) {
    try {
      invalidateUnreadCountCache(uid);
      broadcastInboxChanged(uid);
    } catch (_) {}
  }
  return modified;
}

async function markAllSiteInAppNotificationsRead(userId?) {
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
      invalidateUnreadCountCache(uid);
      broadcastInboxChanged(uid);
    } catch (_) {}
  }
  try {
    for (const it of doc.inAppNotifItems || []) {
      if (it) clearPushRetriesForInboxItem(uid, it);
    }
  } catch (_) {}
  /* iosDismissTag1: passa gli id → SW iOS fa tag-replace (declarative 8030) */
  const allIds = [];
  const openUrls = [];
  const ticketIds = [];
  const dedupeKeys = [];
  for (const it of doc.inAppNotifItems || []) {
    const iid = String(it?._id || "").trim();
    if (iid && allIds.length < 80) allIds.push(iid);
    const ou = String(it?.openUrl || "").trim();
    if (ou && !openUrls.includes(ou) && openUrls.length < 40) openUrls.push(ou);
    const tid = normalizeTicketId(it?.ticketId) || ticketIdFromOpenUrl(it?.openUrl) || "";
    if (tid && !ticketIds.includes(tid) && ticketIds.length < 40) ticketIds.push(tid);
    const dk = String(it?.dedupeKey || "").trim();
    if (dk && !dedupeKeys.includes(dk) && dedupeKeys.length < 40) dedupeKeys.push(dk);
  }
  /* notifReadDismissOs1 + iosDismissTag1: dismiss OS anche se già tutte lette */
  fireNotifDismissPush(uid, {
    all: true,
    ids: allIds,
    ticketIds,
    openUrls,
    dedupeKeys,
    force: true,
  });
  return n;
}

async function markSiteInAppNotificationsReadForTicket(userId?, ticketId?) {
  const uid = normalizeUserId(userId);
  const tid = normalizeTicketId(ticketId);
  if (!uid || !tid) return 0;
  await migrateLegacyInAppNotificationsForUser(uid).catch(() => null);
  const doc = await SiteDocument.findOne(inboxQuery(uid)).catch(() => null);
  if (!doc || !Array.isArray(doc.inAppNotifItems) || !doc.inAppNotifItems.length) {
    /* pushTicketOpenDismiss1: anche senza inbox → chiudi banner OS su altri device */
    fireNotifDismissPush(uid, { ticketId: tid, force: true });
    return 0;
  }
  let n = 0;
  const now = new Date();
  const markedIds = [];
  for (let i = 0; i < doc.inAppNotifItems.length; i += 1) {
    const it = doc.inAppNotifItems[i];
    if (!it || it.readAt) continue;
    if (!inboxItemMatchesTicket(it, tid)) continue;
    it.readAt = now;
    n += 1;
    if (it._id) markedIds.push(String(it._id));
  }
  if (n > 0) {
    await doc.save().catch(() => null);
    try {
      invalidateUnreadCountCache(uid);
      broadcastInboxChanged(uid);
    } catch (_) {}
  }
  try {
    for (const it of doc.inAppNotifItems || []) {
      if (!it || !markedIds.includes(String(it._id || ""))) continue;
      clearPushRetriesForInboxItem(uid, it);
    }
  } catch (_) {}
  /* pushTicketOpenDismiss1: sempre dismiss per ticketId (anche se già lette / store locale vuoto) */
  fireNotifDismissPush(uid, { ticketId: tid, ids: markedIds, force: true });
  return n;
}

export = { deleteSiteInAppNotifications, isValidNotificationId, markSiteInAppNotificationRead, markSiteInAppNotificationsReadMany, markAllSiteInAppNotificationsRead, markSiteInAppNotificationsReadForTicket };
