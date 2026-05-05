const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { setGuildMusicVolume } = require("../../Services/Music/lavalinkMusicService");

module.exports = {
  name: "volume",
  args: true,
  description: "Imposta il volume della musica.",
  usage: "+volume <volume>",
  examples: ["+volume 35", "+volume 75"],
  async execute(message, args) {
    const raw = Array.isArray(args) ? args[0] : "";
    const result = await setGuildMusicVolume(message.client, message.guild, raw, message.author.id);
    if (result.ok) {
      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setDescription(`🔊 Il volume è stato impostato a **${result.volumePercent}**`);
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