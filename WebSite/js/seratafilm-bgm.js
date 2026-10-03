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
  var HINT_AUTO_HIDE_MS = 4500;
  var hintEl = null;
  var hintHideTimer = null;
  var detachFirst = null;
  var lockedOffForFilm = false;

  function isProjectionBlockingBgm() {
    try {
      var b = document.body;
      if (!b) return false;
      return (
        b.classList.contains("vc-seratafilm-film-active") ||
        b.classList.contains("vc-seratafilm-ad-break-active") ||
        b.classList.contains("vc-seratafilm-ad-spot-playing")
      );
    } catch (eB) {
      return false;
    }
  }

  function clearHintAutoHide() {
    if (hintHideTimer) {
      clearTimeout(hintHideTimer);
      hintHideTimer = null;
    }
  }

  function scheduleHintAutoHide() {
    clearHintAutoHide();
    hintHideTimer = setTimeout(function () {
      hintHideTimer = null;
      hideHint();
    }, HINT_AUTO_HIDE_MS);
  }

  function hideHint() {
    clearHintAutoHide();
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
    if (hintEl) {
      scheduleHintAutoHide();
      return;
    }
    hintEl = document.createElement("div");
    hintEl.className = "vc-seratafilm-bgm-hint";
    hintEl.setAttribute("role", "status");
    var ico = document.createElement("span");
    ico.className = "vc-seratafilm-bgm-hint__ico";
    ico.setAttribute("aria-hidden", "true");
    var fi = document.createElement("i");
    fi.className = "fa fa-music";
    ico.appendChild(fi);
    var label = document.createElement("span");
    label.className = "vc-seratafilm-bgm-hint__txt";
    label.textContent = "Tocca per avviare la musica";
    hintEl.appendChild(ico);
    hintEl.appendChild(label);
    document.body.appendChild(hintEl);
    scheduleHintAutoHide();
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
    if (lockedOffForFilm || isProjectionBlockingBgm()) return;
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
    /* sfBgmAuto1: try autoplay like Hogwarts; browsers may still require a tap */
    try {
      if (!audio) {
        audio = new Audio();
        audio.preload = "auto";
        audio.addEventListener("ended", onEnded);
      }
      audio.muted = false;
      audio.volume = baseVol;
      var urls = trackUrls();
      if (urls.length) {
        applyCrossOriginForUrl(urls[0]);
        audio.src = urls[0];
        var p0 = audio.play();
        if (p0 && typeof p0.then === "function") {
          p0.then(function () {
            started = true;
            hideHint();
            if (typeof detachFirst === "function") {
              detachFirst();
              detachFirst = null;
            }
          }).catch(function () {});
        }
      }
    } catch (eAuto) {}
  };

  window.__vcSeratafilmBgmOnTick = function (remainingMs) {
    if (lockedOffForFilm || isProjectionBlockingBgm()) {
      if (mode === "youtube") {
        if (typeof window.__vcSeratafilmYoutubeOnTick === "function") {
          window.__vcSeratafilmYoutubeOnTick(0);
        }
        return;
      }
      if (audio && started) {
        try {
          audio.pause();
          audio.volume = 0;
        } catch (eLock) {}
      }
      return;
    }
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
    lockedOffForFilm = true;
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