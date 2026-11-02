const { safeMessageReply, safePrefixPanelReply } = require("../../../../shared/discord/replyRuntime") as typeof import("../../../../shared/discord/replyRuntime");
const {
  isPartnershipOperational,
  memberHasPartnerManagerRole,
} = require("../../core/partnershipConfigResolver") as typeof import("../../core/partnershipConfigResolver");
const {
  rejectIfPartnershipToolkitBlocked,
  isMainPartnershipPrefixGuild,
} = require("../../core/partnershipPrefixToolkit") as typeof import("../../core/partnershipPrefixToolkit");
const { memberCanManageTenantPartnershipSettings } = require("../../core/tenantPartnershipAdminAccess") as typeof import("../../core/tenantPartnershipAdminAccess");
const {
  partnersChatPartnerCommandDeniedReplyContent,
  sendPartnersChatDeniedPrefixCleanup,
} = require("../../runtime/partnersChatChannelUtils") as typeof import("../../runtime/partnersChatChannelUtils");
const {
  parseLeaderboardArgs,
  buildLeaderboardPayload,
} = require("../../tenant/tenantLeaderboardRuntime") as typeof import("../../tenant/tenantLeaderboardRuntime");
const {
  resolveTenantLanguageForMessage,
  tenantNoPermissionError,
} = require("../../tenant/tenantPartnershipPrefixMessages") as typeof import("../../tenant/tenantPartnershipPrefixMessages");
const { replyPrefixSetupRequired } = require("../../tenant/tenantSetupRequiredReply") as typeof import("../../tenant/tenantSetupRequiredReply");
const { evaluateTenantObjectives } = require("../../services/tenantObjectiveService") as typeof import("../../services/tenantObjectiveService");

function memberCanUseLeaderboard(member?, guild?) {
  const guildId = String(guild?.id || "").trim();
  if (!guildId || !member) return false;
  return (
    memberHasPartnerManagerRole(member, guildId) ||
    memberCanManageTenantPartnershipSettings(member, guild)
  );
}

async function runLeaderboard(message?, args = []) {
  await message.channel.sendTyping().catch(() => null);
  if (!message.inGuild?.() || !message.guild || !message.member) return;

  const guildId = message.guild.id;
  const lang = await resolveTenantLanguageForMessage(message);
  if (await rejectIfPartnershipToolkitBlocked(message, "+leaderboard")) return;

  if (!isPartnershipOperational(guildId)) {
    return replyPrefixSetupRequired(message);
  }

  const denied = await partnersChatPartnerCommandDeniedReplyContent(message.channel).catch(() => null);
  if (denied) {
    return sendPartnersChatDeniedPrefixCleanup(message, denied);
  }

  if (!memberCanUseLeaderboard(message.member, message.guild)) {
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
}

async function executeMainLeaderboard(message?, args = []) {
  return runLeaderboard(message, args);
}

async function executeTenantLeaderboard(message?, args = []) {
  return runLeaderboard(message, args);
}

export = {
  name: "leaderboard",
  aliases: ["lb"],
  allowEmptyArgs: true,
  description: "Mostra le classifiche globali per ingressi, Partner Manager e server.",
  usage: "+leaderboard",
  examples: ["+leaderboard", "+lb"],

  async execute(message?, args = []) {
    if (isMainPartnershipPrefixGuild(message?.guild?.id)) {
      return executeMainLeaderboard(message, args);
    }
    return executeTenantLeaderboard(message, args);
  },
};
