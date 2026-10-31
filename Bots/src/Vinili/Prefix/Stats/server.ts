const { safeMessageReply } = require("../../../shared/discord/replyRuntime") as typeof import("../../../shared/discord/replyRuntime");
const serverButton = require("../../Buttons/index").server;
const {
  isPartnershipOperational,
  memberHasPartnerManagerRole,
  shouldBlockTenantPartnershipPrefixCommands,
  shouldUseTenantStatsInfoRouting,
} = require("../../Utils/Partner/partnershipConfigResolver") as typeof import("../../Utils/Partner/partnershipConfigResolver");
const { memberCanManageTenantPartnershipSettings } = require("../../MultiGuild/utils/Partner/tenantPartnershipAdminAccess") as typeof import("../../MultiGuild/utils/Partner/tenantPartnershipAdminAccess");
const {
  partnersChatPartnerCommandDeniedReplyContent,
  sendPartnersChatDeniedPrefixCleanup,
} = require("../../Utils/Partner/partnersChatChannelUtils") as typeof import("../../Utils/Partner/partnersChatChannelUtils");
const {
  parseServerInfoArgs,
  buildTenantServerInfoPayload,
} = require("../../MultiGuild/utils/Partner/tenantServerInfoRuntime") as typeof import("../../MultiGuild/utils/Partner/tenantServerInfoRuntime");
const {
  resolveTenantLanguageForMessage,
  tenantOnlyError,
  tenantNoPermissionError,
} = require("../../MultiGuild/utils/Partner/tenantPartnershipPrefixMessages") as typeof import("../../MultiGuild/utils/Partner/tenantPartnershipPrefixMessages");
const { replyPrefixSetupRequired } = require("../../MultiGuild/utils/Partner/tenantSetupRequiredReply") as typeof import("../../MultiGuild/utils/Partner/tenantSetupRequiredReply");

function memberCanUseTenantServerInfo(member?, guild?) {
  const guildId = String(guild?.id || "").trim();
  if (!guildId || !member) return false;
  return (
    memberHasPartnerManagerRole(member, guildId) ||
    memberCanManageTenantPartnershipSettings(member, guild)
  );
}

async function executeTenantServerInfo(message?, args = []) {
  await message.channel.sendTyping().catch(() => null);
  if (!message.inGuild?.() || !message.guild || !message.member) return;

  const guildId = message.guild.id;
  const lang = await resolveTenantLanguageForMessage(message);
  if (shouldBlockTenantPartnershipPrefixCommands(guildId)) {
    return safeMessageReply(message, {
      ...(await tenantOnlyError(message, "`+server info`")),
      allowedMentions: { repliedUser: false },
    });
  }

  if (!isPartnershipOperational(guildId)) {
    return replyPrefixSetupRequired(message);
  }

  const denied = await partnersChatPartnerCommandDeniedReplyContent(message.channel).catch(() => null);
  if (denied) {
    return sendPartnersChatDeniedPrefixCleanup(message, denied);
  }

  if (!memberCanUseTenantServerInfo(message.member, message.guild)) {
    return safeMessageReply(message, {
      ...(await tenantNoPermissionError(message, "`+server info`")),
      allowedMentions: { repliedUser: false },
    });
  }

  const parsed = parseServerInfoArgs(args);
  const payload = await buildTenantServerInfoPayload(message.client, message.guild, { ...parsed, lang });
  return safeMessageReply(message, payload);
}

export = {
  name: serverButton.name,
  allowEmptyArgs: true,
  subcommands: ["info"],
  description: "Mostra le statistiche di attività del server o la scheda partnership.",
  usage: "+server [giorni] · +server info [guildId]",
  examples: ["+server", "+server 30", "+server info", "+server info 1507370621955215503"],
  subcommandUsages: {
    info: "+server info [guildId]",
  },
  subcommandDescriptions: {
    info: "Scheda informativa partnership di un server.",
  },
  SERVER_REFRESH_CUSTOM_ID_PREFIX: serverButton.SERVER_REFRESH_CUSTOM_ID_PREFIX,
  buildServerOverviewPayload: serverButton.buildServerOverviewPayload,

  async execute(message?, args = []) {
    const guildId = message.guild?.id;
    const first = String(args[0] || "").trim();
    const sub = first.toLowerCase();

        if (sub === "info") {
      return executeTenantServerInfo(message, args.slice(1));
    }

    const isSnowflake = /^\d{16,20}$/.test(first);
    if (shouldUseTenantStatsInfoRouting(guildId) && isSnowflake) {
      return executeTenantServerInfo(message, args);
    }

        if (shouldUseTenantStatsInfoRouting(guildId)) {
      return safeMessageReply(message, {
        content:
          "<:vegax:1443934876440068179> Su questo server usa `+server info` per la scheda partnership.",
        allowedMentions: { repliedUser: false },
      });
    }

        const { lookbackDays } = serverButton.parseServerActivityArgs(args);
    const { safeMessageEdit } = require("../../../shared/discord/replyRuntime") as typeof import("../../../shared/discord/replyRuntime");
    const loading = await safeMessageReply(
      message,
      serverButton.normalizeServerMessageEdit(
        serverButton.buildServerLoadingPayload(lookbackDays, message.author?.id),
        { repliedUser: false },
      ),
    );
    const applyPanel = async (payload?) => {
      const body = serverButton.normalizeServerMessageEdit(payload, { repliedUser: false });
      if (loading?.edit) {
        await safeMessageEdit(loading, body, message);
        return;
      }
      await safeMessageReply(message, body);
    };
    const payload = await serverButton.buildServerOverviewPayload(
      message.guild,
      lookbackDays,
      message.author?.id,
      { onLateImage: applyPanel },
    );
    await applyPanel(payload);
  },
};
