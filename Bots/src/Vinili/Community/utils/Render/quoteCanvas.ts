const canvasModule = require("canvas") as typeof import("canvas");
const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");
const os = require("os") as typeof import("os");
const { spawnSync } = require("child_process") as typeof import("child_process");
const axios = require("axios") as any;
const ffmpegPath = require("ffmpeg-static") as typeof import("ffmpeg-static");
const {
  registerCanvasFonts,
  fontStack,
  fontStackPrimaryOnly,
  drawTextWithSpecialFallback,
} = require("./canvasFonts") as typeof import("./canvasFonts");
const {
  prepareVisibleText,
  tokenizeEmojiText,
  getEmojiImage,
  emojiDrawSizeForFont,
} = require("./canvasEmojiRichText") as typeof import("./canvasEmojiRichText");
const {
  normalizeQuoteStyle,
  resolveQuoteStyleColors,
  resolveQuoteFontCss,
  resolveQuoteCanvasSize,
  resolveQuoteFooterText,
  resolveQuoteFadeParams,
  colorWithAlpha,
  hexToRgb,
  resolveQuoteFadeEdgeColor,
  createQuoteLinearGradient,
  lerpHexColor,
} = require("../Quote/quoteStyle") as typeof import("../Quote/quoteStyle");
const { createCanvas } = canvasModule;
const {
  safeLoadImage,
  fetchHttpImageBufferAnimatedFirst,
  discordCdnPathLooksAnimatedAsset,
} = require("./safeLoadImage") as typeof import("./safeLoadImage");

const QUOTE_GIF_FRAMES = 18;
const QUOTE_GIF_FPS = 10;

function quoteEmojiCacheKey(token?) {
  if (token?.type === "custom_emoji") return token.raw || `custom:${token.id}`;
  if (token?.type === "emoji") return token.value;
  return null;
}

