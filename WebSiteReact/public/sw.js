/* Vinili & Caffè — service worker: push + dismiss + badge OS. Unica cache: la pagina offline
   (le pagine vere non si mettono mai in cache, così non si vedono versioni vecchie). */
/* Payload: Vinyls/Utils/Web/siteWebPushService.js
   content → { title, body, openUrl, id, unreadCount, … }
   dismiss → { type:"dismiss", ids, ticketIds, unreadCount, all, … }
   iosDismissTag1: iOS declarative (8030) non compare in getNotifications →
   replace stesso tag + close (anche su telefono quando letta da altro device). */

/* offlineSlash1: su Vercel (trailingSlash) la pagina è /offline/, non /offline.html */
const OFFLINE_CACHE = "vc-offline-v3";
const OFFLINE_URL = "/offline/";
const OFFLINE_ASSETS = [OFFLINE_URL, "/favicon.ico"];
/** Stesso host di WebSiteReact/src/lib/site.ts → API_ORIGIN (USE_API_ORIGIN). */
const API_ORIGIN = "https://api.viniliecaffe.it";

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
            } catch (_) {
              /* senza rete / 404: riprova al prossimo update, niente Cache.add noise */
            }
          }),
        );
      } catch (e) {
        /* senza rete all'installazione: si riprova al prossimo aggiornamento */
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== OFFLINE_CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

/* offlinePage1: navigate → offline.html; favicon da cache se offline */
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

  if (url.pathname === "/favicon.ico" || url.pathname.endsWith("/favicon.ico")) {
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

const ua = () => String((self.navigator && self.navigator.userAgent) || "");
const isIosClient = () =>
  /iPhone|iPad|iPod/i.test(ua()) ||
  (/Macintosh/i.test(ua()) && /Safari/i.test(ua()) && !/Chrome|Chromium|Firefox|Edg\//i.test(ua()));
const clientLabel = () => (/iPhone/i.test(ua()) ? "iphone" : /iPad/i.test(ua()) ? "ipad" : "ios");

// le notifiche di sistema non mostrano immagini: <:nome:id> di Discord diventa :nome:
function plainEmoji(v) {
  return String(v || "")
    .replace(/<a?:([A-Za-z0-9_~]{1,64}):\d{15,22}>/g, ":$1:")
    .trim();
}

function ackShown(d) {
  if (!isIosClient() || (!d.id && !d.dedupeKey)) return Promise.resolve();
  const ctrl = typeof AbortController === "function" ? new AbortController() : null;
  const t = ctrl ? setTimeout(() => ctrl.abort(), 1200) : null;
  return fetch(`${API_ORIGIN}/webhooks/site-notifications/push/shown`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: String(d.id || ""),
      dedupeKey: String(d.dedupeKey || ""),
      shown: true,
      client: clientLabel(),
    }),
    keepalive: true,
    credentials: "omit",
    signal: ctrl ? ctrl.signal : undefined,
  })
    .catch(() => null)
    .finally(() => t && clearTimeout(t));
}

