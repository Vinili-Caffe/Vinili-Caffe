/** Notifiche del sito: push sul telefono e avviso in tempo reale ai client. */
const { SiteDocument } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { buildSkipContext, isKindMuted, KIND_TO_GROUP } = require("../../site/http/siteNotifPrefs") as typeof import("../../site/http/siteNotifPrefs");
const { normalizeUserId, normalizeKind, isVoteRegisteredNotification, isDedicatedInboxQueueAlert } = require("./notifKinds") as typeof import("./notifKinds");
const { inboxQuery, migrateLegacyInAppNotificationsForUser } = require("./notifStore") as typeof import("./notifStore");

/* siteApiW3: unread count process cache + singleflight */
const UNREAD_COUNT_TTL_MS = 12_000;
const unreadCountCache = new Map();
const unreadCountInflight = new Map();
const listCache = new Map();
const listInflight = new Map();

function invalidateUnreadCountCache(userId?) {
  const uid = normalizeUserId(userId);
  if (!uid) {
    unreadCountCache.clear();
    unreadCountInflight.clear();
    listCache.clear();
    listInflight.clear();
    return;
  }
  unreadCountCache.delete(uid);
  unreadCountInflight.delete(uid);
  listCache.delete(uid);
  listInflight.delete(uid);
}

const lastDismissPushAt = new Map();

function fireNotifDismissPush(userId?, spec: Record<string, any> = {}) {
  try {
    const uid = normalizeUserId(userId);
    if (!uid) return;
    const ids = Array.isArray(spec.ids)
      ? [...new Set(spec.ids.map((x?) => String(x || "").trim()).filter(Boolean))].slice(0, 80)
      : [];
    const ticketIds = Array.isArray(spec.ticketIds)
      ? [
          ...new Set(
            spec.ticketIds
              .map((x?) => String(x || "").trim().toLowerCase())
              .filter((x?) => /^[a-f0-9]{24}$/i.test(x)),
          ),
        ].slice(0, 40)
      : [];
    const singleId = String(spec.id || "").trim();
    const singleTicket = String(spec.ticketId || "").trim();
    if (singleId && !ids.includes(singleId)) ids.unshift(singleId);
    if (singleTicket && /^[a-f0-9]{24}$/i.test(singleTicket) && !ticketIds.includes(singleTicket.toLowerCase())) {
      ticketIds.unshift(singleTicket.toLowerCase());
    }
    const openUrls = Array.isArray(spec.openUrls)
      ? [...new Set(spec.openUrls.map((x?) => String(x || "").trim()).filter(Boolean))].slice(0, 40)
      : [];
    /* pushAutoDismiss1: dedupeKey → SW matcha digest/tag anche senza id mongo */
    const dedupeKeys = Array.isArray(spec.dedupeKeys)
      ? [...new Set(spec.dedupeKeys.map((x?) => String(x || "").trim()).filter(Boolean))].slice(0, 40)
      : [];
    const pageUrl = String(spec.pageUrl || "").trim().slice(0, 500);
    const key =
      spec.all === true
        ? `${uid}:all`
        : ids.length
          ? `${uid}:ids:${ids.slice(0, 5).join(",")}`
          : ticketIds.length
            ? `${uid}:tix:${ticketIds.slice(0, 5).join(",")}`
            : pageUrl
              ? `${uid}:page:${pageUrl.slice(0, 80)}`
              : openUrls.length
                ? `${uid}:ou:${openUrls.slice(0, 2).join(",")}`
                : `${uid}:x`;
    const now = Date.now();
    const prev = Number(lastDismissPushAt.get(key) || 0);
    /* pushTicketOpenDismiss1: force bypass throttle (open ticket da altro device) */
    const throttleMs = spec.force === true ? 500 : 1500;
    if (now - prev < throttleMs) return;
    lastDismissPushAt.set(key, now);
    if (lastDismissPushAt.size > 400) {
      for (const [k, at] of lastDismissPushAt) {
        if (now - Number(at || 0) > 120000) lastDismissPushAt.delete(k);
      }
    }
    /* Solo avviso in tempo reale ai dispositivi col sito aperto (chiudono i banner e aggiornano il badge).
       Niente push: una push che non mostra nulla fa revocare l'iscrizione (iOS) o rallentare le altre (Chrome).
       I dispositivi chiusi si allineano all'apertura del sito o con la notifica successiva. */
    try {
      invalidateUnreadCountCache(uid);
    } catch (_) {}
    void (async () => {
      let unreadCount = -1;
      try {
        const counted = await countSiteInAppUnreadForUser(uid);
        unreadCount = Math.max(0, Math.min(99, Number(counted?.unread) || 0));
      } catch (_) {
        unreadCount = -1;
      }
      try {
        const { broadcastSiteNotificationsChanged } = require("../suggestions/siteSuggestionsBroadcast") as typeof import("../suggestions/siteSuggestionsBroadcast");
        const extra: Record<string, any> = { userId: uid };
        if (unreadCount >= 0) extra.unread = unreadCount;
        broadcastSiteNotificationsChanged(extra);
      } catch (_) {}
    })();
  } catch (_) {}
}

