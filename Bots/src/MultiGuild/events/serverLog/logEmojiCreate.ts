/** Log: emoji aggiunta. */
const L = require("../../services/serverLogRuntime") as typeof import("../../services/serverLogRuntime");

export = {
  name: "emojiCreate",
  async execute(emoji?) {
    if (!emoji?.guild) return;
    await L.sendServerLog(emoji.guild, "emojiCreate", {
      color: L.COLORS.green,
      title: "Emoji aggiunta",
      description: `<${emoji.animated ? "a" : ""}:${emoji.name}:${emoji.id}> **:${L.clip(emoji.name, 40)}:** \`${emoji.id}\``,
      thumbnail: { url: `https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? "gif" : "png"}?size=96` },
    });
  },
};
