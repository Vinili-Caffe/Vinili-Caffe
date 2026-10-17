
/* 20261015consoleFixAll1: con __vcMobileNavStandalone non rifare rebuild sul
   storm vc-dashboard-access / staff-access (17s Violation + doppio lavoro) */
/* 20261015jsWakeIdle3: libri volanti NON ripartono su bustle (pointermove = wake);
   ripresa solo tap/wheel esplicito dopo settle */
/* 20261015jsWakeBurst1: libri volanti off su cpu-settle (meno riattivazioni JS) */

(function () {
  try {
    var ID = "vc-phone-root-unlock-css";
    /* loadScrollLockFs1: lock scroll su TUTTI i viewport durante boot/loader (prima solo phone) */
    /* hangKill3: overflow lock ok; MAI touch-action:none / :has / chrome-bar freeze */
    var css =
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
      "html.vc-staff-access-pending:not(.vc-staff-app-revealed) body{" +
      "overflow:hidden!important;overflow-x:hidden!important;overflow-y:hidden!important;" +
      "overscroll-behavior:none!important;height:100%!important;max-height:100dvh!important;" +
      /* siparioCssBarApi1: lock gesture duro (no pan-y → no yoyo mid-load) */
      "touch-action:none!important;pointer-events:auto!important}" +
      "html.vc-chrome-bar-loading,html.vc-chrome-bar-loading body," +
      "html.vc-interaction-hold,html.vc-interaction-hold body," +
      "html.vc-page-cine-ready.vc-interaction-hold,html.vc-page-cine-ready.vc-interaction-hold body{" +
      "overflow:hidden!important;overflow-x:hidden!important;overflow-y:hidden!important;" +
      "overscroll-behavior:none!important;touch-action:none!important;pointer-events:auto!important}" +
      "html.vc-page-cine-ready.vc-loading-scroll-lock," +
      "html.vc-page-cine-ready.vc-loading-scroll-lock body," +
      "html.vc-page-cine-ready.vc-loader-blocking-live," +
      "html.vc-page-cine-ready.vc-loader-blocking-live body," +
      "html.vc-page-cine-ready.vc-chrome-bar-loading," +
      "html.vc-page-cine-ready.vc-chrome-bar-loading body," +
      "html.vc-page-cine-ready.vc-session-verify-pending," +
      "html.vc-page-cine-ready.vc-session-verify-pending body{" +
      "overflow:hidden!important;overflow-x:hidden!important;overflow-y:hidden!important;" +
      "overscroll-behavior:none!important;" +
      "position:static!important;inset:auto!important;top:auto!important;" +
      "left:auto!important;right:auto!important;bottom:auto!important;" +
      "height:auto!important;max-height:none!important;width:100%!important;" +
      "touch-action:none!important;pointer-events:auto!important}" +
      "@media (pointer:coarse),(max-width:920px){" +
      "html.vc-page-cine-boot:not(.vc-page-cine-ready) .vc-home-cine," +
      "html.vc-loader-blocking-live .vc-home-cine," +
      "html.vc-loading-scroll-lock .vc-home-cine," +
      "html.vc-user-leader-pending .vc-home-cine{" +
      "visibility:hidden!important;opacity:0!important;pointer-events:none!important}" +
      "}" +
      "#vc-ul-loading[hidden],.vc-ul-loading[hidden],#vc-roles-loading[hidden]," +
      "#vc-shared-boot-overlay[hidden],#vc-staff-inbox-loading[hidden]," +
      "#vc-staff-inbox-loading.vc-staff-loading--hidden," +
      ".vc-staff-loading[hidden],.vc-staff-loading.vc-staff-loading--hidden{" +
      "display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important}";
    function inject() {
      var el = document.getElementById(ID);
      if (!el) {
        el = document.createElement("style");
        el.id = ID;
      }
      /* hangKill1: sempre riscrivi — niente :has / staff-loading freeze */
      el.setAttribute("data-vc", "hangKill3");
      el.textContent = css;
      var host = document.head || document.documentElement;
      if (el.parentNode !== host) host.appendChild(el);
      else host.appendChild(el);
    }
    inject();
    window.__vcPhoneRootUnlockInject = inject;
    window.__VC_PHONE_ROOT_UNLOCK_VER = "hangKill3";
    /* notifBellOpen1: thin landing ≠ notif client (non avvelenare LANDING_NOTIF load) */
    try {
      window.__VC_LANDING_BOOT = 1;
    } catch (eMark) {}
    try {
      window.setTimeout(inject, 0);
      window.setTimeout(inject, 400);
    } catch (eRe) {}
  } catch (eRootUnlock) {}
  try {
    /* breatheFast1: se perf già in head, non reiniettare */
    if (window.VcPerf && window.VcPerf.__ready) {
      if (typeof window.VcPerf.apply === "function") window.VcPerf.apply();
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
    window.addEventListener("pageshow", function () {
      window.setTimeout(fixNavGhost, 0);
    });
  } catch (e0) {}
})();
(function () {
  try {
    if (!window.VcApiCache) {
      var s = document.createElement("script");
      s.src = "/js/vc-api-cache.js?v=20261002violPass5";
      (document.head || document.documentElement).appendChild(s);
    }
  } catch (eApiBoot) {}
})();
(function () {
  try {
    /* breatheFast1: vc-perf già in head HTML — niente secondo download */
    if (window.VcPerf && typeof window.VcPerf.apply === "function") {
      window.VcPerf.apply();
    }
  } catch (ePerfBoot) {}
})();

(function () {
  /* pwaResumeWin1 + pwaResumeAll1: resume path delega a vc-pwa-resume-boot */
  var RESUME_KEY = "vc-pwa-resume";
  var WANT_HOME_KEY = "vc-pwa-want-home";

  function isStandalonePwa() {
    try {
      if (window.VcPwaResume && typeof window.VcPwaResume.isPwa === "function" && window.VcPwaResume.isPwa()) {
        return true;
      }
    } catch (eV) {}
    try {
      if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true;
    } catch (e0) {}
    try {
      if (window.matchMedia && window.matchMedia("(display-mode: fullscreen)").matches) return true;
    } catch (e1) {}
    try {
      if (window.matchMedia && window.matchMedia("(display-mode: minimal-ui)").matches) return true;
    } catch (e2) {}
    try {
      if (window.matchMedia && window.matchMedia("(display-mode: window-controls-overlay)").matches) return true;
    } catch (e3) {}
    return Boolean(navigator.standalone);
  }

  function currentPath() {
    try {
      if (window.VcPwaResume && typeof window.VcPwaResume.path === "function") {
        return window.VcPwaResume.path();
      }
      var p = String(window.location.pathname || "/").replace(/\/index\.html$/i, "") || "/";
      if (p !== "/" && p.charAt(p.length - 1) !== "/") p += "/";
      if (p === "//") p = "/";
      return p;
    } catch (e) {
      return "/";
    }
  }

  function safeResumePath(path) {
    try {
      if (window.VcPwaResume && typeof window.VcPwaResume.safe === "function") {
        return window.VcPwaResume.safe(path);
      }
    } catch (eV) {}
    var p = String(path || "");
    if (!p || p.charAt(0) !== "/" || p.indexOf("\\") !== -1) return "";
    if (/^\/\//.test(p) || p.indexOf("://") !== -1) return "";
    if (p.length > 240) return "";
    return p;
  }

  function saveResume(path) {
    try {
      if (window.VcPwaResume && typeof window.VcPwaResume.save === "function") {
        window.VcPwaResume.save(path);
        return;
      }
    } catch (eS) {}
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

  function isBackHomeLabel(a) {
    if (!a) return false;
    try {
      var t = String(a.textContent || "")
        .replace(/\s+/g, " ")
        .trim();
      if (/torna alla home|back to home/i.test(t)) return true;
      if (a.querySelector && a.querySelector('[data-i18n="dash.backHome"], [data-i18n="sf.backHome"]')) {
        return true;
      }
    } catch (e) {}
    return false;
  }

  function isMisroutedHomeHref(href) {
    try {
      var u = new URL(String(href || ""), window.location.href);
      if (!isSiteHost(u.hostname) && String(href || "").charAt(0) !== "/") return false;
      var p = String(u.pathname || "/").replace(/\/+$/, "") || "/";
      return p === "/user" || isBrokenHomePath(p);
    } catch (e) {
      return false;
    }
  }

  function shouldForceHomeNav(a, href) {
    if (!a) return false;
    if (isBrandHomeAnchor(a) || isHomeHref(href)) return true;
    /* homeResumeGuard1: "Torna alla Home" che punta a /user/ (o path rotti) → forza / */
    return isBackHomeLabel(a) && isMisroutedHomeHref(href || a.getAttribute("href") || "");
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
      'header .vc-header-bar > div:first-child a.vc-header-site-name, header .vc-header-bar > div:first-child a.vc-header-logo-link + a[href], .vc-mobile-nav-drawer__brand a.vc-header-logo-link + a[href], .vc-mobile-nav-drawer__brand a.vc-header-site-name, header .vc-header-bar > div:first-child a[aria-label="Vai alla homepage"], .vc-premium-footer__logo-row, a[data-i18n="footer.home"], a.vc-auth-required-secondary[href], a[data-i18n="dash.backHome"], a[data-i18n="sf.backHome"]'
    );
    for (var i = 0; i < nodes.length; i++) {
      var a = nodes[i];
      try {
        var href = a.getAttribute("href") || "";
        if (!href || href.charAt(0) === "#") continue;
        var u = new URL(href, window.location.href);
        if (!isSiteHost(u.hostname) && href.charAt(0) !== "/") continue;
        var p = String(u.pathname || "/").replace(/\/+$/, "") || "/";
        if (isBrokenHomePath(p) || p === "/" || isBrandHomeAnchor(a) || (isBackHomeLabel(a) && (p === "/" || p === "/user"))) {
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

  /* navFastReveal1: prefetch al tocco/click prima della navigazione */
  var navPrefetchSeen = typeof WeakSet === "function" ? new WeakSet() : null;
  var navPrefetchPaths = typeof Set === "function" ? new Set() : null;

  function prefetchNavHref(href) {
    try {
      var raw = String(href || "").trim();
      if (!raw || raw.indexOf("#") === 0) return;
      var u = new URL(raw, window.location.origin);
      if (u.origin !== window.location.origin) return;
      var path = u.pathname || "/";
      if (!path.endsWith("/") && !/\.[a-z0-9]{1,5}$/i.test(path)) path += "/";
      if (path === window.location.pathname || path === (window.location.pathname.replace(/\/+$/, "") + "/")) return;
      if (navPrefetchPaths) {
        if (navPrefetchPaths.has(path)) return;
        navPrefetchPaths.add(path);
      }
      var key = 'link[data-vc-prefetch-nav="' + path + '"]';
      if (document.querySelector(key)) return;
      var l = document.createElement("link");
      l.rel = "prefetch";
      l.as = "document";
      l.href = path;
      l.setAttribute("data-vc-prefetch-nav", path);
      (document.head || document.documentElement).appendChild(l);
    } catch (eNavPf) {}
  }

  function wireNavPrefetch() {
    if (wireNavPrefetch._wired) return;
    wireNavPrefetch._wired = true;
    function maybePrefetchFromEvent(ev) {
      /* pwaCpuNuke2: niente prefetch a ogni pointerdown in PWA (spike CPU/rete) */
      try {
        if (
          window.__VC_PWA_CPU_NUKE ||
          document.documentElement.classList.contains("vc-pwa-cpu-nuke")
        ) {
          return;
        }
      } catch (eNukePf) {}
      var a = ev.target && ev.target.closest ? ev.target.closest("a[href]") : null;
      if (!a) return;
      if (a.hasAttribute("download")) return;
      var target = String(a.getAttribute("target") || "").toLowerCase();
      if (target === "_blank") return;
      /* perfRoiPack1: prefetch solo nav primaria */
      try {
        if (
          !a.closest(".vc-header-snav") &&
          !a.closest("#vc-mobile-nav-drawer") &&
          !a.closest("footer.vc-site-footer") &&
          !a.closest(".vc-premium-footer")
        ) return;
      } catch (eNavZone) {}
      prefetchNavHref(a.getAttribute("href") || "");
    }
    document.addEventListener(
      "pointerenter",
      function (ev) {
        try {
          if (window.matchMedia && !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
        } catch (eMq) {
          return;
        }
        maybePrefetchFromEvent(ev);
      },
      true
    );
    /* navFastReveal1: prefetch al tocco/click prima della navigazione */
    document.addEventListener("pointerdown", maybePrefetchFromEvent, true);
    document.addEventListener("touchstart", maybePrefetchFromEvent, { capture: true, passive: true });
  }

  try {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", repairBrokenHomeLinks);
    } else {
      repairBrokenHomeLinks();
    }
    window.addEventListener("pageshow", function () {
      window.setTimeout(repairBrokenHomeLinks, 0);
    });
    document.addEventListener(
      "pointerdown",
      function (ev) {
        var a = ev.target && ev.target.closest ? ev.target.closest("a[href]") : null;
        if (!a) return;
        if (shouldForceHomeNav(a, a.getAttribute("href") || "")) {
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
        if (shouldForceHomeNav(a, a.getAttribute("href") || "")) {
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
    /* pushOpenDestFix1: se url è home ma c’è ticketId → deep link ticket */
    var url = String((data && data.url) || "").trim();
    var tid = String((data && data.ticketId) || "").trim();
    var pathOnly = "";
    try {
      if (url) {
        var probe = new URL(url, window.location.origin);
        pathOnly = String(probe.pathname || "/").replace(/\/+$/, "") || "/";
      }
    } catch (eProbe) {}
    if (/^[a-f0-9]{24}$/i.test(tid) && (!url || pathOnly === "/")) {
      var staff = /[?&]view=staff\b/i.test(url);
      url =
        "/tickets/" +
        (staff ? "?view=staff&" : "?") +
        "ticketId=" +
        encodeURIComponent(tid) +
        "#" +
        tid;
    }
    if (!url) return "";
    try {
      var u = new URL(url, window.location.origin);
      var host = String(u.hostname || "").toLowerCase();
      var hereHost = String(window.location.hostname || "").toLowerCase();
      var sameVinili =
        u.origin === window.location.origin ||
        (/^(?:www\.)?viniliecaffe\.(?:it|gg)$/.test(host) &&
          /^(?:www\.)?viniliecaffe\.(?:it|gg)$/.test(hereHost));
      if (!sameVinili) return "";
      return u.pathname + u.search + u.hash;
    } catch (e) {
      return "";
    }
  }

  function readPendingNavPath() {
    /* pushOpenCold1: anche PWA — una read boot (no poll). Serve se start_url vince su openWindow. */
    /* pushOpenCold2: retry brevi — Android scrive pending DOPO il boot di start_url */
    if (!("caches" in window)) return Promise.resolve("");
    var delays = [0, 150, 400, 900, 1600];
    function once() {
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
    function step(i) {
      return once().then(function (path) {
        if (path) return path;
        if (i + 1 >= delays.length) return "";
        return new Promise(function (resolve) {
          window.setTimeout(function () {
            resolve(step(i + 1));
          }, delays[i + 1]);
        });
      });
    }
    return step(0);
  }

  function isPwaColdStartHome() {
    /* pwaResumeWin1 / pwaAppQueryHide1 / pwaAppLoopKill1: ?app= (o flag dopo strip) OPPURE home PWA */
    try {
      if (window.__vcPwaColdApp) return true;
      var coldAt = Number(sessionStorage.getItem("vc-pwa-cold-app") || "0") || 0;
      if (coldAt > 0 && Date.now() - coldAt < 20000) return true;
    } catch (eCold) {}
    try {
      if (/[?&]app=/.test(String(window.location.search || ""))) return true;
    } catch (e) {}
    try {
      var nav = performance.getEntriesByType && performance.getEntriesByType("navigation");
      if (nav && nav[0] && nav[0].type === "reload") return false;
    } catch (eN) {}
    try {
      if (document.referrer) {
        var ref = new URL(document.referrer);
        if (isSiteHost(ref.hostname)) return false;
      }
    } catch (eR) {}
    return isStandalonePwa();
  }

  function maybeRestoreFromHome() {
    if (!isStandalonePwa()) return false;
    var here = currentPath();
    if (here !== "/") return false;
    try {
      var search = String(window.location.search || "");
      if (/[?&]code=/.test(search) || /[?&]state=/.test(search)) return false;
    } catch (eQ) {}
    /* navNoYankTyped1: link/omnibox → launchQueue batte resume (senza = resti sulla vecchia pagina) */
    try {
      var launchRaw = sessionStorage.getItem("vc-pwa-launch-pending");
      if (launchRaw) {
        var launchData = JSON.parse(launchRaw);
        var launchPath = String((launchData && launchData.p) || "");
        var launchAt = Number((launchData && launchData.t) || 0);
        if (launchPath && (!launchAt || Date.now() - launchAt < 120000)) {
          /* pwaAppLoopKill1: normalizza via safe (strippa ?app=) */
          launchPath = safeResumePath(launchPath) || launchPath;
          try {
            var lu = new URL(launchPath, window.location.origin);
            lu.searchParams.delete("app");
            launchPath = lu.pathname + (lu.search || "") + (lu.hash || "");
          } catch (eLu) {}
          var launchNorm = String(launchPath).replace(/\/+$/, "") || "/";
          var launchPathOnly = launchNorm.split("?")[0].split("#")[0] || "/";
          if (launchPathOnly !== "/") {
            sessionStorage.removeItem("vc-pwa-launch-pending");
            try {
              document.documentElement.style.background = "#100c09";
              if (document.body) document.body.style.background = "#100c09";
            } catch (ePaintL) {}
            window.location.replace(launchPath);
            return true;
          }
          sessionStorage.removeItem("vc-pwa-launch-pending");
        }
      }
    } catch (eLaunchPref) {}
    if (consumeWantHome()) {
      try {
        if (window.VcPwaResume && typeof window.VcPwaResume.save === "function") {
          window.VcPwaResume.save("/", { allowHome: true, force: true });
        } else {
          localStorage.setItem(RESUME_KEY, JSON.stringify({ p: "/", t: Date.now() }));
        }
      } catch (eWh) {}
      return false;
    }
    /*
     * homeResumeGuard1 + pwaResumeWin1:
     * cold-start icona (?app= o home PWA senza referrer).
     * NON azzerare vc-pwa-resume se non è cold-start (bug Windows → sempre homepage).
     */
    if (!isPwaColdStartHome()) {
      return false;
    }
    try {
      var data = JSON.parse(localStorage.getItem(RESUME_KEY) || "null");
      var path = safeResumePath(data && data.p);
      var at = Number(data && data.t) || 0;
      /* pwaResumeForever1: niente TTL — ripristina anche dopo giorni */
      var ttlMs = 0;
      try {
        if (window.VcPwaResume && Number(window.VcPwaResume.ttlMs) > 0) {
          ttlMs = Number(window.VcPwaResume.ttlMs);
        }
      } catch (eTtl) {}
      if (!path || path === "/") return false;
      if (ttlMs > 0 && at && Date.now() - at > ttlMs) return false;
      try {
        var pu = new URL(path, window.location.origin);
        var norm = String(pu.pathname || "/").replace(/\/+$/, "") || "/";
        if (norm === "/vote" || norm === "/faq") return false;
        path = pu.pathname + pu.search + pu.hash;
      } catch (ePu) {
        return false;
      }
      var hereFull = "";
      try {
        hereFull = window.location.pathname + window.location.search + window.location.hash;
      } catch (eH) {
        hereFull = here;
      }
      if (path === hereFull || path === here) return false;
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
      function goPending() {
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
        if (!maybeRestoreFromHome()) saveResume(currentPath());
      }
      if (pendingPath) {
        if (!("caches" in window)) {
          goPending();
          return;
        }
        return caches
          .open(PENDING_NAV_CACHE)
          .then(function (cache) {
            return cache.delete(PENDING_NAV_URL);
          })
          .catch(function () {})
          .then(goPending);
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
      if (shouldForceHomeNav(a, href)) {
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
  var CONSENT_KEY = "vc_cookie_consent";
  var CONSENT_COOKIE = "vc_cookie_consent";
  var CONSENT_KEY_LEGACY = "vc_cookie_banner_ack_v3";
  var CONSENT_PENDING_KEY = "vc_cookie_consent_pending";
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
      return (
        path === "/cookie" ||
        path === "/privacy" ||
        path === "/terms" ||
        path === "/dati"
      );
    } catch (e) {
      return false;
    }
  }

  function readStoredChoice(store, key) {
    try {
      if (!store) return "";
      var v = String(store.getItem(key) || "").trim();
      if (v === "accepted" || v === "rejected") return v;
    } catch (e) {}
    return "";
  }

  function readCookieConsentChoice() {
    var choice =
      readStoredChoice(window.localStorage, CONSENT_KEY) ||
      readStoredChoice(window.sessionStorage, CONSENT_KEY) ||
      readStoredChoice(window.localStorage, CONSENT_KEY_LEGACY) ||
      readStoredChoice(window.sessionStorage, CONSENT_KEY_LEGACY);
    if (choice) return choice;
    try {
      var raw = String(document.cookie || "");
      if (new RegExp("(?:^|; )" + CONSENT_COOKIE + "=accepted(?:;|$)").test(raw)) return "accepted";
      if (new RegExp("(?:^|; )" + CONSENT_COOKIE + "=rejected(?:;|$)").test(raw)) return "rejected";
      if (new RegExp("(?:^|; )" + CONSENT_KEY_LEGACY + "=accepted(?:;|$)").test(raw)) return "accepted";
      if (new RegExp("(?:^|; )" + CONSENT_KEY_LEGACY + "=rejected(?:;|$)").test(raw)) return "rejected";
    } catch (e2) {}
    return "";
  }

  function hasCookieConsent() {
    return readCookieConsentChoice() === "accepted";
  }

  function hasCookieChoice() {
    var c = readCookieConsentChoice();
    return c === "accepted" || c === "rejected";
  }

  function hasDiscordLoginForCookies() {
    try {
      if (window.VcLoginRequired && typeof window.VcLoginRequired.hasToken === "function") {
        if (window.VcLoginRequired.hasToken()) return true;
      }
    } catch (e0) {}
    try {
      if (typeof window.__vcDiscordGetAccessToken === "function") {
        if (window.__vcDiscordGetAccessToken()) return true;
      }
    } catch (e1) {}
    try {
      var tok = localStorage.getItem(DISCORD_ACCESS_TOKEN_KEY);
      var exp = Number(localStorage.getItem(DISCORD_EXPIRES_AT_KEY) || "0");
      return Boolean(tok && (!exp || Date.now() < exp));
    } catch (e2) {
      return false;
    }
  }

  function rememberPendingCookieChoice(choice) {
    var value = choice === "rejected" ? "rejected" : "accepted";
    try {
      if (window.sessionStorage) window.sessionStorage.setItem(CONSENT_PENDING_KEY, value);
    } catch (e) {}
  }

  function clearPendingCookieChoice() {
    try {
      if (window.sessionStorage) window.sessionStorage.removeItem(CONSENT_PENDING_KEY);
    } catch (e) {}
  }

  function readPendingCookieChoice() {
    try {
      var v = String((window.sessionStorage && window.sessionStorage.getItem(CONSENT_PENDING_KEY)) || "").trim();
      if (v === "accepted" || v === "rejected") return v;
    } catch (e) {}
    return "";
  }

  function getDiscordAccessTokenForCookies() {
    try {
      if (typeof window.__vcDiscordGetAccessToken === "function") {
        var t = window.__vcDiscordGetAccessToken();
        if (t) return String(t);
      }
    } catch (e0) {}
    try {
      var tok = localStorage.getItem(DISCORD_ACCESS_TOKEN_KEY);
      var exp = Number(localStorage.getItem(DISCORD_EXPIRES_AT_KEY) || "0");
      if (tok && (!exp || Date.now() < exp)) return String(tok);
    } catch (e1) {}
    return "";
  }

  function showCookieRejectDenied(tCookie) {
    var title = tCookie("cookie.rejectDeniedTitle", "Rifiuto non disponibile");
    var body = tCookie(
      "cookie.rejectDeniedBody",
      "Per scegliere «Solo essenziali» serve VIP (o VIP+) oppure Double Booster."
    );
    try {
      if (window.VcSiteToast && typeof window.VcSiteToast.show === "function") {
        window.VcSiteToast.show(body, true);
        return;
      }
    } catch (eT) {}
    try {
      if (window.VcLoginRequired && typeof window.VcLoginRequired.open === "function") {
        window.VcLoginRequired.open({ title: title, body: body, sub: "" });
        return;
      }
    } catch (eM) {}
    try {
      window.alert(body);
    } catch (eA) {}
  }

  function fetchCookieRejectEligibility() {
    var token = getDiscordAccessTokenForCookies();
    if (!token) return Promise.resolve({ ok: false, canReject: false, missingToken: true });
    var url = "/webhooks/site-cookie-consent";
    try {
      if (window.__VC_COOKIE_CONSENT_API) url = String(window.__VC_COOKIE_CONSENT_API);
    } catch (eU) {}
    return fetch(url, {
      method: "GET",
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/json",
      },
      credentials: "same-origin",
      cache: "no-store",
    })
      .then(function (r) {
        return r.json().then(function (j) {
          return { http: r.status, ...(j && typeof j === "object" ? j : {}) };
        });
      })
      .catch(function () {
        return { ok: false, canReject: false, error: "network" };
      });
  }

  function requireDiscordLoginForCookies(tCookie, choice) {
    if (hasDiscordLoginForCookies()) return true;
    rememberPendingCookieChoice(choice);
    var opts = {
      title: tCookie("cookie.loginTitle", "Login richiesto"),
      body: tCookie(
        "cookie.loginBody",
        "Accedi con Discord per accettare o rifiutare i cookie."
      ),
    };
    try {
      if (window.VcLoginRequired && typeof window.VcLoginRequired.require === "function") {
        return window.VcLoginRequired.require(opts);
      }
    } catch (eReq) {}
    try {
      if (typeof window.__vcDiscordStartOAuthRedirect === "function") {
        window.__vcDiscordStartOAuthRedirect();
        return false;
      }
    } catch (eO) {}
    try {
      var hdr = document.getElementById("discord-login-btn");
      if (hdr) hdr.click();
    } catch (eH) {}
    return false;
  }

  function finalizeCookieChoice(choice) {
    clearPendingCookieChoice();
    rememberCookieConsent(choice);
    try {
      window.dispatchEvent(
        new CustomEvent(choice === "accepted" ? "vc:cookie-accepted" : "vc:cookie-rejected")
      );
    } catch (eEv) {}
    var banner = document.getElementById("vc-necessity-banner");
    if (banner) closeCookieBanner(banner);
    /* hogwartsSiteDead1: niente BGM/YouTube Hogwarts post-cookie */
  }

  function applyPendingCookieChoiceAfterLogin(tCookieFn) {
    if (!hasDiscordLoginForCookies()) return Promise.resolve(false);
    if (hasCookieChoice()) {
      clearPendingCookieChoice();
      return Promise.resolve(false);
    }
    var pending = readPendingCookieChoice();
    if (!pending) return Promise.resolve(false);
    function tCookie(key, fallback) {
      if (typeof tCookieFn === "function") return tCookieFn(key, fallback);
      try {
        if (window.VcI18n && typeof window.VcI18n.t === "function") {
          var v = window.VcI18n.t(key);
          if (v && v !== key) return v;
        }
      } catch (eT) {}
      return fallback;
    }
    if (pending !== "rejected") {
      finalizeCookieChoice(pending);
      return Promise.resolve(true);
    }
    return fetchCookieRejectEligibility().then(function (elig) {
      if (elig && elig.canReject) {
        finalizeCookieChoice("rejected");
        return true;
      }
      clearPendingCookieChoice();
      showCookieRejectDenied(tCookie);
      return false;
    });
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

  function applyAnalyticsConsent(granted) {
    try {
      if (typeof window.gtag === "function") {
        window.gtag("consent", "update", {
          analytics_storage: granted ? "granted" : "denied",
          /* boardsAdsense1 */
          ad_storage: granted ? "granted" : "denied",
          ad_user_data: granted ? "granted" : "denied",
          ad_personalization: granted ? "granted" : "denied",
        });
      }
    } catch (eG) {}
  }

  function rememberCookieConsent(choice) {
    var value = choice === "rejected" ? "rejected" : "accepted";
    try {
      if (window.localStorage) window.localStorage.setItem(CONSENT_KEY, value);
    } catch (e) {}
    try {
      if (window.sessionStorage) window.sessionStorage.setItem(CONSENT_KEY, value);
    } catch (e2) {}
    try {
      var maxAge = 60 * 60 * 24 * 180;
      var secure = String(window.location.protocol || "").toLowerCase() === "https:" ? "; Secure" : "";
      var domain = cookieDomainSuffixForConsent();
      document.cookie =
        CONSENT_COOKIE + "=" + value + "; Max-Age=" + maxAge + "; Path=/; SameSite=Lax" + secure + domain;
    } catch (e3) {}
    applyAnalyticsConsent(value === "accepted");
  }

  function closeCookieBanner(root) {
    if (!root) return;
    root.classList.add("vc-necessity-banner--leaving");
    window.setTimeout(function () {
      if (root && root.parentNode) root.parentNode.removeChild(root);
    }, 220);
  }

  function sanitizeLegalHref(raw) {
    var value = String(raw || "").trim();
    if (!value) return "";
    if (/^javascript:/i.test(value)) return "";
    if (value.startsWith("/")) return value;
    if (/^https?:\/\//i.test(value)) return value;
    return "";
  }

  function initCookieConsent() {
    if (isLegalCookiePage()) return;
    function tCookie(key, fallback) {
      try {
        if (window.VcI18n && typeof window.VcI18n.t === "function") {
          var v = window.VcI18n.t(key);
          if (v && v !== key) return v;
        }
      } catch (eT) {}
      return fallback;
    }
    applyPendingCookieChoiceAfterLogin(tCookie).then(function (applied) {
      if (applied) return;
      if (hasCookieChoice()) {
        applyAnalyticsConsent(hasCookieConsent());
        return;
      }
      if (document.getElementById("vc-necessity-banner")) return;
      if (document.getElementById("cookieyes")) return;
      if (!document.documentElement) return;
      var cookiePolicyUrl = "/cookie/";
      try {
        var fromWindow = sanitizeLegalHref(window.__VC_COOKIE_POLICY_URL);
        if (fromWindow) cookiePolicyUrl = fromWindow;
        else {
          var link = document.querySelector('a[href*="/cookie"], a[href*="cookie-policy"], a[href*="cookie"]');
          var fromDom = sanitizeLegalHref(link && link.getAttribute("href"));
          if (fromDom) cookiePolicyUrl = fromDom;
        }
      } catch (e1) {}

      var root = document.createElement("section");
      root.id = "vc-necessity-banner";
      root.className = "vc-necessity-banner";
      root.setAttribute("aria-label", tCookie("cookie.bannerAria", "Avviso utilizzo cookie"));
      root.setAttribute("data-i18n-attr", "aria-label:cookie.bannerAria");
      root.innerHTML =
        '<div class="vc-necessity-banner__pill" role="dialog" aria-modal="false" aria-labelledby="vc-necessity-text">' +
        '<p id="vc-necessity-text" class="vc-necessity-banner__text">' +
        '<span data-i18n="cookie.bannerBefore">' +
        tCookie("cookie.bannerBefore", "Usa ") +
        "</span>" +
        '<a class="vc-necessity-banner__policy" href="' +
        cookiePolicyUrl +
        '" data-i18n="cookie.essentials">' +
        tCookie("cookie.essentials", "cookie essenziali") +
        "</a>" +
        '<span data-i18n="cookie.bannerMid">' +
        tCookie("cookie.bannerMid", " e Analytics. ") +
        "</span>" +
        '<a class="vc-necessity-banner__policy" href="' +
        cookiePolicyUrl +
        '" data-i18n="cookie.policyLink">' +
        tCookie("cookie.policyLink", "Cookie Policy") +
        "</a>" +
        '<span data-i18n="cookie.bannerAfter">' +
        tCookie("cookie.bannerAfter", ".") +
        "</span>" +
        "</p>" +
        '<p class="vc-necessity-banner__login-hint" data-i18n="cookie.loginHint">' +
        tCookie(
          "cookie.loginHint",
          "Per accettare serve il login Discord. Per rifiutare: VIP o Double Booster."
        ) +
        "</p>" +
        '<div class="vc-necessity-banner__actions">' +
        '<button type="button" class="vc-necessity-banner__reject" data-vc-necessity-reject data-i18n="cookie.reject">' +
        tCookie("cookie.reject", "Solo essenziali") +
        "</button>" +
        '<button type="button" class="vc-necessity-banner__accept" data-vc-necessity-confirm data-i18n="cookie.accept">' +
        tCookie("cookie.accept", "Accetta") +
        "</button>" +
        "</div>" +
        "</div>";

      function dismissFromUserAction(ev, choice) {
        if (ev) {
          ev.preventDefault();
          ev.stopPropagation();
        }
        if (!requireDiscordLoginForCookies(tCookie, choice)) return;
        if (choice !== "rejected") {
          finalizeCookieChoice(choice);
          return;
        }
        rememberPendingCookieChoice("rejected");
        var rejectBtn = root.querySelector(".vc-necessity-banner__reject");
        if (rejectBtn) rejectBtn.disabled = true;
        fetchCookieRejectEligibility().then(function (elig) {
          if (rejectBtn) rejectBtn.disabled = false;
          if (elig && elig.canReject) {
            finalizeCookieChoice("rejected");
            return;
          }
          clearPendingCookieChoice();
          showCookieRejectDenied(tCookie);
        });
      }
      var acceptEl = root.querySelector(".vc-necessity-banner__accept");
      var rejectEl = root.querySelector(".vc-necessity-banner__reject");
      if (acceptEl) {
        acceptEl.addEventListener("click", function (ev) {
          dismissFromUserAction(ev, "accepted");
        });
      }
      if (rejectEl) {
        rejectEl.addEventListener("click", function (ev) {
          dismissFromUserAction(ev, "rejected");
        });
      }

      (document.documentElement || document.body).appendChild(root);
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () {
          if (!root.parentNode) return;
          root.classList.add("vc-necessity-banner--visible");
        });
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCookieConsent);
  } else {
    initCookieConsent();
  }
  document.addEventListener("vc:i18n-ready", function () {
    if (document.getElementById("vc-necessity-banner")) return;
    initCookieConsent();
  });
  window.addEventListener("pageshow", function () {
    applyPendingCookieChoiceAfterLogin().then(function (applied) {
      if (applied) return;
      if (hasCookieChoice()) {
        applyAnalyticsConsent(hasCookieConsent());
        return;
      }
      if (document.getElementById("vc-necessity-banner")) return;
      initCookieConsent();
    });
  });
  window.addEventListener("vc-discord-profile", function () {
    applyPendingCookieChoiceAfterLogin();
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
      '<p class="vc-page-transition-text">Caricamento…</p>' +
      '<p class="vc-page-transition-sub">Un momento…</p>' +
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
    if (text) text.textContent = "Caricamento…";
    if (sub) {
      sub.textContent = "Un momento…";
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
    try {
      if (typeof window.__vcMarkHeaderSnavCurrent === "function") {
        window.__vcMarkHeaderSnavCurrent();
        return;
      }
    } catch (eDel) {}
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

    function sameSiteHost(hostname) {
      try {
        var a = String(window.location.hostname || "")
          .replace(/^www\./i, "")
          .toLowerCase();
        var b = String(hostname || "")
          .replace(/^www\./i, "")
          .toLowerCase();
        return Boolean(a && b && a === b);
      } catch (eH) {
        return false;
      }
    }
    function pathFromHref(href) {
      var raw = String(href || "").trim();
      if (!raw || raw.charAt(0) === "#") return "";
      try {
        var u = new URL(raw, window.location.href);
        if (!sameSiteHost(u.hostname)) return "";
        return normalizePathname(u.pathname);
      } catch (e) {
        return "";
      }
    }
    function scorePath(hrefPath) {
      if (!hrefPath) return -1;
      if (hrefPath === "/") return cur === "/" ? 10000 : -1;
      if (cur === hrefPath) return 1000 + hrefPath.length;
      if (cur.indexOf(hrefPath + "/") === 0) return 500 + hrefPath.length;
      return -1;
    }

    var bestItem = null;
    var bestItemScore = -1;
    allItems.forEach(function (a) {
      var p = pathFromHref(a.getAttribute("href"));
      if (!p) return;
      if (isUserProfileDetail && (p === "/user" || p === "/users")) return;
      var score = scorePath(p);
      if (score > bestItemScore) {
        bestItemScore = score;
        bestItem = a;
      }
    });
    if (bestItem) {
      bestItem.classList.add("vc-snav-item--active");
      bestItem.setAttribute("aria-current", "page");
    }

    var bestRow = null;
    var bestRowScore = -1;
    allRows.forEach(function (a) {
      var p = pathFromHref(a.getAttribute("href"));
      if (!p) return;
      if (isUserProfileDetail && (p === "/user" || p === "/users")) return;
      var score = scorePath(p);
      if (score > bestRowScore) {
        bestRowScore = score;
        bestRow = a;
      }
    });
    if (bestRow) {
      bestRow.classList.add("vc-snav-row--active");
      bestRow.setAttribute("aria-current", "page");
      try {
        var det = bestRow.closest("details.vc-snav-details");
        /* feedbackLayout1: /feedback non dipingere Richieste come tab attiva
           (sembra “staff/richieste”); resta solo la row --active. */
        var rowPath = pathFromHref(bestRow.getAttribute("href"));
        var skipParentCurrent =
          rowPath === "/feedback" ||
          rowPath === "/suggerimenti" ||
          rowPath === "/tickets" ||
          rowPath === "/recensioni";
        if (det && !skipParentCurrent) det.classList.add("vc-snav-details--current");
      } catch (eDet) {}
    }
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
    /* snavExclusive2: binding vive in discord-auth (tutte le pagine); landing non ridoppia */
    if (
      window.__VC_SNAV_EXCLUSIVE === "20260914snavExclusive2" ||
      bar.getAttribute("data-vc-snav-accordion") === "20260914snavExclusive2"
    ) {
      ensureTicketsInRichiesteNav();
      linkifyTicketMentions(document);
      document.addEventListener("vc:langchange", function () {
        dedupeTicketsInRichiesteNav();
        linkifyTicketMentions(document);
        try {
          if (typeof window.__vcMobileNavRebuild === "function") window.__vcMobileNavRebuild();
        } catch (eNavLang) {}
        try {
          if (window.VcI18n && typeof window.VcI18n.apply === "function") {
            window.VcI18n.apply(document);
          }
        } catch (eI18n) {}
      });
      markSnavDetailsCurrentFromLocation();
      return;
    }
    if (bar.getAttribute("data-vc-snav-accordion") === "20260914snavExclusive1") return;
    bar.setAttribute("data-vc-snav-accordion", "20260914snavExclusive1");
    var HEADER_MENU_SYNC_KEY = "vc_header_menu_sync_v1";
    var localWindowId = String(Date.now()) + "-" + String(Math.random()).slice(2);
    function getSnavDetails() {
      return document.querySelectorAll(
        "header details.vc-snav-details, .vc-header-bar details.vc-snav-details, nav.vc-header-snav details.vc-snav-details",
      );
    }
    function closeOtherSnavDetails(except) {
      getSnavDetails().forEach(function (other) {
        if (other !== except) other.open = false;
      });
    }
    var notif = bar.querySelector("details.vc-notif-dropdown") || document.getElementById("vc-notif-dropdown");
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
      var liveNotif = document.getElementById("vc-notif-dropdown") || notif;
      var notifOpen = Boolean(liveNotif && liveNotif.open);
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
    /* snavExclusive1: chiudi gli altri PRIMA del toggle nativo */
    bar.addEventListener(
      "pointerdown",
      function (ev) {
        var sum = ev.target && ev.target.closest ? ev.target.closest("summary.vc-snav-summary") : null;
        if (!sum || !bar.contains(sum)) return;
        var det = sum.closest("details.vc-snav-details");
        if (!det) return;
        closeOtherSnavDetails(det);
        closeNotifFromHeaderMenus(true);
        closeLangMenu();
        setAccountMenuOpen(false);
      },
      true,
    );
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
          closeNotifFromHeaderMenus(true);
          closeLangMenu();
          setAccountMenuOpen(false);
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
      closeNotifFromHeaderMenus(true);
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
      closeNotifFromHeaderMenus(true);
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
      var sum = openEl.querySelector(":scope > summary, summary");
      if (sum && ((t && sum.contains(t)) || pointInside(sum, ev))) return true;
      var panel = openEl.querySelector(".vc-snav-panel, .vc-notif-panel");
      if (panel && ((t && panel.contains(t)) || pointInside(panel, ev))) return true;
      return false;
    }
    function closeNotifFromHeaderMenus(force) {
      /* notifSheetStayOpen1: mai open=false grezzo (rompe portalGuard → loop close/reclaim) */
      var liveNotif = document.getElementById("vc-notif-dropdown") || notif;
      if (!liveNotif || !liveNotif.open) return;
      if (!force) {
        try {
          if (Date.now() < Number(window.__vcNotifOpenGraceUntil || 0)) return;
          if (Date.now() < Number(window.__vcNotifPortalGuardUntil || 0)) return;
          var rootN = document.documentElement;
          if (
            rootN &&
            (rootN.classList.contains("vc-notif-sheet-open") ||
              rootN.classList.contains("vc-notif-drawer-open"))
          ) {
            return;
          }
        } catch (eSkip) {
          return;
        }
      }
      try {
        if (window.VcNotifChrome && typeof window.VcNotifChrome.close === "function") {
          window.VcNotifChrome.close(liveNotif);
          return;
        }
      } catch (eChrome) {}
      try {
        liveNotif.open = false;
        liveNotif.removeAttribute("open");
      } catch (eClose) {}
    }
    function closeAllHeaderDropdowns(opts) {
      opts = opts || {};
      getSnavDetails().forEach(function (d) {
        d.open = false;
      });
      closeNotifFromHeaderMenus(opts.force === true);
      closeLangMenu();
      setAccountMenuOpen(false);
      syncHeaderDropdownOpenClasses();
    }
    document.addEventListener(
      "pointerdown",
      function (ev) {
        if (typeof ev.button === "number" && ev.button !== 0) return;
        var t = ev.target;
        if (!t || !t.closest) return;
        try {
          if (
            t.closest(
              "#vc-notif-dropdown, .vc-notif-dropdown, .vc-notif-mobile-backdrop, .vc-notif-panel, summary.vc-notif-summary, .vc-notif-summary",
            )
          ) {
            return;
          }
        } catch (eInNotif) {}
        var opens = Array.prototype.slice.call(getSnavDetails()).filter(function (d) {
          return d && d.open;
        });
        var liveNotif = document.getElementById("vc-notif-dropdown") || notif;
        var sheetChrome = false;
        try {
          sheetChrome =
            document.documentElement.classList.contains("vc-notif-sheet-open") ||
            document.documentElement.classList.contains("vc-notif-drawer-open");
        } catch (eSh) {}
        /* notifSheetStayOpen1: con sheet/drawer aperti non trattare la bell come dropdown header */
        if (liveNotif && liveNotif.open && !sheetChrome) opens.push(liveNotif);
        var anyOpen = opens.length > 0 || accountMenuOpen;
        try {
          anyOpen =
            anyOpen ||
            Boolean(document.documentElement.classList.contains("vc-header-account-open")) ||
            Boolean(document.querySelector(".vc-lang-dropdown[data-open='1'], .vc-lang-panel:not([hidden])"));
        } catch (eAny) {}
        if (!anyOpen) return;
        for (var i = 0; i < opens.length; i++) {
          if (eventInsideOpenDropdown(opens[i], ev)) return;
        }
        if (t.closest("summary.vc-notif-summary, .vc-notif-summary, summary.vc-snav-summary")) return;
        if (t.closest(".discord-account-menu, .vc-lang-dropdown")) return;
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
      try {
        if (window.VcI18n && typeof window.VcI18n.apply === "function") {
          window.VcI18n.apply(document);
        }
      } catch (eI18n) {}
    });
    markSnavDetailsCurrentFromLocation();
    ensureCommunityConfessionaleSnav();
    normalizePremiumFooterCommunityLinks();
  }

  function normalizePremiumFooterCommunityLinks() {
    /* footerConfessionale1: Confessionale in Community su tutti i footer (anche h4 senza heading class) */
    try {
      var footers = document.querySelectorAll("footer.vc-premium-footer");
      for (var f = 0; f < footers.length; f += 1) {
        var footer = footers[f];
        var cols = footer.querySelectorAll(".vc-premium-footer__col");
        var communityUl = null;
        var discoverUl = null;
        for (var c = 0; c < cols.length; c += 1) {
          var col = cols[c];
          var label = String(col.getAttribute("aria-label") || "").trim().toLowerCase();
          var heading =
            col.querySelector(".vc-premium-footer__heading") ||
            col.querySelector("h2,h3,h4,[data-i18n='footer.community'],[data-i18n='footer.discover']");
          var htxt = heading ? String(heading.textContent || "").trim().toLowerCase() : "";
          var ul = col.querySelector("ul");
          if (!ul) continue;
          if (label === "community" || htxt === "community") communityUl = ul;
          if (label === "scopri" || htxt === "scopri" || label === "discover" || htxt === "discover") {
            discoverUl = ul;
          }
        }
        if (!communityUl) continue;

        function takeLinkLis(ul, hrefNeedle) {
          var moved = [];
          if (!ul) return moved;
          var lis = ul.querySelectorAll("li");
          for (var i = 0; i < lis.length; i += 1) {
            var a = lis[i].querySelector("a[href]");
            if (!a) continue;
            var href = String(a.getAttribute("href") || "").toLowerCase();
            if (href.indexOf(hrefNeedle) === -1) continue;
            moved.push(lis[i]);
          }
          for (var j = 0; j < moved.length; j += 1) {
            if (moved[j].parentNode) moved[j].parentNode.removeChild(moved[j]);
          }
          return moved;
        }

        function ensureLi(ul, hrefAbs, i18nKey, labelText) {
          var existing = ul.querySelector('a[href*="' + hrefAbs.replace(/\/$/, "") + '"]');
          if (existing && existing.closest("li")) return existing.closest("li");
          var li = document.createElement("li");
          var a = document.createElement("a");
          a.href = hrefAbs;
          a.setAttribute("data-i18n", i18nKey);
          a.textContent = labelText;
          li.appendChild(a);
          return li;
        }

        takeLinkLis(discoverUl, "/bacheca");
        takeLinkLis(communityUl, "/bacheca");
        takeLinkLis(discoverUl, "/boards");
        takeLinkLis(communityUl, "/boards");

        var confFromDisc = takeLinkLis(discoverUl, "/confessionale");
        takeLinkLis(communityUl, "/confessionale");

        var confLi =
          confFromDisc[0] ||
          ensureLi(communityUl, "/confessionale/", "footer.confessionale", "Confessionale");

        var rolesA = communityUl.querySelector('a[href*="/ruoli"]');
        var usersA = communityUl.querySelector('a[href*="/user"]');
        var anchorLi = (rolesA && rolesA.closest("li")) || (usersA && usersA.closest("li")) || null;
        if (anchorLi && anchorLi.parentNode === communityUl) {
          communityUl.insertBefore(confLi, anchorLi.nextSibling);
        } else {
          communityUl.appendChild(confLi);
        }
      }
      try {
        if (window.VcI18n && typeof window.VcI18n.apply === "function") {
          window.VcI18n.apply(document.querySelector("footer.vc-premium-footer") || document);
        }
      } catch (eI18nF) {}
    } catch (eFoot) {}
  }

  function ensureCommunityConfessionaleSnav() {
    try {
      var details = document.querySelectorAll("nav.vc-header-snav details.vc-snav-details");
      for (var i = 0; i < details.length; i += 1) {
        var d = details[i];
        var sum = d.querySelector(".vc-snav-summary span");
        var title = sum ? String(sum.textContent || "").trim().toLowerCase() : "";
        if (title !== "community") continue;
        var panel = d.querySelector(".vc-snav-panel");
        if (!panel) continue;
        /* hamBachecaDashTiles1: Bacheca in Community desktop snav */
        if (!panel.querySelector('a[href*="/bacheca"], a[href*="/boards"]')) {
          var bach = document.createElement("a");
          bach.className = "vc-snav-row";
          bach.href = "/bacheca/";
          bach.setAttribute("data-vc-snav-bacheca", "1");
          bach.innerHTML =
            '<span class="vc-snav-row-ico" aria-hidden="true"><i class="fa fa-th-large"></i></span>' +
            '<span data-i18n="nav.bacheca">Bacheca</span>';
          var users = panel.querySelector('a[href*="/user"]');
          if (users && users.parentNode === panel) {
            panel.insertBefore(bach, users);
          } else {
            panel.insertBefore(bach, panel.firstChild);
          }
        }
        if (panel.querySelector('a[href*="/confessionale"]')) continue;
        var a = document.createElement("a");
        a.className = "vc-snav-row";
        a.href = "/confessionale/";
        a.innerHTML =
          '<span class="vc-snav-row-ico" aria-hidden="true"><i class="fa fa-comments"></i></span>' +
          '<span data-i18n="nav.confessionale">Confessionale</span>';
        var faq = panel.querySelector('a[href*="/faq"]');
        if (faq && faq.parentNode === panel) {
          if (faq.nextSibling) panel.insertBefore(a, faq.nextSibling);
          else panel.appendChild(a);
        } else {
          panel.appendChild(a);
        }
      }
      /* Strip from staff panels if leftover — confessionaleCommNav3 */
      for (var j = 0; j < details.length; j += 1) {
        var sd = details[j];
        var ssum = sd.querySelector(".vc-snav-summary span");
        var st = ssum ? String(ssum.textContent || "").trim().toLowerCase() : "";
        var marked =
          (sd.classList && sd.classList.contains("vc-snav-details--staff")) ||
          sd.hasAttribute("data-vc-staff-tools-nav");
        if (
          !marked &&
          st !== "staff" &&
          st.indexOf("staff") < 0 &&
          st.indexOf("strumenti staff") < 0 &&
          st !== "area staff"
        ) {
          continue;
        }
        if (st.indexOf("community") >= 0) continue;
        var spans = sd.querySelectorAll(
          'a[href*="/confessionale"], a[href*="/staff/confessionale"], a[data-vc-mobile-staff-confessionale], a[data-i18n="staff.confessionale"]'
        );
        for (var k = 0; k < spans.length; k += 1) {
          if (spans[k] && spans[k].parentNode) spans[k].parentNode.removeChild(spans[k]);
        }
      }
    } catch (eEns) {}
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initHeaderNavAccordion);
  } else {
    initHeaderNavAccordion();
  }
})();
(function () {
    var TIKTOK_PREVIEW_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" class="vc-footer-tiktok-ico" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>';
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
    /* violKillRest1: size CSS fisse — niente offsetWidth dopo innerHTML (Forced reflow) */
    var pw = 220;
    var ph = 96;
    var left = rect.left + rect.width / 2 - pw / 2;
    var top = rect.top - ph - 12;
    var preferBelow = false;
    /* socialPreviewNav1: logo in navbar — always place BELOW the whole nav shell (never under the pill). */
    try {
      var shell =
        (anchor.closest && (anchor.closest(".vc-nav-shell") || anchor.closest("header.fixed") || anchor.closest("header"))) ||
        null;
      if (shell && shell.getBoundingClientRect) {
        var shellRect = shell.getBoundingClientRect();
        preferBelow = true;
        top = shellRect.bottom + 10;
        left = rect.left + rect.width / 2 - pw / 2;
      }
    } catch (eShell) {}
    var maxLeft = window.innerWidth - pw - 10;
    if (left < 10) left = 10;
    if (left > maxLeft) left = maxLeft;
    if (!preferBelow && top < 10) top = rect.bottom + 12;
    var maxTop = window.innerHeight - ph - 10;
    if (top > maxTop) top = Math.max(10, maxTop);
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
    var showT = 0;
    function scheduleShow() {
      if (window.matchMedia && window.matchMedia("(hover: none)").matches) return;
      if (showT) return;
      showT = 1;
      var go = function () {
        showT = 0;
        try {
          showPreview(anchor);
        } catch (eSh) {}
      };
      /* violKillRest1: mouseenter/focus non fanno layout sync */
      if (typeof window.__vcLight === "function") window.__vcLight(go, 48);
      else window.setTimeout(go, 48);
    }
    anchor.addEventListener("mouseenter", scheduleShow);
    anchor.addEventListener("mouseleave", hidePreview);
    anchor.addEventListener("focus", scheduleShow);
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
    var hideArm = 0;
    window.addEventListener(
      "scroll",
      function () {
        if (hideArm) return;
        hideArm = 1;
        window.setTimeout(function () {
          hideArm = 0;
          hidePreview();
        }, 100);
      },
      { passive: true },
    );
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
  var navShellEl = null;
  var navDocEl = document.documentElement;

  function getScrollY() {
    return window.pageYOffset || document.documentElement.scrollTop || 0;
  }

  function setNavScrolled(on) {
    /* violPass11: cache shell — niente querySelector ogni scroll frame */
    if (!navShellEl || !navShellEl.isConnected) {
      navShellEl = document.querySelector("header .vc-nav-shell");
    }
    if (!navShellEl) return;
    if (on) {
      if (!navShellEl.classList.contains("vc-nav-shell--scrolled")) {
        navShellEl.classList.add("vc-nav-shell--scrolled");
        navDocEl.classList.add("vc-nav-shell-scrolled");
      }
    } else if (navShellEl.classList.contains("vc-nav-shell--scrolled")) {
      navShellEl.classList.remove("vc-nav-shell--scrolled");
      navDocEl.classList.remove("vc-nav-shell-scrolled");
    }
  }

  function syncNavScrollState() {
    ticking = false;
    /* violKillFinal2: Y solo da cache — niente pageYOffset qui */
    var y = pendingNavY;
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

  var pendingNavY = 0;
  function onNavScroll() {
    /* violKillFinal2: scroll = ZERO sync (no pageYOffset/rAF) — era Violation 195ms */
    if (ticking) return;
    ticking = true;
    var run = function () {
      try {
        pendingNavY = Math.max(
          0,
          Math.round(Number(window.__vcCachedScrollY) || 0),
        );
        if (!(pendingNavY >= 0)) pendingNavY = 0;
        if (pendingNavY < 2) {
          try {
            pendingNavY = Math.max(0, Math.round(window.pageYOffset || 0));
            window.__vcCachedScrollY = pendingNavY;
          } catch (eY) {
            pendingNavY = 0;
          }
        }
      } catch (e0) {
        pendingNavY = 0;
      }
      syncNavScrollState();
    };
    if (typeof window.__vcLight === "function") window.__vcLight(run, 80);
    else window.setTimeout(run, 80);
  }

  function initHeaderScrollState() {
    try {
      lastY = Math.max(0, Math.round(Number(window.__vcCachedScrollY) || 0));
    } catch (eLy) {
      lastY = 0;
    }
    setNavScrolled(false);
    window.addEventListener("scroll", onNavScroll, { passive: true });
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
    /* ulCountStick1: se already ha target, tieni il valore (niente flash 0 su IO flicker) */
    var kind = readKind(node);
    var to = readTarget(node);
    if (to > 0.001) {
      node.textContent = formatValue(to, kind);
      node.setAttribute("data-vc-count-current", String(to));
      node.setAttribute("data-vc-count-visible", "false");
      return;
    }
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
          /* ulCountStick1: reset SOLO se fuori viewport (ratio<0.35 faceva flash 0 su layout shift) */
          if (!entry.isIntersecting) {
            resetNode(entry.target);
            continue;
          }
          if (entry.intersectionRatio < 0.2) continue;
          playNode(entry.target);
        }
      },
      {
        root: null,
        rootMargin: "0px 0px -4% 0px",
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
    else {
      /* ulCountStick1: fuori vista → snap al target, non 0 */
      var kindSnap = readKind(node);
      var toSnap = readTarget(node);
      stopAnimation(node);
      node.textContent = formatValue(toSnap, kindSnap);
      node.setAttribute("data-vc-count-current", String(toSnap));
      node.setAttribute("data-vc-count-visible", "false");
    }
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
  /* notifLazyOpen1: chunk ~460KB solo deep-link push o primo tap campana */
    /* bootGraph1: same LANDING_NOTIF_VER as discord-auth (no stale second path) */
    var NOTIF_CHUNK_VER = (function () {
      try {
        var m = window.__VC_ASSET_VERS;
        if (m && m.LANDING_NOTIF_VER) return String(m.LANDING_NOTIF_VER);
      } catch (eNv) {}
      return "20261015classFlash2";
    })();
    /* pushPhoneHeal2: eager chunk su PWA+granted (heal FCM 410 senza tap campana) */
    /* notifCatClearDom1: clear categoria wipe lista Inbox */
    /* notifSheetStayOpen1: close header menus senza open=false grezzo */
    /* notifReadDismissOs1 */
  function loadNotifChunk(opts) {
    opts = opts || {};
    if (opts.openAfter) {
      try {
        window.__vcNotifPendingOpen = 1;
      } catch (eP) {}
    }
    /* notifBellOpen1: sync chrome ≠ full notif — aspetta BOOT reale */
    if (typeof window.__vcEnsureNotifBellScopeUi === "function" || window.__VC_LANDING_NOTIF_BOOT) {
      try {
        window.__vcLandingNotifReady = 1;
      } catch (eReady) {}
      tryOpenPendingNotif();
      return;
    }
    if (window.__vcLandingNotifReady) {
      tryOpenPendingNotif();
      return;
    }
    if (window.__vcLandingNotifLoading) return;
    window.__vcLandingNotifLoading = 1;
    var s = document.createElement("script");
    /* notifViolKill1: filename stamp + ?v= (CF/browser non devono restare su scrollNuke1) */
    s.src = "/js/vc-landing-notif." + NOTIF_CHUNK_VER + ".js?v=" + NOTIF_CHUNK_VER;
    s.async = true;
    s.onload = function () {
      try {
        window.__vcLandingNotifReady = 1;
      } catch (e0) {}
      tryOpenPendingNotif();
      try {
        document.dispatchEvent(new CustomEvent("vc:notif-chunk-ready"));
      } catch (eEv) {}
    };
    s.onerror = function () {
      try {
        window.__vcLandingNotifLoading = 0;
        window.__vcNotifPendingOpen = 0;
      } catch (eErr) {}
    };
    (document.body || document.documentElement).appendChild(s);
  }
  function tryOpenPendingNotif() {
    try {
      if (!window.__vcNotifPendingOpen) return;
      window.__vcNotifPendingOpen = 0;
      var dd = document.getElementById("vc-notif-dropdown");
      if (window.VcNotifChrome && typeof window.VcNotifChrome.openSmooth === "function") {
        window.VcNotifChrome.openSmooth(dd || null);
        return;
      }
      if (dd && !dd.open) {
        try {
          dd.open = true;
        } catch (eOp) {}
      }
    } catch (eOpen) {}
  }
  try {
    window.__vcLoadNotifChunk = loadNotifChunk;
  } catch (eExp) {}
  if (!window.__vcPinPageScroll) {
    window.__vcPinPageScroll = function () {};
    window.__vcUnpinPageScroll = function () {};
    window.__vcIsPageScrollFrozen = function () {
      return false;
    };
    window.__vcHoldPageScroll = function () {};
    /* homeScrollLock2: non azzerare sync reale già montato da auth-inject */
    if (typeof window.__vcSyncLoaderScrollLock !== "function") {
      window.__vcSyncLoaderScrollLock = function () {};
    }
    window.__vcHideNotifsForLoader = function () {};
    window.__vcIsBlockingLoaderVisible = function () {
      return false;
    };
    window.__vcLoaderElReallyBlocking = function () {
      return false;
    };
    window.__vcSyncLoaderBlockingLiveClass = function () {};
  }
  function wantsFastNotifBoot() {
    try {
      var u = new URL(location.href);
      if (u.searchParams.get("vcNotifRead")) return true;
      if (u.searchParams.get("ticketId")) return true;
      if (u.searchParams.get("vc_from_push")) return true;
      if (/^[a-f0-9]{24}$/i.test(String(u.hash || "").replace(/^#/, "").trim())) return true;
    } catch (e) {}
    /* pushPhoneHeal2: PWA/telefono con permesso già granted → carica chunk subito
       (heal FCM 410). Prima lazy-only → endpoint morti senza tap campana. */
    try {
      var standalone =
        (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
        Boolean(navigator.standalone);
      if (
        standalone &&
        typeof Notification !== "undefined" &&
        Notification.permission === "granted"
      ) {
        return true;
      }
    } catch (ePwa) {}
    return false;
  }
  function schedule() {
    if (!wantsFastNotifBoot()) return;
    loadNotifChunk();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", schedule, { once: true });
  } else schedule();
  document.addEventListener(
    "pointerdown",
    function (ev) {
      try {
        var t = ev.target;
        if (t && t.closest && t.closest("#vc-notif-dropdown, .vc-notif-summary, summary.vc-notif-summary")) {
          loadNotifChunk();
        }
      } catch (e2) {}
    },
    true
  );
  document.addEventListener(
    "click",
    function (ev) {
      try {
        if (window.__vcLandingNotifReady) return;
        var t = ev.target;
        if (!t || !t.closest) return;
        var sum = t.closest("#vc-notif-dropdown summary.vc-notif-summary, #vc-notif-dropdown summary, summary.vc-notif-summary");
        if (!sum) return;
        ev.preventDefault();
        ev.stopPropagation();
        try {
          ev.stopImmediatePropagation();
        } catch (eSip) {}
        loadNotifChunk({ openAfter: true });
      } catch (eClick) {}
    },
    true
  );
})();
(function () {
    /* staffNavFix1: do NOT block vc-mobile-nav.js — that file owns collapsible categories + badges */
    try {
    window.__vcLandingMobileNavActive = false;
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
    /* navMobileShadowClose1: unlock non deve lasciare alone scrolled sulla pill */
    try {
      var yClose =
        window.pageYOffset ||
        (document.documentElement && document.documentElement.scrollTop) ||
        0;
      var shellClose = document.querySelector("header .vc-nav-shell");
      if (shellClose && yClose <= 12) {
        shellClose.classList.remove("vc-nav-shell--scrolled");
        document.documentElement.classList.remove("vc-nav-shell-scrolled");
      }
    } catch (eNavScr) {}
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
    try {
      var menuUser = window.__VC_ACCOUNT_MENU_USER;
      var fromMenu = String(menuUser && menuUser.id || "").trim();
      if (/^\d{17,22}$/.test(fromMenu)) return fromMenu;
    } catch (eMenu) {}
    try {
      var token = String(localStorage.getItem("vc_discord_access_token") || "").trim();
      var exp = Number(localStorage.getItem("vc_discord_expires_at") || "0");
      if (token && (!exp || Date.now() < exp)) {
        var fp = String(exp) + "|" + token.slice(0, 32);
        var raw = sessionStorage.getItem("vc_discord_me_cache_v1") || localStorage.getItem("vc_discord_me_cache_local_v1");
        if (raw) {
          var o = JSON.parse(raw);
          if (o && o.v === 1 && o.user && String(o.fp || "") === fp) {
            var fromCache = String(o.user.id || "").trim();
            if (/^\d{17,22}$/.test(fromCache)) return fromCache;
          }
        }
        var uidRaw = localStorage.getItem("vc_discord_uid_v1");
        if (uidRaw) {
          var uo = JSON.parse(uidRaw);
          var fromUid = String(uo && uo.uid || "").trim();
          if (/^\d{17,22}$/.test(fromUid)) return fromUid;
        }
      }
    } catch (eCache) {}
    return "";
  }

  function mobileProfileHref(userId) {
    var id = resolveMobileAccountUserId(userId);
    /* profileHrefNoLeaderboard1: mai classifica /user senza id */
    return id ? "/user/?id=" + encodeURIComponent(id) : "#";
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

  function isBachecaNavHref(href) {
    try {
      var p = String(href || "")
        .replace(/^https?:\/\/[^/]+/i, "")
        .replace(/[?#].*$/, "")
        .replace(/\/index\.html$/i, "")
        .replace(/\/+$/, "") || "/";
      return (
        p === "/bacheca" ||
        p.indexOf("/bacheca/") === 0 ||
        p === "/boards" ||
        p.indexOf("/boards/") === 0
      );
    } catch (e) {
      return false;
    }
  }

  function isBachecaNavLabel(label) {
    var t = String(label || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    return t === "bacheca" || t === "boards" || t === "board";
  }

  /* hamFootOnly1: togli Bacheca (+ Dashboard) dalla griglia PRINCIPALE */
  function stripBachecaTilesFromGrid(gridRoot) {
    if (!gridRoot) return;
    try {
      var nodes = gridRoot.querySelectorAll(
        'a[data-vc-mobile-bacheca], a[data-vc-mobile-dashboard], a[href="/bacheca/"], a[href="/bacheca"], a[href*="/bacheca/"], a[href="/boards/"], a[href="/boards"], a[href*="/dashboard"]'
      );
      var i;
      for (i = 0; i < nodes.length; i += 1) {
        var a = nodes[i];
        if (!a || !a.classList || !a.classList.contains("vc-mobile-nav-tile")) continue;
        if (a.closest && a.closest(".vc-mobile-nav-footer")) continue;
        try {
          a.parentNode && a.parentNode.removeChild(a);
        } catch (eRm) {}
      }
    } catch (eStrip) {}
  }

  function findMobileNavSectionByTitle(gridRoot, want) {
    if (!gridRoot || !want) return null;
    var wantNorm = String(want)
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    var secs = gridRoot.querySelectorAll(".vc-mobile-nav-section, details.vc-mobile-nav-section");
    var i;
    for (i = 0; i < secs.length; i += 1) {
      var sec = secs[i];
      var titleEl = sec.querySelector(".vc-mobile-nav-section-title, summary, h3");
      var title = String((titleEl && titleEl.textContent) || "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      if (title === wantNorm || title.indexOf(wantNorm) === 0) return sec;
    }
    return null;
  }

  function sectionGridEl(sec) {
    if (!sec) return null;
    return sec.querySelector(".vc-mobile-nav-grid") || sec;
  }

  function createBachecaTile() {
    var a = document.createElement("a");
    a.className = "vc-mobile-nav-tile";
    a.href = "/bacheca/";
    a.setAttribute("data-vc-mobile-bacheca", "1");
    var ico = document.createElement("span");
    ico.className = "vc-mobile-nav-tile-ico";
    ico.setAttribute("aria-hidden", "true");
    ico.innerHTML = '<i class="fa fa-th-large"></i>';
    var lab = document.createElement("span");
    lab.className = "vc-mobile-nav-tile-label";
    lab.textContent = i18nLabel("nav.bacheca", "Bacheca");
    a.appendChild(ico);
    a.appendChild(lab);
    bindMobileNavTileNav(a);
    return a;
  }

  function ensureMobileBachecaTile(gridRoot) {
    /* hamFootOnly1: niente tile Bacheca in PRINCIPALE — solo footer */
    return;
  }

  function ensureMobileDashboardTile(gridRoot) {
    /* hamFootOnly1: niente tile Dashboard in PRINCIPALE — solo footer */
    return;
  }

  function isBachecaPathCurrent() {
    try {
      return isBachecaNavHref(window.location.pathname || "/");
    } catch (e) {
      return false;
    }
  }

  function applyFooterActionsLayout(actions) {
    if (!actions) return;
    actions.classList.add("is-trio");
    actions.classList.remove("is-quad");
  }

  /* hamEsciFull1: Esci sempre barra sotto il trio, mai cella griglia */
  function ensureFooterLogoutBarLayout(root) {
    try {
      var scope = root || document.getElementById("vc-mobile-nav-drawer-footer") || document;
      var lo =
        scope.querySelector &&
        scope.querySelector(
          ".vc-mobile-nav-footer__action--logout-bar, .vc-mobile-nav-footer__action--logout"
        );
      if (!lo) return;
      try {
        lo.classList.add(
          "vc-mobile-nav-footer__action",
          "vc-mobile-nav-footer__action--logout",
          "vc-mobile-nav-footer__action--logout-bar"
        );
        lo.classList.remove("vc-mobile-nav-footer__action--icon");
      } catch (eCls) {}
      var actions = lo.closest && lo.closest(".vc-mobile-nav-footer__actions");
      if (!actions) return;
      var account = actions.closest(".vc-mobile-nav-footer__account") || actions.parentElement;
      if (!account) return;
      var toolbar = account.querySelector(":scope > .vc-mobile-nav-footer__toolbar");
      if (!toolbar) {
        toolbar = document.createElement("div");
        toolbar.className = "vc-mobile-nav-footer__toolbar";
        if (actions.parentNode === account) {
          account.insertBefore(toolbar, actions);
          toolbar.appendChild(actions);
        } else {
          account.appendChild(toolbar);
          toolbar.appendChild(actions);
        }
      } else if (actions.parentNode !== toolbar) {
        toolbar.insertBefore(actions, toolbar.firstChild);
      }
      toolbar.appendChild(lo);
      applyFooterActionsLayout(actions);
    } catch (eEns) {}
  }

  function appendDashboardFooterAction(actions) {
    if (!actions) return null;
    var allowed = isDashboardNavAllowed();
    var dash = document.createElement("a");
    dash.className =
      "vc-mobile-nav-footer__action vc-mobile-nav-footer__action--dashboard vc-mobile-nav-footer__action--icon";
    dash.setAttribute("aria-label", i18nLabel("auth.dashboard", "Dashboard"));
    dash.title = i18nLabel("auth.dashboard", "Dashboard");
    dash.setAttribute("data-vc-mobile-dashboard", "1");
    if (allowed) {
      dash.href = resolveDashboardHref();
      try {
        if (document.body && document.body.classList.contains("vc-dashboard-page")) {
          dash.classList.add("is-active");
          dash.setAttribute("aria-current", "page");
        }
      } catch (eAct) {}
    } else {
      dash.classList.add("is-soon");
      dash.setAttribute("aria-disabled", "true");
    }
    dash.innerHTML = allowed
      ? '<i class="fa fa-server" aria-hidden="true"></i>'
      : '<span class="vc-mobile-nav-footer__soon-inner" aria-hidden="true"><i class="fa fa-server" aria-hidden="true"></i></span>' +
        '<span class="vc-mobile-nav-footer__soon-badge" data-i18n="dash.comingSoon">' +
        i18nLabel("dash.comingSoon", "soon") +
        "</span>";
    dash.addEventListener("click", function (ev) {
      if (!isDashboardNavAllowed()) {
        try {
          if (ev && ev.preventDefault) ev.preventDefault();
          if (ev && ev.stopPropagation) ev.stopPropagation();
        } catch (ePrev) {}
        return;
      }
      onMobileNavTileClick(ev, dash);
    });
    actions.appendChild(dash);
    return dash;
  }

  function appendBachecaFooterAction(actions) {
    if (!actions) return null;
    var allowed = isDashboardNavAllowed();
    var bach = document.createElement("a");
    bach.className =
      "vc-mobile-nav-footer__action vc-mobile-nav-footer__action--bacheca vc-mobile-nav-footer__action--icon";
    bach.setAttribute("aria-label", i18nLabel("nav.bacheca", "Bacheca"));
    bach.title = i18nLabel("nav.bacheca", "Bacheca");
    bach.setAttribute("data-vc-mobile-bacheca", "1");
    if (allowed) {
      bach.href = "/bacheca/";
      if (isBachecaPathCurrent()) {
        bach.classList.add("is-active");
        bach.setAttribute("aria-current", "page");
      }
    } else {
      bach.classList.add("is-soon");
      bach.setAttribute("aria-disabled", "true");
    }
    bach.innerHTML = allowed
      ? '<i class="fa fa-th-large" aria-hidden="true"></i>'
      : '<span class="vc-mobile-nav-footer__soon-inner" aria-hidden="true"><i class="fa fa-th-large" aria-hidden="true"></i></span>' +
        '<span class="vc-mobile-nav-footer__soon-badge" data-i18n="dash.comingSoon">' +
        i18nLabel("dash.comingSoon", "soon") +
        "</span>";
    bach.addEventListener("click", function (ev) {
      if (!isDashboardNavAllowed()) {
        try {
          if (ev && ev.preventDefault) ev.preventDefault();
          if (ev && ev.stopPropagation) ev.stopPropagation();
        } catch (ePrev) {}
        return;
      }
      onMobileNavTileClick(ev, bach);
    });
    actions.appendChild(bach);
    return bach;
  }

  function createFooterLogoutButton(logoutBtn) {
    var lo = document.createElement("button");
    lo.type = "button";
    /* hamFootTrioLogout1: logout a barra sotto il trio icone */
    lo.className =
      "vc-mobile-nav-footer__action vc-mobile-nav-footer__action--logout vc-mobile-nav-footer__action--logout-bar";
    lo.setAttribute("aria-label", i18nLabel("auth.logout", "Esci"));
    lo.title = i18nLabel("auth.logout", "Esci");
    lo.innerHTML =
      '<i class="fa fa-sign-out" aria-hidden="true"></i><span data-i18n="auth.logout">' +
      i18nLabel("auth.logout", "Esci") +
      "</span>";
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
    return lo;
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
        try {
          var idNow = resolveMobileAccountUserId(profile && profile.id);
          if (idNow) {
            prof.href = "/user/?id=" + encodeURIComponent(idNow);
          }
        } catch (eHrefNow) {}
        onMobileNavTileClick(ev, prof);
      });
      actions.appendChild(prof);
      /* hamFootSwapDashBach1: Profilo · Dashboard · Bacheca, logout sotto */
      appendDashboardFooterAction(actions);
      appendBachecaFooterAction(actions);
      applyFooterActionsLayout(actions);
      var toolbar = document.createElement("div");
      toolbar.className = "vc-mobile-nav-footer__toolbar";
      toolbar.appendChild(actions);
      toolbar.appendChild(createFooterLogoutButton(logoutBtn));
      wrap.appendChild(who);
      wrap.appendChild(toolbar);
      foot.appendChild(wrap);
      ensureFooterLogoutBarLayout(foot);
      return;
    }
    if (!hasToken) {
      /* bachecaHamGuestHide1: niente Bacheca da guest — solo login */
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

  /* boardsNoStaffNav1: niente sezione Staff nel menu su /bacheca */
  function isBoardsNoStaffNavPage() {
    try {
      var p = String(location.pathname || "/").replace(/\/+$/, "") || "/";
      if (p === "/bacheca" || p.indexOf("/bacheca/") === 0) return true;
      if (p === "/boards" || p.indexOf("/boards/") === 0) return true;
      if (document.body) {
        if (document.body.classList.contains("vc-boards-page")) return true;
        if (document.body.getAttribute("data-vc-boards-page")) return true;
      }
    } catch (eBoards) {}
    return false;
  }

  function ensureMobileConfessionaleTile(gridRoot) {
    /* confessionaleCommNav3: Confessionale SOLO in Community — strip staff aggressivo */
    if (!gridRoot) return;
    try {
      var staffTiles = gridRoot.querySelectorAll(
        'a[data-vc-mobile-staff-confessionale], .vc-mobile-nav-section--staff-guide a[href*="/confessionale"], .vc-mobile-nav-section--staff a[href*="/confessionale"], [data-vc-staff-section] a[href*="/confessionale"]'
      );
      for (var i = 0; i < staffTiles.length; i += 1) {
        var t = staffTiles[i];
        if (t && t.parentNode) t.parentNode.removeChild(t);
      }
      var secsAll = gridRoot.querySelectorAll(".vc-mobile-nav-section, details");
      for (var s0 = 0; s0 < secsAll.length; s0 += 1) {
        var sec0 = secsAll[s0];
        var title0 = String(
          (sec0.querySelector("summary, .vc-mobile-nav-section-title") || {}).textContent || ""
        )
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();
        var markedStaff =
          (sec0.classList &&
            (sec0.classList.contains("vc-mobile-nav-section--staff-guide") ||
              sec0.classList.contains("vc-mobile-nav-section--staff"))) ||
          sec0.hasAttribute("data-vc-staff-section");
        var titledStaff =
          title0 === "staff" ||
          title0.indexOf("staff") >= 0 ||
          title0.indexOf("strumenti staff") >= 0 ||
          title0 === "gestione";
        if (title0.indexOf("community") >= 0) continue;
        if (!markedStaff && !titledStaff) continue;
        var confStaff = sec0.querySelectorAll(
          'a[href*="/confessionale"], a[href*="/staff/confessionale"], a[data-i18n="staff.confessionale"], a[data-i18n="nav.confessionale"]'
        );
        for (var c0 = 0; c0 < confStaff.length; c0 += 1) {
          if (confStaff[c0] && confStaff[c0].parentNode) confStaff[c0].parentNode.removeChild(confStaff[c0]);
        }
      }
      var communitySec = null;
      for (var s1 = 0; s1 < secsAll.length; s1 += 1) {
        var sec1 = secsAll[s1];
        var title1 = String(
          (sec1.querySelector("summary, .vc-mobile-nav-section-title") || {}).textContent || ""
        )
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();
        if (title1.indexOf("community") >= 0) {
          communitySec = sec1;
          break;
        }
      }
      if (communitySec && !communitySec.querySelector('a[href*="/confessionale"]')) {
        var gComm = communitySec.querySelector(".vc-mobile-nav-grid") || communitySec;
        var aConf = document.createElement("a");
        aConf.className = "vc-mobile-nav-tile";
        aConf.href = "/confessionale/";
        aConf.innerHTML =
          '<span class="vc-mobile-nav-tile-ico" aria-hidden="true"><i class="fa fa-comments"></i></span>' +
          '<span class="vc-mobile-nav-tile-label" data-i18n="nav.confessionale">Confessionale</span>';
        gComm.appendChild(aConf);
      }
      var secs = gridRoot.querySelectorAll(".vc-mobile-nav-section, details");
      for (var s = 0; s < secs.length; s += 1) {
        var sec = secs[s];
        var title = String(
          (sec.querySelector("summary, .vc-mobile-nav-section-title") || {}).textContent || ""
        ).toLowerCase();
        if (title.indexOf("community") < 0) continue;
        var bad = sec.querySelectorAll('a[href*="/staff/compiti"], a[data-vc-mobile-staff-compiti]');
        for (var b = 0; b < bad.length; b += 1) {
          if (bad[b] && bad[b].parentNode) bad[b].parentNode.removeChild(bad[b]);
        }
      }
    } catch (eRm) {}
  }

  function appendStaffGuideSection(gridRoot, sourceDetails) {
    if (!gridRoot) return;
    if (isEventDedicatedNavPage() || isBoardsNoStaffNavPage()) {
      /* boardsNoStaffNav1: rimuovi eventuali sezioni Staff già montate */
      try {
        var kill = gridRoot.querySelectorAll(
          ".vc-mobile-nav-section--staff-guide, .vc-mobile-nav-section--staff, [data-vc-staff-section]",
        );
        for (var ki = 0; ki < kill.length; ki += 1) {
          if (kill[ki] && kill[ki].parentNode) kill[ki].parentNode.removeChild(kill[ki]);
        }
      } catch (eKill) {}
      return;
    }
    try {
      var existingStaffSec = gridRoot.querySelector(".vc-mobile-nav-section--staff-guide");
      if (existingStaffSec && existingStaffSec.tagName !== "DETAILS") {
        try {
          existingStaffSec.parentNode.removeChild(existingStaffSec);
        } catch (eUp) {}
        existingStaffSec = null;
      }
      if (existingStaffSec && gridRoot.querySelector('a[href*="/staff/guida"]')) {
        ensureMobileConfessionaleTile(gridRoot);
        return;
      }
    } catch (eDup) {}
    var rows = sourceDetails
      ? sourceDetails.querySelectorAll(".vc-snav-panel .vc-snav-row, a.vc-snav-row")
      : [];
    var guideRow = null;
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
      /* confessionaleCommNav2: skip confessionale — vive in Community */
      if (
        String(href).toLowerCase().indexOf("/confessionale") >= 0 ||
        labNorm === "confessionale" ||
        labNorm === "il confessionale"
      ) {
        continue;
      }
      if (!guideRow && (isStaffGuideHref(href) || isStaffGuideLabel(lab))) {
        guideRow = row;
        continue;
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
    if (!tiles.length) return;
    /* staffNavFix1 / staffCollapse1: STAFF = <details> richiudibile come le altre categorie */
    var existingSec = gridRoot.querySelector(".vc-mobile-nav-section--staff-guide");
    if (existingSec && existingSec.tagName === "DETAILS") {
      var existingGrid = existingSec.querySelector(".vc-mobile-nav-grid") || existingSec;
      for (var ti0 = 0; ti0 < tiles.length; ti0 += 1) {
        var hrefT = String(tiles[ti0].getAttribute("href") || "").toLowerCase();
        if (hrefT.indexOf("/staff/guida") >= 0 && existingSec.querySelector('a[href*="/staff/guida"]')) continue;
        if (hrefT.indexOf("/confessionale") >= 0) continue;
        if (hrefT.indexOf("/staff/compiti") >= 0 && existingSec.querySelector('a[href*="/staff/compiti"]')) continue;
        if (tiles[ti0]) {
          try {
            markTileActive(tiles[ti0], null);
          } catch (eMk) {}
          existingGrid.appendChild(tiles[ti0]);
        }
      }
      return;
    }
    if (existingSec && existingSec.parentNode) {
      try {
        existingSec.parentNode.removeChild(existingSec);
      } catch (eRm) {}
    }
    var sec = document.createElement("details");
    sec.className = "vc-mobile-nav-section vc-mobile-nav-section--staff-guide";
    sec.setAttribute("data-vc-staff-section", "1");
    try {
      if (sectionShouldOpen("STAFF", tiles, 99)) sec.setAttribute("open", "");
    } catch (eOpenDef) {}
    var h = document.createElement("summary");
    h.className = "vc-mobile-nav-section-title";
    var txt = document.createElement("span");
    txt.className = "vc-mobile-nav-section-title__txt";
    txt.textContent = "STAFF";
    var chev = document.createElement("i");
    chev.className = "fa fa-chevron-down vc-mobile-nav-section-chev";
    chev.setAttribute("aria-hidden", "true");
    h.appendChild(txt);
    h.appendChild(chev);
    var g = document.createElement("div");
    g.className = "vc-mobile-nav-grid";
    for (var ti = 0; ti < tiles.length; ti += 1) {
      if (tiles[ti]) {
        try {
          markTileActive(tiles[ti], null);
        } catch (eMk2) {}
        g.appendChild(tiles[ti]);
      }
    }
    sec.appendChild(h);
    sec.appendChild(g);
    try {
      bindSectionToggle(sec, "STAFF");
    } catch (eBind) {}
    h.addEventListener("click", function (ev) {
      try {
        if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
      } catch (ePrev) {}
      try {
        sec.open = !sec.open;
      } catch (eOpen) {}
    });
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
    /* profileSoonDashBacheca1: solo founder (view-as allowed) */
    try {
      if (window.__VC_VIEW_AS_ALLOWED === true) return true;
      var p = window.__VC_STAFF_PERMS || {};
      if (p && (p.isFounder === true || p.viewAsAllowed === true)) return true;
      if (sessionStorage.getItem("vc_view_as_allowed") === "1") return true;
    } catch (e) {}
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

  function sectionStorageKey(title) {
    return (
      "vc.mobileNav.sec.v2." +
      String(title || "")
        .replace(/\s+/g, "_")
        .trim()
        .toUpperCase()
    );
  }

  function isPinnedSectionTitle(title) {
    var t = String(title || "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
    if (t === "STAFF" || t.indexOf("STAFF") === 0) return false;
    return t === "PRINCIPALE" || t === "SITO" || t === "MAIN";
  }

  function sectionHasActiveTile(tiles) {
    var i;
    for (i = 0; i < (tiles || []).length; i += 1) {
      var tile = tiles[i];
      if (!tile) continue;
      if (tile.classList.contains("is-active") || tile.getAttribute("aria-current") === "page") return true;
    }
    return false;
  }

  function sectionShouldOpen(title, tiles, index) {
    if (isPinnedSectionTitle(title)) return true;
    try {
      var stored = localStorage.getItem(sectionStorageKey(title));
      if (stored === "0") return false;
      if (stored === "1") return true;
    } catch (eStore) {}
    /* hamburgerOpenAll1: tutte le categorie aperte di default */
    return true;
  }

  function bindSectionToggle(details, title) {
    if (!details || isPinnedSectionTitle(title)) return;
    details.addEventListener("toggle", function () {
      try {
        localStorage.setItem(sectionStorageKey(title), details.open ? "1" : "0");
      } catch (eT) {}
    });
  }

  function appendMobileNavSection(gridRoot, title, tiles, index) {
    if (!gridRoot || !tiles || !tiles.length) return;
    var pinned = isPinnedSectionTitle(title);
    var sec = document.createElement(pinned ? "section" : "details");
    sec.className = "vc-mobile-nav-section" + (pinned ? " vc-mobile-nav-section--pinned" : "");
    if (!pinned && sectionShouldOpen(title, tiles, typeof index === "number" ? index : 0)) {
      sec.setAttribute("open", "");
    }
    var h = document.createElement(pinned ? "h3" : "summary");
    h.className = "vc-mobile-nav-section-title";
    var txt = document.createElement("span");
    txt.className = "vc-mobile-nav-section-title__txt";
    txt.textContent = title;
    h.appendChild(txt);
    if (!pinned) {
      var chev = document.createElement("i");
      chev.className = "fa fa-chevron-down vc-mobile-nav-section-chev";
      chev.setAttribute("aria-hidden", "true");
      h.appendChild(chev);
    }
    var g = document.createElement("div");
    g.className = "vc-mobile-nav-grid";
    var t;
    for (t = 0; t < tiles.length; t += 1) {
      if (tiles[t]) g.appendChild(tiles[t]);
    }
    if (!g.children.length) return;
    sec.appendChild(h);
    sec.appendChild(g);
    if (!pinned) {
      bindSectionToggle(sec, title);
      h.addEventListener("click", function (ev) {
        try {
          if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
        } catch (ePrev) {}
        try {
          sec.open = !sec.open;
        } catch (eOpen) {}
      });
    }
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
      /* hamFootOnly1: skip Bacheca/Dashboard — solo footer */
      try {
        var hrefTop = String(items[i].getAttribute("href") || "").toLowerCase();
        if (
          hrefTop.indexOf("/bacheca") >= 0 ||
          hrefTop.indexOf("/boards") >= 0 ||
          hrefTop.indexOf("/dashboard") >= 0
        ) {
          continue;
        }
      } catch (eSkip) {}
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
      /* hamBachecaDashTiles1: includi Bacheca anche dalle sezioni snav */
      var tile = safeCreateTileFromRow(rowEl);
      if (tile) out.push(tile);
    }
    return out;
  }

  function rebuildGrid() {
    /* staffNavFix1: dedicated vc-mobile-nav.js owns the hamburger grid */
    if (window.__vcMobileNavStandalone) {
      try {
        var fn = window.__vcMobileNavRebuild;
        if (typeof fn === "function" && fn !== refreshMobileNav) fn();
      } catch (eFwd) {}
      return;
    }
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
        ensureMobileConfessionaleTile(gridRoot);
        ensureMobileBachecaTile(gridRoot);
        ensureMobileDashboardTile(gridRoot);
      } catch (eStaff) {}
      stripBachecaTilesFromGrid(gridRoot);
      try {
        if (window.VcNavBadges && typeof window.VcNavBadges.schedule === "function") {
          window.VcNavBadges.schedule();
        } else if (window.VcNavBadges && typeof window.VcNavBadges.apply === "function") {
          window.VcNavBadges.apply(document);
        }
      } catch (eBadgeCanon) {}
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
        var sp = sum.querySelector("span:not(.vc-nav-feat-badge)");
        titleTxt = sectionLabel(sp ? sp.textContent : sum.textContent);
      }
      if (isStaffDetailsEl(el) || isStaffOnlyNavSection(titleTxt)) {
        appendStaffGuideSection(gridRoot, el);
        continue;
      }
      var sectionTiles = collectDetailsNavTiles(el);
      appendMobileNavSection(gridRoot, titleTxt, sectionTiles, d + 1);
    }

    appendStaffGuideSection(gridRoot, document.querySelector("[data-vc-staff-tools-nav], .vc-snav-details--staff"));
    ensureMobileConfessionaleTile(gridRoot);
    ensureMobileBachecaTile(gridRoot);
    ensureMobileDashboardTile(gridRoot);
    stripBachecaTilesFromGrid(gridRoot);
    try {
      if (window.VcNavBadges && typeof window.VcNavBadges.schedule === "function") {
        window.VcNavBadges.schedule();
      } else if (window.VcNavBadges && typeof window.VcNavBadges.apply === "function") {
        window.VcNavBadges.apply(document);
      }
    } catch (eBadge) {}
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
      /* consoleFixAll1: se vc-mobile-nav.js è standalone, LUI possiede grid/eventi */
      function landingNavOwnedElsewhere() {
        return window.__vcMobileNavStandalone === true;
      }
      window.addEventListener("vc-discord-profile", function () {
        if (landingNavOwnedElsewhere()) return;
        syncDrawerFooter();
        rebuildGrid();
        removeHeaderDashboardBtn();
      });
      window.addEventListener("vc-server-identity", function () {
        if (landingNavOwnedElsewhere()) return;
        syncDrawerFooter();
      });
      window.addEventListener("vc-dashboard-access", function () {
        if (landingNavOwnedElsewhere()) return;
        rebuildGrid();
        removeHeaderDashboardBtn();
      });
      window.addEventListener("vc-auth-session-boot", function () {
        if (landingNavOwnedElsewhere()) return;
        rebuildGrid();
        removeHeaderDashboardBtn();
        syncDrawerFooter();
      });
      window.addEventListener("vc:staff-access-ok", function () {
        if (landingNavOwnedElsewhere()) return;
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
        if (landingNavOwnedElsewhere()) return;
        try {
          if (typeof window.__vcNormalizeHeaderQuickActionsOrder === "function") {
            window.__vcNormalizeHeaderQuickActionsOrder(document.getElementById("header-quick-actions"));
          }
        } catch (eStaffNorm) {}
        rebuildGrid();
      });
      document.addEventListener("vc:langchange", function () {
        if (landingNavOwnedElsewhere()) {
          /* solo i18n drawer se esiste; rebuild lo fa mobile-nav */
          try {
            if (window.VcI18n && typeof window.VcI18n.apply === "function") {
              var dOnly = document.getElementById("vc-mobile-nav-drawer");
              if (dOnly) window.VcI18n.apply(dOnly);
            }
          } catch (eLangOnly) {}
          return;
        }
        rebuildGrid();
        try {
          if (window.VcI18n && typeof window.VcI18n.apply === "function") {
            var drawer = document.getElementById("vc-mobile-nav-drawer");
            if (drawer) window.VcI18n.apply(drawer);
            window.VcI18n.apply(document);
          }
        } catch (eLangApply) {}
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
    /* hogwartsSiteDead1: evento finito — zero poll/fetch/interval/DOM libri */
    try {
      markForbiddenBooksGone();
      removeAllForbiddenBooks();
    } catch (eHwDead) {}
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

  /* hogwartsSiteDead1: kill-switch sito — niente load Hogwarts (libri/API/interval) */
  var HOGWARTS_SITE_DEAD = true;

  function revealForbiddenSectionBooks() {
    if (HOGWARTS_SITE_DEAD) {
      try {
        markForbiddenBooksGone();
        removeAllForbiddenBooks();
      } catch (eDeadReveal) {}
      return;
    }
    if (revealForbiddenBooksTimer) window.clearTimeout(revealForbiddenBooksTimer);
    /* violPass7: due macrotask — evita setTimeout handler 2s+ (fetch/DOM sync) */
    revealForbiddenBooksTimer = window.setTimeout(function () {
      revealForbiddenBooksTimer = null;
      window.setTimeout(revealForbiddenSectionBooksImpl, 0);
    }, 120);
  }

  function hogwartsEventEnabled() {
    if (HOGWARTS_SITE_DEAD) return false;
    try {
      var ev = window.__VC_HEADER_PROMO && window.__VC_HEADER_PROMO.event;
      if (ev && ev.enabled === false) return false;
      if (ev && ev.previewMode === true) return true;
    } catch (eEv) {}
    return true;
  }

  function forbiddenBooksGoneStored() {
    try {
      return String(window.localStorage.getItem("vc:forbidden-books:gone") || "") === "1";
    } catch (eLs) {
      return false;
    }
  }

  function markForbiddenBooksGone() {
    forbiddenStatusBlockedUntil = Date.now() + 7 * 24 * 60 * 60 * 1000;
    try {
      window.localStorage.setItem("vc:forbidden-books:gone", "1");
    } catch (eSet) {}
  }

  function revealForbiddenSectionBooksImpl() {
    revealForbiddenBooksTimer = null;
    if (HOGWARTS_SITE_DEAD) {
      try {
        markForbiddenBooksGone();
        removeAllForbiddenBooks();
      } catch (eDeadImpl) {}
      return;
    }
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

    /* consoleStorm2: no status fetch when event closed / past END / already 410 */
    if (
      !hogwartsEventEnabled() ||
      forbiddenBooksGoneStored() ||
      (Number.isFinite(FORBIDDEN_BOOKS_END_MS) && now > FORBIDDEN_BOOKS_END_MS)
    ) {
      markForbiddenBooksGone();
      window.setTimeout(function () {
        try {
          removeAllForbiddenBooks();
        } catch (eEarly) {}
      }, 0);
      return;
    }

    fetchForbiddenBooksPublicStatus().then(function (status) {
      if (status && status.ok === true) forbiddenBooksRoundState = status;
      if (status && status.ok && (status.enabled === false || forbiddenHuntEnded(status))) {
        markForbiddenBooksGone();
        /* violPass7: remove DOM fuori dal tick del .then (era attributo al setTimeout) */
        window.setTimeout(function () {
          try {
            removeAllForbiddenBooks();
          } catch (eRm) {}
        }, 0);
        return;
      }
      window.setTimeout(function () {
        try {
          proceed();
        } catch (ePr) {}
      }, 0);
    }).catch(function () {
      window.setTimeout(function () {
        try {
          proceed();
        } catch (ePr2) {}
      }, 0);
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
    if (HOGWARTS_SITE_DEAD) return;
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
      /* cssFoucKill1: mai unhide in-title — prima flying/body, poi mostra */
      if (!el.classList.contains("vc-forbidden-book--flying") && !el.__vcFlyTimer) startFlyingForbiddenBook(el);
      el.hidden = false;
      el.removeAttribute("hidden");
      return;
    }
    el.__vcForbiddenBookReady = true;
    el.setAttribute("role", "button");
    el.setAttribute("tabindex", "0");
    el.setAttribute("title", "Cattura il libro proibito");
    el.setAttribute("aria-label", "Cattura libro proibito");
    /* cssFoucKill1: sposta in body + classe flying PRIMA di togliere hidden (no flash 📖 in hero) */
    startFlyingForbiddenBook(el);
    el.hidden = false;
    el.removeAttribute("hidden");
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
    if (HOGWARTS_SITE_DEAD) return "";
    return String(window.__VC_HOGWARTS_FORBIDDEN_BOOKS_API || "/webhooks/site-hogwarts-sorting/forbidden-books").trim() || "/webhooks/site-hogwarts-sorting/forbidden-books";
  }

  function forbiddenBooksPublicStatusUrl() {
    if (HOGWARTS_SITE_DEAD) return "";
    return String(window.__VC_HOGWARTS_FORBIDDEN_BOOKS_STATUS_API || "/webhooks/site-hogwarts-sorting/forbidden-books/status").trim() || "/webhooks/site-hogwarts-sorting/forbidden-books/status";
  }

  function forbiddenHuntEnded(data) {
    if (!data || data.ok !== true) return false;
    if (data.roundActive !== true) return true;
    return data.closed === true;
  }

  function fetchForbiddenBooksPublicStatus() {
    if (HOGWARTS_SITE_DEAD) {
      markForbiddenBooksGone();
      return Promise.resolve({ ok: true, closed: true, roundActive: false, enabled: false });
    }
    var now = Date.now();
    if (
      !hogwartsEventEnabled() ||
      forbiddenBooksGoneStored() ||
      (Number.isFinite(FORBIDDEN_BOOKS_END_MS) && now > FORBIDDEN_BOOKS_END_MS)
    ) {
      markForbiddenBooksGone();
      return Promise.resolve({ ok: true, closed: true, roundActive: false, enabled: false });
    }
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
          /* eventoClosedApi1: stop polling after Hogwarts kill-switch 410 */
          if (payload && payload.status === 410) {
            markForbiddenBooksGone();
            try {
              removeAllForbiddenBooks();
            } catch (eRm) {}
            return finish({ ok: true, closed: true, roundActive: false });
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
        if (res && res.status === 410) {
          markForbiddenBooksGone();
          try {
            removeAllForbiddenBooks();
          } catch (eRm2) {}
          return { ok: true, closed: true, roundActive: false };
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
    if (HOGWARTS_SITE_DEAD) return Promise.reject(new Error("closed"));
    var token = getDiscordAccessTokenForForbiddenBooks();
    if (!token) return Promise.reject(new Error("Accedi con Discord e completa lo smistamento per raccogliere i libri."));
    var apiUrl = forbiddenBooksApiUrl();
    if (!apiUrl) return Promise.reject(new Error("closed"));
    return fetch(apiUrl, {
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

  /* bgGifPause1: stop flying books while tab is in background */
  /* jsWakeBurst1: anche cpu-settle/sleep — meno riattivazioni JS a idle */
  function pauseAllForbiddenBookFlights(longPause) {
    var books = document.querySelectorAll("[data-vc-forbidden-book]");
    var ms = longPause ? 60 * 60 * 1000 : 60 * 60 * 1000;
    for (var i = 0; i < books.length; i += 1) {
      pauseForbiddenBookFlight(books[i], ms);
    }
  }
  function resumeAllForbiddenBookFlights() {
    var books = document.querySelectorAll("[data-vc-forbidden-book]");
    for (var j = 0; j < books.length; j += 1) {
      try {
        window.clearTimeout(books[j].__vcPauseResumeTimer);
      } catch (eClr) {}
      books[j].__vcFlyPaused = false;
      resumeForbiddenBookFlight(books[j]);
    }
  }
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      pauseAllForbiddenBookFlights(true);
      return;
    }
    try {
      if (document.documentElement.classList.contains("vc-cpu-settle")) return;
    } catch (eSet) {}
    resumeAllForbiddenBookFlights();
  });
  document.addEventListener("vc:cpu-settle", function () {
    pauseAllForbiddenBookFlights(true);
  });
  document.addEventListener("vc:cpu-sleep", function () {
    pauseAllForbiddenBookFlights(true);
  });
  /* jsWakeIdle3: niente resume su bustle/pointermove — solo tap/wheel (dopo thaw settle) */
  var bookResumeArm = 0;
  function armForbiddenBookResume() {
    if (bookResumeArm) return;
    bookResumeArm = window.setTimeout(function () {
      bookResumeArm = 0;
      try {
        if (document.hidden) return;
        if (document.documentElement.classList.contains("vc-cpu-settle")) return;
      } catch (eH) {}
      resumeAllForbiddenBookFlights();
    }, 80);
  }
  document.addEventListener("pointerdown", armForbiddenBookResume, { passive: true, capture: true });
  document.addEventListener("wheel", armForbiddenBookResume, { passive: true, capture: true });
  document.addEventListener("vc:cpu-wake", function () {
    try {
      if (document.hidden) return;
    } catch (eH2) {}
    resumeAllForbiddenBookFlights();
  });

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
    if (document.hidden) return;
    if (prefersForbiddenBookReducedMotion()) return;
    var move = el.__vcFlyMove;
    if (typeof move !== "function") return;
    move();
    var base = isForbiddenBookMobile() ? 1650 : 850;
    el.__vcFlyTimer = window.setInterval(move, base + Math.floor(Math.random() * 450));
  }

  function startFlyingForbiddenBook(el) {
    /* perfBgRam1: mid/lite/soft-fx-off → niente libri volanti (timer CPU) */
    try {
      if (
        document.documentElement.classList.contains("vc-soft-fx-off") ||
        document.documentElement.classList.contains("vc-perf-mid") ||
        document.documentElement.classList.contains("vc-perf-lite") ||
        document.documentElement.classList.contains("vc-perf-touch")
      ) {
        return;
      }
      if (window.VcPerf && typeof window.VcPerf.isMidOrLite === "function" && window.VcPerf.isMidOrLite()) {
        return;
      }
    } catch (eSkipFly) {
      return;
    }
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
    /* violKillCue2: refreshMobileNav deferred (era Violation setTimeout ~50ms+) */
    window.setTimeout(function () {
      try {
        if (document.hidden) return;
        refreshMobileNav();
      } catch (eStaffNav) {}
    }, 80);
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
  /* ptrCardDesktop1: non reiniettare stamp vecchio se HTML ha già vc-ptr.STAMP.js
     (il check src*="vc-ptr.js" NON matcha i file stampati → doppio PTR / VER overwrite) */
  if (window.__vcPtrBooted) return;
  try {
    if (
      document.querySelector(
        'script[src*="/vc-ptr.js"], script[src*="/vc-ptr."]',
      )
    ) {
      return;
    }
  } catch (e) {}
  var s = document.createElement("script");
  s.src = "/js/vc-ptr.20261017ptrScrollRestore2.js?v=20261017ptrScrollRestore2";
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
  s.src = "/js/vc-site-polish.js?v=20260929cpuPagesIdle1";
  s.defer = true;
  (document.body || document.documentElement).appendChild(s);
})();

(function loadHeaderNameMarquee() {
  function marqueeAssetVer() {
    /* wmMqFast2d: async early in head */
    return "20261008wmMqFast2d";
  }
  function inject() {
    try {
      if (document.querySelector('script[src*="vc-header-name-marquee"]')) return true;
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
    return "20261007violKillAll1";
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
    /* scrollStayAll1: default = resta all'altezza attuale (no jump su freccette/tab) */
    if (opts.scroll !== true) return handlers;
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
      '" aria-label="' +
      String(p) +
      " — " +
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
      '" name="vcPagerPage" id="vc-mini-pager-input" data-pager-input>' +
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
      if (now) {
        now.textContent = String(p);
        var jumpAriaSync = langEn() ? "Go to page" : "Vai a pagina";
        now.setAttribute("aria-label", String(p) + " — " + jumpAriaSync);
        now.setAttribute("title", jumpAriaSync);
      }
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
  var PHONE_WATCH_MS = 8000;
  var PHONE_WATCH_MAX_MS = 45000;

  function isPhoneOrPwa() {
    /* pwaCpuNuke1: desktop PWA NON è "phone recover" (maxTouchPoints su Win = false positive) */
    try {
      if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return true;
      if ((window.innerWidth || 999) <= 920 && Number(navigator.maxTouchPoints || 0) > 0) return true;
    } catch (eDet) {}
    return false;
  }

  function isStandalonePwa() {
    try {
      return (
        (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
        (window.matchMedia && window.matchMedia("(display-mode: fullscreen)").matches) ||
        (window.matchMedia && window.matchMedia("(display-mode: minimal-ui)").matches) ||
        Boolean(navigator.standalone)
      );
    } catch (eStand) {
      return false;
    }
  }

  function curtainStillUp() {
    try {
      if (typeof window.__vcCineCurtainStillUp === "function") return Boolean(window.__vcCineCurtainStillUp());
    } catch (eApi) {}
    try {
      var root = document.documentElement;
      if (root.classList.contains("vc-cine-curtain-off")) return false;
      /* personalizzaRankFix1e: vc-perf early CSS hides main until curtain-off
         even when #vc-cine-boot-curtain is absent (ex. /personalizza/). */
      if (document.getElementById("vc-cine-boot-curtain")) return true;
      return Boolean(root.classList.contains("vc-site-polish") || root.classList.contains("vc-page-cine-boot"));
    } catch (eCur) {
      return false;
    }
  }

  function chromeAllowsCurtainLift() {
    try {
      /* toastSyncAll2: solo LoadDone (VisualReady early → sipario prima del toast/chrome) */
      if (window.__vcChromeLoadDone === true) return true;
      var age = cineBootAgeMs();
      /* toastSyncAll2: niente lift a 2.8s (sipario su → poi ancora barra/toast = 2° load) */
      if (age >= 6500) return true;
      return false;
    } catch (eAllow) {}
    return false;
  }

  function liftCineCurtainNow() {
    /* toastSyncAll2: sipario solo dopo chrome done (o hard 6.5s) */
    try {
      if (!chromeAllowsCurtainLift()) {
        if (!window.__vcLandingCurtainWait) {
          window.__vcLandingCurtainWait = 1;
          var waitN = 0;
          (function waitChrome() {
            waitN += 1;
            try {
              /* toastSyncAll2: ~180×40ms ≈ 7.2s > hard 6.5s chrome allow */
              if (chromeAllowsCurtainLift() || waitN > 180) {
                window.__vcLandingCurtainWait = 0;
                liftCineCurtainNow();
                return;
              }
            } catch (eW) {
              window.__vcLandingCurtainWait = 0;
            }
            window.setTimeout(waitChrome, 40);
          })();
        }
        return;
      }
    } catch (eGate) {}
    try {
      if (typeof window.__vcLiftCineBootCurtain === "function") {
        window.__vcLiftCineBootCurtain();
        return;
      }
    } catch (eLift) {}
    try {
      var root = document.documentElement;
      root.classList.add("vc-cine-curtain-off");
      var cur = document.getElementById("vc-cine-boot-curtain");
      if (cur && cur.parentNode) cur.parentNode.removeChild(cur);
    } catch (eRm) {}
  }

  function cineBootAgeMs() {
    try {
      var t = Number(window.__vcCineBootStartedAt || window.__vcPhoneUnfreezeArmedAt || 0) || 0;
      /* toastSyncAll2: senza timestamp = età 0 (NON 99999 → early allow) */
      if (!t) return 0;
      return Math.max(0, Date.now() - t);
    } catch (eAge) {
      return 0;
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
      var root = document.documentElement;
      var age = cineBootAgeMs();
      var softMs = isStandalonePwa() ? 2600 : isPhoneOrPwa() ? 4800 : 7000;
      if (curtainStillUp() && root.classList.contains("vc-page-cine-ready")) {
        liftCineCurtainNow();
      } else if (curtainStillUp() && age >= softMs) {
        if (typeof window.__vcRevealCineBoot === "function") window.__vcRevealCineBoot(true);
        else liftCineCurtainNow();
      }
    } catch (eRev) {
      try {
        if (curtainStillUp() && cineBootAgeMs() >= 2600) liftCineCurtainNow();
      } catch (eLift2) {}
    }
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
    try {
      /* loaderLoopFix1: riallinea scroll-lock dopo hide (live-class da sola non bastava) */
      if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
    } catch (eLockStamp) {}
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
            /* sheetScrollStayFix1: keep page locked while any fullscreen sheet/modal is open */
            var mustLock = false;
            try {
              if (typeof window.__vcIsPageScrollFrozen === "function") {
                mustLock = window.__vcIsPageScrollFrozen();
              }
            } catch (eFr) {
              mustLock = false;
            }
            if (!mustLock) {
              mustLock =
                root.classList.contains("vc-mobile-nav-open") ||
                notifReallyOpen ||
                root.classList.contains("vc-dialog-open") ||
                root.classList.contains("vc-staff-manage-sheet-open") ||
                root.classList.contains("vc-staff-reso-sheet-open") ||
                root.classList.contains("vc-staff-stat-sheet-open") ||
                root.classList.contains("vc-feedback-sheet-open") ||
                root.classList.contains("vc-reviews-modal-open") ||
                root.classList.contains("vc-dash-confirm-open") ||
                root.classList.contains("vc-dash-cmds-modal-open") ||
                root.classList.contains("vc-wfc-subject-open");
            }
            if (mustLock && typeof window.__vcPinPageScroll === "function") {
              window.__vcPinPageScroll({ soft: true, forcePhoneLock: true });
              try {
                if (typeof window.__vcSyncLoaderScrollLock === "function") {
                  window.__vcSyncLoaderScrollLock();
                }
              } catch (eSyncKeep) {}
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
      /* iosWinProfilePush1: togli anche overlay profilo (prima restava → gate infinito) */
      var profLoad = document.getElementById("vc-user-profile-loading");
      if (profLoad) {
        try {
          profLoad.hidden = true;
          profLoad.setAttribute("hidden", "");
          profLoad.remove();
        } catch (eProfRm) {
          stampHiddenLoader(profLoad);
        }
      }
      document.querySelectorAll("body > .vc-user-profile-loader, [data-vc-profile-boot]").forEach(function (n) {
        try {
          if (n && n.closest && n.closest("[data-vc-profile-staff-pane]")) return;
          if (n && n.getAttribute && n.getAttribute("data-vc-staff-loading")) return;
          n.hidden = true;
          n.setAttribute("hidden", "");
          n.remove();
        } catch (eBootRm) {}
      });
    } catch (eProf) {}
    try {
      document.documentElement.classList.remove("vc-loading-scroll-lock");
      document.documentElement.classList.remove("vc-user-profile-pending");
      document.documentElement.classList.remove("vc-user-profile-comm-switch");
      document.documentElement.classList.remove("vc-loader-blocking-live");
            try {
        var ulStuck = document.getElementById("vc-ul-loading");
        if (loaderLooksDead(ulStuck)) {
          document.documentElement.classList.remove("vc-user-leader-pending");
        }
      } catch (eLead) {}
      /* pwaBlank1: non forzare ready+lift prima del soft timeout (race col boot) */
      if (cineBootAgeMs() >= (isStandalonePwa() ? 2600 : 4500) || curtainStillUp() && document.documentElement.classList.contains("vc-page-cine-ready")) {
        document.documentElement.classList.add("vc-page-cine-ready");
        document.documentElement.classList.remove("vc-page-cine-boot");
        liftCineCurtainNow();
      }
    } catch (eCls) {}
    try {
      var rootBoot = document.documentElement;
      if (
        rootBoot.classList.contains("vc-page-cine-boot") &&
        !rootBoot.classList.contains("vc-page-cine-ready") &&
        Date.now() - (window.__vcPhoneUnfreezeArmedAt || 0) > (isStandalonePwa() ? 3200 : 8000)
      ) {
        rootBoot.classList.add("vc-page-cine-ready");
        rootBoot.classList.remove("vc-page-cine-boot");
        liftCineCurtainNow();
      }
    } catch (eBootReady) {}
    try {
      /* sheetScrollStayFix1: do not strip scroll lock under open sheets */
      var keepSheet = false;
      try {
        keepSheet =
          typeof window.__vcIsPageScrollFrozen === "function" && window.__vcIsPageScrollFrozen();
      } catch (eKeep) {
        keepSheet = false;
      }
      if (keepSheet) {
        if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
      } else if (typeof window.__vcUnpinPageScroll === "function") {
        window.__vcUnpinPageScroll();
      }
    } catch (eU) {}
    try {
      if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
    } catch (eS) {}
  }

  function pageLooksHealthy() {
    try {
      var root = document.documentElement;
      /* pwaBlank1: sipario nero ancora su = non healthy anche se ready è già settato */
      if (curtainStillUp()) return false;
      if (root.classList.contains("vc-page-cine-boot") && !root.classList.contains("vc-page-cine-ready")) return false;
      var blockingNow = false;
      try {
        if (typeof window.__vcIsBlockingLoaderVisible === "function") {
          blockingNow = window.__vcIsBlockingLoaderVisible();
        } else if (document.querySelector('.vc-ul-loading[data-vc-loader-blocking="1"]:not([hidden])')) {
          blockingNow = true;
        }
      } catch (eBlkH) {
        blockingNow = Boolean(
          document.querySelector('.vc-ul-loading[data-vc-loader-blocking="1"]:not([hidden])'),
        );
      }
      if (blockingNow) return false;
      /* loaderLoopFix1: scroll-lock orfano dopo hide loader non deve far girare recover forever */
      if (root.classList.contains("vc-loading-scroll-lock")) {
        var pendingGate =
          root.classList.contains("vc-user-leader-pending") ||
          root.classList.contains("vc-user-profile-pending") ||
          root.classList.contains("vc-rank-customize-pending") ||
          root.classList.contains("vc-custom-profile-pending") ||
          root.classList.contains("vc-session-verify-pending");
        if (pendingGate) return false;
        if (!root.classList.contains("vc-page-cine-ready") && !root.classList.contains("vc-home-motion-ready")) {
          return false;
        }
        /* ready + lock orfano → healthy (heartbeat lo toglie) */
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
      /* sheetScrollStayFix1: also keep lock for feedback/staff/reviews sheets */
      if (
        !keepNotifScrollLock &&
        typeof window.__vcIsPageScrollFrozen === "function" &&
        window.__vcIsPageScrollFrozen()
      ) {
        keepNotifScrollLock = true;
      }
    } catch (eKeepN) {
      keepNotifScrollLock = false;
    }
    try {
      var root = document.documentElement;
      var age = cineBootAgeMs();
      var softMs = isStandalonePwa() ? 2600 : isPhoneOrPwa() ? 4800 : 7000;
      var readyAlready = root.classList.contains("vc-page-cine-ready");
      var curtainUp = curtainStillUp();
      /* Inconsistenza classica webapp: ready senza lift → alza subito */
      if (curtainUp && readyAlready) {
        liftCineCurtainNow();
      }
      /* Solo dopo soft timeout forziamo ready+lift (evita FOUC a 0ms) */
      if (!readyAlready && (age >= softMs || (force && age >= Math.min(1100, softMs)))) {
        root.classList.add("vc-page-cine-ready");
        root.classList.add("vc-home-motion-ready");
        root.classList.remove("vc-page-cine-boot");
        liftCineCurtainNow();
      } else if (curtainUp && age >= softMs) {
        root.classList.add("vc-page-cine-ready");
        root.classList.add("vc-home-motion-ready");
        root.classList.remove("vc-page-cine-boot");
        liftCineCurtainNow();
      }
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
      var softLock = root.classList.contains("vc-scroll-soft-lock");
      var fixed = getComputedStyle(body).position === "fixed" || body.style.position === "fixed";
      var must = false;
      try {
        if (typeof window.__vcIsPageScrollFrozen === "function") {
          must = window.__vcIsPageScrollFrozen();
        }
      } catch (eFrHb) {
        must = false;
      }
      if (!must) {
        must =
          root.classList.contains("vc-mobile-nav-open") ||
          root.classList.contains("vc-dialog-open") ||
          root.classList.contains("vc-staff-manage-sheet-open") ||
          root.classList.contains("vc-staff-reso-sheet-open") ||
          root.classList.contains("vc-staff-stat-sheet-open") ||
          root.classList.contains("vc-feedback-sheet-open") ||
          root.classList.contains("vc-reviews-modal-open") ||
          root.classList.contains("vc-dash-confirm-open") ||
          root.classList.contains("vc-dash-cmds-modal-open") ||
          root.classList.contains("vc-wfc-subject-open");
      }
      if (root.classList.contains("vc-user-leader-pending")) {
        var ulHb = document.getElementById("vc-ul-loading");
        if (ulHb && !loaderLooksDead(ulHb)) must = true;
        else root.classList.remove("vc-user-leader-pending");
      }
      if (root.classList.contains("vc-user-profile-pending")) {
        var prHb = document.getElementById("vc-user-profile-loading");
        var bpHb = document.querySelector("body > .vc-user-profile-loader");
        /* staffSwitchIdLock1: non droppare pending se staff tab ancora in boot senza pane */
        var staffBootHold =
          root.classList.contains("vc-user-profile-staff-tab-pending") ||
          root.classList.contains("vc-staff-boot-block");
        var staffPaneOk = Boolean(
          document.querySelector(
            ".vc-user-profile-staff-pane .vc-user-profile-hero, .vc-user-profile-staff-pane .vc-staff-profile-panel, .vc-staff-prof-miss",
          ),
        );
        if ((prHb && !loaderLooksDead(prHb)) || (bpHb && !loaderLooksDead(bpHb))) must = true;
        else if (staffBootHold && !staffPaneOk) must = true;
        else root.classList.remove("vc-user-profile-pending");
      }
      var dd = document.getElementById("vc-notif-dropdown");
      if (dd && (dd.open || dd.hasAttribute("open"))) must = true;
      if (must || blocking) {
        if (lockCls || softLock || fixed) {
          try {
            if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
          } catch (eSyncHb) {}
        } else {
          try {
            if (typeof window.__vcPinPageScroll === "function") {
              window.__vcPinPageScroll({ soft: true, forcePhoneLock: true });
            }
            if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
          } catch (eRepinHb) {}
        }
        return;
      }
      if (!lockCls && !softLock && !fixed) return;
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
    /* pwaCpuNuke1: desktop PWA — un recover soft, ZERO watch interval (CPU loop) */
    if (isStandalonePwa()) {
      recover(false);
      window.setTimeout(function () {
        recover(false);
      }, 900);
      window.setTimeout(clearPhoneHasFreezeGhosts, 600);
      return;
    }
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
    /* extOnlyFix1: recover fuori dal handler sync */
    /* pwaResumeLag1: se pagina healthy → solo ghost clear (no recover storm) */
    var persisted = Boolean(ev && ev.persisted);
    window.setTimeout(function () {
      try {
        if (isPhoneOrPwa()) {
          if (pageLooksHealthy() && !persisted) clearPhoneHasFreezeGhosts();
          else {
            recover(persisted);
            clearPhoneHasFreezeGhosts();
          }
        } else if (persisted) {
          recover(true);
        }
      } catch (ePs) {}
    }, 0);
  });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "visible") return;
    if (!isPhoneOrPwa()) return;
    window.setTimeout(function () {
      try {
        /* pwaResumeLag1: wake sano = niente recover(force) (era jank "ricarica tutto") */
        if (pageLooksHealthy()) {
          clearPhoneHasFreezeGhosts();
          return;
        }
        recover(true);
        clearPhoneHasFreezeGhosts();
      } catch (eVis) {}
    }, 0);
  });
  window.addEventListener("focus", function () {
    try {
      if (!isPhoneOrPwa()) return;
      var stand =
        (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
        Boolean(navigator.standalone);
      if (!stand) return;
      if (pageLooksHealthy()) {
        clearPhoneHasFreezeGhosts();
        return;
      }
      recover(true);
      clearPhoneHasFreezeGhosts();
    } catch (eFocus) {}
  });
})();

(function () {
  /* consoleStorm2: CF 1015 — never fire warm webhook storm in parallel */
  function warmPublicApis() {
    if (!window.VcApiCache || typeof window.VcApiCache.prefetchIdle !== "function") return;
    var path = "/";
    try {
      path = String(window.location.pathname || "").replace(/\/+$/, "") || "/";
    } catch (ePath) {}
    var jobs = [];
    try {
      if (path !== "/ruoli" && path !== "/roles") {
        jobs.push(function () {
          window.VcApiCache.prefetchIdle(
            /* pageTune1: allinea warm a roles-page (roles5) — evita doppia cache miss */
            window.VcApiCache.keyFor("/webhooks/site-roles", { scope: "roles", v: "roles5" }),
            "/webhooks/site-roles",
            { ttlMs: 90000, staleMs: 600000, persistMs: 20 * 60 * 1000, timeoutMs: 28000 },
          );
        });
      }
      if (path !== "/vote") {
        jobs.push(function () {
          window.VcApiCache.prefetchIdle("vote:anon", "/webhooks/site-vote", {
            ttlMs: 45000,
            staleMs: 300000,
            timeoutMs: 24000,
          });
        });
      }
      if (path !== "/recensioni" && path !== "/reviews") {
        jobs.push(function () {
          window.VcApiCache.prefetchIdle("reviews:server", "/webhooks/site-reviews?kind=server", {
            ttlMs: 60000,
            staleMs: 600000,
            timeoutMs: 15000,
          });
        });
      }
      if (path !== "/user" && path.indexOf("/user/") !== 0) {
        jobs.push(function () {
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
        });
      }
      var regoleCfg = window.__VC_REGOLE || {};
      var regoleUrl = String(regoleCfg.apiUrl || regoleCfg.api || "").trim();
      /* contentStatic1: skip warm if baked pack is present */
      var hasRegoleStatic = false;
      try {
        hasRegoleStatic = Boolean(
          window.__VC_REGOLE_STATIC &&
            window.__VC_REGOLE_STATIC.ok &&
            Array.isArray(window.__VC_REGOLE_STATIC.rules) &&
            window.__VC_REGOLE_STATIC.rules.length,
        );
      } catch (eRs) {}
      if (!hasRegoleStatic && regoleUrl && regoleUrl.indexOf("{{") < 0 && path !== "/regole") {
        jobs.push(function () {
          window.VcApiCache.prefetchIdle(window.VcApiCache.keyFor(regoleUrl, { scope: "regole" }), regoleUrl, {
            ttlMs: 10 * 60 * 1000,
            staleMs: 60 * 60 * 1000,
            persistMs: 24 * 60 * 60 * 1000,
            timeoutMs: 15000,
          });
        });
      }
      var liveCfg = window.__VC_LIVE || {};
      var liveExtra = String(liveCfg.extraStatsPath || liveCfg.extraStatsUrl || "").trim();
      if (liveExtra && liveExtra.indexOf("{{") < 0) {
        jobs.push(function () {
          window.VcApiCache.prefetchIdle(window.VcApiCache.keyFor(liveExtra, { scope: "live" }), liveExtra, {
            ttlMs: 45000,
            staleMs: 300000,
            timeoutMs: 12000,
          });
        });
      }
    } catch (eP) {}

    var touchWarm = false;
    try {
      touchWarm =
        (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
        Number(navigator.maxTouchPoints || 0) > 0;
    } catch (eTw) {}
    var startMs = touchWarm ? 18000 : 14000;
    var gapMs = 4500;
    jobs.forEach(function (job, i) {
      window.setTimeout(function () {
        try {
          job();
        } catch (eJob) {}
      }, startMs + i * gapMs);
    });
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


/* consoleRest1 */

/* staffNavFix1 */

/* consoleNoise2 */

/* console429Kill1 */
/* violKill1 */
/* extOnlyFix1 */
/* violPass2 */
/* violPass11 */
