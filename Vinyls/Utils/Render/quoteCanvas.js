const canvasModule = require("canvas");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");
const axios = require("axios");
const ffmpegPath = require("ffmpeg-static");
const { registerCanvasFonts, fontStack, drawTextWithSpecialFallback } = require("./canvasFonts");
const { createCanvas } = canvasModule;
const { safeLoadImage } = require("./safeLoadImage");

const QUOTE_WIDTH = 1024;
const QUOTE_HEIGHT = 512;
const QUOTE_LEFT = 512;
const QUOTE_GIF_FRAMES = 18;
const QUOTE_GIF_FPS = 10;
const CUSTOM_EMOJI_TOKEN_RE = /<a?:[a-zA-Z0-9_]{2,32}:\d+>/g;

function runFfmpeg(args) {
  if (!ffmpegPath) return false;
  const out = spawnSync(ffmpegPath, args, {
    stdio: "ignore",
    windowsHide: true,
  });
  return Number(out?.status) === 0;
}

function wrapLines(ctx, text, maxWidth, maxLines = Infinity) {
  const lines = [];
  const words = String(text || "").split(/\s+/).filter(Boolean);
  let line = "";

  const flushLine = (l) => {
    if (l) lines.push(l);
    return "";
  };

  for (const word of words) {
    if (ctx.measureText(word).width > maxWidth) {
      if (line) line = flushLine(line);

      let subline = "";
      for (const char of Array.from(word)) {
        const test = subline + char;
        if (ctx.measureText(test).width <= maxWidth) {
          subline = test;
        } else {
          lines.push(subline);
          subline = char;
        }
        if (lines.length >= maxLines) break;
      }
      line = subline;
    } else {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width <= maxWidth) {
        line = test;
      } else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (lines.length >= maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines.slice(0, maxLines);
}

function emojiUrlFromToken(token) {
  const m = /^<(a?):([a-zA-Z0-9_]{2,32}):(\d+)>$/.exec(String(token || ""));
  if (!m) return null;
  const animated = m[1] === "a";
  const id = m[3];
  return `https://cdn.discordapp.com/emojis/${id}.${animated ? "gif" : "png"}?size=64&quality=lossless`;
}

function parseLineParts(line) {
  const parts = [];
  const src = String(line || "");
  let last = 0;
  let m = null;
  const re = new RegExp(CUSTOM_EMOJI_TOKEN_RE.source, "g");
  while ((m = re.exec(src)) !== null) {
    if (m.index > last) parts.push({ type: "text", value: src.slice(last, m.index) });
    parts.push({ type: "emoji", value: m[0] });
    last = re.lastIndex;
  }
  if (last < src.length) parts.push({ type: "text", value: src.slice(last) });
  return parts;
}

function measureLineParts(ctx, parts, fontSize) {
  return parts.reduce((acc, part) => {
    if (part.type === "emoji") return acc + Math.round(fontSize * 1.05);
    return acc + ctx.measureText(part.value).width;
  }, 0);
}

function drawLineWithCustomEmoji(ctx, line, centerX, y, fontSize, emojiAssets) {
  const parts = parseLineParts(line);
  const totalWidth = measureLineParts(ctx, parts, fontSize);
  let x = centerX - totalWidth / 2;
  for (const part of parts) {
    if (part.type === "emoji") {
      const img = emojiAssets?.get(part.value);
      const emojiSize = Math.round(fontSize * 1.05);
      if (img) {
        ctx.drawImage(img, x, y + Math.round((fontSize - emojiSize) / 2) + 2, emojiSize, emojiSize);
      } else {
        drawTextWithSpecialFallback(ctx, "?", x + emojiSize / 2, y, {
          size: fontSize,
          weight: "600",
          color: "#f7f7f7",
          forcePrimaryFont: true,
          align: "center",
        });
      }
      x += emojiSize;
    } else if (part.value) {
      drawTextWithSpecialFallback(ctx, part.value, x, y, {
        size: fontSize,
        weight: "600",
        color: "#f7f7f7",
        forcePrimaryFont: true,
        align: "left",
      });
      x += ctx.measureText(part.value).width;
    }
  }
}

async function loadEmojiAssets(text) {
  const map = new Map();
  const tokens = String(text || "").match(CUSTOM_EMOJI_TOKEN_RE) || [];
  const uniqueTokens = [...new Set(tokens)];
  await Promise.all(
    uniqueTokens.map(async (token) => {
      const url = emojiUrlFromToken(token);
      if (!url) return;
      const img = await safeLoadImage(url, { timeoutMs: 12000, suppressWarning: true });
      if (img) map.set(token, img);
    }),
  );
  return map;
}

function drawImageCover(ctx, image, x, y, w, h) {
  const { width, height } = image;
  const scale = Math.max(w / width, h / height);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (width - sw) / 2;
  const sy = (height - sh) / 2;
  ctx.drawImage(image, sx, sy, sw, sh, x, y, w, h);
}

/** URL copertina che punta a GIF Discord (icona/avatar animato). */
function isAnimatedCoverUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return false;
  const pathPart = raw.split("?")[0].toLowerCase();
  if (pathPart.endsWith(".gif")) return true;
  if (/\/icons\/[^/]+\/a_[^/]+\./i.test(pathPart)) return true;
  if (/\/avatars\/[^/]+\/a_[^/]+\./i.test(pathPart)) return true;
  return false;
}

function measureQuoteLayout(message, username, footerText) {
  const width = QUOTE_WIDTH;
  const height = QUOTE_HEIGHT;
  const leftWidth = QUOTE_LEFT;
  const padding = 48;
  const textX = leftWidth + (width - leftWidth) / 2;
  const maxTextWidth = width - leftWidth - padding * 2;
  const topMargin = 100;
  const bottomMargin = 80;
  const maxBlockHeight = height - topMargin - bottomMargin;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  const mainText = String(message || "").trim();
  let fontSize = 34;
  let lines = [];
  let lineHeight = 40;

  while (fontSize >= 10) {
    ctx.font = fontStack(fontSize, "600");
    lines = wrapLines(ctx, mainText, maxTextWidth);
    lineHeight = Math.round(fontSize * 1.25);
    const blockHeight = lines.length * lineHeight;
    if (blockHeight <= maxBlockHeight) break;
    fontSize -= 2;
  }

  const blockHeight = lines.length * lineHeight;
  const lineStartY = Math.max(topMargin, (height - blockHeight) / 2);

  return {
    width,
    height,
    leftWidth,
    lines,
    fontSize,
    lineHeight,
    textX,
    lineStartY,
    username: username || "",
    footerText: footerText || "",
    mainText,
  };
}

function drawQuoteFrame(ctx, leftImage, layout) {
  const {
    width,
    height,
    leftWidth,
    lines,
    fontSize,
    lineHeight,
    textX,
    lineStartY,
    username,
    footerText,
  } = layout;

  ctx.fillStyle = "#070707";
  ctx.fillRect(0, 0, width, height);

  if (leftImage) drawImageCover(ctx, leftImage, 0, 0, leftWidth, height);

  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(0, 0, leftWidth, height);

  const gradientStart = leftWidth - 40;
  const gradientEnd = leftWidth + 180;
  const gradient = ctx.createLinearGradient(gradientStart, 0, gradientEnd, 0);
  gradient.addColorStop(0, "rgba(0,0,0,0.0)");
  gradient.addColorStop(1, "rgba(0,0,0,1)");
  ctx.fillStyle = gradient;
  ctx.fillRect(gradientStart, 0, width - gradientStart, height);

  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  ctx.font = fontStack(18, "italic");
  drawTextWithSpecialFallback(ctx, username || "", textX, lineStartY - 36, {
    size: 18,
    weight: "italic",
    color: "rgba(255,255,255,0.7)",
    normalizeCompatibility: true,
    forcePrimaryFont: true,
  });

  ctx.font = fontStack(fontSize, "600");
  let y = lineStartY;
  for (const line of lines) {
    if (y + lineHeight > height - 36) break;
    drawLineWithCustomEmoji(ctx, line, textX, y, fontSize, layout.emojiAssets);
    y += lineHeight;
  }

  if (footerText) {
    ctx.font = fontStack(20, "700");
    ctx.textAlign = "right";
    drawTextWithSpecialFallback(ctx, footerText, width - 40, height - 40, {
      size: 20,
      weight: "700",
      color: "rgba(255,255,255,0.9)",
      forcePrimaryFont: true,
    });
  }
}

async function renderSingleQuotePng(leftImage, layout) {
  const canvas = createCanvas(layout.width, layout.height);
  const ctx = canvas.getContext("2d");
  drawQuoteFrame(ctx, leftImage, layout);
  return canvas.toBuffer("image/png");
}

async function fetchCoverBuffer(url) {
  const raw = String(url || "").trim();
  if (!raw) return null;
  try {
    const res = await axios.get(raw, {
      responseType: "arraybuffer",
      timeout: 12_000,
      validateStatus: (s) => s >= 200 && s < 300,
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

async function tryRenderAnimatedQuoteGif(coverImageUrl, layout) {
  if (!ffmpegPath || !isAnimatedCoverUrl(coverImageUrl)) return null;
  const gifBuf = await fetchCoverBuffer(coverImageUrl);
  if (!gifBuf || gifBuf.length < 6) return null;
  const sig = String.fromCharCode(gifBuf[0], gifBuf[1], gifBuf[2]);
  if (sig !== "GIF") return null;

  let tmpDir = "";
  try {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-quote-gif-"));
    const inGif = path.join(tmpDir, "cover.gif");
    fs.writeFileSync(inGif, gifBuf);
    const framePattern = path.join(tmpDir, "qf_%03d.png");
    const extractOk = runFfmpeg([
      "-y",
      "-i",
      inGif,
      "-vf",
      `fps=${QUOTE_GIF_FPS},scale=${QUOTE_LEFT}:${QUOTE_HEIGHT}:flags=lanczos:force_original_aspect_ratio=increase,crop=${QUOTE_LEFT}:${QUOTE_HEIGHT}`,
      "-frames:v",
      String(QUOTE_GIF_FRAMES),
      framePattern,
    ]);
    if (!extractOk) return null;

    const frameFiles = fs
      .readdirSync(tmpDir)
      .filter((n) => /^qf_\d+\.png$/i.test(n))
      .sort((a, b) => a.localeCompare(b, "en"));
    if (frameFiles.length < 2) return null;

    const cardPattern = path.join(tmpDir, "card_%03d.png");
    for (let i = 0; i < frameFiles.length; i += 1) {
      const fp = path.join(tmpDir, frameFiles[i]);
      const leftImg = await safeLoadImage(fp, { suppressWarning: true });
      const canvas = createCanvas(layout.width, layout.height);
      const ctx = canvas.getContext("2d");
      drawQuoteFrame(ctx, leftImg, layout);
      fs.writeFileSync(path.join(tmpDir, `card_${String(i + 1).padStart(3, "0")}.png`), canvas.toBuffer("image/png"));
    }

    const palettePath = path.join(tmpDir, "palette.png");
    const paletteOk = runFfmpeg([
      "-y",
      "-i",
      cardPattern,
      "-vf",
      "palettegen=stats_mode=diff",
      palettePath,
    ]);
    if (!paletteOk) return null;

    const outGifPath = path.join(tmpDir, "quote.gif");
    const gifOk = runFfmpeg([
      "-y",
      "-framerate",
      String(QUOTE_GIF_FPS),
      "-i",
      cardPattern,
      "-i",
      palettePath,
      "-lavfi",
      "paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle",
      "-loop",
      "0",
      outGifPath,
    ]);
    if (!gifOk || !fs.existsSync(outGifPath)) return null;
    const out = fs.readFileSync(outGifPath);
    return out && out.length ? out : null;
  } catch {
    return null;
  } finally {
    if (tmpDir) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * @param {{ coverImageUrl: string, message: string, username: string, footerText?: string }} params
 * @returns {Promise<{ buffer: Buffer, format: 'gif'|'png' }>}
 */
module.exports = async function renderQuoteCanvas(params) {
  if (!canvasModule) throw new Error("Canvas module not available");
  registerCanvasFonts(canvasModule);

  const { coverImageUrl, message, username, footerText } = params;
  const url = String(coverImageUrl || "").trim();
  const layout = measureQuoteLayout(message, username, footerText);
  layout.emojiAssets = await loadEmojiAssets(layout.mainText);

  const gifBuf = await tryRenderAnimatedQuoteGif(url, layout);
  if (gifBuf) return { buffer: gifBuf, format: "gif" };

  const leftImage = url ? await safeLoadImage(url) : null;
  const pngBuf = await renderSingleQuotePng(leftImage, layout);
  return { buffer: pngBuf, format: "png" };
};