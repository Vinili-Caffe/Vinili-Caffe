/* pushNoGhostTitle1: mai inviare/forzare titolo “Nuova notifica” su payload vuoto */
/* pushKillGhostSpam1: dismiss webpush solo mobile (desktop chiude in-page; evita
   storm “aggiornato in background” / ghost su Windows WNS) */
/* pushPhoneTicketAck1: TTL lungo su chat/mention/SLA ticket + SW Android ack */
/* iosWinProfilePush1: WNS/Windows mai dismiss; classificazione desktop più dura */
/* pushReadDismissBadge1: riabilita type=dismiss → mobile/Apple (SW fa close +
   quiet-ack userVisibleOnly + badge da unreadCount). Desktop resta in-page. */
/* pushBadgeSyncPhone1: dismiss di nuovo SOLO mobile/Apple — badge/OS sync cross-device.
   Desktop resta WS/in-page (no WNS storm). pushKillEmpty2: SW senza quiet-ack show. */
/* pushPhoneAlive2: STOP dismiss webpush (di nuovo). Con KillEmpty2 lo SW non fa
   showNotification su dismiss → Chrome/FCM userVisibleOnly ritarda/droppa i content
   push sul telefono finché non riapri la PWA. Badge al prossimo content / open app. */
/* pushReadCrossDismiss1: riabilita dismiss webpush (mark-read → altri device).
   Skip solo WNS Windows. SW: show+close riusando titolo/tag del banner match
   (userVisibleOnly senza banner vuoti ZWSP). */
/* pushPhoneAlive3: STOP dismiss webpush di nuovo. DotGhost ZWSP ack + dismiss
   storm = FCM/APNs userVisibleOnly ritarda/droppa i content su PC e telefono.
   Cross-device OS close resta WS/in-page; badge al prossimo content. */
/* badgeCrossDevice1: riabilita dismiss mobile/Apple (+ Chrome desktop non-WNS).
   SW: show silent riusando banner match (userVisibleOnly) + badge unreadCount.
   WNS resta skip (Action Center ghost). */
/* pushKillBgSpam1: STOP dismiss webpush DI NUOVO.
   Dismiss silent su Chrome/FCM = “Il sito è stato aggiornato in background” su PC
   + starve FCM/APNs → promemoria voto morti sul telefono. Cross-device = WS/in-page.
   FCM host da solo ≠ mobile (Chrome PC usa FCM). */
/* pushPhoneAlive4: dismiss webpush OFF di nuovo (anche mobile/Apple).
   fireNotifDismissPush + badgeCross/KillBgSpam2 rimandavano type=dismiss al telefono;
   SW silent/close → APNs/FCM userVisibleOnly droppa i content (mobileSent:1 senza banner).
   Cross-device close = solo WS/in-page. */
/* badgeOsDismiss1: dismiss mobile/Apple di nuovo (skip desktop/WNS).
   SW: dismissSatisfyVisible (reuse banner title, no ZWSP) + setAppBadge(unreadCount).
   Content push path invariato. */
/* pushIosNoEmptyDismiss1: STOP dismiss webpush verso Apple (iPhone/iPad).
   type=dismiss + SW tag-replace = banner vuoti a raffica + APNs starve
   (content solo all’apertura PWA / doppi). Android FCM dismiss resta. */
/* pushGoneResub1: Chrome/FCM riusa lo stesso endpoint dopo unsubscribe+subscribe.
   Denylist 7g che rifiuta il re-POST = push morte forever. Su upsert: clear gone
   e ri-accetta (il send successivo 410 ripulisce di nuovo). */
/* pushIosShowFirst1: hint client "desktop" su UA Macintosh iOS PWA non batte
   host web.push.apple.com → sempre mobile; max 2 Apple endpoint/utente. */
/* pushApplePhonePrefer1: Mac Safari/Dock non deve rubare lo slot Apple al telefono.
   UA Macintosh senza iPhone/iPad + senza hint client mobile/standalone = desktop.
   Prune Apple: preferisci UA iPhone/iPad > standalone mobile > Mac. */
/* pushAppleTopic1: APNs BadWebPushTopic su Topic con len%4===1 (es. vcninfo+10=17).
   Pad/trim topic; su Apple endpoint ometti Topic (FCM lo tiene per collapse).
   Retry BadWebPushTopic → senza Topic, non x-prefix. */
/* pushAppleShownAck1: APNs 201 ≠ banner. SW POST /push/shown dopo showNotification.
   pushClosedPwaNoRotate1: hedge senza ack NON ruota più (PWA chiusa ≠ token morto). */
/* pushShownAckCrossProc1: ack in Mongo — site-api riceve /push/shown, bots fa hedge.
   Prima Map in RAM → bots non vedeva mai l'ack → apple_hedge_exhausted + rotate falso. */
const webpush = require("web-push");
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");

const DOC = SITE_DOCUMENT_TYPE.WEB_PUSH_SUBSCRIPTION;
const GONE_DOC = SITE_DOCUMENT_TYPE.WEB_PUSH_GONE_ENDPOINT;
const SHOWN_DOC = SITE_DOCUMENT_TYPE.WEB_PUSH_SHOWN_ACK;
const DEFAULT_SITE_ORIGIN = "https://www.viniliecaffe.it";
/* pushPcBannerFix1: PNG anche su FCM/Chrome PC — GIF in icon a volte fa fallire showNotification. */
const PUSH_NOTIFICATION_ICON = "/images/og-server-icon-still.png";
/** Apple declarative: PNG statico (GIF a volte invalida icon URL → fallback SW silenzioso). */
const PUSH_NOTIFICATION_ICON_APPLE = "/images/og-server-icon-still.png";

