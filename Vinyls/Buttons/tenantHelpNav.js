const {
  parseTenantHelpCustomId,
  handleTenantHelpNavInteraction,
} = require("../MultiGuild/utils/tenantHelp");

module.exports = {
  name: "tenantHelpNav",
  order: 42,
  match(interaction) {
    return interaction?.isButton?.() && Boolean(parseTenantHelpCustomId(interaction.customId));
  },
  async execute(interaction) {
    return handleTenantHelpNavInteraction(interaction);
  },
};
