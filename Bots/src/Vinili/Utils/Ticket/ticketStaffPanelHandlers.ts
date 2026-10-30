const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, UserSelectMenuBuilder, StringSelectMenuBuilder } = require("discord.js") as typeof import("discord.js");
const Ticket = require("../../Schemas/Ticket/ticketSchema");
const IDs = require("../Config/ids") as typeof import("../Config/ids");
const { getGuildMemberCached } = require("../Interaction/interactionEntityCache") as typeof import("../Interaction/interactionEntityCache");
const { getTicketPanelConfig } = require("./ticketPanelConfig") as typeof import("./ticketPanelConfig");
const { resolveTicketRenamePrefix, sanitizeTicketChannelTail } = require("./ticketNamingRuntime") as typeof import("./ticketNamingRuntime");
const {
  isTicketOpenedByMember,
  memberCanActAsTicketStaff,
  memberCanActAsTicketHighStaff,
  buildTicketReopenOutsidePanelPayload,
  fetchClosedTicketsOrdered,
  buildRemoveMemberOptions,
} = require("./ticketStaffPanelBuild") as typeof import("./ticketStaffPanelBuild");
const {
  readTicketReopenOutsideSession,
  updateTicketReopenOutsideSession,
  forgetTicketReopenOutsideSession,
} = require("./ticketReopenOutsideSession") as typeof import("./ticketReopenOutsideSession");
const ticketModule = require("./ticketStaffRuntime") as typeof import("./ticketStaffRuntime");
const { editTicketMemberOverwrite } = require("./ticketHighStaffOverwrites") as typeof import("./ticketHighStaffOverwrites");
const {
  parseTicketPanelMessageIdFromCustomId,
  withTicketPanelMessageCustomId,
  TICKET_PANEL_ADD_MEMBER_PREFIX,
  TICKET_PANEL_REMOVE_MEMBER_PREFIX,
  TICKET_PANEL_SWITCH_CATEGORY_PREFIX,
  TICKET_PANEL_TRANSFER_USER_PREFIX,
} = require("./ticketInteractionRuntime") as typeof import("./ticketInteractionRuntime");
const {
  panelSelectFollowUp,
  beginPanelSelectDefer,
} = require("../../../shared/discord/panelSelectMenuRuntime") as typeof import("../../../shared/discord/panelSelectMenuRuntime");
const { registerTicketMemberPrompt } = require("./ticketMemberPrompt") as typeof import("./ticketMemberPrompt");
const HIGHSTAFF_ROLE_ID = IDs.roles.HighStaff;
const TICKET_READ_PROJECTION = { _id: 1, channelId: 1, open: 1, userId: 1, claimedBy: 1, guildId: 1, ticketNumber: 1, ticketType: 1 };

function buildTransferPickerEmbed(ticketType?) {
  const t = String(ticketType || "").toLowerCase();
  let rolesLine = "**Supporto:** Staff.";
  if (t === "partnership") rolesLine = "**Partnership:** Partner Manager.";
  else if (t === "high") rolesLine = "**High Staff:** solo High Staff.";
  else if (t === "perks") rolesLine = "**Perks:** Senior Moderator, Director o High Staff.";
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("🔀 Trasferisci claim")
    .setDescription(
      `${rolesLine}\n\nCerca e seleziona un membro idoneo. Non sono ammessi bot, l’apertore del ticket né l’attuale claimant.`,
    );
}

function makeError(title?, description?) {
  return new EmbedBuilder().setTitle(title).setDescription(description).setColor("#6f4e37");
}

const OPENER_STAFF_ACTION_DENY =
  "<:vegax:1443934876440068179> Non puoi usare i pulsanti staff sul ticket che hai aperto tu.";

async function denyIfTicketOpener(interaction, ticketDoc, { safeReply, makeErrorEmbed }) {
  if (!isTicketOpenedByMember(ticketDoc, interaction.user?.id)) return false;
  await safeReply(interaction, {
    embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", OPENER_STAFF_ACTION_DENY)],
    flags: 1 << 6,
  });
  return true;
}

