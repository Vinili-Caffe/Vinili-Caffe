const { ContextMenuCommandBuilder, ApplicationCommandType } = require("discord.js") as typeof import("discord.js");
const { executeSanzionaContextMenu } = require("../../Utils/Moderation/sanzionaContextMenu") as typeof import("../../Utils/Moderation/sanzionaContextMenu");

export = {
  expectsModal: true,
  data: new ContextMenuCommandBuilder().setName("Sanziona").setType(ApplicationCommandType.User),

  async execute(interaction?) {
    await executeSanzionaContextMenu(interaction, interaction.targetUser);
  },
};
