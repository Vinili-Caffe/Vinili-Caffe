/**
 * Fixed perf tier for everyone (no device/network autodetection).
 * Tiers available in CSS/API: full | mid | lite
 * forceMidAll1: always mid — detection + localStorage pref ignored.
 * Sets html.vc-perf-{tier} and data-vc-perf early for CSS.
 */
(function (global) {
  if (global.VcPerf && global.VcPerf.__ready) return;

  /* forceMidAll1: one tier for all devices (avoids bad auto-detect → lag). */
  var FORCE_TIER = "mid";
  var STORAGE_KEY = "vc_perf_tier_pref_v3";
  var lastTier = "";

  function conn() {
    try {
      return global.navigator && (navigator.connection || navigator.mozConnection || navigator.webkitConnection);
    } catch (e) {
      return null;
    }
  }

  function saveDataOn() {
    try {
      if (conn() && conn().saveData === true) return true;
    } catch (e) {}
    return false;
  }

  function effectiveType() {
    try {
      return String((conn() && conn().effectiveType) || "").toLowerCase();
    } catch (e) {
      return "";
    }
  }

  function isPhoneOrPwa() {
    try {
      if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return true;
      if (
        window.matchMedia &&
        window.matchMedia("(hover: none)").matches &&
        Number(navigator.maxTouchPoints || 0) > 0
      ) {
        return true;
      }
      if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true;
      if (navigator.standalone) return true;
    } catch (e) {}
    return false;
  }

  function detectAutoTier() {
    return FORCE_TIER;
  }

  function manualPref() {
    return FORCE_TIER;
  }

  function tier() {
    return FORCE_TIER;
  }

  function isLite() {
    return tier() === "lite";
  }

  function isMidOrLite() {
    var t = tier();
    return t === "lite" || t === "mid";
  }

  function applyToDocument(forceTier) {
    var t = FORCE_TIER || forceTier || "mid";
    if (t !== "lite" && t !== "mid" && t !== "full") t = "mid";
    var root = document.documentElement;
    if (!root) return t;
    root.classList.remove("vc-perf-full", "vc-perf-mid", "vc-perf-lite");
    root.classList.add("vc-perf-" + t);
    root.setAttribute("data-vc-perf", t);
    if (t === "lite" || isPhoneOrPwa()) root.classList.add("vc-cursor-trail-off");
    else root.classList.remove("vc-cursor-trail-off");
    if (isPhoneOrPwa()) root.classList.add("vc-perf-touch");
    else root.classList.remove("vc-perf-touch");
    if (t !== lastTier) {
      lastTier = t;
      try {
        document.dispatchEvent(new CustomEvent("vc:perf-tier", { detail: { tier: t } }));
      } catch (eEv) {}
    }
    return t;
  }

  function fetchTimeouts(base) {
    var b = base && typeof base === "object" ? base : {};
    var fetchTimeoutMs = Math.max(1000, Number(b.fetchTimeoutMs) || 12000);
    var failsafeMs = Math.max(fetchTimeoutMs, Number(b.failsafeMs) || 35000);
    var t = tier();
    if (t === "lite") {
      fetchTimeoutMs = Math.max(fetchTimeoutMs, 24000);
      failsafeMs = Math.max(failsafeMs, 48000);
    } else if (t === "mid") {
      fetchTimeoutMs = Math.max(fetchTimeoutMs, 18000);
      failsafeMs = Math.max(failsafeMs, 42000);
    }
    return { fetchTimeoutMs: fetchTimeoutMs, failsafeMs: failsafeMs, tier: t };
  }

  function shouldAttachApiHeaders(url) {
    try {
      var base =
        typeof location !== "undefined" && location.origin ? location.origin : "https://localhost";
      var u = new URL(String(url || ""), base);
      if (typeof location !== "undefined" && u.origin !== location.origin) return false;
      return String(u.pathname || "").indexOf("/webhooks/") === 0;
    } catch (e) {
      return false;
    }
  }

  function apiHeaders(extra, url) {
    var out = extra && typeof extra === "object" ? Object.assign({}, extra) : {};
    if (url && !shouldAttachApiHeaders(url)) return out;
    out["X-VC-Perf"] = tier();
    if (saveDataOn()) out["Save-Data"] = "on";
    return out;
  }

  function apiQuery(params) {
    var out = params && typeof params === "object" ? Object.assign({}, params) : {};
    var t = tier();
    if (t === "lite") {
      out.lite = "1";
      out.perf = "lite";
    } else if (t === "mid") {
      out.perf = "mid";
    }
    return out;
  }

  function leaderboardPerPage(defaultN) {
    var n = Math.max(1, Number(defaultN) || 9);
    var t = tier();
    if (t === "lite") return Math.min(n, 6);
    if (t === "mid") return Math.min(n, 9);
    return n;
  }

  function notificationsLimit(defaultN) {
    var n = Math.max(1, Number(defaultN) || 50);
    var t = tier();
    if (t === "lite") return Math.min(n, 30);
    if (t === "mid") return Math.min(n, 50);
    return n;
  }

  function setPref() {
    /* Pref ignored while FORCE_TIER is set; keep API for callers. */
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
    return applyToDocument();
  }

  var api = {
    __ready: true,
    tier: tier,
    isLite: isLite,
    isMidOrLite: isMidOrLite,
    apply: applyToDocument,
    fetchTimeouts: fetchTimeouts,
    shouldAttachApiHeaders: shouldAttachApiHeaders,
    apiHeaders: apiHeaders,
    apiQuery: apiQuery,
    leaderboardPerPage: leaderboardPerPage,
    notificationsLimit: notificationsLimit,
    setPref: setPref,
    getPref: manualPref,
    saveDataOn: saveDataOn,
    effectiveType: effectiveType,
    forcedTier: FORCE_TIER,
  };

  global.VcPerf = api;
  try {
    applyToDocument();
  } catch (eInit) {}
})(typeof window !== "undefined" ? window : this);
