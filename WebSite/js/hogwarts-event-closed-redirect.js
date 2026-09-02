(function () {
  "use strict";

  function calendarCfg() {
    try {
      return window.__VC_HOGWARTS_EVENT_CALENDAR && typeof window.__VC_HOGWARTS_EVENT_CALENDAR === "object"
        ? window.__VC_HOGWARTS_EVENT_CALENDAR
        : null;
    } catch (e) {
      return null;
    }
  }

  function navCfg() {
    try {
      return window.__VC_HOGWARTS_EVENT_NAV && typeof window.__VC_HOGWARTS_EVENT_NAV === "object"
        ? window.__VC_HOGWARTS_EVENT_NAV
        : null;
    } catch (e) {
      return null;
    }
  }

  function promoEventCfg() {
    try {
      var promo = window.__VC_HEADER_PROMO;
      return promo && promo.event && typeof promo.event === "object" ? promo.event : null;
    } catch (e2) {
      return null;
    }
  }

  function homeUrl() {
    try {
      var u = String(window.__VC_SITE_HOME_URL || "").trim();
      if (u) return u;
      var auth = window.__VC_AUTH;
      if (auth && auth.homeUrl) return String(auth.homeUrl).trim();
    } catch (e3) {}
    return "/";
  }

  function redirectHome() {
    try {
      window.location.replace(homeUrl());
    } catch (e4) {
      window.location.href = homeUrl();
    }
  }

  function eventClosed() {
    var cal = calendarCfg();
    var nav = navCfg();
    var ev = promoEventCfg();
    if (cal && cal.enabled === false) return true;
    if (nav && nav.enabled === false) return true;
    if (ev && ev.enabled === false) return true;
    var endMs = Number(
      (cal && cal.eventEndMs) || (nav && nav.eventEndMs) || (ev && ev.endMs) || NaN,
    );
    if (Number.isFinite(endMs) && Date.now() > endMs) return true;
    return false;
  }

  function isEventoPath() {
    try {
      var p = String(window.location.pathname || "/").replace(/\/+$/, "") || "/";
      return p === "/evento" || p.indexOf("/evento/") === 0;
    } catch (e5) {
      return false;
    }
  }

  function hideHomeEventBlock() {
    try {
      var sec = document.getElementById("evento");
      if (sec) {
        sec.setAttribute("hidden", "");
        sec.style.display = "none";
      }
    } catch (e6) {}
  }

  function boot() {
    if (!eventClosed()) return;
    if (isEventoPath()) {
      redirectHome();
      return;
    }
    hideHomeEventBlock();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
