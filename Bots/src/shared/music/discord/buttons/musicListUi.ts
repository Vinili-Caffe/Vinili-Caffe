const { createMusicListUi } = require("../../../discord/musicListUiFactory") as typeof import("../../../discord/musicListUiFactory");
const { applyDefaultFooterToEmbeds } = require("../../../embeds/defaultFooter") as typeof import("../../../embeds/defaultFooter");
const {
  fetchGuildQueueEntryRows,
  fetchGuildUpcomingQueueRows,
  fetchGuildRequestedSessionRows,
} = require("../../services/lavalinkMusicService") as typeof import("../../services/lavalinkMusicService");

const runtime = createMusicListUi({
  applyDefaultFooterToEmbeds,
  fetchGuildQueueEntryRows,
  fetchGuildUpcomingQueueRows,
  fetchGuildRequestedSessionRows,
});

export = {
  name: "musicListUi",
  order: 40,
  buildMusicListPayload: runtime.buildMusicListPayload,
  matchMusicListInteraction: runtime.matchMusicListInteraction,
  handleMusicListInteraction: runtime.handleMusicListInteraction,
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
