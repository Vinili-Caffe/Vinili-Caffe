const { safeMessageReply, safePrefixPanelReply } = require("../../../shared/discord/replyRuntime") as typeof import("../../../shared/discord/replyRuntime");
const {
  isPartnershipOperational,
  memberHasPartnerManagerRole,
  shouldBlockTenantPartnershipPrefixCommands,
} = require("../../Utils/Partner/partnershipConfigResolver") as typeof import("../../Utils/Partner/partnershipConfigResolver");
const { memberCanManageTenantPartnershipSettings } = require("../../MultiGuild/utils/Partner/tenantPartnershipAdminAccess") as typeof import("../../MultiGuild/utils/Partner/tenantPartnershipAdminAccess");
const {
  partnersChatPartnerCommandDeniedReplyContent,
  sendPartnersChatDeniedPrefixCleanup,
} = require("../../Utils/Partner/partnersChatChannelUtils") as typeof import("../../Utils/Partner/partnersChatChannelUtils");
const {
  parseLeaderboardArgs,
  buildLeaderboardPayload,
} = require("../../MultiGuild/utils/Partner/tenantLeaderboardRuntime") as typeof import("../../MultiGuild/utils/Partner/tenantLeaderboardRuntime");
const {
  resolveTenantLanguageForMessage,
  tenantOnlyError,
  tenantNoPermissionError,
} = require("../../MultiGuild/utils/Partner/tenantPartnershipPrefixMessages") as typeof import("../../MultiGuild/utils/Partner/tenantPartnershipPrefixMessages");
const { replyPrefixSetupRequired } = require("../../MultiGuild/utils/Partner/tenantSetupRequiredReply") as typeof import("../../MultiGuild/utils/Partner/tenantSetupRequiredReply");
const { evaluateTenantObjectives } = require("../../MultiGuild/services/Partner/tenantObjectiveService") as typeof import("../../MultiGuild/services/Partner/tenantObjectiveService");

function memberCanUseTenantLeaderboard(member?, guild?) {
  const guildId = String(guild?.id || "").trim();
  if (!guildId || !member) return false;
  return (
    memberHasPartnerManagerRole(member, guildId) ||
    memberCanManageTenantPartnershipSettings(member, guild)
  );
}

export = {
  name: "leaderboard",
  aliases: ["lb"],
  allowEmptyArgs: true,
  description: "Mostra le classifiche globali per ingressi, Partner Manager e server.",
  usage: "+leaderboard",
  examples: ["+leaderboard", "+lb"],

  async execute(message?, args = []) {
    await message.channel.sendTyping().catch(() => null);
    if (!message.inGuild?.() || !message.guild || !message.member) return;

    const guildId = message.guild.id;
    const lang = await resolveTenantLanguageForMessage(message);
    if (shouldBlockTenantPartnershipPrefixCommands(guildId)) {
      return safeMessageReply(message, {
        ...(await tenantOnlyError(message, "`+leaderboard`")),
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

    if (!memberCanUseTenantLeaderboard(message.member, message.guild)) {
      return safeMessageReply(message, {
        ...(await tenantNoPermissionError(message, "`+leaderboard`")),
        allowedMentions: { repliedUser: false },
      });
    }

    const parsed = parseLeaderboardArgs(args);
    void evaluateTenantObjectives(message.client, guildId, message.author.id, {
      discordLocale: message.author?.locale,
    }).catch(() => null);
    const { payload } = await buildLeaderboardPayload(
      message.client,
      message.guild,
      {
        ownerId: message.author.id,
        category: parsed.category,
        period: parsed.period,
        page: parsed.page,
        targetGuildId: parsed.targetGuildId,
        lang,
      },
      message.author.id,
    );

    return safePrefixPanelReply(message, {
      ...payload,
      allowedMentions: { repliedUser: false },
    });
  },
};
