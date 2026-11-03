const { ANTINUKE_CONFIG } = require("./antiNukeConfig") as typeof import("./antiNukeConfig");
const { isWhitelistedExecutorAsync } = require("./antiNukeWhitelist") as typeof import("./antiNukeWhitelist");
const { isUnknownExecutorId, formatExecutorLine, sendAntiNukeLog } = require("./antiNukeLog") as typeof import("./antiNukeLog");
const { isAntiNukeScopeGuild, isAntiNukePanicActive, quarantineOutcomeLabel, quarantineExecutor } = require("./antiNukeQuarantine") as typeof import("./antiNukeQuarantine");
const { queueDeletedRoleSnapshot } = require("./antiNukeRestore") as typeof import("./antiNukeRestore");
const { enableAntiNukePanic } = require("./antiNukePanicEnable") as typeof import("./antiNukePanicEnable");
const {
  percentToHeat,
  normalizeExecutorId,
  cleanupTrackerMap,
  shouldSkipDuplicatedActionEvent,
  getTrackerExecutorId,
  applyBurstPanicGuard,
} = require("./antiNukeRoleChannelGuards") as typeof import("./antiNukeRoleChannelGuards");

const ROLE_DELETION_TRACKER = new Map();

function getRoleDeletionState(guildId?, executorId?) {
  cleanupTrackerMap(ROLE_DELETION_TRACKER);
  const key = `${String(guildId || "")}:${String(executorId || "")}`;
  const existing = ROLE_DELETION_TRACKER.get(key);
  if (existing) return { key, state: existing };
  const initial = { minuteHits: [], hourHits: [], heat: 0, lastPunishAt: 0 };
  ROLE_DELETION_TRACKER.set(key, initial);
  return { key, state: initial };
}

function trimRoleDeletionState(state?, at = Date.now()) {
  const minCutoff = at - 60_000;
  const hourCutoff = at - 60 * 60_000;
  state.minuteHits = state.minuteHits.filter((ts?) => ts >= minCutoff);
  state.hourHits = state.hourHits.filter((ts?) => ts >= hourCutoff);
  state.heat =
    state.hourHits.length *
    percentToHeat(ANTINUKE_CONFIG.roleDeletionFilter.heatPerAction || 25);
}

async function handleRoleDeletionAction({ guild, executorId, roleName = "", roleId = "", roleSnapshot = null }) {
  if (!guild?.id || !isAntiNukeScopeGuild(guild.id)) return;
  if (!ANTINUKE_CONFIG.enabled || !ANTINUKE_CONFIG.roleDeletionFilter.enabled) return;
  if (!guild) return;
  const actorId = normalizeExecutorId(executorId);
  if (isUnknownExecutorId(actorId)) { }
  if (await isWhitelistedExecutorAsync(guild, actorId)) return;
  const now = Date.now();
  const trackerId = getTrackerExecutorId(actorId, roleId, "role:delete", now);
  if (
    shouldSkipDuplicatedActionEvent({
      guildId: guild.id,
      executorId: actorId,
      actionKey: "role:delete",
      targetId: roleId,
      now,
    })
  ) {
    return;
  }
  await applyBurstPanicGuard(
    guild,
    actorId,
    "<a:VC_Alert:1482706673176150077> role delete",
    ANTINUKE_CONFIG.roleDeletionFilter.heatPerAction || 25,
  );
  await enableAntiNukePanic(
    guild,
    "<a:VC_Alert:1482706673176150077> Role deletion filter",
    ANTINUKE_CONFIG.roleDeletionFilter.heatPerAction,
  );
  if (
    isAntiNukePanicActive(guild.id) &&
    ANTINUKE_CONFIG.panicMode.autoBackupSync?.enabled &&
    ANTINUKE_CONFIG.panicMode.autoBackupSync?.restoreDeletedRoles &&
    roleSnapshot?.id
  ) {
    queueDeletedRoleSnapshot(guild.id, roleSnapshot);
  }

  const { state } = getRoleDeletionState(guild.id, trackerId);
  trimRoleDeletionState(state, now);
  state.minuteHits.push(now);
  state.hourHits.push(now);
  state.heat =
    state.hourHits.length *
    percentToHeat(ANTINUKE_CONFIG.roleDeletionFilter.heatPerAction || 25);

  const minuteCount = state.minuteHits.length;
  const hourCount = state.hourHits.length;
  const exceededMinute = minuteCount >= Number(ANTINUKE_CONFIG.roleDeletionFilter.minuteLimit || 3);
  const exceededHour = hourCount >= Number(ANTINUKE_CONFIG.roleDeletionFilter.hourLimit || 10);
  const exceededHeat = state.heat >= 100;
  if (!exceededMinute && !exceededHour && !exceededHeat) return;

  if (now - Number(state.lastPunishAt || 0) < 15_000) return;
  state.lastPunishAt = now;

  const quarantine = await quarantineExecutor(guild, actorId, "<:VC_Lock:1482526739044368476> AntiNuke: role deletion spam detected",);
  await sendAntiNukeLog(
    guild,
    "<a:VC_Alert:1482706673176150077> AntiNuke: Role Deletions Filter",
    [
      formatExecutorLine(actorId),
      roleId
        ? `<a:VC_Alert:1482706673176150077> **Last Deleted Role:** ${roleName || "sconosciuto"} \`${roleId}\``
        : null,
      `<a:VC_Alert:1482706673176150077> **Minute Count:** ${minuteCount}/${ANTINUKE_CONFIG.roleDeletionFilter.minuteLimit}`,
      `<a:VC_Alert:1482706673176150077> **Hour Count:** ${hourCount}/${ANTINUKE_CONFIG.roleDeletionFilter.hourLimit}`,
      `<a:VC_Alert:1482706673176150077> **Heat:** ${state.heat}/100`,
      `<a:VC_Alert:1482706673176150077> **Result:** ${quarantineOutcomeLabel(quarantine)}`,
    ].filter(Boolean),
  );
}

export = {
  ROLE_DELETION_TRACKER,
  handleRoleDeletionAction,
};
