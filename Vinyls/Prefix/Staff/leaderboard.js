const { safeMessageReply, safePrefixPanelReply } = require("../../../shared/discord/replyRuntime");
const {
  isPartnershipOperational,
  memberHasPartnerManagerRole,
  shouldBlockTenantPartnershipPrefixCommands,
} = require("../../Utils/Partner/partnershipConfigResolver");
const { memberCanManageTenantPartnershipSettings } = require("../../Utils/Partner/tenantPartnershipAdminAccess");
const {
  partnersChatPartnerCommandDeniedReplyContent,
  sendPartnersChatDeniedPrefixCleanup,
} = require("../../Utils/Partner/partnersChatChannelUtils");
const {
  parseLeaderboardArgs,
  buildLeaderboardPayload,
} = require("../../Utils/Partner/tenantLeaderboardRuntime");
const {
  resolveTenantLanguageForMessage,
  tenantOnlyError,
  tenantNoPermissionError,
} = require("../../Utils/Partner/tenantPartnershipPrefixMessages");
const { replyPrefixSetupRequired } = require("../../Utils/Partner/tenantSetupRequiredReply");
const { evaluateTenantObjectives } = require("../../Services/Partner/tenantObjectiveService");

function memberCanUseTenantLeaderboard(member, guild) {
  const guildId = String(guild?.id || "").trim();
  if (!guildId || !member) return false;
  return (
    memberHasPartnerManagerRole(member, guildId) ||
    memberCanManageTenantPartnershipSettings(member, guild)
  );
}

module.exports = {
  name: "leaderboard",
  aliases: ["lb"],
  allowEmptyArgs: true,
  description: "Mostra le classifiche globali per ingressi, Partner Manager e server.",
  usage: "+leaderboard",
  examples: ["+leaderboard", "+lb"],

  async execute(message, args = []) {
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
