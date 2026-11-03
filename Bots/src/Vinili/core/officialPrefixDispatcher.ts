const path = require("path") as typeof import("path");
const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require("discord.js") as typeof import("discord.js");
const { applyDefaultFooterToEmbeds } = require("../../shared/embeds/defaultFooter") as typeof import("../../shared/embeds/defaultFooter");
const {
  applyTenantPayloadBranding,
  stripTenantBrandingInternals,
  shouldSkipPrefixDispatcherBranding,
  TENANT_EMBED_COLOR,
} = require("../../MultiGuild/utils/tenantEmbedBranding") as typeof import("../../MultiGuild/utils/tenantEmbedBranding");
const IDs = require("../Config/ids") as typeof import("../Config/ids");
const {
  checkPrefixPermission,
  getPrefixRequiredRoles,
  buildGlobalPermissionDeniedEmbed,
  buildGlobalChannelDeniedEmbed,
} = require("../Moderation/utils/commandPermissions") as typeof import("../Moderation/utils/commandPermissions");
const {
  getUserCommandCooldownSeconds,
  consumeUserCooldown,
} = require("../Moderation/utils/commandCooldown") as typeof import("../Moderation/utils/commandCooldown");
const { createCommandErrorEmbeds } = require("../../shared/moderation/createCommandErrorEmbeds") as typeof import("../../shared/moderation/createCommandErrorEmbeds");
const {
  buildCooldownErrorEmbed,
  buildBusyCommandErrorEmbed,
  buildMissingArgumentsErrorEmbed,
  buildInternalCommandErrorEmbed,
} = createCommandErrorEmbeds({
  color: TENANT_EMBED_COLOR,
  cancelEmoji: "<:cancel:1461730653677551691>",
  cooldownDescription: (remaining?) =>
    [
      `<:VC_Attention:1482534443632558151> Aspetta **${remaining}s** prima di usare un altro comando.`,
      "",
      "<a:VC_Timer:1482527426557775954> Il cooldown si riduce con i ruoli:",
      `<:VC_Dot:1482532364222595303> <@&${IDs.roles.Level30}>, <@&${IDs.roles.ServerBooster}> o <@&${IDs.roles.VIP}> <a:VC_Arrow:1482706699365257397> **15s**`,
      `<:VC_Dot:1482532364222595303> <@&${IDs.roles.Level50}>, <@&${IDs.roles.VIPplus}> o <@&${IDs.roles.DoubleBooster}> <a:VC_Arrow:1482706699365257397> **5s**`,
    ].join("\n"),
});
const { buildErrorLogEmbed } = require("../../shared/discord/errorLogEmbed") as typeof import("../../shared/discord/errorLogEmbed");
const { getCentralChannel } = require("./events/interactionCreateCommandLogging") as typeof import("./events/interactionCreateCommandLogging");
const { shouldBlockModerationCommands } = require("../Security/services/antiNukeService") as typeof import("../Security/services/antiNukeService");
const { getSecurityLockState } = require("../Security/services/securityOrchestratorService") as typeof import("../Security/services/securityOrchestratorService");
const { EPHEMERAL_TTL_SHORT_MS } = require("../../shared/utils/ephemeralMessageTtl") as typeof import("../../shared/utils/ephemeralMessageTtl");
const { createOfficialPrefixDispatcher } = require("../../shared/prefix/createOfficialPrefixDispatcher") as typeof import("../../shared/prefix/createOfficialPrefixDispatcher");
const { getCachedOrFetchMember } = require("../Community/services/officialMessageAutomationHandlers") as typeof import("../Community/services/officialMessageAutomationHandlers");
const { isCoffeePrefixCommandToken } = require("../../shared/discord/coffeePrefixCommandTokens") as typeof import("../../shared/discord/coffeePrefixCommandTokens");
const { createDispatchPrefixMessage } = require("../../shared/prefix/createDispatchPrefixMessage") as typeof import("../../shared/prefix/createDispatchPrefixMessage");

const REMOVED_PREFIX_COMMANDS = new Set([
  "colors",
  "staff",
  "verify",
  "ticket",
  "notify",
  "quit",
  "classifica",
  "sezioneproibita",
  "libriproibiti",
  "forbiddenbooks",
  "live",
  "myquote",
  "myrepost",
  "myclip",
  "bal",
  "balance",
  "work",
  "daily",
  "weekly",
  "monthly",
  "pay",
  "paga",
  "duel",
  "rob",
  "shop",
  "negozio",
  "store",
  "roulette",
  "rps",
  "slots",
  "slot",
  "blackjack",
  "bj",
  "coinflip",
  "cf",
  "tris",
  "scratch",
  "conquista",
  "swspawn",
  "punta",
  "ordine66",
]);

