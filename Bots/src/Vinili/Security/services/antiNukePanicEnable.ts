const { ANTINUKE_CONFIG } = require("./antiNukeConfig") as typeof import("./antiNukeConfig");
const { sendAntiNukeLog } = require("./antiNukeLog") as typeof import("./antiNukeLog");
const { getPanicState, persistAntiNukePanicSnapshotNow } = require("./antiNukePanicState") as typeof import("./antiNukePanicState");
const { createPanicCaseId, ensurePanicReport } = require("./antiNukePanicReport") as typeof import("./antiNukePanicReport");
const { lockDangerousRolesForPanic } = require("./antiNukePanicRoleLock") as typeof import("./antiNukePanicRoleLock");
const { lockGuildChannelsForPanic } = require("./antiNukePanicChannelLock") as typeof import("./antiNukePanicChannelLock");
const { scheduleAntiNukePanicUnlock } = require("./antiNukePanicUnlock") as typeof import("./antiNukePanicUnlock");
const { isAntiNukeScopeGuild } = require("./antiNukeQuarantine") as typeof import("./antiNukeQuarantine");
const { percentToHeat } = require("./antiNukeActionHeat") as typeof import("./antiNukeActionHeat");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const COMMAND_LOCK_CACHE = new Map();

function resetPanicReport(state?) {
  state.panicCaseId = createPanicCaseId();
  state.panicReport = null;
  ensurePanicReport(state);
}

function decayPanicHeat(state?, at = Date.now()) {
  const elapsedSec = Math.max(0, (at - Number(state.lastAt || at)) / 1000);
  const decay = elapsedSec * Number(ANTINUKE_CONFIG.panicMode.decayPerSec || 0);
  state.heat = Math.max(0, Number(state.heat || 0) - decay);
  state.lastAt = at;
}

async function enableAntiNukePanic(guild?, reason?, addedHeat = 0, options: Record<string, any> = {}) {
  if (!ANTINUKE_CONFIG.enabled || !ANTINUKE_CONFIG.panicMode.enabled || !guild) {
    return { activated: false, active: false };
  }
  if (!isAntiNukeScopeGuild(guild.id)) {
    return { activated: false, active: false };
  }
  const now = Date.now();
  const state = getPanicState(guild.id);
  if (state.restoreRetryTimer) {
    clearTimeout(state.restoreRetryTimer);
    state.restoreRetryTimer = null;
  }
  state.restoreRetryCount = 0;
  if (ANTINUKE_CONFIG.panicMode.useHeatAlgorithm) {
    decayPanicHeat(state, now);
  } else {
    state.lastAt = now;
  }
  state.heat += percentToHeat(addedHeat || 0);
  const threshold = Number(ANTINUKE_CONFIG.panicMode.thresholdHeat || 100);
  const forceTrigger = Boolean(options?.force);
  if (forceTrigger && Number(state.activeUntil || 0) <= now) {
    state.heat = Math.max(state.heat, threshold);
  }

  const wasActive = Number(state.activeUntil || 0) > now;
  if (state.heat < threshold && !wasActive && !forceTrigger) {
    return { activated: false, active: false };
  }

  const baseDuration = Number(ANTINUKE_CONFIG.panicMode.durationMs || 0);
  const extendBy = Number(ANTINUKE_CONFIG.panicMode.extendByMsOnTrigger || 0);
  const maxDuration = Math.max(baseDuration, Number(ANTINUKE_CONFIG.panicMode.maxDurationMs || baseDuration));
  if (!wasActive || !Number(state.panicStartedAt || 0)) {
    state.panicStartedAt = now;
  }
  const targetUntil = wasActive ? now + Math.max(baseDuration, extendBy) : now + baseDuration;
  state.activeUntil = Math.max(Number(state.activeUntil || 0), targetUntil);
  const hardCapUntil = Number(state.panicStartedAt || now) + maxDuration;
  if (state.activeUntil > hardCapUntil) {
    state.activeUntil = hardCapUntil;
  }
  state.panicTriggerHeat = Math.max(Number(state.heat || 0), threshold);
  state.heat = 0;
  persistAntiNukePanicSnapshotNow();
  try {
    const { invalidateSecurityLockCache } = require("./securityOrchestratorService") as typeof import("./securityOrchestratorService");
    invalidateSecurityLockCache(guild.id);
  } catch (_) {}
  COMMAND_LOCK_CACHE.delete(String(guild.id));

  if (!wasActive) {
    resetPanicReport(state);
    await lockDangerousRolesForPanic(guild, state);
    await lockGuildChannelsForPanic(guild, state);
  }

  scheduleAntiNukePanicUnlock(guild, state);

  if (!wasActive) {
    await sendAntiNukeLog(
      guild,
      `${E.VC_Alert} AntiNuke Panic Mode Enabled`,
      [
        `${E.VC_reason} **Reason:** ${reason || "threshold reached"}`,
        `${E.VC_reason} **Heat Algorithm:** ${ANTINUKE_CONFIG.panicMode.useHeatAlgorithm ? "ON" : "OFF"}`,
        `${E.VC_reason} **Duration:** ${Math.round(ANTINUKE_CONFIG.panicMode.durationMs / 60_000)} min`,
        `${E.VC_reason} **Max Duration:** ${Math.round(maxDuration / 60_000)} min`,
        `${E.VC_reason} **Dangerous Roles Lockdown:** ${ANTINUKE_CONFIG.panicMode.lockdown.dangerousRoles ? "ON" : "OFF"}`,
        `${E.VC_reason} **Channel Lockdown:** ${ANTINUKE_CONFIG.panicMode.lockdown.channelLockdown ? "ON" : "OFF"}`,
      ],
      "#ED4245",
    );
  }

  return { activated: !wasActive, active: true };
}

export = {
  COMMAND_LOCK_CACHE,
  enableAntiNukePanic,
};
