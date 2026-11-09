const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");
const { normalizeTextForCanvas } = require("./canvasUtils") as typeof import("./canvasUtils");
const PRIMARY_FONT = "Noto Sans";
const TIBETAN_FONT = "Noto Serif Tibetan";
const SYMBOLS_FONT = "Noto Sans Symbols2";
const COLOR_EMOJI_FONT = "Noto Color Emoji";
const EMOJI_FONT = "Mojangles";
const FRAKTUR_FONT = "UnifrakturMaguntia";
const MATH_FONT = "Noto Sans Math";
const FALLBACK_FONT = "Yu Gothic";
const BASE_STACK =[`"${COLOR_EMOJI_FONT}"`,'"Noto Sans CJK JP"','"Noto Sans CJK SC"','"Noto Sans CJK TC"','"Noto Sans JP"','"Noto Sans KR"','"Noto Sans SC"','"Noto Sans TC"','"Arial Unicode MS"','"DejaVu Sans"','"Segoe UI"','"Calibri"','"Tahoma"','"Segoe UI Emoji"','"Apple Color Emoji"','"Noto Emoji"',`"${SYMBOLS_FONT}"`,'"Segoe UI Symbol"',`"${MATH_FONT}"`,`"${TIBETAN_FONT}"`,`"${FRAKTUR_FONT}"`,`"${EMOJI_FONT}"`,`"${FALLBACK_FONT}"`,'"Arial"',"sans-serif",];
const FONT_STACK = [`"${PRIMARY_FONT}"`, ...BASE_STACK].join(", ");
const NUMERIC_FONT_STACK = [`"${PRIMARY_FONT}"`, '"DejaVu Sans"', '"Segoe UI"', '"Arial"', "sans-serif"].join(", ");
const PRIMARY_ONLY_STACK = [`"${PRIMARY_FONT}"`, '"DejaVu Sans"', '"Arial"', "sans-serif"].join(", ");
let registered = false;

function registerCanvasFonts(canvasModule?) {
  if (registered || !canvasModule?.registerFont) return;
  const notoPath = path.join(__dirname, "Fonts", "NotoSans-Regular.ttf");
  const tibetanPath = path.join(__dirname, "Fonts", "NotoSerifTibetan-Regular.ttf");
  const symbolsPath = path.join(__dirname, "Fonts", "NotoSansSymbols2-Regular.ttf");
  const colorEmojiPath = path.join(__dirname, "Fonts", "NotoColorEmoji_WindowsCompatible.ttf");
  const mojanglesPath = path.join(__dirname, "Fonts", "Mojangles.ttf");
  const frakturPath = path.join(__dirname, "Fonts", "UnifrakturMaguntia-Regular.ttf");
  const mathPath = path.join(__dirname, "Fonts", "NotoSansMath-Regular.ttf");
  const yuPath = path.join(__dirname, "Fonts", "YuGothR.ttc");
  if (fs.existsSync(notoPath)) {
    try {
      canvasModule.registerFont(notoPath, { family: PRIMARY_FONT });
    } catch (err) {
      global.logger?.warn?.("[canvasFonts] registerFont:", err?.message || err);
    }
  }
  if (fs.existsSync(tibetanPath)) {
    try {
      canvasModule.registerFont(tibetanPath, { family: TIBETAN_FONT });
    } catch (err) {
      global.logger?.warn?.("[canvasFonts] registerFont:", err?.message || err);
    }
  }
  if (fs.existsSync(symbolsPath)) {
    try {
      canvasModule.registerFont(symbolsPath, { family: SYMBOLS_FONT });
    } catch (err) {
      global.logger?.warn?.("[canvasFonts] registerFont:", err?.message || err);
    }
  }
  if (fs.existsSync(colorEmojiPath)) {
    try {
      canvasModule.registerFont(colorEmojiPath, { family: COLOR_EMOJI_FONT });
    } catch (err) {
      global.logger?.warn?.("[canvasFonts] registerFont:", err?.message || err);
    }
  }
  if (fs.existsSync(mojanglesPath)) {
    try {
      canvasModule.registerFont(mojanglesPath, { family: EMOJI_FONT });
    } catch (err) {
      global.logger?.warn?.("[canvasFonts] registerFont:", err?.message || err);
    }
  }
  if (fs.existsSync(frakturPath)) {
    try {
      canvasModule.registerFont(frakturPath, { family: FRAKTUR_FONT });
    } catch (err) {
      global.logger?.warn?.("[canvasFonts] registerFont:", err?.message || err);
    }
  }
  if (fs.existsSync(mathPath)) {
    try {
      canvasModule.registerFont(mathPath, { family: MATH_FONT });
    } catch (err) {
      global.logger?.warn?.("[canvasFonts] registerFont:", err?.message || err);
    }
  }
  if (fs.existsSync(yuPath)) {
    try {
      canvasModule.registerFont(yuPath, { family: FALLBACK_FONT });
    } catch (err) {
      global.logger?.warn?.("[canvasFonts] registerFont:", err?.message || err);
    }
  }

  const quoteFontsDir = path.join(__dirname, "Fonts", "quote");
  const quoteFontFiles = [
    ["mplus.ttf", "M PLUS Rounded 1c"],
    ["dela.ttf", "Dela Gothic One"],
    ["dot.ttf", "DotGothic16"],
    ["pop.ttf", "Hachi Maru Pop"],
    ["rampart.ttf", "Rampart One"],
    ["reggae.ttf", "Reggae One"],
    ["rocknroll.ttf", "RocknRoll One"],
    ["yuji.ttf", "Yuji Syuku"],
    ["yusei.ttf", "Yusei Magic"],
    ["jiyu.ttf", "JiyunoTsubasa"],
    ["serif.ttf", "Shippori Mincho"],
    ["bruno.ttf", "Bruno Ace SC"],
    ["castoro.ttf", "Castoro Titling"],
    ["exo2.ttf", "Exo 2"],
    ["inconsolata.ttf", "Inconsolata"],
    ["poltawski.ttf", "Poltawski Nowy"],
    ["script.ttf", "Dancing Script"],
    ["vina.ttf", "Vina Sans"],
  ];
  if (fs.existsSync(quoteFontsDir)) {
    for (const [file, family] of quoteFontFiles) {
      const fp = path.join(quoteFontsDir, file);
      if (!fs.existsSync(fp)) continue;
      try {
        canvasModule.registerFont(fp, { family });
      } catch (err) {
        global.logger?.warn?.("[canvasFonts] quote font:", family, err?.message || err);
      }
    }
  }

  registered = true;
}

