(function () {
  try {
    var root = document.documentElement;
    if (!root) return;

    /* bootNoPreGrad2 EARLY: sipario soft-fx/curtain PRIMA di tutto (anti flash flat) */
    try {
      if (!document.getElementById("vc-cine-early-sipario")) {
        var earlySip = document.createElement("style");
        earlySip.id = "vc-cine-early-sipario";
        earlySip.setAttribute("data-vc", "bootNoPreGrad3");
        earlySip.textContent =
          "html.vc-site-polish:not(.vc-soft-fx-ready):not(.vc-soft-fx-off) body.vc-body>main," +
          "html.vc-site-polish:not(.vc-soft-fx-ready):not(.vc-soft-fx-off) body.vc-body>header," +
          "html.vc-site-polish:not(.vc-soft-fx-ready):not(.vc-soft-fx-off) body.vc-body>footer," +
          "html.vc-site-polish:not(.vc-cine-curtain-off) body.vc-body>main," +
          "html.vc-site-polish:not(.vc-cine-curtain-off) body.vc-body>header," +
          "html.vc-site-polish:not(.vc-cine-curtain-off) body.vc-body>footer," +
          "html.vc-page-cine-boot:not(.vc-cine-curtain-off) body.vc-body>main," +
          "html.vc-page-cine-boot:not(.vc-cine-curtain-off) body.vc-body>header," +
          "html.vc-page-cine-boot:not(.vc-cine-curtain-off) body.vc-body>footer{" +
          "opacity:0!important;visibility:hidden!important;pointer-events:none!important}" +
          "html.vc-site-polish:not(.vc-cine-curtain-off)::before," +
          "html.vc-page-cine-boot:not(.vc-cine-curtain-off)::before," +
          "html.vc-site-polish:not(.vc-soft-fx-ready):not(.vc-soft-fx-off)::before{" +
          "content:\"\"!important;position:fixed!important;inset:0!important;top:0!important;right:0!important;" +
          "bottom:0!important;left:0!important;width:100vw!important;height:100dvh!important;" +
          "z-index:2147482990!important;margin:0!important;padding:0!important;border:0!important;" +
          "background:#100c09!important;opacity:1!important;visibility:visible!important;" +
          "pointer-events:auto!important;display:block!important}" +
          "html.vc-cine-curtain-off.vc-soft-fx-ready::before," +
          "html.vc-cine-curtain-off.vc-soft-fx-off::before{" +
          "display:none!important;opacity:0!important;visibility:hidden!important;pointer-events:none!important}";
        (document.head || root).appendChild(earlySip);
      }
    } catch (eEarly) {}

    /* Photo-bg: niente blank lungo su DCL. */
    /* Marker: bootNoPreGrad3 — sipario fino a soft-fx; cine resta sotto (no flash flat/pre-cine) */
    var BOOT_VER = "bootNoPreGrad3";
    var CRITICAL_FORCE_MS = 0;
    var FAILSAFE_MS = 0;
    var HARD_FAILSAFE_MS = 0;
    try {
      window.__vcCineBootStartedAt = Date.now();
      window.__VC_PAGE_CINE_BOOT_VER = BOOT_VER;
    } catch (eBootAt) {}

    function chromeBarStillLoading() {
      try {
        if (root.classList.contains("vc-chrome-bar-loading")) return true;
        var prog = document.getElementById("vc-site-progress");
        if (prog && prog.classList.contains("is-loading")) return true;
        if (window.__vcChromeUiBooted && !window.__vcChromeLoadDone) return true;
        /* barra top ancora in fill finale (LoadDone già true ma freeze attivo) */
        if (window.__vcChromeLoadDone && !window.__vcChromeScrollArmed) return true;
        /* chrome UI non ancora bootato: tieni lock (gap pre-barra) */
        if (!window.__vcChromeUiBooted && window.__vcChromeLoadDone !== true) {
          var age = Date.now() - Number(window.__vcCineBootStartedAt || Date.now());
          if (age < 4500) return true;
        }
      } catch (eChrome) {}
      return false;
    }

    function pageLoaderStillBlocking() {
      try {
        if (chromeBarStillLoading()) return true;
        if (root.classList.contains("vc-loader-blocking-live")) return true;
        if (root.classList.contains("vc-user-leader-pending")) return true;
        if (root.classList.contains("vc-user-profile-pending")) return true;
        if (root.classList.contains("vc-rank-customize-pending")) return true;
        if (root.classList.contains("vc-custom-profile-pending")) return true;
        if (root.classList.contains("vc-session-verify-pending")) return true;
        if (root.classList.contains("vc-staff-access-pending") && !root.classList.contains("vc-staff-app-revealed")) {
          return true;
        }
        /* inboxFreezeKill2: vc-notif-staff-loading NON è più gate di scroll/cine */
        var live = document.querySelector(
          '.vc-ul-loading:not([hidden]),' +
            '#vc-ul-loading:not([hidden]),' +
            '#vc-roles-loading:not([hidden]),' +
            '#vc-staff-loading:not([hidden]):not(.vc-staff-loading--hidden),' +
            '#vc-shared-boot-overlay:not([hidden]),' +
            '.vc-rank-customize-loading:not([hidden]),' +
            '#vc-rank-customize-loading:not([hidden]),' +
            '.vc-session-verify-overlay:not(.vc-session-verify-overlay--hidden),' +
            '#vc-dashboard-loading:not([hidden]),' +
            '#vc-dashboard-guild-loading:not([hidden]),' +
            '#vc-hw-loading:not([hidden]),' +
            '#vc-seratafilm-loading:not([hidden]),' +
            '.vc-reviews-gate:not([hidden]):not(.vc-reviews-gate--dismissed),' +
            '.vc-page-transition.vc-page-transition--on,' +
            '#vc-user-profile-loading:not([hidden]),' +
            '#vc-custom-profile-loading:not([hidden])'
        );
        return !!live;
      } catch (eBlk) {
        return false;
      }
    }

    /* softFxNoFouc2 / siteApiW11: promote deferred print sheets ASAP (before reveal checks) */
    try {
      ["vc-soft-fx-css", "vc-glow-fix-css", "vc-nav-menu-solid-css", "vc-landing-ext-css"].forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.media = "all";
        el.removeAttribute("onload");
      });
    } catch (eSoftPromote) {}

    /* scrollUnlockNoLanding2: CSS gate locks html.vc-site-polish:not(.vc-cine-curtain-off)
       with overflow:hidden — clearing inline styles alone is NOT enough. */
    function forceUnlockPageScroll() {
      try {
        if (root.classList.contains("vc-interaction-hold") && !releaseHoldDone) {
          return;
        }
      } catch (eHoldGate) {}
      try {
        if (root.classList.contains("vc-soft-fx-ready") || softFxIntentionallyOff()) {
          root.classList.add("vc-cine-curtain-off");
        }
        root.classList.remove("vc-page-cine-boot", "vc-scroll-soft-lock");
        if (!pageLoaderStillBlocking()) {
          root.classList.remove("vc-loading-scroll-lock");
        }
      } catch (eCls) {}
      try {
        var cur = document.getElementById("vc-cine-boot-curtain");
        if (cur && cur.parentNode) cur.parentNode.removeChild(cur);
      } catch (eRmCur) {}
      /* violPass5: style clear + unpin nel frame dopo (Forced reflow) */
      window.setTimeout(function () {
        try {
          if (
            typeof window.__vcUnpinPageScroll === "function" &&
            window.__vcUnpinPageScroll !== forceUnlockPageScroll
          ) {
            if (!pageLoaderStillBlocking()) window.__vcUnpinPageScroll();
          }
        } catch (eUn) {}
        try {
          if (pageLoaderStillBlocking()) return;
          root.style.removeProperty("overflow");
          root.style.removeProperty("overflow-x");
          root.style.removeProperty("overflow-y");
          root.style.removeProperty("overscroll-behavior");
          root.style.removeProperty("touch-action");
          root.style.removeProperty("height");
          root.style.removeProperty("max-height");
        } catch (eRoot) {}
        var body = document.body;
        if (!body) return;
        try {
          if (pageLoaderStillBlocking()) return;
          body.style.removeProperty("position");
          body.style.removeProperty("left");
          body.style.removeProperty("right");
          body.style.removeProperty("top");
          body.style.removeProperty("width");
          body.style.removeProperty("overflow");
          body.style.removeProperty("overflow-x");
          body.style.removeProperty("overflow-y");
          body.style.removeProperty("overscroll-behavior");
          body.style.removeProperty("touch-action");
          body.style.removeProperty("height");
          body.style.removeProperty("max-height");
        } catch (eBody) {}
      }, 0);
    }
    try {
      if (typeof window.__vcUnpinPageScroll !== "function") {
        window.__vcUnpinPageScroll = forceUnlockPageScroll;
      }
    } catch (eExp) {}

    /* photoBg1 trial: disable canvas cine, use static photo bg (set false to restore). */
    var SITE_PHOTO_BG =
      typeof window.__VC_SITE_PHOTO_BG === "boolean" ? window.__VC_SITE_PHOTO_BG : true;
    window.__VC_SITE_PHOTO_BG = SITE_PHOTO_BG;
    if (SITE_PHOTO_BG) {
      try {
        root.classList.add("vc-site-photo-bg", "vc-cine-static-bg", "vc-home-cine-live", "vc-home-motion-ready");
        if (!document.getElementById("vc-site-photo-bg-link")) {
          var photoLink = document.createElement("link");
          photoLink.id = "vc-site-photo-bg-link";
          photoLink.rel = "stylesheet";
          photoLink.href = "/css/vc-site-photo-bg.css?v=20260916profileLoadMatch1";
          (document.head || root).appendChild(photoLink);
        }
      } catch (ePhotoBoot) {}
    }

    var mobileNavCritical =
      "@media (max-width:1199.98px){" +
      "html body .vc-header-bar,html body .vc-header-bar.grid{" +
      "display:flex!important;flex-wrap:nowrap!important;align-items:center!important;" +
      "justify-content:space-between!important;grid-template-columns:none!important;" +
      "grid-template-areas:none!important;row-gap:0!important;column-gap:.5rem!important}" +
      "html body .vc-header-snav,html body nav.vc-header-snav," +
      "html body .vc-header-bar>nav.vc-header-snav,html body .vc-header-bar>.vc-header-snav{" +
      "display:none!important}" +
      "html body #header-quick-actions,html body.vc-body #header-quick-actions{" +
      "display:flex!important;flex-wrap:nowrap!important;align-items:center!important;" +
      "gap:.4rem!important;margin-left:auto!important;flex-shrink:0!important}" +
      "html body #header-quick-actions #discord-login-btn," +
      "html body #header-quick-actions #discord-login-state," +
      "html body #header-quick-actions #discord-login-state:not([hidden]){display:none!important}" +
      "html body #vc-mobile-nav-toggle,html body #header-quick-actions #vc-mobile-nav-toggle{" +
      "display:inline-flex!important;align-items:center;justify-content:center}" +
      "}";
    if (!document.getElementById("vc-mobile-nav-critical-css")) {
      var mobileNavEl = document.createElement("style");
      mobileNavEl.id = "vc-mobile-nav-critical-css";
      mobileNavEl.textContent = mobileNavCritical;
      (document.head || root).appendChild(mobileNavEl);
    }

    function isStandalonePwa() {
      try {
        if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true;
        if (window.matchMedia && window.matchMedia("(display-mode: fullscreen)").matches) return true;
        if (window.matchMedia && window.matchMedia("(display-mode: minimal-ui)").matches) return true;
        if (navigator.standalone) return true;
      } catch (eStand) {}
      return false;
    }

    function isPhonePwa() {
      try {
        if (isStandalonePwa()) return true;
        if (window.matchMedia && window.matchMedia("(max-width: 639.98px)").matches) return true;
        if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return true;
        if (window.matchMedia && window.matchMedia("(hover: none)").matches && Number(navigator.maxTouchPoints || 0) > 0) {
          return true;
        }
      } catch (e) {}
      return false;
    }

    function isDesktopNav() {
      try {
        if (isPhonePwa()) return false;
        if (window.matchMedia && window.matchMedia("(min-width: 1200px)").matches) return true;
        if (window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches) return true;
      } catch (eDesk) {}
      return false;
    }

    var phone = isPhonePwa();
    var desktop = isDesktopNav();
    var standalone = isStandalonePwa();
    if (SITE_PHOTO_BG) {
      /* browserParity1: stessi failsafe browser/PWA — niente scorciatoie standalone che rivelano flat */
      CRITICAL_FORCE_MS = desktop ? 1800 : phone ? 2400 : 2000;
      FAILSAFE_MS = desktop ? 2400 : phone ? 3200 : 2800;
      HARD_FAILSAFE_MS = desktop ? 4200 : phone ? 5200 : 4800;
    } else {
      CRITICAL_FORCE_MS = desktop ? 1600 : phone ? 2200 : 1800;
      FAILSAFE_MS = desktop ? 2200 : phone ? 2800 : 2400;
      HARD_FAILSAFE_MS = desktop ? 4000 : phone ? 4800 : 4400;
    }
    try {
      root.classList.add("vc-home-motion-ready");
    } catch (eMotionBoot) {}
    if (phone) {
      try {
        root.classList.add("vc-cine-static-bg", "vc-home-cine-live", "vc-home-motion-ready");
      } catch (ePhoneBg) {}
    }

    // Gate: nascondi main/header/footer + curtain opaco fino a vc-cine-curtain-off (anti FOUC).
    // bootNoPreGrad1: anche soft-fx-ready obbligatorio (no flash flat / pre-gradient).
    // cineNoFlash10: overflow lock solo finché NON ready — altrimenti polish senza curtain-off
    // lascia overflow:hidden per sempre anche a pagina visibile.
    var cineGate =
      "html.vc-site-polish:not(.vc-cine-curtain-off):not(.vc-page-cine-ready)," +
      "html.vc-site-polish:not(.vc-cine-curtain-off):not(.vc-page-cine-ready) body," +
      "html.vc-page-cine-boot:not(.vc-cine-curtain-off):not(.vc-page-cine-ready)," +
      "html.vc-page-cine-boot:not(.vc-cine-curtain-off):not(.vc-page-cine-ready) body," +
      "html.vc-site-polish:not(.vc-soft-fx-ready):not(.vc-soft-fx-off)," +
      "html.vc-site-polish:not(.vc-soft-fx-ready):not(.vc-soft-fx-off) body{" +
      "overflow:hidden!important;overflow-x:hidden!important;overflow-y:hidden!important;" +
      "overscroll-behavior:none!important;touch-action:none!important;" +
      "height:100%!important;max-height:100dvh!important}" +
      "html,body{overflow-anchor:none}" +
      "html.vc-page-cine-ready,html.vc-page-cine-ready body{overflow-anchor:none}" +
      /* bootNoPreGrad1: hide UI until curtain-off AND soft-fx (gradients) */
      "html.vc-site-polish:not(.vc-cine-curtain-off) body.vc-body>main," +
      "html.vc-site-polish:not(.vc-cine-curtain-off) body.vc-body>footer," +
      "html.vc-site-polish:not(.vc-cine-curtain-off) body.vc-body>header," +
      "html.vc-page-cine-boot:not(.vc-cine-curtain-off) body.vc-body>main," +
      "html.vc-page-cine-boot:not(.vc-cine-curtain-off) body.vc-body>footer," +
      "html.vc-page-cine-boot:not(.vc-cine-curtain-off) body.vc-body>header," +
      "html.vc-site-polish:not(.vc-soft-fx-ready):not(.vc-soft-fx-off) body.vc-body>main," +
      "html.vc-site-polish:not(.vc-soft-fx-ready):not(.vc-soft-fx-off) body.vc-body>footer," +
      "html.vc-site-polish:not(.vc-soft-fx-ready):not(.vc-soft-fx-off) body.vc-body>header," +
      "html.vc-site-polish:not(.vc-soft-fx-ready):not(.vc-soft-fx-off) #vc-page-content," +
      "html.vc-site-polish:not(.vc-cine-curtain-off) #vc-page-content," +
      "html.vc-site-polish:not(.vc-soft-fx-ready):not(.vc-soft-fx-off) #vc-page-intro," +
      "html.vc-site-polish:not(.vc-cine-curtain-off) #vc-page-intro{" +
      "opacity:0!important;visibility:hidden!important;pointer-events:none!important}" +
      /* bootNoPreGrad3: .vc-home-cine resta sotto sipario (non opacity:0) */
      "html.vc-page-cine-boot .vc-support-page-hero," +
      "html.vc-page-cine-boot .vc-wiki-hero-card," +
      "html.vc-page-cine-boot .vc-regole-hero-card," +
      "html.vc-page-cine-boot .vc-notify-hero{" +
      "border:none!important;background:transparent!important;box-shadow:none!important;" +
      "backdrop-filter:none!important;-webkit-backdrop-filter:none!important}" +
      "html.vc-site-polish:not(.vc-cine-curtain-off)::before," +
      "html.vc-page-cine-boot:not(.vc-cine-curtain-off)::before," +
      "html.vc-site-polish:not(.vc-soft-fx-ready):not(.vc-soft-fx-off)::before{" +
      "content:\"\"!important;position:fixed!important;inset:0!important;top:0!important;right:0!important;" +
      "bottom:0!important;left:0!important;width:100vw!important;height:100dvh!important;" +
      "z-index:2147482990!important;margin:0!important;padding:0!important;border:0!important;" +
      "background:#100c09!important;opacity:1!important;visibility:visible!important;" +
      "pointer-events:auto!important;display:block!important}" +
      "#vc-cine-boot-curtain{position:fixed!important;inset:0!important;top:0!important;right:0!important;" +
      "bottom:0!important;left:0!important;width:100vw!important;height:100dvh!important;" +
      "z-index:2147483000!important;margin:0!important;padding:0!important;border:0!important;" +
      "background:#100c09!important;opacity:1!important;visibility:visible!important;" +
      "pointer-events:auto!important}" +
      "html.vc-cine-curtain-off.vc-soft-fx-ready #vc-cine-boot-curtain," +
      "html.vc-cine-curtain-off.vc-soft-fx-off #vc-cine-boot-curtain," +
      "html.vc-cine-curtain-off.vc-soft-fx-ready::before," +
      "html.vc-cine-curtain-off.vc-soft-fx-off::before{" +
      "display:none!important;opacity:0!important;visibility:hidden!important;pointer-events:none!important}" +
      /* loadScrollLockFs1 / barScrollLock1 / hamScrollBarGate1: ready sblocca scroll SOLO senza loader/lock/hold/barra */
      "html.vc-page-cine-ready:not(.vc-loading-scroll-lock):not(.vc-loader-blocking-live):not(.vc-interaction-hold):not(.vc-chrome-bar-loading):not(:has(#vc-site-progress.is-loading)):not(.vc-user-leader-pending):not(.vc-user-profile-pending):not(.vc-rank-customize-pending):not(.vc-custom-profile-pending):not(.vc-session-verify-pending):not(.vc-notif-staff-loading)," +
      "html.vc-page-cine-ready:not(.vc-loading-scroll-lock):not(.vc-loader-blocking-live):not(.vc-interaction-hold):not(.vc-chrome-bar-loading):not(:has(#vc-site-progress.is-loading)):not(.vc-user-leader-pending):not(.vc-user-profile-pending):not(.vc-rank-customize-pending):not(.vc-custom-profile-pending):not(.vc-session-verify-pending):not(.vc-notif-staff-loading) body{" +
      "overflow-x:hidden!important;overflow-y:auto!important;" +
      "overscroll-behavior:auto!important;touch-action:auto!important;" +
      "height:auto!important;max-height:none!important}" +
      "html.vc-loading-scroll-lock,html.vc-loading-scroll-lock body," +
      "html.vc-loader-blocking-live,html.vc-loader-blocking-live body," +
      "html.vc-interaction-hold,html.vc-interaction-hold body," +
      "html.vc-chrome-bar-loading,html.vc-chrome-bar-loading body," +
      "html:has(#vc-site-progress.is-loading),html:has(#vc-site-progress.is-loading) body," +
      "html.vc-page-cine-ready.vc-loading-scroll-lock,html.vc-page-cine-ready.vc-loading-scroll-lock body," +
      "html.vc-page-cine-ready.vc-loader-blocking-live,html.vc-page-cine-ready.vc-loader-blocking-live body," +
      "html.vc-page-cine-ready.vc-interaction-hold,html.vc-page-cine-ready.vc-interaction-hold body," +
      "html.vc-page-cine-ready.vc-chrome-bar-loading,html.vc-page-cine-ready.vc-chrome-bar-loading body," +
      "html.vc-page-cine-ready:has(#vc-site-progress.is-loading),html.vc-page-cine-ready:has(#vc-site-progress.is-loading) body," +
      "html:has(.vc-ul-loading:not([hidden])),html:has(.vc-ul-loading:not([hidden])) body," +
      "html:has(#vc-roles-loading:not([hidden])),html:has(#vc-roles-loading:not([hidden])) body," +
      "html:has(#vc-staff-loading:not([hidden]):not(.vc-staff-loading--hidden)),html:has(#vc-staff-loading:not([hidden]):not(.vc-staff-loading--hidden)) body," +
      "html:has(#vc-shared-boot-overlay:not([hidden])),html:has(#vc-shared-boot-overlay:not([hidden])) body," +
      "html:has(.vc-session-verify-overlay:not(.vc-session-verify-overlay--hidden)),html:has(.vc-session-verify-overlay:not(.vc-session-verify-overlay--hidden)) body{" +
      "overflow:hidden!important;overflow-x:hidden!important;overflow-y:hidden!important;" +
      "overscroll-behavior:none!important;touch-action:none!important;" +
      "height:100%!important;max-height:100dvh!important;" +
      "scrollbar-width:none!important}" +
      "html.vc-chrome-bar-loading::-webkit-scrollbar," +
      "html.vc-loading-scroll-lock::-webkit-scrollbar," +
      "html.vc-interaction-hold::-webkit-scrollbar," +
      "html:has(#vc-site-progress.is-loading)::-webkit-scrollbar{width:0!important;height:0!important;display:none!important}" +
      /* interactHold1: anche se il sipario glitcha, niente click su chrome a metà boot */
      /* vcLoadingCursorBack1: cursore loading = :VC_Loading: a raggi (PNG).
         Fallback auto — MAI wait (anello blu Windows). */
      "html.vc-interaction-hold,html.vc-interaction-hold body,html.vc-interaction-hold *{" +
      "cursor:url('/images/vc-loading-cursor.png?v=20260920vcLoadingCursorClean1') 16 16, auto!important}" +
      "html body :is(.is-loading,.is-saving,.is-refreshing,:disabled,[aria-busy='true']," +
      ".vc-candidature-submit--loading,.vc-rank-editor-save.is-saving," +
      ".vc-kick-pip__play.is-loading){" +
      "cursor:url('/images/vc-loading-cursor.png?v=20260920vcLoadingCursorClean1') 16 16, auto!important}" +
      "html.vc-interaction-hold body>header," +
      "html.vc-interaction-hold body>main," +
      "html.vc-interaction-hold body>footer," +
      "html.vc-interaction-hold #vc-mobile-nav-drawer," +
      "html.vc-interaction-hold #vc-lang-dropdown," +
      "html.vc-interaction-hold #header-quick-actions," +
      "html.vc-interaction-hold .vc-notif-dropdown{" +
      "pointer-events:none!important}" +
      /* inbox: cliccabile, ma cursore resta VC_Loading durante hold */
      "html.vc-interaction-hold body.vc-notifications-page," +
      "html.vc-interaction-hold body.vc-notifications-page #vc-staff-inbox," +
      "html.vc-interaction-hold body.vc-notifications-page #vc-notif-pane-staff," +
      "html.vc-interaction-hold body.vc-notifications-page #vc-notif-scope-dock{" +
      "pointer-events:auto!important}" +
      /* sheetUnlock1: sheet portati su body restano cliccabili durante hold */
      "html.vc-interaction-hold .vc-staff-stat-sheet," +
      "html.vc-interaction-hold .vc-staff-stat-sheet *," +
      "html.vc-interaction-hold .vc-staff-manage-sheet," +
      "html.vc-interaction-hold .vc-staff-manage-sheet *," +
      "html.vc-interaction-hold .vc-staff-reso-sheet," +
      "html.vc-interaction-hold .vc-staff-reso-sheet *," +
      "html.vc-interaction-hold .vc-feedback-sheet," +
      "html.vc-interaction-hold .vc-feedback-sheet *," +
      "html.vc-interaction-hold .vc-dialog," +
      "html.vc-interaction-hold .vc-dialog *," +
      "html.vc-interaction-hold .vc-dash-confirm," +
      "html.vc-interaction-hold .vc-dash-confirm *{" +
      "pointer-events:auto!important;touch-action:manipulation!important}" +
      "html.vc-staff-stat-sheet-open.vc-interaction-hold," +
      "html.vc-staff-manage-sheet-open.vc-interaction-hold," +
      "html.vc-staff-reso-sheet-open.vc-interaction-hold," +
      "html.vc-feedback-sheet-open.vc-interaction-hold," +
      "html.vc-staff-stat-sheet-open.vc-interaction-hold body," +
      "html.vc-staff-manage-sheet-open.vc-interaction-hold body," +
      "html.vc-staff-reso-sheet-open.vc-interaction-hold body," +
      "html.vc-feedback-sheet-open.vc-interaction-hold body{" +
      "pointer-events:auto!important;touch-action:manipulation!important}";
    if (!document.getElementById("vc-cine-noflash-gate-css")) {
      var gateEl = document.createElement("style");
      gateEl.id = "vc-cine-noflash-gate-css";
      gateEl.setAttribute("data-vc", "bootNoPreGrad3");
      gateEl.textContent = cineGate;
      (document.head || root).appendChild(gateEl);
    } else {
      try {
        var existingGate = document.getElementById("vc-cine-noflash-gate-css");
        if (existingGate) {
          existingGate.setAttribute("data-vc", "bootNoPreGrad3");
          existingGate.textContent = cineGate;
        }
      } catch (eGateUp) {}
    }
    /* preCineFlashKill1: HTML legacy spegneva ::before (content:none) → primo paint flat */
    try {
      var inlineBoot = document.getElementById("vc-page-cine-boot-css");
      if (inlineBoot && inlineBoot.textContent && inlineBoot.textContent.indexOf("content:none") !== -1) {
        inlineBoot.textContent = inlineBoot.textContent
          .replace(
            /html\.vc-page-cine-boot:not\(\.vc-page-cine-ready\)::before,html\.vc-site-polish\.vc-page-cine-boot:not\(\.vc-page-cine-ready\)::before\{content:none!important;display:none!important;pointer-events:none!important\}/g,
            ""
          )
          .replace(
            /html\.vc-page-cine-boot:not\(\.vc-page-cine-ready\)::before\{content:none!important;display:none!important;pointer-events:none!important\}/g,
            ""
          );
        inlineBoot.setAttribute("data-vc", "preCineFlashKill1");
      }
    } catch (eKillCurt) {}

    function curtainStillUp() {
      try {
        /* cineNoFlash8: sipario CSS ::before attivo finché non curtain-off */
        if (root.classList.contains("vc-cine-curtain-off")) return false;
        return true;
      } catch (eUp) {
        return false;
      }
    }

    function ensureBootCurtain() {
      try {
        if (root.classList.contains("vc-cine-curtain-off")) return;
        /* ready senza boot: non lasciare il sipario montato (bug PWA recover) */
        if (
          root.classList.contains("vc-page-cine-ready") &&
          !root.classList.contains("vc-page-cine-boot") &&
          !root.classList.contains("vc-interaction-hold")
        ) {
          liftBootCurtain(true);
          return;
        }
        var cur = document.getElementById("vc-cine-boot-curtain");
        if (cur) return;
        cur = document.createElement("div");
        cur.id = "vc-cine-boot-curtain";
        cur.setAttribute("aria-hidden", "true");
        cur.setAttribute("data-vc", "interactHold1");
        var host = document.body || root;
        host.appendChild(cur);
      } catch (eCur) {}
    }

    var releaseHoldScheduled = false;
    var releaseHoldDone = false;

    function chromeSettleReady() {
      try {
        if (document.readyState === "loading") return false;
      } catch (eRs) {
        return false;
      }
      try {
        if (document.querySelector('script[src*="vc-i18n"]')) {
          if (!window.VcI18n || typeof window.VcI18n.apply !== "function") return false;
        }
      } catch (eI18) {}
      return true;
    }

    function landBootScrollAfterReveal() {
      try {
        if (window.__vcBootRevealLanded) return;
        window.__vcBootRevealLanded = true;
        var h = String(location.hash || "").replace(/^#/, "");
        var deepLink = Boolean(h && h.indexOf("access_token=") !== 0) || isHashDeepLinkNav();
        /* notifHashYoYo1: disarm SEMPRE (anche con hash) — prima i guard restavano pinY=0 */
        try {
          disarmBootScrollGuards();
        } catch (eDisAll) {}
        if (!deepLink) {
          var restoreY = 0;
          try {
            restoreY = Math.max(
              0,
              Number(window.__vcPtrRestoreTargetY || 0) || 0,
              Number(window.__vcPtrRestoreY || 0) || 0,
              Number(window.__vcViewStateRestoreY || 0) || 0,
            );
            if (restoreY < 2) {
              var attr = document.documentElement.getAttribute("data-vc-ptr-restore-y");
              restoreY = Math.max(0, Number(attr || 0) || 0);
            }
          } catch (eRy) {}
          var yNow = Math.max(bootScrollY(), Number(bootScrollIntentY) || 0, restoreY);
          try {
            if (typeof window.__vcBootScrollIntentY === "number") {
              yNow = Math.max(yNow, Number(window.__vcBootScrollIntentY) || 0);
            }
          } catch (eIntY) {}
          /* scrollReloadNoYank1: se c'è restore, NON scrollare qui.
             I boot-guard (pinY=0) riportavano su → yo-yo ~1s. Finalize fa UN salto. */
          var keepUserScroll = restoreY > 24;
          if (keepUserScroll) {
            try {
              if (typeof window.__vcResetPinnedPageScrollY === "function") {
                window.__vcResetPinnedPageScrollY(restoreY);
              }
              window.__vcDiscardNextUnpinScrollY = false;
            } catch (eKeep) {}
            bootScrollPinY = restoreY;
            try {
              if (typeof window.__vcPtrFinalizeScroll === "function") {
                window.setTimeout(function () {
                  try {
                    window.__vcPtrFinalizeScroll();
                  } catch (eF2) {}
                }, 60);
                window.setTimeout(function () {
                  try {
                    window.__vcPtrFinalizeScroll();
                  } catch (eF3) {}
                }, 450);
                window.setTimeout(function () {
                  try {
                    window.__vcPtrFinalizeScroll();
                  } catch (eF4) {}
                }, 1200);
              }
            } catch (eFin) {}
          } else {
            try {
              if (typeof window.__vcResetPinnedPageScrollY === "function") {
                window.__vcResetPinnedPageScrollY(0);
              }
              window.__vcDiscardNextUnpinScrollY = true;
            } catch (eDisc) {}
            try {
              if (typeof window.__vcUnpinPageScroll === "function") {
                window.__vcUnpinPageScroll();
              }
            } catch (eUn) {}
            try {
              document.documentElement.classList.remove("vc-scroll-reload-top-lock");
            } catch (eUnlock) {}
            forceBootScrollTop();
            try {
              window.requestAnimationFrame(function () {
                forceBootScrollTop();
              });
            } catch (eRafTop) {}
          }
        } else {
          try {
            document.documentElement.classList.remove("vc-scroll-reload-top-lock");
          } catch (eUnlock2) {}
          try {
            window.__vcDiscardNextUnpinScrollY = true;
          } catch (eDisc2) {}
        }
        try {
          document.dispatchEvent(new CustomEvent("vc:cine-curtain-off"));
        } catch (eEv) {}
      } catch (eTop2) {}
    }

    function finishReleaseInteractionHold() {
      if (releaseHoldDone) return;
      /* bootNoPreGrad1: aspetta soft-fx (gradient) prima del reveal — meglio sipario che flash flat */
      try {
        var waitCss = !landingCssReady() && !softFxIntentionallyOff();
        var age = Date.now() - Number(window.__vcCineBootStartedAt || bootStartedAt || Date.now());
        var softFailMs = HARD_FAILSAFE_MS + 2400;
        if (waitCss && age < softFailMs) {
          releaseHoldScheduled = false;
          scheduleReleaseInteractionHold();
          return;
        }
        /* bootNoPreGrad3: aspetta decode foto cine (breve) prima di alzare sipario */
        if (!cineBgPaintReady() && age < Math.min(softFailMs, 1800)) {
          releaseHoldScheduled = false;
          scheduleReleaseInteractionHold();
          return;
        }
      } catch (eSoftHold) {}
      releaseHoldDone = true;
      function go() {
        try {
          if (landingCssReady() || softFxIntentionallyOff()) {
            root.classList.add("vc-soft-fx-ready");
          } else if (!root.classList.contains("vc-soft-fx-ready")) {
            root.classList.add("vc-soft-fx-ready");
          }
        } catch (eSoftMark) {}
        try {
          root.classList.remove("vc-interaction-hold");
        } catch (eHold) {}
        try {
          root.classList.add("vc-cine-curtain-off");
        } catch (eOff) {}
        try {
          var cur = document.getElementById("vc-cine-boot-curtain");
          if (cur && cur.parentNode) cur.parentNode.removeChild(cur);
        } catch (eRm) {}
        /* violPass4: unlock spezzato — un handler non deve fare unlock+disarm+land insieme */
        /* violPass7: land ancora più tardi e in macrotask isolato (era ~310ms Violation) */
        window.setTimeout(function () {
          try {
            forceUnlockPageScroll();
          } catch (eForce) {}
        }, 0);
        window.setTimeout(function () {
          try {
            maybeDisarmBootScrollGuards();
          } catch (eDis) {}
        }, 80);
        window.setTimeout(function () {
          window.setTimeout(function () {
            try {
              landBootScrollAfterReveal();
            } catch (eLand) {}
          }, 0);
        }, 200);
      }
      try {
        window.setTimeout(go, phone || standalone ? 80 : 140);
      } catch (eRaf) {
        go();
      }
    }

    function forceClearInteractionHold() {
      try {
        var age =
          Date.now() - Number(window.__vcCineBootStartedAt || bootStartedAt || Date.now());
        if (!root.classList.contains("vc-soft-fx-ready") && !softFxIntentionallyOff()) {
          if (landingCssReady() || age >= HARD_FAILSAFE_MS + 2400) {
            root.classList.add("vc-soft-fx-ready");
          }
        }
      } catch (eSoftForce) {}
      try {
        root.classList.remove("vc-interaction-hold");
      } catch (eClr) {}
      try {
        if (root.classList.contains("vc-soft-fx-ready") || softFxIntentionallyOff()) {
          root.classList.add("vc-cine-curtain-off");
        }
      } catch (eOff) {}
      try {
        forceUnlockPageScroll();
      } catch (eUn) {}
      try {
        maybeDisarmBootScrollGuards();
      } catch (eDis) {}
      releaseHoldDone = true;
      releaseHoldScheduled = false;
    }

    function scheduleReleaseInteractionHold() {
      /* holdFreezeKill1: se hold riappare dopo releaseDone, rialza il clear */
      if (releaseHoldDone) {
        try {
          if (root.classList.contains("vc-interaction-hold")) forceClearInteractionHold();
        } catch (eRe) {}
        return;
      }
      if (releaseHoldScheduled) return;
      releaseHoldScheduled = true;
      var n = 0;
      function tick() {
        n += 1;
        var hard = false;
        try {
          /* bootNoPreGrad1: aspetta soft-fx fino a ~2.4s prima del hard release */
          hard =
            Date.now() - Number(window.__vcCineBootStartedAt || bootStartedAt || Date.now()) >=
            HARD_FAILSAFE_MS + 2400;
        } catch (eHard) {}
        var softOk = false;
        try {
          softOk = landingCssReady() || softFxIntentionallyOff();
        } catch (eSoftOk) {}
        if ((chromeSettleReady() && softOk) || hard || n > 80) {
          finishReleaseInteractionHold();
          return;
        }
        window.setTimeout(tick, 40);
      }
      function start() {
        window.setTimeout(tick, 0);
      }
      try {
        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", start, { once: true });
        } else {
          start();
        }
      } catch (eSch) {
        finishReleaseInteractionHold();
      }
    }

    /* holdFreezeKill1: watchdog globale — hold morto = cursore loading + click bloccati */
    try {
      window.setInterval(function () {
        try {
          if (!root.classList.contains("vc-interaction-hold")) return;
          if (!root.classList.contains("vc-page-cine-ready") && !root.classList.contains("vc-cine-curtain-off")) {
            return;
          }
          var age = Date.now() - Number(window.__vcCineBootStartedAt || bootStartedAt || Date.now());
          if (age < HARD_FAILSAFE_MS + 2400) return;
          forceClearInteractionHold();
        } catch (eWd) {}
      }, 700);
    } catch (eWdArm) {}

    function liftBootCurtain(force) {
      try {
        if (!force && root.classList.contains("vc-interaction-hold") && !releaseHoldDone) {
          scheduleReleaseInteractionHold();
          return;
        }
      } catch (eGate) {}
      try {
        root.classList.remove("vc-interaction-hold");
      } catch (eHoldOff) {}
      try {
        /* bootNoPreGrad1: curtain-off solo con soft-fx (o force dopo failsafe) */
        if (
          force ||
          root.classList.contains("vc-soft-fx-ready") ||
          softFxIntentionallyOff() ||
          landingCssReady()
        ) {
          if (!root.classList.contains("vc-soft-fx-ready") && !softFxIntentionallyOff()) {
            root.classList.add("vc-soft-fx-ready");
          }
          root.classList.add("vc-cine-curtain-off");
        }
      } catch (eOff) {}
      try {
        var cur = document.getElementById("vc-cine-boot-curtain");
        if (cur && cur.parentNode) cur.parentNode.removeChild(cur);
      } catch (eRm) {}
      try {
        forceUnlockPageScroll();
      } catch (eForceLift) {}
      releaseHoldDone = true;
    }

    ensureBootCurtain();
    try {
      window.__vcEnsureCineBootCurtain = ensureBootCurtain;
      window.__vcLiftCineBootCurtain = liftBootCurtain;
      window.__vcCineCurtainStillUp = curtainStillUp;
      window.__vcReleaseInteractionHold = scheduleReleaseInteractionHold;
      window.__vcRevealCineBoot = function (force) {
        try {
          if (force || root.classList.contains("vc-page-cine-ready") || curtainStillUp()) {
            revealExcluded();
          }
        } catch (eRevApi) {
          liftBootCurtain(true);
        }
      };
    } catch (eCurExp) {}

    try {
      root.classList.add("vc-loading-scroll-lock", "vc-interaction-hold", "vc-chrome-bar-loading");
    } catch (eLockCls) {}

    /* loadFreezeHard1: freeze totale finché hold/lock/barra top — pin Y, no yo-yo */
    var bootScrollGuardsOn = false;
    var bootScrollIntentY = 0;
    var bootScrollPinY = 0;
    var bootScrollWatchTimer = 0;
    function bootScrollY() {
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
    function isHashDeepLinkNav() {
      try {
        if (window.__vcHashDeepLinkNav) return true;
        if (document.documentElement.getAttribute("data-vc-hash-deeplink") === "1") return true;
      } catch (eFl) {}
      try {
        var h = String(location.hash || "").replace(/^#/, "");
        if (h && h.indexOf("access_token=") !== 0) return true;
      } catch (eH) {}
      return false;
    }
    function forceBootScrollTop() {
      try {
        /* scrollReloadKillYoYo2: non azzerare durante restore scroll reload */
        if (document.documentElement.classList.contains("vc-ptr-scroll-restore-pending")) return;
        if (window.__vcPtrRestoreUnpinStarted && !window.__vcPtrRestoreDone) return;
        /* notifHashYoYo1: click notifica con #target — non strappare su/giù */
        if (isHashDeepLinkNav()) return;
        var restoreY = Math.max(
          0,
          Number(window.__vcPtrRestoreTargetY || 0) || 0,
          Number(window.__vcPtrRestoreY || 0) || 0,
          Number(window.__vcViewStateRestoreY || 0) || 0,
        );
        if (restoreY > 8 && !window.__vcPtrRestoreDone) return;
        /* scrollStayAll1: mai azzerare se l'utente ha già scrollato / pagina già ready */
        var y =
          window.pageYOffset ||
          (document.documentElement && document.documentElement.scrollTop) ||
          (document.body && document.body.scrollTop) ||
          0;
        if (y > 8) return;
        if (window.__vcBootRevealLanded && root.classList.contains("vc-cine-curtain-off")) return;
        if (root.classList.contains("vc-page-cine-ready") && root.classList.contains("vc-cine-curtain-off")) return;
        window.scrollTo(0, 0);
        if (document.documentElement) document.documentElement.scrollTop = 0;
        if (document.body) document.body.scrollTop = 0;
      } catch (eTop) {}
    }
    function restoreBootScrollY(y) {
      var n = Math.max(0, Number(y) || 0);
      try {
        if (typeof window.scrollTo === "function") {
          try {
            window.scrollTo({ top: n, left: 0, behavior: "instant" });
          } catch (eInst) {
            window.scrollTo(0, n);
          }
        }
        if (document.documentElement) document.documentElement.scrollTop = n;
        if (document.body) document.body.scrollTop = n;
      } catch (eRest) {}
    }
    function bootScrollShouldBlock() {
      try {
        if (root.classList.contains("vc-interaction-hold")) return true;
        if (root.classList.contains("vc-loader-blocking-live")) return true;
        if (root.classList.contains("vc-loading-scroll-lock")) return true;
        if (root.classList.contains("vc-chrome-bar-loading")) return true;
        if (root.classList.contains("vc-page-cine-boot") && !root.classList.contains("vc-page-cine-ready")) {
          return true;
        }
        if (curtainStillUp() && !root.classList.contains("vc-cine-curtain-off")) return true;
        /* cpuFreezeTrim1: niente lock eterno su flag chrome — solo durante barra is-loading */
        var prog = document.getElementById("vc-site-progress");
        if (prog && prog.classList.contains("is-loading")) return true;
      } catch (eShould) {}
      return false;
    }
    function onBootScrollBlock(e) {
      try {
        if (!bootScrollShouldBlock()) {
          maybeDisarmBootScrollGuards();
          return;
        }
        if (e && e.type === "wheel") {
          var dy = Number(e.deltaY) || 0;
          bootScrollIntentY = Math.max(0, bootScrollIntentY + dy);
          try {
            window.__vcBootScrollIntentY = bootScrollIntentY;
          } catch (eInt) {}
        }
        if (e && e.type === "keydown") {
          var k = e.key || e.code || "";
          var blockKeys = {
            ArrowDown: 1,
            ArrowUp: 1,
            PageDown: 1,
            PageUp: 1,
            Home: 1,
            End: 1,
            " ": 1,
            Spacebar: 1,
            Space: 1,
          };
          if (!blockKeys[k]) return;
        }
        if (e && e.type === "scroll") {
          /* scrollReloadNoYank1: non riportare a 0 se c'è restore reload in corso */
          try {
            var ryGuard = Math.max(
              0,
              Number(window.__vcPtrRestoreTargetY || 0) || 0,
              Number(window.__vcPtrRestoreY || 0) || 0,
              Number(window.__vcViewStateRestoreY || 0) || 0,
            );
            if (ryGuard > 8 && !window.__vcPtrRestoreDone) return;
          } catch (eRyG) {}
          /* notifHashYoYo1: lascia stare lo scroll verso #target */
          if (isHashDeepLinkNav()) {
            try {
              bootScrollPinY = Math.max(bootScrollPinY, bootScrollY());
            } catch (ePin) {}
            return;
          }
          restoreBootScrollY(bootScrollPinY);
          return;
        }
        if (e && e.cancelable) e.preventDefault();
      } catch (eBlk) {}
    }
    function armBootScrollGuards() {
      if (bootScrollGuardsOn) return;
      bootScrollGuardsOn = true;
      bootScrollPinY = bootScrollY();
      try {
        document.addEventListener("wheel", onBootScrollBlock, { capture: true, passive: false });
        document.addEventListener("touchmove", onBootScrollBlock, { capture: true, passive: false });
        document.addEventListener("keydown", onBootScrollBlock, { capture: true, passive: false });
        /* cpuFreezeTrim1: scroll listener PASSIVE — no preventDefault storm */
        window.addEventListener("scroll", onBootScrollBlock, { capture: true, passive: true });
      } catch (eArm) {}
      if (bootScrollPinY <= 8 && !isHashDeepLinkNav()) forceBootScrollTop();
      /* cpuFreezeTrim1: NO setInterval 120ms — solo hard timeout failsafe */
      try {
        if (bootScrollWatchTimer) window.clearTimeout(bootScrollWatchTimer);
        bootScrollWatchTimer = window.setTimeout(function () {
          bootScrollWatchTimer = 0;
          try {
            maybeDisarmBootScrollGuards();
          } catch (eTo) {}
        }, 2800);
      } catch (eTimer) {}
    }
    function disarmBootScrollGuards() {
      if (!bootScrollGuardsOn) return;
      bootScrollGuardsOn = false;
      try {
        document.removeEventListener("wheel", onBootScrollBlock, true);
        document.removeEventListener("touchmove", onBootScrollBlock, true);
        document.removeEventListener("keydown", onBootScrollBlock, true);
        window.removeEventListener("scroll", onBootScrollBlock, true);
      } catch (eDis) {}
      try {
        if (bootScrollWatchTimer) {
          window.clearTimeout(bootScrollWatchTimer);
          bootScrollWatchTimer = 0;
        }
      } catch (eClr) {}
    }
    function maybeDisarmBootScrollGuards() {
      if (bootScrollShouldBlock()) {
        armBootScrollGuards();
        return;
      }
      disarmBootScrollGuards();
    }
    armBootScrollGuards();

    var navGuard =
      "html:not(.vc-core-styles-ready):not(.vc-home-styles-ready) body.vc-body>main," +
      "html:not(.vc-core-styles-ready):not(.vc-home-styles-ready) body.vc-body>footer," +
      "html:not(.vc-core-styles-ready):not(.vc-home-styles-ready) body.vc-body>header{" +
      "opacity:0!important;visibility:hidden!important;pointer-events:none!important}" +
      "html:not(.vc-core-styles-ready):not(.vc-home-styles-ready) #vc-mobile-nav-drawer," +
      "html:not(.vc-core-styles-ready):not(.vc-home-styles-ready) .vc-mobile-nav-drawer{" +
      "display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important}" +
      "html:not(.vc-core-styles-ready):not(.vc-home-styles-ready) body.vc-body header nav.vc-header-snav," +
      "html:not(.vc-core-styles-ready):not(.vc-home-styles-ready) body.vc-body header #header-quick-actions{" +
      "display:none!important}";
    if (!document.getElementById("vc-nav-boot-guard-css")) {
      var guardEl = document.createElement("style");
      guardEl.id = "vc-nav-boot-guard-css";
      guardEl.textContent = navGuard;
      (document.head || document.documentElement).appendChild(guardEl);
    } else {
      try {
        var oldGuard = document.getElementById("vc-nav-boot-guard-css");
        if (oldGuard) oldGuard.textContent = navGuard;
      } catch (eGuard) {}
    }

    // Telefono: sfondo cine static ok, main/footer restano dietro al gate.
    if (phone && !document.getElementById("vc-phone-nav-fast-css")) {
      var phoneNav = document.createElement("style");
      phoneNav.id = "vc-phone-nav-fast-css";
      phoneNav.textContent =
        "@media (max-width:639.98px),(pointer:coarse){" +
        "html.vc-site-polish.vc-cine-static-bg .vc-home-cine::before{" +
        "opacity:1!important;visibility:visible!important}" +
        "html.vc-site-polish.vc-cine-static-bg .vc-home-cine__veil{opacity:.88!important}" +
        "html body .vc-header-snav,html body nav.vc-header-snav{display:none!important}" +
        "html body .vc-header-bar,html body .vc-header-bar.grid{" +
        "display:flex!important;flex-wrap:nowrap!important;align-items:center!important;" +
        "justify-content:space-between!important;grid-template-columns:none!important}" +
        "}";
      (document.head || root).appendChild(phoneNav);
    }

    // Rimuovi eventuale CSS early-reveal desktop già iniettato da cache/vecchio boot.
    try {
      var oldDesk = document.getElementById("vc-desktop-nav-fast-css");
      if (oldDesk && oldDesk.parentNode) oldDesk.parentNode.removeChild(oldDesk);
    } catch (eOldDesk) {}

    function isVcBundleStylesheet(href) {
      return (
        href.indexOf("vc-landing.css") !== -1 ||
        href.indexOf("vc-landing-core.css") !== -1 ||
        href.indexOf("vc-landing-ext.css") !== -1 ||
        href.indexOf("tw-build.css") !== -1 ||
        href.indexOf("vc-soft-fx.css") !== -1
      );
    }

    /* Critical for reveal: core + ext + soft-fx wash (+ tw/photo). Soft-fx = gradient cards/nav. */
    function isCriticalRevealStylesheet(href) {
      return (
        href.indexOf("vc-landing-core.css") !== -1 ||
        href.indexOf("vc-landing-ext.css") !== -1 ||
        href.indexOf("tw-build.css") !== -1 ||
        href.indexOf("vc-site-photo-bg.css") !== -1 ||
        href.indexOf("vc-soft-fx.css") !== -1 ||
        /* legacy pages that only ship the monolith */
        (href.indexOf("vc-landing.css") !== -1 && href.indexOf("vc-landing-core") === -1 && href.indexOf("vc-landing-ext") === -1)
      );
    }

    function isCoreRevealStylesheet(href) {
      return isCriticalRevealStylesheet(href);
    }

    function sheetHasRules(link) {
      if (!link || !link.sheet) return false;
      try {
        var n =
          (link.sheet.cssRules && link.sheet.cssRules.length) || (link.sheet.rules && link.sheet.rules.length) || 0;
        return n > 0;
      } catch (e2) {
        /* cineNoFlash5: never treat blocked/loading sheet as ready (was early FOUC) */
        return link.getAttribute("data-vc-sheet-loaded") === "1";
      }
    }

    function markSheetLoaded(link) {
      try {
        if (link) link.setAttribute("data-vc-sheet-loaded", "1");
      } catch (eMk) {}
    }

    function findLandingCssLinks() {
      var out = { core: null, ext: null, mono: null, tw: null, photo: null, soft: null };
      try {
        var links = document.querySelectorAll('link[rel="stylesheet"]');
        for (var i = 0; i < links.length; i += 1) {
          var href = String(links[i].getAttribute("href") || links[i].href || "");
          if (href.indexOf("vc-landing-core.css") !== -1) out.core = links[i];
          else if (href.indexOf("vc-landing-ext.css") !== -1) out.ext = links[i];
          else if (href.indexOf("vc-landing.css") !== -1) out.mono = links[i];
          else if (href.indexOf("tw-build.css") !== -1) out.tw = links[i];
          else if (href.indexOf("vc-site-photo-bg.css") !== -1) out.photo = links[i];
          else if (href.indexOf("vc-soft-fx.css") !== -1) out.soft = links[i];
        }
        if (!out.soft) {
          out.soft = document.getElementById("vc-soft-fx-css");
        }
      } catch (eFind) {}
      return out;
    }

    function landingCssLinksPresent() {
      var L = findLandingCssLinks();
      if (L.mono) return true;
      return Boolean(L.core && L.ext);
    }

    function sheetAppliesToScreen(link) {
      if (!link) return false;
      try {
        if (link.disabled || link.getAttribute("data-vc-soft-disabled") === "1") return false;
        var m = String(link.media || "all").trim().toLowerCase();
        if (!m || m === "all") return true;
        /* holdFreezeKill1 / softFxNoFouc2: media=print|not all → non applica a schermo */
        if (m === "not all" || m.indexOf("not all") !== -1) return false;
        if (m.indexOf("print") !== -1 && m.indexOf("screen") === -1) return false;
        return true;
      } catch (eMed) {
        return true;
      }
    }

    function softFxIntentionallyOff() {
      try {
        if (root.classList.contains("vc-soft-fx-off")) return true;
        if (root.classList.contains("vc-soft-fx-ready") && root.classList.contains("vc-perf-mid")) return true;
        if (root.classList.contains("vc-soft-fx-ready") && root.classList.contains("vc-perf-lite")) return true;
        if (root.classList.contains("vc-soft-fx-ready") && root.classList.contains("vc-perf-touch")) return true;
        var soft =
          document.getElementById("vc-soft-fx-css") ||
          document.querySelector('link[href*="vc-soft-fx.css"]');
        if (soft && (soft.disabled || soft.getAttribute("data-vc-soft-disabled") === "1")) return true;
        if (soft) {
          var med = String(soft.media || "").trim().toLowerCase();
          if (med === "not all" || med.indexOf("not all") !== -1) return true;
        }
      } catch (eOff) {}
      return false;
    }

    /* bootNoPreGrad3: foto cine già decode sotto sipario → niente pop dark→photo al reveal */
    function cineBgPaintReady() {
      try {
        if (root.classList.contains("vc-cine-static-bg") || SITE_PHOTO_BG) {
          var img =
            document.querySelector(".vc-home-cine img.vc-home-cine__photo") ||
            document.querySelector(".vc-home-cine__photo");
          if (!img) return true;
          if (img.complete && Number(img.naturalWidth || 0) > 0) return true;
          try {
            if (typeof img.decode === "function") {
              img.decode().catch(function () {});
            }
          } catch (eDec) {}
          return false;
        }
      } catch (eCine) {}
      return true;
    }

    function landingCssReady() {
      var L = findLandingCssLinks();
      var baseOk = false;
      if (L.mono) baseOk = sheetHasRules(L.mono);
      else if (L.core && L.ext) baseOk = sheetHasRules(L.core) && sheetHasRules(L.ext);
      if (!baseOk) return false;
      /* holdFreezeKill1: con soft-fx-off (perf mid/lite) soft NON è requisito reveal/hold */
      if (softFxIntentionallyOff()) return true;
      /* cineNoFlash11: soft-fx = gradient cards/nav — senza sheet = flash flat */
      if (L.soft) {
        if (!sheetAppliesToScreen(L.soft)) return false;
        if (!sheetHasRules(L.soft)) return false;
      } else {
        try {
          if (!document.documentElement.classList.contains("vc-soft-fx-ready")) return false;
        } catch (eSoft) {
          return false;
        }
      }
      return true;
    }

    function coreStylesReady() {
      return landingCssReady();
    }

    function markCoreStylesReady() {
      try {
        root.classList.add("vc-core-styles-ready");
      } catch (e5) {}
    }

    function waitCoreStyles(n) {
      n = n || 0;
      if (coreStylesReady()) {
        markCoreStylesReady();
        return;
      }
      /* cineNoFlash6: do not mark core ready without sheets — that lifted nav-guards early */
      var maxPass = phone ? 120 : desktop ? 100 : 140;
      var delayMs = phone ? 40 : desktop ? 35 : 45;
      if (n < maxPass) {
        window.setTimeout(function () {
          waitCoreStyles(n + 1);
        }, delayMs);
        return;
      }
      if (landingCssLinksPresent()) markCoreStylesReady();
    }

    waitCoreStyles(0);

    function markStylesReadyOnly() {
      try {
        root.classList.add("vc-styles-ready");
        markCoreStylesReady();
      } catch (eSt) {}
    }

    function revealExcluded() {
      try {
        /* interactHold1: marca ready ma tieni sipario/hold finché chrome non è settled */
        root.classList.add(
          "vc-page-cine-ready",
          "vc-styles-ready",
          "vc-core-styles-ready",
          "vc-home-motion-ready",
          "vc-home-styles-ready",
          "vc-interaction-hold",
        );
        try {
          if (landingCssReady()) root.classList.add("vc-soft-fx-ready");
        } catch (eSoftR) {}
        root.classList.remove("vc-page-cine-boot");
        /* keep vc-loading-scroll-lock until hold release */
      } catch (eRev) {}
      try {
        ensureBootCurtain();
      } catch (eCurKeep) {}
      try {
        scheduleReleaseInteractionHold();
      } catch (eSched) {
        try {
          liftBootCurtain(true);
        } catch (eForce) {}
      }
    }

    function hasCineLayout() {
      try {
        return Boolean(document.body && document.body.classList.contains("vc-page-cine-layout"));
      } catch (eLay) {
        return false;
      }
    }

    function hasCineInterior() {
      try {
        if (window.__vcPageCineReadyDone) return true;
        var hero = document.querySelector(".vc-page-cine-hero, .vc-home-cine-hero");
        if (!hero) return false;
        return Boolean(
          hero.querySelector(".vc-hero-head, .vc-page-cine-hero__inner, .vc-home-cine-hero__inner, .vc-page-cine-hero-copy")
        );
      } catch (eInt) {
        return false;
      }
    }

    /* Solo root /dashboard usa card cine; sotto-pagine no */
    function isDashboardCineRoot() {
      try {
        var p = String(location.pathname || "/").replace(/\/+$/, "") || "/";
        return p === "/dashboard";
      } catch (eDash) {
        return false;
      }
    }

    function ensureHomeCineScript() {
      try {
        if (typeof window.__vcPageHeroLayout === "function") return;
        if (document.querySelector('script[src*="vc-home-cine"]')) return;
        var s = document.createElement("script");
        s.src = "/js/vc-home-cine.js?v=20261002extOnlyFix1";
        s.async = true;
        (document.head || root).appendChild(s);
      } catch (eHc) {}
    }

    var bootStartedAt = Date.now();

    function armRevealFailsafe(ms) {
      window.setTimeout(function () {
        /* Must reveal even if boot class was stripped without ready (stuck on bg only). */
        if (root.classList.contains("vc-page-cine-ready")) {
          /* pwaBlank1: ready senza sipario alzato = schermo nero permanente in webapp */
          if (curtainStillUp()) {
            if (root.classList.contains("vc-interaction-hold") || !landingCssReady()) {
              scheduleReleaseInteractionHold();
            } else {
              liftBootCurtain(true);
            }
          }
          return;
        }
        if (!landingCssReady() && Date.now() - bootStartedAt < HARD_FAILSAFE_MS + 2400) {
          armRevealFailsafe(standalone ? 220 : 350);
          return;
        }
        try {
          ensureHomeCineScript();
          if (typeof window.__vcPageHeroLayout === "function") {
            window.__vcPageHeroLayout({ force: true });
          }
        } catch (eLay) {}
        /* cineNoFlash7: se il layout arriva tardi, aspetta ancora un po’ prima del reveal piatto */
        if (!hasCineLayout() && Date.now() - bootStartedAt < HARD_FAILSAFE_MS) {
          armRevealFailsafe(standalone ? 220 : 280);
          return;
        }
        revealWhenCssReady(0);
      }, Math.max(FAILSAFE_MS, Number(ms) || FAILSAFE_MS));
    }

    function promoteDeferredStylesheets() {
      try {
        var links = document.querySelectorAll('link[rel="stylesheet"][media="print"]');
        for (var i = 0; i < links.length; i += 1) {
          var href = String(links[i].getAttribute("href") || links[i].href || "");
          if (!isVcBundleStylesheet(href) && href.indexOf("vc-site-photo-bg.css") === -1) continue;
          try {
            links[i].media = "all";
            links[i].setAttribute("media", "all");
          } catch (eMedia) {}
        }
      } catch (ePromo) {}
    }

    function waitForStylesheets(done) {
      promoteDeferredStylesheets();
      var finished = false;
      var startedAt = Date.now();
      var wired = {};

      function finish(force) {
        if (finished) return;
        if (!force && !landingCssReady()) return;
        finished = true;
        done();
      }

      function wireLink(link, key) {
        if (!link || wired[key]) return;
        wired[key] = true;
        if (sheetHasRules(link)) {
          markSheetLoaded(link);
          return;
        }
        function onLoad() {
          markSheetLoaded(link);
          link.removeEventListener("load", onLoad);
          link.removeEventListener("error", onLoad);
          if (landingCssReady()) finish(false);
        }
        link.addEventListener("load", onLoad);
        link.addEventListener("error", onLoad);
      }

      function tick() {
        if (finished) return;
        promoteDeferredStylesheets();
        var L = findLandingCssLinks();
        wireLink(L.core, "core");
        wireLink(L.ext, "ext");
        wireLink(L.mono, "mono");
        wireLink(L.tw, "tw");
        wireLink(L.photo, "photo");
        wireLink(L.soft, "soft");
        if (landingCssReady()) {
          finish(false);
          return;
        }
        var elapsed = Date.now() - startedAt;
        /* bootNoPreGrad1: non soft-force senza soft-fx/landing — FOUC flat */
        if (elapsed >= HARD_FAILSAFE_MS + 2400) {
          finish(true);
          return;
        }
        window.setTimeout(tick, 40);
      }

      tick();
    }

    function tryApplyLayout() {
      if (typeof window.__vcPageHeroLayout !== "function") return false;
      try {
        window.__vcPageHeroLayout({ force: true });
      } catch (eLay) {}
      /* cineNoFlash7: interior DOM esiste già nel HTML — serve anche la layout class */
      return hasCineLayout() && hasCineInterior();
    }

    function waitForLayoutAndReveal(n) {
      n = n || 0;
      if (root.classList.contains("vc-page-cine-ready") && hasCineLayout() && hasCineInterior()) {
        if (curtainStillUp()) {
          if (root.classList.contains("vc-interaction-hold")) scheduleReleaseInteractionHold();
          else liftBootCurtain(true);
        }
        return;
      }
      if (tryApplyLayout()) {
        revealWhenCssReady(0);
        return;
      }
      if (root.classList.contains("vc-page-cine-ready") && hasCineLayout() && hasCineInterior()) {
        if (curtainStillUp()) {
          if (root.classList.contains("vc-interaction-hold")) scheduleReleaseInteractionHold();
          else liftBootCurtain(true);
        }
        return;
      }
      /* Su /dashboard attendi interior cine (niente flash layout piatto). */
      if (isDashboardCineRoot()) {
        try {
          if (typeof window.__vcEnsureCommunityPageCineLayout === "function") {
            window.__vcEnsureCommunityPageCineLayout();
          } else if (typeof window.__vcPageHeroLayout === "function") {
            window.__vcPageHeroLayout({ force: true });
          }
        } catch (eDashLay) {}
        if (hasCineLayout() && hasCineInterior()) {
          revealWhenCssReady(0);
          return;
        }
        if (n < 60) {
          window.setTimeout(function () {
            waitForLayoutAndReveal(n + 1);
          }, 40);
          return;
        }
        revealWhenCssReady(0);
        return;
      }
      /* cineNoFlash7: aspetta layout class + interior (non solo DOM hero preesistente). */
      try {
        ensureHomeCineScript();
        if (typeof window.__vcEnsureCommunityPageCineLayout === "function") {
          window.__vcEnsureCommunityPageCineLayout();
        } else if (typeof window.__vcPageHeroLayout === "function") {
          window.__vcPageHeroLayout({ force: true });
        }
      } catch (ePhotoLay) {}
      if (hasCineLayout() && hasCineInterior() && landingCssReady()) {
        revealExcluded();
        return;
      }
      /* navRevealFast1: meno poll layout (prima ~4.8s su photo-bg) */
      var maxPoll = SITE_PHOTO_BG ? 40 : 28;
      var pollMs = SITE_PHOTO_BG ? 35 : 28;
      if (n >= maxPoll) {
        if (!landingCssReady() && Date.now() - bootStartedAt < HARD_FAILSAFE_MS) {
          window.setTimeout(function () {
            waitForLayoutAndReveal(n);
          }, 80);
          return;
        }
        /* cineNoFlash6: last try layout, then reveal (curtain covers until lift) */
        try {
          ensureHomeCineScript();
          if (typeof window.__vcPageHeroLayout === "function") {
            window.__vcPageHeroLayout({ force: true });
          }
        } catch (eLast) {}
        revealWhenCssReady(0);
        return;
      }
      window.setTimeout(function () {
        waitForLayoutAndReveal(n + 1);
      }, pollMs);
    }

    function bootPolishPage() {
      if (root.classList.contains("vc-user-leader-pending") || root.classList.contains("vc-user-leader-route")) {
        return;
      }
      ensureHomeCineScript();
      armRevealFailsafe(FAILSAFE_MS);
      waitForStylesheets(function () {
        markStylesReadyOnly();
        waitForLayoutAndReveal(0);
      });
    }

    function pathExcluded() {
      var p = String(location.pathname || "/").replace(/\/+$/, "") || "/";
      var profileId = false;
      try {
        var q = new URLSearchParams(location.search || "");
        var id = String(q.get("id") || q.get("userId") || q.get("uid") || "").trim();
        profileId = /^\d{17,20}$/.test(id);
      } catch (eQ) {}
      return (
        p === "/" ||
        /* /dashboard root non escluso: attende layout cine */
        p.indexOf("/dashboard/") === 0 ||
        /* browserParity1: seratafilm/evento restano soft-fx wait via revealWhenCssReady,
           ma non restano bloccati sul wait layout homepage-cine */
        p.indexOf("/seratafilm") === 0 ||
        p.indexOf("/evento") === 0 ||
        /* ticketsBootHang1: /tickets non ha cine-layout al primo paint — non aspettare hero homepage */
        p === "/tickets" ||
        p.indexOf("/tickets/") === 0 ||
        p === "/personalizza" ||
        /^\/users?\/\d{17,20}$/.test(p) ||
        /^\/user\/(personalizza|customize|custom)(\/|$)/.test(p) ||
        profileId ||
        root.classList.contains("vc-user-profile-pending") ||
        root.classList.contains("vc-rank-customize-pending")
      );
    }

    function revealWhenCssReady(n) {
      n = n || 0;
      /* bootNoPreGrad1: niente sipario giù senza soft-fx/landing */
      if (landingCssReady() || softFxIntentionallyOff()) {
        revealExcluded();
        return;
      }
      var softFailMs = HARD_FAILSAFE_MS + 2400;
      if (Date.now() - bootStartedAt >= softFailMs || n >= 120) {
        try {
          root.classList.add("vc-soft-fx-ready");
        } catch (eFs) {}
        revealExcluded();
        return;
      }
      window.setTimeout(function () {
        revealWhenCssReady(n + 1);
      }, 40);
    }

    if (!root.classList.contains("vc-site-polish")) return;

    var vinylHide =
      "html.vc-site-polish:not(.vc-cine-static-bg) .vc-home-cine::before{" +
      "opacity:0!important;visibility:hidden!important;animation:none!important}";
    if (!document.getElementById("vc-vinyl-hide-boot-css")) {
      var vinylEl = document.createElement("style");
      vinylEl.id = "vc-vinyl-hide-boot-css";
      vinylEl.textContent = vinylHide;
      (document.head || root).appendChild(vinylEl);
    }
    var anti = document.getElementById("vc-anti-fouc-css");
    if (anti) anti.textContent = "html,body{background:#100c09!important;color-scheme:dark}";

    window.__VC_PAGE_CINE_BOOT_RAN = true;
    window.__VC_PAGE_CINE_BOOT_VER = BOOT_VER;
    if (!document.getElementById("vc-anti-fouc-css")) {
      var s = document.createElement("style");
      s.id = "vc-anti-fouc-css";
      s.textContent = "html,body{background:#100c09}";
      (document.head || root).appendChild(s);
    }

    window.__vcWaitForCoreStyles = waitForStylesheets;
    window.__vcMarkStylesReady = markStylesReadyOnly;

    if (root.classList.contains("vc-user-leader-pending") || root.classList.contains("vc-user-leader-route")) {
      var obs = new MutationObserver(function () {
        if (!root.classList.contains("vc-user-leader-pending")) {
          obs.disconnect();
          if (root.classList.contains("vc-page-cine-ready")) {
            markStylesReadyOnly();
            return;
          }
          root.classList.add("vc-page-cine-boot");
          bootPolishPage();
        }
      });
      obs.observe(root, { attributes: true, attributeFilter: ["class"] });
      waitForStylesheets(function () {
        markStylesReadyOnly();
      });
      return;
    }

    if (pathExcluded()) {
      revealWhenCssReady(0);
      return;
    }

    if (!root.classList.contains("vc-page-cine-boot")) {
      root.classList.add("vc-page-cine-boot");
      ensureHomeCineScript();
      armRevealFailsafe(isDashboardCineRoot() ? Math.max(FAILSAFE_MS, 2200) : FAILSAFE_MS);
    } else if (isDashboardCineRoot()) {
      ensureHomeCineScript();
      armRevealFailsafe(Math.max(FAILSAFE_MS, 2200));
    }
    /* bootNoPreGrad1: sempre riscrivi gate (HTML inline vecchio rivelava pre-soft-fx) */
    try {
      var bootCss = document.getElementById("vc-page-cine-boot-css");
      var bootCssText =
        "html.vc-site-polish.vc-page-cine-boot,html.vc-site-polish.vc-page-cine-boot body{background:#100c09!important}" +
        cineGate +
        "html.vc-site-polish:not(.vc-cine-static-bg) .vc-home-cine::before{opacity:0!important;visibility:hidden!important;animation:none!important}";
      if (!bootCss) {
        bootCss = document.createElement("style");
        bootCss.id = "vc-page-cine-boot-css";
        (document.head || root).appendChild(bootCss);
      }
      bootCss.textContent = bootCssText;
    } catch (eBootCss) {}

    /* soft-fx pronto → rilascia hold se in attesa */
    try {
      document.addEventListener(
        "vc:soft-fx-ready",
        function () {
          try {
            if (root.classList.contains("vc-interaction-hold") || !root.classList.contains("vc-cine-curtain-off")) {
              scheduleReleaseInteractionHold();
            }
          } catch (eSoftEv) {}
        },
        { once: false }
      );
    } catch (eSoftListen) {}

    /* cineNoFlash5: NON rivelare subito — aspetta critical CSS + interior via bootPolishPage */
    if (SITE_PHOTO_BG && isDashboardCineRoot()) {
      try {
        markCoreStylesReady();
      } catch (eDashCore) {}
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        if (root.classList.contains("vc-user-leader-pending") || root.classList.contains("vc-user-leader-route")) return;
        bootPolishPage();
      });
    } else {
      if (!root.classList.contains("vc-user-leader-pending") && !root.classList.contains("vc-user-leader-route")) {
        bootPolishPage();
      }
    }

    window.setTimeout(function () {
      if (root.classList.contains("vc-page-cine-ready")) {
        if (curtainStillUp()) {
          if (root.classList.contains("vc-interaction-hold")) scheduleReleaseInteractionHold();
          else liftBootCurtain(true);
        }
        return;
      }
      if (!landingCssReady()) {
        /* keep dark gate until CSS arrives; last chance at hard+2s */
        window.setTimeout(function () {
          if (root.classList.contains("vc-page-cine-ready")) {
            if (curtainStillUp()) {
              if (root.classList.contains("vc-interaction-hold")) scheduleReleaseInteractionHold();
              else liftBootCurtain(true);
            }
            return;
          }
          try {
            if (typeof window.__vcPageHeroLayout === "function") {
              window.__vcPageHeroLayout({ force: true });
            }
          } catch (eLate2) {}
          revealWhenCssReady(0);
        }, standalone ? 400 : 800);
        return;
      }
      try {
        if (typeof window.__vcPageHeroLayout === "function") {
          window.__vcPageHeroLayout({ force: true });
        }
      } catch (eLate) {}
      revealWhenCssReady(0);
    }, isDashboardCineRoot() ? Math.max(HARD_FAILSAFE_MS, 2200) : HARD_FAILSAFE_MS);

    /* cineNoFlash8: watchdog — alza SOLO su failsafe duro, mai solo perché boot è stato tolto */
    try {
      var curtainWatchN = 0;
      var curtainWatch = window.setInterval(function () {
        curtainWatchN += 1;
        try {
          if (!curtainStillUp()) {
            if (curtainWatchN >= 8) window.clearInterval(curtainWatch);
            return;
          }
          if (Date.now() - bootStartedAt >= HARD_FAILSAFE_MS + 1500) {
            try {
              if (typeof window.__vcPageHeroLayout === "function") {
                window.__vcPageHeroLayout({ force: true });
              }
            } catch (eFsLay) {}
            revealWhenCssReady(0);
          }
        } catch (eWatch) {}
        if (curtainWatchN >= (standalone ? 30 : 50)) window.clearInterval(curtainWatch);
      }, standalone ? 280 : 450);
    } catch (eWatchArm) {}

    try {
      window.addEventListener("pageshow", function () {
        try {
          if (root.classList.contains("vc-page-cine-ready") && curtainStillUp()) {
            if (root.classList.contains("vc-interaction-hold")) scheduleReleaseInteractionHold();
            else liftBootCurtain(true);
          }
        } catch (ePs) {}
      });
      document.addEventListener("visibilitychange", function () {
        try {
          if (document.visibilityState !== "visible") return;
          if (root.classList.contains("vc-page-cine-ready") && curtainStillUp()) {
            if (root.classList.contains("vc-interaction-hold")) scheduleReleaseInteractionHold();
            else liftBootCurtain(true);
          }
        } catch (eVis) {}
      });
    } catch (eLife) {}
  } catch (e) {}
})();
/* scrollReloadNoYank1 */
/* violKill1 */
/* violPass4 */
/* violPass5 */
/* violPass7 */
/* notifHashYoYo1 */
