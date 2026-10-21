/* lookStaticBorder1b */
/* 20261018backTopSheetHide1: hide #vc-site-back-top while notif sheet/drawer open */
/* 20261017siparioAlignAll2: curtain-off ≠ scroll open; unlock/toast solo post-barra 100% */
/* 20261017chromeArmStuck1: PtrRestoreDone ≠ scroll armed — no early-return con gate click sticky */
/* 20261019userMqIdlePause1: nome pause in settle (arm non thaw; reduced-motion no force-run) */
/* 20261019mqIdleResumeAll3b: NAV/SOFT/LOOK allineati (auth non downgrade soft-fx) */
/* 20261019mqIdleResumeAll2: NAV_CHROME_VER= soft-pause (viewAsGateClear1 caricava ancora tx=0) */
/* 20261019mqIdleResumeAll1: pause soft (no reset@0); nome+wordmark idle/bg; resume su wake/settle-drop */
/* 20261017chromeUiIdle3: settle soft-pause non strippa tx=0; bustle non thaw wordmark in idle */
/* 20261017chromeUiIdle2: wordmark idle = reset@0 (no testo spezzato); nome vivo FG; toast wall */
/* 20261017mqIdleWmUser1: wordmark pause in idle/settle; nome SEMPRE running in FG (solo tab-hidden) */
/* 20261017bootNoJumpNav1: unlock → TOP su navigate fresco (no Y sessionStorage mid-page) */
/* 20261017floatCoverFix1: freccia in hide-list; hide solo overlap reale (no band/card “vicina”) */
/* 20261017wmResumeHover1: wordmark resume BG/bustle (no armNav su track brand); hover anche clone */
/* 20261017userMqLikeWm1: nome = marquee vivo come wordmark (no pause settle + no transform:0 freeze) */
/* 20261017floatContentHide1: PIP + musica/tastiera/freccia auto-hide su footer/contenuto */
/* 20261017barOneShot1: stub→chrome continuo (no reset 0.14); toast/scroll solo dopo 100% */
/* 20261017progGlowUnify1: una sola barra sand-glow; load→100% visibile; scroll riparte da 0 stesso glow */
/* 20261020mqNoSnapSettle1: settle = soft pause (no reset@0 / no tx:0) */
/* 20261021barApiFastAll1: seconda barra (API) wall ~2s ovunque (era 5.5–6s); no wait CSS */
/* 20261020refreshRestoreEnd1: durante load pin SOLO a 0; restore Y una volta a fine unlock (no Y→0→Y) */
/* 20261020userMqHoverKeep1: arm/kick non reset@0 sotto hover (nome ripartiva; wordmark ok) */
/* 20261020mqHoverNoRestart1: hover marquee non reset@0 su pointerover figli */
/* 20261020phoneBellTapFree1: post-sipario tap campanella passa il loadClickGate
   (prima preventDefault su document catturava tutto finché chrome load). */
/* 20261017phoneBarBlur1: stub/gutter 12px + bloom bianco = blur telefono; right:0 + flat + kill stub */
/* 20261017barPostSip1: dopo sipario barra resta + avanza fino API; no arm-skip su curtain-off */
/* 20261016mqAnimKeep2: home usava still vc-perf.userMqIdlePause1 (anim:none settle) + soft-fx orphan */
/* 20261016mqAnimKeep1: settle = solo play-state paused (animation-name SEMPRE attivo) */
/* 20261016mqSettlePause1: settle = pause marquee; bustle = running senza reset anim */
/* 20261016chromeMqNoRst1: arm/settle senza reset animation (timeline continuo) */
/* 20261016chromeMqAlwaysFg1: nome+wordmark vivi in FG (cpu-settle non spegne più) */
/* 20261016userMqGuildAnim1: nome = STESSA anim vc-guild-name-marquee del wordmark (vc-nav-user-name-marquee era morta in cascade) */
/* 20261016userMqCssAlive1: nome = SOLO CSS keyframes (niente WAAPI/animation-name:none che lascia fermo) */
/* 20261016idleGifGlowFix1: idle settle → sleep cursor glow (inline hide) + ignore move */
/* 20261016loadSyncPack1: overlay sync — toast+scroll lock held while any API pending; boards-view; session guard; dash-overlay guard; 6s soft cap */
/* 20261015bootToastUnstick1: nome = WAAPI linear (CSS var/keyframe non affidabili); toast unstick bundle */
/* 20261015userMqDistFix1: nome = vc-nav-user-name-marquee (fallback 160px); dist sempre ≥100 */
/* 20261015userMqForceRun3: nome = STESSA anim vc-guild-name-marquee del wordmark; running in FG */
/* 20261015userMqForceRun2: nome SEMPRE running in FG (settle/idle non lo ferma); pausa solo tab nascosta */
/* 20261015userMqAlwaysRun1: nome SEMPRE running in FG (settle non lo ferma); pausa solo tab nascosta */
/* 20261015cursorSync1: alone cursore = transform sync su pointermove (no rAF lag) */
/* 20261015userMqLive2: nome SEMPRE running (anche vc-cpu-settle); VER bump bundle;
   pin specificity batte perf settle-pause; drawer + kick persistente */
/* 20261015userMqCss1: nome utente = CSS keyframes CONTINUI come wordmark
   (niente rAF burst/rest che lasciava il chip fermo dopo 2.5s) */
/* 20261015jsWakeIdle3: settle = rest permanente fino a TAP sul nome;
   MO/resize/kick NON riarmato burst (era 1–2.5k wake in uso);
   wordmark idle = CSS pause (perf); burst ~2.5s */
/* 20261015navUserMqCpu1: marquee phone/PWA a ~18fps (no rAF 60 = 40%+ Task Manager) */
/* 20261014fgDecorCpu1 */
/* cueMarginBar1 */
/* vcSiteChromeUi + navUnify1 — progress/back-top/cursor + GIF/marquee soft */
/* siparioWaitAllCss2: sipario=CSS; barra=solo API; lock scroll/gesture fino a fine */
/* loadBarGateAuth1: barra aspetta Discord auth + emoji; scrollbar nascosta anche su grad-baked */
/* violKillReflow3: scroll/vis hot-path = cache Y (no live scrollTop → Forced reflow) */
/* bootCoherentFast1: bake → barra più corta; emoji non blocca; event chrome-load-done */
/* scrollPostSiparioYoyo1: no scrollTo(0) da orphan/re-unlock dopo sipario (yoyo continuo) */
/* scrollMidYoyo1: load-freeze non pinna dopo sipario/ready / se Y>24 (yoyo mid-scroll) */
/* violKillConsole1: finishLoad/vis fuori da rAF + CSS stamp match */
/* bootOneShot1: se sipario già giù, NO 2° ciclo barra/lock (pagina aperta → stop) */
/* scrollBarLenFix1: post-load snappa a Y live (no resto scaleX~0.96 del load);
   ignora setBar(loading) dopo loadDone; rimuove stub CSS height:3px */
