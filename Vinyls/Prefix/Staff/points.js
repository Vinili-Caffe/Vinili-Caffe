const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
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
const { parseUserInfoArgs } = require("../../Utils/Partner/tenantUserInfoRuntime");
const { buildTenantPointsPayload } = require("../../Utils/Partner/tenantPointsRuntime");
const {
  resolveTenantLanguageForMessage,
  tenantOnlyError,
  tenantNoPermissionError,
} = require("../../Utils/Partner/tenantPartnershipPrefixMessages");
const { replyPrefixSetupRequired } = require("../../Utils/Partner/tenantSetupRequiredReply");

function memberCanUseTenantPoints(member, guild) {
  const guildId = String(guild?.id || "").trim();
  if (!guildId || !member) return false;
  return (
    memberHasPartnerManagerRole(member, guildId) ||
    memberCanManageTenantPartnershipSettings(member, guild)
  );
}

module.exports = {
  name: "points",
  allowEmptyArgs: true,
  description: "Consulta i punti partnership di un Partner Manager.",
  usage: "+points [@utente | userId]",
  examples: ["+points", "+points @Utente", "+points 295500038401163264"],

  async execute(message, args = []) {
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
