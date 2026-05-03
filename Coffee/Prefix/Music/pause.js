const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { pauseGuildTrack } = require("../../Services/Music/lavalinkMusicService");

module.exports = {
  name: "pause",
  description: "Mette in pausa la traccia in riproduzione.",
  usage: ",pause",
  examples: [",pause"],
  async execute(message) {
    const result = await pauseGuildTrack(message);
    if (result.ok) {
      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setDescription(`Traccia messa in pausa a **${result.positionLabel}** ⏸️`);
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