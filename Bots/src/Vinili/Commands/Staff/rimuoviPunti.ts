const {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
} = require("discord.js") as typeof import("discord.js");
const { executeTenantPointsContextMenu } = require("../../Utils/Partner/tenantPointsRuntime") as typeof import("../../Utils/Partner/tenantPointsRuntime");

export = {
  expectsModal: true,
  data: new ContextMenuCommandBuilder()
    .setName("Rimuovi punti")
    .setType(ApplicationCommandType.User),

  async execute(interaction?) {
    await executeTenantPointsContextMenu(interaction, "remove");
  },
};
