const webpush = require("web-push");
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");

const DOC = SITE_DOCUMENT_TYPE.WEB_PUSH_SUBSCRIPTION;
const DEFAULT_SITE_ORIGIN = "https://www.viniliecaffe.it";

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
    try {
      const host = new URL(endpoint).host;
      global.logger?.info?.("[siteWebPush] subscription saved", { userId: uid, host });
    } catch (_) {}
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

async function listSubscriptionsForUser(userId) {
  const uid = normalizeUserId(userId);
  if (!uid) return [];
  const docs = await SiteDocument.find({ docType: DOC, userId: uid })
    .select("pushEndpoint pushP256dh pushAuth")
    .lean()
    .catch(() => []);
  return Array.isArray(docs) ? docs : [];
}

/**
 * @param {string} userId
 * @param {{ title?: string, body?: string, openUrl?: string, kind?: string }} payload
 */
async function sendWebPushToUser(userId, payload = {}) {
  if (!ensureVapidConfigured()) return { ok: false, skipped: true, reason: "vapid_missing" };
  const uid = normalizeUserId(userId);
  if (!uid) return { ok: false, skipped: true, reason: "invalid_user" };
  const subs = await listSubscriptionsForUser(uid);
  if (!subs.length) return { ok: true, sent: 0 };

  const title = String(payload.title || "Vinili & Caffè").trim().slice(0, 120) || "Vinili & Caffè";
  const body = String(payload.body || "").trim().slice(0, 500);
  const openUrl = absoluteOpenUrl(payload.openUrl);
  const kind = String(payload.kind || "info").trim().slice(0, 24);
  const origin = resolveSitePublicOrigin().replace("://viniliecaffe.it", "://www.viniliecaffe.it");
  const icon = `${origin}/apple-touch-icon.png`;
  const data = JSON.stringify({
    title,
    body,
    openUrl,
    kind,
    id: String(payload.id || "").trim().slice(0, 40),
    ticketId: String(payload.ticketId || "").trim().slice(0, 40),
    icon,
    badge: icon,
  });

  let sent = 0;
  let failed = 0;
  for (const sub of subs) {
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
        {
          // high: migliore consegna in background su iOS/Android (Apple throttla di più “normal”).
          TTL: 60 * 60 * 24,
          urgency: "high",
        },
      );
      sent += 1;
    } catch (err) {
      failed += 1;
      const status = Number(err?.statusCode) || 0;
      let host = "";
      try {
        host = new URL(endpoint).host;
      } catch (_) {}
      if (status === 404 || status === 410) {
        await removeWebPushByEndpoint(endpoint);
        global.logger?.info?.("[siteWebPush] removed stale endpoint", { host, status });
      } else {
        global.logger?.warn?.("[siteWebPush] send failed:", {
          host,
          status: status || undefined,
          message: err?.body || err?.message || String(err),
        });
      }
    }
  }
  if (sent || failed) {
    global.logger?.info?.("[siteWebPush] deliver", { userId: uid, sent, failed, subs: subs.length });
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
