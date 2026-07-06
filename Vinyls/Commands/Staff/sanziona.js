const { ContextMenuCommandBuilder, ApplicationCommandType } = require("discord.js");
const { executeSanzionaContextMenu } = require("../../Utils/Moderation/sanzionaContextMenu");

module.exports = {
  expectsModal: true,
  data: new ContextMenuCommandBuilder().setName("Sanziona").setType(ApplicationCommandType.User),

  async execute(interaction) {
    await executeSanzionaContextMenu(interaction, interaction.targetUser);
  },
};
