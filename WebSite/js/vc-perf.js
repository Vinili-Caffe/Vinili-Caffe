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
        var soft = document.getElementById("vc-soft-fx-css") || document.querySelector('link[href*="vc-soft-fx"]');
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
  /* bgCpuHard1 marker — hidden: still GIF+filter kill; fg idle: cine still */
  /* fgDecorCpu1 marker — fg idle: pause decorative infinite + GIF still + no cursor glow */
  /* idleGifGlowFix1: settle hides cursor glow (beat soft-fx); still a_*.webp + logo/avatar GIF */
  /* bgCpuSpike1 marker — hidden: marquee kill (chrome pin running!important) + still sync */
  /* navUserMqFix1 marker — user marquee pause SOLO page-hidden (non ui-gif-paused) */
  /* bgCpuHard2 marker — BG: pause inline marquee (batte CSS) + GIF freeze sync */
  /* pwaStillHard1 marker — PWA: FORCE still sfondo (GIF = 100% CPU; home-cine remounta) */
  /* pwaCpuKill2 marker — PWA: freeze TUTTE le GIF anche a focus; no thaw */
  /* pwaCpuKill3 marker — GIF sfondo+logo OFF sempre; Brave app senza standalone */
  /* pwaCpuKill4 marker — nuke CSS/anim SEMPRE (glow/vinyl/marquee = Browser 90%+) */
  /* pwaCpuKill5 marker — togli body* filter thrash; soft-fx-off; selettori mirati */
  /* fgRevertBgOnly1 marker — revert nuke in-app; quiet solo hidden */
  /* touchFxLite1 marker */

  /* fgRevertBgOnly1: niente FORCE/nuke in foreground — solo quiet a tab/app hidden */
  try {
    window.__VC_FORCE_PHOTO_STILL = 0;
    window.__VC_PWA_FREEZE_ALL_GIF = 0;
    window.__VC_PWA_CPU_NUKE = 0;
    document.documentElement.classList.remove("vc-pwa-cpu-nuke", "vc-cpu-settle", "vc-soft-fx-off");
  } catch (ePwaStillEarly) {}

  /* touchFxLite1: mobile/coarse → meno filter/blur/marquee (anche in home) */
  function armTouchFxLite() {
    try {
      var root = document.documentElement;
      var ua = String((navigator && navigator.userAgent) || "");
      var touch =
        /Mobi|Android|iPhone|iPad|iPod/i.test(ua) ||
        (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
        (typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 1);
      if (!touch) return;
      root.classList.add("vc-perf-touch", "vc-touch-fx-lite");
      var id = "vc-touch-fx-lite-css";
      if (document.getElementById(id)) return;
      var css =
        "html.vc-touch-fx-lite body.vc-body .vc-soft-vote-glow::before," +
        "html.vc-touch-fx-lite body.vc-body .vc-soft-vote-glow::after," +
        "html.vc-touch-fx-lite body.vc-body .vc-brand-glow{" +
        "filter:none!important;-webkit-filter:none!important;animation:none!important}" +
        "html.vc-touch-fx-lite body.vc-body .is-marquee:not(.vc-header-site-name):not([data-vc-nav-user-marquee])," +
        "html.vc-touch-fx-lite body.vc-body .vc-marquee:not([data-vc-nav-user-marquee]) > .vc-marquee__track{" +
        "animation:none!important;transform:none!important}" +
        "html.vc-touch-fx-lite body.vc-body .vc-nav-shell," +
        "html.vc-touch-fx-lite body.vc-body .vc-glass{" +
        "backdrop-filter:none!important;-webkit-backdrop-filter:none!important}";
      var s = document.createElement("style");
      s.id = id;
      s.textContent = css;
      (document.head || document.documentElement).appendChild(s);
    } catch (eTouchLite) {}
  }
  try {
    armTouchFxLite();
  } catch (eTouchBoot) {}

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

  /* boardsAnimBannerClear1 + boardsAnimIconLive1: icone/banner bacheca restano GIF (no demote → webp statico) */
  function isBoardsAnimMediaImg(img) {
    if (!img) return false;
    try {
      if (img.getAttribute("data-vc-anim-media") === "1") return true;
      var cls = img.classList;
      if (
        cls &&
        (cls.contains("vc-boards-detail__icon") ||
          cls.contains("vc-boards-card__icon") ||
          cls.contains("vc-boards-mine-card__icon") ||
          cls.contains("vc-boards-form-hero__img") ||
          cls.contains("vc-boards-vote__icon") ||
          cls.contains("vc-boards-guild-tag__badge"))
      ) {
        return true;
      }
      if (cls && cls.contains("vc-boards-claim-card__ico-img")) return true;
      var src = String(img.getAttribute("src") || img.getAttribute("data-vc-gif-live") || "");
      if (/\/(?:icons|banners|app-icons)\/\d+\//i.test(src)) return true;
    } catch (eSkip) {}
    return false;
  }

  /* idleGifGlowFix1: still animated Discord CDN (gif + a_*.webp avatars) */
  function stillDiscordAnimUrl(src) {
    var s = String(src || "");
    if (!s) return "";
    if (/cdn\.discordapp\.com|media\.discordapp\.net/i.test(s)) {
      if (/\.gif(\?|$)/i.test(s)) return s.replace(/\.gif(\?|$)/i, ".webp$1");
      /* animated avatar/banner hash a_* → static png */
      var m = s.match(/\/(avatars|banners|icons|role-icons)\/([^/]+)\/a_([a-f0-9]+)\.(webp|gif)(\?.*)?$/i);
      if (m) {
        return s.replace(
          /\/(avatars|banners|icons|role-icons)\/([^/]+)\/a_([a-f0-9]+)\.(webp|gif)/i,
          "/$1/$2/$3.png",
        );
      }
    }
    if (/og-server-icon\.gif/i.test(s)) return "/images/og-server-icon-still.png?v=20261014bgCpuHard1";
    if (/discord\.gif/i.test(s) && !/discord\.com|cdn\.discord/i.test(s)) {
      return "/images/discord-still.png?v=20260915footerLogoGif1";
    }
    /* idleGifGlowFix1: View As eye GIF → still frame */
    if (/eyedarkmoving-trans\.gif/i.test(s)) {
      return "/images/eyedarkmoving-trans-still.png?v=20261016idleGifGlowFix1";
    }
    return "";
  }

  function stillDiscordContentGifs() {
    /* idleGifGlowFix1: in settle include avatar/logo GIF+anim webp (prima skippati) */
    try {
      var settle = false;
      try {
        settle = document.documentElement.classList.contains("vc-cpu-settle");
      } catch (eS) {}
      var imgs = document.querySelectorAll(
        settle
          ? 'img[src*=".gif"], img[src*="/a_"][src*=".webp"], img[src*="og-server-icon"], img.vcva-eye, header img, footer img, .discord-avatar-img, .vc-header-logo-img'
          : 'main img[src*=".gif"], #vc-page-content img[src*=".gif"], .vc-page-cine-body img[src*=".gif"], .vc-wiki-cmd-shell img[src*=".gif"], footer img[src*=".gif"]',
      );
      var i = 0;
      var CHUNK = 10;
      function step() {
        var end = Math.min(i + CHUNK, imgs.length);
        for (; i < end; i++) {
          var img = imgs[i];
          if (!img) continue;
          if (!settle) {
            if (img.classList.contains("vc-header-logo-img") || img.classList.contains("vc-premium-footer__logo-img")) {
              continue;
            }
            if (img.getAttribute("data-vc-brand-logo") === "1") continue;
            if (img.classList.contains("vc-discord-login-emoji") || img.classList.contains("discord-avatar-img")) {
              continue;
            }
            if (/og-server-icon/i.test(String(img.getAttribute("src") || ""))) continue;
          }
          if (isBoardsAnimMediaImg(img)) continue;
          var src = String(img.getAttribute("src") || "");
          var next = stillDiscordAnimUrl(src);
          if (!next || next === src) continue;
          try {
            if (!img.getAttribute("data-vc-gif-live")) img.setAttribute("data-vc-gif-live", src);
            img.setAttribute("src", next);
          } catch (eWp) {}
        }
        if (i < imgs.length) {
          window.setTimeout(step, 0);
        }
      }
      window.setTimeout(step, 0);
    } catch (eG) {}
  }

  /* sitePerfAll1 + pageCpuIdle1 + wikiLightIco1:
     - tab hidden / FG settle → pause marquee
     - pause a currentTime=0 + transform identity (no “ITALIA…GAMING” a metà scroll)
     - bustle → running di nuovo */
  function resetMqTrackToStart(el) {
    if (!el || !el.style) return;
    try {
      el.style.setProperty("animation-play-state", "paused", "important");
      el.style.setProperty("-webkit-animation-play-state", "paused", "important");
      el.style.setProperty("will-change", "auto", "important");
      el.style.setProperty("transform", "translate3d(0,0,0)", "important");
    } catch (eSt) {}
    try {
      if (el.__vcMqWaapi) {
        if (typeof el.__vcMqWaapi.currentTime === "number") el.__vcMqWaapi.currentTime = 0;
        if (typeof el.__vcMqWaapi.pause === "function") el.__vcMqWaapi.pause();
      }
    } catch (eWp) {}
    try {
      var list = el.getAnimations ? el.getAnimations() : [];
      for (var ai = 0; ai < list.length; ai++) {
        try {
          list[ai].currentTime = 0;
          list[ai].pause();
        } catch (eA) {}
      }
    } catch (eGa) {}
  }
  function thawMqTrack(el) {
    if (!el || !el.style) return;
    /* wmResumeHover1: transform:0 !important da resetMqTrackToStart
       bloccava i keyframes anche con play-state:running; play() su getAnimations
       altrimenti pause() WAAPI restava stuck dopo BG. */
    try {
      el.style.removeProperty("transform");
    } catch (eTx) {}
    try {
      el.style.setProperty("animation-play-state", "running", "important");
      el.style.setProperty("-webkit-animation-play-state", "running", "important");
      el.style.setProperty("will-change", "transform", "important");
    } catch (ePs) {}
    try {
      if (el.__vcMqWaapi && typeof el.__vcMqWaapi.play === "function") el.__vcMqWaapi.play();
    } catch (eWp) {}
    try {
      var list = el.getAnimations ? el.getAnimations() : [];
      for (var ai = 0; ai < list.length; ai++) {
        try {
          if (typeof list[ai].play === "function") list[ai].play();
        } catch (eA) {}
      }
    } catch (eGa) {}
  }
  function freezeInlineMarqueesForBg(on, keepUserRunning) {
    try {
      var pageHidden = false;
      try {
        pageHidden = Boolean(document.hidden) || document.visibilityState === "hidden";
      } catch (eHid) {}
      var pause = !!(on || pageHidden);
      /* keepUserRunning = keep FG marquees (user + wordmark) */
      var pauseFgMq = !!(pause && !keepUserRunning);
      var userTracks = document.querySelectorAll(
        "header .discord-profile-link__name[data-vc-nav-user-marquee] .vc-marquee__track," +
          "#header-quick-actions .discord-profile-link__name[data-vc-nav-user-marquee] .vc-marquee__track," +
          "#vc-mobile-nav-drawer .discord-profile-link__name[data-vc-nav-user-marquee] .vc-marquee__track," +
          ".vc-mobile-nav-drawer .discord-profile-link__name[data-vc-nav-user-marquee] .vc-marquee__track",
      );
      for (var u = 0; u < userTracks.length; u++) {
        var ut = userTracks[u];
        if (!ut || !ut.style) continue;
        if (pauseFgMq) {
          resetMqTrackToStart(ut);
        } else {
          thawMqTrack(ut);
          ut.style.setProperty("animation-name", "vc-guild-name-marquee", "important");
          ut.style.setProperty("animation-duration", "var(--vc-marquee-duration, 12s)", "important");
          ut.style.setProperty("animation-timing-function", "linear", "important");
          ut.style.setProperty("animation-iteration-count", "infinite", "important");
          ut.style.setProperty("animation-play-state", "running", "important");
          ut.style.setProperty("-webkit-animation-play-state", "running", "important");
          ut.style.setProperty("will-change", "transform", "important");
          try {
            if (ut.__vcMqWaapi && typeof ut.__vcMqWaapi.play === "function") ut.__vcMqWaapi.play();
          } catch (eWr) {}
        }
      }
      var wmTracks = document.querySelectorAll(
        "header a.vc-header-site-name.is-marquee .vc-header-site-name__track," +
          ".vc-mobile-nav-drawer__brand a.vc-header-site-name.is-marquee .vc-header-site-name__track",
      );
      var settleNow = false;
      try {
        settleNow = document.documentElement.classList.contains("vc-cpu-settle");
      } catch (eSt) {}
      for (var w = 0; w < wmTracks.length; w++) {
        var wt = wmTracks[w];
        if (!wt || !wt.style) continue;
        if (pauseFgMq) {
          resetMqTrackToStart(wt);
        } else if (settleNow) {
          /* wmResumeHover1: FG ma idle → clear transform:0 (sblocca bustle), resta paused */
          try {
            wt.style.removeProperty("transform");
          } catch (eTxS) {}
          wt.style.setProperty("animation-play-state", "paused", "important");
          wt.style.setProperty("-webkit-animation-play-state", "paused", "important");
          wt.style.setProperty("will-change", "auto", "important");
        } else {
          /* thaw già play-state + play() */
          thawMqTrack(wt);
        }
      }
      var promoNodes = document.querySelectorAll(
        "header .vc-header-promo-btn__track, header .vc-header-promo-btn__dot",
      );
      for (var i = 0; i < promoNodes.length; i++) {
        var el = promoNodes[i];
        if (!el || !el.style) continue;
        if (pause) {
          el.style.setProperty("animation-play-state", "paused", "important");
          el.style.setProperty("will-change", "auto", "important");
        } else {
          el.style.setProperty("animation-play-state", "running", "important");
          el.style.setProperty("will-change", "transform", "important");
        }
      }
    } catch (eMq) {}
  }

  /* cpuQuiet1 + violKill1 + bgCpuHard2: tab hidden → freeze GIF subito (no 48ms GIF decode) */
  function freezeGifDecodeForBg(on) {
    try {
      try {
        if (!on && (document.hidden || document.visibilityState === "hidden")) on = true;
      } catch (eHidFr) {}
      var imgs = null;
      var i = 0;
      var CHUNK = on ? 8 : 4;
      function step() {
        try {
          if (!imgs) {
            imgs = document.querySelectorAll(
              on
                ? 'img[src*=".gif"], img[src*="/a_"][src*=".webp"], img[src*="og-server-icon"], img[src*="discord.gif"], img.vcva-eye, .discord-avatar-img, .vc-header-logo-img'
                : "img[data-vc-gif-live]",
            );
          }
        } catch (eQ) {
          return;
        }
        var end = Math.min(i + CHUNK, imgs.length);
        for (; i < end; i++) {
          var img = imgs[i];
          if (!img) continue;
          var cur = String(img.getAttribute("src") || "");
          if (on) {
            if (isBoardsAnimMediaImg(img)) continue;
            var nextFr = stillDiscordAnimUrl(cur);
            if (!nextFr && !/\.gif(\?|$)/i.test(cur)) continue;
            if (!img.getAttribute("data-vc-gif-live")) img.setAttribute("data-vc-gif-live", cur);
            if (nextFr) img.setAttribute("src", nextFr);
          } else {
            var live = img.getAttribute("data-vc-gif-live");
            if (!live) continue;
            if (live !== cur) img.setAttribute("src", live);
          }
        }
        if (i < imgs.length) {
          window.setTimeout(step, on ? 0 : 24);
        }
      }
      /* bgCpuHard2: freeze sync primo chunk; thaw resta defer */
      if (on) step();
      else window.setTimeout(step, 48);
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

  /* violKillCue1/Cue2: solo setTimeout — rIC({timeout}) → Violation idle 140ms+ */
  function deferHeavy(fn) {
    var ran = false;
    function run() {
      if (ran) return;
      ran = true;
      try {
        fn();
      } catch (eF) {}
    }
    window.setTimeout(run, 48);
  }

  /* cssConsol1: un solo blocco late-wins — kill décor (animation:none), keep user+wordmark */
  function remountPageHiddenCpuCssLast() {
    try {
      var s = document.getElementById("vc-page-hidden-cpu-css");
      if (!s) return;
      var mount = document.body || document.documentElement;
      if (s.parentNode === mount && mount.lastChild === s) return;
      mount.appendChild(s);
    } catch (eRmCpu) {}
  }
  function ensurePageHiddenCpuCss() {
    try {
      var id = "vc-page-hidden-cpu-css";
      var MARK = "userMqSettleRun1";
      var s = document.getElementById(id);
      if (s && s.getAttribute("data-vc") === MARK) {
        remountPageHiddenCpuCssLast();
        return;
      }
      if (!s) {
        s = document.createElement("style");
        s.id = id;
        (document.head || document.documentElement).appendChild(s);
      }
      s.setAttribute("data-vc", MARK);
      /* pulse SEMPRE statici (anche pre-settle) — soft-fx/nav non devono riaccendere */
      var pulseKill =
        "html body.vc-body .vc-header-promo-btn__dot," +
        "html.vc-site-polish body.vc-body .vc-header-promo-btn__dot," +
        "html body.vc-body .vc-footer-sys-status__dot," +
        "html.vc-site-polish body.vc-body .vc-footer-sys-status__dot{" +
        "animation:none!important;-webkit-animation:none!important;" +
        "animation-play-state:paused!important;will-change:auto!important}";
      var settleKill =
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-home-cine__grain," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-home-cine__aura," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-home-cine__canvas," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-home-cine__photo," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-page-cine-hero__grain," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-page-cine-hero__aura," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-forbidden-book," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-forbidden-book--flying," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-header-promo-btn__track," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-header-promo-btn__dot," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-soft-vote-glow," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-soft-vote-glow::before," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-soft-vote-glow::after," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body [class*='vc-vote-progress']::before," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body [class*='vc-vote-progress']::after," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body [class*='vc-home-metal']," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-fx-sheen," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body [class*='__sheen']," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-nav-shell::before," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-nav-shell::after," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-premium-footer__outer::after," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-page-cine-card::before," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-fx-card::before," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-vote-live-statbox::before," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-footer-sys-status__dot," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-scroll-cue," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-scroll-cue *{" +
        "animation:none!important;-webkit-animation:none!important;" +
        "animation-play-state:paused!important;" +
        "transition:none!important;transition-duration:0s!important;" +
        "will-change:auto!important}" +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-home-cine__canvas," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-home-cine__grain," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-home-cine__aura," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-page-cine-hero__grain," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-page-cine-hero__aura{" +
        "display:none!important;visibility:hidden!important;opacity:0!important;" +
        "pointer-events:none!important}";
      s.textContent =
        "html.vc-page-hidden body.vc-body," +
        "html.vc-page-hidden body.vc-body *," +
        "html.vc-page-hidden body.vc-body *::before," +
        "html.vc-page-hidden body.vc-body *::after," +
        "html.vc-ui-gif-paused body.vc-body," +
        "html.vc-ui-gif-paused body.vc-body *," +
        "html.vc-ui-gif-paused body.vc-body *::before," +
        "html.vc-ui-gif-paused body.vc-body *::after{" +
        "animation-play-state:paused!important;" +
        "transition:none!important;" +
        "filter:none!important;-webkit-filter:none!important;" +
        "backdrop-filter:none!important;-webkit-backdrop-filter:none!important}" +
        pulseKill +
        settleKill +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-ui-spinner," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-ui-spinner *{" +
        "animation-play-state:running!important}" +
        /* userMqSettleRun1: NOME sempre running in settle; pause SOLO wordmark (+ tab-hidden sotto) */
        "html.vc-cpu-settle body.vc-body header a.vc-header-site-name.is-marquee .vc-header-site-name__track," +
        "html.vc-cpu-settle.vc-site-polish body.vc-body header a.vc-header-site-name.is-marquee .vc-header-site-name__track{" +
        "animation-play-state:paused!important;" +
        "-webkit-animation-play-state:paused!important;" +
        "will-change:auto!important}" +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body header .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body #header-quick-actions .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track," +
        "html.vc-cpu-settle:not(.vc-page-hidden).vc-site-polish body.vc-body header .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body #vc-mobile-nav-drawer .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track," +
        "html.vc-cpu-settle:not(.vc-page-hidden) body.vc-body .vc-mobile-nav-drawer .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track{" +
        "animation-name:vc-guild-name-marquee!important;" +
        "-webkit-animation-name:vc-guild-name-marquee!important;" +
        "animation-duration:var(--vc-marquee-duration,12s)!important;" +
        "animation-timing-function:linear!important;" +
        "animation-iteration-count:infinite!important;" +
        "animation-delay:0s!important;" +
        "animation-fill-mode:none!important;" +
        "animation-play-state:running!important;" +
        "-webkit-animation-play-state:running!important;" +
        "will-change:transform!important;" +
        "transform:none!important}" +
        "html.vc-cpu-settle #vc-site-cursor-light," +
        "html.vc-cpu-settle.vc-site-cursor-on #vc-site-cursor-light," +
        "html.vc-cpu-settle #vc-site-cursor-light::before," +
        "html.vc-cpu-settle #vc-site-cursor-light::after{" +
        "display:none!important;opacity:0!important;visibility:hidden!important;" +
        "pointer-events:none!important;background:none!important}" +
        "html.vc-cine-curtain-off.vc-site-polish body.vc-body .vc-ul-card," +
        "html.vc-cine-curtain-off.vc-site-polish body.vc-body .vc-reviews-list>.vc-reviews-card," +
        "html.vc-cine-curtain-off.vc-site-polish body.vc-body .vc-staff-inbox-item," +
        "html.vc-cine-curtain-off.vc-site-polish body.vc-body .vc-wt-thread-row," +
        "html.vc-cine-curtain-off.vc-site-polish body.vc-body .vc-notif-item," +
        "html.vc-cine-curtain-off.vc-site-polish body.vc-body .vc-boards-card:not(.vc-boards-compose)," +
        "html.vc-cine-curtain-off.vc-site-polish body.vc-faq-page main details," +
        "html.vc-cine-curtain-off.vc-site-polish body.vc-regole-page main details," +
        "html.vc-cine-curtain-off.vc-site-polish body.vc-body main .vc-regole-card details{" +
        "content-visibility:auto;" +
        "contain-intrinsic-size:auto 140px}";
      remountPageHiddenCpuCssLast();
    } catch (eCss) {}
  }

  function armGlobalCpuQuiet() {
    if (window.__vcCpuQuietArmed) return;
    window.__vcCpuQuietArmed = 1;
    ensurePageHiddenCpuCss();
    function sleep() {
      /* fgRevertBgOnly1 + bgCpuHard2: class + still + pause marquee inline subito */
      try {
        document.documentElement.classList.add("vc-page-hidden", "vc-ui-gif-paused");
      } catch (eCls) {}
      try {
        applyCineGifStillSwap(true);
      } catch (eCineSync) {}
      try {
        freezeInlineMarqueesForBg(true);
      } catch (eMqSleep) {}
      try {
        freezeGifDecodeForBg(true);
      } catch (eGifSync) {}
      try {
        window.dispatchEvent(new CustomEvent("vc:cpu-sleep"));
      } catch (eEv) {}
      deferHeavy(function () {
        try {
          applyCineGifStillSwap(true);
        } catch (eCine) {}
        try {
          freezeInlineMarqueesForBg(true);
        } catch (eMq2) {}
        freezeGifDecodeForBg(true);
      });
    }
    function wake() {
      /* foreground: ripristina tutto (GIF/logo) */
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
        freezeInlineMarqueesForBg(false);
      } catch (eMqWake) {}
      try {
        window.dispatchEvent(new CustomEvent("vc:cpu-wake"));
      } catch (eEv2) {}
      deferHeavy(function () {
        freezeGifDecodeForBg(false);
        try {
          freezeInlineMarqueesForBg(false);
        } catch (eMqW2) {}
        try {
          if (!document.documentElement.classList.contains("vc-cpu-settle")) {
            applyCineGifStillSwap(false);
          }
        } catch (eThawGif) {}
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
      /* sitePerfAll1: Page Lifecycle freeze/resume (oltre visibility) */
      document.addEventListener(
        "freeze",
        function () {
          try {
            sleep();
          } catch (eFrz) {}
        },
        false,
      );
      document.addEventListener(
        "resume",
        function () {
          try {
            sync();
          } catch (eRes) {}
        },
        false,
      );
      window.addEventListener(
        "pagehide",
        function () {
          try {
            document.documentElement.classList.add("vc-page-hidden", "vc-ui-gif-paused");
          } catch (ePh) {}
          try {
            freezeInlineMarqueesForBg(true);
          } catch (ePhMq) {}
          try {
            applyCineGifStillSwap(true);
          } catch (ePhStill) {}
          try {
            freezeGifDecodeForBg(true);
          } catch (ePhGif) {}
        },
        false,
      );
      window.setTimeout(sync, 0);
      window.setTimeout(function () {
        deferHeavy(stillDiscordContentGifs);
      }, 1200);
    } catch (eArm) {}
  }

  /* focusCssShedRevert1: NON disabilitare landing-core — sfascia layout non-home.
     Framelag: ridotto sotto con contain/hover-soft, non togliendo il CSS. */
  function shedHeavyLandingCss() {
    try {
      /* safety: se un build precedente ha disabilitato landing-core, riattivalo */
      document.querySelectorAll('link[rel="stylesheet"][data-vc-shed="landing-core"]').forEach(function (l) {
        try {
          l.disabled = false;
          l.removeAttribute("data-vc-shed");
        } catch (eOn) {}
      });
      document.querySelectorAll('link[rel="stylesheet"]').forEach(function (l) {
        try {
          var h = l.getAttribute("href") || "";
          if (/vc-landing-core/i.test(h) && l.disabled) {
            l.disabled = false;
          }
        } catch (eOn2) {}
      });
      window.__vcLandingCoreShed = 0;
      var crit = document.getElementById("vc-pages-crit-css");
      if (crit && crit.parentNode) {
        try {
          crit.parentNode.removeChild(crit);
        } catch (eRm) {}
      }
    } catch (eShed) {}
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
        /* navUserNameMarqueeKeep1: non killare nome chip account (data-vc-nav-user-marquee) */
        "html.vc-site-cpu-soft body.vc-body .is-marquee:not(.vc-header-site-name):not([data-vc-nav-user-marquee])," +
        "html.vc-site-cpu-soft body.vc-body .vc-marquee:not([data-vc-nav-user-marquee]) > .vc-marquee__track{" +
        "animation:none!important;transform:none!important}" +
        /* navMarqueeConfStaff1 + navUserMqFix1: brand vivo in cpu-soft (pause solo page-hidden / settle) */
        "html.vc-site-cpu-soft:not(.vc-page-hidden):not(.vc-cpu-settle) body.vc-body header a.vc-header-site-name.is-marquee .vc-header-site-name__track{" +
        "animation-name:vc-guild-name-marquee!important;" +
        "animation-duration:var(--vc-marquee-duration,12s)!important;" +
        "animation-timing-function:linear!important;" +
        "animation-iteration-count:infinite!important;" +
        "animation-delay:0.35s!important;" +
        "animation-fill-mode:none!important;" +
        "animation-play-state:running!important;" +
        "will-change:transform!important}" +
        /* userMqSettleRun1: nome vivo anche in cpu-soft+settle (non solo :not(.vc-cpu-settle)) */
        "html.vc-site-cpu-soft:not(.vc-page-hidden) body.vc-body header .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track," +
        "html.vc-site-cpu-soft:not(.vc-page-hidden) body.vc-body #header-quick-actions .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track," +
        "html.vc-site-cpu-soft:not(.vc-page-hidden).vc-cpu-settle body.vc-body header .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track," +
        "html.vc-site-cpu-soft:not(.vc-page-hidden).vc-cpu-settle body.vc-body #header-quick-actions .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track{" +
        "animation-name:vc-guild-name-marquee!important;" +
        "animation-duration:var(--vc-marquee-duration,12s)!important;" +
        "animation-timing-function:linear!important;" +
        "animation-iteration-count:infinite!important;" +
        "animation-delay:0s!important;" +
        "animation-fill-mode:none!important;" +
        "animation-play-state:running!important;" +
        "will-change:transform!important}" +
        /* focusCssShedRevert1: meno lavoro a focus — no cursor glow, no transition thrash */
        "html.vc-site-cpu-soft #vc-site-cursor-light," +
        "html.vc-site-cpu-soft #vc-site-cursor-light::before," +
        "html.vc-site-cpu-soft #vc-site-cursor-light::after{" +
        "display:none!important;opacity:0!important;visibility:hidden!important;" +
        "pointer-events:none!important}" +
        /* cursorMqStable1: vinyl su html/body; * inherit */
        "html.vc-site-cpu-soft.vc-site-cursor-on," +
        "html.vc-site-cpu-soft.vc-site-cursor-ok," +
        "html.vc-site-cpu-soft.vc-site-cursor-ok body{" +
        "cursor:url(/images/musicrecordspin-cursor-static.png) 12 12," +
        "url(/images/musicrecordspin-cursor-static.png) 12 12, auto!important}" +
        "html.vc-site-cpu-soft.vc-site-cursor-ok *{cursor:inherit!important}" +
        "html.vc-site-cpu-soft body.vc-page-cine-layout main," +
        "html.vc-site-cpu-soft body.vc-web-tickets-page .vc-wt-board," +
        "html.vc-site-cpu-soft body.vc-web-tickets-page .vc-wt-app{" +
        "contain:layout!important}" +
        "html.vc-site-cpu-soft body.vc-page-cine-layout :is(a,button,.vc-header-pill,.vc-snav-row," +
        ".vc-wt-card,.vc-reviews-card,.vc-faq-item,.vc-legal-card,.vc-role-card,.vc-ul-card):hover{" +
        "filter:none!important;-webkit-filter:none!important;" +
        "transform:none!important}";
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
    /* pwaCpuKill4: remount anche fuori standalone */
    if (!window.__VC_PWA_CPU_NUKE && !isStandalonePwa()) return;
    try {
      var s = document.getElementById("vc-pwa-cpu-nuke-css");
      if (!s) return;
      var mount = document.body || document.documentElement;
      if (s.parentNode === mount && mount.lastChild === s) return;
      mount.appendChild(s);
    } catch (eRm) {}
  }

  function cineStillUrlFor(photo) {
    var ver = "20261011scrollPostSiparioYoyo1";
    try {
      var src = String((photo && (photo.getAttribute("src") || photo.src)) || "");
      if (/sfondo-mobile/i.test(src)) return "/images/sfondo-mobile-still.webp?v=" + ver;
      if (window.matchMedia && window.matchMedia("(max-width:639.98px)").matches) {
        return "/images/sfondo-mobile-still.webp?v=" + ver;
      }
    } catch (eStill) {}
    return "/images/sfondo-still.webp?v=" + ver;
  }

  function cineGifUrlFor(photo) {
    /* bgGifForceRm1 / pwaResumeLag1: GIF vera allineata a home-cine */
    var ver = "20261011scrollPostSiparioYoyo1";
    try {
      var src = String((photo && (photo.getAttribute("src") || photo.src)) || "");
      if (/sfondo-mobile/i.test(src)) return "/images/sfondo-mobile.gif?v=" + ver;
      if (window.matchMedia && window.matchMedia("(max-width:639.98px)").matches) {
        return "/images/sfondo-mobile.gif?v=" + ver;
      }
    } catch (eGif) {}
    return "/images/sfondo.gif?v=" + ver;
  }

  function applyCineGifStillSwap(freeze) {
    /* bgGifAlways2: freeze→still; thaw→GIF (mai still su tab visibile)
       confBgNoGifBlack1: mai toccare foto locked / confessionale (JPG → sfondo.gif = nero) */
    try {
      var confRoute = false;
      try {
        confRoute =
          document.documentElement.classList.contains("vc-confessionale-route") ||
          (document.body && document.body.classList.contains("vc-confessionale-page"));
      } catch (eConf) {
        confRoute = false;
      }
      var photos = document.querySelectorAll("img.vc-home-cine__photo, .vc-home-cine img[src*='sfondo']");
      for (var i = 0; i < photos.length; i++) {
        var photo = photos[i];
        if (!photo || !photo.tagName || photo.tagName.toLowerCase() !== "img") continue;
        if (photo.classList.contains("discord-avatar-img") || photo.classList.contains("vc-avatar")) continue;
        try {
          if (
            confRoute ||
            photo.getAttribute("data-vc-cine-photo-lock") === "1" ||
            (photo.dataset && photo.dataset.vcCinePhotoLock === "1") ||
            /Confessionale-GF/i.test(String(photo.getAttribute("src") || ""))
          ) {
            continue;
          }
        } catch (eLock) {}
        if (!freeze) {
          /* prima che home-cine armi: non toccare (LCP still) */
          try {
            if (!window.__VC_SITE_PHOTO_GIF_ARMED) continue;
          } catch (eArm) {}
        }
        var want = freeze ? cineStillUrlFor(photo) : cineGifUrlFor(photo);
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

  /* bgGifRestore1 + cpuQuiet1 + pwaResumeLag1: PWA — still solo dopo hide lunga (resume corto no swap) */
  function armPwaIdleGifFreeze() {
    if (!isStandalonePwa()) return;
    if (window.__vcPwaGifFreezeArmed) return;
    window.__vcPwaGifFreezeArmed = 1;
    var lastHidden = null;
    var stillSwapTimer = 0;
    var STILL_SWAP_AFTER_MS = 18000;
    function clearStillSwapTimer() {
      if (!stillSwapTimer) return;
      try {
        window.clearTimeout(stillSwapTimer);
      } catch (eClr) {}
      stillSwapTimer = 0;
    }
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
      if (hidden) {
        /* pwaResumeLag1: non swap→still subito (riapertura da app switch = lag da re-decode) */
        clearStillSwapTimer();
        stillSwapTimer = window.setTimeout(function () {
          stillSwapTimer = 0;
          try {
            if (!document.hidden) return;
            applyCineGifStillSwap(true);
            freezeGifDecodeForBg(true);
          } catch (eLate) {}
        }, STILL_SWAP_AFTER_MS);
        deferHeavy(function () {
          freezeGifDecodeForBg(true);
        });
        return;
      }
      clearStillSwapTimer();
      deferHeavy(function () {
        /* pwaCpuKill2: focus PWA → restano still (no thaw logo/sfondo) */
        if (window.__VC_PWA_FREEZE_ALL_GIF || window.__VC_FORCE_PHOTO_STILL) {
          try {
            document.documentElement.classList.add("vc-cpu-settle");
            applyCineGifStillSwap(true);
            freezeGifDecodeForBg(true);
          } catch (eKeepStill) {}
          return;
        }
        try {
          applyCineGifStillSwap(false);
        } catch (eSw) {}
        freezeGifDecodeForBg(false);
        stillDiscordContentGifs();
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
    if (!window.__VC_PWA_CPU_NUKE && !isStandalonePwa()) return;
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
    /* fgRevertBgOnly1: nuke in-app DISATTIVATO — resta solo armGlobalCpuQuiet (bg) */
    try {
      window.__VC_FORCE_PHOTO_STILL = 0;
      window.__VC_PWA_FREEZE_ALL_GIF = 0;
      window.__VC_PWA_CPU_NUKE = 0;
      document.documentElement.classList.remove("vc-pwa-cpu-nuke", "vc-cpu-settle");
      var oldNuke = document.getElementById("vc-pwa-cpu-nuke-css");
      if (oldNuke && oldNuke.parentNode) oldNuke.parentNode.removeChild(oldNuke);
      var oldEarly = document.getElementById("vc-cpu-kill5-early-css");
      if (oldEarly && oldEarly.parentNode) oldEarly.parentNode.removeChild(oldEarly);
    } catch (eOff) {}
    return;
    try {
      var root = document.documentElement;
      var id = "vc-pwa-cpu-nuke-css";
      if (window.__vcPwaNukeOneShot && document.getElementById(id)) {
        remountNukeCssLast();
        return;
      }
      /* pwaStillHard1: kill blur + still; niente marquee running override */
      root.classList.add(
        "vc-pwa-cpu-nuke",
        "vc-soft-fx-ready",
        "vc-site-polish",
        "vc-cine-curtain-off",
        "vc-cursor-trail-off",
        "vc-cpu-settle",
      );
      /* lookCpuFix1: soft-fx ON di nuovo (look); CPU = still+anim kill mirato */
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
      s.setAttribute("data-vc", "lookCpuFix1");
      /* lookCpuFix1: solo kill ANIM infinite — look/glass/filter soft-fx restano */
      s.textContent =
        "html.vc-pwa-cpu-nuke body.vc-body .vc-forbidden-book," +
        "html.vc-pwa-cpu-nuke body.vc-body .vc-forbidden-book--flying{" +
        "display:none!important}" +
        "html.vc-pwa-cpu-nuke body.vc-body .vc-home-cine__canvas{" +
        "display:none!important;visibility:hidden!important;pointer-events:none!important}" +
        /* mqCssCursor2: NON killare wordmark / nome utente (come cpu-soft keep) */
        "html.vc-pwa-cpu-nuke body.vc-body .is-marquee:not(.vc-header-site-name):not([data-vc-nav-user-marquee]) .vc-marquee__track," +
        "html.vc-pwa-cpu-nuke body.vc-body .vc-marquee:not([data-vc-nav-user-marquee]) > .vc-marquee__track," +
        "html.vc-pwa-cpu-nuke body.vc-body--home .vc-home-deck__kicker," +
        "html.vc-pwa-cpu-nuke body.vc-body--home .vc-home-index__kicker," +
        "html.vc-pwa-cpu-nuke body.vc-body--home .vc-home-pulse-cta," +
        "html.vc-pwa-cpu-nuke body.vc-body--home .vc-home-scrollcue__chev," +
        "html.vc-pwa-cpu-nuke body.vc-body .vc-polish-vinyl{" +
        "animation:none!important;animation-name:none!important;" +
        "animation-play-state:paused!important;background-position:50% 50%!important;" +
        "will-change:auto!important}" +
        "html.vc-pwa-cpu-nuke:not(.vc-cpu-settle) body.vc-body header a.vc-header-site-name.is-marquee .vc-header-site-name__track{" +
        "animation-name:vc-guild-name-marquee!important;" +
        "animation-duration:var(--vc-marquee-duration,12s)!important;" +
        "animation-timing-function:linear!important;" +
        "animation-iteration-count:infinite!important;" +
        "animation-play-state:running!important;will-change:transform!important}" +
        /* userMqSettleRun1: nome vivo anche con pwa-nuke+settle */
        "html.vc-pwa-cpu-nuke:not(.vc-page-hidden) body.vc-body header .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track," +
        "html.vc-pwa-cpu-nuke:not(.vc-page-hidden) body.vc-body #header-quick-actions .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track," +
        "html.vc-pwa-cpu-nuke:not(.vc-page-hidden).vc-cpu-settle body.vc-body header .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track," +
        "html.vc-pwa-cpu-nuke:not(.vc-page-hidden).vc-cpu-settle body.vc-body #header-quick-actions .discord-profile-link__name[data-vc-nav-user-marquee].is-marquee .vc-marquee__track{" +
        "animation-name:vc-guild-name-marquee!important;" +
        "animation-duration:var(--vc-marquee-duration,8s)!important;" +
        "animation-timing-function:linear!important;" +
        "animation-iteration-count:infinite!important;" +
        "animation-play-state:running!important;will-change:transform!important}" +
        "html.vc-pwa-cpu-nuke.vc-site-cursor-ok,html.vc-pwa-cpu-nuke.vc-site-cursor-ok body{" +
        "cursor:url(/images/musicrecordspin-cursor-static.png) 12 12," +
        "url(/images/musicrecordspin-cursor-static.png) 12 12, auto!important}" +
        "html.vc-pwa-cpu-nuke.vc-site-cursor-ok *{cursor:inherit!important}";
      /* Append in coda a body così batte soft-fx.css in cascata (pari specificità). */
      var mount = document.body || document.head || root;
      mount.appendChild(s);
      window.__vcPwaNukeOneShot = 1;
      /* pwaCpuKill5: no stripPwaComputedFilters walk (era CPU); no cancelAnims spam */
      window.setTimeout(remountNukeCssLast, 900);
      armPwaIdleGifFreeze();
      /* swBackPwa1: SW push resta (ensureServiceWorkerRegistration → /sw-m1.js) */
      clearBootHoldWithCurtain();
      window.setTimeout(clearBootHoldWithCurtain, 200);
      window.setTimeout(clearBootHoldWithCurtain, 800);
    } catch (eNuke) {}
  }

  function clearPwaOrphanLocks() {
    /* hangKill1: unlock orphan anche fuori PWA (freeze su tutte le pagine) */
    /* scrollPostSiparioYoyo1: dopo unlock non richiamare forceUnlock (scrollTo 0 → yoyo) */
    try {
      var root = document.documentElement;
      if (!root.classList.contains("vc-page-cine-ready") && !root.classList.contains("vc-cine-curtain-off")) {
        if (!isStandalonePwa()) return;
      }
      /* bootBarGate1c: non ammazzare barra/lock finché chrome-ui non ha chiuso (o età lunga) */
      try {
        var progGate = document.getElementById("vc-site-progress");
        var barLive =
          (progGate && progGate.classList.contains("is-loading")) ||
          root.classList.contains("vc-chrome-bar-loading") ||
          (window.__vcChromeUiBooted && window.__vcChromeLoadDone === false);
        if (barLive) {
          var bootAt = Number(window.__vcCineBootStartedAt || 0) || 0;
          var age = bootAt ? Date.now() - bootAt : 0;
          if (!bootAt || age < 4500) return;
        }
      } catch (eBarGate) {}
      var alreadyUnlocked =
        window.__vcChromeLoadDone === true &&
        (window.__vcChromeScrollArmed || root.classList.contains("vc-chrome-scroll-armed"));
      root.classList.add("vc-chrome-scroll-armed", "vc-soft-fx-ready");
      root.classList.remove(
        "vc-loading-scroll-lock",
        "vc-loader-blocking-live",
        "vc-interaction-hold",
        "vc-chrome-bar-loading",
        "vc-scroll-soft-lock",
        "vc-notif-staff-loading",
        "vc-notif-early-staff",
      );
      try {
        var prog = document.getElementById("vc-site-progress");
        if (prog) prog.classList.remove("is-loading");
      } catch (eProg) {}
      try {
        var inboxLoad = document.getElementById("vc-staff-inbox-loading");
        if (inboxLoad) {
          inboxLoad.hidden = true;
          inboxLoad.setAttribute("hidden", "");
          inboxLoad.classList.add("vc-staff-loading--hidden");
        }
      } catch (eInbox) {}
      try {
        root.style.removeProperty("touch-action");
        if (document.body) document.body.style.removeProperty("touch-action");
      } catch (eTa) {}
      if (!alreadyUnlocked) {
        try {
          if (typeof window.__vcForceUnlockChromeScroll === "function") {
            window.__vcForceUnlockChromeScroll("pwaOrphan");
          }
        } catch (eForce) {}
        try {
          if (typeof window.__vcUnpinPageScroll === "function") window.__vcUnpinPageScroll();
        } catch (eUn) {}
      }
      try {
        if (typeof window.__vcReleaseInteractionHold === "function") window.__vcReleaseInteractionHold();
      } catch (eRel) {}
    } catch (eClr) {}
  }
  try {
    armPwaCpuNuke();
    window.setTimeout(clearPwaOrphanLocks, 700);
    window.setTimeout(clearPwaOrphanLocks, 1600);
    window.setTimeout(clearPwaOrphanLocks, 3200);
  } catch (eArmNuke) {}

  function clearBootHoldWithCurtain() {
    try {
      var root = document.documentElement;
      root.classList.add("vc-soft-fx-ready");
      /* bootOneShot3: soft/look ready ≠ aprire pagina — aspetta chrome (no 2° load) */
      var lookOk =
        root.classList.contains("vc-look-core-ready") || root.classList.contains("vc-soft-fx-off");
      var notCineBoot =
        !root.classList.contains("vc-page-cine-boot") || root.classList.contains("vc-page-cine-ready");
      var chromeDone =
        window.__vcChromeLoadDone === true || window.__vcChromeVisualReady === 1;
      var bootAt = Number(window.__vcCineBootStartedAt || window.__vcSoftFxCssReadyAt || 0) || 0;
      var age = bootAt ? Date.now() - bootAt : Number(performance.now && performance.now()) || 0;
      var hardOk = age >= 2800;
      if ((lookOk || notCineBoot) && (chromeDone || hardOk)) {
        root.classList.add("vc-cine-curtain-off");
      } else if ((lookOk || notCineBoot) && !chromeDone && !hardOk) {
        if (!window.__vcPerfCurtainWait) {
          window.__vcPerfCurtainWait = 1;
          var waitN = 0;
          (function waitChromeLift() {
            waitN += 1;
            try {
              if (
                window.__vcChromeLoadDone === true ||
                window.__vcChromeVisualReady === 1 ||
                waitN > 90
              ) {
                window.__vcPerfCurtainWait = 0;
                try {
                  if (
                    window.__vcChromeLoadDone === true ||
                    window.__vcChromeVisualReady === 1 ||
                    waitN > 90
                  ) {
                    document.documentElement.classList.add("vc-cine-curtain-off");
                  }
                } catch (eLift) {}
                return;
              }
            } catch (eW) {}
            window.setTimeout(waitChromeLift, 40);
          })();
        }
      }
      /* holdFreezeKill1: togli hold solo a sipario davvero giù (altrimenti 1° release fantasma) */
      if (root.classList.contains("vc-cine-curtain-off")) {
        root.classList.remove("vc-interaction-hold");
        if (typeof window.__vcReleaseInteractionHold === "function") {
          try {
            window.__vcReleaseInteractionHold();
          } catch (eRel) {}
        }
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
    /* lookCpuFix1: soft-fx sempre on; trail off solo lite/phone/nuke */
    root.classList.remove("vc-soft-fx-off");
    root.classList.add("vc-soft-fx-ready", "vc-site-polish");
    if (t === "lite" || isPhoneOrPwa() || window.__VC_PWA_CPU_NUKE) root.classList.add("vc-cursor-trail-off");
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
        "animation-play-state:paused!important;" +
        "filter:none!important;-webkit-filter:none!important;" +
        "backdrop-filter:none!important;-webkit-backdrop-filter:none!important}" +
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
    shedHeavyLandingCss: shedHeavyLandingCss,
    remountNukeCssLast: remountNukeCssLast,
    remountSiteCpuSoftCssLast: remountSiteCpuSoftCssLast,
    remountPageHiddenCpuCssLast: remountPageHiddenCpuCssLast,
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

  /* bgCpuHard1 + pageCpuIdle1: idle FG → pause wordmark+nome+promo (no keepAlive). */
  function armFgCpuSettle() {
    if (window.__vcFgCpuSettleArmed) return;
    window.__vcFgCpuSettleArmed = 1;
    ensurePageHiddenCpuCss();
    var idleTimer = 0;
    /* settleLite1 + pageCpuIdle1: idle un po' più corto; scroll/wheel NON thaw
       (sulle liste lunghe scongelavano continuamente → 100% CPU) */
    var IDLE_MS = 4200;
    var lastMoveWake = 0;
    var MOVE_THAW_MS = 2800;
    function settle() {
      try {
        if (document.hidden || document.visibilityState === "hidden") return;
      } catch (eH) {}
      try {
        document.documentElement.classList.add("vc-cpu-settle");
      } catch (eCls) {}
      try {
        ensurePageHiddenCpuCss();
        remountPageHiddenCpuCssLast();
      } catch (eCssSet) {}
      try {
        /* pageCpuIdle1: pause anche nome+wordmark in settle FG */
        freezeInlineMarqueesForBg(true, false);
      } catch (eMqSet) {}
      try {
        document.dispatchEvent(new CustomEvent("vc:cpu-settle"));
      } catch (eEvS) {}
      try {
        window.dispatchEvent(new CustomEvent("vc:cpu-settle"));
      } catch (eEvS2) {}
      deferHeavy(function () {
        try {
          applyCineGifStillSwap(true);
        } catch (eSw) {}
        try {
          freezeGifDecodeForBg(true);
        } catch (eFr) {}
        try {
          stillDiscordContentGifs();
        } catch (eStill) {}
        try {
          freezeInlineMarqueesForBg(true, false);
        } catch (eMqSet2) {}
        try {
          remountPageHiddenCpuCssLast();
        } catch (eRm2) {}
      });
    }
    function bustle(ev) {
      try {
        if (document.hidden || document.visibilityState === "hidden") return;
      } catch (eH2) {}
      /* pointermove: throttle — evita thaw continuo per microjitter */
      try {
        if (ev && ev.type === "pointermove") {
          var now = Date.now();
          if (now - lastMoveWake < MOVE_THAW_MS) {
            try {
              window.clearTimeout(idleTimer);
            } catch (eClrM) {}
            idleTimer = window.setTimeout(settle, IDLE_MS);
            return;
          }
          lastMoveWake = now;
        }
      } catch (eTh) {}
      var was = false;
      try {
        was = document.documentElement.classList.contains("vc-cpu-settle");
        document.documentElement.classList.remove("vc-cpu-settle");
      } catch (eRm) {}
      if (was) {
        try {
          freezeInlineMarqueesForBg(false);
        } catch (eMqWake) {}
        try {
          document.dispatchEvent(new CustomEvent("vc:cpu-bustle"));
        } catch (eEvB) {}
        try {
          window.dispatchEvent(new CustomEvent("vc:cpu-bustle"));
        } catch (eEvB2) {}
        deferHeavy(function () {
          try {
            if (!document.documentElement.classList.contains("vc-cpu-settle")) {
              applyCineGifStillSwap(false);
              freezeGifDecodeForBg(false);
              freezeInlineMarqueesForBg(false);
            }
          } catch (eThaw) {}
        });
      }
      try {
        window.clearTimeout(idleTimer);
      } catch (eClr) {}
      idleTimer = window.setTimeout(settle, IDLE_MS);
    }
    try {
      /* pageCpuIdle1: no scroll/wheel → bustle (liste lunghe tenevano settle spento) */
      ["pointerdown", "pointermove", "keydown", "touchstart"].forEach(function (ev) {
        window.addEventListener(ev, bustle, { passive: true, capture: true });
      });
    } catch (eEv) {}
    function start() {
      try {
        window.clearTimeout(idleTimer);
      } catch (eClr2) {}
      idleTimer = window.setTimeout(settle, IDLE_MS);
    }
    try {
      document.addEventListener("vc:page-cine-ready", start, { once: true });
      document.addEventListener("vc:cpu-wake", function () {
        start();
      });
    } catch (eReady) {}
    window.setTimeout(start, 4200);
  }

  /* lazyEverywhere1: native lazy on below-fold / dynamic media (no LCP/hero/header) */
  function shouldKeepMediaEager(el) {
    try {
      if (!el || el.nodeType !== 1) return true;
      if (el.getAttribute("loading") === "eager") return true;
      if (el.getAttribute("fetchpriority") === "high") return true;
      if (el.getAttribute("data-vc-nolazy") === "1") return true;
      var cls = String(el.className || "");
      if (
        /vc-home-cine__photo|vc-header-logo|vc-discord-login|vc-hero|vc-sipario|vc-pre-cine/i.test(
          cls,
        )
      ) {
        return true;
      }
      if (el.closest && el.closest("header, .vc-site-header, #vc-site-header, .vc-nav, .vc-hero-head")) {
        return true;
      }
      return false;
    } catch (eKeep) {
      return true;
    }
  }

  function markLazyMedia(root) {
    try {
      var scope = root && root.querySelectorAll ? root : document;
      var imgs = scope.querySelectorAll ? scope.querySelectorAll("img") : [];
      var vh = 0;
      try {
        vh = window.innerHeight || 800;
      } catch (eVh) {
        vh = 800;
      }
      for (var i = 0; i < imgs.length; i++) {
        var img = imgs[i];
        if (!img || shouldKeepMediaEager(img)) continue;
        if (!img.getAttribute("loading")) {
          var top = 0;
          try {
            top = img.getBoundingClientRect().top;
          } catch (eR) {
            top = vh + 1;
          }
          if (top > vh + 120) img.setAttribute("loading", "lazy");
        }
        if (!img.getAttribute("decoding")) img.setAttribute("decoding", "async");
      }
      var iframes = scope.querySelectorAll ? scope.querySelectorAll("iframe") : [];
      for (var j = 0; j < iframes.length; j++) {
        var fr = iframes[j];
        if (!fr || shouldKeepMediaEager(fr)) continue;
        if (!fr.getAttribute("loading")) fr.setAttribute("loading", "lazy");
      }
      /* sitePerfAll1: video sottofold — preload none + lazy attr dove supportato */
      var vids = scope.querySelectorAll ? scope.querySelectorAll("video") : [];
      for (var v = 0; v < vids.length; v++) {
        var vid = vids[v];
        if (!vid || shouldKeepMediaEager(vid)) continue;
        try {
          if (!vid.getAttribute("preload") || vid.getAttribute("preload") === "auto") {
            vid.setAttribute("preload", "none");
          }
        } catch (ePre) {}
        try {
          if (!vid.getAttribute("loading")) {
            var vTop = 0;
            try {
              vTop = vid.getBoundingClientRect().top;
            } catch (eVt) {
              vTop = vh + 1;
            }
            if (vTop > vh + 120) vid.setAttribute("loading", "lazy");
          }
        } catch (eVl) {}
      }
    } catch (eMark) {}
  }

  function armLazyMediaPass() {
    if (window.__vcLazyMediaPassArmed) return;
    window.__vcLazyMediaPassArmed = 1;
    function run() {
      markLazyMedia(document);
    }
    try {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", run, { once: true });
      } else {
        run();
      }
    } catch (eDom) {
      run();
    }
    try {
      document.addEventListener("vc:page-cine-ready", run, { once: true });
      document.addEventListener("vc:post-curtain-lazy", run, { once: true });
    } catch (eEv) {}
    window.setTimeout(run, 900);
    window.setTimeout(run, 2200);
    try {
      if (typeof MutationObserver === "function" && !window.__vcLazyMediaMo) {
        window.__vcLazyMediaMo = new MutationObserver(function (muts) {
          for (var i = 0; i < muts.length; i++) {
            var nodes = muts[i].addedNodes;
            for (var j = 0; j < nodes.length; j++) {
              var n = nodes[j];
              if (!n || n.nodeType !== 1) continue;
              if (n.tagName === "IMG" || n.tagName === "IFRAME") markLazyMedia(n.parentNode || n);
              else if (n.querySelector && n.querySelector("img,iframe")) markLazyMedia(n);
            }
          }
        });
        var moRoot = document.body || document.documentElement;
        if (moRoot) {
          window.__vcLazyMediaMo.observe(moRoot, { childList: true, subtree: true });
        }
      }
    } catch (eMo) {}
  }

  global.VcPerf = api;
  try {
    armGlobalCpuQuiet();
    armPwaCpuNuke();
    applyToDocument();
    injectTouchPerfCss();
    armPwaCpuNuke();
    armSiteCpuSoft();
    armFgCpuSettle();
    deferHeavy(stillDiscordContentGifs);
    armLazyMediaPass();
  } catch (eInit) {}
  try {
    document.addEventListener("vc:page-cine-ready", function () {
      try {
        armSiteCpuSoft();
        shedHeavyLandingCss();
      } catch (eReady) {}
    });
    window.addEventListener("pageshow", function () {
      try {
        armSiteCpuSoft();
        shedHeavyLandingCss();
      } catch (eShow) {}
    });
    window.setTimeout(function () {
      try {
        shedHeavyLandingCss();
      } catch (eShed0) {}
    }, 0);
    window.setTimeout(function () {
      try {
        shedHeavyLandingCss();
      } catch (eShed1) {}
    }, 600);
    window.setTimeout(function () {
      try {
        shedHeavyLandingCss();
      } catch (eShed2) {}
    }, 1600);
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
    function layoutCssOk() {
      try {
        var look =
          document.getElementById("vc-look-core-css") ||
          document.querySelector('link[href*="vc-look-core"]');
        if (look && !softSheetOk(look)) return false;
        var ext =
          document.getElementById("vc-landing-ext-css") ||
          document.querySelector('link[href*="vc-landing-ext"]');
        if (!ext) return true;
        try {
          var med = String(ext.media || "all").toLowerCase();
          if (med && med !== "all" && med.indexOf("all") === -1) return false;
        } catch (eMed) {}
        return softSheetOk(ext);
      } catch (eLay) {
        return true;
      }
    }
    function armLayoutCssWait(link) {
      try {
        ["vc-look-core-css", "vc-landing-ext-css"].forEach(function (id) {
          var el =
            document.getElementById(id) ||
            document.querySelector(
              id === "vc-look-core-css" ? 'link[href*="vc-look-core"]' : 'link[href*="vc-landing-ext"]',
            );
          if (!el || el.__vcFoucGateBound) return;
          el.__vcFoucGateBound = 1;
          function kick() {
            try {
              el.setAttribute("data-vc-sheet-loaded", "1");
              if (el.media && el.media !== "all") el.media = "all";
              promoteSoft(link);
            } catch (eK) {}
          }
          el.addEventListener("load", kick, { once: true });
          el.addEventListener("error", kick, { once: true });
        });
        window.setTimeout(function () {
          try {
            promoteSoft(link);
          } catch (eT) {}
        }, 80);
      } catch (eArm) {}
    }
    function promoteSoft(link) {
      if (!link) return;
      /* foucKillStruct1: non aprire sipario finché look-core + landing-ext non applicano */
      if (!layoutCssOk()) {
        armLayoutCssWait(link);
        return;
      }
      link.id = "vc-soft-fx-css";
      /* gifGradRestore1: attiva sempre soft-fx (gradient/bordi) */
      try {
        link.disabled = false;
        link.removeAttribute("data-vc-soft-disabled");
      } catch (eEn) {}
      link.media = "all";
      link.setAttribute("data-vc-sheet-loaded", "1");
      link.removeAttribute("onload");
      document.querySelectorAll('link[href*="vc-soft-fx"]').forEach(function (l) {
        if (l !== link && l.parentNode) l.parentNode.removeChild(l);
      });
      try {
        var lookR =
          document.getElementById("vc-look-core-css") ||
          document.querySelector('link[href*="vc-look-core"]');
        if (lookR) lookR.setAttribute("data-vc-sheet-loaded", "1");
        var extR =
          document.getElementById("vc-landing-ext-css") ||
          document.querySelector('link[href*="vc-landing-ext"]');
        if (extR) extR.setAttribute("data-vc-sheet-loaded", "1");
      } catch (eMark) {}
      document.documentElement.classList.remove("vc-soft-fx-off");
      document.documentElement.classList.add(
        "vc-look-core-ready",
        "vc-soft-fx-ready",
        "vc-core-styles-ready",
        "vc-home-styles-ready",
        "vc-styles-ready",
      );
      clearBootHoldWithCurtain();
      /* soft-fx arriva dopo: ri-append nuke CSS in coda + cancel WAAPI */
      try {
        armPwaCpuNuke();
      } catch (eReNuke) {}
      try {
        armSiteCpuSoft();
      } catch (eReSoft) {}
      try {
        shedHeavyLandingCss();
      } catch (eReShed) {}
    }
    function markReadyFromSoft() {
      try {
        var softPin = document.getElementById("vc-soft-fx-css");
        if (!softPin) softPin = document.querySelector('link[href*="vc-soft-fx"]');
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
        /* bootFast1SoftSel */
        var soft =
          document.getElementById("vc-soft-fx-css") ||
          document.querySelector('link[href*="vc-soft-fx"]');
        if (soft) {
          promoteSoft(soft);
          return;
        }
        var l = document.createElement("link");
        l.rel = "stylesheet";
        l.id = "vc-soft-fx-css";
        l.href = "/css/vc-soft-fx.20261006bootFast1.css?v=20261006bootFast1";
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
  /* skipGhost1: skip-link visibile solo dopo Tab reale (no focus spurio) */
  try {
    if (!global.__vcSkipGhost1) {
      global.__vcSkipGhost1 = 1;
      var SKIP_KB = "vc-skip-link--kb";
      function skipLinkEl() {
        try {
          return document.querySelector("a.vc-skip-link");
        } catch (eQ) {
          return null;
        }
      }
      function armSkipKb() {
        var s = skipLinkEl();
        if (s) s.classList.add(SKIP_KB);
      }
      function disarmSkipKb() {
        var s = skipLinkEl();
        if (!s) return;
        try {
          s.classList.remove(SKIP_KB);
        } catch (eRm) {}
        try {
          if (document.activeElement === s) s.blur();
        } catch (eBl) {}
      }
      document.addEventListener(
        "keydown",
        function (e) {
          try {
            if (e.key === "Tab" || e.keyCode === 9) armSkipKb();
          } catch (eKd) {}
        },
        true,
      );
      document.addEventListener(
        "focusin",
        function (e) {
          try {
            var t = e && e.target;
            if (!t || !t.classList || !t.classList.contains("vc-skip-link")) return;
            if (!t.classList.contains(SKIP_KB)) t.blur();
          } catch (eFi) {}
        },
        true,
      );
      document.addEventListener("mousedown", disarmSkipKb, true);
      document.addEventListener("pointerdown", disarmSkipKb, true);
      document.addEventListener("touchstart", disarmSkipKb, { capture: true, passive: true });
      window.addEventListener("pageshow", disarmSkipKb, false);
      document.addEventListener(
        "visibilitychange",
        function () {
          try {
            if (document.hidden) disarmSkipKb();
          } catch (eVis) {}
        },
        false,
      );
    }
  } catch (eSkipGh) {}
})(typeof window !== "undefined" ? window : this);
/* violKill1 */
/* extOnlyFix1 */
/* perfIdleReflow1 */
/* navUserNameMarqueeKeep1 */
/* userMqSettleRun1 */

