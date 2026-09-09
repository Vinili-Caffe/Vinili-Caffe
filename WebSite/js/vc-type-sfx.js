(function () {
  "use strict";

  function shouldSkipTypeSfx() {
    try {
      if (document.body && document.body.classList.contains("vc-dashboard-page")) return true;
      if (document.documentElement.classList.contains("vc-perf-lite")) return true;
      if (window.VcPerf && typeof window.VcPerf.isLite === "function" && window.VcPerf.isLite()) return true;
    } catch (eSkip) {}
    return false;
  }
  if (shouldSkipTypeSfx()) return;

  var STORAGE_KEY = "vc_type_sfx";
  var CRITICAL_CSS_ID = "vc-type-sfx-critical-box1";
  /* typeSfxMatchMusic1: stesso chrome del player musica (FA + slider oro) */
  var ICON_KEYBOARD = '<i class="fa fa-keyboard-o" aria-hidden="true"></i>';
  var ICON_VOL_LO = '<i class="fa fa-volume-down" aria-hidden="true"></i>';
  var ICON_VOL_HI = '<i class="fa fa-volume-up" aria-hidden="true"></i>';
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
      var sync = window.__VC_CHROME_SYNC && window.__VC_CHROME_SYNC.get();
      if (sync && sync.typeSfx && typeof sync.typeSfx === "object") {
        if (Number.isFinite(Number(sync.typeSfx.volume))) {
          userVol = clamp01(Number(sync.typeSfx.volume));
        }
        if (typeof sync.typeSfx.enabled === "boolean") {
          mutedByUser = !sync.typeSfx.enabled;
        }
      }
    } catch (eSy) {}
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
    try {
      if (window.__VC_CHROME_SYNC) {
        window.__VC_CHROME_SYNC.publish({
          typeSfx: {
            enabled: !mutedByUser && userVol > 0.001,
            volume: userVol,
          },
        });
      }
    } catch (ePub) {}
  }

  function applyRemoteTypeSfx(prefs) {
    if (!prefs || !prefs.typeSfx || typeof prefs.typeSfx !== "object") return;
    var changed = false;
    if (Number.isFinite(Number(prefs.typeSfx.volume))) {
      userVol = clamp01(Number(prefs.typeSfx.volume));
      changed = true;
    }
    if (typeof prefs.typeSfx.enabled === "boolean") {
      mutedByUser = !prefs.typeSfx.enabled;
      changed = true;
    }
    if (!changed) return;
    if (userVol > 0.001) lastAudibleVol = userVol;
    try {
      localStorage.setItem(VOL_KEY, String(Math.round(userVol * 100) / 100));
      localStorage.setItem(STORAGE_KEY, mutedByUser || userVol <= 0.001 ? "0" : "1");
    } catch (eLs) {}
    syncUi();
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
            return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    } catch (e0) {
      return false;
    }
  }

  function injectCriticalShellCss() {
    try {
      var stale = document.getElementById("vc-type-sfx-critical");
      if (stale) stale.remove();
    } catch (eSt) {}
    try {
      var staleMusic = document.getElementById("vc-type-sfx-critical-music1");
      if (staleMusic) staleMusic.remove();
    } catch (eSt2) {}
    if (document.getElementById(CRITICAL_CSS_ID)) return;
    /* typeSfxMatchMusic1: identico al chip musica — niente grid/vertical custom. */
    var style = document.createElement("style");
    style.id = CRITICAL_CSS_ID;
    style.textContent =
      "#vc-type-sfx-player.vc-type-sfx-player,.vc-type-sfx-player.vc-bgm-player{position:fixed;right:max(.85rem,env(safe-area-inset-right,0px));bottom:max(.95rem,env(safe-area-inset-bottom,0px));z-index:10110;display:inline-flex!important;flex-direction:row;align-items:center;gap:0;padding:0;border:none;border-radius:0;background:transparent;color:#f7ecdf;box-shadow:none;backdrop-filter:none;-webkit-backdrop-filter:none;max-width:min(18.5rem,calc(100vw - 1.5rem))}" +
      ".vc-type-sfx-player .vc-bgm-player__toggle{flex:0 0 auto;width:3.35rem;height:3.35rem;border-radius:9999px;display:inline-flex;align-items:center;justify-content:center;padding:0;border:1px solid rgba(212,168,120,.48);background:rgba(20,12,8,.92);color:#f7ecdf;cursor:var(--vc-cursor-pointer);box-shadow:0 8px 24px rgba(0,0,0,.42)}" +
      ".vc-type-sfx-player .vc-bgm-player__toggle .fa{width:1.2rem;height:1.2rem;font-size:1.2rem;line-height:1;display:block}" +
      ".vc-type-sfx-player .vc-bgm-player__meta{flex:1 1 auto;min-width:0;max-width:0;opacity:0;overflow:hidden;display:flex;flex-direction:column;gap:.42rem;pointer-events:none}" +
      ".vc-type-sfx-player.vc-bgm-player:hover,.vc-type-sfx-player.vc-bgm-player:focus-within,.vc-type-sfx-player.vc-bgm-player.is-open,#vc-type-sfx-player.vc-bgm-player:hover,#vc-type-sfx-player.vc-bgm-player:focus-within,#vc-type-sfx-player.vc-bgm-player.is-open{gap:.65rem!important;padding:.45rem .7rem .45rem .45rem!important;border-radius:1.15rem!important;border:1px solid rgba(212,168,120,.5)!important;background:linear-gradient(155deg,rgba(42,26,16,.96),rgba(16,10,8,.94))!important;background-color:rgba(24,15,10,.96)!important;box-shadow:0 14px 42px rgba(0,0,0,.55)!important}" +
      ".vc-type-sfx-player.vc-bgm-player:hover .vc-bgm-player__meta,.vc-type-sfx-player.vc-bgm-player:focus-within .vc-bgm-player__meta,.vc-type-sfx-player.vc-bgm-player.is-open .vc-bgm-player__meta,#vc-type-sfx-player.vc-bgm-player:hover .vc-bgm-player__meta,#vc-type-sfx-player.vc-bgm-player:focus-within .vc-bgm-player__meta,#vc-type-sfx-player.vc-bgm-player.is-open .vc-bgm-player__meta{max-width:min(17.5rem,calc(100vw - 5.5rem));min-width:11.5rem;opacity:1;overflow:visible;pointer-events:auto}" +
      ".vc-type-sfx-player .vc-bgm-player__label{font-size:.72rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:rgba(247,236,223,.92)}" +
      ".vc-type-sfx-player .vc-bgm-player__slider-row{display:flex;align-items:center;gap:.45rem;width:100%;min-width:0}" +
      ".vc-type-sfx-player .vc-bgm-player__slider-row>.fa{font-size:.78rem;opacity:.78;flex:0 0 auto;color:rgba(232,201,168,.88)}" +
      ".vc-type-sfx-player .vc-bgm-player__range{-webkit-appearance:none;appearance:none;flex:1 1 auto;min-width:0;width:100%;height:1.35rem;margin:0;background:transparent;cursor:var(--vc-cursor-pointer)}" +
      ".vc-type-sfx-player .vc-bgm-player__range::-webkit-slider-runnable-track{height:.28rem;border-radius:999px;background:rgba(247,236,223,.22)}" +
      ".vc-type-sfx-player .vc-bgm-player__range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:1rem;height:1rem;margin-top:-.34rem;border-radius:50%;border:1px solid rgba(20,10,6,.55);background:linear-gradient(160deg,#f0d7b0,#d4a878);box-shadow:0 2px 8px rgba(0,0,0,.35)}" +
      ".vc-type-sfx-player .vc-bgm-player__range::-moz-range-track{height:.28rem;border-radius:999px;background:rgba(247,236,223,.22);border:none}" +
      ".vc-type-sfx-player .vc-bgm-player__range::-moz-range-thumb{width:1rem;height:1rem;border-radius:50%;border:1px solid rgba(20,10,6,.55);background:linear-gradient(160deg,#f0d7b0,#d4a878);box-shadow:0 2px 8px rgba(0,0,0,.35)}" +
      ".vc-type-sfx-player[hidden],html.vc-type-sfx-off .vc-type-sfx-player{display:none!important}";
    (document.head || document.documentElement).appendChild(style);
  }

  function setShellVisible(show) {
    if (show) {
      injectCriticalShellCss();
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
          ? "Suono tastiera"
          : "Typing sound"
        : isIt()
          ? "Suono tastiera spento"
          : "Typing sound off",
    );
    /* typeSfxTipFix1: no native title — overlaps the open panel and looks truncated */
    try {
      btn.removeAttribute("title");
    } catch (eT) {
      btn.title = "";
    }
    btn.classList.toggle("is-muted", !on);
    if (wrap) wrap.classList.toggle("is-muted", !on);
    if (rangeEl) {
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
    if (wrap && wrap.isConnected && wrap.querySelector(".fa-volume-down")) return wrap;
    wrap = document.getElementById("vc-type-sfx-player");
    if (wrap && !wrap.querySelector(".fa-volume-down")) {
      try {
        wrap.remove();
      } catch (eRm) {}
      wrap = null;
      volumeUiBound = false;
    }
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "vc-type-sfx-player";
      wrap.className = "vc-bgm-player vc-type-sfx-player";
      wrap.hidden = true;
      wrap.setAttribute("hidden", "");
      wrap.innerHTML =
        '<button type="button" class="vc-bgm-player__toggle vc-type-sfx-toggle" id="vc-type-sfx-toggle" aria-pressed="true">' +
        ICON_KEYBOARD +
        "</button>" +
        '<div class="vc-bgm-player__meta">' +
        '<span class="vc-bgm-player__label">' +
        (isIt() ? "Suono tastiera" : "Typing sound") +
        "</span>" +
        '<div class="vc-bgm-player__slider-row">' +
        ICON_VOL_LO +
        '<input type="range" id="vc-type-sfx-vol" class="vc-bgm-player__range" min="0" max="100" step="1" />' +
        ICON_VOL_HI +
        "</div>" +
        "</div>";
      (document.body || document.documentElement).appendChild(wrap);
    }
    btn = document.getElementById("vc-type-sfx-toggle") || wrap.querySelector(".vc-type-sfx-toggle");
    rangeEl = document.getElementById("vc-type-sfx-vol") || wrap.querySelector(".vc-bgm-player__range");
    if (rangeEl) {
      rangeEl.setAttribute("aria-label", isIt() ? "Volume" : "Volume");
      try {
        rangeEl.removeAttribute("title");
      } catch (eTr) {}
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
    injectCriticalShellCss();
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

        
    document.addEventListener(
      "focusin",
      function (ev) {
        if (!isTypingTarget(ev.target) || !isVisibleField(ev.target)) return;
        setShellVisible(true);
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

    try {
      if (window.__VC_CHROME_SYNC) {
        window.__VC_CHROME_SYNC.subscribe(function (prefs) {
          applyRemoteTypeSfx(prefs);
        });
      }
    } catch (eSub) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
