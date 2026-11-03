const { EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js") as typeof import("discord.js");
const Ticket = require("../../Schemas/Ticket/ticketSchema");
const IDs = require("../Config/ids") as typeof import("../Config/ids");
const { createTicketsCategory } = require("./ticketOpenRuntime");
const { createTicketDocWithGlobalId, getNextTicketId } = require("./ticketIdUtils");
const {
  countOpenTicketsByUser: runtimeCountOpenTicketsByUser,
  findOpenTicketByUser: runtimeFindOpenTicketByUser,
} = require("./ticketInteractionRuntime");
const { buildTicketChannelName } = require("./ticketNamingRuntime");
const { getTicketPanelConfig } = require("./ticketPanelConfig");
const { partnerManagerRedeemButtonLabel, getPartnerRewardPointCost } = require("../Staff/partnerPointsUtils") as typeof import("../Staff/partnerPointsUtils");
const { ActivityUserProfile } = require("../../../../../../src/Vinili/Community/schemas/communitySchemas") as typeof import("../../../../../../src/Vinili/Community/schemas/communitySchemas");
const { resolvePartnerPointsShown } = require("../Staff/partnerPointsDisplayUtils") as typeof import("../Staff/partnerPointsDisplayUtils");
const {
  buildTicketEveryoneDenyViewCreateOverwrite,
  buildTicketOpenerCreateOverwrite,
  buildTicketRoleDenyViewCreateOverwrite,
  toTicketRoleCreateOverwrite,
} = require("./ticketHighStaffOverwrites");
const TICKET_PERMISSIONS = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AddReactions];
const TICKET_ROLE_SPECTATE = { ViewChannel: true, SendMessages: false, ReadMessageHistory: true, EmbedLinks: true, AttachFiles: true, AddReactions: true };

async function pinFirstTicketMessage(channel?, message?) {
  if (!channel || !message?.pin) return;
  await message.pin().catch(() => {});
  const recent = await channel.messages.fetch({ limit: 6 }).catch(() => null);
  if (!recent) return;
  const pinSystem = recent.find((m?) => Number(m.type) === 6);
  if (pinSystem) {
    await pinSystem.delete().catch(() => {});
  }
}

async function openPartnerManagerShopTicketForMember(client?, guild?, member?, tier?) {
  const tierN = Math.floor(Number(tier) || 0);
  if (!client || !guild || !member?.user) {
    return { ok: false, userMessage: "<a:VC_Cross:1482532424570376253> Richiesta non valida." };
  }
  const interaction = { client, guild, user: member.user, member };
  return openPartnerManagerShopManualTicket(interaction, tierN);
}

