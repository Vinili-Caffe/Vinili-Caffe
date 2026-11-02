const {
  refreshPartnershipConfigCache,
  isPartnershipSetupComplete,
} = require("../core/tenantPartnershipSettings") as typeof import("../core/tenantPartnershipSettings");
const { PREFIX, MODAL_PREFIX } = require("../../Utils/Partner/partnershipSettingsComponents") as typeof import("../../Utils/Partner/partnershipSettingsComponents");
const { memberCanManageTenantPartnershipSettings } = require("../utils/Partner/tenantPartnershipAdminAccess") as typeof import("../utils/Partner/tenantPartnershipAdminAccess");
const { resolveTenantLanguageForInteraction } = require("../utils/Partner/tenantPartnershipPrefixMessages") as typeof import("../utils/Partner/tenantPartnershipPrefixMessages");
const { resolvePartnershipConfigSync } = require("../../Utils/Partner/partnershipConfigResolver") as typeof import("../../Utils/Partner/partnershipConfigResolver");
const { replyInteractionSetupRequired } = require("../utils/Partner/tenantSetupRequiredReply") as typeof import("../utils/Partner/tenantSetupRequiredReply");
const { ephemeralNotice } = require("./partnership/collectorsHelpers") as typeof import("./partnership/collectorsHelpers");
const { handleSettingsModal } = require("./partnership/settingsModalsHelpers") as typeof import("./partnership/settingsModalsHelpers");
const {
  acknowledgeSettingsSelectEarly,
  handleSettingsSelect,
  handleSettingsButton,
} = require("./partnership/settingsActionsHelpers") as typeof import("./partnership/settingsActionsHelpers");

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
