"use strict";

function header(req, name) {
  const h = req && req.headers ? req.headers : {};
  const key = String(name || "").toLowerCase();
  const raw = h[key] != null ? h[key] : h[name];
  return String(Array.isArray(raw) ? raw[0] : raw || "").trim();
}

function resolveSitePerfTier(req) {
  const q = (req && req.query) || {};
  const qLite = String(q.lite ?? "").trim().toLowerCase();
  const qPerf = String(q.perf ?? q.quality ?? "").trim().toLowerCase();
  const hPerf = header(req, "x-vc-perf").toLowerCase();
  const saveData = header(req, "save-data").toLowerCase();

  if (qLite === "1" || qLite === "true" || qLite === "yes" || qPerf === "lite" || hPerf === "lite") {
    return "lite";
  }
  if (saveData === "on" || saveData === "1" || saveData === "true") return "lite";
  if (qPerf === "mid" || hPerf === "mid") return "mid";
  if (qPerf === "full" || hPerf === "full") return "full";
  return "full";
}

function isLitePerf(req) {
  return resolveSitePerfTier(req) === "lite";
}

function isMidOrLitePerf(req) {
  const t = resolveSitePerfTier(req);
  return t === "lite" || t === "mid";
}

module.exports = {
  resolveSitePerfTier,
  isLitePerf,
  isMidOrLitePerf,
};
