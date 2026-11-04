const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const BotState = require("../../../shared/schemas/botState/botStateSchema");
const { isMongoReady } = require("../../../shared/db/mongoConnect") as typeof import("../../../shared/db/mongoConnect");
const { getGuildChannelCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { formatPartnershipPingDisplay } = require("../../Partner/runtime/partnershipPingUtils") as typeof import("../../Partner/runtime/partnershipPingUtils");
const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const {
  getPartnershipChannelId,
  resolvePartnershipLifecycleLogChannelId,
} = require("../../Partner/core/partnershipConfigResolver") as typeof import("../../Partner/core/partnershipConfigResolver");
const { extractPartnershipLogIdFromText } = require("../../Partner/runtime/partnershipLogMessageUtils") as typeof import("../../Partner/runtime/partnershipLogMessageUtils");
const GLOBAL_PARTNERSHIP_LOG_SEQ_KEY = "globalPartnershipLogSeq.v1";
const LOG_COLOR = require("../../../MultiGuild/utils/tenantEmbedBranding").TENANT_EMBED_COLOR;
const DELETE_LOG_COLOR = 0xed4245;

const DELETE_REASON_LABELS = {
  slash_command: "Comando `/delete partnership`",
  context_menu: "Comando contestuale **Elimina partnership**",
  context_menu_main_unified: "Comando contestuale **Elimina partnership** (server principale)",
  manager_leave: "Manager uscito dal server (timeout 5 minuti)",
  pm_staff_leave: "Partner Manager uscito dal server",
};

function resolvePartnershipDeleteReasonLabel(reason?) {
  const key = String(reason || "").trim().toLowerCase();
  return DELETE_REASON_LABELS[key] || "`N/D`";
}

async function nextGlobalPartnershipLogId() {
  if (!isMongoReady()) return null;
  try {
    const doc = await BotState.findOneAndUpdate(
      { key: GLOBAL_PARTNERSHIP_LOG_SEQ_KEY },
      { $inc: { value: 1 } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
    const seq = Math.floor(Number(doc?.value) || 0);
    return seq > 0 ? seq : null;
  } catch (err) {
    global.logger?.warn?.("[partnershipExecuteLog] seq increment failed:", err?.message || err);
    return null;
  }
}

async function reserveAndPersistPartnershipLogId(staffDoc?, actionIndex?) {
  const index = Math.floor(Number(actionIndex));
  if (!staffDoc?.staff || index < 0) return null;

  const partnershipId = await nextGlobalPartnershipLogId();
  if (!partnershipId) {
    global.logger?.warn?.("[partnershipExecuteLog] impossibile riservare ID partnership");
    return null;
  }

  const actions = Array.isArray(staffDoc.staff.partnerActions) ? staffDoc.staff.partnerActions : [];
  if (!actions[index]) return null;

  actions[index].globalLogId = partnershipId;
  staffDoc.markModified("staff");
  try {
    await staffDoc.save();
  } catch (err) {
    global.logger?.warn?.("[partnershipExecuteLog] save globalLogId failed:", err?.message || err);
    return null;
  }

  return partnershipId;
}

function buildPartnershipMessageUrl(guildId?, channelId?, messageId?) {
  const gid = String(guildId || "").trim();
  const cid = String(channelId || "").trim();
  const mid = String(messageId || "").trim();
  if (!gid || !cid || !mid) return null;
  return `https://discord.com/channels/${gid}/${cid}/${mid}`;
}

function buildPartnershipExecuteLogEmbed({
  partnershipId,
  guild,
  pmUserId,
  managerId,
  managerBadgeEmojis = null,
  pingRoleId,
  pingHere = false,
  pingEveryone = false,
  messageUrl,
  client,
}) {
  const { formatManagerBadgeSuffix } = require("../../Partner/runtime/partnershipMessageUtils") as typeof import("../../Partner/runtime/partnershipMessageUtils");
  const badgeSuffix = formatManagerBadgeSuffix(managerBadgeEmojis);
  const managerValue = managerId
    ? `<@${managerId}>${badgeSuffix}`
    : "`null`";
  const pingValue = formatPartnershipPingDisplay({ pingHere, pingEveryone, pingRoleId });
  const linkValue = messageUrl ? `[Clicca qui](${messageUrl})` : "`null`";
  const botUser = client?.user;
  const embed = new EmbedBuilder()
    .setColor(LOG_COLOR)
    .setTitle(`${E["250885giveaway"]} Partnership Eseguita!`)
    .setDescription(
      [
        `${E["981353partner"]} **ID:** \`${partnershipId}\``,
        `${E["7619planet"]} **Server:** ${String(guild?.name || "Server").trim()}`,
        `${E["861752staff"]} **User:** <@${pmUserId}>`,
        `${E["945027student"]} **Manager:** ${managerValue}`,
        `${E["944992bell"]} **Ping:** ${pingValue}`,
        `${E["808239search"]} **Link:** ${linkValue}`,
      ].join("\n"),
    );

  return embed;
}

function buildPartnershipDeleteLogEmbed({
  partnershipId,
  guild,
  pmUserId,
  managerId,
  managerBadgeEmojis = null,
  partnerName,
  actorUserId,
  reason,
  client,
}) {
  const { formatManagerBadgeSuffix } = require("../../Partner/runtime/partnershipMessageUtils") as typeof import("../../Partner/runtime/partnershipMessageUtils");
  const badgeSuffix = formatManagerBadgeSuffix(managerBadgeEmojis);
  const managerValue = managerId
    ? `<@${managerId}>${badgeSuffix}`
    : "`null`";
  const actorValue = actorUserId ? `<@${actorUserId}>` : "`Sistema`";
  const partnerValue = String(partnerName || "").trim() || "`N/D`";
  const embed = new EmbedBuilder()
    .setColor(DELETE_LOG_COLOR)
    .setTitle(`${E.VC_Cross} Partnership Eliminata!`)
    .setDescription(
      [
        `${E["981353partner"]} **ID:** \`${partnershipId || "N/D"}\``,
        `${E["7619planet"]} **Server:** ${String(guild?.name || "Server").trim()}`,
        `${E["861752staff"]} **PM:** <@${pmUserId}>`,
        `${E["945027student"]} **Manager:** ${managerValue}`,
        `${E["808239search"]} **Partner:** ${partnerValue}`,
        `${E["944992bell"]} **Motivo:** ${resolvePartnershipDeleteReasonLabel(reason)}`,
        `${E["808239search"]} **Eseguita da:** ${actorValue}`,
      ].join("\n"),
    );

  return embed;
}

async function sendPartnershipDeleteLog({
  client,
  guild,
  logsChannelId,
  partnershipId,
  pmUserId,
  managerId,
  partnerName,
  actorUserId,
  reason,
}) {
  const channelId = String(logsChannelId || "").trim();
  if (!guild?.id || !channelId) return { ok: false, reason: "no_log_channel" };

  const channel =
    guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId).catch(() => null));
  if (!channel?.isTextBased?.()) return { ok: false, reason: "invalid_log_channel" };

  let managerBadgeEmojis = [];
  if (managerId && guild?.id) {
    try {
      const { resolveManagerSelectedBadgeEmojis } = require("../../Partner/services/tenantProfilePreferencesService") as typeof import("../../Partner/services/tenantProfilePreferencesService");
      managerBadgeEmojis = await resolveManagerSelectedBadgeEmojis(guild.id, managerId);
    } catch {
      managerBadgeEmojis = [];
    }
  }

  const embed = buildPartnershipDeleteLogEmbed({
    partnershipId,
    guild,
    pmUserId,
    managerId,
    managerBadgeEmojis,
    partnerName,
    actorUserId,
    reason,
    client,
  });

  try {
    const sent = await channel.send({ embeds: [embed] });
    return { ok: true, messageId: sent?.id || null, channelId: sent?.channelId || channel.id };
  } catch (err) {
    global.logger?.warn?.("[partnershipDeleteLog] send failed:", err?.message || err);
    return { ok: false, reason: "send_failed" };
  }
}

function normalizeAssignedPartnershipLogId(raw?) {
  const id = Math.floor(Number(raw));
  if (!Number.isFinite(id) || id <= 0) return null;
  return id;
}

async function findPartnershipLogIdFromExecuteLogs(guild?, action?) {
  const logsChannelId = resolvePartnershipLifecycleLogChannelId(guild?.id);
  const firstMsgId = String(action?.partnerMessageIds?.[0] || "").trim();
  if (!logsChannelId || !firstMsgId) return null;

  const publishChannelId = String(
    action?.partnershipChannelId || getPartnershipChannelId(guild?.id) || "",
  ).trim();
  const messageUrl = buildPartnershipMessageUrl(guild.id, publishChannelId, firstMsgId);
  const partnerName = String(action?.partner || "").trim().toLowerCase();

  const channel =
    guild.channels.cache.get(logsChannelId) ||
    (await getGuildChannelCached(guild, logsChannelId).catch(() => null));
  if (!channel?.isTextBased?.()) return null;

  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!messages?.size) return null;

  for (const msg of messages.values()) {
    for (const embed of msg.embeds || []) {
      const blob = [embed.title, embed.description, embed.footer?.text].filter(Boolean).join("\n");
      if (!/partnership eseguita/i.test(blob)) continue;

      const id = extractPartnershipLogIdFromText(blob);
      if (!id) continue;
      if (messageUrl && blob.includes(messageUrl)) return id;
      if (partnerName && blob.toLowerCase().includes(partnerName)) return id;
    }
  }
  return null;
}