function fontStack(size?, weight?) {
  const prefix = weight ? `${weight} ` : "";
  return `${prefix}${size}px ${FONT_STACK}`;
}

function fontStackNumeric(size?, weight?) {
  const prefix = weight ? `${weight} ` : "";
  return `${prefix}${size}px ${NUMERIC_FONT_STACK}`;
}

function fontStackWithPrimary(primary?, size?, weight?) {
  const prefix = weight ? `${weight} ` : "";
  const p = String(primary || PRIMARY_FONT).trim() || PRIMARY_FONT;
  /* rankFontStackFix1: con node-canvas, se dopo un font registerFont metti
     altri font nominati (Arial/Noto/…) il primario viene ignorato.
     Solo `"Family", sans-serif` mantiene Yusei/Dela/ecc. */
  return `${prefix}${size}px "${p}", sans-serif`;
}

function fontStackPrimaryOnly(size?, weight?) {
  const prefix = weight ? `${weight} ` : "";
  return `${prefix}${size}px ${PRIMARY_ONLY_STACK}`;
}

/* Emoji come immagini (Twemoji) anche qui: canvasEmojiRichText registra il tokenizer e la cache
   delle immagini già scaricate. Senza immagine in cache resta il font (come prima). */
let canvasEmojiHook: { tokenize: (text: string) => any[]; cached: (token: any) => any } | null = null;
function registerCanvasEmojiHook(hook?) {
  canvasEmojiHook = hook || null;
}

