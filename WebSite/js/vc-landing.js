(function () {
  try {
    if (!window.VcPerf || !window.VcPerf.__ready) {
      var s = document.createElement("script");
      s.src = "/js/vc-perf.js?v=20260830ptrFirstTap1";
      s.async = false;
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
        // brandHome1: flag recente (60s) = click esplicito su Home, non ripristinare.
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
    try {
      if (window.__VC_AUTH && window.__VC_AUTH.homeUrl) {
        var hu = new URL(String(window.__VC_AUTH.homeUrl), window.location.href);
        if (isSiteHost(hu.hostname)) {
          return hu.origin + "/";
        }
      }
    } catch (e0) {}
    try {
      return window.location.origin + "/";
    } catch (e1) {
      return "/";
    }
  }

  /** siteUrlFaq1: bake corrotti mettevano SITE_URL=/faq sul brand — forza homepage. */
  function repairBrokenHomeLinks() {
    try {
      if (window.__VC_AUTH && window.__VC_AUTH.homeUrl) {
        var badHome = String(window.__VC_AUTH.homeUrl || "");
        var cleaned = badHome.replace(/\?.*$/, "").replace(/#.*$/, "");
        if (/\/faq\/?$/i.test(cleaned)) {
          try {
            window.__VC_AUTH.homeUrl = window.location.origin + "/";
          } catch (eFix) {
            window.__VC_AUTH.homeUrl = "/";
          }
        }
      }
    } catch (eAuth) {}
    var home = siteHomeHref();
    var nodes = document.querySelectorAll(
      'a.vc-header-site-name, a[aria-label="Vai alla homepage"], .vc-premium-footer__logo-row, a[data-i18n="footer.home"]'
    );
    for (var i = 0; i < nodes.length; i++) {
      var a = nodes[i];
      try {
        var href = a.getAttribute("href") || "";
        var u = new URL(href, window.location.href);
        if (!isSiteHost(u.hostname) && href.charAt(0) !== "/") continue;
        var p = String(u.pathname || "/").replace(/\/+$/, "") || "/";
        if (p === "/faq") {
          a.setAttribute("href", home);
        }
      } catch (eA) {}
    }
  }

  try {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", repairBrokenHomeLinks);
    } else {
      repairBrokenHomeLinks();
    }
    window.addEventListener("pageshow", repairBrokenHomeLinks);
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
    // Click su "Vinili & Caffè" / Home: resta in home (non ripristinare /faq ecc.).
    if (consumeWantHome()) {
      saveResume("/");
      return false;
    }
    // Navigazione interna verso / (referrer same-site): non hijackare.
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

  // Su apertura da notifica iOS apre spesso start_url (/). Il resume PWA
  // non deve vincere sulla destinazione stashed dal service worker.
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

  document.addEventListener(
    "click",
    function (ev) {
      var a = ev.target && ev.target.closest ? ev.target.closest("a[href]") : null;
      if (!a) return;
      var href = a.getAttribute("href") || "";
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
          ev.preventDefault();
          try {
            assignInApp(new URL(href, window.location.href));
          } catch (eNav) {}
          return;
        }
      }
      if (isHomeHref(href)) {
        markWantHome();
      }
    },
    true
  );

  window.addEventListener("pagehide", function () {
    if (!isStandalonePwa()) return;
    // Se stiamo andando in Home, non riscrivere il resume con /faq/ (race pagehide).
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
    if (currentPath() === "/vote/" || currentPath() === "/vote") saveResume("/vote/");
    else saveResume(currentPath());
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

  /** Banner preferenze: id/class senza "cookie-consent" per evitare filtri cosmetic (uBlock/ecc.) che nascondono il nodo. */
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
        window.location.replace("/user/personalizza/?id=" + encodeURIComponent(customizeMatch[1]));
        return true;
      }
      var legacyCustomizeMatch = String(window.location.pathname || "").match(/^\/users\/(\d{17,20})\/customize\/?$/);
      if (legacyCustomizeMatch) {
        window.location.replace("/user/personalizza/?id=" + encodeURIComponent(legacyCustomizeMatch[1]) + "&target=rank");
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
    // snappyMotion1: niente overlay full-screen su navigazione (mobile + desktop).
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
        /* Overlay full-screen + cine/PWA = flash Chromium. Vai dritto alla pagina. */
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
      if (/^\/users\/\d{17,20}$/.test(cur)) {
        isUserProfileDetail = true;
      } else if (cur === "/user") {
        var q = new URLSearchParams(window.location.search || "");
        isUserProfileDetail = /^\d{17,20}$/.test(String(q.get("id") || "").trim());
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
        if (isUserProfileDetail && p === "/user") return;
        hit = true;
        rowHit = true;
        a.classList.add("vc-snav-row--active");
        a.setAttribute("aria-current", "page");
      });
      if (hit) det.classList.add("vc-snav-details--current");
    });

  }

  function initHeaderNavAccordion() {
    var bar = document.querySelector(".vc-header-bar");
    if (!bar) return;
    var HEADER_MENU_SYNC_KEY = "vc_header_menu_sync_v1";
    var localWindowId = String(Date.now()) + "-" + String(Math.random()).slice(2);
    var detailsList = bar.querySelectorAll("details.vc-snav-details");
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
    detailsList.forEach(function (d) {
      d.addEventListener("toggle", function () {
        if (d.open) {
          broadcastHeaderMenuOpen(d.id || d.getAttribute("data-menu-id") || "snav");
          detailsList.forEach(function (other) {
            if (other !== d) other.open = false;
          });
          if (notif) notif.open = false;
          closeLangMenu();
        }
        syncHeaderDropdownOpenClasses();
      });
    });
    if (notif) {
      notif.addEventListener("toggle", function () {
        syncHeaderDropdownOpenClasses();
        if (!notif.open) return;
        broadcastHeaderMenuOpen(notif.id || "notif");
        detailsList.forEach(function (other) {
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
      detailsList.forEach(function (other) {
        other.open = false;
      });
      if (notif) notif.open = false;
      setAccountMenuOpen(false);
      syncHeaderDropdownOpenClasses();
    });
    // Account menu nasce dopo il login: delegation sul bar, non query una tantum.
    bar.addEventListener("pointerover", function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      var menu = t.closest(".discord-account-menu");
      if (!menu || !bar.contains(menu)) return;
      var related = ev.relatedTarget;
      if (related && menu.contains(related)) return;
      // Notifiche aperte con click: restano aperte (niente chiusura solo per hover sull’avatar).
      if (notif && notif.open) return;
      detailsList.forEach(function (other) {
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
      detailsList.forEach(function (other) {
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
      detailsList.forEach(function (other) {
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
      detailsList.forEach(function (d) {
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
        // Dopo il portal mobile lo sheet è su <body>, non più dentro la bar.
        var liveNotif = document.getElementById("vc-notif-dropdown");
        if (liveNotif && liveNotif.open) opens.push(liveNotif);
        if (!opens.length) return;
        for (var i = 0; i < opens.length; i++) {
          if (eventInsideOpenDropdown(opens[i], ev)) return;
        }
        // Tap sulla summary della campanella: lascia aprire/chiudere al <details>.
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
    markSnavDetailsCurrentFromLocation();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initHeaderNavAccordion);
  } else {
    initHeaderNavAccordion();
  }
})();
(function () {
  /** Stesso path del glyph footer (build-site.mjs `tiktokGlyphSvg`), fill via currentColor. */
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
  function initHeaderScrollState() {
    var navShell = document.querySelector("header .vc-nav-shell");
    if (!navShell) return;
    // Niente toggle scrolled: ogni cambio classe rieseguiva paint/blur e flashava un rettangolo.
    try {
      navShell.classList.remove("vc-nav-shell--scrolled");
    } catch (e0) {}
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
  /** Tempo in cui il pop resta leggibile sotto la campanella. */
  var NOTIF_FLY_READ_MS = 3400;
  /** Durata animazione di uscita (ms); match .vc-notif-fly-card--out. */
  var NOTIF_FLY_ANIM_MS = 280;
  var notifFlyActiveCount = 0;
  var notifInterruptQueue = [];
  var notifInterruptOpen = false;
  var notifInterruptCurrent = null;
  var notifInterruptKeyHandler = null;

  function isBlockingLoaderVisible() {
    try {
      var root = document.documentElement;
      var coarse = false;
      try {
        coarse =
          (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
          Number(navigator.maxTouchPoints || 0) > 0;
      } catch (eC) {}
      // Su telefono non congelare gesture per session-verify (overlay spesso fantasma).
      if (!coarse && root.classList.contains("vc-session-verify-pending")) return true;
      if (root.classList.contains("vc-dash-access-pending")) return true;
      if (root.classList.contains("vc-user-leader-pending")) return true;
      if (root.classList.contains("vc-user-profile-pending")) return true;
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
    // Solo overlay caricamento full-page (non gate login/auth).
    if (document.querySelector(".vc-ul-loading:not([hidden])")) return true;
    if (document.querySelector("#vc-rank-customize-loading:not([hidden])")) return true;
    var profileLoading = document.getElementById("vc-user-profile-loading");
    if (profileLoading && !profileLoading.hidden && !profileLoading.hasAttribute("hidden")) return true;
    if (document.querySelector("body > .vc-user-profile-loader:not([hidden])")) return true;
    // Solo loader community/boot a livello root — NON quello del tab Staff (altrimenti
    // resta touchmove non-passive e lagga tutta la pagina da telefono).
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
    // Gate login: soft — NON congelare body come un loader (rompe scroll/PWA).
    // Lo scroll lock per gate resta gestito dal CSS del gate stesso se serve.
    return false;
  }

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

  function isPageScrollFrozen() {
    if (isBlockingLoaderVisible()) return true;
    try {
      var root = document.documentElement;
      if (root.classList.contains("vc-rank-customize-pending")) return true;
      if (root.classList.contains("vc-mobile-nav-open")) return true;
      if (root.classList.contains("vc-user-leader-pending")) return true;
      if (root.classList.contains("vc-user-profile-pending")) return true;
      try {
        var coarseFreeze =
          (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
          Number(navigator.maxTouchPoints || 0) > 0;
        if (!coarseFreeze && root.classList.contains("vc-session-verify-pending")) return true;
      } catch (eSesF) {}
      // notifUnpin1: classe fantasma senza <details open> non deve congelare la pagina.
      if (root.classList.contains("vc-notif-sheet-open")) {
        var ddFrozen = document.getElementById("vc-notif-dropdown");
        if (ddFrozen && (ddFrozen.open || ddFrozen.hasAttribute("open"))) return true;
      }
      if (root.classList.contains("vc-staff-stat-sheet-open")) return true;
      if (root.classList.contains("vc-staff-manage-sheet-open")) return true;
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
    // soft = sheet/notif: blocca lo scroll della pagina ma NON touch-action:none
    // (altrimenti iOS non scrolla il contenuto interno dello sheet → tutto “lento/bloccato”).
    // pwaHardFreeze1: su telefono/PWA MAI touch-action:none inline (uccide TUTTI i tap).
    var soft = Boolean(opts.soft);
    try {
      if (isCoarsePointerDevice() || isStandalonePwaLocal()) soft = true;
    } catch (eSoftForce) {
      soft = true;
    }
    if (!scrollPinned) {
      scrollPinSavedY = pageScrollY();
      scrollPinned = true;
    }
    scrollPinSoft = soft;
    try {
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

  function unpinPageScroll() {
    if (!scrollPinned) return;
    var body = document.body;
    var y = scrollPinSavedY;
    scrollPinned = false;
    scrollPinSoft = false;
    scrollPinSavedY = 0;
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
      window.scrollTo(0, y);
    } catch (eUnpin) {}
  }

  try {
    window.__vcPinPageScroll = pinPageScroll;
    window.__vcUnpinPageScroll = unpinPageScroll;
  } catch (ePinExport) {}

  function isLoaderScrollLocked() {
    try {
      var root = document.documentElement;
      if (root.classList.contains("vc-loading-scroll-lock")) return true;
      if (root.classList.contains("vc-user-leader-pending")) return true;
      if (root.classList.contains("vc-user-profile-pending")) return true;
    } catch (eLockCls) {}
    return false;
  }

  function blockLoaderScroll(e) {
    if (window.__vcPtrTracking) return;
    if (!isPageScrollFrozen() && !isLoaderScrollLocked()) return;
    try {
      var t = e && e.target;
      if (t && t.closest) {
        // Lascia scorrere il contenuto interno degli sheet/dialog.
        if (
          t.closest(
            ".vc-staff-stat-sheet__body, .vc-staff-manage-sheet__panel, .vc-staff-manage-sheet__body, .vc-staff-datepicker.is-sheet, .vc-notif-panel-body, .vc-notif-list, .vc-dialog__text, .vc-dialog__field, .vc-dash-confirm__text, .vc-mobile-nav-drawer__scroll",
          )
        ) {
          return;
        }
        // Peer dock / backdrop: mai far passare lo scroll alla pagina.
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
    // Su telefono i listener touchmove non-passive congelano TUTTI i click (3–10s).
    try {
      if (isCoarsePointerDevice() || isStandalonePwaLocal()) enable = false;
    } catch (eCoarseBind) {
      enable = false;
    }
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
    // Non-passive touchmove lagga lo scroll mobile: usalo SOLO per overlay full-page /
    // lock veri. Per sheet staff/notif basta pinPageScroll (overflow/fixed), senza
    // preventDefault globale su ogni touchmove.
    try {
      if (isBlockingLoaderVisible()) return true;
      if (isLoaderScrollLocked()) return true;
      var root = document.documentElement;
      if (root.classList.contains("vc-dialog-open")) return true;
      if (root.classList.contains("vc-dash-confirm-open")) return true;
      // vc-mobile-nav-open: NON usare touchmove non-passive / touch-action:none
      // (rompe i tap sulle voci del menu su telefono).
      // Mai non-passive touchmove per sola session-verify su telefono.
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

    // Always reconcile pin state — re-apply styles even if already pinned (iOS can drop them).
    // Soft pin per sheet/notif (needGuards=false): overflow lock senza touch-action:none.
    // Menu hamburger: soft SEMPRE — touch-action:none sul body uccide i tap sui tile (Android/iOS).
    // pwaHardFreeze1: telefono/PWA soft SEMPRE (anche con loader): hard pin = freeze totale.
    var softPin = !needGuards;
    try {
      if (document.documentElement.classList.contains("vc-mobile-nav-open")) softPin = true;
    } catch (eSoftNav) {}
    try {
      if (isCoarsePointerDevice() || isStandalonePwaLocal()) softPin = true;
    } catch (eSoftPhone) {
      softPin = true;
    }
    if (frozen) pinPageScroll({ soft: softPin });
    else if (scrollPinned) unpinPageScroll();

    // touchmove non-passive SOLO mentre serve (come vc-ptr): altrimenti lagga tutto lo scroll mobile.
    // Mai per il menu hamburger (i tile devono restare cliccabili).
    var guardsForBind = needGuards;
    try {
      if (document.documentElement.classList.contains("vc-mobile-nav-open")) guardsForBind = false;
    } catch (eGuardNav) {}
    try {
      if (isCoarsePointerDevice() || isStandalonePwaLocal()) guardsForBind = false;
    } catch (eGuardPhone) {
      guardsForBind = false;
    }
    bindLoaderScrollGuards(guardsForBind);

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
    try {
      document.documentElement.classList.toggle("vc-loading-scroll-lock", on);
    } catch (eLock) {}
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
        "vc-notif-overlay-active",
      );
    } catch (e1) {}
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
    // Su telefono NON osservare subtree del body: ogni rebuild menu/DOM
    // rieseguiva syncLoaderScrollLock e bloccava i tap.
    var coarseMo = false;
    try {
      coarseMo =
        (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
        Number(navigator.maxTouchPoints || 0) > 0;
    } catch (eMoC) {}
    if (!coarseMo && document.body) {
      // homeFreeze1: NON osservare class sul subtree (ogni is-in/rise esplodeva syncLoader).
      loaderClassMo.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["hidden"],
      });
    }
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
      if (n) return n;
    } catch (eAuth) {}
    return "Vinili & Caffè";
  }

  /** Delegato a vc-page-title.js: sempre "Vinili & Caffè | <pagina>". */
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
    // Se la pagina ha cambiato titolo (navigazione SPA / i18n), aggiorna la base.
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

  /** Formato tab/PWA: sempre "(2) Vinili & Caffè | <pagina>" (mai brand con trattino). */
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
      // Titolo potrebbe essere stato resettato da altro script: ripristina se serve.
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

  // Allinea subito il titolo al formato unico Brand | Pagina (anche in PWA).
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
  /** Notifiche solo-client (login, welcome, …) da non cancellare al sync server. */
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
  function isFilteredNotif(n) {
    return Boolean(n && n.filtered);
  }
  function rows() {
    var s = loadStored();
    var uid = normalizeUserId(currentUserId);
    var dismissed = loadDismissedSet(uid);
    s = s.filter(function (n) {
      return !isClearedAwayServerRow(n, dismissed) && !isFilteredNotif(n);
    });
    return ephemeralDemo ? [ephemeralDemo].concat(s) : s;
  }
  function iconClass(kind) {
    if (kind === "vote") return "fa-trophy";
    if (kind === "vote_reminder") return "fa-clock-o";
    if (kind === "success") return "fa-check-circle";
    if (kind === "review") return "fa-star";
    if (kind === "mod") return "fa-shield";
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
    seeAll.href = notificationsPageUrl();
    seeAll.setAttribute("aria-label", tUi("notif.seeAll", null, "Vedi tutte le notifiche"));
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
    sub.textContent =
      window.VcI18n && typeof window.VcI18n.t === "function"
        ? window.VcI18n.t("notif.unread", { n: unread })
        : unread + " non lette";
    if (all.length > 0) root.classList.add("vc-notif-dropdown--has-items");
    else root.classList.remove("vc-notif-dropdown--has-items");
    syncPushPromptUi();
    if (!force && sig === lastNotifRenderSig) return;
    lastNotifRenderSig = sig;
    bindClearAllButton();
    listEl.innerHTML = "";
    all.forEach(function (n) {
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
      listEl.appendChild(li);
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
    render();
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
    render();
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
      // Coalesce burst di push: aggiorna campanella subito dopo l’OS notification.
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
            scheduleInboxSyncFromPush();
            return;
          }
          rememberRecentOsPush(String(p.id || "").trim());
          rememberRecentOsPush(String(p.messageId || "").trim());
          rememberRecentOsPush(String(p.ticketId || "").trim());
          var pushNotifId = String(p.id || "").trim();
          if (pushNotifId) rememberToastedId(pushNotifId);
          setPushSubActive(true);
          // Non aspettare WS/poll (60s): la push è già arrivata su questo browser.
          scheduleInboxSyncFromPush();
          if (isWatchingTicketChat(p.ticketId, p.openUrl)) {
            var seenId = String(p.id || "").trim();
            if (seenId) {
              rememberClickRead(seenId);
              tryFlushClickReads();
            }
            return;
          }
          // Suono solo dalla tab in focus: altrimenti OS push + WebAudio = doppio,
          // e N tab aperte = N suoni.
          try {
            if (document.visibilityState === "visible" && document.hasFocus()) {
              playNotifSound();
              pulseNotifSummary();
            }
          } catch (eSound) {}
          return;
        }
        if (data.type === "vc:push-resubscribe") {
          refreshPushSubscriptionState().then(function (ok) {
            if (!ok) syncPushPromptUi();
          });
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
            // Cambia anche la query: serve un reload per allineare lo stato.
            window.location.href =
              dest.pathname +
              "?view=staff" +
              (ticketId ? "&ticketId=" + encodeURIComponent(ticketId) + "#" + ticketId : "");
            return;
          }
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
    // Con Web Push attivo lo SW mostra già la notifica OS.
    // Un secondo showNotification dal sync WS = doppione su PWA/PC.
    if (pushSubActive === true) return false;
    try {
      if (
        pushSubActive !== false &&
        "serviceWorker" in navigator &&
        navigator.serviceWorker.controller &&
        typeof Notification !== "undefined" &&
        Notification.permission === "granted"
      ) {
        // Stato push ancora sconosciuto: meglio non rischiare il doppione.
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
    // Stesso schema tag dello SW, così un eventuale secondo show sostituisce invece di duplicare.
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
      icon: "/images/vc-server-icon.png",
      badge: "/images/vc-server-icon.png",
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
    // Cross-tab: una sola tab suona (localStorage condiviso).
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
        // Doppio “ping” tipo Instagram: udibile ma non aggressivo.
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
    var rw = Math.min(320, Math.max(240, window.innerWidth - 24));
    root.style.width = rw + "px";
    root.style.top = Math.round(Math.max(12, (window.__vcSafeTop || 0) + 12)) + "px";
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
      // Telefoni in landscape (>640px) altrimenti aprono il dropdown “desktop”
      // dentro la pillola header → campanella/sheet rotti (specie homepage).
      return window.matchMedia(
        "(max-width: 639.98px), ((pointer: coarse) and (max-width: 920px))",
      ).matches;
    } catch (e) {
      return (window.innerWidth || 999) <= 640;
    }
  }

  var notifPortalGuardUntil = 0;
  var notifPortalSyncing = false;

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

  /** Riporta la campanella in #header-quick-actions (a sinistra dell'hamburger). */
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

  /** Chiude lo sheet mobile e riporta la campanella in navbar (tipico dopo back / bfcache). */
  function repairNotifDropdownPortal() {
    var dd = document.getElementById("vc-notif-dropdown");
    if (!dd) return;
    notifPortalGuardUntil = 0;
    try {
      dd.open = false;
      dd.removeAttribute("open");
    } catch (eClose) {}
    try {
      document.documentElement.classList.remove(
        "vc-notif-dropdown-open",
        "vc-notif-sheet-open",
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
    // notifUnpin1: repair toglie le classi ma senza sync il body resta position:fixed.
    try {
      if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
    } catch (eLockRepair) {}
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
      // Safari/iOS: spostare un <details open> nel DOM lo chiude; riforziamo subito + rAF.
      function forceOpen() {
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
    setNotifHeaderSlotHold(false);
    ensureNotifDropdownInHeader(true);
  }

  function syncNotifMobileSheetChrome() {
    if (notifPortalSyncing) return;
    var dd = document.getElementById("vc-notif-dropdown");
    if (!dd) return;
    var root = document.documentElement;
    var mobile = isMobileNotifViewport();
    // Ignora il toggle "close" spurio subito dopo il portal su body.
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
        try {
          if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
        } catch (eLock) {}
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
        // Safety: se lo sheet è chiuso la campanella deve restare nella navbar.
        if (!dd.open) ensureNotifDropdownInHeader(true);
      }
      syncGlobalNotifOverlayClass();
      // notifUnpin1: anche in CHIUSURA va ripristinato lo scroll (prima solo all'open).
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
  var pushSubscribeInFlight = false;
  /** null = non ancora controllato, true = push attiva, false = non attiva */
  var pushSubActive = null;
  var refreshPushInFlight = null;
  var lastPostedPushEndpoint = "";
  var lastPostedPushAt = 0;
  var lastPushErrorHint = "";
  var PUSH_RESYNC_MIN_MS = 10 * 60 * 1000;
  var cachedPushReg = null;
  var cachedVapidPublicKey = "";
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
    if (pushAutoRecoverDone || pushSubscribeInFlight) return;
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
    if (wasPushPromptDismissed()) return false;
    // Già attivate una volta: Brave le azzera, le recuperiamo al click senza nagarle.
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
      if (!key) return true; // browser non espone la key → non forzare unsubscribe
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
    return fetch(resolvedSiteNotificationsPushUrl("vapid-public-key"), {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
    })
      .then(function (r) {
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
      });
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
    return fetch(resolvedSiteNotificationsPushUrl("subscribe"), {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      credentials: "omit",
      body: JSON.stringify({ subscription: json }),
    })
      .then(function (r) {
        try {
          console.warn("[vc-push] subscribe POST", r && r.status);
        } catch (eSt) {}
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
      });
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
      enableEl.disabled = Boolean(isIosLikeDevice() && !isStandalonePwa()) || pushSubscribeInFlight;
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
    // Dal click: subscribe() subito (è lui che apre “Consenti”).
    // getSubscription() / requestPermission() prima bruciano il gesto su Chrome/Brave Windows.
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
          return postPushSubscription(sub, opts).then(function (ok) {
            pushSubActive = ok === true;
            if (ok) rememberPushOk();
            return ok === true;
          });
        });
      })
      .catch(function () {
        pushSubActive = false;
        return false;
      })
      .then(function (ok) {
        refreshPushInFlight = null;
        return ok;
      });
    return refreshPushInFlight;
  }
  function recreateGrantedPush() {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") {
      return Promise.resolve(false);
    }
    if (pushSubscribeInFlight) return Promise.resolve(false);
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
  /** Crea/ripara la subscription. Su Chrome/Brave Windows `subscribe()` deve partire dal click, senza requestPermission() prima. */
  function subscribeWebPushNative(opts) {
    var fromGesture = opts && opts.fromGesture === true;
    if (!webPushSupported()) return Promise.resolve(false);
    if (!normalizeUserId(currentUserId) || !getDiscordAccessToken()) return Promise.resolve(false);
    if (isIosLikeDevice() && !isStandalonePwa()) return Promise.resolve(false);
    if (typeof Notification !== "undefined" && Notification.permission === "denied") {
      return Promise.resolve(false);
    }
    // Senza click: riallinea la sub esistente; se Brave l’ha droppata ma il permesso c’è, ricreala.
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
    if (pushSubscribeInFlight) return Promise.resolve(false);

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
      if (!publicKey) throw new Error("vapid_missing");
      markNativePushAsked();
      return createOrRepairPushSubscription(reg, publicKey, { fromGesture: true }).then(finishSub);
    }

    pushSubscribeInFlight = true;
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
        pushSubscribeInFlight = false;
        setPushSubActive(true);
        syncPushPromptUi();
        return true;
      })
      .catch(function (err) {
        try {
          console.warn("[vc-push] subscribe error", err && err.message ? err.message : err);
        } catch (eLog) {}
        lastPushErrorHint = describePushError(err);
        pushSubscribeInFlight = false;
        setPushSubActive(false);
        syncPushPromptUi();
        return false;
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
    subscribeWebPushNative().then(function () {
      syncPushPromptUi();
    });
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
        // Poll resta attivo anche con WS (backup se realtime non arriva).
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
            var ok = Boolean(j && (j.updated === true || Number(j.modified) > 0 || j.ok === true));
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
    return {
      id: String(row.id || "").trim(),
      title: String((row && row.title) || ""),
      body: String((row && row.body) || ""),
      at: atMs,
      read: Boolean(row.read === true || row.readAt),
      kind: kind,
      openUrl: openUrl,
      ticketId: ticketId,
      filtered: Boolean(row && row.filtered),
    };
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
      // Prima solo auto: → sparivano "Login effettuato" (sys:login_*) al primo sync.
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
      // Preferisci "voto completato" rispetto a un promemoria più vecchio nella stessa sync.
      if (!toastRow || fr.kind === "vote") {
        toastRow = candidate;
        if (fr.kind === "vote") break;
      }
    }
    return { toastRow: toastRow, changed: changed };
  }
  function syncSiteNotificationsFromServer() {
    var token = getDiscordAccessToken();
    var uid = normalizeUserId(currentUserId);
    if (!token || !uid) return;
    var url = resolvedSiteNotificationsUrl();
    if (!url) return;
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
        opts.headers = window.VcPerf.apiHeaders(opts.headers);
      }
      if (window.VcPerf && typeof window.VcPerf.notificationsLimit === "function") {
        var lim = window.VcPerf.notificationsLimit(50);
        url += (url.indexOf("?") >= 0 ? "&" : "?") + "limit=" + encodeURIComponent(String(lim));
        if (window.VcPerf.isLite && window.VcPerf.isLite()) url += "&lite=1&perf=lite";
        else if (window.VcPerf.tier && window.VcPerf.tier() === "mid") url += "&perf=mid";
      }
    } catch (ePerfN) {}
    if (ctrl) opts.signal = ctrl.signal;
    fetch(url, opts)
      .then(function (r) {
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
        if (mergeResult.toastRow) {
          var toastId = String(mergeResult.toastRow.id || "").trim();
          var skipToast =
            (toastId && wasAlreadyToasted(toastId)) || recentlyGotOsPush(mergeResult.toastRow);
          if (skipToast) {
            /* già push/toast: non ripeti suono/OS dopo SW update o re-sync */
            if (toastId) rememberToastedId(toastId);
          } else {
            if (toastId) rememberToastedId(toastId);
            playNotifSound();
            showNativeOsBanner(mergeResult.toastRow);
            try {
              showNotifFlyToast(mergeResult.toastRow);
            } catch (eFlySync) {}
            pulseNotifSummary();
          }
        }
      })
      .catch(function () {})
      .finally(function () {
        try {
          if (tid) clearTimeout(tid);
        } catch (e1) {}
      });
  }
  function siteNotifsPollDelayMs() {
    try {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return SITE_NOTIFS_POLL_HIDDEN_MS;
      }
    } catch (e) {}
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
    syncSiteNotificationsFromServer();
    if (pushSubActive !== true) syncExistingWebPushSubscription();
    // Sempre poll di backup: con SITE_API_EXTERNAL il WS può aprirsi sul processo sbagliato.
    restartSiteNotifsPollTimer();
    var wsUrl = siteRealtimeWsUrl();
    var rs = siteRealtimeWs ? siteRealtimeWs.readyState : 3;
    if (wsUrl && rs !== 0 && rs !== 1) connectSiteRealtimeWebSocket();
  }
  var notifSheetResizeWired = false;
  var notifSheetEscWired = false;

  function wireNotifMobileSheet() {
    var dd = document.getElementById("vc-notif-dropdown");
    if (!dd) return false;
    // Su /staff la campanella nasce dopo init (staff-site-nav): riaggancia se manca.
    if (!dd.__vcNotifSheetWired) {
      dd.__vcNotifSheetWired = true;
      dd.addEventListener("toggle", function () {
        syncNotifMobileSheetChrome();
        if (dd.open) {
          markAllReadOnBellOpen();
          syncPushPromptUi();
          maybeAskNativePush();
        } else {
          syncPushPromptUi();
          ensureNotifDropdownInHeader(true);
        }
      });
    }
    if (!notifSheetResizeWired) {
      notifSheetResizeWired = true;
      window.addEventListener("resize", function () {
        if (!isMobileNotifViewport()) syncNotifMobileSheetChrome();
        var liveDd = document.getElementById("vc-notif-dropdown");
        if (!liveDd || !liveDd.open) ensureNotifDropdownInHeader(true);
      });
      window.addEventListener("pageshow", function () {
        repairNotifDropdownPortal();
      });
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible") repairNotifDropdownPortal();
      });
    }
    if (!notifSheetEscWired) {
      notifSheetEscWired = true;
      document.addEventListener("keydown", function (ev) {
        if (ev.key !== "Escape") return;
        var live = document.getElementById("vc-notif-dropdown");
        if (!isMobileNotifViewport() || !live || !live.open) return;
        live.removeAttribute("open");
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
        dd.removeAttribute("open");
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
    if (!had) return;
    lastNotifRenderSig = "";
    render({ force: true });
    if (normalizeUserId(currentUserId) && getDiscordAccessToken()) {
      scheduleSiteNotificationsPolling();
    }
  }

  function init() {
    ensureSiteNotifDropdown();
    setCurrentUser(window.__VC_DISCORD_PROFILE || null);
    wirePushNotifMarkRead();
    wirePushPermissionWatch();
    wirePushAutoRecover();
    consumePendingNavFromSwCache();
    startPendingNavPoll();
    wireSwClientFocusPing();
    flushPendingReadsToServer();
    tryFlushClickReads();
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
        repairNotifDropdownPortal();
        window.location.href = notificationsPageUrl();
      });
    }
    window.addEventListener("vc:staff-access-ok", ensureStaffLateNotifUi);
    window.addEventListener("vc:staff-notif-ready", ensureStaffLateNotifUi);
    window.vcNotify = { add: addNotif, refresh: render, clearAll: clearAll };
    flushPendingLoginNotification();
    scheduleSiteNotificationsPolling();
    syncPushPromptUi();
    if (webPushSupported()) {
      prefetchPushPrereqs().then(function () {
        if (normalizeUserId(currentUserId) && getDiscordAccessToken()) {
          syncExistingWebPushSubscription();
        }
      });
    } else if (normalizeUserId(currentUserId) && getDiscordAccessToken()) {
      syncExistingWebPushSubscription();
    }
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
  // Evita che vc-mobile-nav.js (caricato dopo) reinizializzi drawer/toggle in conflitto.
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
    // Mai ripristinare il focus sull'hamburger mentre si naviga: su telefono
    // focus() durante il click annulla la navigazione del <a href>.
    if (!opts.skipFocusRestore && focusPrev && typeof focusPrev.focus === "function") {
      try {
        focusPrev.focus();
      } catch (e1) {}
    }
    focusPrev = null;
  }

  /** Click su tile menu: chiudi drawer e naviga in modo affidabile su touch. */
  function onMobileNavTileClick(ev, a) {
    if (!a) return;
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
      window.location.assign(abs);
    } catch (eAssign) {
      try {
        window.location.href = abs;
      } catch (eHref2) {}
    }
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
    // Apri SUBITO: rebuild griglia/footer dopo il paint (prima bloccava 1–3s al tap).
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
    if (!u || !u.id) return "";
    if (u.avatar) {
      var ext = String(u.avatar).indexOf("a_") === 0 ? "gif" : "png";
      return "https://cdn.discordapp.com/avatars/" + u.id + "/" + u.avatar + "." + ext + "?size=64";
    }
    if (typeof BigInt === "undefined") return "";
    try {
      var bi = BigInt(String(u.id));
      var idx = Number((bi >> 22n) % 6n);
      return "https://cdn.discordapp.com/embed/avatars/" + idx + ".png";
    } catch (e4) {
      return "";
    }
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

  function syncDrawerFooter() {
    var foot = document.getElementById("vc-mobile-nav-drawer-footer");
    if (!foot) return;
    foot.innerHTML = "";
    var profile = window.__VC_DISCORD_PROFILE;
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
    if (pendingShell || (hasToken && !profile)) {
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
    // Profilo presente = loggato (logoutBtn può mancare se lo stato header è ancora in rendering).
    if (profile && (hasToken || logoutBtn || profile.id)) {
      var wrap = document.createElement("div");
      wrap.className = "vc-mobile-nav-footer__account";
      var imgUrl = mobileAvatarUrl(profile);
      var name =
        String(profile.global_name || profile.username || "Utente").trim() || "Utente";
      var who = document.createElement("div");
      who.className = "vc-mobile-nav-footer__who";
      var left = document.createElement("div");
      left.className = "vc-mobile-nav-footer__account-start";
      if (imgUrl) {
        var im = document.createElement("img");
        im.className = "vc-mobile-nav-footer__avatar";
        im.src = imgUrl;
        im.alt = "";
        im.width = 40;
        im.height = 40;
        im.decoding = "async";
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
        else if (typeof window.__vcDiscordClearToken === "function") {
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
      var b = document.createElement("button");
      b.type = "button";
      b.className = "vc-mobile-nav-footer__login";
      b.textContent = "Accedi con Discord";
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

  /** Navbar dedicate Hogwarts /evento: niente Area staff né blocco Guida. */
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
      if (gridRoot.querySelector('a[href*="/staff/guida"]')) return;
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
      if (isStaffGuideHref(href) || isStaffGuideLabel(lab)) {
        guideRow = row;
        break;
      }
    }
    var tile = null;
    if (guideRow) tile = createTileFromRow(guideRow);
    if (!tile && isStaffNavAllowed()) {
      var a = document.createElement("a");
      a.className = "vc-mobile-nav-tile";
      a.href = "/staff/guida/";
      a.setAttribute("data-vc-mobile-staff-guide", "1");
      a.innerHTML =
        '<span class="vc-mobile-nav-tile-ico" aria-hidden="true"><i class="fa fa-book"></i></span>' +
        '<span class="vc-mobile-nav-tile-label">Guida</span>';
      a.addEventListener("click", function (ev) {
        onMobileNavTileClick(ev, a);
      });
      tile = a;
    }
    if (!tile) return;
    var sec = document.createElement("section");
    sec.className = "vc-mobile-nav-section vc-mobile-nav-section--staff-guide";
    var h = document.createElement("h3");
    h.className = "vc-mobile-nav-section-title";
    h.textContent = "STAFF";
    var g = document.createElement("div");
    g.className = "vc-mobile-nav-grid";
    g.appendChild(tile);
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
    a.addEventListener("click", function (ev) {
      onMobileNavTileClick(ev, a);
    });
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
    // Area staff solo dal dropdown navbar, mai nel menu profilo / hamburger.
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
    a.addEventListener("click", function (ev) {
      onMobileNavTileClick(ev, a);
    });
    return a;
  }

  function markTileActive(a, source) {
    if (!a || !source) return;
    if (
      source.classList.contains("is-active") ||
      source.classList.contains("vc-snav-item--active") ||
      source.classList.contains("vc-snav-row--active") ||
      source.getAttribute("aria-current") === "page"
    ) {
      a.classList.add("is-active");
      a.setAttribute("aria-current", "page");
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
    lab.textContent = labelText;
    a.appendChild(ico);
    a.appendChild(lab);
    markTileActive(a, row);
    a.addEventListener("click", function (ev) {
      onMobileNavTileClick(ev, a);
    });
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
    lab.textContent = labelText;
    a.appendChild(ico);
    a.appendChild(lab);
    markTileActive(a, item);
    a.addEventListener("click", function (ev) {
      onMobileNavTileClick(ev, a);
    });
    return a;
  }

  function rebuildGrid() {
    var gridRoot = document.getElementById("vc-mobile-nav-drawer-grid");
    var nav = document.querySelector("nav.vc-header-snav");
    if (!gridRoot || !nav) return;
    gridRoot.innerHTML = "";
    var kids = nav.children;
    var i = 0;
    while (i < kids.length) {
      var el = kids[i];
      if (!el || el.tagName === "SPAN") {
        i += 1;
        continue;
      }
      if (el.tagName === "A" && el.classList.contains("vc-snav-item")) {
        var sec = document.createElement("section");
        sec.className = "vc-mobile-nav-section";
        var h = document.createElement("h3");
        h.className = "vc-mobile-nav-section-title";
        h.textContent = "PRINCIPALE";
        var g = document.createElement("div");
        g.className = "vc-mobile-nav-grid";
        while (i < kids.length) {
          var el2 = kids[i];
          if (!el2 || el2.tagName === "SPAN") {
            i += 1;
            continue;
          }
          if (!(el2.tagName === "A" && el2.classList.contains("vc-snav-item"))) break;
          var t = createTileFromItem(el2);
          if (t) g.appendChild(t);
          i += 1;
        }
        if (!g.children.length) continue;
        sec.appendChild(h);
        sec.appendChild(g);
        gridRoot.appendChild(sec);
        continue;
      }
      if (el.tagName === "DETAILS" && el.classList.contains("vc-snav-details")) {
        var sum = el.querySelector(".vc-snav-summary");
        var titleTxt = "MENU";
        if (sum) {
          var sp = sum.querySelector("span");
          titleTxt = sectionLabel(sp ? sp.textContent : sum.textContent);
        }
        // Area staff: niente sezione, ma tieni Guida nel hamburger.
        if (isStaffDetailsEl(el) || isStaffOnlyNavSection(titleTxt)) {
          appendStaffGuideSection(gridRoot, el);
          i += 1;
          continue;
        }
        var sec2 = document.createElement("section");
        sec2.className = "vc-mobile-nav-section";
        var h2 = document.createElement("h3");
        h2.className = "vc-mobile-nav-section-title";
        h2.textContent = titleTxt;
        var g2 = document.createElement("div");
        g2.className = "vc-mobile-nav-grid";
        var rows = el.querySelectorAll(".vc-snav-panel .vc-snav-row");
        var r;
        for (r = 0; r < rows.length; r += 1) {
          var rowEl = rows[r];
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
          var tile = createTileFromRow(rowEl);
          if (tile) g2.appendChild(tile);
        }
        if (!g2.children.length) {
          i += 1;
          continue;
        }
        sec2.appendChild(h2);
        sec2.appendChild(g2);
        gridRoot.appendChild(sec2);
      }
      i += 1;
    }
    appendStaffGuideSection(gridRoot, document.querySelector("[data-vc-staff-tools-nav], .vc-snav-details--staff"));
    // Dashboard: solo nel footer hamburger (icona), non nella griglia scroll.
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
    // Staff pages: staff-site-nav owns the hamburger (avoids open→close race).
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
    // Always re-bind to live DOM node (stale closure = silent no-op).
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
      // Single retry only — never schedule two toggles for the same click.
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
      // ptrFirstTap1: niente stopImmediatePropagation — altrimenti PTR non riceve touchend.
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
      window.addEventListener("vc-dashboard-access", function () {
        rebuildGrid();
        removeHeaderDashboardBtn();
      });
      window.addEventListener("vc-auth-session-boot", function () {
        rebuildGrid();
        removeHeaderDashboardBtn();
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
    window.setInterval(revealForbiddenSectionBooks, 30000);
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

  function applyForbiddenBooksVisibility(books, collected, options) {
    var list = mergeForbiddenCollected(collected);
    var status = forbiddenBooksRoundState || {};
    var activeIds = Array.isArray(status.bookIds) ? status.bookIds.map(String) : [];
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
      forbiddenBooksRoundState = status && status.ok === true ? status : null;
      if (status && status.ok && (status.enabled === false || forbiddenHuntEnded(status))) {
        removeAllForbiddenBooks();
        return;
      }
      proceed();
    }).catch(function () {
      forbiddenBooksRoundState = null;
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
      "/suggerimenti": "suggerimenti",
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
    var activeIds = Array.isArray(status.bookIds) ? status.bookIds.map(String) : [];
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
    return fetch(forbiddenBooksPublicStatusUrl(), { cache: "no-store" })
      .then(function (res) {
        return res.json().catch(function () {
          return {};
        });
      })
      .catch(function () {
        return {};
      });
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
        move();
      };
      window.addEventListener("resize", onViewportChange);
      if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", onViewportChange);
        window.visualViewport.addEventListener("scroll", onViewportChange);
      }
    }
  }

  function showForbiddenBookToast(count, customMessage) {
    var total = FORBIDDEN_SITE_BOOKS_TOTAL;
    var toast = document.getElementById("vc-forbidden-book-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "vc-forbidden-book-toast";
      toast.className = "vc-forbidden-book-toast";
      toast.setAttribute("role", "status");
      document.body.appendChild(toast);
    }
    toast.textContent = customMessage || ("Libro raccolto: " + Math.min(count, total) + "/" + total + " sul sito. Ricorda: 2 sono negli status dei bot.");
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
  s.src = "/js/vc-site-polish.js?v=20260830ptrFirstTap1";
  s.defer = true;
  (document.body || document.documentElement).appendChild(s);
})();

(function loadHeaderPromo() {
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
  s.src = "/js/vc-header-promo.js?v=" + vcPageAssetVer();
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

/* pwaBlack1/siteSweep1/homeFreeze1: recovery leggero — niente storm su homepage Brave */
(function () {
  if (window.__vcPwaBlackRecover) return;
  window.__vcPwaBlackRecover = true;
  var lastRecoverAt = 0;
  var recovering = false;

  function forceReveal() {
    try {
      var nodes = document.querySelectorAll(".vc-home-rise:not(.is-in)");
      var n = Math.min(nodes.length, 80);
      for (var i = 0; i < n; i++) nodes[i].classList.add("is-in");
    } catch (e0) {}
  }

  function clearPhoneHasFreezeGhosts() {
    // Solo overlay/boot fantasma che attivano :has() → touch-action:none su telefono.
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
        var br = boot.getBoundingClientRect();
        if (br.width < 8 && br.height < 8) {
          boot.hidden = true;
          boot.setAttribute("hidden", "");
        }
      }
    } catch (eBoot) {}
    // pwaHardFreeze1: togli touch-action:none / body fixed residui da pin hard.
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
        if (document.body) {
          document.body.style.removeProperty("touch-action");
        }
        try {
          if (typeof window.__vcUnpinPageScroll === "function") {
            // Se non c'è overlay vero, sblocca; altrimenti re-pin soft.
            var root = document.documentElement;
            var ddLive = document.getElementById("vc-notif-dropdown");
            var notifReallyOpen = Boolean(
              ddLive && (ddLive.open || ddLive.hasAttribute("open")) && root.classList.contains("vc-notif-sheet-open"),
            );
            if (root.classList.contains("vc-notif-sheet-open") && !notifReallyOpen) {
              try {
                root.classList.remove("vc-notif-sheet-open", "vc-notif-dropdown-open", "vc-notif-overlay-active");
              } catch (eGhostSheet) {}
            }
            var mustLock =
              root.classList.contains("vc-mobile-nav-open") ||
              notifReallyOpen ||
              root.classList.contains("vc-dialog-open") ||
              root.classList.contains("vc-staff-manage-sheet-open") ||
              root.classList.contains("vc-staff-stat-sheet-open");
            if (mustLock && typeof window.__vcPinPageScroll === "function") {
              window.__vcPinPageScroll({ soft: true });
            } else if (!mustLock) {
              window.__vcUnpinPageScroll();
            }
          }
        } catch (ePinApi) {}
      }
    } catch (eUnfreeze) {}
  }

  function forceHideStuckLoaders() {
    clearPhoneHasFreezeGhosts();
    try {
      var loaders = document.querySelectorAll(".vc-ul-loading:not([hidden])");
      for (var i = 0; i < loaders.length; i++) {
        var el = loaders[i];
        if (el.classList.contains("vc-reviews-gate")) continue;
        el.hidden = true;
        el.setAttribute("hidden", "");
      }
    } catch (eL) {}
    try {
      document.documentElement.classList.remove("vc-loading-scroll-lock");
      document.documentElement.classList.remove("vc-user-leader-pending");
      document.documentElement.classList.remove("vc-user-profile-pending");
      document.documentElement.classList.add("vc-page-cine-ready");
      document.documentElement.classList.remove("vc-page-cine-boot");
    } catch (eCls) {}
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
      if (document.querySelector(".vc-ul-loading:not([hidden])")) return false;
      if (document.querySelector(".vc-home-rise:not(.is-in)")) return false;
      return root.classList.contains("vc-page-cine-ready") || root.classList.contains("vc-home-motion-ready");
    } catch (eH) {
      return false;
    }
  }

  function recover(force) {
    if (recovering) return;
    var now = Date.now();
    if (!force && now - lastRecoverAt < 4000) return;
    if (!force && pageLooksHealthy()) {
      lastRecoverAt = now;
      return;
    }
    recovering = true;
    lastRecoverAt = now;
    try {
      var root = document.documentElement;
      root.classList.add("vc-page-cine-ready");
      root.classList.add("vc-home-motion-ready");
      root.classList.remove("vc-page-cine-boot");
    } catch (e1) {}
    forceReveal();
    clearPhoneHasFreezeGhosts();
    try {
      if (typeof window.__vcUnpinPageScroll === "function") window.__vcUnpinPageScroll();
    } catch (e2) {}
    try {
      var body = document.body;
      if (body && body.style && body.style.position === "fixed") {
        var loading = document.querySelector(".vc-ul-loading:not([hidden])");
        if (!loading) {
          body.style.removeProperty("position");
          body.style.removeProperty("top");
          body.style.removeProperty("left");
          body.style.removeProperty("right");
          body.style.removeProperty("width");
          body.style.removeProperty("overflow");
          body.style.removeProperty("inset");
        }
      }
    } catch (e3) {}
    recovering = false;
  }

  function arm() {
    recover(true);
    window.setTimeout(function () {
      recover(false);
    }, 1200);
    window.setTimeout(clearPhoneHasFreezeGhosts, 400);
    window.setTimeout(clearPhoneHasFreezeGhosts, 1800);
    window.setTimeout(forceHideStuckLoaders, 8000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", arm);
  } else {
    arm();
  }
  window.addEventListener("pageshow", function (ev) {
    recover(Boolean(ev && ev.persisted));
    clearPhoneHasFreezeGhosts();
  });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") {
      recover(true);
      clearPhoneHasFreezeGhosts();
    }
  });
  window.addEventListener("focus", function () {
    try {
      var stand =
        (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
        Boolean(navigator.standalone);
      if (stand) {
        recover(true);
        clearPhoneHasFreezeGhosts();
      }
    } catch (eFocusRec) {}
  });
})();