function stripFormattingForQuoteCanvas(text?) {
  let s = String(text || "");
  s = s.replace(/```[\s\S]*?```/g, " ");
  s = s.replace(/`([^`]*)`/g, "$1");
  s = s.replace(/\|\|([\s\S]*?)\|\|/g, "$1");
  s = s.replace(/\*\*([\s\S]*?)\*\*/g, "$1");
  s = s.replace(/\*([^*\n]+)\*/g, "$1");
  s = s.replace(/__([^\n_]+)__/g, "$1");
  s = s.replace(/_([^_\n]+)_/g, "$1");
  s = s.replace(/~~([^~]+)~~/g, "$1");
  s = s.replace(/<\/?[su]>/gi, "");
  s = s.replace(/\*\*/g, "");
  s = s.replace(/\*/g, "");
  s = s.replace(/__/g, "");
  s = s.replace(/~~/g, "");
  s = s.replace(/\|/g, "");
  return s.replace(/\s+/g, " ").trim();
}

function tokenizeQuoteForWrap(raw?) {
  const prepared = prepareVisibleText(String(raw || "").trim());
  const tokens = tokenizeEmojiText(prepared === "-" ? "" : prepared);
  const out = [];
  for (const token of tokens) {
    if (token.type === "custom_emoji" || token.type === "emoji") {
      out.push(token);
      continue;
    }
    if (token.type !== "text") continue;
    const parts = String(token.value || "").split(/(\s+)/u);
    for (const part of parts) {
      if (!part) continue;
      out.push({ type: "text", value: part });
    }
  }
  return out;
}

function measureQuoteToken(ctx?, token?, fontSize?) {
  if (token.type === "emoji" || token.type === "custom_emoji") {
    return emojiDrawSizeForFont(fontSize) + 1;
  }
  return ctx.measureText(token.value).width;
}

function expandOversizedTextTokens(ctx?, tokens?, maxWidth?, fontSize?) {
  const out = [];
  for (const t of tokens) {
    if (t.type !== "text") {
      out.push(t);
      continue;
    }
    if (measureQuoteToken(ctx, t, fontSize) <= maxWidth) {
      out.push(t);
      continue;
    }
    let rest = t.value;
    while (rest.length) {
      let sub = "";
      for (const c of Array.from(rest)) {
        const test = sub + c;
        if (ctx.measureText(test).width <= maxWidth) sub = test;
        else break;
      }
      if (!sub) sub = rest.slice(0, 1);
      out.push({ type: "text", value: sub });
      rest = rest.slice(sub.length);
    }
  }
  return out;
}

function wrapQuoteTokenLines(ctx?, tokens?, maxWidth?, maxLines?, fontSize?) {
  const expanded = expandOversizedTextTokens(ctx, tokens, maxWidth, fontSize);
  const lines = [];
  let line = [];
  let lineW = 0;

  const flush = () => {
    if (line.length) {
      lines.push(line);
      line = [];
      lineW = 0;
    }
  };

  for (const t of expanded) {
    if (t.type === "text" && t.value === "") continue;
    const w = measureQuoteToken(ctx, t, fontSize);
    if (line.length && lineW + w > maxWidth) {
      flush();
      if (lines.length >= maxLines) break;
    }
    line.push(t);
    lineW += w;
  }
  flush();
  return lines.slice(0, maxLines);
}

function runFfmpeg(args?) {
  if (!ffmpegPath) return false;
  const out = spawnSync((ffmpegPath as any), args, {
    stdio: "ignore",
    windowsHide: true,
  });
  return Number(out?.status) === 0;
}

function quoteBodyWeight(style?) {
  return style?.bold === false ? "400" : "700";
}

function applyQuoteBodyFont(ctx?, layout?, fontSize?) {
  const css =
    resolveQuoteFontCss(layout.style, fontSize, layout.bodyWeight) ||
    fontStackPrimaryOnly(fontSize, layout.bodyWeight);
  ctx.font = css;
  return css;
}

function measureLineParts(ctx?, parts?, fontSize?, layout?) {
  applyQuoteBodyFont(ctx, layout, fontSize);
  return parts.reduce((acc?, part?) => acc + measureQuoteToken(ctx, part, fontSize), 0);
}

function resolveQuoteFgPaint(ctx?, layout?) {
  const colors = layout?.colors || {};
  const fg = colors.fg || "#f7f7f7";
  if (!colors.fgGradTo) return fg;
    const box = layout.textBox || { x: 0, y: 0, w: layout.width, h: layout.height };
  return createQuoteLinearGradient(
    ctx,
    box.x,
    box.y,
    Math.max(1, box.w),
    Math.max(1, box.h),
    colors.fgGradAngle ?? 90,
    fg,
    colors.fgGradTo,
  );
}

function drawQuoteLineParts(ctx?, parts?, centerX?, y?, fontSize?, layout?) {
  if (!parts?.length) return;
  const totalWidth = measureLineParts(ctx, parts, fontSize, layout);
  let x = centerX - totalWidth / 2;
  const fontCss = applyQuoteBodyFont(ctx, layout, fontSize);
  const fg = resolveQuoteFgPaint(ctx, layout);
  for (const part of parts) {
    if (part.type === "emoji" || part.type === "custom_emoji") {
      const cacheKey = quoteEmojiCacheKey(part);
      const img = cacheKey ? layout.emojiAssets?.get(cacheKey) : null;
      const emojiSize = emojiDrawSizeForFont(fontSize);
      if (img) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, x, y + Math.round((fontSize - emojiSize) / 2) + 2, emojiSize, emojiSize);
      } else {
        drawTextWithSpecialFallback(ctx, "?", x + emojiSize / 2, y, {
          size: fontSize,
          weight: layout.bodyWeight,
          color: fg,
          fontCss,
          align: "center",
        });
      }
      x += emojiSize + 1;
    } else if (part.value) {
      drawTextWithSpecialFallback(ctx, part.value, x, y, {
        size: fontSize,
        weight: layout.bodyWeight,
        color: fg,
        fontCss,
        align: "left",
      });
      x += ctx.measureText(part.value).width;
    }
  }
}

async function loadEmojiAssets(text?) {
  const map = new Map();
  const tokens = tokenizeQuoteForWrap(text).filter(
    (token?) => token.type === "emoji" || token.type === "custom_emoji",
  );
  const seen = new Set();
  const uniqueTokens = tokens.filter((token?) => {
    const key = quoteEmojiCacheKey(token);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  await Promise.all(
    uniqueTokens.map(async (token?) => {
      const key = quoteEmojiCacheKey(token);
      if (!key) return;
      const img =
        token.type === "custom_emoji"
          ? await getEmojiImage(token)
          : await getEmojiImage(token.value);
      if (img) map.set(key, img);
    }),
  );
  return map;
}

function drawImageCover(ctx?, image?, x?, y?, w?, h?) {
  const { width, height } = image;
  const scale = Math.max(w / width, h / height);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (width - sw) / 2;
  const sy = (height - sh) / 2;
  ctx.drawImage(image, sx, sy, sw, sh, x, y, w, h);
}

function isAnimatedCoverUrl(url?) {
  const raw = String(url || "").trim();
  if (!raw) return false;
  let pathname = "";
  try {
    pathname = new URL(raw).pathname || "";
  } catch {
    pathname = raw.split("?")[0] || "";
  }
  const pathPart = String(pathname).toLowerCase();
  if (pathPart.endsWith(".gif")) return true;
  if (discordCdnPathLooksAnimatedAsset(pathname)) return true;
  return false;
}

function detectAnimatedCoverExt(buf?) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf.slice(0, 3).toString("latin1") === "GIF") return "gif";
  if (buf.slice(0, 4).toString("latin1") === "RIFF" && buf.slice(8, 12).toString("latin1") === "WEBP") {
    return "webp";
  }
  return null;
}

function listQuoteFrameFiles(tmpDir?, prefix?) {
  const re = new RegExp(`^${prefix}_\\d+\\.png$`, "i");
  return fs
    .readdirSync(tmpDir)
    .filter((n?) => re.test(n))
    .sort((a?, b?) => a.localeCompare(b, "en"));
}

function clearQuoteFrameFiles(tmpDir?, prefix?) {
  for (const name of listQuoteFrameFiles(tmpDir, prefix)) {
    try {
      fs.unlinkSync(path.join(tmpDir, name));
    } catch {
          }
  }
}

function extractQuoteCoverFrames(inPath?, tmpDir?, cw?, ch?) {
  const framePattern = path.join(tmpDir, "qf_%03d.png");
  const scaleCrop = `scale=${cw}:${ch}:flags=lanczos:force_original_aspect_ratio=increase,crop=${cw}:${ch}`;
  const durationSec = (QUOTE_GIF_FRAMES / QUOTE_GIF_FPS).toFixed(3);

  clearQuoteFrameFiles(tmpDir, "qf");
  runFfmpeg([
    "-y",
    "-stream_loop",
    "-1",
    "-i",
    inPath,
    "-t",
    durationSec,
    "-vf",
    `fps=${QUOTE_GIF_FPS},${scaleCrop}`,
    "-frames:v",
    String(QUOTE_GIF_FRAMES),
    framePattern,
  ]);
  let files = listQuoteFrameFiles(tmpDir, "qf");
  if (files.length >= 2) return files;

  clearQuoteFrameFiles(tmpDir, "qf");
  runFfmpeg([
    "-y",
    "-i",
    inPath,
    "-vf",
    scaleCrop,
    "-fps_mode",
    "passthrough",
    "-frames:v",
    String(QUOTE_GIF_FRAMES),
    framePattern,
  ]);
  return listQuoteFrameFiles(tmpDir, "qf");
}

function measureQuoteLayout(message?, username?, footerText?, styleInput?) {
  const style = normalizeQuoteStyle(styleInput);
  const size = resolveQuoteCanvasSize(style);
  const colors = resolveQuoteStyleColors(style);
  const bodyWeight = quoteBodyWeight(style);
  const width = size.width;
  const height = size.height;
  const vertical = size.vertical === true;
  const flip = style.flip === true;
  const coverSize = size.coverSize;

  let coverRect;
  let textBox;
  if (vertical) {
    const coverH = Math.round(height * 0.42);
    coverRect = flip
      ? { x: 0, y: height - coverH, w: width, h: coverH }
      : { x: 0, y: 0, w: width, h: coverH };
    textBox = flip
      ? { x: 0, y: 0, w: width, h: height - coverH }
      : { x: 0, y: coverH, w: width, h: height - coverH };
  } else {
    coverRect = flip
      ? { x: width - coverSize, y: 0, w: coverSize, h: height }
      : { x: 0, y: 0, w: coverSize, h: height };
    textBox = flip
      ? { x: 0, y: 0, w: width - coverSize, h: height }
      : { x: coverSize, y: 0, w: width - coverSize, h: height };
  }

  const padding = vertical ? 40 : 48;
  const textX = textBox.x + textBox.w / 2;
  const maxTextWidth = Math.max(80, textBox.w - padding * 2);
  const topMargin = vertical ? 56 : 100;
  const bottomMargin = vertical ? 72 : 80;
  const maxBlockHeight = Math.max(40, textBox.h - topMargin - bottomMargin);

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  const mainText = stripFormattingForQuoteCanvas(String(message || "").trim());
  const wrapTokens = tokenizeQuoteForWrap(mainText);
  let fontSize = vertical ? 36 : 34;
  let lineParts = [];
  let lineHeight = 40;
  const probeLayout = { style, bodyWeight };

  while (fontSize >= 10) {
    applyQuoteBodyFont(ctx, probeLayout, fontSize);
    lineParts = wrapQuoteTokenLines(ctx, wrapTokens, maxTextWidth, Infinity, fontSize);
    lineHeight = Math.round(fontSize * 1.25);
    const blockHeight = lineParts.length * lineHeight;
    if (blockHeight <= maxBlockHeight) break;
    fontSize -= 2;
  }

  const blockHeight = lineParts.length * lineHeight;
  const lineStartY = textBox.y + Math.max(topMargin, (textBox.h - blockHeight) / 2);

  return {
    width,
    height,
    style,
    colors,
    bodyWeight,
    vertical,
    flip,
    coverRect,
    textBox,
    lineParts,
    fontSize,
    lineHeight,
    textX,
    lineStartY,
    username: username || "",
    footerText: footerText || "",
    mainText,
  };
}

function drawQuoteInviteWatermark(ctx?, layout?) {
  const footer = resolveQuoteFooterText(layout.style);
  if (!footer) return;
  const { width, height, style } = layout;
  if (!width || !height) return;

    const fontSize = Math.max(11, Math.min(14, Math.round(Math.min(width, height) * 0.02)));
  const padX = 16;
  const padY = 12;
  const x = width - padX;
  const y = height - padY;
  const weight = "400";
  const fontCss = resolveQuoteFontCss(style, fontSize, weight) || fontStack(fontSize, weight);

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.28)";
  ctx.shadowBlur = 2;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1;
  drawTextWithSpecialFallback(ctx, footer, x, y, {
    size: fontSize,
    weight,
    color: "rgba(120,120,120,0.78)",
    fontCss,
    forcePrimaryFont: !fontCss,
    align: "right",
    baseline: "bottom",
  });
  ctx.restore();
}

function fadeEase(t?) {
  const u = Math.max(0, Math.min(1, Number(t) || 0));
  return u * u * (3 - 2 * u);
}

function blendCoverEdgeToPanel(ctx?, coverRect?, vertical?, flip?, intoCover?, edgeHex?, opacity?) {
  const edge = hexToRgb(edgeHex);
  if (!edge || intoCover <= 0 || opacity <= 0.001) return;

  const blendRow = (data?, widthPx?, depth?, towardEnd?) => {
    for (let row = 0; row < data.height; row += 1) {
      for (let col = 0; col < depth; col += 1) {
        const dist = towardEnd ? col : depth - 1 - col;
        const t = fadeEase((dist + 1) / depth) * opacity;
        const i = (row * widthPx + col) * 4;
        data.data[i] = Math.round(data.data[i] + (edge.r - data.data[i]) * t);
        data.data[i + 1] = Math.round(data.data[i + 1] + (edge.g - data.data[i + 1]) * t);
        data.data[i + 2] = Math.round(data.data[i + 2] + (edge.b - data.data[i + 2]) * t);
        data.data[i + 3] = 255;
      }
    }
  };

  const { x, y, w, h } = coverRect;
  if (vertical) {
    const depth = Math.min(intoCover, h);
    if (depth <= 0) return;
    if (flip) {
      const img = ctx.getImageData(x, y, w, depth);
      for (let row = 0; row < depth; row += 1) {
        const t = fadeEase((depth - row) / depth) * opacity;
        for (let col = 0; col < w; col += 1) {
          const i = (row * w + col) * 4;
          img.data[i] = Math.round(img.data[i] + (edge.r - img.data[i]) * t);
          img.data[i + 1] = Math.round(img.data[i + 1] + (edge.g - img.data[i + 1]) * t);
          img.data[i + 2] = Math.round(img.data[i + 2] + (edge.b - img.data[i + 2]) * t);
          img.data[i + 3] = 255;
        }
      }
      ctx.putImageData(img, x, y);
    } else {
      const startY = y + h - depth;
      const img = ctx.getImageData(x, startY, w, depth);
      for (let row = 0; row < depth; row += 1) {
        const t = fadeEase((row + 1) / depth) * opacity;
        for (let col = 0; col < w; col += 1) {
          const i = (row * w + col) * 4;
          img.data[i] = Math.round(img.data[i] + (edge.r - img.data[i]) * t);
          img.data[i + 1] = Math.round(img.data[i + 1] + (edge.g - img.data[i + 1]) * t);
          img.data[i + 2] = Math.round(img.data[i + 2] + (edge.b - img.data[i + 2]) * t);
          img.data[i + 3] = 255;
        }
      }
      ctx.putImageData(img, x, startY);
    }
    return;
  }

  const depth = Math.min(intoCover, w);
  if (depth <= 0) return;
  if (flip) {
    const img = ctx.getImageData(x, y, depth, h);
    blendRow(img, depth, depth, false);
    ctx.putImageData(img, x, y);
  } else {
    const startX = x + w - depth;
    const img = ctx.getImageData(startX, y, depth, h);
    blendRow(img, depth, depth, true);
    ctx.putImageData(img, startX, y);
  }
}

function drawCoverFadeAlpha(ctx?, coverRect?, vertical?, flip?, width?, height?, intoCover?, edgeHex?, opacity?) {
  if (intoCover <= 0 || opacity <= 0.001) return;
  const edge = colorWithAlpha(edgeHex, opacity);
  const mid = colorWithAlpha(edgeHex, opacity * 0.55);
  const soft = colorWithAlpha(edgeHex, opacity * 0.18);
  const clear = colorWithAlpha(edgeHex, 0);

  ctx.save();
  ctx.beginPath();
  ctx.rect(coverRect.x, coverRect.y, coverRect.w, coverRect.h);
  ctx.clip();

  if (vertical) {
    if (flip) {
      const g = ctx.createLinearGradient(0, coverRect.y, 0, coverRect.y + intoCover);
      g.addColorStop(0, edge);
      g.addColorStop(0.45, mid);
      g.addColorStop(0.82, soft);
      g.addColorStop(1, clear);
      ctx.fillStyle = g;
      ctx.fillRect(0, coverRect.y, width, intoCover);
    } else {
      const startY = coverRect.y + coverRect.h - intoCover;
      const g = ctx.createLinearGradient(0, startY, 0, coverRect.y + coverRect.h);
      g.addColorStop(0, clear);
      g.addColorStop(0.18, soft);
      g.addColorStop(0.55, mid);
      g.addColorStop(1, edge);
      ctx.fillStyle = g;
      ctx.fillRect(0, startY, width, intoCover);
    }
  } else if (flip) {
    const g = ctx.createLinearGradient(coverRect.x, 0, coverRect.x + intoCover, 0);
    g.addColorStop(0, edge);
    g.addColorStop(0.45, mid);
    g.addColorStop(0.82, soft);
    g.addColorStop(1, clear);
    ctx.fillStyle = g;
    ctx.fillRect(coverRect.x, 0, intoCover, height);
  } else {
    const startX = coverRect.x + coverRect.w - intoCover;
    const g = ctx.createLinearGradient(startX, 0, coverRect.x + coverRect.w, 0);
    g.addColorStop(0, clear);
    g.addColorStop(0.18, soft);
    g.addColorStop(0.55, mid);
    g.addColorStop(1, edge);
    ctx.fillStyle = g;
    ctx.fillRect(startX, 0, intoCover, height);
  }
  ctx.restore();
}

function drawCoverFade(ctx?, layout?) {
  const { coverRect, colors, vertical, flip, width, height, style, textBox } = layout;
  const coverSize = vertical ? coverRect.h : coverRect.w;
  const fade = resolveQuoteFadeParams(style, coverSize);
  const edgeHex = resolveQuoteFadeEdgeColor(colors, layout);

  if (fade.shadeAlpha > 0.001) {
    ctx.fillStyle = `rgba(0,0,0,${fade.shadeAlpha})`;
    ctx.fillRect(coverRect.x, coverRect.y, coverRect.w, coverRect.h);
  }

  const { intoCover } = fade;
  if (intoCover <= 0 || fade.opacity <= 0.001) return;

    if (layout.fadeMode === "opaque") {
    blendCoverEdgeToPanel(
      ctx,
      coverRect,
      vertical === true,
      flip === true,
      intoCover,
      edgeHex,
      fade.opacity,
    );
  } else {
    drawCoverFadeAlpha(
      ctx,
      coverRect,
      vertical === true,
      flip === true,
      width,
      height,
      intoCover,
      edgeHex,
      fade.opacity,
    );
  }

    const box = textBox || null;
  if (box && box.w > 0 && box.h > 0) {
    const bgSolid = colors?.bg || "#070707";
    ctx.fillStyle = colors?.bgGradTo
      ? createQuoteLinearGradient(
          ctx,
          0,
          0,
          width,
          height,
          colors.bgGradAngle ?? 135,
          bgSolid,
          colors.bgGradTo,
        )
      : bgSolid;
    ctx.fillRect(box.x, box.y, box.w, box.h);
  }
}

function drawQuoteFrame(ctx?, coverImage?, layout?) {
  const {
    width,
    height,
    lineParts,
    fontSize,
    lineHeight,
    textX,
    lineStartY,
    username,
    footerText,
    colors,
    coverRect,
    bodyWeight,
  } = layout;

  const bgSolid = colors?.bg || "#070707";
  ctx.fillStyle = colors?.bgGradTo
    ? createQuoteLinearGradient(
        ctx,
        0,
        0,
        width,
        height,
        colors.bgGradAngle ?? 135,
        bgSolid,
        colors.bgGradTo,
      )
    : bgSolid;
  ctx.fillRect(0, 0, width, height);

  if (coverImage) {
    drawImageCover(ctx, coverImage, coverRect.x, coverRect.y, coverRect.w, coverRect.h);
  }
  drawCoverFade(ctx, layout);

  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  const muted = colors?.muted || "rgba(255,255,255,0.7)";
  const nameCss =
    resolveQuoteFontCss(layout.style, 18, "italic") || fontStack(18, "italic");
  drawTextWithSpecialFallback(ctx, username || "", textX, lineStartY - 36, {
    size: 18,
    weight: "italic",
    color: muted,
    normalizeCompatibility: true,
    fontCss: nameCss,
  });

  let y = lineStartY;
  for (const parts of lineParts) {
    if (y + lineHeight > height - 36) break;
    drawQuoteLineParts(ctx, parts, textX, y, fontSize, layout);
    y += lineHeight;
  }

  void footerText;
  drawQuoteInviteWatermark(ctx, layout);
  void bodyWeight;
}

async function renderSingleQuotePng(coverImage?, layout?) {
  const canvas = createCanvas(layout.width, layout.height);
  const ctx = canvas.getContext("2d");
  drawQuoteFrame(ctx, coverImage, layout);
  return canvas.toBuffer("image/png");
}

async function fetchCoverBuffer(url?) {
  const raw = String(url || "").trim();
  if (!raw) return null;
  try {
    const res = await axios.get(raw, {
      responseType: "arraybuffer",
      timeout: 12_000,
      validateStatus: (s?) => s >= 200 && s < 300,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ViniliBot/1.0)",
        Accept: "image/gif,image/webp,image/png,image/*;q=0.8,*/*;q=0.5",
      },
      maxRedirects: 3,
    });
    const buf = Buffer.from(res.data || []);
    return buf.length ? buf : null;
  } catch {
    return null;
  }
}

function writeQuotePaletteRamp(tmpDir?, colors?, layout?) {
  const h = Math.max(256, Math.round(layout?.height || 512));
  const w = 96;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  const bg = String(colors?.bg || "#070707");
  const fg = String(colors?.fg || "#ffffff");
  const bg2 = String(colors?.bgGradTo || bg);
  const fg2 = String(colors?.fgGradTo || fg);
  const fadeEdge = resolveQuoteFadeEdgeColor(
    colors,
    layout || {
      width: 1024,
      height: h,
      coverRect: { x: 0, y: 0, w: 512, h },
      vertical: false,
      flip: false,
    },
  );

  for (let y = 0; y < h; y += 1) {
    const t = h <= 1 ? 0 : y / (h - 1);
        ctx.fillStyle = lerpHexColor("#000000", fadeEdge, t);
    ctx.fillRect(0, y, 32, 1);
    ctx.fillStyle = lerpHexColor("#404040", fadeEdge, t);
    ctx.fillRect(32, y, 16, 1);
    ctx.fillStyle = lerpHexColor(bg, bg2, t);
    ctx.fillRect(48, y, 24, 1);
    ctx.fillStyle = lerpHexColor(fg, fg2, t);
    ctx.fillRect(72, y, 12, 1);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(84, y, 12, 1);
  }

  const outPath = path.join(tmpDir, "palette-ramp.png");
  fs.writeFileSync(outPath, canvas.toBuffer("image/png"));
  return outPath;
}

function quoteCoverFramesAreDistinct(tmpDir?, frameFiles?) {
  if (!Array.isArray(frameFiles) || frameFiles.length < 2) return false;
  const crypto = require("crypto") as typeof import("crypto");
  const hashFile = (name?) => {
    try {
      const buf = fs.readFileSync(path.join(tmpDir, name));
      return crypto.createHash("md5").update(buf).digest("hex");
    } catch {
      return "";
    }
  };
  const first = hashFile(frameFiles[0]);
  const mid = hashFile(frameFiles[Math.floor(frameFiles.length / 2)]);
  const last = hashFile(frameFiles[frameFiles.length - 1]);
  if (!first || !mid || !last) return false;
  return !(first === mid && mid === last);
}

function toDiscordAnimatedGifUrl(url?) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  try {
    const u = new URL(raw);
    const path = String(u.pathname || "");
    if (!discordCdnPathLooksAnimatedAsset(path) && !/\.gif$/i.test(path)) return "";
    const extMatch = path.match(/^(.*)\.(gif|webp|png|jpe?g)$/i);
    const basePath = extMatch ? extMatch[1] : path;
    u.pathname = `${basePath}.gif`;
    u.searchParams.delete("format");
    u.searchParams.delete("quality");
    return u.toString();
  } catch {
    return "";
  }
}

async function loadAnimatedCoverBuffer(coverImageUrl?) {
  const primary =
    (await fetchHttpImageBufferAnimatedFirst(coverImageUrl, { timeoutMs: 12_000 })) ||
    (await fetchCoverBuffer(coverImageUrl));
  if (primary && detectAnimatedCoverExt(primary)) return primary;

  const gifUrl = toDiscordAnimatedGifUrl(coverImageUrl);
  if (!gifUrl || gifUrl === String(coverImageUrl || "").trim()) return primary;
  const gifBuf =
    (await fetchHttpImageBufferAnimatedFirst(gifUrl, { timeoutMs: 12_000 })) ||
    (await fetchCoverBuffer(gifUrl));
  if (gifBuf && detectAnimatedCoverExt(gifBuf)) return gifBuf;
  return primary;
}

async function tryRenderAnimatedQuoteGif(coverImageUrl?, layout?) {
  if (!ffmpegPath || !isAnimatedCoverUrl(coverImageUrl)) return null;
  let coverBuf = await loadAnimatedCoverBuffer(coverImageUrl);
  let ext = detectAnimatedCoverExt(coverBuf);
  if (!ext) return null;

  const cw = Math.max(1, Math.round(layout.coverRect.w));
  const ch = Math.max(1, Math.round(layout.coverRect.h));

  let tmpDir = "";
  try {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-quote-gif-"));
    let inPath = path.join(tmpDir, `cover.${ext}`);
    fs.writeFileSync(inPath, coverBuf);

    let frameFiles = extractQuoteCoverFrames(inPath, tmpDir, cw, ch);
    if (!quoteCoverFramesAreDistinct(tmpDir, frameFiles)) {
            const gifUrl = toDiscordAnimatedGifUrl(coverImageUrl);
      if (gifUrl) {
        const gifBuf =
          (await fetchHttpImageBufferAnimatedFirst(gifUrl, { timeoutMs: 12_000 })) ||
          (await fetchCoverBuffer(gifUrl));
        if (gifBuf && detectAnimatedCoverExt(gifBuf) === "gif") {
          coverBuf = gifBuf;
          ext = "gif";
          inPath = path.join(tmpDir, "cover.gif");
          fs.writeFileSync(inPath, coverBuf);
          frameFiles = extractQuoteCoverFrames(inPath, tmpDir, cw, ch);
        }
      }
    }
    if (!quoteCoverFramesAreDistinct(tmpDir, frameFiles)) {
            return null;
    }

    const cardPattern = path.join(tmpDir, "card_%03d.png");
    for (let i = 0; i < frameFiles.length; i += 1) {
      const fp = path.join(tmpDir, frameFiles[i]);
      const coverImg = await safeLoadImage(fp, { suppressWarning: true });
      const canvas = createCanvas(layout.width, layout.height);
      const ctx = canvas.getContext("2d");
      layout.fadeMode = "opaque";
      drawQuoteFrame(ctx, coverImg, layout);
      fs.writeFileSync(
        path.join(tmpDir, `card_${String(i + 1).padStart(3, "0")}.png`),
        canvas.toBuffer("image/png"),
      );
    }

    const rampPath = writeQuotePaletteRamp(tmpDir, layout?.colors, layout);
            const outGifPath = path.join(tmpDir, "quote.gif");
    const gifOk = runFfmpeg([
      "-y",
      "-framerate",
      String(QUOTE_GIF_FPS),
      "-i",
      cardPattern,
      "-i",
      rampPath,
      "-filter_complex",
      "[0:v]split[v0][v1];[1:v]scale=96:ih[ramp];[v0][ramp]hstack=shortest=1[ref];[ref]palettegen=stats_mode=full:max_colors=256:reserve_transparent=0[p];[v1][p]paletteuse=new=1:dither=floyd_steinberg",
      "-loop",
      "0",
      outGifPath,
    ]);
    if (!gifOk || !fs.existsSync(outGifPath)) {
      const palettePath = path.join(tmpDir, "palette.png");
      const paletteOk = runFfmpeg([
        "-y",
        "-framerate",
        String(QUOTE_GIF_FPS),
        "-i",
        cardPattern,
        "-i",
        rampPath,
        "-filter_complex",
        "[0:v][1:v]hstack=shortest=1,palettegen=stats_mode=full:max_colors=256:reserve_transparent=0",
        palettePath,
      ]);
      if (!paletteOk) return null;
      const fallbackOk = runFfmpeg([
        "-y",
        "-framerate",
        String(QUOTE_GIF_FPS),
        "-i",
        cardPattern,
        "-i",
        palettePath,
        "-lavfi",
        "paletteuse=dither=floyd_steinberg",
        "-loop",
        "0",
        outGifPath,
      ]);
      if (!fallbackOk || !fs.existsSync(outGifPath)) return null;
    }
    const out = fs.readFileSync(outGifPath);
    return out && out.length ? out : null;
  } catch {
    return null;
  } finally {
    if (tmpDir) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
              }
    }
  }
}

export = async function renderQuoteCanvas(params?) {
  if (!canvasModule) throw new Error("Canvas module not available");
  registerCanvasFonts(canvasModule);

  const { coverImageUrl, message, username, footerText, style } = params;
  const url = String(coverImageUrl || "").trim();
  const normalized = normalizeQuoteStyle(style);
  const layout: any = measureQuoteLayout(message, username, footerText, normalized);
  layout.emojiAssets = await loadEmojiAssets(layout.mainText);

  const allowAnimated = normalized.avatarMode === "dynamic";
  const gifBuf = allowAnimated ? await tryRenderAnimatedQuoteGif(url, layout) : null;
  if (gifBuf) return { buffer: gifBuf, format: "gif" };

  const coverImage = url ? await safeLoadImage(url) : null;
  const pngBuf = await renderSingleQuotePng(coverImage, layout);
  return { buffer: pngBuf, format: "png" };
};
