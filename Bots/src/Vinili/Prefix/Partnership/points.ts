const { safeMessageReply } = require("../../../shared/discord/replyRuntime") as typeof import("../../../shared/discord/replyRuntime");
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
const { parseUserInfoArgs } = require("../../MultiGuild/utils/Partner/tenantUserInfoRuntime") as typeof import("../../MultiGuild/utils/Partner/tenantUserInfoRuntime");
const { buildTenantPointsPayload } = require("../../MultiGuild/utils/Partner/tenantPointsRuntime") as typeof import("../../MultiGuild/utils/Partner/tenantPointsRuntime");
const {
  resolveTenantLanguageForMessage,
  tenantOnlyError,
  tenantNoPermissionError,
} = require("../../MultiGuild/utils/Partner/tenantPartnershipPrefixMessages") as typeof import("../../MultiGuild/utils/Partner/tenantPartnershipPrefixMessages");
const { replyPrefixSetupRequired } = require("../../MultiGuild/utils/Partner/tenantSetupRequiredReply") as typeof import("../../MultiGuild/utils/Partner/tenantSetupRequiredReply");

function memberCanUseTenantPoints(member?, guild?) {
  const guildId = String(guild?.id || "").trim();
  if (!guildId || !member) return false;
  return (
    memberHasPartnerManagerRole(member, guildId) ||
    memberCanManageTenantPartnershipSettings(member, guild)
  );
}

export = {
  name: "points",
  allowEmptyArgs: true,
  description: "Consulta i punti partnership di un Partner Manager.",
  usage: "+points [@utente | userId]",
  examples: ["+points", "+points @Utente", "+points 295500038401163264"],

  async execute(message?, args = []) {
    await message.channel.sendTyping().catch(() => null);
    if (!message.inGuild?.() || !message.guild || !message.member) return;

    const guildId = message.guild.id;
    const lang = await resolveTenantLanguageForMessage(message);
    if (shouldBlockTenantPartnershipPrefixCommands(guildId)) {
      return safeMessageReply(message, {
        ...(await tenantOnlyError(message, "`+points`")),
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

    if (!memberCanUseTenantPoints(message.member, message.guild)) {
      return safeMessageReply(message, {
        ...(await tenantNoPermissionError(message, "`+points`")),
        allowedMentions: { repliedUser: false },
      });
    }

    const parsed = parseUserInfoArgs(args, message);
    const payload = await buildTenantPointsPayload(message.client, message.guild, {
      ...parsed,
      fallbackUserId: message.author.id,
      ownerId: message.author.id,
      requesterMember: message.member,
      lang,
    });
    return safeMessageReply(message, payload);
  },
};
