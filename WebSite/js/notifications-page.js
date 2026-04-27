(function () {
  var STORAGE_PREFIX = "vc_notifications_v1:";
  var PENDING_LOGIN_NOTIF_KEY = "vc_pending_login_notification_v1";
  var filterMode = "all";
  var currentUserId = "";

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
    if (String(kind || "").toLowerCase() !== "vote") return false;
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

  function setCurrentUser(user) {
    currentUserId = normalizeUserId(user && user.id);
  }

  function loadStored() {
    var key = userStorageKey();
    if (!key) return [];
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function saveStored(items) {
    var key = userStorageKey();
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify(items));
    } catch (e) {}
  }

  function addNotif(p) {
    var ownerId = normalizeUserId((p && p.userId) || currentUserId);
    if (!ownerId) return [];
    var kindRaw = p && p.kind;
    var kind =
      kindRaw === "vote"
        ? "vote"
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
    var stableId = p && p.id != null ? String(p.id).trim() : "";
    var item = {
      id: stableId || String(Date.now()) + "-" + String(Math.floor(Math.random() * 1e9)),
      title: String((p && p.title) || ""),
      body: String((p && p.body) || ""),
      at: typeof (p && p.at) === "number" ? p.at : Date.now(),
      read: false,
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
    if (stableId) {
      for (var dup = 0; dup < s.length; dup += 1) {
        if (String(s[dup].id) === stableId) return s;
      }
    }
    s.unshift(item);
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
    if (kind === "vote") return "fa-check-square-o";
    if (kind === "success") return "fa-check-circle-o";
    if (kind === "review") return "fa-star-o";
    if (kind === "mod") return "fa-shield";
    if (kind === "suggestion") return "fa-lightbulb-o";
    return "fa-user-plus";
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

  function removeOne(id) {
    var next = loadStored().filter(function (x) {
      return x.id !== id;
    });
    saveStored(next);
  }

  function clearAll() {
    saveStored([]);
  }

  function renderList() {
    var list = byId("vc-notify-list");
    var empty = byId("vc-notify-empty");
    if (!list || !empty) return;
    var all = loadStored();
    var shown = filteredRows(all);
    setFilterButtons();
    renderStats(all, shown);

    list.innerHTML = "";
    if (shown.length === 0) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    shown.forEach(function (n) {
      var li = document.createElement("li");
      li.className = "vc-notify-row";
      if (n.kind === "success") li.classList.add("vc-notify-row--success");
      if (n.read) li.classList.add("vc-notify-row--read");
      li.setAttribute("data-id", n.id);
      var destRaw = String((n && n.openUrl) || "").trim();
      if (destRaw) li.classList.add("vc-notify-row--link");
      li.addEventListener("click", function (ev) {
        if (ev.target.closest(".vc-notify-close-btn") || ev.target.closest(".vc-notify-open-btn")) return;
        markRead(n.id);
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
        badge.textContent = n.kind === "success" ? "Successo" : "Nuova";
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
    renderList();
  }

  window.addEventListener("vc-discord-profile", function (ev) {
    setCurrentUser(ev && ev.detail ? ev.detail.user : null);
    flushPendingLoginNotification();
    renderList();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();