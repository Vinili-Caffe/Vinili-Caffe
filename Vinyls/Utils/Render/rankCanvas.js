const canvasModule = require("canvas");
const { createCanvas } = canvasModule;
const { registerCanvasFonts } = require("./canvasFonts");
const { safeLoadImage } = require("./safeLoadImage");
const { mergeRankCardTheme, resolveRankCardWallpaper } = require("./rankCardTheme");

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function hexToRgba(hex, alpha = 1) {
  const fallback = [22, 27, 38];
  const normalized = String(hex || "").replace("#", "").trim();
  const full = normalized.length === 3
    ? normalized.split("").map((char) => `${char}${char}`).join("")
    : normalized;
  const value = /^[0-9a-f]{6}$/i.test(full) ? full : null;
  const rgb = value
    ? [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)]
    : fallback;

  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${clamp(alpha, 0, 1)})`;
}

function formatInt(value) {
  const number = Number(value) || 0;
  return Math.max(0, Math.floor(number)).toLocaleString("it-IT");
}

function canvasFont(size, weight = 700) {
  const cssWeight = Number(weight) >= 700 ? "bold" : "normal";
  return `${cssWeight} ${size}px Arial, sans-serif`;
}

function ellipsize(ctx, text, maxWidth) {
  const safeText = String(text || "");
  if (ctx.measureText(safeText).width <= maxWidth) return safeText;

  let low = 0;
  let high = safeText.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = `${safeText.slice(0, mid)}...`;
    if (ctx.measureText(candidate).width <= maxWidth) low = mid;
    else high = mid - 1;
  }

  return `${safeText.slice(0, Math.max(0, low))}...`;
}

function drawText(ctx, text, x, y, options = {}) {
  const {
    size = 28,
    weight = 700,
    color = "#ffffff",
    align = "left",
    baseline = "middle",
  } = options;

  ctx.font = canvasFont(size, weight);
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillStyle = color;

  ctx.fillText(String(text ?? ""), x, y);
}

function drawCoverImage(ctx, image, x, y, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const drawX = x + (width - drawWidth) / 2;
  const drawY = y + (height - drawHeight) / 2;
  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

async function drawAvatar(ctx, avatarUrl, x, y, size, palette) {
  const cx = x + size / 2;
  const cy = y + size / 2;
  const radius = size / 2;

  ctx.save();
  ctx.shadowColor = palette.ringColor;
  ctx.shadowBlur = 22;
  ctx.fillStyle = palette.ringColor;
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();

  const avatar = avatarUrl ? await safeLoadImage(avatarUrl) : null;
  if (avatar) {
    drawCoverImage(ctx, avatar, x, y, size, size);
  } else {
    const fallback = ctx.createLinearGradient(x, y, x + size, y + size);
    fallback.addColorStop(0, "#2c3656");
    fallback.addColorStop(1, "#111827");
    ctx.fillStyle = fallback;
    ctx.fillRect(x, y, size, size);
  }
  ctx.restore();

  ctx.save();
  ctx.lineWidth = 6;
  ctx.strokeStyle = palette.ringColor;
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.65)";
  ctx.beginPath();
  ctx.arc(cx, cy, radius - 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawProgressBar(ctx, x, y, width, height, progressPercent, currentExp, targetExp, palette) {
  const progress = clamp(progressPercent, 0, 100) / 100;

  roundedRect(ctx, x, y, width, height, height / 2);
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fill();

  if (progress > 0) {
    ctx.save();
    roundedRect(ctx, x, y, width, height, height / 2);
    ctx.clip();
    const gradient = ctx.createLinearGradient(x, y, x + width, y);
    gradient.addColorStop(0, palette.progressStartColor);
    gradient.addColorStop(1, palette.progressEndColor);
    ctx.shadowColor = palette.progressEndColor;
    ctx.shadowBlur = 14;
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, Math.max(height, width * progress), height);
    ctx.restore();
  }

  drawText(ctx, `${formatInt(currentExp)} / ${formatInt(targetExp)} XP`, x + width / 2, y + height / 2 + 1, {
    size: 16,
    weight: 800,
    color: palette.valueColor,
    align: "center",
  });
}

function drawStatPill(ctx, x, y, width, height, icon, label, value, palette, panelAlpha) {
  roundedRect(ctx, x, y, width, height, 10);
  ctx.fillStyle = hexToRgba(palette.panelColor, panelAlpha);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.save();
  ctx.fillStyle = palette.primaryTextColor;
  ctx.font = canvasFont(22, 900);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(icon, x + 28, y + height / 2);
  ctx.restore();

  drawText(ctx, label.toUpperCase(), x + 56, y + 18, {
    size: 11,
    weight: 800,
    color: palette.labelColor,
    align: "left",
  });
  drawText(ctx, value, x + 56, y + 36, {
    size: 17,
    weight: 900,
    color: palette.valueColor,
    align: "left",
  });
}

function formatRankValue(value) {
  const n = Math.max(1, Math.floor(Number(value || 1)));
  return `#${formatInt(n)}`;
}

async function drawWallpaper(ctx, x, y, width, height, palette) {
  const wallpaper = resolveRankCardWallpaper(palette);
  const image = wallpaper ? await safeLoadImage(wallpaper) : null;

  if (image) {
    drawCoverImage(ctx, image, x, y, width, height);
    return;
  }

  const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
  gradient.addColorStop(0, "#1a1f36");
  gradient.addColorStop(0.55, "#123f78");
  gradient.addColorStop(1, "#006777");
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, width, height);
}

