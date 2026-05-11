const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { shuffleGuildQueue } = require("../../Services/Music/lavalinkMusicService");

module.exports = {
  name: "shuffle",
  description: "Mescola l'ordine dei brani in coda.",
  usage: ",shuffle",
  examples: [",shuffle"],
  async execute(message) {
    const result = await shuffleGuildQueue(message);
    if (result.ok) {
      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setDescription("**L'ordine dei brani in coda è stato mescolato** 🔀");
      await safeMessageReply(message, { embeds: [embed], allowedMentions: { repliedUser: false } }).catch(() => null);
      return;
    }
    const err = new EmbedBuilder()
      .setColor(0xff0000)
      .setDescription(`<a:VC_Cross:1482532424570376253> ${result.message}`);
    await safeMessageReply(message, { embeds: [err], allowedMentions: { repliedUser: false } }).catch(() => null);
  },
};