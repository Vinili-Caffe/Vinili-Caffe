const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { stopGuild } = require("../../Services/Music/lavalinkMusicService");

module.exports = {
  name: "stop",
  description: "Ferma la musica.",
  usage: ",stop",
  examples: [",stop"],
  async execute(message) {
    const result = await stopGuild(message);
    if (result.ok) {
      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setDescription("**La musica è stata fermata** 🛑");
      await safeMessageReply(message, { embeds: [embed], allowedMentions: { repliedUser: false } }).catch(() => null);
      return;
    }
    const err = new EmbedBuilder()
      .setColor(0xff0000)
      .setDescription(`<a:VC_Cross:1482532424570376253> ${result.message}`);
    await safeMessageReply(message, { embeds: [err], allowedMentions: { repliedUser: false } }).catch(() => null);
  },
};