async function sendPartnershipExecuteLog({
  client,
  guild,
  logsChannelId,
  pmUserId,
  managerId,
  pingRoleId,
  pingHere = false,
  pingEveryone = false,
  partnershipChannelId,
  partnershipMessageId,
  partnershipId: preassignedPartnershipId,
}) {
  const channelId = String(logsChannelId || "").trim();
  if (!guild?.id || !channelId) return { ok: false, reason: "no_log_channel" };

  const partnershipId =
    normalizeAssignedPartnershipLogId(preassignedPartnershipId) ||
    (await nextGlobalPartnershipLogId());
  if (!partnershipId) return { ok: false, reason: "no_seq" };

  const channel =
    guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId).catch(() => null));
  if (!channel?.isTextBased?.()) return { ok: false, reason: "invalid_log_channel", partnershipId };

  const messageUrl = buildPartnershipMessageUrl(guild.id, partnershipChannelId, partnershipMessageId);
  let managerBadgeEmojis = [];
  if (managerId && guild?.id) {
    try {
      const { resolveManagerSelectedBadgeEmojis } = require("../../Partner/services/tenantProfilePreferencesService") as typeof import("../../Partner/services/tenantProfilePreferencesService");
      managerBadgeEmojis = await resolveManagerSelectedBadgeEmojis(guild.id, managerId);
    } catch {
      managerBadgeEmojis = [];
    }
  }
  const embed = buildPartnershipExecuteLogEmbed({
    partnershipId,
    guild,
    pmUserId,
    managerId,
    managerBadgeEmojis,
    pingRoleId,
    pingHere,
    pingEveryone,
    messageUrl,
    client,
  });

  try {
    const sent = await channel.send({ embeds: [embed] });
    return { ok: true, partnershipId, messageId: sent?.id || null, channelId: sent?.channelId || channel.id };
  } catch (err) {
    global.logger?.warn?.("[partnershipExecuteLog] send failed:", err?.message || err);
    return { ok: false, reason: "send_failed", partnershipId };
  }
}

export = {
  reserveAndPersistPartnershipLogId,
  sendPartnershipExecuteLog,
  sendPartnershipDeleteLog,
  findPartnershipLogIdFromExecuteLogs,
};
