(function () {
  var ACCESS_CACHE_KEY = "vc_staff_access_ok_v1";
  var ACCESS_CACHE_TTL_MS = 300000;
  var FETCH_TIMEOUT_MS = 5000;
  var FAILSAFE_MS = 8000;

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
    var c = (typeof window !== "undefined" && window.__VC_STAFF_ACCESS) || {};
    var local = cfgValueOrEmpty(c.apiUrlLocal);
    if (isLocalOrigin() && local) return local;
    var full = cfgValueOrEmpty(c.apiUrl) || "/webhooks/site-staff-access";
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

  function staffReturnPath() {
    try {
      var p = String(window.location.pathname || "").replace(/\/+$/, "") || "/staff";
      if (/\/staff(\/|$)/i.test(p) && p.indexOf("/accesso-richiesto") === -1) {
        return p.endsWith("/") ? p : p + "/";
      }
    } catch (e) {}
    return "/staff/";
  }

  function accessRequiredUrl() {
    try {
      var u = new URL("/staff/accesso-richiesto/", window.location.origin);
      u.searchParams.set("from", staffReturnPath() + String(window.location.search || ""));
      return u.href;
    } catch (e) {
      return "/staff/accesso-richiesto/";
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

  function getToken() {
    try {
      var t = localStorage.getItem("vc_discord_access_token");
      if (!t) return "";
      var exp = Number(localStorage.getItem("vc_discord_expires_at") || "0");
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
      var data = JSON.parse(raw);
      if (!data || data.fp !== tokenFingerprint(token)) return null;
      if (Number(data.exp || 0) <= Date.now()) return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  function writeAccessCache(token) {
    try {
      sessionStorage.setItem(
        ACCESS_CACHE_KEY,
        JSON.stringify({
          fp: tokenFingerprint(token),
          exp: Date.now() + ACCESS_CACHE_TTL_MS,
          ok: true,
        }),
      );
    } catch (e) {}
  }

  function clearAccessCache() {
    try {
      sessionStorage.removeItem(ACCESS_CACHE_KEY);
    } catch (e) {}
  }

  function hideLoading() {
    var el = document.getElementById("vc-staff-loading");
    if (!el) return;
    el.setAttribute("hidden", "");
    el.classList.add("vc-staff-loading--hidden");
  }

  function showDenied(message) {
    hideLoading();
    var panel = document.getElementById("vc-staff-denied");
    var msg = document.getElementById("vc-staff-denied-msg");
    if (msg) {
      msg.textContent = String(
        message ||
          "Non hai i permessi staff per aprire questa area. Serve un ruolo staff sul server Vinili & Caffè.",
      );
    }
    if (panel) {
      panel.removeAttribute("hidden");
      panel.classList.add("vc-staff-denied--visible");
    }
  }

  function revealApp() {
    hideLoading();
    try {
      document.documentElement.classList.remove("vc-session-verify-pending");
      var ov = document.getElementById("vc-session-verify-overlay");
      if (ov) {
        ov.classList.add("vc-session-verify-overlay--hidden");
        ov.setAttribute("aria-busy", "false");
      }
    } catch (eOv) {}
    try {
      document.documentElement.classList.add("vc-staff-app-revealed");
      document.body.classList.add("vc-staff-app-revealed");
    } catch (e) {}
    var denied = document.getElementById("vc-staff-denied");
    if (denied) {
      denied.setAttribute("hidden", "");
      denied.classList.remove("vc-staff-denied--visible");
    }
    try {
      window.dispatchEvent(new CustomEvent("vc:staff-access-ok"));
    } catch (eEv) {}
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
      return fetch(url, base);
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

  function runGate() {
    try {
      if (String(location.hash || "").indexOf("access_token=") !== -1) return;
    } catch (eH) {}

    var token = getToken();
    if (!token) {
      navigateTo(accessRequiredUrl());
      return;
    }

    var cached = readAccessCache(token);
    if (cached && cached.ok) {
      revealApp();
      return;
    }

    var api = resolvedApiUrl();
    if (!api) {
      showDenied("API di accesso staff non configurata.");
      return;
    }

    var settled = false;
    var failsafe = setTimeout(function () {
      if (settled) return;
      settled = true;
      showDenied("Verifica accesso in timeout. Riprova.");
    }, FAILSAFE_MS);

    fetchWithTimeout(api, { headers: { Authorization: "Bearer " + token } }, FETCH_TIMEOUT_MS)
      .then(function (res) {
        return res
          .json()
          .catch(function () {
            return {};
          })
          .then(function (data) {
            return { res: res, data: data };
          });
      })
      .then(function (out) {
        if (settled) return;
        settled = true;
        clearTimeout(failsafe);
        if (out.res && out.res.status === 401) {
          clearAccessCache();
          navigateTo(accessRequiredUrl());
          return;
        }
        if (out.res && out.res.ok && out.data && out.data.ok) {
          writeAccessCache(token);
          revealApp();
          return;
        }
        showDenied((out.data && out.data.message) || "Accesso negato.");
      })
      .catch(function () {
        if (settled) return;
        settled = true;
        clearTimeout(failsafe);
        showDenied("Impossibile verificare i permessi. Riprova tra poco.");
      });
  }

  function bindDeniedRetry() {
    var btn = document.getElementById("vc-staff-denied-retry");
    if (!btn) return;
    btn.addEventListener("click", function () {
      try {
        localStorage.removeItem("vc_discord_access_token");
        localStorage.removeItem("vc_discord_expires_at");
        sessionStorage.removeItem("vc_discord_me_cache");
      } catch (e) {}
      clearAccessCache();
      navigateTo(accessRequiredUrl());
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      bindDeniedRetry();
      runGate();
    });
  } else {
    bindDeniedRetry();
    runGate();
  }
})();
