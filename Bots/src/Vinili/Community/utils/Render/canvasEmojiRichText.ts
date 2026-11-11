declare const createCanvas: any; // usato solo dopo typeof createCanvas === "function"
const { drawTextWithSpecialFallback, fontStack, fontStackWithPrimary, registerCanvasEmojiHook } = require("./canvasFonts") as typeof import("./canvasFonts");
const { normalizeTextForCanvas, replaceCanvasCompatChars } = require("./canvasUtils") as typeof import("./canvasUtils");
const { safeLoadImage } = require("./safeLoadImage") as typeof import("./safeLoadImage");

const emojiImageCache = new Map();
const emojiImagePending = new Map();
const CUSTOM_EMOJI_START_RE = /^<(a)?:([a-zA-Z0-9_~]+):(\d{16,22})>/;

function prepareVisibleText(value?) {
  const raw = String(value || "");
  const protectedMap = new Map([
    ["\u00B9", "__VC_KEEP_SUP_1__"],
    ["\u00B2", "__VC_KEEP_SUP_2__"],
    ["\u00B3", "__VC_KEEP_SUP_3__"],
  ]);

  let out = raw;
  for (const [char, token] of protectedMap.entries()) {
    out = out.split(char).join(token);
  }
  out = replaceCanvasCompatChars(out);
  out = normalizeTextForCanvas(out);
  out = out.replace(/[\u{1D400}-\u{1D7FF}]/gu, (ch?) => ch.normalize("NFKC"));

  for (const [char, token] of protectedMap.entries()) {
    out = out.split(token).join(char);
  }

  return out || "-";
}

function shouldSkipRichWrap(text?) {
  return !String(text || "").trim();
}

function resolveRichFontCss(size?, weight?, fontPrimary?) {
  if (fontPrimary) return fontStackWithPrimary(String(fontPrimary), size, weight);
  return fontStack(size, weight);
}

function textWidth(ctx?, text?, size = 16, weight = "600", fontPrimary = null) {
  ctx.save();
  ctx.font = resolveRichFontCss(size, weight, fontPrimary);
  const width = ctx.measureText(String(text || "")).width;
  ctx.restore();
  return width;
}

function drawLabel(
  ctx?,
  text?,
  x?,
  y?,
  {
    size = 16,
    weight = "600",
    color = "#d7dbe3",
    align = "left",
    baseline = "middle",
    useNumericFont = false,
    forcePrimaryFont = false,
    fontPrimary = null,
  } = {},
) {
  const fontCss = fontPrimary ? resolveRichFontCss(size, weight, fontPrimary) : null;
  drawTextWithSpecialFallback(ctx, prepareVisibleText(text), x, y, {
    size,
    weight,
    color,
    align,
    baseline,
    normalizeCompatibility: false,
    useNumericFont: fontPrimary ? false : useNumericFont,
    forcePrimaryFont: fontPrimary ? false : forcePrimaryFont,
    fontCss: fontCss || undefined,
  });
}

function isEmojiCodePoint(cp?) {
  if (!Number.isFinite(cp)) return false;
  if (cp >= 0x1f000 && cp <= 0x1faff) return true;
  if (cp >= 0x2600 && cp <= 0x27bf) return true;
  if (cp >= 0x2300 && cp <= 0x23ff) return true;
  if (cp >= 0x2b00 && cp <= 0x2bff) return true;
  if (
    cp === 0x00a9 ||
    cp === 0x00ae ||
    cp === 0x2122 ||
    cp === 0x3030 ||
    cp === 0x303d
  )
    return true;
  return false;
}

const PICTOGRAPHIC_RE = (() => {
  try {
    return /\p{Extended_Pictographic}/u;
  } catch {
    return null;
  }
})();

function codePointIsEmoji(cp?) {
  if (!Number.isFinite(cp)) return false;
  if (cp >= 0x1f1e6 && cp <= 0x1f1ff) return true;
  if (PICTOGRAPHIC_RE) {
    try {
      if (PICTOGRAPHIC_RE.test(String.fromCodePoint(cp))) return true;
    } catch {
          }
  }
  return isEmojiCodePoint(cp);
}

