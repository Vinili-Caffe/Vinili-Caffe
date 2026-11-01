const { ButtonBuilder, ActionRowBuilder, ButtonStyle, PermissionFlagsBits, MessageFlags } = require("discord.js") as typeof import("discord.js");
const { DEFAULT_OBSOLETE_SLASH_NAMES } = require("../../../shared/discord/purgeObsoleteApplicationCommands") as typeof import("../../../shared/discord/purgeObsoleteApplicationCommands");
const { safeReply: safeReplyHelper } = require("../../../shared/discord/replyRuntime") as typeof import("../../../shared/discord/replyRuntime");
const{applyDefaultFooterToEmbeds,}=require("../../Utils/Embeds/defaultFooter") as typeof import("../../Utils/Embeds/defaultFooter");
const { checkSlashPermission, getSlashRequiredRoles, buildGlobalPermissionDeniedEmbed, buildGlobalChannelDeniedEmbed, } = require("../../Utils/Moderation/commandPermissions") as typeof import("../../Utils/Moderation/commandPermissions");
const { replyInteractionSetupRequired } = require("../../MultiGuild/utils/Partner/tenantSetupRequiredReply") as typeof import("../../MultiGuild/utils/Partner/tenantSetupRequiredReply");
const { getUserCommandCooldownSeconds, consumeUserCooldown, } = require("../../Utils/Moderation/commandCooldown") as typeof import("../../Utils/Moderation/commandCooldown");
const { buildCooldownErrorEmbed, buildBusyCommandErrorEmbed, buildInternalCommandErrorEmbed, } = require("../../Utils/Moderation/commandErrorEmbeds") as typeof import("../../Utils/Moderation/commandErrorEmbeds");
const { buildErrorLogEmbed } = require("../../../shared/discord/errorLogEmbed") as typeof import("../../../shared/discord/errorLogEmbed");
const { getCentralChannel } = require("../../Utils/Logging/commandUsageLogger") as typeof import("../../Utils/Logging/commandUsageLogger");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { shouldBlockModerationCommands } = require("../../Services/Moderation/antiNukeService") as typeof import("../../Services/Moderation/antiNukeService");
const { getSecurityLockState } = require("../../Services/Moderation/securityOrchestratorService") as typeof import("../../Services/Moderation/securityOrchestratorService");
const {
  registerInteractionShutdownGuard,
  trackInteractionStart,
  markInteractionDeferred,
  markInteractionReplied,
  releaseInteraction,
  isShuttingDown,
  SHUTDOWN_MESSAGE,
} = require("../../../shared/discord/interactionShutdownGuard") as typeof import("../../../shared/discord/interactionShutdownGuard");

registerInteractionShutdownGuard();
const SLASH_COOLDOWN_BYPASS_ROLE_ID = IDs.roles?.Staff || null;
const STAFF_BYPASS_PERMISSIONS=[PermissionFlagsBits.Administrator,PermissionFlagsBits.ManageGuild,PermissionFlagsBits.ManageChannels,PermissionFlagsBits.ManageRoles,PermissionFlagsBits.ManageMessages,PermissionFlagsBits.KickMembers,PermissionFlagsBits.BanMembers,PermissionFlagsBits.ModerateMembers,];
const SLASH_EXECUTION_TIMEOUT_MS=Math.max(15_000,Number(process.env.SLASH_EXECUTION_TIMEOUT_MS||120_000),);
const getCommandKey = (name?, type?) => `${name}:${type || 1}`;
const OBSOLETE_SLASH_NAMES = new Set((Array.isArray(DEFAULT_OBSOLETE_SLASH_NAMES) ? DEFAULT_OBSOLETE_SLASH_NAMES : []).map((s?) => String(s || "").toLowerCase()).filter(Boolean),);

function isAckExpiredInteractionError(error?) {
  const code = error?.code ?? error?.rawError?.code;
  return (
    code === 10062 ||
    code === 40060 ||
    code === "InteractionAlreadyReplied" ||
    /Unknown interaction/i.test(String(error?.message || ""))
  );
}

