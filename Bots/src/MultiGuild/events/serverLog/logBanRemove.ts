/** Log: unban. */
const L = require("../../services/serverLogRuntime") as typeof import("../../services/serverLogRuntime");

export = {
  name: "guildBanRemove",
  async execute(ban?) {
    if (!ban?.guild) return;
    await L.sendServerLog(ban.guild, "unban", { color: L.COLORS.green, author: L.authorOf(ban.user), title: "Ban revocato", description: L.userLine(ban.user) });
  },
};
