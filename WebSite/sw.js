/* eslint-disable no-restricted-globals */

self.addEventListener("install", function (event) {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    self.clients.claim().then(function () {
      return self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clients) {
        clients.forEach(function (c) {
          try {
            c.postMessage({ type: "vc:force-reload-layout", v: "20260831scrollCueHideFast1" });
          } catch (e) {}
        });
      });
    })
  );
});

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

var PUSH_ICON_PATH = "/images/og-server-icon.gif?v=20260904brandGif1";

function normalizePushIcon(icon) {
  var s = String(icon || "").trim();
  if (!s) return PUSH_ICON_PATH;
  if (/apple-touch-icon|pwa-icon|vinylmusics_logo/i.test(s)) return PUSH_ICON_PATH;
  return s;
}

function parsePushPayload(event) {
  var fallback = {
    title: "Nuova notifica",
    body: "Nuova notifica",
    openUrl: "/",
    icon: PUSH_ICON_PATH,
    badge: PUSH_ICON_PATH,
    id: "",
  };
  if (!event.data) return { type: "dismiss", all: false, title: "", body: "", id: "" };
  try {
    var raw = event.data.text();
    var data = JSON.parse(raw);
    if (!data || typeof data !== "object") return fallback;
    return {
      type: String(data.type || "").trim().slice(0, 24),
      title: String(data.title || fallback.title).slice(0, 120),
      body: String(data.body || fallback.body).slice(0, 500),
      openUrl: String(data.openUrl || fallback.openUrl).slice(0, 2000),
      icon: normalizePushIcon(data.icon || fallback.icon).slice(0, 500),
      badge: normalizePushIcon(data.badge || data.icon || fallback.badge).slice(0, 500),
      image: String(data.image || "").trim().slice(0, 500),
      kind: String(data.kind || "info").slice(0, 24),
      id: String(data.id || "").trim().slice(0, 40),
      ticketId: String(data.ticketId || "").trim().slice(0, 40),
      messageId: String(data.messageId || "").trim().slice(0, 40),
      all: data.all === true,
    };
  } catch (e) {
    try {
      return Object.assign({}, fallback, { body: String(event.data.text() || fallback.body).slice(0, 500) });
    } catch (e2) {
      return fallback;
    }
  }
}

function toSameOriginOpenUrl(dest) {
  try {
    var u = new URL(String(dest || "/"), self.location.origin);
    return new URL(u.pathname + u.search + u.hash, self.location.origin).href;
  } catch (e) {
    return dest;
  }
}

function isSameOriginDest(dest) {
  try {
    return new URL(String(dest || "/"), self.location.origin).origin === self.location.origin;
  } catch (e) {
    return true;
  }
}

function appendSearchParam(url, key, value) {
  var k = String(key || "").trim();
  var v = String(value || "").trim();
  if (!k || !v || !isSameOriginDest(url)) return url;
  try {
    var u = new URL(String(url || "/"), self.location.origin);
    u.searchParams.set(k, v);
    if (!/^https?:\/\//i.test(String(url || ""))) {
      return u.pathname + u.search + u.hash;
    }
    return u.href;
  } catch (e) {
    return url;
  }
}

var SW_AUTH_CACHE = "vc-sw-auth-v1";
var SW_AUTH_URL = "/__vc/sw-auth";

function storeSwAuthToken(token) {
  var t = String(token || "").trim();
  if (!self.caches) return Promise.resolve();
  return self.caches
    .open(SW_AUTH_CACHE)
    .then(function (cache) {
      if (!t) return cache.delete(SW_AUTH_URL);
      return cache.put(
        SW_AUTH_URL,
        new Response(JSON.stringify({ token: t, at: Date.now() }), {
          headers: { "Content-Type": "application/json" },
        }),
      );
    })
    .catch(function () {});
}

function readSwAuthToken() {
  if (!self.caches) return Promise.resolve("");
  return self.caches
    .open(SW_AUTH_CACHE)
    .then(function (cache) {
      return cache.match(SW_AUTH_URL).then(function (res) {
        if (!res) return "";
        return res.json().then(function (data) {
          return String((data && data.token) || "").trim();
        });
      });
    })
    .catch(function () {
      return "";
    });
}

