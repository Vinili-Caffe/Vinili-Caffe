const {
  parseTenantHelpCustomId,
  handleTenantHelpNavInteraction,
} = require("../utils/tenantHelp") as typeof import("../utils/tenantHelp");

export = {
  name: "tenantHelpNav",
  order: 42,
  match(interaction?) {
    return interaction?.isButton?.() && Boolean(parseTenantHelpCustomId(interaction.customId));
  },
  async execute(interaction?) {
    return handleTenantHelpNavInteraction(interaction);
  },
};
