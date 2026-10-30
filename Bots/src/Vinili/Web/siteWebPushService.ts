/* Notifiche push del sito (Web Push con chiavi VAPID).
   Regole, valide per tutti i browser (Chrome/Edge/Firefox/Android, Safari e iPhone):
   - ogni push mostra una notifica vera. Mai push "silenziose" (per chiudere banner o
     aggiornare il badge): iOS revoca l'iscrizione dopo poche, Chrome mostra "sito aggiornato
     in background" e rallenta le successive. Letto/badge tra dispositivi si sincronizzano
     quando si apre il sito (lato pagina) o con la notifica successiva (unreadCount nel payload).
   - si manda a tutti i dispositivi dell'utente, senza indovinare se sono telefoni o PC.
   - nuovi tentativi solo sugli errori temporanei (429/5xx/rete) e solo per quel dispositivo.
   - un'iscrizione si cancella solo quando il servizio push dice che non esiste più (404/410).
   iPhone/iPad/Mac Safari ricevono il formato "dichiarativo" (web_push 8030): il sistema mostra la
   notifica da solo, anche se il service worker non parte. Gli altri il formato classico letto da /sw.js. */
const crypto = require("crypto");
const webpush = require("web-push");
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../Schemas/Community/communitySchemas") as typeof import("../Schemas/Community/communitySchemas");

const DOC = SITE_DOCUMENT_TYPE.WEB_PUSH_SUBSCRIPTION;
const DEFAULT_SITE_ORIGIN = "https://www.viniliecaffe.it";
/* PNG statico: una GIF come icona a volte fa fallire la notifica (Chrome) o il formato Apple. */
const PUSH_NOTIFICATION_ICON = "/images/og-server-icon-still.png";
/* Dispositivi tenuti per utente: i più recenti (ogni apertura del sito rinfresca il proprio). */
const MAX_PUSH_SUBS_PER_USER = 15;
const DEFAULT_TTL_SEC = 12 * 60 * 60;
const RETRY_DELAYS_MS = [1_000, 5_000, 20_000];
const SEND_CONCURRENCY = 7;

let vapidConfigured = false;

function normalizeUserId(userId?) {
  const s = String(userId || "").trim();
  return /^\d{17,22}$/.test(s) ? s : "";
}

function resolveSitePublicOrigin() {
  const raw = String(
    process.env.WEBSITE_PUBLIC_ORIGIN || process.env.WEBSITE_PUBLIC_URL || DEFAULT_SITE_ORIGIN,
  )
    .trim()
    .replace(/\/+$/, "");
  /* sempre www: il service worker vive su www e scarta i link verso altri host */
  return (raw || DEFAULT_SITE_ORIGIN).replace("://viniliecaffe.it", "://www.viniliecaffe.it");
}

