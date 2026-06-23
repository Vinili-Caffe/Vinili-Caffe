(function () {
  var WD_EN = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };

  function eventCfg() {
    try {
      return window.__VC_SERATAFILM_EVENT || {};
    } catch (e) {
      return {};
    }
  }

  var zonedDtfCache = {};

  function getZonedDtf(tz) {
    var key = String(tz || "Europe/Rome");
    if (!zonedDtfCache[key]) {
      zonedDtfCache[key] = new Intl.DateTimeFormat("en-US", {
        timeZone: key,
        weekday: "long",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      });
    }
    return zonedDtfCache[key];
  }

  function getZonedParts(utcMs, tz) {
    var o = {};
    var parts = getZonedDtf(tz).formatToParts(new Date(utcMs));
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

  var tzOffsetDtfCache = {};

  function getTimezoneOffsetMs(utcMs, tz) {
    var key = String(tz || "Europe/Rome");
    if (!tzOffsetDtfCache[key]) {
      tzOffsetDtfCache[key] = new Intl.DateTimeFormat("en-US", {
        timeZone: key,
        timeZoneName: "shortOffset",
        hour: "2-digit",
      });
    }
    var zoneName = tzOffsetDtfCache[key].formatToParts(new Date(utcMs)).find(function (part) {
      return part.type === "timeZoneName";
    });
    var match = String((zoneName && zoneName.value) || "GMT+0").match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/i);
    if (!match) return 0;
    var sign = match[1] === "-" ? -1 : 1;
    return sign * (Number(match[2] || 0) * 60 + Number(match[3] || 0)) * 60 * 1000;
  }

  function localZonedToUtcMs(year, month, day, hour, minute, tz) {
    var baseUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0);
    var off1 = getTimezoneOffsetMs(baseUtcMs, tz);
    var utcMs = baseUtcMs - off1;
    var off2 = getTimezoneOffsetMs(utcMs, tz);
    if (off2 !== off1) utcMs = baseUtcMs - off2;
    return utcMs;
  }

  function nextWeeklyMatchMs(tz, wantWd, wantH, wantM, nowMs) {
    var p = getZonedParts(nowMs, tz);
    var daysAhead = (wantWd - p.weekday + 7) % 7;
    var targetDate = new Date(Date.UTC(p.year, p.month - 1, p.day + daysAhead));
    var targetMs = localZonedToUtcMs(
      targetDate.getUTCFullYear(),
      targetDate.getUTCMonth() + 1,
      targetDate.getUTCDate(),
      wantH,
      wantM,
      tz,
    );
    if (targetMs <= nowMs) {
      targetDate = new Date(Date.UTC(p.year, p.month - 1, p.day + daysAhead + 7));
      targetMs = localZonedToUtcMs(
        targetDate.getUTCFullYear(),
        targetDate.getUTCMonth() + 1,
        targetDate.getUTCDate(),
        wantH,
        wantM,
        tz,
      );
    }
    return targetMs;
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
    var m = Number.isFinite(Number(rec.minute)) ? Math.max(0, Math.min(59, Math.floor(Number(rec.minute)))) : 0;
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

  function resolveFilmUrl(raw) {
    var s = String(raw || "").trim();
    if (!s) return "";
    try {
      if (/^https?:\/\//i.test(s)) return s;
      if (s.charAt(0) === "/") return new URL(s, window.location.origin).href;
      return new URL(s, window.location.href).href;
    } catch (e) {
      return s;
    }
  }

  function sameMediaUrl(a, b) {
    try {
      return new URL(String(a || ""), window.location.href).href === new URL(String(b || ""), window.location.href).href;
    } catch (eSame) {
      return String(a || "") === String(b || "");
    }
  }

  function injectFilmPreloadLink(url) {
    if (!url) return;
    var id = "vc-seratafilm-film-preload";
    var existing = document.getElementById(id);
    if (existing) {
      if (sameMediaUrl(existing.getAttribute("href"), url)) return;
      existing.parentNode.removeChild(existing);
    }
    try {
      var link = document.createElement("link");
      link.id = id;
      link.rel = "preload";
      link.as = "video";
      link.href = url;
      document.head.appendChild(link);
    } catch (ePre) {}
  }

  function resolveFilmPreloadMode(distanzaMs, forced) {
    if (forced) return "auto";
    if (!Number.isFinite(distanzaMs)) return "metadata";
    if (distanzaMs <= 7200000) return "auto";
    return "metadata";
  }

  function isInlineFilmUrl(url) {
    var s = String(url || "").trim();
    if (!s || !/\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(s)) return false;
    try {
      if (/^https?:\/\//i.test(s)) return new URL(s).origin === window.location.origin;
    } catch (e0) {}
    return true;
  }

  var adBreakDone = false;
  var adBreakRunning = false;
  var adBreakCardTimer = 0;
  var adBreakMaxTimer = 0;
  var AD_SEEN_LS_PREFIX = "vc_seratafilm_ad_seen:";

  function resolveAdBreakSeenStorageKey() {
    var dateKey = "unknown";
    try {
      var utils = window.__vcSeratafilmEventUtils;
      if (utils && typeof utils.resolveCurrentScreeningDateKey === "function") {
        dateKey = String(utils.resolveCurrentScreeningDateKey(Date.now()) || "unknown");
      }
    } catch (eKey) {}
    return AD_SEEN_LS_PREFIX + dateKey + ":" + resolveFilmUrl(linkFilmUrl());
  }

  function wasAdBreakSeenThisScreening() {
    try {
      return localStorage.getItem(resolveAdBreakSeenStorageKey()) === "1";
    } catch (eSeen) {
      return false;
    }
  }

  function markAdBreakSeenThisScreening() {
    try {
      localStorage.setItem(resolveAdBreakSeenStorageKey(), "1");
    } catch (eMark) {}
  }

  function syncAdBreakDoneFromStorage() {
    if (wasAdBreakSeenThisScreening()) adBreakDone = true;
  }

  function resolveAdBreakConfig() {
    var raw = eventCfg().adBreak;
    if (!raw || raw.enabled === false) return null;
    var videoUrl = resolveFilmUrl(String(raw.videoUrl || "").trim());
    if (!videoUrl) return null;
    var totalMs = Number.isFinite(Number(raw.totalMs)) ? Math.max(30000, Math.floor(Number(raw.totalMs))) : 60000;
    var introMs = Number.isFinite(Number(raw.introMs)) ? Math.max(5000, Math.floor(Number(raw.introMs))) : 15000;
    var outroMs = Number.isFinite(Number(raw.outroMs)) ? Math.max(5000, Math.floor(Number(raw.outroMs))) : 15000;
    if (introMs + outroMs >= totalMs) {
      introMs = Math.floor(totalMs * 0.25);
      outroMs = Math.floor(totalMs * 0.25);
    }
    var atPercent = Number.isFinite(Number(raw.atPercent)) ? Math.max(1, Math.min(99, Number(raw.atPercent))) : 50;
    return {
      videoUrl: videoUrl,
      atPercent: atPercent,
      totalMs: totalMs,
      introMs: introMs,
      outroMs: outroMs,
      introTitle: String(raw.introTitle || "Pausa pubblicitaria").trim() || "Pausa pubblicitaria",
      introText: String(raw.introText || "Tra poco riprenderemo la proiezione. Resta con noi!").trim(),
      outroTitle: String(raw.outroTitle || "La proiezione riprende").trim() || "La proiezione riprende",
      outroText: String(raw.outroText || "Grazie per la pazienza. Buona visione!").trim(),
    };
  }

  function clearAdBreakTimers() {
    if (adBreakCardTimer) {
      try {
        clearInterval(adBreakCardTimer);
      } catch (eCt) {}
      adBreakCardTimer = 0;
    }
    if (adBreakMaxTimer) {
      try {
        clearTimeout(adBreakMaxTimer);
      } catch (eMt) {}
      adBreakMaxTimer = 0;
    }
  }

  function setAdBreakUi(active) {
    var root = document.getElementById("vc-seratafilm-ad-break");
    try {
      document.body.classList.toggle("vc-seratafilm-ad-break-active", Boolean(active));
    } catch (eB) {}
    if (!root) return;
    if (active) {
      root.hidden = false;
      root.removeAttribute("hidden");
      root.setAttribute("aria-hidden", "false");
      return;
    }
    root.hidden = true;
    root.setAttribute("hidden", "");
    root.setAttribute("aria-hidden", "true");
    var card = document.getElementById("vc-seratafilm-ad-card");
    if (card) {
      card.hidden = true;
      card.setAttribute("hidden", "");
    }
    var adVideo = document.getElementById("vc-seratafilm-ad-video");
    if (adVideo) {
      adVideo.hidden = true;
      adVideo.setAttribute("hidden", "");
      try {
        adVideo.pause();
      } catch (eP) {}
    }
  }

  function waitMs(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, Math.max(0, Math.floor(Number(ms) || 0)));
    });
  }

  function showAdBreakCard(title, text, durationMs) {
    var card = document.getElementById("vc-seratafilm-ad-card");
    var titleEl = document.getElementById("vc-seratafilm-ad-title");
    var textEl = document.getElementById("vc-seratafilm-ad-text");
    var countdownEl = document.getElementById("vc-seratafilm-ad-countdown");
    var adVideo = document.getElementById("vc-seratafilm-ad-video");
    if (!card || !titleEl || !textEl || !countdownEl) return waitMs(durationMs);
    if (adVideo) {
      adVideo.hidden = true;
      adVideo.setAttribute("hidden", "");
      try {
        adVideo.pause();
      } catch (eAv) {}
    }
    titleEl.textContent = String(title || "");
    textEl.textContent = String(text || "");
    card.hidden = false;
    card.removeAttribute("hidden");
    clearAdBreakTimers();
    var totalMs = Math.max(1000, Math.floor(Number(durationMs) || 0));
    var endsAt = Date.now() + totalMs;
    function paint() {
      var leftMs = Math.max(0, endsAt - Date.now());
      countdownEl.textContent = String(Math.max(1, Math.ceil(leftMs / 1000)));
    }
    paint();
    adBreakCardTimer = setInterval(paint, 250);
    return waitMs(totalMs).then(function () {
      clearAdBreakTimers();
      card.hidden = true;
      card.setAttribute("hidden", "");
    });
  }

  function playAdBreakVideo(url, maxMs) {
    var adVideo = document.getElementById("vc-seratafilm-ad-video");
    if (!adVideo || !url) return waitMs(0);
    var card = document.getElementById("vc-seratafilm-ad-card");
    if (card) {
      card.hidden = true;
      card.setAttribute("hidden", "");
    }
    adVideo.hidden = false;
    adVideo.removeAttribute("hidden");
    adVideo.controls = false;
    adVideo.playsInline = true;
    adVideo.preload = "auto";
    adVideo.muted = false;
    if (!sameMediaUrl(adVideo.currentSrc || adVideo.src, url)) {
      adVideo.src = url;
      try {
        adVideo.load();
      } catch (eL) {}
    }
    return waitForAdVideoReady(adVideo, 15000).then(function (ready) {
      if (!ready) {
        try {
          adVideo.load();
        } catch (eReload) {}
      }
      return new Promise(function (resolve) {
        var done = false;
        function finish() {
          if (done) return;
          done = true;
          clearAdBreakTimers();
          try {
            adVideo.onended = null;
            adVideo.onerror = null;
            adVideo.onstalled = null;
            adVideo.pause();
          } catch (eP) {}
          adVideo.hidden = true;
          adVideo.setAttribute("hidden", "");
          resolve();
        }
        adVideo.onended = finish;
        adVideo.onerror = finish;
        adVideo.onstalled = function () {
          if (Number(adVideo.readyState) < 2) finish();
        };
        adBreakMaxTimer = setTimeout(finish, Math.max(1000, Math.floor(Number(maxMs) || 0)));
        function tryPlay() {
          var p = adVideo.play();
          if (p && typeof p.then === "function") {
            p.catch(function () {
              adVideo.muted = true;
              var p2 = adVideo.play();
              if (p2 && typeof p2.catch === "function") {
                p2.catch(finish);
              } else {
                finish();
              }
            });
          }
        }
        if (!ready) {
          waitForAdVideoReady(adVideo, 8000).then(function (ready2) {
            if (!ready2) finish();
            else tryPlay();
          });
          return;
        }
        tryPlay();
      });
    });
  }

  function preloadAdBreakVideo(url) {
    var cfg = resolveAdBreakConfig();
    if (!cfg || !url) return;
    var adVideo = document.getElementById("vc-seratafilm-ad-video");
    if (!adVideo) return;
    adVideo.preload = filmStarted ? "auto" : "metadata";
    if (!sameMediaUrl(adVideo.currentSrc || adVideo.src, url)) {
      adVideo.src = url;
      try {
        adVideo.load();
      } catch (eP) {}
    }
  }

  function waitForAdVideoReady(adVideo, timeoutMs) {
    if (!adVideo) return Promise.resolve(false);
    if (Number(adVideo.readyState) >= 2) return Promise.resolve(true);
    return new Promise(function (resolve) {
      var settled = false;
      function finish(ok) {
        if (settled) return;
        settled = true;
        try {
          adVideo.removeEventListener("canplay", onReady);
          adVideo.removeEventListener("loadeddata", onReady);
          adVideo.removeEventListener("error", onErr);
        } catch (eRm) {}
        if (timer) {
          try {
            clearTimeout(timer);
          } catch (eCt) {}
        }
        resolve(Boolean(ok));
      }
      function onReady() {
        finish(Number(adVideo.readyState) >= 2);
      }
      function onErr() {
        finish(false);
      }
      var timer = setTimeout(function () {
        finish(Number(adVideo.readyState) >= 2);
      }, Math.max(2000, Math.floor(Number(timeoutMs) || 12000)));
      adVideo.addEventListener("canplay", onReady);
      adVideo.addEventListener("loadeddata", onReady);
      adVideo.addEventListener("error", onErr);
    });
  }

  async function runAdBreakSequence(video) {
    var cfg = resolveAdBreakConfig();
    if (!cfg || adBreakDone || adBreakRunning || !video) return;
    if (wasAdBreakSeenThisScreening()) {
      adBreakDone = true;
      return;
    }
    adBreakRunning = true;
    adBreakDone = true;
    var resumeAt = Number(video.currentTime) || 0;
    try {
      video.pause();
    } catch (ePause) {}
    setAdBreakUi(true);
    var breakStart = Date.now();
    try {
      await showAdBreakCard(cfg.introTitle, cfg.introText, cfg.introMs);
      var adMaxMs = Math.max(5000, cfg.totalMs - cfg.introMs - cfg.outroMs);
      await playAdBreakVideo(cfg.videoUrl, adMaxMs);
      var elapsed = Date.now() - breakStart;
      var outroMs = Math.max(cfg.outroMs, cfg.totalMs - elapsed);
      await showAdBreakCard(cfg.outroTitle, cfg.outroText, outroMs);
      markAdBreakSeenThisScreening();
    } catch (eRun) {
      try {
        console.warn("[seratafilm] ad break error:", eRun?.message || eRun);
      } catch (eLog) {}
    }
    clearAdBreakTimers();
    setAdBreakUi(false);
    adBreakRunning = false;
    if (!filmStarted || !video) return;
    try {
      if (Number.isFinite(resumeAt) && resumeAt >= 0) video.currentTime = resumeAt;
    } catch (eSeek) {}
    kickInlineFilmPlayback(video);
  }

  function shouldTriggerAdBreak(video) {
    var cfg = resolveAdBreakConfig();
    if (!cfg || adBreakDone || adBreakRunning || !video || video.paused || video.ended) return false;
    var duration = Number(video.duration);
    var current = Number(video.currentTime);
    if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(current)) return false;
    return current >= duration * (cfg.atPercent / 100);
  }

  function bindAdBreakWatcher(video) {
    if (!video || video.dataset.vcSeratafilmAdBreakBound === "1") return;
    if (!resolveAdBreakConfig()) return;
    video.dataset.vcSeratafilmAdBreakBound = "1";
    video.addEventListener("timeupdate", function () {
      if (shouldTriggerAdBreak(video)) runAdBreakSequence(video);
    });
    video.addEventListener("seeked", function () {
      if (shouldTriggerAdBreak(video)) runAdBreakSequence(video);
    });
  }

  var filmStarted = false;
  var filmThanksRedirected = false;

  function resolveThanksPageUrl() {
    try {
      if (window.__vcSeratafilmEventUtils && typeof window.__vcSeratafilmEventUtils.resolveThanksPageUrl === "function") {
        return window.__vcSeratafilmEventUtils.resolveThanksPageUrl();
      }
    } catch (eUtil) {}
    try {
      return new URL("grazie/", window.location.href).href;
    } catch (eUrl) {
      return "grazie/";
    }
  }

  function isInlineFilmAtEnd(video) {
    if (!video) return false;
    if (video.ended) return true;
    var duration = Number(video.duration);
    var current = Number(video.currentTime);
    if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(current)) return false;
    return current >= duration - 0.4;
  }

  function redirectToThanksPage() {
    if (filmThanksRedirected) return;
    filmThanksRedirected = true;
    var thanksUrl = resolveThanksPageUrl();
    function go() {
      window.location.assign(thanksUrl);
    }
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().then(go).catch(go);
        return;
      }
    } catch (eFs) {}
    go();
  }

  function maybeRedirectAfterFilmEnd(video) {
    if (filmThanksRedirected || !filmStarted) return;
    if (!isInlineFilmAtEnd(video)) return;
    redirectToThanksPage();
  }

  function bindInlineFilmEndRedirect(video) {
    if (!video || video.dataset.vcSeratafilmEndedBound === "1") return;
    video.dataset.vcSeratafilmEndedBound = "1";
    video.addEventListener("ended", function () {
      maybeRedirectAfterFilmEnd(video);
    });
    video.addEventListener("timeupdate", function () {
      maybeRedirectAfterFilmEnd(video);
    });
    video.addEventListener("pause", function () {
      maybeRedirectAfterFilmEnd(video);
    });
  }

  function setFilmLoading(show, message) {
    var el = document.getElementById("vc-seratafilm-film-loading");
    if (!el) return;
    if (show) {
      el.hidden = false;
      el.removeAttribute("hidden");
      if (message) {
        var msg = el.querySelector(".vc-seratafilm-film__loading-text");
        if (msg) msg.textContent = message;
      }
      return;
    }
    el.hidden = true;
    el.setAttribute("hidden", "");
  }

  function kickInlineFilmPlayback(video) {
    if (!video || !filmStarted || video.ended) return;
    if (!video.paused) return;
    tryPlayInlineFilm(video);
  }

  function tryPlayInlineFilm(video) {
    if (!video) return;
    var p = video.play();
    if (p && typeof p.then === "function") {
      p.catch(function () {
        video.muted = true;
        var p2 = video.play();
        if (p2 && typeof p2.then === "function") {
          p2.then(function () {
            try {
              video.muted = false;
            } catch (eMu) {}
          }).catch(function () {
            setFilmLoading(true, "Premi play per avviare la proiezione.");
          });
        }
      });
    }
  }

  function bindInlineFilmPlaybackHelpers(video) {
    if (!video || video.dataset.vcSeratafilmPlaybackBound === "1") return;
    video.dataset.vcSeratafilmPlaybackBound = "1";
    video.addEventListener("error", function () {
      if (!filmStarted) return;
      setFilmLoading(true, "Impossibile caricare il film. Ricarica la pagina o contatta lo staff.");
    });
    video.addEventListener("waiting", function () {
      if (!filmStarted || video.paused) return;
      setFilmLoading(true, "Buffering…");
    });
    video.addEventListener("playing", function () {
      setFilmLoading(false);
    });
    video.addEventListener("canplay", function () {
      if (filmStarted) setFilmLoading(false);
    });
    video.addEventListener("timeupdate", function () {
      if (filmStarted && Number(video.currentTime) > 0.05) setFilmLoading(false);
    });
  }

  function preloadInlineFilm(url, options) {
    var forced = options === true || (options && options.forceAuto);
    var distanzaMs = options && Number.isFinite(Number(options.distanzaMs)) ? Number(options.distanzaMs) : null;
    var video = document.getElementById("vc-seratafilm-film-video");
    if (!video || !url) return;
    bindInlineFilmEndRedirect(video);
    bindInlineFilmPlaybackHelpers(video);
    bindAdBreakWatcher(video);
    var adCfg = resolveAdBreakConfig();
    if (adCfg) preloadAdBreakVideo(adCfg.videoUrl);
    injectFilmPreloadLink(url);
    var preloadMode = resolveFilmPreloadMode(distanzaMs, forced);
    var cacheKey = url + "|" + preloadMode;
    if (video.dataset.vcSeratafilmPreloaded === cacheKey) return;
    video.dataset.vcSeratafilmPreloaded = cacheKey;
    video.preload = preloadMode;
    if (!sameMediaUrl(video.currentSrc || video.src, url)) {
      video.src = url;
      try {
        video.load();
      } catch (eL) {}
    }
  }

  function startInlineFilmPlayer(url) {
    if (filmStarted) return;
    filmStarted = true;
    adBreakDone = false;
    adBreakRunning = false;
    syncAdBreakDoneFromStorage();
    clearAdBreakTimers();
    setAdBreakUi(false);
    var root = document.getElementById("vc-seratafilm-film");
    var video = document.getElementById("vc-seratafilm-film-video");
    if (!root || !video) {
      window.location.href = url;
      return;
    }
    try {
      document.body.classList.remove("vc-seratafilm-final10", "vc-seratafilm-final-fullscreen");
    } catch (eC) {}
    try {
      var fsRoot = document.getElementById("vc-seratafilm-fs-countdown");
      if (fsRoot) fsRoot.setAttribute("aria-hidden", "true");
    } catch (eA) {}
    if (typeof window.__vcSeratafilmBgmStop === "function") {
      window.__vcSeratafilmBgmStop();
    }
    try {
      document.body.classList.add("vc-seratafilm-film-active");
      document.documentElement.classList.add("vc-seratafilm-film-active");
    } catch (eB) {}
    root.hidden = false;
    root.removeAttribute("hidden");
    root.setAttribute("aria-hidden", "false");
    setFilmLoading(false);
    video.playsInline = true;
    video.controls = true;
    video.preload = "auto";
    bindInlineFilmEndRedirect(video);
    bindInlineFilmPlaybackHelpers(video);
    bindAdBreakWatcher(video);
    var adCfgStart = resolveAdBreakConfig();
    if (adCfgStart) preloadAdBreakVideo(adCfgStart.videoUrl);
    if (!sameMediaUrl(video.currentSrc || video.src, url)) {
      video.src = url;
      try {
        video.load();
      } catch (eV) {}
    }
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(function () {});
    }
    try {
      video.currentTime = 0;
    } catch (eT) {}
    kickInlineFilmPlayback(video);
    video.addEventListener(
      "loadedmetadata",
      function () {
        kickInlineFilmPlayback(video);
      },
      { once: true },
    );
    video.addEventListener(
      "canplay",
      function () {
        kickInlineFilmPlayback(video);
      },
      { once: true },
    );
    [150, 500, 1200].forEach(function (delayMs) {
      setTimeout(function () {
        kickInlineFilmPlayback(video);
      }, delayMs);
    });
  }

  function openFilm(forcePreload) {
    var url = resolveFilmUrl(linkFilmUrl());
    if (isInlineFilmUrl(url)) {
      if (forcePreload) preloadInlineFilm(url, { forceAuto: true });
      startInlineFilmPlayer(url);
      return;
    }
    window.location.href = url;
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
    filmStarted = false;
    adBreakDone = false;
    adBreakRunning = false;
    clearAdBreakTimers();
    setAdBreakUi(false);
    clearCountdownAudioArm();
    clearCountdownAudioFastGuard();
    try {
      document.body.classList.remove("vc-seratafilm-final10", "vc-seratafilm-final-fullscreen", "vc-seratafilm-film-active");
      document.documentElement.classList.remove("vc-seratafilm-film-active");
    } catch (eR) {}
    try {
      var filmRoot = document.getElementById("vc-seratafilm-film");
      if (filmRoot) {
        filmRoot.hidden = true;
        filmRoot.setAttribute("hidden", "");
        filmRoot.setAttribute("aria-hidden", "true");
      }
    } catch (eRf) {}
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
    var filmUrl = resolveFilmUrl(linkFilmUrl());
    if (openNow && !openNow.dataset.vcSeratafilmOpenBound) {
      openNow.dataset.vcSeratafilmOpenBound = "1";
      openNow.addEventListener("click", function () {
        if (window.__vcSeratafilmCountdownInterval) {
          clearInterval(window.__vcSeratafilmCountdownInterval);
          window.__vcSeratafilmCountdownInterval = 0;
        }
        clearCountdownAudioArm();
        clearCountdownAudioFastGuard();
        clearFinalCountdownUi();
        if (isInlineFilmUrl(filmUrl)) preloadInlineFilm(filmUrl, { forceAuto: true });
        openFilm(true);
      });
    }
    function tick() {
      var oraAttuale = Date.now();
      var dataFilm = getFilmAtForCountdown(oraAttuale);
      var distanza = dataFilm - oraAttuale;

      if (typeof window.__vcSeratafilmBgmOnTick === "function") {
        window.__vcSeratafilmBgmOnTick(distanza);
      }

      if (isInlineFilmUrl(filmUrl)) {
        if (distanza <= 180000) {
          injectFilmPreloadLink(filmUrl);
          preloadInlineFilm(filmUrl, { forceAuto: true, distanzaMs: distanza });
          var adCfgTick = resolveAdBreakConfig();
          if (adCfgTick) preloadAdBreakVideo(adCfgTick.videoUrl);
        } else if (distanza <= 7200000) {
          preloadInlineFilm(filmUrl, { distanzaMs: distanza });
        }
      }

      if (distanza <= 0) {
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
        var timerEl = document.getElementById("timer");
        if (timerEl) {
          timerEl.innerHTML =
            '<div class="tile" style="grid-column: 1 / -1; padding: 18px 14px;">' +
            '<span class="num" style="color: #b9ffcf">Buona visione!</span>' +
            '<span class="lbl">La proiezione sta iniziando…</span>' +
            "</div>";
        }
        openFilm(true);
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

  function bootFilmEndRedirect() {
    bindInlineFilmEndRedirect(document.getElementById("vc-seratafilm-film-video"));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootFilmEndRedirect);
  } else {
    bootFilmEndRedirect();
  }
})();