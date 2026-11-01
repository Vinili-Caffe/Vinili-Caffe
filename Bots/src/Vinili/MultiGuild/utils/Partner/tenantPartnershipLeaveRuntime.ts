const { safeMessageReply } = require("../../../../shared/discord/replyRuntime") as typeof import("../../../../shared/discord/replyRuntime");
const { isViniliFullFeatureGuild } = require("../../core/guildFeatureScope") as typeof import("../../core/guildFeatureScope");
const { memberCanManageTenantPartnershipSettings } = require("./tenantPartnershipAdminAccess") as typeof import("./tenantPartnershipAdminAccess");
const { resolveTenantLanguageForMessage, tenantNoticePayload } = require("./tenantPartnershipPrefixMessages") as typeof import("./tenantPartnershipPrefixMessages");
const { refreshPartnershipConfigCache } = require("../../core/tenantPartnershipSettings") as typeof import("../../core/tenantPartnershipSettings");
const {
  clearTenantPartnershipGuildData,
  hasPartnershipLeaveWork,
  buildLeavePartnershipDoneEmbed,
  buildLeavePartnershipNothingEmbed,
} = require("../../services/Partner/tenantPartnershipLeaveService") as typeof import("../../services/Partner/tenantPartnershipLeaveService");

async function executeLeavePartnership(message?) {
  if (!message.guild || !message.member) return;

  const lang = await resolveTenantLanguageForMessage(message);
  if (isViniliFullFeatureGuild(message.guild.id)) {
    return safeMessageReply(message, {
      ...(await tenantNoticePayload(message, "leavePartnership_tenantOnly")),
      allowedMentions: { repliedUser: false },
      skipAutoCleanup: true,
    });
  }
  if (!memberCanManageTenantPartnershipSettings(message.member, message.guild)) {
    return safeMessageReply(message, {
      ...(await tenantNoticePayload(message, "admin_denied")),
      allowedMentions: { repliedUser: false },
      skipAutoCleanup: true,
    });
  }

  await refreshPartnershipConfigCache().catch(() => null);
  if (!(await hasPartnershipLeaveWork(message.guild.id))) {
    return safeMessageReply(message, {
      embeds: [buildLeavePartnershipNothingEmbed(lang)],
      allowedMentions: { repliedUser: false },
      skipAutoCleanup: true,
    });
  }

  const result = await clearTenantPartnershipGuildData(message.guild.id);
  if (!result.ok) {
    return safeMessageReply(message, {
      ...(await tenantNoticePayload(message, "admin_saveFailed")),
      allowedMentions: { repliedUser: false },
      skipAutoCleanup: true,
    });
  }

  return safeMessageReply(message, {
    embeds: [buildLeavePartnershipDoneEmbed(lang, message.guild.name)],
    allowedMentions: { repliedUser: false },
    skipAutoCleanup: true,
  });
}

export = { executeLeavePartnership };
