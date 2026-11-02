const {
  refreshPartnershipConfigCache,
  getPartnershipConfigSync,
  isPartnershipSetupComplete,
} = require("../../core/tenantPartnershipSettings") as typeof import("../../core/tenantPartnershipSettings");
const {
  PREFIX,
  MODAL_PREFIX,
  buildSetupAlreadyCompletedEmbed,
} = require("../../runtime/partnershipSetupComponents") as typeof import("../../runtime/partnershipSetupComponents");
const { memberCanManageTenantPartnershipSettings } = require("../../core/tenantPartnershipAdminAccess") as typeof import("../../core/tenantPartnershipAdminAccess");
const { resolveTenantLanguageForInteraction } = require("../../tenant/tenantPartnershipPrefixMessages") as typeof import("../../tenant/tenantPartnershipPrefixMessages");
const { PRIVATE_FLAG, ephemeralNotice } = require("./collectorsHelpers") as typeof import("./collectorsHelpers");
const { handleSetupModal, handleSetupButton } = require("./setupStepsHelpers") as typeof import("./setupStepsHelpers");

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
