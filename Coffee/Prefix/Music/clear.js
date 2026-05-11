const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { clearGuildQueue } = require("../../Services/Music/lavalinkMusicService");

module.exports = {
  name: "clear",
  description: "Svuota la coda dei brani in attesa.",
  usage: ",clear",
  examples: [",clear"],
  async execute(message) {
    const result = await clearGuildQueue(message);
    if (result.ok) {
      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setDescription("**La coda è stata svuotata**");
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