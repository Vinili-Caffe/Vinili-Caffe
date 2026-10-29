const { createMusicListUi } = require("../../../shared/discord/musicListUiFactory") as typeof import("../../../shared/discord/musicListUiFactory");
const { applyDefaultFooterToEmbeds } = require("../Embeds/defaultFooter") as typeof import("../Embeds/defaultFooter");
const {
  fetchGuildQueueEntryRows,
  fetchGuildUpcomingQueueRows,
  fetchGuildRequestedSessionRows,
} = require("../../Services/Music/lavalinkMusicService") as typeof import("../../Services/Music/lavalinkMusicService");

export = createMusicListUi({
  applyDefaultFooterToEmbeds,
  fetchGuildQueueEntryRows,
  fetchGuildUpcomingQueueRows,
  fetchGuildRequestedSessionRows,
});
