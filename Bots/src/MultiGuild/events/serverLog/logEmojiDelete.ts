/** Log: emoji eliminata. */
const L = require("../../services/serverLogRuntime") as typeof import("../../services/serverLogRuntime");

export = {
  name: "emojiDelete",
  async execute(emoji?) {
    if (!emoji?.guild) return;
    await L.sendServerLog(emoji.guild, "emojiDelete", {
      color: L.COLORS.red,
      title: "Emoji eliminata",
      description: `**:${L.clip(emoji.name, 40)}:** \`${emoji.id}\``,
      thumbnail: { url: `https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? "gif" : "png"}?size=96` },
    });
  },
};
