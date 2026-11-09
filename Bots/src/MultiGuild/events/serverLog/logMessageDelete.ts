/** Log: messaggio eliminato. */
const L = require("../../services/serverLogRuntime") as typeof import("../../services/serverLogRuntime");

export = {
  name: "messageDelete",
  async execute(message?) {
    if (!message?.guild) return;
    const author = message.author;
    const content = message.partial ? null : String(message.content || "");
    const files = message.attachments?.size ? [...message.attachments.values()].map((a?) => a.name).join(", ") : "";
    await L.sendServerLog(
      message.guild,
      "messageDelete",
      {
        color: L.COLORS.red,
        author: L.authorOf(author),
        title: "Messaggio eliminato",
        description: [
          `**Canale:** <#${message.channelId}>`,
          author ? `**Autore:** ${L.userLine(author)}` : "**Autore:** non in memoria",
          "",
          content == null ? "*Il messaggio non era in memoria: testo non disponibile.*" : L.clip(content, 1800) || "*nessun testo*",
          files ? `\n**Allegati:** ${L.clip(files, 300)}` : "",
        ].join("\n"),
        footer: { text: `ID messaggio: ${message.id}` },
      },
      { channelId: String(message.channelId), isBot: Boolean(author?.bot) },
    );
  },
};
