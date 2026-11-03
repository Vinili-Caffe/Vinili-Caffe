const {
  parseUsageGuideCustomId,
  handleUsageGuideInteraction,
} = require("../../../../shared/prefix/prefixUsageGuide") as typeof import("../../../../shared/prefix/prefixUsageGuide");

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
