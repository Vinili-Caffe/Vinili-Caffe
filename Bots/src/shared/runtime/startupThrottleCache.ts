const fs = require("fs") as typeof import("fs");
const os = require("os") as typeof import("os");
const path = require("path") as typeof import("path");

const CACHE_DIR = path.join(os.tmpdir(), "vinili-caffe-startup-throttle");

function ensureCacheDir() {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  } catch {
  }
}

function getStatePath(namespace?) {
  return path.join(CACHE_DIR, `${String(namespace || "default")}.json`);
}

function getLockPath(namespace?) {
  return path.join(CACHE_DIR, `${String(namespace || "default")}.lock`);
}

function safeReadJson(filePath?) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function readState(namespace?) {
  const filePath = getStatePath(namespace);
  if (!fs.existsSync(filePath)) return {};
  const parsed = safeReadJson(filePath);
  return parsed && typeof parsed === "object" ? parsed : {};
}

/** Atomic write: tmp + rename (riduce race multi-restart). */
function writeState(namespace?, state?) {
  try {
    ensureCacheDir();
    const target = getStatePath(namespace);
    const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
    try {
      fs.renameSync(tmp, target);
    } catch {
      fs.copyFileSync(tmp, target);
      try {
        fs.unlinkSync(tmp);
      } catch (_) {}
    }
    return true;
  } catch {
    return false;
  }
}

function withNamespaceLock(namespace?, fn?) {
  ensureCacheDir();
  const lockPath = getLockPath(namespace);
  let fd = null;
  const started = Date.now();
  while (Date.now() - started < 1500) {
    try {
      fd = fs.openSync(lockPath, "wx");
      break;
    } catch (err) {
      if (err?.code !== "EEXIST") break;
      try {
        const st = fs.statSync(lockPath);
        if (Date.now() - Number(st.mtimeMs || 0) > 10_000) {
          try {
            fs.unlinkSync(lockPath);
          } catch (_) {}
          continue;
        }
      } catch (_) {}
      const end = Date.now() + 20;
      while (Date.now() < end) {}
    }
  }
  try {
    return fn();
  } finally {
    if (fd != null) {
      try {
        fs.closeSync(fd);
      } catch (_) {}
      try {
        fs.unlinkSync(lockPath);
      } catch (_) {}
    }
  }
}

function isStartupThrottleDue(namespace?, key?, ttlMs?) {
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

function markStartupThrottle(namespace?, key?, at = Date.now()) {
  return withNamespaceLock(namespace, () => {
    const state = readState(namespace);
    state[String(key)] = Number(at) || Date.now();
    return writeState(namespace, state);
  });
}

/**
 * Claim atomico: true solo se questo processo “prende” il lavoro (due+restart non lo ripetono).
 */
function tryClaimStartupWork(namespace?, key?, ttlMs?) {
  return withNamespaceLock(namespace, () => {
    const check = isStartupThrottleDue(namespace, key, ttlMs);
    if (!check.due) {
      return { claimed: false, reason: "throttled", ...check };
    }
    const state = readState(namespace);
    state[String(key)] = Date.now();
    writeState(namespace, state);
    return { claimed: true, reason: check.lastAt ? "ttl_expired" : "first_run", ...check };
  });
}

function envFlagEnabled(name?) {
  const raw = String(process.env[name] || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function isFullStartupSyncEnabled() {
  return envFlagEnabled("FULL_STARTUP_SYNC");
}

function shouldRunStartupWork(namespace?, key?, { ttlMs, forceEnv }: any = {}) {
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

export = {
  isStartupThrottleDue,
  markStartupThrottle,
  tryClaimStartupWork,
  shouldRunStartupWork,
  isFullStartupSyncEnabled,
  envFlagEnabled,
};
