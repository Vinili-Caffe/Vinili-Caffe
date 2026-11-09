/** Log: emoji rinominata. */
const L = require("../../services/serverLogRuntime") as typeof import("../../services/serverLogRuntime");

export = {
  name: "emojiUpdate",
  async execute(oldEmoji?, newEmoji?) {
    if (!newEmoji?.guild || oldEmoji?.name === newEmoji.name) return;
    await L.sendServerLog(newEmoji.guild, "emojiUpdate", {
      color: L.COLORS.orange,
      title: "Emoji rinominata",
      description: `<${newEmoji.animated ? "a" : ""}:${newEmoji.name}:${newEmoji.id}> **:${L.clip(oldEmoji?.name, 40)}:** → **:${L.clip(newEmoji.name, 40)}:**`,
    });
  },
};
