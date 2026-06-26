const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const IDs = require("../Config/ids");

const PARTNERSHIP_CHANNEL_ID = String(IDs.channels?.partnerships || "").trim();

function buildPartnershipMessageLink(guildId, channelId, messageId) {
  const g = String(guildId || "").trim();
  const c = String(channelId || "").trim();
  const m = String(messageId || "").trim();
  if (!/^\d{16,20}$/.test(g) || !/^\d{16,20}$/.test(c) || !/^\d{16,20}$/.test(m)) return "";
  return `https://discord.com/channels/${g}/${c}/${m}`;
}

function isPartnershipDescriptionMessage(message) {
  if (!message) return false;
  if (PARTNERSHIP_CHANNEL_ID && String(message.channelId || message.channel?.id || "") !== PARTNERSHIP_CHANNEL_ID) {
    return false;
  }
  if (Array.isArray(message.embeds) && message.embeds.length > 0) return false;
  return Boolean(String(message.content || "").trim());
}

async function resolvePartnerManagerUserIdFromMessage(guildId, messageId) {
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
  const roleId = String(IDs.roles?.HighStaff || "").trim();
  if (!/^\d{16,20}$/.test(roleId)) return "";
  return `<@&${roleId}>`;
}

function getPartnerPointHighStaffPingRoleIds() {
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

function parsePartnerPointModalId(customId, prefix) {
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

function memberIsHighStaffForPointReview(member) {
  if (!member?.roles?.cache) return false;
  const ids = [IDs.roles?.HighStaff, IDs.roles?.Founder, IDs.roles?.Admin].filter(Boolean).map(String);
  return ids.some((rid) => member.roles.cache.has(rid));
}

function shouldDeleteHumanPartnershipsChannelMessage(message) {
  if (!PARTNERSHIP_CHANNEL_ID) return false;
  const channelId = String(message?.channelId || message?.channel?.id || "");
  if (channelId !== PARTNERSHIP_CHANNEL_ID) return false;
  if (!message || message.system) return false;
  if (message.author?.bot || message.webhookId || message.applicationId) return false;
  return true;
}

module.exports = {
  PARTNERSHIP_CHANNEL_ID,
  buildPartnershipMessageLink,
  isPartnershipDescriptionMessage,
  resolvePartnerManagerUserIdFromMessage,
  buildPartnerPointLogContent,
  buildPartnerPointHighStaffPingLine,
  getPartnerPointHighStaffPingRoleIds,
  parsePartnerPointModalId,
  memberIsHighStaffForPointReview,
  shouldDeleteHumanPartnershipsChannelMessage,
};