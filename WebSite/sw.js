/* Vinili & Caffè — Web Push service worker */
/* v=20260816winbg1 */
/* eslint-disable no-restricted-globals */

self.addEventListener("install", function (event) {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

/** Se Apple/Chrome ruota l'endpoint, avvisa le pagine aperte per riscrivere la subscription. */
self.addEventListener("pushsubscriptionchange", function (event) {
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clients) {
      clients.forEach(function (c) {
        try {
          c.postMessage({ type: "vc:push-resubscribe" });
        } catch (e) {}
      });
    }),
  );
});

function parsePushPayload(event) {
  var fallback = {
    title: "Vinili & Caffè",
    body: "Nuova notifica",
    openUrl: "/",
    icon: "/apple-touch-icon.png",
    badge: "/apple-touch-icon.png",
    id: "",
  };
  if (!event.data) return fallback;
  try {
    var raw = event.data.text();
    var data = JSON.parse(raw);
    if (!data || typeof data !== "object") return fallback;
    return {
      title: String(data.title || fallback.title).slice(0, 120),
      body: String(data.body || fallback.body).slice(0, 500),
      openUrl: String(data.openUrl || fallback.openUrl).slice(0, 2000),
      icon: String(data.icon || fallback.icon).slice(0, 500),
      badge: String(data.badge || data.icon || fallback.badge).slice(0, 500),
      image: String(data.image || "").trim().slice(0, 500),
      kind: String(data.kind || "info").slice(0, 24),
      id: String(data.id || "").trim().slice(0, 40),
      ticketId: String(data.ticketId || "").trim().slice(0, 40),
    };
  } catch (e) {
    try {
      return Object.assign({}, fallback, { body: String(event.data.text() || fallback.body).slice(0, 500) });
    } catch (e2) {
      return fallback;
    }
  }
}

function isSameOriginDest(dest) {
  try {
    return new URL(String(dest || "/"), self.location.origin).origin === self.location.origin;
  } catch (e) {
    return true;
  }
}

function appendNotifReadParam(url, id) {
  var nid = String(id || "").trim();
  if (!nid || !isSameOriginDest(url)) return url;
  try {
    var u = new URL(String(url || "/"), self.location.origin);
    u.searchParams.set("vcNotifRead", nid);
    if (!/^https?:\/\//i.test(String(url || ""))) {
      return u.pathname + u.search + u.hash;
    }
    return u.href;
  } catch (e) {
    return url;
  }
}

var PENDING_READ_CACHE = "vc-notif-pending-read-v1";
var PENDING_READ_URL = "/__vc/pending-notif-read";

function stashPendingReadId(id) {
  var nid = String(id || "").trim();
  if (!nid || !self.caches) return Promise.resolve();
  return self.caches
    .open(PENDING_READ_CACHE)
    .then(function (cache) {
      return cache.match(PENDING_READ_URL).then(function (res) {
        var finish = function (ids) {
          var next = Array.isArray(ids) ? ids.slice() : [];
          if (next.indexOf(nid) === -1) next.push(nid);
          return cache.put(
            PENDING_READ_URL,
            new Response(JSON.stringify({ ids: next, at: Date.now() }), {
              headers: { "Content-Type": "application/json" },
            }),
          );
        };
        if (!res) return finish([]);
        return res
          .json()
          .then(function (data) {
            return finish(data && data.ids);
          })
          .catch(function () {
            return finish([]);
          });
      });
    })
    .catch(function () {});
}

