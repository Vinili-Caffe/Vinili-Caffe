const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, UserSelectMenuBuilder, StringSelectMenuBuilder } = require("discord.js");
const Ticket = require("../../Schemas/Ticket/ticketSchema");
const IDs = require("../Config/ids");
const { getGuildMemberCached } = require("../Interaction/interactionEntityCache");
const { getTicketPanelConfig } = require("./ticketPanelConfig");
const { resolveTicketRenamePrefix, sanitizeTicketChannelTail } = require("./ticketNamingRuntime");
const { hasStaffTicketRole, buildRemoveMemberOptions } = require("./ticketStaffPanelBuild");
const ticketModule = require("../../Prefix/Staff/ticket");
const {
  parseTicketPanelMessageIdFromCustomId,
  withTicketPanelMessageCustomId,
  TICKET_PANEL_ADD_MEMBER_PREFIX,
  TICKET_PANEL_REMOVE_MEMBER_PREFIX,
  TICKET_PANEL_SWITCH_CATEGORY_PREFIX,
  TICKET_PANEL_TRANSFER_USER_PREFIX,
} = require("./ticketInteractionRuntime");
const HIGHSTAFF_ROLE_ID = IDs.roles.HighStaff;
const TICKET_READ_PROJECTION = { _id: 1, channelId: 1, open: 1, userId: 1, claimedBy: 1, guildId: 1, ticketNumber: 1, ticketType: 1 };

function buildTransferPickerEmbed(ticketType) {
  const t = String(ticketType || "").toLowerCase();
  let rolesLine = "**Supporto:** Staff.";
  if (t === "partnership") rolesLine = "**Partnership:** Partner Manager.";
  else if (t === "high") rolesLine = "**High Staff:** solo High Staff.";
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("🔀 Trasferisci claim")
    .setDescription(
      `${rolesLine}\n\nCerca e seleziona un membro idoneo. Non sono ammessi bot, l’apertore del ticket né l’attuale claimant.`,
    );
}

function makeError(title, description) {
  return new EmbedBuilder().setTitle(title).setDescription(description).setColor("#6f4e37");
}

function createInteractionMessageProxy(interaction) {
  let replyCount = 0;
  return {
    channel: interaction.channel,
    guild: interaction.guild,
    client: interaction.client,
    member: interaction.member,
    author: interaction.user,
    reply: async (payload) => {
      replyCount += 1;
      const baseFlags = Number(payload?.flags) || 0;
      const p = { ...payload, flags: baseFlags | MessageFlags.Ephemeral };
      if (replyCount === 1) {
        return interaction.editReply(p);
      }
      return interaction.followUp(p);
    },
  };
}

function messageIsPlusTicketStaffPanel(message) {
  if (!message?.components?.length) return false;
  for (const row of message.components) {
    for (const c of row.components || []) {
      const id = String(c.customId || "");
      if (id.startsWith("ticket_panel_nav_") || id === "ticket_panel_reopen_pick") return true;
    }
  }
  return false;
}

async function deletePlusTicketCommandAndPanelMessages(interaction) {
  const panelMsg = interaction.message;
  if (!panelMsg?.channel?.messages?.fetch) return;
  if (!messageIsPlusTicketStaffPanel(panelMsg)) return;
  const channel = panelMsg.channel;
  const refId = panelMsg.reference?.messageId;
  await panelMsg.delete().catch(() => {});
  if (!refId) return;
  const cmdMsg = await channel.messages.fetch(refId).catch(() => null);
  if (cmdMsg && !cmdMsg.author?.bot) await cmdMsg.delete().catch(() => {});
}

async function deletePlusTicketStaffPanelById(channel, panelMessageId) {
  if (!channel?.messages?.fetch || !panelMessageId) return;
  const panelMsg = await channel.messages.fetch(panelMessageId).catch(() => null);
  if (!panelMsg || !messageIsPlusTicketStaffPanel(panelMsg)) return;
  const refId = panelMsg.reference?.messageId;
  await panelMsg.delete().catch(() => {});
  if (!refId) return;
  const cmdMsg = await channel.messages.fetch(refId).catch(() => null);
  if (cmdMsg && !cmdMsg.author?.bot) await cmdMsg.delete().catch(() => {});
}

