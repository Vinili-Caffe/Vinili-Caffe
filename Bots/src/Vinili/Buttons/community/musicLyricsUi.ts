const { parseLyricsCustomId, handleLyricsInteraction } = require("../../Prefix/Music/lyrics") as typeof import("../../Prefix/Music/lyrics");

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