let vapidConfigured = false;

/* pushAppleShownAck1: id/dedupeKey → last shown At (RAM cache locale processo) */
const pushShownAcks = new Map();
const PUSH_SHOWN_ACK_TTL_MS = 6 * 60 * 60 * 1000;

function prunePushShownAcks() {
  if (pushShownAcks.size < 800) return;
  const now = Date.now();
  for (const [k, at] of pushShownAcks) {
    if (now - Number(at || 0) > PUSH_SHOWN_ACK_TTL_MS) pushShownAcks.delete(k);
  }
}

/* pushShownAckPhoneOnly1: hedge telefono ascolta SOLO ack iPhone/iPad.
   Mac Safari è “Apple” ma non è il telefono — prima spegneva i retry. */
function classifyPushShownClient(raw, uaRaw) {
  const c = String(raw || "").trim().toLowerCase();
  /* pushIphoneMacUa1: client "ios" esplicito dal SW (desktop-UA PWA) ferma hedge */
  if (c === "iphone" || c === "ipad" || c === "ipod" || c === "ios") return "ios";
  if (c === "mac" || c === "macos" || c === "macintosh") return "mac";
  if (c === "android" || c === "other" || c === "desktop") return c === "android" ? "android" : "other";
  const ua = String(uaRaw || "");
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Macintosh/i.test(ua) && /Safari/i.test(ua) && !/Chrome|Chromium|Firefox|Android|CriOS|FxiOS|Edg\//i.test(ua)) {
    return "mac";
  }
  if (/Android/i.test(ua)) return "android";
  return "other";
}

function shownAckKeys(idRaw, dedupeKeyRaw, scope = "ios") {
  const id = String(idRaw || "").trim().slice(0, 80);
  const dk = String(dedupeKeyRaw || "").trim().slice(0, 180);
  const prefix = scope === "ios" ? "ios:" : scope === "mac" ? "mac:" : scope === "android" ? "and:" : "";
  const keys = [];
  if (id) keys.push(`${prefix}id:${id}`);
  if (dk) {
    keys.push(`${prefix}dk:${dk}`);
    const base = dk.replace(/:(?:mpr|pr|dpr)\d+$/i, "");
    if (base && base !== dk) keys.push(`${prefix}dk:${base}`);
  }
  return keys;
}

async function persistShownAckKey(key) {
  const k = String(key || "").trim().slice(0, 200);
  if (!k || !SHOWN_DOC) return;
  try {
    await SiteDocument.findOneAndUpdate(
      { docType: SHOWN_DOC, pushEndpoint: k },
      {
        $set: {
          docType: SHOWN_DOC,
          pushEndpoint: k,
          guildId: "",
          userId: "",
        },
      },
      { upsert: true, setDefaultsOnInsert: true },
    );
  } catch (err) {
    global.logger?.warn?.("[siteWebPush] shown-ack persist failed:", err?.message || err);
  }
}

async function noteWebPushShown(idRaw, dedupeKeyRaw, meta = {}) {
  const client = classifyPushShownClient(meta?.client, meta?.userAgent);
  /* Solo iOS phone/tablet ferma l’apple_zombie_hedge. Mac/desktop non contano. */
  if (client !== "ios") {
    return { ok: true, ignoredForHedge: true, client };
  }
  const keys = shownAckKeys(idRaw, dedupeKeyRaw, "ios");
  const now = Date.now();
  for (const k of keys) pushShownAcks.set(k, now);
  prunePushShownAcks();
  await Promise.all(keys.map((k) => persistShownAckKey(k)));
  return { ok: true, client };
}

function wasWebPushShownMemory(idRaw, dedupeKeyRaw) {
  const now = Date.now();
  const hit = (key) => {
    const at = Number(pushShownAcks.get(key) || 0);
    if (!at) return false;
    if (now - at > PUSH_SHOWN_ACK_TTL_MS) {
      pushShownAcks.delete(key);
      return false;
    }
    return true;
  };
  for (const k of shownAckKeys(idRaw, dedupeKeyRaw, "ios")) {
    if (hit(k)) return true;
  }
  return false;
}

async function wasWebPushShown(idRaw, dedupeKeyRaw) {
  if (wasWebPushShownMemory(idRaw, dedupeKeyRaw)) return true;
  const keys = shownAckKeys(idRaw, dedupeKeyRaw, "ios");
  if (!keys.length || !SHOWN_DOC) return false;
  try {
    const since = new Date(Date.now() - PUSH_SHOWN_ACK_TTL_MS);
    const doc = await SiteDocument.findOne({
      docType: SHOWN_DOC,
      pushEndpoint: { $in: keys },
      updatedAt: { $gte: since },
    })
      .select("pushEndpoint updatedAt")
      .lean();
    if (!doc) return false;
    const at = doc.updatedAt ? new Date(doc.updatedAt).getTime() : Date.now();
    const k = String(doc.pushEndpoint || "").trim();
    if (k) pushShownAcks.set(k, at);
    for (const key of keys) pushShownAcks.set(key, at);
    return true;
  } catch (err) {
    global.logger?.warn?.("[siteWebPush] shown-ack lookup failed:", err?.message || err);
    return false;
  }
}

