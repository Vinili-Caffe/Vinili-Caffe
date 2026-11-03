const { parsePrivacyCustomId, handlePrivacyPanelInteraction } = require("../../utils/privacyContentPanel") as typeof import("../../utils/privacyContentPanel");

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
