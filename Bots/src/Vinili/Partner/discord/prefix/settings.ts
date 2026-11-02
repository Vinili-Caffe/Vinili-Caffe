const { safePrefixPanelReply, safeMessageReply } = require("../../../../shared/discord/replyRuntime") as typeof import("../../../../shared/discord/replyRuntime");
const { memberCanManageTenantPartnershipSettings } = require("../../core/tenantPartnershipAdminAccess") as typeof import("../../core/tenantPartnershipAdminAccess");
const {
  resolveTenantLanguageForMessage,
  tenantNotConfiguredError,
  tenantNoticePayload,
} = require("../../tenant/tenantPartnershipPrefixMessages") as typeof import("../../tenant/tenantPartnershipPrefixMessages");
const { refreshPartnershipConfigCache } = require("../../core/tenantPartnershipSettings") as typeof import("../../core/tenantPartnershipSettings");
const {
  resolvePartnershipConfigSync,
  isPartnershipOperational,
  shouldApplyMainPartnershipFilters,
} = require("../../core/partnershipConfigResolver") as typeof import("../../core/partnershipConfigResolver");
const { buildViewPayload } = require("../../runtime/partnershipSettingsComponents") as typeof import("../../runtime/partnershipSettingsComponents");

async function openSettingsPanel(message?, lang?) {
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
  const payload = buildViewPayload(message.guild, message.author.id, "home", config, lang);
  return safePrefixPanelReply(message, {
    ...payload,
    allowedMentions: { repliedUser: false },
  });
}

async function executeMainSettings(message?, lang?) {
  return openSettingsPanel(message, lang);
}

async function executeTenantSettings(message?, lang?) {
  return openSettingsPanel(message, lang);
}

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
    if (shouldApplyMainPartnershipFilters(message.guild.id)) {
      return executeMainSettings(message, lang);
    }
    return executeTenantSettings(message, lang);
  },
};
