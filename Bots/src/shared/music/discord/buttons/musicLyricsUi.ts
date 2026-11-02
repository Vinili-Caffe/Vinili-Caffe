const {
  parseLyricsCustomId,
  handleLyricsInteraction,
} = require("../prefixViews") as typeof import("../prefixViews");

export = {
  name: "musicLyricsUi",
  order: 41,
  match(interaction?) {
    return interaction?.isButton?.() && Boolean(parseLyricsCustomId(interaction.customId));
  },
  async execute(interaction?) {
    return handleLyricsInteraction(interaction);
  },
};
