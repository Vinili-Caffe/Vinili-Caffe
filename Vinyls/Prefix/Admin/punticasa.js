const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { assignManualHousePoints, normalizeHouseInput } = require("../../Services/Community/hogwartsManualHousePointsService");
const { expelSortedMemberFromHouse } = require("../../Services/Community/hogwartsHouseAdminService");
const { buildHouseDashboardPayload, buildHousePickerPayload, formatExpelOutcomeNote } = require("../../Buttons/punticasaPanel");
const {
  resolveHouseForUser,
  canAccessHouse,
  buildPrefectDeniedMessage,
  resolvePrefectHouseForUser,
  parseDiscordUserRef,
  findExpelArgIndex,
} = require("../../Utils/Community/punticasaPrefectAccess");

function parseArgs(args = []) {
  const houseRaw = String(args[0] || "").trim();
  const pointsRaw = String(args[1] || "").trim();
  const reason = args.slice(2).join(" ").trim();
  const houseId = normalizeHouseInput(houseRaw);
  const points = Math.floor(Number(pointsRaw));
  return { houseId, points, reason, houseRaw, pointsRaw, hasPointsArg: pointsRaw.length > 0 };
}

module.exports = {
  name: "punticasa",
  aliases: ["puntcasa"],
  hideFromHelp: true,
  allowEmptyArgs: true,
  description: "Dashboard Coppa delle Case: punti, classifica ed espulsioni casata.",
  usage: "+punticasa [casa] [punti] [motivo] · +punticasa [casa] espelli @utente",
  examples: [
    "+punticasa",
    "+punticasa grifondoro",
    "+punticasa grifondoro 50 Premio staff",
    "+punticasa tassorosso -30 Correzione",
    "+punticasa espelli @Lore",
    "+punticasa tassorosso espelli @Lore",
  ],
  async execute(message, args = []) {
    if (!message.inGuild?.() || !message.guild) return;
    const ownerId = String(message.author.id || "");
    const expelIdx = findExpelArgIndex(args);
    if (expelIdx >= 0) {
      const before = args.slice(0, expelIdx);
      const after = args.slice(expelIdx + 1);
      let houseId = "";
      for (const token of before) {
        const hid = normalizeHouseInput(token);
        if (hid) {
          houseId = hid;
          break;
        }
      }
      if (!houseId) {
        houseId = resolveHouseForUser(ownerId, "", message.client) || "";
      }
      if (!houseId) {
        return safeMessageReply(message, {
          content: "<:vegax:1443934876440068179> Indica la casata oppure apri il pannello con `+punticasa <casa>`.",
          allowedMentions: { repliedUser: false },
        });
      }
      if (!canAccessHouse(ownerId, houseId, message.client)) {
        return safeMessageReply(message, {
          content: buildPrefectDeniedMessage(ownerId, message.client),
          allowedMentions: { repliedUser: false },
        });
      }
      const targetId = parseDiscordUserRef(after.join(" "), message.mentions.users.first());
      if (!targetId) {
        return safeMessageReply(message, {
          content: "<:vegax:1443934876440068179> Tagga l'utente da espellere, es. `+punticasa espelli @utente`.",
          allowedMentions: { repliedUser: false },
        });
      }
      const expelled = await expelSortedMemberFromHouse(
        message.client,
        message.guild,
        targetId,
        houseId,
        ownerId,
      );
      const payload = await buildHouseDashboardPayload(
        message.client,
        message.guild,
        houseId,
        ownerId,
        { footerNote: formatExpelOutcomeNote(expelled, targetId) },
      );
      return safeMessageReply(message, {
        ...payload,
        allowedMentions: { repliedUser: false },
      });
    }
    const parsed = parseArgs(args);

    if (!parsed.hasPointsArg) {
      await message.channel.sendTyping().catch(() => {});
      const requestedHouse = normalizeHouseInput(parsed.houseId);
      const houseForPanel =
        requestedHouse ||
        resolvePrefectHouseForUser(ownerId, message.client) ||
        null;
      if (!houseForPanel) {
        const payload = buildHousePickerPayload(ownerId, message.client);
        return safeMessageReply(message, {
          ...payload,
          allowedMentions: { repliedUser: false },
        });
      }
      if (!canAccessHouse(ownerId, houseForPanel, message.client)) {
        return safeMessageReply(message, {
          content: buildPrefectDeniedMessage(ownerId, message.client),
          allowedMentions: { repliedUser: false },
        });
      }
      const payload = await buildHouseDashboardPayload(
        message.client,
        message.guild,
        houseForPanel,
        ownerId,
      );
      return safeMessageReply(message, {
        ...payload,
        allowedMentions: { repliedUser: false },
      });
    }

    const houseForPoints = resolveHouseForUser(ownerId, parsed.houseId, message.client);
    if (parsed.houseId && !canAccessHouse(ownerId, parsed.houseId, message.client)) {
      return safeMessageReply(message, {
        content: buildPrefectDeniedMessage(ownerId, message.client),
        allowedMentions: { repliedUser: false },
      });
    }
    if (!parsed.houseId && houseForPoints) {
      parsed.houseId = houseForPoints;
    }

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