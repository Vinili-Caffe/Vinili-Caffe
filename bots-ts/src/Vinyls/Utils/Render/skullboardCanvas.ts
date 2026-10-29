const canvasModule = require("canvas") as typeof import("canvas");
const { registerCanvasFonts, fontStack, drawTextWithSpecialFallback } = require("./canvasFonts") as typeof import("./canvasFonts");
const { createCanvas } = canvasModule;
const { safeLoadImage } = require("./safeLoadImage") as typeof import("./safeLoadImage");
const { normalizeTextForCanvas } = require("./canvasUtils") as typeof import("./canvasUtils");
const {
  drawLabelWithEmoji,
  wrapRichTextToLines,
  textWidth,
  measureRichTextWidth,
} = require("./canvasEmojiRichText") as typeof import("./canvasEmojiRichText");

function cleanDisplayText(value?, maxLength = 0) {
  const normalized = normalizeTextForCanvas(String(value || ""))
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .normalize("NFKC");
  if (maxLength > 0 && normalized.length > maxLength) {
    return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
  }
  return normalized;
}

function drawCircleImage(ctx?, image?, x?, y?, size?) {
  if (!image) return;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(image, x, y, size, size);
  ctx.restore();
}

function drawRoundedSquareImage(ctx?, image?, x?, y?, size?, radius = 3) {
  if (!image) return;
  const r = Math.min(radius, size / 2);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + size - r, y);
  ctx.quadraticCurveTo(x + size, y, x + size, y + r);
  ctx.lineTo(x + size, y + size - r);
  ctx.quadraticCurveTo(x + size, y + size, x + size - r, y + size);
  ctx.lineTo(x + r, y + size);
  ctx.quadraticCurveTo(x, y + size, x, y + size - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(image, x, y, size, size);
  ctx.restore();
}

function drawRoundedImage(ctx?, image?, x?, y?, width?, height?, radius = 6) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(image, x, y, width, height);
  ctx.restore();
}

/* skullCard1: card come l'anteprima "Come appare su Discord" del sito (angoli tondi, intestazione, riga ruolo) */
function roundRectPath(ctx?, x?, y?, w?, h?, r?) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function fitInside(sourceW?, sourceH?, maxW?, maxH?) {
  if (!sourceW || !sourceH) return { width: maxW, height: maxH };
  const ratio = Math.min(maxW / sourceW, maxH / sourceH, 1);
  return {
    width: Math.round(sourceW * ratio),
    height: Math.round(sourceH * ratio),
  };
}

