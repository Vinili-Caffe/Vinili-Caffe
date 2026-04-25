const canvasModule = require("canvas");
const { createCanvas } = canvasModule;

/** `canvas.Path2D` manca o non è costruibile in alcuni ambienti (mock, runtime non standard, build nativa vecchia). */
let path2dCtorMemo;
function getPath2DConstructor() {
  if (path2dCtorMemo !== undefined) return path2dCtorMemo;
  const candidates = [
    canvasModule.Path2D,
    typeof globalThis !== "undefined" ? globalThis.Path2D : null,
  ];
  for (const Ctor of candidates) {
    if (typeof Ctor !== "function") continue;
    try {
      const probe = new Ctor("M0 0 L1 0 L1 1 Z");
      if (probe) {
        path2dCtorMemo = Ctor;
        return Ctor;
      }
    } catch {
      /* prova il prossimo candidato */
    }
  }
  path2dCtorMemo = null;
  return null;
}

function fillPath2D(ctx, d) {
  const Ctor = getPath2DConstructor();
  if (!Ctor) return false;
  try {
    ctx.fill(new Ctor(d));
    return true;
  } catch {
    return false;
  }
}

function strokePath2D(ctx, d, lineWidth) {
  const Ctor = getPath2DConstructor();
  if (!Ctor) return false;
  try {
    ctx.lineWidth = lineWidth;
    ctx.stroke(new Ctor(d));
    return true;
  } catch {
    return false;
  }
}

/** Icone stat in spazio 32×32 (stesso sistema di drawStatIcon dopo translate/scale). */
function drawStatIconGeometric(ctx, icon) {
  if (icon === "bolt") {
    ctx.beginPath();
    ctx.moveTo(19, 1);
    ctx.lineTo(8, 16);
    ctx.lineTo(15, 16);
    ctx.lineTo(12, 31);
    ctx.lineTo(24, 14);
    ctx.lineTo(17, 14);
    ctx.closePath();
    ctx.fill();
    return;
  }
  if (icon === "star") {
    const cx = 16;
    const cy = 16;
    const spikes = 5;
    const outer = 9;
    const inner = 4;
    const step = Math.PI / spikes;
    let rot = -Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(rot) * outer, cy + Math.sin(rot) * outer);
    for (let i = 0; i < spikes; i++) {
      rot += step;
      ctx.lineTo(cx + Math.cos(rot) * inner, cy + Math.sin(rot) * inner);
      rot += step;
      ctx.lineTo(cx + Math.cos(rot) * outer, cy + Math.sin(rot) * outer);
    }
    ctx.closePath();
    ctx.fill();
    return;
  }
  /* trophy */
  ctx.beginPath();
  ctx.moveTo(8, 10);
  ctx.quadraticCurveTo(16, 5, 24, 10);
  ctx.lineTo(22, 19);
  ctx.quadraticCurveTo(16, 26, 10, 19);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  ctx.moveTo(6, 8);
  ctx.quadraticCurveTo(6, 6, 9, 7);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(26, 8);
  ctx.quadraticCurveTo(26, 6, 23, 7);
  ctx.stroke();
  ctx.fillRect(14, 20, 4, 6);
  ctx.fillRect(8, 26, 16, 3.6);
}
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

