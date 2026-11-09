/** Log: canale eliminato. */
const L = require("../../services/serverLogRuntime") as typeof import("../../services/serverLogRuntime");

export = {
  name: "channelDelete",
  async execute(channel?) {
    if (!channel?.guild) return;
    await L.sendServerLog(channel.guild, "channelDelete", { color: L.COLORS.red, title: "Canale eliminato", description: `**#${L.clip(channel.name, 100)}** \`${channel.id}\`` });
  },
};
