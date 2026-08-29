(function () {
  var DEFAULT_SRC = "/images/evento-hogwarts/theme-bg.mp4";
  var FALLBACK_SRC = "/images/evento-hogwarts/inizio.mp4";
  var videoEl = null;
  var wrapEl = null;
  var started = false;
  var lastInputAt = 0;
  var IDLE_MS = 3200;
  var idleTimer = 0;

  function cfgSrc() {
    try {
      var ev = window.__VC_SERATAFILM_EVENT || {};
      var raw = String(ev.hogwartsThemeVideoUrl || "").trim();
      if (raw && !/\{\{/.test(raw) && !/youtube\.com|youtu\.be/i.test(raw)) return raw;
    } catch (e0) {}
    try {
      var hw = window.__VC_HOGWARTS || {};
      var raw2 = String(hw.themeVideoUrl || hw.introVideo || "").trim();
      if (raw2 && !/\{\{/.test(raw2) && !/youtube\.com|youtu\.be/i.test(raw2)) return raw2;
    } catch (e1) {}
    return DEFAULT_SRC;
  }

  function absUrl(raw) {
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

  function uiChromeBusy() {
    try {
      if (typeof window.__vcUiChromeBusy === "function") return window.__vcUiChromeBusy();
    } catch (e0) {}
    try {
      var r = document.documentElement;
      if (!r || !r.classList) return false;
      return (
        r.classList.contains("vc-mobile-nav-open") ||
        r.classList.contains("vc-staff-stat-sheet-open") ||
        r.classList.contains("vc-staff-manage-sheet-open") ||
        r.classList.contains("vc-staff-datepicker-open") ||
        r.classList.contains("vc-dialog-open") ||
        r.classList.contains("vc-notif-sheet-open")
      );
    } catch (e1) {
      return false;
    }
  }

  function ensureShell() {
    if (wrapEl && videoEl) return true;
    wrapEl = document.getElementById("vc-hw-theme-bg");
    if (!wrapEl) {
      wrapEl = document.createElement("div");
      wrapEl.id = "vc-hw-theme-bg";
      wrapEl.className = "vc-hw-theme-bg";
      wrapEl.setAttribute("aria-hidden", "true");
      var veil = document.createElement("div");
      veil.className = "vc-hw-theme-bg__veil";
      videoEl = document.createElement("video");
      videoEl.id = "vc-hw-theme-bg-video";
      videoEl.className = "vc-hw-theme-bg__video";
      videoEl.muted = true;
      videoEl.defaultMuted = true;
      videoEl.loop = true;
      videoEl.playsInline = true;
      videoEl.setAttribute("playsinline", "");
      videoEl.setAttribute("muted", "");
      videoEl.preload = "metadata";
      wrapEl.appendChild(videoEl);
      wrapEl.appendChild(veil);
      var body = document.body;
      if (!body) return false;
      var first = body.firstChild;
      if (first) body.insertBefore(wrapEl, first);
      else body.appendChild(wrapEl);
    } else {
      videoEl = document.getElementById("vc-hw-theme-bg-video") || wrapEl.querySelector("video");
    }
    return Boolean(wrapEl && videoEl);
  }

  function pageWantsThemeBg() {
    if (document.hidden) return false;
    try {
      if (typeof document.hasFocus === "function" && !document.hasFocus()) return false;
    } catch (eF) {}
    if (document.body && document.body.classList.contains("vc-hw-cinema-active")) return false;
    if (uiChromeBusy()) return false;
    if (lastInputAt && Date.now() - lastInputAt > IDLE_MS) return false;
    return true;
  }

  function playSafe() {
    if (!videoEl) return;
    if (!pageWantsThemeBg()) return;
    var p = videoEl.play();
    if (p && typeof p.catch === "function") p.catch(function () {});
  }

  function pauseSafe() {
    if (!videoEl) return;
    try {
      videoEl.pause();
    } catch (eP) {}
  }

  function syncThemeBgRunState() {
    if (!started) return;
    if (pageWantsThemeBg()) playSafe();
    else pauseSafe();
  }

  function noteInput() {
    lastInputAt = Date.now();
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = 0;
    }
    idleTimer = setTimeout(syncThemeBgRunState, IDLE_MS + 40);
    syncThemeBgRunState();
  }

  function loadSrc(src, triedFallback) {
    if (!ensureShell()) return;
    var url = absUrl(src || DEFAULT_SRC);
    videoEl.onerror = function () {
      if (!triedFallback && url.indexOf("theme-bg.mp4") !== -1) {
        loadSrc(FALLBACK_SRC, true);
      }
    };
    if (videoEl.getAttribute("src") !== url && videoEl.src !== url) {
      videoEl.src = url;
      try {
        videoEl.load();
      } catch (eL) {}
    }
    try {
      document.documentElement.classList.add("vc-hw-theme-bg-live");
      document.body.classList.add("vc-hw-theme-bg-live");
    } catch (eC) {}
    lastInputAt = Date.now();
    playSafe();
    started = true;
  }

  function wireCinemaPause() {
    if (!document.body || typeof MutationObserver === "undefined") return;
    var obs = new MutationObserver(function () {
      syncThemeBgRunState();
    });
    obs.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    try {
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    } catch (eHtml) {}
  }

  function boot() {
    if (!document.body || !document.body.classList.contains("vc-hw-page")) return;
    loadSrc(cfgSrc(), false);
    wireCinemaPause();
    document.addEventListener("visibilitychange", syncThemeBgRunState);
    window.addEventListener("blur", syncThemeBgRunState);
    window.addEventListener("focus", noteInput);
    document.addEventListener("pointerdown", noteInput, { passive: true, capture: true });
    document.addEventListener("pointermove", noteInput, { passive: true, capture: true });
    document.addEventListener("keydown", noteInput, { passive: true, capture: true });
    document.addEventListener("scroll", noteInput, { passive: true, capture: true });
    noteInput();
  }

  window.__vcHogwartsThemeBgPlay = playSafe;
  window.__vcHogwartsThemeBgPause = pauseSafe;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
