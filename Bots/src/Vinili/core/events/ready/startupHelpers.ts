const config = require("../../../config.json") as typeof import("../../../config.json");
const { formatDurationMs, } = require("../../../../shared/runtime/readyStartupRuntime") as typeof import("../../../../shared/runtime/readyStartupRuntime");
const {
  shouldRunStartupWork,
  markStartupThrottle,
  isStartupThrottleDue,
  isFullStartupSyncEnabled,
  envFlagEnabled,
} = require("../../../../shared/runtime/startupThrottleCache") as typeof import("../../../../shared/runtime/startupThrottleCache");

const STARTUP_THROTTLE_NS = "vinyls";
const STARTUP_PANELS_TTL_MS = Math.max(
  0,
  Number(process.env.STARTUP_PANELS_TTL_MS) || 6 * 60 * 60 * 1000,
);
const STARTUP_MEDIUM_TTL_MS = Math.max(
  0,
  Number(process.env.STARTUP_MEDIUM_TTL_MS) || 60 * 60 * 1000,
);
const STARTUP_PANELS_RETRY_MS = 15000;
const LOOP_STAGGER_MS = Math.max(0, Number(process.env.LOOP_STAGGER_MS) || 400);
const ENGAGEMENT_INTERVAL_MS = Number(process.env.ENGAGEMENT_INTERVAL_MS) || 60 * 1000;
const JOIN_RAID_RESTORE_INTERVAL_MS = Number(process.env.JOIN_RAID_RESTORE_INTERVAL_MS) || 10 * 60 * 1000;
const CLEANUP_USERS_NOT_IN_SERVER_DELAY_MS = Number(process.env.CLEANUP_USERS_NOT_IN_SERVER_DELAY_MS) || 3 * 60 * 1000;
/* Default 7d: guildMemberRemove runs incremental cleanup via runCleanupAfterMemberLeave; full scan is a safety net. */
const CLEANUP_USERS_NOT_IN_SERVER_INTERVAL_MS = (() => {
  const v = process.env.CLEANUP_USERS_NOT_IN_SERVER_INTERVAL_MS;
  if (v === undefined || v === "") return 7 * 24 * 60 * 60 * 1000;
  const n = Number(v);
  return Number.isFinite(n) ? n : 7 * 24 * 60 * 60 * 1000;
})();

function shouldRunVerificationTenureBackfill(client?) {
  const envValue = String(process.env.VERIFICATION_TENURE_BACKFILL_ON_STARTUP || "").trim().toLowerCase();
  if (envValue) return ["1", "true", "yes", "on"].includes(envValue);
  return Boolean(client?.config?.verificationTenureBackfillOnStartup);
}

function shouldRunTopggStatsDigestOnStartup(client?) {
  const envValue = String(process.env.TOPGG_STATS_DIGEST_ON_STARTUP || "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(envValue)) return true;
  if (["0", "false", "no", "off"].includes(envValue)) return false;
  return Boolean(client?.config?.topgg?.statsDigestOnStartup);
}

const LOG_STARTUP = String(process.env.LOG_STARTUP || "0") === "1";

function logError(client?, ...args) {
  if (client?.logs?.error) {
    client.logs.error(...args);
    return;
  }
  global.logger?.error?.(...args);
}

function logInfo(client?, ...args) {
  if (!LOG_STARTUP) return;
  if (client?.logs?.success) {
    client.logs.success(...args);
    return;
  }
  global.logger?.info?.(...args);
}

function resolveMaxListeners(client?) {
  const raw = Number(client?.config?.eventListeners ?? config?.eventListeners ?? 50);
  if (!Number.isFinite(raw) || raw <= 0) return 50;
  return Math.max(10, Math.floor(raw));
}

function createStartupHooks(client?) {
  return {
    onStart: (label?) => {
      logInfo(client, `[STARTUP] ${label} started.`);
    },
    onSuccess: (label?, startedAt?) => {
      logInfo(
        client,
        `[STARTUP] ${label} completed in ${formatDurationMs(Date.now() - startedAt)}.`,
      );
    },
    onError: (label?, startedAt?, reason?) => {
      logError(
        client,
        `[STARTUP] ${label} failed after ${formatDurationMs(Date.now() - startedAt)}:`,
        reason,
      );
    },
  };
}

function shouldRunMediumStartup(key?, ttlMs = STARTUP_MEDIUM_TTL_MS) {
  return shouldRunStartupWork(STARTUP_THROTTLE_NS, key, { ttlMs }).run;
}

function markMediumStartup(key?) {
  markStartupThrottle(STARTUP_THROTTLE_NS, key);
}

export = {
  STARTUP_THROTTLE_NS,
  STARTUP_PANELS_TTL_MS,
  STARTUP_MEDIUM_TTL_MS,
  STARTUP_PANELS_RETRY_MS,
  LOOP_STAGGER_MS,
  ENGAGEMENT_INTERVAL_MS,
  JOIN_RAID_RESTORE_INTERVAL_MS,
  CLEANUP_USERS_NOT_IN_SERVER_DELAY_MS,
  CLEANUP_USERS_NOT_IN_SERVER_INTERVAL_MS,
  shouldRunVerificationTenureBackfill,
  shouldRunTopggStatsDigestOnStartup,
  LOG_STARTUP,
  logError,
  logInfo,
  resolveMaxListeners,
  createStartupHooks,
  shouldRunMediumStartup,
  markMediumStartup,
  shouldRunStartupWork,
  markStartupThrottle,
  isStartupThrottleDue,
  isFullStartupSyncEnabled,
  envFlagEnabled,
  formatDurationMs,
};