function isEmojiSkinToneModifier(cp?) {
  return Number.isFinite(cp) && cp >= 0x1f3fb && cp <= 0x1f3ff;
}

function isRegionalIndicator(cp?) {
  return Number.isFinite(cp) && cp >= 0x1f1e6 && cp <= 0x1f1ff;
}

function tokenizeEmojiText(text?) {
  const raw = String(text || "").trim();
  if (!raw) {
    return [{ type: "text", value: "" }];
  }
  const chars = Array.from(prepareVisibleText(raw));
  const tokens = [];
  let buffer = "";
  let emoji = "";

  const flushText = () => {
    if (!buffer) return;
    tokens.push({ type: "text", value: buffer });
    buffer = "";
  };
  const flushEmoji = () => {
    if (!emoji) return;
    tokens.push({ type: "emoji", value: emoji });
    emoji = "";
  };

  for (let i = 0; i < chars.length; i += 1) {
    const rest = chars.slice(i).join("");
    const customMatch = rest.match(CUSTOM_EMOJI_START_RE);
    if (customMatch) {
      flushEmoji();
      flushText();
      tokens.push({
        type: "custom_emoji",
        id: customMatch[3],
        animated: customMatch[1] === "a",
        raw: customMatch[0],
      });
      i += customMatch[0].length - 1;
      continue;
    }

    const ch = chars[i];
    const cp = ch.codePointAt(0);
    const next = chars[i + 1];
    const nextCp = next ? next.codePointAt(0) : null;
    const isJoiner = cp === 0x200d;
    const isVariation = cp === 0xfe0f;
    const isEmoji = codePointIsEmoji(cp);

    if (isEmoji || (emoji && (isJoiner || isVariation))) {
      flushText();
      emoji += ch;
      const nextIsEmoji = codePointIsEmoji(nextCp);
      const nextIsJoiner = nextCp === 0x200d;
      const nextIsVariation = nextCp === 0xfe0f;
      const nextIsSkinTone = isEmojiSkinToneModifier(nextCp);

      if (isJoiner || nextIsJoiner || nextIsVariation) {
        continue;
      }
      if (nextIsSkinTone) {
        continue;
      }
      /* bandiere: due regional indicator restano un'unica emoji (🇮🇹), non I+T */
      if (isRegionalIndicator(cp) && isRegionalIndicator(nextCp)) {
        continue;
      }
      if (isEmoji && nextIsEmoji) {
        flushEmoji();
        continue;
      }
      flushEmoji();
      continue;
    }

    flushEmoji();
    buffer += ch;
  }

  flushEmoji();
  flushText();
  return tokens.length ? tokens : [{ type: "text", value: "" }];
}

/* twitter/twemoji@15 su jsDelivr è 404: senza PNG il canvas fa fillText e “colora” le emoji. */
const TWEMOJI_CDN_BASES = Object.freeze([
  "https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/72x72",
  "https://cdn.jsdelivr.net/gh/jdecked/twemoji@17.0.3/assets/72x72",
  "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72",
  "https://unpkg.com/emoji-datasource-twitter@15.1.0/img/twitter/64",
  "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72",
]);

function emojiStringToCodepoints(emoji?) {
  const raw = String(emoji || "");
  if (!raw) return [];
  const cps = [];
  for (let i = 0; i < raw.length; ) {
    const cp = raw.codePointAt(i);
    if (!Number.isFinite(cp)) break;
    cps.push(cp.toString(16).toLowerCase());
    i += cp > 0xffff ? 2 : 1;
  }
  return cps;
}

function twemojiUrlsFromCodepointList(cps?) {
  if (!Array.isArray(cps) || !cps.length) return [];
  const file = `${cps.join("-")}.png`;
  return TWEMOJI_CDN_BASES.map((base?) => `${base}/${file}`);
}