/* skullItTime1: come Discord in italiano ("Oggi alle 21:30", "Ieri alle …", poi la data), ora di Roma */
function formatTimestamp(date?) {
  const tz = "Europe/Rome";
  const day = (d?) => new Intl.DateTimeFormat("it-IT", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const time = new Intl.DateTimeFormat("it-IT", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  const now = new Date();
  if (day(date) === day(now)) return `Oggi alle ${time}`;
  if (day(date) === day(new Date(now.getTime() - 86400000))) return `Ieri alle ${time}`;
  return `${day(date)} ${time}`;
}

/* skullNameGradient1: nome con i colori del ruolo (tinta, gradiente o olografico) come su Discord */
function nameFill(ctx?, colors?, x?, width?) {
  const list = (Array.isArray(colors) ? colors : []).filter((c?) => /^#[0-9a-f]{6}$/i.test(String(c || "")));
  if (list.length < 2) return list[0] || null;
  const g = ctx.createLinearGradient(x, 0, x + Math.max(1, width), 0);
  list.forEach((c?, i?) => g.addColorStop(i / (list.length - 1), c));
  return g;
}

function estimateReplyPrefixWidth(ctx?, reply?, replyName?) {
  let w = 0;
  if (reply.avatarUrl) w += 16 + 6;
  ctx.font = fontStack(12, "600");
  w += textWidth(ctx, replyName, 12, "600") + 5;
  if (reply.roleIconUrl) w += 14 + 5;
  return w;
}

export = async function renderSkullboardCanvas({
  avatarUrl,
  username,
  message,
  nameColor,
  nameColors,
  createdAt,
  reply,
  roleIconUrl,
  roleName,
  channelName,
  mediaUrl,
  hasMedia,
  hasEmbedOnly,
}) {
  if (!canvasModule) throw new Error("Canvas module not available");
  registerCanvasFonts(canvasModule);

  const width = 600;
  const outerPad = 14;
  const avatarSize = 40;
  const avatarToContentGap = 5;
  const contentX = outerPad + avatarSize + avatarToContentGap;
  const textMaxWidth = width - contentX - outerPad;
  const headerH = 32;
  const footerH = roleName ? 44 : 0;
  const topY = headerH + outerPad;
  const headerLineHeight = 20;
  const usernameToIconGap = 5;
  const roleIconSize = 14;
  const roleIconToTimestampGap = 5;

  const msgSize = 16.5;
  const msgWeight = "500";
  const msgLineHeight = 19;

  const probe = createCanvas(width, 10).getContext("2d");
  probe.font = fontStack(msgSize, msgWeight);

  const displayUsername = cleanDisplayText(username, 80);
  const displayMessage = cleanDisplayText(message);
  const messageLines = hasEmbedOnly
    ? []
    : wrapRichTextToLines(probe, displayMessage || "", textMaxWidth, msgSize, msgWeight);
  const maxMessageLines = 20;
  const clippedMessageLines = messageLines.slice(0, maxMessageLines);
  const messageTruncated = messageLines.length > maxMessageLines;
  const hasReply = Boolean(reply && (reply.content || reply.author));

  const replyNameForMeasure = cleanDisplayText(reply?.author || "Sconosciuto", 48) || "Sconosciuto";
  const replyContentRaw = cleanDisplayText(reply?.content || "", 400);
  let replyLines = [];
  let replyRowHeight = 20;
  if (hasReply) {
    const prefixW = estimateReplyPrefixWidth(probe, reply, replyNameForMeasure);
    const replyTextMax = Math.max(80, width - contentX - prefixW - outerPad - 4);
    probe.font = fontStack(12, "500");
    replyLines = wrapRichTextToLines(
      probe,
      replyContentRaw,
      replyTextMax,
      12,
      "500",
    ).slice(0, 2);
    if (!replyLines.length) replyLines = [""];
    replyRowHeight = replyLines.length > 1 ? 34 : 20;
  }

  let mediaImage = null;
  if (hasMedia && mediaUrl) {
    mediaImage = await safeLoadImage(mediaUrl, { timeoutMs: 15000, suppressWarning: true });
  }

  const replyTopPad = 2;
  const replyToHeaderGap = 6;
  let y = topY;
  const replyY = hasReply ? y + replyTopPad : null;
  const headerY = hasReply ? replyY + replyRowHeight + replyToHeaderGap : y;
  const avatarTop = headerY + headerLineHeight / 2 - avatarSize / 2;
  const messageY = headerY + 24;
  const messageH = clippedMessageLines.length ? clippedMessageLines.length * msgLineHeight : 0;
  y = messageY + messageH;
  if (messageTruncated) y += msgLineHeight;

  let mediaLayout = null;
  if (mediaImage) {
    const maxW = Math.min(420, textMaxWidth);
    const maxH = 420;
    const fitted = fitInside(mediaImage.width, mediaImage.height, maxW, maxH);
    mediaLayout = {
      x: contentX,
      y: y + 8,
      width: fitted.width,
      height: fitted.height,
    };
    y = mediaLayout.y + mediaLayout.height;
  }

  const height = Math.max(84 + headerH + footerH, y + outerPad + footerH);
  /* skullHiDpi1: disegno a doppia risoluzione, testo ed emoji restano nitidi anche ingranditi */
  const SCALE = 2;
  const canvas = createCanvas(width * SCALE, height * SCALE);
  const ctx = canvas.getContext("2d");
  ctx.scale(SCALE, SCALE);
  ctx.imageSmoothingQuality = "high";

  // card: fondo Discord, angoli tondi (fuori resta trasparente), bordo sottile
  const radius = 16;
  roundRectPath(ctx, 0.5, 0.5, width - 1, height - 1, radius);
  ctx.fillStyle = "#313338";
  ctx.fill();
  ctx.save();
  roundRectPath(ctx, 0.5, 0.5, width - 1, height - 1, radius);
  ctx.clip();
  // intestazione: SKULLBOARD · #canale
  ctx.fillStyle = "#2b2d31";
  ctx.fillRect(0, 0, width, headerH);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(0, headerH - 1, width, 1);
  await drawLabelWithEmoji(
    ctx,
    `SKULLBOARD${channelName ? ` · #${cleanDisplayText(channelName, 40).toUpperCase()}` : ""}`,
    outerPad + 2,
    headerH / 2,
    { size: 11, weight: "700", color: "#949ba4", align: "left", baseline: "middle", forcePrimaryFont: true },
  );
  // riga ruolo in fondo
  if (footerH) {
    const fy = height - footerH;
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.fillRect(0, fy, width, 1);
  }
  ctx.restore();
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 1;
  roundRectPath(ctx, 0.5, 0.5, width - 1, height - 1, radius);
  ctx.stroke();

  if (hasReply) {
    let rx = contentX;
    let replyTextStartX = contentX;
    const replyAvatarSize = 16;
    for (let li = 0; li < replyLines.length; li += 1) {
      const lineMidY =
        replyLines.length > 1
          ? replyY + 9 + li * 16
          : replyY + replyRowHeight / 2;

      if (li === 0) {
        rx = contentX;
        if (reply.avatarUrl) {
          const rAvatar = await safeLoadImage(reply.avatarUrl, { timeoutMs: 10000 });
          if (rAvatar) {
            const replyAvatarTop = lineMidY - replyAvatarSize / 2;
            drawCircleImage(ctx, rAvatar, rx, replyAvatarTop, replyAvatarSize);
            rx += replyAvatarSize + 6;
          }
        }

        ctx.font = fontStack(12, "600");
        const replyName = replyNameForMeasure;
        const replyNameColor = reply.nameColor || "#b9bbbe";
        drawTextWithSpecialFallback(ctx, replyName, rx, lineMidY, {
          size: 12,
          weight: "600",
          color: replyNameColor,
          forcePrimaryFont: true,
          baseline: "middle",
        });
        rx += textWidth(ctx, replyName, 12, "600") + 5;

        if (reply.roleIconUrl) {
          const replyIcon = await safeLoadImage(reply.roleIconUrl, { timeoutMs: 10000 });
          if (replyIcon) {
            const replyIconSize = 14;
            const replyIconTop = lineMidY - replyIconSize / 2;
            drawRoundedSquareImage(ctx, replyIcon, rx, replyIconTop, replyIconSize, 3);
            rx += replyIconSize + 5;
          }
        }
        replyTextStartX = rx;
      } else {
        rx = replyTextStartX;
      }

      const lineStr = replyLines[li] || "";
      await drawLabelWithEmoji(ctx, lineStr, rx, lineMidY, {
        size: 12,
        weight: "500",
        color: "#949ba4",
        forcePrimaryFont: true,
        baseline: "middle",
      });
    }

    const connStartX = outerPad + avatarSize / 2;
    const connStartY = avatarTop + avatarSize / 2;
    const connEndX = contentX - 8;
    const connEndY =
      replyLines.length > 1 ? replyY + 9 : replyY + replyRowHeight / 2;
    const radius = 7;

    ctx.strokeStyle = "#4e5058";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(connStartX, connStartY);
    ctx.lineTo(connStartX, connEndY + radius);
    ctx.quadraticCurveTo(connStartX, connEndY, connStartX + radius, connEndY);
    ctx.lineTo(connEndX, connEndY);
    ctx.stroke();
  }

  const avatar = await safeLoadImage(avatarUrl, { timeoutMs: 12000 });
  if (avatar) {
    drawCircleImage(ctx, avatar, outerPad, avatarTop, avatarSize);
  } else {
    ctx.beginPath();
    ctx.arc(
      outerPad + avatarSize / 2,
      avatarTop + avatarSize / 2,
      avatarSize / 2,
      0,
      Math.PI * 2,
    );
    ctx.closePath();
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fill();
  }

  ctx.textBaseline = "top";
  const usernameSize = 16.5;
  const usernameWeight = "600";
  /* skullNameEmoji1: emoji del nick come immagini a colori (Twemoji), il gradiente colora solo il testo */
  const nameText = cleanDisplayText(displayUsername || "");
  const usernameWidth = measureRichTextWidth(ctx, nameText, usernameSize, usernameWeight);
  const userColor = nameFill(ctx, nameColors, contentX, usernameWidth) || nameColor || "#f2f3f5";
  await drawLabelWithEmoji(ctx, nameText, contentX, headerY + headerLineHeight / 2, {
    size: usernameSize,
    weight: usernameWeight,
    color: userColor,
    align: "left",
    baseline: "middle",
  });
  let cursorX = contentX + usernameWidth + usernameToIconGap;
  if (roleIconUrl) {
    const roleIcon = await safeLoadImage(roleIconUrl, { timeoutMs: 10000 });
    if (roleIcon) {
      const iconTop = headerY + (headerLineHeight - roleIconSize) / 2;
      drawRoundedSquareImage(ctx, roleIcon, cursorX, iconTop, roleIconSize, 3);
      cursorX += roleIconSize + roleIconToTimestampGap;
    }
  }
  const timestampY = headerY + (headerLineHeight - 12) / 2;
  drawTextWithSpecialFallback(
    ctx,
    formatTimestamp(createdAt || new Date()),
    cursorX,
    timestampY,
    {
      size: 12,
      weight: "500",
      color: "#949ba4",
      forcePrimaryFont: true,
    },
  );

  if (clippedMessageLines.length) {
    let lineY = messageY;
    for (const line of clippedMessageLines) {
      await drawLabelWithEmoji(ctx, line, contentX, lineY + msgLineHeight / 2, {
        size: msgSize,
        weight: msgWeight,
        color: "#dbdee1",
        forcePrimaryFont: true,
        baseline: "middle",
      });
      lineY += msgLineHeight;
    }
    if (messageTruncated) {
      await drawLabelWithEmoji(ctx, "...", contentX, lineY + msgLineHeight / 2, {
        size: msgSize,
        weight: msgWeight,
        color: "#949ba4",
        forcePrimaryFont: true,
        baseline: "middle",
      });
    }
  }

  if (mediaLayout && mediaImage) {
    drawRoundedImage(
      ctx,
      mediaImage,
      mediaLayout.x,
      mediaLayout.y,
      mediaLayout.width,
      mediaLayout.height,
      4,
    );
  }

  if (footerH) {
    const fy = height - footerH;
    const midY = fy + footerH / 2;
    ctx.textBaseline = "middle";
    drawTextWithSpecialFallback(ctx, "RUOLO", outerPad + 2, midY, {
      size: 11,
      weight: "700",
      color: "#949ba4",
      forcePrimaryFont: true,
      baseline: "middle",
    });
    ctx.font = fontStack(11, "700");
    let px = outerPad + 2 + ctx.measureText("RUOLO").width + 10;
    const roleText = cleanDisplayText(roleName, 60);
    const textW = measureRichTextWidth(ctx, roleText, 12.5, "600");
    let roleIconImg = null;
    if (roleIconUrl) roleIconImg = await safeLoadImage(roleIconUrl, { timeoutMs: 10000 });
    const pillH = 24;
    const pillW = 8 + 12 + 6 + (roleIconImg ? 14 + 5 : 0) + textW + 10;
    roundRectPath(ctx, px, midY - pillH / 2, pillW, pillH, 4);
    ctx.fillStyle = "#232428";
    ctx.fill();
    let cx = px + 8;
    ctx.beginPath();
    ctx.arc(cx + 6, midY, 6, 0, Math.PI * 2);
    ctx.fillStyle = nameFill(ctx, nameColors, cx, 12) || nameColor || "#99aab5";
    ctx.fill();
    cx += 12 + 6;
    if (roleIconImg) {
      drawRoundedSquareImage(ctx, roleIconImg, cx, midY - 7, 14, 3);
      cx += 14 + 5;
    }
    await drawLabelWithEmoji(ctx, roleText, cx, midY, {
      size: 12.5,
      weight: "600",
      color: "#dbdee1",
      align: "left",
      baseline: "middle",
    });
  }

  return canvas.toBuffer("image/png");
};