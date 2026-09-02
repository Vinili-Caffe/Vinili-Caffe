const { EmbedBuilder } = require("discord.js");
const Ticket = require("../../Schemas/Ticket/ticketSchema");
const IDs = require("../Config/ids");
const PM_SHOP_ACK_PREFIX = "pm_shop_ack";

function memberCanAckPartnerManagerShopRedeem(member, ticketDoc) {
  if (!member?.id || !ticketDoc) return false;
  const openerId = String(ticketDoc.userId || "").trim();
  if (!openerId || String(member.id) === openerId) return false;
  const highStaffRole = String(IDs.roles?.HighStaff || "").trim();
  if (highStaffRole && member.roles?.cache?.has(highStaffRole)) return true;
  const claimer = String(ticketDoc.claimedBy || "").trim();
  return Boolean(claimer && String(member.id) === claimer);
}

function ticketNeedsPartnerManagerShopAck(ticketDoc) {
  const tier = Math.floor(Number(ticketDoc?.partnerManagerShopRedeemTier || 0));
  if (tier !== 150 && tier !== 200 && tier !== 250) return false;
  const ack = String(ticketDoc?.partnerManagerShopRedeemAckResult || "").trim();
  return !ack;
}

function buildPartnerManagerShopRedeemAckRows(ticketMongoId, guildId) {
  const tid = String(ticketMongoId || "").trim();
  const gid = String(guildId || "").trim();
  if (!tid || !gid) return [];
  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
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

async function sendPartnerManagerShopAckPromptInTicket(channel, ticketDoc, guild) {
  if (!channel?.send || !ticketDoc?._id || !guild?.id) return null;
  const rows = buildPartnerManagerShopRedeemAckRows(ticketDoc._id, guild.id);
  if (!rows.length) return null;
  const openerId = String(ticketDoc.userId || "").trim();
  const pmLine = openerId ? `<:VC_PartnerManager:1494286911286808576> Partner Manager: <@${openerId}>\n\n` : "";
  return channel
    .send({
      embeds: [
        new EmbedBuilder()
          .setColor("#6f4e37")
          .setTitle("<:VC_Ticket:1482535175283019888> Conferma riscatto premio")
          .setDescription(
            `${pmLine}Lo **staff** deve confermare se il premio shop è stato **consegnato** al Partner Manager.\n` +
              "• **Sì, riscattato** — scalano i punti e il ticket si chiude.\n" +
              "• **No** — nessun punto scalato e il ticket si chiude.",
          ),
      ],
      allowedMentions: { parse: [] },
      components: rows,
    })
    .catch(() => null);
}

async function maybeDeferCloseForPartnerManagerShopAck({
  interaction,
  ticketDoc,
  motivo = null,
  closedById = null,
  safeReply,
}) {
  if (!ticketNeedsPartnerManagerShopAck(ticketDoc)) return false;
  const channel = interaction?.channel;
  const guild = interaction?.guild;
  if (!channel?.isTextBased?.() || !guild) return false;

  const pendingAck =
    Boolean(ticketDoc?.closeRequestedBy) && !String(ticketDoc?.partnerManagerShopRedeemAckResult || "").trim();
  if (pendingAck) {
    await safeReply(interaction, {
      embeds: [
        new EmbedBuilder()
          .setColor("#6f4e37")
          .setDescription(
            "<:VC_Info:1482526956703580372> È già in attesa la conferma dello **staff** sui pulsanti **Sì, riscattato** / **No** nel ticket.",
          ),
      ],
      flags: 1 << 6,
    }).catch(() => {});
    return true;
  }

  const closerId = String(closedById || interaction.user?.id || "").trim();
  await Ticket.updateOne(
    { _id: ticketDoc._id, open: true },
    {
      $set: {
        closeRequestedBy: closerId || null,
        closeReason: motivo != null ? motivo : ticketDoc.closeReason || null,
      },
    },
  ).catch(() => {});

  await sendPartnerManagerShopAckPromptInTicket(channel, ticketDoc, guild);

  await safeReply(interaction, {
    embeds: [
      new EmbedBuilder()
        .setColor("#6f4e37")
          .setDescription(
            "<:VC_Info:1482526956703580372> Usa **Sì, riscattato** o **No** nel ticket per confermare la consegna. I punti vengono scalati solo con **Sì**; poi il ticket si chiude automaticamente.",
          ),
    ],
    flags: 1 << 6,
  }).catch(() => {});

  return true;
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

module.exports = {
  memberCanAckPartnerManagerShopRedeem,
  PM_SHOP_ACK_PREFIX,
  ticketNeedsPartnerManagerShopAck,
  buildPartnerManagerShopRedeemAckRows,
  sendPartnerManagerShopAckPromptInTicket,
  maybeDeferCloseForPartnerManagerShopAck,
  parsePartnerManagerShopAckCustomId,
  matchPartnerManagerShopAckInteraction,
};
