/** Log: messaggio modificato. */
const L = require("../../services/serverLogRuntime") as typeof import("../../services/serverLogRuntime");

export = {
  name: "messageUpdate",
  async execute(oldMessage?, newMessage?) {
    const m = newMessage || oldMessage;
    if (!m?.guild) return;
    const before = oldMessage?.partial ? null : String(oldMessage?.content ?? "");
    const after = String(newMessage?.content ?? "");
    if (before !== null && before === after) return; /* solo embed/anteprime link */
    await L.sendServerLog(
      m.guild,
      "messageUpdate",
      {
        color: L.COLORS.orange,
        author: L.authorOf(m.author),
        title: "Messaggio modificato",
        description: [`**Canale:** <#${m.channelId}> · [vai al messaggio](https://discord.com/channels/${m.guild.id}/${m.channelId}/${m.id})`, m.author ? `**Autore:** ${L.userLine(m.author)}` : ""].filter(Boolean).join("\n"),
        fields: [
          { name: "Prima", value: before == null ? "*non in memoria*" : L.clip(before, 1000) },
          { name: "Dopo", value: L.clip(after, 1000) },
        ],
        footer: { text: `ID messaggio: ${m.id}` },
      },
      { channelId: String(m.channelId), isBot: Boolean(m.author?.bot) },
    );
  },
};
