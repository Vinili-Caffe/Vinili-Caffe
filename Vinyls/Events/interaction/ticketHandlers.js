const { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits, ChannelType, } = require("discord.js");
const mongoose = require("mongoose");
const Ticket = require("../../Schemas/Ticket/ticketSchema");
const fs = require("fs");
const { safeReply: safeReplyHelper, safeEditReply: safeEditReplyHelper, } = require("../../../shared/discord/replyRuntime");
const IDs = require("../../Utils/Config/ids");
const { getTicketPanelConfig } = require("../../Utils/Ticket/ticketPanelConfig");
const { buildTicketChannelName } = require("../../Utils/Ticket/ticketNamingRuntime");
const { canUserHandleCloseRequest: runtimeCanUserHandleCloseRequest, countOpenTicketsByUser: runtimeCountOpenTicketsByUser, ensureClosableTicketOrReply: runtimeEnsureClosableTicketOrReply, findOpenTicketByUser: runtimeFindOpenTicketByUser, findTicketByChannel: runtimeFindTicketByChannel, getClientGuildCached: runtimeGetClientGuildCached, getGuildChannelCached: runtimeGetGuildChannelCached, getSelectedTicketAction: runtimeGetSelectedTicketAction, hasActiveTicketClaimer: runtimeHasActiveTicketClaimer, isHandledTicketInteraction: runtimeIsHandledTicketInteraction, isTicketRatingButton: runtimeIsTicketRatingButton, isTicketTranscriptButton: runtimeIsTicketTranscriptButton, loadTicketForChannelOrReply: runtimeLoadTicketForChannelOrReply, } = require("../../Utils/Ticket/ticketInteractionRuntime");
const { buildTicketClosedEmbed: runtimeBuildTicketClosedEmbed, buildTicketRatingRows: runtimeBuildTicketRatingRows, closeTicket: runtimeCloseTicket, } = require("../../Utils/Ticket/ticketCloseRuntime");
const { maybeDeferCloseForPartnerManagerShopAck } = require("../../Utils/Staff/partnerManagerShopAckRuntime");
const { createTicketsCategory: runtimeCreateTicketsCategory } = require("../../Utils/Ticket/ticketOpenRuntime");
const {
  createTicketDocWithGlobalId,
  isCounterUnavailableError,
  getNextTicketId,
} = require("../../Utils/Ticket/ticketIdUtils");
const { ensureMongoReady } = require("../../Utils/Database/mongoConnect");
const { handleTicketStaffPanelInteraction } = require("../../Utils/Ticket/ticketStaffPanelHandlers");
const { hasStaffTicketRole } = require("../../Utils/Ticket/ticketStaffPanelBuild");
const { replyTicketOpenPanel, deferTicketOpenPanel } = require("../../Utils/Ticket/ticketOpenMenuComponents");
const { buildTicketTranscriptViewUrl, transcriptViewExpired, } = require("../../Utils/Ticket/ticketTranscriptSecure");
const {
  makeTicketErrorEmbed,
  makeTicketSuccessEmbed,
  blacklistBlockedDescription,
  supportHoursBlockedDescription,
  transcriptReadyDescription,
  claimOverwriteWarnDescription,
  TICKET_FILE,
  TICKET_ICON,
  TICKET_CLAIM,
  TICKET_UX_COLOR,
} = require("../../Utils/Ticket/ticketUxMessages");
const { applyChannelPermissionOverwritesAfterUnclaim } = require("../../Utils/Ticket/ticketAutoUnclaimOnStaffLoss");
const {
  buildTicketControlButtons,
  buildClaimedControlButtons,
  buildOpenerPermissionList,
  buildStaffSpectateOverwrite,
  resolveTicketPanel,
  getTicketEmbedColor,
} = require("../../Utils/Ticket/ticketGuildOptions");
const { PERKS_STAFF_ROLE_IDS, PERKS_PING_ROLE_IDS } = require("../../Utils/Ticket/ticketPerksStaffRoles");
const { PARTNERSHIP_TICKET_STAFF_ROLE_IDS, memberCanAccessPartnershipTicket, memberHasTicketElevatedClosePrivileges, buildPartnershipTicketReviewerCreateOverwrites, applyPartnershipTicketRoleOverwrites, getPartnershipTicketStaffRoleIds } = require("../../Utils/Ticket/ticketPartnershipStaffRoles");
const { buildTeamPermissionOverwrites } = require("../../Utils/Ticket/ticketTeamOverwrites");
const { refreshTicketTeamsCache } = require("../../MultiGuild/core/tenantTicketTeams");
const {
  refreshTicketBlacklistCache,
  memberIsTicketBlacklisted,
} = require("../../MultiGuild/core/tenantTicketBlacklist");
const {
  buildTicketStaffRoleCreateOverwrite,
  buildTicketEveryoneDenyViewCreateOverwrite,
  buildTicketRoleDenyViewCreateOverwrite,
  buildTicketOpenerCreateOverwrite,
  toTicketRoleCreateOverwrite,
  applyHighStaffTicketWriteOverwrite,
  applyTicketStaffRoleOverwrites,
  editTicketMemberOverwrite,
  editTicketRoleOverwrite,
  TICKET_STAFF_SPECTATE_OVERWRITES,
} = require("../../Utils/Ticket/ticketHighStaffOverwrites");
const { getPartnerManagerRoleId, getPartnerBlacklistRoleId } = require("../../Utils/Partner/partnershipConfigResolver");
const {
  refreshTicketConfigCache,
  getTicketSettingsSync,
  isTicketTypeEnabled,
  getTicketPrimaryStaffRoleId,
} = require("../../MultiGuild/core/tenantTicketSettings");
const {
  refreshTicketPanelsCache,
  findGuildPanelById,
  findGuildPanelByOpenCustomId,
} = require("../../MultiGuild/core/tenantTicketPanels");
const {
  parsePanelOpenCustomId,
  isWithinSupportHours,
  memberPassesAccessRules,
  buildWelcomeEmbedFromPanel,
  buildOpenMentions,
  rewriteRoleNamesToMentions,
  roleIdsFromMentionOnOpen,
  collectDiscordMentionIds,
} = require("../../Utils/Ticket/ticketPanelOptions");
const { resolveTicketBotLanguage } = require("../../Utils/Ticket/ticketUiDefaults");
const {
  isTicketFormModal,
  parseFormOpenCustomId,
  buildTicketFormModal,
  readTicketFormAnswers,
  buildFormAnswersEmbed,
  resolvePanelOpenForm,
  ticketFormOpenBlockReason,
} = require("../../Utils/Ticket/ticketFormModalRuntime");
const { findGuildFormById, refreshTicketFormsCache } = require("../../MultiGuild/core/tenantTicketForms");
const { isDiscordTicketsEnabled, replyWorkflowMovedToSite } = require("../../Utils/Web/discordWorkflowUiGate");

function isLegacyTicketOpenAction(id) {
  return ["ticket_partnership", "ticket_supporto", "ticket_highstaff", "ticket_perks"].includes(String(id || ""));
}

function isTicketOpenAction(id) {
  return isLegacyTicketOpenAction(id) || String(id || "").startsWith("tkp:");
}

function ticketTypeToPanelKey(type) {
  const t = String(type || "").toLowerCase();
  if (t === "high") return "highstaff";
  return t;
}

