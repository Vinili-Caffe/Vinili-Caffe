const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { skipGuild } = require("../../Services/Music/lavalinkMusicService");

module.exports = {
  name: "skip",
  description: "Salta la traccia in riproduzione e passa alla successiva in coda.",
  usage: ",skip",
  examples: [",skip"],
  async execute(message) {
    const result = await skipGuild(message);
    if (result.ok && typeof result.embedDescription === "string" && result.embedDescription.trim()) {
      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setDescription(result.embedDescription.trim());
      await safeMessageReply(message, {
        embeds: [embed],
        allowedMentions: { repliedUser: false, users: [message.author.id] },
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