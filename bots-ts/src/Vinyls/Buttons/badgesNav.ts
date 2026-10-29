const { parseBadgesCustomId, handleBadgesNavInteraction } = require("../Prefix/Staff/badges") as typeof import("../Prefix/Staff/badges");

export = {
  name: "badgesNav",
  order: 43,
  match(interaction?) {
    return interaction?.isButton?.() && Boolean(parseBadgesCustomId(interaction.customId));
  },
  async execute(interaction?) {
    return handleBadgesNavInteraction(interaction);
  },
};
