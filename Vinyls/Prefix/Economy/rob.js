const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { formatGaleoni } = require("../../Services/Community/gringottService");
const { rob } = require("../../Services/Community/galeoniEconomyService");

function extractUserId(value) {
  const clean = String(value || "").replace(/[<@!>]/g, "").trim();
  return /^\d{16,20}$/.test(clean) ? clean : "";
}

async function resolveRandomUser(message) {
  const guild = message?.guild;
  if (!guild) return null;
  if (guild.members?.fetch) await guild.members.fetch().catch(() => null);
  const members = Array.from(guild.members?.cache?.values?.() || [])
    .filter((member) => member?.user && !member.user.bot && member.user.id !== message.author.id);
  if (!members.length) return null;
  return members[Math.floor(Math.random() * members.length)]?.user || null;
}

module.exports = {
  name: "rob",
  aliases: ["ruba"],
  allowEmptyArgs: true,
  description: "Prova a rubare Galeoni a un altro utente.",
  usage: "+rob [@utente]",
  examples: ["+rob", "+rob @utente"],
  async execute(message, args, client) {
    const targetId = message.mentions.users.first()?.id || extractUserId(args?.[0]);
    const target = targetId ? await client.users.fetch(targetId).catch(() => null) : await resolveRandomUser(message);
    const result = await rob(client, message, target);
    if (!result.ok) {
      await safeMessageReply(message, { content: `<:vegax:1443934876440068179> ${result.message}`, allowedMentions: { repliedUser: false } });
      return;
    }
    const embed = new EmbedBuilder()
      .setColor(result.success ? "#2ecc71" : "#ed4245")
      .setTitle("Furto Gringott")
      .setDescription(result.success
        ? `Colpo riuscito su ${target}: hai rubato **${formatGaleoni(result.amount)}**.`
        : `Ti hanno beccato. Multa pagata: **${formatGaleoni(result.penalty || 0)}**.`);
    await safeMessageReply(message, { embeds: [embed], allowedMentions: { repliedUser: false, users: target?.id ? [target.id] : [] } });
  },
};