/** Log: sticker eliminato. */
const L = require("../../services/serverLogRuntime") as typeof import("../../services/serverLogRuntime");

export = {
  name: "stickerDelete",
  async execute(sticker?) {
    if (!sticker?.guild) return;
    await L.sendServerLog(sticker.guild, "stickerDelete", { color: L.COLORS.red, title: "Sticker eliminato", description: `**${L.clip(sticker.name, 60)}** \`${sticker.id}\`` });
  },
};
