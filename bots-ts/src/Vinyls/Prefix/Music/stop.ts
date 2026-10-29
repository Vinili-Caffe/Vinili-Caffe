const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime") as typeof import("../../../shared/discord/replyRuntime");
const { stopGuild } = require("../../Services/Music/lavalinkMusicService") as typeof import("../../Services/Music/lavalinkMusicService");
const STOP_OK_COLOR = 0x922b21;

export = {
  name: "stop",
  description: "Ferma la musica, svuota la coda e fa uscire il bot dal canale vocale.",
  usage: "+stop",
  examples: ["+stop"],
  async execute(message?) {
    const result = await stopGuild(message);
    if (result.ok) {
      const embed = new EmbedBuilder()
        .setColor(STOP_OK_COLOR)
        .setDescription("**La musica è stata fermata** 🛑");
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