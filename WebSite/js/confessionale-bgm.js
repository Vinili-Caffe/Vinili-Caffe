(function () {
  var VER = "20260909confessionale8";
  var VOL_PREF_KEY = "vc_confessionale_bgm_volume_v1";
  var MUTE_PREF_KEY = "vc_confessionale_bgm_muted_v1";
  var audio = null;
  var started = false;
  var mutedByUser = false;
  var baseVol = 0.34;
  var userVol = 0.34;
  var detachUnlock = null;
  var hintEl = null;
  var hintHideTimer = null;
  var playerEl = null;
  var toggleBtn = null;
  var labelEl = null;
  var volRange = null;
  var HINT_AUTO_HIDE_MS = 5200;

  function cfg() {
    try {
      return window.__VC_CONFESSIONALE_BGM || {};
    } catch (e) {
      return {};
    }
  }

  function trackUrl() {
    var c = cfg();
    var raw = c.trackUrls;
    if (Array.isArray(raw) && raw.length) {
      var u = String(raw[0] || "").trim();
      if (u) return u;
    }
    var single = String(c.trackUrl || c.src || "").trim();
    if (single) return single;
    return "/audio/confessionale-bgm.mp3?v=" + VER;
  }

  function playerLabel() {
    var c = cfg();
    var lab = String(c.playerLabel || c.label || "").trim();
    return lab || "Musica confessionale";
  }

  function readVolumePrefs() {
    var c = cfg();
    var cfgVol = Math.min(1, Math.max(0.02, Number(c.baseVolume) || 0.34));
    try {
      var sync = window.__VC_CHROME_SYNC && window.__VC_CHROME_SYNC.get();
      if (sync && sync.confessionaleBgm && Number.isFinite(Number(sync.confessionaleBgm.volume))) {
        userVol = Math.min(1, Math.max(0, Number(sync.confessionaleBgm.volume)));
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
  }

  function persistVolume(vol) {
    userVol = Math.min(1, Math.max(0, Number(vol) || 0));
    baseVol = userVol;
    try {
      localStorage.setItem(VOL_PREF_KEY, String(Math.round(userVol * 100) / 100));
    } catch (eP) {}
    try {
      if (window.__VC_CHROME_SYNC) {
        window.__VC_CHROME_SYNC.publish({ confessionaleBgm: { volume: userVol } });
      }
    } catch (eS) {}
  }

  function clearHintAutoHide() {
    if (hintHideTimer) {
      clearTimeout(hintHideTimer);
      hintHideTimer = null;
    }
  }

  function hideHint() {
    clearHintAutoHide();
    if (!hintEl) return;
    hintEl.classList.add("vc-seratafilm-bgm-hint--hide");
    setTimeout(function () {
      try {
        if (hintEl && hintEl.parentNode) hintEl.parentNode.removeChild(hintEl);
      } catch (e) {}
      hintEl = null;
    }, 400);
  }

  function ensureHint(msg) {
    var text = msg || "Tocca per attivare l’audio";
    if (hintEl) {
      var txt = hintEl.querySelector(".vc-seratafilm-bgm-hint__txt");
      if (txt) txt.textContent = text;
      clearHintAutoHide();
      hintHideTimer = setTimeout(hideHint, HINT_AUTO_HIDE_MS);
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
    hintHideTimer = setTimeout(hideHint, HINT_AUTO_HIDE_MS);
  }

  function ensureAudio() {
    if (audio) return audio;
    try {
      if (window.__VC_CONFESSIONALE_BGM_AUDIO) {
        audio = window.__VC_CONFESSIONALE_BGM_AUDIO;
      }
    } catch (ePre) {}
    if (!audio) {
      audio = document.getElementById("vc-confessionale-bgm-audio");
    }
    if (!audio) {
      audio = document.createElement("audio");
      audio.id = "vc-confessionale-bgm-audio";
      try {
        document.body.appendChild(audio);
      } catch (eApp) {}
    }
    audio.preload = "auto";
    audio.loop = true;
    audio.setAttribute("loop", "");
    audio.setAttribute("playsinline", "");
    audio.setAttribute("autoplay", "");
    audio.playsInline = true;
    if (!audio.getAttribute("src") && !audio.src) {
      audio.src = trackUrl();
    }
    audio.volume = Math.max(0, Math.min(1, baseVol));
    window.__VC_CONFESSIONALE_BGM_AUDIO = audio;
    return audio;
  }

  function updateUi() {
    var playing = started && !mutedByUser && audio && !audio.paused;
    if (toggleBtn) {
      toggleBtn.classList.toggle("is-muted", !playing);
      toggleBtn.setAttribute(
        "aria-label",
        playing ? "Disattiva musica confessionale" : "Attiva musica confessionale",
      );
      var ico = toggleBtn.querySelector("i");
      if (ico) ico.className = playing ? "fa fa-volume-up" : "fa fa-volume-off";
    }
    if (playerEl) playerEl.classList.toggle("is-muted", !playing);
    if (labelEl) labelEl.textContent = playerLabel();
    if (volRange) volRange.value = String(Math.round(userVol * 100));
  }

  function applyAudible() {
    var a = ensureAudio();
    a.muted = false;
    a.volume = Math.max(0, Math.min(1, baseVol));
    var p = a.play();
    if (p && typeof p.then === "function") {
      return p.then(function () {
        started = true;
        mutedByUser = false;
        hideHint();
        updateUi();
        if (typeof detachUnlock === "function") {
          detachUnlock();
          detachUnlock = null;
        }
      });
    }
    started = true;
    mutedByUser = false;
    hideHint();
    updateUi();
    return Promise.resolve();
  }

  function stopAudible() {
    mutedByUser = true;
    if (!audio) return;
    try {
      audio.pause();
    } catch (eP) {}
    try {
      localStorage.setItem(MUTE_PREF_KEY, "1");
    } catch (eM) {}
    updateUi();
  }

  function startAudibleFromGesture() {
    try {
      localStorage.removeItem(MUTE_PREF_KEY);
    } catch (eR) {}
    return applyAudible().catch(function () {
      ensureHint("Tocca di nuovo per attivare l’audio");
    });
  }

  function ensurePlayer() {
    if (playerEl) return;
    var wrap = document.createElement("div");
    wrap.id = "vc-confessionale-music-player";
    wrap.className = "vc-bgm-player vc-bgm-player--confessionale";
    wrap.hidden = false;

    var btn = document.createElement("button");
    btn.type = "button";
    btn.id = "vc-confessionale-music-btn";
    btn.className = "vc-bgm-player__toggle";
    btn.setAttribute("aria-label", "Musica confessionale");
    var fi = document.createElement("i");
    fi.className = "fa fa-volume-up";
    fi.setAttribute("aria-hidden", "true");
    btn.appendChild(fi);

    var meta = document.createElement("div");
    meta.className = "vc-bgm-player__meta";
    var label = document.createElement("span");
    label.className = "vc-bgm-player__label";
    label.textContent = playerLabel();

    var row = document.createElement("div");
    row.className = "vc-bgm-player__slider-row";
    var icoLo = document.createElement("i");
    icoLo.className = "fa fa-volume-down";
    icoLo.setAttribute("aria-hidden", "true");
    var range = document.createElement("input");
    range.type = "range";
    range.id = "vc-confessionale-music-vol";
    range.className = "vc-bgm-player__range";
    range.min = "0";
    range.max = "100";
    range.step = "1";
    range.setAttribute("aria-label", "Volume musica confessionale");
    var icoHi = document.createElement("i");
    icoHi.className = "fa fa-volume-up";
    icoHi.setAttribute("aria-hidden", "true");
    row.appendChild(icoLo);
    row.appendChild(range);
    row.appendChild(icoHi);
    meta.appendChild(label);
    meta.appendChild(row);
    wrap.appendChild(btn);
    wrap.appendChild(meta);
    document.body.appendChild(wrap);

    playerEl = wrap;
    toggleBtn = btn;
    labelEl = label;
    volRange = range;

    try {
      if (window.__VC_CHROME_SYNC) {
        window.__VC_CHROME_SYNC.bindExpandablePlayer(wrap, btn);
      } else {
        window.setTimeout(function () {
          try {
            if (window.__VC_CHROME_SYNC && playerEl) {
              window.__VC_CHROME_SYNC.bindExpandablePlayer(playerEl, toggleBtn);
            }
          } catch (eRetry) {}
        }, 400);
      }
    } catch (eEx) {}

    btn.addEventListener("click", function (ev) {
      if (ev) {
        try {
          ev.preventDefault();
          ev.stopPropagation();
        } catch (e0) {}
      }
      if (started && !mutedByUser && audio && !audio.paused) {
        stopAudible();
        return;
      }
      startAudibleFromGesture();
    });

    function onVolInput() {
      var pct = Number(range.value);
      if (!Number.isFinite(pct)) return;
      persistVolume(pct / 100);
      if (audio && !audio.muted) audio.volume = baseVol;
      updateUi();
    }
    range.addEventListener("input", onVolInput);
    range.addEventListener("change", onVolInput);
    updateUi();
  }

  function armUnlockGesture() {
    if (detachUnlock) return;
    function onUnlock() {
      startAudibleFromGesture();
    }
    detachUnlock = function () {
      document.removeEventListener("pointerdown", onUnlock, true);
      document.removeEventListener("keydown", onUnlock, true);
    };
    document.addEventListener("pointerdown", onUnlock, true);
    document.addEventListener("keydown", onUnlock, true);
  }

  function tryMutedAutoplayThenAudible() {
    var a = ensureAudio();
    /* Prima prova autoplay udibile (Chrome a volte lo consente con gesture precedente / media engagement). */
    a.muted = false;
    a.volume = Math.max(0, Math.min(1, baseVol));
    var pAud = a.play();
    function okAudible() {
      started = true;
      mutedByUser = false;
      hideHint();
      updateUi();
      if (typeof detachUnlock === "function") {
        detachUnlock();
        detachUnlock = null;
      }
    }
    function fallbackMutedPrime() {
      a.muted = true;
      a.volume = 0;
      var p = a.play();
      function afterMutedPlay() {
        started = true;
        a.loop = true;
        a.muted = false;
        a.volume = Math.max(0, Math.min(1, baseVol));
        var p2 = a.play();
        if (p2 && typeof p2.then === "function") {
          p2
            .then(okAudible)
            .catch(function () {
              try {
                a.muted = true;
              } catch (eM) {}
              ensureHint("Tocca per attivare l’audio");
              armUnlockGesture();
              updateUi();
            });
        } else {
          okAudible();
        }
      }
      if (p && typeof p.then === "function") {
        p.then(afterMutedPlay).catch(function () {
          ensureHint("Tocca per attivare l’audio");
          armUnlockGesture();
          updateUi();
        });
      } else {
        afterMutedPlay();
      }
    }
    if (pAud && typeof pAud.then === "function") {
      pAud.then(okAudible).catch(fallbackMutedPrime);
    } else {
      okAudible();
    }
  }

  var playerBooted = false;

  function unlockFromUserGesture() {
    try {
      localStorage.removeItem(MUTE_PREF_KEY);
    } catch (eR) {}
    mutedByUser = false;
    if (document.body) ensurePlayer();
    return startAudibleFromGesture();
  }

  function bootWhenReady() {
    if (!document.body || !document.body.classList.contains("vc-confessionale-page")) return false;
    readVolumePrefs();
    ensurePlayer();
    var introDone =
      document.documentElement.classList.contains("vc-confessionale-curtain-done") ||
      document.body.classList.contains("vc-confessionale-curtain-done");
    var staffReady = document.documentElement.classList.contains("vc-staff-app-revealed");

    /* Non aspettare staff-revealed per l'audio: altrimenti si perde la gesture del click nav. */
    if (!playerBooted) {
      playerBooted = true;
      try {
        if (localStorage.getItem(MUTE_PREF_KEY) === "1") {
          mutedByUser = true;
          ensureAudio();
          updateUi();
        }
      } catch (ePref0) {}
      if (!mutedByUser) {
        tryMutedAutoplayThenAudible();
        armUnlockGesture();
      }
    }

    if (!introDone) {
      return false;
    }
    if (!staffReady) return false;

    if (started && !mutedByUser && audio && !audio.paused && !audio.muted) {
      updateUi();
      return true;
    }
    try {
      if (localStorage.getItem(MUTE_PREF_KEY) === "1") {
        mutedByUser = true;
        ensureAudio();
        updateUi();
        return true;
      }
    } catch (ePref) {}
    if (started && audio && !audio.paused) {
      applyAudible().catch(function () {
        ensureHint("Tocca per attivare l’audio");
        armUnlockGesture();
      });
      return true;
    }
    if (!mutedByUser) tryMutedAutoplayThenAudible();
    return true;
  }

  function setup() {
    function tick() {
      bootWhenReady();
    }
    tick();
    window.addEventListener("vc:access-ok", function () {
      window.setTimeout(tick, 40);
    });
    window.addEventListener("vc:confessionale-curtain-done", function () {
      window.setTimeout(function () {
        if (!mutedByUser) unlockFromUserGesture();
        tick();
      }, 20);
    });
    var n = 0;
    var t = window.setInterval(function () {
      n += 1;
      tick();
      if (n > 120) window.clearInterval(t);
    }, 80);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setup);
  } else {
    setup();
  }

  /* Tentativo immediato (gesture navigazione ancora calda). */
  try {
    readVolumePrefs();
    if (localStorage.getItem(MUTE_PREF_KEY) !== "1") {
      var a0 = ensureAudio();
      a0.muted = false;
      a0.volume = Math.max(0, Math.min(1, baseVol));
      var p0 = a0.play();
      if (p0 && typeof p0.then === "function") {
        p0
          .then(function () {
            started = true;
            mutedByUser = false;
          })
          .catch(function () {});
      }
    }
  } catch (eImm) {}

  window.__vcConfessionaleBgmVer = VER;
  window.__vcConfessionaleBgmSetup = setup;
  window.__vcConfessionaleBgmUnlock = unlockFromUserGesture;
})();
