const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const Ticket = require("../../Schemas/Ticket/ticketSchema");
const { TICKETS_CATEGORY_NAME, isChannelInTicketCategory } = require("../../Utils/Ticket/ticketCategoryUtils");
const { buildTicketChannelName, resolveTicketRenamePrefix, sanitizeTicketChannelTail } = require("../../Utils/Ticket/ticketNamingRuntime");
const { getTicketPanelConfig } = require("../../Utils/Ticket/ticketPanelConfig");
const { PERKS_STAFF_ROLE_IDS, PERKS_PING_ROLE_IDS, memberCanAccessPerksTicket, buildPerksPingMention } = require("../../Utils/Ticket/ticketPerksStaffRoles");
const { PARTNERSHIP_TICKET_STAFF_ROLE_IDS, memberCanAccessPartnershipTicket, buildPartnershipTicketReviewerCreateOverwrites } = require("../../Utils/Ticket/ticketPartnershipStaffRoles");
const IDs = require("../../Utils/Config/ids");
const { getClientGuildCached, getGuildChannelCached, getGuildMemberCached, } = require("../../Utils/Interaction/interactionEntityCache");
const STAFF_ROLE_ID = IDs.roles.Staff;
const HIGHSTAFF_ROLE_ID = IDs.roles.HighStaff;
const PARTNERMANAGER_ROLE_ID = IDs.roles.PartnerManager;
const STAFF_ROLE_IDS = [STAFF_ROLE_ID, HIGHSTAFF_ROLE_ID].filter(Boolean);
const NO_REPLY_MENTIONS = { repliedUser: false };
const TICKET_SPECTATE_STAFF_ALLOW = [ PermissionFlagsBits.ViewChannel, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AddReactions ];
const TICKET_SPECTATE_STAFF_DENY = [PermissionFlagsBits.SendMessages];

function hasAnyRole(member, roleIds = []) {
  return roleIds.some((roleId) => member?.roles?.cache?.has(roleId));
}

function canClaimTicket(member, ticketType, _guildId = null) {
  if (!member) return false;
  const isSupport = ticketType === "supporto" && hasAnyRole(member, STAFF_ROLE_IDS);
  const isPartnership = ticketType === "partnership" && memberCanAccessPartnershipTicket(member);
  const isHigh = ticketType === "high" && member.roles.cache.has(HIGHSTAFF_ROLE_ID);
  const isPerks = ticketType === "perks" && memberCanAccessPerksTicket(member);
  return isSupport || isPartnership || isHigh || isPerks;
}

function makeErrorEmbed(title, description) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor("#6f4e37");
}

async function pinFirstTicketMessage(channel, message) {
  if (!channel || !message?.pin) return;
  await message.pin().catch(() => { });
  const recent = await channel.messages.fetch({ limit: 6 }).catch(() => null);
  if (!recent) return;
  const pinSystem = recent.find((m) => Number(m.type) === 6);
  if (pinSystem) {
    await pinSystem.delete().catch(() => { });
  }
}

async function fetchTicketMessage(channel, messageId) {
  if (messageId) {
    const found = await channel.messages.fetch(messageId).catch(() => null);
    if (found) return found;
  }
  const fallback = await channel.messages.fetch({ limit: 5 }).catch(() => null);
  return fallback?.first() || null;
}

