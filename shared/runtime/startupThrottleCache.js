const fs = require("fs");
const os = require("os");
const path = require("path");

const CACHE_DIR = path.join(os.tmpdir(), "vinili-caffe-startup-throttle");

function ensureCacheDir() {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  } catch {
    // tmp may be read-only
  }
}

function getStatePath(namespace) {
  return path.join(CACHE_DIR, `${String(namespace || "default")}.json`);
}

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function readState(namespace) {
  const filePath = getStatePath(namespace);
  if (!fs.existsSync(filePath)) return {};
  const parsed = safeReadJson(filePath);
  return parsed && typeof parsed === "object" ? parsed : {};
}

function writeState(namespace, state) {
  try {
    ensureCacheDir();
    fs.writeFileSync(getStatePath(namespace), JSON.stringify(state, null, 2), "utf8");
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} namespace e.g. "vinyls"
 * @param {string} key e.g. "startup-panels"
 * @param {number} ttlMs
 * @returns {{ due: boolean, lastAt: number, ageMs: number }}
 */
function isStartupThrottleDue(namespace, key, ttlMs) {
  const state = readState(namespace);
  const lastAt = Number(state[key] || 0) || 0;
  const ttl = Math.max(0, Number(ttlMs) || 0);
  const ageMs = lastAt > 0 ? Math.max(0, Date.now() - lastAt) : Number.POSITIVE_INFINITY;
  return {
    due: ttl <= 0 || lastAt <= 0 || ageMs >= ttl,
    lastAt,
    ageMs: Number.isFinite(ageMs) ? ageMs : 0,
  };
}

function markStartupThrottle(namespace, key, at = Date.now()) {
  const state = readState(namespace);
  state[String(key)] = Number(at) || Date.now();
  return writeState(namespace, state);
}

function clearStartupThrottle(namespace, key = null) {
  if (!key) {
    const filePath = getStatePath(namespace);
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return true;
    } catch {
      return false;
    }
  }
  const state = readState(namespace);
  delete state[String(key)];
  return writeState(namespace, state);
}

function envFlagEnabled(name) {
  const raw = String(process.env[name] || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function isFullStartupSyncEnabled() {
  return envFlagEnabled("FULL_STARTUP_SYNC");
}

/**
 * Decide se eseguire un lavoro di startup "pesante ma idempotente".
 * - forceEnv (es. STARTUP_PANELS=1) → sempre
 * - FULL_STARTUP_SYNC → sempre
 * - altrimenti solo se scaduto il TTL
 */
function shouldRunStartupWork(namespace, key, { ttlMs, forceEnv } = {}) {
  if (forceEnv && envFlagEnabled(forceEnv)) {
    return { run: true, reason: "force_env" };
  }
  if (isFullStartupSyncEnabled()) {
    return { run: true, reason: "full_sync" };
  }
  const check = isStartupThrottleDue(namespace, key, ttlMs);
  if (check.due) {
    return { run: true, reason: check.lastAt ? "ttl_expired" : "first_run", ...check };
  }
  return { run: false, reason: "throttled", ...check };
}

module.exports = {
  isStartupThrottleDue,
  markStartupThrottle,
  clearStartupThrottle,
  shouldRunStartupWork,
  isFullStartupSyncEnabled,
  envFlagEnabled,
};
