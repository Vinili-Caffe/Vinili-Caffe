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

  function potionsMeta() {
    var nav = navCfg();
    if (nav && nav.potions && typeof nav.potions === "object") return nav.potions;
    var cal = calendarCfg();
    if (cal && cal.potions && typeof cal.potions === "object") return cal.potions;
    return null;
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

  function potionsPlayableNow() {
    var pot = potionsMeta();
    if (!pot || pot.enabled === false) return false;
    var startMs = Number(pot.startMs);
    return Number.isFinite(startMs) && Date.now() >= startMs;
  }

  function setNodesVisible(nodes, visible) {
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (visible) {
        el.hidden = false;
        el.removeAttribute("hidden");
        el.style.removeProperty("display");
      } else {
        el.hidden = true;
        el.setAttribute("hidden", "");
      }
    }
  }

  function setEventNavLinksVisible(navId, visible) {
    setNodesVisible(document.querySelectorAll('[data-vc-event-nav-id="' + navId + '"]'), visible);
  }

  function setAllEventNavVisible(visible) {
    setNodesVisible(document.querySelectorAll("[data-vc-event-nav-id]"), visible);
  }

  function syncPotionsLinksVisible() {
    setEventNavLinksVisible("potions", potionsPlayableNow());
  }

  function markStaffPreviewReady() {
    try {
      window.__VC_HOGWARTS_STAFF_PREVIEW = true;
      document.body.classList.remove("vc-hw-preview-locked");
      document.dispatchEvent(new CustomEvent("vc-hogwarts-staff-preview-unlock"));
    } catch (e) {}
  }

  function setStaffPreviewNavVisible(visible) {
    var nodes = document.querySelectorAll("[data-vc-event-nav-id]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var navId = el.getAttribute("data-vc-event-nav-id");
      var show = visible && (navId !== "potions" || potionsPlayableNow());
      if (show) {
        el.hidden = false;
        el.removeAttribute("hidden");
        el.style.removeProperty("display");
      } else {
        el.hidden = true;
        el.setAttribute("hidden", "");
      }
    }
    if (visible) markStaffPreviewReady();
  }

  function tryStaffPreviewUnlock() {
    if (!previewMode()) return;
    var token = getToken();
    if (!token) return;
    var url = accessApiUrl();
    if (!url || /\{\{/.test(url)) return;
    fetch(url, { headers: { Authorization: "Bearer " + token }, credentials: "same-origin" })
      .then(function (res) {
        return res.json().catch(function () {
          return null;
        }).then(function (body) {
          return { res: res, body: body };
        });
      })
      .then(function (out) {
        if (!out || !out.res || !out.res.ok || !out.body || out.body.ok !== true) return;
        if (out.body.previewGate === false && !previewMode()) return;
        setStaffPreviewNavVisible(true);
      })
      .catch(function () {});
  }

  function stripStaffFromEventNav() {
    try {
      var nodes = document.querySelectorAll(
        "header [data-vc-staff-tools-nav], header .vc-snav-details--staff, nav.vc-header-snav [data-vc-staff-tools-nav], nav.vc-header-snav .vc-snav-details--staff",
      );
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (el && el.parentNode) el.parentNode.removeChild(el);
      }
    } catch (eStrip) {}
  }

  function boot() {
    syncPotionsLinksVisible();
    stripStaffFromEventNav();
    window.setTimeout(stripStaffFromEventNav, 200);
    window.setTimeout(stripStaffFromEventNav, 1000);
    if (!previewMode()) return;
    var nodes = document.querySelectorAll("[data-vc-event-nav-id]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.getAttribute("data-vc-event-nav-id") === "potions") continue;
      el.hidden = true;
      el.setAttribute("hidden", "");
    }
    tryStaffPreviewUnlock();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  window.addEventListener("vc-discord-profile", tryStaffPreviewUnlock);
})();