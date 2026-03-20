const { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, PermissionFlagsBits, ChannelType, MessageFlags, } = require("discord.js");
const Ticket = require("../../Schemas/Ticket/ticketSchema");
const { TICKETS_CATEGORY_NAME, isTicketCategoryName, } = require("./ticketCategoryUtils");
const { safeEditReply: safeEditReplyHelper } = require("../../../shared/discord/replyRuntime");
const IDs = require("../Config/ids");
const { getGuildChannelCached } = require("../Interaction/interactionEntityCache");
const { findOpenTicketByUser, warmGuildChannels } = require("./ticketInteractionRuntime");
const { buildTicketChannelName } = require("./ticketNamingRuntime");
const { createTicketDocWithGlobalId } = require("./ticketIdUtils");
const TICKET_PERMISSIONS_SPONSOR = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AddReactions,];

async function handleSponsorTicketOpen(interaction) {
  const guild = interaction.guild;
  const userId = interaction.user.id;
  global.logger?.info?.(
    `[ticket-open-debug] sponsor open start guild=${guild?.id} user=${userId}`,
  );
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => null);
  }
  if (!interaction.deferred) {
    await interaction.reply({ content: "<:vegax:1443934876440068179> Riprova tra un attimo.", flags: MessageFlags.Ephemeral }).catch(() => null);
    return true;
  }

  if (!interaction.client.ticketOpenLocks) interaction.client.ticketOpenLocks = new Set();

  const ticketLockKey = `${guild.id}:${userId}`;
  if (interaction.client.ticketOpenLocks.has(ticketLockKey)) {
    await safeEditReplyHelper(interaction, {
      embeds: [
        new EmbedBuilder()
          .setTitle("<:VC_Clock:1473359204189474886> Attendi")
          .setDescription("<a:VC_Alert:1482706673176150077> Stai già aprendo un ticket, attendi.")
          .setColor("#6f4e37"),
      ],
      flags: 1 << 6,
    });
    return true;
  }

  interaction.client.ticketOpenLocks.add(ticketLockKey);
  try {
    const existing = await findOpenTicketByUser(guild.id, userId, guild);
    if (existing) {
      global.logger?.warn?.(
        `[ticket-open-debug] sponsor blocked by existing open ticket id=${existing?._id} channel=${existing?.channelId}`,
      );
      await safeEditReplyHelper(interaction, {
        embeds: [
          new EmbedBuilder()
            .setTitle("<:VC_open:1478517277279129712> Ticket Aperto")
            .setDescription(`<a:VC_Alert:1482706673176150077> Hai già un ticket aperto: <#${existing.channelId}>`)
            .setColor("#6f4e37"),
        ],
        flags: 1 << 6,
      });
      return true;
    }

    await warmGuildChannels(guild);
    let category = guild.channels.cache.find((ch) => ch.type === ChannelType.GuildCategory && isTicketCategoryName(ch.name));
    if (!category) {
      const categories = guild.channels.cache.filter((ch) => ch.type === ChannelType.GuildCategory);
      const bottomPosition = categories.size > 0 ? Math.max(...categories.map((ch) => ch.rawPosition ?? 0)) + 1 : 0;
      category = await guild.channels.create({
        name: TICKETS_CATEGORY_NAME,
        type: ChannelType.GuildCategory,
        position: bottomPosition,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        ],
      }).catch(() => null);
    }

    if (!category) {
      await safeEditReplyHelper(interaction, {
        embeds: [
          new EmbedBuilder()
            .setTitle("<a:VC_Alert:1482706673176150077> Errore")
            .setDescription("<:vegax:1443934876440068179> Impossibile creare o trovare la categoria ticket.")
            .setColor("#6f4e37"),
        ],
        flags: 1 << 6,
      });
      return true;
    }

    const gid = String(guild.id);
    const staffRoleId =
      IDs.roles?.sponsorStaffRoleIds?.[gid] ??
      IDs.roles?.sponsorStaffRoleIds?.[guild.id];
    const config = IDs.sponsorTicketConfig?.[guild.id] || {};
    const emoji = config.emoji || "🎫";
    const tagName = config.tagName || "Supporto";

    const overwrites = [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }, { id: userId, allow: TICKET_PERMISSIONS_SPONSOR }];
    if (staffRoleId) overwrites.push({ id: staffRoleId, allow: TICKET_PERMISSIONS_SPONSOR });

    const channel = await guild.channels.create({
      name: buildTicketChannelName({ emoji, name: tagName }, interaction.user.username, interaction.user.id),
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: overwrites,
    }).catch(() => null);
    global.logger?.info?.(
      `[ticket-open-debug] sponsor channel create result channel=${channel?.id || "null"} user=${userId}`,
    );

    if (!channel) {
      await safeEditReplyHelper(interaction, {
        embeds: [
          new EmbedBuilder()
            .setTitle("<a:VC_Alert:1482706673176150077> Errore")
            .setDescription("<:vegax:1443934876440068179> Impossibile creare il canale ticket.")
            .setColor("#6f4e37"),
        ],
        flags: 1 << 6,
      });
      return true;
    }

    const sponsorEmbed = new EmbedBuilder()
      .setTitle("<:VC_open:1478517277279129712> Ticket aperto - Riscatto ruolo")
      .setDescription("Grazie per aver aperto il ticket. Uno staff assegnerà manualmente il ruolo. Attendi in questo canale.")
      .setColor("#6f4e37");

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("close_ticket").setEmoji("<:VC_close:1478517239136256020>").setLabel("Chiudi").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("close_ticket_motivo").setEmoji("<:VC_reason:1478517122929004544>").setLabel("Chiudi Con Motivo").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("claim_ticket").setEmoji("<:VC_claim:1478517202016669887>").setLabel("Claim").setStyle(ButtonStyle.Success),
    );

    const mainMsg = await channel.send({ embeds: [sponsorEmbed], components: [row] }).catch(() => null);

    try {
      await createTicketDocWithGlobalId(Ticket, {
        guildId: guild.id,
        userId,
        channelId: channel.id,
        ticketType: "sponsor_supporto",
        open: true,
        messageId: mainMsg?.id || null,
        descriptionPromptMessageId: null,
        descriptionSubmitted: false,
      });
      global.logger?.info?.(
        `[ticket-open-debug] sponsor db create success channel=${channel.id} user=${userId}`,
      );
    } catch (err) {
      global.logger?.error?.(
        `[ticket-open-debug] sponsor db create failed channel=${channel?.id} user=${userId} err=${err?.message || err}`,
      );
      const isDuplicate = err?.code === 11000 || (err?.message && String(err.message).includes("E11000"));
      if (isDuplicate) {
        global.logger?.warn?.(
          `[ticket-open-debug] sponsor duplicate detected, deleting newly created channel=${channel?.id}`,
        );
        await channel.delete().catch(() => { });
        const other = await findOpenTicketByUser(guild.id, userId, guild);
        await safeEditReplyHelper(interaction, {
          embeds: [
            new EmbedBuilder()
              .setTitle("<:VC_Ticket:1482535175283019888> Ticket Aperto")
              .setDescription(`<a:VC_Alert:1482706673176150077> Hai già un ticket aperto${other?.channelId ? `: <#${other.channelId}>` : "."}`)
              .setColor("#6f4e37"),
          ],
          flags: 1 << 6,
        });
        return true;
      }
      global.logger.error(err);
      global.logger?.warn?.(
        `[ticket-open-debug] sponsor generic create failure, deleting channel=${channel?.id}`,
      );
      await channel.delete().catch(() => null);
      await safeEditReplyHelper(interaction, {
        embeds: [
          new EmbedBuilder()
            .setTitle("<a:VC_Alert:1482706673176150077> Errore")
            .setDescription("<:vegax:1443934876440068179> Impossibile creare il ticket, riprova.")
            .setColor("#6f4e37"),
        ],
        flags: 1 << 6,
      });
      return true;
    }

    await safeEditReplyHelper(interaction, {
      embeds: [
        new EmbedBuilder()
          .setTitle("<:VC_Ticket:1482535175283019888> Ticket Creato")
          .setDescription(`<:VC_open:1478517277279129712> Aperto un nuovo ticket: ${channel}`)
          .setColor("#6f4e37"),
      ],
      flags: 1 << 6,
    });
    return true;
  } finally {
    interaction.client.ticketOpenLocks.delete(ticketLockKey);
  }
}

