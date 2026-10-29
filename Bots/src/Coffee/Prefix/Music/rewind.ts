const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime") as typeof import("../../../shared/discord/replyRuntime");
const { rewindGuildTrack } = require("../../Services/Music/lavalinkMusicService") as typeof import("../../Services/Music/lavalinkMusicService");

export = {
  name: "rewind",
  description: "Riporta il brano in riproduzione all'inizio.",
  usage: ",rewind",
  examples: [",rewind"],
  async execute(message?) {
    const result = await rewindGuildTrack(message);
    if (result.ok) {
      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setDescription("**Il brano in riproduzione è stato riavvolto** 🔂");
      await safeMessageReply(message, { embeds: [embed], allowedMentions: { repliedUser: false } }).catch(() => null);
      return;
    }
    const err = new EmbedBuilder()
      .setColor(0xff0000)
      .setDescription(`<a:VC_Cross:1482532424570376253> ${result.message}`);
    await safeMessageReply(message, { embeds: [err], allowedMentions: { repliedUser: false } }).catch(() => null);
  },
};