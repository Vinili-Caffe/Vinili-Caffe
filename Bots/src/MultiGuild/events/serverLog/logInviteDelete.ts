/** Log: invito eliminato / scaduto. */
const L = require("../../services/serverLogRuntime") as typeof import("../../services/serverLogRuntime");

export = {
  name: "inviteDelete",
  async execute(invite?) {
    if (!invite?.guild) return;
    const code = String(invite.code || "");
    const channel = invite.channelId ? `<#${invite.channelId}>` : "—";
    await L.sendServerLog(invite.guild, "inviteDelete", {
      color: L.COLORS.orange,
      title: "Invito eliminato",
      description: [code ? `**Codice:** \`${code}\`` : "Invito rimosso", `**Canale:** ${channel}`].filter(Boolean).join("\n"),
    }, { channelId: invite.channelId ? String(invite.channelId) : null });
  },
};
