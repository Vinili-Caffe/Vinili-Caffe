const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const {
  listRepostsByUser,
  messageJumpUrl,
  resolveRepostPreviewImageUrl,
} = require("../../Services/Community/repostService");
const { DEFAULT_FOOTER_TEXT } = require("../Embeds/defaultFooter");
const { TENANT_EMBED_COLOR } = require("../../MultiGuild/utils/tenantEmbedBranding");

const PER_PAGE = 5;
const PAGE_ACTIONS = new Set(["first", "prev", "next", "last"]);
const DELETE_BUTTONS_PER_ROW = 5;

function formatDateIt(value) {
  const date = value ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) return "";
  try {
    return date.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

function isUsableRepostImageUrl(url) {
  const u = String(url || "").trim();
  if (!u || u.startsWith("attachment://")) return false;
  if (!/^https:\/\//i.test(u)) return false;
  return /discord(?:app)?\.com|discord\.media/i.test(u) || /\.(png|jpe?g|gif|webp)(\?|$)/i.test(u);
}

function toDisplayRepostImageUrl(url) {
  const raw = String(url || "").trim();
  if (!isUsableRepostImageUrl(raw)) return "";
  try {
    const parsed = new URL(raw);
    if (/^cdn\.discordapp\.com$/i.test(parsed.hostname)) {
      parsed.hostname = "media.discordapp.net";
    }
    if (/media\.discordapp\.net|cdn\.discordapp\.com/i.test(parsed.hostname)) {
      // I GIF restano intere: il resize webp le spezza spesso.
      if (/\.gif(\?|$)/i.test(parsed.pathname)) return raw;
      parsed.searchParams.set("width", "480");
      parsed.searchParams.set("height", "270");
      parsed.searchParams.set("format", "webp");
    }
    return parsed.toString();
  } catch {
    return raw;
  }
}

function truncateRepostText(text, max = 180) {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  return raw.length > max ? `${raw.slice(0, max - 1)}…` : raw;
}

function extractTextFromBoardEmbedDescription(description) {
  const desc = String(description || "");
  if (!desc) return "";
  const italic = desc.match(/»\s*\*([\s\S]*?)\*(?:\n\n|\n•|\nɤ|$)/);
  if (italic?.[1]) {
    return italic[1].replace(/\\\*/g, "*").replace(/\\_/g, "_").trim();
  }
  const plain = desc.match(/»\s*([^\n]+)/);
  if (plain?.[1]) return plain[1].replace(/^\*|\*$/g, "").trim();
  return "";
}

function extractImageFromMessage(msg) {
  if (!msg) return "";
  const fromAtt = [...(msg.attachments?.values() || [])].find((att) =>
    /\.(png|jpe?g|gif|webp)(\?|$)/i.test(String(att?.name || att?.url || "")),
  );
  if (fromAtt?.url) return String(fromAtt.url);
  const emb = msg.embeds?.[0];
  const embImg = String(
    emb?.image?.url || emb?.data?.image?.url || emb?.thumbnail?.url || emb?.data?.thumbnail?.url || "",
  ).trim();
  return isUsableRepostImageUrl(embImg) ? embImg : "";
}

function extractTextFromMessage(msg) {
  if (!msg) return "";
  const emb = msg.embeds?.[0];
  const fromEmbed = extractTextFromBoardEmbedDescription(
    emb?.description || emb?.data?.description || "",
  );
  if (fromEmbed) return fromEmbed;
  const content = String(msg.content || "").trim();
  return content;
}

async function resolveLiveRepostPreview(guild, row) {
  let imageUrl = "";
  let text = String(row?.content || "").trim();
  const candidates = [
    [row?.boardChannelId, row?.boardMessageId],
    [row?.sourceChannelId, row?.sourceMessageId],
  ];
  if (guild) {
    for (const [channelId, messageId] of candidates) {
      const bc = String(channelId || "").trim();
      const bm = String(messageId || "").trim();
      if (!bc || !bm) continue;
      const channel =
        guild.channels.cache.get(bc) || (await guild.channels.fetch(bc).catch(() => null));
      if (!channel?.messages?.fetch) continue;
      const msg = await channel.messages.fetch(bm).catch(() => null);
      if (!msg) continue;
      if (!imageUrl) imageUrl = extractImageFromMessage(msg);
      if (!text) text = extractTextFromMessage(msg);
      if (imageUrl && text) break;
    }
  }
  if (!imageUrl) {
    const stored = resolveRepostPreviewImageUrl(row);
    if (isUsableRepostImageUrl(stored)) imageUrl = stored;
  }
  return {
    imageUrl: toDisplayRepostImageUrl(imageUrl),
    text: truncateRepostText(text),
  };
}

function buildMyRepostFooter({ total, page, totalPages, commandPrefix, canDelete = false }) {
  const safePrefix = String(commandPrefix || "").trim() || "+";
  const hint = `✧ * . ˊ ${safePrefix}myrepost`;
  const deleteHint = canDelete ? " · 🗑️ = rimuovi" : "";
  const stats = `Totale: ${total} · Pagina ${page}/${totalPages}`;
  const copyright = String(DEFAULT_FOOTER_TEXT || "").trim();
  const core = `${stats}${deleteHint} · ${hint}`;
  return copyright ? `${core} · ${copyright}` : core;
}

function buildMyRepostPageRow(requesterId, targetUserId, page, totalPages) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeTotal = Math.max(1, Number(totalPages) || 1);
  const suffix = `${requesterId}:${targetUserId}:${safePage}:${safeTotal}`;
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`myrepost_page_first:${suffix}`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("<:1343arrowleft:1525249879151083621>")
        .setDisabled(safePage <= 1 || safeTotal <= 1),
      new ButtonBuilder()
        .setCustomId(`myrepost_page_prev:${suffix}`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("<:1343arrowleft:1525249879151083621>")
        .setDisabled(safePage <= 1 || safeTotal <= 1),
      new ButtonBuilder()
        .setCustomId(`myrepost_page_next:${suffix}`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("<:1343arrowright:1525249880728145970>")
        .setDisabled(safePage >= safeTotal || safeTotal <= 1),
      new ButtonBuilder()
        .setCustomId(`myrepost_page_last:${suffix}`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("<:1343arrowright:1525249880728145970>")
        .setDisabled(safePage >= safeTotal || safeTotal <= 1),
      new ButtonBuilder()
        .setCustomId(`myrepost_close:${requesterId}`)
        .setStyle(ButtonStyle.Danger)
        .setEmoji("<:cancel:1461730653677551691>"),
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

function isMyRepostCloseButton(customId) {
  return String(customId || "").startsWith("myrepost_close:");
}

function parseMyRepostCloseButton(customId) {
  const match = String(customId || "").match(/^myrepost_close:(\d{16,20})$/);
  if (!match) return null;
  return { requesterId: match[1] };
}

function buildMyRepostDeleteRows(requesterId, targetUserId, rows, page, totalPages) {
  const requester = String(requesterId || "").trim();
  const targetId = String(targetUserId || "").trim();
  if (!requester || !targetId || requester !== targetId || !Array.isArray(rows) || !rows.length) {
    return [];
  }
  const safePage = Math.max(1, Number(page) || 1);
  const safeTotal = Math.max(1, Number(totalPages) || 1);
  const suffix = `${requester}:${targetId}:${safePage}:${safeTotal}`;
  const buttons = rows
    .map((row, idx) => {
      const repostId = String(row?._id || "").trim();
      if (!repostId) return null;
      const label = String((safePage - 1) * PER_PAGE + idx + 1);
      return new ButtonBuilder()
        .setCustomId(`myrepost_del:${repostId}:${suffix}`)
        .setLabel(label)
        .setEmoji("🗑️")
        .setStyle(ButtonStyle.Danger);
    })
    .filter(Boolean);
  const actionRows = [];
  for (let i = 0; i < buttons.length; i += DELETE_BUTTONS_PER_ROW) {
    actionRows.push(
      new ActionRowBuilder().addComponents(...buttons.slice(i, i + DELETE_BUTTONS_PER_ROW)),
    );
  }
  return actionRows;
}

function parseMyRepostDeleteButton(customId) {
  const id = String(customId || "");
  const match = id.match(/^myrepost_del:([a-f0-9]{24}):(\d{16,20}):(\d{16,20}):(\d+):(\d+)$/i);
  if (!match) return null;
  return {
    repostId: match[1],
    requesterId: match[2],
    targetUserId: match[3],
    page: Math.max(1, Number(match[4]) || 1),
    totalPages: Math.max(1, Number(match[5]) || 1),
  };
}

function isMyRepostDeleteButton(customId) {
  return String(customId || "").startsWith("myrepost_del:");
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
  const { rows, total } = await listRepostsByUser(gid, targetId, {
    limit: PER_PAGE,
    skip,
    excludeClips: true,
  });
  const totalPages = Math.max(1, Math.ceil((Number(total) || 0) / PER_PAGE));
  const safePage = Math.min(pageNum, totalPages);
  const safeSkip = (safePage - 1) * PER_PAGE;
  const titleSuffix = targetId === requester ? "te" : `<@${targetId}>`;

  if (!total) {
    const who = targetId === requester ? "Non hai ancora" : `<@${targetId}> non ha ancora`;
    const embed = new EmbedBuilder()
      .setColor(TENANT_EMBED_COLOR)
      .setTitle("<a:reddiamond:1443652837346377841> I tuoi repost")
      .setDescription(`${who} pubblicato repost sulla bacheca.`)
      .setFooter({ text: buildMyRepostFooter({ total: 0, page: 1, totalPages: 1, commandPrefix }) });
    return {
      embeds: [embed],
      components: buildMyRepostPageRow(requester, targetId, 1, 1),
      allowedUserIds: [targetId],
      includeBanner: false,
    };
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

  const previews = await Promise.all(rows.map((row) => resolveLiveRepostPreview(guild, row)));

  const embeds = rows.map((row, idx) => {
    const n = safeSkip + idx + 1;
    const boardUrl =
      row.boardChannelId && row.boardMessageId
        ? messageJumpUrl(gid, row.boardChannelId, row.boardMessageId)
        : "";
    const sourceUrl = messageJumpUrl(gid, row.sourceChannelId, row.sourceMessageId);
    const when = formatDateIt(row.createdAt);
    const boardLink = boardUrl ? `[Bacheca](${boardUrl})` : "Bacheca";
    const srcLink = sourceUrl ? `[Origine](${sourceUrl})` : "Origine";
    const imageUrl = previews[idx]?.imageUrl || "";
    const textPreview = String(previews[idx]?.text || "").trim();
    const authorId = String(row?.sourceAuthorId || "").trim();
    const authorLabel = authorId
      ? `<@${authorId}>`
      : String(row?.authorUsername || "").trim() || "utente";

    const embed = new EmbedBuilder().setColor(TENANT_EMBED_COLOR);
    if (idx === 0) {
      embed.setTitle(`<a:reddiamond:1443652837346377841> Repost di ${titleSuffix}`);
    }

    let description = `**${n}.** ${when} · ${boardLink} · ${srcLink}\n> Messaggio di ${authorLabel}`;
    if (textPreview) description += `\n> ${textPreview}`;
    else if (!imageUrl && boardUrl) description += `\n🖼️ [Apri repost](${boardUrl})`;

    embed.setDescription(description.slice(0, 4096));
    if (imageUrl) embed.setImage(imageUrl);
    if (idx === rows.length - 1) {
      embed.setFooter({
        text: buildMyRepostFooter({
          total,
          page: safePage,
          totalPages,
          commandPrefix,
          canDelete: requester === targetId,
        }),
      });
    }
    return embed;
  });

  return {
    embeds,
    components: [
      ...buildMyRepostDeleteRows(requester, targetId, rows, safePage, totalPages),
      ...buildMyRepostPageRow(requester, targetId, safePage, totalPages),
    ],
    allowedUserIds: [targetId],
    includeBanner: false,
  };
}

module.exports = {
  PER_PAGE,
  buildMyRepostPanel,
  buildMyRepostPageRow,
  buildMyRepostDeleteRows,
  parseMyRepostPageButton,
  parseMyRepostDeleteButton,
  parseMyRepostCloseButton,
  isMyRepostPageButton,
  isMyRepostDeleteButton,
  isMyRepostCloseButton,
};