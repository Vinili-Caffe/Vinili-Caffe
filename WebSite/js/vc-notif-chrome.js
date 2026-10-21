/**
 * notifCloseGuard1: close X deve azzerare portalGuard (altrimenti sync riapre entro 700ms).
 * sheetGhostClose2: dopo close backdrop, swallow click fantasma (riapertura in loop).
 * notifChromeUnify2: stesso sheet/drawer ovunque.
 * bellScopeAll1: Personali|Inbox anche senza vc-landing.js (drawer/sheet).
 * bellScopeNoReset1: syncChrome NON forza Personali (bloccava Inbox su resize/rAF).
 * notifPhoneOpen2: NON marcare __vcNotifSheetWired/PrimeWired di landing
 *   (chrome che wirea prima lasciava click no-op + flash nativo su telefono).
 * notifPhoneOpen3: su mobile NON prime sheet-open al pointerdown (nasconde bell → iOS drop click).
 * notifSheetSmooth1: portal prima di open + una sola anim; no remount scope a sheet aperto.
 * notifBellStayOpen1: reclaim spurious <details> close during portal/overflow-lock.
 * notifSheetAlign1: mai reclaim in header mentre open (stesso sheet/drawer ovunque).
 * notifAutoCloseFix1: grace post-open (ignore backdrop/outside) + non azzerare portalGuard
 *   su pointerdown se gia' open; reclaim ripristina anche le classi sheet/drawer.
 * Document-capture sync sempre attivo (anche se landing "possiede" la bell).
 */
