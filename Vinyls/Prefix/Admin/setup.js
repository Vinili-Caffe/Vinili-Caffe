const { safePrefixPanelReply, safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { isViniliFullFeatureGuild } = require("../../MultiGuild/core/guildFeatureScope");
const { memberCanManageTenantPartnershipSettings } = require("../../Utils/Partner/tenantPartnershipAdminAccess");
const { resolveTenantLanguageForMessage, tenantNoticePayload } = require("../../Utils/Partner/tenantPartnershipPrefixMessages");
const { refreshPartnershipConfigCache, getPartnershipConfigSync, isPartnershipSetupComplete } = require("../../MultiGuild/core/tenantPartnershipSettings");
const { buildStepPayload, buildSetupAlreadyCompletedEmbed } = require("../../Utils/Partner/partnershipSetupComponents");

module.exports = {
  name: "setup",
  tenantOnly: true,
  keepCommandMessage: true,
  hideFromHelp: true,
  allowEmptyArgs: true,
  description: "Avvia la configurazione iniziale della partnership sul server.",
  usage: "+setup",
  examples: ["+setup"],
  async execute(message) {
    if (!message.guild || !message.member) return;
    const lang = await resolveTenantLanguageForMessage(message);
    if (isViniliFullFeatureGuild(message.guild.id)) {
      return safeMessageReply(message, {
        ...(await tenantNoticePayload(message, "setup_tenantOnly")),
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
    const config = getPartnershipConfigSync(message.guild.id);
    if (isPartnershipSetupComplete(config)) {
      return safeMessageReply(message, {
        embeds: [buildSetupAlreadyCompletedEmbed(lang)],
        allowedMentions: { repliedUser: false },
        skipAutoCleanup: true,
      });
    }

    const ownerId = message.author.id;
    const payload = buildStepPayload(message.guild, ownerId, "channels", config, lang);

    return safePrefixPanelReply(message, {
      ...payload,
      allowedMentions: { repliedUser: false },
    });
  },
};
