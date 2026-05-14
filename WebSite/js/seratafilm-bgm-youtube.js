(function () {
  var hintEl = null;
  var detachFirst = null;
  var started = false;
  var baseVol = 0.34;
  var fadeWindowMs = 120000;
  var player = null;
  var playerReady = false;

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
      var ids = Array.isArray(y.videoIds) ? y.videoIds : [];
      var clean = [];
      for (var i = 0; i < ids.length; i += 1) {
        var id = String(ids[i] || "").trim();
        if (/^[a-zA-Z0-9_-]{11}$/.test(id)) clean.push(id);
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
        var vid = clean[k];
        if (seen[vid]) continue;
        seen[vid] = 1;
        uniq.push(vid);
      }
      return { playlistId: playlistId, videoIds: uniq };
    } catch (e) {
      return null;
    }
  }

  function hideHint() {
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
    if (hintEl) {
      hintEl.textContent = msg || hintEl.textContent;
      return;
    }
    hintEl = document.createElement("div");
    hintEl.className = "vc-seratafilm-bgm-hint";
    hintEl.setAttribute("role", "status");
    hintEl.textContent =
      msg ||
      "Musica di sottofondo da YouTube: tocca la pagina (o premi un tasto) per avviare la riproduzione.";
    document.body.appendChild(hintEl);
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
      function hasYoutubeIframeApiScript() {
        try {
          var nodes = document.getElementsByTagName("script");
          for (var si = 0; si < nodes.length; si += 1) {
            var ssrc = String(nodes[si].src || "");
            if (!ssrc) continue;
            if (/^https:\/\/(www\.)?youtube\.com\/iframe_api/i.test(ssrc)) return true;
            if (/^https:\/\/(www\.)?youtube-nocookie\.com\/iframe_api/i.test(ssrc)) return true;
          }
        } catch (eSc) {}
        return false;
      }
      if (!hasYoutubeIframeApiScript()) {
        var tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        tag.onerror = function () {
          try {
            if (iv) clearInterval(iv);
          } catch (eTag) {}
          if (settled) return;
          settled = true;
          reject(new Error("yt_api"));
        };
        document.head.appendChild(tag);
      }
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
          } catch (eIv2) {}
          if (!settled) {
            settled = true;
            reject(new Error("yt_api_timeout"));
          }
        }
      }, 25);
    });
  }

  function readFadeFromGlobalBgm() {
    try {
      var c = window.__VC_SERATAFILM_BGM || {};
      baseVol = Math.min(1, Math.max(0.02, Number(c.baseVolume) || 0.34));
      var fadeSec = Math.max(5, Math.min(3600, Number(c.fadeStartSeconds) || 120));
      fadeWindowMs = fadeSec * 1000;
    } catch (e4) {}
  }

  function createPlayerAndCue() {
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
            ensureHint("YouTube: impossibile caricare la playlist o i video.");
            return;
          }
          playerReady = true;
          try {
            player.setVolume(Math.round(baseVol * 100));
          } catch (e6) {}
        },
        onError: function (ev) {
          var code = ev && ev.data != null ? String(ev.data) : "?";
          ensureHint(
            "YouTube: riproduzione non disponibile (codice " +
              code +
              "). Prova un altro video o controlla che l'embed sia consentito.",
          );
        },
      },
    };
    var bootstrapId = pub.videoIds.length ? pub.videoIds[0] : "jfKfPfyJRdk";
    opts.videoId = bootstrapId;
    player = new window.YT.Player("vc-seratafilm-yt-player", opts);
  }

  function startFromUserGesture() {
    if (started || !youtubePublicCfg()) return;
    if (!playerReady || !player) {
      ensureHint("Caricamento player YouTube… riprova tra un secondo (o tocca di nuovo).");
      return;
    }
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

  window.__vcSeratafilmYoutubeSetupIfConfigured = function () {
    if (!youtubePublicCfg()) return false;
    readFadeFromGlobalBgm();
    ensureHint();
    armFirstPointer();
    loadYoutubeIframeApi()
      .then(function () {
        if (!youtubePublicCfg()) return;
        if (player) return;
        createPlayerAndCue();
      })
      .catch(function () {
        ensureHint("YouTube: caricamento player fallito. Controlla la connessione.");
      });
    return true;
  };

  window.__vcSeratafilmYoutubeOnTick = function (remainingMs) {
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
    } catch (e9) {}
  };

  window.__vcSeratafilmYoutubeStop = function () {
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
      var h = document.getElementById("vc-seratafilm-yt-host");
      if (h && h.parentNode) h.parentNode.removeChild(h);
    } catch (e12) {}
  };
})();