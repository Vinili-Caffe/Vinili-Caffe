const canvasModule = require("canvas") as typeof import("canvas");
const { createCanvas } = canvasModule;
const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");
const os = require("os") as typeof import("os");
const { spawnSync } = require("child_process") as typeof import("child_process");
const axios = require("axios") as typeof import("axios").default;
const ffmpegPath = require("ffmpeg-static") as typeof import("ffmpeg-static");
const {
  drawLabelWithEmoji,
  fitRichText,
  measureRichTextWidth,
} = require("./canvasEmojiRichText") as typeof import("./canvasEmojiRichText");

let path2dCtorMemo;
function getPath2DConstructor() {
  if (path2dCtorMemo !== undefined) return path2dCtorMemo;
  const candidates = [
    (canvasModule as any).Path2D,
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
          }
  }
  path2dCtorMemo = null;
  return null;
}

function fillPath2D(ctx?, d?) {
  const Ctor = getPath2DConstructor();
  if (!Ctor) return false;
  try {
    ctx.fill(new Ctor(d));
    return true;
  } catch {
    return false;
  }
}

function strokePath2D(ctx?, d?, lineWidth?) {
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

function drawStatIconGeometric(ctx?, icon?) {
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
const { registerCanvasFonts, fontStackWithPrimary } = require("./canvasFonts") as typeof import("./canvasFonts");
const { safeLoadImage } = require("./safeLoadImage") as typeof import("./safeLoadImage");
const {
  mergeRankCardTheme,
  resolveRankCardWallpaper,
  resolveRankFontFamily,
} = require("./rankCardTheme") as typeof import("./rankCardTheme");

function clamp(value?, min?, max?) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function roundedRect(ctx?, x?, y?, width?, height?, radius?) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function hexToRgb(hex?) {
  const fallback = [22, 27, 38];
  const normalized = String(hex || "").replace("#", "").trim();
  const full = normalized.length === 3
    ? normalized.split("").map((char?) => `${char}${char}`).join("")
    : normalized;
  if (!/^[0-9a-f]{6}$/i.test(full)) return fallback;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function hexToRgba(hex?, alpha = 1) {
  const rgb = hexToRgb(hex);
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${clamp(alpha, 0, 1)})`;
}

/** Luminanza relativa WCAG → inchiostro scuro o chiaro, sempre leggibile sullo sfondo. */
function contrastInkForHex(hex?) {
  const [r, g, b] = hexToRgb(hex).map((c?) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.45 ? "#12141A" : "#FFFFFF";
}

function mixHex(a?, b?, t = 0.5) {
  const amount = clamp(t, 0, 1);
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const ch = (i?) => Math.round(A[i] + (B[i] - A[i]) * amount).toString(16).padStart(2, "0");
  return `#${ch(0)}${ch(1)}${ch(2)}`;
}

function formatInt(value?) {
  const number = Number(value) || 0;
  return Math.max(0, Math.floor(number)).toLocaleString("it-IT");
}

/* rankFontRaceFix1: niente stato modulo — preview concorrenti si pestavano il font */
function canvasFont(size?, weight = 700, fontPrimary = "Arial") {
  const cssWeight = Number(weight) >= 700 ? "bold" : "normal";
  return fontStackWithPrimary(fontPrimary || "Arial", size, cssWeight);
}

function ellipsize(ctx?, text?, maxWidth?) {
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

function drawText(ctx?, text?, x?, y?, options: Record<string, any> = {}) {
  const {
    size = 28,
    weight = 700,
    color = "#ffffff",
    align = "left",
    baseline = "middle",
    shadow = false,
    fontPrimary = "Arial",
  } = options;

  ctx.font = canvasFont(size, weight, fontPrimary);
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillStyle = color;

  if (shadow) {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.62)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 1;
    ctx.fillText(String(text ?? ""), x, y);
    ctx.restore();
    return;
  }

  ctx.fillText(String(text ?? ""), x, y);
}

function drawCoverImage(ctx?, image?, x?, y?, width?, height?) {
  if (!image || !image.width || !image.height || width <= 0 || height <= 0) return;
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const drawX = x + (width - drawWidth) / 2;
  const drawY = y + (height - drawHeight) / 2;
  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

function drawWallpaperImage(ctx?, image?, x?, y?, width?, height?) {
  if (!image || !image.width || !image.height || width <= 0 || height <= 0) return;
  ctx.fillStyle = "#0b0d12";
  ctx.fillRect(x, y, width, height);

  const cover = Math.max(width / image.width, height / image.height);
  const aspectSrc = image.width / Math.max(1, image.height);
  const aspectDst = width / Math.max(1, height);
  const mismatch = Math.max(aspectSrc / aspectDst, aspectDst / aspectSrc);
  const zoom = mismatch > 1.25 ? Math.min(1.4, 1 + (mismatch - 1) * 0.4) : 1;
  const scale = cover * zoom;
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const drawX = x + (width - drawWidth) / 2;
  const drawY = y + (height - drawHeight) / 2;
  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

async function drawAvatar(ctx?, avatarUrl?, x?, y?, size?, palette?, avatarImageOverride = null) {
  const cx = x + size / 2;
  const cy = y + size / 2;
  const radius = size / 2;
  const ring = String(palette.ringColor || "#ffcb05");

    ctx.save();
  const glowR = radius + 11;
  const glow = ctx.createRadialGradient(cx, cy, Math.max(1, radius * 0.82), cx, cy, glowR);
  glow.addColorStop(0, hexToRgba(ring, 0.28));
  glow.addColorStop(0.7, hexToRgba(ring, 0.08));
  glow.addColorStop(1, hexToRgba(ring, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();

  const avatar = avatarImageOverride || (avatarUrl ? await safeLoadImage(avatarUrl, { suppressWarning: true }) : null);
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
  ctx.lineWidth = 3.2;
  ctx.strokeStyle = ring;
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 0.8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawProgressBar(ctx?, x?, y?, width?, height?, progressPercent?, currentExp?, targetExp?, palette?, fontPrimary?) {
  const progress = clamp(progressPercent, 0, 100) / 100;
  const font = fontPrimary || "Arial";
  const fillW = progress > 0 ? Math.max(height, width * progress) : 0;
  const label = `${formatInt(currentExp)} / ${formatInt(targetExp)} XP`;
  const textX = x + width / 2;
  const textY = y + height / 2 + 1;
  const fillMid = mixHex(palette.progressStartColor, palette.progressEndColor, 0.5);
  const fillInk = contrastInkForHex(fillMid);
  /* Traccia vuota scura → testo chiaro */
  const emptyInk = "#FFFFFF";

  roundedRect(ctx, x, y, width, height, height / 2);
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 1;
  ctx.stroke();

  if (fillW > 0) {
    ctx.save();
    roundedRect(ctx, x, y, width, height, height / 2);
    ctx.clip();
    const gradient = ctx.createLinearGradient(x, y, x + width, y);
    gradient.addColorStop(0, palette.progressStartColor);
    gradient.addColorStop(1, palette.progressEndColor);
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, fillW, height);
    ctx.restore();
  }

  /* Testo bipartito: colore a contrasto sulla fill e sulla parte vuota */
  const drawXpLabel = (color?, useShadow?) => {
    drawText(ctx, label, textX, textY, {
      size: 15,
      weight: 800,
      color,
      align: "center",
      shadow: useShadow,
      fontPrimary: font,
    });
  };
  if (fillW <= 0) {
    drawXpLabel(emptyInk, true);
  } else if (fillW >= width) {
    drawXpLabel(fillInk, fillInk === "#FFFFFF");
  } else {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, fillW, height);
    ctx.clip();
    drawXpLabel(fillInk, fillInk === "#FFFFFF");
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + fillW, y, Math.max(0, width - fillW), height);
    ctx.clip();
    drawXpLabel(emptyInk, true);
    ctx.restore();
  }
}

function drawStatIcon(ctx?, icon?, x?, y?, color?) {
  const scale = 0.72;
  ctx.save();
  ctx.translate(x, y);
  if (icon === "trophy") ctx.translate(0, -1);
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

function drawStatPill(ctx?, x?, y?, width?, height?, icon?, label?, value?, palette?, panelAlpha?, fontPrimary?) {
  const fillA = Math.min(1, Math.max(panelAlpha, 0.22) * 0.92 + 0.1);
  const font = fontPrimary || "Arial";
  roundedRect(ctx, x, y, width, height, 14);
  ctx.fillStyle = hexToRgba(palette.panelColor, fillA);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  ctx.stroke();

  const iconColor = palette.primaryTextColor;
  drawStatIcon(ctx, icon, x + 26, y + height / 2, iconColor);

  drawText(ctx, label.toUpperCase(), x + 48, y + 19, {
    size: 10,
    weight: 800,
    color: palette.labelColor,
    align: "left",
    fontPrimary: font,
  });
  drawText(ctx, value, x + 48, y + 39, {
    size: 17,
    weight: 900,
    color: palette.primaryTextColor,
    align: "left",
    shadow: true,
    fontPrimary: font,
  });
}

function formatRankValue(value?) {
  const n = Math.max(1, Math.floor(Number(value || 1)));
  return `#${formatInt(n)}`;
}

function isSvgDataUrlWallpaper(url?) {
  return /^data:image\/svg\+xml/i.test(String(url || ""));
}

function isGifDataUrlWallpaper(url?) {
  return /^data:image\/gif;base64,/i.test(String(url || ""));
}

function decodeSvgDataUrlToBuffer(dataUrl?) {
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

function drawPresetWallpaperFromKey(ctx?, x?, y?, width?, height?, key?) {
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

async function loadGifDataUrlFirstFrameImage(dataUrl?) {
  if (!ffmpegPath || !isGifDataUrlWallpaper(dataUrl)) return null;
  const gifBuf = decodeGifDataUrlToBuffer(dataUrl);
  if (!gifBuf) return null;
  let tmpDir = "";
  try {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-rank-wp-"));
    const gifPath = path.join(tmpDir, "wallpaper.gif");
    const framePath = path.join(tmpDir, "frame.png");
    fs.writeFileSync(gifPath, gifBuf);
    const ok = runFfmpeg([
      "-y",
      "-i",
      gifPath,
      "-vf",
      "scale=976:276:force_original_aspect_ratio=increase,crop=976:276",
      "-frames:v",
      "1",
      framePath,
    ]);
    if (!ok || !fs.existsSync(framePath)) return null;
    return await safeLoadImage(framePath, { suppressWarning: true });
  } catch {
    return null;
  } finally {
    if (tmpDir) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    }
  }
}

async function drawWallpaper(ctx?, x?, y?, width?, height?, palette?, wallpaperImageOverride = null) {
  if (wallpaperImageOverride) {
    drawWallpaperImage(ctx, wallpaperImageOverride, x, y, width, height);
    return;
  }
  const wallpaper = resolveRankCardWallpaper(palette);
  if (wallpaper && isGifDataUrlWallpaper(wallpaper)) {
        const frame = await loadGifDataUrlFirstFrameImage(wallpaper);
    if (frame) {
      drawWallpaperImage(ctx, frame, x, y, width, height);
      return;
    }
    drawPresetWallpaperFromKey(ctx, x, y, width, height, palette.wallpaperKey);
    return;
  }
  if (wallpaper && isSvgDataUrlWallpaper(wallpaper)) {
    const svgBuf = decodeSvgDataUrlToBuffer(wallpaper);
    if (svgBuf) {
      const raster = await safeLoadImage(svgBuf, { suppressWarning: true });
      if (raster) {
        drawWallpaperImage(ctx, raster, x, y, width, height);
        return;
      }
    }
    drawPresetWallpaperFromKey(ctx, x, y, width, height, palette.wallpaperKey);
    return;
  }

  const image = wallpaper ? await safeLoadImage(wallpaper) : null;

  if (image) {
    drawWallpaperImage(ctx, image, x, y, width, height);
    return;
  }

  const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
  gradient.addColorStop(0, "#1a1f36");
  gradient.addColorStop(0.55, "#123f78");
  gradient.addColorStop(1, "#006777");
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, width, height);
}

function isAnimatedAvatarUrl(url?) {
  const raw = String(url || "").trim().toLowerCase();
  if (!raw) return false;
  if (raw.includes(".gif")) return true;
  return /[?&]format=gif(?:[&#]|$)/i.test(raw);
}

function isGifDataUrl(url?) {
  return /^data:image\/gif;base64,/i.test(String(url || "").trim());
}

function decodeGifDataUrlToBuffer(url?) {
  const raw = String(url || "").trim();
  if (!isGifDataUrl(raw)) return null;
  const comma = raw.indexOf(",");
  if (comma < 0) return null;
  try {
    const buf = Buffer.from(raw.slice(comma + 1).replace(/\s/g, ""), "base64");
    if (!buf.length) return null;
    return String(buf.slice(0, 6)).startsWith("GIF") ? buf : null;
  } catch {
    return null;
  }
}

function runFfmpeg(args?) {
  if (!ffmpegPath) return false;
  const out = spawnSync((ffmpegPath as any), args, {
    stdio: "ignore",
    windowsHide: true,
  });
  return Number(out?.status) === 0;
}

async function fetchGifBufferFromSource(source?) {
  const raw = String(source || "").trim();
  if (!raw) return null;
  if (isGifDataUrl(raw)) return decodeGifDataUrlToBuffer(raw);
  if (!isAnimatedAvatarUrl(raw)) return null;
  try {
    const res = await axios.get(raw, {
      responseType: "arraybuffer",
      timeout: 8000,
      validateStatus: (s?) => s >= 200 && s < 300,
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "image/gif,image/*;q=0.9,*/*;q=0.8",
      },
      maxRedirects: 3,
    });
    const buf = Buffer.from(res.data || []);
    if (!buf.length) return null;
    const header = String(buf.slice(0, 6));
    if (!header.startsWith("GIF")) return null;
    return buf;
  } catch {
    return null;
  }
}

async function renderRankPngBuffer(data?, avatarImageOverride = null, wallpaperImageOverride = null) {
  registerCanvasFonts(canvasModule);

  const palette = mergeRankCardTheme(data.theme || {});
  const rankFontPrimary = resolveRankFontFamily(palette.fontKey);
  const legacyYellow = String(palette.rankBoxBorderColor || "").toLowerCase() === "#ffcb05";
  const rankBoxColor = legacyYellow ? palette.valueColor : palette.rankBoxBorderColor;
  const width = 976;
  const height = 276;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const panelAlpha = clamp(palette.overlayOpacity, 0, 1);
    const chromeAlpha = Math.min(1, Math.max(panelAlpha, 0.34) * 0.88 + 0.12);

  ctx.clearRect(0, 0, width, height);

  const card = {
    x: 0,
    y: 0,
    w: width,
    h: height,
    r: 18,
  };

    const padX = 16;
  const padY = 14;
  const gap = 10;
  const statH = 58;
  const hero = {
    x: padX,
    y: padY,
    w: width - padX * 2,
    h: height - padY * 2 - gap - statH,
    r: 16,
  };
  const statsY = hero.y + hero.h + gap;
  const statsX = hero.x;

  ctx.save();
  roundedRect(ctx, card.x, card.y, card.w, card.h, card.r);
  ctx.clip();
  await drawWallpaper(ctx, card.x, card.y, card.w, card.h, palette, wallpaperImageOverride);
  ctx.fillStyle = hexToRgba(palette.panelColor, panelAlpha * 0.42);
  ctx.fillRect(card.x, card.y, card.w, card.h);
  ctx.restore();

  roundedRect(ctx, hero.x, hero.y, hero.w, hero.h, hero.r);
  ctx.fillStyle = hexToRgba(palette.panelColor, chromeAlpha);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1.25;
  ctx.stroke();

  const heroPadX = 16;
  const heroGap = 14;
  const avatarColW = 124;
  const rankBoxW = 94;
  const rankBoxH = 74;
  const avatarSize = Math.min(108, hero.h - 22);
  const avatarX = hero.x + heroPadX + (avatarColW - avatarSize) / 2;
  const avatarY = hero.y + (hero.h - avatarSize) / 2;
  await drawAvatar(ctx, data.avatarUrl, avatarX, avatarY, avatarSize, palette, avatarImageOverride);

  const copyX = hero.x + heroPadX + avatarColW + heroGap;
  const rankBoxX = hero.x + hero.w - heroPadX - rankBoxW;
  const rankBoxY = hero.y + Math.round((hero.h - rankBoxH) / 2);
  const copyW = Math.max(180, rankBoxX - copyX - heroGap);
  const topY = avatarY + Math.round(avatarSize * 0.3);

  const levelText = `Lv. ${formatInt(data.level)}`;
  ctx.font = canvasFont(26, 850, rankFontPrimary);
  const levelWidth = ctx.measureText(levelText).width;
  /* rankEmojiTwemoji1: Twemoji. rankNickExact1: il nick resta com'è su Discord (spazi intorno alle emoji
     compresi), si comprimono solo gli spazi doppi. rankNickSep1: barretta tra nick e livello. */
  const sepGap = 13;
  const usernameMaxW = Math.max(200, copyW - levelWidth - 88 - sepGap * 2);
  const username = fitRichText(
    ctx,
    String(data.username || "utente").replace(/s{2,}/g, " ").trim(),
    usernameMaxW,
    34,
    "900",
    "utente",
    rankFontPrimary,
  );
  const usernameWidth = measureRichTextWidth(ctx, username, 34, "900", rankFontPrimary);

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.62)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 1;
  await drawLabelWithEmoji(ctx, username, copyX, topY, {
    size: 34,
    weight: "900",
    color: palette.primaryTextColor,
    align: "left",
    baseline: "middle",
    fontPrimary: rankFontPrimary,
  });
  ctx.restore();
  const sepX = copyX + usernameWidth + sepGap;
  /* Separatore nick|livello: segue "Etichette" (labelColor), non il primario forzato. */
  const sepColor =
    palette.labelColor || palette.secondaryTextColor || palette.primaryTextColor || "#a8acb8";
  ctx.save();
  ctx.strokeStyle = hexToRgba(sepColor, 0.92);
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(sepX, topY - 12);
  ctx.lineTo(sepX, topY + 12);
  ctx.stroke();
  ctx.restore();
  drawText(ctx, levelText, sepX + sepGap, topY + 1, {
    size: 24,
    weight: 800,
    color: palette.secondaryTextColor,
    shadow: true,
    fontPrimary: rankFontPrimary,
  });

  const multiplierText = `x${Number(data.multiplier || 1).toFixed(1)}`;
  const multiplierX = Math.min(sepX + sepGap + levelWidth + 14, copyX + copyW - 70);
  roundedRect(ctx, multiplierX, topY - 15, 58, 26, 13);
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fill();
  ctx.strokeStyle = hexToRgba(palette.multiplierColor, 0.85);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  drawText(ctx, multiplierText, multiplierX + 29, topY - 1, {
    size: 14,
    weight: 900,
    color: palette.multiplierColor,
    align: "center",
    fontPrimary: rankFontPrimary,
  });

  const currentLevelExp = Math.max(0, Number(data.currentLevelExp || 0));
  const nextLevelExp = Math.max(currentLevelExp + 1, Number(data.nextLevelExp || currentLevelExp + 1));
  const currentProgressExp = Math.max(0, Number(data.totalExp || 0) - currentLevelExp);
  const targetProgressExp = Math.max(1, nextLevelExp - currentLevelExp);
  drawProgressBar(
    ctx,
    copyX,
    avatarY + avatarSize - 26,
    copyW,
    16,
    data.progressPercent,
    currentProgressExp,
    targetProgressExp,
    palette,
    rankFontPrimary,
  );

  roundedRect(ctx, rankBoxX, rankBoxY, rankBoxW, rankBoxH, 14);
  ctx.fillStyle = hexToRgba(palette.panelColor, chromeAlpha);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(rankBoxColor, 0.92);
  ctx.lineWidth = 2.4;
  ctx.stroke();

  const rankText = data.hideLeaderboardRanks ? "-" : formatRankValue(data.allTimeRank);
  drawText(ctx, rankText, rankBoxX + rankBoxW / 2, rankBoxY + 28, {
    size: rankText.length > 7 ? 22 : 26,
    weight: 950,
    color: rankBoxColor,
    align: "center",
    shadow: true,
    fontPrimary: rankFontPrimary,
  });
  drawText(ctx, "RANK", rankBoxX + rankBoxW / 2, rankBoxY + 52, {
    size: 11,
    weight: 800,
    color: palette.labelColor,
    align: "center",
    fontPrimary: rankFontPrimary,
  });

  const statsTotalW = hero.w;
  const statGap = 10;
  const statW = Math.floor((statsTotalW - statGap * 2) / 3);
  const weeklyRankValue = data.hideLeaderboardRanks ? "-" : formatRankValue(data.weeklyRank);

  drawStatPill(ctx, statsX, statsY, statW, statH, "trophy", "Weekly rank", weeklyRankValue, palette, chromeAlpha, rankFontPrimary);
  drawStatPill(ctx, statsX + statW + statGap, statsY, statW, statH, "bolt", "Weekly XP", formatInt(data.weeklyExp), palette, chromeAlpha, rankFontPrimary);
  drawStatPill(ctx, statsX + (statW + statGap) * 2, statsY, statW, statH, "star", "Multiplier", multiplierText, palette, chromeAlpha, rankFontPrimary);

  ctx.save();
  roundedRect(ctx, card.x + 0.5, card.y + 0.5, card.w - 1, card.h - 1, card.r);
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1.25;
  ctx.stroke();
  ctx.restore();

  return canvas.toBuffer("image/png");
}

async function renderRankAnimatedGifBuffer(data?) {
  if (!ffmpegPath) return null;
  const avatarGif = await fetchGifBufferFromSource(data?.avatarUrl);
  const palette = mergeRankCardTheme(data?.theme || {});
  const wallpaperSource = resolveRankCardWallpaper(palette);
  const wallpaperGif = await fetchGifBufferFromSource(wallpaperSource);
  if (!avatarGif && !wallpaperGif) return null;

  let tmpDir = "";
  try {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-rank-gif-"));
    const avatarPath = path.join(tmpDir, "avatar.gif");
    const wallpaperPath = path.join(tmpDir, "wallpaper.gif");
    const avatarFramesPattern = path.join(tmpDir, "avatar_%03d.png");
    const wallpaperFramesPattern = path.join(tmpDir, "wallpaper_%03d.png");
    const cardFramesPattern = path.join(tmpDir, "card_%03d.png");
    const palettePath = path.join(tmpDir, "palette.png");
    const outGifPath = path.join(tmpDir, "rank.gif");
    if (avatarGif) {
      fs.writeFileSync(avatarPath, avatarGif);
      runFfmpeg([
        "-y",
        "-i", avatarPath,
        "-vf",
        "fps=10,scale=122:122:force_original_aspect_ratio=increase:flags=lanczos,crop=122:122",
        "-frames:v", "12",
        avatarFramesPattern,
      ]);
    }
    if (wallpaperGif) {
      fs.writeFileSync(wallpaperPath, wallpaperGif);
      runFfmpeg([
        "-y",
        "-i", wallpaperPath,
        "-vf",
        "fps=10,scale=976:276:force_original_aspect_ratio=increase:flags=lanczos,crop=976:276",
        "-frames:v", "12",
        wallpaperFramesPattern,
      ]);
    }

    const avatarFrames = fs
      .readdirSync(tmpDir)
      .filter((name?) => /^avatar_\d+\.png$/i.test(name))
      .sort((a?, b?) => a.localeCompare(b, "en"));
    const wallpaperFrames = fs
      .readdirSync(tmpDir)
      .filter((name?) => /^wallpaper_\d+\.png$/i.test(name))
      .sort((a?, b?) => a.localeCompare(b, "en"));
    const frameCount = Math.max(avatarFrames.length, wallpaperFrames.length);
    if (frameCount <= 1) return null;

    for (let i = 0; i < frameCount; i += 1) {
      const avatarFramePath = avatarFrames.length
        ? path.join(tmpDir, avatarFrames[i % avatarFrames.length])
        : "";
      const wallpaperFramePath = wallpaperFrames.length
        ? path.join(tmpDir, wallpaperFrames[i % wallpaperFrames.length])
        : "";
      const avatarFrame = avatarFramePath
        ? await safeLoadImage(avatarFramePath, { suppressWarning: true })
        : null;
      const wallpaperFrame = wallpaperFramePath
        ? await safeLoadImage(wallpaperFramePath, { suppressWarning: true })
        : null;
      const frameBuffer = await renderRankPngBuffer(data, avatarFrame, wallpaperFrame);
      const outFrameName = `card_${String(i + 1).padStart(3, "0")}.png`;
      fs.writeFileSync(path.join(tmpDir, outFrameName), frameBuffer);
    }

    const cardFrames = fs
      .readdirSync(tmpDir)
      .filter((name?) => /^card_\d+\.png$/i.test(name))
      .sort((a?, b?) => a.localeCompare(b, "en"));
    if (!cardFrames.length) return null;

    const paletteOk = runFfmpeg([
      "-y",
      "-i", cardFramesPattern,
      "-vf", "palettegen=stats_mode=diff",
      palettePath,
    ]);
    if (!paletteOk) return null;

    const gifOk = runFfmpeg([
      "-y",
      "-framerate", "10",
      "-i", cardFramesPattern,
      "-i", palettePath,
      "-lavfi", "paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle",
      "-loop", "0",
      outGifPath,
    ]);
    if (!gifOk || !fs.existsSync(outGifPath)) return null;
    const outGif = fs.readFileSync(outGifPath);
    return outGif && outGif.length ? outGif : null;
  } catch {
    return null;
  } finally {
    if (tmpDir) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    }
  }
}

async function renderRankCanvas(data?) {
  const gifBuffer = await renderRankAnimatedGifBuffer(data);
  if (gifBuffer) {
    return {
      buffer: gifBuffer,
      mimeType: "image/gif",
      extension: "gif",
      animated: true,
    };
  }
  const pngBuffer = await renderRankPngBuffer(data);
  return {
    buffer: pngBuffer,
    mimeType: "image/png",
    extension: "png",
    animated: false,
  };
}

module.exports = renderRankCanvas;
module.exports.renderRankCanvas = renderRankCanvas;