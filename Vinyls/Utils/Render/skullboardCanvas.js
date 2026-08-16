const canvasModule = require("canvas");
const { registerCanvasFonts, fontStack, drawTextWithSpecialFallback } = require("./canvasFonts");
const { createCanvas } = canvasModule;
const { safeLoadImage } = require("./safeLoadImage");
const { normalizeTextForCanvas } = require("./canvasUtils");
const {
  drawLabelWithEmoji,
  wrapRichTextToLines,
  textWidth,
} = require("./canvasEmojiRichText");

function cleanDisplayText(value, maxLength = 0) {
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

function drawCircleImage(ctx, image, x, y, size) {
  if (!image) return;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(image, x, y, size, size);
  ctx.restore();
}

function drawRoundedSquareImage(ctx, image, x, y, size, radius = 3) {
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

function drawRoundedImage(ctx, image, x, y, width, height, radius = 6) {
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

function fitInside(sourceW, sourceH, maxW, maxH) {
  if (!sourceW || !sourceH) return { width: maxW, height: maxH };
  const ratio = Math.min(maxW / sourceW, maxH / sourceH, 1);
  return {
    width: Math.round(sourceW * ratio),
    height: Math.round(sourceH * ratio),
  };
}

function formatTimestamp(date) {
  const opts = { hour: "2-digit", minute: "2-digit", hour12: true };
  const time = new Intl.DateTimeFormat("en-US", opts).format(date);
  return `Today at ${time}`;
}

function estimateReplyPrefixWidth(ctx, reply, replyName) {
  let w = 0;
  if (reply.avatarUrl) w += 16 + 6;
  ctx.font = fontStack(12, "600");
  w += textWidth(ctx, replyName, 12, "600") + 5;
  if (reply.roleIconUrl) w += 14 + 5;
  return w;
}

module.exports = async function renderSkullboardCanvas({
  avatarUrl,
  username,
  message,
  nameColor,
  createdAt,
  reply,
  roleIconUrl,
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
  const topY = outerPad;
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

  const height = Math.max(84, y + outerPad);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#313338";
  ctx.fillRect(0, 0, width, height);

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

  const userColor = nameColor || "#f2f3f5";
  ctx.textBaseline = "top";
  const usernameSize = 16.5;
  const usernameWeight = "600";
  drawTextWithSpecialFallback(ctx, cleanDisplayText(displayUsername || ""), contentX, headerY, {
    size: usernameSize,
    weight: usernameWeight,
    color: userColor,
  });

  ctx.font = fontStack(usernameSize, usernameWeight);
  const usernameWidth = ctx.measureText(cleanDisplayText(displayUsername || "")).width;
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
      color: "#b5bac1",
      forcePrimaryFont: true,
    },
  );

  if (clippedMessageLines.length) {
    let lineY = messageY;
    for (const line of clippedMessageLines) {
      await drawLabelWithEmoji(ctx, line, contentX, lineY + msgLineHeight / 2, {
        size: msgSize,
        weight: msgWeight,
        color: "#f2f3f5",
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

  return canvas.toBuffer("image/png");
};