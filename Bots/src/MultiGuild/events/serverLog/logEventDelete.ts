/** Log: evento programmato eliminato. */
const L = require("../../services/serverLogRuntime") as typeof import("../../services/serverLogRuntime");

export = {
  name: "guildScheduledEventDelete",
  async execute(ev?) {
    if (!ev?.guild) return;
    await L.sendServerLog(ev.guild, "eventDelete", { color: L.COLORS.red, title: "Evento eliminato", description: `**${L.clip(ev.name, 100)}**` });
  },
};
