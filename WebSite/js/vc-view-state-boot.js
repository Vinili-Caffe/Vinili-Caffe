/**
 * vc-view-state-boot: su reload / PWA reopen / back-forward salva target Y + lock TOP.
 * (niente pin top:-Y; evita flash 1 frame della zona precedente).
 * Marker: scrollReloadNoYank1 + violPass2 + pwaResumeUi1 + bfNavRestore1 + violKill3
 * + loadScrollBarGap1 + reloadRestoreMenus1 + violKillRest1
 * + scrollBarTrack2: pin top aggressivo pre-barra (niente flash Y)
 * + scrollBarTrack3: unlock prima del restore; early pin flag
 * + scrollBarTrack3b: marker allineato
 * + scrollCueShowAfterLoad1: cue di nuovo a Y≈0 post-load
 * + scrollCuePinHide2: fisso al margine; no re-show mid-wheel; pin sempre su body
 * + scrollCueStableTop1: pin body fisso; hide istantaneo mid-scroll; re-show rapido a Y≈0 (settle)
 * + violKillReflow3: cue Y da cache; pinCues no-op se già pinned
 * + scrollCuePersRestore1: personalizza/cine remount cue dopo scroll (no SW stale kill)
 * + scrollLoadYoYoKill3: unlock unico — no liveY leak / no doppio scrollTo yoyo
 * + scrollLoadYoYoKill4: clearTopLock/visual-ready NON scrollano se unlock già fatto (yoyo load)
 * + refreshScrollRestore1: F5 ripristina Y salvata (anti-footer resta: restore solo con maxY reale)
 * + midScrollYankKill2: MAI scrollTo(0) se utente ha già scrollato / unlock fatto (vote+sitewide)
 * + refreshNoFooterJump1: overflow-anchor più a lungo; clearTopLock non adotta fondo flash
 * + cpuIdleCut1: visual-ready handler = cleanup sync + restore layout in rAF (no 250ms sync)
 * + consoleFixAll1: topPinIv 50→160ms (meno setInterval Violation 90–150ms)
 * + scrollCueBootShow1: wheel/touch a Y≈0 = hide-intent temporaneo (no lock forever);
 *   ignora intent in boot gate; dopo unlock ri-mostra cue subito a Y≈0
 * + bootMidFlashKill1: navigate fresco → mid da session restore NON = user scroll;
 *   forza top; gesture reale (wheel/touch/keys) setta __vcUserGestureScroll
 */
