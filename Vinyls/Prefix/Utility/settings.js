const { safePrefixPanelReply, safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { memberCanManageTenantPartnershipSettings } = require("../../Utils/Partner/tenantPartnershipAdminAccess");
const { resolveTenantLanguageForMessage,
  replyTenantMessage,
  tenantNotConfiguredError, tenantNoticePayload } = require("../../Utils/Partner/tenantPartnershipPrefixMessages");
const { refreshPartnershipConfigCache } = require("../../MultiGuild/core/tenantPartnershipSettings");
const {
  resolvePartnershipConfigSync,
  isPartnershipOperational,
} = require("../../Utils/Partner/partnershipConfigResolver");
const { buildViewPayload } = require("../../Utils/Partner/partnershipSettingsComponents");

module.exports = {
  name: "settings",
  keepCommandMessage: true,
  hideFromHelp: true,
  allowEmptyArgs: true,
  description: "Apre il pannello delle impostazioni partnership del server.",
  usage: "+settings",
  examples: ["+settings"],
  async execute(message) {
    if (!message.guild || !message.member) return;
    const lang = await resolveTenantLanguageForMessage(message);
    if (!memberCanManageTenantPartnershipSettings(message.member, message.guild)) {
      return safeMessageReply(message, {
        ...(await tenantNoticePayload(message, "admin_denied")),
        allowedMentions: { repliedUser: false },
        skipAutoCleanup: true,
      });
    }

    await refreshPartnershipConfigCache().catch(() => null);
    const guildId = message.guild.id;
    if (!isPartnershipOperational(guildId)) {
      return safeMessageReply(message, {
        ...(await tenantNotConfiguredError(message)),
        allowedMentions: { repliedUser: false },
        skipAutoCleanup: true,
      });
    }

    const config = resolvePartnershipConfigSync(guildId);
    const ownerId = message.author.id;
    const payload = buildViewPayload(message.guild, ownerId, "home", config, lang);

    return safePrefixPanelReply(message, {
      ...payload,
      allowedMentions: { repliedUser: false },
    });
  },
};
