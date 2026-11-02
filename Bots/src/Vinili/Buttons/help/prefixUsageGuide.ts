const {
  parseUsageGuideCustomId,
  handleUsageGuideInteraction,
} = require("../../Utils/Moderation/prefixUsageGuide") as typeof import("../../Utils/Moderation/prefixUsageGuide");

export = {
  name: "prefixUsageGuide",
  order: 44,
  match(interaction?) {
    return interaction?.isStringSelectMenu?.() && Boolean(parseUsageGuideCustomId(interaction.customId));
  },
  async execute(interaction?) {
    let prefix = "+";
    try {
      const { resolveCommandPrefixForGuild } = require("../../MultiGuild/core/tenantGuildSettings") as typeof import("../../MultiGuild/core/tenantGuildSettings");
      prefix = resolveCommandPrefixForGuild(interaction.guild?.id, interaction.client);
    } catch (_) {}
    return handleUsageGuideInteraction(interaction, { prefix });
  },
};
