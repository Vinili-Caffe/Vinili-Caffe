/**
 * node-cron 4.x logs WARN "missed execution" whenever the heartbeat timer
 * fires a bit late. Brief event-loop stalls (startup, catalog write, Discord
 * bursts) trigger noisy false positives without meaning jobs were skipped.
 *
 * Logger is not on the package "exports" map, so we load it via createRequire
 * from the installed package root (plain require("node-cron/dist/...") fails).
 */
const Module = require("module");
const path = require("path");

function resolveNodeCronPackageRoot() {
  const entry = require.resolve("node-cron");
  // .../node-cron/dist/cjs/node-cron.js → package root
  return path.resolve(path.dirname(entry), "..", "..");
}

function loadNodeCronLogger() {
  try {
    const root = resolveNodeCronPackageRoot();
    const req = Module.createRequire(path.join(root, "package.json"));
    const mod = req("./dist/cjs/logger.js");
    return mod?.default || mod || null;
  } catch {
    try {
      const root = resolveNodeCronPackageRoot();
      const req = Module.createRequire(path.join(root, "package.json"));
      const mod = req("./dist/esm/logger.js");
      return mod?.default || mod || null;
    } catch {
      return null;
    }
  }
}

function installNodeCronMissFilter(options = {}) {
  if (global.__vcNodeCronMissFilterInstalled) return;
  global.__vcNodeCronMissFilterInstalled = true;

  const bootAt = Date.now();
  const bootGraceMs = Math.max(0, Number(options.bootGraceMs) || 180_000);
  // Di default silenzia quasi tutti i miss: su questo host arrivano a ondate
  // da 2–4s di jitter e intasano pm2 senza segnalare job saltati.
  const softMissMs = Math.max(250, Number(options.softMissMs) || 120_000);
  const suppressAllMisses = options.suppressAllMisses !== false;

  const logger = loadNodeCronLogger();
  if (!logger || typeof logger.warn !== "function") {
    try {
      global.logger?.warn?.(
        "[cron] node-cron miss filter non installato (logger non caricabile)",
      );
    } catch {
      /* ignore */
    }
    return;
  }

  const originalWarn = logger.warn.bind(logger);
  logger.warn = function filteredWarn(message) {
    const text = String(message || "");
    if (text.includes("missed execution at ")) {
      if (suppressAllMisses) return;
      const age = Date.now() - bootAt;
      if (age < bootGraceMs) return;
      const match = text.match(/missed execution at (.+?)!/);
      const expectedMs = match ? Date.parse(match[1]) : NaN;
      const lateMs = Number.isFinite(expectedMs) ? Date.now() - expectedMs : softMissMs;
      if (lateMs < softMissMs && !options.logSoftMisses) return;
    }
    if (
      text.includes("task still running, new execution blocked by overlap prevention")
      && !options.logOverlapBlocks
    ) {
      return;
    }
    return originalWarn(message);
  };

  global.__vcNodeCronMissFilterActive = true;
}

module.exports = { installNodeCronMissFilter, loadNodeCronLogger };
