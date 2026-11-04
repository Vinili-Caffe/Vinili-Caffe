const { PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const { getGuildChannelCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { ANTINUKE_CONFIG } = require("./antiNukeConfig") as typeof import("./antiNukeConfig");
const { isWhitelistedExecutorAsync, isCategoryWhitelisted } = require("./antiNukeWhitelist") as typeof import("./antiNukeWhitelist");
const { isUnknownExecutorId, formatExecutorLine, sendAntiNukeLog } = require("./antiNukeLog") as typeof import("./antiNukeLog");
const { getPanicState } = require("./antiNukePanicLock") as typeof import("./antiNukePanicLock");
const { isAntiNukeScopeGuild, isAntiNukePanicActive, quarantineOutcomeLabel, quarantineExecutor } = require("./antiNukeQuarantine") as typeof import("./antiNukeQuarantine");
const { enableAntiNukePanic } = require("./antiNukePanicEnable") as typeof import("./antiNukePanicEnable");
const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
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

const CHANNEL_CREATION_TRACKER = new Map();

function getChannelCreationState(guildId?, executorId?) {
  cleanupTrackerMap(CHANNEL_CREATION_TRACKER);
  const key = `${String(guildId || "")}:${String(executorId || "")}`;
  const existing = CHANNEL_CREATION_TRACKER.get(key);
  if (existing) return { key, state: existing };
  const initial = { minuteHits: [], hourHits: [], heat: 0, lastPunishAt: 0 };
  CHANNEL_CREATION_TRACKER.set(key, initial);
  return { key, state: initial };
}

function trimChannelCreationState(state?, at = Date.now()) {
  const minCutoff = at - 60_000;
  const hourCutoff = at - 60 * 60_000;
  state.minuteHits = state.minuteHits.filter((ts?) => ts >= minCutoff);
  state.hourHits = state.hourHits.filter((ts?) => ts >= hourCutoff);
  state.heat =
    state.hourHits.length *
    percentToHeat(ANTINUKE_CONFIG.channelCreationFilter.heatPerAction || 16);
}

async function handleChannelCreationAction({ guild, executorId, channelId = "", channel = null }) {
  if (!guild?.id || !isAntiNukeScopeGuild(guild.id)) return;
  if (!ANTINUKE_CONFIG.enabled || !ANTINUKE_CONFIG.channelCreationFilter.enabled) return;
  if (!guild) return;
  const actorId = normalizeExecutorId(executorId);
  if (isUnknownExecutorId(actorId)) {  }
  if (await isWhitelistedExecutorAsync(guild, actorId)) return;
  if (isCategoryWhitelisted(channel)) return;
  const now = Date.now();
  const trackerId = getTrackerExecutorId(actorId, channelId, "channel:create", now);
  if (
    shouldSkipDuplicatedActionEvent({
      guildId: guild.id,
      executorId: actorId,
      actionKey: "channel:create",
      targetId: channelId,
      now,
    })
  ) {
    return;
  }
  await applyBurstPanicGuard(
    guild,
    actorId,
    `${E.VC_Alert} channel create`,
    ANTINUKE_CONFIG.channelCreationFilter.heatPerAction || 16,
  );
  await enableAntiNukePanic(
    guild,
    `${E.VC_Alert} Channel creation filter`,
    ANTINUKE_CONFIG.channelCreationFilter.heatPerAction,
  );
  const panicActive = isAntiNukePanicActive(guild.id);
  if (panicActive && channelId) {
    getPanicState(guild.id).createdChannelIds.add(String(channelId));
  }
  const instantCfg = ANTINUKE_CONFIG.panicMode.instantRollbackWhileActive;
  if (panicActive && instantCfg?.enabled && instantCfg?.deleteCreatedChannels && channelId) {
    try {
      const { isProtectedStreamerStageChannelId } = require("../../Community/services/streamerStageGuardService") as typeof import("../../Community/services/streamerStageGuardService");
      if (isProtectedStreamerStageChannelId(channelId, guild.client)) {
        global.logger?.warn?.("[AntiNuke] skip instant delete protected streamer stage:", channelId);
        return;
      }
    } catch {
      /* ignore */
    }
    const me = guild.members?.me;
    const targetChannel = channel || (await getGuildChannelCached(guild, String(channelId), { ttlMs: 30_000 }));
    const canDelete = targetChannel?.deletable && me?.permissions?.has?.(PermissionsBitField.Flags.ManageChannels);
    if (canDelete) {
      const removed = await targetChannel.delete(`${E.VC_Lock} AntiNuke panic: delete channel created during active panic`).then(() => true).catch(() => false);
      const canQuarantine = instantCfg?.quarantineExecutor && !isPanicExecutorCooldownActive(guild.id, actorId, now);
      const quarantine = canQuarantine ? await quarantineExecutor(guild, actorId, `${E.VC_Lock} AntiNuke panic: channel creation blocked during active panic`,) : { applied: false, method: "cooldown" };
      if (canQuarantine && quarantine.applied) touchPanicExecutorCooldown(guild.id, actorId, now);
      if (removed) {
        await sendAntiNukeLog(
          guild,
          `${E.VC_Alert} AntiNuke: Panic Instant Rollback`,
          [
            formatExecutorLine(actorId),
            `${E.VC_Alert} **Action:** Channel creation blocked during panic`,
            `${E.VC_Alert} **Channel:** \`${channelId}\``,
            `${E.VC_Alert} **Result:** Channel deleted immediately`,
            `${E.VC_Alert} **Quarantena executor:** ${quarantineOutcomeLabel(quarantine)}`,
          ],
        );
      }
      return;
    }
  }

  const { state } = getChannelCreationState(guild.id, trackerId);
  trimChannelCreationState(state, now);
  state.minuteHits.push(now);
  state.hourHits.push(now);
  state.heat =
    state.hourHits.length *
    percentToHeat(ANTINUKE_CONFIG.channelCreationFilter.heatPerAction || 16);

  const minuteCount = state.minuteHits.length;
  const hourCount = state.hourHits.length;
  const exceededMinute = minuteCount >= Number(ANTINUKE_CONFIG.channelCreationFilter.minuteLimit || 4);
  const exceededHour = hourCount >= Number(ANTINUKE_CONFIG.channelCreationFilter.hourLimit || 12);
  const exceededHeat = state.heat >= 100;
  if (!exceededMinute && !exceededHour && !exceededHeat) return;

  if (now - Number(state.lastPunishAt || 0) < 15_000) return;
  state.lastPunishAt = now;

  const quarantine = await quarantineExecutor(guild, actorId, `${E.VC_Lock} AntiNuke: channel creation spam detected`,);
  await sendAntiNukeLog(
    guild,
    `${E.VC_Alert} AntiNuke: Channel Creations Filter`,
    [
      formatExecutorLine(actorId),
      channelId
        ? `${E.VC_Alert} **Last Channel:** <#${channelId}> \`${channelId}\``
        : null,
      `${E.VC_Alert} **Minute Count:** ${minuteCount}/${ANTINUKE_CONFIG.channelCreationFilter.minuteLimit}`,
      `${E.VC_Alert} **Hour Count:** ${hourCount}/${ANTINUKE_CONFIG.channelCreationFilter.hourLimit}`,
      `${E.VC_Alert} **Heat:** ${state.heat}/100`,
      `${E.VC_Alert} **Result:** ${quarantineOutcomeLabel(quarantine)}`,
    ].filter(Boolean),
  );
}

export = {
  CHANNEL_CREATION_TRACKER,
  handleChannelCreationAction,
};