async function openPartnerManagerShopManualTicket(interaction?, tier?) {
  const guild = interaction.guild;
  const tierN = Math.floor(Number(tier) || 0);
  const pointCost = getPartnerRewardPointCost(tierN);
  if (!guild || !interaction.user) {
    return { ok: false, userMessage: "<a:VC_Cross:1482532424570376253> Usa questo pulsante nel server." };
  }
  if (tierN !== 150 && tierN !== 200 && tierN !== 250) {
    return { ok: false, userMessage: "<a:VC_Cross:1482532424570376253> Premio non valido." };
  }

  const pmRole = String(IDs.roles?.PartnerManager || "").trim();
  if (!pmRole || !interaction.member?.roles?.cache?.has(pmRole)) {
    return { ok: false, userMessage: "<a:VC_Cross:1482532424570376253> Solo i **Partner Manager** possono aprire questo ticket." };
  }

  const lean = await ActivityUserProfile.findOne({ guildId: guild.id, userId: interaction.user.id })
    .select("staff")
    .lean()
    .catch(() => null);
  const balance = resolvePartnerPointsShown(lean?.staff);
  if (balance < pointCost) {
    return {
      ok: false,
      userMessage: `<a:VC_Cross:1482532424570376253> Ti servono **${pointCost}** punti (saldo attuale: **${balance}**).`,
    };
  }

  if (!interaction.client.ticketOpenLocks) {
    interaction.client.ticketOpenLocks = new Set();
  }
  const ticketLockKey = `${guild.id}:${interaction.user.id}`;
  if (interaction.client.ticketOpenLocks.has(ticketLockKey)) {
    return {
      ok: false,
      userMessage: "<a:VC_Cross:1482532424570376253> Sto già aprendo un ticket, attendi un attimo.",
    };
  }

  let maxOpen = 1;
  try {
    const { getTicketSettingsSync } = require("../../MultiGuild/core/tenantTicketSettings") as typeof import("../../MultiGuild/core/tenantTicketSettings");
    maxOpen = Math.max(1, Math.min(25, Number(getTicketSettingsSync(guild.id)?.maxOpenTicketsPerUser) || 1));
  } catch (_) {
    maxOpen = 1;
  }
  const openCounted = await runtimeCountOpenTicketsByUser(guild.id, interaction.user.id, guild).catch(
    () => ({ count: 0, tickets: [] }),
  );
  if (openCounted.count >= maxOpen) {
    const existing = openCounted.tickets[0];
    return {
      ok: false,
      userMessage:
        maxOpen <= 1
          ? `<a:VC_Cross:1482532424570376253> Hai già un ticket aperto${existing?.channelId ? `: <#${existing.channelId}>` : "."}`
          : `<a:VC_Cross:1482532424570376253> Hai già ${openCounted.count}/${maxOpen} ticket aperti.`,
    };
  }

  const ROLE_STAFF = IDs.roles.Staff;
  const ROLE_HIGHSTAFF = IDs.roles.HighStaff;
  const ROLE_PARTNERMANAGER = IDs.roles.PartnerManager;
  const panelConfig = getTicketPanelConfig("highstaff");
  if (!panelConfig || panelConfig.type !== "high") {
    return { ok: false, userMessage: "<a:VC_Cross:1482532424570376253> Configurazione ticket non disponibile." };
  }

  interaction.client.ticketOpenLocks.add(ticketLockKey);
  try {
    const ticketsCategory = await createTicketsCategory(interaction, guild);
    if (!ticketsCategory) {
      return { ok: false, userMessage: "<a:VC_Cross:1482532424570376253> Impossibile creare la categoria ticket." };
    }

    let reservedTicketNumber = null;
    try {
      reservedTicketNumber = await getNextTicketId(guild.id);
    } catch (_) {
      reservedTicketNumber = null;
    }

    const channel = await guild.channels
      .create({
        name: buildTicketChannelName(
          panelConfig,
          interaction.user?.username,
          interaction.user?.id || "utente",
        ),
        type: 0,
        parent: ticketsCategory.id,
        permissionOverwrites: [
          buildTicketEveryoneDenyViewCreateOverwrite(guild.roles.everyone.id),
          buildTicketOpenerCreateOverwrite(interaction.user.id, TICKET_PERMISSIONS),
          toTicketRoleCreateOverwrite(ROLE_HIGHSTAFF, TICKET_ROLE_SPECTATE),
          buildTicketRoleDenyViewCreateOverwrite(ROLE_STAFF),
          buildTicketRoleDenyViewCreateOverwrite(ROLE_PARTNERMANAGER),
        ].filter(Boolean),
      })
      .catch(() => null);

    if (!channel) {
      return { ok: false, userMessage: "<a:VC_Cross:1482532424570376253> Impossibile creare il canale ticket." };
    }

    const rewardLabel = partnerManagerRedeemButtonLabel(tierN);
    const embed = new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<:VC_Ticket:1482535175283019888> Riscatto premio · Shop Partner Manager")
      .setDescription(
        [
          `<:VC_PartnerManager:1494286911286808576> **Partner Manager:** ${interaction.user}`,
          "",
          `<:VC_reason:1478517122929004544> **Premio richiesto:** ${rewardLabel}`,
          `<:VC_Partner:1482527213780729896> **Punti necessari:** \`${pointCost}\` (saldo attuale **${balance}**).`,
          "",
          `<a:VC_Alert:1482706673176150077> Attendi un membro dell'**High Staff** per completare la consegna del premio.`,
        ].join("\n"),
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("close_ticket")
        .setEmoji("🔒")
        .setLabel("Chiudi")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("close_ticket_motivo")
        .setEmoji("🔒")
        .setLabel("Chiudi Con Motivo")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("claim_ticket").setEmoji("🙋‍♂️").setLabel("Claim").setStyle(ButtonStyle.Success),
    );

    const { wrapMentionsInSpoiler } = require("./ticketUiDefaults");
    const tagRole = ROLE_HIGHSTAFF;
    const mentionRaw = `<@${interaction.user.id}>${tagRole ? `<@&${tagRole}>` : ""}`;
    await channel
      .send({
        content: wrapMentionsInSpoiler(mentionRaw),
        allowedMentions: {
          parse: [],
          users: [String(interaction.user.id)],
          roles: tagRole ? [String(tagRole)] : [],
        },
      })
      .catch(() => null);

    const mainMsg = await channel.send({ embeds: [embed], components: [row] }).catch(() => null);
    if (mainMsg) {
      await pinFirstTicketMessage(channel, mainMsg);
    }

    let ticketCreated = false;
    let createdTicketDoc = null;
    try {
      createdTicketDoc = await createTicketDocWithGlobalId(Ticket, {
        guildId: guild.id,
        userId: interaction.user.id,
        channelId: channel.id,
        ticketType: "high",
        open: true,
        messageId: mainMsg?.id || null,
        descriptionPromptMessageId: null,
        descriptionSubmitted: false,
        partnerManagerShopRedeemTier: tierN,
        partnerManagerShopRedeemAckResult: null,
        partnerManagerShopRedeemAckAt: null,
        ...(Number(reservedTicketNumber) > 0 ? { ticketNumber: reservedTicketNumber } : {}),
      });
      ticketCreated = true;
    } catch (err) {
      const isDuplicate = err?.code === 11000 || (err?.message && String(err.message).includes("E11000"));
      if (isDuplicate) {
        await channel.delete().catch(() => {});
        const other = await runtimeFindOpenTicketByUser(guild.id, interaction.user.id, guild).catch(() => null);
        return {
          ok: false,
          userMessage: `<a:VC_Cross:1482532424570376253> Hai già un ticket aperto${other?.channelId ? `: <#${other.channelId}>` : "."}.`,
        };
      }
      global.logger?.error?.("[partnerManagerShopTicketOpen]", err);
    }

    if (!ticketCreated) {
      await channel.delete().catch(() => {});
      return { ok: false, userMessage: "<a:VC_Cross:1482532424570376253> Impossibile registrare il ticket. Riprova." };
    }

    return {
      ok: true,
      channel,
      userMessage: `<:VC_Ticket:1482535175283019888> Ticket High Staff aperto: ${channel}`,
    };
  } finally {
    interaction.client.ticketOpenLocks.delete(ticketLockKey);
  }
}

export = { openPartnerManagerShopManualTicket, openPartnerManagerShopTicketForMember };