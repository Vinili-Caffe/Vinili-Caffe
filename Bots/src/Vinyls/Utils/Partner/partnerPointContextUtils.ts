const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require("discord.js") as typeof import("discord.js");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { getPartnershipChannelId } = require("./partnershipConfigResolver") as typeof import("./partnershipConfigResolver");
const {
  findPartnerActionByGlobalLogId,
  findPartnerActionByMessage,
} = require("../../Services/Partner/tenantPartnershipDeleteService") as typeof import("../../Services/Partner/tenantPartnershipDeleteService");
const { extractPartnershipLogIdFromMessage } = require("./partnershipLogMessageUtils") as typeof import("./partnershipLogMessageUtils");

const MAIN_PARTNERSHIP_REMOVE_MODAL_PREFIX = "pem_m:";
const MAIN_PARTNERSHIP_REMOVE_RULE_INPUT = "regolaViolata";
const DISCORD_CUSTOM_ID_MAX = 100;

function buildPartnerPointModalCustomId(prefix?, actorId?, pmUserId?, messageId?, channelId?) {
  const id = `${prefix}${actorId}:${pmUserId}:${messageId}:${channelId}`;
  if (id.length > DISCORD_CUSTOM_ID_MAX) {
    throw new Error(`partner modal customId too long (${id.length}>${DISCORD_CUSTOM_ID_MAX})`);
  }
  return id;
}

function buildPartnershipMessageLink(guildId?, channelId?, messageId?) {
  const g = String(guildId || "").trim();
  const c = String(channelId || "").trim();
  const m = String(messageId || "").trim();
  if (!/^\d{16,20}$/.test(g) || !/^\d{16,20}$/.test(c) || !/^\d{16,20}$/.test(m)) return "";
  return `https://discord.com/channels/${g}/${c}/${m}`;
}

function isPartnershipDescriptionMessage(message?) {
  if (!message) return false;
  const guildId = String(message.guild?.id || message.guildId || "").trim();
  const partnershipChannelId = getPartnershipChannelId(guildId);
  if (
    partnershipChannelId &&
    String(message.channelId || message.channel?.id || "") !== partnershipChannelId
  ) {
    return false;
  }
  if (!partnershipChannelId) return false;
  if (Array.isArray(message.embeds) && message.embeds.length > 0) return false;
  return Boolean(String(message.content || "").trim());
}

async function resolvePartnerManagerUserIdFromMessage(guildId?, messageId?) {
  const g = String(guildId || "").trim();
  const mid = String(messageId || "").trim();
  if (!g || !/^\d{16,20}$/.test(mid)) return null;
  const doc = await ActivityUserProfile.findOne(
    {
      guildId: g,
      staff: { $exists: true },
      "staff.partnerActions": {
        $elemMatch: {
          action: "create",
          partnerMessageIds: mid,
        },
      },
    },
    { userId: 1 },
  )
    .lean()
    .catch(() => null);
  const uid = String(doc?.userId || "").trim();
  return /^\d{16,20}$/.test(uid) ? uid : null;
}

function buildPartnerPointHighStaffPingLine() {
  const IDs = require("../Config/ids") as typeof import("../Config/ids");
  const roleId = String(IDs.roles?.HighStaff || "").trim();
  if (!/^\d{16,20}$/.test(roleId)) return "";
  return `<@&${roleId}>`;
}

function getPartnerPointHighStaffPingRoleIds() {
  const IDs = require("../Config/ids") as typeof import("../Config/ids");
  const roleId = String(IDs.roles?.HighStaff || "").trim();
  return /^\d{16,20}$/.test(roleId) ? [roleId] : [];
}

function buildPartnerPointLogContent({
  pmUserId,
  rule,
  messageLink,
  reporterUserId = null,
  actorUserId = null,
  statusLine = null,
  pingHighStaff = false,
}) {
  const lines = [];
  if (pingHighStaff) {
    const ping = buildPartnerPointHighStaffPingLine();
    if (ping) lines.push(ping);
  }
  lines.push(
    `<:VC_PartnerManager:1494286911286808576> <@${String(pmUserId || "").trim()}>`,
    `<:VC_reason:1478517122929004544> ${String(rule || "").trim()}`,
  );
  if (messageLink) lines.push(`<:VC_Chat:1482532573002465413> Messaggio: ${messageLink}`);
  if (reporterUserId) lines.push(`<:VC_Staff:1494286904089247754> Segnalato da: <@${String(reporterUserId).trim()}>`);
  if (actorUserId) lines.push(`<:VC_Staff:1494286904089247754> Rimosso da: <@${String(actorUserId).trim()}>`);
  if (statusLine) lines.push(statusLine);
  return lines.join("\n");
}