/** Same SVG paths as WebSite/js/user-rank-customize-page.js (previewStatIcon), scaled to canvas. */
function drawStatIcon(ctx, icon, x, y, color) {
  const scale = 0.8;
  ctx.save();
  ctx.translate(x, y);
  if (icon === "trophy") ctx.translate(0, -2);
  ctx.scale(scale, scale);
  ctx.translate(-16, -16);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  let useVectors = false;
  if (icon === "trophy") {
    useVectors =
      fillPath2D(ctx, "M8 6h16l-2 10c-1.2 3-4.1 5-6 5s-4.8-2-6-5L8 6Z") &&
      strokePath2D(ctx, "M6 8c-2.9.4-4.8 2-4.8 4.7 0 3.4 2.8 5.8 6.7 5.8M26 8c2.9.4 4.8 2 4.8 4.7 0 3.4-2.8 5.8-6.7 5.8", 2.8) &&
      fillPath2D(ctx, "M14 20h4v6h-4z") &&
      fillPath2D(ctx, "M8 26h16v3.6H8z");
  } else if (icon === "bolt") {
    useVectors = fillPath2D(ctx, "M19 1 8 16h7l-3 15 12-17h-7l2-13Z");
  } else {
    useVectors = fillPath2D(ctx, "m16 2 3.8 8 8.7 1-6.5 5.7 1.8 8.5L16 21l-7.8 5.2 1.8-8.5L3.5 11l8.7-1L16 2Z");
  }

  if (!useVectors) drawStatIconGeometric(ctx, icon);
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

/** Preset wallpapers on the site use SVG data URLs. */
function isSvgDataUrlWallpaper(url) {
  return /^data:image\/svg\+xml/i.test(String(url || ""));
}

function isGifDataUrlWallpaper(url) {
  return /^data:image\/gif;base64,/i.test(String(url || ""));
}

function decodeSvgDataUrlToBuffer(dataUrl) {
  const raw = String(dataUrl || "");
  const comma = raw.indexOf(",");
  if (comma < 0) return null;
  const header = raw.slice(0, comma).toLowerCase();
  if (!header.includes("svg")) return null;
  const payload = raw.slice(comma + 1);
  try {
    if (header.includes("base64")) {
      return Buffer.from(payload.replace(/\s/g, ""), "base64");
    }
    return Buffer.from(decodeURIComponent(payload), "utf8");
  } catch {
    try {
      return Buffer.from(payload, "utf8");
    } catch {
      return null;
    }
  }
}

/**
 * Canvas gradients aligned with rankCardTheme.js svgWallpaper presets (aurora / neon / meadow).
 */
function drawPresetWallpaperFromKey(ctx, x, y, width, height, key) {
  const k = String(key || "").toLowerCase();
  let gradient = ctx.createLinearGradient(x, y, x + width, y + height);
  if (k === "aurora") {
    gradient.addColorStop(0, "#140f2e");
    gradient.addColorStop(0.38, "#543ba8");
    gradient.addColorStop(0.68, "#a75ce7");
    gradient.addColorStop(1, "#6ed3ff");
  } else if (k === "neon") {
    gradient.addColorStop(0, "#0a1326");
    gradient.addColorStop(0.52, "#142f58");
    gradient.addColorStop(1, "#090d19");
  } else if (k === "meadow") {
    gradient = ctx.createLinearGradient(x, y, x, y + height);
    gradient.addColorStop(0, "#69b9ff");
    gradient.addColorStop(0.44, "#b6ecff");
    gradient.addColorStop(0.45, "#f5ebad");
    gradient.addColorStop(1, "#57a546");
  } else {
    gradient.addColorStop(0, "#1a1f36");
    gradient.addColorStop(0.55, "#123f78");
    gradient.addColorStop(1, "#006777");
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, width, height);
}

async function drawWallpaper(ctx, x, y, width, height, palette) {
  const wallpaper = resolveRankCardWallpaper(palette);
  if (wallpaper && isGifDataUrlWallpaper(wallpaper)) {
    /* node-canvas non gestisce in modo affidabile GIF data URL: evitiamo warning rumorosi. */
    drawPresetWallpaperFromKey(ctx, x, y, width, height, palette.wallpaperKey);
    return;
  }
  if (wallpaper && isSvgDataUrlWallpaper(wallpaper)) {
    const svgBuf = decodeSvgDataUrlToBuffer(wallpaper);
    if (svgBuf) {
      const raster = await safeLoadImage(svgBuf, { suppressWarning: true });
      if (raster) {
        drawCoverImage(ctx, raster, x, y, width, height);
        return;
      }
    }
    drawPresetWallpaperFromKey(ctx, x, y, width, height, palette.wallpaperKey);
    return;
  }

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