const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const {
  listRepostsByUser,
  messageJumpUrl,
  isRepostDisabledInGuild,
  REPOST_DISABLED_MESSAGE,
} = require("../../Services/Community/repostService");
const { resolveQuoteChannelId } = require("../../Utils/Quote/quotePostChannel");

const PER_PAGE = 8;

function formatDateIt(value) {
  const date = value ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) return "";
  try {
    return date.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

module.exports = {
  name: "myrepost",
  allowEmptyArgs: true,
  async execute(message, args) {
    if (!message?.guild) {
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:vegax:1443934876440068179> Questo comando funziona solo in un server."),
        ],
        allowedMentions: { repliedUser: false },
      });
    }

    if (isRepostDisabledInGuild(message.guild.id)) {
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(`<:vegax:1443934876440068179> ${REPOST_DISABLED_MESSAGE}`),
        ],
        allowedMentions: { repliedUser: false },
      });
    }

    const target =
      message.mentions.users.first() ||
      (args?.[0] && /^\d{16,20}$/.test(String(args[0])) ? { id: String(args[0]) } : null) ||
      message.author;

    const pageRaw = Number(args?.[args.length - 1]);
    const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
    const skip = (page - 1) * PER_PAGE;

    const { rows, total } = await listRepostsByUser(message.guild.id, target.id, {
      limit: PER_PAGE,
      skip,
    });

    if (!total) {
      const who = target.id === message.author.id ? "Non hai ancora" : `<@${target.id}> non ha ancora`;
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor(0xeb6ea5)
            .setTitle("<a:reddiamond:1443652837346377841> I tuoi repost")
            .setDescription(`${who} pubblicato repost sulla bacheca.`),
        ],
        allowedMentions: { repliedUser: false },
      });
    }

    const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
    const safePage = Math.min(page, totalPages);
    const lines = rows.map((row, idx) => {
      const n = skip + idx + 1;
      const boardUrl =
        row.boardChannelId && row.boardMessageId
          ? messageJumpUrl(message.guild.id, row.boardChannelId, row.boardMessageId)
          : "";
      const sourceUrl = messageJumpUrl(message.guild.id, row.sourceChannelId, row.sourceMessageId);
      const when = formatDateIt(row.createdAt);
      const boardLink = boardUrl ? `[Bacheca](${boardUrl})` : "Bacheca";
      const srcLink = sourceUrl ? `[Origine](${sourceUrl})` : "Origine";
      const preview = String(row.content || "").trim().slice(0, 80);
      return `**${n}.** ${when} · ${boardLink} · ${srcLink}\n> ${preview || "—"}`;
    });

    const quotesChannelId = resolveQuoteChannelId(message.guild.id);
    const boardHint = quotesChannelId ? ` · Bacheca: <#${quotesChannelId}>` : "";
    const embed = new EmbedBuilder()
      .setColor(0xeb6ea5)
      .setTitle("<a:reddiamond:1443652837346377841> Repost di " + (target.id === message.author.id ? "te" : `<@${target.id}>`))
      .setDescription(lines.join("\n\n").slice(0, 3900))
      .setFooter({
        text: `Totale: ${total} · Pagina ${safePage}/${totalPages}${boardHint}`,
      });

    return safeMessageReply(message, {
      embeds: [embed],
      allowedMentions: { users: [target.id], repliedUser: false },
    });
  },
};