function getTicketChannelPermissionOverwrites(guild, userId, ticketType) {
  const base = [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel], }, { id: userId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AddReactions,], },];

  if (ticketType === "supporto") {
    base.push(
      {
        id: STAFF_ROLE_ID,
        allow: TICKET_SPECTATE_STAFF_ALLOW,
        deny: TICKET_SPECTATE_STAFF_DENY,
      },
      {
        id: HIGHSTAFF_ROLE_ID,
        allow: TICKET_SPECTATE_STAFF_ALLOW,
        deny: TICKET_SPECTATE_STAFF_DENY,
      },
      {
        id: PARTNERMANAGER_ROLE_ID,
        deny: [PermissionFlagsBits.ViewChannel],
      },
    );
  } else if (ticketType === "partnership") {
    for (const roleId of PARTNERSHIP_TICKET_STAFF_ROLE_IDS) {
      base.push({
        id: roleId,
        allow: TICKET_SPECTATE_STAFF_ALLOW,
        deny: TICKET_SPECTATE_STAFF_DENY,
      });
    }
    base.push(...buildPartnershipTicketReviewerCreateOverwrites());
    base.push(
      {
        id: STAFF_ROLE_ID,
        deny: [PermissionFlagsBits.ViewChannel],
      },
    );
  } else if (ticketType === "high") {
    base.push(
      {
        id: HIGHSTAFF_ROLE_ID,
        allow: TICKET_SPECTATE_STAFF_ALLOW,
        deny: TICKET_SPECTATE_STAFF_DENY,
      },
      {
        id: STAFF_ROLE_ID,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: PARTNERMANAGER_ROLE_ID,
        deny: [PermissionFlagsBits.ViewChannel],
      },
    );
  } else if (ticketType === "perks") {
    for (const roleId of PERKS_STAFF_ROLE_IDS) {
      base.push({
        id: roleId,
        allow: TICKET_SPECTATE_STAFF_ALLOW,
        deny: TICKET_SPECTATE_STAFF_DENY,
      });
    }
    base.push(
      {
        id: STAFF_ROLE_ID,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: PARTNERMANAGER_ROLE_ID,
        deny: [PermissionFlagsBits.ViewChannel],
      },
    );
  }

  return base.filter((entry) => Boolean(entry?.id));
}

async function ensureTicketsCategory(guild) {
  await guild.channels.fetch().catch(() => null);
  const categories = guild.channels.cache.filter((ch) => ch.type === 4 && String(ch.name || "").toLowerCase().includes("tickets")).sort((a, b) => a.rawPosition - b.rawPosition || a.id.localeCompare(b.id));

  if (categories.size > 0) {
    const exact = categories.find((c) => c.name === TICKETS_CATEGORY_NAME);
    return exact || categories.first();
  }

  const created = await guild.channels.create({
    name: TICKETS_CATEGORY_NAME,
    type: 4,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
      },
    ],
  }).catch(() => null);

  if (created) {
    await created.setPosition(0).catch(() => { });
  }
  return created;
}

