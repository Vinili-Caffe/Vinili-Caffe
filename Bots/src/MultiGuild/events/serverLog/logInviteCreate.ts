/** Log: invito creato. */
const L = require("../../services/serverLogRuntime") as typeof import("../../services/serverLogRuntime");

export = {
  name: "inviteCreate",
  async execute(invite?) {
    if (!invite?.guild) return;
    const inviter = invite.inviter;
    const code = String(invite.code || "");
    const channel = invite.channelId ? `<#${invite.channelId}>` : "—";
    const maxUses = invite.maxUses ? String(invite.maxUses) : "∞";
    await L.sendServerLog(
      invite.guild,
      "inviteCreate",
      {
        color: L.COLORS.green,
        author: L.authorOf(inviter),
        title: "Invito creato",
        description: [
          inviter ? L.userLine(inviter) : "Autore sconosciuto",
          code ? `**Codice:** \`${code}\`` : "",
          `**Canale:** ${channel}`,
          `**Usi max:** ${maxUses}`,
        ]
          .filter(Boolean)
          .join("\n"),
      },
      { channelId: invite.channelId ? String(invite.channelId) : null, isBot: Boolean(inviter?.bot) },
    );
  },
};
