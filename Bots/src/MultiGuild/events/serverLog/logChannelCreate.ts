/** Log: canale creato. */
const L = require("../../services/serverLogRuntime") as typeof import("../../services/serverLogRuntime");

export = {
  name: "channelCreate",
  async execute(channel?) {
    if (!channel?.guild) return;
    await L.sendServerLog(channel.guild, "channelCreate", { color: L.COLORS.green, title: "Canale creato", description: `<#${channel.id}> · **${L.clip(channel.name, 100)}** \`${channel.id}\`` });
  },
};
