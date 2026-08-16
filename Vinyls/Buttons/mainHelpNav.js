const { parseMainHelpCustomId, handleMainHelpNavInteraction } = require("../Prefix/Utility/help");

module.exports = {
  name: "mainHelpNav",
  order: 42,
  match(interaction) {
    return interaction?.isButton?.() && Boolean(parseMainHelpCustomId(interaction.customId));
  },
  async execute(interaction) {
    return handleMainHelpNavInteraction(interaction);
  },
};
