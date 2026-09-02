(function () {
  if (window.__vcPtrBooted) return;
  window.__vcPtrBooted = true;

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

  function pagePath() {
    var p = String(window.location.pathname || "") + String(window.location.search || "");
    if (p.length > 1 && p.charAt(p.length - 1) === "/") p = p.slice(0, -1);
    return p || "/";
  }

  function saveScrollForReload() {
    try {
      var y =
        window.pageYOffset ||
        (document.documentElement && document.documentElement.scrollTop) ||
        (document.body && document.body.scrollTop) ||
        0;
      y = Math.max(0, Math.round(Number(y) || 0));
      sessionStorage.setItem(
        SCROLL_KEY,
        JSON.stringify({ p: pagePath(), y: y, t: Date.now() }),
      );
    } catch (eSave) {}
  }

  function cleanupScrollRestore() {
    try {
      sessionStorage.removeItem(SCROLL_KEY);
    } catch (eRm) {}
    try {
      delete window.__vcPtrRestoreY;
    } catch (eDel) {}
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
    } catch (eCls) {}
    var css = document.getElementById("vc-ptr-scroll-restore-css");
    if (css && css.parentNode) css.parentNode.removeChild(css);
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

  function finalizeScrollRestore() {
    var y = 0;
    try {
      y = Math.max(0, Math.round(Number(window.__vcPtrRestoreY) || 0));
    } catch (eY) {}
    if (y < 2) {
      try {
        var raw = sessionStorage.getItem(SCROLL_KEY);
        if (raw) {
          var data = JSON.parse(raw);
          if (data && data.p === pagePath()) y = Math.max(0, Math.round(Number(data.y) || 0));
        }
      } catch (eRead) {}
    }
    if (y < 2) {
      cleanupScrollRestore();
      return;
    }

    if (maxPageScrollY() < y - 12) {
      pinScrollRestore(y);
      return;
    }

    unpinScrollRestore();
    try {
      window.scrollTo(0, y);
      if (document.documentElement) document.documentElement.scrollTop = y;
      if (document.body) document.body.scrollTop = y;
    } catch (eFin) {}

    var now = pageScrollY();
    if (Math.abs(now - y) <= 8) {
      cleanupScrollRestore();
      return;
    }

    pinScrollRestore(y);
  }

  function armScrollRestoreFinalize() {
    if (window.__vcPtrRestoreArmed) {
      finalizeScrollRestore();
      return;
    }
    window.__vcPtrRestoreArmed = true;
    finalizeScrollRestore();
    var delays = [60, 150, 320, 640, 980, 1400, 2000, 2800, 3800, 5200];
    for (var i = 0; i < delays.length; i += 1) {
      window.setTimeout(finalizeScrollRestore, delays[i]);
    }
    try {
      if (typeof MutationObserver === "function") {
        var mo = new MutationObserver(function () {
          finalizeScrollRestore();
        });
        mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
        window.__vcPtrRestoreMo = mo;
      }
    } catch (eMo) {}
    window.addEventListener("load", finalizeScrollRestore, { passive: true });
    document.addEventListener("vc:page-cine-ready", finalizeScrollRestore, { passive: true });
    document.addEventListener("vc:access-ok", finalizeScrollRestore, { passive: true });
    window.setTimeout(cleanupScrollRestore, 12000);
  }

  function injectCss() {
    if (document.getElementById("vc-ptr-css")) return;
    var style = document.createElement("style");
    style.id = "vc-ptr-css";
    style.textContent =
      "html.vc-ptr-ready,html.vc-ptr-ready body{overscroll-behavior-y:contain;}" +
      ".vc-ptr{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 4.85rem);z-index:10240;width:6.1rem;margin:0;display:flex;flex-direction:column;align-items:center;gap:.38rem;pointer-events:none;opacity:0;transform:translate3d(-50%,-5.6rem,0);transition:opacity .2s ease,transform .28s cubic-bezier(.22,1,.36,1);}" +
      ".vc-ptr.is-on{opacity:1;transform:translate3d(-50%,calc(-5.6rem + var(--vc-ptr-y,0px)),0);transition:none;}" +
      ".vc-ptr.is-snap{opacity:0;transform:translate3d(-50%,-5.6rem,0);}" +
      ".vc-ptr.is-refreshing{opacity:1;transform:translate3d(-50%,.15rem,0);transition:transform .22s cubic-bezier(.22,1,.36,1),opacity .16s ease;}" +
      ".vc-ptr__disc{position:relative;width:3.45rem;height:3.45rem;border-radius:9999px;background:radial-gradient(circle at 50% 50%,transparent 0 .46rem,#1a120e .46rem .64rem,transparent .65rem),repeating-radial-gradient(circle at 50% 50%,rgba(255,255,255,.06) 0 1px,transparent 1px 3px),radial-gradient(circle at 32% 28%,rgba(255,255,255,.16),transparent 42%),radial-gradient(circle at 50% 50%,#2a1c16 0 38%,#120c0a 62%,#070504 100%);box-shadow:0 10px 26px rgba(0,0,0,.46),0 0 0 1px rgba(212,168,136,.34),0 0 22px rgba(212,168,136,.2);transform:rotate(var(--vc-ptr-rot,0deg)) scale(var(--vc-ptr-scale,.86));transform-origin:50% 50%;}" +
      ".vc-ptr.is-on .vc-ptr__disc{transform:rotate(var(--vc-ptr-rot,0deg)) scale(var(--vc-ptr-scale,1));}" +
      ".vc-ptr.is-armed .vc-ptr__disc{box-shadow:0 12px 30px rgba(0,0,0,.5),0 0 0 1px rgba(212,168,136,.58),0 0 30px rgba(212,168,136,.46);}" +
      ".vc-ptr__label{position:absolute;inset:28%;border-radius:9999px;background:radial-gradient(circle at 38% 32%,rgba(255,244,232,.55),transparent 46%),linear-gradient(160deg,#ead4c0 0%,#d4a888 48%,#6f4e37 100%);box-shadow:inset 0 0 0 1px rgba(80,48,28,.28);}" +
      ".vc-ptr__hole{position:absolute;left:50%;top:50%;width:.46rem;height:.46rem;margin:-.23rem 0 0 -.23rem;border-radius:9999px;background:#0b0705;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12);}" +
      ".vc-ptr__hint{margin:0;max-width:10rem;color:rgba(247,239,230,.9);font-size:.7rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;text-align:center;text-shadow:0 1px 10px rgba(0,0,0,.7);opacity:.82;}" +
      ".vc-ptr.is-armed .vc-ptr__hint{opacity:1;color:#ead4c0;}" +
      ".vc-ptr.is-refreshing .vc-ptr__disc{animation:vc-ptr-spin .72s linear infinite;transform:none;}" +
      "@keyframes vc-ptr-spin{to{transform:rotate(360deg);}}" +
      "@media (prefers-reduced-motion:reduce){.vc-ptr,.vc-ptr.is-refreshing,.vc-ptr__disc,.vc-ptr.is-on .vc-ptr__disc,.vc-ptr.is-refreshing .vc-ptr__disc{animation:none;transition:opacity .16s ease;}}";
    (document.head || document.documentElement).appendChild(style);
  }

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
    refreshing = false;
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

  function shouldIgnoreStart(target) {
    if (refreshing) return true;
    try {
      if (document.documentElement.classList.contains("vc-mobile-nav-open")) return true;
      if (document.documentElement.classList.contains("vc-staff-manage-sheet-open")) return true;
      if (document.documentElement.classList.contains("vc-staff-stat-sheet-open")) return true;
      if (document.documentElement.classList.contains("vc-dialog-open")) return true;
      if (document.documentElement.classList.contains("vc-notif-sheet-open")) return true;
    } catch (eNav) {}
    if (document.body && document.body.classList.contains("vc-mobile-nav-open")) return true;
    var dialog = document.getElementById("vc-site-dialog");
    if (dialog && !dialog.hasAttribute("hidden")) return true;
    var notif = document.getElementById("vc-notif-dropdown");
    if (notif && notif.hasAttribute("open")) return true;
    var ae = document.activeElement;
    if (ae && /^(input|textarea|select)$/i.test(ae.tagName)) return true;
    if (ae && ae.isContentEditable) return true;
    var node = target;
    if (node && node.nodeType === 3) node = node.parentElement;
    if (node && node.closest) {
                  if (node.closest("input, textarea, select, [contenteditable='true'], [role='slider'], .vc-no-ptr")) {
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
          ".vc-staff-manage-sheet, .vc-staff-stat-sheet, .vc-dialog, .vc-dash-confirm, .vc-notif-panel",
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

  function ensureRoot() {
    if (root && root.isConnected) return root;
    injectCss();
    root = document.createElement("div");
    root.className = "vc-ptr";
    root.setAttribute("aria-hidden", "true");
    root.innerHTML =
      '<div class="vc-ptr__disc">' +
      '<span class="vc-ptr__label"></span>' +
      '<span class="vc-ptr__hole"></span>' +
      "</div>" +
      '<p class="vc-ptr__hint"></p>';
    hintEl = root.querySelector(".vc-ptr__hint");
    document.body.appendChild(root);
    return root;
  }

  function setHint(kind) {
    if (hintEl) hintEl.textContent = hintText(kind);
  }

  function paint(pull, isArmed) {
    ensureRoot();
    pullY = pull;
    armed = isArmed;
    var scale = 0.86 + Math.min(1, pull / THRESHOLD) * 0.18;
    root.style.setProperty("--vc-ptr-y", Math.max(0, pull * 0.95) + "px");
    root.style.setProperty("--vc-ptr-rot", (reducedMotion ? 0 : pull * 3.05) + "deg");
    root.style.setProperty("--vc-ptr-scale", String(scale.toFixed(3)));
    root.classList.toggle("is-on", pull > 2);
    root.classList.toggle("is-armed", isArmed);
    root.classList.remove("is-snap", "is-refreshing");
    setHint(isArmed ? "release" : "refresh");
  }

  function snapBack() {
    if (!root) return;
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
    root.classList.remove("is-on", "is-armed", "is-snap");
    root.classList.add("is-refreshing");
    setHint("refresh");

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
                try {
      window.__vcPtrTracking = true;
    } catch (eTrack) {}
    armWatchdog();
    if (holdMax) window.clearTimeout(holdMax);
        holdMax = window.setTimeout(function () {
      holdMax = 0;
      if (tracking && !refreshing && !armed) abortPull(true);
    }, 10000);
  }

  function onTouchMoveProbe(ev) {
    if (!tracking || moveBound || refreshing || !ev.touches || ev.touches.length !== 1) return;
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
    if (pull > 6 && ev.cancelable) ev.preventDefault();
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
      suppressClickUntil = Date.now() + 450;
      triggerReload();
      return;
    }
    if (pullY > 18) suppressClickUntil = Date.now() + 320;
    snapBack();
    armed = false;
    pullY = 0;
  }

  function showJustReloaded() {
    var flag = false;
    try {
      flag = sessionStorage.getItem(PTR_KEY) === "1";
      if (flag) sessionStorage.removeItem(PTR_KEY);
    } catch (e) {}
    armScrollRestoreFinalize();
    if (!flag) return;
    ensureRoot();
    root.classList.add("is-refreshing");
    setHint("refresh");
    window.setTimeout(function () {
      if (!root) return;
      root.classList.remove("is-refreshing");
      root.classList.add("is-snap");
      window.setTimeout(function () {
        if (root) root.classList.remove("is-snap");
      }, 280);
    }, 420);
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

  function repairPtrAfterNavigation() {
    resetPtrUi();
    armScrollRestoreFinalize();
    try {
      var drawer = document.getElementById("vc-mobile-nav-drawer");
      var navOpen = drawer && drawer.classList.contains("vc-mobile-nav-drawer--open");
      if (!navOpen) {
        document.documentElement.classList.remove("vc-mobile-nav-open");
        if (document.body) document.body.classList.remove("vc-mobile-nav-open");
      }
    } catch (eNav) {}
    try {
      if (typeof window.__vcRepairNotifDropdownPortal === "function") {
        window.__vcRepairNotifDropdownPortal();
      }
    } catch (eNotif) {}
    try {
      if (typeof window.__vcSyncLoaderScrollLock === "function") {
        window.__vcSyncLoaderScrollLock();
      } else if (typeof window.__vcUnpinPageScroll === "function") {
        window.__vcUnpinPageScroll();
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

  function tryInitPtrIfNeeded() {
    if (window.__vcPtrListenersBound) return;
    if (!isTouchUi() && !(Number(navigator.maxTouchPoints || 0) > 0)) {
      armScrollRestoreFinalize();
      return;
    }
        if (shouldDeferPtr()) {
      watchDeferClear();
      return;
    }
    reducedMotion = prefersReduced();
    injectCss();
    document.documentElement.classList.add("vc-ptr-ready");
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
        try {
          ev.preventDefault();
          ev.stopPropagation();
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
    });
    window.addEventListener("pageshow", function () {
      repairPtrAfterNavigation();
    });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") abortPull(false);
      else if (document.visibilityState === "visible") repairPtrAfterNavigation();
    });
  }

  function initPtr() {
    if (window.__vcPtrListenersBound) return;
    if (!isTouchUi() && !(Number(navigator.maxTouchPoints || 0) > 0)) return;
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      armScrollRestoreFinalize();
      initPtr();
    });
  } else {
    armScrollRestoreFinalize();
    initPtr();
  }
})();
