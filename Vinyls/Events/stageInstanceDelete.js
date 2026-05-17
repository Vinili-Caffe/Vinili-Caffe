const { finishSerataFilmSessionsForChannel } = require("../Services/Staff/staffAutoValutazioniService");
const { handleMovieNightStageClose } = require("../Services/Community/movieNightAnnouncementService");

module.exports = {
  name: "stageInstanceDelete",
  async execute(stageInstance) {
    const guild = stageInstance?.guild || stageInstance?.client?.guilds?.cache?.get(stageInstance?.guildId || "");
    const channelId = String(stageInstance?.channelId || stageInstance?.channel?.id || "");
    if (!guild || !channelId) return;
    await finishSerataFilmSessionsForChannel(guild, channelId).catch((err) => {
      global.logger?.warn?.("[stageInstanceDelete] serata film staff auto:", err?.message || err);
    });
    await handleMovieNightStageClose(stageInstance).catch((err) => {
      global.logger?.warn?.("[stageInstanceDelete] movie night close:", err?.message || err);
    });
  },
};