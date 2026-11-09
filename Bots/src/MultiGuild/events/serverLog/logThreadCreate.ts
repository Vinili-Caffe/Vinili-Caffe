/** Log: thread creato. */
const L = require("../../services/serverLogRuntime") as typeof import("../../services/serverLogRuntime");

export = {
  name: "threadCreate",
  async execute(thread?) {
    if (!thread?.guild) return;
    const parent = thread.parentId ? `<#${thread.parentId}>` : "—";
    await L.sendServerLog(
      thread.guild,
      "threadCreate",
      {
        color: L.COLORS.green,
        title: "Thread creato",
        description: [`**${L.clip(thread.name, 100)}** \`${thread.id}\``, `**Canale:** ${parent}`].join("\n"),
      },
      { channelId: thread.parentId ? String(thread.parentId) : null },
    );
  },
};
