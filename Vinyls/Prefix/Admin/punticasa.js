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
  description: "Assegna punti Coppa a una casa.",
  usage: "+punticasa <casa> <punti> [motivo]",
  examples: [
    "+punticasa grifondoro 50 Premio staff",
    "+punticasa gryffindor 100",
    "+punticasa tassorosso 25",
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
    if (!Number.isFinite(parsed.points) || parsed.points <= 0) {
      return safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Indica un numero di punti valido.",
        allowedMentions: { repliedUser: false },
      });
    }
    if (parsed.points > 5000) {
      return safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Massimo **5000** punti per assegnazione manuale.",
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
        content: "<:vegax:1443934876440068179> Impossibile assegnare i punti casata.",
        allowedMentions: { repliedUser: false },
      });
    }
    const embed = new EmbedBuilder()
      .setColor("#2d6a4f")
      .setTitle("Punti casata assegnati")
      .setDescription(
        [
          `**${result.houseLabel}** +**${result.points}** punti Coppa.`,
          result.periodLabel ? `Periodo scolastico: **${result.periodLabel}**` : "",
          result.reason ? `Motivo: ${result.reason}` : "",
          `Assegnati da ${message.author}.`,
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