async function handleTicketInteraction(interaction) {
  if (!isDiscordTicketsEnabled()) {
    await replyWorkflowMovedToSite(interaction, "tickets");
    return true;
  }
  const selectedTicketAction = runtimeGetSelectedTicketAction(interaction);
  let ticketActionId = selectedTicketAction || interaction.customId;
  let openFormDoc = null;
  let openFormAnswers = null;
  let openFormPanel = null;

  const { isTicketButton, isTicketSelect, isTicketModal, isTicketUserSelect } = runtimeIsHandledTicketInteraction(interaction);
  if (!isTicketButton && !isTicketModal && !isTicketSelect && !isTicketUserSelect) return false;
  await refreshTicketConfigCache().catch(() => null);
  await refreshTicketPanelsCache().catch(() => null);
  const guildId = interaction.guild?.id;

  if (isTicketModal && isTicketFormModal(String(interaction.customId || ""))) {
    await refreshTicketFormsCache().catch(() => null);
    const formPanelId = parseFormOpenCustomId(interaction.customId);
    const formPanel = findGuildPanelById(guildId, formPanelId);
    const formDoc = formPanel ? findGuildFormById(guildId, formPanel.formId) : null;
    if (!formPanel || !formDoc) {
      await safeReplyHelper(interaction, {
        embeds: [
          new EmbedBuilder()
            .setColor("#6f4e37")
            .setTitle("<a:VC_Alert:1482706673176150077> Errore")
            .setDescription("<:vegax:1443934876440068179> Form non trovato. Riprova dal pannello."),
        ],
        flags: 1 << 6,
      }).catch(() => null);
      return true;
    }
    openFormAnswers = readTicketFormAnswers(interaction, formDoc);
    const missingRequired = (openFormAnswers || []).some((row) => row.required && !row.value);
    if (missingRequired) {
      await safeReplyHelper(interaction, {
        embeds: [
          new EmbedBuilder()
            .setColor("#6f4e37")
            .setTitle("<a:VC_Alert:1482706673176150077> Errore")
            .setDescription("<:vegax:1443934876440068179> Compila tutti i campi obbligatori del form."),
        ],
        flags: 1 << 6,
      }).catch(() => null);
      return true;
    }
    openFormDoc = formDoc;
    openFormPanel = formPanel;
    ticketActionId = String(formPanel.openCustomId || "").trim() || `tkp:${formPanel.id}`;
  }
  const ticketSettings = getTicketSettingsSync(guildId);
  const LOG_CHANNEL =
    ticketSettings.transcriptChannelId ||
    ticketSettings.logChannelId ||
    IDs.channels.ticketLogs;
  const ticketEmbedColor = getTicketEmbedColor(guildId);
  const ROLE_STAFF = ticketSettings.staffRoleId || IDs.roles.Staff;
  const ROLE_HIGHSTAFF = ticketSettings.highStaffRoleId || IDs.roles.HighStaff;
  const ROLE_PARTNERMANAGER = getPartnerManagerRoleId(guildId) || IDs.roles.PartnerManager;
  const ROLE_USER = ticketSettings.memberRoleId || IDs.roles?.Member || null;
  const ROLE_TICKETPARTNER_BLACKLIST = getPartnerBlacklistRoleId(guildId) || IDs.roles.blackilistPartner;
  const ROLE_TICKET_BLACKLIST = ticketSettings.blacklistRoleId || IDs.roles.blacklistTicket;
  const STAFF_ROLES = [ROLE_STAFF, ROLE_HIGHSTAFF];

  if (!interaction.client.ticketCloseLocks || !(interaction.client.ticketCloseLocks instanceof Map)) {
    interaction.client.ticketCloseLocks = new Map();
  }
  if (!interaction.client.ticketActionLocks) {
    interaction.client.ticketActionLocks = new Set();
  }
  const TICKET_PERMISSIONS = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AddReactions,];
  const TICKET_ROLE_SPECTATE = { ViewChannel: true, SendMessages: false, ReadMessageHistory: true, EmbedLinks: true, AttachFiles: true, AddReactions: true,};
  const openerPermsForGuild = (guildId) => buildOpenerPermissionList(guildId) || TICKET_PERMISSIONS;
  const spectateForGuild = (guildId) => buildStaffSpectateOverwrite(guildId) || TICKET_ROLE_SPECTATE;
  
  async function safeReply(target, payload) {
    return safeReplyHelper(target, payload);
  }

  function safeEditReply(target, payload) {
    return safeEditReplyHelper(target, payload);
  }

  async function openPanelReply(payload) {
    return replyTicketOpenPanel(interaction, payload, safeReply);
  }

  function makeErrorEmbed(title, description) {
    return makeTicketErrorEmbed(title, description);
  }

  function isHighStaffActor() {
    return Boolean(
      ROLE_HIGHSTAFF && interaction.member?.roles?.cache?.has(ROLE_HIGHSTAFF),
    );
  }

  function isTicketCloseElevatedActor(ticketDoc = null) {
    return memberHasTicketElevatedClosePrivileges(interaction.member, ticketDoc);
  }

  function getTicketActionLockKey(actionGroup, channelId = interaction.channel?.id) {
    return `${interaction.guildId || "noguild"}:${channelId || "nochannel"}:${actionGroup}`;
  }

  async function acquireTicketActionLock(actionGroup, channelId = interaction.channel?.id) {
    const lockKey = getTicketActionLockKey(actionGroup, channelId);
    if (interaction.client.ticketActionLocks.has(lockKey)) {
      let suffix = "";
      if (channelId) {
        const t = await Ticket.findOne({ channelId, open: true }, { claimedBy: 1 }).lean().catch(() => null);
        const cid = t?.claimedBy != null ? String(t.claimedBy).trim() : "";
        if (cid) { suffix = `\n\n<:VC_claim:1478517202016669887> **Claimato da** <@${cid}>`; }
      }
      await openPanelReply({
        embeds: [
          makeErrorEmbed(
            "<a:VC_Loading:1482526818278969578> Attendi",
            "<a:VC_Alert:1482706673176150077> Un altro staff sta completando un'azione su questo ticket. Riprova tra un secondo." + suffix,
          ),
        ],
        flags: 1 << 6,
      });
      return null;
    }
    interaction.client.ticketActionLocks.add(lockKey);
    return lockKey;
  }

  function releaseTicketActionLock(lockKey) {
    if (!lockKey) return;
    try {
      interaction.client.ticketActionLocks?.delete(lockKey);
    } catch (e) {
      global.logger?.warn?.("[ticketHandlers] releaseTicketActionLock:", e?.message || e);
    }
  }

  async function acknowledgeRejectClosePrompt(interaction, bodyText) {
    const embed = new EmbedBuilder()
      .setTitle("<:VC_PinkQuestionMark:1471892611026391306> • **__RICHIESTA DI CHIUSURA__**")
      .setDescription(bodyText)
      .setColor("Red");
    const payload = { embeds: [embed], components: [] };
    try {
      await interaction.deferUpdate();
      if (interaction.message) {
        await interaction.message.edit(payload).catch((e) => {
          global.logger?.warn?.("[ticketHandlers] rejectClose message.edit:", e?.message || e);
        });
      }
      return;
    } catch (e1) {
      global.logger?.warn?.("[ticketHandlers] rejectClose defer+edit:", e1?.message || e1);
    }
    try {
      await interaction.update(payload);
    } catch (e2) {
      global.logger?.warn?.("[ticketHandlers] rejectClose update:", e2?.message || e2);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ ...payload, flags: 1 << 6 });
        } else {
          await interaction.followUp({ embeds: payload.embeds, flags: 1 << 6 });
        }
      } catch (e3) {
        global.logger?.warn?.("[ticketHandlers] rejectClose reply fallback:", e3?.message || e3);
      }
    }
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

  try {
    const staffPanelHandled = await handleTicketStaffPanelInteraction(interaction, {
      safeReply,
      makeErrorEmbed,
    });
    if (staffPanelHandled) return true;

    if (isTicketButton || isTicketSelect || openFormDoc) {
      const isDmSafeTicketAction = runtimeIsTicketRatingButton(interaction.customId) || runtimeIsTicketTranscriptButton(interaction.customId);
      if ((!interaction.guild || !interaction.member) && !isDmSafeTicketAction) {
        await safeReply(interaction, {
          embeds: [
            makeErrorEmbed(
              "<a:VC_Alert:1482706673176150077> Errore",
              "<:vegax:1443934876440068179> Interazione non valida.",
            ),
          ],
          flags: 1 << 6,
        });
        return true;
      }
      const partnerOpenButtons = ["ticket_partnership"];
      const storedPanelId = parsePanelOpenCustomId(ticketActionId);
      const storedPanel =
        openFormPanel ||
        (storedPanelId ? findGuildPanelById(guildId, storedPanelId) : null) ||
        findGuildPanelByOpenCustomId(guildId, ticketActionId) ||
        null;
      const isOpenAction = isTicketOpenAction(ticketActionId);
      const openTicketType = storedPanel
        ? String(storedPanel.ticketType || "supporto")
        : ticketActionId === "ticket_partnership"
          ? "partnership"
          : ticketActionId === "ticket_highstaff"
            ? "high"
            : ticketActionId === "ticket_perks"
              ? "perks"
              : ticketActionId === "ticket_supporto"
                ? "supporto"
                : "";
      if (
        (partnerOpenButtons.includes(ticketActionId) || openTicketType === "partnership") &&
        interaction.member?.roles?.cache?.has(ROLE_TICKETPARTNER_BLACKLIST)
      ) {
        await safeReply(interaction, {
          embeds: [
            new EmbedBuilder()
              .setColor(TICKET_UX_COLOR)
              .setDescription(blacklistBlockedDescription("partner", guildId)),
          ],
          flags: 1 << 6,
        });
        return true;
      }
      if (isOpenAction && ticketSettings.enabled !== true) {
        await openPanelReply({
          embeds: [
            makeErrorEmbed(
              "Errore",
              "<:vegax:1443934876440068179> I ticket non sono attivi su questo server.",
            ),
          ],
          flags: 1 << 6,
        });
        return true;
      }
      if (isOpenAction && interaction.member?.roles?.cache?.has(ROLE_TICKET_BLACKLIST)) {
        await openPanelReply({
          embeds: [
            new EmbedBuilder()
              .setColor(TICKET_UX_COLOR)
              .setDescription(blacklistBlockedDescription("ticket", guildId)),
          ],
          flags: 1 << 6,
        });
        return true;
      }
      if (isOpenAction) {
        await refreshTicketBlacklistCache().catch(() => null);
        if (memberIsTicketBlacklisted(interaction.member, guildId, storedPanel?.id || null)) {
          await openPanelReply({
            embeds: [
              new EmbedBuilder()
                .setColor(TICKET_UX_COLOR)
                .setDescription(blacklistBlockedDescription("ticket", guildId)),
            ],
            flags: 1 << 6,
          });
          return true;
        }
      }
      if (storedPanel?.disabled === true) {
        await openPanelReply({
          embeds: [
            makeErrorEmbed(
              "<a:VC_Alert:1482706673176150077> Errore",
              "<:vegax:1443934876440068179> Questo pannello è disabilitato.",
            ),
          ],
          flags: 1 << 6,
        });
        return true;
      }
      if (storedPanel && !memberPassesAccessRules(interaction.member, storedPanel.accessRules)) {
        await openPanelReply({
          embeds: [
            makeErrorEmbed(
              "<a:VC_Alert:1482706673176150077> Errore",
              "<:vegax:1443934876440068179> Non hai accesso a questo pannello ticket.",
            ),
          ],
          flags: 1 << 6,
        });
        return true;
      }
      if (storedPanel) {
        const hoursGate = isWithinSupportHours(storedPanel.supportHours);
        if (!hoursGate.ok) {
          await openPanelReply({
            embeds: [
              makeErrorEmbed(
                "Fuori orario",
                supportHoursBlockedDescription(storedPanel.supportHours, hoursGate),
              ),
            ],
            flags: 1 << 6,
          });
          return true;
        }
      }
      const userOnlyTypes = ["partnership", "high", "perks"];
      if (userOnlyTypes.includes(openTicketType) || ["ticket_partnership", "ticket_highstaff", "ticket_perks"].includes(ticketActionId)) {
        if (!ROLE_USER) {
          await openPanelReply({
            embeds: [
              makeErrorEmbed(
                "<a:VC_Alert:1482706673176150077> Errore",
                "<:vegax:1443934876440068179> Ruolo Member non configurato. Contatta lo staff.",
              ),
            ],
            flags: 1 << 6,
          });
          return true;
        }
        let memTicket = interaction.member;
        if (
          interaction.guild &&
          memTicket &&
          (!memTicket.roles?.cache?.size || memTicket.partial)
        ) {
          memTicket =
            (await interaction.guild.members
              .fetch(interaction.user.id)
              .catch(() => null)) || memTicket;
        }
        if (!memTicket?.roles?.cache?.has(ROLE_USER)) {
          await openPanelReply({
            embeds: [
              makeErrorEmbed(
                "<a:VC_Alert:1482706673176150077> Errore",
                "<:vegax:1443934876440068179> Devi avere il ruolo Member per aprire un ticket.",
              ),
            ],
            flags: 1 << 6,
          });
          return true;
        }
      }
      const panelByAction = { ticket_supporto: "supporto", ticket_partnership: "partnership", ticket_highstaff: "highstaff", ticket_perks: "perks" };
      const panelKey = storedPanel
        ? ticketTypeToPanelKey(storedPanel.ticketType)
        : panelByAction[ticketActionId] || "";
      const ticketBotLang = resolveTicketBotLanguage(guildId, interaction.guild);
      const panelConfig = panelKey ? getTicketPanelConfig(panelKey, ticketBotLang) : null;
      if (panelConfig && !isTicketTypeEnabled(guildId, panelConfig.type)) {
        await openPanelReply({
          embeds: [
            makeErrorEmbed(
              "<a:VC_Alert:1482706673176150077> Errore",
              "<:vegax:1443934876440068179> Questa categoria ticket non è attiva.",
            ),
          ],
          flags: 1 << 6,
        });
        return true;
      }
      if (String(ticketActionId || "").startsWith("tkp:") && !storedPanel) {
        await openPanelReply({
          embeds: [
            makeErrorEmbed(
              "<a:VC_Alert:1482706673176150077> Errore",
              "<:vegax:1443934876440068179> Pannello ticket non trovato. Ripubblica il pannello dalla dashboard.",
            ),
          ],
          flags: 1 << 6,
        });
        return true;
      }
      const resolvedTypeStaffRole =
        panelConfig ? getTicketPrimaryStaffRoleId(guildId, panelConfig.type) : null;
      const config = panelConfig
        ? {
          ...panelConfig,
          role:
            resolvedTypeStaffRole ||
            (panelConfig.type === "supporto"
              ? ROLE_STAFF
              : panelConfig.type === "partnership"
                ? ROLE_PARTNERMANAGER
                : panelConfig.type === "perks"
                  ? null
                  : ROLE_HIGHSTAFF),
          requiredRoles:
            panelConfig.type === "supporto"
              ? []
              : ROLE_USER
                ? [ROLE_USER]
                : [],
          embed:
            buildWelcomeEmbedFromPanel(storedPanel?.welcome, panelConfig.embed, ticketBotLang) ||
            panelConfig.embed,
          storedPanel,
        }
        : null;
      if (
        !config &&
        !["claim_ticket", "close_ticket", "close_ticket_confirm", "close_ticket_cancel", "close_ticket_motivo", "accetta", "rifiuta", "ticket_autoclose_accept", "ticket_autoclose_reject", "unclaim"].includes(interaction.customId) &&
        !runtimeIsTicketTranscriptButton(interaction.customId) &&
        !runtimeIsTicketRatingButton(interaction.customId)
      ) {
        await openPanelReply({
          embeds: [
            makeErrorEmbed(
              "<a:VC_Alert:1482706673176150077> Errore",
              "<:vegax:1443934876440068179> Categoria non valida. Riprova dal pannello.",
            ),
          ],
          flags: 1 << 6,
        });
        return true;
      }
      if (config) {
        if (!openFormDoc && isOpenAction && storedPanel?.id) {
          const openForm = await resolvePanelOpenForm(guildId, storedPanel);
          if (openForm) {
            const formModal = buildTicketFormModal(openForm, storedPanel.id);
            if (formModal) {
              try {
                await interaction.showModal(formModal);
              } catch (err) {
                global.logger?.error?.("[ticketHandlers] form modal:", err);
                await openPanelReply({
                  embeds: [
                    makeErrorEmbed(
                      "<a:VC_Alert:1482706673176150077> Errore",
                      "<:vegax:1443934876440068179> Impossibile aprire il form. Riprova.",
                    ),
                  ],
                  flags: 1 << 6,
                });
              }
              return true;
            }
            const blockReason = ticketFormOpenBlockReason(openForm);
            if (blockReason) {
              await openPanelReply({
                embeds: [
                  makeErrorEmbed(
                    "<a:VC_Alert:1482706673176150077> Form non apribile",
                    `<:vegax:1443934876440068179> ${blockReason}`,
                  ),
                ],
                flags: 1 << 6,
              });
              return true;
            }
          }
        }
        if (!interaction.client.ticketOpenLocks) {
          interaction.client.ticketOpenLocks = new Set();
        }
        const ticketLockKey = `${interaction.guild.id}:${interaction.user.id}`;
        if (interaction.client.ticketOpenLocks.has(ticketLockKey)) {
          await openPanelReply({
            embeds: [
              makeErrorEmbed(
                "<a:VC_Loading:1482526818278969578> Attendi",
                "<:VC_Attention:1482534443632558151> Sto già aprendo un ticket.",
              ),
            ],
            flags: 1 << 6,
          });
          return true;
        }
        interaction.client.ticketOpenLocks.add(ticketLockKey);
        try {
          if (!interaction.deferred && !interaction.replied) {
            try {
              const deferredOpen = await deferTicketOpenPanel(interaction);
              if (!deferredOpen) {
                await interaction.deferReply({ flags: 1 << 6 }).catch(() => { });
              }
            } catch (err) {
              global.logger?.warn?.("[ticketHandlers] ", err?.message || err);
            }
          }
          let memOpen = interaction.member;
          if (interaction.guild && memOpen && (!memOpen.roles?.cache?.size || memOpen.partial)) { memOpen = (await interaction.guild.members.fetch(interaction.user.id).catch(() => null)) || memOpen; }
          if (["ticket_partnership", "ticket_highstaff", "ticket_perks"].includes(ticketActionId) || ["partnership", "high", "perks"].includes(openTicketType)) {
            if (!ROLE_USER || !memOpen?.roles?.cache?.has(ROLE_USER)) {
              await openPanelReply({
                embeds: [
                  makeErrorEmbed(
                    "<a:VC_Alert:1482706673176150077> Errore",
                    "<:vegax:1443934876440068179> Devi avere il ruolo Member per aprire questo ticket.",
                  ),
                ],
                flags: 1 << 6,
              });
              return true;
            }
          }
          if (config.requiredRoles?.length > 0) {
            const hasRole = config.requiredRoles.some((r) => memOpen?.roles?.cache?.has(r));
            if (!hasRole) {
              await openPanelReply({
                embeds: [
                  makeErrorEmbed(
                    "<a:VC_Alert:1482706673176150077> Errore",
                    "<:vegax:1443934876440068179> Non hai i requisiti per aprire questo ticket.",
                  ),
                ],
                flags: 1 << 6,
              });
              return true;
            }
          }
          const panelMax = storedPanel?.maxOpenTicketsPerUser;
          const maxOpen = Math.max(
            1,
            Math.min(
              25,
              Number(
                panelMax != null && Number(panelMax) > 0
                  ? panelMax
                  : ticketSettings.maxOpenTicketsPerUser,
              ) || 1,
            ),
          );
          const cooldownSec = Math.max(0, Number(storedPanel?.openCooldownSeconds) || 0);
          if (cooldownSec > 0) {
            if (!interaction.client.ticketOpenCooldowns) {
              interaction.client.ticketOpenCooldowns = new Map();
            }
            const cdKey = `${interaction.guild.id}:${interaction.user.id}:${storedPanel?.id || ticketActionId}`;
            const lastAt = Number(interaction.client.ticketOpenCooldowns.get(cdKey) || 0);
            const leftMs = cooldownSec * 1000 - (Date.now() - lastAt);
            if (leftMs > 0) {
              await openPanelReply({
                embeds: [
                  makeErrorEmbed(
                    "<a:VC_Loading:1482526818278969578> Cooldown",
                    `<:VC_Attention:1482534443632558151> Puoi riaprire tra **${Math.ceil(leftMs / 1000)}s**.`,
                  ),
                ],
                flags: 1 << 6,
              });
              return true;
            }
          }
          const openCounted = await runtimeCountOpenTicketsByUser(
            interaction.guild.id,
            interaction.user.id,
            interaction.guild,
          );
          if (openCounted.count >= maxOpen) {
            const existing = openCounted.tickets[0];
            const limitMsg =
              maxOpen <= 1
                ? `<a:VC_Alert:1482706673176150077> Hai già un ticket aperto${existing?.channelId ? `: <#${existing.channelId}>` : "."}`
                : `<a:VC_Alert:1482706673176150077> Hai già ${openCounted.count}/${maxOpen} ticket aperti${existing?.channelId ? `. Es. <#${existing.channelId}>` : "."}`;
            await openPanelReply({
              embeds: [
                new EmbedBuilder()
                  .setTitle("<:VC_open:1478517277279129712> • **__TICKET APERTO__**")
                  .setDescription(limitMsg)
                  .setColor(ticketEmbedColor),
              ],
              flags: 1 << 6,
            });
            return true;
          }
          const ticketsCategory = await runtimeCreateTicketsCategory(interaction, interaction.guild, {
            categoryId: storedPanel?.categoryId || null,
          });
          if (!ticketsCategory) {
            await openPanelReply({
              embeds: [
                makeErrorEmbed(
                  "<a:VC_Alert:1482706673176150077> Errore",
                  "<:vegax:1443934876440068179> Impossibile creare o trovare la categoria.",
                ),
              ],
              flags: 1 << 6,
            });
            return true;
          }
          const openAgain = await runtimeCountOpenTicketsByUser(
            interaction.guild.id,
            interaction.user.id,
            interaction.guild,
          );
          if (openAgain.count >= maxOpen) {
            const existingAgain = openAgain.tickets[0];
            await openPanelReply({
              embeds: [
                new EmbedBuilder()
                  .setTitle("<:VC_open:1478517277279129712> • **__TICKET APERTO__**")
                  .setDescription(
                    maxOpen <= 1
                      ? `<a:VC_Alert:1482706673176150077> Hai già un ticket aperto${existingAgain?.channelId ? `: <#${existingAgain.channelId}>` : "."}`
                      : `<a:VC_Alert:1482706673176150077> Hai già raggiunto il limite di ${maxOpen} ticket aperti.`,
                  )
                  .setColor(ticketEmbedColor),
              ],
              flags: 1 << 6,
            });
            return true;
          }
          await ensureMongoReady({ maxWaitMs: 20_000 }).catch(() => null);
          let reservedTicketNumber = null;
          try {
            reservedTicketNumber = await getNextTicketId(interaction.guild.id);
          } catch (_) {
            reservedTicketNumber = null;
          }
          const openerPerms = buildOpenerPermissionList(guildId, storedPanel?.ticketPerms) || openerPermsForGuild(guildId);
          const channelName = buildTicketChannelName(
            config,
            interaction.user?.username,
            interaction.user?.id || "utente",
          );
          let channel = null;
          if (storedPanel?.threadMode === true) {
            const parentId =
              storedPanel.threadNotificationChannelId ||
              storedPanel.channelId ||
              interaction.channelId;
            const parent =
              (await runtimeGetGuildChannelCached(interaction.guild, parentId).catch(() => null)) ||
              interaction.channel;
            if (parent?.threads?.create) {
              channel = await parent.threads
                .create({
                  name: String(channelName).slice(0, 100),
                  type: ChannelType.PrivateThread,
                  invitable: true,
                  autoArchiveDuration: 10080,
                  reason: "Ticket thread",
                })
                .catch((err) => {
                  global.logger.error(err);
                  return null;
                });
              if (channel) {
                await channel.members.add(interaction.user.id).catch(() => null);
              }
            }
          }
          if (!channel) {
            await refreshTicketTeamsCache().catch(() => null);
            const teamOverwrites = buildTeamPermissionOverwrites({
              guildId,
              guild: interaction.guild,
              supportTeamIds: storedPanel?.supportTeamIds,
              openerId: interaction.user.id,
              openerPerms,
            });
            const legacyOverwrites = [
              buildTicketEveryoneDenyViewCreateOverwrite(interaction.guild.roles.everyone.id),
              buildTicketOpenerCreateOverwrite(interaction.user.id, openerPerms),
              ...(config.type === "supporto"
                ? [
                    buildTicketStaffRoleCreateOverwrite(ROLE_STAFF),
                    buildTicketStaffRoleCreateOverwrite(ROLE_HIGHSTAFF),
                    buildTicketRoleDenyViewCreateOverwrite(ROLE_PARTNERMANAGER),
                  ].filter(Boolean)
                : []),
              ...(config.type === "partnership"
                ? [
                    ...getPartnershipTicketStaffRoleIds(guildId).map((roleId) => buildTicketStaffRoleCreateOverwrite(roleId)),
                    ...buildPartnershipTicketReviewerCreateOverwrites(),
                    buildTicketRoleDenyViewCreateOverwrite(ROLE_STAFF),
                  ].filter(Boolean)
                : []),
              ...(config.type === "high"
                ? [
                    toTicketRoleCreateOverwrite(ROLE_HIGHSTAFF, spectateForGuild(guildId)),
                    buildTicketRoleDenyViewCreateOverwrite(ROLE_STAFF),
                    buildTicketRoleDenyViewCreateOverwrite(ROLE_PARTNERMANAGER),
                  ].filter(Boolean)
                : []),
              ...(config.type === "perks"
                ? [
                    ...PERKS_STAFF_ROLE_IDS.map((roleId) => buildTicketStaffRoleCreateOverwrite(roleId)),
                    buildTicketRoleDenyViewCreateOverwrite(ROLE_STAFF),
                    buildTicketRoleDenyViewCreateOverwrite(ROLE_PARTNERMANAGER),
                  ].filter(Boolean)
                : []),
            ];
            channel = await interaction.guild.channels.create({
              name: channelName,
              type: 0,
              parent: ticketsCategory.id,
              permissionOverwrites: teamOverwrites && teamOverwrites.length ? teamOverwrites : legacyOverwrites,
            }).catch((err) => {
              global.logger.error(err);
              return null;
            });
          }
          if (!channel) {
            await openPanelReply({
              embeds: [
                makeErrorEmbed(
                  "<a:VC_Alert:1482706673176150077> Errore",
                  "<:vegax:1443934876440068179> Impossibile creare il canale.",
                ),
              ],
              flags: 1 << 6,
            });
            return true;
          }
          try {
            const { scheduleDiscordAutomodRulesResync } = require("../../Services/Moderation/discordAutomodRulesService");
            scheduleDiscordAutomodRulesResync(interaction.client);
          } catch (_) {}
          let tagRole = config.type === "partnership" ? ROLE_PARTNERMANAGER : config.role;
          const supportIds =
            Array.isArray(storedPanel?.supportRoleIds) && storedPanel.supportRoleIds.length
              ? storedPanel.supportRoleIds.map(String)
              : config.type === "perks"
                ? [...PERKS_PING_ROLE_IDS].map(String)
                : tagRole
                  ? [String(tagRole)]
                  : [];
                    if (config.type === "perks") {
            for (const id of PERKS_PING_ROLE_IDS.map(String).filter(Boolean)) {
              if (!supportIds.includes(id)) supportIds.push(id);
            }
          }
          const mentionPayload = buildOpenMentions({
            mentionOnOpen: storedPanel?.mentionOnOpen,
            supportRoleIds: supportIds,
            userId: interaction.user.id,
            fallbackStaffRoleId: null,
          });
          const mentionContent = mentionPayload.content;
          const mentionAllowed = mentionPayload.allowedMentions;
                    const pingRoleIds = [
            ...roleIdsFromMentionOnOpen(storedPanel?.mentionOnOpen),
            ...supportIds,
          ];
          try {
            let desc = String(config.embed?.data?.description || "").trim();
            if (desc && typeof config.embed.setDescription === "function") {
              const rewritten = rewriteRoleNamesToMentions(desc, interaction.guild, pingRoleIds);
              if (rewritten.text !== desc) config.embed.setDescription(rewritten.text);
            }
          } catch (_) {}
          const mentionMsg = mentionContent
            ? await channel
                .send({
                  content: mentionContent,
                  allowedMentions: mentionAllowed,
                })
                .catch((err) => {
                  global.logger?.error?.("[ticketHandlers] open mention send:", err?.message || err);
                  return null;
                })
            : null;
                    if (mentionMsg && storedPanel?.deleteMentionsOnOpen === true) {
                        const mentionCleanupTimer = setTimeout(() => {
              mentionMsg.delete().catch(() => { });
            }, 2500);
            mentionCleanupTimer.unref?.();
          }
          const row = buildTicketControlButtons(guildId, storedPanel) || new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("close_ticket").setEmoji("🔒").setLabel("Chiudi").setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId("close_ticket_motivo").setEmoji("🔒").setLabel("Chiudi Con Motivo").setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId("claim_ticket").setEmoji("🙋‍♂️").setLabel("Claim").setStyle(ButtonStyle.Success),);
                    const welcomeMentionIds = collectDiscordMentionIds(
            String(config.embed?.data?.description || ""),
          );
          const mainMsg = await channel
            .send({
              embeds: [config.embed],
              components: row ? [row] : [],
              allowedMentions: mentionContent
                ? { parse: [] }
                : {
                    parse: [],
                    users: welcomeMentionIds.users,
                    roles: welcomeMentionIds.roles,
                  },
            })
            .catch((err) => {
              global.logger.error(err);
              return null;
            });
          if (mainMsg && typeof channel.pin === "function") {
            await pinFirstTicketMessage(channel, mainMsg);
          }
          if (Array.isArray(openFormAnswers) && openFormAnswers.length) {
            const answersEmbed = buildFormAnswersEmbed(openFormDoc, openFormAnswers, ticketEmbedColor);
            if (answersEmbed) {
              await channel.send({ embeds: [answersEmbed] }).catch((err) => {
                global.logger?.error?.("[ticketHandlers] form answers embed:", err?.message || err);
              });
            }
          }
          let ticketCreated = false;
          let lastCreateError = null;
          let createdTicketDoc = null;
          for (let attempt = 0; attempt < 6; attempt += 1) {
            try {
              createdTicketDoc = await createTicketDocWithGlobalId(Ticket, {
                guildId: interaction.guild.id,
                userId: interaction.user.id,
                channelId: channel.id,
                ticketType: config.type,
                panelId: storedPanel?.id ? String(storedPanel.id) : null,
                open: true,
                messageId: mainMsg?.id || null,
                descriptionPromptMessageId: null,
                descriptionSubmitted: Array.isArray(openFormAnswers) && openFormAnswers.length > 0,
                descriptionText:
                  Array.isArray(openFormAnswers) && openFormAnswers.length
                    ? openFormAnswers
                        .map((row) => `${String(row.label || "Campo").trim()}\n${String(row.value || "—").trim()}`)
                        .join("\n\n")
                        .slice(0, 4000)
                    : "",
                ...(Number(reservedTicketNumber) > 0 ? { ticketNumber: reservedTicketNumber } : {}),
              });
              ticketCreated = true;
              break;
            } catch (err) {
              lastCreateError = err;
              const isDuplicate = err?.code === 11000 || (err?.message && String(err.message).includes("E11000"));
              if (isDuplicate) {
                await channel.delete().catch(() => { });
                const other = await runtimeFindOpenTicketByUser(interaction.guild.id, interaction.user.id, interaction.guild);
                await openPanelReply({
                  embeds: [
                    new EmbedBuilder()
                      .setTitle("<:VC_open:1478517277279129712> • **__TICKET APERTO__**")
                      .setDescription( `<a:VC_Alert:1482706673176150077> Hai già un ticket aperto ${other?.channelId ? ": <#" + other.channelId + ">" : "."}`)
                      .setColor(ticketEmbedColor),
                  ],
                  flags: 1 << 6,
                });
                return true;
              }
              if (isCounterUnavailableError(err) && attempt < 5) {
                await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
                await ensureMongoReady({ maxWaitMs: 8000 }).catch(() => null);
                continue;
              }
              global.logger.error(err);
              break;
            }
          }
          if (!ticketCreated && lastCreateError) {
            const { reconcileSingleTicketChannel } = require("../../Services/Ticket/ticketOrphanReconcileService");
            const repaired = await reconcileSingleTicketChannel(
              channel,
              interaction.guild,
              interaction.client?.user?.id,
            ).catch(() => null);
            if (repaired?.status === "created" || repaired?.status === "reopened") {
              ticketCreated = true;
            }
          }
          if (!ticketCreated) {
            await channel.delete().catch(() => { });
            await openPanelReply({
              embeds: [
                makeErrorEmbed(
                  "<a:VC_Alert:1482706673176150077> Errore",
                  "<:vegax:1443934876440068179> Impossibile creare il ticket, riprova.",
                ),
              ],
              flags: 1 << 6,
            });
            return true;
          }
          if (cooldownSec > 0) {
            if (!interaction.client.ticketOpenCooldowns) {
              interaction.client.ticketOpenCooldowns = new Map();
            }
            const cdKey = `${interaction.guild.id}:${interaction.user.id}:${storedPanel?.id || ticketActionId}`;
            interaction.client.ticketOpenCooldowns.set(cdKey, Date.now());
          }
          await openPanelReply({
            embeds: [
              new EmbedBuilder()
                .setTitle("<:success:1461731530333229226> • **__TICKET CREATO__**")
                .setDescription(`<:VC_Ticket:1482535175283019888> Aperto un nuovo ticket: <#${channel.id}>.`)
                .setColor("#6f4e37"),
            ],
            flags: 1 << 6,
          });
          return true;
        } finally { interaction.client.ticketOpenLocks.delete(ticketLockKey) }
      }
      if (runtimeIsTicketRatingButton(interaction.customId)) {
        const clearRatingButtonsFromMessage = async (ticketDbIdForButtons) => {
          const sourceMessage = interaction?.message;
          if (!sourceMessage?.edit || !Array.isArray(sourceMessage.components)) return;
          const keepRows = sourceMessage.components.filter((row) => {
            const items = Array.isArray(row?.components) ? row.components : [];
            return !items.some((component) => String(component?.customId || "").startsWith(`ticket_rate:${ticketDbIdForButtons}:`));
          });
          await sourceMessage.edit({ components: keepRows }).catch(() => {});
        };
        const ratingParts = String(interaction.customId).split(":");
        if (ratingParts.length !== 3) {
          await safeReply(interaction, {
            embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Valutazione non valida.")],
            flags: 1 << 6,
          });
          return true;
        }
        const [, ticketDbId, scoreRaw] = ratingParts;
        const score = Number(scoreRaw);
        if (!ticketDbId || !mongoose.Types.ObjectId.isValid(ticketDbId) || !Number.isInteger(score) || score < 1 || score > 5) {
          await safeReply(interaction, {
            embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Valutazione non valida.")],
            flags: 1 << 6,
          });
          return true;
        }

        const currentTicket = await Ticket.findById(ticketDbId).catch(() => null);
        if (!currentTicket) {
          await safeReply(interaction, {
            embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Ticket non trovato.")],
            flags: 1 << 6,
          });
          return true;
        }

        if (String(currentTicket.userId || "") !== String(interaction.user?.id || "")) {
          await safeReply(interaction, {
            embeds: [
              makeErrorEmbed(
                "<a:VC_Alert:1482706673176150077> Errore",
                "<:vegax:1443934876440068179> Solo chi ha aperto il ticket può valutarlo.",
              ),
            ],
            flags: 1 << 6,
          });
          return true;
        }

        const ratedTicket = await Ticket.findOneAndUpdate({ _id: ticketDbId, ratingScore: null }, { $set: { ratingScore: score, ratingBy: interaction.user.id, ratingAt: new Date(), }, }, { new: true },).catch(() => null);

        if (!ratedTicket) {
          await clearRatingButtonsFromMessage(ticketDbId);
          await safeReply(interaction, {
            embeds: [
              makeErrorEmbed(
                "<a:VC_Alert:1482706673176150077> Info",
                "<:VC_Attention:1482534443632558151> Hai già inviato una valutazione per questo ticket.",
              ),
            ],
            flags: 1 << 6,
          });
          return true;
        }

        await clearRatingButtonsFromMessage(ticketDbId);
        if (ratedTicket.closeLogChannelId && ratedTicket.closeLogMessageId) {
          const ticketGuild = interaction.guild || await runtimeGetClientGuildCached(interaction.client, ratedTicket.guildId);
          const logChannel = await runtimeGetGuildChannelCached(ticketGuild, ratedTicket.closeLogChannelId,) || await runtimeGetGuildChannelCached(interaction.client.guilds.cache.get(ratedTicket.guildId), ratedTicket.closeLogChannelId,);
          if (logChannel?.isTextBased?.()) {
            const logMessage = await logChannel.messages.fetch(ratedTicket.closeLogMessageId).catch(() => null);
            if (logMessage) {
              const ratedPlain =
                typeof ratedTicket.toObject === "function"
                  ? ratedTicket.toObject({ virtuals: false })
                  : { ...ratedTicket };
              const updatedEmbed = runtimeBuildTicketClosedEmbed({
                ...ratedPlain,
                guildName:
                  ticketGuild?.name ||
                  interaction.client.guilds.cache.get(ratedTicket.guildId)?.name ||
                  "Ticket System",
                guildIconURL: ticketGuild?.iconURL?.({ size: 128 }) || null,
              });
              await logMessage.edit({ embeds: [updatedEmbed] }).catch(() => { });
            }
          }
        }

        await safeReply(interaction, {
          embeds: [
            new EmbedBuilder()
              .setColor("#6f4e37")
              .setDescription(`<a:VC_ThankYou:1330186319673950401> Grazie per il feedback: **${score}/5** ⭐`),
          ],
          flags: 1 << 6,
        });
        return true;
      }
      if (runtimeIsTicketTranscriptButton(interaction.customId)) {
        const transcriptParts = String(interaction.customId).split(":");
        if (transcriptParts.length < 2) {
          await safeReply(interaction, {
            embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Transcript non valido.")],
            flags: 1 << 6,
          });
          return true;
        }
        const [, ticketDbId] = transcriptParts;
        if (!ticketDbId || !mongoose.Types.ObjectId.isValid(ticketDbId)) {
          await safeReply(interaction, {
            embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Transcript non valido.")],
            flags: 1 << 6,
          });
          return true;
        }
        const ticketDoc = await Ticket.findById(ticketDbId).catch(() => null);
        if (!ticketDoc) {
          await safeReply(interaction, {
            embeds: [makeErrorEmbed("<a:VC_Alert:1482706673176150077> Errore", "<:vegax:1443934876440068179> Ticket non trovato.")],
            flags: 1 << 6,
          });
          return true;
        }

        const isOwner = String(ticketDoc.userId || "") === String(interaction.user?.id || "");
        const hasStaffRole = hasStaffTicketRole(interaction.member, ticketDoc.ticketType);
        if (!isOwner && !hasStaffRole) {
          await safeReply(interaction, {
            embeds: [
              makeErrorEmbed(
                "<a:VC_Alert:1482706673176150077> Errore",
                "<:vegax:1443934876440068179> Non puoi visualizzare questo transcript.",
              ),
            ],
            flags: 1 << 6,
          });
          return true;
        }

        const viewUrl =
          !transcriptViewExpired(ticketDoc) ? buildTicketTranscriptViewUrl(ticketDoc.transcriptViewToken) : "";
        const transcriptHtmlPath = String(ticketDoc.transcriptHtmlPath || "");
        const inlineHtml = typeof ticketDoc.transcriptHtmlInline === "string" ? ticketDoc.transcriptHtmlInline : "";
        const hasFile =
          Boolean(transcriptHtmlPath && fs.existsSync(transcriptHtmlPath)) || Boolean(inlineHtml);

        if (!viewUrl && !hasFile) {
          await safeReply(interaction, {
            embeds: [makeErrorEmbed("Info", "<:vegax:1443934876440068179> Transcript HTML non disponibile.")],
            flags: 1 << 6,
          });
          return true;
        }

        const transcriptEmbed = makeTicketSuccessEmbed(
          `${TICKET_FILE} • **__TRANSCRIPT DEL TICKET__**`,
          transcriptReadyDescription(ticketDoc.ticketNumber || ticketDoc._id, {
            viewUrl,
            hasFile,
          }),
        );
        const files = [];
        if (transcriptHtmlPath && fs.existsSync(transcriptHtmlPath)) {
          files.push({
            attachment: transcriptHtmlPath,
            name: `transcript_ticket_${ticketDoc.ticketNumber || ticketDoc._id}.html`,
          });
        } else if (inlineHtml) {
          files.push({
            attachment: Buffer.from(inlineHtml, "utf8"),
            name: `transcript_ticket_${ticketDoc.ticketNumber || ticketDoc._id}.html`,
          });
        }
        await safeReply(interaction, {
          embeds: [transcriptEmbed],
          ...(files.length ? { files } : {}),
          flags: 1 << 6,
        });
        return true;
      }
      if (interaction.customId === "claim_ticket") {
        if (!interaction.channel) {
          await safeReply(interaction, {
            embeds: [
              makeErrorEmbed(
                "<a:VC_Alert:1482706673176150077> Errore",
                "<:vegax:1443934876440068179> Interazione fuori canale",
              ),
            ],
            flags: 1 << 6,
          });
          return true;
        }
        const claimLockKey = await acquireTicketActionLock("claim_state");
        if (!claimLockKey) return true;
        let claimReplyDeferred = false;
        async function replyTicketClaim(payload) {
          const base = { ...payload };
          if (base.flags == null) base.flags = 0;
          if (claimReplyDeferred) {
            const editPayload = { ...base };
            delete editPayload.flags;
            await interaction.editReply(editPayload).catch(async () => {
              await interaction.followUp(base).catch(() => {});
            });
            return;
          }
          await safeReply(interaction, base);
        }
        try {
          await interaction.deferReply({ flags: 1 << 6 }).catch(() => {});
          claimReplyDeferred = Boolean(interaction.deferred);
          const ticket = await runtimeFindTicketByChannel(interaction.channel.id);
          if (!ticket) {
            await replyTicketClaim({
              embeds: [
                makeErrorEmbed(
                  "<a:VC_Alert:1482706673176150077> Errore",
                  "<:vegax:1443934876440068179> Ticket non trovato",
                ),
              ],
            });
            return true;
          }
          const canClaimSupport = ticket.ticketType === "supporto" && STAFF_ROLES.some((r) => interaction.member?.roles?.cache?.has(r));
          const canClaimPartnership = ticket.ticketType === "partnership" && memberCanAccessPartnershipTicket(interaction.member);
          const canClaimHigh = ticket.ticketType === "high" && interaction.member?.roles?.cache?.has(ROLE_HIGHSTAFF);
          const canClaimPerks = ticket.ticketType === "perks" && PERKS_STAFF_ROLE_IDS.some((r) => interaction.member?.roles?.cache?.has(r));
          if (!canClaimSupport && !canClaimPartnership && !canClaimHigh && !canClaimPerks) {
            await replyTicketClaim({
              embeds: [
                makeErrorEmbed(
                  "<a:VC_Alert:1482706673176150077> Errore",
                  "<:vegax:1443934876440068179> Solo lo staff può claimare i ticket",
                ),
              ],
            });
            return true;
          }
          if (ticket.userId === interaction.user.id) {
            await replyTicketClaim({
              embeds: [
                makeErrorEmbed(
                  "<a:VC_Alert:1482706673176150077> Errore",
                  "<:vegax:1443934876440068179> Non puoi claimare il ticket che hai aperto tu.",
                ),
              ],
            });
            return true;
          }
          const claimedByVal = ticket.claimedBy != null ? String(ticket.claimedBy).trim() : "";
          if (claimedByVal !== "" && !isHighStaffActor()) {
            await replyTicketClaim({
              embeds: [
                makeErrorEmbed(
                  "<a:VC_Alert:1482706673176150077> Errore",
                  `<:vegax:1443934876440068179> Ticket già claimato da <@${claimedByVal}>.`,
                ),
              ],
            });
            return true;
          }
          let claimedTicket = null;
          if (isHighStaffActor()) {
            claimedTicket = await Ticket.findOneAndUpdate(
              { channelId: interaction.channel.id, open: true },
              { $set: { claimedBy: interaction.user.id } },
              { new: true },
            ).catch(() => null);
          } else {
            const nonHighClaimFilters = [
              { channelId: interaction.channel.id, open: true, claimedBy: null },
              { channelId: interaction.channel.id, open: true, claimedBy: "" },
            ];
            for (const claimFilter of nonHighClaimFilters) {
              claimedTicket = await Ticket.findOneAndUpdate(
                claimFilter,
                { $set: { claimedBy: interaction.user.id } },
                { new: true },
              ).catch(() => null);
              if (claimedTicket) break;
            }
          }
          if (!claimedTicket) {
            claimedTicket = await Ticket.findOne({ channelId: interaction.channel.id, open: true }).catch(() => null);
            if (!claimedTicket) {
              await replyTicketClaim({
                embeds: [
                  makeErrorEmbed(
                    "<a:VC_Alert:1482706673176150077> Errore",
                    "<:vegax:1443934876440068179> Ticket non disponibile o già claimato.",
                  ),
                ],
              });
              return true;
            }
            const nowClaimed = claimedTicket.claimedBy != null ? String(claimedTicket.claimedBy).trim() : "";
            if (nowClaimed !== "" && !isHighStaffActor()) {
              await replyTicketClaim({
                embeds: [
                  makeErrorEmbed(
                    "<a:VC_Alert:1482706673176150077> Errore",
                    `<:vegax:1443934876440068179> Ticket già claimato da <@${nowClaimed}>.`,
                  ),
                ],
              });
              return true;
            }
            await replyTicketClaim({
              embeds: [
                makeErrorEmbed(
                  "<a:VC_Alert:1482706673176150077> Errore",
                  "<:vegax:1443934876440068179> Impossibile claimare il ticket ora. Riprova.",
                ),
              ],
            });
            return true;
          }
          const claimerId = String(claimedTicket.claimedBy || "").trim();
                    if (claimerId !== String(interaction.user.id)) {
            await replyTicketClaim({
              embeds: [
                makeErrorEmbed(
                  "<a:VC_Alert:1482706673176150077> Errore",
                  "<:vegax:1443934876440068179> Impossibile claimare il ticket ora. Riprova.",
                ),
              ],
            });
            return true;
          }
          const claimSuccessEmbed = makeTicketSuccessEmbed(
            `${TICKET_ICON} • **__TICKET CLAIMATO__**`,
            `${TICKET_CLAIM} Ticket preso in carico da <@${claimerId}>`,
          );
          const claimAnnouncePayload = {
            embeds: [claimSuccessEmbed],
            allowedMentions: { parse: [], users: claimerId ? [claimerId] : [] },
          };
                              let claimAnnounced = await interaction.channel
            .send(claimAnnouncePayload)
            .catch((err) => {
              global.logger?.error?.("[ticketHandlers] claim channel send:", err?.message || err);
              return null;
            });
          if (!claimAnnounced) {
            claimAnnounced = await interaction
              .followUp({ ...claimAnnouncePayload, flags: 0 })
              .catch((err) => {
                global.logger?.error?.("[ticketHandlers] claim followUp:", err?.message || err);
                return null;
              });
          }
          if (interaction.channel) {
            let overwriteOk = true;
            try {
              const claimMemberPerms = {
                ViewChannel: true,
                SendMessages: true,
                EmbedLinks: true,
                AttachFiles: true,
                ReadMessageHistory: true,
                AddReactions: true,
              };
                            if (ticket.userId) {
                await editTicketMemberOverwrite(interaction.channel, ticket.userId, claimMemberPerms);
              }
              await editTicketMemberOverwrite(interaction.channel, interaction.user.id, claimMemberPerms);
              if (ticket.ticketType === "supporto") {
                if (ROLE_STAFF) {
                  await editTicketRoleOverwrite(interaction.channel, ROLE_STAFF, spectateForGuild(interaction.guild.id));
                }
                await applyHighStaffTicketWriteOverwrite(interaction.channel, ROLE_HIGHSTAFF);
              }
              if (ticket.ticketType === "partnership") {
                await applyPartnershipTicketRoleOverwrites(interaction.channel);
              } else if (ticket.ticketType === "high") {
                if (ROLE_HIGHSTAFF) {
                  await editTicketRoleOverwrite(interaction.channel, ROLE_HIGHSTAFF, spectateForGuild(interaction.guild.id));
                }
              } else if (ticket.ticketType === "perks") {
                await applyTicketStaffRoleOverwrites(interaction.channel, PERKS_STAFF_ROLE_IDS);
              } else if (ROLE_PARTNERMANAGER) {
                await editTicketRoleOverwrite(interaction.channel, ROLE_PARTNERMANAGER, { ViewChannel: false });
              }
            } catch (err) {
              overwriteOk = false;
              global.logger.error(err);
            }
            if (!overwriteOk) {
              await interaction.channel
                .send({
                  embeds: [makeTicketErrorEmbed("Attenzione", claimOverwriteWarnDescription())],
                })
                .catch(() => {});
            }
          }
          const claimPanel = resolveTicketPanel(interaction.guild.id, ticket);
          const claimedButtons = buildClaimedControlButtons(interaction.guild.id, claimPanel) || new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder().setCustomId("close_ticket").setEmoji("🔒").setLabel("Chiudi").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId("close_ticket_motivo").setEmoji("🔒").setLabel("Chiudi Con Motivo").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId("unclaim").setEmoji(`<a:VC_Unlock:1482532082466029608>`).setLabel("Unclaim").setStyle(ButtonStyle.Secondary),
          );
          let panelMessage = interaction.message;
          const storedPanelId = ticket.messageId != null ? String(ticket.messageId).trim() : "";
          if (storedPanelId && String(panelMessage?.id || "") !== storedPanelId) {
            panelMessage = await interaction.channel.messages.fetch(storedPanelId).catch(() => null);
          }
          if (panelMessage && typeof panelMessage.edit === "function") {
            const rawEmbeds = Array.isArray(panelMessage.embeds)
              ? panelMessage.embeds
              : [...(panelMessage.embeds?.values?.() ?? [])];
            const editPayload = { components: [claimedButtons] };
            if (rawEmbeds.length) editPayload.embeds = rawEmbeds.map((e) => EmbedBuilder.from(e));
            if (String(panelMessage.content ?? "").length) editPayload.content = panelMessage.content;
            await panelMessage
              .edit(editPayload)
              .catch((err) => global.logger?.warn?.("[ticketHandlers] claim panel edit:", err?.message || err));
          }
          if (!claimAnnounced) {
            await replyTicketClaim(claimAnnouncePayload);
            return true;
          }
          await interaction.deleteReply().catch(() => {});
          return true;
        } finally {
          releaseTicketActionLock(claimLockKey);
        }
      }
      if (interaction.customId === "unclaim") {
        if (!interaction.channel) {
          await safeReply(interaction, {
            embeds: [
              makeErrorEmbed(
                "<a:VC_Alert:1482706673176150077> Errore",
                "<:vegax:1443934876440068179> Interazione fuori canale",
              ),
            ],
            flags: 1 << 6,
          });
          return true;
        }
        const unclaimLockKey = await acquireTicketActionLock("claim_state");
        if (!unclaimLockKey) return true;
        let unclaimReplyDeferred = false;
        async function replyTicketUnclaim(payload) {
          const base = { ...payload };
          if (base.flags == null) base.flags = 0;
          if (unclaimReplyDeferred) {
            const editPayload = { ...base };
            delete editPayload.flags;
            await interaction.editReply(editPayload).catch(async () => {
              await interaction.followUp(base).catch(() => {});
            });
            return;
          }
          await safeReply(interaction, base);
        }
        try {
          await interaction.deferReply({ flags: 1 << 6 }).catch(() => {});
          unclaimReplyDeferred = Boolean(interaction.deferred);
          const ticketDoc = await runtimeFindTicketByChannel(interaction.channel.id);
          if (!ticketDoc) {
            await replyTicketUnclaim({
              embeds: [
                makeErrorEmbed(
                  "Errore",
                  "<:vegax:1443934876440068179> Questo non è un ticket valido.",
                ),
              ],
            });
            return true;
          }
          const unclaimPanel = resolveTicketPanel(interaction.guild.id, ticketDoc);
          const ticketButtonsOriginal =
            buildTicketControlButtons(interaction.guild.id, unclaimPanel) ||
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId("close_ticket").setEmoji("🔒").setLabel("Chiudi").setStyle(ButtonStyle.Danger),
              new ButtonBuilder().setCustomId("close_ticket_motivo").setEmoji("🔒").setLabel("Chiudi Con Motivo").setStyle(ButtonStyle.Danger),
              new ButtonBuilder().setCustomId("claim_ticket").setEmoji("🙋‍♂️").setLabel("Claim").setStyle(ButtonStyle.Success),
            );
          if (!runtimeHasActiveTicketClaimer(ticketDoc)) {
            await replyTicketUnclaim({
              embeds: [
                makeErrorEmbed(
                  "Errore",
                  "<:vegax:1443934876440068179> Questo ticket non è claimato.",
                ),
              ],
            });
            return true;
          }
          if (ticketDoc.userId === interaction.user.id) {
            await replyTicketUnclaim({
              embeds: [
                makeErrorEmbed(
                  "Errore",
                  "<:vegax:1443934876440068179> Chi ha aperto il ticket non può usare questo pulsante.",
                ),
              ],
            });
            return true;
          }
          if (interaction.user.id !== ticketDoc.claimedBy && !isHighStaffActor()) {
            await replyTicketUnclaim({
              embeds: [
                makeErrorEmbed(
                  "Errore",
                  "<:vegax:1443934876440068179> Solo chi ha claimato può rimuovere il claim del ticket.",
                ),
              ],
            });
            return true;
          }
          const previousClaimerId = String(ticketDoc.claimedBy || "").trim();
          const unclaimQuery = isHighStaffActor()
            ? { channelId: interaction.channel.id, open: true }
            : { channelId: interaction.channel.id, open: true, claimedBy: interaction.user.id };
          const unclaimedTicket = await Ticket.findOneAndUpdate(unclaimQuery, { $set: { claimedBy: null } }, { new: true },).catch(() => null);
          if (!unclaimedTicket) {
            await replyTicketUnclaim({
              embeds: [
                makeErrorEmbed(
                  "Errore",
                  "<:vegax:1443934876440068179> Solo chi ha claimato può rimuovere il claim del ticket.",
                ),
              ],
            });
            return true;
          }
          const unclaimUserId = String(previousClaimerId || interaction.user.id).trim();
          const unclaimSuccessEmbed = makeTicketSuccessEmbed(
            `${TICKET_ICON} • **__CLAIM RIMOSSO__**`,
            `${TICKET_CLAIM} Il ticket non è più gestito da <@${unclaimUserId}>`,
          );
          const unclaimAnnouncePayload = {
            embeds: [unclaimSuccessEmbed],
            allowedMentions: { parse: [], users: unclaimUserId ? [unclaimUserId] : [] },
          };
          let unclaimAnnounced = await interaction.channel
            .send(unclaimAnnouncePayload)
            .catch((err) => {
              global.logger?.error?.("[ticketHandlers] unclaim channel send:", err?.message || err);
              return null;
            });
          if (!unclaimAnnounced) {
            unclaimAnnounced = await interaction
              .followUp({ ...unclaimAnnouncePayload, flags: 0 })
              .catch((err) => {
                global.logger?.error?.("[ticketHandlers] unclaim followUp:", err?.message || err);
                return null;
              });
          }
          if (interaction.channel) {
            const unclaimBehavior = String(
              getTicketSettingsSync(interaction.guild?.id)?.panelSwitchBehavior || "auto_unclaim",
            );
            const keepClaimerAccess = unclaimBehavior === "keep_access";
            if (previousClaimerId && !keepClaimerAccess) {
              await interaction.channel.permissionOverwrites.delete(previousClaimerId).catch((err) => {
                global.logger?.error?.(err);
              });
            } else if (previousClaimerId && keepClaimerAccess) {
              await interaction.channel.permissionOverwrites
                .edit(previousClaimerId, {
                  ViewChannel: true,
                  SendMessages: false,
                  ReadMessageHistory: true,
                  EmbedLinks: true,
                  AttachFiles: true,
                  AddReactions: true,
                })
                .catch(() => { });
            }
            await applyChannelPermissionOverwritesAfterUnclaim(interaction.channel, unclaimedTicket.ticketType);
          }
          try {
            if (interaction.channel) {
              let msg = null;
              const panelMid = unclaimedTicket.messageId != null ? String(unclaimedTicket.messageId).trim() : "";
              if (panelMid) {
                msg = await interaction.channel.messages.fetch(panelMid).catch(() => null);
              }
              if (!msg) {
                const panelByType = { supporto: "supporto", partnership: "partnership", high: "highstaff", perks: "perks" };
                const panelKey = panelByType[unclaimedTicket.ticketType] || "supporto";
                const panelConfig = getTicketPanelConfig(
                  panelKey,
                  resolveTicketBotLanguage(guildId, interaction.guild),
                );
                const fallback = panelConfig?.embed
                  ? EmbedBuilder.from(panelConfig.embed)
                  : new EmbedBuilder().setColor("#6f4e37");
                await interaction.channel
                  .send({
                    embeds: [fallback],
                    components: [ticketButtonsOriginal],
                  })
                  .then(async (sent) => {
                    if (sent?.id && unclaimedTicket._id) {
                      await Ticket.updateOne(
                        { _id: unclaimedTicket._id },
                        { $set: { messageId: sent.id } },
                      ).catch(() => {});
                    }
                  })
                  .catch((err) => {
                    global.logger?.warn?.("[ticketHandlers] unclaim panel send:", err?.message || err);
                  });
              } else {
                const rawEmbeds = Array.isArray(msg.embeds)
                  ? msg.embeds
                  : [...(msg.embeds?.values?.() ?? [])];
                const embedsToKeep = rawEmbeds.length ? rawEmbeds.map((e) => EmbedBuilder.from(e)) : undefined;
                await msg
                  .edit({
                    ...(embedsToKeep ? { embeds: embedsToKeep } : {}),
                    components: [ticketButtonsOriginal],
                  })
                  .catch((err) => {
                    global.logger?.warn?.("[ticketHandlers] unclaim panel edit:", err?.message || err);
                  });
              }
            }
          } catch (err) {
            global.logger.error(err);
          }
          if (!unclaimAnnounced) {
            await replyTicketUnclaim(unclaimAnnouncePayload);
            return true;
          }
          await interaction.deleteReply().catch(() => {});
          return true;
        } finally {
          releaseTicketActionLock(unclaimLockKey);
        }
      }
      if (interaction.customId === "close_ticket_motivo") {
        if (!interaction.member) {
          await safeReply(interaction, {
            embeds: [
              makeErrorEmbed(
                "<a:VC_Alert:1482706673176150077> Errore",
                "<:vegax:1443934876440068179> Interazione non valida",
              ),
            ],
            flags: 1 << 6,
          });
          return true;
        }
        const ticketDoc = await runtimeLoadTicketForChannelOrReply({ interaction, safeReply, makeErrorEmbed, channelId: interaction.channel?.id, missingDescription: "<:vegax:1443934876440068179> Ticket non trovato", });
        if (!ticketDoc) return true;
        const canClose = await runtimeEnsureClosableTicketOrReply({ interaction, safeReply, makeErrorEmbed, ticketDoc, highStaff: isTicketCloseElevatedActor(ticketDoc), allowUserClose: getTicketSettingsSync(interaction.guild?.id).allowUserClose === true, });
        if (!canClose) return true;
        const modal = new ModalBuilder().setCustomId(`modal_close_ticket:${interaction.user.id}`)
          .setTitle("Chiudi ticket con motivo");
        const input = new TextInputBuilder().setCustomId("motivo").setLabel("Motivo della chiusura").setStyle(TextInputStyle.Paragraph).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        const shown = await interaction.showModal(modal).then(() => true).catch((err) => { global.logger.error(err); return false; });
        if (!shown) {
          await safeReply(interaction, {
            embeds: [
              makeErrorEmbed(
                "<a:VC_Alert:1482706673176150077> Errore",
                "<:vegax:1443934876440068179> Impossibile aprire il modulo, riprova.",
              ),
            ],
            flags: 1 << 6,
          });
        }
        return true;
      }
      if (interaction.customId === "close_ticket_cancel") {
        const cancelPayload = {
          embeds: [
            new EmbedBuilder()
              .setTitle("<:VC_Attention:1482534443632558151> • **__CHIUSURA ANNULLATA__**")
              .setDescription(
                `<:VC_Attention:1482534443632558151> <@${interaction.user.id}> ha annullato la chiusura del ticket.`,
              )
              .setColor(ticketEmbedColor),
          ],
          components: [],
          includeAuthor: false,
          includeBanner: false,
          includeThumbnail: false,
          __tenantBrandingApplied: true,
          __skipDefaultEmbedFooter: true,
        };
        try {
          if (!interaction.replied && !interaction.deferred) {
            await interaction.update(cancelPayload);
          } else if (interaction.message?.edit) {
            await interaction.message.edit(cancelPayload);
          } else {
            await safeEditReply(interaction, cancelPayload);
          }
        } catch (_) {
          await safeReply(interaction, cancelPayload).catch(() => { });
        }
        return true;
      }
      if (interaction.customId === "close_ticket" || interaction.customId === "close_ticket_confirm") {
        if (!interaction.member) {
          await safeReply(interaction, {
            embeds: [
              makeErrorEmbed(
                "<a:VC_Alert:1482706673176150077> Errore",
                "<:vegax:1443934876440068179> Interazione non valida",
              ),
            ],
            flags: 1 << 6,
          });
          return true;
        }
        const ticketDoc = await runtimeLoadTicketForChannelOrReply({ interaction, safeReply, makeErrorEmbed, channelId: interaction.channel?.id, missingDescription: "<:vegax:1443934876440068179> Ticket non trovato", });
        if (!ticketDoc) return true;
        const canClose = await runtimeEnsureClosableTicketOrReply({ interaction, safeReply, makeErrorEmbed, ticketDoc, highStaff: isTicketCloseElevatedActor(ticketDoc), allowUserClose: getTicketSettingsSync(interaction.guild?.id).allowUserClose === true, });
        if (!canClose) return true;
        if (
          interaction.customId === "close_ticket" &&
          getTicketSettingsSync(interaction.guild?.id).closeConfirmation === true
        ) {
                    await safeReply(interaction, {
            embeds: [
              new EmbedBuilder()
                .setTitle("<:VC_close:1478517239136256020> • **__CONFERMA CHIUSURA__**")
                .setDescription("Sei sicuro di voler chiudere questo ticket?")
                .setColor(ticketEmbedColor),
            ],
            components: [
              new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId("close_ticket_confirm")
                  .setLabel("Conferma")
                  .setStyle(ButtonStyle.Danger)
                  .setEmoji("✔️"),
                new ButtonBuilder()
                  .setCustomId("close_ticket_cancel")
                  .setLabel("Annulla")
                  .setStyle(ButtonStyle.Secondary),
              ),
            ],
            includeAuthor: false,
            includeBanner: false,
            includeThumbnail: false,
            __tenantBrandingApplied: true,
            __skipDefaultEmbedFooter: true,
          }).catch(() => { });
          return true;
        }
        if (interaction.customId === "close_ticket_confirm") {
          const closingPayload = {
            embeds: [
              new EmbedBuilder()
                .setTitle("<:VC_close:1478517239136256020> • **__CHIUSURA__**")
                .setDescription(
                  `<:VC_close:1478517239136256020> <@${interaction.user.id}> ha confermato: il ticket verrà chiuso...`,
                )
                .setColor(ticketEmbedColor),
            ],
            components: [],
            includeAuthor: false,
            includeBanner: false,
            includeThumbnail: false,
            __tenantBrandingApplied: true,
            __skipDefaultEmbedFooter: true,
          };
          try {
            if (!interaction.replied && !interaction.deferred) {
              await interaction.update(closingPayload);
            } else if (interaction.message?.edit) {
              await interaction.message.edit(closingPayload);
            } else {
              await safeEditReply(interaction, closingPayload);
            }
          } catch (err) {
            global.logger?.warn?.("[ticketHandlers] close confirm update:", err?.message || err);
            await interaction.deferUpdate().catch(() => { });
          }
        } else {
          try {
            await interaction.deferReply().catch(() => { });
          } catch (err) {
            global.logger?.warn?.("[ticketHandlers] ", err?.message || err);
          }
        }
        if (
          await maybeDeferCloseForPartnerManagerShopAck({
            interaction,
            ticketDoc,
            motivo: null,
            closedById: interaction.user.id,
            safeReply,
          })
        ) {
          return true;
        }
        await runtimeCloseTicket(interaction, null, { safeReply, safeEditReply, makeErrorEmbed, LOG_CHANNEL });
        return true;
      }
      if (interaction.customId === "accetta") {
        if (!interaction.channel) {
          await safeReply(interaction, {
            embeds: [
              makeErrorEmbed(
                "<a:VC_Alert:1482706673176150077> Errore",
                "<:vegax:1443934876440068179> Interazione fuori canale",
              ),
            ],
            flags: 1 << 6,
          });
          return true;
        }
        const ticketDoc = await runtimeLoadTicketForChannelOrReply({ interaction, safeReply, makeErrorEmbed, channelId: interaction.channel.id, missingDescription: "<:vegax:1443934876440068179> Non puoi chiudere questo ticket", });
        if (!ticketDoc) return true;
        const canHandleCloseRequest = runtimeCanUserHandleCloseRequest(ticketDoc, interaction.user.id, isTicketCloseElevatedActor(ticketDoc),);
        if (!canHandleCloseRequest) {
          await safeReply(interaction, {
            embeds: [
              makeErrorEmbed(
                "<a:VC_Alert:1482706673176150077> Errore",
                "<:vegax:1443934876440068179> Solo chi ha aperto o claimato il ticket può gestire questa richiesta.",
              ),
            ],
            flags: 1 << 6,
          });
          return true;
        }
        try {
          await interaction.deferReply().catch(() => { });
        } catch (err) {
          global.logger?.warn?.("[ticketHandlers] ", err?.message || err);
        }
        const motivo = ticketDoc.closeReason || "Nessun motivo inserito";
        if (
          await maybeDeferCloseForPartnerManagerShopAck({
            interaction,
            ticketDoc,
            motivo,
            closedById: ticketDoc.closeRequestedBy || interaction.user.id,
            safeReply,
          })
        ) {
          return true;
        }
        await runtimeCloseTicket(interaction, motivo, { safeReply, safeEditReply, makeErrorEmbed, LOG_CHANNEL, closedById: ticketDoc.closeRequestedBy || interaction.user.id });
        return true;
      }
      if (interaction.customId === "rifiuta") {
        if (!interaction.channel) {
          await safeReply(interaction, {
            embeds: [
              makeErrorEmbed(
                "<a:VC_Alert:1482706673176150077> Errore",
                "<:vegax:1443934876440068179> Interazione fuori canale",
              ),
            ],
            flags: 1 << 6,
          });
          return true;
        }
        const ticketDoc = await runtimeLoadTicketForChannelOrReply({ interaction, safeReply, makeErrorEmbed, channelId: interaction.channel.id, missingDescription: "<:vegax:1443934876440068179> Non puoi chiudere questo ticket", });
        if (!ticketDoc) return true;
        const canHandleCloseRequest = runtimeCanUserHandleCloseRequest(ticketDoc, interaction.user.id, isTicketCloseElevatedActor(ticketDoc),);
        if (!canHandleCloseRequest) {
          await safeReply(interaction, {
            embeds: [
              makeErrorEmbed(
                "<a:VC_Alert:1482706673176150077> Errore",
                "<:vegax:1443934876440068179> Solo chi ha aperto o claimato il ticket può gestire questa richiesta.",
              ),
            ],
            flags: 1 << 6,
          });
          return true;
        }
        await acknowledgeRejectClosePrompt( interaction, `<:vegax:1443934876440068179> <@${interaction.user.id}> ha rifiutato la richiesta di chiusura.`);
        await Ticket.updateOne(
          { _id: ticketDoc._id },
          {
            $set: {
              closeReason: null,
              closeRequestedBy: null,
              closeRequestedAt: null,
            },
          },
        ).catch(() => { });
        return true;
      }
      if (
        interaction.customId === "ticket_autoclose_accept" ||
        interaction.customId === "ticket_autoclose_reject"
      ) {
        if (!interaction.channel) {
          await safeReply(interaction, {
            embeds: [
              makeErrorEmbed(
                "<a:VC_Alert:1482706673176150077> Errore",
                "<:vegax:1443934876440068179> Interazione fuori canale",
              ),
            ],
            flags: 1 << 6,
          });
          return true;
        }
        const autoCloseLockKey = await acquireTicketActionLock("auto_close_prompt");
        if (!autoCloseLockKey) return true;
        try {
          const ticketDoc = await runtimeLoadTicketForChannelOrReply({ interaction, safeReply, makeErrorEmbed, channelId: interaction.channel.id, missingDescription: "<:vegax:1443934876440068179> Non puoi gestire questo ticket", });
          if (!ticketDoc) return true;
          const canHandleAutoClosePrompt = runtimeCanUserHandleCloseRequest(ticketDoc, interaction.user.id, isTicketCloseElevatedActor(ticketDoc),);
          if (!canHandleAutoClosePrompt) {
            await safeReply(interaction, {
              embeds: [
                makeErrorEmbed(
                  "<a:VC_Alert:1482706673176150077> Errore",
                  "<:vegax:1443934876440068179> Solo chi ha aperto o claimato il ticket può gestire questa richiesta automatica.",
                ),
              ],
              flags: 1 << 6,
            });
            return true;
          }

          if (interaction.customId === "ticket_autoclose_accept") {
            try {
              await interaction
                .deferReply()
                .catch(() => { });
            } catch (err) {
              global.logger?.warn?.("[ticketHandlers] ", err?.message || err);
            }
            const motivo = ticketDoc.closeReason || "Chiusura automatica dopo 24h.";
            if (
              await maybeDeferCloseForPartnerManagerShopAck({
                interaction,
                ticketDoc,
                motivo,
                closedById: interaction.user.id,
                safeReply,
              })
            ) {
              return true;
            }
            await runtimeCloseTicket(interaction, motivo, {
              safeReply,
              safeEditReply,
              makeErrorEmbed,
              LOG_CHANNEL,
              closedById: interaction.user.id,
            });
            return true;
          }

          await acknowledgeRejectClosePrompt(
            interaction,
            `<:vegax:1443934876440068179> <@${interaction.user.id}> ha rifiutato la richiesta automatica di chiusura`,
          );
          await Ticket.updateOne(
            { _id: ticketDoc._id },
            {
              $set: {
                closeReason: null,
                closeRequestedBy: null,
                closeRequestedAt: null,
                autoClosePromptSentAt: ticketDoc.autoClosePromptSentAt || new Date(),
              },
            },
          ).catch(() => { });
          return true;
        } finally {
          releaseTicketActionLock(autoCloseLockKey);
        }
      }
    }
    if (
      isTicketModal &&
      String(interaction.customId || "").startsWith("modal_close_ticket")
    ) {
      const ticketDoc = await runtimeLoadTicketForChannelOrReply({ interaction, safeReply, makeErrorEmbed, channelId: interaction.channel?.id, missingDescription: "<:vegax:1443934876440068179> Ticket non trovato", });
      if (!ticketDoc) return true;
      const canClose = await runtimeEnsureClosableTicketOrReply({ interaction, safeReply, makeErrorEmbed, ticketDoc, highStaff: isTicketCloseElevatedActor(ticketDoc), allowUserClose: getTicketSettingsSync(interaction.guild?.id).allowUserClose === true, });
      if (!canClose) return true;
      let motivo = null;
      try {
        motivo = interaction.fields.getTextInputValue("motivo")?.trim() || null;
      } catch (err) {
        global.logger?.warn?.("[ticketHandlers] getTextInputValue motivo:", err?.message || err);
      }
      if (!motivo && interaction.fields?.fields) {
        const first = interaction.fields.fields.first();
        if (first?.value) motivo = String(first.value).trim() || null;
      }
      if (
        await maybeDeferCloseForPartnerManagerShopAck({
          interaction,
          ticketDoc,
          motivo,
          closedById: interaction.user.id,
          safeReply,
        })
      ) {
        return true;
      }
      try {
        await interaction.deferReply().catch(() => { });
      } catch (err) {
        global.logger?.warn?.("[ticketHandlers] ", err?.message || err);
      }
      await runtimeCloseTicket(interaction, motivo, { safeReply, safeEditReply, makeErrorEmbed, LOG_CHANNEL });
      return true;
    }
  } catch (err) {
    global.logger.error(err);
    try {
      await safeReply(interaction, {
        embeds: [
          makeErrorEmbed(
            "<a:VC_Alert:1482706673176150077> Errore Interno",
            "<:vegax:1443934876440068179> Si è verificato un errore durante l'elaborazione.",
          ),
        ],
        flags: 1 << 6,
      }).catch(() => { });
    } catch (e) {
      global.logger.info(e);
    }
  }
  return true;
}

module.exports = { handleTicketInteraction };