(function () {
  var VER = "20261021notifBellLiveFix1";
  /* notifBellLiveFix1: primo open non mangiare da gesture-lock */
  /* notifSheetUnifyAll1 */
  /* notifSheetStayOpen1: grace=portalGuard; outside close non combatte reclaim */
  /* notifSheetUnifyGuard1: sync portalGuard chrome↔landing + switcher unificato */
  /* notifSheetScopeActive6: paint Personali|Inbox + VER allineata a discord-auth */
  /* notifSheetLock3: inline overflow+bordo (batte hideScrollGutter / wash transparent) */
  /* notifSheetLock4: keepAlive + style pin (hideScrollGutter/profileRelockKill battevano) */
  /* notifSheetLock4b: pin in coda al DOM + keepAlive 120ms + wheel/touch guard */
  /* notifSheetLock4d: trap removeProperty overflow mentre sheet aperto */
  if (window.VcNotifChrome && window.VcNotifChrome.ver === VER) return;
  window.VcNotifChrome = { ver: VER };
  var sheetLockKeepTimer = 0;
  var sheetWheelGuardBound = false;
  var overflowTrapArmed = false;
  var overflowTrapOrig = null;
  var overflowTrapBodyOrig = null;

  function sheetChromeOpenNow() {
    try {
      var root = document.documentElement;
      var dd = document.getElementById("vc-notif-dropdown");
      return Boolean(
        dd &&
          dd.open &&
          (root.classList.contains("vc-notif-sheet-open") ||
            root.classList.contains("vc-notif-drawer-open")),
      );
    } catch (eOpen) {
      return false;
    }
  }

  function armOverflowTrap() {
    if (overflowTrapArmed) return;
    try {
      var root = document.documentElement;
      var body = document.body;
      if (!root || !root.style || typeof root.style.removeProperty !== "function") return;
      overflowTrapOrig = root.style.removeProperty.bind(root.style);
      root.style.removeProperty = function (prop) {
        try {
          if (
            sheetChromeOpenNow() &&
            prop &&
            /^(overflow|overflow-x|overflow-y|overscroll-behavior|overscroll-behavior-y)$/i.test(
              String(prop),
            )
          ) {
            return "";
          }
        } catch (eSkip) {}
        return overflowTrapOrig(prop);
      };
      if (body && body.style && typeof body.style.removeProperty === "function") {
        overflowTrapBodyOrig = body.style.removeProperty.bind(body.style);
        body.style.removeProperty = function (prop) {
          try {
            if (
              sheetChromeOpenNow() &&
              prop &&
              /^(overflow|overflow-x|overflow-y|overscroll-behavior)$/i.test(String(prop))
            ) {
              return "";
            }
          } catch (eSkipB) {}
          return overflowTrapBodyOrig(prop);
        };
      }
      overflowTrapArmed = true;
    } catch (eArm) {}
  }

  function disarmOverflowTrap() {
    if (!overflowTrapArmed) return;
    try {
      var root = document.documentElement;
      if (root && overflowTrapOrig) root.style.removeProperty = overflowTrapOrig;
      var body = document.body;
      if (body && overflowTrapBodyOrig) body.style.removeProperty = overflowTrapBodyOrig;
    } catch (eDis) {}
    overflowTrapOrig = null;
    overflowTrapBodyOrig = null;
    overflowTrapArmed = false;
  }

  function sheetWheelGuard(e) {
    try {
      var root = document.documentElement;
      if (
        !root.classList.contains("vc-notif-sheet-open") &&
        !root.classList.contains("vc-notif-drawer-open")
      ) {
        return;
      }
      var t = e.target;
      if (t && t.closest) {
        var scrollable = t.closest(
          ".vc-notif-panel-body, .vc-notif-list, .vc-notif-list-wrap, .vc-notif-bell-pane, .vc-notif-bell-inbox",
        );
        if (scrollable) {
          if (e.type === "touchmove") return;
          var dy = Number(e.deltaY) || 0;
          var canY =
            scrollable.scrollHeight > scrollable.clientHeight + 1 &&
            ((dy < 0 && scrollable.scrollTop > 0) ||
              (dy > 0 &&
                scrollable.scrollTop + scrollable.clientHeight < scrollable.scrollHeight - 1) ||
              dy === 0);
          if (canY || dy === 0) return;
        }
      }
      e.preventDefault();
    } catch (eGuard) {}
  }

  function bindSheetWheelGuard(on) {
    var want = Boolean(on);
    if (want === sheetWheelGuardBound) return;
    try {
      if (want) {
        document.addEventListener("wheel", sheetWheelGuard, { capture: true, passive: false });
        document.addEventListener("touchmove", sheetWheelGuard, { capture: true, passive: false });
        sheetWheelGuardBound = true;
      } else {
        document.removeEventListener("wheel", sheetWheelGuard, { capture: true, passive: false });
        document.removeEventListener("touchmove", sheetWheelGuard, {
          capture: true,
          passive: false,
        });
        sheetWheelGuardBound = false;
      }
    } catch (eBind) {
      sheetWheelGuardBound = want;
    }
  }

  function ensureSheetLockStylePin() {
    var id = "vc-notif-sheet-lock-pin";
    var el = document.getElementById(id);
    if (!el) {
      el = document.createElement("style");
      el.id = id;
    }
    el.setAttribute("data-vc", VER);
    el.textContent =
      "html.vc-notif-sheet-open,html.vc-notif-sheet-open body," +
      "html.vc-notif-drawer-open,html.vc-notif-drawer-open body," +
      "html.vc-site-polish.vc-page-cine-ready.vc-chrome-scroll-armed.vc-notif-sheet-open," +
      "html.vc-site-polish.vc-page-cine-ready.vc-chrome-scroll-armed.vc-notif-sheet-open body," +
      "html.vc-site-polish.vc-page-cine-ready.vc-cine-curtain-off.vc-chrome-scroll-armed.vc-notif-sheet-open," +
      "html.vc-site-polish.vc-page-cine-ready.vc-cine-curtain-off.vc-chrome-scroll-armed.vc-notif-sheet-open body," +
      "html[data-vc-theme=\"light\"].vc-notif-sheet-open," +
      "html[data-vc-theme=\"light\"].vc-notif-sheet-open body," +
      "html[data-vc-theme=\"light\"].vc-page-cine-ready.vc-notif-sheet-open," +
      "html[data-vc-theme=\"light\"].vc-page-cine-ready.vc-notif-sheet-open body{" +
      "overflow:hidden!important;overflow-x:hidden!important;overflow-y:hidden!important;" +
      "overscroll-behavior:none!important;overscroll-behavior-y:none!important}";
    /* sempre in coda al documentElement → batte stylesheet late */
    try {
      document.documentElement.appendChild(el);
    } catch (eApp) {
      try {
        (document.head || document.documentElement).appendChild(el);
      } catch (eApp2) {}
    }
  }

  function stopSheetLockKeepAlive() {
    if (sheetLockKeepTimer) {
      try {
        window.clearInterval(sheetLockKeepTimer);
      } catch (eClr) {}
      sheetLockKeepTimer = 0;
    }
    bindSheetWheelGuard(false);
    disarmOverflowTrap();
  }

  function startSheetLockKeepAlive() {
    ensureSheetLockStylePin();
    armOverflowTrap();
    bindSheetWheelGuard(true);
    if (sheetLockKeepTimer) return;
    sheetLockKeepTimer = window.setInterval(function () {
      try {
        if (!sheetChromeOpenNow()) {
          stopSheetLockKeepAlive();
          applySheetInlineLock(false);
          return;
        }
        /* non chiamare __vcSyncLoaderScrollLock qui: può re-strip overflow */
        applySheetInlineLock(true);
        bindSheetWheelGuard(true);
      } catch (eKeep) {}
    }, 120);
  }

  function applySheetInlineLock(on) {
    var root = document.documentElement;
    var body = document.body;
    var want = Boolean(on);
    try {
      if (want) {
        ensureSheetLockStylePin();
        armOverflowTrap();
        root.style.setProperty("overflow", "hidden", "important");
        root.style.setProperty("overflow-x", "hidden", "important");
        root.style.setProperty("overflow-y", "hidden", "important");
        root.style.setProperty("overscroll-behavior", "none", "important");
        root.style.setProperty("overscroll-behavior-y", "none", "important");
        if (body) {
          body.style.setProperty("overflow", "hidden", "important");
          body.style.setProperty("overflow-y", "hidden", "important");
          body.style.setProperty("overscroll-behavior", "none", "important");
        }
      } else {
        var rootRm = overflowTrapOrig;
        var bodyRm = overflowTrapBodyOrig;
        if (sheetLockKeepTimer) {
          try {
            window.clearInterval(sheetLockKeepTimer);
          } catch (eClrOff) {}
          sheetLockKeepTimer = 0;
        }
        bindSheetWheelGuard(false);
        disarmOverflowTrap();
        try {
          if (rootRm) {
            rootRm("overflow");
            rootRm("overflow-x");
            rootRm("overflow-y");
            rootRm("overscroll-behavior");
            rootRm("overscroll-behavior-y");
          } else {
            root.style.removeProperty("overflow");
            root.style.removeProperty("overflow-x");
            root.style.removeProperty("overflow-y");
            root.style.removeProperty("overscroll-behavior");
            root.style.removeProperty("overscroll-behavior-y");
          }
        } catch (eRmRoot) {}
        if (body) {
          try {
            if (bodyRm) {
              bodyRm("overflow");
              bodyRm("overflow-y");
              bodyRm("overscroll-behavior");
            } else {
              body.style.removeProperty("overflow");
              body.style.removeProperty("overflow-y");
              body.style.removeProperty("overscroll-behavior");
            }
          } catch (eRmBody) {}
        }
      }
    } catch (eOv) {}
    try {
      var panel = document.querySelector(
        "#vc-notif-dropdown .vc-notif-panel, body > .vc-notif-dropdown .vc-notif-panel",
      );
      if (!panel) return;
      if (want) {
        var light = String(root.getAttribute("data-vc-theme") || "") === "light";
        var c = light ? "rgba(111, 78, 55, 0.45)" : "rgba(232, 196, 156, 0.45)";
        panel.style.setProperty("border", "1px solid " + c, "important");
        panel.style.setProperty("border-color", c, "important");
        panel.style.setProperty("background-clip", "border-box", "important");
        panel.style.setProperty("-webkit-background-clip", "border-box", "important");
      } else {
        panel.style.removeProperty("border");
        panel.style.removeProperty("border-color");
        panel.style.removeProperty("background-clip");
        panel.style.removeProperty("-webkit-background-clip");
      }
    } catch (ePanel) {}
  }

  function dismissFlyToasts() {
    try {
      var cards = document.querySelectorAll(".vc-notif-fly-card, .vc-notif-ig-toast");
      for (var i = 0; i < cards.length; i++) {
        try { cards[i].remove(); } catch (eRm) {}
      }
    } catch (e0) {}
    try {
      if (typeof window.__vcDismissNotifFlyToasts === "function") window.__vcDismissNotifFlyToasts();
    } catch (e1) {}
  }

  function dedupeSeeAll(dd) {
    try {
      var root = dd || document.getElementById("vc-notif-dropdown");
      if (!root) return;
      var links = root.querySelectorAll("#vc-notif-panel-foot .vc-notif-see-all, #vc-notif-panel-foot a[href*=\"/notifications\"]");
      var keep = null;
      for (var i = 0; i < links.length; i++) {
        var a = links[i];
        if (!keep) {
          keep = a;
          if (!a.id) a.id = "vc-notif-see-all";
          continue;
        }
        try { a.remove(); } catch (eRm) {}
      }
    } catch (eD) {}
  }

  function assertOpenClasses(dd, force) {
    try {
      if (!dd) return;
      if (!force && !dd.open) return;
      var root = document.documentElement;
      var mobile = isMobileNotifViewport();
      if (mobile) {
        root.classList.add("vc-notif-sheet-open", "vc-notif-dropdown-open");
        root.classList.remove("vc-notif-drawer-open");
      } else {
        root.classList.add("vc-notif-drawer-open", "vc-notif-dropdown-open");
        root.classList.remove("vc-notif-sheet-open");
      }
    } catch (eA) {}
  }
  var portalGuardUntil = 0;
  var openGraceUntil = 0;
  var closeLockUntil = 0;
  var portalSyncing = false;
  var portalOpenGen = 0;
  var gestureLockUntil = 0;
  var docGuardsBound = false;
  var resizeBound = false;
  var escBound = false;
  var moBound = false;
  var bellScope = "personal";
  var bellScopeSummaryAt = 0;
  var bellScopeSummaryFlight = null;

  function armPortalGuard(ms) {
    var until = Date.now() + (ms || 1400);
    portalGuardUntil = until;
    try {
      window.__vcNotifPortalGuardUntil = until;
    } catch (eShare) {}
    return until;
  }
  function clearPortalGuard() {
    portalGuardUntil = 0;
    try {
      window.__vcNotifPortalGuardUntil = 0;
    } catch (eClr) {}
  }
  function portalGuardLive() {
    var now = Date.now();
    var shared = 0;
    try {
      shared = Number(window.__vcNotifPortalGuardUntil || 0) || 0;
    } catch (eShare) {
      shared = 0;
    }
    var until = Math.max(portalGuardUntil, shared);
    if (until > portalGuardUntil) portalGuardUntil = until;
    return now < until;
  }

  var BELL_SCOPE_ROWS = [
    /* pauseOutInbox1: Pause → profilo staff */
    { id: "candidature", label: "Candidature", icon: "fa-id-badge" },
    { id: "appelli", label: "Appelli", icon: "fa-gavel" },
    /* resoProfile1 + partnerPtChrono1: resoconti/punti fuori dalla scope bar */
  ];

  function isMobileNotifViewport() {
    try {
      return window.matchMedia(
        "(max-width: 639.98px), ((pointer: coarse) and (max-width: 920px))"
      ).matches;
    } catch (e) {
      return (window.innerWidth || 999) <= 640;
    }
  }

  function landingOwnsClick() {
    /* landing ha i suoi click handler: non raddoppiare preventDefault/toggle */
    try {
      return window.__VC_NOTIF_CHROME_OWNER === "landing";
    } catch (e) {
      return false;
    }
  }

  function ensureInHeader(force) {
    if (typeof window.__vcEnsureNotifDropdownInHeader === "function") {
      try {
        return window.__vcEnsureNotifDropdownInHeader(force);
      } catch (eEns) {}
    }
    var dd = document.getElementById("vc-notif-dropdown");
    if (!dd) return null;
    var actions = document.getElementById("header-quick-actions");
    if (!actions) return dd;
    /* notifSheetAlign1: while open, stay portaled — force must not yank back to header */
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
    if (dd.parentElement === actions) return dd;
    var slot = document.getElementById("vc-notif-dropdown-slot");
    if (slot && slot.parentNode === actions) {
      actions.insertBefore(dd, slot);
      try {
        if (slot.parentNode) slot.parentNode.removeChild(slot);
      } catch (eSlot) {}
    } else {
      var toggle = actions.querySelector("#vc-mobile-nav-toggle");
      if (toggle) actions.insertBefore(dd, toggle);
      else actions.appendChild(dd);
    }
    return dd;
  }

  function setSlotHold(on) {
    var actions = document.getElementById("header-quick-actions");
    var slot = document.getElementById("vc-notif-dropdown-slot");
    if (!actions) return;
    if (on) {
      if (!slot) {
        slot = document.createElement("span");
        slot.id = "vc-notif-dropdown-slot";
        slot.hidden = true;
        slot.setAttribute("aria-hidden", "true");
        actions.appendChild(slot);
      }
      slot.className = "vc-notif-dropdown-slot vc-notif-dropdown-slot--hold";
      slot.hidden = true;
    } else if (slot) {
      slot.className = "vc-notif-dropdown-slot";
      slot.hidden = true;
    }
  }


  function armOpenGrace(ms) {
    /* notifSheetStayOpen1: default 1400 = allinea portalGuard */
    var until = Date.now() + Math.max(400, Number(ms) || 1400);
    openGraceUntil = until;
    try {
      window.__vcNotifOpenGraceUntil = until;
    } catch (eGrace) {}
  }

  function inOpenGrace() {
    return Date.now() < openGraceUntil || Date.now() < Number(window.__vcNotifOpenGraceUntil || 0);
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
  function portalToBody(dd, enable) {
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
      setSlotHold(true);
      /* notifSheetCloseLayout1: gia' in body+open → non ri-armare guard (bloccava la X) */
      if (!moved && dd.open) {
        return;
      }
      portalOpenGen += 1;
      var openGen = portalOpenGen;
      function forceOpen() {
        if (openGen !== portalOpenGen) return;
        try {
          dd.open = true;
          dd.setAttribute("open", "");
        } catch (eOpen) {}
      }
      forceOpen();
      try {
        window.requestAnimationFrame(forceOpen);
      } catch (eRaf) {}
      armPortalGuard(1400);
      armOpenGrace(1400);
      return;
    }
    portalOpenGen += 1;
    setSlotHold(false);
    ensureInHeader(true);
  }

  function kickSheetAnimOnce() {
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
    } catch (eKick) {}
  }

  var openAnimUntil = 0;
  function openSheetSmooth(dd) {
    /* notifSheetSmooth1: scope UI + portal PRIMA di open, poi una sola anim */
    /* notifInboxTapFix1: debounce open telefono */
    /* notifSheetScopeFix1: Personali prima del sync */
    if (!dd || dd.open) return false;
    var nowOpen = Date.now();
    if (nowOpen < openAnimUntil) return false;
    openAnimUntil = nowOpen + 700;
    closeLockUntil = 0;
    try {
      window.__vcNotifCloseLockUntil = 0;
    } catch (eClrLock) {}
    gestureLockUntil = Math.max(gestureLockUntil, nowOpen + 520);
    try {
      bellScope = "personal";
      if (typeof window.__vcSetBellNotifScope === "function") {
        window.__vcSetBellNotifScope("personal", { source: "open", silent: true, remember: false });
      }
    } catch (ePers) {}
    try {
      /* notifSheetUnifyGuard1: open deve ricalcolare staff (memo false sticky) */
      window.__vcCanBellStaffMemo = null;
    } catch (eMemoOpen) {}
    var root = document.documentElement;
    try {
      root.classList.add("vc-notif-sheet-noanim");
      root.classList.remove("vc-notif-sheet-anim");
    } catch (eNo) {}
    primeDesktopDrawer(dd);
    try {
      ensureBellScopeUi();
      syncBellScopeChrome();
    } catch (eScope) {}
    portalToBody(dd, true);
    dismissFlyToasts();
    try {
      dd.open = true;
      dd.setAttribute("open", "");
    } catch (eOpen) {}
    assertOpenClasses(dd, true);
    dedupeSeeAll(dd);
    armPortalGuard(1800);
    armOpenGrace(1800);
    scheduleSync(0);
    try {
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(kickSheetAnimOnce);
      });
    } catch (eRaf) {
      window.setTimeout(kickSheetAnimOnce, 32);
    }
    return true;
  }

  function requestClose(dd) {
    /* notifCloseGuard1 + notifSheetCloseLayout1: kill guard/forceOpen + lock anti-reclaim */
    clearPortalGuard();
    openGraceUntil = 0;
    closeLockUntil = Date.now() + 900;
    try {
      window.__vcNotifOpenGraceUntil = 0;
      window.__vcNotifPortalGuardUntil = 0;
      window.__vcNotifCloseLockUntil = closeLockUntil;
    } catch (eGraceClr) {}
    portalOpenGen += 1;
    gestureLockUntil = Date.now() + 520;
    try {
      if (typeof window.__vcArmSheetCloseGuard === "function") window.__vcArmSheetCloseGuard(520);
    } catch (eGhost) {}
    try {
      document.documentElement.classList.remove(
        "vc-notif-sheet-anim",
        "vc-notif-sheet-noanim",
        "vc-notif-sheet-open",
        "vc-notif-drawer-open",
        "vc-notif-dropdown-open"
      );
    } catch (eAnim) {}
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
    try {
      var oldBd = live.querySelector(".vc-notif-mobile-backdrop");
      if (oldBd) oldBd.remove();
    } catch (eBd) {}
    try {
      portalToBody(live, false);
      ensureInHeader(true);
    } catch (ePort) {}
  }

  function closeLockLive() {
    var now = Date.now();
    var shared = 0;
    try {
      shared = Number(window.__vcNotifCloseLockUntil || 0) || 0;
    } catch (e) {
      shared = 0;
    }
    var until = Math.max(closeLockUntil, shared);
    if (until > closeLockUntil) closeLockUntil = until;
    return now < until;
  }

  function primeDesktopDrawer(dd, opts) {
    /* notifPhoneOpen3: opts.fromPointer=true su mobile → no sheet-open (evita hide bell pre-click). */
    if (!dd || dd.open) return;
    opts = opts || {};
    try {
      if (isMobileNotifViewport()) {
        if (opts.fromPointer) return;
        document.documentElement.classList.add("vc-notif-sheet-open", "vc-notif-dropdown-open");
        document.documentElement.classList.remove("vc-notif-drawer-open");
      } else {
        document.documentElement.classList.add("vc-notif-drawer-open", "vc-notif-dropdown-open");
        document.documentElement.classList.remove("vc-notif-sheet-open");
      }
    } catch (ePrime) {}
  }

  function clearStuckPrime() {
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
    } catch (eClear) {}
  }

  function canBellStaff() {
    try {
      if (window.VcNotifScope && typeof window.VcNotifScope.canStaff === "function") {
        if (window.VcNotifScope.canStaff()) return true;
      }
    } catch (eApi) {}
    try {
      if (window.__VC_STAFF_MENU_ALLOWED === true) return true;
      var p = window.__VC_STAFF_PERMS;
      if (p && typeof p === "object" && p.ok) return true;
      var token = "";
      try {
        token = String(localStorage.getItem("vc_discord_access_token") || "").trim();
      } catch (eTok) {}
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
              "null"
          );
          if (gate && gate.ok === true && Number(gate.exp || 0) > Date.now()) return true;
        } catch (eGate) {}
      }
      var link = document.getElementById("discord-staff-link");
      if (link && !link.hasAttribute("hidden")) return true;
      if (
        document.querySelector(
          "[data-vc-staff-tools-nav], .vc-snav-details--staff, .vc-header-snav [data-vc-staff-nav], .vc-snav-details[data-vc-staff-nav], #vc-staff-snav-details, #discord-staff-link:not([hidden])"
        )
      ) {
        return true;
      }
    } catch (eCan) {}
    return false;
  }

  function staffNotifHref(inboxId) {
    try {
      var u = new URL("/notifications/", window.location.origin);
      u.searchParams.set("view", "staff");
      if (inboxId) u.searchParams.set("inbox", String(inboxId));
      return u.pathname + u.search;
    } catch (eUrl) {
      return "/notifications/?view=staff" + (inboxId ? "&inbox=" + encodeURIComponent(inboxId) : "");
    }
  }

  function paintLightStaffSummary(summary) {
    var list = document.getElementById("vc-notif-bell-inbox-list");
    var hint = document.getElementById("vc-notif-bell-inbox-hint");
    if (!list) return;
    list.innerHTML = "";
    var sum = summary && typeof summary === "object" ? summary : {};
    var any = false;
    BELL_SCOPE_ROWS.forEach(function (row) {
      var count = Number(sum[row.id] || 0) || 0;
      any = true;
      var li = document.createElement("li");
      li.className = "vc-notif-bell-inbox__row" + (count > 0 ? " has-count" : "");
      var a = document.createElement("a");
      a.className = "vc-notif-bell-inbox__toggle";
      a.href = staffNotifHref(row.id);
      a.innerHTML =
        '<span class="vc-notif-bell-inbox__ico" aria-hidden="true"><i class="fa ' +
        row.icon +
        '"></i></span>' +
        '<span class="vc-notif-bell-inbox__label">' +
        row.label +
        "</span>" +
        '<span class="vc-notif-bell-inbox__count">' +
        (count > 99 ? "99+" : String(count)) +
        "</span>";
      li.appendChild(a);
      list.appendChild(li);
    });
    if (hint) {
      if (!any) {
        hint.hidden = false;
        hint.removeAttribute("hidden");
        hint.textContent = "Apri l'inbox staff completa.";
      } else {
        hint.textContent = "";
        hint.hidden = true;
        hint.setAttribute("hidden", "");
      }
    }
  }

  function loadLightStaffSummary(force) {
    if (typeof window.__vcLoadBellStaffInboxSummary === "function") {
      try {
        return window.__vcLoadBellStaffInboxSummary(force);
      } catch (eLand) {}
    }
    var cached = null;
    try {
      var pref = window.__VC_INBOX_SUMMARY_PREFETCH;
      if (pref && pref.summary) cached = pref;
      if (!cached) {
        var raw = sessionStorage.getItem("vc_inbox_summary_v1");
        if (raw) cached = JSON.parse(raw);
      }
    } catch (eCache) {}
    if (cached && cached.summary) paintLightStaffSummary(cached.summary);
    if (!force && bellScopeSummaryAt && Date.now() - bellScopeSummaryAt < 20000 && cached) {
      return Promise.resolve(cached);
    }
    var token = "";
    try {
      token = String(localStorage.getItem("vc_discord_access_token") || "").trim();
    } catch (eTok) {}
    if (!token) {
      paintLightStaffSummary({});
      var hint = document.getElementById("vc-notif-bell-inbox-hint");
      if (hint) {
        hint.hidden = false;
        hint.removeAttribute("hidden");
        hint.textContent = "Accedi per vedere l'inbox staff.";
      }
      return Promise.resolve(null);
    }
    if (bellScopeSummaryFlight) return bellScopeSummaryFlight;
    var api = "/webhooks/site-staff-workflows";
    try {
      var c = window.__VC_STAFF_WORKFLOWS;
      if (c && c.apiUrl) api = String(c.apiUrl);
    } catch (eCfg) {}
    var url = api + (api.indexOf("?") >= 0 ? "&" : "?") + "queue=summary";
    bellScopeSummaryFlight = fetch(url, {
      method: "GET",
      credentials: "include",
      headers: { Authorization: "Bearer " + token, Accept: "application/json" },
      cache: "no-store",
    })
      .then(function (res) {
        return res
          .json()
          .catch(function () {
            return null;
          })
          .then(function (body) {
            return { ok: res.ok, body: body };
          });
      })
      .then(function (out) {
        bellScopeSummaryAt = Date.now();
        if (!out || !out.body || !out.body.ok || !out.body.summary) {
          if (!cached) paintLightStaffSummary({});
          return null;
        }
        try {
          var cachePayload = {
            summary: out.body.summary,
            permissions: out.body.permissions || null,
            at: Date.now(),
          };
          sessionStorage.setItem("vc_inbox_summary_v1", JSON.stringify(cachePayload));
          window.__VC_INBOX_SUMMARY_PREFETCH = out.body;
        } catch (eStore) {}
        paintLightStaffSummary(out.body.summary);
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
        }
        return null;
      })
      .finally(function () {
        bellScopeSummaryFlight = null;
      });
    return bellScopeSummaryFlight;
  }

  function ensureBellScopeUi() {
    if (typeof window.__vcEnsureNotifBellScopeUi === "function") {
      try {
        return window.__vcEnsureNotifBellScopeUi();
      } catch (eEns) {}
    }
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
      /* notifSheetUnifyGuard1: stesso markup di landing (pending pips) */
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
      /* upgrade chrome-light → pending pips se manca */
      try {
        var tabPersUp = switchWrap.querySelector("#vc-notif-bell-tab-personal");
        var tabStaffUp = switchWrap.querySelector("#vc-notif-bell-tab-staff");
        if (tabPersUp && !switchWrap.querySelector("#vc-notif-bell-pending-personal")) {
          var pPendUp = document.createElement("span");
          pPendUp.className = "vc-notif-scope-switch__pending";
          pPendUp.id = "vc-notif-bell-pending-personal";
          pPendUp.hidden = true;
          pPendUp.setAttribute("aria-hidden", "true");
          tabPersUp.appendChild(pPendUp);
        }
        if (tabStaffUp && !switchWrap.querySelector("#vc-notif-bell-pending-staff")) {
          var sPendUp = document.createElement("span");
          sPendUp.className = "vc-notif-scope-switch__pending";
          sPendUp.id = "vc-notif-bell-pending-staff";
          sPendUp.hidden = true;
          sPendUp.setAttribute("aria-hidden", "true");
          tabStaffUp.appendChild(sPendUp);
        }
      } catch (eUpgChrome) {}
    }

    var personalPane = document.getElementById("vc-notif-bell-pane-personal");
    if (!personalPane) {
      personalPane = document.createElement("div");
      personalPane.id = "vc-notif-bell-pane-personal";
      personalPane.className = "vc-notif-bell-pane";
      personalPane.setAttribute("data-bell-pane", "personal");
      while (body.firstChild) {
        if (body.firstChild && body.firstChild.id === "vc-notif-bell-pane-staff") break;
        personalPane.appendChild(body.firstChild);
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
      body.appendChild(staffPane);
    }

    if (!window.__vcNotifBellScopeWired) {
      window.__vcNotifBellScopeWired = true;
      switchWrap.addEventListener("click", function (ev) {
        var btn =
          ev.target && ev.target.closest ? ev.target.closest("[data-bell-scope]") : null;
        if (!btn || !switchWrap.contains(btn)) return;
        ev.preventDefault();
        ev.stopPropagation();
        try {
          if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
        } catch (eStop) {}
        gestureLockUntil = Date.now() + 480;
        /* notifInboxTapFix1: no global swallow on scope switch */
        var next = btn.getAttribute("data-bell-scope") === "staff" ? "staff" : "personal";
        setBellScope(next, { source: "bell" });
      });
      window.addEventListener("vc:notif-scope", function (ev) {
        /* notifBellStable1: sheet aperto → ignora page/dock (no switch a caso) */
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
        setBellScope(next, { source: "page", silent: true });
      });
      window.addEventListener("vc:staff-access-ok", function () {
        try {
          window.__vcCanBellStaffMemo = null;
        } catch (eMemo) {}
        syncBellScopeChrome();
      });
      window.addEventListener("vc:auth-logout", function () {
        try {
          window.__vcCanBellStaffMemo = null;
        } catch (eMemoOut) {}
        setBellScope("personal", { source: "logout", silent: true });
      });
    }
    return true;
  }

  function syncBellScopeChrome() {
    if (typeof window.__vcSyncNotifBellScopeChrome === "function") {
      try {
        return window.__vcSyncNotifBellScopeChrome();
      } catch (eSync) {}
    }
    ensureBellScopeUi();
    var switchWrap = document.getElementById("vc-notif-bell-scope");
    var tabP = document.getElementById("vc-notif-bell-tab-personal");
    var tabS = document.getElementById("vc-notif-bell-tab-staff");
    var personalPane = document.getElementById("vc-notif-bell-pane-personal");
    var staffPane = document.getElementById("vc-notif-bell-pane-staff");
    var staffOk = canBellStaff();
    if (!staffOk && bellScope === "staff") bellScope = "personal";
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
    var isStaff = bellScope === "staff" && staffOk;
    try {
      var segPaint = switchWrap && switchWrap.querySelector(".vc-notif-scope-switch__seg");
      if (segPaint && segPaint.style) {
        var lightSeg = false;
        try {
          lightSeg = document.documentElement.getAttribute("data-vc-theme") === "light";
        } catch (eLg) {}
        segPaint.style.setProperty("transition", "none", "important");
        if (lightSeg) {
          segPaint.style.setProperty("background-color", "rgba(111, 78, 55, 0.16)", "important");
          segPaint.style.setProperty("background-image", "none", "important");
        } else {
          segPaint.style.setProperty("background-color", "rgba(14, 10, 8, 0.92)", "important");
          segPaint.style.setProperty("background-image", "none", "important");
        }
      }
    } catch (eSeg) {}
    /* notifSheetScopeActive6: reset + fill (mirror landing) se chrome synca da solo */
    function paintTab(el, on) {
      if (!el || !el.style) return;
      var light = false;
      try {
        light = document.documentElement.getAttribute("data-vc-theme") === "light";
      } catch (eTh) {}
      /* notifSheetScopeActive9: no transition bg — altrimenti fill resta sull’altro tab */
      el.style.setProperty("transition", "none", "important");
      el.style.removeProperty("background");
      el.style.removeProperty("background-color");
      el.style.removeProperty("background-image");
      el.style.removeProperty("color");
      el.style.removeProperty("-webkit-text-fill-color");
      el.style.removeProperty("border");
      el.style.removeProperty("box-shadow");
      try {
        el.setAttribute("data-vc-scope-on", on ? "1" : "0");
      } catch (eOn) {}
      if (on) {
        if (light) {
          el.style.setProperty("background-color", "#fff8f0", "important");
          el.style.setProperty(
            "background-image",
            "linear-gradient(180deg, #fffefb 0%, #f7efe6 55%, #f0e6da 100%)",
            "important",
          );
          el.style.setProperty("color", "#1a120e", "important");
          el.style.setProperty("-webkit-text-fill-color", "#1a120e", "important");
          el.style.setProperty("border", "1px solid rgba(111, 78, 55, 0.4)", "important");
          el.style.setProperty(
            "box-shadow",
            "0 2px 8px rgba(60, 40, 24, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.75)",
            "important",
          );
        } else {
          el.style.setProperty("background-color", "#3a281c", "important");
          el.style.setProperty("background-image", "none", "important");
          el.style.setProperty("color", "#fff8f0", "important");
          el.style.setProperty("-webkit-text-fill-color", "#fff8f0", "important");
          el.style.setProperty("border", "0 solid transparent", "important");
          el.style.setProperty("box-shadow", "inset 0 1px 0 rgba(255, 255, 255, 0.1)", "important");
        }
      } else {
        el.style.setProperty("background-color", "transparent", "important");
        el.style.setProperty("background-image", "none", "important");
        el.style.setProperty(
          "color",
          light ? "#3a281c" : "rgba(236, 214, 188, 0.72)",
          "important",
        );
        el.style.setProperty(
          "-webkit-text-fill-color",
          light ? "#3a281c" : "rgba(236, 214, 188, 0.72)",
          "important",
        );
        el.style.setProperty("border", "0 solid transparent", "important");
        el.style.setProperty("box-shadow", "none", "important");
      }
    }
    if (tabP) {
      tabP.classList.toggle("is-active", !isStaff);
      tabP.setAttribute("aria-selected", !isStaff ? "true" : "false");
      paintTab(tabP, !isStaff);
    }
    if (tabS) {
      tabS.classList.toggle("is-active", isStaff);
      tabS.setAttribute("aria-selected", isStaff ? "true" : "false");
      paintTab(tabS, isStaff);
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
    if (isStaff) loadLightStaffSummary(false);
  }

  function setBellScope(next, opts) {
    opts = opts || {};
    /* notifBellStable1: un solo owner di scope (landing) anche per eventi page */
    if (typeof window.__vcSetBellNotifScope === "function") {
      try {
        return window.__vcSetBellNotifScope(next, opts);
      } catch (eSet) {}
    }
    var want = next === "staff" ? "staff" : "personal";
    if (want === "staff" && !canBellStaff()) want = "personal";
    bellScope = want;
    syncBellScopeChrome();
    if (opts.source === "bell" && !opts.silent) {
      try {
        if (
          window.VcNotifScope &&
          typeof window.VcNotifScope.setScope === "function" &&
          /\/notifications\/?$/i.test(String(location.pathname || ""))
        ) {
          window.VcNotifScope.setScope(want, { remember: false });
        } else {
          window.dispatchEvent(new CustomEvent("vc:notif-scope", { detail: { scope: want, source: "bell" } }));
        }
      } catch (eSync) {}
    }
  }

  function ensureDrawerChromeParity(dd) {
    if (!dd) return;
    try {
      var listWrap = document.getElementById("vc-notif-list-wrap");
      if (listWrap) {
        listWrap.hidden = false;
        listWrap.removeAttribute("hidden");
      }
      var foot = document.getElementById("vc-notif-panel-foot");
      if (foot) {
        foot.hidden = false;
        foot.removeAttribute("hidden");
        if (!document.getElementById("vc-notif-see-all")) {
          var a = document.createElement("a");
          a.id = "vc-notif-see-all";
          a.className = "vc-notif-see-all";
          a.href = "/notifications/";
          a.innerHTML =
            'Vedi tutte le notifiche <i class="fa fa-chevron-right" aria-hidden="true"></i>';
          foot.appendChild(a);
        }
        dedupeSeeAll(dd);
      }
      var headActions = dd.querySelector(".vc-notif-panel-head-actions");
      if (headActions && !document.getElementById("vc-notif-clear-all")) {
        var clear = document.createElement("button");
        clear.type = "button";
        clear.className = "vc-notif-action";
        clear.id = "vc-notif-clear-all";
        clear.title = "Elimina tutte";
        clear.setAttribute("aria-label", "Elimina tutte");
        clear.innerHTML = '<i class="fa fa-trash-o" aria-hidden="true"></i>';
        headActions.appendChild(clear);
      }
      /* notifCloseDedup1: una sola X chiudi (landing/staff possono averne già messa) */
      try {
        var closes = dd.querySelectorAll(".vc-notif-close-mobile, #vc-notif-close-mobile");
        var keep = null;
        for (var ci = 0; ci < closes.length; ci++) {
          var cbtn = closes[ci];
          if (!keep) {
            keep = cbtn;
            if (!cbtn.id) cbtn.id = "vc-notif-close-mobile";
            if (!/\bvc-notif-action\b/.test(cbtn.className || "")) {
              cbtn.className = String(cbtn.className || "").trim() + " vc-notif-action";
            }
            continue;
          }
          try {
            cbtn.remove();
          } catch (eRm) {}
        }
      } catch (eDedup) {}
      if (!dd.querySelector(".vc-notif-close-mobile")) {
        var panel = dd.querySelector(".vc-notif-panel");
        var head = panel && panel.querySelector(".vc-notif-panel-head");
        if (head) {
          var closeBtn = document.createElement("button");
          closeBtn.type = "button";
          closeBtn.id = "vc-notif-close-mobile";
          closeBtn.className = "vc-notif-action vc-notif-close-mobile";
          closeBtn.setAttribute("aria-label", "Chiudi notifiche");
          closeBtn.innerHTML = '<i class="fa fa-times" aria-hidden="true"></i>';
          closeBtn.addEventListener("click", function (ev) {
            try {
              if (ev) {
                ev.preventDefault();
                ev.stopPropagation();
              }
            } catch (ePrev) {}
            requestClose(dd);
            scheduleSync(0);
          });
          var actions = head.querySelector(".vc-notif-panel-head-actions");
          if (actions) actions.appendChild(closeBtn);
          else head.appendChild(closeBtn);
        }
      }
    } catch (eParity) {}
  }

  function syncChrome() {
    if (portalSyncing) return;
    var dd = document.getElementById("vc-notif-dropdown");
    if (!dd) return;
    var root = document.documentElement;
    var mobile = isMobileNotifViewport();
    /* close lock: mai reclaim dopo X/Esc */
    if (closeLockLive()) {
      if (dd.open) {
        try {
          dd.open = false;
          dd.removeAttribute("open");
        } catch (eCls) {}
      }
      try {
        root.classList.remove("vc-notif-sheet-open", "vc-notif-drawer-open", "vc-notif-dropdown-open");
      } catch (eRm) {}
      clearPortalGuard();
      portalToBody(dd, false);
      ensureInHeader(true);
      return;
    }
    if (!dd.open && portalGuardLive()) {
      try {
        dd.open = true;
        dd.setAttribute("open", "");
      } catch (eRe) {}
      /* notifAutoCloseFix1: non fare return nudo — continua col path open
         (classi sheet/drawer + backdrop), altrimenti sembra chiuso / poi collassa. */
    }
    portalSyncing = true;
    try {
      if (dd.open) {
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
        portalToBody(dd, true);
        dismissFlyToasts();
        assertOpenClasses(dd, true);
        dedupeSeeAll(dd);
        /* non re-arm guard a ogni sync: solo open/reclaim (altrimenti close impossibile) */
        try {
          if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
        } catch (eLock) {}
        try {
          applySheetInlineLock(true);
          startSheetLockKeepAlive();
        } catch (eInlineOn) {}
        try {
          /* bellScopeNoReset1 / notifSheetSmooth1: ensure UI una volta; sync leggero dopo */
          if (!dd.__vcBellScopeUiReady) {
            ensureBellScopeUi();
            dd.__vcBellScopeUiReady = true;
          }
          if (!dd.__vcBellScopeResetDone) {
            dd.__vcBellScopeResetDone = true;
            if (!landingOwnsClick() && typeof window.__vcSetBellNotifScope !== "function") {
              bellScope = "personal";
            }
          }
          syncBellScopeChrome();
          ensureDrawerChromeParity(dd);
        } catch (eScope) {}
        if (!dd.querySelector(".vc-notif-mobile-backdrop")) {
          var bd = document.createElement("div");
          bd.className = "vc-notif-mobile-backdrop";
          bd.setAttribute("aria-hidden", "true");
          var bdLockUntil = 0;
          var closeFromBd = function () {
            if (inOpenGrace()) return;
            var now = Date.now();
            if (now < bdLockUntil) return;
            bdLockUntil = now + 480;
            gestureLockUntil = Date.now() + 520;
            try {
              if (typeof window.__vcArmSheetCloseGuard === "function") window.__vcArmSheetCloseGuard(520);
            } catch (eGhost) {}
            requestClose(dd);
            scheduleSync(0);
          };
          /* notifCloseGuard1: pointerup+click — iOS a volte mangia solo click */
          bd.addEventListener("pointerup", closeFromBd);
          bd.addEventListener("click", closeFromBd);
          dd.insertBefore(bd, dd.firstChild);
        }
      } else {
        /* notifBellStayOpen1: overflow-lock can spurious-close <details>; reclaim under guard.
           Non fare return a metà: portal + classi + switcher devono restare coerenti
           altrimenti il panel resta body>absolute sotto il footer. */
        if (portalGuardLive()) {
          try {
            dd.open = true;
            dd.setAttribute("open", "");
          } catch (eRe) {}
          try {
            if (mobile) {
              root.classList.add("vc-notif-sheet-open", "vc-notif-dropdown-open");
              root.classList.remove("vc-notif-drawer-open");
            } else {
              root.classList.add("vc-notif-drawer-open", "vc-notif-dropdown-open");
              root.classList.remove("vc-notif-sheet-open");
            }
          } catch (eCls) {}
          portalToBody(dd, true);
          dismissFlyToasts();
          assertOpenClasses(dd, true);
          dedupeSeeAll(dd);
          try {
            if (!dd.__vcBellScopeUiReady) {
              ensureBellScopeUi();
              dd.__vcBellScopeUiReady = true;
            }
            syncBellScopeChrome();
            ensureDrawerChromeParity(dd);
          } catch (eScopeRe) {}
          try {
            applySheetInlineLock(true);
          } catch (eInlineRe) {}
          armPortalGuard(1800);
          return;
        }
        clearPortalGuard();
        try {
          dd.__vcBellScopeResetDone = false;
        } catch (eFlag) {}
        try {
          stopSheetLockKeepAlive();
          applySheetInlineLock(false);
        } catch (eInlineOff) {}
        try {
          root.classList.remove("vc-notif-sheet-open", "vc-notif-drawer-open", "vc-notif-dropdown-open");
        } catch (e1) {}
        var oldBd = dd.querySelector(".vc-notif-mobile-backdrop");
        if (oldBd) oldBd.remove();
        portalToBody(dd, false);
        ensureInHeader(true);
        try {
          if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
        } catch (eLock2) {}
      }
    } finally {
      portalSyncing = false;
      try {
        var ddFin = document.getElementById("vc-notif-dropdown");
        var rootFin = document.documentElement;
        var lockFin = Boolean(
          ddFin &&
            ddFin.open &&
            (rootFin.classList.contains("vc-notif-sheet-open") ||
              rootFin.classList.contains("vc-notif-drawer-open")),
        );
        applySheetInlineLock(lockFin);
        if (lockFin) startSheetLockKeepAlive();
        else stopSheetLockKeepAlive();
      } catch (eFinLock) {}
    }
  }

  function scheduleSync(delayMs) {
    var delay = delayMs != null ? Number(delayMs) : 0;
    function run() {
      try {
        syncChrome();
      } catch (eSync) {}
      try {
        var live = document.getElementById("vc-notif-dropdown");
        if (!live || !live.open) clearStuckPrime();
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

  function wireSummary(dd) {
    if (!dd) return false;
    var summary = dd.querySelector("summary.vc-notif-summary, summary");
    if (!summary) return false;
    /* notifPhoneOpen2: flag chrome-only — non rubare __vcNotifPrimeWired a landing */
    if (summary.__vcNotifChromePrimeWired) return true;
    summary.__vcNotifChromePrimeWired = true;
    summary.addEventListener(
      "pointerdown",
      function () {
        if (landingOwnsClick()) return;
        var live = document.getElementById("vc-notif-dropdown") || dd;
        /* notifAutoCloseFix1: se gia' open, NON azzerare portalGuard
           (altrimenti un pointerdown spurio + reclaim = close a ~1s). */
        if (!live || live.open) return;
        primeDesktopDrawer(live, { fromPointer: true });
        window.setTimeout(function () {
          try {
            var again = document.getElementById("vc-notif-dropdown");
            if (!again || again.open) return;
            clearStuckPrime();
          } catch (eClr) {}
        }, 320);
      },
      true
    );
    summary.addEventListener(
      "click",
      function (ev) {
        /* landing click wired → lascia a lui; altrimenti gestisci (race load telefono) */
        if (landingOwnsClick()) {
          try {
            var sumLive =
              (ev && ev.currentTarget) ||
              document.querySelector("#vc-notif-dropdown > summary.vc-notif-summary, #vc-notif-dropdown > summary");
            if (sumLive && sumLive.__vcNotifLandingClickWired) return;
          } catch (eOwn) {
            return;
          }
        }
        try {
          if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
          if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
        } catch (ePrev) {}
        var live = document.getElementById("vc-notif-dropdown") || dd;
        if (!live) return;
        var nowMs = Date.now();
        var isOpen = false;
        try {
          isOpen = Boolean(live.open || live.hasAttribute("open"));
        } catch (eIs) {
          isOpen = false;
        }
        /* notifBellLiveFix1: lock solo su close — primo open non deve essere mangato */
        if (isOpen && nowMs < gestureLockUntil) return;
        gestureLockUntil = nowMs + 420;
        if (isOpen) {
          clearPortalGuard();
          requestClose(live);
          scheduleSync(0);
          return;
        }
        try {
          window.__vcNotifCloseLockUntil = 0;
          openAnimUntil = 0;
        } catch (eClrO) {}
        if (openSheetSmooth(live)) return;
        primeDesktopDrawer(live);
        try {
          live.open = true;
          live.setAttribute("open", "");
        } catch (eOpen) {}
        scheduleSync(0);
      },
      true
    );
    return true;
  }

  function ensureDdWired(dd) {
    if (!dd) return false;
    wireSummary(dd);
    if (!dd.__vcNotifChromeToggleWired) {
      dd.__vcNotifChromeToggleWired = true;
      dd.addEventListener("toggle", function () {
        scheduleSync(0);
      });
    }
    /* notifPhoneOpen2: non settare __vcNotifSheetWired (è di landing) */
    dd.__vcNotifChromeSheetWired = true;
    return true;
  }

  function bindDocGuards() {
    if (docGuardsBound) return;
    docGuardsBound = true;
    /* notifChromeUnify2: toggle capture globale → sync anche se wire locale manca */
    document.addEventListener(
      "toggle",
      function (ev) {
        var t = ev && ev.target;
        if (!t || t.id !== "vc-notif-dropdown") return;
        scheduleSync(0);
      },
      true
    );
    document.addEventListener(
      "pointerdown",
      function (ev) {
        var t = ev && ev.target;
        if (!t || !t.closest) return;
        var sum = t.closest("#vc-notif-dropdown > summary, summary.vc-notif-summary");
        if (!sum) return;
        if (landingOwnsClick()) return;
        var dd = document.getElementById("vc-notif-dropdown");
        if (!dd || dd.open) return;
        primeDesktopDrawer(dd, { fromPointer: true });
      },
      true
    );
  }

  function bindResizeEsc() {
    if (!resizeBound) {
      resizeBound = true;
      window.addEventListener("resize", function () {
        scheduleSync(0);
      });
    }
    if (!escBound) {
      escBound = true;
      document.addEventListener("keydown", function (ev) {
        if (ev.key !== "Escape") return;
        var live = document.getElementById("vc-notif-dropdown");
        if (!live || !live.open) return;
        requestClose(live);
        scheduleSync(0);
      });
    }
  }

  function bindMo() {
    if (moBound || !document.documentElement) return;
    moBound = true;
    try {
      var moTimer = 0;
      var mo = new MutationObserver(function () {
        /* notifClientAll1: niente tryBoot a raffica — landing muta molto e saturava CPU */
        if (window.__VC_NOTIF_CHROME_OWNER === "landing") {
          try {
            mo.disconnect();
          } catch (eDisc) {}
          return;
        }
        if (moTimer) return;
        moTimer = window.setTimeout(function () {
          moTimer = 0;
          tryBoot();
        }, 120);
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
      window.__vcNotifChromeMo = mo;
    } catch (eMo) {}
  }

  function injectBellOpenCssFix() {
    /* notifBellStable1: mentre sheet/drawer aperti, campanella SEMPRE nascosta
       (anche senza [open] — su switch tab [open] flicker → altrimenti ricompare).
       Non force-show: phone-open3 faceva riapparire la bell in navbar. */
    try {
      var old = document.getElementById("vc-notif-phone-open3-css");
      if (old && old.parentNode) old.parentNode.removeChild(old);
    } catch (eOld) {}
    if (document.getElementById("vc-notif-bell-stable1-css")) return;
    try {
      var s = document.createElement("style");
      s.id = "vc-notif-bell-stable1-css";
      s.textContent =
        "@media (max-width:920px){" +
        "html.vc-notif-sheet-open #header-quick-actions .vc-notif-summary.vc-icon-btn," +
        "html.vc-notif-sheet-open #header-quick-actions #vc-notif-dropdown > summary.vc-notif-summary," +
        "html.vc-notif-sheet-open #header-quick-actions #vc-notif-dropdown .vc-notif-summary," +
        "html.vc-notif-dropdown-open #header-quick-actions .vc-notif-summary.vc-icon-btn," +
        "html.vc-notif-drawer-open #header-quick-actions .vc-notif-summary.vc-icon-btn," +
        "html.vc-notif-sheet-open body > #vc-notif-dropdown > summary.vc-notif-summary," +
        "html.vc-notif-sheet-open body > #vc-notif-dropdown > .vc-notif-summary{" +
        "display:none!important;visibility:hidden!important;opacity:0!important;" +
        "pointer-events:none!important;position:fixed!important;left:-10000px!important;top:-10000px!important;" +
        "width:0!important;height:0!important;min-width:0!important;min-height:0!important;" +
        "overflow:hidden!important;clip:rect(0,0,0,0)!important;}" +
        "html.vc-notif-sheet-noanim body.vc-body .vc-notif-dropdown[open] .vc-notif-panel," +
        "html.vc-notif-sheet-noanim body.vc-body>.vc-notif-dropdown[open] .vc-notif-panel{animation:none!important}" +
        "html.vc-notif-sheet-anim body.vc-body .vc-notif-dropdown[open] .vc-notif-panel," +
        "html.vc-notif-sheet-anim body.vc-body>.vc-notif-dropdown[open] .vc-notif-panel{" +
        "animation:vc-notif-sheet-in .34s cubic-bezier(.22,1,.36,1) both!important}" +
        "}";
      (document.head || document.documentElement).appendChild(s);
    } catch (eCss) {}
  }

  function tryBoot() {
    injectBellOpenCssFix();
    bindDocGuards();
    bindResizeEsc();
    if (window.__VC_NOTIF_CHROME_OWNER !== "landing") bindMo();
    var dd = document.getElementById("vc-notif-dropdown");
    if (!dd) return;
    ensureDdWired(dd);
    try {
      ensureBellScopeUi();
      if (dd.open) syncBellScopeChrome();
    } catch (eScopeBoot) {}
    if (typeof window.__vcEnsureNotifDropdownInHeader === "function") {
      try {
        if (window.__VC_NOTIF_CHROME_OWNER !== "landing") {
          /* landing presente: lascia i click a lui, ma sync resta nostro */
          if (!window.__VC_NOTIF_CHROME_OWNER) window.__VC_NOTIF_CHROME_OWNER = "shared";
        }
      } catch (eOwn) {}
    } else if (!window.__VC_NOTIF_CHROME_OWNER || window.__VC_NOTIF_CHROME_OWNER === "existing") {
      window.__VC_NOTIF_CHROME_OWNER = "shared";
    }
    if (window.__VC_NOTIF_CHROME_OWNER === "landing" && window.__vcNotifChromeMo) {
      try {
        window.__vcNotifChromeMo.disconnect();
      } catch (eDisc2) {}
    }
    /* se gia' aperta (bfcache / race), allinea subito */
    try {
      if (dd.open) scheduleSync(0);
    } catch (eOpenBoot) {}
  }

  window.VcNotifChrome.sync = syncChrome;
  window.VcNotifChrome.applySheetInlineLock = applySheetInlineLock;
  window.VcNotifChrome.schedule = scheduleSync;
  window.VcNotifChrome.close = requestClose;
  window.VcNotifChrome.openSmooth = openSheetSmooth;
  window.VcNotifChrome.kickAnim = kickSheetAnimOnce;
  window.VcNotifChrome.isMobile = isMobileNotifViewport;
  window.VcNotifChrome.inOpenGrace = inOpenGrace;
  window.VcNotifChrome.ensure = tryBoot;
  window.VcNotifChrome.ensureBellScope = ensureBellScopeUi;
  window.VcNotifChrome.syncBellScope = syncBellScopeChrome;
  window.VcNotifChrome.setBellScope = setBellScope;

  tryBoot();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", tryBoot, { once: true });
  }
  window.setTimeout(tryBoot, 60);
  window.setTimeout(tryBoot, 400);
  window.setTimeout(tryBoot, 1200);
  window.setTimeout(tryBoot, 2800);
})();

/* notifChromeUnify2 + bellScopeAll1 */
