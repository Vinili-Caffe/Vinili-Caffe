const {
  refreshPartnershipConfigCache,
  getPartnershipConfigSync,
  isPartnershipSetupComplete,
} = require("../core/tenantPartnershipSettings") as typeof import("../core/tenantPartnershipSettings");
const {
  PREFIX,
  MODAL_PREFIX,
  buildSetupAlreadyCompletedEmbed,
} = require("../../Utils/Partner/partnershipSetupComponents") as typeof import("../../Utils/Partner/partnershipSetupComponents");
const { memberCanManageTenantPartnershipSettings } = require("../utils/Partner/tenantPartnershipAdminAccess") as typeof import("../utils/Partner/tenantPartnershipAdminAccess");
const { resolveTenantLanguageForInteraction } = require("../utils/Partner/tenantPartnershipPrefixMessages") as typeof import("../utils/Partner/tenantPartnershipPrefixMessages");
const { PRIVATE_FLAG, ephemeralNotice } = require("./partnership/collectorsHelpers") as typeof import("./partnership/collectorsHelpers");
const { handleSetupModal, handleSetupButton } = require("./partnership/setupStepsHelpers") as typeof import("./partnership/setupStepsHelpers");

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

async function rejectIfSetupAlreadyComplete(interaction?, lang?) {
  if (!interaction?.guild?.id) return false;
  await refreshPartnershipConfigCache().catch(() => null);
  const config = getPartnershipConfigSync(interaction.guild.id);
  if (!isPartnershipSetupComplete(config)) return false;
  await interaction
    .reply({
      embeds: [buildSetupAlreadyCompletedEmbed(lang)],
      flags: PRIVATE_FLAG,
    })
    .catch(() => null);
  return true;
}

async function execute(interaction?) {
  const lang = await resolveTenantLanguageForInteraction(interaction);
  if (await rejectIfNotPartnershipAdmin(interaction, lang)) return true;
  if (await rejectIfSetupAlreadyComplete(interaction, lang)) return true;

  if (interaction.isModalSubmit?.()) {
    return handleSetupModal(interaction, lang);
  }

  return handleSetupButton(interaction, lang);
}

export = {
  name: "partnershipSetup",
  order: 45,
  match,
  execute,
};
