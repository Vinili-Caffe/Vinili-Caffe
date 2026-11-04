const IDs = require("../../../Config/ids") as typeof import("../../../Config/ids");
const Ticket = require("../../../../MultiGuild/tickets/data/guildFeatureBucketTicketModel");
const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { completePartnerManagerRedeemForGuild } = require("../../../Staff/utils/partnerManagerRedeemRuntime") as typeof import("../../../Staff/utils/partnerManagerRedeemRuntime");
const { parsePartnerManagerShopAckCustomId, matchPartnerManagerShopAckInteraction, memberCanAckPartnerManagerShopRedeem } = require("../../../Staff/utils/partnerManagerShopAckRuntime") as typeof import("../../../Staff/utils/partnerManagerShopAckRuntime");
const { closeTicket } = require("../../../../MultiGuild/tickets/discord/ticketCloseRuntime") as typeof import("../../../../MultiGuild/tickets/discord/ticketCloseRuntime");
const { safeReply: safeReplyHelper, safeEditReply: safeEditReplyHelper } = require("../../../../shared/discord/replyRuntime") as typeof import("../../../../shared/discord/replyRuntime");
const { E } = require("../../../../shared/emojis/emojiCatalog") as typeof import("../../../../shared/emojis/emojiCatalog");
const PRIVATE_FLAG = 1 << 6;

function makeErrorEmbed(title?, description?) {
  return new EmbedBuilder().setColor("#ff4d4d").setTitle(title).setDescription(description);
}

async function closeTicketAfterPartnerManagerShopAck(interaction?, ticketDoc?) {
  if (!ticketDoc?.open) return;
  await closeTicket(interaction, ticketDoc.closeReason || null, {
    safeReply: (i?, p?) => safeReplyHelper(i, p),
    safeEditReply: (i?, p?) => safeEditReplyHelper(i, p),
    makeErrorEmbed,
    LOG_CHANNEL: IDs.channels?.ticketLogs,
    closedById: ticketDoc.closeRequestedBy || interaction.user.id,
  });
}

async function handlePartnerManagerShopAck(interaction?) {
  const parsed = parsePartnerManagerShopAckCustomId(interaction.customId);
  if (!parsed) return false;
  const guild =
    interaction.client.guilds.cache.get(parsed.guildId) ||
    (await interaction.client.guilds.fetch(parsed.guildId).catch(() => null));
  if (!guild) {
    await interaction.reply({ content: `${E.VC_Cross} Server non trovato.`, flags: PRIVATE_FLAG }).catch(() => {});
    return true;
  }

  const lock = await Ticket.findOneAndUpdate(
    {
      _id: parsed.ticketId,
      open: true,
      partnerManagerShopRedeemTier: { $in: [150, 200, 250] },
      partnerManagerShopRedeemAckResult: null,
    },
    { $set: { partnerManagerShopRedeemAckResult: "processing" } },
    { new: true },
  ).catch(() => null);

  if (!lock) {
    await interaction
      .reply({
        content: `${E.VC_Cross} Richiesta già risposta o ticket non valido.`,
        flags: PRIVATE_FLAG,
      })
      .catch(() => {});
    return true;
  }

  if (!memberCanAckPartnerManagerShopRedeem(interaction.member, lock)) {
    await Ticket.updateOne({ _id: parsed.ticketId }, { $set: { partnerManagerShopRedeemAckResult: null } }).catch(() => {});
    await interaction
      .reply({
        content:
          `${E.VC_Cross} Solo lo **staff** (High Staff o chi ha claimato il ticket) può confermare il riscatto, non il Partner Manager.`,
        flags: PRIVATE_FLAG,
      })
      .catch(() => {});
    return true;
  }

  await interaction.deferUpdate().catch(() => {});
  await interaction.message.edit({ components: [] }).catch(() => {});

  if (parsed.decision === "no") {
    await Ticket.updateOne(
      { _id: parsed.ticketId, partnerManagerShopRedeemAckResult: "processing" },
      { $set: { partnerManagerShopRedeemAckResult: "declined", partnerManagerShopRedeemAckAt: new Date() } },
    ).catch(() => {});
    await interaction
      .followUp({ content: `${E.VC_Info} Ok: **Nessun punto** è stato scalato per questo premio.`, flags: PRIVATE_FLAG })
      .catch(() => {});
    const ticketForClose = await Ticket.findById(parsed.ticketId).catch(() => null);
    if (ticketForClose?.open) await closeTicketAfterPartnerManagerShopAck(interaction, ticketForClose);
    return true;
  }

  const tier = Math.floor(Number(lock.partnerManagerShopRedeemTier || 0));
  const pmUserId = String(lock.userId || "").trim();
  const res = await completePartnerManagerRedeemForGuild(guild, interaction.client, {
    targetUserId: pmUserId,
    redeemTier: tier,
    actorUser: interaction.user,
  });
  if (!res.ok) {
    await Ticket.updateOne({ _id: parsed.ticketId }, { $set: { partnerManagerShopRedeemAckResult: null } }).catch(() => {});
    await interaction.followUp({ content: res.userMessage, flags: PRIVATE_FLAG }).catch(() => {});
    return true;
  }
  await Ticket.updateOne(
    { _id: parsed.ticketId, partnerManagerShopRedeemAckResult: "processing" },
    { $set: { partnerManagerShopRedeemAckResult: "completed", partnerManagerShopRedeemAckAt: new Date() } },
  ).catch(() => {});
  await interaction.followUp({ content: res.userMessage, flags: PRIVATE_FLAG }).catch(() => {});
  const ticketForClose = await Ticket.findById(parsed.ticketId).catch(() => null);
  if (ticketForClose?.open) await closeTicketAfterPartnerManagerShopAck(interaction, ticketForClose);
  return true;
}

function match(interaction?) {
  return matchPartnerManagerShopAckInteraction(interaction);
}

async function execute(interaction?) {
  return handlePartnerManagerShopAck(interaction);
}

export = { name: "partnerManagerShopButtons", order: 8, match, execute };
