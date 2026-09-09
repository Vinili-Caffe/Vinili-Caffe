(function () {
  "use strict";

  function navCfg() {
    return window.__VC_HOGWARTS_EVENT_NAV && typeof window.__VC_HOGWARTS_EVENT_NAV === "object"
      ? window.__VC_HOGWARTS_EVENT_NAV
      : null;
  }

  function calendarCfg() {
    return window.__VC_HOGWARTS_EVENT_CALENDAR && typeof window.__VC_HOGWARTS_EVENT_CALENDAR === "object"
      ? window.__VC_HOGWARTS_EVENT_CALENDAR
      : null;
  }

  function previewMode() {
    var nav = navCfg();
    if (nav && nav.previewMode === true) return true;
    var cal = calendarCfg();
    return Boolean(cal && cal.previewMode);
  }

  function isLocalOrigin() {
    try {
      var h = String(window.location.hostname || "").toLowerCase();
      return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
    } catch (e) {
      return false;
    }
  }

  function accessApiUrl() {
    var nav = navCfg() || {};
    var local = String(nav.accessApiUrlLocal || "").trim();
    var direct = String(nav.accessApiUrl || "").trim();
    if (isLocalOrigin() && local) return local;
    return direct || "/webhooks/site-hogwarts-sorting/access";
  }

  function homeUrl() {
    try {
      var u = String(window.__VC_SITE_HOME_URL || "").trim();
      if (u) return u;
      var auth = window.__VC_AUTH;
      if (auth && auth.homeUrl) return String(auth.homeUrl).trim();
    } catch (e) {}
    return "/";
  }

  function redirectHome() {
    try {
      window.location.replace(homeUrl());
    } catch (e) {
      window.location.href = homeUrl();
    }
  }

  function getToken() {
    try {
      var t = String(localStorage.getItem("vc_discord_access_token") || "").trim();
      var exp = Number(localStorage.getItem("vc_discord_expires_at") || "0");
      if (!t || !exp || Date.now() >= exp) return "";
      return t;
    } catch (e) {
      return "";
    }
  }

  function unlockPage() {
    try {
      window.__VC_HOGWARTS_STAFF_PREVIEW = true;
      document.body.classList.remove("vc-hw-preview-locked");
      document.dispatchEvent(new CustomEvent("vc-hogwarts-staff-preview-unlock"));
    } catch (e) {}
  }

  function lockPageAfterLogout() {
    try {
      window.__VC_HOGWARTS_STAFF_PREVIEW = false;
      if (previewMode()) {
        document.body.classList.add("vc-hw-preview-locked");
        redirectHome();
      }
    } catch (eLock) {
      try {
        redirectHome();
      } catch (eHome) {}
    }
  }

  function verifyAccess() {
    if (window.__VC_HOGWARTS_STAFF_PREVIEW) {
      unlockPage();
      return Promise.resolve(true);
    }
    var token = getToken();
    if (!token) {
      redirectHome();
      return Promise.resolve(false);
    }
    var url = accessApiUrl();
    if (!url || /\{\{/.test(url)) {
      redirectHome();
      return Promise.resolve(false);
    }
    return fetch(url, { headers: { Authorization: "Bearer " + token }, credentials: "same-origin" })
      .then(function (res) {
        return res.json().catch(function () {
          return {};
        }).then(function (body) {
          if (res.ok && body && body.ok) {
            unlockPage();
            return true;
          }
          redirectHome();
          return false;
        });
      })
      .catch(function () {
        redirectHome();
        return false;
      });
  }

  function boot() {
    if (!previewMode()) return;
    document.body.classList.add("vc-hw-preview-locked");
    verifyAccess();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  window.addEventListener("vc-discord-profile", function () {
    if (!previewMode()) return;
    if (!getToken()) {
      lockPageAfterLogout();
      return;
    }
    verifyAccess();
  });
  window.addEventListener("vc:auth-logout", function () {
    if (previewMode()) lockPageAfterLogout();
  });
  document.addEventListener("vc-hogwarts-staff-preview-unlock", function () {
    unlockPage();
  });
})();
