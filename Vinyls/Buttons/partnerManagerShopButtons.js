const IDs = require("../Utils/Config/ids");
const Ticket = require("../Schemas/Ticket/ticketSchema");
const { EmbedBuilder } = require("discord.js");
const { completePartnerManagerRedeemForGuild } = require("../Utils/Staff/partnerManagerRedeemRuntime");
const { parsePartnerManagerShopAckCustomId, matchPartnerManagerShopAckInteraction, memberCanAckPartnerManagerShopRedeem } = require("../Utils/Staff/partnerManagerShopAckRuntime");
const { openPartnerManagerShopManualTicket } = require("../Utils/Ticket/partnerManagerShopTicketOpen");
const { closeTicket } = require("../Utils/Ticket/ticketCloseRuntime");
const { safeReply: safeReplyHelper, safeEditReply: safeEditReplyHelper, safeMessageEdit } = require("../../shared/discord/replyRuntime");
const { STAFF_PM_SHOP_PREFIX, buildStaffProfilePayload, SECTION_SHOP, parseStaffProfileSelectCustomId, parseStaffProfileCloseCustomId } = require("../Utils/Staff/staffProfilePanelRuntime");
const { isPartnerPmDailyCommandsThread } = require("../Utils/Partner/partnersChatChannelUtils");
const PRIVATE_FLAG = 1 << 6;

function makeErrorEmbed(title, description) {
  return new EmbedBuilder().setColor("#ff4d4d").setTitle(title).setDescription(description);
}

async function closeTicketAfterPartnerManagerShopAck(interaction, ticketDoc) {
  if (!ticketDoc?.open) return;
  await closeTicket(interaction, ticketDoc.closeReason || null, {
    safeReply: (i, p) => safeReplyHelper(i, p),
    safeEditReply: (i, p) => safeEditReplyHelper(i, p),
    makeErrorEmbed,
    LOG_CHANNEL: IDs.channels?.ticketLogs,
    closedById: ticketDoc.closeRequestedBy || interaction.user.id,
  });
}

function extractStaffPanelSourceMessageId(message) {
  const rows = message?.components;
  if (!Array.isArray(rows)) return null;
  for (const row of rows) {
    const comps = row?.components;
    if (!Array.isArray(comps)) continue;
    for (const comp of comps) {
      const id = typeof comp?.customId === "string" ? comp.customId : comp?.data?.custom_id;
      if (!id) continue;
      const a = parseStaffProfileSelectCustomId(id)?.sourceMessageId;
      if (a) return a;
      const b = parseStaffProfileCloseCustomId(id)?.sourceMessageId;
      if (b) return b;
    }
  }
  return null;
}

function parseStaffPmShopButton(customId) {
  const parts = String(customId || "").split(":");
  if (parts.length < 4 || parts[0] !== STAFF_PM_SHOP_PREFIX) return null;
  const action = String(parts[1] || "");
  const viewerId = String(parts[2] || "");
  const targetId = String(parts[3] || "");
  if (!/^\d{17,20}$/.test(viewerId) || !/^\d{17,20}$/.test(targetId)) return null;
  const m = /^(r|t)(\d+)$/.exec(action);
  if (!m) return null;
  const mode = m[1];
  const tier = Number(m[2]);
  if (!Number.isFinite(tier)) return null;
  return { mode, tier, viewerId, targetId };
}

async function refreshShopPanelMessage(interaction, viewerId, targetId) {
  const guild = interaction.guild;
  if (!guild || !interaction.message?.edit) return;
  const sourceMessageId = extractStaffPanelSourceMessageId(interaction.message);
  const partnersChatPanel = await isPartnerPmDailyCommandsThread(interaction.channel);
  const payload = await buildStaffProfilePayload(guild, targetId, viewerId, interaction.client, SECTION_SHOP, {
    sourceMessageId: sourceMessageId || undefined,
    partnersChatPanel,
  });
  await safeMessageEdit(interaction.message, payload, interaction).catch(() => null);
}

