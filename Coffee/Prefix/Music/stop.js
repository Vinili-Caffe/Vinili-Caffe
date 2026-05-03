const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { stopGuild } = require("../../Services/Music/lavalinkMusicService");

/** Rosso scuro / bordò, simile agli embed “stop” dei bot musica. */
const STOP_OK_COLOR = 0x922b21;

module.exports = {
  name: "stop",
  description: "Ferma la musica, svuota la coda e fa uscire il bot dal vocale.",
  usage: ",stop",
  examples: [",stop"],
  async execute(message) {
    const result = await stopGuild(message);
    if (result.ok) {
      const embed = new EmbedBuilder()
        .setColor(STOP_OK_COLOR)
        .setDescription("Grazie per aver utilizzato il nostro servizio!");
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