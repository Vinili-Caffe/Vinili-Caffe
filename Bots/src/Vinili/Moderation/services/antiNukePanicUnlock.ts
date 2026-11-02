const { sendAntiNukeLog } = require("./antiNukeLog") as typeof import("./antiNukeLog");
const { getPanicState, persistAntiNukePanicSnapshotNow } = require("./antiNukePanicState") as typeof import("./antiNukePanicState");
const { sendPanicModeDetailedReport } = require("./antiNukePanicReport") as typeof import("./antiNukePanicReport");
const { unlockDangerousRolesAfterPanic } = require("./antiNukePanicRoleLock") as typeof import("./antiNukePanicRoleLock");
const { unlockGuildChannelsAfterPanic } = require("./antiNukePanicChannelLock") as typeof import("./antiNukePanicChannelLock");
const { runAutoBackupSyncAfterPanic } = require("./antiNukePanicBackupSync") as typeof import("./antiNukePanicBackupSync");

function schedulePanicRestoreRetry(guild?, state?, reason = "retry") {
  if (!guild?.id || !state) return;
  if (state.restoreRetryTimer) return;
  const maxTries = 30;
  const delayMs = 60_000;
  state.restoreRetryTimer = setTimeout(async () => {
    state.restoreRetryTimer = null;
    if (Number(state.activeUntil || 0) > Date.now()) {
      schedulePanicRestoreRetry(guild, state, "still_active");
      return;
    }
    state.restoreRetryCount = Number(state.restoreRetryCount || 0) + 1;
    const roleResult = await unlockDangerousRolesAfterPanic(guild, state);
    const channelResult = await unlockGuildChannelsAfterPanic(guild, state);
    const done = Boolean(roleResult?.completed) && Boolean(channelResult?.completed) && Number(state.lockedRoles?.size || 0) === 0 && Number(state.lockedChannels?.size || 0) === 0;
    if (done) {
      state.restoreRetryCount = 0;
      return;
    }
    if (state.restoreRetryCount < maxTries) {
      schedulePanicRestoreRetry(guild, state, reason);
      return;
    }
    await sendAntiNukeLog(
      guild,
      "<a:VC_Alert:1482706673176150077> AntiNuke Panic Restore Pending",
      [
        `<:VC_reason:1478517122929004544> **Reason:** restore retry limit reached`,
        `<:VC_reason:1478517122929004544> **Locked Roles Pending:** ${Number(state.lockedRoles?.size || 0)}`,
        `<:VC_reason:1478517122929004544> **Locked Channels Pending:** ${Number(state.lockedChannels?.size || 0)}`,
      ],
      "#F59E0B",
    );
  }, delayMs);
  if (typeof state.restoreRetryTimer?.unref === "function") {
    state.restoreRetryTimer.unref();
  }
}

function scheduleAntiNukePanicUnlock(guild?, state?) {
  if (!guild?.id || !state) return;
  if (state.unlockTimer) clearTimeout(state.unlockTimer);
  const now = Date.now();
  const delay = Math.max(1_000, Number(state.activeUntil || 0) - now);
  state.unlockTimer = setTimeout(async () => {
    const current = getPanicState(guild.id);
    current.unlockTimer = null;
    if (Number(current.activeUntil || 0) > Date.now()) return;
    current.panicStartedAt = 0;
    current.panicTriggerHeat = 0;
    persistAntiNukePanicSnapshotNow();
    try {
      const { invalidateSecurityLockCache } = require("./securityOrchestratorService") as typeof import("./securityOrchestratorService");
      invalidateSecurityLockCache(guild.id);
    } catch (_) {}
    const roleResult = await unlockDangerousRolesAfterPanic(guild, current);
    const channelResult = await unlockGuildChannelsAfterPanic(guild, current);
    const backupSummary = await runAutoBackupSyncAfterPanic(guild, current);
    const restored = Boolean(roleResult?.completed) && Boolean(channelResult?.completed) && Number(current.lockedRoles?.size || 0) === 0 && Number(current.lockedChannels?.size || 0) === 0;
    if (!restored) {
      schedulePanicRestoreRetry(guild, current, "panic_end");
    }
    await sendPanicModeDetailedReport(guild, current, {
      reason: "panic_duration_ended",
      backupSummary,
    });
  }, delay);
  if (typeof state.unlockTimer?.unref === "function") {
    state.unlockTimer.unref();
  }
}

export = {
  scheduleAntiNukePanicUnlock,
  schedulePanicRestoreRetry,
};