function createInteractionMessageProxy(interaction?, options: Record<string, any> = {}) {
  const forceEphemeral = Boolean(options?.ephemeral);
  const followUpOnly = Boolean(options?.followUpOnly);
  return {
    channel: interaction.channel,
    guild: interaction.guild,
    client: interaction.client,
    member: interaction.member,
    author: interaction.user,
    reply: async (payload?) => {
      let p = { ...payload };
      if (forceEphemeral) {
        const baseFlags = Number(payload?.flags) || 0;
        p = { ...p, flags: baseFlags | MessageFlags.Ephemeral };
      }
      if (followUpOnly || interaction.deferred || interaction.replied) {
        return interaction.followUp(p);
      }
      return interaction.reply(p);
    },
  };
}

async function rebuildReopenPickComponents(interaction?) {
  const mid = interaction.message?.id;
  const session = readTicketReopenOutsideSession(interaction.client, mid);
  if (!session) return [];
  const allDocs = await fetchClosedTicketsOrdered(session.guildId);
  const panel = await buildTicketReopenOutsidePanelPayload(interaction.guild, allDocs, {
    page: session.page,
    filterQuery: session.filterQuery,
  });
  return panel.components || [];
}

function rebuildSwitchCategoryComponents(interaction?) {
  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(withTicketPanelMessageCustomId(TICKET_PANEL_SWITCH_CATEGORY_PREFIX, interaction.message?.id))
        .setPlaceholder("🔄 Cambia categoria…")
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
          { label: "SUPPORTO", value: "supporto", description: "SUPPORTO" },
          { label: "PARTNERSHIP", value: "partnership", description: "PARTNERSHIP" },
          { label: "HIGH STAFF", value: "highstaff", description: "HIGH STAFF" },
          { label: "PERKS", value: "perks", description: "PERKS" },
        ),
    ),
  ];
}

function rebuildAddMemberComponents(interaction?) {
  return [
    new ActionRowBuilder().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId(withTicketPanelMessageCustomId(TICKET_PANEL_ADD_MEMBER_PREFIX, interaction.message?.id))
        .setPlaceholder("Scegli un utente…")
        .setMinValues(1)
        .setMaxValues(1),
    ),
  ];
}

function rebuildTransferUserComponents(interaction?) {
  return [
    new ActionRowBuilder().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId(withTicketPanelMessageCustomId(TICKET_PANEL_TRANSFER_USER_PREFIX, interaction.message?.id))
        .setPlaceholder("Scegli un utente…")
        .setMinValues(1)
        .setMaxValues(1),
    ),
  ];
}

function rebuildRemoveMemberComponents(interaction?) {
  const opts = buildRemoveMemberOptions(interaction.channel);
  if (!opts.length) return [];
  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(interaction.customId)
        .setPlaceholder("Rimuovi utente…")
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(opts),
    ),
  ];
}

function messageIsPlusTicketStaffPanel(message?) {
  if (!message?.components?.length) return false;
  for (const row of message.components) {
    for (const c of row.components || []) {
      const id = String(c.customId || "");
      if (
        id.startsWith("ticket_panel_nav_") ||
        id === "ticket_panel_reopen_pick" ||
        id === "ticket_panel_reopen_search" ||
        id === "ticket_panel_reopen_prev" ||
        id === "ticket_panel_reopen_next" ||
        id === "ticket_panel_reopen_close"
      )
        return true;
    }
  }
  return false;
}

