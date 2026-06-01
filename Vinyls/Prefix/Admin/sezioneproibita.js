const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const IDs = require("../../Utils/Config/ids");
const { resolveHogwartsEventConfig } = require("../../Utils/Web/hogwartsSortingConfig");
const { auditForbiddenBooksForUser, assignForbiddenSectionWinner, formatForbiddenBookList, formatForbiddenWinnersList, FORBIDDEN_MAX_WINNERS } = require("../../Services/Community/hogwartsForbiddenBooksService");
const STAFF_ROLE_IDS = [ IDs.roles.Founder, IDs.roles.Admin ].filter(Boolean);
const WINNER_SUBS = new Set(["vincitore", "assegna", "winner"]);
const CHECK_SUBS = new Set(["check", "verifica"]);

function hasStaffAccess(member, guild) {
  if (!member || !guild) return false;
  if (String(guild.ownerId || "") === String(member.id || "")) return true;
  return STAFF_ROLE_IDS.some((roleId) => member.roles?.cache?.has?.(roleId));
}

function resolveSubcommand(args = []) {
  const raw = String(args[0] || "").toLowerCase();
  if (WINNER_SUBS.has(raw)) return { mode: "vincitore", userArgs: args.slice(1) };
  if (CHECK_SUBS.has(raw)) return { mode: "check", userArgs: args.slice(1) };
  return { mode: "check", userArgs: args };
}

async function resolveTargetUser(message, args = []) {
  const token = String(args[0] || "").trim();
  if (!token) return null;
  const mentionMatch = token.match(/^<@!?(\d+)>$/);
  const id = (mentionMatch ? mentionMatch[1] : null) || (/^\d{17,20}$/.test(token) ? token : null);
  if (!id) return null;
  return message.client.users.fetch(id).catch(() => null);
}

