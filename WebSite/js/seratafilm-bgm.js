(function () {
  function readCfg() {
    try {
      return window.__VC_SERATAFILM_BGM || {};
    } catch (e) {
      return {};
    }
  }

  function trackUrls() {
    var c = readCfg();
    var raw = c.trackUrls;
    if (!Array.isArray(raw)) return [];
    return raw.map(function (u) {
      return String(u || "").trim();
    }).filter(Boolean);
  }

  var mode = "none";
  var audio = null;
  var idx = 0;
  var baseVol = 0.34;
  var fadeWindowMs = 120000;
  var started = false;
  var hintEl = null;
  var detachFirst = null;

  function hideHint() {
    if (!hintEl) return;
    hintEl.classList.add("vc-seratafilm-bgm-hint--hide");
    setTimeout(function () {
      try {
        if (hintEl && hintEl.parentNode) hintEl.parentNode.removeChild(hintEl);
      } catch (e) {}
      hintEl = null;
    }, 400);
  }

  function ensureHint() {
    if (hintEl) return;
    hintEl = document.createElement("div");
    hintEl.className = "vc-seratafilm-bgm-hint";
    hintEl.setAttribute("role", "status");
    hintEl.textContent =
      "Playlist in loop: tocca un punto qualsiasi della pagina per avviare l'audio (richiesto dal browser).";
    document.body.appendChild(hintEl);
  }

  function applyCrossOriginForUrl(url) {
    if (!audio) return;
    try {
      var u = new URL(url, window.location.href);
      if (u.origin !== window.location.origin) audio.crossOrigin = "anonymous";
      else audio.removeAttribute("crossOrigin");
    } catch (e2) {
      audio.crossOrigin = "anonymous";
    }
  }

  function playIndex(i) {
    var urls = trackUrls();
    if (!urls.length || !audio) return;
    idx = ((i % urls.length) + urls.length) % urls.length;
    var url = urls[idx];
    applyCrossOriginForUrl(url);
    audio.src = url;
    var p = audio.play();
    if (p && typeof p.catch === "function") {
      p.catch(function () {});
    }
  }

  function onEnded() {
    playIndex(idx + 1);
  }

  function startFromUserGesture() {
    var urls = trackUrls();
    if (!urls.length || started) return;
    if (!audio) {
      audio = new Audio();
      audio.preload = "auto";
      audio.addEventListener("ended", onEnded);
    }
    started = true;
    audio.muted = false;
    audio.volume = baseVol;
    playIndex(0);
    hideHint();
    if (typeof detachFirst === "function") {
      detachFirst();
      detachFirst = null;
    }
  }

  function armFirstPointer() {
    detachFirst = function () {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey, true);
    };
    function onPointer() {
      startFromUserGesture();
    }
    function onKey(ev) {
      if (!ev || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (ev.key === "Escape") return;
      startFromUserGesture();
    }
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey, true);
  }

  window.__vcSeratafilmBgmSetup = function () {
    if (document.body && document.body.classList.contains("vc-seratafilm-thanks-page")) return;
    if (
      typeof window.__vcSeratafilmYoutubeSetupIfConfigured === "function" &&
      window.__vcSeratafilmYoutubeSetupIfConfigured()
    ) {
      mode = "youtube";
      return;
    }
    mode = "urls";
    var urls = trackUrls();
    if (!urls.length) {
      mode = "none";
      return;
    }
    var c = readCfg();
    baseVol = Math.min(1, Math.max(0.02, Number(c.baseVolume) || 0.34));
    var fadeSec = Math.max(5, Math.min(3600, Number(c.fadeStartSeconds) || 120));
    fadeWindowMs = fadeSec * 1000;
    ensureHint();
    armFirstPointer();
  };

  window.__vcSeratafilmBgmOnTick = function (remainingMs) {
    if (mode === "youtube") {
      if (typeof window.__vcSeratafilmYoutubeOnTick === "function") {
        window.__vcSeratafilmYoutubeOnTick(remainingMs);
      }
      return;
    }
    if (!audio || !started) return;
    var r = Number(remainingMs);
    if (!Number.isFinite(r) || r <= 0) {
      try {
        audio.volume = 0;
      } catch (e3) {}
      return;
    }
    if (r >= fadeWindowMs) {
      try {
        audio.volume = baseVol;
      } catch (e4) {}
      return;
    }
    var t = r / fadeWindowMs;
    var shaped = Math.pow(Math.max(0, Math.min(1, t)), 1.48);
    try {
      audio.volume = Math.max(0, Math.min(1, baseVol * shaped));
    } catch (e5) {}
  };

  window.__vcSeratafilmBgmStop = function () {
    if (mode === "youtube") {
      if (typeof window.__vcSeratafilmYoutubeStop === "function") {
        window.__vcSeratafilmYoutubeStop();
      }
      mode = "none";
      return;
    }
    hideHint();
    if (typeof detachFirst === "function") {
      detachFirst();
      detachFirst = null;
    }
    if (!audio) {
      mode = "none";
      return;
    }
    try {
      audio.pause();
    } catch (e6) {}
    try {
      audio.removeAttribute("src");
      audio.load();
    } catch (e7) {}
    started = false;
    mode = "none";
  };
})();