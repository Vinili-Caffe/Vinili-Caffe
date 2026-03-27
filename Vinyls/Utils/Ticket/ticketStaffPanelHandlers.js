const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const Ticket = require("../../Schemas/Ticket/ticketSchema");
const IDs = require("../Config/ids");
const { getGuildMemberCached } = require("../Interaction/interactionEntityCache");
const { getTicketPanelConfig } = require("./ticketPanelConfig");
const { resolveTicketRenamePrefix, sanitizeTicketChannelTail } = require("./ticketNamingRuntime");
const { hasStaffTicketRole } = require("./ticketStaffPanelBuild");
const ticketModule = require("../../Prefix/Ticket/ticket");

const HIGHSTAFF_ROLE_ID = IDs.roles.HighStaff;
const TICKET_READ_PROJECTION = { _id: 1, channelId: 1, open: 1, userId: 1, claimedBy: 1, guildId: 1, ticketNumber: 1, ticketType: 1 };

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
      const p = { ...payload, ephemeral: true };
      if (replyCount === 1) {
        return interaction.editReply(p);
      }
      return interaction.followUp(p);
    },
  };
}

async function handleTicketStaffPanelInteraction(interaction, { safeReply, makeErrorEmbed }) {
  const cid = String(interaction.customId || "");
  const isPanel =
    cid.startsWith("ticket_panel_") || cid.startsWith("modal_ticket_panel");
  if (!isPanel) return false;

  if (interaction.isButton?.() && cid === "ticket_panel_rename") {
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
            .setLabel("Nuovo nome (solo parte finale, senza prefisso)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(80),
        ),
      );
    await interaction.showModal(modal).catch(() => {});
    return true;
  }

  if (interaction.isButton?.() && cid === "ticket_panel_closerequest") {
    const ticketDoc = await Ticket.findOne({ channelId: interaction.channel.id }, TICKET_READ_PROJECTION).lean().catch(() => null);
    if (!ticketDoc) {
      await safeReply(interaction, {
        embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Questo non è un canale ticket.")],
        flags: 1 << 6,
      });
      return true;
    }
    const canRequestClose =
      interaction.user.id === ticketDoc.claimedBy ||
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
      .setTitle("Richiesta chiusura")
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("closerequest_reason")
            .setLabel("Motivo (opzionale)")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(1800),
        ),
      );
    await interaction.showModal(modal).catch(() => {});
    return true;
  }

  if (interaction.isStringSelectMenu?.()) {
    if (cid === "ticket_panel_reopen_pick") {
      const isHigh = HIGHSTAFF_ROLE_ID && interaction.member?.roles?.cache?.has(HIGHSTAFF_ROLE_ID);
      const isSponsorStaffHere = interaction.guild?.id && ticketModule.hasSponsorStaffRole(interaction.member, interaction.guild.id);
      if (!isHigh && !isSponsorStaffHere) {
        await safeReply(interaction, {
          embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Solo l’**High Staff** (o staff sponsor autorizzato) può riaprire ticket.")],
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
      await interaction.deferReply({ ephemeral: true, flags: 64 });
      const proxy = createInteractionMessageProxy(interaction);
      await ticketModule.ticketReopenByNumber(
        { guild: interaction.guild, reply: (p) => proxy.reply(p) },
        ticketNumber,
      );
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

    if (cid === "ticket_panel_add_member") {
      if (!hasStaffTicketRole(interaction.member)) {
        await safeReply(interaction, {
          embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Non hai permesso di aggiungere utenti.")],
          flags: 1 << 6,
        });
        return true;
      }
      const userId = interaction.values[0];
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
        ephemeral: true,
      });
      return true;
    }

    if (cid === "ticket_panel_remove_member") {
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
        ephemeral: true,
      });
      return true;
    }

    if (cid === "ticket_panel_transfer_user") {
      if (!ticketDoc.claimedBy) {
        await safeReply(interaction, {
          embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Il ticket non è claimato.")],
          flags: 1 << 6,
        });
        return true;
      }
      const isClaimer = interaction.user.id === ticketDoc.claimedBy;
      const isHigh = HIGHSTAFF_ROLE_ID && interaction.member?.roles?.cache?.has(HIGHSTAFF_ROLE_ID);
      if (!isClaimer && !isHigh) {
        await safeReply(interaction, {
          embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Solo chi ha claimato o l’**High Staff** può trasferire il claim.")],
          flags: 1 << 6,
        });
        return true;
      }
      const targetUserId = interaction.values[0];
      const targetMember = await getGuildMemberCached(interaction.guild, targetUserId);
      if (!targetMember) {
        await safeReply(interaction, {
          embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Utente non nel server.")],
          flags: 1 << 6,
        });
        return true;
      }
      if (!ticketModule.canClaimTicket(targetMember, ticketDoc.ticketType, interaction.guild?.id)) {
        await safeReply(interaction, {
          embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> L’utente selezionato non può gestire questo tipo di ticket.")],
          flags: 1 << 6,
        });
        return true;
      }
      if (targetUserId === ticketDoc.userId || targetUserId === ticketDoc.claimedBy) {
        await safeReply(interaction, {
          embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Scelta non valida per il transfer.")],
          flags: 1 << 6,
        });
        return true;
      }
      const oldClaimerId = ticketDoc.claimedBy;
      ticketDoc.claimedBy = targetUserId;
      await ticketDoc.save();
      await interaction.channel.permissionOverwrites.delete(oldClaimerId).catch(() => {});
      await interaction.channel.permissionOverwrites.edit(targetUserId, {
        ViewChannel: true,
        SendMessages: true,
      });
      const msg = await interaction.channel.messages.fetch(ticketDoc.messageId).catch(() => null);
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
        ephemeral: true,
      });
      return true;
    }

    if (cid === "ticket_panel_switch_category") {
      if (!HIGHSTAFF_ROLE_ID || !interaction.member?.roles?.cache?.has(HIGHSTAFF_ROLE_ID)) {
        await safeReply(interaction, {
          embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Solo l’**High Staff** può cambiare categoria.")],
          flags: 1 << 6,
        });
        return true;
      }
      const categoryToken = String(interaction.values[0] || "").toLowerCase();
      await interaction.deferReply({ ephemeral: true, flags: 64 });
      const proxy = createInteractionMessageProxy(interaction);
      await ticketModule.ticketSwitchPanelExecute(proxy, categoryToken);
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
      return true;
    }

    if (cid === "modal_ticket_panel_closerequest") {
      const ticketDoc = await Ticket.findOne({ channelId: interaction.channel.id }, TICKET_READ_PROJECTION).lean().catch(() => null);
      if (!ticketDoc) {
        await safeReply(interaction, {
          embeds: [makeErrorEmbed("Errore", "<:vegax:1443934876440068179> Ticket non trovato.")],
          flags: 1 << 6,
        });
        return true;
      }
      const canRequestClose =
        interaction.user.id === ticketDoc.claimedBy ||
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
        { channelId: interaction.channel.id },
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
      return true;
    }
  }

  return false;
}

module.exports = { handleTicketStaffPanelInteraction };