function absoluteOpenUrl(openUrl?) {
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

function normalizeEndpoint(endpoint?) {
  const s = String(endpoint || "").trim();
  if (!s || s.length > 2048) return "";
  if (!/^https:\/\//i.test(s)) return "";
  return s;
}

function normalizeKey(value?, max = 512) {
  const s = String(value || "").trim();
  if (!s || s.length > max) return "";
  return s;
}

function endpointHost(endpointRaw?) {
  try {
    return new URL(String(endpointRaw || "")).host.toLowerCase();
  } catch (_) {
    return "";
  }
}

function isApplePushEndpoint(endpointRaw?) {
  return /(^|\.)push\.apple\.com$/i.test(endpointHost(endpointRaw));
}

/* Solo per le statistiche restituite ai chiamanti: l'invio non dipende da questo. */
function isMobileUa(uaRaw?) {
  return /iPhone|iPad|iPod|Android|Mobile/i.test(String(uaRaw || ""));
}

function clampBadge(n?) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return -1;
  return Math.max(0, Math.min(99, Math.floor(v)));
}

/* ---------- iscrizioni ---------- */

async function pruneWebPushSubscriptionsForUser(userId?) {
  const uid = normalizeUserId(userId);
  if (!uid) return { ok: false, dropped: 0 };
  try {
    const docs = await SiteDocument.find({ docType: DOC, userId: uid })
      .select("_id updatedAt createdAt")
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean()
      .catch(() => []);
    if (!Array.isArray(docs) || docs.length <= MAX_PUSH_SUBS_PER_USER) return { ok: true, dropped: 0 };
    const dropIds = docs.slice(MAX_PUSH_SUBS_PER_USER).map((d?) => d._id);
    const res = await SiteDocument.deleteMany({ docType: DOC, userId: uid, _id: { $in: dropIds } }).catch(() => null);
    return { ok: true, dropped: Number(res?.deletedCount) || dropIds.length };
  } catch (err) {
    global.logger?.warn?.("[siteWebPush] prune failed:", err?.message || err);
    return { ok: false, dropped: 0 };
  }
}

/* Il sito la richiama a ogni apertura: aggiorna chiavi/utente e la data (serve al prune). */
async function upsertWebPushSubscription(userId?, subscription?, meta: Record<string, any> = {}) {
  const uid = normalizeUserId(userId);
  const endpoint = normalizeEndpoint(subscription?.endpoint);
  const p256dh = normalizeKey(subscription?.keys?.p256dh);
  const auth = normalizeKey(subscription?.keys?.auth, 256);
  if (!uid || !endpoint || !p256dh || !auth) {
    return { ok: false, error: "invalid_subscription" };
  }
  const userAgent = String(meta.userAgent || "").trim().slice(0, 300);
  const clientDeviceClass = String(meta.deviceClass || meta.clientDeviceClass || "")
    .trim()
    .toLowerCase()
    .slice(0, 16);
  const standalone = meta.standalone === true || meta.standalone === "true" || meta.standalone === 1;
  try {
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
          pushDeviceClass: isMobileUa(userAgent) ? "mobile" : "desktop",
          pushClientDeviceClass: clientDeviceClass,
          pushStandalone: Boolean(standalone),
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

async function removeWebPushSubscription(userId?, endpointRaw?) {
  const uid = normalizeUserId(userId);
  const endpoint = normalizeEndpoint(endpointRaw);
  if (!uid || !endpoint) return { ok: false, error: "invalid_subscription" };
  const res = await SiteDocument.deleteOne({ docType: DOC, userId: uid, pushEndpoint: endpoint }).catch(() => null);
  return { ok: true, deleted: Number(res?.deletedCount) || 0 };
}

async function removeWebPushByEndpoint(endpointRaw?) {
  const endpoint = normalizeEndpoint(endpointRaw);
  if (!endpoint) return 0;
  const res = await SiteDocument.deleteMany({ docType: DOC, pushEndpoint: endpoint }).catch(() => null);
  return Number(res?.deletedCount) || 0;
}

async function listSubscriptionsForUser(userId?) {
  const uid = normalizeUserId(userId);
  if (!uid) return [];
  const docs = await SiteDocument.find({ docType: DOC, userId: uid })
    .select("pushEndpoint pushP256dh pushAuth pushUserAgent pushDeviceClass pushStandalone updatedAt createdAt")
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean()
    .catch(() => []);
  return Array.isArray(docs) ? docs : [];
}

async function userHasActiveWebPush(userId?) {
  const uid = normalizeUserId(userId);
  if (!uid || !isPushEnabled()) return false;
  try {
    return Boolean(await SiteDocument.exists({ docType: DOC, userId: uid }));
  } catch {
    return false;
  }
}

/* ---------- contenuto ---------- */

function isBlankPushField(s?) {
  return !String(s || "")
    .replace(/[​‌‍﻿ ]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function looksLikeSiteName(s?) {
  const t = String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
  return !t || /^(vinili\s*[&e]\s*caff[eè]?|viniliecaffe|vinili)$/i.test(t);
}

/* Testo vero o niente: una notifica "Vinili & Caffè / Nuova notifica" non dice nulla. */
function buildPushText(payload?) {
  const rawTitle = String(payload?.title || "").trim();
  const rawBody = String(payload?.body || "").trim().slice(0, 500);
  const meaningful = (s?) => !isBlankPushField(s) && !looksLikeSiteName(s) && !/^nuova\s+notifica$/i.test(String(s).trim());
  if (!meaningful(rawTitle) && !meaningful(rawBody)) return null;
  let title = meaningful(rawTitle) ? rawTitle.slice(0, 120) : "";
  let body = meaningful(rawBody) ? rawBody : "";
  if (!title) {
    const first = body.split("\n")[0];
    title = (first.length > 72 ? `${first.slice(0, 71)}…` : first).slice(0, 120);
    if (body === first) body = "";
  }
  return { title, body };
}

/* Topic: le push non ancora consegnate con lo stesso Topic si sostituiscono (FCM/Mozilla).
   Riepiloghi e code ticket ne usano uno fisso (l'ultimo aggiornato basta), il resto uno per notifica. */
function pushTopicFor(payload?) {
  const dk = String(payload?.dedupeKey || "").trim();
  const replaceable = /:digest:/i.test(dk) || /^web_ticket:queue:/i.test(dk) || Number(payload?.msgCount) > 1;
  const seed = replaceable ? `d:${dk}` : `n:${String(payload?.id || "") || dk || crypto.randomUUID()}`;
  /* 24 caratteri base64url: alfabeto e lunghezza accettati da tutti i servizi */
  return crypto.createHash("sha256").update(seed).digest("base64url").slice(0, 24);
}

function buildClassicPayload(fields?) {
  return {
    title: fields.title,
    body: fields.body,
    openUrl: fields.openUrl,
    kind: fields.kind,
    id: fields.id,
    ticketId: fields.ticketId,
    messageId: fields.messageId,
    channel: fields.channel,
    dedupeKey: fields.dedupeKey,
    msgCount: fields.msgCount,
    createdAt: fields.createdAt,
    unreadCount: fields.unreadCount,
    ...(fields.unreadCount >= 0 ? { app_badge: fields.unreadCount } : {}),
    tag: fields.tag,
    icon: fields.icon,
    badge: fields.icon,
  };
}

/* Formato dichiarativo Apple (iOS/iPadOS 18.4+, macOS Safari 18.5+): la notifica la mostra il sistema.
   Sulle versioni vecchie arriva al service worker come push normale, che legge "notification". */
function buildAppleDeclarativePayload(fields?) {
  const badge = fields.unreadCount >= 0 ? String(fields.unreadCount) : undefined;
  return {
    web_push: 8030,
    notification: {
      title: fields.title,
      ...(fields.body ? { body: fields.body } : {}),
      navigate: fields.openUrl,
      lang: "it",
      dir: "ltr",
      silent: false,
      ...(fields.tag ? { tag: fields.tag } : {}),
      data: {
        url: fields.openUrl,
        openUrl: fields.openUrl,
        id: fields.id,
        ticketId: fields.ticketId,
        messageId: fields.messageId,
        kind: fields.kind,
        dedupeKey: fields.dedupeKey,
        channel: fields.channel,
        createdAt: fields.createdAt,
        unreadCount: fields.unreadCount,
      },
      ...(badge !== undefined ? { app_badge: badge } : {}),
    },
    ...(badge !== undefined ? { app_badge: badge } : {}),
  };
}

/* ---------- invio ---------- */

function errorText(err?) {
  return Buffer.isBuffer(err?.body) ? err.body.toString("utf8") : String(err?.body || err?.message || "");
}

/* 404/410: iscrizione scaduta o revocata. 403 fuori da Apple: creata con altre chiavi VAPID,
   non potrà mai funzionare. (Apple 403 = problema del nostro token, non del dispositivo.) */
function isGoneError(status?, endpoint?) {
  if (status === 404 || status === 410) return true;
  if (status === 403 && !isApplePushEndpoint(endpoint)) return true;
  return false;
}

function isTransientError(status?) {
  return !status || status === 429 || (status >= 500 && status < 600);
}

const wait = (ms?) => new Promise((r?) => setTimeout(r, ms));

async function deliverToSubscription(sub?, fields?, opts?) {
  const endpoint = normalizeEndpoint(sub?.pushEndpoint);
  const p256dh = normalizeKey(sub?.pushP256dh);
  const auth = normalizeKey(sub?.pushAuth, 256);
  if (!endpoint || !p256dh || !auth) return { ok: false, invalid: true };
  const apple = isApplePushEndpoint(endpoint);
  const body = JSON.stringify(apple ? buildAppleDeclarativePayload(fields) : buildClassicPayload(fields));
  const sendOpts: Record<string, any> = { TTL: opts.ttlSec, urgency: "high" };
  /* Apple non usa il Topic e in passato lo rifiutava (BadWebPushTopic): solo agli altri */
  if (!apple && opts.topic) sendOpts.headers = { Topic: opts.topic };
  let lastErr = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      await webpush.sendNotification({ endpoint, keys: { p256dh, auth } }, body, sendOpts);
      return { ok: true, apple };
    } catch (err) {
      lastErr = err;
      const status = Number(err?.statusCode) || 0;
      if (isGoneError(status, endpoint)) {
        await removeWebPushByEndpoint(endpoint);
        return { ok: false, gone: true, apple };
      }
      if (status === 400 && /topic/i.test(errorText(err)) && sendOpts.headers) {
        delete sendOpts.headers;
        continue;
      }
      if (!isTransientError(status) || attempt >= RETRY_DELAYS_MS.length) break;
      await wait(RETRY_DELAYS_MS[attempt]);
    }
  }
  global.logger?.warn?.("[siteWebPush] send failed:", {
    host: endpointHost(endpoint),
    status: Number(lastErr?.statusCode) || undefined,
    message: errorText(lastErr).slice(0, 240),
  });
  return { ok: false, apple };
}

async function mapPool(items?, concurrency?, worker?) {
  const out = new Array(items.length);
  let next = 0;
  const n = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) {
        const i = next;
        next += 1;
        out[i] = await worker(items[i], i);
      }
    }),
  );
  return out;
}

