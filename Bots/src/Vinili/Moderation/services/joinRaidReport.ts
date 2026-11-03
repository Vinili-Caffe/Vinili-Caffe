const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const {
  JOIN_RAID_CONFIG,
  HIGH_STAFF_ROLE_ID,
  HIGH_STAFF_MENTION,
} = require("./joinRaidConfig") as typeof import("./joinRaidConfig");
const {
  getGuildState,
  loadGuildState,
  withGuildLock,
  pruneState,
  scheduleStateSave,
  nowMs,
  RAID_REPORT_TIMERS,
  CLEARED_GUILDS,
} = require("./joinRaidState") as typeof import("./joinRaidState");
const { getGuildChannelCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { formatItalianMinutesPlain } = require("../../../shared/utils/italianDurationLabels") as typeof import("../../../shared/utils/italianDurationLabels");

function buildInitialFlagRows(guild?, state?, limit = 8) {
  const ids = Array.isArray(state?.raidInitialFlaggedUserIds)
    ? state.raidInitialFlaggedUserIds
    : [];
  const unique = Array.from(
    new Set(ids.map((x?) => String(x || "")).filter(Boolean)),
  );
  return unique.slice(0, Math.max(1, limit)).map((userId?: any) => {
    const member = guild?.members?.cache?.get?.(userId) || null;
    const tag =
      member?.user?.tag ||
      member?.user?.username ||
      member?.displayName ||
      `user:${userId.slice(-4)}`;
    return `\`${tag}\` | \`${userId}\``;
  });
}

async function resolveModLogChannel(guild?) {
  const channelId = IDs.channels?.modLogs || IDs.channels?.activityLogs;
  if (!guild || !channelId) return null;
  return getGuildChannelCached(guild, channelId);
}

async function sendJoinRaidLog(guild?, title?, lines?, color = "#ED4245") {
  const channel = await resolveModLogChannel(guild);
  if (!channel?.isTextBased?.()) return;
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(lines.filter(Boolean).join("\n"))
    .setTimestamp();
  await channel
    .send({
      content: HIGH_STAFF_MENTION || undefined,
      embeds: [embed],
      allowedMentions: HIGH_STAFF_MENTION
        ? { roles: [HIGH_STAFF_ROLE_ID] }
        : undefined,
    })
    .catch(() => {});
}

async function warnRaidRoles(guild?, contentLines?) {
  const mentionIds = new Set(
    [...JOIN_RAID_CONFIG.warnedRoleIds, HIGH_STAFF_ROLE_ID]
      .filter(Boolean)
      .map(String),
  );
  const roleMentions = [...mentionIds].map((id?) => `<@&${id}>`);
  const channel = await resolveModLogChannel(guild);
  if (!channel?.isTextBased?.()) return;
  const content = [roleMentions.join(" "), ...contentLines]
    .filter(Boolean)
    .join("\n");
  await channel
    .send({
      content,
      allowedMentions: { roles: [...mentionIds] },
    })
    .catch(() => {});
}

async function doFinalizeJoinRaidReportLocked(guild?, reason = "elapsed") {
  const at = nowMs();
  const state = getGuildState(guild.id);
  pruneState(state, at);
  const isStillActive = Number(state.raidUntil || 0) > at;
  if (reason !== "force" && isStillActive) return;
  const code = String(state.raidCaseCode || "").trim();
  if (!code) return;
  const caughtCount = new Set(
    (Array.isArray(state.raidCaughtUserIds) ? state.raidCaughtUserIds : [])
      .map((x?) => String(x || ""))
      .filter(Boolean),
  ).size;

  await sendJoinRaidLog(
    guild,
    "<a:VC_Alert:1482706673176150077> **Join Raid Report!**",
    [
      `<:VC_Mention:1482526855289634997> **${caughtCount} utenti** sono stati catturati dalla protezione raid.`,
      `<:VC_reason:1478517122929004544> **Codice:** \`${code}\``,
      `<:VC_Clock:1473359204189474886> **Durata:** ${formatItalianMinutesPlain(Math.round(Number(JOIN_RAID_CONFIG.raidDurationMs || 0) / 60_000))}`,
    ],
    "#57F287",
  );

  state.raidUntil = 0;
  state.raidCaseCode = "";
  state.raidStartedAt = 0;
  state.raidInitialFlaggedUserIds = [];
  state.raidCaughtUserIds = [];
  scheduleStateSave(guild.id);
  try {
    const { invalidateSecurityLockCache } = require("../../Security/services/securityOrchestratorService") as typeof import("../../Security/services/securityOrchestratorService");
    invalidateSecurityLockCache(guild.id);
  } catch (_) {}
}

async function finalizeJoinRaidAndReport(guild?, reason = "elapsed") {
  if (!guild?.id) return;
  if (CLEARED_GUILDS.has(String(guild.id))) return;
  await loadGuildState(guild.id);
  await withGuildLock(guild.id, async () => {
    await doFinalizeJoinRaidReportLocked(guild, reason);
  });
}

function scheduleJoinRaidReport(guild?) {
  if (!guild?.id) return;
  const guildId = String(guild.id);
  const state = getGuildState(guildId);
  const until = Number(state.raidUntil || 0);
  if (until <= Date.now()) return;
  const old = RAID_REPORT_TIMERS.get(guildId);
  if (old) clearTimeout(old);
  const delay = Math.max(1_000, until - Date.now() + 1_000);
  const timer = setTimeout(async () => {
    RAID_REPORT_TIMERS.delete(guildId);
    await finalizeJoinRaidAndReport(guild, "elapsed").catch(() => null);
  }, delay);
  if (typeof timer.unref === "function") timer.unref();
  RAID_REPORT_TIMERS.set(guildId, timer);
}

export = {
  buildInitialFlagRows,
  scheduleJoinRaidReport,
  doFinalizeJoinRaidReportLocked,
  finalizeJoinRaidAndReport,
  sendJoinRaidLog,
  warnRaidRoles,
};
