const { ANTINUKE_CONFIG } = require("./antiNukeConfig") as typeof import("./antiNukeConfig");
const { isWhitelistedExecutorAsync } = require("./antiNukeWhitelist") as typeof import("./antiNukeWhitelist");
const { isUnknownExecutorId, formatExecutorLine, sendAntiNukeLog } = require("./antiNukeLog") as typeof import("./antiNukeLog");
const { isAntiNukeScopeGuild, quarantineOutcomeLabel, quarantineExecutor } = require("./antiNukeQuarantine") as typeof import("./antiNukeQuarantine");
const { enableAntiNukePanic } = require("./antiNukePanicEnable") as typeof import("./antiNukePanicEnable");
const {
  percentToHeat,
  normalizeExecutorId,
  cleanupTrackerMap,
  shouldSkipDuplicatedActionEvent,
  getTrackerExecutorId,
  applyBurstPanicGuard,
} = require("./antiNukeRoleChannelGuards") as typeof import("./antiNukeRoleChannelGuards");

const KICK_BAN_TRACKER = new Map();

function getKickBanState(guildId?, executorId?) {
  cleanupTrackerMap(KICK_BAN_TRACKER);
  const key = `${String(guildId || "")}:${String(executorId || "")}`;
  const existing = KICK_BAN_TRACKER.get(key);
  if (existing) return { key, state: existing };
  const initial = { minuteHits: [], hourHits: [], heat: 0, lastPunishAt: 0 };
  KICK_BAN_TRACKER.set(key, initial);
  return { key, state: initial };
}

function trimKickBanState(state?, at = Date.now()) {
  const minCutoff = at - 60_000;
  const hourCutoff = at - 60 * 60_000;
  state.minuteHits = state.minuteHits.filter((ts?) => ts >= minCutoff);
  state.hourHits = state.hourHits.filter((ts?) => ts >= hourCutoff);
  state.heat = state.hourHits.length * percentToHeat(ANTINUKE_CONFIG.kickBanFilter.heatPerAction || 20);
}

async function handleKickBanAction({ guild, executorId, action = "unknown", targetId = "" }) {
  if (!guild?.id || !isAntiNukeScopeGuild(guild.id)) return;
  if (!ANTINUKE_CONFIG.enabled || !ANTINUKE_CONFIG.kickBanFilter.enabled) return;
  if (!guild) return;
  const actorId = normalizeExecutorId(executorId);
  if (isUnknownExecutorId(actorId)) { }
  if (await isWhitelistedExecutorAsync(guild, actorId)) return;
  const now = Date.now();
  const trackerId = getTrackerExecutorId(actorId, targetId, `kickban:${action}`, now);
  if (
    shouldSkipDuplicatedActionEvent({
      guildId: guild.id,
      executorId: actorId,
      actionKey: `kickban:${action}`,
      targetId,
      now,
    })
  ) {
    return;
  }
  await applyBurstPanicGuard(
    guild,
    actorId,
    `kick/ban (${action})`,
    ANTINUKE_CONFIG.kickBanFilter.heatPerAction ?? 20,
  );
  await enableAntiNukePanic(
    guild,
    `Kick/Ban filter: ${action}`,
    ANTINUKE_CONFIG.kickBanFilter.heatPerAction ?? 20,
  );

  const { state } = getKickBanState(guild.id, trackerId);
  trimKickBanState(state, now);
  state.minuteHits.push(now);
  state.hourHits.push(now);
  state.heat = state.hourHits.length * percentToHeat(ANTINUKE_CONFIG.kickBanFilter.heatPerAction || 20);

  const minuteCount = state.minuteHits.length;
  const hourCount = state.hourHits.length;
  const exceededMinute = minuteCount >= Number(ANTINUKE_CONFIG.kickBanFilter.minuteLimit || 5);
  const exceededHour = hourCount >= Number(ANTINUKE_CONFIG.kickBanFilter.hourLimit || 15);
  const exceededHeat = state.heat >= 100;
  if (!exceededMinute && !exceededHour && !exceededHeat) return;

  if (now - Number(state.lastPunishAt || 0) < 15_000) return;
  state.lastPunishAt = now;

  const quarantine = await quarantineExecutor(guild, actorId, "<:VC_Lock:1482526739044368476> AntiNuke: kick/ban abuse detected",);
  await sendAntiNukeLog(
    guild,
    "<a:VC_Alert:1482706673176150077> AntiNuke: Kick/Ban Filter",
    [
      formatExecutorLine(actorId),
      `<a:VC_Alert:1482706673176150077> **Action:** ${action}`,
      targetId
        ? `<a:VC_Alert:1482706673176150077> **Target:** <@${targetId}> \`${targetId}\``
        : null,
      `<a:VC_Alert:1482706673176150077> **Minute Count:** ${minuteCount}/${ANTINUKE_CONFIG.kickBanFilter.minuteLimit}`,
      `<a:VC_Alert:1482706673176150077> **Hour Count:** ${hourCount}/${ANTINUKE_CONFIG.kickBanFilter.hourLimit}`,
      `<a:VC_Alert:1482706673176150077> **Heat:** ${state.heat}/100`,
      `<a:VC_Alert:1482706673176150077> **Result:** ${quarantineOutcomeLabel(quarantine)}`,
    ].filter(Boolean),
  );
}

export = {
  KICK_BAN_TRACKER,
  handleKickBanAction,
};
