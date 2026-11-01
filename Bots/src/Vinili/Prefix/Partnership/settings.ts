const { safePrefixPanelReply, safeMessageReply } = require("../../../shared/discord/replyRuntime") as typeof import("../../../shared/discord/replyRuntime");
const { memberCanManageTenantPartnershipSettings } = require("../../MultiGuild/utils/Partner/tenantPartnershipAdminAccess") as typeof import("../../MultiGuild/utils/Partner/tenantPartnershipAdminAccess");
const {
  resolveTenantLanguageForMessage,
  tenantNotConfiguredError,
  tenantNoticePayload,
} = require("../../MultiGuild/utils/Partner/tenantPartnershipPrefixMessages") as typeof import("../../MultiGuild/utils/Partner/tenantPartnershipPrefixMessages");
const { refreshPartnershipConfigCache } = require("../../MultiGuild/core/tenantPartnershipSettings") as typeof import("../../MultiGuild/core/tenantPartnershipSettings");
const {
  resolvePartnershipConfigSync,
  isPartnershipOperational,
} = require("../../Utils/Partner/partnershipConfigResolver") as typeof import("../../Utils/Partner/partnershipConfigResolver");
const { buildViewPayload } = require("../../Utils/Partner/partnershipSettingsComponents") as typeof import("../../Utils/Partner/partnershipSettingsComponents");

export = {
  name: "settings",
  keepCommandMessage: true,
  hideFromHelp: true,
  allowEmptyArgs: true,
  description: "Apre il pannello delle impostazioni partnership del server.",
  usage: "+settings",
  examples: ["+settings"],
  async execute(message?) {
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
