const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { rewindGuildTrack } = require("../../Services/Music/lavalinkMusicService");

module.exports = {
  name: "rewind",
  description: "Riporta la traccia in riproduzione all'inizio (seek 0).",
  usage: "+rewind",
  examples: ["+rewind"],
  async execute(message) {
    const result = await rewindGuildTrack(message);
    if (result.ok) {
      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setDescription("**La traccia è stata riavvolta** 🔂");
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