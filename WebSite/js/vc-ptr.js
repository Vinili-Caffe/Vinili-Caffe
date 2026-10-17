(function () {
  /* ptrSheetGuard2 + phoneSheetPtrLock1 + ptrAriaModalFix1:
     block PTR only when overlays are actually open — never because
     #vc-mobile-nav-drawer sits in the DOM with aria-modal. */
  /* cursorTrailOff1: scia rimossa — lagga troppo su tutte le pagine */
  /* loadRestoreAfterBar1: finalize Y solo post unlock barra */
  /* confPtrAnim1: se un vecchio ptr ha già booted, aggiorna comunque CSS/overscroll */
  var __vcPtrAlreadyBooted = Boolean(window.__vcPtrBooted);
  window.__vcPtrBooted = true;
  /* ptrScrollRestore1: non far sovrascrivere VER da uno stamp vecchio reiniettato dopo */
  try {
    var __vcPtrIncoming = "20261017ptrVinylCue1";
    var __vcPtrPrev = String(window.__VC_PTR_VER || "");
    if (
      !__vcPtrPrev ||
      __vcPtrPrev < __vcPtrIncoming ||
      __vcPtrPrev.indexOf("ptrScroll") >= 0 ||
      __vcPtrPrev.indexOf("ptrPcSpin1") >= 0 ||
      __vcPtrPrev.indexOf("ptrCardDesktop1") >= 0
    ) {
      window.__VC_PTR_VER = __vcPtrIncoming;
    }
  } catch (eVerKeep) {
    window.__VC_PTR_VER = "20261017ptrVinylCue1";
  }

  var PTR_KEY = "vc_ptr_reload_v1";
  var SCROLL_KEY = "vc_ptr_scroll_v1";
  var THRESHOLD = 62;
  var MAX_PULL = 118;
  var tracking = false;
  var armed = false;
  var refreshing = false;
  var startY = 0;
  var startX = 0;
  var pullY = 0;
  var root = null;
  var hintEl = null;
  var reducedMotion = false;
  var watchdog = 0;
  var reloadTimer = 0;
  var holdMax = 0;
  var suppressClickUntil = 0;
  /* ptrCardDesktop1: max pull visto nel gesto — serve a sopprimere click su card/link dopo tirata */
  var peakPullY = 0;
  /* ptrPcSpin1: rAF spin durante is-refreshing — immune a animation-play-state:paused su * (boot PC) */
  var refreshSpinRaf = 0;
  var refreshSpinAngle = 0;

  function pagePath() {
    /* boardsScrollPath1: su /bacheca ignore query volatile */
    var path = String(window.location.pathname || "") || "/";
    if (path.length > 1 && path.charAt(path.length - 1) === "/") path = path.slice(0, -1);
    if (/^\/bacheca(\/|$)/i.test(path)) return path || "/";
    var p = path + String(window.location.search || "");
    if (p.length > 1 && p.charAt(p.length - 1) === "/") p = p.slice(0, -1);
    return p || "/";
  }

  function pathMatches(saved) {
    var cur = pagePath();
    if (!saved) return false;
    if (saved === cur) return true;
    try {
      var sp = String(saved).split("?")[0];
      if (sp.length > 1 && sp.charAt(sp.length - 1) === "/") sp = sp.slice(0, -1);
      var cp = String(cur).split("?")[0];
      if (cp.length > 1 && cp.charAt(cp.length - 1) === "/") cp = cp.slice(0, -1);
      return sp === cp;
    } catch (ePm) {
      return false;
    }
  }

  function saveScrollForReload() {
    try {
      var y =
        window.pageYOffset ||
        (document.documentElement && document.documentElement.scrollTop) ||
        (document.body && document.body.scrollTop) ||
        0;
      y = Math.max(0, Math.round(Number(y) || 0));
      if (y < 2) {
        try {
          var prevRaw =
            sessionStorage.getItem("vc_scroll_restore_anchor_v1") ||
            sessionStorage.getItem(SCROLL_KEY);
          if (prevRaw) {
            var prev = JSON.parse(prevRaw);
            if (prev && pathMatches(prev.p) && Number(prev.y) >= 2) {
              var age = Date.now() - (Number(prev.t) || 0);
              if (age >= 0 && age < 4000) y = Math.round(Number(prev.y) || 0);
            }
          }
        } catch (eKeep) {}
      }
      if (y < 2) return;
      var maxSave = 0;
      try {
        var docS = document.documentElement;
        var vhS = window.innerHeight || (docS && docS.clientHeight) || 0;
        maxSave = Math.max(
          0,
          Math.round(
            Math.max(
              (docS && docS.scrollHeight) || 0,
              (document.body && document.body.scrollHeight) || 0,
            ) - vhS,
          ),
        );
      } catch (eMaxS) {}
      try {
        window.__vcPtrRestoreMaxY = maxSave;
      } catch (eMx) {}
      sessionStorage.setItem(
        SCROLL_KEY,
        JSON.stringify({ p: pagePath(), y: y, max: maxSave, t: Date.now() }),
      );
    } catch (eSave) {}
  }

  function cleanupScrollRestore() {
    try {
      window.__vcPtrRestoreDone = true;
    } catch (eDone) {}
    try {
      sessionStorage.removeItem(SCROLL_KEY);
    } catch (eRm) {}
    try {
      sessionStorage.removeItem("vc_scroll_restore_anchor_v1");
    } catch (eRmA) {}
    try {
      delete window.__vcPtrRestoreY;
    } catch (eDel) {}
    try {
      delete window.__vcViewStateRestoreY;
    } catch (eDelVs) {}
    try {
      delete window.__vcPtrRestoreTargetY;
    } catch (eDelT) {}
    try {
      document.documentElement.removeAttribute("data-vc-ptr-restore-y");
    } catch (eAttr) {}
    try {
      window.__vcPtrRestoreArmed = false;
    } catch (eArm) {}
    try {
      if (window.__vcPtrRestoreMo) {
        window.__vcPtrRestoreMo.disconnect();
        window.__vcPtrRestoreMo = null;
      }
    } catch (eMo) {}
    try {
      document.documentElement.classList.remove("vc-ptr-scroll-restore-pending");
      document.documentElement.classList.remove("vc-scroll-reload-top-lock");
    } catch (eCls) {}
    var css = document.getElementById("vc-ptr-scroll-restore-css");
    if (css && css.parentNode) css.parentNode.removeChild(css);
    var topLockCss = document.getElementById("vc-scroll-reload-top-lock-css");
    if (topLockCss && topLockCss.parentNode) topLockCss.parentNode.removeChild(topLockCss);
    var body = document.body;
    if (body) {
      body.style.removeProperty("position");
      body.style.removeProperty("top");
      body.style.removeProperty("left");
      body.style.removeProperty("right");
      body.style.removeProperty("width");
      body.style.removeProperty("margin");
    }
  }

  function peekSavedScrollY() {
    /* ptrScrollRestore1: leggi Y da session anche se boot non ha ancora idratato __vcPtrRestoreY */
    try {
      var raw =
        sessionStorage.getItem("vc_scroll_restore_anchor_v1") ||
        sessionStorage.getItem(SCROLL_KEY) ||
        sessionStorage.getItem("vc_view_state_v1");
      if (!raw) return 0;
      var data = JSON.parse(raw);
      if (!data || !pathMatches(data.p)) return 0;
      var y = Math.max(0, Math.round(Number(data.y) || 0));
      if (y < 2) return 0;
      var at = Number(data.t) || 0;
      if (at && Date.now() - at > 45 * 60 * 1000) return 0;
      try {
        var mx = Math.max(0, Math.round(Number(data.max) || 0));
        if (mx >= 2) window.__vcPtrRestoreMaxY = mx;
      } catch (eMx) {}
      return y;
    } catch (ePeek) {
      return 0;
    }
  }

  function hydrateScrollRestoreTarget() {
    try {
      if (Number(window.__vcPtrRestoreY || 0) >= 2) return Number(window.__vcPtrRestoreY);
      if (Number(window.__vcPtrRestoreTargetY || 0) >= 2) return Number(window.__vcPtrRestoreTargetY);
      var attr = document.documentElement.getAttribute("data-vc-ptr-restore-y");
      var attrY = Math.max(0, Number(attr || 0) || 0);
      if (attrY >= 2) {
        window.__vcPtrRestoreY = attrY;
        window.__vcPtrRestoreTargetY = attrY;
        return attrY;
      }
      var y = peekSavedScrollY();
      if (y >= 2) {
        window.__vcPtrRestoreY = y;
        window.__vcPtrRestoreTargetY = y;
        window.__vcViewStateRestoreY = y;
        try {
          document.documentElement.setAttribute("data-vc-ptr-restore-y", String(y));
        } catch (eA) {}
        return y;
      }
    } catch (eHyd) {}
    return 0;
  }

  function hasActiveScrollRestoreTarget() {
    try {
      if (window.__vcPtrRestoreDone) return false;
      if (window.__vcDiscardScrollRestore) return false;
      if (window.__vcPtrRestoreUnpinStarted) return true;
      if (document.documentElement.classList.contains("vc-ptr-scroll-restore-pending")) return true;
      if (Number(window.__vcPtrRestoreY || 0) >= 2) return true;
      if (Number(window.__vcViewStateRestoreY || 0) >= 2) return true;
      if (Number(window.__vcPtrRestoreTargetY || 0) >= 2) return true;
      var attr = document.documentElement.getAttribute("data-vc-ptr-restore-y");
      if (Math.max(0, Number(attr || 0) || 0) >= 2) return true;
      if (sessionStorage.getItem(PTR_KEY) === "1") return true;
      /* ptrScrollRestore1: SCROLL_KEY conta — altrimenti finalize wipeva lo Y e restavi in alto */
      if (hydrateScrollRestoreTarget() >= 2) return true;
    } catch (eHas) {}
    return false;
  }

  function markRestoredStickyY(y) {
    /* ptrVinylCue1: sticky Y sopravvive al cleanup — evita hard-top/pinFreeze → 0 */
    y = Math.max(0, Math.round(Number(y) || 0));
    if (y < 2) return;
    try {
      window.__vcRestoredScrollStickyY = y;
      window.__vcRestoredScrollStickyAt = Date.now();
      window.__vcCachedScrollY = y;
    } catch (eSt) {}
  }

  function applyScrollYOnce(y) {
    y = Math.max(0, Math.round(Number(y) || 0));
    if (y < 2) return;
    try {
      /* loadRestoreAfterBar1: mai mid-load */
      if (chromeVisualBusy()) return;
      /* bootStayTop2: sipario su → MAI restore mid/footer */
      var rootA = document.documentElement;
      if (
        rootA.classList.contains("vc-page-cine-boot") &&
        !rootA.classList.contains("vc-page-cine-ready")
      ) {
        return;
      }
      /* homeBootTop1: MAI scrollTo oltre max — browser clampa in fondo (footer) */
      var maxY = maxPageScrollY();
      if (maxY < 64 && y > 64) return;
      if (maxY >= 2 && y > maxY + 24) return;
    } catch (eMax) {}
    try {
      window.scrollTo(0, y);
      if (document.documentElement) document.documentElement.scrollTop = y;
      if (document.body) document.body.scrollTop = y;
      markRestoredStickyY(y);
    } catch (eScr) {}
  }

  function pageScrollY() {
    return (
      window.pageYOffset ||
      (document.documentElement && document.documentElement.scrollTop) ||
      (document.body && document.body.scrollTop) ||
      0
    );
  }

  function maxPageScrollY() {
    var doc = document.documentElement;
    var body = document.body;
    var h = Math.max(
      doc ? doc.scrollHeight || 0 : 0,
      body ? body.scrollHeight || 0 : 0,
    );
    /* boardsScrollRestore1: con top-lock (max-height:100dvh) scrollHeight è finto ≈ viewport.
       Misura i figli del body / root bacheca per l'altezza reale del contenuto. */
    try {
      var locked =
        doc &&
        (doc.classList.contains("vc-scroll-reload-top-lock") ||
          doc.classList.contains("vc-ptr-scroll-restore-pending"));
      if (locked && body && body.children) {
        var total = 0;
        for (var i = 0; i < body.children.length; i++) {
          var el = body.children[i];
          if (!el || !el.getBoundingClientRect) continue;
          try {
            var tag = String(el.tagName || "").toLowerCase();
            if (tag === "script" || tag === "style" || tag === "link") continue;
            var top = Number(el.offsetTop || 0);
            var eh = Math.max(Number(el.scrollHeight || 0), Number(el.offsetHeight || 0));
            if (top + eh > total) total = top + eh;
          } catch (eEl) {}
        }
        h = Math.max(h, total);
      }
      var boards = document.getElementById("vc-boards-root");
      if (boards) {
        var br = boards.getBoundingClientRect();
        var by =
          (br && typeof br.top === "number" ? br.top : 0) +
          (window.pageYOffset || (doc && doc.scrollTop) || 0);
        h = Math.max(
          h,
          by + Math.max(Number(boards.scrollHeight || 0), Number(boards.offsetHeight || 0)) + 64,
        );
      }
    } catch (eH) {}
    var vh = window.innerHeight || (doc && doc.clientHeight) || 0;
    return Math.max(0, h - vh);
  }

  function pinScrollRestore(y) {
    try {
      document.documentElement.classList.add("vc-ptr-scroll-restore-pending");
      var body = document.body;
      if (body) {
        body.style.setProperty("position", "fixed", "important");
        body.style.setProperty("top", "-" + y + "px", "important");
        body.style.setProperty("left", "0", "important");
        body.style.setProperty("right", "0", "important");
        body.style.setProperty("width", "100%", "important");
      }
    } catch (ePin) {}
  }

  function unpinScrollRestore() {
    try {
      document.documentElement.classList.remove("vc-ptr-scroll-restore-pending");
      var body = document.body;
      if (body) {
        body.style.removeProperty("position");
        body.style.removeProperty("top");
        body.style.removeProperty("left");
        body.style.removeProperty("right");
        body.style.removeProperty("width");
        body.style.removeProperty("margin");
      }
    } catch (eUn) {}
  }

  function chromeVisualBusy() {
    try {
      if (window.__vcChromeVisualReady) return false;
      var root = document.documentElement;
      if (root.classList.contains("vc-chrome-bar-loading")) return true;
      var wrap = document.getElementById("vc-site-progress");
      if (wrap && wrap.classList.contains("is-loading")) return true;
      if (window.__vcChromeLoadDone === false) return true;
      /* site polish: aspetta unlock barra (fallback ~5.2s) */
      if (root.classList.contains("vc-site-polish") && !window.__vcChromeForceUnlockAt) {
        var navStart = 0;
        try {
          navStart =
            (performance.timing && performance.timing.navigationStart) ||
            Number(performance.timeOrigin) ||
            0;
        } catch (eNs) {}
        if (!navStart || Date.now() - navStart < 5200) return true;
      }
    } catch (eBusy) {}
    return false;
  }

  function pageReadyForScrollRestore() {
    try {
      var root = document.documentElement;
      if (root.classList.contains("vc-loader-blocking-live")) return false;
      if (root.classList.contains("vc-loading-scroll-lock")) return false;
      if (root.classList.contains("vc-interaction-hold")) return false;
      if (root.classList.contains("vc-chrome-bar-loading")) return false;
      if (chromeVisualBusy()) return false;
      if (root.classList.contains("vc-session-verify-pending")) return false;
      if (root.classList.contains("vc-user-leader-pending")) return false;
      if (root.classList.contains("vc-user-profile-pending")) return false;
      if (root.classList.contains("vc-rank-customize-pending")) return false;
      if (
        root.classList.contains("vc-page-cine-boot") &&
        !root.classList.contains("vc-page-cine-ready")
      ) {
        return false;
      }
      /* aspetta sipario giù — altrimenti landBootScrollAfterReveal azzera e combattono */
      if (
        root.classList.contains("vc-page-cine-boot") &&
        !root.classList.contains("vc-cine-curtain-off")
      ) {
        return false;
      }
      /* boardsScrollPath1: aspetta render async lista/wizard */
      try {
        if (
          document.body &&
          document.body.classList.contains("vc-boards-page") &&
          !window.__vcBoardsContentReady
        ) {
          return false;
        }
      } catch (eBd) {}
      if (root.classList.contains("vc-page-cine-ready")) return true;
      if (document.readyState === "complete") return true;
      return document.readyState === "interactive" && !root.classList.contains("vc-page-cine-boot");
    } catch (eReady) {
      return document.readyState === "complete";
    }
  }

  function finalizeScrollRestore() {
    /* scrollReloadNoBounce3: UN solo handoff dopo unlock — zero soft-retry / zero re-scroll */
    /* ptrScrollRestore1: se Done è spoof (y ancora 0) ma target vivo → riprova */
    try {
      if (window.__vcPtrRestoreDone) {
        var wantChk = Math.max(
          0,
          Math.round(Number(window.__vcPtrRestoreTargetY) || 0),
          Math.round(Number(window.__vcPtrRestoreY) || 0),
          Math.round(hydrateScrollRestoreTarget() || 0),
        );
        var curChk = pageScrollY();
        if (wantChk >= 2 && Math.abs(curChk - wantChk) > 120 && !window.__vcDiscardScrollRestore) {
          window.__vcPtrRestoreDone = false;
          window.__vcPtrRestoreUnpinStarted = false;
        } else {
          return;
        }
      }
    } catch (eDoneGate) {
      if (window.__vcPtrRestoreDone || window.__vcPtrRestoreUnpinStarted) return;
    }
    if (window.__vcPtrRestoreUnpinStarted) return;
    try {
      var rootN = document.documentElement;
      if (
        rootN.classList.contains("vc-notif-sheet-open") ||
        rootN.classList.contains("vc-notif-drawer-open")
      ) {
        return;
      }
      var ddN = document.getElementById("vc-notif-dropdown");
      if (ddN && (ddN.open || ddN.hasAttribute("open"))) return;
    } catch (eNotifSkip) {}

    /* ptrScrollRestore1: se non c’è target, NON wipe session — solo esci (riprova dopo) */
    if (!hasActiveScrollRestoreTarget()) return;

    var y = 0;
    try {
      y = Math.max(
        0,
        Math.round(Number(window.__vcPtrRestoreTargetY) || 0),
        Math.round(Number(window.__vcPtrRestoreY) || 0),
        Math.round(Number(window.__vcViewStateRestoreY) || 0),
        Math.round(hydrateScrollRestoreTarget() || 0),
      );
    } catch (eY) {}
    if (y < 2) {
      try {
        var attrY = document.documentElement.getAttribute("data-vc-ptr-restore-y");
        y = Math.max(0, Math.round(Number(attrY || 0) || 0));
      } catch (eAttrY) {}
    }
    if (y < 2) y = peekSavedScrollY();
    if (y < 2) return;

    try {
      window.__vcPtrRestoreTargetY = y;
      window.__vcPtrRestoreY = y;
      window.__vcViewStateRestoreY = y;
    } catch (eKeepY) {}

    /* Durante boot: aspetta — resta in alto bloccato dal cine, zero su/giù */
    if (!pageReadyForScrollRestore()) return;

    /* boardsScrollRestore1: togli top-lock PRIMA di misurare, altrimenti maxY≈0 e il restore muore */
    try {
      document.documentElement.classList.remove("vc-scroll-reload-top-lock");
    } catch (eUnlockPre) {}

    var maxY = maxPageScrollY();
    /* scrollRestoreNoFooter1 + homeBootTop1: NON clampare a maxY —
       Math.min(y,maxY) = fondo pagina corta → scroll-anchoring resta in footer. */
    if (maxY < y - 12) {
      var waitMs = 6500;
      try {
        if (document.body && document.body.classList.contains("vc-boards-page")) waitMs = 10000;
      } catch (eWm) {}
      try {
        if (!window.__vcPtrRestoreWaitSince) window.__vcPtrRestoreWaitSince = Date.now();
        if (Date.now() - Number(window.__vcPtrRestoreWaitSince || 0) < waitMs) return;
      } catch (eWait) {
        return;
      }
      /* timeout: solo ratio se abbiamo max salvato; altrimenti NON andare in fondo */
      maxY = maxPageScrollY();
      try {
        var savedMax = Math.max(
          0,
          Math.round(Number(window.__vcPtrRestoreMaxY) || 0),
        );
        if (savedMax >= 64 && maxY >= 64) {
          var ratio = Math.min(1, Math.max(0, y / savedMax));
          y = Math.max(0, Math.round(ratio * maxY));
        } else {
          /* homeBootTop1: doc ancora corto senza ratio → resta in alto, riprova dopo */
          return;
        }
      } catch (eRatio) {
        return;
      }
    }

    try {
      window.__vcPtrRestoreUnpinStarted = true;
    } catch (eMark0) {}
    try {
      if (window.__vcPtrRestoreMo) {
        window.__vcPtrRestoreMo.disconnect();
        window.__vcPtrRestoreMo = null;
      }
    } catch (eMoOff) {}

    try {
      document.documentElement.classList.remove("vc-scroll-reload-top-lock");
    } catch (eUnlock) {}
    unpinScrollRestore();
    markRestoredStickyY(y);
    applyScrollYOnce(y);
    /* violRafKill1: niente 2° apply in rAF — era Violation rAF 150–210ms */
    try {
      if (typeof window.__vcLight === "function") {
        window.__vcLight(function () {
          applyScrollYOnce(y);
        }, 80);
      } else {
        window.setTimeout(function () {
          applyScrollYOnce(y);
        }, 80);
      }
    } catch (eLate) {}

    /* scrollRestoreNoFooter1: done solo se siamo vicini al target, o timeout lungo */
    var curAfter = pageScrollY();
    var maxAfter = maxPageScrollY();
    var closeEnough = Math.abs(curAfter - y) <= 80;
    var stuckBottomWrong =
      maxAfter >= 120 &&
      curAfter >= maxAfter - 40 &&
      y < maxAfter - 160;
    if (closeEnough && !stuckBottomWrong) {
      try {
        window.__vcPtrRestoreDone = true;
        markRestoredStickyY(y);
      } catch (eMark) {}
      /* ptrVinylCue1: cleanup più tardi — hard-top/pinFreeze post-Done non devono
         trovare target wipeati e yankare a 0 mentre sticky ancora fresco */
      window.setTimeout(function () {
        cleanupScrollRestore();
      }, 1800);
      return;
    }
    /* non done: riproverà dagli arm delays; sblocca pin ma tieni target */
    try {
      window.__vcPtrRestoreUnpinStarted = false;
    } catch (eRearm) {}
    window.setTimeout(function () {
      try {
        if (!window.__vcPtrRestoreDone) applyScrollYOnce(y);
      } catch (eLate) {}
    }, 400);
    window.setTimeout(function () {
      try {
        if (window.__vcPtrRestoreDone) return;
        var cur2 = pageScrollY();
        var max2 = maxPageScrollY();
        if (Math.abs(cur2 - y) <= 96) {
          window.__vcPtrRestoreDone = true;
          cleanupScrollRestore();
          return;
        }
        /* ultimo fallback dopo ~12s dal wait */
        if (
          window.__vcPtrRestoreWaitSince &&
          Date.now() - Number(window.__vcPtrRestoreWaitSince) > 12000
        ) {
          window.__vcPtrRestoreDone = true;
          cleanupScrollRestore();
        }
      } catch (eFinal) {}
    }, 900);
  }

  function armScrollRestoreFinalize() {
    /* scrollReloadNoBounce3: arm solo se restore attivo; aspetta eventi ready */
    if (window.__vcPtrRestoreDone || window.__vcPtrRestoreUnpinStarted) return;
    if (!hasActiveScrollRestoreTarget()) return;
    if (window.__vcPtrRestoreArmed) {
      finalizeScrollRestore();
      return;
    }
    window.__vcPtrRestoreArmed = true;
    finalizeScrollRestore();
    /* pochi check — niente storm 80ms da MutationObserver */
    var delays = [400, 900, 1800, 3200, 5200, 7800];
    for (var i = 0; i < delays.length; i += 1) {
      window.setTimeout(finalizeScrollRestore, delays[i]);
    }
    window.addEventListener(
      "load",
      function () {
        /* violPass10: load handler corto — finalize in macrotask */
        window.setTimeout(finalizeScrollRestore, 0);
      },
      { passive: true },
    );
    document.addEventListener("vc:page-cine-ready", finalizeScrollRestore, { passive: true });
    document.addEventListener("vc:chrome-visual-ready", finalizeScrollRestore, { passive: true });
    document.addEventListener("vc:access-ok", finalizeScrollRestore, { passive: true });
    document.addEventListener(
      "vc:cine-curtain-off",
      finalizeScrollRestore,
      { passive: true },
    );
    document.addEventListener("vc:boards-content-ready", finalizeScrollRestore, { passive: true });
    window.setTimeout(cleanupScrollRestore, 14000);
  }

  function injectCss() {
    /* confPtrAnim1: aggiorna sempre lo style (overscroll !important + z sopra sipario/chrome) */
    var style = document.getElementById("vc-ptr-css");
    if (!style) {
      style = document.createElement("style");
      style.id = "vc-ptr-css";
      (document.head || document.documentElement).appendChild(style);
    }
    try {
      style.setAttribute("data-vc", "20261017ptrVinylCue1");
    } catch (eAttr) {}
    style.textContent =
      /* ptrCardDesktop1: none (non contain) — meno rubber-band sulle card iOS/Android */
      "html.vc-ptr-ready,html.vc-ptr-ready body," +
      "html.vc-site-polish.vc-ptr-ready,html.vc-site-polish.vc-ptr-ready body.vc-body," +
      "html.vc-site-polish.vc-page-cine-ready.vc-chrome-scroll-armed.vc-ptr-ready," +
      "html.vc-site-polish.vc-page-cine-ready.vc-chrome-scroll-armed.vc-ptr-ready body," +
      "html.vc-site-polish.vc-page-cine-ready.vc-chrome-scroll-armed.vc-ptr-ready:not(.vc-chrome-bar-loading):not(.vc-loading-scroll-lock):not(.vc-loader-blocking-live):not(.vc-interaction-hold):not(.vc-scroll-soft-lock):not(.vc-dialog-open):not(.vc-notif-sheet-open):not(.vc-notif-drawer-open):not(.vc-img-lb-open)," +
      "html.vc-site-polish.vc-page-cine-ready.vc-chrome-scroll-armed.vc-ptr-ready:not(.vc-chrome-bar-loading):not(.vc-loading-scroll-lock):not(.vc-loader-blocking-live):not(.vc-interaction-hold):not(.vc-scroll-soft-lock):not(.vc-dialog-open):not(.vc-notif-sheet-open):not(.vc-notif-drawer-open):not(.vc-img-lb-open) body," +
      "html.vc-ptr-ready.vc-confessionale-route,html.vc-ptr-ready.vc-confessionale-route body.vc-confessionale-page," +
      "html.vc-site-polish.vc-ptr-ready.vc-confessionale-route.vc-confessionale-curtain-done," +
      "html.vc-site-polish.vc-ptr-ready.vc-confessionale-route.vc-confessionale-curtain-done body.vc-body.vc-confessionale-page" +
      "{overscroll-behavior-y:none!important;overscroll-behavior:none!important;}" +
      ".vc-ptr{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 4.85rem);z-index:110120!important;width:6.1rem;margin:0;display:flex;flex-direction:column;align-items:center;gap:.38rem;pointer-events:none;opacity:0;visibility:hidden;transform:translate3d(-50%,-5.6rem,0);transition:opacity .2s ease,transform .28s cubic-bezier(.22,1,.36,1);}" +
      ".vc-ptr.is-on,.vc-ptr.is-armed{opacity:1!important;visibility:visible!important;z-index:110120!important;transform:translate3d(-50%,calc(-5.6rem + var(--vc-ptr-y,0px)),0);transition:none;}" +
      ".vc-ptr.is-snap{opacity:0;visibility:hidden;transform:translate3d(-50%,-5.6rem,0);}" +
      /* confPtrAnim1: sopra sipario boot (2147483000) così il disco si vede al reload */
      ".vc-ptr.is-refreshing{opacity:1!important;visibility:visible!important;z-index:2147483010!important;transform:translate3d(-50%,.35rem,0);transition:transform .32s cubic-bezier(.22,1.15,.36,1),opacity .18s ease;}" +
      ".vc-ptr:not(.is-on):not(.is-refreshing) .vc-ptr__disc,.vc-ptr.is-snap:not(.is-refreshing) .vc-ptr__disc{box-shadow:none!important;filter:none!important;opacity:0!important;visibility:hidden!important;}" +
      /* ptrSpinReload1: shell disc = pop/scale; rotor = vinyl look + spin (no transform conflict su Safari) */
      ".vc-ptr__disc{position:relative;width:3.45rem;height:3.45rem;border-radius:9999px;transform:rotate(var(--vc-ptr-rot,0deg)) scale(var(--vc-ptr-scale,.86));transform-origin:50% 50%;will-change:transform,opacity,filter;}" +
      ".vc-ptr.is-on .vc-ptr__disc{transform:rotate(var(--vc-ptr-rot,0deg)) scale(var(--vc-ptr-scale,1));}" +
      ".vc-ptr__rotor{position:absolute;inset:0;border-radius:9999px;background:radial-gradient(circle at 50% 50%,transparent 0 .46rem,#1a120e .46rem .64rem,transparent .65rem),repeating-radial-gradient(circle at 50% 50%,rgba(255,255,255,.06) 0 1px,transparent 1px 3px),radial-gradient(circle at 32% 28%,rgba(255,255,255,.16),transparent 42%),radial-gradient(circle at 50% 50%,#2a1c16 0 38%,#120c0a 62%,#070504 100%);box-shadow:0 10px 26px rgba(0,0,0,.46),0 0 0 1px rgba(212,168,136,.34),0 0 22px rgba(212,168,136,.2);transform-origin:50% 50%;will-change:transform,box-shadow;}" +
      ".vc-ptr.is-armed .vc-ptr__rotor{box-shadow:0 12px 30px rgba(0,0,0,.5),0 0 0 1px rgba(212,168,136,.58),0 0 30px rgba(212,168,136,.46);}" +
      ".vc-ptr__label{position:absolute;inset:28%;border-radius:9999px;background:radial-gradient(circle at 38% 32%,rgba(255,244,232,.55),transparent 46%),linear-gradient(160deg,#ead4c0 0%,#d4a888 48%,#6f4e37 100%);box-shadow:inset 0 0 0 1px rgba(80,48,28,.28);}" +
      ".vc-ptr__hole{position:absolute;left:50%;top:50%;width:.46rem;height:.46rem;margin:-.23rem 0 0 -.23rem;border-radius:9999px;background:#0b0705;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12);}" +
      ".vc-ptr__hint{margin:0;max-width:10rem;color:rgba(247,239,230,.9);font-size:.7rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;text-align:center;text-shadow:0 1px 10px rgba(0,0,0,.7);opacity:.82;}" +
      ".vc-ptr.is-armed .vc-ptr__hint{opacity:1;color:#ead4c0;}" +
      /* ptrSpinReload1 + ptrPcSpin1: pop sulla shell; spin continuo sul rotor (subito, no delay) */
      ".vc-ptr.is-refreshing .vc-ptr__disc{animation:vc-ptr-pop .5s cubic-bezier(.22,1.25,.36,1) both;transform:none;}" +
      ".vc-ptr.is-refreshing .vc-ptr__rotor{-webkit-animation:vc-ptr-spin .7s linear infinite,vc-ptr-glow 1.05s ease-in-out infinite;animation:vc-ptr-spin .7s linear infinite,vc-ptr-glow 1.05s ease-in-out infinite;}" +
      /* ptrPcSpin1: batte html.vc-page-hidden/ui-gif-paused * {play-state:paused} al boot PC */
      "html body.vc-body .vc-ptr.is-refreshing .vc-ptr__rotor," +
      "html.vc-page-hidden body.vc-body .vc-ptr.is-refreshing .vc-ptr__rotor," +
      "html.vc-ui-gif-paused body.vc-body .vc-ptr.is-refreshing .vc-ptr__rotor," +
      "html.vc-pwa-bg-frozen body.vc-body .vc-ptr.is-refreshing .vc-ptr__rotor," +
      "html.vc-cpu-settle body.vc-body .vc-ptr.is-refreshing .vc-ptr__rotor{" +
      "-webkit-animation:vc-ptr-spin .7s linear infinite,vc-ptr-glow 1.05s ease-in-out infinite!important;" +
      "animation:vc-ptr-spin .7s linear infinite,vc-ptr-glow 1.05s ease-in-out infinite!important;" +
      "animation-play-state:running!important;-webkit-animation-play-state:running!important;}" +
      ".vc-ptr.is-refreshing .vc-ptr__hint{animation:vc-ptr-hint-in .35s ease .12s both;}" +
      "@keyframes vc-ptr-pop{0%{opacity:0;transform:translate3d(0,-2.1rem,0) scale(.42);filter:blur(2px)}58%{opacity:1;transform:translate3d(0,.18rem,0) scale(1.1);filter:blur(0)}78%{transform:translate3d(0,-.08rem,0) scale(.96)}100%{opacity:1;transform:translate3d(0,0,0) scale(1);filter:none}}" +
      "@keyframes vc-ptr-spin{from{-webkit-transform:rotate(0deg);transform:rotate(0deg)}to{-webkit-transform:rotate(360deg);transform:rotate(360deg)}}" +
      "@keyframes vc-ptr-glow{0%,100%{box-shadow:0 10px 26px rgba(0,0,0,.46),0 0 0 1px rgba(212,168,136,.4),0 0 18px rgba(212,168,136,.28)}50%{box-shadow:0 12px 32px rgba(0,0,0,.5),0 0 0 1px rgba(236,205,176,.72),0 0 34px rgba(212,168,136,.55)}}" +
      "@keyframes vc-ptr-hint-in{from{opacity:0;transform:translateY(.35rem)}to{opacity:1;transform:none}}" +
      "@media (prefers-reduced-motion:reduce){.vc-ptr,.vc-ptr.is-refreshing,.vc-ptr__disc,.vc-ptr.is-on .vc-ptr__disc,.vc-ptr.is-refreshing .vc-ptr__disc,.vc-ptr__rotor,.vc-ptr.is-refreshing .vc-ptr__rotor,.vc-ptr.is-refreshing .vc-ptr__hint,html body.vc-body .vc-ptr.is-refreshing .vc-ptr__rotor{animation:none!important;-webkit-animation:none!important;transition:opacity .16s ease;filter:none!important}}";
    /* ptrPcSpin1: last-wins vs soft-fx / perf inject */
    try {
      var mount = document.body || document.documentElement;
      if (style.parentNode !== mount || mount.lastChild !== style) mount.appendChild(style);
    } catch (eRm) {}
  }

  function stopRefreshSpin() {
    if (refreshSpinRaf) {
      try {
        cancelAnimationFrame(refreshSpinRaf);
      } catch (eC) {}
      refreshSpinRaf = 0;
    }
    try {
      if (!root) return;
      var rotor = root.querySelector(".vc-ptr__rotor");
      if (rotor && rotor.style) rotor.style.removeProperty("transform");
    } catch (eClr) {}
  }

  function startRefreshSpin() {
    stopRefreshSpin();
    if (!root) return;
    if (reducedMotion || prefersReduced()) return;
    var disc = root.querySelector(".vc-ptr__disc");
    var rotor = ensureRotor(disc);
    if (!rotor) return;
    refreshSpinAngle = 0;
    var last = performance.now();
    function tick(now) {
      refreshSpinRaf = 0;
      if (!root || !root.classList.contains("is-refreshing")) {
        stopRefreshSpin();
        return;
      }
      var dt = Math.min(48, Math.max(0, now - last));
      last = now;
      /* ~360deg / 0.7s — stesso ritmo del keyframe vc-ptr-spin */
      refreshSpinAngle = (refreshSpinAngle + dt * (360 / 700)) % 360;
      try {
        rotor.style.setProperty("transform", "rotate(" + refreshSpinAngle + "deg)", "important");
      } catch (eTx) {}
      try {
        refreshSpinRaf = requestAnimationFrame(tick);
      } catch (eRaf) {}
    }
    try {
      refreshSpinRaf = requestAnimationFrame(tick);
    } catch (eStart) {}
  }

  function forcePtrOverscrollContain() {
    /* ptrCardDesktop1: none — riduce stretch card; preventDefault gestisce il pull */
    try {
      var root = document.documentElement;
      var body = document.body;
      root.style.setProperty("overscroll-behavior-y", "none", "important");
      root.style.setProperty("overscroll-behavior", "none", "important");
      if (body) {
        body.style.setProperty("overscroll-behavior-y", "none", "important");
        body.style.setProperty("overscroll-behavior", "none", "important");
      }
    } catch (eOs) {}
  }
  window.__vcPtrReinjectCss = function () {
    try {
      injectCss();
      forcePtrOverscrollContain();
    } catch (eR) {}
  };

  function langIsEn() {
    try {
      return String(document.documentElement.lang || "").toLowerCase().indexOf("en") === 0;
    } catch (e) {
      return false;
    }
  }

  function hintText(kind) {
    var en = langIsEn();
    if (kind === "release") return en ? "Release" : "Rilascia";
    if (kind === "refresh") return en ? "Refreshing" : "Aggiornamento";
    return en ? "Refresh" : "Aggiorna";
  }

  function isTouchUi() {
    try {
      if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return true;
    } catch (e) {}
    try {
      if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) {
        return Number(navigator.maxTouchPoints || 0) > 0 || "ontouchstart" in window;
      }
    } catch (e2) {}
    return Number(navigator.maxTouchPoints || 0) > 0 || "ontouchstart" in window;
  }

  function prefersReduced() {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) {
      return false;
    }
  }

  function windowAtTop() {
    var y = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    try {
      if (window.visualViewport && Number(window.visualViewport.offsetTop || 0) > 1) return false;
    } catch (e) {}
    return y <= 4;
  }

  function isScrollableY(el) {
    if (!el || el === document.body || el === document.documentElement) return false;
    var st;
    try {
      st = window.getComputedStyle(el);
    } catch (e) {
      return false;
    }
    var oy = String((st && st.overflowY) || "");
    if (oy !== "auto" && oy !== "scroll" && oy !== "overlay") return false;
    return el.scrollHeight > el.clientHeight + 2;
  }

  function canPullFrom(target) {
    var el = target;
    if (el && el.nodeType === 3) el = el.parentElement;
    while (el && el !== document.body && el !== document.documentElement) {
      if (isScrollableY(el) && Number(el.scrollTop || 0) > 4) return false;
      el = el.parentElement;
    }
    return windowAtTop();
  }

  function blurSkipLink() {
    try {
      var skip = document.querySelector(".vc-skip-link");
      if (skip && document.activeElement === skip) skip.blur();
    } catch (e) {}
  }

  function clearWatchdog() {
    if (watchdog) {
      window.clearTimeout(watchdog);
      watchdog = 0;
    }
    if (holdMax) {
      window.clearTimeout(holdMax);
      holdMax = 0;
    }
  }

  function armWatchdog() {
    if (watchdog) window.clearTimeout(watchdog);
    watchdog = window.setTimeout(function () {
      watchdog = 0;
      if (tracking && !refreshing && pullY < 12) abortPull(true);
    }, 480);
  }

  var moveBound = false;

  function bindActiveMove() {
    if (moveBound) return;
    moveBound = true;
    document.addEventListener("touchmove", onTouchMove, { passive: false, capture: true });
  }

  function unbindActiveMove() {
    if (!moveBound) return;
    moveBound = false;
    document.removeEventListener("touchmove", onTouchMove, { capture: true });
  }

  function abortPull(animate) {
    tracking = false;
    armed = false;
    pullY = 0;
    unbindActiveMove();
    try {
      window.__vcPtrTracking = false;
    } catch (eTrack) {}
    clearWatchdog();
    if (animate) snapBack();
    else if (root) {
      root.classList.remove("is-on", "is-armed", "is-refreshing", "is-snap");
      root.style.removeProperty("--vc-ptr-y");
      root.style.removeProperty("--vc-ptr-rot");
    }
  }

  function resetPtrUi() {
    tracking = false;
    armed = false;
    pullY = 0;
    peakPullY = 0;
    refreshing = false;
    stopRefreshSpin();
    unbindActiveMove();
    try {
      window.__vcPtrTracking = false;
    } catch (eTrack) {}
    clearWatchdog();
    if (reloadTimer) {
      window.clearTimeout(reloadTimer);
      reloadTimer = 0;
    }
    if (root) {
      root.classList.remove("is-on", "is-armed", "is-refreshing", "is-snap");
      root.style.removeProperty("--vc-ptr-y");
      root.style.removeProperty("--vc-ptr-rot");
    }
  }

  function hasOpenOverlayClass(el) {
    if (!el || !el.className) return false;
    var cn = typeof el.className === "string" ? el.className : String(el.className.baseVal || "");
    return /(?:^|\s)vc-(?:\S+)-(?:sheet|modal)-open(?:\s|$)/.test(cn);
  }

  function overlayBlocksPtr() {
    try {
      if (typeof window.__vcIsPageScrollFrozen === "function" && window.__vcIsPageScrollFrozen()) {
        return true;
      }
    } catch (eFr) {}
    try {
      var root = document.documentElement;
      var body = document.body;
      if (hasOpenOverlayClass(root) || hasOpenOverlayClass(body)) return true;
      if (root.classList.contains("vc-notif-sheet-open")) return true;
      if (root.classList.contains("vc-notif-drawer-open")) return true;
      if (root.classList.contains("vc-staff-datepicker-open")) return true;
      if (root.classList.contains("vc-dialog-open")) return true;
      if (root.classList.contains("vc-dash-confirm-open")) return true;
      if (root.classList.contains("vc-scroll-soft-lock") && hasOpenOverlayClass(root)) return true;
      if (body && body.classList.contains("vc-dash-partnership-sheet-open")) return true;
      if (body && body.classList.contains("vc-wt-gate-open")) return true;
      if (body && body.classList.contains("vc-role-modal-open")) return true;
    } catch (eCls) {}
    try {
      var rootOpen = document.documentElement;
      if (rootOpen.classList.contains("vc-staff-manage-sheet-open")) return true;
      if (rootOpen.classList.contains("vc-staff-stat-sheet-open")) return true;
      if (rootOpen.classList.contains("vc-staff-reso-sheet-open")) return true;
      var notif = document.getElementById("vc-notif-dropdown");
      if (
        notif &&
        (notif.open || notif.hasAttribute("open")) &&
        (rootOpen.classList.contains("vc-notif-sheet-open") ||
          rootOpen.classList.contains("vc-notif-drawer-open"))
      ) {
        return true;
      }
    } catch (eDom) {}
    return false;
  }

  function shouldIgnoreStart(target) {
    if (refreshing) return true;
    if (overlayBlocksPtr()) return true;
    try {
      var root = document.documentElement;
      var body = document.body;
      if (root.classList.contains("vc-mobile-nav-open")) return true;
      if (body && body.classList.contains("vc-mobile-nav-open")) return true;
      /* Catch-all: any vc-*-sheet-open / vc-*-modal-open on html or body */
      if (hasOpenOverlayClass(root) || hasOpenOverlayClass(body)) return true;
      if (root.classList.contains("vc-dialog-open")) return true;
      if (root.classList.contains("vc-dash-confirm-open")) return true;
      if (root.classList.contains("vc-staff-datepicker-open")) return true;
      if (root.classList.contains("vc-user-profile-bday-open")) return true;
      if (body && body.classList.contains("vc-user-profile-bday-open")) return true;
      if (body && body.classList.contains("vc-role-modal-open")) return true;
      if (body && body.classList.contains("vc-dash-partnership-sheet-open")) return true;
      if (body && body.classList.contains("vc-wt-gate-open")) return true;
    } catch (eNav) {}
    var dialog = document.getElementById("vc-site-dialog");
    if (dialog && !dialog.hasAttribute("hidden")) return true;
    var notif = document.getElementById("vc-notif-dropdown");
    if (notif && (notif.open || notif.hasAttribute("open"))) return true;
    try {
      /* Do NOT match bare [aria-modal]: #vc-mobile-nav-drawer always has it. */
      if (
        document.querySelector(
          ".vc-dialog.is-open, #vc-site-dialog.is-open:not([hidden]), .vc-dash-confirm.is-open",
        )
      ) {
        return true;
      }
    } catch (eModal) {}
    var ae = document.activeElement;
    if (ae && /^(input|textarea|select)$/i.test(ae.tagName)) return true;
    if (ae && ae.isContentEditable) return true;
    var node = target;
    if (node && node.nodeType === 3) node = node.parentElement;
    if (node && node.closest) {
      if (node.closest("input, textarea, select, [contenteditable='true'], [role='slider'], .vc-no-ptr")) {
        return true;
      }
      /* ptrCardDesktop1: NON ignorare a[href]/card — altrimenti pull sulle card
         non arma il vinile e resta solo rubber-band nativo (pagina “buggata”).
         Tap veri: se peakPull basso, click passa; se tirata, suppress sotto. */
      if (
        node.closest(
          "button, [role='button'], summary, input, textarea, select, .vc-header-pill",
        )
      ) {
        return true;
      }
      if (
        node.closest(
          "#vc-mobile-nav-toggle, #vc-mobile-nav-close, #vc-mobile-nav-drawer, .vc-mobile-nav-drawer, .vc-mobile-nav-tile, header .vc-icon-btn, header button, header summary, #header-quick-actions",
        )
      ) {
        return true;
      }
      if (
        node.closest(
          [
            ".vc-staff-manage-sheet",
            ".vc-staff-stat-sheet",
            ".vc-staff-reso-sheet",
            ".vc-staff-datepicker",
            ".vc-dialog.is-open",
            "#vc-site-dialog.is-open",
            ".vc-dash-confirm.is-open",
            ".vc-notif-panel",
            ".vc-notif-mobile-backdrop",
            ".vc-notif-dropdown[open]",
            ".vc-reviews-modal",
            ".vc-user-profile-bday-pop",
            ".vc-wt-user-pick",
            ".vc-wfc-subject-overlay",
            ".vc-role-modal",
            ".vc-dashboard-partnership-sheet-backdrop",
          ].join(", "),
        )
      ) {
        return true;
      }
    }
    return false;
  }

  function resisted(dy) {
    var raw = Math.max(0, Number(dy) || 0);
    return (1 - Math.exp(-raw / 150)) * MAX_PULL;
  }

  function ensureRotor(disc) {
    if (!disc) return null;
    var rotor = disc.querySelector(".vc-ptr__rotor");
    if (rotor) return rotor;
    rotor = document.createElement("div");
    rotor.className = "vc-ptr__rotor";
    while (disc.firstChild) rotor.appendChild(disc.firstChild);
    disc.appendChild(rotor);
    return rotor;
  }

  function ensureRoot() {
    if (root && root.isConnected) {
      injectCss();
      ensureRotor(root.querySelector(".vc-ptr__disc"));
      return root;
    }
    injectCss();
    root = document.createElement("div");
    root.className = "vc-ptr";
    root.setAttribute("aria-hidden", "true");
    root.innerHTML =
      '<div class="vc-ptr__disc">' +
      '<div class="vc-ptr__rotor">' +
      '<span class="vc-ptr__label"></span>' +
      '<span class="vc-ptr__hole"></span>' +
      "</div></div>" +
      '<p class="vc-ptr__hint"></p>';
    hintEl = root.querySelector(".vc-ptr__hint");
    document.body.appendChild(root);
    return root;
  }

  function setHint(kind) {
    if (hintEl) hintEl.textContent = hintText(kind);
  }

  function clearPtrInlineHide() {
    if (!root) return;
    try {
      root.style.removeProperty("opacity");
      root.style.removeProperty("visibility");
      root.style.removeProperty("pointer-events");
      root.style.removeProperty("display");
    } catch (eClr) {}
  }

  function paint(pull, isArmed) {
    ensureRoot();
    pullY = pull;
    if (pull > peakPullY) peakPullY = pull;
    armed = isArmed;
    clearPtrInlineHide();
    var scale = 0.86 + Math.min(1, pull / THRESHOLD) * 0.18;
    root.style.setProperty("--vc-ptr-y", Math.max(0, pull * 0.95) + "px");
    root.style.setProperty("--vc-ptr-rot", (reducedMotion ? 0 : pull * 3.05) + "deg");
    root.style.setProperty("--vc-ptr-scale", String(scale.toFixed(3)));
    root.classList.toggle("is-on", pull > 2);
    root.classList.toggle("is-armed", isArmed);
    if (root.classList.contains("is-refreshing")) stopRefreshSpin();
    root.classList.remove("is-snap", "is-refreshing");
    setHint(isArmed ? "release" : "refresh");
  }

  function snapBack() {
    if (!root) return;
    stopRefreshSpin();
    root.classList.add("is-snap");
    root.classList.remove("is-on", "is-armed", "is-refreshing");
    window.setTimeout(function () {
      if (root && !refreshing) {
        root.classList.remove("is-snap");
        root.style.removeProperty("--vc-ptr-y");
        root.style.removeProperty("--vc-ptr-rot");
      }
    }, 280);
  }

  function triggerReload() {
    if (refreshing) return;
    refreshing = true;
    clearWatchdog();
    ensureRoot();
    injectCss();
    clearPtrInlineHide();
    root.classList.remove("is-on", "is-armed", "is-snap");
    root.classList.add("is-refreshing");
    setHint("refresh");
    startRefreshSpin();

    function hardReload() {
      try {
        saveScrollForReload();
        sessionStorage.setItem(PTR_KEY, "1");
      } catch (e) {}
      try {
        window.location.reload();
      } catch (eRel) {}
    }

            var preferSoft = false;
    try {
      preferSoft = window.__vcPtrPreferSoft === true;
    } catch (ePref) {}
    var softFn = preferSoft ? window.__vcPtrSoftRefresh || window.__vcStaffPageRefresh : null;
    if (typeof softFn === "function") {
      var softDone = false;
      function finishSoft(ok) {
        if (softDone) return;
        softDone = true;
        if (reloadTimer) {
          window.clearTimeout(reloadTimer);
          reloadTimer = 0;
        }
        if (ok === false) {
          hardReload();
          return;
        }
        refreshing = false;
        snapBack();
      }
      var ret = null;
      try {
        ret = softFn();
      } catch (eSoftCall) {
        hardReload();
        return;
      }
      if (!ret || typeof ret.then !== "function") {
                hardReload();
        return;
      }
      reloadTimer = window.setTimeout(function () {
        finishSoft(false);
      }, 12000);
      Promise.resolve(ret)
        .then(function () {
          finishSoft(true);
        })
        .catch(function () {
          finishSoft(false);
        });
      return;
    }

    if (reloadTimer) window.clearTimeout(reloadTimer);
    reloadTimer = window.setTimeout(hardReload, 220);
    window.setTimeout(function () {
      if (!refreshing) return;
      resetPtrUi();
    }, 1800);
  }

  function onTouchStart(ev) {
    blurSkipLink();
    if (refreshing || !ev || !ev.touches || ev.touches.length !== 1) return;
    var t = ev.touches[0];
    if (!t) return;
    if (shouldIgnoreStart(ev.target)) return;
    if (!canPullFrom(ev.target)) return;
    tracking = true;
    armed = false;
    startY = t.clientY;
    startX = t.clientX;
    pullY = 0;
    peakPullY = 0;
    try {
      window.__vcPtrTracking = true;
    } catch (eTrack) {}
    /* ptrCardDesktop1: bind non-passive SUBITO — su iOS preventDefault mid-gesture non ferma rubber-band */
    bindActiveMove();
    armWatchdog();
    if (holdMax) window.clearTimeout(holdMax);
    holdMax = window.setTimeout(function () {
      holdMax = 0;
      if (tracking && !refreshing && !armed) abortPull(true);
    }, 10000);
  }

  function onTouchMoveProbe(ev) {
    /* legacy probe: se per qualche motivo move non è bound, recupera */
    if (!tracking || moveBound || refreshing || !ev.touches || ev.touches.length !== 1) return;
    if (shouldIgnoreStart(ev.target)) {
      abortPull(true);
      return;
    }
    var t = ev.touches[0];
    var dy = t.clientY - startY;
    var dx = t.clientX - startX;
    if (Math.abs(dx) > Math.abs(dy) + 10) {
      abortPull(false);
      return;
    }
    if (dy <= 4) return;
    if (!canPullFrom(ev.target) && pullY < 8) {
      abortPull(false);
      return;
    }
    bindActiveMove();
    onTouchMove(ev);
  }

  function onTouchMove(ev) {
    if (!tracking || refreshing || !ev.touches || ev.touches.length !== 1) return;
    if (shouldIgnoreStart(ev.target)) {
      abortPull(true);
      return;
    }
    var t = ev.touches[0];
    var dy = t.clientY - startY;
    var dx = t.clientX - startX;
    armWatchdog();
    if (Math.abs(dx) > Math.abs(dy) + 10 && pullY < 8) {
      abortPull(true);
      return;
    }
    if (dy <= 0) {
      abortPull(pullY > 2);
      return;
    }
    if (!canPullFrom(ev.target) && pullY < 8) {
      abortPull(true);
      return;
    }
    var pull = resisted(dy);
    /* ptrCardDesktop1: preventDefault prima → niente stretch card nativo */
    if (dy > 6 && ev.cancelable) ev.preventDefault();
    paint(pull, pull >= THRESHOLD);
  }

  function onTouchEnd() {
    if (!tracking && !moveBound) return;
    tracking = false;
    unbindActiveMove();
    try {
      window.__vcPtrTracking = false;
    } catch (eTrackEnd) {}
    clearWatchdog();
    if (armed && pullY >= THRESHOLD * 0.86) {
      suppressClickUntil = Date.now() + 650;
      triggerReload();
      return;
    }
    /* tirata sulle card: non far scattare il tap sul link */
    if (peakPullY > 14 || pullY > 14) suppressClickUntil = Date.now() + 420;
    snapBack();
    armed = false;
    pullY = 0;
  }

  function isBrowserPageReload() {
    /* veri refresh (F5 / Ctrl+R / reload browser) — non navigate / back-forward */
    try {
      var list = performance.getEntriesByType && performance.getEntriesByType("navigation");
      var nav = list && list[0];
      if (nav && String(nav.type || "") === "reload") return true;
    } catch (eNav) {}
    try {
      if (performance.navigation && Number(performance.navigation.type) === 1) return true;
    } catch (eLegacy) {}
    return false;
  }

  function showJustReloaded() {
    var flag = false;
    try {
      flag = sessionStorage.getItem(PTR_KEY) === "1";
    } catch (e) {}
    /* ptrScrollRestore1: idrata Y + arma restore PRIMA di togliere PTR_KEY */
    hydrateScrollRestoreTarget();
    armScrollRestoreFinalize();
    try {
      if (flag) sessionStorage.removeItem(PTR_KEY);
    } catch (eRm) {}
    /* ptrCardDesktop1: anche reload PC (navigation.type === reload) */
    if (!flag && !isBrowserPageReload()) return;
    /* ptrVinylCue1: evita doppio cue se già spinning */
    if (ptrVinylCueActive()) return;
    ensureRoot();
    injectCss();
    clearPtrInlineHide();
    try {
      window.__vcPtrVinylCueUntil = Date.now() + 2200;
    } catch (eUntil) {}
    root.classList.add("is-on", "is-refreshing");
    setHint("refresh");
    startRefreshSpin();
    window.setTimeout(function () {
      if (!root) return;
      stopRefreshSpin();
      root.classList.remove("is-on", "is-refreshing");
      root.classList.add("is-snap");
      try {
        window.__vcPtrVinylCueUntil = 0;
      } catch (eClr) {}
      window.setTimeout(function () {
        if (root) root.classList.remove("is-snap");
      }, 320);
      /* dopo il cue vinile: ritenta restore (barra/sipario ormai spenti) */
      try {
        if (!window.__vcPtrRestoreDone) finalizeScrollRestore();
      } catch (eFin) {}
    }, 1800);
  }

  function shouldDeferPtr() {
    try {
      var html = document.documentElement;
      if (html.classList.contains("vc-staff-access-pending") && !html.classList.contains("vc-staff-app-revealed")) {
        return true;
      }
      if (html.classList.contains("vc-staff-denied-open")) return true;
      if (html.classList.contains("vc-dash-access-pending") && !html.classList.contains("vc-dash-access-ready")) {
        return true;
      }
      if (html.classList.contains("vc-session-verify-pending")) return true;
      if (html.classList.contains("vc-user-leader-pending")) return true;
      if (html.classList.contains("vc-user-profile-pending")) return true;
      if (html.classList.contains("vc-rank-customize-pending")) return true;
      if (html.classList.contains("vc-page-cine-boot") && !html.classList.contains("vc-page-cine-ready")) {
        return true;
      }
    } catch (eDef) {}
    return false;
  }

  function watchDeferClear() {
    if (window.__vcPtrDeferMo) return;
    window.__vcPtrDeferMo = true;
    try {
      var mo = new MutationObserver(function () {
        if (!window.__vcPtrListenersBound && !shouldDeferPtr()) tryInitPtrIfNeeded();
      });
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    } catch (eMo) {}
  }

  function ptrVinylCueActive() {
    try {
      if (root && root.classList.contains("is-refreshing")) return true;
      if (window.__vcPtrVinylCueUntil && Date.now() < Number(window.__vcPtrVinylCueUntil)) return true;
    } catch (eCue) {}
    return false;
  }

  function repairPtrAfterNavigation() {
    /* ptrVinylCue1: pageshow/visibility NON devono killare il vinile mid-cue */
    if (!ptrVinylCueActive()) resetPtrUi();
    if (hasActiveScrollRestoreTarget()) armScrollRestoreFinalize();
    try {
      var drawer = document.getElementById("vc-mobile-nav-drawer");
      var navOpen = drawer && drawer.classList.contains("vc-mobile-nav-drawer--open");
      if (!navOpen) {
        document.documentElement.classList.remove("vc-mobile-nav-open");
        if (document.body) document.body.classList.remove("vc-mobile-nav-open");
      }
    } catch (eNav) {}
    try {
      /* notifSidebar4: soft repair — never force-close open notif drawer on visibility/pageshow. */
      if (typeof window.__vcRepairNotifDropdownPortal === "function") {
        window.__vcRepairNotifDropdownPortal();
      }
    } catch (eNotif) {}
    try {
      if (typeof window.__vcSyncLoaderScrollLock === "function") {
        window.__vcSyncLoaderScrollLock();
      } else {
        var rootLock = document.documentElement;
        var ddLock = document.getElementById("vc-notif-dropdown");
        var notifOpen = Boolean(
          (ddLock && (ddLock.open || ddLock.hasAttribute("open"))) ||
            rootLock.classList.contains("vc-notif-sheet-open") ||
            rootLock.classList.contains("vc-notif-drawer-open"),
        );
        if (!notifOpen && typeof window.__vcUnpinPageScroll === "function") {
          window.__vcUnpinPageScroll();
        }
      }
    } catch (eScroll) {}
        try {
      if (!window.__vcPtrListenersBound && shouldDeferPtr()) {
        watchDeferClear();
        window.setTimeout(tryInitPtrIfNeeded, 350);
        window.setTimeout(tryInitPtrIfNeeded, 1600);
      }
    } catch (eRep) {}
    tryInitPtrIfNeeded();
  }

  function bindDesktopScrollSave() {
    /* ptrScrollRestore1: su PC non c’era pagehide → F5 non salvava Y */
    if (window.__vcPtrDesktopScrollSaveBound) return;
    window.__vcPtrDesktopScrollSaveBound = true;
    window.addEventListener("pagehide", function () {
      saveScrollForReload();
    });
    window.addEventListener("beforeunload", function () {
      saveScrollForReload();
    });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") saveScrollForReload();
    });
    window.addEventListener("pageshow", function () {
      window.setTimeout(function () {
        try {
          hydrateScrollRestoreTarget();
          if (hasActiveScrollRestoreTarget()) armScrollRestoreFinalize();
        } catch (ePs) {}
      }, 0);
    });
  }

  function initDesktopReloadCue() {
    /* ptrCardDesktop1: su PC niente pull — solo vinile dopo F5/reload reale */
    if (window.__vcPtrDesktopCueBound) return;
    window.__vcPtrDesktopCueBound = true;
    reducedMotion = prefersReduced();
    try {
      document.documentElement.classList.add("vc-ptr-ready");
    } catch (eReady) {}
    bindDesktopScrollSave();
    injectCss();
    ensureRoot();
    showJustReloaded();
    if (hasActiveScrollRestoreTarget()) armScrollRestoreFinalize();
  }

  function tryInitPtrIfNeeded() {
    if (window.__vcPtrListenersBound) {
      try {
        injectCss();
        forcePtrOverscrollContain();
      } catch (eUp) {}
      return;
    }
    if (!isTouchUi() && !(Number(navigator.maxTouchPoints || 0) > 0)) {
      initDesktopReloadCue();
      return;
    }
    if (shouldDeferPtr()) {
      watchDeferClear();
      return;
    }
    reducedMotion = prefersReduced();
    injectCss();
    document.documentElement.classList.add("vc-ptr-ready");
    forcePtrOverscrollContain();
    ensureRoot();
    showJustReloaded();
    bindPtrListeners();
  }

  function bindPtrListeners() {
    if (window.__vcPtrListenersBound) return;
    window.__vcPtrListenersBound = true;
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMoveProbe, { passive: true, capture: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true, capture: true });
    document.addEventListener("touchcancel", onTouchEnd, { passive: true, capture: true });
    document.addEventListener(
      "click",
      function (ev) {
        if (!suppressClickUntil || Date.now() > suppressClickUntil) return;
        /* dopo una tirata PTR: blocca anche click su card/link (altrimenti apre mentre refreshi) */
        try {
          ev.preventDefault();
          ev.stopPropagation();
          if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
        } catch (eClick) {}
      },
      true,
    );
    window.addEventListener(
      "scroll",
      function () {
        if (tracking && !windowAtTop()) abortPull(true);
      },
      { passive: true },
    );
    window.addEventListener("pagehide", function () {
      resetPtrUi();
      saveScrollForReload();
    });
    window.addEventListener("pageshow", function () {
      window.setTimeout(function () {
        try {
          repairPtrAfterNavigation();
          if (hasActiveScrollRestoreTarget()) armScrollRestoreFinalize();
        } catch (ePs) {}
      }, 0);
    });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") {
        abortPull(false);
        saveScrollForReload();
      } else if (document.visibilityState === "visible") {
        window.setTimeout(function () {
          try {
            repairPtrAfterNavigation();
            if (hasActiveScrollRestoreTarget()) armScrollRestoreFinalize();
          } catch (eVis) {}
        }, 0);
      }
    });
  }

  function initPtr() {
    if (window.__vcPtrListenersBound || window.__vcPtrDesktopCueBound) return;
    if (!isTouchUi() && !(Number(navigator.maxTouchPoints || 0) > 0)) {
      initDesktopReloadCue();
      return;
    }
    if (shouldDeferPtr()) {
      watchDeferClear();
      window.addEventListener("vc:page-cine-ready", tryInitPtrIfNeeded, { once: true });
      window.addEventListener("vc:staff-access-ok", tryInitPtrIfNeeded, { once: true });
      window.addEventListener("vc:access-ok", tryInitPtrIfNeeded, { once: true });
      window.addEventListener("vc-dashboard-access", tryInitPtrIfNeeded, { once: true });
      window.setTimeout(tryInitPtrIfNeeded, 400);
      window.setTimeout(tryInitPtrIfNeeded, 2500);
      window.setTimeout(function () {
        if (!window.__vcPtrListenersBound && !shouldDeferPtr()) tryInitPtrIfNeeded();
        else if (!window.__vcPtrListenersBound) {
          try {
            if (document.documentElement.classList.contains("vc-staff-app-revealed")) {
              tryInitPtrIfNeeded();
            }
          } catch (eLate) {}
        }
      }, 5000);
      return;
    }
    tryInitPtrIfNeeded();
  }

  if (__vcPtrAlreadyBooted) {
    /* confPtrAnim1: vecchio ptr già attivo — refresh CSS + cue vinile se reload */
    try {
      window.__vcPtrReinjectCss();
    } catch (eRe) {}
    try {
      showJustReloaded();
    } catch (eCueBoot) {}
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      armScrollRestoreFinalize();
      initPtr();
    });
  } else {
    armScrollRestoreFinalize();
    initPtr();
  }

  /* scrollReloadNoYank1 */
  try {
    window.__vcPtrFinalizeScroll = finalizeScrollRestore;
    window.armScrollRestoreFinalize = armScrollRestoreFinalize;
  } catch (eExp) {}
})();
/* extOnlyFix1 */
/* violPass10 */

/* ptrVinylCue1 */
