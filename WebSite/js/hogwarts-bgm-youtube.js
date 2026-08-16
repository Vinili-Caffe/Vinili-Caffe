(function () {
  var BGM_PREF_KEY = "vc_hogwarts_bgm_enabled_v1";
  var VOL_PREF_KEY = "vc_hogwarts_bgm_volume_v1";
  var HINT_AUTO_HIDE_MS = 4500;
  var hintEl = null;
  var hintHideTimer = null;
  var started = false;
  var mutedByUser = false;
  var baseVol = 0.35;
  var userVol = 0.35;
  var player = null;
  var playerReady = false;
  var booting = false;
  var activeVideoIdx = 0;
  var ytLoadFailed = false;
  /** Musica in pausa mentre è in corso un video incorporato (es. smistamento.mp4). */
  var pausedForEmbeddedVideo = false;
  /** Se true dopo unduck, la BGM torna a suonare (rispetta anche mutedByUser e il tap sul FAB). */
  var shouldResumeAfterEmbeddedVideo = false;
  var detachFirst = null;
  var volumeUiBound = false;

  function youtubePublicCfg() {
    try {
      var bgm = window.__VC_HOGWARTS_BGM || {};
      var y = bgm.youtube;
      if (!y || typeof y !== "object") return null;
      var playlistId = String(y.playlistId || "").trim();
      var clean = [];
      if (Array.isArray(y.videoIds)) {
        for (var i = 0; i < y.videoIds.length; i += 1) {
          var id = String(y.videoIds[i] || "").trim();
          if (/^[a-zA-Z0-9_-]{11}$/.test(id)) clean.push(id);
        }
      }
      if (Array.isArray(y.videoUrls)) {
        for (var u = 0; u < y.videoUrls.length; u += 1) {
          var s = String(y.videoUrls[u] || "").trim();
          if (!s) continue;
          var m =
            s.match(/[?&]v=([a-zA-Z0-9_-]{11})(?:[&]|$|#)/) ||
            s.match(/youtu\.be\/([a-zA-Z0-9_-]{11})(?:[?]|$|\/|#)/) ||
            s.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})(?:[?]|$|#)/);
          if (m && m[1]) clean.push(m[1]);
        }
      }
      if (!playlistId && !clean.length) return null;
      var uniq = [];
      var seen = {};
      for (var k = 0; k < clean.length; k += 1) {
        if (seen[clean[k]]) continue;
        seen[clean[k]] = 1;
        uniq.push(clean[k]);
      }
      return { playlistId: playlistId, videoIds: uniq };
    } catch (e) {
      return null;
    }
  }

  function bgmAllowed() {
    try {
      return window.__vcHogwartsBgmAllowed === true;
    } catch (eA) {
      return false;
    }
  }

  function isUserOptedOut() {
    try {
      return localStorage.getItem(BGM_PREF_KEY) === "0";
    } catch (eP) {
      return false;
    }
  }

  function rememberBgmEnabled(enabled) {
    try {
      localStorage.setItem(BGM_PREF_KEY, enabled ? "1" : "0");
    } catch (eP) {}
  }

  function readVolume() {
    var cfgVol = 0.35;
    try {
      var c = window.__VC_HOGWARTS_BGM || {};
      cfgVol = Math.min(1, Math.max(0.05, Number(c.baseVolume) || 0.35));
    } catch (eV) {}
    try {
      var raw = localStorage.getItem(VOL_PREF_KEY);
      if (raw != null && raw !== "") {
        var n = Number(raw);
        if (Number.isFinite(n)) {
          userVol = Math.min(1, Math.max(0, n > 1 ? n / 100 : n));
          baseVol = userVol;
          return;
        }
      }
    } catch (eLs) {}
    userVol = cfgVol;
    baseVol = cfgVol;
  }

  function persistVolume(vol) {
    userVol = Math.min(1, Math.max(0, Number(vol) || 0));
    baseVol = userVol;
    try {
      localStorage.setItem(VOL_PREF_KEY, String(Math.round(userVol * 100) / 100));
    } catch (eP) {}
  }

  function applyPlayerVolume() {
    if (!player || !playerReady) return;
    try {
      player.setVolume(Math.round(Math.min(1, Math.max(0, baseVol)) * 100));
    } catch (eAv) {}
  }

  function ensurePlayerShell() {
    var existing = document.getElementById("vc-hw-music-player");
    if (existing) {
      syncVolumeSliderUi();
      return existing;
    }
    var btn = document.getElementById("vc-hw-music-btn");
    if (!btn || !btn.parentNode) return null;

    var wrap = document.createElement("div");
    wrap.id = "vc-hw-music-player";
    wrap.className = "vc-bgm-player vc-bgm-player--hogwarts vc-hw-music-fab";
    if (btn.hasAttribute("hidden") || btn.hidden) {
      wrap.hidden = true;
      wrap.setAttribute("hidden", "");
    }

    btn.className = "vc-bgm-player__toggle";
    btn.removeAttribute("hidden");
    btn.hidden = false;
    if (!btn.querySelector(".fa")) {
      var ico = document.createElement("i");
      ico.className = "fa fa-volume-up";
      ico.setAttribute("aria-hidden", "true");
      btn.appendChild(ico);
    }

    var meta = document.createElement("div");
    meta.className = "vc-bgm-player__meta";
    var label = document.createElement("span");
    label.className = "vc-bgm-player__label";
    label.textContent = "Musica Hogwarts";
    var row = document.createElement("div");
    row.className = "vc-bgm-player__slider-row";
    var icoLo = document.createElement("i");
    icoLo.className = "fa fa-volume-down";
    icoLo.setAttribute("aria-hidden", "true");
    var range = document.createElement("input");
    range.type = "range";
    range.id = "vc-hw-music-vol";
    range.className = "vc-bgm-player__range";
    range.min = "0";
    range.max = "100";
    range.step = "1";
    range.setAttribute("aria-label", "Volume musica Hogwarts");
    var icoHi = document.createElement("i");
    icoHi.className = "fa fa-volume-up";
    icoHi.setAttribute("aria-hidden", "true");
    row.appendChild(icoLo);
    row.appendChild(range);
    row.appendChild(icoHi);
    meta.appendChild(label);
    meta.appendChild(row);

    btn.parentNode.insertBefore(wrap, btn);
    wrap.appendChild(btn);
    wrap.appendChild(meta);
    bindVolumeUi();
    syncVolumeSliderUi();
    return wrap;
  }

  function syncVolumeSliderUi() {
    var range = document.getElementById("vc-hw-music-vol");
    if (!range) return;
    range.value = String(Math.round(Math.min(1, Math.max(0, userVol)) * 100));
  }

  function bindVolumeUi() {
    if (volumeUiBound) return;
    var range = document.getElementById("vc-hw-music-vol");
    if (!range) return;
    volumeUiBound = true;
    function onVolInput() {
      var pct = Math.min(100, Math.max(0, Number(range.value) || 0));
      persistVolume(pct / 100);
      if (pct <= 0) {
        if (!mutedByUser) pauseAudible();
        else applyPlayerVolume();
        updateMusicButtonUi();
        return;
      }
      applyPlayerVolume();
      if (mutedByUser || !isAudiblePlaying()) {
        rememberBgmEnabled(true);
        mutedByUser = false;
        hideHint();
        detachFirstPointer();
        playAudible(true);
      }
      updateMusicButtonUi();
    }
    range.addEventListener("input", onVolInput);
    range.addEventListener("change", onVolInput);
    range.addEventListener("pointerdown", function (ev) {
      try {
        ev.stopPropagation();
      } catch (eS) {}
    });
  }

  function isAudiblePlaying() {
    if (mutedByUser || !player || !playerReady) return false;
    try {
      var st = player.getPlayerState();
      var YT = window.YT;
      if (YT && YT.PlayerState) {
        return st === YT.PlayerState.PLAYING || st === YT.PlayerState.BUFFERING;
      }
      return st === 1 || st === 3;
    } catch (eSt) {
      return started && !mutedByUser;
    }
  }

  function updateMusicButtonUi() {
    ensurePlayerShell();
    var btn = document.getElementById("vc-hw-music-btn");
    if (!btn) return;
    var ico = btn.querySelector(".fa");
    if (!ico) return;
    if (isAudiblePlaying()) {
      ico.className = "fa fa-volume-up";
      btn.setAttribute("aria-label", "Disattiva musica di sottofondo");
      btn.title = "Disattiva musica Hogwarts";
    } else {
      ico.className = "fa fa-volume-off";
      btn.setAttribute("aria-label", "Attiva musica di sottofondo");
      btn.title = "Attiva musica Hogwarts";
    }
    syncVolumeSliderUi();
  }

  function showMusicButton() {
    var wrap = ensurePlayerShell();
    if (wrap) {
      wrap.hidden = false;
      wrap.removeAttribute("hidden");
    }
    var btn = document.getElementById("vc-hw-music-btn");
    if (btn) {
      btn.hidden = false;
      btn.removeAttribute("hidden");
    }
    updateMusicButtonUi();
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
    hintEl.classList.add("vc-hw-bgm-hint--hide");
    setTimeout(function () {
      try {
        if (hintEl && hintEl.parentNode) hintEl.parentNode.removeChild(hintEl);
      } catch (e) {}
      hintEl = null;
    }, 400);
  }

  function detachFirstPointer() {
    if (typeof detachFirst === "function") {
      detachFirst();
      detachFirst = null;
    }
  }

  function cinemaIntroActive() {
    try {
      if (typeof window.__vcHogwartsIntroIsRunning === "function" && window.__vcHogwartsIntroIsRunning()) return true;
      if (document.body && document.body.classList.contains("vc-hw-cinema-active")) return true;
      var cinema = document.getElementById("vc-hw-cinema");
      if (cinema && !cinema.hidden && !document.body.classList.contains("vc-hw-intro-finished")) return true;
    } catch (eC) {}
    return false;
  }

  function startFromUserGesture() {
    if (!youtubePublicCfg()) return;
    if (cinemaIntroActive()) return;
    if (isAudiblePlaying()) {
      detachFirstPointer();
      hideHint();
      return;
    }
    detachFirstPointer();
    try {
      window.__vcHwUserGestureAt = Date.now();
    } catch (eG) {}
    rememberBgmEnabled(true);
    mutedByUser = false;
    playAudible(true);
    hideHint();
  }

  function armFirstPointer() {
    if (!youtubePublicCfg()) return;
    if (cinemaIntroActive()) return;
    if (detachFirst) return;
    detachFirst = function () {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey, true);
    };
    function onPointer(ev) {
      if (ev && ev.target && ev.target.closest && ev.target.closest("#vc-hw-cinema, #vc-hw-cinema-start, #vc-hw-cinema-skip, #vc-hw-music-player")) return;
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

  function ensureHint(msg) {
    if (cinemaIntroActive()) return;
    var text =
      msg ||
      "Tocca per avviare la musica";
    if (hintEl) {
      var txt = hintEl.querySelector(".vc-hw-bgm-hint__txt");
      if (txt) txt.textContent = text;
      else hintEl.textContent = text;
      scheduleHintAutoHide();
      return;
    }
    hintEl = document.createElement("button");
    hintEl.type = "button";
    hintEl.className = "vc-hw-bgm-hint";
    hintEl.setAttribute("role", "status");
    hintEl.setAttribute("aria-label", text);
    var ico = document.createElement("span");
    ico.className = "vc-hw-bgm-hint__ico";
    ico.setAttribute("aria-hidden", "true");
    var fi = document.createElement("i");
    fi.className = "fa fa-music";
    ico.appendChild(fi);
    var label = document.createElement("span");
    label.className = "vc-hw-bgm-hint__txt";
    label.textContent = text;
    hintEl.appendChild(ico);
    hintEl.appendChild(label);
    hintEl.addEventListener("click", function (ev) {
      if (ev) {
        try {
          ev.preventDefault();
        } catch (e0) {}
      }
      startFromUserGesture();
    });
    document.body.appendChild(hintEl);
    scheduleHintAutoHide();
  }

  function stopOtherSiteBgm() {
    try {
      if (typeof window.__vcSeratafilmYoutubeStop === "function") {
        window.__vcSeratafilmYoutubeStop();
      }
    } catch (eS) {}
    try {
      if (typeof window.__vcSeratafilmBgmStop === "function") {
        window.__vcSeratafilmBgmStop();
      }
    } catch (eB) {}
  }

  function ensureHost() {
    if (document.getElementById("vc-hw-yt-host")) return;
    var wrap = document.createElement("div");
    wrap.id = "vc-hw-yt-host";
    wrap.setAttribute("aria-hidden", "true");
    wrap.style.cssText =
      "position:fixed;left:-9999px;top:0;width:320px;height:180px;opacity:0.01;pointer-events:none;z-index:0;overflow:hidden";
    document.body.appendChild(wrap);
    var inner = document.createElement("div");
    inner.id = "vc-hw-yt-player";
    wrap.appendChild(inner);
  }

  function loadApi() {
    if (typeof window.__vcLoadYoutubeIframeApi === "function") {
      return window.__vcLoadYoutubeIframeApi();
    }
    return Promise.reject(new Error("yt_api"));
  }

  function onYoutubeBlocked() {
    ytLoadFailed = true;
    ensureHint("Musica bloccata dall’ad-blocker. Consenti youtube-nocookie.com.");
  }

  function tryNextYoutubeVideo() {
    var pub = youtubePublicCfg();
    if (!player || !pub || !pub.videoIds || pub.videoIds.length < 2) return false;
    if (activeVideoIdx >= pub.videoIds.length - 1) return false;
    activeVideoIdx += 1;
    try {
      player.loadVideoById(pub.videoIds[activeVideoIdx]);
      return true;
    } catch (eN) {
      return false;
    }
  }

  function createPlayer() {
    var pub = youtubePublicCfg();
    if (!pub || player) return;
    if (!pub.playlistId && !pub.videoIds.length) return;
    ensureHost();
    readVolume();
    var bootstrapId = pub.videoIds.length ? pub.videoIds[0] : "";
    if (!bootstrapId && !pub.playlistId) return;
    var playerVars = {
      playsinline: 1,
      controls: 0,
      rel: 0,
      modestbranding: 1,
      fs: 0,
      disablekb: 1,
      enablejsapi: 1,
    };
    if (pub.playlistId) {
      playerVars.listType = "playlist";
      playerVars.list = pub.playlistId;
    }
    try {
      var o = String(window.location.origin || "");
      if (o) playerVars.origin = o;
    } catch (eO) {}
    activeVideoIdx = 0;
    booting = true;
    player = new window.YT.Player("vc-hw-yt-player", {
      host: window.__vcYoutubePlayerHost || "https://www.youtube.com",
      videoId: bootstrapId || pub.videoIds[0],
      height: "180",
      width: "320",
      playerVars: playerVars,
      events: {
        onReady: function () {
          playerReady = true;
          booting = false;
          try {
            if (pub.playlistId) {
              player.cuePlaylist(pub.playlistId, 0, 0);
            } else if (pub.videoIds.length > 1) {
              player.cuePlaylist(pub.videoIds, 0, 0);
            }
          } catch (eCue) {}
          try {
            applyPlayerVolume();
          } catch (eV) {}
        },
        onError: function (ev) {
          booting = false;
          if (tryNextYoutubeVideo()) return;
          var code = ev && ev.data != null ? ev.data : "?";
          onYoutubeBlocked();
          var btn = document.getElementById("vc-hw-music-btn");
          if (btn) btn.title = "Musica non disponibile (YouTube " + code + ")";
        },
        onStateChange: function (ev) {
          if (!ev) return;
          var YT = window.YT;
          if (ev.data === YT.PlayerState.PLAYING) {
            if (pausedForEmbeddedVideo && !mutedByUser) {
              try {
                player.pauseVideo();
                player.mute();
              } catch (eDuck) {}
              started = false;
              updateMusicButtonUi();
              return;
            }
            if (mutedByUser) {
              try {
                player.pauseVideo();
                player.mute();
              } catch (ePu) {}
              started = false;
              updateMusicButtonUi();
              return;
            }
            started = true;
            hideHint();
            detachFirstPointer();
            updateMusicButtonUi();
          }
          if (ev.data === YT.PlayerState.PAUSED && mutedByUser) {
            started = false;
            updateMusicButtonUi();
          }
          if (ev.data === YT.PlayerState.ENDED) {
            if (mutedByUser) return;
            if (pausedForEmbeddedVideo) return;
            var cfg = youtubePublicCfg();
            if (cfg && (cfg.playlistId || (cfg.videoIds && cfg.videoIds.length > 1))) return;
            try {
              player.seekTo(0, true);
              player.playVideo();
            } catch (eL) {}
          }
        },
      },
    });
  }

  function bootPlayer() {
    if (!youtubePublicCfg() || player || booting || ytLoadFailed) return;
    loadApi()
      .then(function () {
        if (!player) createPlayer();
      })
      .catch(function () {
        onYoutubeBlocked();
      });
  }

  function pauseAudible() {
    mutedByUser = true;
    rememberBgmEnabled(false);
    try {
      window.__vcHogwartsBgmAllowed = false;
    } catch (eA) {}
    if (pausedForEmbeddedVideo) shouldResumeAfterEmbeddedVideo = false;
    started = false;
    try {
      if (player) {
        player.pauseVideo();
        player.mute();
      }
    } catch (eP) {}
    updateMusicButtonUi();
  }

  function pauseForEmbeddedVideo() {
    if (!youtubePublicCfg()) return;
    readVolume();
    pausedForEmbeddedVideo = true;
    shouldResumeAfterEmbeddedVideo = isAudiblePlaying();
    started = false;
    try {
      if (player && playerReady) {
        player.pauseVideo();
        player.mute();
      }
    } catch (ePv) {}
    updateMusicButtonUi();
  }

  function resumeAfterEmbeddedVideo() {
    if (!pausedForEmbeddedVideo) return;
    pausedForEmbeddedVideo = false;
    readVolume();
    var resume = shouldResumeAfterEmbeddedVideo && !mutedByUser && bgmAllowed();
    shouldResumeAfterEmbeddedVideo = false;
    if (!resume) {
      updateMusicButtonUi();
      return;
    }
    showMusicButton();
    if (!playerReady || !player) {
      bootPlayer();
      var n = 0;
      var waitIv = setInterval(function () {
        n += 1;
        if (playerReady && player) {
          clearInterval(waitIv);
          try {
            player.unMute();
            applyPlayerVolume();
            player.playVideo();
            started = true;
          } catch (eR) {}
          updateMusicButtonUi();
        } else if (n >= 50) clearInterval(waitIv);
      }, 200);
      return;
    }
    try {
      player.unMute();
      applyPlayerVolume();
      player.playVideo();
      started = true;
    } catch (ePl) {
      try {
        ensureHint();
      } catch (eH) {}
    }
    updateMusicButtonUi();
  }

  function playAudible(force) {
    if (!youtubePublicCfg()) return;
    if (!force && !bgmAllowed()) return;
    if (force) ytLoadFailed = false;
    else if (ytLoadFailed) {
      onYoutubeBlocked();
      return;
    }
    if (pausedForEmbeddedVideo) {
      try {
        window.__vcHogwartsBgmAllowed = true;
      } catch (eA2) {}
      mutedByUser = false;
      shouldResumeAfterEmbeddedVideo = true;
      updateMusicButtonUi();
      return;
    }
    stopOtherSiteBgm();
    try {
      window.__vcHogwartsBgmAllowed = true;
    } catch (eA) {}
    mutedByUser = false;
    showMusicButton();
    bootPlayer();
    if (!playerReady || !player) {
      var n = 0;
      var waitIv = setInterval(function () {
        n += 1;
        if (playerReady && player) {
          clearInterval(waitIv);
          playAudible(true);
        } else if (n >= 50) {
          clearInterval(waitIv);
          ensureHint();
        }
      }, 200);
      return;
    }
    try {
      player.unMute();
      applyPlayerVolume();
      player.playVideo();
      started = true;
      updateMusicButtonUi();
    } catch (eP) {
      ensureHint();
    }
  }

  function playMutedPrime() {
    if (!youtubePublicCfg()) return;
    stopOtherSiteBgm();
    bootPlayer();
    if (!playerReady || !player) return;
    try {
      player.mute();
      player.playVideo();
    } catch (eM) {}
  }

  window.__vcHogwartsYoutubeHideHint = hideHint;

  window.__vcHogwartsYoutubePrimeFromGesture = function () {
    playMutedPrime();
  };

  window.__vcHogwartsYoutubeStartAfterIntro = function () {
    if (isUserOptedOut()) {
      showMusicButton();
      updateMusicButtonUi();
      return;
    }
    if (cinemaIntroActive()) return;
    ensureHint();
    armFirstPointer();
    playAudible(true);
    showMusicButton();
  };

  window.__vcHogwartsYoutubeStartFromGesture = function () {
    startFromUserGesture();
  };

  window.__vcHogwartsYoutubeSetupIfConfigured = function () {
    if (!youtubePublicCfg()) return false;
    showMusicButton();
    if (cinemaIntroActive()) return true;
    ensureHint();
    armFirstPointer();
    bootPlayer();
    return true;
  };

  window.__vcHogwartsYoutubePauseForEmbeddedVideo = function () {
    pauseForEmbeddedVideo();
  };

  window.__vcHogwartsYoutubeResumeAfterEmbeddedVideo = function () {
    resumeAfterEmbeddedVideo();
  };

  window.__vcHogwartsYoutubeStop = function () {
    hideHint();
    detachFirstPointer();
    try {
      if (player) player.stopVideo();
    } catch (eSt) {}
    try {
      if (player) player.destroy();
    } catch (eDs) {}
    player = null;
    playerReady = false;
    booting = false;
    started = false;
    mutedByUser = false;
    pausedForEmbeddedVideo = false;
    shouldResumeAfterEmbeddedVideo = false;
    activeVideoIdx = 0;
    ytLoadFailed = false;
    try {
      var h = document.getElementById("vc-hw-yt-host");
      if (h && h.parentNode) h.parentNode.removeChild(h);
    } catch (eH) {}
    updateMusicButtonUi();
  };

  function startDefaultBgm() {
    if (!youtubePublicCfg()) return;
    showMusicButton();
    if (isUserOptedOut()) {
      updateMusicButtonUi();
      return;
    }
    if (cinemaIntroActive()) return;
    ensureHint();
    armFirstPointer();
    try {
      window.__vcHogwartsBgmAllowed = true;
    } catch (eA) {}
    mutedByUser = false;
    playAudible(false);
  }

  document.addEventListener("DOMContentLoaded", function () {
    stopOtherSiteBgm();
    readVolume();
    ensurePlayerShell();
    var btn = document.getElementById("vc-hw-music-btn");
    if (btn) {
      btn.addEventListener("click", function (ev) {
        if (ev) {
          try {
            ev.preventDefault();
          } catch (e0) {}
        }
        if (isAudiblePlaying()) {
          pauseAudible();
          return;
        }
        rememberBgmEnabled(true);
        mutedByUser = false;
        hideHint();
        detachFirstPointer();
        playAudible(true);
      });
    }
    startDefaultBgm();
  });

  window.addEventListener("pagehide", function () {
    try {
      if (typeof window.__vcHogwartsYoutubeStop === "function") {
        window.__vcHogwartsYoutubeStop();
      }
    } catch (ePh) {}
  });

  window.addEventListener("pageshow", function (ev) {
    if (ev && ev.persisted) stopOtherSiteBgm();
  });

  try {
    window.__vcHogwartsBgmAllowed = !isUserOptedOut();
  } catch (e0) {}
})();