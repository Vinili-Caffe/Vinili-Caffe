/** Log: thread eliminato. */
const L = require("../../services/serverLogRuntime") as typeof import("../../services/serverLogRuntime");

export = {
  name: "threadDelete",
  async execute(thread?) {
    if (!thread?.guild) return;
    const parent = thread.parentId ? `<#${thread.parentId}>` : "—";
    await L.sendServerLog(
      thread.guild,
      "threadDelete",
      {
        color: L.COLORS.red,
        title: "Thread eliminato",
        description: [`**${L.clip(thread.name, 100)}** \`${thread.id}\``, `**Canale:** ${parent}`].join("\n"),
      },
      { channelId: thread.parentId ? String(thread.parentId) : null },
    );
  },
};
