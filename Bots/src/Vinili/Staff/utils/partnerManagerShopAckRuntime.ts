const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const PM_SHOP_ACK_PREFIX = "pm_shop_ack";

function memberCanAckPartnerManagerShopRedeem(member?, ticketDoc?) {
  if (!member?.id || !ticketDoc) return false;
  const openerId = String(ticketDoc.userId || "").trim();
  if (!openerId || String(member.id) === openerId) return false;
  const highStaffRole = String(IDs.roles?.HighStaff || "").trim();
  if (highStaffRole && member.roles?.cache?.has(highStaffRole)) return true;
  const claimer = String(ticketDoc.claimedBy || "").trim();
  return Boolean(claimer && String(member.id) === claimer);
}

function parsePartnerManagerShopAckCustomId(customId?) {
  const parts = String(customId || "").split(":");
  if (parts.length < 4 || parts[0] !== PM_SHOP_ACK_PREFIX) return null;
  const decision = String(parts[1] || "").toLowerCase();
  if (decision !== "yes" && decision !== "no") return null;
  const ticketId = String(parts[2] || "").trim();
  const guildId = String(parts[3] || "").trim();
  if (!ticketId || !guildId) return null;
  if (!/^[a-f0-9]{24}$/i.test(ticketId)) return null;
  if (!/^\d{17,20}$/.test(guildId)) return null;
  return { decision, ticketId, guildId };
}

function matchPartnerManagerShopAckInteraction(interaction?) {
  const id = String(interaction?.customId || "");
  return interaction?.isButton?.() && id.startsWith(`${PM_SHOP_ACK_PREFIX}:`);
}

export = {
  memberCanAckPartnerManagerShopRedeem,
  parsePartnerManagerShopAckCustomId,
  matchPartnerManagerShopAckInteraction,
};
