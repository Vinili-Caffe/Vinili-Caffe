/** Antinuke: messaggi di log per lo staff. */
const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { getGuildChannelCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { UNKNOWN_EXECUTOR_ID } = require("./antiNukeWhitelist") as typeof import("./antiNukeWhitelist");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const HIGH_STAFF_MENTION = IDs.roles?.HighStaff ? `<@&${IDs.roles.HighStaff}>` : null;
const ANTINUKE_LOG_DEDUPE = new Map();
const ANTINUKE_LOG_DEDUPE_TTL_MS = 12_000;

function isUnknownExecutorId(executorId?) {
  return String(executorId || "").trim() === UNKNOWN_EXECUTOR_ID;
}

function formatExecutorLine(executorId?) {
  const actorId = String(executorId || "").trim();
  if (!actorId || actorId === UNKNOWN_EXECUTOR_ID) {
    return `${E.VC_Mention} **Executor:** Sconosciuto`;
  }
  return `${E.VC_Mention} **Executor:** <@${actorId}> \`${actorId}\``;
}

function formatAuditStatusLine(executorId?) {
  if (isUnknownExecutorId(executorId)) {
    return `${E.VC_reason} **Audit Status:** Missing audit entry from Discord`;
  }
  return `${E.VC_reason} **Audit Status:** Audit entry resolved`;
}

async function logAuditMissingSkip(guild?, title?, lines = []) {
  await sendAntiNukeLog(
    guild,
    title,
    [
      formatExecutorLine(UNKNOWN_EXECUTOR_ID),
      formatAuditStatusLine(UNKNOWN_EXECUTOR_ID),
      ...lines,
      `${E.VC_reason} **Technical Reason:** Audit log entry not available in time, automatic enforcement skipped`,
      `${E.VC_reason} **Result:** No enforcement performed`,
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
  const executor = extractLineValue(lines, `${E.VC_Mention} Executor`);
  const action = extractLineValue(lines, `${E.VC_Mention} Action`);
  if (/panic mode enabled/i.test(String(title || ""))) {
    return `${E.success} AntiNuke panic mode has been enabled!`;
  }
  if (/panic mode ended/i.test(String(title || ""))) {
    return `${E.cancel} AntiNuke panic mode has ended.`;
  }
  if (executor && /quarantined/i.test((lines || []).join(" "))) {
    return `${E.VC_Lock} ${executor.split(" ")[0]} has been quarantined!`;
  }
  if (action) return `${E.VC_Alert} AntiNuke action: ${action}`;
  return title || `${E.VC_Alert} AntiNuke Trigger`;
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
        !line.startsWith(`${E.VC_Mention} **Executor:**`) &&
        !line.startsWith(`${E.VC_Mention} **Target:**`) &&
        !line.startsWith(`${E.channeltext} **Channel:**`),
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

  const executor = extractLineValue(lines, `${E.VC_Mention} Executor`);
  const target = extractLineValue(lines, `${E.VC_Mention} Target`);
  const channel = extractLineValue(lines, `${E.channeltext} Channel`);
  const filterName = title?.replace(/^AntiNuke:\s*/i, "") || `${E.VC_Alert} AntiNuke`;
  const details = cleanAntiNukeLines(lines);

  const embed = new EmbedBuilder().setColor(color).setTitle(antiNukeHeadline(title, lines)).setDescription([`${E.VC_reason} **AntiNuke Filter:** ${filterName}`,
  channel
    ? `${E.channeltext} **Channel:** ${channel}`
    : null,
  target
    ? `${E.VC_Mention} **Target:** ${target}`
    : null,
  executor
    ? `${E.VC_Mention} **Member:** ${executor}`
    : null,
    "",
  ...details.map(
    (line?) => `${E.VC_reason}${line}`,
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