function asIdList(raw, max) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = Object.create(null);
  for (const x of raw) {
    const s = String(x || "").trim();
    if (!s || seen[s]) continue;
    seen[s] = 1;
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

function unwrapPayload(raw) {
  let data = raw && typeof raw === "object" ? { ...raw } : {};
  if (Number(data.web_push) === 8030 && data.notification && typeof data.notification === "object") {
    const n = data.notification;
    const nested = n.data && typeof n.data === "object" ? n.data : {};
    data = { ...data, ...nested };
    data.title = String(n.title || data.title || "").trim();
    data.body = String(n.body || data.body || "").trim();
    data.openUrl = String(n.navigate || data.openUrl || nested.openUrl || "/").trim();
    if (n.icon) data.icon = String(n.icon).trim();
    if (n.badge) data.badge = String(n.badge).trim();
    const ab = Number(data.app_badge ?? n.app_badge);
    if (Number.isFinite(ab) && ab >= 0) data.unreadCount = Math.max(0, Math.min(99, Math.floor(ab)));
  }
  return data;
}

function unreadFrom(p) {
  const a = Number(p.app_badge);
  if (Number.isFinite(a) && a >= 0) return Math.max(0, Math.min(99, Math.floor(a)));
  const u = Number(p.unreadCount);
  if (Number.isFinite(u) && u >= 0) return Math.max(0, Math.min(99, Math.floor(u)));
  return -1;
}

async function setOsBadge(count) {
  const nav = self.navigator;
  if (!nav) return;
  try {
    if (count > 0 && typeof nav.setAppBadge === "function") {
      await nav.setAppBadge(count);
    } else if (count <= 0 && typeof nav.clearAppBadge === "function") {
      await nav.clearAppBadge();
    }
  } catch {
    /* ignore */
  }
}

function isAckNotif(n) {
  try {
    if (!n) return true;
    if (n.data && (n.data.vcAck || n.data.type === "dismiss-ack")) return true;
    const tag = String(n.tag || "");
    return tag === "vc-push-ack" || tag === "vc-dismiss-ack";
  } catch {
    return false;
  }
}

function normPath(url) {
  try {
    const u = new URL(String(url || "/"), self.location.origin);
    return (u.pathname || "/").replace(/\/+$/, "") || "/";
  } catch {
    return "";
  }
}

/** notifVisitExact1: id in hash/query (ticket/feedback/…) */
function entityIdFromUrl(url) {
  try {
    const u = new URL(String(url || "/"), self.location.origin);
    for (const k of ["ticketId", "ticket", "id", "suggestion"]) {
      const q = String(u.searchParams.get(k) || "")
        .trim()
        .toLowerCase();
      if (/^[a-f0-9]{24}$/i.test(q)) return q;
    }
    const h = String(u.hash || "")
      .replace(/^#/, "")
      .trim();
    if (/^[a-f0-9]{24}$/i.test(h)) return h.toLowerCase();
    const m = /^(?:vc-suggestion-|vc-conf-card-|vc-review-|vc-bot-feedback-)?([a-f0-9]{24})$/i.exec(h);
    return m ? String(m[1] || "").toLowerCase() : "";
  } catch {
    return "";
  }
}

function notifMatchesDismiss(n, spec) {
  if (!n || isAckNotif(n)) return false;
  if (spec.all) return true;
  const d = (n.data && typeof n.data === "object" ? n.data : {}) || {};
  const nid = String(d.id || "").trim();
  const tid = String(d.ticketId || "")
    .trim()
    .toLowerCase();
  const tag = String(n.tag || "");
  const dedupe = String(d.dedupeKey || "").trim();
  const open = String(d.openUrl || d.url || "").trim();
  if (nid && spec.ids.includes(nid)) return true;
  if (tid && spec.ticketIds.includes(tid)) return true;
  for (const id of spec.ids) {
    if (tag === `vc-site-${id}`) return true;
  }
  if (dedupe && spec.dedupeKeys.includes(dedupe)) return true;
  if (open && spec.openUrls.length) {
    const p = normPath(open);
    const openEnt = entityIdFromUrl(open);
    for (const ou of spec.openUrls) {
      if (open === ou) return true;
      const ouEnt = entityIdFromUrl(ou);
      if (openEnt && ouEnt) {
        if (openEnt === ouEnt) return true;
        continue;
      }
      /* notif con entity: non chiudere solo perché path lista coincide */
      if (openEnt && !ouEnt) continue;
      if (p && p === normPath(ou)) return true;
    }
  }
  return false;
}

async function listAllNotifications() {
  if (!self.registration || typeof self.registration.getNotifications !== "function") {
    return [];
  }
  const jobs = [self.registration.getNotifications()];
  try {
    jobs.push(self.registration.getNotifications({ includeTriggered: true }));
  } catch {
    /* ignore */
  }
  const lists = await Promise.all(jobs);
  const seen = Object.create(null);
  const out = [];
  for (const list of lists) {
    for (const n of list || []) {
      if (!n) continue;
      const key = `${n.tag || ""}|${(n.data && n.data.id) || ""}|${(n.data && n.data.ticketId) || ""}`;
      if (seen[key]) continue;
      seen[key] = 1;
      out.push(n);
    }
  }
  return out;
}

async function closeMatching(spec) {
  const list = await listAllNotifications();
  let closed = 0;
  for (const n of list) {
    if (!notifMatchesDismiss(n, spec)) continue;
    try {
      n.close();
      closed += 1;
    } catch {
      /* ignore */
    }
  }
  return closed;
}

/**
 * pushIosNoEmptyDismiss1: NON fare showNotification(\u00a0) su iOS —
 * APNs/WebKit mostra comunque banner vuoti/“sito aggiornato” e affama i content.
 * Solo close delle entry già note allo SW (getNotifications).
 */
async function dismissByTagCloseOnly(tags) {
  if (!self.registration || typeof self.registration.getNotifications !== "function") return 0;
  const uniq = [];
  const seen = Object.create(null);
  for (const t of tags || []) {
    const tag = String(t || "").trim();
    if (!tag || seen[tag]) continue;
    seen[tag] = 1;
    uniq.push(tag);
    if (uniq.length >= 12) break;
  }
  if (!uniq.length) return 0;
  let closed = 0;
  for (const tag of uniq) {
    try {
      const list = await self.registration.getNotifications({ tag });
      for (const n of list || []) {
        if (isAckNotif(n)) continue;
        try {
          n.close();
          closed += 1;
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  }
  return closed;
}

function isBlank(s) {
  return !String(s || "").trim();
}

function looksGhost(s) {
  const t = String(s || "")
    .trim()
    .toLowerCase();
  if (!t) return true;
  if (/^nuova\s+notifica$/.test(t)) return true;
  /* pushIosBannerFix1: NON trattare il brand come ghost —
     title "Vinili & Caffè" + body vuoto faceva return senza showNotification
     (= silent push → iOS revoca la subscription). */
  return false;
}

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let raw = {};
      try {
        raw = event.data ? event.data.json() : {};
      } catch {
        raw = { body: event.data ? event.data.text() : "" };
      }
      const p = unwrapPayload(raw);
      const type = String(p.type || "").trim().toLowerCase();
      const badgeN = unreadFrom(p);

      if (type === "dismiss") {
        const id = String(p.id || "").trim();
        const ids = asIdList(p.ids, 80);
        if (id && !ids.includes(id)) ids.unshift(id);
        const ticketId = String(p.ticketId || "")
          .trim()
          .toLowerCase();
        const ticketIds = asIdList(p.ticketIds, 40).map((x) => x.toLowerCase());
        if (ticketId && !ticketIds.includes(ticketId)) ticketIds.unshift(ticketId);
        const openUrls = asIdList(p.openUrls, 40);
        const dedupeKeys = asIdList(p.dedupeKeys, 40);
        const spec = {
          all: p.all === true,
          ids,
          ticketIds,
          openUrls,
          dedupeKeys,
        };

        /* Solo close silenzioso: niente showNotification (banner vuoti iOS). */
        await closeMatching(spec);
        const tags = ids.map((x) => `vc-site-${x}`);
        if (tags.length) await dismissByTagCloseOnly(tags);
        else if (spec.all) {
          const all = await listAllNotifications();
          for (const n of all) {
            if (isAckNotif(n)) continue;
            try {
              n.close();
            } catch {
              /* ignore */
            }
          }
        }
        await closeMatching(spec);
        if (badgeN >= 0) await setOsBadge(badgeN);
        return;
      }

      const n = (p && typeof p.notification === "object" && p.notification) || {};
      const data = {
        ...(n.data || {}),
        id: String(p.id || n.data?.id || "").trim(),
        dedupeKey: String(p.dedupeKey || n.data?.dedupeKey || "").trim(),
        ticketId: String(p.ticketId || n.data?.ticketId || "").trim(),
        openUrl: String(p.openUrl || n.navigate || n.data?.openUrl || p.url || "/").trim(),
        type: "content",
      };
      const title = plainEmoji(p.title || n.title);
      const body = plainEmoji(p.body || n.body);

      /* pushIosNoDouble1: declarative 8030 = iOS ha già mostrato il banner.
         Un secondo showNotification = doppione + coda APNs intasata. */
      const isDeclarative = Number(raw.web_push) === 8030 || Number(p.web_push) === 8030;
      if (isDeclarative && isIosClient()) {
        await ackShown(data);
        if (badgeN >= 0) await setOsBadge(badgeN);
        return;
      }
      /* Solo se davvero vuoto: mai silent return (iOS revoca dopo 3 silent). */
      if (isBlank(title) && isBlank(body) && looksGhost(title) && looksGhost(body)) {
        try {
          await self.registration.showNotification("Vinili & Caffè", {
            body: "Nuova notifica",
            tag: data.id ? `vc-site-${data.id}` : "vc-site-fallback",
            icon: "/images/og-server-icon-still.png",
            badge: "/images/og-server-icon-still.png",
            data: { ...data, url: data.openUrl || "/" },
          });
          await ackShown(data);
        } catch {
          /* ignore */
        }
        if (badgeN >= 0) await setOsBadge(badgeN);
        return;
      }

      /* pushPcBannerFix1: mai GIF (Chrome a volte fallisce showNotification);
         navigate SOLO iOS (su Chrome può far rifiutare le options). */
      const stillIcon = "/images/og-server-icon-still.png";
      const pickIcon = (raw) => {
        const s = String(raw || "").trim();
        if (!s || /\.gif(?:\?|$)/i.test(s)) return stillIcon;
        return s;
      };
      const showTitle = title || body.slice(0, 120) || "Vinili & Caffè";
      const showBody = body && body !== showTitle ? body : body || "Nuova notifica";
      const options = {
        body: showBody,
        icon: pickIcon(p.icon || n.icon),
        badge: pickIcon(p.badge || n.badge),
        data: { ...data, url: data.openUrl || "/" },
        renotify: true,
      };
      const tag = n.tag || (data.id ? `vc-site-${data.id}` : "");
      if (tag) options.tag = tag;
      if (isIosClient() && data.openUrl && /^https?:\/\//i.test(data.openUrl)) {
        options.navigate = data.openUrl;
      }

      try {
        await self.registration.showNotification(showTitle, options);
      } catch {
        try {
          await self.registration.showNotification(showTitle, {
            body: showBody,
            icon: stillIcon,
            badge: stillIcon,
            data: { ...data, url: data.openUrl || "/" },
            ...(tag ? { tag } : {}),
            renotify: true,
          });
        } catch {
          /* ultimo fallback: titolo minimo, niente options esotiche */
          try {
            await self.registration.showNotification("Vinili & Caffè", { body: showBody || "Nuova notifica" });
          } catch {
            /* ignore */
          }
        }
      }
      await ackShown(data);
      if (badgeN >= 0) await setOsBadge(badgeN);
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const nd = (event.notification.data && typeof event.notification.data === "object" && event.notification.data) || {};
  let rawUrl = String(nd.url || nd.openUrl || nd.navigate || "").trim();
  if (!rawUrl || rawUrl === "/" || rawUrl === self.location.origin || rawUrl === `${self.location.origin}/`) {
    rawUrl = "/notifications/";
  }
  let target = "/notifications/";
  try {
    const u = new URL(rawUrl, self.location.origin);
    if (u.origin === self.location.origin) target = u.pathname + u.search + u.hash || "/notifications/";
    else target = u.href;
  } catch {
    target = "/notifications/";
  }
  const abs =
    /^https?:\/\//i.test(target) ? target : new URL(target, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const same = list.find((c) => String(c.url || "").startsWith(self.location.origin));
      if (same) {
        await same.focus().catch(() => null);
        try {
          same.postMessage({ type: "vc:notif-navigate", url: abs });
        } catch {
          /* ignore */
        }
        /* iOS: client.navigate spesso fallisce o apre start_url → home */
        if ("navigate" in same) {
          try {
            await same.navigate(abs);
          } catch {
            /* ignore */
          }
        }
        return;
      }
      if (self.clients.openWindow) await self.clients.openWindow(abs);
    })(),
  );
});

self.addEventListener("notificationclose", (event) => {
  event.waitUntil(
    (async () => {
      if (isAckNotif(event.notification)) return;
      const list = await listAllNotifications();
      let n = 0;
      for (const notif of list) {
        if (!isAckNotif(notif)) n += 1;
      }
      await setOsBadge(n);
    })(),
  );
});