function emojiDrawSizeForFont(size?) {
  /* rankNickTight1: stessa densità del nick Discord (niente box Twemoji oversized) */
  const n = Math.max(10, Number(size) || 16);
  return Math.round(n);
}

const emojiContentBoxCache = new Map();

/** Bounding box alpha>8 del PNG emoji (cache per url/size). */
function emojiContentBox(img?) {
  try {
    const key = `${img.width}x${img.height}:${img.src || img._src || ""}`;
    if (emojiContentBoxCache.has(key)) return emojiContentBoxCache.get(key);
    const w = Math.max(1, Number(img.width) || 1);
    const h = Math.max(1, Number(img.height) || 1);
    const probe = createOffscreenCanvas(w, h);
    if (!probe) {
      const fallback = { sx: 0, sy: 0, sw: w, sh: h };
      emojiContentBoxCache.set(key, fallback);
      return fallback;
    }
    const pctx = probe.getContext("2d");
    pctx.clearRect(0, 0, w, h);
    pctx.drawImage(img, 0, 0);
    const { data } = pctx.getImageData(0, 0, w, h);
    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const a = data[(y * w + x) * 4 + 3];
        if (a > 8) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    const box =
      maxX < 0
        ? { sx: 0, sy: 0, sw: w, sh: h }
        : {
            sx: minX,
            sy: minY,
            sw: Math.max(1, maxX - minX + 1),
            sh: Math.max(1, maxY - minY + 1),
          };
    emojiContentBoxCache.set(key, box);
    return box;
  } catch {
    const w = Math.max(1, Number(img.width) || 1);
    const h = Math.max(1, Number(img.height) || 1);
    return { sx: 0, sy: 0, sw: w, sh: h };
  }
}

function createOffscreenCanvas(w?, h?) {
  try {
    if (typeof createCanvas === "function") return createCanvas(w, h);
  } catch {
        }
  try {
    const { createCanvas: cc } = require("canvas") as typeof import("canvas");
    return cc(w, h);
  } catch {
    return null;
  }
}

/** Crop al contenuto reale Twemoji (niente padding trasparente). */
function drawEmojiImageTight(ctx?, img?, destX?, destY?, destSize?) {
  const box = emojiContentBox(img);
  ctx.drawImage(img, box.sx, box.sy, box.sw, box.sh, destX, destY, destSize, destSize);
}

function emojiToTwemojiUrls(emoji?) {
  const cps = emojiStringToCodepoints(emoji);
  if (!cps.length) return [];
  const urls = [];
  const pushByCps = (list?) => {
    if (!Array.isArray(list) || !list.length) return;
    for (const url of twemojiUrlsFromCodepointList(list)) {
      if (!urls.includes(url)) urls.push(url);
    }
  };

  pushByCps(cps);

  const withoutVariation = cps.filter((cp?) => cp !== "fe0f");
  pushByCps(withoutVariation);

  const hasVariation = cps.includes("fe0f");
  if (!hasVariation && cps.length === 1) {
    const cpNum = Number.parseInt(cps[0], 16);
    if (Number.isFinite(cpNum) && cpNum >= 0x2600 && cpNum <= 0x27bf) {
      pushByCps([cps[0], "fe0f"]);
    }
  }

  return urls;
}

function customEmojiUrl(id?, animated = false) {
    const ext = "png";
  void animated;
  return `https://cdn.discordapp.com/emojis/${id}.${ext}?size=96`;
}

