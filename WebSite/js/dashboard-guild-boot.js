(function () {
  "use strict";
    var VER = "20260914sitePerfW2a"; /* wave2DashSplit1: idle boot unchanged, bust sync */
  var loaded = false;
  var loading = false;
  var queue = [];

  function scriptPrefix() {
    var scripts = document.getElementsByTagName("script");
    for (var i = 0; i < scripts.length; i++) {
      var src = String(scripts[i].getAttribute("src") || scripts[i].src || "");
      var m = src.match(/^(.*\/js\/)dashboard-guild-boot\.js/);
      if (m) return m[1];
    }
    return "/js/";
  }

  function hasSessionToken() {
    try {
      var t = localStorage.getItem("vc_discord_access_token");
      var exp = Number(localStorage.getItem("vc_discord_expires_at") || "0");
      return Boolean(t && (!exp || Date.now() < exp));
    } catch (e) { return false; }
  }

  function gateDismissed() {
    try {
      return (
        window.__VC_DASHBOARD_ACCESS_OK === true ||
        window.__VC_ACCESS_OK === true ||
        document.documentElement.classList.contains("vc-dash-access-ready")
      );
    } catch (e2) { return false; }
  }

  function loadCore() {
    if (loaded) return Promise.resolve();
    if (loading) {
      return new Promise(function (resolve) { queue.push(resolve); });
    }
    loading = true;
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = scriptPrefix() + "dashboard-guild-core.js?v=" + VER;
      s.onload = function () {
        loading = false;
        if (window.__VC_DASH_SWITCHER_OWNED === true) {
          loaded = true;
          queue.splice(0).forEach(function (fn) { fn(); });
          resolve();
          return;
        }
        try { s.remove(); } catch (eRm) {}
        reject(new Error("guild_core_exec_failed"));
      };
      s.onerror = function () {
        loading = false;
        reject(new Error("guild_core_load_failed"));
      };
      (document.head || document.documentElement).appendChild(s);
    });
  }

  function scheduleLoad() {
    if (!hasSessionToken() && !gateDismissed()) return;
    loadCore().catch(function () {
      setTimeout(function () {
        loadCore().catch(function () {});
      }, 1200);
    });
  }

  function prefetchExtIdle() {
    if (!loaded) return;
    var run = function () {
      try {
        if (window.__VC_DG && typeof window.__VC_DG.prefetchExtChunk === "function") {
          window.__VC_DG.prefetchExtChunk();
        }
      } catch (eP) {}
    };
    if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: 5000 });
    else setTimeout(run, 1500);
  }

  window.addEventListener("vc-dashboard-access", function () {
    scheduleLoad();
    setTimeout(prefetchExtIdle, 900);
  });
  window.addEventListener("vc:access-ok", function () { scheduleLoad(); });
  window.addEventListener("vc-discord-profile", function (ev) {
    if (ev && ev.detail && ev.detail.user) scheduleLoad();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { scheduleLoad(); });
  } else {
    scheduleLoad();
  }
  window.addEventListener("load", function () { scheduleLoad(); }, { once: true });
})();
