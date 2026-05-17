(function () {
  var ACCESS_CACHE_KEY = "vc_seratafilm_access_ok_v1";
  var ACCESS_CACHE_TTL_MS = 180000;
  var FETCH_TIMEOUT_MS = 8000;

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

  function getToken() {
    try {
      var t = localStorage.getItem("vc_discord_access_token");
      var exp = Number(localStorage.getItem("vc_discord_expires_at") || "0");
      if (!t || !exp || Date.now() >= exp) return "";
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
      if (!o || o.v !== 1 || o.ok !== true) return null;
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
          v: 1,
          ok: true,
          fp: tokenFingerprint(token),
          exp: Date.now() + ACCESS_CACHE_TTL_MS,
        }),
      );
    } catch (eW) {}
  }

  function clearAccessCache() {
    try {
      sessionStorage.removeItem(ACCESS_CACHE_KEY);
    } catch (eC) {}
  }

  function setLoadingHint(text) {
    var hint = document.getElementById("vc-seratafilm-loading");
    if (!hint) return;
    var el = hint.querySelector(".vc-seratafilm-loading__hint");
    if (el) el.textContent = String(text || "");
  }

  function showDenied(message) {
    try {
      document.body.classList.remove("vc-seratafilm-app-revealed");
    } catch (eR0) {}
    hideLoading();
    var denied = document.getElementById("vc-seratafilm-denied");
    if (!denied) return;
    var msgEl = document.getElementById("vc-seratafilm-denied-msg");
    if (msgEl) {
      msgEl.textContent = message || "Accesso negato.";
    }
    denied.style.display = "flex";
  }

  function redirectHome() {
    hideLoading();
    var raw = "";
    try {
      raw = String((window.__VC_SITE_HOME_URL || "").trim());
    } catch (e) {}
    if (/\{\{/.test(raw)) raw = "";
    try {
      var u = raw ? new URL(raw) : new URL("/", window.location.origin);
      window.location.replace(u.href);
    } catch (e2) {
      try {
        window.location.replace("/");
      } catch (e3) {}
    }
  }

  function bindDeniedRetryOnce() {
    if (window.__vcSeratafilmDeniedRetryBound) return;
    window.__vcSeratafilmDeniedRetryBound = true;
    document.addEventListener("click", function (e) {
      var t = e.target && e.target.closest && e.target.closest("#vc-seratafilm-denied-retry");
      if (!t) return;
      e.preventDefault();
      clearAccessCache();
      try {
        localStorage.removeItem("vc_discord_access_token");
        localStorage.removeItem("vc_discord_expires_at");
      } catch (e0) {}
      redirectHome();
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
    var ms = Math.max(4000, Math.min(12000, Number(timeoutMs) || FETCH_TIMEOUT_MS));
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
          function (e) {
            if (settled) return;
            settled = true;
            try {
              clearTimeout(tid);
            } catch (eClr2) {}
            reject(e);
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
    return fetchWithTimeout(api, { headers: { Authorization: "Bearer " + token } }, FETCH_TIMEOUT_MS).then(
      function (res) {
        return res.json().catch(function () {
          return {};
        }).then(function (data) {
          return { res: res, data: data };
        });
      },
    );
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

  function revealApp(app) {
    try {
      document.body.classList.add("vc-seratafilm-app-revealed");
    } catch (eRev) {}
    hideLoading();
    if (app) app.style.display = "";
    try {
      if (typeof window.__vcSeratafilmInit === "function") window.__vcSeratafilmInit();
    } catch (e3) {}
    try {
      if (typeof queueMicrotask === "function") queueMicrotask(hideLoading);
      else setTimeout(hideLoading, 0);
    } catch (e4) {}
  }

  async function run() {
    try {
      document.body.classList.remove("vc-seratafilm-app-revealed");
    } catch (eR1) {}
    var api = resolvedApiUrl();
    var app = document.getElementById("vc-seratafilm-app");
    if (!api) {
      var rawCfg = "";
      try {
        rawCfg = String((window.__VC_SERATAFILM_ACCESS && window.__VC_SERATAFILM_ACCESS.apiUrl) || "").trim();
      } catch (eCfg) {}
      showDenied(
        /\{\{/.test(rawCfg)
          ? "Questa pagina è la sorgente non compilata (placeholder {{...}} nel sito). Sul server servi WebSite/dist dopo `node WebSite/scripts/build-site.mjs`, non la cartella WebSite grezza."
          : "Configurazione incompleta: imposta seratafilmAccessApiUrl in site.config.json e rifai il build.",
      );
      return;
    }
    var token = getToken();
    if (!token) {
      redirectHome();
      return;
    }
    try {
      var prefetch = window.__vcSeratafilmAccessPrefetch || startAccessPrefetch();
      var out = await prefetch;
      if (out && out.cached && out.ok) {
        revealApp(app);
        return;
      }
      if (out && out.res) {
        if (out.res.ok && out.data && out.data.ok) {
          revealApp(app);
          return;
        }
        redirectHome();
        return;
      }
      if (out && out.error) {
        throw out.error;
      }
      if (out && out.skipped) {
        redirectHome();
        return;
      }
      var fresh = await requestAccess(api, token);
      if (fresh.res.ok && fresh.data && fresh.data.ok) {
        writeAccessCache(token);
        revealApp(app);
        return;
      }
      redirectHome();
    } catch (err) {
      var name = err && err.name ? String(err.name) : "";
      var msg = err && err.message ? String(err.message) : "";
      var isAbort = name === "AbortError" || /aborted/i.test(msg);
      var isTimeout = /timeout/i.test(msg);
      showDenied(
        isAbort || isTimeout
          ? "Timeout: il server non ha risposto in tempo. Controlla la connessione o riprova tra poco."
          : "Impossibile verificare l'accesso. Riprova tra qualche istante.",
      );
    }
  }

  startAccessPrefetch();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
  try {
    var titleStr = String(typeof document !== "undefined" ? document.title || "" : "");
    var apiStr = String((window.__VC_SERATAFILM_ACCESS && window.__VC_SERATAFILM_ACCESS.apiUrl) || "");
    if (/\{\{/.test(titleStr) || /\{\{/.test(apiStr)) {
      console.warn(
        "[VC Serata film] Pagina senza build ({{ }} in titolo o apiUrl). Esegui `node WebSite/scripts/build-site.mjs` e servi `WebSite/dist`, non `WebSite/` grezza.",
      );
    }
  } catch (eUnb) {}
})();