const canvasModule = require("canvas");
const { createCanvas } = canvasModule;
const { registerCanvasFonts, drawTextWithSpecialFallback } = require("./canvasFonts");
const { safeLoadImage } = require("./safeLoadImage");
const { mergeRankCardTheme } = require("./rankCardTheme");

function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function hexToRgba(hex, alpha) {
  const body = String(hex || "#000000").replace("#", "");
  const norm = body.length === 6 ? body : "000000";
  const r = parseInt(norm.slice(0, 2), 16);
  const g = parseInt(norm.slice(2, 4), 16);
  const b = parseInt(norm.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

module.exports = async function renderRankCanvas({
  username,
  avatarUrl,
  level,
  totalExp,
  currentLevelExp,
  nextLevelExp,
  progressPercent,
  weeklyRank,
  allTimeRank,
  weeklyExp = 0,
  multiplier = 1,
  hideLeaderboardRanks = false,
  theme,
}) {
  registerCanvasFonts(canvasModule);
  const palette = mergeRankCardTheme(theme || {});
  const width = 1100;
  const height = hideLeaderboardRanks ? 320 : 430;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const wallpaper = await safeLoadImage(palette.wallpaperUrl);
  if (wallpaper) {
    ctx.drawImage(wallpaper, 0, 0, width, height);
  } else {
    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, "#232149");
    bg.addColorStop(0.6, "#123d78");
    bg.addColorStop(1, "#1b7892");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
  }

  const haze = ctx.createRadialGradient(width * 0.18, height * 0.18, 30, width * 0.18, height * 0.18, 320);
  haze.addColorStop(0, "rgba(255,255,255,0.16)");
  haze.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, width, height);

  const cardX = 34;
  const cardY = 28;
  const cardW = width - 68;
  const cardH = height - 56;

  roundedRect(ctx, cardX, cardY, cardW, cardH, 28);
  ctx.fillStyle = hexToRgba(palette.panelColor, palette.overlayOpacity);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 2;
  ctx.stroke();

  const heroX = cardX + 168;
  const heroY = cardY + 34;
  const heroW = cardW - 212;
  const heroH = 162;

  roundedRect(ctx, heroX, heroY, heroW, heroH, 26);
  ctx.fillStyle = hexToRgba(palette.panelColor, Math.min(1, palette.overlayOpacity + 0.08));
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.shadowColor = "rgba(0,0,0,0.22)";
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 8;
  roundedRect(ctx, heroX, heroY, heroW, heroH, 26);
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.stroke();
  ctx.shadowColor = "transparent";

  const avatarSize = 140;
  const avatarX = cardX + 38;
  const avatarY = heroY + 30;
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.shadowColor = hexToRgba(palette.ringColor, 0.68);
  ctx.shadowBlur = 26;
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fill();
  ctx.restore();

  if (avatarUrl) {
    const avatar = await safeLoadImage(avatarUrl);
    if (avatar) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 - 10, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatar, avatarX + 10, avatarY + 10, avatarSize - 20, avatarSize - 20);
      ctx.restore();
    }
  }
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
  ctx.lineWidth = 6;
  ctx.strokeStyle = palette.ringColor;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 - 8, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.stroke();

  const safeName = String(username || "utente").trim() || "utente";
  drawTextWithSpecialFallback(ctx, safeName, heroX + 36, heroY + 50, {
    size: 58,
    weight: "800",
    color: palette.primaryTextColor,
    align: "left",
    baseline: "middle",
    forcePrimaryFont: true,
  });
  drawTextWithSpecialFallback(ctx, "·", heroX + 430, heroY + 50, {
    size: 34,
    weight: "700",
    color: palette.secondaryTextColor,
    align: "center",
    baseline: "middle",
    forcePrimaryFont: true,
  });
  drawTextWithSpecialFallback(ctx, "Lv. " + String(level || 0), heroX + 468, heroY + 50, {
    size: 42,
    weight: "700",
    color: palette.secondaryTextColor,
    align: "left",
    baseline: "middle",
    forcePrimaryFont: true,
  });

  const multText = "x" + Number(multiplier || 1).toFixed(1);
  roundedRect(ctx, heroX + 720, heroY + 26, 90, 54, 24);
  ctx.strokeStyle = palette.multiplierColor;
  ctx.lineWidth = 3;
  ctx.stroke();
  drawTextWithSpecialFallback(ctx, multText, heroX + 765, heroY + 54, {
    size: 28,
    weight: "800",
    color: palette.multiplierColor,
    align: "center",
    baseline: "middle",
    forcePrimaryFont: true,
  });

  const barX = heroX + 36;
  const barY = heroY + 94;
  const barW = heroW - 240;
  const barH = 28;
  roundedRect(ctx, barX, barY, barW, barH, 14);
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  ctx.fill();
  const fillW = Math.max(18, Math.round(barW * Math.max(0, Math.min(100, Number(progressPercent || 0))) / 100));
  const fill = ctx.createLinearGradient(barX, barY, barX + barW, barY);
  fill.addColorStop(0, palette.progressStartColor);
  fill.addColorStop(1, palette.progressEndColor);
  roundedRect(ctx, barX, barY, fillW, barH, 14);
  ctx.fillStyle = fill;
  ctx.shadowColor = hexToRgba(palette.progressEndColor, 0.45);
  ctx.shadowBlur = 16;
  ctx.fill();
  ctx.shadowColor = "transparent";
  drawTextWithSpecialFallback(
    ctx,
    `${Math.max(0, Math.floor(Number(currentLevelExp || 0)))} / ${Math.max(0, Math.floor(Number(nextLevelExp || 0)))} XP`,
    barX + barW / 2,
    barY + barH / 2 + 1,
    {
      size: 22,
      weight: "800",
      color: "#ffffff",
      align: "center",
      baseline: "middle",
      forcePrimaryFont: true,
    },
  );

  const rankBoxW = 130;
  const rankBoxH = 88;
  const rankBoxX = heroX + heroW - rankBoxW - 24;
  const rankBoxY = heroY + 18;
  roundedRect(ctx, rankBoxX, rankBoxY, rankBoxW, rankBoxH, 20);
  ctx.strokeStyle = palette.rankBoxBorderColor;
  ctx.lineWidth = 4;
  ctx.stroke();
  drawTextWithSpecialFallback(ctx, allTimeRank ? "#" + String(allTimeRank) : "-", rankBoxX + rankBoxW / 2, rankBoxY + 34, {
    size: 36,
    weight: "800",
    color: palette.rankBoxBorderColor,
    align: "center",
    baseline: "middle",
    forcePrimaryFont: true,
  });
  drawTextWithSpecialFallback(ctx, "RANK", rankBoxX + rankBoxW / 2, rankBoxY + 66, {
    size: 22,
    weight: "700",
    color: palette.valueColor,
    align: "center",
    baseline: "middle",
    forcePrimaryFont: true,
  });

  if (!hideLeaderboardRanks) {
    const statY = heroY + heroH + 18;
    const statW = 240;
    const statH = 72;
    const gap = 16;
    const firstX = heroX;
    const items = [
      { label: "WEEKLY RANK", value: weeklyRank ? "#" + String(weeklyRank) : "-", accent: palette.valueColor },
      { label: "WEEKLY XP", value: String(Math.max(0, Math.floor(Number(weeklyExp || 0)))), accent: palette.valueColor },
      { label: "MULTIPLIER", value: multText, accent: palette.valueColor },
    ];

    for (let i = 0; i < items.length; i += 1) {
      const x = firstX + i * (statW + gap);
      roundedRect(ctx, x, statY, statW, statH, 18);
      ctx.fillStyle = hexToRgba(palette.panelColor, Math.min(1, palette.overlayOpacity + 0.06));
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = palette.labelColor;
      ctx.fillRect(x + 14, statY + 18, 4, statH - 36);
      drawTextWithSpecialFallback(ctx, items[i].label, x + 34, statY + 24, {
        size: 18,
        weight: "700",
        color: palette.labelColor,
        align: "left",
        baseline: "middle",
        forcePrimaryFont: true,
      });
      drawTextWithSpecialFallback(ctx, items[i].value, x + 34, statY + 48, {
        size: 28,
        weight: "800",
        color: items[i].accent,
        align: "left",
        baseline: "middle",
        forcePrimaryFont: true,
      });
    }
  }

  return canvas.toBuffer("image/png");
};
