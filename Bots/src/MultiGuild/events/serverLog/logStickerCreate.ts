/** Log: sticker aggiunto. */
const L = require("../../services/serverLogRuntime") as typeof import("../../services/serverLogRuntime");

export = {
  name: "stickerCreate",
  async execute(sticker?) {
    if (!sticker?.guild) return;
    await L.sendServerLog(sticker.guild, "stickerCreate", {
      color: L.COLORS.green,
      title: "Sticker aggiunto",
      description: `**${L.clip(sticker.name, 60)}** \`${sticker.id}\``,
      thumbnail: { url: `https://media.discordapp.net/stickers/${sticker.id}.png?size=160` },
    });
  },
};
