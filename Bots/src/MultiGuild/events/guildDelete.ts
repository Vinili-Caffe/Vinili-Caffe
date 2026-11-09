const { isMultiGuildLayerEnabled } = require("../core/env") as typeof import("../core/env");
const { isViniliProtectedGuild } = require("../core/viniliProtectedGuilds") as typeof import("../core/viniliProtectedGuilds");

export = {
  name: "guildDelete",
  async execute(guild?) {
    if (!guild?.id) return;
    if (isViniliProtectedGuild(guild.id)) return;
    if (!isMultiGuildLayerEnabled()) return;

    try {
      const { recordBotLeftAlert } = require("../site/dashboard/dashboardAlertsService") as typeof import("../site/dashboard/dashboardAlertsService");
      await recordBotLeftAlert(guild).catch((err?) => {
        global.logger?.warn?.("[MultiGuild] dashboard bot_left alert:", err?.message || err);
      });
    } catch (err) {
      global.logger?.warn?.("[MultiGuild] dashboard bot_left require:", err?.message || err);
    }
  },
};
