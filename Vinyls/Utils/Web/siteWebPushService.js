const webpush = require("web-push");
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");

const DOC = SITE_DOCUMENT_TYPE.WEB_PUSH_SUBSCRIPTION;
const DEFAULT_SITE_ORIGIN = "https://www.viniliecaffe.it";
const PUSH_NOTIFICATION_ICON = "/images/vc-server-icon.png";

let vapidConfigured = false;

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
  return raw || DEFAULT_SITE_ORIGIN;
}

function absoluteOpenUrl(openUrl) {
  const u = String(openUrl || "").trim();
  const origin = resolveSitePublicOrigin();
  if (!u) return `${origin}/`;
  if (/^https?:\/\//i.test(u)) return u.slice(0, 2000);
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

async function upsertWebPushSubscription(userId, subscription, meta = {}) {
  const uid = normalizeUserId(userId);
  const endpoint = normalizeEndpoint(subscription?.endpoint);
  const p256dh = normalizeKey(subscription?.keys?.p256dh);
  const auth = normalizeKey(subscription?.keys?.auth, 256);
  if (!uid || !endpoint || !p256dh || !auth) {
    return { ok: false, error: "invalid_subscription" };
  }
  const userAgent = String(meta.userAgent || "").trim().slice(0, 300);
  try {
    const existing = await SiteDocument.findOne({ docType: DOC, pushEndpoint: endpoint })
      .select("userId pushP256dh pushAuth pushUserAgent")
      .lean()
      .catch(() => null);
    const same =
      existing &&
      String(existing.userId || "") === uid &&
      String(existing.pushP256dh || "") === p256dh &&
      String(existing.pushAuth || "") === auth &&
      (!userAgent || String(existing.pushUserAgent || "") === userAgent);
    if (same) return { ok: true, unchanged: true };

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
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    // Un solo endpoint per stesso UA: tab + PWA sullo stesso browser altrimenti
    // mandano due push OS identiche sullo stesso device.
    if (userAgent) {
      await SiteDocument.deleteMany({
        docType: DOC,
        userId: uid,
        pushUserAgent: userAgent,
        pushEndpoint: { $ne: endpoint },
      }).catch(() => null);
    }
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
  const docs = await SiteDocument.find({ docType: DOC, userId: uid })
    .select("pushEndpoint pushP256dh pushAuth pushUserAgent updatedAt createdAt")
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean()
    .catch(() => []);
  const list = Array.isArray(docs) ? docs : [];
  // Stesso browser/UA = stesso device: una sola push (evita tab+PWA doppie).
  const seenUa = new Set();
  const out = [];
  for (const sub of list) {
    const ua = String(sub?.pushUserAgent || "").trim();
    if (ua) {
      if (seenUa.has(ua)) continue;
      seenUa.add(ua);
    }
    out.push(sub);
  }
  return out;
}

function isMobilePushSubscription(sub) {
  const ua = String(sub?.pushUserAgent || "");
  if (/iPhone|iPad|iPod|Android|Mobile/i.test(ua)) return true;
  try {
    const host = new URL(String(sub?.pushEndpoint || "")).host;
    if (/web\.push\.apple\.com|push\.apple\.com/i.test(host)) return true;
  } catch (_) {}
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

/**
 * @param {string} userId
 * @param {{ title?: string, body?: string, openUrl?: string, kind?: string, id?: string, ticketId?: string, type?: string, all?: boolean }} payload
 */
async function sendWebPushToUser(userId, payload = {}) {
  if (!ensureVapidConfigured()) return { ok: false, skipped: true, reason: "vapid_missing" };
  const uid = normalizeUserId(userId);
  if (!uid) return { ok: false, skipped: true, reason: "invalid_user" };
  const subs = await listSubscriptionsForUser(uid);
  if (!subs.length) return { ok: true, sent: 0 };

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
          icon,
          badge: icon,
        },
  );

  const pushOpts = {
    TTL: isDismiss ? 60 * 30 : 60 * 60 * 24,
    urgency: isDismiss ? "normal" : "high",
  };

  let sent = 0;
  let failed = 0;
  for (const sub of subs) {
    // iOS/Android: un push "dismiss" diventa una notifica vuota (Apple obbliga
    // uno show, Chrome mostra "updated in the background"). Solo desktop.
    // iOS: un push "dismiss" senza show diventa toast di sistema / vuota.
    // Android: close() nel SW basta. Desktop: close() ok.
    if (isDismiss && isApplePushSubscription(sub)) continue;
    const endpoint = normalizeEndpoint(sub.pushEndpoint);
    const p256dh = normalizeKey(sub.pushP256dh);
    const auth = normalizeKey(sub.pushAuth, 256);
    if (!endpoint || !p256dh || !auth) continue;
    try {
      await webpush.sendNotification(
        {
          endpoint,
          keys: { p256dh, auth },
        },
        data,
        pushOpts,
      );
      sent += 1;
    } catch (err) {
      let retried = false;
      if (pushOpts.headers && Number(err?.statusCode) !== 404 && Number(err?.statusCode) !== 410) {
        try {
          const { headers: _topic, ...withoutTopic } = pushOpts;
          await webpush.sendNotification(
            { endpoint, keys: { p256dh, auth } },
            data,
            withoutTopic,
          );
          sent += 1;
          retried = true;
        } catch (_) {}
      }
      if (retried) continue;
      failed += 1;
      const status = Number(err?.statusCode) || 0;
      let host = "";
      try {
        host = new URL(endpoint).host;
      } catch (_) {}
      if (status === 404 || status === 410) {
        await removeWebPushByEndpoint(endpoint);
      } else {
        global.logger?.warn?.("[siteWebPush] send failed:", {
          host,
          status: status || undefined,
          message: err?.body || err?.message || String(err),
        });
      }
    }
  }
  return { ok: true, sent, failed };
}

module.exports = {
  getPublicVapidKey,
  isPushEnabled,
  upsertWebPushSubscription,
  removeWebPushSubscription,
  sendWebPushToUser,
  absoluteOpenUrl,
};