async function deletePlusTicketCommandAndPanelMessages(interaction?) {
  const panelMsg = interaction.message;
  if (!panelMsg?.channel?.messages?.fetch) return;
  if (!messageIsPlusTicketStaffPanel(panelMsg)) return;
  const channel = panelMsg.channel;
  const session = readTicketReopenOutsideSession(interaction.client, panelMsg.id);
  const refId = session?.commandMessageId || panelMsg.reference?.messageId;
  await panelMsg.delete().catch(() => {});
  forgetTicketReopenOutsideSession(interaction.client, panelMsg.id);
  if (!refId) return;
  const cmdMsg = await channel.messages.fetch(refId).catch(() => null);
  if (cmdMsg && !cmdMsg.author?.bot) await cmdMsg.delete().catch(() => {});
}

async function deletePlusTicketStaffPanelById(channel?, panelMessageId?) {
  if (!channel?.messages?.fetch || !panelMessageId) return;
  const panelMsg = await channel.messages.fetch(panelMessageId).catch(() => null);
  if (!panelMsg || !messageIsPlusTicketStaffPanel(panelMsg)) return;
  const refId = panelMsg.reference?.messageId;
  await panelMsg.delete().catch(() => {});
  if (!refId) return;
  const cmdMsg = await channel.messages.fetch(refId).catch(() => null);
  if (cmdMsg && !cmdMsg.author?.bot) await cmdMsg.delete().catch(() => {});
}

