const {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
} = require("discord.js") as typeof import("discord.js");
const { executeTenantPointsContextMenu } = require("../../MultiGuild/utils/Partner/tenantPointsRuntime") as typeof import("../../MultiGuild/utils/Partner/tenantPointsRuntime");

export = {
  expectsModal: true,
  data: new ContextMenuCommandBuilder()
    .setName("Aggiungi punti")
    .setType(ApplicationCommandType.User),

  async execute(interaction?) {
    await executeTenantPointsContextMenu(interaction, "add");
  },
};