function broadcastInboxChanged(userId = "") {
  const uid = normalizeUserId(userId);
  try {
    const { broadcastSiteNotificationsChanged } = require("../suggestions/siteSuggestionsBroadcast") as typeof import("../suggestions/siteSuggestionsBroadcast");
    if (!uid) {
      broadcastSiteNotificationsChanged();
      return;
    }
    /* notifWsWakeFast1: ping WS subito (come la push), senza aspettare il count.
       Poi secondo fanout con unread fresco per badge cross-device. */
    try {
      invalidateUnreadCountCache(uid);
    } catch (_) {}
    try {
      broadcastSiteNotificationsChanged({ userId: uid });
    } catch (_) {}
    void (async () => {
      let unread;
      try {
        const counted = await countSiteInAppUnreadForUser(uid);
        unread = Math.max(0, Math.min(99, Number(counted?.unread) || 0));
      } catch (_) {
        unread = undefined;
      }
      if (unread == null) return;
      broadcastSiteNotificationsChanged({ userId: uid, unread });
    })().catch(() => {});
  } catch (_) {}
}

/* Nuovi tentativi: li fa siteWebPushService solo sugli errori temporanei, per dispositivo.
   Le vecchie code (telefono, PC, "hedge" Apple) rimandavano la stessa notifica fino a 5 volte
   con Topic diversi: doppioni e servizi push che rallentavano. Restano i nomi per i chiamanti. */
function clearMobilePushSoftRetries(_userId?, _dedupeKey?, _id?, _opts: Record<string, any> = {}) {}

/* pushSkipRead1: non ri-mandare push se già letta / dismessa.
   missingMeansUnread=true → primo send (fail-open se non ancora in DB).
   missingMeansUnread=false → soft-retry (stop se purged/assente). */
async function isSiteInAppNotificationStillUnread(userId?, id?, dedupeKey?, { missingMeansUnread = false } = {}) {
  const uid = normalizeUserId(userId);
  const nid = String(id || "").trim();
  const dk = String(dedupeKey || "").trim();
  if (!uid) return missingMeansUnread;
  if (!nid && !dk) return missingMeansUnread;
  try {
    const inbox = await SiteDocument.findOne(inboxQuery(uid)).select("inAppNotifItems").lean().catch(() => null);
    const items = Array.isArray(inbox?.inAppNotifItems) ? inbox.inAppNotifItems : [];
    let item = null;
    if (nid) {
      item = items.find((it?) => String(it?._id || "") === nid) || null;
    }
    if (!item && dk) {
      item = items.find((it?) => String(it?.dedupeKey || "").trim() === dk) || null;
    }
    if (!item) return Boolean(missingMeansUnread);
    return !item.readAt;
  } catch (_) {
    return Boolean(missingMeansUnread);
  }
}

function clearPushRetriesForInboxItem(_userId?, _item?) {}

function scheduleMobilePushSoftRetries(_userId?, _payload?, _pushOut?) {}

async function recoverUnreadApplePushHedges(_opts: Record<string, any> = {}) {
  return { ok: true, skipped: true, reason: "retries_removed" };
}

