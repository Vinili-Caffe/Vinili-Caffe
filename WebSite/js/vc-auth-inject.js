/**
 * megaSplit1: asset injector extracted from discord-auth (ensureSiteHelperScripts).
 * Load AFTER vc-asset-versions.js, BEFORE discord-auth.js.
 * loadSyncPack1: overlay sync — stillLoading/bootApisPending include boards-view;
 *   forceGateOpen guards session/dash; 6s soft cap.
 * Visual lock: same inject paths/versions; no layout change.
 * routeGate1: load solo pezzi serviti dalla route (IDB/sticky/drafts/lightbox/dialog).
 * loadToastLinger1: Caricamento… come toast sitewide + linger dopo fine load.
 * homeScrollLock1: dopo sipario NON togliere scroll-lock finché __vcChromeLoadDone
 *   (home apriva curtain prima → overflow auto + scroll mentre barra/toast ancora on).
 * authInjectSyntax1: fix premature end-comment in header (Unexpected token star).
 * chromeGap1: chromeAlign strip ha tolto vc-chrome/tw-build alle pagine senza
 *   page-bundle → promo flat + menu account grezzo; ripristina solo se manca bundle/page-home.
 * cssLikeFeedback1: XOR = page-bundle come /feedback/ (NO landing-ext/tw/core dual-stack).
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
   var VER = "20261017statOpenChip1";
  if (window.__VC_AUTH_INJECT_BOOT === VER) return;
  window.__VC_AUTH_INJECT_BOOT = VER;
  /* sepStyle1px1: stile policy (mocha) su sep ESISTENTI — 1px, NO glow, dimensioni pre-policy. */
  /* progGlowUnify1: stub = stessa sand-glow della barra load/scroll. */
  /* phoneBarBlur1: stub progress right:0 + flat (niente gutter/bloom blur telefono). */
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
      }, 12000);
    } catch (eMo) {}
  })();
  /* preloadScrub3: togli TUTTI i preload style/font site (unused warn su tutte le pagine) */
  (function scrubStalePreloads() {
    try {
      if (window.__vcPreloadScrub3) return;
      window.__vcPreloadScrub3 = 1;
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
          Array.prototype.forEach.call(document.querySelectorAll('link[rel="preload"]'), function (pre) {
            try {
              var as = String(pre.getAttribute("as") || "").toLowerCase();
              var href = String(pre.href || pre.getAttribute("href") || "");
              if (as !== "style" && as !== "font") return;
              if (
                !/vc-look-core|vc-theme-light|vc-site-boot-kit|vc-soft-fx|vc-landing-core|vc-chrome|cormorant|fontawesome|font-awesome/i.test(
                  href,
                )
              ) {
                /* comunque drop style preload sotto /css/ — sheet già in head */
                if (!(as === "style" && /\/css\//i.test(href))) return;
              }
              if (pre.parentNode) pre.parentNode.removeChild(pre);
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
  /* perfRoiPack1: shell leggera — niente emoji-render */
  function pathIsLightShell() {
    return vcPathRe(
      /^\/(privacy|terms|cookie|copyright|dati|status|wordle|puzzle)(\/|$)/i,
    );
  }
  function pathNeedsEmojiRender() {
    /* emojiWordmarkAll1: wordmark/footer (🎃🍂) su vote/ruoli/home/… — non solo chat/liste */
    if (pathIsLightShell()) return false;
    return true;
  }
  /* cursorMqStable1: URL su html/body; * inherit — no freccia Windows a ogni elemento */
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
      try {
        window.setTimeout(function () {
          try {
            var m = document.body || document.documentElement;
            if (curCss && m) m.appendChild(curCss);
          } catch (eR) {}
        }, 1200);
      } catch (eRm) {}
    }
  } catch (eCur) {}
 (function ensureSiteHelperScripts() {
 try {
 function appendScript(path, forceVer) {
 var file = String(path || "").split("/").pop().replace(/\?.*$/, "");
 /* bootFast1NormFile */
 if (/^vc-soft-fx(\.|$)/.test(file)) file = "vc-soft-fx.css";
 else if (/^vc-nav-chrome-fix(\.|$)/.test(file)) file = "vc-nav-chrome-fix.css";
 else if (/^vc-nav-chrome-form(\.|$)/.test(file)) file = "vc-nav-chrome-fix.css";
 else if (/^vc-glow-form(\.|$)/.test(file)) file = "vc-glow-form.css";
 else if (/^vc-nav-menu-solid(\.|$)/.test(file)) file = "vc-nav-menu-solid.css";
 else if (/^vc-site-chrome-ui(\.|$)/.test(file)) file = "vc-site-chrome-ui.css";
 else if (/^vc-chrome-polish(\.|$)/.test(file)) file = "vc-chrome-polish.css";
 else if (/^vc-footer-end-breath(\.|$)/.test(file)) file = "vc-footer-end-breath.css";
 if (/^vc-look-core(\.|$)/.test(file)) file = "vc-look-core.css";
 else if (/^vc-soft-fx(\.|$)/.test(file)) file = "vc-soft-fx.css";
 else if (/^vc-nav-chrome-solid(\.|$)/.test(file)) file = "vc-nav-chrome-solid.css";
 else if (/^vc-nav-chrome-form(\.|$)/.test(file)) file = "vc-nav-chrome-solid.css";
 else if (/^vc-chrome-polish(\.|$)/.test(file)) file = "vc-chrome-polish.css";
 if (!file) return;
 path = String(path || "").split("?")[0];
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
 if (forceReplace) {
 try {
 var staleSel = isStorageStem
  ? 'script[src*="vc-storage"]'
  : isIdbStem
    ? 'script[src*="vc-idb"]'
    : 'script[src*="' + file + '"]';
 var stale = document.querySelectorAll(staleSel);
 var si;
 for (si = 0; si < stale.length; si += 1) {
 var curStale = String(stale[si].getAttribute("src") || "");
 if (curStale.indexOf("?v=" + ver) !== -1 || curStale.indexOf("&v=" + ver) !== -1) {
 continue;
 }
 if (stale[si].parentNode) stale[si].parentNode.removeChild(stale[si]);
 }
 } catch (eRmAll) {}
 }
 var existing = document.querySelector(
  isStorageStem
   ? 'script[src*="vc-storage"]'
   : isIdbStem
     ? 'script[src*="vc-idb"]'
     : 'script[src*="' + file + '"]'
 );
 if (existing) {
 try {
 var cur = String(existing.getAttribute("src") || "");
 if (cur === src || cur.indexOf(path + "?v=" + ver) !== -1) return;
 if (forceVer) {
 if (
 (file === "vc-nav-badges.js" ||
  file === "vc-chrome-sync.js" ||
  isStorageStem ||
  isIdbStem) &&
 existing.parentNode
 ) {
 existing.parentNode.removeChild(existing);
 } else {
 existing.setAttribute("src", src);
 return;
 }
 } else {
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
 var file = String(path || "").split("/").pop().replace(/\?.*$/, "");
 /* notifScopeSwitchHidden1: stamp -> canonical (niente 2o link look-core/ext) */
 if (/^vc-look-core(\.|$)/.test(file)) file = "vc-look-core.css";
 else if (/^vc-soft-fx(\.|$)/.test(file)) file = "vc-soft-fx.css";
 else if (/^vc-landing-ext(\.|$)/.test(file)) file = "vc-landing-ext.css";
 else if (/^vc-theme-light(\.|$)/.test(file)) file = "vc-theme-light.css";
 else if (/^vc-glow-form(\.|$)/.test(file)) file = "vc-glow-form.css";
 else if (/^vc-nav-menu-solid(\.|$)/.test(file)) file = "vc-nav-menu-solid.css";
 else if (/^vc-site-chrome-ui(\.|$)/.test(file)) file = "vc-site-chrome-ui.css";
 else if (/^vc-nav-chrome-fix(\.|$)/.test(file)) file = "vc-nav-chrome-fix.css";
 else if (/^vc-site-chrome-kit(\.|$)/.test(file)) file = "vc-site-chrome-kit.css";
 else if (/^vc-chrome-polish(\.|$)/.test(file)) file = "vc-chrome-polish.css";
 if (!file) return;
 path = String(path || "").split("?")[0];
 var existingById = null;
 try {
 if (file === "vc-site-chrome-ui.css") existingById = document.getElementById("vc-site-chrome-ui-css");
 else if (file === "vc-look-core.css") existingById = document.getElementById("vc-look-core-css");
 else if (file === "vc-soft-fx.css") existingById = document.getElementById("vc-soft-fx-css");
 else if (file === "vc-nav-chrome-fix.css") existingById = document.getElementById("vc-nav-chrome-fix-css");
 else if (file === "vc-site-chrome-kit.css") existingById = document.getElementById("vc-site-chrome-kit-css");
 else if (file === "vc-glow-fix.css") existingById = document.getElementById("vc-glow-fix-css");
 else if (file === "vc-nav-menu-solid.css") existingById = document.getElementById("vc-nav-menu-solid-css");
else if (file === "vc-chrome-polish.css") existingById = document.getElementById("vc-chrome-polish-css");
 } catch (eId) {
 existingById = null;
 }
 var existing = existingById || document.querySelector('link[href*="' + file + '"]');
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
 file === "vc-soft-fx.css" ||
 file === "vc-glow-fix.css" ||
 file === "vc-nav-menu-solid.css" ||
 file === "vc-site-chrome-ui.css" ||
 file === "vc-nav-chrome-fix.css" ||
 file === "vc-site-chrome-kit.css" ||
 file === "vc-chrome-polish.css";
 if (existing && stableChrome) {
 try {
 existing.media = "all";
 existing.removeAttribute("onload");
 if (file === "vc-look-core.css" && !existing.id) existing.id = "vc-look-core-css";
 if (file === "vc-soft-fx.css" && !existing.id) existing.id = "vc-soft-fx-css";
 if (file === "vc-glow-fix.css" && !existing.id) existing.id = "vc-glow-fix-css";
 if (file === "vc-nav-menu-solid.css" && !existing.id) existing.id = "vc-nav-menu-solid-css";
 if (file === "vc-site-chrome-ui.css" && !existing.id) existing.id = "vc-site-chrome-ui-css";
 if (file === "vc-nav-chrome-fix.css" && !existing.id) existing.id = "vc-nav-chrome-fix-css";
 if (file === "vc-site-chrome-kit.css" && !existing.id) existing.id = "vc-site-chrome-kit-css";
 var curStable = String(existing.getAttribute("href") || "");
 var verMismatch = forceVer && !hrefHasVer(curStable, forceVer);
 /* bootCssStable1: look-core/soft-fx ~1MB … href swap a caldo = FOUC "CSS che si prepara".
    Se lo sheet … gi… parsato, apri sipario e rinvia upgrade a idle. */
 if (verMismatch) {
 var bigPaint =
  file === "vc-look-core.css" ||
  file === "vc-soft-fx.css" ||
  file === "vc-chrome-polish.css";
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
  if (file === "vc-soft-fx.css") {
   window.__vcSoftFxHrefLocked = true;
   try {
    markSoftFxReady(existing);
   } catch (eMkSoft) {}
  } else if (file === "vc-look-core.css") {
   try {
    var softLink =
     document.getElementById("vc-soft-fx-css") ||
     document.querySelector('link[href*="vc-soft-fx"]');
    if (softLink) markSoftFxReady(softLink);
   } catch (eMkLook) {}
  }
  /* gateLookCoreFix1: MAI idle-swap look-core verso stamp nuovo (404 = sipario forever).
     soft-fx pu… ancora fare idle upgrade. */
  if (file !== "vc-look-core.css") {
  try {
   window.setTimeout(function () {
    try {
     if (document.hidden) return;
     var curIdle = String(existing.getAttribute("href") || "");
     if (forceVer && hrefHasVer(curIdle, forceVer)) return;
     existing.setAttribute("href", href);
    } catch (eIdleUp) {}
   }, 5000);
  } catch (eSchedIdle) {}
  }
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
 } catch (eStable) {}
 return;
 }
 if (existing) {
 try {
 var curHref = String(existing.getAttribute("href") || "");
 if (curHref === href || curHref.indexOf(path + "?v=" + ver) !== -1) {
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
 if (file === "vc-soft-fx.css") link.id = "vc-soft-fx-css";
 if (file === "vc-glow-fix.css") link.id = "vc-glow-fix-css";
 if (file === "vc-nav-menu-solid.css") link.id = "vc-nav-menu-solid-css";
 if (file === "vc-nav-chrome-fix.css") link.id = "vc-nav-chrome-fix-css";
 if (
 file === "vc-look-core.css" ||
 file === "vc-soft-fx.css" ||
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
 function lookCoreLink() {
 try {
 return (
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
 /* lookCoreGate1: se look-core non … ancora in DOM, soft-fx NON pu… aprire il sipario */
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
 /* siparioNoYoyo1: una volta aperto, non richiudere mai */
 try {
 if (document.documentElement.classList.contains("vc-soft-fx-ready")) return true;
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
 /* bootOneShot2: CSS ready â‰   aprire pagina — aspetta chrome loadDone (un solo release) */
 try {
  window.__vcSoftFxCssReadyAt = Date.now();
  if (!window.__vcBootOneShotLiftArmed) {
   window.__vcBootOneShotLiftArmed = 1;
   (function liftAfterChromeOnce() {
    try {
     var rootLift = document.documentElement;
     if (rootLift.classList.contains("vc-cine-curtain-off") && rootLift.classList.contains("vc-page-cine-ready")) {
      return;
     }
     var chromeDone = window.__vcChromeLoadDone === true;
     var t0 = Number(window.__vcCineBootStartedAt || window.__vcSoftFxCssReadyAt || 0) || 0;
     var ageLift = t0 ? Date.now() - t0 : 0;
     /* toastSyncAll2: hard 6.5s (era 2.8s → early curtain / 2° load) */
     if (chromeDone || ageLift >= 6500) {
      rootLift.classList.add("vc-cine-curtain-off", "vc-page-cine-ready");
      if (chromeDone) {
       rootLift.classList.remove(
        "vc-page-cine-boot",
        "vc-chrome-bar-loading",
        "vc-loading-scroll-lock",
        "vc-loader-blocking-live",
        "vc-interaction-hold"
       );
       try {
        var progLift = document.getElementById("vc-site-progress");
        if (progLift) progLift.classList.remove("is-loading");
       } catch (eProgLift) {}
      } else {
       rootLift.classList.remove("vc-page-cine-boot", "vc-interaction-hold");
       rootLift.classList.add("vc-loading-scroll-lock", "vc-chrome-bar-loading");
      }
      return;
     }
     window.setTimeout(liftAfterChromeOnce, 40);
    } catch (eLiftOnce) {}
   })();
  }
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
  var v = ver || (typeof SITE_CHROME_KIT_VER !== "undefined" ? SITE_CHROME_KIT_VER : "20261016chromeGap1");
  /* homeCssAlign1: mai lasciare siteChromeKit5 (gap/account grezzi vs feedback) */
  if (/siteChromeKit5|userMqFgRun/i.test(String(v || ""))) v = "20261016chromeGap1";
  try {
   if (document.body && !document.body.id) document.body.id = "top";
   if (document.body && document.body.classList && !document.body.classList.contains("vc-body")) {
    document.body.classList.add("vc-body");
   }
  } catch (eTop) {}
  try {
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
    if (curCss.indexOf(String(v)) < 0 || curCss.indexOf(wantCss) < 0) kitCss.setAttribute("href", wantCss);
    if (kitCss.parentNode) kitCss.parentNode.appendChild(kitCss);
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
 var fix = document.getElementById("vc-nav-chrome-fix-css");
 if (!fix) fix = document.querySelector('link[href*="vc-nav-chrome-fix.css"]');
 if (!fix) {
 appendStylesheet("/css/vc-nav-chrome-fix.css", ver || NAV_CHROME_FIX_VER);
 fix = document.getElementById("vc-nav-chrome-fix-css") || document.querySelector('link[href*="vc-nav-chrome-fix.css"]');
 }
 if (!fix || !fix.parentNode) return;
 fix.id = "vc-nav-chrome-fix-css";
 fix.media = "all";
 var verOkFix = true;
 if (ver) {
 var cur = String(fix.getAttribute("href") || "");
 verOkFix = hrefHasVer(cur, ver);
 /* notifBadgeSocial2: sempre file stampato fix (bypass CDN query stale) */
 var want = "/css/vc-nav-chrome-fix." + String(ver) + ".css?v=" + String(ver);
 if (cur.indexOf(want) < 0) {
 fix.setAttribute("href", want);
 }
 }

 /* siteChromeKit2: CSS+JS condivisi (no style-tag inline) */
 try {
  pinSiteChromeKitLast(
    typeof SITE_CHROME_KIT_VER !== "undefined" && SITE_CHROME_KIT_VER
      ? SITE_CHROME_KIT_VER
      : "20261016chromeGap1"
  );
 } catch (eKitPin) {}
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
 .replace(/border:1px solid rgba\(255,255,255,\.1\)!important/g, "border:2px solid transparent!important")
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
 if (String(link.getAttribute("href") || "").indexOf(v) === -1) {
 link.setAttribute("href", want);
 }
 var mount = document.body || document.documentElement;
 if (mount) mount.appendChild(link);
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
var SOFT_FX_VER = vcAssetVer("SOFT_FX_VER", "20261017statOpenChip1");
var STICKY_CHROME_VER = vcAssetVer("STICKY_CHROME_VER", "20261016legalTocKill1");
var NAV_USER_NOFLASH_VER = vcAssetVer("NAV_USER_NOFLASH_VER", "20261010navUserNoFlash1");
 /* gateLookCoreFix1: cueTextSettle2 stamp mai pubblicato ? 404 ? sipario eterno */
 /* notifScopeSwitchHidden1: look-core con :not([hidden]) su Personali|Inbox switcher */
 var LOOK_CORE_VER = vcAssetVer("LOOK_CORE_VER", "20261017sepPhoneGrad2");
var EMOJI_COLOR_VER = vcAssetVer("EMOJI_COLOR_VER", "20261011inputLagKill1");
var EMOJI_RENDER_VER = vcAssetVer("EMOJI_RENDER_VER", "20261016bugListBoot1");
/* chromeUiOauthFix1: NON riusare stamp OAuth/logout come filename … file assente = 404 chrome UI */
/* userMqStampFix1: default = userMqFgRun5 (marquee nome), non bootToastUnstick1 */
var NAV_CHROME_VER = vcAssetVer("NAV_CHROME_VER", "20261017ptrScrollYoYoKill1");
var BOOT_KIT_VER = vcAssetVer("BOOT_KIT_VER", "20261014mqCssCursor2");
var NAV_CHROME_FIX_VER = vcAssetVer("NAV_CHROME_FIX_VER", "20261016cssConsol1");
var VC_CHROME_VER = vcAssetVer("VC_CHROME_VER", "20261015feedbackLayout1");
var TW_BUILD_VER = vcAssetVer("TW_BUILD_VER", "20260913pageAlign1");
/* cssLikeFeedback1: page-bundle canon (stesso hash di /feedback/) — no landing-core inject */
var PAGE_BUNDLE_HREF =
  "/css/pages/vc-page-bundle.5e2193f7f482.css?v=20261014tipMetalFix1";
var LANDING_CORE_VER = vcAssetVer("LANDING_CORE_VER", "20261017statSepAlign2");
 /* siteChromeKit2: CSS+JS condivisi (badge/Esci/toast/cue/body#top) — last-wins unico */
  var SITE_CHROME_KIT_VER = vcAssetVer("SITE_CHROME_KIT_VER", "20261017ptrVinylCue1");
  /* homeCssAlign1: HTML con asset-versions stamp vecchio (sipario/wikiCore) forza
     chrome/soft sbagliati — rifiuta e usa canon = feedback. */
  (function refuseStaleChromeSoft() {
    try {
      if (/userMqFgRun|userMqKeepAlive|siparioLoad|wikiCoreRestore|mqCpuIdle3/i.test(String(NAV_CHROME_VER || ""))) {
        NAV_CHROME_VER = "20261016homeChromeAlign5";
      }
      if (/userMqFgRun|userMqKeepAlive|siparioLoad|wikiCoreRestore|mqCpuIdle3/i.test(String(SOFT_FX_VER || ""))) {
        SOFT_FX_VER = "20261016loadClickGate1";
      }
      if (/siteChromeKit5|userMqFgRun/i.test(String(SITE_CHROME_KIT_VER || ""))) {
        SITE_CHROME_KIT_VER = "20261016chromeGap1";
      }
      if (/userMqFgRun|navPromoGhost/i.test(String(NAV_CHROME_FIX_VER || ""))) {
        NAV_CHROME_FIX_VER = "20261016cssConsol1";
      }
    } catch (eRefuse) {}
  })();
 var KICKER_HACK_VER = vcAssetVer("KICKER_HACK_VER", "20261009cueTextSettle2");
 /* violPass12 */
 var CHROME_SYNC_VER = vcAssetVer("CHROME_SYNC_VER", "20261017chromePrefs401b");
 var STORAGE_VER = vcAssetVer("STORAGE_VER", "20261015vcStorage2");
 var IDB_VER = vcAssetVer("IDB_VER", "20261015pushIdb1");
 var NAV_BADGES_VER = vcAssetVer("NAV_BADGES_VER", "20261015vcStorage2");
 /* notifSheetStayOpen1: outside close non combatte portalGuard/sheet aperto */
 var NOTIF_CHROME_VER = vcAssetVer("NOTIF_CHROME_VER", "20261011notifSheetCloseLayout1");
 /* notifBellOpen1: load vc-landing-notif.* (full bell), NOT thin vc-landing.*
    titleSepFix1: NON riusare stamp title come filename landing (rompe SEP/bell) */
 var LANDING_NOTIF_VER = vcAssetVer("LANDING_NOTIF_VER", "20261017ptrVinylCue1");
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
 /* loadToastLinger1: Caricamento… toast su tutte le pagine finché loading; hide con linger */
 try {
  (function bootLoadToastLinger() {
   if (window.__vcBootLoadToastArmed) return;
   window.__vcBootLoadToastArmed = 1;
   var active = false;
   var poll = null;
   var stableReady = 0;
   var ended = false;
   var latchedDone = false;
   function chromeSettled(r) {
    try {
     return (
      window.__vcChromeLoadDone === true &&
      (r.classList.contains("vc-chrome-scroll-armed") || window.__vcChromeScrollArmed === true)
     );
    } catch (eS) {
     return false;
    }
   }
   function barStillLoading(r) {
    try {
     /* barOneShot1: toast/scroll restano finché paint 100% + loadDone */
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
   function bootApisStillPending(r) {
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
     return false;
    } catch (eApi) {
     return false;
    }
   }
   function stillLoading() {
    try {
     var r = document.documentElement;
     if (!r) return true;
     /* bootToastNoFlash1: dopo latch non riaprire mai in questo document */
     if (latchedDone) return false;
     if (window.__vcBootLoadToastLatched) return false;
     /* sipario = loading (toast nascosto sotto fullscreen) */
     if (!r.classList.contains("vc-cine-curtain-off")) return true;
     /* loadGateHold1: toast fino a barra+chrome+API; min linger post-sipario */
     if (barStillLoading(r)) return true;
     if (bootApisStillPending(r)) return true;
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
       if (Date.now() - pollT0 > 16000) {
         stopPoll();
         return;
       }
       tick();
      } catch (eTickP) {}
     }, 180);
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
     /* loadSyncPack1: pending cleared & chrome done → reclaim scroll unlock if still locked */
     try {
      if (
       stableReady === 1 &&
       window.__vcChromeLoadDone &&
       document.documentElement.classList.contains("vc-loading-scroll-lock") &&
       typeof window.__vcForceUnlockChromeScroll === "function"
      ) {
       window.__vcForceUnlockChromeScroll("pendingCleared");
      }
     } catch (eUnlockPend) {}
     /* loadGateHold1: ~3 tick (~540ms) stabili prima di chiudere toast */
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
    /* hard wall 8s */
    window.setTimeout(function () {
     try { endLoad(); } catch (eWall) {}
     try {
      if (typeof window.__vcForceUnlockChromeScroll === "function") {
       window.__vcForceUnlockChromeScroll("toastSyncAll2Hard");
      }
     } catch (eHard) {}
    }, 8000);
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
     var mo = new MutationObserver(tick);
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
 var FOOTER_SYS_STATUS_VER = vcAssetVer("FOOTER_SYS_STATUS_VER", "20261017footerSysLook7");
 var CHROME_PILL_FOOTER_VER = vcAssetVer("CHROME_PILL_FOOTER_VER", "20261017staffPcAlign1");
 var OAUTH_HASH_KILL_VER = vcAssetVer("OAUTH_HASH_KILL_VER", "20261010oauthHashKill1");
 var LOGOUT_GATE_VER = vcAssetVer("LOGOUT_GATE_VER", "20261010logoutGate1");
 var API_CACHE_VER = vcAssetVer("API_CACHE_VER", "20261009apiJankCut1");
 var TYPE_SFX_VER = vcAssetVer("TYPE_SFX_VER", "20261012confTypeSfxClash1");
var LANDING_EXT_VER = vcAssetVer("LANDING_EXT_VER", "20261016cssConsol1");
var PC_HERO_CENTER_VER = vcAssetVer("PC_HERO_CENTER_VER", "20261015heroAllPages1");
var HEADER_NAME_MARQUEE_VER = vcAssetVer("HEADER_NAME_MARQUEE_VER", "20261017wmResumeHover1");
 var I18N_VER = vcAssetVer("I18N_VER", "20261012navUsersClassifiche1");
 /* themeSwitchFix2: CSS switcher SEMPRE (anche dark senza theme-light) */
 var THEME_SWITCH_VER = vcAssetVer("THEME_SWITCH_VER", "20261006themeSwitchFix2");
 var WT_LAYOUT_VER = vcAssetVer("WT_LAYOUT_VER", "20261015ticketsMsgRailCpu1");
 var PERF_VER = vcAssetVer("PERF_VER", "20261017userMqSettleRun1");
 var USER_LEADER_VER = vcAssetVer("USER_LEADER_VER", "20261016perfRoiPack2");
 var PAGE_CINE_BOOT_VER = vcAssetVer("PAGE_CINE_BOOT_VER", "20261017ptrScrollYoYoKill1");
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
    if (existing.tagName === "LINK") {
     existing.setAttribute("href", href);
    }
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
 function tick() {
 try {
 /* homeScrollLock2: NON delegare a stub vuoto (vc-landing azzera __vcSyncLoaderScrollLock) */
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
 var toastHold =
  Number(window.__vcBootLoadToastHold || 0) > 0 &&
  !window.__vcBootLoadToastLatched &&
  root.classList.contains("vc-cine-curtain-off");
 /* loadGateHold1: toast ancora su → tieni lock/click anche se chrome già done */
 if (toastHold) live = true;
 /* homeScrollLock1: anche CON sipario già off, lock finché chrome load non è done */
 if (!pageOpen || !loadDone) {
 if (root.classList.contains("vc-page-cine-boot") && !root.classList.contains("vc-page-cine-ready")) live = true;
 if (root.classList.contains("vc-interaction-hold")) live = true;
 if (root.classList.contains("vc-user-leader-pending") || root.classList.contains("vc-user-profile-pending")) live = true;
 if (root.classList.contains("vc-rank-customize-pending") || root.classList.contains("vc-custom-profile-pending")) live = true;
 if (root.classList.contains("vc-session-verify-pending")) live = true;
 if (root.classList.contains("vc-staff-access-pending") && !root.classList.contains("vc-staff-app-revealed")) live = true;
 if (root.classList.contains("vc-dash-access-pending") && !root.classList.contains("vc-dash-access-ready")) live = true;
 if (!window.__vcChromeUiBooted && !loadDone) {
 try {
 var age = Date.now() - Number(window.__vcCineBootStartedAt || 0);
 if (!window.__vcCineBootStartedAt || age < 5200) live = true;
 } catch (eAge) {
 live = true;
 }
 }
 if (window.__vcChromeUiBooted && !loadDone) live = true;
 if (!window.__vcChromeScrollArmed && !loadDone) live = true;
 var progEl = document.getElementById("vc-site-progress");
 if (progEl && progEl.classList.contains("is-loading")) live = true;
 if (root.classList.contains("vc-chrome-bar-loading") && !loadDone) live = true;
 }
 if (!pageOpen) {
 if (!live && loaderAlive(document.getElementById("vc-shared-boot-overlay"))) live = true;
 if (!live && loaderAlive(document.getElementById("vc-cine-boot-curtain"))) live = true;
 if (!live && loaderAlive(document.getElementById("vc-roles-loading"))) live = true;
 if (!live && loaderAlive(document.getElementById("vc-staff-loading"))) live = true;
 if (!live && loaderAlive(document.getElementById("vc-ul-loading"))) live = true;
 if (!live && loaderAlive(document.querySelector(".vc-session-verify-overlay"))) live = true;
 }
 if (pageOpen && loadDone && window.__vcChromeScrollArmed && !toastHold) {
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
 try {
  var shOff = document.getElementById("vc-load-interact-shield");
  if (shOff && shOff.parentNode) shOff.parentNode.removeChild(shOff);
 } catch (eShOff) {}
 } else {
 root.classList.toggle("vc-loader-blocking-live", live);
 if (live) {
 root.classList.add("vc-loading-scroll-lock");
 if (!loadDone) root.classList.add("vc-chrome-bar-loading");
 /* homeScrollLock2: pin overflow inline — batte CSS late che mette auto */
 try {
  root.style.setProperty("overflow", "hidden", "important");
  root.style.setProperty("overflow-x", "hidden", "important");
  root.style.setProperty("overflow-y", "hidden", "important");
  if (document.body) {
   document.body.style.setProperty("overflow", "hidden", "important");
   document.body.style.setProperty("overflow-x", "hidden", "important");
   document.body.style.setProperty("overflow-y", "hidden", "important");
  }
 } catch (eOvPin) {}
 /* loadGateHold1: dopo sipario blocca click (overflow da solo non basta) */
 try {
  if (root.classList.contains("vc-cine-curtain-off")) {
   var sh = document.getElementById("vc-load-interact-shield");
   if (!sh) {
    sh = document.createElement("div");
    sh.id = "vc-load-interact-shield";
    sh.setAttribute("aria-hidden", "true");
    sh.setAttribute("data-vc", "loadGateHold1");
    sh.style.cssText =
     "position:fixed;inset:0;z-index:2147482900;pointer-events:auto;background:transparent;cursor:wait;";
    (document.body || root).appendChild(sh);
   }
  }
 } catch (eShOn) {}
 } else if (
 !root.classList.contains("vc-interaction-hold") &&
 !(loadDone && !window.__vcChromeScrollArmed)
 ) {
 root.classList.remove("vc-loading-scroll-lock");
 try {
  var shRm = document.getElementById("vc-load-interact-shield");
  if (shRm && shRm.parentNode) shRm.parentNode.removeChild(shRm);
 } catch (eShRm) {}
 }
 }
 } catch (eTick) {}
 }
 window.__vcSyncLoaderScrollLock = tick;
 tick();
 window.setTimeout(tick, 200);
 window.setTimeout(tick, 800);
 window.setTimeout(tick, 2000);
 /* jsWakeKill3: reclaim finché load done — hard cap 12s (mai forever) */
 var scrollLockT0 = Date.now();
 var scrollLockIv = window.setInterval(function () {
  try {
   if (
    (window.__vcChromeLoadDone === true && window.__vcChromeScrollArmed) ||
    Date.now() - scrollLockT0 > 12000
   ) {
    try {
     window.clearInterval(scrollLockIv);
    } catch (eClrIv) {}
    return;
   }
   window.__vcSyncLoaderScrollLock = tick;
   tick();
  } catch (eInt) {}
 }, 400);
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
     /* toastSyncAll2: CSS ready OK; curtain-off solo chrome done o hard 6.5s */
     if (pageBootingEarly && whyS.indexOf("t6500") === -1 && whyS.indexOf("t4500") === -1) return;
     var chromeDoneGate = window.__vcChromeLoadDone === true;
     var bootAgeGate = 0;
     try {
      var tBoot = Number(window.__vcCineBootStartedAt || 0) || 0;
      bootAgeGate = tBoot ? Date.now() - tBoot : 0;
     } catch (eAgeG) {}
     var allowCurtain =
      chromeDoneGate || bootAgeGate >= 6500 || whyS.indexOf("t6500") !== -1;
     root.classList.add(
      "vc-look-core-ready",
      "vc-soft-fx-ready",
      "vc-theme-light-ready",
      "vc-core-styles-ready",
      "vc-home-styles-ready",
      "vc-styles-ready",
      "vc-page-cine-ready"
     );
     if (allowCurtain) {
      root.classList.add("vc-cine-curtain-off");
      root.classList.remove("vc-page-cine-boot");
     }
     try {
      document.dispatchEvent(new CustomEvent("vc:soft-fx-ready", { detail: { reason: String(why || "failsafe") } }));
     } catch (eEv) {}
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
    scrCss.setAttribute("data-vc", "siparioLoadPage2");
    scrCss.textContent =
     "html:not(.vc-cine-curtain-off) #vc-boot-load-screen{position:fixed!important;inset:0!important;" +
     "z-index:2147483100!important;display:flex!important;flex-direction:column!important;" +
     "align-items:center!important;justify-content:center!important;gap:.95rem!important;" +
     "padding:1.5rem!important;margin:0!important;box-sizing:border-box!important;" +
     "pointer-events:none!important;border:0!important;border-radius:0!important;box-shadow:none!important;" +
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
     "overflow:visible!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;" +
     "filter:none!important;box-shadow:none!important}" +
     "#vc-site-progress.is-loading{opacity:1!important;visibility:visible!important;display:block!important}" +
     "#vc-site-progress__bar{display:block!important;height:100%!important;width:100%!important;" +
     "transform-origin:left center!important;background:#d4a888!important;" +
     "background-image:linear-gradient(90deg,#8f6b3f,#c49a72,#e8c9a8,#fffaf3,#e8c9a8,#d4a888,#b88968)!important;" +
     "box-shadow:0 0 4px rgba(255,250,243,.65),0 0 10px rgba(212,168,136,.8),0 0 18px rgba(184,137,104,.4)!important;" +
     "filter:none!important;backdrop-filter:none!important}";
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
    }, 50);
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
/* toastFont1: Cormorant/Inter @font-face su TUTTE le pagine (prima solo home HTML) */
try {
  appendStylesheet("/css/vc-fonts.css", "20261016toastFont1");
} catch (eFontsCss) {}
appendStylesheet("/css/vc-look-core." + LOOK_CORE_VER + ".css", LOOK_CORE_VER);
try {
  if (pathNeedsPcHeroCenter()) {
    appendStylesheet("/css/vc-pc-hero-center." + PC_HERO_CENTER_VER + ".css", PC_HERO_CENTER_VER);
  }
} catch (ePcHeroCenter) {}
appendStylesheet("/css/vc-soft-fx." + SOFT_FX_VER + ".css", SOFT_FX_VER);
/* chromeAlignToast1 + toastHug1: sand toast last-wins; host stretto al testo (no 22rem vuoti) */
try {
  var toastSand = document.getElementById("vc-chromeAlignToast1");
  if (!toastSand) {
    toastSand = document.createElement("style");
    toastSand.id = "vc-chromeAlignToast1";
    (document.head || document.documentElement).appendChild(toastSand);
  }
  toastSand.setAttribute("data-vc", "20261016toastFont1");
  toastSand.textContent =
    ".vc-dash-save-toast-host,.vc-site-toast-host,.vc-staff-toast-host,.vc-wt-toast-host,.vc-cpf-toast-host,#vc-site-toast-host,#vc-staff-toast-host,#vc-wt-toast-host,#vc-custom-profile-toast-host,#vc-profile-extras-toast-host{" +
    "position:fixed!important;left:50%!important;right:auto!important;transform:translateX(-50%)!important;" +
    "width:max-content!important;max-width:min(92vw,22rem)!important;" +
    "display:flex!important;justify-content:center!important;align-items:center!important;margin:0!important;padding:0!important}" +
    ".vc-dash-save-toast,.vc-site-toast,[data-vc-boot-load-toast],.vc-site-toast-host .vc-dash-save-toast,#vc-site-toast-host .vc-dash-save-toast,#vc-site-toast-host [data-vc-boot-load-toast]{width:max-content!important;max-width:100%!important;border:1px solid rgba(236,205,176,.45)!important;background:linear-gradient(145deg,#17130f,#100c09)!important;box-shadow:0 12px 36px rgba(0,0,0,.5),0 0 0 1px rgba(255,247,236,.12)!important}" +
    ".vc-dash-save-toast.is-error,.vc-site-toast.is-error,#vc-site-toast-host .vc-dash-save-toast.is-error{border-color:rgba(248,113,113,.45)!important;background:linear-gradient(145deg,rgba(36,16,16,.96),rgba(48,18,18,.92))!important}" +
    ".vc-dash-save-toast__icon,.vc-site-toast__icon,#vc-site-toast-host .vc-dash-save-toast__icon,.vc-dash-save-toast.is-pending .vc-dash-save-toast__icon{background:linear-gradient(180deg,#eccdb0,#6f4e37)!important;color:#fff!important}" +
    ".vc-dash-save-toast.is-error .vc-dash-save-toast__icon,#vc-site-toast-host .vc-dash-save-toast.is-error .vc-dash-save-toast__icon{background:linear-gradient(180deg,#f87171,#b91c1c)!important}" +
    ".vc-dash-save-toast__text,.vc-site-toast__text,#vc-site-toast-host .vc-dash-save-toast__text,[data-vc-boot-load-toast]{color:rgba(255,247,236,.94)!important;white-space:nowrap!important}";
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
appendStylesheet("/css/vc-chrome-polish." + vcAssetVer("CHROME_POLISH_VER", "20261015navPromoGhost2") + ".css", vcAssetVer("CHROME_POLISH_VER", "20261015navPromoGhost2")); /* navPromoGhost2 */

/* pcHeroCenterInjectLate */
try {
  if (pathNeedsPcHeroCenter()) {
    appendStylesheet("/css/vc-pc-hero-center." + (typeof PC_HERO_CENTER_VER !== "undefined" ? PC_HERO_CENTER_VER : "20261015pcHeroCenter5") + ".css", typeof PC_HERO_CENTER_VER !== "undefined" ? PC_HERO_CENTER_VER : "20261015pcHeroCenter5");
  }
} catch (ePcHeroLate) {}

/* themeSwitchFix2: layout switcher sempre (non dipende da theme-light) */
appendStylesheet("/css/vc-theme-switch.20261006themeSwitchFix2.css", THEME_SWITCH_VER);
 /* noCssFlash1: MAI rimuovere glow/nav/chrome-ui (DropLegacyChrome ? FOUC secondi) */
 try {
  /* wmUlSingleBar2b: path stampato (CF cache ignora ?v= sul bare chrome-ui) */
  appendStylesheet("/css/vc-site-chrome-ui." + NAV_CHROME_VER + ".css", NAV_CHROME_VER);
  appendStylesheet("/css/vc-nav-menu-solid.css", NAV_CHROME_VER);
  appendStylesheet("/css/vc-glow-form.css", "20260914softFxNoFouc2");
  try {
   document.documentElement.classList.add("vc-chrome-css-ready");
  } catch (eChromeReady) {}
 } catch (eKeepChrome) {}
 /* homeCssLikeFb1 / cssLikeFeedback3: TUTTE le pagine = page-bundle (chrome come feedback).
    Home: + page-home last-wins solo hero. KILL landing-ext/tw/core. */
 try {
  var _pathHome = false;
  try {
    var _pp = String(location.pathname || "/").replace(/\/+$/, "") || "/";
    _pathHome = _pp === "/" || _pp === "/index.html";
  } catch (ePathHome) {}
  var _hasBundle =
    document.getElementById("vc-page-bundle-css") ||
    document.querySelector('link[href*="page-bundle"]');
  var _hasHome = document.querySelector('link[href*="vc-page-home"]');
  try {
    document
      .querySelectorAll(
        'link[href*="vc-landing-ext"],link[href*="landing-ext"],link[href*="vc-landing-core"],link[href*="tw-build"],link[href*="vc-chrome"],link[href*="vc-page-home"],link#vc-page-home-css,link[href*="page-bundle"],link#vc-page-bundle-css'
      )
      .forEach(function (l) {
        try {
          var h = String(l.href || l.getAttribute("href") || "");
          if (/landing-ext|landing-core|tw-build/.test(h)) {
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
  _hasBundle =
    document.getElementById("vc-page-bundle-css") ||
    document.querySelector('link[href*="page-bundle"]');
  if (!_hasBundle) {
    try {
      var pb = document.createElement("link");
      pb.rel = "stylesheet";
      pb.id = "vc-page-bundle-css";
      pb.href =
        typeof PAGE_BUNDLE_HREF !== "undefined"
          ? PAGE_BUNDLE_HREF
          : "/css/pages/vc-page-bundle.5e2193f7f482.css?v=20261014tipMetalFix1";
      pb.media = "all";
      pb.setAttribute("data-vc", "homeCssLikeFb1");
      (document.head || document.documentElement).appendChild(pb);
      _hasBundle = pb;
    } catch (ePb) {}
  } else {
    try {
      _hasBundle.id = _hasBundle.id || "vc-page-bundle-css";
      (document.head || document.documentElement).appendChild(_hasBundle);
    } catch (eMovePb) {}
  }
  if (_pathHome) {
    try {
      var phExist =
        document.getElementById("vc-page-home-css") ||
        document.querySelector('link[href*="vc-page-home"]');
      if (!phExist) {
        var ph = document.createElement("link");
        ph.rel = "stylesheet";
        ph.id = "vc-page-home-css";
        ph.href = "/css/vc-page-home.css?v=20261017statSepAlign2";
        ph.media = "all";
        ph.setAttribute("data-vc", "homeCssLikeFb1");
        (document.head || document.documentElement).appendChild(ph);
        _hasHome = ph;
      } else {
        try {
          phExist.id = phExist.id || "vc-page-home-css";
          (document.head || document.documentElement).appendChild(phExist);
        } catch (eMovePh) {}
        _hasHome = phExist;
      }
    } catch (ePh) {}
  }
  /* homeChromeGap4: gap SEMPRE (anche con page-home) — promo + account popover */
  {
    /* base promo+account (anche con bundle — feedback lo ha nel bundle, gap last-wins ok) */
    if (!document.getElementById("vc-chrome-gap1-css")) {
      var gapSt = document.createElement("style");
      gapSt.id = "vc-chrome-gap1-css";
      gapSt.setAttribute("data-vc", "homeChromeGap4");
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
        "border:1px solid rgba(212,168,136,.28)!important;background:#100c09!important;" +
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
 appendScript("/js/vc-footer-end-breath.20261006bootFast1.js", FOOTER_BREATH_VER);
 try {
  appendStylesheet("/css/vc-footer-sys-status." + FOOTER_SYS_STATUS_VER + ".css", FOOTER_SYS_STATUS_VER);
  appendScript("/js/vc-footer-sys-status." + FOOTER_SYS_STATUS_VER + ".js", FOOTER_SYS_STATUS_VER);
 } catch (eFooterSys) {}
 try {
  /* chromePillFooter1 + sepGlowUnify1: bare path (stamped file match rotto da querySelector con .) */
  appendStylesheet("/css/vc-chrome-pill-footer-fix.css", CHROME_PILL_FOOTER_VER);
  /* force stamped href (CF/immutable) */
  try {
    var pillLinks = document.querySelectorAll('link[href*="vc-chrome-pill-footer-fix"]');
    var pillHref =
      "/css/vc-chrome-pill-footer-fix." + CHROME_PILL_FOOTER_VER + ".css?v=" + CHROME_PILL_FOOTER_VER;
    if (!pillLinks.length) {
      var pill = document.createElement("link");
      pill.rel = "stylesheet";
      pill.href = pillHref;
      pill.id = "vc-chrome-pill-footer-fix-css";
      (document.head || document.documentElement).appendChild(pill);
    } else {
      for (var pi = 0; pi < pillLinks.length; pi++) {
        try {
          pillLinks[pi].setAttribute("href", pillHref);
          if (!pillLinks[pi].id) pillLinks[pi].id = "vc-chrome-pill-footer-fix-css";
        } catch (ePillHref) {}
      }
    }
  } catch (ePillForce) {}
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
          var kids = Array.prototype.slice.call(snav.children || []);
          var i;
          for (i = kids.length - 1; i >= 0; i -= 1) {
            if (kids[i] && kids[i].classList && kids[i].classList.contains("vc-snav-sep")) {
              snav.removeChild(kids[i]);
            }
          }
          kids = Array.prototype.slice.call(snav.children || []);
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
          var sponsorEl = null;
          var supportEl = null;
          for (i = 0; i < kids.length; i += 1) {
            if (!sponsorEl && isSponsorEl(kids[i])) sponsorEl = kids[i];
            if (!supportEl && isSupportEl(kids[i])) supportEl = kids[i];
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
          snav.setAttribute("data-vc-sep-wired", "20261017snavSepOnly1");
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
              window.clearTimeout(window.__vcSnavSepMoT);
              window.__vcSnavSepMoT = window.setTimeout(ensureHeaderSnavSeps, 80);
            } catch (eMoT) {}
          });
          window.__vcSnavSepMo.observe(snavMoRoot, { childList: true, subtree: true });
        }
      } catch (eMo) {}
    } catch (eEnsSep) {}
  } catch (eSepEverywhere) {}
  /* navPromoGhost1: last-wins inline — batte polish/pill stale + page-bundle su /classifiche */
  try {
    var polishVer = vcAssetVer("CHROME_POLISH_VER", "20261015navPromoGhost2");
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
        "background-origin:padding-box,border-box!important;background-clip:padding-box,border-box!important;" +
        "-webkit-background-clip:padding-box,border-box!important;border:1px solid transparent!important;" +
        "color:#1a120e!important;-webkit-text-fill-color:#1a120e!important;opacity:1!important}" +
        'html[data-vc-theme="light"] body.vc-body #header-quick-actions #vc-header-promo-btn :is(.vc-header-promo-btn__label,.vc-header-promo-btn__badge,.vc-header-promo-btn__unit,.vc-header-promo-btn__track,span),' +
        'html[data-vc-theme="light"] body.vc-body header #vc-header-promo-btn :is(.vc-header-promo-btn__label,.vc-header-promo-btn__badge,.vc-header-promo-btn__unit,span){' +
        "color:#1a120e!important;-webkit-text-fill-color:#1a120e!important;opacity:1!important;background-image:none!important}";
      (document.head || document.documentElement).appendChild(ghost);
    }
    var scrubStaleChrome = function () {
      try {
        var pv = vcAssetVer("CHROME_POLISH_VER", "20261015navPromoGhost2");
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
   appendStylesheet("/css/vc-emoji-color." + EMOJI_COLOR_VER + ".css", EMOJI_COLOR_VER);
  }
 } catch (eEmojiCss) {}
 try {
 if (!window.VcApiCache || !window.VcApiCache.__siteApiW4) {
 appendScript("/js/vc-api-cache.js", API_CACHE_VER);
 }
 } catch (eApiCache) {
 appendScript("/js/vc-api-cache.js", API_CACHE_VER);
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
    var chromeUiPath = "/js/vc-site-chrome-ui." + NAV_CHROME_VER + ".js";
    var chromeUiSrc = chromeUiPath + "?v=" + NAV_CHROME_VER;
    var chromeExisting = document.querySelector('script[src*="vc-site-chrome-ui"]');
    if (!chromeExisting) {
     var chromeS = document.createElement("script");
     chromeS.src = chromeUiSrc;
     chromeS.defer = true;
     chromeS.onerror = function () {
      try {
       if (document.querySelector('script[src*="vc-site-chrome-ui.js"]')) return;
       var bare = document.createElement("script");
       bare.src = "/js/vc-site-chrome-ui.js?v=" + NAV_CHROME_VER;
       bare.defer = true;
       (document.head || document.documentElement).appendChild(bare);
      } catch (eBare) {}
     };
     (document.head || document.documentElement).appendChild(chromeS);
    }
   } catch (eChromeUi) {
    try {
     appendScript("/js/vc-site-chrome-ui.js", NAV_CHROME_VER);
    } catch (eChromeUi2) {}
   }
  }
  function arm() {
   if (curtainReady()) {
    try {
     if (window.requestIdleCallback) window.requestIdleCallback(loadChunks, { timeout: 1000 });
     else window.setTimeout(loadChunks, 60);
    } catch (eA) {
     loadChunks();
    }
    return;
   }
   try {
    document.addEventListener(
     "vc:page-cine-ready",
     function () {
      window.setTimeout(loadChunks, 40);
     },
     { once: true },
    );
   } catch (eL) {}
   window.setTimeout(loadChunks, 2400);
  }
  arm();
 })();
 try {
  if (!window.VcSitePresence || window.__vcSitePresenceBooted !== "bootCoherentFast1")
   appendScript("/js/vc-site-presence.js", "20261008bootCoherentFast1");
 } catch (eSitePresence) {
  appendScript("/js/vc-site-presence.js", "20261008bootCoherentFast1");
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
 var skipLandingNotif = !pathNeedsFullLanding();
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
   /* postCurtainLazy1: notif 500KB dopo sipario/idle — bell resta dopo paint */
   (function loadNotifPostCurtain() {
     function go() {
       try {
         appendScript("/js/vc-landing-notif." + LANDING_NOTIF_VER + ".js", LANDING_NOTIF_VER);
       } catch (eN) {}
     }
     function ready() {
       try {
         var r = document.documentElement;
         return r.classList.contains("vc-cine-curtain-off") || r.classList.contains("vc-page-cine-ready");
       } catch (eR) { return true; }
     }
     function arm() {
       if (ready()) {
         try {
           if (window.requestIdleCallback) window.requestIdleCallback(go, { timeout: 1200 });
           else window.setTimeout(go, 80);
         } catch (eA) { go(); }
         return;
       }
       try {
         document.addEventListener("vc:page-cine-ready", function () { window.setTimeout(go, 40); }, { once: true });
       } catch (eL) {}
       window.setTimeout(go, 2400);
     }
     arm();
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
 setTimeout(goType, 1500);
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
  if (!hasFreshMq) appendScript(wantMq, mqVer);
  try {
   appendScript("/js/vc-header-name-marquee.js", mqVer);
  } catch (eMqBare) {}
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
 "html.vc-site-polish:not([data-vc-theme=\"light\"]) body.vc-body .discord-account-popover," +
 "html.vc-site-polish:not([data-vc-theme=\"light\"]) body.vc-body header .discord-account-popover," +
 "html.vc-site-polish:not([data-vc-theme=\"light\"]) body.vc-body#top header .discord-account-popover," +
 "html:not([data-vc-theme=\"light\"]) body.vc-body header .discord-account-popover{" +
 "overflow:visible!important;" +
 "border:1.5px solid transparent!important;border-color:transparent!important;" +
 "background-color:#100c09!important;" +
 "background-image:" +
 "radial-gradient(120% 90% at 0% 0%,rgba(236,205,176,.14),transparent 52%)," +
 "radial-gradient(90% 70% at 100% 0%,rgba(111,78,55,.18),transparent 48%)," +
 "linear-gradient(175deg,#17130f 0%,#100c09 55%,#0b0807 100%)," +
 "linear-gradient(135deg,rgba(255,247,236,.95),rgba(236,205,176,.88) 28%,rgba(212,168,136,.78) 52%,rgba(180,130,90,.82) 72%,rgba(236,205,176,.9))!important;" +
 "background-origin:padding-box,padding-box,padding-box,border-box!important;" +
 "background-clip:padding-box,padding-box,padding-box,border-box!important;" +
 "-webkit-background-clip:padding-box,padding-box,padding-box,border-box!important;" +
 "box-shadow:0 0 0 1px rgba(255,247,236,.24),0 0 16px rgba(212,168,136,.32),0 14px 36px rgba(0,0,0,.48)!important;" +
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
 "background:none!important;text-shadow:0 0 10px rgba(212,168,136,.35)!important}" +
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
 "background:transparent!important;background-color:transparent!important;background-image:none!important;box-shadow:none!important;border-color:transparent!important}" +
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
 "box-shadow:0 0 6px rgba(236,205,176,.62),0 0 12px rgba(168,118,82,.38)!important}" +
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
 "box-shadow:0 0 5px rgba(236,205,176,.48),0 0 10px rgba(168,118,82,.28)!important}" +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-item--active:hover::after," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-details.vc-snav-details--current>.vc-snav-summary:hover::after," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-details[open]>.vc-snav-summary:hover::after{" +
 "background:linear-gradient(90deg,rgba(255,247,236,.18),rgba(255,247,236,1) 18%,rgba(236,205,176,1) 50%,rgba(212,168,136,.98) 82%,rgba(255,247,236,.18))!important;" +
 "box-shadow:0 0 7px rgba(236,205,176,.72),0 0 14px rgba(168,118,82,.45)!important}" +
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
 "box-shadow:0 0 5px rgba(236,205,176,.48),0 0 10px rgba(168,118,82,.28)!important}" +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-panel .vc-snav-row.vc-snav-row--active::after," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-panel .vc-snav-row[aria-current=page]::after," +
 "html.vc-site-polish body.vc-body .vc-snav-panel a.vc-snav-row.vc-snav-row--active::after," +
 "html.vc-site-polish body.vc-body header .discord-account-popover__item.is-current::after," +
 "html.vc-site-polish body.vc-body .vc-lang-option.is-active::after{" +
 "content:\"\"!important;display:block!important;position:absolute!important;" +
 "left:.55rem!important;right:.55rem!important;bottom:.28rem!important;height:1.5px!important;width:auto!important;" +
 "border-radius:999px!important;pointer-events:none!important;" +
 "background:linear-gradient(90deg,rgba(255,247,236,.12),rgba(255,247,236,.98) 18%,rgba(236,205,176,.98) 50%,rgba(212,168,136,.95) 82%,rgba(255,247,236,.12))!important;" +
 "box-shadow:0 0 6px rgba(236,205,176,.62),0 0 12px rgba(168,118,82,.38)!important}" +
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
 "box-shadow:0 14px 36px rgba(60,40,24,.14)!important;" +
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
 "border:0!important;border-width:0!important;border-style:none!important;border-color:transparent!important;" +
 "box-shadow:none!important;outline:none!important;filter:none!important;-webkit-filter:none!important}" +
 "html.vc-site-polish body.vc-body > footer.vc-premium-footer .vc-premium-footer__social," +
 "html.vc-site-polish body.vc-body footer.vc-premium-footer .vc-premium-footer__social," +
 "html.vc-site-photo-bg.vc-perf-mid.vc-site-polish body.vc-body#top > footer.vc-premium-footer .vc-premium-footer__social," +
 "html body.vc-body > footer.vc-premium-footer .vc-premium-footer__social{" +
 "border:2px solid transparent!important;border-color:transparent!important;" +
 "background-color:var(--vc-nav-shell-fill,#140f0c)!important;" +
 "background-image:linear-gradient(var(--vc-nav-shell-fill,#140f0c),var(--vc-nav-shell-fill,#140f0c)),var(--vc-nav-ring)!important;" +
 "background-origin:padding-box,border-box!important;background-clip:padding-box,border-box!important;" +
 "-webkit-background-clip:padding-box,border-box!important;box-shadow:none!important}" +
 "html.vc-site-polish[data-vc-theme=\"light\"] body.vc-body > footer.vc-premium-footer .vc-premium-footer__social," +
 "html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme=\"light\"] body.vc-body#top > footer.vc-premium-footer .vc-premium-footer__social," +
 "html[data-vc-theme=\"light\"] .vc-premium-footer__social{" +
 "border:2px solid transparent!important;border-color:transparent!important;" +
 "background-color:var(--vc-nav-shell-fill-light,#f7f1ea)!important;" +
 "background-image:linear-gradient(var(--vc-nav-shell-fill-light,#f7f1ea),var(--vc-nav-shell-fill-light,#f7f1ea)),var(--vc-nav-ring-light)!important;" +
 "background-origin:padding-box,border-box!important;background-clip:padding-box,border-box!important;" +
 "-webkit-background-clip:padding-box,border-box!important;box-shadow:none!important}" +
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
 "border:2px solid transparent!important;border-color:transparent!important;" +
 "background-color:#100c09!important;" +
 "background-image:radial-gradient(120% 90% at 0% 0%,rgba(236,205,176,.12),transparent 52%)," +
 "radial-gradient(90% 70% at 100% 0%,rgba(111,78,55,.16),transparent 48%)," +
 "linear-gradient(175deg,#17130f 0%,#100c09 55%,#0b0807 100%),var(--vc-nav-ring)!important;" +
 "background-origin:padding-box,padding-box,padding-box,border-box!important;" +
 "background-clip:padding-box,padding-box,padding-box,border-box!important;" +
 "-webkit-background-clip:padding-box,padding-box,padding-box,border-box!important;box-shadow:none!important}" +
 "html.vc-site-polish:not(.vc-soft-fx-off):not([data-vc-theme=\"light\"]) body.vc-body.vc-users-page.vc-user-profile-page#top main :is(" +
 ".vc-user-profile-hero,.vc-user-profile-block,.vc-user-profile-disclosure,.vc-user-profile-accordion) :is(" +
 ".vc-user-profile-stat,.vc-user-profile-mini,.vc-user-profile-badges)," +
 "html.vc-site-polish:not(.vc-soft-fx-off):not([data-vc-theme=\"light\"]) body.vc-body.vc-user-profile-page#top main :is(" +
 ".vc-user-profile-hero,.vc-user-profile-block,.vc-user-profile-disclosure,.vc-user-profile-accordion) :is(" +
 ".vc-user-profile-stat,.vc-user-profile-mini,.vc-user-profile-badges){" +
 "border:2px solid transparent!important;border-width:2px!important;border-color:transparent!important;" +
 "background-color:#100c09!important;" +
 "background-image:radial-gradient(120% 90% at 0% 0%,rgba(236,205,176,.12),transparent 52%)," +
 "radial-gradient(90% 70% at 100% 0%,rgba(111,78,55,.16),transparent 48%)," +
 "linear-gradient(175deg,#17130f 0%,#100c09 55%,#0b0807 100%),var(--vc-nav-ring)!important;" +
 "background-origin:padding-box,padding-box,padding-box,border-box!important;" +
 "background-clip:padding-box,padding-box,padding-box,border-box!important;" +
 "-webkit-background-clip:padding-box,padding-box,padding-box,border-box!important;box-shadow:none!important}" +
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
 "border:2px solid transparent!important;border-color:transparent!important;" +
 "background-color:#faf6f0!important;" +
 "background-image:radial-gradient(120% 90% at 0% 0%,rgba(255,248,238,.92),transparent 52%)," +
 "radial-gradient(90% 70% at 100% 0%,rgba(212,168,136,.2),transparent 48%)," +
 "linear-gradient(175deg,#fffaf4 0%,#f7f1ea 48%,#efe6dc 100%),var(--vc-nav-ring-light)!important;" +
 "background-origin:padding-box,padding-box,padding-box,border-box!important;" +
 "background-clip:padding-box,padding-box,padding-box,border-box!important;" +
 "-webkit-background-clip:padding-box,padding-box,padding-box,border-box!important;box-shadow:none!important}" +
 "html.vc-site-polish[data-vc-theme=\"light\"]:not(.vc-soft-fx-off) body.vc-body.vc-users-page.vc-user-profile-page#top main :is(" +
 ".vc-user-profile-hero,.vc-user-profile-block,.vc-user-profile-disclosure,.vc-user-profile-accordion) :is(" +
 ".vc-user-profile-stat,.vc-user-profile-mini,.vc-user-profile-badges)," +
 "html.vc-site-polish[data-vc-theme=\"light\"]:not(.vc-soft-fx-off) body.vc-body.vc-user-profile-page#top main :is(" +
 ".vc-user-profile-hero,.vc-user-profile-block,.vc-user-profile-disclosure,.vc-user-profile-accordion) :is(" +
 ".vc-user-profile-stat,.vc-user-profile-mini,.vc-user-profile-badges){" +
 "border:2px solid transparent!important;border-width:2px!important;border-color:transparent!important;" +
 "background-color:#faf6f0!important;" +
 "background-image:radial-gradient(120% 90% at 0% 0%,rgba(255,248,238,.92),transparent 52%)," +
 "radial-gradient(90% 70% at 100% 0%,rgba(212,168,136,.2),transparent 48%)," +
 "linear-gradient(175deg,#fffaf4 0%,#f7f1ea 48%,#efe6dc 100%),var(--vc-nav-ring-light)!important;" +
 "background-origin:padding-box,padding-box,padding-box,border-box!important;" +
 "background-clip:padding-box,padding-box,padding-box,border-box!important;" +
 "-webkit-background-clip:padding-box,padding-box,padding-box,border-box!important;box-shadow:none!important}";
 (document.body || document.documentElement).appendChild(st);
 } catch (eInline) {}
 };
 var reinjectSolid = function () {
 /* navBootTrim1: una sola volta … DOMContentLoaded+load duplicavano pin/recalc */
 if (window.__vcSolidReinjected) return;
 window.__vcSolidReinjected = 1;
 try {
 appendStylesheet("/css/vc-nav-menu-solid.css", NAV_CHROME_VER);
 pinSoftFxLast(SOFT_FX_VER);
 pinNavChromeFixLast(NAV_CHROME_FIX_VER);
 injectSolidInline();
 } catch (eR) {}
 };
 if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", reinjectSolid);
 else window.setTimeout(reinjectSolid, 0);
 } catch (eRe) {}
 appendScript("/js/vc-view-as.js", "20261010viewAsNoOrphan1");
 } catch (eHelper) {}
 })();
})();
