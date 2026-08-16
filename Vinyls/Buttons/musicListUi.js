const {
  matchMusicListInteraction,
  handleMusicListInteraction,
} = require("../Utils/Music/musicListUiRuntime");

module.exports = {
  name: "musicListUi",
  order: 40,
  match(interaction) {
    return (
      (interaction?.isButton?.() || interaction?.isStringSelectMenu?.()) &&
      matchMusicListInteraction(interaction)
    );
  },
  async execute(interaction) {
    return handleMusicListInteraction(interaction);
  },
};
