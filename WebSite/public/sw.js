/* Vinili & Caffè — service worker: notifiche push, clic sulle notifiche, badge dell'app e pagina offline.
   Le pagine vere non si mettono mai in cache, così non si vedono versioni vecchie.

   Regola delle push (vale per tutti i browser): OGNI push mostra una notifica. Una push che non mostra
   niente fa revocare l'iscrizione su iPhone e rallentare le successive su Chrome. Il bot non manda più
   push di sola chiusura: letto/badge tra dispositivi si allineano quando si apre il sito (lib/notifications.ts).

   Payload (Bots/src/Vinili/Utils/Web/siteWebPushService.ts):
   - classico  { title, body, openUrl, id, tag, unreadCount, app_badge, icon, … }
   - Apple     { web_push: 8030, notification: { title, body, navigate, tag, data, app_badge } }
     iOS 18.4+ / Safari 18.5+ lo mostrano da soli senza svegliare questo file; le versioni prima lo passano qui. */

const OFFLINE_CACHE = "vc-offline-v4";
const OFFLINE_URL = "/offline/";
const OFFLINE_ASSETS = [OFFLINE_URL, "/favicon.ico", "/favicon-32.png"];
/* La destinazione del clic sopravvive all'avvio della PWA (lib/pwa-notif-nav-boot.ts la legge). */
const NAV_CACHE = "vc-notif-pending-v1";
const NAV_REQ = "/__vc_notif_pending";
const STILL_ICON = "https://cdn.viniliecaffe.it/images/discord-still.png";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const c = await caches.open(OFFLINE_CACHE);
        await Promise.all(
          OFFLINE_ASSETS.map(async (u) => {
            try {
              const res = await fetch(u, { cache: "reload" });
              if (res && res.ok) await c.put(u, res);
            } catch {
              /* senza rete: si riprova al prossimo aggiornamento */
            }
          }),
        );
      } catch {
        /* ignore */
      }
      await self.skipWaiting();
    })(),
  );
});

const KEEP_CACHES = new Set([OFFLINE_CACHE, NAV_CACHE]);
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !KEEP_CACHES.has(k)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(async () => {
        const hit = await caches.match(OFFLINE_URL);
        return hit || new Response("Sei offline", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }),
    );
    return;
  }

  if (url.pathname === "/favicon.ico") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(OFFLINE_CACHE).then((c) => c.put(req, copy)).catch(() => null);
          return res;
        })
        .catch(async () => (await caches.match("/favicon.ico")) || Response.error()),
    );
  }
});

/* ---------- push ---------- */

// le notifiche di sistema non mostrano immagini: <:nome:id> di Discord diventa :nome:
function plainEmoji(v) {
  return String(v || "")
    .replace(/<a?:([A-Za-z0-9_~]{1,64}):\d{15,22}>/g, ":$1:")
    .trim();
}

function badgeCount(raw) {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.min(99, Math.floor(n)) : -1;
}

async function setOsBadge(count) {
  const nav = self.navigator;
  if (!nav || count < 0) return;
  try {
    if (count > 0 && typeof nav.setAppBadge === "function") await nav.setAppBadge(count);
    else if (count === 0 && typeof nav.clearAppBadge === "function") await nav.clearAppBadge();
  } catch {
    /* ignore */
  }
}

/* Classico o Apple → un'unica forma. */
function readPush(event) {
  let raw = {};
  try {
    raw = event.data ? event.data.json() : {};
  } catch {
    raw = { body: event.data ? event.data.text() : "" };
  }
  if (!raw || typeof raw !== "object") raw = {};
  const declarative = Number(raw.web_push) === 8030 && raw.notification && typeof raw.notification === "object";
  const n = declarative ? raw.notification : raw;
  const d = (n.data && typeof n.data === "object" && n.data) || {};
  const pick = (...vals) => {
    for (const v of vals) {
      const s = String(v ?? "").trim();
      if (s) return s;
    }
    return "";
  };
  const id = pick(raw.id, d.id);
  return {
    declarative,
    type: pick(raw.type).toLowerCase(),
    title: plainEmoji(pick(n.title, raw.title)),
    body: plainEmoji(pick(n.body, raw.body)),
    tag: pick(n.tag, raw.tag, id ? `vc-site-${id}` : ""),
    icon: pick(raw.icon, n.icon),
    badgeIcon: pick(raw.badge, n.badge),
    badge: badgeCount(pick(raw.app_badge, n.app_badge, raw.unreadCount, d.unreadCount)),
    data: {
      id,
      ticketId: pick(raw.ticketId, d.ticketId),
      dedupeKey: pick(raw.dedupeKey, d.dedupeKey),
      kind: pick(raw.kind, d.kind),
      openUrl: pick(n.navigate, raw.openUrl, d.openUrl, d.url, "/notifications/"),
    },
  };
}

