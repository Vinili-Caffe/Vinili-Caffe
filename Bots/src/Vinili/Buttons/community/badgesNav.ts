const { parseBadgesCustomId, handleBadgesNavInteraction } = require("../../Prefix/Partnership/badges") as typeof import("../../Prefix/Partnership/badges");

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
