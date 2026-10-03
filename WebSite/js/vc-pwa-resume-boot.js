/**
 * pwaResumeWin1: resume PWA affidabile su Windows (minimal-ui / no wipe / shell flag).
 * pwaResumeForever1: nessuna scadenza TTL — riapertura dopo X ripristina sempre l'ultima pagina.
 * Marker: 20261003pwaResumeForever1
 */
(function () {
  if (window.__vcPwaResumeBoot) return;
  window.__vcPwaResumeBoot = 1;

  var RESUME_KEY = "vc-pwa-resume";
  var WANT_HOME_KEY = "vc-pwa-want-home";
  var SHELL_KEY = "vc-pwa-shell";
  /* 0 = mai scadere (prima: 2h) */
  var TTL_MS = 0;

  function mq(mode) {
    try {
      return Boolean(window.matchMedia && window.matchMedia("(display-mode: " + mode + ")").matches);
    } catch (e) {
      return false;
    }
  }

  function isStandalonePwa() {
    if (mq("standalone") || mq("fullscreen") || mq("minimal-ui") || mq("window-controls-overlay")) return true;
    return Boolean(navigator.standalone);
  }

  function markShell() {
    if (!isStandalonePwa()) return;
    try {
      localStorage.setItem(SHELL_KEY, "1");
    } catch (e) {}
  }

  function wasPwaShell() {
    if (isStandalonePwa()) return true;
    try {
      return localStorage.getItem(SHELL_KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  function stripBadSearch(search) {
    var s = String(search || "");
    if (!s || s === "?") return "";
    try {
      var u = new URLSearchParams(s.charAt(0) === "?" ? s.slice(1) : s);
      [
        "code",
        "state",
        "error",
        "error_description",
        "access_token",
        "token_type",
        "expires_in",
        "app",
      ].forEach(function (k) {
        u.delete(k);
      });
      var out = u.toString();
      return out ? "?" + out : "";
    } catch (e) {
      return "";
    }
  }

  function currentPath() {
    try {
      var p = String(window.location.pathname || "/").replace(/\/index\.html$/i, "") || "/";
      if (p !== "/" && p.charAt(p.length - 1) !== "/") p += "/";
      if (p === "//") p = "/";
      var q = stripBadSearch(window.location.search || "");
      var h = String(window.location.hash || "");
      if (h.indexOf("access_token=") !== -1) h = "";
      if (h.length > 80) h = "";
      return p + q + h;
    } catch (e) {
      return "/";
    }
  }

  function safeResumePath(path) {
    var raw = String(path || "");
    if (!raw || raw.charAt(0) !== "/") return "";
    /* Solo protocol-relative / path traversal — NON bloccare query (?a=1) */
    if (raw.indexOf("\\") !== -1) return "";
    if (/^\/\//.test(raw) || raw.indexOf("://") !== -1) return "";
    if (raw.length > 240) return "";
    try {
      var u = new URL(raw, window.location.origin);
      if (u.origin !== window.location.origin) return "";
      var p = String(u.pathname || "/").replace(/\/index\.html$/i, "") || "/";
      if (p !== "/" && p.charAt(p.length - 1) !== "/") p += "/";
      var norm = (p.replace(/\/+$/, "") || "/").toLowerCase();
      if (
        norm === "/vote" ||
        norm === "/faq" ||
        /\/accesso-richiesto\/?$/.test(norm) ||
        norm.indexOf("/oauth") === 0
      ) {
        return "";
      }
      var q = stripBadSearch(u.search || "");
      var h = String(u.hash || "");
      if (h.indexOf("access_token=") !== -1) h = "";
      if (h.length > 80) h = "";
      return p + q + h;
    } catch (eU) {
      return "";
    }
  }

  function wantHomePending() {
    try {
      if (sessionStorage.getItem(WANT_HOME_KEY) === "1") return true;
    } catch (eS) {}
    try {
      var raw = localStorage.getItem(WANT_HOME_KEY);
      if (!raw) return false;
      var data = null;
      try {
        data = JSON.parse(raw);
      } catch (eP) {
        data = null;
      }
      var at = Number(data && data.t) || 0;
      return !at || Date.now() - at < 60000;
    } catch (eL) {
      return false;
    }
  }

  function saveResume(path, opts) {
    opts = opts || {};
    /* Salva se PWA attiva O già usata come app installata (Windows a volte flappa display-mode). */
    if (!isStandalonePwa() && !opts.force && !wasPwaShell()) return;
    markShell();
    if (wantHomePending()) {
      try {
        localStorage.setItem(RESUME_KEY, JSON.stringify({ p: "/", t: Date.now() }));
      } catch (eW) {}
      return;
    }
    var p = safeResumePath(path == null ? currentPath() : path);
    if (!p) return;
    /*
     * pwaResumeWin1: NON sovrascrivere una pagina utile con "/" su cold-start home.
     * Prima (bug Windows): home senza ?app= azzerava vc-pwa-resume → sempre homepage.
     */
    if (p === "/") {
      try {
        if (/[?&]app=/.test(String(window.location.search || ""))) return;
        if (opts.allowHome !== true) {
          var prev = null;
          try {
            prev = JSON.parse(localStorage.getItem(RESUME_KEY) || "null");
          } catch (ePrev) {
            prev = null;
          }
          var prevPath = safeResumePath(prev && prev.p);
          if (prevPath && prevPath !== "/") return;
        }
      } catch (eApp) {}
    }
    try {
      localStorage.setItem(RESUME_KEY, JSON.stringify({ p: p, t: Date.now() }));
    } catch (e) {}
  }

  function onLeave() {
    if (!isStandalonePwa() && !wasPwaShell()) return;
    saveResume(currentPath());
  }

  markShell();
  if (isStandalonePwa() || wasPwaShell()) {
    saveResume(currentPath());
  }

  window.addEventListener("pagehide", onLeave);
  window.addEventListener("freeze", onLeave);
  window.addEventListener("beforeunload", onLeave);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") onLeave();
  });

  try {
    window.VcPwaResume = {
      save: saveResume,
      path: currentPath,
      safe: safeResumePath,
      isPwa: isStandalonePwa,
      wasShell: wasPwaShell,
      ttlMs: TTL_MS,
      key: RESUME_KEY,
    };
  } catch (eApi) {}
})();
