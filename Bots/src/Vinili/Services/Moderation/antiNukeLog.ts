/** Antinuke: messaggi di log per lo staff. */
const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { getGuildChannelCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { UNKNOWN_EXECUTOR_ID } = require("./antiNukeWhitelist") as typeof import("./antiNukeWhitelist");

const HIGH_STAFF_MENTION = IDs.roles?.HighStaff ? `<@&${IDs.roles.HighStaff}>` : null;
const ANTINUKE_LOG_DEDUPE = new Map();
const ANTINUKE_LOG_DEDUPE_TTL_MS = 12_000;

function isUnknownExecutorId(executorId?) {
  return String(executorId || "").trim() === UNKNOWN_EXECUTOR_ID;
}

function formatExecutorLine(executorId?) {
  const actorId = String(executorId || "").trim();
  if (!actorId || actorId === UNKNOWN_EXECUTOR_ID) {
    return `<:VC_Mention:1482526855289634997> **Executor:** Sconosciuto`;
  }
  return `<:VC_Mention:1482526855289634997> **Executor:** <@${actorId}> \`${actorId}\``;
}

function formatAuditStatusLine(executorId?) {
  if (isUnknownExecutorId(executorId)) {
    return `<:VC_reason:1478517122929004544> **Audit Status:** Missing audit entry from Discord`;
  }
  return `<:VC_reason:1478517122929004544> **Audit Status:** Audit entry resolved`;
}

async function logAuditMissingSkip(guild?, title?, lines = []) {
  await sendAntiNukeLog(
    guild,
    title,
    [
      formatExecutorLine(UNKNOWN_EXECUTOR_ID),
      formatAuditStatusLine(UNKNOWN_EXECUTOR_ID),
      ...lines,
      `<:VC_reason:1478517122929004544> **Technical Reason:** Audit log entry not available in time, automatic enforcement skipped`,
      `<:VC_reason:1478517122929004544> **Result:** No enforcement performed`,
    ].filter(Boolean),
    "#FEE75C",
  );
}

async function resolveModLogChannel(guild?) {
  const channelId = IDs.channels.modLogs || IDs.channels.activityLogs;
  if (!guild || !channelId) return null;
  return getGuildChannelCached(guild, channelId, { ttlMs: 30_000 });
}

function extractLineValue(lines?, label?) {
  const key = `**${label}:**`;
  const raw = (Array.isArray(lines) ? lines : []).find((line?) => String(line || "").includes(key),);
  if (!raw) return "";
  return String(raw)
    .replace(/<:[^>]+>\s*/g, "")
    .replace(key, "")
    .trim();
}

function antiNukeHeadline(title?, lines?) {
  const executor = extractLineValue(lines, "<:VC_Mention:1482526855289634997> Executor");
  const action = extractLineValue(lines, "<:VC_Mention:1482526855289634997> Action");
  if (/panic mode enabled/i.test(String(title || ""))) {
    return "<:success:1461731530333229226> AntiNuke panic mode has been enabled!";
  }
  if (/panic mode ended/i.test(String(title || ""))) {
    return "<:cancel:1461730653677551691> AntiNuke panic mode has ended.";
  }
  if (executor && /quarantined/i.test((lines || []).join(" "))) {
    return `<:VC_Lock:1482526739044368476> ${executor.split(" ")[0]} has been quarantined!`;
  }
  if (action) return `<a:VC_Alert:1482706673176150077> AntiNuke action: ${action}`;
  return title || "<a:VC_Alert:1482706673176150077> AntiNuke Trigger";
}

function cleanAntiNukeLines(lines?) {
  return (Array.isArray(lines) ? lines : [])
    .filter(Boolean)
    .map((line?) =>
      String(line)
        .replace(/^<:[^>]+>\s*/g, "")
        .trim(),
    )
    .filter(
      (line?) =>
        !line.startsWith("<:VC_Mention:1482526855289634997> **Executor:**") &&
        !line.startsWith("<:VC_Mention:1482526855289634997> **Target:**") &&
        !line.startsWith("<:channeltext:1443247596922470551> **Channel:**"),
    );
}

async function sendAntiNukeLog(guild?, title?, lines?, color = "#ED4245") {
  const logChannel = await resolveModLogChannel(guild);
  if (!logChannel?.isTextBased?.()) return;
  const dedupeBasis = [String(guild?.id || ""), String(title || ""), String(color || ""), ...(Array.isArray(lines) ? lines.map((x?) => String(x || "").trim()) : []),].join("|");
  const now = Date.now();
  for (const [key, ts] of ANTINUKE_LOG_DEDUPE.entries()) {
    if (now - Number(ts || 0) > ANTINUKE_LOG_DEDUPE_TTL_MS) {
      ANTINUKE_LOG_DEDUPE.delete(key);
    }
  }
  if (ANTINUKE_LOG_DEDUPE.has(dedupeBasis)) return;
  ANTINUKE_LOG_DEDUPE.set(dedupeBasis, now);

  const executor = extractLineValue(lines, "<:VC_Mention:1482526855289634997> Executor");
  const target = extractLineValue(lines, "<:VC_Mention:1482526855289634997> Target");
  const channel = extractLineValue(lines, "<:channeltext:1443247596922470551> Channel");
  const filterName = title?.replace(/^AntiNuke:\s*/i, "") || "<a:VC_Alert:1482706673176150077> AntiNuke";
  const details = cleanAntiNukeLines(lines);

  const embed = new EmbedBuilder().setColor(color).setTitle(antiNukeHeadline(title, lines)).setDescription([`<:VC_reason:1478517122929004544> **AntiNuke Filter:** ${filterName}`,
  channel
    ? `<:channeltext:1443247596922470551> **Channel:** ${channel}`
    : null,
  target
    ? `<:VC_Mention:1482526855289634997> **Target:** ${target}`
    : null,
  executor
    ? `<:VC_Mention:1482526855289634997> **Member:** ${executor}`
    : null,
    "",
  ...details.map(
    (line?) => `<:VC_reason:1478517122929004544>${line}`,
  ),
  ]
    .filter(Boolean)
    .join("\n"),
  )
    .setTimestamp();
  await logChannel
    .send({
      content: HIGH_STAFF_MENTION || undefined,
      embeds: [embed],
      allowedMentions: HIGH_STAFF_MENTION
        ? { roles: [String(IDs.roles.HighStaff)] }
        : undefined,
    })
    .catch(() => { });
}

export = { isUnknownExecutorId, formatExecutorLine, formatAuditStatusLine, logAuditMissingSkip, sendAntiNukeLog };
