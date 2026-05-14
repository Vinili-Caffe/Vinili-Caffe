const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const PM_SHOP_ACK_PREFIX = "pm_shop_ack";

function buildPartnerManagerShopRedeemAckRows(ticketMongoId, guildId) {
  const tid = String(ticketMongoId || "").trim();
  const gid = String(guildId || "").trim();
  if (!tid || !gid) return [];
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${PM_SHOP_ACK_PREFIX}:yes:${tid}:${gid}`)
      .setLabel("Sì, riscattato")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${PM_SHOP_ACK_PREFIX}:no:${tid}:${gid}`)
      .setLabel("No")
      .setStyle(ButtonStyle.Secondary),
  );
  return [row];
}

function parsePartnerManagerShopAckCustomId(customId) {
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

function matchPartnerManagerShopAckInteraction(interaction) {
  const id = String(interaction?.customId || "");
  return interaction?.isButton?.() && id.startsWith(`${PM_SHOP_ACK_PREFIX}:`);
}

module.exports = { PM_SHOP_ACK_PREFIX, buildPartnerManagerShopRedeemAckRows, parsePartnerManagerShopAckCustomId, matchPartnerManagerShopAckInteraction };