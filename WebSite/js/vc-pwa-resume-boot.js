/**
 * pwaResumeWin1: resume PWA affidabile su Windows (minimal-ui / no wipe / shell flag).
 * pwaResumeForever1: nessuna scadenza TTL — riapertura dopo X ripristina sempre l'ultima pagina.
 * pwaResumeUi1: oltre al path, marca pending UI (scroll/menu) in localStorage.
 * Marker: 20261006navNoYankTyped1
 * pwaLinkCapture2: focus-existing + apex/www launchQueue
 * pwaOpenPush1: early SW register (push prima del chunk notif)
 * violKillIdle1: visibilitychange/pagehide — defer onLeave (era Violation 500–1800ms)
 * violKillIdle2: keep defer; stamp bust sitewide
 * violKillReflow1: stamp bust
 * violKillVis1: stamp bust
 * violKillCue2: leave/persist a fette — setTimeout(0)+JSON grosso = Violation 1.7s
 * pwaAppQueryHide1: togli ?app= dalla barra URL (start_url PWA) dopo averlo letto
 * pwaAppLoopKill1c: mai location.assign(/?app=…) dopo strip — loop infinito /
 * pwaHomeResume1: home reale (nav/back/chiusura) salva "/" anche se prima era /wiki/
 * oauthHashResumeKill1: MAI location.assign durante ritorno Discord (#access_token/#error)
 *   — pwa sync gira PRIMA di discord-auth defer e cancellava il login
 */