async function getEmojiImage(token?) {
  const key =
    typeof token === "string"
      ? token
      : `custom:${token.id}:${token.animated ? 1 : 0}`;
  if (emojiImageCache.has(key)) return emojiImageCache.get(key);
  if (emojiImagePending.has(key)) return emojiImagePending.get(key);

  const promise = (async () => {
    const timeoutMs = 2500;
    if (typeof token !== "string") {
      return safeLoadImage(customEmojiUrl(token.id, Boolean(token.animated)), {
        timeoutMs,
        suppressWarning: true,
      }).catch(() => null);
    }
    const sources = emojiToTwemojiUrls(token).slice(0, 4);
    if (!sources.length) return null;
    const img = await Promise.any(
      sources.map((sourceUrl?) =>
        safeLoadImage(sourceUrl, { timeoutMs, suppressWarning: true }).then((loaded?) => {
          if (!loaded) throw new Error("emoji_image_null");
          return loaded;
        }),
      ),
    ).catch(() => null);
    return img || null;
  })();

  emojiImagePending.set(key, promise);
  try {
    const img = await promise;
    if (img) emojiImageCache.set(key, img);
    return img;
  } finally {
    emojiImagePending.delete(key);
  }
}

function tokenWidth(ctx?, token?, size?, weight?, fontPrimary = null) {
  if (token.type === "emoji" || token.type === "custom_emoji") {
    /* content-box emoji ≈ quasi full drawSize */
    return Math.max(1, Math.round(emojiDrawSizeForFont(size) * 0.94));
  }
  return textWidth(ctx, token.value, size, weight, fontPrimary);
}

function measureRichTextWidth(ctx?, text?, size = 16, weight = "600", fontPrimary = null) {
  const tokens = tokenizeEmojiText(text);
  let width = 0;
  for (const token of tokens) {
    width += tokenWidth(ctx, token, size, weight, fontPrimary);
  }
  return width;
}

function fitRichText(ctx?, text?, maxWidth?, size = 16, weight = "600", fallback = "", fontPrimary = null) {
  const value = String(text || "").trim() || String(fallback || "");
  if (!value) return "";
  if (measureRichTextWidth(ctx, value, size, weight, fontPrimary) <= maxWidth) return value;
  const chars = Array.from(value);
  let out = chars;
  const ellipsis = "...";
  while (
    out.length > 1 &&
    measureRichTextWidth(ctx, `${out.join("")}${ellipsis}`, size, weight, fontPrimary) > maxWidth
  ) {
    out = out.slice(0, -1);
  }
  if (!out.length) return ellipsis;
  return `${out.join("")}${ellipsis}`;
}

