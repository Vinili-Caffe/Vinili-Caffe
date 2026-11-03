const { handleMovieNightStageClose } = require("../Community/services/movieNightAnnouncementService") as typeof import("../Community/services/movieNightAnnouncementService");
const { snapshotSerataFilmAttendance } = require("../Community/services/serataFilmAttendance") as typeof import("../Community/services/serataFilmAttendance");

export = {
  name: "stageInstanceDelete",
  async execute(stageInstance?) {
    const guild = stageInstance?.guild || stageInstance?.client?.guilds?.cache?.get(stageInstance?.guildId || "");
    const channelId = String(stageInstance?.channelId || stageInstance?.channel?.id || "");
    if (!guild || !channelId) return;
    const attendanceSnapshot = snapshotSerataFilmAttendance(guild.id);
    // staff auto-vals run inside handleMovieNightStageClose (serataFilmFinishFromClose1)
    await handleMovieNightStageClose(stageInstance, { attendanceSnapshot }).catch((err?) => {
      global.logger?.warn?.("[stageInstanceDelete] movie night close:", err?.message || err);
    });
  },
};