const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js") as typeof import("discord.js");
const {
  listQuotesByUser,
  messageJumpUrl,
} = require("../Quote/quoteBoardService") as typeof import("../Quote/quoteBoardService");
const { DEFAULT_FOOTER_TEXT } = require("../Embeds/defaultFooter") as typeof import("../Embeds/defaultFooter");
const { TENANT_EMBED_COLOR } = require("../../MultiGuild/utils/tenantEmbedBranding") as typeof import("../../MultiGuild/utils/tenantEmbedBranding");

const PER_PAGE = 5;
const PAGE_ACTIONS = new Set(["first", "prev", "next", "last"]);
const DELETE_BUTTONS_PER_ROW = 5;

function formatDateIt(value?) {
  const date = value ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) return "";
  try {
    return date.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

function buildMyQuoteFooter({ total, page, totalPages, commandPrefix, canDelete = false }) {
  const safePrefix = String(commandPrefix || "").trim() || "+";
  const hint = `✧ * . ˊ ${safePrefix}myquote`;
  const deleteHint = canDelete ? " · 🗑️ = rimuovi" : "";
  const stats = `Totale: ${total} · Pagina ${page}/${totalPages}`;
  const copyright = String(DEFAULT_FOOTER_TEXT || "").trim();
  const core = `${stats}${deleteHint} · ${hint}`;
  return copyright ? `${core} · ${copyright}` : core;
}

function buildMyQuotePageRow(requesterId?, targetUserId?, page?, totalPages?) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeTotal = Math.max(1, Number(totalPages) || 1);
  const suffix = `${requesterId}:${targetUserId}:${safePage}:${safeTotal}`;
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`myquote_page_first:${suffix}`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("<:1343arrowleft:1525249879151083621>")
        .setDisabled(safePage <= 1 || safeTotal <= 1),
      new ButtonBuilder()
        .setCustomId(`myquote_page_prev:${suffix}`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("<:1343arrowleft:1525249879151083621>")
        .setDisabled(safePage <= 1 || safeTotal <= 1),
      new ButtonBuilder()
        .setCustomId(`myquote_page_next:${suffix}`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("<:1343arrowright:1525249880728145970>")
        .setDisabled(safePage >= safeTotal || safeTotal <= 1),
      new ButtonBuilder()
        .setCustomId(`myquote_page_last:${suffix}`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("<:1343arrowright:1525249880728145970>")
        .setDisabled(safePage >= safeTotal || safeTotal <= 1),
      new ButtonBuilder()
        .setCustomId(`myquote_close:${requesterId}`)
        .setStyle(ButtonStyle.Danger)
        .setEmoji("<:cancel:1461730653677551691>"),
    ),
  ];
}

function parseMyQuotePageButton(customId?) {
  const id = String(customId || "");
  const match = id.match(/^myquote_page_(first|prev|next|last):(\d{16,20}):(\d{16,20}):(\d+):(\d+)$/);
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

function isMyQuotePageButton(customId?) {
  return String(customId || "").startsWith("myquote_page_");
}

function isMyQuoteCloseButton(customId?) {
  return String(customId || "").startsWith("myquote_close:");
}

function parseMyQuoteCloseButton(customId?) {
  const match = String(customId || "").match(/^myquote_close:(\d{16,20})$/);
  if (!match) return null;
  return { requesterId: match[1] };
}

function buildMyQuoteDeleteRows(requesterId?, targetUserId?, rows?, page?, totalPages?) {
  const requester = String(requesterId || "").trim();
  const targetId = String(targetUserId || "").trim();
  if (!requester || !targetId || requester !== targetId || !Array.isArray(rows) || !rows.length) {
    return [];
  }
  const safePage = Math.max(1, Number(page) || 1);
  const safeTotal = Math.max(1, Number(totalPages) || 1);
  const suffix = `${requester}:${targetId}:${safePage}:${safeTotal}`;
  const buttons = rows
    .map((row?, idx?) => {
      const quoteId = String(row?._id || "").trim();
      if (!quoteId) return null;
      const label = String((safePage - 1) * PER_PAGE + idx + 1);
      return new ButtonBuilder()
        .setCustomId(`myquote_del:${quoteId}:${suffix}`)
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

function parseMyQuoteDeleteButton(customId?) {
  const id = String(customId || "");
  const match = id.match(/^myquote_del:([a-f0-9]{24}):(\d{16,20}):(\d{16,20}):(\d+):(\d+)$/i);
  if (!match) return null;
  return {
    quoteId: match[1],
    requesterId: match[2],
    targetUserId: match[3],
    page: Math.max(1, Number(match[4]) || 1),
    totalPages: Math.max(1, Number(match[5]) || 1),
  };
}

function isMyQuoteDeleteButton(customId?) {
  return String(customId || "").startsWith("myquote_del:");
}

function isUsableQuoteImageUrl(url?) {
  const u = String(url || "").trim();
  if (!u || u.startsWith("attachment://")) return false;
  if (!/^https:\/\//i.test(u)) return false;
  return /discord(?:app)?\.com|discord\.media/i.test(u) || /\.(png|jpe?g|gif|webp)(\?|$)/i.test(u);
}

function toDisplayQuoteImageUrl(url?) {
  const raw = String(url || "").trim();
  if (!isUsableQuoteImageUrl(raw)) return "";
  try {
    const parsed = new URL(raw);
    if (/^cdn\.discordapp\.com$/i.test(parsed.hostname)) {
      parsed.hostname = "media.discordapp.net";
    }
    if (/media\.discordapp\.net|cdn\.discordapp\.com/i.test(parsed.hostname)) {
      parsed.searchParams.set("width", "480");
      parsed.searchParams.set("height", "270");
      parsed.searchParams.set("format", "webp");
    }
    return parsed.toString();
  } catch {
    return raw;
  }
}

async function resolveLiveQuoteImageUrl(guild?, row?) {
  const bc = String(row?.boardChannelId || "").trim();
  const bm = String(row?.boardMessageId || "").trim();
  if (guild && bc && bm) {
    const channel =
      guild.channels.cache.get(bc) || (await guild.channels.fetch(bc).catch(() => null));
    if (channel?.messages?.fetch) {
      const msg = await channel.messages.fetch(bm).catch(() => null);
      if (msg) {
        const fromAtt = [...(msg.attachments?.values() || [])].find((att?) =>
          /\.(png|jpe?g|gif|webp)(\?|$)/i.test(String(att?.name || att?.url || "")),
        );
        if (fromAtt?.url) return String(fromAtt.url);
        const embImg = String(msg.embeds?.[0]?.image?.url || msg.embeds?.[0]?.data?.image?.url || "").trim();
        if (isUsableQuoteImageUrl(embImg)) return embImg;
      }
    }
  }
  const stored = String(row?.imageUrl || "").trim();
  return isUsableQuoteImageUrl(stored) ? stored : "";
}

async function buildMyQuotePanel({ guild, targetUserId, requesterId, page = 1, commandPrefix = "+" }) {
  const gid = String(guild?.id || "").trim();
  const targetId = String(targetUserId || "").trim();
  const requester = String(requesterId || "").trim();
  if (!gid || !targetId || !requester) {
    return { embeds: [], components: [] };
  }

  const pageNum = Math.max(1, Math.floor(Number(page) || 1));
  const skip = (pageNum - 1) * PER_PAGE;
  const { rows, total } = await listQuotesByUser(gid, targetId, {
    limit: PER_PAGE,
    skip,
    guild,
  });
  const totalPages = Math.max(1, Math.ceil((Number(total) || 0) / PER_PAGE));
  const safePage = Math.min(pageNum, totalPages);
  const safeSkip = (safePage - 1) * PER_PAGE;
  const titleSuffix = targetId === requester ? "te" : `<@${targetId}>`;

  if (!total) {
    const who = targetId === requester ? "Non hai ancora" : `<@${targetId}> non ha ancora`;
    const embed = new EmbedBuilder()
      .setColor(TENANT_EMBED_COLOR)
      .setTitle("<a:VC_Sparkles:1468546911936974889> Le tue quote")
      .setDescription(`${who} pubblicato quote sulla bacheca.`)
      .setFooter({ text: buildMyQuoteFooter({ total: 0, page: 1, totalPages: 1, commandPrefix }) });
    return {
      embeds: [embed],
      components: buildMyQuotePageRow(requester, targetId, 1, 1),
      allowedUserIds: [targetId],
    };
  }

  if (safePage !== pageNum) {
    return buildMyQuotePanel({
      guild,
      targetUserId: targetId,
      requesterId: requester,
      page: safePage,
      commandPrefix,
    });
  }

  const imageUrls = await Promise.all(rows.map((row?) => resolveLiveQuoteImageUrl(guild, row)));

  const embeds = rows.map((row?, idx?) => {
    const n = safeSkip + idx + 1;
    const boardUrl =
      row.boardChannelId && row.boardMessageId
        ? messageJumpUrl(gid, row.boardChannelId, row.boardMessageId)
        : "";
    const when = formatDateIt(row.createdAt);
    const boardLink = boardUrl ? `[Bacheca](${boardUrl})` : "Bacheca";
    const quoted = String(row.quotedUserId || "").trim();
    const quotedLabel = quoted ? `<@${quoted}>` : String(row.quotedUsername || "utente");
    const imageUrl = toDisplayQuoteImageUrl(imageUrls[idx] || "");

    const embed = new EmbedBuilder().setColor(TENANT_EMBED_COLOR);
    if (idx === 0) {
      embed.setTitle(`<a:VC_Sparkles:1468546911936974889> Quote di ${titleSuffix}`);
    }
    let description = `**${n}.** ${when} · ${boardLink}\n> Citazione di ${quotedLabel}`;
    if (!imageUrl && boardUrl) description += `\n🖼️ [Apri quote](${boardUrl})`;
    embed.setDescription(description);
    if (imageUrl) embed.setImage(imageUrl);
    if (idx === rows.length - 1) {
      embed.setFooter({
        text: buildMyQuoteFooter({
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
      ...buildMyQuoteDeleteRows(requester, targetId, rows, safePage, totalPages),
      ...buildMyQuotePageRow(requester, targetId, safePage, totalPages),
    ],
    allowedUserIds: [targetId],
    includeBanner: false,
  };
}

export = {
  PER_PAGE,
  buildMyQuotePanel,
  parseMyQuotePageButton,
  parseMyQuoteDeleteButton,
  parseMyQuoteCloseButton,
  isMyQuotePageButton,
  isMyQuoteDeleteButton,
  isMyQuoteCloseButton,
};
