/**
 * Fixed perf tier for everyone (no device/network autodetection).
 * Tiers available in CSS/API: full | mid | lite
 * forceMidAll1: always mid — detection + localStorage pref ignored.
 * Sets html.vc-perf-{tier} and data-vc-perf early for CSS.
 */
(function (global) {
  if (global.VcPerf && global.VcPerf.__ready) return;

  /* navMetalBridge1: stub Cache API SEMPRE in page (non solo PWA) —
     Storage Service CPU da caches.open/match; SW push resta nel proprio scope */
  /* pushOpenCold2: whitelist pending-nav/read — altrimenti cold-start push non raggiunge la dest */
  try {
    if ("caches" in global && !global.__vcPageCachesStub) {
      global.__vcPageCachesStub = 1;
      var nativeCaches = global.caches;
      var PASS_CACHE = {
        "vc-pending-nav-v1": 1,
        "vc-notif-pending-read-v1": 1,
      };
      var deadCache = {
        match: function () {
          return Promise.resolve(undefined);
        },
        matchAll: function () {
          return Promise.resolve([]);
        },
        add: function () {
          return Promise.resolve();
        },
        addAll: function () {
          return Promise.resolve();
        },
        put: function () {
          return Promise.resolve();
        },
        delete: function () {
          return Promise.resolve(false);
        },
        keys: function () {
          return Promise.resolve([]);
        },
      };
      var deadCaches = {
        open: function (name) {
          var key = String(name || "");
          if (PASS_CACHE[key] && nativeCaches && typeof nativeCaches.open === "function") {
            return nativeCaches.open(key);
          }
          return Promise.resolve(deadCache);
        },
        has: function (name) {
          var key = String(name || "");
          if (PASS_CACHE[key] && nativeCaches && typeof nativeCaches.has === "function") {
            return nativeCaches.has(key);
          }
          return Promise.resolve(false);
        },
        delete: function (name) {
          var key = String(name || "");
          if (PASS_CACHE[key] && nativeCaches && typeof nativeCaches.delete === "function") {
            return nativeCaches.delete(key);
          }
          return Promise.resolve(false);
        },
        keys: function () {
          return Promise.resolve([]);
        },
        match: function () {
          return Promise.resolve(undefined);
        },
      };
      try {
        Object.defineProperty(global, "caches", {
          configurable: true,
          get: function () {
            return deadCaches;
          },
        });
      } catch (eDef) {
        try {
          global.caches = deadCaches;
        } catch (eAssign) {}
      }
    }
  } catch (eSwBoot) {}

  /* cssFoucKill1: early baseline + no libro flash + hold paint finché soft-fx è pronto */
  try {
    var earlyId = "vc-phone-top-flash-kill1";
    var earlyCss =
      "html body.vc-body .vc-home-cine::after{content:none!important;display:none!important;opacity:0!important;background:none!important}" +
      "html body.vc-body .vc-home-cine{overflow:hidden!important}" +
      "@media (min-width:1200px){" +
      "html body.vc-body .vc-home-cine__veil{" +
      "background:linear-gradient(180deg,rgba(10,7,5,.55) 0%,rgba(10,7,5,.24) 32%,rgba(10,7,5,.3) 62%,rgba(10,7,5,.8) 100%)," +
      "radial-gradient(ellipse 72% 55% at 50% 42%,rgba(10,7,5,.2),transparent 72%)!important;" +
      "filter:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}" +
      "html body.vc-body .vc-home-cine__photo{" +
      "object-position:center center!important;transform:none!important;" +
      "filter:none!important;-webkit-filter:none!important}}" +
      "@media (max-width:1199.98px),(pointer:coarse){" +
      "html body.vc-body .vc-home-cine__veil{" +
      "background:linear-gradient(180deg,transparent 0%,transparent 42%,rgba(10,7,5,.18) 72%,rgba(10,7,5,.62) 100%)!important;" +
      "filter:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}" +
      "html body.vc-body .vc-home-cine__photo{" +
      "object-position:center 58%!important;object-fit:cover!important;" +
      "width:116vw!important;height:116vh!important;height:116dvh!important;" +
      "left:-8vw!important;top:-8vh!important;top:-8dvh!important;" +
      "right:auto!important;bottom:auto!important;inset:auto!important;" +
      "transform:none!important;filter:none!important;-webkit-filter:none!important;" +
      "contain:none!important}}" +
      ".vc-forbidden-book:not(.vc-forbidden-book--flying),.vc-forbidden-book[hidden]," +
      "html body .vc-forbidden-book:not(.vc-forbidden-book--flying)," +
      "html body.vc-body .vc-forbidden-book:not(.vc-forbidden-book--flying)," +
      "html body.vc-body h1 .vc-forbidden-book:not(.vc-forbidden-book--flying){" +
      "display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;" +
      "font-size:0!important;width:0!important;height:0!important;margin:0!important;padding:0!important;overflow:hidden!important;" +
      "position:absolute!important;left:-9999px!important;top:-9999px!important}" +
      "html:not(.vc-soft-fx-ready) body.vc-body>header," +
      "html:not(.vc-soft-fx-ready) body.vc-body>main," +
      "html:not(.vc-soft-fx-ready) body.vc-body main," +
      "html:not(.vc-soft-fx-ready) body.vc-body>footer," +
      "html:not(.vc-soft-fx-ready) body.vc-body #intro," +
      "html:not(.vc-soft-fx-ready) body.vc-body .vc-home-cine-hero," +
      "html:not(.vc-soft-fx-ready) body.vc-body .vc-page-cine-hero," +
      "html:not(.vc-cine-curtain-off) body.vc-body>header," +
      "html:not(.vc-cine-curtain-off) body.vc-body>main," +
      "html:not(.vc-cine-curtain-off) body.vc-body>footer{" +
      "opacity:0!important;visibility:hidden!important;pointer-events:none!important}";
    var early = document.getElementById(earlyId);
    if (!early) {
      early = document.createElement("style");
      early.id = earlyId;
      var rootEl = document.documentElement;
      (document.head || rootEl).insertBefore(early, (document.head || rootEl).firstChild);
    }
    early.setAttribute("data-vc", "preCineFlashKill1");
    early.textContent = earlyCss;
    /* perfDeskCut1 / holdFreezeKill1: svela + togli hold (mai cursore loading stuck) */
    window.setTimeout(function () {
      clearBootHoldWithCurtain();
    }, 1200);
    window.setTimeout(function () {
      try {
        var soft = document.getElementById("vc-soft-fx-css") || document.querySelector('link[href*="vc-soft-fx.css"]');
        if (!soft) {
          clearBootHoldWithCurtain();
          return;
        }
        var ok = false;
        try {
          ok = !!(soft.sheet && ((soft.sheet.cssRules && soft.sheet.cssRules.length) || (soft.sheet.rules && soft.sheet.rules.length)));
        } catch (eSh) {
          ok = soft.getAttribute("data-vc-sheet-loaded") === "1";
        }
        if (ok) clearBootHoldWithCurtain();
      } catch (eFs) {}
    }, 2800);
  } catch (eEarlyBlur) {}

  /* forceMidAll1 → … → pwaCpuRamCut1 → pwaCpuNuke1 */
  var FORCE_DESKTOP_TIER = "mid";
  var STORAGE_KEY = "vc_perf_tier_pref_v3";
  var lastTier = "";
  /* perfBgRam1 marker */
  /* notifTapEmptyFix1 marker */
  /* holdFreezeKill1 marker */
  /* pwaCpuRamCut1 marker */
  /* pwaCpuNuke1 marker */
  /* pwaCpuNuke3 marker */
  /* pwaCpuNuke4 marker */
  /* pwaCpuNuke5 marker */
  /* swStorageCpu2 marker */
  /* gifGradRestore1 marker */
  /* phoneFxRestore1 marker */
  /* perfDeskCut1 marker */
  /* pwaFgCpu1 marker */
  /* pwaGifGlow1 marker */
  /* gifAlwaysOn2 marker */
  /* bgIdealSize1 marker — still 1920x768 / 1200x480 (5:2) */
  /* cpuPagesIdle1 marker */
  /* ulCountStick1 marker */
  /* cpuQuiet1 marker */

  function isHomePage() {
    try {
      var b = document.body;
      if (b && b.classList.contains("vc-body--home")) return true;
      var p = String((typeof location !== "undefined" && location.pathname) || "/").replace(/\/+$/, "") || "/";
      return p === "/";
    } catch (eHome) {
      return false;
    }
  }

  function isStandalonePwa() {
    try {
      if (window.__VC_PWA_CPU_NUKE) return true;
      if (document.documentElement && document.documentElement.classList.contains("vc-pwa-cpu-nuke")) {
        return true;
      }
      if (window.matchMedia) {
        if (window.matchMedia("(display-mode: standalone)").matches) return true;
        if (window.matchMedia("(display-mode: minimal-ui)").matches) return true;
        if (window.matchMedia("(display-mode: fullscreen)").matches) return true;
        if (window.matchMedia("(display-mode: window-controls-overlay)").matches) return true;
      }
      if (navigator.standalone) return true;
    } catch (e) {}
    return false;
  }

  /* cpuPagesIdle1: riporta soft-css DOPO soft-fx pin */
  function remountSiteCpuSoftCssLast() {
    try {
      var s = document.getElementById("vc-site-cpu-soft-css");
      if (!s) return;
      var mount = document.body || document.documentElement;
      if (s.parentNode === mount && mount.lastChild === s) return;
      mount.appendChild(s);
    } catch (eRm) {}
  }

  function stillDiscordContentGifs() {
    /* cpuQuiet1 + violKill1 + perfIdleReflow1: chunk corto (no long idle Violation) */
    try {
      var imgs = document.querySelectorAll(
        'main img[src*=".gif"], #vc-page-content img[src*=".gif"], .vc-page-cine-body img[src*=".gif"], .vc-wiki-cmd-shell img[src*=".gif"], footer img[src*=".gif"]',
      );
      var i = 0;
      var CHUNK = 10;
      function step() {
        var end = Math.min(i + CHUNK, imgs.length);
        for (; i < end; i++) {
          var img = imgs[i];
          if (!img) continue;
          if (img.classList.contains("vc-header-logo-img") || img.classList.contains("vc-premium-footer__logo-img")) {
            continue;
          }
          if (img.classList.contains("vc-discord-login-emoji") || img.classList.contains("discord-avatar-img")) {
            continue;
          }
          var src = String(img.getAttribute("src") || "");
          if (!/\.gif(\?|$)/i.test(src)) continue;
          if (/cdn\.discordapp\.com|media\.discordapp\.net/i.test(src)) {
            try {
              if (!img.getAttribute("data-vc-gif-live")) img.setAttribute("data-vc-gif-live", src);
              img.setAttribute("src", src.replace(/\.gif(\?|$)/i, ".webp$1"));
            } catch (eWp) {}
          }
        }
        if (i < imgs.length) {
          window.setTimeout(step, 0);
        }
      }
      window.setTimeout(step, 0);
    } catch (eG) {}
  }

  /* cpuQuiet1 + violKill1: tab hidden → congela solo gif note (niente querySelectorAll("img")) */
  function freezeGifDecodeForBg(on) {
    /* perfIdleReflow1: primo chunk deferred — niente sync storm in idle/rAF */
    try {
      var imgs = document.querySelectorAll(
        on
          ? 'img[src*=".gif"], img[src*="og-server-icon"], img[src*="discord.gif"]'
          : "img[data-vc-gif-live]",
      );
      var i = 0;
      var CHUNK = 8;
      function step() {
        var end = Math.min(i + CHUNK, imgs.length);
        for (; i < end; i++) {
          var img = imgs[i];
          if (!img) continue;
          var cur = String(img.getAttribute("src") || "");
          if (on) {
            if (!/\.gif(\?|$)/i.test(cur)) continue;
            if (!img.getAttribute("data-vc-gif-live")) img.setAttribute("data-vc-gif-live", cur);
            if (/cdn\.discordapp\.com|media\.discordapp\.net/i.test(cur)) {
              img.setAttribute("src", cur.replace(/\.gif(\?|$)/i, ".webp$1"));
            } else if (/og-server-icon\.gif/i.test(cur)) {
              img.setAttribute("src", "/images/og-server-icon-still.png?v=20260915footerLogoGif1");
            } else if (/discord\.gif/i.test(cur) && !/discord\.com|cdn\.discord/i.test(cur)) {
              img.setAttribute("src", "/images/discord-still.png?v=20260915footerLogoGif1");
            }
          } else {
            var live = img.getAttribute("data-vc-gif-live");
            if (!live) continue;
            if (/og-server-icon-still|discord-still/i.test(cur) && /\.gif(\?|$)/i.test(live)) {
              img.setAttribute("src", live);
            }
          }
        }
        if (i < imgs.length) {
          window.setTimeout(step, 0);
        }
      }
      window.setTimeout(step, 0);
    } catch (eFr) {}
  }

  function cancelRunningCssAnimations() {
    /* perfIdleReflow1: getAnimations() = Forced reflow (fino a ~1s) — CSS nuke basta */
    return;
  }

  /* alias legacy */
  function cancelPwaCssAnimations() {
    cancelRunningCssAnimations();
  }

  /* perfIdleReflow1: idle budget-aware; no timeout:1600 (forza run a caldo → Violation) */
  function deferHeavy(fn) {
    var ran = false;
    function run() {
      if (ran) return;
      ran = true;
      try {
        fn();
      } catch (eF) {}
    }
    try {
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(
          function (deadline) {
            try {
              if (deadline && typeof deadline.timeRemaining === "function" && deadline.timeRemaining() < 6) {
                window.setTimeout(run, 0);
                return;
              }
            } catch (eDl) {}
            run();
          },
          { timeout: 8000 },
        );
        return;
      }
    } catch (eRic) {}
    window.setTimeout(run, 48);
  }

  /* cpuQuiet1: BG freeze per TUTTI (browser + PWA). Solo pause/freeze, zero tocchi a soft-fx/gradient. */
  function armGlobalCpuQuiet() {
    if (window.__vcCpuQuietArmed) return;
    window.__vcCpuQuietArmed = 1;
    function sleep() {
      /* violKill1: sync solo class — gif/anim deferred */
      try {
        document.documentElement.classList.add("vc-page-hidden", "vc-ui-gif-paused");
      } catch (eCls) {}
      try {
        window.dispatchEvent(new CustomEvent("vc:cpu-sleep"));
      } catch (eEv) {}
      deferHeavy(function () {
        freezeGifDecodeForBg(true);
      });
    }
    function wake() {
      try {
        document.documentElement.classList.remove(
          "vc-page-hidden",
          "vc-ui-gif-paused",
          "vc-pwa-bg-frozen",
          "vc-gif-paused",
          "vc-photo-idle",
        );
      } catch (eRm) {}
      try {
        window.dispatchEvent(new CustomEvent("vc:cpu-wake"));
      } catch (eEv2) {}
      deferHeavy(function () {
        freezeGifDecodeForBg(false);
      });
    }
    function sync() {
      /* perfIdleReflow1: class sync in rAF; heavy fuori (no nested idle→idle) */
      try {
        if (document.hidden || document.visibilityState === "hidden") sleep();
        else wake();
      } catch (eSy) {
        try {
          wake();
        } catch (eW) {}
      }
    }
    try {
      document.addEventListener("visibilitychange", sync, false);
      window.addEventListener("pageshow", sync, false);
      window.addEventListener(
        "pagehide",
        function () {
          try {
            document.documentElement.classList.add("vc-page-hidden", "vc-ui-gif-paused");
          } catch (ePh) {}
          deferHeavy(function () {
            freezeGifDecodeForBg(true);
          });
        },
        false,
      );
      window.setTimeout(sync, 0);
      window.setTimeout(function () {
        deferHeavy(stillDiscordContentGifs);
      }, 1200);
    } catch (eArm) {}
  }

  /* cpuPagesIdle1: non-home — soft kill filter/GIF/anim (home resta piena) */
  function armSiteCpuSoft() {
    if (isStandalonePwa()) return;
    try {
      var root = document.documentElement;
      if (!document.body) {
        if (!window.__vcSiteCpuSoftWaitBody) {
          window.__vcSiteCpuSoftWaitBody = 1;
          document.addEventListener(
            "DOMContentLoaded",
            function () {
              window.__vcSiteCpuSoftWaitBody = 0;
              armSiteCpuSoft();
            },
            { once: true },
          );
        }
        /* pathname-only: marca soft subito se non-home */
        if (!isHomePage()) root.classList.add("vc-site-cpu-soft");
        return;
      }
      var soft = !isHomePage();
      root.classList.toggle("vc-site-cpu-soft", soft);
      if (!soft) {
        var oldOff = document.getElementById("vc-site-cpu-soft-css");
        if (oldOff && oldOff.parentNode) {
          try {
            oldOff.parentNode.removeChild(oldOff);
          } catch (eRmOff) {}
        }
        return;
      }
      var id = "vc-site-cpu-soft-css";
      if (window.__vcSiteCpuSoftOneShot && document.getElementById(id)) {
        remountSiteCpuSoftCssLast();
        stillDiscordContentGifs();
        return;
      }
      var existing = document.getElementById(id);
      if (existing) {
        try {
          if (existing.parentNode) existing.parentNode.removeChild(existing);
        } catch (eRmEx) {}
      }
      var s = document.createElement("style");
      s.id = id;
      s.setAttribute("data-vc", "cpuPagesIdle1");
      s.textContent =
        "html.vc-site-cpu-soft body.vc-body .vc-forbidden-book," +
        "html.vc-site-cpu-soft body.vc-body .vc-forbidden-book--flying{" +
        "display:none!important}" +
        "html.vc-site-cpu-soft{" +
        "--vc-nav-glow-angle:0deg!important}" +
        /* header chrome glow (drop-shadow + GIF) = idle CPU */
        "html.vc-site-cpu-soft.vc-site-polish body.vc-body header .vc-header-logo-link," +
        "html.vc-site-cpu-soft.vc-site-polish body.vc-body header .vc-notif-summary," +
        "html.vc-site-cpu-soft.vc-site-polish body.vc-body header .vc-lang-toggle," +
        "html.vc-site-cpu-soft.vc-site-polish body.vc-body header .discord-account-btn," +
        "html.vc-site-cpu-soft.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-summary," +
        "html.vc-site-cpu-soft.vc-site-polish body.vc-body header .vc-nav-shell," +
        "html.vc-site-cpu-soft.vc-site-polish body.vc-body header .vc-nav-shell.vc-glass," +
        "html.vc-site-cpu-soft.vc-site-polish body.vc-body header .vc-nav-shell::before," +
        "html.vc-site-cpu-soft.vc-site-polish body.vc-body header .vc-nav-shell::after," +
        "html.vc-site-cpu-soft.vc-site-polish body.vc-body footer .vc-premium-footer__outer," +
        "html.vc-site-cpu-soft.vc-site-polish body.vc-body footer .vc-premium-footer__outer::after," +
        "html.vc-site-cpu-soft.vc-site-polish body.vc-body footer .vc-premium-footer__wordmark," +
        "html.vc-site-cpu-soft.vc-site-polish body.vc-body .vc-soft-vote-glow," +
        "html.vc-site-cpu-soft.vc-site-polish body.vc-body .vc-soft-vote-glow::before," +
        "html.vc-site-cpu-soft.vc-site-polish body.vc-body .vc-soft-vote-glow::after{" +
        "filter:none!important;-webkit-filter:none!important;" +
        "backdrop-filter:none!important;-webkit-backdrop-filter:none!important;" +
        "animation:none!important}" +
        /* page-cine cards: no filter/blur compositing — NO content-visibility
           (ulCountStick1: content-vis spezzava grid 9 card + countup IO flash 0) */
        "html.vc-site-cpu-soft body.vc-page-cine-layout :is(" +
        ".vc-page-cine-card,.vc-fx-card,.vc-home-panel,.vc-glass,.vc-hero-head," +
        ".vc-faq-group,.vc-faq-item,.vc-regole-card,.vc-role-card,.vc-ul-card," +
        ".vc-wiki-cmd-shell,.vc-reviews-card,.vc-reviews-formcard,.vc-legal-card," +
        ".vc-perks-card,.vc-staff-block,.vc-sponsor-card,.vc-sponsor-embed," +
        ".vc-candidature-card,.vc-snav-panel,.vc-notif-panel,.discord-account-popover" +
        "){" +
        "filter:none!important;-webkit-filter:none!important;" +
        "backdrop-filter:none!important;-webkit-backdrop-filter:none!important}" +
        "html.vc-site-cpu-soft body.vc-users-page #vc-ul-grid," +
        "html.vc-site-cpu-soft body.vc-users-page .vc-ul-grid," +
        "html.vc-site-cpu-soft body.vc-users-page .vc-ul-card," +
        "html.vc-site-cpu-soft body.vc-users-page .vc-notify-stat," +
        "html.vc-site-cpu-soft body.vc-roles-page .vc-role-card," +
        "html.vc-site-cpu-soft body.vc-roles-page #vc-roles-grid{" +
        "content-visibility:visible!important;contain:none!important;" +
        "contain-intrinsic-size:none!important}" +
        "@media (min-width:1024px){" +
        "html.vc-site-cpu-soft body.vc-users-page #vc-ul-grid," +
        "html.vc-site-cpu-soft body.vc-users-page .vc-ul-grid{" +
        "grid-template-columns:repeat(3,minmax(0,1fr))!important}}" +
        "html.vc-site-cpu-soft body.vc-page-cine-layout :is(" +
        ".vc-page-cine-card,.vc-fx-card,.vc-home-panel,.vc-faq-group,.vc-regole-card," +
        ".vc-role-card,.vc-ul-card,.vc-wiki-cmd-shell,.vc-reviews-card,.vc-legal-card," +
        ".vc-perks-card,.vc-staff-block" +
        ")::before," +
        "html.vc-site-cpu-soft body.vc-page-cine-layout :is(" +
        ".vc-page-cine-card,.vc-fx-card,.vc-home-panel,.vc-faq-group,.vc-regole-card," +
        ".vc-role-card,.vc-ul-card,.vc-wiki-cmd-shell,.vc-reviews-card,.vc-legal-card," +
        ".vc-perks-card,.vc-staff-block" +
        ")::after{" +
        "filter:none!important;-webkit-filter:none!important;" +
        "animation:none!important;backdrop-filter:none!important}" +
        "html.vc-site-cpu-soft body.vc-body .is-marquee:not(.vc-header-site-name)," +
        "html.vc-site-cpu-soft body.vc-body .vc-marquee__track{" +
        "animation:none!important;transform:none!important}" +
        /* navMarqueeConfStaff1: brand wordmark track resta vivo anche in cpu-soft */
        "html.vc-site-cpu-soft body.vc-body header a.vc-header-site-name.is-marquee .vc-header-site-name__track{" +
        "animation-name:vc-guild-name-marquee!important;" +
        "animation-duration:var(--vc-marquee-duration,12s)!important;" +
        "animation-timing-function:linear!important;" +
        "animation-iteration-count:infinite!important;" +
        "animation-delay:0.35s!important;" +
        "animation-fill-mode:none!important;" +
        "animation-play-state:running!important;" +
        "will-change:transform!important}";
      var mount = document.body || document.head || root;
      mount.appendChild(s);
      window.__vcSiteCpuSoftOneShot = 1;
      /* ulCountStick1: NO cancelPwaCssAnimations — spegneva countup / layout mid-boot */
      /* perfIdleReflow1: gif still deferred */
      deferHeavy(stillDiscordContentGifs);
      window.setTimeout(function () {
        remountSiteCpuSoftCssLast();
        deferHeavy(stillDiscordContentGifs);
      }, 900);
    } catch (eSoft) {}
  }

  /* pwaIdleCpu1: riporta nuke-css DOPO soft-fx pin (altrimenti glow/marquee vincono) */
  function remountNukeCssLast() {
    if (!isStandalonePwa()) return;
    try {
      var s = document.getElementById("vc-pwa-cpu-nuke-css");
      if (!s) return;
      var mount = document.body || document.documentElement;
      if (s.parentNode === mount && mount.lastChild === s) return;
      mount.appendChild(s);
    } catch (eRm) {}
  }

  function cineStillUrlFor(photo) {
    try {
      var src = String((photo && (photo.getAttribute("src") || photo.src)) || "");
      if (/sfondo-mobile/i.test(src)) return "/images/sfondo-mobile-still.webp?v=20260929bgIdealSize1";
      if (window.matchMedia && window.matchMedia("(max-width:639.98px)").matches) {
        return "/images/sfondo-mobile-still.webp?v=20260929bgIdealSize1";
      }
    } catch (eStill) {}
    return "/images/sfondo-still.webp?v=20260929bgIdealSize1";
  }

  function cineGifUrlFor(photo) {
    /* bgIdealSize1: stesso still hi-res (niente GIF bassa res) */
    return cineStillUrlFor(photo);
  }

  function applyCineGifStillSwap(on) {
    /* bgIdealSize1: sempre still hi-res; on=true non cambia asset */
    try {
      var photos = document.querySelectorAll("img.vc-home-cine__photo, .vc-home-cine img[src*='sfondo']");
      for (var i = 0; i < photos.length; i++) {
        var photo = photos[i];
        if (!photo || !photo.tagName || photo.tagName.toLowerCase() !== "img") continue;
        if (photo.classList.contains("discord-avatar-img") || photo.classList.contains("vc-avatar")) continue;
        var want = cineStillUrlFor(photo);
        var cur = String(photo.getAttribute("src") || "");
        if (cur.indexOf(want.split("?")[0]) < 0) {
          photo.setAttribute("src", want);
        }
      }
    } catch (eSwap) {}
  }

  function setPwaBgFrozen(on) {
    try {
      var hidden = false;
      try {
        hidden = Boolean(document.hidden || document.visibilityState === "hidden");
      } catch (eH) {}
      document.documentElement.classList.toggle("vc-page-hidden", hidden);
      document.documentElement.classList.remove("vc-ui-gif-paused", "vc-pwa-bg-frozen", "vc-photo-idle");
      if (!hidden) document.documentElement.classList.remove("vc-gif-paused");
    } catch (eCls) {}
    /* bgGifRestore1: still solo hidden; thaw → GIF */
    applyCineGifStillSwap(Boolean(on) || Boolean(document.hidden));
    if (!on && !document.hidden) {
      try {
        window.dispatchEvent(new CustomEvent("vc:pwa-bg-thaw"));
      } catch (eEv2) {}
    }
  }

  function pwaShouldFreezeBg() {
    try {
      if (document.visibilityState === "hidden" || document.hidden) return true;
    } catch (eH) {}
    return false;
  }

  /* bgGifRestore1 + cpuQuiet1 + perfIdleReflow1: PWA — still tab hidden; quiet GIFs (idle budget) */
  function armPwaIdleGifFreeze() {
    if (!isStandalonePwa()) return;
    if (window.__vcPwaGifFreezeArmed) return;
    window.__vcPwaGifFreezeArmed = 1;
    var lastHidden = null;
    function syncVis() {
      var hidden = false;
      try {
        hidden = Boolean(document.hidden || document.visibilityState === "hidden");
      } catch (eH) {
        hidden = false;
      }
      if (lastHidden === hidden) return;
      lastHidden = hidden;
      try {
        if (hidden) {
          document.documentElement.classList.add("vc-page-hidden", "vc-gif-paused");
        } else {
          document.documentElement.classList.remove(
            "vc-page-hidden",
            "vc-gif-paused",
            "vc-ui-gif-paused",
            "vc-pwa-bg-frozen",
            "vc-photo-idle",
          );
        }
      } catch (eCls) {}
      /* perfIdleReflow1: un solo job leggero; swap/freeze chunked fuori dall'idle */
      deferHeavy(function () {
        try {
          applyCineGifStillSwap(hidden);
        } catch (eSw) {}
        freezeGifDecodeForBg(hidden);
        if (!hidden) stillDiscordContentGifs();
      });
    }
    try {
      document.addEventListener("visibilitychange", syncVis, false);
      window.addEventListener("pageshow", syncVis, false);
      window.setTimeout(syncVis, 0);
      /* cpuIdleHard1: NO keepalive / no multi-sync 400/1200 */
      if (window.__vcPwaAnimKeepAlive) {
        try {
          window.clearInterval(window.__vcPwaAnimKeepAlive);
        } catch (eClr) {}
        window.__vcPwaAnimKeepAlive = 0;
      }
    } catch (eArm) {}
  }

  /* pwaIdleCpu1: Niente walk su body * (getComputedStyle × N = picchi 50–60% al cambio pagina).
     Solo nodi noti con blur/drop-shadow. */
  function stripPwaComputedFilters() {
    if (!isStandalonePwa()) return;
    try {
      var nodes = document.querySelectorAll(
        "header .vc-nav-shell, header .vc-nav-shell.vc-glass," +
          "header .vc-header-logo-link, header .vc-notif-summary," +
          "header .vc-lang-toggle, header .discord-account-btn," +
          "header img, header .vc-brand-glow," +
          "footer .vc-premium-footer__outer, footer .vc-premium-footer__wordmark," +
          ".vc-glass, .vc-fx-card, .vc-page-cine-card, .vc-home-panel," +
          ".vc-snav-panel, .vc-notif-panel, .discord-account-popover," +
          ".vc-soft-vote-glow, .vc-stat-num, .vc-stat-num-inner, .vc-home-deck__title",
      );
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        try {
          el.style.setProperty("filter", "none", "important");
          el.style.setProperty("-webkit-filter", "none", "important");
          el.style.setProperty("backdrop-filter", "none", "important");
          el.style.setProperty("-webkit-backdrop-filter", "none", "important");
        } catch (eEl) {}
      }
    } catch (eStrip) {}
  }

  function armPwaCpuNuke() {
    if (!isStandalonePwa()) return;
    try {
      var root = document.documentElement;
      /* cpuThrashOff1: one-shot. Prima: delete/recreate style + MO remount/cancel
         su ogni class change = picchi 15–50% (peggio delle GIF). */
      var id = "vc-pwa-cpu-nuke-css";
      if (window.__vcPwaNukeOneShot && document.getElementById(id)) {
        remountNukeCssLast();
        return;
      }
      /* swStorageCpu2: ready subito + kill blur mirato; GIF resta attiva finché non idle. */
      root.classList.add(
        "vc-pwa-cpu-nuke",
        "vc-soft-fx-ready",
        "vc-site-polish",
        "vc-cine-curtain-off",
        "vc-cursor-trail-off",
      );
      root.classList.remove("vc-soft-fx-off", "vc-perf-lite", "vc-interaction-hold");
      window.__VC_PWA_CPU_NUKE = 1;
      try {
        if (typeof window.__vcReleaseInteractionHold === "function") window.__vcReleaseInteractionHold();
      } catch (eRel) {}
      var existingNuke = document.getElementById(id);
      if (existingNuke) {
        try {
          if (existingNuke.parentNode) existingNuke.parentNode.removeChild(existingNuke);
        } catch (eRm) {}
        existingNuke = null;
      }
      var s = document.createElement("style");
      s.id = id;
      s.setAttribute("data-vc", "bgGifRestore1");
      /* bgGifRestore1: GIF sfondo ok; resta kill anim/blur pesanti. */
      s.textContent =
        "html.vc-pwa-cpu-nuke body.vc-body .vc-forbidden-book," +
        "html.vc-pwa-cpu-nuke body.vc-body .vc-forbidden-book--flying{" +
        "display:none!important}" +
        "html.vc-pwa-cpu-nuke{" +
        "--vc-nav-glow-angle:0deg!important;" +
        "--vc-cine-aura-op:0.78!important;" +
        "--vc-cine-aura-b1:30px!important;--vc-cine-aura-s1:5px!important;" +
        "--vc-cine-aura-b2:62px!important;--vc-cine-aura-s2:14px!important;" +
        "--vc-cine-aura-b3:104px!important;--vc-cine-aura-s3:28px!important}" +
        "html.vc-pwa-cpu-nuke.vc-site-polish:not(.vc-soft-fx-off) body.vc-body," +
        "html.vc-pwa-cpu-nuke.vc-site-polish:not(.vc-soft-fx-off) body.vc-body *," +
        "html.vc-pwa-cpu-nuke.vc-site-polish:not(.vc-soft-fx-off) body.vc-body *::before," +
        "html.vc-pwa-cpu-nuke.vc-site-polish:not(.vc-soft-fx-off) body.vc-body *::after," +
        "html.vc-pwa-cpu-nuke.vc-soft-fx-ready.vc-site-polish:not(.vc-soft-fx-off) body.vc-body *," +
        "html.vc-pwa-cpu-nuke.vc-soft-fx-ready.vc-site-polish:not(.vc-soft-fx-off) body.vc-body *::before," +
        "html.vc-pwa-cpu-nuke.vc-soft-fx-ready.vc-site-polish:not(.vc-soft-fx-off) body.vc-body *::after{" +
        "animation:none!important;animation-name:none!important;" +
        "animation-duration:0s!important;animation-iteration-count:1!important;" +
        "animation-play-state:paused!important;" +
        "transition:none!important;scroll-behavior:auto!important;" +
        "filter:none!important;-webkit-filter:none!important;" +
        "backdrop-filter:none!important;-webkit-backdrop-filter:none!important}" +
        /* pwaFgCpu1b: batte soft-fx drop-shadow (logo/bell/stat) — stessa catena + * */
        "html.vc-pwa-cpu-nuke.vc-pwa-cpu-nuke.vc-site-polish:not(.vc-soft-fx-off) body.vc-body header *," +
        "html.vc-pwa-cpu-nuke.vc-pwa-cpu-nuke.vc-site-polish:not(.vc-soft-fx-off) body.vc-body main *," +
        "html.vc-pwa-cpu-nuke.vc-pwa-cpu-nuke.vc-site-polish:not(.vc-soft-fx-off) body.vc-body footer *," +
        "html.vc-pwa-cpu-nuke.vc-pwa-cpu-nuke.vc-site-polish:not(.vc-soft-fx-off) body.vc-body header *::before," +
        "html.vc-pwa-cpu-nuke.vc-pwa-cpu-nuke.vc-site-polish:not(.vc-soft-fx-off) body.vc-body header *::after," +
        "html.vc-pwa-cpu-nuke.vc-pwa-cpu-nuke.vc-site-polish:not(.vc-soft-fx-off) body.vc-body main *::before," +
        "html.vc-pwa-cpu-nuke.vc-pwa-cpu-nuke.vc-site-polish:not(.vc-soft-fx-off) body.vc-body main *::after," +
        "html.vc-pwa-cpu-nuke.vc-pwa-cpu-nuke.vc-site-polish body.vc-body header *," +
        "html.vc-pwa-cpu-nuke.vc-pwa-cpu-nuke.vc-site-polish body.vc-body main *," +
        "html.vc-pwa-cpu-nuke.vc-pwa-cpu-nuke.vc-site-polish body.vc-body footer *," +
        "html.vc-pwa-cpu-nuke.vc-pwa-cpu-nuke body.vc-body header *," +
        "html.vc-pwa-cpu-nuke.vc-pwa-cpu-nuke body.vc-body main *," +
        "html.vc-pwa-cpu-nuke.vc-pwa-cpu-nuke body.vc-body footer *{" +
        "filter:none!important;-webkit-filter:none!important;" +
        "backdrop-filter:none!important;-webkit-backdrop-filter:none!important}" +
        "html.vc-pwa-cpu-nuke.vc-site-polish:not(.vc-soft-fx-off) body.vc-body header .vc-nav-shell," +
        "html.vc-pwa-cpu-nuke.vc-site-polish:not(.vc-soft-fx-off) body.vc-body header .vc-nav-shell.vc-glass," +
        "html.vc-pwa-cpu-nuke.vc-site-polish:not(.vc-soft-fx-off) body.vc-body header .vc-nav-shell.vc-nav-shell--scrolled," +
        "html.vc-pwa-cpu-nuke.vc-site-polish:not(.vc-soft-fx-off) body.vc-body header .vc-nav-shell::before," +
        "html.vc-pwa-cpu-nuke.vc-site-polish:not(.vc-soft-fx-off) body.vc-body header .vc-nav-shell::after," +
        "html.vc-pwa-cpu-nuke.vc-site-polish:not(.vc-soft-fx-off) body.vc-body > footer.vc-premium-footer .vc-premium-footer__outer," +
        "html.vc-pwa-cpu-nuke.vc-site-polish:not(.vc-soft-fx-off) body.vc-body > footer.vc-premium-footer .vc-premium-footer__outer::after," +
        "html.vc-pwa-cpu-nuke.vc-site-polish:not(.vc-soft-fx-off) body.vc-body footer.vc-premium-footer .vc-premium-footer__outer::after," +
        "html.vc-pwa-cpu-nuke.vc-site-polish:not(.vc-soft-fx-off) body.vc-body--home > main :is(.vc-stat-num,.vc-stat-num-inner,.vc-stat-247,.vc-home-deck__title,.vc-brand-glow)," +
        "html.vc-pwa-cpu-nuke.vc-site-polish:not(.vc-soft-fx-off) body.vc-body--home .vc-home-cine-hero :is(.vc-brand-glow,h1.vc-brand-glow,h1,span)," +
        "html.vc-pwa-cpu-nuke.vc-site-polish:not(.vc-soft-fx-off) body.vc-body .vc-soft-vote-glow," +
        "html.vc-pwa-cpu-nuke.vc-site-polish:not(.vc-soft-fx-off) body.vc-body .vc-soft-vote-glow::before," +
        "html.vc-pwa-cpu-nuke.vc-site-polish:not(.vc-soft-fx-off) body.vc-body .vc-soft-vote-glow::after{" +
        "animation:none!important;animation-name:none!important;" +
        "animation-duration:0s!important;animation-play-state:paused!important;" +
        "filter:none!important;-webkit-filter:none!important}" +
        "html.vc-pwa-cpu-nuke body.vc-body .is-marquee:not(.vc-header-site-name)," +
        "html.vc-pwa-cpu-nuke body.vc-body .vc-marquee__track{" +
        "animation:none!important;transform:none!important}" +
        "html.vc-pwa-cpu-nuke.vc-pwa-cpu-nuke body.vc-body header a.vc-header-site-name.is-marquee .vc-header-site-name__track," +
        "html.vc-pwa-cpu-nuke.vc-site-polish body.vc-body header a.vc-header-site-name.is-marquee .vc-header-site-name__track{" +
        "animation-name:vc-guild-name-marquee!important;" +
        "animation-duration:var(--vc-marquee-duration,12s)!important;" +
        "animation-timing-function:linear!important;" +
        "animation-iteration-count:infinite!important;" +
        "animation-delay:0.35s!important;" +
        "animation-fill-mode:none!important;" +
        "animation-play-state:running!important;" +
        "will-change:transform!important}" +
        "html.vc-pwa-cpu-nuke body.vc-body header .vc-nav-shell," +
        "html.vc-pwa-cpu-nuke body.vc-body header .vc-nav-shell.vc-glass," +
        "html.vc-pwa-cpu-nuke body.vc-body header .vc-nav-shell.vc-nav-shell--scrolled," +
        "html.vc-pwa-cpu-nuke.vc-soft-fx-ready.vc-site-polish:not(.vc-soft-fx-off) body.vc-body header .vc-nav-shell," +
        "html.vc-pwa-cpu-nuke.vc-soft-fx-ready.vc-site-polish:not(.vc-soft-fx-off) body.vc-body header .vc-nav-shell.vc-glass," +
        "html.vc-pwa-cpu-nuke.vc-soft-fx-ready.vc-site-polish:not(.vc-soft-fx-off) body.vc-body header .vc-nav-shell.vc-nav-shell--scrolled{" +
        "backdrop-filter:none!important;-webkit-backdrop-filter:none!important;" +
        "filter:none!important;" +
        "box-shadow:0 4px 18px rgba(0,0,0,.45)!important;" +
        "background-color:rgba(20,15,12,.92)!important;" +
        "background-image:linear-gradient(175deg,rgba(36,28,22,.95) 0%,rgba(20,15,12,.94) 52%,rgba(12,9,7,.96) 100%)!important}" +
        "html.vc-pwa-cpu-nuke body.vc-body .vc-glass," +
        "html.vc-pwa-cpu-nuke body.vc-body .vc-fx-card," +
        "html.vc-pwa-cpu-nuke body.vc-body .vc-page-cine-card," +
        "html.vc-pwa-cpu-nuke body.vc-body .vc-home-panel," +
        "html.vc-pwa-cpu-nuke body.vc-body .vc-hero-head," +
        "html.vc-pwa-cpu-nuke body.vc-body .vc-snav-panel," +
        "html.vc-pwa-cpu-nuke body.vc-body .vc-notif-panel," +
        "html.vc-pwa-cpu-nuke body.vc-body .discord-account-popover{" +
        "backdrop-filter:none!important;-webkit-backdrop-filter:none!important;" +
        "filter:none!important;-webkit-filter:none!important;" +
        "box-shadow:0 6px 20px rgba(0,0,0,.4)!important}" +
        "html.vc-pwa-cpu-nuke body.vc-notifications-page main > section," +
        "html.vc-pwa-cpu-nuke body.vc-notifications-page #vc-staff-inbox," +
        "html.vc-pwa-cpu-nuke body.vc-notifications-page #vc-staff-inbox-list," +
        "html.vc-pwa-cpu-nuke body.vc-notifications-page .vc-notif-staff-inbox," +
        "html.vc-pwa-cpu-nuke body.vc-notifications-page #vc-notif-pane-staff," +
        "html.vc-pwa-cpu-nuke body.vc-notifications-page #vc-notif-pane-personal," +
        "html.vc-pwa-cpu-nuke .vc-feedback-sheet," +
        "html.vc-pwa-cpu-nuke .vc-staff-reso-sheet," +
        "html.vc-pwa-cpu-nuke .vc-staff-stat-sheet," +
        "html.vc-pwa-cpu-nuke .vc-staff-manage-sheet," +
        "html.vc-pwa-cpu-nuke .vc-notif-panel{" +
        "content-visibility:visible!important}" +
        "html.vc-pwa-cpu-nuke.vc-notif-drawer-open body.vc-body .vc-notif-dropdown[open] .vc-notif-panel," +
        "html.vc-pwa-cpu-nuke.vc-notif-sheet-open body.vc-body .vc-notif-dropdown[open] .vc-notif-panel{" +
        "opacity:1!important;visibility:visible!important}" +
        "html.vc-pwa-cpu-nuke:not(.vc-soft-fx-ready) body.vc-body>header," +
        "html.vc-pwa-cpu-nuke:not(.vc-soft-fx-ready) body.vc-body>main," +
        "html.vc-pwa-cpu-nuke:not(.vc-soft-fx-ready) body.vc-body>footer{" +
        "opacity:1!important;visibility:visible!important;pointer-events:auto!important}" +
        /* bgGifRestore1: niente content-visibility sul photo (congela/skip GIF frames) */
        "html.vc-pwa-cpu-nuke body.vc-body .vc-home-cine__photo{" +
        "filter:none!important;-webkit-filter:none!important;" +
        "transform:none!important;will-change:auto!important;" +
        "animation:none!important;content-visibility:visible!important;contain:none!important}" +
        "html.vc-pwa-cpu-nuke body.vc-body .vc-home-cine__canvas{" +
        "display:none!important;visibility:hidden!important;" +
        "animation:none!important;pointer-events:none!important}";
      /* Append in coda a body così batte soft-fx.css in cascata (pari specificità). */
      var mount = document.body || document.head || root;
      mount.appendChild(s);
      window.__vcPwaNukeOneShot = 1;
      /* perfIdleReflow1: no getAnimations; strip filter in idle (no sync Forced reflow) */
      deferHeavy(function () {
        stripPwaComputedFilters();
      });
      window.setTimeout(function () {
        remountNukeCssLast();
        deferHeavy(stripPwaComputedFilters);
      }, 900);
      armPwaIdleGifFreeze();
      /* swBackPwa1: SW push resta (ensureServiceWorkerRegistration → /sw-m1.js) */
      clearBootHoldWithCurtain();
      window.setTimeout(clearBootHoldWithCurtain, 200);
      window.setTimeout(clearBootHoldWithCurtain, 800);
    } catch (eNuke) {}
  }

  function clearPwaOrphanLocks() {
    if (!isStandalonePwa()) return;
    try {
      var root = document.documentElement;
      if (!root.classList.contains("vc-page-cine-ready") && !root.classList.contains("vc-cine-curtain-off")) {
        return;
      }
      root.classList.remove(
        "vc-loading-scroll-lock",
        "vc-loader-blocking-live",
        "vc-interaction-hold",
      );
      try {
        if (typeof window.__vcUnpinPageScroll === "function") window.__vcUnpinPageScroll();
      } catch (eUn) {}
    } catch (eClr) {}
  }
  try {
    armPwaCpuNuke();
    window.setTimeout(clearPwaOrphanLocks, 1800);
    window.setTimeout(clearPwaOrphanLocks, 4000);
  } catch (eArmNuke) {}

  function clearBootHoldWithCurtain() {
    try {
      var root = document.documentElement;
      root.classList.add("vc-soft-fx-ready", "vc-cine-curtain-off");
      /* holdFreezeKill1: mai sipario giù lasciando vc-interaction-hold (cursore loading + click morti) */
      root.classList.remove("vc-interaction-hold");
      if (typeof window.__vcReleaseInteractionHold === "function") {
        try {
          window.__vcReleaseInteractionHold();
        } catch (eRel) {}
      }
    } catch (eClr) {}
  }

  function conn() {
    try {
      return global.navigator && (navigator.connection || navigator.mozConnection || navigator.webkitConnection);
    } catch (e) {
      return null;
    }
  }

  function saveDataOn() {
    try {
      if (conn() && conn().saveData === true) return true;
    } catch (e) {}
    return false;
  }

  function effectiveType() {
    try {
      return String((conn() && conn().effectiveType) || "").toLowerCase();
    } catch (e) {
      return "";
    }
  }

  function isPhoneOrPwa() {
    try {
      if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return true;
      if (
        window.matchMedia &&
        window.matchMedia("(hover: none)").matches &&
        Number(navigator.maxTouchPoints || 0) > 0
      ) {
        return true;
      }
      if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true;
      if (navigator.standalone) return true;
      if ((window.innerWidth || 999) <= 920) return true;
    } catch (e) {}
    return false;
  }

  function detectAutoTier() {
    return isPhoneOrPwa() ? "lite" : FORCE_DESKTOP_TIER;
  }

  function manualPref() {
    return detectAutoTier();
  }

  function tier() {
    /* perfPhoneLite1 marker */
    if (saveDataOn()) return "lite";
    var et = effectiveType();
    if (et === "slow-2g" || et === "2g") return "lite";
    return detectAutoTier();
  }

  function isLite() {
    return tier() === "lite";
  }

  function isMidOrLite() {
    var t = tier();
    return t === "lite" || t === "mid";
  }

  function applyToDocument(forceTier) {
    var t = forceTier || tier() || "mid";
    if (t !== "lite" && t !== "mid" && t !== "full") t = "mid";
    var root = document.documentElement;
    if (!root) return t;
    root.classList.remove("vc-perf-full", "vc-perf-mid", "vc-perf-lite");
    root.classList.add("vc-perf-" + t);
    root.setAttribute("data-vc-perf", t);
    /* phoneFxRestore1: soft-fx/gradient SEMPRE on (telefono incluso) */
    root.classList.remove("vc-soft-fx-off");
    root.classList.add("vc-soft-fx-ready", "vc-site-polish");
    if (t === "lite" || isPhoneOrPwa()) root.classList.add("vc-cursor-trail-off");
    else root.classList.remove("vc-cursor-trail-off");
    /* vc-perf-touch resta per layout touch, ma NON spegne più glass/gradient */
    if (isPhoneOrPwa()) root.classList.add("vc-perf-touch");
    else root.classList.remove("vc-perf-touch");
    if (t !== lastTier) {
      lastTier = t;
      try {
        document.dispatchEvent(new CustomEvent("vc:perf-tier", { detail: { tier: t } }));
      } catch (eEv) {}
    }
    try {
      disableHeavySoftFxSheet();
    } catch (eSoftOff) {}
    return t;
  }

  function disableHeavySoftFxSheet() {
    /* gifGradRestore1: non spegnere più soft-fx.css */
    try {
      clearBootHoldWithCurtain();
    } catch (eDis) {}
  }

  /* phoneFxRestore1: niente kill glass/gradient/glow su telefono —
     solo empty[hidden], pause tab nascosta, no libri volanti. */
  function injectTouchPerfCss() {
    try {
      var existing = document.getElementById("vc-perf-phone-lite1-css");
      if (existing) {
        if (existing.getAttribute("data-vc") === "bgGifRestore1") return;
        if (existing.parentNode) existing.parentNode.removeChild(existing);
      }
      var s = document.createElement("style");
      s.id = "vc-perf-phone-lite1-css";
      s.setAttribute("data-vc", "bgGifRestore1");
      s.textContent =
        "html.vc-perf-mid body.vc-body .vc-forbidden-book--flying," +
        "html.vc-perf-touch body.vc-body .vc-forbidden-book--flying," +
        "html.vc-perf-lite body.vc-body .vc-forbidden-book--flying," +
        "html.vc-soft-fx-off body.vc-body .vc-forbidden-book--flying{" +
        "display:none!important}" +
        "html.vc-page-hidden body.vc-body *," +
        "html.vc-ui-gif-paused body.vc-body *," +
        "html.vc-pwa-bg-frozen body.vc-body *{" +
        "animation-play-state:paused!important}" +
        /* gifNoIdleStill1: pause CSS solo tab nascosta; avatar sempre ok */
        "html.vc-ui-gif-paused body.vc-body header img.discord-avatar-img," +
        "html.vc-pwa-bg-frozen body.vc-body header img.discord-avatar-img," +
        "html.vc-page-hidden body.vc-body header img.discord-avatar-img," +
        "html.vc-ui-gif-paused body.vc-body #header-quick-actions img.discord-avatar-img," +
        "html.vc-pwa-bg-frozen body.vc-body #header-quick-actions img.discord-avatar-img," +
        "html.vc-page-hidden body.vc-body #header-quick-actions img.discord-avatar-img," +
        "html.vc-ui-gif-paused body.vc-body header img.vc-avatar," +
        "html.vc-pwa-bg-frozen body.vc-body header img.vc-avatar," +
        "html.vc-page-hidden body.vc-body header img.vc-avatar{" +
        "visibility:visible!important;content-visibility:visible!important;opacity:1!important}" +
        "html body .vc-notify-empty[hidden]," +
        "html body .vc-staff-inbox-empty[hidden]," +
        "html body .vc-reviews-empty[hidden]," +
        "html.vc-soft-fx-off body .vc-notify-empty[hidden]," +
        "html.vc-soft-fx-off body .vc-staff-inbox-empty[hidden]{" +
        "display:none!important;visibility:hidden!important;opacity:0!important;" +
        "pointer-events:none!important;height:0!important;max-height:0!important;" +
        "margin:0!important;padding:0!important;overflow:hidden!important;border:0!important}" +
        "html.vc-soft-fx-ready.vc-site-polish:not(.vc-soft-fx-off):not(.vc-pwa-cpu-nuke) body.vc-body header .vc-nav-shell," +
        "html.vc-soft-fx-ready.vc-site-polish:not(.vc-soft-fx-off):not(.vc-pwa-cpu-nuke) body.vc-body header .vc-nav-shell.vc-glass," +
        "html.vc-soft-fx-ready.vc-site-polish:not(.vc-soft-fx-off):not(.vc-pwa-cpu-nuke) body.vc-body header .vc-nav-shell.vc-nav-shell--scrolled{" +
        /* cpuAnimSoft1: nav già fill opaco — blur(18px) era costo a vuoto (~CPU idle) */
        "backdrop-filter:none!important;" +
        "-webkit-backdrop-filter:none!important;" +
        "filter:none!important;" +
        "box-shadow:none!important}";
      (document.head || document.documentElement).appendChild(s);
    } catch (eCss) {}
  }

  function fetchTimeouts(base) {
    var b = base && typeof base === "object" ? base : {};
    var fetchTimeoutMs = Math.max(1000, Number(b.fetchTimeoutMs) || 12000);
    var failsafeMs = Math.max(fetchTimeoutMs, Number(b.failsafeMs) || 35000);
    var t = tier();
    if (t === "lite") {
      fetchTimeoutMs = Math.max(fetchTimeoutMs, 24000);
      failsafeMs = Math.max(failsafeMs, 48000);
    } else if (t === "mid") {
      fetchTimeoutMs = Math.max(fetchTimeoutMs, 18000);
      failsafeMs = Math.max(failsafeMs, 42000);
    }
    return { fetchTimeoutMs: fetchTimeoutMs, failsafeMs: failsafeMs, tier: t };
  }

  function shouldAttachApiHeaders(url) {
    try {
      var base =
        typeof location !== "undefined" && location.origin ? location.origin : "https://localhost";
      var u = new URL(String(url || ""), base);
      if (typeof location !== "undefined" && u.origin !== location.origin) return false;
      return String(u.pathname || "").indexOf("/webhooks/") === 0;
    } catch (e) {
      return false;
    }
  }

  function apiHeaders(extra, url) {
    var out = extra && typeof extra === "object" ? Object.assign({}, extra) : {};
    if (url && !shouldAttachApiHeaders(url)) return out;
    out["X-VC-Perf"] = tier();
    if (saveDataOn()) out["Save-Data"] = "on";
    return out;
  }

  function apiQuery(params) {
    var out = params && typeof params === "object" ? Object.assign({}, params) : {};
    var t = tier();
    if (t === "lite") {
      out.lite = "1";
      out.perf = "lite";
    } else if (t === "mid") {
      out.perf = "mid";
    }
    return out;
  }

  function leaderboardPerPage(defaultN) {
    /* ulNineAlways1: sempre 9 (niente cap lite→6) */
    var n = Math.max(1, Number(defaultN) || 9);
    return Math.max(n, 9);
  }

  function notificationsLimit(defaultN) {
    var n = Math.max(1, Number(defaultN) || 50);
    var t = tier();
    if (t === "lite") return Math.min(n, 30);
    if (t === "mid") return Math.min(n, 50);
    return n;
  }

  function setPref() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
    var t = applyToDocument();
    injectTouchPerfCss();
    return t;
  }

  var api = {
    __ready: true,
    tier: tier,
    isLite: isLite,
    isMidOrLite: isMidOrLite,
    isPhoneOrPwa: isPhoneOrPwa,
    isStandalonePwa: isStandalonePwa,
    isHomePage: isHomePage,
    armPwaCpuNuke: armPwaCpuNuke,
    armGlobalCpuQuiet: armGlobalCpuQuiet,
    stillDiscordContentGifs: stillDiscordContentGifs,
    armSiteCpuSoft: armSiteCpuSoft,
    remountNukeCssLast: remountNukeCssLast,
    remountSiteCpuSoftCssLast: remountSiteCpuSoftCssLast,
    clearPwaOrphanLocks: clearPwaOrphanLocks,
    apply: applyToDocument,
    fetchTimeouts: fetchTimeouts,
    shouldAttachApiHeaders: shouldAttachApiHeaders,
    apiHeaders: apiHeaders,
    apiQuery: apiQuery,
    leaderboardPerPage: leaderboardPerPage,
    notificationsLimit: notificationsLimit,
    setPref: setPref,
    getPref: manualPref,
    saveDataOn: saveDataOn,
    effectiveType: effectiveType,
    forcedTier: FORCE_DESKTOP_TIER,
  };

  global.VcPerf = api;
  try {
    armGlobalCpuQuiet();
    armPwaCpuNuke();
    applyToDocument();
    injectTouchPerfCss();
    armPwaCpuNuke();
    armSiteCpuSoft();
    deferHeavy(stillDiscordContentGifs);
  } catch (eInit) {}
  try {
    document.addEventListener("vc:page-cine-ready", function () {
      try {
        armSiteCpuSoft();
      } catch (eReady) {}
    });
    window.addEventListener("pageshow", function () {
      try {
        armSiteCpuSoft();
      } catch (eShow) {}
    });
  } catch (eArmSoftEv) {}

  /* siteApiW6: soft-fx può partire media=print (non-blocking); promote on load. Mai appendChild. */
  try {
    function softSheetOk(link) {
      if (!link) return false;
      /* perfIdleReflow1: non leggere cssRules (Forced reflow) — solo marker/attr */
      try {
        if (link.getAttribute("data-vc-sheet-loaded") === "1") return true;
        if (link.sheet) return true;
      } catch (eOk) {}
      return false;
    }
    function promoteSoft(link) {
      if (!link) return;
      link.id = "vc-soft-fx-css";
      /* gifGradRestore1: attiva sempre soft-fx (gradient/bordi) */
      try {
        link.disabled = false;
        link.removeAttribute("data-vc-soft-disabled");
      } catch (eEn) {}
      link.media = "all";
      link.setAttribute("data-vc-sheet-loaded", "1");
      link.removeAttribute("onload");
      document.querySelectorAll('link[href*="vc-soft-fx.css"]').forEach(function (l) {
        if (l !== link && l.parentNode) l.parentNode.removeChild(l);
      });
      document.documentElement.classList.remove("vc-soft-fx-off");
      document.documentElement.classList.add("vc-soft-fx-ready");
      clearBootHoldWithCurtain();
      /* soft-fx arriva dopo: ri-append nuke CSS in coda + cancel WAAPI */
      try {
        armPwaCpuNuke();
      } catch (eReNuke) {}
      try {
        armSiteCpuSoft();
      } catch (eReSoft) {}
    }
    function markReadyFromSoft() {
      try {
        var softPin = document.getElementById("vc-soft-fx-css");
        if (!softPin) softPin = document.querySelector('link[href*="vc-soft-fx.css"]');
        if (!softPin) return;
        softPin.id = "vc-soft-fx-css";
        if (softSheetOk(softPin) || softPin.getAttribute("data-vc-sheet-loaded") === "1") {
          promoteSoft(softPin);
          return;
        }
        softPin.addEventListener(
          "load",
          function () {
            try {
              promoteSoft(softPin);
            } catch (eLd) {}
          },
          { once: true }
        );
      } catch (ePin2) {}
    }
    function ensureSoftFxLink() {
      try {
        var soft =
          document.getElementById("vc-soft-fx-css") ||
          document.querySelector('link[href*="vc-soft-fx.css"]');
        if (soft) {
          promoteSoft(soft);
          return;
        }
        var l = document.createElement("link");
        l.rel = "stylesheet";
        l.id = "vc-soft-fx-css";
        l.href = "/css/vc-soft-fx.css?v=20260930voteCuePhoneStable1";
        l.media = "all";
        (document.head || document.documentElement).appendChild(l);
        l.addEventListener(
          "load",
          function () {
            try {
              promoteSoft(l);
            } catch (eLd2) {}
          },
          { once: true },
        );
        window.setTimeout(function () {
          try {
            promoteSoft(l);
          } catch (eLd3) {}
        }, 400);
      } catch (eEns) {}
    }
    markReadyFromSoft();
    ensureSoftFxLink();
    window.setTimeout(markReadyFromSoft, 0);
    window.setTimeout(ensureSoftFxLink, 0);
    window.setTimeout(markReadyFromSoft, 200);
    window.setTimeout(ensureSoftFxLink, 200);
    window.setTimeout(markReadyFromSoft, 800);
  } catch (eSoftFx) {}
})(typeof window !== "undefined" ? window : this);
/* violKill1 */
/* extOnlyFix1 */
/* perfIdleReflow1 */
