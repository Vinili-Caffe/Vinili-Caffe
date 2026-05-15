(function () {
  var introDone = false;
  var introRunning = false;
  var pendingDone = null;
  var srcIdx = 0;
  var srcList = [];
  var started = false;

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
        else push(new URL(raw, window.location.href).href);
      } catch (e0) {
        push(raw);
      }
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
    if (!el) return;
    try {
      el.remove();
    } catch (e3) {}
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

  function completeIntro() {
    if (introDone) return;
    introDone = true;
    introRunning = false;
    setCinemaActive(false);
    var cinema = byId("vc-hw-cinema");
    var video = byId("vc-hw-cinema-video");
    if (video) {
      try {
        video.onended = null;
        video.ontimeupdate = null;
        video.pause();
      } catch (eP) {}
    }
    if (cinema) {
      cinema.classList.add("vc-hw-cinema--magic");
      setTimeout(function () {
        if (typeof pendingDone === "function") {
          try {
            pendingDone();
          } catch (eD) {}
        }
        pendingDone = null;
      }, 1400);
    } else if (typeof pendingDone === "function") {
      try {
        pendingDone();
      } catch (eD2) {}
      pendingDone = null;
    }
  }

  function tryLoadSrc() {
    var video = byId("vc-hw-cinema-video");
    if (!video) return false;
    if (srcIdx >= srcList.length) {
      showErr("Video intro non trovato sul server (/images/evento-hogwarts/inizio.mp4).");
      setTimeout(completeIntro, 2500);
      return false;
    }
    hideErr();
    video.src = srcList[srcIdx];
    srcIdx += 1;
    video.load();
    return true;
  }

  function unmuteVideoPlayback() {
    var video = byId("vc-hw-cinema-video");
    if (!video) return;
    video.muted = false;
    video.volume = 1;
    try {
      video.removeAttribute("muted");
    } catch (eM) {}
    var p = video.play();
    if (p && typeof p.catch === "function") p.catch(function () {});
    hideErr();
  }

  function playWithSound() {
    var video = byId("vc-hw-cinema-video");
    var cinema = byId("vc-hw-cinema");
    var startEl = byId("vc-hw-cinema-start");
    if (!video || !cinema) return false;
    if (!introRunning && !introDone) {
      openIntro(null);
    }
    if (started && video.muted) {
      unmuteVideoPlayback();
      return true;
    }
    if (started) return true;
    started = true;
    if (startEl) {
      startEl.hidden = true;
      startEl.setAttribute("hidden", "");
    }
    hideErr();
    cinema.classList.add("vc-hw-cinema--playing");
    video.playsInline = true;
    video.muted = false;
    video.volume = 1;
    try {
      video.removeAttribute("muted");
    } catch (eM) {}
    if (!video.src) tryLoadSrc();
    var p = video.play();
    if (p && typeof p.catch === "function") {
      p.catch(function () {
        video.muted = true;
        video.volume = 0;
        var p2 = video.play();
        if (p2 && typeof p2.catch === "function") {
          p2.catch(function () {
            started = false;
            if (startEl) {
              startEl.hidden = false;
              startEl.removeAttribute("hidden");
            }
            showErr("Impossibile avviare il video. Tocca di nuovo per riprovare.");
          });
        } else {
          showErr("Tocca di nuovo lo schermo per l'audio del video.");
        }
      });
    }
    return true;
  }

  function onStartUserAction(ev) {
    if (introDone) return;
    if (ev) {
      try {
        ev.preventDefault();
        ev.stopPropagation();
      } catch (e0) {}
    }
    playWithSound();
  }

  function bindStartTap() {
    var cinema = byId("vc-hw-cinema");
    var startEl = byId("vc-hw-cinema-start");
    if (startEl && !startEl.__vcHwStartBound) {
      startEl.__vcHwStartBound = 1;
      startEl.addEventListener("click", onStartUserAction, true);
      startEl.addEventListener("touchend", onStartUserAction, { capture: true, passive: false });
    }
    if (cinema && !cinema.__vcHwCinemaTapBound) {
      cinema.__vcHwCinemaTapBound = 1;
      cinema.addEventListener(
        "click",
        function (ev) {
          if (introDone) return;
          var t = ev && ev.target;
          if (t && t.closest && t.closest("#vc-hw-cinema-start")) return;
          onStartUserAction(ev);
        },
        true,
      );
    }
  }

  function wireVideo() {
    var video = byId("vc-hw-cinema-video");
    if (!video || video.__vcHwWired) return;
    video.__vcHwWired = 1;
    video.onended = function () {
      completeIntro();
    };
    video.ontimeupdate = function () {
      if (introDone || !started) return;
      var d = Number(video.duration);
      var t = Number(video.currentTime);
      if (Number.isFinite(d) && d > 0.5 && Number.isFinite(t) && t >= d - 0.35) completeIntro();
    };
    video.onerror = function () {
      started = false;
      var startEl = byId("vc-hw-cinema-start");
      if (startEl) {
        startEl.hidden = false;
        startEl.removeAttribute("hidden");
      }
      if (!tryLoadSrc()) return;
    };
  }

  function bootCinemaModule() {
    bindStartTap();
    wireVideo();
  }

  function openIntro(onDone) {
    if (introDone) {
      if (typeof onDone === "function") onDone();
      return false;
    }
    if (typeof onDone === "function") pendingDone = onDone;
    if (introRunning) return true;
    introRunning = true;
    started = false;
    srcIdx = 0;
    srcList = introVideoSrcList();

    var cinema = byId("vc-hw-cinema");
    var video = byId("vc-hw-cinema-video");
    var startEl = byId("vc-hw-cinema-start");
    if (!cinema || !video) {
      introDone = true;
      introRunning = false;
      if (typeof onDone === "function") onDone();
      return false;
    }

    hideLoadingOverlay();
    cinema.hidden = false;
    cinema.removeAttribute("hidden");
    cinema.classList.add("vc-hw-cinema--open", "vc-hw-cinema--boot");
    if (startEl) {
      startEl.hidden = false;
      startEl.removeAttribute("hidden");
    }
    setCinemaActive(true);
    bootCinemaModule();
    tryLoadSrc();
    return true;
  }

  window.__vcHogwartsIntroOpen = openIntro;
  window.__vcHogwartsCinemaStart = onStartUserAction;
  window.__vcHogwartsIntroIsRunning = function () {
    return introRunning && !introDone;
  };
  window.__vcHogwartsIntroForceClose = function () {
    introDone = true;
    introRunning = false;
    var cinema = byId("vc-hw-cinema");
    if (cinema) cinema.hidden = true;
    setCinemaActive(false);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootCinemaModule);
  } else {
    bootCinemaModule();
  }

  try {
    window.__vcHogwartsBgmAllowed = false;
    window.__vcHogwartsIntroCompleted = false;
  } catch (e0) {}
})();