async function drawLabelWithEmoji(
  ctx?,
  text?,
  x?,
  y?,
  {
    size = 16,
    weight = "600",
    color = "#d7dbe3",
    align = "left",
    baseline = "middle",
    forcePrimaryFont = false,
    useNumericFont = false,
    fontPrimary = null,
  } = {},
) {
  const labelOpts = {
    size,
    weight,
    color,
    align,
    baseline,
    forcePrimaryFont,
    useNumericFont,
    fontPrimary,
  };
  const tokens = tokenizeEmojiText(text);
  const hasEmoji = tokens.some(
    (t?) => t.type === "emoji" || t.type === "custom_emoji",
  );
  if (!hasEmoji) {
    drawLabel(ctx, text, x, y, labelOpts);
    return;
  }

  const total = tokens.reduce(
    (sum?, token?) => sum + tokenWidth(ctx, token, size, weight, fontPrimary),
    0,
  );
  let cursorX = x;
  if (align === "center") cursorX = x - total / 2;
  else if (align === "right") cursorX = x - total;
  let prevKind = "";

  for (const token of tokens) {
    if (token.type === "text") {
      if (token.value) {
        /* rankNickTight1d: testo dopo emoji — pull lieve (no overlap) */
        const textPull =
          prevKind === "emoji" && !/^\s/.test(token.value) ? Math.max(0, Math.round(size * 0.04)) : 0;
        /* richLeadSpace1: drawLabel toglie gli spazi in testa (normalizeTextForCanvas fa trim) ma la larghezza
           li conta: senza questo lo spazio dopo un'emoji "scivola" in fondo alla parola. */
        // la misura del server ignora gli spazi in coda: spazi in testa e in coda si misurano a parte
        const spaceW = (sp?) =>
          sp ? textWidth(ctx, `x${sp}x`, size, weight, fontPrimary) - textWidth(ctx, "xx", size, weight, fontPrimary) : 0;
        const lead = (token.value.match(/^\s+/) || [""])[0];
        const trail = token.value.trim() ? (token.value.match(/\s+$/) || [""])[0] : "";
        const core = token.value.trim();
        const leadW = spaceW(lead);
        drawLabel(ctx, token.value, cursorX - textPull + leadW, y, { ...labelOpts, align: "left" });
        cursorX += leadW + (core ? textWidth(ctx, core, size, weight, fontPrimary) : 0) + spaceW(trail) - textPull;
        prevKind = /\s$/.test(token.value) ? "space" : "text";
      }
      continue;
    }

    const img =
      token.type === "custom_emoji"
        ? await getEmojiImage(token)
        : await getEmojiImage(token.value);
    if (img) {
      const drawSize = emojiDrawSizeForFont(size);
      /* dopo testo: chiudi gap; dopo emoji: advance più corto */
      const pull =
        prevKind === "text" ? Math.max(0, Math.round(drawSize * 0.08)) : 0;
      const adv =
        prevKind === "emoji" ? 0.92 : 0.96;
      let drawY = y;
      if (baseline === "middle") drawY = y - drawSize / 2;
      else if (baseline === "top" || baseline === "alphabetic" || baseline === "hanging")
        drawY = y;
      else if (baseline === "bottom") drawY = y - drawSize;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      drawEmojiImageTight(ctx, img, cursorX - pull, drawY, drawSize);
      cursorX += Math.max(1, Math.round(drawSize * adv) - pull);
      prevKind = "emoji";
    } else if (token.type === "custom_emoji" && token.raw) {
      drawLabel(ctx, token.raw, cursorX, y, { ...labelOpts, align: "left" });
      cursorX += textWidth(ctx, token.raw, size, weight, fontPrimary);
      prevKind = "text";
    } else if (token.type === "emoji" && token.value) {
      const drawSize = emojiDrawSizeForFont(size);
      const pull =
        prevKind === "text" ? Math.max(0, Math.round(drawSize * 0.08)) : 0;
      const adv = prevKind === "emoji" ? 0.92 : 0.96;
      drawTextWithSpecialFallback(ctx, token.value, cursorX - pull + drawSize / 2, y, {
        size,
        weight,
        color,
        align: "center",
        baseline,
        normalizeCompatibility: false,
        forcePrimaryFont: false,
        fontCss: fontPrimary ? resolveRichFontCss(size, weight, fontPrimary) : undefined,
      });
      cursorX += Math.max(1, Math.round(drawSize * adv) - pull);
      prevKind = "emoji";
    } else {
      const drawSize = emojiDrawSizeForFont(size);
      cursorX += Math.max(1, Math.round(drawSize * 0.8));
      prevKind = "emoji";
    }
  }
}

function expandTokensForWrap(tokens?) {
  const out = [];
  for (const t of tokens) {
    if (t.type === "custom_emoji" || t.type === "emoji") {
      out.push(t);
      continue;
    }
    if (t.type === "text") {
      const raw = t.value || "";
      const parts = raw.split(/(\s+)/u);
      for (const p of parts) {
        if (!p) continue;
        if (/^\s+$/u.test(p)) out.push({ type: "space", value: p });
        else out.push({ type: "text", value: p });
      }
    }
  }
  return out;
}

function measureAtomic(ctx?, u?, size?, weight?) {
  if (u.type === "emoji" || u.type === "custom_emoji") {
    return Math.max(1, Math.round(emojiDrawSizeForFont(size) * 0.94));
  }
  return textWidth(ctx, u.value, size, weight);
}

function breakLongTextChunk(ctx?, word?, maxWidth?, size?, weight?) {
  if (textWidth(ctx, word, size, weight) <= maxWidth) return [word];
  const chunks = [];
  let rest = word;
  while (rest.length) {
    let lo = 1;
    let hi = rest.length;
    let best = 1;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const slice = rest.slice(0, mid);
      if (textWidth(ctx, slice, size, weight) <= maxWidth) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (best < 1) best = 1;
    chunks.push(rest.slice(0, best));
    rest = rest.slice(best);
  }
  return chunks;
}

