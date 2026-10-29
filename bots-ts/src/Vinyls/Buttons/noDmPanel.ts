const { parseNoDmCustomId, handleNoDmPanelInteraction } = require("../Utils/noDmPanel") as typeof import("../Utils/noDmPanel");

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
