const webpush = require("web-push");
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");

const DOC = SITE_DOCUMENT_TYPE.WEB_PUSH_SUBSCRIPTION;
const GONE_DOC = SITE_DOCUMENT_TYPE.WEB_PUSH_GONE_ENDPOINT;
const DEFAULT_SITE_ORIGIN = "https://www.viniliecaffe.it";
const PUSH_NOTIFICATION_ICON = "/images/og-server-icon.gif?v=20260904brandGif1";

let vapidConfigured = false;

/* pushPhoneHeal1: endpoint FCM/WNS morti (410/500 permanent) — non ri-accettarli;
   il client deve unsubscribe+subscribe per un endpoint nuovo.
   pushGonePersist1: denylist anche su Mongo (prima solo Map in RAM → dopo restart
   site-api il client ri-POSTAVA endpoint morti e le push tornavano 410). */
const GONE_ENDPOINT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const gonePushEndpoints = new Map();

async function markPushEndpointGone(endpointRaw) {
  const endpoint = normalizeEndpoint(endpointRaw);
  if (!endpoint) return;
  gonePushEndpoints.set(endpoint, Date.now());
  if (gonePushEndpoints.size > 4000) {
    const now = Date.now();
    for (const [ep, at] of gonePushEndpoints) {
      if (now - Number(at || 0) > GONE_ENDPOINT_TTL_MS) gonePushEndpoints.delete(ep);
    }
  }
  try {
    await SiteDocument.findOneAndUpdate(
      { docType: GONE_DOC, pushEndpoint: endpoint },
      {
        $set: {
          docType: GONE_DOC,
          pushEndpoint: endpoint,
          guildId: "",
          userId: "",
        },
      },
      { upsert: true, setDefaultsOnInsert: true },
    );
  } catch (err) {
    global.logger?.warn?.("[siteWebPush] gone persist failed:", err?.message || err);
  }
}

async function isPushEndpointRecentlyGone(endpointRaw) {
  const endpoint = normalizeEndpoint(endpointRaw);
  if (!endpoint) return false;
  const at = Number(gonePushEndpoints.get(endpoint) || 0);
  if (at) {
    if (Date.now() - at <= GONE_ENDPOINT_TTL_MS) return true;
    gonePushEndpoints.delete(endpoint);
  }
  const doc = await SiteDocument.findOne({ docType: GONE_DOC, pushEndpoint: endpoint })
    .select("updatedAt createdAt")
    .lean()
    .catch(() => null);
  if (!doc) return false;
  const ts = new Date(doc.updatedAt || doc.createdAt || 0).getTime();
  if (!Number.isFinite(ts) || ts <= 0 || Date.now() - ts > GONE_ENDPOINT_TTL_MS) {
    void SiteDocument.deleteOne({ docType: GONE_DOC, pushEndpoint: endpoint }).catch(() => null);
    return false;
  }
  gonePushEndpoints.set(endpoint, ts);
  return true;
}

function normalizeUserId(userId) {
  const s = String(userId || "").trim();
  return /^\d{17,22}$/.test(s) ? s : "";
}

function resolveSitePublicOrigin() {
  const raw = String(
    process.env.WEBSITE_PUBLIC_ORIGIN || process.env.WEBSITE_PUBLIC_URL || DEFAULT_SITE_ORIGIN,
  )
    .trim()
    .replace(/\/+$/, "");
  /* pushOpenDestFix1: sempre www — altrimenti SW su www scarta openUrl apex → / */
  return (raw || DEFAULT_SITE_ORIGIN).replace("://viniliecaffe.it", "://www.viniliecaffe.it");
}

function absoluteOpenUrl(openUrl) {
  const u = String(openUrl || "").trim();
  const origin = resolveSitePublicOrigin();
  if (!u) return `${origin}/`;
  if (/^https?:\/\//i.test(u)) {
    try {
      const abs = new URL(u);
      if (/^(?:www\.)?viniliecaffe\.(?:it|gg)$/i.test(abs.hostname)) {
        abs.protocol = "https:";
        abs.hostname = "www.viniliecaffe.it";
        return abs.href.slice(0, 2000);
      }
    } catch (_) {}
    return u.slice(0, 2000);
  }
  return `${origin}${u.startsWith("/") ? u : `/${u}`}`.slice(0, 2000);
}

