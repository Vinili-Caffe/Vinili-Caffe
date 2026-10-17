(function () {
  if (window.__VC_ACCESS_PENDING_BOOT) return;
  window.__VC_ACCESS_PENDING_BOOT = true;

    try {
    if (typeof window.__vcPhoneRootUnlockInject !== "function") {
      var unlockCss =
        "@media (pointer:coarse),(max-width:920px){" +
        "html,html body,html.vc-staff-access-pending,html.vc-staff-access-pending body," +
        "html.vc-dash-access-pending,html.vc-dash-access-pending body," +
        "html.vc-session-verify-pending,html.vc-session-verify-pending body," +
        "html.vc-loading-scroll-lock,html.vc-loading-scroll-lock body{" +
        "touch-action:manipulation!important}" +
        "html body,html.vc-staff-access-pending body,html.vc-dash-access-pending body," +
        "html.vc-session-verify-pending body,html.vc-loading-scroll-lock body{" +
        "position:static!important;inset:auto!important;width:auto!important}" +
        "}";
      window.__vcPhoneRootUnlockInject = function () {
        var el = document.getElementById("vc-phone-root-unlock-css");
        if (!el) {
          el = document.createElement("style");
          el.id = "vc-phone-root-unlock-css";
          el.setAttribute("data-vc", "phoneRootUnlock1");
        }
        el.textContent = unlockCss;
        (document.head || document.documentElement).appendChild(el);
      };
    }
    window.__vcPhoneRootUnlockInject();
  } catch (ePhoneRoot) {}

  var CRITICAL_CSS_ID = "vc-access-pending-critical-css";
    var scrollLockCssDesktop =
    "html.vc-staff-access-pending:not(.vc-staff-app-revealed)," +
    "html.vc-staff-access-pending:not(.vc-staff-app-revealed) body," +
    "html.vc-staff-denied-open," +
    "html.vc-staff-denied-open body," +
    "html.vc-dash-access-pending:not(.vc-dash-access-ready)," +
    "html.vc-dash-access-pending:not(.vc-dash-access-ready) body," +
    "html.vc-session-verify-pending," +
    "html.vc-session-verify-pending body," +
    "html.vc-loading-scroll-lock," +
    "html.vc-loading-scroll-lock body," +
    "html.vc-user-leader-pending," +
    "html.vc-user-leader-pending body," +
    "html.vc-user-profile-pending," +
    "html.vc-user-profile-pending body," +
    "html.vc-rank-customize-pending," +
    "html.vc-rank-customize-pending body," +
    "html:not(.vc-hw-loading-done):has(#vc-hw-loading)," +
    "html:not(.vc-hw-loading-done):has(#vc-hw-loading) body{" +
    "overflow:hidden!important;overflow-x:hidden!important;overflow-y:hidden!important;" +
    "overscroll-behavior:none!important;height:100%!important;max-height:100dvh!important;touch-action:manipulation}" +
    "@media (hover:hover) and (pointer:fine){" +
    "html.vc-staff-access-pending:not(.vc-staff-app-revealed) body," +
    "html.vc-staff-denied-open body," +
    "html.vc-dash-access-pending:not(.vc-dash-access-ready) body," +
    "html.vc-session-verify-pending body," +
    "html.vc-loading-scroll-lock body," +
    "html.vc-user-leader-pending body," +
    "html.vc-user-profile-pending body," +
    "html.vc-rank-customize-pending body," +
    "html:not(.vc-hw-loading-done):has(#vc-hw-loading) body{" +
    "position:fixed!important;inset:0!important;width:100%!important}" +
    "}";
  var scrollLockCss = scrollLockCssDesktop;
  var criticalCss =
    scrollLockCss +
    "html.vc-staff-access-pending:not(.vc-staff-app-revealed):not(.vc-staff-denied-open) .vc-staff-app," +
    "html.vc-staff-access-pending:not(.vc-staff-app-revealed):not(.vc-staff-denied-open) body.vc-staff-area>header," +
    "html.vc-staff-access-pending:not(.vc-staff-app-revealed):not(.vc-staff-denied-open) body.vc-staff-area>main," +
    "html.vc-staff-access-pending:not(.vc-staff-app-revealed):not(.vc-staff-denied-open) body.vc-staff-area>footer," +
    "html.vc-staff-access-pending:not(.vc-staff-app-revealed):not(.vc-staff-denied-open) body.vc-staff-area .vc-blob," +
    "html.vc-staff-access-pending:not(.vc-staff-app-revealed):not(.vc-staff-denied-open):not(.vc-staff-cine-route) body.vc-staff-area .vc-home-cine," +
    "html.vc-staff-access-pending:not(.vc-staff-app-revealed):not(.vc-staff-denied-open):not(.vc-staff-cine-route) body.vc-staff-area .vc-home-scrollcue{" +
    "visibility:hidden!important;pointer-events:none!important;opacity:0!important}" +
    "html.vc-staff-access-pending:not(.vc-staff-app-revealed):not(.vc-staff-denied-open) #vc-staff-loading{" +
    "display:flex!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important}" +
    "html.vc-staff-access-pending:not(.vc-staff-app-revealed):not(.vc-staff-denied-open) #vc-staff-loading[hidden]{" +
    "display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important}" +
    "html.vc-staff-denied-open #vc-staff-loading{display:none!important}" +
    "html.vc-dash-access-pending:not(.vc-dash-access-ready) body.vc-dashboard-page>header," +
    "html.vc-dash-access-pending:not(.vc-dash-access-ready) body.vc-dashboard-page>main," +
    "html.vc-dash-access-pending:not(.vc-dash-access-ready) body.vc-dashboard-page>footer," +
    "html.vc-dash-access-pending:not(.vc-dash-access-ready) body.vc-seratafilm-page>header," +
    "html.vc-dash-access-pending:not(.vc-dash-access-ready) body.vc-seratafilm-page>main," +
    "html.vc-dash-access-pending:not(.vc-dash-access-ready) body.vc-seratafilm-page>footer," +
    "html.vc-dash-access-pending:not(.vc-dash-access-ready) body.vc-dashboard-page .vc-home-cine," +
    "html.vc-dash-access-pending:not(.vc-dash-access-ready) body.vc-seratafilm-page .vc-home-cine," +
    "html.vc-dash-access-pending:not(.vc-dash-access-ready) body.vc-dashboard-page .vc-blob," +
    "html.vc-dash-access-pending:not(.vc-dash-access-ready) body.vc-seratafilm-page .vc-blob{" +
    "visibility:hidden!important;pointer-events:none!important;opacity:0!important}" +
    /* Fullscreen opaco come le altre pagine di caricamento */
    "html.vc-dash-access-pending:not(.vc-dash-access-ready) body.vc-dashboard-page::before," +
    "html.vc-dash-access-pending:not(.vc-dash-access-ready) body.vc-dashboard-page::after{" +
    "display:none!important;content:none!important}" +
    "html.vc-dash-access-pending:not(.vc-dash-access-ready) #vc-shared-boot-overlay{" +
    "display:flex!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important;" +
    "position:fixed!important;inset:0!important;top:0!important;right:0!important;bottom:0!important;left:0!important;" +
    "z-index:110000!important;width:100vw!important;max-width:none!important;height:100dvh!important;min-height:100dvh!important;" +
    "margin:0!important;padding:1.5rem!important;align-items:center!important;justify-content:center!important;" +
    "flex-direction:column!important;box-sizing:border-box!important;border:0!important;border-radius:0!important;" +
    "overflow:hidden!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;" +
    "background-color:#0b0806!important;" +
    "background-image:radial-gradient(ellipse 92% 74% at 50% 38%,rgba(232,196,156,.16) 0%,rgba(28,20,14,.94) 52%,#0a0706 100%)!important}" +
    /* loadCardClear1: niente riquadro sotto Caricamento */
    "#vc-shared-boot-overlay .vc-ul-loading-card,#vc-shared-boot-overlay .vc-staff-loading__card," +
    "html.vc-dash-access-pending #vc-shared-boot-overlay .vc-ul-loading-card," +
    "html.vc-dash-access-pending #vc-shared-boot-overlay .vc-staff-loading__card," +
    "html.vc-staff-access-pending #vc-staff-loading .vc-staff-loading__card," +
    "html.vc-staff-access-pending #vc-staff-loading .vc-ul-loading-card{" +
    "background:transparent!important;background-image:none!important;border:0!important;box-shadow:none!important;" +
    "backdrop-filter:none!important;-webkit-backdrop-filter:none!important;padding:0!important;border-radius:0!important;" +
    "width:auto!important;max-width:min(100%,40rem)!important}" +
    "html.vc-dash-access-ready #vc-shared-boot-overlay,#vc-shared-boot-overlay[hidden]{display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important}";

  /* loadCardClear1 marker for deploy asserts */
  window.__VC_ACCESS_PENDING_BOOT_VER = "loadUnify1";

  function injectCss() {
    if (document.getElementById(CRITICAL_CSS_ID)) return;
    var style = document.createElement("style");
    style.id = CRITICAL_CSS_ID;
    style.textContent = criticalCss;
    (document.head || document.documentElement).appendChild(style);
  }

  function ensureSharedBootOverlay(opts) {
    var o = opts || {};
    var el = document.getElementById("vc-shared-boot-overlay");
    if (!el) {
      el = document.createElement("div");
      el.id = "vc-shared-boot-overlay";
      el.className = "vc-ul-loading vc-staff-loading";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      el.setAttribute("data-vc-loader-blocking", "1");
      el.setAttribute("data-vc-dash-boot", "1");
      /* Stesso markup loading delle pagine staff */
      el.innerHTML =
        '<div class="vc-ul-loading-card vc-staff-loading__card">' +
        '<span class="vc-ul-loading-spinner" aria-hidden="true"></span>' +
        '<p class="vc-ul-loading-title vc-staff-loading__text"></p>' +
        '<p class="vc-ul-loading-sub vc-staff-loading__hint"></p>' +
        "</div>";
      (document.body || document.documentElement).appendChild(el);
    } else {
      el.classList.add("vc-ul-loading", "vc-staff-loading");
      el.setAttribute("data-vc-loader-blocking", "1");
      el.setAttribute("data-vc-dash-boot", "1");
    }
    var title =
      el.querySelector(".vc-ul-loading-title, .vc-staff-loading__text") ||
      el.querySelector(".vc-ul-loading-title");
    var sub =
      el.querySelector(".vc-ul-loading-sub, .vc-staff-loading__hint") ||
      el.querySelector(".vc-ul-loading-sub");
    if (title) title.textContent = o.title || "Caricamento…";
    if (sub) sub.textContent = o.sub || "Un momento…";
    el.hidden = false;
    el.removeAttribute("hidden");
    el.classList.remove("vc-staff-loading--hidden");
    return el;
  }

  function hideSharedBootOverlay() {
    var el = document.getElementById("vc-shared-boot-overlay");
    if (!el) return;
    el.hidden = true;
    el.setAttribute("hidden", "");
  }

  function syncSharedBootFromDashClass() {
    try {
      var root = document.documentElement;
      if (!root) return;
      if (root.classList.contains("vc-dash-access-pending") && !root.classList.contains("vc-dash-access-ready")) {
        ensureSharedBootOverlay({
          title: "Caricamento…",
          sub: "Un momento…",
        });
      } else {
        hideSharedBootOverlay();
      }
    } catch (eSync) {}
  }

  function pathNorm() {
    try {
      return String(window.location.pathname || "/").replace(/\/+$/, "") || "/";
    } catch (e) {
      return "/";
    }
  }

  function viewAsGuestMode() {
    try {
      var m = String(sessionStorage.getItem("vc_view_as") || "")
        .trim()
        .toLowerCase();
      return m === "logout" || m === "member";
    } catch (e) {
      return false;
    }
  }

  function hasLikelyDiscordSession() {
    try {
      /* viewAsLogoutNav1: Logout/Membro = guest, non armare pending staff */
      if (viewAsGuestMode()) return false;
    } catch (eVa) {}
    try {
      if (String(window.location.hash || "").indexOf("access_token=") !== -1) return true;
      var t = localStorage.getItem("vc_discord_access_token");
      if (!t) return false;
      var exp = Number(localStorage.getItem("vc_discord_expires_at") || "0");
      if (exp && Date.now() >= exp) return false;
      return true;
    } catch (e) {
      return false;
    }
  }

  function redirectStaffLogin(fromPath) {
    try {
      var u = new URL("/staff/accesso-richiesto/", window.location.origin);
      u.searchParams.set("from", fromPath || "/staff/");
      window.location.replace(u.href);
    } catch (e) {}
  }

  function tokenFp(token) {
    var exp = "";
    try {
      exp = String(localStorage.getItem("vc_discord_expires_at") || "");
    } catch (e) {}
    return exp + "|" + String(token || "").slice(0, 32);
  }

  var STAFF_CACHE_KEY = "vc_staff_access_ok_v3";
  var STAFF_CACHE_LOCAL_KEY = "vc_staff_access_ok_v3_local";
  var STAFF_CACHE_TTL_MS = 300000;
  var STAFF_CACHE_STALE_MS = 900000;
  var STAFF_CACHE_LOCAL_STALE_MS = 86400000;

  function parseStaffCacheBlob(raw, token) {
    if (!raw) return null;
    try {
      var data = JSON.parse(raw);
      if (!data || !data.ok || data.fp !== tokenFp(token)) return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  function readStaffCacheOk() {
    try {
      var token = localStorage.getItem("vc_discord_access_token");
      if (!token) return null;

      function readFresh(raw) {
        var data = parseStaffCacheBlob(raw, token);
        if (!data) return null;
        if (Number(data.exp || 0) > Date.now()) return data;
        return null;
      }

      function readStale(raw, limitMs) {
        var data = parseStaffCacheBlob(raw, token);
        if (!data) return null;
        var savedAt = Number(data.savedAt || 0);
        if (!savedAt && Number(data.exp || 0) > 0) {
          savedAt = Number(data.exp) - STAFF_CACHE_TTL_MS;
        }
        if (!savedAt || Date.now() - savedAt > limitMs) return null;
        return data;
      }

      var fresh =
        readFresh(sessionStorage.getItem(STAFF_CACHE_KEY)) ||
        readFresh(localStorage.getItem(STAFF_CACHE_LOCAL_KEY));
      if (fresh) return fresh;

      return (
        readStale(sessionStorage.getItem(STAFF_CACHE_KEY), STAFF_CACHE_STALE_MS) ||
        readStale(localStorage.getItem(STAFF_CACHE_LOCAL_KEY), STAFF_CACHE_LOCAL_STALE_MS)
      );
    } catch (e) {
      return null;
    }
  }

  function revealStaffOptimistic(cached) {
    window.__VC_STAFF_ACCESS_OPTIMISTIC = cached;
    try {
      if (cached && typeof cached === "object") {
        window.__VC_STAFF_PERMS = cached;
      }
    } catch (ePerms) {}
    function unlockStaffPageScroll() {
      try {
        var root = document.documentElement;
        var body = document.body;
        if (root) {
          root.style.removeProperty("overflow");
          root.style.removeProperty("overflow-x");
          root.style.removeProperty("overflow-y");
          root.style.removeProperty("height");
          root.style.removeProperty("max-height");
          root.style.removeProperty("touch-action");
          root.style.removeProperty("overscroll-behavior");
        }
        if (body) {
          body.style.removeProperty("position");
          body.style.removeProperty("inset");
          body.style.removeProperty("top");
          body.style.removeProperty("right");
          body.style.removeProperty("bottom");
          body.style.removeProperty("left");
          body.style.removeProperty("width");
          body.style.removeProperty("height");
          body.style.removeProperty("max-height");
          body.style.removeProperty("overflow");
          body.style.removeProperty("overflow-x");
          body.style.removeProperty("overflow-y");
          body.style.removeProperty("touch-action");
        }
                void (body && body.offsetHeight);
        window.scrollTo(0, Math.max(0, window.pageYOffset || 0));
        if (typeof window.__vcUnpinPageScroll === "function") window.__vcUnpinPageScroll();
        if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
      } catch (eUnlock) {}
    }
    function applyReveal() {
      var root = document.documentElement;
      if (!root) return;
      root.classList.remove("vc-staff-access-pending");
      root.classList.add("vc-staff-app-revealed");
      try {
        if (document.body) document.body.classList.add("vc-staff-app-revealed");
      } catch (eB) {}
      unlockStaffPageScroll();
      window.setTimeout(unlockStaffPageScroll, 0);
      window.setTimeout(unlockStaffPageScroll, 120);
      var loading = document.getElementById("vc-staff-loading");
      if (loading) {
        loading.setAttribute("hidden", "");
        loading.classList.add("vc-staff-loading--hidden");
      }
    }
    function shouldRevealStaffImmediately() {
      try {
        var root = document.documentElement;
        if (!root) return false;
        return (
          root.classList.contains("vc-staff-cine-route") ||
          root.classList.contains("vc-staff-inbox-route") ||
          (root.classList.contains("vc-staff-route") && root.classList.contains("vc-page-cine-boot"))
        );
      } catch (eR) {
        return false;
      }
    }
    function waitStylesThenReveal() {
      if (shouldRevealStaffImmediately()) {
        applyReveal();
        return;
      }
      if (typeof window.__vcWaitForCoreStyles === "function") {
        window.__vcWaitForCoreStyles(applyReveal);
        return;
      }
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", waitStylesThenReveal, { once: true });
        return;
      }
      window.setTimeout(function () {
        if (typeof window.__vcWaitForCoreStyles === "function") {
          window.__vcWaitForCoreStyles(applyReveal);
        } else {
          applyReveal();
        }
      }, 16);
    }
    waitStylesThenReveal();
  }

  function prefetchStaffAccessVerify() {
    if (window.__vcStaffAccessPrefetch) return;
    try {
      var token = localStorage.getItem("vc_discord_access_token");
      if (!token) return;
      var exp = Number(localStorage.getItem("vc_discord_expires_at") || "0");
      if (exp && Date.now() >= exp) return;
      var api = "/webhooks/site-staff-access";
      window.__vcStaffAccessPrefetch = fetch(api, {
        method: "GET",
        headers: { Authorization: "Bearer " + token },
        mode: "cors",
        credentials: "omit",
        cache: "no-store",
      })
        .then(function (res) {
          return res
            .json()
            .catch(function () {
              return {};
            })
            .then(function (data) {
              return { res: res, data: data };
            });
        })
        .catch(function () {
          return { res: { ok: false, status: 0 }, data: { ok: false, error: "network" } };
        });
    } catch (ePrefetch) {}
  }

  function unifyFullscreenLoaderCard(root) {
    try {
      if (!root || !root.querySelector) return;
      var card =
        root.querySelector(
          ".vc-staff-loading__card, .vc-ul-loading-card, .vc-seratafilm-loading__card, .vc-session-verify-inner, .vc-hw-loading__card, .vc-dashboard-loading__card"
        ) || root;
      if (!card.querySelector(".vc-ul-loading-spinner, .vc-user-profile-loader__spin, .vc-session-verify-spinner, .vc-dashboard-loading__spinner, .vc-hw-loading__spin, .vc-roles-loading-spinner")) {
        var spin = document.createElement("span");
        spin.className = "vc-ul-loading-spinner";
        spin.setAttribute("aria-hidden", "true");
        card.insertBefore(spin, card.firstChild);
      }
      var title = card.querySelector(
        ".vc-ul-loading-title, .vc-staff-loading__text, .vc-seratafilm-loading__text, .vc-session-verify-text, .vc-user-profile-loader__title, .vc-hw-loading__text, .vc-dashboard-loading__title"
      );
      var sub = card.querySelector(
        ".vc-ul-loading-sub, .vc-staff-loading__hint, .vc-seratafilm-loading__hint, .vc-session-verify-sub, .vc-user-profile-loader__sub, .vc-hw-loading__hint, .vc-dashboard-loading__text"
      );
      if (title) title.textContent = "Caricamento…";
      if (sub) sub.textContent = "Un momento…";
      else if (title && title.parentNode) {
        var hint = document.createElement("p");
        hint.className = "vc-ul-loading-sub vc-staff-loading__hint";
        hint.textContent = "Un momento…";
        title.parentNode.insertBefore(hint, title.nextSibling);
      }
    } catch (eU) {}
  }

  function armStaffPending() {
    var root = document.documentElement;
    if (!root) return;
    var cached = readStaffCacheOk();
    if (cached) {
      revealStaffOptimistic(cached);
      return;
    }
    root.classList.add("vc-staff-access-pending");
    root.classList.remove("vc-staff-app-revealed");
    try {
      if (document.body) document.body.classList.remove("vc-staff-app-revealed");
    } catch (eB2) {}
    var loadingEl = document.getElementById("vc-staff-loading");
    if (loadingEl) {
      unifyFullscreenLoaderCard(loadingEl);
      loadingEl.removeAttribute("hidden");
      loadingEl.classList.remove("vc-staff-loading--hidden");
    }
  }

  function armDashPending() {
    try {
      document.documentElement.classList.add("vc-dash-access-pending");
      document.documentElement.classList.remove("vc-dash-access-ready");
      ensureSharedBootOverlay({
        title: "Caricamento…",
        sub: "Un momento…",
      });
    } catch (e) {}
  }

  function armSeratafilmPending() {
    try {
      var cached = readStaffCacheOk();
      if (cached && (cached.isHighStaff || cached.canManage || cached.allowed || cached.ok)) {
        document.documentElement.classList.remove("vc-dash-access-pending");
        document.documentElement.classList.add("vc-dash-access-ready");
        document.documentElement.classList.add("vc-seratafilm-loading-done");
        try {
          if (document.body) document.body.classList.add("vc-seratafilm-app-revealed");
        } catch (eB) {}
        var loading = document.getElementById("vc-seratafilm-loading");
        if (loading) {
          loading.setAttribute("hidden", "");
          loading.setAttribute("aria-hidden", "true");
        }
        var app = document.getElementById("vc-seratafilm-app");
        if (app) app.style.display = "";
        window.__VC_SERATAFILM_ACCESS_OPTIMISTIC = cached;
        hideSharedBootOverlay();
        return;
      }
    } catch (eOpt) {}
    armDashPending();
  }

  injectCss();

  try {
    if (typeof MutationObserver !== "undefined") {
      var bootObs = new MutationObserver(function () {
        syncSharedBootFromDashClass();
      });
      bootObs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    }
  } catch (eObs) {}

  var path = pathNorm();
  if (String(window.location.hash || "").indexOf("access_token=") !== -1) return;

  if (/^\/staff(?:\/|$)/i.test(path) && path.indexOf("/staff/accesso-richiesto") !== 0) {
    if (viewAsGuestMode() || !hasLikelyDiscordSession()) {
      redirectStaffLogin(String(window.location.pathname || "/staff/") + String(window.location.search || ""));
      return;
    }
    prefetchStaffAccessVerify();
    armStaffPending();
    return;
  }

  if (path.indexOf("/dashboard") === 0) {
    var dashPublic =
      path.indexOf("/dashboard/profilo") === 0 || path.indexOf("/dashboard/transcript") === 0;
    if (!dashPublic && viewAsGuestMode()) {
      try {
        window.location.replace("/");
      } catch (eHome) {}
      return;
    }
    if (!dashPublic && hasLikelyDiscordSession()) armDashPending();
    return;
  }

  if (path.indexOf("/seratafilm") === 0 && path.indexOf("/seratafilm/accesso-richiesto") !== 0) {
    if (viewAsGuestMode()) {
      try {
        window.location.replace("/seratafilm/accesso-richiesto/");
      } catch (eSf) {}
      return;
    }
    if (hasLikelyDiscordSession()) armSeratafilmPending();
  }

  if (!window.__vcPtrBooted) {
    try {
      if (
        !document.querySelector(
          'script[src*="/vc-ptr.js"], script[src*="/vc-ptr."]',
        )
      ) {
        var ptr = document.createElement("script");
        ptr.src = "/js/vc-ptr.20261017ptrScrollRestore2.js?v=20261017ptrScrollRestore2";
        ptr.defer = true;
        (document.head || document.documentElement).appendChild(ptr);
      }
    } catch (ePtr) {}
  }
})();