function buildFields(payload?, text?) {
  const id = String(payload.id || "").trim().slice(0, 40);
  const origin = resolveSitePublicOrigin();
  const msgId = String(payload.messageId || "").trim();
  return {
    title: text.title,
    body: text.body,
    openUrl: absoluteOpenUrl(payload.openUrl),
    kind: String(payload.kind || "info").trim().slice(0, 24),
    id,
    ticketId: String(payload.ticketId || "").trim().slice(0, 40),
    messageId: /^[a-f0-9]{24}$/i.test(msgId) ? msgId.toLowerCase() : "",
    channel: String(payload.channel || "").trim().slice(0, 16),
    dedupeKey: String(payload.dedupeKey || "").trim().slice(0, 180),
    msgCount: Number(payload.msgCount) > 0 ? Math.min(99, Math.floor(Number(payload.msgCount))) : 0,
    createdAt: Number(payload.createdAt || Date.now()) || Date.now(),
    unreadCount: clampBadge(payload.unreadCount),
    tag: id ? `vc-site-${id}` : "",
    icon: `${origin}${PUSH_NOTIFICATION_ICON}`,
  };
}

/**
 * Manda una notifica a tutti i dispositivi dell'utente (o solo a `sendOpts.endpoint`).
 * Le push type=dismiss non esistono più: si ignorano (vedi intestazione).
 */
