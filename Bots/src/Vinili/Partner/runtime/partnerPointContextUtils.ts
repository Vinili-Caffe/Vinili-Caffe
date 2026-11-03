const { ActivityUserProfile } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const { getPartnershipChannelId } = require("../core/partnershipConfigResolver") as typeof import("../core/partnershipConfigResolver");

function buildPartnershipMessageLink(guildId?, channelId?, messageId?) {
  const g = String(guildId || "").trim();
  const c = String(channelId || "").trim();
  const m = String(messageId || "").trim();
  if (!/^\d{16,20}$/.test(g) || !/^\d{16,20}$/.test(c) || !/^\d{16,20}$/.test(m)) return "";
  return `https://discord.com/channels/${g}/${c}/${m}`;
}

const DISCORD_MESSAGE_LINK_REGEX =
  /https?:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)/i;

function parseDiscordMessageLink(link?) {
  const raw = String(link || "").trim();
  if (!raw) return null;
  const match = raw.match(DISCORD_MESSAGE_LINK_REGEX);
  if (!match) return null;
  const guildId = String(match[1] || "").trim();
  const channelId = String(match[2] || "").trim();
  const messageId = String(match[3] || "").trim();
  if (!/^\d{16,20}$/.test(guildId) || !/^\d{16,20}$/.test(channelId) || !/^\d{16,20}$/.test(messageId)) {
    return null;
  }
  return { guildId, channelId, messageId };
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
  const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
  const roleId = String(IDs.roles?.HighStaff || "").trim();
  if (!/^\d{16,20}$/.test(roleId)) return "";
  return `<@&${roleId}>`;
}

function getPartnerPointHighStaffPingRoleIds() {
  const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
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

function memberIsHighStaffForPointReview(member?) {
  if (!member?.roles?.cache) return false;
  const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
  const ids = [IDs.roles?.HighStaff, IDs.roles?.Founder, IDs.roles?.Manager, IDs.roles?.Admin].filter(Boolean).map(String);
  if (ids.some((rid?) => member.roles.cache.has(rid))) return true;
  try {
    const { memberIsResocontoPmReviewer } = require("../../MultiGuild/tickets/discord/ticketPartnershipStaffRoles") as typeof import("../../MultiGuild/tickets/discord/ticketPartnershipStaffRoles");
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
    const { resolvePartnershipConfigSync } = require("../core/partnershipConfigResolver") as typeof import("../core/partnershipConfigResolver");
    const cfg = resolvePartnershipConfigSync(String(message?.guild?.id || message?.guildId || "").trim());
    if (cfg && !cfg.legacy && cfg.manualPartnershipEnabled) return false;
  } catch {
      }
  return true;
}

export = {
  buildPartnershipMessageLink,
  parseDiscordMessageLink,
  isPartnershipDescriptionMessage,
  resolvePartnerManagerUserIdFromMessage,
  buildPartnerPointLogContent,
  getPartnerPointHighStaffPingRoleIds,
  memberIsHighStaffForPointReview,
  isHumanPartnershipChannelMessage,
  shouldDeleteHumanPartnershipsChannelMessage,
};
