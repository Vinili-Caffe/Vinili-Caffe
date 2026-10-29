const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime") as typeof import("../../../shared/discord/replyRuntime");
const { setGuildMusicVolume } = require("../../Services/Music/lavalinkMusicService") as typeof import("../../Services/Music/lavalinkMusicService");

export = {
  name: "volume",
  args: true,
  description: "Imposta il volume della musica.",
  usage: ",volume <0-100>",
  examples: [",volume 35", ",volume 75"],
  async execute(message?, args?) {
    const raw = Array.isArray(args) ? args[0] : "";
    const result = await setGuildMusicVolume(message.client, message.guild, raw, message.author.id);
    if (result.ok) {
      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setDescription(`🔊 Il volume è stato impostato a **${result.volumePercent}**`);
      await safeMessageReply(message, { embeds: [embed], allowedMentions: { repliedUser: false } }).catch(() => null);
      return;
    }
    const err = new EmbedBuilder()
      .setColor(0xff0000)
      .setDescription(`<a:VC_Cross:1482532424570376253> ${result.message}`);
    await safeMessageReply(message, { embeds: [err], allowedMentions: { repliedUser: false } }).catch(() => null);
  },
};