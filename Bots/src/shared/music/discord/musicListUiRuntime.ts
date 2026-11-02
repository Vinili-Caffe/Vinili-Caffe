const { createMusicListUi } = require("../../discord/musicListUiFactory") as typeof import("../../discord/musicListUiFactory");
const { applyDefaultFooterToEmbeds } = require("../../embeds/defaultFooter") as typeof import("../../embeds/defaultFooter");
const {
  fetchGuildQueueEntryRows,
  fetchGuildUpcomingQueueRows,
  fetchGuildRequestedSessionRows,
} = require("../services/lavalinkMusicService") as typeof import("../services/lavalinkMusicService");

export = createMusicListUi({
  applyDefaultFooterToEmbeds,
  fetchGuildQueueEntryRows,
  fetchGuildUpcomingQueueRows,
  fetchGuildRequestedSessionRows,
});
