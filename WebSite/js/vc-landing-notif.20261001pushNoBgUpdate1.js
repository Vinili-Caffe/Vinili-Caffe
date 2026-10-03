/* siteApiW7: deferred notifications + scroll-lock chunk */
/* modalScrollStay3: arm/release modal scroll lock (Y before overflow:hidden) */
/* 20261001pwaPushBellBadge1: PWA focused push → keep optimistic unread (badge campanella) */
/* 20260930pushVisitDismiss1: visit page → mark read + dismiss OS without notif click */
/* 20261001pushBadgeVisitFix1: delete→OS+badge; visit page→server mark+dismiss all devices */
(function () {
  var STORAGE_PREFIX = "vc_notifications_v1:";
  var DISMISSED_PREFIX = "vc_notifications_dismissed_v1:";
  var NOTIF_SYNC_KEY = "vc_notifications_sync_v1";
  var PENDING_READ_PREFIX = "vc_notifications_pending_read_v1:";
  /* notifSheetSync1: pending locale solo TTL — poi vince il server (sync device/pagine) */
  var PENDING_READ_TTL_MS = 18000;
  var MARK_ALL_AT_PREFIX = "vc_notifications_mark_all_at_v1:";
  var CLEAR_ALL_AT_PREFIX = "vc_notifications_clear_all_at_v1:";
  /* notifMultiDevice2: clear-all locale solo race breve — poi vince il server */
  var CLEAR_ALL_TTL_MS = 45000;
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
  var SITE_NOTIFS_POLL_MS = 180000;
  var SITE_NOTIFS_POLL_HIDDEN_MS = 0;
  var SITE_NOTIFS_POLL_PHONE_MS = 240000;
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
    var NOTIF_FLY_READ_MS = 3600;
    var NOTIF_FLY_ANIM_MS = 280;
  var notifFlyActiveCount = 0;
  var notifIgToastEl = null;
  var notifIgToastTimer = 0;
  var notifIgToastCount = 0;
  var notifIgToastKind = "info";
  /* notifPendingToastNoFlash1: once per page visit only (not session-wide) */
  var notifIgPendingShownPath = "";
  var notifInterruptQueue = [];
  var notifInterruptOpen = false;
  var notifInterruptCurrent = null;
  var notifInterruptKeyHandler = null;

  function loaderElReallyBlocking(el) {
    if (!el) return false;
    try {
      if (el.hidden || el.hasAttribute("hidden")) return false;
      if (el.classList && el.classList.contains("vc-staff-loading--hidden")) return false;
      if (el.classList && el.classList.contains("vc-reviews-gate")) return false;
      var cs = window.getComputedStyle(el);
      if (!cs) return false;
      if (cs.display === "none" || cs.visibility === "hidden") return false;
      if (Number(cs.opacity || "1") < 0.05) return false;
      if (cs.pointerEvents === "none") return false;
      var r = el.getBoundingClientRect();
      if (r.width < 24 || r.height < 24) return false;
            if (r.width < window.innerWidth * 0.45 && r.height < window.innerHeight * 0.35) return false;
      return true;
    } catch (eVis) {
      return false;
    }
  }

  function isBlockingLoaderVisible() {
    try {
      var root = document.documentElement;
      var coarse = false;
      try {
        coarse =
          (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
          Number(navigator.maxTouchPoints || 0) > 0;
      } catch (eC) {}
            if (!coarse && root.classList.contains("vc-session-verify-pending")) return true;
      if (root.classList.contains("vc-dash-access-pending")) return true;
            if (root.classList.contains("vc-user-leader-pending")) {
        var ulPend = document.getElementById("vc-ul-loading");
        if (loaderElReallyBlocking(ulPend)) return true;
      }
      if (root.classList.contains("vc-user-profile-pending")) {
        var prPend = document.getElementById("vc-user-profile-loading");
        var bpPend = document.querySelector("body > .vc-user-profile-loader");
        if (loaderElReallyBlocking(prPend) || loaderElReallyBlocking(bpPend)) return true;
      }
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
                try {
      var uls = document.querySelectorAll(".vc-ul-loading");
      for (var ui = 0; ui < uls.length; ui += 1) {
        if (loaderElReallyBlocking(uls[ui])) return true;
      }
    } catch (eUl) {
      if (document.querySelector('.vc-ul-loading[data-vc-loader-blocking="1"]')) return true;
    }
    try {
      var rankL = document.getElementById("vc-rank-customize-loading");
      if (loaderElReallyBlocking(rankL)) return true;
    } catch (eRk) {
      if (document.querySelector("#vc-rank-customize-loading:not([hidden])")) return true;
    }
    var staffInboxLoading = document.getElementById("vc-staff-inbox-loading");
    if (loaderElReallyBlocking(staffInboxLoading)) return true;
    var profileLoading = document.getElementById("vc-user-profile-loading");
    if (loaderElReallyBlocking(profileLoading)) return true;
    try {
      var bodyProf = document.querySelector("body > .vc-user-profile-loader");
      if (loaderElReallyBlocking(bodyProf)) return true;
    } catch (eBp) {}
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
            return false;
  }

  try {
    window.__vcLoaderElReallyBlocking = loaderElReallyBlocking;
    window.__vcIsBlockingLoaderVisible = isBlockingLoaderVisible;
  } catch (eVisExport) {}

  function syncLoaderBlockingLiveClass() {
        var live = false;
    try {
      var nodes = document.querySelectorAll(
        '.vc-ul-loading:not([hidden]), #vc-ul-loading:not([hidden]), #vc-roles-loading:not([hidden]),' +
          '.vc-staff-loading:not([hidden]):not(.vc-staff-loading--hidden), #vc-staff-loading:not([hidden]):not(.vc-staff-loading--hidden),' +
          '#vc-shared-boot-overlay:not([hidden]), #vc-rank-customize-loading:not([hidden]), #vc-custom-profile-loading:not([hidden]),' +
          '.vc-user-profile-boot:not([hidden]), .vc-ul-loading[data-vc-loader-blocking="1"]:not([hidden]), #vc-roles-loading[data-vc-loader-blocking="1"]:not([hidden])',
      );
      for (var i = 0; i < nodes.length; i += 1) {
        if (loaderElReallyBlocking(nodes[i])) {
          live = true;
          break;
        }
      }
    } catch (eScan) {}
    if (!live) {
      try {
        var profLoad = document.getElementById("vc-user-profile-loading");
        if (loaderElReallyBlocking(profLoad)) live = true;
      } catch (eProf) {}
    }
    if (!live) {
      try {
        var bodyProf = document.querySelector("body > .vc-user-profile-loader:not([hidden])");
        if (loaderElReallyBlocking(bodyProf)) live = true;
      } catch (eBp) {}
    }
    if (!live) {
      try {
        var sess = document.querySelector(".vc-session-verify-overlay:not(.vc-session-verify-overlay--hidden)");
        if (loaderElReallyBlocking(sess)) live = true;
      } catch (eSess) {}
    }
    try {
      /* scrollYankFix1: pin BEFORE lock classes — CSS inset:0 otherwise zeros pageYOffset */
      var pageReady = false;
      try {
        var rootLive = document.documentElement;
        pageReady =
          rootLive.classList.contains("vc-page-cine-ready") ||
          rootLive.classList.contains("vc-core-styles-ready") ||
          rootLive.classList.contains("vc-home-styles-ready") ||
          rootLive.classList.contains("vc-styles-ready");
      } catch (eReady) {}
      if (live && typeof window.__vcPinPageScroll === "function") {
        try {
          window.__vcPinPageScroll({ soft: pageReady });
        } catch (ePinLive) {}
      }
      /* loadScrollLockAll1: niente force live=false in PWA dopo ready —
         spegneva il lock durante loading reale su molte pagine. */
      document.documentElement.classList.toggle("vc-loader-blocking-live", live);
      /* loadScrollLockFs1: finché il loader pagina è vivo, tieni anche loading-scroll-lock
         (cine-ready altrimenti rimette overflow:auto). */
      if (live) {
        document.documentElement.classList.add("vc-loading-scroll-lock");
      } else {
        /* loaderLoopFix1: non lasciare scroll-lock orfano — altrimenti pageLooksHealthy
           resta false e recover/phoneWatch entrano in loop al reload. */
        var keepPendingLock = false;
        try {
          var rootOff = document.documentElement;
          keepPendingLock =
            rootOff.classList.contains("vc-page-cine-boot") &&
            !rootOff.classList.contains("vc-page-cine-ready");
          if (!keepPendingLock) {
            keepPendingLock =
              rootOff.classList.contains("vc-user-leader-pending") ||
              rootOff.classList.contains("vc-user-profile-pending") ||
              rootOff.classList.contains("vc-rank-customize-pending") ||
              rootOff.classList.contains("vc-custom-profile-pending") ||
              rootOff.classList.contains("vc-session-verify-pending");
          }
        } catch (ePendOff) {
          keepPendingLock = false;
        }
        if (!keepPendingLock) {
          document.documentElement.classList.remove("vc-loading-scroll-lock");
        }
      }
    } catch (eCls) {}
    return live;
  }

  try {
    window.__vcSyncLoaderBlockingLiveClass = syncLoaderBlockingLiveClass;
  } catch (eLiveExport) {}

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
      /* scrollStayAll1: dopo ready non ri-azzerare quando il loader si spegne (tab/switch) */
      try {
        var root = document.documentElement;
        if (
          root.classList.contains("vc-cine-curtain-off") &&
          (root.classList.contains("vc-page-cine-ready") ||
            root.classList.contains("vc-styles-ready") ||
            root.classList.contains("vc-core-styles-ready"))
        ) {
          if (scrollPinned && Number(scrollPinSavedY) > 8) {
            restorePageScrollY(scrollPinSavedY);
          }
          return;
        }
      } catch (eStay) {}
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
  /* bootScrollLock2: unpin must not restore mid-load Y after boot/loaders */
  var scrollPinFromBoot = false;

  function isBootScrollPhase(rootEl) {
    var root = rootEl || document.documentElement;
    try {
      if (window.__vcDiscardNextUnpinScrollY === true) return true;
      var pageReady =
        root.classList.contains("vc-page-cine-ready") ||
        root.classList.contains("vc-home-styles-ready") ||
        root.classList.contains("vc-core-styles-ready") ||
        root.classList.contains("vc-styles-ready");
      /* notifBellScrollStay2: do NOT treat vc-loading-scroll-lock as boot — that class is
         also armed for notif drawer/sheet. Re-pin then zeroed Y and yanked the page up. */
      /* scrollYankFix1: after ready, loader-blocking-live is a transient lock — never boot-zero Y */
      if (root.classList.contains("vc-loader-blocking-live") && !pageReady) return true;
      if (root.classList.contains("vc-page-cine-boot") && !root.classList.contains("vc-page-cine-ready")) {
        return true;
      }
      if (!pageReady) {
        return true;
      }
    } catch (eBootPh) {}
    return false;
  }

  function pageScrollY() {
    try {
      var y =
        window.pageYOffset ||
        (document.documentElement && document.documentElement.scrollTop) ||
        (document.body && document.body.scrollTop) ||
        0;
      if (y > 0) return y;
      /* scrollYankFix1: body position:fixed (+ optional CSS inset:0) makes pageYOffset read 0.
         consoleViolationKill1: niente getComputedStyle qui (forced reflow 200ms+). */
      try {
        var bodyY = document.body;
        if (bodyY) {
          var pos = "";
          try {
            pos = bodyY.style.position || "";
          } catch (ePos) {}
          if (pos === "fixed") {
            var topRaw = "";
            try {
              topRaw = bodyY.style.top || "";
            } catch (eTop) {}
            if (topRaw && topRaw.charAt(0) === "-") {
              var recovered = Math.abs(parseInt(topRaw, 10) || 0);
              if (recovered > 0) return recovered;
            }
          }
        }
      } catch (eFix) {}
      if (scrollPinned && Number(scrollPinSavedY) > 0) return Number(scrollPinSavedY) || 0;
      return 0;
    } catch (eY) {
      return 0;
    }
  }

  /* notifTicketScrollStay1 + notifBellScrollStay2: overflow-lock / focus / portal must not jump */
  function restorePageScrollY(y) {
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
    } catch (eScr) {}
  }

  function holdPageScroll(ms, forcedY) {
    /* consoleViolationKill1: 1 restore sync + 1 rAF + 1 idle — no storm setTimeout/reflow */
    var hasForced = forcedY != null && Number.isFinite(Number(forcedY));
    var y = hasForced
      ? Math.max(0, Number(forcedY) || 0)
      : scrollPinned && Number(scrollPinSavedY) > 0
        ? Number(scrollPinSavedY) || 0
        : pageScrollY();
    function restore() {
      var cur = pageScrollY();
      /* bootScrollLock5: only undo accidental jump UP / to top — never fight scroll-down */
      /* scrollStayAll1: senza forcedY, solo correzioni grosse (evita yo-yo idle) */
      if (cur < 24 && y > 48) restorePageScrollY(y);
      else if (hasForced && y - cur >= 64) restorePageScrollY(y);
      else if (!hasForced && y - cur >= 160) restorePageScrollY(y);
    }
    restore();
    try {
      window.requestAnimationFrame(restore);
    } catch (eRaf) {}
    var delay = Math.min(Math.max(Number(ms) || 0, 0), 280);
    if (delay > 0) {
      window.setTimeout(function () {
        try {
          if (typeof window.requestIdleCallback === "function") {
            window.requestIdleCallback(
              function () {
                try {
                  restore();
                } catch (eIdle) {}
              },
              { timeout: 140 },
            );
            return;
          }
        } catch (eRic) {}
        try {
          restore();
        } catch (eT) {}
      }, delay);
    }
    return y;
  }

  function isPageScrollFrozen() {
    if (isBlockingLoaderVisible()) return true;
    try {
      var root = document.documentElement;
      if (root.classList.contains("vc-rank-customize-pending")) return true;
      if (root.classList.contains("vc-mobile-nav-open")) {
        var navDr = document.getElementById("vc-mobile-nav-drawer");
        if (navDr && navDr.classList.contains("vc-mobile-nav-drawer--open")) return true;
      }
      if (root.classList.contains("vc-user-leader-pending")) {
        var ulFr = document.getElementById("vc-ul-loading");
        if (loaderElReallyBlocking(ulFr)) return true;
      }
      if (root.classList.contains("vc-user-profile-pending")) {
        var prFr = document.getElementById("vc-user-profile-loading");
        var bpFr = document.querySelector("body > .vc-user-profile-loader");
        if (loaderElReallyBlocking(prFr) || loaderElReallyBlocking(bpFr)) return true;
      }
      try {
        var coarseFreeze =
          (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
          Number(navigator.maxTouchPoints || 0) > 0;
        if (!coarseFreeze && root.classList.contains("vc-session-verify-pending")) return true;
      } catch (eSesF) {}
            if (isNotifPanelChromeOpen(root)) {
        var ddFrozen = document.getElementById("vc-notif-dropdown");
        if (ddFrozen && (ddFrozen.open || ddFrozen.hasAttribute("open"))) return true;
      }
      if (root.classList.contains("vc-staff-stat-sheet-open")) return true;
      if (root.classList.contains("vc-staff-manage-sheet-open")) return true;
      if (root.classList.contains("vc-staff-reso-sheet-open")) return true;
      if (root.classList.contains("vc-feedback-sheet-open")) return true;
      if (root.classList.contains("vc-staff-datepicker-open")) return true;
      if (root.classList.contains("vc-dialog-open")) return true;
      if (root.classList.contains("vc-dash-confirm-open")) return true;
      if (root.classList.contains("vc-reviews-modal-open")) return true;
      if (root.classList.contains("vc-dash-cmds-modal-open")) return true;
      if (root.classList.contains("vc-wfc-subject-open")) return true;
      try {
        if (document.body && document.body.classList.contains("vc-role-modal-open")) return true;
        if (document.body && document.body.classList.contains("vc-dash-cmds-modal-open")) return true;
        if (document.body && document.body.classList.contains("vc-dash-partnership-sheet-open")) return true;
      } catch (eRole) {}
    } catch (eFrozen) {}
    try {
      if (document.querySelector(".vc-dialog.is-open, #vc-site-dialog.is-open:not([hidden]), .vc-dash-confirm.is-open, .vc-reviews-modal--open, .vc-wfc-subject-overlay:not([hidden])")) {
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
    var soft = Boolean(opts.soft);
    var phonePin = false;
    var notifChromeOpen = false;
    try {
      phonePin = isCoarsePointerDevice() || isStandalonePwaLocal();
      if (phonePin) soft = true;
    } catch (eSoftForce) {
      soft = true;
      phonePin = true;
    }
    try {
      /* bootScrollLock5: during cine boot never position:fixed (CSS inset:0 zeros Y + flash) */
      if (isBootScrollPhase(document.documentElement)) {
        soft = true;
        phonePin = true;
      }
    } catch (eBootSoft) {}
    try {
      /* scrollYankFix1: after page ready never position:fixed — CSS+inline fixed inset yanks to top */
      var rootReadyPin = document.documentElement;
      if (
        rootReadyPin.classList.contains("vc-page-cine-ready") ||
        rootReadyPin.classList.contains("vc-core-styles-ready") ||
        rootReadyPin.classList.contains("vc-home-styles-ready") ||
        rootReadyPin.classList.contains("vc-styles-ready")
      ) {
        soft = true;
        phonePin = true;
        opts.forcePhoneLock = true;
      }
    } catch (eReadyPin) {}
    /* scrollYankFix1: soft lock === overflow-only — never position:fixed (inset:0 yanks to top) */
    if (soft) phonePin = true;
    try {
      /* notifSidebar4/5: notif drawer/sheet must never use position:fixed — fights CSS overflow
         lock + PTR restore → continuous scroll jitter. notifSidebar5: panel-body scrolls under
         overflow-only lock (no touch-action:none on panel). */
      notifChromeOpen = isNotifPanelChromeOpen(document.documentElement);
      if (notifChromeOpen) {
        phonePin = true;
        soft = true;
        opts.forcePhoneLock = true;
      }
    } catch (eNotifPin) {}
    if (!scrollPinned) {
      /* bootScrollLock4: pin at 0 only while still pristine — keep mid-load user scroll */
      var ySave = pageScrollY();
      try {
        var rootSave = document.documentElement;
        /* notifBellScrollStay2: never zero Y while opening notif chrome */
        if (isBootScrollPhase(rootSave) && !notifChromeOpen) {
          if (ySave <= 24) {
            ySave = 0;
            scrollPinFromBoot = true;
            try {
              window.scrollTo(0, 0);
              if (document.documentElement) document.documentElement.scrollTop = 0;
              if (document.body) document.body.scrollTop = 0;
            } catch (eZ) {}
          } else {
            scrollPinFromBoot = false;
          }
        } else if (notifChromeOpen && typeof notifScrollAnchorY === "number" && notifScrollAnchorY > 0) {
          ySave = Math.max(ySave, notifScrollAnchorY);
        }
      } catch (eBootY) {}
      scrollPinSavedY = ySave;
      scrollPinned = true;
    } else if (isBootScrollPhase(document.documentElement) && !notifChromeOpen) {
      /* scrollYankFix1: never wipe a real saved Y — pageYOffset is 0 under position:fixed */
      var liveRe = pageScrollY();
      var savedRe = Number(scrollPinSavedY) || 0;
      if (savedRe > 24 || liveRe > 24) {
        scrollPinSavedY = Math.max(savedRe, liveRe);
        scrollPinFromBoot = false;
      } else if (liveRe <= 24 && savedRe <= 24) {
        scrollPinSavedY = 0;
        scrollPinFromBoot = true;
      }
    } else if (notifChromeOpen && typeof notifScrollAnchorY === "number" && notifScrollAnchorY > scrollPinSavedY) {
      scrollPinSavedY = notifScrollAnchorY;
    }
    scrollPinSoft = soft;
    try {
      /* phoneSheetPtrLock1: on phone never use position:fixed (breaks unlock),
         but still lock overflow/overscroll so PTR + page scroll behind sheets die.
         phoneNavTapFix1: hamburger alone must NOT soft-lock — iOS then eats tile taps.
         CSS `.vc-mobile-nav-open` already locks overflow for the drawer. */
      if (phonePin) {
        var needPhoneOverflowLock = Boolean(opts.forcePhoneLock);
        try {
          var rootPin = document.documentElement;
          needPhoneOverflowLock =
            needPhoneOverflowLock ||
            isNotifPanelChromeOpen(rootPin) ||
            rootPin.classList.contains("vc-staff-manage-sheet-open") ||
            rootPin.classList.contains("vc-staff-stat-sheet-open") ||
            rootPin.classList.contains("vc-staff-reso-sheet-open") ||
            rootPin.classList.contains("vc-feedback-sheet-open") ||
            rootPin.classList.contains("vc-staff-datepicker-open") ||
            rootPin.classList.contains("vc-dialog-open") ||
            rootPin.classList.contains("vc-dash-confirm-open") ||
            rootPin.classList.contains("vc-reviews-modal-open") ||
            rootPin.classList.contains("vc-dash-cmds-modal-open") ||
            rootPin.classList.contains("vc-wfc-subject-open") ||
            (document.body && document.body.classList.contains("vc-role-modal-open")) ||
            (document.body && document.body.classList.contains("vc-dash-cmds-modal-open")) ||
            (document.body && document.body.classList.contains("vc-dash-partnership-sheet-open")) ||
            rootPin.classList.contains("vc-loading-scroll-lock") ||
            rootPin.classList.contains("vc-loader-blocking-live") ||
            (rootPin.classList.contains("vc-page-cine-boot") &&
              !rootPin.classList.contains("vc-page-cine-ready")) ||
            rootPin.classList.contains("vc-user-leader-pending") ||
            rootPin.classList.contains("vc-user-profile-pending") ||
            rootPin.classList.contains("vc-rank-customize-pending") ||
            rootPin.classList.contains("vc-session-verify-pending");
          /* inboxFreezeKill2: non pin scroll per vc-notif-staff-loading */
        } catch (eNeedPin) {
          needPhoneOverflowLock = true;
        }
        if (!needPhoneOverflowLock) {
          try {
            document.documentElement.classList.remove("vc-scroll-soft-lock");
          } catch (eSoftOff) {}
          scrollPinned = false;
          scrollPinSoft = false;
          return;
        }
        /* notifBellStayOpen1: already soft-locked for notif — skip overflow rewrite
           (style thrash closes <details> ~1s after open). */
        if (
          notifChromeOpen &&
          scrollPinned &&
          scrollPinSoft &&
          document.documentElement.classList.contains("vc-scroll-soft-lock")
        ) {
          var yKeepNotif =
            typeof notifScrollAnchorY === "number" && notifScrollAnchorY > 0
              ? Math.max(Number(scrollPinSavedY) || 0, notifScrollAnchorY)
              : Number(scrollPinSavedY) || 0;
          if (yKeepNotif > 0) scrollPinSavedY = yKeepNotif;
          return;
        }
        document.documentElement.style.setProperty("overflow", "hidden", "important");
        document.documentElement.style.setProperty("overscroll-behavior", "none", "important");
        document.documentElement.style.removeProperty("touch-action");
        body.style.removeProperty("position");
        body.style.removeProperty("left");
        body.style.removeProperty("right");
        body.style.removeProperty("top");
        body.style.removeProperty("width");
        body.style.setProperty("overflow", "hidden", "important");
        body.style.setProperty("overscroll-behavior", "none", "important");
        body.style.removeProperty("touch-action");
        try {
          document.documentElement.classList.add("vc-scroll-soft-lock");
        } catch (eSoftCls) {}
        /* notifBellScrollStay2: soft overflow-lock can reset window scroll — restore once */
        var ySoft =
          notifChromeOpen && typeof notifScrollAnchorY === "number" && notifScrollAnchorY > 0
            ? Math.max(Number(scrollPinSavedY) || 0, notifScrollAnchorY)
            : scrollPinSavedY;
        if (notifChromeOpen) scrollPinSavedY = ySoft;
        try {
          /* modalScrollStay3: overflow:hidden azzera Y — ripristina SEMPRE se abbiamo un pin valido */
          if (Number(ySoft) > 0) restorePageScrollY(ySoft);
          else {
            var liveSoft = pageScrollY();
            if (Math.abs(liveSoft - ySoft) >= 1 || (ySoft > 24 && liveSoft < 24)) {
              restorePageScrollY(ySoft);
            }
          }
        } catch (eSoftRest) {
          restorePageScrollY(ySoft);
        }
        return;
      }
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

  function stripPhoneInlineScrollLocks() {
    var phone = false;
    try {
      phone = isCoarsePointerDevice() || isStandalonePwaLocal();
    } catch (ePh) {
      phone = true;
    }
    if (!phone) return;
    var root = document.documentElement;
    var body = document.body;
    var mustLock = false;
    try {
      /* sheetScrollStayFix1: any open sheet/modal must keep soft overflow lock */
      if (typeof isPageScrollFrozen === "function" && isPageScrollFrozen()) {
        mustLock = true;
      } else if (typeof isSheetChromeOpen === "function" && isSheetChromeOpen(root)) {
        mustLock = true;
      } else if (isNotifPanelChromeOpen(root)) {
        var ddLive = document.getElementById("vc-notif-dropdown");
        mustLock = Boolean(ddLive && (ddLive.open || ddLive.hasAttribute("open")));
      } else {
        mustLock = root.classList.contains("vc-mobile-nav-open");
      }
      /* inboxFreezeKill2: non lockare per overlay inbox FS */
      if (!mustLock && root.classList.contains("vc-user-leader-pending")) {
        var ulStrip = document.getElementById("vc-ul-loading");
        if (
          ulStrip &&
          !ulStrip.hidden &&
          !ulStrip.hasAttribute("hidden") &&
          (typeof loaderElReallyBlocking !== "function" || loaderElReallyBlocking(ulStrip))
        ) {
          mustLock = true;
        }
      }
    } catch (eMust) {
      mustLock = false;
    }
    if (mustLock) return;
    try {
      if (typeof isBlockingLoaderVisible === "function" && isBlockingLoaderVisible()) return;
      if (isLoaderScrollLocked()) return;
    } catch (eLoaderKeep) {}
    try {
      root.style.removeProperty("overflow");
      root.style.removeProperty("overscroll-behavior");
      root.style.removeProperty("touch-action");
      root.classList.remove("vc-scroll-soft-lock", "vc-loading-scroll-lock");
    } catch (eR) {}
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
      } catch (eB) {}
    }
    scrollPinned = false;
    scrollPinSoft = false;
  }

  function unpinPageScroll() {
    /* sheetScrollStayFix1: never unlock page while a fullscreen sheet/modal is still open
       (phone recover/heartbeat used to strip soft-lock on click/focus inside). */
    try {
      if (typeof isPageScrollFrozen === "function" && isPageScrollFrozen()) {
        try {
          lastScrollLockFrozen = null;
          lastScrollLockOverlay = null;
          lastScrollLockNeedGuards = null;
        } catch (eCache) {}
        pinPageScroll({ soft: true, forcePhoneLock: true });
        return;
      }
    } catch (eKeepFrozen) {}
    var body = document.body;
    var y = scrollPinSavedY;
    var wasPinned = scrollPinned;
    var discardY = false;
    try {
      discardY =
        scrollPinFromBoot ||
        window.__vcDiscardNextUnpinScrollY === true ||
        isBootScrollPhase(document.documentElement);
    } catch (eDisc) {
      discardY = scrollPinFromBoot;
    }
    /* bootScrollLock4: never yank a user who already scrolled past the gate */
    try {
      var liveY = pageScrollY();
      if (discardY && (liveY > 24 || (Number(y) || 0) > 24)) {
        discardY = false;
        y = Math.max(Number(y) || 0, liveY);
      }
    } catch (eKeepLive) {}
    /* scrollYankFix1: never restore to 0 if we still have a meaningful pinned Y */
    if (discardY && (Number(y) || 0) > 24) {
      discardY = false;
    }
    if (discardY) y = 0;
    scrollPinned = false;
    scrollPinSoft = false;
    scrollPinSavedY = 0;
    scrollPinFromBoot = false;
    try {
      window.__vcDiscardNextUnpinScrollY = false;
    } catch (eClr) {}
    try {
      document.documentElement.classList.remove("vc-scroll-soft-lock");
    } catch (eSoftClsOff) {}
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
      stripPhoneInlineScrollLocks();
    } catch (eStrip) {}
    if (wasPinned) {
      try {
        window.scrollTo(0, y);
        if (document.documentElement) document.documentElement.scrollTop = y;
        if (document.body) document.body.scrollTop = y;
      } catch (eUnpin) {}
      /* scrollYankFix1: restore after lock classes/height:100% drop — rAF + short hold */
      try {
        restorePageScrollY(y);
        holdPageScroll(220, y);
      } catch (eHoldUn) {}
      if (y === 0) {
        try {
          window.requestAnimationFrame(function () {
            try {
              window.scrollTo(0, 0);
            } catch (eRaf0) {}
          });
        } catch (eRaf) {}
      }
    }
  }

  try {
    window.__vcPinPageScroll = pinPageScroll;
    window.__vcUnpinPageScroll = unpinPageScroll;
    window.__vcStripPhoneInlineScrollLocks = stripPhoneInlineScrollLocks;
    window.__vcIsPageScrollFrozen = isPageScrollFrozen;
    /* ticketModalScrollStay2: post-confirm postAction must reuse pinned Y, not 0 mid-unpin */
    window.__vcGetPinnedPageScrollY = function () {
      try {
        if (scrollPinned) return Number(scrollPinSavedY) || 0;
      } catch (ePinY) {}
      return pageScrollY();
    };
    window.__vcResetPinnedPageScrollY = function (y) {
      scrollPinSavedY = Math.max(0, Number(y) || 0);
      /* roleModalScrollStay1: mark pinned so pin() keeps this Y (non rileggere pageScrollY=0) */
      scrollPinned = true;
      /* bootScrollLock4: non-zero means user scroll — do not treat as boot zero */
      scrollPinFromBoot = scrollPinSavedY === 0;
    };
    window.__vcHoldPageScroll = holdPageScroll;
    /* modalScrollStay3: capture Y BEFORE overflow:hidden modal classes, then pin+restore */
    window.__vcArmModalScrollLock = function (opts) {
      opts = opts || {};
      var y = pageScrollY();
      try {
        if (scrollPinned && Number(scrollPinSavedY) > y) y = Number(scrollPinSavedY) || 0;
      } catch (ePinMax) {}
      try {
        if (opts.y != null && Number.isFinite(Number(opts.y))) {
          y = Math.max(y, Math.max(0, Number(opts.y) || 0));
        }
      } catch (eOptY) {}
      scrollPinSavedY = Math.max(0, Number(y) || 0);
      scrollPinned = true;
      scrollPinFromBoot = false;
      try {
        if (opts.datasetKey) {
          document.documentElement.dataset[String(opts.datasetKey)] = String(scrollPinSavedY);
        }
      } catch (eDs) {}
      try {
        String(opts.htmlClass || "")
          .split(/\s+/)
          .forEach(function (c) {
            if (c) document.documentElement.classList.add(c);
          });
        String(opts.bodyClass || "")
          .split(/\s+/)
          .forEach(function (c) {
            if (c && document.body) document.body.classList.add(c);
          });
      } catch (eCls) {}
      try {
        document.documentElement.classList.add("vc-scroll-soft-lock");
      } catch (eSoft) {}
      try {
        pinPageScroll({ soft: true, forcePhoneLock: true });
      } catch (ePin) {}
      restorePageScrollY(scrollPinSavedY);
      holdPageScroll(opts.holdMs != null ? Number(opts.holdMs) || 0 : 360, scrollPinSavedY);
      return scrollPinSavedY;
    };
    window.__vcReleaseModalScrollLock = function (opts) {
      opts = opts || {};
      var y = Number(scrollPinSavedY) || 0;
      try {
        if (opts.datasetKey && document.documentElement.dataset[String(opts.datasetKey)] != null) {
          var dsY = Number(document.documentElement.dataset[String(opts.datasetKey)]) || 0;
          if (dsY > y) y = dsY;
          delete document.documentElement.dataset[String(opts.datasetKey)];
        }
      } catch (eDs) {}
      try {
        if (opts.y != null && Number.isFinite(Number(opts.y))) {
          y = Math.max(y, Math.max(0, Number(opts.y) || 0));
        }
      } catch (eOptY) {}
      if (y > 0) {
        scrollPinSavedY = y;
        scrollPinned = true;
        scrollPinFromBoot = false;
      }
      try {
        String(opts.htmlClass || "")
          .split(/\s+/)
          .forEach(function (c) {
            if (c) document.documentElement.classList.remove(c);
          });
        String(opts.bodyClass || "")
          .split(/\s+/)
          .forEach(function (c) {
            if (c && document.body) document.body.classList.remove(c);
          });
      } catch (eCls) {}
      try {
        unpinPageScroll();
      } catch (eUnpin) {}
      if (y > 0) {
        restorePageScrollY(y);
        holdPageScroll(opts.holdMs != null ? Number(opts.holdMs) || 0 : 280, y);
      }
      return y;
    };
  } catch (ePinExport) {}

  function isLoaderScrollLocked() {
    try {
      var root = document.documentElement;
      if (root.classList.contains("vc-loading-scroll-lock")) return true;
      if (root.classList.contains("vc-loader-blocking-live")) return true;
      if (root.classList.contains("vc-page-cine-boot") && !root.classList.contains("vc-page-cine-ready")) {
        return true;
      }
      if (root.classList.contains("vc-user-leader-pending")) return true;
      if (root.classList.contains("vc-user-profile-pending")) return true;
      /* inboxFreezeKill2: non lockare scroll per inbox staff loading */
    } catch (eLockCls) {}
    return false;
  }

  function isNotifPanelScrollTarget(t) {
    /* notifSidebar5: wheel/touch on panel content must scroll — not be swallowed by guards/PTR */
    try {
      if (!t || !t.closest) return false;
      return Boolean(
        t.closest(
          ".vc-notif-panel-body, .vc-notif-list, .vc-notif-list-wrap, .vc-notif-bell-pane, .vc-notif-bell-inbox, .vc-notif-panel",
        ),
      );
    } catch (eHit) {
      return false;
    }
  }

  function blockLoaderScroll(e) {
    try {
      var tPtr = e && e.target;
      if (isNotifPanelScrollTarget(tPtr)) return;
    } catch (eNotifAllow) {}
    if (window.__vcPtrTracking) {
      /* phoneSheetPtrLock1: if a sheet/modal froze the page, kill PTR mid-gesture */
      try {
        if (typeof isPageScrollFrozen === "function" && isPageScrollFrozen()) {
          try {
            e.preventDefault();
          } catch (ePrevPtr) {}
        }
      } catch (eFr) {}
      return;
    }
    if (!isPageScrollFrozen() && !isLoaderScrollLocked()) return;
    try {
      var t = e && e.target;
      if (t && t.closest) {
        if (
          t.closest(
            ".vc-staff-stat-sheet__body, .vc-staff-stat-sheet__panel, .vc-staff-stat-sheet__close, .vc-staff-manage-sheet__panel, .vc-staff-manage-sheet__body, .vc-staff-manage-sheet__close, .vc-staff-reso-sheet__body, .vc-staff-reso-sheet__panel, .vc-staff-reso-sheet__close, .vc-feedback-sheet__body, .vc-feedback-sheet__panel, .vc-feedback-sheet__close, .vc-staff-inbox-sheet .vc-feedback-sheet__body, .vc-staff-datepicker.is-sheet, #vc-staff-inbox, #vc-staff-inbox-list, .vc-notif-staff-inbox, .vc-staff-inbox-body, .vc-staff-inbox-layout, .vc-notif-panel-body, .vc-notif-list, .vc-notif-list-wrap, .vc-notif-bell-pane, .vc-notif-bell-inbox, .vc-notif-panel, .vc-notif-close-mobile, .vc-dialog__text, .vc-dialog__field, .vc-dash-confirm__text, .vc-mobile-nav-drawer__scroll, [data-stat-close], [data-manage-close], [data-reso-close], [data-feedback-close], [data-conf-sheet-close]",
          )
        ) {
          return;
        }
        if (t.closest(".vc-staff-peer-dock, .vc-notif-mobile-backdrop, .vc-staff-stat-sheet__backdrop, .vc-staff-manage-sheet__backdrop, .vc-staff-reso-sheet__backdrop, .vc-feedback-sheet__backdrop, .vc-dialog__backdrop, .vc-dash-confirm__backdrop, .vc-staff-datepicker-backdrop, .vc-reviews-modal__backdrop")) {
          /* sheetCloseTap1: preventDefault su touchmove uccide il click iOS di chiusura */
          if (e.type === "wheel") {
            try {
              e.preventDefault();
            } catch (ePrevBg) {}
          }
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
                try {
      if (isBlockingLoaderVisible()) return true;
      if (isLoaderScrollLocked()) return true;
      var root = document.documentElement;
      if (root.classList.contains("vc-dialog-open")) return true;
      if (root.classList.contains("vc-dash-confirm-open")) return true;
      if (isNotifPanelChromeOpen(root)) return true;
      if (root.classList.contains("vc-staff-manage-sheet-open")) return true;
      if (root.classList.contains("vc-staff-stat-sheet-open")) return true;
      if (root.classList.contains("vc-staff-reso-sheet-open")) return true;
      if (root.classList.contains("vc-feedback-sheet-open")) return true;
      if (root.classList.contains("vc-staff-datepicker-open")) return true;
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

  function isSheetChromeOpen(rootEl) {
    var root = rootEl || document.documentElement;
    try {
      if (
        root.classList.contains("vc-staff-manage-sheet-open") ||
        root.classList.contains("vc-staff-stat-sheet-open") ||
        root.classList.contains("vc-staff-reso-sheet-open") ||
        root.classList.contains("vc-feedback-sheet-open") ||
        root.classList.contains("vc-staff-datepicker-open") ||
        root.classList.contains("vc-dialog-open") ||
        root.classList.contains("vc-dash-confirm-open") ||
        root.classList.contains("vc-reviews-modal-open") ||
        root.classList.contains("vc-dash-cmds-modal-open") ||
        root.classList.contains("vc-wfc-subject-open")
      ) {
        return true;
      }
      /* modalScrollStay3: login/role modals lock on body */
      if (document.body && document.body.classList.contains("vc-role-modal-open")) return true;
      if (document.body && document.body.classList.contains("vc-dash-cmds-modal-open")) return true;
      return false;
    } catch (eSheet) {
      return false;
    }
  }

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

    /* notifPhoneOpenFix1: skip re-pin when nothing changed — restoreY every tick made sheets jitter. */
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

    var softPin = !needGuards;
    try {
      if (document.documentElement.classList.contains("vc-mobile-nav-open")) softPin = true;
    } catch (eSoftNav) {}
    /* phoneGateLock1: while a blocking loader/boot is up, hard-lock scroll on phone too. */
    var phone = false;
    try {
      phone = isCoarsePointerDevice() || isStandalonePwaLocal();
    } catch (ePh) {
      phone = true;
    }
    var bootPending = false;
    var pendingGate = false;
    try {
      var rootLock = document.documentElement;
      bootPending =
        rootLock.classList.contains("vc-page-cine-boot") &&
        !rootLock.classList.contains("vc-page-cine-ready");
      pendingGate =
        rootLock.classList.contains("vc-user-leader-pending") ||
        rootLock.classList.contains("vc-user-profile-pending") ||
        rootLock.classList.contains("vc-rank-customize-pending") ||
        rootLock.classList.contains("vc-custom-profile-pending") ||
        rootLock.classList.contains("vc-session-verify-pending") ||
        (rootLock.classList.contains("vc-staff-access-pending") &&
          !rootLock.classList.contains("vc-staff-app-revealed"));
      /* inboxFreezeKill2: vc-notif-staff-loading rimosso da pendingGate */
    } catch (eGate) {}
    var wantLock = Boolean(on || frozen || bootPending || pendingGate);
    /* phoneNavTapFix1: hamburger alone must not arm loading-scroll-lock / soft-lock.
       CSS `.vc-mobile-nav-open` already freezes page scroll; soft-lock ate iOS tile taps. */
    try {
      var rootNavOnly = document.documentElement;
      var navOnly =
        rootNavOnly.classList.contains("vc-mobile-nav-open") &&
        !on &&
        !bootPending &&
        !pendingGate &&
        !isNotifPanelChromeOpen(rootNavOnly) &&
        !isSheetChromeOpen(rootNavOnly);
      if (navOnly) wantLock = false;
    } catch (eNavOnly) {}
    if (phone && wantLock) softPin = false;
    else if (phone) softPin = true;

    /* notifBellScrollStay3 / notifPhoneOpenFix1: never arm vc-loading-scroll-lock for
       notif/sheet-only — that class sets body{position:fixed;inset:0} and flashes scroll. */
    var notifOnlyLock = false;
    var sheetOnlyLock = false;
    try {
      var rootOverlayOnly = document.documentElement;
      notifOnlyLock =
        isNotifPanelChromeOpen(rootOverlayOnly) &&
        !on &&
        !bootPending &&
        !pendingGate;
      sheetOnlyLock =
        isSheetChromeOpen(rootOverlayOnly) &&
        !on &&
        !bootPending &&
        !pendingGate &&
        !isNotifPanelChromeOpen(rootOverlayOnly);
      if (notifOnlyLock || sheetOnlyLock) softPin = true;
    } catch (eOverlayOnly) {
      notifOnlyLock = false;
      sheetOnlyLock = false;
    }

    /* modalScrollStay3: never unpin while a modal/sheet still freezes the page */
    try {
      if (
        !wantLock &&
        scrollPinned &&
        typeof isPageScrollFrozen === "function" &&
        isPageScrollFrozen()
      ) {
        wantLock = true;
        softPin = true;
      }
    } catch (eKeepModal) {}
    if (phone && !wantLock) {
      if (scrollPinned) unpinPageScroll();
      try {
        document.documentElement.classList.remove("vc-ui-scroll-lock", "vc-scroll-soft-lock");
        document.documentElement.classList.remove("vc-loading-scroll-lock");
      } catch (ePhLock) {}
      bindLoaderScrollGuards(false);
    } else {
      if (wantLock) pinPageScroll({ soft: softPin, forcePhoneLock: sheetOnlyLock || notifOnlyLock });
      else if (scrollPinned) unpinPageScroll();
      try {
        document.documentElement.classList.remove("vc-ui-scroll-lock");
      } catch (eUiLockOff) {}
      try {
        document.documentElement.classList.toggle(
          "vc-loading-scroll-lock",
          wantLock && !notifOnlyLock && !sheetOnlyLock,
        );
        if (notifOnlyLock || sheetOnlyLock) {
          document.documentElement.classList.add("vc-scroll-soft-lock");
        }
      } catch (eLock) {}
      var guardsForBind = needGuards || (wantLock && !notifOnlyLock && !sheetOnlyLock);
      try {
        if (sheetOnlyLock || notifOnlyLock) guardsForBind = true;
      } catch (eGuardSheet) {}
      try {
        if (document.documentElement.classList.contains("vc-mobile-nav-open") && !on && !bootPending) {
          guardsForBind = false;
        }
      } catch (eGuardNav) {}
      bindLoaderScrollGuards(guardsForBind);
    }

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
    try {
      syncLoaderBlockingLiveClass();
    } catch (eLiveSync) {}
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
    /* notifBellStayOpen1: never kill an intentional open while portal guard is live */
    try {
      if (Date.now() < notifPortalGuardUntil) return;
      var ddGuard = document.getElementById("vc-notif-dropdown");
      if (ddGuard && (ddGuard.open || ddGuard.hasAttribute("open"))) {
        if (isNotifPanelChromeOpen(document.documentElement)) return;
      }
    } catch (eGuardClose) {}
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
        "vc-notif-drawer-open",
        "vc-notif-overlay-active",
      );
    } catch (e1) {}
  }

  function isNotifPanelChromeOpen(rootEl) {
    var root = rootEl || document.documentElement;
    try {
      return (
        root.classList.contains("vc-notif-sheet-open") ||
        root.classList.contains("vc-notif-drawer-open")
      );
    } catch (eOpen) {
      return false;
    }
  }

  function dismissNotifFlyToasts() {
    var cards = document.querySelectorAll(".vc-notif-fly-card, .vc-notif-ig-toast");
    var i;
    for (i = 0; i < cards.length; i += 1) {
      try {
        cards[i].remove();
      } catch (e0) {}
    }
    notifFlyActiveCount = 0;
    notifIgToastEl = null;
    notifIgToastCount = 0;
    if (notifIgToastTimer) {
      try {
        clearTimeout(notifIgToastTimer);
      } catch (eT) {}
      notifIgToastTimer = 0;
    }
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
      /* perfDeskCut1: coalescia class churn → 1 sync/frame */
      if (loaderClassMo._raf) return;
      loaderClassMo._raf = window.requestAnimationFrame(function () {
        loaderClassMo._raf = 0;
        scheduleLoaderScrollLock();
      });
    });
    loaderClassMo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
        function observeLoaderHidden(el) {
      if (!el || !el.getAttribute) return;
      try {
        loaderClassMo.observe(el, { attributes: true, attributeFilter: ["hidden", "class", "style"] });
      } catch (eObs) {}
    }
    function bindKnownLoaderObservers() {
      var ids = [
        "vc-ul-loading",
        "vc-roles-loading",
        "vc-rank-customize-loading",
        "vc-user-profile-loading",
        "vc-shared-boot-overlay",
        "vc-staff-loading",
        "vc-staff-inbox-loading",
        "vc-page-transition",
      ];
      for (var i = 0; i < ids.length; i++) {
        observeLoaderHidden(document.getElementById(ids[i]));
      }
      try {
        var list = document.querySelectorAll(
          ".vc-ul-loading, body > .vc-user-profile-loader, #vc-user-profile-view > .vc-user-profile-loader, #vc-user-profile-view > [data-vc-profile-boot]",
        );
        for (var j = 0; j < list.length; j++) observeLoaderHidden(list[j]);
      } catch (eList) {}
    }
    bindKnownLoaderObservers();
    var loaderBirthMo = null;
    /* pwaCpuNuke1: su PWA spegni MO class dopo ready — altrimenti class churn = CPU 100%+ */
    function disarmLoaderMosForPwa() {
      try {
        if (!(window.__VC_PWA_CPU_NUKE || document.documentElement.classList.contains("vc-pwa-cpu-nuke"))) {
          return;
        }
        try {
          loaderClassMo.disconnect();
        } catch (eD1) {}
        try {
          if (loaderBirthMo) loaderBirthMo.disconnect();
        } catch (eD2) {}
      } catch (eDis) {}
    }
    /* pwaCpuNuke4: disarm MO subito in PWA (2500ms = CPU storm al boot) */
    window.setTimeout(disarmLoaderMosForPwa, 400);
    window.setTimeout(disarmLoaderMosForPwa, 1200);
    window.setTimeout(disarmLoaderMosForPwa, 2500);
        try {
      loaderBirthMo = new MutationObserver(function (muts) {
        var need = false;
        for (var m = 0; m < muts.length; m++) {
          var nodes = muts[m].addedNodes || [];
          for (var n = 0; n < nodes.length; n++) {
            var node = nodes[n];
            if (!node || node.nodeType !== 1) continue;
            var el = node;
            if (
              (el.id && /loading|boot|transition/i.test(el.id)) ||
              (el.classList &&
                (el.classList.contains("vc-ul-loading") ||
                  el.classList.contains("vc-user-profile-loader") ||
                  el.classList.contains("vc-reviews-gate")))
            ) {
              observeLoaderHidden(el);
              need = true;
            }
          }
        }
        if (need) scheduleLoaderScrollLock();
      });
      if (document.body) {
        loaderBirthMo.observe(document.body, { childList: true, subtree: true });
      }
    } catch (eBirth) {}
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
      if (n) {
        // ampBakeFix1: bake JS often left &amp; — never show entity in tab title
        return n
          .replace(/&amp;/gi, "&")
          .replace(/&quot;/gi, '"')
          .replace(/&#39;/gi, "'")
          .replace(/&lt;/gi, "<")
          .replace(/&gt;/gi, ">");
      }
    } catch (eAuth) {}
    return "Vinili & Caffè";
  }

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
    /* perfBgRam1: in background niente blink 850ms — titolo statico (CPU) */
    try {
      if (document.hidden || (document.visibilityState && document.visibilityState !== "visible")) {
        if (windowAttentionTimer) {
          try {
            clearInterval(windowAttentionTimer);
          } catch (eClr) {}
          windowAttentionTimer = 0;
        }
        var baseH = captureBaseDocumentTitle() || "Vinili & Caffè";
        document.title = "● " + windowAttentionTitle + " · " + baseH;
        applyAttentionFavicon(true);
        return;
      }
    } catch (eBgAtt) {}
    if (windowAttentionTimer) return;
    windowAttentionOn = false;
    var tick = function () {
      if (!pageNeedsWindowAttention()) {
        stopWindowAttention();
        return;
      }
      try {
        if (document.hidden || (document.visibilityState && document.visibilityState !== "visible")) {
          stopWindowAttention();
          var baseStop = captureBaseDocumentTitle() || "Vinili & Caffè";
          document.title = "● " + windowAttentionTitle + " · " + baseStop;
          applyAttentionFavicon(true);
          return;
        }
      } catch (eTickBg) {}
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
    windowAttentionTimer = setInterval(tick, 2000);
  }

  window.vcRequestWindowAttention = requestWindowAttention;
  window.addEventListener("focus", stopWindowAttention);
  document.addEventListener("visibilitychange", function () {
    if (!pageNeedsWindowAttention()) stopWindowAttention();
  });
  window.addEventListener("blur", function () {
    try {
      stopWindowAttention();
    } catch (eAttn) {}
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
  function markSelfNotifSync() {
    /* handlerPerf1: 2× BroadcastChannel sulla stessa pagina eco-ano postMessage */
    try {
      window.__vcNotifSyncIgnoreUntil = Date.now() + 160;
    } catch (eIgn) {}
  }
  function isSelfNotifSync() {
    try {
      return Date.now() < Number(window.__vcNotifSyncIgnoreUntil || 0);
    } catch (eSelf) {
      return false;
    }
  }
  function notifyNotifStorePeers() {
    markSelfNotifSync();
    ignoreSelfNotifSync += 1;
    try {
      try {
        localStorage.setItem(NOTIF_SYNC_KEY, String(Date.now()) + ":" + Math.random().toString(36).slice(2, 8));
      } catch (ePing) {}
      try {
        if (notifSyncBc) notifSyncBc.postMessage({ t: Date.now() });
      } catch (eBcPost) {}
      try {
        window.dispatchEvent(new CustomEvent("vc:notifications-sync"));
      } catch (eEv) {}
    } finally {
      window.setTimeout(function () {
        ignoreSelfNotifSync = Math.max(0, ignoreSelfNotifSync - 1);
      }, 0);
    }
  }
  function armNotifPeerSync() {
    if (window.__vcNotifPeerUiSyncTimer) return;
    window.__vcNotifPeerUiSyncTimer = window.setTimeout(function () {
      window.__vcNotifPeerUiSyncTimer = 0;
      if (ignoreSelfNotifSync > 0 || isSelfNotifSync()) return;
      try {
        if (document.hidden || document.visibilityState === "hidden") {
          window.__vcNotifPeerSyncWhenVisible = 1;
          return;
        }
      } catch (eHid) {}
      var needLanding = Boolean(window.__vcNotifPeerNeedLanding);
      var needPage = Boolean(window.__vcNotifPeerNeedPage);
      window.__vcNotifPeerNeedLanding = 0;
      window.__vcNotifPeerNeedPage = 0;
      if (needLanding || !needPage) {
        lastNotifRenderSig = "";
        try {
          /* notifCatLoadFix1: con Inbox aperta+categorie, soft paint (no wipe force) */
          if (typeof shouldPreserveBellInboxList === "function" && shouldPreserveBellInboxList()) {
            render({ force: false });
            try {
              paintNotifBellBadgeFromStore();
            } catch (eBadgeSoft) {}
          } else {
            render({ force: true });
          }
        } catch (eRen) {}
        if (normalizeUserId(currentUserId) && getDiscordAccessToken()) {
          if (notifPeerSyncTimer) clearTimeout(notifPeerSyncTimer);
          notifPeerSyncTimer = setTimeout(function () {
            notifPeerSyncTimer = null;
            syncSiteNotificationsFromServer();
          }, 450);
        }
      }
      if (needPage) {
        try {
          window.dispatchEvent(new CustomEvent("vc:notifications-page-peer-sync"));
        } catch (ePage) {}
      }
    }, 90);
  }
  try {
    window.__vcArmNotifPeerSync = armNotifPeerSync;
  } catch (eArm) {}
  function onNotifStorePeerSync() {
    if (ignoreSelfNotifSync > 0 || isSelfNotifSync()) return;
    /* handlerPerf1: coalescia storage+BC+custom (prima: 800ms×N forced reflow) */
    window.__vcNotifPeerNeedLanding = 1;
    armNotifPeerSync();
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
  function isClientLocalNotifId(id) {
    var s = String(id || "").trim();
    if (s.indexOf("auto:") === 0 || s.indexOf("sys:") === 0) return true;
    /* pwaPushBellBadge1: id generati da addNotif (timestamp-rand) */
    if (/^\d{10,14}-\d{1,12}$/.test(s)) return true;
    return false;
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
    /* notifSheetSync1: map id → timestamp; legacy array → now */
    var map = {};
    var now = Date.now();
    try {
      var data = raw ? JSON.parse(raw) : null;
      if (Array.isArray(data)) {
        for (var i = 0; i < data.length; i += 1) {
          var id = String(data[i] || "").trim();
          if (id) map[id] = now;
        }
      } else if (data && typeof data === "object") {
        for (var k in data) {
          if (!Object.prototype.hasOwnProperty.call(data, k)) continue;
          var sid = String(k || "").trim();
          if (!sid) continue;
          var ts = Number(data[k]);
          map[sid] = Number.isFinite(ts) && ts > 0 ? ts : now;
        }
      }
    } catch (e) {}
    return map;
  }
  function isFreshPendingTs(ts) {
    var n = Number(ts);
    return Number.isFinite(n) && n > 0 && Date.now() - n < PENDING_READ_TTL_MS;
  }
  function prunePendingReadMap(map) {
    var out = {};
    var src = map && typeof map === "object" ? map : {};
    for (var k in src) {
      if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
      if (isFreshPendingTs(src[k])) out[k] = Number(src[k]);
    }
    return out;
  }
  function loadPendingReadMap() {
    var map = parsePendingIdMap(readPendingRaw(pendingReadKey()));
    var anon = parsePendingIdMap(readPendingRaw(PENDING_READ_PREFIX + "anon"));
    var k;
    for (k in anon) {
      if (Object.prototype.hasOwnProperty.call(anon, k)) map[k] = anon[k];
    }
    var pruned = prunePendingReadMap(map);
    if (Object.keys(pruned).length !== Object.keys(map).length) {
      savePendingReadMap(pruned);
    }
    return pruned;
  }
  function savePendingReadMap(map) {
    var pruned = prunePendingReadMap(map);
    writePendingRaw(pendingReadKey(), JSON.stringify(pruned || {}));
    if (normalizeUserId(currentUserId)) {
      writePendingRaw(PENDING_READ_PREFIX + "anon", "{}");
    }
  }
  function migrateUnreadKeep1PendingClear() {
    /* notifUnreadKeep1: pending era avvelenato dall’auto mark-all su /notifications/ */
    try {
      if (localStorage.getItem("vc_notif_unread_keep1_mig") === "1") return;
      savePendingReadMap({});
      writePendingRaw(PENDING_READ_PREFIX + "anon", "[]");
      localStorage.setItem("vc_notif_unread_keep1_mig", "1");
    } catch (eMig) {}
  }
  function isPendingRead(id) {
    var sid = String(id || "").trim();
    if (!sid) return false;
    return isFreshPendingTs(loadPendingReadMap()[sid]);
  }
  function rememberPendingRead(id) {
    var sid = String(id || "").trim();
    if (!sid) return;
    var map = loadPendingReadMap();
    map[sid] = Date.now();
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
    /* swLsStorm2: niente Cache API laterale — SW non scrive pending-read.
       Una sola passata boot (flag); poi skip. */
    try {
      if (window.__vcPendingReadCacheDone) return Promise.resolve();
      window.__vcPendingReadCacheDone = 1;
    } catch (eFlag) {}
    try {
      if (
        window.__VC_PWA_CPU_NUKE ||
        document.documentElement.classList.contains("vc-pwa-cpu-nuke") ||
        (window.VcPerf && typeof window.VcPerf.isStandalonePwa === "function" && window.VcPerf.isStandalonePwa())
      ) {
        return Promise.resolve();
      }
    } catch (ePwa) {}
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
    if (tid) {
      try {
        var path = String(location.pathname || "").replace(/\/+$/, "") || "/";
        if (!/\/tickets$/i.test(path)) return false;
        return ticketIdFromLocation() === tid;
      } catch (e) {
        return false;
      }
    }
    /* pushReuseClient1: anche non-ticket — stesso path+query+hash = già lì */
    try {
      var want = String(url || "").trim();
      if (!want) return false;
      var dest = new URL(want, location.origin);
      if (dest.origin !== location.origin) return false;
      var herePath = String(location.pathname || "").replace(/\/+$/, "") || "/";
      var destPath = String(dest.pathname || "").replace(/\/+$/, "") || "/";
      if (herePath !== destPath) return false;
      if (String(location.search || "") !== String(dest.search || "")) return false;
      if (String(location.hash || "") !== String(dest.hash || "")) return false;
      return true;
    } catch (e2) {
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
    /* pushBellFocusFix1: anche se già sul ticket, forza open event (tab corretta) */
    if (alreadyOnOpenDest(dest, ticketId)) {
      try {
        window.focus();
      } catch (eFocusAlready) {}
      try {
        var tidHere = ticketIdFromOpenDest(dest, ticketId);
        if (tidHere) {
          window.dispatchEvent(
            new CustomEvent("vc:web-tickets-open", {
              detail: { id: tidHere, staff: /[?&]view=staff/i.test(String(dest)) },
            }),
          );
        }
      } catch (eAlready) {}
      pendingNavApplying = false;
      return;
    }
    pendingNavApplying = true;
    try {
      if (pendingNavPollTimer) {
        clearInterval(pendingNavPollTimer);
        pendingNavPollTimer = 0;
      }
    } catch (eT) {}
    try {
      openNotifDestination(resolveNotifDestUrl(dest), "ticket");
    } finally {
      window.setTimeout(function () {
        pendingNavApplying = false;
      }, 800);
    }
  }
  function consumePendingNavFromSwCache() {
    /* swLsStorm2: una sola passata boot — no poll Cache API */
    /* pushOpenCold1: anche PWA (cold start apre start_url; pending da notificationclick) */
    /* pushOpenCold2: su PWA cold (?app= o standalone home) ritenta ~2s */
    /* pushReuseClient1: ritenta su QUALSIASI standalone (non solo home) — OS a volte ripristina ultima route */
    try {
      if (window.__vcPendingNavCacheDone === 2) return Promise.resolve(false);
    } catch (eFlag) {}
    if (!("caches" in window)) return Promise.resolve(false);
    var coldPwa = false;
    try {
      var standalone =
        (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
        Boolean(navigator.standalone);
      coldPwa = Boolean(standalone);
    } catch (eCold) {}
    var delays = coldPwa ? [0, 120, 350, 700, 1200, 2000] : [0, 200];
    function once() {
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
                  try {
                    applyOpenDest(url, ticketId);
                  } catch (eSoft) {}
                  return true;
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
    function step(i) {
      return once().then(function (ok) {
        if (ok) {
          try {
            window.__vcPendingNavCacheDone = 2;
          } catch (eD) {}
          return true;
        }
        if (i + 1 >= delays.length) {
          try {
            window.__vcPendingNavCacheDone = 2;
          } catch (eD2) {}
          return false;
        }
        return new Promise(function (resolve) {
          window.setTimeout(function () {
            resolve(step(i + 1));
          }, delays[i + 1]);
        });
      });
    }
    try {
      window.__vcPendingNavCacheDone = 1;
    } catch (eSet) {}
    return step(0);
  }
  function startPendingNavPoll() {
    /* swLsStorm2: niente interval Cache. Un check boot + write SW su notificationclick. */
    if (pendingNavPollTimer) return;
    pendingNavPollTimer = -1;
    try {
      consumePendingNavFromSwCache();
    } catch (eOnce) {}
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
  function extractWorkflowDedupeFromOpenUrl(openUrl) {
    var raw = String(openUrl || "").trim();
    if (!raw) return "";
    try {
      var u = new URL(raw, window.location.origin);
      var dk =
        String(u.searchParams.get("dedupeKey") || "").trim() ||
        String(u.searchParams.get("chat") || "").trim();
      return dk;
    } catch (e) {
      return "";
    }
  }
  function isWatchingWorkflowChat(openUrl, dedupeKeyHint) {
    if (document.visibilityState !== "visible") return false;
    try {
      if (typeof document.hasFocus === "function" && !document.hasFocus()) return false;
    } catch (eFocus) {}
    var want =
      String(dedupeKeyHint || "").trim() || extractWorkflowDedupeFromOpenUrl(openUrl);
    if (!want) return false;
    try {
      var watching = window.__VC_WATCHING_WORKFLOW;
      if (watching && String(watching.dedupeKey || "").trim() === want) return true;
    } catch (e1) {}
    try {
      var root = document.getElementById("vc-wfc-root");
      if (root && String(root.getAttribute("data-dedupe-key") || "").trim() === want) return true;
    } catch (e2) {}
    return false;
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
    function shouldPlayNotifAlert(row) {
    if (!row || row.read) return false;
    var id = String(row.id || "").trim();
    if (id && wasAlreadyToasted(id)) return false;
    /* pushFocusShow1: recentlyGotOsPush blocca solo se toast già fatto; altrimenti sync ripara toast/badge */
    if (recentlyGotOsPush(row) && id && wasAlreadyToasted(id)) return false;
    if (recentlyGotOsPush(row) && !id) return false;
    return true;
  }
  function rememberToastedForDismissPush(p) {
    if (!p || typeof p !== "object") return;
    if (p.all === true) {
      loadStored().forEach(function (x) {
        var xid = String((x && x.id) || "").trim();
        if (xid) rememberToastedId(xid);
      });
      return;
    }
    var sid = String(p.id || "").trim();
    if (sid) rememberToastedId(sid);
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
      var at = Number(localStorage.getItem(clearAllStampKey()) || 0) || 0;
      if (!at) return 0;
      if (Date.now() - at > CLEAR_ALL_TTL_MS) {
        try {
          localStorage.removeItem(clearAllStampKey());
        } catch (eClr) {}
        return 0;
      }
      return at;
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
      if (
        (id && isFreshPendingTs(map[id]) && !x.read) ||
        (fp && isFreshPendingTs(map[fp]) && !x.read)
      ) {
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

  /* notifCats3: classify personal vs inbox; split tickets/reviews/feedback; Punti tolti subject. */
  /* notifUseful1: Mentions + candidature/appelli personal + SLA */
  var DEDICATED_INBOX_QUEUES = {
    pause: 1,
    candidature: 1,
    appelli: 1,
    resoconti: 1,
    "punti-tolti": 1,
  };
  function inboxQueueIdFromNotifUrl(raw) {
    var s = String(raw || "").trim();
    if (!s) return "";
    try {
      var u = new URL(s, window.location.origin);
      var inbox = String(u.searchParams.get("inbox") || "")
        .trim()
        .toLowerCase();
      return DEDICATED_INBOX_QUEUES[inbox] ? inbox : "";
    } catch (eUrl) {
      var m = s.toLowerCase().match(/[?&]inbox=(pause|candidature|appelli|resoconti|punti-tolti)\b/);
      return m ? m[1] : "";
    }
  }
  function isVoteRegisteredNotifClient(n) {
    if (!n) return false;
    var kind = String(n.kind || "").toLowerCase();
    var title = String(n.title || "");
    var body = String(n.body || "");
    var hay = (title + " " + body).toLowerCase();
    if (kind === "vote_reminder") return false;
    if (/promemoria|puoi votare di nuovo|reminder/.test(hay)) return false;
    if (kind === "vote") return true;
    if (/voto\s+(su\s+)?(top\.?gg|discadia)\s+registrato/.test(hay)) return true;
    if (/voto registrato/.test(hay) && /(top\.?gg|discadia)/.test(hay)) return true;
    return false;
  }
  function notifMetaKey(n) {
    return String((n && (n.dedupeKey || n.id)) || "").toLowerCase();
  }
  function isPuntiToltiSubjectNotifClient(n) {
    if (!n) return false;
    var key = notifMetaKey(n);
    if (/^pt-removed:/.test(key) || /^pt-review:/.test(key)) return true;
    var hay = (String(n.title || "") + " " + String(n.body || "")).toLowerCase();
    return /punto partnership rimosso|punti tolti\s*[—\-–]?\s*(rimozione confermata|segnalazione negata)/.test(
      hay,
    );
  }
  function isPersonalTicketOpenerNotifClient(n) {
    if (!n) return false;
    var ch = String(n.channel || "").toLowerCase();
    var url = String(n.openUrl || "").toLowerCase();
    if (ch === "inbox" || /(?:\?|&)view=staff\b/.test(url)) return false;
    var key = notifMetaKey(n);
    if (
      /^web_ticket:(staff_reply|needs_reply|closed|claimed|close-request|close-rejected|event):/.test(key)
    ) {
      return true;
    }
    if (ch === "personal") {
      var k0 = String(n.kind || "").toLowerCase();
      if (k0 === "web_ticket" || k0 === "web_ticket_mention") return true;
    }
    var k = String(n.kind || "").toLowerCase();
    if (k !== "web_ticket" && k !== "web_ticket_mention") return false;
    return /\/tickets\//.test(url) && !/(?:\?|&)view=staff\b/.test(url);
  }
  function isStaffTicketSlaNotifClient(n) {
    if (!n) return false;
    if (String(n.kind || "").toLowerCase() === "web_ticket_sla") return true;
    return /^web_ticket:sla:/.test(notifMetaKey(n));
  }
  function isMentionNotifClient(n) {
    if (!n) return false;
    var k = String(n.kind || "").toLowerCase();
    if (k === "web_ticket_mention" || k === "workflow_mention") return true;
    var key = notifMetaKey(n);
    return /^web_ticket:mention:/.test(key) || /^wfc:mention:/.test(key);
  }
  function isWorkflowDecisionNotifClient(n) {
    if (!n) return false;
    if (String(n.kind || "").toLowerCase() === "workflow_decision") return true;
    var key = notifMetaKey(n);
    return /^(cand-|unban-|unmute-|cand-pex-|cand-rej-|wfc:decision:|appeal-auto-close:)/.test(key);
  }
  function isStaffTicketNotifClient(n) {
    if (!n) return false;
    if (isPersonalTicketOpenerNotifClient(n)) return false;
    if (isStaffTicketSlaNotifClient(n)) return true;
    var key = notifMetaKey(n);
    if (/^web_ticket:queue:/.test(key) || /^web_ticket:chat:/.test(key) || /^web_ticket:sla:/.test(key)) {
      return true;
    }
    var kind = String(n.kind || "").toLowerCase();
    if (kind === "web_ticket_sla") return true;
    if (kind === "web_ticket_mention" || kind === "workflow_mention") {
      var urlM = String(n.openUrl || "").toLowerCase();
      if (/\/tickets\//.test(urlM) && /(?:\?|&)view=staff\b/.test(urlM)) return true;
      if (String(n.channel || "").toLowerCase() === "inbox") return true;
      return false;
    }
    if (kind !== "web_ticket" && kind !== "web_ticket_mention") return false;
    var url = String(n.openUrl || "").toLowerCase();
    return /\/tickets\//.test(url) && /(?:\?|&)view=staff\b/.test(url);
  }
  function isStaffReviewNotifClient(n) {
    if (!n) return false;
    var key = notifMetaKey(n);
    if (/^rev-new:/.test(key)) return true;
    if (String(n.kind || "").toLowerCase() !== "review") return false;
    return /^nuova recensione\b/i.test(String(n.title || "").trim());
  }
  function isStaffFeedbackNotifClient(n) {
    if (!n) return false;
    var key = notifMetaKey(n);
    if (/^suggestion:new:/.test(key) || /^bot_feedback_new:/.test(key)) return true;
    if (String(n.kind || "").toLowerCase() !== "suggestion") return false;
    var url = String(n.openUrl || "").toLowerCase();
    /* staffFeedbackCommentInbox1: commenti/risposte su feedback staff → Inbox */
    if (/\/feedback\/?/.test(url) && /(?:\?|&)board=staff\b/.test(url)) return true;
    if (String(n.channel || "").toLowerCase() === "inbox" && /\/feedback\/?/.test(url)) return true;
    return /^(nuovo|nuova)\s+(suggerimento|segnalazione|bug)\b/i.test(String(n.title || "").trim());
  }
  function isDedicatedInboxQueueAlertClient(n) {
    if (!n) return false;
    var ch = String(n.channel || "").toLowerCase();
    if (ch === "personal") return false;
    var key = notifMetaKey(n);
    if (
      /^pt-removed:/.test(key) ||
      /^pt-review:/.test(key) ||
      /^pause:decision:/.test(key) ||
      /^val-/.test(key) ||
      /^wfc:(invite|remove|msg):subj:/.test(key) ||
      /^wfc:decision:/.test(key)
    ) {
      return false;
    }
    if (isPuntiToltiSubjectNotifClient(n)) return false;
    if (isWorkflowDecisionNotifClient(n)) return false;
    if (/^inbox:(pause|candidature|appelli|resoconti)(?::|$)/.test(key)) return true;
    if (/^pt-pending:/.test(key)) return true;
    if (/^wfc:(invite|remove|msg):staff:/.test(key)) return true;
    var queue = inboxQueueIdFromNotifUrl(n.openUrl);
    if (!queue) return false;
    var hay = (String(n.title || "") + " " + String(n.body || "")).toLowerCase();
    if (
      /nuovo resoconto|nuovo appello|nuova candidatur|nuova richiesta pausa|punti tolti\s*[—\-–]?\s*segnalazione in attesa|richiedente in chat/.test(
        hay,
      )
    ) {
      return true;
    }
    return false;
  }
  /* confessionaleInboxCat1: Inbox category Confessioni + id-badge icons */
  function isConfessionaleNotifClient(n) {
    if (!n) return false;
    var kind = String(n.kind || "").toLowerCase();
    if (kind === "confessionale") return true;
    var key = String(n.dedupeKey || "").toLowerCase();
    if (/^confessionale:/.test(key)) return true;
    var url = String(n.openUrl || "").toLowerCase();
    if (/\/staff\/confessionale\//.test(url)) return true;
    if (/\/confessionale\/?/.test(url)) return true;
    return false;
  }
  function isCompitiNotifClient(n) {
    /* staffCompitiNotif1 */
    if (!n) return false;
    var key = String(n.dedupeKey || "").toLowerCase();
    if (/^compiti:/.test(key)) return true;
    var url = String(n.openUrl || "").toLowerCase();
    if (/\/staff\/compiti\/?/.test(url)) return true;
    var title = String(n.title || "").toLowerCase();
    if (/^compito\b/.test(title) || /scadenza compiti/.test(title)) return true;
    return false;
  }
  function isStaffTeamPexDepexNotifClient(n) {
    if (!n) return false;
    var key = String(n.dedupeKey || "").toLowerCase();
    if (/^staff-(pex|depex):.+:team$/.test(key)) return true;
    var title = String(n.title || "").trim();
    var url = String(n.openUrl || "").toLowerCase();
    if (/\/staff\/organico\/?/.test(url) && /^(pex|depex):\s+\S/i.test(title)) return true;
    return false;
  }
  function isInboxLinkedNotifClient(n) {
    if (!n) return false;
    /* Subject/staff splits win over stale channel=personal. */
    if (isWorkflowDecisionNotifClient(n) || isPersonalTicketOpenerNotifClient(n)) return false;
    if (isStaffTeamPexDepexNotifClient(n)) return true;
    if (isConfessionaleNotifClient(n)) return true;
    if (isCompitiNotifClient(n)) return true;
    if (isPuntiToltiSubjectNotifClient(n)) return true;
    if (isStaffTicketSlaNotifClient(n)) return true;
    if (isStaffTicketNotifClient(n)) return true;
    if (isStaffReviewNotifClient(n)) return true;
    if (isStaffFeedbackNotifClient(n)) return true;
    if (isMentionNotifClient(n) && String(n.channel || "").toLowerCase() !== "personal") return true;
    var ch = String(n.channel || "").toLowerCase();
    if (ch === "personal") return false;
    if (ch === "inbox") return true;
    if (isDedicatedInboxQueueAlertClient(n)) return true;
    var key = String(n.dedupeKey || "").toLowerCase();
    if (
      /^inbox:/.test(key) ||
      /^wfc:(invite|remove|msg):staff:/.test(key) ||
      /^wfc:mention:/.test(key) ||
      /^pt-pending:/.test(key) ||
      /^web_ticket:sla:/.test(key) ||
      /^compiti:/.test(key) ||
      /^staff-(pex|depex):.+:team$/.test(key)
    ) {
      return true;
    }
    return false;
  }
  function inboxNotifBucket(n) {
    if (isConfessionaleNotifClient(n)) return "confessionale";
    if (isCompitiNotifClient(n)) return "compiti";
    if (isPuntiToltiSubjectNotifClient(n)) return "avvisi";
    if (isMentionNotifClient(n)) return "mentions";
    if (isStaffTicketSlaNotifClient(n) || isStaffTicketNotifClient(n)) return "tickets";
    if (isStaffReviewNotifClient(n)) return "reviews";
    if (isStaffFeedbackNotifClient(n)) return "feedback";
    return "avvisi";
  }
  function personalNotifCategory(n) {
    var kind = String((n && n.kind) || "info").toLowerCase();
    var key = notifMetaKey(n);
    if (kind === "vote" || kind === "vote_reminder") return "votes";
    if (kind === "web_ticket" || kind === "web_ticket_mention") return "tickets";
    if (isMentionNotifClient(n)) return "tickets";
    if (isWorkflowDecisionNotifClient(n)) {
      if (/appelli|unban|unmute|appeal/.test(key + " " + String(n.openUrl || "").toLowerCase())) {
        return "appelli";
      }
      return "candidature";
    }
    if (kind === "review") return "reviews";
    if (kind === "suggestion") return "feedback";
    if (kind === "confessionale" || isConfessionaleNotifClient(n)) return "confessionale";
    if (kind === "staff") return "staff";
    if (kind === "mod" || kind === "success") return "community";
    return "system";
  }
  var PERSONAL_NOTIF_CATS = [
    { id: "votes", label: "Voti", ico: "fa-clock-o" },
    { id: "tickets", label: "Ticket", ico: "fa-ticket" },
    { id: "candidature", label: "Candidature", ico: "fa-file-text-o" },
    { id: "appelli", label: "Appelli", ico: "fa-gavel" },
    { id: "reviews", label: "Recensioni", ico: "fa-star" },
    { id: "feedback", label: "Feedback", ico: "fa-magic" },
    { id: "confessionale", label: "Confessioni", ico: "fa-id-badge" },
    { id: "staff", label: "Eventi staff", ico: "fa-id-badge" },
    { id: "community", label: "Community", ico: "fa-users" },
    { id: "system", label: "Sistema", ico: "fa-bell-o" },
  ];
  var INBOX_NOTIF_CATS = [
    { id: "confessionale", label: "Confessioni", ico: "fa-id-badge" },
    { id: "compiti", label: "Compiti", ico: "fa-book" },
    { id: "tickets", label: "Ticket", ico: "fa-ticket" },
    { id: "mentions", label: "Mentions", ico: "fa-at" },
    { id: "reviews", label: "Recensioni", ico: "fa-star" },
    { id: "feedback", label: "Feedback", ico: "fa-magic" },
    { id: "avvisi", label: "Avvisi", ico: "fa-bell" },
  ];
  function groupPersonalNotifsByCategory(items) {
    var buckets = Object.create(null);
    for (var i = 0; i < PERSONAL_NOTIF_CATS.length; i++) buckets[PERSONAL_NOTIF_CATS[i].id] = [];
    (items || []).forEach(function (n) {
      var id = personalNotifCategory(n);
      if (!buckets[id]) buckets[id] = [];
      buckets[id].push(n);
    });
    return PERSONAL_NOTIF_CATS.map(function (cat) {
      return { id: cat.id, label: cat.label, ico: cat.ico, items: buckets[cat.id] || [] };
    }).filter(function (g) {
      return g.items.length > 0;
    });
  }
  function inboxChannelRowsFromStore() {
    var s = loadStored();
    var uid = normalizeUserId(currentUserId);
    var dismissed = loadDismissedSet(uid);
    return s.filter(function (n) {
      return (
        !isClearedAwayServerRow(n, dismissed) &&
        !isFilteredNotif(n) &&
        !isVoteRegisteredNotifClient(n) &&
        /* notifBellInboxBadge1: include dedicated queue alerts (candidature/appelli/pause…)
           — before they were inbox-linked but excluded here AND from Personali → silent ghost */
        isInboxLinkedNotifClient(n)
      );
    });
  }
  function inboxNotifsForBucket(bucketId) {
    return inboxChannelRowsFromStore().filter(function (n) {
      return inboxNotifBucket(n) === bucketId;
    });
  }
  function countInboxUnreadNotifs() {
    return inboxChannelRowsFromStore().filter(function (n) {
      return !n.read;
    }).length;
  }
  /* notifBellBadgeHold1: badge = tutti gli unread in store (personali+inbox).
     Prima: se canBellStaffInbox() era false al sync, count server → full merge → badge 0.
     notifPendingBadge1: + code staff pending (summary) così campanella/WPA non resta a 0. */
  function countStaffInboxPendingSummary() {
    try {
      if (typeof canBellStaffInbox === "function" && !canBellStaffInbox()) return 0;
    } catch (eCan) {
      return 0;
    }
    var cached = null;
    try {
      cached = typeof readCachedBellStaffSummary === "function" ? readCachedBellStaffSummary() : null;
    } catch (eC) {
      cached = null;
    }
    var sum = cached && cached.summary && typeof cached.summary === "object" ? cached.summary : null;
    if (!sum) return 0;
    var n = 0;
    try {
      (BELL_INBOX_ROWS || []).forEach(function (row) {
        if (!row || !row.id) return;
        try {
          if (typeof canBellInboxRow === "function" && !canBellInboxRow(row)) return;
        } catch (eRow) {}
        n += Math.max(0, Number(sum[row.id]) || 0);
      });
    } catch (eSum) {
      return 0;
    }
    return n;
  }
  function countBellBadgeUnread() {
    var s = loadStored();
    var uid = normalizeUserId(currentUserId);
    var dismissed = loadDismissedSet(uid);
    var all = (Array.isArray(s) ? s : []).filter(function (n) {
      return (
        n &&
        !isClearedAwayServerRow(n, dismissed) &&
        !isFilteredNotif(n) &&
        !isVoteRegisteredNotifClient(n)
      );
    });
    var storeN = 0;
    try {
      storeN = countDistinctUnreadNotifs(all);
    } catch (eC) {
      storeN = all.filter(function (n) {
        return !n.read;
      }).length;
    }
    var pending = 0;
    try {
      pending = countStaffInboxPendingSummary();
    } catch (eP) {
      pending = 0;
    }
    /* notifPendingBadge1 marker */
    return Math.max(0, Number(storeN) || 0) + Math.max(0, Number(pending) || 0);
  }
  function formatUnreadSub(n) {
    var count = Math.max(0, Number(n) || 0);
    if (window.VcI18n && typeof window.VcI18n.t === "function") {
      try {
        var t = window.VcI18n.t("notif.unread", { n: count });
        if (t && t !== "notif.unread") return t;
      } catch (eT) {}
    }
    if (count === 1) return "1 non letta";
    return count + " non lette";
  }
  function clearNotifsByIds(ids) {
    var idSet = {};
    (ids || []).forEach(function (id) {
      var sid = String(id || "").trim();
      if (sid) idSet[sid] = true;
    });
    if (!Object.keys(idSet).length) return;
    var uid = normalizeUserId(currentUserId);
    var next = [];
    loadStored().forEach(function (n) {
      var nid = String((n && n.id) || "").trim();
      if (nid && idSet[nid]) {
        try {
          rememberDismissedNotif(n, uid);
        } catch (eRem) {}
        try {
          deleteSiteNotificationOnServer(nid);
        } catch (eDel) {}
        return;
      }
      next.push(n);
    });
    saveStored(next);
    lastNotifRenderSig = "";
    render({ force: true });
    if (bellNotifScope === "staff") {
      try {
        var cached = readCachedBellStaffSummary();
        renderBellStaffInbox((cached && cached.summary) || {});
      } catch (eR) {}
    }
  }
  /* notifCatBarFix1: count+trash+chev on the right; toggle = ico+label only. */
  function buildNotifCategoryBar(opts) {
    var bar = document.createElement("div");
    bar.className = "vc-notif-cat-bar vc-notif-bell-inbox__link";
    var toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className =
      (opts.toggleClass || "vc-notif-cat-toggle vc-notif-bell-inbox__toggle") +
      " vc-notif-cat-toggle-inner";
    toggle.setAttribute("aria-expanded", opts.expanded ? "true" : "false");
    if (opts.ariaControls) toggle.setAttribute("aria-controls", opts.ariaControls);
    toggle.innerHTML = opts.toggleHtml || "";
    var actions = document.createElement("span");
    actions.className = "vc-notif-cat-head__actions";
    if (opts.countHtml) {
      actions.insertAdjacentHTML("beforeend", opts.countHtml);
    }
    var clearBtn = null;
    if (typeof opts.onClear === "function") {
      clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.className = "vc-notif-cat-clear";
      if (opts.clearCatId) clearBtn.setAttribute("data-cat-clear", opts.clearCatId);
      clearBtn.setAttribute("data-cat-scope", opts.clearScope === "inbox" ? "inbox" : "personal");
      clearBtn.title = opts.clearTitle || "Elimina categoria";
      clearBtn.setAttribute("aria-label", opts.clearAriaLabel || clearBtn.title);
      clearBtn.innerHTML = '<i class="fa fa-trash-o" aria-hidden="true"></i>';
      var runClear = function (ev) {
        try {
          if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
          if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
          if (ev && typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
        } catch (eStop) {}
        opts.onClear(ev);
      };
      clearBtn.addEventListener("click", runClear);
      clearBtn.addEventListener("pointerup", function (ev) {
        if (Number(ev.button) > 0) return;
        runClear(ev);
      });
      clearBtn.addEventListener(
        "touchend",
        function (ev) {
          if (ev.cancelable) ev.preventDefault();
          runClear(ev);
        },
        { passive: false },
      );
      actions.appendChild(clearBtn);
    }
    var chev = document.createElement("i");
    chev.className = "fa fa-chevron-down vc-notif-cat-chev vc-notif-bell-inbox__chev";
    chev.setAttribute("aria-hidden", "true");
    actions.appendChild(chev);
    bar.appendChild(toggle);
    bar.appendChild(actions);
    if (typeof opts.onToggleClick === "function") {
      toggle.addEventListener("click", opts.onToggleClick);
    }
    return { bar: bar, toggle: toggle, clearBtn: clearBtn, actions: actions, chev: chev };
  }
  function clearNotifCategory(catId, scope) {
    var id = String(catId || "").trim();
    if (!id) return;
    var items =
      scope === "inbox"
        ? inboxNotifsForBucket(id)
        : filterVisiblePersonalNotifs(rows()).filter(function (n) {
            return personalNotifCategory(n) === id;
          });
    clearNotifsByIds(
      items.map(function (n) {
        return n && n.id;
      }),
    );
  }

  function isFilteredNotif(n) {
    return Boolean(n && n.filtered);
  }
  function rows() {
    var s = loadStored();
    var uid = normalizeUserId(currentUserId);
    var dismissed = loadDismissedSet(uid);
    s = s.filter(function (n) {
      return (
        !isClearedAwayServerRow(n, dismissed) &&
        !isFilteredNotif(n) &&
        !isVoteRegisteredNotifClient(n) &&
        !isInboxLinkedNotifClient(n)
      );
    });
    var demo = ephemeralDemo && !isVoteRegisteredNotifClient(ephemeralDemo) ? ephemeralDemo : null;
    return demo ? [demo].concat(s) : s;
  }
  function iconClass(kind) {
    var k = String(kind || "").toLowerCase();
    if (k === "vote") return "fa-trophy";
    if (k === "vote_reminder") return "fa-clock-o";
    if (k === "success") return "fa-check-circle";
    if (k === "review") return "fa-star";
    if (k === "mod") return "fa-shield";
    if (k === "staff") return "fa-id-badge";
    if (k === "confessionale") return "fa-id-badge";
    if (k === "suggestion") return "fa-magic";
    if (k === "web_ticket" || k === "web_ticket_mention") return "fa-ticket";
    if (k === "web_ticket_sla") return "fa-clock-o";
    if (k === "workflow_decision" || k === "workflow_mention") return "fa-gavel";
    if (k === "compiti") return "fa-book";
    if (k === "candidature") return "fa-file-text-o";
    if (k === "appelli") return "fa-gavel";
    if (k === "pause") return "fa-pause";
    return "fa-bell-o";
  }
  /* notifPendingToastAll1: icona toast da item (inbox/dedicated inclusi) */
  function notifToastIconClass(n) {
    if (!n) return iconClass("info");
    try {
      if (isConfessionaleNotifClient(n)) return "fa-id-badge";
      if (isCompitiNotifClient(n)) return "fa-book";
      if (isPuntiToltiSubjectNotifClient(n)) return "fa-minus-circle";
      if (isStaffTicketSlaNotifClient(n)) return "fa-clock-o";
      if (isStaffTicketNotifClient(n) || isMentionNotifClient(n)) return "fa-ticket";
      if (isStaffReviewNotifClient(n)) return "fa-star";
      if (isStaffFeedbackNotifClient(n)) return "fa-magic";
      if (isDedicatedInboxQueueAlertClient(n)) {
        var q = inboxQueueIdFromNotifUrl(n.openUrl);
        if (q === "candidature") return "fa-file-text-o";
        if (q === "appelli") return "fa-gavel";
        if (q === "pause") return "fa-pause";
        if (q === "resoconti") return "fa-bar-chart";
        if (q === "punti-tolti") return "fa-minus-circle";
      }
      if (isWorkflowDecisionNotifClient(n)) {
        var hay =
          notifMetaKey(n) + " " + String(n.openUrl || "").toLowerCase() + " " + String(n.title || "").toLowerCase();
        if (/appelli|unban|unmute|appeal/.test(hay)) return "fa-gavel";
        if (/candidatur|pex|depex/.test(hay)) return "fa-file-text-o";
        if (/pausa|pause/.test(hay)) return "fa-pause";
        return "fa-check-circle";
      }
    } catch (eIco) {}
    return iconClass(n.kind);
  }
  function bellBadgeUnreadItems() {
    var s = loadStored();
    var uid = normalizeUserId(currentUserId);
    var dismissed = loadDismissedSet(uid);
    return (Array.isArray(s) ? s : []).filter(function (n) {
      return (
        n &&
        !n.read &&
        !isClearedAwayServerRow(n, dismissed) &&
        !isFilteredNotif(n) &&
        !isVoteRegisteredNotifClient(n)
      );
    });
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
    foot.removeAttribute("hidden");
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
    /* notifSeeAll1: CTA always personal /notifications/ — Inbox tab stays separate */
    seeAll.href = notificationsPageUrl();
    seeAll.setAttribute(
      "aria-label",
      tUi("notif.seeAll", null, "Vedi tutte le notifiche"),
    );
    try {
      var labelEl = seeAll.querySelector("span[data-i18n], span");
      if (labelEl) {
        labelEl.setAttribute("data-i18n", "notif.seeAll");
        labelEl.textContent = tUi("notif.seeAll", null, "Vedi tutte le notifiche");
      }
    } catch (eLab) {}
    if (isStandalonePwa()) dd.classList.add("vc-notif-dropdown--pwa");
    try {
      wireNotifSeeAllNav();
    } catch (eWireSee) {}
    return seeAll;
  }

  /* notifSeeAllNav1: delega document — CTA resta navigabile anche se foot/recreate dopo init */
  function wireNotifSeeAllNav() {
    if (window.__vcNotifSeeAllNavWired) return;
    window.__vcNotifSeeAllNavWired = true;
    document.addEventListener(
      "click",
      function (ev) {
        var t = ev && ev.target;
        if (!t || !t.closest) return;
        var a = t.closest("#vc-notif-see-all, a.vc-notif-see-all");
        if (!a) return;
        try {
          if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
          if (typeof ev.button === "number" && ev.button !== 0) return;
        } catch (eMod) {}
        var href = notificationsPageUrl();
        try {
          a.href = href;
        } catch (eHref) {}
        try {
          if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
          if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
        } catch (ePrev) {}
        try {
          requestCloseNotifDropdown(document.getElementById("vc-notif-dropdown"));
        } catch (eClose) {
          try {
            repairNotifDropdownPortal({ forceClose: true });
          } catch (eRep) {}
        }
        window.setTimeout(function () {
          try {
            window.location.assign(href);
          } catch (eAssign) {
            try {
              window.location.href = href;
            } catch (eHref2) {}
          }
        }, 0);
      },
      true,
    );
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
  function paintNotifBellBadgeFromStore() {
    var badge = document.getElementById("vc-notif-badge");
    if (!badge) return 0;
    var unread = 0;
    try {
      unread = countBellBadgeUnread();
    } catch (eU) {
      unread = 0;
    }
    try {
      syncNotifScopeSwitchPending();
    } catch (eSw) {}
    return paintBellBadgeWithServerTruth(unread);
  }

  function paintNotifBellBadgeCount(unreadRaw) {
    var badge = document.getElementById("vc-notif-badge");
    if (!badge) return 0;
    var unread = Math.max(0, Number(unreadRaw) || 0);
    if (unread > 0) {
      badge.hidden = false;
      badge.removeAttribute("hidden");
      badge.textContent = unread > 99 ? "99+" : String(unread);
    } else {
      badge.hidden = true;
      badge.setAttribute("hidden", "");
      badge.textContent = "0";
    }
    try {
      syncBrowserTabNotifBadge(unread);
    } catch (eTab) {}
    return unread;
  }

  function bootstrapNotifUserFromCache() {
    if (normalizeUserId(currentUserId)) return currentUserId;
    try {
      if (window.__VC_DISCORD_PROFILE && window.__VC_DISCORD_PROFILE.id) {
        setCurrentUser(window.__VC_DISCORD_PROFILE);
        if (normalizeUserId(currentUserId)) return currentUserId;
      }
    } catch (eP) {}
    var token = "";
    try {
      token = String(localStorage.getItem("vc_discord_access_token") || "").trim();
    } catch (eT) {
      token = "";
    }
    if (!token) return "";
    var exp = 0;
    try {
      exp = Number(localStorage.getItem("vc_discord_expires_at") || "0");
    } catch (eE) {
      exp = 0;
    }
    var fp = String(exp || 0) + "|" + token.slice(0, 32);
    try {
      var rawUid = localStorage.getItem("vc_discord_uid_v1");
      if (rawUid) {
        var ou = JSON.parse(rawUid);
        if (ou && ou.v === 1 && String(ou.fp || "") === fp && normalizeUserId(ou.uid)) {
          currentUserId = normalizeUserId(ou.uid);
          return currentUserId;
        }
      }
    } catch (eUid) {}
    function takeUser(raw) {
      if (!raw) return "";
      try {
        var o = JSON.parse(raw);
        if (!o || o.v !== 1 || !o.user || String(o.fp || "") !== fp) return "";
        var id = normalizeUserId(o.user.id);
        if (id) {
          currentUserId = id;
          return id;
        }
      } catch (eO) {}
      return "";
    }
    try {
      if (takeUser(sessionStorage.getItem("vc_discord_me_cache_v1"))) return currentUserId;
    } catch (eS) {}
    try {
      if (takeUser(localStorage.getItem("vc_discord_me_cache_local_v1"))) return currentUserId;
    } catch (eL) {}
    return normalizeUserId(currentUserId);
  }

  function render(options) {
    bindClearAllButton();
    try {
      wireNotifMobileSheet();
    } catch (eWireSheet) {}
    try {
      wireNotifListClicks();
    } catch (eWireList) {}
    ensureNotifBellScopeUi();
    var root = document.getElementById("vc-notif-dropdown");
    var listEl = document.getElementById("vc-notif-list");
    var badge = document.getElementById("vc-notif-badge");
    var sub = document.getElementById("vc-notif-unread-sub");
    var all = rows();
    var unread = countDistinctUnreadNotifs(all);
    var badgeUnread = unread;
    try {
      badgeUnread = countBellBadgeUnread();
    } catch (eBu) {
      badgeUnread = unread;
    }
    if (!root || !listEl || !badge || !sub) {
      syncBrowserTabNotifBadge(badgeUnread);
      return;
    }
    var sig = buildNotifStoreSignature(all) + "|u:" + unread + "|b:" + badgeUnread;
    var force = options && options.force === true;
    try {
      paintNotifBellBadgeFromStore();
    } catch (ePaint) {
      if (badgeUnread > 0) {
        badge.hidden = false;
        badge.textContent = badgeUnread > 99 ? "99+" : String(badgeUnread);
      } else {
        badge.hidden = true;
        if (windowAttentionTimer) stopWindowAttention();
      }
    }
    if (badgeUnread <= 0 && windowAttentionTimer) stopWindowAttention();
    syncBrowserTabNotifBadge(badgeUnread);
    try {
      if (badgeUnread > 0) maybeShowPendingUnreadIgToast();
    } catch (eIgPend) {}
    if (!(bellNotifScope === "staff" && canBellStaffInbox())) {
      sub.textContent = formatUnreadSub(unread);
    } else if (typeof renderBellStaffInbox === "function") {
      try {
        sub.textContent = formatUnreadSub(countInboxUnreadNotifs());
        /* notifCatLoadFix1: peer-sync/render force NON deve wipe code aperte/loading */
        if (shouldPreserveBellInboxList()) {
          var cachedPatch =
            typeof readCachedBellStaffSummary === "function" ? readCachedBellStaffSummary() : null;
          if (cachedPatch && cachedPatch.summary) patchBellStaffInboxCounts(cachedPatch.summary);
        } else {
          var cachedInbox =
            typeof readCachedBellStaffSummary === "function" ? readCachedBellStaffSummary() : null;
          if (cachedInbox && cachedInbox.summary) renderBellStaffInbox(cachedInbox.summary);
        }
      } catch (eInboxPaint) {}
    }
    if (all.length > 0) root.classList.add("vc-notif-dropdown--has-items");
    else root.classList.remove("vc-notif-dropdown--has-items");
    syncPushPromptUi();
    if (!force && sig === lastNotifRenderSig) return;
    lastNotifRenderSig = sig;
    bindClearAllButton();
    /* notifBellStable1: conserva categorie aperte; no auto-open unread dopo 1° paint */
    var keepPersonalOpen = Object.create(null);
    try {
      listEl.querySelectorAll(".vc-notif-cat-row.is-open[data-notif-cat]").forEach(function (el) {
        var id = String(el.getAttribute("data-notif-cat") || "").trim();
        if (id) keepPersonalOpen[id] = true;
      });
    } catch (eKeepP) {}
    var allowPersonalAutoUnread = !bellPersonalCatsSettled;
    listEl.innerHTML = "";
    listEl.classList.add("vc-notif-list--cats");
    function appendPersonalNotifRow(host, n) {
      var li = document.createElement("li");
      var destRaw = String(n.openUrl || "").trim();
      var btn = document.createElement(destRaw ? "a" : "button");
      if (!destRaw) btn.type = "button";
      btn.className = "vc-notif-item";
      if (n.kind === "success") btn.classList.add("vc-notif-item--success");
      if (n.read) btn.classList.add("vc-notif-item--read");
      else btn.classList.add("vc-notif-item--unread");
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
      var meta = document.createElement("div");
      meta.className = "vc-notif-item-meta";
      var time = document.createElement("time");
      time.className = "vc-notif-item-time";
      time.dateTime = new Date(n.at || Date.now()).toISOString();
      time.textContent = timeAgoLocalized(n.at || Date.now());
      meta.appendChild(time);
      if (!n.read) {
        var unreadMark = document.createElement("span");
        unreadMark.className = "vc-notif-item-unread-label";
        unreadMark.textContent =
          window.VcI18n && typeof window.VcI18n.t === "function"
            ? window.VcI18n.t("notif.unreadDot")
            : "Da leggere";
        meta.appendChild(unreadMark);
      }
      var destChipLabel = notifDestChipLabel(destRaw, n.kind);
      if (destChipLabel) {
        var destChip = document.createElement("span");
        destChip.className = "vc-notif-item-dest";
        destChip.textContent = destChipLabel;
        meta.appendChild(destChip);
      }
      main.appendChild(title);
      main.appendChild(desc);
      main.appendChild(meta);
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
      /* notifPendingSwitch1: niente testo "Pending" — solo dot rosso */
      btn.appendChild(dot);
      li.className = "vc-notif-row";
      if (!n.read) li.classList.add("is-unread");
      var dismiss = document.createElement("button");
      dismiss.type = "button";
      dismiss.className = "vc-notif-dismiss";
      dismiss.setAttribute("data-id", n.id);
      dismiss.setAttribute("aria-label", tNotif("notif.dismiss", "Elimina notifica"));
      dismiss.title = tNotif("notif.delete", "Elimina");
      dismiss.setAttribute("data-i18n-attr", "aria-label:notif.dismiss");
      dismiss.setAttribute("data-i18n-title", "notif.delete");
      dismiss.innerHTML = '<i class="fa fa-times" aria-hidden="true"></i>';
      li.appendChild(btn);
      li.appendChild(dismiss);
      host.appendChild(li);
    }
    var groups = groupPersonalNotifsByCategory(filterVisiblePersonalNotifs(all));
    groups.forEach(function (g) {
      var section = document.createElement("li");
      /* notifCats3 + notifToastCountFix1: auto-open categorie con unread */
      section.className = "vc-notif-cat-row vc-notif-bell-inbox__row";
      section.setAttribute("data-notif-cat", g.id);
      var unreadCat = g.items.filter(function (x) { return !x.read; }).length;
      /* notifBellStable1 / notifSheetScopeFix1: auto-open unread solo al 1° paint */
      var startOpen =
        Boolean(keepPersonalOpen[g.id]) ||
        (allowPersonalAutoUnread && unreadCat > 0 && !bellUserCollapsedCats["p:" + g.id]);
      var itemsHost = document.createElement("ul");
      itemsHost.className = "vc-notif-cat-items vc-notif-bell-inbox__items";
      itemsHost.setAttribute("role", "list");
      if (!startOpen) {
        itemsHost.hidden = true;
        itemsHost.setAttribute("hidden", "");
      }
      var catBar = buildNotifCategoryBar({
        toggleClass: "vc-notif-cat-toggle vc-notif-bell-inbox__toggle",
        toggleHtml:
          '<span class="vc-notif-cat-ico vc-notif-bell-inbox__ico" aria-hidden="true"><i class="fa ' +
          g.ico +
          '"></i></span>' +
          '<span class="vc-notif-cat-label vc-notif-bell-inbox__label">' +
          escBellHtml(g.label) +
          "</span>",
        countHtml:
          '<span class="vc-notif-bell-inbox__counts">' +
          '<span class="vc-notif-cat-count vc-notif-bell-inbox__count">' +
          String(g.items.length) +
          "</span>" +
          (unreadCat
            ? '<span class="vc-notif-bell-inbox__count vc-notif-bell-inbox__count--new" title="Non lette">' +
              String(unreadCat) +
              "</span>"
            : "") +
          "</span>",
        clearCatId: g.id,
        clearScope: "personal",
        clearAriaLabel: "Elimina tutte in " + g.label,
        onClear: function () {
          clearNotifCategory(g.id, "personal");
        },
        onToggleClick: function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          var open = !section.classList.contains("is-open");
          section.classList.toggle("is-open", open);
          catBar.bar.classList.toggle("is-open", open);
          catBar.toggle.classList.toggle("is-open", open);
          catBar.toggle.setAttribute("aria-expanded", open ? "true" : "false");
          itemsHost.hidden = !open;
          if (open) {
            itemsHost.removeAttribute("hidden");
            try {
              delete bellUserCollapsedCats["p:" + g.id];
            } catch (eOpen) {}
          } else {
            itemsHost.setAttribute("hidden", "");
            bellUserCollapsedCats["p:" + g.id] = 1;
          }
        },
      });
      var bar = catBar.bar;
      var toggle = catBar.toggle;
      if (startOpen) {
        section.classList.add("is-open");
        bar.classList.add("is-open");
        toggle.classList.add("is-open");
        toggle.setAttribute("aria-expanded", "true");
      }
      g.items.forEach(function (n) {
        appendPersonalNotifRow(itemsHost, n);
      });
      section.appendChild(bar);
      section.appendChild(itemsHost);
      listEl.appendChild(section);
    });
    bellPersonalCatsSettled = true;
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
    try {
      rememberServerUnreadCount(0);
    } catch (eZero) {}
    render({ force: true });
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
    /* notifToastCountFix1: non segnare tutto letto all'apertura — serve capire cosa leggere.
       Solo spegne attenzione OS / tab flash. */
    try {
      stopWindowAttention();
    } catch (eStop) {}
    try {
      dismissOsNotifications({ all: true });
    } catch (eOs) {}
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
    try {
      rememberServerUnreadCount(0);
    } catch (eZero2) {}
    render({ force: true });
    /* pushPwaBadgeStable1: clearAll deve chiudere banner OS + badge PWA
       (su Android il pallino icona spesso = notifiche OS, non solo unread inbox) */
    try {
      window.__vcPwaDismissAt = 0;
    } catch (eResetThrott) {}
    try {
      dismissOsNotifications({ all: true });
    } catch (eOsClr) {}
    try {
      if (typeof navigator !== "undefined" && typeof navigator.clearAppBadge === "function") {
        Promise.resolve(navigator.clearAppBadge()).catch(function () {});
      }
    } catch (eBadgeClr) {}
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
  /* notifSheetUnifyPhone1: clear categoria — stesso capture touch di clear-all (su phone click spesso muore) */
  var catClearLockUntil = 0;
  function onCatClearGesture(ev) {
    var t = clearAllEventTarget(ev);
    if (!t || !t.closest) return;
    var btn = t.closest("button.vc-notif-cat-clear");
    if (!btn) return;
    if (ev.type === "pointerup" && Number(ev.button) > 0) return;
    var now = Date.now();
    if (now < catClearLockUntil) {
      try {
        if (ev.cancelable) ev.preventDefault();
        ev.stopPropagation();
      } catch (eL) {}
      return;
    }
    catClearLockUntil = now + 420;
    try {
      if (ev.type === "touchend" && ev.cancelable) ev.preventDefault();
      if (ev.preventDefault) ev.preventDefault();
      if (ev.stopPropagation) ev.stopPropagation();
      if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
    } catch (eStop) {}
    var catId = String(btn.getAttribute("data-cat-clear") || "").trim();
    var scope = btn.getAttribute("data-cat-scope") === "inbox" ? "inbox" : "personal";
    if (!catId) return;
    try {
      clearNotifCategory(catId, scope);
    } catch (eClr) {}
  }
  if (!window.__vcNotifCatClearWired) {
    window.__vcNotifCatClearWired = true;
    document.addEventListener("click", onCatClearGesture, true);
    document.addEventListener("pointerup", onCatClearGesture, true);
    document.addEventListener("touchend", onCatClearGesture, { capture: true, passive: false });
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
    noteLocalMarkReadHold();
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
    try {
      rememberServerUnreadCount(countBellBadgeUnread());
    } catch (eHoldDown) {}
    render({ force: true });
    dismissOsNotifications({ id: sid, ticketIds: Object.keys(ticketIds) });
    requestAppBadgeSync(countBellBadgeUnread() <= 0);
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
  var lastSwFocusPingAt = 0;
  var lastSwFocusPingSig = "";
  function pingSwClientFocus(force) {
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
      var onTicketsPage = false;
      try {
        var path = String(window.location.pathname || "").replace(/\/+$/, "") || "/";
        onTicketsPage = path === "/tickets" || path.indexOf("/tickets/") === 0;
      } catch (ePath) {}
      var viewAsLogout = false;
      try {
        viewAsLogout = String(sessionStorage.getItem("vc_view_as") || "").trim().toLowerCase() === "logout";
      } catch (eVa) {}
      var ticketId = focused ? String(watching.id || "") : "";
      var pwaNuke = false;
      try {
        pwaNuke = Boolean(
          window.__VC_PWA_CPU_NUKE ||
            document.documentElement.classList.contains("vc-pwa-cpu-nuke") ||
            (window.VcPerf && typeof window.VcPerf.isStandalonePwa === "function" && window.VcPerf.isStandalonePwa()),
        );
      } catch (ePn0) {}
      /* swStorageCpu2: in PWA niente token nel ping (evita Cache API auth write) */
      var token = pwaNuke ? "" : getDiscordAccessToken();
      var sig =
        (focused ? "1" : "0") +
        "|" +
        (isStandalonePwa() ? "1" : "0") +
        "|" +
        ticketId +
        "|" +
        (onTicketsPage ? "1" : "0") +
        "|" +
        (viewAsLogout ? "1" : "0") +
        "|" +
        String(token || "").slice(0, 12) +
        "|" +
        (pwaNuke ? "p" : "t");
      var now = Date.now();
      /* swStorageCpu2: throttle più duro in PWA */
      var minGap = pwaNuke ? 15000 : 2500;
      var sameSigGap = pwaNuke ? 60000 : 12000;
      if (!force && sig === lastSwFocusPingSig && now - lastSwFocusPingAt < sameSigGap) return;
      if (!force && now - lastSwFocusPingAt < minGap) return;
      lastSwFocusPingAt = now;
      lastSwFocusPingSig = sig;
      navigator.serviceWorker.controller.postMessage({
        type: "vc:client-focus",
        focused: focused,
        standalone: isStandalonePwa(),
        ticketId: ticketId,
        onTicketsPage: focused && onTicketsPage,
        viewAsLogout: viewAsLogout,
        token: token,
        noPersist: pwaNuke,
      });
    } catch (e) {}
  }
  function wireSwClientFocusPing() {
    /* swMin1: SW ignora focus — non pingare (wake inutile) */
    return;
  }
  function wirePushNotifMarkRead() {
    consumeNotifReadFromUrl();
    consumePendingReadFromSwCache();
    var pushSyncTimer = 0;
    function scheduleInboxSyncFromPush() {
      if (pushSyncTimer) clearTimeout(pushSyncTimer);
      /* pwaPushBellBadge1: non syncare a 40ms — il list server spesso non ha ancora
         la riga e il merge cancellava l’unread optimistic → badge campanella a 0 in PWA */
      pushSyncTimer = setTimeout(function () {
        pushSyncTimer = 0;
        try {
          syncSiteNotificationsFromServer({ force: true, full: true });
        } catch (eSync) {}
        try {
          if (typeof loadBellStaffInboxSummary === "function") {
            loadBellStaffInboxSummary(true).then(function () {
              try {
                paintNotifBellBadgeFromStore();
              } catch (eBadgeSum) {}
            });
          }
        } catch (eSum) {}
      }, 900);
    }
    try {
      if (!("serviceWorker" in navigator)) return;
      navigator.serviceWorker.addEventListener("message", function (ev) {
        var data = ev && ev.data ? ev.data : null;
        if (!data || !data.type) return;
        if (data.type === "vc:push-received") {
          var p = data.payload && typeof data.payload === "object" ? data.payload : {};
          if (String(p.type || "") === "dismiss") {
            /* pushDismissDedup1: SW chiude già i banner OS; pagina synca inbox + toast locali */
            dismissOsNotifications({
              ticketId: p.ticketId,
              id: p.id,
              ids: Array.isArray(p.ids) ? p.ids : [],
              ticketIds: Array.isArray(p.ticketIds) ? p.ticketIds : [],
              all: p.all === true,
            });
            rememberToastedForDismissPush(p);
            scheduleInboxSyncFromPush();
            return;
          }
          rememberRecentOsPush(String(p.id || "").trim());
          rememberRecentOsPush(String(p.messageId || "").trim());
          rememberRecentOsPush(String(p.ticketId || "").trim());
          setPushSubActive(true);
          /* notifPushBellCatchup1: push = unread nuovo → non tenere hold mark-read */
          try {
            clearLocalMarkReadHold();
          } catch (eHold) {}
          scheduleInboxSyncFromPush();
          if (isWatchingTicketChat(p.ticketId, p.openUrl)) {
            var seenId = String(p.id || "").trim();
            if (seenId) {
              rememberClickRead(seenId);
              tryFlushClickReads();
            }
            return;
          }
          if (isWatchingWorkflowChat(p.openUrl, p.dedupeKey)) {
            var seenWfc = String(p.id || "").trim();
            if (seenWfc) {
              rememberClickRead(seenWfc);
              tryFlushClickReads();
            }
            return;
          }
          /* pushInAppSilent1: se SW ha soppresso OS (tab focused) → toast in-app come le altre;
             se OS già mostrato → niente fly doppio. */
          try {
            var pushToastId = String(p.id || p.messageId || "").trim();
            var alreadyToasted = Boolean(pushToastId && wasAlreadyToasted(pushToastId));
            var storedOk = false;
            try {
              if (normalizeUserId(currentUserId) || bootstrapNotifUserFromCache()) {
                var addRes = addNotif({
                  id: pushToastId || undefined,
                  title: String(p.title || "Nuova notifica"),
                  body: String(p.body || ""),
                  kind: String(p.kind || "info"),
                  openUrl: String(p.openUrl || "").trim(),
                  ticketId: String(p.ticketId || "").trim(),
                  messageId: String(p.messageId || "").trim(),
                  channel: String(p.channel || "").trim(),
                  dedupeKey: String(p.dedupeKey || "").trim(),
                  at: Date.now(),
                  read: false,
                  userId: normalizeUserId(currentUserId),
                  __resetRead: true,
                  __skipOsBanner: true,
                  __skipFlyToast: true,
                  __noRender: false,
                });
                storedOk = Boolean(addRes && (addRes.added === true || addRes.merged === true));
              }
            } catch (ePushStore) {}
            var badgeN = 0;
            try {
              badgeN = paintNotifBellBadgeFromStore();
            } catch (ePushBadge) {
              badgeN = 0;
            }
            /* pwaPushBellBadge1: tieni server-hold ≥ locale così sync count=0 non spegne subito */
            if (badgeN > 0) {
              try {
                rememberServerUnreadCount(Math.max(loadServerUnreadHold(), badgeN));
              } catch (eHoldN) {}
            }
            var inAppNoOs = data.suppressOs === true;
            var pageFocused = false;
            try {
              pageFocused =
                document.visibilityState === "visible" &&
                (typeof document.hasFocus !== "function" || document.hasFocus());
            } catch (ePf) {
              pageFocused = document.visibilityState === "visible";
            }
            if (pageFocused && !alreadyToasted) {
              var toastOk = false;
              if (inAppNoOs) {
                try {
                  toastOk = showNotifFlyToast({
                    id: pushToastId || String(Date.now()),
                    title: String(p.title || "Nuova notifica"),
                    body: String(p.body || ""),
                    kind: String(p.kind || "info"),
                    openUrl: String(p.openUrl || "").trim(),
                    ticketId: String(p.ticketId || "").trim(),
                    messageId: String(p.messageId || "").trim(),
                    at: Date.now(),
                    read: false,
                  });
                } catch (ePushFlyShow) {
                  toastOk = false;
                }
              }
              try {
                pulseNotifSummary();
              } catch (ePulse) {}
              if (toastOk || badgeN > 0 || storedOk) {
                playNotifSound();
              }
              if ((toastOk || badgeN > 0 || storedOk) && pushToastId) rememberToastedId(pushToastId);
            }
          } catch (ePushFly) {}
          return;
        }
        if (data.type === "vc:push-resubscribe") {
          /* pushGonePersist1: non ri-POST l'endpoint morto — forza unsubscribe+subscribe */
          forceFreshPushSubscription({ fromHeal: true }).then(function (ok) {
            if (!ok) {
              return refreshPushSubscriptionState({ force: true }).then(function (ok2) {
                if (!ok2) syncPushPromptUi();
                return ok2;
              });
            }
            syncPushPromptUi();
            return ok;
          });
          return;
        }
        if (data.type === "vc:force-reload-layout" || data.type === "vc:force-reload-home") {
          /* swStorageCpu2: MAI reload da SW (loop CPU / freeze PWA). Vecchi SW possono ancora mandarlo. */
          return;
        }
        if (data.type === "vc:open-dest") {
          var openId = String(data.id || "").trim();
          var openTid = String(data.ticketId || "").trim();
          /* pushPcFocusPwa1: porta in primo piano la finestra che riceve il postMessage */
          try {
            window.focus();
          } catch (eFocusWin) {}
          /* pushBellFocusFix1: mark-read immediato + hold badge anti re-inflate server */
          noteLocalMarkReadHold();
          if (openTid) markTicketNotificationsRead(openTid);
          if (openId) markOneRead(openId, { openUrl: String(data.url || "").trim() });
          else if (!openTid) {
            tryFlushClickReads();
          }
          applyOpenDest(String(data.url || "").trim(), openTid);
          return;
        }
        if (data.type === "vc:notif-os-closed") {
          /* pushBadgeVisitFix1: swipe dismiss OS → mark read locale + server (badge non resta) */
          var closedId = String(data.id || "").trim();
          var closedTid = String(data.ticketId || "").trim();
          noteLocalMarkReadHold();
          if (closedTid) markTicketNotificationsRead(closedTid);
          if (closedId) markOneRead(closedId);
          requestAppBadgeSync(countBellBadgeUnread() <= 0);
          return;
        }
        if (data.type !== "vc:notif-mark-read") return;
        var id = String(data.id || "").trim();
        var ticketId = String(data.ticketId || "").trim();
        noteLocalMarkReadHold();
        if (ticketId) markTicketNotificationsRead(ticketId);
        if (id) {
          markOneRead(id);
        } else {
          tryFlushClickReads();
        }
      });
    } catch (e2) {}
  }
  function resolveNotifDestUrl(dest) {
    var u = String(dest || "").trim();
    if (!u) return "";
    /* organicoPexNotifCine1: strip ?userId= da organico (notifiche PEX legacy) */
    try {
      var parsed = new URL(u, window.location.origin);
      var path = String(parsed.pathname || "").replace(/\/+$/, "") || "/";
      if (path === "/staff/organico") {
        parsed.searchParams.delete("userId");
        parsed.searchParams.delete("uid");
        parsed.searchParams.delete("id");
        if (/^https?:\/\//i.test(u)) return parsed.href;
        return parsed.pathname + parsed.search + parsed.hash;
      }
    } catch (eOrg) {}
    if (/^https?:\/\//i.test(u)) return u;
    try {
      return new URL(u, window.location.origin).href;
    } catch (e) {
      return u;
    }
  }

  /* notifToastCountFix1: collapse duplicate ticket openers (staff_reply+needs_reply) for toast count */
  function notifCollapseKey(n) {
    if (!n) return "";
    var dk = String(n.dedupeKey || n.id || "").trim();
    var m = dk.match(/^web_ticket:(?:staff_reply|needs_reply):([a-f0-9]{24})$/i);
    if (m) return "ticket-reply:" + m[1].toLowerCase();
    var tid = String(n.ticketId || "").trim();
    if (/^[a-f0-9]{24}$/i.test(tid) && String(n.kind || "") === "web_ticket") {
      return "ticket:" + tid.toLowerCase();
    }
    var open = String(n.openUrl || "").trim();
    if (open) return "url:" + open.split("#")[0];
    return "id:" + String(n.id || dk || Math.random());
  }

  function countDistinctUnreadNotifs(items) {
    var list = Array.isArray(items) ? items : [];
    var seen = Object.create(null);
    var n = 0;
    for (var i = 0; i < list.length; i += 1) {
      var it = list[i];
      if (!it || it.read) continue;
      var key = notifCollapseKey(it);
      if (seen[key]) continue;
      seen[key] = 1;
      n += 1;
    }
    return n;
  }

  function filterVisiblePersonalNotifs(items) {
    var list = Array.isArray(items) ? items.slice() : [];
    var hasStaffReply = Object.create(null);
    for (var i = 0; i < list.length; i += 1) {
      var dk = String((list[i] && (list[i].dedupeKey || list[i].id)) || "");
      var m = dk.match(/^web_ticket:staff_reply:([a-f0-9]{24})$/i);
      if (m) hasStaffReply[m[1].toLowerCase()] = 1;
    }
    return list.filter(function (n) {
      var dk = String((n && (n.dedupeKey || n.id)) || "");
      var m = dk.match(/^web_ticket:needs_reply:([a-f0-9]{24})$/i);
      if (m && hasStaffReply[m[1].toLowerCase()]) return false;
      return true;
    });
  }

  function notifDestChipLabel(openUrl, kind) {
    var u = String(openUrl || "").trim().toLowerCase();
    var k = String(kind || "").toLowerCase();
    if (!u) {
      if (k === "vote" || k === "vote_reminder") return "Voto";
      return "";
    }
    if (/\/tickets/.test(u)) return "Apri ticket";
    if (/inbox=/.test(u) || /view=staff/.test(u)) return "Inbox staff";
    if (/top\.gg|discadia|\/vote/.test(u)) return "Apri voto";
    if (/\/recensioni/.test(u)) return "Recensioni";
    if (/\/feedback|\/suggerimenti/.test(u)) return "Feedback";
    if (/\/candidature/.test(u)) return "Candidature";
    if (/\/appelli/.test(u)) return "Appelli";
    if (/\/confessionale/.test(u)) return "Confessionale";
    if (/\/staff\//.test(u)) return "Area staff";
    if (/\/user|\/profilo|\/personalizza/.test(u)) return "Profilo";
    if (/\/notifications/.test(u)) return "Notifiche";
    if (/\/donazioni|\/premium/.test(u)) return "Donazioni";
    try {
      var path = new URL(u, window.location.origin).pathname || "";
      path = path.replace(/\/+$/, "") || "/";
      var parts = path.split("/").filter(Boolean);
      if (parts.length) return "/" + parts[0] + "/";
    } catch (ePath) {}
    return "Apri";
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
    href = resolveNotifDestUrl(href) || href;
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
      /* notifSheetOpenFix1 + notifSheetFastOpen1: già su /notifications staff → soft open tab/item (sheet subito) */
      /* pushReuseClient1: soft open anche se query diversa (click push da stessa pagina) */
      if (/\/notifications$/i.test(destPath) && /\/notifications$/i.test(herePath)) {
        var wantStaffNav = false;
        try {
          wantStaffNav = String(dest.searchParams.get("view") || "").toLowerCase() === "staff";
        } catch (eVs) {}
        if (wantStaffNav) {
          var inboxQ = "";
          var itemQ = "";
          var scopeQ = "pending";
          try {
            inboxQ = String(dest.searchParams.get("inbox") || "").trim();
            itemQ = String(dest.searchParams.get("item") || "").trim();
            scopeQ = String(dest.searchParams.get("scope") || "pending").trim() || "pending";
          } catch (eIq) {}
          try {
            if (window.VcNotifScope && typeof window.VcNotifScope.setScope === "function") {
              window.VcNotifScope.setScope("staff", { push: false, remember: false });
            }
          } catch (eSetSc) {}
          try {
            if (typeof window.__vcStaffInboxOpenDeepLink === "function") {
              var softOk = window.__vcStaffInboxOpenDeepLink({
                inbox: inboxQ,
                item: itemQ,
                scope: scopeQ,
              });
              if (softOk) {
                try {
                  history.replaceState(null, "", dest.pathname + dest.search + dest.hash);
                } catch (eRepN) {}
                try {
                  window.dispatchEvent(
                    new CustomEvent("vc:notif-scope", { detail: { scope: "staff", source: "notif-open" } }),
                  );
                } catch (eSc) {}
                return;
              }
            }
          } catch (eSoft) {}
        }
      }
      /* pushReuseClient1: /staff/inbox → soft open come notifications */
      if (/\/staff\/inbox$/i.test(destPath) && (/\/notifications$/i.test(herePath) || /\/staff\/inbox$/i.test(herePath))) {
        try {
          if (typeof window.__vcStaffInboxOpenDeepLink === "function") {
            var softInbox = window.__vcStaffInboxOpenDeepLink({
              inbox: String(dest.searchParams.get("inbox") || "").trim(),
              item: String(dest.searchParams.get("item") || "").trim(),
              scope: String(dest.searchParams.get("scope") || "pending").trim() || "pending",
            });
            if (softInbox) {
              try {
                var uI = new URL("/notifications/", location.origin);
                dest.searchParams.forEach(function (v, k) {
                  uI.searchParams.set(k, v);
                });
                uI.searchParams.set("view", "staff");
                history.replaceState(null, "", uI.pathname + uI.search + (dest.hash || ""));
              } catch (eRepI) {}
              return;
            }
          }
        } catch (eSoftInbox) {}
      }
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
                        window.location.href =
              dest.pathname +
              "?view=staff" +
              (ticketId ? "&ticketId=" + encodeURIComponent(ticketId) + "#" + ticketId : "");
            return;
          }
        }
        if (ticketId && /^[a-f0-9]{24}$/i.test(ticketId)) {
          if (String(here.hash || "").replace(/^#/, "") !== ticketId || wantStaff) {
            try {
              var yKeep =
                window.pageYOffset ||
                (document.documentElement && document.documentElement.scrollTop) ||
                0;
              var nextSearch = String(here.search || "");
              /* ticketNotifStaffOpen1: tieni ticketId in query (non solo hash) per restore dopo remount */
              try {
                var uKeep = new URL(here.href);
                if (wantStaff) uKeep.searchParams.set("view", "staff");
                uKeep.searchParams.set("ticketId", ticketId);
                nextSearch = uKeep.search;
              } catch (eQs) {}
              history.replaceState(
                null,
                "",
                here.pathname + nextSearch + "#" + ticketId,
              );
              window.scrollTo(0, yKeep);
              if (document.documentElement) document.documentElement.scrollTop = yKeep;
            } catch (eHash) {
              /* ticketActionFail1: mai location.hash= — scrolla in alto la pagina */
              try {
                history.replaceState(null, "", here.pathname + here.search);
              } catch (eHash2) {}
            }
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
      /* notifSheetFastOpen1: già su /feedback → soft open sheet (no reload) */
      var isFeedbackDest = /\/feedback$/i.test(destPath) || /\/suggerimenti$/i.test(destPath);
      var onFeedbackPage = /\/feedback$/i.test(herePath) || /\/suggerimenti$/i.test(herePath);
      if (isFeedbackDest && onFeedbackPage) {
        var sugId = "";
        try {
          var hSug = String(dest.hash || "").replace(/^#/, "").trim();
          if (/^vc-suggestion-([a-f0-9]{24})$/i.test(hSug)) {
            sugId = hSug.replace(/^vc-suggestion-/i, "");
          }
        } catch (eHs) {}
        var wantFbBoard = "community";
        try {
          if (String(dest.searchParams.get("board") || "").toLowerCase() === "staff") wantFbBoard = "staff";
        } catch (eFbB) {}
        if (sugId && typeof window.__vcFeedbackOpenDeepLink === "function") {
          try {
            var softFb = window.__vcFeedbackOpenDeepLink({ id: sugId, board: wantFbBoard });
            if (softFb) {
              try {
                var uFb = new URL(here.href);
                if (wantFbBoard === "staff") uFb.searchParams.set("board", "staff");
                else uFb.searchParams.delete("board");
                history.replaceState(null, "", uFb.pathname + uFb.search);
              } catch (eFbUrl) {}
              return;
            }
          } catch (eSoftFb) {}
        }
      }
      /* notifSheetFastOpen1: già su /confessionale → soft open sheet */
      var isConfDest = /\/confessionale$/i.test(destPath);
      var onConfPage = /\/confessionale$/i.test(herePath);
      if (isConfDest && onConfPage) {
        var confId = "";
        try {
          var hConf = String(dest.hash || "").replace(/^#/, "").trim();
          var mConf = hConf.match(/^vc-conf-card-([a-f0-9]{24})$/i);
          if (mConf) confId = mConf[1];
        } catch (eHc) {}
        var wantConfBoard = "community";
        try {
          if (String(dest.searchParams.get("board") || "").toLowerCase() === "staff") wantConfBoard = "staff";
        } catch (eCb) {}
        if (confId && typeof window.__vcConfessionaleOpenDeepLink === "function") {
          try {
            var softConf = window.__vcConfessionaleOpenDeepLink({ id: confId, board: wantConfBoard });
            if (softConf) {
              try {
                var uConf = new URL(here.href);
                if (wantConfBoard === "staff") uConf.searchParams.set("board", "staff");
                else uConf.searchParams.delete("board");
                history.replaceState(null, "", uConf.pathname + uConf.search + "#vc-conf-card-" + confId);
              } catch (eConfUrl) {}
              return;
            }
          } catch (eSoftConf) {}
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
      /* notifBellRing1: ripulisci dopo il ring così hover/attention ripartono */
      window.clearTimeout(sm._vcBellPulseT);
      sm._vcBellPulseT = window.setTimeout(function () {
        try {
          sm.classList.remove("vc-notif-summary--pulse");
        } catch (e2) {}
      }, 1700);
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
            if (pushSubActive === true) return false;
    try {
      if (
        pushSubActive !== false &&
        "serviceWorker" in navigator &&
        navigator.serviceWorker.controller &&
        typeof Notification !== "undefined" &&
        Notification.permission === "granted"
      ) {
                return false;
      }
    } catch (eOwn) {}
    return true;
  }

  function isMobilePushClient() {
    try {
      return /Android|iPhone|iPad|iPod|Mobile/i.test(String(navigator.userAgent || ""));
    } catch (eMob) {
      return false;
    }
  }

  /* desktopPushCatchup1: su PC il delay 7–9s (anti-429 telefono) ritardava il touch
     della subscription → WNS/Chrome consegnava i push “di recupero” all’accensione
     molto dopo. Desktop → sync subito; mobile tiene il delay. */
  function pushBootSyncDelayMs() {
    return isMobilePushClient() ? 9000 : 400;
  }

  function pushProfileSyncDelayMs() {
    return isMobilePushClient() ? 7000 : 350;
  }

  var desktopPushCatchupArmed = false;
  var desktopPushCatchupLastAt = 0;
  var pageHiddenSinceAt = 0;

  function armDesktopPushCatchup(reason) {
    if (isMobilePushClient()) return;
    desktopPushCatchupArmed = true;
    try {
      if (reason) {
        /* no-op marker for probes */
      }
    } catch (eArm) {}
  }

  function showNativeOsBanner(item, opts) {
    opts = opts || {};
    if (!item || item.read) return;
    /* pushReliability1: silenzia solo il ticket aperto in chat, non tutta /tickets/ */
    if (isWatchingTicketChat(item.ticketId, item.openUrl)) return;
    if (isWatchingWorkflowChat(item.openUrl, item.dedupeKey)) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    /* desktopPushCatchup1: catchup wake/boot può forzare banner anche con push attiva
       (altrimenti aspetta WNS minuti dopo l’accensione PC). */
    if (!opts.catchup && !clientOwnsOsBanner()) return;
    if (recentlyGotOsPush(item)) return;
    try {
      if (!opts.catchup && document.visibilityState === "visible" && document.hasFocus()) return;
    } catch (eFocus) {}
    var sid = String(item.id || "").trim();
    var messageId = String(item.messageId || "").trim();
    var ticketId = String(item.ticketId || "").trim();
    var nowMs = Date.now();
    if (sid) recentOsPushAt[sid] = nowMs;
    if (messageId) recentOsPushAt[messageId] = nowMs;
    var title = String(item.title || "Vinili & Caffè").replace(/\s+/g, " ").trim().slice(0, 120) || "Nuova notifica";
    var body = String(item.body || "").trim().slice(0, 500);
    var kindLc = String(item.kind || "").toLowerCase();
    var dk = String(item.dedupeKey || "").toLowerCase();
    var voteTag = "";
    if (kindLc === "vote_reminder" || /vote_reminder_/.test(dk) || /promemoria\s+voto/i.test(title)) {
      if (/_topgg|top\.gg|topgg/.test(dk) || /top\.gg/i.test(title)) voteTag = "vc-vote-topgg";
      else if (/_discadia|discadia/.test(dk) || /discadia/i.test(title)) voteTag = "vc-vote-discadia";
      else voteTag = sid ? "vc-vote-" + sid : "vc-vote-" + String(nowMs);
    }
        var tag = voteTag
      ? voteTag
      : messageId
      ? "vc-site-msg-" + messageId
      : ticketId && sid
        ? "vc-site-ticket-" + ticketId + "-" + sid
        : sid
          ? "vc-site-" + sid
          : "vc-site-" + String(nowMs);
    var optsShow = {
      body: body || "Nuova notifica",
      tag: tag,
      renotify: true,
      silent: false,
      requireInteraction: Boolean(voteTag),
      lang: "it",
      icon: "/images/og-server-icon.gif?v=20260904brandGif1",
      badge: "/images/og-server-icon.gif?v=20260904brandGif1",
      data: {
        openUrl: String(item.openUrl || "/").trim() || "/",
        kind: String(item.kind || "info"),
        id: sid,
        ticketId: ticketId,
        messageId: messageId,
        dedupeKey: String(item.dedupeKey || "").trim(),
      },
    };
    function viaPage() {
      try {
        var n = new Notification(title, optsShow);
        n.onclick = function () {
          try {
            window.focus();
          } catch (eF) {}
          var href = resolveNotifDestUrl(optsShow.data.openUrl);
          if (href) openNotifDestination(href, optsShow.data.kind);
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
            return reg.showNotification(title, optsShow);
          }
          viaPage();
        })
        .catch(viaPage);
    } else {
      viaPage();
    }
  }

  function runDesktopPushCatchupFromStore() {
    /* desktopPushCatchup1: dopo wake/boot PC mostra subito fino a 3 unread recenti
       senza aspettare la coda WNS/Chrome. */
    if (!desktopPushCatchupArmed) return;
    if (isMobilePushClient()) {
      desktopPushCatchupArmed = false;
      return;
    }
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    var now = Date.now();
    if (desktopPushCatchupLastAt && now - desktopPushCatchupLastAt < 8000) return;
    desktopPushCatchupLastAt = now;
    desktopPushCatchupArmed = false;
    var items = [];
    try {
      items = loadStored();
    } catch (eLoad) {
      items = [];
    }
    if (!Array.isArray(items) || !items.length) return;
    var freshMs = 12 * 60 * 60 * 1000;
    var candidates = [];
    for (var i = 0; i < items.length; i += 1) {
      var it = items[i];
      if (!it || it.read) continue;
      var id = String(it.id || "").trim();
      if (!id) continue;
      if (wasAlreadyToasted(id)) continue;
      if (recentlyGotOsPush(it)) continue;
      var at = Number(it.at) || 0;
      if (at && now - at > freshMs) continue;
      if (isWatchingTicketChat(it.ticketId, it.openUrl)) continue;
      if (isWatchingWorkflowChat(it.openUrl, it.dedupeKey)) continue;
      candidates.push(it);
    }
    candidates.sort(function (a, b) {
      return (Number(b.at) || 0) - (Number(a.at) || 0);
    });
    var maxShow = 3;
    for (var c = 0; c < candidates.length && c < maxShow; c += 1) {
      var row = candidates[c];
      var rid = String(row.id || "").trim();
      if (rid) rememberToastedId(rid);
      showNativeOsBanner(row, { catchup: true });
    }
  }

  function playNotifSound() {
    var nowMs = Date.now();
    if (nowMs - lastNotifSoundAt < 1800) return;
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
                playNotifTone(ctx, 784.0, now, 0.17, 0.22);
        playNotifTone(ctx, 1174.7, now + 0.1, 0.22, 0.18);
      } catch (e) {}
    });
  }

  /* notifIgToastBell1: pill anchored tight under the bell (caret + center) */
  function placeNotifPopNearBell(root, bell) {
    if (!root || !bell) return;
    var br = bell.getBoundingClientRect();
    var gap = 4;
    var stack = Math.max(0, notifFlyActiveCount - 1) * 6;
    try {
      root.offsetWidth;
    } catch (eMeasure) {}
    var rw = Math.max(56, Math.min(140, root.offsetWidth || 88));
    var rh = Math.max(28, root.offsetHeight || 36);
    root.style.position = "fixed";
    root.style.display = "inline-flex";
    root.style.width = "auto";
    root.classList.add("vc-notif-ig-toast--anchored");
    /* center on bell — not floating free at the corner */
    var left = br.left + br.width / 2 - rw / 2;
    if (left < 8) left = 8;
    if (left + rw > window.innerWidth - 8) left = Math.max(8, window.innerWidth - 8 - rw);
    var top = br.bottom + gap + stack;
    var below = true;
    if (top + rh + 8 > window.innerHeight) {
      top = Math.max(8, br.top - gap - rh - stack);
      below = false;
    }
    root.style.top = Math.round(top) + "px";
    root.style.left = Math.round(left) + "px";
    root.style.right = "auto";
    root.style.bottom = "auto";
    root.classList.toggle("vc-notif-ig-toast--above", !below);
    root.classList.toggle("vc-notif-ig-toast--below", below);
    var ox = Math.max(10, Math.min(rw - 10, br.left + br.width / 2 - left));
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
      '<button type="button" class="vc-dialog__backdrop" data-vc-notif-dialog="cancel" aria-label="' +
      tNotif("notif.close", "Chiudi") +
      '" data-i18n-attr="aria-label:notif.close"></button>' +
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

  function openNotifDropdownProgrammatic() {
    /* notifMobileOpenFix1: toast/interrupt open must prime sheet prima del paint */
    var dd = document.getElementById("vc-notif-dropdown");
    if (!dd || dd.open) return;
    try {
      primeDesktopNotifDrawer(dd);
    } catch (ePrime) {}
    try {
      dd.open = true;
      dd.setAttribute("open", "");
    } catch (eOpen) {
      try {
        dd.setAttribute("open", "");
      } catch (eOpen2) {}
    }
    try {
      scheduleNotifSheetChromeSync({ delayMs: 0 });
    } catch (eSync) {}
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
        openNotifDropdownProgrammatic();
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
      if (isWatchingWorkflowChat(next.openUrl, next.dedupeKey)) continue;
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
      '<summary class="vc-icon-btn vc-notif-summary relative inline-flex" aria-label="' +
      tNotif("notif.aria", "Notifiche") +
      '" data-i18n-attr="aria-label:notif.aria"><i class="fa fa-bell-o" aria-hidden="true"></i><span class="vc-notif-badge" id="vc-notif-badge" hidden aria-live="polite">0</span></summary>' +
      '<div class="vc-notif-panel" role="region" aria-label="' +
      tNotif("notif.listAria", "Elenco notifiche") +
      '" data-i18n-attr="aria-label:notif.listAria">' +
      '<div class="vc-notif-panel-head"><div class="vc-notif-panel-head-start"><span class="vc-notif-panel-head-ico" aria-hidden="true"><i class="fa fa-bell-o"></i></span><div class="vc-notif-panel-head-text"><span class="vc-notif-panel-title" data-i18n="notif.title">Notifiche</span><span class="vc-notif-panel-sub" id="vc-notif-unread-sub" data-i18n="notif.unreadZero">0 non lette</span></div></div>' +
      '<div class="vc-notif-panel-head-actions"><button type="button" class="vc-notif-action" id="vc-notif-clear-all" title="Elimina tutte" aria-label="Elimina tutte" data-i18n-title="notif.clearAll" data-i18n-attr="aria-label:notif.clearAll"><i class="fa fa-trash-o" aria-hidden="true"></i></button></div></div>' +
      '<div class="vc-notif-panel-body"><div class="vc-notif-empty-wrap" id="vc-notif-empty-wrap"><div class="vc-notif-empty"><div class="vc-notif-empty-ico" aria-hidden="true"><i class="fa fa-bell-o"></i></div><p class="vc-notif-empty-title" data-i18n="notif.emptyTitle">Nessuna notifica</p><p class="vc-notif-empty-sub" data-i18n="notif.emptySub">Sei tutto aggiornato!</p></div></div><div class="vc-notif-list-wrap" id="vc-notif-list-wrap"><ul class="vc-notif-list" id="vc-notif-list" role="list"></ul></div></div>' +
      '<div class="vc-notif-panel-foot" id="vc-notif-panel-foot"><a href="/notifications/" class="vc-notif-see-all" id="vc-notif-see-all"><span data-i18n="notif.seeAll">Vedi tutte le notifiche</span> <i class="fa fa-chevron-right" aria-hidden="true"></i></a></div></div></details>';
    var anchor = toggle || loginBtn;
    if (anchor) anchor.insertAdjacentHTML("beforebegin", html);
    else actions.insertAdjacentHTML("afterbegin", html);
    normalizeHeaderQuickActionsOrder(actions);
    try {
      if (window.VcI18n && typeof window.VcI18n.apply === "function") window.VcI18n.apply();
    } catch (eApply) {}
    return document.getElementById("vc-notif-dropdown");
  }

  function placeNotifFlyFallback(root) {
    if (!root) return;
    var safeTop = 0;
    try {
      safeTop = Number(window.__vcSafeTop) || 0;
    } catch (eSafe) {}
    root.style.position = "fixed";
    root.style.display = "inline-flex";
    root.style.width = "auto";
    root.style.top = Math.round(Math.max(12, safeTop + 12)) + "px";
    root.style.right = "12px";
    root.style.left = "auto";
    root.style.bottom = "auto";
    root.style.setProperty("--vc-pop-ox", "28px");
  }

  /* notifIgToastBell1: restore IG pill, keep bell badge paint, anchor to bell
     pushFocusShow1: mostra toast anche con dropdown aperto; return true se UI mostrata
     notifToastCountFix1: count = unread distinti (mai somma additiva) */
  function showNotifFlyToast(row) {
    var toastId = String((row && row.id) || "");
    var nowMs = Date.now();
    if (toastId && toastId === lastFlyToastId && nowMs - lastFlyToastAt < 900) {
      /* same id spam — refresh count from store if pill is live */
    } else {
      lastFlyToastId = toastId;
      lastFlyToastAt = nowMs;
    }
    ensureSiteNotifDropdown();
    try {
      paintNotifBellBadgeFromStore();
    } catch (eBell) {}
    var bell = document.querySelector("#vc-notif-dropdown summary.vc-notif-summary");
    if (isOnNotificationsPage()) {
      pulseNotifSummary();
      return false;
    }

    var kind = String((row && row.kind) || "info");
    var toastIco = notifToastIconClass(row);
    var labelHint = String((row && row.title) || "").trim();
    var dest = resolveNotifDestUrl(String((row && row.openUrl) || "").trim());
    var liveUnread = 0;
    try {
      liveUnread = countBellBadgeUnread();
    } catch (eLive) {
      try {
        liveUnread = countDistinctUnreadNotifs(rows());
      } catch (eLive2) {
        liveUnread = 0;
      }
    }
    var addCount = Math.max(1, Math.floor(Number(row && row.count) || 1));
    var nextCount = liveUnread > 0 ? liveUnread : addCount;

    if (notifIgToastEl && document.body.contains(notifIgToastEl)) {
      notifIgToastCount = nextCount;
      notifIgToastKind = kind || notifIgToastKind;
      updateNotifIgToastUi(notifIgToastEl, notifIgToastKind, notifIgToastCount, labelHint, toastIco);
      if (bell) placeNotifPopNearBell(notifIgToastEl, bell);
      else placeNotifFlyFallback(notifIgToastEl);
      pulseNotifSummary();
      scheduleNotifIgToastHide();
      return true;
    }

    notifIgToastCount = nextCount;
    notifIgToastKind = kind;
    var root = document.createElement("button");
    root.type = "button";
    root.className = "vc-notif-fly-card vc-notif-ig-toast";
    root.setAttribute("role", "status");
    root.setAttribute("aria-live", "polite");
    root.style.position = "fixed";
    root.style.zIndex = "100001";
    root.style.display = "inline-flex";

    var ico = document.createElement("span");
    ico.className = "vc-notif-ig-toast__ico";
    ico.setAttribute("aria-hidden", "true");
    var fi = document.createElement("i");
    fi.className = "fa " + toastIco;
    ico.appendChild(fi);

    var countEl = document.createElement("span");
    countEl.className = "vc-notif-ig-toast__count";

    root.appendChild(ico);
    root.appendChild(countEl);
    document.body.appendChild(root);
    notifIgToastEl = root;
    notifFlyActiveCount = 1;
    syncGlobalNotifOverlayClass();
    updateNotifIgToastUi(root, kind, notifIgToastCount, labelHint, toastIco);
    if (bell) placeNotifPopNearBell(root, bell);
    else placeNotifFlyFallback(root);
    pulseNotifSummary();
    try {
      if (row && !row.read) requestWindowAttention();
    } catch (eAtt) {}
    window.requestAnimationFrame(function () {
      try {
        var bell2 = document.querySelector("#vc-notif-dropdown summary.vc-notif-summary");
        if (bell2 && notifIgToastEl === root) placeNotifPopNearBell(root, bell2);
      } catch (eRaf) {}
    });

    root.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      finishNotifIgToast(true);
      var pending = !row || !row.id || String(row.id).indexOf("pending-") === 0;
      if (!pending && row && row.id) {
        try {
          markOneRead(row.id);
        } catch (eMark) {}
      }
      if (pending || nextCount > 1) {
        openNotifDropdownProgrammatic();
        return;
      }
      if (dest) {
        openNotifDestination(dest, kind);
        return;
      }
      openNotifDropdownProgrammatic();
    });

    scheduleNotifIgToastHide();
    bindNotifIgToastReposition();
    return true;
  }

  function bindNotifIgToastReposition() {
    if (window.__vcNotifIgToastReposBound) return;
    window.__vcNotifIgToastReposBound = true;
    function repos() {
      if (!notifIgToastEl || !document.body.contains(notifIgToastEl)) return;
      var bell = document.querySelector("#vc-notif-dropdown summary.vc-notif-summary");
      if (bell) placeNotifPopNearBell(notifIgToastEl, bell);
    }
    window.addEventListener("resize", repos, { passive: true });
    window.addEventListener("scroll", repos, { passive: true, capture: true });
  }

  function updateNotifIgToastUi(root, kind, count, labelHint, iconOverride) {
    if (!root) return;
    var n = Math.max(1, Math.floor(Number(count) || 1));
    var ico = root.querySelector(".vc-notif-ig-toast__ico i");
    if (ico) {
      ico.className =
        "fa " +
        (iconOverride
          ? String(iconOverride).replace(/^fa\s+/, "")
          : iconClass(kind));
    }
    var countEl = root.querySelector(".vc-notif-ig-toast__count");
    if (countEl) countEl.textContent = n > 99 ? "99+" : String(n);
    var label =
      n === 1
        ? tUi("notif.igToastOne", null, "1 nuova notifica")
        : tUi("notif.igToastMany", { n: n }, "{n} nuove notifiche");
    if (labelHint) label = label + " · " + labelHint;
    root.setAttribute("aria-label", label);
    root.title = label;
  }

  function scheduleNotifIgToastHide() {
    if (notifIgToastTimer) {
      try {
        clearTimeout(notifIgToastTimer);
      } catch (eC) {}
      notifIgToastTimer = 0;
    }
    notifIgToastTimer = window.setTimeout(function () {
      notifIgToastTimer = 0;
      finishNotifIgToast(false);
    }, NOTIF_FLY_READ_MS);
  }

  function finishNotifIgToast(fromClick) {
    var root = notifIgToastEl;
    if (!root) return;
    if (notifIgToastTimer) {
      try {
        clearTimeout(notifIgToastTimer);
      } catch (eC) {}
      notifIgToastTimer = 0;
    }
    root.classList.add("vc-notif-fly-card--out", "vc-notif-ig-toast--out");
    notifIgToastEl = null;
    notifIgToastCount = 0;
    window.setTimeout(function () {
      try {
        root.remove();
      } catch (e2) {}
      notifFlyActiveCount = Math.max(0, notifFlyActiveCount - 1);
      syncGlobalNotifOverlayClass();
      if (!fromClick) pulseNotifSummary();
    }, NOTIF_FLY_ANIM_MS + 40);
  }

  function notifPendingToastPathKey() {
    try {
      return String(window.location.pathname || "/") + String(window.location.search || "");
    } catch (ePath) {
      return "/";
    }
  }

  function clearNotifPendingToastSessionGate() {
    try {
      sessionStorage.removeItem("vc_notif_ig_pending_shown_v1");
    } catch (eClr) {}
  }

  function maybeShowPendingUnreadIgToast() {
    /* notifPendingToastNoFlash1: una volta per path; mai di nuovo su poll/sync/merge */
    if (isOnNotificationsPage()) return;
    if (!normalizeUserId(currentUserId) || !getDiscordAccessToken()) return;
    var pathKey = notifPendingToastPathKey();
    if (notifIgPendingShownPath === pathKey) return;
    if (notifIgToastEl && document.body.contains(notifIgToastEl)) {
      try {
        var live = countBellBadgeUnread();
        if (live > 0) {
          notifIgToastCount = live;
          updateNotifIgToastUi(notifIgToastEl, notifIgToastKind, live, "", notifToastIconClass({ kind: notifIgToastKind }));
        }
      } catch (eUpd) {}
      return;
    }
    var unreadItems = [];
    try {
      unreadItems = bellBadgeUnreadItems();
    } catch (eRows) {
      unreadItems = [];
    }
    if (!unreadItems.length) {
      /* non azzerare il gate: merge/poll può avere store vuoto un attimo → altrimenti flash */
      return;
    }
    notifIgPendingShownPath = pathKey;
    var newest = unreadItems[0];
    for (var i = 1; i < unreadItems.length; i += 1) {
      if ((Number(unreadItems[i].at) || 0) > (Number(newest.at) || 0)) newest = unreadItems[i];
    }
    window.setTimeout(function () {
      try {
        if (notifIgPendingShownPath !== pathKey) return;
        var still = [];
        try {
          still = bellBadgeUnreadItems();
        } catch (eStill) {
          still = unreadItems;
        }
        if (!still.length) {
          /* unread spariti (letti) — lascia gate così non riparte il float */
          return;
        }
        if (notifPendingToastPathKey() !== pathKey) return;
        if (notifIgToastEl && document.body.contains(notifIgToastEl)) return;
        var distinct = countDistinctUnreadNotifs(still);
        var tip = newest;
        for (var j = 0; j < still.length; j += 1) {
          if ((Number(still[j].at) || 0) > (Number(tip.at) || 0)) tip = still[j];
        }
        showNotifFlyToast({
          id: "pending-" + pathKey + "-" + distinct + "-" + String((tip && tip.id) || ""),
          kind: String((tip && tip.kind) || "info"),
          count: distinct,
          title: String((tip && tip.title) || "").trim(),
          body: "",
          openUrl: String((tip && tip.openUrl) || "").trim(),
          ticketId: String((tip && tip.ticketId) || "").trim(),
          dedupeKey: String((tip && tip.dedupeKey) || "").trim(),
          channel: String((tip && tip.channel) || "").trim(),
          read: false,
        });
      } catch (eShow) {}
    }, 700);
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
              : kindRaw === "staff"
                ? "staff"
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
    try {
      var chIn = String((p && p.channel) || "").trim().toLowerCase();
      if (chIn === "inbox" || chIn === "personal") item.channel = chIn;
    } catch (eCh) {}
    try {
      var dkIn = String((p && p.dedupeKey) || "").trim();
      if (dkIn) item.dedupeKey = dkIn.slice(0, 180);
    } catch (eDk) {}
    if (!item.channel) {
      try {
        item.channel = isInboxLinkedNotifClient(item) ? "inbox" : "personal";
      } catch (eInfer) {}
    }
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
          /* notifBellInboxBadge1: push/realtime con __resetRead riapre unread */
          read: p && p.__resetRead === true ? false : Boolean(s[dup].read) || incomingRead,
        });
        s[dup] = merged;
        try {
          localStorage.setItem(key, JSON.stringify(s));
        } catch (e3) {}
        if (!p || !p.__noRender) render();
        return { added: false, merged: true };
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
          read: p && p.__resetRead === true ? false : Boolean(s[c].read) || incomingRead,
        });
        s[c] = mergedC;
        try {
          localStorage.setItem(key, JSON.stringify(s));
        } catch (e4) {}
        if (!p || !p.__noRender) render();
        return { added: false, merged: true };
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
                  return window.matchMedia(
        "(max-width: 639.98px), ((pointer: coarse) and (max-width: 920px))",
      ).matches;
    } catch (e) {
      return (window.innerWidth || 999) <= 640;
    }
  }

  function isOnNotificationsPage() {
    try {
      return Boolean(document.body && document.body.classList.contains("vc-notifications-page"));
    } catch (eOnNotifPage) {
      return false;
    }
  }

  function formatNotifToastMessage(row) {
    var title = row && row.title ? String(row.title).trim() : "Nuova notifica";
    var body = row && row.body ? String(row.body).trim() : "";
    if (!body || body === title) return title;
    var combined = title + " — " + body;
    return combined.length > 140 ? combined.slice(0, 137) + "…" : combined;
  }

  function showDashStyleSiteToast(text, isError, opts) {
    var msg = String(text || "").trim();
    if (!msg) return false;
    opts = opts || {};
    if (window.VcSiteToast && typeof window.VcSiteToast.show === "function") {
      window.VcSiteToast.show(msg, Boolean(isError), opts);
      return true;
    }
    var host = document.getElementById("vc-site-toast-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "vc-site-toast-host";
      host.className = "vc-dash-save-toast-host vc-site-toast-host";
      host.setAttribute("aria-live", "polite");
      host.setAttribute("aria-atomic", "true");
      try {
        host.style.setProperty("z-index", "300000", "important");
      } catch (eZ) {}
      document.body.appendChild(host);
    } else {
      try {
        host.style.setProperty("z-index", "300000", "important");
      } catch (eZ2) {}
    }
    host.innerHTML = "";
    var pending =
      opts.pending === true ||
      opts.sticky === true ||
      (!isError && /[…]$|\.\.\.$/.test(msg));
    var toast = document.createElement("div");
    toast.className =
      "vc-dash-save-toast" + (isError ? " is-error" : "") + (pending ? " is-pending" : "");
    toast.setAttribute("role", "status");
    var ico = document.createElement("span");
    ico.className = "vc-dash-save-toast__icon";
    ico.setAttribute("aria-hidden", "true");
    ico.innerHTML = isError
      ? '<i class="fa fa-times" aria-hidden="true"></i>'
      : pending
        ? '<span class="vc-ui-spinner vc-ui-spinner--on-dark" aria-hidden="true"></span>'
        : '<i class="fa fa-check" aria-hidden="true"></i>';
    var p = document.createElement("p");
    p.className = "vc-dash-save-toast__text";
    p.textContent = msg;
    toast.appendChild(ico);
    toast.appendChild(p);
    host.appendChild(toast);
    requestAnimationFrame(function () {
      toast.classList.add("is-visible");
    });
    if (pending) return true;
    var ms = Number(opts.ms);
    if (!Number.isFinite(ms) || ms <= 0) ms = isError ? 2800 : 3600;
    window.setTimeout(function () {
      toast.classList.add("is-leaving");
      toast.classList.remove("is-visible");
      window.setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 200);
    }, ms);
    return true;
  }

  try {
    window.__vcShowSiteToast = showDashStyleSiteToast;
  } catch (eToastExpo) {}

  var notifPortalGuardUntil = 0;
  var notifPortalSyncing = false;
  /* notifBellScrollStay2: Y captured on pointerdown before overflow-lock / portal can reset it */
  var notifScrollAnchorY = 0;
  /* notifDoubleClose1: invalidate pending portal forceOpen; ignore ghost 2nd tap. */
  var notifPortalOpenGen = 0;
  var notifBellGestureLockUntil = 0;

  /* sheetGhostClose2 / inboxClickOpen10:
     swallow ghost-reopen SOLO se guard armata; until su window (niente desync);
     arm(0)=disarm; mai mangiare click su inbox/sheet. */
  (function wireSheetGhostCloseGuard() {
    if (window.__vcSheetGhostCloseWired === "inboxClickOpen10") return;
    window.__vcSheetGhostCloseWired = "inboxClickOpen10";
    function arm(ms) {
      var n = Number(ms);
      var until = 0;
      /* inboxClickOpen10 / inboxCardOpen1: arm(0) = disarm immediato */
      if (n !== 0) {
        until = Date.now() + (n > 0 ? n : 420);
      }
      try {
        window.__vcSheetCloseGuardUntil = until;
      } catch (eArm) {}
    }
    function guarded() {
      try {
        return Date.now() < Number(window.__vcSheetCloseGuardUntil || 0);
      } catch (eG) {
        return false;
      }
    }
    window.__vcArmSheetCloseGuard = arm;
    window.__vcSheetCloseGuarded = guarded;
    function swallow(ev) {
      if (!guarded()) return;
      try {
        var t = ev && ev.target;
        if (!t || !t.closest) return;
        if (
          t.closest(
            ".vc-staff-reso-sheet, .vc-staff-stat-sheet, .vc-staff-manage-sheet, .vc-feedback-sheet, .vc-dialog, .vc-dash-confirm, #vc-site-dialog, .vc-staff-datepicker, #vc-staff-compiti-board, #vc-staff-compiti-book, #vc-compiti-cover, .vc-compiti-leaf, .vc-notif-panel, .vc-notif-scope-switch, #vc-notif-dropdown .vc-notif-bell-inbox, #vc-notif-see-all, #vc-staff-inbox, .vc-notif-staff-inbox, #vc-staff-inbox-list",
          )
        ) {
          return;
        }
        /* inboxCardOpen1: NON swallow click sulle card inbox (aprivano sheet/modal).
           Guard resta solo per ghost-reopen campanella / bell-inbox. */
        if (
          !t.closest(
            ".vc-notif-bell-inbox__item, summary.vc-notif-summary, #vc-notif-dropdown > summary",
          )
        ) {
          return;
        }
      } catch (eAllow) {
        return;
      }
      try {
        if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
        if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
        if (ev && typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
      } catch (eSw) {}
    }
    document.addEventListener("click", swallow, true);
    document.addEventListener("pointerup", swallow, true);
    document.addEventListener("mouseup", swallow, true);
  })();

  function normalizeHeaderQuickActionsOrder(actions) {
    if (!actions) actions = document.getElementById("header-quick-actions");
    if (!actions) return;
    var promo = actions.querySelector("#vc-header-promo-btn, .vc-header-promo-btn");
    var viewAs = actions.querySelector("#vc-view-as-launch");
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
    place(viewAs);
    place(notif);
    place(toggle);
    place(loginBtn);
    place(loginState);
  }

  /* viewAsOrderFix1: riordina anche dopo mount tardivo di Anteprima */
  try {
    document.addEventListener(
      "DOMContentLoaded",
      function () {
        normalizeHeaderQuickActionsOrder();
        window.setTimeout(function () {
          normalizeHeaderQuickActionsOrder();
        }, 400);
      },
      { once: true }
    );
  } catch (eNormBoot) {}

  try {
    window.__vcNormalizeHeaderQuickActionsOrder = normalizeHeaderQuickActionsOrder;
  } catch (eNormExport) {}

    function ensureNotifDropdownInHeader(force) {
    var dd = document.getElementById("vc-notif-dropdown");
    if (!dd) return null;
    var actions = document.getElementById("header-quick-actions");
    if (!actions) return dd;
    /* notifSheetAlign1: never reclaim to header while sheet/drawer is open */
    if (dd.open) return dd;
    try {
      var root = document.documentElement;
      if (
        root.classList.contains("vc-notif-sheet-open") ||
        root.classList.contains("vc-notif-drawer-open")
      ) {
        return dd;
      }
    } catch (eOpenCls) {}
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

    /* notifSidebar4: never auto-close on visibility/pageshow/PTR repair; only forceClose. */
    function repairNotifDropdownPortal(opts) {
    opts = opts || {};
    var forceClose = Boolean(opts.forceClose);
    var dd = document.getElementById("vc-notif-dropdown");
    if (!dd) return;
    var intentionallyOpen = false;
    try {
      intentionallyOpen = Boolean(dd.open || dd.hasAttribute("open"));
    } catch (eOpenChk) {
      intentionallyOpen = false;
    }
    if (!forceClose && intentionallyOpen) {
      try {
        syncNotifMobileSheetChrome();
      } catch (eKeepOpen) {}
      try {
        if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
      } catch (eLockKeep) {}
      return;
    }
    notifPortalGuardUntil = 0;
    notifPortalOpenGen += 1;
    try {
      dd.open = false;
      dd.removeAttribute("open");
    } catch (eClose) {}
    try {
      document.documentElement.classList.remove(
        "vc-notif-dropdown-open",
        "vc-notif-sheet-open",
        "vc-notif-drawer-open",
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
        try {
      if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
    } catch (eLockRepair) {}
    try {
      restoreNotifScrollAfterClose();
    } catch (eRestore) {}
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


  function hidePortaledNotifSummary(dd, hide) {
    /* notifBellNoJump1 */
    if (!dd) return;
    try {
      var sum = dd.querySelector(":scope > summary.vc-notif-summary, :scope > summary");
      if (!sum) return;
      if (hide) {
        sum.setAttribute("hidden", "");
        sum.setAttribute("aria-hidden", "true");
        sum.style.setProperty("display", "none", "important");
        sum.style.setProperty("visibility", "hidden", "important");
        sum.style.setProperty("position", "fixed", "important");
        sum.style.setProperty("left", "-10000px", "important");
        sum.style.setProperty("top", "-10000px", "important");
      } else {
        sum.removeAttribute("hidden");
        sum.removeAttribute("aria-hidden");
        sum.style.removeProperty("display");
        sum.style.removeProperty("visibility");
        sum.style.removeProperty("position");
        sum.style.removeProperty("left");
        sum.style.removeProperty("top");
      }
    } catch (eHide) {}
  }
  function portalNotifDropdownToBody(dd, enable) {
    if (!dd) return;
    var slotId = "vc-notif-dropdown-slot";
    var slot = document.getElementById(slotId);
    if (enable) {
      var moved = false;
      if (dd.parentElement !== document.body) {
        if (!slot) {
          slot = document.createElement("span");
          slot.id = slotId;
          slot.hidden = true;
          slot.setAttribute("aria-hidden", "true");
          if (dd.parentNode) dd.parentNode.insertBefore(slot, dd);
        }
        document.body.appendChild(dd);
        moved = true;
      }
      setNotifHeaderSlotHold(true);
      /* notifSheetSmooth1: gia' portaled+open → non rifare forceOpen */
      if (!moved && dd.open) {
      notifPortalGuardUntil = Date.now() + 1400;
      return;
    }
    notifPortalOpenGen += 1;
    var openGen = notifPortalOpenGen;
    function forceOpen() {
      if (openGen !== notifPortalOpenGen) return;
      try {
        dd.open = true;
        dd.setAttribute("open", "");
      } catch (eOpen) {}
    }
    forceOpen();
    try {
      window.requestAnimationFrame(forceOpen);
    } catch (eRaf) {}
    notifPortalGuardUntil = Date.now() + 1400;
    try {
      window.__vcNotifOpenGraceUntil = Date.now() + 750;
    } catch (eGrace) {}
    return;
    }
    notifPortalOpenGen += 1;
    setNotifHeaderSlotHold(false);
    ensureNotifDropdownInHeader(true);
  }

  function kickNotifSheetAnimOnce() {
    try {
      if (window.VcNotifChrome && typeof window.VcNotifChrome.kickAnim === "function") {
        window.VcNotifChrome.kickAnim();
        return;
      }
    } catch (eKick) {}
    try {
      var root = document.documentElement;
      root.classList.remove("vc-notif-sheet-noanim");
      if (!isMobileNotifViewport()) return;
      root.classList.remove("vc-notif-sheet-anim");
      void root.offsetWidth;
      root.classList.add("vc-notif-sheet-anim");
      window.setTimeout(function () {
        try {
          root.classList.remove("vc-notif-sheet-anim");
        } catch (eClr) {}
      }, 420);
    } catch (e2) {}
  }

  var notifOpenAnimUntil = 0;
  function openNotifSheetSmooth(live) {
    /* notifSheetSmooth1: portal+scope PRIMA di open; una sola anim slide */
    /* notifInboxTapFix1: debounce open — evita doppia anim (touch+click / reclaim) */
    /* notifSheetScopeFix1: forza Personali PRIMA del sync chrome (niente flash Inbox) */
    if (!live || live.open) return false;
    var nowOpen = Date.now();
    if (nowOpen < notifOpenAnimUntil) return false;
    notifOpenAnimUntil = nowOpen + 700;
    notifBellGestureLockUntil = Math.max(notifBellGestureLockUntil, nowOpen + 520);
    try {
      bellNotifScope = "personal";
      setBellNotifScope("personal", { source: "open", silent: true, remember: false });
    } catch (eScopeFirst) {}
    try {
      if (window.VcNotifChrome && typeof window.VcNotifChrome.openSmooth === "function") {
        holdPageScroll(220);
        return window.VcNotifChrome.openSmooth(live);
      }
    } catch (eChrome) {}
    var root = document.documentElement;
    try {
      root.classList.add("vc-notif-sheet-noanim");
      root.classList.remove("vc-notif-sheet-anim");
    } catch (eNo) {}
    primeDesktopNotifDrawer(live);
    try {
      ensureNotifBellScopeUi();
      syncNotifBellScopeChrome();
    } catch (eScope) {}
    portalNotifDropdownToBody(live, true);
    holdPageScroll(220);
    try {
      live.open = true;
      live.setAttribute("open", "");
    } catch (eOpen) {}
    try {
      window.__vcNotifOpenGraceUntil = Date.now() + 750;
    } catch (eGrace) {}
    scheduleNotifSheetChromeSync({ delayMs: 0 });
    try {
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(kickNotifSheetAnimOnce);
      });
    } catch (eRaf) {
      window.setTimeout(kickNotifSheetAnimOnce, 32);
    }
    return true;
  }

  /* notifSidebar2: intentional close must clear portal guard or Esc/2nd click get reopened.
     notifDoubleClose1: bump openGen so pending rAF forceOpen cannot reopen. */
  function requestCloseNotifDropdown(dd) {
    try {
      notifSheetSessionActive = false;
    } catch (eSess) {}
    /* notifCloseGuard1: landing X must also clear VcNotifChrome portalGuard or sync reopens */
    notifPortalGuardUntil = 0;
    try {
      window.__vcNotifOpenGraceUntil = 0;
    } catch (eGraceClr) {}
    notifPortalOpenGen += 1;
    notifBellGestureLockUntil = Date.now() + 520;
    try {
      if (typeof window.__vcArmSheetCloseGuard === "function") window.__vcArmSheetCloseGuard(520);
    } catch (eGhost) {}
    try {
      document.documentElement.classList.remove("vc-notif-sheet-anim", "vc-notif-sheet-noanim");
    } catch (eAnim) {}
    try {
      if (window.VcNotifChrome && typeof window.VcNotifChrome.close === "function") {
        window.VcNotifChrome.close(dd);
      }
    } catch (eChromeClose) {}
    var live = dd || document.getElementById("vc-notif-dropdown");
    if (!live) return;
    try {
      live.open = false;
      live.removeAttribute("open");
    } catch (eClose) {
      try {
        live.removeAttribute("open");
      } catch (eClose2) {}
    }
  }

  function primeDesktopNotifDrawer(dd, opts) {
    /* notifPhoneOpen3: su mobile non prime al pointerdown — sheet-open nasconde la bell
       e iOS perde il click successivo (campanella sparisce, sheet mai aperto). */
    if (!dd || dd.open) return;
    opts = opts || {};
    var root = document.documentElement;
    try {
      if (isMobileNotifViewport()) {
        if (opts.fromPointer) return;
        root.classList.add("vc-notif-sheet-open", "vc-notif-dropdown-open");
        root.classList.remove("vc-notif-drawer-open");
      } else {
        root.classList.add("vc-notif-drawer-open", "vc-notif-dropdown-open");
        root.classList.remove("vc-notif-sheet-open");
      }
    } catch (ePrime) {}
  }

  function restoreNotifScrollAfterClose(preferredY) {
    /* notifCloseScrollStay1: unlock + reparent focus must not jump to top */
    /* scrollStayAll1: non tirare a 0 se l'utente è già mid-page senza pin reale */
    var yKeep = null;
    var curBefore = 0;
    try {
      curBefore = pageScrollY();
    } catch (eCur0) {}
    try {
      if (preferredY != null && Number.isFinite(Number(preferredY))) {
        yKeep = Math.max(0, Number(preferredY) || 0);
      } else if (scrollPinned && Number(scrollPinSavedY) > 0) {
        yKeep = Math.max(Number(scrollPinSavedY) || 0, curBefore);
      } else {
        yKeep = curBefore;
      }
    } catch (eY) {
      yKeep = curBefore;
    }
    try {
      if (
        preferredY == null &&
        !(scrollPinned && Number(scrollPinSavedY) > 0) &&
        Number(yKeep) < 24 &&
        curBefore > 48
      ) {
        holdPageScroll(160, curBefore);
        return;
      }
    } catch (eStay) {}
    try {
      var sum = document.querySelector("#vc-notif-dropdown > summary.vc-notif-summary, #vc-notif-dropdown > summary");
      if (sum && document.activeElement === sum && typeof sum.blur === "function") sum.blur();
    } catch (eBlur) {}
    try {
      if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
    } catch (eSync) {}
    try {
      var root = document.documentElement;
      var stillFrozen =
        (typeof isPageScrollFrozen === "function" && isPageScrollFrozen()) ||
        isNotifPanelChromeOpen(root);
      if (!stillFrozen && typeof window.__vcUnpinPageScroll === "function") {
        window.__vcUnpinPageScroll();
      }
    } catch (eUnpin) {}
    try {
      if (typeof window.__vcStripPhoneInlineScrollLocks === "function") {
        window.__vcStripPhoneInlineScrollLocks();
      }
    } catch (eStrip) {}
    restorePageScrollY(yKeep);
    holdPageScroll(280, yKeep);
  }

  function clearStuckNotifDrawerPrime() {
    /* notifBellFix1: pointerdown prime without a successful open left overflow-lock + dead bell. */
    try {
      var live = document.getElementById("vc-notif-dropdown");
      if (live && live.open) return;
      var root = document.documentElement;
      if (!root) return;
      if (
        !root.classList.contains("vc-notif-drawer-open") &&
        !root.classList.contains("vc-notif-sheet-open") &&
        !root.classList.contains("vc-notif-dropdown-open")
      ) {
        return;
      }
      root.classList.remove("vc-notif-drawer-open", "vc-notif-sheet-open", "vc-notif-dropdown-open");
      restoreNotifScrollAfterClose();
    } catch (eClearPrime) {}
  }

  function scheduleNotifSheetChromeSync(opts) {
    /* notifBellFix1: never portal/move <details> synchronously inside toggle — browsers cancel open. */
    opts = opts || {};
    var delay = opts.delayMs != null ? Number(opts.delayMs) : 0;
    function run() {
      try {
        syncNotifMobileSheetChrome();
      } catch (eSync) {}
      try {
        var live = document.getElementById("vc-notif-dropdown");
        if (!live || !live.open) clearStuckNotifDrawerPrime();
      } catch (eChk) {}
    }
    if (delay > 0) {
      window.setTimeout(run, delay);
      return;
    }
    try {
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(run);
      });
    } catch (eRaf) {
      window.setTimeout(run, 0);
    }
  }

  function syncNotifMobileSheetChrome() {
    /* notifChromeUnify2: un solo portal path (shared chrome) quando disponibile */
    if (window.VcNotifChrome && typeof window.VcNotifChrome.sync === "function") {
      try {
        window.VcNotifChrome.sync();
        return;
      } catch (eSharedSync) {}
    }
    /* notifSidebar2: mobile sheet + desktop right drawer; no classic popup flash.
       notifBellFix1: portal only after toggle settles (see scheduleNotifSheetChromeSync). */
    if (notifPortalSyncing) return;
    var dd = document.getElementById("vc-notif-dropdown");
    if (!dd) return;
    var root = document.documentElement;
    var mobile = isMobileNotifViewport();
    if (!dd.open && Date.now() < notifPortalGuardUntil) {
      try {
        dd.open = true;
        dd.setAttribute("open", "");
      } catch (eRe) {}
      /* notifAutoCloseFix1: continua col path open (classi) invece di return nudo */
    }
    notifPortalSyncing = true;
    try {
      if (dd.open) {
        var yKeepOpen =
          typeof notifScrollAnchorY === "number" && notifScrollAnchorY > 0
            ? notifScrollAnchorY
            : pageScrollY();
        try {
          if (mobile) {
            root.classList.add("vc-notif-sheet-open");
            root.classList.remove("vc-notif-drawer-open");
          } else {
            root.classList.add("vc-notif-drawer-open");
            root.classList.remove("vc-notif-sheet-open");
          }
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
          var bdLockUntil = 0;
          var closeFromBd = function () {
            if (Date.now() < Number(window.__vcNotifOpenGraceUntil || 0)) return;
            try {
              if (window.VcNotifChrome && typeof window.VcNotifChrome.inOpenGrace === "function" && window.VcNotifChrome.inOpenGrace()) {
                return;
              }
            } catch (eGrace) {}
            var now = Date.now();
            if (now < bdLockUntil) return;
            bdLockUntil = now + 480;
            notifBellGestureLockUntil = Date.now() + 420;
            requestCloseNotifDropdown(dd);
            scheduleNotifSheetChromeSync({ delayMs: 0 });
          };
          bd.addEventListener("pointerup", closeFromBd);
          bd.addEventListener("click", closeFromBd);
          dd.insertBefore(bd, dd.firstChild);
        }
        try {
          ensureNotifBellScopeUi();
          syncNotifBellScopeChrome();
        } catch (eScopeUi) {}
        /* notifBellScrollStay2 */
        if (scrollPinned) scrollPinSavedY = Math.max(Number(scrollPinSavedY) || 0, yKeepOpen);
        restorePageScrollY(yKeepOpen);
        holdPageScroll(260, yKeepOpen);
      } else {
        notifPortalGuardUntil = 0;
        var yKeepClose =
          scrollPinned && Number(scrollPinSavedY) > 0 ? Number(scrollPinSavedY) || 0 : pageScrollY();
        try {
          var sumClose = dd.querySelector("summary");
          if (sumClose && typeof sumClose.blur === "function") sumClose.blur();
        } catch (eBlurClose) {}
        try {
          root.classList.remove("vc-notif-sheet-open", "vc-notif-drawer-open", "vc-notif-dropdown-open");
        } catch (e1) {}
        var oldBd = dd.querySelector(".vc-notif-mobile-backdrop");
        if (oldBd) oldBd.remove();
        portalNotifDropdownToBody(dd, false);
        ensureNotifDropdownInHeader(true);
        restoreNotifScrollAfterClose(yKeepClose);
      }
      syncGlobalNotifOverlayClass();
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
    var pushNativeGestureInFlight = false;
    var pushSubActive = null;
  var refreshPushInFlight = null;
  var lastPostedPushEndpoint = "";
  var lastPostedPushAt = 0;
  var lastPushErrorHint = "";
  var PUSH_RESYNC_MIN_MS = 45 * 1000;
  var PUSH_MOBILE_RECREATE_KEY = "vc_push_mobile_recreate_at_v1";
  var PUSH_MOBILE_RECREATE_MS = 45 * 60 * 1000; /* pushGonePersist1: 45m (era 3h) — FCM muore spesso */
  var cachedPushReg = null;
  var cachedVapidPublicKey = "";
  var vapidFetchInFlight = null;
  var vapidFetchBlockedUntil = 0;
  var siteNotifsSyncInFlight = null;
  var siteNotifsPendingForceOpts = null;
  var siteNotifsBlockedUntil = 0;
  var siteNotifsLastSyncAt = 0;
  /* siteNotifW2: after first full list, closed-panel polls use mode=count */
  var siteNotifsEverFullSynced = false;
  var siteNotifsCountEtag = "";
  var siteNotifsLastServerUnread = -1;
  /* siteApiW4: workflows summary ETag → 304 on bell reopen */
  var bellStaffSummaryEtag = "";
  var SITE_NOTIFS_MIN_GAP_MS = 12000;
  var SERVER_UNREAD_SS_PREFIX = "vc_notif_server_unread_v1:";

  function serverUnreadSsKey() {
    return SERVER_UNREAD_SS_PREFIX + (normalizeUserId(currentUserId) || "anon");
  }
  function rememberServerUnreadCount(n) {
    var v = Math.max(0, Math.floor(Number(n) || 0));
    siteNotifsLastServerUnread = v;
    try {
      sessionStorage.setItem(serverUnreadSsKey(), String(v));
    } catch (eSs) {}
    return v;
  }
  function loadServerUnreadHold() {
    var mem = Number(siteNotifsLastServerUnread);
    if (Number.isFinite(mem) && mem >= 0) return mem;
    try {
      var raw = Number(sessionStorage.getItem(serverUnreadSsKey()) || "");
      if (Number.isFinite(raw) && raw >= 0) return raw;
    } catch (eLoad) {}
    return 0;
  }
  /* notifBadgeServerTruth1 + pushBellFocusFix1: badge = max(store, server),
     ma dopo click push/local mark non re-infiare dal server per qualche secondo.
     notifPushBellCatchup1: hold solo se local < server (mai spegnere unread nuovi). */
  var localMarkHoldUntil = 0;
  function noteLocalMarkReadHold() {
    localMarkHoldUntil = Date.now() + 10000;
  }
  function clearLocalMarkReadHold() {
    localMarkHoldUntil = 0;
  }
  function paintBellBadgeWithServerTruth(storeN) {
    var local = Math.max(0, Math.floor(Number(storeN) || 0));
    var server = loadServerUnreadHold();
    if (Date.now() < localMarkHoldUntil && local < server) {
      return paintNotifBellBadgeCount(local);
    }
    var paint = Math.max(local, server);
    return paintNotifBellBadgeCount(paint);
  }
  var siteNotifsPollBooted = false;
  var pushSubscribeBlockedUntil = 0;
    var pushSubscribePostInFlight = null;
  var forbiddenStatusInFlight = null;
  var forbiddenStatusBlockedUntil = 0;
  var syncExistingPushInFlight = null;
  var siteRealtimeWsFailCount = 0;
  var siteRealtimeWsBlockedUntil = 0;
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
    if (pushAutoRecoverDone || pushNativeGestureInFlight || pushSubscribePostInFlight) return;
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
    // Already registered successfully before + permission still granted → no nag banner.
    if (perm === "granted" && hadPushOk() && pushSubActive !== false) return false;
    if (wasPushPromptDismissed()) return false;
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
      if (!key) return true;
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
    /* swBackPwa1: anche PWA registra /sw-m1.js (push-only).
       Restano: no getNotifications storm, no Cache API pagina, no auth→SW spam. */
    if (window.__vcSwRegPromise) return window.__vcSwRegPromise;
    var SW_URL = "/sw-m1.js?v=20261001pushNoBgUpdate1";
    window.__vcSwRegPromise = Promise.resolve()
      .then(function () {
        return navigator.serviceWorker.getRegistrations().then(function (regs) {
          var kills = [];
          for (var i = 0; i < (regs || []).length; i++) {
            var reg = regs[i];
            var url = "";
            try {
              url =
                (reg.active && reg.active.scriptURL) ||
                (reg.waiting && reg.waiting.scriptURL) ||
                (reg.installing && reg.installing.scriptURL) ||
                "";
            } catch (eU) {}
            if (String(url).indexOf("sw-m1.js") === -1) {
              try {
                kills.push(reg.unregister());
              } catch (eUn) {}
            } else {
              /* pwaBgCpu2: forza update sw-m1 (kill idle CPU path) */
              try {
                if (reg && typeof reg.update === "function") kills.push(reg.update().catch(function () {}));
              } catch (eUpdKill) {}
            }
          }
          return Promise.all(kills);
        });
      })
      .then(function () {
        /* consoleNoiseKill2: aspetta strip CSP estensione prima di register worker */
        return new Promise(function (resolve) {
          window.setTimeout(resolve, 120);
        });
      })
      .then(function () {
        var swUrl = SW_URL;
        try {
          if (typeof window.__vcTrustedScriptURL === "function") {
            swUrl = window.__vcTrustedScriptURL(SW_URL);
          }
        } catch (eTt) {}
        return navigator.serviceWorker.register(swUrl, { scope: "/", updateViaCache: "none" });
      })
      .then(function (reg) {
        try {
          /* pushReliability1: forza check update SW (silent:false) */
          if (reg && typeof reg.update === "function") reg.update().catch(function () {});
        } catch (eUpd) {}
        try {
          if (reg && reg.waiting) {
            try {
              reg.waiting.postMessage({ type: "vc:skip-waiting" });
            } catch (eW) {}
          }
        } catch (eUp) {}
        return navigator.serviceWorker.ready;
      })
      .catch(function () {
        window.__vcSwRegPromise = null;
        return null;
      });
    return window.__vcSwRegPromise;
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
    try {
      var stored = String(localStorage.getItem("vc_vapid_public_key") || "").trim();
      if (stored && stored.length > 20) {
        cachedVapidPublicKey = stored;
        return Promise.resolve(stored);
      }
    } catch (eLs) {}
    var now = Date.now();
    if (vapidFetchBlockedUntil > now) return Promise.resolve("");
    try {
      if (typeof window.__vcWebhookGlobalBlockedUntil === "function") {
        if (Date.now() < Number(window.__vcWebhookGlobalBlockedUntil() || 0)) {
          return Promise.resolve("");
        }
      }
    } catch (eGb) {}
    var url = resolvedSiteNotificationsPushUrl("vapid-public-key");
    try {
      if (window.VcApiCache && typeof window.VcApiCache.isWebhookBlocked === "function") {
        if (window.VcApiCache.isWebhookBlocked(url)) return Promise.resolve("");
      }
    } catch (eBlk) {}
    if (vapidFetchInFlight) return vapidFetchInFlight;
    vapidFetchInFlight = fetch(url, {
      method: "GET",
      credentials: "omit",
      cache: "default",
    })
      .then(function (r) {
        if (r && r.status === 429) {
          vapidFetchBlockedUntil = Date.now() + 90000;
          try {
            if (window.VcApiCache && typeof window.VcApiCache.noteWebhook429 === "function") {
              window.VcApiCache.noteWebhook429(45, url);
            }
          } catch (eV429) {}
          return null;
        }
        return r.json().catch(function () {
          return null;
        });
      })
      .then(function (j) {
        if (!j || !j.ok || !j.enabled) return "";
        var key = String(j.publicKey || "").trim();
        if (key) {
          cachedVapidPublicKey = key;
          try {
            localStorage.setItem("vc_vapid_public_key", key);
          } catch (eSave) {}
        }
        return key;
      })
      .catch(function () {
        return "";
      })
      .finally(function () {
        vapidFetchInFlight = null;
      });
    return vapidFetchInFlight;
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
  function detectPushDeviceClass() {
    try {
      var ua = String(navigator.userAgent || "");
      if (/iPhone|iPad|iPod|Android|Mobile/i.test(ua)) return "mobile";
      if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches && (window.innerWidth || 0) <= 920) {
        return "mobile";
      }
      if (/Windows|Macintosh|Linux|X11/i.test(ua) && !/Mobile/i.test(ua)) return "desktop";
    } catch (e) {}
    return "unknown";
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
    if (pushSubscribeBlockedUntil > now) return Promise.resolve(false);
    if (pushSubscribePostInFlight) return pushSubscribePostInFlight;
    function subscribePostOnce() {
      return fetch(resolvedSiteNotificationsPushUrl("subscribe"), {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        credentials: "omit",
        body: JSON.stringify({
          subscription: json,
          deviceClass: detectPushDeviceClass(),
          userAgent: String(navigator.userAgent || ""),
        }),
      });
    }
    pushSubscribePostInFlight = subscribePostOnce()
      .then(function (r) {
        /* consoleRest1: success is silent — warn only on soft-fail statuses */
        if (r && !r.ok && r.status !== 429 && r.status !== 502 && r.status !== 503 && r.status !== 409) {
          try {
            console.warn("[vc-push] subscribe POST", r.status);
          } catch (eSt) {}
        }
        if (r && (r.status === 429 || r.status === 502 || r.status === 503)) {
          var retryMs =
            r.status === 429
              ? Math.min(5000, Math.max(800, Number(r.headers.get("Retry-After") || "0") * 1000 || 1200))
              : 1200;
          /* pushMultiDevice3: cool-down corto — 2min bloccava re-sync telefono */
          pushSubscribeBlockedUntil = Date.now() + (r.status === 429 ? 18000 : 8000);
          return new Promise(function (resolve) {
            setTimeout(resolve, retryMs);
          }).then(subscribePostOnce);
        }
        return r;
      })
      .then(function (r) {
        if (r && r.status === 429) {
          pushSubscribeBlockedUntil = Date.now() + 18000;
          try {
            if (window.VcApiCache && typeof window.VcApiCache.noteWebhook429 === "function") {
              window.VcApiCache.noteWebhook429(Number(r.headers.get("Retry-After") || "0"), url);
            }
          } catch (eP429) {}
          return false;
        }
        /* pushPhoneHeal1: server dice endpoint morto → unsubscribe+subscribe fresco */
        if (r && (r.status === 409 || r.status === 410)) {
          if (opts && opts._healAttempt) return false;
          return forceFreshPushSubscription({ fromHeal: true }).then(function (ok) {
            return ok === true;
          });
        }
        if (r && r.ok && endpoint) {
          lastPostedPushEndpoint = endpoint;
          lastPostedPushAt = Date.now();
          try {
            if (detectPushDeviceClass() === "mobile") {
              storageSet(PUSH_MOBILE_RECREATE_KEY, String(Date.now()));
            }
          } catch (eMobOk) {}
        }
        return Boolean(r && r.ok);
      })
      .catch(function (err) {
        try {
          console.warn("[vc-push] subscribe POST failed", err && err.message ? err.message : err);
        } catch (eC) {}
        return false;
      })
      .finally(function () {
        pushSubscribePostInFlight = null;
      });
    return pushSubscribePostInFlight;
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
      enableEl.disabled =
        Boolean(isIosLikeDevice() && !isStandalonePwa()) ||
        pushNativeGestureInFlight ||
        Boolean(pushSubscribePostInFlight);
      try {
        var strayIco = enableEl.querySelector(".fa, i");
        if (strayIco) strayIco.remove();
      } catch (eIco) {}
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
    var forceNew = opts && opts.forceNew === true;
    function doSubscribe() {
      return reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
    function existingThenSubscribe() {
      return reg.pushManager.getSubscription().then(function (existing) {
        if (existing && (forceNew || !subscriptionMatchesVapid(existing, publicKey))) {
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
            if (fromGesture || forceNew) {
      if (forceNew) {
        return reg.pushManager.getSubscription().then(function (existing) {
          var clear = existing
            ? existing.unsubscribe().catch(function () {
                return false;
              })
            : Promise.resolve(false);
          return clear.then(function () {
            return doSubscribe();
          });
        });
      }
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

  var forceFreshPushInFlight = null;
  /* pushPhoneHeal1: droppa endpoint FCM morto e ne crea uno nuovo */
  function forceFreshPushSubscription(opts) {
    opts = opts || {};
    if (!webPushSupported()) return Promise.resolve(false);
    if (typeof Notification === "undefined" || Notification.permission !== "granted") {
      return Promise.resolve(false);
    }
    if (!normalizeUserId(currentUserId) || !getDiscordAccessToken()) return Promise.resolve(false);
    if (isIosLikeDevice() && !isStandalonePwa()) return Promise.resolve(false);
    if (forceFreshPushInFlight) return forceFreshPushInFlight;
    forceFreshPushInFlight = prefetchPushPrereqs()
      .then(function (pair) {
        var reg = pair && pair.reg;
        var publicKey = pair && pair.publicKey;
        if (!reg || !reg.pushManager || !publicKey) return false;
        return createOrRepairPushSubscription(reg, publicKey, {
          fromGesture: false,
          forceNew: true,
        }).then(function (sub) {
          if (!sub) return false;
          lastPostedPushEndpoint = "";
          lastPostedPushAt = 0;
          return postPushSubscription(sub, { force: true, _healAttempt: true }).then(function (ok) {
            if (ok) {
              lastPushErrorHint = "";
              rememberPushOk();
              setPushSubActive(true);
              try {
                storageSet(PUSH_MOBILE_RECREATE_KEY, String(Date.now()));
              } catch (eStamp) {}
            }
            return ok === true;
          });
        });
      })
      .catch(function (err) {
        try {
          console.warn("[vc-push] forceFresh", err && err.message ? err.message : err);
        } catch (eW) {}
        return false;
      })
      .then(function (ok) {
        forceFreshPushInFlight = null;
        return ok;
      });
    return forceFreshPushInFlight;
  }

  function shouldForceMobilePushRecreate() {
    try {
      if (detectPushDeviceClass() !== "mobile") return false;
      if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;
      var last = Number(storageGet(PUSH_MOBILE_RECREATE_KEY) || "0") || 0;
      return !last || Date.now() - last > PUSH_MOBILE_RECREATE_MS;
    } catch (e) {
      return false;
    }
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
          // pushActiveLocalFix1 / pushMultiDevice3: attivo solo se POST server ok
          // (prima return true anche su fail → telefono “credeva” iscritto ma DB senza endpoint)
          return postPushSubscription(sub, opts).then(function (ok) {
            pushSubActive = ok === true;
            if (ok) {
              lastPushErrorHint = "";
              rememberPushOk();
            }
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
        if (ok) syncPushPromptUi();
        else syncPushPromptUi();
        return ok;
      });
    return refreshPushInFlight;
  }
  function recreateGrantedPush() {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") {
      return Promise.resolve(false);
    }
    if (pushNativeGestureInFlight || pushSubscribePostInFlight) return Promise.resolve(false);
    if (vapidFetchBlockedUntil > Date.now() && !cachedVapidPublicKey) return Promise.resolve(false);
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
    function subscribeWebPushNative(opts) {
    var fromGesture = opts && opts.fromGesture === true;
    if (!webPushSupported()) return Promise.resolve(false);
    if (!normalizeUserId(currentUserId) || !getDiscordAccessToken()) return Promise.resolve(false);
    if (isIosLikeDevice() && !isStandalonePwa()) return Promise.resolve(false);
    if (typeof Notification !== "undefined" && Notification.permission === "denied") {
      return Promise.resolve(false);
    }
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
    if (pushNativeGestureInFlight) return Promise.resolve(false);

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
      markNativePushAsked();
      return reg.pushManager.getSubscription().then(function (existing) {
        if (existing) {
          if (publicKey && !subscriptionMatchesVapid(existing, publicKey)) {
            return createOrRepairPushSubscription(reg, publicKey, { fromGesture: true }).then(finishSub);
          }
          return finishSub(existing);
        }
        if (!publicKey) throw new Error("vapid_missing");
        return createOrRepairPushSubscription(reg, publicKey, { fromGesture: true }).then(finishSub);
      });
    }

    pushNativeGestureInFlight = true;
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
        pushNativeGestureInFlight = false;
        setPushSubActive(true);
        syncPushPromptUi();
        return true;
      })
      .catch(function (err) {
        try {
          console.warn("[vc-push] subscribe error", err && err.message ? err.message : err);
        } catch (eLog) {}
        pushNativeGestureInFlight = false;
        // If browser already has a subscription, keep active — don't show false "vapid missing".
        return ensureServiceWorkerRegistration()
          .then(function (reg) {
            if (!reg || !reg.pushManager) return null;
            return reg.pushManager.getSubscription();
          })
          .then(function (existing) {
            if (existing) {
              lastPushErrorHint = "";
              rememberPushOk();
              setPushSubActive(true);
              syncPushPromptUi();
              postPushSubscription(existing, { force: true }).catch(function () {});
              return true;
            }
            lastPushErrorHint = describePushError(err);
            setPushSubActive(false);
            syncPushPromptUi();
            return false;
          })
          .catch(function () {
            lastPushErrorHint = describePushError(err);
            setPushSubActive(false);
            syncPushPromptUi();
            return false;
          });
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
  function isViewAsLogoutMode() {
    try {
      return String(sessionStorage.getItem("vc_view_as") || "").trim().toLowerCase() === "logout";
    } catch (e) {
      return false;
    }
  }
  function rawDiscordAccessTokenForPush() {
    try {
      if (typeof window.__vcDiscordRawLocalStorageGetItem === "function") {
        var raw = String(window.__vcDiscordRawLocalStorageGetItem("vc_discord_access_token") || "").trim();
        if (raw) return raw;
      }
    } catch (eRaw) {}
    return getDiscordAccessToken();
  }
  /* pushLogoutMute1: logout / view-as logout → stacca endpoint di QUESTO browser (niente OS push “da loggato”) */
  function detachCurrentWebPushSubscription(opts) {
    opts = opts || {};
    if (!webPushSupported()) return Promise.resolve(false);
    var token = opts.useRawToken ? rawDiscordAccessTokenForPush() : getDiscordAccessToken();
    pushSubActive = false;
    lastPostedPushEndpoint = "";
    lastPostedPushAt = 0;
    function postUnsub(endpoint) {
      if (!token || !endpoint) return Promise.resolve(false);
      return fetch(resolvedSiteNotificationsPushUrl("unsubscribe"), {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        credentials: "omit",
        body: JSON.stringify({ endpoint: endpoint }),
      })
        .then(function (r) {
          return Boolean(r && r.ok);
        })
        .catch(function () {
          return false;
        });
    }
    return navigator.serviceWorker.ready
      .then(function (reg) {
        if (!reg || !reg.pushManager) return false;
        return reg.pushManager.getSubscription().then(function (sub) {
          if (!sub) return postUnsub("").then(function () {
            return false;
          });
          var endpoint = "";
          try {
            endpoint = String(sub.endpoint || "");
          } catch (eEp) {}
          return postUnsub(endpoint).then(function () {
            if (typeof sub.unsubscribe === "function") {
              return sub.unsubscribe().catch(function () {
                return false;
              });
            }
            return true;
          });
        });
      })
      .catch(function () {
        return false;
      })
      .finally(function () {
        try {
          pingSwClientFocus();
        } catch (ePing) {}
      });
  }
  function syncExistingWebPushSubscription() {
    if (!webPushSupported()) return;
    if (isViewAsLogoutMode()) {
      detachCurrentWebPushSubscription({ useRawToken: true });
      return;
    }
    if (!normalizeUserId(currentUserId) || !getDiscordAccessToken()) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (isIosLikeDevice() && !isStandalonePwa()) return;
    if (syncExistingPushInFlight) return syncExistingPushInFlight;
    var isMob = false;
    try {
      isMob = /Android|iPhone|iPad|iPod|Mobile/i.test(String(navigator.userAgent || ""));
    } catch (eMob) {}
    /* pushPhoneHeal1: su mobile periodicamente ricrea endpoint (FCM 410 lascia sub locale morta) */
    if (isMob && shouldForceMobilePushRecreate()) {
      syncExistingPushInFlight = forceFreshPushSubscription({ fromHeal: true })
        .then(function (ok) {
          if (!ok) {
            return refreshPushSubscriptionState({ force: true }).then(function (ok2) {
              if (!ok2) return subscribeWebPushNative();
              return ok2;
            });
          }
          syncPushPromptUi();
          return ok;
        })
        .catch(function () {
          return false;
        })
        .then(function (ok) {
          syncExistingPushInFlight = null;
          syncPushPromptUi();
          return ok;
        });
      return syncExistingPushInFlight;
    }
    /* votePushPhoneFix1: su mobile ri-POST endpoint più spesso (FCM muore e il PC resta ok) */
    var forceSync =
      pushSubActive !== true ||
      !lastPostedPushAt ||
      Date.now() - lastPostedPushAt > (isMob ? 30 * 1000 : 90 * 1000);
    syncExistingPushInFlight = refreshPushSubscriptionState({ force: forceSync })
      .then(function (ok) {
        if (!ok) {
          return subscribeWebPushNative().then(function () {
            syncPushPromptUi();
          });
        }
        syncPushPromptUi();
      })
      .finally(function () {
        syncExistingPushInFlight = null;
      });
    return syncExistingPushInFlight;
  }
  function siteRealtimeWsUrl() {
    var c = typeof window !== "undefined" && window.__VC_SITE_NOTIFS ? window.__VC_SITE_NOTIFS : {};
    if (c.wsEnabled === false || c.wsEnabled === "false") return "";
    var explicit = String(c.wsUrl || "").trim();
    if (explicit) return explicit;
    var http = resolvedSiteNotificationsUrl();
    if (!http || typeof URL === "undefined") return "";
    try {
      /* notifWsRelUrl1: apiUrl relativo (/webhooks/...) spezzava new URL() → niente WS/toast live */
      var base =
        typeof window !== "undefined" && window.location && window.location.origin
          ? String(window.location.origin)
          : "https://www.viniliecaffe.it";
      var u = new URL(http, base);
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
  function safeCloseSiteRealtimeWs(ws) {
    if (!ws) return;
    try {
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      var st = ws.readyState;
      /* consoleRest1: never close() while CONNECTING — Chrome logs "closed before established" */
      if (typeof WebSocket !== "undefined" && st === WebSocket.CONNECTING) {
        ws.onopen = function () {
          try {
            ws.close();
          } catch (eOpenClose) {}
        };
        return;
      }
      ws.onopen = null;
      if (st === WebSocket.OPEN || st === WebSocket.CLOSING) {
        try {
          ws.close();
        } catch (eClose) {}
      }
    } catch (eSafe) {}
  }
  function disconnectSiteRealtimeWs() {
    if (siteRealtimeWsReconnectTimer) {
      clearTimeout(siteRealtimeWsReconnectTimer);
      siteRealtimeWsReconnectTimer = null;
    }
    var prev = siteRealtimeWs;
    siteRealtimeWs = null;
    safeCloseSiteRealtimeWs(prev);
  }
  function scheduleSiteRealtimeWsReconnect() {
    if (siteRealtimeWsReconnectTimer) return;
    if (siteRealtimeWsFailCount >= 3) {
      siteRealtimeWsBlockedUntil = Date.now() + 120000;
      siteRealtimeWsFailCount = 0;
      return;
    }
    var delay = Math.min(60000, 8000 * Math.max(1, siteRealtimeWsFailCount || 1));
    siteRealtimeWsReconnectTimer = setTimeout(function () {
      siteRealtimeWsReconnectTimer = null;
      connectSiteRealtimeWebSocket();
    }, delay);
  }
  function stopSiteNotifsPoll() {
    if (siteNotifsTimer) {
      clearInterval(siteNotifsTimer);
      siteNotifsTimer = null;
    }
  }
  function connectSiteRealtimeWebSocket() {
    /* pwaCpuNuke1: PWA desktop → no WS (reconnect storm + sync CPU) */
    try {
      if (
        window.__VC_PWA_CPU_NUKE ||
        document.documentElement.classList.contains("vc-pwa-cpu-nuke") ||
        (window.VcPerf && typeof window.VcPerf.isStandalonePwa === "function" && window.VcPerf.isStandalonePwa())
      ) {
        return;
      }
    } catch (eNukeWs) {}
    if (typeof WebSocket === "undefined") return;
    var url = siteRealtimeWsUrl();
    if (!url) return;
    if (!normalizeUserId(currentUserId) || !getDiscordAccessToken()) return;
    if (Date.now() < siteRealtimeWsBlockedUntil) return;
    try {
      if (typeof window.__vcWebhookGlobalBlockedUntil === "function") {
        if (Date.now() < Number(window.__vcWebhookGlobalBlockedUntil() || 0)) return;
      }
    } catch (eGb) {}
    if (siteRealtimeWsReconnectTimer) {
      clearTimeout(siteRealtimeWsReconnectTimer);
      siteRealtimeWsReconnectTimer = null;
    }
    /* already connecting/open — don't tear down (consoleRest1) */
    if (siteRealtimeWs) {
      var cur = siteRealtimeWs.readyState;
      if (cur === WebSocket.CONNECTING || cur === WebSocket.OPEN) return;
    }
    var prev = siteRealtimeWs;
    siteRealtimeWs = null;
    safeCloseSiteRealtimeWs(prev);
    try {
      var ws = new WebSocket(url);
      siteRealtimeWs = ws;
      ws.onopen = function () {
        siteRealtimeWsFailCount = 0;
        syncSiteNotificationsFromServer();
      };
      ws.onmessage = function (ev) {
        try {
          var data = JSON.parse(String(ev.data || "{}"));
          if (data.type === "notifications_changed") {
            /* notifPushSync1 + notifPushBellCatchup1: force+full subito */
            syncSiteNotificationsFromServer({ force: true, full: true });
          }
          /* leaveProfileLive1 */
          if (data.type === "member_left") {
            try {
              window.dispatchEvent(
                new CustomEvent("vc:member-left", {
                  detail: {
                    userId: String(data.userId || "").trim(),
                    guildId: String(data.guildId || "").trim(),
                  },
                }),
              );
            } catch (eLeft) {}
          }
        } catch (e3) {}
      };
      ws.onclose = function () {
        if (siteRealtimeWs === ws) siteRealtimeWs = null;
        siteRealtimeWsFailCount += 1;
        if (normalizeUserId(currentUserId) && getDiscordAccessToken()) {
          restartSiteNotifsPollTimer();
          scheduleSiteRealtimeWsReconnect();
        }
      };
      ws.onerror = function () {
        siteRealtimeWsFailCount += 1;
        /* let the socket close itself — avoid close-during-CONNECTING warn */
      };
    } catch (e5) {
      siteRealtimeWs = null;
      siteRealtimeWsFailCount += 1;
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
    var ticketIds = {};
    var openUrls = [];
    if (item) {
      rememberDismissedNotif(item);
      var tid = extractTicketIdFromNotif(item) || extractTicketIdFromOpenUrl(item.openUrl);
      if (tid) ticketIds[tid] = true;
      var ou = String(item.openUrl || "").trim();
      if (ou) openUrls.push(ou);
    } else markDismissed(sid);
    saveStored(items.filter(function (n) { return String((n && n.id) || "") !== sid; }));
    /* pushBadgeVisitFix1: chiudi banner OS + ricalcola badge (prima restava agganciato) */
    noteLocalMarkReadHold();
    try {
      rememberServerUnreadCount(countBellBadgeUnread());
    } catch (eHoldDel) {}
    render({ force: true });
    dismissOsNotifications({
      id: sid,
      ids: [sid],
      ticketIds: Object.keys(ticketIds),
      openUrls: openUrls,
    });
    requestAppBadgeSync(countBellBadgeUnread() <= 0);
    deleteSiteNotificationOnServer(sid);
  }

  function requestAppBadgeSync(forceClear) {
    try {
      if (forceClear && typeof navigator !== "undefined" && typeof navigator.clearAppBadge === "function") {
        Promise.resolve(navigator.clearAppBadge()).catch(function () {});
      }
    } catch (eClr) {}
    try {
      var ctrl = navigator.serviceWorker && navigator.serviceWorker.controller;
      if (ctrl) {
        ctrl.postMessage({
          type: forceClear ? "vc:clear-app-badge" : "vc:sync-app-badge",
          forceClear: forceClear === true,
        });
      }
    } catch (ePost) {}
    try {
      if (!("serviceWorker" in navigator)) return;
      navigator.serviceWorker.ready.then(function (reg) {
        try {
          if (reg && reg.active) {
            reg.active.postMessage({
              type: forceClear ? "vc:clear-app-badge" : "vc:sync-app-badge",
              forceClear: forceClear === true,
            });
          }
        } catch (eAct) {}
      });
    } catch (eReady) {}
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
            var ok = Boolean(
              j &&
                (j.updated === true || Number(j.modified) > 0 || (j.updated !== false && j.ok === true)),
            );
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
    /* swStorageCpu3: in PWA niente getNotifications storm (Storage/SW CPU) —
       solo 1 postMessage throttled, niente retry. */
    var pwaNuke = false;
    try {
      pwaNuke = Boolean(
        window.__VC_PWA_CPU_NUKE ||
          document.documentElement.classList.contains("vc-pwa-cpu-nuke") ||
          (window.VcPerf && typeof window.VcPerf.isStandalonePwa === "function" && window.VcPerf.isStandalonePwa()),
      );
    } catch (ePnD) {}
    var openUrls = Array.isArray(spec.openUrls) ? spec.openUrls : [];
    var pageUrl = String(spec.pageUrl || "").trim();
    if (pwaNuke) {
      var nowD = Date.now();
      /* pushPwaBadgeStable1: all:true non throttlare — altrimenti clearAll/bell
         entro 8s lascia banner+badge su Android */
      /* pushVisitDismiss1: pageUrl/openUrls = visita pagina → non throttlare */
      var isAll = spec.all === true;
      var isVisitDismiss = Boolean(pageUrl) || openUrls.length > 0;
      var hasTarget =
        isAll ||
        isVisitDismiss ||
        Boolean(String(spec.id || "").trim()) ||
        Boolean(String(spec.ticketId || "").trim()) ||
        (Array.isArray(spec.ids) && spec.ids.length) ||
        (Array.isArray(spec.ticketIds) && spec.ticketIds.length);
      if (!hasTarget) return;
      if (!isAll && !isVisitDismiss && window.__vcPwaDismissAt && nowD - window.__vcPwaDismissAt < 8000) {
        /* pushBadgeVisitFix1: anche in throttle manda sync badge (delete singolo) */
        requestAppBadgeSync(false);
        return;
      }
      if (!isVisitDismiss) window.__vcPwaDismissAt = nowD;
      try {
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({
            type: "vc:dismiss-notifs",
            ticketId: String(spec.ticketId || "").trim().toLowerCase(),
            id: String(spec.id || "").trim(),
            ticketIds: Array.isArray(spec.ticketIds) ? spec.ticketIds : [],
            ids: Array.isArray(spec.ids) ? spec.ids : [],
            openUrls: openUrls,
            pageUrl: pageUrl,
            all: isAll,
            closeOnly: spec.closeOnly === true,
          });
        }
      } catch (ePostPwa) {}
      /* pushBadgeVisitFix1: ricalcola sempre; clear se unread locale 0 o all */
      var forceClr = isAll;
      try {
        forceClr = forceClr || countBellBadgeUnread() <= 0;
      } catch (eU) {}
      requestAppBadgeSync(forceClr);
      return;
    }
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
    var pageCtx = pageUrl ? null : null;
    try {
      if (pageUrl) {
        var pu = new URL(pageUrl, window.location.origin);
        var pPath = String(pu.pathname || "/").replace(/\/+$/, "") || "/";
        var pInbox = String(pu.searchParams.get("inbox") || "")
          .trim()
          .toLowerCase();
        var pTab = String(pu.searchParams.get("tab") || "")
          .trim()
          .toLowerCase();
        if (/\/staff\/inbox$/i.test(pPath) && pTab) pInbox = pTab;
        var pTicket =
          String(pu.searchParams.get("ticketId") || "")
            .trim()
            .toLowerCase() ||
          String(pu.hash || "")
            .replace(/^#/, "")
            .trim()
            .toLowerCase();
        if (!/^[a-f0-9]{24}$/i.test(pTicket)) pTicket = "";
        pageCtx = { path: pPath, inbox: pInbox, ticket: pTicket, board: "", view: "", href: pageUrl };
      }
    } catch (eCtx) {
      pageCtx = null;
    }
    function matches(notif) {
      if (!notif) return false;
      if (all) return true;
      var d = notif.data && typeof notif.data === "object" ? notif.data : {};
      var nTid = String(d.ticketId || "").toLowerCase();
      var nId = String(d.id || "");
      var nMsg = String(d.messageId || "");
      var nOpen = String(d.openUrl || "").trim();
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
      if (nOpen && openUrls.length) {
        var nPath = normalizeNotifPathname(nOpen);
        for (var oi = 0; oi < openUrls.length; oi += 1) {
          var ou = String(openUrls[oi] || "").trim();
          if (!ou) continue;
          if (ou === nOpen) return true;
          if (nPath && nPath === normalizeNotifPathname(ou)) return true;
        }
      }
      if (pageCtx && nOpen && openUrlMatchesNotifPage(nOpen, nTid, pageCtx)) return true;
      return false;
    }
    var payload = {
      type: "vc:dismiss-notifs",
      ticketId: ticketId,
      id: id,
      ticketIds: Object.keys(ticketMap),
      ids: Object.keys(idMap),
      openUrls: openUrls,
      pageUrl: pageUrl,
      all: all,
      /* pushTicketDismissFix1: chiudi banner senza blacklist ticket (messaggi futuri ok) */
      closeOnly: spec.closeOnly === true,
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
    noteLocalMarkReadHold();
    saveStored(
      loadStored().map(function (x) {
        if (!x || x.read) return x;
        if (extractTicketIdFromNotif(x) !== tid) return x;
        localUnread += 1;
        rememberPendingRead(x.id);
        return Object.assign({}, x, { read: true });
      }),
    );
    if (localUnread) render({ force: true });
    /* pushTicketDismissFix1: aprire ticket chiude OS banner, non silenzia push messaggi successive */
    dismissOsNotifications({
      ticketId: tid,
      closeOnly: true,
      pageUrl: String(window.location.href || ""),
    });
    try {
      rememberServerUnreadCount(countBellBadgeUnread());
    } catch (eHold) {}
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

  function normalizeNotifPathname(url) {
    try {
      var u = new URL(String(url || "/"), window.location.origin);
      return String(u.pathname || "/").replace(/\/+$/, "") || "/";
    } catch (e) {
      return "";
    }
  }

  function currentNotifPageContext() {
    var path = normalizeNotifPathname(window.location.href);
    var inbox = "";
    var board = "";
    var view = "";
    var ticket = ticketIdFromLocation();
    try {
      var sp = new URLSearchParams(window.location.search || "");
      inbox = String(sp.get("inbox") || "")
        .trim()
        .toLowerCase();
      var tab = String(sp.get("tab") || "")
        .trim()
        .toLowerCase();
      if (/\/staff\/inbox$/i.test(path) && tab) inbox = tab;
      board = String(sp.get("board") || "")
        .trim()
        .toLowerCase();
      view = String(sp.get("view") || "")
        .trim()
        .toLowerCase();
    } catch (eSp) {}
    if (!ticket) {
      try {
        var watching = window.__VC_WATCHING_TICKET;
        var wid = String((watching && watching.id) || "")
          .trim()
          .toLowerCase();
        if (/^[a-f0-9]{24}$/i.test(wid)) ticket = wid;
      } catch (eW) {}
    }
    return {
      path: path,
      inbox: inbox,
      board: board,
      view: view,
      ticket: ticket,
      href: String(window.location.href || ""),
    };
  }

  function openUrlMatchesNotifPage(openUrl, ticketId, ctx) {
    ctx = ctx || currentNotifPageContext();
    if (!ctx || !ctx.path || ctx.path === "/") return false;
    var tid = String(ticketId || "")
      .trim()
      .toLowerCase();
    if (!/^[a-f0-9]{24}$/i.test(tid)) tid = "";
    var destPath = "";
    var destInbox = "";
    var destBoard = "";
    var destTid = tid;
    try {
      var u = new URL(String(openUrl || ""), window.location.origin);
      destPath = String(u.pathname || "/").replace(/\/+$/, "") || "/";
      destInbox = String(u.searchParams.get("inbox") || "")
        .trim()
        .toLowerCase();
      destBoard = String(u.searchParams.get("board") || "")
        .trim()
        .toLowerCase();
      if (!destTid) {
        destTid =
          String(u.searchParams.get("ticketId") || "")
            .trim()
            .toLowerCase() ||
          String(u.hash || "")
            .replace(/^#/, "")
            .trim()
            .toLowerCase();
        if (!/^[a-f0-9]{24}$/i.test(destTid)) destTid = "";
      }
    } catch (eUrl) {
      destPath = normalizeNotifPathname(openUrl);
    }
    if (destTid && ctx.ticket && destTid === ctx.ticket) return true;
    /* pushVisitDismiss1: /notifications?inbox=X ↔ /staff/inbox?tab=X (+ alias pagine dedicate) */
    if (destInbox && DEDICATED_INBOX_QUEUES[destInbox]) {
      if (ctx.inbox && ctx.inbox === destInbox) {
        if (
          (/\/notifications$/i.test(destPath) || /\/staff\/inbox$/i.test(destPath)) &&
          (/\/notifications$/i.test(ctx.path) || /\/staff\/inbox$/i.test(ctx.path))
        ) {
          return true;
        }
      }
      if (destInbox === "pause" && /\/staff\/pause$/i.test(ctx.path)) return true;
      if (destInbox === "appelli" && /\/appelli$/i.test(ctx.path)) return true;
      if (destInbox === "candidature" && /\/candidature$/i.test(ctx.path)) return true;
      if (destInbox === "resoconti" && /\/staff\/resoconti$/i.test(ctx.path)) return true;
    }
    /* pushBadgeVisitFix1: visita pagina dedicata ↔ openUrl /notifications?inbox=X */
    if (/\/staff\/pause$/i.test(ctx.path) && (/inbox=pause\b/i.test(String(openUrl || "")) || /\/staff\/pause/i.test(destPath))) {
      return true;
    }
    if (/\/appelli$/i.test(ctx.path) && (/inbox=appelli\b/i.test(String(openUrl || "")) || /\/appelli/i.test(destPath))) {
      return true;
    }
    if (
      /\/candidature$/i.test(ctx.path) &&
      (/inbox=candidature\b/i.test(String(openUrl || "")) || /\/candidature/i.test(destPath))
    ) {
      return true;
    }
    if (!destPath || destPath === "/") return false;
    if (/\/tickets$/i.test(destPath) && destTid) {
      return Boolean(ctx.ticket && ctx.ticket === destTid && /\/tickets$/i.test(ctx.path));
    }
    if (destPath === ctx.path) {
      if (destTid && ctx.ticket && destTid !== ctx.ticket) return false;
      if (destInbox && ctx.inbox && destInbox !== ctx.inbox) return false;
      if (destBoard && ctx.board && destBoard !== ctx.board) return false;
      return true;
    }
    if (ctx.path.indexOf(destPath + "/") === 0) return true;
    if (destPath.indexOf(ctx.path) === 0 && (destPath === ctx.path || destPath.charAt(ctx.path.length) === "/")) {
      return true;
    }
    return false;
  }

  function notifMatchesCurrentPage(n) {
    if (!n || n.read) return false;
    var ctx = currentNotifPageContext();
    var tid = extractTicketIdFromNotif(n) || extractTicketIdFromOpenUrl(n.openUrl);
    if (openUrlMatchesNotifPage(n.openUrl, tid, ctx)) return true;
    if (tid && isWatchingTicketChat(tid, n.openUrl)) return true;
    if (isWatchingWorkflowChat(n.openUrl, n.dedupeKey)) return true;
    return false;
  }

  function markSiteNotificationsReadForPageOnServer(pageUrl, extra) {
    var token = getDiscordAccessToken();
    var uid = normalizeUserId(currentUserId);
    var href = String(pageUrl || "").trim();
    if (!token || !uid || !href) return Promise.resolve(false);
    var body = {
      pageUrl: href,
      ids: Array.isArray(extra && extra.ids) ? extra.ids : [],
      ticketIds: Array.isArray(extra && extra.ticketIds) ? extra.ticketIds : [],
      openUrls: Array.isArray(extra && extra.openUrls) ? extra.openUrls : [],
    };
    return fetch(resolvedSiteNotificationsReadUrl(), {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      credentials: "omit",
      keepalive: true,
      body: JSON.stringify(body),
    })
      .then(function (r) {
        if (!r || !r.ok) return false;
        return r
          .json()
          .then(function (j) {
            return Boolean(j && j.ok);
          })
          .catch(function () {
            return true;
          });
      })
      .catch(function () {
        return false;
      });
  }

  function markNotificationsForCurrentPage() {
    /* notifUnifyFix1 + pushVisitDismiss1: apri pagina competenza → lette + chiudi banner OS */
    /* pushBadgeVisitFix1: anche senza id locali → pageUrl server + dismiss cross-device */
    var ids = [];
    var ticketIds = {};
    var openUrls = [];
    var ctx = currentNotifPageContext();
    try {
      loadStored().forEach(function (n) {
        if (!n) return;
        var tid = extractTicketIdFromNotif(n) || extractTicketIdFromOpenUrl(n && n.openUrl);
        var matches =
          (!n.read && notifMatchesCurrentPage(n)) ||
          openUrlMatchesNotifPage(n.openUrl, tid, ctx) ||
          (tid && isWatchingTicketChat(tid, n.openUrl)) ||
          isWatchingWorkflowChat(n.openUrl, n.dedupeKey);
        if (!matches) return;
        var id = String((n && n.id) || "").trim();
        if (id && !n.read) ids.push(id);
        if (tid) ticketIds[tid] = true;
        var ou = String((n && n.openUrl) || "").trim();
        if (ou) openUrls.push(ou);
      });
    } catch (eScan) {}
    if (ctx.ticket) ticketIds[ctx.ticket] = true;
    /* Anche path dedicati senza item in store (alert coda inbox filtrati dal list) */
    if (ctx.inbox === "pause" || /\/staff\/pause$/i.test(ctx.path)) {
      openUrls.push("/notifications/?view=staff&inbox=pause");
      openUrls.push("/staff/inbox/?tab=pause");
      openUrls.push("/staff/pause/");
    }
    if (ctx.inbox === "appelli" || /\/appelli$/i.test(ctx.path)) {
      openUrls.push("/notifications/?view=staff&inbox=appelli");
      openUrls.push("/staff/inbox/?tab=appelli");
      openUrls.push("/appelli/");
    }
    if (ctx.inbox === "candidature" || /\/candidature$/i.test(ctx.path)) {
      openUrls.push("/notifications/?view=staff&inbox=candidature");
      openUrls.push("/staff/inbox/?tab=candidature");
      openUrls.push("/candidature/");
    }
    if (ctx.inbox === "resoconti" || /\/staff\/resoconti$/i.test(ctx.path)) {
      openUrls.push("/notifications/?view=staff&inbox=resoconti");
      openUrls.push("/staff/inbox/?tab=resoconti");
    }
    dismissOsNotifications({
      ids: ids,
      ticketIds: Object.keys(ticketIds),
      openUrls: openUrls,
      pageUrl: ctx.href || String(window.location.href || ""),
      closeOnly: true,
    });
    if (ids.length) {
      noteLocalMarkReadHold();
      saveStored(
        loadStored().map(function (x) {
          if (!x || x.read) return x;
          if (ids.indexOf(String(x.id || "").trim()) < 0) return x;
          rememberPendingRead(x.id);
          return Object.assign({}, x, { read: true });
        }),
      );
      try {
        rememberServerUnreadCount(countBellBadgeUnread());
      } catch (eHold) {}
      render({ force: true });
    }
    requestAppBadgeSync(countBellBadgeUnread() <= 0);
    var pageHref = ctx.href || String(window.location.href || "");
    /* Sempre server pageUrl: marca anche alert coda dedicata non in store + dismiss altri device */
    markSiteNotificationsReadForPageOnServer(pageHref, {
      ids: ids,
      ticketIds: Object.keys(ticketIds),
      openUrls: openUrls,
    }).finally(function () {
      window.setTimeout(function () {
        syncSiteNotificationsFromServer();
      }, 500);
    });
  }
  try {
    window.__vcMarkNotificationsForCurrentPage = markNotificationsForCurrentPage;
  } catch (eMarkPage) {}
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
                : kindRaw === "staff"
                  ? "staff"
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
    var channel =
      String((row && row.channel) || "").toLowerCase() === "inbox"
        ? "inbox"
        : String((row && row.channel) || "").toLowerCase() === "personal"
          ? "personal"
          : "";
    var mappedRow = {
      id: String(row.id || "").trim(),
      title: String((row && row.title) || ""),
      body: String((row && row.body) || ""),
      at: atMs,
      read: Boolean(row.read === true || row.readAt),
      kind: kind,
      openUrl: openUrl,
      ticketId: ticketId,
      filtered: Boolean(row && row.filtered),
      channel: channel,
      dedupeKey: String((row && row.dedupeKey) || "").trim(),
    };
    if (!mappedRow.channel) {
      mappedRow.channel = isInboxLinkedNotifClient(mappedRow) ? "inbox" : "personal";
    }
    return mappedRow;
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
      if (isVoteRegisteredNotifClient(mapped)) continue;
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
        /* pushBellFocusFix1: subito dopo click push non togliere pending se la coda aggiorna il body */
        if (!(Date.now() < localMarkHoldUntil)) {
          delete pendingReadMap[sid];
          if (fpId) delete pendingReadMap[fpId];
          forgetPendingRead(sid);
          if (fpId) forgetPendingRead(fpId);
        }
      }
      var watchingThis =
        !mapped.read &&
        (isWatchingTicketChat(mapped.ticketId, mapped.openUrl) ||
          isWatchingWorkflowChat(mapped.openUrl, mapped.dedupeKey));
      if (watchingThis) {
        mapped.read = true;
        rememberPendingRead(sid);
        rememberClickRead(sid);
      }
      fromServer.push(
        Object.assign({}, mapped, {
          /* notifSheetSync1: pending fresco solo TTL; stale → server unread (altri device) */
          read:
            Boolean(mapped.read) ||
            Boolean(markAllRecent) ||
            isFreshPendingTs(pendingReadMap[sid]) ||
            isFreshPendingTs(fpId && pendingReadMap[fpId]),
        }),
      );
    }
    var keepLocal = [];
    for (var li = 0; li < oldItems.length; li += 1) {
      var it = oldItems[li];
      var lid = String((it && it.id) || "").trim();
      if (!lid) continue;
      if (serverIdMap[lid]) continue;
      var keep = false;
      if (isClientLocalNotifId(lid)) {
        keep = true;
      } else if (
        !it.read &&
        Number(it.at || 0) > 0 &&
        Date.now() - Number(it.at || 0) < 180000
      ) {
        /* pwaPushBellBadge1: push in-app ha scritto id mongo/timestamp ma il list
           server non li ha ancora → non droppare (altrimenti badge=0 in PWA focused) */
        keep = true;
      }
      if (!keep) continue;
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
      if (isWatchingWorkflowChat(fr.openUrl, fr.dedupeKey)) continue;
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
            if (!toastRow || fr.kind === "vote") {
        toastRow = candidate;
        if (fr.kind === "vote") break;
      }
    }
    return { toastRow: toastRow, changed: changed };
  }
  function syncSiteNotificationsFromServer(opts) {
    opts = opts || {};
    var token = getDiscordAccessToken();
    var uid = normalizeUserId(currentUserId);
    if ((!token || !uid) && (opts.force || opts.full)) {
      try {
        bootstrapNotifUserFromCache();
      } catch (eBootSync) {}
      uid = normalizeUserId(currentUserId);
      token = getDiscordAccessToken();
    }
    if (!token || !uid) {
      /* inAppNotifSync1: push arriva prima del bootstrap uid → riprova breve */
      if ((opts.force || opts.full) && !opts._uidRetry) {
        window.setTimeout(function () {
          try {
            bootstrapNotifUserFromCache();
          } catch (eBoot2) {}
          syncSiteNotificationsFromServer(
            Object.assign({}, opts, { force: true, full: true, _uidRetry: true })
          );
        }, 450);
      }
      return;
    }
    var url = resolvedSiteNotificationsUrl();
    if (!url) return;
    var now = Date.now();
    if (!opts.force && siteNotifsLastSyncAt && now - siteNotifsLastSyncAt < SITE_NOTIFS_MIN_GAP_MS) return;
    if (siteNotifsBlockedUntil > now) {
      /* inAppNotifSync1: force (push/panel) → bypass cool-down locale, non aspettare 35–90s */
      if (opts.force || opts.full) {
        siteNotifsBlockedUntil = 0;
      } else {
        return;
      }
    }
    if (window.VcApiCache && typeof window.VcApiCache.isWebhookBlocked === "function") {
      if (window.VcApiCache.isWebhookBlocked(url)) {
        /* inAppNotifSync1: force (push/visibilità/panel) NON deve abortire in silenzio —
           clear block + fetch, altrimenti OS push arriva e la campanella resta vuota. */
        if (opts.force || opts.full) {
          try {
            if (typeof window.VcApiCache.clearWebhookBlock === "function") {
              window.VcApiCache.clearWebhookBlock(url);
            }
          } catch (eClrBlock) {}
        } else {
          return;
        }
      }
    }
    if (siteNotifsSyncInFlight) {
      /* notifPushBellCatchup1: non droppare force dietro un poll count in corso */
      if (opts.force || opts.full) {
        siteNotifsPendingForceOpts = Object.assign({}, opts, { force: true, full: true });
      }
      return siteNotifsSyncInFlight;
    }
    var panelOpen = false;
    try {
      var ddOpen = document.getElementById("vc-notif-dropdown");
      panelOpen = Boolean(ddOpen && ddOpen.open) || isNotifPanelChromeOpen();
    } catch (ePanel) {
      panelOpen = false;
    }
    /* siteNotifW2: closed-panel poll = mode=count; panel/force/first = full list */
    var useCount =
      siteNotifsEverFullSynced && !opts.force && !opts.full && !panelOpen;
    var ctrl = null;
    var tid = null;
    var abortMs = useCount ? 8000 : 12000;
    try {
      if (
        (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
        Number(navigator.maxTouchPoints || 0) > 0
      ) {
        abortMs = useCount ? 12000 : 20000;
      }
    } catch (eMs) {}
    try {
      ctrl = new AbortController();
      tid = setTimeout(function () {
        try {
          ctrl.abort();
        } catch (eAb) {}
      }, abortMs);
    } catch (e0) {
      ctrl = null;
    }
    var fetchOpts = {
      headers: { Authorization: "Bearer " + token },
      credentials: "omit",
      cache: "no-store",
    };
    try {
      if (window.VcPerf && typeof window.VcPerf.apiHeaders === "function") {
        fetchOpts.headers = window.VcPerf.apiHeaders(fetchOpts.headers, url);
      }
      if (useCount) {
        url += (url.indexOf("?") >= 0 ? "&" : "?") + "mode=count";
        if (siteNotifsCountEtag) {
          fetchOpts.headers["If-None-Match"] = siteNotifsCountEtag;
        }
        if (window.VcPerf && window.VcPerf.isLite && window.VcPerf.isLite()) url += "&lite=1&perf=lite";
        else if (window.VcPerf && window.VcPerf.tier && window.VcPerf.tier() === "mid") url += "&perf=mid";
      } else if (window.VcPerf && typeof window.VcPerf.notificationsLimit === "function") {
        var lim = window.VcPerf.notificationsLimit(50);
        url += (url.indexOf("?") >= 0 ? "&" : "?") + "limit=" + encodeURIComponent(String(lim));
        if (window.VcPerf.isLite && window.VcPerf.isLite()) url += "&lite=1&perf=lite";
        else if (window.VcPerf.tier && window.VcPerf.tier() === "mid") url += "&perf=mid";
      }
    } catch (ePerfN) {}
    if (ctrl) fetchOpts.signal = ctrl.signal;
    siteNotifsSyncInFlight = fetch(url, fetchOpts)
      .then(function (r) {
        if (r && r.status === 429) {
          var soft429 = false;
          try {
            soft429 = String(r.headers.get("X-VC-Soft429") || "") === "1";
          } catch (eSoft) {
            soft429 = false;
          }
          /* notifSheetSync1: soft429 locale → retry breve, non armare 90s (rompe pending sync) */
          if (soft429) {
            if (!opts._softRetried) {
              window.setTimeout(function () {
                syncSiteNotificationsFromServer({
                  force: true,
                  full: true,
                  _softRetried: true,
                });
              }, 1600);
            }
            return null;
          }
          /* inAppNotifSync1: 90s uccideva la campanella mentre OS push arrivava */
          var blockMs = 8000;
          try {
            if (
              (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
              Number(navigator.maxTouchPoints || 0) > 0
            ) {
              blockMs = 5500;
            }
          } catch (eMob429) {}
          siteNotifsBlockedUntil = Date.now() + blockMs;
          try {
            if (window.VcApiCache && typeof window.VcApiCache.noteWebhook429 === "function") {
              window.VcApiCache.noteWebhook429(Number(r.headers.get("Retry-After") || "0"), url);
            }
          } catch (eN429) {}
          return null;
        }
        if (r && r.status === 401) {
          try {
            if (typeof window.__vcDiscordGetAccessToken === "function" && !window.__vcDiscordGetAccessToken()) {
              localStorage.removeItem(DISCORD_ACCESS_TOKEN_KEY);
            }
          } catch (e401) {}
          return null;
        }
        if (r && r.status === 304) {
          return { __notModified: true };
        }
        var etagHdr = "";
        try {
          etagHdr = String((r && r.headers && r.headers.get("ETag")) || "").trim();
        } catch (eEt) {
          etagHdr = "";
        }
        return r.text().then(function (raw) {
          if (!raw || !String(raw).trim()) return null;
          try {
            var parsed = JSON.parse(raw);
            if (parsed && etagHdr) parsed.__etag = etagHdr;
            return parsed;
          } catch (eJ) {
            return null;
          }
        });
      })
      .then(function (j) {
        if (!j) return;
        if (j.__notModified) {
          /* notifBadgeServerTruth1: 304 non deve lasciare badge a 0 */
          try {
            paintBellBadgeWithServerTruth(countBellBadgeUnread());
          } catch (e304) {}
          return;
        }
        if (j.mode === "count" && j.ok === true) {
          if (j.__etag) siteNotifsCountEtag = j.__etag;
          var serverUnread = Math.max(0, Number(j.unread) || 0);
          var localUnread = 0;
          try {
            localUnread = countBellBadgeUnread();
          } catch (eLoc) {
            localUnread = 0;
          }
          var needFull = serverUnread !== localUnread;
          rememberServerUnreadCount(serverUnread);
          try {
            paintBellBadgeWithServerTruth(localUnread);
          } catch (eBadge) {}
          if (needFull) {
            setTimeout(function () {
              syncSiteNotificationsFromServer({ force: true, full: true });
            }, 0);
          }
          return;
        }
        if (j.ok !== true || !Array.isArray(j.items)) return;
        siteNotifsEverFullSynced = true;
        var list = j.items.slice().reverse();
        if (j.unread != null && Number.isFinite(Number(j.unread))) {
          rememberServerUnreadCount(j.unread);
        } else {
          /* fallback: conta unread grezzi dal payload server (prima del merge client) */
          var rawUnread = 0;
          for (var ri = 0; ri < j.items.length; ri += 1) {
            var rit = j.items[ri];
            if (!rit || rit.read === true || rit.readAt || rit.filtered) continue;
            rawUnread += 1;
          }
          if (rawUnread > loadServerUnreadHold()) rememberServerUnreadCount(rawUnread);
        }
        var mergeResult = mergeStoredWithServerNotificationList(list, uid);
        if (mergeResult.changed) render();
        else paintNotifBellBadgeFromStore();
        try {
          var storeN = countBellBadgeUnread();
          paintBellBadgeWithServerTruth(storeN);
          /* notifPendingToastNoFlash1: niente re-show pending su ogni sync */
        } catch (eSu) {
          try {
            paintNotifBellBadgeFromStore();
          } catch (eSu2) {}
        }
        tryFlushClickReads();
        dismissOsNotificationsForReadItems(loadStored());
        try {
          markNotificationsForCurrentPage();
        } catch (ePageMark) {}
        if (mergeResult.toastRow && shouldPlayNotifAlert(mergeResult.toastRow)) {
          var toastId = String(mergeResult.toastRow.id || "").trim();
          var skipSound = recentlyGotOsPush(mergeResult.toastRow);
          if (toastId) rememberToastedId(toastId);
          if (!skipSound) playNotifSound();
          if (!skipSound) {
            showNativeOsBanner(mergeResult.toastRow, {
              catchup: desktopPushCatchupArmed && !isMobilePushClient(),
            });
          }
          try {
            showNotifFlyToast(mergeResult.toastRow);
          } catch (eFlySync) {}
          pulseNotifSummary();
        } else if (mergeResult.toastRow) {
          var mutedId = String(mergeResult.toastRow.id || "").trim();
          if (mutedId) rememberToastedId(mutedId);
        }
        try {
          runDesktopPushCatchupFromStore();
        } catch (eCatchup) {}
      })
      .catch(function (err) {
        /* apiFalseErr1: abort/rete = soft retry una volta, niente toast */
        try {
          if (err && err.name === "AbortError" && !opts._retried) {
            setTimeout(function () {
              syncSiteNotificationsFromServer({ force: true, _retried: true, full: !useCount });
            }, 1200);
          }
        } catch (eR) {}
      })
      .finally(function () {
        siteNotifsSyncInFlight = null;
        siteNotifsLastSyncAt = Date.now();
        try {
          if (tid) clearTimeout(tid);
        } catch (e1) {}
        /* notifPushBellCatchup1: esegui force accodato (push / focus) */
        if (siteNotifsPendingForceOpts) {
          var pending = siteNotifsPendingForceOpts;
          siteNotifsPendingForceOpts = null;
          window.setTimeout(function () {
            syncSiteNotificationsFromServer(pending);
          }, 0);
        }
      });
    return siteNotifsSyncInFlight;
  }
  function siteNotifsPollDelayMs() {
    try {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        /* perfBgRam1: hidden → niente poll (push + sync al focus) */
        return SITE_NOTIFS_POLL_HIDDEN_MS;
      }
    } catch (e) {}
    try {
      /* pwaCpuNuke1: PWA → solo push, zero poll timer */
      if (
        window.__VC_PWA_CPU_NUKE ||
        document.documentElement.classList.contains("vc-pwa-cpu-nuke") ||
        (window.VcPerf && typeof window.VcPerf.isStandalonePwa === "function" && window.VcPerf.isStandalonePwa())
      ) {
        return 0;
      }
      if (window.VcPerf && typeof window.VcPerf.isPhoneOrPwa === "function" && window.VcPerf.isPhoneOrPwa()) {
        return SITE_NOTIFS_POLL_PHONE_MS;
      }
      if (window.VcPerf && typeof window.VcPerf.isLite === "function" && window.VcPerf.isLite()) {
        return SITE_NOTIFS_POLL_PHONE_MS;
      }
    } catch (ePhone) {}
    return SITE_NOTIFS_POLL_MS;
  }
  function restartSiteNotifsPollTimer() {
    stopSiteNotifsPoll();
    if (!normalizeUserId(currentUserId) || !getDiscordAccessToken()) return;
    var delay = siteNotifsPollDelayMs();
    /* perfBgRam1: delay 0 = tab nascosta → stop poll */
    if (!delay || delay <= 0) return;
    siteNotifsTimer = setInterval(syncSiteNotificationsFromServer, delay);
  }
  function scheduleSiteNotificationsPolling() {
    stopSiteNotifsPoll();
    try {
      if (document.body && document.body.classList.contains("vc-dashboard-page")) return;
      if (window.__VC_SITE_DASHBOARD && !window.__VC_SITE_NOTIFS) return;
      if (!document.getElementById("vc-notif-dropdown")) return;
    } catch (eDd) {}
    if (!normalizeUserId(currentUserId) || !getDiscordAccessToken()) {
      disconnectSiteRealtimeWs();
      return;
    }
    if (siteNotifsPollBooted) {
      restartSiteNotifsPollTimer();
      var wsUrlBooted = siteRealtimeWsUrl();
      var rsBooted = siteRealtimeWs ? siteRealtimeWs.readyState : 3;
      if (wsUrlBooted && rsBooted !== 0 && rsBooted !== 1) connectSiteRealtimeWebSocket();
      return;
    }
    siteNotifsPollBooted = true;
    syncSiteNotificationsFromServer();
    /* pushGonePersist1: al boot sempre tenta heal push se permesso granted
       (anche se pushSubActive era true in memoria — endpoint DB può essere 410). */
    if (webPushSupported()) {
      try {
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          syncExistingWebPushSubscription();
        } else if (pushSubActive !== true) {
          syncExistingWebPushSubscription();
        }
      } catch (eHealBoot) {
        if (pushSubActive !== true) syncExistingWebPushSubscription();
      }
    }
    restartSiteNotifsPollTimer();
    var wsUrl = siteRealtimeWsUrl();
    var rs = siteRealtimeWs ? siteRealtimeWs.readyState : 3;
    if (wsUrl && rs !== 0 && rs !== 1) connectSiteRealtimeWebSocket();
  }
  var notifSheetResizeWired = false;
  var notifSheetEscWired = false;
  var bellNotifScope = "personal";
  var bellNotifScopeWired = false;
  var bellStaffSummaryAt = 0;
  var bellStaffSummaryInFlight = null;
  var bellStaffPerms = null;
  var bellStaffQueueCache = Object.create(null);
  var bellStaffQueueInFlight = Object.create(null);
  var bellStaffSummarySig = "";
  /* notifSheetScopeFix1: categorie chiuse a mano non si riaprono a ogni sync */
  /* notifBellStable1: dopo 1° paint, no auto-open unread (flash pending) */
  var bellStaffCatsSettled = false;
  var bellPersonalCatsSettled = false;
  var bellUserCollapsedCats = Object.create(null);
  /* notifQueueFast1: durante expand/load non wipe lista (click-through → nav/tab random) */
  var bellInboxExpandLockUntil = 0;
  /* notifCatLoadFix1: sessione sheet — non resettare Personali|Inbox su reclaim toggle */
  var notifSheetSessionActive = false;
  var BELL_INBOX_PAGE_SIZE = 8;
  var BELL_SCOPE_PREF_KEY = "vc_notif_scope_pref";
  /* notifSidebar3: declare queue cache/inFlight (were undeclared → expand stuck on Caricamento…). */
  /* notifInboxGate1: Pause = HS-only; hide gated rows until perms (like Punti tolti). */
  var BELL_INBOX_ROWS = [
    /* pauseOutInbox1: Pause fuori dall'inbox → card giorni sul profilo staff */
    { id: "candidature", label: "Candidature", icon: "fa-file-text-o", requiresCandidatureReview: true },
    { id: "appelli", label: "Appelli", icon: "fa-balance-scale", requiresAppelliReview: true },
    /* resoProfile1: Resoconti fuori dall'inbox → profilo staff */
    /* partnerPtChrono1: Punti tolti fuori dall'inbox → card Partner sul profilo */
  ];

  function readBellScopePref() {
    try {
      var v = String(localStorage.getItem(BELL_SCOPE_PREF_KEY) || "")
        .trim()
        .toLowerCase();
      if (v === "staff" || v === "personal") return v;
    } catch (ePref) {}
    return "";
  }

  function writeBellScopePref(next) {
    try {
      localStorage.setItem(BELL_SCOPE_PREF_KEY, next === "staff" ? "staff" : "personal");
    } catch (eWrite) {}
  }

  function readBellScopeFromUrl() {
    try {
      var sp = new URLSearchParams(location.search || "");
      var view = String(sp.get("view") || sp.get("tab") || "")
        .trim()
        .toLowerCase();
      if (view === "staff") return "staff";
    } catch (eUrl) {}
    return "";
  }

  function canBellStaffInbox() {
    /* notifMobileSwitch1: do NOT require offsetParent — on phone the staff link/snav
       is often display:none in the header while still present in DOM. Page dock
       (revealTabs) already treats that as staff; bell switcher must match. */
    /* swLsStorm2: memo 2s — paint/badge lo chiamava a raffica → Storage Service */
    try {
      var memo = window.__vcCanBellStaffMemo;
      if (memo && Date.now() - Number(memo.at || 0) < 2000) return Boolean(memo.v);
    } catch (eMemo) {}
    var result = canBellStaffInboxUncached();
    try {
      window.__vcCanBellStaffMemo = { v: result, at: Date.now() };
    } catch (eSet) {}
    return result;
  }
  function canBellStaffInboxUncached() {
    try {
      if (window.VcNotifScope && typeof window.VcNotifScope.canStaff === "function") {
        if (window.VcNotifScope.canStaff()) return true;
      }
    } catch (eApi) {}
    try {
      if (window.__VC_STAFF_MENU_ALLOWED === true) return true;
      var p = window.__VC_STAFF_PERMS;
      if (p && typeof p === "object" && p.ok) return true;
      var token = getDiscordAccessToken();
      if (token) {
        var fp = String(token).slice(0, 24);
        try {
          var menu = JSON.parse(sessionStorage.getItem("vc_menu_staff_v1") || "null");
          if (menu && menu.allowed && menu.fp === fp && Date.now() - Number(menu.at || 0) < 300000) {
            return true;
          }
        } catch (eMenu) {}
        try {
          var gate = JSON.parse(
            sessionStorage.getItem("vc_staff_access_ok_v2") ||
              localStorage.getItem("vc_staff_access_ok_v2_local") ||
              "null",
          );
          if (gate && gate.ok === true && Number(gate.exp || 0) > Date.now()) return true;
        } catch (eGate) {}
      }
      var link = document.getElementById("discord-staff-link");
      if (link && !link.hasAttribute("hidden")) return true;
      if (
        document.querySelector(
          "[data-vc-staff-tools-nav], .vc-snav-details--staff, .vc-header-snav [data-vc-staff-nav], .vc-snav-details[data-vc-staff-nav], #vc-staff-snav-details, #discord-staff-link:not([hidden])",
        )
      ) {
        return true;
      }
    } catch (eCan) {}
    return false;
  }

  function staffWorkflowsApiBase() {
    try {
      var c = window.__VC_STAFF_WORKFLOWS;
      if (c && typeof c === "object") {
        var u = String(c.apiUrl || "").trim();
        if (u) return u;
      }
    } catch (eCfg) {}
    return "/webhooks/site-staff-workflows";
  }

  function notificationsStaffPageUrl(inboxId, itemId) {
    try {
      var u = new URL(NOTIFICATIONS_PATH, window.location.origin);
      u.searchParams.set("view", "staff");
      if (inboxId) u.searchParams.set("inbox", String(inboxId));
      if (itemId) {
        u.searchParams.set("item", String(itemId));
        u.searchParams.set("scope", "pending");
      }
      return u.toString();
    } catch (eUrl) {
      var q = "?view=staff";
      if (inboxId) q += "&inbox=" + encodeURIComponent(String(inboxId));
      if (itemId) {
        q += "&item=" + encodeURIComponent(String(itemId)) + "&scope=pending";
      }
      return NOTIFICATIONS_PATH + q;
    }
  }

  function readBellStaffPerms() {
    var perms = {};
    try {
      var g = window.__VC_STAFF_PERMS;
      if (g && typeof g === "object" && g.ok) {
        Object.keys(g).forEach(function (k) {
          perms[k] = g[k];
        });
      }
    } catch (eG) {}
    var extra = bellStaffPerms && typeof bellStaffPerms === "object" ? bellStaffPerms : null;
    if (!extra) {
      try {
        var cached = readCachedBellStaffSummary();
        if (cached && cached.permissions) extra = cached.permissions;
      } catch (eCache) {}
    }
    if (extra && typeof extra === "object") {
      Object.keys(extra).forEach(function (k) {
        perms[k] = extra[k];
      });
    }
    return perms;
  }

  function bellInboxRowIsGated(row) {
    if (!row) return true;
    if (row.punti || row.id === "punti-tolti") return true;
    if (row.requiresHighStaff || row.id === "pause") return true;
    if (row.requiresCandidatureReview || row.id === "candidature") return true;
    if (row.requiresAppelliReview || row.id === "appelli") return true;
    if (row.id === "resoconti") return true;
    return false;
  }

  function canBellInboxRow(row) {
    if (!row) return false;
    var perms = readBellStaffPerms();
    var hasPerms = Boolean(
      perms &&
        (Object.prototype.hasOwnProperty.call(perms, "highStaff") ||
          Object.prototype.hasOwnProperty.call(perms, "candidatureReview") ||
          Object.prototype.hasOwnProperty.call(perms, "appelliReview") ||
          Object.prototype.hasOwnProperty.call(perms, "isPm") ||
          Object.prototype.hasOwnProperty.call(perms, "pm") ||
          Object.prototype.hasOwnProperty.call(perms, "isHighStaff") ||
          Object.prototype.hasOwnProperty.call(perms, "canViewPmPointsRemoved") ||
          Object.prototype.hasOwnProperty.call(perms, "canViewResoconti")),
    );
    if (!hasPerms) {
      /* inboxResoGate1: senza perms non flashare resoconti; altre code ok dopo fetch */
      if (row.id === "resoconti") return false;
      return true;
    }
    /* Pause API is High Staff only — do not treat director as HS. */
    var high = Boolean(perms.highStaff || perms.isHighStaff || perms.canManage);
    var highOrDirector = high || Boolean(perms.director);
    var pm = Boolean(perms.isPm || perms.pm || perms.partnerManager || perms.isPmGestore);
    /* inboxNoDirector1: Director non vede resoconti né punti tolti */
    if (row.punti || row.id === "punti-tolti") {
      if (perms.canViewPmPointsRemoved === true) return true;
      if (perms.canViewPmPointsRemoved === false) return false;
      if (perms.director && !high) return false;
      return high || pm;
    }
    if (row.requiresHighStaff || row.id === "pause") return high;
    if (row.requiresCandidatureReview || row.id === "candidature") {
      return Boolean(perms.candidatureReview) || highOrDirector;
    }
    if (row.requiresAppelliReview || row.id === "appelli") {
      return Boolean(perms.appelliReview) || highOrDirector;
    }
    if (row.id === "resoconti") {
      if (perms.canViewResoconti === true) return true;
      if (perms.canViewResoconti === false) return false;
      if (perms.director && !high) return false;
      return high || Boolean(perms.isPmGestore);
    }
    return true;
  }

  function hideBellInboxForbiddenRow(row) {
    if (!row || !row.id) return;
    try {
      var list = document.getElementById("vc-notif-bell-inbox-list");
      if (!list) return;
      var el = list.querySelector('[data-bell-inbox="' + String(row.id).replace(/"/g, "") + '"]');
      if (!el) return;
      el.remove();
      var hint = document.getElementById("vc-notif-bell-inbox-hint");
      var left = list.querySelectorAll(".vc-notif-bell-inbox__row").length;
      if (hint) {
        hint.textContent = "";
        hint.hidden = true;
        hint.setAttribute("hidden", "");
      }
      void left;
    } catch (eHide) {}
  }

  function isBellInboxForbiddenErr(err) {
    if (!err) return false;
    if (Number(err.status) === 403) return true;
    var msg = String(err.message || err.error || "").toLowerCase();
    return (
      msg.indexOf("solo high staff") >= 0 ||
      msg.indexOf("forbidden") >= 0 ||
      msg.indexOf("non hai i permessi") >= 0
    );
  }

  /* notifApiErr1: 401 / abort / rete soft → non toastare come fallimento duro */
  function isBellInboxBenignErr(err) {
    if (!err) return true;
    if (err.benign === true) return true;
    var st = Number(err.status) || 0;
    if (st === 401 || st === 403 || st === 0 || st === 408 || st === 429) return true;
    var msg = String(err.message || err.error || "").toLowerCase();
    return (
      msg.indexOf("abort") >= 0 ||
      msg.indexOf("timeout") >= 0 ||
      msg.indexOf("network") >= 0 ||
      msg.indexOf("missing_token") >= 0 ||
      msg.indexOf("invalid_token") >= 0 ||
      msg.indexOf("accedi") >= 0 ||
      msg.indexOf("invalid_json") >= 0 ||
      msg.indexOf("empty") >= 0 ||
      msg.indexOf("rate_limited") >= 0
    );
  }

  function escBellHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function bellInboxItemFocusId(queueId, item) {
    if (!item) return "";
    if (queueId === "pause") return String(item.id || "").trim();
    if (queueId === "punti-tolti") return String(item.messageId || item.id || "").trim();
    return String(item.messageId || item.recordId || item.id || "").trim();
  }

  function bellInboxItemLabel(queueId, item) {
    if (!item) return "Richiesta";
    if (queueId === "punti-tolti") {
      var pm = item.pm || {};
      var who = String(pm.displayName || pm.userId || "").trim();
      var rule = String(item.rule || "").trim();
      if (who && rule) return who + " · " + rule;
      return who || rule || "Punti tolti";
    }
    var name = String(item.displayName || "").trim();
    var title = String(item.title || "").trim();
    var type = String(item.type || item.kind || "").trim();
    if (name && !/^\d{16,22}$/.test(name)) return name;
    if (title) return title;
    if (type) return type;
    return "Richiesta";
  }

  /* notifCats2: richer inbox queue row (who / what / when). */
  function bellInboxItemDetail(queueId, item) {
    if (!item) return { title: "Richiesta", subtitle: "", when: "", avatarUrl: "" };
    var title = bellInboxItemLabel(queueId, item);
    var subtitle = "";
    var avatarUrl = String(item.avatarUrl || "").trim();
    if (queueId === "pause") {
      var start = String(item.start || "").trim();
      var end = String(item.end || "").trim();
      var role = String(item.ruoloRichiesto || item.ruoloTrack || "").trim();
      var period = start && end ? start + " → " + end : start || end;
      var bits = [];
      if (role) bits.push(role);
      if (period) bits.push(period);
      var motiv = String(item.motivazione || item.preview || "").trim();
      if (motiv && bits.length < 2) bits.push(motiv.slice(0, 80));
      subtitle = bits.join(" · ");
    } else if (queueId === "punti-tolti") {
      var pm2 = item.pm || {};
      title = String(pm2.displayName || pm2.userId || title).trim() || "Punti tolti";
      avatarUrl = String(pm2.avatarUrl || item.avatarUrl || "").trim();
      var rule2 = String(item.rule || "").trim();
      var reporter = String((item.reporter && item.reporter.displayName) || item.reporterName || "").trim();
      subtitle = [rule2, reporter ? "da " + reporter : ""].filter(Boolean).join(" · ");
    } else if (queueId === "resoconti") {
      var resoTitle = String(item.title || "").trim();
      if (resoTitle && resoTitle !== title) subtitle = resoTitle;
      else subtitle = String(item.preview || item.roleLabel || item.kind || "").trim().slice(0, 100);
    } else {
      subtitle = String(item.preview || item.title || item.type || item.kind || "").trim().slice(0, 100);
      if (subtitle === title) subtitle = "";
    }
    var whenMs = Date.parse(String(item.createdAt || item.updatedAt || item.at || "")) || 0;
    var when = whenMs ? timeAgoLocalized(whenMs) : "";
    return { title: title, subtitle: subtitle, when: when, avatarUrl: avatarUrl };
  }

  function navigateBellInboxHref(href) {
    var ddNav = document.getElementById("vc-notif-dropdown");
    if (ddNav) requestCloseNotifDropdown(ddNav);
    openNotifDestination(href, "mod");
  }

  function puntiToltiApiBase() {
    try {
      var c = window.__VC_STAFF_PM_POINTS_REMOVED;
      if (c && typeof c === "object") {
        var u = String(c.apiUrl || "").trim();
        if (u) return u;
      }
    } catch (eCfg) {}
    return "/webhooks/site-staff-pm-points-removed";
  }

  function fetchBellInboxQueueItems(row) {
    var id = row && row.id ? String(row.id) : "";
    if (!id) return Promise.resolve([]);
    if (bellStaffQueueInFlight[id]) return bellStaffQueueInFlight[id];
    var cached = bellStaffQueueCache[id];
    if (cached && cached.ok !== false && Date.now() - Number(cached.at || 0) < 20000) {
      return Promise.resolve(cached.items || []);
    }
    var token = getDiscordAccessToken();
    if (!token) {
      return Promise.reject(new Error("Accedi per vedere questa coda."));
    }

    var url;
    if (row.punti || id === "punti-tolti") {
      var pt = puntiToltiApiBase();
      url =
        pt +
        (pt.indexOf("?") >= 0 ? "&" : "?") +
        "limit=" +
        encodeURIComponent(String(BELL_INBOX_PAGE_SIZE)) +
        "&pending=1";
    } else {
      var api = staffWorkflowsApiBase();
      /* notifQueueFast1: solo DB — niente sync=1 (Discord sync fino a 22s+) */
      url =
        api +
        (api.indexOf("?") >= 0 ? "&" : "?") +
        "queue=" +
        encodeURIComponent(id) +
        "&scope=pending&pageSize=" +
        encodeURIComponent(String(BELL_INBOX_PAGE_SIZE));
    }

    /* notifQueueFast1: timeout 8s — no hang 1min su Caricamento… */
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var abortTimer = window.setTimeout(function () {
      try {
        if (ctrl) ctrl.abort();
      } catch (eAb) {}
    }, 8000);
    var fetchOpts = {
      method: "GET",
      credentials: "include",
      headers: { Authorization: "Bearer " + token, Accept: "application/json" },
      cache: "no-store",
    };
    if (ctrl) fetchOpts.signal = ctrl.signal;

    bellStaffQueueInFlight[id] = fetch(url, fetchOpts)
      .then(function (res) {
        return res
          .json()
          .catch(function () {
            return null;
          })
          .then(function (body) {
            return { ok: res.ok, status: res.status, body: body };
          });
      })
      .then(function (out) {
        /* notifApiErr1: ok:true senza items → lista vuota, non errore */
        if (out && out.body && out.body.ok === true) {
          var itemsOk = Array.isArray(out.body.items) ? out.body.items : [];
          itemsOk = itemsOk.slice(0, BELL_INBOX_PAGE_SIZE);
          bellStaffQueueCache[id] = { at: Date.now(), items: itemsOk, ok: true };
          if (out.body.permissions) {
            bellStaffPerms = out.body.permissions;
          }
          return itemsOk;
        }
        var st = Number(out && out.status) || 0;
        var msg =
          (out && out.body && (out.body.message || out.body.error)) ||
          (st === 401 ? "Accedi per vedere questa coda." : "Impossibile caricare la coda.");
        var err = new Error(String(msg));
        err.status = st;
        err.benign =
          st === 401 ||
          st === 403 ||
          st === 0 ||
          st === 408 ||
          st === 429 ||
          st >= 500 ||
          !out ||
          !out.body;
        throw err;
      })
      .catch(function (err) {
        var aborted =
          (err && (err.name === "AbortError" || /abort/i.test(String(err.message || "")))) ||
          (ctrl && ctrl.signal && ctrl.signal.aborted);
        if (aborted) {
          var toErr = new Error("Caricamento troppo lento");
          toErr.status = 408;
          toErr.benign = true;
          if (cached && cached.ok !== false && Array.isArray(cached.items) && cached.items.length) {
            return cached.items;
          }
          throw toErr;
        }
        if (cached && cached.ok !== false && Array.isArray(cached.items)) {
          return cached.items;
        }
        throw err || new Error("Impossibile caricare la coda.");
      })
      .finally(function () {
        try {
          window.clearTimeout(abortTimer);
        } catch (eClr) {}
        bellStaffQueueInFlight[id] = null;
      });
    return bellStaffQueueInFlight[id];
  }

  function renderBellInboxItems(row, host, items) {
    if (!host) return;
    host.innerHTML = "";
    host.hidden = false;
    host.removeAttribute("hidden");
    var queueItems = Array.isArray(items) ? items.slice() : [];
    var ptExtra = [];
    if (row && row.id === "punti-tolti") {
      ptExtra = inboxNotifsForBucket("punti-tolti");
      ptExtra.forEach(function (n) {
        var item = document.createElement("li");
        item.className =
          "vc-notif-bell-inbox__item vc-notif-bell-inbox__item--rich" + (n.read ? "" : " is-unread");
        var a = document.createElement("a");
        a.className = "vc-notif-bell-inbox__item-link vc-notif-bell-inbox__item-link--rich";
        var dest = String(n.openUrl || "").trim();
        a.href = dest ? resolveNotifDestUrl(dest) : notificationsStaffPageUrl("punti-tolti");
        var bodySnip = String(n.body || "").trim().slice(0, 110);
        var whenTxt = timeAgoLocalized(n.at || Date.now());
        a.innerHTML =
          '<span class="vc-notif-bell-inbox__item-dot" aria-hidden="true"></span>' +
          '<span class="vc-notif-bell-inbox__item-copy">' +
          '<span class="vc-notif-bell-inbox__item-label">' +
          escBellHtml(String(n.title || "Punti tolti")) +
          "</span>" +
          (bodySnip
            ? '<span class="vc-notif-bell-inbox__item-sub">' + escBellHtml(bodySnip) + "</span>"
            : "") +
          '<span class="vc-notif-bell-inbox__item-time">' +
          escBellHtml(whenTxt) +
          "</span>" +
          "</span>" +
          (!n.read
            ? '<span class="vc-notif-bell-inbox__item-badge is-pending" aria-label="In attesa"></span>'
            : "");
        a.addEventListener("click", function (ev) {
          ev.preventDefault();
          try {
            markOneRead(n.id);
          } catch (eMark) {}
          navigateBellInboxHref(a.href);
        });
        item.appendChild(a);
        host.appendChild(item);
      });
    }
    if (!queueItems.length && !ptExtra.length) {
      var empty = document.createElement("li");
      empty.className = "vc-notif-bell-inbox__item vc-notif-bell-inbox__item--empty";
      empty.textContent = "Nessuna richiesta";
      host.appendChild(empty);
      return;
    }
    queueItems.forEach(function (item) {
      var li = document.createElement("li");
      li.className = "vc-notif-bell-inbox__item vc-notif-bell-inbox__item--rich";
      var a = document.createElement("a");
      a.className = "vc-notif-bell-inbox__item-link vc-notif-bell-inbox__item-link--rich";
      var focusId = bellInboxItemFocusId(row.id, item);
      a.href = notificationsStaffPageUrl(row.id, focusId);
      var det = bellInboxItemDetail(row.id, item);
      var avHtml = det.avatarUrl
        ? '<img class="vc-notif-bell-inbox__item-av" src="' +
          escBellHtml(det.avatarUrl) +
          '" alt="" width="28" height="28" loading="lazy" decoding="async" />'
        : '<span class="vc-notif-bell-inbox__item-av vc-notif-bell-inbox__item-av--ph" aria-hidden="true"><i class="fa fa-user"></i></span>';
      a.innerHTML =
        avHtml +
        '<span class="vc-notif-bell-inbox__item-copy">' +
        '<span class="vc-notif-bell-inbox__item-label">' +
        escBellHtml(det.title) +
        "</span>" +
        (det.subtitle
          ? '<span class="vc-notif-bell-inbox__item-sub">' + escBellHtml(det.subtitle) + "</span>"
          : "") +
        (det.when
          ? '<span class="vc-notif-bell-inbox__item-time">' + escBellHtml(det.when) + "</span>"
          : "") +
        "</span>" +
        /* notifPendingSwitch1: pip rosso, niente testo Pending */
        '<span class="vc-notif-bell-inbox__item-badge is-pending" aria-label="In attesa"></span>' +
        '<i class="fa fa-chevron-right" aria-hidden="true"></i>';
      a.addEventListener("click", function (ev) {
        ev.preventDefault();
        navigateBellInboxHref(a.href);
      });
      li.appendChild(a);
      host.appendChild(li);
    });
    var more = document.createElement("li");
    more.className = "vc-notif-bell-inbox__item vc-notif-bell-inbox__item--more";
    var moreA = document.createElement("a");
    moreA.className = "vc-notif-bell-inbox__item-link vc-notif-bell-inbox__item-link--more";
    moreA.href = notificationsStaffPageUrl(row.id);
    moreA.textContent = "Apri inbox completa";
    moreA.addEventListener("click", function (ev) {
      ev.preventDefault();
      navigateBellInboxHref(moreA.href);
    });
    more.appendChild(moreA);
    host.appendChild(more);
  }

  function renderBellInboxLoadError(row, host, message) {
    if (!host) return;
    host.innerHTML = "";
    host.hidden = false;
    host.removeAttribute("hidden");
    var li = document.createElement("li");
    li.className = "vc-notif-bell-inbox__item vc-notif-bell-inbox__item--empty vc-notif-bell-inbox__item--error";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "vc-notif-bell-inbox__retry";
    btn.textContent = String(message || "Errore di caricamento") + " — riprova";
    btn.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      host.removeAttribute("data-loaded");
      host.removeAttribute("data-loading");
      host.innerHTML =
        '<li class="vc-notif-bell-inbox__item vc-notif-bell-inbox__item--empty">Caricamento…</li>';
      loadBellInboxSectionItems(row, host);
    });
    li.appendChild(btn);
    host.appendChild(li);
  }

  function shouldPreserveBellInboxList() {
    try {
      if (bellNotifScope !== "staff") return false;
      if (Date.now() < Number(bellInboxExpandLockUntil || 0)) return true;
      var list = document.getElementById("vc-notif-bell-inbox-list");
      if (!list) return false;
      if (list.querySelector('[data-loading="1"]')) return true;
      if (list.querySelector(".vc-notif-bell-inbox__row.is-open")) return true;
    } catch (ePres) {}
    return false;
  }

  function loadBellInboxSectionItems(row, itemsHost) {
    if (!row || !itemsHost) return;
    var gen = String((Number(itemsHost.getAttribute("data-gen") || 0) || 0) + 1);
    itemsHost.setAttribute("data-gen", gen);
    itemsHost.setAttribute("data-loading", "1");
    itemsHost.setAttribute("data-load-started", String(Date.now()));
    fetchBellInboxQueueItems(row)
      .then(function (items) {
        if (itemsHost.getAttribute("data-gen") !== gen) return;
        if (!itemsHost.isConnected) return;
        itemsHost.removeAttribute("data-loading");
        itemsHost.setAttribute("data-loaded", "1");
        renderBellInboxItems(row, itemsHost, items || []);
        try {
          bellInboxExpandLockUntil = Math.max(bellInboxExpandLockUntil, Date.now() + 800);
        } catch (eLock) {}
      })
      .catch(function (err) {
        if (itemsHost.getAttribute("data-gen") !== gen) return;
        if (!itemsHost.isConnected) return;
        itemsHost.removeAttribute("data-loading");
        itemsHost.removeAttribute("data-loaded");
        try {
          bellInboxExpandLockUntil = Math.max(bellInboxExpandLockUntil, Date.now() + 600);
        } catch (eLock2) {}
        /* notifInboxGate1: never show "Solo High Staff — riprova"; hide gated queues. */
        if (isBellInboxForbiddenErr(err) || !canBellInboxRow(row)) {
          /* notifSheetScopeFix1: se summary ha count > 0 non nascondere — mostra retry */
          var sumCount = 0;
          try {
            var cachedSum = readCachedBellStaffSummary();
            sumCount = Number(cachedSum && cachedSum.summary && cachedSum.summary[row.id]) || 0;
          } catch (eSumC) {}
          if (sumCount <= 0) {
            hideBellInboxForbiddenRow(row);
            return;
          }
        }
        /* notifApiErr1: niente toast globale — solo retry inline; benign = copy soft */
        var benign = isBellInboxBenignErr(err);
        var msg = benign
          ? Number(err && err.status) === 401
            ? "Accedi per vedere questa coda."
            : "Caricamento non riuscito"
          : (err && err.message) || "Impossibile caricare la coda.";
        renderBellInboxLoadError(row, itemsHost, msg);
      });
  }

  function toggleBellInboxSection(row, btn, itemsHost, forceOpen) {
    if (!btn || !itemsHost) return;
    if (!canBellInboxRow(row)) {
      hideBellInboxForbiddenRow(row);
      return;
    }
    var wantOpen =
      typeof forceOpen === "boolean" ? forceOpen : btn.getAttribute("aria-expanded") !== "true";
    btn.setAttribute("aria-expanded", wantOpen ? "true" : "false");
    btn.classList.toggle("is-open", wantOpen);
    var rowEl = btn.closest(".vc-notif-bell-inbox__row");
    if (rowEl) rowEl.classList.toggle("is-open", wantOpen);
    try {
      var barEl = rowEl && rowEl.querySelector(".vc-notif-cat-bar, .vc-notif-bell-inbox__link");
      if (barEl) barEl.classList.toggle("is-open", wantOpen);
    } catch (eBarOpen) {}
    try {
      var rid = row && row.id ? String(row.id) : "";
      if (rid) {
        if (wantOpen) delete bellUserCollapsedCats["q:" + rid];
        else bellUserCollapsedCats["q:" + rid] = 1;
      }
    } catch (eCol) {}
    if (!wantOpen) {
      itemsHost.hidden = true;
      itemsHost.setAttribute("hidden", "");
      return;
    }
    /* notifCatLoadFix1: lock più lungo — peer-sync non deve wipe a metà fetch */
    bellInboxExpandLockUntil = Date.now() + 2400;
    itemsHost.hidden = false;
    itemsHost.removeAttribute("hidden");
    var loaded = itemsHost.getAttribute("data-loaded") === "1";
    var loading = itemsHost.getAttribute("data-loading") === "1";
    var hasRows = Boolean(itemsHost.querySelector(".vc-notif-bell-inbox__item-link, .vc-notif-bell-inbox__retry"));
    if (loaded && hasRows && forceOpen !== true) return;
    if (loading) {
      var started = Number(itemsHost.getAttribute("data-load-started") || 0) || 0;
      if (started && Date.now() - started < 9000 && forceOpen !== true) return;
      /* stuck loading → riprova */
      itemsHost.removeAttribute("data-loading");
      itemsHost.removeAttribute("data-loaded");
    }
    itemsHost.innerHTML =
      '<li class="vc-notif-bell-inbox__item vc-notif-bell-inbox__item--empty">Caricamento…</li>';
    loadBellInboxSectionItems(row, itemsHost);
  }

  function ensureNotifBellScopeUi() {
    var dd = document.getElementById("vc-notif-dropdown");
    if (!dd) return false;
    var panel = dd.querySelector(".vc-notif-panel");
    if (!panel) return false;
    var head = panel.querySelector(".vc-notif-panel-head");
    var body = panel.querySelector(".vc-notif-panel-body");
    if (!body) return false;

    var switchWrap = document.getElementById("vc-notif-bell-scope");
    if (!switchWrap) {
      switchWrap = document.createElement("div");
      switchWrap.id = "vc-notif-bell-scope";
      switchWrap.className = "vc-notif-scope-switch";
      switchWrap.hidden = true;
      switchWrap.innerHTML =
        '<div class="vc-notif-scope-switch__seg" role="tablist" aria-label="Ambito notifiche">' +
        '<button type="button" role="tab" class="vc-notif-scope-switch__btn is-active" id="vc-notif-bell-tab-personal" data-bell-scope="personal" aria-selected="true">' +
        '<i class="fa fa-bell" aria-hidden="true"></i><span>Personali</span>' +
        '<span class="vc-notif-scope-switch__pending" id="vc-notif-bell-pending-personal" hidden aria-hidden="true"></span></button>' +
        '<button type="button" role="tab" class="vc-notif-scope-switch__btn" id="vc-notif-bell-tab-staff" data-bell-scope="staff" aria-selected="false">' +
        '<i class="fa fa-inbox" aria-hidden="true"></i><span>Inbox</span>' +
        '<span class="vc-notif-scope-switch__pending" id="vc-notif-bell-pending-staff" hidden aria-hidden="true"></span></button>' +
        "</div>";
      if (head && head.parentNode === panel) panel.insertBefore(switchWrap, head.nextSibling);
      else panel.insertBefore(switchWrap, body);
    } else {
      /* notifPendingSwitch1: upgrade switcher già montato senza pip pending */
      try {
        var tabPers = switchWrap.querySelector("#vc-notif-bell-tab-personal");
        var tabStaff = switchWrap.querySelector("#vc-notif-bell-tab-staff");
        if (tabPers && !switchWrap.querySelector("#vc-notif-bell-pending-personal")) {
          var pPend = document.createElement("span");
          pPend.className = "vc-notif-scope-switch__pending";
          pPend.id = "vc-notif-bell-pending-personal";
          pPend.hidden = true;
          pPend.setAttribute("aria-hidden", "true");
          tabPers.appendChild(pPend);
        }
        if (tabStaff && !switchWrap.querySelector("#vc-notif-bell-pending-staff")) {
          var sPend = document.createElement("span");
          sPend.className = "vc-notif-scope-switch__pending";
          sPend.id = "vc-notif-bell-pending-staff";
          sPend.hidden = true;
          sPend.setAttribute("aria-hidden", "true");
          tabStaff.appendChild(sPend);
        }
      } catch (eUpg) {}
    }

    var personalPane = document.getElementById("vc-notif-bell-pane-personal");
    if (!personalPane) {
      personalPane = document.createElement("div");
      personalPane.id = "vc-notif-bell-pane-personal";
      personalPane.className = "vc-notif-bell-pane";
      personalPane.setAttribute("data-bell-pane", "personal");
      while (body.firstChild) {
        var moveChild = body.firstChild;
        /* bellInboxEmptyFix1: non inghiottire lo staff pane dentro Personali */
        if (
          moveChild &&
          moveChild.id === "vc-notif-bell-pane-staff"
        ) {
          break;
        }
        personalPane.appendChild(moveChild);
      }
      body.appendChild(personalPane);
    }

    var staffPane = document.getElementById("vc-notif-bell-pane-staff");
    if (!staffPane) {
      staffPane = document.createElement("div");
      staffPane.id = "vc-notif-bell-pane-staff";
      staffPane.className = "vc-notif-bell-pane vc-notif-bell-pane--staff";
      staffPane.setAttribute("data-bell-pane", "staff");
      staffPane.hidden = true;
      staffPane.innerHTML =
        '<div class="vc-notif-bell-inbox" id="vc-notif-bell-inbox">' +
        '<p class="vc-notif-bell-inbox__hint" id="vc-notif-bell-inbox-hint" hidden></p>' +
        '<ul class="vc-notif-bell-inbox__list" id="vc-notif-bell-inbox-list" role="list"></ul>' +
        "</div>";
      body.appendChild(staffPane);
    } else if (personalPane && personalPane.contains(staffPane)) {
      /* bellInboxEmptyFix1: ripara nesting rotto (Inbox “sparisce” restando dentro Personali hidden) */
      body.appendChild(staffPane);
    }

    if (!bellNotifScopeWired && !window.__vcNotifBellScopeWired) {
      bellNotifScopeWired = true;
      window.__vcNotifBellScopeWired = true;
      switchWrap.addEventListener("click", function (ev) {
        var btn =
          ev.target && ev.target.closest ? ev.target.closest("[data-bell-scope]") : null;
        if (!btn || !switchWrap.contains(btn)) return;
        /* notifTapEmptyFix1: MAI bloccare switch Personali|Inbox intenzionale
           (expand-lock era 4s → sheet “rotto” allo switch). */
        ev.preventDefault();
        ev.stopPropagation();
        try {
          if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
        } catch (eStop) {}
        bellInboxExpandLockUntil = 0;
        /* notifSheetScopeFix1: switch Personali|Inbox — lock solo bell */
        notifBellGestureLockUntil = Date.now() + 480;
        var next = btn.getAttribute("data-bell-scope") === "staff" ? "staff" : "personal";
        setBellNotifScope(next, { source: "bell", remember: true });
      });
      window.addEventListener("vc:notif-scope", function (ev) {
        /* notifBellStable1: mentre lo sheet è aperto, solo tap espliciti sulla campana
           (mai page/dock/open/soft-open → switch a caso). */
        var ddLive = document.getElementById("vc-notif-dropdown");
        var sheetOpen = false;
        try {
          sheetOpen = Boolean(
            ddLive &&
              (ddLive.open ||
                document.documentElement.classList.contains("vc-notif-sheet-open") ||
                document.documentElement.classList.contains("vc-notif-drawer-open")),
          );
        } catch (eOpen) {}
        var src = ev && ev.detail && ev.detail.source ? String(ev.detail.source) : "page";
        if (sheetOpen && src !== "bell") return;
        if (!ddLive || !ddLive.open) return;
        if (src === "page" || src === "dock" || src === "open" || src === "notif-open") return;
        var next = ev && ev.detail && ev.detail.scope === "staff" ? "staff" : "personal";
        setBellNotifScope(next, { source: "page", silent: true, remember: false });
      });
      window.addEventListener("vc:staff-access-ok", function () {
        syncNotifBellScopeChrome();
      });
      window.addEventListener("vc:auth-logout", function () {
        setBellNotifScope("personal", { source: "logout", silent: true, remember: false });
      });
      window.addEventListener("vc:push-detach", function () {
        detachCurrentWebPushSubscription({ useRawToken: true });
      });
      window.addEventListener("vc:view-as-changed", function () {
        if (isViewAsLogoutMode()) {
          detachCurrentWebPushSubscription({ useRawToken: true });
        } else if (getDiscordAccessToken()) {
          syncExistingWebPushSubscription();
        }
      });
    }
      try {
        window.__vcEnsureNotifBellScopeUi = ensureNotifBellScopeUi;
        window.__vcSyncNotifBellScopeChrome = syncNotifBellScopeChrome;
        window.__vcSetBellNotifScope = setBellNotifScope;
        window.__vcLoadBellStaffInboxSummary = loadBellStaffInboxSummary;
        window.__vcPushDetachForLogout = function () {
          return detachCurrentWebPushSubscription({ useRawToken: true });
        };
      } catch (eHooks) {}
    return true;
  }

  function resolveInitialBellScope(opts) {
    opts = opts || {};
    /* notifSheetScopeFix1: apertura campana → SEMPRE Personali (prima di URL/pref/page). */
    if (opts.fromBellOpen) {
      return "personal";
    }
    var fromUrl = readBellScopeFromUrl();
    if (fromUrl === "staff" && canBellStaffInbox()) return "staff";
    if (isOnNotificationsPage()) {
      try {
        if (document.body && document.body.classList.contains("vc-notif-scope-staff") && canBellStaffInbox()) {
          return "staff";
        }
      } catch (eBody) {}
      try {
        if (window.VcNotifScope && typeof window.VcNotifScope.getScope === "function") {
          var pageScope = window.VcNotifScope.getScope();
          if (pageScope === "staff" && canBellStaffInbox()) return "staff";
        }
      } catch (eGet) {}
    }
    var pref = readBellScopePref();
    if (pref === "staff" && canBellStaffInbox()) return "staff";
    return "personal";
  }

  function syncNotifScopeSwitchPending() {
    /* notifPendingSwitch1: pip/count rosso su Personali|Inbox */
    function paint(el, n) {
      if (!el) return;
      var count = Math.max(0, Number(n) || 0);
      if (count <= 0) {
        el.hidden = true;
        el.setAttribute("hidden", "");
        el.setAttribute("aria-hidden", "true");
        el.removeAttribute("aria-label");
        el.textContent = "";
        el.classList.remove("has-count");
        return;
      }
      el.hidden = false;
      el.removeAttribute("hidden");
      el.setAttribute("aria-hidden", "false");
      el.setAttribute("aria-label", count === 1 ? "1 in attesa" : count + " in attesa");
      el.textContent = count > 99 ? "99+" : String(count);
      el.classList.add("has-count");
    }
    var personalN = 0;
    try {
      personalN = countDistinctUnreadNotifs(filterVisiblePersonalNotifs(rows()));
    } catch (eP) {
      personalN = 0;
    }
    var staffN = 0;
    try {
      staffN = Math.max(0, Number(countStaffInboxPendingSummary()) || 0);
      staffN += Math.max(0, Number(countInboxUnreadNotifs()) || 0);
    } catch (eS) {
      staffN = 0;
    }
    paint(document.getElementById("vc-notif-bell-pending-personal"), personalN);
    paint(document.getElementById("vc-notif-bell-pending-staff"), staffN);
  }

  function syncNotifBellScopeChrome() {
    ensureNotifBellScopeUi();
    var switchWrap = document.getElementById("vc-notif-bell-scope");
    var tabP = document.getElementById("vc-notif-bell-tab-personal");
    var tabS = document.getElementById("vc-notif-bell-tab-staff");
    var personalPane = document.getElementById("vc-notif-bell-pane-personal");
    var staffPane = document.getElementById("vc-notif-bell-pane-staff");
    var staffOk = canBellStaffInbox();
    if (!staffOk && bellNotifScope === "staff") bellNotifScope = "personal";
    if (switchWrap) {
      if (staffOk) {
        switchWrap.hidden = false;
        switchWrap.removeAttribute("hidden");
      } else {
        switchWrap.hidden = true;
        switchWrap.setAttribute("hidden", "");
      }
    }
    if (tabS) {
      tabS.disabled = !staffOk;
      tabS.setAttribute("aria-disabled", staffOk ? "false" : "true");
      if (!staffOk) tabS.setAttribute("hidden", "");
      else tabS.removeAttribute("hidden");
    }
    var isStaff = bellNotifScope === "staff" && staffOk;
    if (tabP) {
      tabP.classList.toggle("is-active", !isStaff);
      tabP.setAttribute("aria-selected", !isStaff ? "true" : "false");
    }
    if (tabS) {
      tabS.classList.toggle("is-active", isStaff);
      tabS.setAttribute("aria-selected", isStaff ? "true" : "false");
    }
    if (personalPane) {
      personalPane.hidden = isStaff;
      if (isStaff) personalPane.setAttribute("hidden", "");
      else personalPane.removeAttribute("hidden");
    }
    if (staffPane) {
      staffPane.hidden = !isStaff;
      if (!isStaff) staffPane.setAttribute("hidden", "");
      else staffPane.removeAttribute("hidden");
    }
    try {
      var dd = document.getElementById("vc-notif-dropdown");
      if (dd) dd.classList.toggle("vc-notif-dropdown--staff-scope", isStaff);
    } catch (eCls) {}
    try {
      var clearAll = document.getElementById("vc-notif-clear-all");
      if (clearAll) {
        clearAll.hidden = isStaff;
        if (isStaff) clearAll.setAttribute("hidden", "");
        else clearAll.removeAttribute("hidden");
      }
    } catch (eClear) {}
    ensureNotifSeeAllLink();
    try {
      syncNotifScopeSwitchPending();
    } catch (ePend) {}
    /* notifBellStable1: su switch tab niente force summary (wipe+flash); soft solo se staff */
    if (staffOk) {
      if (isStaff) loadBellStaffInboxSummary(false);
      else {
        try {
          paintNotifBellBadgeFromStore();
        } catch (eBadgeOnly) {}
      }
    }
  }

  function setBellNotifScope(next, opts) {
    opts = opts || {};
    var want = next === "staff" ? "staff" : "personal";
    if (want === "staff" && !canBellStaffInbox()) want = "personal";
    var prev = bellNotifScope;
    bellNotifScope = want;
    if (!opts || opts.remember !== false) writeBellScopePref(want);
    syncNotifBellScopeChrome();
    if (opts.source === "bell" && !opts.silent) {
      try {
        if (isOnNotificationsPage() && window.VcNotifScope && typeof window.VcNotifScope.setScope === "function") {
          window.VcNotifScope.setScope(want, { remember: false });
        } else {
          window.dispatchEvent(new CustomEvent("vc:notif-scope", { detail: { scope: want, source: "bell" } }));
        }
      } catch (eSync) {}
    }
    if (prev !== want) {
      try {
        var sub = document.getElementById("vc-notif-unread-sub");
        if (sub && want === "staff") sub.textContent = formatUnreadSub(countInboxUnreadNotifs());
        else if (want === "personal") render({ force: false });
      } catch (eSub) {}
    }
  }

  function readCachedBellStaffSummary() {
    try {
      var pref = window.__VC_INBOX_SUMMARY_PREFETCH;
      if (pref && pref.summary) return pref;
      var now = Date.now();
      var raw = sessionStorage.getItem("vc_inbox_summary_v1");
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.summary && now - Number(parsed.at || 0) <= 120000) return parsed;
      }
      var rawLocal = localStorage.getItem("vc_inbox_summary_local_v1");
      if (rawLocal) {
        var parsedLocal = JSON.parse(rawLocal);
        if (parsedLocal && parsedLocal.summary && now - Number(parsedLocal.at || 0) <= 600000) {
          return parsedLocal;
        }
      }
    } catch (eCache) {}
    return null;
  }

  function patchBellStaffInboxCounts(summary) {
    var list = document.getElementById("vc-notif-bell-inbox-list");
    if (!list) return;
    var sum = summary && typeof summary === "object" ? summary : {};
    BELL_INBOX_ROWS.forEach(function (row) {
      if (!row || !row.id || !canBellInboxRow(row)) return;
      var li = list.querySelector('.vc-notif-bell-inbox__row[data-bell-inbox="' + row.id + '"]');
      if (!li) return;
      var count = Number(sum[row.id] || 0) || 0;
      if (
        (row.punti || row.id === "punti-tolti") &&
        !sum[row.id] &&
        bellStaffQueueCache[row.id] &&
        Array.isArray(bellStaffQueueCache[row.id].items)
      ) {
        count = bellStaffQueueCache[row.id].items.length;
      }
      if (row.id === "punti-tolti") count += inboxNotifsForBucket("punti-tolti").length;
      li.classList.toggle("has-count", count > 0);
      var countEl = li.querySelector(".vc-notif-bell-inbox__count");
      if (countEl) {
        countEl.textContent = count > 99 ? "99+" : String(count);
        countEl.classList.toggle("vc-notif-bell-inbox__count--new", count > 0);
      }
    });
  }

  function renderBellStaffInbox(summary) {
    var list = document.getElementById("vc-notif-bell-inbox-list");
    var hint = document.getElementById("vc-notif-bell-inbox-hint");
    /* notifCats3 marker */
    /* notifUseful1 marker */
    /* notifPendingBoot1 marker */
    /* notifSheetScopeFix1 marker */
    /* notifBellStable1 marker */
    /* notifQueueFast1 marker */
    /* perfBgRam1 marker */
    /* perfDeskCut1 marker */
    /* notifSheetOpenFix1 + notifSheetFastOpen1 marker */
    /* notifCatLoadFix1 marker */
    if (!list) return;
    var sum = summary && typeof summary === "object" ? summary : {};
    /* notifQueueFast1 / notifTapEmptyFix1: skip wipe solo durante load in corso
       (is-open forever bloccava update e faceva sembrare lo sheet rotto). */
    var listBusy = false;
    try {
      listBusy =
        Date.now() < Number(bellInboxExpandLockUntil || 0) ||
        Boolean(list.querySelector('[data-loading="1"]')) ||
        Boolean(list.querySelector(".vc-notif-bell-inbox__row.is-open"));
    } catch (eBusy) {
      listBusy = false;
    }
    /* notifCatLoadFix1: con categorie aperte solo patch count (mai wipe) */
    if (listBusy && list.children && list.children.length) {
      try {
        patchBellStaffInboxCounts(sum);
        paintNotifBellBadgeFromStore();
      } catch (ePatch) {}
      return;
    }
    var sigParts = [];
    try {
      (BELL_INBOX_ROWS || []).forEach(function (row) {
        if (!row || !row.id) return;
        sigParts.push(row.id + ":" + String(Number(sum[row.id]) || 0));
      });
      sigParts.push("p:" + JSON.stringify(bellStaffPerms || {}));
      /* notifBellStable1: NON includere n: count store — ogni sync wipe+flash categorie */
    } catch (eSig) {}
    var nextSig = sigParts.join("|");
    /* notifSheetScopeFix1: non wipe lista se summary/counts uguali (abortiva load Resoconti) */
    if (nextSig && nextSig === bellStaffSummarySig && list.children && list.children.length) {
      try {
        paintNotifBellBadgeFromStore();
      } catch (eBadgeSkip) {}
      return;
    }
    bellStaffSummarySig = nextSig;
    var keepOpen = Object.create(null);
    try {
      list.querySelectorAll(".vc-notif-bell-inbox__row.is-open[data-bell-inbox]").forEach(function (el) {
        var id = String(el.getAttribute("data-bell-inbox") || "").trim();
        if (id) keepOpen[id] = true;
      });
    } catch (eKeep) {}
    /* notifBellStable1: se già settled, apri SOLO keepOpen (mai unread auto) */
    var allowAutoUnread = !bellStaffCatsSettled;
    list.innerHTML = "";
    try {
      var subHead = document.getElementById("vc-notif-unread-sub");
      if (subHead && bellNotifScope === "staff") {
        subHead.textContent = formatUnreadSub(countInboxUnreadNotifs());
      }
    } catch (eSubH) {}

    function appendInboxNotifCategory(cat) {
      var items = inboxNotifsForBucket(cat.id);
      if (!items.length && cat.id !== "avvisi") return;
      if (!items.length) return;
      var li = document.createElement("li");
      li.className = "vc-notif-bell-inbox__row has-count";
      li.setAttribute("data-bell-inbox", cat.id);
      var unreadA = items.filter(function (x) {
        return !x.read;
      }).length;
      /* notifBellStable1 / notifSheetScopeFix1 */
      var startOpen =
        Boolean(keepOpen[cat.id]) ||
        (allowAutoUnread && unreadA > 0 && !bellUserCollapsedCats["i:" + cat.id]);
      var itemsHost = document.createElement("ul");
      itemsHost.className = "vc-notif-bell-inbox__items";
      itemsHost.setAttribute("role", "list");
      if (!startOpen) {
        itemsHost.hidden = true;
        itemsHost.setAttribute("hidden", "");
      }
      items.slice(0, 12).forEach(function (n) {
        var item = document.createElement("li");
        item.className =
          "vc-notif-bell-inbox__item vc-notif-bell-inbox__item--rich" + (n.read ? "" : " is-unread");
        var a = document.createElement("a");
        a.className = "vc-notif-bell-inbox__item-link vc-notif-bell-inbox__item-link--rich";
        var dest = String(n.openUrl || "").trim();
        a.href = dest ? resolveNotifDestUrl(dest) : notificationsStaffPageUrl("", "");
        var bodySnip = String(n.body || "").trim().slice(0, 110);
        var whenTxt = timeAgoLocalized(n.at || Date.now());
        a.innerHTML =
          '<span class="vc-notif-bell-inbox__item-dot" aria-hidden="true"></span>' +
          '<span class="vc-notif-bell-inbox__item-copy">' +
          '<span class="vc-notif-bell-inbox__item-label">' +
          escBellHtml(String(n.title || cat.label)) +
          "</span>" +
          (bodySnip
            ? '<span class="vc-notif-bell-inbox__item-sub">' + escBellHtml(bodySnip) + "</span>"
            : "") +
          '<span class="vc-notif-bell-inbox__item-time">' +
          escBellHtml(whenTxt) +
          "</span>" +
          "</span>" +
          (!n.read
            ? '<span class="vc-notif-bell-inbox__item-badge is-pending" aria-label="In attesa"></span>'
            : "");
        a.addEventListener("click", function (ev) {
          ev.preventDefault();
          try {
            markOneRead(n.id);
          } catch (eMark) {}
          navigateBellInboxHref(a.href);
        });
        item.appendChild(a);
        itemsHost.appendChild(item);
      });
      var catBar = buildNotifCategoryBar({
        toggleClass: "vc-notif-bell-inbox__toggle",
        toggleHtml:
          '<span class="vc-notif-bell-inbox__ico" aria-hidden="true"><i class="fa ' +
          cat.ico +
          '"></i></span>' +
          '<span class="vc-notif-bell-inbox__label">' +
          escBellHtml(cat.label) +
          "</span>",
        countHtml:
          '<span class="vc-notif-bell-inbox__count' +
          (unreadA ? " vc-notif-bell-inbox__count--new" : "") +
          '">' +
          String(items.length) +
          (unreadA ? " · " + unreadA : "") +
          "</span>",
        clearCatId: cat.id,
        clearScope: "inbox",
        clearAriaLabel: "Elimina tutte in " + cat.label,
        onClear: function () {
          clearNotifCategory(cat.id, "inbox");
        },
        onToggleClick: function (ev) {
          ev.preventDefault();
          var open = !li.classList.contains("is-open");
          li.classList.toggle("is-open", open);
          catBar.bar.classList.toggle("is-open", open);
          catBar.toggle.classList.toggle("is-open", open);
          catBar.toggle.setAttribute("aria-expanded", open ? "true" : "false");
          itemsHost.hidden = !open;
          if (open) {
            itemsHost.removeAttribute("hidden");
            try {
              delete bellUserCollapsedCats["i:" + cat.id];
            } catch (eOp) {}
          } else {
            itemsHost.setAttribute("hidden", "");
            bellUserCollapsedCats["i:" + cat.id] = 1;
          }
        },
      });
      var bar = catBar.bar;
      var btn = catBar.toggle;
      if (startOpen) {
        li.classList.add("is-open");
        bar.classList.add("is-open");
        btn.classList.add("is-open");
        btn.setAttribute("aria-expanded", "true");
        itemsHost.hidden = false;
        itemsHost.removeAttribute("hidden");
      }
      li.appendChild(bar);
      li.appendChild(itemsHost);
      list.appendChild(li);
    }

    INBOX_NOTIF_CATS.forEach(appendInboxNotifCategory);

    var total = 0;
    var visible = 0;
    var ptNotifs = inboxNotifsForBucket("punti-tolti");
    var pendingQueueLoads = [];
    BELL_INBOX_ROWS.forEach(function (row) {
      if (!canBellInboxRow(row)) return;
      visible += 1;
      var count = Number(sum[row.id] || 0) || 0;
      if (
        (row.punti || row.id === "punti-tolti") &&
        !sum[row.id] &&
        bellStaffQueueCache[row.id] &&
        Array.isArray(bellStaffQueueCache[row.id].items)
      ) {
        count = bellStaffQueueCache[row.id].items.length;
      }
      if (row.id === "punti-tolti") count += ptNotifs.length;
      total += count;
      var li = document.createElement("li");
      li.className = "vc-notif-bell-inbox__row" + (count > 0 ? " has-count" : "");
      li.setAttribute("data-bell-inbox", row.id);

      var itemsHost = document.createElement("ul");
      itemsHost.className = "vc-notif-bell-inbox__items";
      itemsHost.id = "vc-notif-bell-inbox-items-" + row.id;
      itemsHost.setAttribute("role", "list");
      /* notifInboxTapFix1: code staff restano chiuse finché tap —
         auto-open di tutte le code pending faceva wipe+fetch storm e freeze. */
      var startOpenQ = Boolean(keepOpen[row.id]);
      if (!startOpenQ) {
        itemsHost.hidden = true;
        itemsHost.setAttribute("hidden", "");
      }

      var catBarOpts = {
        toggleClass: "vc-notif-bell-inbox__toggle",
        ariaControls: "vc-notif-bell-inbox-items-" + row.id,
        toggleHtml:
          '<span class="vc-notif-bell-inbox__ico" aria-hidden="true"><i class="fa ' +
          row.icon +
          '"></i></span>' +
          '<span class="vc-notif-bell-inbox__label">' +
          escBellHtml(row.label) +
          "</span>",
        countHtml:
          '<span class="vc-notif-bell-inbox__count' +
          (count > 0 ? " vc-notif-bell-inbox__count--new" : "") +
          '">' +
          (count > 99 ? "99+" : String(count)) +
          "</span>",
        onToggleClick: function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          try {
            if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
          } catch (eStopT) {}
          toggleBellInboxSection(row, catBar.toggle, itemsHost);
        },
      };
      if (row.id === "punti-tolti" && ptNotifs.length) {
        catBarOpts.clearCatId = "punti-tolti";
        catBarOpts.clearScope = "inbox";
        catBarOpts.clearTitle = "Elimina notifiche Punti tolti";
        catBarOpts.clearAriaLabel = "Elimina notifiche Punti tolti";
        catBarOpts.onClear = function () {
          clearNotifCategory("punti-tolti", "inbox");
        };
      }
      var catBar = buildNotifCategoryBar(catBarOpts);
      /* notifQueueFast1: tap anche sulla bar (count/chev) → toggle, non fall-through */
      try {
        catBar.bar.addEventListener("click", function (ev) {
          if (ev.target && ev.target.closest && ev.target.closest(".vc-notif-cat-clear")) return;
          ev.preventDefault();
          ev.stopPropagation();
          try {
            if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
          } catch (eBar) {}
          toggleBellInboxSection(row, catBar.toggle, itemsHost);
        });
      } catch (eBindBar) {}
      if (startOpenQ) {
        li.classList.add("is-open");
        catBar.bar.classList.add("is-open");
        catBar.toggle.classList.add("is-open");
        catBar.toggle.setAttribute("aria-expanded", "true");
      }
      li.appendChild(catBar.bar);
      li.appendChild(itemsHost);
      list.appendChild(li);
      if (startOpenQ) {
        var cachedQ = bellStaffQueueCache[row.id];
        if (cachedQ && cachedQ.ok !== false && Array.isArray(cachedQ.items)) {
          try {
            renderBellInboxItems(row, itemsHost, cachedQ.items);
            itemsHost.setAttribute("data-loaded", "1");
          } catch (eCachePaint) {
            pendingQueueLoads.push({ row: row, host: itemsHost, toggle: catBar.toggle });
          }
        } else {
          pendingQueueLoads.push({ row: row, host: itemsHost, toggle: catBar.toggle });
        }
      }
    });
    pendingQueueLoads.forEach(function (job) {
      try {
        toggleBellInboxSection(job.row, job.toggle, job.host, true);
      } catch (eLoadQ) {}
    });
    if (hint) {
      /* notifCats3: categories with 0 are enough — no empty-copy / sleeping disc. */
      hint.textContent = "";
      hint.hidden = true;
      hint.setAttribute("hidden", "");
    }
    bellStaffCatsSettled = true;
    void total;
    void visible;
  }

  function loadBellStaffInboxSummary(force) {
    ensureNotifBellScopeUi();
    var paintStaffList = bellNotifScope === "staff";
    var cached = readCachedBellStaffSummary();
    if (cached && cached.permissions) bellStaffPerms = cached.permissions;
    if (cached && cached.summary) {
      /* notifInboxTapFix1: wipe lista staff solo se Inbox visibile (evita thrash su Personali) */
      if (paintStaffList) renderBellStaffInbox(cached.summary);
      try {
        paintNotifBellBadgeFromStore();
      } catch (eBadgeCached) {}
    } else if (paintStaffList) {
      /* bellInboxEmptyFix1: paint immediato (code a 0) — niente pannello vuoto in attesa del fetch */
      renderBellStaffInbox({});
      try {
        var hintLoad = document.getElementById("vc-notif-bell-inbox-hint");
        if (hintLoad) {
          hintLoad.hidden = false;
          hintLoad.removeAttribute("hidden");
          hintLoad.textContent = "Caricamento inbox staff…";
        }
      } catch (eHintLoad) {}
    }
    if (!force && bellStaffSummaryAt && Date.now() - bellStaffSummaryAt < 60000 && cached) {
      return Promise.resolve(cached);
    }
    var token = getDiscordAccessToken();
    if (!token) {
      if (paintStaffList) {
        renderBellStaffInbox({});
        var hint = document.getElementById("vc-notif-bell-inbox-hint");
        if (hint) {
          hint.hidden = false;
          hint.removeAttribute("hidden");
          hint.textContent = "Accedi per vedere l'inbox staff.";
        }
      }
      return Promise.resolve(null);
    }
    if (bellStaffSummaryInFlight) return bellStaffSummaryInFlight;
    var api = staffWorkflowsApiBase();
    var url = api + (api.indexOf("?") >= 0 ? "&" : "?") + "queue=summary";
    var summaryHeaders = { Authorization: "Bearer " + token, Accept: "application/json" };
    if (bellStaffSummaryEtag) summaryHeaders["If-None-Match"] = bellStaffSummaryEtag;
    /* notifUnifyFix1: timeout — niente “Caricamento…” eterno su /tickets/ */
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var abortTimer = window.setTimeout(function () {
      try {
        if (ctrl) ctrl.abort();
      } catch (eAb) {}
    }, 9000);
    var fetchOpts = {
      method: "GET",
      credentials: "include",
      headers: summaryHeaders,
      cache: "no-store",
    };
    if (ctrl) fetchOpts.signal = ctrl.signal;
    bellStaffSummaryInFlight = fetch(url, fetchOpts)
      .then(function (res) {
        if (res && res.status === 304) {
          return { ok: true, body: cached || { ok: true, summary: {} }, notModified: true };
        }
        var etagHdr = "";
        try {
          etagHdr = String((res && res.headers && res.headers.get("ETag")) || "").trim();
        } catch (eEt) {
          etagHdr = "";
        }
        return res
          .json()
          .catch(function () {
            return null;
          })
          .then(function (body) {
            if (body && etagHdr) body.__etag = etagHdr;
            return { ok: res.ok, body: body };
          });
      })
      .then(function (out) {
        bellStaffSummaryAt = Date.now();
        if (out && out.notModified) return cached || out.body;
        if (!out || !out.body || !out.body.ok || !out.body.summary) {
          if (!cached && bellNotifScope === "staff") renderBellStaffInbox({});
          return null;
        }
        if (out.body.__etag) bellStaffSummaryEtag = out.body.__etag;
        if (out.body.permissions) bellStaffPerms = out.body.permissions;
        try {
          var cachePayload = {
            summary: out.body.summary,
            permissions: out.body.permissions || null,
            at: Date.now(),
          };
          sessionStorage.setItem("vc_inbox_summary_v1", JSON.stringify(cachePayload));
          localStorage.setItem("vc_inbox_summary_local_v1", JSON.stringify(cachePayload));
          window.__VC_INBOX_SUMMARY_PREFETCH = out.body;
        } catch (eStore) {}
        /* notifInboxTapFix1: aggiorna DOM staff solo se Inbox è la vista attiva */
        if (bellNotifScope === "staff") renderBellStaffInbox(out.body.summary);
        try {
          paintNotifBellBadgeFromStore();
        } catch (eBadge) {}
        return out.body;
      })
      .catch(function () {
        if (!cached) {
          var hintErr = document.getElementById("vc-notif-bell-inbox-hint");
          if (hintErr) {
            hintErr.hidden = false;
            hintErr.removeAttribute("hidden");
            hintErr.textContent = "Impossibile caricare l'inbox staff.";
          }
          renderBellStaffInbox({});
        }
        return null;
      })
      .finally(function () {
        try {
          clearTimeout(abortTimer);
        } catch (eClr) {}
        bellStaffSummaryInFlight = null;
        try {
          var hintFin = document.getElementById("vc-notif-bell-inbox-hint");
          if (hintFin && /Caricamento inbox staff/i.test(String(hintFin.textContent || ""))) {
            hintFin.textContent = "";
            hintFin.hidden = true;
            hintFin.setAttribute("hidden", "");
          }
        } catch (eHintFin) {}
      });
    return bellStaffSummaryInFlight;
  }

  function wireNotifMobileSheet() {
    var dd = document.getElementById("vc-notif-dropdown");
    if (!dd) return false;
    try {
      window.__VC_NOTIF_CHROME_OWNER = "landing";
    } catch (eOwn) {}
    ensureNotifBellScopeUi();
    /* notifChromeUnify2: se shared chrome ha gia' primed il summary, non raddoppiare click;
       ma il toggle landing (markAllRead / scope) deve restare. */
    if (!dd.__vcNotifLandingToggleWired) {
      dd.__vcNotifLandingToggleWired = true;
      dd.addEventListener("toggle", function () {
        if (dd.open) holdPageScroll(220);
        scheduleNotifSheetChromeSync({ delayMs: 0 });
        if (dd.open) {
          /* notifCatLoadFix1: reclaim/spurious toggle NON resetta Inbox→Personali */
          if (notifSheetSessionActive) {
            try {
              syncNotifBellScopeChrome();
            } catch (eKeepScope) {}
            return;
          }
          notifSheetSessionActive = true;
          markAllReadOnBellOpen();
          syncPushPromptUi();
          maybeAskNativePush();
          setBellNotifScope(resolveInitialBellScope({ fromBellOpen: true }), {
            source: "open",
            silent: true,
            remember: false,
          });
          try {
            syncNotifBellScopeChrome();
          } catch (eBellChrome) {}
          /* notifPendingBoot1 / notifInboxTapFix1: sync soft all'open —
             niente force summary+render (doppia anim + wipe Inbox). */
          try {
            if (normalizeUserId(currentUserId) && getDiscordAccessToken()) {
              syncSiteNotificationsFromServer({ force: false, full: false });
            }
          } catch (eSyncOpen) {}
          try {
            if (canBellStaffInbox()) loadBellStaffInboxSummary(false);
          } catch (eSumOpen) {}
        } else {
          /* notifBellStayOpen1: overflow-lock / portal sync can spurious-close <details>
             within the open guard — reclaim instead of tearing down. */
          if (Date.now() < notifPortalGuardUntil) {
            try {
              dd.open = true;
              dd.setAttribute("open", "");
            } catch (eReOpen) {}
            scheduleNotifSheetChromeSync({ delayMs: 0 });
            return;
          }
          notifSheetSessionActive = false;
          notifPortalGuardUntil = 0;
          syncPushPromptUi();
          ensureNotifDropdownInHeader(true);
          restoreNotifScrollAfterClose();
          clearStuckNotifDrawerPrime();
        }
      });
    }
    /* notifPhoneOpen2: click landing SEMPRE, anche se chrome ha già wired
       (prima __vcNotifSheetWired/PrimeWired di chrome lasciavano tap telefono = flash nativo). */
    (function wireLandingBellClick() {
      var summary = dd.querySelector("summary.vc-notif-summary, summary");
      if (!summary || summary.__vcNotifLandingClickWired) return;
      summary.__vcNotifLandingClickWired = true;
      summary.addEventListener(
        "pointerdown",
        function () {
          var live = document.getElementById("vc-notif-dropdown") || dd;
          /* notifAutoCloseFix1: se gia' open, NON azzerare portalGuard */
          if (!live || live.open) return;
          try {
            notifScrollAnchorY = pageScrollY();
          } catch (eY) {}
          /* notifPhoneOpen3: no sheet-open pre-click on mobile */
          primeDesktopNotifDrawer(live, { fromPointer: true });
          window.setTimeout(function () {
            try {
              var again = document.getElementById("vc-notif-dropdown");
              if (!again || again.open) return;
              clearStuckNotifDrawerPrime();
            } catch (eClr) {}
          }, 320);
        },
        true,
      );
      summary.addEventListener(
        "keydown",
        function (ev) {
          if (ev.key !== "Enter" && ev.key !== " ") return;
          var live = document.getElementById("vc-notif-dropdown") || dd;
          /* notifAutoCloseFix1: se gia' open, NON azzerare portalGuard */
          if (!live || live.open) return;
          primeDesktopNotifDrawer(live);
        },
        true,
      );
      summary.addEventListener(
        "click",
        function (ev) {
          try {
            if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
            if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
            if (ev && typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
          } catch (ePrev) {}
          var live = document.getElementById("vc-notif-dropdown") || dd;
          if (!live) return;
          /* notifDoubleClose1: one gesture → one toggle (blocks touch+click / ghost reopen). */
          var nowMs = Date.now();
          if (nowMs < notifBellGestureLockUntil) return;
          try {
            if (typeof window.__vcSheetCloseGuarded === "function" && window.__vcSheetCloseGuarded()) {
              return;
            }
          } catch (eGuard) {}
          notifBellGestureLockUntil = nowMs + 420;
          if (live.open) {
            notifPortalGuardUntil = 0;
            requestCloseNotifDropdown(live);
            scheduleNotifSheetChromeSync({ delayMs: 0 });
            return;
          }
          openNotifSheetSmooth(live);
        },
        true,
      );
      dd.__vcNotifSheetWired = true;
    })();
    try {
      if (window.VcNotifChrome && typeof window.VcNotifChrome.ensure === "function") {
        window.VcNotifChrome.ensure();
      }
    } catch (eEnsChrome) {}
    if (!notifSheetResizeWired) {
      notifSheetResizeWired = true;
      window.addEventListener("resize", function () {
        syncNotifMobileSheetChrome();
        var liveDd = document.getElementById("vc-notif-dropdown");
        if (!liveDd || !liveDd.open) {
          ensureNotifDropdownInHeader(true);
          restoreNotifScrollAfterClose();
        }
      });
      window.addEventListener("pageshow", function () {
        /* notifSidebar4: soft repair — keep drawer open across bfcache/app switch. */
        repairNotifDropdownPortal();
        var liveDd = document.getElementById("vc-notif-dropdown");
        if (!liveDd || !liveDd.open) restoreNotifScrollAfterClose();
      });
      /* notifSidebar4: do NOT close drawer on visibilitychange (tab hide / app background). */
    }
    if (!notifSheetEscWired) {
      notifSheetEscWired = true;
      document.addEventListener("keydown", function (ev) {
        if (ev.key !== "Escape") return;
        var live = document.getElementById("vc-notif-dropdown");
        if (!live || !live.open) return;
        notifBellGestureLockUntil = Date.now() + 420;
        requestCloseNotifDropdown(live);
        scheduleNotifSheetChromeSync({ delayMs: 0 });
      });
    }
    var head = dd.querySelector(".vc-notif-panel-head");
    if (head) {
      /* notifCloseDedup1: togli doppioni prima di crearne uno */
      try {
        var dups = head.querySelectorAll(".vc-notif-close-mobile, #vc-notif-close-mobile");
        for (var di = 1; di < dups.length; di++) {
          try {
            dups[di].remove();
          } catch (eDup) {}
        }
      } catch (eDupAll) {}
    }
    /* notifSheetUnifyPhone1: assicurati head-actions + clear-all + close a destra */
    var headActions = head ? head.querySelector(".vc-notif-panel-head-actions") : null;
    if (head && !headActions) {
      headActions = document.createElement("div");
      headActions.className = "vc-notif-panel-head-actions";
      head.appendChild(headActions);
    }
    if (headActions && !document.getElementById("vc-notif-clear-all")) {
      var clearAllMissing = document.createElement("button");
      clearAllMissing.type = "button";
      clearAllMissing.className = "vc-notif-action";
      clearAllMissing.id = "vc-notif-clear-all";
      clearAllMissing.title = "Elimina tutte";
      clearAllMissing.setAttribute("aria-label", "Elimina tutte");
      clearAllMissing.setAttribute("data-i18n-title", "notif.clearAll");
      clearAllMissing.setAttribute("data-i18n-attr", "aria-label:notif.clearAll");
      clearAllMissing.innerHTML = '<i class="fa fa-trash-o" aria-hidden="true"></i>';
      headActions.appendChild(clearAllMissing);
    }
    try {
      bindClearAllButton();
    } catch (eBindClr) {}
    if (head && !head.querySelector(".vc-notif-close-mobile")) {
      var closeM = document.createElement("button");
      closeM.type = "button";
      closeM.id = "vc-notif-close-mobile";
      closeM.className = "vc-notif-action vc-notif-close-mobile";
      closeM.setAttribute(
        "aria-label",
        window.VcI18n && typeof window.VcI18n.t === "function" ? window.VcI18n.t("notif.close") : "Chiudi",
      );
      closeM.innerHTML = '<i class="fa fa-times" aria-hidden="true"></i>';
      var closeBtnLockUntil = 0;
      var closeFromBtn = function (ev) {
        var now = Date.now();
        if (now < closeBtnLockUntil) return;
        closeBtnLockUntil = now + 480;
        try {
          if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
          if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
        } catch (ePrev) {}
        notifBellGestureLockUntil = Date.now() + 420;
        requestCloseNotifDropdown(document.getElementById("vc-notif-dropdown") || dd);
        scheduleNotifSheetChromeSync({ delayMs: 0 });
      };
      closeM.addEventListener("pointerup", closeFromBtn);
      closeM.addEventListener("click", closeFromBtn);
      if (headActions) headActions.appendChild(closeM);
      else head.appendChild(closeM);
    } else if (head && headActions) {
      /* sposta X dentro actions (destra) se era finita fuori */
      var closeLive = head.querySelector(".vc-notif-close-mobile");
      if (closeLive && closeLive.parentNode !== headActions) {
        headActions.appendChild(closeLive);
      }
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
    wireNotifSeeAllNav();
    bindClearAllButton();
    removeMarkAllButton();
    try {
      /* notifMobileSwitch1: late staff gate must reveal Personali|Inbox on open bell too. */
      syncNotifBellScopeChrome();
    } catch (eScopeLate) {}
    /* notifPendingBoot1: prefetch summary non appena staff ok (badge rosso senza aprire Inbox) */
    try {
      if (canBellStaffInbox()) loadBellStaffInboxSummary();
    } catch (ePrefetch) {}
    if (!had) return;
    lastNotifRenderSig = "";
    render({ force: true });
    if (normalizeUserId(currentUserId) && getDiscordAccessToken()) {
      scheduleSiteNotificationsPolling();
    }
  }

  function deferAfterFirstPaint(fn, fallbackMs) {
    var done = false;
    function run() {
      if (done) return;
      done = true;
      try {
        fn();
      } catch (eDef) {}
    }
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(run, { timeout: fallbackMs || 2800 });
    } else {
      window.setTimeout(run, fallbackMs || 900);
    }
  }

  function init() {
    ensureSiteNotifDropdown();
    setCurrentUser(window.__VC_DISCORD_PROFILE || null);
    render();
    syncGlobalNotifOverlayClass();
    document.addEventListener("pointerdown", unlockNotifAudio, true);
    document.addEventListener("keydown", unlockNotifAudio, true);
    wireNotifMobileSheet();
    wireNotifListClicks();
    ensureNotifSeeAllLink();
    wireNotifSeeAllNav();
    removeMarkAllButton();
    bindClearAllButton();
    window.addEventListener("vc:staff-access-ok", ensureStaffLateNotifUi);
    window.addEventListener("vc:staff-notif-ready", ensureStaffLateNotifUi);
    window.vcNotify = { add: addNotif, refresh: render, clearAll: clearAll };
    flushPendingLoginNotification();
    migrateUnreadKeep1PendingClear();
    /* notifUnifyFix1: push-cold / mark-read subito (non dopo 2.6s idle) */
    try {
      consumeNotifReadFromUrl();
      consumePendingReadFromSwCache();
      consumePendingNavFromSwCache();
      startPendingNavPoll();
      markNotificationsForCurrentPage();
    } catch (eEarly) {}
    /* pushReuseClient1: PWA pageshow (focus da click push) — ritenta pending se boot l’ha perso */
    try {
      window.addEventListener("pageshow", function () {
        try {
          window.__vcPendingNavCacheDone = 0;
        } catch (eClr) {}
        try {
          consumePendingNavFromSwCache();
        } catch (ePs) {}
      });
    } catch (ePageShow) {}
    deferAfterFirstPaint(function () {
      wirePushNotifMarkRead();
      wirePushPermissionWatch();
      wirePushAutoRecover();
      consumePendingNavFromSwCache();
      startPendingNavPoll();
      wireSwClientFocusPing();
      flushPendingReadsToServer();
      tryFlushClickReads();
      syncPushPromptUi();
      markNotificationsForCurrentPage();
      if (normalizeUserId(currentUserId) && getDiscordAccessToken()) {
        scheduleSiteNotificationsPolling();
        /* notifSheetScopeFix1: summary staff al boot per badge pending (cache o fetch) */
        try {
          if (canBellStaffInbox()) {
            if (readCachedBellStaffSummary()) paintNotifBellBadgeFromStore();
            loadBellStaffInboxSummary(false);
          }
        } catch (eBootSum) {}
        if (webPushSupported()) {
          /* console429Kill1: delay vapid/SW su telefono (storm boot).
             desktopPushCatchup1: su PC sync subito così WNS flusha i push in coda. */
          window.setTimeout(function () {
            prefetchPushPrereqs().then(function () {
              syncExistingWebPushSubscription();
            });
          }, pushBootSyncDelayMs());
          if (!isMobilePushClient()) armDesktopPushCatchup("boot");
        } else {
          syncExistingWebPushSubscription();
        }
      } else if (isViewAsLogoutMode() && webPushSupported()) {
        /* pushLogoutMute1: se già in view-as logout al boot → stacca push di questo browser */
        window.setTimeout(function () {
          detachCurrentWebPushSubscription({ useRawToken: true });
        }, 1200);
      }
    }, 900);
    window.addEventListener("pageshow", function (ev) {
      /* notifPendingToastNoFlash1: re-arm solo su bfcache, non a ogni pageshow/poll */
      if (ev && ev.persisted) {
        clearNotifPendingToastSessionGate();
        notifIgPendingShownPath = "";
      }
      consumeNotifReadFromUrl();
      consumePendingReadFromSwCache();
      consumePendingNavFromSwCache();
      startPendingNavPoll();
      clearMobileOsToastsOnAppOpen();
      markNotificationsForCurrentPage();
      if (normalizeUserId(currentUserId) && getDiscordAccessToken()) {
        syncExistingWebPushSubscription();
        try {
          maybeShowPendingUnreadIgToast();
        } catch (ePendPs) {}
      }
    });
    window.addEventListener("popstate", function () {
      markNotificationsForCurrentPage();
    });
    window.addEventListener("hashchange", function () {
      markNotificationsForCurrentPage();
    });
    /* pushVisitDismiss1: replaceState/pushState (inbox tab, soft open) non sparano popstate */
    try {
      if (!window.__vcNotifHistoryMarkWired) {
        window.__vcNotifHistoryMarkWired = 1;
        var histMarkTimer = 0;
        function scheduleHistMark() {
          if (histMarkTimer) window.clearTimeout(histMarkTimer);
          histMarkTimer = window.setTimeout(function () {
            histMarkTimer = 0;
            try {
              markNotificationsForCurrentPage();
            } catch (eHm) {}
          }, 80);
        }
        var _push = history.pushState;
        var _repl = history.replaceState;
        if (typeof _push === "function") {
          history.pushState = function () {
            var ret = _push.apply(this, arguments);
            scheduleHistMark();
            return ret;
          };
        }
        if (typeof _repl === "function") {
          history.replaceState = function () {
            var ret = _repl.apply(this, arguments);
            scheduleHistMark();
            return ret;
          };
        }
      }
    } catch (eHistWire) {}
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") {
        pageHiddenSinceAt = Date.now();
        return;
      }
      if (document.visibilityState === "visible") {
        clearMobileOsToastsOnAppOpen();
        var hiddenFor = pageHiddenSinceAt ? Date.now() - pageHiddenSinceAt : 0;
        pageHiddenSinceAt = 0;
        /* desktopPushCatchup1: dopo sleep/accensione PC (>45s) risveglia push + catchup OS subito */
        if (!isMobilePushClient() && hiddenFor >= 45000) {
          armDesktopPushCatchup("wake");
          try {
            syncExistingWebPushSubscription();
          } catch (eWakePush) {}
        }
        /* notifPushBellCatchup1: al ritorno tab → full sync (prima min-gap lasciava badge stale) */
        syncSiteNotificationsFromServer({ force: true, full: true });
        markNotificationsForCurrentPage();
        if (normalizeUserId(currentUserId) && getDiscordAccessToken()) {
          syncExistingWebPushSubscription();
        }
      }
    });
  }
  window.addEventListener("vc-discord-profile", function (ev) {
    var prevUid = normalizeUserId(currentUserId);
    setCurrentUser(ev && ev.detail ? ev.detail.user : null);
    lastNotifRenderSig = "";
    var nextUid = normalizeUserId(currentUserId);
    /* notifPendingToastNoFlash1: reset gate solo se cambia utente */
    if (prevUid !== nextUid) notifIgPendingShownPath = "";
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
      try {
        maybeShowPendingUnreadIgToast();
      } catch (ePendProf) {}
      window.setTimeout(function () {
        prefetchPushPrereqs().then(function () {
          syncExistingWebPushSubscription();
        });
      }, pushProfileSyncDelayMs());
      if (!isMobilePushClient()) armDesktopPushCatchup("profile");
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
    /* perfBgRam1: background → stop WS + poll; ritorno → reconnect soft */
    if (document.visibilityState !== "visible") {
      try {
        disconnectSiteRealtimeWs();
      } catch (eWsOff) {}
      try {
        stopSiteNotifsPoll();
      } catch (ePollOff) {}
      return;
    }
    restartSiteNotifsPollTimer();
    try {
      var wsUrl = siteRealtimeWsUrl();
      var rs = siteRealtimeWs ? siteRealtimeWs.readyState : 3;
      if (wsUrl && rs !== 0 && rs !== 1) connectSiteRealtimeWebSocket();
    } catch (eWsOn) {}
    if (siteNotifsVisibilityTimer) clearTimeout(siteNotifsVisibilityTimer);
    siteNotifsVisibilityTimer = setTimeout(function () {
      siteNotifsVisibilityTimer = null;
      syncSiteNotificationsFromServer({ force: true, full: true });
    }, 120);
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
  document.addEventListener("visibilitychange", function () {
    try {
      if (document.hidden || document.visibilityState === "hidden") return;
      if (!window.__vcNotifPeerSyncWhenVisible) return;
      window.__vcNotifPeerSyncWhenVisible = 0;
      onNotifStorePeerSync();
    } catch (eVisPeer) {}
  });
  /* handlerPerf1 marker */
  try {
    window.__vcPushDetachForLogout = function () {
      return detachCurrentWebPushSubscription({ useRawToken: true });
    };
  } catch (eExp) {}
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

/* console429Kill1 / pushLogoutMute1 */
/* notifSheetSync1 */
/* inboxNoDirector1 */

