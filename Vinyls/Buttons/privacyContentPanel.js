const { parsePrivacyCustomId, handlePrivacyPanelInteraction } = require("../Utils/privacyContentPanel");

module.exports = {
  name: "privacyContentPanel",
  order: 46,
  match(interaction) {
    return interaction?.isButton?.() && Boolean(parsePrivacyCustomId(interaction.customId));
  },
  async execute(interaction) {
    return handlePrivacyPanelInteraction(interaction);
  },
};