function parsePartnerPointModalId(customId?, prefix?) {
  const raw = String(customId || "");
  if (!raw.startsWith(prefix)) return null;
  const parts = raw.split(":");
  if (parts.length < 5) return null;
  const actorId = String(parts[1] || "").trim();
  const pmUserId = String(parts[2] || "").trim();
  const partnershipMsgId = String(parts[3] || "").trim();
  const channelId = String(parts[4] || "").trim();
  if (!/^\d{16,20}$/.test(actorId)) return null;
  if (!/^\d{16,20}$/.test(pmUserId)) return null;
  if (!/^\d{16,20}$/.test(partnershipMsgId)) return null;
  if (!/^\d{16,20}$/.test(channelId)) return null;
  return { actorId, pmUserId, partnershipMsgId, channelId };
}

function memberIsHighStaffForPointReview(member?) {
  if (!member?.roles?.cache) return false;
  const IDs = require("../Config/ids") as typeof import("../Config/ids");
  const ids = [IDs.roles?.HighStaff, IDs.roles?.Founder, IDs.roles?.Manager, IDs.roles?.Admin].filter(Boolean).map(String);
  if (ids.some((rid?) => member.roles.cache.has(rid))) return true;
  try {
    const { memberIsResocontoPmReviewer } = require("../Ticket/ticketPartnershipStaffRoles") as typeof import("../Ticket/ticketPartnershipStaffRoles");
    return memberIsResocontoPmReviewer(member);
  } catch {
    return false;
  }
}

function isHumanPartnershipChannelMessage(message?) {
  const guildId = String(message?.guild?.id || message?.guildId || "").trim();
  const partnershipChannelId = getPartnershipChannelId(guildId);
  if (!partnershipChannelId) return false;
  const channelId = String(message?.channelId || message?.channel?.id || "");
  if (channelId !== partnershipChannelId) return false;
  if (!message || message.system) return false;
  if (message.author?.bot || message.webhookId || message.applicationId) return false;
  return true;
}

function shouldDeleteHumanPartnershipsChannelMessage(message?) {
  if (!isHumanPartnershipChannelMessage(message)) return false;
  try {
    const { resolvePartnershipConfigSync } = require("./partnershipConfigResolver") as typeof import("./partnershipConfigResolver");
    const cfg = resolvePartnershipConfigSync(String(message?.guild?.id || message?.guildId || "").trim());
    if (cfg && !cfg.legacy && cfg.manualPartnershipEnabled) return false;
  } catch {
      }
  return true;
}

async function resolveMainPartnershipRemoveTarget(guild?, message?) {
  if (!guild?.id || !message?.id) return null;

  const logId = extractPartnershipLogIdFromMessage(message);
  if (logId) {
    const match = await findPartnerActionByGlobalLogId(guild.id, logId);
    if (match?.doc?.userId) {
      return { pmUserId: String(match.doc.userId), message, match };
    }
  }

  const byMessage = await findPartnerActionByMessage(guild.id, message);
  if (byMessage?.doc?.userId) {
    return { pmUserId: String(byMessage.doc.userId), message, match: byMessage };
  }

  const pmUserId = await resolvePartnerManagerUserIdFromMessage(guild.id, message.id);
  if (pmUserId) return { pmUserId, message, match: null };
  return null;
}

function buildMainPartnershipRemoveModal(interaction?, target?) {
  const modal = new ModalBuilder()
    .setCustomId(
      buildPartnerPointModalCustomId(
        MAIN_PARTNERSHIP_REMOVE_MODAL_PREFIX,
        interaction.user.id,
        target.pmUserId,
        target.message.id,
        target.message.channelId,
      ),
    )
    .setTitle("Elimina partnership");
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId(MAIN_PARTNERSHIP_REMOVE_RULE_INPUT)
        .setLabel("Regola violata")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("Indica la regola violata dalla partner")
        .setRequired(true)
        .setMaxLength(500),
    ),
  );
  return modal;
}

function parseMainPartnershipRemoveModalId(customId?) {
  return (
    parsePartnerPointModalId(customId, MAIN_PARTNERSHIP_REMOVE_MODAL_PREFIX) ||
    parsePartnerPointModalId(customId, "partner_elimina_main_m:")
  );
}

export = {
  MAIN_PARTNERSHIP_REMOVE_MODAL_PREFIX,
  MAIN_PARTNERSHIP_REMOVE_RULE_INPUT,
  buildPartnershipMessageLink,
  isPartnershipDescriptionMessage,
  resolvePartnerManagerUserIdFromMessage,
  resolveMainPartnershipRemoveTarget,
  buildMainPartnershipRemoveModal,
  parseMainPartnershipRemoveModalId,
  buildPartnerPointModalCustomId,
  buildPartnerPointLogContent,
  buildPartnerPointHighStaffPingLine,
  getPartnerPointHighStaffPingRoleIds,
  parsePartnerPointModalId,
  memberIsHighStaffForPointReview,
  isHumanPartnershipChannelMessage,
  shouldDeleteHumanPartnershipsChannelMessage,
};