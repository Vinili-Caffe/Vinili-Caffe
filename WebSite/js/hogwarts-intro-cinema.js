(function () {
  var introDone = false;
  var introRunning = false;
  var pendingDone = null;
  var srcIdx = 0;
  var srcList = [];
  var userStartedVideo = false;
  var playStartedAt = 0;
  var maxKnownDuration = 0;
  var completingIntro = false;
  var introEndTimer = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function hogwartsCfg() {
    return (typeof window !== "undefined" && window.__VC_HOGWARTS) || {};
  }

  function isTemplatePlaceholder(value) {
    return /\{\{.*\}\}/.test(String(value || ""));
  }

  function pageRelativePrefix() {
    try {
      var pathname = window.location.pathname || "/";
      var segs = pathname.split("/").filter(function (s) {
        return s && s.length;
      });
      if (segs.length && /\.html?$/i.test(segs[segs.length - 1])) segs.pop();
      if (!segs.length) return "";
      return new Array(segs.length + 1).join("../");
    } catch (e) {
      return "../../";
    }
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
        else push(new URL(raw, window.location.href).href);
      } catch (e0) {
        push(raw);
      }
    }
    var rel = pageRelativePrefix() + "images/evento-hogwarts/inizio.mp4";
    try {
      push(new URL(rel, window.location.href).href);
    } catch (eR) {
      push(rel);
    }
    try {
      push(new URL("/images/evento-hogwarts/inizio.mp4", window.location.origin).href);
    } catch (e1) {
      push("/images/evento-hogwarts/inizio.mp4");
    }
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

  function hideLoadingOverlay() {
    try {
      document.documentElement.classList.add("vc-hw-loading-done");
    } catch (e0) {}
    var el = byId("vc-hw-loading");
    if (el) {
      try {
        el.remove();
      } catch (e3) {}
    }
  }

  function showStartButton() {
    var startEl = byId("vc-hw-cinema-start");
    if (!startEl) return;
    startEl.hidden = false;
    startEl.removeAttribute("hidden");
  }

  function hideStartButton() {
    var startEl = byId("vc-hw-cinema-start");
    if (!startEl) return;
    startEl.hidden = true;
    startEl.setAttribute("hidden", "");
  }

  function showErr(msg) {
    var err = byId("vc-hw-cinema-err");
    if (!err) return;
    err.textContent = msg;
    err.hidden = false;
  }

  function hideErr() {
    var err = byId("vc-hw-cinema-err");
    if (!err) return;
    err.hidden = true;
  }

  function showCinema() {
    var cinema = byId("vc-hw-cinema");
    if (!cinema) return false;
    try {
      if (typeof window.__vcHogwartsYoutubeHideHint === "function") window.__vcHogwartsYoutubeHideHint();
    } catch (eH) {}
    cinema.hidden = false;
    cinema.removeAttribute("hidden");
    cinema.classList.add("vc-hw-cinema--open", "vc-hw-cinema--boot");
    setCinemaActive(true);
    return true;
  }

  function signalUserGesture() {
    try {
      window.__vcHwUserGestureAt = Date.now();
    } catch (eG) {}
    try {
      if (typeof window.__vcHogwartsYoutubePrimeFromGesture === "function") {
        window.__vcHogwartsYoutubePrimeFromGesture();
      }
    } catch (eY) {}
  }

  function noteVideoDuration(video) {
    if (!video) return;
    var d = Number(video.duration);
    if (Number.isFinite(d) && d > maxKnownDuration) maxKnownDuration = d;
  }

  function configuredIntroDurationSec() {
    var n = Number(hogwartsCfg().introVideoDurationSec);
    if (Number.isFinite(n) && n > 0) return n;
    return 12;
  }

  function configuredIntroTrimEndSec() {
    var n = Number(hogwartsCfg().introVideoTrimEndSec);
    if (!Number.isFinite(n) || n < 0) return 0;
    return n;
  }

  function introWallClockMs() {
    var video = byId("vc-hw-cinema-video");
    var sec = introTargetMediaSec(video) + 1.25;
    return Math.round(sec * 1000);
  }

  function introElapsedMs() {
    if (!playStartedAt) return 0;
    return Math.max(0, Date.now() - playStartedAt);
  }

  function hasIntroWallClockElapsed() {
    return introElapsedMs() >= introWallClockMs();
  }

  function introTargetMediaSec(video) {
    if (video) noteVideoDuration(video);
    var configured = configuredIntroDurationSec();
    var mediaDuration = video ? Number(video.duration) : 0;
    var base = configured;
    if (Number.isFinite(mediaDuration) && mediaDuration > 0) base = Math.max(base, mediaDuration);
    if (Number.isFinite(maxKnownDuration) && maxKnownDuration > 0) base = Math.max(base, maxKnownDuration);
    return Math.max(1, base - configuredIntroTrimEndSec());
  }

  function hasIntroMediaReachedEnd(video) {
    if (!video) return hasIntroWallClockElapsed();
    var current = Number(video.currentTime);
    if (!Number.isFinite(current)) return false;
    var target = introTargetMediaSec(video);
    return current >= Math.max(0, target - 0.08);
  }

  function clearIntroEndTimer() {
    if (!introEndTimer) return;
    try {
      clearTimeout(introEndTimer);
    } catch (eCl) {}
    introEndTimer = null;
  }

  function scheduleIntroEndTimer() {
    clearIntroEndTimer();
    var ms = introWallClockMs();
    introEndTimer = setTimeout(function () {
      introEndTimer = null;
      if (introDone || !userStartedVideo) return;
      var video = byId("vc-hw-cinema-video");
      if (video && !video.ended && !hasIntroMediaReachedEnd(video)) {
        scheduleIntroEndTimer();
        return;
      }
      completeIntro();
    }, ms);
    if (typeof introEndTimer.unref === "function") introEndTimer.unref();
  }

  function completeIntro() {
    clearIntroEndTimer();
    if (introDone) {
      if (typeof pendingDone === "function") {
        var recoverCb = pendingDone;
        pendingDone = null;
        try {
          recoverCb();
        } catch (eRec) {}
      } else if (typeof window.__vcHogwartsRevealApp === "function") {
        try {
          window.__vcHogwartsRevealApp();
        } catch (eRec2) {}
      }
      completingIntro = false;
      return;
    }
    introDone = true;
    introRunning = false;
    userStartedVideo = false;
    completingIntro = false;
    var cinema = byId("vc-hw-cinema");
    var video = byId("vc-hw-cinema-video");
    var cb = pendingDone;
    pendingDone = null;
    if (video) {
      try {
        video.onended = null;
        video.ontimeupdate = null;
        video.classList.add("vc-hw-cinema__video--out");
        video.pause();
      } catch (eF) {}
    }
    if (cinema) {
      cinema.classList.add("vc-hw-cinema--magic");
    }
    setCinemaActive(false);
    if (typeof cb === "function") {
      try {
        cb();
      } catch (eD) {}
    }
    setTimeout(function () {
      if (cinema) {
        try {
          cinema.classList.remove("vc-hw-cinema--magic");
        } catch (eM) {}
      }
    }, 700);
  }

  function tryLoadSrc() {
    var video = byId("vc-hw-cinema-video");
    if (!video) return false;
    if (!srcList.length) srcList = introVideoSrcList();
    if (srcIdx >= srcList.length) {
      showErr("Video non trovato. Usa «Salta intro» in basso a destra.");
      showStartButton();
      return false;
    }
    hideErr();
    video.src = srcList[srcIdx];
    srcIdx += 1;
    try {
      video.load();
    } catch (eL) {}
    return true;
  }

  function onVideoEnded() {
    if (introDone || !userStartedVideo) return;
    /* Sempre chiudi: se introVideoDurationSec in config è più lungo del video reale,
       attendere il wall-clock lascerebbe la pagina bloccati a fine riproduzione. */
    completeIntro();
  }

  function onVideoTimeUpdate() {
    if (introDone || !userStartedVideo) return;
    var video = byId("vc-hw-cinema-video");
    if (!hasIntroMediaReachedEnd(video)) return;
    try {
      if (video) {
        video.onended = null;
        video.ontimeupdate = null;
      }
    } catch (eOff) {}
    completeIntro();
  }

  function startVideoPlayback() {
    var video = byId("vc-hw-cinema-video");
    var cinema = byId("vc-hw-cinema");
    if (!video || !cinema || introDone) return;

    signalUserGesture();
    userStartedVideo = true;
    playStartedAt = Date.now();
    maxKnownDuration = 0;
    noteVideoDuration(video);
    cinema.classList.add("vc-hw-cinema--playing");
    video.playsInline = true;
    video.muted = false;
    video.volume = 1;
    try {
      video.removeAttribute("muted");
    } catch (eM) {}
    if (!video.src) tryLoadSrc();
    try {
      video.currentTime = 0;
    } catch (e0) {}

    var p = video.play();
    if (p && typeof p.then === "function") {
      p.then(function () {
        hideStartButton();
        hideErr();
        scheduleIntroEndTimer();
      }).catch(function () {
        video.muted = true;
        video
          .play()
          .then(function () {
            hideStartButton();
            showErr("Tocca di nuovo per l'audio del video.");
            showStartButton();
            userStartedVideo = true;
            playStartedAt = Date.now();
            scheduleIntroEndTimer();
          })
          .catch(function () {
            userStartedVideo = false;
            showStartButton();
            showErr("Tocca di nuovo per avviare il video.");
          });
      });
    } else {
      hideStartButton();
    }
  }

  function onStartTap(ev) {
    if (introDone) return;
    if (ev) {
      try {
        ev.preventDefault();
        ev.stopPropagation();
      } catch (e0) {}
    }
    var hint = byId("vc-hw-cinema-start");
    if (hint) {
      var hintEl = hint.querySelector(".vc-hw-cinema-start__hint");
      if (hintEl && /salta|continua/i.test(hintEl.textContent || "")) {
        completeIntro();
        return;
      }
    }
    if (!introRunning) return;
    showCinema();
    startVideoPlayback();
  }

  function wireVideo() {
    var video = byId("vc-hw-cinema-video");
    if (!video || video.__vcHwWired) return;
    video.__vcHwWired = 1;
    video.preload = "auto";
    video.onended = onVideoEnded;
    video.ontimeupdate = onVideoTimeUpdate;
    video.onerror = function () {
      userStartedVideo = false;
      showStartButton();
      if (!tryLoadSrc()) {
        showErr("Video non caricato. Tocca «Salta intro».");
      }
    };
    video.addEventListener("loadeddata", function () {
      noteVideoDuration(video);
      var cinema = byId("vc-hw-cinema");
      if (cinema) cinema.classList.add("vc-hw-cinema--has-video");
    });
    video.addEventListener("loadedmetadata", function () {
      noteVideoDuration(video);
    });
    video.addEventListener("durationchange", function () {
      noteVideoDuration(video);
    });
  }

  function wireSkip() {
    var skip = byId("vc-hw-cinema-skip");
    if (!skip || skip.__vcHwWired) return;
    skip.__vcHwWired = 1;
    skip.addEventListener("click", function (ev) {
      if (ev) {
        try {
          ev.preventDefault();
          ev.stopPropagation();
        } catch (e0) {}
      }
      signalUserGesture();
      completeIntro();
    });
  }

  function bindStartTap() {
    var startEl = byId("vc-hw-cinema-start");
    if (startEl && !startEl.__vcHwBound) {
      startEl.__vcHwBound = 1;
      startEl.addEventListener("click", onStartTap, true);
    }
  }

  function openIntro(onDone) {
    if (introDone) {
      if (typeof onDone === "function") onDone();
      return false;
    }
    if (typeof onDone === "function") pendingDone = onDone;
    if (introRunning) return true;
    introRunning = true;
    userStartedVideo = false;
    maxKnownDuration = 0;
    completingIntro = false;
    clearIntroEndTimer();
    srcIdx = 0;
    srcList = introVideoSrcList();

    var cinema = byId("vc-hw-cinema");
    var video = byId("vc-hw-cinema-video");
    if (!cinema || !video) {
      introDone = true;
      introRunning = false;
      if (typeof onDone === "function") onDone();
      return false;
    }

    hideLoadingOverlay();
    showCinema();
    showStartButton();
    var hint = byId("vc-hw-cinema-start");
    if (hint) {
      var hintEl = hint.querySelector(".vc-hw-cinema-start__hint");
      if (hintEl) hintEl.textContent = "Tocca per iniziare";
    }
    bindStartTap();
    wireVideo();
    wireSkip();
    tryLoadSrc();
    return true;
  }

  function boot() {
    bindStartTap();
    wireVideo();
    wireSkip();
  }

  window.__vcHogwartsIntroOpen = openIntro;
  window.__vcHogwartsCinemaStart = onStartTap;
  window.__vcHogwartsIntroIsRunning = function () {
    return introRunning && !introDone;
  };
  window.__vcHogwartsIntroForceClose = completeIntro;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  try {
    window.__vcHogwartsBgmAllowed = false;
    window.__vcHogwartsIntroCompleted = false;
  } catch (e0) {}
})();