async function handleTicketStaffPanelInteraction(interaction?, helpers: Record<string, any> = {}) {
  const { safeReply } = helpers;
  const makeErrorEmbed =
    typeof helpers.makeErrorEmbed === "function"
      ? helpers.makeErrorEmbed
      : require("./ticketUxMessages").makeTicketErrorEmbed;
  const cid = String(interaction.customId || "");
  const isPanel =
    cid.startsWith("ticket_panel_") || cid.startsWith("modal_ticket_panel");
  if (!isPanel) return false;

  if (interaction.isButton?.() && (cid === "ticket_panel_reopen_search" || cid === "ticket_panel_reopen_prev" || cid === "ticket_panel_reopen_next" || cid === "ticket_panel_reopen_close")) {
    const isHigh = HIGHSTAFF_ROLE_ID && interaction.member?.roles?.cache?.has(HIGHSTAFF_ROLE_ID);
    if (!isHigh) {
      await safeReply(interaction, {
        embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Solo l’**High Staff** può usare questo pannello.")],
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    const mid = interaction.message?.id;
    const session = readTicketReopenOutsideSession(interaction.client, mid);
    if (!session || String(session.authorId) !== String(interaction.user.id)) {
      await safeReply(interaction, {
        embeds: [
          makeErrorEmbed(
            "<a:VC_Alert:1482706673176150077> Errore",
            "<:vegax:1443934876440068179> Questo pannello non è tuo o è scaduto. Rilancia **`+ticket`** fuori da un ticket.",
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    if (cid === "ticket_panel_reopen_close") {
      await interaction.deferUpdate().catch(() => null);
      await deletePlusTicketCommandAndPanelMessages(interaction);
      return true;
    }
    if (cid === "ticket_panel_reopen_search") {
      const modal = new ModalBuilder()
        .setCustomId("modal_ticket_panel_reopen_search")
        .setTitle("Cerca tra i ticket chiusi")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("reopen_search_q")
              .setLabel("Numero (#42), ID, menzione o parte del nome")
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setMaxLength(100),
          ),
        );
      await interaction.showModal(modal).catch(() => null);
      return true;
    }
    const delta = cid === "ticket_panel_reopen_prev" ? -1 : 1;
    const nextPage = Math.max(0, Number(session.page) + delta);
    updateTicketReopenOutsideSession(interaction.client, mid, { page: nextPage });
    const merged = readTicketReopenOutsideSession(interaction.client, mid);
    if (!merged) return true;
    const allDocs = await fetchClosedTicketsOrdered(merged.guildId);
    const panel = await buildTicketReopenOutsidePanelPayload(interaction.guild, allDocs, {
      page: merged.page,
      filterQuery: merged.filterQuery,
    });
    updateTicketReopenOutsideSession(interaction.client, mid, { page: panel.meta?.page ?? merged.page });
    await interaction.update({ embeds: [panel.embed], components: panel.components }).catch(() => null);
    return true;
  }

  if (interaction.isButton?.() && cid === "ticket_panel_nav_add") {
    const ticketDocNav = await Ticket.findOne({ channelId: interaction.channel.id, open: true }, TICKET_READ_PROJECTION).lean().catch(() => null);
    if (await denyIfTicketOpener(interaction, ticketDocNav, { safeReply, makeErrorEmbed })) return true;
    if (!memberCanActAsTicketStaff(interaction.member, ticketDocNav)) {
      await safeReply(interaction, {
        embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Non hai permesso di aggiungere utenti al ticket.")],
        flags: 1 << 6,
      });
      return true;
    }
    registerTicketMemberPrompt(interaction, { type: "ticket_add" });
    await interaction.reply({
      content: "✏️ Menziona l'utente da aggiungere al ticket.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (interaction.isButton?.() && cid === "ticket_panel_nav_remove") {
    const ticketDocNav = await Ticket.findOne({ channelId: interaction.channel.id, open: true }, TICKET_READ_PROJECTION).lean().catch(() => null);
    if (await denyIfTicketOpener(interaction, ticketDocNav, { safeReply, makeErrorEmbed })) return true;
    if (!memberCanActAsTicketStaff(interaction.member, ticketDocNav)) {
      await safeReply(interaction, {
        embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Non hai permesso di rimuovere utenti dal ticket.")],
        flags: 1 << 6,
      });
      return true;
    }
    registerTicketMemberPrompt(interaction, { type: "ticket_remove" });
    await interaction.reply({
      content: "✏️ Menziona l'utente da rimuovere dal ticket.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (interaction.isButton?.() && cid === "ticket_panel_nav_switch") {
    const ticketDocSwitch = await Ticket.findOne({ channelId: interaction.channel.id, open: true }, TICKET_READ_PROJECTION).lean().catch(() => null);
    if (await denyIfTicketOpener(interaction, ticketDocSwitch, { safeReply, makeErrorEmbed })) return true;
    if (!memberCanActAsTicketHighStaff(interaction.member, ticketDocSwitch)) {
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
          { label: "PERKS", value: "perks", description: "PERKS" },
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
    const ticketDocRename = await Ticket.findOne({ channelId: interaction.channel.id, open: true }, TICKET_READ_PROJECTION).lean().catch(() => null);
    if (await denyIfTicketOpener(interaction, ticketDocRename, { safeReply, makeErrorEmbed })) return true;
    if (!memberCanActAsTicketHighStaff(interaction.member, ticketDocRename)) {
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
    if (await denyIfTicketOpener(interaction, ticketDoc, { safeReply, makeErrorEmbed })) return true;
    const claimerClose = String(ticketDoc.claimedBy || "").trim();
    const canRequestClose =
      (claimerClose && interaction.user.id === claimerClose) ||
      memberCanActAsTicketHighStaff(interaction.member, ticketDoc);
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
    if (await denyIfTicketOpener(interaction, ticketDocOpen, { safeReply, makeErrorEmbed })) return true;
    const openClaimer = String(ticketDocOpen?.claimedBy || "").trim();
    if (!openClaimer) {
      await safeReply(interaction, {
        embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Il ticket non è claimato.")],
        flags: 1 << 6,
      });
      return true;
    }
    const isClaimerOpen = interaction.user.id === openClaimer;
    const isHighOpen = memberCanActAsTicketHighStaff(interaction.member, ticketDocOpen);
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
    const ticketDoc = await Ticket.findOne({ channelId: interaction.channel.id, open: true }).catch(() => null);
    if (!ticketDoc) {
      await safeReply(interaction, {
        embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Ticket non trovato o non aperto.")],
        flags: 1 << 6,
      });
      return true;
    }
    if (!memberCanActAsTicketStaff(interaction.member, ticketDoc)) {
      await panelSelectFollowUp(
        interaction,
        rebuildAddMemberComponents,
        {
          embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Non hai permesso di aggiungere utenti.")],
        },
      );
      return true;
    }
    const userId = interaction.values?.[0];
    if (!userId) {
      await panelSelectFollowUp(
        interaction,
        rebuildAddMemberComponents,
        { embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Selezione non valida.")] },
      );
      return true;
    }
    const targetMember = await getGuildMemberCached(interaction.guild, userId).catch(() => null);
    if (!targetMember || targetMember.user?.bot) {
      await panelSelectFollowUp(
        interaction,
        rebuildAddMemberComponents,
        { embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Utente non valido o bot.")] },
      );
      return true;
    }
    await editTicketMemberOverwrite(interaction.channel, userId, {
      ViewChannel: true,
      SendMessages: true,
      UseApplicationCommands: true,
    });
    await panelSelectFollowUp(interaction, rebuildAddMemberComponents, {
      embeds: [
        makeError(
          "Aggiungi",
          `<:vegacheckmark:1443666279058772028> <@${userId}> è stato aggiunto al ticket.`,
        ),
      ],
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
    if (isTicketOpenedByMember(ticketDocXfer, interaction.user?.id)) {
      await panelSelectFollowUp(
        interaction,
        rebuildTransferUserComponents,
        { embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", OPENER_STAFF_ACTION_DENY)] },
      );
      return true;
    }
    const xferClaimer = String(ticketDocXfer?.claimedBy || "").trim();
    if (!xferClaimer) {
      await panelSelectFollowUp(
        interaction,
        rebuildTransferUserComponents,
        { embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Il ticket non è claimato.")] },
      );
      return true;
    }
    const isClaimerXfer = interaction.user.id === xferClaimer;
    const isHighXfer = memberCanActAsTicketHighStaff(interaction.member, ticketDocXfer);
    if (!isClaimerXfer && !isHighXfer) {
      await panelSelectFollowUp(
        interaction,
        rebuildTransferUserComponents,
        {
          embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Solo chi ha claimato o l’**High Staff** può trasferire il claim.")],
        },
      );
      return true;
    }
    const targetUserId = interaction.values?.[0];
    if (!targetUserId) {
      await panelSelectFollowUp(
        interaction,
        rebuildTransferUserComponents,
        { embeds: [makeErrorEmbed("Errore", "<:vegax:1443934876440068179> Selezione non valida.")] },
      );
      return true;
    }
    const targetMember = await getGuildMemberCached(interaction.guild, targetUserId);
    if (!targetMember) {
      await panelSelectFollowUp(
        interaction,
        rebuildTransferUserComponents,
        { embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Utente non nel server.")] },
      );
      return true;
    }
    if (targetMember.user?.bot) {
      await panelSelectFollowUp(
        interaction,
        rebuildTransferUserComponents,
        { embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Non puoi assegnare il claim a un bot.")] },
      );
      return true;
    }
    if (!ticketModule.canClaimTicket(targetMember, ticketDocXfer.ticketType, interaction.guild?.id)) {
      await panelSelectFollowUp(
        interaction,
        rebuildTransferUserComponents,
        {
          embeds: [
            makeErrorEmbed(
              "<a:VC_Alert:1482706673176150077> Errore",
              "<:vegax:1443934876440068179> L’utente non ha il ruolo richiesto per gestire **questo** tipo di ticket (supporto → Staff/High Staff, partnership → Partner Manager/Resoconti PM/High Staff, high → High Staff).",
            ),
          ],
        },
      );
      return true;
    }
    if (targetUserId === ticketDocXfer.userId || targetUserId === xferClaimer) {
      await panelSelectFollowUp(
        interaction,
        rebuildTransferUserComponents,
        { embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Scelta non valida per il transfer.")] },
      );
      return true;
    }
    await beginPanelSelectDefer(interaction, rebuildTransferUserComponents);
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
      await interaction.editReply({
        embeds: [
          makeErrorEmbed(
            "<a:VC_Alert:1482706673176150077> Errore",
            "<:vegax:1443934876440068179> Claim non aggiornato: ticket modificato da un'altra azione. Riprova.",
          ),
        ],
      }).catch(() => null);
      return true;
    }
    await interaction.channel.permissionOverwrites.delete(oldClaimerId).catch(() => {});
    await editTicketMemberOverwrite(interaction.channel, targetUserId, {
      ViewChannel: true,
      SendMessages: true,
      UseApplicationCommands: true,
    });
    const msg = await interaction.channel.messages.fetch(ticketDocXfer.messageId).catch(() => null);
    if (msg) {
      const updatedEmbed = msg.embeds?.[0] ? EmbedBuilder.from(msg.embeds[0]) : new EmbedBuilder().setColor("#6f4e37");
      let { buildClaimedControlButtons, resolveTicketPanel } = require("./ticketGuildOptions") as typeof import("./ticketGuildOptions");
      const claimPanel = resolveTicketPanel(interaction.guild.id, ticketDocXfer);
      const updatedButtons =
        buildClaimedControlButtons(interaction.guild.id, claimPanel) ||
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("close_ticket").setEmoji("🔒").setLabel("Chiudi").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId("close_ticket_motivo").setEmoji("🔒").setLabel("Chiudi Con Motivo").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId("unclaim").setEmoji("<a:VC_Unlock:1482532082466029608>").setLabel("Unclaim").setStyle(ButtonStyle.Secondary),
        );
      await msg.edit({ embeds: [updatedEmbed], components: [updatedButtons] }).catch(() => {});
    }
    await interaction.editReply({
      embeds: [
        makeError(
          "Claim trasferito",
          `<:VC_claim:1478517202016669887> Ticket assegnato a <@${targetUserId}> (prima: <@${oldClaimerId}>).`,
        ),
      ],
    }).catch(() => null);
    const xferPanelMid = parseTicketPanelMessageIdFromCustomId(cid, TICKET_PANEL_TRANSFER_USER_PREFIX);
    if (xferPanelMid) await deletePlusTicketStaffPanelById(interaction.channel, xferPanelMid);
    return true;
  }

  if (interaction.isStringSelectMenu?.()) {
    if (cid === "ticket_panel_reopen_pick") {
      const isHigh = HIGHSTAFF_ROLE_ID && interaction.member?.roles?.cache?.has(HIGHSTAFF_ROLE_ID);
      if (!isHigh) {
        await panelSelectFollowUp(
          interaction,
          rebuildReopenPickComponents,
          {
            embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Solo l’**High Staff** può riaprire ticket.")],
          },
        );
        return true;
      }
      const ticketNumber = Number(interaction.values?.[0]);
      if (!Number.isInteger(ticketNumber) || ticketNumber <= 0) {
        await panelSelectFollowUp(
          interaction,
          rebuildReopenPickComponents,
          { embeds: [makeErrorEmbed("Errore", "<:vegax:1443934876440068179> Selezione non valida.")] },
        );
        return true;
      }
      await beginPanelSelectDefer(interaction, rebuildReopenPickComponents, { flags: MessageFlags.Ephemeral });
      const proxy = createInteractionMessageProxy(interaction, { ephemeral: true, followUpOnly: true });
      const reopened = await ticketModule.ticketReopenByNumber(
        { guild: interaction.guild, reply: (p?) => proxy.reply(p) },
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
      if (!memberCanActAsTicketStaff(interaction.member, ticketDoc)) {
        await panelSelectFollowUp(
          interaction,
          rebuildRemoveMemberComponents,
          {
            embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Non hai permesso di rimuovere utenti.")],
          },
        );
        return true;
      }
      const userId = interaction.values[0];
      await editTicketMemberOverwrite(interaction.channel, userId, {
        ViewChannel: false,
        SendMessages: false,
      });
      await panelSelectFollowUp(interaction, rebuildRemoveMemberComponents, {
        embeds: [
          makeError(
            "Rimuovi",
            `<:vegacheckmark:1443666279058772028> <@${userId}> è stato rimosso dal ticket.`,
          ),
        ],
      });
      const remPanelMid = parseTicketPanelMessageIdFromCustomId(cid, TICKET_PANEL_REMOVE_MEMBER_PREFIX);
      if (remPanelMid) await deletePlusTicketStaffPanelById(interaction.channel, remPanelMid);
      return true;
    }

    if (cid === TICKET_PANEL_SWITCH_CATEGORY_PREFIX || cid.startsWith(`${TICKET_PANEL_SWITCH_CATEGORY_PREFIX}:`)) {
      if (!memberCanActAsTicketHighStaff(interaction.member, ticketDoc)) {
        await panelSelectFollowUp(
          interaction,
          rebuildSwitchCategoryComponents,
          {
            embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Solo l’**High Staff** può cambiare categoria.")],
          },
        );
        return true;
      }
      const categoryToken = String(interaction.values[0] || "").toLowerCase();
      await beginPanelSelectDefer(interaction, rebuildSwitchCategoryComponents);
      const proxy = createInteractionMessageProxy(interaction, { ephemeral: false, followUpOnly: true });
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
      const activeTicketInChannel = await Ticket.findOne({ channelId: interaction.channel.id, open: true }).lean().catch(() => null);
      if (await denyIfTicketOpener(interaction, activeTicketInChannel, { safeReply, makeErrorEmbed })) return true;
      if (!memberCanActAsTicketHighStaff(interaction.member, activeTicketInChannel)) {
        await safeReply(interaction, {
          embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Permesso negato.")],
          flags: 1 << 6,
        });
        return true;
      }
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
        .map((word?) => word.replace(/[\/\\#@:`*?"<>|]/g, "").trim())
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
      if (await denyIfTicketOpener(interaction, ticketDoc, { safeReply, makeErrorEmbed })) return true;
      const crClaimer = String(ticketDoc.claimedBy || "").trim();
      const canRequestClose =
        (crClaimer && interaction.user.id === crClaimer) ||
        memberCanActAsTicketHighStaff(interaction.member, ticketDoc);
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

    if (cid === "modal_ticket_panel_reopen_search") {
      if (!HIGHSTAFF_ROLE_ID || !interaction.member?.roles?.cache?.has(HIGHSTAFF_ROLE_ID)) {
        await safeReply(interaction, {
          embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Permesso negato.")],
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }
      const mid = interaction.message?.id;
      const session = readTicketReopenOutsideSession(interaction.client, mid);
      if (!session || String(session.authorId) !== String(interaction.user.id)) {
        await safeReply(interaction, {
          embeds: [
            makeErrorEmbed(
              "<a:VC_Alert:1482706673176150077> Errore",
              "<:vegax:1443934876440068179> Questo pannello non è tuo o è scaduto. Rilancia **`+ticket`** fuori da un ticket.",
            ),
          ],
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }
      const q = String(interaction.fields.getTextInputValue("reopen_search_q") || "").trim();
      updateTicketReopenOutsideSession(interaction.client, mid, { filterQuery: q, page: 0 });
      const merged = readTicketReopenOutsideSession(interaction.client, mid);
      if (!merged) return true;
      const allDocs = await fetchClosedTicketsOrdered(merged.guildId);
      const panel = await buildTicketReopenOutsidePanelPayload(interaction.guild, allDocs, {
        page: 0,
        filterQuery: merged.filterQuery,
      });
      updateTicketReopenOutsideSession(interaction.client, mid, { page: panel.meta?.page ?? 0 });
      await interaction.deferUpdate().catch(() => null);
      await interaction.message?.edit?.({ embeds: [panel.embed], components: panel.components }).catch(() => null);
      return true;
    }
  }

  return false;
}

export = { handleTicketStaffPanelInteraction };