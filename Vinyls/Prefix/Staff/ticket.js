const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const Ticket = require("../../Schemas/Ticket/ticketSchema");
const { makeTicketErrorEmbed } = require("../../Utils/Ticket/ticketUxMessages");
const { TICKETS_CATEGORY_NAME, isChannelInTicketCategory } = require("../../Utils/Ticket/ticketCategoryUtils");
const { buildTicketChannelName, resolveTicketRenamePrefix, sanitizeTicketChannelTail } = require("../../Utils/Ticket/ticketNamingRuntime");
const { getTicketPanelConfig } = require("../../Utils/Ticket/ticketPanelConfig");
const { PERKS_STAFF_ROLE_IDS, PERKS_PING_ROLE_IDS, memberCanAccessPerksTicket, buildPerksPingMention } = require("../../Utils/Ticket/ticketPerksStaffRoles");
const { PARTNERSHIP_TICKET_STAFF_ROLE_IDS, memberCanAccessPartnershipTicket, buildPartnershipTicketReviewerCreateOverwrites, clearPartnershipTicketPermissionOverwrites, applyPartnershipTicketRoleOverwrites } = require("../../Utils/Ticket/ticketPartnershipStaffRoles");
const {
  TICKET_STAFF_SPECTATE_OVERWRITES,
  buildTicketStaffRoleCreateOverwrite,
  buildTicketEveryoneDenyViewCreateOverwrite,
  buildTicketOpenerCreateOverwrite,
  buildTicketRoleDenyViewCreateOverwrite,
  buildTicketRoleCreateOverwrite,
  applyHighStaffTicketWriteOverwrite,
  applyTicketStaffRoleOverwrites,
} = require("../../Utils/Ticket/ticketHighStaffOverwrites");
const { buildTicketPanelUnclaimedButtonRow } = require("../../Utils/Ticket/ticketAutoUnclaimOnStaffLoss");
const { buildClaimedControlButtons, resolveTicketPanel } = require("../../Utils/Ticket/ticketGuildOptions");
const IDs = require("../../Utils/Config/ids");
const { getClientGuildCached, getGuildChannelCached, getGuildMemberCached, } = require("../../Utils/Interaction/interactionEntityCache");
const { isDiscordTicketsEnabled, workflowMovedToSiteMessage, buildSiteLinkRow, siteWorkflowUrl } = require("../../Utils/Web/discordWorkflowUiGate");
const { buildSimpleNoticePayload } = require("../../Utils/Embeds/simpleNoticeEmbed");
const STAFF_ROLE_ID = IDs.roles.Staff;
const HIGHSTAFF_ROLE_ID = IDs.roles.HighStaff;
const PARTNERMANAGER_ROLE_ID = IDs.roles.PartnerManager;
const STAFF_ROLE_IDS = [
  IDs.roles.Founder,
  IDs.roles.Manager,
  IDs.roles.Admin,
  IDs.roles.Director,
  HIGHSTAFF_ROLE_ID,
  IDs.roles.SeniorModerator,
  IDs.roles.Mod,
  IDs.roles.Helper,
  STAFF_ROLE_ID,
].filter(Boolean);
const NO_REPLY_MENTIONS = { repliedUser: false };
const TICKET_SPECTATE_STAFF_ALLOW = [ PermissionFlagsBits.ViewChannel, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AddReactions ];
const TICKET_SPECTATE_STAFF_DENY = [PermissionFlagsBits.SendMessages];

function buildTicketPanelButtonRow(guildId, ticketDoc) {
  const panel = resolveTicketPanel(guildId, ticketDoc);
  if (ticketDoc?.claimedBy) {
    return (
      buildClaimedControlButtons(guildId, panel) ||
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("close_ticket").setEmoji("🔒").setLabel("Chiudi").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("close_ticket_motivo").setEmoji("🔒").setLabel("Chiudi Con Motivo").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("unclaim").setEmoji("<a:VC_Unlock:1482532082466029608>").setLabel("Unclaim").setStyle(ButtonStyle.Secondary),
      )
    );
  }
  return buildTicketPanelUnclaimedButtonRow(guildId, ticketDoc);
}

function hasAnyRole(member, roleIds = []) {
  return roleIds.some((roleId) => member?.roles?.cache?.has(roleId));
}

function memberCanAccessTicketPanelType(member, ticketType) {
  const type = String(ticketType || "")
    .trim()
    .toLowerCase();
  if (type === "perks") return memberCanAccessPerksTicket(member);
  if (type === "partnership") return memberCanAccessPartnershipTicket(member);
  if (type === "high" || type === "highstaff") {
    return Boolean(HIGHSTAFF_ROLE_ID && member?.roles?.cache?.has(HIGHSTAFF_ROLE_ID));
  }
  return STAFF_ROLE_IDS.some((id) => id && member?.roles?.cache?.has(id));
}

function messageIsPlusTicketStaffPanel(message) {
  if (!message?.components?.length) return false;
  for (const row of message.components) {
    for (const c of row.components || []) {
      const id = String(c.customId || "");
      if (id.startsWith("ticket_panel_nav_")) return true;
    }
  }
  return false;
}