async function ticketSwitchPanelExecute(message, categoryToken) {
      const targetChannel = message.channel;
      const panelConfig = getTicketPanelConfig(categoryToken);

      if (!targetChannel || !targetChannel.isTextBased?.()) {
        await safeMessageReply(message, {
          embeds: [
            makeErrorEmbed(
              "Errore",
              "<:vegax:1443934876440068179> Specifica un canale valido.",
            ),
          ],
          allowedMentions: { repliedUser: false },
        });
        return false;
      }

      if (!panelConfig) {
        await safeMessageReply(message, {
          embeds: [
            makeErrorEmbed(
              "Errore",
              "<:vegax:1443934876440068179> Categoria non valida. Usa: `supporto`, `partnership`, `highstaff`, `perks`.",
            ),
          ],
          allowedMentions: { repliedUser: false },
        });
        return false;
      }

      if (!message.client.ticketSwitchLocks)
        message.client.ticketSwitchLocks = new Set();
      if (!message.client.ticketSwitchCooldowns)
        message.client.ticketSwitchCooldowns = new Map();
      const switchKey = `${message.guild.id}:${targetChannel.id}`;
      const lastSwitchAt = Number(message.client.ticketSwitchCooldowns.get(switchKey) || 0,);

      if (message.client.ticketSwitchLocks.has(switchKey)) {
        await safeMessageReply(message, {
          embeds: [
            makeErrorEmbed(
              "Attendi",
              "<:VC_Attention:1482534443632558151> C'è già uno switchpanel in esecuzione su questo ticket.",
            ),
          ],
          allowedMentions: { repliedUser: false },
        });
        return false;
      }

      if (Date.now() - lastSwitchAt < 2000) {
        await safeMessageReply(message, {
          embeds: [
            makeErrorEmbed(
              "Attendi",
              "<:VC_Attention:1482534443632558151> Aspetta un attimo prima di rifare switchpanel.",
            ),
          ],
          allowedMentions: { repliedUser: false },
        });
        return false;
      }

      message.client.ticketSwitchLocks.add(switchKey);
      try {
        const ticketDoc = await Ticket.findOne({ channelId: targetChannel.id, open: true }).catch(() => null);
        if (!ticketDoc) {
          await safeMessageReply(message, {
            embeds: [
              makeErrorEmbed(
                "Errore",
                "<:vegax:1443934876440068179> Nel canale indicato non c'è un ticket aperto.",
              ),
            ],
            allowedMentions: { repliedUser: false },
          });
          return false;
        }
        const previousTicketType = String(ticketDoc.ticketType || "");

        const openerMember = await getGuildMemberCached(message.guild, ticketDoc.userId);
        const openerName = openerMember?.user?.username || "utente";
        const safeOpenerName = String(openerName).replace(/[^\w.-]/g, "").slice(0, 20) || "utente";
        const newChannelName = `༄${panelConfig.emoji}︲${panelConfig.name}᲼${safeOpenerName}`;
        if (targetChannel.name !== newChannelName) {
          await targetChannel.setName(newChannelName).catch(() => { });
        }

        await targetChannel.permissionOverwrites
          .edit(ticketDoc.userId, {
            ViewChannel: true,
            SendMessages: true,
            EmbedLinks: true,
            AttachFiles: true,
            ReadMessageHistory: true,
            AddReactions: true,
          })
          .catch(() => { });

        const previousClaimedBy = String(ticketDoc.claimedBy || "").trim();
        if (ticketDoc.claimedBy) {
          const claimerMember = await getGuildMemberCached(message.guild, ticketDoc.claimedBy);
          if (!canClaimTicket(claimerMember, panelConfig.type, message.guild?.id)) {
            ticketDoc.claimedBy = null;
          }
        }

        const applyReadOnly = {
          ViewChannel: true,
          SendMessages: false,
          ReadMessageHistory: true,
          EmbedLinks: true,
          AttachFiles: true,
          AddReactions: true,
        };
        const applyFull = { ViewChannel: true, SendMessages: true, EmbedLinks: true, AttachFiles: true, ReadMessageHistory: true, AddReactions: true, };
        const roleHideFromTicket = { ViewChannel: false };

        if (panelConfig.type === "supporto") {
          if (ticketDoc.claimedBy) {
            await targetChannel.permissionOverwrites
              .edit(STAFF_ROLE_ID, applyReadOnly)
              .catch(() => { });
            await targetChannel.permissionOverwrites
              .edit(HIGHSTAFF_ROLE_ID, applyReadOnly)
              .catch(() => { });
          } else {
            await targetChannel.permissionOverwrites
              .edit(STAFF_ROLE_ID, applyReadOnly)
              .catch(() => { });
            await targetChannel.permissionOverwrites
              .edit(HIGHSTAFF_ROLE_ID, applyReadOnly)
              .catch(() => { });
          }
          await targetChannel.permissionOverwrites
            .edit(PARTNERMANAGER_ROLE_ID, roleHideFromTicket)
            .catch(() => { });
        }

        if (panelConfig.type === "partnership") {
          for (const roleId of PARTNERSHIP_TICKET_STAFF_ROLE_IDS) {
            await targetChannel.permissionOverwrites
              .edit(roleId, applyReadOnly)
              .catch(() => { });
          }
          const { applyPartnershipTicketReviewerOverwrites } = require("../../Utils/Ticket/ticketPartnershipStaffRoles");
          await applyPartnershipTicketReviewerOverwrites(targetChannel);
          await targetChannel.permissionOverwrites
            .edit(STAFF_ROLE_ID, roleHideFromTicket)
            .catch(() => { });
        }

        if (panelConfig.type === "high") {
          if (ticketDoc.claimedBy) {
            await targetChannel.permissionOverwrites
              .edit(HIGHSTAFF_ROLE_ID, applyReadOnly)
              .catch(() => { });
          } else {
            await targetChannel.permissionOverwrites
              .edit(HIGHSTAFF_ROLE_ID, applyReadOnly)
              .catch(() => { });
          }
          await targetChannel.permissionOverwrites
            .edit(STAFF_ROLE_ID, roleHideFromTicket)
            .catch(() => { });
          await targetChannel.permissionOverwrites
            .edit(PARTNERMANAGER_ROLE_ID, roleHideFromTicket)
            .catch(() => { });
        }

        if (panelConfig.type === "perks") {
          for (const roleId of PERKS_STAFF_ROLE_IDS) {
            await targetChannel.permissionOverwrites
              .edit(roleId, applyReadOnly)
              .catch(() => { });
          }
          await targetChannel.permissionOverwrites
            .edit(STAFF_ROLE_ID, roleHideFromTicket)
            .catch(() => { });
          await targetChannel.permissionOverwrites
            .edit(PARTNERMANAGER_ROLE_ID, roleHideFromTicket)
            .catch(() => { });
        }

        if (previousTicketType === "perks" && panelConfig.type !== "perks") {
          for (const roleId of PERKS_PING_ROLE_IDS) {
            if (roleId && roleId !== HIGHSTAFF_ROLE_ID) {
              await targetChannel.permissionOverwrites
                .edit(roleId, roleHideFromTicket)
                .catch(() => { });
            }
          }
        }

        if (ticketDoc.claimedBy) {
          await targetChannel.permissionOverwrites
            .edit(ticketDoc.claimedBy, {
              ViewChannel: true,
              SendMessages: true,
              EmbedLinks: true,
              AttachFiles: true,
              ReadMessageHistory: true,
              AddReactions: true,
            })
            .catch(() => { });
        } else if (previousClaimedBy) {
          await targetChannel.permissionOverwrites
            .delete(previousClaimedBy)
            .catch(() => { });
        }

        ticketDoc.ticketType = panelConfig.type;

        if (
          previousTicketType === "partnership" &&
          panelConfig.type !== "partnership"
        ) {
          if (ticketDoc.descriptionPromptMessageId) {
            const oldPrompt = await targetChannel.messages.fetch(ticketDoc.descriptionPromptMessageId).catch(() => null);
            if (oldPrompt) await oldPrompt.delete().catch(() => { });
          }
          ticketDoc.descriptionPromptMessageId = null;
        }

    const persistSet = {
      ticketType: panelConfig.type,
      claimedBy: ticketDoc.claimedBy != null && String(ticketDoc.claimedBy).trim() !== "" ? ticketDoc.claimedBy : null,
    };
    if (previousTicketType === "partnership" && panelConfig.type !== "partnership") {
      persistSet.descriptionPromptMessageId = null;
    }
    await Ticket.updateOne({ _id: ticketDoc._id }, { $set: persistSet }).catch((err) => {
      global.logger?.warn?.("[ticketSwitchPanel] persist ticket fields failed:", err?.message || err);
    });

        const msg = await fetchTicketMessage(targetChannel, ticketDoc.messageId,);
        if (msg) {
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("close_ticket").setEmoji("<:VC_Lock:1482526739044368476>").setLabel("Chiudi").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId("close_ticket_motivo").setEmoji("<:VC_reason:1478517122929004544>").setLabel("Chiudi Con Motivo").setStyle(ButtonStyle.Danger),
            ticketDoc.claimedBy
              ? new ButtonBuilder().setCustomId("unclaim").setEmoji("<a:VC_Unlock:1482532082466029608>").setLabel("Unclaim").setStyle(ButtonStyle.Secondary)
              : new ButtonBuilder().setCustomId("claim_ticket").setEmoji("<:VC_claim:1478517202016669887>").setLabel("Claim").setStyle(ButtonStyle.Success),
          );
          await msg
            .edit({ embeds: [panelConfig.embed], components: [row] })
            .catch(() => { });
        }

        await safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor("#6f4e37")
              .setTitle("Switch Panel")
              .setDescription(
                `<:vegacheckmark:1443666279058772028> Ticket aggiornato in **${panelConfig.label || panelConfig.name || panelConfig.type}** nel canale ${targetChannel}.`,
              ),
          ],
          allowedMentions: { repliedUser: false },
        });
        return true;
      } finally {
        message.client.ticketSwitchLocks.delete(switchKey);
        message.client.ticketSwitchCooldowns.set(switchKey, Date.now());
      }
    }

