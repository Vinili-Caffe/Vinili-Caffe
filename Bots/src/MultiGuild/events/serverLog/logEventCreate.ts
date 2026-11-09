/** Log: evento programmato creato. */
const L = require("../../services/serverLogRuntime") as typeof import("../../services/serverLogRuntime");

export = {
  name: "guildScheduledEventCreate",
  async execute(ev?) {
    if (!ev?.guild) return;
    const start = Math.floor(Number(ev.scheduledStartTimestamp || 0) / 1000);
    await L.sendServerLog(ev.guild, "eventCreate", {
      color: L.COLORS.green,
      title: "Evento creato",
      description: [`**${L.clip(ev.name, 100)}**`, start ? `**Inizia:** <t:${start}:f>` : "", ev.channelId ? `**Canale:** <#${ev.channelId}>` : "", ev.creatorId ? `**Creato da:** <@${ev.creatorId}>` : "", ev.description ? L.clip(ev.description, 500) : ""].filter(Boolean).join("\n"),
    });
  },
};
