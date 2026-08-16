const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require("discord.js");
const {
  listRepostsByUser,
  messageJumpUrl,
  resolveRepostMediaFilesForSend,
} = require("../../Services/Community/repostService");
const { DEFAULT_FOOTER_TEXT } = require("../Embeds/defaultFooter");
const { TENANT_EMBED_COLOR } = require("../../MultiGuild/utils/tenantEmbedBranding");

// Pochi file audio per messaggio: altrimenti payload/edit scoppia.
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

function buildMyClipFooter({ total, page, totalPages, commandPrefix, canDelete = false }) {
  const safePrefix = String(commandPrefix || "").trim() || "+";
  const hint = `✧ * . ˊ ${safePrefix}myclip`;
  const deleteHint = canDelete ? " · 🗑️ = rimuovi" : "";
  const stats = `Totale: ${total} · Pagina ${page}/${totalPages}`;
  const copyright = String(DEFAULT_FOOTER_TEXT || "").trim();
  const core = `${stats}${deleteHint} · ${hint}`;
  return copyright ? `${core} · ${copyright}` : core;
}

function buildMyClipPageRow(requesterId, targetUserId, page, totalPages) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeTotal = Math.max(1, Number(totalPages) || 1);
  const suffix = `${requesterId}:${targetUserId}:${safePage}:${safeTotal}`;
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`myclip_page_first:${suffix}`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("<:1343arrowleft:1525249879151083621>")
        .setDisabled(safePage <= 1 || safeTotal <= 1),
      new ButtonBuilder()
        .setCustomId(`myclip_page_prev:${suffix}`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("<:1343arrowleft:1525249879151083621>")
        .setDisabled(safePage <= 1 || safeTotal <= 1),
      new ButtonBuilder()
        .setCustomId(`myclip_page_next:${suffix}`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("<:1343arrowright:1525249880728145970>")
        .setDisabled(safePage >= safeTotal || safeTotal <= 1),
      new ButtonBuilder()
        .setCustomId(`myclip_page_last:${suffix}`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("<:1343arrowright:1525249880728145970>")
        .setDisabled(safePage >= safeTotal || safeTotal <= 1),
      new ButtonBuilder()
        .setCustomId(`myclip_close:${requesterId}`)
        .setStyle(ButtonStyle.Danger)
        .setEmoji("<:cancel:1461730653677551691>"),
    ),
  ];
}