async function handlePartnerManagerShopAck(interaction) {
  const parsed = parsePartnerManagerShopAckCustomId(interaction.customId);
  if (!parsed) return false;
  const guild =
    interaction.client.guilds.cache.get(parsed.guildId) ||
    (await interaction.client.guilds.fetch(parsed.guildId).catch(() => null));
  if (!guild) {
    await interaction.reply({ content: "<a:VC_Cross:1482532424570376253> Server non trovato.", flags: PRIVATE_FLAG }).catch(() => {});
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
        content: "<a:VC_Cross:1482532424570376253> Richiesta già risposta o ticket non valido.",
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
          "<a:VC_Cross:1482532424570376253> Solo lo **staff** (High Staff o chi ha claimato il ticket) può confermare il riscatto, non il Partner Manager.",
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
    await interaction.followUp({ content: "<:VC_Info:1482526956703580372> Ok: **Nessun punto** è stato scalato per questo premio.", flags: PRIVATE_FLAG }).catch(() => {});
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

async function handleStaffPmShopButton(interaction) {
  const parsed = parseStaffPmShopButton(interaction.customId);
  if (!parsed) return false;
  if (String(interaction.user.id) !== parsed.viewerId || String(parsed.viewerId) !== String(parsed.targetId)) {
    await interaction
      .reply({ content: "<a:VC_Cross:1482532424570376253> Questi pulsanti sono solo sul **tuo** profilo.", flags: PRIVATE_FLAG })
      .catch(() => {});
    return true;
  }
  const guild = interaction.guild;
  if (!guild) {
    await interaction
      .reply({ content: "<a:VC_Cross:1482532424570376253> Apri lo shop dal server.", flags: PRIVATE_FLAG })
      .catch(() => {});
    return true;
  }
  const pmRole = String(IDs.roles?.PartnerManager || "").trim();
  if (!pmRole || !interaction.member?.roles?.cache?.has(pmRole)) {
    await interaction
      .reply({ content: "<a:VC_Cross:1482532424570376253> Solo i **Partner Manager** possono usare lo shop.", flags: PRIVATE_FLAG })
      .catch(() => {});
    return true;
  }

  if (parsed.mode === "r") {
    if (parsed.tier !== 50 && parsed.tier !== 100) {
      await interaction.reply({ content: "<a:VC_Cross:1482532424570376253> Azione non valida.", flags: PRIVATE_FLAG }).catch(() => {});
      return true;
    }
    await interaction.deferUpdate().catch(() => {});
    const res = await completePartnerManagerRedeemForGuild(guild, interaction.client, {
      targetUserId: parsed.targetId,
      redeemTier: parsed.tier,
      actorUser: interaction.user,
    });
    if (!res.ok) {
      await interaction.followUp({ content: res.userMessage, flags: PRIVATE_FLAG }).catch(() => {});
      return true;
    }
    await refreshShopPanelMessage(interaction, parsed.viewerId, parsed.targetId);
    await interaction.followUp({ content: res.userMessage, flags: PRIVATE_FLAG }).catch(() => {});
    return true;
  }

  if (parsed.mode === "t") {
    if (parsed.tier !== 150 && parsed.tier !== 200 && parsed.tier !== 250) {
      await interaction.reply({ content: "<a:VC_Cross:1482532424570376253> Azione non valida.", flags: PRIVATE_FLAG }).catch(() => {});
      return true;
    }
    await interaction.deferReply({ flags: PRIVATE_FLAG }).catch(() => {});
    const opened = await openPartnerManagerShopManualTicket(interaction, parsed.tier);
    if (!opened.ok) {
      await interaction.editReply({ content: opened.userMessage }).catch(() => {});
      return true;
    }
    await interaction
      .editReply({
        content: `<:VC_Ticket:1482535175283019888> Ticket High Staff aperto: ${opened.channel}`,
      })
      .catch(() => {});
    return true;
  }

  await interaction
    .reply({ content: "<a:VC_Cross:1482532424570376253> Azione shop non riconosciuta.", flags: PRIVATE_FLAG })
    .catch(() => {});
  return true;
}

function match(interaction) {
  const id = String(interaction?.customId || "");
  if (interaction?.isButton?.() && id.startsWith(`${STAFF_PM_SHOP_PREFIX}:`)) return true;
  if (matchPartnerManagerShopAckInteraction(interaction)) return true;
  return false;
}

async function execute(interaction) {
  if (matchPartnerManagerShopAckInteraction(interaction)) {
    return handlePartnerManagerShopAck(interaction);
  }
  return handleStaffPmShopButton(interaction);
}

module.exports = { name: "partnerManagerShopButtons", order: 8, match, execute };