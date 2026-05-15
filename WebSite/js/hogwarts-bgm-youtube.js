(function () {
  var hintEl = null;
  var detachFirst = null;
  var listenersArmed = false;
  var started = false;
  var pendingGesture = false;
  var holdMutedUntilIntroEnd = false;
  var playAudibleAfterIntro = false;
  var baseVol = 0.2;
  var player = null;
  var playerReady = false;
  var playerBooting = false;

  function youtubePublicCfg() {
    try {
      var bgm = window.__VC_HOGWARTS_BGM || {};
      var y = bgm.youtube;
      if (!y || typeof y !== "object") return null;
      var playlistId = String(y.playlistId || "").trim();
      if (!playlistId && y.playlistUrl) {
        var rawPl = y.playlistUrl;
        var pu = Array.isArray(rawPl) ? String(rawPl[0] || "").trim() : String(rawPl || "").trim();
        var plist = pu.match(/[?&]list=([^&#]+)/);
        if (plist) {
          try {
            playlistId = decodeURIComponent(plist[1]).replace(/[^a-zA-Z0-9_-]/g, "");
          } catch (ePl) {
            playlistId = "";
          }
        }
      }
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
            s.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})(?:[?]|$|#)/) ||
            s.match(/youtube-nocookie\.com\/embed\/([a-zA-Z0-9_-]{11})(?:[?]|$|#)/);
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

  function hideHint() {
    if (!hintEl) return;
    hintEl.classList.add("vc-hw-bgm-hint--hide");
    setTimeout(function () {
      try {
        if (hintEl && hintEl.parentNode) hintEl.parentNode.removeChild(hintEl);
      } catch (e2) {}
      hintEl = null;
    }, 400);
  }

  function ensureHint(msg) {
    if (!bgmAllowedNow()) return;
    var text =
      msg ||
      "Tocca qui per la musica di sottofondo (richiesto dal browser).";
    if (hintEl) {
      var spanUpd = hintEl.querySelector(".vc-hw-bgm-hint-text");
      if (spanUpd) spanUpd.textContent = text;
      return;
    }
    hintEl = document.createElement("button");
    hintEl.type = "button";
    hintEl.className = "vc-hw-bgm-hint";
    hintEl.setAttribute("aria-label", "Avvia musica di sottofondo");
    hintEl.innerHTML =
      '<span class="vc-hw-bgm-hint-ico" aria-hidden="true"><i class="fa fa-volume-up"></i></span>' +
      '<span class="vc-hw-bgm-hint-text">' +
      text +
      "</span>";
    hintEl.addEventListener("click", function (ev) {
      if (ev) {
        try {
          ev.preventDefault();
          ev.stopPropagation();
        } catch (e0) {}
      }
      startFromUserGesture();
    });
    document.body.appendChild(hintEl);
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

  function loadYoutubeIframeApi() {
    return new Promise(function (resolve, reject) {
      if (window.YT && window.YT.Player) {
        resolve();
        return;
      }
      var settled = false;
      var iv = null;
      function done() {
        if (settled) return;
        settled = true;
        try {
          if (iv) clearInterval(iv);
        } catch (eCl) {}
        resolve();
      }
      var prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () {
        try {
          if (typeof prev === "function") prev();
        } catch (e3) {}
        done();
      };
      var tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      tag.onerror = function () {
        if (!settled) {
          settled = true;
          reject(new Error("yt_api"));
        }
      };
      var hasApi = false;
      try {
        var nodes = document.getElementsByTagName("script");
        for (var si = 0; si < nodes.length; si += 1) {
          if (/youtube\.com\/iframe_api/i.test(String(nodes[si].src || ""))) {
            hasApi = true;
            break;
          }
        }
      } catch (eSc) {}
      if (!hasApi) document.head.appendChild(tag);
      var n = 0;
      iv = setInterval(function () {
        if (window.YT && window.YT.Player) {
          done();
          return;
        }
        n += 1;
        if (n >= 400) {
          try {
            if (iv) clearInterval(iv);
          } catch (eIv) {}
          if (!settled) {
            settled = true;
            reject(new Error("yt_api_timeout"));
          }
        }
      }, 25);
    });
  }

  function readVolumeFromCfg() {
    try {
      var c = window.__VC_HOGWARTS_BGM || {};
      baseVol = Math.min(1, Math.max(0.02, Number(c.baseVolume) || 0.2));
    } catch (e4) {}
  }

  function createPlayerAndCue() {
    var pub = youtubePublicCfg();
    if (!pub) return;
    ensureHost();
    var bootVid = pub.videoIds.length ? pub.videoIds[0] : "jfKfPfyJRdk";
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
      var originStr = String(window.location.origin || "").trim();
      if (originStr) playerVars.origin = originStr;
    } catch (eOr) {}
    var opts = {
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
            }
          } catch (e5) {
            ensureHint("YouTube: impossibile caricare il video.");
            return;
          }
          playerReady = true;
          playerBooting = false;
          try {
            player.setVolume(Math.round(baseVol * 100));
          } catch (e6) {}
          if (playAudibleAfterIntro) {
            startAudibleAfterIntro();
          } else if (holdMutedUntilIntroEnd && pendingGesture) {
            tryPlayMuted();
          } else if (pendingGesture) {
            tryPlayFromGesture();
          }
        },
        onError: function (ev) {
          if (!bgmAllowedNow()) return;
          var code = ev && ev.data != null ? Number(ev.data) : 0;
          var embedBlocked = code === 101 || code === 150;
          if (embedBlocked && pub.playlistId && player && typeof player.nextVideo === "function") {
            try {
              player.nextVideo();
              return;
            } catch (eNext) {}
          }
          if (embedBlocked && pub.videoIds.length > 1) {
            try {
              var cur = player && player.getVideoData ? player.getVideoData() : null;
              var curId = cur && cur.video_id ? String(cur.video_id) : "";
              var idx = pub.videoIds.indexOf(curId);
              var nextIdx = idx >= 0 ? idx + 1 : 1;
              if (nextIdx < pub.videoIds.length) {
                player.loadVideoById(pub.videoIds[nextIdx]);
                return;
              }
            } catch (eVid) {}
          }
          playerBooting = false;
          pendingGesture = false;
          holdMutedUntilIntroEnd = false;
          playAudibleAfterIntro = false;
          ensureHint(
            "Musica non disponibile (codice " +
              String(code) +
              "). Cambia playlist in site.config: servono brani con embed consentito.",
          );
        },
        onStateChange: function (ev) {
          try {
            if (ev && ev.data === window.YT.PlayerState.PLAYING) {
              if (holdMutedUntilIntroEnd) {
                try {
                  player.mute();
                } catch (eMu) {}
                return;
              }
              markBgmStarted();
            }
            if (ev && ev.data === window.YT.PlayerState.ENDED && pub.videoIds.length === 1) {
              player.seekTo(0, true);
              player.playVideo();
            }
          } catch (eLoop) {}
        },
      },
    };
    opts.videoId = bootVid;
    playerBooting = true;
    player = new window.YT.Player("vc-hw-yt-player", opts);
  }

  function markBgmStarted() {
    if (started) return;
    started = true;
    pendingGesture = false;
    playAudibleAfterIntro = false;
    hideHint();
    if (typeof detachFirst === "function") {
      detachFirst();
      detachFirst = null;
    }
  }

  function tryPlayMuted() {
    if (!pendingGesture || !playerReady || !player) return;
    try {
      player.mute();
      player.playVideo();
    } catch (eMu2) {}
  }

  function tryPlayFromGesture() {
    if (started || !pendingGesture || !playerReady || !player) return;
    try {
      player.unMute();
      player.setVolume(Math.round(baseVol * 100));
      player.playVideo();
    } catch (e8) {
      ensureHint("Tocca di nuovo per avviare la musica.");
    }
  }

  function bgmAllowedNow() {
    try {
      return window.__vcHogwartsBgmAllowed === true;
    } catch (eA) {}
    return false;
  }

  function introStillPlaying() {
    try {
      if (window.__vcHogwartsIntroCompleted === true) return false;
    } catch (eI) {}
    try {
      if (typeof window.__vcHogwartsIntroIsRunning === "function" && window.__vcHogwartsIntroIsRunning()) {
        return true;
      }
    } catch (eR) {}
    var cinema = document.getElementById("vc-hw-cinema");
    if (cinema && !cinema.hidden) return true;
    return false;
  }

  function startAudibleAfterIntro() {
    if (!youtubePublicCfg()) return;
    if (started || introStillPlaying()) return;
    try {
      window.__vcHogwartsBgmAllowed = true;
    } catch (eAl) {}
    holdMutedUntilIntroEnd = false;
    playAudibleAfterIntro = true;
    pendingGesture = true;
    hideHint();
    ensurePlayerBoot();
    if (!playerReady || !player) return;
    tryPlayFromGesture();
  }

  function startFromUserGesture() {
    if (!bgmAllowedNow() || introStillPlaying()) return;
    if (started || !youtubePublicCfg()) return;
    pendingGesture = true;
    ensurePlayerBoot();
    if (!playerReady || !player) {
      ensureHint("Caricamento musica… tocca di nuovo se non parte.");
      return;
    }
    tryPlayFromGesture();
  }

  function ensurePlayerBoot() {
    if (!bgmAllowedNow() || !youtubePublicCfg() || player || playerBooting) return;
    readVolumeFromCfg();
    loadYoutubeIframeApi()
      .then(function () {
        if (!youtubePublicCfg() || player) return;
        createPlayerAndCue();
      })
      .catch(function () {
        ensureHint("Impossibile caricare il player YouTube.");
      });
  }

  function armFirstPointer() {
    if (listenersArmed) return;
    listenersArmed = true;
    detachFirst = function () {
      listenersArmed = false;
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey, true);
    };
    function onPointer(ev) {
      if (ev && ev.target) {
        var cinema = document.getElementById("vc-hw-cinema");
        if (cinema && cinema.contains(ev.target)) return;
      }
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

  window.__vcHogwartsYoutubeSetupIfConfigured = function () {
    if (!youtubePublicCfg()) return false;
    readVolumeFromCfg();
    ensurePlayerBoot();
    if (bgmAllowedNow()) startAudibleAfterIntro();
    return true;
  };

  window.__vcHogwartsYoutubeStartFromGesture = startFromUserGesture;
  window.__vcHogwartsYoutubeStartAfterIntro = startAudibleAfterIntro;

  try {
    window.__vcHogwartsBgmAllowed = false;
  } catch (eBoot0) {}

  window.__vcHogwartsYoutubeStop = function () {
    hideHint();
    if (typeof detachFirst === "function") {
      detachFirst();
      detachFirst = null;
    }
    try {
      if (player) player.stopVideo();
    } catch (e10) {}
    try {
      if (player) player.destroy();
    } catch (e11) {}
    player = null;
    playerReady = false;
    playerBooting = false;
    started = false;
    pendingGesture = false;
    holdMutedUntilIntroEnd = false;
    playAudibleAfterIntro = false;
    listenersArmed = false;
    try {
      var h = document.getElementById("vc-hw-yt-host");
      if (h && h.parentNode) h.parentNode.removeChild(h);
    } catch (e12) {}
  };
})();