const TICKET_REOPEN_BY_NUMBER_PROJECTION = { _id: 1, channelId: 1, open: 1, userId: 1, claimedBy: 1, guildId: 1, ticketNumber: 1, ticketType: 1 };

async function ticketReopenByNumber(ctx, ticketNumber) {
  const { guild, reply } = ctx;
  if (!guild || typeof reply !== "function") return false;

  const ticketDoc = await Ticket.findOne({ guildId: guild.id, ticketNumber }, TICKET_REOPEN_BY_NUMBER_PROJECTION).lean().catch(() => null);

  if (!ticketDoc) {
    await reply({
          embeds: [
        makeErrorEmbed(
          "Errore",
          `<:vegax:1443934876440068179> Ticket #${ticketNumber} non trovato.`,
        ),
      ],
      allowedMentions: NO_REPLY_MENTIONS,
        });
        return false;
      }

  if (ticketDoc.open && ticketDoc.channelId) {
    await reply({
          embeds: [
        makeErrorEmbed(
          "Info",
          `<:VC_Attention:1482534443632558151> Ticket #${ticketNumber} è già aperto: <#${ticketDoc.channelId}>`,
        ),
      ],
      allowedMentions: NO_REPLY_MENTIONS,
        });
        return false;
      }

  const existingOpen = await Ticket.findOne({ guildId: guild.id, userId: ticketDoc.userId, open: true }, { _id: 1, channelId: 1 }).lean().catch(() => null);

  if (existingOpen) {
    await reply({
          embeds: [
            makeErrorEmbed(
              "Errore",
          `<:vegax:1443934876440068179> L'utente ha già un ticket aperto: <#${existingOpen.channelId}>`,
            ),
          ],
      allowedMentions: NO_REPLY_MENTIONS,
        });
        return false;
      }

  const ticketMember = await getGuildMemberCached(guild, ticketDoc.userId);
  if (!ticketMember) {
    await reply({
          embeds: [
            makeErrorEmbed(
              "Errore",
          "<:vegax:1443934876440068179> Utente del ticket non presente nel server, impossibile riaprire.",
            ),
          ],
      allowedMentions: NO_REPLY_MENTIONS,
        });
        return false;
      }

  const config = getTicketPanelConfig(ticketDoc.ticketType) || getTicketPanelConfig("supporto");
  if (!config) {
    await reply({
      embeds: [makeErrorEmbed("Errore", "Configurazione ticket non valida.")],
      allowedMentions: NO_REPLY_MENTIONS,
    });
    return false;
  }

  const category = await ensureTicketsCategory(guild);
  if (!category) {
    await reply({
          embeds: [
            makeErrorEmbed(
          "Errore",
          "<:vegax:1443934876440068179> Impossibile trovare o creare la categoria ticket.",
            ),
          ],
      allowedMentions: NO_REPLY_MENTIONS,
        });
        return false;
      }

  const channelName = buildTicketChannelName(config, ticketMember.user.username, ticketMember.id,);

  const channel = await guild.channels.create({ name: channelName, type: 0, parent: category.id, permissionOverwrites: getTicketChannelPermissionOverwrites(guild, ticketDoc.userId, config.type,), }).catch(() => null);

  if (!channel) {
    await reply({
          embeds: [
            makeErrorEmbed(
              "Errore",
          "<:vegax:1443934876440068179> Impossibile creare il canale ticket.",
        ),
      ],
      allowedMentions: NO_REPLY_MENTIONS,
    });
    return false;
  }

  try {
    const { scheduleDiscordAutomodRulesResync } = require("../../Services/Moderation/discordAutomodRulesService");
    scheduleDiscordAutomodRulesResync(message.client);
  } catch (_) {}

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("close_ticket").setEmoji("<:VC_Lock:1482526739044368476>").setLabel("Chiudi").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("close_ticket_motivo").setEmoji("<:VC_reason:1478517122929004544>").setLabel("Chiudi Con Motivo").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("claim_ticket").setEmoji("<:VC_claim:1478517202016669887>").setLabel("Claim").setStyle(ButtonStyle.Success),
  );

  const mainMsg = await channel.send({ embeds: [config.embed], components: [row] }).catch(() => null);
  if (mainMsg) {
    await pinFirstTicketMessage(channel, mainMsg);
  }

  await Ticket.updateOne(
    { _id: ticketDoc._id },
    {
      $set: {
        open: true,
        channelId: channel.id,
        messageId: mainMsg?.id || null,
        descriptionPromptMessageId: null,
        transcript: "",
        transcriptHtmlPath: null,
        transcriptViewToken: null,
        transcriptHtmlInline: null,
        transcriptViewExpiresAt: null,
        closeReason: null,
        closeRequestedBy: null,
        closeRequestedAt: null,
        closedBy: null,
        closedAt: null,
        claimedBy: null,
        closeLogChannelId: null,
        closeLogMessageId: null,
        ratingScore: null,
        ratingBy: null,
        ratingAt: null,
      },
    },
  ).catch(() => { });

  const pingSuffix =
    config.type === "partnership"
      ? (PARTNERMANAGER_ROLE_ID ? `<@&${PARTNERMANAGER_ROLE_ID}>` : "")
      : config.type === "high"
        ? (HIGHSTAFF_ROLE_ID ? `<@&${HIGHSTAFF_ROLE_ID}>` : "")
        : config.type === "perks"
          ? buildPerksPingMention()
          : STAFF_ROLE_ID
            ? `<@&${STAFF_ROLE_ID}>`
            : "";
  const mentionMsg = await channel.send(`<@${ticketDoc.userId}>${pingSuffix}`).catch(() => null);
  if (mentionMsg) {
    const timer = setTimeout(() => mentionMsg.delete().catch(() => { }), 1);
    timer.unref?.();
  }

  await reply({
    embeds: [
      new EmbedBuilder()
        .setColor("#6f4e37")
        .setTitle("Ticket Riaperto")
        .setDescription(
          `<:vegacheckmark:1443666279058772028> Ticket #${ticketNumber} riaperto in ${channel}.`,
        ),
    ],
    allowedMentions: NO_REPLY_MENTIONS,
  });
  return true;
}

