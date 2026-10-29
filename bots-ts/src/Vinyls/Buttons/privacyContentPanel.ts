const { parsePrivacyCustomId, handlePrivacyPanelInteraction } = require("../Utils/privacyContentPanel") as typeof import("../Utils/privacyContentPanel");

export = {
  name: "privacyContentPanel",
  order: 46,
  match(interaction?) {
    return interaction?.isButton?.() && Boolean(parsePrivacyCustomId(interaction.customId));
  },
  async execute(interaction?) {
    return handlePrivacyPanelInteraction(interaction);
  },
};