async function renderRankCanvas(data) {
  registerCanvasFonts(canvasModule);

  const palette = mergeRankCardTheme(data.theme || {});
  const legacyYellow = String(palette.rankBoxBorderColor || "").toLowerCase() === "#ffcb05";
  const rankBoxColor = legacyYellow ? palette.valueColor : palette.rankBoxBorderColor;
  const width = 976;
  const height = 276;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const panelAlpha = clamp(palette.overlayOpacity, 0, 1);

  ctx.clearRect(0, 0, width, height);

  const card = {
    x: 24,
    y: 24,
    w: width - 48,
    h: height - 48,
    r: 16,
  };

  ctx.save();
  roundedRect(ctx, card.x, card.y, card.w, card.h, card.r);
  ctx.clip();
  await drawWallpaper(ctx, card.x, card.y, card.w, card.h, palette);
  ctx.fillStyle = hexToRgba(palette.panelColor, panelAlpha * 0.55);
  ctx.fillRect(card.x, card.y, card.w, card.h);
  ctx.restore();

  const main = {
    x: card.x + 148,
    y: card.y + 24,
    w: card.w - 190,
    h: 154,
    r: 18,
  };

  roundedRect(ctx, main.x, main.y, main.w, main.h, main.r);
  ctx.fillStyle = hexToRgba(palette.panelColor, panelAlpha);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 2;
  ctx.stroke();

  const avatarSize = 118;
  const avatarX = card.x + 42;
  const avatarY = card.y + 58;
  await drawAvatar(ctx, data.avatarUrl, avatarX, avatarY, avatarSize, palette);

  const copyX = main.x + 24;
  const rankBoxW = 98;
  const rankBoxH = 82;
  const rankBoxX = main.x + main.w - rankBoxW - 18;
  const rankBoxY = main.y + 18;
  const copyW = rankBoxX - copyX - 36;
  const topY = main.y + 45;

  const levelText = `Lv. ${formatInt(data.level)}`;
  ctx.font = canvasFont(28, 850);
  const levelWidth = ctx.measureText(levelText).width;
  ctx.font = canvasFont(38, 900);
  const username = ellipsize(ctx, data.username || "utente", Math.max(220, copyW - levelWidth - 62));
  const usernameWidth = ctx.measureText(username).width;

  drawText(ctx, username, copyX, topY, {
    size: 38,
    weight: 900,
    color: palette.primaryTextColor,
  });
  drawText(ctx, "-", copyX + usernameWidth + 24, topY + 1, {
    size: 20,
    weight: 900,
    color: palette.secondaryTextColor,
  });
  drawText(ctx, levelText, copyX + usernameWidth + 58, topY + 1, {
    size: 28,
    weight: 850,
    color: palette.secondaryTextColor,
  });

  const multiplierText = `x${Number(data.multiplier || 1).toFixed(1)}`;
  const multiplierX = Math.min(copyX + usernameWidth + levelWidth + 94, copyX + copyW - 74);
  roundedRect(ctx, multiplierX, topY - 17, 62, 30, 15);
  ctx.fillStyle = "rgba(0,0,0,0.14)";
  ctx.fill();
  ctx.strokeStyle = palette.multiplierColor;
  ctx.lineWidth = 2;
  ctx.stroke();
  drawText(ctx, multiplierText, multiplierX + 31, topY - 2, {
    size: 15,
    weight: 900,
    color: palette.multiplierColor,
    align: "center",
  });

  const currentLevelExp = Math.max(0, Number(data.currentLevelExp || 0));
  const nextLevelExp = Math.max(currentLevelExp + 1, Number(data.nextLevelExp || currentLevelExp + 1));
  const currentProgressExp = Math.max(0, Number(data.totalExp || 0) - currentLevelExp);
  const targetProgressExp = Math.max(1, nextLevelExp - currentLevelExp);
  drawProgressBar(ctx, copyX, main.y + 92, copyW, 18, data.progressPercent, currentProgressExp, targetProgressExp, palette);

  roundedRect(ctx, rankBoxX, rankBoxY, rankBoxW, rankBoxH, 16);
  ctx.fillStyle = hexToRgba(palette.panelColor, panelAlpha);
  ctx.fill();
  ctx.strokeStyle = rankBoxColor;
  ctx.lineWidth = 4;
  ctx.stroke();

  const rankText = data.hideLeaderboardRanks ? "-" : formatRankValue(data.allTimeRank);
  drawText(ctx, rankText, rankBoxX + rankBoxW / 2, rankBoxY + 33, {
    size: rankText.length > 7 ? 24 : 28,
    weight: 950,
    color: rankBoxColor,
    align: "center",
  });
  drawText(ctx, "RANK", rankBoxX + rankBoxW / 2, rankBoxY + 66, {
    size: 12,
    weight: 900,
    color: palette.labelColor,
    align: "center",
  });

  const statsY = main.y + main.h + 16;
  const statH = 46;
  const gap = 12;
  const statW = 150;
  const weeklyRankValue = data.hideLeaderboardRanks ? "-" : formatRankValue(data.weeklyRank);

  drawStatPill(ctx, main.x, statsY, statW, statH, "T", "Weekly rank", weeklyRankValue, palette, panelAlpha);
  drawStatPill(ctx, main.x + statW + gap, statsY, statW, statH, "/", "Weekly XP", formatInt(data.weeklyExp), palette, panelAlpha);
  drawStatPill(ctx, main.x + (statW + gap) * 2, statsY, statW, statH, "*", "Multiplier", multiplierText, palette, panelAlpha);

  return canvas.toBuffer("image/png");
}

module.exports = renderRankCanvas;
module.exports.renderRankCanvas = renderRankCanvas;
