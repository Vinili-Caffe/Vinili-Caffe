const { PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const { getGuildRoleCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { ANTINUKE_CONFIG } = require("./antiNukeConfig") as typeof import("./antiNukeConfig");
const { isWhitelistedExecutorAsync } = require("./antiNukeWhitelist") as typeof import("./antiNukeWhitelist");
const { isUnknownExecutorId, formatExecutorLine, sendAntiNukeLog } = require("./antiNukeLog") as typeof import("./antiNukeLog");
const { getPanicState } = require("./antiNukePanicLock") as typeof import("./antiNukePanicLock");
const { isAntiNukeScopeGuild, isAntiNukePanicActive, quarantineOutcomeLabel, quarantineExecutor } = require("./antiNukeQuarantine") as typeof import("./antiNukeQuarantine");
const { enableAntiNukePanic } = require("./antiNukePanicEnable") as typeof import("./antiNukePanicEnable");
const {
  percentToHeat,
  normalizeExecutorId,
  cleanupTrackerMap,
  isPanicExecutorCooldownActive,
  touchPanicExecutorCooldown,
  shouldSkipDuplicatedActionEvent,
  getTrackerExecutorId,
  applyBurstPanicGuard,
} = require("./antiNukeRoleChannelGuards") as typeof import("./antiNukeRoleChannelGuards");

const ROLE_CREATION_TRACKER = new Map();

function getRoleCreationState(guildId?, executorId?) {
  cleanupTrackerMap(ROLE_CREATION_TRACKER);
  const key = `${String(guildId || "")}:${String(executorId || "")}`;
  const existing = ROLE_CREATION_TRACKER.get(key);
  if (existing) return { key, state: existing };
  const initial = { minuteHits: [], hourHits: [], heat: 0, lastPunishAt: 0 };
  ROLE_CREATION_TRACKER.set(key, initial);
  return { key, state: initial };
}

function trimRoleCreationState(state?, at = Date.now()) {
  const minCutoff = at - 60_000;
  const hourCutoff = at - 60 * 60_000;
  state.minuteHits = state.minuteHits.filter((ts?) => ts >= minCutoff);
  state.hourHits = state.hourHits.filter((ts?) => ts >= hourCutoff);
  state.heat = state.hourHits.length * percentToHeat(ANTINUKE_CONFIG.roleCreationFilter.heatPerAction || 10);
}

async function handleRoleCreationAction({ guild, executorId, roleId = "" }) {
  if (!guild?.id || !isAntiNukeScopeGuild(guild.id)) return;
  if (!ANTINUKE_CONFIG.enabled || !ANTINUKE_CONFIG.roleCreationFilter.enabled) return;
  if (!guild) return;
  const actorId = normalizeExecutorId(executorId);
  if (isUnknownExecutorId(actorId)) { }
  if (await isWhitelistedExecutorAsync(guild, actorId)) return;
  const now = Date.now();
  const trackerId = getTrackerExecutorId(actorId, roleId, "role:create", now);
  if (
    shouldSkipDuplicatedActionEvent({
      guildId: guild.id,
      executorId: actorId,
      actionKey: "role:create",
      targetId: roleId,
      now,
    })
  ) {
    return;
  }
  await applyBurstPanicGuard(
    guild,
    actorId,
    "role create",
    ANTINUKE_CONFIG.roleCreationFilter.heatPerAction || 10,
  );
  await enableAntiNukePanic(
    guild,
    "<a:VC_Alert:1482706673176150077> Role creation filter",
    ANTINUKE_CONFIG.roleCreationFilter.heatPerAction,
  );
  const panicActive = isAntiNukePanicActive(guild.id);
  if (panicActive && roleId) {
    getPanicState(guild.id).createdRoleIds.add(String(roleId));
  }
  const instantCfg = ANTINUKE_CONFIG.panicMode.instantRollbackWhileActive;
  if (panicActive && instantCfg?.enabled && instantCfg?.deleteCreatedRoles && roleId) {
    const me = guild.members?.me;
    const role = await getGuildRoleCached(guild, String(roleId), { ttlMs: 30_000 });
    if (
      role &&
      !role.managed &&
      me?.permissions?.has?.(PermissionsBitField.Flags.ManageRoles) &&
      role.position < me.roles.highest.position
    ) {
      const removed = await role.delete("<:VC_Lock:1482526739044368476> AntiNuke panic: delete role created during active panic").then(() => true).catch(() => false);
      const canQuarantine = instantCfg?.quarantineExecutor && !isPanicExecutorCooldownActive(guild.id, actorId, now);
      const quarantine = canQuarantine ? await quarantineExecutor(guild, actorId, "<:VC_Lock:1482526739044368476> AntiNuke panic: role creation blocked during active panic",) : { applied: false, method: "cooldown" };
      if (canQuarantine && quarantine.applied) touchPanicExecutorCooldown(guild.id, actorId, now);
      if (removed) {
        await sendAntiNukeLog(
          guild,
          "<a:VC_Alert:1482706673176150077> AntiNuke: Panic Instant Rollback",
          [
            formatExecutorLine(actorId),
            `<a:VC_Alert:1482706673176150077> **Action:** Role creation blocked during panic`,
            `<a:VC_Alert:1482706673176150077> **Role:** \`${roleId}\``,
            `<a:VC_Alert:1482706673176150077> **Result:** Role deleted immediately`,
            `<a:VC_Alert:1482706673176150077> **Quarantena executor:** ${quarantineOutcomeLabel(quarantine)}`,
          ],
        );
      }
      return;
    }
  }

  const { state } = getRoleCreationState(guild.id, trackerId);
  trimRoleCreationState(state, now);
  state.minuteHits.push(now);
  state.hourHits.push(now);
  state.heat =
    state.hourHits.length *
    percentToHeat(ANTINUKE_CONFIG.roleCreationFilter.heatPerAction || 10);

  const minuteCount = state.minuteHits.length;
  const hourCount = state.hourHits.length;
  const exceededMinute = minuteCount >= Number(ANTINUKE_CONFIG.roleCreationFilter.minuteLimit || 5);
  const exceededHour = hourCount >= Number(ANTINUKE_CONFIG.roleCreationFilter.hourLimit || 15);
  const exceededHeat = state.heat >= 100;
  if (!exceededMinute && !exceededHour && !exceededHeat) return;

  if (now - Number(state.lastPunishAt || 0) < 15_000) return;
  state.lastPunishAt = now;

  const quarantine = await quarantineExecutor(guild, actorId, "<:VC_Lock:1482526739044368476> AntiNuke: role creation spam detected",);
  await sendAntiNukeLog(
    guild,
    "<a:VC_Alert:1482706673176150077> AntiNuke: Role Creations Filter",
    [
      formatExecutorLine(actorId),
      roleId
        ? `<a:VC_Alert:1482706673176150077> **Last Role:** <@&${roleId}> \`${roleId}\``
        : null,
      `<:VC_reason:1478517122929004544> **Minute Count:** ${minuteCount}/${ANTINUKE_CONFIG.roleCreationFilter.minuteLimit}`,
      `<:VC_reason:1478517122929004544> **Hour Count:** ${hourCount}/${ANTINUKE_CONFIG.roleCreationFilter.hourLimit}`,
      `<:VC_reason:1478517122929004544> **Heat:** ${state.heat}/100`,
      `<:VC_reason:1478517122929004544> **Result:** ${quarantineOutcomeLabel(quarantine)}`,
    ].filter(Boolean),
  );
}

export = {
  ROLE_CREATION_TRACKER,
  handleRoleCreationAction,
};