function finalizePrefixOutgoingPayload(payload?, guild?) {
  const withFooter = applyDefaultFooterToEmbeds(payload, guild);
  if (!guild?.id || shouldSkipPrefixDispatcherBranding(withFooter)) {
    return stripTenantBrandingInternals(withFooter);
  }
  return stripTenantBrandingInternals(
    applyTenantPayloadBranding(withFooter, {
      guildId: guild.id,
      guild,
      client: guild.client,
      partnershipBranding: true,
    }),
  );
}

function transformTemporaryPayload(payload?, guild?) {
  const { coercePlainContentToNoticePayload } = require("../../shared/embeds/simpleNoticeEmbed") as typeof import("../../shared/embeds/simpleNoticeEmbed");
  let out = coercePlainContentToNoticePayload(payload, guild) || payload;
  if (guild) {
    out = finalizePrefixOutgoingPayload(out, guild) || out;
  }
  return out;
}

function rewriteCustomPrefixAliases(message?, resolvedClient?, defaultPrefix?) {
  const text = String(message?.content || "");
  const lower = text.toLowerCase();
  const base = String(defaultPrefix || "+");

  const explicit = [
    { from: "?afk", to: `${base}afk` },
    { from: "?av", to: `${base}av` },
    { from: "?bn", to: `${base}bn` },
    { from: "?membercount", to: `${base}membercount` },
    { from: "s?channel", to: `${base}channel` },
    { from: "s?server", to: `${base}server` },
    { from: "s?me", to: `${base}me` },
    { from: "s?top", to: `${base}top` },
    { from: "s?user", to: `${base}user` },
  ];

  for (const row of explicit) {
    if (lower.startsWith(row.from)) {
      message.content = row.to + text.slice(row.from.length);
      return true;
    }
  }

  const direct = lower.match(/^\?([a-z0-9][\w-]*)/i);
  if (direct && resolvedClient?.pcommands) {
    const token = String(direct[1] || "").toLowerCase();
    const baseName = resolvedClient.aliases?.get?.(token) || token;
    const cmd = resolvedClient.pcommands.get(baseName);
    const folder = String(cmd?.folder || "").toLowerCase();
    if (cmd && (folder === "moderation" || folder === "minigames")) {
      message.content = base + token + text.slice(direct[0].length);
      return true;
    }
  }

  return false;
}

