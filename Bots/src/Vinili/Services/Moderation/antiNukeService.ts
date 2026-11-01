
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { ANTINUKE_CONFIG_PATH, ANTINUKE_CONFIG, readJsonSafe, applyPersistentAntiNukeConfig, enforceCriticalAntiNukeGuards, setAntiNukeConfigSnapshot } = require("./antiNukeConfig") as typeof import("./antiNukeConfig");
const { isWhitelistedExecutor, isWhitelistedExecutorAsync } = require("./antiNukeWhitelist") as typeof import("./antiNukeWhitelist");
const { getPanicState, persistAntiNukePanicSnapshotNow, sendPanicModeDetailedReport, scheduleAntiNukePanicUnlock, unlockDangerousRolesAfterPanic, unlockGuildChannelsAfterPanic, schedulePanicRestoreRetry, runAutoBackupSyncAfterPanic } = require("./antiNukePanicLock") as typeof import("./antiNukePanicLock");
const { isAntiNukeScopeGuild, isAntiNukePanicActive, restoreAntiNukeQuarantineTimersOnStartup, quarantineExecutor } = require("./antiNukeQuarantine") as typeof import("./antiNukeQuarantine");
const { COMMAND_LOCK_CACHE, enableAntiNukePanic, handleKickBanAction, handleRoleCreationAction, handleRoleDeletionAction, handleChannelCreationAction, handleChannelDeletionAction } = require("./antiNukeRoleChannelActions") as typeof import("./antiNukeRoleChannelActions");
const { handleWebhookCreationAction, handleWebhookUpdateAction, handleWebhookDeletionAction, handleInviteCreationAction } = require("./antiNukeWebhookInviteActions") as typeof import("./antiNukeWebhookInviteActions");
const { handleRoleUpdate, handleMemberRoleAddition, handleChannelOverwrite, handleVanityGuard, handlePruneAction, handleThreadCreationAction, handleThreadDeletionAction } = require("./antiNukeOtherActions") as typeof import("./antiNukeOtherActions");
const { getAntiNukeStatusSnapshot } = require("./antiNukeStatus") as typeof import("./antiNukeStatus");









const COMMAND_LOCK_CACHE_TTL_MS = 2_000;

applyPersistentAntiNukeConfig(readJsonSafe(ANTINUKE_CONFIG_PATH, null));
ANTINUKE_CONFIG.vanityGuard = true;
ANTINUKE_CONFIG.autoQuarantine.strictMode = true;
enforceCriticalAntiNukeGuards();
ANTINUKE_CONFIG.autoQuarantine.monitorChannelPermissions = true;
ANTINUKE_CONFIG.autoQuarantine.strictMemberRoleAddition = true;

function rehydrateAntiNukePanicForGuild(guild?) {
  if (!guild?.id || !isAntiNukeScopeGuild(guild.id)) return;
  const state = getPanicState(guild.id);
  if (Number(state?.activeUntil || 0) <= Date.now()) return;
  if (state.unlockTimer) return;
  scheduleAntiNukePanicUnlock(guild, state);
}

async function triggerAntiNukePanicExternal(
  guild?,
  reason = "External security signal",
  addedHeat = 100,
  options: Record<string, any> = {},
) {
  if (!guild?.id) return { ok: false, reason: "missing_guild" };
  const force = Boolean(options?.force !== false);
  const panic = await enableAntiNukePanic(
    guild,
    String(reason || "External security signal"),
    Number(addedHeat || 0),
    { force },
  );
  return { ok: true, ...panic };
}

async function stopAntiNukePanic(guild?, reason = "manual stop", stoppedById = "") {
  if (!guild?.id) return { ok: false, reason: "missing_guild" };
  const state = getPanicState(guild.id);
  const wasActive = Number(state.activeUntil || 0) > Date.now();
  state.activeUntil = 0;
  state.panicStartedAt = 0;
  persistAntiNukePanicSnapshotNow();
  state.heat = 0;
  state.panicTriggerHeat = 0;
  try {
    const { invalidateSecurityLockCache } = require("./securityOrchestratorService") as typeof import("./securityOrchestratorService");
    invalidateSecurityLockCache(guild.id);
  } catch (_) {}
  COMMAND_LOCK_CACHE.delete(String(guild.id));
  state.lastAt = Date.now();
  if (state.unlockTimer) {
    clearTimeout(state.unlockTimer);
    state.unlockTimer = null;
  }
  if (state.restoreRetryTimer) {
    clearTimeout(state.restoreRetryTimer);
    state.restoreRetryTimer = null;
  }
  state.restoreRetryCount = 0;
  const roleResult = await unlockDangerousRolesAfterPanic(guild, state);
  const channelResult = await unlockGuildChannelsAfterPanic(guild, state);
  const backupSummary = await runAutoBackupSyncAfterPanic(guild, state);
  const restored = Boolean(roleResult?.completed) && Boolean(channelResult?.completed) && Number(state.lockedRoles?.size || 0) === 0 && Number(state.lockedChannels?.size || 0) === 0;
  if (!restored) {
    schedulePanicRestoreRetry(guild, state, "manual_stop");
  }
  await sendPanicModeDetailedReport(guild, state, {
    reason: `${reason || "manual_stop"}${stoppedById ? ` | by:${stoppedById}` : ""}`,
    backupSummary,
  });
  return { ok: true, wasActive };
}

