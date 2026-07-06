const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { restartQueueGuild } = require("../../Services/Music/lavalinkMusicService");

module.exports = {
  name: "restart",
  description:"Ricomincia dall'inizio la sequenza del brano in riproduzione + della coda.",
  usage: ",restart",
  examples: [",restart"],
  async execute(message) {
    const result = await restartQueueGuild(message);
    if (result.ok) {
      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setDescription("**La sequenza del brano in riproduzione e della coda è stata ricominciata** 🔄");
      await safeMessageReply(message, { embeds: [embed], allowedMentions: { repliedUser: false } }).catch(() => null);
      return;
    }
    const err = new EmbedBuilder()
      .setColor(0xff0000)
      .setDescription(`<a:VC_Cross:1482532424570376253> ${result.message}`);
    await safeMessageReply(message, { embeds: [err], allowedMentions: { repliedUser: false } }).catch(() => null);
  },
};