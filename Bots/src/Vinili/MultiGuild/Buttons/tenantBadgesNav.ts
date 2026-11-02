const {
  parseBadgesCustomId,
  handleBadgesNavInteraction,
} = require("../../Partner/discord/prefix/badges") as typeof import("../../Partner/discord/prefix/badges");

export = {
  name: "tenantBadgesNav",
  order: 43,
  match(interaction?) {
    return interaction?.isButton?.() && Boolean(parseBadgesCustomId(interaction.customId));
  },
  async execute(interaction?) {
    return handleBadgesNavInteraction(interaction);
  },
};
