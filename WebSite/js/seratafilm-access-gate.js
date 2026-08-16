(function () {
  var ACCESS_CACHE_KEY = "vc_seratafilm_access_ok_v4";
  var ACCESS_CACHE_TTL_MS = 300000;
  var FETCH_TIMEOUT_MS = 5000;
  var FAILSAFE_MS = 7000;

  function isLocalOrigin() {
    try {
      var h = String(window.location.hostname || "").toLowerCase();
      return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
    } catch (e) {
      return false;
    }
  }

  function cfgValueOrEmpty(v) {
    var s = String(v == null ? "" : v).trim();
    return s && !/\{\{/.test(s) ? s : "";
  }

  function resolvedApiUrl() {
    var c = (typeof window !== "undefined" && window.__VC_SERATAFILM_ACCESS) || {};
    var local = cfgValueOrEmpty(c.apiUrlLocal);
    if (isLocalOrigin() && local) return local;
    var full = cfgValueOrEmpty(c.apiUrl);
    try {
      if (full && /^https?:\/\//i.test(full)) {
        var apiU = new URL(full);
        var pageU = new URL(window.location.href);
        if (apiU.host !== pageU.host && apiU.protocol === pageU.protocol) {
          return apiU.pathname + (apiU.search || "");
        }
      }
    } catch (eN) {}
    return full;
  }

  function seratafilmReturnPath() {
    try {
      var p = String(window.location.pathname || "").replace(/\/+$/, "") || "/seratafilm";
      if (/\/seratafilm(\/|$)/i.test(p) && p.indexOf("/accesso-richiesto") === -1) {
        return p.endsWith("/") ? p : p + "/";
      }
    } catch (e) {}
    return "/seratafilm/";
  }

  function accessRequiredUrl() {
    try {
      var u = new URL("/seratafilm/accesso-richiesto/", window.location.origin);
      u.searchParams.set("from", seratafilmReturnPath());
      return u.href;
    } catch (e) {
      return "/seratafilm/accesso-richiesto/";
    }
  }

  function navigateTo(target) {
    hideLoading();
    var dest = String(target || "").trim() || "/";
    try {
      window.location.replace(dest);
      return;
    } catch (e0) {}
    try {
      window.location.href = dest;
    } catch (e1) {}
  }

  function redirectAccessRequired() {
    navigateTo(accessRequiredUrl());
  }

  function showDenied(message) {
    hideLoading();
    var panel = document.getElementById("vc-seratafilm-denied");
    var msg = document.getElementById("vc-seratafilm-denied-msg");
    if (msg) {
      msg.textContent = String(
        message ||
          "Non hai i permessi High Staff per aprire la Serata Film. Se pensi sia un errore, riprova dopo aver aggiornato i ruoli Discord.",
      );
    }
    if (panel) {
      try {
        panel.style.setProperty("display", "flex", "important");
      } catch (e0) {
        panel.style.display = "flex";
      }
      try {
        panel.removeAttribute("hidden");
      } catch (e1) {}
    }
  }

  function getToken() {
    try {
      var t = localStorage.getItem("vc_discord_access_token");
      if (!t) return "";
      var exp = Number(localStorage.getItem("vc_discord_expires_at") || "0");
      // Se manca expires_at (sessioni legacy) non trattare come logout.
      if (exp && Date.now() >= exp) return "";
      return t;
    } catch (e) {
      return "";
    }
  }

  function tokenFingerprint(token) {
    var exp = "";
    try {
      exp = String(localStorage.getItem("vc_discord_expires_at") || "");
    } catch (eFp) {}
    return exp + "|" + String(token || "").slice(0, 32);
  }

  function readAccessCache(token) {
    if (!token) return null;
    try {
      var raw = sessionStorage.getItem(ACCESS_CACHE_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || o.v !== 4 || o.ok !== true) return null;
      if (String(o.fp || "") !== tokenFingerprint(token)) return null;
      if (Number(o.exp || 0) <= Date.now()) {
        sessionStorage.removeItem(ACCESS_CACHE_KEY);
        return null;
      }
      return o;
    } catch (eR) {
      return null;
    }
  }

  function writeAccessCache(token) {
    if (!token) return;
    try {
      sessionStorage.setItem(
        ACCESS_CACHE_KEY,
        JSON.stringify({
          v: 4,
          ok: true,
          fp: tokenFingerprint(token),
          exp: Date.now() + ACCESS_CACHE_TTL_MS,
        }),
      );
    } catch (eW) {}
  }

  function clearStaleAccessCaches() {
    try {
      sessionStorage.removeItem("vc_seratafilm_access_ok_v1");
      sessionStorage.removeItem("vc_seratafilm_access_ok_v2");
      sessionStorage.removeItem("vc_seratafilm_access_ok_v3");
    } catch (eC) {}
  }

  function setLoadingHint(text) {
    var hint = document.getElementById("vc-seratafilm-loading");
    if (!hint) return;
    var el = hint.querySelector(".vc-seratafilm-loading__hint");
    if (el) el.textContent = String(text || "");
  }

  function bindDeniedRetryOnce() {
    if (window.__vcSeratafilmDeniedRetryBound) return;
    window.__vcSeratafilmDeniedRetryBound = true;
    document.addEventListener("click", function (e) {
      var t = e.target && e.target.closest && e.target.closest("#vc-seratafilm-denied-retry");
      if (!t) return;
      e.preventDefault();
      clearStaleAccessCaches();
      try {
        sessionStorage.removeItem(ACCESS_CACHE_KEY);
      } catch (eRm) {}
      try {
        localStorage.removeItem("vc_discord_access_token");
        localStorage.removeItem("vc_discord_expires_at");
      } catch (e0) {}
      redirectAccessRequired();
    });
  }

  bindDeniedRetryOnce();

  function hideLoading() {
    try {
      document.documentElement.classList.add("vc-seratafilm-loading-done");
    } catch (e0) {}
    var el = document.getElementById("vc-seratafilm-loading");
    if (!el) return;
    try {
      el.style.setProperty("display", "none", "important");
    } catch (e1) {
      try {
        el.style.display = "none";
      } catch (e2) {}
    }
    try {
      el.remove();
    } catch (e3) {}
  }

  function fetchWithTimeout(url, options, timeoutMs) {
    var ms = Math.max(2500, Math.min(8000, Number(timeoutMs) || FETCH_TIMEOUT_MS));
    var base = {
      method: (options && options.method) || "GET",
      headers: (options && options.headers) || {},
      mode: "cors",
      credentials: "omit",
    };
    if (typeof AbortController === "undefined") {
      return new Promise(function (resolve, reject) {
        var settled = false;
        var tid = setTimeout(function () {
          if (settled) return;
          settled = true;
          reject(new Error("timeout"));
        }, ms);
        fetch(url, base).then(
          function (res) {
            if (settled) return;
            settled = true;
            try {
              clearTimeout(tid);
            } catch (eClr) {}
            resolve(res);
          },
          function (err) {
            if (settled) return;
            settled = true;
            try {
              clearTimeout(tid);
            } catch (eClr2) {}
            reject(err);
          },
        );
      });
    }
    var ctrl = new AbortController();
    var id = setTimeout(function () {
      try {
        ctrl.abort();
      } catch (eAbort) {}
    }, ms);
    return fetch(url, Object.assign({}, base, { signal: ctrl.signal })).finally(function () {
      clearTimeout(id);
    });
  }

  function requestAccess(api, token) {
    return fetchWithTimeout(api, { headers: { Authorization: "Bearer " + token } }, FETCH_TIMEOUT_MS).then(function (res) {
      return res
        .json()
        .catch(function () {
          return {};
        })
        .then(function (data) {
          return { res: res, data: data };
        });
    });
  }

  function startAccessPrefetch() {
    if (window.__vcSeratafilmAccessPrefetch) return window.__vcSeratafilmAccessPrefetch;
    var api = resolvedApiUrl();
    var token = getToken();
    if (!api || !token) {
      window.__vcSeratafilmAccessPrefetch = Promise.resolve({ skipped: true });
      return window.__vcSeratafilmAccessPrefetch;
    }
    var cached = readAccessCache(token);
    if (cached) {
      window.__vcSeratafilmAccessPrefetch = Promise.resolve({ cached: true, ok: true });
      return window.__vcSeratafilmAccessPrefetch;
    }
    setLoadingHint("Controllo permessi High Staff…");
    window.__vcSeratafilmAccessPrefetch = requestAccess(api, token)
      .then(function (out) {
        if (out.res.ok && out.data && out.data.ok) writeAccessCache(token);
        return out;
      })
      .catch(function (err) {
        return { error: err };
      });
    return window.__vcSeratafilmAccessPrefetch;
  }

  function armLoadingFailsafe(ms) {
    var timeoutMs = Math.max(4000, Math.min(16000, Number(ms) || FAILSAFE_MS));
    setTimeout(function () {
      try {
        if (document.body.classList.contains("vc-seratafilm-app-revealed")) return;
      } catch (eFs) {}
      try {
        var denied = document.getElementById("vc-seratafilm-denied");
        if (denied && denied.style && denied.style.display === "flex") return;
      } catch (eD) {}
      var token = getToken();
      if (!token) {
        redirectAccessRequired();
        return;
      }
      setLoadingHint("La verifica sta impiegando più del solito… riprovo.");
      var api = resolvedApiUrl();
      if (!api) {
        showDenied("Impossibile verificare l'accesso in questo momento. Riprova tra poco.");
        return;
      }
      requestAccess(api, token)
        .then(function (out) {
          handleAccessResult(out, document.getElementById("vc-seratafilm-app"), token);
        })
        .catch(function () {
          showDenied("Verifica accesso non riuscita. Controlla la connessione e riprova.");
        });
    }, timeoutMs);
  }

  armLoadingFailsafe(FAILSAFE_MS);

  function seratafilmJsBase() {
    try {
      var p = String(window.location.pathname || "");
      if (/\/grazie\/?$/i.test(p) || /\/grazie\//i.test(p)) return "../../js/";
    } catch (eB) {}
    return "../js/";
  }

  function loadHogwartsThemeScript() {
    if (window.__vcSeratafilmHogwartsThemeLoading || window.__vcSeratafilmApplyHogwartsTheme) return;
    window.__vcSeratafilmHogwartsThemeLoading = true;
    var v = String(window.__vcSeratafilmAssetVersion || "").trim();
    var src = seratafilmJsBase() + "seratafilm-hogwarts-theme.js";
    if (v) src += "?v=" + encodeURIComponent(v);
    var s = document.createElement("script");
    s.src = typeof window.__vcTrustedScriptURL === "function" ? window.__vcTrustedScriptURL(src) : src;
    s.async = true;
    s.onload = function () {
      try {
        if (typeof window.__vcSeratafilmApplyHogwartsTheme === "function") {
          window.__vcSeratafilmApplyHogwartsTheme();
        }
      } catch (eTh) {}
    };
    document.head.appendChild(s);
  }

  function scheduleHogwartsTheme() {
    var run = function () {
      loadHogwartsThemeScript();
    };
    try {
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(run, { timeout: 2500 });
        return;
      }
    } catch (eId) {}
    setTimeout(run, 400);
  }

  function revealApp(app) {
    try {
      document.body.classList.add("vc-seratafilm-app-revealed");
    } catch (eRev) {}
    hideLoading();
    if (app) app.style.display = "";
    try {
      if (typeof window.__vcSeratafilmInit === "function") window.__vcSeratafilmInit();
    } catch (e3) {}
    scheduleHogwartsTheme();
    try {
      if (typeof queueMicrotask === "function") queueMicrotask(hideLoading);
      else setTimeout(hideLoading, 0);
    } catch (e4) {}
  }

  function handleAccessResult(out, app, token) {
    if (out && out.cached && out.ok) {
      revealApp(app);
      return;
    }
    if (out && out.res) {
      if (out.res.ok && out.data && out.data.ok) {
        writeAccessCache(token);
        revealApp(app);
        return;
      }
      if (out.res.status === 401) {
        try {
          sessionStorage.removeItem(ACCESS_CACHE_KEY);
        } catch (e401c) {}
        try {
          localStorage.removeItem("vc_discord_access_token");
          localStorage.removeItem("vc_discord_expires_at");
        } catch (e401) {}
        redirectAccessRequired();
        return;
      }
      if (out.res.status === 403) {
        try {
          sessionStorage.removeItem(ACCESS_CACHE_KEY);
        } catch (e403c) {}
        showDenied(
          (out.data && (out.data.message || out.data.error)) ||
            "Non hai i permessi High Staff per aprire la Serata Film.",
        );
        return;
      }
      showDenied("Verifica accesso non riuscita. Riprova tra poco.");
      return;
    }
    if (out && out.skipped) {
      redirectAccessRequired();
      return;
    }
    if (out && out.error) {
      requestAccess(resolvedApiUrl(), token)
        .then(function (fresh) {
          handleAccessResult(fresh, app, token);
        })
        .catch(function () {
          showDenied("Verifica accesso non riuscita. Controlla la connessione e riprova.");
        });
      return;
    }
    showDenied("Verifica accesso non riuscita. Riprova tra poco.");
  }

  function run() {
    try {
      document.body.classList.remove("vc-seratafilm-app-revealed");
    } catch (eR1) {}
    var api = resolvedApiUrl();
    var app = document.getElementById("vc-seratafilm-app");
    if (!api) {
      showDenied("Configurazione accesso non disponibile. Riprova più tardi.");
      return;
    }
    var token = getToken();
    if (!token) {
      redirectAccessRequired();
      return;
    }
    var cached = readAccessCache(token);
    if (cached) {
      revealApp(app);
      return;
    }
    var prefetch = window.__vcSeratafilmAccessPrefetch || startAccessPrefetch();
    prefetch
      .then(function (out) {
        handleAccessResult(out, app, token);
      })
      .catch(function () {
        showDenied("Verifica accesso non riuscita. Controlla la connessione e riprova.");
      });
  }

  startAccessPrefetch();

  function scheduleRun() {
    run();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleRun);
  } else {
    scheduleRun();
  }
})();
