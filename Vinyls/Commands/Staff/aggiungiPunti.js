const {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
} = require("discord.js");
const { executeTenantPointsContextMenu } = require("../../Utils/Partner/tenantPointsRuntime");

module.exports = {
  expectsModal: true,
  data: new ContextMenuCommandBuilder()
    .setName("Aggiungi punti")
    .setType(ApplicationCommandType.User),

  async execute(interaction) {
    await executeTenantPointsContextMenu(interaction, "add");
  },
};