async function rotateApplePushSubscriptionsForUser(userId, reason) {
  const uid = normalizeUserId(userId);
  if (!uid) return { ok: false, rotated: 0 };
  /* pushShowFirstClosed1 / pushClosedPwaNoRotate1: hedge senza /push/shown
     = PWA chiusa/SW morto, NON token morto. Denylist = push morte fino a reopen. */
  const reasonLc = String(reason || "").toLowerCase();
  if (
    reasonLc.includes("hedge") ||
    reasonLc.includes("zombie") ||
    reasonLc.includes("no shown") ||
    reasonLc.includes("shown ack")
  ) {
    global.logger?.info?.(
      "[siteWebPush] rotate Apple SKIP (hedge/closed-pwa ≠ dead token):",
      uid,
      reason || "",
    );
    return { ok: true, rotated: 0, skipped: true };
  }
  const docs = await SiteDocument.find({ docType: DOC, userId: uid })
    .select("pushEndpoint")
    .lean()
    .catch(() => []);
  let rotated = 0;
  for (const d of Array.isArray(docs) ? docs : []) {
    const ep = normalizeEndpoint(d?.pushEndpoint);
    if (!ep || !isApplePushEndpoint(ep)) continue;
    await markPushEndpointGone(ep);
    await removeWebPushByEndpoint(ep);
    rotated += 1;
  }
  if (rotated > 0) {
    global.logger?.warn?.("[siteWebPush] rotate Apple subs (no shown ack):", uid, rotated, reason || "");
    /* pushShownAckVisible1: chiedi al client di forceFresh (token denylistato). */
    try {
      const { broadcastSiteRealtime, notifyExternalSiteRealtime } = require("./siteSuggestionsBroadcast");
      const payload = {
        type: "vc:push-resubscribe",
        userId: uid,
        reason: String(reason || "apple_rotate"),
        at: new Date().toISOString(),
      };
      broadcastSiteRealtime(payload);
      notifyExternalSiteRealtime(payload);
    } catch (_) {}
  }
  return { ok: true, rotated };
}

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