async function createTicketsCategory(interaction, guild) {
  if (!guild) return null;
  if (!interaction.client.ticketCategoryCache) interaction.client.ticketCategoryCache = new Map();

  const getTopCategoryPosition = () => 0;
  const moveCategoryToTop = async (category) => {
    if (!category || category.type !== ChannelType.GuildCategory) return;
    await category.setPosition(getTopCategoryPosition()).catch(() => { });
  };
  const getChildrenCount = (categoryId) => guild.channels.cache.filter((ch) => ch.parentId === categoryId).size;

  const cachedCategoryId = interaction.client.ticketCategoryCache.get(guild.id);
  if (cachedCategoryId) {
    const cachedCategory = await getGuildChannelCached(guild, cachedCategoryId);
    if (cachedCategory && cachedCategory.type === ChannelType.GuildCategory && isTicketCategoryName(cachedCategory.name) && getChildrenCount(cachedCategory.id) < 50) {
      await moveCategoryToTop(cachedCategory);
      return cachedCategory;
    }
  }

  await warmGuildChannels(guild);
  const ticketCategories = guild.channels.cache
    .filter((ch) => ch.type === ChannelType.GuildCategory && isTicketCategoryName(ch.name))
    .sort((a, b) => a.rawPosition - b.rawPosition || a.id.localeCompare(b.id));

  const reusableCategory = ticketCategories.find((category) => getChildrenCount(category.id) < 50);
  if (reusableCategory) {
    await moveCategoryToTop(reusableCategory);
    interaction.client.ticketCategoryCache.set(guild.id, reusableCategory.id);
    return reusableCategory;
  }

  const category = await guild.channels.create({
    name: TICKETS_CATEGORY_NAME,
    position: getTopCategoryPosition(),
    type: ChannelType.GuildCategory,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    ],
  }).catch(() => null);
  if (!category) return null;

  await moveCategoryToTop(category);
  interaction.client.ticketCategoryCache.set(guild.id, category.id);
  return category;
}

module.exports = { createTicketsCategory, handleSponsorTicketOpen };