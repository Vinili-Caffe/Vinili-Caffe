const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { formatGaleoni } = require("../../Services/Community/gringottService");
const { claimFixed } = require("../../Services/Community/galeoniEconomyService");

module.exports = {
  name: "weekly",
  allowEmptyArgs: true,
  description: "Riscuote la ricompensa settimanale.",
  usage: "+weekly",
  examples: ["+weekly"],
  async execute(message, args, client) {
    const result = await claimFixed(client, message, "weekly");
    if (!result.ok) {
      await safeMessageReply(message, { content: `<:vegax:1443934876440068179> ${result.message}`, allowedMentions: { repliedUser: false } });
      return;
    }
    const embed = new EmbedBuilder()
      .setColor("#d4af37")
      .setTitle("Ricompensa settimanale")
      .setDescription([
        `Hai ricevuto **${formatGaleoni(result.amount)}**.`,
        result.bonusAmount > 0 ? `Streak **x${result.streak.count}**: bonus **${formatGaleoni(result.bonusAmount)}**.` : `Streak **x${result.streak.count}**.`,
        `Saldo: **${formatGaleoni(result.state.balance)}**`,
      ].join("\n"));
    if (result.preview) embed.setFooter({ text: "Preview High Staff attiva" });
    await safeMessageReply(message, { embeds: [embed], allowedMentions: { repliedUser: false } });
  },
};