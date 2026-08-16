/**
 * Oscura /dashboard* a chi non è High Staff del main Vinili
 * (Founder / Manager / Admin / HighStaff — NON Director, NON Manage Server).
 * Redirect silenzioso alla home: niente schermata “non disponibile”.
 *
 * Eccezioni (login Discord basta, niente High Staff):
 * - /dashboard/profilo*
 * - /dashboard/transcript*
 */
(function () {
  "use strict";

  var ACCESS_TOKEN_KEY = "vc_discord_access_token";
  var ACCESS_EXPIRES_KEY = "vc_discord_expires_at";
  var checkedOnce = false;
  var verifyPromise = null;

  function homeUrl() {
    try {
      var a = window.__VC_AUTH || {};
      var u = String(a.homeUrl || "/").trim();
      if (u) return u;
    } catch (e) {}
    return "/";
  }

  function obscureDashboard() {
    try {
      window.location.replace(homeUrl());
    } catch (e) {
      window.location.href = homeUrl();
    }
  }

  function getToken() {
    if (typeof window.__vcDiscordGetAccessToken === "function") {
      var t = window.__vcDiscordGetAccessToken();
      if (t) return t;
    }
    try {
      var t2 = localStorage.getItem(ACCESS_TOKEN_KEY);
      var exp = Number(localStorage.getItem(ACCESS_EXPIRES_KEY) || "0");
      if (!t2 || !exp || Date.now() >= exp) return "";
      return t2;
    } catch (e2) {
      return "";
    }
  }

  function apiBase() {
    var c = (typeof window !== "undefined" && window.__VC_SITE_DASHBOARD) || {};
    var isLocal = /^(localhost|127\.0\.0\.1)$/i.test(String(window.location.hostname || ""));
    var raw = String(isLocal && c.apiUrlLocal ? c.apiUrlLocal : c.apiUrl || "").trim();
    return raw.replace(/\/+$/, "") || "/webhooks/site-dashboard";
  }

  function hasOAuthHash() {
    try {
      return String(window.location.hash || "").indexOf("access_token=") !== -1;
    } catch (e) {
      return false;
    }
  }

  function markPending(on) {
    try {
      document.documentElement.classList.toggle("vc-dash-access-pending", Boolean(on));
    } catch (e) {}
  }

  function currentPath() {
    try {
      return String(window.location.pathname || "").replace(/\/+$/, "") || "/";
    } catch (e) {
      return "/";
    }
  }

  function isAccountSelfServicePath() {
    return /\/dashboard\/profilo(?:\/|$)/i.test(currentPath());
  }

  function isTranscriptPublicPath() {
    return /\/dashboard\/transcript(?:\/|$)/i.test(currentPath());
  }

  /** Pagine dashboard apribili senza High Staff (restano anche senza sessione). */
  function isPublicDashboardPath() {
    return isTranscriptPublicPath() || isAccountSelfServicePath();
  }

  function allowPublicDashboardStay() {
    window.__VC_DASHBOARD_ACCESS_OK = true;
    markPending(false);
    try {
      window.dispatchEvent(
        new CustomEvent("vc-dashboard-access", {
          detail: {
            allowed: true,
            transcript: isTranscriptPublicPath(),
            accountSelf: isAccountSelfServicePath(),
          },
        }),
      );
    } catch (e) {}
  }

  async function verifyHighStaffAccess() {
    if (hasOAuthHash()) return null;
    if (verifyPromise) return verifyPromise;
    if (window.__VC_DASHBOARD_ACCESS_OK === true && isPublicDashboardPath()) return true;
    if (window.__VC_DASHBOARD_ACCESS_OK === true && !isPublicDashboardPath()) return true;

    verifyPromise = (async function () {
      // Transcript / profilo: mai redirect home (anche senza login o con profilo null).
      if (isTranscriptPublicPath()) {
        allowPublicDashboardStay();
        verifyPromise = null;
        return true;
      }

      var token = getToken();
      if (!token) {
        if (isAccountSelfServicePath()) {
          allowPublicDashboardStay();
          verifyPromise = null;
          return true;
        }
        obscureDashboard();
        verifyPromise = null;
        return false;
      }

      if (isAccountSelfServicePath()) {
        allowPublicDashboardStay();
        verifyPromise = null;
        return true;
      }

      markPending(true);
      try {
        var res = await fetch(apiBase() + "/access", {
          headers: { Authorization: "Bearer " + token },
          cache: "no-store",
        });
        var data = await res.json().catch(function () {
          return {};
        });
        if (!res.ok || !data || data.ok !== true || data.allowed !== true) {
          obscureDashboard();
          return false;
        }
        window.__VC_DASHBOARD_ACCESS_OK = true;
        markPending(false);
        try {
          window.dispatchEvent(new CustomEvent("vc-dashboard-access", { detail: { allowed: true } }));
        } catch (e3) {}
        return true;
      } catch (e4) {
        obscureDashboard();
        return false;
      } finally {
        verifyPromise = null;
      }
    })();
    return verifyPromise;
  }

  function boot() {
    if (checkedOnce && window.__VC_DASHBOARD_ACCESS_OK) return;
    checkedOnce = true;
    verifyHighStaffAccess();
  }

  window.__vcDashboardObscureIfUnauthorized = function () {
    if (isPublicDashboardPath()) return;
    obscureDashboard();
  };
  window.__vcDashboardVerifyHighStaffAccess = verifyHighStaffAccess;

  // Transcript: non nascondere mai la pagina in attesa High Staff.
  if (isTranscriptPublicPath()) {
    markPending(false);
    window.__VC_DASHBOARD_ACCESS_OK = true;
  } else {
    markPending(true);
  }
  boot();

  window.addEventListener("vc-discord-profile", function (ev) {
    var u = ev && ev.detail ? ev.detail.user : null;
    if (!u) {
      // Senza profilo: restiamo sulla pagina pubblica; altrove redirect home.
      if (isPublicDashboardPath()) {
        allowPublicDashboardStay();
        return;
      }
      obscureDashboard();
      return;
    }
    checkedOnce = false;
    if (!isPublicDashboardPath()) {
      window.__VC_DASHBOARD_ACCESS_OK = false;
    }
    verifyHighStaffAccess();
  });
})();
