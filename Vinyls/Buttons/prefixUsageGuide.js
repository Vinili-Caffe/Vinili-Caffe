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
    let prefix = "+";
    try {
      const { resolveCommandPrefixForGuild } = require("../MultiGuild/core/tenantGuildSettings");
      prefix = resolveCommandPrefixForGuild(interaction.guild?.id, interaction.client);
    } catch (_) {}
    return handleUsageGuideInteraction(interaction, { prefix });
  },
};
