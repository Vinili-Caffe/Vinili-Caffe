/** Log: ban. */
const L = require("../../services/serverLogRuntime") as typeof import("../../services/serverLogRuntime");

export = {
  name: "guildBanAdd",
  async execute(ban?) {
    if (!ban?.guild) return;
    await L.sendServerLog(ban.guild, "ban", {
      color: L.COLORS.red,
      author: L.authorOf(ban.user),
      title: "Utente bannato",
      description: [L.userLine(ban.user), ban.reason ? `**Motivo:** ${L.clip(ban.reason, 500)}` : ""].filter(Boolean).join("\n"),
    });
  },
};
