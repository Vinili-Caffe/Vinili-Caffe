const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { resumeGuildTrack } = require("../../Services/Music/lavalinkMusicService");

module.exports = {
  name: "resume",
  description: "Riprende la traccia in pausa.",
  usage: ",resume",
  examples: [",resume"],
  async execute(message) {
    const result = await resumeGuildTrack(message);
    if (result.ok) {
      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setDescription("**La traccia è stata ripresa** ⏯️");
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