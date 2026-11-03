const { parseNoDmCustomId, handleNoDmPanelInteraction } = require("../../utils/noDmPanel") as typeof import("../../utils/noDmPanel");

export = {
  name: "noDmPanel",
  order: 45,
  match(interaction?) {
    return interaction?.isButton?.() && Boolean(parseNoDmCustomId(interaction.customId));
  },
  async execute(interaction?) {
    return handleNoDmPanelInteraction(interaction);
  },
};
