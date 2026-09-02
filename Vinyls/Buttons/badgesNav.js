const { parseBadgesCustomId, handleBadgesNavInteraction } = require("../Prefix/Staff/badges");

module.exports = {
  name: "badgesNav",
  order: 43,
  match(interaction) {
    return interaction?.isButton?.() && Boolean(parseBadgesCustomId(interaction.customId));
  },
  async execute(interaction) {
    return handleBadgesNavInteraction(interaction);
  },
};