async function show(p) {
  const title = p.title || p.body.slice(0, 120) || "Vinili & Caffè";
  const body = p.body && p.body !== title ? p.body : "";
  const safeIcon = (s) => (!s || /\.gif(?:\?|$)/i.test(s) ? STILL_ICON : s);
  const options = {
    body,
    icon: safeIcon(p.icon),
    badge: safeIcon(p.badgeIcon),
    data: { ...p.data, url: p.data.openUrl },
    lang: "it",
  };
  if (p.tag) {
    options.tag = p.tag;
    options.renotify = true;
  }
  try {
    await self.registration.showNotification(title, options);
  } catch {
    /* opzioni rifiutate da qualche browser: la notifica deve comunque comparire */
    await self.registration.showNotification(title, { body, data: options.data });
  }
}

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      const p = readPush(event);
      // push di chiusura della versione vecchia del bot ancora in coda (scadono in 30 minuti): solo badge
      if (p.type === "dismiss") {
        await setOsBadge(p.badge);
        return;
      }
      // formato Apple già mostrato dal sistema con lo stesso tag: niente doppione
      if (p.declarative && p.tag) {
        const shown = await self.registration.getNotifications({ tag: p.tag }).catch(() => []);
        if (shown && shown.length) {
          await setOsBadge(p.badge);
          return;
        }
      }
      if (!p.title && !p.body) p.body = "Hai una nuova notifica.";
      await show(p);
      await setOsBadge(p.badge);
    })(),
  );
});

/* Il browser ha rinnovato l'iscrizione da solo (scadenza/chiavi): si rifà con le stesse opzioni.
   Il sito la ri-registra sul server alla prossima apertura (lib/push.ts → syncPushSubscription). */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const opts = event.oldSubscription && event.oldSubscription.options;
        if (event.newSubscription || !opts || !opts.applicationServerKey) return;
        await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: opts.applicationServerKey });
      } catch {
        /* ci pensa il sito alla prossima apertura */
      }
    })(),
  );
});

/* ---------- clic ---------- */

const isIos = () => /iPhone|iPad|iPod/i.test(String((self.navigator && self.navigator.userAgent) || ""));

async function stashNotifNav(absUrl) {
  try {
    const cache = await caches.open(NAV_CACHE);
    await cache.put(NAV_REQ, new Response(JSON.stringify({ url: String(absUrl || ""), t: Date.now() }), { headers: { "content-type": "application/json" } }));
  } catch {
    /* ignore */
  }
}

function pathKey(href) {
  try {
    const u = new URL(String(href || ""), self.location.origin);
    if (u.origin !== self.location.origin) return "";
    let p = u.pathname || "/";
    if (p !== "/" && !p.endsWith("/")) p += "/";
    return `${p}${u.search || ""}${u.hash || ""}`;
  } catch {
    return "";
  }
}

function clickTarget(notification) {
  const d = (notification && notification.data && typeof notification.data === "object" && notification.data) || {};
  let raw = String((notification && notification.navigate) || d.openUrl || d.url || d.navigate || "").trim();
  if (!raw || raw === "/" || /\/\?app=/i.test(raw)) raw = "/notifications/";
  try {
    const u = new URL(raw, self.location.origin);
    if (/^(?:www\.)?viniliecaffe\.it$/i.test(u.hostname)) {
      u.protocol = "https:";
      u.hostname = self.location.hostname;
    }
    if (u.origin !== self.location.origin) return new URL("/notifications/", self.location.origin).href;
    if (u.pathname === "/" && !u.search && !u.hash) return new URL("/notifications/", self.location.origin).href;
    return u.href;
  } catch {
    return new URL("/notifications/", self.location.origin).href;
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const abs = clickTarget(event.notification);
  event.waitUntil(
    (async () => {
      await stashNotifNav(abs);
      const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const originClients = (list || []).filter((c) => String(c.url || "").startsWith(self.location.origin));
      if (!originClients.length) {
        if (self.clients.openWindow) await self.clients.openWindow(abs).catch(() => null);
        return;
      }
      const want = pathKey(abs);
      /* preferisci tab già sulla destinazione, poi quella in focus (evita aprire “pagina sbagliata”) */
      const same =
        originClients.find((c) => pathKey(c.url) === want) ||
        originClients.find((c) => c.focused) ||
        originClients[0];
      await same.focus().catch(() => null);
      try {
        same.postMessage({ type: "vc:notif-navigate", url: abs });
      } catch {
        /* ignore */
      }
      if (pathKey(same.url) === want) return;
      // navigate() spesso ok su desktop/Android; se fallisce (o iOS) apri la destinazione
      if (!isIos() && typeof same.navigate === "function") {
        const ok = await same.navigate(abs).then(() => true, () => false);
        if (ok) return;
      }
      if (self.clients.openWindow) await self.clients.openWindow(abs).catch(() => null);
    })(),
  );
});

/* Badge = notifiche ancora nel centro notifiche (il numero esatto lo rimette il sito all'apertura). */
self.addEventListener("notificationclose", (event) => {
  event.waitUntil(
    (async () => {
      const list = await self.registration.getNotifications().catch(() => []);
      await setOsBadge((list || []).length);
    })(),
  );
});
