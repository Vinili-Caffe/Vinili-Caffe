const {
  refreshPartnershipConfigCache,
  isPartnershipSetupComplete,
} = require("../../core/tenantPartnershipSettings") as typeof import("../../core/tenantPartnershipSettings");
const { PREFIX, MODAL_PREFIX } = require("../../runtime/partnershipSettingsComponents") as typeof import("../../runtime/partnershipSettingsComponents");
const { memberCanManageTenantPartnershipSettings } = require("../../core/tenantPartnershipAdminAccess") as typeof import("../../core/tenantPartnershipAdminAccess");
const { resolveTenantLanguageForInteraction } = require("../../tenant/tenantPartnershipPrefixMessages") as typeof import("../../tenant/tenantPartnershipPrefixMessages");
const { resolvePartnershipConfigSync } = require("../../core/partnershipConfigResolver") as typeof import("../../core/partnershipConfigResolver");
const { replyInteractionSetupRequired } = require("../../tenant/tenantSetupRequiredReply") as typeof import("../../tenant/tenantSetupRequiredReply");
const { ephemeralNotice } = require("./collectorsHelpers") as typeof import("./collectorsHelpers");
const { handleSettingsModal } = require("./settingsModalsHelpers") as typeof import("./settingsModalsHelpers");
const {
  acknowledgeSettingsSelectEarly,
  handleSettingsSelect,
  handleSettingsButton,
} = require("./settingsActionsHelpers") as typeof import("./settingsActionsHelpers");

function match(interaction?) {
  const customId = String(interaction?.customId || "");
  return customId.startsWith(`${PREFIX}:`) || customId.startsWith(`${MODAL_PREFIX}:`);
}

async function rejectIfNotPartnershipAdmin(interaction?, lang?) {
  if (memberCanManageTenantPartnershipSettings(interaction.member, interaction.guild)) {
    return false;
  }
  await interaction
    .reply(ephemeralNotice(lang, "admin_denied", interaction.guild))
    .catch(() => null);
  return true;
}

async function rejectIfSetupIncomplete(interaction?, lang?) {
  await refreshPartnershipConfigCache().catch(() => null);
  const config = resolvePartnershipConfigSync(interaction.guild?.id);
  if (isPartnershipSetupComplete(config)) return false;
  await replyInteractionSetupRequired(interaction, { lang });
  return true;
}

async function execute(interaction?) {
  await acknowledgeSettingsSelectEarly(interaction);

  const lang = await resolveTenantLanguageForInteraction(interaction);
  if (await rejectIfNotPartnershipAdmin(interaction, lang)) return true;
  if (await rejectIfSetupIncomplete(interaction, lang)) return true;

  if (interaction.isModalSubmit?.()) {
    return handleSettingsModal(interaction, lang);
  }

  if (interaction.isStringSelectMenu?.()) {
    return handleSettingsSelect(interaction, lang);
  }

  return handleSettingsButton(interaction, lang);
}

export = {
  name: "partnershipSettings",
  order: 46,
  match,
  execute,
};
