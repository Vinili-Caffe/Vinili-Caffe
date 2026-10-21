/* kickerNoHang1: no scramble; welcome hold senza MO loop (freeze page). */
(function () {
  "use strict";

  var GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#@$%&<>/\\|";
  var STAMP = "20261019kickerNoHang1";
  /* tutte le pill hero / confessionale — niente deck/aside/FAQ tip */
  var KICKER_SEL = ".vc-hero-kicker, .vc-confessionale-kicker";
  var NO_HACK_SEL =
    ".vc-home-deck__kicker, .vc-home-index__kicker, .vc-home-feature__kicker, .vc-section-kicker, .vc-page-cine-aside-inline .vc-hero-kicker, .vc-page-cine-aside-inline p.text-xs, .vc-home-deck p.text-xs, aside p.text-xs.font-semibold.uppercase";
  var running = typeof WeakMap !== "undefined" ? new WeakMap() : null;
  var booted = false;
  var revealWatchBound = false;
  var io = null;

  function isDesktopNav() {
    try {
      if (window.matchMedia && window.matchMedia("(max-width: 639.98px)").matches) return false;
      if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return false;
      if (window.matchMedia && window.matchMedia("(min-width: 1200px)").matches) return true;
      if (window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches) return true;
    } catch (e) {}
    return true;
  }

  function desktopNow() {
    return isDesktopNav();
  }

  /* kickerPcShort1: PC ~6–8 tick × 12ms + lock 2 char → ~100–140ms */
  function scrambleOnly() {
    return desktopNow() ? 2 : 3;
  }
  function lockEvery() {
    return 1;
  }
  function lockCharsPerStep() {
    return desktopNow() ? 2 : 1;
  }
  function maxTicks() {
    return desktopNow() ? 8 : 12;
  }
  function tickMs() {
    return desktopNow() ? 12 : 14;
  }
  function settleAfterReadyMs() {
    return desktopNow() ? 12 : 20;
  }
  function replayAfterReadyMs() {
    return desktopNow() ? 12 : 20;
  }

  /* kickerPcVisible1: non saltare lo scramble per OS “riduci animazioni” — è effetto brand richiesto */
  function prefersReduced() {
    return false;
  }

  function isHomeWelcome(el) {
    if (!el) return false;
    try {
      var key = String(el.getAttribute("data-i18n") || "");
      return key.indexOf("home.welcome") === 0;
    } catch (e) {
      return false;
    }
  }

  function isInclusiveWelcome(text) {
    return /\bbenvenut\*\b/i.test(String(text || ""));
  }

  function isHomePage() {
    try {
      return document.body && document.body.classList.contains("vc-body--home");
    } catch (e) {
      return false;
    }
  }

  function looksLikeI18nKey(s) {
    var t = String(s || "").trim();
    if (!t || t.indexOf(" ") !== -1) return false;
    return /^[a-z0-9]+(?:\.[a-z0-9_-]+)+$/i.test(t);
  }

  function pageRevealReady() {
    try {
      var root = document.documentElement;
      if (!root) return false;
      /* kickerHack11: finché il layout cine non è ready, niente decode (su PC si perdeva) */
      if (root.classList.contains("vc-page-cine-boot") && !root.classList.contains("vc-page-cine-ready")) {
        return false;
      }
      if (bootCurtainBlocking()) return false;
      if (root.classList.contains("vc-page-cine-ready")) return true;
      if (isHomePage()) {
        return (
          root.classList.contains("vc-home-styles-ready") &&
          (root.classList.contains("vc-page-cine-ready") || root.classList.contains("vc-cine-curtain-off"))
        );
      }
      if (root.classList.contains("vc-styles-ready") && !root.classList.contains("vc-page-cine-boot")) {
        return true;
      }
      if (!root.classList.contains("vc-page-cine-boot") && !root.classList.contains("vc-site-polish")) {
        return true;
      }
      if (!root.classList.contains("vc-page-cine-boot") && root.classList.contains("vc-core-styles-ready")) {
        return true;
      }
      return false;
    } catch (e) {
      return true;
    }
  }

  function bootCurtainBlocking() {
    try {
      var root = document.documentElement;
      if (root.classList.contains("vc-cine-curtain-off")) return false;
      if (root.classList.contains("vc-page-cine-boot") && !root.classList.contains("vc-page-cine-ready")) {
        return true;
      }
      var cur = document.getElementById("vc-cine-boot-curtain");
      /* violPass6: niente getComputedStyle/getBCR sul curtain */
      if (!cur || cur.hidden || cur.hasAttribute("hidden")) return false;
      return true;
    } catch (eC) {
      return false;
    }
  }

  function viewportBlockedByGate(forEl) {
    /* hero pill: ignora gate login full-page (appelli/candidature) */
    try {
      if (
        forEl &&
        (forEl.classList.contains("vc-hero-kicker") || forEl.classList.contains("vc-confessionale-kicker")) &&
        !isTipCardKicker(forEl)
      ) {
        return false;
      }
    } catch (eHeroGate) {}
    try {
      var nodes = document.querySelectorAll(
        ".vc-reviews-gate, .vc-access-gate, .vc-auth-required, #vc-access-gate"
      );
      for (var i = 0; i < nodes.length; i += 1) {
        var gate = nodes[i];
        if (!gate || gate === document.documentElement || gate === document.body) continue;
        if (gate.hidden || gate.hasAttribute("hidden")) continue;
        if (gate.closest && gate.closest("header, footer, nav")) continue;
        /* violPass6: offset size only — no getComputedStyle storm */
        if ((gate.offsetWidth || 0) > 80 && (gate.offsetHeight || 0) > 80) return true;
      }
    } catch (eGate) {}
    return false;
  }

  function elVisiblyReady(el) {
    if (!el || !pageRevealReady()) return false;
    if (bootCurtainBlocking()) return false;
    /* violKillFinal2: a boot niente offsetWidth (Forced reflow / timeout 64ms+) */
    if (window.__vcBootLightUntil && Date.now() < window.__vcBootLightUntil) {
      try {
        if (el.hidden || el.hasAttribute("hidden")) return false;
      } catch (eBootVis) {}
      return true;
    }
    if (viewportBlockedByGate(el)) return false;
    try {
      if (el.hidden || el.hasAttribute("hidden")) return false;
      if (el.offsetParent === null && el.tagName !== "BODY") {
        var w = el.offsetWidth || 0;
        var h = el.offsetHeight || 0;
        if (w < 2 && h < 2) return false;
      }
    } catch (eVis) {}
    return true;
  }

  function applyHackLook(el, lockedWidthPx) {
    if (!el || !el.style) return;
    try {
      var w = Math.max(0, Math.ceil(Number(lockedWidthPx) || 0));
      if (w < 4) {
        /* misura SOLO se non abbiamo ancora scritto style/class sul nodo */
        try {
          w = Math.ceil(el.offsetWidth || 0);
        } catch (eW0) {
          w = 0;
        }
      }
      /* min-width only — never max/overflow clip (that hid scramble on desktop) */
      if (w >= 4) {
        el.style.setProperty("min-width", w + "px", "important");
      }
      el.style.setProperty(
        "font-family",
        'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
        "important"
      );
      el.style.setProperty("letter-spacing", "0.14em", "important");
      el.style.setProperty("color", "rgba(255, 236, 210, 0.98)", "important");
      el.style.setProperty("-webkit-text-fill-color", "rgba(255, 236, 210, 0.98)", "important");
      el.style.setProperty("background-clip", "padding-box, border-box", "important");
      el.style.setProperty("-webkit-background-clip", "padding-box, border-box", "important");
      el.style.setProperty(
        "text-shadow",
        "0 0 8px rgba(245, 214, 183, 0.65), 0 0 18px rgba(212, 168, 136, 0.42)",
        "important"
      );
      el.style.setProperty("opacity", "1", "important");
    } catch (eLook) {}
  }

  function clearHackLook(el) {
    if (!el || !el.style) return;
    try {
      el.style.removeProperty("font-family");
      el.style.removeProperty("letter-spacing");
      el.style.removeProperty("color");
      el.style.removeProperty("-webkit-text-fill-color");
      el.style.removeProperty("background-clip");
      el.style.removeProperty("-webkit-background-clip");
      el.style.removeProperty("text-shadow");
      el.style.removeProperty("opacity");
      el.style.removeProperty("min-width");
      el.style.removeProperty("max-width");
      el.style.removeProperty("width");
      el.style.removeProperty("box-sizing");
      el.style.removeProperty("overflow");
      el.style.removeProperty("white-space");
    } catch (eClear) {}
  }

  function stop(el) {
    if (!el || !running) return;
    var st = running.get(el);
    if (!st) return;
    try {
      if (st.raf) cancelAnimationFrame(st.raf);
    } catch (e) {}
    try {
      if (st.timer) clearTimeout(st.timer);
    } catch (e2) {}
    running.delete(el);
    try {
      el.classList.remove("is-hacking");
    } catch (e3) {}
    clearHackLook(el);
  }

  function randomGlyph() {
    return GLYPHS.charAt((Math.random() * GLYPHS.length) | 0);
  }

  function scrambleFrame(target, locked) {
    var out = "";
    for (var i = 0; i < target.length; i += 1) {
      var ch = target.charAt(i);
      if (ch === " " || ch === "\u00a0") {
        out += " ";
        continue;
      }
      if (i < locked) out += ch;
      else out += randomGlyph();
    }
    return out;
  }

  function looksLikeNoise(text, expectedLen) {
    var t = String(text || "").trim();
    if (!t) return true;
    if (expectedLen && Math.abs(t.length - expectedLen) > 2) return false;
    var letters = 0;
    var noise = 0;
    for (var i = 0; i < t.length; i += 1) {
      var c = t.charAt(i);
      if (c === " ") continue;
      if (/[A-Za-zÀ-ÿ0-9*]/.test(c)) letters += 1;
      if ("#@$%&<>/\\|".indexOf(c) >= 0) noise += 1;
    }
    return noise >= 2 && noise >= letters * 0.35;
  }

  function rememberFinal(el, text) {
    if (!el) return "";
    var prev = el.getAttribute("data-vc-hack-final") || "";
    if (text == null || text === "") {
      if (el.classList.contains("is-hacking") && prev) return prev;
      if (prev) return prev;
      text = el.textContent || "";
    }
    var t = String(text).replace(/\s+/g, " ").trim();
    if (!t) return prev || "";
    if (looksLikeI18nKey(t)) return prev || "";
    /* welcomePronouns6 / welcomePronouns9: never lock inclusive Benvenut* as final on home welcome */
    if (isHomeWelcome(el) && isInclusiveWelcome(t)) {
      if (prev && !isInclusiveWelcome(prev)) return prev;
      /* even after ready=1, Benvenut* must not become the locked final (API may still upgrade) */
      return prev || "";
    }
    /* welcomePronouns4: never lock inclusive Benvenut* over a gendered final */
    if (isInclusiveWelcome(t) && prev && !isInclusiveWelcome(prev)) return prev;
    if (
      isInclusiveWelcome(t) &&
      el.getAttribute("data-vc-welcome-from-api") === "1" &&
      (el.getAttribute("data-vc-welcome-pronoun") === "home.welcomeM" ||
        el.getAttribute("data-vc-welcome-pronoun") === "home.welcomeF")
    ) {
      return prev || "";
    }
    if (prev && looksLikeNoise(t, prev.length) && !looksLikeNoise(prev, prev.length)) return prev;
    if (prev && looksLikeI18nKey(prev) && !looksLikeI18nKey(t)) {
      el.setAttribute("data-vc-hack-final", t);
      return t;
    }
    el.setAttribute("data-vc-hack-final", t);
    return t;
  }

  function resolveText(el, explicit) {
    if (explicit != null && String(explicit).trim() !== "") {
      var ex = String(explicit).replace(/\s+/g, " ").trim();
      if (!looksLikeI18nKey(ex) && !(isInclusiveWelcome(ex) && isHomeWelcome(el) && el.getAttribute("data-vc-welcome-from-api") === "1" && (el.getAttribute("data-vc-welcome-pronoun") === "home.welcomeM" || el.getAttribute("data-vc-welcome-pronoun") === "home.welcomeF"))) {
        return ex;
      }
    }
    try {
      var welcomeKey = el && (el.getAttribute("data-vc-welcome-pronoun") || el.getAttribute("data-i18n"));
      if (
        welcomeKey &&
        (welcomeKey === "home.welcomeM" || welcomeKey === "home.welcomeF") &&
        window.VcI18n &&
        typeof window.VcI18n.t === "function"
      ) {
        var gendered = window.VcI18n.t(welcomeKey);
        if (gendered && gendered !== welcomeKey && !looksLikeI18nKey(gendered) && !isInclusiveWelcome(gendered)) {
          return String(gendered).replace(/\s+/g, " ").trim();
        }
      }
    } catch (eW) {}
    try {
      var key = el && el.getAttribute("data-i18n");
      if (key && window.VcI18n && typeof window.VcI18n.t === "function") {
        var translated = window.VcI18n.t(key);
        if (translated && translated !== key && !looksLikeI18nKey(translated)) {
          return String(translated).replace(/\s+/g, " ").trim();
        }
      }
    } catch (e) {}
    var stored = el && el.getAttribute("data-vc-hack-final");
    if (stored && !looksLikeNoise(stored, stored.length) && !looksLikeI18nKey(stored)) {
      if (!(isInclusiveWelcome(stored) && isHomeWelcome(el) && (el.getAttribute("data-vc-welcome-pronoun") === "home.welcomeM" || el.getAttribute("data-vc-welcome-pronoun") === "home.welcomeF"))) {
        return stored;
      }
    }
    var dom = String((el && el.textContent) || "").replace(/\s+/g, " ").trim();
    if (dom && !looksLikeI18nKey(dom) && !looksLikeNoise(dom, dom.length)) {
      if (!(isInclusiveWelcome(dom) && isHomeWelcome(el) && (el.getAttribute("data-vc-welcome-pronoun") === "home.welcomeM" || el.getAttribute("data-vc-welcome-pronoun") === "home.welcomeF"))) {
        return dom;
      }
    }
    var src = el && el.getAttribute("data-i18n-src");
    if (src && !looksLikeI18nKey(src) && !looksLikeNoise(src, src.length)) {
      return String(src).replace(/\s+/g, " ").trim();
    }
    return "";
  }

  function settleInstant(el, target) {
    if (!el) return;
    try {
      stop(el);
    } catch (eSt) {}
    if (target) rememberFinal(el, target);
    var finalTxt = target || el.getAttribute("data-vc-hack-final") || String(el.textContent || "").trim();
    if (finalTxt && !looksLikeI18nKey(finalTxt)) {
      el.textContent = finalTxt;
    }
    el.classList.remove("is-hacking");
    try {
      clearHackLook(el);
    } catch (eCl) {}
    el.setAttribute("data-vc-hack-done", "1");
    el.setAttribute("data-vc-hack-seen", "1");
    el.setAttribute("data-vc-hack-played-visible", "1");
    el.setAttribute("data-vc-hack-settled-pre", "1");
    el.removeAttribute("data-vc-hack-pending");
    el.removeAttribute("data-vc-hack-waiting");
  }

  function play(el, opts) {
    if (!el) return;
    if (isNoHackKicker(el)) {
      settleNoHack(el);
      return;
    }
    opts = opts || {};
    var force = opts.force === true;
    /* kickerNoHack1: scramble disabilitato ovunque */
    var wantScramble = false;
    void opts.scramble;
    var target = resolveText(el, opts.text);
    if (!target || looksLikeNoise(target, target.length) || looksLikeI18nKey(target)) {
      target = el.getAttribute("data-vc-hack-final") || target;
    }
    if (!target || looksLikeI18nKey(target)) {
      el.setAttribute("data-vc-hack-pending", "1");
      scheduleRevealReplay();
      return;
    }

    /* textSettlePre1: default = testo finale subito (anche sotto curtain) */
    if (!wantScramble) {
      settleInstant(el, target);
      return;
    }

    /* scramble (solo langchange): se curtain su, settle e stop */
    if (!pageRevealReady() || bootCurtainBlocking()) {
      settleInstant(el, target);
      return;
    }
    if (!elVisiblyReady(el)) {
      if (!force) {
        settleInstant(el, target);
        return;
      }
      try {
        if (el.hidden || el.hasAttribute("hidden")) {
          settleInstant(el, target);
          return;
        }
      } catch (eForceVis) {}
    }

    if (prefersReduced()) {
      settleInstant(el, target);
      return;
    }

    stop(el);
    rememberFinal(el, target);
    el.setAttribute("data-vc-hack-final", target);
    el.removeAttribute("data-vc-hack-pending");
    el.removeAttribute("data-vc-hack-done");

    var playedVisible = false;
    try {
      playedVisible = elVisiblyReady(el) && !bootCurtainBlocking();
    } catch (ePv) {
      playedVisible = false;
    }

    var boxW = 0;
    try {
      /* violPass6: misura PRIMA delle class write */
      boxW = Math.ceil(el.offsetWidth || 0);
    } catch (eBox) {
      boxW = 0;
    }
    el.classList.add("vc-kicker-hack", "is-hacking");
    applyHackLook(el, boxW);

    var locked = 0;
    var tick = 0;
    var scrambleOnlyN = scrambleOnly();
    var lockEveryN = lockEvery();
    var maxTicksN = maxTicks();
    var stepMs = tickMs();
    var startedAt = Date.now();
    var hardCapMs = desktopNow() ? 160 : 360;
    var st = { raf: 0, timer: 0 };

    function finish() {
      el.textContent = target;
      el.classList.remove("is-hacking");
      clearHackLook(el);
      el.setAttribute("data-vc-hack-done", "1");
      el.setAttribute("data-vc-hack-seen", "1");
      /* se curtain era giù a fine scramble, conta come played-visible (evita re-loop home) */
      if (playedVisible || (pageRevealReady() && !bootCurtainBlocking())) {
        el.setAttribute("data-vc-hack-played-visible", "1");
      } else {
        el.removeAttribute("data-vc-hack-played-visible");
      }
      if (running) running.delete(el);
    }

    var lockStepN = lockCharsPerStep();
    function step() {
      tick += 1;
      if (tick > scrambleOnlyN && tick % lockEveryN === 0 && locked < target.length) {
        var add = 0;
        while (add < lockStepN && locked < target.length) {
          locked += 1;
          add += 1;
          while (locked < target.length && (target.charAt(locked) === " " || target.charAt(locked) === "\u00a0")) {
            locked += 1;
          }
        }
      }
      if (tick >= maxTicksN || Date.now() - startedAt >= hardCapMs) locked = target.length;
      el.textContent = scrambleFrame(target, locked);
      if (locked >= target.length) {
        finish();
        return;
      }
      st.timer = window.setTimeout(step, stepMs);
    }

    el.textContent = scrambleFrame(target, 0);
    st.timer = window.setTimeout(step, opts.delayMs != null ? opts.delayMs : 16);
    if (running) running.set(el, st);
  }

  function isTipCardKicker(el) {
    if (!el) return false;
    try {
      if (el.closest(".vc-page-cine-aside-inline, .vc-home-deck, aside, .vc-tip-row")) return true;
      var card = el.closest("[class*='rounded-']");
      if (!card) return false;
      if (
        card.classList.contains("vc-support-page-hero") ||
        card.classList.contains("vc-page-cine-hero") ||
        card.classList.contains("vc-home-cine-hero") ||
        card.classList.contains("vc-vote-page-hero") ||
        card.classList.contains("vc-support-intro-shell")
      ) {
        return false;
      }
      if (card.querySelector("ul, ol, .vc-tip-row")) return true;
    } catch (eTip) {}
    return false;
  }

  function promoteHeroKickers(scope) {
    try {
      var heroes = scope.querySelectorAll(
        ".vc-page-cine-hero, .vc-support-page-hero, .vc-home-cine-hero, .vc-vote-page-hero, .vc-support-intro-shell, #intro"
      );
      for (var h = 0; h < heroes.length; h += 1) {
        var hero = heroes[h];
        if (!hero) continue;
        var copy =
          hero.querySelector(".vc-page-cine-hero-copy") ||
          hero.querySelector(".vc-hero-head") ||
          hero.querySelector(".max-w-3xl") ||
          null;
        if (!copy) continue;
        var first = copy.querySelector(
          ":scope > p.vc-hero-kicker, :scope > p.vc-confessionale-kicker, :scope > p.text-xs.font-semibold.uppercase, :scope > p[class*='uppercase'][class*='tracking-']"
        );
        if (!first || isTipCardKicker(first)) continue;
        if (!first.classList.contains("vc-hero-kicker") && !first.classList.contains("vc-confessionale-kicker")) {
          first.classList.add("vc-hero-kicker");
        }
      }
    } catch (ePromo) {}
  }

  function collectKickers(root) {
    var scope = root || document;
    var list = [];
    var seen = typeof Set !== "undefined" ? new Set() : null;
    function push(el) {
      if (!el || (seen && seen.has(el))) return;
      if (isNoHackKicker(el) || isTipCardKicker(el)) return;
      if (seen) seen.add(el);
      list.push(el);
    }
    promoteHeroKickers(scope);
    try {
      var nodes = scope.querySelectorAll(KICKER_SEL);
      for (var i = 0; i < nodes.length; i += 1) {
        push(nodes[i]);
      }
    } catch (e) {}
    return list;
  }

  var moPaused = 0;
  function withMoPaused(fn) {
    moPaused += 1;
    try {
      fn();
    } finally {
      moPaused -= 1;
    }
  }

  function holdWelcomeHidden(el) {
    if (!el) return;
    /* kickerNoHang1: no-op se già in hold — evita MO ↔ hold loop */
    if (el.getAttribute("data-vc-welcome-hold") === "1" && !String(el.textContent || "").trim()) {
      return;
    }
    withMoPaused(function () {
      try {
        el.setAttribute("data-vc-welcome-hold", "1");
        el.classList.remove("is-hacking", "vc-kicker-hack");
        el.textContent = "";
        el.style.setProperty("opacity", "0", "important");
        el.style.setProperty("visibility", "hidden", "important");
      } catch (eHold) {}
    });
  }

  function revealWelcome(el, text) {
    if (!el) return;
    var t = String(text || "").replace(/\s+/g, " ").trim();
    if (!t) return;
    /* kickerNoHang1: già rivelato con stesso testo → stop (rompe freeze page) */
    if (
      el.getAttribute("data-vc-welcome-hold") !== "1" &&
      el.getAttribute("data-vc-hack-done") === "1" &&
      !el.classList.contains("is-hacking") &&
      String(el.textContent || "").replace(/\s+/g, " ").trim() === t
    ) {
      return;
    }
    withMoPaused(function () {
      try {
        el.removeAttribute("data-vc-welcome-hold");
        el.style.removeProperty("opacity");
        el.style.removeProperty("visibility");
      } catch (eRev) {}
      settleInstant(el, t);
    });
  }

  function waitForPronounThenPlay(el) {
    if (!el) return;
    if (el.getAttribute("data-vc-hack-waiting") === "1") return;
    el.setAttribute("data-vc-hack-waiting", "1");

    function go(forcedText) {
      el.removeAttribute("data-vc-hack-waiting");
      var txt = forcedText || resolveText(el) || "";
      if (!txt || looksLikeI18nKey(txt) || isInclusiveWelcome(txt)) {
        /* kickerNoHack1: niente Benvenut* fantasma — resta nascosto */
        holdWelcomeHidden(el);
        return;
      }
      revealWelcome(el, txt);
    }

    if (el.getAttribute("data-vc-welcome-pronoun-ready") === "1") {
      var readyTxt = resolveText(el);
      if (readyTxt && !isInclusiveWelcome(readyTxt)) {
        go(readyTxt);
        return;
      }
    }

    /* kickerNoHack1: non mostrare testo finché i pronomi non sono certi */
    holdWelcomeHidden(el);

    document.addEventListener("vc:welcome-pronoun-ready", function onReady(ev) {
      try {
        if (ev && ev.detail && ev.detail.el && ev.detail.el !== el) return;
      } catch (e) {}
      var key = "";
      var txt = "";
      try {
        key = String((ev && ev.detail && ev.detail.key) || "");
        txt = (ev && ev.detail && ev.detail.text) || "";
      } catch (eT) {}
      if (key !== "home.welcomeM" && key !== "home.welcomeF") return;
      go(txt || resolveText(el));
    });
  }

  function isNoHackKicker(el) {
    if (!el || !el.classList) return false;
    if (
      el.classList.contains("vc-home-deck__kicker") ||
      el.classList.contains("vc-home-index__kicker") ||
      el.classList.contains("vc-home-feature__kicker") ||
      el.classList.contains("vc-section-kicker")
    ) {
      return true;
    }
    try {
      if (el.closest(".vc-page-cine-aside-inline, .vc-home-deck, aside")) return true;
    } catch (eAside) {}
    return isTipCardKicker(el);
  }

  function settleNoHack(el) {
    if (!el) return;
    try {
      var finalTxt = el.getAttribute("data-vc-hack-final") || resolveText(el) || String(el.textContent || "").trim();
      if (finalTxt) el.textContent = finalTxt;
      el.classList.remove("is-hacking", "vc-kicker-hack");
      el.removeAttribute("data-vc-hack-pending");
      el.removeAttribute("data-vc-hack-waiting");
      el.setAttribute("data-vc-hack-done", "1");
      el.setAttribute("data-vc-hack-seen", "1");
      if (running && running.has(el)) {
        var st = running.get(el);
        if (st && st.raf) cancelAnimationFrame(st.raf);
        running.delete(el);
      }
    } catch (eSettle) {}
  }

  function bootOne(el, opts) {
    if (!el) return;
    if (isNoHackKicker(el)) {
      settleNoHack(el);
      return;
    }
    opts = opts || {};
    var force = opts.force === true;
    /* kickerNoHang1: welcome home → hold finché M/F certi (guest = inclusivo ok) */
    if (isHomeWelcome(el)) {
      /* già settled → mai ritoccare DOM (rompe freeze / Caricamento infinito) */
      if (
        el.getAttribute("data-vc-hack-done") === "1" &&
        el.getAttribute("data-vc-welcome-hold") !== "1" &&
        String(el.textContent || "").trim() &&
        !el.classList.contains("is-hacking")
      ) {
        return;
      }
      if (el.getAttribute("data-vc-hack-waiting") === "1" && el.getAttribute("data-vc-welcome-hold") === "1") {
        return;
      }
      if (el.getAttribute("data-vc-welcome-pronoun-ready") === "1") {
        var ready = resolveText(el) || el.getAttribute("data-vc-hack-final") || "";
        var key = String(el.getAttribute("data-vc-welcome-pronoun") || el.getAttribute("data-i18n") || "");
        if (ready && (key === "home.welcomeM" || key === "home.welcomeF") && !isInclusiveWelcome(ready)) {
          revealWelcome(el, ready);
          return;
        }
        /* guest / inclusive locked */
        if (ready && key === "home.welcome" && el.getAttribute("data-vc-welcome-guest") === "1") {
          revealWelcome(el, ready);
          return;
        }
      }
      var hasTok = false;
      try {
        hasTok = !!(
          (window.VcDiscordAuth && typeof window.VcDiscordAuth.getAccessToken === "function" && window.VcDiscordAuth.getAccessToken()) ||
          localStorage.getItem("vc_discord_access_token") ||
          localStorage.getItem("discord_access_token")
        );
      } catch (eTok) {}
      if (!hasTok) {
        var guestTxt = resolveText(el) || String(el.getAttribute("data-i18n-src") || el.textContent || "").trim() || "Benvenut* su";
        try {
          el.setAttribute("data-vc-welcome-guest", "1");
          el.setAttribute("data-vc-welcome-pronoun-ready", "1");
          el.setAttribute("data-vc-welcome-pronoun", "home.welcome");
        } catch (eG) {}
        revealWelcome(el, guestTxt);
        return;
      }
      waitForPronounThenPlay(el);
      return;
    }
    if (el.classList.contains("is-hacking") && !force) return;
    if (el.classList.contains("is-hacking") && running && running.get(el)) return;
    if (!force && el.getAttribute("data-vc-hack-played-visible") === "1") return;
    var initial = resolveText(el);
    if (!el.getAttribute("data-vc-hack-bound")) {
      el.setAttribute("data-vc-hack-bound", "1");
      if (initial && !(isHomeWelcome(el) && isInclusiveWelcome(initial))) {
        rememberFinal(el, initial);
      }
    } else if (!el.getAttribute("data-vc-hack-final") && initial) {
      if (!(isHomeWelcome(el) && isInclusiveWelcome(initial))) {
        rememberFinal(el, initial);
      }
    }

    /* pronoun ready: aggiorna testo senza scramble */
    if (
      el.getAttribute("data-vc-welcome-pronoun-ready") === "1" &&
      (force || el.getAttribute("data-vc-hack-pending") === "1" || el.getAttribute("data-vc-hack-settled-pre") === "1")
    ) {
      var pendingTxt = resolveText(el) || el.getAttribute("data-vc-hack-final") || "";
      if (pendingTxt) {
        settleInstant(el, pendingTxt);
        return;
      }
    }

    if (
      !force &&
      el.getAttribute("data-vc-hack-seen") === "1" &&
      el.getAttribute("data-vc-hack-done") === "1" &&
      !el.classList.contains("is-hacking")
    ) {
      return;
    }

    /* textSettlePre1: settle immediato (anche se non ancora “visibile” / curtain su) */
    var txt = resolveText(el) || initial || String(el.textContent || "").trim();
    if (txt && !looksLikeI18nKey(txt)) {
      settleInstant(el, txt);
      return;
    }
    if (el.getAttribute("data-i18n")) {
      el.setAttribute("data-vc-hack-pending", "1");
      scheduleRevealReplay();
      observeEl(el);
      return;
    }
    settleInstant(el, txt);
  }

  function bootAll(root, opts) {
    try {
      var noHack = (root && root.querySelectorAll ? root : document).querySelectorAll(NO_HACK_SEL);
      for (var n = 0; n < noHack.length; n += 1) settleNoHack(noHack[n]);
    } catch (eNo) {}
    var kickers = collectKickers(root);
    /* violPass4: uno/due kickers per tick — evita getComputedStyle×N in un solo setTimeout */
    var ki = 0;
    function bootSlice() {
      var budget = 2;
      while (ki < kickers.length && budget > 0) {
        var el = kickers[ki++];
        budget -= 1;
        try {
          bootOne(el, opts);
          observeEl(el);
        } catch (eB) {}
      }
      if (ki < kickers.length) window.setTimeout(bootSlice, 40);
    }
    bootSlice();
  }

  function replayPending() {
    var kickers = collectKickers();
    for (var i = 0; i < kickers.length; i += 1) {
      var el = kickers[i];
      if (el.classList.contains("is-hacking")) continue;
      if (el.getAttribute("data-vc-hack-played-visible") === "1" && el.getAttribute("data-vc-hack-pending") !== "1")
        continue;
      var txt = resolveText(el) || el.getAttribute("data-vc-hack-final") || String(el.textContent || "").trim();
      if (txt && !looksLikeI18nKey(txt)) settleInstant(el, txt);
      else observeEl(el);
    }
  }

  var revealTimer = 0;
  function scheduleRevealReplay() {
    window.clearTimeout(revealTimer);
    /* textSettlePre1: non aspettare curtain — settle subito */
    revealTimer = window.setTimeout(replayPending, 16);
  }

  function onLangChange() {
    var kickers = collectKickers();
    var i = 0;
    function slice() {
      if (i >= kickers.length) return;
      var el = kickers[i++];
      try {
        el.removeAttribute("data-vc-hack-seen");
        el.removeAttribute("data-vc-hack-done");
        el.removeAttribute("data-vc-hack-played-visible");
        el.removeAttribute("data-vc-hack-settled-pre");
        rememberFinal(el, resolveText(el) || el.textContent);
        play(el, { force: true, scramble: false, delayMs: 0 });
      } catch (eLc) {}
      if (i < kickers.length) window.setTimeout(slice, 48);
    }
    slice();
  }

  function observeEl(el) {
    if (!el || !io) return;
    try {
      io.observe(el);
    } catch (e) {}
  }

  function bindRevealWatch() {
    if (revealWatchBound) return;
    revealWatchBound = true;
    function onReveal() {
      /* textSettlePre1: NO reset/scramble su reveal — solo settle pending residui */
      try {
        replayPending();
      } catch (eRep) {}
    }
    document.addEventListener("vc:page-cine-ready", onReveal);
    window.addEventListener("vc-page-cine-ready", onReveal);
    /* welcome pronoun: gestito dal listener dedicato in boot() — niente reset doppio */
    try {
      var mo = new MutationObserver(function (muts) {
        if (moPaused > 0) return;
        var needReplay = false;
        for (var i = 0; i < muts.length; i += 1) {
          var m = muts[i];
          /* kickerNoHang1: ignora mutazioni welcome (style/hold/text) — le gestiamo noi */
          if (
            m.target &&
            m.target.classList &&
            m.target.classList.contains("vc-hero-kicker") &&
            isHomeWelcome(m.target)
          ) {
            continue;
          }
          if (m.type === "attributes" && m.attributeName === "class" && m.target === document.documentElement) {
            /* solo passaggio a ready — non ogni class thrash (auth/perf/fx) */
            var prev = String(m.oldValue || "");
            var wasReady =
              prev.indexOf("vc-page-cine-ready") !== -1 ||
              prev.indexOf("vc-cine-curtain-off") !== -1 ||
              (prev.indexOf("vc-page-cine-boot") === -1 && prev.indexOf("vc-styles-ready") !== -1);
            if (!wasReady && pageRevealReady()) needReplay = true;
            continue;
          }
          if (m.type === "attributes" && m.attributeName === "class" && m.target && m.target.classList) {
            if (
              (m.target.classList.contains("vc-hero-kicker") ||
                m.target.classList.contains("vc-text-hack")) &&
              !m.target.classList.contains("is-hacking")
            ) {
              bootOne(m.target, { force: false });
            }
            /* gate dismissed → replay pending card kickers */
            if (
              String(m.target.className || "").indexOf("gate") !== -1 ||
              (m.target.id && String(m.target.id).indexOf("gate") !== -1)
            ) {
              needReplay = true;
            }
          }
          if (m.addedNodes && m.addedNodes.length) {
            for (var n = 0; n < m.addedNodes.length; n += 1) {
              var node = m.addedNodes[n];
              if (!node || node.nodeType !== 1) continue;
              if (node.matches && node.matches(KICKER_SEL)) {
                bootOne(node, { force: false });
              }
              try {
                var nested = node.querySelectorAll && node.querySelectorAll(KICKER_SEL);
                if (nested) for (var j = 0; j < nested.length; j += 1) bootOne(nested[j], { force: false });
              } catch (eN) {}
            }
          }
        }
        if (needReplay) scheduleRevealReplay();
      });
      mo.observe(document.documentElement, {
        attributes: true,
        attributeOldValue: true,
        attributeFilter: ["class", "hidden", "style"],
        childList: true,
        subtree: true,
      });
    } catch (eMo) {}
    try {
      io = new IntersectionObserver(
        function (entries) {
          for (var i = 0; i < entries.length; i += 1) {
            var en = entries[i];
            if (!en.isIntersecting || !en.target) continue;
            var el = en.target;
            if (el.getAttribute("data-vc-hack-seen") === "1" && el.getAttribute("data-vc-hack-pending") !== "1") continue;
            if (el.classList.contains("is-hacking")) continue;
            if (viewportBlockedByGate(el)) {
              el.setAttribute("data-vc-hack-pending", "1");
              continue;
            }
            el.removeAttribute("data-vc-hack-done");
            bootOne(el, { force: true });
          }
        },
        { threshold: 0.15, rootMargin: "40px 0px" }
      );
    } catch (eIo) {
      io = null;
    }
  }

  function boot() {
    bindRevealWatch();
    /* violPass7/12: bootAll e reveal in tick separati (era ~180-320ms Violation) */
    window.setTimeout(function () {
      if (booted) {
        bootAll(null, { force: false });
      } else {
        booted = true;
        bootAll();
      }
      window.setTimeout(scheduleRevealReplay, 0);
    }, 0);
    if (boot.__vcLangWired) return;
    boot.__vcLangWired = true;
    document.addEventListener("vc:langchange", function () {
      window.setTimeout(onLangChange, 40);
    });
    document.addEventListener("vc:welcome-pronoun-ready", function (ev) {
      /* violPass12: play/stop fuori dal handler sync (era ~176ms Violation) */
      var detail = ev && ev.detail ? ev.detail : null;
      window.setTimeout(function () {
        var el = null;
        var txt = "";
        try {
          el = (detail && detail.el) || document.querySelector('.vc-hero-kicker[data-i18n^="home.welcome"]');
          txt = (detail && detail.text) || "";
        } catch (e) {}
        if (!el) return;
        el.removeAttribute("data-vc-hack-seen");
        el.removeAttribute("data-vc-hack-done");
        el.removeAttribute("data-vc-hack-waiting");
        el.setAttribute("data-vc-welcome-pronoun-ready", "1");
        if (txt) {
          el.setAttribute("data-vc-hack-final", String(txt).replace(/\s+/g, " ").trim());
          rememberFinal(el, txt);
        }
        try {
          stop(el);
        } catch (eStop) {}
        if (bootCurtainBlocking()) {
          el.setAttribute("data-vc-hack-pending", "1");
          scheduleRevealReplay();
          return;
        }
        if (el.getAttribute("data-vc-hack-played-visible") === "1" && !el.classList.contains("is-hacking")) {
          var finalTxt = txt || rememberFinal(el, resolveText(el) || el.textContent);
          if (finalTxt) {
            el.textContent = finalTxt;
            el.setAttribute("data-vc-hack-final", finalTxt);
            el.setAttribute("data-vc-hack-done", "1");
            el.setAttribute("data-vc-hack-seen", "1");
          }
          return;
        }
        play(el, { text: txt || rememberFinal(el, resolveText(el) || el.textContent), force: true, delayMs: 0 });
      }, 0);
    });
  }

  window.VcKickerHack = {
    ver: STAMP,
    play: play,
    boot: boot,
    bootAll: function (root) {
      bootAll(root, { force: true });
    },
    rememberFinal: rememberFinal,
    holdWelcomeHidden: holdWelcomeHidden,
    revealWelcome: revealWelcome,
    replayPending: replayPending,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      window.setTimeout(boot, 200);
    });
  } else {
    window.setTimeout(boot, 200);
  }
  /* violPass4: un solo boot lento + replay più tardi */
  /* violPass7: ancora più tardi */
  window.setTimeout(boot, 1600);
  window.setTimeout(scheduleRevealReplay, 2800);
})();
/* welcomePronouns9 */
/* violPass3 */
/* violPass4 */
/* violPass5 */
/* violPass6 */
/* violPass7 */
/* violPass12 */
