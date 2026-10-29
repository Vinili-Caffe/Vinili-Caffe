const {
  parseTenantHelpCustomId,
  handleTenantHelpNavInteraction,
} = require("../MultiGuild/utils/tenantHelp") as typeof import("../MultiGuild/utils/tenantHelp");

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