function buildAuditEmbed(audit, targetUser, client) {
  const { progress, sorted, houseLabel, eventOpen } = audit;
  const completed = Boolean(progress?.completed);
  const color = completed ? "#2d6a4f" : progress?.collectedCount > 0 ? "#6f4e37" : "#8b4513";
  const statusLine = completed
    ? "<:vegacheckmark:1443666279058772028> Ha raccolto **tutti** i libri sul sito."
    : `<:VC_Attention:1482534443632558151> Mancano **${progress.missingBookIds.length}** libro/i su **${progress.requiredCount}**.`;
  const winnersLine =
    progress.winners?.length > 0
      ? `\nVincitori evento (**${progress.winners.length}/${FORBIDDEN_MAX_WINNERS}**):\n${formatForbiddenWinnersList(progress.winners, resolveHogwartsEventConfig(client))}`
      : "";
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle("Sezione proibita")
    .setDescription(
      [
        `Utente: ${targetUser} (\`${targetUser.id}\`)`,
        sorted ? `Casa: **${houseLabel || audit.houseId}**` : "<:vegax:1443934876440068179> **Non smistato** (nessun libro valido sul sito).",
        `Evento libri sul sito: **${eventOpen ? "aperto" : "chiuso"}**${progress.closed ? " · **chiuso** (vincitori assegnati)" : ""}`,
        "",
        statusLine,
        `Progresso: **${progress.collectedCount}/${progress.requiredCount}**`,
        winnersLine,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .addFields(
      {
        name: "Libri raccolti",
        value: formatForbiddenBookList(progress.collectedBookIds).slice(0, 1024) || "—",
        inline: false,
      },
      {
        name: "Libri mancanti",
        value: formatForbiddenBookList(progress.missingBookIds).slice(0, 1024) || "—",
        inline: false,
      },
    );
  if (audit.completedAt) {
    embed.setFooter({ text: `Completato sul sito: ${new Date(audit.completedAt).toLocaleString("it-IT", { timeZone: "Europe/Rome" })}` });
  }
  return embed;
}

function winnerErrorMessage(code, result) {
  switch (code) {
    case "not_sorted":
      return "<:vegax:1443934876440068179> L'utente **non è smistato**: non può essere vincitore.";
    case "books_incomplete":
      return "<:vegax:1443934876440068179> L'utente **non ha raccolto tutti i libri** sul sito.";
    case "already_winner":
      return "<:vegax:1443934876440068179> Questo utente è **già** tra i vincitori dell'evento.";
    case "house_already_winner":
      return `<:vegax:1443934876440068179> C'è già un vincitore per la casa **${result?.houseLabel || result?.houseId || "?"}**. Non puoi assegnare due vincitori della stessa casa.`;
    case "max_winners":
      return `<:vegax:1443934876440068179> Sono già stati assegnati **${FORBIDDEN_MAX_WINNERS}** vincitori.`;
    case "event_closed":
      return "<:vegax:1443934876440068179> L'evento è **già chiuso**.";
    case "high_staff_excluded":
      return "<:vegax:1443934876440068179> Impossibile assegnare il vincitore.";
    default:
      return "<:vegax:1443934876440068179> Impossibile assegnare il vincitore.";
  }
}

function buildWinnerSuccessEmbed(result, targetUser, client) {
  const cfg = resolveHogwartsEventConfig(client);
  return new EmbedBuilder()
    .setColor("#2d6a4f")
    .setTitle("Sezione proibita")
    .setDescription(
      [
        `${targetUser} (\`${targetUser.id}\`) è ora vincitore per **${result.houseLabel || result.houseId}**.`,
        "",
        `Vincitori (**${result.winners.length}/${FORBIDDEN_MAX_WINNERS}**):`,
        formatForbiddenWinnersList(result.winners, cfg),
        result.closed
          ? "\n<:vegacheckmark:1443666279058772028> Evento **chiuso** (entrambi i vincitori assegnati)."
          : "\nPuoi assegnare ancora **un** vincitore di un'altra casa.",
      ].join("\n"),
    );
}

module.exports = {
  name: "sezioneproibita",
  allowEmptyArgs: false,
  subcommands: ["check", "winner"],
  description: "Verifica libri proibiti sul sito o assegna vincitori evento.",
  usage: "+sezioneproibita <@utente | id> · +sezioneproibita winner <@utente | id>",
  examples: ["+sezioneproibita @Mario", "+sezioneproibita winner @Mario"],
  async execute(message, args = []) {
    if (!message.inGuild?.() || !message.guild) return;
    if (!hasStaffAccess(message.member, message.guild)) {
      return safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Comando riservato allo staff.",
        allowedMentions: { repliedUser: false },
      });
    }
    const { mode, userArgs } = resolveSubcommand(args);
    const targetUser = await resolveTargetUser(message, userArgs);
    if (!targetUser) {
      return safeMessageReply(message, {
        content:
          "<:vegax:1443934876440068179> Uso: `+sezioneproibita <@utente | id>` · `+sezioneproibita winner <@utente | id>`",
        allowedMentions: { repliedUser: false },
      });
    }
    if (mode === "winner") {
      const result = await assignForbiddenSectionWinner(
        message.client,
        message.guild.id,
        targetUser.id,
        message.author.id,
      );
      if (!result.ok) {
        return safeMessageReply(message, {
          content: winnerErrorMessage(result.code, result),
          allowedMentions: { repliedUser: false },
        });
      }
      return safeMessageReply(message, {
        embeds: [buildWinnerSuccessEmbed(result, targetUser, message.client)],
        allowedMentions: { repliedUser: false },
      });
    }
    const audit = await auditForbiddenBooksForUser(message.client, message.guild.id, targetUser.id);
    if (!audit.ok) {
      return safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Impossibile leggere i dati libri proibiti.",
        allowedMentions: { repliedUser: false },
      });
    }
    return safeMessageReply(message, {
      embeds: [buildAuditEmbed(audit, targetUser, message.client)],
      allowedMentions: { repliedUser: false },
    });
  },
};