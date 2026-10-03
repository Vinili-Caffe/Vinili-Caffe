/* eslint-disable no-restricted-globals */
/* swBackPwa1 marker — PWA may register again; push-only (Cache solo su notificationclick) */
/* 20260928swBackPwa1 */
/* 20260928consoleErrFix1 — catch WindowClient.navigate rejection */
/* 20260929pushMultiDevice3 — mai silent; tag per id; push su tutti i device */
/* 20260929cpuIdleHard1 — push icon still (no gif decode) */
/* 20260929pushOpenCold1 — PWA chiusa: pending-nav + openWindow (no client hidden) */
/* 20260930pushOpenCold2 — race start_url vs pending: write+openWindow dest; home poll retry */
/* 20260929pushDismissDedup1 — dismiss chiude OS su tutti i device; ids/ticketIds */
/* 20260929pushInAppSilent1 — in-app focused: niente banner OS (come notif in-app) */
/* 20260930pushPwaBadgeStable1 — clearAppBadge su dismiss; focused strict; badge=OS count */
/* 20260930pushReuseClient1 — riusa PWA già aperta (no seconda finestra); pending nav su standalone */
/* 20261001votePushPairPhone1 — tag/Topic distinti Top.gg vs Discadia; no collapse telefono */
/* 20261001pushColdOpenDest1 — app chiusa: openWindow(dest); non riusare client hidden */
/* 20261001pushBadgeVisitFix1 — swipe/delete → badge sync retry; fanout os-closed; pageUrl match */
/* 20261001pushNoBgUpdate1 — Chrome/Edge PC: niente “aggiornata in background”
   (userVisibleOnly: ogni push deve lasciare una notifica; silent+close immediato) */
/* 20261001pushPhoneNoEmpty1 — Android: niente ack ZWSP (banner vuoti di continuo).
   Mobile in-app → notifica reale; dismiss mobile → ack testuale stesso tag + close */
/* 20261002iosPushNoAck1 — iOS/PWA: mai showNotification ack ("Aggiornato" / solo
   "from Vinili & Caffè"). silent+close non funziona su iOS e ritarda le push vere
   finché non apri la PWA. Ack solo Chrome/Edge desktop. */
/* 20261002pushWinPwaReuse1 — Windows PWA: riusa finestra hidden/minimized;
   niente broadcast mark-read; no openWindow se esiste già un client. */
/* 20261002pushAlwaysShow1 — content push: SEMPRE showNotification reale.
 * 20261002ticketNotifDedup1 — suppressOs:false → client non fa fly gemello. */
   Silent ZWSP ack a focus addestrava Chrome/Edge a ritardare/droppare
   le push in background finché non riapri l’app. */
/* 20261003pushOpenDestFix1 — click push: non perdere deep link ticket
   (www vs apex → /); ricostruisci da ticketId; openWindow se non già su dest. */

