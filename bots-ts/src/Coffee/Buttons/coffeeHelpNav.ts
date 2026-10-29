const {
  parseCoffeeHelpCustomId,
  handleCoffeeHelpNavInteraction,
} = require("../Prefix/Utility/help") as typeof import("../Prefix/Utility/help");

export = {
  name: "coffeeHelpNav",
  order: 42,
  match(interaction?) {
    return interaction?.isButton?.() && Boolean(parseCoffeeHelpCustomId(interaction.customId));
  },
  async execute(interaction?) {
    return handleCoffeeHelpNavInteraction(interaction);
  },
};
