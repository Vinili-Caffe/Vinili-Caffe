const { safePrefixPanelReply, safeMessageReply } = require("../../../../shared/discord/replyRuntime") as typeof import("../../../../shared/discord/replyRuntime");
const { memberCanManageTenantPartnershipSettings } = require("../../core/tenantPartnershipAdminAccess") as typeof import("../../core/tenantPartnershipAdminAccess");
const { resolveTenantLanguageForMessage, tenantNoticePayload } = require("../../tenant/tenantPartnershipPrefixMessages") as typeof import("../../tenant/tenantPartnershipPrefixMessages");
const { refreshPartnershipConfigCache, getPartnershipConfigSync, isPartnershipSetupComplete } = require("../../core/tenantPartnershipSettings") as typeof import("../../core/tenantPartnershipSettings");
const { E } = require("../../../../shared/emojis/emojiCatalog") as typeof import("../../../../shared/emojis/emojiCatalog");
const {
  shouldApplyMainPartnershipFilters,
  resolvePartnershipConfigSync,
} = require("../../core/partnershipConfigResolver") as typeof import("../../core/partnershipConfigResolver");
const { buildStepPayload, buildSetupAlreadyCompletedEmbed } = require("../../runtime/partnershipSetupComponents") as typeof import("../../runtime/partnershipSetupComponents");

async function denyIfNotAdmin(message?, lang?) {
  if (memberCanManageTenantPartnershipSettings(message.member, message.guild)) return false;
  await safeMessageReply(message, {
    ...(await tenantNoticePayload(message, "admin_denied")),
    allowedMentions: { repliedUser: false },
    skipAutoCleanup: true,
  });
  return true;
}

/** Main: setup legacy già completo — niente wizard tenant. */
async function executeMainSetup(message?, lang?) {
  if (await denyIfNotAdmin(message, lang)) return;
  await refreshPartnershipConfigCache().catch(() => null);
  const config = resolvePartnershipConfigSync(message.guild.id);
  if (isPartnershipSetupComplete(config) || config?.setupCompleted || config?.legacy) {
    return safeMessageReply(message, {
      embeds: [buildSetupAlreadyCompletedEmbed(lang)],
      content: `${E.VC_Info} Usa \`+settings\` per le impostazioni partnership.`,
      allowedMentions: { repliedUser: false },
      skipAutoCleanup: true,
    });
  }
  const payload = buildStepPayload(message.guild, message.author.id, "channels", config, lang);
  return safePrefixPanelReply(message, {
    ...payload,
    allowedMentions: { repliedUser: false },
  });
}

async function executeTenantSetup(message?, lang?) {
  if (await denyIfNotAdmin(message, lang)) return;
  await refreshPartnershipConfigCache().catch(() => null);
  const config = getPartnershipConfigSync(message.guild.id);
  if (isPartnershipSetupComplete(config)) {
    return safeMessageReply(message, {
      embeds: [buildSetupAlreadyCompletedEmbed(lang)],
      allowedMentions: { repliedUser: false },
      skipAutoCleanup: true,
    });
  }
  const payload = buildStepPayload(message.guild, message.author.id, "channels", config, lang);
  return safePrefixPanelReply(message, {
    ...payload,
    allowedMentions: { repliedUser: false },
  });
}

export = {
  name: "setup",
  keepCommandMessage: true,
  hideFromHelp: true,
  allowEmptyArgs: true,
  description: "Avvia la configurazione iniziale della partnership sul server.",
  usage: "+setup",
  examples: ["+setup"],
  async execute(message?) {
    if (!message.guild || !message.member) return;
    const lang = await resolveTenantLanguageForMessage(message);
    if (shouldApplyMainPartnershipFilters(message.guild.id)) {
      return executeMainSetup(message, lang);
    }
    return executeTenantSetup(message, lang);
  },
};
