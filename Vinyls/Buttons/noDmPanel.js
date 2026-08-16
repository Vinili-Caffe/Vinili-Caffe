const { parseNoDmCustomId, handleNoDmPanelInteraction } = require("../Utils/noDmPanel");

module.exports = {
  name: "noDmPanel",
  order: 45,
  match(interaction) {
    return interaction?.isButton?.() && Boolean(parseNoDmCustomId(interaction.customId));
  },
  async execute(interaction) {
    return handleNoDmPanelInteraction(interaction);
  },
};
