(function () {
  var STORAGE_PREFIX = "vc_notifications_v1:";
  var DISMISSED_PREFIX = "vc_notifications_dismissed_v1:";
  var PENDING_LOGIN_NOTIF_KEY = "vc_pending_login_notification_v1";
  var DISCORD_ACCESS_TOKEN_KEY = "vc_discord_access_token";
  var filterMode = "all";
  var currentUserId = "";
  var lastNotifyListRenderSig = "";

  function byId(id) {
    return document.getElementById(id);
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

  function saveDismissedSet(setLike, userId) {
    var key = userDismissedKey(userId);
    if (!key) return;
    var arr = Array.from(setLike || []).filter(Boolean);
    if (arr.length > 500) arr = arr.slice(arr.length - 500);
    try {
      localStorage.setItem(key, JSON.stringify(arr));
    } catch (e) {}
  }

  function markDismissed(id, userId) {
    var sid = String(id || "").trim();
    if (!sid) return;
    var set = loadDismissedSet(userId);
    set.add(sid);
    saveDismissedSet(set, userId);
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
    delete p.at;
    delete p.read;
    delete p.readAt;
    return buildStableNotifId(p, ownerId, kind, openUrl);
  }
  function isAutoClientNotifId(id) {
    return String(id || "").indexOf("auto:") === 0;
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

  function loadStored() {
    var key = userStorageKey();
    if (!key) return [];
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return sortNotifItems(Array.isArray(arr) ? arr : []);
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
    try {
      localStorage.setItem(key, JSON.stringify(sortNotifItems(items)));
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
    if (kind === "vote") return "fa-trophy";
    if (kind === "vote_reminder") return "fa-clock-o";
    if (kind === "success") return "fa-check-circle";
    if (kind === "review") return "fa-star";
    if (kind === "mod") return "fa-shield";
    if (kind === "suggestion") return "fa-magic";
    return "fa-bell-o";
  }

  function kindUiLabel(kind) {
    if (kind === "vote") return "Voto";
    if (kind === "vote_reminder") return "Promemoria";
    if (kind === "success") return "Successo";
    if (kind === "review") return "Recensione";
    if (kind === "mod") return "Moderazione";
    if (kind === "suggestion") return "Suggerimento";
    return "Info";
  }

  function timeAgoIt(atMs) {
    var s = Math.floor((Date.now() - atMs) / 1000);
    if (s < 45) return "Ora";
    var m = Math.floor(s / 60);
    if (m < 60) return m === 1 ? "1 minuto fa" : m + " minuti fa";
    var h = Math.floor(m / 60);
    if (h < 24) return h === 1 ? "1 ora fa" : h + " ore fa";
    var d = Math.floor(h / 24);
    if (d < 7) return d === 1 ? "1 giorno fa" : d + " giorni fa";
    return "Più di una settimana fa";
  }

  function filteredRows(rows) {
    if (filterMode === "unread") {
      return rows.filter(function (n) {
        return !n.read;
      });
    }
    return rows;
  }

  function setFilterButtons() {
    var allBtn = byId("vc-filter-all");
    var unreadBtn = byId("vc-filter-unread");
    if (allBtn) allBtn.classList.toggle("vc-notify-filter-btn--on", filterMode === "all");
    if (unreadBtn) unreadBtn.classList.toggle("vc-notify-filter-btn--on", filterMode === "unread");
  }

  function renderStats(allRows, shownRows) {
    var total = allRows.length;
    var unread = allRows.filter(function (n) {
      return !n.read;
    }).length;
    var read = total - unread;
    var subtitle = byId("vc-notify-subtitle");
    var totalEl = byId("vc-stat-total");
    var unreadEl = byId("vc-stat-unread");
    var readEl = byId("vc-stat-read");
    var filteredEl = byId("vc-stat-filtered");
    var countApi = typeof window !== "undefined" ? window.VCCountUp : null;
    if (subtitle) subtitle.textContent = (unread === 0 ? "Tutte lette" : unread + " non lette") + " - " + total + " totali";
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
      if (countApi && typeof countApi.set === "function") countApi.set(filteredEl, shownRows.length, "int");
      else filteredEl.textContent = String(shownRows.length);
    }
  }

  function markRead(id) {
    var next = loadStored().map(function (x) {
      if (x.id === id) return Object.assign({}, x, { read: true });
      return x;
    });
    saveStored(next);
  }
  function markReadOnServer(id) {
    var token = getDiscordAccessToken();
    var uid = normalizeUserId(currentUserId);
    var sid = String(id || "").trim();
    if (!token || !uid || !sid) return;
    fetch(resolvedSiteNotificationsReadUrl(), {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      credentials: "omit",
      body: JSON.stringify({ id: sid }),
    }).catch(function () {});
  }
  function markAllReadOnServer() {
    var token = getDiscordAccessToken();
    var uid = normalizeUserId(currentUserId);
    if (!token || !uid) return;
    fetch(resolvedSiteNotificationsReadUrl(), {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      credentials: "omit",
      body: JSON.stringify({ all: true }),
    }).catch(function () {});
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
    var serverIdMap = {};
    var fromServer = [];
    for (var i = 0; i < list.length; i += 1) {
      var row = list[i];
      if (!row || !row.title) continue;
      var sid = String(row.id || "").trim();
      if (!sid) continue;
      var mapped = mapServerRowToStoredItemPage(row);
      var fpId = buildNotifFingerprintId(mapped, uid, mapped.kind, mapped.openUrl);
      if (dismissed.has(sid) || (fpId && dismissed.has(fpId))) continue;
      serverIdMap[sid] = true;
      fromServer.unshift(mapped);
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
  function syncSiteNotificationsFromServer() {
    var token = getDiscordAccessToken();
    var uid = normalizeUserId(currentUserId);
    if (!token || !uid) return;
    var url = resolvedSiteNotificationsUrl();
    if (!url) return;
    fetch(url, { headers: { Authorization: "Bearer " + token }, credentials: "omit" })
      .then(function (r) {
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
    saveStored([]);
    clearAllSiteNotificationsOnServer().finally(function () {
      syncSiteNotificationsFromServer();
    });
  }

  function renderList() {
    var list = byId("vc-notify-list");
    var empty = byId("vc-notify-empty");
    if (!list || !empty) return;
    var all = loadStored();
    var shown = filteredRows(all);
    setFilterButtons();
    renderStats(all, shown);
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
      li.setAttribute("data-id", n.id);
      var destRaw = String((n && n.openUrl) || "").trim();
      if (destRaw) li.classList.add("vc-notify-row--link");
      li.addEventListener("click", function (ev) {
        if (ev.target.closest(".vc-notify-close-btn") || ev.target.closest(".vc-notify-open-btn")) return;
        markRead(n.id);
        markReadOnServer(n.id);
        if (destRaw) {
          openNotifDestination(resolveNotifDestUrl(destRaw), n.kind);
          return;
        }
        renderList();
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

      var openBtn = document.createElement("button");
      openBtn.type = "button";
      openBtn.className = "vc-notify-open-btn";
      openBtn.appendChild(document.createTextNode("Vai "));
      var openChev = document.createElement("i");
      openChev.className = "fa fa-chevron-right";
      openChev.setAttribute("aria-hidden", "true");
      openBtn.appendChild(openChev);
      openBtn.setAttribute("aria-label", "Vai alla schermata principale");
      openBtn.addEventListener("click", function () {
        markRead(n.id);
        markReadOnServer(n.id);
        if (destRaw) {
          openNotifDestination(resolveNotifDestUrl(destRaw), n.kind);
          return;
        }
        renderList();
      });

      var closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "vc-notify-close-btn";
      closeBtn.setAttribute("aria-label", "Elimina notifica");
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
    setCurrentUser(window.__VC_DISCORD_PROFILE || null);
    var allBtn = byId("vc-filter-all");
    var unreadBtn = byId("vc-filter-unread");
    var clearBtn = byId("vc-notify-clear-all-page");

    if (allBtn) {
      allBtn.addEventListener("click", function () {
        filterMode = "all";
        renderList();
      });
    }
    if (unreadBtn) {
      unreadBtn.addEventListener("click", function () {
        filterMode = "unread";
        renderList();
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        clearAll();
        renderList();
      });
    }

    flushPendingLoginNotification();
    syncSiteNotificationsFromServer();
    renderList();
  }

  window.addEventListener("vc-discord-profile", function (ev) {
    setCurrentUser(ev && ev.detail ? ev.detail.user : null);
    flushPendingLoginNotification();
    syncSiteNotificationsFromServer();
    renderList();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();