function parseMyClipPageButton(customId) {
  const id = String(customId || "");
  const match = id.match(/^myclip_page_(first|prev|next|last):(\d{16,20}):(\d{16,20}):(\d+):(\d+)$/);
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

function isMyClipPageButton(customId) {
  return String(customId || "").startsWith("myclip_page_");
}

function isMyClipCloseButton(customId) {
  return String(customId || "").startsWith("myclip_close:");
}

function parseMyClipCloseButton(customId) {
  const match = String(customId || "").match(/^myclip_close:(\d{16,20})$/);
  if (!match) return null;
  return { requesterId: match[1] };
}

function buildMyClipDeleteRows(requesterId, targetUserId, rows, page, totalPages) {
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
      const clipId = String(row?._id || "").trim();
      if (!clipId) return null;
      const label = String((safePage - 1) * PER_PAGE + idx + 1);
      return new ButtonBuilder()
        .setCustomId(`myclip_del:${clipId}:${suffix}`)
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

function parseMyClipDeleteButton(customId) {
  const id = String(customId || "");
  const match = id.match(/^myclip_del:([a-f0-9]{24}):(\d{16,20}):(\d{16,20}):(\d+):(\d+)$/i);
  if (!match) return null;
  return {
    clipId: match[1],
    requesterId: match[2],
    targetUserId: match[3],
    page: Math.max(1, Number(match[4]) || 1),
    totalPages: Math.max(1, Number(match[5]) || 1),
  };
}

function isMyClipDeleteButton(customId) {
  return String(customId || "").startsWith("myclip_del:");
}

function renameClipAttachment(file, displayIndex) {
  const name = `clip-${displayIndex}.mp3`;
  if (!file) return null;
  if (typeof file.setName === "function") {
    file.setName(name);
    return file;
  }
  const raw = file.attachment ?? file;
  return new AttachmentBuilder(raw, { name });
}

async function resolveClipAudioAttachment(guild, row, displayIndex) {
  const media = await resolveRepostMediaFilesForSend(guild, row).catch(() => []);
  if (!Array.isArray(media) || !media.length) return null;
  return renameClipAttachment(media[0], displayIndex);
}

async function buildMyClipPanel({ guild, targetUserId, requesterId, page = 1, commandPrefix = "+" }) {
  const gid = String(guild?.id || "").trim();
  const targetId = String(targetUserId || "").trim();
  const requester = String(requesterId || "").trim();
  if (!gid || !targetId || !requester) {
    return { embeds: [], components: [], files: [] };
  }

  const pageNum = Math.max(1, Math.floor(Number(page) || 1));
  const skip = (pageNum - 1) * PER_PAGE;
  const { rows, total } = await listRepostsByUser(gid, targetId, {
    limit: PER_PAGE,
    skip,
    clipsOnly: true,
  });
  const totalPages = Math.max(1, Math.ceil((Number(total) || 0) / PER_PAGE));
  const safePage = Math.min(pageNum, totalPages);
  const safeSkip = (safePage - 1) * PER_PAGE;
  const titleSuffix = targetId === requester ? "te" : `<@${targetId}>`;

  if (!total) {
    const who = targetId === requester ? "Non hai ancora" : `<@${targetId}> non ha ancora`;
    const embed = new EmbedBuilder()
      .setColor(TENANT_EMBED_COLOR)
      .setTitle("🎙️ Le tue clip")
      .setDescription(`${who} pubblicato clip vocali sulla bacheca.`)
      .setFooter({ text: buildMyClipFooter({ total: 0, page: 1, totalPages: 1, commandPrefix }) });
    return {
      embeds: [embed],
      components: buildMyClipPageRow(requester, targetId, 1, 1),
      files: [],
      allowedUserIds: [targetId],
      includeBanner: false,
    };
  }

  if (safePage !== pageNum) {
    return buildMyClipPanel({
      guild,
      targetUserId: targetId,
      requesterId: requester,
      page: safePage,
      commandPrefix,
    });
  }

  const audioFiles = await Promise.all(
    rows.map((row, idx) => resolveClipAudioAttachment(guild, row, safeSkip + idx + 1)),
  );
  const files = audioFiles.filter(Boolean);

  const descriptionLines = rows.map((row, idx) => {
    const n = safeSkip + idx + 1;
    const boardUrl =
      row.boardChannelId && row.boardMessageId
        ? messageJumpUrl(gid, row.boardChannelId, row.boardMessageId)
        : "";
    const when = formatDateIt(row.createdAt);
    const boardLink = boardUrl ? `[Bacheca](${boardUrl})` : "Bacheca";
    const hasAudio = Boolean(audioFiles[idx]);
    const preview = hasAudio
      ? `🎵 Clip \`${n}\` (player sotto)`
      : boardUrl
        ? `🎵 [Apri clip](${boardUrl})`
        : "🎵 Clip audio";
    return `**${n}.** ${when} · ${boardLink}\n> ${preview}`;
  });

  const embed = new EmbedBuilder()
    .setColor(TENANT_EMBED_COLOR)
    .setTitle(`🎙️ Clip di ${titleSuffix}`)
    .setDescription(descriptionLines.join("\n\n").slice(0, 4096))
    .setFooter({
      text: buildMyClipFooter({
        total,
        page: safePage,
        totalPages,
        commandPrefix,
        canDelete: requester === targetId,
      }),
    });

  return {
    embeds: [embed],
    components: [
      ...buildMyClipDeleteRows(requester, targetId, rows, safePage, totalPages),
      ...buildMyClipPageRow(requester, targetId, safePage, totalPages),
    ],
    files,
    allowedUserIds: [targetId],
    includeBanner: false,
  };
}

module.exports = {
  PER_PAGE,
  buildMyClipPanel,
  parseMyClipPageButton,
  parseMyClipDeleteButton,
  parseMyClipCloseButton,
  isMyClipPageButton,
  isMyClipDeleteButton,
  isMyClipCloseButton,
};
