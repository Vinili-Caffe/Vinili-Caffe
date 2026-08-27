(function () {
  "use strict";

  var STORAGE_KEY = "vc_type_sfx";
  var VOL_KEY = "vc_type_sfx_vol";
  var MAX_RATE_MS = 22;
  var BASE_PEAK = 0.85;
  var lastPlayAt = 0;
  var ctx = null;
  var unlocked = false;
  var masterGain = null;
  var clickBufs = null;
  var resumeWait = null;
  var userVol = 0.7;
  var lastAudibleVol = 0.7;
  var mutedByUser = false;
  var wrap = null;
  var btn = null;
  var rangeEl = null;
  var volumeUiBound = false;

  function isIt() {
    try {
      return String(document.documentElement.lang || "it")
        .toLowerCase()
        .indexOf("en") !== 0;
    } catch (e) {
      return true;
    }
  }

  function clamp01(n) {
    return Math.min(1, Math.max(0, Number(n) || 0));
  }

  function readPrefs() {
    try {
      var rawVol = localStorage.getItem(VOL_KEY);
      if (rawVol != null && String(rawVol).trim() !== "") {
        var n = Number(rawVol);
        if (Number.isFinite(n)) userVol = clamp01(n > 1 ? n / 100 : n);
      }
      var en = String(localStorage.getItem(STORAGE_KEY) || "").trim();
      if (en === "0" || en === "off" || en === "false") mutedByUser = true;
      else if (en === "1" || en === "on" || en === "true") mutedByUser = false;
      else mutedByUser = userVol <= 0.001;
    } catch (e) {}
    if (userVol > 0.001) lastAudibleVol = userVol;
    else if (lastAudibleVol <= 0.001) lastAudibleVol = 0.7;
  }

  function persistPrefs() {
    try {
      localStorage.setItem(VOL_KEY, String(Math.round(userVol * 100) / 100));
      localStorage.setItem(STORAGE_KEY, mutedByUser || userVol <= 0.001 ? "0" : "1");
    } catch (e) {}
  }

  function effectiveVol() {
    if (mutedByUser) return 0;
    return clamp01(userVol);
  }

  function ensureCtx() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC({ latencyHint: "interactive" });
    } catch (e0) {
      try {
        ctx = new AC();
      } catch (e1) {
        return null;
      }
    }
    return ctx;
  }

  function ensureMaster(c) {
    if (masterGain && masterGain.context === c) return masterGain;
    masterGain = c.createGain();
    masterGain.gain.value = 1;
    masterGain.connect(c.destination);
    return masterGain;
  }

  function buildClickBuffer(c, seed) {
    var sr = c.sampleRate || 44100;
    var len = Math.max(64, Math.floor(sr * 0.045));
    var buf = c.createBuffer(1, len, sr);
    var d = buf.getChannelData(0);
    var base = 920 + (seed % 5) * 85;
    for (var i = 0; i < len; i++) {
      var t = i / sr;
      var env = Math.exp(-t * 70);
      var click = Math.sin(2 * Math.PI * base * t);
      var noise = ((seed * 1103515245 + i * 12345) & 0xffff) / 0xffff - 0.5;
      d[i] = (click * 0.82 + noise * 0.42) * env;
    }
    return buf;
  }

  function ensureClickBuffers(c) {
    if (clickBufs && clickBufs.length) return clickBufs;
    clickBufs = [];
    for (var i = 0; i < 5; i++) clickBufs.push(buildClickBuffer(c, i + 3));
    return clickBufs;
  }

  function warmPipeline(c) {
    try {
      ensureMaster(c);
      ensureClickBuffers(c);
      var silent = c.createBuffer(1, 1, c.sampleRate || 44100);
      var src = c.createBufferSource();
      src.buffer = silent;
      src.connect(ensureMaster(c));
      src.start(0);
    } catch (eW) {}
  }

  function unlock() {
    unlocked = true;
    var c = ensureCtx();
    if (!c) return Promise.resolve(null);
    if (c.state === "suspended") {
      if (!resumeWait) {
        resumeWait = c
          .resume()
          .then(function () {
            resumeWait = null;
            warmPipeline(c);
            return c;
          })
          .catch(function () {
            resumeWait = null;
            return c;
          });
      }
      return resumeWait;
    }
    warmPipeline(c);
    return Promise.resolve(c);
  }

  function emitTick(c, vol) {
    try {
      var bufs = ensureClickBuffers(c);
      var master = ensureMaster(c);
      var src = c.createBufferSource();
      src.buffer = bufs[(Math.random() * bufs.length) | 0];
      var g = c.createGain();
      g.gain.value = Math.max(0.001, BASE_PEAK * vol);
      src.connect(g);
      g.connect(master);
      // start(0) = subito nella coda audio (meno latenza di currentTime + ramp)
      src.start(0);
    } catch (ePlay) {}
  }

  function playTick() {
    var vol = effectiveVol();
    if (vol <= 0.001) return;
    var now = performance && performance.now ? performance.now() : Date.now();
    if (now - lastPlayAt < MAX_RATE_MS) return;
    var c = ensureCtx();
    if (!c) return;
    unlocked = true;
    lastPlayAt = now;

    function fire() {
      if (effectiveVol() <= 0.001) return;
      emitTick(c, vol);
    }

    // resume() nel gesto (keydown); poi play. Non fare unlock().then() a catena.
    if (c.state === "suspended") {
      try {
        var p = c.resume();
        if (p && typeof p.then === "function") {
          p.then(function () {
            fire();
            warmPipeline(c);
          }).catch(function () {});
        } else {
          fire();
        }
      } catch (eSus) {
        unlock().then(function (ready) {
          if (ready) emitTick(ready, vol);
        });
      }
      return;
    }
    fire();
  }

  function shouldSkipSoftKeyboardNoise(ev) {
    // Solo telefoni reali (hover none + coarse). Laptop touch/desktop devono suonare.
    if (!isTouchUi()) return false;
    try {
      if (ev && String(ev.key || "").length === 1) return false;
    } catch (eK) {}
    return true;
  }

  function onTypingSound(ev) {
    if (effectiveVol() <= 0.001) return;
    var target = (ev && (ev.target || ev.srcElement)) || null;
    if (!isTypingTarget(target)) return;
    setShellVisible(true);
    if (shouldSkipSoftKeyboardNoise(ev)) return;
    playTick();
  }

  function isTypingTarget(el) {
    if (!el || el.nodeType !== 1) return false;
    var tag = String(el.tagName || "").toLowerCase();
    if (tag === "textarea") return true;
    if (tag === "input") {
      var type = String(el.getAttribute("type") || "text").toLowerCase();
      if (
        type === "button" ||
        type === "submit" ||
        type === "reset" ||
        type === "checkbox" ||
        type === "radio" ||
        type === "file" ||
        type === "range" ||
        type === "color" ||
        type === "hidden"
      ) {
        return false;
      }
      return true;
    }
    if (el.isContentEditable) return true;
    try {
      if (el.closest && el.closest('[contenteditable=""], [contenteditable="true"]')) return true;
    } catch (e) {}
    return false;
  }

  function isVisibleField(el) {
    if (!el || el.nodeType !== 1) return false;
    try {
      if (el.disabled) return false;
      if (el.getAttribute && el.getAttribute("aria-hidden") === "true") return false;
      if (el.closest && el.closest("[hidden], [aria-hidden='true'], template")) return false;
      var st = window.getComputedStyle(el);
      if (!st || st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0) return false;
      var r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    } catch (e) {
      return true;
    }
  }

  function pageHasTypingTargets() {
    try {
      var nodes = document.querySelectorAll(
        'textarea, input, [contenteditable=""], [contenteditable="true"]',
      );
      for (var i = 0; i < nodes.length; i++) {
        if (isTypingTarget(nodes[i]) && isVisibleField(nodes[i])) return true;
      }
    } catch (e) {}
    return false;
  }

  function isTouchUi() {
    try {
      // Solo touch-primary (telefono): evita falsi positivi su laptop Windows touch.
      return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    } catch (e0) {
      return false;
    }
  }

  function setShellVisible(show) {
    if (show) {
      ensureShell();
      if (wrap) {
        wrap.hidden = false;
        wrap.removeAttribute("hidden");
      }
      return;
    }
    if (wrap) {
      wrap.hidden = true;
      wrap.setAttribute("hidden", "");
    }
  }

  function refreshShellVisibility() {
    var active = null;
    try {
      active = document.activeElement;
    } catch (eA) {}
    var show =
      pageHasTypingTargets() || (active && isTypingTarget(active) && isVisibleField(active));
    setShellVisible(show);
  }

  function isPrintableKey(ev) {
    if (!ev) return false;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return false;
    var key = String(ev.key || "");
    if (key === "Unidentified") return false;
    if (key.length === 1) return true;
    if (key === "Enter" || key === "Backspace" || key === "Delete" || key === "Space" || key === " ") return true;
    return false;
  }

  function syncUi() {
    if (!btn) return;
    var on = effectiveVol() > 0.001;
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.setAttribute(
      "aria-label",
      on
        ? isIt()
          ? "Volume suono tastiera"
          : "Typing sound volume"
        : isIt()
          ? "Suono tastiera disattivato — alza lo slider"
          : "Typing sound off — raise the slider",
    );
    btn.title = btn.getAttribute("aria-label");
    btn.classList.toggle("is-muted", !on);
    if (wrap) wrap.classList.toggle("is-muted", !on);
    var icon = btn.querySelector(".fa");
    // Icona fissa: niente swap keyboard ↔ volume-off.
    if (icon) icon.className = "fa fa-keyboard-o";
    if (rangeEl) {
      // Come la musica: lo slider riflette userVol anche se muto (non forzare 0).
      rangeEl.value = String(Math.round(clamp01(userVol) * 100));
    }
  }

  function setVolumeFromUi(pct) {
    pct = Math.min(100, Math.max(0, Number(pct) || 0));
    userVol = pct / 100;
    if (userVol > 0.001) {
      lastAudibleVol = userVol;
      mutedByUser = false;
    } else {
      mutedByUser = true;
    }
    persistPrefs();
    syncUi();
    if (effectiveVol() > 0.001) {
      unlock();
      playTick();
    }
  }

  function bindVolumeUi() {
    if (volumeUiBound || !rangeEl) return;
    volumeUiBound = true;
    function onVolInput() {
      setVolumeFromUi(rangeEl.value);
    }
    rangeEl.addEventListener("input", onVolInput);
    rangeEl.addEventListener("change", onVolInput);
    rangeEl.addEventListener("pointerdown", function (ev) {
      try {
        ev.stopPropagation();
      } catch (eS) {}
    });
    rangeEl.addEventListener(
      "touchstart",
      function (ev) {
        try {
          ev.stopPropagation();
        } catch (eT) {}
      },
      { passive: true },
    );
  }

  function ensureShell() {
    if (wrap && wrap.isConnected) return wrap;
    wrap = document.getElementById("vc-type-sfx-player");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "vc-type-sfx-player";
      wrap.className = "vc-bgm-player vc-type-sfx-player";
      wrap.hidden = true;
      wrap.setAttribute("hidden", "");
      wrap.innerHTML =
        '<button type="button" class="vc-bgm-player__toggle vc-type-sfx-toggle" id="vc-type-sfx-toggle" aria-pressed="true">' +
        '<i class="fa fa-keyboard-o" aria-hidden="true"></i>' +
        "</button>" +
        '<div class="vc-bgm-player__meta">' +
        '<span class="vc-bgm-player__label">' +
        (isIt() ? "Suono tastiera" : "Typing sound") +
        "</span>" +
        '<div class="vc-bgm-player__slider-row">' +
        '<i class="fa fa-volume-down" aria-hidden="true"></i>' +
        '<input type="range" id="vc-type-sfx-vol" class="vc-bgm-player__range" min="0" max="100" step="1" />' +
        '<i class="fa fa-volume-up" aria-hidden="true"></i>' +
        "</div>" +
        "</div>";
      (document.body || document.documentElement).appendChild(wrap);
    }
    btn = document.getElementById("vc-type-sfx-toggle") || wrap.querySelector(".vc-type-sfx-toggle");
    rangeEl = document.getElementById("vc-type-sfx-vol") || wrap.querySelector(".vc-bgm-player__range");
    if (rangeEl) {
      rangeEl.setAttribute("aria-label", isIt() ? "Volume suono tastiera" : "Typing sound volume");
    }
    if (btn && !btn.__vcTypeSfxBound) {
      btn.__vcTypeSfxBound = true;
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        try {
          var c = ensureCtx();
          if (c && c.state === "suspended") c.resume();
        } catch (eC) {}
        unlocked = true;
        if (effectiveVol() > 0.001) playTick();
      });
    }
    bindVolumeUi();
    syncUi();
    try {
      if (window.__VC_CHROME_SYNC) window.__VC_CHROME_SYNC.bindExpandablePlayer(wrap, btn);
    } catch (eEx) {}
    return wrap;
  }

  function init() {
    if (window.__VC_TYPE_SFX_INIT) return;
    window.__VC_TYPE_SFX_INIT = true;
    if (document.documentElement.classList.contains("vc-type-sfx-off")) return;
    readPrefs();
    refreshShellVisibility();

    document.addEventListener(
      "keydown",
      function (ev) {
        if (!isPrintableKey(ev)) return;
        onTypingSound(ev);
      },
      true,
    );

    // Niente beforeinput/input su desktop: keydown è sufficiente e più affidabile per l’audio.
    // Su soft-keyboard mobile non suoniamo (rumore).

    document.addEventListener(
      "focusin",
      function (ev) {
        if (!isTypingTarget(ev.target) || !isVisibleField(ev.target)) return;
        setShellVisible(true);
        // Sblocca AudioContext al focus campo (gesto utente tipico).
        try {
          var c = ensureCtx();
          if (c && c.state === "suspended") c.resume();
        } catch (eF) {}
        unlocked = true;
      },
      true,
    );

    document.addEventListener(
      "focusout",
      function () {
        window.setTimeout(refreshShellVisibility, 80);
      },
      true,
    );

    document.addEventListener(
      "pointerdown",
      function (ev) {
        try {
          var c = ensureCtx();
          if (c && c.state === "suspended") c.resume();
        } catch (eP0) {}
        unlocked = true;
        try {
          if (ev && ev.target && isTypingTarget(ev.target)) setShellVisible(true);
        } catch (eP) {}
      },
      true,
    );

    var refreshTimer = 0;
    function scheduleRefresh() {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(function () {
        refreshTimer = 0;
        refreshShellVisibility();
      }, 120);
    }

    try {
      if (typeof MutationObserver !== "undefined") {
        var mo = new MutationObserver(scheduleRefresh);
        mo.observe(document.documentElement, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["hidden", "class", "style", "contenteditable", "type"],
        });
      }
    } catch (eMo) {}

    window.addEventListener("resize", scheduleRefresh);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
