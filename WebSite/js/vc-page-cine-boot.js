/* 20261020refreshRestoreEnd1: mid-boot pin a 0; restore Y solo a fine unlock (no Y→0→Y) */
/* 20261020phoneBellTapFree1: post-sipario campanella sopra click-gate (z↑) + PE auto
   anche con chrome-bar-loading/interaction-hold — prima restava morta finché load. */
/* 20261015jsWakeIdle2: hold watchdog non eterno (500ms forever = 1k wake) */
/* 20261014cursorMqStable1 */
(function () {
  try {
    var root = document.documentElement;
    if (!root) return;

    /* loadClickGate1: gate DOM subito (anche pre-body) — click non devono passare */
    try {
      var earlyGate = document.getElementById("vc-load-click-gate");
      if (!earlyGate) {
        earlyGate = document.createElement("div");
        earlyGate.id = "vc-load-click-gate";
        earlyGate.setAttribute("aria-hidden", "true");
        earlyGate.setAttribute("data-vc", "loadClickGate1");
        earlyGate.style.cssText =
          "display:block;position:fixed;inset:0;z-index:2147483400;opacity:0;pointer-events:auto;background:transparent";
        (document.body || root).appendChild(earlyGate);
      }
    } catch (eEarlyGate) {}

    /* badgeZeroLoad1: nascondi campanella "0" prima che arrivi chrome-kit (flash mid-load) */
    try {
      var bz = document.getElementById("vc-badge-zero-boot-css");
      if (!bz) {
        bz = document.createElement("style");
        bz.id = "vc-badge-zero-boot-css";
        bz.setAttribute("data-vc", "badgeZeroLoad1");
        bz.textContent =
          "#vc-notif-badge.vc-notif-badge:empty," +
          "#vc-notif-badge.vc-notif-badge[data-count=\"0\"]," +
          "#vc-notif-badge.vc-notif-badge[hidden]," +
          ".vc-notif-summary > .vc-notif-badge:empty," +
          ".vc-notif-summary > .vc-notif-badge[data-count=\"0\"]," +
          ".vc-notif-summary > .vc-notif-badge[hidden]{" +
          "display:none!important;visibility:hidden!important;opacity:0!important;" +
          "width:0!important;min-width:0!important;height:0!important;padding:0!important;" +
          "overflow:hidden!important;pointer-events:none!important}";
        (document.head || root).appendChild(bz);
      }
      var bootBadge = document.getElementById("vc-notif-badge");
      if (bootBadge) {
        var bt = String(bootBadge.textContent || "").trim();
        if (!bt || bt === "0") {
          bootBadge.textContent = "";
          bootBadge.setAttribute("data-count", "0");
          bootBadge.setAttribute("hidden", "");
          bootBadge.hidden = true;
        }
      }
    } catch (eBadgeZero) {}

    /* loadGateOnce1: sipario resta fino a curtain-off (no flash pagina → loader) */
    function ensureHardSipario() {
      try {
        var hsRules =
          /* legalBootFast3: base rule SOLO pre-curtain (prima display:block globale batteva hide) */
          "html:not(.vc-cine-curtain-off) #vc-pre-cine-hard-sipario," +
          "html.vc-boot-loader-gate:not(.vc-cine-curtain-off) #vc-pre-cine-hard-sipario," +
          "html.vc-chrome-bar-loading:not(.vc-cine-curtain-off) #vc-pre-cine-hard-sipario{" +
          "position:fixed!important;inset:0!important;top:0!important;right:0!important;bottom:0!important;left:0!important;" +
          "width:100vw!important;height:100dvh!important;z-index:2147483000!important;margin:0!important;padding:0!important;" +
          "border:0!important;background:#100c09!important;opacity:1!important;visibility:visible!important;" +
          "pointer-events:auto!important;display:block!important}" +
          "html:not(.vc-cine-curtain-off) #vc-boot-load-screen{" +
          "display:flex!important;flex-direction:column!important;align-items:center!important;" +
          "justify-content:center!important;position:fixed!important;inset:0!important;" +
          "z-index:2147483100!important;opacity:1!important;visibility:visible!important;" +
          "pointer-events:auto!important;gap:.95rem!important;padding:1.5rem!important;" +
          "background-color:#0b0806!important;" +
          "background-image:radial-gradient(ellipse 92% 74% at 50% 38%,rgba(232,196,156,.16) 0%,rgba(28,20,14,.94) 52%,#0a0706 100%)!important}" +
          "html.vc-cine-curtain-off #vc-pre-cine-hard-sipario," +
          "html.vc-cine-curtain-off #vc-boot-load-screen{" +
          "display:none!important;opacity:0!important;visibility:hidden!important;pointer-events:none!important}";
        var hs = document.getElementById("vc-pre-cine-hard-sipario-css");
        if (!hs) {
          hs = document.createElement("style");
          hs.id = "vc-pre-cine-hard-sipario-css";
          (document.head || root).appendChild(hs);
        }
        hs.setAttribute("data-vc", "legalPerfPack1");
        hs.textContent = hsRules;
        var el = document.getElementById("vc-pre-cine-hard-sipario");
        if (!el) {
          el = document.createElement("div");
          el.id = "vc-pre-cine-hard-sipario";
          el.setAttribute("aria-hidden", "true");
          var host = document.body || root;
          if (host.firstChild) host.insertBefore(el, host.firstChild);
          else host.appendChild(el);
        }
        /* siparioLoadPage1 + homeSiparioLoad1: loader fullscreen durante sipario */
        try {
          var scr = document.getElementById("vc-boot-load-screen");
          if (!scr) {
            scr = document.createElement("div");
            scr.id = "vc-boot-load-screen";
            el.appendChild(scr);
          }
          scr.setAttribute("role", "status");
          scr.setAttribute("aria-live", "polite");
          scr.setAttribute("aria-label", "Caricamento…");
          scr.setAttribute("data-vc", "siparioLoadPage2");
          if (!scr.querySelector(".vc-boot-load-screen__title")) {
            scr.innerHTML =
              '<span class="vc-boot-load-screen__spin" aria-hidden="true"></span>' +
              '<p class="vc-boot-load-screen__title">Caricamento…</p>' +
              '<p class="vc-boot-load-screen__sub">Un momento…</p>';
          }
          /* homeSiparioLoad1: mentre sipario è su, MAI lasciare loader hidden/inline-none */
          if (!root.classList.contains("vc-cine-curtain-off")) {
            scr.hidden = false;
            scr.removeAttribute("hidden");
            try {
              scr.style.removeProperty("display");
              scr.style.removeProperty("opacity");
              scr.style.removeProperty("visibility");
            } catch (eClrScr) {}
            el.hidden = false;
            el.removeAttribute("hidden");
            try {
              el.style.removeProperty("display");
              el.style.removeProperty("opacity");
              el.style.removeProperty("visibility");
            } catch (eClrEl) {}
          }
        } catch (eScr) {}
      } catch (eHs) {}
    }
    function bakeCineLayoutClass() {
      try {
        var body = document.body;
        if (!body) return;
        if (body.classList.contains("vc-body--home")) return;
        if (root.classList.contains("vc-page-cine-boot") || body.querySelector(".vc-page-cine-hero, .vc-support-page-hero, #vc-page-intro")) {
          body.classList.add("vc-page-cine-layout");
          body.dataset.vcPageCineLayout = "1";
        }
      } catch (eBake) {}
    }
    ensureHardSipario();
    /* bugListBoot1B + loadClickGate1: blocca TUTTI i click finché barra/chrome load */
    try {
      var cgId = "vc-bugListBoot1-clickgate";
      var cg = document.getElementById(cgId);
      if (!cg) {
        cg = document.createElement("style");
        cg.id = cgId;
        (document.head || root).appendChild(cg);
      }
      cg.setAttribute("data-vc", "viewAsGateClear1");
      cg.textContent =
        /* viewAsGateClear1: gate su pre-armed / bar-loading / hold / sipario.
           Lock orfani (scroll-lock/loader senza barra) NON bloccano header. */
        "html:not(.vc-chrome-scroll-armed) #vc-load-click-gate," +
        "html.vc-chrome-bar-loading #vc-load-click-gate," +
        "html.vc-interaction-hold #vc-load-click-gate," +
        "html:not(.vc-cine-curtain-off) #vc-load-click-gate{" +
        "display:block!important;opacity:0!important;visibility:visible!important;" +
        "pointer-events:auto!important;position:fixed!important;inset:0!important;" +
        "z-index:2147483400!important;background:transparent!important;border:0!important;" +
        "margin:0!important;padding:0!important;cursor:inherit!important}" +
        "html.vc-chrome-scroll-armed.vc-cine-curtain-off:not(.vc-chrome-bar-loading):not(.vc-interaction-hold) #vc-load-click-gate{" +
        "display:none!important;pointer-events:none!important}" +
        /* no curtain-off: blocca nav/footer finché sipario è su */
        "html:not(.vc-cine-curtain-off) header a," +
        "html:not(.vc-cine-curtain-off) header button," +
        "html:not(.vc-cine-curtain-off) #header-quick-actions," +
        "html:not(.vc-cine-curtain-off) .vc-mobile-nav-drawer," +
        "html:not(.vc-cine-curtain-off) footer a," +
        "html:not(.vc-cine-curtain-off) main a," +
        "html:not(.vc-cine-curtain-off) main button," +
        /* chrome-bar-loading / hold: anche post-sipario — BLOCCA click */
        "html.vc-chrome-bar-loading header a," +
        "html.vc-chrome-bar-loading header button," +
        "html.vc-chrome-bar-loading #header-quick-actions," +
        "html.vc-chrome-bar-loading .vc-mobile-nav-drawer," +
        "html.vc-chrome-bar-loading footer a," +
        "html.vc-chrome-bar-loading main a," +
        "html.vc-chrome-bar-loading main button," +
        "html.vc-chrome-bar-loading a," +
        "html.vc-chrome-bar-loading button," +
        "html.vc-chrome-bar-loading [role=button]," +
        "html.vc-chrome-bar-loading summary," +
        "html.vc-interaction-hold header a," +
        "html.vc-interaction-hold header button," +
        "html.vc-interaction-hold #header-quick-actions," +
        "html.vc-interaction-hold .vc-mobile-nav-drawer," +
        "html.vc-interaction-hold footer a," +
        "html.vc-interaction-hold main a," +
        "html.vc-interaction-hold main button," +
        "html.vc-interaction-hold a," +
        "html.vc-interaction-hold button{pointer-events:none!important}" +
        /* post sipario+armed+!bar-loading: header cliccabile anche con lock orfani */
        "html.vc-chrome-scroll-armed.vc-cine-curtain-off:not(.vc-chrome-bar-loading):not(.vc-interaction-hold) header," +
        "html.vc-chrome-scroll-armed.vc-cine-curtain-off:not(.vc-chrome-bar-loading):not(.vc-interaction-hold) header a," +
        "html.vc-chrome-scroll-armed.vc-cine-curtain-off:not(.vc-chrome-bar-loading):not(.vc-interaction-hold) header button," +
        "html.vc-chrome-scroll-armed.vc-cine-curtain-off:not(.vc-chrome-bar-loading):not(.vc-interaction-hold) #header-quick-actions," +
        "html.vc-chrome-scroll-armed.vc-cine-curtain-off:not(.vc-chrome-bar-loading):not(.vc-interaction-hold) #header-quick-actions button," +
        "html.vc-chrome-scroll-armed.vc-cine-curtain-off:not(.vc-chrome-bar-loading):not(.vc-interaction-hold) #header-quick-actions summary," +
        "html.vc-chrome-scroll-armed.vc-cine-curtain-off:not(.vc-chrome-bar-loading):not(.vc-interaction-hold) #vc-view-as-launch{" +
        "pointer-events:auto!important}" +
        /* phoneBellTapFree1: sipario off → campanella subito (sopra gate z=2147483400) */
        "html.vc-cine-curtain-off #header-quick-actions," +
        "html.vc-cine-curtain-off #header-quick-actions #vc-notif-dropdown," +
        "html.vc-cine-curtain-off #header-quick-actions .vc-notif-dropdown," +
        "html.vc-cine-curtain-off #header-quick-actions .vc-notif-summary," +
        "html.vc-cine-curtain-off #header-quick-actions summary.vc-notif-summary," +
        "html.vc-cine-curtain-off #vc-notif-dropdown," +
        "html.vc-cine-curtain-off .vc-notif-dropdown," +
        "html.vc-cine-curtain-off.vc-chrome-bar-loading #header-quick-actions," +
        "html.vc-cine-curtain-off.vc-chrome-bar-loading #vc-notif-dropdown," +
        "html.vc-cine-curtain-off.vc-chrome-bar-loading .vc-notif-summary," +
        "html.vc-cine-curtain-off.vc-interaction-hold #header-quick-actions," +
        "html.vc-cine-curtain-off.vc-interaction-hold #vc-notif-dropdown," +
        "html.vc-cine-curtain-off.vc-interaction-hold .vc-notif-summary," +
        "html.vc-cine-curtain-off.vc-chrome-bar-loading #header-quick-actions summary," +
        "html.vc-cine-curtain-off.vc-interaction-hold #header-quick-actions summary{" +
        "pointer-events:auto!important;position:relative!important;" +
        "z-index:2147483501!important}" +
        "html.vc-cine-curtain-off #header-quick-actions .vc-notif-summary," +
        "html.vc-cine-curtain-off #header-quick-actions summary.vc-notif-summary," +
        "html.vc-cine-curtain-off #vc-notif-dropdown > summary{" +
        "pointer-events:auto!important;z-index:2147483502!important}" +
        /* phoneTopBlurBell1: telefono — niente shadow/blur nera sotto barra/nav post-sipario */
        "@media (max-width:1199.98px),(pointer:coarse){" +
        "html.vc-cine-curtain-off body.vc-body > header .vc-nav-shell," +
        "html.vc-cine-curtain-off body.vc-body header .vc-nav-shell," +
        "html.vc-cine-curtain-off body.vc-body header .vc-nav-shell.vc-glass," +
        "html.vc-cine-curtain-off.vc-chrome-bar-loading body.vc-body header .vc-nav-shell," +
        "html.vc-cine-curtain-off #vc-site-progress," +
        "html.vc-cine-curtain-off #vc-site-progress__bar," +
        "html.vc-cine-curtain-off #vc-site-progress::before," +
        "html.vc-cine-curtain-off #vc-site-progress::after{" +
        "backdrop-filter:none!important;-webkit-backdrop-filter:none!important;" +
        "filter:none!important;-webkit-filter:none!important;box-shadow:none!important;" +
        "text-shadow:none!important}}" +
        /* sipario e ::before devono catturare i click durante load */
        "html:not(.vc-cine-curtain-off)::before{pointer-events:auto!important}" +
        "#vc-pre-cine-hard-sipario{pointer-events:auto!important}";
      if (!document.getElementById("vc-load-click-gate")) {
        var gate = document.createElement("div");
        gate.id = "vc-load-click-gate";
        gate.setAttribute("aria-hidden", "true");
        gate.setAttribute("data-vc", "loadClickGate1");
        (document.body || root).appendChild(gate);
      }
    } catch (eCg) {}
    bakeCineLayoutClass();
    /* cursorWinFlashKill1: arm vinyl pin SUBITO (non aspettare chrome-ui ~5s) */
    try {
      var coarseOnly =
        window.matchMedia &&
        window.matchMedia("(hover: none) and (pointer: coarse)").matches &&
        !(window.matchMedia("(pointer: fine)").matches);
      if (!coarseOnly) {
        root.classList.add("vc-site-cursor-ok");
        var pre = new Image();
        pre.src = "/images/musicrecordspin-cursor-static.png";
        var pre2 = new Image();
        pre2.src = "/images/coffe-cursor-static.png";
      }
    } catch (eCurEarly) {}
    if (document.readyState === "loading") {
      document.addEventListener(
        "DOMContentLoaded",
        function () {
          ensureHardSipario();
          bakeCineLayoutClass();
        },
        { once: true },
      );
    }

    /* bootNoPreGrad2 EARLY: sipario soft-fx/curtain PRIMA di tutto (anti flash flat) */
    try {
      var earlySip = document.getElementById("vc-cine-early-sipario");
      if (!earlySip) {
        earlySip = document.createElement("style");
        earlySip.id = "vc-cine-early-sipario";
        (document.head || root).appendChild(earlySip);
      }
      earlySip.setAttribute("data-vc", "loadCueBakeFast1");
      earlySip.textContent =
        /* siparioThemeGate1: niente gate theme-light-ready (nero fisso se theme null) */
        "html.vc-site-polish:not(.vc-soft-fx-ready):not(.vc-soft-fx-off) body.vc-body>main," +
        "html.vc-site-polish:not(.vc-soft-fx-ready):not(.vc-soft-fx-off) body.vc-body>header," +
        "html.vc-site-polish:not(.vc-soft-fx-ready):not(.vc-soft-fx-off) body.vc-body>footer," +
        "html.vc-site-polish:not(.vc-look-core-ready):not(.vc-soft-fx-off) body.vc-body>main," +
        "html.vc-site-polish:not(.vc-look-core-ready):not(.vc-soft-fx-off) body.vc-body>header," +
        "html.vc-site-polish:not(.vc-look-core-ready):not(.vc-soft-fx-off) body.vc-body>footer," +
        "html.vc-site-polish:not(.vc-cine-curtain-off) body.vc-body>main," +
        "html.vc-site-polish:not(.vc-cine-curtain-off) body.vc-body>header," +
        "html.vc-site-polish:not(.vc-cine-curtain-off) body.vc-body>footer," +
        "html.vc-page-cine-boot:not(.vc-cine-curtain-off) body.vc-body>main," +
        "html.vc-page-cine-boot:not(.vc-cine-curtain-off) body.vc-body>header," +
        "html.vc-page-cine-boot:not(.vc-cine-curtain-off) body.vc-body>footer{" +
        "opacity:0!important;visibility:hidden!important;pointer-events:none!important}" +
        /* siparioNoYoyoReady1: ::before solo senza curtain-off (mai yoyo post-reveal) */
        "html.vc-site-polish.vc-page-cine-boot:not(.vc-cine-curtain-off)::before," +
        "html.vc-site-polish.vc-page-cine-boot:not(.vc-cine-curtain-off):not(.vc-page-cine-ready)::before," +
        "html.vc-site-polish.vc-page-cine-boot:not(.vc-look-core-ready)::before," +
        "html.vc-site-polish:not(.vc-cine-curtain-off)::before," +
        "html.vc-page-cine-boot:not(.vc-cine-curtain-off)::before," +
        "html.vc-site-polish:not(.vc-soft-fx-ready):not(.vc-soft-fx-off)::before," +
        "html.vc-site-polish:not(.vc-look-core-ready):not(.vc-soft-fx-off)::before{" +
        "content:\"\"!important;position:fixed!important;inset:0!important;top:0!important;right:0!important;" +
        "bottom:0!important;left:0!important;width:100vw!important;height:100dvh!important;" +
        "z-index:2147482990!important;margin:0!important;padding:0!important;border:0!important;" +
        "background:#100c09!important;opacity:1!important;visibility:visible!important;" +
        "pointer-events:auto!important;display:block!important}" +
        "html.vc-cine-curtain-off.vc-soft-fx-ready.vc-look-core-ready::before," +
        "html.vc-cine-curtain-off.vc-soft-fx-off::before{" +
        "content:none!important;display:none!important;opacity:0!important;visibility:hidden!important;pointer-events:none!important}" +
        "html.vc-site-polish:not(.vc-look-core-ready):not(.vc-soft-fx-off) body.vc-body>main," +
        "html.vc-site-polish:not(.vc-look-core-ready):not(.vc-soft-fx-off) body.vc-body>header," +
        "html.vc-site-polish:not(.vc-look-core-ready):not(.vc-soft-fx-off) body.vc-body>footer{" +
        "opacity:0!important;visibility:hidden!important;pointer-events:none!important}";
    } catch (eEarly) {}

    /* Photo-bg: niente blank lungo su DCL. */
    /* Marker: bootOneShot2 — un solo gate (CSS≠release; release=chrome done) */
    var BOOT_VER = "legalPerfPack1";

    function isCineBaked() {
      try {
        var b = document.body;
        if (!b) return false;
        if (b.getAttribute("data-vc-cine-baked") === "1") return true;
        if (b.dataset && b.dataset.vcCineBaked === "1") return true;
        return Boolean(document.querySelector(".vc-page-cine-hero__inner > .vc-hero-head"));
      } catch (eBaked) {
        return false;
      }
    }

    /* bootBolt2: CSS critico sync — sipario non aspetta il landing-core da 1MB */
    try {
      if (!document.getElementById("vc-boot-critical-css")) {
        var crit = document.createElement("style");
        crit.id = "vc-boot-critical-css";
        crit.setAttribute("data-vc", "bootBolt2");
        crit.textContent =
          ".vc-support-page-hero a.vc-header-pill,.vc-support-page-hero a.vc-home-cine-cta," +
          ".vc-page-cine-hero a.vc-header-pill,.vc-page-cine-hero a.vc-home-cine-cta," +
          ".vc-home-cine-hero a.vc-header-pill,.vc-home-cine-hero a.vc-home-cine-cta{" +
          "display:inline-flex!important;align-items:center!important;justify-content:center!important;" +
          "gap:.35rem!important;box-sizing:border-box!important;min-height:0!important;height:auto!important;" +
          "min-width:0!important;width:auto!important;max-width:100%!important;flex:0 1 auto!important;" +
          "padding:.45rem 1.1rem!important;font-size:.72rem!important;line-height:1.2!important;" +
          "letter-spacing:.08em!important;text-transform:uppercase!important;border-radius:9999px!important;" +
          "text-decoration:none!important}" +
          ".vc-support-page-hero a.vc-home-cine-cta,.vc-page-cine-hero a.vc-home-cine-cta," +
          ".vc-home-cine-hero a.vc-home-cine-cta{" +
          "background:linear-gradient(180deg,#f0dcc8 0%,#d4a888 58%,#b88968 100%)!important;" +
          "background-color:#d4a888!important;color:rgba(22,14,9,.98)!important;" +
          "-webkit-text-fill-color:rgba(22,14,9,.98)!important;border:1px solid rgba(212,168,136,.48)!important;" +
          "box-shadow:none!important;font-weight:800!important}" +
          ".vc-support-page-hero a.vc-header-pill:not(.vc-home-cine-cta)," +
          ".vc-page-cine-hero a.vc-header-pill:not(.vc-home-cine-cta)," +
          ".vc-home-cine-hero a.vc-header-pill:not(.vc-home-cine-cta){" +
          "background:transparent!important;background-image:none!important;" +
          "border:1px solid rgba(212,168,136,.42)!important;color:#f7eadb!important;" +
          "-webkit-text-fill-color:#f7eadb!important;box-shadow:none!important;font-weight:700!important}" +
          ".vc-support-page-hero [class*=flex-wrap]:has(>a.vc-header-pill){" +
          "display:flex!important;flex-wrap:wrap!important;align-items:center!important;" +
          "justify-content:center!important;gap:.7rem!important;margin-inline:auto!important}" +
          "body.vc-page-cine-layout main,body.vc-body main{color:#f7eadb}";
        (document.head || root).appendChild(crit);
      }
    } catch (eCrit) {}
    /* preloadViolKill1: no late style preload — sheet già in head; preload post-parse = unused warn */

    /* rolesLoaderAlign1: rimuovi shell-visible legacy su /ruoli (loader = altri) */
    try {
      var staleRolesShell = document.getElementById("vc-roles-shell-visible-css");
      if (staleRolesShell && staleRolesShell.parentNode) staleRolesShell.parentNode.removeChild(staleRolesShell);
    } catch (eRolesShell) {}
    var CRITICAL_FORCE_MS = 0;
    var FAILSAFE_MS = 0;
    var HARD_FAILSAFE_MS = 0;
    try {
      window.__vcCineBootStartedAt = Date.now();
      window.__VC_PAGE_CINE_BOOT_VER = BOOT_VER;
    } catch (eBootAt) {}

    function chromeBarStillLoading() {
      try {
        /* toastSyncAll2: solo LoadDone (VisualReady può arrivare prima → early curtain) */
        if (window.__vcChromeLoadDone === true) return false;
        var age = Date.now() - Number(window.__vcCineBootStartedAt || Date.now());
        /* legalBootFast1: soft+look ready → alza sipario (barra/toast continuano sotto).
           Prima: HARD 6.5s + wait chrome-ui = policy a 13s + FOUC yoyo. */
        var cssPaintReady = false;
        try {
          cssPaintReady =
            (root.classList.contains("vc-soft-fx-ready") ||
              root.classList.contains("vc-soft-fx-off")) &&
            (root.classList.contains("vc-look-core-ready") ||
              root.classList.contains("vc-soft-fx-off")) &&
            !window.__vcSiparioCssGateHold;
        } catch (eCssR) {}
        /* subito: soft+look ready = barra non blocca sipario (toast continua) */
        if (cssPaintReady) return false;
        /* toastSyncAll2: failsafe solo ~6.5s — NON alzare sipario a 2.8s (2° load) */
        var HARD_MS = 6500;
        if (age >= HARD_MS) return false;
        var prog = document.getElementById("vc-site-progress");
        if (!window.__vcChromeUiBooted) return true;
        if (window.__vcChromeLoadDone !== true) return true;
        if (prog && prog.classList.contains("is-loading")) return true;
        if (root.classList.contains("vc-chrome-bar-loading")) return true;
      } catch (eChrome) {}
      return false;
    }

    function canLiftCurtainNow(force) {
      try {
        if (boardsViewStillPending()) return false;
      } catch (eBd) {}
      try {
        /* legalBootFast1: soft+look ready → lift anche con boot-loader-gate sticky
           (gate aspettava un loader pagina che su policy non esiste → sipario 6–13s) */
        var cssOkLift =
          (root.classList.contains("vc-soft-fx-ready") ||
            root.classList.contains("vc-soft-fx-off")) &&
          (root.classList.contains("vc-look-core-ready") ||
            root.classList.contains("vc-soft-fx-off")) &&
          !window.__vcSiparioCssGateHold;
        if (cssOkLift) {
          /* legalSiparioCpu2: min ~800ms loader (no wait chrome = 9s neri) */
          try {
            if (isLegalBootPage()) {
              var ageLift =
                Date.now() - Number(window.__vcCineBootStartedAt || Date.now());
              if (ageLift < 800) return false;
            }
          } catch (eLegLift) {}
          return true;
        }
      } catch (eCssLift) {}
      try {
        /* aspetta che il loader pagina esista (gate) — poi alza: si vede loader, non il contenuto */
        if (bootLoaderGateActive()) return false;
      } catch (eGate) {}
      try {
        if (chromeBarStillLoading()) return false;
      } catch (eBar) {}
      return true;
    }

    function isLegalBootPage() {
      try {
        if (document.body && document.body.classList.contains("vc-legal-page")) return true;
        if (document.getElementById("vc-page-legal-css")) return true;
        if (document.querySelector('link[href*="vc-page-legal"]')) return true;
        return /\/(privacy|terms|cookie|copyright|dati|regole)(\/|$)/i.test(
          String(location.pathname || "/"),
        );
      } catch (eLeg) {
        return false;
      }
    }

    function boardsViewStillPending() {
      try {
        if (!root.classList.contains("vc-boards-view-pending")) return false;
        if (window.__vcBoardsContentReady) return false;
        var started = Number(window.__vcCineBootStartedAt || 0) || Date.now();
        var age = Date.now() - started;
        /* toastSyncAll1: boards pending fino a ready o hard ~6.5s (no 2.8s early) */
        return age < 6500;
      } catch (eBd) {
        return false;
      }
    }

    function bootLoaderGateActive() {
      /* loadGateFirst1: html.vc-boot-loader-gate finché non c'è pending/loader visibile/ready */
      try {
        if (!(root.classList.contains("vc-boot-loader-gate") || root.getAttribute("data-vc-boot-loader") === "1")) {
          return false;
        }
        if (root.classList.contains("vc-page-cine-ready") && root.classList.contains("vc-cine-curtain-off")) {
          return false;
        }
        if (
          root.classList.contains("vc-user-leader-pending") ||
          root.classList.contains("vc-user-profile-pending") ||
          root.classList.contains("vc-rank-customize-pending") ||
          root.classList.contains("vc-custom-profile-pending") ||
          root.classList.contains("vc-session-verify-pending") ||
          (root.classList.contains("vc-staff-access-pending") && !root.classList.contains("vc-staff-app-revealed"))
        ) {
          return false;
        }
        var live = document.querySelector(
          '.vc-ul-loading:not([hidden]),#vc-ul-loading:not([hidden]),#vc-roles-loading:not([hidden]),' +
            '#vc-staff-loading:not([hidden]):not(.vc-staff-loading--hidden),#vc-shared-boot-overlay:not([hidden]),' +
            '#vc-rank-customize-loading:not([hidden]),#vc-custom-profile-loading:not([hidden]),' +
            '#vc-dashboard-loading:not([hidden]),#vc-dashboard-guild-loading:not([hidden]),' +
            '#vc-hw-loading:not([hidden]),#vc-seratafilm-loading:not([hidden]),' +
            '#vc-user-profile-loading:not([hidden]),.vc-reviews-gate:not([hidden]):not(.vc-reviews-gate--dismissed)'
        );
        return !live;
      } catch (eGate) {
        return false;
      }
    }
    function pageLoaderStillBlocking() {
      try {
        /* profileRelockKill2: chrome già armed → spinner profilo non tiene sipario/lock */
        var chromeOpenBlk = false;
        try {
          chromeOpenBlk =
            root.classList.contains("vc-chrome-scroll-armed") ||
            (window.__vcChromeLoadDone === true &&
              (window.__vcChromeScrollArmed === true ||
                root.classList.contains("vc-cine-curtain-off") ||
                root.classList.contains("vc-page-cine-ready")));
        } catch (eChromeBlk) {
          chromeOpenBlk = false;
        }
        if (chromeBarStillLoading()) return true;
        /* flashKillReady1: non usare la class stessa come fonte (loop sticky) */
        if (boardsViewStillPending()) return true;
        if (root.classList.contains("vc-user-leader-pending")) return true;
        if (!chromeOpenBlk && root.classList.contains("vc-user-profile-pending")) return true;
        if (root.classList.contains("vc-rank-customize-pending")) return true;
        if (root.classList.contains("vc-custom-profile-pending")) return true;
        if (root.classList.contains("vc-session-verify-pending")) return true;
        if (root.classList.contains("vc-staff-access-pending") && !root.classList.contains("vc-staff-app-revealed")) {
          return true;
        }
        /* inboxFreezeKill2: vc-notif-staff-loading NON è più gate di scroll/cine */
        var liveSel =
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
          '#vc-custom-profile-loading:not([hidden])';
        if (!chromeOpenBlk) {
          liveSel += ',#vc-user-profile-loading:not([hidden])';
        }
        var live = document.querySelector(liveSel);
        return !!live;
      } catch (eBlk) {
        return false;
      }
    }

    /* bootBolt1: promote critical sheets ASAP (no print→all flash) */
    try {
      [
        "vc-look-core-css",
        "vc-soft-fx-css",
        "vc-chrome-polish-css",
        "vc-landing-core-css",
        "vc-landing-ext-css",
      ].forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.media = "all";
        el.removeAttribute("onload");
      });
      var coreLinks = document.querySelectorAll('link[rel="stylesheet"][href*="vc-landing-core"]');
      for (var ci = 0; ci < coreLinks.length; ci += 1) {
        try {
          coreLinks[ci].media = "all";
        } catch (eCoreM) {}
      }
    } catch (eSoftPromote) {}

    /* scrollUnlockNoLanding2: CSS gate locks html.vc-site-polish:not(.vc-cine-curtain-off)
       with overflow:hidden — clearing inline styles alone is NOT enough. */
    function forceUnlockPageScroll() {
      try {
        if (root.classList.contains("vc-interaction-hold") && !releaseHoldDone) {
          return;
        }
      } catch (eHoldGate) {}
      /* schedaBootCue1: non togliere sipario/boot finché scheda non è pronta */
      try {
        if (boardsViewStillPending()) return;
      } catch (eBdUnlock) {}
      try {
        var awaitingBootLoader = false;
        var loaderBlocking = false;
        /* loadGateOnce1: check loader/barra PRIMA di alzare sipario (no flash pagina) */
        try {
          awaitingBootLoader = bootLoaderGateActive();
          loaderBlocking = pageLoaderStillBlocking() || awaitingBootLoader;
        } catch (eKeep) {
          awaitingBootLoader = false;
          loaderBlocking = false;
        }
        if (
          (root.classList.contains("vc-soft-fx-ready") || softFxIntentionallyOff()) &&
          (root.classList.contains("vc-look-core-ready") || softFxIntentionallyOff()) &&
          themeSheetsReady() &&
          canLiftCurtainNow(false)
        ) {
          /* siparioCssWait2: cine-boot non alza se CSS gate ancora hold */
          try {
            if (window.__vcSiparioCssGateHold) {
              if (
                typeof window.__vcReclaimSiparioCssGate === "function" &&
                !window.__vcReclaimSiparioCssGate()
              ) {
                return;
              }
              if (window.__vcSiparioCssGateHold) return;
            }
          } catch (eCssHold) {
            return;
          }
          try {
            root.classList.add("vc-theme-light-ready");
          } catch (eTh) {}
          root.classList.add("vc-cine-curtain-off");
          try {
            root.classList.remove("vc-boot-loader-gate");
            root.removeAttribute("data-vc-boot-loader");
          } catch (eGateClr) {}
          awaitingBootLoader = false;
          try {
            loaderBlocking = pageLoaderStillBlocking();
          } catch (eLb2) {
            loaderBlocking = false;
          }
        }
        /* scrollKill1 + bootScrollTopUntilEnd1: non togliere top-lock se restore ancora
           in coda e chrome non unlocked — altrimenti viewport salta a Y mid-boot. */
        root.classList.remove("vc-scroll-soft-lock");
        try {
          var keepTopLock =
            window.__vcChromeVisualReady !== 1 &&
            !window.__vcPtrRestoreDone &&
            (Math.max(
              0,
              Number(window.__vcPtrRestoreTargetY || 0) || 0,
              Number(window.__vcPtrRestoreY || 0) || 0,
              Number(window.__vcViewStateRestoreY || 0) || 0,
            ) >= 2 ||
              root.classList.contains("vc-chrome-bar-loading") ||
              (root.classList.contains("vc-page-cine-boot") &&
                !root.classList.contains("vc-cine-curtain-off")));
          if (!keepTopLock) {
            root.classList.remove("vc-scroll-reload-top-lock", "vc-ptr-scroll-restore-pending");
          }
        } catch (eKeepLock) {
          root.classList.remove("vc-scroll-reload-top-lock", "vc-ptr-scroll-restore-pending");
        }
        if (
          awaitingBootLoader &&
          !root.classList.contains("vc-page-cine-ready") &&
          !root.classList.contains("vc-cine-curtain-off")
        ) {
          root.classList.add("vc-loading-scroll-lock", "vc-loader-blocking-live", "vc-page-cine-boot");
        } else if (!loaderBlocking && root.classList.contains("vc-cine-curtain-off")) {
          /* barOneShot1: sipario off ≠ unlock se barra/load ancora vivi */
          var barAlive = false;
          try {
            barAlive =
              window.__vcChromeLoadDone !== true ||
              window.__vcLoadBarCompleting ||
              !window.__vcLoadBarFullPainted ||
              root.classList.contains("vc-chrome-bar-loading") ||
              !!(document.getElementById("vc-site-progress") &&
                document.getElementById("vc-site-progress").classList.contains("is-loading"));
          } catch (eBarA) {
            barAlive = window.__vcChromeLoadDone !== true;
          }
          root.classList.remove("vc-page-cine-boot");
          if (barAlive) {
            root.classList.add("vc-loading-scroll-lock", "vc-loader-blocking-live");
          } else {
            root.classList.remove("vc-loading-scroll-lock", "vc-loader-blocking-live");
          }
        } else if (loaderBlocking) {
          /* 20261014uiFixPack1: loader/barra ancora vivi → tieni lock anche a sipario alzato */
          root.classList.add("vc-loading-scroll-lock", "vc-loader-blocking-live");
        } else if (
          !root.classList.contains("vc-page-cine-ready") &&
          !root.classList.contains("vc-cine-curtain-off")
        ) {
          root.classList.add("vc-loading-scroll-lock", "vc-loader-blocking-live");
        }
        try {
          /* ptrScrollRestore1: NON segnare Done qui — altrimenti a fine loading resta in alto.
             Done solo se non c’è Y da ripristinare (o già atterrato). */
          var wantRestoreY = 0;
          try {
            wantRestoreY = Math.max(
              0,
              Number(window.__vcPtrRestoreTargetY || 0) || 0,
              Number(window.__vcPtrRestoreY || 0) || 0,
              Number(window.__vcViewStateRestoreY || 0) || 0,
            );
            if (wantRestoreY < 2) {
              var attrRy = root.getAttribute("data-vc-ptr-restore-y");
              wantRestoreY = Math.max(0, Number(attrRy || 0) || 0);
            }
          } catch (eWy) {
            wantRestoreY = 0;
          }
          var liveY = 0;
          try {
            liveY = Math.max(
              0,
              Math.round(
                Number(window.pageYOffset) ||
                  Number((document.documentElement && document.documentElement.scrollTop) || 0) ||
                  0,
              ),
            );
          } catch (eLy) {}
          if (wantRestoreY < 2 || window.__vcDiscardScrollRestore) {
            window.__vcPtrRestoreDone = 1;
          } else if (liveY >= wantRestoreY - 80) {
            window.__vcPtrRestoreDone = 1;
          } else {
            window.__vcPtrRestoreDone = 0;
            window.__vcPtrRestoreUnpinStarted = 0;
            try {
              window.setTimeout(function () {
                try {
                  if (typeof window.__vcPtrFinalizeScroll === "function") {
                    window.__vcPtrFinalizeScroll();
                  }
                } catch (eF) {}
              }, 60);
              window.setTimeout(function () {
                try {
                  if (
                    !window.__vcPtrRestoreDone &&
                    typeof window.__vcPtrFinalizeScroll === "function"
                  ) {
                    window.__vcPtrFinalizeScroll();
                  }
                } catch (eF2) {}
              }, 400);
            } catch (eArm) {}
          }
          /* bootScrollHard1: non ammazzare i guard wheel finché hold/lock/loader vivi */
          var stillLocked =
            root.classList.contains("vc-interaction-hold") ||
            root.classList.contains("vc-loading-scroll-lock") ||
            root.classList.contains("vc-loader-blocking-live") ||
            root.classList.contains("vc-chrome-bar-loading") ||
            pageLoaderStillBlocking();
          if (!stillLocked) window.__vcBootScrollGuardsKilled = 1;
        } catch (eDone) {}
        try {
          var topCss = document.getElementById("vc-scroll-reload-top-lock-css");
          if (topCss && topCss.parentNode) topCss.parentNode.removeChild(topCss);
        } catch (eTopCss) {}
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
      /* bootBolt1: failsafe aggressivi — happy path = CSS core+look */
      CRITICAL_FORCE_MS = desktop ? 700 : phone ? 900 : 800;
      FAILSAFE_MS = desktop ? 900 : phone ? 1200 : 1000;
      HARD_FAILSAFE_MS = desktop ? 1400 : phone ? 1800 : 1600;
    } else {
      CRITICAL_FORCE_MS = desktop ? 600 : phone ? 800 : 700;
      FAILSAFE_MS = desktop ? 800 : phone ? 1100 : 900;
      HARD_FAILSAFE_MS = desktop ? 1200 : phone ? 1600 : 1400;
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
    /* bootKitAccel1: locks/sipario in vc-site-boot-kit.css — cineGate = delta hold/sheet */
    try {
      (function ensureBootKitFromCine() {
        var ver = "20261011consoleClean1";
        if (document.getElementById("vc-site-boot-kit-css") || document.querySelector('link[href*="vc-site-boot-kit"]')) return;
        var link = document.createElement("link");
        link.id = "vc-site-boot-kit-css";
        link.rel = "stylesheet";
        link.href = "/css/vc-site-boot-kit." + ver + ".css?v=" + ver;
        link.setAttribute("data-vc", "consoleClean1");
        (document.head || root).insertBefore(link, (document.head || root).firstChild);
      })();
    } catch (eBk) {}
    /* gestureLockBoot1 + bootKitAccel1: keep unlock/hold delta (core lock in boot-kit) */
    var cineGate =
      "html.vc-site-polish:not(.vc-cine-curtain-off):not(.vc-page-cine-ready)," +
      "html.vc-site-polish:not(.vc-cine-curtain-off):not(.vc-page-cine-ready) body," +
      "html.vc-page-cine-boot:not(.vc-cine-curtain-off):not(.vc-page-cine-ready)," +
      "html.vc-page-cine-boot:not(.vc-cine-curtain-off):not(.vc-page-cine-ready) body," +
      /* scrollKill1: soft-fx gate NON deve tenere overflow:hidden a sipario alzato */
      "html.vc-site-polish:not(.vc-cine-curtain-off):not(.vc-page-cine-ready):not(.vc-soft-fx-ready):not(.vc-soft-fx-off)," +
      "html.vc-site-polish:not(.vc-cine-curtain-off):not(.vc-page-cine-ready):not(.vc-soft-fx-ready):not(.vc-soft-fx-off) body{" +
      "overflow:hidden!important;overflow-x:hidden!important;overflow-y:hidden!important;" +
      "overscroll-behavior:none!important;touch-action:none!important;pointer-events:auto!important;" +
      "height:100%!important;max-height:100dvh!important}" +
      "html.vc-site-polish:not(.vc-cine-curtain-off) *,html.vc-page-cine-boot:not(.vc-cine-curtain-off) *{" +
      "touch-action:none!important;overscroll-behavior:none!important}" +
      /* gestureLockBoot1: curtain-off libera SOLO senza lock/barra/load */
      "html.vc-cine-curtain-off:not(.vc-chrome-bar-loading):not(.vc-loading-scroll-lock):not(.vc-loader-blocking-live):not(.vc-interaction-hold)," +
      "html.vc-page-cine-ready:not(.vc-chrome-bar-loading):not(.vc-loading-scroll-lock):not(.vc-loader-blocking-live):not(.vc-interaction-hold)," +
      "html.vc-cine-curtain-off.vc-scroll-reload-top-lock:not(.vc-chrome-bar-loading)," +
      "html.vc-page-cine-ready.vc-scroll-reload-top-lock:not(.vc-chrome-bar-loading){" +
      "overflow-x:hidden!important;overflow-y:auto!important;" +
      "overscroll-behavior:auto!important;touch-action:pan-y!important;" +
      "height:auto!important;max-height:none!important}" +
      "html.vc-cine-curtain-off:not(.vc-chrome-bar-loading):not(.vc-loading-scroll-lock):not(.vc-loader-blocking-live):not(.vc-interaction-hold) body," +
      "html.vc-page-cine-ready:not(.vc-chrome-bar-loading):not(.vc-loading-scroll-lock):not(.vc-loader-blocking-live):not(.vc-interaction-hold) body," +
      "html.vc-cine-curtain-off.vc-scroll-reload-top-lock:not(.vc-chrome-bar-loading) body," +
      "html.vc-page-cine-ready.vc-scroll-reload-top-lock:not(.vc-chrome-bar-loading) body{" +
      "overflow:visible!important;overflow-x:visible!important;overflow-y:visible!important;" +
      "touch-action:pan-y!important;height:auto!important;max-height:none!important;" +
      "position:static!important;top:auto!important}" +
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
      "pointer-events:auto!important;touch-action:none!important;overscroll-behavior:none!important}" +
      /* bootReadyPaint1: sipario giù solo con soft-fx AND look-core (come home) */
      "html.vc-cine-curtain-off.vc-soft-fx-ready.vc-look-core-ready #vc-cine-boot-curtain," +
      "html.vc-cine-curtain-off.vc-soft-fx-off #vc-cine-boot-curtain," +
      "html.vc-cine-curtain-off.vc-soft-fx-ready.vc-look-core-ready::before," +
      "html.vc-cine-curtain-off.vc-soft-fx-off::before{" +
      "display:none!important;opacity:0!important;visibility:hidden!important;pointer-events:none!important}" +
      "html.vc-site-polish:not(.vc-look-core-ready):not(.vc-soft-fx-off)::before{" +
      "content:\"\"!important;position:fixed!important;inset:0!important;" +
      "z-index:2147482990!important;background:#100c09!important;opacity:1!important;" +
      "visibility:visible!important;pointer-events:auto!important;display:block!important}" +
      /* loadScrollLockFs1 / barScrollLock1 / hamScrollBarGate1: ready sblocca scroll SOLO senza loader/lock/hold/barra */
      /* themeScrollFix1: SOLO html scrolla — body overflow-y:auto doppio rompe drag scrollbar */
      "html.vc-page-cine-ready:not(.vc-loading-scroll-lock):not(.vc-loader-blocking-live):not(.vc-chrome-bar-loading):not(.vc-user-leader-pending):not(.vc-user-profile-pending):not(.vc-rank-customize-pending):not(.vc-custom-profile-pending):not(.vc-session-verify-pending):not(.vc-notif-staff-loading){" +
      "overflow-x:hidden!important;overflow-y:auto!important;" +
      "overscroll-behavior:auto!important;touch-action:auto!important;" +
      "height:auto!important;max-height:none!important;" +
      /* hideScrollGutter0: zero spazio barra pagina */
      "scrollbar-width:none!important;scrollbar-gutter:auto!important;-ms-overflow-style:none!important}" +
      "html.vc-page-cine-ready:not(.vc-loading-scroll-lock):not(.vc-loader-blocking-live):not(.vc-chrome-bar-loading):not(.vc-user-leader-pending):not(.vc-user-profile-pending):not(.vc-rank-customize-pending):not(.vc-custom-profile-pending):not(.vc-session-verify-pending):not(.vc-notif-staff-loading) body{" +
      "overflow:visible!important;overflow-x:visible!important;overflow-y:visible!important;" +
      "overscroll-behavior:auto!important;touch-action:pan-y!important;" +
      "height:auto!important;max-height:none!important}" +
      "html.vc-page-cine-ready:not(.vc-chrome-bar-loading):not(.vc-loading-scroll-lock)::-webkit-scrollbar," +
      "html.vc-page-cine-ready:not(.vc-chrome-bar-loading):not(.vc-loading-scroll-lock) body::-webkit-scrollbar{" +
      "width:0!important;height:0!important;display:none!important;background:transparent!important}" +
      "html.vc-page-cine-ready:not(.vc-chrome-bar-loading):not(.vc-loading-scroll-lock)::-webkit-scrollbar-thumb," +
      "html.vc-page-cine-ready:not(.vc-chrome-bar-loading):not(.vc-loading-scroll-lock)::-webkit-scrollbar-track{" +
      "display:none!important;background:transparent!important}" +
      /* gestureLockBoot1: lock load/barra = nessuna gesture (anche post curtain-off) */
      "html.vc-loading-scroll-lock,html.vc-loading-scroll-lock body," +
      "html.vc-loader-blocking-live,html.vc-loader-blocking-live body," +
      "html.vc-chrome-bar-loading,html.vc-chrome-bar-loading body," +
      "html.vc-page-cine-ready.vc-loading-scroll-lock,html.vc-page-cine-ready.vc-loading-scroll-lock body," +
      "html.vc-page-cine-ready.vc-loader-blocking-live,html.vc-page-cine-ready.vc-loader-blocking-live body," +
      "html.vc-page-cine-ready.vc-chrome-bar-loading,html.vc-page-cine-ready.vc-chrome-bar-loading body," +
      "html.vc-cine-curtain-off.vc-loading-scroll-lock,html.vc-cine-curtain-off.vc-loading-scroll-lock body," +
      "html.vc-cine-curtain-off.vc-loader-blocking-live,html.vc-cine-curtain-off.vc-loader-blocking-live body," +
      "html.vc-cine-curtain-off.vc-chrome-bar-loading,html.vc-cine-curtain-off.vc-chrome-bar-loading body," +
      "html.vc-user-leader-pending,html.vc-user-leader-pending body," +
      "html.vc-user-profile-pending,html.vc-user-profile-pending body," +
      "html.vc-rank-customize-pending,html.vc-rank-customize-pending body," +
      "html.vc-custom-profile-pending,html.vc-custom-profile-pending body," +
      "html.vc-session-verify-pending,html.vc-session-verify-pending body," +
      "html.vc-notif-staff-loading,html.vc-notif-staff-loading body," +
      "html.vc-chrome-bar-loading,html.vc-chrome-bar-loading body," +
      "html.vc-loading-scroll-lock,html.vc-loading-scroll-lock body{" +
      "overflow:hidden!important;overflow-x:hidden!important;overflow-y:hidden!important;" +
      "overscroll-behavior:none!important;touch-action:none!important;pointer-events:auto!important;" +
      "height:100%!important;max-height:100dvh!important;" +
      "scrollbar-width:none!important}" +
      "html.vc-loading-scroll-lock *,html.vc-loader-blocking-live *,html.vc-chrome-bar-loading *," +
      "html.vc-interaction-hold *{" +
      "touch-action:none!important;overscroll-behavior:none!important}" +
      "html.vc-interaction-hold,html.vc-interaction-hold body," +
      "html.vc-page-cine-ready.vc-interaction-hold,html.vc-page-cine-ready.vc-interaction-hold body{" +
      "touch-action:none!important;pointer-events:auto!important}" +
      /* bootOneShot2 + gestureLockBoot1: lock barra anche se curtain già off */
      "html.vc-chrome-bar-loading," +
      "html.vc-chrome-bar-loading body," +
      "html.vc-loading-scroll-lock," +
      "html.vc-loading-scroll-lock body," +
      "html.vc-loader-blocking-live," +
      "html.vc-loader-blocking-live body{" +
      "overflow:hidden!important;overflow-x:hidden!important;overflow-y:hidden!important;" +
      "overscroll-behavior:none!important;touch-action:none!important;" +
      "height:100%!important;max-height:100dvh!important;scrollbar-width:none!important}" +
      "html.vc-loading-scroll-lock:not(.vc-cine-curtain-off)::-webkit-scrollbar," +
      "html.vc-loader-blocking-live:not(.vc-cine-curtain-off)::-webkit-scrollbar," +
      "html.vc-chrome-bar-loading:not(.vc-cine-curtain-off)::-webkit-scrollbar{" +
      "width:0!important;height:0!important;display:none!important}" +
      /* gestureLockBoot1: sipario giù scrolla SOLO senza lock/barra/load */
      "html.vc-cine-curtain-off:not(.vc-chrome-bar-loading):not(.vc-loading-scroll-lock):not(.vc-loader-blocking-live):not(.vc-interaction-hold)," +
      "html.vc-cine-curtain-off.vc-scroll-reload-top-lock:not(.vc-chrome-bar-loading):not(.vc-loading-scroll-lock)," +
      "html.vc-cine-curtain-off.vc-user-leader-pending:not(.vc-chrome-bar-loading)," +
      "html.vc-cine-curtain-off.vc-user-profile-pending:not(.vc-chrome-bar-loading)," +
      "html.vc-cine-curtain-off.vc-rank-customize-pending:not(.vc-chrome-bar-loading)," +
      "html.vc-cine-curtain-off.vc-custom-profile-pending:not(.vc-chrome-bar-loading)," +
      "html.vc-cine-curtain-off.vc-session-verify-pending:not(.vc-chrome-bar-loading)," +
      "html.vc-cine-curtain-off.vc-notif-staff-loading:not(.vc-chrome-bar-loading){" +
      "overflow-x:hidden!important;overflow-y:auto!important;" +
      "overscroll-behavior:auto!important;touch-action:pan-y!important;" +
      "height:auto!important;max-height:none!important;scrollbar-width:none!important;scrollbar-gutter:auto!important;-ms-overflow-style:none!important}" +
      "html.vc-cine-curtain-off:not(.vc-chrome-bar-loading):not(.vc-loading-scroll-lock):not(.vc-loader-blocking-live):not(.vc-interaction-hold) body," +
      "html.vc-cine-curtain-off.vc-scroll-reload-top-lock:not(.vc-chrome-bar-loading) body," +
      "html.vc-cine-curtain-off.vc-user-profile-pending:not(.vc-chrome-bar-loading) body," +
      "html.vc-cine-curtain-off.vc-session-verify-pending:not(.vc-chrome-bar-loading) body{" +
      "overflow:visible!important;overflow-x:visible!important;overflow-y:visible!important;" +
      "touch-action:pan-y!important;height:auto!important;max-height:none!important;" +
      "position:static!important;top:auto!important}" +
      /* interactHold1: anche se il sipario glitcha, niente click su chrome a metà boot */
      /* cursorMqStable1: URL solo html/body; * inherit — loading solo su controllo busy */
      "html.vc-site-cursor-ok," +
      "html.vc-site-cursor-ok body," +
      "html.vc-site-cursor-ok.vc-interaction-hold," +
      "html.vc-site-cursor-ok.vc-interaction-hold body," +
      "html.vc-site-cursor-ok.vc-chrome-bar-loading," +
      "html.vc-site-cursor-ok.vc-chrome-bar-loading body," +
      "html.vc-site-cursor-ok.vc-loading-scroll-lock," +
      "html.vc-site-cursor-ok.vc-loading-scroll-lock body{" +
      "cursor:url(/images/musicrecordspin-cursor-static.png) 12 12," +
      "url(/images/musicrecordspin-cursor-static.png) 12 12, auto!important}" +
      "html.vc-site-cursor-ok.vc-interaction-hold *," +
      "html.vc-site-cursor-ok *{cursor:inherit!important}" +
      "html body :is(.is-loading,.is-saving,.is-refreshing,:disabled,[aria-busy='true']," +
      ".vc-candidature-submit--loading,.vc-rank-editor-save.is-saving," +
      ".vc-kick-pip__play.is-loading){" +
      "cursor:url('/images/vc-loading-cursor.png?v=20260920vcLoadingCursorClean1') 16 16," +
      "url(/images/musicrecordspin-cursor-static.png) 12 12, auto!important}" +
      "html.vc-interaction-hold body>header," +
      "html.vc-interaction-hold body>main," +
      "html.vc-interaction-hold body>footer," +
      "html.vc-interaction-hold #vc-mobile-nav-drawer," +
      "html.vc-interaction-hold #vc-lang-dropdown," +
      "html.vc-interaction-hold:not(.vc-cine-curtain-off) #header-quick-actions," +
      "html.vc-interaction-hold:not(.vc-cine-curtain-off) .vc-notif-dropdown{" +
      "pointer-events:none!important}" +
      /* phoneBellTapFree1: post-sipario override hold PE none sulla campanella */
      "html.vc-cine-curtain-off.vc-interaction-hold #header-quick-actions," +
      "html.vc-cine-curtain-off.vc-interaction-hold #vc-notif-dropdown," +
      "html.vc-cine-curtain-off.vc-interaction-hold .vc-notif-dropdown," +
      "html.vc-cine-curtain-off.vc-interaction-hold .vc-notif-summary{" +
      "pointer-events:auto!important;z-index:2147483501!important}" +
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
          existingGate.setAttribute("data-vc", "hangKill4");
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
        /* bootOneShot3: ready precoce (home-cine) NON forza sipario prima di chrome */
        if (
          root.classList.contains("vc-page-cine-ready") &&
          !root.classList.contains("vc-page-cine-boot") &&
          !root.classList.contains("vc-interaction-hold")
        ) {
          if (
            window.__vcChromeLoadDone === true ||
            window.__vcChromeVisualReady === 1 ||
            canLiftCurtainNow(false)
          ) {
            liftBootCurtain(false);
          }
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
        /* bootBolt1: non bloccare sipario su DCL (HTML lunghi ~1s+) — basta body */
        if (!document.body) return false;
      } catch (eRs) {
        return false;
      }
      return true;
    }

    function clearChromeBarGate() {
      /* bootBarGate1c: NON settare LoadDone=true (ammazzava armLoadProgress).
         Togli lock solo dopo chrome-ui finish o failsafe età lungo. */
      try {
        var age = Date.now() - Number(window.__vcCineBootStartedAt || Date.now());
        if (!window.__vcChromeUiBooted && age < 1600) return;
        if (window.__vcChromeUiBooted && window.__vcChromeLoadDone === false && age < 2000) return;
        var prog = document.getElementById("vc-site-progress");
        if (prog && prog.classList.contains("is-loading") && age < 2000) return;
        if (root.classList.contains("vc-chrome-bar-loading") && age < 1600) return;
      } catch (eGate) {}
      try {
        root.classList.remove("vc-chrome-bar-loading", "vc-loading-scroll-lock");
      } catch (eClrBar) {}
      try {
        /* solo scroll-armed se chrome ha già chiuso la barra; altrimenti lascia a chrome-ui */
        if (window.__vcChromeLoadDone === true) {
          window.__vcChromeScrollArmed = true;
          root.classList.add("vc-chrome-scroll-armed");
        }
      } catch (eArm) {}
    }

    function landBootScrollAfterReveal() {
      try {
        if (window.__vcBootRevealLanded) return;
        var h = String(location.hash || "").replace(/^#/, "");
        var deepLink = Boolean(h && h.indexOf("access_token=") !== 0) || isHashDeepLinkNav();
        /* notifHashYoYo1: disarm SEMPRE (anche con hash) — prima i guard restavano pinY=0 */
        try {
          disarmBootScrollGuards();
        } catch (eDisAll) {}
        if (!deepLink) {
          var restoreY = 0;
          try {
            /* classFlash4: su classifiche ignora SEMPRE restoreY stale (ex personalizza) —
               anche con ptr-pending spoof — yank mid continuo altrimenti */
            /* legalBootTop1: policy = sempre top a fine boot (no mid da session/F5) */
            var pathNow = String((location && location.pathname) || "").replace(/\/+$/, "") || "/";
            var isLeader =
              pathNow === "/classifiche" ||
              document.documentElement.classList.contains("vc-user-leader-route") ||
              document.documentElement.classList.contains("vc-user-leader-pending");
            var isLegalLand =
              /^\/(privacy|terms|cookie|copyright|dati|regole)$/i.test(pathNow) ||
              (document.body && document.body.classList.contains("vc-legal-page")) ||
              !!document.getElementById("vc-page-legal-css");
            var ptrPending = document.documentElement.classList.contains("vc-ptr-scroll-restore-pending");
            var ptrReload = false;
            try {
              ptrReload = sessionStorage.getItem("vc_ptr_reload_v1") === "1";
            } catch (ePtrR) {}
            if (isLegalLand || (isLeader && !(ptrPending && ptrReload))) {
              window.__vcPtrRestoreTargetY = 0;
              window.__vcPtrRestoreY = 0;
              window.__vcViewStateRestoreY = 0;
              window.__vcRestoredScrollStickyY = 0;
              window.__vcDiscardScrollRestore = 1;
              document.documentElement.removeAttribute("data-vc-ptr-restore-y");
              restoreY = 0;
            } else {
              restoreY = Math.max(
                0,
                Number(window.__vcPtrRestoreTargetY || 0) || 0,
                Number(window.__vcPtrRestoreY || 0) || 0,
                Number(window.__vcViewStateRestoreY || 0) || 0,
                Number(window.__vcRestoredScrollStickyY || 0) || 0,
              );
              if (restoreY < 2) {
                var attr = document.documentElement.getAttribute("data-vc-ptr-restore-y");
                restoreY = Math.max(0, Number(attr || 0) || 0);
              }
              /* ptrScrollYoYoKill1: idrata da session se window vars ancora vuoti */
              if (restoreY < 2) {
                try {
                  var rawLand =
                    sessionStorage.getItem("vc_scroll_restore_anchor_v1") ||
                    sessionStorage.getItem("vc_ptr_scroll_v1");
                  if (rawLand) {
                    var dataLand = JSON.parse(rawLand);
                    var yLand = Math.max(0, Math.round(Number(dataLand && dataLand.y) || 0));
                    if (yLand >= 2) restoreY = yLand;
                  }
                } catch (eSesLand) {}
              }
            }
          } catch (eRy) {}
          /* refreshRestoreEnd1: restoreY resta nei window vars; mid-boot pin SEMPRE 0.
             Finalize/unlock chrome fa l'unico scrollTo(wantY) a fine load. */
          var keepUserScroll = restoreY > 24;
          if (keepUserScroll) {
            try {
              window.__vcDiscardNextUnpinScrollY = false;
              window.__vcDiscardScrollRestore = 0;
              if (typeof window.__vcResetPinnedPageScrollY === "function") {
                window.__vcResetPinnedPageScrollY(0);
              }
            } catch (eKeep) {}
            bootScrollPinY = 0;
            try {
              if (typeof window.__vcPtrFinalizeScroll === "function") {
                var tryFinalize = function (attempt) {
                  try {
                    var ready =
                      window.__vcChromeVisualReady === 1 &&
                      window.__vcChromeLoadDone === true &&
                      !document.documentElement.classList.contains("vc-chrome-bar-loading");
                    if (!ready && attempt < 40) {
                      window.setTimeout(function () {
                        tryFinalize(attempt + 1);
                      }, 80);
                      return;
                    }
                    /* solo dopo unlock chrome — evita 2° jump se unlock ha già fatto Done */
                    if (window.__vcScrollUnlockOnce === 1 || window.__vcPtrRestoreDone === 1) return;
                    window.__vcPtrFinalizeScroll();
                  } catch (eF2) {}
                };
                window.setTimeout(function () {
                  tryFinalize(0);
                }, 80);
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
            /* scrollPostSiparioYoyo1: se l'utente ha già scrollato, non hard-top */
            var liveLandY = 0;
            try {
              liveLandY = Math.max(0, Math.round(Number(bootScrollY()) || 0));
            } catch (eLiveLand) {
              liveLandY = 0;
            }
            if (liveLandY < 24) {
              /* bootNoFooter1 + bootViolSnap1: uno snap sync + un rAF.
                 I setTimeout 120/380 erano Violation Forced reflow ~260ms su OGNI pagina. */
              forceBootScrollTop({ hard: true });
              try {
                window.requestAnimationFrame(function () {
                  try {
                    if (Math.max(0, Math.round(Number(bootScrollY()) || 0)) < 24) {
                      forceBootScrollTop({ hard: true });
                    }
                  } catch (eRafChk) {}
                });
              } catch (eRafTop) {}
            }
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
        try {
          window.__vcBootRevealLanded = true;
        } catch (eLanded) {}
      } catch (eTop2) {}
    }

    function finishReleaseInteractionHold() {
      if (releaseHoldDone) return;
      /* bootBolt1: sipario appena core+look(+theme); no photo decode, no 2×rAF+90 */
      try {
        var waitCss = !landingCssReady() && !softFxIntentionallyOff();
        var age = Date.now() - Number(window.__vcCineBootStartedAt || bootStartedAt || Date.now());
        var softFailMs = HARD_FAILSAFE_MS + 800;
        if (waitCss && age < softFailMs) {
          releaseHoldScheduled = false;
          scheduleReleaseInteractionHold();
          return;
        }
      } catch (eSoftHold) {}
      /* ancora senza CSS a failsafe? tieni sipario, marca solo hold off per click — no fake ready */
      var cssOk = false;
      try {
        cssOk = landingCssReady() || softFxIntentionallyOff();
      } catch (eCssOk) {}
      if (!cssOk) {
        try {
          root.classList.remove("vc-interaction-hold");
        } catch (eHoldOnly) {}
        releaseHoldScheduled = false;
        window.setTimeout(function () {
          try {
            scheduleReleaseInteractionHold();
          } catch (eRe) {}
        }, 48);
        return;
      }
      releaseHoldDone = true;
      function go() {
        try {
          if (!themeSheetsReady()) {
            releaseHoldDone = false;
            releaseHoldScheduled = false;
            scheduleReleaseInteractionHold();
            return;
          }
        } catch (eThGo) {}
        /* loadGateOnce2: non alzare sipario finché barra/loader-gate bloccano */
        try {
          if (!canLiftCurtainNow(false)) {
            releaseHoldDone = false;
            releaseHoldScheduled = false;
            scheduleReleaseInteractionHold();
            return;
          }
        } catch (eLiftWait) {}
        try {
          root.classList.add("vc-look-core-ready", "vc-soft-fx-ready", "vc-theme-light-ready");
        } catch (eSoftMark) {}
        try {
          root.classList.remove("vc-interaction-hold");
        } catch (eHold) {}
        try {
          root.classList.add("vc-cine-curtain-off");
          root.classList.remove("vc-page-cine-boot");
        } catch (eOff) {}
        try {
          clearChromeBarGate();
        } catch (eBar) {}
        try {
          var cur = document.getElementById("vc-cine-boot-curtain");
          if (cur && cur.parentNode) cur.parentNode.removeChild(cur);
        } catch (eRm) {}
        try {
          kickSecondaryChromeReady();
        } catch (eChromeKick) {}
        window.setTimeout(function () {
          try {
            forceUnlockPageScroll();
          } catch (eForce) {}
          try {
            window.__vcBootScrollGuardsKilled = 1;
            disarmBootScrollGuards();
          } catch (eDis) {}
        }, 0);
        window.setTimeout(function () {
          try {
            landBootScrollAfterReveal();
          } catch (eLand) {}
        }, 32);
      }
      /* bootBolt1: 1 rAF — sheetHasRules già true, niente delay artificiale */
      try {
        window.requestAnimationFrame(go);
      } catch (eRaf) {
        window.setTimeout(go, 0);
      }
    }

    function forceClearInteractionHold() {
      /* bootReadyPaint1: togli hold; curtain-off solo se CSS davvero pronto (no fake soft-fx) */
      var alreadyOpen = false;
      try {
        alreadyOpen =
          root.classList.contains("vc-cine-curtain-off") ||
          window.__vcChromeVisualReady === 1 ||
          window.__vcChromeLoadDone === true;
      } catch (eOpen) {}
      try {
        if (landingCssReady() || softFxIntentionallyOff()) {
          root.classList.add("vc-look-core-ready", "vc-soft-fx-ready");
          if (themeSheetsReady()) root.classList.add("vc-theme-light-ready");
        }
      } catch (eSoftForce) {}
      try {
        root.classList.remove("vc-interaction-hold");
      } catch (eClr) {}
      /* bootHoldJump1: hold fantasma post-open → solo strip class, ZERO unlock/unpin (yank fondo) */
      if (alreadyOpen) {
        releaseHoldDone = true;
        releaseHoldScheduled = false;
        return;
      }
      try {
        if (
          ((root.classList.contains("vc-soft-fx-ready") && root.classList.contains("vc-look-core-ready")) ||
            softFxIntentionallyOff()) &&
          themeSheetsReady() &&
          canLiftCurtainNow(false)
        ) {
          root.classList.add("vc-theme-light-ready");
          root.classList.add("vc-cine-curtain-off");
          root.classList.remove("vc-page-cine-boot");
        }
      } catch (eOff) {}
      try {
        clearChromeBarGate();
      } catch (eBar2) {}
      try {
        forceUnlockPageScroll();
      } catch (eUn) {}
      try {
        window.__vcBootScrollGuardsKilled = 1;
        disarmBootScrollGuards();
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
          /* bootBolt1: hard più corto */
          hard =
            Date.now() - Number(window.__vcCineBootStartedAt || bootStartedAt || Date.now()) >=
            HARD_FAILSAFE_MS + 800;
        } catch (eHard) {}
        var softOk = false;
        try {
          softOk = landingCssReady() || softFxIntentionallyOff();
        } catch (eSoftOk) {}
        if ((chromeSettleReady() && softOk) || hard || n > 80) {
          finishReleaseInteractionHold();
          return;
        }
        window.setTimeout(tick, 12);
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

    /* holdFreezeKill1 + jsWakeIdle2: watchdog hold — MAI interval eterno
       (return early ogni 500ms = 2 wake/s → 1k riattivazioni in ~8 min). */
    try {
      if (!window.__vcHoldWatchArmed) {
        window.__vcHoldWatchArmed = 1;
        var holdWatchN = 0;
        var holdWatchIv = window.setInterval(function () {
          holdWatchN += 1;
          try {
            var holdOn = root.classList.contains("vc-interaction-hold");
            var ready =
              root.classList.contains("vc-page-cine-ready") ||
              root.classList.contains("vc-cine-curtain-off");
            if (!holdOn || holdWatchN >= 40) {
              window.clearInterval(holdWatchIv);
              return;
            }
            if (!ready) return;
            var age = Date.now() - Number(window.__vcCineBootStartedAt || bootStartedAt || Date.now());
            if (age < HARD_FAILSAFE_MS + 900) return;
            forceClearInteractionHold();
            window.clearInterval(holdWatchIv);
          } catch (eWd) {}
        }, 500);
      }
    } catch (eWdArm) {}

    function liftBootCurtain(force) {
      try {
        if (!force && root.classList.contains("vc-interaction-hold") && !releaseHoldDone) {
          scheduleReleaseInteractionHold();
          return;
        }
      } catch (eGate) {}
      /* schedaBootCue1: force=false non alza sipario su scheda pending */
      try {
        if (!force && boardsViewStillPending()) return;
      } catch (eBdLift) {}
      try {
        root.classList.remove("vc-interaction-hold");
      } catch (eHoldOff) {}
      try {
        /* bootReadyPaint1 + homeParityThemeGate1: soft+look(+theme-light) reali */
        if (landingCssReady() || softFxIntentionallyOff()) {
          root.classList.add("vc-look-core-ready", "vc-soft-fx-ready");
          if (themeSheetsReady()) root.classList.add("vc-theme-light-ready");
        }
        if (
          (((root.classList.contains("vc-soft-fx-ready") && root.classList.contains("vc-look-core-ready")) ||
            softFxIntentionallyOff() ||
            (force && (landingCssReady() || softFxIntentionallyOff()))) &&
            themeSheetsReady())
        ) {
          if (!(boardsViewStillPending() && !force) && canLiftCurtainNow(force)) {
            root.classList.add("vc-theme-light-ready");
            root.classList.add("vc-cine-curtain-off");
            root.classList.remove("vc-page-cine-boot");
            try {
              root.classList.remove("vc-boot-loader-gate");
              root.removeAttribute("data-vc-boot-loader");
            } catch (eGateLift) {}
            try {
              /* legalBootFast2/homeSiparioLoad1: hide SOLO dopo curtain-off (entrambi i nodi) */
              ["vc-pre-cine-hard-sipario", "vc-boot-load-screen"].forEach(function (id) {
                var sipLift = document.getElementById(id);
                if (!sipLift) return;
                try {
                  sipLift.removeAttribute("style");
                } catch (eRmSt0) {}
                sipLift.hidden = true;
                sipLift.setAttribute("hidden", "");
                try {
                  sipLift.style.setProperty("display", "none", "important");
                  sipLift.style.setProperty("opacity", "0", "important");
                  sipLift.style.setProperty("visibility", "hidden", "important");
                } catch (eSipSt) {}
              });
            } catch (eSipHide) {}
            try {
              window.__vcCurtainOffAt = Date.now();
            } catch (eAt) {}
            try {
              clearChromeBarGate();
            } catch (eBar3) {}
            try {
              var cur = document.getElementById("vc-cine-boot-curtain");
              if (cur && cur.parentNode) cur.parentNode.removeChild(cur);
            } catch (eRm) {}
            try {
              forceUnlockPageScroll();
            } catch (eForceLift) {}
          }
        }
      } catch (eOff) {}
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
      /* loadGateOnce1: non riarmare hold/bar se già rivelata (era silent 2° load) */
      if (
        !root.classList.contains("vc-page-cine-ready") &&
        !root.classList.contains("vc-cine-curtain-off")
      ) {
        root.classList.add("vc-loading-scroll-lock", "vc-interaction-hold", "vc-chrome-bar-loading");
      }
    } catch (eLockCls) {}

    /* bootBarGate1c: stub barra + lock CSS specificity > bake overflow:auto (vote/…) */
    try {
      (function ensureBootProgressStub() {
        var css = document.getElementById("vc-boot-progress-stub-css");
        var created = false;
        if (!css) {
          css = document.createElement("style");
          css.id = "vc-boot-progress-stub-css";
          created = true;
        }
        css.setAttribute("data-vc", "progGlowUnify1");
        css.textContent =
          "html.vc-site-polish.vc-page-cine-boot.vc-loading-scroll-lock:not(.vc-page-cine-ready)," +
          "html.vc-site-polish.vc-page-cine-boot.vc-chrome-bar-loading:not(.vc-page-cine-ready)," +
          "html.vc-page-cine-boot.vc-loading-scroll-lock:not(.vc-page-cine-ready)," +
          "html.vc-page-cine-boot.vc-chrome-bar-loading:not(.vc-page-cine-ready)," +
          "html.vc-site-polish.vc-loading-scroll-lock,html.vc-site-polish.vc-chrome-bar-loading," +
          "html.vc-site-polish.vc-page-cine-boot.vc-loading-scroll-lock:not(.vc-page-cine-ready) body," +
          "html.vc-site-polish.vc-page-cine-boot.vc-chrome-bar-loading:not(.vc-page-cine-ready) body," +
          "html.vc-page-cine-boot.vc-loading-scroll-lock:not(.vc-page-cine-ready) body," +
          "html.vc-page-cine-boot.vc-chrome-bar-loading:not(.vc-page-cine-ready) body," +
          "html.vc-site-polish.vc-loading-scroll-lock body,html.vc-site-polish.vc-chrome-bar-loading body{" +
          "overflow:hidden!important;overflow-x:hidden!important;overflow-y:hidden!important;" +
          "overscroll-behavior:none!important;touch-action:none!important;max-height:100dvh!important}" +
          /* progGlowUnify1: stessa sand-glow chrome-ui */
          "#vc-site-progress{position:fixed!important;top:0!important;left:0!important;right:0!important;" +
          "width:auto!important;z-index:2147483500!important;pointer-events:none!important;" +
          "background:transparent!important;overflow:hidden!important;contain:none!important;" +
          "backdrop-filter:none!important;-webkit-backdrop-filter:none!important;" +
          "filter:none!important;box-shadow:none!important}" +
          "#vc-site-progress.is-loading{height:3px!important;opacity:1!important;visibility:visible!important;display:block!important}" +
          "#vc-site-progress:not(.is-loading){height:3px!important;opacity:0.92!important}" +
          "#vc-site-progress__bar{display:block!important;height:100%!important;width:100%!important;" +
          "transform-origin:left center!important;background:#d4a888!important;" +
          "background-image:linear-gradient(90deg,#8f6b3f,#c49a72,#e8c9a8,#fffaf3,#e8c9a8,#d4a888,#b88968)!important;" +
          "box-shadow:none!important;" +
          "filter:none!important;backdrop-filter:none!important;will-change:auto!important}" +
          /* phoneBarBlurKill2 */
          "@media (max-width:1199.98px),(pointer:coarse){" +
          "#vc-site-progress__bar{background-image:linear-gradient(90deg,#9a7349,#d4a888,#b88968)!important;" +
          "box-shadow:none!important;filter:none!important;will-change:auto!important}}";
        if (created) (document.head || root).appendChild(css);
        function mountStub() {
          var wrap = document.getElementById("vc-site-progress");
          if (!wrap) {
            wrap = document.createElement("div");
            wrap.id = "vc-site-progress";
            wrap.setAttribute("aria-hidden", "true");
            var bar0 = document.createElement("div");
            bar0.id = "vc-site-progress__bar";
            wrap.appendChild(bar0);
            (document.body || root).appendChild(wrap);
          }
          wrap.classList.add("is-loading");
          function paintPct(pct) {
            var barEl = document.getElementById("vc-site-progress__bar");
            if (!barEl) {
              barEl = document.createElement("div");
              barEl.id = "vc-site-progress__bar";
              wrap.appendChild(barEl);
            }
            try {
              barEl.style.setProperty("transform", "scaleX(" + pct.toFixed(4) + ")", "important");
            } catch (eTr) {
              barEl.style.transform = "scaleX(" + pct.toFixed(4) + ")";
            }
          }
          paintPct(0.18);
          if (!window.__vcChromeUiBooted) {
            var t0 = performance.now();
            var pulse = window.setInterval(function () {
              try {
                if (window.__vcChromeUiBooted) {
                  window.clearInterval(pulse);
                  return;
                }
                var age = Math.min(1, (performance.now() - t0) / 2600);
                paintPct(0.14 + age * 0.75);
              } catch (ePulse) {}
            }, 50);
          }
        }
        if (document.body) mountStub();
        else document.addEventListener("DOMContentLoaded", mountStub, { once: true });
      })();
    } catch (eStub) {}

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
    function forceBootScrollTop(opts) {
      try {
        var hard = opts && opts.hard === true;
        /* notifHashYoYo1: click notifica con #target — non strappare su/giù */
        if (isHashDeepLinkNav()) return;
        var stillBooting =
          root.classList.contains("vc-page-cine-boot") && !root.classList.contains("vc-page-cine-ready");
        var barBusy = false;
        try {
          barBusy =
            window.__vcChromeVisualReady !== 1 ||
            window.__vcChromeLoadDone !== true ||
            root.classList.contains("vc-chrome-bar-loading") ||
            root.classList.contains("vc-loading-scroll-lock") ||
            root.classList.contains("vc-loader-blocking-live") ||
            (root.classList.contains("vc-page-cine-boot") &&
              !root.classList.contains("vc-cine-curtain-off"));
        } catch (eBarB) {
          barBusy = stillBooting;
        }
        /*
         * bootScrollTopUntilEnd1: restore Y in coda NON deve skippare lo snap a 0.
         * Prima wantRestore early-return → mid-page visibile a metà sipario/barra.
         * Durante boot/barra: SEMPRE top; restore solo post visual-ready.
         */
        if (stillBooting || hard || barBusy) {
          /* bootViolSnap1: un solo scrollTo — no scrollTop×2 (Forced reflow) */
          bootScrollToY(0);
          return;
        }
        /* scrollBarTrack3c / classFlash4: post-boot — non yankare se restore già atterrato */
        try {
          var pathForce = String((location && location.pathname) || "").replace(/\/+$/, "") || "/";
          var leaderForce =
            pathForce === "/classifiche" ||
            root.classList.contains("vc-user-leader-route") ||
            root.classList.contains("vc-user-leader-pending");
          var legalForce =
            /^\/(privacy|terms|cookie|copyright|dati|regole)$/i.test(pathForce) ||
            (document.body && document.body.classList.contains("vc-legal-page"));
          var wantRestore = Math.max(
            0,
            Number(window.__vcPtrRestoreTargetY || 0) || 0,
            Number(window.__vcPtrRestoreY || 0) || 0,
            Number(window.__vcViewStateRestoreY || 0) || 0,
            Number(window.__vcRestoredScrollStickyY || 0) || 0,
          );
          if (legalForce) {
            wantRestore = 0;
            window.__vcDiscardScrollRestore = 1;
          }
          if (leaderForce && window.__vcDiscardScrollRestore) {
            wantRestore = 0;
          }
          var liveForce = Math.max(0, Math.round(Number(bootScrollY()) || 0));
          var stickyAt = Number(window.__vcRestoredScrollStickyAt || 0) || 0;
          var stickyFresh = stickyAt && Date.now() - stickyAt < 4000;
          if (wantRestore >= 2 && !window.__vcPtrRestoreDone) return;
          if (wantRestore >= 2 && liveForce >= 2) return;
          if (stickyFresh && wantRestore >= 2) return;
          if (liveForce >= 24 && (window.__vcPtrRestoreDone || stickyFresh || window.__vcChromeVisualReady === 1)) {
            return;
          }
          if (
            wantRestore >= 2 &&
            window.__vcChromeVisualReady === 1 &&
            liveForce >= 2
          ) {
            return;
          }
        } catch (eWant) {}
        /* scrollReloadKillYoYo2: post-ready — non azzerare se restore in unpin */
        if (document.documentElement.classList.contains("vc-ptr-scroll-restore-pending")) return;
        if (window.__vcPtrRestoreUnpinStarted && !window.__vcPtrRestoreDone) return;
        /* scrollStayAll1: soft path — non azzerare mid-page / post-land */
        if (window.__vcBootRevealLanded && root.classList.contains("vc-cine-curtain-off")) return;
        if (root.classList.contains("vc-page-cine-ready") && root.classList.contains("vc-cine-curtain-off")) return;
        var ySoft = Number(window.pageYOffset || 0) || 0;
        if (ySoft > 8) return;
        bootScrollToY(0);
      } catch (eTop) {}
    }
    function bootScrollToY(y) {
      var n = Math.max(0, Number(y) || 0);
      try {
        if (typeof window.scrollTo === "function") {
          try {
            window.scrollTo({ top: n, left: 0, behavior: "instant" });
          } catch (eInst) {
            window.scrollTo(0, n);
          }
        }
      } catch (eScr) {}
    }
    function restoreBootScrollY(y) {
      /* bootViolSnap1: un solo scrollTo */
      bootScrollToY(y);
    }
    function bootScrollShouldBlock() {
      try {
        /* gestureLockBoot1: blocco finché sipario O caricamento vivi */
        if (window.__vcBootScrollGuardsKilled) return false;
        if (root.classList.contains("vc-interaction-hold")) return true;
        if (root.classList.contains("vc-loader-blocking-live")) return true;
        if (root.classList.contains("vc-loading-scroll-lock")) return true;
        if (root.classList.contains("vc-chrome-bar-loading")) return true;
        var prog = document.getElementById("vc-site-progress");
        if (prog && prog.classList.contains("is-loading")) return true;
        if (curtainStillUp() && !root.classList.contains("vc-cine-curtain-off")) return true;
        if (root.classList.contains("vc-page-cine-boot") && !root.classList.contains("vc-page-cine-ready")) {
          return true;
        }
        /* solo dopo sipario giù + load finito → libera */
        if (root.classList.contains("vc-page-cine-ready") && root.classList.contains("vc-cine-curtain-off")) {
          return false;
        }
        if (root.classList.contains("vc-cine-curtain-off") && window.__vcChromeLoadDone === true) {
          return false;
        }
      } catch (eShould) {}
      return false;
    }
    function onBootScrollBlock(e) {
      try {
        /* gestureLockBoot1: stop solo se né sipario né load */
        if (window.__vcBootScrollGuardsKilled) {
          disarmBootScrollGuards();
          return;
        }
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
            /* refreshRestoreEnd1: pending restore → resta a 0 (no mid-load jump a ryGuard) */
            if (ryGuard > 8 && !window.__vcPtrRestoreDone) {
              restoreBootScrollY(0);
              return;
            }
          } catch (eRyG) {}
          /* notifHashYoYo1: lascia stare lo scroll verso #target */
          if (isHashDeepLinkNav()) {
            try {
              bootScrollPinY = Math.max(bootScrollPinY, bootScrollY());
            } catch (ePin) {}
            return;
          }
          restoreBootScrollY(bootScrollPinY <= 8 ? 0 : bootScrollPinY);
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
        /* gestureLockBoot1: tutte le gesture, non solo wheel/scroll */
        var opts = { capture: true, passive: false };
        document.addEventListener("wheel", onBootScrollBlock, opts);
        document.addEventListener("touchstart", onBootScrollBlock, opts);
        document.addEventListener("touchmove", onBootScrollBlock, opts);
        document.addEventListener("touchend", onBootScrollBlock, opts);
        document.addEventListener("pointerdown", onBootScrollBlock, opts);
        document.addEventListener("pointermove", onBootScrollBlock, opts);
        document.addEventListener("gesturestart", onBootScrollBlock, opts);
        document.addEventListener("gesturechange", onBootScrollBlock, opts);
        document.addEventListener("gestureend", onBootScrollBlock, opts);
        document.addEventListener("keydown", onBootScrollBlock, opts);
        /* cpuFreezeTrim1: scroll listener PASSIVE — no preventDefault storm */
        window.addEventListener("scroll", onBootScrollBlock, { capture: true, passive: true });
      } catch (eArm) {}
      try {
        root.style.setProperty("touch-action", "none", "important");
        if (document.body) document.body.style.setProperty("touch-action", "none", "important");
      } catch (eTaArm) {}
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
        document.removeEventListener("touchstart", onBootScrollBlock, true);
        document.removeEventListener("touchmove", onBootScrollBlock, true);
        document.removeEventListener("touchend", onBootScrollBlock, true);
        document.removeEventListener("pointerdown", onBootScrollBlock, true);
        document.removeEventListener("pointermove", onBootScrollBlock, true);
        document.removeEventListener("gesturestart", onBootScrollBlock, true);
        document.removeEventListener("gesturechange", onBootScrollBlock, true);
        document.removeEventListener("gestureend", onBootScrollBlock, true);
        document.removeEventListener("keydown", onBootScrollBlock, true);
        window.removeEventListener("scroll", onBootScrollBlock, true);
      } catch (eDis) {}
      try {
        if (!bootScrollShouldBlock()) {
          root.style.removeProperty("touch-action");
          if (document.body) document.body.style.removeProperty("touch-action");
        }
      } catch (eTaDis) {}
      try {
        if (bootScrollWatchTimer) {
          window.clearTimeout(bootScrollWatchTimer);
          bootScrollWatchTimer = 0;
        }
      } catch (eClr) {}
    }
    function maybeDisarmBootScrollGuards() {
      /* 20261014uiFixPack1: sblocca SOLO se bootScrollShouldBlock=false (loader/barra finiti) */
      if (window.__vcBootScrollGuardsKilled) {
        disarmBootScrollGuards();
        return;
      }
      if (bootScrollShouldBlock()) {
        armBootScrollGuards();
        return;
      }
      try {
        window.__vcBootScrollGuardsKilled = 1;
      } catch (eKill) {}
      disarmBootScrollGuards();
    }
    armBootScrollGuards();
    /* 20261014uiFixPack1: failsafe soft — se dopo 12s loader ancora on, sblocca; altrimenti solo se non blocking */
    window.setTimeout(function () {
      try {
        if (bootScrollShouldBlock()) {
          /* ancora in load: lascia guards; riprova unlock CSS classes solo se curtain già off */
          return;
        }
        window.__vcBootScrollGuardsKilled = 1;
        disarmBootScrollGuards();
        forceUnlockPageScroll();
      } catch (eFs) {}
    }, 12000);
    window.setTimeout(function () {
      try {
        if (!bootScrollShouldBlock()) return;
        window.__vcBootScrollGuardsKilled = 1;
        disarmBootScrollGuards();
        forceUnlockPageScroll();
      } catch (eFs2) {}
    }, 20000);

    /* navEmptyCine2: main/header restano gated su core/home (anti flash precine
       su grad-baked). Solo snav/qa hanno escape cine/soft — il pin soft-fx +
       markSoftFxReady(styles-ready) riempie la navbar senza alzare il contenuto. */
    var navGuard =
      "html:not(.vc-core-styles-ready):not(.vc-home-styles-ready) body.vc-body>main," +
      "html:not(.vc-core-styles-ready):not(.vc-home-styles-ready) body.vc-body>footer," +
      "html:not(.vc-core-styles-ready):not(.vc-home-styles-ready) body.vc-body>header{" +
      "opacity:0!important;visibility:hidden!important;pointer-events:none!important}" +
      "html:not(.vc-core-styles-ready):not(.vc-home-styles-ready) #vc-mobile-nav-drawer," +
      "html:not(.vc-core-styles-ready):not(.vc-home-styles-ready) .vc-mobile-nav-drawer{" +
      "display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important}" +
      "html:not(.vc-core-styles-ready):not(.vc-home-styles-ready):not(.vc-page-cine-ready):not(.vc-soft-fx-ready) body.vc-body header nav.vc-header-snav," +
      "html:not(.vc-core-styles-ready):not(.vc-home-styles-ready):not(.vc-page-cine-ready):not(.vc-soft-fx-ready) body.vc-body header #header-quick-actions{" +
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

    /* bootExtMatch1: match also versioned names (vc-landing-ext.YYYY….css) */
    function isLandingCoreHref(href) {
      return href.indexOf("vc-landing-core") !== -1;
    }
    function isLandingExtHref(href) {
      return href.indexOf("vc-landing-ext") !== -1;
    }
    function isLandingMonoHref(href) {
      return (
        href.indexOf("vc-landing.css") !== -1 &&
        href.indexOf("vc-landing-core") === -1 &&
        href.indexOf("vc-landing-ext") === -1
      );
    }

    function isVcBundleStylesheet(href) {
      return (
        isLandingMonoHref(href) ||
        isLandingCoreHref(href) ||
        isLandingExtHref(href) ||
        href.indexOf("tw-build.css") !== -1 ||
        href.indexOf("vc-soft-fx") !== -1
      );
    }

    /* Critical for reveal: core + ext + soft-fx wash (+ tw/photo). Soft-fx = gradient cards/nav. */
    function isCriticalRevealStylesheet(href) {
      return (
        isLandingCoreHref(href) ||
        isLandingExtHref(href) ||
        href.indexOf("tw-build.css") !== -1 ||
        href.indexOf("vc-site-photo-bg.css") !== -1 ||
        href.indexOf("vc-soft-fx") !== -1 ||
        /* legacy pages that only ship the monolith */
        isLandingMonoHref(href)
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
      var out = {
        core: null,
        ext: null,
        mono: null,
        tw: null,
        photo: null,
        soft: null,
        look: null,
        theme: null,
      };
      try {
        var links = document.querySelectorAll('link[rel="stylesheet"]');
        for (var i = 0; i < links.length; i += 1) {
          var href = String(links[i].getAttribute("href") || links[i].href || "");
          if (isLandingCoreHref(href)) out.core = links[i];
          else if (isLandingExtHref(href)) out.ext = links[i];
          else if (isLandingMonoHref(href)) out.mono = links[i];
          else if (href.indexOf("tw-build.css") !== -1) out.tw = links[i];
          else if (href.indexOf("vc-site-photo-bg.css") !== -1) out.photo = links[i];
          else if (href.indexOf("vc-soft-fx") !== -1) out.soft = links[i];
          else if (href.indexOf("vc-look-core") !== -1) out.look = links[i];
          else if (href.indexOf("vc-theme-light") !== -1) out.theme = links[i];
        }
        if (!out.soft) {
          out.soft = document.getElementById("vc-soft-fx-css");
        }
        if (!out.look) {
          out.look = document.getElementById("vc-look-core-css");
        }
        if (!out.theme) {
          out.theme = document.getElementById("vc-theme-light-css");
        }
      } catch (eFind) {}
      return out;
    }

    /* bootBolt2: light aspetta theme-light, ma max ~200ms — look già anti-FOUC principale */
    function themeSheetsReady() {
      try {
        var theme = String(root.getAttribute("data-vc-theme") || "");
        if (theme !== "light") {
          try {
            root.classList.add("vc-theme-light-ready");
          } catch (eDark) {}
          return true;
        }
        var L = findLandingCssLinks();
        var link =
          L.theme ||
          document.getElementById("vc-theme-light-css") ||
          document.querySelector('link[href*="vc-theme-light"]');
        if (!link) {
          try {
            root.classList.add("vc-theme-light-ready");
          } catch (eNo) {}
          return true;
        }
        if (sheetAppliesToScreen(link) && sheetHasRules(link)) {
          try {
            root.classList.add("vc-theme-light-ready");
          } catch (eOk) {}
          return true;
        }
        var age = Date.now() - Number(window.__vcCineBootStartedAt || Date.now());
        var lookReady = false;
        try {
          lookReady = Boolean(L.look && sheetHasRules(L.look));
        } catch (eLk) {}
        if (age >= 200 && lookReady) {
          try {
            root.classList.add("vc-theme-light-ready");
          } catch (eSoftTh) {}
          return true;
        }
        return false;
      } catch (eTh) {
        return true;
      }
    }

    function landingCssLinksPresent() {
      var L = findLandingCssLinks();
      if (L.mono) return true;
      /* bootHomeParity1: core da solo basta (ext versionato non obbligatorio) */
      return Boolean(L.core || L.ext);
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
        /* siparioWaitAllCss2: MAI usare soft-fx-ready+perf-* come "off"
           (apriva il sipario prima che i CSS finissero di caricarsi). */
        if (root.classList.contains("vc-soft-fx-off")) return true;
        var soft =
          document.getElementById("vc-soft-fx-css") ||
          document.querySelector('link[href*="vc-soft-fx"]');
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

    function bootCriticalReady() {
      try {
        return Boolean(document.getElementById("vc-boot-critical-css"));
      } catch (eCritR) {
        return false;
      }
    }

    function landingCssReady() {
      var L = findLandingCssLinks();
      var baseOk = false;
      /* bootBolt2: critical sync basta per base — non attendere landing-core 1MB */
      if (bootCriticalReady()) baseOk = true;
      else if (L.mono) baseOk = sheetHasRules(L.mono);
      else if (L.core) baseOk = sheetHasRules(L.core);
      else if (L.ext) baseOk = sheetHasRules(L.ext);
      /* legalBootFast1: policy/tickets/scoped = look(+soft) bastano.
         Senza landing-core landingCssReady restava false → hold/sipario ~8–13s. */
      if (!baseOk && L.look && sheetAppliesToScreen(L.look) && sheetHasRules(L.look)) {
        try {
          var scoped =
            document.getElementById("vc-page-legal-css") ||
            document.querySelector(
              'link[href*="vc-page-legal"],link[href*="vc-page-tickets"],link[href*="vc-page-bacheca"],link[href*="vc-page-staff"],link[href*="vc-page-dashboard"],link[href*="vc-page-misc"],link[href*="vc-page-cine-public"],link[href*="page-bundle"]',
            );
          if (scoped) {
            if (
              softFxIntentionallyOff() ||
              !L.soft ||
              (sheetAppliesToScreen(L.soft) && sheetHasRules(L.soft)) ||
              root.classList.contains("vc-soft-fx-ready")
            ) {
              baseOk = true;
            }
          }
        } catch (eScopedBase) {}
      }
      if (!baseOk) return false;
      /* holdFreezeKill1: con soft-fx-off (perf mid/lite) soft NON è requisito reveal/hold */
      if (softFxIntentionallyOff()) return true;
      /* lookCoreBake1: gradient/cine = look-core; senza sheet = flash flat → cine */
      var lookOk = true;
      if (L.look) {
        if (!sheetAppliesToScreen(L.look)) return false;
        if (!sheetHasRules(L.look)) return false;
      } else {
        lookOk = false;
      }
      /* bootBolt1: soft-fx = hover — non blocca se look già pronto (mark soft-ready al reveal) */
      if (!lookOk) {
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
      } else if (L.soft && sheetAppliesToScreen(L.soft) && !sheetHasRules(L.soft)) {
        /* look ok: soft in volo ok — kick listener lo completa */
        try {
          kickSoftSheetListener(L.soft);
        } catch (eSoftKick) {}
      }
      /* homeParityThemeGate1: aspetta theme-light in light */
      if (!themeSheetsReady()) return false;
      /* bootBolt1: chrome secondario (nav/glow) NON blocca sipario */
      try {
        kickSecondaryChromeReady();
      } catch (eSecKick) {}
      return true;
    }

    function kickSoftSheetListener(link) {
      try {
        if (!link || link.__vcBoltSoftKick) return;
        link.__vcBoltSoftKick = 1;
        function onSoft() {
          try {
            if (sheetHasRules(link)) root.classList.add("vc-soft-fx-ready");
          } catch (eMark) {}
          try {
            if (root.classList.contains("vc-interaction-hold")) scheduleReleaseInteractionHold();
          } catch (eSched) {}
        }
        if (sheetHasRules(link)) {
          onSoft();
          return;
        }
        link.addEventListener("load", onSoft, { once: true });
        link.addEventListener("error", onSoft, { once: true });
      } catch (eKick) {}
    }

    function secondaryChromeCssReady() {
      try {
        var nav =
          document.getElementById("vc-nav-menu-solid-css") ||
          document.querySelector('link[href*="vc-nav-menu-solid"]');
        var glow =
          document.getElementById("vc-glow-forms-css") ||
          document.getElementById("vc-glow-form-css") ||
          document.querySelector('link[href*="glow-form"]');
        var chromeUi =
          document.getElementById("vc-site-chrome-ui-css") ||
          document.querySelector('link[href*="vc-site-chrome-ui"]');
        if (nav && sheetAppliesToScreen(nav) && !sheetHasRules(nav)) return false;
        if (glow && sheetAppliesToScreen(glow) && !sheetHasRules(glow)) return false;
        if (chromeUi && sheetAppliesToScreen(chromeUi) && !sheetHasRules(chromeUi)) return false;
        try {
          if ((nav && sheetHasRules(nav)) || (glow && sheetHasRules(glow)) || (chromeUi && sheetHasRules(chromeUi))) {
            root.classList.add("vc-chrome-css-ready");
          }
        } catch (eMark) {}
        return true;
      } catch (eSec) {
        return true;
      }
    }

    /* bootBolt1: nav/glow/chrome-ui si applicano in background post-sipario */
    function kickSecondaryChromeReady() {
      try {
        if (secondaryChromeCssReady()) return;
        var links = [];
        var nav =
          document.getElementById("vc-nav-menu-solid-css") ||
          document.querySelector('link[href*="vc-nav-menu-solid"]');
        var glow =
          document.getElementById("vc-glow-forms-css") ||
          document.getElementById("vc-glow-form-css") ||
          document.querySelector('link[href*="glow-form"]');
        var chromeUi =
          document.getElementById("vc-site-chrome-ui-css") ||
          document.querySelector('link[href*="vc-site-chrome-ui"]');
        if (nav) links.push(nav);
        if (glow) links.push(glow);
        if (chromeUi) links.push(chromeUi);
        for (var i = 0; i < links.length; i += 1) {
          (function (link) {
            if (link.__vcBoltChromeKick) return;
            link.__vcBoltChromeKick = 1;
            function onChrome() {
              try {
                secondaryChromeCssReady();
              } catch (eOn) {}
            }
            link.addEventListener("load", onChrome, { once: true });
            link.addEventListener("error", onChrome, { once: true });
          })(links[i]);
        }
      } catch (eKick2) {}
    }

    function coreStylesReady() {
      return landingCssReady();
    }

    function markCoreStylesReady() {
      try {
        root.classList.add("vc-core-styles-ready", "vc-styles-ready", "vc-home-styles-ready");
      } catch (e5) {}
      /* bootHomeParity1b: look/soft subito quando i fogli ci sono — non aspettare layout cine */
      try {
        if (landingCssReady() || softFxIntentionallyOff()) {
          root.classList.add("vc-look-core-ready", "vc-soft-fx-ready");
        }
      } catch (eLook) {}
    }

    function revealAsSoonAsCssReady() {
      try {
        if (root.classList.contains("vc-page-cine-ready")) return;
        if (root.classList.contains("vc-user-leader-pending") || root.classList.contains("vc-user-leader-route")) {
          return;
        }
        if (!landingCssReady() && !softFxIntentionallyOff()) return;
        /* dashboard: layout cine obbligatorio */
        if (isDashboardCineRoot()) return;
        if (pathExcluded()) {
          revealWhenCssReady(0);
          return;
        }
        /* bootHomeParity1c: non aspettare DOMContentLoaded — HTML lunghi ritardavano di ~1.5s */
        revealExcluded();
      } catch (eEarlyRev) {}
    }

    function waitCoreStyles(n) {
      n = n || 0;
      if (coreStylesReady()) {
        markCoreStylesReady();
        revealAsSoonAsCssReady();
        return;
      }
      /* bootBolt1: poll più stretto */
      var maxPass = phone ? 48 : desktop ? 40 : 56;
      var delayMs = phone ? 12 : desktop ? 10 : 14;
      if (n < maxPass) {
        window.setTimeout(function () {
          waitCoreStyles(n + 1);
        }, delayMs);
        return;
      }
      /* bootExtMatch1: failsafe: also mark if any landing sheet has rules */
      if (landingCssLinksPresent()) {
        markCoreStylesReady();
        revealAsSoonAsCssReady();
        return;
      }
      try {
        var Lf = findLandingCssLinks();
        if (
          (Lf.core && sheetHasRules(Lf.core)) ||
          (Lf.ext && sheetHasRules(Lf.ext)) ||
          (Lf.mono && sheetHasRules(Lf.mono))
        ) {
          markCoreStylesReady();
          revealAsSoonAsCssReady();
        }
      } catch (eFsCore) {}
    }

    function markStylesReadyOnly() {
      try {
        root.classList.add("vc-styles-ready");
        markCoreStylesReady();
      } catch (eSt) {}
    }

    function revealExcluded() {
      try {
        /* interactHold1: marca ready ma tieni sipario/hold finché chrome non è settled */
        /* profileRelockKill2 + bootHoldJump1: se sipario già giù / chrome done,
           NON riattaccare hold (era flash cursore + unlock→fondo a ~2.8s). */
        var chromeAlready =
          root.classList.contains("vc-chrome-scroll-armed") ||
          root.classList.contains("vc-cine-curtain-off") ||
          window.__vcChromeVisualReady === 1 ||
          window.__vcChromeLoadDone === true ||
          window.__vcChromeScrollArmed === true ||
          (root.classList.contains("vc-page-cine-ready") && !curtainStillUp());
        var holdClasses = [
          "vc-page-cine-ready",
          "vc-styles-ready",
          "vc-core-styles-ready",
          "vc-home-motion-ready",
          "vc-home-styles-ready",
        ];
        if (!chromeAlready) holdClasses.push("vc-interaction-hold");
        root.classList.add.apply(root.classList, holdClasses);
        try {
          if (landingCssReady()) root.classList.add("vc-look-core-ready", "vc-soft-fx-ready");
        } catch (eSoftR) {}
        if (chromeAlready) {
          try {
            root.classList.remove("vc-interaction-hold", "vc-scroll-soft-lock", "vc-loading-scroll-lock");
          } catch (eHoldOff) {}
        }
        /* bootBolt1: NON togliere vc-page-cine-boot qui —
           altrimenti inline hide muore prima del curtain-off → flash layout */
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
        if (isCineBaked()) return true;
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
        /* profileFreezeKill3: NEVER inject home-cine on /user/?id= — freezes main thread */
        if (window.__vcHomeCineProfileSkip) return;
        try {
          var p = String(location.pathname || "").replace(/\/+$/, "") || "/";
          var q = new URLSearchParams(location.search || "");
          var id = String(q.get("id") || q.get("userId") || q.get("uid") || "").trim();
          if (
            ((p === "/user" || p === "/users") && /^\d{17,20}$/.test(id)) ||
            /^\/users?\/\d{17,20}$/.test(p) ||
            (document.documentElement &&
              (document.documentElement.classList.contains("vc-user-profile-route") ||
                document.documentElement.classList.contains("vc-user-profile-pending")))
          ) {
            window.__vcHomeCineProfileSkip = 1;
            return;
          }
        } catch (eProf) {}
        if (typeof window.__vcPageHeroLayout === "function") return;
        if (document.querySelector('script[src*="vc-home-cine"]')) return;
        var s = document.createElement("script");
        s.src = "/js/vc-home-cine.20261012profileHangKill2.js?v=20261012profileFreezeKill3";
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
        if (!landingCssReady() && Date.now() - bootStartedAt < HARD_FAILSAFE_MS + 900) {
          armRevealFailsafe(standalone ? 180 : 280);
          return;
        }
        try {
          ensureHomeCineScript();
          if (typeof window.__vcPageHeroLayout === "function") {
            window.__vcPageHeroLayout({ force: true });
          }
        } catch (eLay) {}
        /* schedaBootCue1: aspetta contenuto scheda prima del reveal */
        if (boardsViewStillPending()) {
          armRevealFailsafe(standalone ? 220 : 280);
          return;
        }
        /* bootBolt1: niente wait layout — CSS già su support-hero */
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
        wireLink(L.look, "look");
        wireLink(L.soft, "soft");
        wireLink(L.theme, "theme");
        wireLink(L.mono, "mono");
        /* bootBolt1: ext/photo/tw non bloccano finish — wire solo per mark */
        wireLink(L.ext, "ext");
        wireLink(L.tw, "tw");
        wireLink(L.photo, "photo");
        if (landingCssReady()) {
          finish(false);
          return;
        }
        var elapsed = Date.now() - startedAt;
        /* bootBolt1: force più corto */
        if (elapsed >= HARD_FAILSAFE_MS + 400) {
          finish(true);
          return;
        }
        window.setTimeout(tick, 12);
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
      if (root.classList.contains("vc-page-cine-ready")) {
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
        if (n < 40) {
          window.setTimeout(function () {
            waitForLayoutAndReveal(n + 1);
          }, 28);
          return;
        }
        revealWhenCssReady(0);
        return;
      }
      /* cineBake1: se DOM già baked → reveal su CSS, niente poll remap */
      if (isCineBaked()) {
        if (landingCssReady() || softFxIntentionallyOff()) {
          revealExcluded();
          return;
        }
      } else {
        try {
          ensureHomeCineScript();
          if (typeof window.__vcEnsureCommunityPageCineLayout === "function") {
            window.__vcEnsureCommunityPageCineLayout();
          } else if (typeof window.__vcPageHeroLayout === "function") {
            window.__vcPageHeroLayout({ force: true });
          }
        } catch (ePhotoLay) {}
        if (tryApplyLayout() && landingCssReady()) {
          revealExcluded();
          return;
        }
      }
      if (landingCssReady() || softFxIntentionallyOff()) {
        revealExcluded();
        return;
      }
      var maxPoll = SITE_PHOTO_BG ? 8 : 6;
      var pollMs = 12;
      if (n >= maxPoll) {
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
      /* schedaBootCue1: non rivelare scheda finché API non ha dipinto */
      if (boardsViewStillPending()) {
        window.setTimeout(function () {
          revealWhenCssReady(n + 1);
        }, 80);
        return;
      }
      /* bootNoPreGrad1: niente sipario giù senza soft-fx/landing */
      if (landingCssReady() || softFxIntentionallyOff()) {
        revealExcluded();
        return;
      }
      var softFailMs = HARD_FAILSAFE_MS + 400;
      if (Date.now() - bootStartedAt >= softFailMs || n >= 40) {
        try {
          root.classList.add("vc-look-core-ready", "vc-soft-fx-ready");
        } catch (eFs) {}
        revealExcluded();
        return;
      }
      window.setTimeout(function () {
        revealWhenCssReady(n + 1);
      }, 12);
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
          /* loadGateOnce1: mai secondo boot se sipario già giù / ready */
          if (
            root.classList.contains("vc-page-cine-ready") ||
            root.classList.contains("vc-cine-curtain-off")
          ) {
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

    /* loadGateOnce2: script defer tardivo non deve riattaccare boot su pagina già aperta */
    var alreadyOpen =
      root.classList.contains("vc-page-cine-ready") || root.classList.contains("vc-cine-curtain-off");
    if (alreadyOpen) {
      try {
        root.classList.remove("vc-page-cine-boot");
        root.classList.add("vc-page-cine-ready");
      } catch (eAlready) {}
      try {
        ensureHomeCineScript();
      } catch (eHcOpen) {}
    } else if (!root.classList.contains("vc-page-cine-boot")) {
      root.classList.add("vc-page-cine-boot");
      /* siparioNoYoyoReady1: discord-auth già rivelato → pin ready subito (no secondo hide) */
      try {
        if (
          root.classList.contains("vc-cine-curtain-off") &&
          (root.classList.contains("vc-soft-fx-ready") || root.classList.contains("vc-soft-fx-off")) &&
          (root.classList.contains("vc-look-core-ready") || root.classList.contains("vc-soft-fx-off"))
        ) {
          root.classList.add("vc-page-cine-ready");
        }
      } catch (eReadyPin) {}
      ensureHomeCineScript();
      armRevealFailsafe(isDashboardCineRoot() ? Math.max(FAILSAFE_MS, 2200) : FAILSAFE_MS);
    } else if (isDashboardCineRoot()) {
      ensureHomeCineScript();
      armRevealFailsafe(Math.max(FAILSAFE_MS, 2200));
    }
    /* siparioNoYoyoReady1: anche se boot già in HTML, pin ready se già rivelata */
    try {
      if (
        root.classList.contains("vc-page-cine-boot") &&
        !root.classList.contains("vc-page-cine-ready") &&
        root.classList.contains("vc-cine-curtain-off") &&
        (root.classList.contains("vc-soft-fx-ready") || root.classList.contains("vc-soft-fx-off")) &&
        (root.classList.contains("vc-look-core-ready") || root.classList.contains("vc-soft-fx-off"))
      ) {
        root.classList.add("vc-page-cine-ready");
      }
    } catch (eReadyPin2) {}
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
            /* siparioNoYoyoReady1: se curtain già giù, pin ready (anti hide post-reveal) */
            if (
              root.classList.contains("vc-cine-curtain-off") &&
              root.classList.contains("vc-page-cine-boot") &&
              !root.classList.contains("vc-page-cine-ready")
            ) {
              root.classList.add("vc-page-cine-ready");
            }
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

    /* bootHomeParity1c: parte subito (CSS poll), DCL solo come backup */
    waitCoreStyles(0);
    try {
      if (
        !alreadyOpen &&
        !root.classList.contains("vc-user-leader-pending") &&
        !root.classList.contains("vc-user-leader-route")
      ) {
        bootPolishPage();
      }
    } catch (eBootNow) {}
    /* legalSiparioCpu2: poll lift; legal = soft+look + min 800ms loader (no wait chrome) */
    try {
      if (!alreadyOpen && !window.__vcLegalBootFastLiftPoll) {
        window.__vcLegalBootFastLiftPoll = 1;
        var liftN = 0;
        var legalBoot = false;
        try {
          legalBoot = isLegalBootPage();
        } catch (eLB) {}
        function hideSiparioNodes() {
          ["vc-pre-cine-hard-sipario", "vc-boot-load-screen"].forEach(function (id) {
            var el = document.getElementById(id);
            if (!el) return;
            try {
              el.removeAttribute("style");
            } catch (eRmSt) {}
            el.hidden = true;
            el.setAttribute("hidden", "");
            el.style.setProperty("display", "none", "important");
            el.style.setProperty("opacity", "0", "important");
            el.style.setProperty("visibility", "hidden", "important");
            el.style.setProperty("pointer-events", "none", "important");
          });
        }
        function showBootLoadDuringSipario() {
          try {
            if (root.classList.contains("vc-cine-curtain-off")) return;
            ensureHardSipario();
            var sip = document.getElementById("vc-pre-cine-hard-sipario");
            var boot = document.getElementById("vc-boot-load-screen");
            if (sip) {
              sip.hidden = false;
              sip.removeAttribute("hidden");
              try {
                sip.style.removeProperty("display");
                sip.style.removeProperty("opacity");
                sip.style.removeProperty("visibility");
              } catch (eS1) {}
            }
            if (boot) {
              boot.hidden = false;
              boot.removeAttribute("hidden");
              try {
                boot.style.removeProperty("display");
                boot.style.removeProperty("opacity");
                boot.style.removeProperty("visibility");
              } catch (eS2) {}
            }
          } catch (eShow) {}
        }
        showBootLoadDuringSipario();
        /* legalPerfPack1: rAF + throttle (no setInterval 50–100ms forever) */
        var lastTick = 0;
        var liftDone = false;
        function liftTick(now) {
          if (liftDone) return;
          liftN += 1;
          try {
            if (root.classList.contains("vc-cine-curtain-off")) {
              hideSiparioNodes();
              liftDone = true;
              return;
            }
            var t = typeof now === "number" ? now : Date.now();
            if (t - lastTick < (legalBoot ? 90 : 50)) {
              window.requestAnimationFrame(liftTick);
              return;
            }
            lastTick = t;
            showBootLoadDuringSipario();
            var cssOk =
              (root.classList.contains("vc-soft-fx-ready") ||
                root.classList.contains("vc-soft-fx-off")) &&
              (root.classList.contains("vc-look-core-ready") ||
                root.classList.contains("vc-soft-fx-off")) &&
              !window.__vcSiparioCssGateHold;
            var age =
              Date.now() - Number(window.__vcCineBootStartedAt || Date.now());
            var minMs = legalBoot ? 800 : 350;
            if (!cssOk || age < minMs) {
              if (liftN > 120) {
                liftDone = true;
                return;
              }
              window.requestAnimationFrame(liftTick);
              return;
            }
            try {
              scheduleReleaseInteractionHold();
            } catch (eKickHold) {}
            try {
              root.classList.remove("vc-interaction-hold");
              releaseHoldDone = true;
            } catch (eHoldKick) {}
            try {
              liftBootCurtain(true);
            } catch (eKickLift) {}
            try {
              if (!root.classList.contains("vc-cine-curtain-off")) {
                root.classList.add("vc-cine-curtain-off", "vc-page-cine-ready");
                root.classList.remove("vc-page-cine-boot", "vc-boot-loader-gate");
                window.__vcCurtainOffAt = Date.now();
              }
            } catch (eForceCurt) {}
            if (root.classList.contains("vc-cine-curtain-off")) {
              hideSiparioNodes();
              liftDone = true;
              return;
            }
            if (liftN > 120) {
              liftDone = true;
              return;
            }
          } catch (eLiftPoll) {
            if (liftN > 120) {
              liftDone = true;
              return;
            }
          }
          try {
            document.addEventListener(
              "vc:soft-fx-ready",
              function () {
                if (!liftDone) window.requestAnimationFrame(liftTick);
              },
              { once: true },
            );
          } catch (eEv) {}
          window.requestAnimationFrame(liftTick);
        }
        window.requestAnimationFrame(liftTick);
      }
    } catch (eFastLift) {}
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        if (root.classList.contains("vc-user-leader-pending") || root.classList.contains("vc-user-leader-route")) return;
        if (
          root.classList.contains("vc-page-cine-ready") ||
          root.classList.contains("vc-cine-curtain-off")
        ) {
          try {
            root.classList.remove("vc-page-cine-boot");
          } catch (eNoRe) {}
          if (curtainStillUp()) {
            if (root.classList.contains("vc-interaction-hold")) scheduleReleaseInteractionHold();
            else liftBootCurtain(true);
          }
          return;
        }
        bootPolishPage();
      });
    }

    function hardRevealTick() {
      if (root.classList.contains("vc-page-cine-ready")) {
        if (curtainStillUp()) {
          if (root.classList.contains("vc-interaction-hold")) scheduleReleaseInteractionHold();
          else liftBootCurtain(true);
        }
        return;
      }
      /* schedaBootCue1: hard failsafe ritardato se scheda ancora in fetch */
      if (boardsViewStillPending()) {
        window.setTimeout(hardRevealTick, 280);
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
          if (boardsViewStillPending()) {
            window.setTimeout(hardRevealTick, 280);
            return;
          }
          try {
            if (typeof window.__vcPageHeroLayout === "function") {
              window.__vcPageHeroLayout({ force: true });
            }
          } catch (eLate2) {}
          revealWhenCssReady(0);
        }, standalone ? 200 : 320);
        return;
      }
      try {
        if (typeof window.__vcPageHeroLayout === "function") {
          window.__vcPageHeroLayout({ force: true });
        }
      } catch (eLate) {}
      revealWhenCssReady(0);
    }
    window.setTimeout(
      hardRevealTick,
      isDashboardCineRoot() ? Math.max(HARD_FAILSAFE_MS, 2200) : HARD_FAILSAFE_MS,
    );

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
          if (Date.now() - bootStartedAt >= HARD_FAILSAFE_MS + 600) {
            if (boardsViewStillPending()) return;
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
      /* violKill2: pageshow/visibility NON devono fare lift sync (Violation 600ms+) */
      function deferCurtainRecover() {
        if (window.__vcCineVisLiftSched) return;
        window.__vcCineVisLiftSched = 1;
        window.setTimeout(function () {
          window.__vcCineVisLiftSched = 0;
          try {
            if (!(root.classList.contains("vc-page-cine-ready") && curtainStillUp())) return;
            if (root.classList.contains("vc-interaction-hold")) scheduleReleaseInteractionHold();
            else liftBootCurtain(true);
          } catch (eDef) {}
        }, 48);
      }
      window.addEventListener("pageshow", function () {
        try {
          deferCurtainRecover();
        } catch (ePs) {}
      });
      document.addEventListener("visibilitychange", function () {
        try {
          if (document.visibilityState !== "visible") return;
          deferCurtainRecover();
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
/* schedaBootCue1 */

/* ptrScrollYoYoKill1 */
