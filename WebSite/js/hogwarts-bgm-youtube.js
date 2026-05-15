(function () {
  var hintEl = null;
  var detachFirst = null;
  var started = false;
  var baseVol = 0.2;
  var player = null;
  var playerReady = false;

  function youtubePublicCfg() {
    try {
      var bgm = window.__VC_HOGWARTS_BGM || {};
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
    if (hintEl) {
      hintEl.textContent = msg || hintEl.textContent;
      return;
    }
    hintEl = document.createElement("div");
    hintEl.className = "vc-hw-bgm-hint";
    hintEl.setAttribute("role", "status");
    hintEl.innerHTML =
      '<span class="vc-hw-bgm-hint-ico" aria-hidden="true"><i class="fa fa-volume-up"></i></span>' +
      '<span class="vc-hw-bgm-hint-text">' +
      (msg ||
        "Musica di sottofondo: tocca la pagina o premi un tasto per avviare la riproduzione.") +
      "</span>";
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
    var bootVid = pub.videoIds.length ? pub.videoIds[0] : "wtHra9tFISY";
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
          try {
            player.setVolume(Math.round(baseVol * 100));
          } catch (e6) {}
        },
        onError: function (ev) {
          var code = ev && ev.data != null ? String(ev.data) : "?";
          ensureHint("YouTube non disponibile (codice " + code + "). Il video potrebbe non permettere l'embed.");
        },
        onStateChange: function (ev) {
          try {
            if (ev && ev.data === window.YT.PlayerState.ENDED && pub.videoIds.length === 1) {
              player.seekTo(0, true);
              player.playVideo();
            }
          } catch (eLoop) {}
        },
      },
    };
    opts.videoId = bootVid;
    player = new window.YT.Player("vc-hw-yt-player", opts);
  }

  var startRetryTimer = null;

  function startFromUserGesture() {
    if (started || !youtubePublicCfg()) return;
    if (!playerReady || !player) {
      ensureHint("Caricamento musica… tocca di nuovo tra un attimo.");
      try {
        if (startRetryTimer) clearTimeout(startRetryTimer);
      } catch (eRt) {}
      startRetryTimer = setTimeout(function () {
        startRetryTimer = null;
        if (!started) startFromUserGesture();
      }, 700);
      return;
    }
    try {
      if (startRetryTimer) clearTimeout(startRetryTimer);
    } catch (eRt2) {}
    startRetryTimer = null;
    started = true;
    hideHint();
    if (typeof detachFirst === "function") {
      detachFirst();
      detachFirst = null;
    }
    try {
      player.playVideo();
    } catch (e8) {}
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

  window.__vcHogwartsYoutubeSetupIfConfigured = function () {
    if (!youtubePublicCfg()) return false;
    readVolumeFromCfg();
    ensureHint();
    armFirstPointer();
    loadYoutubeIframeApi()
      .then(function () {
        if (!youtubePublicCfg()) return;
        if (player) return;
        createPlayerAndCue();
      })
      .catch(function () {
        ensureHint("Impossibile caricare il player YouTube.");
      });
    return true;
  };

  function autoBootBgm() {
    try {
      if (typeof window.__vcHogwartsYoutubeSetupIfConfigured === "function") {
        window.__vcHogwartsYoutubeSetupIfConfigured();
      }
    } catch (eBoot) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoBootBgm);
  } else {
    autoBootBgm();
  }

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
    started = false;
    try {
      var h = document.getElementById("vc-hw-yt-host");
      if (h && h.parentNode) h.parentNode.removeChild(h);
    } catch (e12) {}
  };
})();