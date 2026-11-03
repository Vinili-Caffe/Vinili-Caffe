/** Notifiche del sito: elenco e conteggio delle non lette (con cache). */
const { SiteDocument } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const mongoose = require("mongoose") as typeof import("mongoose");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { shouldSkipSiteInAppNotif, buildSkipContext } = require("../../site/http/siteNotifPrefs") as typeof import("../../site/http/siteNotifPrefs");
const { normalizeUserId, normalizeKind, isVoteRegisteredNotification, isDedicatedInboxQueueAlert, resolveNotifChannel } = require("./notifKinds") as typeof import("./notifKinds");
const { normalizeTicketId, ticketIdFromOpenUrl } = require("./notifCopy") as typeof import("./notifCopy");
const { legacyFlatQuery, inboxQuery, migrateLegacyInAppNotificationsForUser } = require("./notifStore") as typeof import("./notifStore");
const { listCache, listInflight, invalidateUnreadCountCache, fireNotifDismissPush, broadcastInboxChanged, clearPushRetriesForInboxItem } = require("./notifPush") as typeof import("./notifPush");
const { isValidNotificationId } = require("./notifRead") as typeof import("./notifRead");

/* apiWarmSwr1: list SWR per-user */
const LIST_CACHE_TTL_MS = 10_000;
const LIST_STALE_KEEP_MS = 60_000;

async function listSiteInAppNotificationsForUserUncached(userId?, limit = 50) {
  const uid = normalizeUserId(userId);
  if (!uid) return [];
  await migrateLegacyInAppNotificationsForUser(uid).catch(() => null);
  const inbox = await SiteDocument.findOne(inboxQuery(uid)).select("inAppNotifItems").lean().catch(() => null);
  const items = Array.isArray(inbox?.inAppNotifItems) ? inbox.inAppNotifItems : [];
  const lim = Math.min(100, Math.max(1, Number(limit) || 50));
  const sorted = items.slice().sort((a?, b?) => {
    const ta = new Date(a.createdAt || 0).getTime();
    const tb = new Date(b.createdAt || 0).getTime();
    return tb - ta;
  });
  const prefsGuildId = String(IDs.guilds?.main || "").trim();
  const skipCtx = await buildSkipContext(prefsGuildId, uid).catch(() => ({
    mutedKinds: [],
    voteBlocked: { bump: false, vote_topgg: false },
  }));
  const mapped = [];
  for (const doc of sorted) {
    let kind = normalizeKind(doc.notifKind || doc.kind);
    const title = String(doc.title || "");
    const body = String(doc.body || "");
    if (
      kind === "vote" &&
      (/promemoria/i.test(title) || /promemoria/i.test(body) || /puoi votare di nuovo/i.test(body))
    ) {
      kind = "vote_reminder";
    }
    const openUrl = String(doc.openUrl || "").trim();
    const dedupeKey = String(doc.dedupeKey || "").trim();
    if (isVoteRegisteredNotification({ kind, title, body, dedupeKey })) continue;
    /* notifCats2/3: never list Discord-queue-only staff alerts as flat notifs. */
    if (
      isDedicatedInboxQueueAlert({
        openUrl,
        dedupeKey,
        channel: doc.notifChannel || doc.channel,
        title,
        body,
      })
    ) {
      continue;
    }
    const channel = resolveNotifChannel({
      openUrl,
      dedupeKey,
      channel: doc.notifChannel || doc.channel,
      title,
      body,
      kind,
    });
    const filtered = await shouldSkipSiteInAppNotif(prefsGuildId || doc.guildId, uid, {
      kind,
      title,
      body,
      dedupeKey,
      openUrl,
      mutedKinds: skipCtx.mutedKinds,
      voteBlocked: skipCtx.voteBlocked,
    }).catch(() => false);
    mapped.push({
      id: String(doc._id),
      title,
      body,
      kind,
      channel,
      dedupeKey: dedupeKey || "",
      at: doc.createdAt ? new Date(doc.createdAt).getTime() : Date.now(),
      openUrl,
      ticketId: normalizeTicketId(doc.ticketId) || ticketIdFromOpenUrl(doc.openUrl),
      read: Boolean(doc.readAt),
      readAt: doc.readAt ? new Date(doc.readAt).getTime() : null,
      filtered: Boolean(filtered),
    });
    if (mapped.length >= 100) break;
  }
  return mapped.slice(0, lim);
}

