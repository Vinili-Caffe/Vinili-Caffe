(function () {
  var STORAGE_PREFIX = "vc_notifications_v1:";
  var DISMISSED_PREFIX = "vc_notifications_dismissed_v1:";
  var NOTIF_SYNC_KEY = "vc_notifications_sync_v1";
  var PENDING_READ_PREFIX = "vc_notifications_pending_read_v1:";
  var CLEAR_ALL_AT_PREFIX = "vc_notifications_clear_all_at_v1:";
  var PENDING_LOGIN_NOTIF_KEY = "vc_pending_login_notification_v1";
  var DISCORD_ACCESS_TOKEN_KEY = "vc_discord_access_token";
  var filterMode = "all";
  var currentUserId = "";
  var lastNotifyListRenderSig = "";
  var ignoreSelfNotifSync = 0;
  var notifPeerSyncTimer = null;
  var notifSyncBc = null;
  var pageNotifKnownIds = null;
  var justArrivedNotifIds = new Set();
  var pageMarkReadTimer = null;
  var pageMarkReadQueue = new Set();
  try {
    notifSyncBc = new BroadcastChannel("vc_notifications_sync_v1");
  } catch (eBc) {
    notifSyncBc = null;
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function isOnNotificationsPage() {
    return Boolean(document.body && document.body.classList.contains("vc-notifications-page"));
  }

  function refreshNotifBell() {
    try {
      if (window.vcNotify && typeof window.vcNotify.refresh === "function") {
        window.vcNotify.refresh({ force: true });
      }
    } catch (eRefreshBell) {}
  }

  function syncClearAllBtnVisibility() {
    var btn = byId("vc-notify-clear-all-page");
    if (!btn) return;
    var onStaff = Boolean(document.body && document.body.classList.contains("vc-notif-scope-staff"));
    btn.hidden = onStaff;
    if (onStaff) btn.setAttribute("hidden", "");
    else btn.removeAttribute("hidden");
  }

  function bootstrapPageNotifIds(items) {
    var next = new Set();
    var list = Array.isArray(items) ? items : [];
    for (var i = 0; i < list.length; i += 1) {
      var id = String((list[i] && list[i].id) || "").trim();
      if (id) next.add(id);
    }
    pageNotifKnownIds = next;
  }

  function rememberPageNotifIds(items) {
    if (!(pageNotifKnownIds instanceof Set)) pageNotifKnownIds = new Set();
    var list = Array.isArray(items) ? items : [];
    for (var i = 0; i < list.length; i += 1) {
      var id = String((list[i] && list[i].id) || "").trim();
      if (id) pageNotifKnownIds.add(id);
    }
  }

  function queuePageMarkReadOnServer(id) {
    var sid = String(id || "").trim();
    if (!sid) return;
    pageMarkReadQueue.add(sid);
    if (pageMarkReadTimer) clearTimeout(pageMarkReadTimer);
    pageMarkReadTimer = setTimeout(function () {
      pageMarkReadTimer = null;
      flushPageMarkReadQueue();
    }, 350);
  }

  function flushPageMarkReadQueue() {
    if (!pageMarkReadQueue.size) return;
    var ids = Array.from(pageMarkReadQueue);
    pageMarkReadQueue.clear();
    if (ids.length > 3) {
      markAllReadOnServer().finally(function () {
        refreshNotifBell();
      });
      return;
    }
    Promise.all(
      ids.map(function (sid) {
        return markReadOnServer(sid);
      }),
    ).finally(function () {
      refreshNotifBell();
    });
  }

  function scheduleJustArrivedCleanup(id) {
    var sid = String(id || "").trim();
    if (!sid) return;
    window.setTimeout(function () {
      if (!justArrivedNotifIds.has(sid)) return;
      justArrivedNotifIds.delete(sid);
      lastNotifyListRenderSig = "";
      renderList();
    }, 5200);
  }

  function markAllAsReadWhileOnPage(opts) {
    if (!isOnNotificationsPage()) return;
    var items = loadStored();
    var hadUnread = false;
    var next = items.map(function (x) {
      if (!x || x.read) return x;
      hadUnread = true;
      var sid = String(x.id || "").trim();
      if (sid) rememberPendingRead(sid);
      return Object.assign({}, x, { read: true });
    });
    if (!hadUnread && !(opts && opts.forceServer)) {
      refreshNotifBell();
      return;
    }
    saveStored(next);
    lastNotifyListRenderSig = "";
    renderList();
    refreshNotifBell();
    if (pageMarkReadTimer) clearTimeout(pageMarkReadTimer);
    pageMarkReadTimer = setTimeout(function () {
      pageMarkReadTimer = null;
      markAllReadOnServer().finally(function () {
        refreshNotifBell();
      });
    }, opts && opts.immediate ? 80 : 400);
  }

  var NOTIF_PAGE_FB = {
    "notifPage.timeNow": "Ora",
    "notifPage.timeMinute": "{n} minuto fa",
    "notifPage.timeMinutes": "{n} minuti fa",
    "notifPage.timeHour": "{n} ora fa",
    "notifPage.timeHours": "{n} ore fa",
    "notifPage.timeDay": "{n} giorno fa",
    "notifPage.timeDays": "{n} giorni fa",
    "notifPage.timeOverWeek": "Più di una settimana fa",
    "notifPage.goTo": "Vai",
    "notifPage.goToAria": "Vai alla schermata principale",
    "notifPage.deleteAria": "Elimina notifica",
  };

  function interpolateFallback(str, vars) {
    if (!vars) return str;
    return String(str).replace(/\{(\w+)\}/g, function (_, k) {
      return vars[k] != null ? String(vars[k]) : "{" + k + "}";
    });
  }

  function t(key, vars) {
    if (window.VcI18n && typeof window.VcI18n.t === "function") {
      var out = window.VcI18n.t(key, vars);
      if (out !== key) return out;
    }
    if (Object.prototype.hasOwnProperty.call(NOTIF_PAGE_FB, key)) {
      return interpolateFallback(NOTIF_PAGE_FB[key], vars);
    }
    return key;
  }

  function resolveNotifDestUrl(dest) {
    var u = String(dest || "").trim();
    if (!u) return "";
    if (/^https?:\/\//i.test(u)) return u;
    try {
      return new URL(u, window.location.origin).href;
    } catch (e) {
      return u;
    }
  }

  function shouldOpenNotifInNewTab(href, kind) {
    var k = String(kind || "").toLowerCase();
    if (k !== "vote" && k !== "vote_reminder") return false;
    try {
      var u = new URL(String(href || ""), window.location.origin);
      var host = String(u.hostname || "").toLowerCase();
      return host.indexOf("top.gg") !== -1 || host.indexOf("discadia.com") !== -1;
    } catch (e) {
      return false;
    }
  }

  function openNotifDestination(href, kind) {
    if (!href) return;
    if (shouldOpenNotifInNewTab(href, kind)) {
      try {
        window.open(href, "_blank", "noopener,noreferrer");
        return;
      } catch (e) {}
    }
    try {
      var dest = new URL(String(href), window.location.origin);
      var here = window.location;
      var destPath = String(dest.pathname || "").replace(/\/+$/, "") || "/";
      var herePath = String(here.pathname || "").replace(/\/+$/, "") || "/";
      var isTicketsDest = /\/tickets$/i.test(destPath);
      var onTicketsPage = /\/tickets$/i.test(herePath);
      if (isTicketsDest && onTicketsPage) {
        var ticketId = String(dest.hash || "").replace(/^#/, "").trim();
        if (!/^[a-f0-9]{24}$/i.test(ticketId)) {
          try {
            ticketId = String(dest.searchParams.get("ticketId") || "").trim();
          } catch (eTid) {}
        }
        var wantStaff = false;
        try {
          wantStaff = dest.searchParams.get("view") === "staff";
        } catch (eSp) {}
        if (wantStaff && String(here.search || "").indexOf("view=staff") < 0) {
          window.location.href =
            dest.pathname +
            "?view=staff" +
            (ticketId ? "&ticketId=" + encodeURIComponent(ticketId) + "#" + ticketId : "");
          return;
        }
        if (ticketId && /^[a-f0-9]{24}$/i.test(ticketId)) {
          if (String(here.hash || "").replace(/^#/, "") !== ticketId) {
            here.hash = ticketId;
          }
          try {
            window.dispatchEvent(
              new CustomEvent("vc:web-tickets-open", {
                detail: { id: ticketId, staff: wantStaff },
              }),
            );
          } catch (eEv) {}
          return;
        }
      }
    } catch (eNav) {}
    window.location.href = href;
  }

  function normalizeUserId(value) {
    var id = String(value || "").trim();
    return /^\d{17,20}$/.test(id) ? id : "";
  }

  function userStorageKey(userId) {
    var id = normalizeUserId(userId || currentUserId);
    return id ? STORAGE_PREFIX + id : "";
  }

  function userDismissedKey(userId) {
    var id = normalizeUserId(userId || currentUserId);
    return id ? DISMISSED_PREFIX + id : "";
  }

  function setCurrentUser(user) {
    currentUserId = normalizeUserId(user && user.id);
  }
  function isLocalFrontendOrigin() {
    try {
      var h = String(window.location.hostname || "").toLowerCase();
      return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
    } catch (e) {
      return false;
    }
  }
  function resolvedSiteNotificationsUrl() {
    var c = typeof window !== "undefined" && window.__VC_SITE_NOTIFS ? window.__VC_SITE_NOTIFS : {};
    var local = String(c.apiUrlLocal || "").trim();
    if (isLocalFrontendOrigin() && local) return local;
    var u = String(c.apiUrl || "").trim();
    if (u) return u;
    return "/webhooks/site-notifications";
  }
  function resolvedSiteNotificationsReadUrl() {
    var base = resolvedSiteNotificationsUrl();
    if (!base) return "/webhooks/site-notifications/read";
    return String(base).replace(/\/+$/, "") + "/read";
  }
  function resolvedSiteNotificationsClearUrl() {
    var base = resolvedSiteNotificationsUrl();
    if (!base) return "/webhooks/site-notifications/clear";
    return String(base).replace(/\/+$/, "") + "/clear";
  }
  function resolvedSiteNotificationsDeleteUrl() {
    var base = resolvedSiteNotificationsUrl();
    if (!base) return "/webhooks/site-notifications/delete";
    return String(base).replace(/\/+$/, "") + "/delete";
  }
  function getDiscordAccessToken() {
    try {
      if (typeof window.__vcDiscordGetAccessToken === "function") {
        var viaAuth = String(window.__vcDiscordGetAccessToken() || "").trim();
        if (viaAuth) return viaAuth;
      }
      return String(localStorage.getItem(DISCORD_ACCESS_TOKEN_KEY) || "").trim();
    } catch (e) {
      return "";
    }
  }

  function loadDismissedSet(userId) {
    var key = userDismissedKey(userId);
    if (!key) return new Set();
    try {
      var raw = localStorage.getItem(key);
      var arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) return new Set();
      return new Set(
        arr
          .map(function (x) {
            return String(x || "").trim();
          })
          .filter(Boolean),
      );
    } catch (e) {
      return new Set();
    }
  }

  function notifyNotifStorePeers() {
    try {
      localStorage.setItem(NOTIF_SYNC_KEY, String(Date.now()) + ":" + Math.random().toString(36).slice(2, 8));
    } catch (ePing) {}
    try {
      if (notifSyncBc) notifSyncBc.postMessage({ t: Date.now() });
    } catch (eBcPost) {}
    ignoreSelfNotifSync += 1;
    try {
      window.dispatchEvent(new CustomEvent("vc:notifications-sync"));
    } catch (eEv) {
    } finally {
      ignoreSelfNotifSync -= 1;
    }
  }
  function isNotifStorageSyncKey(key) {
    var k = String(key || "");
    if (!k) return false;
    if (k === NOTIF_SYNC_KEY) return true;
    if (k.indexOf(STORAGE_PREFIX) === 0) return true;
    if (k.indexOf(DISMISSED_PREFIX) === 0) return true;
    return false;
  }
  function onNotifStorePeerSync() {
    if (ignoreSelfNotifSync > 0) return;
    lastNotifyListRenderSig = "";
    renderList();
    try {
      if (window.vcNotify && typeof window.vcNotify.refresh === "function") {
        window.vcNotify.refresh({ force: true });
      }
    } catch (eRefresh) {}
    if (!normalizeUserId(currentUserId) || !getDiscordAccessToken()) return;
    if (notifPeerSyncTimer) clearTimeout(notifPeerSyncTimer);
    notifPeerSyncTimer = setTimeout(function () {
      notifPeerSyncTimer = null;
      syncSiteNotificationsFromServer();
    }, 250);
  }
  function saveDismissedSet(setLike, userId) {
    var key = userDismissedKey(userId);
    if (!key) return;
    var arr = Array.from(setLike || []).filter(Boolean);
    if (arr.length > 500) arr = arr.slice(arr.length - 500);
    var next = JSON.stringify(arr);
    try {
      if (localStorage.getItem(key) === next) return;
      localStorage.setItem(key, next);
      notifyNotifStorePeers();
    } catch (e) {}
  }

  function markDismissed(id, userId) {
    var sid = String(id || "").trim();
    if (!sid) return;
    var set = loadDismissedSet(userId);
    set.add(sid);
    saveDismissedSet(set, userId);
  }

  function clearAllStampKey() {
    var uid = normalizeUserId(currentUserId);
    return CLEAR_ALL_AT_PREFIX + (uid || "anon");
  }
  function rememberClearAllStamp() {
    try {
      localStorage.setItem(clearAllStampKey(), String(Date.now()));
    } catch (e) {}
  }
  function getClearAllAt() {
    try {
      return Number(localStorage.getItem(clearAllStampKey()) || 0) || 0;
    } catch (e2) {
      return 0;
    }
  }
  function isClearedAwayServerRow(mapped, dismissed) {
    if (!mapped) return true;
    var sid = String(mapped.id || "").trim();
    if (sid && dismissed && dismissed.has(sid)) return true;
    var fpId = buildNotifFingerprintId(
      mapped,
      normalizeUserId(currentUserId),
      String(mapped.kind || "info"),
      String(mapped.openUrl || ""),
    );
    if (fpId && dismissed && dismissed.has(fpId)) return true;
    var clearedAt = getClearAllAt();
    var at = Number(mapped.at || 0) || 0;
    if (clearedAt && at && at <= clearedAt) return true;
    return false;
  }

  function hashText(input) {
    var s = String(input || "");
    var h = 5381;
    for (var i = 0; i < s.length; i += 1) {
      h = ((h << 5) + h) + s.charCodeAt(i);
      h = h >>> 0;
    }
    return h.toString(36);
  }

  function buildStableNotifId(payload, ownerId, kind, openUrl) {
    var explicit = payload && payload.id != null ? String(payload.id).trim() : "";
    if (explicit) return explicit;
    var title = String((payload && payload.title) || "").trim();
    var body = String((payload && payload.body) || "").trim();
    var atRaw = payload && payload.at;
    var at = Number.isFinite(Number(atRaw)) ? String(Math.floor(Number(atRaw))) : "";
    return "auto:" + hashText([ownerId, kind, title, body, String(openUrl || ""), at].join("|"));
  }
  function buildNotifFingerprintId(payload, ownerId, kind, openUrl) {
    var p = payload && typeof payload === "object" ? Object.assign({}, payload) : {};
    delete p.id;
    delete p.read;
    delete p.readAt;
    return buildStableNotifId(p, ownerId, kind, openUrl);
  }
  function isAutoClientNotifId(id) {
    return String(id || "").indexOf("auto:") === 0;
  }
  function isServerBackedNotifId(id) {
    return /^[a-f0-9]{24}$/i.test(String(id || "").trim());
  }
  function sameNotifCore(a, b) {
    if (!a || !b) return false;
    return (
      String((a && a.title) || "").trim() === String((b && b.title) || "").trim() &&
      String((a && a.body) || "").trim() === String((b && b.body) || "").trim() &&
      String((a && a.kind) || "").trim() === String((b && b.kind) || "").trim() &&
      String((a && a.openUrl) || "").trim() === String((b && b.openUrl) || "").trim()
    );
  }
  function sameNotifPayload(a, b) {
    if (!a || !b) return false;
    return (
      String((a && a.title) || "").trim() === String((b && b.title) || "").trim() &&
      String((a && a.body) || "").trim() === String((b && b.body) || "").trim() &&
      String((a && a.openUrl) || "").trim() === String((b && b.openUrl) || "").trim()
    );
  }

  function pendingReadKey() {
    var uid = normalizeUserId(currentUserId);
    return uid ? PENDING_READ_PREFIX + uid : PENDING_READ_PREFIX + "anon";
  }
  function readPendingRaw(key) {
    var raw = "";
    try {
      raw = sessionStorage.getItem(key) || "";
    } catch (eS) {}
    if (!raw) {
      try {
        raw = localStorage.getItem(key) || "";
      } catch (eL) {}
    }
    return raw;
  }
  function writePendingRaw(key, json) {
    try {
      sessionStorage.setItem(key, json);
    } catch (eS) {}
    try {
      localStorage.setItem(key, json);
    } catch (eL) {}
  }
  function parsePendingIdMap(raw) {
    var map = {};
    try {
      var arr = raw ? JSON.parse(raw) : [];
      if (Array.isArray(arr)) {
        for (var i = 0; i < arr.length; i += 1) {
          var id = String(arr[i] || "").trim();
          if (id) map[id] = true;
        }
      }
    } catch (e) {}
    return map;
  }
  function loadPendingReadMap() {
    var map = parsePendingIdMap(readPendingRaw(pendingReadKey()));
    var anon = parsePendingIdMap(readPendingRaw(PENDING_READ_PREFIX + "anon"));
    var k;
    for (k in anon) {
      if (Object.prototype.hasOwnProperty.call(anon, k)) map[k] = true;
    }
    return map;
  }
  function savePendingReadMap(map) {
    writePendingRaw(pendingReadKey(), JSON.stringify(Object.keys(map || {})));
    if (normalizeUserId(currentUserId)) {
      writePendingRaw(PENDING_READ_PREFIX + "anon", "[]");
    }
  }
  function rememberPendingRead(id) {
    var sid = String(id || "").trim();
    if (!sid) return;
    var map = loadPendingReadMap();
    map[sid] = true;
    savePendingReadMap(map);
  }
  function forgetPendingRead(id) {
    var sid = String(id || "").trim();
    if (!sid) return;
    var map = loadPendingReadMap();
    if (!map[sid]) return;
    delete map[sid];
    savePendingReadMap(map);
  }
  function applyPendingReads(items) {
    var map = loadPendingReadMap();
    var keys = Object.keys(map);
    if (!keys.length) return Array.isArray(items) ? items : [];
    var uid = normalizeUserId(currentUserId);
    return (Array.isArray(items) ? items : []).map(function (x) {
      var id = String((x && x.id) || "").trim();
      var fp = buildNotifFingerprintId(
        x,
        uid,
        String((x && x.kind) || "info"),
        String((x && x.openUrl) || ""),
      );
      if ((id && map[id] && !x.read) || (fp && map[fp] && !x.read)) {
        return Object.assign({}, x, { read: true });
      }
      return x;
    });
  }
  function loadStored() {
    var key = userStorageKey();
    if (!key) return [];
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return applyPendingReads(sortNotifItems(Array.isArray(arr) ? arr : []));
    } catch (e) {
      return [];
    }
  }
  function notifTime(item) {
    var n = Number(item && item.at);
    return Number.isFinite(n) ? n : 0;
  }
  function sortNotifItems(items) {
    return (Array.isArray(items) ? items.slice() : []).sort(function (a, b) {
      var dt = notifTime(b) - notifTime(a);
      if (dt !== 0) return dt;
      return String(b && b.id || "").localeCompare(String(a && a.id || ""));
    });
  }

  function saveStored(items) {
    var key = userStorageKey();
    if (!key) return;
    var next = JSON.stringify(sortNotifItems(items));
    try {
      if (localStorage.getItem(key) === next) return;
      localStorage.setItem(key, next);
      notifyNotifStorePeers();
    } catch (e) {}
  }

  function addNotif(p) {
    var ownerId = normalizeUserId((p && p.userId) || currentUserId);
    if (!ownerId) return [];
    var kindRaw = p && p.kind;
    var kind =
      kindRaw === "vote"
        ? "vote"
        : kindRaw === "vote_reminder"
          ? "vote_reminder"
        : kindRaw === "success"
          ? "success"
          : kindRaw === "review"
            ? "review"
            : kindRaw === "mod"
              ? "mod"
              : kindRaw === "staff"
                ? "staff"
              : kindRaw === "suggestion"
                ? "suggestion"
                : "info";
    var openUrl = "";
    if (p && typeof p.openUrl === "string") openUrl = String(p.openUrl).trim();
    var stableId = buildStableNotifId(p, ownerId, kind, openUrl);
    var titleRaw = String((p && p.title) || "").toLowerCase();
    var bodyRaw = String((p && p.body) || "").toLowerCase();
    if (
      kind === "vote" &&
      (titleRaw.indexOf("promemoria") !== -1 ||
        bodyRaw.indexOf("promemoria") !== -1)
    ) {
      kind = "vote_reminder";
    }
    var fpId = buildNotifFingerprintId(p, ownerId, kind, openUrl);
    var dismissed = loadDismissedSet(ownerId);
    if ((stableId && dismissed.has(stableId)) || (fpId && dismissed.has(fpId))) return loadStored();
    var incomingRead = Boolean(p && (p.read === true || p.readAt));
    var item = {
      id: stableId || String(Date.now()) + "-" + String(Math.floor(Math.random() * 1e9)),
      title: String((p && p.title) || ""),
      body: String((p && p.body) || ""),
      at: typeof (p && p.at) === "number" ? p.at : Date.now(),
      read: incomingRead,
      kind: kind,
      openUrl: openUrl,
    };
    var key = userStorageKey(ownerId);
    var s = [];
    try {
      var raw = localStorage.getItem(key);
      var arr = raw ? JSON.parse(raw) : [];
      s = Array.isArray(arr) ? arr : [];
    } catch (e) {
      s = [];
    }
    if (stableId || fpId) {
      for (var dup = 0; dup < s.length; dup += 1) {
        var exId = String((s[dup] && s[dup].id) || "").trim();
        var exKind = String((s[dup] && s[dup].kind) || kind);
        var exOpen = String((s[dup] && s[dup].openUrl) || openUrl);
        var exFp = buildNotifFingerprintId(s[dup], ownerId, exKind, exOpen);
        var idMatch = Boolean(stableId && exId === stableId);
        var fpMatch = Boolean(fpId && (exId === fpId || exFp === fpId));
        var mongoToAutoFp = Boolean(
          stableId &&
            !isAutoClientNotifId(stableId) &&
            isAutoClientNotifId(exId) &&
            exFp === fpId,
        );
        if (!idMatch && !fpMatch && !mongoToAutoFp) continue;
        var merged = Object.assign({}, s[dup], item, {
          id: stableId || exId,
          read: Boolean(s[dup].read) || incomingRead,
        });
        s[dup] = merged;
        try {
          localStorage.setItem(key, JSON.stringify(s));
        } catch (e3) {}
        return s;
      }
    }
    if (stableId && !isAutoClientNotifId(stableId)) {
      for (var c = 0; c < s.length; c += 1) {
        var cid = String((s[c] && s[c].id) || "").trim();
        if (!cid || cid === stableId) continue;
        if (!isAutoClientNotifId(cid) && cid.length === 24) continue;
        if (!sameNotifCore(s[c], item)) continue;
        var mergedC = Object.assign({}, s[c], item, {
          id: stableId,
          read: Boolean(s[c].read) || incomingRead,
        });
        s[c] = mergedC;
        try {
          localStorage.setItem(key, JSON.stringify(s));
        } catch (e4) {}
        return s;
      }
    }
    s.push(item);
    s = sortNotifItems(s);
    try {
      localStorage.setItem(key, JSON.stringify(s));
    } catch (e2) {}
    return s;
  }

  function flushPendingLoginNotification() {
    var raw = "";
    try {
      raw = String(localStorage.getItem(PENDING_LOGIN_NOTIF_KEY) || "");
    } catch (e) {
      raw = "";
    }
    if (!raw) return;
    var data = null;
    try {
      data = JSON.parse(raw);
    } catch (e2) {
      data = null;
    }
    if (!data || typeof data !== "object") return;
    var ownerId = normalizeUserId(data.userId);
    if (!ownerId) {
      try {
        localStorage.removeItem(PENDING_LOGIN_NOTIF_KEY);
      } catch (e4) {}
      return;
    }
    if (!currentUserId || ownerId !== currentUserId) return;
    try {
      localStorage.removeItem(PENDING_LOGIN_NOTIF_KEY);
    } catch (e3) {}
    addNotif(data);
  }


  /* notifCats3 */
  /* notifUseful1 */
  var DEDICATED_INBOX_QUEUES_PAGE = {
    pause: 1,
    candidature: 1,
    appelli: 1,
    resoconti: 1,
    "punti-tolti": 1,
  };
  function inboxQueueIdFromPageUrl(raw) {
    var s = String(raw || "").trim();
    if (!s) return "";
    try {
      var u = new URL(s, window.location.origin);
      var inbox = String(u.searchParams.get("inbox") || "")
        .trim()
        .toLowerCase();
      return DEDICATED_INBOX_QUEUES_PAGE[inbox] ? inbox : "";
    } catch (e) {
      var m = s.toLowerCase().match(/[?&]inbox=(pause|candidature|appelli|resoconti|punti-tolti)\b/);
      return m ? m[1] : "";
    }
  }
  function isVoteRegisteredNotifPage(n) {
    if (!n) return false;
    var kind = String(n.kind || "").toLowerCase();
    var hay = (String(n.title || "") + " " + String(n.body || "")).toLowerCase();
    if (kind === "vote_reminder") return false;
    if (/promemoria|puoi votare di nuovo|reminder/.test(hay)) return false;
    if (kind === "vote") return true;
    if (/voto\s+(su\s+)?(top\.?gg|discadia)\s+registrato/.test(hay)) return true;
    if (/voto registrato/.test(hay) && /(top\.?gg|discadia)/.test(hay)) return true;
    return false;
  }
  function pageNotifKey(n) {
    return String((n && (n.dedupeKey || n.id)) || "").toLowerCase();
  }
  function isPuntiToltiSubjectNotifPage(n) {
    if (!n) return false;
    var key = pageNotifKey(n);
    if (/^pt-removed:/.test(key) || /^pt-review:/.test(key)) return true;
    var hay = (String(n.title || "") + " " + String(n.body || "")).toLowerCase();
    return /punto partnership rimosso|punti tolti\s*[—\-–]?\s*(rimozione confermata|segnalazione negata)/.test(
      hay,
    );
  }
  function isPersonalTicketOpenerNotifPage(n) {
    if (!n) return false;
    var ch = String(n.channel || "").toLowerCase();
    var url = String(n.openUrl || "").toLowerCase();
    if (ch === "inbox" || /(?:\?|&)view=staff\b/.test(url)) return false;
    var key = pageNotifKey(n);
    if (
      /^web_ticket:(staff_reply|needs_reply|closed|claimed|close-request|close-rejected|event):/.test(key)
    ) {
      return true;
    }
    if (ch === "personal") {
      var k0 = String(n.kind || "").toLowerCase();
      if (k0 === "web_ticket" || k0 === "web_ticket_mention") return true;
    }
    var k = String(n.kind || "").toLowerCase();
    if (k !== "web_ticket" && k !== "web_ticket_mention") return false;
    return /\/tickets\//.test(url) && !/(?:\?|&)view=staff\b/.test(url);
  }
  function isStaffTicketSlaNotifPage(n) {
    if (!n) return false;
    if (String(n.kind || "").toLowerCase() === "web_ticket_sla") return true;
    return /^web_ticket:sla:/.test(pageNotifKey(n));
  }
  function isMentionNotifPage(n) {
    if (!n) return false;
    var k = String(n.kind || "").toLowerCase();
    if (k === "web_ticket_mention" || k === "workflow_mention") return true;
    var key = pageNotifKey(n);
    return /^web_ticket:mention:/.test(key) || /^wfc:mention:/.test(key);
  }
  function isWorkflowDecisionNotifPage(n) {
    if (!n) return false;
    if (String(n.kind || "").toLowerCase() === "workflow_decision") return true;
    return /^(cand-|unban-|unmute-|cand-pex-|cand-rej-|wfc:decision:|appeal-auto-close:)/.test(pageNotifKey(n));
  }
  function isStaffTicketNotifPage(n) {
    if (!n) return false;
    if (isPersonalTicketOpenerNotifPage(n)) return false;
    if (isStaffTicketSlaNotifPage(n)) return true;
    var key = pageNotifKey(n);
    if (/^web_ticket:queue:/.test(key) || /^web_ticket:chat:/.test(key) || /^web_ticket:sla:/.test(key)) {
      return true;
    }
    var kind = String(n.kind || "").toLowerCase();
    if (kind === "web_ticket_sla") return true;
    if (kind === "web_ticket_mention" || kind === "workflow_mention") {
      var urlM = String(n.openUrl || "").toLowerCase();
      if (/\/tickets\//.test(urlM) && /(?:\?|&)view=staff\b/.test(urlM)) return true;
      if (String(n.channel || "").toLowerCase() === "inbox") return true;
      return false;
    }
    if (kind !== "web_ticket" && kind !== "web_ticket_mention") return false;
    var url = String(n.openUrl || "").toLowerCase();
    return /\/tickets\//.test(url) && /(?:\?|&)view=staff\b/.test(url);
  }
  function isStaffReviewNotifPage(n) {
    if (!n) return false;
    var key = pageNotifKey(n);
    if (/^rev-new:/.test(key)) return true;
    if (String(n.kind || "").toLowerCase() !== "review") return false;
    return /^nuova recensione\b/i.test(String(n.title || "").trim());
  }
  function isStaffFeedbackNotifPage(n) {
    if (!n) return false;
    var key = pageNotifKey(n);
    if (/^suggestion:new:/.test(key) || /^bot_feedback_new:/.test(key)) return true;
    if (String(n.kind || "").toLowerCase() !== "suggestion") return false;
    return /^(nuovo|nuova)\s+(suggerimento|segnalazione|bug)\b/i.test(String(n.title || "").trim());
  }
  function isDedicatedInboxQueueAlertPage(n) {
    if (!n) return false;
    var ch = String(n.channel || "").toLowerCase();
    if (ch === "personal") return false;
    var key = pageNotifKey(n);
    if (
      /^pt-removed:/.test(key) ||
      /^pt-review:/.test(key) ||
      /^pause:decision:/.test(key) ||
      /^val-/.test(key) ||
      /^wfc:(invite|remove|msg):subj:/.test(key) ||
      /^wfc:decision:/.test(key)
    ) {
      return false;
    }
    if (isPuntiToltiSubjectNotifPage(n)) return false;
    if (isWorkflowDecisionNotifPage(n)) return false;
    if (/^inbox:(pause|candidature|appelli|resoconti)(?::|$)/.test(key)) return true;
    if (/^pt-pending:/.test(key)) return true;
    if (/^wfc:(invite|remove|msg):staff:/.test(key)) return true;
    if (!inboxQueueIdFromPageUrl(n.openUrl)) return false;
    var hay = (String(n.title || "") + " " + String(n.body || "")).toLowerCase();
    return /nuovo resoconto|nuovo appello|nuova candidatur|nuova richiesta pausa|punti tolti\s*[—\-–]?\s*segnalazione in attesa|richiedente in chat/.test(
      hay,
    );
  }
  function isInboxLinkedNotifPage(n) {
    if (!n) return false;
    if (isWorkflowDecisionNotifPage(n) || isPersonalTicketOpenerNotifPage(n)) return false;
    if (isPuntiToltiSubjectNotifPage(n)) return true;
    if (isStaffTicketSlaNotifPage(n)) return true;
    if (isStaffTicketNotifPage(n)) return true;
    if (isStaffReviewNotifPage(n)) return true;
    if (isStaffFeedbackNotifPage(n)) return true;
    if (isMentionNotifPage(n) && String(n.channel || "").toLowerCase() !== "personal") return true;
    var ch = String(n.channel || "").toLowerCase();
    if (ch === "personal") return false;
    if (ch === "inbox") return true;
    if (isDedicatedInboxQueueAlertPage(n)) return true;
    var key = String(n.dedupeKey || "").toLowerCase();
    if (
      /^inbox:/.test(key) ||
      /^wfc:(invite|remove|msg):staff:/.test(key) ||
      /^wfc:mention:/.test(key) ||
      /^pt-pending:/.test(key) ||
      /^web_ticket:sla:/.test(key)
    ) {
      return true;
    }
    return false;
  }
  function personalPageCategory(n) {
    var kind = String((n && n.kind) || "info").toLowerCase();
    var key = pageNotifKey(n);
    if (kind === "vote" || kind === "vote_reminder") return "votes";
    if (kind === "web_ticket" || kind === "web_ticket_mention") return "tickets";
    if (isMentionNotifPage(n)) return "tickets";
    if (isWorkflowDecisionNotifPage(n)) {
      if (/appelli|unban|unmute|appeal/.test(key + " " + String(n.openUrl || "").toLowerCase())) {
        return "appelli";
      }
      return "candidature";
    }
    if (kind === "review") return "reviews";
    if (kind === "suggestion") return "feedback";
    if (kind === "staff") return "staff";
    if (kind === "mod" || kind === "success") return "community";
    return "system";
  }
  var PAGE_PERSONAL_CATS = [
    { id: "votes", label: "Voti", ico: "fa-clock-o" },
    { id: "tickets", label: "Ticket", ico: "fa-ticket" },
    { id: "candidature", label: "Candidature", ico: "fa-file-text-o" },
    { id: "appelli", label: "Appelli", ico: "fa-gavel" },
    { id: "reviews", label: "Recensioni", ico: "fa-star" },
    { id: "feedback", label: "Feedback", ico: "fa-magic" },
    { id: "staff", label: "Eventi staff", ico: "fa-id-badge" },
    { id: "community", label: "Community", ico: "fa-users" },
    { id: "system", label: "Sistema", ico: "fa-bell-o" },
  ];
  /* notifTrash1: trash inside unified category header row (right of count, before chev). */
  function buildNotifCategoryBarPage(opts) {
    var bar = document.createElement("div");
    bar.className = "vc-notif-cat-bar vc-notif-bell-inbox__link";
    var head = document.createElement("button");
    head.type = "button";
    head.className =
      (opts.headClass || "vc-notify-cat-head vc-notif-bell-inbox__toggle") +
      " vc-notif-cat-toggle-inner";
    head.setAttribute("aria-expanded", opts.expanded ? "true" : "false");
    head.innerHTML = opts.headHtml;
    var actions = document.createElement("span");
    actions.className = "vc-notif-cat-head__actions";
    var clearBtn = null;
    if (typeof opts.onClear === "function") {
      clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.className = "vc-notif-cat-clear";
      clearBtn.title = opts.clearTitle || "Elimina categoria";
      clearBtn.setAttribute("aria-label", opts.clearAriaLabel || clearBtn.title);
      clearBtn.innerHTML = '<i class="fa fa-trash-o" aria-hidden="true"></i>';
      clearBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        opts.onClear(ev);
      });
      actions.appendChild(clearBtn);
    }
    var chev = document.createElement("i");
    chev.className = "fa fa-chevron-down vc-notify-cat-head__chev vc-notif-bell-inbox__chev";
    chev.setAttribute("aria-hidden", "true");
    actions.appendChild(chev);
    bar.appendChild(head);
    bar.appendChild(actions);
    if (typeof opts.onToggleClick === "function") {
      head.addEventListener("click", opts.onToggleClick);
    }
    return { bar: bar, head: head, clearBtn: clearBtn, actions: actions, chev: chev };
  }
  function clearPageCategory(catId) {
    var uid = normalizeUserId(currentUserId);
    var items = loadStored();
    var dismissed = loadDismissedSet(uid);
    var next = [];
    items.forEach(function (n) {
      if (!n || isInboxLinkedNotifPage(n) || isVoteRegisteredNotifPage(n)) {
        next.push(n);
        return;
      }
      if (personalPageCategory(n) !== catId) {
        next.push(n);
        return;
      }
      var nid = String(n.id || "").trim();
      if (nid) dismissed.add(nid);
      var fpId = buildNotifFingerprintId(n, uid, String(n.kind || "info"), String(n.openUrl || ""));
      if (fpId) dismissed.add(fpId);
      if (nid) {
        try {
          deleteSiteNotificationOnServer(nid);
        } catch (e2) {}
      }
    });
    saveDismissedSet(dismissed, uid);
    saveStored(next);
    lastNotifyListRenderSig = "";
    renderList();
    refreshNotifBell();
  }
  function iconClass(kind) {
    if (kind === "vote" || kind === "vote_reminder") return "fa-check";
    if (kind === "success") return "fa-check-circle";
    if (kind === "review") return "fa-star";
    if (kind === "mod") return "fa-shield";
    if (kind === "staff") return "fa-id-badge";
    if (kind === "suggestion") return "fa-magic";
    return "fa-bell-o";
  }

  function kindUiLabel(kind) {
    if (kind === "vote") return t("notifPage.kind.vote");
    if (kind === "vote_reminder") return t("notifPage.kind.voteReminder");
    if (kind === "success") return t("notifPage.kind.success");
    if (kind === "review") return t("notifPage.kind.review");
    if (kind === "mod") return t("notifPage.kind.mod");
    if (kind === "staff") return t("notifPage.kind.staff");
    if (kind === "suggestion") return t("notifPage.kind.suggestion");
    return t("notifPage.kind.info");
  }

  function timeAgoIt(atMs) {
    var s = Math.floor((Date.now() - atMs) / 1000);
    if (s < 45) return t("notif.justNow") || t("notifPage.timeNow");
    var m = Math.floor(s / 60);
    if (m < 60) return m === 1 ? t("notif.minuteAgo") || t("notifPage.timeMinute", { n: m }) : t("notif.minutesAgo", { n: m }) || t("notifPage.timeMinutes", { n: m });
    var h = Math.floor(m / 60);
    if (h < 24) return h === 1 ? t("notif.hourAgo") || t("notifPage.timeHour", { n: h }) : t("notif.hoursAgo", { n: h }) || t("notifPage.timeHours", { n: h });
    var d = Math.floor(h / 24);
    if (d < 7) return d === 1 ? t("notif.dayAgo") || t("notifPage.timeDay", { n: d }) : t("notif.daysAgo", { n: d }) || t("notifPage.timeDays", { n: d });
    return t("notif.weekPlusAgo") || t("notifPage.timeOverWeek");
  }

  function filteredRows(rows) {
    var list = Array.isArray(rows) ? rows : [];
    if (filterMode === "filtered") {
      return list.filter(function (n) {
        return Boolean(n && n.filtered);
      });
    }
    var active = list.filter(function (n) {
      return !(n && n.filtered);
    });
    if (filterMode === "unread") {
      return active.filter(function (n) {
        return !n.read;
      });
    }
    return active;
  }

  function setFilterButtons() {
    var allBtn = byId("vc-filter-all");
    var unreadBtn = byId("vc-filter-unread");
    var filteredBtn = byId("vc-filter-filtered");
    var filteredCard = byId("vc-stat-filtered-card");
    if (allBtn) {
      allBtn.classList.toggle("vc-notify-filter-btn--on", filterMode === "all");
      allBtn.classList.toggle("is-active", filterMode === "all");
    }
    if (unreadBtn) {
      unreadBtn.classList.toggle("vc-notify-filter-btn--on", filterMode === "unread");
      unreadBtn.classList.toggle("is-active", filterMode === "unread");
    }
    if (filteredBtn) {
      filteredBtn.classList.toggle("vc-notify-filter-btn--on", filterMode === "filtered");
      filteredBtn.classList.toggle("is-active", filterMode === "filtered");
    }
    if (filteredCard) {
      filteredCard.classList.toggle("vc-notify-stat--active", filterMode === "filtered");
      filteredCard.setAttribute("aria-pressed", filterMode === "filtered" ? "true" : "false");
    }
  }

  function renderStats(allRows) {
    var list = Array.isArray(allRows) ? allRows : [];
    var active = list.filter(function (n) {
      return !(n && n.filtered);
    });
    var filteredCount = list.filter(function (n) {
      return Boolean(n && n.filtered);
    }).length;
    var total = active.length;
    var unread = active.filter(function (n) {
      return !n.read;
    }).length;
    var read = total - unread;
    var subtitle = byId("vc-notify-subtitle");
    var totalEl = byId("vc-stat-total");
    var unreadEl = byId("vc-stat-unread");
    var readEl = byId("vc-stat-read");
    var filteredEl = byId("vc-stat-filtered");
    var countApi = typeof window !== "undefined" ? window.VCCountUp : null;
    if (subtitle) {
      subtitle.textContent =
        (unread === 0 ? t("notifPage.allRead") : t("notif.unread", { n: unread })) +
        " - " +
        t("notifPage.totalSuffix", { n: total });
    }
    if (totalEl) {
      if (countApi && typeof countApi.set === "function") countApi.set(totalEl, total, "int");
      else totalEl.textContent = String(total);
    }
    if (unreadEl) {
      if (countApi && typeof countApi.set === "function") countApi.set(unreadEl, unread, "int");
      else unreadEl.textContent = String(unread);
    }
    if (readEl) {
      if (countApi && typeof countApi.set === "function") countApi.set(readEl, read, "int");
      else readEl.textContent = String(read);
    }
    if (filteredEl) {
      if (countApi && typeof countApi.set === "function") countApi.set(filteredEl, filteredCount, "int");
      else filteredEl.textContent = String(filteredCount);
    }
  }

  function markRead(id, extra) {
    var sid = String(id || "").trim();
    var dest = String((extra && extra.openUrl) || "").trim();
    if (sid) rememberPendingRead(sid);
    var next = loadStored().map(function (x) {
      if (!x || x.read) return x;
      var xid = String((x && x.id) || "").trim();
      var xDest = String((x && x.openUrl) || "").trim();
      var match = Boolean(sid && xid === sid);
      if (!match && dest && xDest && dest === xDest && dest !== "/") match = true;
      if (!match) return x;
      if (xid) rememberPendingRead(xid);
      var fp = buildNotifFingerprintId(
        x,
        normalizeUserId(currentUserId),
        String((x && x.kind) || "info"),
        xDest,
      );
      if (fp) rememberPendingRead(fp);
      return Object.assign({}, x, { read: true });
    });
    saveStored(next);
  }
  function markReadOnServer(id) {
    var token = getDiscordAccessToken();
    var uid = normalizeUserId(currentUserId);
    var sid = String(id || "").trim();
    if (!token || !uid || !sid) return Promise.resolve(false);
    return fetch(resolvedSiteNotificationsReadUrl(), {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      credentials: "omit",
      keepalive: true,
      body: JSON.stringify({ id: sid }),
    })
      .then(function (r) {
        return r && r.ok;
      })
      .catch(function () {
        return false;
      });
  }
  function markAllReadOnServer() {
    var token = getDiscordAccessToken();
    var uid = normalizeUserId(currentUserId);
    if (!token || !uid) return Promise.resolve(false);
    return fetch(resolvedSiteNotificationsReadUrl(), {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      credentials: "omit",
      keepalive: true,
      body: JSON.stringify({ all: true }),
    })
      .then(function (r) {
        return r && r.ok;
      })
      .catch(function () {
        return false;
      });
  }
  function deleteSiteNotificationOnServer(id) {
    var token = getDiscordAccessToken();
    var uid = normalizeUserId(currentUserId);
    var sid = String(id || "").trim();
    if (!token || !uid || !sid || !/^[a-f0-9]{24}$/i.test(sid)) return;
    fetch(resolvedSiteNotificationsDeleteUrl(), {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      credentials: "omit",
      body: JSON.stringify({ id: sid }),
    }).catch(function () {});
  }
  function clearAllSiteNotificationsOnServer() {
    var token = getDiscordAccessToken();
    var uid = normalizeUserId(currentUserId);
    if (!token || !uid) return Promise.resolve(false);
    return fetch(resolvedSiteNotificationsClearUrl(), {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      credentials: "omit",
      body: JSON.stringify({}),
    })
      .then(function (r) {
        return r.json().catch(function () {
          return null;
        });
      })
      .then(function (j) {
        return Boolean(j && j.ok);
      })
      .catch(function () {
        return false;
      });
  }
  function mapServerRowToStoredItemPage(row) {
    var kindRaw = row && row.kind;
    var kind =
      kindRaw === "vote"
        ? "vote"
        : kindRaw === "vote_reminder"
          ? "vote_reminder"
          : kindRaw === "success"
            ? "success"
            : kindRaw === "review"
              ? "review"
              : kindRaw === "mod"
                ? "mod"
                : kindRaw === "staff"
                  ? "staff"
                : kindRaw === "suggestion"
                  ? "suggestion"
                  : kindRaw === "web_ticket" || kindRaw === "web_ticket_mention"
                    ? "web_ticket"
                    : "info";
    var titleRaw = String((row && row.title) || "").toLowerCase();
    var bodyRaw = String((row && row.body) || "").toLowerCase();
    if (
      kind === "vote" &&
      (titleRaw.indexOf("promemoria") !== -1 ||
        bodyRaw.indexOf("promemoria") !== -1)
    ) {
      kind = "vote_reminder";
    }
    var openUrl = "";
    if (row && typeof row.openUrl === "string") openUrl = String(row.openUrl).trim();
    var atMs = typeof row.at === "number" ? row.at : Date.now();
    return {
      id: String(row.id || "").trim(),
      title: String((row && row.title) || ""),
      body: String((row && row.body) || ""),
      at: atMs,
      read: Boolean(row.read === true || row.readAt),
      kind: kind,
      openUrl: openUrl,
      filtered: Boolean(row && row.filtered),
      channel: String((row && row.channel) || "").toLowerCase() || undefined,
      dedupeKey: String((row && row.dedupeKey) || "").trim(),
    };
  }
  function buildNotifyPageSignature(items, shownCount) {
    var parts = [];
    for (var si = 0; si < items.length; si += 1) {
      var n = items[si];
      if (!n) continue;
      parts.push(
        String(n.id || "") +
          "\x1e" +
          (n.read ? "1" : "0") +
          "\x1e" +
          (n.filtered ? "1" : "0") +
          "\x1e" +
          String(n.at || 0) +
          "\x1e" +
          String(n.kind || "") +
          "\x1e" +
          String(n.title || "") +
          "\x1e" +
          String(n.body || ""),
      );
    }
    return parts.join("\x1f") + "|f:" + filterMode + "|s:" + shownCount;
  }

  function mergePageStoredWithServerList(list, uid) {
    var oldItems = loadStored();
    var beforeSig = buildNotifyPageSignature(oldItems, filteredRows(oldItems).length);
    var dismissed = loadDismissedSet(uid);
    var oldReadMap = {};
    var oldById = {};
    var serverIdMap = {};
    var fromServer = [];
    for (var ori = 0; ori < oldItems.length; ori += 1) {
      var oid = String((oldItems[ori] && oldItems[ori].id) || "").trim();
      if (oid) oldById[oid] = oldItems[ori];
      if (oid && oldItems[ori] && oldItems[ori].read) oldReadMap[oid] = true;
    }
    var pendingReadMap = loadPendingReadMap();
    var onPage = isOnNotificationsPage();
    var bootstrapped = pageNotifKnownIds instanceof Set;
    for (var i = 0; i < list.length; i += 1) {
      var row = list[i];
      if (!row || !row.title) continue;
      var sid = String(row.id || "").trim();
      if (!sid) continue;
      var mapped = mapServerRowToStoredItemPage(row);
      var fpId = buildNotifFingerprintId(mapped, uid, mapped.kind, mapped.openUrl);
      if (isClearedAwayServerRow(mapped, dismissed)) continue;
      serverIdMap[sid] = true;
      var oldSame = oldById[sid];
      if (mapped.read) {
        forgetPendingRead(sid);
        if (fpId) forgetPendingRead(fpId);
      } else if (
        (pendingReadMap[sid] || (fpId && pendingReadMap[fpId]) || oldReadMap[sid]) &&
        oldSame &&
        !sameNotifPayload(oldSame, mapped)
      ) {
        delete pendingReadMap[sid];
        if (fpId) delete pendingReadMap[fpId];
        delete oldReadMap[sid];
        forgetPendingRead(sid);
        if (fpId) forgetPendingRead(fpId);
      }
      if (onPage) {
        var isNewArrival = bootstrapped && !pageNotifKnownIds.has(sid);
        if (isNewArrival) {
          justArrivedNotifIds.add(sid);
          scheduleJustArrivedCleanup(sid);
          queuePageMarkReadOnServer(sid);
        }
        if (!mapped.read || isNewArrival || !bootstrapped) {
          mapped = Object.assign({}, mapped, { read: true });
          rememberPendingRead(sid);
          if (fpId) rememberPendingRead(fpId);
        }
      }
      fromServer.push(
        Object.assign({}, mapped, {
          read:
            Boolean(mapped.read) ||
            Boolean(oldReadMap[sid]) ||
            Boolean(pendingReadMap[sid]) ||
            Boolean(fpId && pendingReadMap[fpId]),
        }),
      );
    }
    var keepLocal = [];
    for (var li = 0; li < oldItems.length; li += 1) {
      var it = oldItems[li];
      var lid = String((it && it.id) || "").trim();
      if (!lid) continue;
      if (!isAutoClientNotifId(lid) || serverIdMap[lid]) continue;
      var exKind = String((it && it.kind) || "info");
      var exOpen = String((it && it.openUrl) || "");
      var fpId = buildNotifFingerprintId(it, uid, exKind, exOpen);
      if (dismissed.has(lid) || dismissed.has(fpId)) continue;
      keepLocal.push(it);
    }
    var merged = keepLocal.concat(fromServer);
    saveStored(merged);
    if (onPage) {
      if (!bootstrapped) bootstrapPageNotifIds(merged);
      else rememberPageNotifIds(fromServer);
      refreshNotifBell();
      flushPageMarkReadQueue();
    }
    return beforeSig !== buildNotifyPageSignature(merged, filteredRows(merged).length);
  }
  function readCachedDiscordUser(token) {
    if (!token) return null;
    try {
      var raw = sessionStorage.getItem("vc_discord_me_cache_v1");
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || !o.user || !normalizeUserId(o.user.id)) return null;
      var age = Date.now() - Number(o.at || 0);
      if (!Number.isFinite(age) || age < 0 || age > 180000) return null;
      var fp = String(o.fp || "");
      var tokPart = String(token).slice(0, 32);
      if (!fp || fp.indexOf(tokPart) < 0) return null;
      return o.user;
    } catch (eCache) {
      return null;
    }
  }

  function resolveCurrentUserEarly() {
    if (window.__VC_DISCORD_PROFILE && normalizeUserId(window.__VC_DISCORD_PROFILE.id)) {
      setCurrentUser(window.__VC_DISCORD_PROFILE);
      return Boolean(currentUserId);
    }
    var token = getDiscordAccessToken();
    var cached = readCachedDiscordUser(token);
    if (cached) {
      setCurrentUser(cached);
      return Boolean(currentUserId);
    }
    return Boolean(currentUserId);
  }

  function waitForNotifSession(maxMs) {
    var cap = Number(maxMs);
    if (!Number.isFinite(cap) || cap <= 0) cap = 3600;
    return new Promise(function (resolve) {
      if (resolveCurrentUserEarly() && getDiscordAccessToken()) {
        resolve(true);
        return;
      }
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        window.removeEventListener("vc-discord-profile", onProfile);
        resolve(Boolean(getDiscordAccessToken() && resolveCurrentUserEarly()));
      }
      function onProfile(ev) {
        setCurrentUser(ev && ev.detail ? ev.detail.user : null);
        finish();
      }
      window.addEventListener("vc-discord-profile", onProfile);
      (function poll() {
        if (done) return;
        if (getDiscordAccessToken() && resolveCurrentUserEarly()) {
          finish();
          return;
        }
        cap -= 120;
        if (cap <= 0) {
          finish();
          return;
        }
        window.setTimeout(poll, 120);
      })();
    });
  }

  function bootNotifList() {
    resolveCurrentUserEarly();
    markAllAsReadWhileOnPage({ immediate: true });
    renderList();
    waitForNotifSession().then(function (ok) {
      if (!ok) return;
      syncSiteNotificationsFromServer();
    });
  }

  function syncSiteNotificationsFromServer() {
    var token = getDiscordAccessToken();
    var uid = normalizeUserId(currentUserId);
    if (!token || !uid) return;
    var url = resolvedSiteNotificationsUrl();
    if (!url) return;
    var headers = { Authorization: "Bearer " + token };
    try {
      if (window.VcPerf && typeof window.VcPerf.apiHeaders === "function") {
        headers = window.VcPerf.apiHeaders(headers);
      }
      if (window.VcPerf && typeof window.VcPerf.notificationsLimit === "function") {
        var lim = window.VcPerf.notificationsLimit(50);
        url += (url.indexOf("?") >= 0 ? "&" : "?") + "limit=" + encodeURIComponent(String(lim));
        if (window.VcPerf.isLite && window.VcPerf.isLite()) url += "&lite=1&perf=lite";
        else if (window.VcPerf.tier && window.VcPerf.tier() === "mid") url += "&perf=mid";
      }
    } catch (ePerfN) {}
    fetch(url, { headers: headers, credentials: "omit" })
      .then(function (r) {
        if (r && r.status === 401) return null;
        return r.json();
      })
      .then(function (j) {
        if (!j || j.ok !== true || !Array.isArray(j.items)) return;
        var list = j.items.slice().reverse();
        if (mergePageStoredWithServerList(list, uid)) renderList();
      })
      .catch(function () {});
  }

  function removeOne(id) {
    var uid = normalizeUserId(currentUserId);
    var items = loadStored();
    var item = null;
    for (var ri = 0; ri < items.length; ri += 1) {
      if (items[ri] && items[ri].id === id) {
        item = items[ri];
        break;
      }
    }
    var dismissed = loadDismissedSet(uid);
    var sid = String(id || "").trim();
    if (sid) dismissed.add(sid);
    if (item) {
      var fpId = buildNotifFingerprintId(item, uid, String(item.kind || "info"), String(item.openUrl || ""));
      if (fpId) dismissed.add(fpId);
    }
    saveDismissedSet(dismissed, uid);
    saveStored(items.filter(function (x) {
      return x.id !== id;
    }));
    deleteSiteNotificationOnServer(id);
  }

  function clearAll() {
    var uid = normalizeUserId(currentUserId);
    var items = loadStored();
    var dismissed = loadDismissedSet(uid);
    for (var ci = 0; ci < items.length; ci += 1) {
      var it = items[ci];
      var lid = String((it && it.id) || "").trim();
      if (lid) dismissed.add(lid);
      var fpId = buildNotifFingerprintId(it, uid, String((it && it.kind) || "info"), String((it && it.openUrl) || ""));
      if (fpId) dismissed.add(fpId);
    }
    saveDismissedSet(dismissed, uid);
    rememberClearAllStamp();
    saveStored([]);
    lastNotifyListRenderSig = "";
    renderList();
    clearAllSiteNotificationsOnServer().finally(function () {
      window.setTimeout(function () {
        syncSiteNotificationsFromServer();
      }, 600);
    });
  }

  function openAndMarkRead(n, destRaw) {
    if (!n) return;
    var dest = String(destRaw || (n && n.openUrl) || "").trim();
    markRead(n.id, { openUrl: dest });
    lastNotifyListRenderSig = "";
    renderList();
    markReadOnServer(n.id).finally(function () {
      window.setTimeout(function () {
        syncSiteNotificationsFromServer();
      }, 400);
    });
    if (dest) openNotifDestination(resolveNotifDestUrl(dest), n.kind);
  }

  function renderList() {
    var list = byId("vc-notify-list");
    var empty = byId("vc-notify-empty");
    if (!list || !empty) return;
    var all = loadStored().filter(function (n) {
      return !isVoteRegisteredNotifPage(n) && !isInboxLinkedNotifPage(n);
    });
    var shown = filteredRows(all);
    setFilterButtons();
    renderStats(all);
    var sig = buildNotifyPageSignature(all, shown.length);
    if (sig === lastNotifyListRenderSig) return;
    lastNotifyListRenderSig = sig;

    list.innerHTML = "";
    if (shown.length === 0) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    var scrollToId = "";

    function appendNotifyPageRow(n, host) {
      var target = host || list;
      var li = document.createElement("li");
      li.className = "vc-notify-row vc-staff-inbox-item";
      li.classList.add("vc-notify-row--kind-" + String(n.kind || "info"));
      if (n.kind === "success") li.classList.add("vc-notify-row--success");
      if (n.read) li.classList.add("vc-notify-row--read");
      if (n.filtered) li.classList.add("vc-notify-row--filtered");
      if (!n.read) li.classList.add("is-unread");
      if (justArrivedNotifIds.has(String(n.id || ""))) {
        li.classList.add("vc-notify-row--just-arrived");
        if (!scrollToId) scrollToId = String(n.id || "");
      }
      li.setAttribute("data-id", n.id);
      li.setAttribute("tabindex", "0");
      li.setAttribute("role", "button");
      var destRaw = String((n && n.openUrl) || "").trim();
      if (destRaw) li.classList.add("vc-notify-row--link");
      li.addEventListener("click", function (ev) {
        if (ev.target.closest(".vc-notify-close-btn")) return;
        openAndMarkRead(n, destRaw);
      });
      li.addEventListener("keydown", function (ev) {
        if (ev.key !== "Enter" && ev.key !== " ") return;
        if (ev.target.closest(".vc-notify-close-btn")) return;
        ev.preventDefault();
        openAndMarkRead(n, destRaw);
      });

      var iconWrap = document.createElement("span");
      iconWrap.className = "vc-notify-row-icon";
      iconWrap.innerHTML = '<i class="fa ' + iconClass(n.kind) + '" aria-hidden="true"></i>';

      var main = document.createElement("div");
      main.className = "vc-notify-row-main";

      var title = document.createElement("p");
      title.className = "vc-notify-row-title";
      title.textContent = n.title || "";

      var desc = document.createElement("p");
      desc.className = "vc-notify-row-desc";
      desc.textContent = n.body || "";

      var meta = document.createElement("div");
      meta.className = "vc-notify-row-meta";
      var when = document.createElement("span");
      when.className = "vc-notify-row-time";
      when.textContent = timeAgoIt(n.at || Date.now());
      meta.appendChild(when);
      if (!n.read) {
        var unreadMark = document.createElement("span");
        unreadMark.className = "vc-notify-row-unread";
        unreadMark.textContent = "Non letta";
        meta.appendChild(unreadMark);
      }

      main.appendChild(title);
      main.appendChild(desc);
      main.appendChild(meta);

      var badge = document.createElement("span");
      badge.className = "vc-notify-row-badge";
      if (destRaw) {
        badge.textContent = t("notifPage.goTo");
      } else if (!n.read) {
        badge.textContent = kindUiLabel(n.kind);
        badge.classList.add("is-pending");
      } else {
        badge.textContent = kindUiLabel(n.kind);
        badge.classList.add("is-ok");
      }

      var closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "vc-notify-close-btn";
      closeBtn.setAttribute("aria-label", t("notifPage.deleteAria") || t("notif.close"));
      closeBtn.innerHTML = '<i class="fa fa-times" aria-hidden="true"></i>';
      closeBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        removeOne(n.id);
      });

      li.appendChild(iconWrap);
      li.appendChild(main);
      li.appendChild(badge);
      li.appendChild(closeBtn);
      target.appendChild(li);
    }
    var catBuckets = Object.create(null);
    PAGE_PERSONAL_CATS.forEach(function (c) { catBuckets[c.id] = []; });
    shown.forEach(function (n) {
      var cid = personalPageCategory(n);
      if (!catBuckets[cid]) catBuckets[cid] = [];
      catBuckets[cid].push(n);
    });
    PAGE_PERSONAL_CATS.forEach(function (cat) {
      var items = catBuckets[cat.id] || [];
      if (!items.length) return;
      var section = document.createElement("li");
      section.className = "vc-notify-cat-section vc-notif-bell-inbox__row";
      section.setAttribute("data-notif-cat", cat.id);
      var itemsHost = document.createElement("ul");
      itemsHost.className = "vc-notify-cat-items vc-notif-bell-inbox__items";
      itemsHost.setAttribute("role", "list");
      itemsHost.hidden = true;
      itemsHost.setAttribute("hidden", "");
      var catBar = buildNotifCategoryBarPage({
        headClass: "vc-notify-cat-head vc-notif-bell-inbox__toggle",
        headHtml:
          '<span class="vc-notify-cat-head__ico vc-notif-bell-inbox__ico" aria-hidden="true"><i class="fa ' +
          cat.ico +
          '"></i></span><span class="vc-notify-cat-head__label vc-notif-bell-inbox__label">' +
          cat.label +
          '</span><span class="vc-notify-cat-head__count vc-notif-bell-inbox__count">' +
          String(items.length) +
          "</span>",
        clearAriaLabel: "Elimina tutte in " + cat.label,
        onClear: function () {
          clearPageCategory(cat.id);
        },
        onToggleClick: function (ev) {
          ev.preventDefault();
          var open = !section.classList.contains("is-open");
          section.classList.toggle("is-open", open);
          catBar.bar.classList.toggle("is-open", open);
          catBar.head.classList.toggle("is-open", open);
          catBar.head.setAttribute("aria-expanded", open ? "true" : "false");
          itemsHost.hidden = !open;
          if (open) itemsHost.removeAttribute("hidden");
          else itemsHost.setAttribute("hidden", "");
        },
      });
      var bar = catBar.bar;
      var head = catBar.head;
      items.forEach(function (n) {
        appendNotifyPageRow(n, itemsHost);
      });
      section.appendChild(bar);
      section.appendChild(itemsHost);
      list.appendChild(section);
    });
    if (scrollToId) {
      window.requestAnimationFrame(function () {
        var target = list.querySelector('[data-id="' + scrollToId.replace(/"/g, "") + '"]');
        if (target && typeof target.scrollIntoView === "function") {
          target.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      });
    }
  }

  function init() {
    resolveCurrentUserEarly();
    setCurrentUser(window.__VC_DISCORD_PROFILE || (currentUserId ? { id: currentUserId } : null));
    var allBtn = byId("vc-filter-all");
    var unreadBtn = byId("vc-filter-unread");
    var filteredBtn = byId("vc-filter-filtered");
    var filteredCard = byId("vc-stat-filtered-card");
    var clearBtn = byId("vc-notify-clear-all-page");

    function setMode(mode) {
      filterMode = mode;
      lastNotifyListRenderSig = "";
      renderList();
    }

    if (allBtn) {
      allBtn.addEventListener("click", function () {
        setMode("all");
      });
    }
    if (unreadBtn) {
      unreadBtn.addEventListener("click", function () {
        setMode("unread");
      });
    }
    if (filteredBtn) {
      filteredBtn.addEventListener("click", function () {
        setMode("filtered");
      });
    }
    if (filteredCard) {
      filteredCard.addEventListener("click", function () {
        setMode(filterMode === "filtered" ? "all" : "filtered");
      });
      filteredCard.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          setMode(filterMode === "filtered" ? "all" : "filtered");
        }
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        clearAll();
        renderList();
      });
    }

    flushPendingLoginNotification();
    syncClearAllBtnVisibility();
    bootNotifList();
    initNotifPrefs();
    window.addEventListener("vc:notif-scope", syncClearAllBtnVisibility);
  }

  var VOTE_DM_KEYS = { bump: true, vote_topgg: true };
  var DISCORD_DM_KEYS = { broadcast: true, invites: true, perks: true };
  var DM_LABEL_OVERRIDE = {
    bump: "Discadia",
    vote_topgg: "Top.gg",
    broadcast: "Avvisi staff",
    invites: "Inviti",
    perks: "Livelli e perk",
  };
  var notifPrefsState = { dm: null, siteNotif: null };
  // site open by default so site toggles are visible under Filtri
  var notifPrefsOpenSections = { vote: true, discord: false, site: true };
  var notifPrefsWired = false;

  function canSeeStaffNotifPrefs() {
    try {
      if (window.__VC_STAFF_MENU_ALLOWED === true) return true;
      var api = window.VcNotifStaffTab;
      if (api && typeof api.canStaff === "function" && api.canStaff()) return true;
      var p = window.__VC_STAFF_PERMS;
      if (p && typeof p === "object" && p.ok) return true;
      if (
        document.querySelector(
          ".vc-header-snav [data-vc-staff-nav], .vc-snav-details[data-vc-staff-nav], #vc-staff-snav-details",
        )
      ) {
        return true;
      }
    } catch (e) {}
    return false;
  }

  function prefsApiUrl() {
    var c = window.__VC_PROFILE_EXTRAS || {};
    return String(c.apiUrl || "/webhooks/site-profile-extras").trim() || "/webhooks/site-profile-extras";
  }

  function prefsToken() {
    try {
      if (typeof window.__vcDiscordGetAccessToken === "function") {
        var viaAuth = String(window.__vcDiscordGetAccessToken() || "").trim();
        if (viaAuth) return viaAuth;
      }
      return String(localStorage.getItem(DISCORD_ACCESS_TOKEN_KEY) || "").trim();
    } catch (e) {
      return "";
    }
  }

  function setPrefsStatus(msg, isErr) {
    var text = String(msg || "").trim();
    var el = byId("vc-notif-prefs-status");
    if (el) {
      el.hidden = true;
      el.textContent = "";
      el.classList.remove("is-error");
    }
    if (!text) {
      if (window.VcSiteToast && typeof window.VcSiteToast.hide === "function") {
        window.VcSiteToast.hide();
      }
      return;
    }
    if (window.VcSiteToast && typeof window.VcSiteToast.show === "function") {
      window.VcSiteToast.show(text, Boolean(isErr), {
        pending: /[…]$|\.\.\.$/.test(text),
      });
      return;
    }
    if (!el) return;
    el.hidden = false;
    el.textContent = text;
    el.classList.toggle("is-error", Boolean(isErr));
  }

  function setPrefsPanelOpen(open) {
    var panel = byId("vc-notif-prefs-panel");
    var btn = byId("vc-notif-prefs-btn");
    if (!panel || !btn) return;
    panel.hidden = !open;
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.classList.toggle("vc-notify-filter-btn--on", Boolean(open));
    btn.classList.toggle("is-active", Boolean(open));
  }

  function toggleSwitchHtml(opts) {
    var on = Boolean(opts && opts.enabled);
    var section = String((opts && opts.section) || "");
    var key = String((opts && opts.key) || "");
    var label = String((opts && opts.label) || key);
    return (
      '<div class="vc-notif-prefs__row">' +
      '<span class="vc-notif-prefs__row-label">' +
      label +
      "</span>" +
      '<button type="button" class="vc-notif-prefs__switch' +
      (on ? " is-on" : "") +
      '" role="switch" aria-checked="' +
      (on ? "true" : "false") +
      '" data-prefs-section="' +
      section +
      '" data-prefs-key="' +
      key +
      '" aria-label="' +
      label +
      '"><span class="vc-notif-prefs__knob" aria-hidden="true"></span></button>' +
      "</div>"
    );
  }

  function accordionSectionHtml(id, title, hint, rowsHtml, open) {
    return (
      '<div class="vc-notif-prefs__acc' +
      (open ? " is-open" : "") +
      '" data-acc="' +
      id +
      '">' +
      '<button type="button" class="vc-notif-prefs__acc-head" data-acc-toggle="' +
      id +
      '" aria-expanded="' +
      (open ? "true" : "false") +
      '">' +
      '<span class="vc-notif-prefs__acc-title">' +
      title +
      "</span>" +
      (hint
        ? '<span class="vc-notif-prefs__acc-hint">' + hint + "</span>"
        : "") +
      '<i class="fa fa-chevron-down vc-notif-prefs__acc-chev" aria-hidden="true"></i>' +
      "</button>" +
      '<div class="vc-notif-prefs__acc-body"' +
      (open ? "" : " hidden") +
      ">" +
      rowsHtml +
      "</div></div>"
    );
  }

  function renderNotifPrefs() {
    var body = byId("vc-notif-prefs-body");
    if (!body) return;
    var dmCats = (notifPrefsState.dm && notifPrefsState.dm.categories) || [];
    var siteGroups = (notifPrefsState.siteNotif && notifPrefsState.siteNotif.groups) || [];
    var siteDigests = (notifPrefsState.siteNotif && notifPrefsState.siteNotif.digests) || [];
    if (!dmCats.length && !siteGroups.length) {
      body.innerHTML = '<p class="vc-notif-prefs__empty">Nessuna preferenza disponibile.</p>';
      return;
    }

    var voteRows = dmCats
      .filter(function (c) {
        return VOTE_DM_KEYS[c.key];
      })
      .map(function (c) {
        return toggleSwitchHtml({
          section: "dm",
          key: c.key,
          label: DM_LABEL_OVERRIDE[c.key] || c.label || c.key,
          enabled: c.enabled,
        });
      })
      .join("");

    var discordRows = dmCats
      .filter(function (c) {
        return DISCORD_DM_KEYS[c.key];
      })
      .map(function (c) {
        return toggleSwitchHtml({
          section: "dm",
          key: c.key,
          label: DM_LABEL_OVERRIDE[c.key] || c.label || c.key,
          enabled: c.enabled,
        });
      })
      .join("");

    var STAFF_ONLY_SITE_KEYS = { staff: 1, ticket_sla: 1 };
    var siteRows = siteGroups
      .filter(function (g) {
        // Eventi staff / SLA: only staff (same gate as Inbox); API also filters
        if (STAFF_ONLY_SITE_KEYS[String((g && g.key) || "")]) return canSeeStaffNotifPrefs();
        return true;
      })
      .map(function (g) {
        return toggleSwitchHtml({
          section: "site_notif",
          key: g.key,
          label: g.label || g.key,
          enabled: g.enabled,
        });
      })
      .join("");

    /* notifUseful1: digest toggles */
    if (canSeeStaffNotifPrefs() && siteDigests.length) {
      siteRows += siteDigests
        .map(function (g) {
          return toggleSwitchHtml({
            section: "site_notif_digest",
            key: g.key,
            label: g.label || g.key,
            enabled: g.enabled,
          });
        })
        .join("");
    }

    body.innerHTML =
      accordionSectionHtml(
        "vote",
        "Promemoria voto",
        "DM + sito",
        voteRows || '<p class="vc-notif-prefs__empty">—</p>',
        notifPrefsOpenSections.vote,
      ) +
      accordionSectionHtml(
        "discord",
        "Discord DM",
        "",
        discordRows || '<p class="vc-notif-prefs__empty">—</p>',
        notifPrefsOpenSections.discord,
      ) +
      accordionSectionHtml(
        "site",
        "Sito",
        "",
        siteRows || '<p class="vc-notif-prefs__empty">—</p>',
        notifPrefsOpenSections.site,
      );
  }

  async function prefsRequest(body) {
    var token = prefsToken();
    if (!token) throw new Error("Accedi con Discord per gestire i filtri.");
    var res = await fetch(prefsApiUrl(), {
      method: body ? "POST" : "GET",
      headers: Object.assign(
        { Accept: "application/json", Authorization: "Bearer " + token },
        body ? { "Content-Type": "application/json" } : {},
      ),
      body: body ? JSON.stringify(body) : undefined,
    });
    var data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }
    if (!data || !data.ok) throw new Error((data && data.message) || "Operazione non riuscita.");
    return data;
  }

  function applyPrefsPayload(data) {
    if (data && data.dm) notifPrefsState.dm = data.dm;
    if (data && data.siteNotif) notifPrefsState.siteNotif = data.siteNotif;
    renderNotifPrefs();
  }

  async function refreshNotifPrefs() {
    var data = await prefsRequest(null);
    notifPrefsState.dm = data.dm || null;
    notifPrefsState.siteNotif = data.siteNotif || null;
    renderNotifPrefs();
    setPrefsStatus("", false);
  }

  async function mutatePrefs(section, action, key) {
    setPrefsStatus("Salvataggio…", false);
    try {
      var data = await prefsRequest({ section: section, action: action, key: key });
      applyPrefsPayload(data);
      setPrefsStatus(data.message || "Preferenze aggiornate.", false);
      lastNotifyListRenderSig = "";
      syncSiteNotificationsFromServer();
      renderList();
    } catch (err) {
      setPrefsStatus(err && err.message ? err.message : "Errore.", true);
    }
  }

  async function mutateAllPrefs(action) {
    setPrefsStatus("Salvataggio…", false);
    try {
      var dmData = await prefsRequest({ section: "dm", action: action });
      var siteData = await prefsRequest({ section: "site_notif", action: action });
      applyPrefsPayload({
        dm: dmData.dm || notifPrefsState.dm,
        siteNotif: siteData.siteNotif || notifPrefsState.siteNotif,
        message: siteData.message || dmData.message,
      });
      setPrefsStatus("Preferenze aggiornate.", false);
      lastNotifyListRenderSig = "";
      syncSiteNotificationsFromServer();
      renderList();
    } catch (err) {
      setPrefsStatus(err && err.message ? err.message : "Errore.", true);
    }
  }

  function initNotifPrefs() {
    var root = byId("vc-notif-prefs");
    var body = byId("vc-notif-prefs-body");
    var btn = byId("vc-notif-prefs-btn");
    var panel = byId("vc-notif-prefs-panel");
    var allOn = byId("vc-notif-prefs-all-on");
    var allOff = byId("vc-notif-prefs-all-off");
    if (!root || !body || !btn || !panel) return;

    if (!prefsToken()) {
      body.innerHTML =
        '<p class="vc-notif-prefs__empty">Accedi con Discord per gestire i filtri notifiche.</p>';
      setPrefsPanelOpen(false);
    }

    if (!notifPrefsWired) {
      notifPrefsWired = true;
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        setPrefsPanelOpen(panel.hidden);
      });
      document.addEventListener("click", function (ev) {
        if (panel.hidden) return;
        if (root.contains(ev.target)) return;
        setPrefsPanelOpen(false);
      });
      document.addEventListener("keydown", function (ev) {
        if (ev.key === "Escape" && !panel.hidden) setPrefsPanelOpen(false);
      });
      body.addEventListener("click", function (ev) {
        var t = ev.target;
        var accBtn = t && t.closest ? t.closest("[data-acc-toggle]") : null;
        if (accBtn) {
          var accId = accBtn.getAttribute("data-acc-toggle");
          if (accId && Object.prototype.hasOwnProperty.call(notifPrefsOpenSections, accId)) {
            notifPrefsOpenSections[accId] = !notifPrefsOpenSections[accId];
            renderNotifPrefs();
          }
          return;
        }
        var sw = t && t.closest ? t.closest("[data-prefs-section][data-prefs-key]") : null;
        if (!sw) return;
        var section = sw.getAttribute("data-prefs-section");
        var action = section === "site_notif_digest" ? "toggle_digest" : "toggle";
        mutatePrefs(section === "site_notif_digest" ? "site_notif" : section, action, sw.getAttribute("data-prefs-key"));
      });
      if (allOn) {
        allOn.addEventListener("click", function () {
          mutateAllPrefs("all_on");
        });
      }
      if (allOff) {
        allOff.addEventListener("click", function () {
          mutateAllPrefs("all_off");
        });
      }
    }

    if (!prefsToken()) return;
    refreshNotifPrefs().catch(function (err) {
      setPrefsStatus(err && err.message ? err.message : "Impossibile caricare i filtri.", true);
      body.innerHTML = '<p class="vc-notif-prefs__empty">Impossibile caricare i filtri.</p>';
    });
  }

  window.addEventListener("vc-discord-profile", function (ev) {
    setCurrentUser(ev && ev.detail ? ev.detail.user : null);
    flushPendingLoginNotification();
    syncSiteNotificationsFromServer();
    renderList();
    initNotifPrefs();
  });

  document.addEventListener("vc:langchange", function () {
    lastNotifyListRenderSig = "";
    renderList();
  });

  window.addEventListener("storage", function (ev) {
    if (!ev || !isNotifStorageSyncKey(ev.key)) return;
    onNotifStorePeerSync();
  });
  window.addEventListener("vc:notifications-sync", function () {
    onNotifStorePeerSync();
  });
  if (notifSyncBc) {
    notifSyncBc.addEventListener("message", function () {
      onNotifStorePeerSync();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();