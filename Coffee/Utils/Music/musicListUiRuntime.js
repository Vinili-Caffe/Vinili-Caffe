const { createMusicListUi } = require("../../../shared/discord/musicListUiFactory");
const { applyDefaultFooterToEmbeds } = require("../Embeds/defaultFooter");
const {
  fetchGuildQueueEntryRows,
  fetchGuildUpcomingQueueRows,
  fetchGuildRequestedSessionRows,
} = require("../../Services/Music/lavalinkMusicService");

module.exports = createMusicListUi({
  applyDefaultFooterToEmbeds,
  fetchGuildQueueEntryRows,
  fetchGuildUpcomingQueueRows,
  fetchGuildRequestedSessionRows,
});
