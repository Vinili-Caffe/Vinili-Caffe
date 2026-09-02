(function () {
  var HINT_AUTO_HIDE_MS = 4500;
  var VOL_PREF_KEY = "vc_seratafilm_bgm_volume_v1";
  var hintEl = null;
  var hintHideTimer = null;
  var detachFirst = null;
  var started = false;
  var mutedByUser = false;
  var baseVol = 0.34;
  var userVol = 0.34;
  var fadeWindowMs = 120000;
  var player = null;
  var playerReady = false;
    var lockedOffForFilm = false;
  var volumeUiBound = false;
  var seekUiBound = false;
  var seekUiTimer = 0;
  var seekDragging = false;

  function seekBySeconds(deltaSec) {
    if (!player || !playerReady) return;
    try {
      var cur = Number(player.getCurrentTime()) || 0;
      var dur = Number(player.getDuration()) || 0;
      var next = Math.max(0, cur + Number(deltaSec || 0));
      if (dur > 0.5) next = Math.min(Math.max(0, dur - 0.35), next);
      player.seekTo(next, true);
      syncSeekSliderUi();
    } catch (eSeek) {}
  }

  function seekToRatio(ratio01) {
    if (!player || !playerReady) return;
    try {
      var dur = Number(player.getDuration()) || 0;
      if (!(dur > 0.5)) return;
      var next = Math.min(Math.max(0, dur - 0.35), Math.max(0, dur * Math.min(1, Math.max(0, Number(ratio01) || 0))));
      player.seekTo(next, true);
    } catch (eRatio) {}
  }

  function syncSeekSliderUi() {
    if (seekDragging) return;
    var seek = document.getElementById("vc-sf-music-seek");
    if (!seek || !player || !playerReady) return;
    try {
      var dur = Number(player.getDuration()) || 0;
      var cur = Number(player.getCurrentTime()) || 0;
      if (!(dur > 0)) return;
      seek.value = String(Math.round((cur / dur) * 1000));
    } catch (eSync) {}
  }

  function startSeekUiLoop() {
    if (seekUiTimer) return;
    seekUiTimer = setInterval(syncSeekSliderUi, 500);
  }

  function stopSeekUiLoop() {
    if (!seekUiTimer) return;
    try {
      clearInterval(seekUiTimer);
    } catch (eCl) {}
    seekUiTimer = 0;
  }

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

  function isHogwartsEventBgmActive() {
    try {
      if (
        window.__vcSeratafilmEventUtils &&
        typeof window.__vcSeratafilmEventUtils.isHogwartsEventWindowActive === "function"
      ) {
        return window.__vcSeratafilmEventUtils.isHogwartsEventWindowActive();
      }
    } catch (eU) {}
    try {
      var c = window.__VC_SERATAFILM_BGM || {};
      var w = c.hogwartsEventWindow;
      if (!w || w.enabled === false) return false;
      var now = Date.now();
      var start = Number(w.startMs);
      var end = Number(w.endMs);
      if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
      return now >= start && now < end;
    } catch (eW) {
      return false;
    }
  }

  function sanitizeVideoIds(raw) {
    var clean = [];
    var list = Array.isArray(raw) ? raw : [];
    for (var i = 0; i < list.length; i += 1) {
      var id = String(list[i] || "").trim();
      if (/^[a-zA-Z0-9_-]{11}$/.test(id)) clean.push(id);
    }
    var uniq = [];
    var seen = {};
    for (var k = 0; k < clean.length; k += 1) {
      if (seen[clean[k]]) continue;
      seen[clean[k]] = 1;
      uniq.push(clean[k]);
    }
    return uniq;
  }

  function youtubePublicCfg() {
    try {
      var bgm = window.__VC_SERATAFILM_BGM || {};
      var y = bgm.youtube;
      if (!y || typeof y !== "object") return null;
      var playlistId = String(y.playlistId || "").trim();
      if (!playlistId && y.playlistUrl) {
        var pu = String(y.playlistUrl || "").trim();
        var plist = pu.match(/[?&]list=([^&#]+)/);
        if (plist) {
          try {
            playlistId = decodeURIComponent(plist[1]).replace(/[^a-zA-Z0-9_-]/g, "");
          } catch (ePl) {
            playlistId = "";
          }
        } else if (/^[a-zA-Z0-9_-]{10,80}$/.test(pu) && /^[A-Z]{2}/.test(pu)) {
          playlistId = pu;
        }
      }
      var useEvent = isHogwartsEventBgmActive();
      var eventIds = sanitizeVideoIds(y.eventVideoIds);
      var defaultIds = sanitizeVideoIds(y.defaultVideoIds);
      var legacyIds = sanitizeVideoIds(y.videoIds);
      var activeIds = [];
      var startSeconds = 0;
      if (useEvent && eventIds.length) {
        activeIds = eventIds;
        startSeconds = Math.max(0, Number(y.eventStartSeconds) || 0);
      } else if (defaultIds.length) {
        activeIds = defaultIds;
        startSeconds = Math.max(0, Number(y.defaultStartSeconds) || 0);
      } else {
        activeIds = legacyIds;
      }
      if (!playlistId && !activeIds.length) return null;
      return { playlistId: playlistId, videoIds: activeIds, startSeconds: startSeconds };
    } catch (e) {
      return null;
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
      } catch (e2) {}
      hintEl = null;
    }, 400);
  }

  function ensureHint(msg) {
    var text = msg || "Tocca per avviare la musica";
    if (hintEl) {
      var txt = hintEl.querySelector(".vc-seratafilm-bgm-hint__txt");
      if (txt) txt.textContent = text;
      else hintEl.textContent = text;
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
    label.textContent = text;
    hintEl.appendChild(ico);
    hintEl.appendChild(label);
    document.body.appendChild(hintEl);
    scheduleHintAutoHide();
  }

  function ensureHost() {
    var wrap = document.getElementById("vc-seratafilm-yt-host");
    if (wrap) return;
    wrap = document.createElement("div");
    wrap.id = "vc-seratafilm-yt-host";
    wrap.setAttribute("aria-hidden", "true");
    wrap.style.cssText =
      "position:fixed;left:-9999px;top:0;width:320px;height:180px;opacity:0.01;pointer-events:none;z-index:0;overflow:hidden";
    document.body.appendChild(wrap);
    var inner = document.createElement("div");
    inner.id = "vc-seratafilm-yt-player";
    wrap.appendChild(inner);
  }

  function youtubeApiScriptSrc() {
    var v = String(window.__vcSeratafilmAssetVersion || "").trim();
    var base = "/js/vc-youtube-iframe-api.js";
    if (v) base += "?v=" + encodeURIComponent(v);
    return base;
  }

  function youtubeApiBlockedHint() {
    try {
      if (window.__vcYoutubeApiBlocked) {
        return "Impossibile caricare YouTube. Consenti cookie/script di terze parti per youtube.com, poi riprova.";
      }
    } catch (eB) {}
    return "Musica non pronta. Controlla connessione o impostazioni privacy del browser, poi riprova.";
  }

  function loadYoutubeIframeApi() {
    if (typeof window.__vcLoadYoutubeIframeApi === "function") {
      return window.__vcLoadYoutubeIframeApi();
    }
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-vc-yt-api="seratafilm"]');
      if (existing) {
        var tries = 0;
        var poll = setInterval(function () {
          tries += 1;
          if (typeof window.__vcLoadYoutubeIframeApi === "function") {
            clearInterval(poll);
            window.__vcLoadYoutubeIframeApi().then(resolve).catch(reject);
            return;
          }
          if (tries >= 80) {
            clearInterval(poll);
            reject(new Error("yt_api"));
          }
        }, 50);
        return;
      }
      var s = document.createElement("script");
      var apiSrc = youtubeApiScriptSrc();
      s.src = typeof window.__vcTrustedScriptURL === "function" ? window.__vcTrustedScriptURL(apiSrc) : apiSrc;
      s.async = true;
      s.dataset.vcYtApi = "seratafilm";
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

  function readFadeFromGlobalBgm() {
    try {
      var c = window.__VC_SERATAFILM_BGM || {};
      var cfgVol = Math.min(1, Math.max(0.02, Number(c.baseVolume) || 0.34));
      var fadeSec = Math.max(5, Math.min(3600, Number(c.fadeStartSeconds) || 120));
      fadeWindowMs = fadeSec * 1000;
      try {
        var sync = window.__VC_CHROME_SYNC && window.__VC_CHROME_SYNC.get();
        if (sync && sync.seratafilmBgm && Number.isFinite(Number(sync.seratafilmBgm.volume))) {
          userVol = Math.min(1, Math.max(0, Number(sync.seratafilmBgm.volume)));
          baseVol = userVol;
          return;
        }
      } catch (eSy) {}
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
    } catch (e4) {}
  }

  function persistVolume(vol) {
    userVol = Math.min(1, Math.max(0, Number(vol) || 0));
    baseVol = userVol;
    try {
      localStorage.setItem(VOL_PREF_KEY, String(Math.round(userVol * 100) / 100));
    } catch (eP) {}
    try {
      if (window.__VC_CHROME_SYNC) {
        window.__VC_CHROME_SYNC.publish({ seratafilmBgm: { volume: userVol } });
      }
    } catch (eS) {}
  }

  function syncVolumeSliderUi() {
    var range = document.getElementById("vc-sf-music-vol");
    if (!range) return;
    range.value = String(Math.round(Math.min(1, Math.max(0, userVol)) * 100));
  }

  function applyVolumeFromUiPct(pct) {
    pct = Math.min(100, Math.max(0, Number(pct) || 0));
    persistVolume(pct / 100);
    if (pct <= 0) {
      mutedByUser = true;
      try {
        if (player) {
          player.pauseVideo();
          if (window.__VC_CHROME_SYNC && window.__VC_CHROME_SYNC.applyYtVolume) {
            window.__VC_CHROME_SYNC.applyYtVolume(player, 0);
          } else {
            player.setVolume(0);
            if (typeof player.mute === "function") player.mute();
          }
        }
      } catch (eZ) {}
      started = false;
      updateMusicButtonUi();
      return;
    }
    mutedByUser = false;
    try {
      if (player && playerReady) {
        if (window.__VC_CHROME_SYNC && window.__VC_CHROME_SYNC.applyYtVolume) {
          window.__VC_CHROME_SYNC.applyYtVolume(player, baseVol);
        } else {
          if (typeof player.unMute === "function") player.unMute();
          player.setVolume(Math.round(baseVol * 100));
        }
      }
    } catch (eV) {}
    if (!started) startFromUserGesture(true);
    updateMusicButtonUi();
  }

  function nudgeVolume(delta) {
    var next = Math.min(1, Math.max(0, userVol + (Number(delta) || 0)));
    applyVolumeFromUiPct(Math.round(next * 100));
  }

  function updateMusicButtonUi() {
    ensurePlayerShell();
    var btn = document.getElementById("vc-sf-music-btn");
    if (!btn) return;
    var ico = btn.querySelector(".fa");
    var playing = started && !mutedByUser;
    if (ico) {
      ico.className = playing ? "fa fa-volume-up" : "fa fa-volume-off";
    }
    btn.setAttribute(
      "aria-label",
      playing ? "Disattiva musica di sottofondo" : "Attiva musica di sottofondo",
    );
    syncVolumeSliderUi();
    try {
      if (window.__VC_CHROME_SYNC) {
        window.__VC_CHROME_SYNC.setMediaSession({
          title: "Musica Serata Film",
          artist: "Vinili & Caffè",
          album: "Serata Film",
          playing: playing,
          artwork: [{ src: "/images/logo.png", sizes: "512x512", type: "image/png" }],
          onPlay: function () {
            mutedByUser = false;
            startFromUserGesture(true);
            updateMusicButtonUi();
          },
          onPause: function () {
            mutedByUser = true;
            try {
              if (player) player.pauseVideo();
            } catch (eP) {}
            updateMusicButtonUi();
          },
          onVolumeDelta: nudgeVolume,
          onSeekForward: function (sec) {
            seekBySeconds(Number(sec) || 10);
          },
          onSeekBackward: function (sec) {
            seekBySeconds(-(Number(sec) || 10));
          },
          onSeekTo: function (details) {
            if (!details) return;
            if (Number.isFinite(Number(details.seekTime))) {
              try {
                player.seekTo(Number(details.seekTime), true);
              } catch (eT) {}
              return;
            }
            if (details.fastSeek == null && Number.isFinite(Number(details.seekRatio))) {
              seekToRatio(Number(details.seekRatio));
            }
          },
        });
      }
    } catch (eMs) {}
  }

  function ensurePlayerShell() {
    var existing = document.getElementById("vc-sf-music-player");
    if (existing) {
      syncVolumeSliderUi();
      startSeekUiLoop();
      return existing;
    }
    var wrap = document.createElement("div");
    wrap.id = "vc-sf-music-player";
    wrap.className = "vc-bgm-player vc-bgm-player--seratafilm";
    wrap.hidden = true;
    wrap.setAttribute("hidden", "");

    var btn = document.createElement("button");
    btn.type = "button";
    btn.id = "vc-sf-music-btn";
    btn.className = "vc-bgm-player__toggle";
    btn.setAttribute("aria-label", "Musica di sottofondo");
    var fi = document.createElement("i");
    fi.className = "fa fa-volume-up";
    fi.setAttribute("aria-hidden", "true");
    btn.appendChild(fi);

    var meta = document.createElement("div");
    meta.className = "vc-bgm-player__meta";
    var label = document.createElement("span");
    label.className = "vc-bgm-player__label";
    label.textContent = "Musica Serata Film";

    var seekRow = document.createElement("div");
    seekRow.className = "vc-bgm-player__seek-row";
    var seek = document.createElement("input");
    seek.type = "range";
    seek.id = "vc-sf-music-seek";
    seek.className = "vc-bgm-player__range";
    seek.min = "0";
    seek.max = "1000";
    seek.step = "1";
    seek.value = "0";
    seek.setAttribute("aria-label", "Posizione brano");
    var fwd = document.createElement("button");
    fwd.type = "button";
    fwd.className = "vc-bgm-player__seek-btn";
    fwd.setAttribute("aria-label", "Avanti 10 secondi");
    fwd.title = "+10s";
    var fwdIco = document.createElement("i");
    fwdIco.className = "fa fa-forward";
    fwdIco.setAttribute("aria-hidden", "true");
    fwd.appendChild(fwdIco);
    seekRow.appendChild(seek);
    seekRow.appendChild(fwd);

    var row = document.createElement("div");
    row.className = "vc-bgm-player__slider-row";
    var icoLo = document.createElement("i");
    icoLo.className = "fa fa-volume-down";
    icoLo.setAttribute("aria-hidden", "true");
    var range = document.createElement("input");
    range.type = "range";
    range.id = "vc-sf-music-vol";
    range.className = "vc-bgm-player__range";
    range.min = "0";
    range.max = "100";
    range.step = "1";
    range.setAttribute("aria-label", "Volume musica");
    var icoHi = document.createElement("i");
    icoHi.className = "fa fa-volume-up";
    icoHi.setAttribute("aria-hidden", "true");
    row.appendChild(icoLo);
    row.appendChild(range);
    row.appendChild(icoHi);
    meta.appendChild(label);
    meta.appendChild(seekRow);
    meta.appendChild(row);
    wrap.appendChild(btn);
    wrap.appendChild(meta);
    document.body.appendChild(wrap);
    try {
      if (window.__VC_CHROME_SYNC) window.__VC_CHROME_SYNC.bindExpandablePlayer(wrap, btn);
    } catch (eEx) {}

    btn.addEventListener("click", function (ev) {
      if (ev) {
        try {
          ev.preventDefault();
          ev.stopPropagation();
        } catch (e0) {}
      }
      if (started && !mutedByUser) {
        mutedByUser = true;
        try {
          if (player) player.pauseVideo();
        } catch (eP) {}
        updateMusicButtonUi();
        return;
      }
      mutedByUser = false;
      startFromUserGesture(true);
      updateMusicButtonUi();
    });

    function onVolInput() {
      applyVolumeFromUiPct(range.value);
    }
    range.addEventListener("input", onVolInput);
    range.addEventListener("change", onVolInput);
    range.addEventListener("pointerdown", function (ev) {
      try {
        ev.stopPropagation();
      } catch (eS) {}
    });
    range.addEventListener(
      "touchstart",
      function (ev) {
        try {
          ev.stopPropagation();
        } catch (eT) {}
      },
      { passive: true },
    );

    if (!seekUiBound) {
      seekUiBound = true;
      fwd.addEventListener("click", function (ev) {
        try {
          ev.preventDefault();
          ev.stopPropagation();
        } catch (eF) {}
        seekBySeconds(10);
        if (!started || mutedByUser) {
          mutedByUser = false;
          startFromUserGesture(true);
        }
      });
      function onSeekPointerDown(ev) {
        seekDragging = true;
        try {
          ev.stopPropagation();
        } catch (eSp) {}
      }
      function onSeekPointerUp() {
        seekDragging = false;
        seekToRatio((Number(seek.value) || 0) / 1000);
        syncSeekSliderUi();
      }
      seek.addEventListener("pointerdown", onSeekPointerDown);
      seek.addEventListener("mousedown", onSeekPointerDown);
      seek.addEventListener("touchstart", onSeekPointerDown, { passive: true });
      seek.addEventListener("pointerup", onSeekPointerUp);
      seek.addEventListener("change", onSeekPointerUp);
      seek.addEventListener("input", function () {
        if (!seekDragging) return;
        seekToRatio((Number(seek.value) || 0) / 1000);
      });
    }

    volumeUiBound = true;
    syncVolumeSliderUi();
    startSeekUiLoop();
    return wrap;
  }

  function showMusicPlayer() {
    var wrap = ensurePlayerShell();
    if (!wrap) return;
    wrap.hidden = false;
    wrap.removeAttribute("hidden");
    updateMusicButtonUi();
  }

  function createPlayerAndCue() {
    if (lockedOffForFilm || isProjectionBlockingBgm()) return;
    var pub = youtubePublicCfg();
    if (!pub) return;
    ensureHost();
    var playerVars = {
      playsinline: 1,
      controls: 0,
      rel: 0,
      modestbranding: 1,
      fs: 0,
      disablekb: 1,
      enablejsapi: 1,
    };
    try {
      var originStr = String(window.location.origin || "").trim();
      if (originStr) playerVars.origin = originStr;
    } catch (eOr) {}
    var opts = {
      host: window.__vcYoutubePlayerHost || "https://www.youtube.com",
      height: "180",
      width: "320",
      playerVars: playerVars,
      events: {
        onReady: function () {
          try {
            if (pub.playlistId) {
              player.cuePlaylist(pub.playlistId, 0, 0);
            } else if (pub.videoIds.length > 1) {
              player.cuePlaylist(pub.videoIds, 0, 0);
            } else if (pub.videoIds.length === 1) {
              player.cueVideoById(pub.videoIds[0], pub.startSeconds || 0);
            }
          } catch (e5) {
            ensureHint("Playlist YouTube non disponibile.");
            return;
          }
          playerReady = true;
          try {
            player.setVolume(Math.round(baseVol * 100));
          } catch (e6) {}
          startSeekUiLoop();
          syncSeekSliderUi();
        },
        onError: function (ev) {
          var code = ev && ev.data != null ? ev.data : "?";
          var c = Number(code);
          if (c === 101 || c === 150 || c === 153) {
            ensureHint("Questo brano non può essere riprodotto qui.");
            return;
          }
          ensureHint("Musica non disponibile al momento. Tocca per riprovare.");
        },
      },
    };
    var bootstrapId = pub.videoIds.length ? pub.videoIds[0] : "";
    if (!bootstrapId && !pub.playlistId) return;
    opts.videoId = bootstrapId;
    player = new window.YT.Player("vc-seratafilm-yt-player", opts);
  }

  function bootPlayerFromGesture(force) {
    if (!youtubePublicCfg()) return Promise.resolve(false);
    if (playerReady && player) return Promise.resolve(true);
    return loadYoutubeIframeApi()
      .then(function () {
        if (!youtubePublicCfg()) return false;
        if (!player) createPlayerAndCue();
        return new Promise(function (resolve) {
          var n = 0;
          var poll = setInterval(function () {
            n += 1;
            if (playerReady && player) {
              clearInterval(poll);
              resolve(true);
              return;
            }
            if (n >= 120) {
              clearInterval(poll);
              resolve(false);
            }
          }, 50);
        });
      })
      .catch(function () {
        return false;
      });
  }

  function startFromUserGesture(force) {
    if (lockedOffForFilm || isProjectionBlockingBgm()) return;
    if (!force && (started || !youtubePublicCfg())) return;
    if (!youtubePublicCfg()) return;
    if (!playerReady || !player) {
      ensureHint("Caricamento musica…");
      bootPlayerFromGesture(force).then(function (ok) {
        if (ok) startFromUserGesture(force);
        else ensureHint(youtubeApiBlockedHint());
      });
      return;
    }
    started = true;
    mutedByUser = false;
    hideHint();
    if (typeof detachFirst === "function") {
      detachFirst();
      detachFirst = null;
    }
    try {
      player.unMute();
      player.setVolume(Math.round(baseVol * 100));
      player.playVideo();
    } catch (e8) {}
    showMusicPlayer();
    updateMusicButtonUi();
  }

  function armFirstPointer() {
    detachFirst = function () {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey, true);
    };
    function onPointer(ev) {
      if (ev && ev.target && ev.target.closest && ev.target.closest("#vc-sf-music-player")) return;
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

  window.__vcSeratafilmYoutubeSetupIfConfigured = function () {
    if (!youtubePublicCfg()) return false;
    readFadeFromGlobalBgm();
    showMusicPlayer();
    try {
      if (window.__VC_CHROME_SYNC && !window.__VC_CHROME_SYNC.__sfSub) {
        window.__VC_CHROME_SYNC.__sfSub = true;
        window.__VC_CHROME_SYNC.subscribe(function (prefs) {
          if (!prefs || !prefs.seratafilmBgm) return;
          if (!Number.isFinite(Number(prefs.seratafilmBgm.volume))) return;
          userVol = Math.min(1, Math.max(0, Number(prefs.seratafilmBgm.volume)));
          baseVol = userVol;
          try {
            localStorage.setItem(VOL_PREF_KEY, String(Math.round(userVol * 100) / 100));
          } catch (eV) {}
          syncVolumeSliderUi();
          updateMusicButtonUi();
        });
      }
    } catch (eSub) {}
    ensureHint();
    armFirstPointer();
    loadYoutubeIframeApi()
      .then(function () {
        if (!youtubePublicCfg()) return;
        if (player) return;
        createPlayerAndCue();
      })
      .catch(function () {
        ensureHint(youtubeApiBlockedHint());
      });
    return true;
  };

  window.__vcSeratafilmYoutubeOnTick = function (remainingMs) {
    if (lockedOffForFilm || isProjectionBlockingBgm() || mutedByUser) {
      try {
        if (player && playerReady) {
          player.pauseVideo();
          player.setVolume(0);
        }
      } catch (eLock) {}
      return;
    }
    if (!player || !playerReady) return;
    var r = Number(remainingMs);
    var vol = baseVol;
    if (!Number.isFinite(r) || r <= 0) vol = 0;
    else if (r < fadeWindowMs) {
      var t = r / fadeWindowMs;
      var shaped = Math.pow(Math.max(0, Math.min(1, t)), 1.48);
      vol = Math.max(0, Math.min(1, baseVol * shaped));
    }
    try {
      player.setVolume(Math.round(vol * 100));
      if (vol > 0.001 && typeof player.unMute === "function") player.unMute();
    } catch (e9) {}
  };

  window.addEventListener("pagehide", function () {
    try {
      if (typeof window.__vcSeratafilmYoutubeStop === "function") {
        window.__vcSeratafilmYoutubeStop();
      }
    } catch (ePh) {}
  });

  window.__vcSeratafilmYoutubeStop = function () {
    lockedOffForFilm = true;
    hideHint();
    if (typeof detachFirst === "function") {
      detachFirst();
      detachFirst = null;
    }
    try {
      if (player) player.pauseVideo();
    } catch (ePause) {}
    try {
      if (player) player.stopVideo();
    } catch (e10) {}
    try {
      if (player) player.destroy();
    } catch (e11) {}
    player = null;
    playerReady = false;
    started = false;
    try {
      var h = document.getElementById("vc-seratafilm-yt-host");
      if (h && h.parentNode) h.parentNode.removeChild(h);
    } catch (e12) {}
    try {
      var wrap = document.getElementById("vc-sf-music-player");
      if (wrap) {
        wrap.hidden = true;
        wrap.setAttribute("hidden", "");
      }
    } catch (eW) {}
  };
})();