function ticketIdFromPayload(payload) {
  var tid = String((payload && payload.ticketId) || "").trim().toLowerCase();
  if (/^[a-f0-9]{24}$/i.test(tid)) return tid;
  try {
    var u = new URL(String((payload && payload.openUrl) || "/"), self.location.origin);
    var h = String(u.hash || "").replace(/^#/, "").toLowerCase();
    if (/^[a-f0-9]{24}$/i.test(h)) return h;
  } catch (e) {}
  return "";
}

function clientIsWatchingTicket(client, ticketId) {
  if (!client) return false;
  if (client.visibilityState !== "visible") return false;
  if (client.focused !== true) return false;
  var tid = String(ticketId || "").trim().toLowerCase();
  if (!tid) return false;
  try {
    var u = new URL(client.url);
    if (String(u.pathname || "").indexOf("/tickets") === -1) return false;
    var h = String(u.hash || "").replace(/^#/, "").toLowerCase();
    return h === tid;
  } catch (e) {
    return false;
  }
}

function notificationVisuals(payload) {
  var logo = (payload && (payload.icon || payload.badge)) || "/apple-touch-icon.png";
  var ua = "";
  try {
    ua = String(self.navigator.userAgent || "");
  } catch (eUa) {}
  var isAndroid = /Android/i.test(ua);
  var visuals = { badge: logo };
  // Android: `icon` = thumbnail a destra. Solo `badge` mette il logo a sinistra.
  if (!isAndroid) visuals.icon = logo;
  if (payload && payload.image) visuals.image = payload.image;
  return visuals;
}

self.addEventListener("push", function (event) {
  var payload = parsePushPayload(event);
  var ticketId = ticketIdFromPayload(payload);
  var tagBase = ticketId ? "ticket-" + ticketId : payload.id || payload.kind || "info";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
      var anyFocused = false;
      var watchingTicket = false;
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (!client) continue;
        if (client.visibilityState === "visible" && client.focused === true) anyFocused = true;
        if (ticketId && clientIsWatchingTicket(client, ticketId)) watchingTicket = true;
        try {
          client.postMessage({ type: "vc:push-received", payload: payload });
        } catch (eMsg) {}
      }
      // Chat ticket: silenzia solo se stai GUARDANDO quel ticket (tab visibile E a fuoco).
      // Sito aperto ma in background su Windows resta visibility=visible → senza focused non arriva nulla.
      var silent = ticketId ? watchingTicket : anyFocused;
      var visuals = notificationVisuals(payload);
      var opts = {
        body: payload.body || "Nuova notifica",
        badge: visuals.badge,
        lang: "it",
        data: {
          openUrl: payload.openUrl || "/",
          kind: payload.kind || "info",
          id: payload.id || "",
          ticketId: ticketId || "",
        },
        tag: "vc-site-" + String(tagBase),
        renotify: !silent,
        silent: silent,
      };
      if (visuals.icon) opts.icon = visuals.icon;
      if (visuals.image) opts.image = visuals.image;
      if (!silent) opts.vibrate = [90, 50, 90];
      return self.registration.showNotification(payload.title || "Vinili & Caffè", opts);
    }),
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var dest = "/";
  var notifId = "";
  try {
    var nd = event.notification && event.notification.data ? event.notification.data : {};
    dest = String(nd.openUrl || "/").trim() || "/";
    notifId = String(nd.id || "").trim();
  } catch (e) {}
  var sameOrigin = isSameOriginDest(dest);
  var navDest = sameOrigin ? appendNotifReadParam(dest, notifId) : dest;

  event.waitUntil(
    stashPendingReadId(notifId).then(function () {
      return self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
        var focusNav = Promise.resolve();
        var focused = false;
        for (var i = 0; i < clientList.length; i++) {
          var client = clientList[i];
          if (!client) continue;
          try {
            if (notifId) {
              client.postMessage({ type: "vc:notif-mark-read", id: notifId });
            }
          } catch (eMsg) {}
          if (focused || !("focus" in client)) continue;
          if (!sameOrigin) continue;
          focused = true;
          try {
            if (typeof client.navigate === "function") {
              focusNav = client.navigate(navDest).then(function (c) {
                return c && c.focus ? c.focus() : client.focus();
              });
            } else {
              focusNav = client.focus();
            }
          } catch (e2) {
            focusNav = client.focus();
          }
        }
        if (focused) return focusNav;
        if (self.clients.openWindow) return self.clients.openWindow(navDest);
        return undefined;
      });
    }),
  );
});
