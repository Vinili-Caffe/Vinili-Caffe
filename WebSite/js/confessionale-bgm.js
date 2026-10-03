(function () {
  if (window.__vcConfessionaleBgmBooted) return;
  window.__vcConfessionaleBgmBooted = true;
  var VER = "20260917siteApiW10a";
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
  var audioEventsBound = false;
  var syncSubBound = false;
  var applyingRemotePrefs = false;
  /* confessionaleClickFreeze1: evita play()/publish re-entrancy sul primo pointerdown */
  var audibleInFlight = false;
  var unlockConsumed = false;

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
    var got = false;
    try {
      var sync = window.__VC_CHROME_SYNC && window.__VC_CHROME_SYNC.get();
      if (sync && sync.confessionaleBgm && typeof sync.confessionaleBgm === "object") {
        if (Number.isFinite(Number(sync.confessionaleBgm.volume))) {
          userVol = Math.min(1, Math.max(0, Number(sync.confessionaleBgm.volume)));
          baseVol = userVol;
          got = true;
        }
        if (typeof sync.confessionaleBgm.muted === "boolean") {
          mutedByUser = Boolean(sync.confessionaleBgm.muted);
          try {
            if (mutedByUser) localStorage.setItem(MUTE_PREF_KEY, "1");
            else localStorage.removeItem(MUTE_PREF_KEY);
          } catch (eM) {}
        }
      }
    } catch (eSy) {}
    if (!got) {
      try {
        var raw = localStorage.getItem(VOL_PREF_KEY);
        if (raw != null && raw !== "") {
          var n = Number(raw);
          if (Number.isFinite(n)) {
            userVol = Math.min(1, Math.max(0, n > 1 ? n / 100 : n));
            baseVol = userVol;
            got = true;
          }
        }
      } catch (eLs) {}
    }
    if (!got) {
      userVol = cfgVol;
      baseVol = cfgVol;
    }
    try {
      if (!mutedByUser && localStorage.getItem(MUTE_PREF_KEY) === "1") mutedByUser = true;
    } catch (eMuteLs) {}
    /* Volume 0 senza mute esplicito = stato stale: riparti dal default. */
    try {
      if (!mutedByUser && userVol < 0.02) {
        userVol = cfgVol;
        baseVol = cfgVol;
      }
    } catch (eZ) {}
  }

  function persistPrefs(extra) {
    userVol = Math.min(1, Math.max(0, Number(userVol) || 0));
    baseVol = userVol;
    try {
      localStorage.setItem(VOL_PREF_KEY, String(Math.round(userVol * 100) / 100));
    } catch (eP) {}
    try {
      if (mutedByUser) localStorage.setItem(MUTE_PREF_KEY, "1");
      else localStorage.removeItem(MUTE_PREF_KEY);
    } catch (eM) {}
    if (applyingRemotePrefs) return;
    try {
      if (window.__VC_CHROME_SYNC) {
        var payload = {
          confessionaleBgm: Object.assign(
            {
              volume: userVol,
              muted: Boolean(mutedByUser),
            },
            extra && typeof extra === "object" ? extra : {},
          ),
        };
        window.__VC_CHROME_SYNC.publish(payload);
      }
    } catch (eS) {}
  }

  function persistVolume(vol) {
    userVol = Math.min(1, Math.max(0, Number(vol) || 0));
    baseVol = userVol;
    if (userVol < 0.02) mutedByUser = true;
    persistPrefs();
  }

  function applyRemoteConfessionalePrefs(prefs) {
    if (!prefs || !prefs.confessionaleBgm || typeof prefs.confessionaleBgm !== "object") return;
    var bgm = prefs.confessionaleBgm;
    applyingRemotePrefs = true;
    try {
      if (Number.isFinite(Number(bgm.volume))) {
        userVol = Math.min(1, Math.max(0, Number(bgm.volume)));
        baseVol = userVol;
        try {
          localStorage.setItem(VOL_PREF_KEY, String(Math.round(userVol * 100) / 100));
        } catch (eV) {}
      }
      if (typeof bgm.muted === "boolean") {
        mutedByUser = Boolean(bgm.muted);
        try {
          if (mutedByUser) localStorage.setItem(MUTE_PREF_KEY, "1");
          else localStorage.removeItem(MUTE_PREF_KEY);
        } catch (eM2) {}
      }
      if (audio) {
        try {
          if (mutedByUser) {
            audio.pause();
            audio.muted = true;
          } else {
            audio.muted = false;
            var nextVol = Math.max(0, Math.min(1, baseVol));
            if (Math.abs(Number(audio.volume) - nextVol) > 0.001) {
              audio.volume = nextVol;
            }
          }
        } catch (eA) {}
      }
      updateUi();
    } finally {
      applyingRemotePrefs = false;
    }
  }

  function bindChromeSync() {
    if (syncSubBound) return;
    if (!window.__VC_CHROME_SYNC || typeof window.__VC_CHROME_SYNC.subscribe !== "function") return;
    syncSubBound = true;
    try {
      window.__VC_CHROME_SYNC.subscribe(function (prefs) {
        applyRemoteConfessionalePrefs(prefs);
      });
    } catch (eSub) {}
    try {
      if (typeof window.__VC_CHROME_SYNC.pullServer === "function") {
        window.__VC_CHROME_SYNC.pullServer();
      }
    } catch (ePull) {}
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

  function ensureAudio(opts) {
    opts = opts || {};
    var wantSrc = Boolean(opts.src);
    if (audio) {
      if (wantSrc) assignAudioSrc(audio);
      return audio;
    }
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
    // siteApiW10: nessun download finché non serve il play (preload none, src on-demand).
    audio.preload = "none";
    try {
      audio.removeAttribute("preload");
      audio.setAttribute("preload", "none");
    } catch (ePreAttr) {}
    audio.loop = true;
    audio.setAttribute("loop", "");
    audio.setAttribute("playsinline", "");
    /* confessionalePlayCatch1: no autoplay attr — avoids console play() noise */
    try {
      audio.removeAttribute("autoplay");
    } catch (eAp) {}
    audio.autoplay = false;
    audio.playsInline = true;
    if (wantSrc) assignAudioSrc(audio);
    try {
      var alreadyAudible =
        wantSrc && !audio.paused && !audio.muted && Number(audio.volume) > 0.001;
      if (alreadyAudible) {
        userVol = Math.min(1, Math.max(0, Number(audio.volume)));
        baseVol = userVol;
        started = true;
        mutedByUser = false;
      } else if (wantSrc && (!(Number(audio.volume) > 0.001) || audio.muted)) {
        audio.muted = false;
        audio.volume = Math.max(0.02, Math.min(1, baseVol < 0.02 ? 0.34 : baseVol));
      }
    } catch (eSync) {
      try {
        if (wantSrc) audio.volume = Math.max(0, Math.min(1, baseVol));
      } catch (eV2) {}
    }
    window.__VC_CONFESSIONALE_BGM_AUDIO = audio;
    bindAudioUiEvents(audio);
    return audio;
  }

  function assignAudioSrc(el) {
    if (!el) return;
    try {
      var cur = String(el.currentSrc || el.src || el.getAttribute("src") || "").trim();
      if (cur && cur.indexOf("confessionale-bgm") >= 0) return;
      if (cur && /^https?:/i.test(cur)) return;
    } catch (eCur) {}
    el.src = trackUrl();
  }

  function isAudibleNow() {
    if (!audio) return false;
    try {
      if (audio.paused) return false;
      if (audio.muted) return false;
      if (!(Number(audio.volume) > 0.001)) return false;
      return true;
    } catch (eA) {
      return false;
    }
  }

  function updateUi() {
    /* confessionalePlayer3: icona/slider seguono l'audio reale (anche dopo autoplay/prime). */
    var playing = isAudibleNow();
    if (playing) {
      started = true;
      mutedByUser = false;
      try {
        var av = Number(audio.volume);
        if (Number.isFinite(av) && av > 0.001) {
          userVol = Math.min(1, Math.max(0, av));
          baseVol = userVol;
        }
      } catch (eV) {}
      try {
        localStorage.removeItem(MUTE_PREF_KEY);
      } catch (eR) {}
    }
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

  function bindAudioUiEvents(a) {
    if (!a || audioEventsBound) return;
    audioEventsBound = true;
    function sync() {
      updateUi();
    }
    a.addEventListener("play", sync);
    a.addEventListener("playing", sync);
    a.addEventListener("pause", sync);
    a.addEventListener("volumechange", sync);
  }

  function setPlayerOpen(open) {
    if (!playerEl) return;
    try {
      playerEl.classList.toggle("is-open", Boolean(open));
      playerEl.setAttribute("aria-expanded", open ? "true" : "false");
    } catch (eO) {}
  }

  function isCoarseUi() {
    try {
      return window.matchMedia("(hover: none), (pointer: coarse)").matches;
    } catch (eM) {
      return false;
    }
  }

  function isPlayerOpen() {
    return Boolean(playerEl && playerEl.classList.contains("is-open"));
  }

  function clearUnlockGesture() {
    unlockConsumed = true;
    if (typeof detachUnlock === "function") {
      try {
        detachUnlock();
      } catch (eD) {}
      detachUnlock = null;
    }
  }

  function applyAudible() {
    if (audibleInFlight) return Promise.resolve();
    if (isAudibleNow()) {
      started = true;
      clearUnlockGesture();
      updateUi();
      return Promise.resolve();
    }
    audibleInFlight = true;
    var a = ensureAudio({ src: true });
    try {
      a.muted = false;
      var nextVol = Math.max(0, Math.min(1, baseVol));
      if (Math.abs(Number(a.volume) - nextVol) > 0.001) a.volume = nextVol;
    } catch (eVolSet) {}
    var p = a.play();
    function finishOk() {
      audibleInFlight = false;
      started = true;
      mutedByUser = false;
      hideHint();
      clearUnlockGesture();
      updateUi();
    }
    function finishFail() {
      audibleInFlight = false;
      ensureHint("Tocca per attivare l’audio");
      unlockConsumed = false;
      armUnlockGesture();
      updateUi();
      return Promise.resolve();
    }
    if (p && typeof p.then === "function") {
      return p.then(finishOk).catch(finishFail);
    }
    finishOk();
    return Promise.resolve();
  }

  function stopAudible() {
    mutedByUser = true;
    audibleInFlight = false;
    clearUnlockGesture();
    if (audio) {
      try {
        audio.pause();
      } catch (eP) {}
      try {
        audio.muted = true;
      } catch (eM0) {}
    }
    persistPrefs();
    updateUi();
  }

  function startAudibleFromGesture() {
    if (mutedByUser) return Promise.resolve();
    if (audibleInFlight) return Promise.resolve();
    if (isAudibleNow()) {
      started = true;
      clearUnlockGesture();
      updateUi();
      return Promise.resolve();
    }
    mutedByUser = false;
    /* Persist fuori dal path critico del click UI (tab Leggi/Scrivi). */
    window.setTimeout(function () {
      try {
        persistPrefs();
      } catch (eP) {}
    }, 0);
    return applyAudible().catch(function () {
      ensureHint("Tocca di nuovo per attivare l’audio");
      /* Re-arma solo se l’utente non ha mutato. */
      if (!mutedByUser && !isAudibleNow()) {
        unlockConsumed = false;
        armUnlockGesture();
      }
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

    /* confessionalePlayer3: niente freccetta.
       Mobile: 1° tap apre card verticale, 2° tap sul mute = mute/unmute, tap fuori = chiude.
       Desktop: hover volume, click = mute/unmute. */
    setPlayerOpen(false);

    document.addEventListener(
      "pointerdown",
      function (ev) {
        if (!isPlayerOpen()) return;
        var t = ev && ev.target;
        if (t && playerEl.contains(t)) return;
        setPlayerOpen(false);
      },
      true,
    );

    /* confBgmHoverClose1: desktop — esci col cursore = chiudi (anche se lo slider ha focus) */
    wrap.addEventListener("pointerleave", function () {
      if (isCoarseUi()) return;
      setPlayerOpen(false);
      try {
        var ae = document.activeElement;
        if (ae && wrap.contains(ae) && typeof ae.blur === "function") ae.blur();
      } catch (eBlur) {}
    });
    wrap.addEventListener("focusout", function (ev) {
      if (isCoarseUi()) return;
      try {
        var next = ev && ev.relatedTarget;
        if (next && wrap.contains(next)) return;
      } catch (eRel) {}
      window.setTimeout(function () {
        try {
          if (wrap.matches(":hover")) return;
        } catch (eH) {}
        setPlayerOpen(false);
      }, 0);
    });

    btn.addEventListener(
      "click",
      function (ev) {
        if (ev) {
          try {
            ev.preventDefault();
            ev.stopPropagation();
            if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
          } catch (e0) {}
        }
        if (isCoarseUi() && !isPlayerOpen()) {
          setPlayerOpen(true);
          if (!isAudibleNow() && !mutedByUser) {
            startAudibleFromGesture();
          } else {
            updateUi();
          }
          return;
        }
        var audible = isAudibleNow();
        if (audible) {
          stopAudible();
          return;
        }
        mutedByUser = false;
        startAudibleFromGesture();
      },
      true,
    );

    function onVolInput() {
      var pct = Number(range.value);
      if (!Number.isFinite(pct)) return;
      persistVolume(pct / 100);
      if (audio) {
        try {
          audio.muted = false;
          audio.volume = baseVol;
        } catch (eVol) {}
      }
      if (pct <= 0) {
        stopAudible();
        return;
      }
      mutedByUser = false;
      persistPrefs();
      if (audio && audio.paused) {
        startAudibleFromGesture();
      } else {
        updateUi();
      }
    }
    range.addEventListener("input", onVolInput);
    range.addEventListener("change", onVolInput);
    updateUi();
  }

  function armUnlockGesture() {
    if (detachUnlock) return;
    if (unlockConsumed) return;
    if (mutedByUser) return;
    if (isAudibleNow()) {
      unlockConsumed = true;
      return;
    }
    function onUnlock(ev) {
      /* confessionaleClickFreeze1: stacca SUBITO il capture listener, poi unlock async.
         Prima restava armato fino a play() ok → ogni click spam-mava play()/publish e
         bloccava il main thread (dialog “pagina non risponde”). */
      clearUnlockGesture();
      if (mutedByUser) return;
      try {
        if (localStorage.getItem(MUTE_PREF_KEY) === "1") {
          mutedByUser = true;
          return;
        }
      } catch (ePref) {}
      try {
        var t = ev && ev.target;
        if (t && t.closest) {
          if (t.closest("#vc-confessionale-music-player, .vc-bgm-player--confessionale, .vc-bgm-player__toggle")) {
            return;
          }
        }
      } catch (eT) {}
      window.setTimeout(function () {
        startAudibleFromGesture();
      }, 0);
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
    /* confessionalePlayCatch2: never start unmuted — Chromium reports NotAllowedError
       as pageerror even when the promise is caught. Mute-prime only; audible needs gesture. */
    a.muted = true;
    try {
      var nextVol = Math.max(0.02, Math.min(1, baseVol < 0.02 ? 0.34 : baseVol));
      if (Math.abs(Number(a.volume) - nextVol) > 0.001) a.volume = nextVol;
    } catch (eV0) {}
    /* confessionalePlayCatch2: never autoplay on boot — prime Audio only; gesture starts it.
       Chromium headless still pageerrors on muted play() without user activation. */
    function afterMutedPrime() {
      ensureHint("Tocca per attivare l’audio");
      unlockConsumed = false;
      armUnlockGesture();
      updateUi();
    }
    try {
      a.pause();
    } catch (ePause) {}
    afterMutedPrime();
  }

  var playerBooted = false;

  function unlockFromUserGesture() {
    if (mutedByUser) return Promise.resolve();
    try {
      if (localStorage.getItem(MUTE_PREF_KEY) === "1") {
        mutedByUser = true;
        updateUi();
        return Promise.resolve();
      }
    } catch (ePref) {}
    try {
      localStorage.removeItem(MUTE_PREF_KEY);
    } catch (eR) {}
    mutedByUser = false;
    if (document.body) ensurePlayer();
    return startAudibleFromGesture();
  }

  function forcePlayFromGesture() {
    if (audibleInFlight) return Promise.resolve();
    if (isAudibleNow()) {
      started = true;
      mutedByUser = false;
      clearUnlockGesture();
      updateUi();
      return Promise.resolve();
    }
    mutedByUser = false;
    try {
      localStorage.removeItem(MUTE_PREF_KEY);
    } catch (eR) {}
    if (document.body) ensurePlayer();
    clearUnlockGesture();
    return applyAudible().catch(function () {
      ensureHint("Tocca il player per attivare l’audio");
      unlockConsumed = false;
      armUnlockGesture();
    });
  }

  function bootWhenReady() {
    if (!document.body || !document.body.classList.contains("vc-confessionale-page")) return false;
    bindChromeSync();
    readVolumePrefs();
    ensurePlayer();
    var introDone =
      document.documentElement.classList.contains("vc-confessionale-curtain-done") ||
      document.body.classList.contains("vc-confessionale-curtain-done");
    var staffReady = document.documentElement.classList.contains("vc-staff-app-revealed");

    /* Non aspettare staff-revealed per l'audio: altrimenti si perde la gesture del click nav. */
    if (!playerBooted) {
      playerBooted = true;
      if (mutedByUser) {
        ensureAudio();
        updateUi();
      } else if (isAudibleNow()) {
        started = true;
        clearUnlockGesture();
        updateUi();
      } else {
        tryMutedAutoplayThenAudible();
        if (!unlockConsumed) armUnlockGesture();
        window.setTimeout(updateUi, 120);
        window.setTimeout(updateUi, 450);
        window.setTimeout(updateUi, 1200);
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
    if (mutedByUser) {
      ensureAudio();
      updateUi();
      return true;
    }
    if (started && audio && !audio.paused) {
      applyAudible().catch(function () {
        ensureHint("Tocca per attivare l’audio");
        unlockConsumed = false;
        armUnlockGesture();
      });
      return true;
    }
    if (!mutedByUser && !audibleInFlight && !isAudibleNow()) tryMutedAutoplayThenAudible();
    return true;
  }

  function setup() {
    function tick() {
      bootWhenReady();
    }
    bindChromeSync();
    tick();
    window.addEventListener("vc:access-ok", function () {
      try {
        if (window.__VC_CHROME_SYNC && typeof window.__VC_CHROME_SYNC.pullServer === "function") {
          window.__VC_CHROME_SYNC.pullServer(true);
        }
      } catch (eP) {}
      window.setTimeout(function () {
        readVolumePrefs();
        updateUi();
        tick();
      }, 120);
    });
    window.addEventListener("vc:confessionale-curtain-done", function () {
      window.setTimeout(function () {
        if (!mutedByUser && !isAudibleNow() && !audibleInFlight) {
          forcePlayFromGesture();
        }
        tick();
      }, 20);
    });
    window.addEventListener("vc-discord-profile", function () {
      try {
        if (window.__VC_CHROME_SYNC && typeof window.__VC_CHROME_SYNC.pullServer === "function") {
          window.__VC_CHROME_SYNC.pullServer();
        }
      } catch (ePull2) {}
      window.setTimeout(function () {
        readVolumePrefs();
        updateUi();
      }, 80);
    });
    /* confessionalePerf5: niente poll 80ms×120 (jank avvio). Pochi retry soft. */
    var n = 0;
    var t = window.setInterval(function () {
      n += 1;
      tick();
      if (n > 8 || started || mutedByUser || isAudibleNow()) window.clearInterval(t);
    }, 450);

    document.addEventListener("visibilitychange", function () {
      var a = audio || document.getElementById("vc-confessionale-bgm-audio");
      if (!a) return;
      try {
        if (document.visibilityState === "hidden") {
          if (!a.paused) {
            a.dataset.vcConfBgmWasPlaying = "1";
            a.pause();
          }
        } else if (a.dataset.vcConfBgmWasPlaying === "1" && !mutedByUser) {
          a.dataset.vcConfBgmWasPlaying = "";
          var p = a.play();
          if (p && p.catch) p.catch(function () {});
        }
      } catch (eVis) {}
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setup);
  } else {
    setup();
  }

  /* confessionalePlayCatch2 / siteApiW10: create shell only — no src/load until gesture play. */
  try {
    readVolumePrefs();
    if (localStorage.getItem(MUTE_PREF_KEY) !== "1") {
      var a0 = ensureAudio();
      a0.muted = true;
      try {
        a0.volume = Math.max(0.02, Math.min(1, baseVol < 0.02 ? 0.34 : baseVol));
      } catch (eVol0) {}
    }
  } catch (eImm) {}

  window.__vcConfessionaleBgmVer = VER;
  window.__vcConfessionaleBgmSetup = setup;
  window.__vcConfessionaleBgmUnlock = unlockFromUserGesture;
  window.__vcConfessionaleBgmForcePlay = forcePlayFromGesture;
})();