(function () {
  if (window.__vcPwaResumeBoot) return;
  window.__vcPwaResumeBoot = 1;

  /* oauthHashResumeKill1: cattura hash OAuth subito + blocca resume/launch navigate */
  function isOauthCallbackHash(raw) {
    var h = String(raw || "");
    return h.indexOf("access_token=") !== -1 || h.indexOf("error=") !== -1;
  }
  try {
    var __oaHash = String(window.location.hash || "");
    if (isOauthCallbackHash(__oaHash)) {
      try {
        if (!window.__vcOauthHashCapture) window.__vcOauthHashCapture = __oaHash;
      } catch (eCap) {}
      try {
        sessionStorage.setItem("vc_oauth_hash_capture_v1", __oaHash);
      } catch (eSs) {}
      window.__vcOauthCallbackPending = 1;
    }
  } catch (eOauthEarly) {}

  /* pwaAppQueryHide1: ?app=vinili-… solo marker cold-start — non deve restare visibile */
  (function stripAppQueryFromBar() {
    try {
      var search = String(window.location.search || "");
      if (!/[?&]app=/.test(search)) return;
      var params = new URLSearchParams(search.charAt(0) === "?" ? search.slice(1) : search);
      var appVal = String(params.get("app") || "").trim();
      if (!appVal) return;
      try {
        window.__vcPwaColdApp = true;
        window.__vcPwaColdAppAt = Date.now();
        sessionStorage.setItem("vc-pwa-cold-app", String(Date.now()));
        if (appVal) sessionStorage.setItem("vc-pwa-cold-app-id", appVal);
      } catch (eFlag) {
        window.__vcPwaColdApp = true;
      }
      params.delete("app");
      var qs = params.toString();
      var next =
        String(window.location.pathname || "/") +
        (qs ? "?" + qs : "") +
        String(window.location.hash || "");
      if (typeof history.replaceState === "function") {
        history.replaceState(history.state, "", next);
      }
    } catch (eStrip) {}
  })();

  var RESUME_KEY = "vc-pwa-resume";
  var WANT_HOME_KEY = "vc-pwa-want-home";
  var SHELL_KEY = "vc-pwa-shell";
  var UI_KEY = "vc_pwa_view_state_v1";
  var UI_PENDING_KEY = "vc_pwa_ui_pending_v1";
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
     * pwaHomeResume1: il blocco prevPath!=="/" era troppo largo — se chiudevi su home
     * dopo wiki/back, resume restava /wiki/ e al reopen sembrava “a caso”.
     * Ora: skip "/" solo su cold-start icona, finché non hai lasciato start_url.
     */
    if (p === "/") {
      try {
        var coldApp = false;
        try {
          coldApp = Boolean(window.__vcPwaColdApp);
          if (!coldApp) {
            var coldAt = Number(sessionStorage.getItem("vc-pwa-cold-app") || "0") || 0;
            coldApp = coldAt > 0 && Date.now() - coldAt < 20000;
          }
        } catch (eCold) {}
        var coldHit = coldApp || /[?&]app=/.test(String(window.location.search || ""));
        if (coldHit && opts.allowHome !== true) {
          var leftStart = false;
          try {
            leftStart =
              sessionStorage.getItem("vc-pwa-left-start") === "1" ||
              sessionStorage.getItem("vc_nav_explicit") === "1";
          } catch (eLeft) {}
          if (!leftStart) return;
        }
      } catch (eApp) {}
    } else {
      try {
        sessionStorage.setItem("vc-pwa-left-start", "1");
      } catch (eMark) {}
    }
    try {
      localStorage.setItem(RESUME_KEY, JSON.stringify({ p: p, t: Date.now() }));
    } catch (e) {}
  }

  function pagePathForUi() {
    try {
      var path = String(window.location.pathname || "") || "/";
      if (path.length > 1 && path.charAt(path.length - 1) === "/") path = path.slice(0, -1);
      if (/^\/bacheca(\/|$)/i.test(path)) return path || "/";
      var p = path + String(window.location.search || "");
      if (p.length > 1 && p.charAt(p.length - 1) === "/") p = p.slice(0, -1);
      return p || "/";
    } catch (eP) {
      return "/";
    }
  }

  function persistUiPathOnly() {
    try {
      var p = pagePathForUi();
      localStorage.setItem(UI_PENDING_KEY, JSON.stringify({ p: p, t: Date.now() }));
    } catch (ePend) {}
  }

  function persistUiSnapshotHeavy() {
    /* violKillCue2: JSON grosso fuori dal leave sync; slim se >12KB */
    try {
      var raw = sessionStorage.getItem("vc_view_state_v1");
      if (!raw) raw = sessionStorage.getItem("vc_ptr_scroll_v1");
      if (!raw) return;
      if (raw.length > 12000) {
        try {
          var slim = JSON.parse(raw);
          if (!slim || !slim.p) return;
          localStorage.setItem(
            UI_KEY,
            JSON.stringify({ p: slim.p, y: slim.y, max: slim.max, t: Date.now(), slim: 1 }),
          );
        } catch (eSlim) {}
        return;
      }
      var data = JSON.parse(raw);
      if (!data || !data.p) return;
      data.t = Date.now();
      localStorage.setItem(UI_KEY, JSON.stringify(data));
    } catch (eUi) {}
  }

  function persistUiPending() {
    if (!isStandalonePwa() && !wasPwaShell()) return;
    persistUiPathOnly();
    window.setTimeout(function () {
      try {
        persistUiSnapshotHeavy();
      } catch (eH) {}
    }, 80);
  }

  function onLeaveLight() {
    if (!isStandalonePwa() && !wasPwaShell()) return;
    saveResume(currentPath());
    persistUiPathOnly();
  }

  /* violKillCue2: niente onLeave monolitico in un setTimeout(0) */
  var leaveTimer = 0;
  function scheduleLeave(urgent) {
    if (urgent) {
      try {
        onLeaveLight();
      } catch (eU) {}
      return;
    }
    if (leaveTimer) return;
    leaveTimer = window.setTimeout(function () {
      leaveTimer = 0;
      try {
        if (!isStandalonePwa() && !wasPwaShell()) return;
        saveResume(currentPath());
      } catch (eL) {}
      window.setTimeout(function () {
        try {
          persistUiPathOnly();
        } catch (eP) {}
        window.setTimeout(function () {
          try {
            persistUiSnapshotHeavy();
          } catch (eH2) {}
        }, 64);
      }, 40);
    }, 48);
  }

  /* pwaAppLoopKill1c: pulisci resume/pending con ?app= PRIMA di qualsiasi save/restore */
  try {
    var __badR = localStorage.getItem(RESUME_KEY);
    if (__badR && /[?&]app=/.test(__badR)) {
      var __br = JSON.parse(__badR);
      var __rp = safeResumePath(__br && __br.p) || "/";
      localStorage.setItem(RESUME_KEY, JSON.stringify({ p: __rp, t: Date.now() }));
    }
  } catch (eEarlyHeal) {
    try {
      localStorage.removeItem(RESUME_KEY);
    } catch (e0) {}
  }
  try {
    var __badP = sessionStorage.getItem("vc-pwa-launch-pending");
    if (__badP && /[?&]app=/.test(__badP)) {
      sessionStorage.removeItem("vc-pwa-launch-pending");
    }
  } catch (eEarlyPend) {}

  markShell();
  if (isStandalonePwa() || wasPwaShell()) {
    saveResume(currentPath());
  }
  /* navNoYankTyped1: pagina esplicita (non home) = intent utente; aggiorna resume subito */
  try {
    var __hereBoot = currentPath();
    var __hereOnly = String(__hereBoot || "/").split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";
    if (__hereOnly !== "/") {
      saveResume(__hereBoot, { force: true });
      try {
        sessionStorage.setItem("vc_nav_explicit", "1");
      } catch (eEx) {}
    }
  } catch (eExplicit) {}


  window.addEventListener("pagehide", function () {
    scheduleLeave(true);
  });
  window.addEventListener("freeze", function () {
    scheduleLeave(true);
  });
  window.addEventListener("beforeunload", function () {
    scheduleLeave(true);
  });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") scheduleLeave(false);
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
      uiKey: UI_KEY,
      uiPendingKey: UI_PENDING_KEY,
      persistUi: persistUiPending,
    };
  } catch (eApi) {}

  /* pwaLinkCapture2: focus-existing + apex/www + pending launch (PWA aperta/background) */
  var LAUNCH_PENDING_KEY = "vc-pwa-launch-pending";

  function isViniliHost(hostname) {
    var h = String(hostname || "")
      .toLowerCase()
      .replace(/\.$/, "");
    return h === "viniliecaffe.it" || h === "www.viniliecaffe.it";
  }

  function normalizeLaunchPath(raw) {
    var dest = new URL(String(raw || ""), window.location.origin);
    if (!isViniliHost(dest.hostname)) return "";
    /* Canonico: resta sullo stesso host della PWA (www) */
    if (dest.hostname !== window.location.hostname && isViniliHost(window.location.hostname)) {
      dest.protocol = window.location.protocol;
      dest.host = window.location.host;
    }
    /* pwaAppLoopKill1c: togli ?app= — altrimenti strip barra + assign riparte in loop */
    try {
      dest.searchParams.delete("app");
    } catch (eApp) {}
    var q = stripBadSearch(dest.search || "");
    var h = String(dest.hash || "");
    if (h.indexOf("access_token=") !== -1) h = "";
    return dest.pathname + q + h;
  }

  function pathKey(p) {
    try {
      var u = new URL(String(p || "/"), window.location.origin);
      u.searchParams.delete("app");
      var path = String(u.pathname || "/").replace(/\/+$/, "") || "/";
      var q = stripBadSearch(u.search || "");
      return path + q;
    } catch (eK) {
      return String(p || "/")
        .split("#")[0]
        .replace(/[?&]app=[^&#]*/g, "")
        .replace(/[?&]$/, "")
        .replace(/\/+$/, "") || "/";
    }
  }

  function isOauthFlowActive() {
    try {
      if (window.__vcOauthCallbackPending) return true;
      if (isOauthCallbackHash(window.location.hash)) return true;
      if (isOauthCallbackHash(window.__vcOauthHashCapture)) return true;
    } catch (e0) {}
    try {
      if (sessionStorage.getItem("vc_oauth_hash_capture_v1")) return true;
      if (sessionStorage.getItem("vc_oauth_fresh_after_bounce_v1") === "1") return true;
      if (sessionStorage.getItem("vc_oauth_bfcache_bust_v1") === "1") return true;
    } catch (e1) {}
    try {
      var q = String(window.location.search || "");
      if (/(?:^|[?&])_vc_oa=/.test(q)) return true;
    } catch (e2) {}
    return false;
  }

  function applyLaunchPath(next, opts) {
    /* oauthHashResumeKill1: non rubare ritorno Discord né bounce ?_vc_oa= */
    try {
      if (isOauthFlowActive()) return false;
    } catch (eOauthNav) {}
    var path = normalizeLaunchPath(next) || safeResumePath(next);
    if (!path) return false;
    var force = Boolean(opts && opts.force);
    var here = window.location.pathname + window.location.search + window.location.hash;
    /* pwaAppLoopKill1c: confronta senza ?app= (dopo strip here=/ e next=/?app=… erano “diversi”) */
    if (pathKey(path) === pathKey(here)) return false;
    if (!force && path === here) return false;
    try {
      /* salva SOLO path pulito — mai ?app= in pending */
      sessionStorage.setItem(
        LAUNCH_PENDING_KEY,
        JSON.stringify({ p: path, t: Date.now() }),
      );
    } catch (eStore) {}
    try {
      window.focus();
    } catch (eFocus) {}
    try {
      window.location.assign(path);
      return true;
    } catch (eAssign) {
      try {
        window.location.href = path;
        return true;
      } catch (eHref) {
        return false;
      }
    }
  }

  function consumeStoredLaunch() {
    try {
      if (isOauthFlowActive()) return;
    } catch (eOauthCons) {}
    try {
      var raw = sessionStorage.getItem(LAUNCH_PENDING_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      var path = normalizeLaunchPath(String((data && data.p) || "")) || safeResumePath(String((data && data.p) || ""));
      var at = Number((data && data.t) || 0);
      if (!path) {
        sessionStorage.removeItem(LAUNCH_PENDING_KEY);
        return;
      }
      if (at && Date.now() - at > 120000) {
        sessionStorage.removeItem(LAUNCH_PENDING_KEY);
        return;
      }
      var here = window.location.pathname + window.location.search + window.location.hash;
      if (pathKey(path) === pathKey(here)) {
        sessionStorage.removeItem(LAUNCH_PENDING_KEY);
        return;
      }
      sessionStorage.removeItem(LAUNCH_PENDING_KEY);
      applyLaunchPath(path, { force: true });
    } catch (eConsume) {}
  }

  /* pwaAppLoopKill1c: sana pending/resume già corrotti con ?app= */
  try {
    var badPend = sessionStorage.getItem(LAUNCH_PENDING_KEY);
    if (badPend && /[?&]app=/.test(badPend)) {
      var bp = JSON.parse(badPend);
      var cleaned = normalizeLaunchPath(String((bp && bp.p) || "")) || "/";
      if (pathKey(cleaned) === pathKey(window.location.pathname + window.location.search)) {
        sessionStorage.removeItem(LAUNCH_PENDING_KEY);
      } else {
        sessionStorage.setItem(
          LAUNCH_PENDING_KEY,
          JSON.stringify({ p: cleaned, t: Date.now() }),
        );
      }
    }
  } catch (eHealPend) {
    try {
      sessionStorage.removeItem(LAUNCH_PENDING_KEY);
    } catch (eRm) {}
  }
  try {
    var badResume = localStorage.getItem(RESUME_KEY);
    if (badResume && /[?&]app=/.test(badResume)) {
      var br = JSON.parse(badResume);
      var rp = safeResumePath(br && br.p) || "/";
      localStorage.setItem(RESUME_KEY, JSON.stringify({ p: rp, t: Date.now() }));
    }
  } catch (eHealRes) {
    try {
      localStorage.removeItem(RESUME_KEY);
    } catch (eRmR) {}
  }

  try {
    if ("launchQueue" in window && window.launchQueue && typeof window.launchQueue.setConsumer === "function") {
      window.launchQueue.setConsumer(function (launchParams) {
        try {
          var raw = launchParams && launchParams.targetURL ? String(launchParams.targetURL) : "";
          if (!raw) return;
          var next = normalizeLaunchPath(raw);
          if (!next) return;
          applyLaunchPath(next);
        } catch (eLaunch) {}
      });
    }
  } catch (eLq) {}

  try {
    consumeStoredLaunch();
  } catch (eBootLaunch) {}

  /* pwaOpenPush1 + chromeCss404Fix3: stesso URL stabile di landing-notif (/sw-m1.js)
     — niente stamp sw-m1.20….js (CSP worker noise + doppia register). */
  try {
    if ("serviceWorker" in navigator && !window.__vcSwEarlyBoot) {
      window.__vcSwEarlyBoot = 1;
      var earlySw = "/sw-m1.js?v=20261017badgeOsDismiss1";
      try {
        if (typeof window.__vcTrustedScriptURL === "function") {
          earlySw = window.__vcTrustedScriptURL(earlySw);
        }
      } catch (eTtEarly) {}
      navigator.serviceWorker
        .register(earlySw, { scope: "/", updateViaCache: "none" })
        .then(function (reg) {
          try {
            if (reg && typeof reg.update === "function") reg.update().catch(function () {});
          } catch (eUpdEarly) {}
        })
        .catch(function () {});
    }
  } catch (eSwEarly) {}
})();