/* gestureLockBoot1: durante sipario/load blocca TUTTE le gesture (touch/pointer/pinch) */
/* bootBarScrollFast1: barra/API failsafe ~2.8s (era 10s); dopo sipario no freeze/yank scroll */
/* loadScrollAllStages1: is-loading/barra lockano scroll anche post-sipario (multi load) */
/* scrollLoadYoYoKill4: top-lock resta fino a UN scrollTo; no clearTopLock/snapBar 2° yoyo */
/* refreshScrollRestore1: F5 unlock ripristina Y (o lascia pending se doc corto) */
/* refreshRestoreEnd1: mid-load mai pin a Y session — solo unlock fa scrollTo(wantY) */
/* profileUnlockNoYank2: discard ≠ yank — se profilo/chrome già ready e liveY≥24, tieni Y */
/* mqNoRestart1: nav user marquee — no remount/t0 reset mid-spin */
/* loadBarFullReset1: load → scaleX(1) poi reset; scroll bar riparte da Y reale (no resto ~0.7) */
/* loadBarFullReset2: ANCHE forceUnlock/pageAlreadyOpen passano da 100% (non skip a metà) */
/* loadBarFullReset3: freeze tickLoad/setBar durante paint→1 (niente overwrite a 0.3) */
/* loadBarFullReset4: no re-armLoad dopo stub-full; scroll bar armed + loop dopo reset */
/* loadBarFullReset5: onScroll aggiorna __vcCachedScrollY (barra scroll non resta a 0) */
/* loadBarFullReset6: maxScroll force post-load (niente ratio ~0 con Y=500); pageOpen→full */
/* loadBarFullReset7: mai __vcChromeLoadDone durante completing / senza fullPainted */
/* backTopPhoneShow2: soglie phone + is-on !important (cache-bust Show1) */
/* backTopPcLate1: PC — freccia solo pagine lunghe + dopo scroll reale */
/* midScrollYankKill1: unlock/finishLoad/freeze non riportano a 0 se utente mid-scroll */
/* pageHang1: bundle bump con hang kill sitewide (theme MO + loader MO) */
/* refreshNoFooterJump1: no clamp footer mid-load; freeze non adotta Y session/bottom */
/* bootMidFlashKill1: navigate fresco + discard → top; mid solo con gesture reale */
/* loadBgContinue1: tab in background → load/barra/finish continuano (no rAF freeze) */
(function () {
  var VER = "20261021loadBgContinue1";
  if (window.__VC_SITE_CHROME_UI_BUNDLE === VER) return;
  window.__VC_SITE_CHROME_UI_BUNDLE = VER;
  /* legalLookCore1: PNG cursor ON; niente remount style body (recalc hang).
   * legalUnfreeze1: PNG cursor ON; niente remount style body.
   * cursorBackSip1: PNG cursor ON ovunque (alone glow resta off).
   * cursorGlowOff1b: alone + PNG cursor OFF (url() hover = hang feedback). */

  function vcIsFreshNavigate() {
    try {
      var list = performance.getEntriesByType && performance.getEntriesByType("navigation");
      if (list && list[0] && list[0].type) {
        var t = String(list[0].type || "");
        return t !== "reload" && t !== "back_forward";
      }
    } catch (eN) {}
    try {
      var legacy = performance.navigation && Number(performance.navigation.type);
      if (legacy === 1 || legacy === 2) return false;
    } catch (eL) {}
    return true;
  }
  function vcHasRealScrollGesture() {
    try {
      return window.__vcUserGestureScroll === 1;
    } catch (eG) {
      return false;
    }
  }
  /* toastHoldAll1: finish/unlock solo a gate idle (CSS+API+loader) */
  /* pendingBadgeVis2: CSS stamp allineato a NAV_CHROME (no 404 badge) */
  /* fgDecorCpu1 + cursorMqStable1: cursor inherit; glow off in cpu-settle */
  try {
    var btPin =
      document.getElementById("vc-back-top-solid-pin") ||
      document.getElementById("vc-back-top-conic-pin");
    if (!btPin) {
      btPin = document.createElement("style");
    }
    try {
      var staleConic = document.getElementById("vc-back-top-conic-pin");
      if (staleConic && staleConic !== btPin && staleConic.parentNode) {
        staleConic.parentNode.removeChild(staleConic);
      }
    } catch (eStaleBt) {}
    btPin.id = "vc-back-top-solid-pin";
    btPin.setAttribute("data-vc", "lookStaticBorder1e");
    btPin.textContent =
      "html body.vc-body #vc-site-back-top,html.vc-site-polish body.vc-body #vc-site-back-top," +
      "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body #vc-site-back-top," +
      "html.vc-site-polish:not([data-vc-theme=light]):not(.vc-soft-fx-off) body.vc-body #vc-site-back-top," +
      "html.vc-site-polish[data-vc-theme=light]:not(.vc-soft-fx-off) body.vc-body #vc-site-back-top," +
      "html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme=light]:not(.vc-soft-fx-off) body.vc-body#top #vc-site-back-top," +
      "html[data-vc-theme=light] #vc-site-back-top,#vc-site-back-top{" +
      "border:1.35px solid rgba(245,214,183,.38)!important;" +
      "box-shadow:none!important;filter:none!important;-webkit-filter:none!important;" +
      "background-image:none!important}" +
      "html body.vc-body #vc-site-back-top,html.vc-site-polish body.vc-body #vc-site-back-top," +
      "html.vc-site-polish:not([data-vc-theme=light]):not(.vc-soft-fx-off) body.vc-body #vc-site-back-top," +
      "html:not([data-vc-theme=light]) #vc-site-back-top,#vc-site-back-top{" +
      "background-color:#100c09!important;" +
      "background-image:linear-gradient(180deg,rgba(26,20,15,.96),rgba(16,12,9,.98))!important;" +
      "background-origin:padding-box!important;" +
      "background-clip:padding-box!important;-webkit-background-clip:padding-box!important}" +
      "html.vc-site-polish[data-vc-theme=light]:not(.vc-soft-fx-off) body.vc-body #vc-site-back-top," +
      "html.vc-site-photo-bg.vc-perf-mid.vc-site-polish[data-vc-theme=light]:not(.vc-soft-fx-off) body.vc-body#top #vc-site-back-top," +
      "html[data-vc-theme=light] #vc-site-back-top{" +
      "background-color:#faf6f0!important;" +
      "background-image:linear-gradient(180deg,#fffaf4,#f3ebe3)!important;" +
      "background-origin:padding-box!important;" +
      "background-clip:padding-box!important;-webkit-background-clip:padding-box!important;" +
      "box-shadow:none!important;filter:none!important}" +
      "html body.vc-body #vc-site-back-top:hover,html body.vc-body #vc-site-back-top:focus-visible," +
      "#vc-site-back-top:hover,#vc-site-back-top:focus-visible," +
      "html[data-vc-theme=light] #vc-site-back-top:hover,html[data-vc-theme=light] #vc-site-back-top:focus-visible{" +
      "box-shadow:none!important;filter:none!important}" +
      "html body.vc-body #vc-site-back-top .fa,html body.vc-body #vc-site-back-top > i," +
      "#vc-site-back-top .fa,#vc-site-back-top > i," +
      "#vc-site-back-top .fa::before,#vc-site-back-top > i::before," +
      "html:not([data-vc-theme=light]) #vc-site-back-top .fa::before," +
      "html:not([data-vc-theme=light]) #vc-site-back-top > i::before{" +
      "text-shadow:none!important;filter:none!important;-webkit-filter:none!important}";
    function remountBtPin() {
      try {
        var m = document.body || document.documentElement;
        if (btPin && m) m.appendChild(btPin);
      } catch (eRm) {}
    }
    remountBtPin();
    window.setTimeout(remountBtPin, 400);
    window.setTimeout(remountBtPin, 1200);
    window.setTimeout(remountBtPin, 2800);
  } catch (eBt) {}
  /* mqCssCursor2: nome utente = CSS keyframes come wordmark (no rAF scattante) */
  try {
    var mqPin = document.getElementById("vc-snav-user-marquee-pin");
    if (!mqPin) {
      mqPin = document.createElement("style");
      mqPin.id = "vc-snav-user-marquee-pin";
    }
    /* mqHeroMetal1c: settle pause SOLO fuori hover (transform:!important uccideva i keyframes) */
    mqPin.setAttribute("data-vc", "mqUlUserNoSnap1");
    mqPin.textContent =
      '@keyframes vc-guild-name-marquee{from{transform:translate3d(0,0,0)}' +
      'to{transform:translate3d(calc(-1 * var(--vc-marquee-distance,160px)),0,0)}}' +
      '@keyframes vc-nav-user-name-marquee{from{transform:translate3d(0,0,0)}' +
      'to{transform:translate3d(calc(-1 * var(--vc-marquee-distance,160px)),0,0)}}' +
      'html body.vc-body header .discord-profile-link__name[data-vc-nav-user-marquee],' +
      'html body.vc-body #header-quick-actions .discord-profile-link__name[data-vc-nav-user-marquee],' +
      'html body.vc-body #vc-mobile-nav-drawer .discord-profile-link__name[data-vc-nav-user-marquee],' +
      'html body.vc-body .vc-mobile-nav-drawer .discord-profile-link__name[data-vc-nav-user-marquee],' +
      'html.vc-site-polish body.vc-body header .discord-profile-link__name[data-vc-nav-user-marquee],' +
      'html.vc-site-polish body.vc-body #header-quick-actions .discord-profile-link__name[data-vc-nav-user-marquee]{' +
      'flex:0 0 7.75rem!important;width:7.75rem!important;min-width:7.75rem!important;max-width:7.75rem!important;' +
      'overflow:hidden!important;display:block!important;text-overflow:clip!important;' +
      'white-space:nowrap!important}' +
      'html body.vc-body header .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track,' +
      'html body.vc-body #header-quick-actions .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track,' +
      'html body.vc-body #vc-mobile-nav-drawer .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track,' +
      'html body.vc-body .vc-mobile-nav-drawer .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track,' +
      'html.vc-site-polish body.vc-body header .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track,' +
      'html.vc-site-polish body.vc-body #header-quick-actions .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track,' +
      'html.vc-site-cpu-soft:not(.vc-page-hidden) body.vc-body header .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track,' +
      'html.vc-pwa-cpu-nuke:not(.vc-page-hidden) body.vc-body header .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track,' +
      'html.vc-perf-mid:not(.vc-page-hidden) body.vc-body header .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track,' +
      /* mqHoverOnly1: keyframes ok; play SOLO hover (tutte le pagine) */
      'html:not(.vc-page-hidden):not(.vc-cpu-settle) body.vc-body header a.vc-header-site-name.is-marquee .vc-header-site-name__track,' +
      'html.vc-site-polish:not(.vc-page-hidden):not(.vc-cpu-settle) body.vc-body header a.vc-header-site-name.is-marquee .vc-header-site-name__track,' +
      'html.vc-site-cpu-soft:not(.vc-page-hidden):not(.vc-cpu-settle) body.vc-body header a.vc-header-site-name.is-marquee .vc-header-site-name__track,' +
      'html.vc-pwa-cpu-nuke:not(.vc-page-hidden):not(.vc-cpu-settle) body.vc-body header a.vc-header-site-name.is-marquee .vc-header-site-name__track{' +
      'display:flex!important;flex-wrap:nowrap!important;align-items:center!important;' +
      'width:max-content!important;max-width:none!important;min-width:0!important;overflow:visible!important;' +
      'animation-name:vc-guild-name-marquee!important;' +
      'animation-duration:var(--vc-marquee-duration,12s)!important;' +
      'animation-timing-function:linear!important;' +
      'animation-iteration-count:infinite!important;' +
      'animation-delay:0s!important;' +
      'animation-fill-mode:none!important;' +
      '-webkit-animation-name:vc-guild-name-marquee!important;' +
      '-webkit-animation-duration:var(--vc-marquee-duration,12s)!important;' +
      '-webkit-animation-timing-function:linear!important;' +
      '-webkit-animation-iteration-count:infinite!important;' +
      '-webkit-animation-delay:0s!important}' +
      /* idle/settle: paused (NO tx:0); snap solo tab-hidden */
      'html:not(.vc-page-hidden) body.vc-body header a.vc-header-site-name.is-marquee:not(:hover):not(:focus-visible) .vc-header-site-name__track,' +
      'html:not(.vc-page-hidden) body.vc-body header .discord-profile-link:not(:hover):not(:focus-within) .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track,' +
      'html:not(.vc-page-hidden) body.vc-body #header-quick-actions .discord-profile-link:not(:hover):not(:focus-within) .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track,' +
      'html.vc-cpu-settle body.vc-body header a.vc-header-site-name.is-marquee:not(:hover):not(:focus-visible) .vc-header-site-name__track,' +
      'html.vc-cpu-settle body.vc-body header .discord-profile-link:not(:hover):not(:focus-within) .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track,' +
      'html.vc-cpu-settle body.vc-body #header-quick-actions .discord-profile-link:not(:hover):not(:focus-within) .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track{' +
      'animation-play-state:paused!important;will-change:auto!important;' +
      '-webkit-animation-play-state:paused!important}' +
      'html.vc-page-hidden body.vc-body header a.vc-header-site-name.is-marquee .vc-header-site-name__track,' +
      'html.vc-page-hidden body.vc-body header .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track{' +
      'animation-play-state:paused!important;will-change:auto!important;' +
      '-webkit-animation-play-state:paused!important;' +
      'transform:translate3d(0,0,0)!important}' +
      /* mqNoSnapSettle1: hover = solo play-state (no animation-name → no restart al settle) */
      'html:not(.vc-page-hidden) body.vc-body header a.vc-header-site-name.is-marquee:hover .vc-header-site-name__track,' +
      'html:not(.vc-page-hidden) body.vc-body header a.vc-header-site-name.is-marquee:focus-visible .vc-header-site-name__track,' +
      'html.vc-cpu-settle body.vc-body header a.vc-header-site-name.is-marquee:hover .vc-header-site-name__track,' +
      'html.vc-cpu-settle body.vc-body header a.vc-header-site-name.is-marquee:focus-visible .vc-header-site-name__track,' +
      'html:not(.vc-page-hidden) body.vc-body header .discord-profile-link:hover .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track,' +
      'html:not(.vc-page-hidden) body.vc-body header .discord-profile-link:focus-within .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track,' +
      'html:not(.vc-page-hidden) body.vc-body #header-quick-actions .discord-profile-link:hover .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track,' +
      'html:not(.vc-page-hidden) body.vc-body #header-quick-actions .discord-profile-link:focus-within .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track,' +
      'html.vc-cpu-settle body.vc-body header .discord-profile-link:hover .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track,' +
      'html.vc-cpu-settle body.vc-body #header-quick-actions .discord-profile-link:hover .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track{' +
      'animation-play-state:running!important;will-change:transform!important;' +
      'animation-delay:0s!important;' +
      '-webkit-animation-play-state:running!important}' +
      /* userMqRmKeep1 + userMqIdlePause1: reduced-motion FG solo fuori settle */
      '@media (prefers-reduced-motion:reduce){' +
      'html:not(.vc-page-hidden):not(.vc-cpu-settle) body.vc-body header .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track,' +
      'html:not(.vc-page-hidden):not(.vc-cpu-settle) body.vc-body #header-quick-actions .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track,' +
      'html:not(.vc-page-hidden):not(.vc-cpu-settle).vc-site-polish body.vc-body header .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track,' +
      'html:not(.vc-page-hidden):not(.vc-cpu-settle).vc-site-polish body.vc-body #header-quick-actions .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track{' +
      'animation-name:vc-guild-name-marquee!important;' +
      'animation-duration:var(--vc-marquee-duration,12s)!important;' +
      'animation-timing-function:linear!important;' +
      'animation-iteration-count:infinite!important;' +
      'animation-play-state:paused!important;' +
      '-webkit-animation-name:vc-guild-name-marquee!important;' +
      '-webkit-animation-play-state:paused!important;' +
      'will-change:auto!important}}' +
      '@media (max-width:639.98px){' +
      'html body.vc-body header .discord-profile-link__name[data-vc-nav-user-marquee],' +
      'html body.vc-body #header-quick-actions .discord-profile-link__name[data-vc-nav-user-marquee],' +
      'html.vc-site-polish body.vc-body header .discord-profile-link__name[data-vc-nav-user-marquee],' +
      'html.vc-site-polish body.vc-body #header-quick-actions .discord-profile-link__name[data-vc-nav-user-marquee]{' +
      'flex:0 0 6.75rem!important;width:6.75rem!important;min-width:6.75rem!important;max-width:6.75rem!important}}';
    var pinMount = document.body || document.documentElement;
    pinMount.appendChild(mqPin);
    try {
      var remountMq = function () {
        try {
          var m = document.body || document.documentElement;
          if (mqPin && m) m.appendChild(mqPin);
        } catch (eRmMq) {}
      };
      window.setTimeout(remountMq, 900);
      window.setTimeout(remountMq, 2400);
    } catch (eMqRm) {}
  } catch (eMqPin) {}
  /* cursorFlashKill3: ZERO :has(is-loading); vinyl pin last-wins su html/body */
  try {
    var unlockBarCss = document.getElementById("vc-boot-bar-scroll-unlock-css");
    if (!unlockBarCss) {
      unlockBarCss = document.createElement("style");
      unlockBarCss.id = "vc-boot-bar-scroll-unlock-css";
      (document.documentElement || document.head).appendChild(unlockBarCss);
    }
    unlockBarCss.setAttribute("data-vc", "cursorMqStable1");
    unlockBarCss.textContent =
      "html.vc-chrome-bar-loading," +
      "html.vc-chrome-bar-loading body," +
      "html.vc-loading-scroll-lock," +
      "html.vc-loading-scroll-lock body," +
      "html.vc-loader-blocking-live," +
      "html.vc-loader-blocking-live body," +
      "html.vc-page-cine-boot:not(.vc-page-cine-ready)," +
      "html.vc-page-cine-boot:not(.vc-page-cine-ready) body," +
      "html.vc-page-cine-ready:not(.vc-chrome-scroll-armed)," +
      "html.vc-page-cine-ready:not(.vc-chrome-scroll-armed) body{" +
      "overflow:hidden!important;overflow-x:hidden!important;overflow-y:hidden!important;" +
      "overscroll-behavior:none!important;touch-action:none!important;" +
      "scrollbar-width:none!important}" +
      "html.vc-chrome-bar-loading::-webkit-scrollbar," +
      "html.vc-loading-scroll-lock::-webkit-scrollbar," +
      "html.vc-page-cine-ready:not(.vc-chrome-scroll-armed)::-webkit-scrollbar{" +
      "width:0!important;height:0!important;display:none!important}" +
      /* cursorMqStable1: URL solo su html/body; * = inherit (no re-decode → no freccia Windows) */
      "html.vc-site-cursor-ok," +
      "html.vc-site-cursor-ok body," +
      "html.vc-site-cursor-ok.vc-chrome-bar-loading," +
      "html.vc-site-cursor-ok.vc-chrome-bar-loading body," +
      "html.vc-site-cursor-ok.vc-loading-scroll-lock," +
      "html.vc-site-cursor-ok.vc-loading-scroll-lock body," +
      "html.vc-site-cursor-ok.vc-loader-blocking-live," +
      "html.vc-site-cursor-ok.vc-loader-blocking-live body," +
      "html.vc-site-cursor-ok.vc-interaction-hold," +
      "html.vc-site-cursor-ok.vc-interaction-hold body," +
      "html.vc-site-cursor-ok.vc-page-cine-boot," +
      "html.vc-site-cursor-ok.vc-page-cine-boot body," +
      "html.vc-site-cursor-ok.vc-cine-curtain-off," +
      "html.vc-site-cursor-ok.vc-cine-curtain-off body," +
      "html.vc-site-cursor-ok.vc-cpu-settle," +
      "html.vc-site-cursor-ok.vc-cpu-settle body," +
      "html.vc-site-cpu-soft.vc-site-cursor-ok," +
      "html.vc-site-cpu-soft.vc-site-cursor-ok body," +
      "html.vc-site-cpu-soft.vc-site-cursor-on," +
      "html.vc-pwa-cpu-nuke.vc-site-cursor-ok," +
      "html.vc-pwa-cpu-nuke.vc-site-cursor-ok body," +
      "html.vc-pwa-cpu-nuke.vc-site-cursor-ok.vc-site-polish body.vc-body{" +
      "cursor:url(/images/musicrecordspin-cursor-static.png) 12 12," +
      "url(/images/musicrecordspin-cursor-static.png) 12 12, auto!important}" +
      "html.vc-site-cursor-ok *," +
      "html.vc-site-cursor-ok.vc-interaction-hold *," +
      "html.vc-site-cpu-soft.vc-site-cursor-ok *," +
      "html.vc-pwa-cpu-nuke.vc-site-cursor-ok *{" +
      "cursor:inherit!important}" +
      "@media (pointer:fine){" +
      "html.vc-site-cursor-ok a,html.vc-site-cursor-ok button,html.vc-site-cursor-ok [role=button]," +
      "html.vc-site-cursor-ok .vc-snav-item,html.vc-site-cursor-ok summary," +
      "html.vc-site-cursor-ok label[for],html.vc-site-cursor-ok select," +
      "html.vc-site-cursor-ok input[type=submit],html.vc-site-cursor-ok input[type=button]," +
      "html.vc-site-cursor-ok input[type=checkbox],html.vc-site-cursor-ok input[type=radio]{" +
      "cursor:url(/images/coffe-cursor-static.png) 9 11," +
      "url(/images/musicrecordspin-cursor-static.png) 12 12, auto!important}" +
      "html.vc-site-cursor-ok a *,html.vc-site-cursor-ok button *,html.vc-site-cursor-ok [role=button] *," +
      "html.vc-site-cursor-ok .vc-snav-item *,html.vc-site-cursor-ok summary *{" +
      "cursor:inherit!important}}";
    /* legalUnfreeze1: lascia lo style in head — remount body = style recalc hang */
  } catch (eUnlockBarCss) {}
  /* loadBarGateAuth1: batte vc-grad-baked{overflow:auto} — scrollbar OFF durante barra */
  try {
    var breatheCss = document.getElementById("vc-chrome-breathe-css");
    if (!breatheCss) {
      breatheCss = document.createElement("style");
      breatheCss.id = "vc-chrome-breathe-css";
    }
    /* bootHardTopBar1: NO scrollbar-gutter (faceva comparire la barra in load) */
    breatheCss.setAttribute("data-vc", "bootOneShot1");
    breatheCss.textContent =
      /* bootOneShot1: lock SOLO prima di curtain-off (mai 2° lock a pagina già aperta) */
      "html.vc-chrome-bar-loading:not(.vc-cine-curtain-off):not(.vc-page-cine-ready)," +
      "html.vc-loading-scroll-lock:not(.vc-cine-curtain-off):not(.vc-page-cine-ready)," +
      "html.vc-loader-blocking-live:not(.vc-cine-curtain-off):not(.vc-page-cine-ready)," +
      "html.vc-interaction-hold:not(.vc-cine-curtain-off):not(.vc-page-cine-ready)," +
      "html.vc-grad-baked.vc-chrome-bar-loading:not(.vc-cine-curtain-off):not(.vc-page-cine-ready)," +
      "html.vc-grad-baked.vc-loading-scroll-lock:not(.vc-cine-curtain-off):not(.vc-page-cine-ready)," +
      "html.vc-grad-baked.vc-loader-blocking-live:not(.vc-cine-curtain-off):not(.vc-page-cine-ready)," +
      "html.vc-soft-fx-ready.vc-chrome-bar-loading:not(.vc-cine-curtain-off):not(.vc-page-cine-ready)," +
      "html.vc-soft-fx-ready.vc-loading-scroll-lock:not(.vc-cine-curtain-off):not(.vc-page-cine-ready){" +
      "overflow:hidden!important;overflow-x:hidden!important;overflow-y:hidden!important;" +
      "overscroll-behavior:none!important;touch-action:none!important;" +
      "height:100%!important;max-height:100dvh!important;" +
      "scrollbar-width:none!important;scrollbar-gutter:auto!important}" +
      "html.vc-chrome-bar-loading:not(.vc-cine-curtain-off):not(.vc-page-cine-ready) body," +
      "html.vc-loading-scroll-lock:not(.vc-cine-curtain-off):not(.vc-page-cine-ready) body," +
      "html.vc-loader-blocking-live:not(.vc-cine-curtain-off):not(.vc-page-cine-ready) body," +
      "html.vc-interaction-hold:not(.vc-cine-curtain-off):not(.vc-page-cine-ready) body," +
      "html.vc-grad-baked.vc-chrome-bar-loading:not(.vc-cine-curtain-off):not(.vc-page-cine-ready) body," +
      "html.vc-grad-baked.vc-loading-scroll-lock:not(.vc-cine-curtain-off):not(.vc-page-cine-ready) body," +
      "html.vc-grad-baked.vc-loader-blocking-live:not(.vc-cine-curtain-off):not(.vc-page-cine-ready) body," +
      "html.vc-soft-fx-ready.vc-chrome-bar-loading:not(.vc-cine-curtain-off):not(.vc-page-cine-ready) body," +
      "html.vc-soft-fx-ready.vc-loading-scroll-lock:not(.vc-cine-curtain-off):not(.vc-page-cine-ready) body{" +
      "overflow:hidden!important;overflow-x:hidden!important;overflow-y:hidden!important;" +
      "overscroll-behavior:none!important;touch-action:none!important;" +
      "height:100%!important;max-height:100dvh!important;scrollbar-width:none!important;" +
      "position:fixed!important;inset:0!important;width:100%!important}" +
      "html.vc-chrome-bar-loading:not(.vc-cine-curtain-off)::-webkit-scrollbar," +
      "html.vc-loading-scroll-lock:not(.vc-cine-curtain-off)::-webkit-scrollbar," +
      "html.vc-loader-blocking-live:not(.vc-cine-curtain-off)::-webkit-scrollbar," +
      "html.vc-interaction-hold:not(.vc-cine-curtain-off)::-webkit-scrollbar," +
      "html.vc-grad-baked.vc-chrome-bar-loading:not(.vc-cine-curtain-off)::-webkit-scrollbar," +
      "html.vc-grad-baked.vc-loading-scroll-lock:not(.vc-cine-curtain-off)::-webkit-scrollbar," +
      "html.vc-chrome-bar-loading:not(.vc-cine-curtain-off) body::-webkit-scrollbar," +
      "html.vc-loading-scroll-lock:not(.vc-cine-curtain-off) body::-webkit-scrollbar," +
      "html.vc-interaction-hold:not(.vc-cine-curtain-off) body::-webkit-scrollbar," +
      "html.vc-grad-baked.vc-chrome-bar-loading:not(.vc-cine-curtain-off) body::-webkit-scrollbar," +
      "html.vc-grad-baked.vc-loading-scroll-lock:not(.vc-cine-curtain-off) body::-webkit-scrollbar," +
      "html.vc-soft-fx-ready.vc-chrome-bar-loading:not(.vc-cine-curtain-off)::-webkit-scrollbar," +
      "html.vc-soft-fx-ready.vc-chrome-bar-loading:not(.vc-cine-curtain-off) body::-webkit-scrollbar{" +
      "width:0!important;height:0!important;display:none!important}" +
      /* loadGateOnce1: nero/sipario fino a curtain-off (no flash pagina sotto) */
      "html.vc-cine-curtain-off.vc-site-polish.vc-soft-fx-ready.vc-look-core-ready::before," +
      "html.vc-cine-curtain-off.vc-site-polish.vc-soft-fx-off::before{" +
      "content:none!important;display:none!important;opacity:0!important;visibility:hidden!important;" +
      "pointer-events:none!important}" +
      "html.vc-site-polish:not(.vc-cine-curtain-off)::before," +
      "html.vc-site-polish:not(.vc-soft-fx-ready):not(.vc-soft-fx-off)::before," +
      "html.vc-site-polish:not(.vc-look-core-ready):not(.vc-soft-fx-off)::before{" +
      "content:\"\"!important;position:fixed!important;inset:0!important;z-index:2147482990!important;" +
      "background:#100c09!important;opacity:1!important;visibility:visible!important;" +
      "pointer-events:auto!important;display:block!important}" +
      "html.vc-cine-curtain-off #vc-pre-cine-hard-sipario{" +
      "display:none!important;opacity:0!important;visibility:hidden!important;pointer-events:none!important}" +
      "html:not(.vc-cine-curtain-off) #vc-pre-cine-hard-sipario," +
      "html.vc-boot-loader-gate:not(.vc-cine-curtain-off) #vc-pre-cine-hard-sipario," +
      "html.vc-chrome-bar-loading:not(.vc-cine-curtain-off) #vc-pre-cine-hard-sipario{" +
      "display:block!important;opacity:1!important;visibility:visible!important;pointer-events:auto!important;" +
      "position:fixed!important;inset:0!important;z-index:2147483000!important;background:#100c09!important}";
    (document.head || document.documentElement).appendChild(breatheCss);
  } catch (eBreatheCss) {}
  /* bootOneShot1: lock subito solo se sipario ancora su (no 2° lock tardivo) */
  try {
    var rootBoot = document.documentElement;
    var alreadyOpenBoot =
      rootBoot.classList.contains("vc-page-cine-ready") ||
      rootBoot.classList.contains("vc-cine-curtain-off");
    if (!alreadyOpenBoot) {
      rootBoot.classList.add("vc-chrome-bar-loading", "vc-loading-scroll-lock");
    }
  } catch (eBootLock) {}
  var REDUCE =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var FINE =
    window.matchMedia && window.matchMedia("(pointer: fine)").matches;
  var COARSE =
    window.matchMedia &&
    window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  /* cursorBackSip1: PNG cursor ON; alone glow resta off (no #vc-site-cursor-light) */
  var NO_CURSOR = true; /* solo alone glow — PNG via vc-site-cursor-ok */
  try {
    var coarseCur =
      window.matchMedia &&
      window.matchMedia("(hover: none) and (pointer: coarse)").matches &&
      !(window.matchMedia("(pointer: fine)").matches);
    if (!coarseCur) {
      document.documentElement.classList.add("vc-site-cursor-ok");
      document.documentElement.classList.remove("vc-site-cursor-glow-off");
    } else {
      document.documentElement.classList.remove("vc-site-cursor-ok", "vc-site-cursor-on");
      document.documentElement.classList.add("vc-site-cursor-glow-off");
    }
  } catch (eOk) {}

  var barTarget = 0;
  var barShown = 0;
  var barVel = 0;
  var loadingBar = true;
  var smoothMaxScroll = 0;
  var loadRaf = 0;
  var loadTickIsTimeout = false;
  var loadStart = 0;
  var lastLoopTs = 0;
  var barRaf = 0;
  var barEl = null;
  var scrollIdleUntil = 0;
  var loadFreezePinY = 0;
  var loadFreezeOn = false;

  function pageIsBg() {
    try {
      return Boolean(document.hidden) || document.visibilityState === "hidden";
    } catch (eBg) {
      return false;
    }
  }

  function clearLoadTick() {
    if (!loadRaf) return;
    try {
      if (loadTickIsTimeout) window.clearTimeout(loadRaf);
      else window.cancelAnimationFrame(loadRaf);
    } catch (eClr) {}
    loadRaf = 0;
    loadTickIsTimeout = false;
  }

  /* loadBgContinue1: in BG rAF è pausato → setTimeout così tick/finish avanzano */
  function scheduleLoadTick(fn) {
    clearLoadTick();
    if (pageIsBg()) {
      loadTickIsTimeout = true;
      loadRaf = window.setTimeout(fn, 120);
      return;
    }
    loadTickIsTimeout = false;
    try {
      loadRaf = window.requestAnimationFrame(fn);
    } catch (eRaf) {
      loadTickIsTimeout = true;
      loadRaf = window.setTimeout(fn, 16);
    }
  }

  function scheduleUnlockPoll(fn) {
    if (pageIsBg()) {
      window.setTimeout(fn, 200);
      return;
    }
    try {
      window.requestAnimationFrame(fn);
    } catch (eRaf) {
      window.setTimeout(fn, 32);
    }
  }

  function setChromeBarLoadingClass(on) {
    try {
      var root = document.documentElement;
      if (on) {
        /* cursorFlashLoad1: 2° load solo se chrome non armed; altrimenti lock esplicito senza thrash :has */
        root.classList.add("vc-chrome-bar-loading");
        root.classList.add("vc-loading-scroll-lock", "vc-loader-blocking-live");
        try {
          root.style.setProperty("touch-action", "none", "important");
          if (document.body) document.body.style.setProperty("touch-action", "none", "important");
        } catch (eTaOn) {}
        try {
          ensureLoadClickGate();
        } catch (eGateOn) {}
      } else {
        root.classList.remove("vc-chrome-bar-loading");
        /* cursorFlashLoad1: spegni anche lock orfani (prima restavano → scroll bloccato + cursore flash) */
        if (window.__vcChromeLoadDone || root.classList.contains("vc-chrome-scroll-armed")) {
          root.classList.remove("vc-loading-scroll-lock", "vc-loader-blocking-live");
          try {
            root.style.removeProperty("touch-action");
            if (document.body) document.body.style.removeProperty("touch-action");
          } catch (eTaOff) {}
        }
        try {
          if (typeof window.__vcSyncLoaderScrollLock === "function") {
            window.__vcSyncLoaderScrollLock();
          }
        } catch (eSync) {}
        try {
          ensureLoadClickGate();
        } catch (eGateOff2) {}
      }
    } catch (eCls) {}
  }

  function pageScrollAlreadyOpen() {
    try {
      var root = document.documentElement;
      /* siparioAlignAll2: sipario/footerFlash/profile lift aprono curtain PRIMA
         della barra — NON trattare curtain-off come scroll già libero. */
      if (root) {
        if (
          root.classList.contains("vc-chrome-bar-loading") ||
          root.classList.contains("vc-loading-scroll-lock") ||
          root.classList.contains("vc-loader-blocking-live")
        ) {
          return false;
        }
      }
      if (window.__vcLoadBarCompleting) return false;
      if (!window.__vcLoadBarFullPainted && window.__vcChromeScrollArmed !== true) return false;
      if (window.__vcChromeScrollArmed === true && window.__vcChromeLoadDone === true) return true;
      if (window.__vcChromeScrollArmed === true && window.__vcChromeVisualReady === 1) return true;
      if (window.__vcBootRevealLanded && window.__vcChromeScrollArmed === true) return true;
      if (!root) return false;
      return root.classList.contains("vc-chrome-scroll-armed");
    } catch (eOpen) {
      return false;
    }
  }

  function pinLoadScroll() {
    if (!loadFreezeOn && !loadGestureStillLocked()) return;
    try {
      /* loadScrollAllStages1: se loader ancora attivo, pin resta; unlock solo a load finito */
      var stillLocked = loadGestureStillLocked();
      if (!stillLocked && (pageScrollAlreadyOpen() || (window.__vcChromeLoadDone && window.__vcChromeScrollArmed))) {
        disarmLoadFreeze();
        return;
      }
      if (!stillLocked && window.__vcScrollUnlockOnce === 1) {
        disarmLoadFreeze();
        return;
      }
      /* loadScrollAllStages1: durante loading NON disarmare per mid-scroll / userAway */
      if (!stillLocked && window.__vcUserScrolledAway === 1 && window.__vcChromeVisualReady === 1) {
        disarmLoadFreeze();
        return;
      }
      var y =
        window.pageYOffset ||
        (document.documentElement && document.documentElement.scrollTop) ||
        Number(window.__vcCachedScrollY) ||
        0;
      /* refreshRestoreEnd1: finché lock/load → pin SEMPRE 0.
         Adottare PtrRestoreTargetY mid-load = Y visibile fino a fine, poi 0→Y (yoyo). */
      if (stillLocked || loadFreezeOn) {
        loadFreezePinY = 0;
        if (window.__vcPtrRestoreDone === 1 && window.__vcScrollUnlockOnce === 1) {
          disarmLoadFreeze();
          return;
        }
      } else if (y > 8 && loadFreezePinY < 8) {
        /* bootMidFlashKill1: mid pre-unlock ≠ userAway (session flash) */
        if (vcHasRealScrollGesture() || window.__vcScrollUnlockOnce === 1) {
          loadFreezePinY = y;
          try {
            window.__vcUserScrolledAway = 1;
          } catch (eAway) {}
          return;
        }
        loadFreezePinY = 0;
      }
      if (Math.abs(y - loadFreezePinY) > 0.5) {
        if (typeof window.scrollTo === "function") {
          try {
            window.scrollTo({ top: loadFreezePinY, left: 0, behavior: "instant" });
          } catch (eInst) {
            window.scrollTo(0, loadFreezePinY);
          }
        }
        if (document.documentElement) document.documentElement.scrollTop = loadFreezePinY;
        if (document.body) document.body.scrollTop = loadFreezePinY;
      }
    } catch (ePin) {}
  }

  function loadGestureStillLocked() {
    try {
      var r = document.documentElement;
      var armed =
        window.__vcChromeScrollArmed === true ||
        r.classList.contains("vc-chrome-scroll-armed");
      var done = window.__vcChromeLoadDone === true;
      /* cursorFlashLoad1: post-armed ignora is-loading orfano (barra thin ≠ load) */
      if (done && armed) {
        if (r.classList.contains("vc-chrome-bar-loading")) return true;
        if (r.classList.contains("vc-interaction-hold")) return true;
        if (r.classList.contains("vc-user-leader-pending")) return true;
        if (r.classList.contains("vc-user-profile-pending")) return true;
        if (r.classList.contains("vc-rank-customize-pending")) return true;
        if (r.classList.contains("vc-custom-profile-pending")) return true;
        if (r.classList.contains("vc-session-verify-pending")) return true;
        if (r.classList.contains("vc-notif-staff-loading")) return true;
        /* lock orfano senza barra → sblocca */
        return false;
      }
      if (r.classList.contains("vc-chrome-bar-loading")) return true;
      if (r.classList.contains("vc-loading-scroll-lock")) return true;
      if (r.classList.contains("vc-loader-blocking-live")) return true;
      if (r.classList.contains("vc-interaction-hold")) return true;
      var prog = document.getElementById("vc-site-progress");
      if (prog && prog.classList.contains("is-loading")) return true;
      if (r.classList.contains("vc-user-leader-pending")) return true;
      if (r.classList.contains("vc-user-profile-pending")) return true;
      if (r.classList.contains("vc-rank-customize-pending")) return true;
      if (r.classList.contains("vc-custom-profile-pending")) return true;
      if (r.classList.contains("vc-session-verify-pending")) return true;
      if (r.classList.contains("vc-notif-staff-loading")) return true;
      if (armed) return false;
      if (!r.classList.contains("vc-cine-curtain-off")) return true;
    } catch (eLock) {}
    return !!loadFreezeOn;
  }

  function loadClickGateActive() {
    try {
      var r = document.documentElement;
      if (!r) return true;
      /* viewAsGateClear1: post armed+done ignora solo lock orfani
         (scroll-lock/loader senza barra). bar-loading / hold restano BLOCCANTI. */
      var armed =
        window.__vcChromeScrollArmed === true ||
        r.classList.contains("vc-chrome-scroll-armed");
      var done = window.__vcChromeLoadDone === true;
      if (done && armed) {
        if (r.classList.contains("vc-chrome-bar-loading")) return true;
        if (r.classList.contains("vc-interaction-hold")) return true;
        if (r.classList.contains("vc-user-leader-pending")) return true;
        if (r.classList.contains("vc-user-profile-pending")) return true;
        if (r.classList.contains("vc-rank-customize-pending")) return true;
        if (r.classList.contains("vc-custom-profile-pending")) return true;
        if (r.classList.contains("vc-session-verify-pending")) return true;
        if (r.classList.contains("vc-notif-staff-loading")) return true;
        return false;
      }
      if (!done) return true;
      if (!armed) return true;
      if (r.classList.contains("vc-chrome-bar-loading")) return true;
      if (r.classList.contains("vc-interaction-hold")) return true;
      if (r.classList.contains("vc-loading-scroll-lock")) return true;
      if (r.classList.contains("vc-loader-blocking-live")) return true;
      var prog = document.getElementById("vc-site-progress");
      if (prog && prog.classList.contains("is-loading")) return true;
      return false;
    } catch (eG) {
      return window.__vcChromeLoadDone !== true;
    }
  }

  /* phoneBellTapFree1: campanella usabile subito dopo sipario (gate resta per resto pagina) */
  function isNotifBellTapTarget(e) {
    try {
      var r = document.documentElement;
      if (!r || !r.classList.contains("vc-cine-curtain-off")) return false;
      var t = e && e.target;
      if (!t) return false;
      if (typeof t.closest === "function") {
        if (t.closest("#vc-notif-dropdown")) return true;
        if (t.closest("summary.vc-notif-summary")) return true;
        if (t.closest(".vc-notif-summary")) return true;
        if (t.closest("#vc-notif-badge")) return true;
      }
      var id = String(t.id || "");
      if (id === "vc-notif-dropdown" || id === "vc-notif-badge") return true;
      return false;
    } catch (eBell) {
      return false;
    }
  }

  function ensureLoadClickGate() {
    try {
      var gate = document.getElementById("vc-load-click-gate");
      if (!gate) {
        gate = document.createElement("div");
        gate.id = "vc-load-click-gate";
        gate.setAttribute("aria-hidden", "true");
        gate.setAttribute("data-vc", "loadClickGate1");
        (document.body || document.documentElement).appendChild(gate);
      }
      if (loadClickGateActive()) {
        gate.style.setProperty("display", "block", "important");
        gate.style.setProperty("pointer-events", "auto", "important");
        gate.style.setProperty("position", "fixed", "important");
        gate.style.setProperty("inset", "0", "important");
        gate.style.setProperty("z-index", "2147483400", "important");
        gate.style.setProperty("opacity", "0", "important");
      } else {
        gate.style.setProperty("display", "none", "important");
        gate.style.setProperty("pointer-events", "none", "important");
        /* viewAsGateClear1: togli lock orfani che lasciano header con PE none */
        try {
          var rootClr = document.documentElement;
          if (
            window.__vcChromeLoadDone === true &&
            (window.__vcChromeScrollArmed === true ||
              rootClr.classList.contains("vc-chrome-scroll-armed")) &&
            !rootClr.classList.contains("vc-chrome-bar-loading") &&
            !rootClr.classList.contains("vc-interaction-hold")
          ) {
            rootClr.classList.remove("vc-loading-scroll-lock", "vc-loader-blocking-live");
          }
        } catch (eOrphan) {}
      }
    } catch (eEnsG) {}
  }

  function onLoadClickGate(e) {
    try {
      if (!loadClickGateActive()) return;
      /* phoneBellTapFree1 */
      if (isNotifBellTapTarget(e)) return;
      ensureLoadClickGate();
      if (e && e.cancelable) e.preventDefault();
      if (e && typeof e.stopPropagation === "function") e.stopPropagation();
      if (e && typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
    } catch (eCg) {}
  }

  function onLoadFreezeBlock(e) {
    /* loadClickGate1: blocca click/tap anche se freeze scroll già disarmato */
    try {
      var et = e && e.type ? String(e.type) : "";
      if (
        (et === "click" || et === "auxclick" || et === "pointerdown" || et === "mousedown") &&
        loadClickGateActive()
      ) {
        if (isNotifBellTapTarget(e)) return;
        onLoadClickGate(e);
        return;
      }
    } catch (eCgEarly) {}
    if (!loadFreezeOn && !loadGestureStillLocked()) return;
    try {
      /* loadScrollAllStages1: non disarmare se c’è ancora un loading */
      if (!loadGestureStillLocked() && (pageScrollAlreadyOpen() || (window.__vcChromeLoadDone && window.__vcChromeScrollArmed))) {
        disarmLoadFreeze();
        return;
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
        pinLoadScroll();
        return;
      }
      if (e && e.cancelable) e.preventDefault();
      try {
        if (e && typeof e.stopPropagation === "function") e.stopPropagation();
      } catch (eSp) {}
      pinLoadScroll();
    } catch (eBlk) {}
  }

  function armLoadFreeze() {
    if (loadFreezeOn) {
      try {
        bindLoadFreezeListeners();
      } catch (eRe) {}
      return;
    }
    /* gestureLockBoot1: arma freeze anche se curtain già off ma barra ancora loading */
    try {
      var rootArm = document.documentElement;
      if (
        window.__vcChromeLoadDone &&
        window.__vcChromeScrollArmed &&
        rootArm &&
        rootArm.classList.contains("vc-cine-curtain-off") &&
        !rootArm.classList.contains("vc-chrome-bar-loading")
      ) {
        return;
      }
    } catch (eArmSkip) {}
    loadFreezeOn = true;
    /* scrollAfterBar2: pin a 0 finché barra non finisce — midScrollYankKill1: no se già mid */
    loadFreezePinY = 0;
    try {
      var alreadyY = Math.max(
        0,
        Math.round(
          Number(window.pageYOffset) ||
            Number((document.documentElement && document.documentElement.scrollTop) || 0) ||
            Number(window.__vcCachedScrollY) ||
            0,
        ),
      );
      /* loadClickGate1: con curtain già open NON disarmare freeze se barra ancora on —
         altrimenti click passano (classifiche/wiki post-sipario). */
      if (
        alreadyY >= 8 ||
        window.__vcUserScrolledAway === 1 ||
        window.__vcScrollUnlockOnce === 1 ||
        (pageScrollAlreadyOpen() && !loadClickGateActive())
      ) {
        loadFreezeOn = false;
        ensureLoadClickGate();
        return;
      }
      window.__vcChromeVisualReady = 0;
      if (typeof window.scrollTo === "function") window.scrollTo(0, 0);
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    } catch (eY) {}
    setChromeBarLoadingClass(true);
    try {
      var rootTa = document.documentElement;
      rootTa.style.setProperty("touch-action", "none", "important");
      if (document.body) document.body.style.setProperty("touch-action", "none", "important");
    } catch (eTa) {}
    bindLoadFreezeListeners();
    /* barApiFastAll1: failsafe finish più rapidi (era 1.6/2 → 4/5 → 16s) */
    var t1 = isCineBakedPage() ? 900 : 1100;
    var t2 = isCineBakedPage() ? 1800 : 2200;
    var t3 = 7000;
    try {
      window.setTimeout(function () {
        try {
          if (!window.__vcChromeLoadDone && chromePayloadReady() && !pageGateBusyLocal()) finishLoad();
        } catch (eFs) {}
      }, t1);
    } catch (eTo) {}
    try {
      window.setTimeout(function () {
        try {
          if (!window.__vcChromeLoadDone && chromePayloadReady() && !pageGateBusyLocal()) finishLoad();
        } catch (eNuc) {}
      }, t2);
    } catch (eTo2) {}
    try {
      window.setTimeout(function () {
        try {
          if (!window.__vcChromeLoadDone) finishLoad();
        } catch (eHardFin) {}
      }, t3);
    } catch (eTo3) {}
  }

  function bindLoadFreezeListeners() {
    try {
      var opts = { capture: true, passive: false };
      document.addEventListener("wheel", onLoadFreezeBlock, opts);
      document.addEventListener("touchstart", onLoadFreezeBlock, opts);
      document.addEventListener("touchmove", onLoadFreezeBlock, opts);
      document.addEventListener("touchend", onLoadFreezeBlock, opts);
      document.addEventListener("pointerdown", onLoadFreezeBlock, opts);
      document.addEventListener("pointermove", onLoadFreezeBlock, opts);
      document.addEventListener("mousedown", onLoadFreezeBlock, opts);
      document.addEventListener("click", onLoadFreezeBlock, opts);
      document.addEventListener("auxclick", onLoadFreezeBlock, opts);
      document.addEventListener("gesturestart", onLoadFreezeBlock, opts);
      document.addEventListener("gesturechange", onLoadFreezeBlock, opts);
      document.addEventListener("gestureend", onLoadFreezeBlock, opts);
      document.addEventListener("keydown", onLoadFreezeBlock, opts);
      window.addEventListener("scroll", onLoadFreezeBlock, { capture: true, passive: true });
      ensureLoadClickGate();
    } catch (eBind) {}
  }

  function killLoadingBarHard(why) {
    try {
      loadingBar = false;
      var wrap = document.getElementById("vc-site-progress");
      if (wrap) wrap.classList.remove("is-loading");
      document.documentElement.style.removeProperty("touch-action");
      if (document.body) {
        document.body.style.removeProperty("touch-action");
        document.body.style.removeProperty("position");
        document.body.style.removeProperty("top");
        document.body.style.removeProperty("left");
        document.body.style.removeProperty("right");
        document.body.style.removeProperty("width");
        document.body.style.removeProperty("overflow");
      }
      document.documentElement.style.removeProperty("overflow");
      document.documentElement.style.removeProperty("overscroll-behavior");
    } catch (eKillBar) {}
  }

  /* loadBarFullReset2: sweep anti ri-attach is-loading dopo done */
  function sweepKillLoadingClass(ms) {
    try {
      if (window.__vcLoadBarKillSweep) return;
      window.__vcLoadBarKillSweep = 1;
      var left = Math.max(4, Math.ceil((Number(ms) || 2000) / 200));
      var id = window.setInterval(function () {
        left -= 1;
        try {
          killLoadingBarHard("sweep");
        } catch (eSw) {}
        if (left <= 0) {
          window.clearInterval(id);
          window.__vcLoadBarKillSweep = 0;
        }
      }, 200);
    } catch (eArm) {}
  }

  /* loadBarFullReset2/3: porta la barra a 100% prima di qualsiasi handoff scroll */
  function paintLoadBarFull(thenFn) {
    try {
      if (window.__vcLoadBarFullPainted) {
        try {
          if (typeof thenFn === "function") thenFn();
        } catch (eThen0) {}
        return;
      }
      if (window.__vcLoadBarCompleting) {
        if (typeof thenFn === "function") window.__vcLoadBarAfterFull = thenFn;
        return;
      }
      window.__vcLoadBarCompleting = 1;
      window.__vcLoadBarAfterFull = thenFn;
      try {
        clearLoadTick();
      } catch (eStop) {}
      try {
        loadingBar = true;
        var wrap = document.getElementById("vc-site-progress");
        if (wrap) wrap.classList.add("is-loading");
        barShown = 1;
        barTarget = 1;
        barVel = 0;
        var node = getBarEl();
        if (node) {
          try {
            node.style.setProperty("transform", "scaleX(1)", "important");
          } catch (eTr) {
            node.style.transform = "scaleX(1)";
          }
        }
        applyBar();
      } catch (ePaint) {}
      /* re-assert 1 a metà hold (tickLoad in-flight non deve lasciarla a 0.3) */
      window.setTimeout(function () {
        try {
          if (!window.__vcLoadBarCompleting) return;
          barShown = 1;
          barTarget = 1;
          barVel = 0;
          var n2 = getBarEl();
          if (n2) n2.style.setProperty("transform", "scaleX(1)", "important");
        } catch (eRe) {}
      }, 40);
      /* progGlowUnify1: tieni 100% visibile (~0.55s), poi handoff scroll da 0 */
      window.setTimeout(function () {
        try {
          barShown = 1;
          barTarget = 1;
          barVel = 0;
          var n3 = getBarEl();
          if (n3) n3.style.setProperty("transform", "scaleX(1)", "important");
        } catch (eHold1) {}
      }, 80);
      window.setTimeout(function () {
        try {
          barShown = 1;
          barTarget = 1;
          var n4 = getBarEl();
          if (n4) n4.style.setProperty("transform", "scaleX(1)", "important");
        } catch (eHold2) {}
      }, 280);
      window.setTimeout(function () {
        window.__vcLoadBarFullPainted = 1;
        window.__vcLoadBarCompleting = 0;
        var fn = window.__vcLoadBarAfterFull;
        window.__vcLoadBarAfterFull = null;
        try {
          if (typeof fn === "function") fn();
        } catch (eThen) {}
      }, 560);
    } catch (eFull) {
      window.__vcLoadBarFullPainted = 1;
      window.__vcLoadBarCompleting = 0;
      try {
        if (typeof thenFn === "function") thenFn();
      } catch (eThen2) {}
    }
  }

  function disarmLoadFreeze() {
    /* safariUnlock3: sempre clear classi freeze (anche se flag già false) */
    loadFreezeOn = false;
    setChromeBarLoadingClass(false);
    try {
      document.removeEventListener("wheel", onLoadFreezeBlock, true);
      document.removeEventListener("touchstart", onLoadFreezeBlock, true);
      document.removeEventListener("touchmove", onLoadFreezeBlock, true);
      document.removeEventListener("touchend", onLoadFreezeBlock, true);
      document.removeEventListener("pointerdown", onLoadFreezeBlock, true);
      document.removeEventListener("pointermove", onLoadFreezeBlock, true);
      document.removeEventListener("mousedown", onLoadFreezeBlock, true);
      /* loadClickGate1: click/auxclick restano finché !loadClickGateActive —
         altrimenti disarm mid-bar riapre i click */
      if (!loadClickGateActive()) {
        document.removeEventListener("click", onLoadFreezeBlock, true);
        document.removeEventListener("auxclick", onLoadFreezeBlock, true);
      }
      document.removeEventListener("gesturestart", onLoadFreezeBlock, true);
      document.removeEventListener("gesturechange", onLoadFreezeBlock, true);
      document.removeEventListener("gestureend", onLoadFreezeBlock, true);
      document.removeEventListener("keydown", onLoadFreezeBlock, true);
      window.removeEventListener("scroll", onLoadFreezeBlock, true);
    } catch (eDis) {}
    try {
      /* bootBarScrollFast2: dopo sipario/done togli sempre touch-action (non solo se !locked) */
      if (pageScrollAlreadyOpen() || window.__vcChromeLoadDone || !loadGestureStillLocked()) {
        document.documentElement.style.removeProperty("touch-action");
        if (document.body) document.body.style.removeProperty("touch-action");
      }
    } catch (eTaOff) {}
    try {
      ensureLoadClickGate();
    } catch (eGateDis) {}
  }

  function isCineBakedPage() {
    try {
      var b = document.body;
      if (!b) return false;
      if (b.getAttribute("data-vc-cine-baked") === "1") return true;
      return Boolean(document.querySelector(".vc-page-cine-hero__inner > .vc-hero-head"));
    } catch (eBaked) {
      return false;
    }
  }

  /* loadCueBakeFast1: unlock con soft+look; theme solo se sipario non è già giù */
  function pageSheetsVisuallyReady() {
    try {
      var root = document.documentElement;
      if (!root.classList.contains("vc-site-polish") && !root.classList.contains("vc-page-cine-boot")) {
        return true;
      }
      var softOk =
        root.classList.contains("vc-soft-fx-ready") || root.classList.contains("vc-soft-fx-off");
      var lookOk =
        root.classList.contains("vc-look-core-ready") || root.classList.contains("vc-soft-fx-off");
      if (!softOk || !lookOk) return false;
      var theme = String(root.getAttribute("data-vc-theme") || "");
      var themeOk =
        theme === "dark" ||
        root.classList.contains("vc-theme-light-ready") ||
        theme !== "light";
      if (themeOk) return true;
      /* baked / sipario già alzato: non tenere la barra per il theme sheet tardivo */
      if (
        isCineBakedPage() ||
        root.classList.contains("vc-cine-curtain-off") ||
        root.classList.contains("vc-page-cine-ready")
      ) {
        return true;
      }
      return false;
    } catch (eReady) {
      return true;
    }
  }

  function loadAgeMs() {
    /* homeLoadCpu1d: età da navigationStart — loadStart (inject tardivo) spostava i wall a 12s+ */
    try {
      return Math.max(0, performance.now());
    } catch (eAge) {
      return 0;
    }
  }

  function discordAuthReady() {
    try {
      if (window.__vcDiscordAuthBootDone === 1) return true;
      if (window.__vcDiscordAuthPainted === 1) return true;
      if (window.__VC_DISCORD_PROFILE && window.__VC_DISCORD_PROFILE.id) return true;
      var t = "";
      try {
        t = String(localStorage.getItem("vc_discord_access_token") || "").trim();
      } catch (eT) {}
      if (!t) return true;
      try {
        var exp = Number(localStorage.getItem("vc_discord_expires_at") || "0");
        if (exp && Date.now() >= exp) return true;
      } catch (eExp) {}
      try {
        if (
          document.querySelector(
            ".discord-login-row--profile, .vc-auth-early-shell, .vc-auth-pending-shell",
          )
        ) {
          return true;
        }
      } catch (eDom) {}
      /* barApiFastAll1: auth lenta non tiene la barra (profilo dopo) */
      return loadAgeMs() >= 180;
    } catch (eAuth) {
      return true;
    }
  }

  function emojiBootReady() {
    try {
      if (window.__vcEmojiBootDone === 1) return true;
      /* bootCoherentFast1: pagine cine-baked non aspettano twemoji per sbloccare */
      if (isCineBakedPage()) return true;
      /* bootFastSipario1: emoji non tiene la barra */
      return loadAgeMs() >= 480;
    } catch (eEm) {
      return true;
    }
  }

  function loaderNodeAlive(el) {
    if (!el) return false;
    try {
      if (el.hidden || el.hasAttribute("hidden")) return false;
      if (el.classList && el.classList.contains("vc-staff-loading--hidden")) return false;
      if (el.classList && el.classList.contains("vc-session-verify-overlay--hidden")) return false;
      return true;
    } catch (eAlive) {
      return true;
    }
  }

  /* profileSipFast1: shell profilo già paintata → non tenere barra su pending */
  function profileShellPainted() {
    try {
      if (window.__vcProfileContentReady) return true;
      var view = document.getElementById("vc-user-profile-view");
      if (!view) return false;
      return Boolean(
        view.querySelector(
          ".vc-user-profile-shell .vc-user-profile-hero, .vc-user-profile-shell .vc-user-profile-empty, .vc-user-profile-shell .vc-user-profile-notfound, .vc-user-profile-staff-pane .vc-user-profile-hero, .vc-user-profile-staff-pane .vc-staff-profile-panel, .vc-staff-prof-miss",
        ),
      );
    } catch (eProf) {
      return false;
    }
  }

  /* siparioCssBarApi1: barra = solo API / loader / auth session (CSS = sipario) */
  function bootApisPending() {
    try {
      var root = document.documentElement;
      if (root.classList.contains("vc-user-leader-pending")) return true;
      if (root.classList.contains("vc-user-profile-pending")) {
        if (profileShellPainted()) {
          try {
            window.__vcProfileContentReady = 1;
          } catch (eReady) {}
        } else {
          return true;
        }
      }
      if (root.classList.contains("vc-rank-customize-pending")) return true;
      if (root.classList.contains("vc-custom-profile-pending")) return true;
      if (root.classList.contains("vc-session-verify-pending")) return true;
      if (root.classList.contains("vc-staff-access-pending") && !root.classList.contains("vc-staff-app-revealed")) {
        return true;
      }
      if (root.classList.contains("vc-dash-access-pending") && !root.classList.contains("vc-dash-access-ready")) {
        return true;
      }
      /* loadSyncPack1: boards-view overlay + notif-staff class pending */
      if (root.classList.contains("vc-boards-view-pending")) return true;
      if (root.classList.contains("vc-notif-staff-loading")) return true;
      if (Number(window.__vcBootApiHold || 0) > 0) return true;
      if (Number(window.__vcApiBusyCount || 0) > 0) return true;
      if (!discordAuthReady()) return true;
      var ids = [
        "vc-shared-boot-overlay",
        "vc-roles-loading",
        "vc-staff-loading",
        "vc-ul-loading",
        "vc-staff-inbox-loading",
        "vc-rank-customize-loading",
        "vc-custom-profile-loading",
        "vc-dashboard-loading",
        "vc-dashboard-guild-loading",
        "vc-user-profile-loading",
        "vc-hw-loading",
        "vc-seratafilm-loading",
      ];
      for (var i = 0; i < ids.length; i += 1) {
        if (loaderNodeAlive(document.getElementById(ids[i]))) return true;
      }
      if (loaderNodeAlive(document.querySelector(".vc-session-verify-overlay"))) return true;
      if (loaderNodeAlive(document.querySelector(".vc-ul-loading:not([hidden])"))) return true;
      return false;
    } catch (ePend) {
      return false;
    }
  }

  function cssBootReadyForUnlock() {
    try {
      var root = document.documentElement;
      return (
        root.classList.contains("vc-soft-fx-ready") ||
        root.classList.contains("vc-soft-fx-off") ||
        root.classList.contains("vc-look-core-ready")
      );
    } catch (eCss) {
      return true;
    }
  }

  function pageGateBusyLocal() {
    try {
      /* barApiFastAll1: mai busy forever — dopo 7s rilascia (era 10s) */
      if (loadAgeMs() > 7000) return false;
    } catch (eAge) {}
    try {
      if (typeof window.__vcPageLoadGateBusy === "function") return !!window.__vcPageLoadGateBusy();
    } catch (eG) {}
    try {
      if (bootApisPending()) return true;
      /* siparioWaitAllCss2: CSS = sipario, NON la barra — niente wait soft-fx qui */
      if (window.__vcLoadBarCompleting) return true;
      if (!window.__vcLoadBarFullPainted && window.__vcChromeLoadDone !== true) return true;
    } catch (eL) {
      return false;
    }
    return false;
  }

  function chromePayloadReady() {
    try {
      /* barApiFastAll1: wall API ~2s (era 5.5s) — overlay lenti non tengono la barra forever */
      /* profileSipFast1: su profilo wall più basso (shell già gated dal sipario) */
      if (bootApisPending()) {
        var wall = 2000;
        try {
          if (
            document.documentElement.classList.contains("vc-user-profile-route") ||
            document.documentElement.classList.contains("vc-user-profile-pending") ||
            window.__vcProfileContentReady
          ) {
            wall = 900;
          }
        } catch (eWall) {}
        return loadAgeMs() >= wall;
      }
      return true;
    } catch (ePay) {
      return true;
    }
  }

  function canUnlockScroll() {
    try {
      if (!chromePayloadReady()) return false;
      /* CSS sipario: unlock scroll non aspetta soft-fx oltre un soffio */
      if (!cssBootReadyForUnlock() && loadAgeMs() < 600) return false;
      return true;
    } catch (eCan) {
      return true;
    }
  }

  function requestFinishWhenReady(reason) {
    try {
      if (window.__vcChromeLoadDone) return;
      if (chromePayloadReady()) {
        finishLoad();
        return;
      }
      if (!window.__vcChromePayloadWait) {
        window.__vcChromePayloadWait = 1;
        var start = performance.now();
        function poll() {
          try {
            if (window.__vcChromeLoadDone) {
              window.__vcChromePayloadWait = 0;
              return;
            }
            if (chromePayloadReady() || performance.now() - start > 2000) {
              window.__vcChromePayloadWait = 0;
              window.setTimeout(function () {
                try {
                  if (!window.__vcChromeLoadDone && (chromePayloadReady() || !pageGateBusyLocal())) {
                    finishLoad();
                  }
                } catch (eFinPoll) {}
              }, 0);
              return;
            }
            try {
              setBar(0.92, true);
              applyBar();
            } catch (eBar) {}
            scheduleUnlockPoll(poll);
          } catch (ePoll) {
            window.__vcChromePayloadWait = 0;
          }
        }
        scheduleUnlockPoll(poll);
      }
    } catch (eReq) {
      try {
        finishLoad();
      } catch (eFin) {}
    }
  }

  /* pwaUnfreeze1: se waitBarFull/rAF si bloccano in PWA, touch-action:none resta per sempre */
  function forceUnlockChromeScroll(reason) {
    try {
      /* bootBarGate1c: orphan/unfuck non ammazzano la barra nei primi MIN_BAR_MS */
      var why0 = String(reason || "");
      /* loadBarFullReset5: se paint→1 in corso, aspetta (niente done a metà) */
      if (window.__vcLoadBarCompleting && why0.indexOf("+afterFull") === -1) {
        paintLoadBarFull(function () {
          try {
            forceUnlockChromeScroll(why0 + "+afterFull");
          } catch (eWaitFull) {}
        });
        return;
      }
      /* loadBarFullReset2: prima 100%, poi unlock (anche failsafe/pageAlreadyOpen) */
      if (
        !window.__vcLoadBarFullPainted &&
        !window.__vcChromeLoadDone &&
        why0.indexOf("+afterFull") === -1
      ) {
        paintLoadBarFull(function () {
          try {
            forceUnlockChromeScroll(why0 + "+afterFull");
          } catch (eAfter) {}
        });
        return;
      }
      /* scrollLoadYoYoKill4 + chromeArmStuck1:
         PtrRestoreDone/unlockOnce ≠ scroll armed. Su /user e profili view-state setta
         restoreDone PRIMA → early-return lasciava gate click + overflow hidden forever. */
      if (window.__vcScrollUnlockOnce === 1 || window.__vcPtrRestoreDone === 1) {
        var alreadyArmed = false;
        try {
          alreadyArmed =
            window.__vcChromeScrollArmed === true &&
            document.documentElement.classList.contains("vc-chrome-scroll-armed") &&
            !document.documentElement.classList.contains("vc-chrome-bar-loading");
        } catch (eArmChk) {
          alreadyArmed = false;
        }
        if (alreadyArmed) {
          try {
            var rootOnce = document.documentElement;
            rootOnce.classList.remove(
              "vc-chrome-bar-loading",
              "vc-loading-scroll-lock",
              "vc-boot-scroll-lock",
              "vc-loader-blocking-live",
              "vc-interaction-hold",
              "vc-scroll-soft-lock",
              "vc-scroll-reload-top-lock",
              "vc-page-cine-boot",
            );
            var cssOnce = document.getElementById("vc-scroll-reload-top-lock-css");
            if (cssOnce && cssOnce.parentNode) cssOnce.parentNode.removeChild(cssOnce);
            if (document.body) {
              document.body.style.removeProperty("position");
              document.body.style.removeProperty("top");
              document.body.style.removeProperty("inset");
              document.body.style.removeProperty("touch-action");
              document.body.style.removeProperty("overflow");
              document.body.style.removeProperty("overflow-y");
            }
            rootOnce.style.removeProperty("overflow");
            rootOnce.style.removeProperty("overflow-y");
          } catch (eOnce) {}
          try {
            snapProgressBarToScroll("forceUnlockOnce");
          } catch (eSnapOnce) {}
          try {
            ensureLoadClickGate();
          } catch (eGateOnce) {}
          return;
        }
        /* non armato: fall through al path completo (arma scroll + spegne gate) */
      }
      if (
        why0 === "pwaOrphan" ||
        why0.indexOf("scrollPortFix") === 0 ||
        why0.indexOf("scrollUnfuck") === 0
      ) {
        try {
          /* scrollPostSiparioYoyo1: già unlocked → niente re-snap a 0 (timer 700/1600/3200) */
          if (window.__vcChromeLoadDone === true && window.__vcChromeScrollArmed) {
            try {
              var rootOrph = document.documentElement;
              rootOrph.classList.remove(
                "vc-loading-scroll-lock",
                "vc-loader-blocking-live",
                "vc-chrome-bar-loading",
                "vc-scroll-soft-lock",
                "vc-interaction-hold",
              );
            } catch (eOrphCls) {}
            return;
          }
          if (window.__vcChromeLoadDone !== true && loadStart && performance.now() - loadStart < 900) {
            return;
          }
          if (window.__vcChromeLoadDone !== true && loadingBar) {
            return;
          }
        } catch (eGateUnlock) {}
      }
      var hard =
        why0.indexOf("failsafeHard") === 0 ||
        why0.indexOf("failsafe4500") === 0 ||
        why0.indexOf("+ready") !== -1;
      /* barApiFastAll1: failsafeHard aspetta API solo ~2.2s (era 6s) */
      if (
        hard &&
        why0.indexOf("failsafeHard") === 0 &&
        bootApisPending() &&
        loadAgeMs() < 2200
      ) {
        hard = false;
      }
      /* siparioCssBarApi1: unlock solo quando API ok + CSS sipario pronto */
      if (!hard && !canUnlockScroll()) {
        /* scrollMidYoyo1: mentre aspetti CSS, NON lasciare load-freeze pinY=0
           (cine-boot può già aver alzato il sipario → yoyo mid-scroll) */
        try {
          disarmLoadFreeze();
        } catch (eDisWait) {}
        if (pageScrollAlreadyOpen()) {
          /* loadSyncPack1: sipario già aperto ma API ancora pending → tieni lock, aspetta */
          if (bootApisPending() && loadAgeMs() < 2200) {
            if (!window.__vcChromeUnlockWait) {
              window.__vcChromeUnlockWait = 1;
              var waitStartOpen = performance.now();
              (function waitPendingClear() {
                try {
                  if (!bootApisPending() || performance.now() - waitStartOpen > 2200) {
                    window.__vcChromeUnlockWait = 0;
                    forceUnlockChromeScroll(
                      !bootApisPending() ? (why0 + "+pendingCleared") : (why0 + "+readyTimeout")
                    );
                    return;
                  }
                  scheduleUnlockPoll(waitPendingClear);
                } catch (eWaitOpen) {
                  window.__vcChromeUnlockWait = 0;
                }
              })();
            }
            return;
          }
          /* loadBarFullReset6: anche pageOpen passa da 100% (niente done a metà paint) */
          if (!window.__vcLoadBarFullPainted) {
            paintLoadBarFull(function () {
              try {
                forceUnlockChromeScroll(why0 + "+afterFull");
              } catch (eOpenFull) {}
            });
            return;
          }
          try {
            loadFreezeOn = false;
            window.__vcChromeLoadDone = true;
            window.__vcChromeScrollArmed = true;
            window.__vcChromeVisualReady = 1;
            var rootOpen = document.documentElement;
            rootOpen.classList.add("vc-chrome-scroll-armed", "vc-page-cine-ready");
            rootOpen.classList.remove(
              "vc-chrome-bar-loading",
              "vc-loading-scroll-lock",
              "vc-loader-blocking-live",
              "vc-scroll-soft-lock",
              "vc-interaction-hold",
            );
            killLoadingBarHard("pageAlreadyOpen");
            try {
              snapProgressBarToScroll("pageAlreadyOpen");
            } catch (eSnapOpen) {}
            try {
              ensureBarLoop();
            } catch (eOpenLoop) {}
            /* loadGateHold1: non latchare toast qui — auth-inject chiude quando chrome+API stabili */
            try {
              document.dispatchEvent(
                new CustomEvent("vc:chrome-load-progress", { detail: { reason: "pageAlreadyOpen" } }),
              );
            } catch (eToastOpen) {}
          } catch (eOpenUnlock) {}
          return;
        }
        if (!window.__vcChromeUnlockWait) {
          window.__vcChromeUnlockWait = 1;
          var waitStart = performance.now();
          function waitSheets() {
            try {
              if (pageScrollAlreadyOpen()) {
                window.__vcChromeUnlockWait = 0;
                forceUnlockChromeScroll(why0 + "+siparioOpen");
                return;
              }
              /* barApiFastAll1: soft-wait allineato al wall API ~2s */
              if (canUnlockScroll() || performance.now() - waitStart > 2200) {
                window.__vcChromeUnlockWait = 0;
                forceUnlockChromeScroll(why0 + (canUnlockScroll() ? "+ready" : "+readyTimeout"));
                return;
              }
              try {
                if (chromePayloadReady()) {
                  /* API fatte: barra può sparire, scroll resta locked sul sipario CSS */
                  loadingBar = false;
                  var wWait = document.getElementById("vc-site-progress");
                  if (wWait) wWait.classList.remove("is-loading");
                  try {
                    snapProgressBarToScroll("waitSheetsApiDone");
                  } catch (eSnapWait) {}
                } else {
                  setBar(0.96, true);
                  applyBar();
                }
              } catch (eBarWait) {}
              scheduleUnlockPoll(waitSheets);
            } catch (eWait) {
              window.__vcChromeUnlockWait = 0;
            }
          }
          scheduleUnlockPoll(waitSheets);
        }
        return;
      }
      /* loadBarFullReset7: unlock hard solo dopo paint 100% */
      if (window.__vcLoadBarCompleting || !window.__vcLoadBarFullPainted) {
        paintLoadBarFull(function () {
          try {
            forceUnlockChromeScroll(why0 + "+afterFull");
          } catch (eHardFull) {}
        });
        return;
      }
      /* violKillIdle2: classi sync; unpin/sync/event deferred (era setTimeout 170–390ms) */
      window.__vcChromeLoadDone = true;
      window.__vcChromeScrollArmed = true;
      window.__vcChromeUnlockWait = 0;
      loadFreezeOn = false;
      loadingBar = false;
      var root = document.documentElement;
      root.classList.add("vc-chrome-scroll-armed", "vc-page-cine-ready", "vc-cine-curtain-off");
      /* loadBarNoScroll1: NON inventare soft-fx-ready se sheets non pronti (salvo hard failsafe) */
      if (root.classList.contains("vc-soft-fx-ready") || root.classList.contains("vc-soft-fx-off")) {
        /* ok */
      } else if (why0.indexOf("failsafeHard") === 0 || why0.indexOf("+readyTimeout") !== -1) {
        root.classList.add("vc-soft-fx-ready", "vc-look-core-ready");
      }
      /* scrollLoadYoYoKill4: NON togliere vc-scroll-reload-top-lock qui —
         body:fixed deve restare fino al scrollTo unico (altrimenti flash session Y = yoyo). */
      root.classList.remove(
        "vc-chrome-bar-loading",
        "vc-loading-scroll-lock",
        "vc-boot-scroll-lock",
        "vc-loader-blocking-live",
        "vc-interaction-hold",
        "vc-scroll-soft-lock",
        "vc-page-cine-boot",
      );
      var wrap = document.getElementById("vc-site-progress");
      if (wrap) {
        wrap.classList.remove("is-loading");
        /* progGlowUnify1: stessa altezza glow load/scroll */
        try {
          wrap.style.setProperty("height", "3px", "important");
          wrap.style.setProperty("opacity", "0.92", "important");
        } catch (eH) {}
      }
      try {
        document.removeEventListener("wheel", onLoadFreezeBlock, true);
        document.removeEventListener("touchstart", onLoadFreezeBlock, true);
        document.removeEventListener("touchmove", onLoadFreezeBlock, true);
        document.removeEventListener("touchend", onLoadFreezeBlock, true);
        document.removeEventListener("pointerdown", onLoadFreezeBlock, true);
        document.removeEventListener("pointermove", onLoadFreezeBlock, true);
        document.removeEventListener("gesturestart", onLoadFreezeBlock, true);
        document.removeEventListener("gesturechange", onLoadFreezeBlock, true);
        document.removeEventListener("gestureend", onLoadFreezeBlock, true);
        document.removeEventListener("keydown", onLoadFreezeBlock, true);
        window.removeEventListener("scroll", onLoadFreezeBlock, true);
      } catch (eLis) {}
      try {
        root.style.removeProperty("touch-action");
        if (document.body) document.body.style.removeProperty("touch-action");
      } catch (eTa) {}
      window.__vcChromeForceUnlockAt = Date.now();
      window.__vcChromeForceUnlockReason = String(reason || "");
      /* bugListBoot1: segnala fine unlock al toast e allo scroll-cue */
      try {
        if (!window.__vcChromeLoadDoneDispatched) {
          window.__vcChromeLoadDoneDispatched = 1;
          document.dispatchEvent(new CustomEvent("vc:chrome-load-done", { detail: { reason: reason } }));
        }
      } catch (eEvDone) {}
      /* loadGateHold1: toast resta fino a stillLoading=false in auth-inject (linger post-sipario) */
      try {
        document.dispatchEvent(
          new CustomEvent("vc:chrome-load-progress", { detail: { reason: String(reason || "forceUnlock") } }),
        );
      } catch (eToastDone) {}
      /* bugListBoot1C: scroll-cue sync dopo unlock */
      try {
        if (typeof window.__vcScrollCueBootSync === "function") window.__vcScrollCueBootSync("bugListBoot1");
        else if (typeof window.__vcSyncScrollCue === "function") window.__vcSyncScrollCue("bugListBoot1");
      } catch (eCueDone) {}
      /* bugListBoot1: re-arm marquee nome dopo unlock (auth/DOM late altrimenti resta fermo) */
      try {
        window.setTimeout(function () {
          try {
            if (typeof window.__vcNavUserNameMarqueeSync === "function") window.__vcNavUserNameMarqueeSync();
          } catch (eMq1) {}
        }, 80);
        window.setTimeout(function () {
          try {
            if (typeof window.__vcNavUserNameMarqueeSync === "function") window.__vcNavUserNameMarqueeSync();
          } catch (eMq2) {}
        }, 600);
      } catch (eMqArm) {}
      /* pwaStillHard1: mai session restore browser → fondo pagina a fine load */
      try {
        if ("scrollRestoration" in history) history.scrollRestoration = "manual";
      } catch (eRestMan) {}
      /* refreshScrollRestore1: F5/PTR/bf → ripristina Y se doc abbastanza alto.
         Se maxY ancora corto: lascia pending (no Done@0) così view-state completa dopo. */
      var wantUnlockY = 0;
      var restorePendingShort = false;
      try {
        /* homeBootFix2: homepage sempre TOP a unlock */
        /* legalBootTop1: policy pages mai mid da session a fine boot */
        var unlockPath =
          String(window.location.pathname || "").replace(/\/+$/, "") || "/";
        var unlockHome =
          unlockPath === "/" ||
          (document.body && document.body.classList.contains("vc-body--home"));
        var unlockLegal =
          /^\/(privacy|terms|cookie|copyright|dati|regole)$/i.test(unlockPath) ||
          (document.body && document.body.classList.contains("vc-legal-page"));
        /* bootNoJumpNav1: link/navigate fresco → TOP (no Y da visita precedente in sessionStorage) */
        var unlockReloadOrBf = false;
        try {
          var navU =
            performance.getEntriesByType && performance.getEntriesByType("navigation");
          if (navU && navU[0] && navU[0].type) {
            unlockReloadOrBf =
              navU[0].type === "reload" || navU[0].type === "back_forward";
          } else if (performance.navigation) {
            var ntU = Number(performance.navigation.type);
            unlockReloadOrBf = ntU === 1 || ntU === 2;
          }
        } catch (eNavU) {
          unlockReloadOrBf = false;
        }
        try {
          if (sessionStorage.getItem("vc_ptr_reload_v1") === "1") unlockReloadOrBf = true;
        } catch (ePtrU) {}
        if (unlockHome || unlockLegal || !unlockReloadOrBf) {
          window.__vcDiscardScrollRestore = 1;
          window.__vcPtrRestoreY = 0;
          window.__vcViewStateRestoreY = 0;
          window.__vcPtrRestoreTargetY = 0;
          window.__vcRestoredScrollStickyY = 0;
          wantUnlockY = 0;
        } else if (window.__vcDiscardScrollRestore === 1) {
          wantUnlockY = 0;
        } else {
          var pendingY = Math.max(
            0,
            Number(window.__vcPtrRestoreTargetY || 0) || 0,
            Number(window.__vcPtrRestoreY || 0) || 0,
            Number(window.__vcViewStateRestoreY || 0) || 0
          );
          if (pendingY < 2) {
            try {
              var rawY =
                sessionStorage.getItem("vc_scroll_restore_anchor_v1") ||
                sessionStorage.getItem("vc_ptr_scroll_v1") ||
                sessionStorage.getItem("vc_view_state_v1");
              if (rawY) {
                var dY = JSON.parse(rawY);
                /* bootNoJumpFooter1: solo stesso path — altrimenti Y di un'altra pagina */
                if (dY && Number(dY.y) >= 2) {
                  var sp = String(dY.p || "").split("?")[0].replace(/\/+$/, "") || "";
                  var cp =
                    String(window.location.pathname || "").replace(/\/+$/, "") || "/";
                  if (sp && sp === cp) pendingY = Math.round(Number(dY.y) || 0);
                }
              }
            } catch (eReadY) {}
          }
          if (pendingY >= 2) {
            var maxY = 0;
            try {
              var de = document.documentElement;
              maxY = Math.max(
                0,
                Math.max(
                  (de && de.scrollHeight) || 0,
                  (document.body && document.body.scrollHeight) || 0
                ) - (window.innerHeight || (de && de.clientHeight) || 0)
              );
            } catch (eMax) {}
            /* refreshNoFooterJump1: MAI Math.min(pending,max) su doc corto —
               clampa = fondo pagina → scroll-anchoring resta in footer. */
            /* pwaStillHard1: pending vicino al fondo = session restore spazzatura → top */
            var nearBottom =
              maxY >= 120 && pendingY >= Math.max(80, maxY - 96);
            if (nearBottom) {
              wantUnlockY = 0;
              try {
                window.__vcDiscardScrollRestore = 1;
                window.__vcPtrRestoreTargetY = 0;
                window.__vcPtrRestoreY = 0;
                window.__vcViewStateRestoreY = 0;
              } catch (eBotKill) {}
            } else if (maxY >= pendingY - 24 && maxY >= 64) {
              wantUnlockY = pendingY;
              try {
                window.__vcPtrRestoreTargetY = wantUnlockY;
                window.__vcPtrRestoreY = wantUnlockY;
                window.__vcViewStateRestoreY = wantUnlockY;
              } catch (eSetY) {}
            } else {
              /* doc ancora corto — non chiudere restore a Y=0 */
              wantUnlockY = 0;
              restorePendingShort = true;
              try {
                window.__vcPtrRestoreTargetY = pendingY;
                window.__vcPtrRestoreY = pendingY;
                window.__vcViewStateRestoreY = pendingY;
              } catch (eKeepPend) {}
            }
          }
        }
      } catch (eWant) {
        wantUnlockY = 0;
      }
      /* refreshRestoreEnd1: tieni top-lock fino al scrollTo unico (no flash Y→0→Y) */
      window.__vcChromeVisualReady = 1;
      try {
        var ySnap = wantUnlockY >= 2 ? wantUnlockY : 0;
        /* profileSipHold2 + profileUnlockNoYank2: pin Y=0 SOLO se profilo ancora
           pending E utente non ha già scrollato (altrimenti restore/scroll → yank su). */
        var profilePin =
          !!window.__vcProfileScrollPin ||
          (root && root.classList && root.classList.contains("vc-user-profile-pending")) ||
          (root && root.classList && root.classList.contains("vc-profile-scroll-pin"));
        var liveBeforePin = 0;
        try {
          /* bootNoJumpFooter1: NO cache fallback — pageYOffset=0 non deve adottare Y stale */
          liveBeforePin = Math.max(
            0,
            Math.round(Number(window.pageYOffset) || 0),
            Math.round(
              Number((document.documentElement && document.documentElement.scrollTop) || 0),
            ),
            Math.round(Number((document.body && document.body.scrollTop) || 0)),
          );
        } catch (eLb) {
          liveBeforePin = 0;
        }
        if (profilePin && liveBeforePin < 24 && window.__vcProfileContentReady !== 1) {
          ySnap = 0;
          wantUnlockY = 0;
          window.__vcDiscardScrollRestore = 1;
          window.__vcDiscardNextUnpinScrollY = true;
        } else if (profilePin && (liveBeforePin >= 24 || window.__vcProfileContentReady === 1)) {
          /* contenuto già ready / utente ha scrollato → non azzerare */
          if (wantUnlockY < 2 && liveBeforePin >= 24) ySnap = liveBeforePin;
        } else if (ySnap < 2) {
          /* scrollLoadYoYoKill3 + profileUnlockNoYank2:
             discard blocca SOLO session-restore (wantUnlockY), NON lo scroll live
             se profilo/chrome è già aperto — altrimenti finishLoad ~1s dopo unlock
             riporta su anche se l'utente ha già scrollato. */
          var discardY =
            window.__vcDiscardScrollRestore === 1 ||
            window.__vcDiscardNextUnpinScrollY === true;
          var liveY = 0;
          try {
            liveY = Math.max(
              0,
              Math.round(Number(window.pageYOffset) || 0),
              Math.round(
                Number((document.documentElement && document.documentElement.scrollTop) || 0),
              ),
              Math.round(Number((document.body && document.body.scrollTop) || 0)),
            );
          } catch (eLiveY) {
            liveY = 0;
          }
          var pageAlreadyOpen =
            window.__vcProfileContentReady === 1 ||
            window.__vcChromeScrollArmed === true ||
            window.__vcBootScrollGuardsKilled === true ||
            (root && root.classList && root.classList.contains("vc-chrome-scroll-armed")) ||
            (root && root.classList && root.classList.contains("vc-page-cine-ready"));
          /* bootMidFlashKill1 + midScrollYankKill1 + refreshNoFooterJump1:
             live mid vince su discard SOLO con gesture reale / reload restore —
             mai session flash su navigate fresco. */
          var unlockMaxY = 0;
          try {
            var deU = document.documentElement;
            unlockMaxY = Math.max(
              0,
              Math.max(
                (deU && deU.scrollHeight) || 0,
                (document.body && document.body.scrollHeight) || 0
              ) - (window.innerHeight || (deU && deU.clientHeight) || 0)
            );
          } catch (eUx) {
            unlockMaxY = 0;
          }
          function looksLikeBottomFlash(yy) {
            if (!(yy >= 8)) return false;
            if (unlockMaxY >= 80 && yy >= unlockMaxY - 48) {
              /* fondo della pagina attuale ma target era top/altro → flash */
              if (discardY || wantUnlockY < 2) return true;
              if (wantUnlockY >= 2 && yy > wantUnlockY + 120) return true;
            }
            return false;
          }
          var allowLiveMid =
            vcHasRealScrollGesture() ||
            (!discardY && !vcIsFreshNavigate()) ||
            (!discardY && pageAlreadyOpen && window.__vcUserScrolledAway === 1);
          if (allowLiveMid && liveY >= 8 && !looksLikeBottomFlash(liveY)) {
            ySnap = liveY;
            try {
              window.__vcUserScrolledAway = 1;
            } catch (eMark2) {}
          } else if (
            allowLiveMid &&
            !discardY &&
            pageAlreadyOpen &&
            liveBeforePin >= 8 &&
            !looksLikeBottomFlash(liveBeforePin)
          ) {
            ySnap = liveBeforePin;
          } else if (discardY || (vcIsFreshNavigate() && !vcHasRealScrollGesture())) {
            ySnap = 0;
          }
        }
        /* bootMidFlashKill1: su discard/navigate fresco resta 0; mid solo gesture/reload. */
        if (ySnap < 2) {
          var keepMid = Math.max(0, liveBeforePin);
          var keepMaxY = 0;
          try {
            var deK = document.documentElement;
            keepMaxY = Math.max(
              0,
              Math.max(
                (deK && deK.scrollHeight) || 0,
                (document.body && document.body.scrollHeight) || 0
              ) - (window.innerHeight || (deK && deK.clientHeight) || 0)
            );
          } catch (eKm) {}
          var keepIsFlash =
            keepMaxY >= 80 &&
            keepMid >= keepMaxY - 48 &&
            (window.__vcDiscardScrollRestore === 1 || wantUnlockY < 2);
          var keepAllowed =
            !keepIsFlash &&
            (vcHasRealScrollGesture() ||
              (!vcIsFreshNavigate() && !window.__vcDiscardScrollRestore) ||
              (window.__vcUserScrolledAway === 1 && window.__vcScrollUnlockOnce === 1));
          if (keepAllowed && (keepMid >= 8 || window.__vcUserScrolledAway === 1)) {
            ySnap = keepMid >= 8 ? keepMid : Math.max(liveBeforePin, 0);
          }
        }
        /* refreshRestoreEnd1 + scrollLoadYoYoKill4:
           UN scrollTo, poi togli top-lock; se restore pending (doc corto) NON Done. */
        window.__vcTopPinActive = 0;
        window.scrollTo(0, ySnap);
        if (document.documentElement) document.documentElement.scrollTop = ySnap;
        if (document.body) document.body.scrollTop = ySnap;
        window.__vcCachedScrollY = ySnap;
        window.__vcScrollUnlockOnce = 1;
        if (!restorePendingShort || ySnap >= 2) {
          window.__vcPtrRestoreDone = 1;
          if (ySnap >= 2) {
            try {
              document.dispatchEvent(new CustomEvent("vc:scroll-restored", { detail: { y: ySnap } }));
            } catch (eRestEv) {}
          }
        } else {
          window.__vcPtrRestoreDone = 0;
        }
        try {
          root.classList.remove("vc-scroll-reload-top-lock");
          var topCssUnlock = document.getElementById("vc-scroll-reload-top-lock-css");
          if (topCssUnlock && topCssUnlock.parentNode) topCssUnlock.parentNode.removeChild(topCssUnlock);
        } catch (eLockRm) {}
        if (document.body) {
          document.body.style.removeProperty("position");
          document.body.style.removeProperty("top");
          document.body.style.removeProperty("inset");
        }
        /* re-assert Y dopo unfixed (browser session restore non deve vincere) */
        window.scrollTo(0, ySnap);
        if (document.documentElement) document.documentElement.scrollTop = ySnap;
        if (document.body) document.body.scrollTop = ySnap;
      } catch (eSnapY) {}
      /* scrollBarSnapLoad1: barra top = scroll reale, non ultima % del load (~0.96) */
      try {
        if (typeof snapProgressBarToScroll === "function") snapProgressBarToScroll("forceUnlock");
      } catch (eSnapBar) {}
      try {
        window.__vcChromeScrollArmed = true;
        document.documentElement.classList.add("vc-chrome-scroll-armed");
        ensureBarLoop();
      } catch (eArmLoop) {}
      try {
        ensureLoadClickGate();
      } catch (eGateOff) {}
      try {
        sweepKillLoadingClass(2200);
      } catch (eSwKill) {}
      var why = String(reason || "");
      try {
        document.dispatchEvent(new CustomEvent("vc:chrome-visual-ready", { detail: { reason: why } }));
      } catch (eVis) {}
      window.setTimeout(function () {
        try {
          /* scrollBarTrack3c: unpin hard-top distrugge restore appena fatto */
          var wantU = Math.max(
            0,
            Number(window.__vcPtrRestoreTargetY || 0) || 0,
            Number(window.__vcPtrRestoreY || 0) || 0,
          );
          if (wantU >= 2 && !window.__vcPtrRestoreDone) return;
          if (wantU >= 2) return;
          if (typeof window.__vcUnpinPageScroll === "function") window.__vcUnpinPageScroll();
        } catch (eUn) {}
      }, 0);
      window.setTimeout(function () {
        try {
          if (typeof window.__vcReleaseInteractionHold === "function") window.__vcReleaseInteractionHold();
        } catch (eRel) {}
      }, 16);
      window.setTimeout(function () {
        try {
          /* profileRelockKill2: dopo unlock sync DEVE girare per strip soft-lock/hold
             (renderLoading/revealExcluded altrimenti ri-pinano). */
          if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
          if (typeof window.__vcSyncLoaderBlockingLiveClass === "function") {
            window.__vcSyncLoaderBlockingLiveClass();
          }
        } catch (eSync) {}
      }, 32);
      /* profileRelockKill2: sweep 3s contro re-lock da spinner profilo / hold tardivo */
      try {
        if (!window.__vcProfileRelockSweep) {
          window.__vcProfileRelockSweep = 1;
          var sweepN = 0;
          var sweepId = window.setInterval(function () {
            sweepN += 1;
            try {
              if (!window.__vcChromeLoadDone || !window.__vcChromeScrollArmed) return;
              var rSw = document.documentElement;
              var keepUi = false;
              try {
                keepUi =
                  rSw.classList.contains("vc-notif-drawer-open") ||
                  rSw.classList.contains("vc-notif-sheet-open") ||
                  rSw.classList.contains("vc-dialog-open") ||
                  rSw.classList.contains("vc-staff-manage-sheet-open") ||
                  rSw.classList.contains("vc-staff-stat-sheet-open") ||
                  rSw.classList.contains("vc-staff-reso-sheet-open") ||
                  rSw.classList.contains("vc-feedback-sheet-open") ||
                  rSw.classList.contains("vc-mobile-nav-open");
              } catch (eKeepUi) {
                keepUi = false;
              }
              if (keepUi) return;
              rSw.classList.remove(
                "vc-scroll-soft-lock",
                "vc-interaction-hold",
                "vc-loading-scroll-lock",
                "vc-loader-blocking-live",
                "vc-user-profile-pending",
                "vc-chrome-bar-loading",
              );
              rSw.style.removeProperty("overflow");
              rSw.style.removeProperty("overscroll-behavior");
              rSw.style.removeProperty("touch-action");
              if (document.body) {
                document.body.style.removeProperty("overflow");
                document.body.style.removeProperty("overscroll-behavior");
                document.body.style.removeProperty("touch-action");
                document.body.style.removeProperty("position");
                document.body.style.removeProperty("top");
                document.body.style.removeProperty("left");
                document.body.style.removeProperty("right");
                document.body.style.removeProperty("width");
              }
              if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
            } catch (eSweep) {}
            if (sweepN >= 12) {
              window.clearInterval(sweepId);
              window.__vcProfileRelockSweep = 0;
            }
          }, 250);
        }
      } catch (eSweepArm) {}
      window.setTimeout(function () {
        try {
          document.dispatchEvent(new CustomEvent("vc:chrome-ready", { detail: { reason: why } }));
        } catch (eEv) {}
        /* cueEmojiBoot1: solo sync ufficiale — niente force-show fallback a casaccio */
        try {
          if (typeof window.__vcSyncScrollCue === "function") {
            window.__vcSyncScrollCue();
          }
        } catch (eCue) {}
      }, 48);
    } catch (eForce) {}
  }
  window.__vcForceUnlockChromeScroll = forceUnlockChromeScroll;
  /* siparioBarSync1: arm stuck solo DOPO barra full — no failsafeHard a metà */
  try {
    if (!window.__vcChromeArmStuckUiWatch) {
      window.__vcChromeArmStuckUiWatch = 1;
      var armUiN = 0;
      var armUiIv = window.setInterval(function () {
        armUiN += 1;
        try {
          if (window.__vcChromeScrollArmed === true) {
            window.clearInterval(armUiIv);
            return;
          }
          if (
            window.__vcChromeLoadDone === true &&
            window.__vcLoadBarFullPainted &&
            !window.__vcLoadBarCompleting
          ) {
            forceUnlockChromeScroll(
              armUiN >= 30 ? "failsafeHard+armStuckUi" : "armStuck+afterFull"
            );
          }
        } catch (eArmUi) {}
        if (armUiN >= 60) {
          try {
            window.clearInterval(armUiIv);
          } catch (eClrUi) {}
        }
      }, 400);
    }
  } catch (eArmUiArm) {}

  function el(tag, id) {
    var n = document.createElement(tag);
    if (id) n.id = id;
    return n;
  }

  function mountProgress() {
    var wrap = document.getElementById("vc-site-progress");
    if (!wrap) {
      wrap = el("div", "vc-site-progress");
      wrap.setAttribute("aria-hidden", "true");
      /* loadBarFullReset2: non riaccendere load se già done */
      if (!window.__vcChromeLoadDone) wrap.classList.add("is-loading");
      wrap.appendChild(el("div", "vc-site-progress__bar"));
      (document.body || document.documentElement).appendChild(wrap);
    } else {
      /* bootBarGate1: riusa stub cine-boot */
      if (!window.__vcChromeLoadDone) wrap.classList.add("is-loading");
      else wrap.classList.remove("is-loading");
      if (!document.getElementById("vc-site-progress__bar")) {
        wrap.appendChild(el("div", "vc-site-progress__bar"));
      }
    }
    barEl = document.getElementById("vc-site-progress__bar");
    return wrap;
  }

  function getBarEl() {
    if (barEl && barEl.isConnected) return barEl;
    barEl = document.getElementById("vc-site-progress__bar");
    return barEl;
  }

  function mountBackTop() {
    var btn = document.getElementById("vc-site-back-top");
    function tBack(key, fallback) {
      try {
        if (window.VcI18n && typeof window.VcI18n.t === "function") {
          var v = window.VcI18n.t(key);
          if (v && v !== key) return v;
        }
      } catch (eT) {}
      return fallback;
    }
    if (!btn) {
      btn = el("button", "vc-site-back-top");
      btn.type = "button";
      btn.setAttribute("aria-label", tBack("a11y.backToTop", "Torna su"));
      btn.setAttribute("data-i18n-attr", "aria-label:a11y.backToTop");
      btn.setAttribute("data-i18n-title", "a11y.backToTop");
      btn.title = tBack("a11y.backToTop", "Torna su");
      btn.addEventListener("click", function () {
        try {
          window.scrollTo({ top: 0, behavior: REDUCE ? "auto" : "smooth" });
        } catch (eScr) {
          window.scrollTo(0, 0);
        }
      });
      (document.body || document.documentElement).appendChild(btn);
    } else {
      if (!btn.getAttribute("aria-label")) {
        btn.setAttribute("aria-label", tBack("a11y.backToTop", "Torna su"));
      }
      if (!btn.getAttribute("data-i18n-attr")) {
        btn.setAttribute("data-i18n-attr", "aria-label:a11y.backToTop");
      }
      if (!btn.getAttribute("data-i18n-title")) {
        btn.setAttribute("data-i18n-title", "a11y.backToTop");
      }
      if (!btn.title) btn.title = tBack("a11y.backToTop", "Torna su");
    }
    /* snavChevUpMatch1: stesso chevron-up dei dropdown aperti */
    btn.innerHTML = '<i class="fa fa-chevron-up" aria-hidden="true"></i>';
    return btn;
  }

  function mountCursorLight() {
    /* cursorBackSip1: kill alone glow; PNG cursor resta via vc-site-cursor-ok */
    try {
      var killIds = ["vc-site-cursor-light", "vc-site-cursor-light-critical", "vc-cursor-lag-pin"];
      for (var ki = 0; ki < killIds.length; ki += 1) {
        var node = document.getElementById(killIds[ki]);
        if (node && node.parentNode) node.parentNode.removeChild(node);
      }
      var pinOff = document.getElementById("vc-cursor-glow-off-css");
      if (!pinOff) {
        pinOff = document.createElement("style");
        pinOff.id = "vc-cursor-glow-off-css";
        pinOff.setAttribute("data-vc", "cursorBackSip1");
        pinOff.textContent =
          "#vc-site-cursor-light,#vc-site-cursor-light-critical," +
          "html.vc-site-cursor-on #vc-site-cursor-light," +
          "html body.vc-body #vc-site-cursor-light{" +
          "display:none!important;opacity:0!important;visibility:hidden!important;" +
          "pointer-events:none!important;transform:translate3d(-9999px,-9999px,0)!important}" +
          /* glow-off solo se NON c'è PNG cursor-ok */
          "html.vc-site-cursor-glow-off:not(.vc-site-cursor-ok)," +
          "html.vc-site-cursor-glow-off:not(.vc-site-cursor-ok) body," +
          "html.vc-site-cursor-glow-off:not(.vc-site-cursor-ok) *{" +
          "cursor:auto!important}" +
          "html.vc-site-cursor-glow-off:not(.vc-site-cursor-ok) a," +
          "html.vc-site-cursor-glow-off:not(.vc-site-cursor-ok) button," +
          "html.vc-site-cursor-glow-off:not(.vc-site-cursor-ok) [role=button]," +
          "html.vc-site-cursor-glow-off:not(.vc-site-cursor-ok) summary," +
          "html.vc-site-cursor-glow-off:not(.vc-site-cursor-ok) label[for]," +
          "html.vc-site-cursor-glow-off:not(.vc-site-cursor-ok) select{" +
          "cursor:pointer!important}";
        (document.head || document.documentElement).appendChild(pinOff);
      }
      try {
        var coarseMount =
          window.matchMedia &&
          window.matchMedia("(hover: none) and (pointer: coarse)").matches &&
          !(window.matchMedia("(pointer: fine)").matches);
        if (!coarseMount) {
          document.documentElement.classList.add("vc-site-cursor-ok");
          document.documentElement.classList.remove("vc-site-cursor-glow-off");
        }
      } catch (eCurOk) {}
    } catch (eKillGlow) {}
    return null;
  }

  var sampleMaxScrollTimer = 0;
  function sampleMaxScroll(force) {
    try {
      var doc = document.documentElement;
      var vh = Math.max(1, doc.clientHeight || window.innerHeight || 1);
      var next = Math.max(0, (doc.scrollHeight || 0) - vh);
      cachedMaxScroll = next;
      maxScrollSampleAt = performance.now();
      /* loadBarFullReset6: post-load sempre hard-set (boot lasciava max gonfio → ratio≈0) */
      var postLoadForce =
        force ||
        window.__vcChromeLoadDone === true ||
        smoothMaxScroll <= 0 ||
        (smoothMaxScroll > 1 && next > 1 && smoothMaxScroll > next * 2.5);
      if (postLoadForce) smoothMaxScroll = next;
      else if (Math.abs(next - smoothMaxScroll) > 8) {
        smoothMaxScroll += (next - smoothMaxScroll) * (force ? 1 : 0.35);
      } else {
        smoothMaxScroll = next;
      }
      return next;
    } catch (eMax) {
      return cachedMaxScroll || 0;
    }
  }

  /* violKillReflow2: scrollHeight MAI sync in rAF/scroll — Forced reflow 100–600ms×N */
  function scheduleSampleMaxScroll(force) {
    if (sampleMaxScrollTimer && !force) return;
    if (sampleMaxScrollTimer) {
      try {
        window.clearTimeout(sampleMaxScrollTimer);
      } catch (eClr) {}
    }
    sampleMaxScrollTimer = window.setTimeout(
      function () {
        sampleMaxScrollTimer = 0;
        try {
          /* scrollBarTrack3: MAI __vcLight qui — gap 320ms = barra che non segue lo scroll */
          sampleMaxScroll(!!force);
        } catch (eSm) {}
      },
      force ? 0 : 80,
    );
  }

  var lastLiveScrollSampleAt = 0;
  function scrollRatio() {
    /* violKillReflow3: hot-path = cache; live sample raro (no Forced reflow) */
    var scrollTop = readScrollYNow(false);
    if (scrollTop > 0) pendingScrollTop = scrollTop;
    var max = smoothMaxScroll > 0 ? smoothMaxScroll : cachedMaxScroll;
    if (max <= 1 || scrollTop > max * 0.98) {
      scheduleSampleMaxScroll(max <= 1);
    }
    /* scrollBarTrack3: max sconosciuto → stima, NON 100% (barra “bloccata” in fondo) */
    if (max <= 1) {
      var vh = Math.max(window.innerHeight || 800, 1);
      return scrollTop > 0 ? Math.min(0.35, scrollTop / vh) : 0;
    }
    return Math.min(1, Math.max(0, scrollTop / Math.max(max, 1)));
  }

  function readScrollYNow(allowLive) {
    try {
      var cached = Number(window.__vcCachedScrollY);
      if (Number.isFinite(cached) && cached >= 0) {
        if (!allowLive) return Math.max(0, Math.round(cached));
        var now = performance.now();
        /* live al max ogni 480ms — evita scrollTop sync a ogni tick */
        if (now - lastLiveScrollSampleAt < 480) return Math.max(0, Math.round(cached));
        lastLiveScrollSampleAt = now;
        var live = 0;
        try {
          live = Math.max(
            0,
            Math.round(
              window.pageYOffset ||
                (document.documentElement && document.documentElement.scrollTop) ||
                0,
            ),
          );
        } catch (eLive) {
          live = cached;
        }
        if (Math.abs(live - cached) > 2) {
          try {
            window.__vcCachedScrollY = live;
          } catch (eSet) {}
          return live;
        }
        return Math.max(0, Math.round(cached));
      }
    } catch (eC) {}
    if (!allowLive) return pendingScrollTop || 0;
    try {
      return Math.max(
        0,
        Math.round(
          window.pageYOffset ||
            (document.documentElement && document.documentElement.scrollTop) ||
            0,
        ),
      );
    } catch (eY) {
      return pendingScrollTop || 0;
    }
  }

  var progressTopSyncAt = 0;
  function syncProgressAtTopClass() {
    try {
      var now = performance.now();
      if (now - progressTopSyncAt < 120) return;
      progressTopSyncAt = now;
      var wrap = document.getElementById("vc-site-progress");
      if (!wrap) return;
      var atTop = !loadingBar && Number(barShown || 0) < 0.012 && readScrollYNow(false) < 8;
      wrap.classList.toggle("is-at-top", atTop);
    } catch (eTop) {}
  }

  function applyBar() {
    var node = getBarEl();
    if (!node) return;
    var v = Number.isFinite(barShown) ? barShown : 0;
    try {
      /* bootBarGate1b: important — batte transform:scaleX(0) da CSS polish */
      node.style.setProperty("transform", "scaleX(" + v.toFixed(5) + ")", "important");
    } catch (eA) {
      try {
        node.style.transform = "scaleX(" + v.toFixed(5) + ")";
      } catch (eA2) {}
    }
    /* violKillReflow3: class toggle throttled — non a ogni spring tick */
    if (!loadingBar && Math.abs(barTarget - barShown) < 0.02) syncProgressAtTopClass();
  }

  /* phoneBarBlur1: togli/patch stub gutter subito (non solo a fine load) */
  function killBootProgressStubCss(patchOnly) {
    try {
      var stubCss = document.getElementById("vc-boot-progress-stub-css");
      if (!stubCss) return;
      if (patchOnly) {
        stubCss.textContent = String(stubCss.textContent || "")
          .replace(/right:\s*12px/gi, "right:0");
        stubCss.setAttribute("data-vc", "progGlowUnify1");
        return;
      }
      if (stubCss.parentNode) stubCss.parentNode.removeChild(stubCss);
    } catch (eStubKill) {}
  }

  /* scrollBarSnapLoad1 + scrollBarLenFix1: load→scroll snappa a Y LIVE (no resto ~0.96) */
  function snapProgressBarToScroll(why) {
    try {
      loadingBar = false;
      killBootProgressStubCss(false);
      var wrap = document.getElementById("vc-site-progress");
      if (wrap) {
        wrap.classList.remove("is-loading");
        try {
          wrap.style.setProperty("height", "3px", "important");
          wrap.style.setProperty("opacity", "0.92", "important");
          wrap.style.setProperty("right", "0", "important");
        } catch (eH) {}
      }
      /* progGlowUnify1: dopo 100% load, riparti da 0 (o ratio Y) — stesso glow */
      var yLive = 0;
      try {
        yLive = Math.max(
          0,
          Math.round(
            Number(window.pageYOffset) ||
              Number((document.documentElement && document.documentElement.scrollTop) || 0) ||
              Number((document.body && document.body.scrollTop) || 0) ||
              0,
          ),
        );
      } catch (eYLive) {
        yLive = 0;
      }
      pendingScrollTop = yLive;
      try {
        window.__vcCachedScrollY = yLive;
        lastLiveScrollSampleAt = 0;
      } catch (eCy) {}
      try {
        sampleMaxScroll(true);
      } catch (eSmSync) {
        try {
          scheduleSampleMaxScroll(true);
        } catch (eSm) {}
      }
      var r = 0;
      if (yLive <= 8) {
        r = 0;
      } else {
        var max = smoothMaxScroll > 1 ? smoothMaxScroll : cachedMaxScroll;
        if (max > 1) {
          r = Math.min(1, Math.max(0, yLive / max));
        } else {
          r = Math.min(0.35, yLive / Math.max(window.innerHeight || 800, 1));
        }
      }
      barShown = r;
      barTarget = r;
      barVel = 0;
      window.__vcScrollBarSnappedAfterLoad = 1;
      applyBar();
      if (wrap) wrap.classList.toggle("is-at-top", r < 0.012);
      ensureBarLoop();
      /* secondo tick: maxScroll spesso arriva 1 frame dopo */
      window.setTimeout(function () {
        try {
          if (window.__vcChromeLoadDone && !loadingBar) {
            var y2 = Math.max(
              0,
              Math.round(
                Number(window.pageYOffset) ||
                  Number((document.documentElement && document.documentElement.scrollTop) || 0) ||
                  0,
              ),
            );
            pendingScrollTop = y2;
            window.__vcCachedScrollY = y2;
            sampleMaxScroll(true);
            var r2 = y2 <= 8 ? 0 : scrollRatio();
            barShown = r2;
            barTarget = r2;
            barVel = 0;
            applyBar();
            var w2 = document.getElementById("vc-site-progress");
            if (w2) w2.classList.toggle("is-at-top", r2 < 0.012);
          }
        } catch (eSnap2) {}
      }, 48);
    } catch (eSnap) {}
  }
  window.__vcSnapProgressBarToScroll = snapProgressBarToScroll;

  function setLoadingClass(on) {
    /* bootBarScrollFast2: dopo done non riaccendere mai is-loading (lock CSS :has) */
    if (window.__vcChromeLoadDone && on) {
      killLoadingBarHard("setLoadingIgnored");
      return;
    }
    var was = loadingBar;
    loadingBar = Boolean(on);
    var wrap = document.getElementById("vc-site-progress");
    if (wrap) wrap.classList.toggle("is-loading", loadingBar);
    if (loadingBar) {
      window.__vcScrollBarSnappedAfterLoad = 0;
      armLoadFreeze();
    } else {
      disarmLoadFreeze();
      if (was && window.__vcChromeLoadDone && window.__vcChromeScrollArmed) {
        snapProgressBarToScroll("leaveLoading");
      }
    }
  }

  function setBar(pct, loading) {
    /* scrollBarLenFix1: dopo loadDone ignora hold load (0.92/0.96) che ri-allungava la barra */
    if (window.__vcChromeLoadDone && loading === true) {
      try {
        snapProgressBarToScroll("setBarIgnoredLoad");
      } catch (eIgn) {}
      return;
    }
    /* loadBarFullReset3: durante/dopo paint→1 non far scendere il tick */
    if (window.__vcLoadBarCompleting || (window.__vcLoadBarFullPainted && !window.__vcChromeLoadDone)) {
      barShown = 1;
      barTarget = 1;
      barVel = 0;
      try {
        applyBar();
      } catch (eHold1) {}
      return;
    }
    if (loading != null) setLoadingClass(loading);
    var n = Number(pct);
    barTarget = Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
    if (REDUCE) {
      barShown = barTarget;
      barVel = 0;
      applyBar();
      return;
    }
    ensureBarLoop();
  }

  function syncBackTop() {
    try {
      var y = pendingScrollTop || 0;
      var vh = Math.max(1, window.innerHeight || 1);
      var maxScroll = cachedMaxScroll || 0;
      if (!maxScroll) {
        /* violKillReflow2: niente scrollHeight sync — stima + sample async */
        maxScroll = Math.max(vh * 1.6, 480);
        scheduleSampleMaxScroll(false);
      }
      /* backTopPhoneShow1: soglia 2.75×vh uccideva il fab su phone (pagine ~1.5×vh) */
      /* backTopPcLate1: desktop — solo pagine davvero lunghe; appare dopo ~1.5–2 vh scroll */
      var phoneUi = false;
      try {
        phoneUi =
          (window.matchMedia && window.matchMedia("(max-width: 720px)").matches) ||
          (window.matchMedia && window.matchMedia("(hover: none) and (pointer: coarse)").matches);
      } catch (ePh) {}
      var pageTallEnough = phoneUi
        ? maxScroll >= Math.max(160, vh * 0.35)
        : maxScroll >= Math.max(1600, vh * 2.75);
      var scrolledFar = phoneUi
        ? y > Math.max(140, Math.min(320, vh * 0.42))
        : y > Math.max(1100, vh * 1.65);
      var btn = document.getElementById("vc-site-back-top");
      if (btn) {
        var sheetOpen = false;
        try {
          var root = document.documentElement;
          sheetOpen =
            root.classList.contains("vc-notif-sheet-open") ||
            root.classList.contains("vc-notif-drawer-open");
        } catch (eSh) {}
        /* backTopSheetHide1: no freccia sopra lo sheet notifiche */
        btn.classList.toggle("is-on", !sheetOpen && pageTallEnough && scrolledFar);
      }
    } catch (eS) {}
  }

  function ensureBarLoop() {
    if (barRaf || REDUCE) return;
    lastLoopTs = 0;
    /* violRafKill2: setTimeout non rAF — evita Violation 'requestAnimationFrame' handler */
    barRaf = window.setTimeout(barLoop, 16);
  }

  function barLoop() {
    barRaf = 0;
    try {
      if (pageIsBg()) {
        applyBar();
        /* loadBgContinue1: durante load non spegnere il loop in background */
        if (loadingBar || !window.__vcChromeLoadDone || window.__vcLoadBarCompleting) {
          barRaf = window.setTimeout(barLoop, 200);
        }
        return;
      }
      var ts = performance.now();
      var dt = lastLoopTs ? Math.min(0.048, (ts - lastLoopTs) / 1000) : 0.016;
      lastLoopTs = ts;
      var scrolling = ts < scrollIdleUntil;

      if (window.__vcChromeLoadDone && window.__vcChromeScrollArmed) {
        barTarget = scrollRatio();
        /* scrollBarSnapLoad1: primo frame post-load → snappa (niente spring dalla % load) */
        if (!loadingBar && !window.__vcScrollBarSnappedAfterLoad) {
          window.__vcScrollBarSnappedAfterLoad = 1;
          barShown = barTarget;
          barVel = 0;
        } else if (
          !loadingBar &&
          !scrolling &&
          Math.abs(barTarget - barShown) > 0.28
        ) {
          barShown = barTarget;
          barVel = 0;
          window.__vcScrollBarSnappedAfterLoad = 1;
        }
      }

      var diff = barTarget - barShown;
      if (Math.abs(diff) < 0.00008 && Math.abs(barVel) < 0.00008) {
        barShown = barTarget;
        barVel = 0;
      } else if (scrolling && window.__vcChromeLoadDone && !loadingBar) {
        /* scrollBarTrack3: in scroll attivo snappa — lo spring restava indietro di secondi */
        barShown += diff * 0.72;
        barVel = 0;
        if (barShown < 0) barShown = 0;
        if (barShown > 1) barShown = 1;
      } else {
        /*
         * Spring smorzato: segue lo scroll senza scatti.
         * Più reattivo in scroll, più morbido in settle.
         */
        var stiffness = loadingBar ? 120 : scrolling ? 140 : 55;
        var damping = loadingBar ? 18 : scrolling ? 18 : 14;
        var accel = diff * stiffness - barVel * damping;
        barVel += accel * dt;
        barShown += barVel * dt;
        if ((diff > 0 && barShown > barTarget) || (diff < 0 && barShown < barTarget)) {
          if (!scrolling && Math.abs(barVel) < 0.35) {
            barShown = barTarget;
            barVel = 0;
          }
        }
        if (barShown < 0) barShown = 0;
        if (barShown > 1) barShown = 1;
      }
      applyBar();

      var busy =
        loadingBar ||
        !window.__vcChromeLoadDone ||
        scrolling ||
        Math.abs(barTarget - barShown) >= 0.00008 ||
        Math.abs(barVel) >= 0.00008;
      if (busy) {
        barRaf = window.setTimeout(barLoop, 16);
      }
    } catch (eL) {
      barRaf = window.setTimeout(barLoop, pageIsBg() ? 200 : 16);
    }
  }

  var scrollRaf = 0;
  var pendingScrollTop = 0;
  var cachedMaxScroll = 0;
  var maxScrollSampleAt = 0;
  /* scrollBarTrack2: barra segue lo scroll SUBITO — MAI __vcLight (gap 320ms = barra “morta”) */
  var backTopSyncTimer = 0;
  function onScroll() {
    scrollIdleUntil = performance.now() + 280;
    /* loadBarFullReset5: aggiorna cache Y qui — altrimenti post-load resta 0 (solo cine cue la scriveva) */
    try {
      var liveY = Math.max(
        0,
        Math.round(
          Number(window.pageYOffset) ||
            Number((document.documentElement && document.documentElement.scrollTop) || 0) ||
            0,
        ),
      );
      window.__vcCachedScrollY = liveY;
      pendingScrollTop = liveY;
      /* bootMidFlashKill1: mid = userAway solo DOPO unlock (pre-unlock mid = session flash) */
      if (liveY >= 24 && window.__vcScrollUnlockOnce === 1) {
        try {
          window.__vcUserScrolledAway = 1;
        } catch (eAway) {}
      }
    } catch (eCyScroll) {}
    if (scrollRaf) return;
    scrollRaf = 1;
    window.setTimeout(function flushScrollUi() {
      scrollRaf = 0;
      pendingScrollTop = readScrollYNow(false);
      if (window.__vcChromeLoadDone && window.__vcChromeScrollArmed) {
        var now = performance.now();
        var scrollingHot = now < scrollIdleUntil;
        if (!scrollingHot && (!cachedMaxScroll || now - maxScrollSampleAt > 1200)) {
          scheduleSampleMaxScroll(false);
        }
        var max = smoothMaxScroll > 1 ? smoothMaxScroll : cachedMaxScroll;
        /* loadBarFullReset6: max gonfio → live sample immediato */
        if (
          pendingScrollTop > 8 &&
          max > 1 &&
          pendingScrollTop / max < 0.04
        ) {
          try {
            sampleMaxScroll(true);
          } catch (eMaxFix) {}
          max = smoothMaxScroll > 1 ? smoothMaxScroll : cachedMaxScroll;
        }
        var ratio = 0;
        if (max > 1) {
          ratio = Math.min(1, Math.max(0, pendingScrollTop / Math.max(max, 1)));
        } else if (pendingScrollTop > 0) {
          scheduleSampleMaxScroll(true);
          ratio = Math.min(0.35, pendingScrollTop / Math.max(window.innerHeight || 800, 1));
        }
        setBar(ratio, false);
        try {
          if (window.__vcChromeLoadDone && Math.abs(barTarget - barShown) > 0.08) {
            barShown = barTarget;
            barVel = 0;
            applyBar();
          }
        } catch (eSnapScr) {}
        ensureBarLoop();
      } else {
        ensureBarLoop();
      }
      /* back-top fuori dal hot path (class toggle = style recalc) */
      if (!backTopSyncTimer) {
        backTopSyncTimer = window.setTimeout(function () {
          backTopSyncTimer = 0;
          try {
            syncBackTop();
          } catch (eBt) {}
        }, 48);
      }
    }, 16);
  }

  function finishLoad() {
    if (window.__vcChromeLoadDone) return;
    /* siparioCssBarApi1: barra finisce sulle API; unlock aspetta anche CSS */
    if (!chromePayloadReady()) {
      if (!window.__vcChromeFinishWait) {
        window.__vcChromeFinishWait = 1;
        var finStart = performance.now();
        function pollSheets() {
          try {
            if (window.__vcChromeLoadDone) return;
            if (chromePayloadReady() || performance.now() - finStart > 2000) {
              window.__vcChromeFinishWait = 0;
              finishLoad();
              return;
            }
            try {
              setBar(0.96, true);
              applyBar();
            } catch (eKeep) {}
            scheduleUnlockPoll(pollSheets);
          } catch (ePoll) {
            window.__vcChromeFinishWait = 0;
          }
        }
        scheduleUnlockPoll(pollSheets);
      }
      return;
    }
    /* loadBarFullReset2: 100% → unlock (forceUnlock dipinge full se manca) */
    if (!window.__vcLoadBarFullPainted) {
      paintLoadBarFull(function () {
        try {
          if (!window.__vcChromeLoadDone) finishLoad();
        } catch (eFinFull) {}
      });
      return;
    }
    window.__vcChromeLoadDone = true;
    try {
      if (!window.__vcChromeLoadDoneAt) window.__vcChromeLoadDoneAt = Date.now();
    } catch (eDoneAt) {}
    window.__vcChromeFinishWait = 0;
    window.__vcLoadBarCompleting = 0;
    try {
      clearLoadTick();
    } catch (eT) {}
    /* bootCoherentFast1: segnale per presence/API post-barra */
    try {
      document.dispatchEvent(
        new CustomEvent("vc:chrome-load-done", { detail: { baked: isCineBakedPage() } }),
      );
    } catch (eDoneEv) {}
    /* scrollBarTrack2: unlock + restore Y immediato (se pending) + barra = ratio reale */
    try {
      killLoadingBarHard("finishLoad");
      var wrap = document.getElementById("vc-site-progress");
      if (wrap) {
        /* progGlowUnify1: stessa altezza glow load/scroll */
        try {
          wrap.style.setProperty("height", "3px", "important");
          wrap.style.setProperty("opacity", "0.92", "important");
        } catch (eH) {}
      }
      /* bootBarScrollFast2: se qualcosa riattacca is-loading, ripulisci per 2s */
      var sweep = 0;
      var sweepId = window.setInterval(function () {
        sweep += 1;
        try {
          killLoadingBarHard("finishSweep");
        } catch (eSw) {}
        if (sweep >= 8) window.clearInterval(sweepId);
      }, 250);
    } catch (eFin) {}
    /* toastHoldAll1: unlock scroll solo a gate idle (API/loader possono continuare post-barra) */
    try {
      var unlockTries = 0;
      var unlockWhenIdle = function () {
        unlockTries += 1;
        try {
          if (pageGateBusyLocal() && unlockTries < 80) {
            window.setTimeout(unlockWhenIdle, 200);
            return;
          }
          forceUnlockChromeScroll("finishLoad+gateIdle");
        } catch (eUnlockIdle) {
          try {
            forceUnlockChromeScroll("finishLoad+ready");
          } catch (eForceFin2) {}
        }
      };
      unlockWhenIdle();
    } catch (eForceFin) {
      window.__vcChromeScrollArmed = true;
      try {
        document.documentElement.classList.add("vc-chrome-scroll-armed", "vc-page-cine-ready");
        document.documentElement.classList.remove(
          "vc-chrome-bar-loading",
          "vc-loading-scroll-lock",
          "vc-boot-scroll-lock",
          "vc-scroll-reload-top-lock",
          "vc-loader-blocking-live",
          "vc-interaction-hold",
          "vc-page-cine-boot",
        );
      } catch (eArmCls) {}
      try {
        setLoadingClass(false);
      } catch (eLoad) {}
      window.__vcChromeVisualReady = 1;
    }
    function snapBarToScroll() {
      try {
        /* scrollLoadYoYoKill4: unlock ha già fissato Y — qui solo barra, ZERO scrollTo */
        if (window.__vcScrollUnlockOnce === 1 || window.__vcPtrRestoreDone === 1) {
          snapProgressBarToScroll("finishLoad");
          return;
        }
        var wantY = 0;
        try {
          if (
            !window.__vcDiscardScrollRestore &&
            window.__vcPtrRestorePending &&
            !window.__vcPtrRestoreDone
          ) {
            wantY = Math.max(
              0,
              Math.round(
                Number(
                  window.__vcPtrRestoreTargetY ||
                    window.__vcPtrRestoreY ||
                    window.__vcViewStateRestoreY ||
                    0
                ) || 0
              )
            );
          }
        } catch (eWy) {
          wantY = 0;
        }
        if (wantY >= 2) {
          try {
            try {
              window.__vcTopPinActive = 0;
              document.documentElement.classList.remove("vc-scroll-reload-top-lock");
              var topCss2 = document.getElementById("vc-scroll-reload-top-lock-css");
              if (topCss2 && topCss2.parentNode) topCss2.parentNode.removeChild(topCss2);
            } catch (eTl2) {}
            window.scrollTo(0, wantY);
            if (document.documentElement) document.documentElement.scrollTop = wantY;
            if (document.body) document.body.scrollTop = wantY;
            window.__vcCachedScrollY = wantY;
            window.__vcScrollUnlockOnce = 1;
            window.__vcPtrRestoreDone = 1;
          } catch (eSy) {}
        } else if (window.__vcDiscardScrollRestore) {
          try {
            var liveKeep = Math.max(
              0,
              Math.round(Number(window.pageYOffset) || 0),
              Math.round(
                Number((document.documentElement && document.documentElement.scrollTop) || 0),
              ),
            );
            /* bootMidFlashKill1: discard → top salvo gesture reale */
            if (vcHasRealScrollGesture() && (liveKeep >= 8 || window.__vcUserScrolledAway === 1)) {
              /* keep */
            } else {
              window.scrollTo(0, 0);
              if (document.documentElement) document.documentElement.scrollTop = 0;
              if (document.body) document.body.scrollTop = 0;
              window.__vcCachedScrollY = 0;
            }
          } catch (eTopKeep) {}
        }
        snapProgressBarToScroll("finishLoad");
      } catch (eSm2) {}
    }
    /* loadGateOnce1: un solo snap barra (niente 2° scrollTo post-load) */
    snapBarToScroll();
  }

  function armLoadProgress() {
    /* bootOneShot1: chrome tardivo su pagina già aperta → niente 2° caricamento */
    function finishArmSkippedOpen(whySkip) {
      if (window.__vcLoadBarCompleting) {
        paintLoadBarFull(function () {
          try {
            finishArmSkippedOpen(whySkip || "armAfterFull");
          } catch (eSkipAfter) {}
        });
        return;
      }
      /* progGlowUnify1: MAI done senza 100% visibile */
      if (!window.__vcLoadBarFullPainted) {
        paintLoadBarFull(function () {
          try {
            finishArmSkippedOpen(whySkip || "armStubFull");
          } catch (eFinStub2) {}
        });
        return;
      }
      try {
        loadingBar = false;
        var wrapOpen = document.getElementById("vc-site-progress");
        if (wrapOpen) wrapOpen.classList.remove("is-loading");
        document.documentElement.classList.remove(
          "vc-chrome-bar-loading",
          "vc-loading-scroll-lock",
          "vc-loader-blocking-live",
          "vc-interaction-hold",
          "vc-page-cine-boot",
        );
        document.documentElement.classList.add(
          "vc-chrome-scroll-armed",
          "vc-page-cine-ready",
          "vc-cine-curtain-off",
        );
      } catch (eSkipArm) {}
      window.__vcChromeLoadDone = true;
      window.__vcChromeScrollArmed = true;
      window.__vcChromeVisualReady = 1;
      window.__vcLoadBarFullPainted = 1;
      try {
        snapProgressBarToScroll(whySkip || "armSkippedOpen");
      } catch (eSkipSnap) {}
      try {
        ensureBarLoop();
      } catch (eLoopSkip) {}
      try {
        sweepKillLoadingClass(1600);
      } catch (eSkipSw) {}
      try {
        document.dispatchEvent(
          new CustomEvent("vc:chrome-load-done", {
            detail: { baked: isCineBakedPage(), skipped: true },
          }),
        );
      } catch (eSkipEv) {}
      try {
        document.dispatchEvent(new CustomEvent("vc:chrome-visual-ready", { detail: { skipped: true } }));
      } catch (eSkipVis) {}
    }

    if (pageScrollAlreadyOpen()) {
      /* barPostSip1: sipario già off ≠ load finito — se primo boot incompleto, arma barra fino alle API */
      var firstBootIncomplete =
        window.__vcChromeLoadDone !== true && window.__vcChromeScrollArmed !== true;
      if (!firstBootIncomplete) {
        /* progGlowUnify1: sempre 100% prima di skip (anche senza is-loading) */
        finishArmSkippedOpen("armSkippedOpen");
        return;
      }
      /* fall through: curtain early, continua tickLoad + is-loading */
      try {
        var wrapKeep = document.getElementById("vc-site-progress");
        if (wrapKeep) wrapKeep.classList.add("is-loading");
        document.documentElement.classList.add("vc-chrome-bar-loading");
      } catch (eKeepBar) {}
    }
    /* barOneShot1: NON resettare loadDone se già true (evita 2° ciclo + toast latch) */
    if (window.__vcChromeLoadDone === true && window.__vcLoadBarFullPainted) {
      finishArmSkippedOpen("armAlreadyDone");
      return;
    }
    window.__vcChromeLoadDone = false;
    window.__vcChromeScrollArmed = false;
    window.__vcChromeVisualReady = 0;
    window.__vcScrollBarSnappedAfterLoad = 0;
    window.__vcLoadBarCompleting = 0;
    window.__vcLoadBarFullPainted = 0;
    window.__vcLoadBarAfterFull = null;
    window.__vcLoadBarKillSweep = 0;
    try {
      document.documentElement.classList.remove("vc-chrome-scroll-armed");
    } catch (eDisArm) {}
    /* barOneShot1: continua dallo stub (no jump a 0.14) + credito tempo stub */
    var stubPct = 0.14;
    try {
      var barStub = document.getElementById("vc-site-progress__bar");
      if (barStub) {
        var tr = String(barStub.style.transform || "");
        var m = tr.match(/scaleX\(\s*([0-9.]+)\s*\)/i);
        if (m) stubPct = Math.max(0.14, Math.min(0.92, Number(m[1]) || 0.14));
      }
      if (Number(window.__vcBootStubBarPct) > stubPct) {
        stubPct = Math.min(0.92, Number(window.__vcBootStubBarPct));
      }
    } catch (eStubPct) {}
    try {
      window.__vcBootStubStopped = 1;
    } catch (eStubStop) {}
    loadStart = performance.now();
    var baked = isCineBakedPage();
    /* bootFastSipario1: barra corta; se CSS già ready ancora più corta */
    var sheetsGo =
      document.documentElement.classList.contains("vc-soft-fx-ready") ||
      document.documentElement.classList.contains("vc-look-core-ready");
    /* barOneShot1: min da stubPct→hold (niente jump indietro / finish istantaneo) */
    var startPct = Math.max(0.14, Math.min(0.9, stubPct));
    /* barApiFastAll1: anim barra più corta (era *1100 / base 280–520) */
    var baseMin = sheetsGo ? (baked ? 160 : 240) : baked ? 220 : 320;
    var remainFrac = Math.max(0.12, 0.92 - startPct);
    var MIN_BAR_MS = Math.max(baseMin, Math.round(remainFrac * 700));
    armLoadFreeze();
    setBar(startPct, true);
    try {
      applyBar();
    } catch (eApply0) {}
    try {
      window.setTimeout(function () {
        try {
          if (window.__vcChromeLoadDone || window.__vcChromeVisualReady === 1) return;
          var root = document.documentElement;
          if (
            root.classList.contains("vc-page-cine-ready") ||
            root.classList.contains("vc-cine-curtain-off")
          ) {
            return;
          }
          root.classList.add("vc-chrome-bar-loading", "vc-loading-scroll-lock", "vc-loader-blocking-live");
          root.style.setProperty("touch-action", "none", "important");
          if (document.body) document.body.style.setProperty("touch-action", "none", "important");
        } catch (eSoft) {}
      }, 40);
    } catch (eSoftArm) {}
    /* helper globale: pagine possono tenere la barra su fetch custom */
    try {
      if (typeof window.vcBootApiHold !== "function") {
        window.__vcBootApiHold = Number(window.__vcBootApiHold || 0) || 0;
        window.vcBootApiHold = function (delta) {
          var d = Number(delta);
          if (!isFinite(d) || d === 0) d = 1;
          window.__vcBootApiHold = Math.max(0, Number(window.__vcBootApiHold || 0) + d);
          return window.__vcBootApiHold;
        };
      }
    } catch (eHold) {}
    /* profileSipFast1: sipario lift può chiedere finish immediato della barra */
    try {
      window.__vcRequestChromeFinish = function (why) {
        try {
          requestFinishWhenReady(String(why || "ext"));
        } catch (eReqFin) {
          try {
            if (!window.__vcChromeLoadDone) finishLoad();
          } catch (eFin) {}
        }
      };
    } catch (eExpFin) {}

    function tickLoad(now) {
      loadRaf = 0;
      loadTickIsTimeout = false;
      if (window.__vcChromeLoadDone) return;
      /* loadBarFullReset3: stop tick mentre/dopo paint full */
      if (window.__vcLoadBarCompleting || window.__vcLoadBarFullPainted) return;
      var ts = now || performance.now();
      var age = ts - loadStart;
      if (age >= MIN_BAR_MS && chromePayloadReady()) {
        /* violKillConsole1: finishLoad fuori dal rAF (era Violation ~240ms) */
        window.setTimeout(function () {
          try {
            if (!window.__vcChromeLoadDone) finishLoad();
          } catch (eFinRaf) {}
        }, 0);
        return;
      }
      var t = Math.min(1, age / Math.max(MIN_BAR_MS, 1));
      var eased = 1 - Math.pow(1 - t, 2.05);
      /* progGlowUnify1 + barOneShot1: da startPct→hold; 100% solo paintLoadBarFull */
      var hold = chromePayloadReady() ? 0.92 : 0.86;
      var nextPct = startPct + eased * (Math.max(hold, startPct + 0.02) - startPct);
      if (nextPct < startPct) nextPct = startPct;
      setBar(nextPct, true);
      try {
        applyBar();
      } catch (eApply) {}
      scheduleLoadTick(tickLoad);
    }
    scheduleLoadTick(tickLoad);

    function finishAfterMin() {
      var need = Math.max(0, MIN_BAR_MS - (performance.now() - loadStart));
      var at = performance.now() + need;
      function waitMin(now) {
        if ((now || performance.now()) < at) {
          scheduleLoadTick(waitMin);
          return;
        }
        requestFinishWhenReady("afterMin");
      }
      scheduleLoadTick(waitMin);
    }
    window.setTimeout(function () {
      try {
        if (!window.__vcChromeLoadDone) requestFinishWhenReady("bakeTimer");
      } catch (eBakeFin) {}
    }, MIN_BAR_MS + 80);
    if (!baked) {
      if (document.readyState === "complete") finishAfterMin();
      else window.addEventListener("load", finishAfterMin, { once: true });
    }
    try {
      function stillBarLocked() {
        try {
          return document.documentElement.classList.contains("vc-chrome-bar-loading");
        } catch (e) {
          return !window.__vcChromeScrollArmed;
        }
      }
      var fs1 = baked ? 700 : 900;
      var fs2 = baked ? 1100 : 1300;
      window.setTimeout(function () {
        try {
          if (stillBarLocked() && !window.__vcChromeLoadDone) requestFinishWhenReady("fs1");
        } catch (e1) {}
      }, fs1);
      window.setTimeout(function () {
        try {
          if (stillBarLocked() && !window.__vcChromeLoadDone) requestFinishWhenReady("fs2");
        } catch (e2) {}
      }, fs2);
      window.setTimeout(function () {
        try {
          if (stillBarLocked() || !window.__vcChromeVisualReady) {
            forceUnlockChromeScroll("failsafeHard1800");
          }
        } catch (e3) {}
      }, 1800);
    } catch (eArmFs) {}

    try {
      document.addEventListener("vc-discord-auth-boot", function () {
        try {
          requestFinishWhenReady("discord-auth-boot");
        } catch (eEv) {}
      });
      document.addEventListener("vc-emoji-boot", function () {
        try {
          requestFinishWhenReady("emoji-boot");
        } catch (eEv2) {}
      });
      /* loadBgContinue1: torna in FG → riprendi barra + finish se load ancora aperto */
      document.addEventListener(
        "visibilitychange",
        function () {
          try {
            if (pageIsBg()) return;
            ensureBarLoop();
            if (!window.__vcChromeLoadDone) {
              scheduleLoadTick(function () {
                try {
                  requestFinishWhenReady("visResume");
                } catch (eRes) {}
              });
            }
          } catch (eVisLoad) {}
        },
        false,
      );
    } catch (eLisAuth) {}
  }

  function armCursor(light) {
    if (!light || NO_CURSOR) return;
    if (light.__vcCursorLagArmed2) return;
    light.__vcCursorLagArmed2 = 1;
    var root = document.documentElement;
    /* cursorLagFix2: 120px — meno paint/composite vs 180/240 */
    var HALF = 60;
    var on = false;
    var lastX = -99999;
    var lastY = -99999;
    var pendingX = 0;
    var pendingY = 0;
    var raf = 0;

    try {
      /* pin last-wins vs shell 240px / soft-fx */
      var pin = document.getElementById("vc-cursor-lag-pin");
      if (!pin) {
        pin = document.createElement("style");
        pin.id = "vc-cursor-lag-pin";
        (document.body || document.documentElement).appendChild(pin);
      }
      pin.setAttribute("data-vc", "cursorLagFix2");
      pin.textContent =
        "html body.vc-body #vc-site-cursor-light," +
        "html.vc-site-polish body.vc-body #vc-site-cursor-light," +
        "#vc-site-cursor-light{" +
        "width:120px!important;height:120px!important;" +
        "transition:none!important;transition-property:none!important;" +
        "filter:none!important;-webkit-filter:none!important;" +
        "mix-blend-mode:normal!important;box-shadow:none!important;" +
        "will-change:transform!important;contain:strict!important;" +
        "background:radial-gradient(circle at 50% 50%," +
        "rgba(236,205,176,.28) 0%,rgba(212,168,136,.12) 42%,transparent 70%)!important}";
      try {
        (document.body || document.documentElement).appendChild(pin);
      } catch (ePinMount) {}
    } catch (ePin) {}

    try {
      light.style.cssText =
        "position:fixed!important;top:0!important;left:0!important;" +
        "width:120px!important;height:120px!important;margin:0!important;" +
        "border-radius:50%!important;pointer-events:none!important;" +
        "z-index:2147480500!important;opacity:0!important;visibility:hidden!important;" +
        "display:block!important;transition:none!important;" +
        "filter:none!important;mix-blend-mode:normal!important;box-shadow:none!important;" +
        "will-change:transform!important;contain:strict!important;" +
        "transform:translate3d(-9999px,-9999px,0);" +
        "background:radial-gradient(circle at 50% 50%," +
        "rgba(236,205,176,.28) 0%,rgba(212,168,136,.12) 42%,transparent 70%)!important";
    } catch (eTr) {}

    function place(px, py) {
      try {
        light.style.transform =
          "translate3d(" + ((px - HALF) | 0) + "px," + ((py - HALF) | 0) + "px,0)";
      } catch (eV) {}
    }

    function flush() {
      raf = 0;
      if (!on) {
        on = true;
        try {
          root.classList.remove("vc-site-cursor-on");
        } catch (eRm) {}
        try {
          light.style.opacity = "1";
          light.style.visibility = "visible";
        } catch (eOn) {}
      }
      place(pendingX, pendingY);
    }

    function sleepLight() {
      on = false;
      lastX = -99999;
      lastY = -99999;
      if (raf) {
        try {
          window.cancelAnimationFrame(raf);
        } catch (eC) {}
        raf = 0;
      }
      try {
        root.classList.remove("vc-site-cursor-on");
      } catch (eRm2) {}
      try {
        light.style.transform = "translate3d(-9999px,-9999px,0)";
        light.style.opacity = "0";
        light.style.visibility = "hidden";
      } catch (eOff) {}
    }

    function onMove(e) {
      try {
        if (document.hidden || document.visibilityState === "hidden") return;
        if (root.classList.contains("vc-page-hidden")) return;
        if (root.classList.contains("vc-cpu-settle")) return;
        if (root.classList.contains("vc-site-cpu-soft")) {
          if (on) sleepLight();
          return;
        }
      } catch (eIdle) {}
      try {
        if (
          e.pointerType &&
          e.pointerType !== "mouse" &&
          e.pointerType !== "pen" &&
          e.pointerType !== ""
        ) {
          return;
        }
      } catch (ePt) {}
      var cx = e.clientX;
      var cy = e.clientY;
      if (typeof cx !== "number" || typeof cy !== "number") return;
      if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;
      if (on && Math.abs(cx - lastX) < 1.5 && Math.abs(cy - lastY) < 1.5) return;
      lastX = cx;
      lastY = cy;
      pendingX = cx;
      pendingY = cy;
      /* cursorLagFix2: 1 apply/frame — sotto carico non accoda N style.write */
      if (!raf) {
        try {
          raf = window.requestAnimationFrame(flush);
        } catch (eRaf) {
          flush();
        }
      }
    }

    function onVis() {
      if (document.hidden) sleepLight();
    }

    try {
      document.addEventListener("vc:cpu-sleep", sleepLight, false);
      document.addEventListener("vc:cpu-settle", sleepLight, false);
      window.addEventListener("vc:cpu-settle", sleepLight, false);
    } catch (eSet) {}

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("blur", sleepLight);
    document.addEventListener("visibilitychange", onVis);
    document.addEventListener(
      "mouseout",
      function (e) {
        try {
          if (
            e.relatedTarget == null &&
            (e.clientY <= 0 ||
              e.clientX <= 0 ||
              e.clientX >= window.innerWidth ||
              e.clientY >= window.innerHeight)
          ) {
            sleepLight();
          }
        } catch (eOut) {}
      },
      true,
    );
  }

  function ensureFooterSocialMetal() {
    try {
      if (document.getElementById("vc-footer-social-metal-defs")) return;
      var ns = "http://www.w3.org/2000/svg";
      var s = document.createElementNS(ns, "svg");
      s.setAttribute("id", "vc-footer-social-metal-defs");
      s.setAttribute("aria-hidden", "true");
      s.setAttribute("focusable", "false");
      s.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
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
    } catch (eMetal) {}
  }

  function injectHideScrollbarCss() {
    /* hideScrollGutter0: ultimo in cascade — zero track/gutter pagina; mai html * / mai MO */
    try {
      var id = "vc-hide-scrollbar-css";
      var el = document.getElementById(id);
      if (!el) {
        el = document.createElement("style");
        el.id = id;
      }
      el.setAttribute("data-vc", "20261012hideScrollGutter0");
      var armed =
        "html.vc-site-polish.vc-page-cine-ready.vc-chrome-scroll-armed" +
        ":not(.vc-chrome-bar-loading):not(.vc-loading-scroll-lock):not(.vc-loader-blocking-live)" +
        ":not(.vc-interaction-hold):not(.vc-scroll-soft-lock):not(.vc-dialog-open)" +
        ":not(.vc-notif-sheet-open):not(.vc-notif-drawer-open):not(.vc-img-lb-open)";
      el.textContent =
        "html,html body,html.vc-site-polish,html.vc-site-polish body," +
        "html.vc-chrome-scroll-armed,html.vc-chrome-scroll-armed body," +
        "html.vc-site-polish.vc-chrome-scroll-armed:not(.vc-soft-fx-off)," +
        "html.vc-site-polish.vc-chrome-scroll-armed:not(.vc-soft-fx-off) body.vc-body," +
        "html.vc-cine-curtain-off:not(.vc-chrome-bar-loading):not(.vc-loading-scroll-lock):not(.vc-loader-blocking-live):not(.vc-interaction-hold)," +
        "html.vc-page-cine-ready:not(.vc-chrome-bar-loading):not(.vc-loading-scroll-lock):not(.vc-loader-blocking-live):not(.vc-interaction-hold)," +
        armed + "," + armed + " body," +
        "html[data-vc-theme=\"light\"],html[data-vc-theme=\"light\"] body.vc-body," +
        "html.vc-site-polish[data-vc-theme=\"light\"] body.vc-body{" +
        "scrollbar-width:none!important;-ms-overflow-style:none!important;" +
        "scrollbar-gutter:auto!important;scrollbar-color:transparent transparent!important}" +
        "html::-webkit-scrollbar,html body::-webkit-scrollbar," +
        "html.vc-site-polish.vc-chrome-scroll-armed:not(.vc-soft-fx-off)::-webkit-scrollbar," +
        "html.vc-site-polish.vc-chrome-scroll-armed:not(.vc-soft-fx-off) body.vc-body::-webkit-scrollbar," +
        armed + "::-webkit-scrollbar," + armed + " body::-webkit-scrollbar," +
        "html[data-vc-theme=\"light\"]::-webkit-scrollbar," +
        "html[data-vc-theme=\"light\"] body.vc-body::-webkit-scrollbar{" +
        "width:0!important;height:0!important;display:none!important;background:transparent!important}" +
        "html::-webkit-scrollbar-track,html::-webkit-scrollbar-thumb," +
        "html body::-webkit-scrollbar-track,html body::-webkit-scrollbar-thumb," +
        "html.vc-site-polish.vc-chrome-scroll-armed:not(.vc-soft-fx-off)::-webkit-scrollbar-track," +
        "html.vc-site-polish.vc-chrome-scroll-armed:not(.vc-soft-fx-off)::-webkit-scrollbar-thumb," +
        "html.vc-site-polish.vc-chrome-scroll-armed:not(.vc-soft-fx-off) body.vc-body::-webkit-scrollbar-track," +
        "html.vc-site-polish.vc-chrome-scroll-armed:not(.vc-soft-fx-off) body.vc-body::-webkit-scrollbar-thumb{" +
        "display:none!important;width:0!important;background:transparent!important;border:0!important}";
      var host = document.head || document.documentElement;
      /* sempre in coda: batte look-core / theme-light / cine-noflash */
      if (el.parentNode) el.parentNode.removeChild(el);
      host.appendChild(el);
    } catch (eHideSb) {}
  }

  function isLegalChromeLite() {
    try {
      if (window.__vcLegalLiteChrome) return true;
      return /\/(privacy|terms|cookie|copyright|dati|regole)(\/|$)/i.test(
        String(location.pathname || "/"),
      );
    } catch (eL) {
      return false;
    }
  }

  function bootLegalLiteBrandStill() {
    /* legalPerfPack1: solo still logo — no IO/MO/GIF storm */
    try {
      var STILL = "/images/og-server-icon-still.png?v=20261006perfLogoStill1";
      var imgs = document.querySelectorAll(
        "img.vc-premium-footer__logo-img, header img.vc-brand-logo, .vc-header-logo img, img[src*='og-server-icon']",
      );
      for (var i = 0; i < imgs.length; i++) {
        try {
          var im = imgs[i];
          if (!im || /still/i.test(String(im.getAttribute("src") || ""))) continue;
          im.setAttribute("src", STILL);
        } catch (eImg) {}
      }
    } catch (eStill) {}
  }

  function boot() {
    if (!document.body) {
      document.addEventListener("DOMContentLoaded", boot, { once: true });
      return;
    }
    ensureFooterSocialMetal();
    var legalLite = isLegalChromeLite();
    if (window.__vcChromeUiBooted) {
      try {
        if (window.__VC_SITE_CHROME_UI_VER !== VER) {
          window.__vcUiGpuSoftArmed = 0;
          window.__vcNavUserMqMo = 0;
          window.__vcNavUserMqWatch = 0;
          window.__vcNavUserMqBgArm = 0;
          if (!legalLite) armUiGpuSoft();
          else bootLegalLiteBrandStill();
        }
      } catch (eRe) {}
      try {
        armPromoDotHoverThaw();
      } catch (ePromoRe) {}
      window.__VC_SITE_CHROME_UI_VER = VER;
      try {
        injectHideScrollbarCss();
      } catch (eSbRe) {}
      return;
    }
    window.__vcChromeUiBooted = true;
    injectHideScrollbarCss();
    try {
      killBootProgressStubCss(true);
    } catch (eStubBoot) {}
    try {
      var pinOnce = function () {
        injectHideScrollbarCss();
        try {
          killBootProgressStubCss(true);
        } catch (eStubPin) {}
      };
      document.addEventListener("vc:soft-fx-ready", pinOnce, { once: true });
      document.addEventListener("vc:chrome-load-done", pinOnce, { once: true });
      setTimeout(pinOnce, legalLite ? 400 : 1200);
    } catch (ePinSb) {}
    mountProgress();
    mountBackTop();
    /* legalPerfPack1: no cursor glow/PNG + no GPU soft storm su policy */
    if (!legalLite) {
      armCursor(mountCursorLight());
      armUiGpuSoft();
    } else {
      bootLegalLiteBrandStill();
    }
    armLoadProgress();
    try {
      armPromoDotHoverThaw();
    } catch (ePromoArm) {}
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    try {
      window.addEventListener("scrollend", onScroll, { passive: true });
    } catch (eEnd) {}
    window.__VC_SITE_CHROME_UI_VER = VER;
  }

  /* marquee404Fix1c: fuori da __vcUiGpuSoftArmed — altrimenti stamp nuovi non legano hover */
  function armPromoDotHoverThaw() {
    var ARM = "marquee404Fix1c";
    if (window.__vcPromoDotHoverThaw === ARM) return;
    window.__vcPromoDotHoverThaw = ARM;
    document.addEventListener(
      "pointerover",
      function (ev) {
        try {
          if (document.hidden) return;
          var promo = ev.target && ev.target.closest && ev.target.closest("#vc-header-promo-btn");
          if (!promo) return;
          var dot = promo.querySelector(".vc-header-promo-btn__dot");
          if (!dot || !dot.style) return;
          dot.style.removeProperty("animation-play-state");
          dot.style.removeProperty("-webkit-animation-play-state");
          dot.style.setProperty("animation-name", "vc-header-promo-dot-pulse", "important");
          dot.style.setProperty("animation-duration", "1.6s", "important");
          dot.style.setProperty("animation-iteration-count", "infinite", "important");
          dot.style.setProperty("animation-play-state", "running", "important");
          dot.style.setProperty("-webkit-animation-play-state", "running", "important");
        } catch (eH) {}
      },
      true,
    );
    document.addEventListener(
      "pointerout",
      function (ev) {
        try {
          var promo = ev.target && ev.target.closest && ev.target.closest("#vc-header-promo-btn");
          if (!promo) return;
          var rel = ev.relatedTarget;
          if (rel && promo.contains && promo.contains(rel)) return;
          var dot = promo.querySelector(".vc-header-promo-btn__dot");
          if (!dot || !dot.style) return;
          dot.style.removeProperty("animation-play-state");
          dot.style.removeProperty("-webkit-animation-play-state");
          dot.style.removeProperty("animation-name");
          dot.style.removeProperty("animation-duration");
          dot.style.removeProperty("animation-iteration-count");
        } catch (eO) {}
      },
      true,
    );
  }

  /* brandLogoStillAlways1: brand logo always still (GIF = CPU/wake storm). */
  /* cpuThrashOff1 + cpuAnimSoft1: GIF restano dove si vedono.
     Offscreen (footer) ? still; tab hidden ? still; niente MO/kick.
     Nav blur morto tolto in vc-perf injectTouchPerfCss. */
  function armUiGpuSoft() {
    if (window.__vcUiGpuSoftArmed) return;
    window.__vcUiGpuSoftArmed = 1;
    var LOGO_GIF = "/images/og-server-icon.gif?v=20261006perfLogoStill1";
    var LOGO_STILL = "/images/og-server-icon-still.png?v=20261006perfLogoStill1";
    var DISCORD_GIF = "/images/discord.gif?v=20260904brandGif1";
    var DISCORD_STILL = "/images/discord-still.png?v=20260915footerLogoGif1";
    var inView = typeof WeakMap !== "undefined" ? new WeakMap() : null;
    var io = null;
    /* perfLogoStill1: first paint = still; GIF solo dopo idle + in-view */
    var brandGifArmed = false;

    function drawerOpen() {
      try {
        return document.documentElement.classList.contains("vc-mobile-nav-open");
      } catch (e) {
        return false;
      }
    }

    function inClosedDrawer(img) {
      try {
        if (!img || !img.closest) return false;
        var d = img.closest("#vc-mobile-nav-drawer, .vc-mobile-nav-drawer");
        return Boolean(d) && !drawerOpen();
      } catch (e) {
        return false;
      }
    }

    function isLogo(img) {
      if (!img) return false;
      if (img.classList.contains("vc-header-logo-img")) return true;
      if (img.classList.contains("vc-premium-footer__logo-img")) return true;
      if (img.getAttribute && img.getAttribute("data-vc-brand-logo") === "1") return true;
      if (img.closest && img.closest(".vc-premium-footer__logo, .vc-header-logo-link, .vc-mobile-nav-drawer__brand")) {
        return true;
      }
      var s = String(img.getAttribute("src") || img.currentSrc || "");
      return /og-server-icon\.(gif|png|webp)/i.test(s);
    }

    /* brandLogoStillAlways1: logo server SEMPRE still (GIF 1.4MB = ~100% CPU + wake storms) */
    function isBrandLogo(img) {
      return isLogo(img);
    }

    function isDiscord(img) {
      var s = String(img.getAttribute("src") || img.currentSrc || "");
      return (
        (/discord(-still)?\.(gif|png|webp)/i.test(s) && !/discord\.com|cdn\.discord/i.test(s)) ||
        img.classList.contains("vc-discord-login-emoji")
      );
    }

    function wantStill(img) {
      /* cpuHoverIdle1 + homeHoverMq1b: brand/discord still di default; GIF su hover
         (hover batte anche prefers-reduced-motion — altrimenti effetto “morto”) */
      if (isBrandLogo(img) || isDiscord(img)) {
        if (document.hidden) return true;
        if (inClosedDrawer(img)) return true;
        try {
          if (img.__vcBrandHover) return false;
          if (img.getAttribute && img.getAttribute("data-vc-brand-hover") === "1") return false;
        } catch (eHov) {}
        try {
          if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            return true;
          }
        } catch (eRmB) {}
        return true;
      }
      if (document.hidden) return true;
      try {
        if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          return true;
        }
      } catch (eRm) {}
      if (inClosedDrawer(img)) return true;
      try {
        if (document.body && document.body.classList.contains("vc-web-tickets-page")) return true;
        if (document.documentElement.classList.contains("vc-site-cpu-soft")) return true;
      } catch (eSoft) {}
      try {
        if (inView && inView.has(img) && !inView.get(img)) return true;
      } catch (eV) {}
      return false;
    }

    function setSrc(img, want) {
      var cur = img.getAttribute("src") || "";
      if (cur === want) return;
      try {
        img.setAttribute("src", want);
      } catch (eSrc) {}
    }

    function syncOne(img) {
      if (!img || !img.tagName || img.tagName.toLowerCase() !== "img") return;
      var logo = isLogo(img);
      var disc = isDiscord(img);
      if (!logo && !disc) return;
      setSrc(img, wantStill(img) ? (logo ? LOGO_STILL : DISCORD_STILL) : logo ? LOGO_GIF : DISCORD_GIF);
    }

    function listImgs() {
      return document.querySelectorAll(
        "img.vc-header-logo-img, img.vc-premium-footer__logo-img, .vc-premium-footer__logo img, img.vc-discord-login-emoji, img[src*='og-server-icon'], img[src*='discord.gif'], img[src*='discord-still']",
      );
    }

    function watch(img) {
      if (!img || !io || img.__vcGifIoWatch) return;
      img.__vcGifIoWatch = 1;
      try {
        io.observe(img);
      } catch (eIo) {}
    }

    function kickNavUserAvatars() {
      /* cpuHoverIdle1b: forza PNG static in navbar (GIF solo hover da discord-avatar) */
      if (document.hidden) return;
      var avs;
      try {
        avs = document.querySelectorAll(
          "header img.discord-avatar-img, #header-quick-actions img.discord-avatar-img, header img[data-vc-avatar], #header-quick-actions img[data-vc-avatar], .discord-account-menu img.discord-avatar-img",
        );
      } catch (eSel) {
        return;
      }
      for (var a = 0; a < avs.length; a += 1) {
        var av = avs[a];
        if (!av || av.__vcBrandHover) continue;
        try {
          av.setAttribute("data-vc-avatar-static", "1");
          if (av.dataset) av.dataset.vcAvatarStatic = "1";
        } catch (eSt) {}
        try {
          var src = String(av.getAttribute("src") || av.currentSrc || "");
          if (
            window.VcDiscordAvatar &&
            typeof window.VcDiscordAvatar.preferStaticUrl === "function"
          ) {
            var still = window.VcDiscordAvatar.preferStaticUrl(src, 64) || src;
            if (still && still !== src) av.setAttribute("src", still);
          } else if (/\.gif(?:$|[?#])/i.test(src)) {
            av.setAttribute("src", src.replace(/\.gif(?=$|[?#])/i, ".png"));
          }
        } catch (eStill) {}
      }
    }

    /* userMqCss1: niente rAF/burst — solo CSS continuo (come wordmark) */
    var navUserMqResting = false;
    function pageIsHardBgForMq() {
      try {
        return (
          Boolean(document.hidden) ||
          document.visibilityState === "hidden" ||
          document.documentElement.classList.contains("vc-page-hidden")
        );
      } catch (eBg) {
        return false;
      }
    }
    function pageIsSettleForMq() {
      try {
        return document.documentElement.classList.contains("vc-cpu-settle");
      } catch (eSt) {
        return false;
      }
    }
    function resetMqTrackToOrigin(tr) {
      /* mqResetIdle1: leave-hover / tab-hidden → torna a inizio */
      if (!tr || !tr.style) return;
      try {
        tr.removeAttribute("data-vc-mq-hover-run");
      } catch (eAttr0) {}
      try {
        tr.style.setProperty("animation-play-state", "paused", "important");
        tr.style.setProperty("-webkit-animation-play-state", "paused", "important");
        tr.style.setProperty("will-change", "auto", "important");
      } catch (ePs) {}
      try {
        if (tr.__vcMqWaapi) {
          if (typeof tr.__vcMqWaapi.pause === "function") tr.__vcMqWaapi.pause();
          try {
            tr.__vcMqWaapi.currentTime = 0;
          } catch (eCtW) {}
        }
      } catch (eWp) {}
      try {
        var alist0 = tr.getAnimations ? tr.getAnimations() : [];
        for (var aj0 = 0; aj0 < alist0.length; aj0++) {
          try {
            if (typeof alist0[aj0].pause === "function") alist0[aj0].pause();
            if ("currentTime" in alist0[aj0]) alist0[aj0].currentTime = 0;
          } catch (eAj0) {}
        }
      } catch (eGa0) {}
      try {
        tr.style.setProperty("transform", "translate3d(0,0,0)", "important");
      } catch (eTx0) {}
    }
    function softPauseMqTrackKeepPos(tr) {
      /* mqNoSnapSettle1: settle FG — pause senza snap (tiene currentTime) */
      if (!tr || !tr.style) return;
      try {
        tr.style.setProperty("animation-play-state", "paused", "important");
        tr.style.setProperty("-webkit-animation-play-state", "paused", "important");
        tr.style.setProperty("will-change", "auto", "important");
      } catch (ePs) {}
      try {
        if (tr.__vcMqWaapi && typeof tr.__vcMqWaapi.pause === "function") tr.__vcMqWaapi.pause();
      } catch (eWp) {}
      try {
        var alist0 = tr.getAnimations ? tr.getAnimations() : [];
        for (var aj0 = 0; aj0 < alist0.length; aj0++) {
          try {
            if (typeof alist0[aj0].pause === "function") alist0[aj0].pause();
          } catch (eAj0) {}
        }
      } catch (eGa0) {}
    }
    function pauseNavUserMarqueeSoft() {
      try {
        var hard = pageIsHardBgForMq();
        var sel =
          "header .discord-profile-link__name[data-vc-nav-user-marquee] .vc-marquee__track, #header-quick-actions .discord-profile-link__name[data-vc-nav-user-marquee] .vc-marquee__track, header a.vc-header-site-name.is-marquee .vc-header-site-name__track, #vc-mobile-nav-drawer .discord-profile-link__name[data-vc-nav-user-marquee] .vc-marquee__track, .vc-mobile-nav-drawer__brand a.vc-header-site-name.is-marquee .vc-header-site-name__track";
        var tracks = document.querySelectorAll(sel);
        for (var fi = 0; fi < tracks.length; fi += 1) {
          /* mqHoverNoRestart1: non toccare sotto hover attivo */
          try {
            var host =
              tracks[fi].closest &&
              tracks[fi].closest(
                ".discord-profile-link, a.vc-header-site-name.is-marquee, #vc-header-promo-btn, .vc-header-promo-btn",
              );
            if (
              host &&
              (host.matches(":hover") ||
                host.matches(":focus-visible") ||
                host.matches(":focus-within"))
            ) {
              continue;
            }
          } catch (eSkip) {}
          if (hard) resetMqTrackToOrigin(tracks[fi]);
          else softPauseMqTrackKeepPos(tracks[fi]);
        }
      } catch (ePs) {}
    }
    function restNavUserMarqueeNow() {
      /* compat: non freeze permanente — solo pause se tab hidden */
      if (pageIsHardBgForMq()) pauseNavUserMarqueeSoft();
    }
    function ensureNavUserMarqueeRaf() {
      /* no-op: moto = CSS keyframes */
    }
    function userMqTrackIsHovered(trackEl) {
      /* userMqHoverKeep1: come wordmark trackHostIsHovered — no reset mid-hover */
      try {
        if (trackEl && trackEl.getAttribute("data-vc-mq-hover-run") === "1") return true;
      } catch (eFlag) {}
      try {
        var link =
          trackEl &&
          trackEl.closest &&
          trackEl.closest(".discord-profile-link");
        if (!link) return false;
        if (link.matches(":hover") || link.matches(":focus-within") || link.matches(":focus-visible")) {
          return true;
        }
      } catch (eHov) {}
      return false;
    }
    function armNavUserMarqueeCss(trackEl) {
      if (!trackEl || !trackEl.style) return;
      try {
        var hovered = userMqTrackIsHovered(trackEl);
        trackEl.style.setProperty("display", "inline-flex", "important");
        trackEl.style.setProperty("flex-wrap", "nowrap", "important");
        trackEl.style.setProperty("width", "max-content", "important");
        trackEl.style.setProperty("max-width", "none", "important");
        trackEl.style.setProperty("overflow", "visible", "important");
        var host = trackEl.parentElement;
        var dist = 0;
        try {
          dist = parseFloat((host && host.style.getPropertyValue("--vc-marquee-distance")) || "0") || 0;
        } catch (eD0) {}
        if (!(dist >= 100)) {
          try {
            dist = parseFloat(trackEl.style.getPropertyValue("--vc-marquee-distance") || "0") || 0;
          } catch (eD1) {}
        }
        if (!(dist >= 100) && host && Number(host.__vcMqDist) >= 100) dist = Number(host.__vcMqDist);
        if (!(dist >= 100)) dist = 160;
        var dur = 6;
        try {
          var durCss = parseFloat((host && host.style.getPropertyValue("--vc-marquee-duration")) || "0");
          if (durCss > 0.4) dur = durCss;
          else if (host && Number(host.__vcMqDur) > 0.4) dur = Number(host.__vcMqDur);
        } catch (eDur) {}
        try {
          trackEl.style.setProperty("--vc-marquee-distance", dist + "px", "important");
          trackEl.style.setProperty("--vc-marquee-duration", dur + "s", "important");
          if (host && host.style) {
            host.style.setProperty("--vc-marquee-distance", dist + "px", "important");
            host.style.setProperty("--vc-marquee-duration", dur + "s", "important");
            host.__vcMqDist = dist;
            host.__vcMqDur = dur;
          }
        } catch (eDistForce) {}
        /* userMqHoverKeep1: sotto hover NON cancel/rebind — ri-bind = restart@0 */
        if (!hovered) {
          try {
            if (trackEl.__vcMqWaapi && typeof trackEl.__vcMqWaapi.cancel === "function") {
              trackEl.__vcMqWaapi.cancel();
            }
          } catch (eCancel) {}
          trackEl.__vcMqWaapi = null;
        }
        /* mqNoScatti1: ri-set name/duration/delay SOLO al primo arm — altrimenti scatti a loop */
        var needBind = trackEl.getAttribute("data-vc-mq-armed") !== "1";
        if (!needBind && !hovered) {
          try {
            var prevDur = String(trackEl.style.animationDuration || "");
            if (prevDur && prevDur !== dur + "s") needBind = true;
          } catch (ePd) {}
        }
        if (needBind && !hovered) {
          trackEl.style.setProperty("animation-name", "vc-guild-name-marquee", "important");
          trackEl.style.setProperty("animation-duration", dur + "s", "important");
          trackEl.style.setProperty("animation-timing-function", "linear", "important");
          trackEl.style.setProperty("animation-iteration-count", "infinite", "important");
          trackEl.style.setProperty("animation-delay", "0s", "important");
          trackEl.style.setProperty("-webkit-animation-name", "vc-guild-name-marquee", "important");
          trackEl.style.setProperty("-webkit-animation-duration", dur + "s", "important");
          try {
            trackEl.setAttribute("data-vc-mq-armed", "1");
          } catch (eArmAttr) {}
          try {
            trackEl.style.removeProperty("transform");
          } catch (eTx0) {}
        }
        if (hovered) {
          /* userMqHoverKeep1: kick/arm mid-hover → tienila running, niente reset@0 */
          try {
            trackEl.style.removeProperty("transform");
          } catch (eTxH) {}
          try {
            trackEl.style.setProperty("animation-play-state", "running", "important");
            trackEl.style.setProperty("-webkit-animation-play-state", "running", "important");
            trackEl.style.setProperty("will-change", "transform", "important");
            trackEl.setAttribute("data-vc-mq-hover-run", "1");
          } catch (eRunH) {}
          return;
        }
        /* mqResetIdle1: arm idle = paused@0; hover JS fa running */
        resetMqTrackToOrigin(trackEl);
      } catch (eArm) {}
    }

    try {
      if (!window.__vcMqUserHoverKeep1) {
        window.__vcMqUserHoverKeep1 = 1;
        function userTrackFromTarget(t) {
          try {
            if (!t || !t.closest) return null;
            var link = t.closest(".discord-profile-link");
            if (!link) return null;
            var name = link.querySelector(
              ".discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track",
            );
            return name || null;
          } catch (eT) {
            return null;
          }
        }
        function runUserTrack(tr, on) {
          if (!tr || !tr.style) return;
          if (!on) {
            try {
              tr.removeAttribute("data-vc-mq-hover-run");
            } catch (eOff) {}
            resetMqTrackToOrigin(tr);
            return;
          }
          /* mqHoverNoRestart1 + userMqHoverKeep1: figli/kick non azzerano currentTime */
          var keepGoing = false;
          try {
            keepGoing = tr.getAttribute("data-vc-mq-hover-run") === "1";
          } catch (eKeep) {}
          if (!keepGoing) {
            try {
              var prev = tr.getAnimations ? tr.getAnimations() : [];
              for (var pj = 0; pj < prev.length; pj++) {
                if (
                  (prev[pj].playState === "running" || prev[pj].playState === "paused") &&
                  (Number(prev[pj].currentTime) || 0) > 20
                ) {
                  keepGoing = true;
                  break;
                }
              }
            } catch (ePrev) {}
          }
          try {
            tr.style.removeProperty("transform");
          } catch (eTx) {}
          tr.style.setProperty("animation-play-state", "running", "important");
          tr.style.setProperty("-webkit-animation-play-state", "running", "important");
          tr.style.setProperty("will-change", "transform", "important");
          try {
            tr.setAttribute("data-vc-mq-hover-run", "1");
          } catch (eOn) {}
          try {
            var list = tr.getAnimations ? tr.getAnimations() : [];
            for (var ai = 0; ai < list.length; ai++) {
              try {
                if (!keepGoing && "currentTime" in list[ai]) list[ai].currentTime = 0;
                if (typeof list[ai].play === "function") list[ai].play();
              } catch (eA) {}
            }
          } catch (eGa) {}
        }
        window.__vcMqRunUserTrack = runUserTrack;
        document.addEventListener(
          "pointerover",
          function (ev) {
            var tr = userTrackFromTarget(ev && ev.target);
            if (!tr) return;
            var run = window.__vcMqRunUserTrack || runUserTrack;
            run(tr, true);
          },
          true,
        );
        document.addEventListener(
          "pointerout",
          function (ev) {
            var tr = userTrackFromTarget(ev && ev.target);
            var still = userTrackFromTarget(ev && ev.relatedTarget);
            if (tr && still !== tr) runUserTrack(tr, false);
          },
          true,
        );
        document.addEventListener(
          "focusin",
          function (ev) {
            var tr = userTrackFromTarget(ev && ev.target);
            if (tr) runUserTrack(tr, true);
          },
          true,
        );
        document.addEventListener(
          "focusout",
          function (ev) {
            var tr = userTrackFromTarget(ev && ev.target);
            var still = userTrackFromTarget(ev && ev.relatedTarget);
            if (tr && still !== tr) runUserTrack(tr, false);
          },
          true,
        );
      }
    } catch (eUserHover) {}

    /* navUserNameMarquee1 + navAnimMarqueeKeep2 + navUserMarqueeMeasure1:
       nome chip — marquee se overflow (PC+phone). Misura con !important
       altrimenti max-width:100%!important sul testo ? textW≤containerW ? mai is-marquee */
    function isNavUserNameMarqueeDesktop() {
      return true;
    }

    function clearNavUserNameMarquee(nameEl, trackEl, textEl) {
      if (!nameEl) return;
      if (trackEl) {
        var clones = trackEl.querySelectorAll(".vc-marquee__text.is-clone");
        for (var c = 0; c < clones.length; c += 1) {
          if (clones[c].parentNode) clones[c].parentNode.removeChild(clones[c]);
        }
        trackEl.style.transform = "";
        trackEl.style.removeProperty("display");
        trackEl.style.removeProperty("width");
        trackEl.style.removeProperty("max-width");
        trackEl.style.removeProperty("overflow");
      }
      if (textEl) {
        textEl.style.removeProperty("padding-inline-end");
        textEl.style.removeProperty("max-width");
        textEl.style.removeProperty("overflow");
        textEl.style.removeProperty("text-overflow");
      }
      nameEl.classList.remove("is-marquee");
      nameEl.style.removeProperty("--vc-marquee-distance");
      nameEl.style.removeProperty("--vc-marquee-duration");
      nameEl.removeAttribute("data-vc-marquee-sig");
      nameEl.removeAttribute("data-vc-marquee-t0");
      if (trackEl) {
        try {
          trackEl.removeAttribute("data-vc-mq-armed");
          trackEl.style.removeProperty("transform");
          trackEl.style.removeProperty("animation");
        } catch (eClrT) {}
      }
    }

    /* chipNameMarqueeAlways2 + navUserMqLive2: SEMPRE marquee (anche se il testo ci sta) */
    function ensureNavUserMarqueeDom(nameEl) {
      if (!nameEl) return null;
      try {
        nameEl.classList.add("vc-marquee");
        nameEl.setAttribute("data-vc-nav-user-marquee", "");
        nameEl.style.setProperty("flex", "0 0 7.75rem", "important");
        nameEl.style.setProperty("width", "7.75rem", "important");
        nameEl.style.setProperty("min-width", "7.75rem", "important");
        nameEl.style.setProperty("max-width", "7.75rem", "important");
        nameEl.style.setProperty("overflow", "hidden", "important");
        nameEl.style.setProperty("display", "block", "important");
        nameEl.style.setProperty("white-space", "nowrap", "important");
        nameEl.style.setProperty("text-overflow", "clip", "important");
      } catch (ePinW) {}
      var trackEl = nameEl.querySelector(".vc-marquee__track");
      var textEl = trackEl && trackEl.querySelector(".vc-marquee__text:not(.is-clone)");
      if (trackEl && textEl) return { trackEl: trackEl, textEl: textEl };
      var keep = "";
      try {
        keep = String(
          (textEl && textEl.textContent) ||
            (nameEl.querySelector && nameEl.querySelector(".vc-marquee__text") &&
              nameEl.querySelector(".vc-marquee__text").textContent) ||
            nameEl.textContent ||
            "",
        )
          .replace(/\s+/g, " ")
          .trim();
      } catch (eKeep) {
        keep = "";
      }
      try {
        nameEl.innerHTML =
          '<span class="vc-marquee__track"><span class="vc-marquee__text"></span></span>';
        trackEl = nameEl.querySelector(".vc-marquee__track");
        textEl = trackEl && trackEl.querySelector(".vc-marquee__text");
        if (textEl && keep) textEl.textContent = keep;
        nameEl.removeAttribute("data-vc-marquee-sig");
      } catch (eRebuild) {
        return null;
      }
      if (!trackEl || !textEl) return null;
      return { trackEl: trackEl, textEl: textEl };
    }

    function applyNavUserNameMarquee(nameEl) {
      if (!nameEl) return false;
      var parts = ensureNavUserMarqueeDom(nameEl);
      if (!parts) return false;
      var trackEl = parts.trackEl;
      var textEl = parts.textEl;

      var reduceMotion = false;
      try {
        reduceMotion = !!(
          window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
        );
      } catch (eRm3) {}

      var rawText = String(textEl.textContent || "")
        .replace(/\s+/g, " ")
        .trim();
      if (!rawText) {
        clearNavUserNameMarquee(nameEl, trackEl, textEl);
        return false;
      }

      /* navUserMqLive2: ignore reduce-motion sul chip nome (come brand telefono) */
      if (!isNavUserNameMarqueeDesktop()) {
        clearNavUserNameMarquee(nameEl, trackEl, textEl);
        return false;
      }
      void reduceMotion;

      /* mqNoRestart1: già marquee+clone+stesso testo → NON misurare / NON reset t0 */
      try {
        if (
          nameEl.classList.contains("is-marquee") &&
          trackEl.querySelector(".vc-marquee__text.is-clone")
        ) {
          var prevSig = String(nameEl.getAttribute("data-vc-marquee-sig") || "");
          var prevText = prevSig ? prevSig.split("|")[0] : "";
          if (!prevText || prevText === rawText) {
            if (!prevSig) {
              nameEl.setAttribute("data-vc-marquee-sig", rawText + "|stable|a5");
            }
            if (!(Number(nameEl.__vcMqDist) >= 8)) {
              try {
                var dKeep = parseFloat(nameEl.style.getPropertyValue("--vc-marquee-distance") || "0");
                if (dKeep >= 8) nameEl.__vcMqDist = dKeep;
              } catch (eDk) {}
            }
            if (!(Number(nameEl.__vcMqDur) > 0.4)) nameEl.__vcMqDur = 6;
            /* t0: ripristina da attr se perso, MAI performance.now() fresco */
            if (!(Number(nameEl.__vcMqT0) > 0)) {
              var tAttr = Number(nameEl.getAttribute("data-vc-marquee-t0") || 0);
              if (tAttr > 0) nameEl.__vcMqT0 = tAttr;
            }
            nameEl.__vcMqTrack = trackEl;
            armNavUserMarqueeCss(trackEl);
            return true;
          }
        }
      } catch (eEarly) {}

      /* violKillReflow2: preferisci cache — evita clientWidth/scrollWidth a caldo */
      var containerW = 0;
      try {
        containerW = Math.floor(Number(nameEl.getAttribute("data-vc-mq-cw") || 0));
      } catch (eCw0) {}
      if (!(containerW > 8)) {
        try {
          containerW = Math.floor(nameEl.clientWidth || 0);
        } catch (eCwLive) {
          containerW = 0;
        }
      }
      /* navMqRaf1: fallback chip stretto — niente defer infinito che lascia il nome statico */
      if (!(containerW > 8)) containerW = 124;

      var textW = 0;
      try {
        var cachedTw = Number(nameEl.getAttribute("data-vc-mq-tw") || 0);
        if (cachedTw > 0 && Date.now() - Number(nameEl.getAttribute("data-vc-mq-tw-at") || 0) < 8000) {
          textW = cachedTw;
        }
      } catch (eCacheTw) {}
      if (!(textW > 0)) {
        /* stima da lunghezza testo — no scrollWidth sync */
        textW = Math.max(containerW, Math.min(480, String(rawText || "").length * 9 + 24));
      }
      if (!(textW > 0)) textW = Math.max(containerW, 48);
      try {
        nameEl.setAttribute("data-vc-mq-cw", String(containerW));
      } catch (eCwSet) {}
      try {
        nameEl.setAttribute("data-vc-mq-tw", String(textW));
        nameEl.setAttribute("data-vc-mq-tw-at", String(Date.now()));
      } catch (eTwSet) {}
      var gapPx = 48;
      /* Sempre segment = testo + gap (loop continuo), mai solo +24 sul container */
      var segmentW = Math.max(textW + gapPx, 80);
      /* mqNoRestart1: sig SOLO testo — larghezza fluttuante non deve resettare t0 */
      var duration = Math.max(4, Math.min(8, segmentW / 40)).toFixed(1) + "s";
      var sig = rawText + "|stable|a5";
      if (
        nameEl.getAttribute("data-vc-marquee-sig") === sig &&
        nameEl.classList.contains("is-marquee") &&
        trackEl.querySelector(".vc-marquee__text.is-clone")
      ) {
        armNavUserMarqueeCss(trackEl);
        return true;
      }

      var keepT0 = nameEl.getAttribute("data-vc-marquee-t0");
      var keepT0Num = Number(keepT0) || Number(nameEl.__vcMqT0) || 0;
      clearNavUserNameMarquee(nameEl, trackEl, textEl);
      var clone = textEl.cloneNode(true);
      clone.setAttribute("aria-hidden", "true");
      clone.classList.add("is-clone");
      trackEl.appendChild(clone);
      textEl.style.setProperty("padding-inline-end", gapPx + "px", "important");
      nameEl.style.setProperty("--vc-marquee-distance", segmentW + "px", "important");
      nameEl.style.setProperty("--vc-marquee-duration", duration, "important");
      try {
        trackEl.style.setProperty("--vc-marquee-distance", segmentW + "px", "important");
        trackEl.style.setProperty("--vc-marquee-duration", duration, "important");
      } catch (eDistTrack) {}
      nameEl.setAttribute("data-vc-marquee-sig", sig);
      var t0Keep = keepT0Num > 0 ? String(keepT0Num) : String(performance.now ? performance.now() : Date.now());
      nameEl.setAttribute("data-vc-marquee-t0", t0Keep);
      nameEl.__vcMqDist = segmentW;
      nameEl.__vcMqDur = parseFloat(duration) || 6;
      nameEl.__vcMqT0 = Number(t0Keep) || performance.now();
      nameEl.__vcMqTrack = trackEl;
      nameEl.classList.add("is-marquee");
      armNavUserMarqueeCss(trackEl);
      return true;
    }

    function kickNavUserNameMarquee() {
      /* userMqCss1: kick = misura + CSS arm continuo */
      try {
        var stableHost = document.querySelector(
          "header .discord-profile-link__name.is-marquee[data-vc-marquee-sig], #header-quick-actions .discord-profile-link__name.is-marquee[data-vc-marquee-sig]",
        );
        if (stableHost && stableHost.querySelector(".vc-marquee__text.is-clone")) {
          var stTrack = stableHost.querySelector(".vc-marquee__track");
          if (stTrack) armNavUserMarqueeCss(stTrack);
          return;
        }
      } catch (eSt) {}
      /* fxStable1: throttle solo se già is-marquee — altrimenti auth/remount veniva skippato */
      try {
        var now = Date.now();
        var hasMq = !!document.querySelector(
          "header .discord-profile-link__name.is-marquee, #header-quick-actions .discord-profile-link__name.is-marquee"
        );
        if (hasMq && window.__vcNavMqKickAt && now - Number(window.__vcNavMqKickAt) < 420) return;
        window.__vcNavMqKickAt = now;
      } catch (eTh) {}
      var nodes;
      try {
        /* navUserMqLive2: anche chip senza attr (auth/emoji possono perderlo) */
        nodes = document.querySelectorAll(
          "header .discord-profile-link__name, #header-quick-actions .discord-profile-link__name, .discord-account-menu .discord-profile-link__name, #vc-mobile-nav-drawer .discord-profile-link__name, .vc-mobile-nav-drawer .discord-profile-link__name, [data-vc-nav-user-marquee]",
        );
      } catch (eSel2) {
        return;
      }
      /* cpuStormKill1b: niente remount pin su ogni kick (era MO storm) */
      var seen = [];
      for (var i = 0; i < nodes.length; i += 1) {
        var n = nodes[i];
        if (!n || seen.indexOf(n) !== -1) continue;
        seen.push(n);
        applyNavUserNameMarquee(n);
      }
    }

    try {
      window.__vcNavUserNameMarqueeSync = function () {
        kickNavUserNameMarquee();
        try {
          /* homeBootFix2: retry lunghi — auth sticky monta dopo sipario */
          [80, 250, 700, 1500, 3200, 6000].forEach(function (ms) {
            window.setTimeout(kickNavUserNameMarquee, ms);
          });
        } catch (eKick) {}
      };
      if (window.__vcNavUserMarqueeNeed) {
        window.__vcNavUserMarqueeNeed = 0;
        window.__vcNavUserNameMarqueeSync();
      }
    } catch (eExp) {}

    /* jsWakeKill2: watch 12s (era 2.5s) — meno wake; settle solo se anim morta */
    try {
      if (!window.__vcNavUserMqWatch) {
        window.__vcNavUserMqWatch = 1;
        window.setInterval(function () {
          try {
            if (document.hidden || document.visibilityState === "hidden") return;
            if (document.documentElement.classList.contains("vc-page-hidden")) return;
            /* fase3Cpu1: in settle non re-arm (evita wake storm) */
            if (document.documentElement.classList.contains("vc-cpu-settle")) return;
            /* cpuStormKill1 + cpuHoverIdle1b: paused = OK (hover-idle).
               Non re-arm solo perché play-state≠running — era wake storm. */
            var alive = document.querySelector(
              "header .discord-profile-link__name.is-marquee[data-vc-nav-user-marquee], #header-quick-actions .discord-profile-link__name.is-marquee[data-vc-nav-user-marquee], #vc-mobile-nav-drawer .discord-profile-link__name.is-marquee[data-vc-nav-user-marquee]",
            );
            if (alive && alive.querySelector(".vc-marquee__text.is-clone")) {
              var aliveTrack = alive.querySelector(".vc-marquee__track");
              if (aliveTrack) {
                var needArm = false;
                try {
                  var csA = window.getComputedStyle(aliveTrack);
                  var an = String(csA.animationName || "");
                  if (!an || an === "none") needArm = true;
                } catch (eCsA) {}
                if (needArm) armNavUserMarqueeCss(aliveTrack);
              }
              return;
            }
            var pending = document.querySelector(
              "header .discord-profile-link__name[data-vc-nav-user-marquee], #header-quick-actions .discord-profile-link__name[data-vc-nav-user-marquee], #discord-login-state .discord-profile-link__name",
            );
            if (pending) kickNavUserNameMarquee();
          } catch (eW) {}
        }, 12000);
      }
    } catch (eWatch) {}
    try {
      if (!window.__vcNavUserMqBgArm) {
        window.__vcNavUserMqBgArm = 1;
        var syncMqBg = function (pause) {
          /* cpuStormKill1: NON remount pin su ogni settle/bg — battaglia con fx-flat */
          try {
            void pause;
          } catch (ePinRm) {}
          try {
            var hardBg = pageIsHardBgForMq();
            var settleOnly = !hardBg && !!(pause || pageIsSettleForMq());
            var tracks = document.querySelectorAll(
              "header .discord-profile-link__name[data-vc-nav-user-marquee] .vc-marquee__track, #header-quick-actions .discord-profile-link__name[data-vc-nav-user-marquee] .vc-marquee__track, #vc-mobile-nav-drawer .discord-profile-link__name[data-vc-nav-user-marquee] .vc-marquee__track, header a.vc-header-site-name.is-marquee .vc-header-site-name__track",
            );
            for (var ti = 0; ti < tracks.length; ti++) {
              /* mqNoSnapSettle1: hardBg → reset@0; settle FG → soft pause (tiene pos) */
              try {
                var host =
                  tracks[ti].closest &&
                  tracks[ti].closest(
                    ".discord-profile-link, a.vc-header-site-name.is-marquee",
                  );
                if (
                  host &&
                  (host.matches(":hover") ||
                    host.matches(":focus-visible") ||
                    host.matches(":focus-within"))
                ) {
                  continue;
                }
              } catch (eSkipH) {}
              if (hardBg) resetMqTrackToOrigin(tracks[ti]);
              else if (settleOnly) softPauseMqTrackKeepPos(tracks[ti]);
              else softPauseMqTrackKeepPos(tracks[ti]);
            }
          } catch (eSyncMq) {}
        };
        document.addEventListener(
          "vc:cpu-sleep",
          function () {
            syncMqBg(true);
          },
          false,
        );
        document.addEventListener(
          "vc:cpu-wake",
          function () {
            syncMqBg(false);
          },
          false,
        );
        /* mqCpuIdle2: settle = pause inline (era keepAlive → ~2k riattivazioni) */
        document.addEventListener(
          "vc:cpu-settle",
          function () {
            syncMqBg(true);
            pauseNavUserMarqueeSoft();
          },
          false,
        );
        document.addEventListener(
          "vc:cpu-bustle",
          function () {
            /* mqIdleResumeAll1: bustle riparte se settle già caduto */
            syncMqBg(!!pageIsSettleForMq() || pageIsHardBgForMq());
          },
          false,
        );
        /* userMqFgRun5: input FG ri-arma (throttle) se paused residuo */
        try {
          var lastFgMq = 0;
          var forceFgMq = function () {
            try {
              if (pageIsHardBgForMq()) return;
              /* mqIdleResumeAll1: input FG ri-arma solo se non settle */
              if (pageIsSettleForMq()) return;
              var nowFg = Date.now();
              if (nowFg - lastFgMq < 900) return;
              lastFgMq = nowFg;
              syncMqBg(false);
            } catch (eFg) {}
          };
          document.addEventListener("pointerdown", forceFgMq, { passive: true });
          document.addEventListener("keydown", forceFgMq, { passive: true });
        } catch (eFgArm) {}
        window.addEventListener(
          "vc:cpu-sleep",
          function () {
            syncMqBg(true);
          },
          false,
        );
        window.addEventListener(
          "vc:cpu-wake",
          function () {
            syncMqBg(false);
          },
          false,
        );
        var remountUserMqPin = function (pause) {
          /* cpuStormKill1b: no appendChild pin — solo sync pause state */
          try {
            syncMqBg(!!pause || pageIsSettleForMq() || pageIsHardBgForMq());
          } catch (eArm) {}
        };
        document.addEventListener("vc:cpu-settle", function () { remountUserMqPin(true); }, false);
        document.addEventListener("vc:cpu-bustle", function () { remountUserMqPin(false); }, false);
        window.addEventListener("vc:cpu-settle", function () { remountUserMqPin(true); }, false);
        window.addEventListener("vc:cpu-bustle", function () { remountUserMqPin(false); }, false);
      }
    } catch (eBgArm) {}

    /* navUserMqForce1: se auth monta il chip dopo chrome-boot, riparti */
    try {
      if (!window.__vcNavUserMqMo) {
        window.__vcNavUserMqMo = 1;
        var moRoot =
          document.getElementById("discord-login-state") ||
          document.getElementById("header-quick-actions") ||
          document.querySelector("header");
        if (moRoot && typeof MutationObserver === "function") {
          var mqMoT = 0;
          var mo = new MutationObserver(function () {
            if (mqMoT) return;
            mqMoT = window.setTimeout(function () {
              mqMoT = 0;
              /* cpuStormKill1b: se marquee già montata, stop — niente arm/kick continuo */
              try {
                var st = document.querySelector(
                  "header .discord-profile-link__name.is-marquee[data-vc-marquee-sig], #header-quick-actions .discord-profile-link__name.is-marquee[data-vc-marquee-sig]",
                );
                if (st && st.querySelector(".vc-marquee__text.is-clone")) return;
              } catch (eStMo) {}
              kickNavUserNameMarquee();
            }, 400);
          });
          mo.observe(moRoot, { childList: true, subtree: true });
        }
      }
    } catch (eMo) {}

    function syncAll() {
      try {
        document.documentElement.classList.toggle("vc-page-hidden", Boolean(document.hidden));
        document.documentElement.classList.toggle("vc-ui-gif-paused", Boolean(document.hidden));
      } catch (eCls) {}
      /* violKill6: tab nascosta → solo classi, niente query/marquee/layout */
      if (document.hidden) return;
      var imgs = listImgs();
      /* violKillIdle2: sync immagini a fette (era un blocco setTimeout 290ms+) */
      var i = 0;
      function sliceImgs() {
        if (document.hidden) return;
        var end = Math.min(i + 2, imgs.length);
        for (; i < end; i += 1) {
          try {
            watch(imgs[i]);
            syncOne(imgs[i]);
          } catch (eOne) {}
        }
        if (i < imgs.length) {
          window.setTimeout(sliceImgs, 16);
          return;
        }
        try {
          kickNavUserAvatars();
        } catch (eKick) {}
      }
      sliceImgs();
      /* marquee ha watcher dedicato — non rifare measure qui */
    }

    function syncAllDeferred() {
      /* violKillCue2 + violKillConsole1: skip se hidden; un solo arm (niente doppio sync) */
      try {
        if (document.hidden || document.visibilityState === "hidden") return;
      } catch (eHid) {}
      if (window.__vcChromeVisSyncArm) return;
      window.__vcChromeVisSyncArm = 1;
      window.setTimeout(function () {
        window.__vcChromeVisSyncArm = 0;
        try {
          if (document.hidden) return;
          /* brandLogoStillAlways1: non armare mai brand GIF */
          brandGifArmed = false;
          syncAll();
        } catch (eSyncVis) {}
      }, 280);
    }

    try {
      if (typeof IntersectionObserver !== "undefined") {
        io = new IntersectionObserver(
          function (entries) {
            for (var i = 0; i < entries.length; i += 1) {
              var en = entries[i];
              if (inView) inView.set(en.target, Boolean(en.isIntersecting));
              syncOne(en.target);
            }
          },
          { root: null, rootMargin: "64px 0px", threshold: 0.01 },
        );
      }
    } catch (eObs) {
      io = null;
    }

    /* cpuHoverIdle1: logo server / discord emoji → GIF solo hover */
    function brandHoverHost(node) {
      if (!node || !node.closest) return null;
      return node.closest(
        "a.vc-header-logo-link, .vc-header-logo-link, a.vc-premium-footer__logo-row, .vc-premium-footer__logo, .vc-mobile-nav-drawer__brand, .vc-discord-login-emoji, img.vc-header-logo-img, img.vc-premium-footer__logo-img, img.vc-discord-login-emoji",
      );
    }
    function setBrandHover(host, on) {
      if (!host) return;
      var imgs = [];
      try {
        if (host.tagName === "IMG") imgs = [host];
        else imgs = host.querySelectorAll("img.vc-header-logo-img, img.vc-premium-footer__logo-img, img.vc-discord-login-emoji, img[src*='og-server-icon'], img[src*='discord']");
      } catch (eIm) {}
      for (var i = 0; i < imgs.length; i++) {
        try {
          imgs[i].__vcBrandHover = on ? 1 : 0;
          /* logoHoverGif1: attr leggibile da vc-perf (skip force-still durante hover) */
          try {
            if (on) imgs[i].setAttribute("data-vc-brand-hover", "1");
            else imgs[i].removeAttribute("data-vc-brand-hover");
          } catch (eAttr) {}
          syncOne(imgs[i]);
        } catch (eSy) {}
      }
    }
    document.addEventListener(
      "pointerover",
      function (ev) {
        try {
          if (document.hidden) return;
          var host = brandHoverHost(ev.target);
          if (host) setBrandHover(host, true);
        } catch (ePo) {}
        /* marquee404Fix1b: sblocca inline pause stuck sul dot candidature */
        try {
          var promo = ev.target && ev.target.closest && ev.target.closest("#vc-header-promo-btn");
          if (promo) {
            var dot = promo.querySelector(".vc-header-promo-btn__dot");
            if (dot && dot.style) {
              dot.style.removeProperty("animation-play-state");
              dot.style.removeProperty("-webkit-animation-play-state");
              dot.style.setProperty("animation-name", "vc-header-promo-dot-pulse", "important");
              dot.style.setProperty("animation-duration", "1.6s", "important");
              dot.style.setProperty("animation-iteration-count", "infinite", "important");
              dot.style.setProperty("animation-play-state", "running", "important");
              dot.style.setProperty("-webkit-animation-play-state", "running", "important");
            }
          }
        } catch (ePromoHov) {}
      },
      true,
    );
    document.addEventListener(
      "pointerout",
      function (ev) {
        try {
          var host = brandHoverHost(ev.target);
          if (!host) return;
          var rel = ev.relatedTarget;
          if (rel && host.contains && host.contains(rel)) return;
          if (rel && brandHoverHost(rel) === host) return;
          setBrandHover(host, false);
        } catch (ePx) {}
        try {
          var promo = ev.target && ev.target.closest && ev.target.closest("#vc-header-promo-btn");
          var relP = ev.relatedTarget;
          if (promo && (!relP || !promo.contains(relP))) {
            var dot = promo.querySelector(".vc-header-promo-btn__dot");
            if (dot && dot.style) {
              dot.style.removeProperty("animation-play-state");
              dot.style.removeProperty("-webkit-animation-play-state");
            }
          }
        } catch (ePromoOut) {}
      },
      true,
    );

    /* cpuHoverIdle1 + marquee404Fix1: wordmark/user/promo — marquee+dot solo :hover */
    try {
      var mqHov = document.getElementById("vc-mq-hover-only-css");
      if (!mqHov || mqHov.getAttribute("data-vc") !== "mqHeroMetal1c") {
        if (!mqHov) {
          mqHov = document.createElement("style");
          mqHov.id = "vc-mq-hover-only-css";
        }
        mqHov.setAttribute("data-vc", "mqHeroMetal1c");
        mqHov.textContent =
          "html body.vc-body header a.vc-header-site-name.is-marquee .vc-header-site-name__track," +
          "html body.vc-body .vc-mobile-nav-drawer__brand a.vc-header-site-name.is-marquee .vc-header-site-name__track," +
          "html body.vc-body header .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track," +
          "html body.vc-body #header-quick-actions .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track," +
          "html body.vc-body #vc-mobile-nav-drawer .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track," +
          "html body.vc-body #header-quick-actions #vc-header-promo-btn.is-marquee .vc-header-promo-btn__track," +
          "html body.vc-body header #vc-header-promo-btn.is-marquee .vc-header-promo-btn__track," +
          "html body.vc-body #header-quick-actions #vc-header-promo-btn .vc-header-promo-btn__dot," +
          "html body.vc-body header #vc-header-promo-btn .vc-header-promo-btn__dot," +
          "html.vc-perf-mid body.vc-body #header-quick-actions #vc-header-promo-btn.vc-header-promo-btn--candidature .vc-header-promo-btn__dot{" +
          "animation-play-state:paused!important;-webkit-animation-play-state:paused!important;will-change:auto!important}" +
          /* mqHeroMetal1c: hover play running — MAI transform:!important (uccide keyframes) */
          "html body.vc-body header a.vc-header-site-name.is-marquee:hover .vc-header-site-name__track," +
          "html body.vc-body header a.vc-header-site-name.is-marquee:focus-visible .vc-header-site-name__track," +
          "html body.vc-body .vc-mobile-nav-drawer__brand a.vc-header-site-name.is-marquee:hover .vc-header-site-name__track," +
          "html body.vc-body header .discord-profile-link:hover .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track," +
          "html body.vc-body header .discord-profile-link:focus-within .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track," +
          "html body.vc-body #header-quick-actions .discord-profile-link:hover .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track," +
          "html body.vc-body #header-quick-actions .discord-profile-link:focus-within .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track," +
          "html body.vc-body #vc-mobile-nav-drawer .discord-profile-link:hover .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track," +
          "html body.vc-body #header-quick-actions #vc-header-promo-btn.is-marquee:hover .vc-header-promo-btn__track," +
          "html body.vc-body #header-quick-actions #vc-header-promo-btn.is-marquee:focus-visible .vc-header-promo-btn__track," +
          "html body.vc-body header #vc-header-promo-btn.is-marquee:hover .vc-header-promo-btn__track{" +
          "animation-name:vc-guild-name-marquee!important;" +
          "animation-play-state:running!important;-webkit-animation-play-state:running!important;" +
          "will-change:transform!important}" +
          "html body.vc-body #header-quick-actions #vc-header-promo-btn.vc-header-promo-btn--candidature:hover .vc-header-promo-btn__dot," +
          "html body.vc-body #header-quick-actions #vc-header-promo-btn.vc-header-promo-btn--candidature:focus-visible .vc-header-promo-btn__dot," +
          "html body.vc-body header #vc-header-promo-btn.vc-header-promo-btn--candidature:hover .vc-header-promo-btn__dot{" +
          "animation-name:vc-header-promo-dot-pulse!important;" +
          "animation-duration:1.6s!important;animation-timing-function:ease-in-out!important;" +
          "animation-iteration-count:infinite!important;" +
          "animation-play-state:running!important;-webkit-animation-play-state:running!important;" +
          "will-change:transform,opacity!important}";
        (document.head || document.documentElement).appendChild(mqHov);
      }
    } catch (eMqCss) {}

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        try {
          document.documentElement.classList.add("vc-page-hidden", "vc-ui-gif-paused");
        } catch (eHidCls) {}
        return;
      }
      window.setTimeout(syncAllDeferred, 80);
    });
    window.addEventListener("pageshow", syncAllDeferred);
    window.addEventListener("vc:mobile-nav", syncAllDeferred);
    window.addEventListener("vc:cpu-sleep", syncAllDeferred);
    window.addEventListener("vc:cpu-wake", syncAllDeferred);
    window.addEventListener(
      "resize",
      function () {
        try {
          window.setTimeout(kickNavUserNameMarquee, 80);
        } catch (eRs) {}
      },
      { passive: true },
    );
    /* jsWakeIdle3: un solo MO mount (sopra) — niente secondo kick su ogni badge/auth mutate */
    try {
      if (!window.__vcNavUserMqMo2Dead) {
        window.__vcNavUserMqMo2Dead = 1;
        /* intentionally no second MutationObserver — was re-arming burst forever */
      }
    } catch (eMoNav) {}
    syncAllDeferred();
  }

  boot();
})();

/* floatContentHide1 + floatCoverFix1: hide per-float solo se overlap REALE footer/card */
(function () {
  "use strict";
  if (window.__VC_FLOAT_CONTENT_HIDE === "floatCoverFix1") return;
  window.__VC_FLOAT_CONTENT_HIDE = "floatCoverFix1";

  var HIDE_CLASS = "vc-float-over-content";
  var HTML_HIDE = "vc-float-content-hide"; /* legacy: non più usata come trigger globale */
  var FLOAT_SEL =
    "#vc-site-back-top, #vc-twitch-pip, #vc-twitch-pip-reopen, .vc-kick-pip, .vc-kick-pip-reopen, " +
    "#vc-type-sfx-player, .vc-type-sfx-player, #vc-confessionale-music-player, " +
    "#vc-sf-music-player, .vc-bgm-player--confessionale, .vc-bgm-player--seratafilm, " +
    ".vc-bgm-player--hogwarts, .vc-hw-music-fab, .vc-home-scrollcue, #vc-home-scrollcue";
  /* card “solide” — niente main/p/a generici (nascondevano troppo presto) */
  var COVER_SEL =
    "footer, .vc-premium-footer, .vc-premium-footer__card, .vc-premium-footer__outer, " +
    ".vc-premium-footer__legal, .vc-page-cine-card, .vc-fx-card, .vc-home-panel, " +
    ".vc-staff-compiti-book, .vc-legal-card, .vc-staff-hub-card, .vc-dash-card, " +
    ".vc-reviews-card, .vc-feedback-card, .vc-ul-card, .vc-role-card, .vc-sponsor-card, " +
    ".vc-perks-card, .vc-vote-live-statbox, .vc-home-index, #stats";
  var timer = 0;
  var lastSig = "";

  function footerEl() {
    return (
      document.querySelector("footer.vc-premium-footer") ||
      document.querySelector("body > footer") ||
      document.querySelector("footer")
    );
  }

  function overlapArea(a, b) {
    var left = Math.max(a.left, b.left);
    var right = Math.min(a.right, b.right);
    var top = Math.max(a.top, b.top);
    var bottom = Math.min(a.bottom, b.bottom);
    var w = right - left;
    var h = bottom - top;
    if (w <= 0 || h <= 0) return 0;
    return w * h;
  }

  function floatHitsFooter(r) {
    var foot = footerEl();
    if (!foot) return false;
    var fr = foot.getBoundingClientRect();
    var area = overlapArea(r, fr);
    if (area < 1) return false;
    /* serve overlap sostanziale (≥28% del float o ≥36px²) — non solo bordo vicino */
    var floatA = Math.max(1, r.width * r.height);
    return area >= 36 && area / floatA >= 0.28;
  }

  function pointHitsSolidCard(x, y) {
    if (x < 0 || y < 0 || x > (window.innerWidth || 0) || y > (window.innerHeight || 0)) {
      return false;
    }
    var under = null;
    try {
      under = document.elementFromPoint(x, y);
    } catch (eP) {
      return false;
    }
    if (!under || under === document.documentElement || under === document.body) return false;
    if (under.closest("header, .vc-home-cine, .vc-home-cine__canvas, .vc-blob, #vc-site-progress, #vc-site-cursor-light")) {
      return false;
    }
    return !!under.closest(COVER_SEL);
  }

  function floatCoversContent(el) {
    if (!el || el.hidden || el.getAttribute("hidden") != null) return false;
    /* freccia: solo se è effettivamente on */
    if (el.id === "vc-site-back-top" && !(el.classList && el.classList.contains("is-on"))) {
      return false;
    }
    var alreadyHidden = !!(el.classList && el.classList.contains(HIDE_CLASS));
    var cs = window.getComputedStyle(el);
    /* se già nascosto da noi, valuta comunque la geometria (evita flicker show/hide) */
    if (!alreadyHidden && (cs.display === "none" || cs.visibility === "hidden")) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    var vh = window.innerHeight || 0;
    var freePip = el.classList && el.classList.contains("vc-kick-pip--free");
    if (!freePip && (r.bottom < 0 || r.top > vh)) return false;

    if (floatHitsFooter(r)) return true;

    var floats = document.querySelectorAll(FLOAT_SEL);
    var restored = [];
    var i;
    for (i = 0; i < floats.length; i++) {
      restored.push(floats[i].style.pointerEvents);
      floats[i].style.pointerEvents = "none";
    }
    /* 3 punti: nascondi solo se ≥2 colpiscono una card solida */
    var hits = 0;
    if (pointHitsSolidCard(r.left + r.width * 0.5, r.top + r.height * 0.5)) hits += 1;
    if (pointHitsSolidCard(r.left + r.width * 0.35, r.top + r.height * 0.72)) hits += 1;
    if (pointHitsSolidCard(r.left + r.width * 0.65, r.top + r.height * 0.72)) hits += 1;
    for (i = 0; i < floats.length; i++) {
      floats[i].style.pointerEvents = restored[i] || "";
    }
    return hits >= 2;
  }

  function sync() {
    var nodes = document.querySelectorAll(FLOAT_SEL);
    var any = false;
    var sigParts = [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var hide = false;
      try {
        hide = floatCoversContent(el);
      } catch (eOne) {
        hide = false;
      }
      if (hide) any = true;
      sigParts.push(hide ? "1" : "0");
      try {
        el.classList.toggle(HIDE_CLASS, !!hide);
      } catch (eT) {}
    }
    var sig = sigParts.join("");
    if (sig === lastSig) return;
    lastSig = sig;
    /* legacy global class: sempre off (hide è per-float via .vc-float-over-content) */
    try {
      document.documentElement.classList.remove(HTML_HIDE);
    } catch (eH) {}
    void any;
  }

  function schedule() {
    if (timer) return;
    timer = window.setTimeout(function () {
      timer = 0;
      sync();
    }, 90);
  }

  function boot() {
    try {
      document.documentElement.classList.remove(HTML_HIDE);
    } catch (eClr) {}
    sync();
    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("vc:chrome-load-done", schedule);
    document.addEventListener("visibilitychange", schedule);
    try {
      var foot = footerEl();
      if (foot && typeof IntersectionObserver === "function") {
        var io = new IntersectionObserver(
          function () {
            schedule();
          },
          { root: null, threshold: [0, 0.05, 0.15, 0.35, 0.6] },
        );
        io.observe(foot);
      }
    } catch (eIo) {}
    try {
      if (typeof MutationObserver === "function" && document.body) {
        var mo = new MutationObserver(schedule);
        mo.observe(document.body, { childList: true, subtree: false });
      }
    } catch (eMo) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
/* floatContentHide1 */
/* floatCoverFix1 */

/* violKill1 */
/* violKillIdle2 */
/* violKillReflow1 */
/* violKillVis1 */
/* violKillCue2 */
/* violKillReflow2 */
/* violKillAll1 */
/* extOnlyFix1 */
/* violPass10 */
/* violPass11 */
/* violPass12 */
/* navAnimMarqueeKeep2 */
/* navUserMarqueeMeasure1 */
/* snavUserMarquee1 */
/* snavUserMarquee2 */
/* snavUserMarquee3 */
/* navGifKeepMotion1 */

/* ptrScrollYoYoKill1 */
