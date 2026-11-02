const { safeMessageReply } = require("../../../../shared/discord/replyRuntime") as typeof import("../../../../shared/discord/replyRuntime");
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
const { parseUserInfoArgs } = require("../../tenant/tenantUserInfoRuntime") as typeof import("../../tenant/tenantUserInfoRuntime");
const { buildTenantPointsPayload } = require("../../tenant/tenantPointsRuntime") as typeof import("../../tenant/tenantPointsRuntime");
const {
  resolveTenantLanguageForMessage,
  tenantNoPermissionError,
} = require("../../tenant/tenantPartnershipPrefixMessages") as typeof import("../../tenant/tenantPartnershipPrefixMessages");
const { replyPrefixSetupRequired } = require("../../tenant/tenantSetupRequiredReply") as typeof import("../../tenant/tenantSetupRequiredReply");

function memberCanUsePoints(member?, guild?) {
  const guildId = String(guild?.id || "").trim();
  if (!guildId || !member) return false;
  return (
    memberHasPartnerManagerRole(member, guildId) ||
    memberCanManageTenantPartnershipSettings(member, guild)
  );
}

async function runPoints(message?, args = []) {
  await message.channel.sendTyping().catch(() => null);
  if (!message.inGuild?.() || !message.guild || !message.member) return;

  const guildId = message.guild.id;
  const lang = await resolveTenantLanguageForMessage(message);
  if (await rejectIfPartnershipToolkitBlocked(message, "+points")) return;

  if (!isPartnershipOperational(guildId)) {
    return replyPrefixSetupRequired(message);
  }

  const denied = await partnersChatPartnerCommandDeniedReplyContent(message.channel).catch(() => null);
  if (denied) {
    return sendPartnersChatDeniedPrefixCleanup(message, denied);
  }

  if (!memberCanUsePoints(message.member, message.guild)) {
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
}

async function executeMainPoints(message?, args = []) {
  return runPoints(message, args);
}

async function executeTenantPoints(message?, args = []) {
  return runPoints(message, args);
}

export = {
  name: "points",
  allowEmptyArgs: true,
  description: "Consulta i punti partnership di un Partner Manager.",
  usage: "+points [@utente | userId]",
  examples: ["+points", "+points @Utente", "+points 295500038401163264"],

  async execute(message?, args = []) {
    if (isMainPartnershipPrefixGuild(message?.guild?.id)) {
      return executeMainPoints(message, args);
    }
    return executeTenantPoints(message, args);
  },
};