async function listSiteInAppNotificationsForUser(userId?, limit = 50) {
  const uid = normalizeUserId(userId);
  if (!uid) return [];
  const lim = Math.min(100, Math.max(1, Number(limit) || 50));
  const now = Date.now();
  const cached = listCache.get(uid);
  if (cached && now - cached.at < LIST_CACHE_TTL_MS && Array.isArray(cached.items)) {
    return cached.items.slice(0, lim);
  }
  if (cached && now - cached.at < LIST_STALE_KEEP_MS && Array.isArray(cached.items)) {
    if (!listInflight.has(uid)) {
      const p = listSiteInAppNotificationsForUserUncached(uid, 100)
        .then((items?) => {
          listCache.set(uid, { at: Date.now(), items });
          if (listCache.size > 800) {
            const cutoff = Date.now() - LIST_STALE_KEEP_MS;
            for (const [k, v] of listCache) {
              if (!v || v.at < cutoff) listCache.delete(k);
            }
          }
          return items;
        })
        .catch((err?) => {
          global.logger?.warn?.("[site-notif] list refresh:", err?.message || err);
          return cached.items;
        })
        .finally(() => listInflight.delete(uid));
      listInflight.set(uid, p);
    }
    return cached.items.slice(0, lim);
  }

  let inflight = listInflight.get(uid);
  if (!inflight) {
    inflight = listSiteInAppNotificationsForUserUncached(uid, 100)
      .then((items?) => {
        listCache.set(uid, { at: Date.now(), items });
        if (listCache.size > 800) {
          const cutoff = Date.now() - LIST_STALE_KEEP_MS;
          for (const [k, v] of listCache) {
            if (!v || v.at < cutoff) listCache.delete(k);
          }
        }
        return items;
      })
      .finally(() => listInflight.delete(uid));
    listInflight.set(uid, inflight);
  }
  const items = await inflight;
  return Array.isArray(items) ? items.slice(0, lim) : [];
}

async function deleteSiteInAppNotificationForUser(userId?, notificationId?) {
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
    { $pull: { inAppNotifItems: { _id: oid } } },
  ).catch(() => null);
  const modified = Number(out?.modifiedCount ?? out?.nModified ?? 0) > 0;
  /* pushDismissBtn1: stop soft-retry voto + dismiss OS (anche se già cancellata) */
  try {
    clearPushRetriesForInboxItem(uid, item || { _id: nid, id: nid, ticketId });
  } catch (_) {}
  fireNotifDismissPush(uid, { id: nid, ticketId, force: true });
  if (modified || item) {
    try {
      invalidateUnreadCountCache(uid);
      broadcastInboxChanged(uid);
    } catch (_) {}
  }
  return modified;
}

async function deleteAllSiteInAppNotificationsForUser(userId?) {
  const uid = normalizeUserId(userId);
  if (!uid) return 0;
  await migrateLegacyInAppNotificationsForUser(uid).catch(() => null);
  let count = 0;
  const inbox = await SiteDocument.findOne(inboxQuery(uid)).select("inAppNotifItems").catch(() => null);
  // bug: il "dismiss" partiva senza id e su iPhone le notifiche arrivate da Apple (PWA chiusa) si chiudono solo per tag
  // (vc-site-<id>): restavano tutte sul telefono. Si raccolgono gli id prima di svuotare.
  const dismissIds = (Array.isArray(inbox?.inAppNotifItems) ? inbox.inAppNotifItems : [])
    .map((it?) => String(it?._id || "").trim())
    .filter(Boolean)
    .slice(0, 80);
  if (inbox) {
    count += Array.isArray(inbox.inAppNotifItems) ? inbox.inAppNotifItems.length : 0;
    inbox.inAppNotifItems = [];
    await inbox.save().catch(() => null);
    await SiteDocument.deleteOne({ _id: inbox._id }).catch(() => null);
  } else {
    const emptied = await SiteDocument.updateOne(inboxQuery(uid), { $set: { inAppNotifItems: [] } }).catch(() => null);
    count += Number(emptied?.modifiedCount ?? emptied?.nModified ?? 0);
    await SiteDocument.deleteOne(inboxQuery(uid)).catch(() => null);
  }
  const delLegacy = await SiteDocument.deleteMany(legacyFlatQuery(uid)).catch(() => null);
  count += Number(delLegacy?.deletedCount ?? delLegacy?.n ?? 0);
  if (count > 0) {
    fireNotifDismissPush(uid, { all: true, ids: dismissIds, force: true });
    try {
      invalidateUnreadCountCache(uid);
      broadcastInboxChanged(uid);
    } catch (_) {}
  }
  return count;
}

export = { listSiteInAppNotificationsForUser, deleteSiteInAppNotificationForUser, deleteAllSiteInAppNotificationsForUser };
