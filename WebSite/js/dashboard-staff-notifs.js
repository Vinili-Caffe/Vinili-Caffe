(function () {
  var ACCESS_TOKEN_KEY = "vc_discord_access_token";
  var ACCESS_EXPIRES_KEY = "vc_discord_expires_at";
  var POLL_MS = 60000;
  var state = { items: [], unread: 0, loading: false };
  var pollTimer = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function cfg() {
    return (typeof window !== "undefined" && window.__VC_SITE_DASHBOARD) || {};
  }

  function resolveApiBase() {
    var c = cfg();
    var isLocal = /^(localhost|127\.0\.0\.1)$/i.test(String(window.location.hostname || ""));
    var raw = String((isLocal && c.apiUrlLocal) ? c.apiUrlLocal : (c.apiUrl || "")).trim();
    return raw.replace(/\/+$/, "") || "/webhooks/site-dashboard";
  }

  function getToken() {
    if (typeof window.__vcDiscordGetAccessToken === "function") {
      var t = window.__vcDiscordGetAccessToken();
      if (t) return t;
    }
    var t2 = localStorage.getItem(ACCESS_TOKEN_KEY);
    var exp = Number(localStorage.getItem(ACCESS_EXPIRES_KEY) || "0");
    if (!t2 || !exp || Date.now() >= exp) return "";
    return t2;
  }

  function t(key, vars, fallback) {
    try {
      if (window.VcI18n && typeof window.VcI18n.t === "function") {
        var v = window.VcI18n.t(key, vars);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    var out = fallback != null ? fallback : key;
    if (vars && typeof out === "string") {
      out = out.replace(/\{(\w+)\}/g, function (_, k) {
        return vars[k] != null ? String(vars[k]) : "{" + k + "}";
      });
    }
    return out;
  }

  function timeAgo(atMs) {
    var s = Math.floor((Date.now() - atMs) / 1000);
    if (s < 45) return t("notif.justNow", null, "Ora");
    var m = Math.floor(s / 60);
    if (m < 60) {
      return m === 1
        ? t("notif.minuteAgo", null, "1 minuto fa")
        : t("notif.minutesAgo", { n: m }, "{n} minuti fa");
    }
    var h = Math.floor(m / 60);
    if (h < 24) {
      return h === 1
        ? t("notif.hourAgo", null, "1 ora fa")
        : t("notif.hoursAgo", { n: h }, "{n} ore fa");
    }
    var d = Math.floor(h / 24);
    if (d < 7) {
      return d === 1
        ? t("notif.dayAgo", null, "1 giorno fa")
        : t("notif.daysAgo", { n: d }, "{n} giorni fa");
    }
    return t("notif.weekPlusAgo", null, "Più di una settimana fa");
  }

  function render() {
    var root = byId("vc-notif-dropdown");
    var listEl = byId("vc-notif-list");
    var badge = byId("vc-notif-badge");
    var sub = byId("vc-notif-unread-sub");
    var emptyWrap = byId("vc-notif-empty-wrap");
    var listWrap = byId("vc-notif-list-wrap");
    if (!root || !listEl || !badge || !sub) return;

    var unread = Number(state.unread) || 0;
    var items = Array.isArray(state.items) ? state.items : [];

    if (unread > 0) {
      badge.hidden = false;
      badge.textContent = unread > 99 ? "99+" : String(unread);
    } else {
      badge.hidden = true;
    }
    sub.textContent = t("notif.unread", { n: unread }, "{n} non lette");

    if (items.length > 0) {
      root.classList.add("vc-notif-dropdown--has-items");
      if (emptyWrap) emptyWrap.hidden = true;
      if (listWrap) listWrap.hidden = false;
    } else {
      root.classList.remove("vc-notif-dropdown--has-items");
      if (emptyWrap) emptyWrap.hidden = false;
      if (listWrap) listWrap.hidden = true;
    }

    listEl.innerHTML = "";
    items.forEach(function (n) {
      var li = document.createElement("li");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "vc-notif-item";
      if (n.read) btn.classList.add("vc-notif-item--read");
      btn.setAttribute("data-id", String(n.id || ""));

      var ico = document.createElement("span");
      ico.className = "vc-notif-item-ico";
      ico.setAttribute("aria-hidden", "true");
      ico.innerHTML = '<i class="fa fa-bell" aria-hidden="true"></i>';

      var main = document.createElement("div");
      main.className = "vc-notif-item-main";
      var title = document.createElement("p");
      title.className = "vc-notif-item-title";
      title.textContent = t("notif.itemTitle", null, "Notifica");
      var desc = document.createElement("p");
      desc.className = "vc-notif-item-desc";
      desc.textContent = n.body || n.title || "";
      var time = document.createElement("time");
      time.className = "vc-notif-item-time";
      time.dateTime = new Date(n.at || Date.now()).toISOString();
      time.textContent = timeAgo(n.at || Date.now());
      main.appendChild(title);
      main.appendChild(desc);
      main.appendChild(time);

      var dot = document.createElement("span");
      dot.className = "vc-notif-item-dot";
      if (n.read) dot.setAttribute("aria-hidden", "true");
      else dot.setAttribute("aria-label", t("notif.unreadDot", null, "Non letta"));

      btn.appendChild(ico);
      btn.appendChild(main);
      btn.appendChild(dot);
      li.appendChild(btn);
      listEl.appendChild(li);
    });
  }

  async function fetchNotifications() {
    var token = getToken();
    if (!token) {
      state.items = [];
      state.unread = 0;
      render();
      return;
    }
    if (state.loading) return;
    state.loading = true;
    try {
      var res = await fetch(resolveApiBase() + "/notifications", {
        headers: { Authorization: "Bearer " + token },
        cache: "no-store",
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok || !data || data.ok === false) {
        if (data && data.error === "high_staff_only") {
          state.items = [];
          state.unread = 0;
          render();
        }
        return;
      }
      state.items = Array.isArray(data.items) ? data.items : [];
      state.unread = Number(data.unread) || 0;
      render();
    } catch (e) {
      /* ignore */
    } finally {
      state.loading = false;
    }
  }

  async function markAllRead() {
    var token = getToken();
    if (!token) return;
    try {
      var res = await fetch(resolveApiBase() + "/notifications/read", {
        method: "POST",
        headers: { Authorization: "Bearer " + token },
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (res.ok && data && data.ok) {
        state.items = Array.isArray(data.items) ? data.items : state.items.map(function (x) {
          return Object.assign({}, x, { read: true });
        });
        state.unread = Number(data.unread) || 0;
        render();
        return;
      }
    } catch (e) {
      /* ignore */
    }
    await fetchNotifications();
  }

  function stopPoll() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function startPoll() {
    stopPoll();
    if (!getToken()) return;
    fetchNotifications();
    pollTimer = setInterval(fetchNotifications, POLL_MS);
  }

  function isMobileNotifViewport() {
    try {
      return window.matchMedia("(max-width: 639.98px)").matches;
    } catch (e) {
      return (window.innerWidth || 999) <= 640;
    }
  }

  var notifPortalGuardUntil = 0;
  var notifPortalSyncing = false;

  function portalNotifDropdownToBody(dd, enable) {
    if (!dd) return;
    var slotId = "vc-notif-dropdown-slot";
    var slot = byId(slotId);
    if (enable) {
      if (dd.parentElement !== document.body) {
        if (!slot) {
          slot = document.createElement("span");
          slot.id = slotId;
          slot.hidden = true;
          slot.setAttribute("aria-hidden", "true");
          if (dd.parentNode) dd.parentNode.insertBefore(slot, dd);
        }
        document.body.appendChild(dd);
      }
      try {
        dd.open = true;
        dd.setAttribute("open", "");
      } catch (eOpen) {}
      notifPortalGuardUntil = Date.now() + 500;
      return;
    }
    if (slot && slot.parentNode && dd.parentElement === document.body) {
      slot.parentNode.insertBefore(dd, slot);
      return;
    }
    if (dd.parentElement === document.body) {
      var actions = byId("header-quick-actions");
      if (actions) actions.appendChild(dd);
    }
  }

  function syncNotifMobileSheetChrome() {
    if (notifPortalSyncing) return;
    var dd = byId("vc-notif-dropdown");
    if (!dd) return;
    var root = document.documentElement;
    var mobile = isMobileNotifViewport();
    if (!dd.open && mobile && Date.now() < notifPortalGuardUntil) {
      try {
        dd.open = true;
        dd.setAttribute("open", "");
      } catch (eRe) {}
      return;
    }
    notifPortalSyncing = true;
    try {
      if (dd.open && mobile) {
        try {
          root.classList.add("vc-notif-sheet-open");
          root.classList.add("vc-notif-dropdown-open");
        } catch (e0) {}
        portalNotifDropdownToBody(dd, true);
        if (!dd.querySelector(".vc-notif-mobile-backdrop")) {
          var bd = document.createElement("div");
          bd.className = "vc-notif-mobile-backdrop";
          bd.setAttribute("aria-hidden", "true");
          bd.addEventListener("click", function () {
            notifPortalGuardUntil = 0;
            dd.removeAttribute("open");
          });
          dd.insertBefore(bd, dd.firstChild);
        }
      } else {
        try {
          root.classList.remove("vc-notif-sheet-open");
          if (!dd.open) root.classList.remove("vc-notif-dropdown-open");
        } catch (e1) {}
        var oldBd = dd.querySelector(".vc-notif-mobile-backdrop");
        if (oldBd) oldBd.remove();
        portalNotifDropdownToBody(dd, false);
      }
    } finally {
      notifPortalSyncing = false;
    }
  }

  function ensureNotifCloseMobile(dd) {
    if (!dd) return;
    var head = dd.querySelector(".vc-notif-panel-head");
    if (!head || head.querySelector(".vc-notif-close-mobile")) return;
    var closeM = document.createElement("button");
    closeM.type = "button";
    closeM.className = "vc-notif-action vc-notif-close-mobile";
    closeM.setAttribute("aria-label", t("notif.close", null, "Chiudi"));
    closeM.innerHTML = '<i class="fa fa-times" aria-hidden="true"></i>';
    closeM.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      dd.removeAttribute("open");
    });
    head.appendChild(closeM);
  }

  function wire() {
    var markBtn = byId("vc-notif-mark-all");
    var clearBtn = byId("vc-notif-clear-all");
    var foot = byId("vc-notif-panel-foot");
    var title = document.querySelector("#vc-notif-dropdown .vc-notif-panel-title");
    var emptySub = document.querySelector("#vc-notif-dropdown .vc-notif-empty-sub");

    if (title) title.textContent = t("notif.title", null, "Notifiche");
    if (emptySub) emptySub.textContent = t("notif.emptySub", null, "Sei tutto aggiornato!");
    if (foot) foot.hidden = true;
    if (clearBtn) clearBtn.hidden = true;

    if (markBtn) {
      markBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        markAllRead();
      });
    }

    var dd = byId("vc-notif-dropdown");
    if (dd) {
      ensureNotifCloseMobile(dd);
      dd.addEventListener("toggle", function () {
        syncNotifMobileSheetChrome();
        if (dd.open) {
          try {
            document.documentElement.classList.remove("vc-header-account-open");
            var accBtn = document.querySelector(".discord-profile-link");
            if (accBtn && document.activeElement === accBtn) accBtn.blur();
          } catch (eAcc) {}
          fetchNotifications();
        }
      });
      window.addEventListener("resize", function () {
        syncNotifMobileSheetChrome();
      });
      document.addEventListener("keydown", function (ev) {
        if (ev.key !== "Escape") return;
        if (!isMobileNotifViewport() || !dd.open) return;
        dd.removeAttribute("open");
      });
    }

    window.addEventListener("vc-discord-profile", function (ev) {
      var u = ev && ev.detail ? ev.detail.user : null;
      if (u) startPoll();
      else {
        stopPoll();
        state.items = [];
        state.unread = 0;
        render();
      }
    });

    document.addEventListener("vc:langchange", function () {
      if (title) title.textContent = t("notif.title", null, "Notifiche");
      if (emptySub) emptySub.textContent = t("notif.emptySub", null, "Sei tutto aggiornato!");
      render();
    });

    if (getToken()) startPoll();
    else render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }
})();