self.addEventListener("install", function (event) {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

var PUSH_ICON = "/images/og-server-icon-still.png?v=20260929cpuIdleHard1";

function pushClientUserAgent() {
  try {
    return String((self.navigator && self.navigator.userAgent) || "");
  } catch (eUa) {
    return "";
  }
}

function isMobilePushClient() {
  return /Android|iPhone|iPad|iPod|Mobile|webOS/i.test(pushClientUserAgent());
}

function isApplePushClient() {
  var ua = pushClientUserAgent();
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  /* iPadOS desktop UA + Safari PWA */
  if (/Macintosh/i.test(ua) && /Safari/i.test(ua) && !/Chrome|Chromium|Firefox|Android|CriOS|FxiOS|Edg\//i.test(ua)) {
    return true;
  }
  return false;
}

/** Chrome desktop: push senza showNotification → toast di sistema
 *  «L'applicazione è stata aggiornata in background». Soddisfa userVisibleOnly
 *  con notifica silent che chiudiamo subito (niente banner utile all'utente).
 *  iosPushNoAck1: su iOS/Android NON mostrare nulla — iOS ignora silent e lascia
 *  banner "Aggiornato" / attribution vuota, poi ritarda le push successive. */
function fulfillUserVisibleOnlyQuietly() {
  if (isApplePushClient() || isMobilePushClient()) {
    return Promise.resolve();
  }
  var tag = "vc-push-ack";
  return self.registration
    .showNotification("\u200b", {
      body: "\u200b",
      icon: PUSH_ICON,
      badge: PUSH_ICON,
      tag: tag,
      renotify: false,
      silent: true,
      requireInteraction: false,
      data: { vcAck: 1, openUrl: "/" },
    })
    .then(function () {
      return self.registration.getNotifications({ tag: tag });
    })
    .then(function (list) {
      var arr = list || [];
      for (var i = 0; i < arr.length; i += 1) {
        try {
          arr[i].close();
        } catch (eClose) {}
      }
    })
    .catch(function () {});
}

function asIdList(raw, max) {
  var out = [];
  var seen = {};
  var arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (var i = 0; i < arr.length; i += 1) {
    var v = String(arr[i] || "").trim();
    if (!v || seen[v]) continue;
    seen[v] = true;
    out.push(v);
    if (out.length >= (max || 80)) break;
  }
  return out;
}

function parsePayload(event) {
  var fallback = {
    type: "",
    title: "Nuova notifica",
    body: "Nuova notifica",
    openUrl: "/",
    icon: PUSH_ICON,
    badge: PUSH_ICON,
    id: "",
    ticketId: "",
    messageId: "",
    kind: "info",
    dedupeKey: "",
    channel: "",
    ids: [],
    ticketIds: [],
    all: false,
  };
  if (!event || !event.data) return fallback;
  try {
    var data = JSON.parse(event.data.text());
    if (!data || typeof data !== "object") return fallback;
    var id = String(data.id || "").trim().slice(0, 40);
    var ticketId = String(data.ticketId || "").trim().slice(0, 40);
    var ids = asIdList(data.ids, 80);
    var ticketIds = asIdList(data.ticketIds, 40).map(function (t) {
      return t.toLowerCase();
    });
    if (id && ids.indexOf(id) === -1) ids.unshift(id);
    if (ticketId) {
      var tl = ticketId.toLowerCase();
      if (ticketIds.indexOf(tl) === -1) ticketIds.unshift(tl);
    }
    return {
      type: String(data.type || "").trim().slice(0, 24),
      title: String(data.title || fallback.title).slice(0, 120),
      body: String(data.body || fallback.body).slice(0, 500),
      openUrl: String(data.openUrl || fallback.openUrl).slice(0, 2000),
      icon: String(data.icon || fallback.icon).slice(0, 500) || PUSH_ICON,
      badge: String(data.badge || data.icon || fallback.badge).slice(0, 500) || PUSH_ICON,
      image: String(data.image || "").trim().slice(0, 500),
      id: id,
      ticketId: ticketId,
      messageId: String(data.messageId || "").trim().slice(0, 40),
      kind: String(data.kind || "info").slice(0, 24),
      dedupeKey: String(data.dedupeKey || "").trim().slice(0, 180),
      channel: String(data.channel || "").trim().slice(0, 16),
      ids: ids,
      ticketIds: ticketIds,
      all: data.all === true,
    };
  } catch (e) {
    return fallback;
  }
}

function normalizePathForDismiss(url) {
  try {
    var u = new URL(String(url || "/"), self.location.origin);
    return String(u.pathname || "/").replace(/\/+$/, "") || "/";
  } catch (e) {
    return "";
  }
}

function pageContextFromUrl(pageUrl) {
  try {
    var u = new URL(String(pageUrl || "/"), self.location.origin);
    var path = String(u.pathname || "/").replace(/\/+$/, "") || "/";
    var inbox = String(u.searchParams.get("inbox") || "")
      .trim()
      .toLowerCase();
    var tab = String(u.searchParams.get("tab") || "")
      .trim()
      .toLowerCase();
    if (/\/staff\/inbox$/i.test(path) && tab) inbox = tab;
    var ticket =
      String(u.searchParams.get("ticketId") || "")
        .trim()
        .toLowerCase() ||
      String(u.hash || "")
        .replace(/^#/, "")
        .trim()
        .toLowerCase();
    if (!/^[a-f0-9]{24}$/i.test(ticket)) ticket = "";
    return { path: path, inbox: inbox, ticket: ticket, search: String(u.search || "") };
  } catch (e) {
    return { path: "", inbox: "", ticket: "", search: "" };
  }
}

function openUrlMatchesPageContext(openUrl, ticketId, ctx) {
  if (!ctx || !ctx.path) return false;
  var tid = String(ticketId || "")
    .trim()
    .toLowerCase();
  var destPath = "";
  var destInbox = "";
  var destTid = tid;
  try {
    var u = new URL(String(openUrl || "/"), self.location.origin);
    destPath = String(u.pathname || "/").replace(/\/+$/, "") || "/";
    destInbox = String(u.searchParams.get("inbox") || "")
      .trim()
      .toLowerCase();
    if (!destTid) {
      destTid =
        String(u.searchParams.get("ticketId") || "")
          .trim()
          .toLowerCase() ||
        String(u.hash || "")
          .replace(/^#/, "")
          .trim()
          .toLowerCase();
      if (!/^[a-f0-9]{24}$/i.test(destTid)) destTid = "";
    }
  } catch (e) {
    destPath = normalizePathForDismiss(openUrl);
  }
  if (destTid && ctx.ticket && destTid === ctx.ticket) return true;
  if (destInbox && ctx.inbox && destInbox === ctx.inbox) {
    if (
      (/\/notifications$/i.test(destPath) || /\/staff\/inbox$/i.test(destPath)) &&
      (/\/notifications$/i.test(ctx.path) || /\/staff\/inbox$/i.test(ctx.path))
    ) {
      return true;
    }
    if (destInbox === "pause" && /\/staff\/pause$/i.test(ctx.path)) return true;
    if (destInbox === "appelli" && /\/appelli$/i.test(ctx.path)) return true;
    if (destInbox === "candidature" && /\/candidature$/i.test(ctx.path)) return true;
    if (destInbox === "resoconti" && /\/staff\/resoconti$/i.test(ctx.path)) return true;
  }
  /* pushBadgeVisitFix1: pagina dedicata ↔ openUrl inbox= */
  if (/\/staff\/pause$/i.test(ctx.path) && (/inbox=pause\b/i.test(String(openUrl || "")) || /\/staff\/pause/i.test(destPath))) {
    return true;
  }
  if (/\/appelli$/i.test(ctx.path) && (/inbox=appelli\b/i.test(String(openUrl || "")) || /\/appelli/i.test(destPath))) {
    return true;
  }
  if (
    /\/candidature$/i.test(ctx.path) &&
    (/inbox=candidature\b/i.test(String(openUrl || "")) || /\/candidature/i.test(destPath))
  ) {
    return true;
  }
  if (!destPath || destPath === "/") return false;
  if (destPath === ctx.path) {
    if (destTid && ctx.ticket && destTid !== ctx.ticket) return false;
    if (destInbox && ctx.inbox && destInbox !== ctx.inbox) return false;
    return true;
  }
  if (ctx.path.indexOf(destPath + "/") === 0) return true;
  return false;
}

function dismissSpecFromPayload(payload) {
  return {
    all: payload && payload.all === true,
    id: String((payload && payload.id) || "").trim(),
    ticketId: String((payload && payload.ticketId) || "")
      .trim()
      .toLowerCase(),
    ids: asIdList(payload && payload.ids, 80),
    ticketIds: asIdList(payload && payload.ticketIds, 40).map(function (t) {
      return String(t || "")
        .trim()
        .toLowerCase();
    }),
    openUrls: asIdList(payload && payload.openUrls, 40),
    pageUrl: String((payload && payload.pageUrl) || "").trim(),
  };
}

function dismissSpecFromMessage(data) {
  var id = String((data && data.id) || "").trim();
  var ticketId = String((data && data.ticketId) || "")
    .trim()
    .toLowerCase();
  var ids = asIdList(data && data.ids, 80);
  var ticketIds = asIdList(data && data.ticketIds, 40).map(function (t) {
    return String(t || "")
      .trim()
      .toLowerCase();
  });
  var openUrls = asIdList(data && data.openUrls, 40);
  var pageUrl = String((data && data.pageUrl) || "").trim();
  if (id && ids.indexOf(id) === -1) ids.unshift(id);
  if (ticketId && ticketIds.indexOf(ticketId) === -1) ticketIds.unshift(ticketId);
  return {
    all: data && data.all === true,
    id: id,
    ticketId: ticketId,
    ids: ids,
    ticketIds: ticketIds,
    openUrls: openUrls,
    pageUrl: pageUrl,
  };
}

function notificationMatchesDismiss(notif, spec) {
  if (!notif || !spec) return false;
  if (spec.all) return true;
  var d = notif.data && typeof notif.data === "object" ? notif.data : {};
  var nTid = String(d.ticketId || "")
    .trim()
    .toLowerCase();
  var nId = String(d.id || "").trim();
  var nMsg = String(d.messageId || "").trim();
  var nOpen = String(d.openUrl || "").trim();
  var nTag = String(notif.tag || "");
  var ticketMap = {};
  var idMap = {};
  var i;
  for (i = 0; i < (spec.ticketIds || []).length; i += 1) {
    var tk = String(spec.ticketIds[i] || "")
      .trim()
      .toLowerCase();
    if (tk) ticketMap[tk] = true;
  }
  if (spec.ticketId) ticketMap[spec.ticketId] = true;
  for (i = 0; i < (spec.ids || []).length; i += 1) {
    var ik = String(spec.ids[i] || "").trim();
    if (ik) idMap[ik] = true;
  }
  if (spec.id) idMap[spec.id] = true;
  if (nTid && ticketMap[nTid]) return true;
  if (nId && idMap[nId]) return true;
  if (nMsg && (idMap[nMsg] || idMap[nId])) return true;
  for (var tKey in ticketMap) {
    if (!ticketMap[tKey]) continue;
    if (nTag === "vc-site-ticket-" + tKey) return true;
    if (nTag.indexOf("vc-site-ticket-" + tKey + "-") === 0) return true;
  }
  for (var iKey in idMap) {
    if (!idMap[iKey]) continue;
    if (nTag === "vc-site-" + iKey || nTag.indexOf("vc-site-" + iKey) === 0) return true;
    if (nTag === "vc-site-msg-" + iKey) return true;
  }
  if (nOpen && (spec.openUrls || []).length) {
    var nPath = normalizePathForDismiss(nOpen);
    for (i = 0; i < spec.openUrls.length; i += 1) {
      var ou = String(spec.openUrls[i] || "").trim();
      if (!ou) continue;
      if (ou === nOpen) return true;
      if (nPath && nPath === normalizePathForDismiss(ou)) return true;
    }
  }
  if (spec.pageUrl && nOpen) {
    if (openUrlMatchesPageContext(nOpen, nTid, pageContextFromUrl(spec.pageUrl))) return true;
  }
  if (
    !Object.keys(ticketMap).length &&
    !Object.keys(idMap).length &&
    !(spec.openUrls || []).length &&
    !spec.pageUrl
  ) {
    return false;
  }
  return false;
}

function closeMatchingNotifications(spec) {
  if (!self.registration || typeof self.registration.getNotifications !== "function") {
    return Promise.resolve();
  }
  var jobs = [self.registration.getNotifications()];
  try {
    jobs.push(self.registration.getNotifications({ includeTriggered: true }));
  } catch (eInc) {}
  return Promise.all(jobs)
    .then(function (lists) {
      var seen = {};
      (lists || []).forEach(function (list) {
        (list || []).forEach(function (n) {
          if (!n) return;
          var key =
            String(n.tag || "") +
            "|" +
            String((n.data && n.data.id) || "") +
            "|" +
            String((n.data && n.data.ticketId) || "");
          if (seen[key]) return;
          seen[key] = true;
          if (!notificationMatchesDismiss(n, spec)) return;
          try {
            n.close();
          } catch (eClose) {}
        });
      });
    })
    .then(function () {
      return syncAppBadgeFromOsNotifications();
    })
    .catch(function () {});
}

/* pushPwaBadgeStable1: badge icona PWA = conteggio banner OS aperti (anche app chiusa) */
/* pushBadgeVisitFix1: includeTriggered + retry breve (Android lascia ghost dopo close) */
function syncAppBadgeFromOsNotifications(opts) {
  opts = opts || {};
  var nav = self.navigator || (typeof navigator !== "undefined" ? navigator : null);
  if (!nav) return Promise.resolve();
  var canSet = typeof nav.setAppBadge === "function";
  var canClear = typeof nav.clearAppBadge === "function";
  if (!canSet && !canClear) return Promise.resolve();
  if (!self.registration || typeof self.registration.getNotifications !== "function") {
    if (canClear) {
      try {
        return Promise.resolve(nav.clearAppBadge()).catch(function () {});
      } catch (e0) {
        return Promise.resolve();
      }
    }
    return Promise.resolve();
  }
  var jobs = [self.registration.getNotifications()];
  try {
    jobs.push(self.registration.getNotifications({ includeTriggered: true }));
  } catch (eInc) {}
  return Promise.all(jobs)
    .then(function (lists) {
      var seen = {};
      var n = 0;
      (lists || []).forEach(function (list) {
        (list || []).forEach(function (notif) {
          if (!notif) return;
          var key =
            String(notif.tag || "") +
            "|" +
            String((notif.data && notif.data.id) || "") +
            "|" +
            String((notif.data && notif.data.ticketId) || "");
          if (seen[key]) return;
          seen[key] = true;
          n += 1;
        });
      });
      try {
        if (n > 0 && canSet) return nav.setAppBadge(Math.min(99, n));
        if (canClear) return nav.clearAppBadge();
      } catch (eBadge) {}
      return n;
    })
    .then(function (nOrUndef) {
      if (opts.retry === false) return nOrUndef;
      return new Promise(function (resolve) {
        setTimeout(function () {
          syncAppBadgeFromOsNotifications({ retry: false }).then(resolve).catch(function () {
            resolve(nOrUndef);
          });
        }, 320);
      });
    })
    .catch(function () {
      if (canClear) {
        try {
          return nav.clearAppBadge();
        } catch (e2) {}
      }
      return undefined;
    });
}

function isViniliSiteHost(host) {
  var h = String(host || "")
    .trim()
    .toLowerCase();
  return h === "viniliecaffe.it" || h === "www.viniliecaffe.it" || h === "viniliecaffe.gg" || h === "www.viniliecaffe.gg";
}

function sameOriginUrl(dest) {
  try {
    var u = new URL(String(dest || "/"), self.location.origin);
    var here = new URL(self.location.origin);
    if (u.origin === here.origin) return u.href;
    /* pushOpenDestFix1: apex/www (e .gg) sono lo stesso sito — non buttare path a / */
    if (isViniliSiteHost(u.hostname) && isViniliSiteHost(here.hostname)) {
      return here.origin + (u.pathname || "/") + (u.search || "") + (u.hash || "");
    }
    return here.origin + "/";
  } catch (e) {
    return self.location.origin + "/";
  }
}

/** Deep link sicuro al click: openUrl + ticketId (mai solo homepage se c’è un ticket). */
function resolveNotificationClickDest(nd) {
  nd = nd && typeof nd === "object" ? nd : {};
  var openRaw = String(nd.openUrl || "").trim();
  var ticketId = String(nd.ticketId || "")
    .trim()
    .toLowerCase();
  var dest = sameOriginUrl(openRaw || "/");
  var viewStaff = false;
  var path = "/";
  var hasTicketInUrl = false;
  try {
    var u = new URL(dest);
    path = String(u.pathname || "/").replace(/\/+$/, "") || "/";
    viewStaff = String(u.searchParams.get("view") || "").toLowerCase() === "staff";
    hasTicketInUrl = /^[a-f0-9]{24}$/i.test(String(u.searchParams.get("ticketId") || "").trim());
    if (!hasTicketInUrl) {
      hasTicketInUrl = /^[a-f0-9]{24}$/i.test(String(u.hash || "").replace(/^#/, "").trim());
    }
  } catch (eU) {}
  if (!viewStaff && /[?&]view=staff\b/i.test(openRaw)) viewStaff = true;
  if (/^[a-f0-9]{24}$/i.test(ticketId) && (!hasTicketInUrl || path === "/")) {
    return (
      self.location.origin +
      "/tickets/" +
      (viewStaff ? "?view=staff&" : "?") +
      "ticketId=" +
      encodeURIComponent(ticketId) +
      "#" +
      ticketId
    );
  }
  return dest;
}

var PENDING_NAV_CACHE = "vc-pending-nav-v1";
var PENDING_NAV_URL = "/__vc/pending-nav";

/** Una write su click (cold start PWA apre spesso start_url, non dest). */
function writePendingNav(payload) {
  if (!self.caches || typeof self.caches.open !== "function") return Promise.resolve();
  return self.caches
    .open(PENDING_NAV_CACHE)
    .then(function (cache) {
      return cache.put(
        PENDING_NAV_URL,
        new Response(JSON.stringify(payload || {}), {
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        }),
      );
    })
    .catch(function () {});
}

function openDestWindow(dest) {
  if (!self.clients || typeof self.clients.openWindow !== "function") return Promise.resolve(null);
  return Promise.resolve(self.clients.openWindow(dest)).catch(function () {
    return null;
  });
}

function isSameOriginWindowClient(c) {
  if (!c) return false;
  try {
    return new URL(c.url).origin === self.location.origin;
  } catch (e) {
    return false;
  }
}

/** pushWinPwaReuse1: PWA Windows minimizzata spesso hidden — riusala comunque. */
function pickNotificationClickClient(list, dest, sameDestClientFn) {
  var clients = [];
  for (var i = 0; i < (list || []).length; i += 1) {
    if (isSameOriginWindowClient(list[i])) clients.push(list[i]);
  }
  if (!clients.length) return null;
  var onDest = null;
  var focused = null;
  var visible = null;
  for (var j = 0; j < clients.length; j += 1) {
    var c = clients[j];
    if (sameDestClientFn(c, dest) && !onDest) onDest = c;
    try {
      if (c.focused === true && !focused) focused = c;
    } catch (eF) {}
    if (c.visibilityState === "visible" && !visible) visible = c;
  }
  return onDest || focused || visible || clients[0];
}

function openExistingClientDest(client, dest, notifId, ticketId) {
  try {
    client.postMessage({
      type: "vc:open-dest",
      url: dest,
      ticketId: ticketId,
      id: notifId,
    });
  } catch (ePm) {}
  return Promise.resolve(typeof client.focus === "function" ? client.focus() : null)
    .catch(function () {
      return null;
    })
    .then(function () {
      if (sameDestClient(client, dest)) return client;
      if (typeof client.navigate !== "function") return client;
      return Promise.resolve(client.navigate(dest))
        .then(function (navClient) {
          return navClient || client;
        })
        .catch(function () {
          /* navigate PWA spesso fallisce su Windows — postMessage + location.href in pagina */
          return client;
        });
    });
}

function sameOriginClients() {
  return self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    var out = [];
    (list || []).forEach(function (c) {
      if (!c) return;
      try {
        var u = new URL(c.url);
        if (u.origin !== self.location.origin) return;
      } catch (e) {
        return;
      }
      out.push(c);
    });
    return out;
  });
}

/** pushPwaBadgeStable1: solo client realmente focused — niente fallback “visible”
 *  (su Android un client in background a volte resta visible → OS soppresso = push perse). */
function findInAppFocusedClient(list) {
  for (var i = 0; i < (list || []).length; i += 1) {
    var c = list[i];
    if (!c) continue;
    if (c.visibilityState !== "visible") continue;
    if (c.focused === true) return c;
  }
  return null;
}

function fanoutPushReceived(list, payload, extra) {
  var msg = { type: "vc:push-received", payload: payload };
  if (extra && typeof extra === "object") {
    for (var k in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, k)) msg[k] = extra[k];
    }
  }
  (list || []).forEach(function (c) {
    try {
      c.postMessage(msg);
    } catch (e) {}
  });
}

self.addEventListener("push", function (event) {
  var payload = parsePayload(event);
  if (payload.type === "dismiss") {
    var dismissSpec = dismissSpecFromPayload(payload);
    event.waitUntil(
      Promise.all([
        closeMatchingNotifications(dismissSpec),
        sameOriginClients().then(function (list) {
          fanoutPushReceived(list, payload);
        }),
      ])
        .then(function () {
          /* pushPwaBadgeStable1: all → azzera sempre (anche se qualche banner resta appeso) */
          if (dismissSpec.all) {
            var nav = self.navigator || (typeof navigator !== "undefined" ? navigator : null);
            if (nav && typeof nav.clearAppBadge === "function") {
              try {
                return nav.clearAppBadge();
              } catch (eClr) {}
            }
          }
          return syncAppBadgeFromOsNotifications();
        })
        /* pushNoBgUpdate1 / iosPushNoAck1: dismiss → ack solo desktop (mobile no-op) */
        .then(function () {
          return fulfillUserVisibleOnlyQuietly();
        }),
    );
    return;
  }
  event.waitUntil(
    sameOriginClients().then(function (list) {
      /* pushAlwaysShow1: sempre notifica OS reale per content push.
         Niente silent-ack (addestrava Chrome a ritardare push in background).
         Fanout al client per badge/lista; suppressOs false → niente fly doppio
         (resta il banner OS anche a focus). */
      fanoutPushReceived(list, payload, { suppressOs: false });
      /* votePushPairPhone1: Top.gg vs Discadia = tag OS distinti (Android altrimenti
         sostituisce il banner se arrivano ravvicinati). */
      var kindLc = String(payload.kind || "").toLowerCase();
      var dk = String(payload.dedupeKey || "").toLowerCase();
      var titleLc = String(payload.title || "").toLowerCase();
      var voteTag = "";
      if (kindLc === "vote_reminder" || /vote_reminder_/.test(dk) || /promemoria\s+voto/.test(titleLc)) {
        if (/_topgg|top\.gg|topgg/.test(dk) || /top\.gg/.test(titleLc)) voteTag = "vc-vote-topgg";
        else if (/_discadia|discadia/.test(dk) || /discadia/.test(titleLc)) voteTag = "vc-vote-discadia";
        else voteTag = "vc-vote-" + (payload.id || String(Date.now()));
      }
      /* pushReliability1: tag per id (non solo ticket) così messaggi diversi non si sovrascrivono
         finché l’OS non li collassa; ticket+id resta stabile per open. */
      var tag =
        voteTag ||
        (payload.ticketId && payload.id
          ? "vc-site-ticket-" + payload.ticketId + "-" + payload.id
          : "") ||
        (payload.ticketId ? "vc-site-ticket-" + payload.ticketId : "") ||
        (payload.id ? "vc-site-" + payload.id : "") ||
        "vc-site-push";
      var opts = {
        body: payload.body,
        icon: payload.icon,
        badge: payload.badge,
        tag: tag,
        renotify: true,
        silent: false,
        vibrate: voteTag ? [120, 60, 120, 60, 120] : [90, 50, 90],
        requireInteraction: Boolean(voteTag),
        timestamp: Date.now(),
        data: {
          openUrl: payload.openUrl || "/",
          id: payload.id || "",
          ticketId: payload.ticketId || "",
          messageId: payload.messageId || "",
          kind: payload.kind || "info",
          dedupeKey: payload.dedupeKey || "",
        },
      };
      if (payload.image) opts.image = payload.image;
      return self.registration
        .showNotification(payload.title || "Nuova notifica", opts)
        .then(function () {
          return syncAppBadgeFromOsNotifications();
        });
    }),
  );
});

self.addEventListener("notificationclick", function (event) {
  var nd = {};
  try {
    nd = (event.notification && event.notification.data) || {};
  } catch (e) {}
  try {
    event.notification.close();
  } catch (e2) {}
  var dest = resolveNotificationClickDest(nd);
  var notifId = String(nd.id || "").trim();
  var ticketId = String(nd.ticketId || "").trim();
  function sameDestClient(c, want) {
    if (!c) return false;
    try {
      var a = String(c.url || "").split("#")[0];
      var b = String(want || "").split("#")[0];
      if (!a || !b) return false;
      if (a === b) return true;
      var ua = new URL(a);
      var ub = new URL(b, self.location.origin);
      return ua.pathname.replace(/\/+$/, "") === ub.pathname.replace(/\/+$/, "") &&
        ua.search === ub.search;
    } catch (eSd) {
      return false;
    }
  }
  /* pushPwaBadgeStable1: un solo waitUntil (doppio waitUntil scarta il sync badge) */
  event.waitUntil(
    Promise.resolve()
      .then(function () {
        return syncAppBadgeFromOsNotifications();
      })
      .then(function () {
        return writePendingNav({
          url: dest,
          ticketId: ticketId,
          id: notifId,
          at: Date.now(),
        });
      })
      .then(function () {
        return self.clients.matchAll({ type: "window", includeUncontrolled: true });
      })
      .then(function (list) {
        /* pushOpenDestFix1: già su dest → focus; altrimenti openWindow(dest).
           Non riusare home/altra route: navigate PWA spesso fallisce e restavi lì. */
        var onDest = null;
        for (var i = 0; i < (list || []).length; i += 1) {
          if (sameDestClient(list[i], dest)) {
            onDest = list[i];
            break;
          }
        }
        if (onDest) return openExistingClientDest(onDest, dest, notifId, ticketId);
        return openDestWindow(dest).then(function (opened) {
          if (opened) return opened;
          /* Fallback: nessuna openWindow (alcuni browser) → prova client esistente */
          var reuse = pickNotificationClickClient(list, dest, sameDestClient);
          if (reuse) return openExistingClientDest(reuse, dest, notifId, ticketId);
          return null;
        });
      }),
  );
});

self.addEventListener("notificationclose", function (event) {
  /* pushPwaBadgeStable1: swipe dismiss OS → ricalcola badge (0 se nessuno resta) */
  /* pushBadgeVisitFix1: avvisa client → mark-read così badge/unread non restano */
  var nd = {};
  try {
    nd = (event.notification && event.notification.data) || {};
  } catch (eNd) {}
  var closedId = String(nd.id || "").trim();
  var closedTid = String(nd.ticketId || "").trim();
  try {
    event.waitUntil(
      Promise.all([
        syncAppBadgeFromOsNotifications(),
        sameOriginClients().then(function (list) {
          (list || []).forEach(function (c) {
            try {
              c.postMessage({
                type: "vc:notif-os-closed",
                id: closedId,
                ticketId: closedTid,
              });
            } catch (eMsg) {}
          });
        }),
      ]),
    );
  } catch (eCloseBadge) {}
});

self.addEventListener("message", function (event) {
  var data = event && event.data ? event.data : null;
  if (!data || !data.type) return;
  if (data.type === "vc:skip-waiting") {
    try {
      self.skipWaiting();
    } catch (e) {}
    return;
  }
  /* pushDismissDedup1: chiudi banner OS anche da postMessage pagina (stesso device) */
  if (data.type === "vc:dismiss-notifs") {
    var spec = dismissSpecFromMessage(data);
    event.waitUntil(closeMatchingNotifications(spec));
    return;
  }
  if (data.type === "vc:sync-app-badge") {
    event.waitUntil(syncAppBadgeFromOsNotifications());
    return;
  }
  if (data.type === "vc-clear-app-badge" || data.type === "vc:clear-app-badge") {
    var navClr = self.navigator || (typeof navigator !== "undefined" ? navigator : null);
    if (navClr && typeof navClr.clearAppBadge === "function") {
      event.waitUntil(
        Promise.resolve(navClr.clearAppBadge())
          .catch(function () {})
          .then(function () {
            return syncAppBadgeFromOsNotifications({ retry: false });
          }),
      );
    } else {
      event.waitUntil(syncAppBadgeFromOsNotifications());
    }
  }
});

self.addEventListener("pushsubscriptionchange", function (event) {
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      (list || []).forEach(function (c) {
        try {
          c.postMessage({ type: "vc:push-resubscribe" });
        } catch (e) {}
      });
    }),
  );
});
