/* wave2: thin public chrome entry (pages without vc-landing.js) */
(function () {
  var VER = "20260930chromeNotifBoot1";
  if (window.__VC_SITE_CHROME_JS === VER) return;
  window.__VC_SITE_CHROME_JS = VER;

  /* chromeNotifBoot1: stesse pagine chrome-only (wiki/staff/faq/…) caricavano
     vc-site-chrome ma NON vc-landing.js → niente chunk notif → badge/push morti.
     Stesso loader di vc-landing.js (guard condivide __vcLandingNotif*). */
  (function bootNotifChunkFromChrome() {
    var NOTIF_CHUNK_VER = "20261003notifReadDismissOs1";
    function loadNotifChunk() {
      if (window.__vcLandingNotifLoading || window.__vcLandingNotifReady) return;
      window.__vcLandingNotifLoading = 1;
      var s = document.createElement("script");
      s.src = "/js/vc-landing-notif." + NOTIF_CHUNK_VER + ".js";
      s.async = true;
      s.onload = function () {
        try {
          window.__vcLandingNotifReady = 1;
        } catch (e0) {}
      };
      (document.body || document.documentElement).appendChild(s);
    }
    function wantsFastNotifBoot() {
      try {
        var u = new URL(location.href);
        if (u.searchParams.get("vcNotifRead")) return true;
        if (u.searchParams.get("ticketId")) return true;
        if (u.searchParams.get("vc_from_push")) return true;
        if (/^[a-f0-9]{24}$/i.test(String(u.hash || "").replace(/^#/, "").trim())) return true;
      } catch (e) {}
      return false;
    }
    function schedule() {
      var run = function () {
        loadNotifChunk();
      };
      if (wantsFastNotifBoot()) {
        run();
        return;
      }
      var delay = 160;
      try {
        if (localStorage.getItem("vc_discord_access_token")) delay = 100;
      } catch (e1) {}
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(run, { timeout: Math.max(400, delay + 200) });
      } else {
        window.setTimeout(run, delay);
      }
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", schedule, { once: true });
    } else {
      schedule();
    }
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
  })();

  function isSiteHost(host) {
    try {
      var h = String(host || "").toLowerCase();
      return (
        !h ||
        h === "www.viniliecaffe.it" ||
        h === "viniliecaffe.it" ||
        h === "discord.viniliecaffe.gg" ||
        h === location.hostname.toLowerCase()
      );
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
    if (a.classList && (a.classList.contains("vc-snav-item") || a.classList.contains("vc-snav-row")))
      return false;
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
      "a.vc-snav-item.vc-header-site-name, a.vc-snav-row.vc-header-site-name"
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
          var badPath =
            String(new URL(cleaned, window.location.href).pathname || "/").replace(/\/+$/, "") ||
            "/";
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

  var CONSENT_KEY = "vc_cookie_consent";
  var CONSENT_COOKIE = "vc_cookie_consent";
  var CONSENT_KEY_LEGACY = "vc_cookie_banner_ack_v3";
  var CONSENT_PENDING_KEY = "vc_cookie_consent_pending";
  var DISCORD_ACCESS_TOKEN_KEY = "vc_discord_access_token";
  var DISCORD_EXPIRES_AT_KEY = "vc_discord_expires_at";

  function cookieDomainSuffixForConsent() {
    try {
      var h = String(location.hostname || "").toLowerCase();
      if (!h || h === "localhost" || h === "127.0.0.1" || h === "[::1]") return "";
      if (h === "viniliecaffe.it" || h.endsWith(".viniliecaffe.it")) return "; Domain=.viniliecaffe.it";
    } catch (e) {}
    return "";
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

  function showCookieRejectDenied() {
    var body = "Per scegliere «Solo essenziali» serve VIP (o VIP+) oppure Double Booster.";
    try {
      if (window.VcSiteToast && typeof window.VcSiteToast.show === "function") {
        window.VcSiteToast.show(body, true);
        return;
      }
    } catch (eT) {}
    try {
      window.alert(body);
    } catch (eA) {}
  }

  function fetchCookieRejectEligibility() {
    var token = getDiscordAccessTokenForCookies();
    if (!token) return Promise.resolve({ ok: false, canReject: false, missingToken: true });
    return fetch("/webhooks/site-cookie-consent", {
      method: "GET",
      headers: { Authorization: "Bearer " + token, Accept: "application/json" },
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

  function requireDiscordLoginForCookies(choice) {
    if (hasDiscordLoginForCookies()) return true;
    rememberPendingCookieChoice(choice);
    try {
      if (window.VcLoginRequired && typeof window.VcLoginRequired.require === "function") {
        return window.VcLoginRequired.require({
          title: "Login richiesto",
          body: "Accedi con Discord per accettare o rifiutare i cookie.",
        });
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

  function closeCookieBanner(root) {
    if (!root) return;
    root.classList.add("vc-necessity-banner--leaving");
    window.setTimeout(function () {
      if (root && root.parentNode) root.parentNode.removeChild(root);
    }, 220);
  }

  function applyAnalyticsConsent(granted) {
    try {
      if (typeof window.gtag === "function") {
        window.gtag("consent", "update", {
          analytics_storage: granted ? "granted" : "denied",
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
  }

  function applyPendingCookieChoiceAfterLogin() {
    if (!hasDiscordLoginForCookies()) return Promise.resolve(false);
    if (hasCookieChoice()) {
      clearPendingCookieChoice();
      return Promise.resolve(false);
    }
    var pending = readPendingCookieChoice();
    if (!pending) return Promise.resolve(false);
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
      showCookieRejectDenied();
      return false;
    });
  }

  function isLegalCookiePage() {
    try {
      var p = String(location.pathname || "").replace(/\/+$/, "") || "/";
      return (
        p === "/cookie" ||
        p === "/cookie/" ||
        p === "/privacy" ||
        p === "/privacy/" ||
        p === "/terms" ||
        p === "/terms/" ||
        p === "/dati" ||
        p === "/dati/"
      );
    } catch (e) {
      return false;
    }
  }

  function initCookieConsent() {
    if (isLegalCookiePage()) return;
    applyPendingCookieChoiceAfterLogin().then(function (applied) {
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
        var link = document.querySelector('a[href*="/cookie"]');
        var href = link && link.getAttribute("href");
        if (href && href.charAt(0) === "/") cookiePolicyUrl = href;
      } catch (e1) {}

      var root = document.createElement("section");
      root.id = "vc-necessity-banner";
      root.className = "vc-necessity-banner";
      root.setAttribute("aria-label", "Avviso utilizzo cookie");
      root.innerHTML =
        '<div class="vc-necessity-banner__pill" role="dialog" aria-modal="false" aria-labelledby="vc-necessity-text">' +
        '<p id="vc-necessity-text" class="vc-necessity-banner__text">' +
        'Usa <a class="vc-necessity-banner__policy" href="' +
        cookiePolicyUrl +
        '">cookie essenziali</a> e Analytics. ' +
        '<a class="vc-necessity-banner__policy" href="' +
        cookiePolicyUrl +
        '">Cookie Policy</a>.' +
        "</p>" +
        '<p class="vc-necessity-banner__login-hint">Per accettare serve il login Discord. Per rifiutare: VIP o Double Booster.</p>' +
        '<div class="vc-necessity-banner__actions">' +
        '<button type="button" class="vc-necessity-banner__reject" data-vc-necessity-reject>Solo essenziali</button>' +
        '<button type="button" class="vc-necessity-banner__accept" data-vc-necessity-confirm>Accetta</button>' +
        "</div>" +
        "</div>";
      root.removeAttribute("style");

      function dismissFromUserAction(ev, choice) {
        if (ev) {
          ev.preventDefault();
          ev.stopPropagation();
        }
        if (!requireDiscordLoginForCookies(choice)) return;
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
          showCookieRejectDenied();
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

  window.addEventListener("pageshow", function () {
    applyPendingCookieChoiceAfterLogin();
  });
  window.addEventListener("vc-discord-profile", function () {
    applyPendingCookieChoiceAfterLogin();
  });

  /* snavDropExclusive1: accordion snav (un solo dropdown) + close outside */
  function ensureSnavExclusiveAndOutsideClose() {
    if (window.__VC_SNAV_OUTSIDE_CLOSE === "20260922snavDropExclusive1") return;
    window.__VC_SNAV_OUTSIDE_CLOSE = "20260922snavDropExclusive1";
    window.__VC_SNAV_EXCLUSIVE_CHROME = "20260922snavDropExclusive1";
    function isHeaderSnavDetails(el) {
      if (!el || String(el.tagName || "").toUpperCase() !== "DETAILS") return false;
      if (!el.classList || !el.classList.contains("vc-snav-details")) return false;
      try {
        if (el.closest("#vc-mobile-nav-drawer, .vc-mobile-nav-drawer, details.vc-mobile-nav-section")) {
          return false;
        }
      } catch (eM) {}
      try {
        return Boolean(el.closest("header, .vc-header-bar, nav.vc-header-snav"));
      } catch (eH) {
        return false;
      }
    }
    function getHeaderSnavDetails() {
      return document.querySelectorAll(
        "header details.vc-snav-details, .vc-header-bar details.vc-snav-details, nav.vc-header-snav details.vc-snav-details",
      );
    }
    function stampExclusiveName() {
      getHeaderSnavDetails().forEach(function (d) {
        if (!isHeaderSnavDetails(d)) return;
        try {
          d.setAttribute("name", "vc-header-snav");
        } catch (eN) {}
      });
    }
    function closeOtherHeaderSnav(except) {
      getHeaderSnavDetails().forEach(function (other) {
        if (!isHeaderSnavDetails(other)) return;
        if (other !== except) other.open = false;
      });
    }
    function closeOpenHeaderMenus() {
      try {
        getHeaderSnavDetails().forEach(function (d) {
          if (isHeaderSnavDetails(d) && d.open) d.open = false;
        });
      } catch (eS) {}
      try {
        if (Date.now() < Number(window.__vcNotifOpenGraceUntil || 0)) {
          /* notifAutoCloseFix1: non chiudere la bell durante grace */
        } else if (window.VcNotifChrome && typeof window.VcNotifChrome.close === "function") {
          window.VcNotifChrome.close(document.getElementById("vc-notif-dropdown"));
        } else {
          var n = document.getElementById("vc-notif-dropdown");
          if (n && n.open) n.open = false;
        }
      } catch (eN) {}
      try {
        if (window.VcI18n && typeof window.VcI18n.closeLangMenu === "function") {
          window.VcI18n.closeLangMenu();
        }
      } catch (eL) {}
    }
    stampExclusiveName();
    document.addEventListener(
      "toggle",
      function (ev) {
        var d = ev.target;
        if (!isHeaderSnavDetails(d) || !d.open) return;
        stampExclusiveName();
        closeOtherHeaderSnav(d);
      },
      true,
    );
    document.addEventListener(
      "click",
      function (ev) {
        var t = ev.target;
        if (!t || !t.closest) return;
        var sum = t.closest("summary.vc-snav-summary");
        if (!sum) return;
        try {
          if (sum.closest("#vc-mobile-nav-drawer, .vc-mobile-nav-drawer, details.vc-mobile-nav-section")) {
            return;
          }
        } catch (eSkip) {}
        var det = sum.closest("details.vc-snav-details");
        if (!isHeaderSnavDetails(det)) return;
        /* discord-auth already owns exclusive click with preventDefault */
        if (window.__VC_SNAV_EXCLUSIVE) {
          stampExclusiveName();
          return;
        }
        ev.preventDefault();
        var willOpen = !det.open;
        getHeaderSnavDetails().forEach(function (other) {
          if (!isHeaderSnavDetails(other)) return;
          other.open = willOpen && other === det;
        });
      },
      true,
    );
    document.addEventListener(
      "pointerdown",
      function (ev) {
        if (typeof ev.button === "number" && ev.button !== 0) return;
        var t = ev.target;
        if (!t || !t.closest) return;
        try {
          if (
            t.closest(
              "summary.vc-snav-summary, .vc-snav-panel, summary.vc-notif-summary, .vc-notif-panel, .vc-notif-summary, .discord-account-menu, .vc-lang-dropdown, #vc-mobile-nav-drawer, .vc-mobile-nav-drawer, #vc-mobile-nav-toggle, .vc-mobile-nav-toggle",
            )
          ) {
            return;
          }
        } catch (eIn) {
          return;
        }
        closeOpenHeaderMenus();
      },
      true,
    );
    try {
      var barEl = document.querySelector(".vc-header-bar");
      if (barEl) barEl.setAttribute("data-vc-snav-accordion", "20260922snavDropExclusive1");
    } catch (eFlag) {}
  }

  function boot() {
    repairBrokenHomeLinks();
    initCookieConsent();
    ensureSnavExclusiveAndOutsideClose();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
  window.addEventListener("pageshow", function () {
    repairBrokenHomeLinks();
  });
})();
