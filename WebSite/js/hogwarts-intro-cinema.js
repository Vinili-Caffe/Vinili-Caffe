(function () {
  var introRunning = false;
  var introDone = false;
  var introDoneQueue = [];
  var controlsBound = false;
  var playbackStarted = false;
  var settled = false;
  var srcIdx = 0;
  var srcList = [];

  function byId(id) {
    return document.getElementById(id);
  }

  function hogwartsCfg() {
    return (typeof window !== "undefined" && window.__VC_HOGWARTS) || {};
  }

  function isTemplatePlaceholder(value) {
    return /\{\{.*\}\}/.test(String(value || ""));
  }

  function introVideoSrcList() {
    var urls = [];
    var seen = {};
    function push(href) {
      var u = String(href || "").trim();
      if (!u || seen[u]) return;
      seen[u] = 1;
      urls.push(u);
    }
    var raw = String(hogwartsCfg().introVideo || "").trim();
    if (raw && !isTemplatePlaceholder(raw)) {
      try {
        if (/^https?:\/\//i.test(raw)) push(raw);
        else if (raw.charAt(0) === "/") push(new URL(raw, window.location.origin).href);
        else {
          try {
            push(new URL(raw, window.location.href).href);
          } catch (eRel) {
            push(raw);
          }
        }
      } catch (e0) {
        push(raw);
      }
    }
    try {
      push(new URL("/images/evento-hogwarts/inizio.mp4", window.location.origin).href);
    } catch (e1) {
      push("/images/evento-hogwarts/inizio.mp4");
    }
    try {
      var pathname = window.location.pathname || "/";
      var segs = pathname.split("/").filter(function (s) {
        return s && s.length;
      });
      if (segs.length && /\.html?$/i.test(segs[segs.length - 1])) segs.pop();
      var rel = (segs.length ? new Array(segs.length + 1).join("../") : "") + "images/evento-hogwarts/inizio.mp4";
      push(new URL(rel, window.location.href).href);
    } catch (e2) {}
    return urls;
  }

  function setCinemaActive(active) {
    try {
      if (active) {
        document.body.classList.add("vc-hw-cinema-active");
        document.documentElement.classList.add("vc-hw-cinema-active");
      } else {
        document.body.classList.remove("vc-hw-cinema-active");
        document.documentElement.classList.remove("vc-hw-cinema-active");
      }
    } catch (e) {}
  }

  function showCinemaError(msg) {
    var err = byId("vc-hw-cinema-err");
    if (!err) return;
    err.textContent = msg || "Video intro non disponibile.";
    err.hidden = false;
  }

  function hideCinemaError() {
    var err = byId("vc-hw-cinema-err");
    if (!err) return;
    err.hidden = true;
    err.textContent = "";
  }

  function flushIntroDone(onDone) {
    if (typeof onDone === "function") {
      try {
        onDone();
      } catch (e0) {}
    }
    while (introDoneQueue.length) {
      var cb = introDoneQueue.shift();
      try {
        cb();
      } catch (e1) {}
    }
  }

  function finishIntro(onDone) {
    var cinema = byId("vc-hw-cinema");
    var video = byId("vc-hw-cinema-video");
    introRunning = false;
    introDone = true;
    playbackStarted = false;
    settled = false;
    try {
      window.__vcHogwartsIntroCompleted = true;
    } catch (eG) {}
    if (video) {
      try {
        video.pause();
      } catch (eP) {}
    }
    if (cinema) {
      cinema.classList.remove("vc-hw-cinema--playing");
      cinema.classList.add("vc-hw-cinema--done");
      cinema.setAttribute("aria-hidden", "true");
    }
    setCinemaActive(false);
    setTimeout(function () {
      if (cinema) {
        cinema.hidden = true;
        cinema.classList.remove("vc-hw-cinema--done", "vc-hw-cinema--magic");
      }
      try {
        document.body.classList.add("vc-hw-main-reveal");
        setTimeout(function () {
          document.body.classList.remove("vc-hw-main-reveal");
        }, 1200);
      } catch (eR) {}
      flushIntroDone(onDone);
    }, 2400);
  }

  function runMagicTransition(cinema, onDone) {
    if (!cinema) {
      finishIntro(onDone);
      return;
    }
    cinema.classList.add("vc-hw-cinema--magic");
    cinema.classList.remove("vc-hw-cinema--playing");
    var video = byId("vc-hw-cinema-video");
    if (video) {
      try {
        video.classList.add("vc-hw-cinema__video--out");
      } catch (eV) {}
    }
    setTimeout(function () {
      finishIntro(onDone);
    }, 2400);
  }

  function completeIntro() {
    if (settled || introDone) return;
    settled = true;
    hideCinemaError();
    runMagicTransition(byId("vc-hw-cinema"), null);
  }

  function pauseVideoPreview() {
    var video = byId("vc-hw-cinema-video");
    if (!video) return;
    try {
      video.pause();
      video.currentTime = 0;
    } catch (eP) {}
  }

  function tryLoadSrc() {
    var video = byId("vc-hw-cinema-video");
    var playBtn = byId("vc-hw-cinema-play");
    if (!video) return;
    if (srcIdx >= srcList.length) {
      showCinemaError(
        "Video intro non trovato sul server. Controlla che esista /images/evento-hogwarts/inizio.mp4 nel deploy.",
      );
      if (playBtn) playBtn.hidden = false;
      introRunning = false;
      return;
    }
    hideCinemaError();
    video.removeAttribute("autoplay");
    video.pause();
    video.src = srcList[srcIdx];
    srcIdx += 1;
    video.load();
  }

  function startPlayback() {
    if (introDone || playbackStarted) return;
    var cinema = byId("vc-hw-cinema");
    var video = byId("vc-hw-cinema-video");
    var playBtn = byId("vc-hw-cinema-play");
    if (!cinema || !video) return;
    if (!introRunning) openIntro(null);
    playbackStarted = true;
    if (playBtn) playBtn.hidden = true;
    hideCinemaError();
    cinema.classList.add("vc-hw-cinema--playing");
    video.muted = false;
    try {
      video.removeAttribute("muted");
    } catch (eM) {}
    try {
      video.currentTime = 0;
    } catch (eT) {}
    var p = video.play();
    if (p && typeof p.catch === "function") {
      p.catch(function () {
        video.muted = true;
        video.setAttribute("muted", "");
        video.play().catch(function () {
          playbackStarted = false;
          if (playBtn) playBtn.hidden = false;
          cinema.classList.remove("vc-hw-cinema--playing");
          tryLoadSrc();
        });
      });
    }
  }

  function wireVideoEvents() {
    var video = byId("vc-hw-cinema-video");
    if (!video || video.__vcHwCinemaWired) return;
    video.__vcHwCinemaWired = 1;
    video.onended = function () {
      completeIntro();
    };
    video.onerror = function () {
      playbackStarted = false;
      tryLoadSrc();
    };
    video.onloadeddata = function () {
      if (!playbackStarted) pauseVideoPreview();
    };
  }

  function showCinemaShell() {
    var cinema = byId("vc-hw-cinema");
    var playBtn = byId("vc-hw-cinema-play");
    if (!cinema || introDone) return;
    hideLoadingOverlay();
    cinema.hidden = false;
    cinema.removeAttribute("hidden");
    cinema.setAttribute("aria-hidden", "false");
    cinema.classList.remove("vc-hw-cinema--magic", "vc-hw-cinema--done", "vc-hw-cinema--playing");
    cinema.classList.add("vc-hw-cinema--open", "vc-hw-cinema--boot");
    if (playBtn) playBtn.hidden = false;
    setCinemaActive(true);
  }

  function bindControls() {
    if (controlsBound) return;
    var playBtn = byId("vc-hw-cinema-play");
    var skipBtn = byId("vc-hw-cinema-skip");
    if (!playBtn && !skipBtn) return;
    controlsBound = true;

    function onPlay(ev) {
      if (ev) {
        try {
          ev.preventDefault();
          ev.stopPropagation();
        } catch (e0) {}
      }
      startPlayback();
    }

    function onSkip(ev) {
      if (ev) {
        try {
          ev.preventDefault();
          ev.stopPropagation();
        } catch (e1) {}
      }
      if (introDone) return;
      if (!introRunning) openIntro(null);
      completeIntro();
    }

    if (playBtn) {
      playBtn.addEventListener("click", onPlay);
      playBtn.addEventListener("touchend", onPlay, { passive: false });
    }
    if (skipBtn) {
      skipBtn.addEventListener("click", onSkip);
      skipBtn.addEventListener("touchend", onSkip, { passive: false });
    }
  }

  function prepareVideoElement() {
    var video = byId("vc-hw-cinema-video");
    if (!video) return;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.removeAttribute("autoplay");
    video.muted = true;
    video.setAttribute("muted", "");
    video.preload = "auto";
    try {
      video.pause();
    } catch (eP) {}
  }

  function openIntro(onDone) {
    if (introDone) {
      flushIntroDone(onDone);
      return false;
    }
    if (typeof onDone === "function") introDoneQueue.push(onDone);
    if (introRunning) return true;

    var cinema = byId("vc-hw-cinema");
    var video = byId("vc-hw-cinema-video");
    if (!cinema || !video) {
      if (typeof onDone === "function") onDone();
      return false;
    }

    introRunning = true;
    settled = false;
    playbackStarted = false;
    srcIdx = 0;
    srcList = introVideoSrcList();

    bindControls();
    prepareVideoElement();
    wireVideoEvents();
    showCinemaShell();
    tryLoadSrc();
    return true;
  }

  function hideLoadingOverlay() {
    try {
      document.documentElement.classList.add("vc-hw-loading-done");
    } catch (e0) {}
    var el = byId("vc-hw-loading");
    if (!el) return;
    try {
      el.style.setProperty("display", "none", "important");
    } catch (e1) {
      try {
        el.style.display = "none";
      } catch (e2) {}
    }
    try {
      el.remove();
    } catch (e3) {}
  }

  window.__vcHogwartsIntroOpen = openIntro;
  window.__vcHogwartsIntroMaybePlay = openIntro;
  window.__vcHogwartsIntroIsRunning = function () {
    return introRunning;
  };

  window.__vcHogwartsIntroForceClose = function () {
    introDone = true;
    introRunning = false;
    var cinema = byId("vc-hw-cinema");
    if (cinema) {
      cinema.hidden = true;
      cinema.setAttribute("hidden", "");
      cinema.classList.remove("vc-hw-cinema--open", "vc-hw-cinema--boot", "vc-hw-cinema--playing");
    }
    setCinemaActive(false);
    pauseVideoPreview();
  };

  function boot() {
    bindControls();
    prepareVideoElement();
    showCinemaShell();
    openIntro(null);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();