const official = createOfficialPrefixDispatcher({
  ids: IDs,
  botDataDir: path.join(__dirname, "..", "Data"),
  snapshotKey: "vinyls_prefix_queue",
  snapshotPath: path.join(__dirname, "..", "Data", "prefixQueueSnapshot.json"),
  checkPrefixPermission,
  getPrefixRequiredRoles,
  buildGlobalPermissionDeniedEmbed,
  buildGlobalChannelDeniedEmbed,
  buildCooldownErrorEmbed,
  buildBusyCommandErrorEmbed,
  buildMissingArgumentsErrorEmbed,
  buildInternalCommandErrorEmbed,
  getCentralChannel,
  finalizeOutgoingPayload: finalizePrefixOutgoingPayload,
  transformTemporaryPayload,
  rewriteMessageAliases: rewriteCustomPrefixAliases,
  removedCommands: REMOVED_PREFIX_COMMANDS,
  cooldownBypassRoleId: IDs.roles.Staff,
  precheckTimeoutMs: 12_000,
  trackInFlight: true,
  enableTypingPulse: true,
  warnOnPrecheckTimeout: true,
  allowDmQueueLock: true,
  shouldDeleteCommandMessage: (command?) => !command?.keepCommandMessage,

  onCommandNotFound: async ({ message, resolvedClient, sendTemporaryMessage }) => {
    if (resolvedClient.__prefixCommandsReady === false) {
      await sendTemporaryMessage(
        message.channel,
        {
          content:
            "<:VC_Attention:1482534443632558151> Bot ancora in avvio dopo il riavvio: riprova tra qualche secondo.",
        },
        EPHEMERAL_TTL_SHORT_MS,
      );
    }
    return true;
  },

  afterCommandResolved: async ({
    message,
    command,
    cmd,
    deleteCommandMessage,
    sendTemporaryMessage,
    resolveWithTimeout,
  }) => {
    {
      const {
        partnershipPublishChannelCommandsDeniedReplyContent,
        sendPartnersChatDeniedPrefixCleanup,
      } = require("../Partner/runtime/partnersChatChannelUtils") as typeof import("../Partner/runtime/partnersChatChannelUtils");
      const deniedPublishChannel = partnershipPublishChannelCommandsDeniedReplyContent(message.channel, {
        commandName: command?.name,
      });
      if (deniedPublishChannel) {
        await deleteCommandMessage();
        await sendPartnersChatDeniedPrefixCleanup(message, deniedPublishChannel);
        return false;
      }
    }

    const isAntiNukeRecoveryCommand = ["antinuke", "security"].includes(
      String(command?.name || "").toLowerCase(),
    );
    const securityLockState = await resolveWithTimeout(
      () => getSecurityLockState(message.guild),
      {
        active: false,
        joinLockActive: false,
        commandLockActive: false,
        sources: ["Precheck timeout"],
        commandSources: ["Precheck timeout"],
      },
      "security lock precheck",
    );
    if (!isAntiNukeRecoveryCommand && securityLockState.commandLockActive) {
      const lockSources = Array.isArray(securityLockState.commandSources)
        ? securityLockState.commandSources
        : securityLockState.sources;
      await deleteCommandMessage();
      await sendTemporaryMessage(
        message.channel,
        {
          content: `<:VC_Lock:1482526739044368476> Server in lockdown di sicurezza: comandi temporaneamente bloccati. ${lockSources?.length ? ` (${lockSources.join(", ")})` : ""}`,
        },
        EPHEMERAL_TTL_SHORT_MS,
      );
      return false;
    }

    if (
      !isAntiNukeRecoveryCommand &&
      ["staff", "admin"].includes(String(command.folder || "").toLowerCase()) &&
      (await shouldBlockModerationCommands(message.guild, String(message.author?.id || "")))
    ) {
      await deleteCommandMessage();
      await sendTemporaryMessage(
        message.channel,
        {
          content: "<:VC_Lock:1482526739044368476> Comandi di moderazione temporaneamente bloccati.",
        },
        EPHEMERAL_TTL_SHORT_MS,
      );
      return false;
    }

    const commandFolder = String(command.folder || "").toLowerCase();
    if (["staff", "admin"].includes(commandFolder)) {
      const { staffChatCommandsDeniedReplyContent } = require("../Staff/utils/staffChatChannelUtils") as typeof import("../Staff/utils/staffChatChannelUtils");
      const {
        sendPartnersChatDeniedPrefixCleanup,
        partnersChatPartnerCommandDeniedReplyContent,
      } = require("../Partner/runtime/partnersChatChannelUtils") as typeof import("../Partner/runtime/partnersChatChannelUtils");
      const deniedStaffChat = await staffChatCommandsDeniedReplyContent(message.channel).catch(() => null);
      if (deniedStaffChat) {
        await deleteCommandMessage();
        await sendPartnersChatDeniedPrefixCleanup(message, deniedStaffChat);
        return false;
      }

      const cmdName = String(command.name || cmd || "").toLowerCase();
      if (cmdName !== "setup") {
        const { resolveTenantPrefixFeatureCategory } = require("../../MultiGuild/core/openMediaCommands") as typeof import("../../MultiGuild/core/openMediaCommands");
        if (resolveTenantPrefixFeatureCategory(cmdName) === "partnership") {
          const deniedPartnerZone = await partnersChatPartnerCommandDeniedReplyContent(message.channel).catch(
            () => null,
          );
          if (deniedPartnerZone) {
            await deleteCommandMessage();
            await sendPartnersChatDeniedPrefixCleanup(message, deniedPartnerZone);
            return false;
          }
        }
      }
    }

    return true;
  },

  handlePermissionDenied: async ({
    message,
    command,
    prefixSubcommand,
    permissionResult,
    deleteCommandMessage,
    sendTemporaryMessage,
    getPrefixRequiredRoles: getRoles,
    buildGlobalPermissionDeniedEmbed: buildDenied,
    buildGlobalChannelDeniedEmbed: buildChannelDenied,
  }) => {
    if (permissionResult?.reason === "multi_guild_tenant_only_media") {
      return true;
    }
    if (
      permissionResult?.silent === true ||
      permissionResult?.reason === "bot_usage_blacklisted_user" ||
      permissionResult?.reason === "bot_usage_blacklisted_guild"
    ) {
      return true;
    }
    if (permissionResult?.reason === "permission_precheck_timeout") {
      await deleteCommandMessage();
      await sendTemporaryMessage(
        message.channel,
        {
          content:
            "<:VC_Attention:1482534443632558151> Verifica permessi in ritardo. Riprova tra un attimo.",
        },
        EPHEMERAL_TTL_SHORT_MS,
      );
      return true;
    }
    if (permissionResult?.reason === "multi_guild_tenant_mod_permission") {
      await deleteCommandMessage();
      const { buildSimpleNoticePayload } = require("../../shared/embeds/simpleNoticeEmbed") as typeof import("../../shared/embeds/simpleNoticeEmbed");
      await sendTemporaryMessage(
        message.channel,
        buildSimpleNoticePayload(
          "<:VC_Lock:1482526739044368476> Ti servono i permessi Discord adatti (es. **Banna membri**, **Espelli**, **Modera membri**, **Gestisci messaggi** o **Amministratore**).",
          message.guild,
          { title: "<:VC_Lock:1482526739044368476> **Non hai i permessi**" },
        ),
        EPHEMERAL_TTL_SHORT_MS,
      );
      return true;
    }
    if (String(permissionResult?.reason || "").startsWith("feature_disabled:")) {
      return true;
    }
    if (
      (permissionResult?.reason === "channel" || permissionResult?.reason === "tenant_command_channel") &&
      Array.isArray(permissionResult.channels)
    ) {
      await deleteCommandMessage();
      const embed = buildChannelDenied(permissionResult.channels, "comando", message.member);
      await sendTemporaryMessage(message.channel, { embeds: [embed] }, EPHEMERAL_TTL_SHORT_MS);
      return true;
    }
    const roleDenyReasons = new Set(["missing_role", "tenant_command_role"]);
    const isRoleDeny = roleDenyReasons.has(String(permissionResult?.reason || ""));
    const requiredRoles = isRoleDeny
      ? Array.isArray(permissionResult?.requiredRoles)
        ? permissionResult.requiredRoles
        : getRoles(command.name, prefixSubcommand)
      : null;
    const embed = buildDenied(
      requiredRoles,
      "comando",
      isRoleDeny
        ? null
        : "<:VC_Lock:1482526739044368476> Non hai i permessi per usare questo comando.",
      message.guild,
    );
    await deleteCommandMessage();
    await sendTemporaryMessage(message.channel, { embeds: [embed] }, EPHEMERAL_TTL_SHORT_MS);
    return true;
  },

  checkUserCooldown: async ({ message, resolvedClient, cooldownMember, resolveWithTimeout }) => {
    const cooldownSeconds = await resolveWithTimeout(
      () =>
        getUserCommandCooldownSeconds({
          guildId: message.guild.id,
          userId: message.author.id,
          member: cooldownMember,
        }),
      30,
      `cooldown lookup`,
    );
    return consumeUserCooldown({
      client: resolvedClient,
      guildId: message.guild.id,
      userId: message.author.id,
      cooldownSeconds,
    });
  },

  afterSuccessfulExecute: async ({ message, commandName }) => {
    try {
      const { maybeApplyTenantEphemeralCommandCleanup } = require("../Partner/tenant/tenantProfileEphemeral") as typeof import("../Partner/tenant/tenantProfileEphemeral");
      void maybeApplyTenantEphemeralCommandCleanup(message, commandName);
    } catch (_) {}
  },

  logCommandError: async ({ message, resolvedClient, commandName, error }) => {
    try {
      const channelID = IDs.channels.errorLogChannel || IDs.channels.serverBotLogs;
      const errorChannel = channelID ? await getCentralChannel(resolvedClient, channelID) : null;
      const errorEmbed = buildErrorLogEmbed({
        contextLabel: "Comando",
        contextValue: commandName || "unknown",
        userTag: message.author?.tag || "unknown",
        error,
        serverName: message.guild ? `${message.guild.name}[${message.guild.id}]` : null,
      });
      if (errorChannel?.isTextBased?.()) {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("error_pending")
            .setEmoji(`<:VC_InactiveStatus:1482526984234860574>`)
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId("error_solved")
            .setEmoji(`<:VC_OnlineStatus:1482527088912240650>`)
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId("error_unsolved")
            .setEmoji(`<:VC_OfflineStatus:1482527117051957380>`)
            .setStyle(ButtonStyle.Danger),
        );
        await errorChannel.send({ embeds: [errorEmbed], components: [row] }).catch(() => null);
      }
    } catch (nestedError) {
      global.logger?.error?.("[PREFIX] error log failed:", nestedError);
    }
  },
});

const dispatch = createDispatchPrefixMessage({
  ids: IDs,
  handleOfficialPrefixMessage: official.handleOfficialPrefixMessage,
  getCachedOrFetchMember,
  defaultPrefixFallback: "+",
  skipWrongPrefixHintForToken: (token?, usedPrefix?) => {
    if (usedPrefix === "-" && isCoffeePrefixCommandToken(token)) return true;
    return false;
  },
  skipWrongPrefixHintForCommand: (commandName?) => String(commandName || "").toLowerCase() === "help",
});

export = {
  ...official,
  ...dispatch,
};