function drawTextRunsWithEmojiImages(ctx?, value?, x?, y?, font?, align?, baseline?, size?) {
  if (!canvasEmojiHook || !value) return false;
  let tokens;
  try {
    tokens = canvasEmojiHook.tokenize(value);
  } catch {
    return false;
  }
  if (!Array.isArray(tokens) || !tokens.some((t?) => t && t.type !== "text")) return false;
  const parts = tokens.map((t?) => {
    if (t.type === "text") return { kind: "text", value: String(t.value || "") };
    const img = canvasEmojiHook.cached(t.type === "emoji" ? t.value : t);
    return img ? { kind: "img", img } : { kind: "text", value: String(t.value || t.name || "") };
  });
  if (!parts.some((p?) => p.kind === "img")) return false;
  const emojiSize = Math.round(size * 1.08);
  const gap = Math.max(1, Math.round(size * 0.06));
  ctx.font = font;
  let total = 0;
  for (const part of parts) total += part.kind === "img" ? emojiSize + gap * 2 : ctx.measureText(part.value).width;
  let cursorX = x;
  if (align === "center") cursorX = x - total / 2;
  else if (align === "right" || align === "end") cursorX = x - total;
  let top;
  if (baseline === "middle") top = y - emojiSize / 2;
  else if (baseline === "top" || baseline === "hanging") top = y;
  else if (baseline === "bottom" || baseline === "ideographic") top = y - emojiSize;
  else top = y - size * 0.84;
  ctx.textAlign = "left";
  for (const part of parts) {
    if (part.kind === "img") {
      try {
        ctx.drawImage(part.img, cursorX + gap, top, emojiSize, emojiSize);
      } catch {}
      cursorX += emojiSize + gap * 2;
    } else if (part.value) {
      ctx.fillText(part.value, cursorX, y);
      cursorX += ctx.measureText(part.value).width;
    }
  }
  return true;
}

function drawTextWithSpecialFallback(ctx?, text?, x?, y?, options: Record<string, any> = {}) {
  const rawValue = text == null ? "" : String(text);
  let value = options.skipNormalize ? rawValue : normalizeTextForCanvas(rawValue);
  if (options.normalizeCompatibility) value = value.normalize("NFKC");
  const size = options.size || 16;
  const weight = options.weight || "";
  const align = options.align || ctx.textAlign || "left";
  const baseline = options.baseline || ctx.textBaseline || "alphabetic";
  const color = options.color || ctx.fillStyle;
  const useNumericFont = options.useNumericFont === true;
  const forcePrimaryFont = options.forcePrimaryFont === true;
  const normalFont = options.fontCss
    ? String(options.fontCss)
    : forcePrimaryFont
      ? fontStackPrimaryOnly(size, weight)
      : useNumericFont
        ? fontStackNumeric(size, weight)
        : fontStack(size, weight);
  const tibetanFont = fontStackWithPrimary(TIBETAN_FONT, size, weight);
  const hasTibetan = !forcePrimaryFont && /[\u0F00-\u0FFF]/.test(value);
  ctx.save();
  ctx.fillStyle = color;
  ctx.textBaseline = baseline;
  if (!hasTibetan) {
    if (options.noEmojiImages !== true && drawTextRunsWithEmojiImages(ctx, value, x, y, normalFont, align, baseline, size)) {
      ctx.restore();
      return;
    }
    ctx.font = normalFont;
    ctx.textAlign = align;
    ctx.fillText(value, x, y);
    ctx.restore();
    return;
  }

  const runs = [];
  let current = "";
  let currentFont = null;
  for (const ch of Array.from(value)) {
    const cp = ch.codePointAt(0);
    const isTibetanBlock = cp >= 0x0f00 && cp <= 0x0fff;
    const forceNormalForTibetanMark = cp === 0x0f04;
    const nextFont = isTibetanBlock && ! forceNormalForTibetanMark ? tibetanFont:normalFont;
    if (nextFont !== currentFont && current) {
      runs.push({ text: current, font: currentFont });
      current = "";
    }
    current += ch;
    currentFont = nextFont;
  }
  if (current) runs.push({ text: current, font: currentFont });

  let totalWidth = 0;
  for (const run of runs) {
    ctx.font = run.font;
    totalWidth += ctx.measureText(run.text).width;
  }

  let cursorX = x;
  if (align === "center") cursorX = x - totalWidth / 2;
  else if (align === "right") cursorX = x - totalWidth;

  ctx.textAlign = "left";
  for (const run of runs) {
    ctx.font = run.font;
    ctx.fillText(run.text, cursorX, y);
    cursorX += ctx.measureText(run.text).width;
  }
  ctx.restore();
}

export = { registerCanvasFonts, fontStack, fontStackPrimaryOnly, fontStackWithPrimary, drawTextWithSpecialFallback, registerCanvasEmojiHook };