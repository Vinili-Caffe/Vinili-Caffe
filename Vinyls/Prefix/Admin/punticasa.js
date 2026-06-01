const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { assignManualHousePoints, normalizeHouseInput } = require("../../Services/Community/hogwartsManualHousePointsService");

function parseArgs(args = []) {
  const houseRaw = String(args[0] || "").trim();
  const pointsRaw = String(args[1] || "").trim();
  const reason = args.slice(2).join(" ").trim();
  const houseId = normalizeHouseInput(houseRaw);
  const points = Math.floor(Number(pointsRaw));
  return { houseId, points, reason, houseRaw, pointsRaw };
}

module.exports = {
  name: "punticasa",
  allowEmptyArgs: false,
  description: "Aggiunge o toglie punti Coppa a una casa.",
  usage: "+punticasa <casa> <punti> [motivo]",
  examples: [
    "+punticasa grifondoro 50 Premio staff",
    "+punticasa tassorosso -30 Correzione",
    "+punticasa gryffindor 100",
  ],
  async execute(message, args = []) {
    if (!message.inGuild?.() || !message.guild) return;
    const parsed = parseArgs(args);
    if (!parsed.houseId) {
      return safeMessageReply(message, {
        content: `<:vegax:1443934876440068179> Casa non valida. Usa: \`grifondoro\`, \`corvonero\`, \`tassorosso\`, \`serpeverde\` (o id inglese).`,
        allowedMentions: { repliedUser: false },
      });
    }
    if (!Number.isFinite(parsed.points) || parsed.points === 0) {
      return safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Indica un numero di punti valido (positivo o negativo).",
        allowedMentions: { repliedUser: false },
      });
    }
    if (Math.abs(parsed.points) > 5000) {
      return safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Massimo **5000** punti per modifica manuale (in valore assoluto).",
        allowedMentions: { repliedUser: false },
      });
    }
    const result = await assignManualHousePoints(message.client, {
      guildId: message.guild.id,
      houseId: parsed.houseId,
      points: parsed.points,
      actorId: message.author.id,
      reason: parsed.reason,
    });
    if (!result.ok) {
      return safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Impossibile assegnare i punti casa.",
        allowedMentions: { repliedUser: false },
      });
    }
    const deltaLabel = result.points > 0 ? `+**${result.points}**` : `**${result.points}**`;
    const embed = new EmbedBuilder()
      .setColor(result.points > 0 ? "#2d6a4f" : "#8b3a3a")
      .setTitle(result.points > 0 ? "Punti casa assegnati" : "Punti casa rimossi")
      .setDescription(
        [
          `**${result.houseLabel}** ${deltaLabel} punti Coppa.`,
          result.periodLabel ? `Periodo scolastico: **${result.periodLabel}**` : "",
          result.reason ? `Motivo: ${result.reason}` : "",
          `Modificati da ${message.author}.`,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    return safeMessageReply(message, {
      embeds: [embed],
      allowedMentions: { repliedUser: false },
    });
  },
};