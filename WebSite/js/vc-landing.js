(function () {
  function hideTransitionOverlay() {
    var ov = document.getElementById("vc-page-transition");
    if (ov) ov.classList.remove("vc-page-transition--on");
  }

  window.addEventListener("pageshow", function () {
    hideTransitionOverlay();
  });

  function isInternalNavigableLink(a) {
    if (!a || !a.getAttribute) return false;
    var hrefAttr = String(a.getAttribute("href") || "").trim();
    if (!hrefAttr || hrefAttr.charAt(0) === "#") return false;
    if (/^(mailto|tel|javascript):/i.test(hrefAttr)) return false;
    var target = String(a.getAttribute("target") || "").toLowerCase();
    if (target && target !== "_self") return false;
    if (a.hasAttribute("download")) return false;
    try {
      var url = new URL(hrefAttr, window.location.href);
      if (url.origin !== window.location.origin) return false;
      var current = window.location.pathname + window.location.search;
      var next = url.pathname + url.search;
      if (current === next && (url.hash || "").length > 0) return false;
      return true;
    } catch (e) {
      return false;
    }
  }

  function ensureTransitionOverlay() {
    var existing = document.getElementById("vc-page-transition");
    if (existing) return existing;
    var wrap = document.createElement("div");
    wrap.id = "vc-page-transition";
    wrap.className = "vc-page-transition";
    wrap.setAttribute("aria-hidden", "true");
    wrap.innerHTML =
      '<div class="vc-page-transition-content"><span class="vc-page-transition-spinner" aria-hidden="true"></span><p class="vc-page-transition-text">Caricamento...</p></div>';
    document.body.appendChild(wrap);
    return wrap;
  }

  function showTransitionOverlay() {
    var ov = ensureTransitionOverlay();
    if (!ov) return;
    ov.classList.add("vc-page-transition--on");
  }

  function initPageTransition() {
    hideTransitionOverlay();
    document.addEventListener("click", function (ev) {
      if (ev.defaultPrevented || ev.button !== 0) return;
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      var t = ev.target;
      if (!t || !t.closest) return;
      var a = t.closest("a[href]");
      if (!a) return;
      if (!isInternalNavigableLink(a)) return;
      showTransitionOverlay();
    });
    window.addEventListener("beforeunload", function () {
      showTransitionOverlay();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPageTransition);
  } else {
    initPageTransition();
  }
})();
(function () {
  if (window.location.hash !== "#intro") return;
  if (window.history && window.history.replaceState) {
    window.history.replaceState(
      null,
      document.title,
      window.location.pathname + window.location.search,
    );
  }
})();
(function () {
  var btn = document.getElementById("vc-mobile-menu-btn");
  var nav = document.getElementById("mobile-nav");
  if (!btn || !nav) return;
  btn.addEventListener("click", function () {
    var open = nav.classList.toggle("is-open");
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  });
  document.addEventListener(
    "pointerdown",
    function (ev) {
      if (!nav.classList.contains("is-open")) return;
      if (typeof ev.button === "number" && ev.button !== 0) return;
      var t = ev.target;
      if (!t || !t.closest) return;
      if (btn.contains(t) || nav.contains(t)) return;
      nav.classList.remove("is-open");
      btn.setAttribute("aria-expanded", "false");
    },
    true,
  );
})();
(function () {
  function normalizePathname(path) {
    var p = String(path || "");
    if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
    return p;
  }

  function markSnavDetailsCurrentFromLocation() {
    var bar = document.querySelector(".vc-header-bar");
    if (!bar) return;
    var cur = normalizePathname(window.location.pathname);
    bar.querySelectorAll("details.vc-snav-details").forEach(function (det) {
      var hit = false;
      det.querySelectorAll("a.vc-snav-row").forEach(function (a) {
        if (a.classList.contains("vc-snav-row--active") || a.getAttribute("aria-current") === "page") {
          hit = true;
          return;
        }
        var href = a.getAttribute("href");
        if (!href || href.charAt(0) === "#") return;
        try {
          var u = new URL(href, window.location.href);
          if (u.origin !== window.location.origin) return;
          if (normalizePathname(u.pathname) === cur) hit = true;
        } catch (e) {}
      });
      if (hit) det.classList.add("vc-snav-details--current");
    });
  }

  function initHeaderNavAccordion() {
    var bar = document.querySelector(".vc-header-bar");
    if (!bar) return;
    var detailsList = bar.querySelectorAll("details.vc-snav-details");
    var notif = bar.querySelector("details.vc-notif-dropdown");
    detailsList.forEach(function (d) {
      d.addEventListener("toggle", function () {
        if (!d.open) return;
        detailsList.forEach(function (other) {
          if (other !== d) other.open = false;
        });
        if (notif) notif.open = false;
      });
    });
    if (notif) {
      notif.addEventListener("toggle", function () {
        if (!notif.open) return;
        detailsList.forEach(function (other) {
          other.open = false;
        });
      });
    }
    function closeAllHeaderDropdowns() {
      detailsList.forEach(function (d) {
        d.open = false;
      });
      if (notif) notif.open = false;
    }
    document.addEventListener(
      "pointerdown",
      function (ev) {
        if (typeof ev.button === "number" && ev.button !== 0) return;
        var t = ev.target;
        if (!t || !t.closest) return;
        var opens = bar.querySelectorAll(
          "details.vc-snav-details[open], details.vc-notif-dropdown[open]",
        );
        if (!opens.length) return;
        for (var i = 0; i < opens.length; i++) {
          if (opens[i].contains(t)) return;
        }
        closeAllHeaderDropdowns();
      },
      true,
    );
    markSnavDetailsCurrentFromLocation();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initHeaderNavAccordion);
  } else {
    initHeaderNavAccordion();
  }
})();
(function () {
  var STORAGE_KEY = "vc_notifications_v1";
  var PENDING_LOGIN_NOTIF_KEY = "vc_pending_login_notification_v1";
  var NOTIFICATIONS_PATH = "/notifications/";
  var DEMO_ID = "__vc_ephemeral_demo__";
  var ephemeralDemo = null;
  try {
    if (new URLSearchParams(window.location.search).get("notif") === "demo") {
      ephemeralDemo = {
        id: DEMO_ID,
        title: "Voto registrato!",
        body: "Il tuo voto è stato registrato con successo.",
        at: Date.now() - 3 * 60 * 60 * 1000,
        read: false,
        kind: "vote",
      };
    }
  } catch (e) {}
  function loadStored() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }
  function saveStored(items) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (e) {}
  }
  function rows() {
    var s = loadStored();
    return ephemeralDemo ? [ephemeralDemo].concat(s) : s;
  }
  function iconClass(kind) {
    if (kind === "vote") return "fa-check-square-o";
    if (kind === "success") return "fa-check-circle-o";
    return "fa-info-circle";
  }
  function notificationsPageUrl() {
    try {
      return new URL(NOTIFICATIONS_PATH, window.location.origin).toString();
    } catch (e) {
      return NOTIFICATIONS_PATH;
    }
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
  function render() {
    var root = document.getElementById("vc-notif-dropdown");
    var listEl = document.getElementById("vc-notif-list");
    var badge = document.getElementById("vc-notif-badge");
    var sub = document.getElementById("vc-notif-unread-sub");
    if (!root || !listEl || !badge || !sub) return;
    var all = rows();
    var unread = all.filter(function (n) {
      return !n.read;
    }).length;
    if (unread > 0) {
      badge.hidden = false;
      badge.textContent = unread > 99 ? "99+" : String(unread);
    } else {
      badge.hidden = true;
    }
    sub.textContent = unread + " non lette";
    if (all.length > 0) root.classList.add("vc-notif-dropdown--has-items");
    else root.classList.remove("vc-notif-dropdown--has-items");
    listEl.innerHTML = "";
    all.forEach(function (n) {
      var li = document.createElement("li");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "vc-notif-item";
      if (n.kind === "success") btn.classList.add("vc-notif-item--success");
      if (n.read) btn.classList.add("vc-notif-item--read");
      btn.setAttribute("data-id", n.id);
      var ico = document.createElement("span");
      ico.className = "vc-notif-item-ico";
      ico.setAttribute("aria-hidden", "true");
      var fi = document.createElement("i");
      fi.className = "fa " + iconClass(n.kind);
      fi.setAttribute("aria-hidden", "true");
      ico.appendChild(fi);
      var main = document.createElement("div");
      main.className = "vc-notif-item-main";
      var title = document.createElement("p");
      title.className = "vc-notif-item-title";
      title.textContent = n.title || "";
      var desc = document.createElement("p");
      desc.className = "vc-notif-item-desc";
      desc.textContent = n.body || "";
      var time = document.createElement("time");
      time.className = "vc-notif-item-time";
      time.dateTime = new Date(n.at || Date.now()).toISOString();
      time.textContent = timeAgoIt(n.at || Date.now());
      main.appendChild(title);
      main.appendChild(desc);
      main.appendChild(time);
      var dot = document.createElement("span");
      dot.className = "vc-notif-item-dot";
      if (n.read) dot.setAttribute("aria-hidden", "true");
      else dot.setAttribute("aria-label", "Non letta");
      btn.appendChild(ico);
      btn.appendChild(main);
      btn.appendChild(dot);
      li.appendChild(btn);
      listEl.appendChild(li);
    });
  }
  function markAllRead() {
    if (ephemeralDemo) ephemeralDemo.read = true;
    saveStored(
      loadStored().map(function (x) {
        return Object.assign({}, x, { read: true });
      }),
    );
    render();
  }
  function clearAll() {
    ephemeralDemo = null;
    saveStored([]);
    render();
  }
  function markOneRead(id) {
    if (ephemeralDemo && ephemeralDemo.id === id) {
      ephemeralDemo.read = true;
      render();
      return;
    }
    saveStored(
      loadStored().map(function (x) {
        if (x.id === id) return Object.assign({}, x, { read: true });
        return x;
      }),
    );
    render();
  }
  function addNotif(p) {
    var kindRaw = p && p.kind;
    var kind =
      kindRaw === "vote" ? "vote" : kindRaw === "success" ? "success" : "info";
    var openUrl = "";
    if (p && typeof p.openUrl === "string") openUrl = String(p.openUrl).trim();
    var item = {
      id: String(Date.now()) + "-" + String(Math.floor(Math.random() * 1e9)),
      title: String((p && p.title) || ""),
      body: String((p && p.body) || ""),
      at: typeof (p && p.at) === "number" ? p.at : Date.now(),
      read: false,
      kind: kind,
      openUrl: openUrl,
    };
    var s = loadStored();
    s.unshift(item);
    saveStored(s);
    render();
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
    try {
      localStorage.removeItem(PENDING_LOGIN_NOTIF_KEY);
    } catch (e3) {}
    if (!data || typeof data !== "object") return;
    addNotif(data);
  }
  function init() {
    render();
    var markBtn = document.getElementById("vc-notif-mark-all");
    var clearBtn = document.getElementById("vc-notif-clear-all");
    var seeAll = document.getElementById("vc-notif-see-all");
    var listEl = document.getElementById("vc-notif-list");
    if (markBtn) markBtn.addEventListener("click", markAllRead);
    if (clearBtn) clearBtn.addEventListener("click", clearAll);
    if (seeAll) {
      seeAll.addEventListener("click", function (ev) {
        ev.preventDefault();
        window.location.href = notificationsPageUrl();
      });
    }
    if (listEl) {
      listEl.addEventListener("click", function (ev) {
        var t = ev.target;
        if (!t || !t.closest) return;
        var btn = t.closest("button.vc-notif-item");
        if (!btn || !listEl.contains(btn)) return;
        var id = btn.getAttribute("data-id");
        if (id) markOneRead(id);
      });
    }
    window.vcNotify = { add: addNotif, refresh: render };
    flushPendingLoginNotification();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();