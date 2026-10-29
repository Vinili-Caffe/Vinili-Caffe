const {
  parseUsageGuideCustomId,
  handleUsageGuideInteraction,
} = require("../Utils/Moderation/prefixUsageGuide") as typeof import("../Utils/Moderation/prefixUsageGuide");

export = {
  name: "prefixUsageGuide",
  order: 44,
  match(interaction?) {
    return interaction?.isStringSelectMenu?.() && Boolean(parseUsageGuideCustomId(interaction.customId));
  },
  async execute(interaction?) {
    return handleUsageGuideInteraction(interaction, { prefix: "," });
  },
};
