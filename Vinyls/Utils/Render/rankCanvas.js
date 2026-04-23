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

function drawStatIcon(ctx, icon, x, y, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (icon === "trophy") {
    y -= 4;
    ctx.beginPath();
    ctx.moveTo(x - 8, y - 8);
    ctx.lineTo(x + 8, y - 8);
    ctx.lineTo(x + 6, y + 2);
    ctx.quadraticCurveTo(x, y + 7, x - 6, y + 2);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - 11, y - 6);
    ctx.quadraticCurveTo(x - 18, y - 4, x - 15, y + 4);
    ctx.moveTo(x + 11, y - 6);
    ctx.quadraticCurveTo(x + 18, y - 4, x + 15, y + 4);
    ctx.stroke();
    ctx.fillRect(x - 2, y + 6, 4, 8);
    ctx.fillRect(x - 10, y + 15, 20, 4);
  } else if (icon === "bolt") {
    ctx.beginPath();
    ctx.moveTo(x + 4, y - 17);
    ctx.lineTo(x - 8, y + 1);
    ctx.lineTo(x + 1, y + 1);
    ctx.lineTo(x - 4, y + 17);
    ctx.lineTo(x + 10, y - 3);
    ctx.lineTo(x + 1, y - 3);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const radius = i % 2 === 0 ? 15 : 6;
      const angle = -Math.PI / 2 + (i * Math.PI) / 5;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawStatPill(ctx, x, y, width, height, icon, label, value, palette, panelAlpha) {
  roundedRect(ctx, x, y, width, height, 10);
  ctx.fillStyle = hexToRgba(palette.panelColor, panelAlpha);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.save();
  roundedRect(ctx, x, y, width, height, 10);
  ctx.clip();
  ctx.fillStyle = palette.primaryTextColor;
  ctx.fillRect(x, y, 4, height);
  ctx.restore();

  drawStatIcon(ctx, icon, x + 28, y + height / 2, palette.primaryTextColor);

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
    x: 0,
    y: 0,
    w: width,
    h: height,
    r: 16,
  };

  ctx.save();
  roundedRect(ctx, card.x, card.y, card.w, card.h, card.r);
  ctx.clip();
  await drawWallpaper(ctx, card.x, card.y, card.w, card.h, palette);
  ctx.fillStyle = hexToRgba(palette.panelColor, panelAlpha * 0.55);
  ctx.fillRect(card.x, card.y, card.w, card.h);
  ctx.restore();

  const padX = 23;
  const padTop = 22;
  const hero = {
    x: padX,
    y: padTop,
    w: width - padX * 2,
    h: 147,
    r: 18,
  };

  roundedRect(ctx, hero.x, hero.y, hero.w, hero.h, hero.r);
  ctx.fillStyle = hexToRgba(palette.panelColor, panelAlpha);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 2;
  ctx.stroke();

  const heroPadX = 16;
  const heroGap = 17;
  const avatarColW = 138;
  const rankBoxW = 109;
  const rankBoxH = 88;
  const avatarSize = 122;
  const avatarX = hero.x + heroPadX + (avatarColW - avatarSize) / 2;
  const avatarY = hero.y + (hero.h - avatarSize) / 2;
  await drawAvatar(ctx, data.avatarUrl, avatarX, avatarY, avatarSize, palette);

  const copyX = hero.x + heroPadX + avatarColW + heroGap;
  const rankBoxX = hero.x + hero.w - heroPadX - rankBoxW;
  const rankBoxY = hero.y + Math.round((hero.h - rankBoxH) / 2);
  const copyW = rankBoxX - copyX - heroGap;
  const topY = hero.y + 39;

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
  drawProgressBar(ctx, copyX, hero.y + 92, copyW, 18, data.progressPercent, currentProgressExp, targetProgressExp, palette);

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

  const statsY = hero.y + hero.h + 16;
  const statH = 60;
  const gap = 15;
  const statsTotalW = 660;
  const statW = Math.floor((statsTotalW - gap * 2) / 3);
  const statsX = Math.round((width - statsTotalW) / 2);
  const weeklyRankValue = data.hideLeaderboardRanks ? "-" : formatRankValue(data.weeklyRank);

  drawStatPill(ctx, statsX, statsY, statW, statH, "trophy", "Weekly rank", weeklyRankValue, palette, panelAlpha);
  drawStatPill(ctx, statsX + statW + gap, statsY, statW, statH, "bolt", "Weekly XP", formatInt(data.weeklyExp), palette, panelAlpha);
  drawStatPill(ctx, statsX + (statW + gap) * 2, statsY, statW, statH, "star", "Multiplier", multiplierText, palette, panelAlpha);

  return canvas.toBuffer("image/png");
}

module.exports = renderRankCanvas;
module.exports.renderRankCanvas = renderRankCanvas;
