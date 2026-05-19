const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { formatGaleoni } = require("../../Services/Community/gringottService");
const { claimWork } = require("../../Services/Community/galeoniEconomyService");

module.exports = {
  name: "work",
  allowEmptyArgs: true,
  description: "Lavora per guadagnare Galeoni.",
  usage: "+work",
  examples: ["+work"],
  async execute(message, args, client) {
    const result = await claimWork(client, message);
    if (!result.ok) {
      await safeMessageReply(message, { content: `<:vegax:1443934876440068179> ${result.message}`, allowedMentions: { repliedUser: false } });
      return;
    }
    const embed = new EmbedBuilder()
      .setColor("#d4af37")
      .setTitle("Lavoro completato")
      .setDescription([
        `Hai guadagnato **${formatGaleoni(result.amount)}**.`,
        result.bonusAmount > 0 ? `Streak **x${result.streak.count}**: bonus **${formatGaleoni(result.bonusAmount)}**.` : `Streak **x${result.streak.count}**.`,
        `Saldo: **${formatGaleoni(result.state.balance)}**`,
      ].join("\n"));
    if (result.preview) embed.setFooter({ text: "Preview High Staff attiva" });
    await safeMessageReply(message, { embeds: [embed], allowedMentions: { repliedUser: false } });
  },
};