function getVapidKeys() {
  const publicKey = String(process.env.VAPID_PUBLIC_KEY || "").trim();
  const privateKey = String(process.env.VAPID_PRIVATE_KEY || "").trim();
  const subject = String(process.env.VAPID_SUBJECT || "mailto:noreply@viniliecaffe.it").trim();
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

function ensureVapidConfigured() {
  if (vapidConfigured) return true;
  const keys = getVapidKeys();
  if (!keys) return false;
  try {
    webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
    vapidConfigured = true;
    return true;
  } catch (err) {
    global.logger?.warn?.("[siteWebPush] VAPID configure failed:", err?.message || err);
    return false;
  }
}

function getPublicVapidKey() {
  const keys = getVapidKeys();
  return keys ? keys.publicKey : "";
}

function isPushEnabled() {
  return Boolean(getPublicVapidKey() && getVapidKeys()?.privateKey);
}

function normalizeEndpoint(endpoint) {
  const s = String(endpoint || "").trim();
  if (!s || s.length > 2048) return "";
  if (!/^https:\/\//i.test(s)) return "";
  return s;
}

function normalizeKey(value, max = 512) {
  const s = String(value || "").trim();
  if (!s || s.length > max) return "";
  return s;
}

function pushUaFingerprint(uaRaw) {
  const ua = String(uaRaw || "").trim();
  if (!ua) return "empty";
  let os = "os";
  if (/iPhone|iPad|iPod/i.test(ua)) os = "ios";
  else if (/Android/i.test(ua)) os = "android";
  else if (/Windows/i.test(ua)) os = "win";
  else if (/Macintosh/i.test(ua)) os = "mac";
  else if (/Linux|X11/i.test(ua)) os = "linux";
  let br = "br";
  if (/Edg\//i.test(ua)) br = "edge";
  else if (/Brave/i.test(ua)) br = "brave";
  else if (/Chrome\//i.test(ua) || /CriOS\//i.test(ua)) br = "chrome";
  else if (/Firefox\//i.test(ua) || /FxiOS\//i.test(ua)) br = "firefox";
  else if (/Safari\//i.test(ua)) br = "safari";
  return `${os}:${br}`;
}

function pushEndpointHostHint(endpointRaw) {
  try {
    return String(new URL(String(endpointRaw || "")).host || "").toLowerCase();
  } catch (_) {
    return "";
  }
}

function pushDeviceClass(uaRaw, deviceClassRaw, endpointRaw) {
  const hint = String(deviceClassRaw || "")
    .trim()
    .toLowerCase();
  if (hint === "mobile" || hint === "desktop" || hint === "tablet") return hint;
  const ua = String(uaRaw || "");
  if (/iPhone|iPad|iPod|Android|Mobile/i.test(ua)) return "mobile";
  const host = pushEndpointHostHint(endpointRaw);
  /* votePushPhoneFix1 + siteApiDeviceEverywhere1: host hints senza UA */
  if (/web\.push\.apple\.com|push\.apple\.com/i.test(host)) return "mobile";
  if (/fcm\.googleapis\.com|android\.googleapis\.com|firebase/i.test(host)) return "mobile";
  if (/updates\.push\.services\.mozilla\.com|push\.services\.mozilla/i.test(host)) {
    if (/Mobile|Android|iPhone|iPad/i.test(ua)) return "mobile";
    return "desktop";
  }
  if (/notify\.windows\.com|wns\d*[-.]/i.test(host)) return "desktop";
  if (/Windows|Macintosh|Linux|X11/i.test(ua) && !/Mobile/i.test(ua)) return "desktop";
  return "unknown";
}

function pushSubFingerprint(sub) {
  const uaFp = pushUaFingerprint(sub?.pushUserAgent);
  const cls = pushDeviceClass(sub?.pushUserAgent, sub?.pushDeviceClass, sub?.pushEndpoint);
  if (uaFp !== "empty") return `${cls}:${uaFp}`;
  const host = pushEndpointHostHint(sub?.pushEndpoint) || "host";
  return `${cls}:host:${host}`;
}

/* pushMultiDevice3 + siteApiDeviceEverywhere1: PC+phone; 3 slot/fingerprint (2 telefoni Chrome OK) */
const MAX_PUSH_SUBS_PER_USER = 12;
const MAX_PUSH_SUBS_PER_FP = 3;

async function pruneWebPushSubscriptionsForUser(userId) {
  const uid = normalizeUserId(userId);
  if (!uid) return { ok: false, dropped: 0 };
  try {
    const docs = await SiteDocument.find({ docType: DOC, userId: uid })
      .select("_id pushUserAgent pushEndpoint pushDeviceClass updatedAt createdAt")
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean()
      .catch(() => []);
    if (!Array.isArray(docs) || docs.length <= 2) {
      return { ok: true, dropped: 0 };
    }
    const keepIds = [];
    const byFp = Object.create(null);
    let keptMobile = 0;
    let keptDesktop = 0;
    let keptTablet = 0;

    function tryKeep(d, forceClass) {
      if (!d) return false;
      const id = String(d._id);
      if (keepIds.includes(id)) return false;
      if (keepIds.length >= MAX_PUSH_SUBS_PER_USER) return false;
      const fp = pushSubFingerprint(d);
      const cls = pushDeviceClass(d?.pushUserAgent, d?.pushDeviceClass, d?.pushEndpoint);
      const n = Number(byFp[fp] || 0);
      if (!forceClass && n >= MAX_PUSH_SUBS_PER_FP) return false;
      byFp[fp] = n + 1;
      keepIds.push(id);
      if (cls === "mobile") keptMobile += 1;
      else if (cls === "desktop") keptDesktop += 1;
      else if (cls === "tablet") keptTablet += 1;
      return true;
    }

    for (const d of docs) tryKeep(d, false);

    if (keptMobile === 0) {
      const mob = docs.find((d) => pushDeviceClass(d?.pushUserAgent, d?.pushDeviceClass, d?.pushEndpoint) === "mobile");
      tryKeep(mob, true);
    }
    if (keptDesktop === 0) {
      const desk = docs.find(
        (d) => pushDeviceClass(d?.pushUserAgent, d?.pushDeviceClass, d?.pushEndpoint) === "desktop",
      );
      tryKeep(desk, true);
    }
    if (keptTablet === 0) {
      const tab = docs.find(
        (d) => pushDeviceClass(d?.pushUserAgent, d?.pushDeviceClass, d?.pushEndpoint) === "tablet",
      );
      tryKeep(tab, true);
    }

    const keepSet = new Set(keepIds);
    const dropIds = docs.map((d) => d._id).filter((id) => !keepSet.has(String(id)));
    if (!dropIds.length) return { ok: true, dropped: 0 };
    const res = await SiteDocument.deleteMany({ docType: DOC, userId: uid, _id: { $in: dropIds } }).catch(
      () => null,
    );
    return { ok: true, dropped: Number(res?.deletedCount) || dropIds.length };
  } catch (err) {
    global.logger?.warn?.("[siteWebPush] prune failed:", err?.message || err);
    return { ok: false, dropped: 0 };
  }
}

async function upsertWebPushSubscription(userId, subscription, meta = {}) {
  const uid = normalizeUserId(userId);
  const endpoint = normalizeEndpoint(subscription?.endpoint);
  const p256dh = normalizeKey(subscription?.keys?.p256dh);
  const auth = normalizeKey(subscription?.keys?.auth, 256);
  if (!uid || !endpoint || !p256dh || !auth) {
    return { ok: false, error: "invalid_subscription" };
  }
  /* pushPhoneHeal1 + pushGonePersist1: rifiuta re-POST di endpoint già 410 (RAM + Mongo)
     pushGoneQuiet1: se DOC ancora presente (race), purge subito — no re-send 410 */
  if (await isPushEndpointRecentlyGone(endpoint)) {
    await removeWebPushByEndpoint(endpoint);
    return { ok: false, error: "endpoint_gone", recreate: true };
  }
  const userAgent = String(meta.userAgent || "").trim().slice(0, 300);
  const deviceClass = pushDeviceClass(userAgent, meta.deviceClass, endpoint);
  try {
    const existing = await SiteDocument.findOne({ docType: DOC, pushEndpoint: endpoint })
      .select("userId pushP256dh pushAuth pushUserAgent pushDeviceClass")
      .lean()
      .catch(() => null);
    const same =
      existing &&
      String(existing.userId || "") === uid &&
      String(existing.pushP256dh || "") === p256dh &&
      String(existing.pushAuth || "") === auth &&
      (!userAgent || String(existing.pushUserAgent || "") === userAgent) &&
      String(existing.pushDeviceClass || "") === deviceClass;
    if (same) {
      void pruneWebPushSubscriptionsForUser(uid);
      return { ok: true, unchanged: true };
    }

    await SiteDocument.findOneAndUpdate(
      { docType: DOC, pushEndpoint: endpoint },
      {
        $set: {
          docType: DOC,
          userId: uid,
          guildId: "",
          pushEndpoint: endpoint,
          pushP256dh: p256dh,
          pushAuth: auth,
          pushUserAgent: userAgent,
          pushDeviceClass: deviceClass,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    await pruneWebPushSubscriptionsForUser(uid);
    return { ok: true };
  } catch (err) {
    global.logger?.warn?.("[siteWebPush] upsert failed:", err?.message || err);
    return { ok: false, error: "save_failed" };
  }
}

async function removeWebPushSubscription(userId, endpointRaw) {
  const uid = normalizeUserId(userId);
  const endpoint = normalizeEndpoint(endpointRaw);
  if (!uid || !endpoint) return { ok: false, error: "invalid_subscription" };
  const res = await SiteDocument.deleteOne({ docType: DOC, userId: uid, pushEndpoint: endpoint }).catch(() => null);
  return { ok: true, deleted: Number(res?.deletedCount) || 0 };
}

async function removeWebPushByEndpoint(endpointRaw) {
  const endpoint = normalizeEndpoint(endpointRaw);
  if (!endpoint) return 0;
  const res = await SiteDocument.deleteMany({ docType: DOC, pushEndpoint: endpoint }).catch(() => null);
  return Number(res?.deletedCount) || 0;
}

function looksLikeSiteName(title) {
  const t = String(title || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!t) return true;
  return /^(vinili\s*[&e]\s*caff[eè]?|viniliecaffe|vinili)$/i.test(t);
}

function pushDisplayTitle(title, body) {
  const t = String(title || "").trim();
  if (t && !looksLikeSiteName(t)) return t.slice(0, 120);
  const b = String(body || "").trim().split("\n")[0];
  if (b) return (b.length > 72 ? `${b.slice(0, 71)}…` : b).slice(0, 120);
  return "Nuova notifica";
}

async function listSubscriptionsForUser(userId) {
  const uid = normalizeUserId(userId);
  if (!uid) return [];
  /* pushMultiDevice3: prune soft (solo se troppi) — mai droppare PC↔phone a ogni send */
  await pruneWebPushSubscriptionsForUser(uid);
  const docs = await SiteDocument.find({ docType: DOC, userId: uid })
    .select("pushEndpoint pushP256dh pushAuth pushUserAgent pushDeviceClass updatedAt createdAt")
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean()
    .catch(() => []);
  return Array.isArray(docs) ? docs : [];
}

async function userHasActiveWebPush(userId) {
  const uid = normalizeUserId(userId);
  if (!uid || !isPushEnabled()) return false;
  try {
    const hit = await SiteDocument.exists({ docType: DOC, userId: uid });
    return Boolean(hit);
  } catch {
    return false;
  }
}

function isMobilePushSubscription(sub) {
  const cls = pushDeviceClass(sub?.pushUserAgent, sub?.pushDeviceClass, sub?.pushEndpoint);
  if (cls === "mobile" || cls === "tablet") return true;
  const ua = String(sub?.pushUserAgent || "");
  if (/iPhone|iPad|iPod|Android|Mobile/i.test(ua)) return true;
  const host = pushEndpointHostHint(sub?.pushEndpoint);
  if (/web\.push\.apple\.com|push\.apple\.com/i.test(host)) return true;
  if (/fcm\.googleapis\.com|android\.googleapis\.com|firebase/i.test(host)) return true;
  if (/updates\.push\.services\.mozilla\.com/i.test(host) && /Mobile|Android|iPhone|iPad/i.test(ua)) {
    return true;
  }
  return false;
}

function isApplePushSubscription(sub) {
  try {
    const host = new URL(String(sub?.pushEndpoint || "")).host;
    if (/web\.push\.apple\.com|push\.apple\.com/i.test(host)) return true;
  } catch (_) {}
  const ua = String(sub?.pushUserAgent || "");
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  if (/Macintosh/i.test(ua) && /Safari/i.test(ua) && !/Chrome|Chromium|Firefox|Android|CriOS|FxiOS/i.test(ua)) {
    return true;
  }
  return false;
}

function isDesktopPushSubscription(sub) {
  if (isMobilePushSubscription(sub)) return false;
  if (isApplePushSubscription(sub)) return false;
  const ua = String(sub?.pushUserAgent || "");
  if (/Windows|Macintosh|Linux|X11/i.test(ua) && !/Mobile/i.test(ua)) return true;
  return false;
}

async function sendWebPushToUser(userId, payload = {}, sendOpts = {}) {
  if (!ensureVapidConfigured()) return { ok: false, skipped: true, reason: "vapid_missing" };
  const uid = normalizeUserId(userId);
  if (!uid) return { ok: false, skipped: true, reason: "invalid_user" };
  const subs = await listSubscriptionsForUser(uid);
  if (!subs.length) return { ok: true, sent: 0, mobileSent: 0, mobileFailed: 0, mobileTargets: 0, desktopSent: 0, skippedGone: 0 };
  /* votePushPhoneRetry1: deviceFilter=mobile|desktop — retry telefono senza ri-pingare PC */
  const deviceFilter = String(sendOpts.deviceFilter || payload.deviceFilter || "")
    .trim()
    .toLowerCase();

  const isDismiss = String(payload.type || "").trim().toLowerCase() === "dismiss";
  const ticketId = String(payload.ticketId || "").trim().slice(0, 40);
  const title = pushDisplayTitle(payload.title, payload.body);
  const body = String(payload.body || "").trim().slice(0, 500);
  const openUrl = absoluteOpenUrl(payload.openUrl);
  const kind = String(payload.kind || "info").trim().slice(0, 24);
  const origin = resolveSitePublicOrigin().replace("://viniliecaffe.it", "://www.viniliecaffe.it");
  const icon = `${origin}${PUSH_NOTIFICATION_ICON}`;
  const data = JSON.stringify(
    isDismiss
      ? {
          type: "dismiss",
          ticketId,
          id: String(payload.id || "").trim().slice(0, 40),
          ids: Array.isArray(payload.ids)
            ? payload.ids.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 80)
            : [],
          ticketIds: Array.isArray(payload.ticketIds)
            ? payload.ticketIds
                .map((x) => String(x || "").trim().toLowerCase())
                .filter((x) => /^[a-f0-9]{24}$/i.test(x))
                .slice(0, 40)
            : [],
          openUrls: Array.isArray(payload.openUrls)
            ? payload.openUrls.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 40)
            : [],
          pageUrl: String(payload.pageUrl || "").trim().slice(0, 500),
          all: payload.all === true,
        }
      : {
          title,
          body,
          openUrl,
          kind,
          id: String(payload.id || "").trim().slice(0, 40),
          ticketId,
          messageId: /^[a-f0-9]{24}$/i.test(String(payload.messageId || "").trim())
            ? String(payload.messageId).trim().toLowerCase()
            : "",
          channel: String(payload.channel || "").trim().slice(0, 16),
          dedupeKey: String(payload.dedupeKey || "").trim().slice(0, 180),
          /* notifDigestRace1 */
          msgCount: Number(payload.msgCount) > 0 ? Math.min(99, Math.floor(Number(payload.msgCount))) : 0,
          /* pushDismissAllFix1: createdAt per non far bloccare push nuove da allUntil */
          createdAt: Number(payload.createdAt || Date.now()) || Date.now(),
          /* notifBellInboxBadge1 */
          icon,
          badge: icon,
        },
  );

  /* notifPushSync1: content TTL 30m (5m droppava push se telefono offline breve).
     votePushTtl1: promemoria voto → TTL lungo (claim monouso: se drop FCM non ritenta).
     notifDigestRace1: digest/queue → TTL lungo (telefono offline non perde il banner).
     pushPhoneHeal1: anche coda ticket unclaimed = TTL lungo. */
  const kindLc = String(payload.kind || "").trim().toLowerCase();
  const isVoteReminder =
    kindLc === "vote_reminder" ||
    /vote_reminder_/i.test(String(payload.dedupeKey || "")) ||
    /promemoria\s+voto/i.test(String(payload.title || ""));
  const isDigestPush =
    /:digest:/i.test(String(payload.dedupeKey || "")) || Number(payload.msgCount) > 1;
  const isQueuePush = /^web_ticket:queue:/i.test(String(payload.dedupeKey || ""));
  const ttlOverride = Number(payload.ttlSeconds);
  const ttlSec = Number.isFinite(ttlOverride) && ttlOverride > 0
    ? Math.min(86_400, Math.floor(ttlOverride))
    : isDismiss
      ? 60 * 30
      : isVoteReminder || isDigestPush || isQueuePush
        ? 60 * 60 * 12
        : 60 * 60;
  const pushOpts = {
    TTL: ttlSec,
    urgency: "high",
  };
  /* votePushPairPhone1: Topic FCM distinto per listing — altrimenti 2 reminder
     consecutivi collassano e sul telefono ne resta uno (PC WNS no). */
  if (isVoteReminder) {
    const dk = String(payload.dedupeKey || "").toLowerCase();
    const titleLc = String(payload.title || "").toLowerCase();
    let topic = "vcvoterem";
    if (/_topgg|top\.gg|topgg/.test(dk) || /top\.gg/.test(titleLc)) topic = "vcvotetop";
    else if (/_discadia|discadia/.test(dk) || /discadia/.test(titleLc)) topic = "vcvotedis";
    pushOpts.headers = { Topic: topic };
  }

  let sent = 0;
  let failed = 0;
  let skippedGone = 0;
  let mobileSent = 0;
  let mobileFailed = 0;
  let mobileTargets = 0;
  let mobileCandidates = 0;
  let desktopSent = 0;
  const targets = [];
  for (const sub of subs) {
    /* pushDismissAllDevices1: dismiss anche su Apple — SW chiude senza showNotification
       (prima skippato per evitare banner blank; dismiss non mostra UI). */
    /* pushPhoneNoEmpty1: dismiss → telefono già chiude OS in-page; push dismiss + ack
       ZWSP/testuale = banner vuoti/spam. Skip mobile/Apple, tieni PC. */
    const mobileLike = isMobilePushSubscription(sub) || isApplePushSubscription(sub);
    if (isDismiss && mobileLike) continue;
    if (deviceFilter === "mobile" && !mobileLike) continue;
    if (deviceFilter === "desktop" && mobileLike) continue;
    const endpoint = normalizeEndpoint(sub.pushEndpoint);
    const p256dh = normalizeKey(sub.pushP256dh);
    const auth = normalizeKey(sub.pushAuth, 256);
    if (!endpoint || !p256dh || !auth) continue;
    if (mobileLike) mobileCandidates += 1;
    /* pushGoneQuiet1: non chiamare FCM se già in denylist — evita storm di warn 410 */
    if (await isPushEndpointRecentlyGone(endpoint)) {
      await removeWebPushByEndpoint(endpoint);
      skippedGone += 1;
      if (mobileLike) mobileFailed += 1;
      continue;
    }
    if (mobileLike) mobileTargets += 1;
    targets.push({ sub, endpoint, p256dh, auth, mobile: mobileLike });
  }
  /* phoneNotifFlyCard1: mobile/Apple prima + invii in parallelo (meno ritardo OS). */
  targets.sort((a, b) => Number(b.mobile) - Number(a.mobile));

  async function sendOne(target) {
    const { endpoint, p256dh, auth } = target;
    try {
      await webpush.sendNotification(
        { endpoint, keys: { p256dh, auth } },
        data,
        pushOpts,
      );
      return { ok: true };
    } catch (err) {
      if (pushOpts.headers && Number(err?.statusCode) !== 404 && Number(err?.statusCode) !== 410) {
        try {
          const { headers: _topic, ...withoutTopic } = pushOpts;
          await webpush.sendNotification(
            { endpoint, keys: { p256dh, auth } },
            data,
            withoutTopic,
          );
          return { ok: true };
        } catch (err2) {
          err = err2 || err;
        }
      }
      /* Transient FCM 5xx (non permanent): un retry dopo 400ms */
      const status0 = Number(err?.statusCode) || 0;
      const msg0 = Buffer.isBuffer(err?.body)
        ? err.body.toString("utf8")
        : String(err?.body || err?.message || "");
      const isPermanentHint = /permanent|do not retry|gone|unsubscribed|not\s*registered|invalid|expired/i.test(
        msg0,
      );
      if (status0 >= 500 && status0 < 600 && !isPermanentHint) {
        try {
          await new Promise((r) => setTimeout(r, 400));
          await webpush.sendNotification(
            { endpoint, keys: { p256dh, auth } },
            data,
            pushOpts,
          );
          return { ok: true };
        } catch (err3) {
          err = err3 || err;
        }
      }
      const status = Number(err?.statusCode) || 0;
      let host = "";
      try {
        host = new URL(endpoint).host;
      } catch (_) {}
      const errMsg = Buffer.isBuffer(err?.body)
        ? err.body.toString("utf8")
        : String(err?.body || err?.message || "");
      /* pushMultiDevice3: FCM 500 permanent = endpoint morto
         pushGoneQuiet1: 410/404 attesi = purge silenzioso (no warn storm in pm2) */
      const permanentGone =
        status === 404 ||
        status === 410 ||
        status === 403 ||
        (status >= 400 &&
          status < 500 &&
          /gone|unsubscribed|not\s*registered|invalid|expired/i.test(errMsg)) ||
        (status === 500 && /permanent|do not retry/i.test(errMsg));
      if (permanentGone) {
        await markPushEndpointGone(endpoint);
        await removeWebPushByEndpoint(endpoint);
        return { ok: false, gone: true };
      }
      global.logger?.warn?.("[siteWebPush] send failed:", {
        host,
        status: status || undefined,
        message: errMsg.slice(0, 240),
      });
      return { ok: false, gone: false };
    }
  }

  const results = await Promise.all(targets.map((t) => sendOne(t)));
  for (let i = 0; i < results.length; i += 1) {
    const r = results[i];
    const mobile = Boolean(targets[i] && targets[i].mobile);
    if (r && r.ok) {
      sent += 1;
      if (mobile) mobileSent += 1;
      else desktopSent += 1;
    } else {
      failed += 1;
      if (mobile) mobileFailed += 1;
    }
  }
  return {
    ok: true,
    sent,
    failed,
    skippedGone,
    mobileSent,
    mobileFailed,
    mobileTargets,
    /* votePushPhoneRetry1: include denylist/gone mobile so caller può ritentare */
    mobileCandidates,
    desktopSent,
  };
}

module.exports = {
  getPublicVapidKey,
  isPushEnabled,
  upsertWebPushSubscription,
  removeWebPushSubscription,
  listSubscriptionsForUser,
  pruneWebPushSubscriptionsForUser,
  userHasActiveWebPush,
  sendWebPushToUser,
  absoluteOpenUrl,
  isPushEndpointRecentlyGone,
  markPushEndpointGone,
  removeWebPushByEndpoint,
};
