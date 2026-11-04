const { ANTINUKE_CONFIG } = require("./antiNukeConfig") as typeof import("./antiNukeConfig");
const { isWhitelistedExecutorAsync, isCategoryWhitelisted } = require("./antiNukeWhitelist") as typeof import("./antiNukeWhitelist");
const { isUnknownExecutorId, formatExecutorLine, sendAntiNukeLog } = require("./antiNukeLog") as typeof import("./antiNukeLog");
const { isAntiNukeScopeGuild, isAntiNukePanicActive, quarantineOutcomeLabel, quarantineExecutor } = require("./antiNukeQuarantine") as typeof import("./antiNukeQuarantine");
const { buildChannelBackupSnapshot, queueDeletedChannelSnapshot } = require("./antiNukeRestore") as typeof import("./antiNukeRestore");
const { enableAntiNukePanic } = require("./antiNukePanicEnable") as typeof import("./antiNukePanicEnable");
const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const {
  percentToHeat,
  normalizeExecutorId,
  cleanupTrackerMap,
  shouldSkipDuplicatedActionEvent,
  getTrackerExecutorId,
  applyBurstPanicGuard,
} = require("./antiNukeRoleChannelGuards") as typeof import("./antiNukeRoleChannelGuards");

const CHANNEL_DELETION_TRACKER = new Map();

function getChannelDeletionState(guildId?, executorId?) {
  cleanupTrackerMap(CHANNEL_DELETION_TRACKER);
  const key = `${String(guildId || "")}:${String(executorId || "")}`;
  const existing = CHANNEL_DELETION_TRACKER.get(key);
  if (existing) return { key, state: existing };
  const initial = { minuteHits: [], hourHits: [], heat: 0, lastPunishAt: 0 };
  CHANNEL_DELETION_TRACKER.set(key, initial);
  return { key, state: initial };
}

function trimChannelDeletionState(state?, at = Date.now()) {
  const minCutoff = at - 60_000;
  const hourCutoff = at - 60 * 60_000;
  state.minuteHits = state.minuteHits.filter((ts?) => ts >= minCutoff);
  state.hourHits = state.hourHits.filter((ts?) => ts >= hourCutoff);
  state.heat =
    state.hourHits.length *
    percentToHeat(ANTINUKE_CONFIG.channelDeletionFilter.heatPerAction || 25);
}

async function handleChannelDeletionAction({ guild, executorId, channelName = "", channelId = "", channel = null }) {
  if (!guild?.id || !isAntiNukeScopeGuild(guild.id)) return;
  if (!ANTINUKE_CONFIG.enabled || !ANTINUKE_CONFIG.channelDeletionFilter.enabled) return;
  if (!guild) return;
  const actorId = normalizeExecutorId(executorId);
  if (isUnknownExecutorId(actorId)) { }
  if (await isWhitelistedExecutorAsync(guild, actorId)) return;
  if (isCategoryWhitelisted(channel)) return;
  const now = Date.now();
  const trackerId = getTrackerExecutorId(actorId, channelId, "channel:delete", now);
  if (
    shouldSkipDuplicatedActionEvent({
      guildId: guild.id,
      executorId: actorId,
      actionKey: "channel:delete",
      targetId: channelId,
      now,
    })
  ) {
    return;
  }
  await applyBurstPanicGuard(
    guild,
    actorId,
    `${E.VC_Alert} channel delete`,
    ANTINUKE_CONFIG.channelDeletionFilter.heatPerAction || 25,
  );
  await enableAntiNukePanic(
    guild,
    `${E.VC_Alert} Channel deletion filter`,
    ANTINUKE_CONFIG.channelDeletionFilter.heatPerAction,
  );
  if (
    isAntiNukePanicActive(guild.id) &&
    ANTINUKE_CONFIG.panicMode.autoBackupSync?.enabled &&
    ANTINUKE_CONFIG.panicMode.autoBackupSync?.restoreDeletedChannels &&
    channel?.id
  ) {
    const backup = buildChannelBackupSnapshot(channel);
    if (backup?.id) {
      queueDeletedChannelSnapshot(guild.id, backup);
    }
  }

  const { state } = getChannelDeletionState(guild.id, trackerId);
  trimChannelDeletionState(state, now);
  state.minuteHits.push(now);
  state.hourHits.push(now);
  state.heat =
    state.hourHits.length *
    percentToHeat(ANTINUKE_CONFIG.channelDeletionFilter.heatPerAction || 25);

  const minuteCount = state.minuteHits.length;
  const hourCount = state.hourHits.length;
  const exceededMinute = minuteCount >= Number(ANTINUKE_CONFIG.channelDeletionFilter.minuteLimit || 3);
  const exceededHour = hourCount >= Number(ANTINUKE_CONFIG.channelDeletionFilter.hourLimit || 8);
  const exceededHeat = state.heat >= 100;
  if (!exceededMinute && !exceededHour && !exceededHeat) return;

  if (now - Number(state.lastPunishAt || 0) < 15_000) return;
  state.lastPunishAt = now;

  const quarantine = await quarantineExecutor(guild, actorId, `${E.VC_Lock} AntiNuke: channel deletion spam detected`,);
  await sendAntiNukeLog(
    guild,
    `${E.VC_Alert} AntiNuke: Channel Deletions Filter`,
    [
      formatExecutorLine(actorId),
      channelId
        ? `${E.VC_Alert} **Last Deleted Channel:** ${channelName || "sconosciuto"} \`${channelId}\``
        : null,
      `${E.VC_Alert} **Minute Count:** ${minuteCount}/${ANTINUKE_CONFIG.channelDeletionFilter.minuteLimit}`,
      `${E.VC_Alert} **Hour Count:** ${hourCount}/${ANTINUKE_CONFIG.channelDeletionFilter.hourLimit}`,
      `${E.VC_Alert} **Heat:** ${state.heat}/100`,
      `${E.VC_Alert} **Result:** ${quarantineOutcomeLabel(quarantine)}`,
    ].filter(Boolean),
  );
}

export = {
  CHANNEL_DELETION_TRACKER,
  handleChannelDeletionAction,
};