async function sendWebPushToUser(userId?, payload: Record<string, any> = {}, sendOpts: Record<string, any> = {}) {
  const empty = { ok: true, sent: 0, failed: 0, skippedGone: 0, mobileSent: 0, mobileFailed: 0, mobileTargets: 0, mobileCandidates: 0, mobileAppleSent: 0, desktopSent: 0 };
  if (String(payload.type || "").trim().toLowerCase() === "dismiss") return { ...empty, skipped: true, reason: "dismiss_disabled" };
  if (!ensureVapidConfigured()) return { ...empty, ok: false, skipped: true, reason: "vapid_missing" };
  const uid = normalizeUserId(userId);
  if (!uid) return { ...empty, ok: false, skipped: true, reason: "invalid_user" };
  const text = buildPushText(payload);
  if (!text) return { ...empty, skipped: true, reason: "empty_payload" };

  let subs = await listSubscriptionsForUser(uid);
  const onlyEndpoint = normalizeEndpoint(sendOpts.endpoint);
  if (onlyEndpoint) subs = subs.filter((s?) => normalizeEndpoint(s.pushEndpoint) === onlyEndpoint);
  if (!subs.length) return empty;

  const fields = buildFields(payload, text);
  const ttlOverride = Number(payload.ttlSeconds);
  const ttlSec = Number.isFinite(ttlOverride) && ttlOverride > 0 ? Math.min(86_400, Math.floor(ttlOverride)) : DEFAULT_TTL_SEC;
  const opts = { ttlSec: Math.max(ttlSec, 60 * 60), topic: pushTopicFor(payload) };

  const results = await mapPool(subs, SEND_CONCURRENCY, (sub?) => deliverToSubscription(sub, fields, opts));
  const out = { ...empty };
  subs.forEach((sub?, i?) => {
    const r = results[i] || {};
    const mobile = isMobileUa(sub.pushUserAgent);
    if (mobile) {
      out.mobileCandidates += 1;
      out.mobileTargets += 1;
    }
    if (r.ok) {
      out.sent += 1;
      if (mobile) {
        out.mobileSent += 1;
        if (r.apple) out.mobileAppleSent += 1;
      } else out.desktopSent += 1;
    } else {
      out.failed += 1;
      if (r.gone) out.skippedGone += 1;
      if (mobile) out.mobileFailed += 1;
    }
  });
  return out;
}