function logCommandRuntimeError(interaction?, error?) {
  const commandName = String(interaction?.commandName || "unknown");
  const userId = String(interaction?.user?.id || "unknown");
  const guildId = String(interaction?.guildId || "dm");
  if (isAckExpiredInteractionError(error)) {
    global.logger?.warn?.(
      `[SLASH COMMAND WARN] interaction scaduta/usata command=${commandName} guild=${guildId} user=${userId}`,
    );
    return;
  }
  global.logger?.error?.(
    `[SLASH COMMAND ERROR] command=${commandName} guild=${guildId} user=${userId}`,
    error?.stack || error?.message || error,
  );
}

function sanitizeEditPayload(payload?) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return payload;
  if (!Object.prototype.hasOwnProperty.call(payload, "flags")) return payload;
  const next = { ...payload };
  delete next.flags;
  return next;
}

function hasAnyStaffBypassPermission(permissions?) {
  if (!permissions || typeof permissions.has !== "function") return false;
  return STAFF_BYPASS_PERMISSIONS.some((perm?) => permissions.has(perm));
}

async function handleAutocomplete(interaction?, client?) {
  if (OBSOLETE_SLASH_NAMES.has(String(interaction.commandName || "").toLowerCase())) {
    return interaction.respond([]).catch(() => null);
  }
  const cmd=client.commands.get(getCommandKey(interaction.commandName,interaction.commandType),);
  if (!cmd?.autocomplete) return;
  const isAntiNukeRecoveryCommand=["antinuke","security"].includes(String(cmd?.name||interaction.commandName||"").toLowerCase(),);
  const securityLockState = await getSecurityLockState(interaction.guild);
  if (!isAntiNukeRecoveryCommand && securityLockState.commandLockActive) {
    return;
  }
  const isModerationSlashCommand=["staff","admin"].includes(String(cmd?.category||"").toLowerCase(),);
  if (
    isModerationSlashCommand &&
    !isAntiNukeRecoveryCommand &&
    (await shouldBlockModerationCommands(
      interaction.guild,
      String(interaction.user?.id || ""),
    ))
  ) {
    return;
  }
  try {
    await cmd.autocomplete(interaction, client);
  } catch (err) {
    global.logger.error(err);
  }
}

