const { parseMainHelpCustomId, handleMainHelpNavInteraction } = require("../../Prefix/Utility/help") as typeof import("../../Prefix/Utility/help");

export = {
  name: "mainHelpNav",
  order: 42,
  match(interaction?) {
    return interaction?.isButton?.() && Boolean(parseMainHelpCustomId(interaction.customId));
  },
  async execute(interaction?) {
    return handleMainHelpNavInteraction(interaction);
  },
};
