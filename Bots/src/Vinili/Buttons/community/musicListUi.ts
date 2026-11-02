const {
  matchMusicListInteraction,
  handleMusicListInteraction,
} = require("../../Utils/Music/musicListUiRuntime") as typeof import("../../Utils/Music/musicListUiRuntime");

export = {
  name: "musicListUi",
  order: 40,
  match(interaction?) {
    return (
      (interaction?.isButton?.() || interaction?.isStringSelectMenu?.()) &&
      matchMusicListInteraction(interaction)
    );
  },
  async execute(interaction?) {
    return handleMusicListInteraction(interaction);
  },
};