(function () {
  /* oauthHashResumeKill1: cattura #access_token/#error prima di qualsiasi replaceState/resume */
  try {
    var __oaH = String(window.location.hash || "");
    if (__oaH && (__oaH.indexOf("access_token=") !== -1 || __oaH.indexOf("error=") !== -1)) {
      try {
        if (!window.__vcOauthHashCapture) window.__vcOauthHashCapture = __oaH;
      } catch (eCap0) {}
      try {
        sessionStorage.setItem("vc_oauth_hash_capture_v1", __oaH);
      } catch (eSs0) {}
      window.__vcOauthCallbackPending = 1;
    }
  } catch (eOauthBoot) {}

  try {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  } catch (e0) {}

  function bootNavType() {
    try {
      var list = performance.getEntriesByType && performance.getEntriesByType("navigation");
      if (list && list[0] && list[0].type) return String(list[0].type || "");
    } catch (eN) {}
    try {
      var legacy = performance.navigation && Number(performance.navigation.type);
      if (legacy === 1) return "reload";
      if (legacy === 2) return "back_forward";
      if (legacy === 0) return "navigate";
    } catch (eL) {}
    return "";
  }
  function isFreshNavigate() {
    var t = bootNavType();
    return t !== "reload" && t !== "back_forward";
  }
  function bootLiveY() {
    try {
      return Math.max(
        0,
        Math.round(
          Number(window.pageYOffset) ||
            Number((document.documentElement && document.documentElement.scrollTop) || 0) ||
            Number((document.body && document.body.scrollTop) || 0) ||
            Number(window.__vcCachedScrollY) ||
            0,
        ),
      );
    } catch (eY) {
      return 0;
    }
  }
  function userScrolledAway() {
    try {
      if (window.__vcUserGestureScroll === 1) return true;
      if (window.__vcUserScrolledAway === 1) return true;
      /* bootMidFlashKill1: pre-unlock su navigate → mid browser ≠ intent */
      if (isFreshNavigate() && window.__vcScrollUnlockOnce !== 1) return false;
      if (window.__vcScrollUnlockOnce === 1 && bootLiveY() >= 8) return true;
      if (window.__vcChromeVisualReady === 1 && bootLiveY() >= 8) return true;
      if (window.__vcChromeScrollArmed && bootLiveY() >= 8) return true;
      if (bootLiveY() >= 24) return true;
      if (Number(window.__vcCachedScrollY) >= 24) return true;
    } catch (eU) {}
    return false;
  }
  function markUserScrolled(y) {
    try {
      var n = Math.max(0, Math.round(Number(y) || 0));
      /* bootMidFlashKill1: durante boot navigate non cacheare/promuovere mid spurio */
      if (
        isFreshNavigate() &&
        window.__vcScrollUnlockOnce !== 1 &&
        window.__vcUserGestureScroll !== 1
      ) {
        if (n >= 8) {
          try {
            window.scrollTo(0, 0);
            if (document.documentElement) document.documentElement.scrollTop = 0;
            if (document.body) document.body.scrollTop = 0;
          } catch (eZ) {}
          window.__vcCachedScrollY = 0;
          return;
        }
      }
      window.__vcCachedScrollY = n;
      if (n >= 24) {
        if (window.__vcUserGestureScroll === 1 || window.__vcScrollUnlockOnce === 1) {
          window.__vcUserScrolledAway = 1;
        } else if (!isFreshNavigate()) {
          window.__vcUserScrolledAway = 1;
        }
      }
    } catch (eM) {}
  }
  try {
    window.addEventListener(
      "scroll",
      function () {
        markUserScrolled(bootLiveY());
      },
      { passive: true, capture: true },
    );
  } catch (eScr) {}
  /* bootMidFlashKill1: gesture reale → permesso tenere mid anche pre-unlock */
  try {
    function markGestureScroll() {
      try {
        window.__vcUserGestureScroll = 1;
      } catch (eG) {}
    }
    ["wheel", "touchmove", "keydown"].forEach(function (ev) {
      window.addEventListener(ev, markGestureScroll, { passive: true, capture: true });
    });
  } catch (eGest) {}

  /* scrollBarTrack2 + bootMidFlashKill1: navigate fresco → SEMPRE top (no mid session) */
  if (isFreshNavigate() || !userScrolledAway()) {
    try {
      if (isFreshNavigate()) {
        window.__vcDiscardScrollRestore = 1;
        window.__vcDiscardNextUnpinScrollY = true;
        window.__vcCachedScrollY = 0;
        window.__vcUserScrolledAway = 0;
        window.__vcWantUnlockY = 0;
      }
      window.scrollTo(0, 0);
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    } catch (eTop0) {}
  }

  /* cueCineRestore1 / scrollCuePersRestore1: niente kill anticipato su cine (personalizza/tickets/staff/home) */

  /* persRankEmojiFix1: emoji color+render in HEAD — niente link preload (evita warning unused) */
  /* perfRoiPack1: skip early emoji su legal/status/games (auth-inject fa da gate altrove) */
  try {
    if (!window.__vcEmojiEarlyBoot) {
      window.__vcEmojiEarlyBoot = 1;
      var pEmoji = String(window.location.pathname || "/") || "/";
      if (!/\/$/.test(pEmoji) && pEmoji !== "/") pEmoji += "/";
      var skipEmojiEarly =
        /^\/(privacy|terms|cookie|copyright|dati|status|wordle|puzzle)(\/|$)/i.test(pEmoji) ||
        /^\/(faq|regole|wiki|sponsor|vote|donazioni|perks|ruoli)(\/|$)/i.test(pEmoji);
      if (!skipEmojiEarly) {
        /* stampHeal1: allinea a EMOJI_COLOR_VER registry (prima persRankEmojiFix1 → 404) */
        var EMOJI_EARLY_VER =
          (window.__VC_ASSET_VERS && window.__VC_ASSET_VERS.EMOJI_COLOR_VER) ||
          "20261011inputLagKill1";
        var headEarly = document.head || document.documentElement;
        if (!document.getElementById("vc-emoji-color-css")) {
          var emojiCss = document.createElement("link");
          emojiCss.id = "vc-emoji-color-css";
          emojiCss.rel = "stylesheet";
          emojiCss.href = "/css/vc-emoji-color." + EMOJI_EARLY_VER + ".css?v=" + EMOJI_EARLY_VER;
          headEarly.appendChild(emojiCss);
        }
        function injEmojiJs(path) {
          var stem = /vc-emoji-color/.test(path)
            ? "vc-emoji-color"
            : /vc-emoji-render/.test(path)
              ? "vc-emoji-render"
              : "";
          if (!stem) return;
          if (document.querySelector('script[src*="' + stem + '"]')) return;
          var s = document.createElement("script");
          s.src = path;
          s.async = false;
          headEarly.appendChild(s);
        }
        injEmojiJs("/js/vc-emoji-color." + EMOJI_EARLY_VER + ".js?v=" + EMOJI_EARLY_VER);
        injEmojiJs("/js/vc-emoji-render." + EMOJI_EARLY_VER + ".js?v=" + EMOJI_EARLY_VER);
      }
    }
  } catch (eEmojiEarly) {}

  /* loadScrollBarGap1: look-core mostra scrollbar a soft-fx-ready PRIMA di chrome-scroll-armed → 1 frame flash */
  try {
    if (!document.getElementById("vc-load-scrollbar-gap-css")) {
      var gapCss = document.createElement("style");
      gapCss.id = "vc-load-scrollbar-gap-css";
      gapCss.setAttribute("data-vc", "loadScrollBarGap1");
      gapCss.textContent =
        "html.vc-site-polish:not(.vc-chrome-scroll-armed)," +
        "html.vc-site-polish:not(.vc-chrome-scroll-armed) body," +
        "html:not(.vc-chrome-scroll-armed)," +
        "html:not(.vc-chrome-scroll-armed) body{" +
        "scrollbar-width:none!important;scrollbar-gutter:auto!important}" +
        "html.vc-site-polish:not(.vc-chrome-scroll-armed)::-webkit-scrollbar," +
        "html.vc-site-polish:not(.vc-chrome-scroll-armed) body::-webkit-scrollbar," +
        "html:not(.vc-chrome-scroll-armed)::-webkit-scrollbar," +
        "html:not(.vc-chrome-scroll-armed) body::-webkit-scrollbar{" +
        "width:0!important;height:0!important;display:none!important;background:transparent!important}";
      (document.head || document.documentElement).appendChild(gapCss);
    }
  } catch (eGap) {}

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

  function isReloadNav() {
    try {
      var list = performance.getEntriesByType && performance.getEntriesByType("navigation");
      if (list && list[0] && list[0].type) return list[0].type === "reload";
    } catch (e0) {}
    try {
      if (performance.navigation && performance.navigation.type === 1) return true;
    } catch (e1) {}
    try {
      if (sessionStorage.getItem("vc_ptr_reload_v1") === "1") return true;
    } catch (e2) {}
    return false;
  }

  function isBackForwardNav() {
    try {
      var list = performance.getEntriesByType && performance.getEntriesByType("navigation");
      if (list && list[0] && list[0].type) return list[0].type === "back_forward";
    } catch (e0) {}
    try {
      if (performance.navigation && performance.navigation.type === 2) return true;
    } catch (e1) {}
    return false;
  }

  function wasPwaShell() {
    try {
      if (
        window.matchMedia &&
        (window.matchMedia("(display-mode: standalone)").matches ||
          window.matchMedia("(display-mode: fullscreen)").matches ||
          window.matchMedia("(display-mode: minimal-ui)").matches ||
          window.matchMedia("(display-mode: window-controls-overlay)").matches)
      ) {
        return true;
      }
    } catch (eMq) {}
    try {
      if (navigator.standalone) return true;
    } catch (eNs) {}
    try {
      return localStorage.getItem("vc-pwa-shell") === "1";
    } catch (eLs) {
      return false;
    }
  }

  function peekPwaUiPending() {
    if (!wasPwaShell()) return null;
    try {
      var raw =
        window.VcStorage && typeof window.VcStorage.get === "function"
          ? window.VcStorage.get("vc_pwa_ui_pending_v1", { scope: "ls" })
          : localStorage.getItem("vc_pwa_ui_pending_v1");
      if (!raw) return null;
      var pend = JSON.parse(raw);
      if (!pend || !pathMatches(pend.p)) return null;
      try {
        sessionStorage.setItem("vc_pwa_ui_restore_v1", "1");
      } catch (eFlag) {}
      return pend;
    } catch (ePend) {
      return null;
    }
  }

  function readRestoreY() {
    var y = 0;
    var sources = [];
    try {
      sources.push(sessionStorage.getItem("vc_view_state_v1"));
      sources.push(sessionStorage.getItem("vc_ptr_scroll_v1"));
    } catch (eS) {}
    try {
      /* bfNavRestore1: mappa per-path (back/forward non legge solo KEY corrente) */
      var mapRaw = sessionStorage.getItem("vc_view_state_map_v1");
      if (mapRaw) {
        var map = JSON.parse(mapRaw) || {};
        var cur = pagePath();
        if (map[cur]) sources.push(JSON.stringify(map[cur]));
        else {
          var keys = Object.keys(map);
          for (var mi = 0; mi < keys.length; mi++) {
            if (pathMatches(keys[mi])) {
              sources.push(JSON.stringify(map[keys[mi]]));
              break;
            }
          }
        }
      }
    } catch (eMap) {}
    var lsIdx = -1;
    try {
      if (wasPwaShell()) {
        var lsRaw =
          window.VcStorage && typeof window.VcStorage.get === "function"
            ? window.VcStorage.get("vc_pwa_view_state_v1", { scope: "ls" })
            : localStorage.getItem("vc_pwa_view_state_v1");
        if (lsRaw) {
          lsIdx = sources.length;
          sources.push(lsRaw);
        }
      }
    } catch (eL) {}
    for (var i = 0; i < sources.length; i++) {
      var raw = sources[i];
      if (!raw) continue;
      try {
        var data = JSON.parse(raw);
        if (!data || !pathMatches(data.p)) continue;
        var yy = Math.max(0, Math.round(Number(data.y) || 0));
        var at = Number(data.t) || 0;
        /* session: TTL 45m; PWA localStorage: no TTL (allineato a resume forever) */
        if (i !== lsIdx && at && Date.now() - at > 45 * 60 * 1000) continue;
        if (yy > y) y = yy;
      } catch (eP) {}
    }
    return y;
  }

  /* violPass2: un solo scrollTo — niente scrollTop×2 + rAF (Forced reflow / rAF Violation) */
  /* scrollYoYoKill1: non azzerare se restore Y è già in corso / fatto (evita Y→0→Y) */
  /* midScrollYankKill1: stop totale se utente/unlock già mid-page */
  function forceTopNow() {
    try {
      if (window.__vcPtrRestoreDone) return;
      if (window.__vcScrollUnlockOnce === 1) return;
      if (userScrolledAway()) return;
      if (window.__vcChromeVisualReady === 1) {
        var want =
          Math.max(
            0,
            Number(window.__vcPtrRestoreTargetY || 0) || 0,
            Number(window.__vcPtrRestoreY || 0) || 0,
            Number(window.__vcViewStateRestoreY || 0) || 0,
          ) || 0;
        if (want >= 2) return;
        if (bootLiveY() >= 8) return;
      }
      if (typeof window.scrollTo === "function") {
        try {
          window.scrollTo({ top: 0, left: 0, behavior: "instant" });
        } catch (eInst) {
          window.scrollTo(0, 0);
        }
      }
    } catch (eTop) {}
  }

  /* Sempre spegni restore nativo ASAP — ma NON con hash deeplink (notif → altezza pagina) */
  function isDeepLinkHash() {
    var h = String(location.hash || "").replace(/^#/, "");
    if (!h || h.indexOf("access_token=") === 0) return false;
    return true;
  }
  function isPtrExplicit() {
    try {
      if (window.__vcPtrRestorePending) return true;
      if (sessionStorage.getItem("vc_ptr_reload_v1") === "1") return true;
    } catch (ePtr) {}
    return false;
  }
  var pwaPending = peekPwaUiPending();
  var backFwd = isBackForwardNav();
  var reloadNav = isReloadNav();
  /* refreshScrollRestore1: F5 / PTR / back-forward / PWA → restore Y salvata.
     Anti-footer: unlock applica Y solo quando measureRealMaxScrollY è sufficiente
     (chrome + view-state), mai clamp mid-load. Nuova navigazione → top. */
  var shouldRestoreScroll =
    reloadNav || isPtrExplicit() || backFwd || Boolean(pwaPending);
  var shouldPinTop = reloadNav || shouldRestoreScroll;
  /* homeBootFix2: homepage MAI restore Y (F5/session → clampa footer) */
  /* legalBootTop1: policy pages MAI mid da session/F5 (lunghe → fine boot a metà) */
  try {
    var homePath = String(window.location.pathname || "").replace(/\/+$/, "") || "/";
    var isHomeBoot =
      homePath === "/" ||
      (document.body && document.body.classList.contains("vc-body--home"));
    var isLegalBoot =
      /^\/(privacy|terms|cookie|copyright|dati|regole)(\/|$)/i.test(homePath + "/") ||
      (document.body && document.body.classList.contains("vc-legal-page")) ||
      !!document.getElementById("vc-page-legal-css") ||
      !!document.querySelector('link[href*="vc-page-legal"]');
    if (isHomeBoot || isLegalBoot) {
      shouldRestoreScroll = false;
      shouldPinTop = true;
      window.__vcDiscardScrollRestore = 1;
      window.__vcPtrRestoreY = 0;
      window.__vcViewStateRestoreY = 0;
      window.__vcPtrRestoreTargetY = 0;
      window.__vcRestoredScrollStickyY = 0;
      try {
        document.documentElement.removeAttribute("data-vc-ptr-restore-y");
      } catch (eHomeAttr) {}
      if (isLegalBoot) {
        try {
          sessionStorage.removeItem("vc_scroll_restore_anchor_v1");
          sessionStorage.removeItem("vc_ptr_scroll_v1");
          sessionStorage.removeItem("vc_view_state_v1");
        } catch (eLegSs) {}
      }
    }
  } catch (eHomeBoot) {}
  if (isDeepLinkHash()) {
    try {
      window.__vcHashDeepLinkNav = 1;
      document.documentElement.setAttribute("data-vc-hash-deeplink", "1");
    } catch (eDl) {}
  } else if (!shouldPinTop) {
    /* navigazione nuova: top */
    forceTopNow();
  }

  if (!shouldPinTop) return;

  var y = shouldRestoreScroll ? readRestoreY() : 0;
  if (!shouldRestoreScroll) {
    window.__vcDiscardScrollRestore = 1;
    try {
      window.__vcPtrRestoreY = 0;
      window.__vcViewStateRestoreY = 0;
      window.__vcPtrRestoreTargetY = 0;
      document.documentElement.removeAttribute("data-vc-ptr-restore-y");
    } catch (eZero) {}
  } else {
    /* refreshScrollRestore1: non scartare Y su F5 */
    try {
      window.__vcDiscardScrollRestore = 0;
    } catch (eKeep) {}
  }

  if (y >= 2) {
    window.__vcPtrRestoreY = y;
    window.__vcViewStateRestoreY = y;
    window.__vcPtrRestoreTargetY = y;
    try {
      document.documentElement.setAttribute("data-vc-ptr-restore-y", String(y));
      /* boardsScrollSaveGuard1: ancora dedicata, i save a Y=0 non la toccano */
      sessionStorage.setItem(
        "vc_scroll_restore_anchor_v1",
        JSON.stringify({ p: pagePath(), y: y, t: Date.now() }),
      );
    } catch (eAttr) {}
  }

  /* Lock overflow in cima — copre il frame in cui il browser aveva già scrollato a Y */
  try {
    window.__vcTopPinActive = 1;
    document.documentElement.classList.add("vc-scroll-reload-top-lock");
  } catch (eCls) {}
  if (!document.getElementById("vc-scroll-reload-top-lock-css")) {
    var css = document.createElement("style");
    css.id = "vc-scroll-reload-top-lock-css";
    css.setAttribute("data-vc", "scrollBarTrack3");
    css.textContent =
      "html.vc-scroll-reload-top-lock,html.vc-scroll-reload-top-lock body{" +
      "overflow:hidden!important;overscroll-behavior:none!important;" +
      "touch-action:none!important;height:100%!important;max-height:100dvh!important;" +
      "scrollbar-width:none!important;scrollbar-gutter:auto!important}" +
      "html.vc-scroll-reload-top-lock::-webkit-scrollbar,html.vc-scroll-reload-top-lock body::-webkit-scrollbar{" +
      "width:0!important;height:0!important;display:none!important}" +
      /* scrollBarTrack2: body fixed a top — evita flash del viewport già scrollato dal browser */
      "html.vc-scroll-reload-top-lock body{position:fixed!important;inset:0!important;top:0!important;" +
      "left:0!important;right:0!important;bottom:0!important;width:100%!important;margin:0!important}";
    (document.head || document.documentElement).appendChild(css);
  }
  forceTopNow();
  /* scrollBarTrack2 + consoleFixAll1: pin top senza martello 50ms (Violation setInterval) */
  var topPinIv = window.setInterval(function () {
    try {
      if (
        !window.__vcTopPinActive ||
        window.__vcChromeVisualReady === 1 ||
        window.__vcPtrRestoreDone ||
        window.__vcScrollUnlockOnce === 1
      ) {
        window.clearInterval(topPinIv);
        return;
      }
      forceTopNow();
    } catch (ePin) {}
  }, 160);
  window.setTimeout(function () {
    try {
      window.clearInterval(topPinIv);
    } catch (eClrIv) {}
  }, 2800);
  /* bootStayTop2: overflow-anchor off — evita jump footer mentre cresce il DOM */
  try {
    if (!document.getElementById("vc-boot-stay-top-css")) {
      var stay = document.createElement("style");
      stay.id = "vc-boot-stay-top-css";
      stay.setAttribute("data-vc", "bootStayTop2");
      stay.textContent =
        "html,body{overflow-anchor:none!important}" +
        "html.vc-page-cine-boot:not(.vc-page-cine-ready),html.vc-page-cine-boot:not(.vc-page-cine-ready) body{" +
        "overflow-anchor:none!important}";
      (document.head || document.documentElement).appendChild(stay);
      window.setTimeout(function () {
        try {
          var el = document.getElementById("vc-boot-stay-top-css");
          if (el && el.parentNode) el.parentNode.removeChild(el);
        } catch (eRm) {}
      }, 14000);
    }
  } catch (eStay) {}
  /* bootNoJumpLoad2: MAI togliere top-lock prima di visual-ready
     (anche con discard Y=0: togliere body:fixed a 1.2s → browser risale alla Y di sessione). */
  function clearTopLock(force) {
    try {
      var root = document.documentElement;
      if (!force && window.__vcChromeVisualReady !== 1) {
        forceTopNow();
        return;
      }
      if (
        !force &&
        (root.classList.contains("vc-chrome-bar-loading") ||
          root.classList.contains("vc-loading-scroll-lock") ||
          window.__vcChromeLoadDone !== true)
      ) {
        forceTopNow();
        return;
      }
      /* scrollLoadYoYoKill4 + midScrollYankKill1: unlock/user mid → ZERO scrollTo */
      var unlockDone =
        window.__vcScrollUnlockOnce === 1 || window.__vcPtrRestoreDone === 1;
      if (!unlockDone && !userScrolledAway()) {
        try {
          var preY = window.__vcDiscardScrollRestore
            ? 0
            : Math.max(0, Number(window.__vcPtrRestoreY || 0) || 0);
          var livePre = bootLiveY();
          var maxPre = 0;
          try {
            maxPre = Math.max(
              0,
              Math.max(
                (root && root.scrollHeight) || 0,
                (document.body && document.body.scrollHeight) || 0
              ) - (window.innerHeight || (root && root.clientHeight) || 0)
            );
          } catch (eMp) {}
          /* refreshNoFooterJump1: non “tenere” live se è fondo flash */
          var preFlash =
            maxPre >= 80 && livePre >= maxPre - 48 && (preY < 2 || livePre > preY + 120);
          if (preFlash) {
            window.scrollTo(0, preY);
          } else if (!(preY < 2 && livePre >= 8)) {
            window.scrollTo(0, preY);
          }
        } catch (ePre) {}
      }
      window.__vcTopPinActive = 0;
      root.classList.remove("vc-scroll-reload-top-lock");
      var topCss = document.getElementById("vc-scroll-reload-top-lock-css");
      if (topCss && topCss.parentNode) topCss.parentNode.removeChild(topCss);
      if (unlockDone || userScrolledAway()) return;
      try {
        if (window.__vcDiscardScrollRestore || !(Number(window.__vcPtrRestoreY || 0) >= 2)) {
          var livePost = bootLiveY();
          var maxPost = 0;
          try {
            maxPost = Math.max(
              0,
              Math.max(
                (root && root.scrollHeight) || 0,
                (document.body && document.body.scrollHeight) || 0
              ) - (window.innerHeight || (root && root.clientHeight) || 0)
            );
          } catch (eMpo) {}
          if (livePost >= 8 && !(maxPost >= 80 && livePost >= maxPost - 48)) return;
          window.scrollTo(0, 0);
          if (root.scrollTop) root.scrollTop = 0;
          if (document.body) document.body.scrollTop = 0;
        }
      } catch (ePost) {}
    } catch (eClr) {}
  }
  window.setTimeout(function () {
    if (window.__vcChromeVisualReady !== 1) forceTopNow();
  }, 1200);
  window.setTimeout(function () {
    if (window.__vcChromeVisualReady !== 1) forceTopNow();
  }, 2800);
  window.setTimeout(function () {
    clearTopLock(true);
  }, 7000);
  document.addEventListener(
    "vc:page-cine-ready",
    function () {
      /* loadRestoreAfterBar1: cine-ready mid-bar NON sblocca top */
      clearTopLock(false);
    },
    { passive: true, once: true },
  );
  document.addEventListener(
    "vc:cine-curtain-off",
    function () {
      clearTopLock(false);
    },
    { passive: true, once: true },
  );
  document.addEventListener(
    "vc:chrome-ready",
    function () {
      clearTopLock(false);
    },
    { passive: true, once: true },
  );
  document.addEventListener(
    "vc:chrome-visual-ready",
    function () {
      /* cpuIdleCut1: sync = solo flag + CSS unlock (veloce).
         scrollHeight/scrollTo → rAF+timeout (evita Violation 250ms sul message path). */
      var wantY = 0;
      try {
        window.__vcTopPinActive = 0;
        if (!window.__vcDiscardScrollRestore) {
          wantY = Math.max(
            0,
            Number(window.__vcPtrRestoreTargetY || window.__vcPtrRestoreY || window.__vcViewStateRestoreY || 0) || 0,
          );
        }
        if (window.__vcScrollUnlockOnce || window.__vcPtrRestoreDone) {
          try {
            var rootDone = document.documentElement;
            rootDone.classList.remove("vc-scroll-reload-top-lock");
            var cssDone = document.getElementById("vc-scroll-reload-top-lock-css");
            if (cssDone && cssDone.parentNode) cssDone.parentNode.removeChild(cssDone);
            if (document.body) {
              document.body.style.removeProperty("position");
              document.body.style.removeProperty("top");
              document.body.style.removeProperty("inset");
            }
          } catch (eCssOnly) {}
          if (window.__vcPtrRestoreDone || wantY < 2 || window.__vcDiscardScrollRestore) return;
        }
      } catch (eFast) {}
      function finishVisualRestore() {
        try {
          clearTopLock(true);
          var maxNow = 0;
          try {
            var deM = document.documentElement;
            maxNow = Math.max(
              0,
              Math.max((deM && deM.scrollHeight) || 0, (document.body && document.body.scrollHeight) || 0) -
                (window.innerHeight || (deM && deM.clientHeight) || 0),
            );
          } catch (eMx) {}
          var finalY = 0;
          /* bootNoJumpFooter1: MAI Math.min(want,max) — su F5 pending≈max = salto footer.
             Se want è zona fondo (o max ancora corto a unlock), scarta → top. */
          var nearBot =
            wantY >= 2 &&
            maxNow >= 120 &&
            wantY >= Math.max(80, maxNow - 96);
          if (nearBot) {
            finalY = 0;
            try {
              window.__vcDiscardScrollRestore = 1;
              window.__vcPtrRestoreTargetY = 0;
              window.__vcPtrRestoreY = 0;
              window.__vcViewStateRestoreY = 0;
            } catch (eBot) {}
          } else if (wantY >= 2 && maxNow >= wantY - 24 && maxNow >= 64) {
            finalY = wantY;
          } else if (wantY >= 2) {
            try {
              window.__vcPtrRestoreDone = 0;
            } catch (ePend) {}
            return;
          }
          var liveKeep = bootLiveY();
          if (finalY < 2 && liveKeep >= 8) {
            finalY = liveKeep;
            markUserScrolled(liveKeep);
          }
          try {
            window.scrollTo(0, finalY);
            if (document.documentElement) document.documentElement.scrollTop = finalY;
            if (document.body) document.body.scrollTop = finalY;
          } catch (eY) {}
          window.__vcCachedScrollY = finalY;
          window.__vcPtrRestoreDone = 1;
          window.__vcScrollUnlockOnce = 1;
          if (finalY >= 2) {
            try {
              document.dispatchEvent(new CustomEvent("vc:scroll-restored", { detail: { y: finalY } }));
            } catch (eEv) {}
          }
        } catch (eRest) {
          try {
            clearTopLock(true);
          } catch (e2) {}
        }
      }
      try {
        window.requestAnimationFrame(function () {
          window.setTimeout(finishVisualRestore, 0);
        });
      } catch (eSch) {
        window.setTimeout(finishVisualRestore, 0);
      }
    },
    { passive: true, once: true },
  );
})();

/* scrollCueStableTop1 + scrollCueLiveY1 + scrollCueHideIntent1 + scrollCueOwner1 + cueHideSnap1:
   pin body; hide istantaneo; Y sempre live; hide su intent (wheel/touch) anche se Y≈0 (bordo/overscroll).
   cueHideSnap1: hide PRIMA di pinCues (niente lag ~300ms style storm sullo sparire).
   Owner unico: home-cine non deve più show/poke/overwrite __vcSyncScrollCue. */
(function () {
  if (window.__vcScrollCueAwayBoot) return;
  window.__vcScrollCueAwayBoot = 1;
  var CLS = "vc-scrollcue-away";
  var HIDE_PX = 1;
  var SHOW_SETTLE_MS = 80;
  var cueUserScrolled = 0;
  var cueSawBelowTop = 0;
  var cueHideIntentAt = 0;
  var touchStartY = null;
  var HIDE_INTENT_LOCK_MS = 900;
  var bootShowRetryTimer = 0;
  try {
    document.documentElement.classList.add(CLS);
  } catch (eAway0) {}
  /* scrollCueBootShow1: durante sipario/barra load ignora wheel/touch “intent” (trackpad noise) */
  function bootGatesActive() {
    try {
      var root = document.documentElement;
      if (!root) return true;
      if (root.classList.contains("vc-loading-scroll-lock")) return true;
      if (root.classList.contains("vc-chrome-bar-loading")) return true;
      if (root.classList.contains("vc-interaction-hold")) return true;
      if (root.classList.contains("vc-loader-blocking-live")) return true;
      if (
        root.classList.contains("vc-site-polish") &&
        !root.classList.contains("vc-cine-curtain-off") &&
        !root.classList.contains("vc-page-cine-ready")
      )
        return true;
      return false;
    } catch (eBg) {
      return false;
    }
  }
  /* scrollCueBootShow1: wheel a Y≈0 non deve lock forever — solo lock temporaneo */
  function clearExpiredTopIntent() {
    try {
      if (readCueY() > HIDE_PX) return false;
      if (cueSawBelowTop) return false;
      if (!cueUserScrolled && !cueHideIntentAt) return false;
      if (cueHideIntentAt && Date.now() - cueHideIntentAt < HIDE_INTENT_LOCK_MS) return false;
      cueUserScrolled = 0;
      cueHideIntentAt = 0;
      return true;
    } catch (eClr) {
      return false;
    }
  }

  function boardsContentPendingPath() {
    try {
      var p = String(location.pathname || "").replace(/\/+$/, "") || "/";
      if (/\/(?:bacheca|boards)$/i.test(p)) return true;
      if (
        /\/(?:bacheca|boards)\/(?:scheda|view|server|servers|bot|bots|le-mie|invia|mod)(?:\/|$)/i.test(
          p,
        )
      ) {
        return true;
      }
    } catch (eP) {}
    return false;
  }
  function boardsSchedaPath() {
    try {
      var p = String(location.pathname || "");
      if (/\/(?:bacheca|boards)\/scheda(?:\/|$)/i.test(p)) return true;
      if (/\/(?:bacheca|boards)\/view(?:\/|$)/i.test(p)) return true;
      if (/\/(?:bacheca|boards)\/(?:server|servers|bot|bots)\/[^/]+/i.test(p)) return true;
    } catch (eS) {}
    return false;
  }
  function markBoardsViewPendingEarly() {
    try {
      if (!boardsContentPendingPath()) return;
      document.documentElement.classList.add("vc-boards-view-pending");
      if (boardsSchedaPath()) document.documentElement.classList.add(CLS);
      try {
        window.__vcBoardsContentReady = 0;
      } catch (e0) {}
      if (!document.getElementById("vc-boards-load-hold-css")) {
        var st = document.createElement("style");
        st.id = "vc-boards-load-hold-css";
        var holdCss =
          '[data-vc-boards-static="loading"]{display:none!important;visibility:hidden!important;' +
          "height:0!important;margin:0!important;padding:0!important;border:0!important;overflow:hidden!important}";
        if (boardsSchedaPath()) {
          holdCss +=
            "html.vc-boards-view-pending body.vc-body>main," +
            "html.vc-boards-view-pending body.vc-body>header," +
            "html.vc-boards-view-pending body.vc-body>footer{" +
            "opacity:0!important;visibility:hidden!important;pointer-events:none!important}" +
            "html.vc-boards-view-pending{" +
            "overflow:hidden!important;height:100%!important;max-height:100dvh!important}" +
            "html.vc-boards-view-pending::before{" +
            'content:""!important;position:fixed!important;inset:0!important;z-index:2147482995!important;' +
            "background:#100c09!important;opacity:1!important;visibility:visible!important;" +
            "pointer-events:auto!important;display:block!important}";
        } else {
          holdCss +=
            "html.vc-boards-view-pending body.vc-body>main," +
            "html.vc-boards-view-pending body.vc-body>header," +
            "html.vc-boards-view-pending body.vc-body>footer{" +
            "opacity:1!important;visibility:visible!important;pointer-events:auto!important}" +
            "html.vc-boards-view-pending::before{display:none!important;opacity:0!important;" +
            "visibility:hidden!important;pointer-events:none!important}" +
            "html.vc-boards-view-pending{" +
            "overflow:auto!important;height:auto!important;max-height:none!important}" +
            "html.vc-boards-view-pending #vc-boards-root{" +
            "opacity:0!important;visibility:hidden!important;pointer-events:none!important;" +
            "min-height:12rem!important}";
        }
        st.textContent = holdCss;
        (document.head || document.documentElement).appendChild(st);
      }
    } catch (eM) {}
  }
  markBoardsViewPendingEarly();

  var lastAway = true;
  var showTimer = 0;
  var chromeOkSticky = 0;
  function markAway() {
    if (lastAway) return;
    lastAway = true;
    try {
      document.documentElement.classList.add(CLS);
    } catch (eC) {}
  }
  function markShow() {
    if (!lastAway) return;
    lastAway = false;
    try {
      document.documentElement.classList.remove(CLS);
    } catch (eS) {}
  }
  function hardHideCue(c) {
    if (!c) return;
    try {
      /* cueHideSnap2: hardShow lascia display/opacity !important INLINE —
         il CSS is-away perde contro inline → cue resta visibile (sembra delay).
         Su hide bisogna azzerare quei 4 props (una volta; early-return se già none). */
      if (
        c.classList.contains("is-away") &&
        c.hidden &&
        String(c.style.display || "").indexOf("none") !== -1
      )
        return;
      c.classList.add("is-away");
      c.classList.remove("is-fading");
      c.hidden = true;
      c.setAttribute("aria-hidden", "true");
      c.style.setProperty("display", "none", "important");
      c.style.setProperty("opacity", "0", "important");
      c.style.setProperty("visibility", "hidden", "important");
      c.style.setProperty("pointer-events", "none", "important");
    } catch (eH) {}
  }
  function hardShowCue(c) {
    if (!c) return;
    /* scrollCueLiveY1: mai forzare display:flex se siamo sotto soglia / user ha scrollato */
    try {
      if (pageBlocksScrollCue && pageBlocksScrollCue()) {
        hardHideCue(c);
        return;
      }
      if (readCueY() > HIDE_PX || cueUserScrolled) {
        hardHideCue(c);
        return;
      }
    } catch (eGuard) {}
    try {
      c.classList.remove("is-away", "is-fading");
      c.hidden = false;
      c.removeAttribute("hidden");
      c.setAttribute("aria-hidden", "false");
      c.style.setProperty("display", "flex", "important");
      c.style.setProperty("opacity", "1", "important");
      c.style.setProperty("visibility", "visible", "important");
      c.style.setProperty("pointer-events", "auto", "important");
      c.style.setProperty("transition", "none", "important");
    } catch (eSh) {}
  }
  function readCueY() {
    /* scrollCueLiveY1: SEMPRE live — cache stale=0 su pagine chrome-only faceva riapparire il cue a fondo pagina */
    try {
      var y = window.pageYOffset;
      if (y == null || !Number.isFinite(Number(y))) {
        y = (document.documentElement && document.documentElement.scrollTop) || 0;
      }
      if ((y == null || !Number.isFinite(Number(y)) || Number(y) === 0) && document.body) {
        var by = Number(document.body.scrollTop) || 0;
        if (by > 0) y = by;
      }
      y = Math.max(0, Math.round(Number(y) || 0));
      try {
        window.__vcCachedScrollY = y;
      } catch (eSet) {}
      return y;
    } catch (eY) {
      return 0;
    }
  }
  /* cueCineRestore1: blocca solo scheda boards — le cine (home/personalizza/tickets/staff) OK */
  function pageBlocksScrollCue() {
    try {
      if (boardsSchedaPath()) return true;
      var root = document.documentElement;
      var body = document.body;
      if (root && (root.classList.contains("vc-boards-scheda-ui") || root.classList.contains("vc-boards-detail-live")))
        return true;
      if (
        body &&
        (body.classList.contains("vc-boards-scheda-ui") ||
          body.classList.contains("vc-boards-detail-live") ||
          String(body.getAttribute("data-vc-boards-page") || "").toLowerCase() === "view")
      )
        return true;
      return false;
    } catch (eBlk) {
      return false;
    }
  }
  function pageHasScrollRoom() {
    try {
      var doc = document.documentElement;
      var vh = window.innerHeight || 0;
      var sh = (doc && doc.scrollHeight) || (document.body && document.body.scrollHeight) || 0;
      return sh - vh >= 120;
    } catch (eRoom) {
      return false;
    }
  }
  function killOrphanScrollCues() {
    try {
      var cues = document.querySelectorAll(".vc-home-scrollcue");
      for (var i = 0; i < cues.length; i++) {
        try {
          hardHideCue(cues[i]);
          if (cues[i].parentNode) cues[i].parentNode.removeChild(cues[i]);
        } catch (eRm) {}
      }
      /* scrollCuePersRestore1: kill class solo se la pagina NON vuole il cue */
      if (!pageWantsScrollCue()) {
        document.documentElement.classList.add("vc-scrollcue-kill");
      } else {
        document.documentElement.classList.remove("vc-scrollcue-kill");
      }
    } catch (eKill) {}
  }
  function cueAllowed() {
    try {
      var root = document.documentElement;
      var body = document.body;
      if (!body) return false;
      if (pageBlocksScrollCue()) return false;
      if (!pageHasScrollRoom()) return false;
      if (root.classList.contains("vc-boards-view-pending")) return false;
      if (root.classList.contains("vc-boards-scheda-ui") || root.classList.contains("vc-boards-detail-live"))
        return false;
      if (
        body.classList.contains("vc-boards-scheda-ui") ||
        body.classList.contains("vc-boards-detail-live") ||
        String(body.getAttribute("data-vc-boards-page") || "").toLowerCase() === "view"
      )
        return false;
      if (boardsSchedaPath()) return false;
      if (root.classList.contains("vc-page-cine-boot") && !root.classList.contains("vc-page-cine-ready"))
        return false;
      if (
        root.classList.contains("vc-site-polish") &&
        !root.classList.contains("vc-cine-curtain-off") &&
        !root.classList.contains("vc-page-cine-ready") &&
        !body.classList.contains("vc-body--home")
      )
        return false;
      /* solo home o cine-layout con hero reale */
      if (body.classList.contains("vc-body--home")) {
        return (
          root.classList.contains("vc-home-motion-ready") ||
          root.classList.contains("vc-soft-fx-ready") ||
          root.classList.contains("vc-soft-fx-off") ||
          root.classList.contains("vc-home-cine-live")
        );
      }
      if (body.classList.contains("vc-page-cine-layout") && root.classList.contains("vc-page-cine-ready")) {
        return !!(
          document.querySelector(".vc-page-cine-hero") ||
          document.querySelector(".vc-support-page-hero") ||
          document.querySelector(".vc-vote-page-hero") ||
          document.querySelector(".vc-home-cine-hero") ||
          document.getElementById("intro")
        );
      }
      return false;
    } catch (eA) {
      return false;
    }
  }
  function chromeGateBlocks() {
    try {
      var root = document.documentElement;
      if (root.classList.contains("vc-chrome-bar-loading")) return true;
      if (window.__vcChromeVisualReady === 1) {
        chromeOkSticky = 1;
        return false;
      }
      /* dopo primo ready: non restare bloccati se il flag flicker */
      if (chromeOkSticky) return false;
      /* boot: aspetta chrome visual, ma non oltre ~2.8s */
      var started = Number(window.__vcCineBootStartedAt || 0);
      if (started && Date.now() - started > 2800) {
        chromeOkSticky = 1;
        return false;
      }
      return window.__vcChromeVisualReady !== 1;
    } catch (eG) {
      return false;
    }
  }
  function pageWantsScrollCue() {
    try {
      var body = document.body;
      if (!body) return false;
      if (pageBlocksScrollCue()) return false;
      if (boardsSchedaPath()) return false;
      if (body.classList.contains("vc-body--home")) return true;
      /* cueCineRestore1: qualsiasi cine-layout con hero (personalizza/tickets/staff/…) */
      if (
        body.classList.contains("vc-page-cine-layout") &&
        document.querySelector(
          ".vc-page-cine-hero, .vc-support-page-hero, .vc-vote-page-hero, .vc-home-cine-hero, #intro, #vc-page-intro",
        )
      )
        return true;
      if (
        body.classList.contains("vc-boards-page") &&
        document.querySelector(".vc-page-cine-hero, .vc-support-page-hero, .vc-vote-page-hero")
      )
        return true;
      return false;
    } catch (eW) {
      return false;
    }
  }
  function ensureScrollCueDom() {
    /* cueBootAll1: senza home-cine (bootSlim) il cue non nasceva su sponsor/vota/faq… */
    try {
      var body = document.body;
      if (!body || !pageWantsScrollCue()) {
        killOrphanScrollCues();
        return;
      }
      try {
        document.documentElement.classList.remove("vc-scrollcue-kill");
      } catch (eUnk) {}
      if (document.querySelector(".vc-home-scrollcue")) return;
      var hero =
        document.querySelector(".vc-page-cine-hero") ||
        document.querySelector(".vc-support-page-hero") ||
        document.querySelector(".vc-vote-page-hero") ||
        document.querySelector(".vc-home-cine-hero") ||
        document.getElementById("intro");
      if (!hero) return;
      var target = document.getElementById("vc-page-content");
      if (!target) {
        var main = hero.closest("main") || document.querySelector("main");
        if (main) {
          var sib = hero.nextElementSibling;
          while (sib) {
            if (!sib.hidden && sib.getAttribute("hidden") == null && sib.id !== "vc-page-intro") {
              target = sib;
              break;
            }
            sib = sib.nextElementSibling;
          }
        }
      }
      if (!target) return;
      if (!target.id) target.id = "vc-page-content";
      var cue = document.createElement("a");
      cue.className = "vc-home-scrollcue vc-home-scrollcue--vp is-away";
      cue.hidden = true;
      cue.setAttribute("aria-hidden", "true");
      cue.setAttribute("aria-label", "Scorri per continuare a leggere");
      cue.setAttribute("href", "#" + target.id);
      cue.innerHTML =
        '<span class="vc-home-scrollcue__label">Scorri per continuare</span>' +
        '<span class="vc-home-scrollcue__chev" aria-hidden="true"><span></span><span></span></span>';
      try {
        cue.style.setProperty("display", "none", "important");
        cue.style.setProperty("position", "fixed", "important");
      } catch (eSt) {}
      body.appendChild(cue);
      if (cue.dataset.vcScrollCue !== "1") {
        cue.dataset.vcScrollCue = "1";
        cue.addEventListener(
          "click",
          function (ev) {
            try {
              if (ev && ev.preventDefault) ev.preventDefault();
              var el = document.getElementById("vc-page-content");
              if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "start" });
            } catch (eClick) {}
          },
          { passive: false },
        );
      }
    } catch (eEns) {}
  }
  function pinCues() {
    var body = document.body;
    if (!body) return;
    ensureScrollCueDom();
    var cues = document.querySelectorAll(".vc-home-scrollcue");
    if (!cues.length) return;
    var keep = null;
    for (var i = 0; i < cues.length; i++) {
      var c = cues[i];
      try {
        if (!keep) keep = c;
        else if (c !== keep) {
          try {
            if (c.parentNode) c.parentNode.removeChild(c);
          } catch (eRm) {}
          continue;
        }
        /* cueHideSnap1: se già pinned su body col bottom giusto → zero style storm
           (prima ogni wheel riscriveva 10 setProperty = lag percettibile sullo sparire) */
        if (
          c.parentNode === body &&
          c.dataset.vcCuePinned === "1" &&
          String(c.style.bottom || "").indexOf("0.2rem") !== -1
        ) {
          continue;
        }
        if (c.parentNode !== body) body.appendChild(c);
        c.classList.add("vc-home-scrollcue--vp");
        c.classList.remove("vc-home-scrollcue--dock");
        c.style.setProperty("position", "fixed", "important");
        c.style.setProperty("top", "auto", "important");
        c.style.setProperty("left", "0", "important");
        c.style.setProperty("right", "0", "important");
        c.style.setProperty("bottom", "calc(0.2rem + env(safe-area-inset-bottom, 0px))", "important");
        c.style.setProperty(
          "inset",
          "auto 0 calc(0.2rem + env(safe-area-inset-bottom, 0px)) 0",
          "important",
        );
        c.style.setProperty("transform", "none", "important");
        c.style.setProperty("z-index", "50", "important");
        c.style.setProperty("margin-left", "auto", "important");
        c.style.setProperty("margin-right", "auto", "important");
        c.dataset.vcCuePinned = "1";
      } catch (eP) {}
    }
  }
  function hideAllNow() {
    if (showTimer) {
      try {
        window.clearTimeout(showTimer);
      } catch (eCl) {}
      showTimer = 0;
    }
    markAway();
    var cues = document.querySelectorAll(".vc-home-scrollcue");
    for (var i = 0; i < cues.length; i++) hardHideCue(cues[i]);
  }
  function showAllNow() {
    if (readCueY() > HIDE_PX) {
      hideAllNow();
      return;
    }
    /* scrollCuePersRestore1: a Y≈0 dopo essere scesi → sempre riapri (ricrea DOM se smontato) */
    if (cueUserScrolled && cueSawBelowTop) {
      cueUserScrolled = 0;
      cueSawBelowTop = 0;
      cueHideIntentAt = 0;
    }
    /* scrollCueBootShow1: intent-only a top → scade, poi mostra */
    clearExpiredTopIntent();
    if (cueUserScrolled && !cueSawBelowTop) {
      hideAllNow();
      return;
    }
    ensureScrollCueDom();
    markShow();
    try {
      document.documentElement.classList.remove("vc-scrollcue-kill");
    } catch (eUnk2) {}
    var cues = document.querySelectorAll(".vc-home-scrollcue");
    for (var i = 0; i < cues.length; i++) hardShowCue(cues[i]);
  }
  function syncHard() {
    if (pageBlocksScrollCue() || !pageWantsScrollCue()) {
      killOrphanScrollCues();
      return;
    }
    try {
      document.documentElement.classList.remove("vc-scrollcue-kill");
    } catch (eUnk0) {}
    pinCues();
    if (chromeGateBlocks() || !cueAllowed() || !pageHasScrollRoom()) {
      hideAllNow();
      return;
    }
    var yNow = readCueY();
    if (yNow > HIDE_PX) {
      cueUserScrolled = 1;
      cueSawBelowTop = 1;
      hideAllNow();
      return;
    }
    /* scrollCuePersRestore1: tornati in cima → sblocca intent hide e remount */
    if (cueUserScrolled && cueSawBelowTop) {
      cueUserScrolled = 0;
      cueSawBelowTop = 0;
      cueHideIntentAt = 0;
    } else if (cueHideIntentAt && Date.now() - cueHideIntentAt < HIDE_INTENT_LOCK_MS) {
      hideAllNow();
      return;
    } else {
      /* scrollCueBootShow1: intent scaduto a Y≈0 → libera e mostra */
      clearExpiredTopIntent();
      if (cueUserScrolled && !cueSawBelowTop) {
        hideAllNow();
        return;
      }
    }
    /* a top: show subito (niente cooldown 280ms) */
    showAllNow();
  }
  function scheduleShowIfTop() {
    var y0 = readCueY();
    if (y0 > HIDE_PX) {
      cueUserScrolled = 1;
      cueSawBelowTop = 1;
      hideAllNow();
      return;
    }
    /* scrollCueBootShow1: intent-only a top → aspetta scadenza lock, non abort forever */
    clearExpiredTopIntent();
    if (cueUserScrolled && !cueSawBelowTop) {
      hideAllNow();
      return;
    }
    if (showTimer) {
      try {
        window.clearTimeout(showTimer);
      } catch (eCl2) {}
    }
    var waitMs = SHOW_SETTLE_MS;
    try {
      if (cueHideIntentAt) {
        var left = HIDE_INTENT_LOCK_MS - (Date.now() - cueHideIntentAt);
        if (left > waitMs) waitMs = left + 24;
      }
    } catch (eWait) {}
    showTimer = window.setTimeout(function () {
      showTimer = 0;
      try {
        pinCues();
        if (chromeGateBlocks() || !cueAllowed()) {
          hideAllNow();
          return;
        }
        var y = readCueY();
        if (y > HIDE_PX) {
          cueUserScrolled = 1;
          cueSawBelowTop = 1;
          hideAllNow();
          return;
        }
        /* tornati in cima dopo scroll reale → ok riaprire */
        if (cueUserScrolled && cueSawBelowTop) {
          cueUserScrolled = 0;
          cueSawBelowTop = 0;
        }
        clearExpiredTopIntent();
        if (cueHideIntentAt && Date.now() - cueHideIntentAt < HIDE_INTENT_LOCK_MS) {
          /* ancora in lock → riprogramma */
          scheduleShowIfTop();
          return;
        }
        if (cueUserScrolled) {
          hideAllNow();
          return;
        }
        showAllNow();
      } catch (eSh) {}
    }, waitMs);
  }
  /* scrollCuePersRestore1: riscrivi SEMPRE il CSS (SW/stale stamp lasciava kill su personalizza) */
  try {
    var cssBoot = document.getElementById("vc-scrollcue-away-boot-css");
    if (!cssBoot) {
      cssBoot = document.createElement("style");
      cssBoot.id = "vc-scrollcue-away-boot-css";
      (document.head || document.documentElement).appendChild(cssBoot);
    }
    cssBoot.setAttribute("data-vc", "scrollCuePersRestore1");
    cssBoot.textContent =
      "html.vc-scrollcue-kill .vc-home-scrollcue," +
      "html.vc-scrollcue-away .vc-home-scrollcue," +
      "html.vc-scrollcue-away .vc-home-scrollcue.is-away," +
      "html.vc-scrollcue-away body .vc-home-cine-hero > .vc-home-scrollcue," +
      "html.vc-scrollcue-away body .vc-page-cine-hero > .vc-home-scrollcue," +
      "html.vc-boards-view-pending .vc-home-scrollcue," +
      "html.vc-boards-scheda-ui .vc-home-scrollcue," +
      "html.vc-boards-detail-live .vc-home-scrollcue," +
      "html.vc-page-cine-boot:not(.vc-page-cine-ready) .vc-home-scrollcue," +
      "html.vc-site-polish:not(.vc-cine-curtain-off):not(.vc-page-cine-ready) body:not(.vc-body--home) .vc-home-scrollcue," +
      "html.vc-site-polish:not(.vc-soft-fx-ready):not(.vc-soft-fx-off) .vc-home-scrollcue," +
      "html.vc-loading-scroll-lock .vc-home-scrollcue," +
      "html.vc-loader-blocking-live .vc-home-scrollcue," +
      "html.vc-interaction-hold .vc-home-scrollcue," +
      "html.vc-chrome-bar-loading .vc-home-scrollcue," +
      "body.vc-boards-scheda-ui .vc-home-scrollcue," +
      "body.vc-boards-detail-live .vc-home-scrollcue," +
      "body:not(.vc-page-cine-layout):not(.vc-body--home) .vc-home-scrollcue{" +
      "display:none!important;opacity:0!important;visibility:hidden!important;" +
      "pointer-events:none!important;transition:none!important;animation:none!important;" +
      "transform:none!important}" +
      "body > .vc-home-scrollcue,body > .vc-home-scrollcue.vc-home-scrollcue--vp," +
      ".vc-home-scrollcue.vc-home-scrollcue--vp{" +
      "position:fixed!important;top:auto!important;left:0!important;right:0!important;" +
      "bottom:calc(0.2rem + env(safe-area-inset-bottom,0px))!important;" +
      "inset:auto 0 calc(0.2rem + env(safe-area-inset-bottom,0px)) 0!important;" +
      "transform:none!important;z-index:50!important;margin:0 auto!important;" +
      "width:max-content!important;max-width:calc(100% - 2rem)!important}" +
      ".vc-home-scrollcue,.vc-home-scrollcue.is-away,.vc-home-scrollcue.is-fading{" +
      "transition:none!important;animation:none!important}" +
      "body.vc-body--home .vc-home-scrollcue{transition:none!important}";
  } catch (eCss) {}

  var cueScrollArm = 0;
  function onCueScroll() {
    var y = readCueY();
    /* cueHideSnap1: hide PRIMA di pinCues (pin era ~300ms di style storm) */
    if (y > HIDE_PX) {
      cueUserScrolled = 1;
      cueSawBelowTop = 1;
      hideAllNow();
    } else {
      pinCues();
      scheduleShowIfTop();
    }
    if (cueScrollArm) return;
    cueScrollArm = 1;
    window.setTimeout(function () {
      cueScrollArm = 0;
      try {
        var y2 = readCueY();
        if (y2 > HIDE_PX) {
          cueUserScrolled = 1;
          cueSawBelowTop = 1;
          hideAllNow();
        } else {
          pinCues();
          scheduleShowIfTop();
        }
      } catch (eScr) {}
    }, 16);
  }
  window.addEventListener(
    "wheel",
    function (e) {
      try {
        /* scrollCueBootShow1: durante load non latch-are hide forever */
        if (bootGatesActive()) return;
        var dy = Number(e && e.deltaY) || 0;
        var y = readCueY();
        /* cueHideSnap1 + scrollCueHideIntent1: hide SUBITO, pin dopo.
           A Y≈0: solo intent temporaneo (no cueUserScrolled forever). */
        if (y > HIDE_PX) {
          cueUserScrolled = 1;
          cueSawBelowTop = 1;
          cueHideIntentAt = Date.now();
          hideAllNow();
          return;
        }
        if (dy > 0.5) {
          cueHideIntentAt = Date.now();
          /* non settare cueUserScrolled: altrimenti cue resta morto finché non scendi+risali */
          hideAllNow();
          /* scrollCueBootShow1: ri-mostra da solo dopo lock (senza dover scendere+risalire) */
          scheduleShowIfTop();
          return;
        }
        if (dy < -0.5 && y <= HIDE_PX && cueSawBelowTop) {
          cueHideIntentAt = 0;
        }
      } catch (eWh) {}
      onCueScroll();
    },
    { passive: true, capture: true },
  );
  window.addEventListener(
    "touchstart",
    function (e) {
      try {
        touchStartY = e && e.touches && e.touches[0] ? e.touches[0].clientY : null;
      } catch (eTs) {
        touchStartY = null;
      }
    },
    { passive: true, capture: true },
  );
  window.addEventListener(
    "touchmove",
    function (e) {
      try {
        if (bootGatesActive()) return;
        var cy = e && e.touches && e.touches[0] ? e.touches[0].clientY : null;
        var y = readCueY();
        if (y > HIDE_PX) {
          cueUserScrolled = 1;
          cueSawBelowTop = 1;
          cueHideIntentAt = Date.now();
          hideAllNow();
          return;
        }
        if (touchStartY != null && cy != null && Math.abs(cy - touchStartY) > 4) {
          /* scrollCueBootShow1: swipe a top = intent temporaneo, non lock forever */
          cueHideIntentAt = Date.now();
          hideAllNow();
          scheduleShowIfTop();
          return;
        }
      } catch (eTm) {}
      onCueScroll();
    },
    { passive: true, capture: true },
  );
  window.addEventListener(
    "touchend",
    function () {
      touchStartY = null;
    },
    { passive: true, capture: true },
  );
  window.addEventListener("scroll", onCueScroll, { passive: true, capture: true });
  /* cueKeep1: dopo ready ri-mostra cue a Y≈0 (su alcune pagine restava nascosto) */
  function pokeShowCue() {
    try {
      /* cueHideSnap1: NON azzerare hide-intent attivo — altrimenti softSync
         ri-mostra il cue subito dopo lo scroll (sembra delay sullo sparire).
         scrollCueBootShow1: intent scaduto a top → libera. */
      if (readCueY() <= HIDE_PX) {
        clearExpiredTopIntent();
        if (
          !(cueHideIntentAt && Date.now() - cueHideIntentAt < HIDE_INTENT_LOCK_MS) &&
          !cueUserScrolled
        ) {
          cueSawBelowTop = 0;
          cueHideIntentAt = 0;
        }
      }
      chromeOkSticky = 1;
      syncHard();
    } catch (ePk) {}
  }
  /* scrollCueBootShow1: dopo unlock, ritenta show a top (layout/room/intent settle) */
  function armBootShowRetries() {
    try {
      if (bootShowRetryTimer) window.clearTimeout(bootShowRetryTimer);
    } catch (eClR) {}
    var delays = [0, 120, 400, 900];
    var i = 0;
    function step() {
      bootShowRetryTimer = 0;
      try {
        if (readCueY() > HIDE_PX) return;
        clearExpiredTopIntent();
        chromeOkSticky = 1;
        syncHard();
      } catch (eSt) {}
      i += 1;
      if (i < delays.length) {
        bootShowRetryTimer = window.setTimeout(step, delays[i] - (delays[i - 1] || 0));
      }
    }
    bootShowRetryTimer = window.setTimeout(step, delays[0]);
  }
  var softSyncTimer = 0;
  function softSync() {
    /* cueEmojiBoot1: un solo re-sync debounce — niente storm 0/24/120/320/700 */
    try {
      if (softSyncTimer) window.clearTimeout(softSyncTimer);
    } catch (eCl) {}
    softSyncTimer = window.setTimeout(function () {
      softSyncTimer = 0;
      pokeShowCue();
    }, 48);
  }
  document.addEventListener("vc:page-cine-ready", softSync, { passive: true });
  document.addEventListener(
    "vc:chrome-ready",
    function () {
      chromeOkSticky = 1;
      softSync();
    },
    { passive: true },
  );
  document.addEventListener(
    "vc:chrome-visual-ready",
    function () {
      chromeOkSticky = 1;
      clearExpiredTopIntent();
      softSync();
      armBootShowRetries();
    },
    { passive: true },
  );
  document.addEventListener("vc:soft-fx-ready", softSync, { passive: true });
  document.addEventListener(
    "vc:scroll-restored",
    function () {
      softSync();
    },
    { passive: true },
  );
  /* bugListBoot1C + scrollCueBootShow1: chrome-load-done → show cue subito + retry */
  document.addEventListener(
    "vc:chrome-load-done",
    function () {
      try {
        chromeOkSticky = 1;
        clearExpiredTopIntent();
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            try {
              syncHard();
              armBootShowRetries();
            } catch (eSH) {}
          });
        });
      } catch (eCLD) {}
    },
    { passive: true },
  );
  function restoreCueAfterBoardsReady() {
    try {
      if (boardsSchedaPath()) return;
      softSync();
    } catch (eRest) {}
  }
  try {
    window.__vcScrollCueBootSync = syncHard;
    window.__vcSyncScrollCue = syncHard;
  } catch (eExp) {}
  document.addEventListener("vc:boards-content-ready", restoreCueAfterBoardsReady, {
    passive: true,
  });
  /* pin appena il body esiste — evita cue absolute nell'hero che “segue” lo scroll */
  function bootPin() {
    try {
      pinCues();
    } catch (eBp) {}
    softSync();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      markBoardsViewPendingEarly();
      try {
        var body = document.body;
        if (body && body.classList.contains("vc-boards-page") && boardsContentPendingPath()) {
          document.documentElement.classList.add("vc-boards-view-pending");
          if (
            boardsSchedaPath() ||
            String(body.getAttribute("data-vc-boards-page") || "").toLowerCase() === "view"
          ) {
            document.documentElement.classList.add(CLS);
          }
        }
      } catch (eBody) {}
      bootPin();
    });
  } else {
    bootPin();
  }
  bootPin();
  try {
    if (window.MutationObserver) {
      var moArm = 0;
      var mo = new MutationObserver(function () {
        if (moArm) return;
        moArm = 1;
        window.setTimeout(function () {
          moArm = 0;
          try {
            pinCues();
          } catch (eMo) {}
        }, 40);
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
    }
  } catch (eObs) {}
})();
/* scrollCueStableTop1 */
/* scrollCueLiveY1 */
/* scrollCueHideIntent1 */
/* scrollCueOwner1 */
/* cueBootAll1 */
/* violKillFinal1 */
/* violPass2 */
/* violKill3 */
/* violKill5 */
/* notifHashYoYo1 */
/* violPass8 */
/* violPass9 */
/* violPass10 */
/* violPass11 */
/* scrollCueNoFollow1 */
/* scrollCueInstantHide1 */
/* scrollCueBoardsKeep1 */
/* bootUiCueBar1 */
/* schedaBootCue1 */
/* boardsLoadHold1c */
/* bfNavRestore1 */
/* cueKeep1 */
/* scrollCueBootShow1 */

/* cueMarginBar1 */