async function clearPushEndpointGone(endpointRaw) {
  const endpoint = normalizeEndpoint(endpointRaw);
  if (!endpoint) return;
  gonePushEndpoints.delete(endpoint);
  await SiteDocument.deleteOne({ docType: GONE_DOC, pushEndpoint: endpoint }).catch(() => null);
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

/* pushIosDeclarative1: APNs 201 ≠ banner se SW morto/PWA chiusa.
   Declarative (web_push:8030) → iOS 18.4+ mostra il banner anche senza JS.
   pushIosBannerFix1: app_badge SEMPRE stringa di sole cifre (WebKit rifiuta number);
   icon PNG assoluto (GIF relative/assolute a volte invalide → parse fail → SW);
   mutable:true → se lo SW fallisce resta il proposed notification (no silent). */
function buildAppleDeclarativePush(fields) {
  const title = String(fields?.title || "").trim().slice(0, 120);
  const body = String(fields?.body || "").trim().slice(0, 500);
  const navigate = absoluteOpenUrl(fields?.openUrl);
  const origin = resolveSitePublicOrigin().replace("://viniliecaffe.it", "://www.viniliecaffe.it");
  const appleIcon = `${origin}${PUSH_NOTIFICATION_ICON_APPLE}`;
  const iconRaw = String(fields?.icon || "").trim();
  const icon =
    !iconRaw || /\.gif(?:\?|$)/i.test(iconRaw) || iconRaw.startsWith("/")
      ? appleIcon
      : iconRaw.slice(0, 500);
  const badgeIcon = appleIcon;
  const unreadRaw = Number(fields?.unreadCount);
  const hasUnread = Number.isFinite(unreadRaw) && unreadRaw >= 0;
  const appBadge = hasUnread ? Math.max(0, Math.min(99, Math.floor(unreadRaw))) : undefined;
  const appBadgeStr = appBadge !== undefined ? String(appBadge) : undefined;
  const pid = String(fields?.id || "").trim().slice(0, 40);
  const tag = pid ? `vc-site-${pid}` : undefined;
  const notifData = {
    openUrl: navigate,
    id: pid,
    ticketId: String(fields?.ticketId || "").trim().slice(0, 40),
    messageId: String(fields?.messageId || "").trim().slice(0, 40),
    kind: String(fields?.kind || "info").trim().slice(0, 24),
    dedupeKey: String(fields?.dedupeKey || "").trim().slice(0, 180),
    channel: String(fields?.channel || "").trim().slice(0, 16),
    msgCount: Number(fields?.msgCount) > 0 ? Math.min(99, Math.floor(Number(fields.msgCount))) : 0,
    createdAt: Number(fields?.createdAt || Date.now()) || Date.now(),
    unreadCount: hasUnread ? appBadge : -1,
  };
  const displayTitle = title || body.slice(0, 120) || "Vinili & Caffè";
  /* Body sempre non vuoto: title-only + looksGhost SW = silent push iOS. */
  const displayBody =
    body && body !== displayTitle
      ? body
      : body || title || "Nuova notifica da Vinili & Caffè";
  return {
    web_push: 8030,
    notification: {
      title: displayTitle,
      body: displayBody,
      navigate,
      lang: "it",
      dir: "ltr",
      silent: false,
      icon,
      badge: badgeIcon,
      ...(tag ? { tag } : {}),
      data: notifData,
      /* mutable true: proposed notif se SW non completa in tempo */
      mutable: true,
      ...(appBadgeStr !== undefined ? { app_badge: appBadgeStr } : {}),
    },
    mutable: true,
    ...(appBadgeStr !== undefined ? { app_badge: appBadgeStr } : {}),
    /* Legacy top-level: iOS <18.4 / declarative rejected → SW classic parse */
    title: displayTitle,
    body: displayBody,
    openUrl: navigate,
    kind: notifData.kind,
    id: notifData.id,
    ticketId: notifData.ticketId,
    messageId: notifData.messageId,
    channel: notifData.channel,
    dedupeKey: notifData.dedupeKey,
    msgCount: notifData.msgCount,
    createdAt: notifData.createdAt,
    unreadCount: notifData.unreadCount,
    icon,
    badge: badgeIcon,
  };
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

function isApplePushHost(endpointRaw) {
  return /web\.push\.apple\.com|push\.apple\.com/i.test(pushEndpointHostHint(endpointRaw));
}

function isMacintoshSafariUa(uaRaw) {
  const ua = String(uaRaw || "");
  return (
    /Macintosh/i.test(ua) &&
    /Safari/i.test(ua) &&
    !/Chrome|Chromium|Firefox|Android|CriOS|FxiOS|Edg\//i.test(ua) &&
    !/iPhone|iPad|iPod|Mobile/i.test(ua)
  );
}

function isRealIosPhoneUa(uaRaw) {
  return /iPhone|iPad|iPod/i.test(String(uaRaw || ""));
}

/* pushApplePhonePrefer1: score per scegliere quale Apple sub tenere / a chi mandare */
function applePushPhonePriority(sub) {
  const ua = String(sub?.pushUserAgent || "");
  const hint = String(sub?.pushClientDeviceClass || sub?.pushDeviceClass || "")
    .trim()
    .toLowerCase();
  const standalone = sub?.pushStandalone === true || sub?.pushStandalone === "true" || sub?.pushStandalone === 1;
  if (isRealIosPhoneUa(ua)) return 100;
  if (isMacintoshSafariUa(ua) && (standalone || hint === "mobile")) return 60;
  if (isApplePushHost(sub?.pushEndpoint) && hint === "mobile") return 40;
  if (isApplePushHost(sub?.pushEndpoint)) return 10;
  return 0;
}

function pushDeviceClass(uaRaw, deviceClassRaw, endpointRaw, meta = {}) {
  const host = pushEndpointHostHint(endpointRaw);
  const ua = String(uaRaw || "");
  const hint = String(deviceClassRaw || "")
    .trim()
    .toLowerCase();
  const clientHint = String(meta.clientDeviceClass || meta.deviceClass || "")
    .trim()
    .toLowerCase();
  const effectiveHint = clientHint || hint;
  const standalone =
    meta.standalone === true || meta.standalone === "true" || meta.standalone === 1;
  /* pushApplePhonePrefer1: Apple + iPhone/iPad UA = mobile.
     Apple + Macintosh Safari = mobile SOLO se client dice mobile/standalone
     (iOS/iPadOS PWA). Altrimenti è Mac reale → desktop (non mangiare hedge telefono). */
  if (isApplePushHost(endpointRaw)) {
    if (isRealIosPhoneUa(ua)) return "mobile";
    if (isMacintoshSafariUa(ua)) {
      /* Non fidarsi di pushDeviceClass salvato (vecchio force-mobile su tutto Apple).
         Solo hint client fresco / standalone → iOS PWA; altrimenti Mac desktop. */
      const clientOnly = String(meta.clientDeviceClass || "").trim().toLowerCase();
      if (standalone || clientOnly === "mobile") return "mobile";
      return "desktop";
    }
    if (effectiveHint === "mobile" || effectiveHint === "desktop" || effectiveHint === "tablet") {
      return effectiveHint;
    }
    return "mobile";
  }
  if (isRealIosPhoneUa(ua)) return "mobile";
  if (effectiveHint === "mobile" || effectiveHint === "desktop" || effectiveHint === "tablet") {
    return effectiveHint;
  }
  if (/Android|Mobile/i.test(ua)) return "mobile";
  /* pushKillBgSpam1: FCM host da solo ≠ mobile (Chrome PC usa FCM).
     Senza UA mobile = desktop — altrimenti dismiss/retry telefono colpiscono il PC. */
  if (/fcm\.googleapis\.com|android\.googleapis\.com|firebase/i.test(host)) {
    if (/Mobile|Android|iPhone|iPad|iPod/i.test(ua)) return "mobile";
    return "desktop";
  }
  if (/updates\.push\.services\.mozilla\.com|push\.services\.mozilla/i.test(host)) {
    if (/Mobile|Android|iPhone|iPad/i.test(ua)) return "mobile";
    return "desktop";
  }
  if (/notify\.windows\.com|wns\d*[-.]/i.test(host)) return "desktop";
  if (/Windows|Macintosh|Linux|X11/i.test(ua) && !/Mobile/i.test(ua)) return "desktop";
  return "unknown";
}

function classifyStoredPushSub(sub) {
  return pushDeviceClass(sub?.pushUserAgent, sub?.pushDeviceClass, sub?.pushEndpoint, {
    clientDeviceClass: sub?.pushClientDeviceClass || "",
    standalone: sub?.pushStandalone,
  });
}

function pushSubFingerprint(sub) {
  const uaFp = pushUaFingerprint(sub?.pushUserAgent);
  const cls = classifyStoredPushSub(sub);
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
      .select(
        "_id pushUserAgent pushEndpoint pushDeviceClass pushClientDeviceClass pushStandalone updatedAt createdAt",
      )
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
      const cls = classifyStoredPushSub(d);
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

    /* pushAppleKeep1 + pushApplePhonePrefer1: max 1 Apple — preferisci telefono reale
       (iPhone UA) rispetto a Mac Safari/Dock che altrimenti ruba lo slot. */
    const appleSorted = docs
      .filter((d) => isApplePushHost(d?.pushEndpoint))
      .slice()
      .sort((a, b) => {
        const dScore = applePushPhonePriority(b) - applePushPhonePriority(a);
        if (dScore) return dScore;
        const ta = new Date(a?.updatedAt || a?.createdAt || 0).getTime();
        const tb = new Date(b?.updatedAt || b?.createdAt || 0).getTime();
        return tb - ta;
      });
    if (appleSorted.length > 1) {
      const keepApple = new Set(appleSorted.slice(0, 1).map((d) => String(d._id)));
      for (let i = keepIds.length - 1; i >= 0; i -= 1) {
        const id = keepIds[i];
        const isApple = appleSorted.some((d) => String(d._id) === id);
        if (isApple && !keepApple.has(id)) keepIds.splice(i, 1);
      }
    }

    if (keptMobile === 0) {
      const mob = docs.find((d) => classifyStoredPushSub(d) === "mobile");
      tryKeep(mob, true);
    }
    if (keptDesktop === 0) {
      const desk = docs.find((d) => classifyStoredPushSub(d) === "desktop");
      tryKeep(desk, true);
    }
    if (keptTablet === 0) {
      const tab = docs.find((d) => classifyStoredPushSub(d) === "tablet");
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
  /* pushGoneResub1: client che ri-POSTA = vuole riattivare. Chrome riusa lo stesso
     endpoint URL dopo forceFresh → rifiutare = push morte. Clear denylist + upsert. */
  if (await isPushEndpointRecentlyGone(endpoint)) {
    await clearPushEndpointGone(endpoint);
  }
  const userAgent = String(meta.userAgent || "").trim().slice(0, 300);
  const clientDeviceClass = String(meta.deviceClass || meta.clientDeviceClass || "")
    .trim()
    .toLowerCase()
    .slice(0, 16);
  const standalone =
    meta.standalone === true || meta.standalone === "true" || meta.standalone === 1;
  const deviceClass = pushDeviceClass(userAgent, clientDeviceClass, endpoint, {
    clientDeviceClass,
    standalone,
  });
  try {
    const existing = await SiteDocument.findOne({ docType: DOC, pushEndpoint: endpoint })
      .select("userId pushP256dh pushAuth pushUserAgent pushDeviceClass pushClientDeviceClass pushStandalone")
      .lean()
      .catch(() => null);
    const same =
      existing &&
      String(existing.userId || "") === uid &&
      String(existing.pushP256dh || "") === p256dh &&
      String(existing.pushAuth || "") === auth &&
      (!userAgent || String(existing.pushUserAgent || "") === userAgent) &&
      String(existing.pushDeviceClass || "") === deviceClass &&
      String(existing.pushClientDeviceClass || "") === clientDeviceClass &&
      Boolean(existing.pushStandalone) === Boolean(standalone);
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

function isBlankPushField(s) {
  return !String(s || "")
    .replace(/[\u200b\u200c\u200d\ufeff\u00a0]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function pushDisplayTitle(title, body) {
  const t = String(title || "").trim();
  if (t && !looksLikeSiteName(t) && !/^nuova\s+notifica$/i.test(t)) return t.slice(0, 120);
  const b = String(body || "").trim().split("\n")[0];
  if (b && !/^nuova\s+notifica$/i.test(b)) {
    return (b.length > 72 ? `${b.slice(0, 71)}…` : b).slice(0, 120);
  }
  /* pushNoGhostTitle1: niente titolo fantasma — empty_payload a monte */
  return "";
}

async function listSubscriptionsForUser(userId) {
  const uid = normalizeUserId(userId);
  if (!uid) return [];
  /* pushMultiDevice3: prune soft (solo se troppi) — mai droppare PC↔phone a ogni send */
  await pruneWebPushSubscriptionsForUser(uid);
  const docs = await SiteDocument.find({ docType: DOC, userId: uid })
    .select(
      "pushEndpoint pushP256dh pushAuth pushUserAgent pushDeviceClass pushClientDeviceClass pushStandalone updatedAt createdAt",
    )
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

function isWnsDesktopSubscription(sub) {
  const host = pushEndpointHostHint(sub?.pushEndpoint);
  return /notify\.windows\.com|wns\d*[-.]/i.test(host);
}

function isMobilePushSubscription(sub) {
  /* iosWinProfilePush1: WNS = sempre desktop (anche se UA/class sbagliati) */
  if (isWnsDesktopSubscription(sub)) return false;
  const cls = classifyStoredPushSub(sub);
  if (cls === "desktop") return false;
  if (cls === "mobile" || cls === "tablet") return true;
  const ua = String(sub?.pushUserAgent || "");
  if (/iPhone|iPad|iPod|Android|Mobile/i.test(ua)) return true;
  const host = pushEndpointHostHint(sub?.pushEndpoint);
  /* pushApplePhonePrefer1: Apple Mac desktop ≠ mobile (prima: host Apple = sempre mobile
     e i push “telefono” finivano sul Mac Safari/Dock). */
  if (/web\.push\.apple\.com|push\.apple\.com/i.test(host)) {
    return classifyStoredPushSub(sub) !== "desktop";
  }
  /* pushKillBgSpam1: FCM/Mozilla da soli ≠ mobile — Chrome PC usa FCM.
     Senza UA mobile = desktop (altrimenti dismiss/retry telefono colpiscono il PC). */
  if (/fcm\.googleapis\.com|android\.googleapis\.com|firebase/i.test(host)) {
    return /Mobile|Android|iPhone|iPad|iPod/i.test(ua);
  }
  if (/updates\.push\.services\.mozilla\.com/i.test(host)) {
    return /Mobile|Android|iPhone|iPad|iPod/i.test(ua);
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

function isApplePushEndpoint(endpointRaw) {
  try {
    return /web\.push\.apple\.com|push\.apple\.com/i.test(new URL(String(endpointRaw || "")).host);
  } catch (_) {
    return false;
  }
}

/** Apple rejects Topic when length % 4 === 1 (BadWebPushTopic). Keep FCM-safe charset. */
function normalizeWebPushTopic(topicRaw) {
  let t = String(topicRaw || "vcnpush").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
  if (!t) t = "vcnpush";
  while (t.length % 4 === 1) {
    if (t.length >= 32) {
      t = t.slice(0, 31);
      break;
    }
    t += "0";
  }
  if (t.length % 4 === 1) t = t.slice(0, Math.max(1, t.length - 1));
  return t || "vcn0";
}

function isDesktopPushSubscription(sub) {
  if (isWnsDesktopSubscription(sub)) return true;
  if (isMobilePushSubscription(sub)) return false;
  /* pushApplePhonePrefer1: Apple classificato desktop (Mac) resta desktop */
  if (classifyStoredPushSub(sub) === "desktop") return true;
  if (isApplePushSubscription(sub) && classifyStoredPushSub(sub) === "mobile") return false;
  const cls = classifyStoredPushSub(sub);
  if (cls === "desktop") return true;
  const ua = String(sub?.pushUserAgent || "");
  if (/Windows|Macintosh|Linux|X11/i.test(ua) && !/Mobile/i.test(ua)) return true;
  return false;
}

async function sendWebPushToUser(userId, payload = {}, sendOpts = {}) {
  if (!ensureVapidConfigured()) return { ok: false, skipped: true, reason: "vapid_missing" };
  const uid = normalizeUserId(userId);
  if (!uid) return { ok: false, skipped: true, reason: "invalid_user" };

  const isDismiss = String(payload.type || "").trim().toLowerCase() === "dismiss";
  /* badgeOsDismiss1: dismiss consentito — sotto si filtra solo mobile/Apple
     (no WNS/desktop → niente ghost “aggiornato in background” su PC). */

  const subs = await listSubscriptionsForUser(uid);
  if (!subs.length) return { ok: true, sent: 0, mobileSent: 0, mobileFailed: 0, mobileTargets: 0, desktopSent: 0, skippedGone: 0 };
  /* votePushPhoneRetry1: deviceFilter=mobile|desktop — retry telefono senza ri-pingare PC */
  const deviceFilter = String(sendOpts.deviceFilter || payload.deviceFilter || "")
    .trim()
    .toLowerCase();

  const ticketId = String(payload.ticketId || "").trim().slice(0, 40);
  /* pushNoGhostTitle1: valuta vuoto sui campi grezzi PRIMA di inventare un titolo */
  const rawTitle = String(payload.title || "").trim();
  const rawBody = String(payload.body || "").trim().slice(0, 500);
  const rawGhost =
    !isDismiss &&
    (isBlankPushField(rawTitle) || looksLikeSiteName(rawTitle) || /^nuova\s+notifica$/i.test(rawTitle)) &&
    (isBlankPushField(rawBody) || /^nuova\s+notifica$/i.test(rawBody) || looksLikeSiteName(rawBody));
  if (!isDismiss && (rawGhost || (isBlankPushField(rawTitle) && isBlankPushField(rawBody)))) {
    return { ok: true, sent: 0, skipped: true, reason: "empty_payload" };
  }
  const title = pushDisplayTitle(rawTitle, rawBody);
  const body = rawBody;
  /* pushPurgeEmptyAck1 / pushKillGhostSpam1: mai content senza testo reale */
  if (!isDismiss) {
    const titleOk =
      !isBlankPushField(title) &&
      !/^nuova\s+notifica$/i.test(title) &&
      !looksLikeSiteName(title);
    const bodyOk =
      !isBlankPushField(body) &&
      !/^nuova\s+notifica$/i.test(body) &&
      !looksLikeSiteName(body);
    if (!titleOk && !bodyOk) {
      return { ok: true, sent: 0, skipped: true, reason: "empty_payload" };
    }
  }
  const openUrl = absoluteOpenUrl(payload.openUrl);
  const kind = String(payload.kind || "info").trim().slice(0, 24);
  const origin = resolveSitePublicOrigin().replace("://viniliecaffe.it", "://www.viniliecaffe.it");
  const icon = `${origin}${PUSH_NOTIFICATION_ICON}`;
  const classicFields = isDismiss
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
        /* pushAutoDismiss1: lifecycle/digest match su SW */
        dedupeKeys: Array.isArray(payload.dedupeKeys)
          ? payload.dedupeKeys.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 40)
          : [],
        pageUrl: String(payload.pageUrl || "").trim().slice(0, 500),
        all: payload.all === true,
        /* pushReadDismissBadge1: badge PWA = unread inbox, non solo banner OS */
        unreadCount: Number.isFinite(Number(payload.unreadCount))
          ? Math.max(0, Math.min(99, Math.floor(Number(payload.unreadCount))))
          : -1,
        /* reactSwBadge1: top-level app_badge per SW classic (Android/FCM) */
        ...(Number.isFinite(Number(payload.unreadCount)) && Number(payload.unreadCount) >= 0
          ? { app_badge: Math.max(0, Math.min(99, Math.floor(Number(payload.unreadCount)))) }
          : {}),
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
        /* pushBadgeSyncPhone1: unread inbox anche sul content → badge PWA allineato */
        unreadCount: Number.isFinite(Number(payload.unreadCount))
          ? Math.max(0, Math.min(99, Math.floor(Number(payload.unreadCount))))
          : -1,
        ...(Number.isFinite(Number(payload.unreadCount)) && Number(payload.unreadCount) >= 0
          ? { app_badge: Math.max(0, Math.min(99, Math.floor(Number(payload.unreadCount)))) }
          : {}),
        /* notifBellInboxBadge1 */
        icon,
        badge: icon,
      };
  const data = JSON.stringify(classicFields);
  /* pushIosDeclarative1: solo content Apple — dismiss resta classic (userVisibleOnly) */
  const appleData = isDismiss ? data : JSON.stringify(buildAppleDeclarativePush(classicFields));

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
  /* pushPhoneTicketAck1: chat/mention/SLA ticket → TTL lungo (telefono offline / FCM delay) */
  const dkTtl = String(payload.dedupeKey || "");
  const isTicketContentPush =
    isQueuePush ||
    /^web_ticket:(chat|staff_reply|mention|sla|event|closed|claimed|needs_reply)/i.test(dkTtl) ||
    kindLc === "web_ticket" ||
    kindLc === "web_ticket_mention" ||
    kindLc === "web_ticket_sla";
  const ttlOverride = Number(payload.ttlSeconds);
  const ttlSec = Number.isFinite(ttlOverride) && ttlOverride > 0
    ? Math.min(86_400, Math.floor(ttlOverride))
    : isDismiss
      ? 60 * 30
      : isVoteReminder || isDigestPush || isTicketContentPush
        ? 60 * 60 * 12
        : 60 * 60;
  const pushOpts = {
    TTL: ttlSec,
    urgency: "high",
  };
  /* pushPhoneTopicAll1: SU TELEFONO FCM senza Topic usa collapse key = package
     → N push offline collassano in 1 (non solo i reminder voto).
     Topic unico per notifica; digest/queue tengono Topic stabile (replace intenzionale).
     Mai ritentare SENZA Topic. */
  let pushTopic = "";
  if (!isDismiss) {
    const dkRaw = String(payload.dedupeKey || "");
    const dkLc = dkRaw.toLowerCase();
    const titleLc = String(payload.title || "").toLowerCase();
    const idClean = String(payload.id || "").replace(/\W+/g, "").slice(-10);
    const msgClean = String(payload.messageId || "").replace(/\W+/g, "").slice(-10);
    const dkClean = dkRaw.replace(/\W+/g, "").slice(-14);
    const kindClean = String(kindLc || "info").replace(/\W+/g, "").slice(0, 8) || "info";

    if (isVoteReminder) {
      pushTopic = "vcvoterem";
      if (/_topgg|top\.gg|topgg/.test(dkLc) || /top\.gg/.test(titleLc)) pushTopic = "vcvotetop";
      else if (/_discadia|discadia/.test(dkLc) || /discadia/.test(titleLc)) pushTopic = "vcvotedis";
      const idSuffix = idClean || dkClean.slice(-8);
      if (idSuffix) pushTopic = String(`${pushTopic}${idSuffix}`).slice(0, 32);
    } else if (isDigestPush || isQueuePush) {
      /* replace intenzionale: stesso digest/queue → stesso Topic */
      pushTopic = String(`vcd${dkClean || idClean || kindClean}`).slice(0, 32);
    } else {
      const unique = idClean || msgClean || dkClean || String(Date.now()).slice(-8);
      pushTopic = String(`vcn${kindClean}${unique}`).slice(0, 32);
    }
    /* votePushPhoneZombie2 + pushAppleWaitUntil1: soft-retry/hedge → Topic distinto
       anche per suggestion/staff (prima solo vote → FCM collapse sui :mprN). */
    if (!isDigestPush && !isQueuePush) {
      const attempt = Math.max(0, Math.floor(Number(payload.topicAttempt) || 0));
      if (attempt > 0) {
        pushTopic = String(`${pushTopic}r${attempt}`).slice(0, 32);
      }
    }
    /* pushAppleTopic1: mai len%4===1 (APNs 400 BadWebPushTopic) */
    pushTopic = normalizeWebPushTopic(pushTopic);
    pushOpts.headers = { Topic: pushTopic };
  }

  let sent = 0;
  let failed = 0;
  let skippedGone = 0;
  let mobileSent = 0;
  let mobileFailed = 0;
  let mobileTargets = 0;
  let mobileCandidates = 0;
  let mobileAppleSent = 0;
  let desktopSent = 0;
  const targets = [];
  for (const sub of subs) {
    /* pushKillBgSpam2 + pushApplePhonePrefer1: solo mobile reale (Mac Apple ≠ mobile). */
    const mobileLike = isMobilePushSubscription(sub);
    if (isDismiss && !mobileLike) continue;
    if (isDismiss && isWnsDesktopSubscription(sub)) continue;
    /* pushIosNoEmptyDismiss1: mai dismiss APNs — banner vuoti + starve content */
    if (
      isDismiss &&
      (isApplePushEndpoint(sub?.pushEndpoint) || isApplePushSubscription(sub))
    ) {
      continue;
    }
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
    targets.push({
      sub,
      endpoint,
      p256dh,
      auth,
      mobile: mobileLike,
      apple: isApplePushEndpoint(endpoint) || isApplePushSubscription(sub),
    });
  }
  /* phoneNotifFlyCard1: mobile/Apple prima + invii in parallelo (meno ritardo OS). */
  targets.sort((a, b) => Number(b.mobile) - Number(a.mobile));

  async function sendOne(target) {
    const { endpoint, p256dh, auth } = target;
    const appleEp = isApplePushEndpoint(endpoint);
    /* pushAppleTopic1: APNs — niente Topic (collapse FCM-only). Evita BadWebPushTopic. */
    const baseOpts = appleEp
      ? { TTL: pushOpts.TTL, urgency: pushOpts.urgency }
      : pushOpts;
    /* pushIosDeclarative1: Apple content → declarative JSON; FCM/dismiss → classic */
    const bodyJson = appleEp ? appleData : data;
    /* votePushPairPhone2: Discadia dopo Top.gg */
    if (isVoteReminder && pushTopic.startsWith("vcvotedis") && target.mobile) {
      await new Promise((r) => setTimeout(r, 1800));
    }
    try {
      await webpush.sendNotification(
        { endpoint, keys: { p256dh, auth } },
        bodyJson,
        baseOpts,
      );
      return { ok: true };
    } catch (err) {
      const status0 = Number(err?.statusCode) || 0;
      const msg0 = Buffer.isBuffer(err?.body)
        ? err.body.toString("utf8")
        : String(err?.body || err?.message || "");
      const badTopic = status0 === 400 && /BadWebPushTopic/i.test(msg0);
      if (badTopic) {
        try {
          await webpush.sendNotification(
            { endpoint, keys: { p256dh, auth } },
            bodyJson,
            { TTL: pushOpts.TTL, urgency: pushOpts.urgency },
          );
          return { ok: true };
        } catch (errApple) {
          err = errApple || err;
        }
      } else if (baseOpts.headers && status0 !== 404 && status0 !== 410) {
        try {
          /* pushPhoneTopicAll1: FCM — ritenta con Topic padded, mai strip */
          const altTopic = normalizeWebPushTopic(`x${pushTopic || "vcn"}`);
          await webpush.sendNotification(
            { endpoint, keys: { p256dh, auth } },
            bodyJson,
            { ...baseOpts, headers: { Topic: altTopic } },
          );
          return { ok: true };
        } catch (err2) {
          err = err2 || err;
        }
      }
      /* Transient FCM 5xx (non permanent): un retry dopo 400ms */
      const statusRetry = Number(err?.statusCode) || 0;
      const msgRetry = Buffer.isBuffer(err?.body)
        ? err.body.toString("utf8")
        : String(err?.body || err?.message || "");
      const isPermanentHint = /permanent|do not retry|gone|unsubscribed|not\s*registered|invalid|expired/i.test(
        msgRetry,
      );
      if (statusRetry >= 500 && statusRetry < 600 && !isPermanentHint) {
        try {
          await new Promise((r) => setTimeout(r, 400));
          await webpush.sendNotification(
            { endpoint, keys: { p256dh, auth } },
            bodyJson,
            baseOpts,
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

  /* pushMapPool7: concurrency limit — evita storm FCM/WNS su multi-device */
  const PUSH_SEND_CONCURRENCY = 7;
  async function mapPool(items, concurrency, worker) {
    const out = new Array(items.length);
    let next = 0;
    const n = Math.max(1, Math.min(concurrency, items.length || 1));
    await Promise.all(
      Array.from({ length: n }, async () => {
        while (true) {
          const i = next;
          next += 1;
          if (i >= items.length) return;
          out[i] = await worker(items[i], i);
        }
      }),
    );
    return out;
  }
  const results = await mapPool(targets, PUSH_SEND_CONCURRENCY, (t) => sendOne(t));
  for (let i = 0; i < results.length; i += 1) {
    const r = results[i];
    const mobile = Boolean(targets[i] && targets[i].mobile);
    if (r && r.ok) {
      sent += 1;
      if (mobile) {
        mobileSent += 1;
        if (targets[i] && targets[i].apple) mobileAppleSent += 1;
      } else desktopSent += 1;
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
    /* votePushPhoneZombie2: Apple 201 ≠ banner reale */
    mobileAppleSent,
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
  clearPushEndpointGone,
  removeWebPushByEndpoint,
  noteWebPushShown,
  wasWebPushShown,
  rotateApplePushSubscriptionsForUser,
};