async function handleTicketStaffPanelInteraction(interaction, { safeReply, makeErrorEmbed }) {
  const cid = String(interaction.customId || "");
  const isPanel =
    cid.startsWith("ticket_panel_") || cid.startsWith("modal_ticket_panel");
  if (!isPanel) return false;

  if (interaction.isButton?.() && cid === "ticket_panel_nav_add") {
    if (!hasStaffTicketRole(interaction.member)) {
      await safeReply(interaction, {
        embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Non hai permesso di aggiungere utenti al ticket.")],
        flags: 1 << 6,
      });
      return true;
    }
    const addEmbed = new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("➕ Aggiungi")
      .setDescription("Cerca e seleziona un membro.");
    const addRow = new ActionRowBuilder().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId(withTicketPanelMessageCustomId(TICKET_PANEL_ADD_MEMBER_PREFIX, interaction.message?.id))
        .setPlaceholder("➕ Scegli un utente…")
        .setMinValues(1)
        .setMaxValues(1),
    );
    await interaction.reply({
      embeds: [addEmbed],
      components: [addRow],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (interaction.isButton?.() && cid === "ticket_panel_nav_remove") {
    if (!hasStaffTicketRole(interaction.member)) {
      await safeReply(interaction, {
        embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Non hai permesso di rimuovere utenti dal ticket.")],
        flags: 1 << 6,
      });
      return true;
    }
    const remOpts = buildRemoveMemberOptions(interaction.channel);
    if (!remOpts.length) {
      await safeReply(interaction, {
        embeds: [
          makeErrorEmbed(
            "<a:VC_Alert:1482706673176150077> Errore",
            "<:vegax:1443934876440068179> Non c’è nessun utente da rimuovere dai permessi del canale.",
          ),
        ],
        flags: 1 << 6,
      });
      return true;
    }
    const removeEmbed = new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("➖ Rimuovi")
      .setDescription("Scegli un membro.");
    const removeRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(withTicketPanelMessageCustomId(TICKET_PANEL_REMOVE_MEMBER_PREFIX, interaction.message?.id))
        .setPlaceholder("➖ Scegli un utente…")
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(remOpts),
    );
    await interaction.reply({
      embeds: [removeEmbed],
      components: [removeRow],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (interaction.isButton?.() && cid === "ticket_panel_nav_switch") {
    if (!HIGHSTAFF_ROLE_ID || !interaction.member?.roles?.cache?.has(HIGHSTAFF_ROLE_ID)) {
      await safeReply(interaction, {
        embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Solo l’**High Staff** può usare lo switchpanel.")],
        flags: 1 << 6,
      });
      return true;
    }
    const switchEmbed = new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("🔄 Switchpanel")
      .setDescription("Scegli la nuova categoria.");
    const switchRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(withTicketPanelMessageCustomId(TICKET_PANEL_SWITCH_CATEGORY_PREFIX, interaction.message?.id))
        .setPlaceholder("🔄 Cambia categoria…")
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
          { label: "SUPPORTO", value: "supporto", description: "SUPPORTO" },
          { label: "PARTNERSHIP", value: "partnership", description: "PARTNERSHIP" },
          { label: "HIGH STAFF", value: "highstaff", description: "HIGH STAFF" },
        ),
    );
    await interaction.reply({
      embeds: [switchEmbed],
      components: [switchRow],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (interaction.isButton?.() && cid === "ticket_panel_nav_rename") {
    if (!HIGHSTAFF_ROLE_ID || !interaction.member?.roles?.cache?.has(HIGHSTAFF_ROLE_ID)) {
      await safeReply(interaction, {
        embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Solo l’**High Staff** può rinominare il ticket.")],
        flags: 1 << 6,
      });
      return true;
    }
    const modal = new ModalBuilder()
      .setCustomId("modal_ticket_panel_rename")
      .setTitle("Rinomina ticket")
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("rename_tail")
            .setLabel("Scrivi solo la parte finale del ticket")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(80),
        ),
      );
    await interaction.showModal(modal).catch(() => null);
    return true;
  }

  if (interaction.isButton?.() && cid === "ticket_panel_nav_closerequest") {
    const ticketDoc = await Ticket.findOne({ channelId: interaction.channel.id, open: true }, TICKET_READ_PROJECTION).lean().catch(() => null);
    if (!ticketDoc) {
      await safeReply(interaction, {
        embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Questo non è un canale ticket.")],
        flags: 1 << 6,
      });
      return true;
    }
    const claimerClose = String(ticketDoc.claimedBy || "").trim();
    const canRequestClose =
      (claimerClose && interaction.user.id === claimerClose) ||
      (HIGHSTAFF_ROLE_ID && interaction.member?.roles?.cache?.has(HIGHSTAFF_ROLE_ID));
    if (!canRequestClose) {
      await safeReply(interaction, {
        embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Solo chi ha claimato il ticket o l’**High Staff** può inviare la richiesta di chiusura.")],
        flags: 1 << 6,
      });
      return true;
    }
    const modal = new ModalBuilder()
      .setCustomId("modal_ticket_panel_closerequest")
      .setTitle("Richiedi Chiusura")
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("closerequest_reason")
            .setLabel("Motivo")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(1800),
        ),
      );
    await interaction.showModal(modal).catch(() => null);
    return true;
  }

  if (interaction.isButton?.() && cid === "ticket_panel_nav_transfer") {
    const ticketDocOpen = await Ticket.findOne({ channelId: interaction.channel.id, open: true }).catch(() => null);
    const openClaimer = String(ticketDocOpen?.claimedBy || "").trim();
    if (!openClaimer) {
      await safeReply(interaction, {
        embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Il ticket non è claimato.")],
        flags: 1 << 6,
      });
      return true;
    }
    const isClaimerOpen = interaction.user.id === openClaimer;
    const isHighOpen = HIGHSTAFF_ROLE_ID && interaction.member?.roles?.cache?.has(HIGHSTAFF_ROLE_ID);
    if (!isClaimerOpen && !isHighOpen) {
      await safeReply(interaction, {
        embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Solo chi ha claimato o l’**High Staff** può trasferire il claim.")],
        flags: 1 << 6,
      });
      return true;
    }
    const intro = buildTransferPickerEmbed(ticketDocOpen.ticketType);
    const transferRow = new ActionRowBuilder().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId(withTicketPanelMessageCustomId(TICKET_PANEL_TRANSFER_USER_PREFIX, interaction.message?.id))
        .setPlaceholder("Scegli un utente…")
        .setMinValues(1)
        .setMaxValues(1),
    );
    await interaction.reply({
      embeds: [intro],
      components: [transferRow],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (
    interaction.isUserSelectMenu?.() &&
    (cid === TICKET_PANEL_ADD_MEMBER_PREFIX || cid.startsWith(`${TICKET_PANEL_ADD_MEMBER_PREFIX}:`))
  ) {
    if (!hasStaffTicketRole(interaction.member)) {
      await safeReply(interaction, {
        embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Non hai permesso di aggiungere utenti.")],
        flags: 1 << 6,
      });
      return true;
    }
    const ticketDoc = await Ticket.findOne({ channelId: interaction.channel.id, open: true }).catch(() => null);
    if (!ticketDoc) {
      await safeReply(interaction, {
        embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Ticket non trovato o non aperto.")],
        flags: 1 << 6,
      });
      return true;
    }
    const userId = interaction.values?.[0];
    if (!userId) {
      await safeReply(interaction, {
        embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Selezione non valida.")],
        flags: 1 << 6,
      });
      return true;
    }
    const targetMember = await getGuildMemberCached(interaction.guild, userId).catch(() => null);
    if (!targetMember || targetMember.user?.bot) {
      await safeReply(interaction, {
        embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Utente non valido o bot.")],
        flags: 1 << 6,
      });
      return true;
    }
    await interaction.channel.permissionOverwrites.edit(userId, {
      ViewChannel: true,
      SendMessages: true,
    });
    await interaction.reply({
      embeds: [
        makeError(
          "Aggiungi",
          `<:vegacheckmark:1443666279058772028> <@${userId}> è stato aggiunto al ticket.`,
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    const addPanelMid = parseTicketPanelMessageIdFromCustomId(cid, TICKET_PANEL_ADD_MEMBER_PREFIX);
    if (addPanelMid) await deletePlusTicketStaffPanelById(interaction.channel, addPanelMid);
    return true;
  }

  if (
    interaction.isUserSelectMenu?.() &&
    (cid === TICKET_PANEL_TRANSFER_USER_PREFIX || cid.startsWith(`${TICKET_PANEL_TRANSFER_USER_PREFIX}:`))
  ) {
    const ticketDocXfer = await Ticket.findOne({ channelId: interaction.channel.id, open: true }).catch(() => null);
    const xferClaimer = String(ticketDocXfer?.claimedBy || "").trim();
    if (!xferClaimer) {
      await safeReply(interaction, {
        embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Il ticket non è claimato.")],
        flags: 1 << 6,
      });
      return true;
    }
    const isClaimerXfer = interaction.user.id === xferClaimer;
    const isHighXfer = HIGHSTAFF_ROLE_ID && interaction.member?.roles?.cache?.has(HIGHSTAFF_ROLE_ID);
    if (!isClaimerXfer && !isHighXfer) {
      await safeReply(interaction, {
        embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Solo chi ha claimato o l’**High Staff** può trasferire il claim.")],
        flags: 1 << 6,
      });
      return true;
    }
    const targetUserId = interaction.values?.[0];
    if (!targetUserId) {
      await safeReply(interaction, {
        embeds: [makeErrorEmbed("Errore", "<:vegax:1443934876440068179> Selezione non valida.")],
        flags: 1 << 6,
      });
      return true;
    }
    const targetMember = await getGuildMemberCached(interaction.guild, targetUserId);
    if (!targetMember) {
      await safeReply(interaction, {
        embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Utente non nel server.")],
        flags: 1 << 6,
      });
      return true;
    }
    if (targetMember.user?.bot) {
      await safeReply(interaction, {
        embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Non puoi assegnare il claim a un bot.")],
        flags: 1 << 6,
      });
      return true;
    }
    if (!ticketModule.canClaimTicket(targetMember, ticketDocXfer.ticketType, interaction.guild?.id)) {
      await safeReply(interaction, {
        embeds: [
          makeErrorEmbed(
            "<a:VC_Alert:1482706673176150077> Errore",
            "<:vegax:1443934876440068179> L’utente non ha il ruolo richiesto per gestire **questo** tipo di ticket (supporto → Staff/High Staff, partnership → Partner Manager/High Staff, high → High Staff).",
          ),
        ],
        flags: 1 << 6,
      });
      return true;
    }
    if (targetUserId === ticketDocXfer.userId || targetUserId === xferClaimer) {
      await safeReply(interaction, {
        embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Scelta non valida per il transfer.")],
        flags: 1 << 6,
      });
      return true;
    }
    const oldClaimerId = xferClaimer;
    const transferResult = await Ticket.updateOne(
      {
        _id: ticketDocXfer._id,
        open: true,
        claimedBy: oldClaimerId,
      },
      { $set: { claimedBy: targetUserId } },
    ).catch(() => null);
    if (!transferResult || Number(transferResult.modifiedCount || 0) < 1) {
      await safeReply(interaction, {
        embeds: [
          makeErrorEmbed(
            "<a:VC_Alert:1482706673176150077> Errore",
            "<:vegax:1443934876440068179> Claim non aggiornato: ticket modificato da un'altra azione. Riprova.",
          ),
        ],
        flags: 1 << 6,
      });
      return true;
    }
    await interaction.channel.permissionOverwrites.delete(oldClaimerId).catch(() => {});
    await interaction.channel.permissionOverwrites.edit(targetUserId, {
      ViewChannel: true,
      SendMessages: true,
    });
    const msg = await interaction.channel.messages.fetch(ticketDocXfer.messageId).catch(() => null);
    if (msg) {
      const updatedEmbed = msg.embeds?.[0] ? EmbedBuilder.from(msg.embeds[0]) : new EmbedBuilder().setColor("#6f4e37");
      const updatedButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("close_ticket").setEmoji("<:VC_Lock:1482526739044368476>").setLabel("Chiudi").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("close_ticket_motivo").setEmoji("<:VC_reason:1478517122929004544>").setLabel("Chiudi Con Motivo").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("unclaim").setEmoji("<a:VC_Unlock:1482532082466029608>").setLabel("Unclaim").setStyle(ButtonStyle.Secondary),
      );
      await msg.edit({ embeds: [updatedEmbed], components: [updatedButtons] }).catch(() => {});
    }
    await interaction.reply({
      embeds: [
        makeError(
          "Claim trasferito",
          `<:VC_claim:1478517202016669887> Ticket assegnato a <@${targetUserId}> (prima: <@${oldClaimerId}>).`,
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    const xferPanelMid = parseTicketPanelMessageIdFromCustomId(cid, TICKET_PANEL_TRANSFER_USER_PREFIX);
    if (xferPanelMid) await deletePlusTicketStaffPanelById(interaction.channel, xferPanelMid);
    return true;
  }

  if (interaction.isStringSelectMenu?.()) {
    if (cid === "ticket_panel_reopen_pick") {
      const isHigh = HIGHSTAFF_ROLE_ID && interaction.member?.roles?.cache?.has(HIGHSTAFF_ROLE_ID);
      if (!isHigh) {
        await safeReply(interaction, {
          embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Solo l’**High Staff** può riaprire ticket.")],
          flags: 1 << 6,
        });
        return true;
      }
      const ticketNumber = Number(interaction.values?.[0]);
      if (!Number.isInteger(ticketNumber) || ticketNumber <= 0) {
        await safeReply(interaction, {
          embeds: [makeErrorEmbed("Errore", "<:vegax:1443934876440068179> Selezione non valida.")],
          flags: 1 << 6,
        });
        return true;
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const proxy = createInteractionMessageProxy(interaction);
      const reopened = await ticketModule.ticketReopenByNumber(
        { guild: interaction.guild, reply: (p) => proxy.reply(p) },
        ticketNumber,
      );
      if (reopened) await deletePlusTicketCommandAndPanelMessages(interaction);
      return true;
    }

    const ticketDoc = await Ticket.findOne({ channelId: interaction.channel.id, open: true }).catch(() => null);
    if (!ticketDoc) {
      await safeReply(interaction, {
        embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Ticket non trovato o non aperto.")],
        flags: 1 << 6,
      });
      return true;
    }

    if (cid === TICKET_PANEL_REMOVE_MEMBER_PREFIX || cid.startsWith(`${TICKET_PANEL_REMOVE_MEMBER_PREFIX}:`)) {
      if (!hasStaffTicketRole(interaction.member)) {
        await safeReply(interaction, {
          embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Non hai permesso di rimuovere utenti.")],
          flags: 1 << 6,
        });
        return true;
      }
      const userId = interaction.values[0];
      await interaction.channel.permissionOverwrites.edit(userId, {
        ViewChannel: false,
        SendMessages: false,
      });
      await interaction.reply({
        embeds: [
          makeError(
            "Rimuovi",
            `<:vegacheckmark:1443666279058772028> <@${userId}> è stato rimosso dal ticket.`,
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      const remPanelMid = parseTicketPanelMessageIdFromCustomId(cid, TICKET_PANEL_REMOVE_MEMBER_PREFIX);
      if (remPanelMid) await deletePlusTicketStaffPanelById(interaction.channel, remPanelMid);
      return true;
    }

    if (cid === TICKET_PANEL_SWITCH_CATEGORY_PREFIX || cid.startsWith(`${TICKET_PANEL_SWITCH_CATEGORY_PREFIX}:`)) {
      if (!HIGHSTAFF_ROLE_ID || !interaction.member?.roles?.cache?.has(HIGHSTAFF_ROLE_ID)) {
        await safeReply(interaction, {
          embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Solo l’**High Staff** può cambiare categoria.")],
          flags: 1 << 6,
        });
        return true;
      }
      const categoryToken = String(interaction.values[0] || "").toLowerCase();
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const proxy = createInteractionMessageProxy(interaction);
      const switched = await ticketModule.ticketSwitchPanelExecute(proxy, categoryToken);
      if (switched) {
        const swPanelMid = parseTicketPanelMessageIdFromCustomId(cid, TICKET_PANEL_SWITCH_CATEGORY_PREFIX);
        if (swPanelMid) await deletePlusTicketStaffPanelById(interaction.channel, swPanelMid);
      }
      return true;
    }
  }

  if (interaction.isModalSubmit?.()) {
    if (cid === "modal_ticket_panel_rename") {
      if (!HIGHSTAFF_ROLE_ID || !interaction.member?.roles?.cache?.has(HIGHSTAFF_ROLE_ID)) {
        await safeReply(interaction, {
          embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Permesso negato.")],
          flags: 1 << 6,
        });
        return true;
      }
      const activeTicketInChannel = await Ticket.findOne({ channelId: interaction.channel.id, open: true }).lean().catch(() => null);
      const rawNewName = String(interaction.fields.getTextInputValue("rename_tail") || "").trim();
      if (!rawNewName) {
        await safeReply(interaction, {
          embeds: [makeErrorEmbed("Errore", "<:vegax:1443934876440068179> Inserisci un nome valido.")],
          flags: 1 << 6,
        });
        return true;
      }
      const currentName = String(interaction.channel.name || "");
      const ticketPrefix = resolveTicketRenamePrefix(
        currentName,
        null,
        getTicketPanelConfig(activeTicketInChannel?.ticketType) || getTicketPanelConfig("supporto"),
      );
      if (!ticketPrefix) {
        await safeReply(interaction, {
          embeds: [makeErrorEmbed("Errore", "<:vegax:1443934876440068179> Prefisso canale non valido.")],
          flags: 1 << 6,
        });
        return true;
      }
      const words = rawNewName
        .replace(/-/g, " ")
        .split(/\s+/)
        .map((word) => word.replace(/[\/\\#@:`*?"<>|]/g, "").trim())
        .filter(Boolean);
      const normalizedTail = sanitizeTicketChannelTail(words.join(" "), "");
      if (!normalizedTail) {
        await safeReply(interaction, {
          embeds: [makeErrorEmbed("Errore", "<:vegax:1443934876440068179> Il nuovo nome non è valido.")],
          flags: 1 << 6,
        });
        return true;
      }
      const newName = `${ticketPrefix}${normalizedTail}`.slice(0, 100);
      if (newName === currentName) {
        await safeReply(interaction, {
          embeds: [makeErrorEmbed("Info", "<:VC_Attention:1482534443632558151> Il canale ha già questo nome.")],
          flags: 1 << 6,
        });
        return true;
      }
      const renamed = await interaction.channel.setName(newName).catch(() => null);
      if (!renamed) {
        await safeReply(interaction, {
          embeds: [makeErrorEmbed("Errore", "<:vegax:1443934876440068179> Impossibile rinominare.")],
          flags: 1 << 6,
        });
        return true;
      }
      await safeReply(interaction, {
        embeds: [
          new EmbedBuilder()
            .setColor("#6f4e37")
            .setTitle("Rinomina Ticket")
            .setDescription(`<:vegacheckmark:1443666279058772028> Canale rinominato in \`${newName}\``),
        ],
        flags: 1 << 6,
      });
      await deletePlusTicketCommandAndPanelMessages(interaction);
      return true;
    }

    if (cid === "modal_ticket_panel_closerequest") {
      const ticketDoc = await Ticket.findOne({ channelId: interaction.channel.id, open: true }, TICKET_READ_PROJECTION).lean().catch(() => null);
      if (!ticketDoc) {
        await safeReply(interaction, {
          embeds: [makeErrorEmbed("Errore", "<:vegax:1443934876440068179> Ticket non trovato.")],
          flags: 1 << 6,
        });
        return true;
      }
      const crClaimer = String(ticketDoc.claimedBy || "").trim();
      const canRequestClose =
        (crClaimer && interaction.user.id === crClaimer) ||
        (HIGHSTAFF_ROLE_ID && interaction.member?.roles?.cache?.has(HIGHSTAFF_ROLE_ID));
      if (!canRequestClose) {
        await safeReply(interaction, {
          embeds: [makeErrorEmbed("Errore", "<:vegax:1443934876440068179> Non autorizzato.")],
          flags: 1 << 6,
        });
        return true;
      }
      const reason = String(interaction.fields.getTextInputValue("closerequest_reason") || "").trim();
      await Ticket.updateOne(
        { channelId: interaction.channel.id, open: true },
        {
          $set: {
            closeReason: reason || null,
            closeRequestedBy: interaction.user.id,
            closeRequestedAt: new Date(),
          },
        },
      ).catch(() => {});
      const closeButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("accetta").setEmoji("<:vegacheckmark:1443666279058772028>").setLabel("Accetta e chiudi").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("rifiuta").setEmoji("<:vegax:1443934876440068179>").setLabel("Rifiuta e mantieni aperto").setStyle(ButtonStyle.Secondary),
      );
      await interaction.channel.send({
        content: `<@${ticketDoc.userId}>`,
        embeds: [
          new EmbedBuilder()
            .setTitle("Richiesta di chiusura")
            .setDescription(
              `${interaction.user} ha richiesto di chiudere questo ticket.\nMotivo:\n\`\`\`${reason || "Nessun motivo inserito"}\`\`\``,
            )
            .setColor("#6f4e37"),
        ],
        components: [closeButton],
      });
      await safeReply(interaction, {
        embeds: [new EmbedBuilder().setColor("#6f4e37").setDescription("<:vegacheckmark:1443666279058772028> Richiesta inviata.")],
        flags: 1 << 6,
      });
      await deletePlusTicketCommandAndPanelMessages(interaction);
      return true;
    }
  }

  return false;
}

module.exports = { handleTicketStaffPanelInteraction };