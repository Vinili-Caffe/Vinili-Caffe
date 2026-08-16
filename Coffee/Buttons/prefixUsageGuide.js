const {
  parseUsageGuideCustomId,
  handleUsageGuideInteraction,
} = require("../Utils/Moderation/prefixUsageGuide");

module.exports = {
  name: "prefixUsageGuide",
  order: 44,
  match(interaction) {
    return interaction?.isStringSelectMenu?.() && Boolean(parseUsageGuideCustomId(interaction.customId));
  },
  async execute(interaction) {
    return handleUsageGuideInteraction(interaction, { prefix: "," });
  },
};
