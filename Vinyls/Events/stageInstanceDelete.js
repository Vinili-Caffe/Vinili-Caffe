const { handleMovieNightStageClose } = require("../Services/Community/movieNightAnnouncementService");
const { snapshotSerataFilmHouseAttendance } = require("../Services/Community/hogwartsSerataFilmHouseLeaderboardService");

module.exports = {
  name: "stageInstanceDelete",
  async execute(stageInstance) {
    const guild = stageInstance?.guild || stageInstance?.client?.guilds?.cache?.get(stageInstance?.guildId || "");
    const channelId = String(stageInstance?.channelId || stageInstance?.channel?.id || "");
    if (!guild || !channelId) return;
    const attendanceSnapshot = snapshotSerataFilmHouseAttendance(guild.id);
    // staff auto-vals run inside handleMovieNightStageClose (serataFilmFinishFromClose1)
    await handleMovieNightStageClose(stageInstance, { attendanceSnapshot }).catch((err) => {
      global.logger?.warn?.("[stageInstanceDelete] movie night close:", err?.message || err);
    });
  },
};