module.exports = {
  name: "ticket",
  allowEmptyArgs: true,

  async execute(message, args = [], client) {
    if (!message.inGuild?.() || !message.guild || !message.member) {
      await safeMessageReply(message, {
        content:
          "<:vegax:1443934876440068179> Questo comando può essere usato solo in un server.",
        allowedMentions: NO_REPLY_MENTIONS,
      });
      return;
    }

    if (args.length > 0) {
      await safeMessageReply(message, {
        embeds: [
          makeErrorEmbed(
            "Ticket",
            "<:vegax:1443934876440068179> Usa solo **`+ticket`** senza argomenti. Nel canale di un ticket aperto ricevi il **pannello** con i pulsanti; se sei **High Staff** e sei fuori da un ticket, puoi usare il **menu** per riaprire un ticket chiuso.",
          ),
        ],
        allowedMentions: NO_REPLY_MENTIONS,
      });
      return;
    }

    const effectiveChannelId = message.channel?.isThread?.() ? message.channel?.parentId || message.channel?.id : message.channel?.id;
    const activeTicketInChannel = effectiveChannelId ? await Ticket.findOne({ channelId: effectiveChannelId, open: true }, { _id: 1 }).lean().catch(() => null) : null;

    if (!activeTicketInChannel) {
      const canReopenOutside =
        HIGHSTAFF_ROLE_ID && message.member.roles.cache.has(HIGHSTAFF_ROLE_ID);
      if (canReopenOutside) {
        const {
          buildTicketReopenOutsidePanelPayload,
          fetchClosedTicketsOrdered,
        } = require("../../Utils/Ticket/ticketStaffPanelBuild");
        const { rememberTicketReopenOutsideSession } = require("../../Utils/Ticket/ticketReopenOutsideSession");
        const closedRaw = await fetchClosedTicketsOrdered(message.guild.id);
        const panel = await buildTicketReopenOutsidePanelPayload(message.guild, closedRaw, {
          page: 0,
          filterQuery: "",
        });
        const sent = await safeMessageReply(message, {
          embeds: [panel.embed],
          components: panel.components,
          allowedMentions: { repliedUser: false },
        });
        if (sent?.id) {
          rememberTicketReopenOutsideSession(message.client, sent.id, {
            authorId: message.author.id,
            guildId: message.guild.id,
            commandMessageId: message.id,
            filterQuery: "",
            page: 0,
          });
        }
        return;
      }
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("#6f4e37")
            .setDescription(
              "<:VC_Attention:1482534443632558151> Usa `+ticket` **dentro un ticket aperto** per il pannello. Solo **High Staff** può usare `+ticket` fuori dal ticket per il menu di riapertura.",
            ),
        ],
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    const ticketDocFull = await Ticket.findOne(
      { channelId: effectiveChannelId, open: true },
      { channelId: 1, open: 1, userId: 1, claimedBy: 1, guildId: 1, ticketNumber: 1, ticketType: 1 },
    ).lean().catch(() => null);
    const { buildTicketStaffPanelPayload } = require("../../Utils/Ticket/ticketStaffPanelBuild");
    const { embed, components } = buildTicketStaffPanelPayload(
      message.member,
      message.channel,
      ticketDocFull,
    );
    if (!components.length) {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("#6f4e37")
            .setDescription(
              "<:VC_Attention:1482534443632558151> Nessun pulsante disponibile per i tuoi permessi in questo ticket.",
            ),
        ],
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    await safeMessageReply(message, {
      embeds: [embed],
      components,
      allowedMentions: { repliedUser: false },
    });
    return;
  },
  ticketSwitchPanelExecute,
  ticketReopenByNumber,
  canClaimTicket,
};