const runtime = require("../musicListUiRuntime") as typeof import("../musicListUiRuntime");

export = {
  name: "musicListUi",
  order: 40,
  match(interaction?) {
    return (
      (interaction?.isButton?.() || interaction?.isStringSelectMenu?.()) &&
      typeof runtime.matchMusicListInteraction === "function" &&
      runtime.matchMusicListInteraction(interaction)
    );
  },
  async execute(interaction?) {
    return runtime.handleMusicListInteraction(interaction);
  },
};
