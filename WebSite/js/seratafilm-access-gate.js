(function () {
  function isLocalOrigin() {
    try {
      var h = String(window.location.hostname || "").toLowerCase();
      return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
    } catch (e) {
      return false;
    }
  }

  function resolvedApiUrl() {
    var c = (typeof window !== "undefined" && window.__VC_SERATAFILM_ACCESS) || {};
    var local = String(c.apiUrlLocal || "").trim();
    if (isLocalOrigin() && local) return local;
    var full = String(c.apiUrl || "").trim();
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
    var ms = Math.max(5000, Math.min(16000, Number(timeoutMs) || 12000));
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

  async function run() {
    try {
      document.body.classList.remove("vc-seratafilm-app-revealed");
    } catch (eR1) {}
    var api = resolvedApiUrl();
    var app = document.getElementById("vc-seratafilm-app");
    if (!api) {
      showDenied(
        "Configurazione incompleta: imposta seratafilmAccessApiUrl in site.config.json e rifai il build.",
      );
      return;
    }
    var token = getToken();
    if (!token) {
      redirectHome();
      return;
    }
    try {
      var res = await fetchWithTimeout(api, { headers: { Authorization: "Bearer " + token } });
      var data = await res.json().catch(function () {
        return {};
      });
      if (res.ok && data && data.ok) {
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();