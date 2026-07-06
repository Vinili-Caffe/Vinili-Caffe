(function () {
  var hintEl = null;
  var detachFirst = null;
  var started = false;
  var baseVol = 0.34;
  var fadeWindowMs = 120000;
  var player = null;
  var playerReady = false;

  function isHogwartsEventBgmActive() {
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

  function youtubeApiScriptSrc() {
    try {
      var scripts = document.getElementsByTagName("script");
      for (var i = 0; i < scripts.length; i += 1) {
        var src = String(scripts[i].src || "");
        if (/seratafilm-bgm-youtube\.js/.test(src)) {
          return src.replace(/seratafilm-bgm-youtube\.js.*$/, "vc-youtube-iframe-api.js");
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
      host: window.__vcYoutubePlayerHost || "https://www.youtube-nocookie.com",
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
            "YouTube bloccato (codice " +
              code +
              "). Consenti youtube-nocookie.com / youtube.com per questo sito (ad-blocker).",
          );
        },
      },
    };
    var bootstrapId = pub.videoIds.length ? pub.videoIds[0] : "";
    if (!bootstrapId && !pub.playlistId) return;
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
        ensureHint("YouTube non caricato: connessione o ad-blocker. Consenti youtube-nocookie.com per questo sito.");
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

  window.addEventListener("pagehide", function () {
    try {
      if (typeof window.__vcSeratafilmYoutubeStop === "function") {
        window.__vcSeratafilmYoutubeStop();
      }
    } catch (ePh) {}
  });

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