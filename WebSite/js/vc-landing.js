

(function () {
  try {
    var ID = "vc-phone-root-unlock-css";
    /* phoneGateLock1: during boot/loaders lock scroll + hide cine bg (was unlocking and showing GIF behind). */
    var css =
      "@media (pointer:coarse),(max-width:920px){" +
      "html.vc-page-cine-boot:not(.vc-page-cine-ready)," +
      "html.vc-page-cine-boot:not(.vc-page-cine-ready) body," +
      "html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready)," +
      "html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body," +
      "html.vc-user-leader-pending,html.vc-user-leader-pending body," +
      "html.vc-user-profile-pending,html.vc-user-profile-pending body," +
      "html.vc-loading-scroll-lock,html.vc-loading-scroll-lock body," +
      "html.vc-loader-blocking-live,html.vc-loader-blocking-live body," +
      "html.vc-rank-customize-pending,html.vc-rank-customize-pending body," +
      "html.vc-custom-profile-pending,html.vc-custom-profile-pending body," +
      "html.vc-session-verify-pending,html.vc-session-verify-pending body," +
      "html.vc-staff-access-pending:not(.vc-staff-app-revealed)," +
      "html.vc-staff-access-pending:not(.vc-staff-app-revealed) body," +
      "html.vc-notif-staff-loading,html.vc-notif-staff-loading body," +
      "html:has(.vc-ul-loading:not([hidden])),html:has(.vc-ul-loading:not([hidden])) body," +
      "html:has(#vc-roles-loading:not([hidden])),html:has(#vc-roles-loading:not([hidden])) body," +
      "html:has(#vc-staff-inbox-loading:not([hidden]):not(.vc-staff-loading--hidden))," +
      "html:has(#vc-staff-inbox-loading:not([hidden]):not(.vc-staff-loading--hidden)) body{" +
      "overflow:hidden!important;overflow-x:hidden!important;overflow-y:hidden!important;" +
      "overscroll-behavior:none!important;touch-action:none!important;" +
      "height:100%!important;max-height:100dvh!important}" +
      "html.vc-page-cine-boot:not(.vc-page-cine-ready) .vc-home-cine," +
      "html.vc-loader-blocking-live .vc-home-cine," +
      "html.vc-loading-scroll-lock .vc-home-cine," +
      "html.vc-user-leader-pending .vc-home-cine," +
      "html.vc-user-profile-pending .vc-home-cine," +
      "html.vc-notif-staff-loading .vc-home-cine{" +
      "visibility:hidden!important;opacity:0!important;pointer-events:none!important}" +
      "#vc-ul-loading[hidden],.vc-ul-loading[hidden],#vc-roles-loading[hidden]," +
      "#vc-shared-boot-overlay[hidden]{display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important}" +
      "}";
    function inject() {
      var el = document.getElementById(ID);
      if (!el) {
        el = document.createElement("style");
        el.id = ID;
        el.setAttribute("data-vc", "phoneGateLock1");
      }
      el.textContent = css;
      var host = document.head || document.documentElement;
      host.appendChild(el);
    }
    inject();
    window.__vcPhoneRootUnlockInject = inject;
  } catch (eRootUnlock) {}
  try {
    if (!window.VcPerf || !window.VcPerf.__ready) {
      var s = document.createElement("script");
      s.src = "/js/vc-perf.js?v=20260904forceMidAll1sitePerfFix1";
      s.async = false;
      (document.head || document.documentElement).appendChild(s);
    } else if (typeof window.VcPerf.apply === "function") {
      window.VcPerf.apply();
    }
  } catch (ePerfBoot) {}
})();

(function () {
  try {
    var coarse =
      (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
      (window.matchMedia && window.matchMedia("(hover: none)").matches) ||
      Number(navigator.maxTouchPoints || 0) > 0 ||
      Boolean(navigator.standalone);
    if (!coarse) return;
    var fixNavGhost = function () {
      try {
        var r = document.documentElement;
        if (!r) return;
        var drawer = document.getElementById("vc-mobile-nav-drawer");
        if (
          r.classList.contains("vc-mobile-nav-open") &&
          (!drawer || !drawer.classList.contains("vc-mobile-nav-drawer--open"))
        ) {
          r.classList.remove("vc-mobile-nav-open");
        }
      } catch (e) {}
    };
    fixNavGhost();
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fixNavGhost, { once: true });
    }
    window.addEventListener("pageshow", fixNavGhost);
  } catch (e0) {}
})();
(function () {
  try {
    if (!window.VcApiCache) {
      var s = document.createElement("script");
      s.src = "/js/vc-api-cache.js?v=20260908notifApiErr1";
      (document.head || document.documentElement).appendChild(s);
    }
  } catch (eApiBoot) {}
})();
(function () {
  try {
    if (!window.VcPerf || !window.VcPerf.__ready) {
      var s = document.createElement("script");
      s.src = "/js/vc-perf.js?v=20260904forceMidAll1";
      s.defer = true;
      (document.head || document.documentElement).appendChild(s);
    } else if (typeof window.VcPerf.apply === "function") {
      window.VcPerf.apply();
    }
  } catch (ePerfBoot) {}
})();

(function () {
  var RESUME_KEY = "vc-pwa-resume";
  var WANT_HOME_KEY = "vc-pwa-want-home";

  function isStandalonePwa() {
    try {
      if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true;
    } catch (e0) {}
    try {
      if (window.matchMedia && window.matchMedia("(display-mode: fullscreen)").matches) return true;
    } catch (e1) {}
    return Boolean(navigator.standalone);
  }

  function currentPath() {
    try {
      var p = String(window.location.pathname || "/").replace(/\/index\.html$/i, "") || "/";
      if (p !== "/" && p.charAt(p.length - 1) !== "/") p += "/";
      if (p === "//") p = "/";
      return p;
    } catch (e) {
      return "/";
    }
  }

  function safeResumePath(path) {
    var p = String(path || "");
    if (!p || p.charAt(0) !== "/" || p.indexOf("//") !== -1 || p.indexOf("\\") !== -1) return "";
    if (p.length > 180) return "";
    return p;
  }

  function saveResume(path) {
    var p = safeResumePath(path);
    if (!p) return;
    try {
      localStorage.setItem(RESUME_KEY, JSON.stringify({ p: p, t: Date.now() }));
    } catch (e) {}
  }

  function markWantHome() {
    var payload = JSON.stringify({ t: Date.now() });
    try {
      sessionStorage.setItem(WANT_HOME_KEY, "1");
    } catch (eS) {}
    try {
      localStorage.setItem(WANT_HOME_KEY, payload);
    } catch (eL) {}
    saveResume("/");
  }

  function consumeWantHome() {
    var hit = false;
    try {
      if (sessionStorage.getItem(WANT_HOME_KEY) === "1") {
        sessionStorage.removeItem(WANT_HOME_KEY);
        hit = true;
      }
    } catch (eS) {}
    try {
      var raw = localStorage.getItem(WANT_HOME_KEY);
      if (raw) {
        localStorage.removeItem(WANT_HOME_KEY);
        var data = null;
        try {
          data = JSON.parse(raw);
        } catch (eP) {
          data = null;
        }
        var at = Number(data && data.t) || 0;
                if (!at || Date.now() - at < 60000) hit = true;
      }
    } catch (eL) {}
    return hit;
  }

  function isVotePlatformHref(href) {
    try {
      var u = new URL(String(href || ""), window.location.href);
      var host = String(u.hostname || "").toLowerCase();
      return host.indexOf("top.gg") !== -1 || host.indexOf("discadia.com") !== -1;
    } catch (e) {
      return false;
    }
  }

  function isSiteHost(hostname) {
    var h = String(hostname || "").toLowerCase();
    if (!h) return false;
    if (h === "viniliecaffe.it" || h.endsWith(".viniliecaffe.it")) return true;
    if (h === "viniliecaffe.gg" || h.endsWith(".viniliecaffe.gg")) return true;
    try {
      if (h === String(window.location.hostname || "").toLowerCase()) return true;
    } catch (e) {}
    return false;
  }

  function isHomeHref(href) {
    try {
      var u = new URL(String(href || ""), window.location.href);
      if (!isSiteHost(u.hostname)) return false;
      var p = String(u.pathname || "/").replace(/\/+$/, "") || "/";
      return p === "/";
    } catch (e) {
      return false;
    }
  }

  function siteHomeHref() {
        return "/";
  }

  function isBrokenHomePath(pathname) {
    var p = String(pathname || "/").replace(/\/+$/, "") || "/";
    return p === "/faq" || p === "/vote";
  }

  function isBrandHomeAnchor(a) {
    if (!a || !a.tagName || String(a.tagName).toUpperCase() !== "A") return false;
    if (a.classList && (a.classList.contains("vc-snav-item") || a.classList.contains("vc-snav-row"))) return false;
    try {
      var prev = a.previousElementSibling;
      if (prev && prev.classList && prev.classList.contains("vc-header-logo-link")) return true;
    } catch (ePrev) {}
    if (String(a.getAttribute("aria-label") || "") === "Vai alla homepage") {
      try {
        if (a.closest(".vc-header-bar > div:first-child, .vc-mobile-nav-drawer__brand")) return true;
      } catch (eCol) {}
    }
    return false;
  }

  function stripMisplacedHeaderSiteNameClass() {
    var bad = document.querySelectorAll(
      "a.vc-snav-item.vc-header-site-name, a.vc-snav-row.vc-header-site-name",
    );
    for (var i = 0; i < bad.length; i += 1) {
      try {
        bad[i].classList.remove("vc-header-site-name");
      } catch (eRm) {}
    }
  }

    function repairBrokenHomeLinks() {
    try {
      if (window.__VC_AUTH && window.__VC_AUTH.homeUrl) {
        var badHome = String(window.__VC_AUTH.homeUrl || "");
        var cleaned = badHome.replace(/\?.*$/, "").replace(/#.*$/, "");
        try {
          var badPath = String(new URL(cleaned, window.location.href).pathname || "/")
            .replace(/\/+$/, "") || "/";
          if (isBrokenHomePath(badPath) || badPath === "/") {
            try {
              window.__VC_AUTH.homeUrl = "/";
            } catch (eFix) {}
          }
        } catch (eParse) {
          try {
            window.__VC_AUTH.homeUrl = "/";
          } catch (eFix2) {}
        }
      }
    } catch (eAuth) {}
    stripMisplacedHeaderSiteNameClass();
    var home = siteHomeHref();
    var nodes = document.querySelectorAll(
      'header .vc-header-bar > div:first-child a.vc-header-site-name, header .vc-header-bar > div:first-child a.vc-header-logo-link + a[href], .vc-mobile-nav-drawer__brand a.vc-header-logo-link + a[href], .vc-mobile-nav-drawer__brand a.vc-header-site-name, header .vc-header-bar > div:first-child a[aria-label="Vai alla homepage"], .vc-premium-footer__logo-row, a[data-i18n="footer.home"]'
    );
    for (var i = 0; i < nodes.length; i++) {
      var a = nodes[i];
      try {
        var href = a.getAttribute("href") || "";
        if (!href || href.charAt(0) === "#") continue;
        var u = new URL(href, window.location.href);
        if (!isSiteHost(u.hostname) && href.charAt(0) !== "/") continue;
        var p = String(u.pathname || "/").replace(/\/+$/, "") || "/";
        if (isBrokenHomePath(p) || p === "/" || isBrandHomeAnchor(a)) {
          a.setAttribute("href", home);
        }
      } catch (eA) {}
    }
  }

  var __vcHomeNavAt = 0;
  function goHomeNow(ev) {
    try {
      if (ev && (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey)) return false;
      if (ev && typeof ev.button === "number" && ev.button !== 0) return false;
    } catch (eMod) {}
    if (Date.now() - __vcHomeNavAt < 700) {
      try {
        if (ev && ev.preventDefault) ev.preventDefault();
      } catch (eDup) {}
      return true;
    }
    __vcHomeNavAt = Date.now();
    try {
      markWantHome();
    } catch (eWant) {}
    try {
      if (ev && ev.preventDefault) ev.preventDefault();
    } catch (ePrev) {}
    try {
      var here = String(window.location.pathname || "/").replace(/\/+$/, "") || "/";
      if (here === "/") {
        try {
          window.scrollTo(0, 0);
        } catch (eSc) {}
        return true;
      }
    } catch (eHere) {}
    try {
      window.location.assign("/");
    } catch (eA) {
      window.location.href = "/";
    }
    return true;
  }

  function prefetchHomeDoc() {
    try {
      if (document.querySelector('link[data-vc-prefetch-home="1"]')) return;
      var l = document.createElement("link");
      l.rel = "prefetch";
      l.href = "/";
      l.setAttribute("data-vc-prefetch-home", "1");
      (document.head || document.documentElement).appendChild(l);
    } catch (ePf) {}
  }

  var navPrefetchSeen = typeof WeakSet === "function" ? new WeakSet() : null;
  var navPrefetchPaths = typeof Set === "function" ? new Set() : null;

  function prefetchNavHref(href) {
    try {
      var raw = String(href || "").trim();
      if (!raw || raw.indexOf("#") === 0) return;
      var u = new URL(raw, window.location.origin);
      if (u.origin !== window.location.origin) return;
      var path = u.pathname || "/";
      if (path === window.location.pathname) return;
      if (navPrefetchPaths) {
        if (navPrefetchPaths.has(path)) return;
        navPrefetchPaths.add(path);
      }
      var key = 'link[data-vc-prefetch-nav="' + path + '"]';
      if (document.querySelector(key)) return;
      var l = document.createElement("link");
      l.rel = "prefetch";
      l.href = path + (path.endsWith("/") ? "index.html" : "");
      l.setAttribute("data-vc-prefetch-nav", path);
      (document.head || document.documentElement).appendChild(l);
    } catch (eNavPf) {}
  }

  function wireNavPrefetch() {
    if (wireNavPrefetch._wired) return;
    wireNavPrefetch._wired = true;
    document.addEventListener(
      "pointerenter",
      function (ev) {
        try {
          if (window.matchMedia && !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
        } catch (eMq) {
          return;
        }
        var a = ev.target && ev.target.closest ? ev.target.closest("a[href]") : null;
        if (!a) return;
        if (navPrefetchSeen) {
          if (navPrefetchSeen.has(a)) return;
          navPrefetchSeen.add(a);
        }
        if (
          a.closest(".vc-header-snav, .vc-mobile-nav-drawer, .vc-snav-panel, header") ||
          a.classList.contains("vc-snav-item") ||
          a.classList.contains("vc-snav-row")
        ) {
          prefetchNavHref(a.getAttribute("href") || "");
        }
      },
      true
    );
  }

  try {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", repairBrokenHomeLinks);
    } else {
      repairBrokenHomeLinks();
    }
    window.addEventListener("pageshow", repairBrokenHomeLinks);
    document.addEventListener(
      "pointerdown",
      function (ev) {
        var a = ev.target && ev.target.closest ? ev.target.closest("a[href]") : null;
        if (!a) return;
        if (isBrandHomeAnchor(a) || isHomeHref(a.getAttribute("href") || "")) {
          try {
            a.setAttribute("href", "/");
          } catch (eH) {}
          prefetchHomeDoc();
        }
      },
      true
    );
    document.addEventListener(
      "pointerup",
      function (ev) {
        try {
          if (ev.pointerType === "mouse") return;
        } catch (eT) {}
        var a = ev.target && ev.target.closest ? ev.target.closest("a[href]") : null;
        if (!a) return;
        if (isBrandHomeAnchor(a) || isHomeHref(a.getAttribute("href") || "")) {
          goHomeNow(ev);
        }
      },
      true
    );
    window.setTimeout(prefetchHomeDoc, 1200);
    wireNavPrefetch();
  } catch (eRep) {}

  var PENDING_NAV_CACHE = "vc-pending-nav-v1";
  var PENDING_NAV_URL = "/__vc/pending-nav";

  function pendingNavToPath(data) {
    var url = String((data && data.url) || "").trim();
    var tid = String((data && data.ticketId) || "").trim();
    if (!url && /^[a-f0-9]{24}$/i.test(tid)) {
      url = "/tickets/?ticketId=" + encodeURIComponent(tid) + "#" + tid;
    }
    if (!url) return "";
    try {
      var u = new URL(url, window.location.origin);
      if (u.origin !== window.location.origin) return "";
      return u.pathname + u.search + u.hash;
    } catch (e) {
      return "";
    }
  }

  function readPendingNavPath() {
    if (!("caches" in window)) return Promise.resolve("");
    return caches
      .open(PENDING_NAV_CACHE)
      .then(function (cache) {
        return cache.match(PENDING_NAV_URL).then(function (res) {
          if (!res) return "";
          return res.json().then(function (data) {
            var at = Number(data && data.at) || 0;
            if (at && Date.now() - at > 120000) {
              return cache.delete(PENDING_NAV_URL).then(function () {
                return "";
              });
            }
            return pendingNavToPath(data);
          });
        });
      })
      .catch(function () {
        return "";
      });
  }

  function maybeRestoreFromHome() {
    if (!isStandalonePwa()) return false;
    var here = currentPath();
    if (here !== "/") return false;
    try {
      var search = String(window.location.search || "");
      if (/[?&]code=/.test(search) || /[?&]state=/.test(search)) return false;
    } catch (eQ) {}
        if (consumeWantHome()) {
      saveResume("/");
      return false;
    }
        try {
      if (document.referrer) {
        var ref = new URL(document.referrer);
        if (isSiteHost(ref.hostname)) {
          var refPath = safeResumePath(
            String(ref.pathname || "/").replace(/\/index\.html$/i, "") || "/"
          );
          if (refPath && refPath !== "/") {
            saveResume("/");
            return false;
          }
        }
      }
    } catch (eRef) {}
    try {
      var data = JSON.parse(localStorage.getItem(RESUME_KEY) || "null");
      var path = safeResumePath(data && data.p);
      var at = Number(data && data.t) || 0;
      if (!path || path === "/" || Date.now() - at > 2 * 60 * 60 * 1000) return false;
            var norm = String(path || "").replace(/\/+$/, "") || "/";
      if (norm === "/vote") return false;
      if (path === here) return false;
      try {
        document.documentElement.style.background = "#100c09";
        document.documentElement.style.colorScheme = "dark";
        if (document.body) document.body.style.background = "#100c09";
      } catch (ePaint) {}
      window.location.replace(path);
      return true;
    } catch (eR) {}
    return false;
  }

      if (isStandalonePwa() && currentPath() === "/") {
    readPendingNavPath().then(function (pendingPath) {
      if (pendingPath) {
        try {
          var hereFull = window.location.pathname + window.location.search + window.location.hash;
          if (hereFull !== pendingPath) {
            window.location.replace(pendingPath);
            return;
          }
        } catch (eP) {
          window.location.replace(pendingPath);
          return;
        }
      }
      if (!maybeRestoreFromHome()) saveResume(currentPath());
    });
  } else if (isStandalonePwa()) {
    saveResume(currentPath());
  }

  function isSameOriginHref(href) {
    try {
      var url = new URL(String(href || ""), window.location.href);
      return url.origin === window.location.origin;
    } catch (e) {
      return false;
    }
  }

  function assignInApp(url) {
    try {
      window.location.assign(url.pathname + url.search + url.hash);
    } catch (eA) {
      window.location.href = String(url.href || "/");
    }
  }

  /* 20260908imgLightbox2: non convertire _blank immagini in navigate same-tab (rompe lightbox). */
  function isInAppImageMediaHref(href) {
    var u = String(href || "").trim();
    if (!u || u === "#" || /^javascript:/i.test(u)) return false;
    if (/\.(gif|png|jpe?g|webp|avif|bmp|svg)(\?|#|$)/i.test(u)) return true;
    if (/cdn\.discordapp\.com\/attachments|media\.discordapp\.net\/attachments/i.test(u)) return true;
    if (/\/webhooks\/site-(?:web-tickets|bot-feedback|suggestions|[^/]+-workflow-chat)\/files\//i.test(u)) {
      return !/\.(mp4|webm|mov|mp3|wav|ogg|pdf|zip)(\?|#|$)/i.test(u);
    }
    if (/\/(?:uploads|files|attachments|media)\//i.test(u) && !/\.(mp4|webm|mov|mp3|wav|ogg|pdf|zip)(\?|#|$)/i.test(u)) {
      return true;
    }
    return false;
  }

  function isInAppImageMediaAnchor(a) {
    if (!a || !a.getAttribute) return false;
    if (a.closest && a.closest(".vc-wt-msg__img--video")) return false;
    if (
      a.classList &&
      (a.classList.contains("vc-wt-msg__img") ||
        a.classList.contains("vc-wt-msg__img-inline") ||
        a.classList.contains("vc-wfc-media__img") ||
        (a.parentElement &&
          a.parentElement.classList &&
          a.parentElement.classList.contains("vc-bot-feedback-images")))
    ) {
      var hrefCls = a.getAttribute("href") || "";
      if (hrefCls && !/\.(mp4|webm|mov)(\?|#|$)/i.test(hrefCls)) return true;
    }
    return isInAppImageMediaHref(a.getAttribute("href") || "");
  }

  document.addEventListener(
    "click",
    function (ev) {
      var a = ev.target && ev.target.closest ? ev.target.closest("a[href]") : null;
      if (!a) return;
      var href = a.getAttribute("href") || "";
      if (isBrandHomeAnchor(a) || isHomeHref(href)) {
        goHomeNow(ev);
        return;
      }
      if (isVotePlatformHref(href)) {
        saveResume("/vote/");
        return;
      }
      if (!isStandalonePwa()) return;
      if (
        !ev.defaultPrevented &&
        ev.button === 0 &&
        !ev.metaKey &&
        !ev.ctrlKey &&
        !ev.shiftKey &&
        !ev.altKey &&
        isSameOriginHref(href) &&
        !a.hasAttribute("download")
      ) {
        var target = String(a.getAttribute("target") || "").toLowerCase();
        if (target === "_blank") {
          if (isInAppImageMediaAnchor(a)) return;
          ev.preventDefault();
          try {
            assignInApp(new URL(href, window.location.href));
          } catch (eNav) {}
          return;
        }
      }
    },
    true
  );

  window.addEventListener("pagehide", function () {
    if (!isStandalonePwa()) return;
        try {
      if (sessionStorage.getItem(WANT_HOME_KEY) === "1") {
        saveResume("/");
        return;
      }
    } catch (eW) {}
    try {
      var raw = localStorage.getItem(WANT_HOME_KEY);
      if (raw) {
        saveResume("/");
        return;
      }
    } catch (eL) {}
    var leavePath = currentPath();
    if (leavePath === "/vote/" || leavePath === "/vote") return;
    saveResume(leavePath);
  });
})();

(function () {
  var CONSENT_KEY = "vc_cookie_banner_ack_v3";
  var CONSENT_COOKIE = "vc_cookie_banner_ack_v3";
  var DISCORD_ACCESS_TOKEN_KEY = "vc_discord_access_token";
  var DISCORD_EXPIRES_AT_KEY = "vc_discord_expires_at";
  var FORBIDDEN_BOOKS_KEY = "vc_forbidden_section_books_v1";
  var FORBIDDEN_BOOKS_START_MS = new Date("2026-06-20T12:00:00").getTime();
  var FORBIDDEN_BOOKS_END_MS = new Date("2026-09-01T10:00:00").getTime();
  var FORBIDDEN_SITE_BOOKS_TOTAL = 8;
  var PAGE_REVEAL_SESSION_KEY = "vc_site_session_reveal_v1";

  try {
    if (sessionStorage.getItem(PAGE_REVEAL_SESSION_KEY)) {
      document.documentElement.classList.add("vc-skip-page-reveal");
    } else {
      sessionStorage.setItem(PAGE_REVEAL_SESSION_KEY, "1");
    }
  } catch (eReveal) {}

  function normalizeLegalPath(pathname) {
    var path = String(pathname || "/").replace(/\/+$/, "") || "/";
    path = path.replace(/\/index\.html$/i, "");
    return path || "/";
  }

  function isLegalCookiePage() {
    try {
      var path = normalizeLegalPath(window.location.pathname);
      return path === "/cookie" || path === "/privacy" || path === "/terms";
    } catch (e) {
      return false;
    }
  }

  function hasCookieConsent() {
    try {
      if (window.sessionStorage && window.sessionStorage.getItem(CONSENT_KEY) === "accepted") return true;
    } catch (e) {}
    try {
      if (window.localStorage && window.localStorage.getItem(CONSENT_KEY) === "accepted") return true;
    } catch (e) {}
    try {
      return document.cookie.split(";").some(function (part) {
        return part.trim().indexOf(CONSENT_COOKIE + "=accepted") === 0;
      });
    } catch (e) {
      return false;
    }
  }

  function cookieDomainSuffixForConsent() {
    try {
      var h = String(window.location.hostname || "").toLowerCase();
      if (!h || h === "localhost" || h === "127.0.0.1" || h === "[::1]") return "";
      if (h.endsWith(".localhost")) return "";
      if (h === "viniliecaffe.it" || h.endsWith(".viniliecaffe.it")) return "; Domain=.viniliecaffe.it";
    } catch (e) {}
    return "";
  }

  function rememberCookieConsent() {
    try {
      if (window.localStorage) window.localStorage.setItem(CONSENT_KEY, "accepted");
    } catch (e) {}
    try {
      if (window.sessionStorage) window.sessionStorage.setItem(CONSENT_KEY, "accepted");
    } catch (e) {}
    try {
      var maxAge = 60 * 60 * 24 * 180;
      var secure = String(window.location.protocol || "").toLowerCase() === "https:" ? "; Secure" : "";
      var domain = cookieDomainSuffixForConsent();
      document.cookie =
        CONSENT_COOKIE + "=accepted; Max-Age=" + maxAge + "; Path=/; SameSite=Lax" + secure + domain;
    } catch (e) {}
  }

  function closeCookieBanner(root) {
    if (!root) return;
    root.classList.add("vc-necessity-banner--leaving");
    window.setTimeout(function () {
      if (root && root.parentNode) root.parentNode.removeChild(root);
    }, 220);
  }

    function initCookieConsent() {
    if (isLegalCookiePage()) return;
    if (hasCookieConsent()) return;
    if (document.getElementById("vc-necessity-banner")) return;
    if (document.getElementById("cookieyes")) return;
    if (!document.documentElement) return;
    function sanitizeLegalHref(raw) {
      var value = String(raw || "").trim();
      if (!value) return "";
      if (/^javascript:/i.test(value)) return "";
      if (value.startsWith("/")) return value;
      if (/^https?:\/\//i.test(value)) return value;
      return "";
    }
    function resolveCookiePolicyUrl() {
      var fromWindow = "";
      try {
        fromWindow = sanitizeLegalHref(window.__VC_COOKIE_POLICY_URL);
      } catch (e0) {}
      if (fromWindow) return fromWindow;
      var fromDom = "";
      try {
        var link = document.querySelector('a[href*="/cookie"], a[href*="cookie-policy"], a[href*="cookie"]');
        fromDom = sanitizeLegalHref(link && link.getAttribute("href"));
      } catch (e1) {}
      if (fromDom) return fromDom;
      return "/cookie/";
    }
    var cookiePolicyUrl = resolveCookiePolicyUrl();

    var root = document.createElement("section");
    root.id = "vc-necessity-banner";
    root.className = "vc-necessity-banner";
    root.setAttribute("aria-label", "Avviso utilizzo cookie");
    root.style.width = "fit-content";
    root.style.maxWidth = "calc(100vw - 1.5rem)";
    root.innerHTML =
      '<div class="vc-necessity-banner__pill" role="dialog" aria-modal="false" aria-labelledby="vc-necessity-text" style="display:inline-flex;width:auto;gap:0.65rem">' +
      '<p id="vc-necessity-text" class="vc-necessity-banner__text">' +
      'Questo sito utilizza <a class="vc-necessity-banner__policy" href="' + cookiePolicyUrl + '">cookie essenziali</a>' +
      "</p>" +
      '<button type="button" class="vc-necessity-banner__accept" data-vc-necessity-confirm>Accetta</button>' +
      "</div>";

    function dismissFromUserAction(ev) {
      if (ev) {
        ev.preventDefault();
        ev.stopPropagation();
      }
      rememberCookieConsent();
      closeCookieBanner(root);
      try {
        window.dispatchEvent(new CustomEvent("vc:cookie-accepted"));
      } catch (eEv) {}
      try {
        if (typeof window.__vcHogwartsYoutubeStartFromGesture === "function") {
          window.__vcHogwartsYoutubeStartFromGesture();
        }
      } catch (eBgm) {}
    }
    var acceptEl = root.querySelector(".vc-necessity-banner__accept");
    if (acceptEl) acceptEl.addEventListener("click", dismissFromUserAction);

    (document.documentElement || document.body).appendChild(root);
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        if (!root.parentNode) return;
        root.classList.add("vc-necessity-banner--visible");
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCookieConsent);
  } else {
    initCookieConsent();
  }
  window.addEventListener("pageshow", function () {
    if (hasCookieConsent()) return;
    if (document.getElementById("vc-necessity-banner")) return;
    initCookieConsent();
  });
})();
(function () {
  function normalizePrettyProfilePath() {
    try {
      if (window.__VC_DISABLE_PRETTY_PROFILE_REDIRECT === true) return false;
      var customizeMatch = String(window.location.pathname || "").match(/^\/user\/(\d{17,20})\/personalizza\/?$/);
      if (customizeMatch) {
        window.location.replace("/personalizza/?id=" + encodeURIComponent(customizeMatch[1]));
        return true;
      }
      var legacyCustomizeMatch = String(window.location.pathname || "").match(/^\/users\/(\d{17,20})\/customize\/?$/);
      if (legacyCustomizeMatch) {
        window.location.replace("/personalizza/?id=" + encodeURIComponent(legacyCustomizeMatch[1]) + "&target=rank");
        return true;
      }
      var m = String(window.location.pathname || "").match(/^\/users?\/(\d{17,20})\/?$/);
      if (!m) return false;
      var q = new URLSearchParams(window.location.search || "");
      if (String(q.get("id") || "").trim() === m[1] && /^\/user\/?$/.test(String(window.location.pathname || ""))) {
        return false;
      }
      window.location.replace("/user/?id=" + encodeURIComponent(m[1]));
      return true;
    } catch (e) {
      return false;
    }
  }

  if (normalizePrettyProfilePath()) return;

  function hideTransitionOverlay() {
    var ov = document.getElementById("vc-page-transition");
    if (ov) ov.classList.remove("vc-page-transition--on");
  }

  function afterOverlayPaint(fn) {
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(fn);
    });
  }

  function navigateToHref(href) {
    var u = String(href || "").trim();
    if (!u) return;
    try {
      window.location.href = u;
    } catch (e) {
      try {
        window.location.assign(u);
      } catch (e2) {}
    }
  }

  window.addEventListener("pageshow", function () {
    hideTransitionOverlay();
  });

  window.addEventListener("load", function () {
    hideTransitionOverlay();
  });

  function ensureTransitionOverlay() {
    var existing = document.getElementById("vc-page-transition");
    if (existing) return existing;
    var wrap = document.createElement("div");
    wrap.id = "vc-page-transition";
    wrap.className = "vc-page-transition";
    wrap.setAttribute("aria-hidden", "true");
    wrap.innerHTML =
      '<div class="vc-page-transition-content">' +
      '<div class="vc-page-transition-vote-iconwrap" aria-hidden="true">' +
      '<span class="vc-page-transition-vote-spark vc-page-transition-vote-spark--a"><i class="fa fa-star-o"></i></span>' +
      '<span class="vc-page-transition-vote-spark vc-page-transition-vote-spark--b"><i class="fa fa-star-o"></i></span>' +
      '<span class="vc-page-transition-vote-spark vc-page-transition-vote-spark--c"><i class="fa fa-star-o"></i></span>' +
      '<span class="vc-page-transition-vote-iconring"></span>' +
      '<span class="vc-page-transition-vote-icon"><i class="fa fa-certificate"></i></span>' +
      "</div>" +
      '<span class="vc-page-transition-spinner" aria-hidden="true"></span>' +
      '<p class="vc-page-transition-text">Caricamento...</p>' +
      '<p class="vc-page-transition-sub">Sto preparando la pagina...</p>' +
      '<span class="vc-page-transition-bar" aria-hidden="true"><span class="vc-page-transition-barfill"></span></span>' +
      "</div>";
    document.body.appendChild(wrap);
    return wrap;
  }

  function setTransitionOverlayContent(ov, kind) {
    if (!ov) return;
    var text = ov.querySelector(".vc-page-transition-text");
    var sub = ov.querySelector(".vc-page-transition-sub");
    ov.classList.toggle("vc-page-transition--vote", kind === "vote");
    ov.classList.toggle("vc-page-transition--login", kind === "login");
    if (text) text.textContent = kind === "vote" ? "Caricamento..." : "Caricamento...";
    if (sub) {
      sub.textContent =
        kind === "vote"
          ? "Preparazione del sistema di voto"
          : kind === "login"
            ? "Accesso in corso..."
            : "Sto preparando la pagina...";
    }
  }

  function showTransitionOverlay(kind) {
        return;
  }

  try {
    window.vcShowPageTransition = showTransitionOverlay;
  } catch (e) {}

  function isVoteLoadingLink(a) {
    if (!a || !a.getAttribute) return false;
    return String(a.getAttribute("data-vc-loading") || "").toLowerCase() === "vote";
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
      if (isVoteLoadingLink(a)) {
                return;
      }
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
    var p = String(path || "/").trim() || "/";
    p = p.replace(/\\/g, "/");
    p = p.replace(/\/{2,}/g, "/");
    if (p.charAt(0) !== "/") p = "/" + p;
    p = p.replace(/\/index\.html$/i, "");
    if (p.length > 1) p = p.replace(/\/+$/, "");
    return p || "/";
  }

  function pathnameFromHref(href) {
    var raw = String(href || "").trim();
    if (!raw || raw.charAt(0) === "#") return "";
    try {
      var u = new URL(raw, window.location.href);
      if (u.origin !== window.location.origin) return "";
      return normalizePathname(u.pathname);
    } catch (e) {
      return "";
    }
  }

  function markSnavDetailsCurrentFromLocation() {
    var bar = document.querySelector(".vc-header-bar");
    if (!bar) return;
    var cur = normalizePathname(window.location.pathname);
    var isUserProfileDetail = false;
    try {
      if (/^\/users?\/\d{17,22}$/.test(cur)) {
        isUserProfileDetail = true;
      } else if (cur === "/user" || cur === "/users") {
        var q = new URLSearchParams(window.location.search || "");
        isUserProfileDetail = /^\d{17,22}$/.test(
          String(q.get("id") || q.get("userId") || q.get("uid") || "").trim(),
        );
      }
    } catch (e0) {}
    var allRows = bar.querySelectorAll("a.vc-snav-row");
    var allItems = bar.querySelectorAll("a.vc-snav-item");
    allRows.forEach(function (a) {
      a.classList.remove("vc-snav-row--active");
      a.removeAttribute("aria-current");
    });
    allItems.forEach(function (a) {
      a.classList.remove("vc-snav-item--active");
      a.removeAttribute("aria-current");
    });
    bar.querySelectorAll("details.vc-snav-details").forEach(function (d) {
      d.classList.remove("vc-snav-details--current");
    });

    var itemHit = false;
    allItems.forEach(function (a) {
      var p = pathnameFromHref(a.getAttribute("href"));
      if (!p || p !== cur) return;
      if (isUserProfileDetail && (p === "/user" || p === "/users")) return;
      itemHit = true;
      a.classList.add("vc-snav-item--active");
      a.setAttribute("aria-current", "page");
    });

    var rowHit = false;
    bar.querySelectorAll("details.vc-snav-details").forEach(function (det) {
      var hit = false;
      det.querySelectorAll("a.vc-snav-row").forEach(function (a) {
        var p = pathnameFromHref(a.getAttribute("href"));
        if (!p || p !== cur) return;
        if (isUserProfileDetail && (p === "/user" || p === "/users")) return;
        hit = true;
        rowHit = true;
        a.classList.add("vc-snav-row--active");
        a.setAttribute("aria-current", "page");
      });
      if (hit) det.classList.add("vc-snav-details--current");
    });

  }

  function richiesteNavTitleNorm(det) {
    var sum = det ? det.querySelector(".vc-snav-summary span, .vc-snav-summary") : null;
    if (sum && sum.getAttribute && sum.getAttribute("data-i18n") === "nav.requests") return "richieste";
    return sum ? String(sum.textContent || "").replace(/\s+/g, " ").trim().toLowerCase() : "";
  }

    function isTicketMentionText(text) {
    return /🎫/.test(text) && /tickets/i.test(text);
  }

  function linkifyTicketMentions(root) {
    var scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll("span.vc-sponsor-mention, code.vc-sponsor-mention").forEach(function (el) {
      if (!el || el.closest('a[href*="/tickets"]')) return;
      var txt = String(el.textContent || "").replace(/\s+/g, " ").trim();
      if (!isTicketMentionText(txt)) return;
      var a = document.createElement("a");
      a.setAttribute("href", "/tickets/");
      a.className = el.className;
      a.innerHTML = el.innerHTML;
      if (el.parentNode) el.parentNode.replaceChild(a, el);
    });
  }

    function isTicketsNavRow(row) {
    if (!row) return false;
    var href = String(row.getAttribute("href") || "").toLowerCase();
    if (
      href.indexOf("/tickets") >= 0 ||
      href.indexOf("tickets_page") >= 0 ||
      href.indexOf("supporto_page") >= 0
    ) {
      return true;
    }
    if (row.querySelector && row.querySelector("[data-i18n='nav.tickets']")) return true;
    if (row.querySelector && row.querySelector(".fa-ticket")) return true;
    return /\btickets\b/i.test(String(row.textContent || ""));
  }

  function dedupeTicketsInRichiesteNav() {
    var bar = document.querySelector(".vc-header-bar");
    if (!bar) return;
    bar.querySelectorAll("details.vc-snav-details").forEach(function (det) {
      var title = richiesteNavTitleNorm(det);
      if (title !== "richieste" && title !== "requests") return;
      var panel = det.querySelector(".vc-snav-panel");
      if (!panel) return;
      var seen = false;
      panel.querySelectorAll("a.vc-snav-row").forEach(function (row) {
        if (!isTicketsNavRow(row)) return;
        if (seen) {
          try {
            row.remove();
          } catch (eRm) {}
          return;
        }
        seen = true;
      });
    });
  }

  function ensureTicketsInRichiesteNav() {
    dedupeTicketsInRichiesteNav();
    var bar = document.querySelector(".vc-header-bar");
    if (!bar) return;
    bar.querySelectorAll("details.vc-snav-details").forEach(function (det) {
      var title = richiesteNavTitleNorm(det);
      if (title !== "richieste" && title !== "requests") return;
      var panel = det.querySelector(".vc-snav-panel");
      if (!panel) return;
      if (panel.querySelector("a.vc-snav-row") && Array.prototype.some.call(panel.querySelectorAll("a.vc-snav-row"), isTicketsNavRow)) {
        return;
      }
      if (
        panel.querySelector(
          'a[href*="/tickets"], a[href*="/supporto"], a[href*="TICKETS_PAGE"], a[href*="SUPPORTO_PAGE"]',
        )
      ) {
        return;
      }
      var row = document.createElement("a");
      row.className = "vc-snav-row";
      row.setAttribute("href", "/tickets/");
      row.innerHTML =
        '<span class="vc-snav-row-ico" aria-hidden="true"><i class="fa fa-ticket"></i></span><span data-i18n="nav.tickets">Tickets</span>';
      var sug = panel.querySelector(
        'a[href*="feedback"], a[href*="suggerimenti"], a[href*="RICHIESTE_SUGGERIMENTI"]',
      );
      if (sug && sug.parentNode) sug.parentNode.insertBefore(row, sug.nextSibling);
      else panel.appendChild(row);
    });
    dedupeTicketsInRichiesteNav();
    try {
      if (typeof window.__vcMobileNavRebuild === "function") window.__vcMobileNavRebuild();
    } catch (eNavRebuild) {}
  }

  function initHeaderNavAccordion() {
    var bar = document.querySelector(".vc-header-bar");
    if (!bar) return;
    var HEADER_MENU_SYNC_KEY = "vc_header_menu_sync_v1";
    var localWindowId = String(Date.now()) + "-" + String(Math.random()).slice(2);
    function getSnavDetails() {
      return bar.querySelectorAll("details.vc-snav-details");
    }
    function closeOtherSnavDetails(except) {
      getSnavDetails().forEach(function (other) {
        if (other !== except) other.open = false;
      });
    }
    var notif = bar.querySelector("details.vc-notif-dropdown");
    var accountMenuOpen = false;
    function closeLangMenu() {
      try {
        if (window.VcI18n && typeof window.VcI18n.closeLangMenu === "function") {
          window.VcI18n.closeLangMenu();
        }
      } catch (e) {}
    }
    function syncHeaderDropdownOpenClasses() {
      var root = document.documentElement;
      if (!root) return;
      var notifOpen = Boolean(notif && notif.open);
      root.classList.toggle("vc-notif-dropdown-open", notifOpen);
      root.classList.toggle("vc-header-account-open", accountMenuOpen);
    }
    function setAccountMenuOpen(on) {
      accountMenuOpen = Boolean(on);
      syncHeaderDropdownOpenClasses();
    }
    function broadcastHeaderMenuOpen(sourceId) {
      try {
        localStorage.setItem(
          HEADER_MENU_SYNC_KEY,
          JSON.stringify({
            t: Date.now(),
            src: localWindowId,
            id: String(sourceId || ""),
          }),
        );
      } catch (e) {}
    }
        bar.addEventListener(
      "click",
      function (ev) {
        var sum = ev.target && ev.target.closest ? ev.target.closest("summary.vc-snav-summary") : null;
        if (!sum || !bar.contains(sum)) return;
        var det = sum.closest("details.vc-snav-details");
        if (!det) return;
        closeOtherSnavDetails(det);
      },
      true,
    );
    bar.addEventListener(
      "toggle",
      function (ev) {
        var d = ev.target;
        if (!d || d.tagName !== "DETAILS" || !d.classList.contains("vc-snav-details") || !bar.contains(d)) {
          return;
        }
        if (d.open) {
          broadcastHeaderMenuOpen(d.id || d.getAttribute("data-menu-id") || "snav");
          closeOtherSnavDetails(d);
          if (notif) notif.open = false;
          closeLangMenu();
        }
        syncHeaderDropdownOpenClasses();
      },
      true,
    );
    if (notif) {
      notif.addEventListener("toggle", function () {
        syncHeaderDropdownOpenClasses();
        if (!notif.open) return;
        broadcastHeaderMenuOpen(notif.id || "notif");
        getSnavDetails().forEach(function (other) {
          other.open = false;
        });
        setAccountMenuOpen(false);
        try {
          var accBtn = bar.querySelector(".discord-profile-link");
          if (accBtn && document.activeElement === accBtn) accBtn.blur();
        } catch (eBlur) {}
        closeLangMenu();
      });
    }
    document.addEventListener("vc:langmenuopen", function () {
      getSnavDetails().forEach(function (other) {
        other.open = false;
      });
      if (notif) notif.open = false;
      setAccountMenuOpen(false);
      syncHeaderDropdownOpenClasses();
    });
        bar.addEventListener("pointerover", function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      var menu = t.closest(".discord-account-menu");
      if (!menu || !bar.contains(menu)) return;
      var related = ev.relatedTarget;
      if (related && menu.contains(related)) return;
            if (notif && notif.open) return;
      getSnavDetails().forEach(function (other) {
        other.open = false;
      });
      closeLangMenu();
      setAccountMenuOpen(true);
    });
    bar.addEventListener("pointerout", function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      var menu = t.closest(".discord-account-menu");
      if (!menu || !bar.contains(menu)) return;
      var related = ev.relatedTarget;
      if (related && menu.contains(related)) return;
      setAccountMenuOpen(false);
    });
    bar.addEventListener("focusin", function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      if (!t.closest(".discord-account-menu")) return;
      if (notif && notif.open) return;
      getSnavDetails().forEach(function (other) {
        other.open = false;
      });
      closeLangMenu();
      setAccountMenuOpen(true);
    });
    bar.addEventListener("click", function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      if (!t.closest(".discord-account-menu")) return;
      if (!(notif && notif.open)) return;
      notif.open = false;
      getSnavDetails().forEach(function (other) {
        other.open = false;
      });
      closeLangMenu();
      setAccountMenuOpen(true);
      syncHeaderDropdownOpenClasses();
    });
    bar.addEventListener("focusout", function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      var menu = t.closest(".discord-account-menu");
      if (!menu) return;
      var next = ev.relatedTarget;
      if (next && menu.contains(next)) return;
      setAccountMenuOpen(false);
    });
    function pointInside(el, ev) {
      if (!el || typeof ev.clientX !== "number" || typeof ev.clientY !== "number") return false;
      try {
        var r = el.getBoundingClientRect();
        return ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
      } catch (e) {
        return false;
      }
    }
    function eventInsideOpenDropdown(openEl, ev) {
      if (!openEl) return false;
      var t = ev.target;
      if (t && openEl.contains(t)) return true;
      return pointInside(openEl, ev);
    }
    function closeAllHeaderDropdowns() {
      getSnavDetails().forEach(function (d) {
        d.open = false;
      });
      var liveNotif = document.getElementById("vc-notif-dropdown") || notif;
      if (liveNotif) liveNotif.open = false;
      closeLangMenu();
      syncHeaderDropdownOpenClasses();
    }
    document.addEventListener(
      "pointerdown",
      function (ev) {
        if (typeof ev.button === "number" && ev.button !== 0) return;
        var t = ev.target;
        if (!t || !t.closest) return;
        var opens = Array.prototype.slice.call(
          bar.querySelectorAll("details.vc-snav-details[open]"),
        );
                var liveNotif = document.getElementById("vc-notif-dropdown");
        if (liveNotif && liveNotif.open) opens.push(liveNotif);
        if (!opens.length) return;
        for (var i = 0; i < opens.length; i++) {
          if (eventInsideOpenDropdown(opens[i], ev)) return;
        }
                if (t.closest && t.closest("summary.vc-notif-summary, .vc-notif-summary")) return;
        closeAllHeaderDropdowns();
      },
      true,
    );
    window.addEventListener("storage", function (ev) {
      if (!ev || ev.key !== HEADER_MENU_SYNC_KEY || !ev.newValue) return;
      var payload = null;
      try {
        payload = JSON.parse(ev.newValue);
      } catch (e) {
        payload = null;
      }
      if (!payload || payload.src === localWindowId) return;
      closeAllHeaderDropdowns();
    });
    syncHeaderDropdownOpenClasses();
    ensureTicketsInRichiesteNav();
    linkifyTicketMentions(document);
    document.addEventListener("vc:langchange", function () {
      dedupeTicketsInRichiesteNav();
      linkifyTicketMentions(document);
      try {
        if (typeof window.__vcMobileNavRebuild === "function") window.__vcMobileNavRebuild();
      } catch (eNavLang) {}
    });
    markSnavDetailsCurrentFromLocation();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initHeaderNavAccordion);
  } else {
    initHeaderNavAccordion();
  }
})();
(function () {
    var TIKTOK_PREVIEW_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43V7.36a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.21z"/></svg>';
  var DISCORD_PREVIEW_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.419 0 1.334-.956 2.419-2.157 2.419zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.419 0 1.334-.946 2.419-2.157 2.419z"/></svg>';

  function siteDisplayNameForPreview() {
    try {
      var w = document.querySelector(".vc-premium-footer__wordmark");
      var t = w && w.textContent ? String(w.textContent).trim() : "";
      if (t) return t;
    } catch (e) {}
    return "Vinili & Caffè";
  }

  function discordInvitePathNorm(cleanPath) {
    return String(cleanPath || "").trim().toLowerCase();
  }

  function isSiteDiscordInvite(cleanPath) {
    var path = discordInvitePathNorm(cleanPath);
    if (!path) return false;
    if (path.indexOf("viniliecaffe") !== -1) return true;
    var siteInvite = "";
    try {
      var live = window.__VC_LIVE;
      if (live && live.inviteCode) siteInvite = String(live.inviteCode).trim().toLowerCase();
    } catch (e) {}
    return Boolean(siteInvite && (path === siteInvite || path.indexOf(siteInvite + "-") === 0));
  }

  function discordPreviewSubtitle(anchor, cleanPath) {
    var custom = anchor && anchor.getAttribute("data-vc-preview-subtitle");
    if (custom && String(custom).trim()) return String(custom).trim();
    var sponsorCfg = typeof window !== "undefined" ? window.__VC_SITE_SPONSOR_AD : null;
    if (sponsorCfg && sponsorCfg.buttonUrl) {
      try {
        var sponsorUrl = new URL(String(sponsorCfg.buttonUrl), window.location.href);
        var sponsorPath = String(sponsorUrl.pathname || "").replace(/^\/+/, "");
        if (discordInvitePathNorm(sponsorPath) === discordInvitePathNorm(cleanPath)) {
          var sponsorTitle = String(sponsorCfg.title || "").trim();
          if (sponsorTitle) return "Entra su " + sponsorTitle;
        }
      } catch (e) {}
    }
    if (isSiteDiscordInvite(cleanPath)) return "Entra su " + siteDisplayNameForPreview();
    return "Server Discord";
  }

  function socialPreviewHandleFromCleanPath(cleanPath) {
    var seg = String(cleanPath || "").split("/")[0] || "";
    if (!seg) return "";
    return seg.charAt(0) === "@" ? seg : "@" + seg;
  }

  function buildSocialPreviewMeta(anchor) {
    var href = String((anchor && anchor.getAttribute("href")) || "").trim();
    if (!href) return null;
    var u;
    try {
      u = new URL(href, window.location.href);
    } catch (e) {
      return null;
    }
    var host = String(u.hostname || "").toLowerCase();
    var path = String(u.pathname || "/");
    var cleanPath = path.replace(/^\/+/, "").replace(/\/+$/, "");
    var handle = socialPreviewHandleFromCleanPath(cleanPath);
    if (host.indexOf("instagram.com") !== -1) {
      return {
        iconClass: "fa fa-instagram",
        title: "Instagram",
        subtitle: handle || "Profilo social",
        urlText: "instagram.com/" + (cleanPath || ""),
      };
    }
    if (host.indexOf("tiktok.com") !== -1) {
      return {
        iconHtml: TIKTOK_PREVIEW_SVG,
        icoExtraClass: "vc-social-preview__ico--tiktok",
        title: "TikTok",
        subtitle: handle || "Profilo social",
        urlText: "tiktok.com/" + (cleanPath || ""),
      };
    }
    if (host === "discord.gg" || host.indexOf("discord.com") !== -1) {
      return {
        iconHtml: DISCORD_PREVIEW_SVG,
        icoExtraClass: "vc-social-preview__ico--discord",
        title: "Discord",
        subtitle: discordPreviewSubtitle(anchor, cleanPath),
        urlText: host + "/" + (cleanPath || ""),
      };
    }
    return null;
  }

  function ensurePreviewNode() {
    var n = document.getElementById("vc-social-preview");
    if (n) return n;
    n = document.createElement("div");
    n.id = "vc-social-preview";
    n.className = "vc-social-preview";
    n.setAttribute("aria-hidden", "true");
    document.body.appendChild(n);
    return n;
  }

  function placePreview(preview, anchor) {
    if (!preview || !anchor || !anchor.getBoundingClientRect) return;
    var rect = anchor.getBoundingClientRect();
    var pw = preview.offsetWidth || 220;
    var ph = preview.offsetHeight || 96;
    var left = rect.left + rect.width / 2 - pw / 2;
    var top = rect.top - ph - 12;
    var maxLeft = window.innerWidth - pw - 10;
    if (left < 10) left = 10;
    if (left > maxLeft) left = maxLeft;
    if (top < 10) top = rect.bottom + 12;
    preview.style.left = Math.round(left) + "px";
    preview.style.top = Math.round(top) + "px";
  }

  function showPreview(anchor) {
    var meta = buildSocialPreviewMeta(anchor);
    if (!meta) return;
    var preview = ensurePreviewNode();
    var icoClass = "vc-social-preview__ico";
    if (meta.icoExtraClass) icoClass += " " + meta.icoExtraClass;
    var icoInner =
      meta.iconHtml && String(meta.iconHtml).trim()
        ? String(meta.iconHtml)
        : '<i class="' + String(meta.iconClass || "") + '" aria-hidden="true"></i>';
    preview.innerHTML =
      '<div class="vc-social-preview__head">' +
      '<span class="' + icoClass + '">' + icoInner + "</span>" +
      '<div class="vc-social-preview__copy">' +
      '<strong class="vc-social-preview__title">' + meta.title + "</strong>" +
      '<span class="vc-social-preview__sub">' + meta.subtitle + "</span>" +
      "</div>" +
      "</div>" +
      '<p class="vc-social-preview__url">' + meta.urlText + "</p>";
    preview.classList.add("is-visible");
    preview.setAttribute("aria-hidden", "false");
    placePreview(preview, anchor);
  }

  function hidePreview() {
    var preview = document.getElementById("vc-social-preview");
    if (!preview) return;
    preview.classList.remove("is-visible");
    preview.setAttribute("aria-hidden", "true");
  }

  function bindSocialPreview(anchor) {
    if (!anchor || anchor.__vcSocialPreviewBound) return;
    anchor.__vcSocialPreviewBound = true;
    anchor.addEventListener("mouseenter", function () {
      if (window.matchMedia && window.matchMedia("(hover: none)").matches) return;
      showPreview(anchor);
    });
    anchor.addEventListener("mouseleave", hidePreview);
    anchor.addEventListener("focus", function () {
      showPreview(anchor);
    });
    anchor.addEventListener("blur", hidePreview);
  }

  window.__vcBindSocialPreview = bindSocialPreview;

  function initSocialPreviews() {
    var links = document.querySelectorAll(
      'a[href*="instagram.com"], a[href*="tiktok.com"], a[href*="discord.gg"], a[href*="discord.com/invite"]',
    );
    for (var i = 0; i < links.length; i += 1) {
      bindSocialPreview(links[i]);
    }
    window.addEventListener("scroll", hidePreview, { passive: true });
    window.addEventListener("resize", hidePreview, { passive: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSocialPreviews);
  } else {
    initSocialPreviews();
  }
})();
(function () {
  var lastY = 0;
  var ticking = false;
  var MIN_DELTA = 6;
  var TOP_EPS = 12;

  function getScrollY() {
    return window.pageYOffset || document.documentElement.scrollTop || 0;
  }

  function setNavScrolled(on) {
    var navShell = document.querySelector("header .vc-nav-shell");
    if (!navShell) return;
    if (on) {
      navShell.classList.add("vc-nav-shell--scrolled");
      document.documentElement.classList.add("vc-nav-shell-scrolled");
    } else {
      navShell.classList.remove("vc-nav-shell--scrolled");
      document.documentElement.classList.remove("vc-nav-shell-scrolled");
    }
  }

  function syncNavScrollState() {
    ticking = false;
    var y = getScrollY();
    if (y <= TOP_EPS) {
      setNavScrolled(false);
      lastY = y;
      return;
    }
    var delta = y - lastY;
    if (delta < -MIN_DELTA) setNavScrolled(true);
    else if (delta > MIN_DELTA) setNavScrolled(false);
    lastY = y;
  }

  function onNavScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(syncNavScrollState);
  }

  function initHeaderScrollState() {
    lastY = getScrollY();
    setNavScrolled(false);
    window.addEventListener("scroll", onNavScroll, { passive: true });
    document.addEventListener("scroll", onNavScroll, { passive: true, capture: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initHeaderScrollState);
  } else {
    initHeaderScrollState();
  }
})();
(function () {
  function prefersReducedMotion() {
    try {
      return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) {
      return false;
    }
  }

  function easeOutQuart(t) {
    return 1 - Math.pow(1 - t, 4);
  }

  function formatIntIt(n) {
    var x = Number(n);
    if (!Number.isFinite(x)) return "0";
    try {
      return Math.round(x).toLocaleString("it-IT");
    } catch (e) {
      return String(Math.round(x));
    }
  }

  function normalizeValue(raw, kind) {
    var n = Number(raw);
    if (!Number.isFinite(n) || n < 0) n = 0;
    if (kind === "hours") return n / 3600;
    return n;
  }

  function formatMult(m) {
    var x = Number(m);
    if (!Number.isFinite(x) || x <= 0) return "x1";
    if (Math.abs(x - Math.round(x)) < 0.02) return "x" + String(Math.round(x));
    return "x" + String(x.toFixed(1)).replace(".", ",");
  }

  function formatValue(raw, kind) {
    var n = Number(raw);
    if (!Number.isFinite(n) || n < 0) n = 0;
    if (kind === "hours") return String(n.toFixed(1)).replace(".", ",") + "h";
    if (kind === "percent") return String(Math.round(n)) + "%";
    if (kind === "plain") return String(Math.round(n));
    if (kind === "mult") return formatMult(n);
    return formatIntIt(n);
  }

  function readKind(node) {
    return String(node.getAttribute("data-vc-count-kind") || "int");
  }

  function readTarget(node) {
    return normalizeValue(node.getAttribute("data-vc-count-value"), readKind(node));
  }

  function readDuration(node) {
    var ms = Number(node.getAttribute("data-vc-count-duration"));
    if (!Number.isFinite(ms) || ms <= 0) return 320;
    return ms;
  }

  function canRepeat(node) {
    return String(node.getAttribute("data-vc-count-repeat") || "true").toLowerCase() !== "false";
  }

  function stopAnimation(node) {
    if (node && node._vcCountRaf) {
      cancelAnimationFrame(node._vcCountRaf);
      node._vcCountRaf = null;
    }
  }

  function animateNode(node, from, to, kind, durationMs) {
    if (!node) return;
    stopAnimation(node);
    if (prefersReducedMotion()) {
      node.textContent = formatValue(to, kind);
      node.setAttribute("data-vc-count-current", String(to));
      return;
    }
    if (Math.abs(from - to) < 0.001) {
      node.textContent = formatValue(to, kind);
      node.setAttribute("data-vc-count-current", String(to));
      return;
    }
    var start = performance.now();
    function frame(now) {
      var t = Math.min(1, (now - start) / durationMs);
      var eased = easeOutQuart(t);
      var current = from + (to - from) * eased;
      node.textContent = formatValue(current, kind);
      if (t < 1) {
        node._vcCountRaf = requestAnimationFrame(frame);
      } else {
        node.textContent = formatValue(to, kind);
        node.setAttribute("data-vc-count-current", String(to));
        node._vcCountRaf = null;
      }
    }
    node._vcCountRaf = requestAnimationFrame(frame);
  }

  function resetNode(node) {
    if (!node || !canRepeat(node)) return;
    stopAnimation(node);
    var kind = readKind(node);
    node.textContent = formatValue(0, kind);
    node.setAttribute("data-vc-count-current", "0");
    node.setAttribute("data-vc-count-visible", "false");
  }

  function playNode(node) {
    if (!node) return;
    var kind = readKind(node);
    var to = readTarget(node);
    node.setAttribute("data-vc-count-visible", "true");
    var fromRaw = node.getAttribute("data-vc-count-current");
    var from = normalizeValue(fromRaw, kind);
    if (!Number.isFinite(from)) from = 0;
    animateNode(node, from, to, kind, readDuration(node));
  }

  function createObserver() {
    if (typeof IntersectionObserver === "undefined") return null;
    return new IntersectionObserver(
      function (entries) {
        for (var i = 0; i < entries.length; i += 1) {
          var entry = entries[i];
          if (!entry.isIntersecting || entry.intersectionRatio < 0.35) {
            resetNode(entry.target);
            continue;
          }
          playNode(entry.target);
        }
      },
      {
        root: null,
        rootMargin: "0px 0px -8% 0px",
        threshold: [0, 0.12, 0.2, 0.35, 0.5, 0.75, 1],
      },
    );
  }

  var observer = createObserver();

  function registerNode(node) {
    if (!node) return;
    if (!observer) {
      playNode(node);
      return;
    }
    observer.observe(node);
  }

  function refresh(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var nodes = scope.querySelectorAll("[data-vc-countup]");
    for (var i = 0; i < nodes.length; i += 1) {
      registerNode(nodes[i]);
    }
  }

  function set(node, rawValue, kind) {
    if (!node) return;
    node.setAttribute("data-vc-countup", "true");
    node.setAttribute("data-vc-count-value", String(Number(rawValue) || 0));
    if (kind) node.setAttribute("data-vc-count-kind", String(kind));
    registerNode(node);
    if (!observer) {
      playNode(node);
      return;
    }
    var rect = node.getBoundingClientRect();
    var vh = window.innerHeight || document.documentElement.clientHeight || 0;
    var visible = rect.bottom > 0 && rect.top < vh * 0.92;
    if (visible) playNode(node);
    else resetNode(node);
  }

  window.VCCountUp = {
    refresh: refresh,
    set: set,
    reset: resetNode,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      refresh(document);
    });
  } else {
    refresh(document);
  }
})();
(function () {
  var STORAGE_PREFIX = "vc_notifications_v1:";
  var DISMISSED_PREFIX = "vc_notifications_dismissed_v1:";
  var NOTIF_SYNC_KEY = "vc_notifications_sync_v1";
  var PENDING_READ_PREFIX = "vc_notifications_pending_read_v1:";
  var MARK_ALL_AT_PREFIX = "vc_notifications_mark_all_at_v1:";
  var CLEAR_ALL_AT_PREFIX = "vc_notifications_clear_all_at_v1:";
  var TOASTED_PREFIX = "vc_notifications_toasted_v1:";
  var CLICK_READ_KEY = "vc_notifications_click_read_v1";
  var SW_PENDING_READ_CACHE = "vc-notif-pending-read-v1";
  var SW_PENDING_READ_URL = "/__vc/pending-notif-read";
  var SW_PENDING_NAV_CACHE = "vc-pending-nav-v1";
  var SW_PENDING_NAV_URL = "/__vc/pending-nav";
  var pendingNavPollTimer = 0;
  var pendingNavApplying = false;
  var PENDING_LOGIN_NOTIF_KEY = "vc_pending_login_notification_v1";
  var NOTIFICATIONS_PATH = "/notifications/";
  var DEMO_ID = "__vc_ephemeral_demo__";
  var ephemeralDemo = null;
  var currentUserId = "";
  var siteNotifsTimer = null;
  var siteRealtimeWs = null;
  var siteRealtimeWsReconnectTimer = null;
  var SITE_NOTIFS_POLL_MS = 30000;
  var SITE_NOTIFS_POLL_HIDDEN_MS = 90000;
  var siteNotifsVisibilityTimer = null;
  var notifPeerSyncTimer = null;
  var notifSyncBc = null;
  var lastNotifRenderSig = "";
  var ignoreSelfNotifSync = 0;
  try {
    notifSyncBc = new BroadcastChannel("vc_notifications_sync_v1");
  } catch (eBc) {
    notifSyncBc = null;
  }
    var NOTIF_FLY_READ_MS = 3400;
    var NOTIF_FLY_ANIM_MS = 280;
  var notifFlyActiveCount = 0;
  var notifInterruptQueue = [];
  var notifInterruptOpen = false;
  var notifInterruptCurrent = null;
  var notifInterruptKeyHandler = null;

  function loaderElReallyBlocking(el) {
    if (!el) return false;
    try {
      if (el.hidden || el.hasAttribute("hidden")) return false;
      if (el.classList && el.classList.contains("vc-staff-loading--hidden")) return false;
      if (el.classList && el.classList.contains("vc-reviews-gate")) return false;
      var cs = window.getComputedStyle(el);
      if (!cs) return false;
      if (cs.display === "none" || cs.visibility === "hidden") return false;
      if (Number(cs.opacity || "1") < 0.05) return false;
      if (cs.pointerEvents === "none") return false;
      var r = el.getBoundingClientRect();
      if (r.width < 24 || r.height < 24) return false;
            if (r.width < window.innerWidth * 0.45 && r.height < window.innerHeight * 0.35) return false;
      return true;
    } catch (eVis) {
      return false;
    }
  }

  function isBlockingLoaderVisible() {
    try {
      var root = document.documentElement;
      var coarse = false;
      try {
        coarse =
          (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
          Number(navigator.maxTouchPoints || 0) > 0;
      } catch (eC) {}
            if (!coarse && root.classList.contains("vc-session-verify-pending")) return true;
      if (root.classList.contains("vc-dash-access-pending")) return true;
            if (root.classList.contains("vc-user-leader-pending")) {
        var ulPend = document.getElementById("vc-ul-loading");
        if (loaderElReallyBlocking(ulPend)) return true;
      }
      if (root.classList.contains("vc-user-profile-pending")) {
        var prPend = document.getElementById("vc-user-profile-loading");
        var bpPend = document.querySelector("body > .vc-user-profile-loader");
        if (loaderElReallyBlocking(prPend) || loaderElReallyBlocking(bpPend)) return true;
      }
    } catch (e0) {}
    var tr = document.getElementById("vc-page-transition");
    if (tr && tr.classList.contains("vc-page-transition--on")) {
      try {
        var trCs = window.getComputedStyle(tr);
        if (trCs && trCs.display !== "none" && trCs.visibility !== "hidden" && trCs.pointerEvents !== "none") {
          return true;
        }
      } catch (eTrVis) {
        return true;
      }
    }
    try {
      var coarse2 =
        (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
        Number(navigator.maxTouchPoints || 0) > 0;
      if (!coarse2) {
        var ov = document.querySelector(".vc-session-verify-overlay:not(.vc-session-verify-overlay--hidden)");
        if (ov) return true;
      }
    } catch (eOv) {}
                try {
      var uls = document.querySelectorAll(".vc-ul-loading");
      for (var ui = 0; ui < uls.length; ui += 1) {
        if (loaderElReallyBlocking(uls[ui])) return true;
      }
    } catch (eUl) {
      if (document.querySelector('.vc-ul-loading[data-vc-loader-blocking="1"]')) return true;
    }
    try {
      var rankL = document.getElementById("vc-rank-customize-loading");
      if (loaderElReallyBlocking(rankL)) return true;
    } catch (eRk) {
      if (document.querySelector("#vc-rank-customize-loading:not([hidden])")) return true;
    }
    var staffInboxLoading = document.getElementById("vc-staff-inbox-loading");
    if (loaderElReallyBlocking(staffInboxLoading)) return true;
    var profileLoading = document.getElementById("vc-user-profile-loading");
    if (loaderElReallyBlocking(profileLoading)) return true;
    try {
      var bodyProf = document.querySelector("body > .vc-user-profile-loader");
      if (loaderElReallyBlocking(bodyProf)) return true;
    } catch (eBp) {}
            try {
      var view = document.getElementById("vc-user-profile-view");
      if (view && !view.hidden) {
        var loaders = view.querySelectorAll(":scope > .vc-user-profile-loader, :scope > [data-vc-profile-boot]");
        for (var li = 0; li < loaders.length; li += 1) {
          var L = loaders[li];
          if (L.hidden || L.hasAttribute("hidden")) continue;
          if (L.closest && L.closest("[data-vc-profile-staff-pane], .vc-user-profile-staff-pane")) continue;
          return true;
        }
      }
    } catch (eLoad) {}
            return false;
  }

  try {
    window.__vcLoaderElReallyBlocking = loaderElReallyBlocking;
    window.__vcIsBlockingLoaderVisible = isBlockingLoaderVisible;
  } catch (eVisExport) {}

  function syncLoaderBlockingLiveClass() {
        var live = false;
    try {
      var nodes = document.querySelectorAll(
        '.vc-ul-loading[data-vc-loader-blocking="1"], #vc-roles-loading[data-vc-loader-blocking="1"]',
      );
      for (var i = 0; i < nodes.length; i += 1) {
        if (loaderElReallyBlocking(nodes[i])) {
          live = true;
          break;
        }
      }
    } catch (eScan) {}
    if (!live) {
      try {
        var profLoad = document.getElementById("vc-user-profile-loading");
        if (loaderElReallyBlocking(profLoad)) live = true;
      } catch (eProf) {}
    }
    if (!live) {
      try {
        var bodyProf = document.querySelector("body > .vc-user-profile-loader:not([hidden])");
        if (loaderElReallyBlocking(bodyProf)) live = true;
      } catch (eBp) {}
    }
    try {
      document.documentElement.classList.toggle("vc-loader-blocking-live", live);
    } catch (eCls) {}
    return live;
  }

  try {
    window.__vcSyncLoaderBlockingLiveClass = syncLoaderBlockingLiveClass;
  } catch (eLiveExport) {}

  function resetScrollAfterOverlay() {
    try {
      var h = String(location.hash || "").replace(/^#/, "");
      if (h && h.indexOf("access_token=") !== 0) return;
      var y =
        window.pageYOffset ||
        (document.documentElement && document.documentElement.scrollTop) ||
        (document.body && document.body.scrollTop) ||
        0;
      if (y > 8) return;
      window.scrollTo(0, 0);
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    } catch (eScr) {}
  }

  var wasPageLoaderVisible = false;
  var loaderScrollLockSideEffects = false;
  var loaderScrollLockMoTimer = 0;
  var loaderScrollListenersBound = false;
  var scrollPinned = false;
  var scrollPinSavedY = 0;
  var scrollPinSoft = false;

  function pageScrollY() {
    try {
      return (
        window.pageYOffset ||
        (document.documentElement && document.documentElement.scrollTop) ||
        (document.body && document.body.scrollTop) ||
        0
      );
    } catch (eY) {
      return 0;
    }
  }

  /* notifTicketScrollStay1: overflow-lock / focus / portal must not jump page to top */
  function restorePageScrollY(y) {
    var n = Math.max(0, Number(y) || 0);
    try {
      window.scrollTo(0, n);
      if (document.documentElement) document.documentElement.scrollTop = n;
      if (document.body) document.body.scrollTop = n;
    } catch (eScr) {}
  }

  function holdPageScroll(ms) {
    var y = pageScrollY();
    function restore() {
      if (Math.abs(pageScrollY() - y) > 1) restorePageScrollY(y);
    }
    restore();
    try {
      window.requestAnimationFrame(function () {
        restore();
        window.requestAnimationFrame(restore);
      });
    } catch (eRaf) {
      restore();
    }
    window.setTimeout(restore, 0);
    window.setTimeout(restore, 48);
    if (ms && ms > 48) window.setTimeout(restore, Math.min(Number(ms) || 0, 320));
    return y;
  }

  function isPageScrollFrozen() {
    if (isBlockingLoaderVisible()) return true;
    try {
      var root = document.documentElement;
      if (root.classList.contains("vc-rank-customize-pending")) return true;
      if (root.classList.contains("vc-mobile-nav-open")) {
        var navDr = document.getElementById("vc-mobile-nav-drawer");
        if (navDr && navDr.classList.contains("vc-mobile-nav-drawer--open")) return true;
      }
      if (root.classList.contains("vc-user-leader-pending")) {
        var ulFr = document.getElementById("vc-ul-loading");
        if (loaderElReallyBlocking(ulFr)) return true;
      }
      if (root.classList.contains("vc-user-profile-pending")) {
        var prFr = document.getElementById("vc-user-profile-loading");
        var bpFr = document.querySelector("body > .vc-user-profile-loader");
        if (loaderElReallyBlocking(prFr) || loaderElReallyBlocking(bpFr)) return true;
      }
      try {
        var coarseFreeze =
          (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
          Number(navigator.maxTouchPoints || 0) > 0;
        if (!coarseFreeze && root.classList.contains("vc-session-verify-pending")) return true;
      } catch (eSesF) {}
            if (isNotifPanelChromeOpen(root)) {
        var ddFrozen = document.getElementById("vc-notif-dropdown");
        if (ddFrozen && (ddFrozen.open || ddFrozen.hasAttribute("open"))) return true;
      }
      if (root.classList.contains("vc-staff-stat-sheet-open")) return true;
      if (root.classList.contains("vc-staff-manage-sheet-open")) return true;
      if (root.classList.contains("vc-staff-reso-sheet-open")) return true;
      if (root.classList.contains("vc-staff-datepicker-open")) return true;
      if (root.classList.contains("vc-dialog-open")) return true;
      if (root.classList.contains("vc-dash-confirm-open")) return true;
    } catch (eFrozen) {}
    try {
      if (document.querySelector(".vc-dialog.is-open, #vc-site-dialog.is-open:not([hidden]), .vc-dash-confirm.is-open")) {
        return true;
      }
    } catch (eDlg) {}
    return false;
  }

  function isCoarsePointerDevice() {
    try {
      if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return true;
    } catch (e0) {}
    try {
      if (
        window.matchMedia &&
        window.matchMedia("(hover: none)").matches &&
        Number(navigator.maxTouchPoints || 0) > 0
      ) {
        return true;
      }
    } catch (e1) {}
    return Number(navigator.maxTouchPoints || 0) > 0;
  }

  function isStandalonePwaLocal() {
    try {
      if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true;
    } catch (e0) {}
    try {
      if (window.matchMedia && window.matchMedia("(display-mode: fullscreen)").matches) return true;
    } catch (e1) {}
    return Boolean(navigator.standalone);
  }

  function pinPageScroll(opts) {
    var body = document.body;
    if (!body) return;
    opts = opts || {};
    var soft = Boolean(opts.soft);
    var phonePin = false;
    var notifChromeOpen = false;
    try {
      phonePin = isCoarsePointerDevice() || isStandalonePwaLocal();
      if (phonePin) soft = true;
    } catch (eSoftForce) {
      soft = true;
      phonePin = true;
    }
    try {
      /* notifSidebar4/5: notif drawer/sheet must never use position:fixed — fights CSS overflow
         lock + PTR restore → continuous scroll jitter. notifSidebar5: panel-body scrolls under
         overflow-only lock (no touch-action:none on panel). */
      notifChromeOpen = isNotifPanelChromeOpen(document.documentElement);
      if (notifChromeOpen) {
        phonePin = true;
        soft = true;
        opts.forcePhoneLock = true;
      }
    } catch (eNotifPin) {}
    if (!scrollPinned) {
      scrollPinSavedY = pageScrollY();
      scrollPinned = true;
    }
    scrollPinSoft = soft;
    try {
      /* phoneSheetPtrLock1: on phone never use position:fixed (breaks unlock),
         but still lock overflow/overscroll so PTR + page scroll behind sheets die.
         phoneNavTapFix1: hamburger alone must NOT soft-lock — iOS then eats tile taps.
         CSS `.vc-mobile-nav-open` already locks overflow for the drawer. */
      if (phonePin) {
        var needPhoneOverflowLock = Boolean(opts.forcePhoneLock);
        try {
          var rootPin = document.documentElement;
          needPhoneOverflowLock =
            needPhoneOverflowLock ||
            isNotifPanelChromeOpen(rootPin) ||
            rootPin.classList.contains("vc-staff-manage-sheet-open") ||
            rootPin.classList.contains("vc-staff-stat-sheet-open") ||
            rootPin.classList.contains("vc-staff-reso-sheet-open") ||
            rootPin.classList.contains("vc-staff-datepicker-open") ||
            rootPin.classList.contains("vc-dialog-open") ||
            rootPin.classList.contains("vc-dash-confirm-open") ||
            rootPin.classList.contains("vc-loading-scroll-lock") ||
            rootPin.classList.contains("vc-loader-blocking-live") ||
            (rootPin.classList.contains("vc-page-cine-boot") &&
              !rootPin.classList.contains("vc-page-cine-ready")) ||
            rootPin.classList.contains("vc-user-leader-pending") ||
            rootPin.classList.contains("vc-user-profile-pending") ||
            rootPin.classList.contains("vc-rank-customize-pending") ||
            rootPin.classList.contains("vc-session-verify-pending") ||
            rootPin.classList.contains("vc-notif-staff-loading");
        } catch (eNeedPin) {
          needPhoneOverflowLock = true;
        }
        if (!needPhoneOverflowLock) {
          try {
            document.documentElement.classList.remove("vc-scroll-soft-lock");
          } catch (eSoftOff) {}
          scrollPinned = false;
          scrollPinSoft = false;
          return;
        }
        document.documentElement.style.setProperty("overflow", "hidden", "important");
        document.documentElement.style.setProperty("overscroll-behavior", "none", "important");
        document.documentElement.style.removeProperty("touch-action");
        body.style.removeProperty("position");
        body.style.removeProperty("left");
        body.style.removeProperty("right");
        body.style.removeProperty("top");
        body.style.removeProperty("width");
        body.style.setProperty("overflow", "hidden", "important");
        body.style.setProperty("overscroll-behavior", "none", "important");
        body.style.removeProperty("touch-action");
        try {
          document.documentElement.classList.add("vc-scroll-soft-lock");
        } catch (eSoftCls) {}
        /* notifTicketScrollStay1: soft overflow-lock can reset window scroll on iOS/Chrome */
        restorePageScrollY(scrollPinSavedY);
        try {
          window.requestAnimationFrame(function () {
            restorePageScrollY(scrollPinSavedY);
          });
        } catch (ePinRaf) {}
        return;
      }
      document.documentElement.style.setProperty("overflow", "hidden", "important");
      document.documentElement.style.setProperty("overscroll-behavior", "none", "important");
      if (soft) {
        document.documentElement.style.removeProperty("touch-action");
      } else {
        document.documentElement.style.setProperty("touch-action", "none", "important");
      }
      body.style.setProperty("position", "fixed", "important");
      body.style.setProperty("left", "0", "important");
      body.style.setProperty("right", "0", "important");
      body.style.setProperty("width", "100%", "important");
      body.style.setProperty("top", "-" + scrollPinSavedY + "px", "important");
      body.style.setProperty("overflow", "hidden", "important");
      body.style.setProperty("overscroll-behavior", "none", "important");
      if (soft) {
        body.style.setProperty("touch-action", "pan-y", "important");
      } else {
        body.style.setProperty("touch-action", "none", "important");
      }
    } catch (ePin) {}
  }

  function stripPhoneInlineScrollLocks() {
    var phone = false;
    try {
      phone = isCoarsePointerDevice() || isStandalonePwaLocal();
    } catch (ePh) {
      phone = true;
    }
    if (!phone) return;
    var root = document.documentElement;
    var body = document.body;
    var mustLock = false;
    try {
      var ddLive = document.getElementById("vc-notif-dropdown");
      var notifReallyOpen = Boolean(
        ddLive && (ddLive.open || ddLive.hasAttribute("open")) && isNotifPanelChromeOpen(root),
      );
      var inboxLoad = document.getElementById("vc-staff-inbox-loading");
      var inboxLive =
        Boolean(inboxLoad) &&
        !inboxLoad.hidden &&
        !inboxLoad.hasAttribute("hidden") &&
        !inboxLoad.classList.contains("vc-staff-loading--hidden");
      mustLock =
        root.classList.contains("vc-mobile-nav-open") ||
        notifReallyOpen ||
        root.classList.contains("vc-dialog-open") ||
        root.classList.contains("vc-staff-manage-sheet-open") ||
        root.classList.contains("vc-staff-reso-sheet-open") ||
        root.classList.contains("vc-staff-stat-sheet-open") ||
        (root.classList.contains("vc-notif-staff-loading") && inboxLive);
      if (root.classList.contains("vc-user-leader-pending")) {
        var ulStrip = document.getElementById("vc-ul-loading");
        if (
          ulStrip &&
          !ulStrip.hidden &&
          !ulStrip.hasAttribute("hidden") &&
          (typeof loaderElReallyBlocking !== "function" || loaderElReallyBlocking(ulStrip))
        ) {
          mustLock = true;
        }
      }
    } catch (eMust) {
      mustLock = false;
    }
    if (mustLock) return;
    try {
      if (typeof isBlockingLoaderVisible === "function" && isBlockingLoaderVisible()) return;
      if (isLoaderScrollLocked()) return;
    } catch (eLoaderKeep) {}
    try {
      root.style.removeProperty("overflow");
      root.style.removeProperty("overscroll-behavior");
      root.style.removeProperty("touch-action");
      root.classList.remove("vc-scroll-soft-lock", "vc-loading-scroll-lock");
    } catch (eR) {}
    if (body) {
      try {
        body.style.removeProperty("position");
        body.style.removeProperty("left");
        body.style.removeProperty("right");
        body.style.removeProperty("top");
        body.style.removeProperty("width");
        body.style.removeProperty("overflow");
        body.style.removeProperty("overscroll-behavior");
        body.style.removeProperty("touch-action");
      } catch (eB) {}
    }
    scrollPinned = false;
    scrollPinSoft = false;
  }

  function unpinPageScroll() {
    var body = document.body;
    var y = scrollPinSavedY;
    var wasPinned = scrollPinned;
    scrollPinned = false;
    scrollPinSoft = false;
    scrollPinSavedY = 0;
    try {
      document.documentElement.classList.remove("vc-scroll-soft-lock");
    } catch (eSoftClsOff) {}
    try {
      document.documentElement.style.removeProperty("overflow");
      document.documentElement.style.removeProperty("overscroll-behavior");
      document.documentElement.style.removeProperty("touch-action");
    } catch (eUnpinHtml) {}
    if (body) {
      try {
        body.style.removeProperty("position");
        body.style.removeProperty("left");
        body.style.removeProperty("right");
        body.style.removeProperty("top");
        body.style.removeProperty("width");
        body.style.removeProperty("overflow");
        body.style.removeProperty("overscroll-behavior");
        body.style.removeProperty("touch-action");
      } catch (eUnpinStyle) {}
    }
    try {
      stripPhoneInlineScrollLocks();
    } catch (eStrip) {}
    if (wasPinned) {
      try {
        window.scrollTo(0, y);
      } catch (eUnpin) {}
    }
  }

  try {
    window.__vcPinPageScroll = pinPageScroll;
    window.__vcUnpinPageScroll = unpinPageScroll;
    window.__vcStripPhoneInlineScrollLocks = stripPhoneInlineScrollLocks;
    window.__vcIsPageScrollFrozen = isPageScrollFrozen;
    /* ticketModalScrollStay2: post-confirm postAction must reuse pinned Y, not 0 mid-unpin */
    window.__vcGetPinnedPageScrollY = function () {
      try {
        if (scrollPinned && Number(scrollPinSavedY) > 0) return Number(scrollPinSavedY) || 0;
      } catch (ePinY) {}
      return pageScrollY();
    };
    window.__vcHoldPageScroll = holdPageScroll;
  } catch (ePinExport) {}

  function isLoaderScrollLocked() {
    try {
      var root = document.documentElement;
      if (root.classList.contains("vc-loading-scroll-lock")) return true;
      if (root.classList.contains("vc-loader-blocking-live")) return true;
      if (root.classList.contains("vc-page-cine-boot") && !root.classList.contains("vc-page-cine-ready")) {
        return true;
      }
      if (root.classList.contains("vc-user-leader-pending")) return true;
      if (root.classList.contains("vc-user-profile-pending")) return true;
      if (root.classList.contains("vc-notif-staff-loading")) return true;
    } catch (eLockCls) {}
    return false;
  }

  function isNotifPanelScrollTarget(t) {
    /* notifSidebar5: wheel/touch on panel content must scroll — not be swallowed by guards/PTR */
    try {
      if (!t || !t.closest) return false;
      return Boolean(
        t.closest(
          ".vc-notif-panel-body, .vc-notif-list, .vc-notif-list-wrap, .vc-notif-bell-pane, .vc-notif-bell-inbox, .vc-notif-panel",
        ),
      );
    } catch (eHit) {
      return false;
    }
  }

  function blockLoaderScroll(e) {
    try {
      var tPtr = e && e.target;
      if (isNotifPanelScrollTarget(tPtr)) return;
    } catch (eNotifAllow) {}
    if (window.__vcPtrTracking) {
      /* phoneSheetPtrLock1: if a sheet/modal froze the page, kill PTR mid-gesture */
      try {
        if (typeof isPageScrollFrozen === "function" && isPageScrollFrozen()) {
          try {
            e.preventDefault();
          } catch (ePrevPtr) {}
        }
      } catch (eFr) {}
      return;
    }
    if (!isPageScrollFrozen() && !isLoaderScrollLocked()) return;
    try {
      var t = e && e.target;
      if (t && t.closest) {
        if (
          t.closest(
            ".vc-staff-stat-sheet__body, .vc-staff-stat-sheet__panel, .vc-staff-manage-sheet__panel, .vc-staff-manage-sheet__body, .vc-staff-reso-sheet__body, .vc-staff-reso-sheet__panel, .vc-staff-datepicker.is-sheet, .vc-notif-panel-body, .vc-notif-list, .vc-notif-list-wrap, .vc-notif-bell-pane, .vc-notif-bell-inbox, .vc-notif-panel, .vc-dialog__text, .vc-dialog__field, .vc-dash-confirm__text, .vc-mobile-nav-drawer__scroll",
          )
        ) {
          return;
        }
        if (t.closest(".vc-staff-peer-dock, .vc-notif-mobile-backdrop, .vc-staff-stat-sheet__backdrop, .vc-staff-manage-sheet__backdrop, .vc-dialog__backdrop")) {
          try {
            e.preventDefault();
          } catch (ePrevBg) {}
          return;
        }
      }
    } catch (eAllow) {}
    try {
      e.preventDefault();
    } catch (ePrev) {}
  }

  var loaderScrollGuardOpts = { capture: true, passive: false };

  function bindLoaderScrollGuards(enable) {
    var want = Boolean(enable);
    if (want === loaderScrollListenersBound) return;
    try {
      if (want) {
        document.addEventListener("wheel", blockLoaderScroll, loaderScrollGuardOpts);
        document.addEventListener("touchmove", blockLoaderScroll, loaderScrollGuardOpts);
        loaderScrollListenersBound = true;
      } else {
        document.removeEventListener("wheel", blockLoaderScroll, loaderScrollGuardOpts);
        document.removeEventListener("touchmove", blockLoaderScroll, loaderScrollGuardOpts);
        loaderScrollListenersBound = false;
      }
    } catch (eBind) {
      loaderScrollListenersBound = want;
    }
  }

  function needNonPassiveScrollGuards() {
                try {
      if (isBlockingLoaderVisible()) return true;
      if (isLoaderScrollLocked()) return true;
      var root = document.documentElement;
      if (root.classList.contains("vc-dialog-open")) return true;
      if (root.classList.contains("vc-dash-confirm-open")) return true;
      if (isNotifPanelChromeOpen(root)) return true;
      if (root.classList.contains("vc-staff-manage-sheet-open")) return true;
      if (root.classList.contains("vc-staff-stat-sheet-open")) return true;
      if (root.classList.contains("vc-staff-reso-sheet-open")) return true;
      if (root.classList.contains("vc-staff-datepicker-open")) return true;
                        try {
        var coarseGuard =
          (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
          Number(navigator.maxTouchPoints || 0) > 0;
        if (!coarseGuard && root.classList.contains("vc-session-verify-pending")) return true;
      } catch (eSes) {}
      if (root.classList.contains("vc-dash-access-pending")) return true;
      if (root.classList.contains("vc-rank-customize-pending")) return true;
    } catch (eNeed) {}
    try {
      if (document.querySelector(".vc-dialog.is-open, #vc-site-dialog.is-open:not([hidden]), .vc-dash-confirm.is-open")) {
        return true;
      }
    } catch (eDlg) {}
    return false;
  }

  var lastScrollLockFrozen = null;
  var lastScrollLockOverlay = null;
  var lastScrollLockNeedGuards = null;

  function syncLoaderScrollLock() {
    var frozen = false;
    try {
      frozen = isPageScrollFrozen();
    } catch (eVis) {}
    var on = false;
    try {
      on = isBlockingLoaderVisible();
    } catch (eVis2) {}
    var needGuards = false;
    try {
      needGuards = needNonPassiveScrollGuards();
    } catch (eNeed2) {
      needGuards = Boolean(on);
    }

    var softPin = !needGuards;
    try {
      if (document.documentElement.classList.contains("vc-mobile-nav-open")) softPin = true;
    } catch (eSoftNav) {}
    /* phoneGateLock1: while a blocking loader/boot is up, hard-lock scroll on phone too. */
    var phone = false;
    try {
      phone = isCoarsePointerDevice() || isStandalonePwaLocal();
    } catch (ePh) {
      phone = true;
    }
    var bootPending = false;
    var pendingGate = false;
    try {
      var rootLock = document.documentElement;
      bootPending =
        rootLock.classList.contains("vc-page-cine-boot") &&
        !rootLock.classList.contains("vc-page-cine-ready");
      pendingGate =
        rootLock.classList.contains("vc-user-leader-pending") ||
        rootLock.classList.contains("vc-user-profile-pending") ||
        rootLock.classList.contains("vc-rank-customize-pending") ||
        rootLock.classList.contains("vc-custom-profile-pending") ||
        rootLock.classList.contains("vc-session-verify-pending") ||
        rootLock.classList.contains("vc-notif-staff-loading") ||
        (rootLock.classList.contains("vc-staff-access-pending") &&
          !rootLock.classList.contains("vc-staff-app-revealed"));
    } catch (eGate) {}
    var wantLock = Boolean(on || frozen || bootPending || pendingGate);
    /* phoneNavTapFix1: hamburger alone must not arm loading-scroll-lock / soft-lock.
       CSS `.vc-mobile-nav-open` already freezes page scroll; soft-lock ate iOS tile taps. */
    try {
      var rootNavOnly = document.documentElement;
      var navOnly =
        rootNavOnly.classList.contains("vc-mobile-nav-open") &&
        !on &&
        !bootPending &&
        !pendingGate &&
        !isNotifPanelChromeOpen(rootNavOnly) &&
        !rootNavOnly.classList.contains("vc-staff-manage-sheet-open") &&
        !rootNavOnly.classList.contains("vc-staff-stat-sheet-open") &&
        !rootNavOnly.classList.contains("vc-staff-reso-sheet-open") &&
        !rootNavOnly.classList.contains("vc-staff-datepicker-open") &&
        !rootNavOnly.classList.contains("vc-dialog-open") &&
        !rootNavOnly.classList.contains("vc-dash-confirm-open");
      if (navOnly) wantLock = false;
    } catch (eNavOnly) {}
    if (phone && wantLock) softPin = false;
    else if (phone) softPin = true;

    if (phone && !wantLock) {
      if (scrollPinned) unpinPageScroll();
      try {
        document.documentElement.classList.remove("vc-ui-scroll-lock", "vc-scroll-soft-lock");
        document.documentElement.classList.remove("vc-loading-scroll-lock");
      } catch (ePhLock) {}
      bindLoaderScrollGuards(false);
    } else {
      if (wantLock) pinPageScroll({ soft: softPin });
      else if (scrollPinned) unpinPageScroll();
      try {
        document.documentElement.classList.remove("vc-ui-scroll-lock");
      } catch (eUiLockOff) {}
      try {
        document.documentElement.classList.toggle("vc-loading-scroll-lock", wantLock);
      } catch (eLock) {}
      var guardsForBind = needGuards || wantLock;
      try {
        if (document.documentElement.classList.contains("vc-mobile-nav-open") && !on && !bootPending) {
          guardsForBind = false;
        }
      } catch (eGuardNav) {}
      bindLoaderScrollGuards(guardsForBind);
    }

    if (
      frozen === lastScrollLockFrozen &&
      on === lastScrollLockOverlay &&
      needGuards === lastScrollLockNeedGuards
    ) {
      return;
    }
    lastScrollLockFrozen = frozen;
    lastScrollLockOverlay = on;
    lastScrollLockNeedGuards = needGuards;
    if (wasPageLoaderVisible && !on) resetScrollAfterOverlay();
    wasPageLoaderVisible = on;
    if (on) {
      if (!loaderScrollLockSideEffects) {
        loaderScrollLockSideEffects = true;
        hideNotifsForLoader();
      }
    } else {
      loaderScrollLockSideEffects = false;
      try {
        flushNotifInterruptQueue();
      } catch (eFlush) {}
    }
    try {
      syncLoaderBlockingLiveClass();
    } catch (eLiveSync) {}
  }

  function scheduleLoaderScrollLock() {
    if (loaderScrollLockMoTimer) return;
    loaderScrollLockMoTimer = setTimeout(function () {
      loaderScrollLockMoTimer = 0;
      syncLoaderScrollLock();
    }, 48);
  }

  try {
    window.__vcSyncLoaderScrollLock = syncLoaderScrollLock;
  } catch (eSyncExport) {}

  function closeNotifDropdownForLoader() {
    var dd = document.getElementById("vc-notif-dropdown");
    if (dd && dd.open) {
      try {
        dd.open = false;
        dd.removeAttribute("open");
      } catch (e0) {}
    }
    try {
      document.documentElement.classList.remove(
        "vc-notif-dropdown-open",
        "vc-notif-sheet-open",
        "vc-notif-drawer-open",
        "vc-notif-overlay-active",
      );
    } catch (e1) {}
  }

  function isNotifPanelChromeOpen(rootEl) {
    var root = rootEl || document.documentElement;
    try {
      return (
        root.classList.contains("vc-notif-sheet-open") ||
        root.classList.contains("vc-notif-drawer-open")
      );
    } catch (eOpen) {
      return false;
    }
  }

  function dismissNotifFlyToasts() {
    var cards = document.querySelectorAll(".vc-notif-fly-card");
    var i;
    for (i = 0; i < cards.length; i += 1) {
      try {
        cards[i].remove();
      } catch (e0) {}
    }
    notifFlyActiveCount = 0;
    try {
      hideNotifInterruptForLoader();
    } catch (eHideInt) {}
    try {
      syncGlobalNotifOverlayClass();
    } catch (e1) {}
  }

  function hideNotifsForLoader() {
    dismissNotifFlyToasts();
    closeNotifDropdownForLoader();
  }
  try {
    window.__vcHideNotifsForLoader = hideNotifsForLoader;
  } catch (eHideFn) {}
  try {
    var loaderClassMo = new MutationObserver(function () {
      scheduleLoaderScrollLock();
    });
    loaderClassMo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
        function observeLoaderHidden(el) {
      if (!el || !el.getAttribute) return;
      try {
        loaderClassMo.observe(el, { attributes: true, attributeFilter: ["hidden", "class", "style"] });
      } catch (eObs) {}
    }
    function bindKnownLoaderObservers() {
      var ids = [
        "vc-ul-loading",
        "vc-roles-loading",
        "vc-rank-customize-loading",
        "vc-user-profile-loading",
        "vc-shared-boot-overlay",
        "vc-staff-loading",
        "vc-staff-inbox-loading",
        "vc-page-transition",
      ];
      for (var i = 0; i < ids.length; i++) {
        observeLoaderHidden(document.getElementById(ids[i]));
      }
      try {
        var list = document.querySelectorAll(
          ".vc-ul-loading, body > .vc-user-profile-loader, #vc-user-profile-view > .vc-user-profile-loader, #vc-user-profile-view > [data-vc-profile-boot]",
        );
        for (var j = 0; j < list.length; j++) observeLoaderHidden(list[j]);
      } catch (eList) {}
    }
    bindKnownLoaderObservers();
        try {
      var loaderBirthMo = new MutationObserver(function (muts) {
        var need = false;
        for (var m = 0; m < muts.length; m++) {
          var nodes = muts[m].addedNodes || [];
          for (var n = 0; n < nodes.length; n++) {
            var node = nodes[n];
            if (!node || node.nodeType !== 1) continue;
            var el = node;
            if (
              (el.id && /loading|boot|transition/i.test(el.id)) ||
              (el.classList &&
                (el.classList.contains("vc-ul-loading") ||
                  el.classList.contains("vc-user-profile-loader") ||
                  el.classList.contains("vc-reviews-gate")))
            ) {
              observeLoaderHidden(el);
              need = true;
            }
          }
        }
        if (need) scheduleLoaderScrollLock();
      });
      if (document.body) {
        loaderBirthMo.observe(document.body, { childList: true, subtree: true });
      }
    } catch (eBirth) {}
    syncLoaderScrollLock();
  } catch (eMo) {}
  var notifAudioCtx = null;
  var notifAudioUnlocked = false;
  var DISCORD_ACCESS_TOKEN_KEY = "vc_discord_access_token";
  var baseDocumentTitle = "";
  var lastTabUnreadShown = -1;
  var baseFaviconHref = "";
  var faviconBadgeGen = 0;
  var faviconLinkEl = null;
  var windowAttentionTimer = 0;
  var windowAttentionOn = false;
  var windowAttentionTitle = "";
  var lastUnreadForAttention = 0;
  var attentionFaviconHref = "";
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
  function siteBrandName() {
    try {
      if (window.VcPageTitle && typeof window.VcPageTitle.brand === "function") {
        return window.VcPageTitle.brand();
      }
    } catch (ePt) {}
    try {
      var auth = typeof window !== "undefined" && window.__VC_AUTH ? window.__VC_AUTH : null;
      var n = String((auth && auth.siteName) || "").trim();
      if (n) {
        // ampBakeFix1: bake JS often left &amp; — never show entity in tab title
        return n
          .replace(/&amp;/gi, "&")
          .replace(/&quot;/gi, '"')
          .replace(/&#39;/gi, "'")
          .replace(/&lt;/gi, "<")
          .replace(/&gt;/gi, ">");
      }
    } catch (eAuth) {}
    return "Vinili & Caffè";
  }

    function normalizeBaseDocumentTitle(raw) {
    try {
      if (window.VcPageTitle && typeof window.VcPageTitle.format === "function") {
        return window.VcPageTitle.format(raw);
      }
    } catch (eNorm) {}
    var brand = siteBrandName();
    var cleaned = String(raw || "")
      .trim()
      .replace(/\{\{\s*SITE_NAME\s*\}\}/g, brand)
      .replace(/\{\{[A-Z0-9_]+\}\}/g, "")
      .replace(/^\(\d+\+?(?:\s+notifich[ea])?\)\s+/i, "")
      .replace(/^●\s+/, "")
      .replace(/^Vinili(?:\s*&\s*Caff[eè])?\s*[-–—]\s+/i, "")
      .trim()
      .replace(/\bstaff\b/gi, "Staff");
    if (!cleaned) return brand;
    var pipe = cleaned.indexOf("|");
    if (pipe >= 0) {
      var left = cleaned.slice(0, pipe).trim();
      var right = cleaned.slice(pipe + 1).trim();
      if (!right) return brand;
      if (!left || /^vinili$/i.test(left)) return brand + " | " + right;
      return left + " | " + right;
    }
    return brand + " | " + cleaned;
  }

  function captureBaseDocumentTitle() {
    var raw = String(document.title || "").trim();
    var cleaned = normalizeBaseDocumentTitle(raw);
    if (windowAttentionTimer && windowAttentionTitle) {
      var attn = String(windowAttentionTitle || "").trim();
      if (cleaned === attn || cleaned === normalizeBaseDocumentTitle(attn)) {
        return baseDocumentTitle || cleaned;
      }
    }
    if (!baseDocumentTitle) {
      baseDocumentTitle = cleaned || siteBrandName();
      return baseDocumentTitle;
    }
        if (
      cleaned &&
      cleaned !== baseDocumentTitle &&
      !/^\(\d+\+?(?:\s+notifich[ea])?\)\s+/i.test(raw) &&
      !/^●\s+/.test(raw)
    ) {
      baseDocumentTitle = cleaned;
    }
    return baseDocumentTitle;
  }

    function formatTabTitleWithUnread(unread, base) {
    try {
      if (window.VcPageTitle && typeof window.VcPageTitle.formatWithUnread === "function") {
        return window.VcPageTitle.formatWithUnread(
          unread,
          base || baseDocumentTitle || document.title || siteBrandName(),
        );
      }
    } catch (eFmt) {}
    var n = Math.max(0, Math.floor(Number(unread) || 0));
    var rest = normalizeBaseDocumentTitle(base || baseDocumentTitle || document.title || siteBrandName());
    if (n <= 0) return rest;
    var count = n > 99 ? "99+" : String(n);
    return "(" + count + ") " + rest;
  }

  function resolveFaviconLink() {
    if (faviconLinkEl && faviconLinkEl.isConnected) return faviconLinkEl;
    faviconLinkEl =
      document.querySelector('link[rel="icon"]') ||
      document.querySelector('link[rel="shortcut icon"]');
    if (!faviconLinkEl) {
      faviconLinkEl = document.createElement("link");
      faviconLinkEl.rel = "icon";
      document.head.appendChild(faviconLinkEl);
    }
    if (!baseFaviconHref) {
      baseFaviconHref = String(faviconLinkEl.href || faviconLinkEl.getAttribute("href") || "").trim();
    }
    return faviconLinkEl;
  }

  function drawFaviconBadgeOnCanvas(ctx, size, unread) {
    var label = unread > 99 ? "99+" : String(unread);
    var r = size * 0.22;
    var cx = size - r - size * 0.06;
    var cy = size - r - size * 0.06;
    ctx.beginPath();
    ctx.arc(cx, cy, r + size * 0.04, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(20, 12, 8, 0.92)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "#e11d48";
    ctx.fill();
    ctx.fillStyle = "#fff7ed";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font =
      "700 " +
      Math.max(10, Math.floor(size * (label.length > 2 ? 0.28 : 0.34))) +
      "px system-ui,Segoe UI,sans-serif";
    ctx.fillText(label, cx, cy + size * 0.02);
  }

  function paintPlainFaviconBadge(unread) {
    var size = 64;
    var canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.fillStyle = "#1a120e";
    ctx.fillRect(0, 0, size, size);
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.34, 0, Math.PI * 2);
    ctx.fillStyle = "#0b0908";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.12, 0, Math.PI * 2);
    ctx.fillStyle = "#d4a888";
    ctx.fill();
    drawFaviconBadgeOnCanvas(ctx, size, unread);
    try {
      return canvas.toDataURL("image/png");
    } catch (e) {
      return "";
    }
  }

  function updateFaviconBadge(unread) {
    var link = resolveFaviconLink();
    var n = Math.max(0, Math.floor(Number(unread) || 0));
    var gen = ++faviconBadgeGen;
    if (n <= 0) {
      if (baseFaviconHref) link.href = baseFaviconHref;
      return;
    }
    var size = 64;
    var applyDataUrl = function (dataUrl) {
      if (gen !== faviconBadgeGen || !dataUrl) return;
      link.href = dataUrl;
    };
    if (!baseFaviconHref) {
      applyDataUrl(paintPlainFaviconBadge(n));
      return;
    }
    var img = new Image();
    img.decoding = "async";
    try {
      img.crossOrigin = "anonymous";
    } catch (eCo) {}
    img.onload = function () {
      if (gen !== faviconBadgeGen) return;
      try {
        var canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        var ctx = canvas.getContext("2d");
        if (!ctx) {
          applyDataUrl(paintPlainFaviconBadge(n));
          return;
        }
        ctx.clearRect(0, 0, size, size);
        ctx.drawImage(img, 0, 0, size, size);
        drawFaviconBadgeOnCanvas(ctx, size, n);
        applyDataUrl(canvas.toDataURL("image/png"));
      } catch (eDraw) {
        applyDataUrl(paintPlainFaviconBadge(n));
      }
    };
    img.onerror = function () {
      applyDataUrl(paintPlainFaviconBadge(n));
    };
    img.src = baseFaviconHref;
  }

  function syncBrowserTabNotifBadge(unread) {
    var n = Math.max(0, Math.floor(Number(unread) || 0));
    lastUnreadForAttention = n;
    if (windowAttentionTimer) return;
    captureBaseDocumentTitle();
    var want = formatTabTitleWithUnread(n, baseDocumentTitle);
    if (n === lastTabUnreadShown) {
            if (String(document.title || "") !== want) document.title = want;
      return;
    }
    lastTabUnreadShown = n;
    document.title = want;
    if (n > 0) {
      if (typeof navigator.setAppBadge === "function") {
        try {
          navigator.setAppBadge(n > 99 ? 99 : n);
        } catch (eBadge) {}
      }
    } else if (typeof navigator.clearAppBadge === "function") {
      try {
        navigator.clearAppBadge();
      } catch (eClear) {}
    }
    updateFaviconBadge(n);
  }

    try {
    captureBaseDocumentTitle();
    lastTabUnreadShown = -1;
    syncBrowserTabNotifBadge(0);
  } catch (eTitleBoot) {}

  function pageNeedsWindowAttention() {
    if (typeof document.hidden === "boolean" && document.hidden) return true;
    if (document.visibilityState && document.visibilityState !== "visible") return true;
    try {
      if (typeof document.hasFocus === "function" && !document.hasFocus()) return true;
    } catch (eFocus) {}
    return false;
  }

  function paintAttentionFavicon() {
    if (attentionFaviconHref) return attentionFaviconHref;
    try {
      var c = document.createElement("canvas");
      c.width = 64;
      c.height = 64;
      var ctx = c.getContext("2d");
      if (!ctx) return "";
      ctx.fillStyle = "#1a120c";
      ctx.beginPath();
      ctx.arc(32, 32, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e8b86d";
      ctx.beginPath();
      ctx.arc(32, 32, 16, 0, Math.PI * 2);
      ctx.fill();
      attentionFaviconHref = c.toDataURL("image/png");
    } catch (ePaint) {
      attentionFaviconHref = "";
    }
    return attentionFaviconHref;
  }

  function applyAttentionFavicon(on) {
    var href = on ? paintAttentionFavicon() : baseFaviconHref;
    if (!href) return;
    var link = resolveFaviconLink();
    if (link) link.href = href;
  }

  function stopWindowAttention() {
    if (windowAttentionTimer) {
      clearInterval(windowAttentionTimer);
      windowAttentionTimer = 0;
    }
    windowAttentionOn = false;
    windowAttentionTitle = "";
    lastTabUnreadShown = -1;
    syncBrowserTabNotifBadge(lastUnreadForAttention);
  }

  function requestWindowAttention(opts) {
    var title = String((opts && opts.title) || "Nuova notifica")
      .replace(/\s+/g, " ")
      .trim();
    if (title.length > 48) title = title.slice(0, 47) + "…";
    if (!pageNeedsWindowAttention()) return;
    windowAttentionTitle = title;
    if (windowAttentionTimer) return;
    windowAttentionOn = false;
    var tick = function () {
      if (!pageNeedsWindowAttention()) {
        stopWindowAttention();
        return;
      }
      windowAttentionOn = !windowAttentionOn;
      var base = captureBaseDocumentTitle() || "Vinili & Caffè";
      if (windowAttentionOn) {
        document.title = "● " + windowAttentionTitle;
        applyAttentionFavicon(true);
        if (typeof navigator.setAppBadge === "function") {
          try {
            navigator.setAppBadge(Math.max(1, lastUnreadForAttention || 1));
          } catch (eOn) {}
        }
      } else {
        document.title = base;
        applyAttentionFavicon(false);
        if (typeof navigator.clearAppBadge === "function") {
          try {
            navigator.clearAppBadge();
          } catch (eOff) {}
        }
      }
    };
    tick();
    windowAttentionTimer = setInterval(tick, 850);
  }

  window.vcRequestWindowAttention = requestWindowAttention;
  window.addEventListener("focus", stopWindowAttention);
  document.addEventListener("visibilitychange", function () {
    if (!pageNeedsWindowAttention()) stopWindowAttention();
  });

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
  function onNotifStorePeerSync() {
    if (ignoreSelfNotifSync > 0) return;
    lastNotifRenderSig = "";
    render({ force: true });
    if (!normalizeUserId(currentUserId) || !getDiscordAccessToken()) return;
    if (notifPeerSyncTimer) clearTimeout(notifPeerSyncTimer);
    notifPeerSyncTimer = setTimeout(function () {
      notifPeerSyncTimer = null;
      syncSiteNotificationsFromServer();
    }, 450);
  }
  function isNotifStorageSyncKey(key) {
    var k = String(key || "");
    if (!k) return false;
    if (k === NOTIF_SYNC_KEY) return true;
    if (k.indexOf(STORAGE_PREFIX) === 0) return true;
    if (k.indexOf(DISMISSED_PREFIX) === 0) return true;
    if (k.indexOf(PENDING_READ_PREFIX) === 0) return true;
    return false;
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
  function rememberDismissedNotif(item, userId) {
    if (!item) return;
    var uid = normalizeUserId(userId || currentUserId);
    var lid = String((item && item.id) || "").trim();
    if (!lid) return;
    var set = loadDismissedSet(uid);
    set.add(lid);
    var fpId = buildNotifFingerprintId(item, uid, String((item && item.kind) || "info"), String((item && item.openUrl) || ""));
    if (fpId && fpId !== lid) set.add(fpId);
    saveDismissedSet(set, uid);
  }
  function isNotifDismissed(item, uid, dismissed) {
    if (!item) return true;
    var set = dismissed || loadDismissedSet(uid);
    var lid = String((item && item.id) || "").trim();
    if (lid && set.has(lid)) return true;
    var fpId = buildNotifFingerprintId(item, uid, String((item && item.kind) || "info"), String((item && item.openUrl) || ""));
    return Boolean(fpId && set.has(fpId));
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
    function isClientLocalNotifId(id) {
    var s = String(id || "").trim();
    return s.indexOf("auto:") === 0 || s.indexOf("sys:") === 0;
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
  function isPendingRead(id) {
    var sid = String(id || "").trim();
    return Boolean(sid && loadPendingReadMap()[sid]);
  }
  function rememberPendingRead(id) {
    var sid = String(id || "").trim();
    if (!sid) return;
    var map = loadPendingReadMap();
    map[sid] = true;
    savePendingReadMap(map);
  }
  function loadClickReadIds() {
    var merged = [];
    var seen = {};
    function addFrom(raw) {
      try {
        var arr = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(arr)) return;
        for (var i = 0; i < arr.length; i += 1) {
          var id = String(arr[i] || "").trim();
          if (!id || seen[id]) continue;
          seen[id] = true;
          merged.push(id);
        }
      } catch (e) {}
    }
    try {
      addFrom(sessionStorage.getItem(CLICK_READ_KEY));
    } catch (eS) {}
    try {
      addFrom(localStorage.getItem(CLICK_READ_KEY));
    } catch (eL) {}
    return merged;
  }
  function rememberClickRead(id) {
    var sid = String(id || "").trim();
    if (!sid) return;
    var arr = loadClickReadIds();
    if (arr.indexOf(sid) === -1) arr.push(sid);
    var json = JSON.stringify(arr);
    try {
      sessionStorage.setItem(CLICK_READ_KEY, json);
    } catch (eS) {}
    try {
      localStorage.setItem(CLICK_READ_KEY, json);
    } catch (eL) {}
    rememberPendingRead(sid);
  }
  function clearClickReadIds() {
    try {
      sessionStorage.removeItem(CLICK_READ_KEY);
    } catch (eS) {}
    try {
      localStorage.removeItem(CLICK_READ_KEY);
    } catch (eL) {}
  }
  function tryFlushClickReads() {
    var ids = loadClickReadIds();
    if (!ids.length) return;
    if (!normalizeUserId(currentUserId) || !getDiscordAccessToken()) return;
    for (var i = 0; i < ids.length; i += 1) markOneRead(ids[i]);
    clearClickReadIds();
  }
  function consumePendingReadFromSwCache() {
    if (!("caches" in window)) return Promise.resolve();
    return caches
      .open(SW_PENDING_READ_CACHE)
      .then(function (cache) {
        return cache.match(SW_PENDING_READ_URL).then(function (res) {
          if (!res) return;
          return res.json().then(function (data) {
            var ids = Array.isArray(data && data.ids) ? data.ids : [];
            for (var i = 0; i < ids.length; i += 1) rememberClickRead(ids[i]);
            return cache.delete(SW_PENDING_READ_URL);
          });
        });
      })
      .catch(function () {})
      .then(function () {
        tryFlushClickReads();
      });
  }
  function ticketIdFromLocation() {
    try {
      var h = String(location.hash || "").replace(/^#/, "").trim();
      if (/^[a-f0-9]{24}$/i.test(h)) return h.toLowerCase();
      var q = String(new URLSearchParams(location.search || "").get("ticketId") || "").trim();
      if (/^[a-f0-9]{24}$/i.test(q)) return q.toLowerCase();
    } catch (e) {}
    return "";
  }
  function ticketIdFromOpenDest(url, ticketId) {
    var tid = String(ticketId || "").trim().toLowerCase();
    if (/^[a-f0-9]{24}$/i.test(tid)) return tid;
    try {
      var u = new URL(String(url || ""), window.location.origin);
      tid = String(u.searchParams.get("ticketId") || "").trim().toLowerCase();
      if (/^[a-f0-9]{24}$/i.test(tid)) return tid;
      tid = String(u.hash || "").replace(/^#/, "").trim().toLowerCase();
      if (/^[a-f0-9]{24}$/i.test(tid)) return tid;
    } catch (e2) {}
    return "";
  }
  function alreadyOnOpenDest(url, ticketId) {
    var tid = ticketIdFromOpenDest(url, ticketId);
    if (!tid) return false;
    try {
      var path = String(location.pathname || "").replace(/\/+$/, "") || "/";
      if (!/\/tickets$/i.test(path)) return false;
      return ticketIdFromLocation() === tid;
    } catch (e) {
      return false;
    }
  }
  function fallbackTicketDest(ticketId) {
    var tid = String(ticketId || "").trim();
    if (!/^[a-f0-9]{24}$/i.test(tid)) return "";
    return "/tickets/?ticketId=" + encodeURIComponent(tid) + "#" + tid;
  }
  function applyOpenDest(url, ticketId) {
    if (pendingNavApplying) return;
    var dest = String(url || "").trim() || fallbackTicketDest(ticketId);
    if (!dest) return;
    if (alreadyOnOpenDest(dest, ticketId)) return;
    pendingNavApplying = true;
    try {
      if (pendingNavPollTimer) {
        clearInterval(pendingNavPollTimer);
        pendingNavPollTimer = 0;
      }
    } catch (eT) {}
    openNotifDestination(resolveNotifDestUrl(dest), "ticket");
  }
  function consumePendingNavFromSwCache() {
    if (!("caches" in window)) return Promise.resolve(false);
    return caches
      .open(SW_PENDING_NAV_CACHE)
      .then(function (cache) {
        return cache.match(SW_PENDING_NAV_URL).then(function (res) {
          if (!res) return false;
          return res.json().then(function (data) {
            var at = Number(data && data.at) || 0;
            if (at && Date.now() - at > 120000) {
              return cache.delete(SW_PENDING_NAV_URL).then(function () {
                return false;
              });
            }
            var url = String((data && data.url) || "").trim();
            var ticketId = String((data && data.ticketId) || "").trim();
            if (!url) url = fallbackTicketDest(ticketId);
            if (!url) {
              return cache.delete(SW_PENDING_NAV_URL).then(function () {
                return false;
              });
            }
            if (alreadyOnOpenDest(url, ticketId)) {
              return cache.delete(SW_PENDING_NAV_URL).then(function () {
                return false;
              });
            }
            return cache.delete(SW_PENDING_NAV_URL).then(function () {
              applyOpenDest(url, ticketId);
              return true;
            });
          });
        });
      })
      .catch(function () {
        return false;
      });
  }
  function startPendingNavPoll() {
    if (pendingNavPollTimer) return;
    var n = 0;
    pendingNavPollTimer = setInterval(function () {
      n += 1;
      consumePendingNavFromSwCache().then(function (moved) {
        if (moved || n >= 40) {
          try {
            clearInterval(pendingNavPollTimer);
          } catch (eC) {}
          pendingNavPollTimer = 0;
        }
      });
    }, 250);
  }
  function isWatchingTicketChat(ticketId, openUrl) {
    var tid = String(ticketId || "").trim().toLowerCase();
    if (!tid) tid = extractTicketIdFromOpenUrl(openUrl);
    if (!/^[a-f0-9]{24}$/i.test(tid)) return false;
    if (document.visibilityState !== "visible") return false;
    try {
      if (typeof document.hasFocus === "function" && !document.hasFocus()) return false;
    } catch (eFocus) {}
    try {
      var watching = window.__VC_WATCHING_TICKET;
      if (watching && String(watching.id || "").toLowerCase() === tid) return true;
    } catch (e1) {}
    try {
      var path = String(window.location.pathname || "");
      if (path.indexOf("/tickets") === -1) return false;
      var hash = String(window.location.hash || "").replace(/^#/, "").toLowerCase();
      if (hash === tid) return true;
      var q = "";
      try {
        q = String(new URLSearchParams(window.location.search || "").get("ticketId") || "").toLowerCase();
      } catch (eQ) {}
      return q === tid;
    } catch (e2) {
      return false;
    }
  }
  function extractTicketIdFromOpenUrl(openUrl) {
    var raw = String(openUrl || "").trim();
    if (!raw) return "";
    try {
      var u = new URL(raw, window.location.origin);
      var h = String(u.hash || "").replace(/^#/, "").trim().toLowerCase();
      if (/^[a-f0-9]{24}$/i.test(h)) return h;
      var q = String(u.searchParams.get("ticketId") || "").trim().toLowerCase();
      if (/^[a-f0-9]{24}$/i.test(q)) return q;
    } catch (e) {
      var m = raw.match(/#([a-f0-9]{24})\b/i);
      if (m) return String(m[1]).toLowerCase();
    }
    return "";
  }
  function extractTicketIdFromNotif(n) {
    var tid = String((n && n.ticketId) || "").trim().toLowerCase();
    if (/^[a-f0-9]{24}$/i.test(tid)) return tid;
    return extractTicketIdFromOpenUrl(n && n.openUrl);
  }
  function forgetPendingRead(id) {
    var sid = String(id || "").trim();
    if (!sid) return;
    var map = loadPendingReadMap();
    if (!map[sid]) return;
    delete map[sid];
    savePendingReadMap(map);
  }
  function flushPendingReadsToServer() {
    var map = loadPendingReadMap();
    var ids = Object.keys(map);
    if (!ids.length) return;
    markSiteNotificationsReadBatchOnServer(ids);
  }
  function rememberPendingForItem(item) {
    if (!item) return;
    var xid = String(item.id || "").trim();
    if (xid) rememberPendingRead(xid);
    var uid = normalizeUserId(currentUserId);
    var fp = buildNotifFingerprintId(
      item,
      uid,
      String((item && item.kind) || "info"),
      String((item && item.openUrl) || ""),
    );
    if (fp) rememberPendingRead(fp);
  }
  function markAllReadStampKey() {
    var uid = normalizeUserId(currentUserId);
    return MARK_ALL_AT_PREFIX + (uid || "anon");
  }
  function rememberMarkAllReadStamp() {
    try {
      localStorage.setItem(markAllReadStampKey(), String(Date.now()));
    } catch (e) {}
  }
  function isRecentMarkAllRead() {
    try {
      var at = Number(localStorage.getItem(markAllReadStampKey()) || 0);
      return Boolean(at && Date.now() - at < 20000);
    } catch (e) {
      return false;
    }
  }
  function toastedKey() {
    var uid = normalizeUserId(currentUserId);
    return TOASTED_PREFIX + (uid || "anon");
  }
  function loadToastedMap() {
    var map = {};
    try {
      var raw = localStorage.getItem(toastedKey());
      var obj = raw ? JSON.parse(raw) : {};
      if (!obj || typeof obj !== "object") return map;
      var now = Date.now();
      var keep = {};
      for (var k in obj) {
        if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
        var at = Number(obj[k] || 0);
        if (at && now - at < 1000 * 60 * 60 * 48) {
          keep[k] = at;
          map[k] = true;
        }
      }
      if (Object.keys(keep).length !== Object.keys(obj).length) {
        try {
          localStorage.setItem(toastedKey(), JSON.stringify(keep));
        } catch (eW) {}
      }
    } catch (e) {}
    return map;
  }
  function rememberToastedId(id) {
    var sid = String(id || "").trim();
    if (!sid) return;
    try {
      var raw = localStorage.getItem(toastedKey());
      var obj = raw ? JSON.parse(raw) : {};
      if (!obj || typeof obj !== "object") obj = {};
      obj[sid] = Date.now();
      localStorage.setItem(toastedKey(), JSON.stringify(obj));
    } catch (e) {}
  }
  function wasAlreadyToasted(id) {
    var sid = String(id || "").trim();
    if (!sid) return false;
    return Boolean(loadToastedMap()[sid]);
  }
    function shouldPlayNotifAlert(row) {
    if (!row || row.read) return false;
    var id = String(row.id || "").trim();
    if (id && wasAlreadyToasted(id)) return false;
    if (recentlyGotOsPush(row)) return false;
    return true;
  }
  function rememberToastedForDismissPush(p) {
    if (!p || typeof p !== "object") return;
    if (p.all === true) {
      loadStored().forEach(function (x) {
        var xid = String((x && x.id) || "").trim();
        if (xid) rememberToastedId(xid);
      });
      return;
    }
    var sid = String(p.id || "").trim();
    if (sid) rememberToastedId(sid);
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
  function notifDestIsSpecific(dest) {
    var d = String(dest || "").trim();
    if (!d) return false;
    try {
      var u = new URL(d, window.location.origin);
      var path = String(u.pathname || "/").replace(/\/+$/, "") || "/";
      if (path === "/") return Boolean(u.hash && u.hash.length > 1);
      return true;
    } catch (e) {
      return d !== "/";
    }
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

  /* notifCats3: classify personal vs inbox; split tickets/reviews/feedback; Punti tolti subject. */
  /* notifUseful1: Mentions + candidature/appelli personal + SLA */
  var DEDICATED_INBOX_QUEUES = {
    pause: 1,
    candidature: 1,
    appelli: 1,
    resoconti: 1,
    "punti-tolti": 1,
  };
  function inboxQueueIdFromNotifUrl(raw) {
    var s = String(raw || "").trim();
    if (!s) return "";
    try {
      var u = new URL(s, window.location.origin);
      var inbox = String(u.searchParams.get("inbox") || "")
        .trim()
        .toLowerCase();
      return DEDICATED_INBOX_QUEUES[inbox] ? inbox : "";
    } catch (eUrl) {
      var m = s.toLowerCase().match(/[?&]inbox=(pause|candidature|appelli|resoconti|punti-tolti)\b/);
      return m ? m[1] : "";
    }
  }
  function isVoteRegisteredNotifClient(n) {
    if (!n) return false;
    var kind = String(n.kind || "").toLowerCase();
    var title = String(n.title || "");
    var body = String(n.body || "");
    var hay = (title + " " + body).toLowerCase();
    if (kind === "vote_reminder") return false;
    if (/promemoria|puoi votare di nuovo|reminder/.test(hay)) return false;
    if (kind === "vote") return true;
    if (/voto\s+(su\s+)?(top\.?gg|discadia)\s+registrato/.test(hay)) return true;
    if (/voto registrato/.test(hay) && /(top\.?gg|discadia)/.test(hay)) return true;
    return false;
  }
  function notifMetaKey(n) {
    return String((n && (n.dedupeKey || n.id)) || "").toLowerCase();
  }
  function isPuntiToltiSubjectNotifClient(n) {
    if (!n) return false;
    var key = notifMetaKey(n);
    if (/^pt-removed:/.test(key) || /^pt-review:/.test(key)) return true;
    var hay = (String(n.title || "") + " " + String(n.body || "")).toLowerCase();
    return /punto partnership rimosso|punti tolti\s*[—\-–]?\s*(rimozione confermata|segnalazione negata)/.test(
      hay,
    );
  }
  function isPersonalTicketOpenerNotifClient(n) {
    if (!n) return false;
    var ch = String(n.channel || "").toLowerCase();
    var url = String(n.openUrl || "").toLowerCase();
    if (ch === "inbox" || /(?:\?|&)view=staff\b/.test(url)) return false;
    var key = notifMetaKey(n);
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
  function isStaffTicketSlaNotifClient(n) {
    if (!n) return false;
    if (String(n.kind || "").toLowerCase() === "web_ticket_sla") return true;
    return /^web_ticket:sla:/.test(notifMetaKey(n));
  }
  function isMentionNotifClient(n) {
    if (!n) return false;
    var k = String(n.kind || "").toLowerCase();
    if (k === "web_ticket_mention" || k === "workflow_mention") return true;
    var key = notifMetaKey(n);
    return /^web_ticket:mention:/.test(key) || /^wfc:mention:/.test(key);
  }
  function isWorkflowDecisionNotifClient(n) {
    if (!n) return false;
    if (String(n.kind || "").toLowerCase() === "workflow_decision") return true;
    var key = notifMetaKey(n);
    return /^(cand-|unban-|unmute-|cand-pex-|cand-rej-|wfc:decision:|appeal-auto-close:)/.test(key);
  }
  function isStaffTicketNotifClient(n) {
    if (!n) return false;
    if (isPersonalTicketOpenerNotifClient(n)) return false;
    if (isStaffTicketSlaNotifClient(n)) return true;
    var key = notifMetaKey(n);
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
  function isStaffReviewNotifClient(n) {
    if (!n) return false;
    var key = notifMetaKey(n);
    if (/^rev-new:/.test(key)) return true;
    if (String(n.kind || "").toLowerCase() !== "review") return false;
    return /^nuova recensione\b/i.test(String(n.title || "").trim());
  }
  function isStaffFeedbackNotifClient(n) {
    if (!n) return false;
    var key = notifMetaKey(n);
    if (/^suggestion:new:/.test(key) || /^bot_feedback_new:/.test(key)) return true;
    if (String(n.kind || "").toLowerCase() !== "suggestion") return false;
    return /^(nuovo|nuova)\s+(suggerimento|segnalazione|bug)\b/i.test(String(n.title || "").trim());
  }
  function isDedicatedInboxQueueAlertClient(n) {
    if (!n) return false;
    var ch = String(n.channel || "").toLowerCase();
    if (ch === "personal") return false;
    var key = notifMetaKey(n);
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
    if (isPuntiToltiSubjectNotifClient(n)) return false;
    if (isWorkflowDecisionNotifClient(n)) return false;
    if (/^inbox:(pause|candidature|appelli|resoconti)(?::|$)/.test(key)) return true;
    if (/^pt-pending:/.test(key)) return true;
    if (/^wfc:(invite|remove|msg):staff:/.test(key)) return true;
    var queue = inboxQueueIdFromNotifUrl(n.openUrl);
    if (!queue) return false;
    var hay = (String(n.title || "") + " " + String(n.body || "")).toLowerCase();
    if (
      /nuovo resoconto|nuovo appello|nuova candidatur|nuova richiesta pausa|punti tolti\s*[—\-–]?\s*segnalazione in attesa|richiedente in chat/.test(
        hay,
      )
    ) {
      return true;
    }
    return false;
  }
  function isInboxLinkedNotifClient(n) {
    if (!n) return false;
    /* Subject/staff splits win over stale channel=personal. */
    if (isWorkflowDecisionNotifClient(n) || isPersonalTicketOpenerNotifClient(n)) return false;
    if (isPuntiToltiSubjectNotifClient(n)) return true;
    if (isStaffTicketSlaNotifClient(n)) return true;
    if (isStaffTicketNotifClient(n)) return true;
    if (isStaffReviewNotifClient(n)) return true;
    if (isStaffFeedbackNotifClient(n)) return true;
    if (isMentionNotifClient(n) && String(n.channel || "").toLowerCase() !== "personal") return true;
    var ch = String(n.channel || "").toLowerCase();
    if (ch === "personal") return false;
    if (ch === "inbox") return true;
    if (isDedicatedInboxQueueAlertClient(n)) return true;
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
  function inboxNotifBucket(n) {
    if (isPuntiToltiSubjectNotifClient(n)) return "punti-tolti";
    if (isMentionNotifClient(n)) return "mentions";
    if (isStaffTicketSlaNotifClient(n) || isStaffTicketNotifClient(n)) return "tickets";
    if (isStaffReviewNotifClient(n)) return "reviews";
    if (isStaffFeedbackNotifClient(n)) return "feedback";
    return "avvisi";
  }
  function personalNotifCategory(n) {
    var kind = String((n && n.kind) || "info").toLowerCase();
    var key = notifMetaKey(n);
    if (kind === "vote" || kind === "vote_reminder") return "votes";
    if (kind === "web_ticket" || kind === "web_ticket_mention") return "tickets";
    if (isMentionNotifClient(n)) return "tickets";
    if (isWorkflowDecisionNotifClient(n)) {
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
  var PERSONAL_NOTIF_CATS = [
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
  var INBOX_NOTIF_CATS = [
    { id: "tickets", label: "Ticket", ico: "fa-ticket" },
    { id: "mentions", label: "Mentions", ico: "fa-at" },
    { id: "reviews", label: "Recensioni", ico: "fa-star" },
    { id: "feedback", label: "Feedback", ico: "fa-magic" },
    { id: "avvisi", label: "Avvisi", ico: "fa-bell" },
  ];
  function groupPersonalNotifsByCategory(items) {
    var buckets = Object.create(null);
    for (var i = 0; i < PERSONAL_NOTIF_CATS.length; i++) buckets[PERSONAL_NOTIF_CATS[i].id] = [];
    (items || []).forEach(function (n) {
      var id = personalNotifCategory(n);
      if (!buckets[id]) buckets[id] = [];
      buckets[id].push(n);
    });
    return PERSONAL_NOTIF_CATS.map(function (cat) {
      return { id: cat.id, label: cat.label, ico: cat.ico, items: buckets[cat.id] || [] };
    }).filter(function (g) {
      return g.items.length > 0;
    });
  }
  function inboxChannelRowsFromStore() {
    var s = loadStored();
    var uid = normalizeUserId(currentUserId);
    var dismissed = loadDismissedSet(uid);
    return s.filter(function (n) {
      return (
        !isClearedAwayServerRow(n, dismissed) &&
        !isFilteredNotif(n) &&
        !isVoteRegisteredNotifClient(n) &&
        isInboxLinkedNotifClient(n) &&
        !isDedicatedInboxQueueAlertClient(n)
      );
    });
  }
  function inboxNotifsForBucket(bucketId) {
    return inboxChannelRowsFromStore().filter(function (n) {
      return inboxNotifBucket(n) === bucketId;
    });
  }
  function countInboxUnreadNotifs() {
    return inboxChannelRowsFromStore().filter(function (n) {
      return !n.read;
    }).length;
  }
  function formatUnreadSub(n) {
    var count = Math.max(0, Number(n) || 0);
    if (window.VcI18n && typeof window.VcI18n.t === "function") {
      try {
        var t = window.VcI18n.t("notif.unread", { n: count });
        if (t && t !== "notif.unread") return t;
      } catch (eT) {}
    }
    if (count === 1) return "1 non letta";
    return count + " non lette";
  }
  function clearNotifsByIds(ids) {
    var idSet = {};
    (ids || []).forEach(function (id) {
      var sid = String(id || "").trim();
      if (sid) idSet[sid] = true;
    });
    if (!Object.keys(idSet).length) return;
    var uid = normalizeUserId(currentUserId);
    var next = [];
    loadStored().forEach(function (n) {
      var nid = String((n && n.id) || "").trim();
      if (nid && idSet[nid]) {
        try {
          rememberDismissedNotif(n, uid);
        } catch (eRem) {}
        try {
          deleteSiteNotificationOnServer(nid);
        } catch (eDel) {}
        return;
      }
      next.push(n);
    });
    saveStored(next);
    lastNotifRenderSig = "";
    render({ force: true });
    if (bellNotifScope === "staff") {
      try {
        var cached = readCachedBellStaffSummary();
        renderBellStaffInbox((cached && cached.summary) || {});
      } catch (eR) {}
    }
  }
  /* notifCatBarFix1: count+trash+chev on the right; toggle = ico+label only. */
  function buildNotifCategoryBar(opts) {
    var bar = document.createElement("div");
    bar.className = "vc-notif-cat-bar vc-notif-bell-inbox__link";
    var toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className =
      (opts.toggleClass || "vc-notif-cat-toggle vc-notif-bell-inbox__toggle") +
      " vc-notif-cat-toggle-inner";
    toggle.setAttribute("aria-expanded", opts.expanded ? "true" : "false");
    if (opts.ariaControls) toggle.setAttribute("aria-controls", opts.ariaControls);
    toggle.innerHTML = opts.toggleHtml || "";
    var actions = document.createElement("span");
    actions.className = "vc-notif-cat-head__actions";
    if (opts.countHtml) {
      actions.insertAdjacentHTML("beforeend", opts.countHtml);
    }
    var clearBtn = null;
    if (typeof opts.onClear === "function") {
      clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.className = "vc-notif-cat-clear";
      if (opts.clearCatId) clearBtn.setAttribute("data-cat-clear", opts.clearCatId);
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
    chev.className = "fa fa-chevron-down vc-notif-cat-chev vc-notif-bell-inbox__chev";
    chev.setAttribute("aria-hidden", "true");
    actions.appendChild(chev);
    bar.appendChild(toggle);
    bar.appendChild(actions);
    if (typeof opts.onToggleClick === "function") {
      toggle.addEventListener("click", opts.onToggleClick);
    }
    return { bar: bar, toggle: toggle, clearBtn: clearBtn, actions: actions, chev: chev };
  }
  function clearNotifCategory(catId, scope) {
    var items =
      scope === "inbox"
        ? inboxNotifsForBucket(catId)
        : rows().filter(function (n) {
            return personalNotifCategory(n) === catId;
          });
    clearNotifsByIds(
      items.map(function (n) {
        return n && n.id;
      }),
    );
  }

  function isFilteredNotif(n) {
    return Boolean(n && n.filtered);
  }
  function rows() {
    var s = loadStored();
    var uid = normalizeUserId(currentUserId);
    var dismissed = loadDismissedSet(uid);
    s = s.filter(function (n) {
      return (
        !isClearedAwayServerRow(n, dismissed) &&
        !isFilteredNotif(n) &&
        !isVoteRegisteredNotifClient(n) &&
        !isInboxLinkedNotifClient(n)
      );
    });
    var demo = ephemeralDemo && !isVoteRegisteredNotifClient(ephemeralDemo) ? ephemeralDemo : null;
    return demo ? [demo].concat(s) : s;
  }
  function iconClass(kind) {
    if (kind === "vote") return "fa-trophy";
    if (kind === "vote_reminder") return "fa-clock-o";
    if (kind === "success") return "fa-check-circle";
    if (kind === "review") return "fa-star";
    if (kind === "mod") return "fa-shield";
    if (kind === "staff") return "fa-id-badge";
    if (kind === "suggestion") return "fa-magic";
    if (kind === "web_ticket" || kind === "web_ticket_mention") return "fa-ticket";
    return "fa-bell-o";
  }
  function notificationsPageUrl() {
    try {
      return new URL(NOTIFICATIONS_PATH, window.location.origin).toString();
    } catch (e) {
      return NOTIFICATIONS_PATH;
    }
  }

  function tUi(key, vars, fallback) {
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

  function ensureNotifSeeAllLink() {
    var dd = document.getElementById("vc-notif-dropdown");
    if (!dd) return null;
    var panel = dd.querySelector(".vc-notif-panel");
    var foot = document.getElementById("vc-notif-panel-foot");
    if (!foot) {
      foot = document.createElement("div");
      foot.className = "vc-notif-panel-foot";
      foot.id = "vc-notif-panel-foot";
      if (panel) panel.appendChild(foot);
      else return null;
    }
    foot.hidden = false;
    var seeAll = document.getElementById("vc-notif-see-all");
    if (!seeAll) {
      seeAll = document.createElement("a");
      seeAll.id = "vc-notif-see-all";
      seeAll.className = "vc-notif-see-all";
      var label = document.createElement("span");
      label.setAttribute("data-i18n", "notif.seeAll");
      label.textContent = tUi("notif.seeAll", null, "Vedi tutte le notifiche");
      seeAll.appendChild(label);
      seeAll.appendChild(document.createTextNode(" "));
      var chev = document.createElement("i");
      chev.className = "fa fa-chevron-right";
      chev.setAttribute("aria-hidden", "true");
      seeAll.appendChild(chev);
      foot.appendChild(seeAll);
    }
    /* notifSeeAll1: CTA always personal /notifications/ — Inbox tab stays separate */
    seeAll.href = notificationsPageUrl();
    seeAll.setAttribute(
      "aria-label",
      tUi("notif.seeAll", null, "Vedi tutte le notifiche"),
    );
    try {
      var labelEl = seeAll.querySelector("span[data-i18n], span");
      if (labelEl) {
        labelEl.setAttribute("data-i18n", "notif.seeAll");
        labelEl.textContent = tUi("notif.seeAll", null, "Vedi tutte le notifiche");
      }
    } catch (eLab) {}
    if (isStandalonePwa()) dd.classList.add("vc-notif-dropdown--pwa");
    return seeAll;
  }

  function buildNotifStoreSignature(items) {
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
          String(n.body || "") +
          "\x1e" +
          String(n.openUrl || ""),
      );
    }
    return parts.join("\x1f");
  }

  function timeAgoLocalized(atMs) {
    var nt = tUi;
    var s = Math.floor((Date.now() - atMs) / 1000);
    if (s < 45) return nt("notif.justNow", null, "Ora");
    var m = Math.floor(s / 60);
    if (m < 60) {
      return m === 1
        ? nt("notif.minuteAgo", null, "1 minuto fa")
        : nt("notif.minutesAgo", { n: m }, "{n} minuti fa");
    }
    var h = Math.floor(m / 60);
    if (h < 24) {
      return h === 1
        ? nt("notif.hourAgo", null, "1 ora fa")
        : nt("notif.hoursAgo", { n: h }, "{n} ore fa");
    }
    var d = Math.floor(h / 24);
    if (d < 7) {
      return d === 1
        ? nt("notif.dayAgo", null, "1 giorno fa")
        : nt("notif.daysAgo", { n: d }, "{n} giorni fa");
    }
    return nt("notif.weekPlusAgo", null, "Più di una settimana fa");
  }
  function render(options) {
    bindClearAllButton();
    wireNotifMobileSheet();
    wireNotifListClicks();
    ensureNotifBellScopeUi();
    var root = document.getElementById("vc-notif-dropdown");
    var listEl = document.getElementById("vc-notif-list");
    var badge = document.getElementById("vc-notif-badge");
    var sub = document.getElementById("vc-notif-unread-sub");
    var all = rows();
    var unread = all.filter(function (n) {
      return !n.read;
    }).length;
    if (!root || !listEl || !badge || !sub) {
      syncBrowserTabNotifBadge(unread);
      return;
    }
    var sig = buildNotifStoreSignature(all) + "|u:" + unread;
    var force = options && options.force === true;
    if (unread > 0) {
      badge.hidden = false;
      badge.textContent = unread > 99 ? "99+" : String(unread);
    } else {
      badge.hidden = true;
      if (windowAttentionTimer) stopWindowAttention();
    }
    syncBrowserTabNotifBadge(unread);
    if (!(bellNotifScope === "staff" && canBellStaffInbox())) {
      sub.textContent = formatUnreadSub(unread);
    } else if (typeof renderBellStaffInbox === "function") {
      try {
        sub.textContent = formatUnreadSub(countInboxUnreadNotifs());
        var cachedInbox = typeof readCachedBellStaffSummary === "function" ? readCachedBellStaffSummary() : null;
        if (cachedInbox && cachedInbox.summary) renderBellStaffInbox(cachedInbox.summary);
      } catch (eInboxPaint) {}
    }
    if (all.length > 0) root.classList.add("vc-notif-dropdown--has-items");
    else root.classList.remove("vc-notif-dropdown--has-items");
    syncPushPromptUi();
    if (!force && sig === lastNotifRenderSig) return;
    lastNotifRenderSig = sig;
    bindClearAllButton();
    listEl.innerHTML = "";
    listEl.classList.add("vc-notif-list--cats");
    function appendPersonalNotifRow(host, n) {
      var li = document.createElement("li");
      var destRaw = String(n.openUrl || "").trim();
      var btn = document.createElement(destRaw ? "a" : "button");
      if (!destRaw) btn.type = "button";
      btn.className = "vc-notif-item";
      if (n.kind === "success") btn.classList.add("vc-notif-item--success");
      if (n.read) btn.classList.add("vc-notif-item--read");
      btn.setAttribute("data-id", n.id);
      btn.setAttribute("data-open-url", destRaw);
      btn.setAttribute("data-kind", String(n.kind || "info"));
      if (destRaw) btn.href = resolveNotifDestUrl(destRaw);
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
      time.textContent = timeAgoLocalized(n.at || Date.now());
      main.appendChild(title);
      main.appendChild(desc);
      main.appendChild(time);
      var dot = document.createElement("span");
      dot.className = "vc-notif-item-dot";
      if (n.read) dot.setAttribute("aria-hidden", "true");
      else
        dot.setAttribute(
          "aria-label",
          window.VcI18n && typeof window.VcI18n.t === "function"
            ? window.VcI18n.t("notif.unreadDot")
            : "Non letta",
        );
      btn.appendChild(ico);
      btn.appendChild(main);
      btn.appendChild(dot);
      li.className = "vc-notif-row";
      var dismiss = document.createElement("button");
      dismiss.type = "button";
      dismiss.className = "vc-notif-dismiss";
      dismiss.setAttribute("data-id", n.id);
      dismiss.setAttribute("aria-label", "Elimina notifica");
      dismiss.title = "Elimina";
      dismiss.innerHTML = '<i class="fa fa-times" aria-hidden="true"></i>';
      li.appendChild(btn);
      li.appendChild(dismiss);
      host.appendChild(li);
    }
    var groups = groupPersonalNotifsByCategory(all);
    groups.forEach(function (g) {
      var section = document.createElement("li");
      /* notifCats3: categories always start collapsed; chrome matches Inbox bars */
      section.className = "vc-notif-cat-row vc-notif-bell-inbox__row";
      section.setAttribute("data-notif-cat", g.id);
      var unreadCat = g.items.filter(function (x) { return !x.read; }).length;
      var itemsHost = document.createElement("ul");
      itemsHost.className = "vc-notif-cat-items vc-notif-bell-inbox__items";
      itemsHost.setAttribute("role", "list");
      itemsHost.hidden = true;
      itemsHost.setAttribute("hidden", "");
      var catBar = buildNotifCategoryBar({
        toggleClass: "vc-notif-cat-toggle vc-notif-bell-inbox__toggle",
        toggleHtml:
          '<span class="vc-notif-cat-ico vc-notif-bell-inbox__ico" aria-hidden="true"><i class="fa ' +
          g.ico +
          '"></i></span>' +
          '<span class="vc-notif-cat-label vc-notif-bell-inbox__label">' +
          escBellHtml(g.label) +
          "</span>",
        countHtml:
          '<span class="vc-notif-cat-count vc-notif-bell-inbox__count">' +
          String(g.items.length) +
          (unreadCat ? " · " + unreadCat : "") +
          "</span>",
        clearCatId: g.id,
        clearAriaLabel: "Elimina tutte in " + g.label,
        onClear: function () {
          clearNotifCategory(g.id, "personal");
        },
        onToggleClick: function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          var open = !section.classList.contains("is-open");
          section.classList.toggle("is-open", open);
          catBar.bar.classList.toggle("is-open", open);
          catBar.toggle.classList.toggle("is-open", open);
          catBar.toggle.setAttribute("aria-expanded", open ? "true" : "false");
          itemsHost.hidden = !open;
          if (open) itemsHost.removeAttribute("hidden");
          else itemsHost.setAttribute("hidden", "");
        },
      });
      var bar = catBar.bar;
      var toggle = catBar.toggle;
      g.items.forEach(function (n) {
        appendPersonalNotifRow(itemsHost, n);
      });
      section.appendChild(bar);
      section.appendChild(itemsHost);
      listEl.appendChild(section);
    });
  }
  function markAllRead() {
    if (ephemeralDemo) ephemeralDemo.read = true;
    try {
      stopWindowAttention();
    } catch (eStopAll) {}
    rememberMarkAllReadStamp();
    saveStored(
      loadStored().map(function (x) {
        rememberPendingForItem(x);
        var xid = String((x && x.id) || "").trim();
        if (xid) rememberToastedId(xid);
        return Object.assign({}, x, { read: true });
      }),
    );
    render({ force: true });
    dismissOsNotifications({ all: true });
    markAllSiteNotificationsReadOnServer().finally(function () {
      window.setTimeout(function () {
        syncSiteNotificationsFromServer();
      }, 400);
    });
  }
  function hasUnreadNotifs() {
    if (ephemeralDemo && !ephemeralDemo.read) return true;
    return rows().some(function (n) {
      return !n.read;
    });
  }
  function markAllReadOnBellOpen() {
    if (!hasUnreadNotifs()) return;
    markAllRead();
  }
  function removeMarkAllButton() {
    var markBtn = document.getElementById("vc-notif-mark-all");
    if (markBtn && markBtn.parentNode) markBtn.parentNode.removeChild(markBtn);
  }
  var lastClearAllCallAt = 0;
  function clearAll(ev) {
    if (ev && typeof ev.preventDefault === "function") {
      ev.preventDefault();
      ev.stopPropagation();
      if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
    }
    var now = Date.now();
    if (now - lastClearAllCallAt < 500) return;
    lastClearAllCallAt = now;
    ephemeralDemo = null;
    var uid = normalizeUserId(currentUserId);
    var items = loadStored();
    for (var ci = 0; ci < items.length; ci += 1) {
      rememberDismissedNotif(items[ci], uid);
    }
    rememberClearAllStamp();
    saveStored([]);
    render({ force: true });
    clearAllSiteNotificationsOnServer().finally(function () {
      window.setTimeout(function () {
        syncSiteNotificationsFromServer();
      }, 600);
    });
  }
  window.__vcClearAllNotifs = clearAll;
  function clearAllEventTarget(ev) {
    var t = ev && ev.target;
    if (!t) return null;
    if (t.nodeType === 3) t = t.parentElement;
    if (t && !t.closest && t.parentElement) t = t.parentElement;
    return t && t.closest ? t : null;
  }
  function onClearAllGesture(ev) {
    var t = clearAllEventTarget(ev);
    if (!t || !t.closest || !t.closest("#vc-notif-clear-all")) return;
    if (ev.type === "pointerup" && Number(ev.button) > 0) return;
    if (ev.type === "touchend" && ev.cancelable) ev.preventDefault();
    clearAll(ev);
  }
  function bindClearAllButton() {
    var btn = document.getElementById("vc-notif-clear-all");
    if (!btn) return;
    btn.onclick = function (ev) {
      clearAll(ev);
      return false;
    };
    if (btn.__vcClearBound) return;
    btn.__vcClearBound = true;
    btn.addEventListener("click", clearAll);
    btn.addEventListener("pointerup", onClearAllGesture);
    btn.addEventListener("touchend", onClearAllGesture, { passive: false });
  }
  if (!window.__vcNotifClearAllWired) {
    window.__vcNotifClearAllWired = true;
    document.addEventListener("click", onClearAllGesture, true);
    document.addEventListener("pointerup", onClearAllGesture, true);
    document.addEventListener("touchend", onClearAllGesture, true);
  }
  function onDismissOneGesture(ev) {
    var t = ev && ev.target;
    if (!t) return;
    if (t.nodeType === 3) t = t.parentElement;
    if (!t || !t.closest) return;
    var btn = t.closest("button.vc-notif-dismiss");
    if (!btn) return;
    if (ev.type === "pointerup" && Number(ev.button) > 0) return;
    if (ev.type === "touchend" && ev.cancelable) ev.preventDefault();
    if (ev.preventDefault) ev.preventDefault();
    if (ev.stopPropagation) ev.stopPropagation();
    if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
    dismissOneSiteNotification(btn.getAttribute("data-id") || "");
  }
  if (!window.__vcNotifDismissWired) {
    window.__vcNotifDismissWired = true;
    document.addEventListener("click", onDismissOneGesture, true);
    document.addEventListener("pointerup", onDismissOneGesture, true);
    document.addEventListener("touchend", onDismissOneGesture, true);
  }
  function markOneRead(id, extra) {
    var sid = String(id || "").trim();
    var dest = String((extra && extra.openUrl) || "").trim();
    if (ephemeralDemo && String(ephemeralDemo.id || "") === sid) {
      ephemeralDemo.read = true;
      render();
      stopWindowAttention();
      return;
    }
    if (!sid && !dest) return;
    try {
      stopWindowAttention();
    } catch (eStop) {}
    if (sid) {
      rememberPendingRead(sid);
      rememberClickRead(sid);
      rememberToastedId(sid);
    }
    var ticketIds = {};
    var idsToPost = sid ? [sid] : [];
    var destMatch = notifDestIsSpecific(dest);
    saveStored(
      loadStored().map(function (x) {
        if (!x || x.read) return x;
        var xid = String((x && x.id) || "").trim();
        var xDest = String((x && x.openUrl) || "").trim();
        var match = Boolean(sid && xid === sid);
        if (!match && destMatch && xDest && xDest === dest) match = true;
        if (!match) return x;
        rememberPendingForItem(x);
        if (xid && idsToPost.indexOf(xid) === -1) idsToPost.push(xid);
        var tid = extractTicketIdFromNotif(x);
        if (tid) ticketIds[tid] = true;
        return Object.assign({}, x, { read: true });
      }),
    );
    render({ force: true });
    dismissOsNotifications({ id: sid, ticketIds: Object.keys(ticketIds) });
    function afterMark() {
      window.setTimeout(function () {
        syncSiteNotificationsFromServer();
      }, 400);
    }
    if (!idsToPost.length) {
      afterMark();
      return;
    }
    markSiteNotificationsReadBatchOnServer(idsToPost).then(afterMark, afterMark);
  }
  function consumeNotifReadFromUrl() {
    try {
      var u = new URL(window.location.href);
      var id = String(u.searchParams.get("vcNotifRead") || "").trim();
      if (!id) return;
      rememberClickRead(id);
      u.searchParams.delete("vcNotifRead");
      var cleaned = u.pathname + u.search + u.hash;
      if (window.history && typeof window.history.replaceState === "function") {
        window.history.replaceState({}, "", cleaned);
      }
    } catch (e) {}
    tryFlushClickReads();
  }
  function pingSwClientFocus() {
    try {
      if (!navigator.serviceWorker || !navigator.serviceWorker.controller) return;
      var watching = {};
      try {
        watching = window.__VC_WATCHING_TICKET || {};
      } catch (eW) {}
      var focused = false;
      try {
        focused =
          document.visibilityState === "visible" &&
          (typeof document.hasFocus !== "function" || document.hasFocus());
      } catch (eF) {
        focused = document.visibilityState === "visible";
      }
      navigator.serviceWorker.controller.postMessage({
        type: "vc:client-focus",
        focused: focused,
        standalone: isStandalonePwa(),
        ticketId: focused ? String(watching.id || "") : "",
        token: getDiscordAccessToken(),
      });
    } catch (e) {}
  }
  function wireSwClientFocusPing() {
    pingSwClientFocus();
    window.addEventListener("focus", pingSwClientFocus);
    window.addEventListener("blur", pingSwClientFocus);
    document.addEventListener("visibilitychange", pingSwClientFocus);
    window.setInterval(pingSwClientFocus, 4000);
    try {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.addEventListener("controllerchange", pingSwClientFocus);
      }
    } catch (e2) {}
    try {
      window.__vcPingSwClientFocus = pingSwClientFocus;
    } catch (e3) {}
  }
  function wirePushNotifMarkRead() {
    consumeNotifReadFromUrl();
    consumePendingReadFromSwCache();
    var pushSyncTimer = 0;
    function scheduleInboxSyncFromPush() {
            if (pushSyncTimer) clearTimeout(pushSyncTimer);
      pushSyncTimer = setTimeout(function () {
        pushSyncTimer = 0;
        try {
          syncSiteNotificationsFromServer();
        } catch (eSync) {}
      }, 220);
    }
    try {
      if (!("serviceWorker" in navigator)) return;
      navigator.serviceWorker.addEventListener("message", function (ev) {
        var data = ev && ev.data ? ev.data : null;
        if (!data || !data.type) return;
        if (data.type === "vc:push-received") {
          var p = data.payload && typeof data.payload === "object" ? data.payload : {};
          if (String(p.type || "") === "dismiss") {
            dismissOsNotifications({
              ticketId: p.ticketId,
              id: p.id,
              all: p.all === true,
            });
            rememberToastedForDismissPush(p);
            scheduleInboxSyncFromPush();
            return;
          }
          rememberRecentOsPush(String(p.id || "").trim());
          rememberRecentOsPush(String(p.messageId || "").trim());
          rememberRecentOsPush(String(p.ticketId || "").trim());
          setPushSubActive(true);
                    scheduleInboxSyncFromPush();
          if (isWatchingTicketChat(p.ticketId, p.openUrl)) {
            var seenId = String(p.id || "").trim();
            if (seenId) {
              rememberClickRead(seenId);
              tryFlushClickReads();
            }
            return;
          }
          /* phoneNotifFlyCard1: card in-app subito (non dipendere dal poll / soft-OS). */
          try {
            if (document.visibilityState === "visible") {
              var pushToastId = String(p.id || p.messageId || "").trim();
              if (!pushToastId || !wasAlreadyToasted(pushToastId)) {
                if (pushToastId) rememberToastedId(pushToastId);
                playNotifSound();
                showNotifFlyToast({
                  id: pushToastId || String(Date.now()),
                  title: String(p.title || "Nuova notifica"),
                  body: String(p.body || ""),
                  kind: String(p.kind || "info"),
                  openUrl: String(p.openUrl || "").trim(),
                  ticketId: String(p.ticketId || "").trim(),
                  messageId: String(p.messageId || "").trim(),
                  at: Date.now(),
                  read: false,
                });
              }
            }
          } catch (ePushFly) {}
                    return;
        }
        if (data.type === "vc:push-resubscribe") {
          refreshPushSubscriptionState().then(function (ok) {
            if (!ok) syncPushPromptUi();
          });
          return;
        }
        if (data.type === "vc:force-reload-layout" || data.type === "vc:force-reload-home") {
          try {
            var want = String(data.v || "").trim();
            var seen = String(sessionStorage.getItem("vc_layout_reload_v") || "").trim();
            if (want && seen === want) return;
            if (want) sessionStorage.setItem("vc_layout_reload_v", want);
          } catch (eReloadKey) {}
          try {
            window.location.reload();
          } catch (eReload) {}
          return;
        }
        if (data.type === "vc:open-dest") {
          var openId = String(data.id || "").trim();
          var openTid = String(data.ticketId || "").trim();
          if (openTid) markTicketNotificationsRead(openTid);
          if (openId) markOneRead(openId, { openUrl: String(data.url || "").trim() });
          applyOpenDest(String(data.url || "").trim(), openTid);
          return;
        }
        if (data.type !== "vc:notif-mark-read") return;
        var id = String(data.id || "").trim();
        var ticketId = String(data.ticketId || "").trim();
        if (ticketId) markTicketNotificationsRead(ticketId);
        if (id) {
          rememberClickRead(id);
          tryFlushClickReads();
        }
      });
    } catch (e2) {}
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
        if (wantStaff) {
          var cur = String(here.search || "");
          if (cur.indexOf("view=staff") < 0) {
                        window.location.href =
              dest.pathname +
              "?view=staff" +
              (ticketId ? "&ticketId=" + encodeURIComponent(ticketId) + "#" + ticketId : "");
            return;
          }
        }
        if (ticketId && /^[a-f0-9]{24}$/i.test(ticketId)) {
          if (String(here.hash || "").replace(/^#/, "") !== ticketId) {
            try {
              var yKeep =
                window.pageYOffset ||
                (document.documentElement && document.documentElement.scrollTop) ||
                0;
              history.replaceState(
                null,
                "",
                here.pathname + here.search + "#" + ticketId,
              );
              window.scrollTo(0, yKeep);
              if (document.documentElement) document.documentElement.scrollTop = yKeep;
            } catch (eHash) {
              /* ticketActionFail1: mai location.hash= — scrolla in alto la pagina */
              try {
                history.replaceState(null, "", here.pathname + here.search);
              } catch (eHash2) {}
            }
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

  function pulseNotifSummary() {
    var sm = document.querySelector("#vc-notif-dropdown summary.vc-notif-summary");
    if (!sm) return;
    try {
      sm.classList.remove("vc-notif-summary--pulse");
      void sm.offsetWidth;
      sm.classList.add("vc-notif-summary--pulse");
    } catch (e) {}
  }

  function syncGlobalNotifOverlayClass() {
    var dd = document.getElementById("vc-notif-dropdown");
    var root = document.documentElement;
    if (!root) return;
    var isDropdownOpen = Boolean(dd && dd.open);
    var hasFlyToast = notifFlyActiveCount > 0 || notifInterruptOpen;
    root.classList.toggle("vc-notif-overlay-active", isDropdownOpen || hasFlyToast);
  }

  function unlockNotifAudio() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return Promise.resolve(false);
    try {
      if (!notifAudioCtx) notifAudioCtx = new AC();
      if (notifAudioCtx.state === "suspended" && typeof notifAudioCtx.resume === "function") {
        return notifAudioCtx
          .resume()
          .then(function () {
            notifAudioUnlocked = true;
            return true;
          })
          .catch(function () {
            return false;
          });
      }
      notifAudioUnlocked = true;
      return Promise.resolve(true);
    } catch (e) {
      return Promise.resolve(false);
    }
  }

  function playNotifTone(ctx, freq, when, dur, peak) {
    var master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, when);
    master.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), when + 0.015);
    master.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    master.connect(ctx.destination);

    var filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(3400, when);
    filter.Q.setValueAtTime(0.65, when);
    filter.connect(master);

    var sine = ctx.createOscillator();
    sine.type = "sine";
    sine.frequency.setValueAtTime(freq, when);
    sine.connect(filter);

    var sparkle = ctx.createOscillator();
    var sparkleGain = ctx.createGain();
    sparkle.type = "triangle";
    sparkle.frequency.setValueAtTime(freq * 2, when);
    sparkleGain.gain.setValueAtTime(0.28, when);
    sparkle.connect(sparkleGain);
    sparkleGain.connect(filter);

    sine.start(when);
    sparkle.start(when);
    sine.stop(when + dur + 0.03);
    sparkle.stop(when + dur + 0.03);
  }

  var lastNotifSoundAt = 0;
  var lastFlyToastId = "";
  var lastFlyToastAt = 0;
  var recentOsPushAt = {};

  function rememberRecentOsPush(id) {
    var sid = String(id || "").trim();
    if (!sid) return;
    recentOsPushAt[sid] = Date.now();
  }

  function recentlyGotOsPush(item) {
    var nowMs = Date.now();
    var ids = [
      String((item && item.id) || "").trim(),
      String((item && item.messageId) || "").trim(),
      String((item && item.ticketId) || "").trim(),
    ];
    for (var i = 0; i < ids.length; i += 1) {
      var sid = ids[i];
      if (!sid) continue;
      if (recentOsPushAt[sid] && nowMs - recentOsPushAt[sid] < 60000) return true;
    }
    return false;
  }

  function clientOwnsOsBanner() {
            if (pushSubActive === true) return false;
    try {
      if (
        pushSubActive !== false &&
        "serviceWorker" in navigator &&
        navigator.serviceWorker.controller &&
        typeof Notification !== "undefined" &&
        Notification.permission === "granted"
      ) {
                return false;
      }
    } catch (eOwn) {}
    return true;
  }

  function showNativeOsBanner(item) {
    if (!item || item.read) return;
    if (isWatchingTicketChat(item.ticketId, item.openUrl)) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (!clientOwnsOsBanner()) return;
    if (recentlyGotOsPush(item)) return;
    try {
      if (document.visibilityState === "visible" && document.hasFocus()) return;
    } catch (eFocus) {}
    var sid = String(item.id || "").trim();
    var messageId = String(item.messageId || "").trim();
    var ticketId = String(item.ticketId || "").trim();
    var nowMs = Date.now();
    if (sid) recentOsPushAt[sid] = nowMs;
    if (messageId) recentOsPushAt[messageId] = nowMs;
    var title = String(item.title || "Vinili & Caffè").replace(/\s+/g, " ").trim().slice(0, 120) || "Nuova notifica";
    var body = String(item.body || "").trim().slice(0, 500);
        var tag = messageId
      ? "vc-site-msg-" + messageId
      : ticketId && sid
        ? "vc-site-ticket-" + ticketId + "-" + sid
        : sid
          ? "vc-site-" + sid
          : "vc-site-" + String(nowMs);
    var opts = {
      body: body || "Nuova notifica",
      tag: tag,
      renotify: false,
      silent: false,
      lang: "it",
      icon: "/images/og-server-icon.gif?v=20260904brandGif1",
      badge: "/images/og-server-icon.gif?v=20260904brandGif1",
      data: {
        openUrl: String(item.openUrl || "/").trim() || "/",
        kind: String(item.kind || "info"),
        id: sid,
        ticketId: ticketId,
        messageId: messageId,
      },
    };
    function viaPage() {
      try {
        var n = new Notification(title, opts);
        n.onclick = function () {
          try {
            window.focus();
          } catch (eF) {}
          var href = resolveNotifDestUrl(opts.data.openUrl);
          if (href) openNotifDestination(href, opts.data.kind);
          try {
            n.close();
          } catch (eC) {}
        };
      } catch (eN) {}
    }
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready
        .then(function (reg) {
          if (reg && typeof reg.showNotification === "function") {
            return reg.showNotification(title, opts);
          }
          viaPage();
        })
        .catch(viaPage);
    } else {
      viaPage();
    }
  }

  function playNotifSound() {
    var nowMs = Date.now();
    if (nowMs - lastNotifSoundAt < 1800) return;
        try {
      var sharedAt = Number(localStorage.getItem("vc_notif_sound_at_v1") || 0) || 0;
      if (sharedAt && nowMs - sharedAt < 1800) {
        lastNotifSoundAt = sharedAt;
        return;
      }
      localStorage.setItem("vc_notif_sound_at_v1", String(nowMs));
    } catch (eLs) {}
    lastNotifSoundAt = nowMs;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    unlockNotifAudio().then(function (ok) {
      if (!ok || !notifAudioCtx) return;
      try {
        var ctx = notifAudioCtx;
        if (ctx.state === "suspended") return;
        var now = ctx.currentTime + 0.02;
                playNotifTone(ctx, 784.0, now, 0.17, 0.22);
        playNotifTone(ctx, 1174.7, now + 0.1, 0.22, 0.18);
      } catch (e) {}
    });
  }

  function placeNotifPopNearBell(root, bell) {
    if (!root || !bell) return;
    var br = bell.getBoundingClientRect();
    var gap = 10;
    var stack = Math.max(0, notifFlyActiveCount - 1) * 10;
    var rw = Math.min(296, Math.max(220, window.innerWidth - 24));
    root.style.position = "fixed";
    root.style.display = "flex";
    root.style.width = rw + "px";
    var left = br.right - rw;
    if (left < 12) left = 12;
    if (left + rw > window.innerWidth - 12) left = Math.max(12, window.innerWidth - 12 - rw);
    var top = br.bottom + gap + stack;
    if (top + 88 > window.innerHeight - 12) {
      top = Math.max(12, br.top - gap - 72 - stack);
    }
    root.style.top = Math.round(top) + "px";
    root.style.left = Math.round(left) + "px";
    root.style.right = "auto";
    root.style.bottom = "auto";
    var ox = Math.max(16, Math.min(rw - 16, br.left + br.width / 2 - left));
    root.style.setProperty("--vc-pop-ox", Math.round(ox) + "px");
  }

  function escNotifDialog(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function detachNotifInterruptKey() {
    if (notifInterruptKeyHandler) {
      document.removeEventListener("keydown", notifInterruptKeyHandler, true);
      notifInterruptKeyHandler = null;
    }
  }

  function hideNotifInterruptUi() {
    var root = document.getElementById("vc-notif-interrupt");
    detachNotifInterruptKey();
    if (root) {
      root.classList.remove("is-open");
      root.setAttribute("hidden", "");
    }
    notifInterruptOpen = false;
    notifInterruptCurrent = null;
    try {
      syncGlobalNotifOverlayClass();
    } catch (eSync) {}
  }

  function hideNotifInterruptForLoader() {
    if (!notifInterruptOpen && !notifInterruptCurrent) return;
    if (notifInterruptCurrent) {
      notifInterruptQueue.unshift(notifInterruptCurrent);
      if (notifInterruptQueue.length > 8) notifInterruptQueue.length = 8;
    }
    hideNotifInterruptUi();
  }

  function enqueueNotifInterrupt(row) {
    if (!row) return;
    var id = String(row.id || "").trim();
    if (id && notifInterruptCurrent && String(notifInterruptCurrent.id || "") === id) return;
    var i;
    for (i = 0; i < notifInterruptQueue.length; i += 1) {
      if (id && String((notifInterruptQueue[i] && notifInterruptQueue[i].id) || "") === id) return;
    }
    notifInterruptQueue.push(row);
    if (notifInterruptQueue.length > 8) notifInterruptQueue.shift();
  }

  function ensureNotifInterruptRoot() {
    var existing = document.getElementById("vc-notif-interrupt");
    if (existing) return existing;
    var root = document.createElement("div");
    root.id = "vc-notif-interrupt";
    root.className = "vc-dialog vc-notif-interrupt";
    root.style.zIndex = "100800";
    root.setAttribute("hidden", "");
    root.innerHTML =
      '<button type="button" class="vc-dialog__backdrop" data-vc-notif-dialog="cancel" aria-label="Chiudi"></button>' +
      '<div class="vc-dialog__panel vc-notif-interrupt__panel" role="dialog" aria-modal="true" aria-labelledby="vc-notif-interrupt-title">' +
      '<p class="vc-notif-interrupt__kicker" id="vc-notif-interrupt-kicker">Notifica</p>' +
      '<div class="vc-dialog__icon is-info" id="vc-notif-interrupt-icon" aria-hidden="true"><i class="fa fa-bell-o"></i></div>' +
      '<h3 class="vc-dialog__title vc-notif-interrupt__title" id="vc-notif-interrupt-title"></h3>' +
      '<div class="vc-dialog__text vc-notif-interrupt__text" id="vc-notif-interrupt-text"></div>' +
      '<div class="vc-dialog__actions vc-notif-interrupt__actions" id="vc-notif-interrupt-actions"></div>' +
      "</div>";
    document.body.appendChild(root);
    root.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest("[data-vc-notif-dialog]") : null;
      if (!btn || !notifInterruptOpen) return;
      var action = btn.getAttribute("data-vc-notif-dialog");
      if (action === "cancel") finishNotifInterrupt("close");
      else if (action === "ok") finishNotifInterrupt("go");
    });
    return root;
  }

  function finishNotifInterrupt(action) {
    var row = notifInterruptCurrent;
    var dest = row ? resolveNotifDestUrl(String(row.openUrl || "").trim()) : "";
    var kind = row ? String(row.kind || "info") : "info";
    var alreadyRead = Boolean(row && row.read === true);
    hideNotifInterruptUi();
    if (row && !alreadyRead && (row.id || dest)) {
      try {
        markOneRead(row.id, { openUrl: dest });
      } catch (eMark) {}
    }
    if (action === "go") {
      if (dest) openNotifDestination(dest, kind);
      else {
        var dd = document.getElementById("vc-notif-dropdown");
        try {
          if (dd && !dd.open) dd.setAttribute("open", "");
        } catch (eOpen) {}
      }
    }
    window.setTimeout(function () {
      flushNotifInterruptQueue();
    }, 80);
  }

  function openNotifInterrupt(row) {
    var title = row && row.title ? String(row.title) : tNotif("notif.itemTitle", "Notifica");
    var body = row && row.body ? String(row.body) : "";
    if (body.length > 280) body = body.slice(0, 279) + "…";
    var kind = String((row && row.kind) || "info");
    var dest = resolveNotifDestUrl(String((row && row.openUrl) || "").trim());
    var alreadyRead = Boolean(row && row.read === true);
    var closeLabel = tNotif("notif.close", "Chiudi");
    var goLabel = dest
      ? tNotif("notif.goThere", "Vai lì")
      : tNotif("notif.seeAll", "Vedi tutte le notifiche");
    var showGo = Boolean(dest) || !alreadyRead;

    var root = ensureNotifInterruptRoot();
    var kickerEl = document.getElementById("vc-notif-interrupt-kicker");
    var titleEl = document.getElementById("vc-notif-interrupt-title");
    var textEl = document.getElementById("vc-notif-interrupt-text");
    var iconWrap = document.getElementById("vc-notif-interrupt-icon");
    var actions = document.getElementById("vc-notif-interrupt-actions");
    if (kickerEl) kickerEl.textContent = tNotif("notif.itemTitle", "Notifica");
    if (titleEl) titleEl.textContent = title;
    if (textEl) {
      textEl.textContent = body;
      textEl.hidden = !body;
    }
    if (iconWrap) {
      iconWrap.className = "vc-dialog__icon is-info";
      iconWrap.innerHTML = '<i class="fa ' + escNotifDialog(iconClass(kind)) + '"></i>';
    }
    if (actions) {
      var html =
        '<button type="button" class="vc-dialog__btn vc-header-pill" data-vc-notif-dialog="cancel">' +
        escNotifDialog(closeLabel) +
        "</button>";
      if (showGo) {
        html +=
          '<button type="button" class="vc-dialog__btn vc-dialog__btn--primary vc-header-pill vc-home-cine-cta" data-vc-notif-dialog="ok">' +
          escNotifDialog(goLabel) +
          "</button>";
      }
      actions.innerHTML = html;
    }
    var dd = document.getElementById("vc-notif-dropdown");
    if (dd && dd.open) {
      try {
        dd.open = false;
        dd.removeAttribute("open");
      } catch (eDd) {}
    }
    notifInterruptCurrent = row;
    notifInterruptOpen = true;
    root.classList.add("is-open");
    root.removeAttribute("hidden");
    syncGlobalNotifOverlayClass();
    pulseNotifSummary();
    detachNotifInterruptKey();
    notifInterruptKeyHandler = function (ev) {
      if (!ev || ev.key !== "Escape") return;
      ev.preventDefault();
      ev.stopPropagation();
      finishNotifInterrupt("close");
    };
    document.addEventListener("keydown", notifInterruptKeyHandler, true);
    window.setTimeout(function () {
      try {
        var focusBtn = root.querySelector('[data-vc-notif-dialog="ok"]') || root.querySelector('[data-vc-notif-dialog="cancel"]');
        if (focusBtn) focusBtn.focus();
      } catch (eF) {}
    }, 20);
  }

  function flushNotifInterruptQueue() {
    if (notifInterruptOpen) return;
    if (isBlockingLoaderVisible()) return;
    while (notifInterruptQueue.length) {
      var next = notifInterruptQueue.shift();
      if (!next) continue;
      if (isWatchingTicketChat(next.ticketId, next.openUrl)) continue;
      openNotifInterrupt(next);
      return;
    }
  }

  function ensureSiteNotifDropdown() {
    var actions = document.getElementById("header-quick-actions");
    if (!actions) return null;
    var existing = document.getElementById("vc-notif-dropdown");
    if (existing) {
      normalizeHeaderQuickActionsOrder(actions);
      return existing;
    }
    var toggle = actions.querySelector("#vc-mobile-nav-toggle");
    var loginBtn = actions.querySelector("#discord-login-btn, [data-vc-discord-login]");
    var html =
      '<details class="vc-notif-dropdown" id="vc-notif-dropdown">' +
      '<summary class="vc-icon-btn vc-notif-summary relative inline-flex" aria-label="Notifiche"><i class="fa fa-bell-o" aria-hidden="true"></i><span class="vc-notif-badge" id="vc-notif-badge" hidden aria-live="polite">0</span></summary>' +
      '<div class="vc-notif-panel" role="region" aria-label="Elenco notifiche">' +
      '<div class="vc-notif-panel-head"><div class="vc-notif-panel-head-start"><span class="vc-notif-panel-head-ico" aria-hidden="true"><i class="fa fa-bell-o"></i></span><div class="vc-notif-panel-head-text"><span class="vc-notif-panel-title">Notifiche</span><span class="vc-notif-panel-sub" id="vc-notif-unread-sub">0 non lette</span></div></div>' +
      '<div class="vc-notif-panel-head-actions"><button type="button" class="vc-notif-action" id="vc-notif-clear-all" title="Elimina tutte" aria-label="Elimina tutte"><i class="fa fa-trash-o" aria-hidden="true"></i></button></div></div>' +
      '<div class="vc-notif-panel-body"><div class="vc-notif-empty-wrap" id="vc-notif-empty-wrap"><div class="vc-notif-empty"><div class="vc-notif-empty-ico" aria-hidden="true"><i class="fa fa-bell-o"></i></div><p class="vc-notif-empty-title">Nessuna notifica</p><p class="vc-notif-empty-sub">Sei tutto aggiornato!</p></div></div><div class="vc-notif-list-wrap" id="vc-notif-list-wrap"><ul class="vc-notif-list" id="vc-notif-list" role="list"></ul></div></div>' +
      '<div class="vc-notif-panel-foot" id="vc-notif-panel-foot"><a href="/notifications/" class="vc-notif-see-all" id="vc-notif-see-all">Vedi tutte le notifiche <i class="fa fa-chevron-right" aria-hidden="true"></i></a></div></div></details>';
    var anchor = toggle || loginBtn;
    if (anchor) anchor.insertAdjacentHTML("beforebegin", html);
    else actions.insertAdjacentHTML("afterbegin", html);
    normalizeHeaderQuickActionsOrder(actions);
    return document.getElementById("vc-notif-dropdown");
  }

  function placeNotifFlyFallback(root) {
    if (!root) return;
    var safeTop = 0;
    try {
      safeTop = Number(window.__vcSafeTop) || 0;
    } catch (eSafe) {}
    var rw = Math.min(320, Math.max(240, window.innerWidth - 24));
    root.style.position = "fixed";
    root.style.display = "flex";
    root.style.width = rw + "px";
    root.style.top = Math.round(Math.max(12, safeTop + 12)) + "px";
    root.style.right = "12px";
    root.style.left = "auto";
    root.style.bottom = "auto";
    root.style.setProperty("--vc-pop-ox", rw - 28 + "px");
  }

  function showNotifFlyToast(row) {
    var toastId = String((row && row.id) || "");
    var nowMs = Date.now();
    if (toastId && toastId === lastFlyToastId && nowMs - lastFlyToastAt < 2500) return;
    lastFlyToastId = toastId;
    lastFlyToastAt = nowMs;
    ensureSiteNotifDropdown();
    var bell = document.querySelector("#vc-notif-dropdown summary.vc-notif-summary");
    var dd = document.getElementById("vc-notif-dropdown");
    if (isOnNotificationsPage()) {
      pulseNotifSummary();
      return;
    }
    /* phoneNotifFlyCard1: stesso popup card del PC (niente toast dash). */
    if (dd && dd.open) {
      pulseNotifSummary();
      return;
    }
    var title = row && row.title ? String(row.title) : "Nuova notifica";
    var body = row && row.body ? String(row.body) : "";
    var kind = String((row && row.kind) || "info");
    var dest = resolveNotifDestUrl(String((row && row.openUrl) || "").trim());
    var atMs = typeof (row && row.at) === "number" ? row.at : Date.now();

    var root = document.createElement("div");
    root.className = "vc-notif-fly-card";
    if (kind === "success") root.classList.add("vc-notif-fly-card--success");
    root.setAttribute("role", "status");
    root.setAttribute("aria-live", "polite");
    root.style.position = "fixed";
    root.style.zIndex = "100001";
    root.style.display = "flex";

    var ico = document.createElement("span");
    ico.className = "vc-notif-fly-card__ico";
    ico.setAttribute("aria-hidden", "true");
    var fi = document.createElement("i");
    fi.className = "fa " + iconClass(kind);
    ico.appendChild(fi);

    var main = document.createElement("button");
    main.type = "button";
    main.className = "vc-notif-fly-card__main";
    var t = document.createElement("strong");
    t.className = "vc-notif-fly-card__t";
    t.textContent = title;
    var b = document.createElement("span");
    b.className = "vc-notif-fly-card__b";
    b.textContent = body;
    var time = document.createElement("time");
    time.className = "vc-notif-fly-card__time";
    time.dateTime = new Date(atMs).toISOString();
    time.textContent = timeAgoLocalized(atMs);
    main.appendChild(t);
    if (body) main.appendChild(b);
    main.appendChild(time);

    var dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "vc-notif-fly-card__x";
    dismiss.setAttribute("aria-label", "Chiudi");
    dismiss.innerHTML = '<i class="fa fa-times" aria-hidden="true"></i>';

    root.appendChild(ico);
    root.appendChild(main);
    root.appendChild(dismiss);
    document.body.appendChild(root);
    notifFlyActiveCount += 1;
    syncGlobalNotifOverlayClass();
    if (bell) placeNotifPopNearBell(root, bell);
    else placeNotifFlyFallback(root);
    pulseNotifSummary();

    var finished = false;
    function finish(fromClick) {
      if (finished) return;
      finished = true;
      root.classList.add("vc-notif-fly-card--out");
      window.setTimeout(function () {
        try {
          root.remove();
        } catch (e2) {}
        notifFlyActiveCount = Math.max(0, notifFlyActiveCount - 1);
        syncGlobalNotifOverlayClass();
        if (!fromClick) pulseNotifSummary();
      }, NOTIF_FLY_ANIM_MS + 40);
    }

    main.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      finish(true);
      if (row && row.id) {
        try {
          markOneRead(row.id);
        } catch (eMark) {}
      }
      if (dest) {
        openNotifDestination(dest, kind);
        return;
      }
      try {
        if (dd && !dd.open) dd.setAttribute("open", "");
      } catch (eOpen) {}
    });
    dismiss.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      finish(true);
    });

    var onResize = function () {
      if (finished) return;
      if (bell) placeNotifPopNearBell(root, bell);
      else placeNotifFlyFallback(root);
    };
    window.addEventListener("resize", onResize);
    window.setTimeout(function () {
      window.removeEventListener("resize", onResize);
      if (!finished) finish(false);
    }, NOTIF_FLY_READ_MS);
  }

  function addNotif(p) {
    var ownerId = normalizeUserId((p && p.userId) || currentUserId);
    if (!ownerId) return { added: false };
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
                : kindRaw === "web_ticket" || kindRaw === "web_ticket_mention"
                  ? "web_ticket"
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
    if ((stableId && dismissed.has(stableId)) || (fpId && dismissed.has(fpId))) return { added: false };
    var incomingRead = Boolean(p && (p.read === true || p.readAt));
    var ticketId = extractTicketIdFromNotif(p);
    var item = {
      id: stableId || String(Date.now()) + "-" + String(Math.floor(Math.random() * 1e9)),
      title: String((p && p.title) || ""),
      body: String((p && p.body) || ""),
      at: typeof (p && p.at) === "number" ? p.at : Date.now(),
      read: incomingRead,
      kind: kind,
      openUrl: openUrl,
      ticketId: ticketId,
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
        if (!p || !p.__noRender) render();
        return { added: false };
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
        if (!p || !p.__noRender) render();
        return { added: false };
      }
    }
    s.push(item);
    s = sortNotifItems(s);
    try {
      localStorage.setItem(key, JSON.stringify(s));
    } catch (e2) {}
    if (!p || !p.__noRender) render();
    if (!incomingRead && !p.__skipOsBanner) showNativeOsBanner(item);
    if (!incomingRead && !p.__skipFlyToast) {
      try {
        if (stableId) rememberToastedId(stableId);
        showNotifFlyToast(item);
      } catch (eFly) {}
    }
    return { added: true };
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
    addNotif(Object.assign({}, data, { __skipOsBanner: true }));
  }
  function isMobileNotifViewport() {
    try {
                  return window.matchMedia(
        "(max-width: 639.98px), ((pointer: coarse) and (max-width: 920px))",
      ).matches;
    } catch (e) {
      return (window.innerWidth || 999) <= 640;
    }
  }

  function isOnNotificationsPage() {
    try {
      return Boolean(document.body && document.body.classList.contains("vc-notifications-page"));
    } catch (eOnNotifPage) {
      return false;
    }
  }

  function formatNotifToastMessage(row) {
    var title = row && row.title ? String(row.title).trim() : "Nuova notifica";
    var body = row && row.body ? String(row.body).trim() : "";
    if (!body || body === title) return title;
    var combined = title + " — " + body;
    return combined.length > 140 ? combined.slice(0, 137) + "…" : combined;
  }

  function showDashStyleSiteToast(text, isError, opts) {
    var msg = String(text || "").trim();
    if (!msg) return false;
    opts = opts || {};
    if (window.VcSiteToast && typeof window.VcSiteToast.show === "function") {
      window.VcSiteToast.show(msg, Boolean(isError), opts);
      return true;
    }
    var host = document.getElementById("vc-site-toast-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "vc-site-toast-host";
      host.className = "vc-dash-save-toast-host vc-site-toast-host";
      host.setAttribute("aria-live", "polite");
      host.setAttribute("aria-atomic", "true");
      try {
        host.style.setProperty("z-index", "300000", "important");
      } catch (eZ) {}
      document.body.appendChild(host);
    } else {
      try {
        host.style.setProperty("z-index", "300000", "important");
      } catch (eZ2) {}
    }
    host.innerHTML = "";
    var pending =
      opts.pending === true ||
      opts.sticky === true ||
      (!isError && /[…]$|\.\.\.$/.test(msg));
    var toast = document.createElement("div");
    toast.className =
      "vc-dash-save-toast" + (isError ? " is-error" : "") + (pending ? " is-pending" : "");
    toast.setAttribute("role", "status");
    var ico = document.createElement("span");
    ico.className = "vc-dash-save-toast__icon";
    ico.setAttribute("aria-hidden", "true");
    ico.innerHTML = isError
      ? '<i class="fa fa-times" aria-hidden="true"></i>'
      : pending
        ? '<span class="vc-ui-spinner vc-ui-spinner--on-dark" aria-hidden="true"></span>'
        : '<i class="fa fa-check" aria-hidden="true"></i>';
    var p = document.createElement("p");
    p.className = "vc-dash-save-toast__text";
    p.textContent = msg;
    toast.appendChild(ico);
    toast.appendChild(p);
    host.appendChild(toast);
    requestAnimationFrame(function () {
      toast.classList.add("is-visible");
    });
    if (pending) return true;
    var ms = Number(opts.ms);
    if (!Number.isFinite(ms) || ms <= 0) ms = isError ? 2800 : 3600;
    window.setTimeout(function () {
      toast.classList.add("is-leaving");
      toast.classList.remove("is-visible");
      window.setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 200);
    }, ms);
    return true;
  }

  try {
    window.__vcShowSiteToast = showDashStyleSiteToast;
  } catch (eToastExpo) {}

  var notifPortalGuardUntil = 0;
  var notifPortalSyncing = false;
  /* notifDoubleClose1: invalidate pending portal forceOpen; ignore ghost 2nd tap. */
  var notifPortalOpenGen = 0;
  var notifBellGestureLockUntil = 0;

  function normalizeHeaderQuickActionsOrder(actions) {
    if (!actions) actions = document.getElementById("header-quick-actions");
    if (!actions) return;
    var promo = actions.querySelector("#vc-header-promo-btn, .vc-header-promo-btn");
    var notif = actions.querySelector("#vc-notif-dropdown");
    var toggle = actions.querySelector("#vc-mobile-nav-toggle");
    var loginBtn = actions.querySelector("#discord-login-btn, [data-vc-discord-login]");
    var loginState = actions.querySelector("#discord-login-state");
    var cursor = actions.firstElementChild;
    function place(el) {
      if (!el || el.parentElement !== actions) return;
      actions.insertBefore(el, cursor);
      cursor = el.nextElementSibling;
    }
    place(promo);
    place(notif);
    place(toggle);
    place(loginBtn);
    place(loginState);
  }

  try {
    window.__vcNormalizeHeaderQuickActionsOrder = normalizeHeaderQuickActionsOrder;
  } catch (eNormExport) {}

    function ensureNotifDropdownInHeader(force) {
    var dd = document.getElementById("vc-notif-dropdown");
    if (!dd) return null;
    var actions = document.getElementById("header-quick-actions");
    if (!actions) return dd;
    if (dd.open && !force) return dd;
    if (dd.parentElement === actions) {
      normalizeHeaderQuickActionsOrder(actions);
      return dd;
    }
    var slot = document.getElementById("vc-notif-dropdown-slot");
    if (slot && slot.parentNode === actions) {
      actions.insertBefore(dd, slot);
      try {
        if (slot.parentNode) slot.parentNode.removeChild(slot);
      } catch (eSlot) {}
    } else {
      var toggle = actions.querySelector("#vc-mobile-nav-toggle");
      var promo = actions.querySelector("#vc-header-promo-btn, .vc-header-promo-btn");
      if (toggle) actions.insertBefore(dd, toggle);
      else if (promo && promo.nextSibling) actions.insertBefore(dd, promo.nextSibling);
      else actions.appendChild(dd);
    }
    normalizeHeaderQuickActionsOrder(actions);
    return dd;
  }

  try {
    window.__vcEnsureNotifDropdownInHeader = ensureNotifDropdownInHeader;
  } catch (eEnsExport) {}

    /* notifSidebar4: never auto-close on visibility/pageshow/PTR repair; only forceClose. */
    function repairNotifDropdownPortal(opts) {
    opts = opts || {};
    var forceClose = Boolean(opts.forceClose);
    var dd = document.getElementById("vc-notif-dropdown");
    if (!dd) return;
    var intentionallyOpen = false;
    try {
      intentionallyOpen = Boolean(dd.open || dd.hasAttribute("open"));
    } catch (eOpenChk) {
      intentionallyOpen = false;
    }
    if (!forceClose && intentionallyOpen) {
      try {
        syncNotifMobileSheetChrome();
      } catch (eKeepOpen) {}
      try {
        if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
      } catch (eLockKeep) {}
      return;
    }
    notifPortalGuardUntil = 0;
    notifPortalOpenGen += 1;
    try {
      dd.open = false;
      dd.removeAttribute("open");
    } catch (eClose) {}
    try {
      document.documentElement.classList.remove(
        "vc-notif-dropdown-open",
        "vc-notif-sheet-open",
        "vc-notif-drawer-open",
        "vc-notif-overlay-active",
      );
    } catch (eCls) {}
    var oldBd = dd.querySelector(".vc-notif-mobile-backdrop");
    if (oldBd) {
      try {
        oldBd.remove();
      } catch (eBd) {}
    }
    setNotifHeaderSlotHold(false);
    var slot = document.getElementById("vc-notif-dropdown-slot");
    if (slot && slot.parentNode && dd.parentElement === document.body) {
      try {
        slot.parentNode.insertBefore(dd, slot);
      } catch (eSlot) {}
    }
    ensureNotifDropdownInHeader(true);
    try {
      syncGlobalNotifOverlayClass();
    } catch (eSync) {}
        try {
      if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
    } catch (eLockRepair) {}
    try {
      restoreNotifScrollAfterClose();
    } catch (eRestore) {}
  }

  try {
    window.__vcRepairNotifDropdownPortal = repairNotifDropdownPortal;
  } catch (eRepairExport) {}

  function setNotifHeaderSlotHold(active) {
    var actions = document.getElementById("header-quick-actions");
    if (!actions) return;
    var dd = document.getElementById("vc-notif-dropdown");
    var slot = document.getElementById("vc-notif-dropdown-slot");
    if (active) {
      if (!slot) {
        slot = document.createElement("span");
        slot.id = "vc-notif-dropdown-slot";
        var toggle = actions.querySelector("#vc-mobile-nav-toggle");
        if (dd && dd.parentElement === actions) actions.insertBefore(slot, dd);
        else if (toggle) actions.insertBefore(slot, toggle);
        else actions.appendChild(slot);
      }
      slot.className = "vc-notif-dropdown-slot vc-notif-dropdown-slot--hold";
      slot.hidden = false;
      slot.setAttribute("aria-hidden", "true");
      return;
    }
    if (slot) {
      slot.className = "vc-notif-dropdown-slot";
      slot.hidden = true;
    }
  }

  function portalNotifDropdownToBody(dd, enable) {
    if (!dd) return;
    var slotId = "vc-notif-dropdown-slot";
    var slot = document.getElementById(slotId);
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
      setNotifHeaderSlotHold(true);
      /* notifDoubleClose1: only latest portal open may forceOpen. */
      notifPortalOpenGen += 1;
      var openGen = notifPortalOpenGen;
      function forceOpen() {
        /* notifDoubleClose1: skip if user closed (or newer portal) after this schedule. */
        if (openGen !== notifPortalOpenGen) return;
        try {
          dd.open = true;
          dd.setAttribute("open", "");
        } catch (eOpen) {}
      }
      forceOpen();
      try {
        window.requestAnimationFrame(forceOpen);
      } catch (eRaf) {}
      notifPortalGuardUntil = Date.now() + 700;
      return;
    }
    notifPortalOpenGen += 1;
    setNotifHeaderSlotHold(false);
    ensureNotifDropdownInHeader(true);
  }

  /* notifSidebar2: intentional close must clear portal guard or Esc/2nd click get reopened.
     notifDoubleClose1: bump openGen so pending rAF forceOpen cannot reopen. */
  function requestCloseNotifDropdown(dd) {
    notifPortalGuardUntil = 0;
    notifPortalOpenGen += 1;
    var live = dd || document.getElementById("vc-notif-dropdown");
    if (!live) return;
    try {
      live.open = false;
      live.removeAttribute("open");
    } catch (eClose) {
      try {
        live.removeAttribute("open");
      } catch (eClose2) {}
    }
  }

  function primeDesktopNotifDrawer(dd) {
    /* Classes only — do NOT forceOpen (would fight native <details> toggle). */
    if (!dd || isMobileNotifViewport() || dd.open) return;
    var root = document.documentElement;
    try {
      root.classList.add("vc-notif-drawer-open", "vc-notif-dropdown-open");
      root.classList.remove("vc-notif-sheet-open");
    } catch (ePrime) {}
  }

  function restoreNotifScrollAfterClose() {
    try {
      if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
    } catch (eSync) {}
    try {
      var root = document.documentElement;
      var stillFrozen =
        (typeof isPageScrollFrozen === "function" && isPageScrollFrozen()) ||
        isNotifPanelChromeOpen(root);
      if (!stillFrozen && typeof window.__vcUnpinPageScroll === "function") {
        window.__vcUnpinPageScroll();
      }
    } catch (eUnpin) {}
    try {
      if (typeof window.__vcStripPhoneInlineScrollLocks === "function") {
        window.__vcStripPhoneInlineScrollLocks();
      }
    } catch (eStrip) {}
  }

  function clearStuckNotifDrawerPrime() {
    /* notifBellFix1: pointerdown prime without a successful open left overflow-lock + dead bell. */
    try {
      var live = document.getElementById("vc-notif-dropdown");
      if (live && live.open) return;
      var root = document.documentElement;
      if (!root) return;
      if (
        !root.classList.contains("vc-notif-drawer-open") &&
        !root.classList.contains("vc-notif-sheet-open") &&
        !root.classList.contains("vc-notif-dropdown-open")
      ) {
        return;
      }
      root.classList.remove("vc-notif-drawer-open", "vc-notif-sheet-open", "vc-notif-dropdown-open");
      restoreNotifScrollAfterClose();
    } catch (eClearPrime) {}
  }

  function scheduleNotifSheetChromeSync(opts) {
    /* notifBellFix1: never portal/move <details> synchronously inside toggle — browsers cancel open. */
    opts = opts || {};
    var delay = opts.delayMs != null ? Number(opts.delayMs) : 0;
    function run() {
      try {
        syncNotifMobileSheetChrome();
      } catch (eSync) {}
      try {
        var live = document.getElementById("vc-notif-dropdown");
        if (!live || !live.open) clearStuckNotifDrawerPrime();
      } catch (eChk) {}
    }
    if (delay > 0) {
      window.setTimeout(run, delay);
      return;
    }
    try {
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(run);
      });
    } catch (eRaf) {
      window.setTimeout(run, 0);
    }
  }

  function syncNotifMobileSheetChrome() {
    /* notifSidebar2: mobile sheet + desktop right drawer; no classic popup flash.
       notifBellFix1: portal only after toggle settles (see scheduleNotifSheetChromeSync). */
    if (notifPortalSyncing) return;
    var dd = document.getElementById("vc-notif-dropdown");
    if (!dd) return;
    var root = document.documentElement;
    var mobile = isMobileNotifViewport();
    if (!dd.open && Date.now() < notifPortalGuardUntil) {
      try {
        dd.open = true;
        dd.setAttribute("open", "");
      } catch (eRe) {}
      return;
    }
    notifPortalSyncing = true;
    try {
      if (dd.open) {
        var yKeepOpen = pageScrollY();
        try {
          if (mobile) {
            root.classList.add("vc-notif-sheet-open");
            root.classList.remove("vc-notif-drawer-open");
          } else {
            root.classList.add("vc-notif-drawer-open");
            root.classList.remove("vc-notif-sheet-open");
          }
          root.classList.add("vc-notif-dropdown-open");
        } catch (e0) {}
        portalNotifDropdownToBody(dd, true);
        try {
          if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
        } catch (eLock) {}
        if (!dd.querySelector(".vc-notif-mobile-backdrop")) {
          var bd = document.createElement("div");
          bd.className = "vc-notif-mobile-backdrop";
          bd.setAttribute("aria-hidden", "true");
          bd.addEventListener("click", function () {
            notifBellGestureLockUntil = Date.now() + 420;
            requestCloseNotifDropdown(dd);
            scheduleNotifSheetChromeSync({ delayMs: 0 });
          });
          dd.insertBefore(bd, dd.firstChild);
        }
        try {
          ensureNotifBellScopeUi();
          syncNotifBellScopeChrome();
        } catch (eScopeUi) {}
        /* notifTicketScrollStay1 */
        restorePageScrollY(yKeepOpen);
        holdPageScroll(180);
      } else {
        notifPortalGuardUntil = 0;
        try {
          root.classList.remove("vc-notif-sheet-open", "vc-notif-drawer-open", "vc-notif-dropdown-open");
        } catch (e1) {}
        var oldBd = dd.querySelector(".vc-notif-mobile-backdrop");
        if (oldBd) oldBd.remove();
        portalNotifDropdownToBody(dd, false);
        ensureNotifDropdownInHeader(true);
        restoreNotifScrollAfterClose();
      }
      syncGlobalNotifOverlayClass();
      try {
        if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
      } catch (eLockClose) {}
    } finally {
      notifPortalSyncing = false;
    }
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
  function resolvedSiteNotificationsPushUrl(suffix) {
    var base = resolvedSiteNotificationsUrl();
    var path = String(suffix || "").replace(/^\/+/, "");
    if (!base) return "/webhooks/site-notifications/push/" + path;
    return String(base).replace(/\/+$/, "") + "/push/" + path;
  }
  var PUSH_NATIVE_ASKED_KEY = "vc_push_native_asked_v1";
  var PUSH_PROMPT_DISMISS_KEY = "vc_push_prompt_dismissed_v2";
  var PUSH_OK_KEY = "vc_push_ok_v1";
  var PUSH_PERM_KEY = "vc_push_perm_v1";
  var PUSH_DISMISS_MS = 180 * 24 * 60 * 60 * 1000;
  var pushAutoRecoverWired = false;
  var pushAutoRecoverDone = false;
    var pushNativeGestureInFlight = false;
    var pushSubActive = null;
  var refreshPushInFlight = null;
  var lastPostedPushEndpoint = "";
  var lastPostedPushAt = 0;
  var lastPushErrorHint = "";
  var PUSH_RESYNC_MIN_MS = 10 * 60 * 1000;
  var cachedPushReg = null;
  var cachedVapidPublicKey = "";
  var vapidFetchInFlight = null;
  var vapidFetchBlockedUntil = 0;
  var siteNotifsSyncInFlight = null;
  var siteNotifsBlockedUntil = 0;
  var siteNotifsLastSyncAt = 0;
  var SITE_NOTIFS_MIN_GAP_MS = 12000;
  var siteNotifsPollBooted = false;
  var pushSubscribeBlockedUntil = 0;
    var pushSubscribePostInFlight = null;
  var forbiddenStatusInFlight = null;
  var forbiddenStatusBlockedUntil = 0;
  var syncExistingPushInFlight = null;
  function tNotif(key, fallback) {
    try {
      if (window.VcI18n && typeof window.VcI18n.t === "function") {
        var v = window.VcI18n.t(key);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    return fallback;
  }
  function isStandalonePwa() {
    try {
      if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true;
    } catch (e) {}
    return Boolean(navigator.standalone);
  }
  function isBraveLike() {
    try {
      if (navigator.brave) return true;
    } catch (e) {}
    return /Brave/i.test(String(navigator.userAgent || ""));
  }
  function isIosLikeDevice() {
    var ua = String(navigator.userAgent || "");
    if (/iPad|iPhone|iPod/i.test(ua)) return true;
    try {
      if (navigator.platform === "MacIntel" && Number(navigator.maxTouchPoints || 0) > 1) return true;
    } catch (e2) {}
    if (
      /Macintosh/i.test(ua) &&
      /Safari/i.test(ua) &&
      !/Chrome|Chromium|Firefox|Android|CriOS|FxiOS/i.test(ua) &&
      isStandalonePwa()
    ) {
      return true;
    }
    return false;
  }
  function webPushSupported() {
    return (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window
    );
  }
  function storageGet(key) {
    try {
      return String(localStorage.getItem(key) || sessionStorage.getItem(key) || "");
    } catch (e) {
      return "";
    }
  }
  function storageSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (eL) {}
    try {
      sessionStorage.setItem(key, value);
    } catch (eS) {}
  }
  function wasPushPromptDismissed() {
    var raw = storageGet(PUSH_PROMPT_DISMISS_KEY);
    if (!raw) return false;
    if (raw === "1") return true;
    var ts = Number(raw);
    if (!ts) return true;
    return Date.now() - ts < PUSH_DISMISS_MS;
  }
  function dismissPushPrompt() {
    storageSet(PUSH_PROMPT_DISMISS_KEY, String(Date.now()));
    clearPushCustomUi();
  }
  function currentPushPermission() {
    return typeof Notification !== "undefined" ? String(Notification.permission || "") : "";
  }
  function isBravePermissionReset() {
    var perm = currentPushPermission();
    return perm !== "granted" && perm !== "denied" && (hadPushOk() || lastStoredPushPerm() === "granted");
  }
  function needsPushPermissionRecover() {
    if (!webPushSupported()) return false;
    if (!normalizeUserId(currentUserId) || !getDiscordAccessToken()) return false;
    if (isIosLikeDevice() && !isStandalonePwa()) return false;
    return isBravePermissionReset();
  }
  function tryRecoverPushFromGesture() {
    if (pushAutoRecoverDone || pushNativeGestureInFlight || pushSubscribePostInFlight) return;
    if (!needsPushPermissionRecover()) return;
    if (!(cachedPushReg && cachedVapidPublicKey)) {
      prefetchPushPrereqs();
      return;
    }
    pushAutoRecoverDone = true;
    subscribeWebPushNative({ fromGesture: true }).then(function (ok) {
      notePushPermission();
      if (ok) {
        clearPushCustomUi();
        return;
      }
      if (currentPushPermission() === "denied") dismissPushPrompt();
    });
  }
  function wirePushAutoRecover() {
    if (pushAutoRecoverWired) return;
    pushAutoRecoverWired = true;
    var run = function () {
      tryRecoverPushFromGesture();
    };
    document.addEventListener("pointerdown", run, true);
    document.addEventListener("keydown", run, true);
  }
  function shouldShowPushPrompt() {
    if (!webPushSupported()) return false;
    if (!normalizeUserId(currentUserId) || !getDiscordAccessToken()) return false;
    var perm = currentPushPermission() || "denied";
    if (perm === "denied") return false;
    if (pushSubActive === true) return false;
    // Already registered successfully before + permission still granted → no nag banner.
    if (perm === "granted" && hadPushOk() && pushSubActive !== false) return false;
    if (wasPushPromptDismissed()) return false;
        if (needsPushPermissionRecover()) return false;
    if (isIosLikeDevice() && !isStandalonePwa()) return true;
    return perm === "default" || perm === "granted";
  }
  function urlBase64ToUint8Array(base64String) {
    var padding = "=".repeat((4 - (String(base64String || "").length % 4)) % 4);
    var base64 = String(base64String || "").replace(/-/g, "+").replace(/_/g, "/") + padding;
    var raw = atob(base64);
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  function uint8ToBase64Url(bytes) {
    var bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }
  function normalizeVapidKey(s) {
    return String(s || "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "")
      .trim();
  }
  function subscriptionMatchesVapid(sub, publicKey) {
    if (!sub || !publicKey) return false;
    try {
      var opts = typeof sub.options === "object" && sub.options ? sub.options : null;
      var key = opts && opts.applicationServerKey ? opts.applicationServerKey : null;
      if (!key) return true;
      var have = key instanceof ArrayBuffer ? new Uint8Array(key) : new Uint8Array(key);
      return normalizeVapidKey(uint8ToBase64Url(have)) === normalizeVapidKey(publicKey);
    } catch (e) {
      return true;
    }
  }
  function rememberPushOk() {
    try {
      localStorage.setItem(PUSH_OK_KEY, String(Date.now()));
    } catch (e) {}
    try {
      localStorage.removeItem(PUSH_PROMPT_DISMISS_KEY);
      sessionStorage.removeItem(PUSH_PROMPT_DISMISS_KEY);
    } catch (e2) {}
    notePushPermission();
  }
  function hadPushOk() {
    try {
      return Boolean(localStorage.getItem(PUSH_OK_KEY));
    } catch (e) {
      return false;
    }
  }
  function notePushPermission() {
    try {
      if (typeof Notification !== "undefined") {
        localStorage.setItem(PUSH_PERM_KEY, String(Notification.permission || ""));
      }
    } catch (e) {}
  }
  function lastStoredPushPerm() {
    try {
      return String(localStorage.getItem(PUSH_PERM_KEY) || "");
    } catch (e) {
      return "";
    }
  }
  function wasNativePushAsked() {
    try {
      return sessionStorage.getItem(PUSH_NATIVE_ASKED_KEY) === "1";
    } catch (e) {
      return false;
    }
  }
  function markNativePushAsked() {
    try {
      sessionStorage.setItem(PUSH_NATIVE_ASKED_KEY, "1");
    } catch (e) {}
  }
  function ensureServiceWorkerRegistration() {
    if (!webPushSupported()) return Promise.resolve(null);
    return navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then(function (reg) {
        try {
          if (reg && typeof reg.update === "function") reg.update();
        } catch (eUp) {}
        return navigator.serviceWorker.ready;
      })
      .catch(function () {
        return null;
      });
  }
  function prefetchPushPrereqs() {
    if (!webPushSupported()) return Promise.resolve(null);
    return Promise.all([ensureServiceWorkerRegistration(), fetchVapidPublicKey()])
      .then(function (pair) {
        if (pair[0]) cachedPushReg = pair[0];
        if (pair[1]) cachedVapidPublicKey = pair[1];
        return { reg: cachedPushReg, publicKey: cachedVapidPublicKey };
      })
      .catch(function () {
        return { reg: cachedPushReg, publicKey: cachedVapidPublicKey };
      });
  }
  function fetchVapidPublicKey() {
    if (cachedVapidPublicKey) return Promise.resolve(cachedVapidPublicKey);
    var now = Date.now();
    if (vapidFetchBlockedUntil > now) return Promise.resolve("");
    if (vapidFetchInFlight) return vapidFetchInFlight;
    var url = resolvedSiteNotificationsPushUrl("vapid-public-key");
    vapidFetchInFlight = fetch(url, {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
    })
      .then(function (r) {
        if (r && r.status === 429) {
          vapidFetchBlockedUntil = Date.now() + 90000;
          try {
            if (window.VcApiCache && typeof window.VcApiCache.noteWebhook429 === "function") {
              window.VcApiCache.noteWebhook429(0, url);
            }
          } catch (eV429) {}
          return null;
        }
        return r.json().catch(function () {
          return null;
        });
      })
      .then(function (j) {
        if (!j || !j.ok || !j.enabled) return "";
        var key = String(j.publicKey || "").trim();
        if (key) cachedVapidPublicKey = key;
        return key;
      })
      .catch(function () {
        return "";
      })
      .finally(function () {
        vapidFetchInFlight = null;
      });
    return vapidFetchInFlight;
  }
  function subscriptionPayload(subscription) {
    var json = {};
    try {
      json = typeof subscription.toJSON === "function" ? subscription.toJSON() : {};
    } catch (eJ) {
      json = {};
    }
    if (!json || typeof json !== "object") json = {};
    try {
      if (!json.endpoint) json.endpoint = String(subscription.endpoint || "");
    } catch (eEp) {}
    json.keys = json.keys && typeof json.keys === "object" ? json.keys : {};
    function keyOf(name) {
      if (json.keys[name]) return String(json.keys[name]);
      try {
        if (!subscription.getKey) return "";
        var buf = subscription.getKey(name);
        if (!buf) return "";
        return uint8ToBase64Url(new Uint8Array(buf));
      } catch (eK) {
        return "";
      }
    }
    json.keys.p256dh = keyOf("p256dh");
    json.keys.auth = keyOf("auth");
    return json;
  }
  function postPushSubscription(subscription, opts) {
    opts = opts || {};
    var token = getDiscordAccessToken();
    if (!token || !subscription) return Promise.resolve(false);
    var json = subscriptionPayload(subscription);
    var endpoint = String((json && json.endpoint) || "").trim();
    if (!endpoint || !json.keys || !json.keys.p256dh || !json.keys.auth) {
      try {
        console.warn("[vc-push] incomplete subscription payload");
      } catch (eInc) {}
      return Promise.resolve(false);
    }
    var now = Date.now();
    if (
      !opts.force &&
      endpoint &&
      endpoint === lastPostedPushEndpoint &&
      now - lastPostedPushAt < PUSH_RESYNC_MIN_MS
    ) {
      return Promise.resolve(true);
    }
    if (pushSubscribeBlockedUntil > now) return Promise.resolve(false);
    if (pushSubscribePostInFlight) return pushSubscribePostInFlight;
    function subscribePostOnce() {
      return fetch(resolvedSiteNotificationsPushUrl("subscribe"), {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        credentials: "omit",
        body: JSON.stringify({ subscription: json }),
      });
    }
    pushSubscribePostInFlight = subscribePostOnce()
      .then(function (r) {
        try {
          console.warn("[vc-push] subscribe POST", r && r.status);
        } catch (eSt) {}
        if (r && (r.status === 429 || r.status === 502 || r.status === 503)) {
          var retryMs =
            r.status === 429
              ? Math.min(8000, Math.max(1500, Number(r.headers.get("Retry-After") || "0") * 1000 || 2500))
              : 2000;
          return new Promise(function (resolve) {
            setTimeout(resolve, retryMs);
          }).then(subscribePostOnce);
        }
        return r;
      })
      .then(function (r) {
        if (r && r.status === 429) {
          pushSubscribeBlockedUntil = Date.now() + 90000;
          try {
            if (window.VcApiCache && typeof window.VcApiCache.noteWebhook429 === "function") {
              window.VcApiCache.noteWebhook429(Number(r.headers.get("Retry-After") || "0"), url);
            }
          } catch (eP429) {}
          return false;
        }
        if (r && r.ok && endpoint) {
          lastPostedPushEndpoint = endpoint;
          lastPostedPushAt = Date.now();
        }
        return Boolean(r && r.ok);
      })
      .catch(function (err) {
        try {
          console.warn("[vc-push] subscribe POST failed", err && err.message ? err.message : err);
        } catch (eC) {}
        return false;
      })
      .finally(function () {
        pushSubscribePostInFlight = null;
      });
    return pushSubscribePostInFlight;
  }
  function setPushSubActive(active) {
    pushSubActive = active === true;
    syncPushPromptUi();
  }
  function clearPushCustomUi() {
    try {
      var root = document.getElementById("vc-notif-dropdown");
      if (root) root.classList.remove("vc-notif-dropdown--push-cta");
      var banner = document.getElementById("vc-notif-push-banner");
      if (banner) banner.remove();
      var headBtn = document.getElementById("vc-notif-push-toggle");
      if (headBtn) headBtn.remove();
    } catch (e) {}
  }
  function syncPushPromptUi() {
    var root = document.getElementById("vc-notif-dropdown");
    var body = document.querySelector("#vc-notif-dropdown .vc-notif-panel-body");
    if (!body) return;
    var el = document.getElementById("vc-notif-push-banner");
    if (!shouldShowPushPrompt()) {
      if (el) el.remove();
      if (root) root.classList.remove("vc-notif-dropdown--push-cta");
      return;
    }
    if (root) root.classList.add("vc-notif-dropdown--push-cta");
    if (!el) {
      el = document.createElement("div");
      el.id = "vc-notif-push-banner";
      el.className = "vc-notif-push-banner";
      el.innerHTML =
        '<div class="vc-notif-push-banner-text">' +
        '<strong class="vc-notif-push-banner-title"></strong>' +
        '<span class="vc-notif-push-banner-sub"></span>' +
        "</div>" +
        '<div class="vc-notif-push-banner-actions">' +
        '<button type="button" class="vc-notif-push-enable"></button>' +
        '<button type="button" class="vc-notif-push-dismiss" aria-label=""></button>' +
        "</div>";
      body.insertBefore(el, body.firstChild);
      var enableBtn = el.querySelector(".vc-notif-push-enable");
      var dismissBtn = el.querySelector(".vc-notif-push-dismiss");
      if (enableBtn) {
        enableBtn.addEventListener("click", function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          subscribeWebPushFromUserGesture(enableBtn);
        });
      }
      if (dismissBtn) {
        dismissBtn.addEventListener("click", function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          dismissPushPrompt();
        });
      }
    }
    var titleEl = el.querySelector(".vc-notif-push-banner-title");
    var subEl = el.querySelector(".vc-notif-push-banner-sub");
    var enableEl = el.querySelector(".vc-notif-push-enable");
    var dismissEl = el.querySelector(".vc-notif-push-dismiss");
    if (titleEl) titleEl.textContent = tNotif("notif.pushTitle", "Notifiche sul dispositivo");
    if (subEl) {
      var permNow =
        typeof Notification !== "undefined" ? String(Notification.permission || "") : "default";
      if (isIosLikeDevice() && !isStandalonePwa()) {
        subEl.textContent = tNotif(
          "notif.pushIosHint",
          "Su iPhone/iPad: aggiungi il sito alla Home, aprilo da lì, poi attiva le notifiche push.",
        );
      } else if (lastPushErrorHint) {
        subEl.textContent = lastPushErrorHint;
      } else if (permNow === "granted" && hadPushOk()) {
        subEl.textContent = tNotif(
          "notif.pushReconnect",
          "Il permesso c’è già. Clicca Attiva per riattaccare questo PC — non dovrebbe più chiedere Consenti.",
        );
      } else if (permNow === "granted") {
        subEl.textContent = tNotif(
          "notif.pushGrantedNeedClick",
          "Il permesso c’è, ma questo PC non è ancora registrato. Clicca di nuovo Attiva.",
        );
      } else if (isBraveLike()) {
        subEl.textContent = tNotif(
          "notif.pushBraveHint",
          "Su Brave le push spesso non partono. Usa Chrome o Edge, poi clicca Attiva.",
        );
      } else {
        subEl.textContent = tNotif(
          "notif.pushSub",
          "Senza questo gli avvisi arrivano solo quando riapri il sito. Attiva le push di sistema.",
        );
      }
    }
    if (enableEl) {
      enableEl.textContent = tNotif("notif.pushEnable", "Attiva");
      enableEl.disabled =
        Boolean(isIosLikeDevice() && !isStandalonePwa()) ||
        pushNativeGestureInFlight ||
        Boolean(pushSubscribePostInFlight);
      try {
        var strayIco = enableEl.querySelector(".fa, i");
        if (strayIco) strayIco.remove();
      } catch (eIco) {}
    }
    if (dismissEl) {
      dismissEl.setAttribute("aria-label", tNotif("notif.pushDismiss", "Nascondi"));
      dismissEl.innerHTML = '<i class="fa fa-times" aria-hidden="true"></i>';
    }
  }
  function subscribeWebPushFromUserGesture(btn) {
    if (isIosLikeDevice() && !isStandalonePwa()) {
      syncPushPromptUi();
      return;
    }
    if (btn) {
      btn.disabled = true;
      btn.textContent = tNotif("notif.pushEnabling", "Attivazione…");
    }
    subscribeWebPushNative({ fromGesture: true })
      .then(function (ok) {
        if (!ok) {
          try {
            console.warn("[vc-push] subscribe failed", {
              permission: typeof Notification !== "undefined" ? Notification.permission : "n/a",
              standalone: isStandalonePwa(),
            });
          } catch (e0) {}
          if (btn) {
            btn.disabled = false;
            btn.textContent = tNotif("notif.pushEnable", "Attiva");
          }
          try {
            showNotifFlyToast({
              id: "push-err-" + Date.now(),
              title: tNotif("notif.pushTitle", "Notifiche sul dispositivo"),
              body:
                lastPushErrorHint ||
                tNotif(
                  "notif.pushError",
                  "Non sono riuscito a registrare questo PC. Clicca di nuovo Attiva. Se resta così, usa Chrome o Edge.",
                ),
              kind: "info",
              read: true,
            });
          } catch (e1) {}
        } else {
          syncPushPromptUi();
        }
      })
      .catch(function () {
        if (btn) {
          btn.disabled = false;
          btn.textContent = tNotif("notif.pushEnable", "Attiva");
        }
      });
  }
  function describePushError(err) {
    var name = String((err && err.name) || "").toLowerCase();
    var msg = String((err && err.message) || err || "").toLowerCase();
    if (
      isBraveLike() &&
      (name === "aborterror" ||
        msg.indexOf("push service") >= 0 ||
        msg.indexOf("registration failed") >= 0 ||
        msg.indexOf("gcm") >= 0)
    ) {
      return tNotif(
        "notif.pushBraveServices",
        "Brave blocca Google FCM. Apri brave://settings/privacy, attiva “Use Google services for push messaging”, poi clicca di nuovo Attiva.",
      );
    }
    if (msg.indexOf("vapid") >= 0) {
      return tNotif("notif.pushError", "Chiave push assente. Ricarica la pagina e clicca di nuovo Attiva.");
    }
    if (msg.indexOf("subscribe_api") >= 0) {
      return tNotif(
        "notif.pushError",
        "Il permesso c’è, ma il salvataggio sul server è fallito. Clicca di nuovo Attiva.",
      );
    }
    return tNotif(
      "notif.pushError",
      "Non sono riuscito a registrare questo PC. Clicca di nuovo Attiva. Se resta così, usa Chrome o Edge.",
    );
  }
  function createOrRepairPushSubscription(reg, publicKey, opts) {
    var fromGesture = opts && opts.fromGesture === true;
    function doSubscribe() {
      return reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
    function existingThenSubscribe() {
      return reg.pushManager.getSubscription().then(function (existing) {
        if (existing && !subscriptionMatchesVapid(existing, publicKey)) {
          return existing
            .unsubscribe()
            .catch(function () {
              return false;
            })
            .then(function () {
              return doSubscribe();
            });
        }
        if (existing) return existing;
        return doSubscribe();
      });
    }
            if (fromGesture) {
      return doSubscribe().catch(function (err) {
        return existingThenSubscribe().catch(function () {
          throw err;
        });
      });
    }
    return existingThenSubscribe().catch(function (err) {
      return reg.pushManager
        .getSubscription()
        .then(function (ghost) {
          return ghost && typeof ghost.unsubscribe === "function"
            ? ghost.unsubscribe().catch(function () {
                return false;
              })
            : false;
        })
        .then(function () {
          return doSubscribe();
        })
        .catch(function () {
          throw err;
        });
    });
  }
  function refreshPushSubscriptionState(opts) {
    opts = opts || {};
    if (!webPushSupported()) {
      pushSubActive = false;
      return Promise.resolve(false);
    }
    if (!normalizeUserId(currentUserId) || !getDiscordAccessToken()) {
      pushSubActive = false;
      return Promise.resolve(false);
    }
    if (refreshPushInFlight) return refreshPushInFlight;
    refreshPushInFlight = ensureServiceWorkerRegistration()
      .then(function (reg) {
        if (!reg || !reg.pushManager) {
          pushSubActive = false;
          return false;
        }
        return reg.pushManager.getSubscription().then(function (sub) {
          if (!sub) {
            pushSubActive = false;
            return false;
          }
          // pushActiveLocalFix1: Browser already has a push subscription → treat as active even if
          // server resync POST fails (429 / temporary block). Avoid false banner.
          pushSubActive = true;
          lastPushErrorHint = "";
          rememberPushOk();
          return postPushSubscription(sub, opts).then(function (ok) {
            if (ok) rememberPushOk();
            return true;
          });
        });
      })
      .catch(function () {
        pushSubActive = false;
        return false;
      })
      .then(function (ok) {
        refreshPushInFlight = null;
        if (ok) syncPushPromptUi();
        return ok;
      });
    return refreshPushInFlight;
  }
  function recreateGrantedPush() {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") {
      return Promise.resolve(false);
    }
    if (pushNativeGestureInFlight || pushSubscribePostInFlight) return Promise.resolve(false);
    if (vapidFetchBlockedUntil > Date.now() && !cachedVapidPublicKey) return Promise.resolve(false);
    return prefetchPushPrereqs()
      .then(function (pair) {
        var reg = pair && pair.reg;
        var publicKey = pair && pair.publicKey;
        if (!reg || !reg.pushManager || !publicKey) return false;
        return createOrRepairPushSubscription(reg, publicKey, { fromGesture: false }).then(function (sub) {
          if (!sub) return false;
          return postPushSubscription(sub, { force: true }).then(function (ok) {
            if (ok) {
              lastPushErrorHint = "";
              rememberPushOk();
              setPushSubActive(true);
            }
            return ok === true;
          });
        });
      })
      .catch(function (err) {
        try {
          console.warn("[vc-push] recreate granted", err && err.message ? err.message : err);
        } catch (e) {}
        return false;
      });
  }
    function subscribeWebPushNative(opts) {
    var fromGesture = opts && opts.fromGesture === true;
    if (!webPushSupported()) return Promise.resolve(false);
    if (!normalizeUserId(currentUserId) || !getDiscordAccessToken()) return Promise.resolve(false);
    if (isIosLikeDevice() && !isStandalonePwa()) return Promise.resolve(false);
    if (typeof Notification !== "undefined" && Notification.permission === "denied") {
      return Promise.resolve(false);
    }
        if (!fromGesture) {
      return refreshPushSubscriptionState().then(function (ok) {
        if (ok) return true;
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          return recreateGrantedPush();
        }
        return false;
      }).then(function (ok) {
        syncPushPromptUi();
        return ok;
      });
    }
    if (pushNativeGestureInFlight) return Promise.resolve(false);

    function finishSub(sub) {
      if (!sub) throw new Error("no_subscription");
      return postPushSubscription(sub, { force: true }).then(function (ok) {
        if (!ok) throw new Error("subscribe_api");
        lastPushErrorHint = "";
        rememberPushOk();
        return true;
      });
    }

    function withPrereqs(reg, publicKey) {
      if (!reg || !reg.pushManager) throw new Error("sw_failed");
      markNativePushAsked();
      return reg.pushManager.getSubscription().then(function (existing) {
        if (existing) {
          if (publicKey && !subscriptionMatchesVapid(existing, publicKey)) {
            return createOrRepairPushSubscription(reg, publicKey, { fromGesture: true }).then(finishSub);
          }
          return finishSub(existing);
        }
        if (!publicKey) throw new Error("vapid_missing");
        return createOrRepairPushSubscription(reg, publicKey, { fromGesture: true }).then(finishSub);
      });
    }

    pushNativeGestureInFlight = true;
    var start;
    if (cachedPushReg && cachedVapidPublicKey) {
      try {
        start = withPrereqs(cachedPushReg, cachedVapidPublicKey);
      } catch (eStart) {
        start = Promise.reject(eStart);
      }
    } else {
      start = prefetchPushPrereqs().then(function (pair) {
        return withPrereqs(pair && pair.reg, pair && pair.publicKey);
      });
    }

    return start
      .then(function () {
        pushNativeGestureInFlight = false;
        setPushSubActive(true);
        syncPushPromptUi();
        return true;
      })
      .catch(function (err) {
        try {
          console.warn("[vc-push] subscribe error", err && err.message ? err.message : err);
        } catch (eLog) {}
        pushNativeGestureInFlight = false;
        // If browser already has a subscription, keep active — don't show false "vapid missing".
        return ensureServiceWorkerRegistration()
          .then(function (reg) {
            if (!reg || !reg.pushManager) return null;
            return reg.pushManager.getSubscription();
          })
          .then(function (existing) {
            if (existing) {
              lastPushErrorHint = "";
              rememberPushOk();
              setPushSubActive(true);
              syncPushPromptUi();
              postPushSubscription(existing, { force: true }).catch(function () {});
              return true;
            }
            lastPushErrorHint = describePushError(err);
            setPushSubActive(false);
            syncPushPromptUi();
            return false;
          })
          .catch(function () {
            lastPushErrorHint = describePushError(err);
            setPushSubActive(false);
            syncPushPromptUi();
            return false;
          });
      });
  }
  function maybeAskNativePush() {
    if (!webPushSupported()) return;
    if (!normalizeUserId(currentUserId) || !getDiscordAccessToken()) return;
    if (currentPushPermission() === "denied") return;
    if (isIosLikeDevice() && !isStandalonePwa()) return;
    if (needsPushPermissionRecover()) {
      tryRecoverPushFromGesture();
      return;
    }
    if (currentPushPermission() === "granted") {
      subscribeWebPushNative().then(function () {
        syncPushPromptUi();
      });
    }
  }
  function wirePushPermissionWatch() {
    if (!webPushSupported()) return;
    try {
      if (!navigator.permissions || typeof navigator.permissions.query !== "function") return;
      navigator.permissions.query({ name: "notifications" }).then(function (status) {
        if (!status) return;
        status.addEventListener("change", function () {
          syncPushPromptUi();
          if (String(status.state || "") === "granted") {
            refreshPushSubscriptionState().then(function () {
              syncPushPromptUi();
            });
          }
        });
      }).catch(function () {});
    } catch (e) {}
  }
  function syncExistingWebPushSubscription() {
    if (!webPushSupported()) return;
    if (!normalizeUserId(currentUserId) || !getDiscordAccessToken()) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (isIosLikeDevice() && !isStandalonePwa()) return;
    if (syncExistingPushInFlight) return syncExistingPushInFlight;
    syncExistingPushInFlight = subscribeWebPushNative()
      .then(function () {
        syncPushPromptUi();
      })
      .finally(function () {
        syncExistingPushInFlight = null;
      });
    return syncExistingPushInFlight;
  }
  function siteRealtimeWsUrl() {
    var c = typeof window !== "undefined" && window.__VC_SITE_NOTIFS ? window.__VC_SITE_NOTIFS : {};
    if (c.wsEnabled === false || c.wsEnabled === "false") return "";
    var explicit = String(c.wsUrl || "").trim();
    if (explicit) return explicit;
    var http = resolvedSiteNotificationsUrl();
    if (!http || typeof URL === "undefined") return "";
    try {
      var u = new URL(http);
      u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
      var path = String(u.pathname || "").replace(/\/$/, "");
      var dir = path.replace(/\/[^/]+$/, "");
      u.pathname = (dir || "") + "/site-realtime-ws";
      u.search = "";
      u.hash = "";
      return u.href;
    } catch (e) {
      return "";
    }
  }
  function disconnectSiteRealtimeWs() {
    if (siteRealtimeWsReconnectTimer) {
      clearTimeout(siteRealtimeWsReconnectTimer);
      siteRealtimeWsReconnectTimer = null;
    }
    try {
      if (siteRealtimeWs) {
        siteRealtimeWs.onclose = null;
        siteRealtimeWs.close();
      }
    } catch (e2) {}
    siteRealtimeWs = null;
  }
  function scheduleSiteRealtimeWsReconnect() {
    if (siteRealtimeWsReconnectTimer) return;
    siteRealtimeWsReconnectTimer = setTimeout(function () {
      siteRealtimeWsReconnectTimer = null;
      connectSiteRealtimeWebSocket();
    }, 8000);
  }
  function stopSiteNotifsPoll() {
    if (siteNotifsTimer) {
      clearInterval(siteNotifsTimer);
      siteNotifsTimer = null;
    }
  }
  function connectSiteRealtimeWebSocket() {
    if (typeof WebSocket === "undefined") return;
    var url = siteRealtimeWsUrl();
    if (!url) return;
    if (!normalizeUserId(currentUserId) || !getDiscordAccessToken()) return;
    if (siteRealtimeWsReconnectTimer) {
      clearTimeout(siteRealtimeWsReconnectTimer);
      siteRealtimeWsReconnectTimer = null;
    }
    try {
      if (siteRealtimeWs) {
        siteRealtimeWs.onclose = null;
        siteRealtimeWs.close();
      }
    } catch (e0) {}
    siteRealtimeWs = null;
    try {
      var ws = new WebSocket(url);
      siteRealtimeWs = ws;
      ws.onopen = function () {
                syncSiteNotificationsFromServer();
      };
      ws.onmessage = function (ev) {
        try {
          var data = JSON.parse(String(ev.data || "{}"));
          if (data.type === "notifications_changed") {
            syncSiteNotificationsFromServer();
          }
        } catch (e3) {}
      };
      ws.onclose = function () {
        siteRealtimeWs = null;
        if (normalizeUserId(currentUserId) && getDiscordAccessToken()) {
          restartSiteNotifsPollTimer();
          scheduleSiteRealtimeWsReconnect();
        }
      };
      ws.onerror = function () {
        try {
          ws.close();
        } catch (e4) {}
      };
    } catch (e5) {
      siteRealtimeWs = null;
    }
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
  function deleteSiteNotificationOnServer(id) {
    var token = getDiscordAccessToken();
    var uid = normalizeUserId(currentUserId);
    var sid = String(id || "").trim();
    if (!token || !uid || !sid || !/^[a-f0-9]{24}$/i.test(sid)) return Promise.resolve(false);
    var url = resolvedSiteNotificationsDeleteUrl();
    return fetch(url, {
      method: "POST",
      credentials: "omit",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id: sid }),
    })
      .then(function (res) {
        return res.ok;
      })
      .catch(function () {
        return false;
      });
  }
  function dismissOneSiteNotification(id) {
    var sid = String(id || "").trim();
    if (!sid) return;
    var now = Date.now();
    if (window.__vcLastDismissNotif === sid && now - (window.__vcLastDismissAt || 0) < 400) return;
    window.__vcLastDismissNotif = sid;
    window.__vcLastDismissAt = now;
    if (ephemeralDemo && String(ephemeralDemo.id || "") === sid) {
      rememberDismissedNotif(ephemeralDemo);
      ephemeralDemo = null;
    }
    var items = loadStored();
    var item = null;
    for (var di = 0; di < items.length; di += 1) {
      if (items[di] && String(items[di].id) === sid) {
        item = items[di];
        break;
      }
    }
    if (item) rememberDismissedNotif(item);
    else markDismissed(sid);
    saveStored(items.filter(function (n) { return String((n && n.id) || "") !== sid; }));
    render({ force: true });
    deleteSiteNotificationOnServer(sid);
  }
  window.__vcDismissNotif = dismissOneSiteNotification;
  function markSiteNotificationReadOnServer(id) {
    return markSiteNotificationsReadBatchOnServer([id]);
  }
  function markSiteNotificationsReadBatchOnServer(ids) {
    var token = getDiscordAccessToken();
    var uid = normalizeUserId(currentUserId);
    var list = Array.isArray(ids)
      ? ids.map(function (x) { return String(x || "").trim(); }).filter(Boolean)
      : [];
    if (!token || !uid || !list.length) return Promise.resolve(false);
    var body =
      list.length === 1
        ? JSON.stringify({ id: list[0] })
        : JSON.stringify({ ids: list });
    return fetch(resolvedSiteNotificationsReadUrl(), {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      credentials: "omit",
      keepalive: true,
      body: body,
    })
      .then(function (r) {
        if (!r || !r.ok) return false;
        return r
          .json()
          .then(function (j) {
            var ok = Boolean(
              j &&
                (j.updated === true || Number(j.modified) > 0 || (j.updated !== false && j.ok === true)),
            );
            if (ok) {
              for (var i = 0; i < list.length; i += 1) forgetPendingRead(list[i]);
            }
            return ok;
          })
          .catch(function () {
            return false;
          });
      })
      .catch(function () {
        return false;
      });
  }
  function markAllSiteNotificationsReadOnServer() {
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
  function markSiteNotificationsReadForTicketOnServer(ticketId) {
    var token = getDiscordAccessToken();
    var uid = normalizeUserId(currentUserId);
    var tid = String(ticketId || "").trim().toLowerCase();
    if (!token || !uid || !/^[a-f0-9]{24}$/i.test(tid)) return Promise.resolve(false);
    return fetch(resolvedSiteNotificationsReadUrl(), {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      credentials: "omit",
      keepalive: true,
      body: JSON.stringify({ ticketId: tid }),
    })
      .then(function (r) {
        return r && r.ok;
      })
      .catch(function () {
        return false;
      });
  }
  function dismissOsNotifications(spec) {
    spec = spec || {};
    var ticketId = String(spec.ticketId || "").trim().toLowerCase();
    var id = String(spec.id || "").trim();
    var ticketIds = Array.isArray(spec.ticketIds) ? spec.ticketIds : [];
    var ids = Array.isArray(spec.ids) ? spec.ids : [];
    var all = spec.all === true;
    var ticketMap = {};
    var idMap = {};
    if (ticketId) ticketMap[ticketId] = true;
    if (id) idMap[id] = true;
    for (var ti = 0; ti < ticketIds.length; ti += 1) {
      var t = String(ticketIds[ti] || "").trim().toLowerCase();
      if (t) ticketMap[t] = true;
    }
    for (var ii = 0; ii < ids.length; ii += 1) {
      var n = String(ids[ii] || "").trim();
      if (n) idMap[n] = true;
    }
    function matches(notif) {
      if (!notif) return false;
      if (all) return true;
      var d = notif.data && typeof notif.data === "object" ? notif.data : {};
      var nTid = String(d.ticketId || "").toLowerCase();
      var nId = String(d.id || "");
      var nMsg = String(d.messageId || "");
      var nTag = String(notif.tag || "");
      if (nTid && ticketMap[nTid]) return true;
      if (nId && idMap[nId]) return true;
      if (nMsg && (idMap[nMsg] || idMap[nId])) return true;
      for (var tk in ticketMap) {
        if (!ticketMap[tk]) continue;
        if (nTag === "vc-site-ticket-" + tk) return true;
        if (nTag.indexOf("vc-site-ticket-" + tk + "-") === 0) return true;
      }
      for (var ik in idMap) {
        if (!idMap[ik]) continue;
        if (nTag === "vc-site-" + ik || nTag.indexOf("vc-site-" + ik) === 0) return true;
        if (nTag === "vc-site-msg-" + ik) return true;
      }
      return false;
    }
    var payload = {
      type: "vc:dismiss-notifs",
      ticketId: ticketId,
      id: id,
      ticketIds: Object.keys(ticketMap),
      ids: Object.keys(idMap),
      all: all,
    };
    function postDismiss(sw) {
      try {
        if (sw) sw.postMessage(payload);
      } catch (ePost) {}
    }
    try {
      postDismiss(navigator.serviceWorker && navigator.serviceWorker.controller);
    } catch (eMsg) {}
    if (!("serviceWorker" in navigator)) return;
    var retry = Number(spec.retry || 0);
    navigator.serviceWorker.ready
      .then(function (reg) {
        postDismiss(reg && reg.active);
        if (!reg || typeof reg.getNotifications !== "function") return;
        function closeListed(list) {
          (list || []).forEach(function (notif) {
            try {
              if (matches(notif)) notif.close();
            } catch (eClose) {}
          });
        }
        var jobs = [reg.getNotifications()];
        try {
          jobs.push(reg.getNotifications({ includeTriggered: true }));
        } catch (eInc) {}
        return Promise.all(
          jobs.map(function (p) {
            return Promise.resolve(p).then(closeListed).catch(function () {});
          }),
        );
      })
      .then(function () {
        if (!all || retry >= 2) return;
        window.setTimeout(function () {
          dismissOsNotifications({ all: true, retry: retry + 1 });
        }, 350 * (retry + 1));
      })
      .catch(function () {});
  }
  function isPhoneOrInstalledPwa() {
    if (isStandalonePwa()) return true;
    if (isIosLikeDevice()) return true;
    try {
      return /Android/i.test(String(navigator.userAgent || ""));
    } catch (e) {
      return false;
    }
  }
  function clearMobileOsToastsOnAppOpen() {
    dismissOsNotificationsForReadItems(loadStored());
  }
  function dismissOsNotificationsForReadItems(items) {
    var ticketIds = [];
    var ids = [];
    for (var i = 0; i < (items || []).length; i += 1) {
      var it = items[i];
      if (!it || !it.read) continue;
      var tid = String(it.ticketId || "").trim().toLowerCase();
      if (tid) ticketIds.push(tid);
      var nid = String(it.id || "").trim();
      if (nid) ids.push(nid);
    }
    if (!ticketIds.length && !ids.length) return;
    dismissOsNotifications({ ticketIds: ticketIds, ids: ids });
  }
  var lastTicketNotifMark = { id: "", at: 0 };
  function markTicketNotificationsRead(ticketId) {
    var tid = String(ticketId || "").trim().toLowerCase();
    if (!/^[a-f0-9]{24}$/i.test(tid)) return;
    var now = Date.now();
    var localUnread = 0;
    saveStored(
      loadStored().map(function (x) {
        if (!x || x.read) return x;
        if (extractTicketIdFromNotif(x) !== tid) return x;
        localUnread += 1;
        rememberPendingRead(x.id);
        return Object.assign({}, x, { read: true });
      }),
    );
    if (localUnread) render();
    dismissOsNotifications({ ticketId: tid });
    if (!localUnread && lastTicketNotifMark.id === tid && now - lastTicketNotifMark.at < 4000) return;
    lastTicketNotifMark = { id: tid, at: now };
    markSiteNotificationsReadForTicketOnServer(tid).finally(function () {
      window.setTimeout(function () {
        syncSiteNotificationsFromServer();
      }, 400);
    });
  }
  try {
    window.__vcMarkTicketNotificationsRead = markTicketNotificationsRead;
  } catch (eMarkTicket) {}
  function mapServerRowToStoredItem(row) {
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
    var ticketId = extractTicketIdFromNotif(row) || extractTicketIdFromOpenUrl(openUrl);
    var channel =
      String((row && row.channel) || "").toLowerCase() === "inbox"
        ? "inbox"
        : String((row && row.channel) || "").toLowerCase() === "personal"
          ? "personal"
          : "";
    var mappedRow = {
      id: String(row.id || "").trim(),
      title: String((row && row.title) || ""),
      body: String((row && row.body) || ""),
      at: atMs,
      read: Boolean(row.read === true || row.readAt),
      kind: kind,
      openUrl: openUrl,
      ticketId: ticketId,
      filtered: Boolean(row && row.filtered),
      channel: channel,
      dedupeKey: String((row && row.dedupeKey) || "").trim(),
    };
    if (!mappedRow.channel) {
      mappedRow.channel = isInboxLinkedNotifClient(mappedRow) ? "inbox" : "personal";
    }
    return mappedRow;
  }
  function mergeStoredWithServerNotificationList(list, uid) {
    var oldItems = loadStored();
    var beforeSig = buildNotifStoreSignature(oldItems);
    var dismissed = loadDismissedSet(uid);
    var oldIdMap = {};
    var oldById = {};
    for (var oi = 0; oi < oldItems.length; oi += 1) {
      var oix = oldItems[oi];
      var oid = String((oix && oix.id) || "").trim();
      if (oid) {
        oldIdMap[oid] = true;
        oldById[oid] = oix;
      }
    }
    var pendingReadMap = loadPendingReadMap();
    var markAllRecent = isRecentMarkAllRead();
    var serverIdMap = {};
    var fromServer = [];
    for (var i = 0; i < list.length; i += 1) {
      var row = list[i];
      if (!row || !row.title) continue;
      var sid = String(row.id || "").trim();
      if (!sid) continue;
      var mapped = mapServerRowToStoredItem(row);
      if (isVoteRegisteredNotifClient(mapped)) continue;
      var fpId = buildNotifFingerprintId(mapped, uid, mapped.kind, mapped.openUrl);
      if (isClearedAwayServerRow(mapped, dismissed)) continue;
      serverIdMap[sid] = true;
      var oldSame = oldById[sid];
      if (mapped.read) {
        forgetPendingRead(sid);
        if (fpId) forgetPendingRead(fpId);
      } else if (
        !markAllRecent &&
        (pendingReadMap[sid] || (fpId && pendingReadMap[fpId])) &&
        oldSame &&
        !sameNotifPayload(oldSame, mapped)
      ) {
        delete pendingReadMap[sid];
        if (fpId) delete pendingReadMap[fpId];
        forgetPendingRead(sid);
        if (fpId) forgetPendingRead(fpId);
      }
      var watchingThis =
        !mapped.read && isWatchingTicketChat(mapped.ticketId, mapped.openUrl);
      if (watchingThis) {
        mapped.read = true;
        rememberPendingRead(sid);
        rememberClickRead(sid);
      }
      fromServer.push(
        Object.assign({}, mapped, {
          read:
            Boolean(mapped.read) ||
            Boolean(markAllRecent) ||
            Boolean(oldSame && oldSame.read) ||
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
            if (!isClientLocalNotifId(lid) || serverIdMap[lid]) continue;
      var exKind = String((it && it.kind) || "info");
      var exOpen = String((it && it.openUrl) || "");
      var fpId = buildNotifFingerprintId(it, uid, exKind, exOpen);
      if (dismissed.has(lid) || dismissed.has(fpId)) continue;
      keepLocal.push(it);
    }
    var merged = keepLocal.concat(fromServer);
    saveStored(merged);
    dismissOsNotificationsForReadItems(merged);
    var changed = beforeSig !== buildNotifStoreSignature(merged);
    var freshMs = 600000;
    var toastRow = null;
    var toastedMap = loadToastedMap();
    for (var ti = 0; ti < fromServer.length; ti += 1) {
      var fr = fromServer[ti];
      if (!fr) continue;
      var frid = String(fr.id || "").trim();
      if (!frid || oldIdMap[frid]) continue;
      if (toastedMap[frid]) continue;
      if (isFilteredNotif(fr)) continue;
      if (isNotifDismissed(fr, uid, dismissed)) continue;
      if (Date.now() - (fr.at || 0) >= freshMs) continue;
      if (fr.read) continue;
      var oldSameRead = oldById[frid];
      if (oldSameRead && oldSameRead.read) continue;
      if (isWatchingTicketChat(fr.ticketId, fr.openUrl)) continue;
      var candidate = {
        id: fr.id,
        title: fr.title,
        body: fr.body,
        kind: fr.kind,
        at: fr.at,
        read: fr.read,
        openUrl: fr.openUrl,
        ticketId: fr.ticketId,
        messageId: fr.messageId,
      };
            if (!toastRow || fr.kind === "vote") {
        toastRow = candidate;
        if (fr.kind === "vote") break;
      }
    }
    return { toastRow: toastRow, changed: changed };
  }
  function syncSiteNotificationsFromServer(opts) {
    opts = opts || {};
    var token = getDiscordAccessToken();
    var uid = normalizeUserId(currentUserId);
    if (!token || !uid) return;
    var url = resolvedSiteNotificationsUrl();
    if (!url) return;
    var now = Date.now();
    if (!opts.force && siteNotifsLastSyncAt && now - siteNotifsLastSyncAt < SITE_NOTIFS_MIN_GAP_MS) return;
    if (siteNotifsBlockedUntil > now) return;
    if (window.VcApiCache && typeof window.VcApiCache.isWebhookBlocked === "function") {
      if (window.VcApiCache.isWebhookBlocked(url)) return;
    }
    if (siteNotifsSyncInFlight) return siteNotifsSyncInFlight;
    var ctrl = null;
    var tid = null;
    try {
      ctrl = new AbortController();
      tid = setTimeout(function () {
        try {
          ctrl.abort();
        } catch (eAb) {}
      }, 12000);
    } catch (e0) {
      ctrl = null;
    }
    var opts = {
      headers: { Authorization: "Bearer " + token },
      credentials: "omit",
    };
    try {
      if (window.VcPerf && typeof window.VcPerf.apiHeaders === "function") {
        opts.headers = window.VcPerf.apiHeaders(opts.headers, url);
      }
      if (window.VcPerf && typeof window.VcPerf.notificationsLimit === "function") {
        var lim = window.VcPerf.notificationsLimit(50);
        url += (url.indexOf("?") >= 0 ? "&" : "?") + "limit=" + encodeURIComponent(String(lim));
        if (window.VcPerf.isLite && window.VcPerf.isLite()) url += "&lite=1&perf=lite";
        else if (window.VcPerf.tier && window.VcPerf.tier() === "mid") url += "&perf=mid";
      }
    } catch (ePerfN) {}
    if (ctrl) opts.signal = ctrl.signal;
    siteNotifsSyncInFlight = fetch(url, opts)
      .then(function (r) {
        if (r && r.status === 429) {
          var blockMs = 90000;
          try {
            if (
              (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
              Number(navigator.maxTouchPoints || 0) > 0
            ) {
              blockMs = 35000;
            }
          } catch (eMob429) {}
          siteNotifsBlockedUntil = Date.now() + blockMs;
          try {
            if (window.VcApiCache && typeof window.VcApiCache.noteWebhook429 === "function") {
              window.VcApiCache.noteWebhook429(Number(r.headers.get("Retry-After") || "0"), url);
            }
          } catch (eN429) {}
          return null;
        }
        if (r && r.status === 401) {
          try {
            if (typeof window.__vcDiscordGetAccessToken === "function" && !window.__vcDiscordGetAccessToken()) {
              localStorage.removeItem(DISCORD_ACCESS_TOKEN_KEY);
            }
          } catch (e401) {}
          return null;
        }
        return r.json();
      })
      .then(function (j) {
        if (!j || j.ok !== true || !Array.isArray(j.items)) return;
        var list = j.items.slice().reverse();
        var mergeResult = mergeStoredWithServerNotificationList(list, uid);
        if (mergeResult.changed) render();
        tryFlushClickReads();
        dismissOsNotificationsForReadItems(loadStored());
        if (mergeResult.toastRow && shouldPlayNotifAlert(mergeResult.toastRow)) {
          var toastId = String(mergeResult.toastRow.id || "").trim();
          if (toastId) rememberToastedId(toastId);
          playNotifSound();
          showNativeOsBanner(mergeResult.toastRow);
          try {
            showNotifFlyToast(mergeResult.toastRow);
          } catch (eFlySync) {}
          pulseNotifSummary();
        } else if (mergeResult.toastRow) {
          var mutedId = String(mergeResult.toastRow.id || "").trim();
          if (mutedId) rememberToastedId(mutedId);
        }
      })
      .catch(function () {})
      .finally(function () {
        siteNotifsSyncInFlight = null;
        siteNotifsLastSyncAt = Date.now();
        try {
          if (tid) clearTimeout(tid);
        } catch (e1) {}
      });
    return siteNotifsSyncInFlight;
  }
  function siteNotifsPollDelayMs() {
    try {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return SITE_NOTIFS_POLL_HIDDEN_MS;
      }
    } catch (e) {}
    /* phoneNotifFlyCard1: stesso poll del PC (prima 60s su touch → in-app in ritardo). */
    return SITE_NOTIFS_POLL_MS;
  }
  function restartSiteNotifsPollTimer() {
    stopSiteNotifsPoll();
    if (!normalizeUserId(currentUserId) || !getDiscordAccessToken()) return;
    siteNotifsTimer = setInterval(syncSiteNotificationsFromServer, siteNotifsPollDelayMs());
  }
  function scheduleSiteNotificationsPolling() {
    stopSiteNotifsPoll();
    disconnectSiteRealtimeWs();
    try {
      if (document.body && document.body.classList.contains("vc-dashboard-page")) return;
      if (window.__VC_SITE_DASHBOARD && !window.__VC_SITE_NOTIFS) return;
      if (!document.getElementById("vc-notif-dropdown")) return;
    } catch (eDd) {}
    if (!normalizeUserId(currentUserId) || !getDiscordAccessToken()) return;
    if (siteNotifsPollBooted) {
      restartSiteNotifsPollTimer();
      return;
    }
    siteNotifsPollBooted = true;
    syncSiteNotificationsFromServer();
    if (pushSubActive !== true) syncExistingWebPushSubscription();
        restartSiteNotifsPollTimer();
    var wsUrl = siteRealtimeWsUrl();
    var rs = siteRealtimeWs ? siteRealtimeWs.readyState : 3;
    if (wsUrl && rs !== 0 && rs !== 1) connectSiteRealtimeWebSocket();
  }
  var notifSheetResizeWired = false;
  var notifSheetEscWired = false;
  var bellNotifScope = "personal";
  var bellNotifScopeWired = false;
  var bellStaffSummaryAt = 0;
  var bellStaffSummaryInFlight = null;
  var bellStaffPerms = null;
  var bellStaffQueueCache = Object.create(null);
  var bellStaffQueueInFlight = Object.create(null);
  var BELL_INBOX_PAGE_SIZE = 8;
  var BELL_SCOPE_PREF_KEY = "vc_notif_scope_pref";
  /* notifSidebar3: declare queue cache/inFlight (were undeclared → expand stuck on Caricamento…). */
  /* notifInboxGate1: Pause = HS-only; hide gated rows until perms (like Punti tolti). */
  var BELL_INBOX_ROWS = [
    { id: "pause", label: "Pause", icon: "fa-pause-circle", requiresHighStaff: true },
    { id: "candidature", label: "Candidature", icon: "fa-file-text-o", requiresCandidatureReview: true },
    { id: "appelli", label: "Appelli", icon: "fa-balance-scale", requiresAppelliReview: true },
    { id: "resoconti", label: "Resoconti", icon: "fa-bar-chart" },
    { id: "punti-tolti", label: "Punti tolti", icon: "fa-minus-circle", punti: true },
  ];

  function readBellScopePref() {
    try {
      var v = String(localStorage.getItem(BELL_SCOPE_PREF_KEY) || "")
        .trim()
        .toLowerCase();
      if (v === "staff" || v === "personal") return v;
    } catch (ePref) {}
    return "";
  }

  function writeBellScopePref(next) {
    try {
      localStorage.setItem(BELL_SCOPE_PREF_KEY, next === "staff" ? "staff" : "personal");
    } catch (eWrite) {}
  }

  function readBellScopeFromUrl() {
    try {
      var sp = new URLSearchParams(location.search || "");
      var view = String(sp.get("view") || sp.get("tab") || "")
        .trim()
        .toLowerCase();
      if (view === "staff") return "staff";
    } catch (eUrl) {}
    return "";
  }

  function canBellStaffInbox() {
    /* notifMobileSwitch1: do NOT require offsetParent — on phone the staff link/snav
       is often display:none in the header while still present in DOM. Page dock
       (revealTabs) already treats that as staff; bell switcher must match. */
    try {
      if (window.VcNotifScope && typeof window.VcNotifScope.canStaff === "function") {
        if (window.VcNotifScope.canStaff()) return true;
      }
    } catch (eApi) {}
    try {
      if (window.__VC_STAFF_MENU_ALLOWED === true) return true;
      var p = window.__VC_STAFF_PERMS;
      if (p && typeof p === "object" && p.ok) return true;
      var token = getDiscordAccessToken();
      if (token) {
        var fp = String(token).slice(0, 24);
        try {
          var menu = JSON.parse(sessionStorage.getItem("vc_menu_staff_v1") || "null");
          if (menu && menu.allowed && menu.fp === fp && Date.now() - Number(menu.at || 0) < 300000) {
            return true;
          }
        } catch (eMenu) {}
        try {
          var gate = JSON.parse(
            sessionStorage.getItem("vc_staff_access_ok_v2") ||
              localStorage.getItem("vc_staff_access_ok_v2_local") ||
              "null",
          );
          if (gate && gate.ok === true && Number(gate.exp || 0) > Date.now()) return true;
        } catch (eGate) {}
      }
      var link = document.getElementById("discord-staff-link");
      if (link && !link.hasAttribute("hidden")) return true;
      if (
        document.querySelector(
          "[data-vc-staff-tools-nav], .vc-snav-details--staff, .vc-header-snav [data-vc-staff-nav], .vc-snav-details[data-vc-staff-nav], #vc-staff-snav-details, #discord-staff-link:not([hidden])",
        )
      ) {
        return true;
      }
    } catch (eCan) {}
    return false;
  }

  function staffWorkflowsApiBase() {
    try {
      var c = window.__VC_STAFF_WORKFLOWS;
      if (c && typeof c === "object") {
        var u = String(c.apiUrl || "").trim();
        if (u) return u;
      }
    } catch (eCfg) {}
    return "/webhooks/site-staff-workflows";
  }

  function notificationsStaffPageUrl(inboxId, itemId) {
    try {
      var u = new URL(NOTIFICATIONS_PATH, window.location.origin);
      u.searchParams.set("view", "staff");
      if (inboxId) u.searchParams.set("inbox", String(inboxId));
      if (itemId) {
        u.searchParams.set("item", String(itemId));
        u.searchParams.set("scope", "pending");
      }
      return u.toString();
    } catch (eUrl) {
      var q = "?view=staff";
      if (inboxId) q += "&inbox=" + encodeURIComponent(String(inboxId));
      if (itemId) {
        q += "&item=" + encodeURIComponent(String(itemId)) + "&scope=pending";
      }
      return NOTIFICATIONS_PATH + q;
    }
  }

  function readBellStaffPerms() {
    var perms = {};
    try {
      var g = window.__VC_STAFF_PERMS;
      if (g && typeof g === "object" && g.ok) {
        Object.keys(g).forEach(function (k) {
          perms[k] = g[k];
        });
      }
    } catch (eG) {}
    var extra = bellStaffPerms && typeof bellStaffPerms === "object" ? bellStaffPerms : null;
    if (!extra) {
      try {
        var cached = readCachedBellStaffSummary();
        if (cached && cached.permissions) extra = cached.permissions;
      } catch (eCache) {}
    }
    if (extra && typeof extra === "object") {
      Object.keys(extra).forEach(function (k) {
        perms[k] = extra[k];
      });
    }
    return perms;
  }

  function bellInboxRowIsGated(row) {
    if (!row) return true;
    if (row.punti || row.id === "punti-tolti") return true;
    if (row.requiresHighStaff || row.id === "pause") return true;
    if (row.requiresCandidatureReview || row.id === "candidature") return true;
    if (row.requiresAppelliReview || row.id === "appelli") return true;
    return false;
  }

  function canBellInboxRow(row) {
    if (!row) return false;
    var perms = readBellStaffPerms();
    var hasPerms = Boolean(
      perms &&
        (Object.prototype.hasOwnProperty.call(perms, "highStaff") ||
          Object.prototype.hasOwnProperty.call(perms, "candidatureReview") ||
          Object.prototype.hasOwnProperty.call(perms, "appelliReview") ||
          Object.prototype.hasOwnProperty.call(perms, "isPm") ||
          Object.prototype.hasOwnProperty.call(perms, "pm") ||
          Object.prototype.hasOwnProperty.call(perms, "isHighStaff") ||
          Object.prototype.hasOwnProperty.call(perms, "canViewPmPointsRemoved")),
    );
    if (!hasPerms) {
      /* Optimistic: only ungated queues (Resoconti) before perms; mirror Punti tolti gate. */
      return !bellInboxRowIsGated(row);
    }
    /* Pause API is High Staff only — do not treat director as HS. */
    var high = Boolean(perms.highStaff || perms.isHighStaff || perms.canManage);
    var highOrDirector = high || Boolean(perms.director);
    var pm = Boolean(perms.isPm || perms.pm || perms.partnerManager || perms.isPmGestore);
    if (row.punti || row.id === "punti-tolti") {
      return Boolean(perms.canViewPmPointsRemoved) || highOrDirector || pm;
    }
    if (row.requiresHighStaff || row.id === "pause") return high;
    if (row.requiresCandidatureReview || row.id === "candidature") {
      return Boolean(perms.candidatureReview) || highOrDirector;
    }
    if (row.requiresAppelliReview || row.id === "appelli") {
      return Boolean(perms.appelliReview) || highOrDirector;
    }
    return true;
  }

  function hideBellInboxForbiddenRow(row) {
    if (!row || !row.id) return;
    try {
      var list = document.getElementById("vc-notif-bell-inbox-list");
      if (!list) return;
      var el = list.querySelector('[data-bell-inbox="' + String(row.id).replace(/"/g, "") + '"]');
      if (!el) return;
      el.remove();
      var hint = document.getElementById("vc-notif-bell-inbox-hint");
      var left = list.querySelectorAll(".vc-notif-bell-inbox__row").length;
      if (hint) {
        hint.textContent = "";
        hint.hidden = true;
        hint.setAttribute("hidden", "");
      }
      void left;
    } catch (eHide) {}
  }

  function isBellInboxForbiddenErr(err) {
    if (!err) return false;
    if (Number(err.status) === 403) return true;
    var msg = String(err.message || err.error || "").toLowerCase();
    return (
      msg.indexOf("solo high staff") >= 0 ||
      msg.indexOf("forbidden") >= 0 ||
      msg.indexOf("non hai i permessi") >= 0
    );
  }

  /* notifApiErr1: 401 / abort / rete soft → non toastare come fallimento duro */
  function isBellInboxBenignErr(err) {
    if (!err) return true;
    if (err.benign === true) return true;
    var st = Number(err.status) || 0;
    if (st === 401 || st === 403 || st === 0 || st === 408 || st === 429) return true;
    var msg = String(err.message || err.error || "").toLowerCase();
    return (
      msg.indexOf("abort") >= 0 ||
      msg.indexOf("timeout") >= 0 ||
      msg.indexOf("network") >= 0 ||
      msg.indexOf("missing_token") >= 0 ||
      msg.indexOf("invalid_token") >= 0 ||
      msg.indexOf("accedi") >= 0 ||
      msg.indexOf("invalid_json") >= 0 ||
      msg.indexOf("empty") >= 0 ||
      msg.indexOf("rate_limited") >= 0
    );
  }

  function escBellHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function bellInboxItemFocusId(queueId, item) {
    if (!item) return "";
    if (queueId === "pause") return String(item.id || "").trim();
    if (queueId === "punti-tolti") return String(item.messageId || item.id || "").trim();
    return String(item.messageId || item.recordId || item.id || "").trim();
  }

  function bellInboxItemLabel(queueId, item) {
    if (!item) return "Richiesta";
    if (queueId === "punti-tolti") {
      var pm = item.pm || {};
      var who = String(pm.displayName || pm.userId || "").trim();
      var rule = String(item.rule || "").trim();
      if (who && rule) return who + " · " + rule;
      return who || rule || "Punti tolti";
    }
    var name = String(item.displayName || "").trim();
    var title = String(item.title || "").trim();
    var type = String(item.type || item.kind || "").trim();
    if (name && !/^\d{16,22}$/.test(name)) return name;
    if (title) return title;
    if (type) return type;
    return "Richiesta";
  }

  /* notifCats2: richer inbox queue row (who / what / when). */
  function bellInboxItemDetail(queueId, item) {
    if (!item) return { title: "Richiesta", subtitle: "", when: "", avatarUrl: "" };
    var title = bellInboxItemLabel(queueId, item);
    var subtitle = "";
    var avatarUrl = String(item.avatarUrl || "").trim();
    if (queueId === "pause") {
      var start = String(item.start || "").trim();
      var end = String(item.end || "").trim();
      var role = String(item.ruoloRichiesto || item.ruoloTrack || "").trim();
      var period = start && end ? start + " → " + end : start || end;
      var bits = [];
      if (role) bits.push(role);
      if (period) bits.push(period);
      var motiv = String(item.motivazione || item.preview || "").trim();
      if (motiv && bits.length < 2) bits.push(motiv.slice(0, 80));
      subtitle = bits.join(" · ");
    } else if (queueId === "punti-tolti") {
      var pm2 = item.pm || {};
      title = String(pm2.displayName || pm2.userId || title).trim() || "Punti tolti";
      avatarUrl = String(pm2.avatarUrl || item.avatarUrl || "").trim();
      var rule2 = String(item.rule || "").trim();
      var reporter = String((item.reporter && item.reporter.displayName) || item.reporterName || "").trim();
      subtitle = [rule2, reporter ? "da " + reporter : ""].filter(Boolean).join(" · ");
    } else if (queueId === "resoconti") {
      var resoTitle = String(item.title || "").trim();
      if (resoTitle && resoTitle !== title) subtitle = resoTitle;
      else subtitle = String(item.preview || item.roleLabel || item.kind || "").trim().slice(0, 100);
    } else {
      subtitle = String(item.preview || item.title || item.type || item.kind || "").trim().slice(0, 100);
      if (subtitle === title) subtitle = "";
    }
    var whenMs = Date.parse(String(item.createdAt || item.updatedAt || item.at || "")) || 0;
    var when = whenMs ? timeAgoLocalized(whenMs) : "";
    return { title: title, subtitle: subtitle, when: when, avatarUrl: avatarUrl };
  }

  function navigateBellInboxHref(href) {
    var ddNav = document.getElementById("vc-notif-dropdown");
    if (ddNav) requestCloseNotifDropdown(ddNav);
    openNotifDestination(href, "mod");
  }

  function puntiToltiApiBase() {
    try {
      var c = window.__VC_STAFF_PM_POINTS_REMOVED;
      if (c && typeof c === "object") {
        var u = String(c.apiUrl || "").trim();
        if (u) return u;
      }
    } catch (eCfg) {}
    return "/webhooks/site-staff-pm-points-removed";
  }

  function fetchBellInboxQueueItems(row) {
    var id = row && row.id ? String(row.id) : "";
    if (!id) return Promise.resolve([]);
    if (bellStaffQueueInFlight[id]) return bellStaffQueueInFlight[id];
    var cached = bellStaffQueueCache[id];
    if (cached && cached.ok !== false && Date.now() - Number(cached.at || 0) < 20000) {
      return Promise.resolve(cached.items || []);
    }
    var token = getDiscordAccessToken();
    if (!token) {
      return Promise.reject(new Error("Accedi per vedere questa coda."));
    }

    var url;
    if (row.punti || id === "punti-tolti") {
      var pt = puntiToltiApiBase();
      url =
        pt +
        (pt.indexOf("?") >= 0 ? "&" : "?") +
        "limit=" +
        encodeURIComponent(String(BELL_INBOX_PAGE_SIZE)) +
        "&pending=1";
    } else {
      var api = staffWorkflowsApiBase();
      url =
        api +
        (api.indexOf("?") >= 0 ? "&" : "?") +
        "queue=" +
        encodeURIComponent(id) +
        "&scope=pending&pageSize=" +
        encodeURIComponent(String(BELL_INBOX_PAGE_SIZE));
    }

    bellStaffQueueInFlight[id] = fetch(url, {
      method: "GET",
      credentials: "include",
      headers: { Authorization: "Bearer " + token, Accept: "application/json" },
      cache: "no-store",
    })
      .then(function (res) {
        return res
          .json()
          .catch(function () {
            return null;
          })
          .then(function (body) {
            return { ok: res.ok, status: res.status, body: body };
          });
      })
      .then(function (out) {
        /* notifApiErr1: ok:true senza items → lista vuota, non errore */
        if (out && out.body && out.body.ok === true) {
          var itemsOk = Array.isArray(out.body.items) ? out.body.items : [];
          itemsOk = itemsOk.slice(0, BELL_INBOX_PAGE_SIZE);
          bellStaffQueueCache[id] = { at: Date.now(), items: itemsOk, ok: true };
          if (out.body.permissions) {
            bellStaffPerms = out.body.permissions;
          }
          return itemsOk;
        }
        var st = Number(out && out.status) || 0;
        var msg =
          (out && out.body && (out.body.message || out.body.error)) ||
          (st === 401 ? "Accedi per vedere questa coda." : "Impossibile caricare la coda.");
        var err = new Error(String(msg));
        err.status = st;
        err.benign =
          st === 401 ||
          st === 403 ||
          st === 0 ||
          st === 408 ||
          st === 429 ||
          st >= 500 ||
          !out ||
          !out.body;
        throw err;
      })
      .catch(function (err) {
        if (cached && cached.ok !== false && Array.isArray(cached.items)) {
          return cached.items;
        }
        throw err || new Error("Impossibile caricare la coda.");
      })
      .finally(function () {
        bellStaffQueueInFlight[id] = null;
      });
    return bellStaffQueueInFlight[id];
  }

  function renderBellInboxItems(row, host, items) {
    if (!host) return;
    host.innerHTML = "";
    host.hidden = false;
    host.removeAttribute("hidden");
    var queueItems = Array.isArray(items) ? items.slice() : [];
    var ptExtra = [];
    if (row && row.id === "punti-tolti") {
      ptExtra = inboxNotifsForBucket("punti-tolti");
      ptExtra.forEach(function (n) {
        var item = document.createElement("li");
        item.className =
          "vc-notif-bell-inbox__item vc-notif-bell-inbox__item--rich" + (n.read ? "" : " is-unread");
        var a = document.createElement("a");
        a.className = "vc-notif-bell-inbox__item-link vc-notif-bell-inbox__item-link--rich";
        var dest = String(n.openUrl || "").trim();
        a.href = dest ? resolveNotifDestUrl(dest) : notificationsStaffPageUrl("punti-tolti");
        var bodySnip = String(n.body || "").trim().slice(0, 110);
        var whenTxt = timeAgoLocalized(n.at || Date.now());
        a.innerHTML =
          '<span class="vc-notif-bell-inbox__item-dot" aria-hidden="true"></span>' +
          '<span class="vc-notif-bell-inbox__item-copy">' +
          '<span class="vc-notif-bell-inbox__item-label">' +
          escBellHtml(String(n.title || "Punti tolti")) +
          "</span>" +
          (bodySnip
            ? '<span class="vc-notif-bell-inbox__item-sub">' + escBellHtml(bodySnip) + "</span>"
            : "") +
          '<span class="vc-notif-bell-inbox__item-time">' +
          escBellHtml(whenTxt) +
          "</span>" +
          "</span>";
        a.addEventListener("click", function (ev) {
          ev.preventDefault();
          try {
            markOneRead(n.id);
          } catch (eMark) {}
          navigateBellInboxHref(a.href);
        });
        item.appendChild(a);
        host.appendChild(item);
      });
    }
    if (!queueItems.length && !ptExtra.length) {
      var empty = document.createElement("li");
      empty.className = "vc-notif-bell-inbox__item vc-notif-bell-inbox__item--empty";
      empty.textContent = "Nessuna richiesta";
      host.appendChild(empty);
      return;
    }
    queueItems.forEach(function (item) {
      var li = document.createElement("li");
      li.className = "vc-notif-bell-inbox__item vc-notif-bell-inbox__item--rich";
      var a = document.createElement("a");
      a.className = "vc-notif-bell-inbox__item-link vc-notif-bell-inbox__item-link--rich";
      var focusId = bellInboxItemFocusId(row.id, item);
      a.href = notificationsStaffPageUrl(row.id, focusId);
      var det = bellInboxItemDetail(row.id, item);
      var avHtml = det.avatarUrl
        ? '<img class="vc-notif-bell-inbox__item-av" src="' +
          escBellHtml(det.avatarUrl) +
          '" alt="" width="28" height="28" loading="lazy" decoding="async" />'
        : '<span class="vc-notif-bell-inbox__item-av vc-notif-bell-inbox__item-av--ph" aria-hidden="true"><i class="fa fa-user"></i></span>';
      a.innerHTML =
        avHtml +
        '<span class="vc-notif-bell-inbox__item-copy">' +
        '<span class="vc-notif-bell-inbox__item-label">' +
        escBellHtml(det.title) +
        "</span>" +
        (det.subtitle
          ? '<span class="vc-notif-bell-inbox__item-sub">' + escBellHtml(det.subtitle) + "</span>"
          : "") +
        (det.when
          ? '<span class="vc-notif-bell-inbox__item-time">' + escBellHtml(det.when) + "</span>"
          : "") +
        "</span>" +
        '<i class="fa fa-chevron-right" aria-hidden="true"></i>';
      a.addEventListener("click", function (ev) {
        ev.preventDefault();
        navigateBellInboxHref(a.href);
      });
      li.appendChild(a);
      host.appendChild(li);
    });
    var more = document.createElement("li");
    more.className = "vc-notif-bell-inbox__item vc-notif-bell-inbox__item--more";
    var moreA = document.createElement("a");
    moreA.className = "vc-notif-bell-inbox__item-link vc-notif-bell-inbox__item-link--more";
    moreA.href = notificationsStaffPageUrl(row.id);
    moreA.textContent = "Apri inbox completa";
    moreA.addEventListener("click", function (ev) {
      ev.preventDefault();
      navigateBellInboxHref(moreA.href);
    });
    more.appendChild(moreA);
    host.appendChild(more);
  }

  function renderBellInboxLoadError(row, host, message) {
    if (!host) return;
    host.innerHTML = "";
    host.hidden = false;
    host.removeAttribute("hidden");
    var li = document.createElement("li");
    li.className = "vc-notif-bell-inbox__item vc-notif-bell-inbox__item--empty vc-notif-bell-inbox__item--error";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "vc-notif-bell-inbox__retry";
    btn.textContent = String(message || "Errore di caricamento") + " — riprova";
    btn.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      host.removeAttribute("data-loaded");
      host.removeAttribute("data-loading");
      host.innerHTML =
        '<li class="vc-notif-bell-inbox__item vc-notif-bell-inbox__item--empty">Caricamento…</li>';
      loadBellInboxSectionItems(row, host);
    });
    li.appendChild(btn);
    host.appendChild(li);
  }

  function loadBellInboxSectionItems(row, itemsHost) {
    if (!row || !itemsHost) return;
    var gen = String((Number(itemsHost.getAttribute("data-gen") || 0) || 0) + 1);
    itemsHost.setAttribute("data-gen", gen);
    itemsHost.setAttribute("data-loading", "1");
    fetchBellInboxQueueItems(row)
      .then(function (items) {
        if (itemsHost.getAttribute("data-gen") !== gen) return;
        if (!itemsHost.isConnected) return;
        itemsHost.removeAttribute("data-loading");
        itemsHost.setAttribute("data-loaded", "1");
        renderBellInboxItems(row, itemsHost, items || []);
      })
      .catch(function (err) {
        if (itemsHost.getAttribute("data-gen") !== gen) return;
        if (!itemsHost.isConnected) return;
        itemsHost.removeAttribute("data-loading");
        itemsHost.removeAttribute("data-loaded");
        /* notifInboxGate1: never show "Solo High Staff — riprova"; hide gated queues. */
        if (isBellInboxForbiddenErr(err) || !canBellInboxRow(row)) {
          hideBellInboxForbiddenRow(row);
          return;
        }
        /* notifApiErr1: niente toast globale — solo retry inline; benign = copy soft */
        var benign = isBellInboxBenignErr(err);
        var msg = benign
          ? Number(err && err.status) === 401
            ? "Accedi per vedere questa coda."
            : "Caricamento non riuscito"
          : (err && err.message) || "Impossibile caricare la coda.";
        renderBellInboxLoadError(row, itemsHost, msg);
      });
  }

  function toggleBellInboxSection(row, btn, itemsHost, forceOpen) {
    if (!btn || !itemsHost) return;
    if (!canBellInboxRow(row)) {
      hideBellInboxForbiddenRow(row);
      return;
    }
    var wantOpen =
      typeof forceOpen === "boolean" ? forceOpen : btn.getAttribute("aria-expanded") !== "true";
    btn.setAttribute("aria-expanded", wantOpen ? "true" : "false");
    btn.classList.toggle("is-open", wantOpen);
    var rowEl = btn.closest(".vc-notif-bell-inbox__row");
    if (rowEl) rowEl.classList.toggle("is-open", wantOpen);
    if (!wantOpen) {
      itemsHost.hidden = true;
      itemsHost.setAttribute("hidden", "");
      return;
    }
    itemsHost.hidden = false;
    itemsHost.removeAttribute("hidden");
    if (itemsHost.getAttribute("data-loaded") || itemsHost.getAttribute("data-loading")) return;
    itemsHost.innerHTML =
      '<li class="vc-notif-bell-inbox__item vc-notif-bell-inbox__item--empty">Caricamento…</li>';
    loadBellInboxSectionItems(row, itemsHost);
  }

  function ensureNotifBellScopeUi() {
    var dd = document.getElementById("vc-notif-dropdown");
    if (!dd) return false;
    var panel = dd.querySelector(".vc-notif-panel");
    if (!panel) return false;
    var head = panel.querySelector(".vc-notif-panel-head");
    var body = panel.querySelector(".vc-notif-panel-body");
    if (!body) return false;

    var switchWrap = document.getElementById("vc-notif-bell-scope");
    if (!switchWrap) {
      switchWrap = document.createElement("div");
      switchWrap.id = "vc-notif-bell-scope";
      switchWrap.className = "vc-notif-scope-switch";
      switchWrap.hidden = true;
      switchWrap.innerHTML =
        '<div class="vc-notif-scope-switch__seg" role="tablist" aria-label="Ambito notifiche">' +
        '<button type="button" role="tab" class="vc-notif-scope-switch__btn is-active" id="vc-notif-bell-tab-personal" data-bell-scope="personal" aria-selected="true">' +
        '<i class="fa fa-bell" aria-hidden="true"></i><span>Personali</span></button>' +
        '<button type="button" role="tab" class="vc-notif-scope-switch__btn" id="vc-notif-bell-tab-staff" data-bell-scope="staff" aria-selected="false">' +
        '<i class="fa fa-inbox" aria-hidden="true"></i><span>Inbox</span></button>' +
        "</div>";
      if (head && head.parentNode === panel) panel.insertBefore(switchWrap, head.nextSibling);
      else panel.insertBefore(switchWrap, body);
    }

    var personalPane = document.getElementById("vc-notif-bell-pane-personal");
    if (!personalPane) {
      personalPane = document.createElement("div");
      personalPane.id = "vc-notif-bell-pane-personal";
      personalPane.className = "vc-notif-bell-pane";
      personalPane.setAttribute("data-bell-pane", "personal");
      while (body.firstChild) personalPane.appendChild(body.firstChild);
      body.appendChild(personalPane);
    }

    var staffPane = document.getElementById("vc-notif-bell-pane-staff");
    if (!staffPane) {
      staffPane = document.createElement("div");
      staffPane.id = "vc-notif-bell-pane-staff";
      staffPane.className = "vc-notif-bell-pane vc-notif-bell-pane--staff";
      staffPane.setAttribute("data-bell-pane", "staff");
      staffPane.hidden = true;
      staffPane.innerHTML =
        '<div class="vc-notif-bell-inbox" id="vc-notif-bell-inbox">' +
        '<p class="vc-notif-bell-inbox__hint" id="vc-notif-bell-inbox-hint">Caricamento inbox staff…</p>' +
        '<ul class="vc-notif-bell-inbox__list" id="vc-notif-bell-inbox-list" role="list"></ul>' +
        "</div>";
      body.appendChild(staffPane);
    }

    if (!bellNotifScopeWired) {
      bellNotifScopeWired = true;
      switchWrap.addEventListener("click", function (ev) {
        var btn =
          ev.target && ev.target.closest ? ev.target.closest("[data-bell-scope]") : null;
        if (!btn || !switchWrap.contains(btn)) return;
        ev.preventDefault();
        ev.stopPropagation();
        var next = btn.getAttribute("data-bell-scope") === "staff" ? "staff" : "personal";
        setBellNotifScope(next, { source: "bell" });
      });
      window.addEventListener("vc:notif-scope", function (ev) {
        var next = ev && ev.detail && ev.detail.scope === "staff" ? "staff" : "personal";
        setBellNotifScope(next, { source: "page", silent: true });
      });
      window.addEventListener("vc:staff-access-ok", function () {
        syncNotifBellScopeChrome();
      });
      window.addEventListener("vc:auth-logout", function () {
        setBellNotifScope("personal", { source: "logout", silent: true, remember: false });
      });
    }
    return true;
  }

  function resolveInitialBellScope(opts) {
    opts = opts || {};
    var fromUrl = readBellScopeFromUrl();
    if (fromUrl === "staff" && canBellStaffInbox()) return "staff";
    if (isOnNotificationsPage()) {
      try {
        if (document.body && document.body.classList.contains("vc-notif-scope-staff") && canBellStaffInbox()) {
          return "staff";
        }
      } catch (eBody) {}
      try {
        if (window.VcNotifScope && typeof window.VcNotifScope.getScope === "function") {
          var pageScope = window.VcNotifScope.getScope();
          if (pageScope === "staff" && canBellStaffInbox()) return "staff";
        }
      } catch (eGet) {}
    }
    /* bellOpenPersonal1: apertura campana → sempre Personali (anche desktop),
       ignora pref sticky Inbox; deep-link ?view=staff / pagina notifiche staff restano. */
    if (opts.fromBellOpen) {
      return "personal";
    }
    var pref = readBellScopePref();
    if (pref === "staff" && canBellStaffInbox()) return "staff";
    return "personal";
  }

  function syncNotifBellScopeChrome() {
    ensureNotifBellScopeUi();
    var switchWrap = document.getElementById("vc-notif-bell-scope");
    var tabP = document.getElementById("vc-notif-bell-tab-personal");
    var tabS = document.getElementById("vc-notif-bell-tab-staff");
    var personalPane = document.getElementById("vc-notif-bell-pane-personal");
    var staffPane = document.getElementById("vc-notif-bell-pane-staff");
    var staffOk = canBellStaffInbox();
    if (!staffOk && bellNotifScope === "staff") bellNotifScope = "personal";
    if (switchWrap) {
      if (staffOk) {
        switchWrap.hidden = false;
        switchWrap.removeAttribute("hidden");
      } else {
        switchWrap.hidden = true;
        switchWrap.setAttribute("hidden", "");
      }
    }
    if (tabS) {
      tabS.disabled = !staffOk;
      tabS.setAttribute("aria-disabled", staffOk ? "false" : "true");
      if (!staffOk) tabS.setAttribute("hidden", "");
      else tabS.removeAttribute("hidden");
    }
    var isStaff = bellNotifScope === "staff" && staffOk;
    if (tabP) {
      tabP.classList.toggle("is-active", !isStaff);
      tabP.setAttribute("aria-selected", !isStaff ? "true" : "false");
    }
    if (tabS) {
      tabS.classList.toggle("is-active", isStaff);
      tabS.setAttribute("aria-selected", isStaff ? "true" : "false");
    }
    if (personalPane) {
      personalPane.hidden = isStaff;
      if (isStaff) personalPane.setAttribute("hidden", "");
      else personalPane.removeAttribute("hidden");
    }
    if (staffPane) {
      staffPane.hidden = !isStaff;
      if (!isStaff) staffPane.setAttribute("hidden", "");
      else staffPane.removeAttribute("hidden");
    }
    try {
      var dd = document.getElementById("vc-notif-dropdown");
      if (dd) dd.classList.toggle("vc-notif-dropdown--staff-scope", isStaff);
    } catch (eCls) {}
    try {
      var clearAll = document.getElementById("vc-notif-clear-all");
      if (clearAll) {
        clearAll.hidden = isStaff;
        if (isStaff) clearAll.setAttribute("hidden", "");
        else clearAll.removeAttribute("hidden");
      }
    } catch (eClear) {}
    ensureNotifSeeAllLink();
    if (isStaff) loadBellStaffInboxSummary();
  }

  function setBellNotifScope(next, opts) {
    opts = opts || {};
    var want = next === "staff" ? "staff" : "personal";
    if (want === "staff" && !canBellStaffInbox()) want = "personal";
    var prev = bellNotifScope;
    bellNotifScope = want;
    if (!opts || opts.remember !== false) writeBellScopePref(want);
    syncNotifBellScopeChrome();
    if (opts.source === "bell" && !opts.silent) {
      try {
        if (isOnNotificationsPage() && window.VcNotifScope && typeof window.VcNotifScope.setScope === "function") {
          window.VcNotifScope.setScope(want, { remember: false });
        } else {
          window.dispatchEvent(new CustomEvent("vc:notif-scope", { detail: { scope: want, source: "bell" } }));
        }
      } catch (eSync) {}
    }
    if (prev !== want) {
      try {
        var sub = document.getElementById("vc-notif-unread-sub");
        if (sub && want === "staff") sub.textContent = formatUnreadSub(countInboxUnreadNotifs());
        else if (want === "personal") render({ force: false });
      } catch (eSub) {}
    }
  }

  function readCachedBellStaffSummary() {
    try {
      var pref = window.__VC_INBOX_SUMMARY_PREFETCH;
      if (pref && pref.summary) return pref;
      var now = Date.now();
      var raw = sessionStorage.getItem("vc_inbox_summary_v1");
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.summary && now - Number(parsed.at || 0) <= 120000) return parsed;
      }
      var rawLocal = localStorage.getItem("vc_inbox_summary_local_v1");
      if (rawLocal) {
        var parsedLocal = JSON.parse(rawLocal);
        if (parsedLocal && parsedLocal.summary && now - Number(parsedLocal.at || 0) <= 600000) {
          return parsedLocal;
        }
      }
    } catch (eCache) {}
    return null;
  }

  function renderBellStaffInbox(summary) {
    var list = document.getElementById("vc-notif-bell-inbox-list");
    var hint = document.getElementById("vc-notif-bell-inbox-hint");
    /* notifCats3 marker */
    /* notifUseful1 marker */
    if (!list) return;
    list.innerHTML = "";
    try {
      var subHead = document.getElementById("vc-notif-unread-sub");
      if (subHead && bellNotifScope === "staff") {
        subHead.textContent = formatUnreadSub(countInboxUnreadNotifs());
      }
    } catch (eSubH) {}

    function appendInboxNotifCategory(cat) {
      var items = inboxNotifsForBucket(cat.id);
      if (!items.length && cat.id !== "avvisi") return;
      if (!items.length) return;
      var li = document.createElement("li");
      li.className = "vc-notif-bell-inbox__row has-count";
      li.setAttribute("data-bell-inbox", cat.id);
      var unreadA = items.filter(function (x) {
        return !x.read;
      }).length;
      var itemsHost = document.createElement("ul");
      itemsHost.className = "vc-notif-bell-inbox__items";
      itemsHost.setAttribute("role", "list");
      itemsHost.hidden = true;
      itemsHost.setAttribute("hidden", "");
      items.slice(0, 12).forEach(function (n) {
        var item = document.createElement("li");
        item.className =
          "vc-notif-bell-inbox__item vc-notif-bell-inbox__item--rich" + (n.read ? "" : " is-unread");
        var a = document.createElement("a");
        a.className = "vc-notif-bell-inbox__item-link vc-notif-bell-inbox__item-link--rich";
        var dest = String(n.openUrl || "").trim();
        a.href = dest ? resolveNotifDestUrl(dest) : notificationsStaffPageUrl("", "");
        var bodySnip = String(n.body || "").trim().slice(0, 110);
        var whenTxt = timeAgoLocalized(n.at || Date.now());
        a.innerHTML =
          '<span class="vc-notif-bell-inbox__item-dot" aria-hidden="true"></span>' +
          '<span class="vc-notif-bell-inbox__item-copy">' +
          '<span class="vc-notif-bell-inbox__item-label">' +
          escBellHtml(String(n.title || cat.label)) +
          "</span>" +
          (bodySnip
            ? '<span class="vc-notif-bell-inbox__item-sub">' + escBellHtml(bodySnip) + "</span>"
            : "") +
          '<span class="vc-notif-bell-inbox__item-time">' +
          escBellHtml(whenTxt) +
          "</span>" +
          "</span>";
        a.addEventListener("click", function (ev) {
          ev.preventDefault();
          try {
            markOneRead(n.id);
          } catch (eMark) {}
          navigateBellInboxHref(a.href);
        });
        item.appendChild(a);
        itemsHost.appendChild(item);
      });
      var catBar = buildNotifCategoryBar({
        toggleClass: "vc-notif-bell-inbox__toggle",
        toggleHtml:
          '<span class="vc-notif-bell-inbox__ico" aria-hidden="true"><i class="fa ' +
          cat.ico +
          '"></i></span>' +
          '<span class="vc-notif-bell-inbox__label">' +
          escBellHtml(cat.label) +
          "</span>",
        countHtml:
          '<span class="vc-notif-bell-inbox__count">' +
          String(items.length) +
          (unreadA ? " · " + unreadA : "") +
          "</span>",
        clearCatId: cat.id,
        clearAriaLabel: "Elimina tutte in " + cat.label,
        onClear: function () {
          clearNotifCategory(cat.id, "inbox");
        },
        onToggleClick: function (ev) {
          ev.preventDefault();
          var open = !li.classList.contains("is-open");
          li.classList.toggle("is-open", open);
          catBar.bar.classList.toggle("is-open", open);
          catBar.toggle.classList.toggle("is-open", open);
          catBar.toggle.setAttribute("aria-expanded", open ? "true" : "false");
          itemsHost.hidden = !open;
          if (open) itemsHost.removeAttribute("hidden");
          else itemsHost.setAttribute("hidden", "");
        },
      });
      var bar = catBar.bar;
      var btn = catBar.toggle;
      li.appendChild(bar);
      li.appendChild(itemsHost);
      list.appendChild(li);
    }

    INBOX_NOTIF_CATS.forEach(appendInboxNotifCategory);

    var sum = summary && typeof summary === "object" ? summary : {};
    var total = 0;
    var visible = 0;
    var ptNotifs = inboxNotifsForBucket("punti-tolti");
    BELL_INBOX_ROWS.forEach(function (row) {
      if (!canBellInboxRow(row)) return;
      visible += 1;
      var count = Number(sum[row.id] || 0) || 0;
      if (
        (row.punti || row.id === "punti-tolti") &&
        !sum[row.id] &&
        bellStaffQueueCache[row.id] &&
        Array.isArray(bellStaffQueueCache[row.id].items)
      ) {
        count = bellStaffQueueCache[row.id].items.length;
      }
      if (row.id === "punti-tolti") count += ptNotifs.length;
      total += count;
      var li = document.createElement("li");
      li.className = "vc-notif-bell-inbox__row" + (count > 0 ? " has-count" : "");
      li.setAttribute("data-bell-inbox", row.id);

      var itemsHost = document.createElement("ul");
      itemsHost.className = "vc-notif-bell-inbox__items";
      itemsHost.id = "vc-notif-bell-inbox-items-" + row.id;
      itemsHost.hidden = true;
      itemsHost.setAttribute("hidden", "");
      itemsHost.setAttribute("role", "list");

      var catBarOpts = {
        toggleClass: "vc-notif-bell-inbox__toggle",
        ariaControls: "vc-notif-bell-inbox-items-" + row.id,
        toggleHtml:
          '<span class="vc-notif-bell-inbox__ico" aria-hidden="true"><i class="fa ' +
          row.icon +
          '"></i></span>' +
          '<span class="vc-notif-bell-inbox__label">' +
          escBellHtml(row.label) +
          "</span>",
        countHtml:
          '<span class="vc-notif-bell-inbox__count">' +
          (count > 99 ? "99+" : String(count)) +
          "</span>",
        onToggleClick: function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          toggleBellInboxSection(row, catBar.toggle, itemsHost);
        },
      };
      if (row.id === "punti-tolti" && ptNotifs.length) {
        catBarOpts.clearTitle = "Elimina notifiche Punti tolti";
        catBarOpts.clearAriaLabel = "Elimina notifiche Punti tolti";
        catBarOpts.onClear = function () {
          clearNotifCategory("punti-tolti", "inbox");
        };
      }
      var catBar = buildNotifCategoryBar(catBarOpts);
      li.appendChild(catBar.bar);
      li.appendChild(itemsHost);
      list.appendChild(li);
    });
    if (hint) {
      /* notifCats3: categories with 0 are enough — no empty-copy / sleeping disc. */
      hint.textContent = "";
      hint.hidden = true;
      hint.setAttribute("hidden", "");
    }
    void total;
    void visible;
  }

  function loadBellStaffInboxSummary(force) {
    ensureNotifBellScopeUi();
    var cached = readCachedBellStaffSummary();
    if (cached && cached.permissions) bellStaffPerms = cached.permissions;
    if (cached && cached.summary) renderBellStaffInbox(cached.summary);
    if (!force && bellStaffSummaryAt && Date.now() - bellStaffSummaryAt < 20000 && cached) {
      return Promise.resolve(cached);
    }
    var token = getDiscordAccessToken();
    if (!token) {
      renderBellStaffInbox({});
      var hint = document.getElementById("vc-notif-bell-inbox-hint");
      if (hint) hint.textContent = "Accedi per vedere l'inbox staff.";
      return Promise.resolve(null);
    }
    if (bellStaffSummaryInFlight) return bellStaffSummaryInFlight;
    var api = staffWorkflowsApiBase();
    var url = api + (api.indexOf("?") >= 0 ? "&" : "?") + "queue=summary";
    bellStaffSummaryInFlight = fetch(url, {
      method: "GET",
      credentials: "include",
      headers: { Authorization: "Bearer " + token, Accept: "application/json" },
      cache: "no-store",
    })
      .then(function (res) {
        return res
          .json()
          .catch(function () {
            return null;
          })
          .then(function (body) {
            return { ok: res.ok, body: body };
          });
      })
      .then(function (out) {
        bellStaffSummaryAt = Date.now();
        if (!out || !out.body || !out.body.ok || !out.body.summary) {
          if (!cached) renderBellStaffInbox({});
          return null;
        }
        if (out.body.permissions) bellStaffPerms = out.body.permissions;
        try {
          var cachePayload = {
            summary: out.body.summary,
            permissions: out.body.permissions || null,
            at: Date.now(),
          };
          sessionStorage.setItem("vc_inbox_summary_v1", JSON.stringify(cachePayload));
          localStorage.setItem("vc_inbox_summary_local_v1", JSON.stringify(cachePayload));
          window.__VC_INBOX_SUMMARY_PREFETCH = out.body;
        } catch (eStore) {}
        renderBellStaffInbox(out.body.summary);
        return out.body;
      })
      .catch(function () {
        if (!cached) {
          var hintErr = document.getElementById("vc-notif-bell-inbox-hint");
          if (hintErr) hintErr.textContent = "Impossibile caricare l'inbox staff.";
        }
        return null;
      })
      .finally(function () {
        bellStaffSummaryInFlight = null;
      });
    return bellStaffSummaryInFlight;
  }

  function wireNotifMobileSheet() {
    var dd = document.getElementById("vc-notif-dropdown");
    if (!dd) return false;
    ensureNotifBellScopeUi();
    if (!dd.__vcNotifSheetWired) {
      dd.__vcNotifSheetWired = true;
      /* notifSidebar2: prime drawer class before <details> paints classic popup.
         notifBellFix1: click owns open/close; defer portal off the toggle stack. */
      var summary = dd.querySelector("summary.vc-notif-summary");
      if (summary && !summary.__vcNotifPrimeWired) {
        summary.__vcNotifPrimeWired = true;
        summary.addEventListener(
          "pointerdown",
          function () {
            if (dd.open) {
              notifPortalGuardUntil = 0;
              return;
            }
            primeDesktopNotifDrawer(dd);
          },
          true,
        );
        summary.addEventListener(
          "keydown",
          function (ev) {
            if (ev.key !== "Enter" && ev.key !== " ") return;
            if (dd.open) {
              notifPortalGuardUntil = 0;
              return;
            }
            primeDesktopNotifDrawer(dd);
          },
          true,
        );
        summary.addEventListener(
          "click",
          function (ev) {
            try {
              if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
              if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
            } catch (ePrev) {}
            var live = document.getElementById("vc-notif-dropdown") || dd;
            if (!live) return;
            /* notifDoubleClose1: one gesture → one toggle (blocks touch+click / ghost reopen). */
            var nowMs = Date.now();
            if (nowMs < notifBellGestureLockUntil) return;
            notifBellGestureLockUntil = nowMs + 420;
            if (live.open) {
              notifPortalGuardUntil = 0;
              requestCloseNotifDropdown(live);
              /* toggle event owns chrome sync — avoid double portal/forceOpen. */
              return;
            }
            primeDesktopNotifDrawer(live);
            holdPageScroll(220);
            try {
              live.open = true;
              live.setAttribute("open", "");
            } catch (eOpen) {}
            var repairGen = notifPortalOpenGen;
            window.setTimeout(function () {
              try {
                if (repairGen !== notifPortalOpenGen) return;
                var again = document.getElementById("vc-notif-dropdown");
                if (again && again.open) syncNotifMobileSheetChrome();
                else clearStuckNotifDrawerPrime();
              } catch (eFix) {}
            }, 48);
          },
          true,
        );
      }
      dd.addEventListener("toggle", function () {
        if (dd.open) holdPageScroll(220);
        scheduleNotifSheetChromeSync({ delayMs: 0 });
        if (dd.open) {
          markAllReadOnBellOpen();
          syncPushPromptUi();
          maybeAskNativePush();
          /* bellOpenPersonal1 + notifTicketScrollStay1 */
          setBellNotifScope(resolveInitialBellScope({ fromBellOpen: true }), {
            source: "open",
            silent: true,
            remember: false,
          });
          try {
            syncNotifBellScopeChrome();
          } catch (eBellChrome) {}
        } else {
          notifPortalGuardUntil = 0;
          syncPushPromptUi();
          ensureNotifDropdownInHeader(true);
          restoreNotifScrollAfterClose();
          clearStuckNotifDrawerPrime();
        }
      });
    }
    if (!notifSheetResizeWired) {
      notifSheetResizeWired = true;
      window.addEventListener("resize", function () {
        syncNotifMobileSheetChrome();
        var liveDd = document.getElementById("vc-notif-dropdown");
        if (!liveDd || !liveDd.open) {
          ensureNotifDropdownInHeader(true);
          restoreNotifScrollAfterClose();
        }
      });
      window.addEventListener("pageshow", function () {
        /* notifSidebar4: soft repair — keep drawer open across bfcache/app switch. */
        repairNotifDropdownPortal();
        var liveDd = document.getElementById("vc-notif-dropdown");
        if (!liveDd || !liveDd.open) restoreNotifScrollAfterClose();
      });
      /* notifSidebar4: do NOT close drawer on visibilitychange (tab hide / app background). */
    }
    if (!notifSheetEscWired) {
      notifSheetEscWired = true;
      document.addEventListener("keydown", function (ev) {
        if (ev.key !== "Escape") return;
        var live = document.getElementById("vc-notif-dropdown");
        if (!live || !live.open) return;
        notifBellGestureLockUntil = Date.now() + 420;
        requestCloseNotifDropdown(live);
        scheduleNotifSheetChromeSync({ delayMs: 0 });
      });
    }
    var head = dd.querySelector(".vc-notif-panel-head");
    if (head && !head.querySelector(".vc-notif-close-mobile")) {
      var closeM = document.createElement("button");
      closeM.type = "button";
      closeM.className = "vc-notif-action vc-notif-close-mobile";
      closeM.setAttribute(
        "aria-label",
        window.VcI18n && typeof window.VcI18n.t === "function" ? window.VcI18n.t("notif.close") : "Chiudi",
      );
      closeM.innerHTML = '<i class="fa fa-times" aria-hidden="true"></i>';
      closeM.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        notifBellGestureLockUntil = Date.now() + 420;
        requestCloseNotifDropdown(dd);
        scheduleNotifSheetChromeSync({ delayMs: 0 });
      });
      head.appendChild(closeM);
    }
    return true;
  }

  function wireNotifListClicks() {
    var listEl = document.getElementById("vc-notif-list");
    if (!listEl || listEl.__vcNotifListWired) return false;
    listEl.__vcNotifListWired = true;
    listEl.addEventListener("click", function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      var dismissBtn = t.closest("button.vc-notif-dismiss");
      if (dismissBtn && listEl.contains(dismissBtn)) {
        ev.preventDefault();
        ev.stopPropagation();
        dismissOneSiteNotification(dismissBtn.getAttribute("data-id") || "");
        return;
      }
      var btn = t.closest(".vc-notif-item");
      if (!btn || !listEl.contains(btn)) return;
      var id = btn.getAttribute("data-id");
      var dest = String(btn.getAttribute("data-open-url") || "").trim();
      var kind = String(btn.getAttribute("data-kind") || "info").toLowerCase();
      if (id || dest) markOneRead(id, { openUrl: dest });
      var href = resolveNotifDestUrl(dest);
      if (href) {
        ev.preventDefault();
        var ddNav = document.getElementById("vc-notif-dropdown");
        if (ddNav) ddNav.removeAttribute("open");
        openNotifDestination(href, kind);
      }
    });
    return true;
  }

  function ensureStaffLateNotifUi() {
    ensureSiteNotifDropdown();
    var had = Boolean(document.getElementById("vc-notif-dropdown"));
    wireNotifMobileSheet();
    wireNotifListClicks();
    ensureNotifSeeAllLink();
    bindClearAllButton();
    removeMarkAllButton();
    try {
      /* notifMobileSwitch1: late staff gate must reveal Personali|Inbox on open bell too. */
      syncNotifBellScopeChrome();
    } catch (eScopeLate) {}
    if (!had) return;
    lastNotifRenderSig = "";
    render({ force: true });
    if (normalizeUserId(currentUserId) && getDiscordAccessToken()) {
      scheduleSiteNotificationsPolling();
    }
  }

  function deferAfterFirstPaint(fn, fallbackMs) {
    var done = false;
    function run() {
      if (done) return;
      done = true;
      try {
        fn();
      } catch (eDef) {}
    }
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(run, { timeout: fallbackMs || 2800 });
    } else {
      window.setTimeout(run, fallbackMs || 900);
    }
  }

  function init() {
    ensureSiteNotifDropdown();
    setCurrentUser(window.__VC_DISCORD_PROFILE || null);
    render();
    syncGlobalNotifOverlayClass();
    document.addEventListener("pointerdown", unlockNotifAudio, true);
    document.addEventListener("keydown", unlockNotifAudio, true);
    wireNotifMobileSheet();
    wireNotifListClicks();
    ensureNotifSeeAllLink();
    removeMarkAllButton();
    var seeAll = document.getElementById("vc-notif-see-all");
    bindClearAllButton();
    if (seeAll) {
      seeAll.addEventListener("click", function (ev) {
        ev.preventDefault();
        repairNotifDropdownPortal({ forceClose: true });
        /* notifSeeAll1: always personal root, never ?view=staff */
        window.location.href = notificationsPageUrl();
      });
    }
    window.addEventListener("vc:staff-access-ok", ensureStaffLateNotifUi);
    window.addEventListener("vc:staff-notif-ready", ensureStaffLateNotifUi);
    window.vcNotify = { add: addNotif, refresh: render, clearAll: clearAll };
    flushPendingLoginNotification();
    deferAfterFirstPaint(function () {
      wirePushNotifMarkRead();
      wirePushPermissionWatch();
      wirePushAutoRecover();
      consumePendingNavFromSwCache();
      startPendingNavPoll();
      wireSwClientFocusPing();
      flushPendingReadsToServer();
      tryFlushClickReads();
      syncPushPromptUi();
      if (normalizeUserId(currentUserId) && getDiscordAccessToken()) {
        scheduleSiteNotificationsPolling();
        if (webPushSupported()) {
          prefetchPushPrereqs().then(function () {
            syncExistingWebPushSubscription();
          });
        } else {
          syncExistingWebPushSubscription();
        }
      }
    }, 2600);
    window.addEventListener("pageshow", function () {
      consumeNotifReadFromUrl();
      consumePendingReadFromSwCache();
      consumePendingNavFromSwCache();
      startPendingNavPoll();
      clearMobileOsToastsOnAppOpen();
      if (normalizeUserId(currentUserId) && getDiscordAccessToken()) {
        syncExistingWebPushSubscription();
      }
    });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") {
        clearMobileOsToastsOnAppOpen();
        syncSiteNotificationsFromServer();
        if (normalizeUserId(currentUserId) && getDiscordAccessToken()) {
          syncExistingWebPushSubscription();
        }
      }
    });
  }
  window.addEventListener("vc-discord-profile", function (ev) {
    setCurrentUser(ev && ev.detail ? ev.detail.user : null);
    lastNotifRenderSig = "";
    render({ force: true });
    syncGlobalNotifOverlayClass();
    flushPendingLoginNotification();
    consumeNotifReadFromUrl();
    consumePendingReadFromSwCache();
    tryFlushClickReads();
    flushPendingReadsToServer();
    syncPushPromptUi();
    wirePushAutoRecover();
    if (normalizeUserId(currentUserId) && getDiscordAccessToken()) {
      scheduleSiteNotificationsPolling();
      prefetchPushPrereqs().then(function () {
        syncExistingWebPushSubscription();
      });
    } else {
      stopSiteNotifsPoll();
      disconnectSiteRealtimeWs();
    }
  });
  document.addEventListener("vc:langchange", function () {
    lastNotifRenderSig = "";
    baseDocumentTitle = "";
    lastTabUnreadShown = -1;
    stopWindowAttention();
    render({ force: true });
  });
  window.addEventListener("beforeunload", function () {
    stopSiteNotifsPoll();
    disconnectSiteRealtimeWs();
  });
  document.addEventListener("visibilitychange", function () {
    if (!normalizeUserId(currentUserId) || !getDiscordAccessToken()) return;
    restartSiteNotifsPollTimer();
    if (document.visibilityState !== "visible") return;
    if (siteNotifsVisibilityTimer) clearTimeout(siteNotifsVisibilityTimer);
    siteNotifsVisibilityTimer = setTimeout(function () {
      siteNotifsVisibilityTimer = null;
      syncSiteNotificationsFromServer();
    }, 400);
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
(function () {
    try {
    window.__vcLandingMobileNavActive = true;
  } catch (eOwn) {}
  var DRAWER_ID = "vc-mobile-nav-drawer";
  var TOGGLE_ID = "vc-mobile-nav-toggle";
  var BODY_OPEN_CLASS = "vc-mobile-nav-open";
  var DISCORD_ACCESS_TOKEN_KEY = "vc_discord_access_token";
  var DISCORD_EXPIRES_AT_KEY = "vc_discord_expires_at";
  var FORBIDDEN_BOOKS_KEY = "vc_forbidden_section_books_v1";
  var FORBIDDEN_BOOKS_START_MS = new Date("2026-06-20T12:00:00").getTime();
  var FORBIDDEN_BOOKS_END_MS = new Date("2026-09-01T10:00:00").getTime();
  var FORBIDDEN_SITE_BOOKS_TOTAL = 8;
  var revealForbiddenBooksTimer = null;
  var forbiddenBooksSyncGen = 0;
  var forbiddenBooksPreviewViewer = false;
  var forbiddenBooksRoundState = null;
  var forbiddenStatusInFlight = null;
  var forbiddenStatusBlockedUntil = 0;
  var mq = null;
  var drawer = null;
  var toggle = null;
  var backdrop = null;
  var focusPrev = null;
  var onEscapeDrawer = null;

  function getMq() {
    if (!mq) {
      mq = window.matchMedia("(max-width: 1199.98px)");
    }
    return mq;
  }

  function isMobile() {
    try {
      return getMq().matches;
    } catch (e) {
      return (window.innerWidth || 999) <= 1200;
    }
  }

  function closeNotifDropdown() {
    var d = document.getElementById("vc-notif-dropdown");
    if (d) d.removeAttribute("open");
  }

  function closeDrawer(opts) {
    opts = opts || {};
    if (!drawer) return;
    drawer.classList.remove("vc-mobile-nav-drawer--open");
    drawer.setAttribute("aria-hidden", "true");
    if (toggle) toggle.setAttribute("aria-expanded", "false");
    try {
      document.documentElement.classList.remove(BODY_OPEN_CLASS);
    } catch (e0) {}
    try {
      if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
    } catch (eSyncClose) {}
    try {
      if (typeof window.__vcEnsureNotifDropdownInHeader === "function") {
        window.__vcEnsureNotifDropdownInHeader(true);
      }
    } catch (eNotifHome) {}
    if (onEscapeDrawer) {
      document.removeEventListener("keydown", onEscapeDrawer);
      onEscapeDrawer = null;
    }
            if (!opts.skipFocusRestore && focusPrev && typeof focusPrev.focus === "function") {
      try {
        focusPrev.focus();
      } catch (e1) {}
    }
    focusPrev = null;
  }

    function onMobileNavTileClick(ev, a) {
    if (!a) return;
    if (Date.now() - (onMobileNavTileClick._lastAt || 0) < 450) {
      try {
        if (ev && ev.preventDefault) ev.preventDefault();
      } catch (eDup) {}
      return;
    }
    onMobileNavTileClick._lastAt = Date.now();
    focusPrev = null;
    var hrefAttr = String(a.getAttribute("href") || "").trim();
    var abs = "";
    try {
      abs = a.href || hrefAttr;
    } catch (eHref) {
      abs = hrefAttr;
    }
    try {
      closeDrawer({ skipFocusRestore: true });
    } catch (eClose) {}
    if (!hrefAttr || hrefAttr.charAt(0) === "#") return;
    if (ev && (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey)) return;
    if (ev && typeof ev.button === "number" && ev.button !== 0) return;
    var target = String(a.getAttribute("target") || "").toLowerCase();
    if (target === "_blank") return;
    try {
      if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
    } catch (ePrev) {}
    try {
      if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
    } catch (eStop) {}
    /* phoneNavTapFix1: navigate on next frame so drawer unlock paints before assign */
    window.setTimeout(function () {
      try {
        window.location.assign(abs);
      } catch (eAssign) {
        try {
          window.location.href = abs;
        } catch (eHref2) {}
      }
    }, 0);
  }

  function bindMobileNavTileNav(a) {
    if (!a || a.getAttribute("data-vc-mobile-nav-bound") === "1") return;
    a.setAttribute("data-vc-mobile-nav-bound", "1");
    a.addEventListener("click", function (ev) {
      onMobileNavTileClick(ev, a);
    });
    a.addEventListener(
      "touchend",
      function (ev) {
        if (!ev || (ev.touches && ev.touches.length)) return;
        onMobileNavTileClick(ev, a);
      },
      { passive: false },
    );
  }

  function openDrawer() {
    if (!drawer) return;
    mountDrawer(drawer);
    closeNotifDropdown();
    try {
      if (typeof window.__vcEnsureNotifDropdownInHeader === "function") {
        window.__vcEnsureNotifDropdownInHeader(true);
      }
    } catch (eNotifOpen) {}
        drawer.classList.add("vc-mobile-nav-drawer--open");
    drawer.setAttribute("aria-hidden", "false");
    if (toggle) toggle.setAttribute("aria-expanded", "true");
    focusPrev = document.activeElement;
    try {
      document.documentElement.classList.add(BODY_OPEN_CLASS);
    } catch (e2) {}
    onEscapeDrawer = function (ev) {
      if (ev.key === "Escape") {
        ev.preventDefault();
        closeDrawer();
      }
    };
    document.addEventListener("keydown", onEscapeDrawer);
    var closeBtn = document.getElementById("vc-mobile-nav-close");
    if (closeBtn) {
      window.requestAnimationFrame(function () {
        try {
          closeBtn.focus();
        } catch (e3) {}
      });
    }
    window.requestAnimationFrame(function () {
      try {
        rebuildGrid();
      } catch (eGrid) {}
      try {
        syncDrawerFooter();
      } catch (eFoot) {}
      try {
        if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
      } catch (eSyncOpen) {}
    });
  }

  function mobileAvatarUrl(u) {
    try {
      var server = window.__VC_SERVER_IDENTITY;
      if (server && server.avatarUrl && (!u || !u.id || String(server.userId || "") === String(u.id || "") || !server.userId)) {
        var serverUrl = String(server.avatarUrl || "").trim();
        if (/^https?:\/\//i.test(serverUrl)) {
          if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.resolveUrl === "function") {
            return window.VcDiscordAvatar.resolveUrl(serverUrl, 64, server.memberAvatar || "", u && u.id) || serverUrl;
          }
          return serverUrl;
        }
      }
    } catch (eServer) {}
    if (!u || !u.id) return "";
    try {
      if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.buildFromUser === "function") {
        var built = window.VcDiscordAvatar.buildFromUser(u, 64);
        if (built) return built;
      }
    } catch (eBuilt) {}
    if (u.avatar) {
      var ext = String(u.avatar).indexOf("a_") === 0 ? "gif" : "png";
      return "https://cdn.discordapp.com/avatars/" + u.id + "/" + u.avatar + "." + ext + "?size=64";
    }
    try {
      if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.siteFallbackAvatarUrl === "function") {
        return window.VcDiscordAvatar.siteFallbackAvatarUrl();
      }
    } catch (eFb) {}
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#6f4e37"/><stop offset="1" stop-color="#2a1712"/></linearGradient></defs><rect width="96" height="96" rx="48" fill="url(#g)"/><circle cx="48" cy="36" r="17" fill="#f4dcc2" opacity=".92"/><path d="M20 82c4-18 16-28 28-28s24 10 28 28" fill="#f4dcc2" opacity=".92"/></svg>';
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  function mobileAccountDisplayName(profile) {
    try {
      var server = window.__VC_SERVER_IDENTITY;
      if (server && String(server.displayName || "").trim()) {
        if (!profile || !profile.id || String(server.userId || "") === String(profile.id || "") || !server.userId) {
          return String(server.displayName).trim();
        }
      }
    } catch (eN) {}
    try {
      if (window.VcDiscordIdentity && typeof window.VcDiscordIdentity.pickDisplayName === "function") {
        return window.VcDiscordIdentity.pickDisplayName(profile, "Utente");
      }
    } catch (eP) {}
    return String((profile && (profile.global_name || profile.username)) || "Utente").trim() || "Utente";
  }

  function resolveMobileAccountUserId(userId) {
    var id = String(userId || "").trim();
    if (/^\d{17,22}$/.test(id)) return id;
    try {
      var profile = window.__VC_DISCORD_PROFILE;
      var fromProfile = String(profile && profile.id || "").trim();
      if (/^\d{17,22}$/.test(fromProfile)) return fromProfile;
    } catch (eP) {}
    return "";
  }

  function mobileProfileHref(userId) {
    var id = resolveMobileAccountUserId(userId);
    return id ? "/user/?id=" + encodeURIComponent(id) : "/user";
  }

  function mobileProfileDetailUserId() {
    try {
      var path = String(window.location.pathname || "/")
        .replace(/\/index\.html$/i, "")
        .replace(/\/+$/, "") || "/";
      var m = path.match(/^\/users?\/(\d{17,22})$/i);
      if (m) return m[1];
      if (path === "/user" || path === "/users") {
        var q = new URLSearchParams(window.location.search || "");
        var id = String(q.get("id") || q.get("userId") || q.get("uid") || "").trim();
        if (/^\d{17,22}$/.test(id)) return id;
      }
    } catch (e) {}
    return "";
  }

  function isMobileOwnProfileCurrent(userId) {
    var id = resolveMobileAccountUserId(userId);
    var viewing = mobileProfileDetailUserId();
    return Boolean(id && viewing && id === viewing);
  }

  function readCachedProfileForMobile() {
    try {
      var token = String(localStorage.getItem("vc_discord_access_token") || "").trim();
      if (!token) return null;
      var exp = Number(localStorage.getItem("vc_discord_expires_at") || "0");
      if (exp && Date.now() >= exp) return null;
      var fp = String(exp) + "|" + token.slice(0, 32);
      var now = Date.now();
      var keys = [
        ["sessionStorage", "vc_discord_me_cache_v1", 180000],
        ["localStorage", "vc_discord_me_cache_local_v1", 7 * 24 * 60 * 60 * 1000],
      ];
      for (var i = 0; i < keys.length; i += 1) {
        var store = keys[i][0] === "sessionStorage" ? sessionStorage : localStorage;
        var raw = store.getItem(keys[i][1]);
        if (!raw) continue;
        var o = JSON.parse(raw);
        var age = now - Number(o && o.at || 0);
        if (o && o.v === 1 && o.user && String(o.fp || "") === fp && isFinite(age) && age >= 0 && age <= keys[i][2]) {
          return o.user;
        }
      }
    } catch (eCache) {}
    return null;
  }

  function syncDrawerFooter() {
    var foot = document.getElementById("vc-mobile-nav-drawer-footer");
    if (!foot) return;
    foot.innerHTML = "";
    var profile = window.__VC_DISCORD_PROFILE || readCachedProfileForMobile();
    var logoutBtn = document.getElementById("discord-logout-btn");
    var loginBtn = document.getElementById("discord-login-btn");
    var loginState = document.getElementById("discord-login-state");
    var hasToken = false;
    try {
      if (typeof window.__vcDiscordGetAccessToken === "function") {
        hasToken = Boolean(window.__vcDiscordGetAccessToken());
      }
      if (!hasToken) {
        var t = localStorage.getItem("vc_discord_access_token");
        var exp = Number(localStorage.getItem("vc_discord_expires_at") || "0");
        hasToken = Boolean(t) && (!exp || exp > Date.now());
      }
    } catch (eTok) {}
    var pendingShell = loginState && loginState.querySelector(".vc-auth-pending-shell");
    var earlyAvatar = loginState && loginState.querySelector(".vc-auth-early-shell img.discord-avatar-img");
    if ((pendingShell && !earlyAvatar) || (hasToken && !profile)) {
      var pending = document.createElement("div");
      pending.className = "vc-mobile-nav-footer__account";
      pending.setAttribute("aria-busy", "true");
      pending.innerHTML =
        '<div class="vc-mobile-nav-footer__who">' +
        '<div class="vc-mobile-nav-footer__account-start"><span class="vc-mobile-nav-footer__avatar vc-mobile-nav-footer__avatar--fb" aria-hidden="true"><span class="vc-ui-spinner"></span></span></div>' +
        '<div class="vc-mobile-nav-footer__meta">' +
        '<span class="vc-mobile-nav-footer__name">Verifica sessione…</span>' +
        '<span class="vc-mobile-nav-footer__hint">Account Discord</span>' +
        "</div></div>";
      foot.appendChild(pending);
      return;
    }
        if (profile && (hasToken || logoutBtn || profile.id)) {
      var wrap = document.createElement("div");
      wrap.className = "vc-mobile-nav-footer__account";
      var imgUrl = mobileAvatarUrl(profile);
      var name = mobileAccountDisplayName(profile);
      var who = document.createElement("div");
      who.className = "vc-mobile-nav-footer__who";
      var left = document.createElement("div");
      left.className = "vc-mobile-nav-footer__account-start";
      if (imgUrl) {
        var im = document.createElement("img");
        im.className = "vc-mobile-nav-footer__avatar";
        im.setAttribute("data-vc-avatar", "1");
        if (profile.avatar) im.setAttribute("data-avatar-hash", String(profile.avatar));
        im.src = imgUrl;
        im.alt = "";
        im.width = 40;
        im.height = 40;
        im.decoding = "async";
        im.setAttribute("data-avatar-size", "64");
        left.appendChild(im);
      } else {
        var fb = document.createElement("span");
        fb.className = "vc-mobile-nav-footer__avatar vc-mobile-nav-footer__avatar--fb";
        fb.setAttribute("aria-hidden", "true");
        fb.innerHTML = '<i class="fa fa-user"></i>';
        left.appendChild(fb);
      }
      var meta = document.createElement("div");
      meta.className = "vc-mobile-nav-footer__meta";
      var nm = document.createElement("span");
      nm.className = "vc-mobile-nav-footer__name";
      nm.textContent = name;
      meta.appendChild(nm);
      var hint = document.createElement("span");
      hint.className = "vc-mobile-nav-footer__hint";
      hint.textContent = "Account Discord";
      meta.appendChild(hint);
      who.appendChild(left);
      who.appendChild(meta);
      var actions = document.createElement("div");
      actions.className = "vc-mobile-nav-footer__actions";
      var prof = document.createElement("a");
      prof.className = "vc-mobile-nav-footer__action vc-mobile-nav-footer__action--profile vc-mobile-nav-footer__action--icon";
      prof.href = mobileProfileHref(profile.id);
      prof.setAttribute("aria-label", i18nLabel("auth.profile", "Profilo"));
      prof.title = i18nLabel("auth.profile", "Profilo");
      if (isMobileOwnProfileCurrent(profile.id)) {
        prof.classList.add("is-active");
        prof.setAttribute("aria-current", "page");
      }
      prof.innerHTML = '<i class="fa fa-user" aria-hidden="true"></i>';
      prof.addEventListener("click", function (ev) {
        onMobileNavTileClick(ev, prof);
      });
      actions.appendChild(prof);
      if (isDashboardNavAllowed()) {
        var dash = document.createElement("a");
        dash.className =
          "vc-mobile-nav-footer__action vc-mobile-nav-footer__action--dashboard vc-mobile-nav-footer__action--icon";
        dash.href = resolveDashboardHref();
        dash.setAttribute("aria-label", i18nLabel("auth.dashboard", "Dashboard"));
        dash.title = i18nLabel("auth.dashboard", "Dashboard");
        dash.setAttribute("data-vc-mobile-dashboard", "1");
        dash.innerHTML = '<i class="fa fa-server" aria-hidden="true"></i>';
        dash.addEventListener("click", function (ev) {
          onMobileNavTileClick(ev, dash);
        });
        actions.appendChild(dash);
        actions.classList.add("is-trio");
      }
      var lo = document.createElement("button");
      lo.type = "button";
      lo.className = "vc-mobile-nav-footer__action vc-mobile-nav-footer__action--logout vc-mobile-nav-footer__action--icon";
      lo.setAttribute("aria-label", i18nLabel("auth.logout", "Esci"));
      lo.title = i18nLabel("auth.logout", "Esci");
      lo.innerHTML = '<i class="fa fa-sign-out" aria-hidden="true"></i>';
      lo.addEventListener("click", function () {
        if (logoutBtn) logoutBtn.click();
        else if (typeof window.__vcDiscordCompleteLogout === "function") {
          try {
            window.__vcDiscordCompleteLogout({ reason: "user" });
          } catch (eOut) {}
        } else if (typeof window.__vcDiscordClearToken === "function") {
          try {
            window.__vcDiscordClearToken();
          } catch (eClear) {}
          try {
            window.location.reload();
          } catch (eRel) {}
        }
        closeDrawer();
      });
      actions.appendChild(lo);
      wrap.appendChild(who);
      wrap.appendChild(actions);
      foot.appendChild(wrap);
      return;
    }
    if (!hasToken) {
      /* navDiscordLoginGif1 */
      var b = document.createElement("button");
      b.type = "button";
      b.className = "vc-mobile-nav-footer__login vc-discord-login-btn";
      b.innerHTML =
        '<img class="vc-discord-login-emoji" src="/images/discord.gif?v=20260908loginGif1" width="18" height="18" alt="" decoding="async" aria-hidden="true" />' +
        '<span data-i18n="auth.loginDiscord">Login con Discord</span>';
      b.setAttribute("data-vc-discord-login", "");
      try {
        b.setAttribute(
          "data-vc-login-default-html",
          b.innerHTML,
        );
      } catch (eDef) {}
      b.addEventListener("click", function () {
        if (typeof window.__vcDiscordStartOAuthRedirect === "function") {
          window.__vcDiscordStartOAuthRedirect(b);
          closeDrawer();
          return;
        }
        if (loginBtn) loginBtn.click();
      });
      foot.appendChild(b);
    }
  }

  function sectionLabel(text) {
    return String(text || "")
      .trim()
      .toUpperCase();
  }

  function isStaffOnlyNavSection(title) {
    var t = String(title || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    return (
      /^area\s*staff$/.test(t) ||
      t === "staff area" ||
      t === "staff" ||
      t === "gestione" ||
      t === "gestione staff"
    );
  }

  function isStaffDetailsEl(el) {
    if (!el) return false;
    try {
      if (el.classList && el.classList.contains("vc-snav-details--staff")) return true;
      if (el.hasAttribute && el.hasAttribute("data-vc-staff-tools-nav")) return true;
    } catch (eAttr) {}
    var sum = el.querySelector ? el.querySelector(".vc-snav-summary span, .vc-snav-summary") : null;
    var title = sum ? String(sum.textContent || "") : "";
    return isStaffOnlyNavSection(title);
  }

  function isStaffGuideHref(href) {
    var h = String(href || "").toLowerCase();
    return h.indexOf("/staff/guida") >= 0;
  }

  function isStaffGuideLabel(label) {
    var t = String(label || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    return t === "guida" || t === "guida staff" || t === "staff guide";
  }

    function isEventDedicatedNavPage() {
    try {
      var p = String(location.pathname || "/").replace(/\/+$/, "") || "/";
      if (p === "/evento" || p.indexOf("/evento/") === 0) return true;
      if (document.body && document.body.classList.contains("vc-hw-page")) return true;
      var snav = document.querySelector("nav.vc-header-snav");
      if (snav && snav.querySelector && snav.querySelector(".vc-snav-item--event")) return true;
      var label = snav ? String(snav.getAttribute("aria-label") || "").toLowerCase() : "";
      if (label.indexOf("evento") >= 0 || label.indexOf("hogwarts") >= 0) return true;
    } catch (eEv) {}
    return false;
  }

  function appendStaffGuideSection(gridRoot, sourceDetails) {
    if (!gridRoot) return;
    if (isEventDedicatedNavPage()) return;
    try {
      if (gridRoot.querySelector('a[href*="/staff/guida"]')) {
        if (!gridRoot.querySelector('a[href*="/confessionale"]') && isStaffNavAllowed()) {
          var existingSec = gridRoot.querySelector(".vc-mobile-nav-section--staff-guide");
          var existingGrid = existingSec
            ? existingSec.querySelector(".vc-mobile-nav-grid") || existingSec
            : null;
          if (existingGrid) {
            var cAdd = document.createElement("a");
            cAdd.className = "vc-mobile-nav-tile";
            cAdd.href = "/staff/confessionale/";
            cAdd.setAttribute("data-vc-mobile-staff-confessionale", "1");
            cAdd.innerHTML =
              '<span class="vc-mobile-nav-tile-ico" aria-hidden="true"><i class="fa fa-comments"></i></span>' +
              '<span class="vc-mobile-nav-tile-label">Confessionale</span>';
            bindMobileNavTileNav(cAdd);
            existingGrid.appendChild(cAdd);
          }
        }
        return;
      }
    } catch (eDup) {}
    var rows = sourceDetails
      ? sourceDetails.querySelectorAll(".vc-snav-panel .vc-snav-row, a.vc-snav-row")
      : [];
    var guideRow = null;
    var confRow = null;
    var r;
    for (r = 0; r < rows.length; r += 1) {
      var row = rows[r];
      var href = row.getAttribute("href") || "";
      var lab = "";
      try {
        var spans = row.querySelectorAll("span");
        var sj;
        for (sj = 0; sj < spans.length; sj += 1) {
          if (spans[sj].classList.contains("vc-snav-row-ico")) continue;
          lab = String(spans[sj].textContent || "").trim();
          if (lab) break;
        }
      } catch (eLab) {}
      if (!lab) lab = String(row.textContent || "").trim();
      if (isStaffOnlyNavHref(href) || isStaffOnlyNavLabel(lab)) continue;
      var labNorm = lab.replace(/\s+/g, " ").trim().toLowerCase();
      if (!guideRow && (isStaffGuideHref(href) || isStaffGuideLabel(lab))) {
        guideRow = row;
        continue;
      }
      if (
        !confRow &&
        (String(href).toLowerCase().indexOf("/confessionale") >= 0 ||
          labNorm === "confessionale" ||
          labNorm === "il confessionale")
      ) {
        confRow = row;
      }
    }
    var tiles = [];
    if (guideRow) {
      var guideTile = createTileFromRow(guideRow);
      if (guideTile) tiles.push(guideTile);
    } else if (isStaffNavAllowed()) {
      var a = document.createElement("a");
      a.className = "vc-mobile-nav-tile";
      a.href = "/staff/guida/";
      a.setAttribute("data-vc-mobile-staff-guide", "1");
      a.innerHTML =
        '<span class="vc-mobile-nav-tile-ico" aria-hidden="true"><i class="fa fa-book"></i></span>' +
        '<span class="vc-mobile-nav-tile-label">Guida</span>';
      bindMobileNavTileNav(a);
      tiles.push(a);
    }
    if (confRow) {
      var confTile = createTileFromRow(confRow);
      if (confTile) {
        try {
          confTile.setAttribute("href", "/staff/confessionale/");
        } catch (eC) {}
        tiles.push(confTile);
      }
    } else if (isStaffNavAllowed()) {
      var c = document.createElement("a");
      c.className = "vc-mobile-nav-tile";
      c.href = "/staff/confessionale/";
      c.setAttribute("data-vc-mobile-staff-confessionale", "1");
      c.innerHTML =
        '<span class="vc-mobile-nav-tile-ico" aria-hidden="true"><i class="fa fa-comments"></i></span>' +
        '<span class="vc-mobile-nav-tile-label">Confessionale</span>';
      bindMobileNavTileNav(c);
      tiles.push(c);
    }
    if (!tiles.length) return;
    var sec = document.createElement("section");
    sec.className = "vc-mobile-nav-section vc-mobile-nav-section--staff-guide";
    var h = document.createElement("h3");
    h.className = "vc-mobile-nav-section-title";
    h.textContent = "STAFF";
    var g = document.createElement("div");
    g.className = "vc-mobile-nav-grid";
    for (var ti = 0; ti < tiles.length; ti += 1) g.appendChild(tiles[ti]);
    sec.appendChild(h);
    sec.appendChild(g);
    gridRoot.appendChild(sec);
  }

  function isStaffOnlyNavHref(href) {
    var h = String(href || "").toLowerCase();
    return h.indexOf("/staff/gestione") >= 0;
  }

  function isStaffOnlyNavLabel(label) {
    var t = String(label || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    return t === "gestione" || t === "gestione staff" || t === "area staff" || t === "staff area";
  }

  /* feedbackNav1: clone path must never keep legacy "Suggerimenti" tile labels. */
  function normalizePublicNavLabel(href, label) {
    var h = String(href || "").toLowerCase();
    var lab = String(label || "").replace(/\s+/g, " ").trim();
    if (
      h.indexOf("/feedback") >= 0 ||
      h.indexOf("/suggerimenti") >= 0 ||
      h.indexOf("richieste_suggerimenti") >= 0
    ) {
      return i18nLabel("nav.suggestions", "Feedback");
    }
    if (/^suggerimenti$/i.test(lab)) return i18nLabel("nav.suggestions", "Feedback");
    return lab;
  }

  function navItemHidden(el) {
    return !el || el.hidden || el.hasAttribute("hidden");
  }

  function i18nLabel(key, fallback) {
    try {
      if (window.VcI18n && typeof window.VcI18n.t === "function") {
        var v = window.VcI18n.t(key);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    return fallback;
  }

  function resolveDashboardHref() {
    var link = document.getElementById("discord-dashboard-link");
    if (link) {
      var h = String(link.getAttribute("href") || "").trim();
      if (h) return h;
    }
    try {
      var d = window.__VC_SITE_DASHBOARD || {};
      if (d.pageUrl) return String(d.pageUrl);
    } catch (e0) {}
    return "/dashboard/";
  }

  function hasLikelyDiscordSession() {
    try {
      if (window.__VC_DISCORD_PROFILE && window.__VC_DISCORD_PROFILE.id) return true;
      if (typeof window.__vcDiscordGetAccessToken === "function") {
        if (String(window.__vcDiscordGetAccessToken() || "").trim()) return true;
      }
      if (document.documentElement.classList.contains("vc-auth-session-pending")) return true;
      var t = localStorage.getItem("vc_discord_access_token");
      if (!t) return false;
      var exp = Number(localStorage.getItem("vc_discord_expires_at") || "0");
      return !exp || Date.now() < exp;
    } catch (eSess) {}
    return false;
  }

  function isDashboardNavAllowed() {
    if (window.__VC_DASHBOARD_MENU_BLACKLISTED === true) return false;
    if (window.__VC_DASHBOARD_ACCESS_OK === true) return true;
    if (window.__VC_DASHBOARD_MENU_ALLOWED === true) return true;
    if (window.__VC_DASHBOARD_MENU_ALLOWED === false && window.__VC_DASHBOARD_MENU_CHECKED === true) return false;
    var link = document.getElementById("discord-dashboard-link");
    if (link && !navItemHidden(link) && !link.classList.contains("is-blacklisted")) return true;
    if (hasLikelyDiscordSession()) return true;
    return false;
  }

  function shouldInjectDashboardTile() {
    try {
      if (document.body && document.body.classList.contains("vc-dashboard-page")) return false;
    } catch (e) {}
    return isDashboardNavAllowed();
  }

  function createDashboardTile() {
    if (!shouldInjectDashboardTile()) return null;
    var a = document.createElement("a");
    a.className = "vc-mobile-nav-tile";
    a.href = resolveDashboardHref();
    a.setAttribute("data-vc-mobile-dashboard", "1");
    var ico = document.createElement("span");
    ico.className = "vc-mobile-nav-tile-ico";
    ico.setAttribute("aria-hidden", "true");
    ico.innerHTML = '<i class="fa fa-server"></i>';
    var lab = document.createElement("span");
    lab.className = "vc-mobile-nav-tile-label";
    lab.textContent = i18nLabel("auth.dashboard", "Dashboard");
    a.appendChild(ico);
    a.appendChild(lab);
    bindMobileNavTileNav(a);
    return a;
  }

  function removeHeaderDashboardBtn() {
    var existing = document.getElementById("vc-mobile-dashboard-btn");
    if (existing) existing.remove();
  }

  function resolveStaffHref() {
    var link = document.getElementById("discord-staff-link");
    if (link) {
      var h = String(link.getAttribute("href") || "").trim();
      if (h) return h;
    }
    return "/staff/";
  }

  function isStaffNavAllowed() {
    if (window.__VC_STAFF_MENU_ALLOWED === true) return true;
    var link = document.getElementById("discord-staff-link");
    return Boolean(link && !navItemHidden(link));
  }

  function shouldInjectStaffTile() {
        return false;
  }

  function createStaffTile() {
    if (!shouldInjectStaffTile()) return null;
    var a = document.createElement("a");
    a.className = "vc-mobile-nav-tile";
    a.href = resolveStaffHref();
    a.setAttribute("data-vc-mobile-staff", "1");
    var ico = document.createElement("span");
    ico.className = "vc-mobile-nav-tile-ico";
    ico.setAttribute("aria-hidden", "true");
    ico.innerHTML = '<i class="fa fa-shield"></i>';
    var lab = document.createElement("span");
    lab.className = "vc-mobile-nav-tile-label";
    lab.textContent = i18nLabel("auth.staffArea", "Area Staff");
    a.appendChild(ico);
    a.appendChild(lab);
    bindMobileNavTileNav(a);
    return a;
  }

  function markTileActive(a, source) {
    if (!a) return;
    var href = "";
    try {
      href = a.getAttribute("href") || (source && source.getAttribute && source.getAttribute("href")) || "";
    } catch (eHref) {}
    var match = false;
    try {
      if (
        window.__VC_MOBILE_NAV_CANONICAL &&
        typeof window.__VC_MOBILE_NAV_CANONICAL.hrefMatches === "function"
      ) {
        match = window.__VC_MOBILE_NAV_CANONICAL.hrefMatches(href);
      } else {
        var here = String(window.location.pathname || "/").replace(/\/+$/, "") || "/";
        var target = href;
        try {
          target = String(new URL(href, window.location.href).pathname || "/").replace(/\/+$/, "") || "/";
        } catch (eU) {}
        if (target === "/") match = here === "/";
        else match = target === here;
      }
    } catch (eMatch) {}
    if (match) {
      a.classList.add("is-active");
      a.setAttribute("aria-current", "page");
    } else {
      a.classList.remove("is-active");
      try {
        a.removeAttribute("aria-current");
      } catch (eRm) {}
    }
  }

  function createTileFromRow(row) {
    if (navItemHidden(row)) return null;
    var href = row.getAttribute("href");
    if (!href) return null;
    if (isStaffOnlyNavHref(href)) return null;
    var target = row.getAttribute("target");
    var rel = row.getAttribute("rel");
    var dvl = row.getAttribute("data-vc-loading");
    var a = document.createElement("a");
    a.className = "vc-mobile-nav-tile";
    a.href = href;
    if (target) a.setAttribute("target", target);
    if (rel) a.setAttribute("rel", rel);
    if (dvl) a.setAttribute("data-vc-loading", dvl);
    var icoWrap = row.querySelector(".vc-snav-row-ico");
    var ico = document.createElement("span");
    ico.className = "vc-mobile-nav-tile-ico";
    ico.setAttribute("aria-hidden", "true");
    if (icoWrap) ico.innerHTML = icoWrap.innerHTML;
    var lab = document.createElement("span");
    lab.className = "vc-mobile-nav-tile-label";
    var spans = row.querySelectorAll("span");
    var labelText = "";
    var j;
    for (j = 0; j < spans.length; j += 1) {
      if (spans[j].classList.contains("vc-snav-row-ico")) continue;
      labelText = spans[j].textContent || "";
      if (labelText) break;
    }
    if (!labelText) labelText = String(row.textContent || "").trim();
    if (isStaffOnlyNavLabel(labelText)) return null;
    lab.textContent = normalizePublicNavLabel(href, labelText);
    a.appendChild(ico);
    a.appendChild(lab);
    markTileActive(a, row);
    bindMobileNavTileNav(a);
    return a;
  }

  function createTileFromItem(item) {
    if (navItemHidden(item)) return null;
    var href = item.getAttribute("href");
    if (!href) return null;
    if (isStaffOnlyNavHref(href)) return null;
    var a = document.createElement("a");
    a.className = "vc-mobile-nav-tile";
    a.href = href;
    var ico = document.createElement("span");
    ico.className = "vc-mobile-nav-tile-ico";
    ico.setAttribute("aria-hidden", "true");
    var fi = item.querySelector("i.fa");
    if (fi) ico.innerHTML = fi.outerHTML;
    var lab = document.createElement("span");
    lab.className = "vc-mobile-nav-tile-label";
    var innerSpan = item.querySelector("span");
    var labelText = innerSpan ? String(innerSpan.textContent || "").trim() : String(item.textContent || "").trim();
    if (isStaffOnlyNavLabel(labelText)) return null;
    lab.textContent = normalizePublicNavLabel(href, labelText);
    a.appendChild(ico);
    a.appendChild(lab);
    markTileActive(a, item);
    bindMobileNavTileNav(a);
    return a;
  }

  function isTicketsNavRow(row) {
    if (!row) return false;
    var href = String(row.getAttribute("href") || "").toLowerCase();
    if (
      href.indexOf("/tickets") >= 0 ||
      href.indexOf("tickets_page") >= 0 ||
      href.indexOf("supporto_page") >= 0
    ) {
      return true;
    }
    if (row.querySelector && row.querySelector("[data-i18n='nav.tickets']")) return true;
    if (row.querySelector && row.querySelector(".fa-ticket")) return true;
    return /\btickets\b/i.test(String(row.textContent || ""));
  }

  function appendMobileNavSection(gridRoot, title, tiles) {
    if (!gridRoot || !tiles || !tiles.length) return;
    var sec = document.createElement("section");
    sec.className = "vc-mobile-nav-section";
    var h = document.createElement("h3");
    h.className = "vc-mobile-nav-section-title";
    h.textContent = title;
    var g = document.createElement("div");
    g.className = "vc-mobile-nav-grid";
    var t;
    for (t = 0; t < tiles.length; t += 1) {
      if (tiles[t]) g.appendChild(tiles[t]);
    }
    if (!g.children.length) return;
    sec.appendChild(h);
    sec.appendChild(g);
    gridRoot.appendChild(sec);
  }

  function buildMobileNavRowTile(row) {
    if (navItemHidden(row)) return null;
    var href = String(row.getAttribute("href") || "").trim();
    if (!href) return null;
    if (isStaffOnlyNavHref(href)) return null;
    var a = document.createElement("a");
    a.className = "vc-mobile-nav-tile";
    a.href = href;
    var target = row.getAttribute("target");
    var rel = row.getAttribute("rel");
    var dvl = row.getAttribute("data-vc-loading");
    if (target) a.setAttribute("target", target);
    if (rel) a.setAttribute("rel", rel);
    if (dvl) a.setAttribute("data-vc-loading", dvl);
    var icoWrap = row.querySelector(".vc-snav-row-ico");
    var ico = document.createElement("span");
    ico.className = "vc-mobile-nav-tile-ico";
    ico.setAttribute("aria-hidden", "true");
    if (icoWrap) ico.innerHTML = icoWrap.innerHTML;
    var lab = document.createElement("span");
    lab.className = "vc-mobile-nav-tile-label";
    var spans = row.querySelectorAll("span");
    var labelText = "";
    var j;
    for (j = 0; j < spans.length; j += 1) {
      if (spans[j].classList.contains("vc-snav-row-ico")) continue;
      labelText = String(spans[j].textContent || "").trim();
      if (labelText) break;
    }
    if (!labelText) labelText = String(row.textContent || "").replace(/\s+/g, " ").trim();
    if (isStaffOnlyNavLabel(labelText)) return null;
    lab.textContent = normalizePublicNavLabel(href, labelText);
    a.appendChild(ico);
    a.appendChild(lab);
    markTileActive(a, row);
    bindMobileNavTileNav(a);
    return a;
  }

  function safeCreateTileFromRow(row) {
    try {
      return buildMobileNavRowTile(row);
    } catch (eRow) {
      return null;
    }
  }

  function collectTopNavTiles(nav) {
    var out = [];
    var items = nav.querySelectorAll(":scope > a.vc-snav-item");
    var i;
    for (i = 0; i < items.length; i += 1) {
      var tile = createTileFromItem(items[i]);
      if (tile) out.push(tile);
    }
    return out;
  }

  function collectDetailsNavTiles(detailsEl) {
    var out = [];
    if (!detailsEl) return out;
    var rows = detailsEl.querySelectorAll(".vc-snav-panel .vc-snav-row");
    var seenTicket = false;
    var r;
    for (r = 0; r < rows.length; r += 1) {
      var rowEl = rows[r];
      if (isTicketsNavRow(rowEl)) {
        if (seenTicket) continue;
        seenTicket = true;
      }
      var rowHref = rowEl ? rowEl.getAttribute("href") : "";
      var rowLab = "";
      try {
        var spans = rowEl.querySelectorAll("span");
        var sj;
        for (sj = 0; sj < spans.length; sj += 1) {
          if (spans[sj].classList.contains("vc-snav-row-ico")) continue;
          rowLab = String(spans[sj].textContent || "").trim();
          if (rowLab) break;
        }
      } catch (eLab) {}
      if (isStaffOnlyNavHref(rowHref) || isStaffOnlyNavLabel(rowLab)) continue;
      var tile = safeCreateTileFromRow(rowEl);
      if (tile) out.push(tile);
    }
    return out;
  }

  function rebuildGrid() {
    var gridRoot = document.getElementById("vc-mobile-nav-drawer-grid");
    if (!gridRoot) return;
    var usedCanonical = false;
    try {
      if (window.__VC_MOBILE_NAV_CANONICAL && window.__VC_MOBILE_NAV_CANONICAL.shouldUse()) {
        window.__VC_MOBILE_NAV_CANONICAL.build(gridRoot);
        usedCanonical = true;
      }
    } catch (eCanon) {}
    if (usedCanonical) {
      try {
        appendStaffGuideSection(
          gridRoot,
          document.querySelector("[data-vc-staff-tools-nav], .vc-snav-details--staff"),
        );
      } catch (eStaff) {}
      return;
    }
    var nav = document.querySelector("nav.vc-header-snav");
    if (!nav) return;
    gridRoot.innerHTML = "";

    var topTiles = collectTopNavTiles(nav);
    if (topTiles.length) appendMobileNavSection(gridRoot, "PRINCIPALE", topTiles);

    var details = nav.querySelectorAll(":scope > details.vc-snav-details");
    var d;
    for (d = 0; d < details.length; d += 1) {
      var el = details[d];
      var sum = el.querySelector(".vc-snav-summary");
      var titleTxt = "MENU";
      if (sum) {
        var sp = sum.querySelector("span");
        titleTxt = sectionLabel(sp ? sp.textContent : sum.textContent);
      }
      if (isStaffDetailsEl(el) || isStaffOnlyNavSection(titleTxt)) {
        appendStaffGuideSection(gridRoot, el);
        continue;
      }
      var sectionTiles = collectDetailsNavTiles(el);
      appendMobileNavSection(gridRoot, titleTxt, sectionTiles);
    }

    appendStaffGuideSection(gridRoot, document.querySelector("[data-vc-staff-tools-nav], .vc-snav-details--staff"));
  }

  function cloneBrand(intoEl) {
    var bar = document.querySelector(".vc-header-bar");
    if (!bar || !intoEl) return;
    var brandSource = bar.children[0];
    intoEl.innerHTML = "";
    if (!brandSource) return;
    var clone = brandSource.cloneNode(true);
    var walks = clone.querySelectorAll("[id]");
    var w;
    for (w = 0; w < walks.length; w += 1) {
      walks[w].removeAttribute("id");
    }
    intoEl.appendChild(clone);
    try {
      if (typeof window.__vcSyncHeaderSiteNameMarquee === "function") {
        window.__vcSyncHeaderSiteNameMarquee(intoEl);
      }
    } catch (eMarquee) {}
  }

  function onMqChange() {
    if (!isMobile()) closeDrawer();
  }

  var lastToggleTouchAt = 0;

  function isToggleEventTarget(ev) {
    var t = ev && ev.target;
    if (!t) return false;
    if (t.nodeType === 3) t = t.parentElement;
    return Boolean(t && t.closest && t.closest("#" + TOGGLE_ID));
  }

  function recoverDrawerIfMissing() {
    if (drawer) return drawer;
    try {
      var quick = document.getElementById("header-quick-actions");
      var existingToggle = document.getElementById(TOGGLE_ID);
      if (existingToggle) toggle = existingToggle;
      if (quick && toggle) {
        drawer = document.getElementById(DRAWER_ID) || document.createElement("div");
        drawer.id = DRAWER_ID;
        mountDrawer(drawer);
        backdrop = drawer.querySelector(".vc-mobile-nav-drawer__backdrop");
        if (backdrop && backdrop.getAttribute("data-vc-mobile-nav-bound") !== "1") {
          backdrop.setAttribute("data-vc-mobile-nav-bound", "1");
          backdrop.addEventListener("click", closeDrawer);
        }
        var closeBtn = document.getElementById("vc-mobile-nav-close");
        if (closeBtn && closeBtn.getAttribute("data-vc-mobile-nav-bound") !== "1") {
          closeBtn.setAttribute("data-vc-mobile-nav-bound", "1");
          closeBtn.addEventListener("click", closeDrawer);
        }
      }
    } catch (eRec) {}
    return drawer;
  }

  function shouldIgnoreDuplicateToggleEvent(ev) {
    if (!ev) return false;
    if (ev.type === "click" && Date.now() - lastToggleTouchAt < 450) return true;
    if (ev.type === "pointerup" && ev.pointerType === "mouse") return true;
    return false;
  }

  function toggleMenuFromEvent(ev) {
        if (window.__vcStaffHamburgerOwnsToggle) {
      if (ev && ev.preventDefault) ev.preventDefault();
      if (ev && ev.stopPropagation) ev.stopPropagation();
      return false;
    }
    if (ev && ev.__vcMobileNavHandled) {
      if (ev.preventDefault) ev.preventDefault();
      if (ev.stopPropagation) ev.stopPropagation();
      return false;
    }
    if (shouldIgnoreDuplicateToggleEvent(ev)) {
      if (ev.preventDefault) ev.preventDefault();
      if (ev.stopPropagation) ev.stopPropagation();
      return false;
    }
    try {
      ensure();
    } catch (eEns) {}
    if (!drawer) recoverDrawerIfMissing();
        try {
      var liveDrawer = document.getElementById(DRAWER_ID);
      if (liveDrawer) drawer = liveDrawer;
    } catch (eLive) {}
    if (!drawer) {
      if (ev && ev.preventDefault) ev.preventDefault();
      if (ev && ev.stopPropagation) ev.stopPropagation();
      if (ev) {
        try {
          ev.__vcMobileNavHandled = true;
        } catch (eH) {}
      }
            if (!window.__vcMobileNavRetryScheduled) {
        window.__vcMobileNavRetryScheduled = true;
        window.requestAnimationFrame(function () {
          window.__vcMobileNavRetryScheduled = false;
          try {
            ensure();
          } catch (eRetry) {}
          if (!drawer) recoverDrawerIfMissing();
          try {
            var live2 = document.getElementById(DRAWER_ID);
            if (live2) drawer = live2;
          } catch (eLive2) {}
          if (!drawer) return;
          if (drawer.classList.contains("vc-mobile-nav-drawer--open")) closeDrawer();
          else openDrawer();
        });
      }
      return false;
    }
    if (ev && ev.preventDefault) ev.preventDefault();
    if (ev && ev.stopPropagation) ev.stopPropagation();
    if (drawer.classList.contains("vc-mobile-nav-drawer--open")) closeDrawer();
    else openDrawer();
    if (ev) {
      ev.__vcMobileNavHandled = true;
          }
    if (ev && (ev.type === "touchend" || ev.type === "pointerup")) lastToggleTouchAt = Date.now();
    return true;
  }

  function bindToggleDirect(btn) {
    if (!btn || btn.getAttribute("data-vc-mobile-nav-bound") === "1") return;
    btn.setAttribute("data-vc-mobile-nav-bound", "1");
    btn.addEventListener(
      "click",
      function (ev) {
        if (!isToggleEventTarget(ev)) return;
        toggleMenuFromEvent(ev);
      },
      true,
    );
    btn.addEventListener(
      "touchend",
      function (ev) {
        if (!isToggleEventTarget(ev)) return;
        toggleMenuFromEvent(ev);
      },
      { capture: true, passive: false },
    );
  }

  function onDelegatedToggle(ev) {
    if (ev && ev.__vcMobileNavHandled) return;
    if (!isToggleEventTarget(ev)) return;
    if (ev.type === "pointerup") {
      if (typeof ev.button === "number" && ev.button !== 0) return;
      if (ev.pointerType === "mouse") return;
    }
    var btn = document.getElementById(TOGGLE_ID);
    if (btn && btn.getAttribute("data-vc-mobile-nav-bound") === "1") return;
    toggleMenuFromEvent(ev);
  }

  function bindGlobalToggle() {
    if (window.__vcMobileNavDelegated) return;
    window.__vcMobileNavDelegated = true;
    document.addEventListener("click", onDelegatedToggle, true);
    document.addEventListener("pointerup", onDelegatedToggle, true);
    document.addEventListener(
      "touchend",
      function (ev) {
        onDelegatedToggle(ev);
      },
      true,
    );
  }

  function drawerMarkup() {
    return (
      '<div class="vc-mobile-nav-drawer__backdrop" tabindex="-1"></div>' +
      '<div class="vc-mobile-nav-drawer__panel">' +
      '<div class="vc-mobile-nav-drawer__top">' +
      '<div class="vc-mobile-nav-drawer__brand" id="vc-mobile-nav-drawer-brand"></div>' +
      '<div class="vc-mobile-nav-drawer__top-actions">' +
      '<button type="button" class="vc-mobile-nav-drawer__close vc-icon-btn" id="vc-mobile-nav-close" aria-label="Chiudi menu"><i class="fa fa-times" aria-hidden="true"></i></button>' +
      "</div></div>" +
      '<div class="vc-mobile-nav-drawer__scroll" id="vc-mobile-nav-drawer-grid"></div>' +
      '<div class="vc-mobile-nav-drawer__footer" id="vc-mobile-nav-drawer-footer"></div>' +
      "</div>"
    );
  }

  function mountDrawer(el) {
    if (!el) return;
    if (!el.querySelector(".vc-mobile-nav-drawer__panel")) {
      el.className = "vc-mobile-nav-drawer";
      el.setAttribute("role", "dialog");
      el.setAttribute("aria-modal", "true");
      el.setAttribute("aria-label", "Menu di navigazione");
      el.setAttribute("aria-hidden", "true");
      el.innerHTML = drawerMarkup();
    }
    try {
      if (document.body && el.parentElement !== document.body) document.body.appendChild(el);
    } catch (eMove) {}
  }

  function ensure() {
    bindGlobalToggle();
    var existingToggle = document.getElementById(TOGGLE_ID);
    var existingDrawer = document.getElementById(DRAWER_ID);
    if (existingToggle) toggle = existingToggle;
    if (existingDrawer) drawer = existingDrawer;
    if (existingToggle && existingDrawer && toggle && drawer) {
      mountDrawer(drawer);
      backdrop = drawer.querySelector(".vc-mobile-nav-drawer__backdrop");
      bindToggleDirect(toggle);
      return;
    }

    var quick = document.getElementById("header-quick-actions");
    var bar = document.querySelector(".vc-header-bar");
    if (!quick || !bar) return;

    if (existingToggle) {
      toggle = existingToggle;
    } else {
      toggle = document.createElement("button");
      toggle.type = "button";
      toggle.id = TOGGLE_ID;
      toggle.className = "vc-mobile-nav-toggle vc-icon-btn";
      toggle.setAttribute("aria-label", "Apri menu di navigazione");
      toggle.setAttribute("aria-controls", DRAWER_ID);
      toggle.setAttribute("aria-expanded", "false");
      toggle.innerHTML =
        '<span class="vc-mobile-nav-toggle-bars" aria-hidden="true"><span></span><span></span><span></span></span>';
      var notif = document.getElementById("vc-notif-dropdown");
      var loginBtn = document.getElementById("discord-login-btn");
      if (loginBtn && loginBtn.parentElement === quick) {
        quick.insertBefore(toggle, loginBtn);
      } else if (notif && notif.parentElement === quick) {
        if (notif.nextSibling) quick.insertBefore(toggle, notif.nextSibling);
        else quick.appendChild(toggle);
      } else {
        quick.appendChild(toggle);
      }
    }
    try {
      if (typeof window.__vcNormalizeHeaderQuickActionsOrder === "function") {
        window.__vcNormalizeHeaderQuickActionsOrder(quick);
      }
    } catch (eNorm) {}
    toggle.setAttribute("aria-controls", DRAWER_ID);
    if (!toggle.getAttribute("aria-label")) {
      toggle.setAttribute("aria-label", "Apri menu di navigazione");
    }
    if (!toggle.innerHTML || !String(toggle.innerHTML).trim()) {
      toggle.innerHTML =
        '<span class="vc-mobile-nav-toggle-bars" aria-hidden="true"><span></span><span></span><span></span></span>';
    }

    if (existingDrawer) {
      drawer = existingDrawer;
    } else {
      drawer = document.createElement("div");
      drawer.id = DRAWER_ID;
    }
    mountDrawer(drawer);
    backdrop = drawer.querySelector(".vc-mobile-nav-drawer__backdrop");
    try {
      cloneBrand(document.getElementById("vc-mobile-nav-drawer-brand"));
      rebuildGrid();
    } catch (eBuild) {}
    var closeBtn = document.getElementById("vc-mobile-nav-close");
    if (closeBtn && closeBtn.getAttribute("data-vc-mobile-nav-bound") !== "1") {
      closeBtn.setAttribute("data-vc-mobile-nav-bound", "1");
      closeBtn.addEventListener("click", closeDrawer);
    }
    if (backdrop && backdrop.getAttribute("data-vc-mobile-nav-bound") !== "1") {
      backdrop.setAttribute("data-vc-mobile-nav-bound", "1");
      backdrop.addEventListener("click", closeDrawer);
    }
    bindToggleDirect(toggle);
    if (window.__vcLandingMobileNavListenersBound !== true) {
      window.__vcLandingMobileNavListenersBound = true;
      window.addEventListener("vc-discord-profile", function () {
        syncDrawerFooter();
        rebuildGrid();
        removeHeaderDashboardBtn();
      });
      window.addEventListener("vc-server-identity", function () {
        syncDrawerFooter();
      });
      window.addEventListener("vc-dashboard-access", function () {
        rebuildGrid();
        removeHeaderDashboardBtn();
      });
      window.addEventListener("vc-auth-session-boot", function () {
        rebuildGrid();
        removeHeaderDashboardBtn();
        syncDrawerFooter();
      });
      window.addEventListener("vc:staff-access-ok", function () {
        try {
          var btn = document.getElementById(TOGGLE_ID);
          if (btn) btn.removeAttribute("data-vc-mobile-nav-bound");
        } catch (eUnbind) {}
        try {
          ensure();
        } catch (eStaffEnsure) {}
        rebuildGrid();
        syncDrawerFooter();
      });
      window.addEventListener("vc:staff-notif-ready", function () {
        try {
          if (typeof window.__vcNormalizeHeaderQuickActionsOrder === "function") {
            window.__vcNormalizeHeaderQuickActionsOrder(document.getElementById("header-quick-actions"));
          }
        } catch (eStaffNorm) {}
        rebuildGrid();
      });
      document.addEventListener("vc:langchange", function () {
        rebuildGrid();
      });
    }
  }

  function refreshMobileNav() {
    ensure();
    rebuildGrid();
    removeHeaderDashboardBtn();
    syncDrawerFooter();
  }

  function init() {
    revealForbiddenSectionBooks();
    window.setInterval(revealForbiddenSectionBooks, 60000);
    bindGlobalToggle();
    ensure();
    var m = getMq();
    if (m.addEventListener) m.addEventListener("change", onMqChange);
    else if (m.addListener) m.addListener(onMqChange);
    removeHeaderDashboardBtn();
    syncDrawerFooter();
  }

  if (!window.__vcMobileNavRebuild) {
    window.__vcMobileNavRebuild = refreshMobileNav;
  }
  try {
    window.__vcMobileNavToggle = toggleMenuFromEvent;
  } catch (eExportToggle) {}
  try {
    window.__vcMobileNavSyncFooter = syncDrawerFooter;
  } catch (eExportFoot) {}
  try {
    window.__vcMobileNavClose = closeDrawer;
  } catch (eExportClose) {}

  function mergeForbiddenCollected(extra) {
    var merged = [];
    var add = function (id) {
      id = String(id || "").trim();
      if (!id || merged.indexOf(id) !== -1) return;
      merged.push(id);
    };
    var stored = readForbiddenBooks();
    for (var i = 0; i < stored.length; i += 1) add(stored[i]);
    if (Array.isArray(extra)) {
      for (var j = 0; j < extra.length; j += 1) add(extra[j]);
    }
    return merged;
  }

  function normalizeForbiddenBookIds(ids) {
    if (!Array.isArray(ids)) return [];
    return ids.map(function (x) {
      var v = String(x || "").trim().toLowerCase();
      return v === "unban" ? "appelli" : v;
    }).filter(Boolean);
  }

  function applyForbiddenBooksVisibility(books, collected, options) {
    var list = mergeForbiddenCollected(collected);
    var status = forbiddenBooksRoundState || {};
    var activeIds = normalizeForbiddenBookIds(status.bookIds);
    var canShow = status.roundActive === true || Boolean(options && options.previewViewer);
    for (var i = 0; i < books.length; i += 1) {
      var id = forbiddenBookId(books[i]);
      if (activeIds.length && activeIds.indexOf(id) === -1) {
        if (books[i].__vcFlyTimer) window.clearInterval(books[i].__vcFlyTimer);
        books[i].remove();
        continue;
      }
      if (list.indexOf(id) !== -1) {
        if (books[i].__vcFlyTimer) window.clearInterval(books[i].__vcFlyTimer);
        books[i].__vcFlyTimer = null;
        books[i].remove();
        continue;
      }
      if (!canShow) {
        hideForbiddenBooks([books[i]]);
        continue;
      }
      setupForbiddenBook(books[i], list);
    }
  }

  function revealForbiddenSectionBooks() {
    if (revealForbiddenBooksTimer) window.clearTimeout(revealForbiddenBooksTimer);
    revealForbiddenBooksTimer = window.setTimeout(revealForbiddenSectionBooksImpl, 80);
  }

  function revealForbiddenSectionBooksImpl() {
    revealForbiddenBooksTimer = null;
    var now = Date.now();

    function proceed() {
      ensureForbiddenBookForCurrentPage();
      var books = document.querySelectorAll("[data-vc-forbidden-book]");
      if (!books.length) return;
      if (!Number.isFinite(FORBIDDEN_BOOKS_START_MS) || (Number.isFinite(FORBIDDEN_BOOKS_END_MS) && now > FORBIDDEN_BOOKS_END_MS)) {
        removeForbiddenBooks(books);
        return;
      }
      if (getDiscordAccessTokenForForbiddenBooks()) {
        syncForbiddenBooksFromServer(books);
        return;
      }
      if (now < FORBIDDEN_BOOKS_START_MS) {
        hideForbiddenBooks(books);
        return;
      }
      applyForbiddenBooksVisibility(books, readForbiddenBooks(), {});
    }

    fetchForbiddenBooksPublicStatus().then(function (status) {
      if (status && status.ok === true) forbiddenBooksRoundState = status;
      if (status && status.ok && (status.enabled === false || forbiddenHuntEnded(status))) {
        removeAllForbiddenBooks();
        return;
      }
      proceed();
    }).catch(function () {
      proceed();
    });
  }

  function currentForbiddenBookPageId() {
    var path = String(window.location.pathname || "/").replace(/\/index\.html$/i, "").replace(/\/+$/, "") || "/";
    var map = {
      "/": "home",
      "/faq": "faq",
      "/wiki": "wiki",
      "/regole": "regole",
      "/donazioni": "donazioni",
      "/vote": "vote",
      "/ruoli": "ruoli",
      "/sponsor": "sponsor",
      "/candidature": "candidature",
      "/evento/shop": "evento_shop",
      "/evento/pozioni": "evento_pozioni",
      "/evento/smistamento": "evento_smistamento",
      "/evento/coppa": "evento_coppa",
      "/recensioni": "recensioni",
      "/dashboard/recensioni": "recensioni_bot",
      "/feedback": "feedback",
      "/suggerimenti": "feedback",
      "/supporto": "supporto",
      "/tickets": "supporto",
      "/user": "user",
      "/perks": "perks",
      "/notifications": "notifications",
      "/appelli": "appelli",
      "/unban": "appelli",
      "/privacy": "privacy",
      "/terms": "terms",
      "/cookie": "cookie",
    };
    return map[path] || "";
  }

  function ensureForbiddenBookForCurrentPage() {
    if (document.querySelector("[data-vc-forbidden-book]")) return;
    var id = currentForbiddenBookPageId();
    if (!id || !document.body) return;
    var status = forbiddenBooksRoundState || {};
    if (status.roundActive !== true) return;
    var activeIds = normalizeForbiddenBookIds(status.bookIds);
    if (activeIds.length && activeIds.indexOf(id) === -1) return;
    var el = document.createElement("span");
    el.className = "vc-forbidden-book";
    el.setAttribute("data-vc-forbidden-book", id);
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", "libro proibito");
    el.hidden = true;
    el.textContent = "📖";
    document.body.appendChild(el);
  }

  function hideForbiddenBooks(books) {
    for (var i = 0; i < books.length; i += 1) {
      books[i].hidden = true;
      books[i].setAttribute("hidden", "");
    }
  }

  function forbiddenBooksStorageKey() {
    var roundId = forbiddenBooksRoundState && forbiddenBooksRoundState.roundId;
    return FORBIDDEN_BOOKS_KEY + (roundId ? "_" + String(roundId) : "");
  }

  function readForbiddenBooks() {
    try {
      var raw = window.localStorage ? window.localStorage.getItem(forbiddenBooksStorageKey()) : "";
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch (_) {
      return [];
    }
  }

  function saveForbiddenBooks(ids) {
    try {
      if (window.localStorage) window.localStorage.setItem(forbiddenBooksStorageKey(), JSON.stringify(ids));
    } catch (_) {}
  }

  function forbiddenBookId(el) {
    var explicit = String(el.getAttribute("data-vc-forbidden-book") || "").trim();
    if (explicit && explicit !== "true") return explicit;
    var path = String(window.location.pathname || "/").replace(/\/index\.html$/i, "").replace(/\/+$/, "") || "home";
    return path.replace(/[^\w-]+/g, "_");
  }

  function setupForbiddenBook(el, collected) {
    var id = forbiddenBookId(el);
    var already = collected.indexOf(id) !== -1;
    if (already) {
      el.remove();
      return;
    }
    if (el.__vcForbiddenBookReady) {
      el.hidden = false;
      el.removeAttribute("hidden");
      if (!el.classList.contains("vc-forbidden-book--flying") && !el.__vcFlyTimer) startFlyingForbiddenBook(el);
      return;
    }
    el.__vcForbiddenBookReady = true;
    el.hidden = false;
    el.removeAttribute("hidden");
    el.setAttribute("role", "button");
    el.setAttribute("tabindex", "0");
    el.setAttribute("title", "Cattura il libro proibito");
    el.setAttribute("aria-label", "Cattura libro proibito");
    startFlyingForbiddenBook(el);
    var collect = function () {
      if (el.__vcClaiming) return;
      var now = Date.now();
      if (now - Number(el.__vcLastCollectAttempt || 0) < 500) return;
      el.__vcLastCollectAttempt = now;
      el.__vcClaiming = true;
      claimForbiddenBook(id).then(function (data) {
        var current = Array.isArray(data.collectedBookIds) ? data.collectedBookIds.map(String) : readForbiddenBooks();
        saveForbiddenBooks(current);
        if (el.__vcFlyTimer) window.clearInterval(el.__vcFlyTimer);
        el.classList.add("vc-forbidden-book--caught");
        el.setAttribute("title", "Libro raccolto");
        el.setAttribute("aria-label", "Libro proibito raccolto");
        showForbiddenBookToast(current.length, forbiddenHuntEnded(data) ? "Libro raccolto. La caccia ai libri proibiti è conclusa!" : "");
        window.setTimeout(function () {
          el.remove();
        }, 220);
        if (forbiddenHuntEnded(data)) removeAllForbiddenBooks();
      }).catch(function (err) {
        el.__vcClaiming = false;
        showForbiddenBookToast(readForbiddenBooks().length, err && err.message ? err.message : "Per raccoglierlo devi accedere e aver completato lo smistamento.");
      });
    };
    el.addEventListener("pointerup", function (event) {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      collect();
    });
    el.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      collect();
    });
  }

  function forbiddenBooksApiUrl() {
    return String(window.__VC_HOGWARTS_FORBIDDEN_BOOKS_API || "/webhooks/site-hogwarts-sorting/forbidden-books").trim() || "/webhooks/site-hogwarts-sorting/forbidden-books";
  }

  function forbiddenBooksPublicStatusUrl() {
    return String(window.__VC_HOGWARTS_FORBIDDEN_BOOKS_STATUS_API || "/webhooks/site-hogwarts-sorting/forbidden-books/status").trim() || "/webhooks/site-hogwarts-sorting/forbidden-books/status";
  }

  function forbiddenHuntEnded(data) {
    if (!data || data.ok !== true) return false;
    if (data.roundActive !== true) return true;
    return data.closed === true;
  }

  function fetchForbiddenBooksPublicStatus() {
    var now = Date.now();
    if (forbiddenStatusBlockedUntil > now) {
      return Promise.resolve(forbiddenBooksRoundState || null);
    }
    if (forbiddenStatusInFlight) return forbiddenStatusInFlight;
    var url = forbiddenBooksPublicStatusUrl();
    function finish(status) {
      if (status && status.ok === true) forbiddenBooksRoundState = status;
      return status;
    }
    if (window.VcApiCache && typeof window.VcApiCache.fetchWithCache === "function") {
      var cacheKey = window.VcApiCache.keyFor(url, { scope: "forbidden-status" });
      forbiddenStatusInFlight = window.VcApiCache
        .fetchWithCache(cacheKey, url, {
          ttlMs: 30000,
          staleMs: 5 * 60 * 1000,
          fetchInit: { method: "GET", credentials: "omit", cache: "no-store" },
        })
        .then(function (payload) {
          if (payload && payload.status === 429) {
            forbiddenStatusBlockedUntil = Date.now() + 90000;
            return finish(forbiddenBooksRoundState || null);
          }
          if (payload && payload.ok && payload.body) return finish(payload.body);
          return null;
        })
        .catch(function () {
          return finish(forbiddenBooksRoundState || null);
        })
        .finally(function () {
          forbiddenStatusInFlight = null;
        });
      return forbiddenStatusInFlight;
    }
    forbiddenStatusInFlight = fetch(url, { cache: "no-store" })
      .then(function (res) {
        if (res && res.status === 429) {
          forbiddenStatusBlockedUntil = Date.now() + 90000;
          return finish(forbiddenBooksRoundState || null);
        }
        if (!res || !res.ok) {
          return res.text().catch(function () { return ""; }).then(function () {
            throw new Error("forbidden_status_http_" + (res ? res.status : 0));
          });
        }
        return res.json().catch(function () {
          throw new Error("forbidden_status_json");
        });
      })
      .then(finish)
      .catch(function () {
        return null;
      })
      .finally(function () {
        forbiddenStatusInFlight = null;
      });
    return forbiddenStatusInFlight;
  }

  function getDiscordAccessTokenForForbiddenBooks() {
    try {
      var token = localStorage.getItem(DISCORD_ACCESS_TOKEN_KEY);
      var expiresAt = Number(localStorage.getItem(DISCORD_EXPIRES_AT_KEY) || "0");
      if (!token || !expiresAt || Date.now() >= expiresAt) return "";
      return token;
    } catch (_) {
      return "";
    }
  }

  function forbiddenBooksRequest(method, body) {
    var token = getDiscordAccessTokenForForbiddenBooks();
    if (!token) return Promise.reject(new Error("Accedi con Discord e completa lo smistamento per raccogliere i libri."));
    return fetch(forbiddenBooksApiUrl(), {
      method: method,
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok || !data || data.ok !== true) {
          throw new Error((data && data.message) || "Libro non raccolto.");
        }
        return data;
      });
    });
  }

  function claimForbiddenBook(bookId) {
    return forbiddenBooksRequest("POST", { bookId: bookId });
  }

  function syncForbiddenBooksFromServer(books) {
    var localCollected = readForbiddenBooks();
    if (!getDiscordAccessTokenForForbiddenBooks()) {
      applyForbiddenBooksVisibility(books, localCollected, {
        previewViewer: forbiddenBooksPreviewViewer,
      });
      return;
    }
    var gen = ++forbiddenBooksSyncGen;
    forbiddenBooksRequest("GET").then(function (data) {
      if (gen !== forbiddenBooksSyncGen) return;
      forbiddenBooksPreviewViewer = data.previewViewer === true;
      forbiddenBooksRoundState = data;
      var collected = Array.isArray(data.collectedBookIds) ? data.collectedBookIds.map(String) : [];
      saveForbiddenBooks(collected);
      if (forbiddenHuntEnded(data)) {
        removeAllForbiddenBooks();
        return;
      }
      applyForbiddenBooksVisibility(books, collected, {
        previewViewer: forbiddenBooksPreviewViewer,
      });
    }).catch(function () {
      if (gen !== forbiddenBooksSyncGen) return;
      applyForbiddenBooksVisibility(books, localCollected, {
        previewViewer: forbiddenBooksPreviewViewer,
      });
    });
  }

  function removeForbiddenBooks(books) {
    for (var i = 0; i < books.length; i += 1) {
      if (books[i].__vcFlyTimer) window.clearInterval(books[i].__vcFlyTimer);
      books[i].remove();
    }
  }

  function removeAllForbiddenBooks() {
    var books = document.querySelectorAll("[data-vc-forbidden-book]");
    removeForbiddenBooks(books);
  }

  function forbiddenBookViewport() {
    var vv = window.visualViewport;
    if (vv && Number.isFinite(vv.width) && Number.isFinite(vv.height)) {
      return {
        width: vv.width,
        height: vv.height,
        offsetLeft: vv.offsetLeft || 0,
        offsetTop: vv.offsetTop || 0,
      };
    }
    return {
      width: window.innerWidth || document.documentElement.clientWidth || 320,
      height: window.innerHeight || document.documentElement.clientHeight || 320,
      offsetLeft: 0,
      offsetTop: 0,
    };
  }

  function isForbiddenBookMobile() {
    try {
      return window.matchMedia("(max-width: 639.98px), (pointer: coarse)").matches;
    } catch (_) {
      return false;
    }
  }

  function prefersForbiddenBookReducedMotion() {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (_) {
      return false;
    }
  }

  function pauseForbiddenBookFlight(el, pauseMs) {
    if (!el) return;
    el.__vcFlyPaused = true;
    if (el.__vcFlyTimer) {
      window.clearInterval(el.__vcFlyTimer);
      el.__vcFlyTimer = null;
    }
    window.clearTimeout(el.__vcPauseResumeTimer);
    el.__vcPauseResumeTimer = window.setTimeout(function () {
      el.__vcFlyPaused = false;
      resumeForbiddenBookFlight(el);
    }, Math.max(1200, Number(pauseMs) || 2200));
  }

  function resumeForbiddenBookFlight(el) {
    if (!el || !el.isConnected || el.__vcFlyPaused || el.__vcFlyTimer) return;
    if (prefersForbiddenBookReducedMotion()) return;
    var move = el.__vcFlyMove;
    if (typeof move !== "function") return;
    move();
    var base = isForbiddenBookMobile() ? 1650 : 850;
    el.__vcFlyTimer = window.setInterval(move, base + Math.floor(Math.random() * 450));
  }

  function startFlyingForbiddenBook(el) {
    try {
      if (el.parentNode !== document.body) document.body.appendChild(el);
    } catch (_) {}
    var move = function () {
      if (el.__vcFlyPaused) return;
      var vp = forbiddenBookViewport();
      var margin = isForbiddenBookMobile() ? 52 : 72;
      var minX = vp.offsetLeft + margin;
      var minY = vp.offsetTop + margin;
      var maxX = vp.offsetLeft + Math.max(margin + 8, vp.width - margin);
      var maxY = vp.offsetTop + Math.max(margin + 8, vp.height - margin);
      var x = minX + Math.random() * Math.max(8, maxX - minX);
      var y = minY + Math.random() * Math.max(8, maxY - minY);
      var rotate = Math.round(-28 + Math.random() * 56);
      el.style.left = x + "px";
      el.style.top = y + "px";
      el.style.setProperty("--vc-book-rotate", rotate + "deg");
    };
    el.__vcFlyMove = move;
    el.classList.add("vc-forbidden-book--flying");
    move();
    if (!prefersForbiddenBookReducedMotion()) {
      window.setTimeout(move, 80);
      resumeForbiddenBookFlight(el);
    }
    if (!el.__vcFlyListeners) {
      el.__vcFlyListeners = true;
      el.addEventListener("pointerenter", function () {
        pauseForbiddenBookFlight(el, 2800);
      });
      el.addEventListener("pointerdown", function () {
        pauseForbiddenBookFlight(el, 4500);
      });
      var onViewportChange = function () {
        if (!el.isConnected) return;
                if (isForbiddenBookMobile()) {
          pauseForbiddenBookFlight(el, 1600);
          return;
        }
        move();
      };
      window.addEventListener("resize", onViewportChange);
      if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", onViewportChange);
                if (!isForbiddenBookMobile()) {
          window.visualViewport.addEventListener("scroll", onViewportChange);
        }
      }
    }
  }

  function showForbiddenBookToast(count, customMessage) {
    var status = forbiddenBooksRoundState || {};
    var total = Number(status.requiredCount);
    if (!Number.isFinite(total) || total <= 0) {
      total = Array.isArray(status.bookIds) && status.bookIds.length
        ? status.bookIds.length
        : FORBIDDEN_SITE_BOOKS_TOTAL;
    }
    var text = "";
    if (customMessage) {
      text = String(customMessage);
    } else {
      var got = Math.min(Math.max(0, Number(count) || 0), total);
      var chaos = status.mode === "finale_chaos" || Boolean(status.chaosSlotKey);
      var tip = chaos ? "" : " Alcuni libri possono essere anche negli status/canali Discord.";
      text = "Libro raccolto: " + got + "/" + total + " sul sito." + tip;
    }
        if (window.VcSiteToast && typeof window.VcSiteToast.show === "function") {
      window.VcSiteToast.show(text, false, { ms: 3600 });
      return;
    }
    var toast = document.getElementById("vc-forbidden-book-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "vc-forbidden-book-toast";
      toast.className = "vc-forbidden-book-toast";
      toast.setAttribute("role", "status");
      document.body.appendChild(toast);
    }
    toast.textContent = text;
    toast.classList.add("vc-forbidden-book-toast--show");
    window.clearTimeout(toast.__vcTimer);
    toast.__vcTimer = window.setTimeout(function () {
      toast.classList.remove("vc-forbidden-book-toast--show");
    }, 3600);
  }

  window.addEventListener("vc-discord-profile", function () {
    revealForbiddenSectionBooks();
  });
  document.addEventListener("vc-hogwarts-staff-preview-unlock", function () {
    revealForbiddenSectionBooks();
  });

  function bootMobileNav() {
    init();
  }

  if (document.body) {
    bootMobileNav();
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootMobileNav);
  } else {
    bootMobileNav();
  }
  window.addEventListener("vc:staff-notif-ready", function () {
    try {
      refreshMobileNav();
    } catch (eStaffNav) {}
  });
})();

function vcPageAssetVer() {
  try {
    var nodes = document.querySelectorAll('script[src*="/js/"], link[href*="/css/"]');
    for (var i = nodes.length - 1; i >= 0; i--) {
      var url = nodes[i].src || nodes[i].href || "";
      var m = String(url).match(/[?&]v=([^&"'#]+)/);
      if (m && m[1]) return m[1];
    }
  } catch (eVer) {}
  return String(Date.now());
}

(function loadPtr() {
  if (window.__vcPtrBooted) return;
  try {
    if (document.querySelector('script[src*="vc-ptr.js"]')) return;
  } catch (e) {}
  var s = document.createElement("script");
  s.src = "/js/vc-ptr.js?v=" + vcPageAssetVer();
  s.defer = true;
  (document.body || document.documentElement).appendChild(s);
})();

(function loadSitePolish() {
  try {
    var p = String(location.pathname || "").replace(/\/+$/, "") || "/";
    if (p === "/staff" || p.indexOf("/staff/") === 0) return;
    if (document.querySelector('script[src*="vc-site-polish.js"]')) return;
  } catch (e0) {}
  var s = document.createElement("script");
  s.src = "/js/vc-site-polish.js?v=20260901cineFxUnify1";
  s.defer = true;
  (document.body || document.documentElement).appendChild(s);
})();

(function loadHeaderNameMarquee() {
  function marqueeAssetVer() {
    return "20260903hamburgerActiveFix1";
  }
  function inject() {
    try {
      if (document.querySelector('script[src*="vc-header-name-marquee.js"]')) return true;
    } catch (e0) {
      return false;
    }
    var s = document.createElement("script");
    s.src = "/js/vc-header-name-marquee.js?v=" + marqueeAssetVer();
    s.defer = true;
    s.onload = function () {
      try {
        if (typeof window.__vcSyncHeaderSiteNameMarquee === "function") {
          window.__vcSyncHeaderSiteNameMarquee(document);
        }
      } catch (eSync) {}
    };
    (document.body || document.documentElement).appendChild(s);
    return true;
  }
  try {
    if (document.querySelector(".vc-header-bar, body > header, .vc-mobile-nav-drawer__brand")) {
      inject();
      return;
    }
  } catch (eEarly) {}
  var tries = 0;
  var iv = setInterval(function () {
    tries += 1;
    var ready = false;
    try {
      ready = Boolean(
        document.querySelector(
          ".vc-header-bar .vc-header-site-name, .vc-header-bar a.vc-header-logo-link + a, .vc-header-bar, body > header"
        )
      );
    } catch (eReady) {}
    if (ready || tries >= 40) {
      clearInterval(iv);
      inject();
      try {
        if (typeof window.__vcSyncHeaderSiteNameMarquee === "function") {
          window.__vcSyncHeaderSiteNameMarquee(document);
        }
      } catch (eLate) {}
    }
  }, 250);
})();

(function loadHeaderPromo() {
  function promoAssetVer() {
    return "20260907candPillNoFlash2";
  }
  try {
    var hasActions = Boolean(document.getElementById("header-quick-actions"));
    if (!hasActions) return;
    if (!document.getElementById("vc-header-promo-btn") && !window.__VC_HEADER_PROMO) {
      window.__VC_HEADER_PROMO = {
        eventUrl: "/evento",
        candidatureUrl: "/candidature",
        event: {
          enabled: true,
          previewMode: false,
          startDate: "2026-06-01T12:00:00",
          sortingStartDate: "2026-06-01T12:00:00",
          endDate: "2026-09-01T12:00:00",
          timezone: "Europe/Rome",
        },
      };
    }
    if (document.querySelector('script[src*="vc-header-promo.js"]')) return;
  } catch (e0) {
    return;
  }
  var s = document.createElement("script");
  s.src = "/js/vc-header-promo.js?v=" + promoAssetVer();
  s.defer = true;
  (document.body || document.documentElement).appendChild(s);
})();

(function vcMiniPager() {
  if (window.__vcMiniPager) return;

  function langEn() {
    try {
      return String(document.documentElement.lang || "").toLowerCase().indexOf("en") === 0;
    } catch (e) {
      return false;
    }
  }

  function closePop(root) {
    if (!root) return;
    var pop = root.querySelector(".vc-mini-pager__pop");
    var jump = root.querySelector("[data-pager-jump]");
    if (pop) pop.hidden = true;
    if (jump) jump.setAttribute("aria-expanded", "false");
  }

  function closeAll(except) {
    var nodes = document.querySelectorAll(".vc-mini-pager__pop:not([hidden])");
    for (var i = 0; i < nodes.length; i++) {
      var root = nodes[i].closest(".vc-mini-pager") || nodes[i].parentElement;
      if (except && root === except) continue;
      closePop(root);
    }
  }

  function clampPage(raw, total) {
    var n = parseInt(String(raw || ""), 10);
    var tp = Math.max(1, Number(total) || 1);
    if (!isFinite(n)) return 0;
    if (n < 1) n = 1;
    if (n > tp) n = tp;
    return n;
  }

  function headerOffsetPx() {
    try {
      var bar = document.querySelector(".vc-header-bar") || document.querySelector("header");
      var h = bar ? bar.getBoundingClientRect().height : 72;
      return Math.round(Math.max(64, h + 12));
    } catch (eOff) {
      return 88;
    }
  }

  function resolveScrollAnchor(root) {
    if (!root) return null;
    try {
      var custom = String(root.getAttribute("data-pager-scroll") || "").trim();
      if (custom) {
        var bySel = document.querySelector(custom);
        if (bySel) return bySel;
      }
      var wrapped = root.closest("[data-pager-anchor]");
      if (wrapped) return wrapped;
      var scope = root.closest("main") || document.body;
      if (!scope) return root;
      var candidates = scope.querySelectorAll(
        [
          "#vc-ul-toolbar",
          "#vc-ul-board-tabs",
          "#vc-ul-grid",
          "#vc-roles-toolbar",
          "#vc-roles-grid",
          "#vc-reviews-server-list",
          "#vc-suggestions-list",
          "[data-pager-list]",
          ".vc-wt-list",
          ".vc-tprof-list",
          ".vc-dash-table-wrap",
          "#vc-page-content",
        ].join(",")
      );
      var pagerY =
        root.getBoundingClientRect().top + (window.pageYOffset || document.documentElement.scrollTop || 0);
      var best = null;
      for (var i = 0; i < candidates.length; i++) {
        var c = candidates[i];
        if (!c || root.contains(c)) continue;
        var y = c.getBoundingClientRect().top + (window.pageYOffset || document.documentElement.scrollTop || 0);
        if (y <= pagerY + 12) best = c;
      }
      return best || root;
    } catch (eRes) {
      return root;
    }
  }

  function scrollToPagerContent(root, behavior) {
    var anchor = resolveScrollAnchor(root);
    if (!anchor) return;
    try {
      var y =
        anchor.getBoundingClientRect().top +
        (window.pageYOffset || document.documentElement.scrollTop || 0) -
        headerOffsetPx();
      if (y < 0) y = 0;
      window.scrollTo({ top: y, behavior: behavior || "auto" });
    } catch (eScroll) {
      try {
        anchor.scrollIntoView({ block: "start", behavior: behavior || "auto" });
      } catch (e2) {}
    }
  }

  function wrapHandlers(root, handlers, opts) {
    handlers = handlers || {};
    opts = opts || {};
    if (opts.scroll === false) return handlers;
    var behavior = opts.scrollBehavior || "auto";
    function bump() {
      window.requestAnimationFrame(function () {
        scrollToPagerContent(root, behavior);
      });
      window.setTimeout(function () {
        scrollToPagerContent(root, behavior);
      }, 90);
    }
    var out = {};
    if (typeof handlers.go === "function") {
      out.go = function (page) {
        var cur = Number(root.getAttribute("data-pager-page") || 1);
        var next = Math.max(1, Number(page) || 1);
        if (next === cur) return;
        handlers.go(next);
        bump();
      };
    }
    if (typeof handlers.prev === "function") {
      out.prev = function () {
        handlers.prev();
        bump();
      };
    }
    if (typeof handlers.next === "function") {
      out.next = function () {
        handlers.next();
        bump();
      };
    }
    return out;
  }

  function html(page, total, opts) {
    opts = opts || {};
    var p = Math.max(1, Number(page) || 1);
    var tp = Math.max(1, Number(total) || 1);
    if (p > tp) p = tp;
    var prevAttr = opts.prevAttr || "data-pager-prev";
    var nextAttr = opts.nextAttr || "data-pager-next";
    var aria = opts.aria || (langEn() ? "Pagination" : "Paginazione");
    var jumpAria = langEn() ? "Go to page" : "Vai a pagina";
    var goLbl = langEn() ? "Go to" : "Vai a";
    var prevAria = langEn() ? "Previous page" : "Pagina precedente";
    var nextAria = langEn() ? "Next page" : "Pagina successiva";
    var inner =
      '<button type="button" class="vc-mini-pager__arrow" ' +
      prevAttr +
      (p <= 1 ? " disabled" : "") +
      ' aria-label="' +
      prevAria +
      '"><i class="fa fa-chevron-left" aria-hidden="true"></i></button>' +
      '<div class="vc-mini-pager__jump">' +
      '<button type="button" class="vc-mini-pager__now" data-pager-jump aria-haspopup="dialog" aria-expanded="false" title="' +
      jumpAria +
      '">' +
      String(p) +
      "</button>" +
      '<div class="vc-mini-pager__pop" hidden role="dialog" aria-label="' +
      jumpAria +
      '">' +
      '<span class="vc-mini-pager__lbl">' +
      goLbl +
      "</span>" +
      '<input class="vc-mini-pager__input" type="number" inputmode="numeric" min="1" max="' +
      tp +
      '" value="' +
      p +
      '" data-pager-input>' +
      '<span class="vc-mini-pager__of">/ ' +
      tp +
      "</span>" +
      "</div></div>" +
      '<button type="button" class="vc-mini-pager__arrow" ' +
      nextAttr +
      (p >= tp ? " disabled" : "") +
      ' aria-label="' +
      nextAria +
      '"><i class="fa fa-chevron-right" aria-hidden="true"></i></button>';
    if (opts.innerOnly) return inner;
    return (
      '<nav class="vc-mini-pager" data-pager-page="' +
      p +
      '" data-pager-total="' +
      tp +
      '" aria-label="' +
      aria +
      '">' +
      inner +
      "</nav>"
    );
  }

  function commit(root, handlers) {
    if (!root || !handlers || typeof handlers.go !== "function") return;
    var input = root.querySelector("[data-pager-input]");
    var total = Number(root.getAttribute("data-pager-total") || (input && input.max) || 1);
    var current = Number(root.getAttribute("data-pager-page") || 1);
    var next = clampPage(input ? input.value : "", total);
    closePop(root);
    if (!next || next === current) return;
    handlers.go(next);
  }

  function bind(root, handlers, opts) {
    if (!root || !handlers) return;
    if (root.dataset.vcMiniPager === "1") return;
    root.dataset.vcMiniPager = "1";
    root.classList.add("vc-mini-pager");
    var h = wrapHandlers(root, handlers, opts);

    root.addEventListener("click", function (ev) {
      var t = ev.target && ev.target.closest ? ev.target.closest("button, input") : null;
      if (!t || !root.contains(t)) return;
      if (t.matches("[data-pager-jump]")) {
        ev.preventDefault();
        var pop = root.querySelector(".vc-mini-pager__pop");
        var input = root.querySelector("[data-pager-input]");
        var open = pop && pop.hidden;
        closeAll(root);
        if (pop) pop.hidden = !open;
        t.setAttribute("aria-expanded", open ? "true" : "false");
        if (open && input) {
          input.value = String(root.getAttribute("data-pager-page") || input.value || "1");
          window.setTimeout(function () {
            try {
              input.focus();
              input.select();
            } catch (eF) {}
          }, 0);
        }
        return;
      }
      if (t.matches("[data-pager-prev]")) {
        if (t.disabled) return;
        var cur = Number(root.getAttribute("data-pager-page") || 1);
        if (typeof h.prev === "function") h.prev();
        else if (typeof h.go === "function") h.go(Math.max(1, cur - 1));
        return;
      }
      if (t.matches("[data-pager-next]")) {
        if (t.disabled) return;
        var curN = Number(root.getAttribute("data-pager-page") || 1);
        var tot = Number(root.getAttribute("data-pager-total") || 1);
        if (typeof h.next === "function") h.next();
        else if (typeof h.go === "function") h.go(Math.min(tot, curN + 1));
      }
    });

    root.addEventListener("keydown", function (ev) {
      if (!ev || ev.key !== "Enter") return;
      if (!ev.target || !ev.target.matches || !ev.target.matches("[data-pager-input]")) return;
      ev.preventDefault();
      commit(root, h);
    });
    root.addEventListener("focusout", function (ev) {
      if (!ev || !ev.target || !ev.target.matches || !ev.target.matches("[data-pager-input]")) return;
      window.setTimeout(function () {
        if (root.contains(document.activeElement)) return;
        commit(root, h);
      }, 0);
    });
  }

  if (!window.__vcMiniPagerDocBound) {
    window.__vcMiniPagerDocBound = true;
    document.addEventListener("pointerdown", function (ev) {
      var pop = ev.target && ev.target.closest ? ev.target.closest(".vc-mini-pager") : null;
      closeAll(pop);
    });
    document.addEventListener("keydown", function (ev) {
      if (ev && ev.key === "Escape") closeAll(null);
    });
  }

  window.__vcMiniPager = {
    html: html,
    bind: bind,
    closeAll: closeAll,
    scrollToContent: scrollToPagerContent,
    sync: function (root, page, total) {
      if (!root) return;
      var p = Math.max(1, Number(page) || 1);
      var tp = Math.max(1, Number(total) || 1);
      if (p > tp) p = tp;
      root.setAttribute("data-pager-page", String(p));
      root.setAttribute("data-pager-total", String(tp));
      var now = root.querySelector("[data-pager-jump]");
      if (now) now.textContent = String(p);
      var input = root.querySelector("[data-pager-input]");
      if (input) {
        input.max = String(tp);
        input.value = String(p);
      }
      var of = root.querySelector(".vc-mini-pager__of");
      if (of) of.textContent = "/ " + tp;
      var prev = root.querySelector("[data-pager-prev]");
      var next = root.querySelector("[data-pager-next]");
      if (prev) prev.disabled = p <= 1;
      if (next) next.disabled = p >= tp;
    },
    fill: function (root, page, total, opts, handlers) {
      if (!root) return;
      opts = opts || {};
      opts.innerOnly = true;
      var p = Math.max(1, Number(page) || 1);
      var tp = Math.max(1, Number(total) || 1);
      root.classList.add("vc-mini-pager");
      root.setAttribute("data-pager-page", String(p));
      root.setAttribute("data-pager-total", String(tp));
      root.innerHTML = html(p, tp, opts);
      if (handlers) bind(root, handlers, opts);
    },
  };
})();

(function () {
  if (window.__vcPwaBlackRecover) return;
  window.__vcPwaBlackRecover = true;
  var lastRecoverAt = 0;
  var recovering = false;
  var watchHealthyStreak = 0;
  var PHONE_WATCH_MS = 4500;
  var PHONE_WATCH_MAX_MS = 90000;

  function isPhoneOrPwa() {
    try {
      return (
        (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
        (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
        Boolean(navigator.standalone) ||
        Number(navigator.maxTouchPoints || 0) > 0
      );
    } catch (eDet) {
      return false;
    }
  }

  function stopPhoneScrollWatch() {
    try {
      if (window.__vcPhoneScrollWatch) {
        clearInterval(window.__vcPhoneScrollWatch);
        window.__vcPhoneScrollWatch = 0;
      }
    } catch (eStop) {}
  }

  function forceReveal() {
    try {
      var nodes = document.querySelectorAll(".vc-home-rise:not(.is-in)");
      var vh = window.innerHeight || document.documentElement.clientHeight || 800;
      var n = Math.min(nodes.length, 80);
      for (var i = 0; i < n; i++) {
        var el = nodes[i];
        try {
          var r = el.getBoundingClientRect();
                    if (r.top < vh * 0.92 && r.bottom > 16) el.classList.add("is-in");
        } catch (eOne) {
          el.classList.add("is-in");
        }
      }
    } catch (e0) {}
  }

  function loaderLooksDead(el) {
    if (!el) return true;
    try {
      if (typeof window.__vcLoaderElReallyBlocking === "function") {
        return !window.__vcLoaderElReallyBlocking(el);
      }
    } catch (eApi) {}
    try {
      if (el.hidden || el.hasAttribute("hidden")) return true;
      var cs = window.getComputedStyle(el);
      if (!cs || cs.display === "none" || cs.visibility === "hidden") return true;
      if (Number(cs.opacity || "1") < 0.05) return true;
      if (cs.pointerEvents === "none") return true;
      var r = el.getBoundingClientRect();
      if (r.width < 24 || r.height < 24) return true;
      return false;
    } catch (eDead) {
      return true;
    }
  }

  function stampHiddenLoader(el) {
    if (!el) return;
    try {
      el.hidden = true;
      el.setAttribute("hidden", "");
      el.removeAttribute("data-vc-loader-blocking");
      el.style.setProperty("display", "none", "important");
      el.style.setProperty("pointer-events", "none", "important");
      el.style.setProperty("opacity", "0", "important");
    } catch (eStamp) {}
    try {
      if (typeof window.__vcSyncLoaderBlockingLiveClass === "function") window.__vcSyncLoaderBlockingLiveClass();
    } catch (eLiveStamp) {}
  }

  function clearPhoneHasFreezeGhosts() {
                try {
      var rootNav = document.documentElement;
      var navDr = document.getElementById("vc-mobile-nav-drawer");
      if (
        rootNav.classList.contains("vc-mobile-nav-open") &&
        (!navDr || !navDr.classList.contains("vc-mobile-nav-drawer--open"))
      ) {
        rootNav.classList.remove("vc-mobile-nav-open");
      }
    } catch (eNavGhost) {}
            try {
      var tr = document.getElementById("vc-page-transition");
      if (tr) {
        var trCs = window.getComputedStyle(tr);
        if (!trCs || trCs.display === "none" || trCs.visibility === "hidden" || trCs.pointerEvents === "none") {
          tr.classList.remove("vc-page-transition--on");
        }
      }
    } catch (eTr) {}
    try {
      var sov = document.getElementById("vc-session-verify-overlay");
      if (sov) {
        var sovCs = window.getComputedStyle(sov);
        if (!sovCs || sovCs.display === "none" || sovCs.visibility === "hidden" || sovCs.pointerEvents === "none") {
          sov.classList.add("vc-session-verify-overlay--hidden");
          if (sov.parentNode) sov.parentNode.removeChild(sov);
          document.documentElement.classList.remove("vc-session-verify-pending");
        }
      }
    } catch (eSov) {}
    try {
      var boots = document.querySelectorAll(
        "#vc-user-profile-view .vc-user-profile-boot, #vc-user-profile-view > .vc-user-profile-loader, #vc-user-profile-view > [data-vc-profile-boot]",
      );
      for (var bi = 0; bi < boots.length; bi++) {
        var boot = boots[bi];
        if (loaderLooksDead(boot)) stampHiddenLoader(boot);
      }
    } catch (eBoot) {}
        try {
      var ghosts = document.querySelectorAll(".vc-ul-loading");
      for (var gi = 0; gi < ghosts.length; gi++) {
        var g = ghosts[gi];
        if (g.classList && g.classList.contains("vc-reviews-gate")) continue;
        var reallyBlocking = false;
        try {
          if (typeof window.__vcLoaderElReallyBlocking === "function") {
            reallyBlocking = window.__vcLoaderElReallyBlocking(g);
          } else {
            reallyBlocking = !loaderLooksDead(g);
          }
        } catch (eBlkG) {
          reallyBlocking = !loaderLooksDead(g);
        }
        if (reallyBlocking) continue;
        stampHiddenLoader(g);
        try {
          g.removeAttribute("data-vc-loader-blocking");
        } catch (eBlkRm) {}
      }
    } catch (eGhostUl) {}
    try {
      var shared = document.getElementById("vc-shared-boot-overlay");
      if (shared && loaderLooksDead(shared)) stampHiddenLoader(shared);
    } catch (eShared) {}
                    try {
      var rootPend = document.documentElement;
      var ulLoad = document.getElementById("vc-ul-loading");
      if (rootPend.classList.contains("vc-user-leader-pending") && loaderLooksDead(ulLoad)) {
        var painted = document.querySelector(
          "#vc-ul-list .vc-ul-row, #vc-ul-rows [data-user-id], .vc-ul-card, #vc-ul-empty:not([hidden]), .vc-user-leader-empty, #vc-ul-grid .vc-ul-card",
        );
        var agedOut = Date.now() - (window.__vcPhoneUnfreezeArmedAt || Date.now()) > 12000;
        if (painted || agedOut) {
          rootPend.classList.remove("vc-user-leader-pending");
          stampHiddenLoader(ulLoad);
        }
      }
      if (rootPend.classList.contains("vc-user-profile-pending")) {
        var profLoad = document.getElementById("vc-user-profile-loading");
        var bodyProf = document.querySelector("body > .vc-user-profile-loader");
        var viewReady = document.querySelector("#vc-user-profile-view:not([hidden]) .vc-user-profile-main");
        if (loaderLooksDead(profLoad) && loaderLooksDead(bodyProf) && viewReady) {
          rootPend.classList.remove("vc-user-profile-pending");
          stampHiddenLoader(profLoad);
          stampHiddenLoader(bodyProf);
        }
      }
    } catch (ePend) {}
        try {
      var coarseOrPwa = false;
      try {
        coarseOrPwa =
          (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
          (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
          Boolean(navigator.standalone) ||
          Number(navigator.maxTouchPoints || 0) > 0;
      } catch (eDet) {
        coarseOrPwa = true;
      }
      if (coarseOrPwa) {
        document.documentElement.style.removeProperty("touch-action");
        document.documentElement.style.removeProperty("overflow");
        document.documentElement.style.removeProperty("overflow-x");
        document.documentElement.style.removeProperty("overflow-y");
        document.documentElement.style.removeProperty("height");
        document.documentElement.style.removeProperty("max-height");
        if (document.body) {
          document.body.style.removeProperty("touch-action");
          document.body.style.removeProperty("overflow");
          document.body.style.removeProperty("overflow-x");
          document.body.style.removeProperty("overflow-y");
          document.body.style.removeProperty("height");
          document.body.style.removeProperty("max-height");
        }
        try {
          if (typeof window.__vcUnpinPageScroll === "function") {
                        var root = document.documentElement;
            var ddLive = document.getElementById("vc-notif-dropdown");
            var notifReallyOpen = Boolean(
              ddLive &&
                (ddLive.open || ddLive.hasAttribute("open")) &&
                (root.classList.contains("vc-notif-sheet-open") ||
                  root.classList.contains("vc-notif-drawer-open")),
            );
            if (
              (root.classList.contains("vc-notif-sheet-open") ||
                root.classList.contains("vc-notif-drawer-open")) &&
              !notifReallyOpen
            ) {
              try {
                root.classList.remove(
                  "vc-notif-sheet-open",
                  "vc-notif-drawer-open",
                  "vc-notif-dropdown-open",
                  "vc-notif-overlay-active",
                );
              } catch (eGhostSheet) {}
            }
            var mustLock =
              root.classList.contains("vc-mobile-nav-open") ||
              notifReallyOpen ||
              root.classList.contains("vc-dialog-open") ||
              root.classList.contains("vc-staff-manage-sheet-open") ||
              root.classList.contains("vc-staff-reso-sheet-open") ||
              root.classList.contains("vc-staff-stat-sheet-open");
            if (mustLock && typeof window.__vcPinPageScroll === "function") {
              window.__vcPinPageScroll({ soft: true });
            } else if (!mustLock) {
              window.__vcUnpinPageScroll();
            }
          }
        } catch (ePinApi) {}
        try {
          if (typeof window.__vcStripPhoneInlineScrollLocks === "function") {
            window.__vcStripPhoneInlineScrollLocks();
          }
        } catch (eStripApi) {}
      }
    } catch (eUnfreeze) {}
    try {
      if (typeof window.__vcSyncLoaderBlockingLiveClass === "function") window.__vcSyncLoaderBlockingLiveClass();
    } catch (eLiveGhost) {}
  }

  function forceHideStuckLoaders() {
    clearPhoneHasFreezeGhosts();
    try {
      var loaders = document.querySelectorAll(".vc-ul-loading");
      for (var i = 0; i < loaders.length; i++) {
        var el = loaders[i];
        if (el.classList.contains("vc-reviews-gate")) continue;
                if (
          document.documentElement.classList.contains("vc-user-leader-pending") &&
          el.id === "vc-ul-loading" &&
          !loaderLooksDead(el)
        ) {
          continue;
        }
        stampHiddenLoader(el);
      }
    } catch (eL) {}
    try {
      document.documentElement.classList.remove("vc-loading-scroll-lock");
      document.documentElement.classList.remove("vc-user-profile-pending");
            try {
        var ulStuck = document.getElementById("vc-ul-loading");
        if (loaderLooksDead(ulStuck)) {
          document.documentElement.classList.remove("vc-user-leader-pending");
        }
      } catch (eLead) {}
      document.documentElement.classList.add("vc-page-cine-ready");
      document.documentElement.classList.remove("vc-page-cine-boot");
    } catch (eCls) {}
    try {
      var rootBoot = document.documentElement;
      if (
        rootBoot.classList.contains("vc-page-cine-boot") &&
        !rootBoot.classList.contains("vc-page-cine-ready") &&
        Date.now() - (window.__vcPhoneUnfreezeArmedAt || 0) > 8000
      ) {
        rootBoot.classList.add("vc-page-cine-ready");
        rootBoot.classList.remove("vc-page-cine-boot");
      }
    } catch (eBootReady) {}
    try {
      if (typeof window.__vcUnpinPageScroll === "function") window.__vcUnpinPageScroll();
    } catch (eU) {}
    try {
      if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
    } catch (eS) {}
  }

  function pageLooksHealthy() {
    try {
      var root = document.documentElement;
      if (root.classList.contains("vc-page-cine-boot") && !root.classList.contains("vc-page-cine-ready")) return false;
      if (root.classList.contains("vc-loading-scroll-lock")) return false;
      try {
        if (typeof window.__vcIsBlockingLoaderVisible === "function" && window.__vcIsBlockingLoaderVisible()) return false;
      } catch (eBlkH) {
        if (document.querySelector('.vc-ul-loading[data-vc-loader-blocking="1"]')) return false;
      }
            return root.classList.contains("vc-page-cine-ready") || root.classList.contains("vc-home-motion-ready");
    } catch (eH) {
      return false;
    }
  }

  function recover(force) {
    if (recovering) return;
    var now = Date.now();
    if (!force && now - lastRecoverAt < 1200) return;
    if (!force && pageLooksHealthy()) {
      lastRecoverAt = now;
      return;
    }
    recovering = true;
    lastRecoverAt = now;
    var keepNotifScrollLock = false;
    try {
      var ddKeep = document.getElementById("vc-notif-dropdown");
      var rootKeep = document.documentElement;
      keepNotifScrollLock = Boolean(
        ddKeep &&
          (ddKeep.open || ddKeep.hasAttribute("open")) &&
          (rootKeep.classList.contains("vc-notif-sheet-open") ||
            rootKeep.classList.contains("vc-notif-drawer-open")),
      );
    } catch (eKeepN) {
      keepNotifScrollLock = false;
    }
    try {
      var root = document.documentElement;
      root.classList.add("vc-page-cine-ready");
      root.classList.add("vc-home-motion-ready");
      root.classList.remove("vc-page-cine-boot");
      if (!keepNotifScrollLock) root.classList.remove("vc-loading-scroll-lock");
      root.classList.remove("vc-session-verify-pending");
            try {
        var ul = document.getElementById("vc-ul-loading");
        if (!ul || ul.hidden || ul.hasAttribute("hidden") || loaderLooksDead(ul)) {
          root.classList.remove("vc-user-leader-pending");
          if (ul) stampHiddenLoader(ul);
        }
      } catch (eLead) {}
    } catch (e1) {}
    forceReveal();
    clearPhoneHasFreezeGhosts();
    /* notifSidebar4: never strip scroll lock while notif drawer/sheet is open. */
    if (keepNotifScrollLock) {
      try {
        if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
      } catch (eKeepLock) {}
      recovering = false;
      return;
    }
    try {
      if (typeof window.__vcUnpinPageScroll === "function") window.__vcUnpinPageScroll();
    } catch (e2) {}
    try {
      var body = document.body;
      if (body) {
        body.style.removeProperty("position");
        body.style.removeProperty("top");
        body.style.removeProperty("left");
        body.style.removeProperty("right");
        body.style.removeProperty("width");
        body.style.removeProperty("overflow");
        body.style.removeProperty("inset");
        body.style.removeProperty("touch-action");
        document.documentElement.style.removeProperty("overflow");
        document.documentElement.style.removeProperty("overflow-x");
        document.documentElement.style.removeProperty("overflow-y");
        document.documentElement.style.removeProperty("height");
        document.documentElement.style.removeProperty("max-height");
        document.documentElement.style.removeProperty("touch-action");
      }
    } catch (e3) {}
    try {
      if (document.body && document.body.classList.contains("vc-users-page") && !document.body.classList.contains("vc-user-profile-route")) {
        if (typeof window.__vcEnsureCommunityPageCineLayout === "function") {
          window.__vcEnsureCommunityPageCineLayout();
        } else if (typeof window.__vcPageHeroLayout === "function") {
          window.__vcPageHeroLayout({ force: true });
        }
      }
    } catch (eCommRec) {}
    recovering = false;
  }

  function phoneHeartbeatUnlock() {
    try {
      var body = document.body;
      var root = document.documentElement;
      if (!body || !root) return;
      var blocking = false;
      try {
        if (typeof window.__vcIsBlockingLoaderVisible === "function") {
          blocking = window.__vcIsBlockingLoaderVisible();
        }
      } catch (eBlk) {}
      var lockCls = root.classList.contains("vc-loading-scroll-lock");
      var fixed = getComputedStyle(body).position === "fixed" || body.style.position === "fixed";
      var must =
        root.classList.contains("vc-mobile-nav-open") ||
        root.classList.contains("vc-dialog-open") ||
        root.classList.contains("vc-staff-manage-sheet-open") ||
        root.classList.contains("vc-staff-reso-sheet-open") ||
        root.classList.contains("vc-staff-stat-sheet-open");
      if (root.classList.contains("vc-user-leader-pending")) {
        var ulHb = document.getElementById("vc-ul-loading");
        if (ulHb && !loaderLooksDead(ulHb)) must = true;
        else root.classList.remove("vc-user-leader-pending");
      }
      if (root.classList.contains("vc-user-profile-pending")) {
        var prHb = document.getElementById("vc-user-profile-loading");
        var bpHb = document.querySelector("body > .vc-user-profile-loader");
        if ((prHb && !loaderLooksDead(prHb)) || (bpHb && !loaderLooksDead(bpHb))) must = true;
        else root.classList.remove("vc-user-profile-pending");
      }
      var dd = document.getElementById("vc-notif-dropdown");
      if (dd && (dd.open || dd.hasAttribute("open"))) must = true;
      if (must || blocking) {
        if (lockCls || fixed) {
          try {
            if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
          } catch (eSyncHb) {}
        }
        return;
      }
      if (!lockCls && !fixed) return;
      try {
        root.classList.remove("vc-loading-scroll-lock");
        root.classList.remove("vc-user-leader-pending");
        root.classList.remove("vc-user-profile-pending");
      } catch (eRm) {}
      if (typeof window.__vcUnpinPageScroll === "function") window.__vcUnpinPageScroll();
      body.style.removeProperty("position");
      body.style.removeProperty("top");
      body.style.removeProperty("left");
      body.style.removeProperty("right");
      body.style.removeProperty("width");
      body.style.removeProperty("overflow");
      body.style.removeProperty("touch-action");
      root.style.removeProperty("overflow");
      root.style.removeProperty("touch-action");
      try {
        if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
      } catch (eSync2) {}
    } catch (eHb) {}
  }

  function phoneWatchTick() {
    try {
      if (typeof window.__vcPhoneRootUnlockInject === "function") {
        window.__vcPhoneRootUnlockInject();
      }
      if (pageLooksHealthy()) {
        watchHealthyStreak += 1;
        if (watchHealthyStreak >= 5) {
          stopPhoneScrollWatch();
          return;
        }
        return;
      }
      watchHealthyStreak = 0;
      clearPhoneHasFreezeGhosts();
      recover(false);
      phoneHeartbeatUnlock();
    } catch (eW) {}
  }

  function arm() {
    try {
      window.__vcPhoneUnfreezeArmedAt = Date.now();
    } catch (eArmAt) {}
    recover(true);
    if (!isPhoneOrPwa()) {
      window.setTimeout(function () {
        recover(false);
      }, 1200);
      window.setTimeout(clearPhoneHasFreezeGhosts, 800);
      return;
    }
    window.setTimeout(function () {
      recover(true);
    }, 400);
    window.setTimeout(function () {
      recover(true);
    }, 1200);
    window.setTimeout(clearPhoneHasFreezeGhosts, 100);
    window.setTimeout(clearPhoneHasFreezeGhosts, 500);
    window.setTimeout(clearPhoneHasFreezeGhosts, 1200);
    window.setTimeout(forceHideStuckLoaders, 900);
    window.setTimeout(forceHideStuckLoaders, 2200);
    window.setTimeout(forceHideStuckLoaders, 5000);
    try {
      if (!window.__vcPhoneScrollWatch) {
        watchHealthyStreak = 0;
        window.__vcPhoneScrollWatch = window.setInterval(phoneWatchTick, PHONE_WATCH_MS);
        if (window.__vcPhoneScrollWatch.unref) window.__vcPhoneScrollWatch.unref();
        window.setTimeout(stopPhoneScrollWatch, PHONE_WATCH_MAX_MS);
      }
    } catch (eArmW) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", arm);
  } else {
    arm();
  }
  window.addEventListener("pageshow", function (ev) {
    if (isPhoneOrPwa()) {
      recover(Boolean(ev && ev.persisted));
      clearPhoneHasFreezeGhosts();
    } else if (ev && ev.persisted) {
      recover(true);
    }
  });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "visible") return;
    if (!isPhoneOrPwa()) return;
    recover(true);
    clearPhoneHasFreezeGhosts();
  });
  window.addEventListener("focus", function () {
    try {
      if (!isPhoneOrPwa()) return;
      var stand =
        (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
        Boolean(navigator.standalone);
      if (stand) {
        recover(true);
        clearPhoneHasFreezeGhosts();
      }
    } catch (eFocus) {}
  });
})();

(function () {
  function warmPublicApis() {
    if (!window.VcApiCache || typeof window.VcApiCache.prefetchIdle !== "function") return;
    var touchWarm = false;
    try {
      touchWarm =
        (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
        Number(navigator.maxTouchPoints || 0) > 0;
    } catch (eTw) {}
    /* phoneApiGlobalFix1: su telefono niente storm di warm al first paint */
    if (touchWarm) {
      window.setTimeout(function () {
        try {
          window.VcApiCache.prefetchIdle(
            window.VcApiCache.keyFor("/webhooks/site-roles", { scope: "roles", v: "roles2" }),
            "/webhooks/site-roles",
            { ttlMs: 90000, staleMs: 600000, persistMs: 20 * 60 * 1000, timeoutMs: 28000 },
          );
          window.VcApiCache.prefetchIdle("vote:anon", "/webhooks/site-vote", {
            ttlMs: 45000,
            staleMs: 300000,
            timeoutMs: 24000,
          });
        } catch (eLate) {}
      }, 12000);
      return;
    }
    window.VcApiCache.prefetchIdle(window.VcApiCache.keyFor("/webhooks/site-roles", { scope: "roles", v: "roles2" }), "/webhooks/site-roles", {
      ttlMs: 90000,
      staleMs: 600000,
      persistMs: 20 * 60 * 1000,
      timeoutMs: 15000,
    });
    window.VcApiCache.prefetchIdle("vote:anon", "/webhooks/site-vote", {
      ttlMs: 45000,
      staleMs: 300000,
      timeoutMs: 12000,
    });
    try {
      var path = String(window.location.pathname || "").replace(/\/+$/, "") || "/";
      if (path !== "/recensioni" && path !== "/reviews") {
        window.VcApiCache.prefetchIdle("reviews:server", "/webhooks/site-reviews?kind=server", {
          ttlMs: 60000,
          staleMs: 600000,
          timeoutMs: 15000,
        });
      }
      if (path !== "/user" && path.indexOf("/user/") !== 0) {
        window.VcApiCache.prefetchIdle(
          window.VcApiCache.keyFor("/webhooks/site-users?board=level&page=1&perPage=24", { scope: "users" }),
          "/webhooks/site-users?board=level&page=1&perPage=24",
          {
            ttlMs: 60000,
            staleMs: 600000,
            persistMs: 15 * 60 * 1000,
            timeoutMs: 20000,
          },
        );
      }
      var regoleCfg = window.__VC_REGOLE || {};
      var regoleUrl = String(regoleCfg.apiUrl || regoleCfg.api || "").trim();
      if (regoleUrl && regoleUrl.indexOf("{{") < 0 && path !== "/regole") {
        window.VcApiCache.prefetchIdle(window.VcApiCache.keyFor(regoleUrl, { scope: "regole" }), regoleUrl, {
          ttlMs: 10 * 60 * 1000,
          staleMs: 60 * 60 * 1000,
          persistMs: 24 * 60 * 60 * 1000,
          timeoutMs: 15000,
        });
      }
      var liveCfg = window.__VC_LIVE || {};
      var liveExtra = String(liveCfg.extraStatsPath || liveCfg.extraStatsUrl || "").trim();
      if (liveExtra && liveExtra.indexOf("{{") < 0) {
        window.VcApiCache.prefetchIdle(window.VcApiCache.keyFor(liveExtra, { scope: "live" }), liveExtra, {
          ttlMs: 45000,
          staleMs: 300000,
          timeoutMs: 12000,
        });
      }
    } catch (eP) {}
  }

  function scheduleWarm() {
    if (window.VcApiCache) {
      warmPublicApis();
      return;
    }
    window.setTimeout(scheduleWarm, 120);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleWarm, { once: true });
  } else {
    scheduleWarm();
  }
})();

