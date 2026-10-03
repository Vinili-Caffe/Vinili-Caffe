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
    try {
      var protectedUrl = String(window.__VC_SERATAFILM_FILM_URL || "").trim();
      if (protectedUrl) return protectedUrl;
    } catch (eProt) {}
    var u = String(eventCfg().linkFilm || "").trim();
    return u;
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

    function isNginxBlockedPublicFilmUrl(url) {
    var s = String(url || "").trim();
    if (!s) return false;
    try {
      var path = new URL(s, window.location.href).pathname || "";
      return /\/images\/evento-hogwarts\/streamingcommunityz(?:-web)?\.mp4$/i.test(path);
    } catch (eBlk) {
      return /streamingcommunityz(?:-web)?\.mp4/i.test(s);
    }
  }

  function isProtectedFilmStreamUrl(url) {
    var s = String(url || "").trim();
    if (!s) return false;
    try {
      return /\/webhooks\/site-seratafilm-film/i.test(new URL(s, window.location.href).pathname || "");
    } catch (eProt) {
      return /\/webhooks\/site-seratafilm-film/i.test(s);
    }
  }

  function usableInlineFilmUrl(url) {
    if (!isInlineFilmUrl(url)) return false;
    if (isNginxBlockedPublicFilmUrl(url)) return false;
    return true;
  }

    function withAdAssetVersion(url) {
    var ver = "";
    try {
      ver = String(window.__vcSeratafilmAssetVersion || "").trim();
    } catch (eVer) {}
    if (!url || !ver) return url;
    try {
      var u = new URL(url, window.location.href);
      if (!u.searchParams.get("v")) u.searchParams.set("v", ver);
      return u.href;
    } catch (eU) {
      return url;
    }
  }

  function sameMediaUrl(a, b) {
    try {
      return new URL(String(a || ""), window.location.href).href === new URL(String(b || ""), window.location.href).href;
    } catch (eSame) {
      return String(a || "") === String(b || "");
    }
  }

    function sameMediaUrlIgnoreCacheBust(a, b) {
    function strip(u) {
      try {
        var parsed = new URL(String(u || ""), window.location.href);
        parsed.searchParams.delete("vcadb");
        parsed.searchParams.delete("v");
        parsed.hash = "";
        return parsed.href;
      } catch (eStrip) {
        return String(u || "").replace(/([?&])vcadb=\d+/g, "").replace(/([?&])v=\d+/g, "").replace(/[?&]$/, "");
      }
    }
    return strip(a) === strip(b);
  }

  function injectFilmPreloadLink(url, mode) {
    if (!url) return;
    // siteApiW9: preload <link as=video> solo a ridosso (auto) — altrimenti scarica GB a vuoto.
    if (mode !== "auto") {
      var stale = document.getElementById("vc-seratafilm-film-preload");
      if (stale && stale.parentNode) stale.parentNode.removeChild(stale);
      return;
    }
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
    // siteApiW9: era 2h → 20 min (Accept-Ranges già ok; evita auto-download anticipato).
    if (distanzaMs <= 1200000) return "auto";
    return "metadata";
  }

  function isInlineFilmUrl(url) {
    var s = String(url || "").trim();
    if (!s) return false;
    try {
      var u = new URL(s, window.location.href);
      if (/\/webhooks\/site-seratafilm-film/i.test(u.pathname)) {
        return u.origin === window.location.origin;
      }
      if (/^https?:\/\//i.test(s) && u.origin === window.location.origin) {
        return /\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(u.pathname + u.search);
      }
    } catch (e0) {}
    if (!/\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(s)) return false;
    try {
      if (/^https?:\/\//i.test(s)) return new URL(s).origin === window.location.origin;
    } catch (e1) {}
    return true;
  }

  var adBreakDone = false;
  var adBreakRunning = false;
  var adBreakFailCount = 0;
  var adBreakRetryAfter = 0;
  var adBreakCardTimer = 0;
  var adBreakMaxTimer = 0;
  var adVideoLoadLocked = false;
  var adBreakLastCurrentTime = 0;
  var AD_SEEN_LS_PREFIX = "vc_seratafilm_ad_seen_v10:";
  var AD_PRELOAD_LINK_ID = "vc-seratafilm-ad-preload";
    var playbackGestureArmed = false;
  var filmPostAdGraceUntil = 0;
  var filmSeenCurrentTime = 0;
  var filmGestureTapEl = null;
  var filmGestureTapAction = null;

  try {
    if (/(?:^|[?&])resetAd=1(?:&|$)/.test(String(window.location.search || ""))) {
      Object.keys(localStorage).forEach(function (k) {
        if (String(k).indexOf("vc_seratafilm_ad_seen") === 0) localStorage.removeItem(k);
      });
    }
  } catch (eResetAd) {}

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
    var videoUrl = withAdAssetVersion(resolveFilmUrl(String(raw.videoUrl || "").trim()));
    if (!videoUrl) return null;
    var totalMs = Number.isFinite(Number(raw.totalMs)) ? Math.max(30000, Math.floor(Number(raw.totalMs))) : 60000;
    var introMs = Number.isFinite(Number(raw.introMs)) ? Math.max(2000, Math.floor(Number(raw.introMs))) : 5000;
    var outroMs = Number.isFinite(Number(raw.outroMs)) ? Math.max(2000, Math.floor(Number(raw.outroMs))) : 5000;
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
    try {
      destroyLiveAdPlayer();
    } catch (eDes) {}
  }

  function setAdBreakUi(active) {
    var root = document.getElementById("vc-seratafilm-ad-break");
    try {
      document.body.classList.toggle("vc-seratafilm-ad-break-active", Boolean(active));
      if (!active) document.body.classList.remove("vc-seratafilm-ad-spot-playing");
    } catch (eB) {}
    if (!root) return;
    if (active) {
      root.classList.remove("is-warming");
      root.hidden = false;
      root.removeAttribute("hidden");
      root.setAttribute("aria-hidden", "false");
      return;
    }
    root.classList.remove("is-warming");
    root.hidden = true;
    root.setAttribute("hidden", "");
    root.setAttribute("aria-hidden", "true");
    var card = document.getElementById("vc-seratafilm-ad-card");
    if (card) {
      card.hidden = true;
      card.setAttribute("hidden", "");
    }
    setAdVideoStage(document.getElementById("vc-seratafilm-ad-video"), "idle");
  }

    function setAdBreakWarming(active) {
    var root = document.getElementById("vc-seratafilm-ad-break");
    if (!root) return;
    try {
      if (document.body.classList.contains("vc-seratafilm-ad-break-active")) {
        root.classList.remove("is-warming");
        return;
      }
    } catch (eAct) {}
    if (active) {
      root.classList.add("is-warming");
      root.hidden = false;
      root.removeAttribute("hidden");
      root.setAttribute("aria-hidden", "true");
      return;
    }
    root.classList.remove("is-warming");
    root.hidden = true;
    root.setAttribute("hidden", "");
    root.setAttribute("aria-hidden", "true");
  }

    function setAdVideoStage(adVideo, stage) {
    if (!adVideo) return;
    var mode = String(stage || "idle");
    adVideo.classList.remove("is-preloading", "is-playing");
    if (mode === "preload") {
      adVideo.hidden = false;
      adVideo.removeAttribute("hidden");
      adVideo.classList.add("is-preloading");
      return;
    }
    if (mode === "play") {
      adVideo.hidden = false;
      adVideo.removeAttribute("hidden");
      adVideo.classList.add("is-playing");
      return;
    }
    try {
      adVideo.pause();
    } catch (eP) {}
    adVideo.classList.remove("is-preloading", "is-playing");
    adVideo.hidden = true;
    adVideo.setAttribute("hidden", "");
  }

  function waitMs(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, Math.max(0, Math.floor(Number(ms) || 0)));
    });
  }

  function injectAdPreloadLink(url) {
    if (!url) return;
    var existing = document.getElementById(AD_PRELOAD_LINK_ID);
    if (existing) {
      if (sameMediaUrl(existing.getAttribute("href"), url)) return;
      try {
        existing.parentNode.removeChild(existing);
      } catch (eRm) {}
    }
    try {
      var link = document.createElement("link");
      link.id = AD_PRELOAD_LINK_ID;
      link.rel = "preload";
      link.as = "video";
      link.href = url;
      document.head.appendChild(link);
    } catch (ePre) {}
  }

  function forceAssignAdVideoSrc(adVideo, url, cacheBust) {
    if (!adVideo || !url) return;
    var finalUrl = url;
    var isBlob = String(url).indexOf("blob:") === 0;
    if (cacheBust && !isBlob) {
      try {
        var u = new URL(url, window.location.href);
        u.searchParams.set("vcadb", String(Date.now()));
        finalUrl = u.href;
      } catch (eCb) {
        finalUrl = url + (url.indexOf("?") >= 0 ? "&" : "?") + "vcadb=" + Date.now();
      }
    }
    try {
      adVideo.removeAttribute("src");
      adVideo.removeAttribute("srcObject");
    } catch (eRm) {}
    try {
      adVideo.pause();
    } catch (eP) {}
    adVideo.preload = "auto";
    adVideo.src = finalUrl;
    adVideoLoadLocked = true;
    try {
      adVideo.load();
    } catch (eL) {}
  }

  function ensureAdVideoSrc(adVideo, url, forceReload) {
    if (!adVideo || !url) return;
    var hasSrc = Boolean(adVideo.currentSrc || adVideo.src);
    var same = hasSrc && sameMediaUrlIgnoreCacheBust(adVideo.currentSrc || adVideo.src, url);
        var broken = Boolean(adVideo.error) || Number(adVideo.networkState) === 3;
    var reallyReady = Number(adVideo.readyState) >= 2 && !adVideo.error;
    if (!forceReload && same && !broken && reallyReady) return;
    if (forceReload || !same || broken) {
      forceAssignAdVideoSrc(adVideo, url, Boolean(forceReload || broken));
      return;
    }
        adVideo.preload = "auto";
    adVideoLoadLocked = true;
    try {
      adVideo.load();
    } catch (eL) {}
  }

  function showAdBreakCard(title, text, durationMs) {
    var card = document.getElementById("vc-seratafilm-ad-card");
    var titleEl = document.getElementById("vc-seratafilm-ad-title");
    var textEl = document.getElementById("vc-seratafilm-ad-text");
    var countdownEl = document.getElementById("vc-seratafilm-ad-countdown");
    var adVideo = document.getElementById("vc-seratafilm-ad-video");
    if (!card || !titleEl || !textEl || !countdownEl) return waitMs(durationMs);
        if (adVideo) setAdVideoStage(adVideo, "preload");
    titleEl.textContent = String(title || "");
    textEl.textContent = String(text || "");
    card.hidden = false;
    card.removeAttribute("hidden");
    if (adBreakCardTimer) {
      try {
        clearInterval(adBreakCardTimer);
      } catch (eCt) {}
      adBreakCardTimer = 0;
    }
    var totalMs = Math.max(1000, Math.floor(Number(durationMs) || 0));
    var endsAt = Date.now() + totalMs;
    function paint() {
      var leftMs = Math.max(0, endsAt - Date.now());
      countdownEl.textContent = String(Math.max(1, Math.ceil(leftMs / 1000)));
    }
    paint();
    adBreakCardTimer = setInterval(paint, 250);
    return waitMs(totalMs).then(function () {
      if (adBreakCardTimer) {
        try {
          clearInterval(adBreakCardTimer);
        } catch (eCt2) {}
        adBreakCardTimer = 0;
      }
      card.hidden = true;
      card.setAttribute("hidden", "");
    });
  }

  var adTapAction = null;
  var liveAdPlayer = null;
  var liveAdBlobUrl = null;
  var cachedAdObjectUrl = null;
  var cachedAdSourceUrl = "";

  function getAdTapButton() {
    var id = "vc-seratafilm-ad-tap";
    var btn = document.getElementById(id);
    if (btn) return btn;
    btn = document.createElement("button");
    btn.id = id;
    btn.type = "button";
    btn.className = "vc-seratafilm-ad-tap";
    btn.hidden = true;
    btn.addEventListener("click", function () {
      if (typeof adTapAction === "function") adTapAction();
    });
    document.body.appendChild(btn);
    return btn;
  }

  function hideAdTapToPlay() {
    var btn = getAdTapButton();
    btn.hidden = true;
    btn.disabled = false;
    adTapAction = null;
  }

  function revokeAdBlobUrl(url) {
    if (!url) return;
    try {
      URL.revokeObjectURL(url);
    } catch (eRev) {}
  }

  function destroyLiveAdPlayer() {
    var el = liveAdPlayer;
    liveAdPlayer = null;
    var blob = liveAdBlobUrl;
    liveAdBlobUrl = null;
    if (!el) {
      revokeAdBlobUrl(blob);
      return;
    }
    try {
      el.onended = null;
      el.onerror = null;
      el.onplaying = null;
      el.ontimeupdate = null;
      el.pause();
    } catch (eP) {}
    try {
      el.removeAttribute("src");
    } catch (eRmSrc) {}
    try {
      if (el.parentNode) el.parentNode.removeChild(el);
    } catch (eRm) {}
        if (blob && blob !== cachedAdObjectUrl) revokeAdBlobUrl(blob);
  }

  function looksLikeMp4(bytes) {
    if (!bytes || bytes.length < 12) return false;
        return (
      bytes[4] === 0x66 &&
      bytes[5] === 0x74 &&
      bytes[6] === 0x79 &&
      bytes[7] === 0x70
    );
  }

  function looksLikeHtmlText(text) {
    var s = String(text || "").slice(0, 80).toLowerCase();
    return s.indexOf("<!doctype") >= 0 || s.indexOf("<html") >= 0;
  }

    function adFetchUrl(url, bust) {
    var abs = url;
    try {
      abs = new URL(url, window.location.href).href;
    } catch (eAbs) {}
    try {
      var u = new URL(abs);
      u.searchParams.set("vcad", String(bust || Date.now()));
      return u.href;
    } catch (eU) {
      return abs + (abs.indexOf("?") >= 0 ? "&" : "?") + "vcad=" + String(bust || Date.now());
    }
  }

  function fetchAdObjectUrl(url) {
    var abs = url;
    try {
      abs = new URL(url, window.location.href).href;
    } catch (eAbs) {}
    var fetchUrl = adFetchUrl(abs, Date.now());
    if (cachedAdObjectUrl && cachedAdSourceUrl === abs) {
      return Promise.resolve({ ok: true, objectUrl: cachedAdObjectUrl, via: "cache" });
    }
    return fetch(fetchUrl, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "video/mp4,video/*,*/*" },
    })
      .then(function (res) {
        if (!res.ok) {
          return { ok: false, status: res.status, detail: "HTTP " + res.status };
        }
        var ctype = String(res.headers.get("content-type") || "").toLowerCase();
        return res.arrayBuffer().then(function (buf) {
          var bytes = new Uint8Array(buf);
          if (!looksLikeMp4(bytes)) {
            var head = "";
            try {
              head = new TextDecoder("utf-8").decode(bytes.subarray(0, 64));
            } catch (eDec) {}
            if (looksLikeHtmlText(head) || ctype.indexOf("text/html") >= 0) {
              cachedAdSourceUrl = "";
              return {
                ok: false,
                status: res.status,
                detail: "CF/HTML al posto del video",
              };
            }
            cachedAdSourceUrl = "";
            return { ok: false, status: res.status, detail: "file non-MP4" };
          }
          var blob = new Blob([buf], { type: "video/mp4" });
          if (cachedAdObjectUrl) revokeAdBlobUrl(cachedAdObjectUrl);
          cachedAdObjectUrl = URL.createObjectURL(blob);
          cachedAdSourceUrl = abs;
          return { ok: true, objectUrl: cachedAdObjectUrl, via: "fetch", bytes: bytes.length };
        });
      })
      .catch(function (err) {
        return {
          ok: false,
          detail: err && err.message ? err.message : "fetch fallita",
        };
      });
  }

  function assignAdPlaySrc(adVideo, playSrc) {
    if (!adVideo || !playSrc) return;
    if (String(playSrc).indexOf("blob:") === 0) {
      try {
        adVideo.removeAttribute("srcObject");
        adVideo.removeAttribute("src");
      } catch (eRm) {}
      try {
        adVideo.pause();
      } catch (eP) {}
      adVideo.preload = "auto";
      adVideo.src = playSrc;
      adVideoLoadLocked = true;
      try {
        adVideo.load();
      } catch (eL) {}
      return;
    }
    forceAssignAdVideoSrc(adVideo, playSrc, true);
  }

  function prepareAdBreakVideoEl(playSrc) {
    destroyLiveAdPlayer();
    var inline = document.getElementById("vc-seratafilm-ad-video");
    if (inline) {
      inline.playsInline = true;
      inline.muted = true;
      inline.setAttribute("muted", "");
      inline.autoplay = true;
      inline.controls = false;
      inline.disablePictureInPicture = true;
      inline.preload = "auto";
      inline.volume = 1;
      inline.setAttribute("controlslist", "nodownload noplaybackrate noremoteplayback");
      assignAdPlaySrc(inline, playSrc);
      setAdVideoStage(inline, "play");
      return inline;
    }
    return createLiveAdPlayerFromSrc(playSrc);
  }

  function resetAdBreakVideoEl() {
    destroyLiveAdPlayer();
    var inline = document.getElementById("vc-seratafilm-ad-video");
    if (!inline) return;
    try {
      inline.pause();
      inline.removeAttribute("src");
    } catch (eR) {}
    setAdVideoStage(inline, "idle");
  }

  function createLiveAdPlayerFromSrc(src) {
    destroyLiveAdPlayer();
    var host =
      document.getElementById("vc-seratafilm-ad-break") ||
      document.getElementById("vc-seratafilm-film") ||
      document.body;
    var adVideo = document.createElement("video");
    adVideo.id = "vc-seratafilm-ad-live";
    adVideo.className = "vc-seratafilm-ad-break__video is-playing";
    adVideo.setAttribute("playsinline", "");
    adVideo.setAttribute("webkit-playsinline", "");
    adVideo.setAttribute("muted", "");
    adVideo.playsInline = true;
    adVideo.muted = true;
    adVideo.autoplay = true;
    adVideo.controls = false;
    adVideo.disablePictureInPicture = true;
    adVideo.preload = "auto";
    adVideo.volume = 1;
    adVideo.setAttribute("controlslist", "nodownload noplaybackrate noremoteplayback");
    assignAdPlaySrc(adVideo, src);
    if (String(src).indexOf("blob:") === 0) liveAdBlobUrl = src;
    host.appendChild(adVideo);
    liveAdPlayer = adVideo;
    return adVideo;
  }

  function playAdBreakVideo(url, maxMs) {
    if (!url) {
      return waitMs(0).then(function () {
        return { playedMs: 0, completed: false };
      });
    }
    var card = document.getElementById("vc-seratafilm-ad-card");
    if (card) {
      card.hidden = true;
      card.setAttribute("hidden", "");
    }

    setAdBreakUi(true);
    setAdSpotPlaying(true);
    hideAdTapToPlay();
    setFilmLoading(false);

    var adVideo = null;
    var usedUrl = url;
        var maxMsSafe = Math.max(52000, Math.floor(Number(maxMs) || 0));

    return fetchAdObjectUrl(url).then(function (fetched) {
      return new Promise(function (resolve) {
        var done = false;
        var playStartedAt = 0;
        var lastProgressTime = 0;
        var tapTries = 0;
        var maxTapTries = 1;
        var gaveUpTimer = 0;
        var playSrc = null;

        if (fetched && fetched.ok && fetched.objectUrl) {
          playSrc = fetched.objectUrl;
          usedUrl = playSrc;
        } else {
          try {
            console.warn("[seratafilm] ad fetch failed", fetched);
          } catch (eF) {}
          playSrc = url;
          usedUrl = url;
        }

        function cleanup() {
          try {
            if (adVideo) {
              adVideo.onended = null;
              adVideo.onerror = null;
              adVideo.removeEventListener("timeupdate", onProgress);
              adVideo.removeEventListener("playing", onPlaying);
            }
          } catch (eCl) {}
          if (adBreakMaxTimer) {
            try {
              clearTimeout(adBreakMaxTimer);
            } catch (eMt) {}
            adBreakMaxTimer = 0;
          }
          if (gaveUpTimer) {
            try {
              clearTimeout(gaveUpTimer);
            } catch (eGt) {}
            gaveUpTimer = 0;
          }
          hideAdTapToPlay();
        }

        function finish(result) {
          if (done) return;
          done = true;
          cleanup();
          setAdSpotPlaying(false);
          var playedMs = playStartedAt
            ? Math.max(0, Date.now() - playStartedAt)
            : Math.max(0, (Number(adVideo && adVideo.currentTime) || 0) * 1000);
          resetAdBreakVideoEl();
          resolve({
            playedMs: playedMs,
            completed: Boolean(result && result.completed),
          });
        }

        function tryUnmute() {
          if (!adVideo) return;
          try {
            adVideo.muted = false;
            adVideo.removeAttribute("muted");
            adVideo.volume = 1;
          } catch (eUm) {}
        }

        function onPlaying() {
          if (!playStartedAt) playStartedAt = Date.now();
          hideAdTapToPlay();
          tryUnmute();
        }

        function onProgress() {
          if (!adVideo) return;
          var cur = Number(adVideo.currentTime) || 0;
          if (cur > lastProgressTime + 0.05) {
            lastProgressTime = cur;
            if (!playStartedAt) playStartedAt = Date.now();
            hideAdTapToPlay();
            tryUnmute();
          }
        }

        function wirePlayer(el) {
          adVideo = el;
          adVideo.onended = function () {
            finish({ completed: true });
          };
          adVideo.onerror = function () {
            try {
              console.warn(
                "[seratafilm] ad media error",
                adVideo.error && adVideo.error.code,
                usedUrl
              );
            } catch (eLog) {}
            armTap("Tocca per avviare lo spot");
          };
          adVideo.addEventListener("timeupdate", onProgress);
          adVideo.addEventListener("playing", onPlaying);
        }

        function attemptPlay() {
          if (done || !adVideo) return Promise.resolve(false);
          adVideo.muted = true;
          adVideo.setAttribute("muted", "");
          var p = adVideo.play();
          if (!p || typeof p.then !== "function") {
            hideAdTapToPlay();
            tryUnmute();
            return Promise.resolve(true);
          }
          return p
            .then(function () {
              hideAdTapToPlay();
              waitMs(250).then(tryUnmute);
              return true;
            })
            .catch(function (err) {
              try {
                console.warn(
                  "[seratafilm] ad play blocked",
                  err && err.name,
                  adVideo.readyState,
                  usedUrl
                );
              } catch (eW) {}
              return false;
            });
        }

        function armTap(label) {
          if (done) return;
          if (tapTries >= maxTapTries) {
            finish({ completed: false });
            return;
          }
          var tap = getAdTapButton();
          tap.hidden = false;
          tap.disabled = false;
          tap.textContent = label || "Tocca per avviare lo spot";
          adTapAction = function () {
            if (done) return;
            tapTries += 1;
            tap.disabled = true;
            tap.textContent = "Avvio…";
            if (!adVideo) wirePlayer(prepareAdBreakVideoEl(playSrc));
            attemptPlay().then(function (ok) {
              if (ok || done) return;
              finish({ completed: false });
            });
          };
        }

                adBreakMaxTimer = setTimeout(function () {
          finish({ completed: adVideo && Number(adVideo.currentTime) > 1 });
        }, maxMsSafe + 3000);

                var bootEl = prepareAdBreakVideoEl(playSrc);
        wirePlayer(bootEl);
        waitForAdVideoReady(bootEl, 15000).then(function () {
          if (done) return;
          attemptPlay().then(function (ok) {
            if (ok || done) return;
                        armTap("Tocca per avviare lo spot");
            gaveUpTimer = setTimeout(function () {
              if (done || (adVideo && Number(adVideo.currentTime) > 0.5)) return;
              finish({ completed: false });
            }, 15000);
          });
        });
      });
    });
  }

  function preloadAdBreakVideo(url) {
    if (!url) return;
    setAdBreakWarming(true);
    fetchAdObjectUrl(url).then(function (r) {
      try {
        if (!(r && r.ok)) console.warn("[seratafilm] ad preload", r);
      } catch (eP) {}
    });
  }

  function waitForAdVideoReady(adVideo, timeoutMs) {
    if (!adVideo) return Promise.resolve(false);
    if (Number(adVideo.readyState) >= 2 && !adVideo.error) return Promise.resolve(true);
    return new Promise(function (resolve) {
      var settled = false;
      function finish(ok) {
        if (settled) return;
        settled = true;
        try {
          adVideo.removeEventListener("canplay", onReady);
          adVideo.removeEventListener("loadeddata", onReady);
          adVideo.removeEventListener("canplaythrough", onReady);
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
        finish(Number(adVideo.readyState) >= 2 && !adVideo.error);
      }
      function onErr() {
        finish(false);
      }
      var timer = setTimeout(function () {
        finish(Number(adVideo.readyState) >= 2 && !adVideo.error);
      }, Math.max(2000, Math.floor(Number(timeoutMs) || 12000)));
      adVideo.addEventListener("canplay", onReady);
      adVideo.addEventListener("loadeddata", onReady);
      adVideo.addEventListener("canplaythrough", onReady);
      adVideo.addEventListener("error", onErr);
    });
  }

  function setAdSpotPlaying(active) {
    try {
      document.body.classList.toggle("vc-seratafilm-ad-spot-playing", Boolean(active));
    } catch (eSp) {}
  }

  async function runAdBreakSequence(video) {
    var cfg = resolveAdBreakConfig();
    if (!cfg || adBreakDone || adBreakRunning || !video) return;
    if (wasAdBreakSeenThisScreening()) {
      adBreakDone = true;
      return;
    }
    adBreakRunning = true;
    var resumeAt = Number(video.currentTime) || 0;
    try {
      video.pause();
    } catch (ePause) {}
        if (typeof window.__vcSeratafilmBgmStop === "function") {
      window.__vcSeratafilmBgmStop();
    }
        setAdSpotPlaying(false);
    setAdBreakUi(true);
    var breakStart = Date.now();
    var adPlayedMs = 0;
    var adCompleted = false;
    try {
      try {
        preloadAdBreakVideo(cfg.videoUrl);
      } catch (ePre) {}
      await showAdBreakCard(cfg.introTitle, cfg.introText, cfg.introMs);
      var adMaxMs = Math.max(12000, cfg.totalMs - cfg.introMs - cfg.outroMs);
      var adResult = await playAdBreakVideo(cfg.videoUrl, adMaxMs);
      adPlayedMs = adResult && Number.isFinite(Number(adResult.playedMs)) ? Number(adResult.playedMs) : 0;
      adCompleted = Boolean(adResult && adResult.completed);
      var elapsed = Date.now() - breakStart;
      var outroMs = cfg.outroMs;
      if (!(adCompleted || adPlayedMs >= 2500)) {
        outroMs = 1500;
      } else if (adCompleted || adPlayedMs >= 3000) {
        outroMs = Math.max(cfg.outroMs, Math.min(8000, cfg.totalMs - elapsed));
      }
      setAdSpotPlaying(false);
      setAdBreakUi(true);
      await showAdBreakCard(cfg.outroTitle, cfg.outroText, outroMs);
    } catch (eRun) {
      try {
        console.warn("[seratafilm] ad break error:", eRun && eRun.message ? eRun.message : eRun);
      } catch (eLog) {}
    }
    clearAdBreakTimers();
    setAdSpotPlaying(false);
    setAdBreakUi(false);
    adBreakRunning = false;
    if (typeof window.__vcSeratafilmBgmStop === "function") {
      window.__vcSeratafilmBgmStop();
    }
    var playedEnough = adCompleted || adPlayedMs >= 2500;
    if (playedEnough) {
      adBreakDone = true;
      adBreakFailCount = 0;
      adBreakRetryAfter = 0;
      markAdBreakSeenThisScreening();
    } else {
      adBreakFailCount += 1;
      adBreakRetryAfter = Date.now() + 20000;
      adBreakDone = adBreakFailCount >= 3;
      if (adBreakDone) {
        try {
          console.warn("[seratafilm] ad break skipped after failed loads");
        } catch (eSkip) {}
      }
    }
    if (!filmStarted || !video) return;
    try {
      if (Number.isFinite(resumeAt) && resumeAt >= 0 && Math.abs((Number(video.currentTime) || 0) - resumeAt) > 0.5) {
        video.currentTime = resumeAt;
      }
    } catch (eSeek) {}
    try {
      video.muted = false;
      video.removeAttribute("muted");
      video.controls = true;
    } catch (eMu) {}
        filmPostAdGraceUntil = Date.now() + 45000;
    filmLastProgressAt = Date.now();
    filmLastProgressTime = Number(video.currentTime) || resumeAt || 0;
    filmSeenCurrentTime = filmLastProgressTime;
    filmStallRecoveries = 0;
    adBreakLastCurrentTime = filmLastProgressTime;
    setFilmLoading(false);
    kickInlineFilmPlayback(video);
  }

  function shouldTriggerAdBreak(video) {
    var cfg = resolveAdBreakConfig();
    if (!cfg || adBreakDone || adBreakRunning || !video || video.paused || video.ended) return false;
    if (video.seeking) return false;
    if (adBreakRetryAfter && Date.now() < adBreakRetryAfter) return false;
    var duration = Number(video.duration);
    var current = Number(video.currentTime);
    if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(current)) return false;
    var threshold = duration * (cfg.atPercent / 100);
    var prev = Number(adBreakLastCurrentTime) || 0;
        var crossed = prev < threshold && current >= threshold;
    adBreakLastCurrentTime = current;
    return crossed;
  }

  function bindAdBreakWatcher(video) {
    if (!video || video.dataset.vcSeratafilmAdBreakBound === "1") return;
    if (!resolveAdBreakConfig()) return;
    video.dataset.vcSeratafilmAdBreakBound = "1";
    adBreakLastCurrentTime = Number(video.currentTime) || 0;
    video.addEventListener("timeupdate", function () {
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

  function parseCreditsClock(value) {
    var s = String(value || "").trim();
    if (!s) return NaN;
    if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
    var m = s.match(/^(\d{1,2}):([0-5]\d)(?::([0-5]\d(?:\.\d+)?))?$/);
    if (!m) return NaN;
    var hh = Number(m[1]);
    var mm = Number(m[2]);
    var ss = m[3] != null ? Number(m[3]) : 0;
    if (![hh, mm, ss].every(function (n) {
      return Number.isFinite(n);
    })) {
      return NaN;
    }
    return hh * 3600 + mm * 60 + ss;
  }

  function resolveCreditsSkipConfig() {
    var raw = eventCfg().creditsSkip;
    if (!raw || raw.enabled === false) return null;
    var startFromSeconds = Number(raw.startSeconds);
    var startFromAt = parseCreditsClock(raw.startAt || raw.start || "");
    var startSeconds = Number.isFinite(startFromSeconds)
      ? Math.max(0, startFromSeconds)
      : Number.isFinite(startFromAt)
        ? Math.max(0, startFromAt)
        : NaN;
    if (!Number.isFinite(startSeconds)) return null;
    return {
      startSeconds: startSeconds,
      label: String(raw.label || "Salta titoli di coda").trim() || "Salta titoli di coda",
    };
  }

  function creditsSkipButton() {
    return document.getElementById("vc-seratafilm-credits-skip");
  }

  function setCreditsSkipVisible(show, label) {
    var btn = creditsSkipButton();
    if (!btn) return;
    if (label) {
      try {
        btn.textContent = label;
      } catch (eLabel) {}
    }
    if (show) {
      btn.hidden = false;
      btn.removeAttribute("hidden");
      btn.setAttribute("aria-hidden", "false");
      return;
    }
    btn.hidden = true;
    btn.setAttribute("hidden", "");
    btn.setAttribute("aria-hidden", "true");
  }

  function syncCreditsSkipButton(video) {
    if (filmThanksRedirected || !filmStarted || adBreakRunning) {
      setCreditsSkipVisible(false);
      return;
    }
    var cfg = resolveCreditsSkipConfig();
    if (!cfg || !video) {
      setCreditsSkipVisible(false);
      return;
    }
    var current = Number(video.currentTime);
    if (!Number.isFinite(current)) {
      setCreditsSkipVisible(false);
      return;
    }
    var inCredits = current + 0.15 >= cfg.startSeconds;
    setCreditsSkipVisible(inCredits, cfg.label);
  }

  function bindCreditsSkipButton(video) {
    var btn = creditsSkipButton();
    if (btn && btn.dataset.vcCreditsSkipBound !== "1") {
      btn.dataset.vcCreditsSkipBound = "1";
      btn.addEventListener("click", function (e) {
        try {
          e.preventDefault();
          e.stopPropagation();
        } catch (eClick) {}
        var cfg = resolveCreditsSkipConfig();
        if (!cfg) return;
        var v = document.getElementById("vc-seratafilm-film-video");
        var current = v ? Number(v.currentTime) : NaN;
        if (!Number.isFinite(current) || current + 0.15 < cfg.startSeconds) return;
        redirectToThanksPage();
      });
    }
    if (!video || video.dataset.vcCreditsSkipWatch === "1") return;
    video.dataset.vcCreditsSkipWatch = "1";
    ["timeupdate", "seeked", "play", "pause", "ended"].forEach(function (evName) {
      video.addEventListener(evName, function () {
        syncCreditsSkipButton(video);
      });
    });
    syncCreditsSkipButton(video);
  }

  function setFilmLoading(show, message) {
    var el = document.getElementById("vc-seratafilm-film-loading");
    if (!el) return;
    if (show) {
      ensureFilmLoadingUi(el);
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

  function hideFilmGestureTap() {
    filmGestureTapAction = null;
    if (!filmGestureTapEl) return;
    filmGestureTapEl.hidden = true;
    filmGestureTapEl.setAttribute("hidden", "");
  }

  function showFilmGestureTap(label, onTap) {
    filmGestureTapAction = typeof onTap === "function" ? onTap : null;
    if (!filmGestureTapEl) {
      filmGestureTapEl = document.createElement("button");
      filmGestureTapEl.id = "vc-seratafilm-film-tap";
      filmGestureTapEl.type = "button";
      filmGestureTapEl.className = "vc-seratafilm-ad-tap";
      filmGestureTapEl.addEventListener("click", function () {
        var fn = filmGestureTapAction;
        hideFilmGestureTap();
        armPlaybackGesture();
        if (typeof fn === "function") fn();
      });
      document.body.appendChild(filmGestureTapEl);
    }
    filmGestureTapEl.textContent = String(label || "Tocca per avviare");
    filmGestureTapEl.hidden = false;
    filmGestureTapEl.removeAttribute("hidden");
  }

  function armPlaybackGesture() {
    playbackGestureArmed = true;
  }

  function bindPlaybackGestureArm() {
    if (document.documentElement.dataset.vcSfGestureBound === "1") return;
    document.documentElement.dataset.vcSfGestureBound = "1";
    function onGesture() {
      armPlaybackGesture();
    }
    ["pointerdown", "keydown", "touchstart"].forEach(function (evName) {
      document.addEventListener(evName, onGesture, { capture: true, passive: true });
    });
  }

  function requestFilmFullscreen(video) {
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) return Promise.resolve();
    } catch (e0) {}
    var root = document.getElementById("vc-seratafilm-film");
    var target = root || document.documentElement;
    try {
      if (video && typeof video.webkitEnterFullscreen === "function") {
        video.webkitEnterFullscreen();
        return Promise.resolve();
      }
    } catch (eWeb) {}
    var req =
      (target && (target.requestFullscreen || target.webkitRequestFullscreen || target.msRequestFullscreen)) ||
      (document.documentElement.requestFullscreen ||
        document.documentElement.webkitRequestFullscreen ||
        document.documentElement.msRequestFullscreen);
    if (typeof req !== "function") return Promise.resolve();
    try {
      var out = req.call(target || document.documentElement);
      if (out && typeof out.catch === "function") return out.catch(function () {});
      return Promise.resolve();
    } catch (eFs) {
      return Promise.resolve();
    }
  }

  function ensureFilmFullscreen(video) {
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) return;
    } catch (eChk) {}
            if (playbackGestureArmed) requestFilmFullscreen(video);
  }

  function kickInlineFilmPlayback(video) {
    if (!video || !filmStarted || video.ended) return;
    if (!video.paused) return;
    tryPlayInlineFilm(video);
  }

  function tryPlayInlineFilm(video) {
    if (!video) return;
    function unmuteIfArmed() {
      if (!playbackGestureArmed) return;
      try {
        video.muted = false;
        video.removeAttribute("muted");
      } catch (eMu) {}
    }
        try {
      video.muted = !playbackGestureArmed;
      if (video.muted) video.setAttribute("muted", "");
    } catch (eM0) {}
    var p = video.play();
    if (p && typeof p.then === "function") {
      p.then(function () {
        unmuteIfArmed();
        hideFilmGestureTap();
        maybeHideFilmLoading(video);
      }).catch(function () {
        try {
          video.muted = true;
          video.setAttribute("muted", "");
        } catch (eM1) {}
        var p2 = video.play();
        if (p2 && typeof p2.then === "function") {
          p2.then(function () {
            unmuteIfArmed();
            hideFilmGestureTap();
            maybeHideFilmLoading(video);
            if (!playbackGestureArmed) {
              showFilmGestureTap("Tocca per audio e schermo intero", function () {
                unmuteIfArmed();
                requestFilmFullscreen(video);
              });
            }
          }).catch(function () {
            setFilmLoading(true, "Tocca per avviare la proiezione.");
            showFilmGestureTap("Tocca per avviare la proiezione", function () {
              requestFilmFullscreen(video);
              try {
                video.muted = false;
                video.removeAttribute("muted");
              } catch (eMu2) {}
              var p3 = video.play();
              if (p3 && typeof p3.catch === "function") p3.catch(function () {});
            });
          });
        }
      });
    }
  }

  var filmStallRecoveries = 0;
  var filmLastProgressAt = 0;
  var filmLastProgressTime = 0;
  var filmStallWatchTimer = 0;
  var filmBootLoadingUntil = 0;
  var filmBufferReady = false;
  var FILM_BOOT_LOADING_MIN_MS = 450;

  function setFilmRootStage(stage) {
    var root = document.getElementById("vc-seratafilm-film");
    if (!root) return;
    var mode = String(stage || "idle");
    root.classList.remove("is-preloading");
    if (mode === "preload") {
      root.hidden = false;
      root.removeAttribute("hidden");
      root.classList.add("is-preloading");
      root.setAttribute("aria-hidden", "true");
      return;
    }
    if (mode === "play") {
      root.hidden = false;
      root.removeAttribute("hidden");
      root.setAttribute("aria-hidden", "false");
      return;
    }
    root.hidden = true;
    root.setAttribute("hidden", "");
    root.setAttribute("aria-hidden", "true");
  }

  function pauseCompetingMediaForFilmPreload() {
    try {
      if (typeof window.__vcSeratafilmPauseHogwartsBg === "function") {
        window.__vcSeratafilmPauseHogwartsBg();
      }
    } catch (eBg) {}
  }

  function markFilmBufferReady() {
    filmBufferReady = true;
    maybeHideFilmLoading();
  }

  function maybeHideFilmLoading(video) {
    var el = document.getElementById("vc-seratafilm-film-loading");
    if (!el || el.hidden) return;
    if (!filmStarted) return;
    video = video || document.getElementById("vc-seratafilm-film-video");
    if (!video) return;
    var minTimeOk = Date.now() >= filmBootLoadingUntil;
    var bufferedEnd = 0;
    try {
      if (video.buffered && video.buffered.length) bufferedEnd = Number(video.buffered.end(0)) || 0;
    } catch (eBuf) {}
    var bufferOk =
      filmBufferReady ||
      Number(video.readyState) >= 2 ||
      bufferedEnd > 0.35;
    var playingFrame = !video.paused && Number(video.currentTime) > 0.02;
    if (minTimeOk && (bufferOk || playingFrame)) {
      setFilmLoading(false);
    }
  }

  function ensureFilmLoadingUi(el) {
    if (!el || el.querySelector(".vc-seratafilm-film__loading-spinner")) return;
    var text = el.querySelector(".vc-seratafilm-film__loading-text");
    if (!text) return;
    var card = document.createElement("div");
    card.className = "vc-seratafilm-film__loading-card";
    var spinner = document.createElement("div");
    spinner.className = "vc-seratafilm-film__loading-spinner";
    spinner.setAttribute("aria-hidden", "true");
    el.insertBefore(card, text);
    card.appendChild(spinner);
    card.appendChild(text);
  }

  function clearFilmStallWatch() {
    if (!filmStallWatchTimer) return;
    try {
      clearInterval(filmStallWatchTimer);
    } catch (eSw) {}
    filmStallWatchTimer = 0;
  }

  function syncFilmProgressClock(video) {
    if (!video) return;
    var t = Number(video.currentTime) || 0;
    filmSeenCurrentTime = t;
    filmLastProgressTime = t;
    filmLastProgressAt = Date.now();
    filmStallRecoveries = 0;
  }

  function noteFilmProgress(video) {
    if (!video) return;
    var t = Number(video.currentTime) || 0;
    var prev = Number(filmSeenCurrentTime) || 0;
    var delta = Math.abs(t - prev);
        if (delta > 0.04) {
      filmSeenCurrentTime = t;
      filmLastProgressTime = t;
      filmLastProgressAt = Date.now();
      if (delta < 2.5) filmStallRecoveries = 0;
      maybeHideFilmLoading(video);
    }
  }

  function recoverInlineFilmPlayback(video, hard) {
    if (!video || !filmStarted || video.ended) return;
    var duration = Number(video.duration);
    var cur = Number(video.currentTime) || 0;
    var nearEnd = Number.isFinite(duration) && duration > 30 && cur >= Math.max(0, duration - 120);
    filmStallRecoveries += 1;
        if (nearEnd || Date.now() < filmPostAdGraceUntil) {
      tryPlayInlineFilm(video);
      return;
    }
        var resumeAt = Math.max(0, cur - 0.25);
    try {
      if (hard) {
        video.load();
        video.currentTime = resumeAt;
      } else if (cur > 0.2) {
        video.currentTime = Math.max(0, cur - 0.15);
      }
    } catch (eSeek) {}
    tryPlayInlineFilm(video);
  }

  function bindFilmStallWatch(video) {
    if (!video) return;
    clearFilmStallWatch();
    syncFilmProgressClock(video);
    filmStallWatchTimer = setInterval(function () {
      if (!filmStarted || !video || video.paused || video.ended || adBreakRunning) return;
      var stallMs = Date.now() - filmLastProgressAt;
      if (stallMs < 8000) return;
      var duration = Number(video.duration);
      var cur = Number(video.currentTime) || 0;
      var nearEnd = Number.isFinite(duration) && duration > 30 && cur >= Math.max(0, duration - 120);
      var inGrace = Date.now() < filmPostAdGraceUntil;
      if (inGrace) {
        setFilmLoading(true, "Buffering…");
        tryPlayInlineFilm(video);
        return;
      }
      if (nearEnd) {
        if (filmStallRecoveries < 3) {
          setFilmLoading(true, "Buffering…");
          recoverInlineFilmPlayback(video, false);
          return;
        }
        setFilmLoading(true, "Buffering in corso vicino alla fine…");
        tryPlayInlineFilm(video);
        return;
      }
      if (filmStallRecoveries < 2) {
        setFilmLoading(true, "Buffering…");
        recoverInlineFilmPlayback(video, false);
        return;
      }
      if (filmStallRecoveries < 4) {
        setFilmLoading(true, "Riconnessione allo stream…");
        recoverInlineFilmPlayback(video, true);
        return;
      }
      setFilmLoading(true, "La proiezione si è bloccata. Premi play o ricarica la pagina.");
    }, 3000);
  }

  function bindInlineFilmPlaybackHelpers(video) {
    if (!video || video.dataset.vcSeratafilmPlaybackBound === "1") return;
    video.dataset.vcSeratafilmPlaybackBound = "1";
    video.addEventListener("error", function () {
      if (!filmStarted || adBreakRunning) return;
      setFilmLoading(true, "Impossibile caricare il film. Ricarica la pagina o contatta lo staff.");
    });
    video.addEventListener("waiting", function () {
      if (!filmStarted || video.paused || adBreakRunning) return;
      setFilmLoading(true, "Buffering…");
    });
    video.addEventListener("stalled", function () {
      if (!filmStarted || video.paused || adBreakRunning) return;
      setFilmLoading(true, "Buffering…");
    });
    video.addEventListener("playing", function () {
      filmLastProgressAt = Date.now();
      maybeHideFilmLoading(video);
    });
    video.addEventListener("canplay", function () {
      markFilmBufferReady();
      maybeHideFilmLoading(video);
    });
    video.addEventListener("canplaythrough", function () {
      markFilmBufferReady();
    });
    video.addEventListener("loadeddata", function () {
      if (Number(video.readyState) >= 2) markFilmBufferReady();
    });
    video.addEventListener("seeking", function () {
      if (!filmStarted || adBreakRunning) return;
      syncFilmProgressClock(video);
    });
    video.addEventListener("seeked", function () {
      if (!filmStarted || adBreakRunning) return;
      syncFilmProgressClock(video);
      adBreakLastCurrentTime = Number(video.currentTime) || 0;
    });
    video.addEventListener("timeupdate", function () {
      if (!filmStarted) return;
      noteFilmProgress(video);
    });
    bindFilmStallWatch(video);
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
    var preloadMode = resolveFilmPreloadMode(distanzaMs, forced);
    // siteApiW9: ad solo a ridosso / forced (no fetch blob GB in anticipo).
    if (adCfg && preloadMode === "auto") preloadAdBreakVideo(adCfg.videoUrl);
    injectFilmPreloadLink(url, preloadMode);
    if (preloadMode === "auto" && !filmStarted) {
      setFilmRootStage("preload");
      pauseCompetingMediaForFilmPreload();
    }
    var cacheKey = url + "|" + preloadMode;
    if (video.dataset.vcSeratafilmPreloaded === cacheKey) return;
    video.dataset.vcSeratafilmPreloaded = cacheKey;
    video.preload = preloadMode;
    video.playsInline = true;
    if (!sameMediaUrl(video.currentSrc || video.src, url)) {
      video.src = url;
      try {
        video.load();
      } catch (eL) {}
    } else if (preloadMode === "auto") {
            try {
        if (Number(video.readyState) < 2) video.load();
      } catch (eReload) {}
    }
  }

  function startInlineFilmPlayer(url) {
    if (filmStarted) return;
    filmStarted = true;
    adBreakDone = false;
    adBreakRunning = false;
    adBreakFailCount = 0;
    adBreakRetryAfter = 0;
    adVideoLoadLocked = false;
    adBreakLastCurrentTime = 0;
    filmPostAdGraceUntil = 0;
    filmStallRecoveries = 0;
    filmBufferReady = false;
    filmBootLoadingUntil = Date.now() + FILM_BOOT_LOADING_MIN_MS;
    filmLastProgressAt = Date.now();
    filmLastProgressTime = 0;
    filmSeenCurrentTime = 0;
    clearFilmStallWatch();
    syncAdBreakDoneFromStorage();
    clearAdBreakTimers();
    setAdBreakUi(false);
    hideFilmGestureTap();
    clearCountdownAudioArm();
    clearCountdownAudioFastGuard();
    try {
      if (countdownAudioEl) countdownAudioEl.pause();
    } catch (eAud) {}
    var root = document.getElementById("vc-seratafilm-film");
    var video = document.getElementById("vc-seratafilm-film-video");
    if (!root || !video) {
      window.location.href = url;
      return;
    }
    try {
      document.body.classList.remove("vc-seratafilm-final10", "vc-seratafilm-final-fullscreen");
      document.documentElement.classList.remove("vc-seratafilm-final-fullscreen");
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
    pauseCompetingMediaForFilmPreload();
    setFilmRootStage("play");
    setFilmLoading(true, "Avvio proiezione…");
    video.playsInline = true;
    video.controls = true;
    video.preload = "auto";
    setCreditsSkipVisible(false);
    bindInlineFilmEndRedirect(video);
    bindCreditsSkipButton(video);
    bindInlineFilmPlaybackHelpers(video);
    bindAdBreakWatcher(video);
    bindFilmStallWatch(video);
    var adCfgStart = resolveAdBreakConfig();
    if (adCfgStart) preloadAdBreakVideo(adCfgStart.videoUrl);
    var alreadySame = sameMediaUrl(video.currentSrc || video.src, url);
    if (!alreadySame) {
      video.src = url;
      try {
        video.load();
      } catch (eV) {}
    }
        try {
      var curT = Number(video.currentTime) || 0;
      if (!alreadySame || curT > 1.25) video.currentTime = 0;
    } catch (eT) {}
    if (Number(video.readyState) >= 2) {
      markFilmBufferReady();
    }
    ensureFilmFullscreen(video);
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
        markFilmBufferReady();
        kickInlineFilmPlayback(video);
      },
      { once: true },
    );
    video.addEventListener(
      "canplaythrough",
      function () {
        markFilmBufferReady();
        kickInlineFilmPlayback(video);
      },
      { once: true },
    );
    [80, 220, 600, 1200].forEach(function (delayMs) {
      setTimeout(function () {
        maybeHideFilmLoading(video);
        kickInlineFilmPlayback(video);
      }, delayMs);
    });
  }

  function openFilm(forcePreload) {
    var openAttempt = 0;
    var maxAttempts = 48;
    function attempt() {
      var url = resolveFilmUrl(linkFilmUrl());
      if (usableInlineFilmUrl(url)) {
        if (forcePreload) preloadInlineFilm(url, { forceAuto: true });
        startInlineFilmPlayer(url);
        return;
      }
      if ((!url || isNginxBlockedPublicFilmUrl(url)) && openAttempt < maxAttempts) {
        openAttempt += 1;
        if (openAttempt === 1 || openAttempt % 8 === 0) {
          try {
            setFilmLoading(true, "Collegamento allo stream…");
            var root = document.getElementById("vc-seratafilm-film");
            if (root) {
              root.hidden = false;
              root.removeAttribute("hidden");
              root.classList.remove("is-preloading");
              root.setAttribute("aria-hidden", "false");
            }
            document.body.classList.add("vc-seratafilm-film-active");
            document.documentElement.classList.add("vc-seratafilm-film-active");
          } catch (eWait) {}
        }
        setTimeout(attempt, 250);
        return;
      }
      if (url && !isNginxBlockedPublicFilmUrl(url) && !isInlineFilmUrl(url)) {
        window.location.href = url;
        return;
      }
      try {
        setFilmLoading(true, "Stream non disponibile. Ricarica la pagina o contatta lo staff.");
        document.body.classList.add("vc-seratafilm-film-active");
        document.documentElement.classList.add("vc-seratafilm-film-active");
        var rootFail = document.getElementById("vc-seratafilm-film");
        if (rootFail) {
          rootFail.hidden = false;
          rootFail.removeAttribute("hidden");
        }
      } catch (eFail) {}
      try {
        console.warn("[seratafilm] openFilm: missing filmStreamUrl", url);
      } catch (eLog) {}
    }
    attempt();
  }

  var countdownAudioEl = null;
  var tenSecondsAudioTriggered = false;
  var countdownAudioPlayArmed = false;
  var fsRequested = false;
  var countdownAudioArmTimer = 0;
  var countdownAudioFastGuardInterval = 0;
  var countdownAudioWarmPromise = null;
  var MAX_SET_TIMEOUT_MS = 2147483647;
  var finalFullscreenScrollLockBound = false;
  /* sfCountdownSync3: mp3 first beep ~1.14s; align that to visual "10" (T-10000) */
  var COUNTDOWN_FIRST_BEEP_SEC = 1.141;
  var COUNTDOWN_LEAD_MS = Math.round(10000 + COUNTDOWN_FIRST_BEEP_SEC * 1000);
  var COUNTDOWN_BEEP_AT_SEC = [1.141, 2.073, 3.212, 4.099, 5.155, 6.312, 7.382, 8.354, 9.407, 10.36];

  function onFinalFullscreenScrollBlock(e) {
    try {
      if (!document.body || !document.body.classList.contains("vc-seratafilm-final-fullscreen")) return;
      e.preventDefault();
    } catch (eLock) {}
  }

  function setFinalFullscreenUi(on) {
    try {
      document.body.classList.toggle("vc-seratafilm-final-fullscreen", !!on);
      document.documentElement.classList.toggle("vc-seratafilm-final-fullscreen", !!on);
    } catch (eFs) {}
    if (on && !finalFullscreenScrollLockBound) {
      finalFullscreenScrollLockBound = true;
      try {
        document.addEventListener("touchmove", onFinalFullscreenScrollBlock, { passive: false, capture: true });
        document.addEventListener("wheel", onFinalFullscreenScrollBlock, { passive: false, capture: true });
      } catch (eBind) {}
    }
  }

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

    function scheduleCountdownAudioFromFilmAt() {
    clearCountdownAudioArm();
    function step() {
      if (tenSecondsAudioTriggered) return;
      var film = getFilmAtForCountdown(Date.now());
      var ms = film - Date.now() - COUNTDOWN_LEAD_MS;
      if (!Number.isFinite(ms)) return;
      if (ms <= 0) {
        tryPlayCountdownLead();
        return;
      }
      if (ms <= 180000) warmCountdownAudio();
      var wait = Math.min(ms, MAX_SET_TIMEOUT_MS);
      countdownAudioArmTimer = setTimeout(function () {
        countdownAudioArmTimer = 0;
        step();
      }, wait);
    }
    step();
  }

  function countdownMp3Url() {
    var href = "countdown.mp3";
    try {
      href = new URL("countdown.mp3", window.location.href).href;
    } catch (e) {}
    try {
      var ver = String(window.__vcSeratafilmAssetVersion || "").trim();
      if (ver) {
        var u = new URL(href, window.location.href);
        u.searchParams.set("v", ver);
        return u.href;
      }
    } catch (eV) {}
    return href;
  }

  function ensureCountdownAudio() {
    if (countdownAudioEl) return countdownAudioEl;
    try {
      countdownAudioEl = new Audio();
      countdownAudioEl.preload = "auto";
      countdownAudioEl.src = countdownMp3Url();
      try {
        countdownAudioEl.load();
      } catch (eLoad) {}
    } catch (e2) {
      countdownAudioEl = null;
    }
    return countdownAudioEl;
  }

  function warmCountdownAudio() {
    var a = ensureCountdownAudio();
    if (!a) return Promise.resolve(false);
    if (countdownAudioWarmPromise) return countdownAudioWarmPromise;
    countdownAudioWarmPromise = new Promise(function (resolve) {
      var done = false;
      function finish(ok) {
        if (done) return;
        done = true;
        resolve(Boolean(ok));
      }
      try {
        if (Number(a.readyState) >= 3) {
          finish(true);
          return;
        }
      } catch (eRs) {}
      var onReady = function () {
        cleanup();
        finish(true);
      };
      var onErr = function () {
        cleanup();
        finish(false);
      };
      function cleanup() {
        try {
          a.removeEventListener("canplaythrough", onReady);
          a.removeEventListener("canplay", onReady);
          a.removeEventListener("error", onErr);
        } catch (eC) {}
      }
      try {
        a.addEventListener("canplaythrough", onReady);
        a.addEventListener("canplay", onReady);
        a.addEventListener("error", onErr);
        a.load();
      } catch (eWarm) {
        finish(false);
        return;
      }
      try {
        fetch(countdownMp3Url(), { credentials: "same-origin", cache: "force-cache" })
          .then(function (res) {
            if (!res || !res.ok) return null;
            return res.blob();
          })
          .then(function (blob) {
            if (!blob) return;
            try {
              var obj = URL.createObjectURL(blob);
              a.src = obj;
              a.load();
            } catch (eBlob) {}
          })
          .catch(function () {});
      } catch (eFetch) {}
      setTimeout(function () {
        finish(Number(a.readyState) >= 2);
      }, 8000);
    });
    return countdownAudioWarmPromise;
  }

  function syncCountdownAudioOffset(a, remainingMs) {
    if (!a) return;
    var r = Number(remainingMs);
    if (!Number.isFinite(r) || r <= 0) return;
    var n = Math.max(1, Math.min(10, Math.ceil(r / 1000)));
    var idx = 10 - n;
    var beepAt = COUNTDOWN_BEEP_AT_SEC[idx];
    if (!Number.isFinite(beepAt)) return;
    var target = Math.max(0, beepAt - 0.08);
    try {
      if (Math.abs((Number(a.currentTime) || 0) - target) > 0.35) {
        a.currentTime = target;
      }
    } catch (eSeek) {}
  }

  function hushBgmForCountdownLead() {
    try {
      if (typeof window.__vcSeratafilmBgmStop === "function") {
        window.__vcSeratafilmBgmStop();
      }
    } catch (eStop) {}
  }

  function tryPlayCountdownLead() {
    if (tenSecondsAudioTriggered) return;
    var a = ensureCountdownAudio();
    if (!a) return;
    countdownAudioPlayArmed = true;
    clearCountdownAudioArm();
    warmCountdownAudio();
    hushBgmForCountdownLead();
    var remaining = getFilmAtForCountdown(Date.now()) - Date.now();
    if (remaining < COUNTDOWN_LEAD_MS - 250) {
      syncCountdownAudioOffset(a, remaining);
    } else {
      try {
        a.currentTime = 0;
      } catch (eCt) {}
    }
    var markPlaying = function () {
      if (tenSecondsAudioTriggered) return;
      tenSecondsAudioTriggered = true;
      clearCountdownAudioFastGuard();
      try {
        a.removeEventListener("playing", markPlaying);
      } catch (eRm) {}
    };
    try {
      a.addEventListener("playing", markPlaying);
    } catch (ePlayEv) {}
    var p = a.play();
    if (p && typeof p.then === "function") {
      p.then(function () {
        markPlaying();
      }).catch(function () {
        /* keep retrying via fast guard until film starts */
        countdownAudioPlayArmed = true;
      });
    }
  }

  function clearFinalCountdownUi(options) {
    var keepFullscreen = Boolean(options && options.keepFullscreen);
    try {
      document.body.classList.remove("vc-seratafilm-final10", "vc-seratafilm-final-fullscreen");
      document.documentElement.classList.remove("vc-seratafilm-final-fullscreen");
    } catch (eC) {}
    try {
      var fsRoot = document.getElementById("vc-seratafilm-fs-countdown");
      if (fsRoot) fsRoot.setAttribute("aria-hidden", "true");
    } catch (eA) {}
    if (!keepFullscreen) {
      try {
        if ((document.fullscreenElement || document.webkitFullscreenElement) && document.exitFullscreen) {
          document.exitFullscreen().catch(function () {});
        }
      } catch (eF) {}
      fsRequested = false;
    }
  }

  window.__vcSeratafilmStartCountdown = function () {
    tenSecondsAudioTriggered = false;
    countdownAudioPlayArmed = false;
    countdownAudioWarmPromise = null;
    fsRequested = false;
    filmStarted = false;
    adBreakDone = false;
    adBreakRunning = false;
    adBreakFailCount = 0;
    adBreakRetryAfter = 0;
    adVideoLoadLocked = false;
    adBreakLastCurrentTime = 0;
    filmPostAdGraceUntil = 0;
    filmStallRecoveries = 0;
    filmSeenCurrentTime = 0;
    hideFilmGestureTap();
    bindPlaybackGestureArm();
    clearFilmStallWatch();
    clearAdBreakTimers();
    setAdBreakUi(false);
    clearCountdownAudioArm();
    clearCountdownAudioFastGuard();
    try {
      document.body.classList.remove("vc-seratafilm-final10", "vc-seratafilm-final-fullscreen", "vc-seratafilm-film-active");
      document.documentElement.classList.remove("vc-seratafilm-final-fullscreen", "vc-seratafilm-film-active");
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
    function currentFilmUrl() {
      return resolveFilmUrl(linkFilmUrl());
    }
    var openNow = document.getElementById("openNow");
    if (openNow && !openNow.dataset.vcSeratafilmOpenBound) {
      openNow.dataset.vcSeratafilmOpenBound = "1";
      openNow.addEventListener("click", function () {
        armPlaybackGesture();
        if (window.__vcSeratafilmCountdownInterval) {
          clearInterval(window.__vcSeratafilmCountdownInterval);
          window.__vcSeratafilmCountdownInterval = 0;
        }
        clearCountdownAudioArm();
        clearCountdownAudioFastGuard();
                clearFinalCountdownUi({ keepFullscreen: true });
        var clickFilmUrl = currentFilmUrl();
        if (usableInlineFilmUrl(clickFilmUrl)) preloadInlineFilm(clickFilmUrl, { forceAuto: true });
        openFilm(true);
      });
    }
    function tick() {
      var oraAttuale = Date.now();
      var dataFilm = getFilmAtForCountdown(oraAttuale);
      var distanza = dataFilm - oraAttuale;
      var filmUrl = currentFilmUrl();

      if (typeof window.__vcSeratafilmBgmOnTick === "function") {
        window.__vcSeratafilmBgmOnTick(distanza);
      }

      if (usableInlineFilmUrl(filmUrl)) {
        if (distanza <= 600000) {
          injectFilmPreloadLink(filmUrl, "auto");
          preloadInlineFilm(filmUrl, { forceAuto: true, distanzaMs: distanza });
          if (distanza <= 180000) {
            var adCfgTick = resolveAdBreakConfig();
            if (adCfgTick) preloadAdBreakVideo(adCfgTick.videoUrl);
          }
        } else if (distanza <= 1200000) {
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

      if (distanza <= 180000) warmCountdownAudio();
      else ensureCountdownAudio();

      if (distanza <= COUNTDOWN_LEAD_MS) {
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
            if (d <= COUNTDOWN_LEAD_MS) tryPlayCountdownLead();
            if (d <= 0) clearCountdownAudioFastGuard();
            /* keep FS digit in sync while audio retries */
            try {
              var fsN = document.getElementById("vc-seratafilm-fs-number");
              if (fsN && d > 0 && d <= 10000) {
                fsN.textContent = String(Math.max(0, Math.ceil(d / 1000)));
              }
            } catch (eFsFast) {}
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
        setFinalFullscreenUi(true);
        if (fsRoot) fsRoot.setAttribute("aria-hidden", "false");
        if (fsNum) fsNum.textContent = String(Math.max(0, Math.ceil(distanza / 1000)));
        if (!fsRequested && playbackGestureArmed) {
          fsRequested = true;
          requestFilmFullscreen(null);
        }
      } else {
        setFinalFullscreenUi(false);
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
        try {
          te.removeAttribute("data-i18n");
          te.removeAttribute("data-i18n-src");
        } catch (eI18) {}
        /* sfCountdownStable1: update nums in place — full innerHTML every tick looked like a reload */
        var existing = te.querySelectorAll(".tile .num");
        if (existing && existing.length === 4) {
          existing[0].textContent = String(giorni);
          existing[1].textContent = String(ore);
          existing[2].textContent = String(minuti);
          existing[3].textContent = String(secondi);
        } else {
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

  try {
    window.addEventListener("vc:access-ok", function () {
      var url = resolveFilmUrl(linkFilmUrl());
      if (!usableInlineFilmUrl(url)) return;
      injectFilmPreloadLink(url, "auto");
      preloadInlineFilm(url, { forceAuto: true });
      try {
        var due = getFilmAtForCountdown(Date.now()) - Date.now();
        if (due <= 180000) warmCountdownAudio();
        if (due <= 0 && !filmStarted) openFilm(true);
      } catch (eDue) {}
    });
  } catch (eAccessOk) {}
})();