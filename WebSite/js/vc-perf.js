/**
 * Adaptive perf tier from device + network.
 * Tiers: full | mid | lite
 * Sets html.vc-perf-{tier} and data-vc-perf early for CSS.
 */
(function (global) {
  if (global.VcPerf && global.VcPerf.__ready) return;

  /* v3: telefono non viene più spinto a mid (look “migliora” / full). */
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

  function deviceMemoryGb() {
    try {
      var n = Number(navigator.deviceMemory);
      return Number.isFinite(n) && n > 0 ? n : 0;
    } catch (e) {
      return 0;
    }
  }

  function cpuCores() {
    try {
      var n = Number(navigator.hardwareConcurrency);
      return Number.isFinite(n) && n > 0 ? n : 0;
    } catch (e) {
      return 0;
    }
  }

  function downlinkMbps() {
    try {
      var n = Number(conn() && conn().downlink);
      return Number.isFinite(n) && n >= 0 ? n : -1;
    } catch (e) {
      return -1;
    }
  }

  function manualPref() {
    try {
      var v = String(localStorage.getItem(STORAGE_KEY) || "").trim().toLowerCase();
      if (v === "lite" || v === "mid" || v === "full" || v === "auto") return v;
    } catch (e) {}
    return "auto";
  }

  function detectAutoTier() {
    // phoneUltra1: default FULL ovunque (PC + telefono). Lite solo casi estremi.
    if (saveDataOn()) return "lite";
    var et = effectiveType();
    if (et === "slow-2g" || et === "2g") return "lite";
    var mem = deviceMemoryGb();
    if (mem > 0 && mem <= 2) return "lite";
    var dl = downlinkMbps();
    if (dl >= 0 && dl > 0 && dl < 0.7) return "lite";
    return "full";
  }

  function tier() {
    var pref = manualPref();
    if (pref === "lite" || pref === "mid" || pref === "full") return pref;
    return detectAutoTier();
  }

  function isLite() {
    return tier() === "lite";
  }

  function isMidOrLite() {
    var t = tier();
    return t === "lite" || t === "mid";
  }

  function applyToDocument(forceTier) {
    var t = forceTier || tier();
    var root = document.documentElement;
    if (!root) return t;
    root.classList.remove("vc-perf-full", "vc-perf-mid", "vc-perf-lite");
    root.classList.add("vc-perf-" + t);
    root.setAttribute("data-vc-perf", t);
    if (t === "lite") root.classList.add("vc-cursor-trail-off");
    else root.classList.remove("vc-cursor-trail-off");
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
    var et = effectiveType();
    if (t === "lite" || et === "slow-2g" || et === "2g") {
      fetchTimeoutMs = Math.max(fetchTimeoutMs, 24000);
      failsafeMs = Math.max(failsafeMs, 48000);
    } else if (t === "mid" || et === "3g") {
      fetchTimeoutMs = Math.max(fetchTimeoutMs, 18000);
      failsafeMs = Math.max(failsafeMs, 42000);
    }
    return { fetchTimeoutMs: fetchTimeoutMs, failsafeMs: failsafeMs, tier: t };
  }

  function apiHeaders(extra) {
    var out = extra && typeof extra === "object" ? Object.assign({}, extra) : {};
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

  function setPref(next) {
    var v = String(next || "auto").trim().toLowerCase();
    if (v !== "lite" && v !== "mid" && v !== "full" && v !== "auto") v = "auto";
    try {
      if (v === "auto") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, v);
    } catch (e) {}
    return applyToDocument();
  }

  function bindConnection() {
    var c = conn();
    if (!c || typeof c.addEventListener !== "function") return;
    try {
      c.addEventListener("change", function () {
        if (manualPref() !== "auto") return;
        applyToDocument();
      });
    } catch (e) {}
  }

  var api = {
    __ready: true,
    tier: tier,
    isLite: isLite,
    isMidOrLite: isMidOrLite,
    apply: applyToDocument,
    fetchTimeouts: fetchTimeouts,
    apiHeaders: apiHeaders,
    apiQuery: apiQuery,
    leaderboardPerPage: leaderboardPerPage,
    notificationsLimit: notificationsLimit,
    setPref: setPref,
    getPref: manualPref,
    saveDataOn: saveDataOn,
    effectiveType: effectiveType,
  };

  global.VcPerf = api;
  try {
    applyToDocument();
    bindConnection();
  } catch (eInit) {}
})(typeof window !== "undefined" ? window : this);