function wrapRichTextToLines(ctx?, text?, maxWidth?, size?, weight?) {
  if (shouldSkipRichWrap(text)) return [];
  const prepared = prepareVisibleText(String(text || "").trim());
  const tokens = tokenizeEmojiText(prepared === "-" ? "" : prepared);
  const units = expandTokensForWrap(tokens);
  if (!units.length) return [];

  const lines = [];
  let cur = [];
  let wsum = 0;

  const flushLine = () => {
    if (!cur.length) return;
    const s = atomicLineToString(cur);
    lines.push(s);
    cur = [];
    wsum = 0;
  };

  for (const u of units) {
    const m = measureAtomic(ctx, u, size, weight);

    if (!cur.length) {
      if (u.type === "text" && m > maxWidth) {
        const parts = breakLongTextChunk(ctx, u.value, maxWidth, size, weight);
        for (let i = 0; i < parts.length; i += 1) {
          const part = parts[i];
          const pseudo = { type: "text", value: part };
          if (i === 0) {
            cur = [pseudo];
            wsum = measureAtomic(ctx, pseudo, size, weight);
          } else {
            lines.push(atomicLineToString([pseudo]));
          }
        }
        continue;
      }
      cur.push(u);
      wsum = m;
      continue;
    }

    if (wsum + m <= maxWidth) {
      cur.push(u);
      wsum += m;
      continue;
    }

    flushLine();

    if (u.type === "text" && m > maxWidth) {
      const parts = breakLongTextChunk(ctx, u.value, maxWidth, size, weight);
      for (let i = 0; i < parts.length; i += 1) {
        const part = parts[i];
        const pseudo = { type: "text", value: part };
        if (i === 0) {
          cur = [pseudo];
          wsum = measureAtomic(ctx, pseudo, size, weight);
        } else {
          lines.push(atomicLineToString([pseudo]));
        }
      }
    } else {
      cur = [u];
      wsum = m;
    }
  }

  flushLine();
  return lines;
}

function atomicLineToString(units?) {
  return units
    .map((u?) => {
      if (u.type === "custom_emoji") return u.raw || "";
      if (u.type === "emoji") return u.value;
      return u.value;
    })
    .join("");
}

function emojiCacheKey(token?) {
  if (typeof token === "string") return token;
  return `custom:${token?.id}:${token?.animated ? 1 : 0}`;
}

/* drawTextWithSpecialFallback (nomi, footer, titoli…) disegna le emoji già in cache come immagini */
registerCanvasEmojiHook({
  tokenize: (text?) => tokenizeEmojiText(text),
  cached: (token?) => emojiImageCache.get(emojiCacheKey(token)) || null,
});

/**
 * Scarica prima le immagini delle emoji presenti nei testi, così i canvas che usano
 * drawTextWithSpecialFallback le disegnano come Twemoji invece che col font di sistema.
 */
async function preloadCanvasEmojis(texts?, timeoutMs = 3000) {
  const list = (Array.isArray(texts) ? texts : [texts]).filter((t?) => typeof t === "string" && t.trim());
  const jobs = [];
  for (const text of list) {
    for (const token of tokenizeEmojiText(text)) {
      if (token.type === "emoji") jobs.push(getEmojiImage(token.value));
      else if (token.type === "custom_emoji") jobs.push(getEmojiImage(token));
    }
  }
  if (!jobs.length) return;
  await Promise.race([
    Promise.allSettled(jobs),
    new Promise((resolve?) => setTimeout(resolve, timeoutMs)),
  ]);
}

export = {
  preloadCanvasEmojis,
  prepareVisibleText,
  tokenizeEmojiText,
  drawLabelWithEmoji,
  wrapRichTextToLines,
  textWidth,
  measureRichTextWidth,
  fitRichText,
  getEmojiImage,
  emojiDrawSizeForFont,
};