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
  try {
    notifSyncBc = new BroadcastChannel("vc_notifications_sync_v1");
  } catch (eBc) {
    notifSyncBc = null;
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function t(key, vars) {
    if (window.VcI18n && typeof window.VcI18n.t === "function") return window.VcI18n.t(key, vars);
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

  function iconClass(kind) {
    if (kind === "vote" || kind === "vote_reminder") return "fa-check";
    if (kind === "success") return "fa-check-circle";
    if (kind === "review") return "fa-star";
    if (kind === "mod") return "fa-shield";
    if (kind === "suggestion") return "fa-magic";
    return "fa-bell-o";
  }

  function kindUiLabel(kind) {
    if (kind === "vote") return t("notifPage.kind.vote");
    if (kind === "vote_reminder") return t("notifPage.kind.voteReminder");
    if (kind === "success") return t("notifPage.kind.success");
    if (kind === "review") return t("notifPage.kind.review");
    if (kind === "mod") return t("notifPage.kind.mod");
    if (kind === "suggestion") return t("notifPage.kind.suggestion");
    return t("notifPage.kind.info");
  }

  function timeAgoIt(atMs) {
    var s = Math.floor((Date.now() - atMs) / 1000);
    if (s < 45) return t("notifPage.timeNow");
    var m = Math.floor(s / 60);
    if (m < 60) return m === 1 ? t("notifPage.timeMinute", { n: m }) : t("notifPage.timeMinutes", { n: m });
    var h = Math.floor(m / 60);
    if (h < 24) return h === 1 ? t("notifPage.timeHour", { n: h }) : t("notifPage.timeHours", { n: h });
    var d = Math.floor(h / 24);
    if (d < 7) return d === 1 ? t("notifPage.timeDay", { n: d }) : t("notifPage.timeDays", { n: d });
    return t("notifPage.timeOverWeek");
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
    var all = loadStored();
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

    shown.forEach(function (n) {
      var li = document.createElement("li");
      li.className = "vc-notify-row";
      li.classList.add("vc-notify-row--kind-" + String(n.kind || "info"));
      if (n.kind === "success") li.classList.add("vc-notify-row--success");
      if (n.read) li.classList.add("vc-notify-row--read");
      if (n.filtered) li.classList.add("vc-notify-row--filtered");
      li.setAttribute("data-id", n.id);
      var destRaw = String((n && n.openUrl) || "").trim();
      if (destRaw) li.classList.add("vc-notify-row--link");
      li.addEventListener("click", function (ev) {
        if (ev.target.closest(".vc-notify-close-btn") || ev.target.closest(".vc-notify-open-btn")) return;
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
        var badge = document.createElement("span");
        badge.className = "vc-notify-row-badge";
        badge.textContent = kindUiLabel(n.kind);
        meta.appendChild(badge);
      }

      main.appendChild(title);
      main.appendChild(desc);
      main.appendChild(meta);

      var actions = document.createElement("div");
      actions.className = "vc-notify-row-actions";

      var openBtn = document.createElement(destRaw ? "a" : "button");
      if (!destRaw) openBtn.type = "button";
      openBtn.className = "vc-notify-open-btn";
      if (destRaw) openBtn.href = resolveNotifDestUrl(destRaw);
      openBtn.appendChild(document.createTextNode(t("notifPage.goTo") + " "));
      var openChev = document.createElement("i");
      openChev.className = "fa fa-chevron-right";
      openChev.setAttribute("aria-hidden", "true");
      openBtn.appendChild(openChev);
      openBtn.setAttribute("aria-label", t("notifPage.goToAria"));
      openBtn.addEventListener("click", function (ev) {
        if (destRaw && ev && typeof ev.preventDefault === "function") ev.preventDefault();
        openAndMarkRead(n, destRaw);
      });

      var closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "vc-notify-close-btn";
      closeBtn.setAttribute("aria-label", t("notifPage.deleteAria"));
      closeBtn.innerHTML = '<i class="fa fa-times" aria-hidden="true"></i>';
      closeBtn.addEventListener("click", function () {
        removeOne(n.id);
        renderList();
      });

      actions.appendChild(openBtn);
      actions.appendChild(closeBtn);

      li.appendChild(iconWrap);
      li.appendChild(main);
      li.appendChild(actions);
      list.appendChild(li);
    });
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
    bootNotifList();
    initNotifPrefs();
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
  var notifPrefsOpenSections = { vote: true, discord: false, site: false };
  var notifPrefsWired = false;

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
    var el = byId("vc-notif-prefs-status");
    if (!el) return;
    if (!msg) {
      el.hidden = true;
      el.textContent = "";
      el.classList.remove("is-error");
      return;
    }
    el.hidden = false;
    el.textContent = msg;
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

    var siteRows = siteGroups
      .map(function (g) {
        return toggleSwitchHtml({
          section: "site_notif",
          key: g.key,
          label: g.label || g.key,
          enabled: g.enabled,
        });
      })
      .join("");

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
        mutatePrefs(sw.getAttribute("data-prefs-section"), "toggle", sw.getAttribute("data-prefs-key"));
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