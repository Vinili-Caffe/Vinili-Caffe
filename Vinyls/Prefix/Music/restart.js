const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { restartQueueGuild } = require("../../Services/Music/lavalinkMusicService");

module.exports = {
  name: "restart",
  description:
    "Ricomincia dall'inizio la sequenza brano in corso + coda.",
  usage: "+restart",
  examples: ["+restart"],
  async execute(message) {
    const result = await restartQueueGuild(message);
    if (result.ok) {
      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setDescription("**Si ricomincia da capo** 🔄");
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