async function refreshTicketStaffPanelsInChannel(channel, ticketDoc) {
  if (!channel?.messages?.fetch || !ticketDoc) return;
  const { buildTicketStaffPanelPayload } = require("../../Utils/Ticket/ticketStaffPanelBuild");
  const recent = await channel.messages.fetch({ limit: 40 }).catch(() => null);
  if (!recent) return;

  for (const panelMsg of recent.values()) {
    if (!messageIsPlusTicketStaffPanel(panelMsg) || !panelMsg.editable) continue;
    const refId = panelMsg.reference?.messageId;
    if (!refId) continue;
    const refMsg = recent.get(refId) || (await channel.messages.fetch(refId).catch(() => null));
    const authorId = refMsg?.author?.id;
    if (!authorId || refMsg?.author?.bot) continue;
    const member = await getGuildMemberCached(channel.guild, authorId).catch(() => null);
    if (!member) continue;
    const { embed, components } = buildTicketStaffPanelPayload(member, channel, ticketDoc);
    await panelMsg.edit({ embeds: [embed], components }).catch(() => {});
  }
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
  return makeTicketErrorEmbed(title, description);
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
  const base = [
    buildTicketEveryoneDenyViewCreateOverwrite(guild.roles.everyone.id),
    buildTicketOpenerCreateOverwrite(userId, [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.AttachFiles,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.AddReactions,
    ]),
  ];

  if (ticketType === "supporto") {
    base.push(
      buildTicketStaffRoleCreateOverwrite(STAFF_ROLE_ID),
      buildTicketStaffRoleCreateOverwrite(HIGHSTAFF_ROLE_ID),
      buildTicketRoleDenyViewCreateOverwrite(PARTNERMANAGER_ROLE_ID),
    );
  } else if (ticketType === "partnership") {
    for (const roleId of PARTNERSHIP_TICKET_STAFF_ROLE_IDS) {
      const entry = buildTicketStaffRoleCreateOverwrite(roleId);
      if (entry) base.push(entry);
    }
    base.push(...buildPartnershipTicketReviewerCreateOverwrites());
    base.push(buildTicketRoleDenyViewCreateOverwrite(STAFF_ROLE_ID));
  } else if (ticketType === "high") {
    base.push(
      buildTicketRoleCreateOverwrite(HIGHSTAFF_ROLE_ID, {
        allow: TICKET_SPECTATE_STAFF_ALLOW,
        deny: TICKET_SPECTATE_STAFF_DENY,
      }),
      buildTicketRoleDenyViewCreateOverwrite(STAFF_ROLE_ID),
      buildTicketRoleDenyViewCreateOverwrite(PARTNERMANAGER_ROLE_ID),
    );
  } else if (ticketType === "perks") {
    for (const roleId of PERKS_STAFF_ROLE_IDS) {
      const entry = buildTicketStaffRoleCreateOverwrite(roleId);
      if (entry) base.push(entry);
    }
    base.push(
      buildTicketRoleDenyViewCreateOverwrite(STAFF_ROLE_ID),
      buildTicketRoleDenyViewCreateOverwrite(PARTNERMANAGER_ROLE_ID),
    );
  }

  return base.filter((entry) => Boolean(entry?.id && entry?.type != null));
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
      buildTicketRoleCreateOverwrite(guild.roles.everyone.id, {
        deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
      }),
    ].filter(Boolean),
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
        const previousClaimedBy = String(ticketDoc.claimedBy || "").trim();
        const categoryChanged = previousTicketType !== panelConfig.type;
        let panelSwitchBehavior = "auto_unclaim";
        try {
          const { getTicketSettingsSync } = require("../../MultiGuild/core/tenantTicketSettings");
          panelSwitchBehavior = String(
            getTicketSettingsSync(message.guild?.id)?.panelSwitchBehavior || "auto_unclaim",
          )
            .trim()
            .toLowerCase();
          if (panelSwitchBehavior === "keep_claim") panelSwitchBehavior = "keep_access";
        } catch (_) {
          panelSwitchBehavior = "auto_unclaim";
        }

        let claimRemovedForSwitch = false;
        if (categoryChanged && previousClaimedBy) {
          const claimerMember = await getGuildMemberCached(message.guild, previousClaimedBy);
          const claimerHasNewAccess = memberCanAccessTicketPanelType(
            claimerMember,
            panelConfig.type,
          );
          if (panelSwitchBehavior === "deny_switch" && !claimerHasNewAccess) {
            await safeMessageReply(message, {
              embeds: [
                makeErrorEmbed(
                  "Switch bloccato",
                  `<:vegax:1443934876440068179> Chi ha claimato (<@${previousClaimedBy}>) non ha accesso al pannello **${panelConfig.label || panelConfig.name || panelConfig.type}**.`,
                ),
              ],
              allowedMentions: { repliedUser: false },
            });
            return false;
          }
                              if (panelSwitchBehavior === "auto_unclaim" && !claimerHasNewAccess) {
            ticketDoc.claimedBy = null;
            claimRemovedForSwitch = true;
          }
        }

        const openerMember = await getGuildMemberCached(message.guild, ticketDoc.userId);
        const openerName = openerMember?.user?.username || "utente";
        const newChannelName = buildTicketChannelName(
          panelConfig,
          openerName,
          ticketDoc.userId || "utente",
        );
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

        if (previousTicketType === "partnership" && panelConfig.type !== "partnership") {
          await clearPartnershipTicketPermissionOverwrites(targetChannel);
        }

        const applyReadOnly = TICKET_STAFF_SPECTATE_OVERWRITES;
        const roleHideFromTicket = { ViewChannel: false };

        if (panelConfig.type === "supporto") {
          await targetChannel.permissionOverwrites
            .edit(STAFF_ROLE_ID, applyReadOnly)
            .catch(() => { });
          await applyHighStaffTicketWriteOverwrite(targetChannel, HIGHSTAFF_ROLE_ID);
          await targetChannel.permissionOverwrites
            .edit(PARTNERMANAGER_ROLE_ID, roleHideFromTicket)
            .catch(() => { });
        }

        if (panelConfig.type === "partnership") {
          await applyPartnershipTicketRoleOverwrites(targetChannel);
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
          await applyTicketStaffRoleOverwrites(targetChannel, PERKS_STAFF_ROLE_IDS);
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
        } else if (previousClaimedBy && claimRemovedForSwitch) {
          if (panelSwitchBehavior === "keep_access") {
            await targetChannel.permissionOverwrites
              .edit(previousClaimedBy, {
                ViewChannel: true,
                SendMessages: false,
                EmbedLinks: true,
                AttachFiles: true,
                ReadMessageHistory: true,
                AddReactions: true,
              })
              .catch(() => { });
          } else {
            await targetChannel.permissionOverwrites
              .delete(previousClaimedBy)
              .catch(() => { });
          }
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
        const panelEmbed = panelConfig.embed
          ? EmbedBuilder.from(panelConfig.embed)
          : new EmbedBuilder().setColor("#6f4e37");
        if (claimRemovedForSwitch) {
          panelEmbed.setFooter({ text: "Claim rimosso per cambio categoria" });
        }
        if (msg) {
          await msg
            .edit({
              embeds: [panelEmbed],
              components: [buildTicketPanelButtonRow(message.guild?.id || ticketDoc.guildId, ticketDoc)],
            })
            .catch(() => { });
        }

        const refreshedTicketDoc = {
          channelId: targetChannel.id,
          open: true,
          userId: ticketDoc.userId,
          claimedBy: persistSet.claimedBy,
          guildId: ticketDoc.guildId,
          ticketNumber: ticketDoc.ticketNumber,
          ticketType: panelConfig.type,
        };
        await refreshTicketStaffPanelsInChannel(targetChannel, refreshedTicketDoc);

        await safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor("#6f4e37")
              .setTitle("Switch Panel")
              .setDescription(
                [
                  `<:vegacheckmark:1443666279058772028> Ticket aggiornato in **${panelConfig.label || panelConfig.name || panelConfig.type}** nel canale ${targetChannel}.`,
                  claimRemovedForSwitch
                    ? `<:VC_claim:1478517202016669887> Il claim di <@${previousClaimedBy}> è stato rimosso.`
                    : null,
                ].filter(Boolean).join("\n"),
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

  let ticketDoc = await Ticket.findOne({ guildId: guild.id, ticketNumber }, TICKET_REOPEN_BY_NUMBER_PROJECTION).lean().catch(() => null);
  if (!ticketDoc) {
    const { resolveClosedTicketByNumber } = require("../../Utils/Ticket/ticketStaffPanelBuild");
    ticketDoc = await resolveClosedTicketByNumber(guild.id, ticketNumber);
  }
  if (ticketDoc && !ticketDoc.guildId) ticketDoc.guildId = guild.id;

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

  const channelName = buildTicketChannelName(
    config,
    ticketMember.user.username,
    ticketMember.id,
  );

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
    new ButtonBuilder().setCustomId("close_ticket").setEmoji("🔒").setLabel("Chiudi").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("close_ticket_motivo").setEmoji("🔒").setLabel("Chiudi Con Motivo").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("claim_ticket").setEmoji("🙋‍♂️").setLabel("Claim").setStyle(ButtonStyle.Success),
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
  skipPrefix: true,
  name: "ticket",
  allowEmptyArgs: true,

  async execute(message, args = [], client) {
    if (!isDiscordTicketsEnabled()) {
      const url = siteWorkflowUrl("tickets");
      await safeMessageReply(message, {
        ...buildSimpleNoticePayload(workflowMovedToSiteMessage("tickets"), message.guild),
        components: [buildSiteLinkRow("Apri ticket sul sito", url)],
        allowedMentions: NO_REPLY_MENTIONS,
      });
      return;
    }
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