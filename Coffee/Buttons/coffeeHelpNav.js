const {
  parseCoffeeHelpCustomId,
  handleCoffeeHelpNavInteraction,
} = require("../Prefix/Utility/help");

module.exports = {
  name: "coffeeHelpNav",
  order: 42,
  match(interaction) {
    return interaction?.isButton?.() && Boolean(parseCoffeeHelpCustomId(interaction.customId));
  },
  async execute(interaction) {
    return handleCoffeeHelpNavInteraction(interaction);
  },
};