/* Notifica di prova dalla pagina notifiche: solo al dispositivo che la chiede. */
async function sendWebPushTestToEndpoint(userId?, endpointRaw?) {
  const endpoint = normalizeEndpoint(endpointRaw);
  if (!endpoint) return { ok: false, error: "invalid_endpoint" };
  const uid = normalizeUserId(userId);
  const known = uid ? await SiteDocument.exists({ docType: DOC, userId: uid, pushEndpoint: endpoint }).catch(() => null) : null;
  if (!known) return { ok: false, error: "not_registered" };
  const out = await sendWebPushToUser(
    uid,
    {
      title: "Notifiche attive ✓",
      body: "Questo dispositivo riceve le notifiche di Vinili & Caffè.",
      openUrl: "/notifications/",
      kind: "info",
      id: `test${Date.now().toString(36)}`,
      ttlSeconds: 60 * 10,
    },
    { endpoint },
  );
  if (out.sent > 0) return { ok: true };
  return { ok: false, error: out.skippedGone > 0 ? "endpoint_gone" : "send_failed" };
}

/* Compatibilità con i vecchi chiamanti: denylist, conferme "mostrata" e rotazione Apple non esistono più. */
async function isPushEndpointRecentlyGone(_endpointRaw?) {
  return false;
}
async function markPushEndpointGone(endpointRaw?) {
  await removeWebPushByEndpoint(endpointRaw);
}
async function clearPushEndpointGone(_endpointRaw?) {}
async function noteWebPushShown(_idRaw?, _dedupeKeyRaw?, _meta: Record<string, any> = {}) {
  return { ok: true, ignoredForHedge: true, client: null };
}
async function wasWebPushShown(_idRaw?, _dedupeKeyRaw?) {
  return false;
}
async function rotateApplePushSubscriptionsForUser(_userId?, _reason?) {
  return { ok: true, rotated: 0, skipped: true };
}

export = {
  getPublicVapidKey,
  isPushEnabled,
  upsertWebPushSubscription,
  removeWebPushSubscription,
  listSubscriptionsForUser,
  pruneWebPushSubscriptionsForUser,
  userHasActiveWebPush,
  sendWebPushToUser,
  sendWebPushTestToEndpoint,
  absoluteOpenUrl,
  isPushEndpointRecentlyGone,
  markPushEndpointGone,
  clearPushEndpointGone,
  removeWebPushByEndpoint,
  noteWebPushShown,
  wasWebPushShown,
  rotateApplePushSubscriptionsForUser,
};
