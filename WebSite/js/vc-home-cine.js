(function () {
  if (window.__vcHomeCine) return;
  /* profileHangKill2: /user/?id=… — home-cine freeze main thread (DCL never fires). Bail ASAP.
     pageHang3: /notifications + /staff/* stesso freeze (“La pagina non risponde”).
     statusHangKill1: /status/ stesso hang (CDP Runtime.evaluate timeout 25s+; keys i18n raw).
     Layout cine staff/notif/status è già baked in HTML — skip init pesante (canvas/MO/sync). */
  try {
    var __p = String(location.pathname || "").replace(/\/+$/, "") || "/";
    var __q = new URLSearchParams(location.search || "");
    var __id = String(__q.get("id") || __q.get("userId") || __q.get("uid") || "").trim();
    var __body = document.body;
    var __isProf =
      ((__p === "/user" || __p === "/users") && /^\d{17,20}$/.test(__id)) ||
      /^\/users?\/\d{17,20}$/.test(__p) ||
      (document.documentElement &&
        (document.documentElement.classList.contains("vc-user-profile-route") ||
          document.documentElement.classList.contains("vc-user-profile-pending")));
    var __isNotif =
      __p === "/notifications" ||
      (__body && __body.classList.contains("vc-notifications-page"));
    var __isStaff =
      __p === "/staff" ||
      __p.indexOf("/staff/") === 0 ||
      (document.documentElement && document.documentElement.classList.contains("vc-staff-route")) ||
      (__body && __body.classList.contains("vc-staff-area"));
    var __isStatus =
      __p === "/status" ||
      (__body && __body.classList.contains("vc-status-page"));
    if (__isProf || __isNotif || __isStaff || __isStatus) {
      window.__vcHomeCine = true;
      window.__vcHomeCineProfileSkip = 1;
      window.__vcHomeCinePageHang3Skip = 1;
      if (__isStatus) window.__vcHomeCineStatusSkip = 1;
      try {
        var __root = document.documentElement;
        if (__root) {
          __root.classList.add(
            "vc-page-cine-ready",
            "vc-cine-curtain-off",
            "vc-home-motion-ready",
            "vc-home-cine-live",
            "vc-scrollcue-away",
          );
          __root.classList.remove("vc-page-cine-boot");
        }
      } catch (__eCls) {}
      /* profileScrollCueKill1: bail senza lasciare cue a 1° paint */
      try {
        var __cues = document.querySelectorAll(".vc-home-scrollcue");
        for (var __ci = 0; __ci < __cues.length; __ci++) {
          var __c = __cues[__ci];
          try {
            if (__c.style) {
              __c.style.setProperty("display", "none", "important");
              __c.style.setProperty("visibility", "hidden", "important");
              __c.style.setProperty("opacity", "0", "important");
            }
          } catch (__eH) {}
          try {
            __c.remove();
          } catch (__eR) {
            try {
              if (__c.parentNode) __c.parentNode.removeChild(__c);
            } catch (__eR2) {}
          }
        }
      } catch (__eCue) {}
      return;
    }
  } catch (__eProf) {}
  window.__vcHomeCine = true;
  /* violRafWheel1: wheel/scroll = solo hide (no pinScrollCueLayout → no Forced reflow) */
  /* violKillRest1: cine-ready → onResizePin deferred */
  /* scrollCueAwayHard1: hide allo scroll non viene più resettato da geometry-not-ready */
  /* scrollCueNoFollow1: html.vc-scrollcue-away batte display:flex critico nell'hero */
  /* scrollCuePinHide2: fisso al margine; hide solo con Y>soglia; niente re-show mid-wheel */
  /* scrollCueProfileKill2: profilo / skip → remove DOM (inline flex batteva CSS height:0) */

  /* bgGifForceRm1: first paint = still; arma GIF dopo ready.
     Non più gated da prefers-reduced-motion (Win “Animazioni off” lasciava still forever).
     Desktop sfondo.gif ~1.5MB · mobile sfondo-mobile.gif ~405KB. */
  /* bgGifWakeRemount1: non-home restavano still — decode GIF congelato da
     vc-page-hidden/display:none durante boot/wake senza remount.
     pwaResumeLag1: al resume corto → soft thaw (no strip src / no re-decode 1.5MB).
     Hard remount solo hide lunga, stuck still, o arm/sweep. */
  /* fase3NoCanvas1: photo-bg ON → static only (no canvas rAF); seratafilm early-return in boot */
  var SITE_PHOTO_BG =
    typeof window.__VC_SITE_PHOTO_BG === "boolean" ? window.__VC_SITE_PHOTO_BG : true;
  window.__VC_SITE_PHOTO_BG = SITE_PHOTO_BG;
  /* homePerfIdle1: still webp (stessa foto del PNG, ~10× più leggero) — niente GIF */
  var PHOTO_BG_VER = "20261020homeBootCut1";
  var CONFESSIONALE_PHOTO_SRC = "/images/Confessionale-GF.jpg?v=20261012confBgNoGifBlack1";
  var SITE_PHOTO_BG_DESKTOP_STILL = "/images/sfondo-still.webp?v=" + PHOTO_BG_VER;
  var SITE_PHOTO_BG_MOBILE_STILL = "/images/sfondo-mobile-still.webp?v=" + PHOTO_BG_VER;
  var SITE_PHOTO_BG_DESKTOP_GIF = SITE_PHOTO_BG_DESKTOP_STILL;
  var SITE_PHOTO_BG_MOBILE_GIF = SITE_PHOTO_BG_MOBILE_STILL;
  var SITE_PHOTO_BG_DESKTOP = SITE_PHOTO_BG_DESKTOP_STILL;
  var SITE_PHOTO_BG_MOBILE = SITE_PHOTO_BG_MOBILE_STILL;
  var photoGifArmed = false;
  var gifIdleFrozen = false;
  var gifIdleTimer = 0;
  var lastPhotoInputAt = 0;
  var photoGifArmStartedAt = 0;
  var photoGifWakeRemountTimer = 0;
  var photoHiddenSinceAt = 0;
  var lastHardRemountAt = 0;
  var lastWakeHandledAt = 0;
  var WAKE_HARD_HIDE_MS = 22000;
  var HARD_REMOUNT_MIN_GAP_MS = 10000;

  function isCoarsePointer() {
    try {
      if (window.matchMedia && window.matchMedia("(max-width:639.98px)").matches) return true;
      if (window.matchMedia && window.matchMedia("(pointer:coarse)").matches) return true;
    } catch (e) {}
    return false;
  }

  function isStandalonePwaPhoto() {
    try {
      if (window.__VC_PWA_CPU_NUKE) return true;
      if (document.documentElement && document.documentElement.classList.contains("vc-pwa-cpu-nuke")) return true;
      if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true;
      if (window.matchMedia && window.matchMedia("(display-mode: minimal-ui)").matches) return true;
      if (window.matchMedia && window.matchMedia("(display-mode: fullscreen)").matches) return true;
      if (navigator.standalone) return true;
    } catch (ePwa) {}
    return false;
  }

  function isBgIdleFrozen() {
    return false;
  }

  function forcePhotoStillFlag() {
    /* homePerfIdle1: always still webp */
    return true;
  }

  function canArmPhotoGif() {
    /* fgRevertBgOnly1: GIF ok in foreground; stop solo se hidden/save-data */
    if (forcePhotoStillFlag()) return false;
    try {
      if (document.hidden) return false;
    } catch (eH) {}
    try {
      if (navigator.connection && navigator.connection.saveData) return false;
    } catch (eSd) {}
    return true;
  }

  function clearStuckPhotoPauseClasses() {
    try {
      if (document.hidden) return;
      var root = document.documentElement;
      root.classList.remove(
        "vc-page-hidden",
        "vc-gif-paused",
        "vc-ui-gif-paused",
        "vc-pwa-bg-frozen",
        "vc-photo-idle",
      );
    } catch (eClr) {}
  }

  function sitePhotoWantGif() {
    return isCoarsePointer() ? SITE_PHOTO_BG_MOBILE_GIF : SITE_PHOTO_BG_DESKTOP_GIF;
  }

  function photoLooksStuckStill() {
    try {
      var photos = document.querySelectorAll(".vc-home-cine__photo");
      if (!photos.length) return true;
      for (var i = 0; i < photos.length; i += 1) {
        var photo = photos[i];
        if (!photo || isLockedCustomPhoto(photo)) continue;
        var src = String(photo.getAttribute("src") || "");
        if (!src || isForbiddenStillSrc(src) || src.indexOf(".gif") === -1) return true;
        try {
          var cs = window.getComputedStyle(photo);
          if (cs && (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity || "1") < 0.05)) {
            return true;
          }
        } catch (eCs) {}
      }
      return false;
    } catch (eStuck) {
      return false;
    }
  }

  function softThawSitePhotoGif(reason) {
    if (forcePhotoStillFlag()) return;
    try {
      if (document.hidden) return;
    } catch (eHid) {}
    clearStuckPhotoPauseClasses();
    if (!photoGifArmed) {
      scheduleArmPhotoGif();
      return;
    }
    SITE_PHOTO_BG_DESKTOP = SITE_PHOTO_BG_DESKTOP_GIF;
    SITE_PHOTO_BG_MOBILE = SITE_PHOTO_BG_MOBILE_GIF;
    var want = sitePhotoWantGif();
    try {
      var stages = document.querySelectorAll(".vc-home-cine");
      for (var si = 0; si < stages.length; si += 1) ensureSitePhotoLayer(stages[si]);
    } catch (eSt) {}
    var photos = document.querySelectorAll(".vc-home-cine__photo");
    for (var i = 0; i < photos.length; i += 1) {
      var photo = photos[i];
      if (!photo || isLockedCustomPhoto(photo)) continue;
      try {
        photo.style.removeProperty("display");
        photo.style.removeProperty("visibility");
        photo.style.removeProperty("opacity");
        var cur = String(photo.getAttribute("src") || "");
        if (!cur || isForbiddenStillSrc(cur) || cur.indexOf(".gif") === -1) {
          photo.setAttribute("src", want);
        }
        photo.dataset.vcGifKick = "1";
        photo.dataset.vcGifRemount = "soft:" + String(reason || "wake");
      } catch (eSoft) {}
    }
    try {
      window.__VC_SITE_PHOTO_GIF_ARMED = 1;
      window.__VC_SITE_PHOTO_GIF_REMOUNT = "soft:" + String(reason || "wake");
    } catch (eMeta) {}
  }

  function wakeNeedsHardRemount(reason) {
    var r = String(reason || "");
    if (r === "arm" || r === "arm-hidden" || r === "sweep") return true;
    var hiddenFor = 0;
    try {
      if (photoHiddenSinceAt) hiddenFor = Math.max(0, Date.now() - photoHiddenSinceAt);
    } catch (eHf) {}
    if (hiddenFor >= WAKE_HARD_HIDE_MS) return true;
    if (!photoGifArmed) return false;
    return photoLooksStuckStill();
  }

  /* bgGifWakeRemount1 + pwaResumeLag1: hard remount solo se serve; preload → swap (no blank) */
  function forceRemountSitePhotoGif(reason) {
    if (forcePhotoStillFlag()) return;
    try {
      if (document.hidden) return;
    } catch (eHid) {}
    clearStuckPhotoPauseClasses();
    if (!photoGifArmed) {
      scheduleArmPhotoGif();
      return;
    }
    var now = Date.now();
    if (now - lastHardRemountAt < HARD_REMOUNT_MIN_GAP_MS && String(reason || "") !== "arm") {
      softThawSitePhotoGif(reason || "wake-throttle");
      return;
    }
    lastHardRemountAt = now;
    SITE_PHOTO_BG_DESKTOP = SITE_PHOTO_BG_DESKTOP_GIF;
    SITE_PHOTO_BG_MOBILE = SITE_PHOTO_BG_MOBILE_GIF;
    var want = sitePhotoWantGif();
    try {
      var stages = document.querySelectorAll(".vc-home-cine");
      for (var si = 0; si < stages.length; si += 1) ensureSitePhotoLayer(stages[si]);
    } catch (eSt) {}
    var photos = document.querySelectorAll(".vc-home-cine__photo");
    function applySrc(photo) {
      if (!photo || isLockedCustomPhoto(photo)) return;
      try {
        photo.dataset.vcGifKick = "";
        photo.style.removeProperty("display");
        photo.style.removeProperty("visibility");
        photo.style.removeProperty("opacity");
        /* pwaResumeLag1: niente removeAttribute — evita frame bianco + doppio decode */
        photo.setAttribute("src", want);
        photo.dataset.vcGifKick = "1";
        photo.dataset.vcGifRemount = String(reason || "wake");
      } catch (eRm) {}
    }
    try {
      var pre = new Image();
      pre.decoding = "async";
      var done = false;
      var finish = function () {
        if (done) return;
        done = true;
        for (var i = 0; i < photos.length; i += 1) applySrc(photos[i]);
      };
      pre.onload = finish;
      pre.onerror = finish;
      pre.src = want;
      window.setTimeout(finish, 900);
    } catch (ePre) {
      for (var j = 0; j < photos.length; j += 1) applySrc(photos[j]);
    }
    try {
      window.__VC_SITE_PHOTO_GIF_ARMED = 1;
      window.__VC_SITE_PHOTO_GIF_REMOUNT = String(reason || "wake");
    } catch (eMeta) {}
  }

  function scheduleWakeRemount(reason) {
    var r = String(reason || "wake");
    try {
      var now = Date.now();
      /* coalescia visibility + cpu-wake + pwa-thaw nello stesso burst */
      if (now - lastWakeHandledAt < 400 && photoGifWakeRemountTimer) return;
    } catch (eCo) {}
    if (photoGifWakeRemountTimer) {
      try {
        window.clearTimeout(photoGifWakeRemountTimer);
      } catch (eClr) {}
      photoGifWakeRemountTimer = 0;
    }
    photoGifWakeRemountTimer = window.setTimeout(function () {
      photoGifWakeRemountTimer = 0;
      try {
        lastWakeHandledAt = Date.now();
        if (wakeNeedsHardRemount(r)) forceRemountSitePhotoGif(r);
        else softThawSitePhotoGif(r);
      } catch (eForce) {}
      try {
        photoHiddenSinceAt = 0;
      } catch (eClrH) {}
    }, 80);
  }

  function armPhotoGif() {
    if (photoGifArmed) return;
    if (!canArmPhotoGif()) return;
    photoGifArmed = true;
    SITE_PHOTO_BG_DESKTOP = SITE_PHOTO_BG_DESKTOP_GIF;
    SITE_PHOTO_BG_MOBILE = SITE_PHOTO_BG_MOBILE_GIF;
    try {
      window.__VC_SITE_PHOTO_GIF_ARMED = 1;
    } catch (eArm) {}
    try {
      /* fxStable1: ri-assert layer + sync (arm spesso prima che .vc-home-cine esista) */
      var stages = document.querySelectorAll(".vc-home-cine");
      for (var si = 0; si < stages.length; si += 1) ensureSitePhotoLayer(stages[si]);
      syncGifDecodeForVisibility();
      /* bgGifWakeRemount1: se arm durante hide/pause, remount appena visibile */
      if (!document.hidden) forceRemountSitePhotoGif("arm");
      else scheduleWakeRemount("arm-hidden");
    } catch (eSync) {}
  }

  function scheduleArmPhotoGif() {
    if (photoGifArmed || forcePhotoStillFlag()) return;
    if (!photoGifArmStartedAt) photoGifArmStartedAt = Date.now();
    function run() {
      if (photoGifArmed) return;
      if (!canArmPhotoGif()) {
        window.setTimeout(run, 280);
        return;
      }
      var readyWaitMs = 0;
      try {
        readyWaitMs = Date.now() - (photoGifArmStartedAt || Date.now());
      } catch (eRw) {}
      try {
        var root = document.documentElement;
        var readyOk =
          !root ||
          root.classList.contains("vc-soft-fx-ready") ||
          root.classList.contains("vc-home-styles-ready") ||
          root.classList.contains("vc-look-core-ready") ||
          root.classList.contains("vc-page-cine-ready");
        /* bgGifWakeRemount1: max ~900ms (non-home soft-fx lento lasciava still troppo) */
        if (!readyOk && readyWaitMs < 900) {
          window.setTimeout(run, 80);
          return;
        }
      } catch (eReady) {}
      var want = isCoarsePointer() ? SITE_PHOTO_BG_MOBILE_GIF : SITE_PHOTO_BG_DESKTOP_GIF;
      try {
        var pre = new Image();
        pre.decoding = "async";
        var done = false;
        var finish = function () {
          if (done) return;
          done = true;
          armPhotoGif();
        };
        pre.onload = finish;
        pre.onerror = finish;
        pre.src = want;
        window.setTimeout(finish, 1600);
      } catch (ePre) {
        armPhotoGif();
      }
    }
    /* bootSpeedGate1: GIF 1.5MB SOLO dopo chrome-done (o 2.2s) — non in parallelo al sipario */
    function kickArm() {
      try {
        window.setTimeout(run, 80);
      } catch (eKick) {
        run();
      }
    }
    try {
      if (window.__vcChromeLoadDone) {
        window.setTimeout(kickArm, 400);
      } else {
        var armedOnce = false;
        var onChrome = function () {
          if (armedOnce) return;
          armedOnce = true;
          try {
            document.removeEventListener("vc:chrome-load-done", onChrome);
          } catch (eRm) {}
          kickArm();
        };
        document.addEventListener("vc:chrome-load-done", onChrome);
        window.setTimeout(onChrome, 2200);
      }
    } catch (eIdle) {
      window.setTimeout(kickArm, 2200);
    }
  }

  function isPerfPhotoStillMode() {
    /* bgGifForceRm1: still solo force flag / non ancora armed / no GIF cfg */
    if (forcePhotoStillFlag()) return true;
    if (!photoGifArmed) return true;
    try {
      if (
        SITE_PHOTO_BG_DESKTOP === SITE_PHOTO_BG_DESKTOP_STILL &&
        SITE_PHOTO_BG_MOBILE === SITE_PHOTO_BG_MOBILE_STILL
      ) {
        return true;
      }
    } catch (eStillCfg) {}
    var anim = "";
    try {
      anim = String(sitePhotoBgAnimSrcRaw ? sitePhotoBgAnimSrcRaw() : "") || "";
    } catch (eAnim) {}
    if (anim && anim.indexOf(".gif") === -1) return true;
    return false;
  }

  function sitePhotoBgAnimSrcRaw() {
    return isCoarsePointer() ? SITE_PHOTO_BG_MOBILE : SITE_PHOTO_BG_DESKTOP;
  }

  function sitePhotoBgAnimSrc() {
    if (isPerfPhotoStillMode() || document.hidden) {
      return isCoarsePointer() ? SITE_PHOTO_BG_MOBILE_STILL : SITE_PHOTO_BG_DESKTOP_STILL;
    }
    return isCoarsePointer() ? SITE_PHOTO_BG_MOBILE : SITE_PHOTO_BG_DESKTOP;
  }

  function prefersReducedMotion() {
    try {
      if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
    } catch (e) {}
    return false;
  }

  function gifShouldBePaused() {
    return Boolean(document.hidden) || isPerfPhotoStillMode();
  }

  function ensureSitePhotoLayer(stage) {
    if (!SITE_PHOTO_BG || !stage) return;
    var photo = stage.querySelector(".vc-home-cine__photo");
    if (!photo) {
      photo = document.createElement("img");
      photo.className = "vc-home-cine__photo";
      photo.alt = "";
      photo.setAttribute("aria-hidden", "true");
      photo.decoding = "async";
      photo.loading = "eager";
      photo.draggable = false;
      photo.fetchPriority = "low";
      stage.insertBefore(photo, stage.firstChild);
    }
    syncOneGifPhoto(photo);
    try {
      photo.style.removeProperty("display");
    } catch (eShow) {}
  }

  function isForbiddenStillSrc(src) {
    /* still-mode / idle-freeze: webp still ammessi */
    if (isPerfPhotoStillMode()) return false;
    var s = String(src || "").toLowerCase();
    return (
      s.indexOf("sfondo-still") !== -1 ||
      s.indexOf("sfondo-mobile-still") !== -1 ||
      s.indexOf("site-bg-libreria") !== -1 ||
      /\.webp(\?|$)/.test(s) ||
      /\.jpe?g(\?|$)/.test(s) ||
      /\.png(\?|$)/.test(s)
    );
  }

  function isConfessionaleRoute() {
    try {
      if (document.documentElement && document.documentElement.classList.contains("vc-confessionale-route")) {
        return true;
      }
    } catch (eR) {}
    try {
      if (document.body && document.body.classList.contains("vc-confessionale-page")) return true;
    } catch (eB) {}
    return false;
  }

  function isLockedCustomPhoto(photo) {
    try {
      if (!photo) return false;
      if (photo.getAttribute("data-vc-cine-photo-lock") === "1") return true;
      if (photo.dataset && photo.dataset.vcCinePhotoLock === "1") return true;
      if (isConfessionaleRoute()) {
        var src = String(photo.getAttribute("src") || "");
        if (/Confessionale-GF/i.test(src)) return true;
        /* confBgLockPersist1: su confessionale la foto stage è sempre custom */
        return true;
      }
    } catch (eLock) {}
    return false;
  }

  function syncOneGifPhoto(photo) {
    if (!photo) return;
    if (isLockedCustomPhoto(photo)) {
      try {
        /* confBgNoGifBlack1: se vc-perf/altro ha messo sfondo.gif, ripristina JPG */
        if (isConfessionaleRoute()) {
          var lockSrc = String(photo.getAttribute("src") || "");
          if (
            !lockSrc ||
            /sfondo/i.test(lockSrc) ||
            /\.gif(\?|$)/i.test(lockSrc) ||
            /\.webp(\?|$)/i.test(lockSrc) ||
            !/Confessionale-GF/i.test(lockSrc)
          ) {
            photo.setAttribute("src", CONFESSIONALE_PHOTO_SRC);
          }
          photo.setAttribute("data-vc-cine-photo-lock", "1");
        }
        photo.style.removeProperty("display");
        photo.style.removeProperty("visibility");
        photo.style.removeProperty("opacity");
      } catch (eShowLock) {}
      return;
    }
    var anim = sitePhotoBgAnimSrc();
    var hardHide = Boolean(document.hidden);
    var stillMode = isPerfPhotoStillMode();
    if (hardHide) {
      /* bgGifWakeRemount1: NON strippare src (rimontare al wake basta; strip+freeze = still forever) */
      try {
        photo.dataset.vcGifKick = "";
      } catch (ePause) {}
      return;
    }
    try {
      clearStuckPhotoPauseClasses();
      var prev = photo.getAttribute("src") || "";
      /* ticketsFrameLag1: se src già corretto non rimontare (scroll/input spam) */
      if (prev && prev === anim && (stillMode || prev.indexOf(".gif") === -1)) {
        photo.dataset.vcGifKick = stillMode ? "still" : photo.dataset.vcGifKick || "1";
        photo.style.removeProperty("display");
        photo.style.removeProperty("visibility");
        photo.style.removeProperty("opacity");
        return;
      }
      var mustFix = !prev || prev !== anim;
      if (!stillMode) {
        mustFix = mustFix || isForbiddenStillSrc(prev) || prev.indexOf(".gif") === -1;
      } else {
        /* still: niente kick GIF; homePerfIdle1: preferisci webp (no PNG 1.2MB) */
        mustFix =
          mustFix ||
          prev.indexOf(".gif") !== -1 ||
          /\.png(\?|$)/i.test(prev) ||
          (prev.indexOf("sfondo") !== -1 && prev.indexOf(".webp") === -1);
      }
      if (mustFix) {
        photo.setAttribute("src", anim);
        photo.dataset.vcGifKick = stillMode ? "still" : "1";
      } else if (!stillMode && photo.dataset.vcGifKick !== "1") {
        photo.removeAttribute("src");
        photo.setAttribute("src", anim);
        photo.dataset.vcGifKick = "1";
      }
      photo.style.removeProperty("display");
      photo.style.removeProperty("visibility");
      photo.style.removeProperty("opacity");
    } catch (eResume) {}
  }

  function syncGifDecodeForVisibility() {
    try {
      var hardHide = Boolean(document.hidden);
      document.documentElement.classList.toggle("vc-page-hidden", hardHide);
      /* pwaStillCpu1: pause CSS solo tab nascosta — still mode NON usa vc-gif-paused
         (quel class faceva display:none = “nasconde lo sfondo”)
         confBgLockPersist1: confessionale = JPG locked → mai gif-paused (sfondo spariva) */
      var pauseGif = hardHide && !isConfessionaleRoute();
      document.documentElement.classList.toggle("vc-gif-paused", pauseGif);
      if (!hardHide || isConfessionaleRoute()) {
        document.documentElement.classList.remove("vc-ui-gif-paused", "vc-pwa-bg-frozen", "vc-photo-idle");
      }
      if (isConfessionaleRoute()) {
        document.documentElement.classList.remove("vc-gif-paused");
      }
    } catch (eHide) {}
    /* violKillCue2: su hide solo class — no walk foto (era setTimeout Violation 100–160ms) */
    if (document.hidden) return;
    var photos = document.querySelectorAll(".vc-home-cine__photo");
    var i = 0;
    function stepPhoto() {
      if (i >= photos.length || document.hidden) return;
      try {
        syncOneGifPhoto(photos[i]);
      } catch (eOne) {}
      i += 1;
      if (i < photos.length) window.setTimeout(stepPhoto, 16);
    }
    if (photos.length) window.setTimeout(stepPhoto, 0);
  }

  function schedulePhotoIdleFreeze() {
    if (gifIdleTimer) {
      window.clearTimeout(gifIdleTimer);
      gifIdleTimer = 0;
    }
  }

  function notePhotoBgInput() {
    if (!SITE_PHOTO_BG) return;
    lastPhotoInputAt = Date.now();
    gifIdleFrozen = false;
    try {
      document.documentElement.classList.remove("vc-ui-gif-paused", "vc-pwa-bg-frozen", "vc-photo-idle");
    } catch (eThaw) {}
    /* ticketsFrameLag1: in still mode non risyncare a ogni input/scroll */
    if (isPerfPhotoStillMode()) return;
    /* bgGifRestore1: dopo input ripristina GIF se tab visible */
    if (!document.hidden) syncGifDecodeForVisibility();
  }

  function onGifScrollPause() {
    if (!SITE_PHOTO_BG) return;
    if (prefersReducedMotion() || document.hidden) return;
    if (isPerfPhotoStillMode()) return;
    notePhotoBgInput();
  }

  function ensureSitePhotoBg() {
    if (!SITE_PHOTO_BG) return;
    try {
      var root = document.documentElement;
      root.classList.add("vc-site-photo-bg", "vc-cine-static-bg", "vc-home-cine-live", "vc-home-motion-ready");
      if (!document.getElementById("vc-site-photo-bg-link")) {
        var link = document.createElement("link");
        link.id = "vc-site-photo-bg-link";
        link.rel = "stylesheet";
        link.href = "/css/vc-site-photo-bg.css?v=" + PHOTO_BG_VER;
        (document.head || root).appendChild(link);
      }
      var stages = document.querySelectorAll(".vc-home-cine");
      for (var si = 0; si < stages.length; si += 1) {
        ensureSitePhotoLayer(stages[si]);
      }
      var canvasNodes = document.querySelectorAll(".vc-home-cine__canvas");
      for (var ci = 0; ci < canvasNodes.length; ci += 1) {
        try {
          canvasNodes[ci].style.setProperty("display", "none", "important");
          canvasNodes[ci].style.setProperty("visibility", "hidden", "important");
          canvasNodes[ci].style.setProperty("opacity", "0", "important");
        } catch (eHideC) {}
      }
      syncGifDecodeForVisibility();
      /* pwaCpuKill2: PWA/force-still → mai armare GIF */
      if (!forcePhotoStillFlag()) scheduleArmPhotoGif();
    } catch (ePhoto) {}
  }
  ensureSitePhotoBg();
  /* fxStable1: late .vc-home-cine (inject/boot) → layer + re-arm/sync */
  try {
    if (!window.__vcPhotoStageMo && typeof MutationObserver === "function") {
      window.__vcPhotoStageMo = new MutationObserver(function (recs) {
        var hit = false;
        for (var i = 0; i < recs.length && !hit; i++) {
          var adds = recs[i].addedNodes || [];
          for (var j = 0; j < adds.length; j++) {
            var n = adds[j];
            if (!n || n.nodeType !== 1) continue;
            if (
              (n.classList && n.classList.contains("vc-home-cine")) ||
              (n.querySelector && n.querySelector(".vc-home-cine"))
            ) {
              hit = true;
              break;
            }
          }
        }
        if (!hit) return;
        try {
          ensureSitePhotoBg();
          if (photoGifArmed) syncGifDecodeForVisibility();
          else scheduleArmPhotoGif();
        } catch (eMoBg) {}
      });
      window.__vcPhotoStageMo.observe(document.documentElement, { childList: true, subtree: true });
    }
  } catch (eMoInit) {}
  if (!window.__vcPhotoGifAlwaysWired) {
    window.__vcPhotoGifAlwaysWired = true;
    document.addEventListener("visibilitychange", function () {
      /* pwaResumeLag1: hide = class + stamp; show = soft thaw (hard remount solo se serve) */
      try {
        var hardHide = Boolean(document.hidden);
        document.documentElement.classList.toggle("vc-page-hidden", hardHide);
        /* confBgLockPersist1: no gif-paused su confessionale */
        document.documentElement.classList.toggle(
          "vc-gif-paused",
          hardHide && !isConfessionaleRoute(),
        );
        if (isConfessionaleRoute()) {
          document.documentElement.classList.remove("vc-gif-paused");
        }
        if (hardHide) {
          if (!photoHiddenSinceAt) photoHiddenSinceAt = Date.now();
        }
      } catch (eStillVis) {}
      if (document.hidden) return;
      scheduleWakeRemount("visibility");
      window.setTimeout(function () {
        try {
          syncGifDecodeForVisibility();
          notePhotoBgInput();
        } catch (eVisDefer) {}
      }, 64);
    });
    window.addEventListener("pageshow", function () {
      if (document.hidden) return;
      scheduleWakeRemount("pageshow");
      window.setTimeout(function () {
        try {
          syncGifDecodeForVisibility();
          notePhotoBgInput();
        } catch (ePs) {}
      }, 64);
    });
    window.addEventListener("vc:cpu-wake", function () {
      scheduleWakeRemount("cpu-wake");
    });
    window.addEventListener("vc:soft-fx-ready", function () {
      /* soft-fx/cine-ready: solo soft (arm/sweep gestiscono stuck) */
      scheduleWakeRemount("soft-fx");
    });
    document.addEventListener("vc:page-cine-ready", function () {
      scheduleWakeRemount("cine-ready");
    });
    window.addEventListener("vc:pwa-bg-freeze", function () {
      /* gifNoIdleStill1: ignora freeze idle da vc-perf — solo tab hidden */
      if (document.hidden) {
        try {
          if (!photoHiddenSinceAt) photoHiddenSinceAt = Date.now();
        } catch (eHf) {}
        syncGifDecodeForVisibility();
      }
    });
    window.addEventListener("vc:pwa-bg-thaw", function () {
      gifIdleFrozen = false;
      try {
        document.documentElement.classList.remove("vc-ui-gif-paused", "vc-pwa-bg-frozen", "vc-photo-idle");
      } catch (eTh) {}
      scheduleWakeRemount("pwa-thaw");
      syncGifDecodeForVisibility();
    });
    window.addEventListener("scroll", onGifScrollPause, { passive: true, capture: true });
    ["pointerdown", "touchstart", "keydown", "wheel"].forEach(function (evt) {
      window.addEventListener(
        evt,
        function () {
          notePhotoBgInput();
        },
        { passive: true, capture: true },
      );
    });
    try {
      if (window.matchMedia) {
        var mq = window.matchMedia("(prefers-reduced-motion: reduce)");
        if (mq && mq.addEventListener) mq.addEventListener("change", syncGifDecodeForVisibility);
        else if (mq && mq.addListener) mq.addListener(syncGifDecodeForVisibility);
      }
    } catch (eMq) {}
    syncGifDecodeForVisibility();
    notePhotoBgInput();
    /* bgGifRestore1: watchdog — se qualcuno rimette still, ripristina GIF */
    /* cpuIdleHard1: una volta a boot + rare check (no interval 12s fisso) */
    if (!window.__vcGifNeverWebpWatch) {
      window.__vcGifNeverWebpWatch = 1;
      function gifSweep() {
        if (document.hidden) return;
        try {
          clearStuckPhotoPauseClasses();
        } catch (eClr) {}
        if (isPerfPhotoStillMode()) {
          /* pwaStillHard1: still forzato → NON armare GIF (prima remountava = 100% CPU) */
          if (forcePhotoStillFlag()) return;
          scheduleArmPhotoGif();
          return;
        }
        var photos = document.querySelectorAll(".vc-home-cine__photo");
        var needRemount = !photos.length;
        for (var wi = 0; wi < photos.length; wi += 1) {
          if (isLockedCustomPhoto(photos[wi])) continue;
          var src = photos[wi].getAttribute("src") || "";
          var cs = null;
          try {
            cs = window.getComputedStyle(photos[wi]);
          } catch (eCs) {}
          if (
            !src ||
            src.indexOf(".gif") === -1 ||
            src.indexOf("-still") !== -1 ||
            (cs && (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0"))
          ) {
            needRemount = true;
            break;
          }
        }
        if (needRemount) forceRemountSitePhotoGif("sweep");
      }
      gifSweep();
      window.setTimeout(gifSweep, 400);
      window.setTimeout(gifSweep, 1200);
      window.setTimeout(gifSweep, 2800);
      window.setTimeout(gifSweep, 6000);
    } else if (prefersReducedMotion()) {
      try {
        syncGifDecodeForVisibility();
      } catch (eStillBoot) {}
    }
    if (!window.__vcPerfStillPhotoWired) {
      window.__vcPerfStillPhotoWired = true;
      document.addEventListener("vc:perf-tier", function () {
        try {
          syncGifDecodeForVisibility();
        } catch (eTier) {}
      });
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureSitePhotoBg);
  } else {
    ensureSitePhotoBg();
  }

  function homeHasAnchor() {
    return String(location.hash || "").replace(/^#/, "").length > 0;
  }

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

  function forceScrollTop(hard) {
    try {
      /* scrollStayAll1: soft — non forzare top se già mid-page */
      if (!hard && pageScrollY() > 8) return;
      /* bootNoFooter1: hard snap anche se già in fondo (footer clamp al reveal) */
      window.scrollTo(0, 0);
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    } catch (eForce) {}
  }

  function snapScrollTopIfPristine() {
    if (homeHasAnchor()) return;
    if (pageScrollY() > 8) return;
    /* scrollYoYoKill1/Align2: non azzerare durante/dopo restore scroll */
    try {
      if (window.__vcPtrRestoreDone) return;
      if (
        Math.max(
          0,
          Number(window.__vcPtrRestoreTargetY || 0) || 0,
          Number(window.__vcPtrRestoreY || 0) || 0,
        ) >= 2
      ) {
        return;
      }
    } catch (eYo) {}
    /* scrollStayAll1: dopo curtain-off/ready non ri-azzerare su reflow (tab/lista/layout) */
    try {
      var root = document.documentElement;
      if (
        root.classList.contains("vc-cine-curtain-off") &&
        (root.classList.contains("vc-page-cine-ready") ||
          root.classList.contains("vc-styles-ready") ||
          root.classList.contains("vc-core-styles-ready"))
      ) {
        return;
      }
    } catch (eStay) {}
    forceScrollTop();
  }

  function resetHomeScroll(ev) {
    if (ev && ev.persisted) return;
    snapScrollTopIfPristine();
  }

  function isPolishPage() {
    return document.documentElement.classList.contains("vc-site-polish");
  }

  function isLiteFxPage() {
    var body = document.body;
    if (!body) return false;
    var lite =
      "vc-users-page vc-roles-page vc-reviews-page vc-vote-page vc-faq-page vc-wiki-page vc-suggestions-page vc-tickets-page vc-web-tickets-page vc-notifications-page vc-regole-page vc-donazioni-page vc-sponsor-page vc-perks-page vc-candidature-page vc-appelli-page vc-legal-page vc-dati-page vc-cookie-page vc-privacy-page vc-terms-page vc-copyright-page";
    var parts = lite.split(" ");
    for (var i = 0; i < parts.length; i += 1) {
      if (body.classList.contains(parts[i])) return true;
    }
    return false;
  }

  function useStaticCineBackground() {
    if (SITE_PHOTO_BG || window.__VC_SITE_PHOTO_BG) return true;
        if (prefersReduced() || isAuditBot()) return true;
    try {
      if (window.VcPerf && typeof window.VcPerf.isLite === "function" && window.VcPerf.isLite()) return true;
    } catch (eStat) {}
    if (isStandalonePwa() || isCoarse()) return true;
    if (isLiteFxPage() && !(document.body && document.body.classList.contains("vc-body--home"))) {
      try {
        if (window.VcPerf && typeof window.VcPerf.tier === "function" && window.VcPerf.tier() !== "full") {
          return true;
        }
      } catch (eLitePage) {}
    }
    return false;
  }

  function tiltSelectors() {
    var body = document.body;
    if (!body) return "";
    if (body.classList.contains("vc-body--home")) {
      return "#stats .vc-stat-strip, .vc-home-deck, .vc-home-feature, .vc-home-index";
    }
    if (!isPolishPage()) return "";
    return [
      "#vc-page-content .vc-wiki-cmd-shell",
      "#vc-page-content .vc-faq-group",
      "#vc-page-content .vc-reviews-formcard",
      "#vc-page-content .vc-reviews-card:not(.vc-reviews-stage__card)",
      "#vc-page-content .vc-perks-card",
      "#vc-page-content .vc-legal-card",
      "#vc-page-content .vc-sponsor-embed",
      "#vc-page-content .vc-sponsor-card",
      "#vc-page-content .vc-staff-block",
      "#vc-page-content .vc-staff-hub-card",
      "#vc-page-content .vc-candidature-card",
      "#vc-page-content .vc-unban-before-card",
      "#vc-page-content .vc-unmute-before-card",
      "#vc-page-content .vc-auth-required-card",
      "#vc-page-content .vc-support-donate-role",
      "#vc-page-content .vc-vote-live-card",
      "#vc-page-content .vc-regole-card",
      "#vc-page-content .vc-home-panel",
    ].join(", ");
  }

  function useLiteCanvas() {
    try {
      if (window.VcPerf && typeof window.VcPerf.isMidOrLite === "function" && window.VcPerf.isMidOrLite()) {
        return true;
      }
      if (window.VcPerf && typeof window.VcPerf.isLite === "function" && window.VcPerf.isLite()) return true;
    } catch (ePerf) {}
        if (isCoarse() || isStandalonePwa()) return true;
    return isLiteFxPage();
  }

  function isStandalonePwa() {
    try {
      if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true;
    } catch (e) {}
    try {
      if (window.matchMedia && window.matchMedia("(display-mode: fullscreen)").matches) return true;
    } catch (e2) {}
    return Boolean(navigator.standalone);
  }

  function prefersReduced() {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) {
      return false;
    }
  }

  function isAuditBot() {
    try {
      if (navigator.webdriver) return true;
      var ua = String(navigator.userAgent || "");
      return /Chrome-Lighthouse|Lighthouse|PTST|Google Page Speed/i.test(ua);
    } catch (e) {
      return false;
    }
  }

  function gpuQuietPaused() {
    try {
      var root = document.documentElement;
      return (
        document.hidden ||
        root.classList.contains("vc-cine-idle") ||
        root.classList.contains("vc-page-hidden") ||
        root.classList.contains("vc-cpu-settle")
      );
    } catch (eGpuQ) {
      return false;
    }
  }

  function wireGpuQuietPageHidden() {
    if (window.__vcGpuQuietHidden) return;
    window.__vcGpuQuietHidden = true;
    function syncPageHidden() {
      try {
        document.documentElement.classList.toggle("vc-page-hidden", document.hidden);
      } catch (eHide) {}
    }
    document.addEventListener("visibilitychange", syncPageHidden);
    syncPageHidden();
  }

  function retireLiveCanvasToStatic() {
    if (window.__vcCanvasRetiredStatic) return;
    window.__vcCanvasRetiredStatic = true;
    try {
      var root = document.documentElement;
      root.classList.add("vc-cine-static-bg");
      root.classList.remove("vc-home-cine-live");
    } catch (eRetire) {}
  }

  function reviveLiveCanvasFromStatic() {
    if (!window.__vcCanvasRetiredStatic) return;
    window.__vcCanvasRetiredStatic = false;
    try {
      var root = document.documentElement;
      root.classList.remove("vc-cine-static-bg");
      root.classList.add("vc-home-cine-live");
    } catch (eRevive) {}
  }

  function isCoarse() {
    try {
      if (window.matchMedia("(max-width: 639.98px)").matches) return true;
      if (window.matchMedia("(pointer: coarse)").matches) return true;
      if (
        window.matchMedia("(hover: none)").matches &&
        Number(navigator.maxTouchPoints || 0) > 0
      ) {
        return true;
      }
    } catch (e) {}
    try {
      return Number(navigator.maxTouchPoints || 0) > 0;
    } catch (e2) {
      return false;
    }
  }

    function shouldSnappyBodyFx() {
    /* cueKeep1: niente rise ritardato post-load (micro-reflow card/hero) */
    return true;
  }

  function primeMobileCineClasses() {
    try {
      var root = document.documentElement;
      var body = document.body;
      if (
        root &&
        (root.classList.contains("vc-site-polish") ||
          (body && (body.classList.contains("vc-body--home") || body.classList.contains("vc-page-cine-layout"))))
      ) {
        root.classList.add("vc-home-motion-ready");
      }
      if (!isCoarse() || !root) return;
      root.classList.add("vc-cine-static-bg", "vc-home-cine-live");
    } catch (ePrime) {}
  }

  function ensureCursorTrailScript() {
    /* cursorTrailOff1: scia rimossa — no-op */
  }

  function uiChromeBusy() {
    try {
      var r = document.documentElement;
      var b = document.body;
      if (!r || !r.classList) return false;
      if (
        r.classList.contains("vc-mobile-nav-open") ||
        r.classList.contains("vc-staff-stat-sheet-open") ||
        r.classList.contains("vc-staff-manage-sheet-open") ||
        r.classList.contains("vc-staff-reso-sheet-open") ||
        r.classList.contains("vc-staff-datepicker-open") ||
        r.classList.contains("vc-dialog-open") ||
        r.classList.contains("vc-dash-confirm-open") ||
        r.classList.contains("vc-notif-sheet-open") ||
        r.classList.contains("vc-notif-drawer-open") ||
        r.classList.contains("vc-reviews-modal-open") ||
        r.classList.contains("vc-feedback-sheet-open") ||
        r.classList.contains("vc-dash-cmds-modal-open")
      ) {
        return true;
      }
      if (
        b &&
        b.classList &&
        (b.classList.contains("vc-role-modal-open") ||
          b.classList.contains("vc-dash-cmds-modal-open") ||
          b.classList.contains("vc-dash-partnership-sheet-open") ||
          b.classList.contains("vc-wt-gate-open"))
      ) {
        return true;
      }
      return false;
    } catch (eBusy) {
      return false;
    }
  }

  window.__vcUiChromeBusy = uiChromeBusy;

  function ensureSpotlightLayer(stage) {
    if (!stage) return null;
    var spot = stage.querySelector(".vc-home-cine__spotlight");
    if (!spot) {
      spot = document.createElement("div");
      spot.className = "vc-home-cine__spotlight";
      spot.setAttribute("aria-hidden", "true");
      var veil = stage.querySelector(".vc-home-cine__veil");
      if (veil) stage.insertBefore(spot, veil);
      else stage.appendChild(spot);
    }
    return spot;
  }

  function ensureStage() {
    var existing = document.querySelector(".vc-home-cine");
    if (existing) {
      ensureSpotlightLayer(existing);
      ensureSitePhotoLayer(existing);
      return existing;
    }
    var stage = document.createElement("div");
    stage.className = "vc-home-cine";
    stage.setAttribute("aria-hidden", "true");
    stage.innerHTML =
      '<canvas class="vc-home-cine__canvas"></canvas>' +
      '<div class="vc-home-cine__spotlight"></div>' +
      '<div class="vc-home-cine__veil"></div>' +
      '<div class="vc-home-cine__grain"></div>';
    document.body.insertBefore(stage, document.body.firstChild);
    ensureSitePhotoLayer(stage);
    return stage;
  }

  function headerOffset() {
    var bar = document.querySelector(".vc-header-bar") || document.querySelector("header");
    var h = bar ? bar.getBoundingClientRect().height : 72;
    return Math.round(Math.max(64, h + 18));
  }

  function pageScrollTarget() {
    return (
      document.getElementById("vc-page-content") ||
      document.getElementById("stats") ||
      document.getElementById("scopri") ||
      document.getElementById("highlights")
    );
  }

  function scrollToPageContent(ev) {
    var target = pageScrollTarget();
    if (!target) return;
    if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
    var top = target.getBoundingClientRect().top + (window.pageYOffset || document.documentElement.scrollTop || 0) - headerOffset();
    if (top < 0) top = 0;
    window.scrollTo({
      top: top,
      behavior: prefersReduced() || isCoarse() ? "auto" : "smooth",
    });
  }

  function isStaffRoute() {
    var p = String(location.pathname || "/").replace(/\/+$/, "") || "/";
    return p === "/staff" || p.indexOf("/staff/") === 0;
  }

  function isEventoPage() {
    var p = String(location.pathname || "/").replace(/\/+$/, "") || "/";
    if (p === "/evento" || p.indexOf("/evento/") === 0) return true;
    return Boolean(document.body && document.body.classList.contains("vc-hw-page"));
  }

  function isStaffProfileHome() {
    var p = String(location.pathname || "/").replace(/\/+$/, "") || "/";
    if (p === "/staff") return true;
    return Boolean(document.body && document.body.classList.contains("vc-staff-profile-home"));
  }

    function isStaffInboxPage() {
    var p = String(location.pathname || "/").replace(/\/+$/, "") || "/";
    if (p === "/staff/inbox") return true;
    return Boolean(
      (document.body && document.body.classList.contains("vc-staff-inbox-page")) ||
        (document.documentElement && document.documentElement.classList.contains("vc-staff-inbox-route")),
    );
  }

    function isStaffVinylPage() {
    if (!isStaffRoute()) return false;
    if (isStaffProfileHome()) return true;
    if (isStaffInboxPage()) return true;
    var p = String(location.pathname || "/").replace(/\/+$/, "") || "/";
    if (
      p === "/staff/guida" ||
      p === "/staff/pause" ||
      p === "/staff/gestione" ||
      p === "/staff/organico" ||
      p === "/staff/punti-tolti" ||
      p === "/staff/ticket" ||
      p === "/staff/confessionale"
    ) {
      return true;
    }
    return Boolean(
      document.body &&
        (document.body.classList.contains("vc-staff-cine-page") ||
          document.body.classList.contains("vc-staff-manage-page") ||
          document.body.classList.contains("vc-staff-organico-page") ||
          document.body.classList.contains("vc-staff-guide-page") ||
          document.body.classList.contains("vc-staff-pause-page") ||
          document.body.classList.contains("vc-staff-punti-tolti-page")),
    );
  }

    function isStaffCinePage() {
    var p = String(location.pathname || "/").replace(/\/+$/, "") || "/";
        if (p === "/notifications" || (document.body && document.body.classList.contains("vc-notifications-page"))) {
      return false;
    }
    if (p === "/staff" || isStaffProfileHome()) return false;
    if (
      p === "/staff/guida" ||
      p === "/staff/pause" ||
      p === "/staff/gestione" ||
      p === "/staff/organico" ||
      p === "/staff/punti-tolti" ||
      p === "/staff/inbox" ||
      p === "/staff/ticket" ||
      p === "/staff/confessionale"
    ) {
      return true;
    }
    return Boolean(
      (document.body &&
        (document.body.classList.contains("vc-staff-cine-page") ||
          document.body.classList.contains("vc-staff-inbox-page") ||
          document.body.classList.contains("vc-staff-manage-page") ||
          document.body.classList.contains("vc-staff-organico-page") ||
          document.body.classList.contains("vc-staff-guide-page") ||
          document.body.classList.contains("vc-staff-pause-page") ||
          document.body.classList.contains("vc-staff-punti-tolti-page"))) ||
        (document.documentElement &&
          (document.documentElement.classList.contains("vc-staff-cine-route") ||
            document.documentElement.classList.contains("vc-staff-inbox-route"))),
    );
  }

    function isStaffInboxCinePage() {
    return isStaffCinePage();
  }

  function isBoardsViewPage() {
    try {
      var root = document.documentElement;
      /* boardsLoadHold1c: pending vale per tutta bacheca — NON trattarlo come scheda
         (altrimenti skipScrollCue nasconde lo cue su esplora/server/bot) */
      if (root && (root.classList.contains("vc-boards-scheda-ui") || root.classList.contains("vc-boards-detail-live"))) {
        return true;
      }
      var body = document.body;
      if (body) {
        var boardsPage = String(body.getAttribute("data-vc-boards-page") || "")
          .trim()
          .toLowerCase();
        if (boardsPage === "view") return true;
        if (body.classList.contains("vc-boards-scheda-ui") || body.classList.contains("vc-boards-detail-live")) {
          return true;
        }
      }
      var p = String(location.pathname || "");
      if (/\/(?:bacheca|boards)\/scheda(?:\/|$)/i.test(p)) return true;
      if (/\/(?:bacheca|boards)\/view(?:\/|$)/i.test(p)) return true;
      if (/\/(?:bacheca|boards)\/(?:server|servers|bot|bots)\/[^/]+/i.test(p)) return true;
    } catch (eView) {}
    return false;
  }

  function isUserProfileRoute() {
    try {
      var root = document.documentElement;
      if (root && root.classList.contains("vc-user-profile-route")) return true;
    } catch (eHtml) {}
    try {
      var body = document.body;
      if (
        body &&
        (body.classList.contains("vc-user-profile-route") ||
          body.classList.contains("vc-user-profile-page"))
      ) {
        return true;
      }
    } catch (eBody) {}
    try {
      var p = String((location && location.pathname) || "/")
        .replace(/\/index\.html$/i, "")
        .replace(/\/+$/, "") || "/";
      if (/^\/users?\/\d{17,20}$/.test(p)) return true;
      if (p === "/user" || p === "/users") {
        var q = new URLSearchParams((location && location.search) || "");
        var id = String(q.get("id") || q.get("userId") || q.get("uid") || "").trim();
        if (/^\d{17,20}$/.test(id)) return true;
      }
    } catch (ePath) {}
    try {
      var view = document.getElementById("vc-user-profile-view");
      if (view && view.getAttribute("hidden") == null && !view.hidden) return true;
    } catch (eView) {}
    return false;
  }

  function killScrollCueDom() {
    try {
      syncScrollCueAwayClass(true);
    } catch (eAway) {}
    var staleAll = document.querySelectorAll(".vc-home-scrollcue");
    for (var si = 0; si < staleAll.length; si++) {
      var el = staleAll[si];
      try {
        hardHideScrollCue(el);
      } catch (eHid) {}
      try {
        el.remove();
      } catch (eRm) {
        try {
          if (el.parentNode) el.parentNode.removeChild(el);
        } catch (eRm2) {}
      }
    }
  }

  function skipScrollCuePage() {
    if (isEventoPage()) return true;
    if (isUserProfileRoute()) return true;
    if (isStaffCinePage()) return false;
    if (isStaffRoute() && !isStaffCinePage()) return true;
    var body = document.body;
    if (!body) return false;
    /* boardsCineRestore1 + schedaBootCue1: no scroll-cue su scheda / senza cine */
    try {
      if (isBoardsViewPage()) return true;
      if (!body.classList.contains("vc-page-cine-layout") && !body.classList.contains("vc-body--home")) {
        return true;
      }
    } catch (eBoardsCue) {}
    if (body.classList.contains("vc-notifications-page")) return true;
    if (isStaffProfileHome() || body.classList.contains("vc-staff-profile-home")) return true;
    if (body.classList.contains("vc-user-profile-route") || body.classList.contains("vc-user-profile-page")) {
      return true;
    }
    if (body.classList.contains("vc-roles-page")) return false;
    if (
      body.classList.contains("vc-users-page") &&
      body.classList.contains("vc-page-cine-layout") &&
      !body.classList.contains("vc-user-profile-route") &&
      !isUserProfileRoute()
    ) {
      return false;
    }
    if (body.classList.contains("vc-users-page") && !body.classList.contains("vc-user-profile-route")) {
      return true;
    }
    return false;
  }

  function armScrollCueSkipWatch() {
    if (window.__vcScrollCueSkipWatch) return;
    window.__vcScrollCueSkipWatch = 1;
    function tick() {
      try {
        if (skipScrollCuePage()) killScrollCueDom();
      } catch (eTick) {}
    }
    tick();
    try {
      var mo = new MutationObserver(tick);
      if (document.documentElement) {
        mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      }
      if (document.body) {
        mo.observe(document.body, { attributes: true, attributeFilter: ["class"] });
      } else {
        document.addEventListener(
          "DOMContentLoaded",
          function () {
            try {
              if (document.body) mo.observe(document.body, { attributes: true, attributeFilter: ["class"] });
              tick();
            } catch (eBodyMo) {}
          },
          { once: true },
        );
      }
    } catch (eMo) {}
    /* jsWakeKill3: niente setInterval 200ms — MO + 3 setTimeout bastano */
    try {
      window.setTimeout(tick, 0);
      window.setTimeout(tick, 400);
      window.setTimeout(tick, 1600);
    } catch (eTo) {}
  }

  function pageLoadingOverlay() {
    var ids = ["vc-roles-loading", "vc-ul-loading"];
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      if (!el || el.hidden || el.getAttribute("hidden") != null) continue;
      try {
        if (el.classList && el.classList.contains("vc-staff-loading--hidden")) continue;
      } catch (eCls) {}
      /* violKillReflow2: niente getComputedStyle (Forced reflow) */
      return el;
    }
    return null;
  }

  var cueGeometryOkCached = false;
  function cueGeometryReady(hero) {
    /* violKillReflow2: cache / no offsetWidth sync */
    if (cueGeometryOkCached) return true;
    if (pageLoadingOverlay()) return false;
    if (!hero) {
      cueGeometryOkCached = true;
      return true;
    }
    try {
      if (document.documentElement.classList.contains("vc-page-cine-ready")) {
        cueGeometryOkCached = true;
        return true;
      }
    } catch (eGeo) {}
    return false;
  }

  function scrollCuePageY() {
    try {
      var se = document.scrollingElement;
      if (se && typeof se.scrollTop === "number" && se.scrollTop > 0) return se.scrollTop;
    } catch (eSe) {}
    return (
      window.pageYOffset ||
      (document.documentElement && document.documentElement.scrollTop) ||
      (document.body && document.body.scrollTop) ||
      0
    );
  }

  /* scrollCueOwner1: allinea a boot HIDE_PX=1; show solo via boot sync */
  var SCROLL_CUE_HIDE_PX = 1;
  /* loadCueBakeFast1: niente cue se non c’è abbastanza contenuto sotto */
  var SCROLL_CUE_MIN_OVERFLOW = 120;
  function bootOwnsScrollCue() {
    try {
      return Boolean(window.__vcScrollCueAwayBoot);
    } catch (eOwn) {
      return false;
    }
  }
  function deferCueToBoot() {
    try {
      if (typeof window.__vcScrollCueBootSync === "function") {
        window.__vcScrollCueBootSync();
        return;
      }
      if (typeof window.__vcSyncScrollCue === "function" && window.__vcSyncScrollCue !== syncScrollCueNow) {
        window.__vcSyncScrollCue();
      }
    } catch (eDef) {}
  }

  function scrollCueOpacityForY(y) {
    var yy = Number(y) || 0;
    return yy > SCROLL_CUE_HIDE_PX ? 0 : 1;
  }

  function pageHasScrollRoom() {
    try {
      var doc = document.documentElement;
      var vh = Math.max(1, window.innerHeight || doc.clientHeight || 1);
      var sh = Math.max(doc.scrollHeight || 0, (document.body && document.body.scrollHeight) || 0);
      return sh - vh >= SCROLL_CUE_MIN_OVERFLOW;
    } catch (eRoom) {
      return true;
    }
  }

  function scrollCueShouldHide(hero) {
    if (!pageHasScrollRoom()) return true;
    return scrollCuePageY() > SCROLL_CUE_HIDE_PX;
  }

  function scrollCueCineSettled() {
    try {
      var root = document.documentElement;
      var body = document.body;
      if (!root || !body) return false;
      if (root.classList.contains("vc-boards-view-pending")) return false;
      /* bootUiCueBar1: mai cue durante hold/loader/barra chrome */
      if (
        root.classList.contains("vc-interaction-hold") ||
        root.classList.contains("vc-loading-scroll-lock") ||
        root.classList.contains("vc-loader-blocking-live") ||
        root.classList.contains("vc-chrome-bar-loading") ||
        (root.classList.contains("vc-page-cine-boot") && !root.classList.contains("vc-page-cine-ready"))
      ) {
        return false;
      }
      /* soft-fx obbligatorio (motion-ready arriva troppo presto dal photo-bg prime) */
      if (
        root.classList.contains("vc-site-polish") &&
        !root.classList.contains("vc-soft-fx-ready") &&
        !root.classList.contains("vc-soft-fx-off")
      ) {
        return false;
      }
      if (
        root.classList.contains("vc-site-polish") &&
        !root.classList.contains("vc-cine-curtain-off") &&
        !root.classList.contains("vc-page-cine-ready") &&
        !body.classList.contains("vc-body--home")
      ) {
        return false;
      }
      if (body.classList.contains("vc-page-cine-layout")) {
        /* bootExtMatch1: page-cine-ready can land before nav-guard lifts main */
        if (!root.classList.contains("vc-page-cine-ready")) return false;
        if (
          !root.classList.contains("vc-core-styles-ready") &&
          !root.classList.contains("vc-home-styles-ready")
        ) {
          return false;
        }
        if (!root.classList.contains("vc-cine-curtain-off")) return false;
        return true;
      }
      if (body.classList.contains("vc-body--home")) {
        return (
          root.classList.contains("vc-soft-fx-ready") ||
          root.classList.contains("vc-soft-fx-off")
        );
      }
      return false;
    } catch (eSettled) {
      return false;
    }
  }

  function syncScrollCueAwayClass(away) {
    try {
      var root = document.documentElement;
      if (!root) return;
      if (away) root.classList.add("vc-scrollcue-away");
      else root.classList.remove("vc-scrollcue-away");
    } catch (eCls) {}
  }

  function hardHideScrollCue(cue) {
    if (!cue) return;
    /* cueHideSnap2: hardShow lascia display/opacity !important inline — CSS is-away perde */
    if (
      cue.classList.contains("is-away") &&
      cue.hidden &&
      String(cue.style.display || "").indexOf("none") !== -1
    )
      return;
    syncScrollCueAwayClass(true);
    cue.classList.add("is-away");
    cue.classList.remove("is-fading");
    cue.hidden = true;
    cue.setAttribute("aria-hidden", "true");
    try {
      cue.style.setProperty("display", "none", "important");
      cue.style.setProperty("opacity", "0", "important");
      cue.style.setProperty("visibility", "hidden", "important");
      cue.style.setProperty("pointer-events", "none", "important");
    } catch (eHid) {}
  }

  function applyScrollCueVisibility(cue, hero) {
    if (!cue) return;
    if (skipScrollCuePage()) {
      killScrollCueDom();
      return;
    }
    /* scrollCueNeverScroll1: pin su body PRIMA di qualunque show (fixed in hero trasformato = segue lo scroll) */
    if (cue.dataset.vcCuePinned !== "1" || (document.body && cue.parentElement !== document.body)) {
      try {
        pinScrollCueLayout(cue, hero);
      } catch (ePinVis) {}
    }
    if (
      !scrollCueCineSettled() ||
      !cueGeometryReady(hero) ||
      cue.dataset.vcCuePinned !== "1" ||
      (document.body && cue.parentElement !== document.body)
    ) {
      hardHideScrollCue(cue);
      return;
    }
    if (scrollCueShouldHide(hero) || !pageHasScrollRoom()) {
      hardHideScrollCue(cue);
      return;
    }
    /* scrollCueOwner1: boot è l’unico che può togliere vc-scrollcue-away / show */
    if (bootOwnsScrollCue()) {
      deferCueToBoot();
      return;
    }
    /* legacy (no boot): show pieno solo a y≈0 */
    syncScrollCueAwayClass(false);
    cue.classList.remove("is-away", "is-fading");
    cue.hidden = false;
    cue.setAttribute("aria-hidden", "false");
    try {
      cue.style.setProperty("display", "flex", "important");
      cue.style.setProperty("opacity", "1", "important");
      cue.style.setProperty("visibility", "visible", "important");
      cue.style.setProperty("pointer-events", "auto", "important");
      cue.style.setProperty("transition", "none", "important");
      cue.style.setProperty("position", "fixed", "important");
      cue.style.setProperty("transform", "none", "important");
    } catch (eShow) {}
  }

  function refreshScrollCue(cue, hero, target) {
    /* violKill6: se già pinned, solo visibility — niente restyle/layout */
    try {
      if (!(cue && cue.dataset && cue.dataset.vcCuePinned === "1")) {
        pinScrollCueLayout(cue, hero);
      }
    } catch (ePin) {
      pinScrollCueLayout(cue, hero);
    }
    applyScrollCueVisibility(cue, hero);
  }

  function bindCueLayoutWatch(cue, hero, target) {
    if (!cue || cue.dataset.vcCueWatch === "1") return;
    cue.dataset.vcCueWatch = "1";
    /* scrollCueOwner1: niente poke storm 0–2400ms / MO — boot syncHard è l’unico show */
    if (bootOwnsScrollCue()) {
      var bootPokeTimer = 0;
      function bootPoke() {
        /* violRafWheel1: fuori dal frame corrente (evita Violation rAF 90ms+) */
        if (bootPokeTimer) return;
        bootPokeTimer = window.setTimeout(function () {
          bootPokeTimer = 0;
          try {
            pinScrollCueLayout(cue, hero);
            deferCueToBoot();
          } catch (eBp) {}
        }, 0);
      }
      document.addEventListener("vc:chrome-visual-ready", bootPoke, { passive: true });
      document.addEventListener("vc:page-cine-ready", bootPoke, { passive: true });
      document.addEventListener("vc:soft-fx-ready", bootPoke, { passive: true });
      return;
    }
    var pokeTimer = 0;
    function poke() {
      /* violKillFinal1: un solo refresh via __vcLight — niente setTimeout(0) nest */
      if (pokeTimer) return;
      pokeTimer = 1;
      var go = function () {
        pokeTimer = 0;
        try {
          refreshScrollCue(cue, hero, target);
        } catch (ePoke) {}
      };
      if (typeof window.__vcLight === "function") window.__vcLight(go, 220);
      else window.setTimeout(go, 220);
    }
    var overlay = pageLoadingOverlay() || document.getElementById("vc-roles-loading") || document.getElementById("vc-ul-loading");
    if (overlay && typeof MutationObserver !== "undefined") {
      var mo = new MutationObserver(poke);
      mo.observe(overlay, { attributes: true, attributeFilter: ["hidden", "class", "style"] });
    }
    window.addEventListener("pageshow", function () {
      if (typeof window.__vcLight === "function") window.__vcLight(poke, 240);
      else window.setTimeout(poke, 240);
    });
    document.addEventListener("vc:roles-ready", poke);
    document.addEventListener("vc:page-content-ready", poke);
    document.addEventListener("vc:chrome-ready", poke);
    document.addEventListener("vc:soft-fx-ready", poke);
    document.addEventListener("vc:page-cine-ready", poke);
    document.addEventListener(
      "vc:chrome-visual-ready",
      function () {
        try {
          refreshScrollCue(cue, hero, target);
        } catch (eVisCue) {}
      },
      { passive: true },
    );
    try {
      [0, 200, 500].forEach(function (ms) {
        window.setTimeout(poke, ms);
      });
    } catch (eKick) {}
  }

  function pinScrollCueLayout(cue, hero) {
    if (!cue) return;
    try {
      /* violRafWheel1: già pinned su body → no style storm / reflow */
      if (
        cue.dataset.vcCuePinned === "1" &&
        document.body &&
        cue.parentElement === document.body &&
        cue.classList.contains("vc-home-scrollcue--vp")
      ) {
        return;
      }
      /* scrollCuePinHide2: SEMPRE body + fixed — mai hero (transform → segue lo scroll) */
      if (document.body && cue.parentElement !== document.body) {
        document.body.appendChild(cue);
      }
      cue.classList.add("vc-home-scrollcue--vp");
      cue.classList.remove("vc-home-scrollcue--dock");
      var cueBottom = "calc(0.2rem + env(safe-area-inset-bottom, 0px))";
      cue.style.setProperty("position", "fixed", "important");
      cue.style.setProperty("top", "auto", "important");
      cue.style.setProperty("left", "0", "important");
      cue.style.setProperty("right", "0", "important");
      cue.style.setProperty("bottom", cueBottom, "important");
      cue.style.setProperty("inset", "auto 0 " + cueBottom + " 0", "important");
      cue.style.setProperty("gap", "0.08rem", "important");
      cue.style.setProperty("padding-top", "0", "important");
      cue.style.setProperty("padding-bottom", "0", "important");
      cue.style.setProperty("margin-top", "0", "important");
      cue.style.setProperty("margin-bottom", "0", "important");
      cue.style.setProperty("margin-left", "auto", "important");
      cue.style.setProperty("margin-right", "auto", "important");
      cue.style.setProperty("width", "max-content", "important");
      cue.style.setProperty("max-width", "calc(100% - 2rem)", "important");
      cue.style.setProperty("transform", "none", "important");
      cue.style.setProperty("overflow", "visible", "important");
      cue.style.setProperty("z-index", "50", "important");
      cue.style.setProperty("will-change", "auto", "important");
      cue.style.setProperty("filter", "none", "important");
      cue.style.setProperty("-webkit-filter", "none", "important");
      cue.dataset.vcCuePinned = "1";
    } catch (ePinCue) {}
  }

  function ensureScrollCueFor(hero, container) {
    if (!hero) return;
    armScrollCueSkipWatch();
    if (skipScrollCuePage()) {
      killScrollCueDom();
      return;
    }
    container = container || hero.closest("main") || document.querySelector("main");
    var target = document.getElementById("vc-page-content");
    if (!target && container) {
      var sib = hero.nextElementSibling;
      while (sib) {
        if (!sib.hidden && sib.getAttribute("hidden") == null && sib.id !== "vc-page-intro") {
          target = sib;
          break;
        }
        sib = sib.nextElementSibling;
      }
    }
    if (!target) target = pageScrollTarget();
    if (!target) return;
    if (!target.id) target.id = "vc-page-content";
    /* voteCuePhoneStable1 + scrollCueNoLag1: cue SOLO su body (fixed viewport) */
    var cue =
      document.body.querySelector(":scope > .vc-home-scrollcue") ||
      hero.querySelector(".vc-home-scrollcue") ||
      document.querySelector(".vc-home-scrollcue");
    if (!cue) {
      cue = document.createElement("a");
      cue.className = "vc-home-scrollcue vc-home-scrollcue--vp is-away";
      cue.hidden = true;
      cue.setAttribute("aria-hidden", "true");
      cue.setAttribute("aria-label", "Scorri per continuare a leggere");
      cue.innerHTML =
        '<span class="vc-home-scrollcue__label">Scorri per continuare</span>' +
        '<span class="vc-home-scrollcue__chev" aria-hidden="true"><span></span><span></span></span>';
      try {
        cue.style.setProperty("display", "none", "important");
        cue.style.setProperty("position", "fixed", "important");
      } catch (eNewCue) {}
      if (document.body) document.body.appendChild(cue);
    }
    /* kill duplicati (hero + body) che facevano “seguire” lo scroll */
    try {
      var allCues = document.querySelectorAll(".vc-home-scrollcue");
      for (var di = 0; di < allCues.length; di++) {
        if (allCues[di] !== cue) allCues[di].remove();
      }
    } catch (eDup) {}
    if (cue.parentElement !== document.body) {
      document.body.appendChild(cue);
    }
    cue.classList.add("vc-home-scrollcue--vp");
    cue.classList.remove("vc-home-scrollcue--dock");
    pinScrollCueLayout(cue, hero);
    cue.setAttribute("href", "#" + target.id);
    if (cue.dataset.vcScrollCue !== "1") {
      cue.dataset.vcScrollCue = "1";
      cue.addEventListener("click", scrollToPageContent);
    }
    startCueBounce(cue);
    /* scrollCuePinHide2: hide su Y reale; wheel down = hide; MAI re-show mid-wheel */
    var cueScrollRaf = 0;
    var cueLastHideAt = 0;
    function liveCueY() {
      try {
        var live = Math.max(0, Math.round(Number(window.pageYOffset) || scrollCuePageY() || 0));
        try {
          window.__vcCachedScrollY = live;
        } catch (eCy) {}
        return live;
      } catch (eY) {
        return scrollCuePageY();
      }
    }
    function onScrollVis() {
      if (cueScrollRaf) return;
      cueScrollRaf = 1;
      var go = function () {
        cueScrollRaf = 0;
        try {
          if (skipScrollCuePage()) {
            killScrollCueDom();
            return;
          }
          var y = liveCueY();
          if (y > SCROLL_CUE_HIDE_PX) {
            cueLastHideAt = Date.now();
            hardHideScrollCue(cue);
            return;
          }
          if (bootOwnsScrollCue()) {
            deferCueToBoot();
            return;
          }
          /* grace: dopo hide mid-scroll non riapparire per ~280ms (evita flicker / follow) */
          if (Date.now() - cueLastHideAt < 280) {
            hardHideScrollCue(cue);
            return;
          }
          applyScrollCueVisibility(cue, hero);
        } catch (eVisRaf) {}
      };
      window.setTimeout(go, 0);
    }
    function onResizePin() {
      cueScrollRaf = 0;
      pinScrollCueLayout(cue, hero);
      if (bootOwnsScrollCue()) {
        deferCueToBoot();
        return;
      }
      applyScrollCueVisibility(cue, hero);
    }
    bindCueLayoutWatch(cue, hero, target);
    if (cue.dataset.vcScrollCueScroll !== "1") {
      cue.dataset.vcScrollCueScroll = "1";
      window.addEventListener("scroll", onScrollVis, { passive: true, capture: true });
      window.addEventListener(
        "wheel",
        function (e) {
          try {
            /* violRafWheel1: zero layout su wheel — solo hide snappy */
            if (
              cue.classList.contains("is-away") &&
              cue.hidden &&
              String(cue.style.display || "").indexOf("none") !== -1
            ) {
              return;
            }
            var dy = Number(e && e.deltaY) || 0;
            var y = 0;
            try {
              y = Math.max(0, Math.round(Number(window.__vcCachedScrollY) || Number(window.pageYOffset) || 0));
            } catch (eY) {
              y = 0;
            }
            /* solo verso il basso o già scrolled — rotella in alto a Y≈0 non spegne */
            if (dy > 0 || y > SCROLL_CUE_HIDE_PX) {
              cueLastHideAt = Date.now();
              hardHideScrollCue(cue);
            }
          } catch (eWh) {}
        },
        { passive: true, capture: true },
      );
      window.addEventListener(
        "touchmove",
        function () {
          try {
            if (
              cue.classList.contains("is-away") &&
              cue.hidden &&
              String(cue.style.display || "").indexOf("none") !== -1
            ) {
              return;
            }
            var y = 0;
            try {
              y = Math.max(0, Math.round(Number(window.__vcCachedScrollY) || Number(window.pageYOffset) || 0));
            } catch (eY2) {
              y = 0;
            }
            if (y > SCROLL_CUE_HIDE_PX) {
              cueLastHideAt = Date.now();
              hardHideScrollCue(cue);
            }
          } catch (eTm) {}
        },
        { passive: true, capture: true },
      );
      window.addEventListener("resize", onResizePin, { passive: true });
      window.addEventListener("orientationchange", onResizePin, { passive: true });
      document.addEventListener(
        "vc:page-cine-ready",
        function () {
          /* violKillRest1: onResizePin layout-heavy — fuori dallo stack event */
          var go = function () {
            try {
              onResizePin();
            } catch (ePin) {}
          };
          if (typeof window.__vcLight === "function") window.__vcLight(go, 120);
          else window.setTimeout(go, 120);
        },
        { passive: true },
      );
      if (typeof window.__vcLight === "function") window.__vcLight(onResizePin, 80);
      else window.setTimeout(onResizePin, 80);
    } else {
      onResizePin();
    }
    try {
      if (typeof window.__vcForceScrollCueUnify === "function") window.__vcForceScrollCueUnify();
    } catch (eUniOnce) {}
  }

  function ensureScrollCue() {
    ensureScrollCueFor(document.getElementById("intro"));
  }

  function syncScrollCueNow() {
    try {
      armScrollCueSkipWatch();
      if (skipScrollCuePage()) {
        killScrollCueDom();
        return;
      }
      var hero =
        document.querySelector(".vc-page-cine-hero") ||
        document.querySelector(".vc-home-cine-hero") ||
        document.getElementById("intro");
      var cue =
        (document.body && document.body.querySelector(":scope > .vc-home-scrollcue")) ||
        document.querySelector(".vc-home-scrollcue");
      if (!cue && hero) {
        ensureScrollCueFor(hero);
        cue =
          (document.body && document.body.querySelector(":scope > .vc-home-scrollcue")) ||
          document.querySelector(".vc-home-scrollcue");
      }
      if (cue) {
        if (bootOwnsScrollCue()) {
          pinScrollCueLayout(cue, hero);
          deferCueToBoot();
        } else {
          refreshScrollCue(cue, hero, document.getElementById("vc-page-content"));
        }
      }
    } catch (eSyncCue) {}
  }
  /* scrollCueOwner1: non sovrascrivere il sync del boot */
  if (!bootOwnsScrollCue()) {
    window.__vcSyncScrollCue = syncScrollCueNow;
  }

  function isSeratafilmRoute() {
    try {
      if (document.body && document.body.classList.contains("vc-seratafilm-page")) return true;
    } catch (eB) {}
    var p = String(location.pathname || "/").replace(/\/+$/, "") || "/";
    return p === "/seratafilm" || p.indexOf("/seratafilm/") === 0;
  }

  function excludedPolishPath() {
    if (isStaffRoute() && !isStaffCinePage()) return true;
    if (isSeratafilmRoute()) return true;
    var p = String(location.pathname || "/").replace(/\/+$/, "") || "/";
    if (p === "/") return true;
    if (p === "/dashboard" || p.indexOf("/dashboard/") === 0) return true;
    return false;
  }

  function isUserProfileRoute() {
    /* organicoPexNotifCine1: ?userId= su /staff/organico NON è profilo —
       altrimenti shouldSkipPageCineHeroLayout spegne il layout cine. */
    if (isStaffRoute()) return false;
    var p = String(location.pathname || "").replace(/\/+$/, "");
    if (/^\/users?\/\d{17,20}$/.test(p)) return true;
    try {
      var q = new URLSearchParams(location.search || "");
      var id = String(q.get("id") || q.get("userId") || q.get("uid") || "").trim();
      if (/^\d{17,20}$/.test(id)) {
        /* solo entry punti profilo/users, non pagine cine staff/wiki/ecc. */
        if (
          p === "" ||
          p === "/" ||
          /^\/users?(\/|$)/.test(p) ||
          /^\/user(\/|$)/.test(p) ||
          (document.documentElement &&
            document.documentElement.classList.contains("vc-user-profile-pending"))
        ) {
          return true;
        }
      }
    } catch (e) {}
    return Boolean(document.documentElement && document.documentElement.classList.contains("vc-user-profile-pending"));
  }

  function shouldSkipPageCineHeroLayout() {
        if (isSeratafilmRoute()) return true;
        if (isEventoPage()) return true;
        var body = document.body;
    if (body && body.classList.contains("vc-notifications-page")) return true;
    var path = String(location.pathname || "").replace(/\/+$/, "") || "/";
    if (path === "/notifications") return true;
        if (isStaffRoute() && !isStaffCinePage()) return true;
    if (isUserProfileRoute()) return true;
    /* persCineLayout2: /personalizza ha hero cine baked — non spegnere layout */
    return false;
  }

  function isUsersCommunityPage() {
    return !shouldSkipPageCineHeroLayout() && Boolean(document.body && document.body.classList.contains("vc-users-page"));
  }

  function isCommunityLeaderReady() {
    var root = document.documentElement;
    if (!root) return true;
    if (root.classList.contains("vc-user-leader-pending")) return false;
    if (root.classList.contains("vc-user-profile-pending")) return false;
    var loader = document.getElementById("vc-ul-loading");
    if (loader && !loader.hidden) return false;
    return true;
  }

  function whenCommunityLeaderReady(fn) {
    if (typeof fn !== "function") return;
    if (!isUsersCommunityPage()) {
      fn();
      return;
    }
    if (isCommunityLeaderReady()) {
      fn();
      return;
    }
    var done = false;
    function run() {
      if (done || !isCommunityLeaderReady()) return;
      done = true;
      try {
        obs.disconnect();
      } catch (eObs) {}
      try {
        if (loaderObs) loaderObs.disconnect();
      } catch (eLoaderObs) {}
      fn();
    }
    var obs = new MutationObserver(run);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    var loader = document.getElementById("vc-ul-loading");
    var loaderObs = null;
    if (loader) {
      loaderObs = new MutationObserver(run);
      loaderObs.observe(loader, { attributes: true, attributeFilter: ["hidden"] });
    }
    run();
        window.setTimeout(function () {
      if (done) return;
      done = true;
      try {
        obs.disconnect();
      } catch (eObsT) {}
      try {
        if (loaderObs) loaderObs.disconnect();
      } catch (eLoaderObsT) {}
      fn();
    }, 4500);
  }

  /* stackFix2: markPageCineReady ↔ initPageHeroLayout sync recursion when no
     recognized hero (legal/status/cookie). Guard depth + skip-layout flag. */
  var markPageCineReadyDepth = 0;
  function markPageCineReady(immediate) {
    /* schedaBootCue1: tieni sipario finché la scheda non ha contenuto reale */
    try {
      var rootHold = document.documentElement;
      var boardsHold =
        rootHold &&
        rootHold.classList.contains("vc-boards-view-pending") &&
        !window.__vcBoardsContentReady;
      if (boardsHold) {
        if (!window.__vcBoardsViewReadyBound) {
          window.__vcBoardsViewReadyBound = 1;
          document.addEventListener(
            "vc:boards-content-ready",
            function () {
              try {
                rootHold.classList.remove("vc-boards-view-pending");
              } catch (eClr) {}
              markPageCineReady(true);
            },
            { once: true },
          );
          window.setTimeout(function () {
            if (window.__vcBoardsContentReady) return;
            try {
              rootHold.classList.remove("vc-boards-view-pending");
            } catch (eFs) {}
            markPageCineReady(true);
          }, 2800);
        }
        return;
      }
    } catch (eBoardsHold) {}
            if (
      !immediate &&
      isStaffCinePage() &&
      document.documentElement &&
      !document.documentElement.classList.contains("vc-home-cine-live")
    ) {
      if (!window.__vcStaffCineReadyFailsafe) {
        window.__vcStaffCineReadyFailsafe = window.setTimeout(function () {
                    try {
            bootStaffCineLayout(true);
          } catch (eFsLayout) {}
                              markPageCineReady(true);
        }, 320);
      }
      return;
    }
    if (window.__vcStaffCineReadyFailsafe) {
      window.clearTimeout(window.__vcStaffCineReadyFailsafe);
      window.__vcStaffCineReadyFailsafe = 0;
    }

    function polishLayoutPending() {
      try {
        if (!isPolishPage()) return false;
        var body = document.body;
        if (!body || body.classList.contains("vc-body--home")) return false;
        if (shouldSkipPageCineHeroLayout()) return false;
        if (isStaffProfileHome() || isEventoPage() || isSeratafilmRoute()) return false;
        if (excludedPolishPath()) return false;
        if (isStaffCinePage()) return false;
        if (body.classList.contains("vc-page-cine-layout")) return false;
        var lay = String(body.dataset.vcPageCineLayout || "");
        if (lay === "1" || lay === "skip") return false;
        return true;
      } catch (ePend) {
        return false;
      }
    }

    function markLayoutSkipped() {
      try {
        if (document.body && !document.body.classList.contains("vc-page-cine-layout")) {
          document.body.dataset.vcPageCineLayout = "skip";
        }
      } catch (eSkip) {}
    }

    function apply() {
      var root = document.documentElement;
      if (!root) return;
      if (polishLayoutPending()) {
        /* nested call from initPageHeroLayout early-exit: do not re-enter layout */
        if (markPageCineReadyDepth <= 1) {
          try {
            initPageHeroLayout({ force: true });
          } catch (eLayReady) {}
        }
        if (polishLayoutPending()) {
          /* no recognized hero / layout impossible — stop pending without recurse */
          markLayoutSkipped();
        }
      }
      try {
        window.__vcCineLayoutReadyRetry = 0;
      } catch (eClr) {}
      root.classList.add("vc-page-cine-ready");
      root.classList.remove("vc-page-cine-boot");
      try {
        initPageBodyCascade();
      } catch (eCascade) {}
      try {
        if (document.body && !document.body.classList.contains("vc-body--home")) {
          bindInnerHeroScrollFx();
        }
      } catch (eHeroFx) {}
      /* bootHeroNavLeak1: hero già layout → sblocca intro (niente kicker sotto navbar) */
      try {
        if (
          isUsersCommunityPage() ||
          (root &&
            (root.classList.contains("vc-user-leader-route") ||
              root.classList.contains("vc-user-leader-pending")))
        ) {
          root.classList.add("vc-cine-hero-placed");
        }
      } catch (ePlaced) {}
      try {
        document.dispatchEvent(new Event("vc:page-cine-ready"));
      } catch (eReadyEvt) {}
    }
    markPageCineReadyDepth += 1;
    try {
      if (immediate) {
        apply();
        return;
      }
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          markPageCineReadyDepth += 1;
          try {
            apply();
          } finally {
            markPageCineReadyDepth -= 1;
          }
        });
      });
    } finally {
      markPageCineReadyDepth -= 1;
    }
  }

  function resetStaffPageCineLayout() {
    if (!isStaffRoute()) return;
    var body = document.body;
    if (body) {
      body.classList.remove("vc-page-cine-layout");
      try {
        delete body.dataset.vcPageCineLayout;
      } catch (eData) {}
    }
    var cues = document.querySelectorAll(".vc-home-scrollcue");
    for (var c = 0; c < cues.length; c++) {
      try {
        cues[c].remove();
      } catch (eCue) {}
    }
    var heroes = document.querySelectorAll(".vc-staff-hero, .vc-page-cine-hero, .vc-support-page-hero");
    for (var i = 0; i < heroes.length; i++) {
      heroes[i].classList.remove("vc-page-cine-hero", "vc-home-cine-hero", "is-collapsed", "vc-hero-scroll-clip");
      try {
        heroes[i].style.removeProperty("min-height");
        heroes[i].style.removeProperty("height");
        heroes[i].style.removeProperty("justify-content");
      } catch (eHeroStyle) {}
    }
    var mains = document.querySelectorAll("main.vc-page-cine-main");
    for (var m = 0; m < mains.length; m++) {
      mains[m].classList.remove("vc-page-cine-main");
    }
        if (!isStaffCinePage() && !isStaffVinylPage()) {
      var stage = document.querySelector(".vc-home-cine");
      if (stage) {
        try {
          stage.remove();
        } catch (eStage) {}
      }
    }
    markPageCineReady(true);
  }

  function resetUsersPageCineLayout() {
    if (!shouldSkipPageCineHeroLayout()) return;
    var body = document.body;
    var root = document.documentElement;
    if (body) {
      body.classList.remove("vc-page-cine-layout");
      try {
        delete body.dataset.vcPageCineLayout;
      } catch (eData) {}
    }
    if (root) {
      var stillPending =
        root.classList.contains("vc-rank-customize-pending") ||
        root.classList.contains("vc-custom-profile-pending") ||
        root.classList.contains("vc-user-profile-pending");
      if (!stillPending) {
        var alreadyReady = root.classList.contains("vc-page-cine-ready");
        root.classList.add("vc-page-cine-ready");
        root.classList.remove("vc-page-cine-boot");
                        if (!alreadyReady) {
          try {
            document.dispatchEvent(new Event("vc:page-cine-ready"));
          } catch (eReadyEvt) {}
        }
      }
    }
    var heroes = document.querySelectorAll(".vc-page-cine-hero");
    for (var i = 0; i < heroes.length; i++) {
      heroes[i].classList.remove("vc-page-cine-hero", "vc-home-cine-hero");
    }
    var mains = document.querySelectorAll("main.vc-page-cine-main");
    for (var m = 0; m < mains.length; m++) {
      mains[m].classList.remove("vc-page-cine-main");
    }
  }

  function isVisibleEl(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.hidden || el.hasAttribute("hidden")) return false;
    if (el.closest && el.closest("[hidden]")) return false;
    if (el.dataset && el.dataset.vcPageHero === "off") return false;
    return true;
  }

  function isHeroEl(el) {
    if (!el || !el.classList) return false;
    if (el.classList.contains("vc-user-profile-hero")) return false;
        if (el.classList.contains("vc-notify-hero") && document.body && document.body.classList.contains("vc-notifications-page")) {
      return false;
    }
    return (
      el.classList.contains("vc-support-page-hero") ||
      el.classList.contains("vc-notify-hero") ||
      el.classList.contains("vc-staff-hero") ||
      el.classList.contains("vc-vote-page-hero") ||
      el.classList.contains("vc-legal-hero")
    );
  }

  function findPageHero(container) {
    if (!container || container.dataset.vcPageHero === "off") return null;
    if (shouldSkipPageCineHeroLayout()) return null;
    var roots = [container];
    for (var r = 0; r < roots.length; r++) {
      var root = roots[r];
      var kids = root.children;
      for (var i = 0; i < kids.length; i++) {
        var el = kids[i];
        if (!isVisibleEl(el)) continue;
        if (isHeroEl(el)) return el;
        if (el.tagName === "DIV" || el.tagName === "SECTION") {
          for (var j = 0; j < el.children.length; j++) {
            var child = el.children[j];
            if (isVisibleEl(child) && isHeroEl(child)) return child;
          }
        }
      }
    }
    return null;
  }

  function restructurePageMain(container, hero) {
    var contentWrap = document.getElementById("vc-page-content");
    if (!contentWrap) {
      contentWrap = document.createElement("div");
      contentWrap.id = "vc-page-content";
      contentWrap.className = "vc-page-cine-body mx-auto max-w-6xl px-4 pb-24";
    }

    if (container && container.tagName === "MAIN") {
      container.classList.remove("pt-28", "sm:pt-32", "pt-24", "sm:pt-28", "mx-auto", "max-w-6xl", "px-4");
      container.classList.add("vc-page-cine-main");
    }

    var parent = hero.parentElement;
    if (container && parent !== container) {
      container.insertBefore(hero, parent);
      if (parent.isConnected) {
        while (parent.firstChild) contentWrap.appendChild(parent.firstChild);
        try {
          parent.remove();
        } catch (eRemove) {}
      }
    }

    var sib = hero.nextElementSibling;
    while (sib) {
      var next = sib.nextElementSibling;
      if (
        sib !== contentWrap &&
        sib.id !== "vc-page-content" &&
        sib.id !== "vc-notif-scope-dock" &&
        !(sib.classList && sib.classList.contains("vc-notif-scope-dock"))
      ) {
        contentWrap.appendChild(sib);
      }
      sib = next;
    }

    if (contentWrap.childNodes.length && contentWrap.parentElement !== container) {
      container.appendChild(contentWrap);
    }

    return contentWrap;
  }

  function findHeroPanel(hero) {
    if (!hero) return null;
    return (
      hero.querySelector(":scope > .vc-page-cine-hero-panel") ||
      hero.querySelector(":scope > .grid") ||
      hero.querySelector(":scope > .vc-vote-page-hero__inner") ||
      hero.querySelector(":scope > .vc-sponsor-hero-layout")
    );
  }

  function findHeroCopyRoot(panel) {
    if (!panel) return null;
    return (
      panel.querySelector(".vc-page-cine-hero-copy") ||
      panel.querySelector(".vc-sponsor-hero-copy") ||
      panel.querySelector(".max-w-3xl") ||
      panel.firstElementChild
    );
  }

  function flushSponsorAsideToContent(contentWrap) {
    /* sponsorAsideBelow1: tip/requisiti SOTTO la card SOLO su sponsor */
    try {
      if (!document.body || !document.body.classList.contains("vc-sponsor-page")) return;
      var target = contentWrap || document.getElementById("vc-page-content");
      if (!target) return;
      var deferred = document.getElementById("vc-sponsor-aside-deferred");
      if (deferred) {
        deferred.removeAttribute("id");
        deferred.hidden = false;
        deferred.removeAttribute("hidden");
        deferred.className = "vc-page-cine-aside-below";
        if (deferred.parentNode !== target) {
          target.insertBefore(deferred, target.firstChild);
        }
      }
      var below = document.querySelector(".vc-sponsor-intro-below");
      if (below) {
        var wrap = below.querySelector(".vc-page-cine-aside-inline, .vc-page-cine-aside-below") || below.firstElementChild;
        if (wrap) {
          if (!wrap.classList.contains("vc-page-cine-aside-below") && !wrap.classList.contains("vc-page-cine-aside-inline")) {
            var box = document.createElement("div");
            box.className = "vc-page-cine-aside-below";
            while (below.firstChild) box.appendChild(below.firstChild);
            wrap = box;
          } else {
            wrap.classList.remove("vc-page-cine-aside-inline");
            wrap.classList.add("vc-page-cine-aside-below");
            if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
          }
          target.insertBefore(wrap, target.firstChild);
        }
        if (below.parentNode) below.parentNode.removeChild(below);
      }
      var head = document.querySelector(".vc-page-cine-hero .vc-hero-head");
      if (head) {
        var nested = head.querySelectorAll(".vc-page-cine-aside-inline, .vc-sponsor-embed");
        for (var i = 0; i < nested.length; i += 1) {
          var n = nested[i];
          if (n.classList.contains("vc-sponsor-embed") && !n.closest(".vc-page-cine-aside-below")) {
            var shell = document.createElement("div");
            shell.className = "vc-page-cine-aside-below";
            shell.appendChild(n);
            target.insertBefore(shell, target.firstChild);
          } else if (n.classList.contains("vc-page-cine-aside-inline")) {
            n.classList.remove("vc-page-cine-aside-inline");
            n.classList.add("vc-page-cine-aside-below");
            target.insertBefore(n, target.firstChild);
          }
        }
        head.classList.remove("vc-hero-head--has-aside");
      }
    } catch (eSp) {}
  }

  function flushWikiAsideToContent(contentWrap) {
    /* tip wiki/faq/… DENTRO la hero card; recupera anche leftovers classati aside-below */
    try {
      if (
        document.body &&
        (document.body.classList.contains("vc-roles-page") ||
          document.body.classList.contains("vc-candidature-page"))
      ) {
        return;
      }
      var head =
        document.querySelector(".vc-page-cine-hero .vc-hero-head") ||
        document.querySelector(".vc-hero-head");
      if (!head) return;
      if (document.body && document.body.classList.contains("vc-sponsor-page")) return;
      var deferred = document.getElementById("vc-wiki-aside-deferred");
      if (deferred) {
        deferred.removeAttribute("id");
        deferred.hidden = false;
        deferred.removeAttribute("hidden");
        deferred.className = "vc-page-cine-aside-inline";
        head.appendChild(deferred);
        head.classList.add("vc-hero-head--has-aside");
      }
      var belowNodes = document.querySelectorAll(
        ".vc-wiki-tips-below, #vc-page-content > .vc-page-cine-aside-below, .vc-page-cine-aside-below"
      );
      for (var b = 0; b < belowNodes.length; b += 1) {
        var below = belowNodes[b];
        if (!below || !below.isConnected) continue;
        if (below.closest && below.closest(".vc-sponsor-page")) continue;
        var wrap =
          below.querySelector(".vc-page-cine-aside-inline, .vc-page-cine-aside-below, .vc-wiki-tips-grid") ||
          (below.classList.contains("vc-page-cine-aside-below") ? below : below.firstElementChild);
        if (!wrap) continue;
        if (wrap === below) {
          wrap.classList.remove("vc-page-cine-aside-below");
          wrap.classList.add("vc-page-cine-aside-inline");
          head.appendChild(wrap);
          head.classList.add("vc-hero-head--has-aside");
          continue;
        }
        if (!wrap.classList.contains("vc-page-cine-aside-inline")) {
          var box = document.createElement("div");
          box.className = "vc-page-cine-aside-inline";
          while (below.firstChild) box.appendChild(below.firstChild);
          wrap = box;
        } else if (wrap.parentNode) {
          wrap.parentNode.removeChild(wrap);
        }
        wrap.classList.remove("vc-page-cine-aside-below");
        wrap.classList.add("vc-page-cine-aside-inline");
        head.appendChild(wrap);
        head.classList.add("vc-hero-head--has-aside");
        if (below.parentNode) below.parentNode.removeChild(below);
      }
    } catch (eWiki) {}
  }

  function parkPhoneHeavyAsideBelow() {
    /* phoneHeroScroll1: su telefono tip pesanti fuori hero (ruoli/candidature/tickets) */
    try {
      var isPhone = false;
      try {
        isPhone = window.matchMedia && window.matchMedia("(max-width: 639.98px)").matches;
        if (!isPhone && window.matchMedia && window.matchMedia("(pointer: coarse)").matches) {
          isPhone = (window.innerWidth || 0) < 980;
        }
      } catch (eMq) {
        isPhone = (window.innerWidth || 0) < 640;
      }
      var body = document.body;
      if (!body) return;

      if (body.classList.contains("vc-web-tickets-page") || body.classList.contains("vc-tickets-page")) {
        /* tipTicketsInHero1: tip sempre DENTRO hero (anche telefono), come faq/donazioni */
        var parked = document.getElementById("vc-tickets-aside-below");
        var hero = document.querySelector(".vc-page-cine-hero");
        var restoreHead = hero && hero.querySelector(".vc-hero-head");
        if (parked && parked.childNodes.length && restoreHead) {
          var inline = restoreHead.querySelector(".vc-page-cine-aside-inline");
          if (!inline) {
            inline = document.createElement("div");
            inline.className = "vc-page-cine-aside-inline";
            restoreHead.appendChild(inline);
          }
          while (parked.firstChild) inline.appendChild(parked.firstChild);
          restoreHead.classList.add("vc-hero-head--has-aside");
        }
        if (parked && parked.parentNode) parked.parentNode.removeChild(parked);
      }

      if (body.classList.contains("vc-candidature-page")) {
        /* candTipsInHeroPhone1: tip SEMPRE dentro hero (anche telefono), come tickets */
        var belowHost = document.querySelector(".vc-candidature-pair-below");
        var headCand = document.querySelector(".vc-page-cine-hero .vc-hero-head");
        if (belowHost && belowHost.childNodes.length && headCand) {
          var inlineCand = headCand.querySelector(".vc-page-cine-aside-inline");
          if (!inlineCand) {
            inlineCand = document.createElement("div");
            inlineCand.className = "vc-page-cine-aside-inline";
            headCand.appendChild(inlineCand);
          }
          while (belowHost.firstChild) inlineCand.appendChild(belowHost.firstChild);
          headCand.classList.add("vc-hero-head--has-aside");
        }
        if (belowHost) {
          belowHost.hidden = true;
          belowHost.setAttribute("hidden", "");
          if (belowHost.parentNode && !belowHost.childNodes.length) {
            try {
              belowHost.parentNode.removeChild(belowHost);
            } catch (eRm) {}
          }
        }
        if (headCand) headCand.classList.add("vc-hero-head--has-aside");
      }
    } catch (ePark) {}
  }

  function shouldDeferHeroAside(hero) {
    /* tip/aside restano DENTRO la hero card; fuori solo sponsor (flushSponsor). */
    return false;
  }

  function extractHeroAside(hero) {
    if (!hero || hero.dataset.vcAsideMoved === "1") return null;
    var panel = findHeroPanel(hero);
    if (!panel) return null;

    var asideWrap = document.createElement("div");
    asideWrap.className = "vc-page-cine-aside-inline";

    if (panel.classList.contains("vc-sponsor-hero-layout")) {
      var asideCol = panel.querySelector(".vc-sponsor-hero-aside");
      if (!asideCol || !asideCol.childNodes.length) return null;
      while (asideCol.firstChild) asideWrap.appendChild(asideCol.firstChild);
      asideCol.remove();
    } else if (panel.classList.contains("vc-vote-page-hero__inner")) {
      return null;
    } else if (panel.children.length >= 2) {
      while (panel.children.length > 1) {
        asideWrap.appendChild(panel.children[1]);
      }
    } else {
      return null;
    }

    if (!asideWrap.childNodes.length) return null;

    hero.dataset.vcAsideMoved = "1";

    var mainCol = findHeroCopyRoot(panel);
    if (mainCol) {
      mainCol.classList.add("vc-page-cine-hero-copy", "mx-auto", "text-center");
      var btnRow = mainCol.querySelector("[class*='flex-wrap']");
      if (btnRow) btnRow.classList.add("justify-center");
    }
    panel.classList.remove("vc-page-cine-card--wide");
    return asideWrap;
  }

  function relocateHeroAside(hero) {
    return extractHeroAside(hero);
  }

  function buildHomeHeroInterior(hero) {
    if (!hero) return;
        if (hasRealCineInterior(hero)) {
      hero.dataset.vcHomeHeroBuilt = "1";
      return;
    }
    if (hero.dataset.vcHomeHeroBuilt === "1") return;

    var cue = hero.querySelector(":scope > .vc-home-scrollcue");
    var scopeDock = hero.querySelector(":scope > #vc-notif-scope-dock, :scope > .vc-notif-scope-dock");
    var panel = findHeroPanel(hero);
    var copyRoot = null;

    if (panel) {
      if (panel.classList.contains("vc-vote-page-hero__inner")) {
        copyRoot = panel;
      } else {
        copyRoot = findHeroCopyRoot(panel);
      }
    } else {
      copyRoot = document.createElement("div");
      copyRoot.className = "vc-page-cine-hero-copy mx-auto max-w-3xl text-center";
      while (hero.firstChild) {
        var ch = hero.firstChild;
        if (ch.nodeType === 1 && ch.classList.contains("vc-home-scrollcue")) break;
        if (ch.nodeType === 1 && (ch.id === "vc-notif-scope-dock" || ch.classList.contains("vc-notif-scope-dock"))) {
          break;
        }
        copyRoot.appendChild(ch);
      }
      if (!copyRoot.childNodes.length) return;
    }

    if (!copyRoot) return;

    var asideInline =
      panel && panel.classList.contains("vc-vote-page-hero__inner")
        ? null
        : extractHeroAside(hero);

    /* cineIconsBack1: tieni l'icona hero (libro/lampadina/stella) — non rimuoverla */

    if (panel && panel.classList.contains("vc-vote-page-hero__inner")) {
      copyRoot.classList.add("vc-page-cine-hero-copy", "vc-page-cine-hero-copy--vote", "mx-auto", "w-full", "text-center");
    } else {
      copyRoot.classList.add("vc-page-cine-hero-copy", "mx-auto", "w-full", "text-center");
    }
        try {
      copyRoot.classList.remove("max-w-3xl", "max-w-2xl", "max-w-xl", "text-left", "sm:text-left", "lg:text-left");
      copyRoot.classList.add("text-center", "mx-auto", "w-full");
    } catch (eCopyCls) {}
    var btnRow = copyRoot.querySelector("[class*='flex-wrap']");
    if (btnRow) btnRow.classList.add("justify-center");

    /* sponsorAsideBelow1: tip Requisiti/Visibilità sotto la card; refund resta DENTRO la hero */
    var deferredAside = null;
    try {
      if (document.body && document.body.classList.contains("vc-sponsor-page")) {
        deferredAside = document.createElement("div");
        deferredAside.id = "vc-sponsor-aside-deferred";
        deferredAside.className = "vc-page-cine-aside-below";
        deferredAside.hidden = true;
        if (asideInline && asideInline.childNodes.length) {
          while (asideInline.firstChild) deferredAside.appendChild(asideInline.firstChild);
          asideInline = null;
        }
      }
    } catch (eDef) {}

    var inner = document.createElement("div");
    inner.className =
      "relative z-10 mx-auto w-full px-4 pb-0 pt-2 text-center vc-page-cine-hero__inner";

    var head = document.createElement("div");
    head.className = "vc-hero-head vc-glass mx-auto text-center";

    head.appendChild(copyRoot);

    if (asideInline && asideInline.childNodes.length) {
      head.classList.add("vc-hero-head--has-aside");
      head.appendChild(asideInline);
    }

    inner.appendChild(head);

    hero.innerHTML = "";
    hero.appendChild(inner);
    if (deferredAside && deferredAside.childNodes.length) {
      try {
        hero.insertAdjacentElement("afterend", deferredAside);
      } catch (eIns) {
        try {
          document.body.appendChild(deferredAside);
        } catch (eBody) {}
      }
    }
    if (scopeDock) hero.appendChild(scopeDock);
    /* scrollCueNoLag1: non rimettere il cue nell'hero (absolute → segue lo scroll) */
    if (cue) {
      try {
        cue.classList.add("vc-home-scrollcue--vp");
        /* scrollCuePinHide2: mai rimettere nell'hero */
        if (document.body) document.body.appendChild(cue);
        pinScrollCueLayout(cue, hero);
      } catch (eCueBody) {}
    }

    hero.dataset.vcHomeHeroBuilt = "1";
  }

  function resolveDefaultHeroIconSpec() {
    /* cardHeroIcon1: fallback FA se markup perso / JS cine stale ha rimosso l'icona */
    var body = document.body;
    var cls = (body && body.className) || "";
    if (/\bvc-reviews-page\b|\bvc-bot-reviews-page\b/.test(cls)) {
      return { fa: "fa-star-o", extra: "vc-reviews-hero-star" };
    }
    if (/\bvc-suggestions-page\b/.test(cls)) {
      return { fa: "fa-lightbulb-o", extra: "vc-suggestions-hero-bulb vc-reviews-hero-star" };
    }
    if (/\bvc-sponsor-page\b/.test(cls)) {
      return { fa: "fa-handshake-o", extra: "vc-sponsor-hero-handshake" };
    }
    if (/\bvc-wiki-page\b/.test(cls)) {
      return { fa: "fa-book", extra: "vc-wiki-hero-book" };
    }
    if (/\bvc-faq-page\b|\bvc-regole-page\b/.test(cls)) {
      return { fa: "fa-question-circle", extra: "vc-regole-hero-book" };
    }
    if (/\bvc-donazioni-page\b/.test(cls)) {
      return { fa: "fa-heart", extra: "vc-donazioni-hero-heart" };
    }
    if (/\bvc-perks-page\b/.test(cls)) {
      return { fa: "fa-rocket", extra: "vc-perks-hero-rocket" };
    }
    if (/\bvc-vote-page\b/.test(cls)) {
      return { fa: "fa-check-square-o", extra: "" };
    }
    if (/\bvc-roles-page\b/.test(cls)) {
      return { fa: "fa-id-badge", extra: "" };
    }
    if (/\bvc-tickets-page\b|\bvc-web-tickets-page\b/.test(cls)) {
      return { fa: "fa-ticket", extra: "vc-tickets-hero-ticket" };
    }
    if (/\bvc-candidature-page\b/.test(cls)) {
      return { fa: "fa-briefcase", extra: "" };
    }
    if (/\bvc-appelli-page\b/.test(cls)) {
      return { fa: "fa-unlock", extra: "vc-unban-hero-unlock" };
    }
    if (/\bvc-staff-guide-page\b/.test(cls)) {
      return { fa: "fa-book", extra: "vc-staff-hero-icon" };
    }
    if (/\bvc-staff-pause-page\b/.test(cls)) {
      return { fa: "fa-calendar", extra: "vc-staff-hero-icon" };
    }
    if (/\bvc-staff-organico-page\b/.test(cls)) {
      return { fa: "fa-users", extra: "vc-staff-hero-icon" };
    }
    if (/\bvc-privacy-page\b/.test(cls)) {
      return { fa: "fa-shield", extra: "" };
    }
    if (/\bvc-terms-page\b/.test(cls)) {
      return { fa: "fa-file-text-o", extra: "" };
    }
    if (/\bvc-cookie-page\b/.test(cls)) {
      return { fa: "fa-circle-o-notch", extra: "" };
    }
    if (/\bvc-legal-page\b|\bvc-copyright-page\b|\bvc-dati-page\b/.test(cls)) {
      return { fa: "fa-balance-scale", extra: "" };
    }
    /* homeHero1: homepage card icon = FA coffee (brand) */
    if (/\bvc-body--home\b/.test(cls)) {
      return { fa: "fa-coffee", extra: "" };
    }
    return { fa: "fa-coffee", extra: "" };
  }

  function ensureStaffHeroIconTop(hero) {
    /* cineHeroBadge1 + cardHeroIcon1: icona sempre prima di kicker/titolo nella copy */
    try {
      if (!hero || !hero.querySelector) return;
      var copy =
        hero.querySelector(".vc-page-cine-hero-copy") ||
        hero.querySelector(".vc-sponsor-hero-copy") ||
        hero.querySelector(".vc-hero-head .max-w-3xl") ||
        hero.querySelector(".max-w-3xl") ||
        hero.querySelector(".vc-hero-head");
      if (!copy) return;
      var icon =
        copy.querySelector(":scope > .vc-support-page-hero__icon") ||
        hero.querySelector(".vc-support-page-hero__icon");
      if (!icon) {
        var spec = resolveDefaultHeroIconSpec();
        icon = document.createElement("div");
        icon.className =
          "vc-support-page-hero__icon vc-support-page-hero__icon--start mb-5" +
          (spec.extra ? " " + spec.extra : "");
        icon.setAttribute("aria-hidden", "true");
        var ii = document.createElement("i");
        ii.className = "fa " + spec.fa;
        icon.appendChild(ii);
      }
      if (icon.parentElement !== copy) {
        copy.insertBefore(icon, copy.firstChild);
      } else if (copy.firstElementChild !== icon) {
        copy.insertBefore(icon, copy.firstChild);
      }
      icon.classList.add("vc-staff-hero-icon");
      icon.removeAttribute("hidden");
      icon.style.removeProperty("display");
      icon.style.removeProperty("visibility");
      icon.style.removeProperty("opacity");
    } catch (eIconTop) {}
  }

  function polishHeroChrome(hero) {
    if (!hero) return;

            var head =
      hero.querySelector(":scope > .vc-page-cine-hero__inner .vc-hero-head") ||
      hero.querySelector(":scope > .vc-support-intro-shell .vc-hero-head") ||
      hero.querySelector(":scope > .vc-vote-page-hero__inner.vc-hero-head") ||
      hero.querySelector(":scope > .vc-vote-page-hero__inner");
    if (head && !head.classList.contains("vc-hero-head")) {
      head.classList.add("vc-hero-head", "vc-glass");
    }

    var copy = hero.querySelector(".vc-page-cine-hero-copy") || hero;
    var kickers = copy.querySelectorAll(
      ":scope > p.text-xs.font-semibold.uppercase, :scope > p[class*='uppercase'][class*='tracking-']"
    );
    if (!kickers.length) {
      var firstKicker = copy.querySelector("p.text-xs.font-semibold.uppercase, p[class*='uppercase'][class*='tracking-']");
      if (firstKicker && !firstKicker.closest(".vc-page-cine-aside-inline")) kickers = [firstKicker];
    }
    for (var k = 0; k < kickers.length; k++) {
      if (!kickers[k].classList.contains("vc-hero-kicker")) {
        kickers[k].classList.add("vc-hero-kicker");
      }
    }

    var titles = copy.querySelectorAll("h1");
    for (var t = 0; t < titles.length; t++) {
      if (!titles[t].classList.contains("vc-brand-glow")) {
        titles[t].classList.add("vc-brand-glow");
      }
    }

    var leads = copy.querySelectorAll("h1 + p, :scope > p");
    for (var l = 0; l < leads.length; l++) {
      /* candDraftToastKill1: status-line nascosta ≠ lead (gap CTA fantasma) */
      if (
        leads[l].classList.contains("vc-hero-kicker") ||
        leads[l].classList.contains("vc-hero-about") ||
        leads[l].classList.contains("vc-support-donate-refund-note") ||
        leads[l].classList.contains("vc-regole-disclaimer") ||
        leads[l].classList.contains("vc-candidature-status-line") ||
        leads[l].id === "vc-regole-disclaimer" ||
        leads[l].id === "vc-candidature-status-line" ||
        leads[l].hidden === true ||
        leads[l].hasAttribute("hidden")
      ) {
        continue;
      }
      leads[l].classList.add("vc-hero-about");
    }
    var welcomeIds = ["unban-welcome", "unmute-welcome"];
    for (var w = 0; w < welcomeIds.length; w++) {
      var welcome = document.getElementById(welcomeIds[w]);
      if (welcome) welcome.classList.add("vc-hero-about");
    }

    var primary = hero.querySelector(
      "a[class*='from-[#d4'], a[class*='from-'], a.vc-home-cine-cta, a.bg-gradient-to-r"
    );
    if (primary) {
      primary.classList.add("vc-header-pill", "vc-home-cine-cta");
    }

    var pills = hero.querySelectorAll(
      "a.rounded-2xl, a.vc-header-pill, a.border-white\\/10, a[class*='border-white']"
    );
    for (var p = 0; p < pills.length; p++) {
      if (pills[p].classList.contains("vc-vote-platform-card")) continue;
      if (pills[p].closest(".vc-vote-page-hero-platforms")) continue;
      if (!pills[p].classList.contains("vc-home-cine-cta")) {
        pills[p].classList.add("vc-header-pill");
      }
    }

    /* cineHeroBadge1: icona sempre sopra kicker su tutte le pagine cine */
    ensureStaffHeroIconTop(hero);
  }

  function initPageHeroRise(hero) {
    /* cueKeep1: niente rise ritardato post-reveal (micro-reflow hero/card) — scrollcue resta */
    if (!hero) return;
    hero.classList.remove("vc-home-rise");
    hero.classList.add("is-in");
    hero.dataset.vcHeroRise = "1";
    var head = hero.querySelector(".vc-hero-head") || hero.querySelector(".vc-support-intro-shell");
    if (head) {
      head.classList.remove("vc-home-rise");
      head.classList.add("is-in");
    }
    var bits = hero.querySelectorAll(
      ".vc-home-rise, .vc-hero-kicker, .vc-brand-glow, .vc-hero-about, .vc-hero-head a.vc-header-pill, .vc-page-cine-aside-inline > [class*='rounded-'], .vc-page-cine-aside-inline .grid > [class*='rounded-'], .vc-sponsor-embed"
    );
    for (var h = 0; h < bits.length; h++) {
      try {
        bits[h].classList.remove("vc-home-rise");
        bits[h].classList.add("is-in");
        bits[h].style.removeProperty("--vc-rise-delay");
      } catch (eBit) {}
    }
  }

  function initPageHeroLayout(opts) {
    opts = opts || {};
    if (excludedPolishPath()) {
      markPageCineReady(true);
      return;
    }
    if (shouldSkipPageCineHeroLayout()) {
      resetUsersPageCineLayout();
      return;
    }
    var body = document.body;
    if (!body || body.classList.contains("vc-body--home")) {
      markPageCineReady(true);
      return;
    }
    if (!isPolishPage()) {
      markPageCineReady(true);
      return;
    }

    var container = opts.container || document.querySelector("main");
    if (!container) {
      markPageCineReady(true);
      return;
    }

    var hero = opts.hero || document.querySelector(".vc-page-cine-hero") || findPageHero(container);
    if (!hero) {
      markPageCineReady(true);
      return;
    }
    if (container && !container.contains(hero)) {
      container = document.querySelector("main") || container;
    }

    if (body.dataset.vcPageCineLayout === "1") {
      var laidHero = document.querySelector(".vc-page-cine-hero") || hero;
      var interiorOk = hasRealCineInterior(laidHero || hero);
            if (interiorOk) {
        ensureStaffCineClasses(laidHero || hero);
        if (opts.force) {
          restructurePageMain(container, laidHero || hero);
          container.classList.add("vc-page-cine-main");
        }
        polishHeroChrome(laidHero || hero);
        flushSponsorAsideToContent(document.getElementById("vc-page-content"));
        flushWikiAsideToContent(document.getElementById("vc-page-content"));
        parkPhoneHeavyAsideBelow();
        ensureScrollCueFor(laidHero || hero, container);
        initPageHeroRise(laidHero || hero);
        markPageCineReady();
        if (opts.force) snapScrollTopIfPristine();
        return;
      }
      if (!opts.force || !laidHero || laidHero === hero) {
        if (opts.force) {
          restructurePageMain(container, laidHero || hero);
          container.classList.add("vc-page-cine-main");
          body.classList.add("vc-page-cine-layout");
          body.dataset.vcPageCineLayout = "1";
          if (laidHero || hero) {
            (laidHero || hero).classList.add("vc-page-cine-hero", "vc-home-cine-hero");
          }
        }
        buildHomeHeroInterior(laidHero || hero);
        polishHeroChrome(laidHero || hero);
        flushSponsorAsideToContent(document.getElementById("vc-page-content"));
        flushWikiAsideToContent(document.getElementById("vc-page-content"));
        parkPhoneHeavyAsideBelow();
        ensureScrollCueFor(laidHero || hero, container);
        initPageHeroRise(laidHero || hero);
        markPageCineReady();
        if (opts.force) snapScrollTopIfPristine();
        return;
      }
    }

    if (opts.force) {
      var oldHero = document.querySelector(".vc-page-cine-hero");
      if (oldHero && oldHero !== hero) {
        oldHero.classList.remove("vc-page-cine-hero", "vc-home-cine-hero");
        var oldCue = oldHero.querySelector(".vc-home-scrollcue");
        if (oldCue) oldCue.remove();
      }
    }

    var contentWrap = null;
    if (!opts.skipRestructure) {
      contentWrap = restructurePageMain(container, hero);
    } else {
      contentWrap = document.getElementById("vc-page-content");
    }
    buildHomeHeroInterior(hero);
    hero.classList.add("vc-page-cine-hero", "vc-home-cine-hero");
    if (!hero.id) hero.id = "vc-page-intro";
    hero.classList.remove("mb-8", "sm:mb-10", "mb-10", "sm:mb-12", "mt-8");
    container.classList.add("vc-page-cine-main");

    body.classList.add("vc-page-cine-layout");
    body.dataset.vcPageCineLayout = "1";

    polishHeroChrome(hero);
    flushSponsorAsideToContent(contentWrap);
    flushWikiAsideToContent(contentWrap);
    parkPhoneHeavyAsideBelow();
    ensureScrollCueFor(hero, container);
    initPageHeroRise(hero);
    markPageCineReady();
    snapScrollTopIfPristine();
    requestAnimationFrame(function () {
      ensureScrollCueFor(hero, container);
      bindInnerHeroScrollFx();
      snapScrollTopIfPristine();
    });
  }

  function ensureCommunityPageCineLayout() {
    /* violKillEmoji1d: una sola passata — prima faceva force×3 + rAF = Violation 200–300ms */
    var now = Date.now();
    if (window.__vcCommunityLayoutAt && now - window.__vcCommunityLayoutAt < 1500) return;
    window.__vcCommunityLayoutAt = now;
    if (!isUsersCommunityPage()) {
      initPageHeroLayout({ force: false });
      return;
    }
    initPageHeroLayout({ force: false });
    bindInnerHeroScrollFx();
    snapScrollTopIfPristine();
    whenCommunityLeaderReady(function () {
      if (Date.now() - window.__vcCommunityLayoutAt < 400) return;
      window.__vcCommunityLayoutAt = Date.now();
      if (typeof window.__vcLight === "function") {
        window.__vcLight(function () {
          initPageHeroLayout({ force: false });
          bindInnerHeroScrollFx();
          snapScrollTopIfPristine();
        }, 180);
      } else {
        window.setTimeout(function () {
          initPageHeroLayout({ force: false });
          bindInnerHeroScrollFx();
          snapScrollTopIfPristine();
        }, 180);
      }
    });
  }

  window.__vcPageHeroLayout = initPageHeroLayout;
  window.__vcEnsureCommunityPageCineLayout = ensureCommunityPageCineLayout;
  window.__vcMarkPageCineReady = markPageCineReady;

  function startCueBounce(cue) {
    if (!cue) return;
  }

  function markRise(el, delayMs) {
    if (!el || el.classList.contains("vc-home-rise")) return;
    el.classList.add("vc-home-rise");
    if (typeof delayMs === "number") {
      el.style.setProperty("--vc-rise-delay", Math.max(0, delayMs) + "ms");
    }
  }

  function pickHomeBodyCascadeNodes() {
    var selectors = [
      "#stats .vc-stat-strip",
      ".vc-home-deck",
      ".vc-home-feature",
      ".vc-home-index",
    ];
    var list = [];
    for (var s = 0; s < selectors.length; s++) {
      var nodes = document.querySelectorAll(selectors[s]);
      for (var i = 0; i < nodes.length && list.length < 24; i++) {
        var el = nodes[i];
        if (el.hidden || el.hasAttribute("hidden")) continue;
        if ((el.offsetHeight || 0) > 0 && (el.offsetHeight || 0) < 48) continue;
        list.push(el);
      }
    }
    return list.slice(0, 24);
  }

  function pickBodyCascadeNodes() {
    var body = document.body;
    if (body && body.classList.contains("vc-body--home")) {
      return pickHomeBodyCascadeNodes();
    }
    var root = document.getElementById("vc-page-content") || document.querySelector(".vc-page-cine-body");
    if (!root) return [];
    var direct = root.querySelectorAll(":scope > section, :scope > article, :scope > div");
    var list = [];
    for (var i = 0; i < direct.length; i++) {
      var el = direct[i];
      if (el.hidden || el.hasAttribute("hidden")) continue;
      if (el.id === "vc-regole-tabs" || el.id === "vc-staff-guide-tabs" || el.id === "vc-regole-list" || el.id === "vc-staff-guide-list") {
        continue;
      }
      /* violKillFinal2: niente offsetHeight (Forced reflow) */
      var innerCards = el.querySelectorAll(
        ":scope > .vc-faq-group, :scope > .vc-faq-item, :scope > .vc-regole-card, :scope > .vc-role-card, :scope > .vc-reviews-card:not(.vc-reviews-stage__card), :scope > .vc-reviews-formcard, :scope > .vc-page-cine-card, :scope > .vc-perks-card, :scope > .vc-legal-card, :scope > .vc-staff-block, :scope > section, :scope > article"
      );
      if (innerCards.length >= 2) {
        for (var j = 0; j < innerCards.length && list.length < 24; j++) {
          var inner = innerCards[j];
          if (inner.closest && (inner.closest("#vc-regole-list") || inner.closest("#vc-staff-guide-list"))) continue;
          if (inner.hidden || inner.hasAttribute("hidden")) continue;
          list.push(inner);
        }
      } else {
        list.push(el);
      }
    }
    return list.slice(0, 24);
  }

  function bodyCascadeShouldTrigger() {
    /* violKillFinal2: solo cache Y — niente pageYOffset in scroll/rAF */
    var y = Math.max(0, Math.round(Number(window.__vcCachedScrollY) || 0));
    return y > 48;
  }

  function playPageBodyCascade() {
    var state = window.__vcPageBodyCascade;
    if (!state || state.played) return;
    if (!state.items || !state.items.length) return;
    state.played = true;
    window.__vcPageBodyCascadeDone = true;
    /* violKillFinal2: 1 classList per turno — no storm sync su N nodi */
    var i = 0;
    function step() {
      if (i >= state.items.length) return;
      try {
        state.items[i].el.classList.add("is-in");
      } catch (eIn) {}
      i += 1;
      if (i < state.items.length) {
        if (typeof window.__vcLight === "function") window.__vcLight(step, 40);
        else window.setTimeout(step, 40);
      }
    }
    if (typeof window.__vcLight === "function") window.__vcLight(step, 40);
    else window.setTimeout(step, 40);
  }

  function initPageBodyCascade() {
    var body = document.body;
    if (!body) return;
    var isHome = body.classList.contains("vc-body--home");
    if (!isHome && !body.classList.contains("vc-page-cine-layout") && !document.getElementById("vc-page-content")) {
      return;
    }

    try {
      document.documentElement.classList.add("vc-home-motion-ready");
    } catch (eMotion) {}

    var nodes = pickBodyCascadeNodes();
    if (!nodes.length) return;

    if (!window.__vcPageBodyCascade) {
      window.__vcPageBodyCascade = { played: false, items: [], timers: [] };
      var cascadeScrollArmed = 0;
      window.addEventListener(
        "scroll",
        function () {
          /* violKillFinal2: scroll = solo arm — play fuori (era rAF Violation 145ms) */
          if (window.__vcPageBodyCascade.played) return;
          if (cascadeScrollArmed) return;
          cascadeScrollArmed = 1;
          var go = function () {
            cascadeScrollArmed = 0;
            try {
              if (window.__vcPageBodyCascade.played) return;
              if (!bodyCascadeShouldTrigger()) return;
              playPageBodyCascade();
            } catch (eSc) {}
          };
          if (typeof window.__vcLight === "function") window.__vcLight(go, 120);
          else window.setTimeout(go, 120);
        },
        { passive: true }
      );
      document.addEventListener(
        "click",
        function (ev) {
          if (window.__vcPageBodyCascade.played) return;
          var t = ev.target;
          if (t && t.closest && t.closest(".vc-home-scrollcue")) {
            window.setTimeout(playPageBodyCascade, 140);
          }
        },
        { passive: true, capture: true }
      );
    }

    var state = window.__vcPageBodyCascade;
    if (state.played && state.items.length) return;

    for (var t = 0; t < state.timers.length; t++) {
      window.clearTimeout(state.timers[t]);
    }
    state.timers = [];
    state.items = [];
    if (state.played) {
      state.played = false;
      window.__vcPageBodyCascadeDone = false;
    }

    for (var n = 0; n < nodes.length; n++) {
      var el = nodes[n];
      el.setAttribute("data-vc-body-cascade", "1");
      var snappy = shouldSnappyBodyFx();
      var delay = snappy ? 0 : 70 + n * 85;
      if (snappy) {
        el.classList.remove("vc-home-rise");
        try {
          el.style.removeProperty("--vc-rise-delay");
        } catch (eDelayClr) {}
        el.classList.add("is-in");
      } else {
        markRise(el, delay);
        el.classList.remove("is-in");
      }
      state.items.push({ el: el, delay: delay });
    }

    if (bodyCascadeShouldTrigger()) {
      window.requestAnimationFrame(function () {
        playPageBodyCascade();
      });
    }
  }

  try {
    window.__vcInitPageBodyCascade = initPageBodyCascade;
  } catch (eExposeCascade) {}

  function initHomeFx() {
    var coarse = isCoarse();
        var instant = true; /* cueKeep1 */

    try {
      document.documentElement.classList.add("vc-home-motion-ready");
    } catch (eMotion) {}

    var heroBits = document.querySelectorAll(
      "#intro .vc-hero-kicker, #intro .vc-brand-glow, #intro .vc-hero-about, #intro .vc-hero-head a.vc-header-pill"
    );
    for (var h = 0; h < heroBits.length; h++) {
      markRise(heroBits[h], instant ? 0 : 50 + h * 70);
      if (instant) {
        heroBits[h].classList.add("is-in");
      } else {
        (function (el, delay) {
          window.requestAnimationFrame(function () {
            window.setTimeout(function () {
              try {
                el.classList.add("is-in");
              } catch (eIn) {}
            }, delay);
          });
        })(heroBits[h], 50 + h * 70);
      }
    }

    var panels = document.querySelectorAll(
      "#stats .vc-stat-strip, .vc-home-deck, .vc-home-feature, .vc-home-index"
    );
    for (var p = 0; p < panels.length; p++) {
      markRise(panels[p], instant ? 0 : 120 + p * 90);
      if (instant) panels[p].classList.add("is-in");
    }

    var cells = document.querySelectorAll(".vc-home-deck__cell");
    for (var c = 0; c < cells.length; c++) {
      markRise(cells[c], instant ? 0 : 160 + c * 45);
      if (instant) cells[c].classList.add("is-in");
    }

    var pills = document.querySelectorAll(".vc-home-feature__pills a");
    for (var i = 0; i < pills.length; i++) {
      markRise(pills[i], instant ? 0 : 180 + i * 35);
      if (instant) pills[i].classList.add("is-in");
    }

    var cols = document.querySelectorAll(".vc-home-index__col");
    for (var k = 0; k < cols.length; k++) {
      markRise(cols[k], instant ? 0 : 200 + k * 55);
      if (instant) cols[k].classList.add("is-in");
    }

    try {
      initPageBodyCascade();
    } catch (eHomeCascade) {}

    var riseNodes = document.querySelectorAll(".vc-home-rise:not(.is-in)");

    function reveal(el) {
      if (!el || el.classList.contains("is-in")) return;
      if (el.getAttribute("data-vc-body-cascade") === "1") return;
      el.classList.add("is-in");
    }

    var snappyRise = shouldSnappyBodyFx();
    if (!riseNodes.length) {
          } else if (snappyRise || typeof IntersectionObserver === "undefined") {
      for (var r = 0; r < riseNodes.length; r++) reveal(riseNodes[r]);
    } else {
      var io = new IntersectionObserver(
        function (entries) {
          for (var e = 0; e < entries.length; e++) {
            if (!entries[e].isIntersecting) continue;
            reveal(entries[e].target);
            io.unobserve(entries[e].target);
          }
        },
        { root: null, rootMargin: "48px 0px", threshold: 0.06 }
      );
      for (var n = 0; n < riseNodes.length; n++) {
        if (riseNodes[n].getAttribute("data-vc-body-cascade") === "1") continue;
        io.observe(riseNodes[n]);
      }
    }

            function riseInView(el) {
      try {
        var r = el.getBoundingClientRect();
        var vh = window.innerHeight || document.documentElement.clientHeight || 0;
        return r.top < vh * 0.9 && r.bottom > 24;
      } catch (eV) {
        return true;
      }
    }
    window.setTimeout(function () {
      try {
        var stale = document.querySelectorAll(".vc-home-rise:not(.is-in)");
        for (var s = 0; s < stale.length; s++) {
          if (stale[s].getAttribute("data-vc-body-cascade") === "1" && !window.__vcPageBodyCascadeDone) continue;
          if (!shouldSnappyBodyFx() && !riseInView(stale[s])) continue;
          stale[s].classList.add("is-in");
        }
      } catch (eStale) {}
    }, shouldSnappyBodyFx() ? 0 : 900);
    window.setTimeout(function () {
      try {
        var stale2 = document.querySelectorAll(".vc-home-rise:not(.is-in)");
        for (var s2 = 0; s2 < stale2.length; s2++) {
          if (stale2[s2].getAttribute("data-vc-body-cascade") === "1" && !window.__vcPageBodyCascadeDone) continue;
          stale2[s2].classList.add("is-in");
        }
      } catch (eStale2) {}
    }, 12000);

                var skipHeavyFx =
      coarse ||
      isStandalonePwa() ||
      (window.VcPerf && typeof window.VcPerf.isMidOrLite === "function" && window.VcPerf.isMidOrLite()) ||
      (window.VcPerf && typeof window.VcPerf.isLite === "function" && window.VcPerf.isLite());
    if (!skipHeavyFx) {
      initPanelTilt();
      initHomeExtraFx();
    } else {
      try {
        document.body.classList.add("vc-home-fx");
      } catch (e) {}
    }
  }

  function initPanelTilt() {
    /* fase3SkipTiltPhoto1 */
    try {
      if (SITE_PHOTO_BG || window.__VC_SITE_PHOTO_BG) return;
      if (isSeratafilmRoute()) return;
    } catch (eSkipTilt) {}

    try {
      /* cpuPagesIdle1: tilt pointermove = CPU su page-cine */
      if (document.documentElement.classList.contains("vc-site-cpu-soft")) return;
      if (document.documentElement.classList.contains("vc-pwa-cpu-nuke")) return;
      if (document.body && document.body.classList.contains("vc-page-cine-layout")) return;
    } catch (eSoftTilt) {}
    var sel = tiltSelectors();
    if (!sel) return;
    var shells = document.querySelectorAll(sel);
    for (var s = 0; s < shells.length; s++) {
      (function (shell) {
        if (!shell || shell.dataset.vcTilt === "1") return;
        if (shell.closest && shell.closest(".vc-page-cine-hero, .vc-wt-board, dialog, header, footer")) return;
        var h = shell.offsetHeight || 0;
        if (h > 640) return;
        shell.dataset.vcTilt = "1";
        var raf = 0;
        var cx = 0;
        var cy = 0;
        var tx = 0;
        var ty = 0;
        function tick() {
          raf = 0;
          if (gpuQuietPaused()) {
            shell.style.transform = "";
            return;
          }
          cx += (tx - cx) * 0.12;
          cy += (ty - cy) * 0.12;
          shell.style.transform =
            "perspective(900px) rotateX(" +
            (-cy * 1.6).toFixed(3) +
            "deg) rotateY(" +
            (cx * 1.8).toFixed(3) +
            "deg) translateY(-2px)";
          if (Math.abs(tx - cx) > 0.002 || Math.abs(ty - cy) > 0.002) {
            raf = requestAnimationFrame(tick);
          }
        }
        shell.addEventListener(
          "pointermove",
          function (ev) {
            if (gpuQuietPaused()) return;
            var rect = shell.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            tx = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
            ty = ((ev.clientY - rect.top) / rect.height) * 2 - 1;
            shell.classList.add("is-tilting");
            if (!raf) raf = requestAnimationFrame(tick);
          },
          { passive: true }
        );
        shell.addEventListener("pointerleave", function () {
          tx = 0;
          ty = 0;
          shell.classList.remove("is-tilting");
          if (!raf) raf = requestAnimationFrame(tick);
          window.setTimeout(function () {
            if (!shell.classList.contains("is-tilting")) {
              shell.style.transform = "";
            }
          }, 280);
        });
      })(shells[s]);
    }
  }

  try {
    window.__vcInitPanelTilt = initPanelTilt;
  } catch (eExposeTilt) {}

  function initCursorSpotlight() {
    var stage = document.querySelector(".vc-home-cine");
    if (!stage) return;
    /* ticketsLagHard1: tickets = no spotlight pointermove (CPU su scroll/type) */
    try {
      var bSpot = document.body;
      if (
        bSpot &&
        (bSpot.classList.contains("vc-web-tickets-page") || bSpot.classList.contains("vc-tickets-page"))
      ) {
        return;
      }
    } catch (eTkSpot) {}
    ensureSpotlightLayer(stage);
    stage.classList.add("vc-home-cine--spot");

    var spotRaf = 0;
    var sx = 0.5;
    var sy = 0.35;
    var stx = 0.5;
    var sty = 0.35;
    function spotTick() {
      spotRaf = 0;
      if (gpuQuietPaused()) return;
      sx += (stx - sx) * 0.08;
      sy += (sty - sy) * 0.08;
      stage.style.setProperty("--vc-spot-x", (sx * 100).toFixed(2) + "%");
      stage.style.setProperty("--vc-spot-y", (sy * 100).toFixed(2) + "%");
      if (Math.abs(stx - sx) > 0.001 || Math.abs(sty - sy) > 0.001) {
        spotRaf = requestAnimationFrame(spotTick);
      }
    }
    window.addEventListener(
      "pointermove",
      function (ev) {
        if (gpuQuietPaused()) return;
        var w = Math.max(1, window.innerWidth || 1);
        var h = Math.max(1, window.innerHeight || 1);
        stx = ev.clientX / w;
        sty = ev.clientY / h;
        if (!spotRaf) spotRaf = requestAnimationFrame(spotTick);
      },
      { passive: true }
    );
  }

  function initPolishHeroFx() {
        var skipMag = prefersReduced() || isCoarse();
    try {
      if (window.VcPerf && typeof window.VcPerf.isMidOrLite === "function" && window.VcPerf.isMidOrLite()) {
        skipMag = true;
      }
    } catch (eMagSkip) {}
    if (skipMag) return;

    var ctas = document.querySelectorAll(".vc-page-cine-hero .vc-hero-head a.vc-header-pill");
    for (var c = 0; c < ctas.length; c++) {
      (function (btn) {
        if (btn.dataset.vcHomeMag === "1") return;
        btn.dataset.vcHomeMag = "1";
        btn.classList.add("vc-home-mag");
        btn.addEventListener(
          "pointermove",
          function (ev) {
            var rect = btn.getBoundingClientRect();
            var dx = (ev.clientX - (rect.left + rect.width / 2)) / Math.max(1, rect.width);
            var dy = (ev.clientY - (rect.top + rect.height / 2)) / Math.max(1, rect.height);
            btn.style.transform =
              "translate(" + (dx * 10).toFixed(2) + "px," + (dy * 8).toFixed(2) + "px) scale(1.03)";
          },
          { passive: true }
        );
        btn.addEventListener("pointerleave", function () {
          btn.style.transform = "";
        });
      })(ctas[c]);
    }
  }

  function bindInnerHeroScrollFx() {
    var body = document.body;
    if (!body || body.classList.contains("vc-body--home")) return;
    if (!isPolishPage() || shouldSkipPageCineHeroLayout()) return;

    var coarse = isCoarse();

    var section =
      document.querySelector("main .vc-page-cine-hero") ||
      document.querySelector("main .vc-support-page-hero") ||
      document.querySelector("main .vc-notify-hero") ||
      document.querySelector("main .vc-vote-page-hero") ||
      document.querySelector("main .vc-staff-hero");
    if (!section) return;

    var card =
      section.querySelector(".vc-hero-head") ||
      section.querySelector(".vc-support-intro-shell") ||
      section.querySelector(".vc-page-cine-hero__inner");
    if (!card) return;

    if (section.dataset.vcInnerHeroFxBound === "1") {
      if (section._vcInnerHeroFxTick) section._vcInnerHeroFxTick();
      return;
    }
    section.dataset.vcInnerHeroFxBound = "1";
    section.classList.add("vc-hero-scroll-clip");

    var cue = section.querySelector(".vc-home-scrollcue");

        if (
      coarse ||
      (window.VcPerf && typeof window.VcPerf.isMidOrLite === "function" && window.VcPerf.isMidOrLite()) ||
      (window.VcPerf && typeof window.VcPerf.isLite === "function" && window.VcPerf.isLite())
    ) {
      function cueOnlyTick() {
        if (cue) applyScrollCueVisibility(cue, section);
      }
      section._vcInnerHeroFxTick = cueOnlyTick;
      window.addEventListener("scroll", cueOnlyTick, { passive: true });
      window.addEventListener("resize", cueOnlyTick, { passive: true });
      cueOnlyTick();
      return;
    }

    var raf = 0;
    function tick() {
      raf = 0;
      var y = window.pageYOffset || document.documentElement.scrollTop || 0;

      if (y <= 2) {
        section.classList.remove("is-collapsed");
        card.style.removeProperty("transition");
        card.style.removeProperty("transform");
        card.style.removeProperty("opacity");
        if (cue) {
          cue.style.removeProperty("transition");
          cue.style.removeProperty("opacity");
          cue.style.removeProperty("pointer-events");
          applyScrollCueVisibility(cue, section);
        }
        return;
      }

                  section.classList.remove("is-collapsed");

                  var shift = coarse ? Math.min(24, y * 0.1) : Math.min(48, y * 0.18);
      var opacity = Math.max(coarse ? 0.55 : 0.35, 1 - y / (coarse ? 680 : 520));
      card.style.transition = "none";
      card.style.transform = "translate3d(0," + shift.toFixed(1) + "px,0)";
      card.style.opacity = String(opacity);

      if (cue) applyScrollCueVisibility(cue, section);
    }

    section._vcInnerHeroFxTick = tick;
    window.addEventListener(
      "scroll",
      function () {
        if (!raf) raf = requestAnimationFrame(tick);
      },
      { passive: true }
    );
    window.addEventListener(
      "resize",
      function () {
        if (!raf) raf = requestAnimationFrame(tick);
      },
      { passive: true }
    );
    tick();
  }

  function initHomeExtraFx() {
    var body = document.body;
    if (!body) return;

        var ctas = document.querySelectorAll("#intro .vc-hero-head a.vc-header-pill");
    for (var i = 0; i < ctas.length; i++) {
      (function (btn) {
        btn.classList.add("vc-home-mag");
        btn.addEventListener(
          "pointermove",
          function (ev) {
            var rect = btn.getBoundingClientRect();
            var dx = (ev.clientX - (rect.left + rect.width / 2)) / Math.max(1, rect.width);
            var dy = (ev.clientY - (rect.top + rect.height / 2)) / Math.max(1, rect.height);
            btn.style.transform =
              "translate(" + (dx * 10).toFixed(2) + "px," + (dy * 8).toFixed(2) + "px) scale(1.03)";
          },
          { passive: true }
        );
        btn.addEventListener("pointerleave", function () {
          btn.style.transform = "";
        });
      })(ctas[i]);
    }

        var hero = document.querySelector("#intro .vc-support-intro-shell") || document.querySelector("#intro .vc-hero-head");
    if (hero) {
      var pRaf = 0;
      function parallax() {
        pRaf = 0;
        var y = window.pageYOffset || document.documentElement.scrollTop || 0;
        var shift = Math.min(48, y * 0.18);
        hero.style.transition = "none";
        hero.style.transform = "translate3d(0," + shift.toFixed(1) + "px,0)";
        hero.style.opacity = String(Math.max(0.35, 1 - y / 520));
      }
      window.addEventListener(
        "scroll",
        function () {
          if (!pRaf) pRaf = requestAnimationFrame(parallax);
        },
        { passive: true }
      );
      parallax();
    }

        var primary = document.querySelector("#intro a.vc-home-cine-cta");
    if (primary) {
      primary.classList.add("vc-home-pulse-cta");
      primary.addEventListener("pointerdown", function (ev) {
        /* violKillReflow1 + violKillVis1: niente void offsetWidth — double rAF */
        var rect = primary.getBoundingClientRect();
        var x = ((ev.clientX - rect.left) / Math.max(1, rect.width)) * 100;
        var y = ((ev.clientY - rect.top) / Math.max(1, rect.height)) * 100;
        primary.style.setProperty("--vc-ripple-x", x.toFixed(1) + "%");
        primary.style.setProperty("--vc-ripple-y", y.toFixed(1) + "%");
        primary.classList.remove("is-rippling");
        window.requestAnimationFrame(function () {
          window.requestAnimationFrame(function () {
            try {
              primary.classList.add("is-rippling");
            } catch (eRip) {}
          });
        });
      });
    }

      }

  function hasRealCineInterior(hero) {
    try {
      if (document.body && document.body.getAttribute("data-vc-cine-baked") === "1") {
        return Boolean(
          document.querySelector(".vc-page-cine-hero__inner .vc-hero-head") ||
            (hero && hero.querySelector && hero.querySelector(".vc-page-cine-hero__inner .vc-hero-head")),
        );
      }
    } catch (eBaked) {}
    if (!hero || !hero.querySelector) return false;
    try {
      return Boolean(
        hero.querySelector(".vc-page-cine-hero__inner .vc-hero-head") ||
          hero.querySelector(":scope > .vc-page-cine-hero__inner > .vc-hero-head"),
      );
    } catch (eReal) {
      return Boolean(hero.querySelector(".vc-page-cine-hero__inner .vc-hero-head"));
    }
  }

  function ensureStaffCineClasses(hero) {
    var body = document.body;
    if (body) {
      body.classList.add("vc-page-cine-layout");
      body.dataset.vcPageCineLayout = "1";
    }
    var main = document.querySelector("main");
    if (main) main.classList.add("vc-page-cine-main");
    if (hero) {
      hero.classList.add("vc-page-cine-hero", "vc-home-cine-hero");
      hero.dataset.vcHomeHeroBuilt = "1";
      if (!hero.id) hero.id = "vc-page-intro";
      hero.classList.remove("mb-8", "sm:mb-10", "mb-10", "sm:mb-12", "mt-8");
      ensureStaffHeroIconTop(hero);
    }
  }

  function staffCineLayoutReady() {
    var body = document.body;
    if (!body || !body.classList.contains("vc-page-cine-layout")) return false;
    var hero = document.querySelector(".vc-page-cine-hero");
    if (!hero) return false;
    if (!hasRealCineInterior(hero)) return false;
    var main = document.querySelector("main");
    if (!main || !main.classList.contains("vc-page-cine-main")) return false;
        var board =
      document.querySelector(".vc-staff-manage-board, .vc-staff-pause-board, #vc-staff-organico-board, #vc-staff-inbox") ||
      null;
    if (
      board &&
      hero.parentElement &&
      board.parentElement === hero.parentElement &&
      hero.parentElement.tagName === "MAIN"
    ) {
      return false;
    }
    return true;
  }

  function clearStaffCineLayoutStale() {
        var existing = document.querySelector(".vc-support-page-hero, .vc-page-cine-hero");
    if (existing && hasRealCineInterior(existing)) {
      ensureStaffCineClasses(existing);
      return;
    }
    if (staffCineLayoutReady()) return;
    /* notifMobileOpenFix1 / organicoDeepLinkCine1: NON togliere vc-page-cine-layout —
       da push/in-app la race clear→reveal lascia la pagina flat senza card. */
    var heroes = document.querySelectorAll(".vc-support-page-hero, .vc-page-cine-hero, .vc-staff-hero");
    for (var i = 0; i < heroes.length; i++) {
      if (hasRealCineInterior(heroes[i])) {
        ensureStaffCineClasses(heroes[i]);
        continue;
      }
      try {
        delete heroes[i].dataset.vcHomeHeroBuilt;
        delete heroes[i].dataset.vcAsideMoved;
        delete heroes[i].dataset.vcHeroRise;
        delete heroes[i].dataset.vcInnerHeroFxBound;
      } catch (eHero) {}
      heroes[i].classList.remove("vc-page-cine-hero", "vc-home-cine-hero", "is-collapsed", "vc-hero-scroll-clip");
      var fakeHeads = heroes[i].querySelectorAll(".grid.vc-hero-head");
      for (var f = 0; f < fakeHeads.length; f++) {
        fakeHeads[f].classList.remove("vc-hero-head", "vc-glass");
      }
    }
  }

  function bootStaffCineLayout(forceRebuild) {
    if (!isStaffCinePage()) return;
    var heroNow =
      document.querySelector(".vc-page-cine-hero") ||
      document.querySelector(".vc-support-page-hero");
        if (heroNow && hasRealCineInterior(heroNow)) {
      ensureStaffCineClasses(heroNow);
      ensureScrollCueFor(heroNow);
      snapScrollTopIfPristine();
      try {
        document.documentElement.classList.add("vc-home-motion-ready");
      } catch (eStaffMotion0) {}
      markPageCineReady();
      return;
    }
    if (staffCineLayoutReady() && !forceRebuild) return;
    if (!staffCineLayoutReady()) clearStaffCineLayoutStale();
    initPageHeroLayout({ force: true });
    bindInnerHeroScrollFx();
    snapScrollTopIfPristine();
    try {
      document.documentElement.classList.add("vc-home-motion-ready");
    } catch (eStaffMotion) {}
    if (!document.body.classList.contains("vc-vote-page")) {
      initPolishHeroFx();
      if (
        !isCoarse() &&
        !(window.VcPerf && window.VcPerf.isMidOrLite && window.VcPerf.isMidOrLite()) &&
        !(window.VcPerf && window.VcPerf.isLite && window.VcPerf.isLite())
      )
        initPanelTilt();
    }
    if (!staffCineLayoutReady()) {
      window.setTimeout(function () {
        if (!isStaffCinePage()) return;
        var h2 =
          document.querySelector(".vc-page-cine-hero") ||
          document.querySelector(".vc-support-page-hero");
        if (h2 && hasRealCineInterior(h2)) {
          ensureStaffCineClasses(h2);
          ensureScrollCueFor(h2);
          return;
        }
        if (staffCineLayoutReady()) return;
        clearStaffCineLayoutStale();
        initPageHeroLayout({ force: true });
        ensureScrollCueFor(document.querySelector(".vc-page-cine-hero"));
        snapScrollTopIfPristine();
      }, 120);
    } else {
      ensureScrollCueFor(document.querySelector(".vc-page-cine-hero"));
    }
  }

  function watchStaffCineLayout() {
    if (!isStaffCinePage()) return;
    if (window.__vcStaffCineWatchBound) return;
    window.__vcStaffCineWatchBound = true;
    bootStaffCineLayout(true);
    var tries = 0;
    function retry() {
      if (!isStaffCinePage()) return;
      tries += 1;
      if (!staffCineLayoutReady()) bootStaffCineLayout(true);
      if (!staffCineLayoutReady() && tries < 40) {
        window.setTimeout(retry, 150);
      }
    }
    function afterAccess() {
      bootStaffCineLayout(true);
      window.setTimeout(function () {
        bootStaffCineLayout(true);
      }, 60);
      window.setTimeout(function () {
        if (!staffCineLayoutReady()) bootStaffCineLayout(true);
      }, 320);
    }
    window.addEventListener("vc:staff-access-ok", afterAccess);
    window.addEventListener("vc:access-ok", afterAccess);
    window.addEventListener("pageshow", function (ev) {
      if (ev && ev.persisted) bootStaffCineLayout(true);
    });
    try {
      var root = document.documentElement;
      if (root && !root.classList.contains("vc-staff-app-revealed")) {
        var obs = new MutationObserver(function () {
          if (!root.classList.contains("vc-staff-app-revealed")) return;
          try {
            obs.disconnect();
          } catch (eObs) {}
          afterAccess();
        });
        obs.observe(root, { attributes: true, attributeFilter: ["class"] });
      } else if (root && root.classList.contains("vc-staff-app-revealed")) {
        afterAccess();
      }
    } catch (eWatch) {}
    retry();
  }

  try {
    window.__vcBootStaffCineLayout = bootStaffCineLayout;
  } catch (eBootExport) {}

    function flattenStaffPublicHero() {
    return;
  }

  function boot() {
    try {
      armScrollCueSkipWatch();
      if (skipScrollCuePage()) killScrollCueDom();
    } catch (eCueBoot) {}
    wireGpuQuietPageHidden();
    primeMobileCineClasses();
    var body = document.body;
        if (isSeratafilmRoute()) {
      try {
        /* fase3NoCanvas1: seratafilm = zero canvas/trail/tilt */
        document.documentElement.classList.add("vc-cine-static-bg", "vc-home-motion-ready");
        document.querySelectorAll(".vc-home-cine__canvas").forEach(function (c) {
          try {
            c.style.setProperty("display", "none", "important");
            c.style.setProperty("visibility", "hidden", "important");
          } catch (eHide) {}
        });
        markPageCineReady(true);
      } catch (eSf) {}
      return;
    }
    var home = Boolean(body && body.classList.contains("vc-body--home"));
    var polish = isPolishPage();
    if (!home && !polish) return;

    if (home) {
      try {
        if ("scrollRestoration" in history) history.scrollRestoration = "manual";
      } catch (eHomeScroll) {}
      resetHomeScroll();
      /* violKillCue2: resetHomeScroll fuori dallo storm setTimeout(0) */
      window.addEventListener("pageshow", function (ev) {
        window.setTimeout(function () {
          try {
            resetHomeScroll(ev);
          } catch (eRs) {}
        }, 64);
      });
      var intro = document.getElementById("intro");
      if (intro && intro.className.indexOf("vc-home-cine-hero") < 0) {
        intro.className += " vc-home-cine-hero";
      }
      /* homeHero1: ensure coffee icon in homepage card */
      try {
        ensureStaffHeroIconTop(intro);
      } catch (eHomeIcon) {}
      var firstCta = document.querySelector("#intro .vc-hero-head a.vc-header-pill");
      if (firstCta && firstCta.className.indexOf("vc-home-cine-cta") < 0) {
        firstCta.className += " vc-home-cine-cta";
      }
      ensureScrollCue();
      initHomeFx();
    } else if (polish) {
      var vote = Boolean(body && body.classList.contains("vc-vote-page"));
      try {
        if (isStaffCinePage()) {
                    bootStaffCineLayout();
          watchStaffCineLayout();
        } else if (isStaffProfileHome()) {
          resetStaffPageCineLayout();
        } else if (isEventoPage()) {
          resetUsersPageCineLayout();
        } else if (shouldSkipPageCineHeroLayout()) {
          resetUsersPageCineLayout();
        } else if (isUsersCommunityPage()) {
          ensureCommunityPageCineLayout();
        } else {
          initPageHeroLayout({ force: true });
          bindInnerHeroScrollFx();
          snapScrollTopIfPristine();
        }
      } catch (eHeroLayout) {
                try {
          markPageCineReady(true);
        } catch (eReady) {}
      }
      try {
        document.documentElement.classList.add("vc-home-motion-ready");
      } catch (eInnerMotion) {}
      if (
        (!shouldSkipPageCineHeroLayout() || isStaffCinePage()) &&
        !vote &&
        !isStaffProfileHome() &&
        !isEventoPage()
      ) {
        try {
          if (!useStaticCineBackground()) {
            initPolishHeroFx();
            if (
              !isCoarse() &&
              !(window.VcPerf && window.VcPerf.isMidOrLite && window.VcPerf.isMidOrLite()) &&
              !(window.VcPerf && window.VcPerf.isLite && window.VcPerf.isLite())
            )
              initPointerTilt();
          }
        } catch (eFx) {}
      }
    }

    if (isAuditBot()) {
            try {
        document.documentElement.classList.add("vc-home-motion-ready");
      } catch (eAuditLive) {}
      try {
        var stageA = ensureStage();
        var canvasA = stageA && stageA.querySelector(".vc-home-cine__canvas");
        if (canvasA && canvasA.getContext) {
          var ctxA = canvasA.getContext("2d", { alpha: false });
          if (ctxA) {
            var wA = Math.max(1, window.innerWidth || 1);
            var hA = Math.max(1, window.innerHeight || 1);
            canvasA.width = wA;
            canvasA.height = hA;
            canvasA.style.width = wA + "px";
            canvasA.style.height = hA + "px";
            ctxA.setTransform(1, 0, 0, 1, 0, 0);
            ctxA.fillStyle = "#100c09";
            ctxA.fillRect(0, 0, wA, hA);
          }
        }
        document.documentElement.classList.add("vc-home-cine-live");
      } catch (eAuditPaint) {}
      markPageCineReady(true);
      return;
    }

    ensureCursorTrailScript();

    if (useStaticCineBackground()) {
      try {
        document.documentElement.classList.add("vc-cine-static-bg", "vc-home-cine-live", "vc-home-motion-ready");
      } catch (eStaticBg) {}
      try {
        ensureStage();
      } catch (eStagePhoto) {}
      // cineNoFlash2: non rivelare il layout piatto — markPageCineReady attende vc-page-cine-layout.
      markPageCineReady(true);
      return;
    }

    var lite = useLiteCanvas();
    var stage = ensureStage();
    var votePage = Boolean(body && body.classList.contains("vc-vote-page"));
    var skipPointerFx = Boolean(
      isCoarse() ||
        isStandalonePwa() ||
        (window.VcPerf && typeof window.VcPerf.isMidOrLite === "function" && window.VcPerf.isMidOrLite()) ||
        (window.VcPerf && typeof window.VcPerf.isLite === "function" && window.VcPerf.isLite()),
    );
    if (!votePage && !skipPointerFx) {
      initCursorSpotlight();
    }

    var canvas = stage.querySelector(".vc-home-cine__canvas");
    if (!canvas || !canvas.getContext) {
      try {
        document.documentElement.classList.add("vc-home-cine-live");
      } catch (eNoCanvas) {}
      markPageCineReady(true);
      return;
    }
    var ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      try {
        document.documentElement.classList.add("vc-home-cine-live");
      } catch (eNoCtx) {}
      markPageCineReady(true);
      return;
    }
    try {
      canvas.style.backgroundColor = "#100c09";
            ctx.fillStyle = "#100c09";
      ctx.fillRect(0, 0, Math.max(1, canvas.width || 1), Math.max(1, canvas.height || 1));
    } catch (eCanvasBg) {}

    var reduced = prefersReduced();
    var coarse = isCoarse();
    var dpr = 1;
    var w = 0;
    var h = 0;
    var raf = 0;
    var running = false;
    var t0 = performance.now();
        var mx = coarse ? 0.5 : 0.72;
    var my = coarse ? 0.56 : 0.28;
    var tx = coarse ? 0.5 : 0.72;
    var ty = coarse ? 0.56 : 0.28;
    var dust = [];

    function spawnDust(n) {
      dust = [];
      for (var i = 0; i < n; i++) {
        dust.push({
          x: Math.random(),
          y: Math.random(),
          z: 0.35 + Math.random() * 0.65,
          s: 0.4 + Math.random() * 1.4,
          v: 0.012 + Math.random() * 0.028,
          drift: (Math.random() - 0.5) * 0.018,
        });
      }
    }

    function resize() {
      var nextW = Math.max(1, window.innerWidth || 1);
      var nextH = Math.max(1, window.innerHeight || 1);
      var dprCap = lite ? 1.05 : 1.35;
      try {
        if (window.VcPerf && window.VcPerf.isLite()) dprCap = 1;
        else if (coarse) dprCap = Math.min(dprCap, 1.1);
      } catch (eDpr) {}
      dpr = Math.min(dprCap, window.devicePixelRatio || 1);
      var nextCw = Math.round(nextW * dpr);
      var nextCh = Math.round(nextH * dpr);
            if (w === nextW && h === nextH && canvas.width === nextCw && canvas.height === nextCh) {
        return false;
      }
      w = nextW;
      h = nextH;
      canvas.width = nextCw;
      canvas.height = nextCh;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var dustN = lite ? (coarse ? 4 : 8) : coarse ? 8 : 18;
      try {
        if (window.VcPerf && window.VcPerf.isLite()) dustN = Math.min(dustN, 2);
      } catch (eDust) {}
      spawnDust(dustN);
      return true;
    }

    function drawVinyl(cx, cy, r, rot, alpha) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.globalAlpha = alpha;
      ctx.rotate(rot);

      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      var disc = ctx.createRadialGradient(-r * 0.22, -r * 0.28, r * 0.08, 0, 0, r);
      disc.addColorStop(0, "#3a281e");
      disc.addColorStop(0.22, "#1a120e");
      disc.addColorStop(0.62, "#0d0907");
      disc.addColorStop(1, "#050403");
      ctx.fillStyle = disc;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(212,168,136,0.22)";
      ctx.lineWidth = Math.max(1, r * 0.012);
      ctx.stroke();

      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.97, 0, Math.PI * 2);
      ctx.clip();
      var step = Math.max(lite || coarse ? 4.2 : 2.4, r * (lite || coarse ? 0.028 : 0.014));
      if (!Number.isFinite(step) || step < 2) step = 2;
      var grooves = 0;
      for (var i = r * 0.22; i < r * 0.96 && grooves < 64; i += step) {
        grooves += 1;
        ctx.beginPath();
        ctx.arc(0, 0, i, 0, Math.PI * 2);
        ctx.strokeStyle = grooves % 2 === 0 ? "rgba(255,244,232,0.045)" : "rgba(0,0,0,0.28)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();

      ctx.rotate(-rot * 0.35);
      ctx.beginPath();
      ctx.ellipse(-r * 0.16, -r * 0.26, r * 0.46, r * 0.16, -0.55, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,244,232,0.07)";
      ctx.fill();

      var labelR = r * 0.19;
      ctx.beginPath();
      ctx.arc(0, 0, labelR, 0, Math.PI * 2);
      var label = ctx.createLinearGradient(-labelR, -labelR, labelR, labelR);
      label.addColorStop(0, "#f3e2d0");
      label.addColorStop(0.45, "#d4a888");
      label.addColorStop(1, "#6f4e37");
      ctx.fillStyle = label;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, labelR, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(80,48,28,0.35)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, 0, r * 0.028, 0, Math.PI * 2);
      ctx.fillStyle = "#070504";
      ctx.fill();
      ctx.restore();
    }

    var paintedOnce = false;
        var targetFps = lite ? 12 : 22;
    try {
      if (window.VcPerf && window.VcPerf.isLite()) targetFps = 10;
      if (coarse) targetFps = Math.min(targetFps, 10);
            if (home && !coarse) targetFps = Math.min(targetFps, 14);
      /* apiJankCut1: mid → fps più bassi + freeze più presto */
      if (
        document.documentElement.classList.contains("vc-perf-mid") ||
        (window.VcPerf && typeof window.VcPerf.isMidOrLite === "function" && window.VcPerf.isMidOrLite())
      ) {
        targetFps = Math.min(targetFps, 18);
      }
    } catch (eFps) {}
    var minFrameMs = 1000 / targetFps;
    var lastFrameAt = 0;
        var lastInputAt = 0;
    var IDLE_FREEZE_MS = coarse ? 700 : lite ? 1800 : home ? 900 : 2800;
    try {
      if (
        document.documentElement.classList.contains("vc-perf-mid") ||
        (window.VcPerf && typeof window.VcPerf.isMidOrLite === "function" && window.VcPerf.isMidOrLite())
      ) {
        IDLE_FREEZE_MS = Math.min(IDLE_FREEZE_MS, home ? 500 : 900);
      }
    } catch (eIdleMs) {}
    var PHONE_AUTO_IDLE_MS = 900;
    var HOME_AUTO_IDLE_MS = 700;
    var resumeTimer = 0;
    var vinylCache = null;
    var vinylCacheR = 0;
    var vinylCacheSize = 0;
    var idleFrozen = false;
    var cineMoQuietUntil = 0;
    var cineSyncBusy = false;
    var cineSyncQueued = 0;

    function setCineIdleClass(on) {
      cineMoQuietUntil = performance.now() + 180;
      cineSyncBusy = true;
      try {
        if (on) document.documentElement.classList.add("vc-cine-idle");
        else document.documentElement.classList.remove("vc-cine-idle");
      } catch (eIdleCls) {
      } finally {
        cineSyncBusy = false;
      }
    }

    function markCineIdleState() {
      setCineIdleClass(true);
      if (paintedOnce) retireLiveCanvasToStatic();
    }

    function afterFirstPaint() {
      if (paintedOnce) return;
      paintedOnce = true;
            lastInputAt = performance.now();
      try {
        document.documentElement.classList.add("vc-home-cine-live");
      } catch (eLiveClass) {}
            if (polish && !document.body.classList.contains("vc-body--home") && typeof window.__vcSitePolishRise === "function") {
        try {
          window.__vcSitePolishRise();
        } catch (eRise) {}
      }
      markPageCineReady(true);
    }

    function ensureVinylCache(r) {
      var need = Math.ceil(r * 2 + 8);
      if (vinylCache && Math.abs(vinylCacheR - r) < 1.5 && vinylCacheSize >= need) return;
      vinylCacheR = r;
      vinylCacheSize = need;
      vinylCache = document.createElement("canvas");
      vinylCache.width = need;
      vinylCache.height = need;
      var vctx = vinylCache.getContext("2d");
      if (!vctx) {
        vinylCache = null;
        return;
      }
      var prev = ctx;
            try {
        ctx = vctx;
        drawVinyl(need / 2, need / 2, r, 0, 1);
      } finally {
        ctx = prev;
      }
    }

    function drawVinylCached(cx, cy, r, rot, alpha) {
      ensureVinylCache(r);
      if (!vinylCache) {
        drawVinyl(cx, cy, r, rot, alpha);
        return;
      }
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.globalAlpha = alpha;
      ctx.drawImage(vinylCache, -vinylCache.width / 2, -vinylCache.height / 2);
      ctx.restore();
    }

    function noteCineInput() {
      lastInputAt = performance.now();
                  if (home && !coarse && paintedOnce) {
        return;
      }
            if (coarse) {
        if (!paintedOnce) {
          if (!running) start();
          return;
        }
        idleFrozen = true;
        setCineIdleClass(true);
        stop();
        if (resumeTimer) {
          try {
            window.clearTimeout(resumeTimer);
          } catch (eClr) {}
          resumeTimer = 0;
        }
        resumeTimer = window.setTimeout(function () {
          resumeTimer = 0;
          if (!pageWantsCine()) return;
          if (performance.now() - lastInputAt < IDLE_FREEZE_MS - 30) return;
          idleFrozen = false;
          setCineIdleClass(false);
          start();
        }, IDLE_FREEZE_MS);
        return;
      }
      if (idleFrozen) {
        idleFrozen = false;
        setCineIdleClass(false);
        start();
      }
    }

    function pageWantsCine() {
      if (document.hidden) return false;
            var skipFocusGate = coarse || isStandalonePwa();
      if (paintedOnce && !skipFocusGate) {
        try {
          if (typeof document.hasFocus === "function" && !document.hasFocus()) return false;
        } catch (eFocus) {}
      }
      if (uiChromeBusy()) return false;
      return true;
    }

    function paintFrame(now, freezeAfter) {
      var t = (now - t0) / 1000;
      mx += (tx - mx) * 0.045;
      my += (ty - my) * 0.045;

      ctx.fillStyle = "#100c09";
      ctx.fillRect(0, 0, w, h);

      var lx = w * (0.42 + (mx - 0.5) * 0.18);
      var ly = h * (0.08 + (my - 0.5) * 0.08);
      var light = ctx.createRadialGradient(lx, ly, 0, lx, ly, Math.max(w, h) * 0.78);
      light.addColorStop(0, "rgba(232,201,168,0.22)");
      light.addColorStop(0.28, "rgba(176,129,96,0.1)");
      light.addColorStop(0.62, "rgba(80,48,28,0.05)");
      light.addColorStop(1, "rgba(8,6,5,0)");
      ctx.fillStyle = light;
      ctx.fillRect(0, 0, w, h);

      var mobile = coarse || w < 900;
            var cx = mobile ? w * 0.5 : w * (0.78 + (mx - 0.5) * 0.04);
      var cy = mobile ? h * 0.52 : h * (0.54 + (my - 0.5) * 0.03);
      var r = mobile ? Math.min(w * 0.84, h * 0.44) : Math.min(w, h) * 0.46;
      var alpha = mobile ? (lite ? 0.66 : 0.72) : lite ? 0.62 : 0.68;
      drawVinylCached(cx, cy, r, t * 0.18, alpha);

      var cupX = mobile ? w * 0.18 : w * 0.18;
      var cupY = mobile ? h * 0.78 : h * 0.78;
      var steam = ctx.createRadialGradient(cupX, cupY, 10, cupX, cupY - h * 0.18, h * 0.28);
      steam.addColorStop(0, "rgba(234,212,187," + (mobile ? "0.07" : "0.14") + ")");
      steam.addColorStop(1, "rgba(234,212,187,0)");
      ctx.fillStyle = steam;
      ctx.fillRect(0, 0, w, h);

      for (var i = 0; i < dust.length; i++) {
        var p = dust[i];
        if (!freezeAfter) {
          p.y -= p.v * p.z * 0.16;
          p.x += p.drift * p.z * 0.08;
          if (p.y < -0.04) {
            p.y = 1.04;
            p.x = Math.random();
          }
          if (p.x < -0.04) p.x = 1.04;
          if (p.x > 1.04) p.x = -0.04;
        }
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, p.s * p.z, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(243,226,208," + (0.12 + p.z * 0.28) + ")";
        ctx.fill();
      }

      var floor = ctx.createLinearGradient(0, h * (mobile ? 0.72 : 0.55), 0, h);
      floor.addColorStop(0, "rgba(8,6,5,0)");
      floor.addColorStop(1, "rgba(8,6,5," + (mobile ? "0.28" : "0.38") + ")");
      ctx.fillStyle = floor;
      ctx.fillRect(0, 0, w, h);

      afterFirstPaint();
    }

    function frame(now) {
      raf = 0;
      if (!running) return;
      if (!pageWantsCine()) {
        stop();
        return;
      }
      if (paintedOnce && lastInputAt && now - lastInputAt >= IDLE_FREEZE_MS) {
        paintFrame(now, true);
        idleFrozen = true;
        cineMoQuietUntil = performance.now() + 120;
        markCineIdleState();
        stop();
        return;
      }
            if (coarse && paintedOnce && now - t0 >= PHONE_AUTO_IDLE_MS) {
        paintFrame(now, true);
        idleFrozen = true;
        cineMoQuietUntil = performance.now() + 120;
        markCineIdleState();
        stop();
        return;
      }
            if (home && !coarse && paintedOnce && now - t0 >= HOME_AUTO_IDLE_MS) {
        paintFrame(now, true);
        idleFrozen = true;
        cineMoQuietUntil = performance.now() + 400;
        markCineIdleState();
        stop();
        return;
      }
      if (lastFrameAt && now - lastFrameAt < minFrameMs) {
        raf = window.requestAnimationFrame(frame);
        return;
      }
      lastFrameAt = now;
      paintFrame(now, false);
      if (!raf) raf = window.requestAnimationFrame(frame);
    }

    function start() {
      if (running) return;
      if (!pageWantsCine()) return;
      if (idleFrozen && performance.now() - lastInputAt >= IDLE_FREEZE_MS) return;
      running = true;
      lastFrameAt = 0;
      if (!paintedOnce) t0 = performance.now();
                  if (!raf) raf = window.requestAnimationFrame(frame);
    }

    function stop() {
      running = false;
      if (raf) {
        window.cancelAnimationFrame(raf);
        raf = 0;
      }
    }

    /* stackFix1: never mutate html class sync inside chrome MO — quiet + rAF */
    function clearCineIdleClass() {
      setCineIdleClass(false);
    }
    function syncRunState() {
      if (cineSyncBusy || performance.now() < cineMoQuietUntil) return;
      if (!pageWantsCine()) {
        if (!paintedOnce) {
          start();
          return;
        }
        stop();
        return;
      }
      if (!paintedOnce || !lastInputAt) {
        start();
        return;
      }
      if (coarse) {
        if (performance.now() - lastInputAt >= IDLE_FREEZE_MS) {
          idleFrozen = false;
          clearCineIdleClass();
          start();
        } else {
          stop();
        }
        return;
      }
      if (performance.now() - lastInputAt < IDLE_FREEZE_MS) {
        idleFrozen = false;
        clearCineIdleClass();
        start();
      }
    }
    function queueSyncRunState() {
      if (cineSyncBusy || performance.now() < cineMoQuietUntil) return;
      if (cineSyncQueued) return;
      cineSyncQueued = window.requestAnimationFrame(function () {
        cineSyncQueued = 0;
        syncRunState();
      });
    }

    resize();
    try {
      ctx.fillStyle = "#100c09";
      ctx.fillRect(0, 0, Math.max(1, w), Math.max(1, h));
    } catch (eBootFill) {}
        try {
      paintFrame(performance.now(), true);
    } catch (eFirstPaint) {}
    start();

    window.addEventListener("resize", function () {
      vinylCache = null;
      vinylCacheR = 0;
      noteCineInput();
      var changed = resize();
      if (paintedOnce && changed) {
        try {
          paintFrame(performance.now(), true);
        } catch (eResizePaint) {}
      }
    });
    document.addEventListener("visibilitychange", syncRunState);
    window.addEventListener("blur", syncRunState);
    window.addEventListener("focus", function () {
      noteCineInput();
      syncRunState();
    });
    window.addEventListener(
      "pointerdown",
      function () {
        noteCineInput();
      },
      { passive: true },
    );
    window.addEventListener(
      "keydown",
      function () {
        noteCineInput();
      },
      { passive: true },
    );
    window.addEventListener(
      "scroll",
      function () {
        noteCineInput();
      },
      { passive: true },
    );
    if (!coarse) {
      window.addEventListener(
        "pointermove",
        function (ev) {
          noteCineInput();
          tx = ev.clientX / Math.max(1, w);
          ty = ev.clientY / Math.max(1, h);
        },
        { passive: true },
      );
    }
    try {
      if (!home && typeof MutationObserver !== "undefined") {
        var chromeObs = new MutationObserver(function () {
          if (cineSyncBusy || performance.now() < cineMoQuietUntil) return;
          queueSyncRunState();
        });
        chromeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      }
    } catch (eObs) {}

    var lastRecoverHomeCineAt = 0;
    var recoverHomeCineBusy = false;
    var wasPageHidden = false;
    function recoverHomeCineSurface(force) {
      if (recoverHomeCineBusy) return;
      var now = performance.now();
      var must = Boolean(force) || wasPageHidden || coarse || isStandalonePwa();
      if (!must && now - lastRecoverHomeCineAt < 3500) return;
      if (must && now - lastRecoverHomeCineAt < 280) return;
      lastRecoverHomeCineAt = now;
      recoverHomeCineBusy = true;
      wasPageHidden = false;
      reviveLiveCanvasFromStatic();
      cineMoQuietUntil = performance.now() + 180;
      cineSyncBusy = true;
      try {
        document.documentElement.classList.add("vc-page-cine-ready");
        document.documentElement.classList.add("vc-home-motion-ready");
        document.documentElement.classList.remove("vc-page-cine-boot");
        document.documentElement.classList.remove("vc-cine-idle");
      } catch (eR) {
      } finally {
        cineSyncBusy = false;
      }
      try {
        var stale = document.querySelectorAll(".vc-home-rise:not(.is-in)");
        var vh = window.innerHeight || 800;
        var max = Math.min(stale.length, 80);
        for (var i = 0; i < max; i++) {
          try {
            if (stale[i].getAttribute("data-vc-body-cascade") === "1" && !window.__vcPageBodyCascadeDone) continue;
            var rr = stale[i].getBoundingClientRect();
            if (force || (rr.top < vh * 0.92 && rr.bottom > 16)) stale[i].classList.add("is-in");
          } catch (eOne) {
            stale[i].classList.add("is-in");
          }
        }
      } catch (eS) {}
      try {
        if (typeof window.__vcUnpinPageScroll === "function") window.__vcUnpinPageScroll();
      } catch (eU) {}
      try {
                idleFrozen = false;
        vinylCache = null;
        vinylCacheR = 0;
        resize();
        paintFrame(performance.now(), true);
        paintedOnce = true;
        if (!document.hidden) start();
      } catch (ePaint) {}
      recoverHomeCineBusy = false;
    }
    window.addEventListener("pageshow", function (ev) {
      recoverHomeCineSurface(Boolean(ev && ev.persisted) || isStandalonePwa());
    });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") {
        wasPageHidden = true;
        return;
      }
      if (document.visibilityState === "visible") {
        recoverHomeCineSurface(true);
      }
    });
    window.addEventListener("focus", function () {
      if (coarse || isStandalonePwa()) recoverHomeCineSurface(true);
    });
    if (home) {
      try {
        var homeStylesRepaintDone = false;
        function repaintAfterHomeGate() {
          if (homeStylesRepaintDone) return;
          if (!document.documentElement.classList.contains("vc-home-styles-ready")) return;
          homeStylesRepaintDone = true;
          window.setTimeout(function () {
            recoverHomeCineSurface(true);
          }, 0);
        }
        var homeStylesObs = new MutationObserver(repaintAfterHomeGate);
        homeStylesObs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
        repaintAfterHomeGate();
      } catch (eHomeGate) {}
      function canvasMaxRedSample() {
        try {
          if (!canvas || !ctx || canvas.width < 2) return 0;
          var cw = canvas.width;
          var ch = canvas.height;
          var pts = [
            [0.78, 0.54],
            [0.72, 0.28],
            [0.38, 0.18],
          ];
          var maxR = 0;
          var pi;
          for (pi = 0; pi < pts.length; pi += 1) {
            var px = Math.floor(cw * pts[pi][0]);
            var py = Math.floor(ch * pts[pi][1]);
            var d = ctx.getImageData(px, py, 1, 1).data;
            if (d[0] > maxR) maxR = d[0];
          }
          return maxR;
        } catch (eSample) {
          return 255;
        }
      }
      function ensureHomeCineVisible() {
        if (!home || useStaticCineBackground()) return;
        if (!paintedOnce) return;
        if (canvasMaxRedSample() > 40) return;
        try {
          recoverHomeCineSurface(true);
        } catch (eRecVis) {}
        window.setTimeout(function () {
          if (canvasMaxRedSample() > 40) return;
          retireLiveCanvasToStatic();
        }, 450);
      }
      window.setTimeout(ensureHomeCineVisible, 2400);
      window.setTimeout(ensureHomeCineVisible, 5200);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  try {
    var parkPhoneTimer = 0;
    window.addEventListener(
      "resize",
      function () {
        window.clearTimeout(parkPhoneTimer);
        parkPhoneTimer = window.setTimeout(parkPhoneHeavyAsideBelow, 120);
      },
      { passive: true }
    );
  } catch (eParkResize) {}

  /* welcomePronouns8 / welcomePronouns9: cache-first + retry; mai lasciare Benvenut* se l’API arriva dopo */
  (function bootWelcomePronounBadge() {
    var DEFAULT_KEY = "home.welcome";
    var DEFAULT_IT = "Benvenut* su";
    var CACHE_KEY = "vc.welcomePronoun.v1";
    var STICKY_KEY = "vc.welcomePronoun.sticky.v1";
    var inflight = 0;
    var lastUid = "";
    var appliedGendered = false;
    var tokenRetryTimer = 0;
    var tokenRetryLeft = 0;
    var fetchAttempted = false;
    var welcomeFetchInFlight = null;
    var welcomeFetchDoneOk = false;
    var bootScheduled = false;
    var rateLimitRetryTimer = 0;
    var rateLimitRetryLeft = 0;

    function welcomeEl() {
      return (
        document.querySelector("#intro .vc-hero-kicker[data-i18n^='home.welcome']") ||
        document.querySelector(".vc-hero-kicker[data-i18n^='home.welcome']")
      );
    }

    function getToken() {
      try {
        if (typeof window.__vcDiscordGetAccessToken === "function") {
          return String(window.__vcDiscordGetAccessToken() || "").trim();
        }
      } catch (e0) {}
      try {
        return String(localStorage.getItem("vc_discord_access_token") || "").trim();
      } catch (e1) {
        return "";
      }
    }

    function isItalian() {
      try {
        if (window.VcI18n && typeof window.VcI18n.getLang === "function") {
          return String(window.VcI18n.getLang() || "it").toLowerCase().indexOf("it") === 0;
        }
      } catch (e) {}
      return true;
    }

    function readLocalCache() {
      try {
        var raw = sessionStorage.getItem(CACHE_KEY);
        if (!raw) raw = localStorage.getItem(STICKY_KEY);
        if (!raw) return null;
        var obj = JSON.parse(raw);
        if (!obj || !obj.i18nKey || !obj.badge) return null;
        if (obj.exp && Number(obj.exp) < Date.now()) return null;
        return obj;
      } catch (e) {
        return null;
      }
    }

    function writeLocalCache(payload, uid) {
      try {
        if (!payload || !payload.ok) return;
        var key = String(payload.i18nKey || "").trim();
        if (key !== "home.welcomeM" && key !== "home.welcomeF") return;
        var entry = {
          userId: String(uid || payload.userId || lastUid || "").trim(),
          i18nKey: key,
          badge: String(payload.badge || "").trim(),
          exp: Date.now() + 30 * 60 * 1000,
        };
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(entry));
        /* chromeStickyAll1: sticky 7g su localStorage — paint immediato al reload */
        localStorage.setItem(
          STICKY_KEY,
          JSON.stringify(Object.assign({}, entry, { exp: Date.now() + 604800000 })),
        );
      } catch (eW) {}
    }

    function clearLocalCache() {
      try {
        sessionStorage.removeItem(CACHE_KEY);
      } catch (eC) {}
      try {
        localStorage.removeItem(STICKY_KEY);
      } catch (eC2) {}
    }

    function clearTokenRetry() {
      try {
        window.clearTimeout(tokenRetryTimer);
      } catch (e) {}
      tokenRetryTimer = 0;
      tokenRetryLeft = 0;
    }

    function clearRateLimitRetry() {
      try {
        window.clearTimeout(rateLimitRetryTimer);
      } catch (eRl) {}
      rateLimitRetryTimer = 0;
      rateLimitRetryLeft = 0;
    }

    function scheduleRateLimitRetry(uid) {
      var id = String(uid || lastUid || "pending").trim() || "pending";
      if (appliedGendered || welcomeFetchDoneOk) return;
      if (rateLimitRetryLeft <= 0) rateLimitRetryLeft = 10;
      if (rateLimitRetryTimer) return;
      rateLimitRetryTimer = window.setTimeout(function () {
        rateLimitRetryTimer = 0;
        rateLimitRetryLeft -= 1;
        if (appliedGendered || welcomeFetchDoneOk) {
          clearRateLimitRetry();
          return;
        }
        if (getToken()) {
          fetchWelcomePronouns(id, { fresh: true, animate: true, force: true });
        }
        if (!appliedGendered && !welcomeFetchDoneOk && rateLimitRetryLeft > 0) {
          scheduleRateLimitRetry(id);
        }
      }, 450);
    }

    function scheduleTokenRetry(uid) {
      var id = String(uid || lastUid || "").trim();
      if (!id) return;
      if (tokenRetryLeft <= 0) tokenRetryLeft = 28;
      if (tokenRetryTimer) return;
      tokenRetryTimer = window.setTimeout(function () {
        tokenRetryTimer = 0;
        tokenRetryLeft -= 1;
        if (getToken()) {
          clearTokenRetry();
          fetchWelcomePronouns(id, { fresh: false });
          return;
        }
        if (tokenRetryLeft > 0) scheduleTokenRetry(id);
      }, 120);
    }

    function playHack(el, text) {
      /* kickerNoHack1: niente scramble — reveal diretto */
      if (!el || !text) return;
      try {
        el.removeAttribute("data-vc-hack-seen");
        el.removeAttribute("data-vc-hack-done");
        el.removeAttribute("data-vc-hack-waiting");
        el.removeAttribute("data-vc-welcome-hold");
        el.setAttribute("data-vc-hack-final", text);
        el.style.removeProperty("opacity");
        el.style.removeProperty("visibility");
      } catch (eAttr) {}
      try {
        if (window.VcKickerHack && typeof window.VcKickerHack.revealWelcome === "function") {
          window.VcKickerHack.revealWelcome(el, text);
          return;
        }
        if (window.VcKickerHack && typeof window.VcKickerHack.play === "function") {
          window.VcKickerHack.play(el, { text: text, force: true, scramble: false, delayMs: 0 });
          return;
        }
      } catch (ePlay) {}
      try {
        el.textContent = text;
      } catch (eTxt) {}
    }

    function notifyReady(el, text, key) {
      if (!el) return;
      try {
        el.setAttribute("data-vc-welcome-pronoun-ready", "1");
        el.setAttribute("data-vc-welcome-from-api", "1");
        el.setAttribute("data-i18n-src", text);
      } catch (eReady) {}
      try {
        if (window.VcKickerHack && typeof window.VcKickerHack.rememberFinal === "function") {
          window.VcKickerHack.rememberFinal(el, text);
        }
      } catch (eHack) {}
      try {
        document.dispatchEvent(
          new CustomEvent("vc:welcome-pronoun-ready", {
            detail: { el: el, text: text, key: key },
          }),
        );
      } catch (eEv) {}
    }

    function setBadge(i18nKey, fallbackText, opts) {
      var el = welcomeEl();
      if (!el) return;
      opts = opts || {};
      var key = String(i18nKey || DEFAULT_KEY).trim() || DEFAULT_KEY;
      var curPronoun = "";
      try {
        curPronoun = String(el.getAttribute("data-vc-welcome-pronoun") || "").trim();
      } catch (eCur) {}
      var curGendered = curPronoun === "home.welcomeM" || curPronoun === "home.welcomeF";
      var nextGendered = key === "home.welcomeM" || key === "home.welcomeF";
      /* welcomePronouns6: never downgrade a gendered result (API or event) to Benvenut* */
      if (appliedGendered && curGendered && !nextGendered) {
        return;
      }
      if (
        !nextGendered &&
        el.getAttribute("data-vc-welcome-pronoun-ready") === "1" &&
        curGendered
      ) {
        return;
      }
      el.setAttribute("data-i18n", key);
      var text = String(fallbackText || "").trim() || DEFAULT_IT;
      if (!opts.fromApi) {
        try {
          if (window.VcI18n && typeof window.VcI18n.t === "function") {
            var translated = window.VcI18n.t(key);
            if (translated) text = translated;
          }
        } catch (eT) {}
      } else if (!isItalian()) {
        try {
          if (window.VcI18n && typeof window.VcI18n.t === "function") {
            text = window.VcI18n.t(key) || window.VcI18n.t(DEFAULT_KEY) || text;
          }
        } catch (eEn) {}
      }
      if (!isItalian() && key !== DEFAULT_KEY && !opts.fromApi) {
        try {
          if (window.VcI18n && typeof window.VcI18n.t === "function") {
            text = window.VcI18n.t(DEFAULT_KEY) || text;
          }
          el.setAttribute("data-i18n", DEFAULT_KEY);
          key = DEFAULT_KEY;
        } catch (eEn2) {}
      }
      el.setAttribute("data-vc-welcome-pronoun", key);
      try {
        el.setAttribute("data-vc-hack-final", text);
      } catch (eFinal) {}
      if (opts.fromApi && (key === "home.welcomeM" || key === "home.welcomeF")) {
        appliedGendered = true;
      }
      /* kickerNoHack1: no hacking; testo solo quando pronomi certi (M/F) o guest */
      var genderedOk = key === "home.welcomeM" || key === "home.welcomeF";
      if (opts.fromApi && opts.resolved && genderedOk) {
        notifyReady(el, text, key);
        playHack(el, text);
      } else if (opts.guest === true) {
        try {
          el.setAttribute("data-vc-welcome-guest", "1");
        } catch (eGuest) {}
        notifyReady(el, text, key);
        playHack(el, text);
      } else {
        /* in attesa API: nascondi, niente Benvenut* / scramble */
        try {
          el.textContent = "";
          el.setAttribute("data-vc-welcome-hold", "1");
          el.style.setProperty("opacity", "0", "important");
          el.style.setProperty("visibility", "hidden", "important");
          if (!(appliedGendered && genderedOk)) {
            el.removeAttribute("data-vc-welcome-pronoun-ready");
            el.removeAttribute("data-vc-welcome-from-api");
          }
        } catch (eClr) {}
      }
    }

    function resetBadge(opts) {
      opts = opts || {};
      if (!opts.keepUid) lastUid = "";
      appliedGendered = false;
      fetchAttempted = false;
      welcomeFetchDoneOk = false;
      welcomeFetchInFlight = null;
      clearTokenRetry();
      clearRateLimitRetry();
      clearLocalCache();
      setBadge(DEFAULT_KEY, DEFAULT_IT, { fromApi: false, guest: !getToken(), resolved: !getToken() });
    }

    function applyFromApi(data, opts) {
      opts = opts || {};
      if (!data || !data.ok) {
        if (appliedGendered) return;
        /* kickerNoHack1: in attesa retry → hold nascosto (no Benvenut* / no hack) */
        setBadge(DEFAULT_KEY, DEFAULT_IT, {
          fromApi: false,
          resolved: false,
          animate: false,
        });
        if (getToken()) scheduleRateLimitRetry(lastUid || "pending");
        return;
      }
      clearRateLimitRetry();
      var key = String(data.i18nKey || DEFAULT_KEY).trim() || DEFAULT_KEY;
      var text = String(data.badge || DEFAULT_IT).trim() || DEFAULT_IT;
      writeLocalCache(data, data.userId || lastUid);
      var same =
        appliedGendered &&
        welcomeEl() &&
        welcomeEl().getAttribute("data-vc-welcome-pronoun") === key &&
        String(welcomeEl().getAttribute("data-vc-hack-final") || "").trim() === text;
      var wasInclusive = false;
      try {
        var curKey = welcomeEl() && welcomeEl().getAttribute("data-vc-welcome-pronoun");
        wasInclusive = !curKey || curKey === DEFAULT_KEY || curKey === "home.welcome";
      } catch (eInc) {}
      var provisional = opts.provisional === true || String(data.source || "").trim() === "fallback";
      setBadge(key, text, {
        fromApi: true,
        /* fallback inclusivo: mostra ma non lockare ready */
        resolved: !provisional || key === "home.welcomeM" || key === "home.welcomeF",
        /* always animate when upgrading from Benvenut* → gendered */
        animate: opts.animate !== false && !opts.silent && (!same || wasInclusive),
      });
    }

    function fetchWelcomePronouns(uid, opts) {
      opts = opts || {};
      var token = getToken();
      if (!token) {
        scheduleTokenRetry(uid);
        return;
      }
      clearTokenRetry();
      /* consoleStorm2: single-flight + skip if already resolved (CF 1015) */
      if (welcomeFetchInFlight && !opts.fresh) return welcomeFetchInFlight;
      if (welcomeFetchDoneOk && appliedGendered && !opts.force && !opts.fresh) return;
      fetchAttempted = true;
      var seq = ++inflight;
      var ac = typeof AbortController !== "undefined" ? new AbortController() : null;
      var tid = setTimeout(function () {
        try {
          if (ac) ac.abort();
        } catch (eAb) {}
      }, opts.fresh ? 8000 : 4500);
      var qs = opts.fresh ? "?fresh=1" : "";
      welcomeFetchInFlight = fetch("/webhooks/site-welcome-pronouns" + qs, {
        method: "GET",
        headers: {
          Authorization: "Bearer " + token,
          Accept: "application/json",
        },
        credentials: "omit",
        signal: ac ? ac.signal : undefined,
      })
        .then(function (r) {
          if (r && r.status === 429) {
            welcomeFetchDoneOk = false;
            scheduleRateLimitRetry(uid);
            return { ok: false, error: "rate_limited", soft: true };
          }
          return r.json().catch(function () {
            return null;
          });
        })
        .then(function (data) {
          if (seq !== inflight) return;
          var uidNow = String(uid || "").trim();
          if (uidNow && uidNow !== "pending" && lastUid && uidNow !== lastUid) return;
          if (data && data.ok && data.userId) {
            lastUid = String(data.userId);
          }
          /* authDiscordSticky1: source=fallback (ruoli Discord non arrivati) ≠ risolto —
             altrimenti Benvenut* si “chiude” e non ritenta quando l’API riparte */
          var provisionalFallback =
            data &&
            data.ok &&
            String(data.source || "").trim() === "fallback" &&
            String(data.i18nKey || "") === "home.welcome";
          if (data && data.ok && !provisionalFallback) welcomeFetchDoneOk = true;
          else if (provisionalFallback) welcomeFetchDoneOk = false;
          if (data && data.error === "rate_limited") {
            applyFromApi(null, { animate: false });
            return;
          }
          applyFromApi(data, {
            animate: opts.animate !== false,
            silent: opts.silent === true,
            provisional: provisionalFallback === true,
          });
          if (provisionalFallback && getToken()) {
            scheduleRateLimitRetry(lastUid || uid || "pending");
          }
          /* background revalidate once if we used cache */
          if (!opts.fresh && data && data.ok && data.cached) {
            window.setTimeout(function () {
              fetchWelcomePronouns(lastUid || uid, { fresh: true, silent: true, animate: false, force: true });
            }, 2500);
          }
        })
        .catch(function () {
          if (seq !== inflight) return;
          if (appliedGendered) return;
          if (!opts.fresh) {
            fetchWelcomePronouns(uid, { fresh: true, animate: true, force: true });
            return;
          }
          /* welcomePronouns9: network fail — keep inclusive unlocked */
          setBadge(DEFAULT_KEY, DEFAULT_IT, { fromApi: false, resolved: false, animate: false });
          scheduleRateLimitRetry(uid);
        })
        .finally(function () {
          welcomeFetchInFlight = null;
          try {
            clearTimeout(tid);
          } catch (eCl) {}
        });
      return welcomeFetchInFlight;
    }

    function onProfile(user) {
      var uid = String((user && user.id) || "").trim();
      if (!uid) {
        resetBadge();
        return;
      }
      lastUid = uid;
      var cached = readLocalCache();
      if (
        cached &&
        (!cached.userId || cached.userId === uid) &&
        (cached.i18nKey === "home.welcomeM" || cached.i18nKey === "home.welcomeF")
      ) {
        applyFromApi(
          { ok: true, userId: uid, i18nKey: cached.i18nKey, badge: cached.badge },
          { animate: true },
        );
        fetchWelcomePronouns(uid, { fresh: false, silent: true, animate: false });
        return;
      }
      fetchWelcomePronouns(uid, { fresh: false, animate: true });
    }

    function paintStickyWelcomeNow() {
      try {
        if (!getToken()) return false;
        var cached = readLocalCache();
        if (!cached || (cached.i18nKey !== "home.welcomeM" && cached.i18nKey !== "home.welcomeF"))
          return false;
        if (!welcomeEl()) return false;
        if (cached.userId) lastUid = String(cached.userId);
        applyFromApi(
          {
            ok: true,
            userId: cached.userId || lastUid || "pending",
            i18nKey: cached.i18nKey,
            badge: cached.badge,
            source: "sticky",
          },
          { animate: false, silent: true },
        );
        return true;
      } catch (eSticky) {
        return false;
      }
    }

    function bootFromExisting() {
      /* violPass12 + violKill3: idle — evita setTimeout Violation ~150–350ms */
      var runBoot = function () {
        try {
          paintStickyWelcomeNow();
        } catch (ePaint) {}
        try {
          if (window.__VC_DISCORD_PROFILE && window.__VC_DISCORD_PROFILE.id) {
            onProfile(window.__VC_DISCORD_PROFILE);
            return;
          }
        } catch (e0) {}
        if (!getToken()) {
          if (!appliedGendered) setBadge(DEFAULT_KEY, DEFAULT_IT, { fromApi: false, guest: true, resolved: true });
          return;
        }
        if (welcomeFetchDoneOk && appliedGendered) return;
        var cached = readLocalCache();
        if (cached && (cached.i18nKey === "home.welcomeM" || cached.i18nKey === "home.welcomeF")) {
          if (cached.userId) lastUid = String(cached.userId);
          applyFromApi(
            {
              ok: true,
              userId: cached.userId || lastUid || "pending",
              i18nKey: cached.i18nKey,
              badge: cached.badge,
              source: "sticky",
            },
            { animate: !appliedGendered },
          );
        }
        window.setTimeout(function () {
          try {
            fetchWelcomePronouns(lastUid || "pending", { fresh: false, animate: !appliedGendered });
          } catch (eF) {}
        }, 0);
      };
      /* violKillIdle2: boot welcome spezzato */
      window.setTimeout(function () {
        try {
          if (document.hidden) return;
          runBoot();
        } catch (eBoot) {}
      }, 0);
    }

    document.addEventListener("vc:welcome-pronoun-ready", function (ev) {
      try {
        var key = String((ev && ev.detail && ev.detail.key) || "").trim();
        if (key === "home.welcomeM" || key === "home.welcomeF") {
          appliedGendered = true;
        }
      } catch (eMark) {}
    });

    window.addEventListener("vc-discord-profile", function (ev) {
      /* violKill1: onProfile fuori dal handler sync (~200ms Violation) */
      var detail = ev && ev.detail ? ev.detail.user : null;
      var run = function () {
        try {
          onProfile(detail);
        } catch (e) {
          if (!appliedGendered) setBadge(DEFAULT_KEY, DEFAULT_IT, { fromApi: false, guest: !getToken(), resolved: !getToken() });
        }
      };
      /* violKillIdle2: onProfile deferred + skip hidden */
      window.setTimeout(function () {
        try {
          if (document.hidden) return;
          run();
        } catch (eProf) {}
      }, 0);
    });
    window.addEventListener("vc:auth-logout", function () {
      resetBadge();
    });
    document.addEventListener("vc:langchange", function () {
      welcomeFetchDoneOk = false;
      if (lastUid) {
        fetchWelcomePronouns(lastUid, { fresh: false, animate: true, force: true });
        return;
      }
      try {
        if (window.__VC_DISCORD_PROFILE && window.__VC_DISCORD_PROFILE.id) {
          onProfile(window.__VC_DISCORD_PROFILE);
          return;
        }
      } catch (eL) {}
      if (!getToken() && !appliedGendered) {
        setBadge(DEFAULT_KEY, DEFAULT_IT, { fromApi: false, guest: true, resolved: true });
      }
    });

    try {
      paintStickyWelcomeNow();
    } catch (eEarlySticky) {}
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", bootFromExisting);
    } else {
      bootFromExisting();
    }
    /* welcomePronouns8: più retry token + un secondo boot tardi */
    if (!bootScheduled) {
      bootScheduled = true;
      window.setTimeout(bootFromExisting, 900);
      window.setTimeout(bootFromExisting, 2400);
    }
  })();
})();
/* welcomePronouns9 */
/* chromeStickyAll1 */
/* violKill1 */
/* violKillCue2 */
/* violKillReflow2 */
/* extOnlyFix1 */
/* violPass10 */
/* violPass12 */
/* scrollCueNoFollow1 */
/* scrollCueInstantHide1 */
/* scrollCueBoardsKeep1 */
/* bootUiCueBar1 */
/* boardsScrollCuePhone1 */

/* boardsCineRestore2 */
/* schedaBootCue1 */

/* cueKeep1 */

/* cueMarginBar1 */