async function handleSlashCommand(interaction?, client?) {
  if (isShuttingDown()) {
    return interaction.reply({ content: SHUTDOWN_MESSAGE, flags: MessageFlags.Ephemeral }).catch(() => null);
  }

  const command=client.commands.get(getCommandKey(interaction.commandName,interaction.commandType),);
  if (!command) {
    if (OBSOLETE_SLASH_NAMES.has(String(interaction.commandName || "").toLowerCase())) {
      const obsoleteContent = "Questo comando **non è più disponibile**.";
      return interaction.reply({ content: obsoleteContent, flags: MessageFlags.Ephemeral }).catch(() => null);
    }
    return;
  }
  const expectsModal = command?.expectsModal === true;
  const isAntiNukeRecoveryCommand=["antinuke","security"].includes(String(command?.name||"").toLowerCase(),);
  const isModerationSlashCommand=["staff","admin"].includes(String(command?.category||"").toLowerCase(),);
  const isContextMenu = Boolean(
    interaction.isUserContextMenuCommand?.() || interaction.isMessageContextMenuCommand?.(),
  );
  // Modal: parallelizzare lock+permessi e saltare check canale chat (latency → 10062)
  const [securityLockState, slashPermissionEarly, modBlocked] = await Promise.all([
    getSecurityLockState(interaction.guild),
    checkSlashPermission(interaction, { returnDetails: true }),
    isModerationSlashCommand && !isAntiNukeRecoveryCommand
      ? shouldBlockModerationCommands(interaction.guild, String(interaction.user?.id || ""))
      : Promise.resolve(false),
  ]);
  if (!isAntiNukeRecoveryCommand && securityLockState.commandLockActive) {
    return interaction.reply({ content: `<a:VC_Lock:1482526739044368476> Server in lockdown di sicurezza: comandi temporaneamente bloccati.`, flags: 1 << 6 });
  }
  if (modBlocked) {
    return interaction.reply({ content: "<a:VC_Lock:1482526739044368476> Comandi di moderazione temporaneamente bloccati.", flags: 1 << 6 });
  }
  if (isModerationSlashCommand && interaction.channel && !(expectsModal && isContextMenu)) {
    const { staffChatCommandsDeniedReplyContent } = require("../../Utils/Staff/staffChatChannelUtils") as typeof import("../../Utils/Staff/staffChatChannelUtils");
    const deniedStaffChat = await staffChatCommandsDeniedReplyContent(interaction.channel).catch(() => null);
    if (deniedStaffChat) {
      return interaction.reply({ content: deniedStaffChat, flags: 1 << 6 });
    }
  }
  if (interaction.channel && !(expectsModal && isContextMenu)) {
    const { partnershipPublishChannelCommandsDeniedReplyContent } = require("../../Utils/Partner/partnersChatChannelUtils") as typeof import("../../Utils/Partner/partnersChatChannelUtils");
    const deniedPublishChannel = partnershipPublishChannelCommandsDeniedReplyContent(interaction.channel, {
      commandName: interaction.commandName,
    });
    if (deniedPublishChannel) {
      return interaction.reply({ content: deniedPublishChannel, flags: 1 << 6 });
    }
  }
  const isAdminCommand=String(command?.category||"").toLowerCase()==="admin";
    let forceEphemeralDefer = !isAdminCommand && command?.publicReply !== true;
  if (command?.publicReply === true) {
    const { userWantsPartnershipCommandPrivacy } = require("../../MultiGuild/utils/Partner/tenantProfileEphemeral") as typeof import("../../MultiGuild/utils/Partner/tenantProfileEphemeral");
    const wantsPrivate = await userWantsPartnershipCommandPrivacy(
      interaction.guildId || interaction.guild?.id,
      interaction.user?.id,
    );
    forceEphemeralDefer = wantsPrivate === true;
  }
  if (!client.interactionCommandLocks) client.interactionCommandLocks = new Set();
  const interactionLockId = `${interaction.guildId || "dm"}:${interaction.user.id}`;
  const slashPermission = slashPermissionEarly;
  if (!slashPermission?.allowed) {
    if (
      slashPermission?.silent === true ||
      slashPermission?.reason === "bot_usage_blacklisted_user" ||
      slashPermission?.reason === "bot_usage_blacklisted_guild"
    ) {
      return;
    }
    if (slashPermission?.reason === "partnership_not_configured") {
      return replyInteractionSetupRequired(interaction);
    }
    if (slashPermission?.reason === "tenant_partnership_only" && slashPermission?.message) {
      const { buildSimpleNoticePayload } = require("../../Utils/Embeds/simpleNoticeEmbed") as typeof import("../../Utils/Embeds/simpleNoticeEmbed");
      return interaction.reply({
        ...buildSimpleNoticePayload(slashPermission.message, interaction.guild, { ephemeral: true }),
        flags: 1 << 6,
      });
    }
    if (slashPermission?.reason === "main_guild_only") {
      const { buildSimpleNoticePayload } = require("../../Utils/Embeds/simpleNoticeEmbed") as typeof import("../../Utils/Embeds/simpleNoticeEmbed");
      return interaction.reply({
        ...buildSimpleNoticePayload(
          slashPermission.message || "<:vegax:1443934876440068179> Comando disponibile solo sul server principale.",
          interaction.guild,
          { ephemeral: true },
        ),
        flags: 1 << 6,
      });
    }
    if (slashPermission?.message) {
      const { buildSimpleNoticePayload } = require("../../Utils/Embeds/simpleNoticeEmbed") as typeof import("../../Utils/Embeds/simpleNoticeEmbed");
      return interaction.reply({
        ...buildSimpleNoticePayload(slashPermission.message, interaction.guild, { ephemeral: true }),
        flags: 1 << 6,
      });
    }
    if (slashPermission?.reason === "channel" && Array.isArray(slashPermission.channels)) return interaction.reply({ embeds: [buildGlobalChannelDeniedEmbed(slashPermission.channels,"comando", interaction.member)], flags: 1 << 6 });
    const requiredRoles = getSlashRequiredRoles(interaction);
    return interaction.reply({ embeds: [buildGlobalPermissionDeniedEmbed(requiredRoles)], flags: 1 << 6 });
  }
  const memberRoleCache = interaction.member?.roles?.cache;
  const memberRoleArray = interaction.member?.roles;
  const isGuildOwner=String(interaction.guild?.ownerId||"")===String(interaction.user?.id||"");
  const hasStaffPermissionBypass=hasAnyStaffBypassPermission(interaction.memberPermissions,);
  const hasStaffRoleBypass=Boolean((memberRoleCache&&typeof memberRoleCache.has==="function"&&memberRoleCache.has(SLASH_COOLDOWN_BYPASS_ROLE_ID))||(Array.isArray(memberRoleArray)&&memberRoleArray.includes(SLASH_COOLDOWN_BYPASS_ROLE_ID)),);
  const hasSlashCooldownBypass=Boolean(hasStaffRoleBypass||hasStaffPermissionBypass||isGuildOwner,);

  if (!hasSlashCooldownBypass && !expectsModal) {
    const cooldownSeconds=await getUserCommandCooldownSeconds({guildId:interaction.guildId,userId:interaction.user.id,member:interaction.member,});
    const cooldownResult=consumeUserCooldown({client,guildId:interaction.guildId,userId:interaction.user.id,cooldownSeconds,});
    if (!cooldownResult.ok) {
      const remaining=Math.max(1,Math.ceil(cooldownResult.remainingMs/1000),);
      return interaction.reply({ embeds: [buildCooldownErrorEmbed(remaining)], flags: 1 << 6 });
    }
  }
  if (client.interactionCommandLocks.has(interactionLockId)) {
    return interaction.reply({ embeds: [buildBusyCommandErrorEmbed()], flags: 1 << 6 });
  }
  client.interactionCommandLocks.add(interactionLockId);

  const track = trackInteractionStart(interaction, { commandName: command.name });
  if (!track.ok) {
    client.interactionCommandLocks.delete(interactionLockId);
    return interaction.reply({ content: SHUTDOWN_MESSAGE, flags: MessageFlags.Ephemeral }).catch(() => null);
  }

  const originalReply = interaction.reply.bind(interaction);
  const originalFollowUp = interaction.followUp?.bind(interaction);
  const originalEditReply = interaction.editReply.bind(interaction);
  const originalChannelSend=interaction.channel?.send?.bind(interaction.channel,);
  const wrappedInteraction = Object.create(interaction);
  wrappedInteraction.deferReply = (...args) => {
    const runDefer = !forceEphemeralDefer
      ? interaction.deferReply(...args)
      : (() => {
          const first = args?.[0];
          if (!first || typeof first !== "object" || Array.isArray(first)) {
            return interaction.deferReply({ flags: 1 << 6 });
          }
          if (!Object.prototype.hasOwnProperty.call(first, "flags")) {
            return interaction.deferReply({ ...first, flags: 1 << 6 });
          }
          return interaction.deferReply(...args);
        })();
    return Promise.resolve(runDefer).then((result?) => {
      markInteractionDeferred(interaction);
      return result;
    });
  };
  wrappedInteraction.showModal = (...args) => interaction.showModal(...args);
  wrappedInteraction.deferUpdate = (...args) => interaction.deferUpdate(...args);
  wrappedInteraction.update = (...args) => interaction.update(...args);
  wrappedInteraction.fetchReply = (...args) => interaction.fetchReply(...args);
  wrappedInteraction.deleteReply = (...args) => interaction.deleteReply(...args);
  wrappedInteraction.reply = async (payload?) => {
    payload = applyDefaultFooterToEmbeds(payload, interaction.guild);
    const result = interaction.deferred
      ? await interaction.editReply(sanitizeEditPayload(payload))
      : await originalReply(payload);
    markInteractionReplied(interaction);
    return result;
  };

  if (originalFollowUp) {
    wrappedInteraction.followUp = async (payload?) => {
      payload = applyDefaultFooterToEmbeds(payload, interaction.guild);
      if (interaction.deferred && !interaction.replied) {
        try {
          return await interaction.editReply(sanitizeEditPayload(payload));
        } catch (err) {
          global.logger?.warn?.("[commandHandlers] ", err?.message || err);
        }
      }
      try {
        const result = await originalFollowUp(payload);
        markInteractionReplied(interaction);
        return result;
      } catch (err) {
        if (err?.code === "InteractionNotReplied") {
          return originalReply(payload);
        }
        throw err;
      }
    };
  }

  wrappedInteraction.editReply = async (payload?) => {
    const withFooter = applyDefaultFooterToEmbeds(payload, interaction.guild);
    const result = await originalEditReply(sanitizeEditPayload(withFooter));
    markInteractionReplied(interaction);
    return result;
  };
  if (originalChannelSend) {
    const wrappedChannel = Object.create(interaction.channel);
    wrappedChannel.send = async (payload?) =>
      originalChannelSend(
        applyDefaultFooterToEmbeds(payload, interaction.guild),
      );
    wrappedInteraction.channel = wrappedChannel;
  }

  const safeReply = async (payload?) => safeReplyHelper(interaction, payload);

  let deferTimer;
  let commandFailed = false;
  let userErrorResponseSent = false;
  let executionTimeoutTimer;
  try {
    if (!expectsModal) {
      deferTimer = setTimeout(() => {
        if (!interaction.replied && !interaction.deferred) {
          const deferPayload = forceEphemeralDefer ? { flags: 1 << 6 } : {};
          interaction
            .deferReply(deferPayload)
            .then(() => markInteractionDeferred(interaction))
            .catch(() => {});
        }
      }, 1500);
      if (typeof deferTimer?.unref === "function") deferTimer.unref();
    }
    await Promise.race([
      Promise.resolve(command.execute(wrappedInteraction, client)),
      new Promise((_?, reject?) => {
        executionTimeoutTimer = setTimeout(() => {
          reject(
            new Error(
              `Slash command "${String(command?.name || interaction.commandName || "unknown")}" timed out after ${SLASH_EXECUTION_TIMEOUT_MS}ms`,
            ),
          );
        }, SLASH_EXECUTION_TIMEOUT_MS);
        if (typeof executionTimeoutTimer?.unref === "function") {
          executionTimeoutTimer.unref();
        }
      }),
    ]);
  } catch (error) {
    commandFailed = true;
    logCommandRuntimeError(interaction, error);
    // Token già morto: niente embed errori / safeReply (peggiora solo i log)
    if (isAckExpiredInteractionError(error)) {
      userErrorResponseSent = true;
    } else {
      const errorChannelId=IDs.channels.errorLogChannel||IDs.channels.serverBotLogs;
      const errorChannel=errorChannelId?await getCentralChannel(client,errorChannelId):null;
      const staffEmbed=buildErrorLogEmbed({contextLabel:"Comando",contextValue:interaction.commandName||"unknown",userTag:interaction.user?.tag||interaction.user?.id||"-",error,serverName:interaction.guild?`${interaction.guild.name}[${interaction.guild.id}]`
          : null,
      });
      const errorText=(error?.stack||error?.message||String(error))?.slice(0,1000)||"<:vegax:1443934876440068179> Errore sconosciuto";
      const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("error_pending").setEmoji("<:VC_InactiveStatus:1482526984234860574>").setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId("error_solved").setEmoji("<:VC_OnlineStatus:1482527088912240650>").setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId("error_unsolved").setEmoji("<:VC_OfflineStatus:1482527117051957380>").setStyle(ButtonStyle.Danger),);
      if (errorChannel) {
        try {
          await errorChannel.send({
            embeds: [staffEmbed],
            components: [row],
          });
        } catch (sendErr) {
          global.logger?.error?.(
            "[commandHandlers] failed to send error embed",
            sendErr,
          );
        }
      }
      const userEmbed = buildInternalCommandErrorEmbed(errorText);
      await safeReply({ embeds: [userEmbed], flags: 1 << 6 });
      userErrorResponseSent = true;
    }
  } finally {
    if (!expectsModal && interaction.deferred && !interaction.replied) {
      if (commandFailed && !userErrorResponseSent) await interaction.editReply({ content: "<:vegax:1443934876440068179> Comando terminato con errore." }).catch(() => {});
      else await interaction.deleteReply().catch(() => {});
    }
    if (deferTimer) clearTimeout(deferTimer);
    if (executionTimeoutTimer) clearTimeout(executionTimeoutTimer);
    client.interactionCommandLocks.delete(interactionLockId);
    releaseInteraction(interaction);
  }
}

export = { handleAutocomplete, handleSlashCommand };