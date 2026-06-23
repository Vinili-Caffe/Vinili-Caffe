(function () {
  var ytPlayer = null;
  var ytReady = false;
  var ytMode = false;
  var ytVideoId = "";
  var ytGestureBound = false;

  function eventCfg() {
    try {
      return window.__VC_SERATAFILM_EVENT || {};
    } catch (e) {
      return {};
    }
  }

  function hogwartsWindowCfg() {
    try {
      var bgm = window.__VC_SERATAFILM_BGM || {};
      return bgm.hogwartsEventWindow || null;
    } catch (e2) {
      return null;
    }
  }

  function isHogwartsEventActive() {
    var w = hogwartsWindowCfg();
    if (!w || w.enabled === false) return false;
    var now = Date.now();
    var start = Number(w.startMs);
    var end = Number(w.endMs);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
    return now >= start && now < end;
  }

  function parseYoutubeVideoId(input) {
    var s = String(input || "").trim();
    if (!s) return "";
    if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
    var m =
      s.match(/[?&]v=([a-zA-Z0-9_-]{11})(?:[&]|$|#)/) ||
      s.match(/youtu\.be\/([a-zA-Z0-9_-]{11})(?:[?]|$|\/|#)/) ||
      s.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})(?:[?]|$|#)/);
    return m ? m[1] : "";
  }

  function resolveThemeVideoUrl() {
    var raw = String(eventCfg().hogwartsThemeVideoUrl || "/images/evento-hogwarts/inizio.mp4").trim();
    if (!raw || /\{\{/.test(raw)) return "";
    try {
      if (/^https?:\/\//i.test(raw)) return raw;
      if (raw.charAt(0) === "/") return new URL(raw, window.location.origin).href;
      return new URL(raw, window.location.href).href;
    } catch (e) {
      return raw;
    }
  }

  function resolveThemeYoutubeId() {
    var fromCfg = String(eventCfg().hogwartsThemeYoutubeVideoId || "").trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(fromCfg)) return fromCfg;
    return parseYoutubeVideoId(resolveThemeVideoUrl());
  }

  function youtubeApiScriptSrc() {
    try {
      var scripts = document.getElementsByTagName("script");
      for (var i = 0; i < scripts.length; i += 1) {
        var src = String(scripts[i].src || "");
        if (/seratafilm-hogwarts-theme\.js/.test(src)) {
          return src.replace(/seratafilm-hogwarts-theme\.js.*$/, "vc-youtube-iframe-api.js");
        }
      }
    } catch (eS) {}
    return "../js/vc-youtube-iframe-api.js";
  }

  function loadYoutubeIframeApi() {
    if (typeof window.__vcLoadYoutubeIframeApi === "function") {
      return window.__vcLoadYoutubeIframeApi();
    }
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = youtubeApiScriptSrc();
      s.async = true;
      s.onload = function () {
        if (typeof window.__vcLoadYoutubeIframeApi === "function") {
          window.__vcLoadYoutubeIframeApi().then(resolve).catch(reject);
          return;
        }
        reject(new Error("yt_api"));
      };
      s.onerror = function () {
        reject(new Error("yt_api_load"));
      };
      document.head.appendChild(s);
    });
  }

  function ensureCinzelFont() {
    if (document.getElementById("vc-seratafilm-cinzel-font")) return;
    var link = document.createElement("link");
    link.id = "vc-seratafilm-cinzel-font";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&display=swap";
    document.head.appendChild(link);
  }

  function getBgWrap() {
    return document.getElementById("vc-seratafilm-hogwarts-bg");
  }

  function getHtml5Video() {
    return document.getElementById("vc-seratafilm-hogwarts-bg-video");
  }

  function ensureYoutubeHost() {
    var wrap = getBgWrap();
    if (!wrap) return null;
    var host = document.getElementById("vc-seratafilm-hogwarts-bg-yt");
    if (host) return host;
    host = document.createElement("div");
    host.id = "vc-seratafilm-hogwarts-bg-yt";
    host.className = "vc-seratafilm-hogwarts-bg__yt";
    host.setAttribute("aria-hidden", "true");
    var inner = document.createElement("div");
    inner.id = "vc-seratafilm-hogwarts-bg-yt-player";
    host.appendChild(inner);
    var video = getHtml5Video();
    if (video && video.parentNode === wrap) wrap.insertBefore(host, video);
    else wrap.insertBefore(host, wrap.firstChild || null);
    return host;
  }

  function setBgVisible(visible) {
    var wrap = getBgWrap();
    if (!wrap) return;
    if (visible) {
      wrap.hidden = false;
      wrap.removeAttribute("hidden");
      wrap.setAttribute("aria-hidden", "false");
    } else {
      wrap.hidden = true;
      wrap.setAttribute("hidden", "");
      wrap.setAttribute("aria-hidden", "true");
    }
  }

  function playHtml5Bg() {
    var video = getHtml5Video();
    if (!video || document.body.classList.contains("vc-seratafilm-film-active")) return;
    var p = video.play();
    if (p && typeof p.catch === "function") p.catch(function () {});
  }

  function pauseHtml5Bg() {
    var video = getHtml5Video();
    if (!video) return;
    try {
      video.pause();
    } catch (eP) {}
  }

  function playYoutubeBg() {
    if (!ytPlayer || !ytReady || document.body.classList.contains("vc-seratafilm-film-active")) return;
    try {
      ytPlayer.mute();
      ytPlayer.playVideo();
    } catch (eY) {}
  }

  function pauseYoutubeBg() {
    if (!ytPlayer || !ytReady) return;
    try {
      ytPlayer.pauseVideo();
    } catch (ePy) {}
  }

  function playBgMedia() {
    if (ytMode) playYoutubeBg();
    else playHtml5Bg();
  }

  function pauseBgMedia() {
    pauseYoutubeBg();
    pauseHtml5Bg();
  }

  function showHtml5Bg(url) {
    ytMode = false;
    var video = getHtml5Video();
    var host = document.getElementById("vc-seratafilm-hogwarts-bg-yt");
    if (host) host.hidden = true;
    if (!video || !url) return;
    video.hidden = false;
    video.removeAttribute("hidden");
    if (video.src !== url) {
      video.src = url;
      try {
        video.load();
      } catch (eL) {}
    }
    setBgVisible(true);
    playHtml5Bg();
  }

  function destroyYoutubeBgPlayer() {
    try {
      if (ytPlayer) ytPlayer.destroy();
    } catch (eD) {}
    ytPlayer = null;
    ytReady = false;
    var host = document.getElementById("vc-seratafilm-hogwarts-bg-yt");
    if (host) {
      host.hidden = true;
      var inner = document.getElementById("vc-seratafilm-hogwarts-bg-yt-player");
      if (inner) inner.innerHTML = "";
    }
  }

  function createYoutubeBgPlayer(videoId) {
    if (!videoId || !window.YT || !window.YT.Player) return;
    ensureYoutubeHost();
    var video = getHtml5Video();
    if (video) {
      video.hidden = true;
      video.setAttribute("hidden", "");
      try {
        video.pause();
        video.removeAttribute("src");
      } catch (eV) {}
    }
    var host = document.getElementById("vc-seratafilm-hogwarts-bg-yt");
    if (host) {
      host.hidden = false;
      host.removeAttribute("hidden");
    }
    ytMode = true;
    ytVideoId = videoId;
    if (ytPlayer) destroyYoutubeBgPlayer();
    var playerVars = {
      autoplay: 1,
      mute: 1,
      controls: 0,
      rel: 0,
      modestbranding: 1,
      fs: 0,
      disablekb: 1,
      enablejsapi: 1,
      playsinline: 1,
      loop: 1,
      playlist: videoId,
      iv_load_policy: 3,
      cc_load_policy: 0,
      showinfo: 0,
      autohide: 1,
    };
    try {
      var originStr = String(window.location.origin || "").trim();
      if (originStr) playerVars.origin = originStr;
    } catch (eOr) {}
    ytPlayer = new window.YT.Player("vc-seratafilm-hogwarts-bg-yt-player", {
      host: window.__vcYoutubePlayerHost || "https://www.youtube-nocookie.com",
      videoId: videoId,
      width: "100%",
      height: "100%",
      playerVars: playerVars,
      events: {
        onReady: function () {
          ytReady = true;
          try {
            ytPlayer.mute();
          } catch (eM) {}
          playYoutubeBg();
        },
        onStateChange: function (ev) {
          if (!window.YT || !window.YT.PlayerState) return;
          if (ev.data === window.YT.PlayerState.ENDED) {
            try {
              ytPlayer.seekTo(0, true);
              ytPlayer.playVideo();
            } catch (eLoop) {}
          }
        },
      },
    });
  }

  function armYoutubeGesturePlay() {
    if (ytGestureBound) return;
    ytGestureBound = true;
    function onGesture() {
      playYoutubeBg();
      document.removeEventListener("pointerdown", onGesture, true);
      document.removeEventListener("keydown", onGesture, true);
    }
    document.addEventListener("pointerdown", onGesture, true);
    document.addEventListener("keydown", onGesture, true);
  }

  function showYoutubeBg(videoId) {
    if (!videoId) return;
    setBgVisible(true);
    loadYoutubeIframeApi()
      .then(function () {
        if (ytVideoId === videoId && ytPlayer && ytReady) {
          playYoutubeBg();
          return;
        }
        createYoutubeBgPlayer(videoId);
        armYoutubeGesturePlay();
      })
      .catch(function () {
        var fallback = "/images/evento-hogwarts/inizio.mp4";
        try {
          showHtml5Bg(new URL(fallback, window.location.origin).href);
        } catch (eF) {
          showHtml5Bg(fallback);
        }
      });
  }

  function applyThemeBackground() {
    var youtubeId = resolveThemeYoutubeId();
    if (youtubeId) {
      showYoutubeBg(youtubeId);
      return;
    }
    var url = resolveThemeVideoUrl();
    if (url) showHtml5Bg(url);
  }

  function applyHogwartsTheme() {
    if (!isHogwartsEventActive()) return;
    ensureCinzelFont();
    try {
      document.documentElement.classList.add("vc-seratafilm-hogwarts-event");
      document.body.classList.add("vc-seratafilm-hogwarts-event");
    } catch (eC) {}
    applyThemeBackground();
  }

  function wireFilmPlayerSync() {
    if (!document.body || typeof MutationObserver === "undefined") return;
    var obs = new MutationObserver(function () {
      if (document.body.classList.contains("vc-seratafilm-film-active")) {
        pauseBgMedia();
        return;
      }
      if (document.body.classList.contains("vc-seratafilm-hogwarts-event")) {
        playBgMedia();
      }
    });
    obs.observe(document.body, { attributes: true, attributeFilter: ["class"] });
  }

  window.__vcSeratafilmApplyHogwartsTheme = applyHogwartsTheme;

  function boot() {
    wireFilmPlayerSync();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();