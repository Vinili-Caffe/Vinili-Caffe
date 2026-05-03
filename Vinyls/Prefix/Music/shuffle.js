const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { shuffleGuildQueue } = require("../../Services/Music/lavalinkMusicService");

module.exports = {
  name: "shuffle",
  description: "Mescola l'ordine dei brani in coda (non la traccia in riproduzione).",
  usage: "+shuffle",
  examples: ["+shuffle"],
  async execute(message) {
    const result = await shuffleGuildQueue(message);
    if (result.ok) {
      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setDescription("**La coda è stata mescolata**");
      await safeMessageReply(message, {
        embeds: [embed],
        allowedMentions: { repliedUser: false },
      }).catch(() => null);
      return;
    }
    const err = new EmbedBuilder()
      .setColor(0xff0000)
      .setDescription(`**${result.message}**`);
    await safeMessageReply(message, {
      embeds: [err],
      allowedMentions: { repliedUser: false },
    }).catch(() => null);
  },
};