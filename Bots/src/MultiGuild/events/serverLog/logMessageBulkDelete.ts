/** Log: tanti messaggi cancellati insieme (es. /purge). */
const L = require("../../services/serverLogRuntime") as typeof import("../../services/serverLogRuntime");

export = {
  name: "messageDeleteBulk",
  async execute(messages?, channel?) {
    const guild = channel?.guild || messages?.first?.()?.guild;
    if (!guild) return;
    const list = messages?.values ? [...messages.values()] : [];
    const authors = new Map<string, number>();
    for (const m of list) if (m?.author?.id) authors.set(m.author.id, (authors.get(m.author.id) || 0) + 1);
    const top = [...authors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, n]) => `<@${id}> (${n})`);
    await L.sendServerLog(
      guild,
      "messageBulkDelete",
      {
        color: L.COLORS.red,
        title: "Messaggi cancellati in blocco",
        description: [`**Canale:** <#${channel?.id || list[0]?.channelId}>`, `**Quanti:** ${messages?.size ?? list.length}`, top.length ? `**Autori:** ${top.join(", ")}` : ""].filter(Boolean).join("\n"),
      },
      { channelId: String(channel?.id || "") || null },
    );
  },
};
