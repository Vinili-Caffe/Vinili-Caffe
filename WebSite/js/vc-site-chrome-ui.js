/* vcSiteChromeUi + navUnify1 — progress/back-top/cursor + GIF/marquee soft */
(function () {
  var VER = "20261001ticketsCpuHard2";
  if (window.__VC_SITE_CHROME_UI_BUNDLE === VER) return;
  window.__VC_SITE_CHROME_UI_BUNDLE = VER;
  var REDUCE =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var FINE =
    window.matchMedia && window.matchMedia("(pointer: fine)").matches;
  var COARSE =
    window.matchMedia &&
    window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  /* pwaGifGlow1: cursor glow di nuovo (anche desktop PWA) */
  var NO_CURSOR = COARSE && !FINE;
  try {
    if (!NO_CURSOR) document.documentElement.classList.add("vc-site-cursor-ok");
    else document.documentElement.classList.remove("vc-site-cursor-ok", "vc-site-cursor-on");
  } catch (eOk) {}

  var barTarget = 0;
  var barShown = 0;
  var barVel = 0;
  var loadingBar = true;
  var smoothMaxScroll = 0;
  var loadRaf = 0;
  var loadStart = 0;
  var lastLoopTs = 0;
  var barRaf = 0;
  var barEl = null;
  var scrollIdleUntil = 0;
  var loadFreezePinY = 0;
  var loadFreezeOn = false;

  function setChromeBarLoadingClass(on) {
    try {
      var root = document.documentElement;
      if (on) {
        root.classList.add("vc-chrome-bar-loading");
        root.classList.add("vc-loading-scroll-lock");
      } else {
        root.classList.remove("vc-chrome-bar-loading");
        /* safariUnlock3: togli SEMPRE il lock nostro prima del sync.
           __vcSyncLoaderScrollLock può early-return e lasciare vc-loading-scroll-lock. */
        root.classList.remove("vc-loading-scroll-lock");
        try {
          if (typeof window.__vcSyncLoaderScrollLock === "function") {
            window.__vcSyncLoaderScrollLock();
          }
        } catch (eSync) {}
      }
    } catch (eCls) {}
  }

  function pinLoadScroll() {
    if (!loadFreezeOn) return;
    try {
      var y =
        window.pageYOffset ||
        (document.documentElement && document.documentElement.scrollTop) ||
        0;
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

  function onLoadFreezeBlock(e) {
    if (!loadFreezeOn) return;
    try {
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
      pinLoadScroll();
    } catch (eBlk) {}
  }

  function armLoadFreeze() {
    if (loadFreezeOn) return;
    loadFreezeOn = true;
    try {
      loadFreezePinY =
        window.pageYOffset ||
        (document.documentElement && document.documentElement.scrollTop) ||
        0;
    } catch (eY) {
      loadFreezePinY = 0;
    }
    setChromeBarLoadingClass(true);
    try {
      document.addEventListener("wheel", onLoadFreezeBlock, { capture: true, passive: false });
      document.addEventListener("touchmove", onLoadFreezeBlock, { capture: true, passive: false });
      document.addEventListener("keydown", onLoadFreezeBlock, { capture: true, passive: false });
      /* cpuFreezeTrim1: scroll passive — no preventDefault loop */
      window.addEventListener("scroll", onLoadFreezeBlock, { capture: true, passive: true });
    } catch (eArm) {}
    /* safariUnlock3: failsafe corto — finishLoad ora disarm subito */
    try {
      window.setTimeout(function () {
        try {
          if (!window.__vcChromeLoadDone) finishLoad();
        } catch (eFs) {}
      }, 1600);
    } catch (eTo) {}
    /* hamScrollBarGate1: nuclear chiama solo finishLoad — non strippa lock mentre barra top anima */
    try {
      window.setTimeout(function () {
        try {
          if (!window.__vcChromeLoadDone) finishLoad();
        } catch (eNuc) {}
      }, 2400);
    } catch (eTo2) {}
  }

  function disarmLoadFreeze() {
    /* safariUnlock3: sempre clear classi freeze (anche se flag già false) */
    loadFreezeOn = false;
    setChromeBarLoadingClass(false);
    try {
      document.removeEventListener("wheel", onLoadFreezeBlock, true);
      document.removeEventListener("touchmove", onLoadFreezeBlock, true);
      document.removeEventListener("keydown", onLoadFreezeBlock, true);
      window.removeEventListener("scroll", onLoadFreezeBlock, true);
    } catch (eDis) {}
  }

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
      wrap.classList.add("is-loading");
      wrap.appendChild(el("div", "vc-site-progress__bar"));
      (document.body || document.documentElement).appendChild(wrap);
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
    if (NO_CURSOR) return null;
    var light = document.getElementById("vc-site-cursor-light");
    if (!light) {
      light = el("div", "vc-site-cursor-light");
      light.setAttribute("aria-hidden", "true");
      (document.body || document.documentElement).appendChild(light);
    }
    try {
      var legacy = document.getElementById("vc-site-cursor-light-critical");
      if (legacy && legacy.parentNode) legacy.parentNode.removeChild(legacy);
    } catch (eLeg) {}
    try {
      light.style.cssText = "";
    } catch (eClr) {}
    return light;
  }

  function scrollRatio() {
    /* violPass6: usa solo cache — niente scrollHeight sync (Forced reflow) */
    var scrollTop = window.pageYOffset || document.documentElement.scrollTop || 0;
    var max = smoothMaxScroll > 0 ? smoothMaxScroll : cachedMaxScroll;
    if (max <= 1) return scrollTop > 0 ? 1 : 0;
    return Math.min(1, Math.max(0, scrollTop / Math.max(max, 1)));
  }

  function applyBar() {
    var node = getBarEl();
    if (!node) return;
    var v = Number.isFinite(barShown) ? barShown : 0;
    try {
      /* Direct transform — never set --vc-chrome-bar on :root (style thrash / scatti). */
      node.style.transform = "scaleX(" + v.toFixed(5) + ")";
    } catch (eA) {}
  }

  function setLoadingClass(on) {
    loadingBar = Boolean(on);
    var wrap = document.getElementById("vc-site-progress");
    if (wrap) wrap.classList.toggle("is-loading", loadingBar);
    if (loadingBar) armLoadFreeze();
    else disarmLoadFreeze();
  }

  function setBar(pct, loading) {
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
        /* fallback raro — evita scrollHeight ogni frame */
        var doc = document.documentElement;
        maxScroll = Math.max(0, (doc.scrollHeight || 0) - vh);
        cachedMaxScroll = maxScroll;
      }
      var pageTallEnough = maxScroll >= vh * 2.75;
      var scrolledFar = y > Math.max(520, vh * 0.9);
      var btn = document.getElementById("vc-site-back-top");
      if (btn) btn.classList.toggle("is-on", pageTallEnough && scrolledFar);
    } catch (eS) {}
  }

  function ensureBarLoop() {
    if (barRaf || REDUCE) return;
    lastLoopTs = 0;
    barRaf = window.requestAnimationFrame(barLoop);
  }

  function barLoop(now) {
    barRaf = 0;
    try {
      if (document.hidden) {
        applyBar();
        return;
      }
      var ts = now || performance.now();
      var dt = lastLoopTs ? Math.min(0.048, (ts - lastLoopTs) / 1000) : 0.016;
      lastLoopTs = ts;
      var scrolling = ts < scrollIdleUntil;

      if (window.__vcChromeLoadDone && window.__vcChromeScrollArmed) {
        barTarget = scrollRatio();
      }

      var diff = barTarget - barShown;
      if (Math.abs(diff) < 0.00008 && Math.abs(barVel) < 0.00008) {
        barShown = barTarget;
        barVel = 0;
      } else {
        /*
         * Spring smorzato: segue lo scroll senza scatti.
         * Più reattivo in scroll, più morbido in settle.
         */
        var stiffness = loadingBar ? 120 : scrolling ? 95 : 55;
        var damping = loadingBar ? 18 : scrolling ? 16 : 14;
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
        barRaf = window.requestAnimationFrame(barLoop);
      }
    } catch (eL) {
      if (!document.hidden) barRaf = window.requestAnimationFrame(barLoop);
    }
  }

  var scrollRaf = 0;
  var pendingScrollTop = 0;
  var cachedMaxScroll = 0;
  var maxScrollSampleAt = 0;
  function onScroll() {
    scrollIdleUntil = performance.now() + 280;
    try {
      pendingScrollTop = document.documentElement.scrollTop || window.pageYOffset || 0;
    } catch (eY) {}
    if (scrollRaf) return;
    scrollRaf = window.requestAnimationFrame(function () {
      scrollRaf = 0;
      syncBackTop();
      if (window.__vcChromeLoadDone && window.__vcChromeScrollArmed) {
        /* violPass11: sample max ogni 5s; skip se scroll ancora caldo */
        var now = performance.now();
        var scrollingHot = now < scrollIdleUntil;
        if (!scrollingHot && (!cachedMaxScroll || now - maxScrollSampleAt > 5000)) {
          try {
            var doc = document.documentElement;
            cachedMaxScroll = Math.max(
              0,
              (doc.scrollHeight || 0) - (doc.clientHeight || window.innerHeight || 0),
            );
            maxScrollSampleAt = now;
            if (smoothMaxScroll <= 0) smoothMaxScroll = cachedMaxScroll;
            else if (Math.abs(cachedMaxScroll - smoothMaxScroll) > 8) {
              smoothMaxScroll += (cachedMaxScroll - smoothMaxScroll) * 0.18;
            } else {
              smoothMaxScroll = cachedMaxScroll;
            }
          } catch (eMax) {}
        }
        var ratio =
          smoothMaxScroll <= 1
            ? pendingScrollTop > 0
              ? 1
              : 0
            : Math.min(1, Math.max(0, pendingScrollTop / Math.max(smoothMaxScroll, 1)));
        setBar(ratio, false);
      } else {
        ensureBarLoop();
      }
    });
  }
  /* violPass4 */
  /* violPass5 */
  /* violPass6 */
  /* violPass11 */
  /* violPass12 */

  function finishLoad() {
    if (window.__vcChromeLoadDone) return;
    window.__vcChromeLoadDone = true;
    window.__vcChromeScrollArmed = false;
    try {
      if (loadRaf) {
        window.cancelAnimationFrame(loadRaf);
        loadRaf = 0;
      }
    } catch (eT) {}
    /* hamScrollBarGate1: NON disarmare freeze qui — resta locked finché la barra top
       arriva a pieno e setLoadingClass(false). Prima: scrollbar pagina per ~1s con barra ancora viva. */
    try {
      setChromeBarLoadingClass(true);
      loadFreezeOn = true;
    } catch (eKeep) {}
    try {
      setBar(1, null);
      var wrap = document.getElementById("vc-site-progress");
      if (wrap) wrap.classList.add("is-loading");
      loadingBar = true;
    } catch (eFin) {}
    var finishAt = performance.now();
    var holdFullUntil = 0;
    function waitBarFull(now) {
      var ts = now || performance.now();
      /* violPass9: niente ensureBarLoop ogni frame (era rAF Violation ~300ms) */
      var full = REDUCE || barShown >= 0.992 || Math.abs(1 - barShown) < 0.008;
      /* safariUnlock2: max wait barra più corto (era 1600) */
      if (!full && ts - finishAt < 700) {
        window.requestAnimationFrame(waitBarFull);
        return;
      }
      try {
        barShown = 1;
        barTarget = 1;
        barVel = 0;
        applyBar();
      } catch (eSnapFull) {}
      if (!holdFullUntil) {
        holdFullUntil = ts + (REDUCE ? 40 : 100);
      }
      if (ts < holdFullUntil) {
        window.requestAnimationFrame(waitBarFull);
        return;
      }
      /* violPass4/9/10/12: snap / disarm / unpin in tick separati (era ~150ms Violation) */
      window.setTimeout(function () {
        try {
          var r = 0;
          if (smoothMaxScroll > 1 && pendingScrollTop > 0) {
            r = Math.min(1, Math.max(0, pendingScrollTop / smoothMaxScroll));
          } else if (cachedMaxScroll > 1 && pendingScrollTop > 0) {
            r = Math.min(1, Math.max(0, pendingScrollTop / cachedMaxScroll));
          }
          barShown = r;
          barTarget = r;
          barVel = 0;
          applyBar();
        } catch (eSnap) {}
        window.setTimeout(function () {
          try {
            setLoadingClass(false);
          } catch (eLoad) {}
          window.setTimeout(function () {
            window.__vcChromeScrollArmed = true;
            try {
              if (typeof window.__vcUnpinPageScroll === "function") window.__vcUnpinPageScroll();
            } catch (eUn) {}
          }, 0);
        }, 0);
      }, 0);
    }
    window.requestAnimationFrame(waitBarFull);
  }

  function armLoadProgress() {
    window.__vcChromeLoadDone = false;
    window.__vcChromeScrollArmed = false;
    loadStart = performance.now();
    armLoadFreeze();
    setBar(0.12, true);

    function tickLoad(now) {
      loadRaf = 0;
      if (window.__vcChromeLoadDone) return;
      var ts = now || performance.now();
      var age = ts - loadStart;
      /* safariUnlock2: auto-finish più presto su WebKit lento */
      if (age >= 1400) {
        finishLoad();
        return;
      }
      var t = Math.min(1, age / 1400);
      var eased = 1 - Math.pow(1 - t, 2.2);
      setBar(0.12 + eased * 0.82, true);
      loadRaf = window.requestAnimationFrame(tickLoad);
    }
    loadRaf = window.requestAnimationFrame(tickLoad);

    function finishAfterMin() {
      var need = Math.max(0, 720 - (performance.now() - loadStart));
      var at = performance.now() + need;
      function waitMin(now) {
        if ((now || performance.now()) < at) {
          window.requestAnimationFrame(waitMin);
          return;
        }
        finishLoad();
      }
      window.requestAnimationFrame(waitMin);
    }
    if (document.readyState === "complete") finishAfterMin();
    else window.addEventListener("load", finishAfterMin, { once: true });
  }

  function armCursor(light) {
    if (!light || NO_CURSOR) return;
    var root = document.documentElement;
    var HALF = 120; /* cursorGlowRestore1: match 240px glow */
    var tx = window.innerWidth / 2;
    var ty = window.innerHeight * 0.4;
    var raf = 0;
    var on = false;
    var lastX = -99999;
    var lastY = -99999;

    function place(px, py) {
      try {
        light.style.transform =
          "translate3d(" + (px - HALF).toFixed(1) + "px," + (py - HALF).toFixed(1) + "px,0)";
      } catch (eV) {}
    }

    function paint() {
      raf = 0;
      if (!on) return;
      if (Math.abs(tx - lastX) < 0.5 && Math.abs(ty - lastY) < 0.5) return;
      lastX = tx;
      lastY = ty;
      place(tx, ty);
    }

    function wake(cx, cy) {
      if (typeof cx !== "number" || typeof cy !== "number") return;
      if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;
      tx = cx;
      ty = cy;
      if (!on) {
        on = true;
        lastX = cx;
        lastY = cy;
        place(cx, cy);
        root.classList.add("vc-site-cursor-on");
        return;
      }
      if (!raf) raf = window.requestAnimationFrame(paint);
    }

    function sleepLight() {
      on = false;
      raf = 0;
      root.classList.remove("vc-site-cursor-on");
      try {
        light.style.transform = "translate3d(-9999px,-9999px,0)";
      } catch (eOff) {}
    }

    function onMove(e) {
      try {
        if (e.pointerType && e.pointerType !== "mouse" && e.pointerType !== "pen" && e.pointerType !== "") {
          return;
        }
      } catch (ePt) {}
      wake(e.clientX, e.clientY);
    }

    function onVis() {
      if (document.hidden) sleepLight();
    }

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

  function boot() {
    if (!document.body) {
      document.addEventListener("DOMContentLoaded", boot, { once: true });
      return;
    }
    ensureFooterSocialMetal();
    if (window.__vcChromeUiBooted) {
      try {
        if (window.__VC_SITE_CHROME_UI_VER !== VER) armUiGpuSoft();
      } catch (eRe) {}
      window.__VC_SITE_CHROME_UI_VER = VER;
      return;
    }
    window.__vcChromeUiBooted = true;
    mountProgress();
    mountBackTop();
    armCursor(mountCursorLight());
    armLoadProgress();
    armUiGpuSoft();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    try {
      window.addEventListener("scrollend", onScroll, { passive: true });
    } catch (eEnd) {}
    window.__VC_SITE_CHROME_UI_VER = VER;
  }

  /* cpuThrashOff1 + cpuAnimSoft1: GIF restano dove si vedono.
     Offscreen (footer) → still; tab hidden → still; niente MO/kick.
     Nav blur morto tolto in vc-perf injectTouchPerfCss. */
  function armUiGpuSoft() {
    if (window.__vcUiGpuSoftArmed) return;
    window.__vcUiGpuSoftArmed = 1;
    var LOGO_GIF = "/images/og-server-icon.gif?v=20260915footerLogoGif1";
    var LOGO_STILL = "/images/og-server-icon-still.png?v=20260915footerLogoGif1";
    var DISCORD_GIF = "/images/discord.gif?v=20260904brandGif1";
    var DISCORD_STILL = "/images/discord-still.png?v=20260915footerLogoGif1";
    var inView = typeof WeakMap !== "undefined" ? new WeakMap() : null;
    var io = null;

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
      if (img.closest && img.closest(".vc-premium-footer__logo, .vc-header-logo-link")) return true;
      var s = String(img.getAttribute("src") || img.currentSrc || "");
      return /og-server-icon\.(gif|png|webp)/i.test(s);
    }

    function isDiscord(img) {
      var s = String(img.getAttribute("src") || img.currentSrc || "");
      return (
        (/discord(-still)?\.(gif|png|webp)/i.test(s) && !/discord\.com|cdn\.discord/i.test(s)) ||
        img.classList.contains("vc-discord-login-emoji")
      );
    }

    function wantStill(img) {
      if (document.hidden) return true;
      try {
        /* ticketsCpuHard2: /tickets/ sempre still (GIF logo = CPU continuo) */
        if (document.body && document.body.classList.contains("vc-web-tickets-page")) return true;
        /* cpuPagesIdle1: non-home / PWA → still brand GIF (idle decode CPU) */
        if (document.documentElement.classList.contains("vc-site-cpu-soft")) return true;
        if (document.documentElement.classList.contains("vc-pwa-cpu-nuke")) return true;
      } catch (eSoft) {}
      if (inClosedDrawer(img)) return true;
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

    function syncAll() {
      try {
        document.documentElement.classList.toggle("vc-page-hidden", Boolean(document.hidden));
        document.documentElement.classList.toggle("vc-ui-gif-paused", Boolean(document.hidden));
      } catch (eCls) {}
      var imgs = listImgs();
      for (var i = 0; i < imgs.length; i += 1) {
        watch(imgs[i]);
        syncOne(imgs[i]);
      }
    }

    function syncAllDeferred() {
      /* violKill1: visibility/pageshow non devono fare sync sync */
      try {
        window.requestAnimationFrame(function () {
          window.setTimeout(syncAll, 0);
        });
      } catch (eDef) {
        window.setTimeout(syncAll, 0);
      }
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

    document.addEventListener("visibilitychange", syncAllDeferred);
    window.addEventListener("pageshow", syncAllDeferred);
    window.addEventListener("vc:mobile-nav", syncAllDeferred);
    window.addEventListener("vc:cpu-sleep", syncAllDeferred);
    window.addEventListener("vc:cpu-wake", syncAllDeferred);
    syncAllDeferred();
  }

  boot();
})();
/* violKill1 */
/* extOnlyFix1 */
/* violPass10 */
/* violPass11 */
/* violPass12 */