async function shouldBlockModerationCommands(guild?, userId?) {
  if (!guild?.id || !isAntiNukeScopeGuild(guild.id)) return false;
  if (!ANTINUKE_CONFIG.enabled) return false;
  if (!ANTINUKE_CONFIG.panicMode.enabled) return false;
  if (!ANTINUKE_CONFIG.panicMode.lockdown.lockModerationCommands) return false;
  if (!guild?.id || !userId) return false;
  const panicActive = isAntiNukePanicActive(guild.id);
  if (!panicActive) return false;
  if (String(guild.ownerId || "") === String(userId)) return false;
  const member = guild.members.cache.get(String(userId)) || (await getGuildMemberCached(guild, String(userId), { ttlMs: 30_000 }));
  const emergencyBypassRoleIds = new Set([IDs.roles.Founder].filter(Boolean).map(String),);
  if (
    member &&
    [...emergencyBypassRoleIds].some((roleId?) =>
      member.roles?.cache?.has?.(String(roleId)),
    )
  ) {
    return false;
  }
  return !(await isWhitelistedExecutorAsync(guild, userId));
}

function invalidateCommandLockCache(guildId?) {
  if (guildId == null) {
    COMMAND_LOCK_CACHE.clear();
    return;
  }
  COMMAND_LOCK_CACHE.delete(String(guildId));
}

async function shouldBlockAllCommands(guild?, options: Record<string, any> = {}) {
  if (!guild?.id) return false;
  if (!isAntiNukeScopeGuild(guild.id)) return false;
  const cacheKey = String(guild.id || "");
  for (const [k, payload] of COMMAND_LOCK_CACHE.entries()) {
    if (Date.now() - Number(payload?.ts || 0) > COMMAND_LOCK_CACHE_TTL_MS * 4) {
      COMMAND_LOCK_CACHE.delete(k);
    }
  }
  const cached = COMMAND_LOCK_CACHE.get(cacheKey);
  const now = Date.now();
  if (cached && now - Number(cached.ts || 0) < COMMAND_LOCK_CACHE_TTL_MS) {
    return Boolean(cached.value);
  }
  let blocked = false;
  if (
    ANTINUKE_CONFIG.enabled &&
    ANTINUKE_CONFIG.panicMode.enabled &&
    ANTINUKE_CONFIG.panicMode.lockdown.lockAllCommands
  ) {
    if (isAntiNukePanicActive(guild.id)) {
      blocked = true;
    }
  }
  if (!blocked) {
    try {
      let raid = options.joinRaidSnapshot;
      if (!raid) {
        const { getJoinRaidStatusSnapshot } = require("./joinRaidService") as typeof import("./joinRaidService");
        raid = await getJoinRaidStatusSnapshot(guild.id);
      }
      const raidLocksCommands = Boolean(raid?.config?.lockCommands);
      if (raid?.raidActive && raidLocksCommands) blocked = true;
    } catch (err) {
      global.logger?.warn?.("[antiNuke] ", err?.message || err);
    }
  }
  if (!blocked) {
    try {
      const { getAutoModPanicSnapshot } = require("./automodService") as typeof import("./automodService");
      const am = getAutoModPanicSnapshot(guild.id);
      if (am?.active && am?.lockCommands) blocked = true;
    } catch (err) {
      global.logger?.warn?.("[antiNuke] automod panic cmd lock:", err?.message || err);
    }
  }
  COMMAND_LOCK_CACHE.set(cacheKey, { value: blocked, ts: now });
  return blocked;
}

export = { handleRoleUpdate, handleMemberRoleAddition, handleChannelOverwrite, handleVanityGuard, handleKickBanAction, handleRoleCreationAction, handleRoleDeletionAction, handleChannelCreationAction, handleChannelDeletionAction, handleWebhookCreationAction, handleWebhookUpdateAction, handleWebhookDeletionAction, handleInviteCreationAction, handleThreadCreationAction, handleThreadDeletionAction, handlePruneAction, quarantineExecutor, isAntiNukePanicActive, shouldBlockModerationCommands, shouldBlockAllCommands, invalidateCommandLockCache, isWhitelistedExecutor, isWhitelistedExecutorAsync, getAntiNukeStatusSnapshot, stopAntiNukePanic, triggerAntiNukePanicExternal, enableAntiNukePanic, setAntiNukeConfigSnapshot, rehydrateAntiNukePanicForGuild, restoreAntiNukeQuarantineTimersOnStartup };
