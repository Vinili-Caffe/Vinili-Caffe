(function () {
  function isLocalOrigin() {
    try {
      var h = String(window.location.hostname || "").toLowerCase();
      return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
    } catch (e) {
      return false;
    }
  }

  function hogwartsCfg() {
    return (typeof window !== "undefined" && window.__VC_HOGWARTS) || {};
  }

  function apiBase() {
    var c = hogwartsCfg();
    var local = String(c.apiUrlLocal || "").trim();
    var direct = String(c.apiUrl || "").trim();
    if (isLocalOrigin() && local) return local.replace(/\/+$/, "");
    if (direct) return direct.replace(/\/+$/, "");
    return "/webhooks/site-hogwarts-sorting";
  }

  function accessApiUrl() {
    return apiBase() + "/access";
  }

  function bootstrapApiUrl() {
    return apiBase() + "/bootstrap";
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

  function redirectHome() {
    hideLoading();
    try {
      if (typeof window.__vcHogwartsIntroForceClose === "function") {
        window.__vcHogwartsIntroForceClose();
      }
    } catch (e0) {}
    var raw = "";
    try {
      raw = String((window.__VC_SITE_HOME_URL || hogwartsCfg().homeUrl || "").trim());
    } catch (e1) {}
    try {
      var u = raw ? new URL(raw) : new URL("/", window.location.origin);
      window.location.replace(u.href);
    } catch (e2) {
      try {
        window.location.replace("/");
      } catch (e3) {}
    }
  }

  function hideLoading() {
    try {
      document.documentElement.classList.add("vc-hw-loading-done");
    } catch (e0) {}
    var el = document.getElementById("vc-hw-loading");
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

  function revealApp() {
    try {
      document.body.classList.add("vc-hw-app-revealed");
      document.body.classList.add("vc-hw-intro-finished");
    } catch (eR) {}
    hideLoading();
    var app = document.getElementById("vc-hogwarts-app");
    if (app) app.style.display = "";
    try {
      if (typeof window.__vcHogwartsInit === "function") window.__vcHogwartsInit();
    } catch (eInit) {}
    try {
      if (typeof window.__vcHogwartsYoutubeSetupIfConfigured === "function") {
        window.__vcHogwartsYoutubeSetupIfConfigured();
      }
    } catch (eBgm) {}
  }

  function playIntroThen(next) {
    hideLoading();
    if (typeof window.__vcHogwartsIntroOpen === "function") {
      window.__vcHogwartsIntroOpen(next);
      return;
    }
    if (typeof next === "function") next();
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

  async function loadBootstrapPreview() {
    var res = await fetchWithTimeout(bootstrapApiUrl());
    var data = await res.json().catch(function () {
      return {};
    });
    if (!res.ok || !data.ok) return { previewMode: false, ok: false };
    var ev = data.event && typeof data.event === "object" ? data.event : {};
    return { previewMode: Boolean(ev.previewMode), ok: true };
  }

  async function checkPreviewAccess() {
    var token = getToken();
    if (!token) return false;
    try {
      var res = await fetchWithTimeout(accessApiUrl(), {
        headers: { Authorization: "Bearer " + token },
      });
      var data = await res.json().catch(function () {
        return {};
      });
      return Boolean(res.ok && data && data.ok);
    } catch (err) {
      return false;
    }
  }

  async function afterIntro() {
    var preview = false;
    try {
      var boot = await loadBootstrapPreview();
      if (!boot.ok) {
        revealApp();
        return;
      }
      preview = Boolean(boot.previewMode);
    } catch (eBoot) {
      revealApp();
      return;
    }

    if (!preview) {
      revealApp();
      return;
    }

    if (await checkPreviewAccess()) {
      revealApp();
      return;
    }

    redirectHome();
  }

  function run() {
    try {
      document.body.classList.remove("vc-hw-app-revealed");
      document.body.classList.remove("vc-hw-intro-finished");
    } catch (eR1) {}
    playIntroThen(afterIntro);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();