function sendTicketReplyFromSw(ticketId, text, replyToId) {
  var tid = String(ticketId || "").trim();
  var body = String(text || "").replace(/\s+/g, " ").trim().slice(0, 2000);
  if (!tid || !body) return Promise.resolve(false);
  return readSwAuthToken().then(function (token) {
    if (!token) return false;
    var url = new URL("/webhooks/site-web-tickets/" + encodeURIComponent(tid) + "/messages", self.location.origin).href;
    var payload = { content: body };
    if (/^[a-f0-9]{24}$/i.test(String(replyToId || ""))) payload.replyToId = String(replyToId).toLowerCase();
    return fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      credentials: "omit",
      body: JSON.stringify(payload),
    }).then(function (res) {
      return Boolean(res && res.ok);
    });
  }).catch(function () {
    return false;
  });
}

function notificationMaxActions() {
  try {
    return Math.max(0, Number(Notification.maxActions) || 0);
  } catch (e) {
    return 0;
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
var PENDING_NAV_CACHE = "vc-pending-nav-v1";
var PENDING_NAV_URL = "/__vc/pending-nav";

function ensureTicketOpenDest(dest, ticketId) {
  var tid = String(ticketId || "").trim();
  var raw = String(dest || "/").trim() || "/";
  if (!/^[a-f0-9]{24}$/i.test(tid)) return raw;
  try {
    var u = new URL(raw, self.location.origin);
    var path = String(u.pathname || "/").replace(/\/+$/, "") || "/";
    var isTickets = /\/tickets$/i.test(path);
    var isHome = path === "/";
    if (!isTickets && !isHome) return raw;
    u.pathname = "/tickets/";
    u.searchParams.set("ticketId", tid);
    var h = String(u.hash || "").replace(/^#/, "");
    if (!/^[a-f0-9]{24}$/i.test(h)) u.hash = tid;
    if (!/^https?:\/\//i.test(raw)) return u.pathname + u.search + u.hash;
    return u.href;
  } catch (e) {
    return "/tickets/?ticketId=" + encodeURIComponent(tid) + "#" + tid;
  }
}

function stashPendingNav(dest, ticketId) {
  if (!self.caches) return Promise.resolve();
  var payload = {
    url: String(dest || ""),
    ticketId: String(ticketId || "").trim(),
    at: Date.now(),
  };
  if (!payload.url && !payload.ticketId) return Promise.resolve();
  return self.caches
    .open(PENDING_NAV_CACHE)
    .then(function (cache) {
      return cache.put(
        PENDING_NAV_URL,
        new Response(JSON.stringify(payload), {
          headers: { "Content-Type": "application/json" },
        }),
      );
    })
    .catch(function () {});
}

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

function uaString() {
  try {
    return String(self.navigator.userAgent || "");
  } catch (e) {
    return "";
  }
}

function isIosUa() {
  var ua = uaString();
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  if (/Macintosh/i.test(ua) && /Mobile/i.test(ua)) return true;
    if (/Macintosh/i.test(ua) && /Safari/i.test(ua) && !/Chrome|Chromium|Firefox|Android|CriOS|FxiOS/i.test(ua)) {
    return true;
  }
  return false;
}

function isMobileUa() {
  return /Android|iPhone|iPad|iPod/i.test(uaString()) || isIosUa();
}

function absAsset(path) {
  var p = String(path || "").trim() || PUSH_ICON_PATH;
  try {
    return new URL(p, self.location.origin).href;
  } catch (e) {
    return p;
  }
}

var lastClientFocus = { focused: false, ticketId: "", at: 0 };
var lastStandaloneClientId = "";
var STANDALONE_CACHE = "vc-standalone-client-v1";
var STANDALONE_URL = "/__vc/standalone-client";

function stashStandaloneClientId(id) {
  var sid = String(id || "").trim();
  if (!sid) return Promise.resolve();
  lastStandaloneClientId = sid;
  if (!self.caches) return Promise.resolve();
  return self.caches
    .open(STANDALONE_CACHE)
    .then(function (cache) {
      return cache.put(
        STANDALONE_URL,
        new Response(JSON.stringify({ id: sid, at: Date.now() }), {
          headers: { "Content-Type": "application/json" },
    }),
  );
    })
    .catch(function () {});
}

function readStandaloneClientId() {
  if (lastStandaloneClientId) return Promise.resolve(lastStandaloneClientId);
  if (!self.caches) return Promise.resolve("");
  return self.caches
    .open(STANDALONE_CACHE)
    .then(function (cache) {
      return cache.match(STANDALONE_URL).then(function (res) {
        if (!res) return "";
        return res.json().then(function (data) {
          lastStandaloneClientId = String((data && data.id) || "").trim();
          return lastStandaloneClientId;
        });
      });
    })
    .catch(function () {
      return "";
    });
}

function isSameOriginClient(client) {
  if (!client) return false;
  try {
    return new URL(String(client.url || "/"), self.location.origin).origin === self.location.origin;
  } catch (e) {
    return false;
  }
}

function pickBestSameOriginClient(list) {
  var stand = null;
  var focused = null;
  var any = null;
  for (var i = 0; i < (list || []).length; i++) {
    var c = list[i];
    if (!isSameOriginClient(c)) continue;
    if (!any) any = c;
    if (c.focused) focused = c;
    if (lastStandaloneClientId && c.id === lastStandaloneClientId) stand = c;
  }
  return stand || focused || any;
}

function isDefinitelyWatchingTicket(ticketId, clientWatching) {
  var tid = String(ticketId || "").trim().toLowerCase();
  if (!tid) return false;
  var pingAge = Date.now() - Number(lastClientFocus.at || 0);
  if (lastClientFocus.at && pingAge >= 0 && pingAge < 12000) {
    return lastClientFocus.focused === true && String(lastClientFocus.ticketId || "") === tid;
  }
        if (!isMobileUa()) return false;
  return clientWatching === true;
}

function getNotificationsTimed(ms) {
  if (!self.registration || typeof self.registration.getNotifications !== "function") {
    return Promise.resolve([]);
  }
  return new Promise(function (resolve) {
    var done = false;
    var t = setTimeout(function () {
      if (done) return;
      done = true;
      resolve([]);
    }, Number(ms) || 700);
    self.registration
      .getNotifications()
      .then(function (list) {
        if (done) return;
        done = true;
        clearTimeout(t);
        resolve(list || []);
      })
      .catch(function () {
        if (done) return;
        done = true;
        clearTimeout(t);
        resolve([]);
      });
  });
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

function looksLikeSiteName(title) {
  var t = String(title || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!t) return true;
  return /^(vinili\s*[&e]\s*caff[eè]?|viniliecaffe|vinili)$/i.test(t);
}

function pushDisplayTitle(payload) {
  var t = String((payload && payload.title) || "").trim();
  if (t && !looksLikeSiteName(t)) return t.slice(0, 120);
  var b = String((payload && payload.body) || "").trim().split("\n")[0];
  if (b) return (b.length > 72 ? b.slice(0, 71) + "…" : b).slice(0, 120);
  return "Nuova notifica";
}

function isReminderPayload(payload) {
  var kind = String((payload && payload.kind) || "").toLowerCase();
  if (kind === "vote_reminder" || kind === "vote") return true;
  var t = String((payload && payload.title) || "").toLowerCase();
  var b = String((payload && payload.body) || "").toLowerCase();
  return /promemoria|reminder|puoi votare|pozioni disponibili|puoi tornare in aula/.test(t + " " + b);
}

function shouldSilenceOsNotification(payload, anyFocused, ticketId, watchingTicket) {
  if (isReminderPayload(payload)) return false;
  if (ticketId) return isDefinitelyWatchingTicket(ticketId, watchingTicket);
  if (anyFocused) return true;
  return false;
}

function notificationTag(payload, ticketId) {
  var messageId = String((payload && payload.messageId) || "").trim();
  if (messageId) return "vc-site-msg-" + messageId;
  var nid = String((payload && payload.id) || "").trim();
  if (ticketId && nid) return "vc-site-ticket-" + ticketId + "-" + nid;
  if (nid) return "vc-site-" + nid;
  if (isReminderPayload(payload)) return "vc-site-reminder-" + Date.now();
  var tagBase = ticketId ? "ticket-" + ticketId + "-" + Date.now() : (payload && payload.kind) || "info";
  return "vc-site-" + String(tagBase);
}

function notificationMatchesDismiss(n, spec) {
  if (!n) return false;
  if (spec && spec.all === true) return true;
  var d = n.data && typeof n.data === "object" ? n.data : {};
  var ticketIds = {};
  var ids = {};
  function addTicket(v) {
    var s = String(v || "").trim().toLowerCase();
    if (s) ticketIds[s] = true;
  }
  function addId(v) {
    var s = String(v || "").trim();
    if (s) ids[s] = true;
  }
  addTicket(spec && spec.ticketId);
  addId(spec && spec.id);
  var extraT = spec && spec.ticketIds;
  if (Array.isArray(extraT)) extraT.forEach(addTicket);
  var extraI = spec && spec.ids;
  if (Array.isArray(extraI)) extraI.forEach(addId);
  var nTid = String(d.ticketId || "").toLowerCase();
  var nId = String(d.id || "");
  var nMsg = String(d.messageId || "");
  var nTag = String(n.tag || "");
  if (nTid && ticketIds[nTid]) return true;
  if (nId && ids[nId]) return true;
  if (nMsg && (ids[nMsg] || ids[nId])) return true;
  for (var t in ticketIds) {
    if (!ticketIds[t]) continue;
    if (nTag === "vc-site-ticket-" + t) return true;
    if (nTag.indexOf("vc-site-ticket-" + t + "-") === 0) return true;
  }
  for (var i in ids) {
    if (!ids[i]) continue;
    if (nTag === "vc-site-" + i || nTag.indexOf("vc-site-" + i) === 0) return true;
    if (nTag === "vc-site-msg-" + i) return true;
  }
  return false;
}

function listAllShownNotifications() {
  if (!self.registration || typeof self.registration.getNotifications !== "function") {
    return Promise.resolve([]);
  }
  var jobs = [self.registration.getNotifications()];
  try {
    jobs.push(self.registration.getNotifications({ includeTriggered: true }));
  } catch (eInc) {}
  return Promise.all(
    jobs.map(function (p) {
      return Promise.resolve(p).catch(function () {
        return [];
      });
    }),
  ).then(function (groups) {
    var out = [];
    var seen = {};
    for (var g = 0; g < groups.length; g++) {
      var list = groups[g] || [];
      for (var i = 0; i < list.length; i++) {
        var n = list[i];
        if (!n) continue;
        var key =
          String(n.tag || "") +
          "|" +
          String((n.data && n.data.id) || "") +
          "|" +
          String((n.data && n.data.messageId) || "") +
          "|" +
          String(n.title || "");
        if (seen[key]) continue;
        seen[key] = true;
        out.push(n);
      }
    }
    return out;
  });
}

function closeMatchingNotifications(spec) {
  function once() {
    return listAllShownNotifications().then(function (list) {
      (list || []).forEach(function (n) {
        try {
          if (notificationMatchesDismiss(n, spec)) n.close();
        } catch (e) {}
      });
    });
  }
  return once().then(function () {
    return new Promise(function (resolve) {
      setTimeout(function () {
        once().then(resolve, resolve);
      }, 280);
    });
  });
}

function dismissShownNotifications(spec) {
  return closeMatchingNotifications({
    ticketId: spec && spec.ticketId,
    id: spec && spec.id,
    ticketIds: spec && spec.ticketIds,
    ids: spec && spec.ids,
    all: Boolean(spec && spec.all === true),
  });
}

function notificationVisuals(payload) {
  var logo = absAsset((payload && (payload.icon || payload.badge)) || PUSH_ICON_PATH);
  var isAndroid = /Android/i.test(uaString());
  var visuals = { badge: logo };
    if (!isAndroid) visuals.icon = logo;
  if (payload && payload.image) visuals.image = absAsset(payload.image);
  return visuals;
}

self.addEventListener("push", function (event) {
  var payload = parsePushPayload(event);
  if (payload.type === "dismiss") {
    event.waitUntil(dismissShownNotifications(payload));
    return;
  }
  var ticketId = ticketIdFromPayload(payload);
  var tag = notificationTag(payload, ticketId);
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
      if (watchingTicket) return null;
      var silent = shouldSilenceOsNotification(payload, anyFocused, ticketId, watchingTicket);
      if (anyFocused && silent && !isReminderPayload(payload)) return null;
      var visuals = notificationVisuals(payload);
      var messageId = String(payload.messageId || "").trim();
      var opts = {
        body: payload.body || "Nuova notifica",
        badge: visuals.badge,
        lang: "it",
        data: {
          openUrl: payload.openUrl || "/",
          kind: payload.kind || "info",
          id: payload.id || "",
          ticketId: ticketId || "",
          messageId: messageId,
        },
        tag: tag,
        renotify: !silent,
        silent: silent,
      };
      if (visuals.icon) opts.icon = visuals.icon;
      if (visuals.image) opts.image = visuals.image;
      if (!silent) opts.vibrate = [90, 50, 90];
      if (!silent && ticketId && messageId && !isIosUa() && notificationMaxActions() > 0) {
        opts.actions = [
          {
            action: "reply",
            title: "Rispondi",
            type: "text",
            placeholder: "Rispondi…",
          },
        ];
      }
      return self.registration.showNotification(pushDisplayTitle(payload), opts).catch(function () {
        try {
          delete opts.actions;
        } catch (eAct) {}
        return self.registration.showNotification(pushDisplayTitle(payload), opts);
      });
    }),
  );
});

self.addEventListener("message", function (event) {
  var data = event && event.data ? event.data : null;
  if (!data || !data.type) return;
  if (data.type === "vc:sw-auth") {
    event.waitUntil(storeSwAuthToken(data.token));
    return;
  }
  if (data.type === "vc:client-focus") {
    lastClientFocus = {
      focused: data.focused === true,
      ticketId: String(data.ticketId || "").trim().toLowerCase(),
      at: Date.now(),
    };
    var jobs = [];
    try {
      if (data.standalone === true && event.source && event.source.id) {
        jobs.push(stashStandaloneClientId(event.source.id));
      }
    } catch (eStand) {}
    if (typeof data.token === "string") jobs.push(storeSwAuthToken(data.token));
    if (jobs.length) event.waitUntil(Promise.all(jobs));
    return;
  }
  if (data.type !== "vc:dismiss-notifs") return;
  event.waitUntil(
    closeMatchingNotifications({
      ticketId: data.ticketId,
      id: data.id,
      ticketIds: data.ticketIds,
      ids: data.ids,
      all: data.all === true,
    }),
  );
});

function postMarkReadToClients(list, notifId, clickTicketId) {
  if (!notifId && !clickTicketId) return;
  for (var i = 0; i < (list || []).length; i++) {
    try {
      list[i].postMessage({
        type: "vc:notif-mark-read",
        id: notifId,
        ticketId: clickTicketId,
      });
    } catch (eMsg) {}
  }
}

function postOpenDestToClient(client, absDest, notifId, clickTicketId) {
  if (!client) return;
  try {
    client.postMessage({
      type: "vc:open-dest",
      url: absDest,
      ticketId: clickTicketId,
      id: notifId,
    });
  } catch (eDest) {}
}

function postOpenDestToAll(list, absDest, notifId, clickTicketId) {
  for (var i = 0; i < (list || []).length; i++) {
    postOpenDestToClient(list[i], absDest, notifId, clickTicketId);
  }
}

function tryNavigateClient(client, absDest) {
  if (!client) return Promise.resolve();
          try {
            if (typeof client.navigate === "function") {
      return client
        .navigate(absDest)
        .then(function (c) {
          return c && c.focus ? c.focus() : client.focus && client.focus();
        })
        .catch(function () {
          return client.focus ? client.focus() : undefined;
        });
    }
    if ("focus" in client) return client.focus();
  } catch (e) {}
  return Promise.resolve();
}

function settleAll(jobs) {
  return Promise.all(
    (jobs || []).map(function (p) {
      return Promise.resolve(p).catch(function () {});
    }),
  );
}

function focusExistingClient(client) {
  if (!client) return Promise.resolve();
  try {
    if ("focus" in client) return client.focus();
  } catch (e) {}
  return Promise.resolve();
}

function openOrFocusTicketFromNotif(navDest, notifId, clickTicketId, sameOrigin) {
  var absDest = sameOrigin ? toSameOriginOpenUrl(navDest) : navDest;
  return readStandaloneClientId().then(function () {
    return self.clients.matchAll({ type: "window", includeUncontrolled: true });
  }).then(function (clientList) {
    var list = clientList || [];
    postMarkReadToClients(list, notifId, clickTicketId);
            if (isIosUa()) {
      postOpenDestToAll(list, absDest, notifId, clickTicketId);
      var iosJobs = [];
      if (sameOrigin) {
        for (var k = 0; k < list.length; k++) iosJobs.push(tryNavigateClient(list[k], absDest));
      }
      if (self.clients.openWindow) iosJobs.push(self.clients.openWindow(absDest));
      return iosJobs.length ? settleAll(iosJobs) : undefined;
    }
            if (isMobileUa()) {
      var androidClient = pickBestSameOriginClient(list);
      if (androidClient) {
        postOpenDestToClient(androidClient, absDest, notifId, clickTicketId);
        return tryNavigateClient(androidClient, absDest);
      }
      if (self.clients.openWindow) return self.clients.openWindow(absDest);
      return undefined;
    }
            var best = pickBestSameOriginClient(list);
    if (best) {
      postOpenDestToClient(best, absDest, notifId, clickTicketId);
      return focusExistingClient(best);
    }
    if (self.clients.openWindow) return self.clients.openWindow(absDest);
    return undefined;
  });
}

self.addEventListener("notificationclick", function (event) {
  var nd = {};
  try {
    nd = event.notification && event.notification.data ? event.notification.data : {};
  } catch (eNd) {}
  event.notification.close();
  var dest = String(nd.openUrl || "/").trim() || "/";
  var notifId = String(nd.id || "").trim();
  var clickTicketId = String(nd.ticketId || "").trim();
  var messageId = String(nd.messageId || "").trim();
  var action = String(event.action || "");
  var replyText = "";
  try {
    replyText = String(event.reply || "").trim();
  } catch (eReply) {}
  var sameOrigin = isSameOriginDest(dest);
  if (sameOrigin) dest = ensureTicketOpenDest(dest, clickTicketId);
  if (!clickTicketId && sameOrigin) {
    try {
      var parsed = new URL(String(dest || "/"), self.location.origin);
      var hashTid = String(parsed.hash || "").replace(/^#/, "").trim();
      if (/^[a-f0-9]{24}$/i.test(hashTid)) clickTicketId = hashTid;
      else {
        var qTid = String(parsed.searchParams.get("ticketId") || "").trim();
        if (/^[a-f0-9]{24}$/i.test(qTid)) clickTicketId = qTid;
      }
    } catch (eTid) {}
  }
  var navDest = sameOrigin ? appendNotifReadParam(dest, notifId) : dest;
  if (action === "reply" && messageId && sameOrigin) {
    navDest = appendSearchParam(navDest, "vcReplyTo", messageId);
  }

      var stashEarly = stashPendingNav(navDest, clickTicketId);

  var closeSiblings = closeMatchingNotifications({
    id: String(nd.id || "").trim(),
    ticketId: String(nd.ticketId || "").trim(),
    ids: [String(nd.id || "").trim(), String(nd.messageId || "").trim()].filter(Boolean),
    ticketIds: String(nd.ticketId || "").trim() ? [String(nd.ticketId || "").trim()] : [],
  });

  function openFromNotif() {
    return stashPendingNav(navDest, clickTicketId).then(function () {
      return openOrFocusTicketFromNotif(navDest, notifId, clickTicketId, sameOrigin);
    });
  }

  event.waitUntil(
    Promise.all([
      stashEarly.catch(function () {}),
      closeSiblings.catch(function () {}),
      stashPendingReadId(notifId).then(function () {
        if (action === "reply" && replyText && clickTicketId) {
          return sendTicketReplyFromSw(clickTicketId, replyText, messageId).then(function (ok) {
            if (ok) {
              return self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
                (clientList || []).forEach(function (client) {
                  try {
                    client.postMessage({
                      type: "vc:notif-mark-read",
                      id: notifId,
                      ticketId: clickTicketId,
                    });
                  } catch (eMsg) {}
                });
              });
            }
            return openFromNotif();
          });
        }
        return openFromNotif();
      }),
    ]),
  );
});
