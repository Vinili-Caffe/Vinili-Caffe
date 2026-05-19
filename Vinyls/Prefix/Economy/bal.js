const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { getGringottBalance, formatGaleoni } = require("../../Services/Community/gringottService");
const { assertEconomyAccess, eventKey } = require("../../Services/Community/galeoniEconomyService");

function extractUserId(value) {
  const clean = String(value || "").replace(/[<@!>]/g, "").trim();
  return /^\d{16,20}$/.test(clean) ? clean : "";
}

module.exports = {
  name: "bal",
  aliases: ["balance", "saldo", "galeoni"],
  allowEmptyArgs: true,
  description: "Mostra il saldo Gringott.",
  usage: "+bal [@utente]",
  examples: ["+bal", "+bal @utente"],
  async execute(message, args, client) {
    const access = await assertEconomyAccess(message, client);
    if (!access.ok) {
      await safeMessageReply(message, { content: `<:vegax:1443934876440068179> ${access.message}`, allowedMentions: { repliedUser: false } });
      return;
    }

    const targetId = message.mentions.users.first()?.id || extractUserId(args?.[0]) || message.author.id;
    const target = targetId === message.author.id ? message.author : await client.users.fetch(targetId).catch(() => null);
    const state = await getGringottBalance(message.guild.id, targetId, eventKey(client));
    const embed = new EmbedBuilder()
      .setColor("#d4af37")
      .setTitle("Gringott")
      .setDescription(`Saldo di ${target || `<@${targetId}>`}: **${formatGaleoni(state?.balance || 0)}**`)
      .addFields(
        { name: "Guadagnati", value: formatGaleoni(state?.earned || 0), inline: true },
        { name: "Spesi", value: formatGaleoni(state?.spent || 0), inline: true },
      );
    if (access.preview) embed.setFooter({ text: "Preview High Staff attiva" });
    await safeMessageReply(message, { embeds: [embed], allowedMentions: { repliedUser: false } });
  },
};