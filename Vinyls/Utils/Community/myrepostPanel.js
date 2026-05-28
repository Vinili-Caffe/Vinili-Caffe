const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { listRepostsByUser, messageJumpUrl } = require("../../Services/Community/repostService");
const { resolveQuoteChannelId } = require("../Quote/quotePostChannel");
const { DEFAULT_FOOTER_TEXT } = require("../Embeds/defaultFooter");
const { getGuildChannelCached } = require("../Interaction/interactionEntityCache");

const PER_PAGE = 8;
const PAGE_ACTIONS = new Set(["first", "prev", "next", "last"]);

function formatDateIt(value) {
  const date = value ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) return "";
  try {
    return date.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

async function resolveBoardChannelLabel(guild, channelId) {
  const id = String(channelId || "").trim();
  if (!id || !guild) return null;
  const channel =
    guild.channels.cache.get(id) || (await getGuildChannelCached(guild, id).catch(() => null));
  if (!channel) return null;
  const name = String(channel.name || "").trim();
  return name ? `#${name}` : null;
}

function buildMyRepostFooter({ total, page, totalPages, commandPrefix }) {
  const safePrefix = String(commandPrefix || "").trim() || "+";
  const hint = `✧ * . ˊ ${safePrefix}myrepost`;
  const stats = `Totale: ${total} · Pagina ${page}/${totalPages}`;
  const copyright = String(DEFAULT_FOOTER_TEXT || "").trim();
  return copyright ? `${stats} · ${hint} · ${copyright}` : `${stats} · ${hint}`;
}

function buildMyRepostPageRow(requesterId, targetUserId, page, totalPages) {
  if (totalPages <= 1) return [];
  const suffix = `${requesterId}:${targetUserId}:${page}:${totalPages}`;
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`myrepost_page_first:${suffix}`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("<:VC_page1:1482459684630958223>")
        .setDisabled(page <= 1),
      new ButtonBuilder()
        .setCustomId(`myrepost_page_prev:${suffix}`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("<:VC_page5:1482459835042762752>")
        .setDisabled(page <= 1),
      new ButtonBuilder()
        .setCustomId(`myrepost_page_next:${suffix}`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("<:VC_page4:1482459791975645226>")
        .setDisabled(page >= totalPages),
      new ButtonBuilder()
        .setCustomId(`myrepost_page_last:${suffix}`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("<:VC_page3:1482459759268462613>")
        .setDisabled(page >= totalPages),
    ),
  ];
}

function parseMyRepostPageButton(customId) {
  const id = String(customId || "");
  const match = id.match(/^myrepost_page_(first|prev|next|last):(\d{16,20}):(\d{16,20}):(\d+):(\d+)$/);
  if (!match || !PAGE_ACTIONS.has(match[1])) return null;
  const action = match[1];
  const requesterId = match[2];
  const targetUserId = match[3];
  const currentPage = Math.max(1, Number(match[4]) || 1);
  const totalPages = Math.max(1, Number(match[5]) || 1);
  let targetPage = currentPage;
  if (action === "first") targetPage = 1;
  else if (action === "prev") targetPage = currentPage - 1;
  else if (action === "next") targetPage = currentPage + 1;
  else if (action === "last") targetPage = totalPages;
  return {
    requesterId,
    targetUserId,
    targetPage: Math.min(totalPages, Math.max(1, targetPage)),
    totalPages,
    action,
  };
}

function isMyRepostPageButton(customId) {
  return String(customId || "").startsWith("myrepost_page_");
}

async function buildMyRepostPanel({ guild, targetUserId, requesterId, page = 1, commandPrefix = "+" }) {
  const gid = String(guild?.id || "").trim();
  const targetId = String(targetUserId || "").trim();
  const requester = String(requesterId || "").trim();
  if (!gid || !targetId || !requester) {
    return { embeds: [], components: [] };
  }

  const pageNum = Math.max(1, Math.floor(Number(page) || 1));
  const skip = (pageNum - 1) * PER_PAGE;
  const { rows, total } = await listRepostsByUser(gid, targetId, { limit: PER_PAGE, skip });
  const totalPages = Math.max(1, Math.ceil((Number(total) || 0) / PER_PAGE));
  const safePage = Math.min(pageNum, totalPages);
  const safeSkip = (safePage - 1) * PER_PAGE;

  const titleSuffix =
    targetId === requester ? "te" : `<@${targetId}>`;

  if (!total) {
    const who = targetId === requester ? "Non hai ancora" : `<@${targetId}> non ha ancora`;
    const embed = new EmbedBuilder()
      .setColor(0xeb6ea5)
      .setTitle("<a:reddiamond:1443652837346377841> I tuoi repost")
      .setDescription(`${who} pubblicato repost sulla bacheca.`)
      .setFooter({ text: buildMyRepostFooter({ total: 0, page: 1, totalPages: 1, commandPrefix }) });
    return { embeds: [embed], components: [], allowedUserIds: [targetId] };
  }

  if (safePage !== pageNum) {
    return buildMyRepostPanel({
      guild,
      targetUserId: targetId,
      requesterId: requester,
      page: safePage,
      commandPrefix,
    });
  }

  const quotesChannelId = resolveQuoteChannelId(gid);
  const boardLabel = quotesChannelId ? await resolveBoardChannelLabel(guild, quotesChannelId) : null;
  const boardLine = boardLabel ? `» Bacheca: **${boardLabel}**` : "";

  const lines = rows.map((row, idx) => {
    const n = safeSkip + idx + 1;
    const boardUrl =
      row.boardChannelId && row.boardMessageId
        ? messageJumpUrl(gid, row.boardChannelId, row.boardMessageId)
        : "";
    const sourceUrl = messageJumpUrl(gid, row.sourceChannelId, row.sourceMessageId);
    const when = formatDateIt(row.createdAt);
    const boardLink = boardUrl ? `[Bacheca](${boardUrl})` : "Bacheca";
    const srcLink = sourceUrl ? `[Origine](${sourceUrl})` : "Origine";
    const preview = String(row.content || "").trim().slice(0, 80);
    return `**${n}.** ${when} · ${boardLink} · ${srcLink}\n> ${preview || "—"}`;
  });

  const description = [boardLine, lines.join("\n\n")].filter(Boolean).join("\n\n").slice(0, 3900);
  const embed = new EmbedBuilder()
    .setColor(0xeb6ea5)
    .setTitle(`<a:reddiamond:1443652837346377841> Repost di ${titleSuffix}`)
    .setDescription(description || "—")
    .setFooter({
      text: buildMyRepostFooter({
        total,
        page: safePage,
        totalPages,
        commandPrefix,
      }),
    });

  return {
    embeds: [embed],
    components: buildMyRepostPageRow(requester, targetId, safePage, totalPages),
    allowedUserIds: [targetId],
  };
}

module.exports = {
  PER_PAGE,
  buildMyRepostPanel,
  buildMyRepostPageRow,
  parseMyRepostPageButton,
  isMyRepostPageButton,
};