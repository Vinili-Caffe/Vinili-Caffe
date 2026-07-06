const { ContextMenuCommandBuilder, ApplicationCommandType, MessageFlags } = require("discord.js");
const { executeSanzionaContextMenu } = require("../../Utils/Moderation/sanzionaContextMenu");

const EPHEMERAL = MessageFlags.Ephemeral;

module.exports = {
  expectsModal: true,
  data: new ContextMenuCommandBuilder().setName("Sanziona").setType(ApplicationCommandType.Message),

  async execute(interaction) {
    const targetMessage = interaction.targetMessage;
    if (!targetMessage?.id) {
      await interaction.reply({
        content: "<a:VC_Cross:1482532424570376253> Messaggio non valido.",
        flags: EPHEMERAL,
      });
      return;
    }
    await executeSanzionaContextMenu(interaction, targetMessage.author);
  },
};
