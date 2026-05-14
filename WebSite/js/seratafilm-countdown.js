(function () {
  var WD_EN = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };

  function eventCfg() {
    try {
      return window.__VC_SERATAFILM_EVENT || {};
    } catch (e) {
      return {};
    }
  }

  function getZonedParts(utcMs, tz) {
    var dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "long",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    var o = {};
    var parts = dtf.formatToParts(new Date(utcMs));
    for (var i = 0; i < parts.length; i += 1) {
      var x = parts[i];
      if (x.type !== "literal") o[x.type] = x.value;
    }
    var wd = WD_EN[o.weekday];
    return {
      weekday: typeof wd === "number" ? wd : -1,
      year: +o.year,
      month: +o.month,
      day: +o.day,
      hour: +o.hour,
      minute: +o.minute,
      second: +o.second,
    };
  }

  function nextWeeklyMatchMs(tz, wantWd, wantH, wantM, nowMs) {
    var t = Math.ceil(Number(nowMs) / 1000) * 1000;
    var lim = t + 10 * 86400000;
    while (t <= lim) {
      var p = getZonedParts(t, tz);
      if (
        p.weekday === wantWd &&
        p.hour === wantH &&
        p.minute === wantM &&
        p.second === 0 &&
        t > nowMs
      ) {
        return t;
      }
      t += 1000;
    }
    return nowMs + 3600000;
  }

  var cachedFilmAt = 0;

  function resolveFilmAtMs(nowMs, bump) {
    var cfg = eventCfg();
    var iso = String(cfg.overrideIso || "").trim();
    if (iso) {
      var t0 = Date.parse(iso);
      if (Number.isFinite(t0)) return t0;
    }
    var tz = String(cfg.timezone || "Europe/Rome").trim() || "Europe/Rome";
    var rec = cfg.recurring || cfg.weekly || {};
    var wdn = Number.isFinite(Number(rec.weekday))
      ? Math.max(0, Math.min(6, Math.floor(Number(rec.weekday))))
      : 6;
    var h = Number.isFinite(Number(rec.hour)) ? Math.max(0, Math.min(23, Math.floor(Number(rec.hour)))) : 21;
    var m = Number.isFinite(Number(rec.minute)) ? Math.max(0, Math.min(59, Math.floor(Number(rec.minute)))) : 30;
    var anchor = bump ? nowMs + 1000 : nowMs;
    return nextWeeklyMatchMs(tz, wdn, h, m, anchor);
  }

  function getFilmAtForCountdown(nowMs) {
    var cfg = eventCfg();
    var iso = String(cfg.overrideIso || "").trim();
    if (iso) {
      var t0 = Date.parse(iso);
      if (Number.isFinite(t0)) return t0;
    }
    if (!cachedFilmAt) {
      cachedFilmAt = resolveFilmAtMs(nowMs, false);
    }
    return cachedFilmAt;
  }

  function linkFilmUrl() {
    var u = String(eventCfg().linkFilm || "").trim();
    return u || "https://streamingcommunityz.moe/it/watch/51833";
  }

  var countdownAudioEl = null;
  var tenSecondsAudioTriggered = false;
  var fsRequested = false;
  var countdownAudioArmTimer = 0;
  var countdownAudioFastGuardInterval = 0;
  var MAX_SET_TIMEOUT_MS = 2147483647;

  function clearCountdownAudioArm() {
    if (countdownAudioArmTimer) {
      try {
        clearTimeout(countdownAudioArmTimer);
      } catch (eArm) {}
      countdownAudioArmTimer = 0;
    }
  }

  function clearCountdownAudioFastGuard() {
    if (countdownAudioFastGuardInterval) {
      try {
        clearInterval(countdownAudioFastGuardInterval);
      } catch (eFg) {}
      countdownAudioFastGuardInterval = 0;
    }
  }

  /** Scadenza assoluta filmAt−10,25s (non legata al tick 1s); chunk se oltre il max di setTimeout. */
  function scheduleCountdownAudioFromFilmAt() {
    clearCountdownAudioArm();
    function step() {
      if (tenSecondsAudioTriggered) return;
      var film = getFilmAtForCountdown(Date.now());
      var ms = film - Date.now() - 10250;
      if (!Number.isFinite(ms)) return;
      if (ms <= 0) {
        tryPlayCountdownLead();
        return;
      }
      var wait = Math.min(ms, MAX_SET_TIMEOUT_MS);
      countdownAudioArmTimer = setTimeout(function () {
        countdownAudioArmTimer = 0;
        step();
      }, wait);
    }
    step();
  }

  function countdownMp3Url() {
    try {
      return new URL("countdown.mp3", window.location.href).href;
    } catch (e) {
      return "countdown.mp3";
    }
  }

  function ensureCountdownAudio() {
    if (countdownAudioEl) return countdownAudioEl;
    try {
      countdownAudioEl = new Audio();
      countdownAudioEl.preload = "auto";
      countdownAudioEl.src = countdownMp3Url();
    } catch (e2) {
      countdownAudioEl = null;
    }
    return countdownAudioEl;
  }

  function tryPlayCountdownLead() {
    if (tenSecondsAudioTriggered) return;
    var a = ensureCountdownAudio();
    if (!a) return;
    tenSecondsAudioTriggered = true;
    clearCountdownAudioArm();
    clearCountdownAudioFastGuard();
    try {
      a.currentTime = 0;
    } catch (eCt) {}
    var p = a.play();
    if (p && typeof p.catch === "function") {
      p.catch(function () {});
    }
  }

  function clearFinalCountdownUi() {
    try {
      document.body.classList.remove("vc-seratafilm-final10", "vc-seratafilm-final-fullscreen");
    } catch (eC) {}
    try {
      var fsRoot = document.getElementById("vc-seratafilm-fs-countdown");
      if (fsRoot) fsRoot.setAttribute("aria-hidden", "true");
    } catch (eA) {}
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(function () {});
      }
    } catch (eF) {}
    fsRequested = false;
  }

  window.__vcSeratafilmStartCountdown = function () {
    tenSecondsAudioTriggered = false;
    fsRequested = false;
    clearCountdownAudioArm();
    clearCountdownAudioFastGuard();
    try {
      document.body.classList.remove("vc-seratafilm-final10", "vc-seratafilm-final-fullscreen");
    } catch (eR) {}
    try {
      var fsR0 = document.getElementById("vc-seratafilm-fs-countdown");
      if (fsR0) fsR0.setAttribute("aria-hidden", "true");
    } catch (eR2) {}
    if (window.__vcSeratafilmCountdownInterval) {
      clearInterval(window.__vcSeratafilmCountdownInterval);
      window.__vcSeratafilmCountdownInterval = 0;
    }
    if (window.__vcSeratafilmCountdownTickTimeout) {
      try {
        clearTimeout(window.__vcSeratafilmCountdownTickTimeout);
      } catch (eT0) {}
      window.__vcSeratafilmCountdownTickTimeout = 0;
    }
    var openNow = document.getElementById("openNow");
    var linkFilm = linkFilmUrl();
    if (openNow && !openNow.dataset.vcSeratafilmOpenBound) {
      openNow.dataset.vcSeratafilmOpenBound = "1";
      openNow.addEventListener("click", function () {
        window.location.href = linkFilm;
      });
    }
    function tick() {
      var oraAttuale = Date.now();
      var dataFilm = getFilmAtForCountdown(oraAttuale);
      var distanza = dataFilm - oraAttuale;

      if (typeof window.__vcSeratafilmBgmOnTick === "function") {
        window.__vcSeratafilmBgmOnTick(distanza);
      }

      if (distanza <= 0) {
        clearFinalCountdownUi();
        clearCountdownAudioArm();
        clearCountdownAudioFastGuard();
        if (window.__vcSeratafilmCountdownTickTimeout) {
          try {
            clearTimeout(window.__vcSeratafilmCountdownTickTimeout);
          } catch (eTx) {}
          window.__vcSeratafilmCountdownTickTimeout = 0;
        }
        if (window.__vcSeratafilmCountdownInterval) {
          clearInterval(window.__vcSeratafilmCountdownInterval);
          window.__vcSeratafilmCountdownInterval = 0;
        }
        if (typeof window.__vcSeratafilmBgmStop === "function") {
          window.__vcSeratafilmBgmStop();
        }
        var timerEl = document.getElementById("timer");
        if (timerEl) {
          timerEl.innerHTML =
            '<div class="tile" style="grid-column: 1 / -1; padding: 18px 14px;">' +
            '<span class="num" style="color: #b9ffcf">Buona visione!</span>' +
            '<span class="lbl">Ti sto reindirizzando…</span>' +
            "</div>";
        }
        window.location.href = linkFilm;
        return;
      }

      ensureCountdownAudio();

      if (distanza <= 10250) {
        tryPlayCountdownLead();
      }

      if (distanza <= 28000 && distanza > 0 && !tenSecondsAudioTriggered) {
        if (!countdownAudioFastGuardInterval) {
          countdownAudioFastGuardInterval = setInterval(function () {
            if (tenSecondsAudioTriggered) {
              clearCountdownAudioFastGuard();
              return;
            }
            var d = getFilmAtForCountdown(Date.now()) - Date.now();
            if (d <= 10250) tryPlayCountdownLead();
            if (d <= 0) clearCountdownAudioFastGuard();
          }, 100);
        }
      } else if (distanza > 30000) {
        clearCountdownAudioFastGuard();
      }

      try {
        document.body.classList.toggle(
          "vc-seratafilm-final10",
          distanza <= 11000 && distanza > 10000,
        );
      } catch (e10) {}

      var fsRoot = document.getElementById("vc-seratafilm-fs-countdown");
      var fsNum = document.getElementById("vc-seratafilm-fs-number");
      if (distanza <= 10000 && distanza > 0) {
        try {
          document.body.classList.add("vc-seratafilm-final-fullscreen");
        } catch (eFsA) {}
        if (fsRoot) fsRoot.setAttribute("aria-hidden", "false");
        if (fsNum) fsNum.textContent = String(Math.max(0, Math.ceil(distanza / 1000)));
        if (!fsRequested && document.documentElement.requestFullscreen) {
          fsRequested = true;
          document.documentElement.requestFullscreen().catch(function () {});
        }
      } else {
        try {
          document.body.classList.remove("vc-seratafilm-final-fullscreen");
        } catch (eFsB) {}
        if (fsRoot) fsRoot.setAttribute("aria-hidden", "true");
        if (distanza > 10000) {
          fsRequested = false;
          try {
            if (document.fullscreenElement && document.exitFullscreen) {
              document.exitFullscreen().catch(function () {});
            }
          } catch (eFsC) {}
        }
      }

      var giorni = Math.floor(distanza / (1000 * 60 * 60 * 24));
      var ore = Math.floor((distanza % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      var minuti = Math.floor((distanza % (1000 * 60 * 60)) / (1000 * 60));
      var secondi = Math.floor((distanza % (1000 * 60)) / 1000);
      var te = document.getElementById("timer");
      if (te) {
        te.innerHTML =
          '<div class="tile" data-unit="days"><span class="num">' +
          giorni +
          '</span><span class="lbl">Giorni</span></div>' +
          '<div class="tile" data-unit="hours"><span class="num">' +
          ore +
          '</span><span class="lbl">Ore</span></div>' +
          '<div class="tile" data-unit="minutes"><span class="num">' +
          minuti +
          '</span><span class="lbl">Minuti</span></div>' +
          '<div class="tile" data-unit="seconds"><span class="num">' +
          secondi +
          '</span><span class="lbl">Secondi</span></div>';
      }
    }
    scheduleCountdownAudioFromFilmAt();
    tick();
    window.__vcSeratafilmCountdownInterval = setInterval(tick, 1000);
  };
})();