function fireNotificationPush(
  userId,
  { title, body, openUrl, kind, id, ticketId, messageId, channel, dedupeKey, ttlSeconds, msgCount }: any,
  { push = true } = {},
) {
  /* notifPushSync1: invalidate before WS fanout so mode=count on other devices is fresh */
  invalidateUnreadCountCache(userId);
  broadcastInboxChanged(userId);
  if (push === false) return Promise.resolve({ ok: true, skipped: true, reason: "push_disabled" });
  try {
    const { sendWebPushToUser } = require("../../site/http/siteWebPushService") as typeof import("../../site/http/siteWebPushService");
    /* pushBadgeSyncPhone1: allega unreadCount al content push → badge telefono allineato */
    return (async () => {
      let unreadCount = -1;
      try {
        const counted = await countSiteInAppUnreadForUser(userId);
        unreadCount = Math.max(0, Math.min(99, Number(counted?.unread) || 0));
      } catch (_) {
        unreadCount = -1;
      }
      const payload = {
        title,
        body,
        openUrl: openUrl || "",
        kind,
        id: String(id || ""),
        ticketId: String(ticketId || "").trim(),
        messageId: String(messageId || "").trim(),
        channel: String(channel || "").trim().slice(0, 16),
        dedupeKey: String(dedupeKey || "").trim().slice(0, 180),
        ttlSeconds: Number(ttlSeconds) || undefined,
        msgCount: Number(msgCount) > 0 ? Math.min(99, Math.floor(Number(msgCount))) : undefined,
        unreadCount,
      };
      /* pushSkipRead1: race mark-read vs push — non spedire se già letta */
      if (payload.id || payload.dedupeKey) {
        const stillUnread = await isSiteInAppNotificationStillUnread(userId, payload.id, payload.dedupeKey, {
          missingMeansUnread: true,
        });
        if (!stillUnread) {
          return { ok: true, sent: 0, skipped: true, reason: "already_read_pushSkipRead1" };
        }
      }
      return sendWebPushToUser(userId, payload);
    })().catch((err?) => {
      global.logger?.warn?.("[siteInAppNotifications] push send failed:", err?.message || err);
      return { ok: false, sent: 0, failed: 1 };
    });
  } catch (e) {
    return Promise.resolve({ ok: false, skipped: true, reason: String(e?.message || e) });
  }
}

const lastDigestPushAt = new Map();

async function countSiteInAppUnreadForUser(userId?) {
  const uid = normalizeUserId(userId);
  if (!uid) {
    return { unread: 0, total: 0, revision: "0", latestAt: 0 };
  }
  const now = Date.now();
  const cached = unreadCountCache.get(uid);
  if (cached && now - cached.at < UNREAD_COUNT_TTL_MS) {
    return cached.result;
  }
  let inflight = unreadCountInflight.get(uid);
  if (inflight) return inflight;

  inflight = (async () => {
    await migrateLegacyInAppNotificationsForUser(uid).catch(() => null);
    /* inboxUnreadSlim1: project only fields used by unread counter */
    const inbox = await SiteDocument.findOne(inboxQuery(uid))
      .select(
        "inAppNotifItems.readAt inAppNotifItems.createdAt inAppNotifItems.notifKind inAppNotifItems.kind inAppNotifItems.title inAppNotifItems.body inAppNotifItems.openUrl inAppNotifItems.dedupeKey inAppNotifItems.notifChannel inAppNotifItems.channel",
      )
      .lean()
      .catch(() => null);
    const items = Array.isArray(inbox?.inAppNotifItems) ? inbox.inAppNotifItems : [];
    const prefsGuildId = String(IDs.guilds?.main || "").trim();
    const skipCtx = await buildSkipContext(prefsGuildId, uid).catch(() => ({
      mutedKinds: [],
      voteBlocked: { bump: false, vote_topgg: false },
    }));
    let unread = 0;
    let total = 0;
    let latestAt = 0;
    let latestUnreadAt = 0;
    for (const doc of items) {
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
      /* siteApiW3: skip sync via skipCtx — no per-item await
         voteUnreadNoDmFix1: NoDM Discord NON nasconde reminder voto da badge/pending
         (allineato a votePushNoDmFix1 / shouldSkipSiteInAppNotif). */
      let filtered = false;
      if (KIND_TO_GROUP[kind] && isKindMuted(skipCtx.mutedKinds, kind)) {
        filtered = true;
      }
      if (filtered) continue;
      total += 1;
      const at = doc.createdAt ? new Date(doc.createdAt).getTime() : 0;
      if (at > latestAt) latestAt = at;
      if (!doc.readAt) {
        unread += 1;
        if (at > latestUnreadAt) latestUnreadAt = at;
      }
    }
    const revision = `${total}:${unread}:${latestAt || 0}:${latestUnreadAt || 0}`;
    const result = { unread, total, revision, latestAt, latestUnreadAt };
    unreadCountCache.set(uid, { at: Date.now(), result });
    if (unreadCountCache.size > 800) {
      const cutoff = Date.now() - UNREAD_COUNT_TTL_MS;
      for (const [k, v] of unreadCountCache) {
        if (!v || v.at < cutoff) unreadCountCache.delete(k);
      }
    }
    return result;
  })().finally(() => {
    unreadCountInflight.delete(uid);
  });

  unreadCountInflight.set(uid, inflight);
  return inflight;
}

export = { listCache, listInflight, invalidateUnreadCountCache, fireNotifDismissPush, broadcastInboxChanged, clearMobilePushSoftRetries, isSiteInAppNotificationStillUnread, clearPushRetriesForInboxItem, scheduleMobilePushSoftRetries, recoverUnreadApplePushHedges, fireNotificationPush, countSiteInAppUnreadForUser };
