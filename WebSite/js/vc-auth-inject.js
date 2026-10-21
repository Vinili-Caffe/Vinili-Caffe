/* siparioBorderPin1 */
/**
 * megaSplit1: asset injector extracted from discord-auth (ensureSiteHelperScripts).
 * Load AFTER vc-asset-versions.js, BEFORE discord-auth.js.
 * loadSyncPack1: overlay sync — stillLoading/bootApisPending include boards-view;
 *   forceGateOpen guards session/dash; 6s soft cap.
 * ticketsGlowFilterKill1: WT_LAYOUT + THEME_LIGHT pin for tickets glow/filter fix.
 * Visual lock: same inject paths/versions; no layout change.
 * routeGate1: load solo pezzi serviti dalla route (IDB/sticky/drafts/lightbox/dialog).
 * loadToastLinger1: Caricamento… come toast sitewide + linger dopo fine load.
 * homeScrollLock1: dopo sipario NON togliere scroll-lock finché __vcChromeLoadDone
 *   (home apriva curtain prima → overflow auto + scroll mentre barra/toast ancora on).
 * authInjectSyntax1: fix premature end-comment in header (Unexpected token star).
 * chromeGap1: chromeAlign strip ha tolto vc-chrome/tw-build alle pagine senza
 *   page-bundle → promo flat + menu account grezzo; ripristina solo se manca bundle/page-home.
 * cssLikeFeedback1: XOR = page-bundle come /feedback/ (NO landing-ext/tw/core dual-stack).
 * footerBreath404Fix1: appendScript non rimappa breath → .css (/js/*.css 404).
 */
(function () {
  /* emojiWordmarkAll1: emoji-render su tutte le route non-light (vote/ruoli/… wordmark+footer) */
  /* siparioLoadSand1 + postCurtainToast1: sipario = schermata; DOPO curtain-off = toast Caricamento */
  /* toastSyncAll2: sipario solo dopo chrome done (no lift a 2.8s) + toast linger unico */
  /* toastSyncAll1: toast dismiss unico (stesso linger) + stillLoading = chrome+API */
  /* perfRoiPack1: emoji/light-shell gate + toast unstick */
  /* toastUnstickHard1: wall-clock dismiss sempre (has0 path non saltava failsafe) */
  /* toastChrome404Fix1: toast solo via auth (no post-curtain overwrite); dismiss duro */
  /* sitePerfAll1: toast poll off quando tab hidden / latched */
  /* jsWakeKill2: kill timer forever (progress 50ms / scrollLock 400ms) */
   var VER = "20261021cssMerge1";
  if (window.__VC_AUTH_INJECT_BOOT === VER) return;
  window.__VC_AUTH_INJECT_BOOT = VER;
  /* homeCritical1: vc-home-critical early; page-home media=print + post-curtain */
  /* legalDefer1: vc-legal-critical early; page-legal media=print + post-curtain */
  /* iosPushStampFix1: NON downgrade LANDING_NOTIF sotto siteOptAll2
     (notifBellLiveFix1 voleva SW iosPushGzHeal1 → unregister loop iOS → zero banner) */
  /* ticketsCritical1: vc-tickets-critical early; page-tickets media=print + post-curtain */
  /* pageCriticalAll1: cine-public/bacheca/staff/dashboard/misc/profile critical+defer */
  /* pageDeferRepinFix1: MAI ri-defer page-* dopo curtain/promote (tickets/legal CSS sparito) */
  /* pageDeferRepinFix2: TUTTE le page-* sync media=all (no print pin) */
  /* profileCssFix1: /user profilo → page-profile+staff-pause (no cine-public) */
  /* siteOptAll1: notif idle-auth + HTML scrub deploy + yield INP + i18n gate */
  /* assetPageFilter1: JS/CSS per-path (scrub HTML + late CSS post-curtain sitewide) */
  /* assetGateSite1: type-sfx/presence/view-as gated sitewide + HTML scrub; path subroutes */
  /* heroMetalStats1: hero 2px border-box = stats; forceCanon no downgrade look */
  /* mqNoSnapSettle1: settle soft-pause marquee (no snap@0 mid-idle) */
  /* mqHoverNoRestart1: marquee hover no reset@0 su pointerover figli */
  /* homeIsClose1: fix :is( unclosed in page-home — CSSOM truncated after glow */
  /* homeCssSlim1e: page-home stamp registry + alien drop look-lock */
  /* phoneBellTapFree1: campanella post-sipario + cine-boot/chrome-ui stamp */
  /* pushIosDeclarative1: LANDING_NOTIF pin → SW Declarative Apple */
  /* homeBootFast1: CSS secondari post-sipario; gate soft+look ~900ms; no discord.gif boot. */
  /* homeLoadCpu1d: chromePayloadReady no circular gate; toast wall 5.5s. */
  /* homeLoadCpu1c: bootAge = performance.now (no SoftFxCssReadyAt skew). */
  /* homeLoadCpu1b: sipario hard su bootAge (non delay defer); failsafe HTML force. */
  /* homeLoadCpu1: page-home 404 unstick + sync stamp; hover keep. */
  /* homeHoverMq1b: restore logo/wordmark/user hover; keep soft stamp force. */
  /* chromeSharedFill3: scrollCue+notifSheet+loadUnify+confirmZ+homeCard+antiZoom. */
  /* chromeSharedFill2: navAlign+snavDrop+candMarquee+gifBg+cine fixed in chrome. */
  /* phoneTopBlurKillBoot1: zero blur phone from boot-kit first paint. */
  /* chromeSharedFill1: pill-pager + shared globals in site-chrome. */
  /* bgVeilFill1: home-cine__veil absolute fill sitewide (h=0 fuori home/legal). */
  /* toastLayout1: toast flex+hug in site-chrome (era solo page-home/dash). */
  /* splitBundle1: NO mega page-bundle — vc-site-chrome (chrome+shared) +
   *   supplementi già in vc-page-* per famiglia. Scrub page-bundle ovunque.
   * notifListOpenPaint1: LANDING_NOTIF → paint lista all’open sheet.
   * legalBundleChrome1: legal RI-PRENDE page-bundle — SUPERSEDED by splitBundle1.
   * bundleBack1: page-bundle DI NUOVO su tickets/staff/dash/home/bacheca —
   *   strip page-* da soli NON bastano (nav/nota/marquee rotte).
   * cleanStack1: home/staff/dashboard/bacheca dichiarativi (entity/ring fold);
   *   scrub landing dual; shell inject last-wins. (bundle scrub = FAIL look)
   * ticketsRestore3: no page-bundle early su scoped — REVERTITO (rompe look).
   * ticketsRestore2: fix SyntaxError catch (ticketsRestore1 non bootava → no shell).
   * ticketsRestore1: tickets pilot revert — shell di nuovo SOLO inject last-wins;
   *   pathIsPilotFamily = solo legal (tickets fuori pilot passivo).
   * ticketsPilot1: (revertito) shell in HTML prima di page-tickets = nav/CSS rotto.
   * legalPilot1: legal = stack dichiarativo (page-legal con chrome/glow folded);
   *   injector PASSIVO su legal (no remap look/chrome stamp; scrub leftover).
   * legalRestorePreCrit1: TORNA pre-critical — page-legal FULL + look-core +
   *   legal-chrome Import1. Niente strip/lite/critical inline.
   * legalLookCore1 / legalUnfreeze1 / legalCritical1: esperimenti (revertiti).
   * cursorBackSip3: no interval spam (crash/hang lift); MO + 2 timeout pin.
   * cursorBackSip2: watch più leggero (no scrollTo spam → no jump mid).
   * cursorBackSip1: PNG cursor ovunque; sipario+loader fino al lift; pin hide
   *   su curtain-off (poll gate non basta — si ferma prima del lift).
   * legalUtilsRestore3: MutationObserver anti re-flex sipario post-curtain.
   * legalUtilsRestore2: pinHideSipario anche su sheetsOk early-return (restore1 miss).
   * legalUtilsRestore1: legal HTML era su fase1LegalStrip1 (no Tailwind) → chrome vuoto;
   *   ripristina page-legal full; non riaprire sipario dopo curtain-off (flex inline).
   * legalChromeImport1: su policy IMPORTA vc-legal-chrome (slice dal bundle ~21KB),
   *   NON il mega-bundle 4MB. look-core + pin metal/flags. scrub page-bundle.
   * legalBundleBack1: aveva rimesso il mega-bundle (too heavy).
   * legalPerfPack1: ZERO bundle senza slice = FAIL.
   * legalSiparioCpu2: chrome/emoji POST-sipario; metal early.
   * homeSiparioLoad1: loader fullscreen resta durante sipario (no hide early).
   * legalBootFast3: sipario CSS hide post-curtain; strip inline flex.
   * legalBootFast2: canLift su soft+look anche con boot-loader-gate sticky.
   * legalBootFast1: no sipario yoyo su stamp swap look/soft; bake look tipLinkDup1c.
   * fbHangSoft1: bump boot guard (tipLinkDup1c early-return lasciava soft tipLinkDup1).
   * tipLinkDup1c: exclude tip/aside li from global main-li metal.
   * tipLinkDup1b: pinLegal last-wins tip li:has(a) + runtime_inject look stamps.
   * tipLinkDup1: tip hero li metal + link translate = doppia scritta.
   * backTopSheetHide1: hide back-top while notif sheet/drawer open.
   * viewAsGateClear1: Anteprima click — gate/lock orfani non bloccano più header.
   * cursorLagFix1: NAV_CHROME → chrome-ui cursor sync (no html class thrash).
   * legalChromeGaps1: legal ri-prende page-bundle + landing-notif (lang flags / sheet /
   * view-as chrome erano SOLO nel mega-bundle; no-bundle = menu lingua “sparito”).
   * legalBundleGaps1f: vc-theme runtime cream exclude blacklist/soon (#top beat red).
   * legalBundleGaps1e: theme-light exclude blacklist/soon from cream item color.
   * legalBundleGaps1d: stop early forceCanon from downgrading look-core stamp.
   * legalBundleGaps1c: blacklist = kill metal text-clip gradient (era transparent+bg).
   * legalBundleGaps1b: re-pin metal/blacklist style to body end (beat late light CSS).
   * legalBundleGaps1: account blacklist/soon + notif push via late style (batte light theme).
   * legalBugs3c: metal SVG anche con theme=light (gate dark-only spegneva icone).
   * legalBugs3b: legal = no page-bundle + shell on + svg metal pin + FOUC body hide.
   * legalNoBundle1: SUPERSEDED by legalChromeGaps1 (bundle back on legal).
   * lookLite1 / siparioCssGate / siparioHardOpen: restano; hard-open = rete sicurezza. */
  try {
    if (!document.getElementById("vc-sipario-css-gate1")) {
      var sipGate = document.createElement("style");
      sipGate.id = "vc-sipario-css-gate1";
      sipGate.setAttribute("data-vc", "legalBootFouc2");
      sipGate.textContent =
        /* legalBootFouc2: ready/soft NON rivelano main prima del sipario */
        "html.vc-soft-fx-ready:not(.vc-cine-curtain-off) #vc-pre-cine-hard-sipario," +
        "html.vc-look-core-ready:not(.vc-cine-curtain-off) #vc-pre-cine-hard-sipario," +
        "html.vc-styles-ready:not(.vc-cine-curtain-off) #vc-pre-cine-hard-sipario," +
        "html.vc-page-cine-ready:not(.vc-cine-curtain-off) #vc-pre-cine-hard-sipario," +
        "html.vc-soft-fx-ready:not(.vc-cine-curtain-off) #vc-boot-load-screen," +
        "html.vc-look-core-ready:not(.vc-cine-curtain-off) #vc-boot-load-screen," +
        "html.vc-page-cine-ready:not(.vc-cine-curtain-off) #vc-boot-load-screen{" +
        "display:flex!important;opacity:1!important;visibility:visible!important;" +
        "pointer-events:auto!important;position:fixed!important;inset:0!important;" +
        "z-index:2147483100!important}" +
        "html:not(.vc-cine-curtain-off) #vc-pre-cine-hard-sipario{" +
        "display:block!important;opacity:1!important;visibility:visible!important;" +
        "pointer-events:auto!important;position:fixed!important;inset:0!important;" +
        "z-index:2147483000!important;background:#100c09!important}" +
        "html.vc-cine-curtain-off #vc-pre-cine-hard-sipario," +
        "html.vc-cine-curtain-off #vc-boot-load-screen{" +
        "display:none!important;opacity:0!important;visibility:hidden!important;" +
        "pointer-events:none!important}" +
        "html:not(.vc-cine-curtain-off) body>*:not(#vc-pre-cine-hard-sipario):not(#vc-site-progress):not(#vc-site-toast-host):not(#vc-fx-flat-css):not(#vc-boot-progress-stub-css):not(#vc-sipario-css-gate1)," +
        "html.vc-page-cine-ready:not(.vc-cine-curtain-off) body>*:not(#vc-pre-cine-hard-sipario):not(#vc-site-progress):not(#vc-site-toast-host):not(#vc-fx-flat-css)," +
        "html.vc-soft-fx-ready:not(.vc-cine-curtain-off) body>*:not(#vc-pre-cine-hard-sipario):not(#vc-site-progress):not(#vc-site-toast-host):not(#vc-fx-flat-css)," +
        "html:not(.vc-cine-curtain-off) body.vc-body>main," +
        "html:not(.vc-cine-curtain-off) body.vc-body>header," +
        "html:not(.vc-cine-curtain-off) body.vc-body>footer," +
        "html.vc-page-cine-ready:not(.vc-cine-curtain-off) body.vc-body>main," +
        "html.vc-page-cine-ready:not(.vc-cine-curtain-off) body.vc-body>header," +
        "html.vc-page-cine-ready:not(.vc-cine-curtain-off) body.vc-body>footer{" +
        "opacity:0!important;visibility:hidden!important;pointer-events:none!important}" +
        /* fxFlatKill1d: barra+toast restano visibili sopra sipario */
        "html:not(.vc-cine-curtain-off) #vc-site-progress," +
        "html:not(.vc-cine-curtain-off) #vc-site-progress.is-loading," +
        "html:not(.vc-cine-curtain-off) #vc-site-progress__bar{" +
        "opacity:1!important;visibility:visible!important;display:block!important;" +
        "pointer-events:none!important;z-index:2147483600!important}";
      (document.head || document.documentElement).appendChild(sipGate);
    }
  } catch (eSipGateCss) {}
  /* siparioUnstick1: wait CSS ma MAI sipario forever — unstick @5.5s se sheet ha regole */
  try {
    window.__vcSiparioFlashKill1 = 1;
    window.__vcSiparioCssGateHold = 1;
    function siparioBootAgeMs() {
      /* homeLoadCpu1b: clock da navigationStart — SoftFxCssReadyAt ritardava hard-open a 10s+ */
      try {
        if (!window.__vcSiparioGateBornAt) {
          var nav0 = 0;
          try {
            nav0 = Number(performance.timeOrigin || 0) || 0;
          } catch (eTo) {}
          if (!nav0) {
            try {
              nav0 = Number(performance.timing && performance.timing.navigationStart) || 0;
            } catch (eNs) {}
          }
          window.__vcSiparioGateBornAt = nav0 || Date.now();
        }
        var now = Date.now();
        try {
          if (typeof performance.now === "function" && performance.timeOrigin) {
            return Math.max(0, performance.now());
          }
        } catch (ePn) {}
        return Math.max(0, now - Number(window.__vcSiparioGateBornAt || now));
      } catch (eAge) {
        return 99999;
      }
    }
    function forceCanonSoftLookHref() {
      try {
        /* mqIdleResumeAll3: anche assetContract/pilot — CDN HTML stale lascia soft/look vecchi
           (hover wordmark/logo + pin). Swap href se stamp â‰  want (no early-return pilot). */
        var soft =
          document.getElementById("vc-soft-fx-css") ||
          document.querySelector('link[href*="vc-soft-fx"]');
        var look =
          document.getElementById("vc-look-lite-css") ||
          document.querySelector('link[href*="vc-look-lite"]') ||
          document.getElementById("vc-look-core-css") ||
          document.querySelector('link[href*="vc-look-core"]');
        var wantSoft = "";
        try {
          if (window.__VC_ASSET_VERS && window.__VC_ASSET_VERS.SOFT_FX_VER) {
            wantSoft = String(window.__VC_ASSET_VERS.SOFT_FX_VER);
          }
        } catch (eAvS) {}
        if (!wantSoft && typeof SOFT_FX_VER !== "undefined" && SOFT_FX_VER) {
          wantSoft = String(SOFT_FX_VER);
        }
        var wantLook =
          typeof LOOK_CORE_VER !== "undefined" && LOOK_CORE_VER
            ? String(LOOK_CORE_VER)
            : "20261020heroMetalStats1";
        try {
          if (window.__VC_ASSET_VERS && window.__VC_ASSET_VERS.LOOK_CORE_VER) {
            wantLook = String(window.__VC_ASSET_VERS.LOOK_CORE_VER);
          }
        } catch (eAvL) {}
        /* heroRing2px1: mai downgrade look verso mqHoverGifFooter1 / stamp pre-ring */
        try {
          if (/mqHoverGifFooter1|mqHoverOnly1|wmUlDupKill1/i.test(String(wantLook || ""))) {
            wantLook = "20261020heroMetalStats1";
          }
        } catch (eWantLookPin) {}
        var wantLite =
          typeof LOOK_LITE_VER !== "undefined" && LOOK_LITE_VER
            ? String(LOOK_LITE_VER)
            : "20261018tipLinkDup1";
        var curtainOff = false;
        try {
          curtainOff = document.documentElement.classList.contains("vc-cine-curtain-off");
        } catch (eCurt) {}
        function sheetAlive(link) {
          try {
            var n =
              (link.sheet && link.sheet.cssRules && link.sheet.cssRules.length) ||
              (link.sheet && link.sheet.rules && link.sheet.rules.length) ||
              0;
            return n > 0;
          } catch (eAl) {
            return false;
          }
        }
        function stampIsMqIdle(v) {
          return /mqIdleResumeAll3/i.test(String(v || ""));
        }
        if (soft && wantSoft) {
          var sh = String(soft.getAttribute("href") || "");
          /* homeAcctMetal1c: MAI swap se want sconosciuto; MAI downgrade homeAcctMetal* → heroDeckMatch1 */
          var curSoftStamp =
            (sh.match(/vc-soft-fx\.([^/?"'#]+?)(?:\.css)?(?:\?|$)/i) || [])[1] || "";
          curSoftStamp = String(curSoftStamp || "").replace(/\.css$/i, "");
          var wouldDowngrade =
            /homeAcctMetal|homeHoverMq|homeLoadCpu/i.test(curSoftStamp) &&
            /^20261019heroDeckMatch1$/i.test(wantSoft);
          if (sh.indexOf(wantSoft) === -1 && !wouldDowngrade) {
            soft.setAttribute(
              "href",
              "/css/vc-soft-fx." + wantSoft + ".css?v=" + wantSoft,
            );
            soft.media = "all";
            if (!soft.id) soft.id = "vc-soft-fx-css";
          }
        }
        /* heroRing2px1: aggiorna SEMPRE look-core (lite non deve bloccare il core) */
        var lookCore =
          document.getElementById("vc-look-core-css") ||
          document.querySelector('link[href*="vc-look-core."]');
        if (lookCore && wantLook) {
          var lhCore = String(lookCore.getAttribute("href") || "");
          if (lhCore.indexOf(wantLook) === -1) {
            lookCore.setAttribute(
              "href",
              "/css/vc-look-core." + wantLook + ".css?v=" + wantLook,
            );
            lookCore.media = "all";
            if (!lookCore.id) lookCore.id = "vc-look-core-css";
          }
        }
        if (look) {
          var lh = String(look.getAttribute("href") || "");
          /* legalLookCore1: su policy PREFERISCI look-core (look pieno) */
          var forceCore = false;
          try {
            forceCore =
              typeof pathIsLegalFamily === "function" && pathIsLegalFamily();
          } catch (eFL) {}
          var isLite =
            !forceCore &&
            (/look-lite/i.test(lh) || look.id === "vc-look-lite-css");
          var want = isLite ? wantLite : wantLook;
          var stem = isLite ? "vc-look-lite" : "vc-look-core";
          /* heroRing2px1: sync look stamp come soft (no gate curtain/sheetAlive) */
          if (lh.indexOf(want) === -1 || (forceCore && /look-lite/i.test(lh))) {
            look.setAttribute("href", "/css/" + stem + "." + want + ".css?v=" + want);
            look.media = "all";
            look.id = isLite ? "vc-look-lite-css" : "vc-look-core-css";
          }
        }
      } catch (eForce) {}
    }
    function siparioCssSheetsOk() {
      try {
        forceCanonSoftLookHref();
        var soft =
          document.getElementById("vc-soft-fx-css") ||
          document.querySelector('link[href*="vc-soft-fx"]');
        var look =
          document.getElementById("vc-look-lite-css") ||
          document.querySelector('link[href*="vc-look-lite"]') ||
          document.getElementById("vc-look-core-css") ||
          document.querySelector('link[href*="vc-look-core"]');
        var bund =
          document.getElementById("vc-page-bundle-css") ||
          document.querySelector('link[href*="page-bundle"]');
        var pageCss =
          document.getElementById("vc-page-home-css") ||
          document.querySelector('link[href*="vc-page-home"]') ||
          document.getElementById("vc-page-legal-css") ||
          document.querySelector('link[href*="vc-page-legal"]') ||
          document.getElementById("vc-page-tickets-css") ||
          document.querySelector('link[href*="vc-page-tickets"]') ||
          document.getElementById("vc-page-cine-public-css") ||
          document.querySelector('link[href*="vc-page-cine-public"]') ||
          document.getElementById("vc-page-bacheca-css") ||
          document.querySelector('link[href*="vc-page-bacheca"]') ||
          document.getElementById("vc-page-staff-css") ||
          document.querySelector('link[href*="vc-page-staff"]') ||
          document.getElementById("vc-page-dashboard-css") ||
          document.querySelector('link[href*="vc-page-dashboard"]') ||
          document.getElementById("vc-page-misc-css") ||
          document.querySelector('link[href*="vc-page-misc"]') ||
          document.getElementById("vc-page-profile-css") ||
          document.querySelector('link[href*="vc-page-profile"]') ||
          bund;
        function mediaAll(link) {
          try {
            var med = String(link.media || "all").toLowerCase();
            return !med || med === "all" || med.indexOf("all") !== -1;
          } catch (eMed) {
            return true;
          }
        }
        function sheetHasRules(link) {
          try {
            var n =
              (link.sheet && link.sheet.cssRules && link.sheet.cssRules.length) ||
              (link.sheet && link.sheet.rules && link.sheet.rules.length) ||
              0;
            if (n > 0) return true;
          } catch (eSh) {}
          try {
            if (link.getAttribute("data-vc-sheet-loaded") === "1") return true;
          } catch (eLd) {}
          return false;
        }
        function sheetFailed(link) {
          try {
            return !!(link && link.getAttribute("data-vc-sheet-failed") === "1");
          } catch (eFail) {
            return false;
          }
        }
        function armSheetErr(link) {
          if (!link || link.__vcSheetErrArm) return;
          link.__vcSheetErrArm = 1;
          try {
            link.addEventListener(
              "error",
              function () {
                try {
                  link.setAttribute("data-vc-sheet-failed", "1");
                } catch (eSet) {}
              },
              { once: true },
            );
          } catch (eArm) {}
        }
        try {
          armSheetErr(soft);
          armSheetErr(look);
          armSheetErr(pageCss);
          armSheetErr(bund);
        } catch (eArmAll) {}
        function linkReadyStrict(link) {
          if (!link || !mediaAll(link)) return false;
          try {
            if (typeof softFxSheetReady === "function") return softFxSheetReady(link);
            if (typeof window.__vcSoftFxSheetReady === "function") {
              return window.__vcSoftFxSheetReady(link);
            }
          } catch (eReady) {}
          return sheetHasRules(link);
        }
        function linkReadyLoose(link) {
          return !!(link && mediaAll(link) && sheetHasRules(link));
        }
        var age = siparioBootAgeMs();
        /* legalCritical1: CSS critico inline → lift dopo min loader (~450ms) */
        var hasCritical = false;
        try {
          hasCritical =
            !!document.getElementById("vc-legal-critical-css") ||
            document.documentElement.classList.contains("vc-legal-critical-ready") ||
            document.documentElement.getAttribute("data-vc-legal-critical") === "1";
        } catch (eCrit) {}
        var legalCrit = false;
        try {
          legalCrit =
            hasCritical &&
            typeof pathIsLegalFamily === "function" &&
            pathIsLegalFamily();
        } catch (eLegC) {
          legalCrit = hasCritical;
        }
        if (legalCrit && age >= 450) {
          if (soft && look && linkReadyLoose(soft) && linkReadyLoose(look)) {
            window.__vcSiparioUnstick1 = 1;
            return true;
          }
          if (
            age >= 700 &&
            ((soft && linkReadyLoose(soft)) || (look && linkReadyLoose(look)))
          ) {
            window.__vcSiparioUnstick1 = 1;
            return true;
          }
          if (age >= 900) {
            window.__vcSiparioUnstick1 = 1;
            return true;
          }
        }
        /* homeCritical1 / ticketsCritical1: critical sheet ready → page-* defer OK */
        var homeCritLink = null;
        try {
          homeCritLink =
            document.getElementById("vc-home-critical-css") ||
            document.querySelector('link[href*="vc-home-critical"]');
        } catch (eHcL) {}
        var homeCritOk = false;
        try {
          homeCritOk = !!(homeCritLink && linkReadyLoose(homeCritLink));
        } catch (eHcOk) {}
        var ticketsCritLink = null;
        try {
          ticketsCritLink =
            document.getElementById("vc-tickets-critical-css") ||
            document.querySelector('link[href*="vc-tickets-critical"]');
        } catch (eTcL) {}
        var ticketsCritOk = false;
        try {
          ticketsCritOk = !!(ticketsCritLink && linkReadyLoose(ticketsCritLink));
        } catch (eTcOk) {}
        var anyPageCritOk = homeCritOk || ticketsCritOk;
        try {
          if (!anyPageCritOk) {
            var anyCrit = document.querySelector(
              'link[id$="-critical-css"],link[href*="-critical."]',
            );
            anyPageCritOk = !!(anyCrit && linkReadyLoose(anyCrit));
          }
        } catch (eAnyC) {}
        if (anyPageCritOk && soft && look && age >= 450) {
          if (linkReadyLoose(soft) && linkReadyLoose(look)) {
            window.__vcSiparioUnstick1 = 1;
            try {
              document.documentElement.classList.add("vc-home-styles-ready");
            } catch (eHs) {}
            return true;
          }
        }
        if (!soft || !look) return false;
        /* homeBootFast1: home soft+look loose da ~900ms (era 1.8s) */
        var homeFast = false;
        try {
          var hp = String(location.pathname || "/").replace(/\/+$/, "") || "/";
          homeFast = hp === "/" || hp === "/index.html";
        } catch (eHf) {
          homeFast = false;
        }
        if (
          age >= (homeFast ? 900 : 1800) &&
          linkReadyLoose(soft) &&
          linkReadyLoose(look)
        ) {
          window.__vcSiparioUnstick1 = 1;
          return true;
        }
        var unstick = age >= 3200 || window.__vcSiparioUnstick1 === 1;
        if (unstick) {
          if (linkReadyLoose(soft) && linkReadyLoose(look)) {
            window.__vcSiparioUnstick1 = 1;
            return true;
          }
          if (age >= 3800 && (linkReadyLoose(soft) || linkReadyLoose(look))) {
            window.__vcSiparioUnstick1 = 1;
            return true;
          }
        }
        if (!linkReadyStrict(soft) || !linkReadyStrict(look)) return false;
        try {
          if (typeof pageHasScopedPageCss === "function" && pageHasScopedPageCss()) {
            return true;
          }
        } catch (eScOk) {}
        /* homeCritical1 / legalDefer1 / ticketsCritical1: deferred page-* if critical ready */
        if (pageCss && (sheetFailed(pageCss) || linkReadyLoose(pageCss))) return true;
        try {
          var deferCritOk = homeCritOk || ticketsCritOk || anyPageCritOk;
          if (!deferCritOk) {
            var legC =
              document.getElementById("vc-legal-critical-css") ||
              document.querySelector('link[href*="vc-legal-critical"]');
            deferCritOk = !!(legC && linkReadyLoose(legC));
          }
          if (
            pageCss &&
            deferCritOk &&
            String(pageCss.getAttribute("data-vc-defer-css") || "") === "post-curtain"
          ) {
            return true;
          }
        } catch (eDefPh) {}
        if (bund) return linkReadyStrict(bund) || sheetFailed(bund);
        return true;
      } catch (eOk) {
        return false;
      }
    }
    function showSiparioLoaderDuringBoot(r) {
      /* cursorBackSip1: sipario + "Caricamento…" fino a curtain-off */
      try {
        if (
          (r && r.classList.contains("vc-cine-curtain-off")) ||
          Number(window.__vcCurtainOffAt || 0) > 0
        ) {
          return false;
        }
        r.classList.add("vc-loader-blocking-live", "vc-loading-scroll-lock");
        /* scrollTo solo 1Ã— — altrimenti fight con hero-center = "jump" mid */
        if (!window.__vcBootScrollPinned) {
          window.__vcBootScrollPinned = 1;
          try {
            window.scrollTo(0, 0);
          } catch (eScr0) {}
        }
        var sip = document.getElementById("vc-pre-cine-hard-sipario");
        var load = document.getElementById("vc-boot-load-screen");
        if (sip && (sip.hidden || String(sip.style.display || "").indexOf("none") !== -1)) {
          sip.hidden = false;
          sip.removeAttribute("hidden");
          try {
            sip.style.setProperty("display", "flex", "important");
            sip.style.setProperty("opacity", "1", "important");
            sip.style.setProperty("visibility", "visible", "important");
          } catch (eSipSh) {}
        }
        if (load && (load.hidden || String(load.style.display || "").indexOf("none") !== -1)) {
          load.hidden = false;
          load.removeAttribute("hidden");
          try {
            load.style.setProperty("display", "flex", "important");
            load.style.setProperty("opacity", "1", "important");
            load.style.setProperty("visibility", "visible", "important");
          } catch (eLdSh) {}
        }
        return true;
      } catch (eShow) {
        return false;
      }
    }
    function pinHideSiparioAfterCurtain(r) {
      /* cursorBackSip1 / legalUtilsRestore2: inline flex batte CSS curtain-off */
      try {
        if (
          !(
            (r && r.classList.contains("vc-cine-curtain-off")) ||
            Number(window.__vcCurtainOffAt || 0) > 0
          )
        ) {
          return false;
        }
        ["vc-pre-cine-hard-sipario", "vc-boot-load-screen"].forEach(function (id) {
          var sipPin = document.getElementById(id);
          if (!sipPin) return;
          sipPin.hidden = true;
          sipPin.setAttribute("hidden", "");
          try {
            sipPin.style.setProperty("display", "none", "important");
            sipPin.style.setProperty("opacity", "0", "important");
            sipPin.style.setProperty("visibility", "hidden", "important");
            sipPin.style.setProperty("pointer-events", "none", "important");
          } catch (eStPin) {}
        });
        try {
          r.classList.remove("vc-loader-blocking-live", "vc-loading-scroll-lock");
        } catch (eBlkPin) {}
        try {
          window.scrollTo(0, 0);
        } catch (eScr1) {}
        return true;
      } catch (ePin) {
        return false;
      }
    }
    /* legalUnfreeze1: sipario force/watch SOLO legal (sitewide = hang) */
    if (!window.__vcSiparioCurtainWatch) {
      window.__vcSiparioCurtainWatch = 1;
      try {
        var legalWatch = false;
        try {
          legalWatch =
            typeof pathIsLegalFamily === "function" && pathIsLegalFamily();
        } catch (eLW) {}
        if (legalWatch) {
          var watchRoot = document.documentElement;
          showSiparioLoaderDuringBoot(watchRoot);
          try {
            var moCurt = new MutationObserver(function () {
              try {
                if (watchRoot.classList.contains("vc-cine-curtain-off")) {
                  pinHideSiparioAfterCurtain(watchRoot);
                }
              } catch (eMoC) {}
            });
            moCurt.observe(watchRoot, {
              attributes: true,
              attributeFilter: ["class"],
            });
          } catch (eMoArm) {}
          window.setTimeout(function () {
            try {
              pinHideSiparioAfterCurtain(document.documentElement);
            } catch (eT1) {}
          }, 4000);
          window.setTimeout(function () {
            try {
              pinHideSiparioAfterCurtain(document.documentElement);
            } catch (eT2) {}
          }, 8000);
        }
      } catch (eWatch) {}
    }
    function reclaimSiparioCssGate() {
      try {
        var r = document.documentElement;
        forceCanonSoftLookHref();
        var legalRec = false;
        try {
          legalRec =
            typeof pathIsLegalFamily === "function" && pathIsLegalFamily();
        } catch (eLR) {}
        /* curtain off → hide; show loader solo su legal */
        if (!pinHideSiparioAfterCurtain(r) && legalRec) {
          showSiparioLoaderDuringBoot(r);
        }
        if (siparioCssSheetsOk()) {
          window.__vcSiparioCssGateHold = 0;
          window.__vcSiparioCssGatePassed = 1;
          if (!pinHideSiparioAfterCurtain(r) && legalRec) {
            showSiparioLoaderDuringBoot(r);
          }
          try {
            if (!r.classList.contains("vc-soft-fx-ready")) {
              r.classList.add(
                "vc-soft-fx-ready",
                "vc-look-core-ready",
                "vc-styles-ready",
                "vc-page-cine-ready",
              );
            }
          } catch (eCls) {}
          return true;
        }
        /* legalBootFast1: mai yank curtain-off già alzato (stamp swap → FOUC pagina) */
        if (
          window.__vcSiparioCssGatePassed ||
          r.classList.contains("vc-cine-curtain-off") ||
          Number(window.__vcCurtainOffAt || 0) > 0
        ) {
          window.__vcSiparioCssGateHold = 0;
          pinHideSiparioAfterCurtain(r);
          return true;
        }
        window.__vcSiparioCssGateHold = 1;
        /* legalBootFast3: se curtain già off non riaprire sipario inline */
        if (r.classList.contains("vc-cine-curtain-off")) {
          window.__vcSiparioCssGateHold = 0;
          return true;
        }
        var sip =
          document.getElementById("vc-pre-cine-hard-sipario") ||
          document.getElementById("vc-boot-load-screen");
        if (sip) {
          sip.hidden = false;
          sip.removeAttribute("hidden");
          try {
            sip.style.setProperty("display", "flex", "important");
            sip.style.setProperty("opacity", "1", "important");
            sip.style.setProperty("visibility", "visible", "important");
          } catch (eSt) {}
        }
        return false;
      } catch (eRe) {
        return false;
      }
    }
    window.__vcSiparioCssSheetsOk = siparioCssSheetsOk;
    window.__vcReclaimSiparioCssGate = reclaimSiparioCssGate;
    reclaimSiparioCssGate();
    try {
      if (!window.__vcSiparioCssGatePoll) {
        window.__vcSiparioCssGatePoll = window.setInterval(function () {
          try {
            reclaimSiparioCssGate();
            if (!window.__vcSiparioCssGateHold) {
              window.clearInterval(window.__vcSiparioCssGatePoll);
              window.__vcSiparioCssGatePoll = 0;
              try {
                var softLift =
                  document.getElementById("vc-soft-fx-css") ||
                  document.querySelector('link[href*="vc-soft-fx"]');
                if (softLift && typeof markSoftFxReady === "function") {
                  markSoftFxReady(softLift);
                }
              } catch (eMk) {}
            }
          } catch (ePoll) {}
        }, 100);
        function forceOpenSiparioHard(why) {
          try {
            window.__vcSiparioUnstick1 = 1;
            window.__vcSiparioCssGateHold = 0;
            window.__vcSiparioCssGatePassed = 1;
            if (!window.__vcCurtainOffAt) window.__vcCurtainOffAt = Date.now();
            if (window.__vcSiparioCssGatePoll) {
              window.clearInterval(window.__vcSiparioCssGatePoll);
              window.__vcSiparioCssGatePoll = 0;
            }
            var rootH = document.documentElement;
            rootH.classList.add(
              "vc-cine-curtain-off",
              "vc-page-cine-ready",
              "vc-soft-fx-ready",
              "vc-look-core-ready",
              "vc-theme-light-ready",
              "vc-core-styles-ready",
              "vc-home-styles-ready",
              "vc-styles-ready",
            );
            rootH.classList.remove("vc-page-cine-boot", "vc-boot-loader-gate");
            ["vc-pre-cine-hard-sipario", "vc-boot-load-screen"].forEach(function (id) {
              var sipH = document.getElementById(id);
              if (!sipH) return;
              sipH.hidden = true;
              sipH.setAttribute("hidden", "");
              try {
                sipH.style.setProperty("display", "none", "important");
                sipH.style.setProperty("opacity", "0", "important");
                sipH.style.setProperty("visibility", "hidden", "important");
              } catch (eHide) {}
            });
            try {
              document.dispatchEvent(
                new CustomEvent("vc:soft-fx-ready", {
                  detail: { reason: String(why || "siparioHardOpen1") },
                }),
              );
            } catch (eEvH) {}
            try {
              document.dispatchEvent(
                new CustomEvent("vc:cine-curtain-off", {
                  detail: { reason: String(why || "siparioHardOpen1") },
                }),
              );
            } catch (eEvC) {}
          } catch (eHard) {}
        }
        window.__vcForceOpenSiparioHard = forceOpenSiparioHard;
        /* homeLoadCpu1b: hard open su età boot (defer non sposta il clock) */
        function bootAgeHardTick() {
          try {
            var age = siparioBootAgeMs();
            if (document.documentElement.classList.contains("vc-cine-curtain-off")) {
              window.__vcSiparioCssGateHold = 0;
              window.__vcSiparioCssGatePassed = 1;
              if (!window.__vcCurtainOffAt) window.__vcCurtainOffAt = Date.now();
              return;
            }
            if (age >= 2200) {
              window.__vcSiparioUnstick1 = 1;
              reclaimSiparioCssGate();
            }
            if (age >= 3200 && !document.documentElement.classList.contains("vc-cine-curtain-off")) {
              forceOpenSiparioHard("bootAge3200");
              return;
            }
            if (age < 4500) window.setTimeout(bootAgeHardTick, 120);
          } catch (eBat) {}
        }
        window.setTimeout(bootAgeHardTick, 100);
      }
    } catch (eArmPoll) {}
    try {
      if (!window.__vcSiparioCssGateMo) {
        window.__vcSiparioCssGateMo = 1;
        var moRoot = document.documentElement;
        var mo = new MutationObserver(function () {
          try {
            /* dopo unstick/hard: non richiedere sipario */
            if (window.__vcSiparioUnstick1 || !window.__vcSiparioCssGateHold) return;
            if (siparioBootAgeMs() >= 4500) return;
            if (moRoot.classList.contains("vc-cine-curtain-off")) {
              reclaimSiparioCssGate();
            }
          } catch (eMo) {}
        });
        mo.observe(moRoot, { attributes: true, attributeFilter: ["class"] });
        window.setTimeout(function () {
          try {
            mo.disconnect();
          } catch (eMoKill) {}
        }, 9000);
      }
    } catch (eMoArm) {}
  } catch (eFlashPatch) {}
  /* sepStyle1px1: stile policy (mocha) su sep ESISTENTI — 1px, NO glow, dimensioni pre-policy. */
  /* progGlowUnify1: stub = stessa sand-glow della barra load/scroll. */
  /* phoneBarBlur1: stub progress right:0 + flat (niente gutter/bloom blur telefono). */
  /* phoneBarBlurKill2: stub telefono senza picco #fffaf3 (alone/blur load+scroll). */
  /* barPostSip1: stub barra continua dopo sipario fino chrome-ui/loadDone. */
  /* barOneShot1: stub espone pct; stop su chrome-ui; toast solo dopo 100%. */
  /* interOnly1: kill Cormorant ovunque — solo Inter (titoli/card/brand). */
  /* loadGateHold2: lock/click restano mentre toast hold (anche post chrome-done). */
  /* loadGateHold1: toast/scroll/click fino a chrome+API done (forceGate non strippa a 800ms). */
  /* toastFont1: toast host 22rem → decentrato; titoli cine Inter → Cormorant; fonts.css ovunque. */
  /* sepSlim3: light pill ancora glow 6+12 — allinea look-core card. */
  /* sepSlim2: footer legal ancora glow 8+16 da pill — override dedicato. */
  /* sepSlim1: glow 8+16px faceva sep “capsule grosse” (footer legal).
     Stesso modello card: 1.5px + glow corto. */
  /* sepVisible2: height 1.35em + font-size:0 = height 0 (invisibili). Usa rem/px. */
  /* sepVisible1: inline sepEverywhere4 aveva gradient 90deg su sep verticali
     + box-shadow:none → snav-sep invisibili. Ripristina --vc-sep-v + glow. */
  /* homeCssLikeFb1: home TOCGLIEVA page-bundle → header/CTA diversi da feedback.
     Ora home = page-bundle (chrome) + page-home last (hero). */
  /* homeCssAlign3: kit JS aveva VER hardcodato siteChromeKit5 → riscriveva CSS.
     Stamp kit.js=chromeGap1 + refuse. */
  /* homeCssAlign2: force chrome-kit → chromeGap1 (no siteChromeKit5 leftover). */
  /* homeCssAlign1: home HTML puntava a asset-versions.siparioLoadPage2 (stale
     NAV=userMqFgRun5 / SOFT=KeepAlive2) → chrome/soft diversi da feedback.
     Force registry rewrite + refuse known-stale stamps sotto. */
  /* homeChromeAlign5: NAV_CHROME era loadClickGate2 (file ASSENTE=404) → home
     senza chrome-ui (= “CSS non carica”). Stamp allineato + soft-fx canon. */
  (function killLandingDualStackEarly() {
    /* FREEZEKILL5: niente MO landing su path pesanti; altrove MO corto (4s) */
    try {
      var __p = String(location.pathname || "/").replace(/\/+$/, "") || "/";
      if (
        __p === "/seratafilm" ||
        __p.indexOf("/seratafilm/") === 0 ||
        __p === "/tickets" ||
        __p.indexOf("/tickets/") === 0 ||
        __p.indexOf("/dashboard") === 0 ||
        __p.indexOf("/staff") === 0
      )
        return;
    } catch (__eSf) {}
    function pathIsHome() {
      try {
        var p = String(location.pathname || "/").replace(/\/+$/, "") || "/";
        return p === "/" || p === "/index.html";
      } catch (eP) {
        return false;
      }
    }
    function isBadHref(h) {
      var s = String(h || "");
      if (/vc-landing-core|vc-landing-ext|landing-ext|tw-build/i.test(s)) return true;
      /* homeCssLikeFb1: page-home solo fuori home; page-bundle MAI bad (anche home) */
      if (!pathIsHome() && /vc-page-home/i.test(s)) return true;
      return false;
    }
    function strip() {
      try {
        document
          .querySelectorAll(
            'link[href*="vc-landing-core"],link[href*="vc-landing-ext"],link[href*="landing-ext"],link[href*="tw-build"],link#vc-landing-core-css,link#vc-landing-ext-css,link[href*="vc-page-home"],link#vc-page-home-css,link[href*="page-bundle"],link#vc-page-bundle-css',
          )
          .forEach(function (l) {
            try {
              if (!isBadHref(l.getAttribute("href") || l.href)) return;
              if (l && l.parentNode) l.parentNode.removeChild(l);
            } catch (eRm) {}
          });
      } catch (eStrip) {}
    }
    strip();
    try {
      var mo = new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var nodes = muts[i].addedNodes || [];
          for (var j = 0; j < nodes.length; j++) {
            var n = nodes[j];
            if (!n || n.nodeType !== 1) continue;
            if (n.tagName === "LINK" && isBadHref(n.getAttribute("href") || n.href)) {
              try {
                if (n.parentNode) n.parentNode.removeChild(n);
              } catch (eKill) {}
            }
          }
        }
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
      window.setTimeout(function () {
        try {
          mo.disconnect();
        } catch (eD) {}
      }, 4000);
    } catch (eMo) {}
  })();
  /* preloadScrub4 / fase2Preload1: max 0 style preload (sheet già in head); font max 1 */
  (function scrubStalePreloads() {
    try {
      if (window.__vcPreloadScrub4) return;
      window.__vcPreloadScrub4 = 1;
      function scrub() {
        try {
          [
            "vc-look-core-preload",
            "vc-theme-light-preload",
            "vc-soft-fx-preload",
            "vc-boot-kit-preload",
          ].forEach(function (id) {
            var el = document.getElementById(id);
            if (el && el.parentNode) el.parentNode.removeChild(el);
          });
          var fontKept = 0;
          Array.prototype.forEach.call(document.querySelectorAll('link[rel="preload"]'), function (pre) {
            try {
              var as = String(pre.getAttribute("as") || "").toLowerCase();
              var href = String(pre.href || pre.getAttribute("href") || "");
              if (as === "style") {
                if (pre.parentNode) pre.parentNode.removeChild(pre);
                return;
              }
              if (as === "font") {
                if (fontKept >= 1 || /cormorant|fontawesome|font-awesome/i.test(href)) {
                  if (pre.parentNode) pre.parentNode.removeChild(pre);
                  return;
                }
                fontKept += 1;
                return;
              }
              if (
                /vc-look-core|vc-theme-light|vc-site-boot-kit|vc-soft-fx|vc-landing-core|vc-chrome/i.test(
                  href,
                )
              ) {
                if (pre.parentNode) pre.parentNode.removeChild(pre);
              }
            } catch (eP) {}
          });
        } catch (eScrub) {}
      }
      scrub();
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", scrub, { once: true });
      }
      window.setTimeout(scrub, 0);
      window.setTimeout(scrub, 60);
      window.setTimeout(scrub, 400);
      window.setTimeout(scrub, 1200);
    } catch (eBootScrub) {}
  })();
  /* routeGate1: path normalizzato (strip /en|/it) per gate asset */
  function vcNormPath() {
    try {
      var path = String(location.pathname || "/")
        .replace(/\/index\.html$/i, "")
        .replace(/\/+$/, "");
      if (!path) path = "/";
      path = path.replace(/^\/(en|it)(?=\/|$)/i, "") || "/";
      return path;
    } catch (eNp) {
      return "/";
    }
  }
  function vcPathRe(re) {
    try {
      return re.test(vcNormPath());
    } catch (eRe) {
      return false;
    }
  }
  function pathNeedsIdb() {
    return vcPathRe(/^\/(user|classifiche)(\/|$)/i);
  }
  function pathNeedsStickyChrome() {
    return vcPathRe(/^\/(terms|privacy|cookie|copyright|dati|tickets)(\/|$)/i);
  }
  function pathNeedsFormDrafts() {
    return vcPathRe(
      /^\/(candidature|feedback|tickets|appelli|seratafilm|confessionale|bacheca|dashboard)(\/|$)/i,
    );
  }
  function pathNeedsDialog() {
    return (
      pathNeedsFormDrafts() ||
      vcPathRe(/^\/(staff|user|classifiche|notifications)(\/|$)/i)
    );
  }
  function pathNeedsLightbox() {
    return vcPathRe(
      /^\/(confessionale|bacheca|feedback|recensioni|staff|user|classifiche|tickets)(\/|$)/i,
    );
  }
  function pathNeedsPcHeroCenter() {
    /* heroAllPages1: tutte le pagine (tickets/dashboard/staff inclusi) */
    return true;
  }
  /* assetGateSite1: type-sfx solo form/input (+ sottopercorsi) */
  function pathNeedsTypeSfx() {
    return vcPathRe(
      /^\/(candidature|confessionale|feedback|tickets|appelli|seratafilm|bacheca|dashboard|personalizza|staff\/compiti)(?=\/|$)/i,
    );
  }
  /* assetGateSite1: presence chat/ticket/staff (+ sottopercorsi) */
  function pathNeedsSitePresence() {
    return vcPathRe(
      /^\/(tickets|notifications|confessionale|staff|bacheca)(?=\/|$)/i,
    );
  }
  /* perfRoiPack1: shell leggera — niente emoji-render (games/status only).
     legalSiparioCpu1: privacy/terms/… riprendono emoji (wordmark/footer). */
  function pathIsLightShell() {
    return vcPathRe(/^\/(status|wordle|puzzle|personalizza)(\/|$)/i);
  }
  function pathIsDashboardFamily() {
    return vcPathRe(/^\/dashboard(\/|$)/i);
  }
  function pathNeedsEmojiRender() {
    /* emojiWordmarkAll1: wordmark/footer (🎃🍂) su vote/ruoli/home/legal/… */
    if (pathIsLightShell()) return false;
    return true;
  }
  /* assetGate1: spegni type-sfx embed HTML su pagine light (prima che defer parta) */
  try {
    if (!pathNeedsTypeSfx()) {
      document.documentElement.classList.add("vc-type-sfx-off");
      var tsKill = document.querySelectorAll(
        'script[src*="vc-type-sfx"],script[data-src*="vc-type-sfx"]',
      );
      for (var tsi = 0; tsi < tsKill.length; tsi++) {
        try {
          tsKill[tsi].type = "text/plain";
          tsKill[tsi].removeAttribute("src");
          tsKill[tsi].removeAttribute("data-src");
        } catch (eTsKill) {}
      }
    }
  } catch (eTsGate) {}
  /* assetPageFilter1: scrub HTML off-path (fallback se perf non ha già filtrato) */
  (function scrubAssetPageFilter1() {
    try {
      function killMatch(re, alsoCss) {
        var nodes = document.querySelectorAll("script[src],script[data-src]");
        for (var i = 0; i < nodes.length; i++) {
          var el = nodes[i];
          try {
            var src = String(el.getAttribute("src") || el.getAttribute("data-src") || "");
            if (!src || !re.test(src)) continue;
            if (/vc-landing-notif/i.test(src) && /vc-landing/i.test(String(re))) continue;
            el.type = "text/plain";
            el.setAttribute("data-vc-asset-filter", "20261021assetPageFilter1");
            if (el.getAttribute("src")) {
              el.setAttribute("data-vc-killed-src", src);
              el.removeAttribute("src");
            }
            el.removeAttribute("data-src");
          } catch (eK) {}
        }
        if (!alsoCss) return;
        var links = document.querySelectorAll('link[rel="stylesheet"][href],link[href]');
        for (var j = 0; j < links.length; j++) {
          try {
            var href = String(links[j].getAttribute("href") || "");
            if (!re.test(href)) continue;
            if (links[j].parentNode) links[j].parentNode.removeChild(links[j]);
          } catch (eL) {}
        }
      }
      if (!pathNeedsDialog()) killMatch(/vc-dialog(\.|$|\?)/i, false);
      if (!pathNeedsFormDrafts()) killMatch(/vc-form-drafts(\.|$|\?)/i, false);
      if (!pathNeedsLightbox()) killMatch(/vc-image-lightbox(\.|$|\?)/i, true);
      if (!vcPathRe(/^\/(tickets|confessionale|bacheca|notifications)(\/|$)/i)) {
        killMatch(/vc-chat-typing(\.|$|\?)/i, false);
      }
      if (!vcPathRe(/^\/tickets(\/|$)/i)) killMatch(/vc-tickets-push-gate(\.|$|\?)/i, false);
      if (!vcPathRe(/^\/(tickets|bacheca|staff\/compiti|dashboard)(\/|$)/i)) {
        killMatch(/vc-mini-pager(\.|$|\?)/i, false);
      }
      /* siteOptAll1: notif mega + locales solo on-demand */
      killMatch(/vc-landing-notif(\.|$|\?)/i, false);
      killMatch(/vc-i18n-locales(\.|$|\?)/i, false);
      if (!vcPathRe(/^\/(perks|wiki|sponsor|status|seratafilm|bacheca|donazioni|recensioni)(\/|$)/i)) {
        killMatch(/vc-i18n-pages-extra(\.|$|\?)/i, false);
      }
      try {
        var home = typeof pathIsHome === "function" ? pathIsHome() : vcNormPath() === "/";
        if (!home) {
          killMatch(/vc-kick-pip(\.|$|\?)/i, false);
          killMatch(/vc-twitch-pip(\.|$|\?)/i, false);
          killMatch(/(?:^|\/)live-stats(\.|$|\?)/i, false);
          killMatch(/vc-home-boot-gate(\.|$|\?)/i, false);
          killMatch(/vc-home-sw-cache-guard(\.|$|\?)/i, false);
          killMatch(/vc-live-config(\.|$|\?)/i, false);
        }
      } catch (eHome) {}
      try {
        var needLanding = false;
        try {
          var p = vcNormPath();
          needLanding =
            p === "/" ||
            /^\/(user|classifiche|vote|tickets|perks|personalizza|confessionale|notifications|bacheca|seratafilm|puzzle|donazioni)(\/|$)/i.test(
              p,
            );
        } catch (eNeed) {
          needLanding = true;
        }
        if (!needLanding) {
          var landNodes = document.querySelectorAll("script[src],script[data-src]");
          for (var li = 0; li < landNodes.length; li++) {
            var ls = landNodes[li];
            try {
              var lsrc = String(ls.getAttribute("src") || ls.getAttribute("data-src") || "");
              if (!lsrc || /vc-landing-notif/i.test(lsrc)) continue;
              if (!/vc-landing(\.|$|\?)/i.test(lsrc)) continue;
              ls.type = "text/plain";
              ls.setAttribute("data-vc-asset-filter", "20261021assetPageFilter1");
              if (ls.getAttribute("src")) {
                ls.setAttribute("data-vc-killed-src", lsrc);
                ls.removeAttribute("src");
              }
              ls.removeAttribute("data-src");
            } catch (eLs) {}
          }
        }
      } catch (eLand) {}
    } catch (eScrub) {}
  })();
  /* cursorMqStable1: URL su html/body; * inherit — no freccia Windows a ogni elemento */
  /* cursorBackSip1: PNG cursor anche su policy (niente skip legal) */
  try {
    var coarseOnly =
      window.matchMedia &&
      window.matchMedia("(hover: none) and (pointer: coarse)").matches &&
      !(window.matchMedia("(pointer: fine)").matches);
    if (!coarseOnly) {
      document.documentElement.classList.add("vc-site-cursor-ok");
      var curCss = document.getElementById("vc-cursor-win-flash-kill");
      if (!curCss) {
        curCss = document.createElement("style");
        curCss.id = "vc-cursor-win-flash-kill";
        (document.documentElement || document.head).appendChild(curCss);
      }
      curCss.setAttribute("data-vc", "cursorMqStable1");
      curCss.textContent =
        "html.vc-site-cursor-ok,html.vc-site-cursor-ok body{" +
        "cursor:url(/images/musicrecordspin-cursor-static.png) 12 12," +
        "url(/images/musicrecordspin-cursor-static.png) 12 12, auto!important}" +
        "html.vc-site-cursor-ok *{cursor:inherit!important}" +
        "@media (pointer:fine){html.vc-site-cursor-ok a,html.vc-site-cursor-ok button," +
        "html.vc-site-cursor-ok [role=button],html.vc-site-cursor-ok .vc-snav-item," +
        "html.vc-site-cursor-ok summary{" +
        "cursor:url(/images/coffe-cursor-static.png) 9 11," +
        "url(/images/musicrecordspin-cursor-static.png) 12 12, auto!important}" +
        "html.vc-site-cursor-ok a *,html.vc-site-cursor-ok button *," +
        "html.vc-site-cursor-ok [role=button] *,html.vc-site-cursor-ok .vc-snav-item *," +
        "html.vc-site-cursor-ok summary *{cursor:inherit!important}}";
      try {
        var img = new Image();
        img.src = "/images/musicrecordspin-cursor-static.png";
        var img2 = new Image();
        img2.src = "/images/coffe-cursor-static.png";
      } catch (eImg) {}
      /* legalUnfreeze1: NO remount style su body (style recalc = hang) */
    }
  } catch (eCur) {}
 (function ensureSiteHelperScripts() {
 try {
 /* assetBloatKill1: bare+stamped = stesso stem (no 2ª request) */
 function vcCanonAssetFile(name) {
  var f = String(name || "").split("/").pop().replace(/\?.*$/, "");
  return f.replace(/\.\d{8}[A-Za-z0-9_-]+(?=\.(?:css|js)$)/i, "");
 }
 function findScriptByCanon(canonFile) {
  var want = vcCanonAssetFile(canonFile);
  if (!want) return null;
  try {
   var nodes = document.querySelectorAll("script[src]");
   for (var i = 0; i < nodes.length; i++) {
    var src = String(nodes[i].getAttribute("src") || "");
    if (!src) continue;
    if (vcCanonAssetFile(src) === want) return nodes[i];
   }
  } catch (eFind) {}
  return null;
 }
 function findLinkByCanon(canonFile) {
  var want = vcCanonAssetFile(canonFile);
  if (!want) return null;
  try {
   var nodes = document.querySelectorAll("link[href]");
   for (var i = 0; i < nodes.length; i++) {
    var href = String(nodes[i].getAttribute("href") || "");
    if (!href) continue;
    if (vcCanonAssetFile(href) === want) return nodes[i];
   }
  } catch (eFindL) {}
  return null;
 }
 function scrubLazyScriptPlaceholders(canonFile) {
  var want = vcCanonAssetFile(canonFile);
  if (!want) return;
  try {
   var nodes = document.querySelectorAll('script[type="text/plain"][data-vc-lazy]');
   for (var i = 0; i < nodes.length; i++) {
    var el = nodes[i];
    var ds = String(el.getAttribute("data-src") || el.getAttribute("data-vc-src") || "");
    if (!ds || vcCanonAssetFile(ds) !== want) continue;
    try {
     if (el.parentNode) el.parentNode.removeChild(el);
    } catch (eRm) {}
   }
  } catch (eScrub) {}
 }
 function appendScript(path, forceVer) {
 var file = vcCanonAssetFile(path);
 /* footerBreath404Fix1: niente remap JS→CSS qui (breath finiva in /js/*.css = 404).
    Remap CSS solo in appendStylesheet. */
 if (!file) return;
 path = String(path || "").split("?")[0];
 /* assetBloatKill1: path bare (strip stamp) così ?v= resta la cache key */
 try {
  var bareDir = path.replace(/\/[^/]+$/, "/");
  path = bareDir + file;
 } catch (eBare) {}
 var authEl =
  document.querySelector('script[src*="discord-auth.js"]') ||
  document.querySelector('script[src*="vc-auth-inject.js"]');
 var ver = null;
 try {
 var m = authEl && authEl.getAttribute("src") && authEl.getAttribute("src").match(/[?&]v=([^&]+)/);
 ver =
  forceVer ||
  (m && m[1]) ||
  (window.__VC_ASSET_VERS && window.__VC_ASSET_VERS.PERF_VER) ||
  String(Date.now());
 } catch (eVer) {
 ver = forceVer || String(Date.now());
 }
 var src = path + "?v=" + ver;
 var isStorageStem = /^vc-storage(\.|$)/i.test(file);
 var isIdbStem = /^vc-idb(\.|$)/i.test(file);
 var forceReplace =
 forceVer &&
 (file === "vc-nav-badges.js" ||
  file === "vc-chrome-sync.js" ||
  isStorageStem ||
  isIdbStem);
 try {
  scrubLazyScriptPlaceholders(file);
 } catch (eScrubJs) {}
 if (forceReplace) {
 try {
 var staleSel = isStorageStem
  ? 'script[src*="vc-storage"]'
  : isIdbStem
    ? 'script[src*="vc-idb"]'
    : 'script[src*="' + file.replace(/\.js$/i, "") + '"]';
 var stale = document.querySelectorAll(staleSel);
 var si;
 for (si = 0; si < stale.length; si += 1) {
 var curStale = String(stale[si].getAttribute("src") || "");
 if (vcCanonAssetFile(curStale) !== file) continue;
 if (curStale.indexOf("?v=" + ver) !== -1 || curStale.indexOf("&v=" + ver) !== -1 || hrefHasVer(curStale, ver)) {
 continue;
 }
 if (stale[si].parentNode) stale[si].parentNode.removeChild(stale[si]);
 }
 } catch (eRmAll) {}
 }
 var existing = findScriptByCanon(file);
 if (existing) {
 try {
 var cur = String(existing.getAttribute("src") || "");
 if (cur === src || hrefHasVer(cur, ver)) return;
 if (forceReplace && existing.parentNode) {
 existing.parentNode.removeChild(existing);
 } else {
 /* assetBloatKill1: stem già caricato → no 2ª GET (anche se ver diversa) */
 return;
 }
 } catch (eUp) {
 return;
 }
 }
 var s = document.createElement("script");
 s.src = src;
 if (file === "vc-dialog.js") s.setAttribute("data-vc-dialog", "1");
 if (file === "vc-image-lightbox.js") s.setAttribute("data-vc-img-lightbox", "1");
 if (
  file === "vc-view-as.js" ||
  isStorageStem ||
  isIdbStem ||
  /vc-emoji-color/i.test(file) ||
  /vc-emoji-render/i.test(file)
 ) {
  s.async = false;
 } else s.defer = true;
 (document.head || document.documentElement).appendChild(s);
 }
 function ensureI18nScripts() {
 try {
 /* langLoopKill1: non reiniettare se c'… gi… vc-i18n (anche .VER.js) */
 var nodes = document.querySelectorAll('script[src*="vc-i18n"]');
 for (var si = 0; si < nodes.length; si++) {
 var src = String(nodes[si].getAttribute("src") || nodes[si].src || "");
 if (!src) continue;
 if (/vc-i18n-pages|vc-i18n-locales|vc-i18n-pages-extra/i.test(src)) continue;
 if (/vc-i18n(?:\.[^/?#]+)?\.js/i.test(src)) return;
 }
 try {
 if (window.VcI18n && window.VcI18n.__vcVer) return;
 } catch (eVer) {}
 var need =
 document.getElementById("vc-lang-toggle") ||
 document.getElementById("vc-lang-dropdown") ||
 document.querySelector("[data-i18n],[data-i18n-html],[data-i18n-title],[data-i18n-attr]");
 if (!need) return;
 appendScript("/js/vc-i18n.js", I18N_VER);
 appendScript("/js/vc-i18n-pages.js", I18N_VER);
 } catch (eI18nEnsure) {}
 }
 function scheduleEnsureI18nScripts() {
 try {
 ensureI18nScripts();
 if (document.readyState === "loading") {
 document.addEventListener("DOMContentLoaded", ensureI18nScripts, { once: true });
 }
 } catch (eI18nSched) {}
 }
 function hrefHasVer(href, ver) { if (!href || !ver) return false; var h = String(href); var v = String(ver); return h.indexOf("?v=" + v) !== -1 || h.indexOf("&v=" + v) !== -1 || h.indexOf("." + v + ".css") !== -1 || h.indexOf("." + v + ".js") !== -1;}
 function appendStylesheet(path, forceVer) {
 var file = vcCanonAssetFile(path);
 /* notifScopeSwitchHidden1: stamp -> canonical (niente 2o link look-core/ext) */
 if (/^vc-look-core(\.|$)/.test(file)) file = "vc-look-core.css";
 else if (/^vc-look-lite(\.|$)/.test(file)) file = "vc-look-lite.css";
 else if (/^vc-soft-fx(\.|$)/.test(file)) file = "vc-soft-fx.css";
 else if (/^vc-landing-ext(\.|$)/.test(file)) file = "vc-landing-ext.css";
 else if (/^vc-theme-light(\.|$)/.test(file)) file = "vc-theme-light.css";
 else if (/^vc-glow-form(\.|$)/.test(file)) file = "vc-glow-form.css";
 else if (/^vc-nav-menu-solid(\.|$)/.test(file)) file = "vc-nav-menu-solid.css";
 else if (/^vc-site-chrome-ui(\.|$)/.test(file)) file = "vc-site-chrome-ui.css";
 else if (/^vc-nav-chrome-fix(\.|$)/.test(file)) file = "vc-nav-chrome-fix.css";
 else if (/^vc-site-chrome-kit(\.|$)/.test(file)) file = "vc-site-chrome-kit.css";
 else if (/^vc-chrome-polish(\.|$)/.test(file)) file = "vc-chrome-polish.css";
 else if (/^vc-shell(\.|$)/.test(file)) file = "vc-shell.css";
 if (!file) return;
 path = String(path || "").split("?")[0];
 try {
  var bareCssDir = path.replace(/\/[^/]+$/, "/");
  path = bareCssDir + file;
 } catch (eBareCss) {}
 var existingById = null;
 try {
 if (file === "vc-site-chrome-ui.css") existingById = document.getElementById("vc-site-chrome-ui-css");
 else if (file === "vc-shell.css") existingById = document.getElementById("vc-shell-css");
 else if (file === "vc-look-core.css") existingById = document.getElementById("vc-look-core-css");
 else if (file === "vc-look-lite.css") existingById = document.getElementById("vc-look-lite-css");
 else if (file === "vc-soft-fx.css") existingById = document.getElementById("vc-soft-fx-css");
 else if (file === "vc-nav-chrome-fix.css") existingById = document.getElementById("vc-nav-chrome-fix-css");
 else if (file === "vc-site-chrome-kit.css") existingById = document.getElementById("vc-site-chrome-kit-css");
 else if (file === "vc-glow-form.css") existingById = document.getElementById("vc-glow-form-css");
 else if (file === "vc-nav-menu-solid.css") existingById = document.getElementById("vc-nav-menu-solid-css");
 else if (file === "vc-chrome-polish.css") existingById = document.getElementById("vc-chrome-polish-css");
 else if (file === "vc-theme-switch.css") existingById = document.getElementById("vc-theme-switch-css");
 else if (file === "vc-chrome-pill-footer-fix.css") existingById = document.getElementById("vc-chrome-pill-footer-fix-css");
 else if (file === "vc-emoji-color.css") existingById = document.getElementById("vc-emoji-color-css");
 else if (file === "vc-fonts.css") existingById = document.getElementById("vc-fonts-css");
 } catch (eId) {
 existingById = null;
 }
 /* assetBloatKill1: match bare ↔ stamped (href*="file.css" missava .VER.css) */
 var existing = existingById || findLinkByCanon(file);
 /* siparioCssWait2b: stamp vc-soft-fx.VER.css NON matcha href*="vc-soft-fx.css" */
 if (!existing) {
  try {
   if (file === "vc-soft-fx.css") {
    existing = document.querySelector('link[href*="vc-soft-fx"]');
   } else if (file === "vc-look-core.css") {
    existing = document.querySelector('link[href*="vc-look-core"]');
   } else if (file === "vc-look-lite.css") {
    existing = document.querySelector('link[href*="vc-look-lite"]');
   } else if (file === "vc-shell.css") {
    existing = document.querySelector('link[href*="vc-shell"]');
   }
  } catch (eFindStamp) {}
 }
 var ver = null;
 try {
 var existingAuth = document.querySelector('script[src*="discord-auth.js"]');
 var m = existingAuth && existingAuth.getAttribute("src") && existingAuth.getAttribute("src").match(/[?&]v=([^&]+)/);
 ver = forceVer || (m && m[1]) || String(Date.now());
 } catch (eVer) {
 ver = forceVer || String(Date.now());
 }
 var href = path + "?v=" + ver;
 var stableChrome =
 file === "vc-look-core.css" ||
 file === "vc-look-lite.css" ||
 file === "vc-soft-fx.css" ||
 file === "vc-shell.css" ||
 file === "vc-glow-fix.css" ||
 file === "vc-nav-menu-solid.css" ||
 file === "vc-site-chrome-ui.css" ||
 file === "vc-nav-chrome-fix.css" ||
 file === "vc-site-chrome-kit.css" ||
 file === "vc-chrome-polish.css";
 if (existing && stableChrome) {
 try {
 /* fase2Defer1: look/soft restano media=print fino a post-curtain */
 var fase2Hold =
  existing.getAttribute("data-vc-fase2-defer") === "1" ||
  (window.__vcFase2ScopedDefer &&
   (file === "vc-look-core.css" || file === "vc-look-lite.css" || file === "vc-soft-fx.css"));
 if (!fase2Hold) {
  existing.media = "all";
  existing.removeAttribute("onload");
 }
 if (file === "vc-look-core.css" && !existing.id) existing.id = "vc-look-core-css";
 if (file === "vc-look-lite.css" && !existing.id) existing.id = "vc-look-lite-css";
 if (file === "vc-soft-fx.css" && !existing.id) existing.id = "vc-soft-fx-css";
 if (file === "vc-shell.css" && !existing.id) existing.id = "vc-shell-css";
 if (file === "vc-glow-fix.css" && !existing.id) existing.id = "vc-glow-fix-css";
 if (file === "vc-nav-menu-solid.css" && !existing.id) existing.id = "vc-nav-menu-solid-css";
 if (file === "vc-site-chrome-ui.css" && !existing.id) existing.id = "vc-site-chrome-ui-css";
 if (file === "vc-nav-chrome-fix.css" && !existing.id) existing.id = "vc-nav-chrome-fix-css";
 if (file === "vc-site-chrome-kit.css" && !existing.id) existing.id = "vc-site-chrome-kit-css";
 var curStable = String(existing.getAttribute("href") || "");
 var verMismatch = forceVer && !hrefHasVer(curStable, forceVer);
 /* assetContract1 / legalPilot1: HTML dichiara stamp — no remap core chrome sheets */
 try {
  if (
   verMismatch &&
   typeof pathIsPilotFamily === "function" &&
   pathIsPilotFamily() &&
   (file === "vc-look-core.css" ||
    file === "vc-look-lite.css" ||
    file === "vc-soft-fx.css" ||
    file === "vc-shell.css" ||
    file === "vc-site-chrome.css" ||
    file === "vc-site-boot-kit.css" ||
    file === "vc-nav-chrome-fix.css" ||
    file === "vc-site-chrome-kit.css")
  ) {
   /* homeAcctMetal1c: soft-fx mismatch = upgrade anche in pilot (no leave heroDeckMatch1) */
   if (file === "vc-soft-fx.css" && verMismatch) {
    try {
     existing.setAttribute("href", href);
     existing.media = "all";
     if (!existing.id) existing.id = "vc-soft-fx-css";
    } catch (eSoftPilotUp) {}
   }
   if (file === "vc-soft-fx.css") {
    try {
     markSoftFxReady(existing);
    } catch (eMkP) {}
   }
   return existing;
  }
 } catch (ePilotSkip) {}
 /* bootCssStable1: look-core/soft-fx ~1MB … href swap a caldo = FOUC "CSS che si prepara".
    Se lo sheet … gi… parsato, apri sipario e rinvia upgrade a idle. */
 if (verMismatch) {
 var bootPaint =
  file === "vc-look-core.css" ||
  file === "vc-look-lite.css" ||
  file === "vc-soft-fx.css";
 /* siparioCssWait2: MAI markSoftFxReady su stamp stale (softKeep = FOUC CSS grezzo).
    Upgrade href subito; ready solo al load del canone. */
 if (bootPaint) {
  try {
   var bootDone = false;
   function finishBootPaint() {
    if (bootDone) return;
    try {
     if (!hrefHasVer(String(existing.getAttribute("href") || ""), forceVer || ver)) {
      return;
     }
     if (!softFxSheetReady(existing)) return;
     bootDone = true;
     existing.setAttribute("data-vc-sheet-loaded", "1");
     if (file === "vc-soft-fx.css") {
      window.__vcSoftFxHrefLocked = true;
      markSoftFxReady(existing);
     } else {
      var softWaitBoot =
       document.getElementById("vc-soft-fx-css") ||
       document.querySelector('link[href*="vc-soft-fx"]');
      if (softWaitBoot) markSoftFxReady(softWaitBoot);
     }
    } catch (eBootLd) {}
   }
   existing.setAttribute("href", href);
   existing.media = "all";
   existing.addEventListener("load", finishBootPaint, { once: true });
   existing.addEventListener("error", finishBootPaint, { once: true });
   /* cache hit sync: load può arrivare PRIMA del listener */
   window.setTimeout(finishBootPaint, 0);
   window.setTimeout(finishBootPaint, 60);
   window.setTimeout(finishBootPaint, 200);
   window.setTimeout(finishBootPaint, 600);
   window.setTimeout(finishBootPaint, 1400);
  } catch (eBootUp) {}
 } else {
 var bigPaint = file === "vc-chrome-polish.css";
 var sheetOkNow = false;
 try {
  sheetOkNow = softFxSheetReady(existing);
 } catch (eSheetOk) {
  sheetOkNow = false;
 }
 if (bigPaint && sheetOkNow) {
  try {
   existing.setAttribute("data-vc-sheet-loaded", "1");
  } catch (eMarkLoaded) {}
  try {
   window.setTimeout(function () {
    try {
     /* loadBgContinue1: anche in BG aggiorna sheet (prima saltava e restava soft-fx stale) */
     var curIdle = String(existing.getAttribute("href") || "");
     if (forceVer && hrefHasVer(curIdle, forceVer)) return;
     existing.setAttribute("href", href);
    } catch (eIdleUp) {}
   }, 5000);
  } catch (eSchedIdle) {}
 } else {
 if (file === "vc-soft-fx.css") {
 /* pwaCpuNuke4: MAI togliere vc-soft-fx-ready su upgrade */
 window.__vcSoftFxHrefLocked = true;
 try {
 existing.addEventListener(
 "load",
 function () {
 try {
 existing.setAttribute("data-vc-sheet-loaded", "1");
 markSoftFxReady(existing);
 } catch (eLdUp) {}
 },
 { once: true }
 );
 } catch (eLdBind) {}
 }
 /* chromeCss404Fix3: upgrade chrome-ui stamp → se 404 torna al bare */
 if (file === "vc-site-chrome-ui.css") {
  try {
   existing.addEventListener(
    "error",
    function () {
     try {
      existing.setAttribute(
        "href",
        "/css/vc-site-chrome-ui.css?v=" + String(forceVer || ver || "1"),
      );
     } catch (eChFb) {}
    },
    { once: true },
   );
  } catch (eChBind) {}
 }
 /* gateLookCoreFix1: se look-core baked non … ancora pronto, aspetta QUELLO …
    non swap immediato verso uno stamp che pu… 404are. */
 if (file === "vc-look-core.css") {
  try {
   existing.addEventListener(
    "load",
    function () {
     try {
      existing.setAttribute("data-vc-sheet-loaded", "1");
      var softWait =
       document.getElementById("vc-soft-fx-css") ||
       document.querySelector('link[href*="vc-soft-fx"]');
      if (softWait) markSoftFxReady(softWait);
     } catch (eLkWait) {}
    },
    { once: true }
   );
   existing.addEventListener(
    "error",
    function () {
     try {
      /* fallback al css non-stampato se lo stamp baked fallisce */
      existing.setAttribute("href", "/css/vc-look-core.css?v=" + String(forceVer || ver || "1"));
      existing.setAttribute("data-vc-sheet-loaded", "1");
     } catch (eLkErr) {}
    },
    { once: true }
   );
  } catch (eLkBind) {}
  return;
 }
 existing.setAttribute("href", href);
 }
 }
 }
 } catch (eStable) {}
 return;
 }
 if (existing) {
 try {
 var curHref = String(existing.getAttribute("href") || "");
 /* assetBloatKill1: stem già in pagina → no remap bare↔stamp (2ª GET) */
 if (
  curHref === href ||
  hrefHasVer(curHref, ver) ||
  vcCanonAssetFile(curHref) === file
 ) {
  try {
   if (file === "vc-fonts.css" && !existing.id) existing.id = "vc-fonts-css";
   if (file === "vc-theme-switch.css" && !existing.id) existing.id = "vc-theme-switch-css";
   if (file === "vc-emoji-color.css" && !existing.id) existing.id = "vc-emoji-color-css";
   if (file === "vc-chrome-pill-footer-fix.css" && !existing.id)
    existing.id = "vc-chrome-pill-footer-fix-css";
  } catch (eIdSet) {}
  return;
 }
 existing.setAttribute("href", href);
 return;
 } catch (eUp) {}
 }
 var link = document.createElement("link");
 link.rel = "stylesheet";
 link.href = href;
 if (file === "vc-image-lightbox.css") link.id = "vc-image-lightbox-css";
 if (file === "vc-shell.css") link.id = "vc-shell-css";
if (file === "vc-site-chrome-ui.css") link.id = "vc-site-chrome-ui-css";
 /* chromeUi404Fix1: fallback bare se stamp 404 */
 try {
  if (/\bvc-site-chrome-ui\./i.test(String(path || ""))) {
   link.addEventListener("error", function () {
    try {
     link.setAttribute("href", "/css/vc-site-chrome-ui.css?v=" + String(forceVer || ver || "1"));
    } catch (eFb) {}
   }, { once: true });
  }
 } catch (eBind404) {}
 if (file === "vc-look-core.css") link.id = "vc-look-core-css";
 if (file === "vc-look-lite.css") link.id = "vc-look-lite-css";
 if (file === "vc-soft-fx.css") link.id = "vc-soft-fx-css";
 if (file === "vc-glow-fix.css") link.id = "vc-glow-fix-css";
 if (file === "vc-nav-menu-solid.css") link.id = "vc-nav-menu-solid-css";
 if (file === "vc-nav-chrome-fix.css") link.id = "vc-nav-chrome-fix-css";
 if (
 file === "vc-look-core.css" ||
 file === "vc-soft-fx.css" ||
 file === "vc-shell.css" ||
 file === "vc-glow-form.css" ||
 file === "vc-nav-menu-solid.css" ||
 file === "vc-site-chrome-ui.css" ||
 file === "vc-nav-chrome-fix.css"
 ) {
 link.media = "all";
 }
 /* lookCoreBake1: look-core PRIMA di soft-fx (niente flash flat?gradient) */
 if (file === "vc-look-core.css") {
 try {
 var softAnchor =
 document.getElementById("vc-soft-fx-css") ||
 document.querySelector('link[href*="vc-soft-fx"]');
 if (softAnchor && softAnchor.parentNode) {
 softAnchor.parentNode.insertBefore(link, softAnchor);
 return;
 }
 } catch (eInsLook) {}
 }
 (document.head || document.documentElement).appendChild(link);
 }
 function softFxSheetReady(link) {
 if (!link) return false;
 try {
  /* siparioCssGate1: stamp stale in HTML â‰  ready (altrimenti curtain su pre-soft) */
  var href = String(link.getAttribute("href") || link.href || "");
  var wantSoft =
   typeof SOFT_FX_VER !== "undefined" && SOFT_FX_VER
    ? String(SOFT_FX_VER)
    : "";
  var wantLook =
   typeof LOOK_CORE_VER !== "undefined" && LOOK_CORE_VER
    ? String(LOOK_CORE_VER)
    : "";
  if (/vc-soft-fx/i.test(href) && wantSoft && href.indexOf(wantSoft) === -1) {
   try {
    var nSoft =
      (link.sheet && link.sheet.cssRules && link.sheet.cssRules.length) ||
      (link.sheet && link.sheet.rules && link.sheet.rules.length) ||
      0;
    if (nSoft > 0) return true;
   } catch (eSoftLive) {}
   return false;
  }
  if (/vc-look-lite/i.test(href)) {
   var wantLite =
    typeof LOOK_LITE_VER !== "undefined" && LOOK_LITE_VER
     ? String(LOOK_LITE_VER)
     : "";
   if (wantLite && href.indexOf(wantLite) === -1) {
    if (/\bvc-look-lite\.\d/i.test(href) || /look-lite\.\d{8}/i.test(href)) {
     return false;
    }
   }
  } else   if (/vc-look-core/i.test(href) && wantLook && href.indexOf(wantLook) === -1) {
   /* legalBootFast1: stamp HTML stale ma sheet già vivo = ok (no gate flop mid-boot) */
   try {
    var nLook =
      (link.sheet && link.sheet.cssRules && link.sheet.cssRules.length) ||
      (link.sheet && link.sheet.rules && link.sheet.rules.length) ||
      0;
    if (nLook > 0) return true;
   } catch (eLookLive) {}
   /* siparioCssWait2: anche bare look-core.css?v=stale â‰  ready (softKeep FOUC) */
   return false;
  }
  if (/page-bundle|vc-page-bundle/i.test(href)) {
   var wantPb =
    typeof PAGE_BUNDLE_HREF !== "undefined" ? String(PAGE_BUNDLE_HREF) : "";
   if (wantPb && wantPb.indexOf("42b8a4f2b84e") >= 0 && href.indexOf("42b8a4f2b84e") === -1) {
    return false;
   }
  }
 var n =
 (link.sheet && link.sheet.cssRules && link.sheet.cssRules.length) ||
 (link.sheet && link.sheet.rules && link.sheet.rules.length) ||
 0;
 if (n > 0) return true;
 } catch (eSh) {
 if (link.getAttribute("data-vc-sheet-loaded") === "1") return true;
 }
 return false;
 }
 try {
  window.__vcSoftFxSheetReady = softFxSheetReady;
 } catch (eExposeReady) {}
 function pageBundleLink() {
  try {
   /* splitBundle1: site-chrome soddisfa il gate (mega-bundle scrubbato) */
   return (
    document.getElementById("vc-site-chrome-css") ||
    document.querySelector('link[href*="vc-site-chrome"]') ||
    document.getElementById("vc-page-bundle-css") ||
    document.querySelector('link[href*="page-bundle"],link[href*="vc-page-bundle"]') ||
    null
   );
  } catch (ePbL) {
   return null;
  }
 }
 function pageBundleSheetReady() {
  var link = pageBundleLink();
  /* lookLite1 / fase1 scoped: senza mega-bundle il gate non deve restare chiuso */
  if (!link) {
   try {
    if (pageHasScopedPageCss()) return true;
   } catch (eScPb) {}
   return false;
  }
  return softFxSheetReady(link);
 }
 function ensureSiteChromeLazyCss() {
  /* chromeLazy1: notif/sheet CSS fuori dal chrome critico — post-curtain (look nav/footer invariato)
   * siteOptAll2: anche soft-fx-ready + pointer su campana (sheet ready prima dell'open) */
  try {
   var lazyVer =
     typeof SITE_CHROME_LAZY_VER !== "undefined" && SITE_CHROME_LAZY_VER
       ? SITE_CHROME_LAZY_VER
       : typeof SITE_CHROME_VER !== "undefined"
         ? SITE_CHROME_VER
         : "20261021siparioBorderPin1";
   function injectLazy() {
     try {
       var wantHref =
         "/css/vc-site-chrome-lazy." + lazyVer + ".css?v=" + lazyVer;
       var existing =
         document.getElementById("vc-site-chrome-lazy-css") ||
         document.querySelector('link[href*="vc-site-chrome-lazy"]');
       if (existing) {
         try {
           existing.id = existing.id || "vc-site-chrome-lazy-css";
           if (String(existing.getAttribute("href") || "").indexOf(lazyVer) === -1) {
             existing.setAttribute("href", wantHref);
             existing.setAttribute("data-vc", "siparioBorderPin1");
           }
         } catch (eUpL) {}
         return;
       }
       var lk = document.createElement("link");
       lk.rel = "stylesheet";
       lk.id = "vc-site-chrome-lazy-css";
       lk.media = "all";
       lk.href = wantHref;
       lk.setAttribute("data-vc", "siparioBorderPin1");
       lk.addEventListener(
         "error",
         function () {
           try {
             lk.setAttribute("href", "/css/vc-site-chrome-lazy.css?v=" + lazyVer);
           } catch (eFbL) {}
         },
         { once: true },
       );
       (document.head || document.documentElement).appendChild(lk);
     } catch (eInjL) {}
   }
   if (
     document.documentElement.classList.contains("vc-cine-curtain-off") ||
     document.documentElement.classList.contains("vc-soft-fx-ready")
   ) {
     injectLazy();
   } else {
     document.addEventListener("vc:cine-curtain-off", injectLazy, { once: true });
     document.addEventListener("vc:soft-fx-ready", injectLazy, { once: true });
     window.setTimeout(injectLazy, 4500);
   }
   try {
     document.addEventListener(
       "pointerdown",
       function vcLazyOnBell(ev) {
         try {
           var t = ev && ev.target;
           if (
             t &&
             t.closest &&
             t.closest(
               "#vc-notif-dropdown, .vc-notif-summary, summary.vc-notif-summary, #vc-notif-interrupt",
             )
           ) {
             injectLazy();
           }
         } catch (eBell) {}
       },
       true,
     );
   } catch (ePtr) {}
  } catch (eLazy) {}
 }
 function ensureSiteChromeCss() {
  /* assetContract1: append-only se manca; HTML dichiara stamp (no pin remap).
   * splitBundle1: scrub mega-bundle; misc se no page scoped */
  try {
   scrubCssLinksByHrefRe(/page-bundle|vc-page-bundle|vc-look-lite|vc-legal-chrome/i);
   try {
    var dead = document.getElementById("vc-page-bundle-css");
    if (dead && dead.parentNode) dead.parentNode.removeChild(dead);
   } catch (eRmPb) {}
   var wantChrome =
    "/css/vc-site-chrome." + SITE_CHROME_VER + ".css?v=" + SITE_CHROME_VER;
   var sc =
    document.getElementById("vc-site-chrome-css") ||
    document.querySelector(
      'link[href*="vc-site-chrome"]:not([href*="chrome-ui"]):not([href*="chrome-kit"]):not([href*="chrome-lazy"])',
    );
   if (!sc) {
    sc = document.createElement("link");
    sc.rel = "stylesheet";
    sc.id = "vc-site-chrome-css";
    sc.media = "all";
    sc.href = wantChrome;
    sc.setAttribute("data-vc", "assetContract1");
    sc.addEventListener(
      "error",
      function () {
       try {
        sc.setAttribute("href", "/css/vc-site-chrome.css?v=" + SITE_CHROME_VER);
       } catch (eFb) {}
      },
      { once: true },
    );
    (document.head || document.documentElement).appendChild(sc);
   } else {
    try {
     if (!sc.id) sc.id = "vc-site-chrome-css";
     var cur = String(sc.getAttribute("href") || "");
     /* passivo: solo se href vuoto */
     if (!cur) {
      sc.setAttribute("href", wantChrome);
      sc.setAttribute("data-vc", "assetContract1");
     }
    } catch (ePinChrome) {}
   }
   try {
    ensureSiteChromeLazyCss();
   } catch (eLazyCh) {}
   /* siteOptAll2: page-misc post-curtain (non critico first paint; look page scoped resta) */
   if (!pageHasScopedPageCss()) {
    function injectPageMisc() {
     try {
      if (
       document.getElementById("vc-page-misc-css") ||
       document.querySelector('link[href*="vc-page-misc"]')
      ) {
       return;
      }
      var misc = document.createElement("link");
      misc.rel = "stylesheet";
      misc.id = "vc-page-misc-css";
      misc.href =
       "/css/vc-page-misc." + PAGE_MISC_VER + ".css?v=" + PAGE_MISC_VER;
      misc.media = "all";
      misc.setAttribute("data-vc", "20261021siteOptAll2");
      misc.addEventListener(
       "error",
       function () {
        try {
         misc.setAttribute("href", "/css/vc-page-misc.css?v=" + PAGE_MISC_VER);
        } catch (eFbM) {}
       },
       { once: true },
      );
      (document.head || document.documentElement).appendChild(misc);
     } catch (eMisc) {}
    }
    if (document.documentElement.classList.contains("vc-cine-curtain-off")) {
     injectPageMisc();
    } else {
     document.addEventListener("vc:cine-curtain-off", injectPageMisc, { once: true });
     window.setTimeout(injectPageMisc, 5000);
    }
   }
  } catch (eSc) {}
 }
 function lookCoreLink() {
 try {
 /* lookLite1: lite soddisfa il gate look su legal */
 return (
 document.getElementById("vc-look-lite-css") ||
 document.querySelector('link[href*="vc-look-lite"]') ||
 document.getElementById("vc-look-core-css") ||
 document.querySelector('link[href*="vc-look-core"]') ||
 null
 );
 } catch (eLk) {
 return null;
 }
 }
 function lookCoreSheetReady() {
 var link = lookCoreLink();
 /* lookCoreGate1: se look-core/lite non … ancora in DOM, soft-fx NON pu… aprire il sipario */
 if (!link) return false;
 return softFxSheetReady(link);
 }
 function landingExtLink() {
 try {
 return (
 document.getElementById("vc-landing-ext-css") ||
 document.querySelector('link[href*="vc-landing-ext"]') ||
 null
 );
 } catch (eExt) {
 return null;
 }
 }
 function landingExtSheetReady() {
 var link = landingExtLink();
 if (!link) return true;
 try {
 var med = String(link.media || "all").toLowerCase();
 if (med && med !== "all" && med.indexOf("all") === -1) return false;
 } catch (eMed) {}
 return softFxSheetReady(link);
 }
 /* siparioNoYoyo1: aspetta SOLO CSS gi… in <head> (soft/look/landing).
    MAI togliere ready dopo l…apertura (era flash + sipario su/gi…).
    NON attendere theme/chrome injectati dopo … non sono in DOM al primo gate. */
 function bootCssLinkCandidates() {
 var out = [];
 try {
 out.push(lookCoreLink());
 out.push(document.querySelector('link[href*="vc-soft-fx"]'));
 out.push(pageBundleLink());
 out.push(landingExtLink());
 out.push(document.querySelector('link[href*="vc-landing-core"]'));
 out.push(document.querySelector('link[href*="tw-build"]'));
 } catch (eCand) {}
 return out;
 }
 function bindSheetGate(link, softLink) {
 if (!link || link.__vcCssGateBound) return;
 link.__vcCssGateBound = 1;
 function onSheet() {
 try {
 link.setAttribute("data-vc-sheet-loaded", "1");
 /* fase2Defer1: non promuovere look/soft a media=all qui — lo fa post-curtain-lazy */
 if (link.getAttribute("data-vc-fase2-defer") === "1") {
  markSoftFxReady(softLink || link);
  return;
 }
 if (link.media && link.media !== "all") link.media = "all";
 markSoftFxReady(softLink || link);
 } catch (eOn) {}
 }
 link.addEventListener("load", onSheet, { once: true });
 link.addEventListener("error", onSheet, { once: true });
 }
 function allBootCssReady(softLink) {
 if (!softFxSheetReady(softLink)) return false;
 if (!lookCoreSheetReady()) return false;
 /* siparioCssGate1: page-bundle obbligatorio (senza → CSS grezzo al lift) */
 if (!pageBundleSheetReady()) return false;
 if (!landingExtSheetReady()) return false;
 var links = bootCssLinkCandidates();
 for (var i = 0; i < links.length; i += 1) {
 var lk = links[i];
 if (!lk) continue;
 if (!softFxSheetReady(lk)) return false;
 }
 return true;
 }
 function markSoftFxReady(link) {
 try {
 /* siparioCssWait2: soft-fx-ready da flashKill/fake â‰  skip sheet check */
 try {
  if (
   document.documentElement.classList.contains("vc-soft-fx-ready") &&
   !window.__vcSiparioCssGateHold &&
   allBootCssReady(link)
  ) {
   return true;
  }
 } catch (eAlready) {}
 if (!softFxSheetReady(link)) return false;
 if (!allBootCssReady(link)) {
 try {
 var cands = bootCssLinkCandidates();
 for (var bi = 0; bi < cands.length; bi += 1) bindSheetGate(cands[bi], link);
 window.setTimeout(function () {
 try {
 markSoftFxReady(link);
 } catch (eRetry) {}
 }, 60);
 window.setTimeout(function () {
 try {
 markSoftFxReady(link);
 } catch (eRetry2) {}
 }, 240);
 window.setTimeout(function () {
 try {
 markSoftFxReady(link);
 } catch (eRetry3) {}
 }, 700);
 } catch (eBindLook) {}
 return false;
 }
 var alreadyReady = false;
 try {
 alreadyReady = document.documentElement.classList.contains("vc-soft-fx-ready");
 } catch (eAr) {}
 document.documentElement.classList.add(
 "vc-look-core-ready",
 "vc-soft-fx-ready",
 "vc-theme-light-ready",
 "vc-core-styles-ready",
 "vc-home-styles-ready",
 "vc-styles-ready"
 );
 /* bootOneShot2: CSS ready ≠ aprire pagina — aspetta chrome loadDone (un solo release) */
 try {
  window.__vcSoftFxCssReadyAt = Date.now();
  if (!window.__vcBootOneShotLiftArmed) {
   window.__vcBootOneShotLiftArmed = 1;
   (function liftAfterChromeOnce() {
    try {
     var rootLift = document.documentElement;
     function barStillOn() {
      var still =
       window.__vcLoadBarCompleting ||
       !window.__vcLoadBarFullPainted ||
       window.__vcChromeScrollArmed !== true ||
       rootLift.classList.contains("vc-chrome-bar-loading");
      try {
       var progLift = document.getElementById("vc-site-progress");
       if (progLift && progLift.classList.contains("is-loading")) still = true;
      } catch (eProgLift) {}
      return still;
     }
     /* siparioAlignAll2: anche se curtain già off (profile/flashKill), tieni lock+bar */
     if (rootLift.classList.contains("vc-cine-curtain-off") && rootLift.classList.contains("vc-page-cine-ready")) {
      if (barStillOn()) {
       rootLift.classList.add("vc-loading-scroll-lock", "vc-chrome-bar-loading");
      }
      return;
     }
     var chromeDone = window.__vcChromeLoadDone === true;
     var t0 = Number(window.__vcCineBootStartedAt || window.__vcSoftFxCssReadyAt || 0) || 0;
     var ageLift = t0 ? Date.now() - t0 : 0;
     /* siparioCssGate1: no curtain se soft/look/bundle non pronti (anche age/chrome) */
     try {
      if (window.__vcSiparioCssGateHold && typeof window.__vcReclaimSiparioCssGate === "function") {
       if (!window.__vcReclaimSiparioCssGate()) {
        window.setTimeout(liftAfterChromeOnce, 120);
        return;
       }
      }
     } catch (eHoldLift) {}
     /* siparioBarSync1: curtain-off â‰  kill barra/scroll — toast+lock restano finché bar 100% + armed */
     if (chromeDone || ageLift >= 6500) {
      rootLift.classList.add("vc-cine-curtain-off", "vc-page-cine-ready");
      rootLift.classList.remove("vc-page-cine-boot", "vc-interaction-hold");
      if (barStillOn()) {
       rootLift.classList.add("vc-loading-scroll-lock", "vc-chrome-bar-loading");
      } else if (chromeDone && window.__vcChromeScrollArmed === true) {
       rootLift.classList.remove(
        "vc-chrome-bar-loading",
        "vc-loading-scroll-lock",
        "vc-loader-blocking-live"
       );
      }
      return;
     }
     window.setTimeout(liftAfterChromeOnce, 40);
    } catch (eLiftOnce) {}
   })();
  }
  /* siparioAlignAll2: watcher — FlashKill/profile non devono lasciare scroll libero mid-bar */
  try {
   if (!window.__vcSiparioAlignLockWatch) {
    window.__vcSiparioAlignLockWatch = 1;
    var alignN = 0;
    var alignIv = window.setInterval(function () {
     alignN += 1;
     try {
      if (alignN > 80) {
       window.clearInterval(alignIv);
       return;
      }
      var r = document.documentElement;
      if (!r || !r.classList.contains("vc-cine-curtain-off")) return;
      if (window.__vcChromeScrollArmed === true && window.__vcLoadBarFullPainted && !window.__vcLoadBarCompleting) {
       window.clearInterval(alignIv);
       return;
      }
      if (
       window.__vcLoadBarCompleting ||
       !window.__vcLoadBarFullPainted ||
       window.__vcChromeScrollArmed !== true
      ) {
       r.classList.add("vc-loading-scroll-lock", "vc-chrome-bar-loading");
      }
     } catch (eAlign) {}
    }, 250); /* fase3Cpu1 */
   }
  } catch (eAlignArm) {}
 } catch (eArmLift) {}
 /* lightPerf1: pin light solo al primo ready (evita loop head?pin?head) */
 if (!alreadyReady) {
 try {
 if (window.__vcTheme && typeof window.__vcTheme.pinLast === "function") {
 window.__vcTheme.pinLast();
 } else {
 document.dispatchEvent(new CustomEvent("vc:soft-fx-ready"));
 }
 } catch (ePinLight) {}
 }
 try {
 pinNavChromeFixLast(typeof NAV_CHROME_FIX_VER !== "undefined" ? NAV_CHROME_FIX_VER : null);
 } catch (ePinChrome) {}
 return true;
 } catch (eMk) {
 return false;
 }
 }

 function pinSiteChromeKitLast(ver) {
 try {
  var v = ver || (typeof SITE_CHROME_KIT_VER !== "undefined" ? SITE_CHROME_KIT_VER : "20261017pendingBadgePos2");
  /* pendingBadgePos2: kit badge angolo — no chromeGap1/Pos1 stale (sempre canon) */
  if (/siteChromeKit5|userMqFgRun|chromeGap1|siparioPipBadge1|pendingBadgeFix3|siparioAlignAll2|siparioBarSync|pendingBadgePos1/i.test(String(v || ""))) {
    v = "20261017pendingBadgePos2";
  }
  try {
    /* force: qualunque href kit non-Pos2 → Pos2 (HTML/kit.js stale chromeGap1) */
    if (!/pendingBadgePos2/i.test(String(v || ""))) v = "20261017pendingBadgePos2";
  } catch (eForceKit) {}
  try {
   if (document.body && !document.body.id) document.body.id = "top";
   if (document.body && document.body.classList && !document.body.classList.contains("vc-body")) {
    document.body.classList.add("vc-body");
   }
  } catch (eTop) {}
  try {
   if (!window.__vcShellCssInjected && !document.getElementById("vc-shell-css")) {
   var wantCss = "/css/vc-site-chrome-kit." + String(v) + ".css?v=" + String(v);
   var kitCss = document.getElementById("vc-site-chrome-kit-css");
   if (!kitCss) kitCss = document.querySelector('link[href*="vc-site-chrome-kit"]');
   if (!kitCss) {
    appendStylesheet("/css/vc-site-chrome-kit." + String(v) + ".css", v);
    kitCss = document.getElementById("vc-site-chrome-kit-css") || document.querySelector('link[href*="vc-site-chrome-kit"]');
   }
   if (kitCss) {
    kitCss.id = "vc-site-chrome-kit-css";
    kitCss.media = "all";
    var curCss = String(kitCss.getAttribute("href") || "");
    var passKit = false;
    try {
     passKit = typeof pathIsPilotFamily === "function" && pathIsPilotFamily() && !!curCss;
    } catch (eKitP) {}
    if (!passKit && (curCss.indexOf(String(v)) < 0 || curCss.indexOf(wantCss) < 0)) {
     kitCss.setAttribute("href", wantCss);
    }
    if (kitCss.parentNode) kitCss.parentNode.appendChild(kitCss);
   }
   } else {
    scrubShellPartDuplicates();
   }
  } catch (eCss) {}
  try {
   var wantJs = "/js/vc-site-chrome-kit." + String(v) + ".js?v=" + String(v);
   var kitJs = document.querySelector('script[src*="vc-site-chrome-kit"]');
   if (!kitJs) {
    appendScript("/js/vc-site-chrome-kit." + String(v) + ".js", v);
   } else {
    var curJs = String(kitJs.getAttribute("src") || "");
    if (curJs.indexOf(String(v)) < 0) {
     kitJs.setAttribute("src", wantJs);
    }
   }
  } catch (eJs) {
   try { appendScript("/js/vc-site-chrome-kit.js", v); } catch (eJs2) {}
  }
  try {
   if (window.VcSiteChromeKit && typeof window.VcSiteChromeKit.apply === "function") {
    window.VcSiteChromeKit.apply();
   }
  } catch (eApply) {}
 } catch (eKit) {}
 }
 function pinNavChromeFixLast(ver) {
 try {
 var fixVer = ver || (typeof NAV_CHROME_FIX_VER !== "undefined" ? NAV_CHROME_FIX_VER : null);
 try {
  /* pendingBadgePos2: mai pin stamp saputo-404 */
  if (/siparioBarSync1|pendingBadgeFix3|siparioAlignAll2|pendingBadgePos1/i.test(String(fixVer || ""))) fixVer = "20261017pendingBadgePos2";
 } catch (eFixVer) {}
 if (window.__vcShellCssInjected || document.getElementById("vc-shell-css")) {
  try { pinSiteChromeKitLast(typeof SITE_CHROME_KIT_VER !== "undefined" ? SITE_CHROME_KIT_VER : fixVer); } catch (eKitOnly) {}
  return;
 }
 var fix = document.getElementById("vc-nav-chrome-fix-css");
 if (!fix) fix = findLinkByCanon("vc-nav-chrome-fix.css");
 if (!fix) fix = document.querySelector('link[href*="vc-nav-chrome-fix"]');
 if (!fix) {
 /* assetBloatKill1b: inject stampato subito (no bare→stamp = 2 GET) */
 appendHomeLateStylesheet(
  "/css/vc-nav-chrome-fix." + String(fixVer || "1") + ".css",
  fixVer,
  "vc-nav-chrome-fix-css"
 );
 fix =
  document.getElementById("vc-nav-chrome-fix-css") ||
  findLinkByCanon("vc-nav-chrome-fix.css") ||
  document.querySelector('link[href*="vc-nav-chrome-fix"]');
 }
 if (!fix || !fix.parentNode) return;
 fix.id = "vc-nav-chrome-fix-css";
 try {
  if (!(typeof vcPathIsHome === "function" && vcPathIsHome())) fix.media = "all";
 } catch (eNavMed) {
  fix.media = "all";
 }
 if (fixVer) {
 var cur = String(fix.getAttribute("href") || "");
 /* assetBloatKill1b: stem già caricato → no remap bare↔stamp */
 if (vcCanonAssetFile(cur) === "vc-nav-chrome-fix.css") {
  /* keep */
 } else {
 var want = "/css/vc-nav-chrome-fix." + String(fixVer) + ".css?v=" + String(fixVer);
 if (cur.indexOf(want) < 0) fix.setAttribute("href", want);
 }
 /* pendingBadgePos1: se stamp 404 → bare + unique bust (no year-long CF key) */
 try {
  fix.onerror = function () {
   try {
    fix.onerror = null;
    fix.setAttribute("href", "/css/vc-nav-chrome-fix.css?v=" + String(fixVer) + "&fb=navFooterCorner1c");
   } catch (eFb) {}
  };
 } catch (eOnErr) {}
}

 /* siteChromeKit2: CSS+JS condivisi (no style-tag inline) */
 try {
  pinSiteChromeKitLast(
    typeof SITE_CHROME_KIT_VER !== "undefined" && SITE_CHROME_KIT_VER
      ? SITE_CHROME_KIT_VER
      : "20261017pendingBadgePos2"
  );
 } catch (eKitPin) {}
 /* pendingBadgePos2: re-pin kit dopo microtask (HTML/kit.js stale chromeGap1 last-wins) */
 try {
  window.setTimeout(function () {
   try {
    pinSiteChromeKitLast("20261017pendingBadgePos2");
   } catch (eRepin) {}
  }, 0);
  window.setTimeout(function () {
   try {
    pinSiteChromeKitLast("20261017pendingBadgePos2");
   } catch (eRepin2) {}
  }, 400);
 } catch (eRepinArm) {}
 /* pendingBadgePos2: style LAST — batte anche inline kit stale se ancora in race */
 try {
  var stBadge = document.getElementById("vc-pending-badge-pos2");
  if (!stBadge) {
   stBadge = document.createElement("style");
   stBadge.id = "vc-pending-badge-pos2";
   stBadge.textContent =
    "html body.vc-body #header-quick-actions #vc-notif-dropdown>summary.vc-notif-summary>#vc-notif-badge.vc-notif-badge," +
    "html.vc-soft-fx-ready.vc-site-polish body.vc-body#top #header-quick-actions #vc-notif-dropdown>summary.vc-notif-summary>#vc-notif-badge.vc-notif-badge," +
    "html body.vc-body header .vc-notif-summary>#vc-notif-badge.vc-notif-badge{" +
    "position:absolute!important;inset:auto!important;top:-0.22rem!important;right:-0.22rem!important;" +
    "left:auto!important;bottom:auto!important;transform:none!important;-webkit-transform:none!important;" +
    "margin:0!important;z-index:50!important}";
   (document.head || document.documentElement).appendChild(stBadge);
  } else if (stBadge.parentNode) {
   stBadge.parentNode.appendChild(stBadge);
  }
 } catch (eBadgeSt) {}
 /* pillarHeroFirstPaint1: batte aside-inline ul{flex-direction:column!important} (tutte le cine) */
 try {
 var stPillar = document.getElementById("vc-pillar-hero-firstpaint1");
 if (!stPillar) {
 stPillar = document.createElement("style");
 stPillar.id = "vc-pillar-hero-firstpaint1";
 stPillar.setAttribute("data-vc", "pillarHeroFirstPaint1");
 stPillar.textContent =
 "html.vc-site-polish body.vc-page-cine-layout .vc-page-cine-hero .vc-page-cine-aside-inline ul.vc-support-hero-pillar-list," +
 "html.vc-site-polish body.vc-page-cine-layout .vc-hero-head .vc-page-cine-aside-inline ul.vc-support-hero-pillar-list," +
 "html.vc-site-polish body.vc-page-cine-layout.vc-donazioni-page .vc-page-cine-hero .vc-page-cine-aside-inline ul.vc-support-hero-pillar-list," +
 "html.vc-site-polish body.vc-page-cine-layout.vc-perks-page .vc-page-cine-hero .vc-page-cine-aside-inline ul.vc-support-hero-pillar-list," +
 "html.vc-site-polish body.vc-page-cine-layout.vc-donazioni-page .vc-hero-head .vc-page-cine-aside-inline ul.vc-support-hero-pillar-list," +
 "html.vc-site-polish body.vc-page-cine-layout.vc-perks-page .vc-hero-head .vc-page-cine-aside-inline ul.vc-support-hero-pillar-list{" +
 "display:flex!important;flex-direction:row!important;flex-wrap:wrap!important;" +
 "align-content:flex-start!important;align-items:stretch!important;" +
 "height:auto!important;max-height:none!important;min-height:0!important;" +
 "flex:0 0 auto!important;gap:0.55rem!important;padding:0!important;margin:0!important;" +
 "}" +
 "html.vc-site-polish body.vc-page-cine-layout .vc-page-cine-hero .vc-page-cine-aside-inline li.vc-support-hero-pillar-row," +
 "html.vc-site-polish body.vc-page-cine-layout .vc-hero-head .vc-page-cine-aside-inline li.vc-support-hero-pillar-row," +
 "html.vc-site-polish body.vc-page-cine-layout.vc-donazioni-page .vc-page-cine-hero .vc-page-cine-aside-inline li.vc-support-hero-pillar-row," +
 "html.vc-site-polish body.vc-page-cine-layout.vc-perks-page .vc-page-cine-hero .vc-page-cine-aside-inline li.vc-support-hero-pillar-row," +
 "html.vc-site-polish body.vc-page-cine-layout.vc-donazioni-page .vc-hero-head .vc-page-cine-aside-inline li.vc-support-hero-pillar-row," +
 "html.vc-site-polish body.vc-page-cine-layout.vc-perks-page .vc-hero-head .vc-page-cine-aside-inline li.vc-support-hero-pillar-row{" +
 "display:flex!important;flex-direction:row!important;align-items:center!important;" +
 "flex:1 1 10.5rem!important;width:auto!important;max-width:100%!important;" +
 "height:auto!important;min-height:0!important;max-height:none!important;aspect-ratio:auto!important;" +
 "align-self:flex-start!important;border-radius:999px!important;" +
 "margin:0!important;padding:0.48rem 0.7rem!important;" +
 "}" +
 "html.vc-site-polish body.vc-page-cine-layout .vc-page-cine-aside-inline:has(.vc-support-hero-pillar-list)," +
 "html.vc-site-polish body.vc-page-cine-layout .vc-support-hero-pillars," +
 "html.vc-site-polish body.vc-page-cine-layout .vc-support-hero-pillars__panel," +
 "html.vc-site-polish body.vc-page-cine-layout.vc-donazioni-page .vc-page-cine-aside-inline:has(.vc-support-hero-pillar-list)," +
 "html.vc-site-polish body.vc-page-cine-layout.vc-perks-page .vc-page-cine-aside-inline:has(.vc-support-hero-pillar-list)," +
 "html.vc-site-polish body.vc-page-cine-layout.vc-donazioni-page .vc-support-hero-pillars," +
 "html.vc-site-polish body.vc-page-cine-layout.vc-perks-page .vc-support-hero-pillars," +
 "html.vc-site-polish body.vc-page-cine-layout.vc-donazioni-page .vc-support-hero-pillars__panel," +
 "html.vc-site-polish body.vc-page-cine-layout.vc-perks-page .vc-support-hero-pillars__panel{" +
 "height:auto!important;max-height:none!important;min-height:0!important;flex:0 0 auto!important;" +
 "}";
 }
 (document.head || document.documentElement).appendChild(stPillar);
 } catch (ePillarCss) {}
 /* navBootTrim1: move solo se non … gi… ultimo (appendChild = style recalc full) */
 try {
 if (fix.parentNode.lastElementChild !== fix) {
 fix.parentNode.appendChild(fix);
 }
 } catch (eMove) {}
 /* navChromeFix6: riscrivi vc-nav-noflash (1px+shadow) ? 2px transparent */
 try {
 var nf = document.getElementById("vc-nav-noflash");
 if (nf && nf.textContent && nf.textContent.indexOf("border:1px solid") !== -1) {
 nf.textContent = nf.textContent
 .replace(/border:1px solid rgba\(255,255,255,\.1\)!important/g, "border:2px solid rgba(245,214,183,.38)!important")
 .replace(/box-shadow:0 4px 24px rgba\(0,0,0,\.55\),inset 0 1px 0 rgba\(255,255,255,\.06\)!important/g, "box-shadow:none!important")
 .replace(/background-image:none!important/g, "background-image:none!important");
 }
 } catch (eNf) {}
 } catch (ePinFix) {}
 } function pinSoftFxLast(ver) {
 try {
  var softPin = document.getElementById("vc-soft-fx-css");
 if (!softPin) softPin = document.querySelector('link[href*="vc-soft-fx"]');
 if (!softPin || !softPin.parentNode) return;
 softPin.id = "vc-soft-fx-css";
 softPin.media = "all";
 softPin.removeAttribute("onload");
 document.querySelectorAll('link[href*="vc-soft-fx"]').forEach(function (l) {
 if (l !== softPin && l.parentNode) l.parentNode.removeChild(l);
 });
 /* mqIdleResumeAll3: pilot/assetContract non deve bloccare upgrade stamp soft-fx */
 var verOk = true;
 if (ver) {
 var curPin = String(softPin.getAttribute("href") || "");
 /* classFlash4: mai downgrade a stamp stale (CF/discord-auth mega pin cursorFlash*) */
 try {
  var curStamp = (curPin.match(/vc-soft-fx\.([^/?"'#]+?)(?:\.css)?(?:\?|$)/i) || [])[1] || "";
  curStamp = String(curStamp || "").replace(/\.css$/i, "");
  var wantStamp = String(ver || "").replace(/\.css$/i, "");
  var stalePin =
   /cursorFlash|bootFast1|navPromoGhost/i.test(wantStamp) &&
   /classFlash/i.test(curStamp);
  if (stalePin && curStamp) {
   ver = curStamp;
   wantStamp = curStamp;
  }
  if (
   window.__vcSoftFxHrefLocked &&
   curStamp &&
   wantStamp &&
   curStamp !== wantStamp &&
   /classFlash/i.test(curStamp)
  ) {
   ver = curStamp;
  }
  ver = String(ver || "").replace(/\.css$/i, "");
 } catch (eNoDown) {}
 verOk = hrefHasVer(curPin, ver);
 var want = "/css/vc-soft-fx." + String(ver) + ".css?v=" + String(ver);
 /* wmUlTextOnly3: se ver diversa, swap SUBITO (niente lock 5s su stamp vecchio) */
 if (!verOk) {
 softPin.setAttribute("href", want);
 window.__vcSoftFxHrefLocked = true;
 softPin.addEventListener(
 "load",
 function () {
 try {
 softPin.setAttribute("data-vc-sheet-loaded", "1");
 } catch (eLd) {}
 markSoftFxReady(softPin);
 },
 { once: true }
 );
 } else {
 window.__vcSoftFxHrefLocked = true;
 if (!(softFxSheetReady(softPin) && markSoftFxReady(softPin))) {
 if (!markSoftFxReady(softPin)) {
 softPin.addEventListener(
 "load",
 function () {
 try {
 softPin.setAttribute("data-vc-sheet-loaded", "1");
 } catch (eLd2) {}
 markSoftFxReady(softPin);
 },
 { once: true }
 );
 }
 }
 }
 } else {
 /* navBootTrim1: gi… pronto ? stop (niente re-pin / load storm) */
 if (!(softFxSheetReady(softPin) && markSoftFxReady(softPin))) {
 if (!markSoftFxReady(softPin)) {
 softPin.addEventListener(
 "load",
 function () {
 try {
 softPin.setAttribute("data-vc-sheet-loaded", "1");
 } catch (eLd3) {}
 markSoftFxReady(softPin);
 },
 { once: true }
 );
 }
 }
 }
 } catch (ePin) {}
 /* pwaIdleCpu1: dopo pin soft-fx, nuke-css deve restare ULTIMO + re-arm PWA */
 try {
 if (window.VcPerf && typeof window.VcPerf.armPwaCpuNuke === "function") {
 window.VcPerf.armPwaCpuNuke();
 }
 var nukeCss = document.getElementById("vc-pwa-cpu-nuke-css");
 if (nukeCss) {
 var mountNuke = document.body || document.documentElement;
 if (mountNuke) mountNuke.appendChild(nukeCss);
 }
 try {
 if (window.VcPerf && typeof window.VcPerf.armSiteCpuSoft === "function") {
 window.VcPerf.armSiteCpuSoft();
 }
 var softCss = document.getElementById("vc-site-cpu-soft-css");
 if (softCss) {
 var mountSoft = document.body || document.documentElement;
 if (mountSoft) mountSoft.appendChild(softCss);
 }
 } catch (eSoftPin) {}
 /* fxFlatKill1: dopo soft-fx, pin flat ULTIMO (niente glow/blur/alpha CPU) */
 try {
 if (typeof window.__vcEnsureFxFlatCss === "function") {
 window.__vcEnsureFxFlatCss();
 } else if (window.VcPerf && typeof window.VcPerf.ensureFxFlatCss === "function") {
 window.VcPerf.ensureFxFlatCss();
 }
 var flatCss = document.getElementById("vc-fx-flat-css");
 if (flatCss) {
 var mountFlat = document.body || document.documentElement;
 if (mountFlat) mountFlat.appendChild(flatCss);
 }
 } catch (eFlatPin) {}
 } catch (eNukePin) {}
 try {
 pinEmojiColorLast(EMOJI_COLOR_VER);
 } catch (eEmojiPin) {}
 }
 function pinEmojiColorLast(ver) {
 try {
 var v = String(ver || EMOJI_COLOR_VER);
 var want = "/css/vc-emoji-color." + v + ".css?v=" + v;
 var link = document.getElementById("vc-emoji-color-css");
 if (!link) link = document.querySelector('link[href*="vc-emoji-color"]');
 if (!link) {
 link = document.createElement("link");
 link.rel = "stylesheet";
 link.id = "vc-emoji-color-css";
 link.href = want;
 (document.body || document.documentElement).appendChild(link);
 } else {
 link.id = "vc-emoji-color-css";
 /* assetBloatKill1b: no href remap + no move (Chrome ripete la GET) */
 }
 } catch (ePinEmoji) {}
 }
 function watchSoftFxLast() {
 try {
 if (window.__vcSoftFxPinDone) return;
 window.__vcSoftFxPinDone = 1;
 /* cpuPagesIdle1: one-shot pin sitewide (MO head = CPU storm su inject/nav/reload) */
 pinSoftFxLast(SOFT_FX_VER);
 pinNavChromeFixLast(NAV_CHROME_FIX_VER);
 /* bootFast1: no 400ms re-pin */
 try {
 if (window.__vcSoftFxPinObs) {
 window.__vcSoftFxPinObs.disconnect();
 window.__vcSoftFxPinObs = null;
 }
 } catch (eDiscOld) {}
 } catch (eObs) {}
 }
 /* bootFast1DeferNonCrit + routeGate1: solo pagine che usano drafts/dialog/lightbox */
(function deferNonCritBoot(){
 function hasSrc(stem) {
  try {
   var nodes = document.querySelectorAll("script[src], link[href]");
   for (var i = 0; i < nodes.length; i++) {
    var v = String(nodes[i].getAttribute("src") || nodes[i].getAttribute("href") || nodes[i].src || nodes[i].href || "");
    if (v.indexOf(stem) !== -1) return true;
   }
  } catch (e) {}
  return false;
 }
 function go(){
  try{ if (pathNeedsFormDrafts() && !window.VcFormDrafts && !hasSrc("vc-form-drafts")) appendScript("/js/vc-form-drafts.js", "20261003draftToast1"); }catch(e){}
  try{ if (pathNeedsDialog() && !window.VcDialog && !hasSrc("vc-dialog")) appendScript("/js/vc-dialog.js", "20261002compitiScrollUnlock2"); }catch(e){}
  try{
   if (pathNeedsLightbox()) {
    if (!hasSrc("vc-image-lightbox.css")) appendStylesheet("/css/vc-image-lightbox.css", "20260908imgLightbox2");
    if (!window.VcImageLightbox && !hasSrc("vc-image-lightbox.js")) appendScript("/js/vc-image-lightbox.js", "20260908imgLightbox2");
   }
  }catch(e){}
 }
 /* violKillIdle1: setTimeout … rIC({timeout}) ? Violation idle */
 setTimeout(go, 1200);
})();

/* bootGraph1: versions from window.__VC_ASSET_VERS (vc-asset-versions.js); fallbacks = live-identical */
function vcAssetVer(key, fallback) {
  try {
    var m = window.__VC_ASSET_VERS;
    if (m && m[key] != null && String(m[key])) return String(m[key]);
  } catch (eAv) {}
  return fallback;
}
var SOFT_FX_VER = vcAssetVer("SOFT_FX_VER", "20261021sitewideSolid1j");
  try {
    /* cpuIdleAll1b: idle décor + metal sheen kill */
    if (/sitewideSolid1j|sitewideSolid1i|sitewideSolid1h|sitewideSolid1g|sitewideSolid1f|sitewideSolid1e|sitewideSolid1d|sitewideSolid1c|sitewideSolid1b|sitewideSolid1|chromeOwnerUnify1|chromeBorderOwner1|pagePerfAll1|cpuIdleAll1b?|siparioBorderPin1b|moonKnobVis1|siparioBorderPin1/i.test(String(SOFT_FX_VER || ""))) {
      /* keep */
    } else if (/navFootSwitch1|lookStaticBorder1|siteCssCov1fix1|siteCssCov1|acctRingCpu1|cpuIdleRing1|midRiskPerf1|heroMetalStats1b|heroMetalStats1|fixAll1|mqUlUserNoSnap1|mqBarHomeAlways1|mqHoverOnlyAll1|mqVisFix1|mqNoSnapSettle1b?|tripleRegress|heroRing2px|footerRing4side|homeAcctMetal|homeHoverMq|homeLoadCpu|mqHeroMetal|heroDeckMatch1|heroMetalRing1|mqHoverGifFooter1|mqHoverOnly1|ticketsChatSpoiler1b?|ticketsGlowFilterKill1b?|gateKickerCenter1|navAvatarRing1|twitchPipVodFlashKill1|wmUlDupKill1|marquee404Fix1b?|fxFlatKill1[bcdefghijklmn]?|ticketsLagHard1|phoneBarBlurKill[12]|mqIdlePause1|userMqFgRun|mqCpuIdle|mqFgIdleFix1|notifSheetBtn[12]|toastAutoWidth1|cursorLagFix[12]|backTopSheetHide1|tipLinkDup1|mqIdleResumeAll(?:[12]|3[bc]?|3d)\b/i.test(String(SOFT_FX_VER || ""))) {
      SOFT_FX_VER = "20261021sitewideSolid1j";
    }
  } catch (eSoftMq) {}
  try {
    forceCanonSoftLookHref();
  } catch (eForceSoftReady) {}
var STICKY_CHROME_VER = vcAssetVer("STICKY_CHROME_VER", "20261016legalTocKill1");
var NAV_USER_NOFLASH_VER = vcAssetVer("NAV_USER_NOFLASH_VER", "20261010navUserNoFlash1");
 /* gateLookCoreFix1: cueTextSettle2 stamp mai pubblicato ? 404 ? sipario eterno */
 /* notifScopeSwitchHidden1: look-core con :not([hidden]) su Personali|Inbox switcher */
 var LOOK_CORE_VER = vcAssetVer("LOOK_CORE_VER", "20261021sitewideSolid1j");
 try {
  if (/sitewideSolid1j|sitewideSolid1i|sitewideSolid1h|sitewideSolid1g|sitewideSolid1f|sitewideSolid1e|sitewideSolid1d|sitewideSolid1c|sitewideSolid1b|sitewideSolid1|chromeOwnerUnify1|chromeBorderOwner1|acctSolidBorder1|moonKnobVis1/i.test(String(LOOK_CORE_VER || ""))) {
   /* keep */
  } else if (/navFootSwitch1|lookStaticBorder1|siteCssCov1fix1|siteCssCov1|dialogCssAll1|ticketsHeroCopy1|heroMetalStats1b|heroMetalStats1|fixAll1|mqUlUserNoSnap1|mqBarHomeAlways1|mqHoverOnlyAll1|tripleRegress|heroRing2px|footerRing4side|mqHeroMetal|mqHoverGifFooter1|mqHoverOnly1|wmUlDupKill1|fxFlatKill1[ghijklmn]?|mqIdleResumeAll3b|mqIdleResumeAll[123]|compitiSwitchNoDip1\b/i.test(String(LOOK_CORE_VER || ""))) {
   LOOK_CORE_VER = "20261021sitewideSolid1j";
  }
 } catch (eLookFx) {}
 var LEGAL_CHROME_VER = vcAssetVer("LEGAL_CHROME_VER", "20261018legalChromeImport1");
 try {
   if (
     window.__VC_ASSET_VERS &&
     window.__VC_ASSET_VERS["vc-legal-chrome.css"]
   ) {
     LEGAL_CHROME_VER = String(window.__VC_ASSET_VERS["vc-legal-chrome.css"]);
   }
 } catch (eLegCh) {}
 try {
   /* legalRestorePreCrit1: forza Import1 (no LayoutSlice/Fix experiment) */
   if (/legalLayoutSlice|legalChromeFix1\b/i.test(String(LEGAL_CHROME_VER || ""))) {
     LEGAL_CHROME_VER = "20261018legalChromeImport1";
   }
 } catch (eLegCh2) {}
  try {
    /* acctSolidBorder1: look-core account caret + bordo nav/footer */
    if (/acctSolidBorder1|moonKnobVis1/i.test(String(LOOK_CORE_VER || ""))) {
      /* keep */
    } else if (/navFootSwitch1|lookStaticBorder1|siteCssCov1fix1|siteCssCov1|dialogCssAll1|ticketsHeroCopy1|heroMetalStats1b|heroMetalStats1|fixAll1|mqUlUserNoSnap1|mqBarHomeAlways1|mqHoverOnlyAll1|tripleRegress|heroRing2px|footerRing4side|mqHeroMetal|mqHoverGifFooter1|mqHoverOnly1|wmUlDupKill1|fxFlatKill1[ghijklmn]?|chromeLookFix1|phoneBarBlurKill[12]|pendingBadgePos|logoSizeLock1|candBadgeKeep1|settleLite[123]|compitiSwitchNoDip1|legalBundleGaps1|tipLinkDup1|ticketsGateHero1|notifSheetLock[234]|mqIdleResumeAll(?:[123]|3b)\b/i.test(String(LOOK_CORE_VER || ""))) {
      LOOK_CORE_VER = "20261021sitewideSolid1j";
    }
  } catch (eLookFix) {}
 var LOOK_LITE_VER = vcAssetVer("LOOK_LITE_VER", "20261018tipLinkDup1");
  try {
    /* lookLite: AV/CDN stale lookLite1/2/3c → forza canon con exclude blacklist */
    if (/lookLite[123]c?\b|legalBundleGaps1/i.test(String(LOOK_LITE_VER || ""))) {
      LOOK_LITE_VER = "20261018tipLinkDup1";
    }
  } catch (eLiteFix) {}
var EMOJI_COLOR_VER = vcAssetVer("EMOJI_COLOR_VER", "20261011inputLagKill1");
var EMOJI_RENDER_VER = vcAssetVer("EMOJI_RENDER_VER", "20261019wmEmojiFree2");
  try {
    if (/^20261019wmEmojiFree2$/.test(String(EMOJI_RENDER_VER || ""))) {
      /* keep */
    } else if (/bugListBoot1|inputLagKill1|emojiNo404|wmMqEmoji|legalPerfPack1/i.test(String(EMOJI_RENDER_VER || ""))) {
      EMOJI_RENDER_VER = "20261019wmEmojiFree2";
    }
  } catch (eEmRen) {}
/* chromeUiOauthFix1: NON riusare stamp OAuth/logout come filename … file assente = 404 chrome UI */
/* userMqStampFix1: default = userMqFgRun5 (marquee nome), non bootToastUnstick1 */
var NAV_CHROME_VER = vcAssetVer("NAV_CHROME_VER", "20261019mqHoverGifFooter1");
  /* mqHoverGifFooter1: chrome-ui wordmark hover CSS (+ prior backTopPcLate1) */
  try {
    if (/^20261019mqHoverGifFooter1$/.test(String(NAV_CHROME_VER || ""))) {
      /* keep */
    } else if (/backTopPcLate1|wmUlDupKill1|marquee404Fix1|hoverToastAnim1b?|mqResetIdle1|cpuStormKill1b?|cpuHoverIdle1b?\b|toastHoldAll1|serataHangKill1|pendingBadgeVis2|mqIdleWmUser1|chromeUiIdle[23]|chromeArmStuck1|siparioBarSync1|pendingBadgeFix3|siparioAlignAll2|pendingBadgePos[12]|refreshNoFooterJump1|bootToastUnstick1|pageHang1|preBootRevert1|homeChromeAlign5|brandLogoStill1|phoneBarBlurKill[12]|bootMidAvatar1|cursorLagFix[12]|cursorGlowOff1|legalPerfPack1|legalUtilsRestore|legalCritical|cursorBackSip|legalUnfreeze|legalLookCore|legalLayoutSlice|legalBootFouc[12]|legalRestorePreCrit1|legalPilot1|ticketsPilot1|ticketsRestore[123]|cleanStack1|bundleBack1|viewAsGateClear1b?\b|mqIdleResumeAll[123]\b|mqIdleResumeAll3b\b|userMqIdlePause1\b|metalBorderSocial1\b/i.test(String(NAV_CHROME_VER || ""))) {
      NAV_CHROME_VER = "20261019mqHoverGifFooter1";
    }
  } catch (eNavFix) {}
var BOOT_KIT_VER = vcAssetVer("BOOT_KIT_VER", "20261021siparioBorderPin1");
  try {
  if (/siparioBorderPin1/i.test(String(BOOT_KIT_VER || ""))) {
    /* keep */
  } else if (/phoneTopGhostKill1|notifSheetLock|moonKnobVis1|navFootSwitch/i.test(String(BOOT_KIT_VER || ""))) {
    BOOT_KIT_VER = "20261021siparioBorderPin1";
  }
} catch (eBootKitVer) {}
/* navFix404All1: FIX = vc-nav-chrome-fix.* — brandLogoStill1 NON esiste (404 ovunque).
   Canon live = pendingBadgePos2. Non remap-are pendingBadgePos → brandLogoStill1. */
/* hamDesktopHide2: fix (not form) pins last; uniform1 forced ham visible on PC */
var NAV_CHROME_FIX_VER = vcAssetVer("NAV_CHROME_FIX_VER", "20261021lookStaticBorder1");
  try {
    /* footerConicKill1: no conic ring — keep lookStatic; kill footerRing4side / old pins */
    if (/lookStaticBorder1|footerConicKill1/i.test(String(NAV_CHROME_FIX_VER || ""))) {
      /* keep */
    } else if (/footerRing4side|mqHoverGifFooter1|navFooterCorner|fixAll1|mqUlUserNoSnap1|wmUlDupKill1|marquee404Fix1|hoverToastAnim1b?|mqResetIdle1|cpuStormKill1b?|cpuHoverIdle1b?\b|brandLogoStill1|siparioBarSync1|chromeArmStuck1|chromeUiIdle[23]|pendingBadgeFix3|siparioAlignAll2|refreshNoFooterJump1|logoSizeLock1|pendingBadgePos2|mqFgIdleFix1|notifSheetBtn2|hamDesktopHide[12]/i.test(String(NAV_CHROME_FIX_VER || ""))) {
      NAV_CHROME_FIX_VER = "20261021lookStaticBorder1";
    }
  } catch (eFixAlign) {}
var VC_CHROME_VER = vcAssetVer("VC_CHROME_VER", "20261019hoverToastAnim1");
  try {
    if (/hoverToastAnim1|bootNoJumpNav1|feedbackLayout1/i.test(String(VC_CHROME_VER || ""))) {
      VC_CHROME_VER = "20261019hoverToastAnim1";
    }
  } catch (eVcChrome) {}
var TW_BUILD_VER = vcAssetVer("TW_BUILD_VER", "20260913pageAlign1");
/* splitBundle1: site-chrome al posto del mega page-bundle */
var SITE_CHROME_VER = vcAssetVer("SITE_CHROME_VER", "20261021sitewideSolid1j");
  try {
  /* chromeBorderOwner1: site-chrome account menu + caret solid */
  if (/sitewideSolid1j|sitewideSolid1i|sitewideSolid1h|sitewideSolid1g|sitewideSolid1f|sitewideSolid1e|sitewideSolid1d|sitewideSolid1c|sitewideSolid1b|sitewideSolid1|chromeOwnerUnify1|chromeBorderOwner1|acctSolidBorder1|moonKnobVis1/i.test(String(SITE_CHROME_VER || ""))) {
    /* keep */
  } else {
    SITE_CHROME_VER = "20261021sitewideSolid1j";
  }
} catch (eSiteChromeVer) {}
var SITE_CHROME_LAZY_VER = vcAssetVer("SITE_CHROME_LAZY_VER", "20261021sitewideSolid1j");
try {
  /* chromeBorderOwner1: lazy = last-wins solid pin */
  if (/sitewideSolid1j|sitewideSolid1i|sitewideSolid1h|sitewideSolid1g|sitewideSolid1f|sitewideSolid1e|sitewideSolid1d|sitewideSolid1c|sitewideSolid1b|sitewideSolid1|chromeOwnerUnify1|chromeBorderOwner1|lookStaticBorder1e|siparioBorderPin1|cpuIdleAll1b?/i.test(String(SITE_CHROME_LAZY_VER || ""))) {
    /* keep */
  } else if (/lookStaticBorder1[cd]|chromeLazy1|lookStaticBorder1\b/i.test(String(SITE_CHROME_LAZY_VER || ""))) {
    SITE_CHROME_LAZY_VER = "20261021sitewideSolid1j";
  }
} catch (eSiteChromeLazyVer) {}
var GLOW_FORM_VER = vcAssetVer("GLOW_FORM_VER", "20261021navFootSwitch1c");
try {
  /* moonKnobVis1: glow-form bordo footer */
  if (/moonKnobVis1/i.test(String(GLOW_FORM_VER || ""))) {
    /* keep */
  } else if (/ticketsGateHero1|notifSheetLock2|lookStaticBorder1/i.test(String(GLOW_FORM_VER || ""))) {
    GLOW_FORM_VER = "20261021siparioBorderPin1";
  }
} catch (eGlowFormVer) {}
/* assetContract1 marker — passive stack sitewide */
var ASSET_CONTRACT_VER = "20261019assetContract1";
var PAGE_MISC_VER = vcAssetVer("PAGE_MISC_VER", "20261019splitBundle1");
/* legacy — solo scrub/upgrade link stale */
var PAGE_BUNDLE_HREF =
  "/css/pages/vc-page-bundle.42b8a4f2b84e.css?v=20261017ticketsCssFix1";
function pageHasScopedPageCss() {
  try {
    if (
      document.getElementById("vc-page-legal-css") ||
      document.getElementById("vc-page-cine-public-css") ||
      document.getElementById("vc-page-tickets-css") ||
      document.getElementById("vc-page-bacheca-css") ||
      document.getElementById("vc-page-staff-css") ||
      document.getElementById("vc-page-dashboard-css") ||
      document.getElementById("vc-page-home-css") ||
      document.getElementById("vc-page-misc-css") ||
      document.getElementById("vc-page-profile-css") ||
      document.getElementById("vc-seratafilm-page-css")
    ) {
      return true;
    }
    return Boolean(
      document.querySelector(
        'link[href*="vc-page-legal"],link[href*="vc-page-cine-public"],link[href*="vc-page-tickets"],link[href*="vc-page-bacheca"],link[href*="vc-page-staff"],link[href*="vc-page-dashboard"],link[href*="vc-page-home"],link[href*="vc-page-misc"],link[href*="vc-page-profile"],link[href*="seratafilm-page"]',
      ),
    );
  } catch (eScoped) {
    return false;
  }
}
function pathIsUserProfileFamily() {
  try {
    var p = String(location.pathname || "/")
      .replace(/\/index\.html$/i, "")
      .replace(/\/+$/, "") || "/";
    if (/^\/users?\/\d{17,20}$/i.test(p)) return true;
    if (p === "/user" || p === "/users") {
      try {
        var q = new URLSearchParams(location.search || "");
        var id = String(q.get("id") || q.get("userId") || q.get("uid") || "").trim();
        if (/^\d{17,20}$/.test(id)) return true;
      } catch (eQ) {}
    }
    return (
      !!document.getElementById("vc-page-profile-css") ||
      !!document.querySelector('link[href*="vc-page-profile"]') ||
      !!(document.documentElement && document.documentElement.classList.contains("vc-user-profile-route")) ||
      !!(document.body && document.body.classList && document.body.classList.contains("vc-user-profile-page"))
    );
  } catch (eProf) {
    return false;
  }
}
/* cssCleanShell1: un solo CSS chrome sitewide (merge meccanico) */
var SHELL_VER = vcAssetVer("SHELL_VER", "20261021sitewideSolid1j");
  try {
    /* chromeBorderOwner1: shell caret/account solid */
    if (/sitewideSolid1j|sitewideSolid1i|sitewideSolid1h|sitewideSolid1g|sitewideSolid1f|sitewideSolid1e|sitewideSolid1d|sitewideSolid1c|sitewideSolid1b|sitewideSolid1|chromeOwnerUnify1|chromeBorderOwner1|moonKnobVis1/i.test(String(SHELL_VER || ""))) {
      /* keep */
    } else if (/mqHoverGifFooter1|mqHoverOnly1|gateKickerCenter1|navAvatarRing1|fxFlatKill1n|notifSheetLock[234]|cssCleanShell1|legalBootFouc|tipLinkDup|cursorLagFix|lookStaticBorder1/i.test(String(SHELL_VER || ""))) {
      SHELL_VER = "20261021sitewideSolid1j";
    }
  } catch (eShellFix) {}
function scrubCssLinksByHrefRe(re) {
  try {
    var nodes = document.querySelectorAll('link[rel="stylesheet"]');
    for (var i = 0; i < nodes.length; i++) {
      var l = nodes[i];
      try {
        var h = String(l.getAttribute("href") || l.href || "");
        if (re.test(h) && l.parentNode) l.parentNode.removeChild(l);
      } catch (eRm) {}
    }
  } catch (eAll) {}
}
function pathIsLegalFamily() {
  try {
    var p = String(location.pathname || "/").replace(/\/+$/, "") || "/";
    return (
      p === "/privacy" ||
      p === "/terms" ||
      p === "/cookie" ||
      p === "/copyright" ||
      p === "/dati" ||
      p === "/regole" ||
      p.indexOf("/privacy/") === 0 ||
      p.indexOf("/terms/") === 0 ||
      p.indexOf("/cookie/") === 0 ||
      p.indexOf("/copyright/") === 0 ||
      p.indexOf("/dati/") === 0 ||
      p.indexOf("/regole/") === 0 ||
      !!document.getElementById("vc-page-legal-css") ||
      !!document.querySelector('link[href*="vc-page-legal"]')
    );
  } catch (eLeg) {
    return false;
  }
}
function pathIsTicketsFamily() {
  try {
    var p = String(location.pathname || "/").replace(/\/+$/, "") || "/";
    return (
      p === "/tickets" ||
      p.indexOf("/tickets/") === 0 ||
      !!document.getElementById("vc-page-tickets-css") ||
      !!document.querySelector('link[href*="vc-page-tickets"]') ||
      !!(
        document.body &&
        document.body.classList &&
        document.body.classList.contains("vc-web-tickets-page")
      )
    );
  } catch (eTk) {
    return false;
  }
}
function pathIsPilotFamily() {
  try {
    /* assetContract1: passivo su TUTTE le pagine dello stack auth */
    return true;
  } catch (ePf) {
    return false;
  }
}
function scrubPageBundleIfScoped() {
  /* legalBundleChrome1: NO-OP — scrub bundle su legal = snav/sheet/view-as morti */
  return;
}
function scrubScopedParallelCss() {
  /* cleanStack1 / bundleBack1: entity/ring/landing dual — MAI togliere page-bundle */
  try {
    if (!pageHasScopedPageCss() && !pathIsLegalFamily()) return;
    scrubCssLinksByHrefRe(
      /vc-discord-entity|vc-footer-nav-ring|vc-look-lite|vc-landing-ext|vc-landing-core|vc-wt-layout/i,
    );
  } catch (ePar) {}
}
function scrubTicketsParallelCss() {
  /* bundleBack1: no scrub page-bundle su tickets */
  try {
    if (!pathIsTicketsFamily()) return;
    scrubCssLinksByHrefRe(/vc-discord-entity|vc-wt-layout|vc-look-lite/i);
  } catch (eTkScrub) {}
}
function ensureLegalChromeImport() {
  /* splitBundle1: site-chrome + flags; no mega-bundle */
  try {
    if (!pathIsLegalFamily()) return;
    scrubCssLinksByHrefRe(/vc-legal-chrome|page-bundle|vc-page-bundle/i);
    ensureSiteChromeCss();
    try {
      pinLegalLangFlags();
    } catch (eFl) {}
  } catch (eImp) {}
}
function pinLegalLangFlags() {
  /* legalPerfPack1: uniche regole che vivevano SOLO nel mega-bundle */
  try {
    if (!pathIsLegalFamily()) return;
    var st = document.getElementById("vc-legal-lang-flags");
    if (!st) {
      st = document.createElement("style");
      st.id = "vc-legal-lang-flags";
    }
    st.setAttribute("data-vc", "legalPerfPack1");
    var FV = "20260919flagNavAll1";
    var codes = [
      "it",
      "en",
      "es",
      "fr",
      "de",
      "pt",
      "ru",
      "zh",
      "ja",
      "ko",
      "ar",
      "nl",
      "pl",
      "tr",
      "hi",
      "id",
      "uk",
      "vi",
      "ro",
      "sv",
    ];
    var css =
      ".vc-lang-flag{display:block;width:1.25rem;height:.94rem;border-radius:.18rem;" +
      "box-shadow:inset 0 0 0 1px rgba(0,0,0,.28);background-color:#1e293b;background-size:cover;" +
      "background-position:center;background-repeat:no-repeat;flex-shrink:0;overflow:hidden}";
    for (var i = 0; i < codes.length; i++) {
      css +=
        ".vc-lang-flag--" +
        codes[i] +
        '{background-image:url("/images/flags/' +
        codes[i] +
        ".png?v=" +
        FV +
        '")}';
    }
    /* view-as launch: page-legal ha regole; pin display se bundle assente */
    css +=
      "html body.vc-body header #vc-view-as-launch," +
      "html body.vc-body #header-quick-actions #vc-view-as-launch{" +
      "display:inline-flex!important;align-items:center!important;justify-content:center!important;" +
      "visibility:visible!important;opacity:1!important}" +
      "html.vc-auth-logged-out body.vc-body header #vc-view-as-launch," +
      "html.vc-view-as-guest body.vc-body header #vc-view-as-launch{" +
      "display:none!important}";
    st.textContent = css;
    var host = document.head || document.documentElement;
    try {
      if (st.parentNode) st.parentNode.removeChild(st);
    } catch (eMv) {}
    host.appendChild(st);
  } catch (eFlags) {}
}
function ensureLegalLookCore() {
  /* legalPilot1: passivo — append solo se manca; lite→core; no remap stamp */
  try {
    if (!pathIsLegalFamily()) return;
    try {
      window.__vcLegalLiteChrome = 0;
      window.__vcEmojiLegalScope = 1;
    } catch (eFl) {}
    var want =
      typeof LOOK_CORE_VER !== "undefined" && LOOK_CORE_VER
        ? String(LOOK_CORE_VER)
        : "20261018tipLinkDup1c";
    var core =
      document.getElementById("vc-look-core-css") ||
      document.querySelector('link[href*="vc-look-core"]');
    var lite =
      document.getElementById("vc-look-lite-css") ||
      document.querySelector('link[href*="vc-look-lite"]');
    if (lite && (!core || lite === core)) {
      lite.id = "vc-look-core-css";
      lite.setAttribute("data-vc", "legalPilot1");
      lite.href = "/css/vc-look-core." + want + ".css?v=" + want;
      lite.media = "all";
      return;
    }
    if (lite && core && lite !== core) {
      try {
        if (lite.parentNode) lite.parentNode.removeChild(lite);
      } catch (eRmL) {}
    }
    if (core) {
      if (!core.id) core.id = "vc-look-core-css";
      try {
        var curH = String(core.getAttribute("href") || "");
        if (curH.indexOf(want) === -1) {
          core.href = "/css/vc-look-core." + want + ".css?v=" + want;
          core.media = "all";
        }
      } catch (eUpCore) {}
      return;
    }
    var l = document.createElement("link");
    l.rel = "stylesheet";
    l.id = "vc-look-core-css";
    l.href = "/css/vc-look-core." + want + ".css?v=" + want;
    l.media = "all";
    l.setAttribute("data-vc", "legalPilot1");
    (document.head || document.documentElement).appendChild(l);
  } catch (eCore) {}
}
function ensureLegalLookLite() {
  /* alias: legalLookCore1 usa look-core */
  ensureLegalLookCore();
}
function pinLegalChromeParity() {
  try {
    if (pathIsLegalFamily()) {
      pinLegalLangFlags();
      pinLegalSvgMetal();
      try {
        injectVcShellCss();
      } catch (eSh) {}
      return;
    }
    /* metalBorderSocial1: metal social anche su tickets */
    if (pathIsTicketsFamily()) {
      pinLegalSvgMetal();
    }
  } catch (ePar) {}
}
function ensureFooterSocialMetalEarly() {
  /* legalSiparioCpu1: defs metal PRIMA di chrome-ui (senza → fill url() invisibile) */
  try {
    if (document.getElementById("vc-footer-social-metal-defs")) return;
    var ns = "http://www.w3.org/2000/svg";
    var s = document.createElementNS(ns, "svg");
    s.setAttribute("id", "vc-footer-social-metal-defs");
    s.setAttribute("aria-hidden", "true");
    s.setAttribute("focusable", "false");
    s.style.cssText =
      "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
    s.innerHTML =
      '<defs><linearGradient id="vcFooterSocialMetal" x1="0" y1="0" x2="0.18" y2="1">' +
      '<stop offset="0%" stop-color="#fffaf3"/>' +
      '<stop offset="18%" stop-color="#f4e9d8"/>' +
      '<stop offset="42%" stop-color="#d4a888"/>' +
      '<stop offset="62%" stop-color="#c4a07a"/>' +
      '<stop offset="82%" stop-color="#8b6e4d"/>' +
      '<stop offset="100%" stop-color="#6f4e37"/>' +
      "</linearGradient></defs>";
    (document.body || document.documentElement).appendChild(s);
  } catch (eMetalEarly) {}
}
function pinLegalSvgMetal() {
  /* metalBorderSocial1: metal footer social su policy + tickets (no fill su path fill=none) */
  try {
    if (!pathIsLegalFamily() && !pathIsTicketsFamily()) return;
    try {
      ensureFooterSocialMetalEarly();
    } catch (eDef) {}
    var st = document.getElementById("vc-legal-svg-metal");
    if (!st) {
      st = document.createElement("style");
      st.id = "vc-legal-svg-metal";
    }
    st.setAttribute("data-vc", "metalBorderSocial1");
    st.textContent =
        /* tipLinkDup1: kill metal on tip li:has(a) — last vs look-core light/dark */
        "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body:not(.vc-web-tickets-page) main .vc-page-cine-aside-inline li:has(a),"+
        "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body:not(.vc-web-tickets-page) main .vc-page-cine-aside-inline li:has(a.vc-palette-link),"+
        "html.vc-site-polish[data-vc-theme=\"light\"]:not(.vc-soft-fx-off) body.vc-body:not(.vc-web-tickets-page) main .vc-page-cine-aside-inline li:has(a),"+
        "html.vc-site-polish[data-vc-theme=\"dark\"]:not(.vc-soft-fx-off) body.vc-body:not(.vc-web-tickets-page) main .vc-page-cine-aside-inline li:has(a),"+
        "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body#top main .vc-page-cine-aside-inline li:has(a),"+
        "html.vc-site-polish[data-vc-theme=\"light\"]:not(.vc-soft-fx-off) body.vc-body#top main .vc-page-cine-aside-inline li:has(a),"+
        "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body main .vc-page-cine-aside-inline :is(li:has(a),li:has(a.vc-palette-link)){"+
        "background-image:none!important;background-color:transparent!important;"+
        "-webkit-background-clip:border-box!important;background-clip:border-box!important;"+
        "color:inherit!important;-webkit-text-fill-color:inherit!important;"+
        "text-shadow:none!important;filter:none!important}"+
        "html.vc-site-polish body.vc-body main a.vc-palette-link:is(:hover,:focus-visible){"+
        "transform:none!important;translate:4px 0!important;filter:none!important;"+
        "background-image:none!important;-webkit-background-clip:border-box!important;"+
        "background-clip:border-box!important;text-shadow:none!important}"+
        /* size + visibility (tickets gate hide footer a parte) */+
        "html body.vc-body footer.vc-premium-footer .vc-premium-footer__social,"+
        "html body.vc-body>footer.vc-premium-footer .vc-premium-footer__social{"+
        "width:44px!important;height:44px!important;min-width:44px!important;min-height:44px!important;"+
        "display:inline-flex!important;align-items:center!important;justify-content:center!important;"+
        "visibility:visible!important;opacity:1!important}"+
        "html body.vc-body footer.vc-premium-footer .vc-premium-footer__social svg,"+
        "html body.vc-body footer.vc-premium-footer .vc-premium-footer__social .vc-footer-tiktok-ico{"+
        "width:1.15rem!important;height:1.15rem!important;display:block!important;"+
        "visibility:visible!important;opacity:1!important;overflow:visible!important}"+
        /* metalBorderSocial1: fill SOLO se non fill=none (IG outline); stroke a parte */+
        "html body.vc-body footer.vc-premium-footer .vc-premium-footer__social :is(svg,.vc-footer-tiktok-ico) :is(path,circle,rect):not([fill=\"none\"]),"+
        "html body.vc-body>footer.vc-premium-footer .vc-premium-footer__social :is(svg,.vc-footer-tiktok-ico) :is(path,circle,rect):not([fill=\"none\"]),"+
        "html.vc-site-polish[data-vc-theme=\"light\"] body.vc-body footer.vc-premium-footer .vc-premium-footer__social :is(svg,.vc-footer-tiktok-ico) :is(path,circle,rect):not([fill=\"none\"]),"+
        "html[data-vc-theme=\"light\"] .vc-premium-footer__social :is(svg,.vc-footer-tiktok-ico) :is(path,circle,rect):not([fill=\"none\"]){"+
        "fill:url(#vcFooterSocialMetal)!important;"+
        "color:transparent!important;-webkit-text-fill-color:transparent!important;opacity:1!important;filter:none!important}"+
        "html body.vc-body footer.vc-premium-footer .vc-premium-footer__social :is(svg,.vc-footer-tiktok-ico) :is(path,circle,rect)[stroke]:not([stroke=\"none\"]),"+
        "html body.vc-body>footer.vc-premium-footer .vc-premium-footer__social :is(svg,.vc-footer-tiktok-ico) :is(path,circle,rect)[stroke]:not([stroke=\"none\"]),"+
        "html.vc-site-polish[data-vc-theme=\"light\"] body.vc-body footer.vc-premium-footer .vc-premium-footer__social :is(svg,.vc-footer-tiktok-ico) :is(path,circle,rect)[stroke]:not([stroke=\"none\"]){"+
        "stroke:url(#vcFooterSocialMetal)!important}"+
        "html body.vc-body footer.vc-premium-footer .vc-premium-footer__social :is(svg,.vc-footer-tiktok-ico) :is(path,circle,rect)[fill=\"none\"]{"+
        "fill:none!important}"+
        "html body #vc-mobile-nav-drawer,html body.vc-body #vc-mobile-nav-drawer,.vc-mobile-nav-drawer{"+
        "position:fixed!important;inset:0!important;pointer-events:none!important;visibility:hidden!important;opacity:0!important;overflow:hidden!important}"+
        "html.vc-mobile-nav-open .vc-mobile-nav-drawer.vc-mobile-nav-drawer--open,html.vc-mobile-nav-open #vc-mobile-nav-drawer.vc-mobile-nav-drawer--open{"+
        "pointer-events:auto!important;visibility:visible!important;opacity:1!important}"+
        "html.vc-site-polish[data-vc-theme=\"light\"]:not(.vc-soft-fx-off) body.vc-body#top header .discord-account-popover__item.is-blacklisted,"+
        "html.vc-site-polish[data-vc-theme=\"light\"]:not(.vc-soft-fx-off) body.vc-body#top header .discord-account-popover__item.is-blacklisted:hover,"+
        "html.vc-site-polish[data-vc-theme=\"light\"]:not(.vc-soft-fx-off) body.vc-body#top header .discord-account-popover__item.is-blacklisted:focus-visible,"+
        "html.vc-site-polish body.vc-body .discord-account-popover__item.is-blacklisted,"+
        "html.vc-site-polish body.vc-body header .discord-account-popover__item.is-blacklisted,"+
        "html.vc-site-polish[data-vc-theme=\"light\"] body.vc-body .discord-account-popover__item.is-blacklisted,"+
        "html.vc-site-polish[data-vc-theme=\"light\"] body.vc-body header .discord-account-popover__item.is-blacklisted,"+
        "html[data-vc-theme=\"light\"] body.vc-body header .discord-account-popover__item.is-blacklisted,"+
        "html body.vc-body .discord-account-popover__item.is-blacklisted,"+
        "html body.vc-body header .discord-account-popover__item.is-blacklisted,"+
        "html.vc-site-polish body.vc-body header .discord-account-popover__item.is-blacklisted:hover,"+
        "html.vc-site-polish body.vc-body header .discord-account-popover__item.is-blacklisted:focus-visible{"+
        "cursor:not-allowed!important;opacity:.72!important;"+
        "color:rgba(248,113,113,.95)!important;"+
        "-webkit-text-fill-color:rgba(248,113,113,.95)!important;"+
        "background:none!important;background-color:transparent!important;background-image:none!important;"+
        "-webkit-background-clip:border-box!important;background-clip:border-box!important;"+
        "filter:none!important;text-shadow:none!important}"+
        "html body.vc-body .discord-account-popover__item.is-soon,"+
        "html body.vc-body header .discord-account-popover__item.is-soon{"+
        "pointer-events:none!important;cursor:default!important}"+
        "html body.vc-body .discord-account-popover__soon-badge,"+
        "html body.vc-body header .discord-account-popover__soon-badge{"+
        "position:absolute!important;right:.55rem!important;top:50%!important;transform:translateY(-50%)!important;z-index:2!important}"+
        "html body.vc-body .vc-notif-push-banner{display:flex!important;align-items:flex-start!important;gap:.65rem!important}"+
        /* legalChromeGaps1: tip-card link hover no testo doppio (metal clip + ::before) */
        "html body.vc-body .vc-page-cine-aside-inline a,"+
        "html body.vc-body .vc-page-cine-aside-inline .vc-tip-row a,"+
        "html body.vc-body .vc-legal-card a,"+
        "html.vc-site-polish body.vc-body .vc-page-cine-aside-inline a{"+
        "background-image:none!important;-webkit-background-clip:border-box!important;background-clip:border-box!important;"+
        "-webkit-text-fill-color:currentColor!important;color:inherit!important;filter:none!important;text-shadow:none!important}"+
        "html body.vc-body .vc-page-cine-aside-inline a::before,"+
        "html body.vc-body .vc-page-cine-aside-inline a::after,"+
        "html body.vc-body .vc-page-cine-aside-inline .vc-tip-row a::before,"+
        "html body.vc-body .vc-page-cine-aside-inline .vc-tip-row a::after{"+
        "content:none!important;display:none!important;background:none!important}"+
        /* legalLayoutSlice1b: titolo Altre policy solido (batte look-core clip text) */+
        "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-legal-page main .vc-page-cine-aside-inline [class*=\"rounded-\"] > p,"+
        "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-legal-page#top main .vc-page-cine-aside-inline [class*=\"rounded-\"] > p,"+
        "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body.vc-legal-page main .vc-page-cine-aside-inline [class*=\"rounded-\"] > p.text-xs,"+
        "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body.vc-legal-page main .vc-page-cine-aside-inline [class*=\"rounded-\"] > p :is(span,strong,b,em),"+
        "html body.vc-legal-page main .vc-page-cine-aside-inline [class*=\"rounded-\"] > p,"+
        "html body.vc-legal-page main .vc-page-cine-aside-inline [class*=\"rounded-\"] > p :is(span,strong,b,em){"+
        "background:none!important;background-image:none!important;background-color:transparent!important;"+
        "-webkit-background-clip:border-box!important;background-clip:border-box!important;"+
        "color:rgba(232,201,168,.88)!important;-webkit-text-fill-color:rgba(232,201,168,.88)!important;"+
        "text-shadow:none!important;filter:none!important;opacity:1!important}"+
        "html body.vc-legal-page main .vc-page-cine-aside-inline [class*=\"rounded-\"] > p::before,"+
        "html body.vc-legal-page main .vc-page-cine-aside-inline [class*=\"rounded-\"] > p::after{"+
        "content:none!important;display:none!important}"+
        /* footer brand tip + keep logo visible */
        "html body.vc-body footer.vc-premium-footer a.vc-premium-footer__logo-row{"+
        "cursor:pointer!important}"+
        "html body.vc-body footer.vc-premium-footer .vc-premium-footer__logo,"+
        "html body.vc-body footer.vc-premium-footer .vc-premium-footer__logo-img{"+
        "opacity:1!important;visibility:visible!important;display:flex!important}";
    var host = document.body || document.head || document.documentElement;
    try {
      if (st.parentNode) st.parentNode.removeChild(st);
    } catch (eMv) {}
    host.appendChild(st);
    try {
      armLegalFooterBrand();
    } catch (eBrand) {}
  } catch (eMetal) {}
}
function armLegalFooterBrand() {
  /* legalChromeGaps1: tip hover + GIF sul logo footer (chrome-ui forza still sitewide) */
  try {
    if (!pathIsLegalFamily() || window.__vcLegalFooterBrand1) return;
    window.__vcLegalFooterBrand1 = 1;
    var GIF = "/images/og-server-icon.gif?v=20261018legalChromeGaps1";
    var STILL = "/images/og-server-icon-still.png?v=20261018legalChromeGaps1";
    function wire() {
      var row = document.querySelector("footer.vc-premium-footer a.vc-premium-footer__logo-row");
      if (!row) return;
      if (!row.getAttribute("title")) {
        row.setAttribute("title", "Vinili & Caffè — Home");
      }
      if (!row.getAttribute("aria-label")) {
        row.setAttribute("aria-label", "Vinili & Caffè — Home");
      }
      var img =
        row.querySelector("img.vc-premium-footer__logo-img, .vc-premium-footer__logo img") ||
        null;
      if (!img || img.__vcLegalGifHover) return;
      img.__vcLegalGifHover = 1;
      img.addEventListener(
        "mouseenter",
        function () {
          try {
            img.setAttribute("src", GIF);
          } catch (e1) {}
        },
        { passive: true },
      );
      img.addEventListener(
        "mouseleave",
        function () {
          try {
            img.setAttribute("src", STILL);
          } catch (e2) {}
        },
        { passive: true },
      );
      row.addEventListener(
        "mouseenter",
        function () {
          try {
            if (img) img.setAttribute("src", GIF);
          } catch (e3) {}
        },
        { passive: true },
      );
      row.addEventListener(
        "mouseleave",
        function () {
          try {
            if (img) img.setAttribute("src", STILL);
          } catch (e4) {}
        },
        { passive: true },
      );
    }
    wire();
    [400, 1200, 3000].forEach(function (ms) {
      window.setTimeout(wire, ms);
    });
  } catch (eArmBrand) {}
}
function scrubShellPartDuplicates() {
  try {
    /* homeLookSlim1: senza shell questi pezzi SONO il chrome — non scrubbare */
    if (window.__vcHomeSkipShell) return;
    /* pezzi già dentro vc-shell — togli link separati (visual lock = stesso CSS, meno file) */
    scrubCssLinksByHrefRe(
      /vc-chrome-polish|vc-site-chrome-ui|vc-nav-menu-solid|vc-nav-chrome-fix|vc-site-chrome-kit|vc-chrome-pill-footer-fix|vc-footer-sys-status/i,
    );
    try {
      [
        "vc-site-chrome-kit-css",
        "vc-site-chrome-ui-css",
        "vc-chrome-polish-css",
        "vc-nav-chrome-fix-css",
        "vc-nav-menu-solid-css",
        "vc-chrome-pill-footer-fix-css",
        "vc-footer-sys-status-css",
      ].forEach(function (id) {
        var n = document.getElementById(id);
        if (n && n.parentNode) n.parentNode.removeChild(n);
      });
    } catch (eIdScrub) {}
  } catch (eScrubSh) {}
}
function armShellPartScrub() {
  try {
    scrubShellPartDuplicates();
    [0, 80, 250, 700, 1600, 3200].forEach(function (ms) {
      window.setTimeout(scrubShellPartDuplicates, ms);
    });
  } catch (eArmScrub) {}
}
function vcPathIsHome() {
  try {
    var p = String(location.pathname || "/").replace(/\/+$/, "") || "/";
    return p === "/" || p === "/index.html";
  } catch (eH) {
    return false;
  }
}
function ensureGlowFormCss() {
  /* homeCpuCut1: su home sotto fx-flat il metallo viene da pinFlat — glow-form solo CPU */
  try {
    if (vcPathIsHome()) {
      try {
        var gKill =
          document.getElementById("vc-glow-form-css") ||
          document.querySelector('link[href*="vc-glow-form"]');
        if (gKill && gKill.parentNode) gKill.parentNode.removeChild(gKill);
      } catch (eKillG) {}
      return;
    }
  } catch (eHomeGlow) {}
  /* glowFormSandPin2: glow-form last-wins (dopo look-core/page hairline) */
  try {
    var ver =
      typeof GLOW_FORM_VER !== "undefined" && GLOW_FORM_VER
        ? String(GLOW_FORM_VER)
        : "20261019glowFormSandPin2";
    var g =
      document.getElementById("vc-glow-form-css") ||
      document.querySelector('link[href*="vc-glow-form"]');
    if (!g) {
      appendStylesheet("/css/vc-glow-form." + ver + ".css", ver);
      g =
        document.getElementById("vc-glow-form-css") ||
        document.querySelector('link[href*="vc-glow-form"]');
    }
    if (g) {
      if (!g.id) g.id = "vc-glow-form-css";
      g.setAttribute("data-vc", "glowFormSandPin2");
      try {
        var want = "/css/vc-glow-form." + ver + ".css?v=" + ver;
        if ((g.getAttribute("href") || "").indexOf(ver) === -1) {
          g.setAttribute("href", want);
        }
      } catch (eHref) {}
      try {
        if (g.parentNode) g.parentNode.appendChild(g);
      } catch (eMove) {}
    }
  } catch (eGlow) {}
}
function injectVcShellCss() {
  try {
    /* glowFormPageStamp1: shell di nuovo su tutte le famiglie (look card/nav) */
    if (window.__vcShellCssInjected) {
      armShellPartScrub();
      return document.getElementById("vc-shell-css");
    }
    function doInject() {
      if (window.__vcShellCssInjected) {
        armShellPartScrub();
        return document.getElementById("vc-shell-css");
      }
      window.__vcShellCssInjected = 1;
      appendStylesheet("/css/vc-shell." + SHELL_VER + ".css", SHELL_VER);
      var shell =
        document.getElementById("vc-shell-css") ||
        document.querySelector('link[href*="vc-shell"]');
      if (shell && !shell.id) shell.id = "vc-shell-css";
      armShellPartScrub();
      try {
        document.documentElement.classList.add("vc-chrome-css-ready");
      } catch (eReady) {}
      return shell;
    }
    /* navFootShellHome1: home DEVE caricare vc-shell (nav metal + footer premium).
       homeLookSlim1 skippava ~700KB ma navbar/footer restavano senza CSS shell. */
    return doInject();
  } catch (eShell) {
    return null;
  }
}
function fase2ScopedDeferActive() {
  try {
    return Boolean(window.__vcFase2ScopedDefer) ||
      document.documentElement.classList.contains("vc-fase2-scoped-defer");
  } catch (eF2) {
    return false;
  }
}
/* fase2Defer1: su scoped look/soft = media=print + post-curtain; sipario apre con boot-kit+scoped */
function armFase2ScopedCssDefer() {
  try {
    /* cssDeferUnstick1: NON mettere look/soft in media=print —
       sipario apriva prima del promote → pagine cine senza CSS. */
    return false;
    if (!pageHasScopedPageCss()) return false;
    if (window.__vcFase2ScopedDefer) return true;
    window.__vcFase2ScopedDefer = 1;
    document.documentElement.classList.add("vc-fase2-scoped-defer");
    function deferOne(sel, id) {
      var nodes = document.querySelectorAll(sel);
      for (var i = 0; i < nodes.length; i++) {
        var l = nodes[i];
        try {
          if (!l.id && id) l.id = id;
          l.media = "print";
          l.setAttribute("data-vc-defer-css", "post-curtain");
          l.setAttribute("data-vc-fase2-defer", "1");
        } catch (eOne) {}
      }
    }
    deferOne('link#vc-look-core-css,link[href*="vc-look-core"]', "vc-look-core-css");
    deferOne('link#vc-soft-fx-css,link[href*="vc-soft-fx"]', "vc-soft-fx-css");
    return true;
  } catch (eArm) {
    return false;
  }
}
function appendDeferredStylesheet(path, forceVer, id) {
  try {
    var file = vcCanonAssetFile(path);
    if (/^vc-look-core(\.|$)/.test(file)) file = "vc-look-core.css";
    else if (/^vc-soft-fx(\.|$)/.test(file)) file = "vc-soft-fx.css";
    path = String(path || "").split("?")[0];
    try {
      var bareDefDir = path.replace(/\/[^/]+$/, "/");
      path = bareDefDir + file;
    } catch (eBareDef) {}
    var existing =
      (id && document.getElementById(id)) ||
      findLinkByCanon(file);
    var ver = forceVer || String(Date.now());
    var href = path + "?v=" + ver;
    if (existing) {
      try {
        if (id && !existing.id) existing.id = id;
        existing.media = "print";
        existing.setAttribute("data-vc-defer-css", "post-curtain");
        existing.setAttribute("data-vc-fase2-defer", "1");
        var cur = String(existing.getAttribute("href") || "");
        if (forceVer && cur.indexOf(forceVer) === -1) existing.setAttribute("href", href);
      } catch (eEx) {}
      return existing;
    }
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.media = "print";
    link.setAttribute("data-vc-defer-css", "post-curtain");
    link.setAttribute("data-vc-fase2-defer", "1");
    if (id) link.id = id;
    (document.head || document.documentElement).appendChild(link);
    return link;
  } catch (eDef) {
    return null;
  }
}
/* homeBootFast1: CSS secondari home = print+post-curtain (no parse sul sipario) */
/* assetPageFilter1: secondari post-curtain OVUNQUE (sipario copre → no FOUC look) */
function appendHomeLateStylesheet(path, forceVer, id) {
  try {
    return appendDeferredStylesheet(path, forceVer, id);
  } catch (eLate) {
    try {
      return appendStylesheet(path, forceVer);
    } catch (eFb) {
      return null;
    }
  }
}
/* fase2JsLazy1: sync head non-critici → post-curtain su scoped */
function fase2LazyNonCriticalHeadScripts() {
  try {
    if (!fase2ScopedDeferActive() && !pageHasScopedPageCss()) return;
    var re = /vc-source-guard\.js|vc-pwa-resume-boot|vc-image-lightbox|vc-auth-pending|vc-nav-badges\.js/i;
    var scripts = document.querySelectorAll("head script[src], body > script[src]");
    for (var i = 0; i < scripts.length; i++) {
      var s = scripts[i];
      try {
        if (s.type && s.type !== "text/javascript" && s.type !== "module" && s.type !== "") continue;
        if (s.getAttribute("data-vc-lazy") === "post-curtain") continue;
        var src = String(s.getAttribute("src") || "");
        if (!re.test(src)) continue;
        if (/vc-view-state-boot|vc-access-gate|vc-access-pending-boot|discord-auth|vc-auth-inject|vc-asset-versions|vc-perf|vc-home-cine|vc-i18n|vc-post-curtain/i.test(src)) continue;
        var plain = document.createElement("script");
        plain.type = "text/plain";
        plain.setAttribute("data-vc-lazy", "post-curtain");
        plain.setAttribute("data-src", src);
        plain.setAttribute("data-vc", "fase2JsLazy1");
        if (s.parentNode) s.parentNode.insertBefore(plain, s);
        if (s.parentNode) s.parentNode.removeChild(s);
      } catch (eS) {}
    }
  } catch (eLazy) {}
}
function stripPageBundleLinks() {
  try {
    document
      .querySelectorAll(
        'link#vc-page-bundle-css,link[href*="page-bundle"],link[href*="vc-page-bundle"]',
      )
      .forEach(function (l) {
        try {
          if (l.parentNode) l.parentNode.removeChild(l);
        } catch (eRm) {}
      });
  } catch (eStripPb) {}
}
function preferLightTheme() {
  try {
    var p = String(localStorage.getItem("vc-theme-pref") || "auto").toLowerCase();
    if (p === "light") return true;
    if (p === "dark") return false;
    return Boolean(
      window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches,
    );
  } catch (eTh) {
    return false;
  }
}
function ensureThemeLightOnlyIfLight() {
  /* fase1KitMin1: theme-light SOLO se tema light — in dark rimuovi link/preload */
  try {
    var light = preferLightTheme();
    var links = document.querySelectorAll(
      'link#vc-theme-light-css,link[href*="vc-theme-light"]',
    );
    if (light) {
      var tlWant = vcAssetVer("THEME_LIGHT_VER", "20261021sitewideSolid1j");
      if (!/sitewideSolid1j|sitewideSolid1i|sitewideSolid1h|sitewideSolid1g|sitewideSolid1f|sitewideSolid1e|sitewideSolid1d|sitewideSolid1c|sitewideSolid1b|sitewideSolid1|chromeOwnerUnify1|chromeBorderOwner1|acctSolidBorder1|lookStaticBorder1|cpuIdleAll1b|footerConicKill1/i.test(String(tlWant || ""))) {
        tlWant = "20261021sitewideSolid1j";
      }
      var tlHref = "/css/vc-theme-light." + tlWant + ".css?v=" + tlWant;
      if (!links.length) {
        try {
          appendStylesheet(
            "/css/vc-theme-light." + tlWant + ".css",
            tlWant,
          );
        } catch (eAddTl) {}
      } else {
        /* footerConicKill1: upgrade dirty theme-light boots (ticketsGlowFilterKill1b conic) */
        Array.prototype.forEach.call(links, function (l) {
          try {
            var cur = String(l.getAttribute("href") || "");
            if (!/lookStaticBorder1|cpuIdleAll1b|footerConicKill1/i.test(cur)) {
              l.setAttribute("href", tlHref);
              if (!l.id) l.id = "vc-theme-light-css";
            }
          } catch (eUpTl) {}
        });
      }
      return;
    }
    Array.prototype.forEach.call(links, function (l) {
      try {
        if (l.parentNode) l.parentNode.removeChild(l);
      } catch (eRmTl) {}
    });
  } catch (eKitTl) {}
}
var LANDING_CORE_VER = vcAssetVer("LANDING_CORE_VER", "20261017statSepAlign2");
 /* siteChromeKit2: CSS+JS condivisi (badge/Esci/toast/cue/body#top) — last-wins unico */
  var SITE_CHROME_KIT_VER = vcAssetVer("SITE_CHROME_KIT_VER", "20261017pendingBadgePos2");
  /* homeCssAlign1: HTML con asset-versions stamp vecchio (sipario/wikiCore) forza
     chrome/soft sbagliati — rifiuta e usa canon = feedback. */
  (function refuseStaleChromeSoft() {
    try {
      /* backTopPcLate1: keep NAV chrome-ui; remap stale */
      if (/^20261019mqHoverGifFooter1$/.test(String(NAV_CHROME_VER || ""))) {
        /* keep */
      } else if (/backTopPcLate1|wmUlDupKill1|marquee404Fix1|hoverToastAnim1b?|mqResetIdle1|cpuStormKill1b?|cpuHoverIdle1b?\b|userMqIdlePause1|userMqFgRun|userMqKeepAlive|siparioLoad|wikiCoreRestore|mqCpuIdle3|refreshNoFooterJump1|bootToastUnstick1|pendingBadgePos|brandLogoStill1|phoneBarBlurKill[12]|bootMidAvatar1|cursorLagFix[12]|cursorGlowOff1|legalPerfPack1|legalCritical|cursorBackSip|legalBootFouc[12]|viewAsGateClear1b?|mqIdleResumeAll[123]|mqIdleResumeAll3b|legalRestorePreCrit1|metalBorderSocial1\b/i.test(String(NAV_CHROME_VER || ""))) {
        NAV_CHROME_VER = "20261019mqHoverGifFooter1";
      }
      if (/heroMetalStats1b|heroMetalStats1|fixAll1|mqUlUserNoSnap1|mqBarHomeAlways1|mqHoverOnlyAll1|mqVisFix1|mqNoSnapSettle1b?|heroRing2px|footerRing4side|homeAcctMetal|homeHoverMq|homeLoadCpu|mqHeroMetal/i.test(String(SOFT_FX_VER || ""))) {
        /* keep */
      } else if (/^20261019heroDeckMatch1$/.test(String(SOFT_FX_VER || ""))) {
        SOFT_FX_VER = "20261020heroMetalStats1";
      } else if (/tripleRegress|heroDeckMatch1|heroMetalRing1|mqHoverGifFooter1|mqHoverOnly1|ticketsChatSpoiler1b?|ticketsGlowFilterKill1b?|gateKickerCenter1|navAvatarRing1|twitchPipVodFlashKill1|wmUlDupKill1|marquee404Fix1b?|fxFlatKill1[bcdefghijklmn]?|ticketsLagHard1|userMqFgRun|userMqKeepAlive|siparioLoad|wikiCoreRestore|mqCpuIdle3|phoneBarBlurKill[12]|fase3Cpu1|mqFgIdleFix1|notifSheetBtn[12]|toastAutoWidth1|cursorLagFix[12]|backTopSheetHide1|tipLinkDup1|mqIdleResumeAll(?:[12]|3[bc]?|3d)\b/i.test(String(SOFT_FX_VER || ""))) {
        SOFT_FX_VER = "20261020heroMetalStats1";
      }
      if (/siteChromeKit5|userMqFgRun|siparioPipBadge1|pendingBadgeFix3|chromeGap1|siparioAlignAll2|pendingBadgePos1/i.test(String(SITE_CHROME_KIT_VER || ""))) {
        SITE_CHROME_KIT_VER = "20261017pendingBadgePos2";
      }
      if (/lookStaticBorder1|footerConicKill1/i.test(String(NAV_CHROME_FIX_VER || ""))) {
        /* keep */
      } else if (/footerRing4side|mqHoverGifFooter1|navFooterCorner|fixAll1|mqUlUserNoSnap1|wmUlDupKill1|marquee404Fix1|hoverToastAnim1b?|mqResetIdle1|cpuStormKill1b?|cpuHoverIdle1b?\b|brandLogoStill1|userMqFgRun|navPromoGhost|siparioBarSync1|pendingBadgeFix3|siparioAlignAll2|logoSizeLock1|pendingBadgePos2|mqFgIdleFix1|notifSheetBtn2|hamDesktopHide[12]/i.test(String(NAV_CHROME_FIX_VER || ""))) {
        NAV_CHROME_FIX_VER = "20261021lookStaticBorder1";
      }
    } catch (eRefuse) {}
  })();
 var KICKER_HACK_VER = vcAssetVer("KICKER_HACK_VER", "20261019kickerNoHang1");
 try {
   if (/^20261019kickerNoHang1$/.test(String(KICKER_HACK_VER || ""))) {
     /* keep */
   } else if (/kickerNoHack1|cueTextSettle2|kickerPc|textSettlePre1|kickerHack/i.test(String(KICKER_HACK_VER || ""))) {
     KICKER_HACK_VER = "20261019kickerNoHang1";
   }
 } catch (eKickPin) {}
 /* violPass12 */
 var CHROME_SYNC_VER = vcAssetVer("CHROME_SYNC_VER", "20261017chromePrefs401b");
 var STORAGE_VER = vcAssetVer("STORAGE_VER", "20261015vcStorage2");
 var IDB_VER = vcAssetVer("IDB_VER", "20261015pushIdb1");
 var NAV_BADGES_VER = vcAssetVer("NAV_BADGES_VER", "20261015vcStorage2");
 /* notifSheetStayOpen1: outside close non combatte portalGuard/sheet aperto */
 var NOTIF_CHROME_VER = vcAssetVer("NOTIF_CHROME_VER", "20261021notifBellLiveFix1");
  try {
    if (/notifBellLiveFix1/i.test(String(NOTIF_CHROME_VER || ""))) {
      /* keep */
    } else if (/notifSheetLock([123]|4[bcd]?)$/i.test(String(NOTIF_CHROME_VER || ""))) {
      NOTIF_CHROME_VER = "20261021notifBellLiveFix1";
    } else {
      NOTIF_CHROME_VER = "20261021notifBellLiveFix1";
    }
  } catch (eNotifChromeVer) {}
 /* notifBellOpen1: load vc-landing-notif.* (full bell), NOT thin vc-landing.*
    titleSepFix1: NON riusare stamp title come filename landing (rompe SEP/bell) */
 var LANDING_NOTIF_VER = vcAssetVer("LANDING_NOTIF_VER", "20261021stamp404Heal2");
  try {
    /* stamp404Heal2: SW skipWaiting + no stamp-intercept. Keep ahead of siteOptAll2. */
    if (/stamp404Heal2|stamp404Heal1|siteOptAll2|iosPushStampFix1/i.test(String(LANDING_NOTIF_VER || ""))) {
      /* keep */
    } else if (/notifBellLiveFix1|apiPageFilter2|apiPageFilter1|iosPushGzHeal1|phoneBellTapFree1|pushIosDeclarative1|hoverToastAnim1|pushIosPermBanner1|pendingBadgeVis2|ptrVinylCue1|siparioBarSync1|pendingBadgeFix3|siparioAlignAll2|pendingBadgePos|pushShowAckOnlyOk1|candBadgeKeep1|inboxCandKeep1|resoBellFlat1|bootMidAvatar1|inboxOpenStuck1|legalBundleChrome1|notifListOpenPaint1|notifSheetLock[34]|bootScrollTopUntilEnd1\b/i.test(String(LANDING_NOTIF_VER || ""))) {
      LANDING_NOTIF_VER = "20261021stamp404Heal2";
    } else {
      LANDING_NOTIF_VER = "20261021stamp404Heal2";
    }
  } catch (eLandNotif) {}
 /* toastUnstickHard1: toast EARLY only via auth — mai post-curtain */
 var SITE_TOAST_VER = vcAssetVer("SITE_TOAST_VER", "20261016bugListBoot1");
 try {
  if (!window.VcSiteToast || window.VcSiteToast.ver !== SITE_TOAST_VER) {
   appendScript("/js/vc-site-toast." + SITE_TOAST_VER + ".js", SITE_TOAST_VER);
  }
 } catch (eToastBoot) {
  try {
   appendScript("/js/vc-site-toast.js", SITE_TOAST_VER);
  } catch (eToast2) {}
 }
 /* vcStorage2: early safe LS/SS + quota — before chrome-sync / notif */
 try {
  if (!window.VcStorage || window.VcStorage.ver !== STORAGE_VER) {
   appendScript("/js/vc-storage." + STORAGE_VER + ".js", STORAGE_VER);
  }
 } catch (eStorageBoot) {
  try {
   appendScript("/js/vc-storage.js", STORAGE_VER);
  } catch (eStorage2) {}
 }
 /* siparioLoadPage1: hide boot toast mentre sipario è su (shared) */
 try {
  window.__vcKillBootToastOnSipario = function () {
   try {
    if (document.documentElement.classList.contains("vc-cine-curtain-off")) return;
    if (window.VcSiteToast && typeof window.VcSiteToast.hide === "function") {
     window.VcSiteToast.hide();
    }
    var host = document.getElementById("vc-site-toast-host");
    if (!host) return;
    var boots = host.querySelectorAll(".vc-dash-save-toast[data-vc-boot-load-toast]");
    for (var i = 0; i < boots.length; i++) {
     try {
      boots[i].parentNode && boots[i].parentNode.removeChild(boots[i]);
     } catch (eRm) {}
    }
   } catch (eKill) {}
  };
 } catch (eKillBoot) {}
 /* toastHoldAll1: toast+scroll finché CSS/API/loader/barra — no cut a 8s mentre ancora busy */
 try {
  (function bootLoadToastLinger() {
   if (window.__vcBootLoadToastArmed) return;
   window.__vcBootLoadToastArmed = 1;
   var active = false;
   var poll = null;
   var stableReady = 0;
   var ended = false;
   var latchedDone = false;
   function loaderNodeBusy(el) {
    if (!el) return false;
    try {
     if (el.hidden || el.hasAttribute("hidden")) return false;
     if (el.classList && el.classList.contains("vc-staff-loading--hidden")) return false;
     if (el.classList && el.classList.contains("vc-session-verify-overlay--hidden")) return false;
     var st = window.getComputedStyle ? window.getComputedStyle(el) : null;
     if (st && (st.display === "none" || st.visibility === "hidden")) return false;
     if (st && Number(st.opacity || "1") === 0) return false;
     return true;
    } catch (eLd) {
     return true;
    }
   }
   function bootAgeSafe() {
    try {
     var t0 = Number(window.__vcCineBootStartedAt || window.__vcBootLoadToastArmedAt || 0) || 0;
     return t0 ? Date.now() - t0 : 0;
    } catch (eA) {
     return 0;
    }
   }
   function pageLoadGateBusy() {
    /* toastHoldAll1 + serataHangKill1: unica fonte busy; hard idle dopo 10s post-boot */
    try {
     if (bootAgeSafe() > 10000) return false;
     var r = document.documentElement;
     if (!r) return true;
     /* profileToastKill1: dopo sipario profilo alzato → toast NON resta su pending/loader orfano */
     try {
      if (
       r.classList.contains("vc-user-profile-route") &&
       r.classList.contains("vc-cine-curtain-off") &&
       (window.__vcProfileSiparioLifted ||
         window.__vcProfileContentReady ||
         r.classList.contains("vc-profile-boot-done"))
      ) {
       var curtainAge = Number(window.__vcCurtainOffAt || 0)
         ? Date.now() - Number(window.__vcCurtainOffAt)
         : bootAgeSafe();
       if (curtainAge >= 400) return false;
      }
     } catch (eProfToast) {}
     if (!r.classList.contains("vc-cine-curtain-off") && !r.classList.contains("vc-page-cine-ready")) return true;
     if (r.classList.contains("vc-page-cine-boot") && !r.classList.contains("vc-page-cine-ready")) return true;
     if (!r.classList.contains("vc-soft-fx-ready") && !r.classList.contains("vc-soft-fx-off")) return true;
     if (!r.classList.contains("vc-look-core-ready") && !r.classList.contains("vc-soft-fx-off")) return true;
     if (
      !r.classList.contains("vc-core-styles-ready") &&
      !r.classList.contains("vc-home-styles-ready") &&
      !r.classList.contains("vc-styles-ready")
     ) {
      return true;
     }
     if (window.__vcLoadBarCompleting) return true;
     if (window.__vcChromeLoadDone !== true) return true;
     if (!window.__vcLoadBarFullPainted) return true;
     if (r.classList.contains("vc-chrome-bar-loading")) return true;
     var prog = document.getElementById("vc-site-progress");
     if (prog && prog.classList.contains("is-loading")) return true;
     if (r.classList.contains("vc-user-leader-pending")) return true;
     if (r.classList.contains("vc-user-profile-pending")) return true;
     if (r.classList.contains("vc-rank-customize-pending")) return true;
     if (r.classList.contains("vc-custom-profile-pending")) return true;
     if (r.classList.contains("vc-session-verify-pending")) return true;
     if (r.classList.contains("vc-boards-view-pending")) return true;
     if (r.classList.contains("vc-notif-staff-loading")) return true;
     if (r.classList.contains("vc-staff-access-pending") && !r.classList.contains("vc-staff-app-revealed")) return true;
     if (r.classList.contains("vc-dash-access-pending") && !r.classList.contains("vc-dash-access-ready")) return true;
     if (Number(window.__vcBootApiHold || 0) > 0) return true;
     if (Number(window.__vcApiBusyCount || 0) > 0) return true;
     /* serataHangKill1: NO poll link.sheet (404 CSS = busy forever → hang/MO thrash) */
     /* min linger post chrome-done */
     try {
      var doneAt = Number(window.__vcChromeLoadDoneAt || 0) || 0;
      if (window.__vcChromeLoadDone === true && doneAt && Date.now() - doneAt < 700) return true;
     } catch (eLinger) {}
     var loaderIds = [
      "vc-shared-boot-overlay",
      "vc-cine-boot-curtain",
      "vc-boot-load-screen",
      "vc-pre-cine-hard-sipario",
      "vc-roles-loading",
      "vc-staff-loading",
      "vc-ul-loading",
      "vc-user-profile-loading",
      "vc-rank-customize-loading",
      "vc-custom-profile-loading",
      "vc-dashboard-loading",
      "vc-dashboard-guild-loading",
     ];
     for (var i = 0; i < loaderIds.length; i += 1) {
      /* profileToastKill1: loader profilo orfano post-sipario non tiene il toast */
      if (
       loaderIds[i] === "vc-user-profile-loading" &&
       r.classList.contains("vc-cine-curtain-off") &&
       (window.__vcProfileSiparioLifted || r.classList.contains("vc-profile-boot-done"))
      ) {
       continue;
      }
      if (loaderNodeBusy(document.getElementById(loaderIds[i]))) return true;
     }
     if (loaderNodeBusy(document.querySelector(".vc-session-verify-overlay"))) return true;
     if (loaderNodeBusy(document.querySelector(".vc-ul-loading"))) return true;
     if (loaderNodeBusy(document.querySelector('[data-vc-loader-blocking="1"]'))) return true;
     if (!window.__vcChromeScrollArmed && window.__vcChromeLoadDone !== true) return true;
     return false;
    } catch (eBusy) {
     return true;
    }
   }
   try {
    window.__vcPageLoadGateBusy = pageLoadGateBusy;
   } catch (eExport) {}
   function barStillLoading(r) {
    try {
     if (window.__vcLoadBarCompleting) return true;
     if (window.__vcChromeLoadDone !== true) return true;
     if (!window.__vcLoadBarFullPainted) return true;
     if (r.classList.contains("vc-chrome-bar-loading")) return true;
     var prog = document.getElementById("vc-site-progress");
     if (prog && prog.classList.contains("is-loading")) return true;
     return false;
    } catch (eBar) {
     return window.__vcChromeLoadDone !== true;
    }
   }
   function stillLoading() {
    try {
     var r = document.documentElement;
     if (!r) return true;
     if (latchedDone) return false;
     if (window.__vcBootLoadToastLatched) return false;
     if (!r.classList.contains("vc-cine-curtain-off")) return true;
     if (pageLoadGateBusy()) return true;
     if (barStillLoading(r)) return true;
     if (!window.__vcChromeScrollArmed) return true;
     var curtainAt = Number(window.__vcCurtainOffAt || 0) || 0;
     if (curtainAt && Date.now() - curtainAt < 900) return true;
     return false;
    } catch (eL) {
     return false;
    }
   }
   function hasSiparioLoadScreen() {
    try {
     return !!document.getElementById("vc-boot-load-screen");
    } catch (eHas) {
     return false;
    }
   }
   function hideSiparioLoadScreen() {
    try {
     var scr = document.getElementById("vc-boot-load-screen");
     if (!scr) return;
     scr.setAttribute("hidden", "");
     scr.hidden = true;
     try {
      scr.style.setProperty("display", "none", "important");
     } catch (eSt) {}
    } catch (eHideScr) {}
   }
   function killToastOnSipario() {
    try {
     if (typeof window.__vcKillBootToastOnSipario === "function") {
      window.__vcKillBootToastOnSipario();
     }
    } catch (eKill) {}
   }
   function showLoad() {
    try {
     if (latchedDone || ended) return false;
     var curtainOff = false;
     try {
      curtainOff = document.documentElement.classList.contains("vc-cine-curtain-off");
     } catch (eCurt) {}
     /* siparioLoadPage1: durante sipario = solo schermata fullscreen; NIENTE toast */
     if (!curtainOff) {
      active = true;
      killToastOnSipario();
      try {
       window.__vcBootLoadToastHold = 1;
       if (!window.__vcBootLoadToastArmedAt) window.__vcBootLoadToastArmedAt = Date.now();
      } catch (eHoldSip) {}
      return true;
     }
     if (!window.VcSiteToast || typeof window.VcSiteToast.show !== "function") return false;
     active = true;
     try {
      if (!window.__vcBootLoadToastShownAt) window.__vcBootLoadToastShownAt = Date.now();
      if (!window.__vcBootLoadToastArmedAt) window.__vcBootLoadToastArmedAt = Date.now();
      window.__vcBootLoadToastHold = 1;
     } catch (eShown) {}
     window.VcSiteToast.show("Caricamento…", false, { pending: true, bootLoad: true });
     return true;
    } catch (eS) {
     return false;
    }
   }
   function stopPoll() {
    if (!poll) return;
    try {
     window.clearInterval(poll);
    } catch (eClr) {}
    poll = null;
   }
   function startPoll() {
    if (poll || latchedDone || ended) return;
    try {
     var pollT0 = Date.now();
     poll = window.setInterval(function () {
      try {
       /* toastHoldAll1: poll fino a idle o wall 22s (no stop a 16s mid-load) */
       if (Date.now() - pollT0 > 22000 && !pageLoadGateBusy()) {
         stopPoll();
         return;
       }
       if (Date.now() - pollT0 > 28000) {
         stopPoll();
         return;
       }
       tick();
      } catch (eTickP) {}
     }, 400); /* fase3Cpu1 */
    } catch (ePol) {}
   }
   function endLoad() {
    if (ended && latchedDone) {
     try {
      hideSiparioLoadScreen();
      if (window.VcSiteToast && typeof window.VcSiteToast.hide === "function") window.VcSiteToast.hide();
     } catch (eForce) {}
     stopPoll();
     return;
    }
    /* toastBarSync1: fine barra = fine toast subito (no min 700ms post-sipario) */
    ended = true;
    latchedDone = true;
    active = false;
    stopPoll();
    try {
     window.__vcBootLoadToastHold = 0;
     window.__vcBootLoadToastLatched = 1;
    } catch (eLatch) {}
    try {
     hideSiparioLoadScreen();
     if (window.VcSiteToast && typeof window.VcSiteToast.hide === "function") {
      window.VcSiteToast.hide();
     }
    } catch (eE) {}
    window.setTimeout(function () {
     try {
      hideSiparioLoadScreen();
      if (window.VcSiteToast && typeof window.VcSiteToast.hide === "function") window.VcSiteToast.hide();
      var hostE = document.getElementById("vc-site-toast-host");
      if (hostE) hostE.innerHTML = "";
     } catch (eHard) {}
    }, 80);
   }
   function ensurePostCurtainToast() {
    try {
     var r = document.documentElement;
     if (!r || !r.classList.contains("vc-cine-curtain-off")) return;
     if (!window.__vcCurtainOffAt) window.__vcCurtainOffAt = Date.now();
     if (!window.__vcPostCurtainToastAt) window.__vcPostCurtainToastAt = Date.now();
     hideSiparioLoadScreen();
     if (latchedDone || ended || window.__vcBootLoadToastLatched) return;
     /* loadGateHold1: non chiudere toast solo perché la barra è già idle */
     if (!stillLoading()) {
      endLoad();
      return;
     }
     active = false;
     showLoad();
    } catch (eEns) {}
   }
   function tick() {
    if (latchedDone) return;
    try {
     if (
      document.documentElement.classList.contains("vc-cine-curtain-off") &&
      document.documentElement.classList.contains("vc-user-leader-pending")
     ) {
      window.__vcLeaderPendingAfterCurtain = 1;
     }
     if (document.documentElement.classList.contains("vc-cine-curtain-off") && !window.__vcCurtainOffAt) {
      window.__vcCurtainOffAt = Date.now();
     }
     /* postCurtainToast1: class curtain-off (MO) PRIMA dell'evento → arma toast subito */
     if (document.documentElement.classList.contains("vc-cine-curtain-off")) {
      ensurePostCurtainToast();
     }
    } catch (eMeta) {}
    if (stillLoading()) {
     stableReady = 0;
     try {
      window.__vcBootLoadToastHold = 1;
     } catch (eHold) {}
     if (!active) showLoad();
     else {
      try {
       var host = document.getElementById("vc-site-toast-host");
       var has = host && host.querySelector(".vc-dash-save-toast[data-vc-boot-load-toast]");
       if (!has) showLoad();
      } catch (eR) {}
     }
    } else {
     try {
      window.__vcBootLoadToastHold = 0;
     } catch (eHold2) {}
     stableReady += 1;
     /* toastHoldAll1: unlock scroll SOLO quando gate idle (no premature pendingCleared) */
     try {
      if (
       stableReady >= 3 &&
       !pageLoadGateBusy() &&
       window.__vcChromeLoadDone &&
       document.documentElement.classList.contains("vc-loading-scroll-lock") &&
       typeof window.__vcForceUnlockChromeScroll === "function"
      ) {
       window.__vcForceUnlockChromeScroll("gateIdle");
      }
     } catch (eUnlockPend) {}
     /* ~3 tick stabili idle prima di chiudere toast */
     if (stableReady >= 3) endLoad();
    }
   }
   function arm() {
    try {
     if (!window.__vcBootLoadToastArmedAt) window.__vcBootLoadToastArmedAt = Date.now();
    } catch (eArmAt) {}
    tick();
    startPoll();
    window.setTimeout(tick, 40);
    window.setTimeout(tick, 400);
    /* siparioBarSync1: toast wall solo DOPO barra 100% (o 20s absoluto) — no cut a metà */
    window.setTimeout(function () {
     try {
      if (
       window.__vcLoadBarFullPainted &&
       window.__vcChromeScrollArmed === true &&
       !window.__vcLoadBarCompleting
      ) {
       endLoad();
      }
     } catch (eWall) {}
    }, 8000);
    window.setTimeout(function () {
     try {
      endLoad();
     } catch (eWall2) {}
     try {
      if (
       window.__vcChromeScrollArmed !== true &&
       typeof window.__vcForceUnlockChromeScroll === "function"
      ) {
       window.__vcForceUnlockChromeScroll(
        window.__vcLoadBarFullPainted
         ? "failsafeHard+chromeArmStuck1"
         : "armStuck+waitBar"
       );
      }
     } catch (eHard) {}
    }, 20000);
    /* siparioBarSync1: arm stuck solo post-barra (no failsafeHard mid-paint) */
    try {
      if (!window.__vcChromeArmStuckWatch) {
        window.__vcChromeArmStuckWatch = 1;
        var armStuckN = 0;
        var armStuckIv = window.setInterval(function () {
          armStuckN += 1;
          try {
            if (window.__vcChromeScrollArmed === true) {
              window.clearInterval(armStuckIv);
              return;
            }
            if (
             window.__vcChromeLoadDone === true &&
             window.__vcLoadBarFullPainted &&
             !window.__vcLoadBarCompleting &&
             typeof window.__vcForceUnlockChromeScroll === "function"
            ) {
              window.__vcForceUnlockChromeScroll(
               armStuckN >= 24 ? "failsafeHard+armStuckWatch" : "armStuck+afterFull"
              );
            }
          } catch (eArmW) {}
          if (armStuckN >= 50) {
            try {
              window.clearInterval(armStuckIv);
            } catch (eClr) {}
          }
        }, 500);
      }
    } catch (eArmWatch) {}
    try {
     document.addEventListener("vc:cine-curtain-off", function () {
      try {
       window.__vcCurtainOffAt = Date.now();
       if (!window.__vcPostCurtainToastAt) window.__vcPostCurtainToastAt = Date.now();
      } catch (eT) {}
      try {
       ensurePostCurtainToast();
      } catch (ePostT) {}
      tick();
     });
     document.addEventListener("vc:page-cine-ready", tick);
     /* toastSyncAll2: un solo path — chrome-load-done solo tick (no hide 200ms diverso) */
     document.addEventListener("vc:chrome-load-done", function () {
      try {
       if (!window.__vcChromeLoadDoneAt) window.__vcChromeLoadDoneAt = Date.now();
       tick();
      } catch (eChrDone) {}
     });
     /* sitePerfAll1: niente poll 180ms a tab nascosta */
     document.addEventListener(
      "visibilitychange",
      function () {
       try {
        if (document.hidden || document.visibilityState === "hidden") stopPoll();
        else if (!latchedDone && !ended) {
         startPoll();
         tick();
        }
       } catch (eVis) {}
      },
      false,
     );
    } catch (eEv) {}
    try {
     /* serataHangKill1: debounce MO — tick sync su class change = hang (pagina non risponde) */
     var moT = 0;
     var mo = new MutationObserver(function () {
      if (moT) return;
      moT = window.setTimeout(function () {
       moT = 0;
       try {
        if (latchedDone || ended) {
         try {
          mo.disconnect();
         } catch (eOff) {}
         return;
        }
        tick();
       } catch (eMoTick) {}
      }, 240);
     });
     mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    } catch (eMo) {}
   }
   if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arm);
   else arm();
   window.setTimeout(arm, 0);
   /* bootToastEverywhere1: failsafe toast → endLoad subito (no poll forever) */
   try {
    document.addEventListener("vc:boot-load-toast-latched", function () {
     try {
      latchedDone = true;
      ended = true;
      active = false;
      stopPoll();
      window.__vcBootLoadToastHold = 0;
      window.__vcBootLoadToastLatched = 1;
      if (window.VcSiteToast && typeof window.VcSiteToast.hide === "function") window.VcSiteToast.hide();
     } catch (eLatchEv) {}
    });
   } catch (eLatchListen) {}
  })();
 } catch (eBootToast) {}
 /* pushIdb1 + routeGate1: IndexedDB solo user/classifiche (cache grosse) */
 try {
  if (pathNeedsIdb()) {
   if (!window.VcIdb || window.VcIdb.ver !== IDB_VER) {
    appendScript("/js/vc-idb." + IDB_VER + ".js", IDB_VER);
   }
  }
 } catch (eIdbBoot) {
  try {
   if (pathNeedsIdb()) appendScript("/js/vc-idb.js", IDB_VER);
  } catch (eIdb2) {}
 }
 var FOOTER_BREATH_VER = vcAssetVer("FOOTER_BREATH_VER", "20261006bootFast1");
 var FOOTER_SYS_STATUS_VER = vcAssetVer("FOOTER_SYS_STATUS_VER", "20261021apiPageFilter2");
  try {
    if (!/apiPageFilter2/i.test(String(FOOTER_SYS_STATUS_VER || ""))) {
      FOOTER_SYS_STATUS_VER = "20261021apiPageFilter2";
    }
  } catch (eFootVer) {}
 var CHROME_PILL_FOOTER_VER = vcAssetVer("CHROME_PILL_FOOTER_VER", "20261021navFootSwitch1c");
 try {
  if (!/moonKnobVis1/i.test(String(CHROME_PILL_FOOTER_VER || ""))) {
   CHROME_PILL_FOOTER_VER = "20261021siparioBorderPin1";
  }
 } catch (ePillVer) {}
 var OAUTH_HASH_KILL_VER = vcAssetVer("OAUTH_HASH_KILL_VER", "20261010oauthHashKill1");
 var LOGOUT_GATE_VER = vcAssetVer("LOGOUT_GATE_VER", "20261010logoutGate1");
 var API_CACHE_VER = vcAssetVer("API_CACHE_VER", "20261009apiJankCut1");
 var TYPE_SFX_VER = vcAssetVer("TYPE_SFX_VER", "20261020assetGate1");
try {
  if (/assetGate1|confTypeSfxClash1/i.test(String(TYPE_SFX_VER || ""))) {
    TYPE_SFX_VER = "20261020assetGate1";
  }
} catch (eTypeSfxVer) {}
var LANDING_EXT_VER = vcAssetVer("LANDING_EXT_VER", "20261016cssConsol1");
var PC_HERO_CENTER_VER = vcAssetVer("PC_HERO_CENTER_VER", "20261015heroAllPages1");
/* marquee404Fix1: HEADER deve matchare assets stamp reale (mqResetIdle1),
   non hoverToastAnim1 (file mai creato → 404 → chrome/auth spezzati) */
var HEADER_NAME_MARQUEE_VER = vcAssetVer("HEADER_NAME_MARQUEE_VER", "20261020mqNoSnapSettle1b");
 try {
  if (/mqNoSnapSettle1b?|mqHoverNoRestart1|hoverMqSocial1c?|hoverMqSocial1b?/i.test(String(HEADER_NAME_MARQUEE_VER || ""))) {
    /* keep — mqNoSnapSettle1b: settle soft-pause */
  } else if (/^20261019mqHoverOnly1$/.test(String(HEADER_NAME_MARQUEE_VER || ""))) {
    HEADER_NAME_MARQUEE_VER = "20261020mqNoSnapSettle1b";
  } else if (/wmEmojiFree3|wmEmojiFree2|hoverToastAnim1b?|chromeUiIdle3|mqResetIdle1|cpuHoverIdle1b?\b|mqIdleResumeAll[123]|mqIdleResumeAll3b|mqIdleWmUser1|userMqIdlePause1|mqHoverOnly1\b/i.test(String(HEADER_NAME_MARQUEE_VER || ""))) {
   HEADER_NAME_MARQUEE_VER = "20261020mqNoSnapSettle1b";
  }
 } catch (eMqVer) {}
 var I18N_VER = vcAssetVer("I18N_VER", "20261017footerSysPillBack1");
 /* navFootSwitch1: CSS switcher SEMPRE + legacy bake */
 var THEME_SWITCH_VER = vcAssetVer("THEME_SWITCH_VER", "20261021moonKnobVis1");
 try {
  if (!/moonKnobVis1/i.test(String(THEME_SWITCH_VER || ""))) {
   THEME_SWITCH_VER = "20261021siparioBorderPin1";
  }
 } catch (eTsVerInj) {}
 var WT_LAYOUT_VER = vcAssetVer("WT_LAYOUT_VER", "20261019ticketsActOverlay1");
 var PERF_VER = vcAssetVer("PERF_VER", "20261021cpuIdleAll1b");
  try {
  /* cpuIdleAll1b: settle kill + metal sheen */
  if (/cpuIdleAll1b?|lookStaticBorder1b/i.test(String(PERF_VER || ""))) {
    /* keep */
  } else {
   PERF_VER = "20261021cpuIdleAll1b";
  }
 } catch (ePerfVer) {}
 var USER_LEADER_VER = vcAssetVer("USER_LEADER_VER", "20261016perfRoiPack2");
 var PAGE_CINE_BOOT_VER = vcAssetVer("PAGE_CINE_BOOT_VER", "20261020refreshRestoreEnd1");
 try {
  if (/refreshRestoreEnd1/i.test(String(PAGE_CINE_BOOT_VER || ""))) {
   /* keep */
  } else if (/phoneBellTapFree1|bootScrollTopUntilEnd1|phoneBarBlurKill|ptrScrollYoYo|siparioCssGate(?!Wait)|siparioCssWait2|legalBootFouc|legalBootFast[123]\b|homeSiparioLoad1|legalSiparioCpu[12]\b|legalPerfPack1|legalBundleBack1|legalChromeImport1|viewAsGateClear1b?\b/i.test(String(PAGE_CINE_BOOT_VER || ""))) {
   PAGE_CINE_BOOT_VER = "20261020refreshRestoreEnd1";
  }
 } catch (ePcBootVer) {}
 /* bootKitAccel1: sipario/lock → vc-site-boot-kit.css (no mega inject duplicato) */
 try {
 (function ensureSiteBootKitCss() {
  var ver = typeof BOOT_KIT_VER !== "undefined" ? BOOT_KIT_VER : "20261011consoleClean1";
  var href = "/css/vc-site-boot-kit." + ver + ".css?v=" + ver;
  var existing =
   document.getElementById("vc-site-boot-kit-css") ||
   document.querySelector('link[href*="vc-site-boot-kit"]');
  if (existing) {
   try {
    /* ticketsPilot1: su pilot family non remap boot-kit già in HTML */
    var pilotBoot =
     typeof pathIsPilotFamily === "function" && pathIsPilotFamily();
    if (existing.tagName === "LINK" && !pilotBoot) {
     existing.setAttribute("href", href);
    }
    if (!existing.id) existing.id = "vc-site-boot-kit-css";
   } catch (eUp) {}
   return;
  }
  var link = document.createElement("link");
  link.id = "vc-site-boot-kit-css";
  link.rel = "stylesheet";
  link.href = href;
  link.setAttribute("data-vc", "consoleClean1");
  link.onerror = function () {
   try {
    if (document.getElementById("vc-global-load-scroll-lock-css")) return;
    var el = document.createElement("style");
    el.id = "vc-global-load-scroll-lock-css";
    el.setAttribute("data-vc", "consoleClean1-fallback");
    el.textContent =
     "html.vc-loading-scroll-lock,html.vc-loading-scroll-lock body,html.vc-loader-blocking-live,html.vc-loader-blocking-live body,html.vc-chrome-bar-loading,html.vc-chrome-bar-loading body,html.vc-site-polish:not(.vc-cine-curtain-off),html.vc-site-polish:not(.vc-cine-curtain-off) body{overflow:hidden!important;touch-action:none!important;overscroll-behavior:none!important}" +
     "html.vc-site-polish:not(.vc-cine-curtain-off)::before{content:\"\"!important;position:fixed!important;inset:0!important;z-index:2147482990!important;background:#100c09!important}";
    (document.head || document.documentElement).appendChild(el);
   } catch (eFb) {}
  };
  var host = document.head || document.documentElement;
  var first = host.firstChild;
  if (first) host.insertBefore(link, first);
  else host.appendChild(link);
 })();
 } catch (eLoadLockCss) {}
 try {
 (function armGlobalLoadScrollLockFallback() {
 if (window.__vcGlobalLoadScrollArmed) return;
 window.__vcGlobalLoadScrollArmed = 1;
 function loaderAlive(el) {
 if (!el) return false;
 try {
 if (el.hidden || el.hasAttribute("hidden")) return false;
 if (el.classList && el.classList.contains("vc-staff-loading--hidden")) return false;
 if (el.classList && el.classList.contains("vc-session-verify-overlay--hidden")) return false;
 /* flashKillReady1: overlay CSS-hidden non deve riarmare il lock */
 var st = window.getComputedStyle ? window.getComputedStyle(el) : null;
 if (st && (st.display === "none" || st.visibility === "hidden")) return false;
 if (st && Number(st.opacity || "1") === 0) return false;
 return true;
 } catch (e) {
 return false;
 }
 }
 function stylesStillLoading(r) {
 try {
  if (!r.classList.contains("vc-cine-curtain-off") && !r.classList.contains("vc-page-cine-ready")) return true;
  if (!r.classList.contains("vc-soft-fx-ready") && !r.classList.contains("vc-soft-fx-off")) return true;
  if (!r.classList.contains("vc-look-core-ready") && !r.classList.contains("vc-soft-fx-off")) return true;
  if (
   !r.classList.contains("vc-core-styles-ready") &&
   !r.classList.contains("vc-home-styles-ready") &&
   !r.classList.contains("vc-styles-ready")
  ) {
   return true;
  }
 } catch (eSt) {
  return true;
 }
 return false;
 }
 function pageLoadersAlive() {
 try {
  if (loaderAlive(document.getElementById("vc-shared-boot-overlay"))) return true;
  if (loaderAlive(document.getElementById("vc-cine-boot-curtain"))) return true;
  if (loaderAlive(document.getElementById("vc-boot-load-screen"))) return true;
  if (loaderAlive(document.getElementById("vc-pre-cine-hard-sipario"))) return true;
  if (loaderAlive(document.getElementById("vc-roles-loading"))) return true;
  if (loaderAlive(document.getElementById("vc-staff-loading"))) return true;
  if (loaderAlive(document.getElementById("vc-ul-loading"))) return true;
  if (loaderAlive(document.getElementById("vc-user-profile-loading"))) return true;
  if (loaderAlive(document.getElementById("vc-rank-customize-loading"))) return true;
  if (loaderAlive(document.getElementById("vc-custom-profile-loading"))) return true;
  if (loaderAlive(document.querySelector(".vc-session-verify-overlay"))) return true;
  if (loaderAlive(document.querySelector(".vc-ul-loading"))) return true;
  if (loaderAlive(document.querySelector('[data-vc-loader-blocking="1"]'))) return true;
  var prog = document.getElementById("vc-site-progress");
  if (prog && prog.classList.contains("is-loading")) return true;
 } catch (eLd) {}
 return false;
 }
 function apisStillPending(r) {
 try {
  if (r.classList.contains("vc-user-leader-pending")) return true;
  if (r.classList.contains("vc-user-profile-pending")) return true;
  if (r.classList.contains("vc-rank-customize-pending")) return true;
  if (r.classList.contains("vc-custom-profile-pending")) return true;
  if (r.classList.contains("vc-session-verify-pending")) return true;
  if (r.classList.contains("vc-boards-view-pending")) return true;
  if (r.classList.contains("vc-notif-staff-loading")) return true;
  if (r.classList.contains("vc-staff-access-pending") && !r.classList.contains("vc-staff-app-revealed")) return true;
  if (r.classList.contains("vc-dash-access-pending") && !r.classList.contains("vc-dash-access-ready")) return true;
  if (Number(window.__vcBootApiHold || 0) > 0) return true;
  if (Number(window.__vcApiBusyCount || 0) > 0) return true;
 } catch (eApi) {}
 return false;
 }
 function ensureInteractShield(on) {
 try {
  var sh = document.getElementById("vc-load-interact-shield");
  if (!on) {
   if (sh && sh.parentNode) sh.parentNode.removeChild(sh);
   return;
  }
  if (!sh) {
   sh = document.createElement("div");
   sh.id = "vc-load-interact-shield";
   sh.setAttribute("aria-hidden", "true");
   sh.setAttribute("data-vc", "loadLockAll1");
   sh.style.cssText =
    "position:fixed;inset:0;z-index:2147482900;pointer-events:auto;touch-action:none;background:transparent;cursor:wait;";
   (document.body || document.documentElement).appendChild(sh);
  }
 } catch (eSh) {}
 }
 function tick() {
 try {
 /* loadLockAll1: lock scroll+action finché CSS/API/loader vivi — anche post-sipario */
 try {
  window.__vcSyncLoaderScrollLock = tick;
 } catch (eReclaim) {}
 var root = document.documentElement;
 var pageOpen =
 root.classList.contains("vc-page-cine-ready") ||
 root.classList.contains("vc-cine-curtain-off") ||
 window.__vcChromeScrollArmed === true;
 var live = false;
 var loadDone = window.__vcChromeLoadDone === true;
 var bootAge = 0;
 try {
  bootAge = Date.now() - Number(window.__vcCineBootStartedAt || 0);
 } catch (eBootAge) {
  bootAge = 0;
 }
 /* toastHoldAll1: failsafe 28s solo se gate idle — no unlock mid-load */
 var gateBusy = false;
 try {
  gateBusy =
   typeof window.__vcPageLoadGateBusy === "function"
    ? !!window.__vcPageLoadGateBusy()
    : stylesStillLoading(root) || apisStillPending(root) || pageLoadersAlive();
 } catch (eGateBusy) {
  gateBusy = true;
 }
 if (!loadDone && pageOpen && bootAge > 28000 && !gateBusy) loadDone = true;
 var toastHold =
  Number(window.__vcBootLoadToastHold || 0) > 0 &&
  !window.__vcBootLoadToastLatched &&
  root.classList.contains("vc-cine-curtain-off");
 if (toastHold) live = true;
 if (gateBusy) live = true;
 if (root.classList.contains("vc-page-cine-boot") && !root.classList.contains("vc-page-cine-ready")) live = true;
 if (root.classList.contains("vc-interaction-hold")) live = true;
 if (root.classList.contains("vc-chrome-bar-loading") && !loadDone) live = true;
 if (!loadDone) live = true;
 if (!window.__vcChromeScrollArmed && !loadDone) live = true;
 if (stylesStillLoading(root)) live = true;
 if (apisStillPending(root)) live = true;
 if (pageLoadersAlive()) live = true;
 if (!window.__vcChromeUiBooted && !loadDone) {
 try {
  var age = Date.now() - Number(window.__vcCineBootStartedAt || 0);
  if (!window.__vcCineBootStartedAt || age < 5200) live = true;
 } catch (eAge) {
  live = true;
 }
 }
 var canUnlock =
  pageOpen &&
  loadDone &&
  window.__vcChromeScrollArmed === true &&
  !toastHold &&
  !gateBusy &&
  !stylesStillLoading(root) &&
  !apisStillPending(root) &&
  !pageLoadersAlive() &&
  !root.classList.contains("vc-interaction-hold");
 if (canUnlock) {
 live = false;
 root.classList.remove("vc-loader-blocking-live", "vc-loading-scroll-lock", "vc-chrome-bar-loading");
 try {
  var progDone = document.getElementById("vc-site-progress");
  if (progDone) progDone.classList.remove("is-loading");
 } catch (eProgDone) {}
 try {
  root.style.removeProperty("overflow");
  root.style.removeProperty("overflow-x");
  root.style.removeProperty("overflow-y");
  if (document.body) {
   document.body.style.removeProperty("overflow");
   document.body.style.removeProperty("overflow-x");
   document.body.style.removeProperty("overflow-y");
  }
 } catch (eOvClr) {}
 ensureInteractShield(false);
 } else {
 root.classList.toggle("vc-loader-blocking-live", live);
 if (live) {
 root.classList.add("vc-loading-scroll-lock");
 if (!loadDone) root.classList.add("vc-chrome-bar-loading");
 try {
  root.style.setProperty("overflow", "hidden", "important");
  root.style.setProperty("overflow-x", "hidden", "important");
  root.style.setProperty("overflow-y", "hidden", "important");
  if (document.body) {
   document.body.style.setProperty("overflow", "hidden", "important");
   document.body.style.setProperty("overflow-x", "hidden", "important");
   document.body.style.setProperty("overflow-y", "hidden", "important");
   document.body.style.setProperty("touch-action", "none", "important");
  }
 } catch (eOvPin) {}
 ensureInteractShield(true);
 } else if (!root.classList.contains("vc-interaction-hold")) {
 root.classList.remove("vc-loading-scroll-lock");
 ensureInteractShield(false);
 }
 }
 } catch (eTick) {}
 }
 window.__vcSyncLoaderScrollLock = tick;
 tick();
 window.setTimeout(tick, 200);
 window.setTimeout(tick, 800);
 window.setTimeout(tick, 2000);
 /* loadLockAll1: reclaim continuo finché CSS/API/loader vivi (no hard unlock precoce) */
 var scrollLockIv = window.setInterval(function () {
  try {
   window.__vcSyncLoaderScrollLock = tick;
   tick();
   var r = document.documentElement;
   var idle =
    window.__vcChromeLoadDone === true &&
    window.__vcChromeScrollArmed === true &&
    !r.classList.contains("vc-loading-scroll-lock") &&
    !r.classList.contains("vc-loader-blocking-live") &&
    !r.classList.contains("vc-user-profile-pending") &&
    !r.classList.contains("vc-user-leader-pending") &&
    !r.classList.contains("vc-session-verify-pending");
   if (idle) {
    try {
     window.clearInterval(scrollLockIv);
    } catch (eClrIv) {}
   }
  } catch (eInt) {}
 }, 500); /* fase3Cpu1 */
 document.addEventListener("DOMContentLoaded", tick, { once: true });
 window.addEventListener("pageshow", tick);
 document.addEventListener("visibilitychange", function () {
 if (document.visibilityState !== "visible") return;
 /* violKillVis1: tick fuori dal visibilitychange */
 window.setTimeout(function () {
 try {
 tick();
 } catch (eVisTick) {}
 }, 0);
 });
 try {
 if (typeof MutationObserver !== "undefined") {
 var moT = 0;
 var mo = new MutationObserver(function () {
 if (moT) return;
 /* hangKill1 + pageHang1: debounce lungo; disconnect subito dopo ready */
 moT = window.setTimeout(function () {
 moT = 0;
 try {
 if (
 document.documentElement.classList.contains("vc-page-cine-ready") ||
 document.documentElement.classList.contains("vc-soft-fx-ready") ||
 window.__vcChromeScrollArmed
 ) {
 try {
 mo.disconnect();
 } catch (eOff) {}
 return;
 }
 } catch (eReadyMo) {}
 tick();
 }, 280);
 });
 mo.observe(document.documentElement, {
 attributes: true,
 attributeFilter: ["class", "hidden"],
 subtree: false,
 });
 window.setTimeout(function () {
 try {
 if (document.body) {
 mo.observe(document.body, { childList: true, subtree: false, attributes: false });
 }
 var ids = ["vc-shared-boot-overlay", "vc-cine-boot-curtain", "vc-roles-loading", "vc-staff-loading", "vc-ul-loading"];
 for (var ii = 0; ii < ids.length; ii += 1) {
 var el = document.getElementById(ids[ii]);
 if (el) mo.observe(el, { attributes: true, attributeFilter: ["hidden", "class"] });
 }
 } catch (eBody) {}
 }, 0);
 window.setTimeout(function () {
 try {
 mo.disconnect();
 } catch (eMoKill) {}
 }, 1400);
 }
 } catch (eMo) {}
 })();
 } catch (eLoadLockArm) {}
 /* gateLookCoreFix1 + gateProfBlankFix1: failsafe SOLO sipario/session …
    MAI togliere vc-user-profile-pending / loader profilo (? pagina bianca). */
 (function armSiparioGateFailsafe() {
  if (window.__vcSiparioGateFailsafeArmed) return;
  window.__vcSiparioGateFailsafeArmed = 1;
  function forceGateOpen(why) {
   try {
    var root = document.documentElement;
    var softOk = root.classList.contains("vc-soft-fx-ready") || root.classList.contains("vc-soft-fx-off");
    var lookOk = root.classList.contains("vc-look-core-ready");
    if (!softOk || !lookOk) {
     /* siparioFast2: prova mark CSS; hard-force già da t1400 */
     try {
      var softLink =
       document.querySelector('link[href*="vc-soft-fx"]') ||
       document.getElementById("vc-soft-fx-css");
      if (softLink && markSoftFxReady(softLink)) return;
     } catch (eTryMark) {}
     var whyS = String(why || "");
     if (whyS.indexOf("t1400") === -1 && whyS.indexOf("t2800") === -1 && whyS.indexOf("t4500") === -1) return;
     var pageBootingEarly =
      root.classList.contains("vc-user-profile-pending") ||
      root.classList.contains("vc-user-leader-pending") ||
      root.classList.contains("vc-rank-customize-pending") ||
      root.classList.contains("vc-custom-profile-pending") ||
      root.classList.contains("vc-staff-access-pending") ||
      root.classList.contains("vc-dash-access-pending") ||
      /* loadSyncPack1: boards-view + session still alive = early boot */
      root.classList.contains("vc-boards-view-pending") ||
      (root.classList.contains("vc-session-verify-pending") && (function () {
       try {
        var _svo = document.querySelector(".vc-session-verify-overlay");
        if (!_svo) return false;
        return !_svo.hidden && !_svo.classList.contains("vc-session-verify-overlay--hidden");
       } catch (_eSVE) { return false; }
      })());
     /* siparioBarSync1: MAI fake soft-fx + curtain-off (classifiche flash CSS corrotto).
        Se sheet non pronti: tieni sipario opaco; class ready solo quando markSoftFxReady ok. */
     if (pageBootingEarly && whyS.indexOf("t6500") === -1 && whyS.indexOf("t4500") === -1) return;
     var softReally = false;
     try {
      /* siparioCssWait2: mai fake soft-fx (fase2Defer) — solo sheet reali */
      var softLink2 =
       document.querySelector('link[href*="vc-soft-fx"]') ||
       document.getElementById("vc-soft-fx-css");
      softReally = !!(softLink2 && softFxSheetReady(softLink2) && markSoftFxReady(softLink2));
     } catch (eSoftReal) {
      softReally = false;
     }
     if (!softReally) {
      try {
       /* legalUtilsRestore1: se curtain già alzato NON togliere curtain-off né
          rimettere display:flex sul sipario (inline !important resta forever). */
       var curtainAlready =
         root.classList.contains("vc-cine-curtain-off") ||
         Number(window.__vcCurtainOffAt || 0) > 0;
       if (curtainAlready) {
         root.classList.add("vc-page-cine-ready", "vc-cine-curtain-off");
         ["vc-pre-cine-hard-sipario", "vc-boot-load-screen"].forEach(function (id) {
           var sipDone = document.getElementById(id);
           if (!sipDone) return;
           sipDone.hidden = true;
           sipDone.setAttribute("hidden", "");
           try {
             sipDone.style.setProperty("display", "none", "important");
             sipDone.style.setProperty("opacity", "0", "important");
             sipDone.style.setProperty("visibility", "hidden", "important");
           } catch (eSipHide2) {}
         });
         try {
           root.classList.remove("vc-loader-blocking-live", "vc-loading-scroll-lock");
         } catch (eBlk) {}
       } else {
         root.classList.add("vc-page-cine-ready");
         var sip =
           document.getElementById("vc-boot-load-screen") ||
           document.getElementById("vc-pre-cine-hard-sipario");
         if (sip) {
           sip.hidden = false;
           sip.removeAttribute("hidden");
           try {
             sip.style.setProperty("display", "flex", "important");
             sip.style.setProperty("opacity", "1", "important");
             sip.style.setProperty("visibility", "visible", "important");
           } catch (eSipShow) {}
         }
       }
      } catch (eKeepSip) {}
     } else {
      var chromeDoneGate = window.__vcChromeLoadDone === true;
      var bootAgeGate = 0;
      try {
       var tBoot = Number(window.__vcCineBootStartedAt || 0) || 0;
       bootAgeGate = tBoot ? Date.now() - tBoot : 0;
      } catch (eAgeG) {}
      /* curtain solo con CSS reale + bundle; chrome done o age alto */
      var allowCurtain =
       chromeDoneGate || bootAgeGate >= 6500 || whyS.indexOf("t6500") !== -1;
      try {
       if (allowCurtain && window.__vcSiparioCssGateHold && typeof window.__vcReclaimSiparioCssGate === "function") {
        if (!window.__vcReclaimSiparioCssGate()) allowCurtain = false;
       }
      } catch (eAllowHold) {}
      /* profileSipContent1: su /user non alzare sipario finché non c’è shell profilo */
      try {
       var profHold =
        root.classList.contains("vc-user-profile-pending") ||
        root.classList.contains("vc-user-profile-route");
       if (profHold && allowCurtain) {
        var shellOk =
         window.__vcProfileSiparioLifted ||
         root.classList.contains("vc-profile-boot-done");
        if (!shellOk) {
         try {
          var pv = document.getElementById("vc-user-profile-view");
          shellOk = !!(
           pv &&
           pv.querySelector(
            ".vc-user-profile-shell .vc-user-profile-hero, .vc-user-profile-shell .vc-user-profile-empty, .vc-user-profile-shell .vc-user-profile-notfound, .vc-user-profile-staff-pane .vc-user-profile-hero, .vc-user-profile-staff-pane .vc-staff-profile-panel, .vc-staff-prof-miss"
           )
          );
         } catch (eShell) {
          shellOk = false;
         }
        }
        if (!shellOk && bootAgeGate < 12000 && whyS.indexOf("t12000") === -1) {
         allowCurtain = false;
        }
       }
      } catch (eProfHold) {}
      if (allowCurtain) {
       root.classList.add("vc-cine-curtain-off", "vc-page-cine-ready");
       root.classList.remove("vc-page-cine-boot");
      } else {
       root.classList.add("vc-page-cine-ready");
      }
      try {
       document.dispatchEvent(new CustomEvent("vc:soft-fx-ready", { detail: { reason: String(why || "failsafe") } }));
      } catch (eEv) {}
     }
    }
    /* loadSyncPack1: non strippare session-verify-pending mentre overlay ancora live
       (a meno che sia timeout hard t2800/t4500) */
    var _whyFinal = String(why || "");
    var _isHardTimeout =
     _whyFinal.indexOf("t2800") !== -1 ||
     _whyFinal.indexOf("t4500") !== -1 ||
     _whyFinal.indexOf("t6500") !== -1;
    var _sessionOverlayLive = (function () {
     try {
      var _svoF = document.querySelector(".vc-session-verify-overlay");
      if (!_svoF) return false;
      return !_svoF.hidden && !_svoF.classList.contains("vc-session-verify-overlay--hidden");
     } catch (_eSVOF) { return false; }
    })();
    if (!_sessionOverlayLive || _isHardTimeout) {
     root.classList.remove("vc-session-verify-pending", "vc-auth-session-pending");
    }
    root.classList.remove("vc-notif-staff-loading", "vc-notif-early-staff");
    /* loadSyncPack1: harden pageBooting — boards-view + session-pending also keep locks */
    var pageBooting =
     root.classList.contains("vc-user-profile-pending") ||
     root.classList.contains("vc-user-leader-pending") ||
     root.classList.contains("vc-rank-customize-pending") ||
     root.classList.contains("vc-custom-profile-pending") ||
     root.classList.contains("vc-staff-access-pending") ||
     root.classList.contains("vc-dash-access-pending") ||
     root.classList.contains("vc-boards-view-pending") ||
     root.classList.contains("vc-session-verify-pending");
    /* loadGateHold1: NON togliere scroll/click lock finché chrome non è done */
    var chromeDoneHold = window.__vcChromeLoadDone === true && window.__vcChromeScrollArmed === true;
    var whyHold = String(why || "");
    var hardUnlock =
     whyHold.indexOf("t6500") !== -1 || whyHold.indexOf("t4500") !== -1;
    if (!pageBooting && (chromeDoneHold || hardUnlock)) {
     root.classList.remove("vc-interaction-hold", "vc-loading-scroll-lock", "vc-loader-blocking-live");
     try {
      var shDone = document.getElementById("vc-load-interact-shield");
      if (shDone && shDone.parentNode) shDone.parentNode.removeChild(shDone);
     } catch (eShDone) {}
    } else if (!chromeDoneHold && !hardUnlock) {
     root.classList.add("vc-loading-scroll-lock", "vc-chrome-bar-loading");
     try {
      root.style.setProperty("overflow", "hidden", "important");
      root.style.setProperty("overflow-y", "hidden", "important");
      if (document.body) {
       document.body.style.setProperty("overflow", "hidden", "important");
       document.body.style.setProperty("overflow-y", "hidden", "important");
      }
     } catch (eHoldPin) {}
    }
    /* loadSyncPack1: non nascondere shared-boot-overlay mentre dash ancora pending */
    var _dashPendingAlive =
     root.classList.contains("vc-dash-access-pending") &&
     !root.classList.contains("vc-dash-access-ready");
    var killIds = [
     "vc-session-verify-overlay",
     "vc-staff-inbox-loading",
     "vc-shared-boot-overlay",
     "vc-cine-boot-curtain",
    ];
    for (var i = 0; i < killIds.length; i += 1) {
     if (killIds[i] === "vc-shared-boot-overlay" && _dashPendingAlive) continue;
     /* toastSyncAll2: non rimuovere sipario DOM finché curtain-off non c'è */
     if (
      killIds[i] === "vc-cine-boot-curtain" &&
      !root.classList.contains("vc-cine-curtain-off")
     ) {
      continue;
     }
     var el = document.getElementById(killIds[i]);
     if (!el) continue;
     try {
      el.hidden = true;
      el.setAttribute("hidden", "");
      el.classList.add("vc-session-verify-overlay--hidden", "vc-staff-loading--hidden");
      if (el.id === "vc-session-verify-overlay" && el.parentNode) el.parentNode.removeChild(el);
     } catch (eKill) {}
    }
    try {
     if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
    } catch (eSync) {}
   } catch (eForce) {}
  }
  window.__vcForceSiparioGateOpen = forceGateOpen;
  /* toastSyncAll2: soft mark CSS early; curtain hard solo a 6.5s */
  window.setTimeout(function () {
   forceGateOpen("t800");
  }, 800);
  window.setTimeout(function () {
   forceGateOpen("t1400");
  }, 1400);
  window.setTimeout(function () {
   forceGateOpen("t2800");
  }, 2800);
  window.setTimeout(function () {
   forceGateOpen("t6500");
  }, 6500);
  /* profileSipContent1: hard failsafe profilo dopo 12s */
  window.setTimeout(function () {
   forceGateOpen("t12000");
  }, 12000);
  window.addEventListener("pageshow", function () {
   window.setTimeout(function () {
    forceGateOpen("pageshow");
   }, 900);
  });
 })();
 /* bootUnifyBar1: stub barra su TUTTE le pagine durante sipario (non solo home) */
 try {
  (function ensureGlobalProgressStub() {
   if (window.__vcBootProgressStubArmed) return;
   window.__vcBootProgressStubArmed = 1;
   var root = document.documentElement;
   try {
    root.classList.add("vc-chrome-bar-loading", "vc-loading-scroll-lock");
   } catch (eCls) {}
   /* siparioLoadPage1: sipario = stesso loader fullscreen di profilo/classifiche */
   try {
    var sip = document.getElementById("vc-pre-cine-hard-sipario");
    if (!sip) {
     sip = document.createElement("div");
     sip.id = "vc-pre-cine-hard-sipario";
     sip.setAttribute("aria-hidden", "true");
     var host = document.body || root;
     if (host.firstChild) host.insertBefore(sip, host.firstChild);
     else host.appendChild(sip);
    }
    var scr = document.getElementById("vc-boot-load-screen");
    if (!scr) {
     scr = document.createElement("div");
     scr.id = "vc-boot-load-screen";
     sip.appendChild(scr);
    }
    scr.setAttribute("role", "status");
    scr.setAttribute("aria-live", "polite");
    scr.setAttribute("aria-label", "Caricamento…");
    scr.setAttribute("data-vc", "siparioLoadPage2");
    scr.innerHTML =
     '<span class="vc-boot-load-screen__spin" aria-hidden="true"></span>' +
     '<p class="vc-boot-load-screen__title">Caricamento…</p>' +
     '<p class="vc-boot-load-screen__sub">Un momento…</p>';
    var scrCss = document.getElementById("vc-sipario-load-sync-css");
    if (!scrCss) {
     scrCss = document.createElement("style");
     scrCss.id = "vc-sipario-load-sync-css";
     (document.head || root).appendChild(scrCss);
    }
    /* legalBootFouc2: NON cancellare hide main/header/footer (FOUC policy) */
    scrCss.setAttribute("data-vc", "legalBootFouc2");
    scrCss.textContent =
     "html:not(.vc-cine-curtain-off) body>*:not(#vc-pre-cine-hard-sipario)," +
     "html.vc-page-cine-ready:not(.vc-cine-curtain-off) body>*:not(#vc-pre-cine-hard-sipario)," +
     "html.vc-page-cine-ready:not(.vc-cine-curtain-off) body.vc-body>main," +
     "html.vc-page-cine-ready:not(.vc-cine-curtain-off) body.vc-body>header," +
     "html.vc-page-cine-ready:not(.vc-cine-curtain-off) body.vc-body>footer," +
     "html.vc-site-polish:not(.vc-cine-curtain-off) body.vc-body>main," +
     "html.vc-site-polish:not(.vc-cine-curtain-off) body.vc-body>header," +
     "html.vc-site-polish:not(.vc-cine-curtain-off) body.vc-body>footer{" +
     "opacity:0!important;visibility:hidden!important;pointer-events:none!important}" +
     "html:not(.vc-cine-curtain-off){background:#100c09!important}" +
     "html:not(.vc-cine-curtain-off) body{background:#100c09!important}" +
     "html:not(.vc-cine-curtain-off) #vc-boot-load-screen{position:fixed!important;inset:0!important;" +
     "z-index:2147483100!important;display:flex!important;flex-direction:column!important;" +
     "align-items:center!important;justify-content:center!important;gap:.95rem!important;" +
     "padding:1.5rem!important;margin:0!important;box-sizing:border-box!important;" +
     "pointer-events:auto!important;touch-action:none!important;border:0!important;border-radius:0!important;box-shadow:none!important;" +
     "background-color:#0b0806!important;" +
     "background-image:radial-gradient(ellipse 92% 74% at 50% 38%,rgba(232,196,156,.16) 0%,rgba(28,20,14,.94) 52%,#0a0706 100%)!important;" +
     "opacity:1!important;visibility:visible!important}" +
     "html.vc-cine-curtain-off #vc-boot-load-screen,html #vc-boot-load-screen[hidden]{display:none!important;" +
     "opacity:0!important;visibility:hidden!important;pointer-events:none!important}" +
     "#vc-boot-load-screen .vc-boot-load-screen__spin{flex-shrink:0!important;width:3rem!important;height:3rem!important;" +
     "display:block!important;border:0!important;border-radius:0!important;box-shadow:none!important;" +
     "background-color:transparent!important;" +
     "background-image:url(/images/vc-loading.gif?v=20260920vcLoadingSpokes1)!important;" +
     "background-position:center!important;background-size:contain!important;background-repeat:no-repeat!important}" +
     "#vc-boot-load-screen .vc-boot-load-screen__title{margin:0!important;padding:0!important;" +
     "color:rgba(248,236,223,.98)!important;font:800 clamp(1.5rem,4vw,2.25rem)/1.2 system-ui,Segoe UI,sans-serif!important;" +
     "text-align:center!important;-webkit-text-fill-color:rgba(248,236,223,.98)!important}" +
     "#vc-boot-load-screen .vc-boot-load-screen__sub{margin:0!important;padding:0!important;" +
     "color:rgba(248,236,223,.78)!important;font:500 1.05rem/1.5 system-ui,Segoe UI,sans-serif!important;" +
     "text-align:center!important}" +
     "#vc-boot-load-screen .vc-boot-load-screen__card{display:none!important}" +
     "html:not(.vc-cine-curtain-off) #vc-site-toast-host .vc-dash-save-toast[data-vc-boot-load-toast]," +
     "html:not(.vc-cine-curtain-off) #vc-site-toast-host .vc-dash-save-toast.is-pending{" +
     "display:none!important;opacity:0!important;visibility:hidden!important}";
    try {
     if (typeof window.__vcKillBootToastOnSipario === "function") {
      window.__vcKillBootToastOnSipario();
     }
    } catch (eKill0) {}
   } catch (eSipEl) {}
   if (!document.getElementById("vc-boot-progress-stub-css")) {
    var css = document.createElement("style");
    css.id = "vc-boot-progress-stub-css";
    css.setAttribute("data-vc", "barOneShot1");
    css.textContent =
     /* progGlowUnify1 + barOneShot1: stessa sand-glow di chrome-ui (load+scroll) */
     "#vc-site-progress{position:fixed!important;top:0!important;left:0!important;right:0!important;" +
     "width:auto!important;height:3px!important;z-index:2147483600!important;pointer-events:none!important;" +
     "background:transparent!important;opacity:1!important;visibility:visible!important;display:block!important;" +
     "overflow:hidden!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;" +
     "filter:none!important;box-shadow:none!important}" +
     "#vc-site-progress.is-loading{opacity:1!important;visibility:visible!important;display:block!important}" +
     "#vc-site-progress__bar{display:block!important;height:100%!important;width:100%!important;" +
     "transform-origin:left center!important;background:#d4a888!important;" +
     "background-image:linear-gradient(90deg,#8f6b3f,#c49a72,#e8c9a8,#fffaf3,#e8c9a8,#d4a888,#b88968)!important;" +
     "box-shadow:none!important;" +
     "filter:none!important;backdrop-filter:none!important;will-change:auto!important}" +
     /* phoneBarBlurKill2: telefono = fill piatto (no highlight bianco) */
     "@media (max-width:1199.98px),(pointer:coarse){" +
     "#vc-site-progress__bar{background-image:linear-gradient(90deg,#9a7349,#d4a888,#b88968)!important;" +
     "box-shadow:none!important;filter:none!important;will-change:auto!important}}";
    (document.head || root).appendChild(css);
   }
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
    var barEl = document.getElementById("vc-site-progress__bar");
    if (barEl) {
     try {
      barEl.style.setProperty("transform", "scaleX(0.16)", "important");
     } catch (eTr) {
      barEl.style.transform = "scaleX(0.16)";
     }
    }
    if (window.__vcChromeUiBooted || window.__vcBootStubStopped) return;
    var t0 = performance.now();
    /* barPostSip1 + barOneShot1: pulse finché chrome-ui; espone pct per handoff continuo */
    var pulse = window.setInterval(function () {
     try {
      var ageMs = performance.now() - t0;
      var done =
        window.__vcChromeUiBooted ||
        window.__vcBootStubStopped ||
        window.__vcChromeLoadDone === true ||
        ageMs > 8000;
      if (done) {
       window.clearInterval(pulse);
       return;
      }
      try {
       var wKeep = document.getElementById("vc-site-progress");
       if (wKeep && window.__vcChromeLoadDone !== true) wKeep.classList.add("is-loading");
      } catch (eKeepL) {}
      var age = Math.min(1, ageMs / 4200);
      var hold = 0.88;
      var pct = 0.14 + age * (hold - 0.14);
      try {
       window.__vcBootStubBarPct = pct;
      } catch (ePct) {}
      var b = document.getElementById("vc-site-progress__bar");
      if (b) b.style.setProperty("transform", "scaleX(" + pct.toFixed(4) + ")", "important");
     } catch (ePulse) {}
    }, 200); /* fase3Cpu1: no 50ms wake */
   }
   if (document.body) mountStub();
   else document.addEventListener("DOMContentLoaded", mountStub, { once: true });
  })();
 } catch (eStub) {}
/* emojiDiscordFast1: preconnect Discord CDN + twemoji prima dei CSS pesanti */
 (function injectDiscordEmojiHints() {
  try {
   if (document.getElementById("vc-discord-preconnect")) return;
   var head = document.head || document.documentElement;
   function add(rel, href, cross) {
    var l = document.createElement("link");
    l.rel = rel;
    l.href = href;
    if (cross) l.crossOrigin = "anonymous";
    if (rel === "preconnect" && href.indexOf("discord") !== -1) l.id = "vc-discord-preconnect";
    head.appendChild(l);
   }
   add("preconnect", "https://cdn.discordapp.com", true);
   add("dns-prefetch", "https://cdn.discordapp.com", false);
   add("preconnect", "https://cdn.jsdelivr.net", true);
   add("dns-prefetch", "https://cdn.jsdelivr.net", false);
  } catch (eHint) {}
 })();
/* bootKitAccel1: boot-kit PRIMA di look/soft (sipario/lock shared) */
try {
 appendStylesheet(
  "/css/vc-site-boot-kit." + (typeof BOOT_KIT_VER !== "undefined" ? BOOT_KIT_VER : NAV_CHROME_VER) + ".css",
  typeof BOOT_KIT_VER !== "undefined" ? BOOT_KIT_VER : NAV_CHROME_VER
 );
} catch (eBootKitCss) {}
/* midRiskPerf1: Inter early (swap); Cormorant post-curtain (optional). */
try {
  appendStylesheet(
    "/css/vc-fonts-inter.css",
    (window.__VC_ASSET_VERS && window.__VC_ASSET_VERS.FONTS_INTER_VER) ||
      (window.__VC_ASSET_VERS && window.__VC_ASSET_VERS.FONTS_VER) ||
      "20261021midRiskPerf1"
  );
  var _faFontsInter = document.querySelector('link[href*="vc-fonts-inter"]');
  if (_faFontsInter) _faFontsInter.id = "vc-fonts-inter-css";
} catch (eFontsInter) {}
try {
  (function loadCormorantPostCurtain() {
    /* siteOptAll2: interOnly1 forza Inter su brand/titoli — Cormorant solo legal/edge
       (evita woff2 inutile su home/tickets/wiki). */
    if (window.__vcCormorantFontArmed) return;
    window.__vcCormorantFontArmed = 1;
    function needsCormorant() {
      try {
        var path = String(location.pathname || "/")
          .replace(/\/index\.html$/i, "")
          .replace(/\/+$/, "") || "/";
        path = path.replace(/^\/(en|it)(?=\/|$)/i, "") || "/";
        if (
          /^\/(privacy|termini|terms|cookies|cookie|regolamento|gdpr|legal|condizioni)(\/|$)/i.test(
            path,
          )
        ) {
          return true;
        }
        if (document.querySelector("[data-vc-need-cormorant],.vc-need-cormorant")) {
          return true;
        }
      } catch (eN) {}
      return false;
    }
    function go() {
      try {
        if (!needsCormorant()) return;
        if (document.getElementById("vc-fonts-cormorant-css")) return;
        appendStylesheet(
          "/css/vc-fonts-cormorant.css",
          (window.__VC_ASSET_VERS && window.__VC_ASSET_VERS.FONTS_CORMORANT_VER) ||
            "20261021midRiskPerf1"
        );
        var el = document.querySelector('link[href*="vc-fonts-cormorant"]');
        if (el) el.id = "vc-fonts-cormorant-css";
      } catch (eC) {}
    }
    function ready() {
      try {
        var r = document.documentElement;
        return (
          r.classList.contains("vc-cine-curtain-off") ||
          r.classList.contains("vc-page-cine-ready") ||
          r.classList.contains("vc-soft-fx-ready")
        );
      } catch (eR) {
        return true;
      }
    }
    function arm() {
      if (ready()) {
        try {
          if (window.requestIdleCallback) window.requestIdleCallback(go, { timeout: 2500 });
          else window.setTimeout(go, 600);
        } catch (eA) {
          go();
        }
        return;
      }
      try {
        document.addEventListener("vc:cine-curtain-off", arm, { once: true });
      } catch (eL) {}
      window.setTimeout(arm, 8000);
    }
    arm();
  })();
} catch (eFontsCorm) {}
/* lookSafePerf1: prefer FA subset (used icons); rewrite full→subset; fallback full. */
try {
  var FA_SUBSET_HREF =
    "/css/font-awesome/subset/font-awesome.subset.min.css?v=20261021lookSafePerf1";
  var FA_FULL_HREF =
    "/css/font-awesome/css/font-awesome.min.css?v=20261014faFontFix1";
  function pinFaLink(el, href) {
    try {
      if (!el) return;
      el.id = "vc-font-awesome-css";
      el.setAttribute("href", href);
      el.setAttribute("data-vc", "20261021lookSafePerf1");
    } catch (ePin) {}
  }
  var _faExisting = document.querySelector(
    'link#vc-font-awesome-css,link[href*="font-awesome"]'
  );
  if (_faExisting) {
    pinFaLink(_faExisting, FA_SUBSET_HREF);
  } else {
    appendStylesheet(
      "/css/font-awesome/subset/font-awesome.subset.min.css",
      "20261021lookSafePerf1"
    );
    var _faLink = document.querySelector(
      'link[href*="font-awesome.subset"],link[href*="font-awesome"]'
    );
    pinFaLink(_faLink, FA_SUBSET_HREF);
  }
  /* if subset 404, fall back once */
  try {
    var _faChk = document.getElementById("vc-font-awesome-css");
    if (_faChk) {
      _faChk.addEventListener(
        "error",
        function () {
          pinFaLink(_faChk, FA_FULL_HREF);
        },
        { once: true }
      );
    }
  } catch (eFaErr) {}
} catch (eFaCss) {}
/* splitBundle1: site-chrome early ovunque; scrub mega-bundle */
try {
  if (pathIsLegalFamily()) {
    ensureLegalLookCore();
    ensureLegalChromeImport();
    pinLegalChromeParity();
  } else {
    ensureSiteChromeCss();
    if (pathIsTicketsFamily()) {
      try {
        ensureFooterSocialMetalEarly();
        pinLegalSvgMetal();
      } catch (eTkMetal) {}
    }
  }
  try {
    ensureGlowFormCss();
  } catch (eGlowEarly) {}
  if (pageHasScopedPageCss() || pathIsLegalFamily()) {
    scrubScopedParallelCss();
  }
} catch (ePbEarly) {}
/* fase2Defer1: scoped → look/soft deferred; home/404 restano sync blocking */
try {
  armFase2ScopedCssDefer();
} catch (eArmF2) {}
if (window.__vcFase2ScopedDefer) {
  /* legalLookCore1: legal → look-core sync; altri scoped → look-core defer */
  try {
    if (pathIsLegalFamily()) {
      ensureLegalLookCore();
      appendStylesheet(
        "/css/vc-look-core." + LOOK_CORE_VER + ".css",
        LOOK_CORE_VER,
      );
    } else {
      appendDeferredStylesheet(
        "/css/vc-look-core." + LOOK_CORE_VER + ".css",
        LOOK_CORE_VER,
        "vc-look-core-css",
      );
    }
  } catch (eLookF2) {
    appendDeferredStylesheet(
      "/css/vc-look-core." + LOOK_CORE_VER + ".css",
      LOOK_CORE_VER,
      "vc-look-core-css",
    );
  }
  try {
    if (pathNeedsPcHeroCenter()) {
      appendHomeLateStylesheet(
        "/css/vc-pc-hero-center." + PC_HERO_CENTER_VER + ".css",
        PC_HERO_CENTER_VER,
        "vc-pc-hero-center-css",
      );
    }
  } catch (ePcHeroCenter) {}
  appendDeferredStylesheet("/css/vc-soft-fx." + SOFT_FX_VER + ".css", SOFT_FX_VER, "vc-soft-fx-css");
  try {
    window.setTimeout(function () {
      try {
        var softPin =
          document.getElementById("vc-soft-fx-css") ||
          document.querySelector('link[href*="vc-soft-fx"]');
        markSoftFxReady(softPin || document.documentElement);
      } catch (eMkF2) {}
    }, 0);
  } catch (eSchedF2) {}
  try {
    fase2LazyNonCriticalHeadScripts();
  } catch (eJsF2) {}
} else {
  /* legalLookCore1: legal → look-core; altrove lite solo se già in HTML */
  var hasLookLite = false;
  try {
    if (pathIsLegalFamily()) {
      ensureLegalLookCore();
      hasLookLite = false;
    } else {
      hasLookLite = !!(
        document.getElementById("vc-look-lite-css") ||
        document.querySelector('link[href*="vc-look-lite"]')
      );
    }
  } catch (eHasLite) {
    hasLookLite = false;
  }
  if (hasLookLite) {
    appendStylesheet(
      "/css/vc-look-lite." + LOOK_LITE_VER + ".css",
      LOOK_LITE_VER,
    );
  } else {
    appendStylesheet("/css/vc-look-core." + LOOK_CORE_VER + ".css", LOOK_CORE_VER);
  }
  try {
    if (pathNeedsPcHeroCenter()) {
      appendHomeLateStylesheet(
        "/css/vc-pc-hero-center." + PC_HERO_CENTER_VER + ".css",
        PC_HERO_CENTER_VER,
        "vc-pc-hero-center-css",
      );
    }
  } catch (ePcHeroCenter) {}
  appendStylesheet("/css/vc-soft-fx." + SOFT_FX_VER + ".css", SOFT_FX_VER);
}
/* chromeAlignToast1 + toastHug1: sand toast last-wins; host stretto al testo (no 22rem vuoti) */
try {
  var toastSand = document.getElementById("vc-chromeAlignToast1");
  if (!toastSand) {
    toastSand = document.createElement("style");
    toastSand.id = "vc-chromeAlignToast1";
    (document.head || document.documentElement).appendChild(toastSand);
  }
  toastSand.setAttribute("data-vc", "20261019toastLayout1");
  toastSand.textContent =
    ".vc-dash-save-toast-host,.vc-site-toast-host,.vc-staff-toast-host,.vc-wt-toast-host,.vc-cpf-toast-host,#vc-site-toast-host,#vc-staff-toast-host,#vc-wt-toast-host,#vc-custom-profile-toast-host,#vc-profile-extras-toast-host{" +
    "position:fixed!important;left:50%!important;right:auto!important;transform:translateX(-50%)!important;" +
    "width:max-content!important;min-width:0!important;max-width:min(92vw,calc(100vw - 1.5rem))!important;" +
    "display:flex!important;justify-content:center!important;align-items:center!important;margin:0!important;padding:0!important}" +
    ".vc-dash-save-toast,.vc-site-toast,[data-vc-boot-load-toast],.vc-site-toast-host .vc-dash-save-toast,#vc-site-toast-host .vc-dash-save-toast,#vc-site-toast-host [data-vc-boot-load-toast]{" +
    "display:flex!important;flex-direction:row!important;align-items:center!important;gap:.65rem!important;" +
    "width:max-content!important;min-width:0!important;max-width:min(92vw,calc(100vw - 1.5rem))!important;" +
    "padding:.7rem .95rem!important;border-radius:.95rem!important;box-sizing:border-box!important;" +
    "border:1px solid rgba(236,205,176,.45)!important;background:linear-gradient(145deg,#17130f,#100c09)!important;" +
    "box-shadow:0 12px 36px rgba(0,0,0,.5),0 0 0 1px rgba(255,247,236,.12)!important}" +
    ".vc-dash-save-toast.is-error,.vc-site-toast.is-error,#vc-site-toast-host .vc-dash-save-toast.is-error{border-color:rgba(248,113,113,.45)!important;background:linear-gradient(145deg,rgba(36,16,16,.96),rgba(48,18,18,.92))!important}" +
    ".vc-dash-save-toast__icon,.vc-site-toast__icon,#vc-site-toast-host .vc-dash-save-toast__icon,.vc-dash-save-toast.is-pending .vc-dash-save-toast__icon{" +
    "flex-shrink:0!important;display:grid!important;place-items:center!important;width:1.85rem!important;height:1.85rem!important;" +
    "border-radius:.5rem!important;background:linear-gradient(180deg,#eccdb0,#6f4e37)!important;color:#fff!important;font-size:.85rem!important}" +
    ".vc-dash-save-toast.is-error .vc-dash-save-toast__icon,#vc-site-toast-host .vc-dash-save-toast.is-error .vc-dash-save-toast__icon{background:linear-gradient(180deg,#f87171,#b91c1c)!important}" +
    ".vc-dash-save-toast__text,.vc-site-toast__text,#vc-site-toast-host .vc-dash-save-toast__text{" +
    "margin:0!important;color:rgba(255,247,236,.94)!important;font-size:.88rem!important;font-weight:700!important;white-space:nowrap!important;line-height:1.25!important}";
  try {
    (document.head || document.documentElement).appendChild(toastSand);
  } catch (eToastPin0) {}
} catch (eToastSand) {}
/* interOnly1: last-wins Inter su brand/titoli (batte page-home/page-bundle Cormorant) */
try {
  var metalTit = document.getElementById("vc-interOnly1");
  if (!metalTit) {
    metalTit = document.createElement("style");
    metalTit.id = "vc-interOnly1";
    (document.head || document.documentElement).appendChild(metalTit);
  }
  try {
    var oldMetal = document.getElementById("vc-metalTitlesAll1");
    if (oldMetal && oldMetal.parentNode) oldMetal.parentNode.removeChild(oldMetal);
  } catch (eRmOld) {}
  metalTit.setAttribute("data-vc", "20261016interOnly1");
  metalTit.textContent =
    'html.vc-site-polish body.vc-body .vc-brand-glow,html.vc-site-polish body.vc-body h1.vc-brand-glow,' +
    "html.vc-site-polish body.vc-body .vc-page-cine-hero .vc-brand-glow,html.vc-site-polish body.vc-body .vc-support-page-hero .vc-brand-glow," +
    "html.vc-site-polish body.vc-body .vc-support-intro-shell .vc-brand-glow,html.vc-site-polish body.vc-body .vc-home-cine-hero .vc-brand-glow," +
    "html.vc-site-polish body.vc-body .vc-home-cine-hero h1,html.vc-site-polish body.vc-body main h1," +
    "html.vc-site-polish body.vc-body main h2,html.vc-site-polish body.vc-body .vc-page-cine-title," +
    "html.vc-site-polish body.vc-body .vc-cmd-heading,html.vc-site-polish body.vc-body .vc-home-deck__title," +
    "html.vc-site-polish body.vc-body .vc-home-feature__title,html.vc-site-polish body.vc-body .vc-home-index__title," +
    "html.vc-site-polish body.vc-body .vc-reviews-section__title,html.vc-site-polish body.vc-body .vc-premium-footer__wordmark," +
    "html.vc-site-polish body.vc-body .vc-hero-brand-pre,html.vc-site-polish body.vc-body .vc-hero-brand-caffe," +
    "html.vc-site-polish body.vc-body .vc-brand-glow span" +
    '{font-family:"Inter",ui-sans-serif,system-ui,sans-serif!important}';
  try {
    (document.head || document.documentElement).appendChild(metalTit);
  } catch (eMetalPin0) {}
} catch (eMetalTit) {}
/* routeGate1: sticky solo legal/tickets (toc / sticky bar) */
try {
  if (pathNeedsStickyChrome()) {
    appendStylesheet("/css/vc-sticky-chrome." + STICKY_CHROME_VER + ".css", STICKY_CHROME_VER);
    appendScript("/js/vc-sticky-chrome." + STICKY_CHROME_VER + ".js", STICKY_CHROME_VER);
  }
} catch (eSticky) {}
/* cssCleanShell1: un solo vc-shell al posto di polish/chrome-ui/nav/glow */
try {
  injectVcShellCss();
} catch (eShellInj) {}

/* pcHeroCenterInjectLate */
try {
  if (pathNeedsPcHeroCenter()) {
    var _pcVer =
      typeof PC_HERO_CENTER_VER !== "undefined" ? PC_HERO_CENTER_VER : "20261015pcHeroCenter5";
    appendHomeLateStylesheet(
      "/css/vc-pc-hero-center." + _pcVer + ".css",
      _pcVer,
      "vc-pc-hero-center-css",
    );
  }
} catch (ePcHeroLate) {}

/* themeSwitchFix2 + homeBootFast1: home post-sipario */
appendHomeLateStylesheet(
  "/css/vc-theme-switch." + THEME_SWITCH_VER + ".css",
  THEME_SWITCH_VER,
  "vc-theme-switch-css",
);
 /* homeCssLikeFb1 / cssLikeFeedback3: page-bundle SOLO se manca CSS scoped (home/404).
    Fase1: legal/cine/tickets/bacheca/staff/dashboard/serata → scoped, zero mega-bundle.
    Home: + page-home last-wins solo hero. KILL landing-ext/tw/core. */
 try {
  try {
    ensureThemeLightOnlyIfLight();
  } catch (eKitMin) {}
  var _pathHome = false;
  try {
    var _pp = String(location.pathname || "/").replace(/\/+$/, "") || "/";
    _pathHome = _pp === "/" || _pp === "/index.html";
  } catch (ePathHome) {}
  var _scopedPage = false;
  try {
    _scopedPage = pageHasScopedPageCss();
  } catch (eSc0) {
    _scopedPage = false;
  }
  var _hasHome = document.querySelector('link[href*="vc-page-home"]');
  try {
    document
      .querySelectorAll(
        'link[href*="vc-landing-ext"],link[href*="landing-ext"],link[href*="vc-landing-core"],link[href*="tw-build"],link[href*="vc-chrome"],link[href*="vc-page-home"],link#vc-page-home-css,link[href*="page-bundle"],link#vc-page-bundle-css'
      )
      .forEach(function (l) {
        try {
          var h = String(l.href || l.getAttribute("href") || "");
          if (/landing-ext|landing-core|tw-build|page-bundle|vc-page-bundle/.test(h)) {
            if (l.parentNode) l.parentNode.removeChild(l);
            return;
          }
          if (!_pathHome && /vc-page-home/.test(h)) {
            if (l.parentNode) l.parentNode.removeChild(l);
            _hasHome = null;
            return;
          }
          if (
            /vc-chrome(?:\.[^/]+)?\.css/.test(h) &&
            !/chrome-polish|chrome-pill|chrome-ui|site-chrome|nav-chrome/.test(h)
          ) {
            if (l.parentNode) l.parentNode.removeChild(l);
          }
        } catch (eRmBad) {}
      });
  } catch (eStripBad) {}
  /* legalChromeImport1: pin + import slice; scrub mega-bundle su legal */
  try {
    if (pathIsLegalFamily()) {
      ensureLegalLookCore();
      ensureLegalChromeImport();
      pinLegalChromeParity();
      [0, 400, 1200].forEach(function (ms) {
        window.setTimeout(function () {
          ensureLegalChromeImport();
          pinLegalChromeParity();
        }, ms);
      });
      try {
        document.addEventListener(
          "vc:soft-fx-ready",
          function () {
            ensureLegalChromeImport();
            pinLegalChromeParity();
          },
          { once: true },
        );
      } catch (eSoftPin) {}
    }
  } catch (eLegArm) {}
  /* splitBundle1: site-chrome lock; mega-bundle out */
  try {
    ensureSiteChromeCss();
  } catch (eScLate) {}
  try {
    ensureGlowFormCss();
  } catch (eGlowLate) {}

try {
  /* glowFormSandPin2SoftArm: ripin glow dopo soft-fx/look deferred.
     homePerfIdle1: su home sotto fx-flat un solo ensure (già sopra) — no storm remount. */
  var __homeGlowLite = false;
  try {
    var __gp = String(location.pathname || "/").replace(/\/+$/, "") || "/";
    __homeGlowLite = __gp === "/" || __gp === "/index.html";
  } catch (eGlowHome) {}
  if (!__homeGlowLite) {
    document.addEventListener(
      "vc:soft-fx-ready",
      function () {
        try { ensureGlowFormCss(); } catch (e1) {}
      },
      { once: true },
    );
    window.setTimeout(function () {
      try { ensureGlowFormCss(); } catch (e2) {}
    }, 0);
    window.setTimeout(function () {
      try { ensureGlowFormCss(); } catch (e3) {}
    }, 1200);
  }
} catch (eGlowArm) {}

  _hasBundle =
    document.getElementById("vc-site-chrome-css") ||
    document.querySelector('link[href*="vc-site-chrome"]');
  /* pageCriticalAll1: pin defer on scoped page CSS already in DOM */
  try {
    var PAGE_CRIT_PIN = [
      {
        pageId: "vc-page-cine-public-css",
        pageNeedle: "vc-page-cine-public",
        critId: "vc-cine-public-critical-css",
        critStem: "vc-cine-public-critical.css",
        pageStem: "vc-page-cine-public.css",
        pageVerFb: "20261021lookStaticBorder1",
        readyClass: "vc-cine-public-critical-ready",
        readyAttr: "data-vc-cine-public-critical",
      },
      {
        pageId: "vc-page-bacheca-css",
        pageNeedle: "vc-page-bacheca",
        critId: "vc-bacheca-critical-css",
        critStem: "vc-bacheca-critical.css",
        pageStem: "vc-page-bacheca.css",
        pageVerFb: "20261021lookSafePerf1",
        readyClass: "vc-bacheca-critical-ready",
        readyAttr: "data-vc-bacheca-critical",
      },
      {
        pageId: "vc-page-staff-css",
        pageNeedle: "vc-page-staff",
        critId: "vc-staff-critical-css",
        critStem: "vc-staff-critical.css",
        pageStem: "vc-page-staff.css",
        pageVerFb: "20261021lookSafePerf1",
        readyClass: "vc-staff-critical-ready",
        readyAttr: "data-vc-staff-critical",
      },
      {
        pageId: "vc-page-dashboard-css",
        pageNeedle: "vc-page-dashboard",
        critId: "vc-dashboard-critical-css",
        critStem: "vc-dashboard-critical.css",
        pageStem: "vc-page-dashboard.css",
        pageVerFb: "20261021lookSafePerf1",
        readyClass: "vc-dashboard-critical-ready",
        readyAttr: "data-vc-dashboard-critical",
      },
      {
        pageId: "vc-page-misc-css",
        pageNeedle: "vc-page-misc",
        critId: "vc-misc-critical-css",
        critStem: "vc-misc-critical.css",
        pageStem: "vc-page-misc.css",
        pageVerFb: "20261020megaCssAll1e",
        readyClass: "vc-misc-critical-ready",
        readyAttr: "data-vc-misc-critical",
      },
      {
        pageId: "vc-page-profile-css",
        pageNeedle: "vc-page-profile",
        critId: "vc-profile-critical-css",
        critStem: "vc-profile-critical.css",
        pageStem: "vc-page-profile.css",
        pageVerFb: "20261020megaCssAll1e",
        readyClass: "vc-profile-critical-ready",
        readyAttr: "data-vc-profile-critical",
      },
    ];
    for (var pci = 0; pci < PAGE_CRIT_PIN.length; pci++) {
      var pc = PAGE_CRIT_PIN[pci];
      var pageNode =
        document.getElementById(pc.pageId) ||
        document.querySelector('link[href*="' + pc.pageNeedle + '"]');
      if (!pageNode) continue;
      try {
        document.documentElement.classList.add(pc.readyClass);
        document.documentElement.setAttribute(pc.readyAttr, "1");
      } catch (ePcR) {}
      /* cssMerge1: NON iniettare *-critical — page-* già contiene ~90% critical.
         Solo legal tiene critical (sipario gate). */
      try {
        var critKill =
          document.getElementById(pc.critId) ||
          document.querySelector('link[href*="' + pc.critStem.replace(".css", "") + '"]');
        if (critKill && critKill.parentNode) {
          critKill.parentNode.removeChild(critKill);
        }
      } catch (eCritKill) {}
      try {
        pageNode.id = pageNode.id || pc.pageId;
        /* pageDeferRepinFix2: never print-defer scoped page-* */
        pageNode.media = "all";
        pageNode.removeAttribute("data-vc-defer-css");
        pageNode.setAttribute("data-vc", "cssMerge1");
      } catch (ePcPin) {}
    }
  } catch (ePageCritAll) {}
  /* cssMerge1 + pagePerfAll1: light shell → solo page-misc (no cine, no misc-critical) */
  if (pathIsLightShell()) {
    try {
      scrubCssLinksByHrefRe(
        /vc-page-cine-public|vc-cine-public-critical|vc-misc-critical/i
      );
      try {
        document.documentElement.classList.remove("vc-cine-public-critical-ready");
        document.documentElement.removeAttribute("data-vc-cine-public-critical");
        document.documentElement.classList.add("vc-misc-critical-ready");
        document.documentElement.setAttribute("data-vc-misc-critical", "1");
      } catch (eLightPrime) {}
      var miscPage =
        document.getElementById("vc-page-misc-css") ||
        document.querySelector('link[href*="vc-page-misc"]');
      if (!miscPage) {
        var mp = document.createElement("link");
        mp.rel = "stylesheet";
        mp.id = "vc-page-misc-css";
        var mpVer = vcAssetVer("vc-page-misc.css", "20261021lookStaticBorder1");
        mp.href = "/css/vc-page-misc." + mpVer + ".css?v=" + mpVer;
        mp.media = "all";
        mp.setAttribute("data-vc", "cssMerge1");
        (document.head || document.documentElement).appendChild(mp);
      }
    } catch (eLightShell) {}
  }
  /* pagePerfAll1: /dashboard → no dual staff critical+page (~1.1MB) */
  if (pathIsDashboardFamily()) {
    try {
      scrubCssLinksByHrefRe(/vc-page-staff|vc-staff-critical/i);
      try {
        document.documentElement.classList.remove("vc-staff-critical-ready");
        document.documentElement.removeAttribute("data-vc-staff-critical");
      } catch (eRmStaff) {}
    } catch (eDashStaff) {}
  }
  /* profileCssFix1: /user deve avere page-profile (+ staff-pause), mai cine-public */
  if (pathIsUserProfileFamily()) {
    try {
      scrubCssLinksByHrefRe(/vc-page-cine-public|vc-cine-public-critical/i);
      try {
        document.documentElement.classList.remove(
          "vc-cine-public-critical-ready",
        );
        document.documentElement.removeAttribute("data-vc-cine-public-critical");
      } catch (eRmCine) {}
      try {
        document.documentElement.classList.add("vc-profile-critical-ready");
        document.documentElement.setAttribute("data-vc-profile-critical", "1");
      } catch (eProfPrime) {}
      var ppExist =
        document.getElementById("vc-page-profile-css") ||
        document.querySelector('link[href*="vc-page-profile"]');
      if (!ppExist) {
        var pp = document.createElement("link");
        pp.rel = "stylesheet";
        pp.id = "vc-page-profile-css";
        var ppVer = vcAssetVer("vc-page-profile.css", "20261020megaCssAll1e");
        pp.href = "/css/vc-page-profile." + ppVer + ".css?v=" + ppVer;
        pp.media = "all";
        pp.setAttribute("data-vc", "profileCssFix1");
        (document.head || document.documentElement).appendChild(pp);
      } else {
        try {
          ppExist.id = ppExist.id || "vc-page-profile-css";
          ppExist.media = "all";
          ppExist.removeAttribute("data-vc-defer-css");
          ppExist.setAttribute("data-vc", "profileCssFix1");
        } catch (ePpPin) {}
      }
      /* staff-pause: card Sanzioni (.vc-staff-profile-mod-grid) — early, no race first paint */
      if (!document.querySelector('link[href*="staff-pause"]')) {
        var sp = document.createElement("link");
        sp.rel = "stylesheet";
        sp.id = "vc-staff-pause-css";
        sp.href = "/css/staff-pause.css?v=20261021lookStaticBorder1";
        sp.media = "all";
        sp.setAttribute("data-vc-staff-prof-css", "1");
        sp.setAttribute("data-vc", "profileCssFix1");
        (document.head || document.documentElement).appendChild(sp);
      }
    } catch (eProfCss) {}
  }
  if (pathIsTicketsFamily()) {
    try {
      /* cssMerge1: solo page-tickets (no tickets-critical dual) */
      try {
        document.documentElement.classList.add("vc-tickets-critical-ready");
        document.documentElement.setAttribute("data-vc-tickets-critical", "1");
      } catch (eTkPrime) {}
      scrubCssLinksByHrefRe(/vc-tickets-critical/i);
      var ptExist =
        document.getElementById("vc-page-tickets-css") ||
        document.querySelector('link[href*="vc-page-tickets"]');
      if (!ptExist) {
        var pt = document.createElement("link");
        pt.rel = "stylesheet";
        pt.id = "vc-page-tickets-css";
        var ptVer = vcAssetVer("vc-page-tickets.css", "20261021lookStaticBorder1");
        pt.href = "/css/vc-page-tickets." + ptVer + ".css?v=" + ptVer;
        pt.media = "all";
        pt.setAttribute("data-vc", "cssMerge1");
        (document.head || document.documentElement).appendChild(pt);
      } else {
        try {
          ptExist.id = ptExist.id || "vc-page-tickets-css";
          ptExist.media = "all";
          ptExist.removeAttribute("data-vc-defer-css");
          ptExist.setAttribute("data-vc", "cssMerge1");
        } catch (ePtPin) {}
      }
    } catch (eTkDef) {}
  }
  if (pathIsLegalFamily()) {
    try {
      ensureLegalChromeImport();
      pinLegalChromeParity();
    } catch (eLegKeep) {}
    try {
      /* legalDefer1: critical early; full page-legal post-curtain */
      try {
        document.documentElement.classList.add("vc-legal-critical-ready");
        document.documentElement.setAttribute("data-vc-legal-critical", "1");
      } catch (ePrime) {}
      var lcExist =
        document.getElementById("vc-legal-critical-css") ||
        document.querySelector('link[href*="vc-legal-critical"]');
      if (!lcExist) {
        var lc = document.createElement("link");
        lc.rel = "stylesheet";
        lc.id = "vc-legal-critical-css";
        var lcVer = vcAssetVer("vc-legal-critical.css", "20261021siparioBorderPin1");
        lc.href = "/css/vc-legal-critical." + lcVer + ".css?v=" + lcVer;
        lc.media = "all";
        lc.setAttribute("data-vc", "legalDefer1");
        (document.head || document.documentElement).appendChild(lc);
      } else {
        try {
          lcExist.id = lcExist.id || "vc-legal-critical-css";
        } catch (eLcId) {}
      }
      var plExist =
        document.getElementById("vc-page-legal-css") ||
        document.querySelector('link[href*="vc-page-legal"]');
      if (!plExist) {
        var pl = document.createElement("link");
        pl.rel = "stylesheet";
        pl.id = "vc-page-legal-css";
        var plVer = vcAssetVer("vc-page-legal.css", "20261021lookStaticBorder1");
        pl.href = "/css/vc-page-legal." + plVer + ".css?v=" + plVer;
        /* pageDeferRepinFix1: sync media=all — legal critical ~27 rules = pagina nuda */
        pl.media = "all";
        pl.setAttribute("data-vc", "pageDeferRepinFix1");
        (document.head || document.documentElement).appendChild(pl);
      } else {
        try {
          plExist.id = plExist.id || "vc-page-legal-css";
          plExist.media = "all";
          plExist.removeAttribute("data-vc-defer-css");
          plExist.setAttribute("data-vc", "pageDeferRepinFix1");
        } catch (ePlPin) {}
      }
    } catch (eLegDef) {}
  }
  if (pageHasScopedPageCss() || pathIsLegalFamily()) {
    scrubScopedParallelCss();
  }
  /* cssCleanShell1: wt-layout già in vc-page-tickets — no dual su scoped */
  try {
    var _ppWt = String(location.pathname || "/").replace(/\/+$/, "") || "/";
    var _needWt =
      !_scopedPage &&
      (_ppWt === "/tickets" ||
        _ppWt.indexOf("/tickets/") === 0 ||
        (document.body && document.body.classList && document.body.classList.contains("vc-web-tickets-page")));
    if (_needWt) {
      appendStylesheet(
        "/css/vc-wt-layout." + WT_LAYOUT_VER + ".css",
        WT_LAYOUT_VER
      );
    }
  } catch (eWtLay) {}
  if (_pathHome) {
    try {
      /* cssMerge1: solo page-home (no home-critical dual ~172KB) */
      try {
        document.documentElement.classList.add("vc-home-critical-ready");
        document.documentElement.setAttribute("data-vc-home-critical", "1");
      } catch (eHomePrime) {}
      scrubCssLinksByHrefRe(/vc-home-critical/i);
      var phExist =
        document.getElementById("vc-page-home-css") ||
        document.querySelector('link[href*="vc-page-home"]');
      if (!phExist) {
        var ph = document.createElement("link");
        ph.rel = "stylesheet";
        ph.id = "vc-page-home-css";
        var phVer = vcAssetVer("vc-page-home.css", "20261021lookStaticBorder1");
        ph.href = "/css/vc-page-home." + phVer + ".css?v=" + phVer;
        ph.media = "all";
        ph.setAttribute("data-vc", "cssMerge1");
        (document.head || document.documentElement).appendChild(ph);
        _hasHome = ph;
      } else {
        try {
          phExist.id = phExist.id || "vc-page-home-css";
          phExist.media = "all";
          phExist.removeAttribute("data-vc-defer-css");
          phExist.setAttribute("data-vc", "footerConicKill1");
          /* footerConicKill1: upgrade dirty siteCssCov stamps → lookStatic (no conic) */
          var phWant = vcAssetVer("vc-page-home.css", "20261021lookStaticBorder1");
          var phHref = String(phExist.getAttribute("href") || "");
          if (!/lookStaticBorder1|footerConicKill1/i.test(phHref)) {
            phExist.setAttribute(
              "href",
              "/css/vc-page-home." + phWant + ".css?v=" + phWant
            );
          }
        } catch (eMovePh) {}
        _hasHome = phExist;
      }
    } catch (ePh) {}
  }
  /* homeChromeGap4: gap SEMPRE (anche con page-home) — promo + account popover */
  {
    /* base promo+account (anche con bundle — feedback lo ha nel bundle, gap last-wins ok) */
    var gapExist = document.getElementById("vc-chrome-gap1-css");
      if (gapExist && gapExist.getAttribute("data-vc") !== "chromeOwnerUnify1") {
      try {
        if (gapExist.parentNode) gapExist.parentNode.removeChild(gapExist);
      } catch (eGapRm) {}
      gapExist = null;
    }
    if (!gapExist) {
      var gapSt = document.createElement("style");
      gapSt.id = "vc-chrome-gap1-css";
      gapSt.setAttribute("data-vc", "chromeOwnerUnify1");
      gapSt.textContent =
        "html body.vc-body .vc-header-promo-btn,html body.vc-body .vc-header-promo-btn:visited," +
        "html body.vc-body #header-quick-actions #vc-header-promo-btn," +
        "html body.vc-body #header-quick-actions #vc-header-promo-btn:visited{" +
        "display:inline-flex!important;align-items:center!important;gap:.42rem!important;" +
        "width:auto!important;max-width:8.75rem!important;min-width:0!important;flex:0 1 auto!important;" +
        "padding:.32rem .4rem .32rem .5rem!important;border-radius:9999px!important;" +
        "border:1px solid rgba(212,168,136,.34)!important;text-decoration:none!important;" +
        "font-size:.7rem!important;font-weight:700!important;letter-spacing:.08em!important;" +
        "text-transform:uppercase!important;line-height:1!important;white-space:nowrap!important;" +
        "overflow:hidden!important;box-sizing:border-box!important}" +
        "html body.vc-body .vc-header-promo-btn__dot," +
        "html body.vc-body #header-quick-actions #vc-header-promo-btn .vc-header-promo-btn__dot{" +
        "width:.42rem!important;height:.42rem!important;border-radius:50%!important;flex-shrink:0!important}" +
        "html body.vc-body .vc-header-promo-btn__label,html body.vc-body .vc-header-promo-btn__badge," +
        "html body.vc-body #header-quick-actions #vc-header-promo-btn .vc-header-promo-btn__label," +
        "html body.vc-body #header-quick-actions #vc-header-promo-btn .vc-header-promo-btn__badge{" +
        "display:inline-flex!important;align-items:center!important;min-width:0!important}" +
        "html body.vc-body .discord-account-menu{position:relative!important;list-style:none!important}" +
        "html body.vc-body .discord-account-popover,html body.vc-body header .discord-account-popover{" +
        "position:absolute!important;right:-.2rem!important;top:calc(100% + .75rem)!important;z-index:70!important;" +
        "width:16.5rem!important;padding:.55rem!important;border-radius:1.2rem!important;" +
        /* chromeOwnerUnify1: layout only — border owned by site-chrome */
        "background-color:#100c09!important;" +
        "box-sizing:border-box!important;list-style:none!important}" +
        "html body.vc-body .discord-account-popover__nav,html body.vc-body header .discord-account-popover__nav{" +
        "display:grid!important;gap:.15rem!important;list-style:none!important;margin:0!important;padding:0!important}" +
        "html body.vc-body .discord-account-popover__item,html body.vc-body header .discord-account-popover__item{" +
        "display:flex!important;width:100%!important;min-height:2.4rem!important;align-items:center!important;" +
        "gap:.65rem!important;padding:0 .75rem!important;border:0!important;border-radius:.8rem!important;" +
        "background:transparent!important;text-decoration:none!important;font-weight:700!important;" +
        "font-size:.9rem!important;box-sizing:border-box!important;list-style:none!important}" +
        "html body.vc-body .discord-account-popover__head,html body.vc-body header .discord-account-popover__head{" +
        "display:flex!important;align-items:center!important;gap:.7rem!important;" +
        "padding:.4rem .5rem .75rem!important;margin-bottom:.3rem!important;" +
        "border-bottom:1px solid rgba(245,214,183,.12)!important}";
      (document.head || document.documentElement).appendChild(gapSt);
    }
    try {
      pinSiteChromeKitLast(SITE_CHROME_KIT_VER);
    } catch (ePinKitGap) {}
  }
 } catch (eChromeGap1) {}
 appendScript("/js/vc-footer-end-breath.js", FOOTER_BREATH_VER);
 try {
  /* homeLookSlim1: home skip-shell OR no shell link → CSS dedicati obbligatori */
  if (
    window.__vcHomeSkipShell ||
    !(window.__vcShellCssInjected || document.getElementById("vc-shell-css"))
  ) {
    appendHomeLateStylesheet(
      "/css/vc-footer-sys-status." + FOOTER_SYS_STATUS_VER + ".css",
      FOOTER_SYS_STATUS_VER,
      "vc-footer-sys-status-css",
    );
  }
  appendScript("/js/vc-footer-sys-status." + FOOTER_SYS_STATUS_VER + ".js", FOOTER_SYS_STATUS_VER);
 } catch (eFooterSys) {}
 try {
  if (window.__vcShellCssInjected || document.getElementById("vc-shell-css")) {
    /* pill CSS already in vc-shell */
  } else {
  /* chromePillFooter1 + homeBootFast1: home = post-sipario */
  /* assetBloatKill1b: stamp diretto (no bare poi force-stamp = 2 GET) */
  appendHomeLateStylesheet(
    "/css/vc-chrome-pill-footer-fix." + CHROME_PILL_FOOTER_VER + ".css",
    CHROME_PILL_FOOTER_VER,
    "vc-chrome-pill-footer-fix-css",
  );
  try {
    var pillLinks = document.querySelectorAll('link[href*="vc-chrome-pill-footer-fix"]');
    var homePill = typeof vcPathIsHome === "function" && vcPathIsHome();
    for (var pi = 0; pi < pillLinks.length; pi++) {
      try {
        if (!pillLinks[pi].id) pillLinks[pi].id = "vc-chrome-pill-footer-fix-css";
        if (homePill) {
          pillLinks[pi].media = "print";
          pillLinks[pi].setAttribute("data-vc-defer-css", "post-curtain");
        }
      } catch (ePillHref) {}
    }
  } catch (ePillForce) {}
  } /* cssCleanShell1: pill già in vc-shell */
  /* sepVisible1: nuclear last-wins — snav + footer + role/sponsor/list seps visibili.
     (sepEverywhere4: gradient asse sbagliato + shadow none = invisibili) */
  try {
    ["vc-sepEverywhere4", "vc-sepVisible1", "vc-sepVisible2"].forEach(function (oid) {
      try {
        var oldSep = document.getElementById(oid);
        if (oldSep && oldSep.parentNode) oldSep.parentNode.removeChild(oldSep);
      } catch (eOld) {}
    });
    var sepSt = document.getElementById("vc-sepSlim1");
    if (!sepSt) {
      sepSt = document.createElement("style");
      sepSt.id = "vc-sepSlim1";
      (document.head || document.documentElement).appendChild(sepSt);
    }
    sepSt.setAttribute("data-vc", "20261017sepStretchGrad2");
    sepSt.id = "vc-sepSlim1";
    /* sepStretchGrad2: + batte theme-light :not(.vc-soft-fx-off) su legal/snav */
    var sepV =
      "linear-gradient(180deg,rgba(111,78,55,0) 0%,rgba(111,78,55,.55) 22%,rgba(168,118,82,.92) 50%,rgba(111,78,55,.55) 78%,rgba(111,78,55,0) 100%)";
    var sepH =
      "linear-gradient(90deg,rgba(111,78,55,0) 0%,rgba(111,78,55,.55) 22%,rgba(168,118,82,.92) 50%,rgba(111,78,55,.55) 78%,rgba(111,78,55,0) 100%)";
    /* solo elementi (snav/legal/tabs) — NON ::before griglia (altezza diversa) */
    var vSel =
      "html.vc-site-polish body.vc-body .vc-snav-sep," +
      "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body .vc-snav-sep," +
      "html.vc-site-polish body.vc-body header .vc-snav-sep," +
      "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body header .vc-snav-sep," +
      "html.vc-site-polish body.vc-body header .vc-header-snav > .vc-snav-sep," +
      "html.vc-site-photo-bg.vc-perf-mid.vc-site-polish:not(.vc-soft-fx-off) body.vc-body header .vc-snav-sep," +
      "html body.vc-body header .vc-snav-sep," +
      "html.vc-site-polish[data-vc-theme=\"light\"] body.vc-body header .vc-snav-sep," +
      "html.vc-site-polish[data-vc-theme=\"light\"]:not(.vc-soft-fx-off) body.vc-body header .vc-snav-sep," +
      "html.vc-site-polish[data-vc-theme=\"light\"]:not(.vc-soft-fx-off) body.vc-body header .vc-header-snav > .vc-snav-sep," +
      "html[data-vc-theme=\"light\"] body.vc-body header .vc-snav-sep," +
      "html.vc-site-polish body.vc-body > footer.vc-premium-footer .vc-premium-footer__legal nav > span," +
      "html.vc-site-polish body.vc-body > footer.vc-premium-footer .vc-premium-footer__legal nav > span[aria-hidden]," +
      "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body > footer.vc-premium-footer .vc-premium-footer__legal nav > span," +
      "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body > footer.vc-premium-footer .vc-premium-footer__legal nav > span[aria-hidden]," +
      "html.vc-site-polish[data-vc-theme=\"light\"] body.vc-body > footer.vc-premium-footer .vc-premium-footer__legal nav > span," +
      "html.vc-site-polish[data-vc-theme=\"light\"] body.vc-body > footer.vc-premium-footer .vc-premium-footer__legal nav > span[aria-hidden]," +
      "html.vc-site-polish[data-vc-theme=\"light\"]:not(.vc-soft-fx-off) body.vc-body > footer.vc-premium-footer .vc-premium-footer__legal nav > span," +
      "html.vc-site-polish[data-vc-theme=\"light\"]:not(.vc-soft-fx-off) body.vc-body > footer.vc-premium-footer .vc-premium-footer__legal nav > span[aria-hidden]," +
      "html body.vc-body > footer.vc-premium-footer .vc-premium-footer__legal nav > span," +
      "html.vc-site-polish body.vc-sponsor-page .vc-sponsor-line__sep," +
      "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-sponsor-page .vc-sponsor-line__sep," +
      "html body.vc-sponsor-page .vc-sponsor-line__sep," +
      "html.vc-site-polish body.vc-body.vc-rank-customize-page #vc-personalizza-root .vc-pers-hub__tabs-sep," +
      "html body.vc-body.vc-rank-customize-page #vc-personalizza-root .vc-pers-hub__tabs-sep," +
      "html.vc-site-polish body.vc-body .vc-appelli-mode__sep";
    var hEl =
      "html.vc-site-polish body.vc-body .vc-role-card-sep," +
      "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body .vc-role-card-sep," +
      "html.vc-site-polish body.vc-body .vc-perks-verify-guide__divider," +
      "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body .vc-perks-verify-guide__divider";
    var hBefore =
      "html.vc-site-polish body.vc-body .vc-roles-hero-guide__sep::before," +
      "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body .vc-roles-hero-guide__sep::before," +
      "html.vc-site-polish body.vc-body .vc-boards-feat__sep::before," +
      "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body .vc-boards-feat__sep::before," +
      "html.vc-site-polish body.vc-body > footer.vc-premium-footer .vc-premium-footer__legal::before";
    sepSt.textContent =
      "html.vc-site-polish,html.vc-site-polish body.vc-body,html body.vc-body," +
      "html.vc-site-polish[data-vc-theme=\"light\"],html[data-vc-theme=\"light\"] body.vc-body" +
      "{--vc-sep-v:" +
      sepV +
      ";--vc-sep-h:" +
      sepH +
      ";--vc-sep-glow:none}" +
      vSel +
      "{display:block!important;flex:0 0 1px!important;flex-shrink:0!important;align-self:stretch!important;" +
      "width:1px!important;min-width:1px!important;max-width:1px!important;" +
      "height:auto!important;min-height:.85rem!important;max-height:none!important;" +
      "margin:.28em .45rem!important;padding:0!important;border:0!important;border-radius:999px!important;" +
      "box-sizing:border-box!important;color:transparent!important;font-size:inherit!important;line-height:0!important;" +
      "overflow:visible!important;text-indent:-999px!important;background-color:transparent!important;" +
      "background-image:" +
      sepV +
      "!important;background:" +
      sepV +
      "!important;-webkit-mask-image:none!important;mask-image:none!important;" +
      "box-shadow:none!important;filter:none!important;opacity:1!important;visibility:visible!important}" +
      /* statSepAlign2: stesso gutter idle/open + sep a -marginL (centro) */
      "html.vc-site-polish body.vc-body #stats .vc-stat-cell," +
      "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body #stats .vc-stat-cell," +
      "html body.vc-body--home #stats .vc-stat-cell," +
      "html.vc-site-polish body.vc-body #stats .vc-stat-cell[class*=\"-open\"]," +
      "html body.vc-body--home #stats .vc-stat-cell[class*=\"-open\"]" +
      "{box-sizing:border-box!important;margin:0.28rem 0.42rem!important;border-radius:1rem!important;" +
      "border-top-left-radius:1rem!important;border-top-right-radius:1rem!important;" +
      "border-bottom-left-radius:1rem!important;border-bottom-right-radius:1rem!important}" +
      "html.vc-site-polish body.vc-body #stats .vc-stat-cell + .vc-stat-cell::before," +
      "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body #stats .vc-stat-cell + .vc-stat-cell::before," +
      "html.vc-site-polish[data-vc-theme=\"light\"]:not(.vc-soft-fx-off) body.vc-body #stats .vc-stat-cell + .vc-stat-cell::before" +
      '{content:""!important;display:block!important;position:absolute!important;left:-0.42rem!important;right:auto!important;' +
      "top:14%!important;bottom:14%!important;width:1px!important;min-width:1px!important;max-width:1px!important;" +
      "height:auto!important;min-height:0!important;max-height:none!important;margin:0!important;padding:0!important;" +
      "transform:translateX(-50%)!important;border:0!important;border-radius:999px!important;z-index:3!important;" +
      "background-image:" +
      sepV +
      "!important;background:" +
      sepV +
      "!important;-webkit-mask-image:none!important;mask-image:none!important;box-shadow:none!important;" +
      "filter:none!important;opacity:1!important;visibility:visible!important}" +
      "html.vc-site-polish body.vc-body .vc-home-deck__cell + .vc-home-deck__cell::before," +
      "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body .vc-home-deck__cell + .vc-home-deck__cell::before," +
      "html.vc-site-polish body.vc-body .vc-home-index__col + .vc-home-index__col::before," +
      "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body .vc-home-index__col + .vc-home-index__col::before," +
      "html.vc-site-polish body.vc-body footer.vc-premium-footer .vc-premium-footer__navcols > .vc-premium-footer__col + .vc-premium-footer__col::before," +
      "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body footer.vc-premium-footer .vc-premium-footer__navcols > .vc-premium-footer__col + .vc-premium-footer__col::before" +
      '{content:""!important;display:block!important;position:absolute!important;left:0!important;right:auto!important;' +
      "top:10%!important;bottom:10%!important;width:1px!important;min-width:1px!important;max-width:1px!important;" +
      "height:auto!important;min-height:0!important;max-height:none!important;margin:0!important;padding:0!important;" +
      "transform:translateX(-50%)!important;border:0!important;border-radius:999px!important;" +
      "background-image:" +
      sepV +
      "!important;background:" +
      sepV +
      "!important;-webkit-mask-image:none!important;mask-image:none!important;box-shadow:none!important;" +
      "filter:none!important;opacity:1!important;visibility:visible!important}" +
      "html.vc-site-polish body.vc-body .vc-roles-hero-guide__sep,html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body .vc-roles-hero-guide__sep," +
      "html.vc-site-polish body.vc-body .vc-boards-feat__sep,html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body .vc-boards-feat__sep" +
      "{position:relative!important;height:1px!important;min-height:1px!important;border:0!important;border-top:0!important;background:none!important;box-shadow:none!important}" +
      hBefore +
      '{content:""!important;display:block!important;height:1px!important;min-height:1px!important;max-height:1px!important;' +
      "width:84%!important;max-width:84%!important;margin:0 auto!important;padding:0!important;border:0!important;border-radius:999px!important;" +
      "background-color:transparent!important;background-image:" +
      sepH +
      "!important;background:" +
      sepH +
      "!important;-webkit-mask-image:none!important;mask-image:none!important;" +
      "box-shadow:none!important;filter:none!important;opacity:1!important}" +
      hEl +
      "{display:block!important;height:1px!important;min-height:1px!important;max-height:1px!important;width:84%!important;" +
      "max-width:84%!important;margin-left:auto!important;margin-right:auto!important;" +
      "border:0!important;border-radius:999px!important;background-color:transparent!important;background-image:" +
      sepH +
      "!important;background:" +
      sepH +
      "!important;box-shadow:none!important;opacity:1!important}" +
      "html.vc-site-polish body.vc-body .vc-roles-hero-guide__sep::before,html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body .vc-roles-hero-guide__sep::before," +
      "html.vc-site-polish body.vc-body .vc-boards-feat__sep::before,html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body .vc-boards-feat__sep::before" +
      "{position:absolute!important;inset:0!important;width:auto!important;pointer-events:none!important}" +
      "html.vc-site-polish body.vc-body main :is(.vc-cmd-grp-list .vc-cmd-item+.vc-cmd-item,.vc-faq-group .vc-faq-item+.vc-faq-item,.vc-regole-list .vc-regole-item+.vc-regole-item)," +
      "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body main :is(.vc-cmd-grp-list .vc-cmd-item+.vc-cmd-item,.vc-faq-group .vc-faq-item+.vc-faq-item,.vc-regole-list .vc-regole-item+.vc-regole-item)" +
      "{position:relative!important;border-top:0!important;border-image:none!important;padding-top:calc(.85rem + 5px)!important}" +
      "html.vc-site-polish body.vc-body main :is(.vc-cmd-grp-list .vc-cmd-item+.vc-cmd-item,.vc-faq-group .vc-faq-item+.vc-faq-item,.vc-regole-list .vc-regole-item+.vc-regole-item)::before," +
      "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body main :is(.vc-cmd-grp-list .vc-cmd-item+.vc-cmd-item,.vc-faq-group .vc-faq-item+.vc-faq-item,.vc-regole-list .vc-regole-item+.vc-regole-item)::before" +
      '{content:""!important;display:block!important;position:absolute!important;left:8%!important;right:8%!important;top:0!important;' +
      "height:1px!important;min-height:1px!important;max-height:1px!important;width:auto!important;border:0!important;border-radius:999px!important;" +
      "pointer-events:none!important;z-index:1!important;background-color:transparent!important;background-image:" +
      sepH +
      "!important;background:" +
      sepH +
      "!important;-webkit-mask-image:none!important;mask-image:none!important;box-shadow:none!important;opacity:1!important}" +
      "html.vc-site-polish body.vc-sponsor-page .vc-sponsor-line__sep,html.vc-site-polish:not(.vc-soft-fx-off) body.vc-sponsor-page .vc-sponsor-line__sep," +
      "html body.vc-sponsor-page .vc-sponsor-line__sep,html.vc-site-polish[data-vc-theme=\"light\"] body.vc-sponsor-page .vc-sponsor-line__sep" +
      "{position:relative!important;display:block!important;width:1px!important;min-width:1px!important;max-width:1px!important;" +
      "align-self:stretch!important;height:auto!important;min-height:.85rem!important;max-height:none!important;" +
      "margin:.28em .45rem!important;color:transparent!important;font-size:inherit!important;line-height:0!important;" +
      "background:none!important;background-image:none!important;overflow:visible!important}" +
      "html.vc-site-polish body.vc-sponsor-page .vc-sponsor-line__sep::after,html.vc-site-polish:not(.vc-soft-fx-off) body.vc-sponsor-page .vc-sponsor-line__sep::after," +
      "html body.vc-sponsor-page .vc-sponsor-line__sep::after" +
      '{content:""!important;display:block!important;position:absolute!important;inset:0!important;width:1px!important;height:100%!important;' +
      "border-radius:999px!important;background-image:" +
      sepV +
      "!important;background:" +
      sepV +
      "!important;-webkit-mask-image:none!important;mask-image:none!important;box-shadow:none!important;" +
      "opacity:1!important;visibility:visible!important;pointer-events:none!important}" +
      "html.vc-site-polish body.vc-body > footer.vc-premium-footer .vc-premium-footer__legal nav," +
      "html body.vc-body > footer.vc-premium-footer .vc-premium-footer__legal nav," +
      "html.vc-site-polish[data-vc-theme=\"light\"]:not(.vc-soft-fx-off) body.vc-body > footer.vc-premium-footer .vc-premium-footer__legal nav" +
      "{display:flex!important;flex-wrap:wrap!important;align-items:stretch!important}" +
      /* snav + footer legal: stretch + gradient (incl. light:not soft-fx-off) */
      "html.vc-site-polish body.vc-body > footer.vc-premium-footer .vc-premium-footer__legal nav > span," +
      "html.vc-site-polish body.vc-body > footer.vc-premium-footer .vc-premium-footer__legal nav > span[aria-hidden]," +
      "html body.vc-body > footer.vc-premium-footer .vc-premium-footer__legal nav > span," +
      "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body > footer.vc-premium-footer .vc-premium-footer__legal nav > span," +
      "html.vc-site-polish[data-vc-theme=\"light\"] body.vc-body > footer.vc-premium-footer .vc-premium-footer__legal nav > span," +
      "html.vc-site-polish[data-vc-theme=\"light\"]:not(.vc-soft-fx-off) body.vc-body > footer.vc-premium-footer .vc-premium-footer__legal nav > span," +
      "html.vc-site-polish[data-vc-theme=\"light\"]:not(.vc-soft-fx-off) body.vc-body > footer.vc-premium-footer .vc-premium-footer__legal nav > span[aria-hidden]," +
      "html.vc-site-polish body.vc-body .vc-snav-sep,html.vc-site-polish body.vc-body header .vc-snav-sep," +
      "html.vc-site-polish body.vc-body header .vc-header-snav > .vc-snav-sep," +
      "html.vc-site-polish[data-vc-theme=\"light\"] body.vc-body header .vc-snav-sep," +
      "html.vc-site-polish[data-vc-theme=\"light\"]:not(.vc-soft-fx-off) body.vc-body header .vc-snav-sep," +
      "html.vc-site-polish[data-vc-theme=\"light\"]:not(.vc-soft-fx-off) body.vc-body header .vc-header-snav > .vc-snav-sep," +
      "html[data-vc-theme=\"light\"] body.vc-body header .vc-snav-sep" +
      "{display:block!important;flex:0 0 1px!important;width:1px!important;min-width:1px!important;max-width:1px!important;" +
      "height:auto!important;min-height:.85rem!important;max-height:none!important;align-self:stretch!important;" +
      "margin:.28em .45rem!important;box-shadow:none!important;background:" +
      sepV +
      "!important;background-image:" +
      sepV +
      "!important;opacity:1!important;visibility:visible!important}" +
      /* indexPhoneGutter1 + sepPhoneFullH1 */
      "@media (max-width:767.98px){" +
      "html.vc-site-polish body.vc-body .vc-home-index,html.vc-site-polish body.vc-body--home .vc-home-index" +
      "{--vc-index-card-inline:1.45rem;overflow:visible!important}" +
      "html.vc-site-polish body.vc-body .vc-home-index__grid,html.vc-site-polish body.vc-body--home .vc-home-index__grid" +
      "{--vc-index-phone-gap:1.2rem;--vc-phone-h-gap:var(--vc-index-phone-gap);gap:0!important;row-gap:0!important;column-gap:0!important;overflow:visible!important}" +
      "html.vc-site-polish body.vc-body .vc-home-index__col:nth-child(2n-1),html.vc-site-polish body.vc-body--home .vc-home-index__col:nth-child(2n-1)" +
      "{padding-right:var(--vc-index-phone-gap)!important;padding-left:0!important}" +
      "html.vc-site-polish body.vc-body .vc-home-index__col:nth-child(2n),html.vc-site-polish body.vc-body--home .vc-home-index__col:nth-child(2n)" +
      "{padding-left:var(--vc-index-phone-gap)!important;padding-right:0!important}" +
      "html.vc-site-polish body.vc-body .vc-home-index__col:nth-child(-n+2),html.vc-site-polish body.vc-body--home .vc-home-index__col:nth-child(-n+2)" +
      "{padding-bottom:var(--vc-index-phone-gap)!important;padding-top:0!important}" +
      "html.vc-site-polish body.vc-body .vc-home-index__col:nth-child(n+3),html.vc-site-polish body.vc-body--home .vc-home-index__col:nth-child(n+3)" +
      "{padding-top:var(--vc-index-phone-gap)!important}" +
      "html.vc-site-polish body.vc-body .vc-home-index__col:nth-child(3),html.vc-site-polish body.vc-body .vc-home-index__col:nth-child(4)," +
      "html.vc-site-polish body.vc-body--home .vc-home-index__col:nth-child(3),html.vc-site-polish body.vc-body--home .vc-home-index__col:nth-child(4)" +
      "{padding-bottom:var(--vc-index-phone-gap)!important}" +
      "html.vc-site-polish body.vc-body .vc-home-index__col:last-child:nth-child(odd),html.vc-site-polish body.vc-body--home .vc-home-index__col:last-child:nth-child(odd)" +
      "{grid-column:1/-1!important;padding-left:0!important;padding-right:0!important;" +
      "display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:flex-start!important;text-align:left!important}" +
      "html.vc-site-polish body.vc-body .vc-home-index__col:last-child:nth-child(odd)>.vc-home-index__label," +
      "html.vc-site-polish body.vc-body .vc-home-index__col:last-child:nth-child(odd)>a," +
      "html.vc-site-polish body.vc-body--home .vc-home-index__col:last-child:nth-child(odd)>.vc-home-index__label," +
      "html.vc-site-polish body.vc-body--home .vc-home-index__col:last-child:nth-child(odd)>a" +
      "{width:calc((100% - var(--vc-index-phone-gap,1.2rem))/2)!important;max-width:100%!important;box-sizing:border-box!important}" +
      "html.vc-site-polish body.vc-body #stats .vc-stat-cell:nth-child(2n+1)::before," +
      "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body #stats .vc-stat-cell:nth-child(2n+1)::before," +
      "html.vc-site-polish body.vc-body #stats .vc-stat-cell + .vc-stat-cell:nth-child(2n+1)::before," +
      "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body #stats .vc-stat-cell + .vc-stat-cell:nth-child(2n+1)::before," +
      "html.vc-site-polish body.vc-body .vc-stat-strip:not(:has(.vc-notify-stat)):not(:has(.vc-vote-live-statbox)) .grid > .vc-stat-cell:nth-child(2n+1)::before," +
      "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body .vc-stat-strip:not(:has(.vc-notify-stat)):not(:has(.vc-vote-live-statbox)) .grid > .vc-stat-cell:nth-child(2n+1)::before," +
      "html.vc-site-polish body.vc-body .vc-stat-strip:not(:has(.vc-notify-stat)):not(:has(.vc-vote-live-statbox)) .grid > .vc-stat-cell + .vc-stat-cell:nth-child(2n+1)::before," +
      "html.vc-site-polish body.vc-body .vc-home-index__col:nth-child(2n+1)::before," +
      "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body .vc-home-index__col:nth-child(2n+1)::before," +
      "html.vc-site-polish body.vc-body .vc-home-index__col + .vc-home-index__col:nth-child(2n+1)::before," +
      "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body .vc-home-index__col + .vc-home-index__col:nth-child(2n+1)::before," +
      "html.vc-site-polish body.vc-body--home .vc-home-index__col:nth-child(2n+1)::before," +
      "html.vc-site-polish body.vc-body footer.vc-premium-footer .vc-premium-footer__navcols > .vc-premium-footer__col:nth-child(2n+1)::before," +
      "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body footer.vc-premium-footer .vc-premium-footer__navcols > .vc-premium-footer__col:nth-child(2n+1)::before," +
      "html.vc-site-polish body.vc-body footer.vc-premium-footer .vc-premium-footer__navcols > .vc-premium-footer__col + .vc-premium-footer__col:nth-child(2n+1)::before" +
      "{content:none!important;display:none!important;width:0!important;min-width:0!important;max-width:0!important;" +
      "height:0!important;background:none!important;background-image:none!important;box-shadow:none!important;opacity:0!important;visibility:hidden!important}" +
      "html.vc-site-polish body.vc-body #stats .vc-stat-cell:nth-child(2n)::before," +
      "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body #stats .vc-stat-cell:nth-child(2n)::before," +
      "html.vc-site-polish body.vc-body .vc-home-index__col:nth-child(2n)::before," +
      "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body .vc-home-index__col:nth-child(2n)::before," +
      "html.vc-site-polish body.vc-body footer.vc-premium-footer .vc-premium-footer__navcols > .vc-premium-footer__col:nth-child(2n)::before," +
      "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body footer.vc-premium-footer .vc-premium-footer__navcols > .vc-premium-footer__col:nth-child(2n)::before" +
      '{content:""!important;display:block!important;position:absolute!important;left:0!important;right:auto!important;' +
      "top:8%!important;bottom:8%!important;width:1px!important;min-width:1px!important;max-width:1px!important;" +
      "height:auto!important;transform:translateX(-50%)!important;background-image:" +
      sepV +
      "!important;background:" +
      sepV +
      "!important;box-shadow:none!important;opacity:1!important;visibility:visible!important}" +
      "html.vc-site-polish body.vc-body #stats .vc-stat-cell:nth-child(n+3)::after," +
      "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body #stats .vc-stat-cell:nth-child(n+3)::after," +
      "html.vc-site-polish body.vc-body .vc-home-index__col:nth-child(n+3)::after," +
      "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body .vc-home-index__col:nth-child(n+3)::after," +
      "html.vc-site-polish body.vc-body footer.vc-premium-footer .vc-premium-footer__navcols > .vc-premium-footer__col:nth-child(n+3)::after," +
      "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body footer.vc-premium-footer .vc-premium-footer__navcols > .vc-premium-footer__col:nth-child(n+3)::after" +
      "{content:none!important;display:none!important}" +
      "html.vc-site-polish body.vc-body #stats .vc-stat-cell:nth-child(2n+1):nth-child(n+3)::after," +
      "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body #stats .vc-stat-cell:nth-child(2n+1):nth-child(n+3)::after," +
      "html.vc-site-polish body.vc-body .vc-home-index__col:nth-child(2n+1):nth-child(n+3):not(:last-child)::after," +
      "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body .vc-home-index__col:nth-child(2n+1):nth-child(n+3):not(:last-child)::after," +
      "html.vc-site-polish body.vc-body footer.vc-premium-footer .vc-premium-footer__navcols > .vc-premium-footer__col:nth-child(2n+1):nth-child(n+3)::after," +
      "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body footer.vc-premium-footer .vc-premium-footer__navcols > .vc-premium-footer__col:nth-child(2n+1):nth-child(n+3)::after" +
      '{content:""!important;display:block!important;position:absolute!important;left:0!important;right:auto!important;' +
      "top:0!important;bottom:auto!important;width:calc(200% + var(--vc-phone-h-gap,1.2rem))!important;" +
      "min-width:0!important;max-width:none!important;height:1px!important;min-height:1px!important;max-height:1px!important;" +
      "transform:translateY(-50%)!important;border:0!important;border-radius:999px!important;background-image:" +
      sepH +
      "!important;background:" +
      sepH +
      "!important;box-shadow:none!important;opacity:1!important;visibility:visible!important}" +
      "html.vc-site-polish body.vc-body .vc-home-index__col:nth-child(2n+1):nth-child(n+3):not(:last-child)::after," +
      "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body .vc-home-index__col:nth-child(2n+1):nth-child(n+3):not(:last-child)::after," +
      "html.vc-site-polish body.vc-body--home .vc-home-index__col:nth-child(2n+1):nth-child(n+3):not(:last-child)::after" +
      "{left:calc(-1 * var(--vc-index-card-inline,1.45rem))!important;width:calc(200% + 2 * var(--vc-index-card-inline,1.45rem))!important;" +
      "background-image:linear-gradient(90deg,rgba(111,78,55,.45) 0%,rgba(168,118,82,.95) 6%,rgba(168,118,82,.98) 50%,rgba(168,118,82,.95) 94%,rgba(111,78,55,.45) 100%)!important;" +
      "background:linear-gradient(90deg,rgba(111,78,55,.45) 0%,rgba(168,118,82,.95) 6%,rgba(168,118,82,.98) 50%,rgba(168,118,82,.95) 94%,rgba(111,78,55,.45) 100%)!important}" +
      "html.vc-site-polish body.vc-body .vc-home-index__col:last-child:nth-child(odd)::after," +
      "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body .vc-home-index__col:last-child:nth-child(odd)::after," +
      "html.vc-site-polish body.vc-body--home .vc-home-index__col:last-child:nth-child(odd)::after," +
      "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body--home .vc-home-index__col:last-child:nth-child(odd)::after" +
      '{content:""!important;display:block!important;position:absolute!important;' +
      "left:calc(-1 * var(--vc-index-card-inline,1.45rem))!important;right:auto!important;" +
      "top:0!important;width:calc(100% + 2 * var(--vc-index-card-inline,1.45rem))!important;max-width:none!important;height:1px!important;transform:translateY(-50%)!important;" +
      "background-image:linear-gradient(90deg,rgba(111,78,55,.45) 0%,rgba(168,118,82,.95) 6%,rgba(168,118,82,.98) 50%,rgba(168,118,82,.95) 94%,rgba(111,78,55,.45) 100%)!important;" +
      "background:linear-gradient(90deg,rgba(111,78,55,.45) 0%,rgba(168,118,82,.95) 6%,rgba(168,118,82,.98) 50%,rgba(168,118,82,.95) 94%,rgba(111,78,55,.45) 100%)!important;" +
      "box-shadow:none!important;opacity:1!important;visibility:visible!important}" +
      "html.vc-site-polish body.vc-body .vc-home-index__col:nth-child(2n)::before," +
      "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body .vc-home-index__col:nth-child(2n)::before," +
      "html.vc-site-polish body.vc-body--home .vc-home-index__col:nth-child(2n)::before" +
      "{top:4%!important;bottom:4%!important}" +
      "html.vc-site-polish body.vc-body footer.vc-premium-footer .vc-premium-footer__navcols > .vc-premium-footer__col:nth-child(2n+1):nth-child(n+3)::after," +
      "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body footer.vc-premium-footer .vc-premium-footer__navcols > .vc-premium-footer__col:nth-child(2n+1):nth-child(n+3)::after" +
      "{width:calc(200% + var(--vc-footer-phone-gap,1rem))!important}" +
      "html.vc-site-polish body.vc-body footer.vc-premium-footer .vc-premium-footer__navcols > .vc-premium-footer__col:last-child:nth-child(odd)::after," +
      "html.vc-site-polish body.vc-body footer.vc-premium-footer .vc-premium-footer__navcols > .vc-premium-footer__col[data-vc-footer-staff=\"1\"]:last-child::after," +
      "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body footer.vc-premium-footer .vc-premium-footer__navcols > .vc-premium-footer__col[data-vc-footer-staff=\"1\"]:last-child::after" +
      '{content:""!important;display:block!important;position:absolute!important;left:0!important;right:0!important;' +
      "top:0!important;width:100%!important;height:1px!important;transform:translateY(-50%)!important;" +
      "background-image:" +
      sepH +
      "!important;background:" +
      sepH +
      "!important;box-shadow:none!important;opacity:1!important;visibility:visible!important}" +
      "html.vc-site-polish body.vc-body .vc-home-deck__cell + .vc-home-deck__cell::before," +
      "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body .vc-home-deck__cell + .vc-home-deck__cell::before," +
      "html.vc-site-polish body.vc-body--home .vc-home-deck__cell + .vc-home-deck__cell::before" +
      '{content:""!important;display:block!important;position:absolute!important;left:0!important;right:0!important;' +
      "top:0!important;bottom:auto!important;width:100%!important;min-width:0!important;max-width:none!important;" +
      "height:1px!important;min-height:1px!important;max-height:1px!important;transform:translateY(-50%)!important;" +
      "background-image:" +
      sepH +
      "!important;background:" +
      sepH +
      "!important;box-shadow:none!important;opacity:1!important;visibility:visible!important}" +
      "}";
    try {
      (document.head || document.documentElement).appendChild(sepSt);
    } catch (eSepPin) {}
    /* snavSepOnly1: un solo sep tra Sponsor e Supporta (non tra ogni voce) */
    try {
      function ensureHeaderSnavSeps() {
        try {
          var snav = document.querySelector("header .vc-header-snav");
          if (!snav) return;
          function isSponsorEl(el) {
            if (!el || !el.getAttribute) return false;
            try {
              var href = String(el.getAttribute("href") || "").toLowerCase();
              if (/(^|\/)sponsor\/?(\?|#|$)/.test(href)) return true;
              if (el.querySelector && el.querySelector('[data-i18n="nav.sponsor"]')) return true;
            } catch (eSp) {}
            return false;
          }
          function isSupportEl(el) {
            if (!el) return false;
            try {
              if (el.querySelector && el.querySelector('[data-i18n="nav.support"]')) return true;
              var sum = el.querySelector && el.querySelector("summary.vc-snav-summary, summary");
              if (sum && /supporta|support/i.test(String(sum.textContent || ""))) return true;
            } catch (eSu) {}
            return false;
          }
          var kids = Array.prototype.slice.call(snav.children || []);
          var i;
          var sponsorEl = null;
          var supportEl = null;
          var seps = [];
          for (i = 0; i < kids.length; i += 1) {
            var kid = kids[i];
            if (!kid) continue;
            if (kid.classList && kid.classList.contains("vc-snav-sep")) {
              seps.push(kid);
              continue;
            }
            if (!sponsorEl && isSponsorEl(kid)) sponsorEl = kid;
            if (!supportEl && isSupportEl(kid)) supportEl = kid;
          }
          /* cpuStormKill1b: se sep già giusto tra Sponsor→Supporta, NON toccare
             (remove+insert riaccendeva MO header → CPU 100% forever). */
          if (
            sponsorEl &&
            supportEl &&
            seps.length === 1 &&
            seps[0].previousElementSibling === sponsorEl &&
            seps[0].nextElementSibling === supportEl
          ) {
            if (snav.getAttribute("data-vc-sep-wired") !== "20261019cpuStormKill1b") {
              snav.setAttribute("data-vc-sep-wired", "20261019cpuStormKill1b");
            }
            return;
          }
          for (i = 0; i < seps.length; i += 1) {
            try {
              snav.removeChild(seps[i]);
            } catch (eRm) {}
          }
          if (
            sponsorEl &&
            supportEl &&
            sponsorEl.parentNode === snav &&
            supportEl.parentNode === snav
          ) {
            var sep = document.createElement("span");
            sep.className = "vc-snav-sep";
            sep.setAttribute("aria-hidden", "true");
            snav.insertBefore(sep, supportEl);
          }
          snav.setAttribute("data-vc-sep-wired", "20261019cpuStormKill1b");
        } catch (eWire) {}
      }
      ensureHeaderSnavSeps();
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", ensureHeaderSnavSeps, { once: true });
      }
      window.setTimeout(ensureHeaderSnavSeps, 200);
      window.setTimeout(ensureHeaderSnavSeps, 600);
      window.setTimeout(ensureHeaderSnavSeps, 1600);
      window.setTimeout(ensureHeaderSnavSeps, 3200);
      try {
        var snavMoRoot = document.querySelector("header") || document.documentElement;
        if (snavMoRoot && !window.__vcSnavSepMo) {
          window.__vcSnavSepMo = new MutationObserver(function () {
            try {
              var sn = document.querySelector("header .vc-header-snav");
              if (sn && sn.getAttribute("data-vc-sep-wired") === "20261019cpuStormKill1b") {
                var one = sn.querySelectorAll(".vc-snav-sep");
                if (one.length === 1) return;
              }
              window.clearTimeout(window.__vcSnavSepMoT);
              window.__vcSnavSepMoT = window.setTimeout(ensureHeaderSnavSeps, 200);
            } catch (eMoT) {}
          });
          window.__vcSnavSepMo.observe(snavMoRoot, { childList: true, subtree: true });
        }
      } catch (eMo) {}
    } catch (eEnsSep) {}
  } catch (eSepEverywhere) {}
  /* navPromoGhost1: last-wins inline — batte polish/pill stale + page-bundle su /classifiche */
  try {
    var polishVer = vcAssetVer("CHROME_POLISH_VER", "20261021sitewideSolid1j");
    document.querySelectorAll('link[href*="vc-chrome-polish"]').forEach(function (l) {
      try {
        if (String(l.href || "").indexOf(polishVer) < 0) l.parentNode && l.parentNode.removeChild(l);
      } catch (eRmP) {}
    });
    document.querySelectorAll('link[href*="vc-chrome-pill-footer-fix"]').forEach(function (l) {
      try {
        if (String(l.href || "").indexOf(CHROME_PILL_FOOTER_VER) < 0) l.parentNode && l.parentNode.removeChild(l);
      } catch (eRmPill) {}
    });
    if (!document.getElementById("vc-nav-promo-ghost-fix")) {
      var ghost = document.createElement("style");
      ghost.id = "vc-nav-promo-ghost-fix";
      ghost.setAttribute("data-vc", "20261015navPromoGhost2");
      ghost.textContent =
        'html[data-vc-theme="light"] body.vc-body #header-quick-actions #vc-header-promo-btn.vc-header-promo-btn,' +
        'html[data-vc-theme="light"] body.vc-body header #vc-header-promo-btn.vc-header-promo-btn,' +
        'html[data-vc-theme="light"] body.vc-body #header-quick-actions #vc-header-promo-btn.vc-header-promo-btn--candidature,' +
        'html.vc-site-polish[data-vc-theme="light"] body.vc-body #header-quick-actions #vc-header-promo-btn.vc-header-promo-btn--candidature,' +
        'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body #header-quick-actions #vc-header-promo-btn.vc-header-promo-btn--ready:not([hidden]):not(.vc-header-promo-btn--staff-hidden),' +
        'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body header #vc-header-promo-btn.vc-header-promo-btn--ready:not([hidden]):not(.vc-header-promo-btn--staff-hidden),' +
        'html.vc-site-polish[data-vc-theme="light"]:not(.vc-soft-fx-off) body.vc-body #header-quick-actions #vc-header-promo-btn.vc-header-promo-btn--candidature.vc-header-promo-btn--ready:not([hidden]):not(.vc-header-promo-btn--staff-hidden){' +
        "background-color:#f3ebe3!important;" +
        "background-image:linear-gradient(#fffaf4,#ebe1d6),linear-gradient(135deg,rgba(212,168,136,.65),rgba(111,78,55,.4))!important;" +
        "background-origin:padding-box!important;background-clip:padding-box!important;" +
        "-webkit-background-clip:padding-box!important;border:1px solid transparent!important;" +
        "color:#1a120e!important;-webkit-text-fill-color:#1a120e!important;opacity:1!important}" +
        'html[data-vc-theme="light"] body.vc-body #header-quick-actions #vc-header-promo-btn :is(.vc-header-promo-btn__label,.vc-header-promo-btn__badge,.vc-header-promo-btn__unit,.vc-header-promo-btn__track,span),' +
        'html[data-vc-theme="light"] body.vc-body header #vc-header-promo-btn :is(.vc-header-promo-btn__label,.vc-header-promo-btn__badge,.vc-header-promo-btn__unit,span){' +
        "color:#1a120e!important;-webkit-text-fill-color:#1a120e!important;opacity:1!important;background-image:none!important}";
      (document.head || document.documentElement).appendChild(ghost);
    }
    var scrubStaleChrome = function () {
      try {
        var pv = vcAssetVer("CHROME_POLISH_VER", "20261021sitewideSolid1j");
        document.querySelectorAll('link[href*="vc-chrome-polish"]').forEach(function (l) {
          if (String(l.href || "").indexOf(pv) < 0) {
            try {
              l.parentNode.removeChild(l);
            } catch (e1) {}
          }
        });
        document.querySelectorAll('link[href*="vc-chrome-pill-footer-fix"]').forEach(function (l) {
          if (String(l.href || "").indexOf(CHROME_PILL_FOOTER_VER) < 0) {
            try {
              l.parentNode.removeChild(l);
            } catch (e2) {}
          }
        });
        var g = document.getElementById("vc-nav-promo-ghost-fix");
        if (g && g.parentNode) g.parentNode.appendChild(g);
      } catch (eScrub) {}
    };
    function pinSepSlimLast() {
      try {
        var sepRepin = document.getElementById("vc-sepSlim1");
        if (sepRepin) (document.head || document.documentElement).appendChild(sepRepin);
      } catch (eSepPin2) {}
    }
    function pinToastCenterLast() {
      try {
        var t = document.getElementById("vc-chromeAlignToast1");
        if (t) (document.head || document.documentElement).appendChild(t);
      } catch (eToastPin) {}
    }
    function pinMetalTitlesLast() {
      try {
        var m = document.getElementById("vc-interOnly1") || document.getElementById("vc-metalTitlesAll1");
        if (m) (document.head || document.documentElement).appendChild(m);
      } catch (eMetalPin) {}
    }
    var _scrub0 = scrubStaleChrome;
    scrubStaleChrome = function () {
      try {
        _scrub0();
      } catch (eS0) {}
      pinSepSlimLast();
      pinToastCenterLast();
      pinMetalTitlesLast();
    };
    window.setTimeout(scrubStaleChrome, 0);
    window.setTimeout(scrubStaleChrome, 800);
    window.setTimeout(pinSepSlimLast, 1600);
    window.setTimeout(pinToastCenterLast, 1600);
    window.setTimeout(pinMetalTitlesLast, 1600);
    document.addEventListener("vc:soft-fx-ready", scrubStaleChrome, { once: true });
  } catch (eGhost) {}
 } catch (ePillFooter) {}
 /* sepSlim2: ripinna dopo pill/ghost così glow grosso non vince di nuovo */
 try {
  var sepRepin = document.getElementById("vc-sepSlim1");
  if (sepRepin) (document.head || document.documentElement).appendChild(sepRepin);
 } catch (eSepRepin) {}
 /* authLazyChunks1: emoji CSS early (tiny), JS emoji+chrome-ui dopo sipario */
 /* perfRoiPack1: emoji CSS solo se serve render */
 try {
  if (pathNeedsEmojiRender()) {
   appendHomeLateStylesheet(
     "/css/vc-emoji-color." + EMOJI_COLOR_VER + ".css",
     EMOJI_COLOR_VER,
     "vc-emoji-color-css",
   );
  }
 } catch (eEmojiCss) {}
 try {
 if (!window.VcApiCache || !window.VcApiCache.__siteApiW4) {
 appendScript("/js/vc-api-cache.js", API_CACHE_VER);
 }
 } catch (eApiCache) {
  try {
   if (!window.VcApiCache || !window.VcApiCache.__siteApiW4) {
    appendScript("/js/vc-api-cache.js", API_CACHE_VER);
   }
  } catch (eApiCache2) {}
 }
 /* siparioFast2: page-cine-boot alza sipario su soft+look */
 try {
  if (!document.querySelector('script[src*="vc-page-cine-boot"]')) {
   appendScript("/js/vc-page-cine-boot." + PAGE_CINE_BOOT_VER + ".js", PAGE_CINE_BOOT_VER);
  }
 } catch (eCineBoot) {
  try {
   appendScript("/js/vc-page-cine-boot.js", PAGE_CINE_BOOT_VER);
  } catch (eCineBoot2) {}
 }
 /* authLazyChunks1: chrome-ui + emoji JS dopo curtain (CSS chrome resta eager sopra) */
 (function loadAuthChunksPostCurtain() {
  function curtainReady() {
   try {
    var r = document.documentElement;
    return r.classList.contains("vc-cine-curtain-off") || r.classList.contains("vc-page-cine-ready");
   } catch (eR) {
    return true;
   }
  }
  function loadChunks() {
   /* siteOptAll1: yield prima dei chunk post-sipario (INP) */
   function afterYield(fn) {
     try {
       if (typeof window.__vcYield === "function") {
         window.__vcYield(fn);
         return;
       }
     } catch (eY) {}
     try {
       fn();
     } catch (eFn) {}
   }
   afterYield(function () {
   /* perfRoiPack1: emoji JS solo route chat/liste — non legal/status/wordle/home marketing */
   try {
    if (pathNeedsEmojiRender()) {
      if (!window.VcEmojiColor) appendScript("/js/vc-emoji-color." + EMOJI_COLOR_VER + ".js", EMOJI_COLOR_VER);
    }
   } catch (eEmojiColor) {
    try {
      if (pathNeedsEmojiRender()) appendScript("/js/vc-emoji-color.js", EMOJI_COLOR_VER);
    } catch (eEmojiColor2) {}
   }
   try {
    if (pathNeedsEmojiRender() && !window.VcEmojiRender) {
      appendScript("/js/vc-emoji-render." + EMOJI_RENDER_VER + ".js", EMOJI_RENDER_VER);
    }
   } catch (eEmojiRender) {
    try {
      if (pathNeedsEmojiRender()) appendScript("/js/vc-emoji-render.js", EMOJI_RENDER_VER);
    } catch (eEmojiRender2) {}
   }
   try {
    if (pathNeedsEmojiRender()) pinEmojiColorLast(EMOJI_COLOR_VER);
   } catch (ePinEmojiEarly) {}
   try {
    /* stamp404Heal2: keep registry lookStaticBorder1e — siparioBorderPin1 stamp mai pubblicato */
    var chromeUiVer = vcAssetVer("vc-site-chrome-ui.js", "20261021lookStaticBorder1e");
    try {
      if (/lookStaticBorder1e|stamp404Heal|cpuIdleAll1b?/i.test(String(chromeUiVer || ""))) {
        /* keep */
      } else if (/lookStaticBorder1[cd]|siparioBorderPin1|loadBgContinue1|chromeLazy1/i.test(String(chromeUiVer || ""))) {
        chromeUiVer = "20261021lookStaticBorder1e";
      }
    } catch (eForceCu) {
      chromeUiVer = "20261021lookStaticBorder1e";
    }
    var chromeUiPath = "/js/vc-site-chrome-ui." + chromeUiVer + ".js";
    var chromeUiSrc = chromeUiPath + "?v=" + chromeUiVer;
    var chromeExisting = document.querySelector('script[src*="vc-site-chrome-ui"]');
    /* upgrade se stamp diverso dal canone (non confrontare NAV_CHROME_VER) */
    try {
      if (
        chromeExisting &&
        String(chromeExisting.src || "").indexOf(String(chromeUiVer)) === -1
      ) {
        if (chromeExisting.parentNode) chromeExisting.parentNode.removeChild(chromeExisting);
        chromeExisting = null;
      }
    } catch (eUpChrome) {}
    if (!chromeExisting) {
     var chromeS = document.createElement("script");
     chromeS.src = chromeUiSrc;
     chromeS.defer = true;
     chromeS.onerror = function () {
      try {
       if (document.querySelector('script[src*="vc-site-chrome-ui"]')) return;
       var bare = document.createElement("script");
       bare.src = "/js/vc-site-chrome-ui.js?v=" + chromeUiVer;
       bare.defer = true;
       (document.head || document.documentElement).appendChild(bare);
      } catch (eBare) {}
     };
     (document.head || document.documentElement).appendChild(chromeS);
    }
   } catch (eChromeUi) {
    try {
     appendScript("/js/vc-site-chrome-ui.js", "20261021siparioBorderPin1");
    } catch (eChromeUi2) {}
   }
   }); /* siteOptAll1 afterYield */
  }
  function arm() {
   var legalSoft = false;
   try {
     legalSoft = pathIsLegalFamily();
   } catch (eLegIdle) {}
   if (curtainReady()) {
    try {
     /* legalSiparioCpu2: idle più largo su policy = meno longtask subito dopo lift */
     if (window.requestIdleCallback)
       window.requestIdleCallback(loadChunks, {
         timeout: legalSoft ? 2200 : 1000,
       });
     else window.setTimeout(loadChunks, legalSoft ? 180 : 60);
    } catch (eA) {
     loadChunks();
    }
    return;
   }
   try {
    document.addEventListener(
     "vc:page-cine-ready",
     function () {
      window.setTimeout(loadChunks, legalSoft ? 120 : 40);
     },
     { once: true },
    );
   } catch (eL) {}
   window.setTimeout(loadChunks, legalSoft ? 3200 : 2400);
  }
  arm();
 })();
 try {
  /* assetGate1: presence solo ticket/chat — skip privacy/faq/home/… */
  if (
   typeof pathNeedsSitePresence === "function" &&
   pathNeedsSitePresence() &&
   (!window.VcSitePresence || window.__vcSitePresenceBooted !== "bootCoherentFast1")
  ) {
   appendScript("/js/vc-site-presence.js", "20261008bootCoherentFast1");
  }
 } catch (eSitePresence) {
  try {
   if (typeof pathNeedsSitePresence === "function" && pathNeedsSitePresence()) {
    appendScript("/js/vc-site-presence.js", "20261008bootCoherentFast1");
   }
  } catch (eSp2) {}
 }
 try {
 if (!window.__VC_SITE_NOTIFS || typeof window.__VC_SITE_NOTIFS !== "object") {
 window.__VC_SITE_NOTIFS = {
 apiUrl: "/webhooks/site-notifications",
 apiUrlLocal: "",
 wsEnabled: true,
 };
 } else if (!window.__VC_SITE_NOTIFS.apiUrl) {
 window.__VC_SITE_NOTIFS.apiUrl = "/webhooks/site-notifications";
 }
 } catch (eNotifCfg) {}
 try {
 /* bootSpeedAll1: full vc-landing (~242KB) SOLO su pagine che lo usano.
    Chrome-only (faq/sponsor/wiki/…) ? vc-site-chrome + lazy notif chunk. */
 function pathNeedsFullLanding() {
   try {
     var path = vcNormPath();
     if (path === "/") return true;
     return /^\/(user|classifiche|vote|tickets|perks|personalizza|confessionale|notifications|bacheca|seratafilm|puzzle|donazioni)(\/|$)/i.test(
       path,
     );
   } catch (eP) {
     return true;
   }
 }
 /* legalChromeGaps1: legal ha la campana in HTML ma pathNeedsFullLanding=false
    → senza landing-notif lo sheet non apre. Carica se c’è il dropdown. */
 var skipLandingNotif = !pathNeedsFullLanding();
 try {
   if (
     pathIsLegalFamily() ||
     document.querySelector(
       "#vc-notif-dropdown, details.vc-notif-dropdown, .vc-notif-dropdown",
     )
   ) {
     skipLandingNotif = false;
   }
 } catch (eNotifNeed) {}
 /* notifBellOpen1: solo vc-landing-notif conta; thin vc-landing.js ? bell client */
 function landingAlreadyInDom() {
   try {
     if (typeof window.__vcEnsureNotifBellScopeUi === "function") return true;
     if (window.__VC_LANDING_NOTIF_BOOT) return true;
     var nodes = document.querySelectorAll("script[src]");
     for (var i = 0; i < nodes.length; i++) {
       var src = String(nodes[i].getAttribute("src") || nodes[i].src || "");
       if (!src) continue;
       if (src.indexOf("vc-landing-notif") >= 0 && src.indexOf(LANDING_NOTIF_VER) >= 0) {
         return true;
       }
     }
   } catch (eDom) {}
   return false;
 }
 var needLanding = !skipLandingNotif;
 try {
   /* thin vc-landing.js marca CLIENT con VER stale … non trattarlo come bell pronto */
   if (
     window.__VC_LANDING_NOTIF_CLIENT &&
     typeof window.__vcEnsureNotifBellScopeUi !== "function" &&
     !window.__VC_LANDING_NOTIF_BOOT
   ) {
     window.__VC_LANDING_NOTIF_CLIENT = false;
     window.__vcLandingNotifReady = 0;
   }
   if (landingAlreadyInDom()) {
     window.__VC_LANDING_NOTIF_CLIENT = true;
     window.__VC_LANDING_NOTIF_CLIENT_VER = LANDING_NOTIF_VER;
     needLanding = false;
   } else if (window.__VC_LANDING_NOTIF_CLIENT_VER !== LANDING_NOTIF_VER) {
     needLanding = !skipLandingNotif;
     if (needLanding) {
       window.__VC_LANDING_NOTIF_CLIENT = false;
       window.__vcLandingNotifReady = 0;
       window.__vcLandingNotifLoading = 0;
     }
   }
 } catch (eVer) {}
 if (needLanding && !window.__VC_LANDING_NOTIF_CLIENT) {
   window.__VC_LANDING_NOTIF_CLIENT = true;
   window.__VC_LANDING_NOTIF_CLIENT_VER = LANDING_NOTIF_VER;
   try {
     window.__vcLandingNotifLoading = 1;
   } catch (eLoadLock) {}
   /* siteOptAll1: tap immediato; se loggato idle dopo chrome-done (badge/WS live, no 558KB a boot). */
   (function loadNotifPostCurtain() {
     var loaded = false;
     function go() {
       if (loaded) return;
       loaded = true;
       try {
         appendScript("/js/vc-landing-notif." + LANDING_NOTIF_VER + ".js", LANDING_NOTIF_VER);
       } catch (eN) {}
     }
     function looksAuthed() {
       try {
         if (window.__VC_DISCORD_PROFILE && window.__VC_DISCORD_PROFILE.id) return true;
         if (document.documentElement.classList.contains("vc-auth-logged-in")) return true;
         if (document.body && document.body.classList.contains("vc-auth-logged-in")) return true;
         var t = sessionStorage.getItem("vc_discord_access_token") || localStorage.getItem("vc_discord_access_token");
         if (t && String(t).length > 12) return true;
       } catch (eA) {}
       return false;
     }
     function bindBell() {
       try {
         var bell = document.querySelector(
           "#vc-notif-dropdown, details.vc-notif-dropdown, .vc-notif-dropdown, #vc-notif-toggle, [data-vc-notif-toggle]",
         );
         if (!bell) return;
         var once = function () { go(); };
         bell.addEventListener("toggle", once, { once: true });
         bell.addEventListener("pointerdown", once, { once: true, passive: true });
         bell.addEventListener("click", once, { once: true });
       } catch (eBell) {}
     }
     function armIdleAuth() {
       if (!looksAuthed()) return;
       function idleGo() {
         try {
           if (window.requestIdleCallback) {
             window.requestIdleCallback(function () { go(); }, { timeout: 4500 });
           } else {
             window.setTimeout(go, 1800);
           }
         } catch (eIdle) {
           window.setTimeout(go, 2000);
         }
       }
       try {
         if (window.__vcChromeLoadDone === true) {
           window.setTimeout(idleGo, 400);
         } else {
           document.addEventListener("vc:chrome-load-done", function () {
             window.setTimeout(idleGo, 350);
           }, { once: true });
           window.setTimeout(idleGo, 5000);
         }
       } catch (eArmIdle) {
         window.setTimeout(idleGo, 2200);
       }
     }
     function afterCurtain() {
       bindBell();
       armIdleAuth();
     }
     try {
       var r = document.documentElement;
       if (
         r.classList.contains("vc-cine-curtain-off") ||
         r.classList.contains("vc-page-cine-ready")
       ) {
         afterCurtain();
       } else {
         document.addEventListener("vc:cine-curtain-off", afterCurtain, { once: true });
         document.addEventListener("vc:page-cine-ready", afterCurtain, { once: true });
         window.setTimeout(afterCurtain, 10000);
       }
     } catch (eArm) {
       afterCurtain();
     }
   })();
 }
 } catch (eLandingNotif) {}
 /* langMenuBind1: pagine con toggle lingua ma senza vc-i18n.js in HTML (confessionale, dashboard, staff, puzzle) */
 scheduleEnsureI18nScripts();
 try {
 if (window.VcNotifChrome && window.VcNotifChrome.ver !== NOTIF_CHROME_VER) {
 window.VcNotifChrome = null;
 }
 } catch (eNotifClr) {}
 if (!window.VcNotifChrome || window.VcNotifChrome.ver !== NOTIF_CHROME_VER) {
 appendScript("/js/vc-notif-chrome.js", NOTIF_CHROME_VER);
 }
 try {
 if (window.VcChromeSync && window.VcChromeSync.ver !== CHROME_SYNC_VER) {
 window.VcChromeSync = null;
 window.__VC_CHROME_SYNC = null;
 }
 } catch (eSyncClr) {}
 if (!window.VcChromeSync || window.VcChromeSync.ver !== CHROME_SYNC_VER) {
 /* cpuIdleCut1: path stampato — CF ignora ?v= sul bare stem */
 appendScript("/js/vc-chrome-sync." + CHROME_SYNC_VER + ".js", CHROME_SYNC_VER);
 }
 /* textSettlePre1: kicker SUBITO (settle sotto curtain); type-sfx resta idle */
(function(){
 function scriptInDom(stem) {
  try {
   var nodes = document.querySelectorAll("script[src]");
   for (var i = 0; i < nodes.length; i++) {
    var src = String(nodes[i].getAttribute("src") || nodes[i].src || "");
    if (src.indexOf(stem) !== -1) return true;
   }
  } catch (e) {}
  return false;
 }
 try {
  /* textSettlePre1: URL stampato (CDN ignora spesso ?v= su .js) */
  if (!window.VcKickerHack || window.VcKickerHack.ver !== KICKER_HACK_VER) {
   try {
    var staleKick = document.querySelectorAll('script[src*="vc-kicker-hack"]');
    for (var ski = 0; ski < staleKick.length; ski += 1) {
      var skSrc = String(staleKick[ski].getAttribute("src") || "");
      if (skSrc.indexOf(KICKER_HACK_VER) !== -1) continue;
      if (staleKick[ski].parentNode) staleKick[ski].parentNode.removeChild(staleKick[ski]);
    }
   } catch (eRmKick) {}
   appendScript("/js/vc-kicker-hack." + KICKER_HACK_VER + ".js", KICKER_HACK_VER);
  }
 } catch (eKickEarly) {}
 function goType(){
  try {
   var skipTypeSfx = false;
   try {
    /* assetGate1: niente type-sfx fuori form/input pages */
    if (typeof pathNeedsTypeSfx === "function" && !pathNeedsTypeSfx()) skipTypeSfx = true;
    if (document.body && document.body.classList.contains("vc-dashboard-page")) skipTypeSfx = true;
    if (document.documentElement.classList.contains("vc-perf-lite")) skipTypeSfx = true;
    if (document.documentElement.classList.contains("vc-perf-touch")) skipTypeSfx = true;
    if (document.documentElement.classList.contains("vc-type-sfx-off")) skipTypeSfx = true;
    if (window.VcPerf && typeof window.VcPerf.isPhoneOrPwa === "function" && window.VcPerf.isPhoneOrPwa()) skipTypeSfx = true;
   } catch (eSkipTs) {}
   if (!skipTypeSfx && !window.__VC_TYPE_SFX_INIT && !scriptInDom("vc-type-sfx")) {
    appendScript("/js/vc-type-sfx.js", TYPE_SFX_VER);
   }
  } catch (eTypeSfx) {}
 }
 /* homePerfIdle1: type-sfx dopo sipario su home (UI già uguale) */
 (function armTypeSfx() {
  var home = false;
  try {
   var p = String(location.pathname || "/").replace(/\/+$/, "") || "/";
   home = p === "/" || p === "/index.html";
  } catch (eHomeTs) {}
  if (home) {
   function afterCurtain() {
    window.setTimeout(goType, 400);
   }
   try {
    if (document.documentElement.classList.contains("vc-cine-curtain-off")) afterCurtain();
    else {
     document.addEventListener("vc:cine-curtain-off", afterCurtain, { once: true });
     window.setTimeout(goType, 9000);
    }
   } catch (eArmTs) {
    window.setTimeout(goType, 1500);
   }
   return;
  }
  window.setTimeout(goType, 1500);
 })();
})();
 pinSoftFxLast(SOFT_FX_VER);
 pinNavChromeFixLast(NAV_CHROME_FIX_VER);
 watchSoftFxLast();
 /* drawerWmMarquee4: forza JS marquee aggiornato (HTML head spesso punta a stamp vecchio) */
 try {
  var mqVer = typeof HEADER_NAME_MARQUEE_VER !== "undefined" ? HEADER_NAME_MARQUEE_VER : NAV_CHROME_FIX_VER;
  var wantMq = "/js/vc-header-name-marquee." + mqVer + ".js";
  var mqNodes = document.querySelectorAll('script[src*="vc-header-name-marquee"]');
  var hasFreshMq = false;
  for (var mqi = 0; mqi < mqNodes.length; mqi += 1) {
   var msrc = String((mqNodes[mqi] && (mqNodes[mqi].getAttribute("src") || mqNodes[mqi].src)) || "");
   if (msrc.indexOf(mqVer) !== -1) hasFreshMq = true;
   else if (mqNodes[mqi] && mqNodes[mqi].parentNode) {
    try {
     mqNodes[mqi].parentNode.removeChild(mqNodes[mqi]);
    } catch (eRmMq) {}
   }
  }
  /* homePerfIdle1: un solo append (stamped); no bare stem → doppio parse */
  if (!hasFreshMq) appendScript(wantMq, mqVer);
 } catch (eMqForce) {}
 /* navFeatPipIco1: se HTML ha stamp stale, forceReplace; altrimenti evita doppio parse */
 try {
  var badgesFresh = false;
  try {
   var bn = document.querySelectorAll("script[src]");
   for (var bi = 0; bi < bn.length; bi++) {
    var bs = String(bn[bi].getAttribute("src") || bn[bi].src || "");
    if (bs.indexOf("vc-nav-badges") === -1) continue;
    if (bs.indexOf(NAV_BADGES_VER) !== -1) badgesFresh = true;
    break;
   }
  } catch (eBd) {}
  if (!badgesFresh) {
   appendScript("/js/vc-nav-badges.js", NAV_BADGES_VER);
  }
 } catch (eBadgeClr) {
  appendScript("/js/vc-nav-badges.js", NAV_BADGES_VER);
 }
 /* bootFast1: no nav-badges 900ms retry */
 try {
 var injectSolidInline = function () {
 try {
 var id = "vc-nav-menu-solid-inline";
 var existing = document.getElementById(id);
 if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
 var st = document.createElement("style");
 st.id = id;
 st.setAttribute("data-vc-nav-select-bar", "1");
 /* lightNavDrawerFix1: #100c09 solo in dark; in light cream (prima batteva vc-theme-light) */
 st.textContent =
 "html.vc-site-polish:not([data-vc-theme=\"light\"]) body.vc-body .vc-snav-panel," +
 "html.vc-site-polish:not([data-vc-theme=\"light\"]) body.vc-body .vc-lang-panel," +
 "html.vc-site-polish:not([data-vc-theme=\"light\"]) body.vc-body .vc-notif-panel," +
 "html.vc-site-polish:not([data-vc-theme=\"light\"]) body.vc-body .vc-mobile-nav-drawer__panel," +
 "html:not([data-vc-theme=\"light\"]) body.vc-body header .vc-snav-panel{" +
 "background:#100c09!important;background-color:#100c09!important;background-image:none!important;" +
 "backdrop-filter:none!important;-webkit-backdrop-filter:none!important}" +
 /* chromeOwnerUnify1: account border owned by site-chrome — inject only kills glow */
 "html.vc-site-polish:not(.vc-fx-flat):not([data-vc-theme=\"light\"]) body.vc-body .discord-account-popover," +
 "html.vc-site-polish:not(.vc-fx-flat):not([data-vc-theme=\"light\"]) body.vc-body header .discord-account-popover," +
 "html.vc-site-polish:not(.vc-fx-flat):not([data-vc-theme=\"light\"]) body.vc-body#top header .discord-account-popover," +
 "html:not(.vc-fx-flat):not([data-vc-theme=\"light\"]) body.vc-body header .discord-account-popover," +
 "html.vc-fx-flat.vc-site-polish:not(.vc-soft-fx-off):not([data-vc-theme=\"light\"]) body.vc-body#top header .discord-account-popover," +
 "html.vc-fx-flat.vc-site-polish body.vc-body#top header .discord-account-popover," +
 "html.vc-fx-flat.vc-site-polish body.vc-body header .discord-account-popover," +
 "html.vc-fx-flat body.vc-body .discord-account-popover{" +
 "box-shadow:none!important;filter:none!important;outline:none!important;" +
 "backdrop-filter:none!important;-webkit-backdrop-filter:none!important}" +
 "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body#top header .discord-account-popover__name," +
 "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body header .discord-account-popover__name," +
 "html.vc-site-polish body.vc-body .discord-account-popover__name," +
 "html.vc-site-polish body.vc-body--home .discord-account-popover__name," +
 "html body.vc-body header .discord-account-popover__name," +
 "html body.vc-body .discord-account-popover__name{" +
 "background-image:linear-gradient(135deg,#f5d6b7,#e8c9a8 45%,#d4a888)!important;" +
 "background-color:transparent!important;-webkit-background-clip:text!important;background-clip:text!important;" +
 "color:transparent!important;-webkit-text-fill-color:transparent!important}" +
 "html.vc-site-polish body.vc-body .discord-account-popover__item:not(.discord-account-popover__item--danger):not(.is-soon)>span," +
 "html body.vc-body .discord-account-popover__item:not(.discord-account-popover__item--danger):not(.is-soon)>span{" +
 "background-image:linear-gradient(180deg,rgba(247,236,223,.98),rgba(236,214,188,.92) 48%,rgba(212,168,136,.88))!important;" +
 "background-color:transparent!important;-webkit-background-clip:text!important;background-clip:text!important;" +
 "color:transparent!important;-webkit-text-fill-color:transparent!important}" +
 "html.vc-site-polish body.vc-body .discord-account-popover__item:not(.discord-account-popover__item--danger):not(.is-soon)>i," +
 "html.vc-site-polish body.vc-body .discord-account-popover__item:not(.discord-account-popover__item--danger):not(.is-soon)>.fa{" +
 "color:rgba(236,205,176,.92)!important;-webkit-text-fill-color:rgba(236,205,176,.92)!important;" +
 "background:none!important;text-shadow:none!important}" +
 "html.vc-site-polish body.vc-body .discord-account-popover__item.is-soon .discord-account-popover__soon-badge," +
 "html body.vc-body .discord-account-popover__item.is-soon .discord-account-popover__soon-badge{" +
 "background-image:none!important;background:rgba(22,16,12,.82)!important;color:#f3dfc6!important;" +
 "-webkit-text-fill-color:#f3dfc6!important;-webkit-background-clip:border-box!important;background-clip:border-box!important}" +
 "html.vc-site-polish body.vc-body .discord-account-popover__item.is-soon .discord-account-popover__soon-inner," +
 "html.vc-site-polish body.vc-body .discord-account-popover__item.is-soon .discord-account-popover__soon-inner span," +
 "html.vc-site-polish body.vc-body .discord-account-popover__item.is-soon .discord-account-popover__soon-inner i{" +
 "background-image:none!important;color:rgba(247,236,223,.88)!important;-webkit-text-fill-color:rgba(247,236,223,.88)!important;" +
 "-webkit-background-clip:border-box!important;background-clip:border-box!important}" +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-item," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-summary," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-row," +
 "html body.vc-body header .vc-header-snav .vc-snav-item," +
 "html body.vc-body header .vc-header-snav .vc-snav-summary," +
 "html body.vc-body header .vc-header-snav .vc-snav-row{position:relative!important}" +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-item," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-summary," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-item--active," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-item[aria-current=page]," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-details.vc-snav-details--current>.vc-snav-summary," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-item:hover," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-summary:hover," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-item:not(.vc-snav-item--active):not([aria-current=page]):hover," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-details:not([open]):not(.vc-snav-details--current)>.vc-snav-summary:hover," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-details[open]>.vc-snav-summary," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-details[open]>.vc-snav-summary:hover," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-panel .vc-snav-row," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-panel .vc-snav-row:hover," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-panel .vc-snav-row.vc-snav-row--active," +
 "html body.vc-body header .vc-header-snav .vc-snav-item:not(.vc-snav-item--active):not([aria-current=page]):hover," +
 "html body.vc-body header .vc-header-snav .vc-snav-details:not([open]):not(.vc-snav-details--current)>.vc-snav-summary:hover," +
 "html body.vc-body header .vc-header-snav .vc-snav-details[open]>.vc-snav-summary," +
 "html body.vc-body header .vc-header-snav .vc-snav-details[open]>.vc-snav-summary:hover{" +
 "background:transparent!important;background-color:transparent!important;background-image:none!important;box-shadow:none!important;border-color:rgba(245,214,183,.38)!important}" +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-item--active::after," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-item[aria-current=page]::after," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-details.vc-snav-details--current>.vc-snav-summary::after," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-details[open]>.vc-snav-summary::after," +
 "html body.vc-body header .vc-header-snav .vc-snav-item--active::after," +
 "html body.vc-body header .vc-header-snav .vc-snav-item[aria-current=page]::after," +
 "html body.vc-body header .vc-header-snav .vc-snav-details.vc-snav-details--current>.vc-snav-summary::after," +
 "html body.vc-body header .vc-header-snav .vc-snav-details[open]>.vc-snav-summary::after{" +
 "content:\"\"!important;display:block!important;position:absolute!important;" +
 "left:.7rem!important;right:.7rem!important;bottom:.32rem!important;height:1.5px!important;" +
 "border-radius:999px!important;pointer-events:none!important;" +
 "background:linear-gradient(90deg,rgba(255,247,236,.12),rgba(255,247,236,.98) 18%,rgba(236,205,176,.98) 50%,rgba(212,168,136,.95) 82%,rgba(255,247,236,.12))!important;" +
 "box-shadow:none!important}" +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-item:hover::after," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-summary:hover::after," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-item:not(.vc-snav-item--active):not([aria-current=page]):hover::after," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-details:not([open]):not(.vc-snav-details--current)>.vc-snav-summary:hover::after," +
 "html body.vc-body header .vc-header-snav .vc-snav-item:not(.vc-snav-item--active):not([aria-current=page]):hover::after," +
 "html body.vc-body header .vc-header-snav .vc-snav-details:not([open]):not(.vc-snav-details--current)>.vc-snav-summary:hover::after{" +
 "content:\"\"!important;display:block!important;position:absolute!important;" +
 "left:.7rem!important;right:.7rem!important;bottom:.32rem!important;height:1.5px!important;" +
 "border-radius:999px!important;pointer-events:none!important;" +
 "background:linear-gradient(90deg,rgba(255,247,236,.08),rgba(255,247,236,.82) 18%,rgba(236,205,176,.88) 50%,rgba(212,168,136,.78) 82%,rgba(255,247,236,.08))!important;" +
 "box-shadow:none!important}" +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-item--active:hover::after," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-details.vc-snav-details--current>.vc-snav-summary:hover::after," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-details[open]>.vc-snav-summary:hover::after{" +
 "background:linear-gradient(90deg,rgba(255,247,236,.18),rgba(255,247,236,1) 18%,rgba(236,205,176,1) 50%,rgba(212,168,136,.98) 82%,rgba(255,247,236,.18))!important;" +
 "box-shadow:none!important}" +
 "html body.vc-body .vc-snav-panel>.vc-snav-row," +
 "html body.vc-body header .vc-header-snav .vc-snav-panel .vc-snav-row," +
 "html.vc-site-polish body.vc-body .vc-snav-panel a.vc-snav-row," +
 "html body.vc-body .discord-account-popover__item," +
 "html.vc-site-polish body.vc-body .discord-account-popover__item," +
 "html body.vc-body .vc-lang-panel:not(.vc-lang-panel--seg) .vc-lang-option," +
 "html body.vc-body .vc-lang-panel:not(.vc-lang-panel--seg) button{" +
 "width:fit-content!important;max-width:100%!important;min-width:0!important;" +
 "box-sizing:border-box!important;white-space:nowrap!important}" +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-panel .vc-snav-row:hover::after," +
 "html.vc-site-polish body.vc-body .vc-snav-panel a.vc-snav-row:hover::after," +
 "html.vc-site-polish body.vc-body header .discord-account-popover__item:not(.discord-account-popover__item--danger):hover::after," +
 "html.vc-site-polish body.vc-body .vc-lang-option:hover::after{" +
 "content:\"\"!important;display:block!important;position:absolute!important;" +
 "left:.55rem!important;right:.55rem!important;bottom:.28rem!important;height:1.5px!important;width:auto!important;" +
 "border-radius:999px!important;pointer-events:none!important;" +
 "background:linear-gradient(90deg,rgba(255,247,236,.08),rgba(255,247,236,.82) 18%,rgba(236,205,176,.88) 50%,rgba(212,168,136,.78) 82%,rgba(255,247,236,.08))!important;" +
 "box-shadow:none!important}" +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-panel .vc-snav-row.vc-snav-row--active::after," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-panel .vc-snav-row[aria-current=page]::after," +
 "html.vc-site-polish body.vc-body .vc-snav-panel a.vc-snav-row.vc-snav-row--active::after," +
 "html.vc-site-polish body.vc-body header .discord-account-popover__item.is-current::after," +
 "html.vc-site-polish body.vc-body .vc-lang-option.is-active::after{" +
 "content:\"\"!important;display:block!important;position:absolute!important;" +
 "left:.55rem!important;right:.55rem!important;bottom:.28rem!important;height:1.5px!important;width:auto!important;" +
 "border-radius:999px!important;pointer-events:none!important;" +
 "background:linear-gradient(90deg,rgba(255,247,236,.12),rgba(255,247,236,.98) 18%,rgba(236,205,176,.98) 50%,rgba(212,168,136,.95) 82%,rgba(255,247,236,.12))!important;" +
 "box-shadow:none!important}" +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-summary{" +
 "display:inline-flex!important;align-items:center!important;gap:.22rem!important}" +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-summary>i.vc-snav-chev," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-summary>i.fa-chevron-down," +
 "html.vc-site-polish body.vc-body#top header .vc-header-snav .vc-snav-summary>i.vc-snav-chev," +
 "html.vc-site-polish body.vc-body#top header .vc-header-snav .vc-snav-summary>i.fa-chevron-down{" +
 "display:inline-flex!important;align-items:center!important;justify-content:center!important;" +
 "width:.72em!important;height:.72em!important;margin:0 0 0 .12rem!important;padding:0!important;" +
 "line-height:1!important;font-size:.62rem!important;top:0!important;position:relative!important;" +
 "transform:none!important;transform-origin:50% 50%!important;" +
 "color:rgba(245,214,183,.92)!important;-webkit-text-fill-color:rgba(245,214,183,.92)!important;" +
 "background:none!important;opacity:.9!important;visibility:visible!important}" +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-summary>i.vc-snav-chev::before," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-summary>i.fa-chevron-down::before," +
 "html.vc-site-polish body.vc-body#top header .vc-header-snav .vc-snav-summary>i.vc-snav-chev::before," +
 "html.vc-site-polish body.vc-body#top header .vc-header-snav .vc-snav-summary>i.fa-chevron-down::before{" +
 "display:block!important;content:\"\\f078\"!important;transform:none!important;" +
 "line-height:1!important;width:1em!important;height:1em!important;margin:0!important;border:0!important;-webkit-mask-image:none!important;mask-image:none!important}" +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-details[open]>.vc-snav-summary>i.vc-snav-chev," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-details[open]>.vc-snav-summary>i.fa-chevron-down," +
 "html.vc-site-polish body.vc-body#top header .vc-header-snav .vc-snav-details[open]>.vc-snav-summary>i.vc-snav-chev," +
 "html.vc-site-polish body.vc-body#top header .vc-header-snav .vc-snav-details[open]>.vc-snav-summary>i.fa-chevron-down{" +
 "transform:rotate(180deg)!important;transform-origin:50% 50%!important;top:0!important;" +
 "color:rgba(247,236,223,.98)!important;-webkit-text-fill-color:rgba(247,236,223,.98)!important;opacity:.95!important}" +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-details[open]>.vc-snav-summary>i.vc-snav-chev::before," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-details[open]>.vc-snav-summary>i.fa-chevron-down::before," +
 "html.vc-site-polish body.vc-body#top header .vc-header-snav .vc-snav-details[open]>.vc-snav-summary>i.vc-snav-chev::before," +
 "html.vc-site-polish body.vc-body#top header .vc-header-snav .vc-snav-details[open]>.vc-snav-summary>i.fa-chevron-down::before{" +
 "content:\"\\f078\"!important;transform:none!important}" +
 "html.vc-site-polish body.vc-body #vc-site-back-top>i.fa::before," +
 "html.vc-site-polish body.vc-body #vc-site-back-top>i.fa-caret-up::before," +
 "html.vc-site-polish body.vc-body #vc-site-back-top>i.fa-chevron-up::before{" +
 "content:\"\\f077\"!important}" +
 "html.vc-site-polish[data-vc-theme=\"light\"] body.vc-body .vc-snav-panel," +
 "html.vc-site-polish[data-vc-theme=\"light\"] body.vc-body .vc-lang-panel," +
 "html.vc-site-polish[data-vc-theme=\"light\"] body.vc-body .vc-notif-panel," +
 "html.vc-site-polish[data-vc-theme=\"light\"] body.vc-body .vc-mobile-nav-drawer__panel," +
 "html.vc-site-polish[data-vc-theme=\"light\"] body.vc-body #vc-mobile-nav-drawer .vc-mobile-nav-drawer__panel," +
 "html[data-vc-theme=\"light\"] body.vc-body header .vc-snav-panel{" +
 "background:#faf6f0!important;background-color:#faf6f0!important;" +
 "background-image:radial-gradient(120% 90% at 0% 0%,rgba(255,248,238,.9),transparent 52%),linear-gradient(175deg,#fffaf4 0%,#f7f1ea 55%,#efe6dc 100%)!important;" +
 "border:1px solid rgba(111,78,55,.2)!important;border-color:rgba(111,78,55,.2)!important;color:#2a1c14!important;" +
 "box-shadow:none!important;" +
 "backdrop-filter:none!important;-webkit-backdrop-filter:none!important}" +
 "html[data-vc-theme=\"light\"] body .vc-mobile-nav-drawer .vc-mobile-nav-link," +
 "html[data-vc-theme=\"light\"] body .vc-mobile-nav-drawer .vc-mobile-nav-link span," +
 "html[data-vc-theme=\"light\"] body .vc-mobile-nav-drawer .vc-mobile-nav-link i," +
 "html[data-vc-theme=\"light\"] body .vc-mobile-nav-drawer .vc-mobile-nav-section__title," +
 "html[data-vc-theme=\"light\"] body .vc-mobile-nav-drawer__brand a.vc-header-site-name," +
 "html[data-vc-theme=\"light\"] body .vc-mobile-nav-drawer__brand a.vc-header-site-name .vc-header-site-name__text," +
 "html[data-vc-theme=\"light\"] body .vc-mobile-nav-drawer .vc-mobile-nav-tile," +
 "html[data-vc-theme=\"light\"] body .vc-mobile-nav-drawer .vc-mobile-nav-tile span," +
 "html[data-vc-theme=\"light\"] body .vc-mobile-nav-drawer .vc-mobile-nav-tile i{" +
 "color:#2a1c14!important;-webkit-text-fill-color:#2a1c14!important}" +
 "html[data-vc-theme=\"light\"] body .vc-mobile-nav-drawer .vc-mobile-nav-tile," +
 "html[data-vc-theme=\"light\"] body .vc-mobile-nav-drawer .vc-mobile-nav-link{" +
 "background-color:rgba(255,250,244,.92)!important;border-color:rgba(111,78,55,.18)!important}" +
 /* cardInnerNavRing2 + innerCardConic1: pin LAST - footer + card interne a shell 2px */
 "html.vc-site-polish body.vc-body > footer.vc-premium-footer .vc-premium-footer__outer," +
 "html.vc-site-polish body.vc-body footer.vc-premium-footer .vc-premium-footer__outer," +
 "html.vc-perf-mid.vc-site-polish body.vc-body > footer.vc-premium-footer .vc-premium-footer__outer," +
 "html.vc-site-photo-bg.vc-site-polish body.vc-body > footer.vc-premium-footer .vc-premium-footer__outer," +
 "html.vc-site-photo-bg.vc-perf-mid.vc-site-polish body.vc-body > footer.vc-premium-footer .vc-premium-footer__outer," +
 "html body.vc-body > footer.vc-premium-footer .vc-premium-footer__outer{" +
 "border:0!important;border-width:0!important;border-style:none!important;border-color:rgba(245,214,183,.38)!important;" +
 "box-shadow:none!important;outline:none!important;filter:none!important;-webkit-filter:none!important}" +
 "html.vc-site-polish body.vc-body > footer.vc-premium-footer .vc-premium-footer__social," +
 "html.vc-site-polish body.vc-body footer.vc-premium-footer .vc-premium-footer__social," +
 "html.vc-site-photo-bg.vc-perf-mid.vc-site-polish body.vc-body#top > footer.vc-premium-footer .vc-premium-footer__social," +
 "html body.vc-body > footer.vc-premium-footer .vc-premium-footer__social{" +
 "border:2px solid rgba(245,214,183,.38)!important;border-color:rgba(245,214,183,.38)!important;" +
 "background-color:var(--vc-nav-shell-fill,#140f0c)!important;" +
 "background-image:linear-gradient(var(--vc-nav-shell-fill,#140f0c),var(--vc-nav-shell-fill,#140f0c)),var(--vc-nav-ring)!important;" +
 "background-origin:padding-box!important;background-clip:padding-box!important;" +
 "-webkit-background-clip:padding-box!important;box-shadow:none!important}" +
 "html.vc-site-polish[data-vc-theme=\"light\"] body.vc-body > footer.vc-premium-footer .vc-premium-footer__social," +
 "html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme=\"light\"] body.vc-body#top > footer.vc-premium-footer .vc-premium-footer__social," +
 "html[data-vc-theme=\"light\"] .vc-premium-footer__social{" +
 "border:2px solid rgba(245,214,183,.38)!important;border-color:rgba(245,214,183,.38)!important;" +
 "background-color:var(--vc-nav-shell-fill-light,#f7f1ea)!important;" +
 "background-image:linear-gradient(var(--vc-nav-shell-fill-light,#f7f1ea),var(--vc-nav-shell-fill-light,#f7f1ea)),var(--vc-nav-ring-light)!important;" +
 "background-origin:padding-box!important;background-clip:padding-box!important;" +
 "-webkit-background-clip:padding-box!important;box-shadow:none!important}" +
 "html.vc-site-polish:not(.vc-soft-fx-off):not([data-vc-theme=\"light\"]) body.vc-body :is(" +
 ".vc-user-profile-hero,.vc-user-profile-block,.vc-user-profile-disclosure,.vc-user-profile-accordion," +
 ".vc-page-cine-card,.vc-fx-card,.vc-home-deck,.vc-home-feature,.vc-home-highlights,.vc-staff-hub-card," +
 ".vc-staff-block,.vc-vote-live-shell,.vc-hero-head,.vc-faq-group,.vc-wiki-cmd-shell,.vc-support-donate-role) :is(" +
 ".vc-user-profile-stat,.vc-user-profile-mini,.vc-user-profile-badges,.vc-home-highlight-card," +
 ".vc-vote-live-card,.vc-vote-live-statbox,.vc-staff-tool-card,.vc-staff-compiti-card," +
 ".vc-dash-card,.vc-role-card,.vc-ul-card,.vc-cmd-acc,.vc-cmd-grp,.vc-cmd-acc-body,.vc-cmd-grp-list,.vc-perks-tier-acc)," +
 "html.vc-site-polish:not(.vc-soft-fx-off):not([data-vc-theme=\"light\"]) body.vc-vote-page.vc-body#top #vote-platforms > a.vc-vote-platform-card," +
 "html.vc-site-polish:not(.vc-soft-fx-off):not([data-vc-theme=\"light\"]) body.vc-vote-page #vote-platforms > a.vc-vote-platform-card," +
 "html.vc-site-polish:not(.vc-soft-fx-off):not([data-vc-theme=\"light\"]) body.vc-body .vc-hero-head a.vc-vote-platform-card{" +
 "border:2px solid rgba(245,214,183,.38)!important;border-color:rgba(245,214,183,.38)!important;" +
 "background-color:#100c09!important;" +
 "background-image:radial-gradient(120% 90% at 0% 0%,rgba(236,205,176,.12),transparent 52%)," +
 "radial-gradient(90% 70% at 100% 0%,rgba(111,78,55,.16),transparent 48%)," +
 "linear-gradient(175deg,#17130f 0%,#100c09 55%,#0b0807 100%),var(--vc-nav-ring)!important;" +
 "background-origin:padding-box!important;" +
 "background-clip:padding-box!important;" +
 "-webkit-background-clip:padding-box!important;box-shadow:none!important}" +
 "html.vc-site-polish:not(.vc-soft-fx-off):not([data-vc-theme=\"light\"]) body.vc-body.vc-users-page.vc-user-profile-page#top main :is(" +
 ".vc-user-profile-hero,.vc-user-profile-block,.vc-user-profile-disclosure,.vc-user-profile-accordion) :is(" +
 ".vc-user-profile-stat,.vc-user-profile-mini,.vc-user-profile-badges)," +
 "html.vc-site-polish:not(.vc-soft-fx-off):not([data-vc-theme=\"light\"]) body.vc-body.vc-user-profile-page#top main :is(" +
 ".vc-user-profile-hero,.vc-user-profile-block,.vc-user-profile-disclosure,.vc-user-profile-accordion) :is(" +
 ".vc-user-profile-stat,.vc-user-profile-mini,.vc-user-profile-badges){" +
 "border:2px solid rgba(245,214,183,.38)!important;border-width:2px!important;border-color:rgba(245,214,183,.38)!important;" +
 "background-color:#100c09!important;" +
 "background-image:radial-gradient(120% 90% at 0% 0%,rgba(236,205,176,.12),transparent 52%)," +
 "radial-gradient(90% 70% at 100% 0%,rgba(111,78,55,.16),transparent 48%)," +
 "linear-gradient(175deg,#17130f 0%,#100c09 55%,#0b0807 100%),var(--vc-nav-ring)!important;" +
 "background-origin:padding-box!important;" +
 "background-clip:padding-box!important;" +
 "-webkit-background-clip:padding-box!important;box-shadow:none!important}" +
 "html.vc-site-polish[data-vc-theme=\"light\"]:not(.vc-soft-fx-off) body.vc-body :is(" +
 ".vc-user-profile-hero,.vc-user-profile-block,.vc-user-profile-disclosure,.vc-user-profile-accordion," +
 ".vc-page-cine-card,.vc-fx-card,.vc-home-deck,.vc-home-feature,.vc-home-highlights,.vc-staff-hub-card," +
 ".vc-staff-block,.vc-vote-live-shell,.vc-hero-head,.vc-faq-group,.vc-wiki-cmd-shell,.vc-support-donate-role) :is(" +
 ".vc-user-profile-stat,.vc-user-profile-mini,.vc-user-profile-badges,.vc-home-highlight-card," +
 ".vc-vote-live-card,.vc-vote-live-statbox,.vc-staff-tool-card,.vc-staff-compiti-card," +
 ".vc-dash-card,.vc-role-card,.vc-ul-card,.vc-cmd-acc,.vc-cmd-grp,.vc-cmd-acc-body,.vc-cmd-grp-list,.vc-perks-tier-acc)," +
 "html.vc-site-polish[data-vc-theme=\"light\"]:not(.vc-soft-fx-off) body.vc-vote-page.vc-body#top #vote-platforms > a.vc-vote-platform-card," +
 "html.vc-site-polish[data-vc-theme=\"light\"]:not(.vc-soft-fx-off) body.vc-vote-page #vote-platforms > a.vc-vote-platform-card," +
 "html.vc-site-polish[data-vc-theme=\"light\"]:not(.vc-soft-fx-off) body.vc-body .vc-hero-head a.vc-vote-platform-card{" +
 "border:2px solid rgba(245,214,183,.38)!important;border-color:rgba(245,214,183,.38)!important;" +
 "background-color:#faf6f0!important;" +
 "background-image:radial-gradient(120% 90% at 0% 0%,rgba(255,248,238,.92),transparent 52%)," +
 "radial-gradient(90% 70% at 100% 0%,rgba(212,168,136,.2),transparent 48%)," +
 "linear-gradient(175deg,#fffaf4 0%,#f7f1ea 48%,#efe6dc 100%),var(--vc-nav-ring-light)!important;" +
 "background-origin:padding-box!important;" +
 "background-clip:padding-box!important;" +
 "-webkit-background-clip:padding-box!important;box-shadow:none!important}" +
 "html.vc-site-polish[data-vc-theme=\"light\"]:not(.vc-soft-fx-off) body.vc-body.vc-users-page.vc-user-profile-page#top main :is(" +
 ".vc-user-profile-hero,.vc-user-profile-block,.vc-user-profile-disclosure,.vc-user-profile-accordion) :is(" +
 ".vc-user-profile-stat,.vc-user-profile-mini,.vc-user-profile-badges)," +
 "html.vc-site-polish[data-vc-theme=\"light\"]:not(.vc-soft-fx-off) body.vc-body.vc-user-profile-page#top main :is(" +
 ".vc-user-profile-hero,.vc-user-profile-block,.vc-user-profile-disclosure,.vc-user-profile-accordion) :is(" +
 ".vc-user-profile-stat,.vc-user-profile-mini,.vc-user-profile-badges){" +
 "border:2px solid rgba(245,214,183,.38)!important;border-width:2px!important;border-color:rgba(245,214,183,.38)!important;" +
 "background-color:#faf6f0!important;" +
 "background-image:radial-gradient(120% 90% at 0% 0%,rgba(255,248,238,.92),transparent 52%)," +
 "radial-gradient(90% 70% at 100% 0%,rgba(212,168,136,.2),transparent 48%)," +
 "linear-gradient(175deg,#fffaf4 0%,#f7f1ea 48%,#efe6dc 100%),var(--vc-nav-ring-light)!important;" +
 "background-origin:padding-box!important;" +
 "background-clip:padding-box!important;" +
 "-webkit-background-clip:padding-box!important;box-shadow:none!important}";
 (document.body || document.documentElement).appendChild(st);
 } catch (eInline) {}
 };
 var reinjectSolid = function () {
 /* navBootTrim1: una sola volta … DOMContentLoaded+load duplicavano pin/recalc */
 if (window.__vcSolidReinjected) return;
 window.__vcSolidReinjected = 1;
 try {
 /* homeCpuCut1: home aspetta shell post-curtain; altre pagine skip se shell già live */
 if (
  !vcPathIsHome() &&
  !(window.__vcShellCssInjected || document.getElementById("vc-shell-css"))
 ) {
  appendStylesheet("/css/vc-nav-menu-solid.css", NAV_CHROME_VER);
 }
 pinSoftFxLast(SOFT_FX_VER);
 pinNavChromeFixLast(NAV_CHROME_FIX_VER);
 injectSolidInline();
 } catch (eR) {}
 };
 if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", reinjectSolid);
 else window.setTimeout(reinjectSolid, 0);
 } catch (eRe) {}
 /* assetGate1: view-as (48KB) solo se loggato — guest/logout skip */
 (function armViewAsLazy() {
  function hasViewAsSrc() {
   try {
    var nodes = document.querySelectorAll("script[src]");
    for (var i = 0; i < nodes.length; i++) {
     var src = String(nodes[i].getAttribute("src") || nodes[i].src || "");
     if (src.indexOf("vc-view-as") !== -1) return true;
    }
   } catch (eH) {}
   return false;
  }
  function wantViewAs() {
   try {
    var h = document.documentElement;
    if (h.classList.contains("vc-auth-logged-out")) return false;
    if (h.classList.contains("vc-view-as-guest")) return false;
    if (h.classList.contains("vc-auth-session-pending")) return null;
    if (!document.getElementById("vc-view-as-launch")) return false;
    return true;
   } catch (eW) {
    return false;
   }
  }
  function tryLoadViewAs() {
   var w = wantViewAs();
   if (w === null) return false;
   if (!w) return true;
   if (!hasViewAsSrc()) {
    try {
     appendScript("/js/vc-view-as.js", "20261019viewAsEyeHover2");
    } catch (eA) {}
   }
   return true;
  }
  if (tryLoadViewAs()) return;
  try {
   var mo = new MutationObserver(function () {
    if (tryLoadViewAs()) {
     try {
      mo.disconnect();
     } catch (eD) {}
    }
   });
   mo.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
   });
   window.setTimeout(function () {
    try {
     mo.disconnect();
    } catch (eT) {}
    tryLoadViewAs();
   }, 8000);
  } catch (eMo) {
   window.setTimeout(tryLoadViewAs, 1200);
  }
 })();
 } catch (eHelper) {}
 })();
})();
