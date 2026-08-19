let _canvasModule = null;
function getCanvasModule() { if (!_canvasModule) _canvasModule = require("canvas"); return _canvasModule; }
const { registerCanvasFonts, drawTextWithSpecialFallback } = require("./canvasFonts");
const decodeGif = require("decode-gif");
const { safeLoadImage, fetchHttpImageBuffer } = require("./safeLoadImage");
const { drawActivityGlyph } = require("./canvasIconGlyphs");
const {
  prepareVisibleText,
  drawLabelWithEmoji,
  textWidth,
  wrapRichTextToLines,
} = require("./canvasEmojiRichText");
const STATS_GAP = 22;
const STATS_HEADER_BADGE_W = 340;
const ROME_TIME_ZONE = "Europe/Rome";

/** GIF attività (+me / +server / +channel): `VC_ACTIVITY_CANVAS_GIF=1` per animazione (default: PNG statico). */
const ACTIVITY_CANVAS_GIF = String(process.env.VC_ACTIVITY_CANVAS_GIF ?? "0").trim() === "1";
const ACTIVITY_CANVAS_ANIM_FRAMES = Math.max(
  2,
  Math.min(30, Math.floor(Number(process.env.VC_ACTIVITY_CANVAS_ANIM_FRAMES ?? 12))),
);
/** Un solo frame “fermo” in coda con delay lungo (prima: 20 frame identici ridisegnati). */
const ACTIVITY_CANVAS_STATIC_TAIL_DELAY_MS = Math.max(
  100,
  Math.min(20000, Math.floor(Number(process.env.VC_ACTIVITY_CANVAS_STATIC_TAIL_DELAY_MS ?? 2800))),
);
const ACTIVITY_CHANNEL_ANIM_FRAMES = Math.max(
  2,
  Math.min(30, Math.floor(Number(process.env.VC_ACTIVITY_CHANNEL_ANIM_FRAMES ?? 12))),
);
const STATS_AVATAR_CACHE_TTL_MS = Math.max(
  0,
  Math.min(600_000, Number(process.env.STATS_AVATAR_CACHE_TTL_MS ?? 300_000)),
);
const statsAvatarCache = new Map();

function getStatsAvatarCache(url) {
  if (!STATS_AVATAR_CACHE_TTL_MS) return null;
  const key = String(url || "");
  if (!key) return null;
  const entry = statsAvatarCache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    if (entry) statsAvatarCache.delete(key);
    return null;
  }
  return entry.value;
}

function setStatsAvatarCache(url, value) {
  if (!STATS_AVATAR_CACHE_TTL_MS || !value) return;
  const key = String(url || "");
  if (!key) return;
  statsAvatarCache.set(key, { value, expiresAt: Date.now() + STATS_AVATAR_CACHE_TTL_MS });
  if (statsAvatarCache.size > 250) {
    const oldest = statsAvatarCache.keys().next().value;
    if (oldest) statsAvatarCache.delete(oldest);
  }
}

const STATS_TITLE = "#e8edf2";
const STATS_BODY = "#c5d0db";
const STATS_MUTED = "#97a6b6";
const STATS_VALUE = "#dce6ef";
const STATS_PANEL_GLYPH = "#c6d4e8";
const CHART_LINE_MSG = "#7ab89a";
const CHART_LINE_VOICE = "#a894c4";

function stripBrokenReplacementChars(input) {
  return String(input || "").replace(/\uFFFD/g, "").replace(/\s{2,}/g, " ").trim();
}

/** Rimuove spazi invisibili / ZW e comprime spazi che rompono nomi tipo `i.4m.cris` su canvas. */
function sanitizeDisplayLabel(input) {
  return String(input || "")
    .replace(/[\u00AD\u034F\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
}

function drawSolidStatTitle(ctx, text, x, y, maxWidth, maxSize, minSize, color = STATS_TITLE) {
  const value = prepareVisibleText(String(text || "").trim() || "—");
  const size = getFittedFontSize(ctx, value, maxWidth, maxSize, minSize, "700");
  drawLabel(ctx, value, x, y, { size, weight: "700", color, forcePrimaryFont: true });
}

function formatCanvasDisplayText(input, maxLen = 0) {
  let text = stripBrokenReplacementChars(sanitizeDisplayLabel(String(input || "").trim()));
  if (!text) return "—";
  if (maxLen > 0 && text.length > maxLen) text = `${text.slice(0, Math.max(1, maxLen - 1))}…`;
  return text;
}

function prepareCanvasHeaderText(input, fallback = "—") {
  const text = stripBrokenReplacementChars(sanitizeDisplayLabel(String(input || "").trim()));
  return text || fallback;
}

function formatCanvasChannelLabel(rawName) {
  const cleaned = formatCanvasDisplayText(String(rawName || "").replace(/^#+\s*/, "").trim());
  return cleaned === "—" ? "# —" : `# ${cleaned}`;
}

function dateTextCompact(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: ROME_TIME_ZONE,
  });
}

function roundRectPath(ctx, x, y, w, h, r = 16) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function fillRoundRect(ctx, x, y, w, h, r, color) {
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = color;
  ctx.fill();
}

function strokeRoundRect(ctx, x, y, w, h, r, color, width = 1) {
  roundRectPath(ctx, x, y, w, h, r);
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.stroke();
}

function formatHours(seconds) {
  return (Number(seconds || 0) / 3600).toFixed(2);
}

function compactNumber(value) {
  const n = Number(value || 0);
  if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(2)}k`;
  return `${n}`;
}

function fitText(ctx, text, maxWidth, size = 16, weight = "600") {
  const value = String(text || "").trim();
  if (!value) return "-";
  if (textWidth(ctx, value, size, weight) <= maxWidth) return value;
  const ellipsis = "...";
  let out = value;
  while (
    out.length > 1 &&
    textWidth(ctx, `${out}${ellipsis}`, size, weight) > maxWidth
  ) {
    out = out.slice(0, -1);
  }
  return `${out}${ellipsis}`;
}

function getFittedFontSize(ctx, text, maxWidth, maxSize = 52, minSize = 14, weight = "600") {
  const value = prepareVisibleText(String(text || "").trim());
  if (!value) return maxSize;
  for (let s = maxSize; s >= minSize; s -= 2) {
    if (textWidth(ctx, value, s, weight) <= maxWidth) return s;
  }
  return minSize;
}

/** Una sola riga, larghezza misurata con emoji (Twemoji token width) come in wrapRichTextToLines. */
function getFittedFontSizeOneLineEmoji(ctx, text, maxWidth, maxSize, minSize, weight) {
  const prep = prepareVisibleText(String(text || "").trim());
  if (!prep) return maxSize;
  for (let s = maxSize; s >= minSize; s -= 1) {
    const lines = wrapRichTextToLines(ctx, prep, maxWidth, s, weight);
    if (lines.length <= 1) return s;
  }
  return minSize;
}

/** Titolo su più righe (Twemoji-aware via wrapRichTextToLines) per header stats. */
function computeWrappedTitleLines(ctx, rawText, nameMaxW, options = {}) {
  const weight = options.weight ?? "700";
  const fallback = options.fallback ?? "—";
  const line = stripBrokenReplacementChars(String(rawText || "").trim()) || fallback;
  let size = options.startSize ?? 40;
  const minSize = options.minSize ?? 12;
  const maxLines = options.maxLines ?? 2;
  const prep = prepareVisibleText(line);
  let lines = wrapRichTextToLines(ctx, prep, nameMaxW, size, weight);
  for (; size >= minSize; size -= 1) {
    lines = wrapRichTextToLines(ctx, prep, nameMaxW, size, weight);
    if (lines.length <= maxLines) break;
  }
  if (lines.length > maxLines) lines = lines.slice(0, maxLines);
  const lineHeight = Math.max(22, Math.round(size * 1.28));
  return { source: line, lines, size, lineHeight };
}

function drawLabelFull(ctx, text, x, y, maxWidth, maxSize = 52, options = {}) {
  const value = String(text || "").trim() || "—";
  const size = getFittedFontSize(ctx, value, maxWidth, maxSize, options.minSize ?? 14, options.weight ?? "700");
  drawLabel(ctx, value, x, y, { ...options, size });
}

function drawLabel(
  ctx,
  text,
  x,
  y,
  {
    size = 16,
    weight = "600",
    color = "#d7dbe3",
    align = "left",
    baseline = "middle",
    useNumericFont = false,
    forcePrimaryFont = false,
  } = {},
) {
  drawTextWithSpecialFallback(ctx, prepareVisibleText(text), x, y, {
    size,
    weight,
    color,
    align,
    baseline,
    normalizeCompatibility: false,
    useNumericFont,
    forcePrimaryFont,
  });
}

function drawPanelHeaderGlyph(ctx, glyphKind, rightX, centerY, pixel = 30, color = STATS_PANEL_GLYPH) {
  if (!glyphKind) return;
  const cx = rightX - pixel / 2;
  const haloR = pixel * 0.58;
  ctx.save();
  const glow = ctx.createRadialGradient(cx, centerY, 0, cx, centerY, haloR);
  glow.addColorStop(0, "rgba(160, 188, 220, 0.22)");
  glow.addColorStop(0.55, "rgba(120, 150, 190, 0.08)");
  glow.addColorStop(1, "rgba(120, 150, 190, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, centerY, haloR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  drawActivityGlyph(ctx, glyphKind, cx, centerY, pixel, color);
}

function drawBackground(ctx, width, height) {
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#111722");
  bg.addColorStop(0.55, "#171f2b");
  bg.addColorStop(1, "#121924");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const glowA = ctx.createRadialGradient(180, 80, 10, 180, 80, 260);
  glowA.addColorStop(0, "rgba(88, 136, 255, 0.28)");
  glowA.addColorStop(1, "rgba(88, 136, 255, 0)");
  ctx.fillStyle = glowA;
  ctx.fillRect(0, 0, width, height);

  const glowB = ctx.createRadialGradient(width - 110, height - 120, 20, width - 110, height - 120, 300,);
  glowB.addColorStop(0, "rgba(62, 196, 85, 0.16)");
  glowB.addColorStop(1, "rgba(62, 196, 85, 0)");
  ctx.fillStyle = glowB;
  ctx.fillRect(0, 0, width, height);
}

async function loadAvatarForStatsCanvas(url) {
  if (!url) return null;
  const cached = getStatsAvatarCache(url);
  if (cached) return cached;
  const buf = await fetchHttpImageBuffer(url, { timeoutMs: 4000 }).catch(() => null);
  if (!buf?.length) return null;
  const isGif = buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46;
  let resolved = null;
  if (isGif) {
    try {
      const decoded = decodeGif(buf);
      if (decoded?.frames?.length) {
        resolved = { kind: "gif", width: decoded.width, height: decoded.height, frames: decoded.frames };
      }
    } catch {
    }
    if (!resolved) {
      try {
        const image = await getCanvasModule().loadImage(buf);
        resolved = { kind: "static", image };
      } catch {
        const image = await safeLoadImage(url, { timeoutMs: 4000 }).catch(() => null);
        resolved = image ? { kind: "static", image } : null;
      }
    }
  } else {
    try {
      const image = await getCanvasModule().loadImage(buf);
      resolved = { kind: "static", image };
    } catch {
      const image = await safeLoadImage(url, { timeoutMs: 10000 }).catch(() => null);
      resolved = image ? { kind: "static", image } : null;
    }
  }
  if (resolved) setStatsAvatarCache(url, resolved);
  return resolved;
}

function strokeAvatarRing(ctx, x, y, size, animationPhase) {
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.78)";
  ctx.stroke();
  if (typeof animationPhase === "number" && Number.isFinite(animationPhase)) {
    const pulse = 0.4 + 0.55 * Math.sin(animationPhase * Math.PI * 2);
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2 + 2.5, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(120, 170, 230, ${0.2 + pulse * 0.45})`;
    ctx.lineWidth = 2.2;
    ctx.stroke();
  }
}

function drawImageCover(ctx, img, dx, dy, dSize) {
  const iw = img.width || img.naturalWidth;
  const ih = img.height || img.naturalHeight;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (!iw || !ih) {
    ctx.drawImage(img, dx, dy, dSize, dSize);
    return;
  }
  const scale = Math.max(dSize / iw, dSize / ih);
  const sw = dSize / scale;
  const sh = dSize / scale;
  const sx = Math.max(0, (iw - sw) / 2);
  const sy = Math.max(0, (ih - sh) / 2);
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dSize, dSize);
}

async function drawAvatarCircle(ctx, avatarUrl, x, y, size, animationPhase = null, resolved = null) {
  let r = resolved;
  if (!r && avatarUrl) r = await loadAvatarForStatsCanvas(avatarUrl);
  if (!r) return;

  if (r.kind === "gif") {
    const { width: fw, height: fh, frames } = r;
    const fi = 0;
    const frame = frames[fi];
    if (!frame?.data?.length) return;
    if (!r._scratch) {
      r._scratch = getCanvasModule().createCanvas(fw, fh);
      r._frameImgData = r._scratch.getContext("2d").createImageData(fw, fh);
    }
    const sctx = r._scratch.getContext("2d");
    sctx.clearRect(0, 0, fw, fh);
    r._frameImgData.data.set(frame.data);
    sctx.putImageData(r._frameImgData, 0, 0);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    drawImageCover(ctx, r._scratch, x, y, size);
    ctx.restore();
    strokeAvatarRing(ctx, x, y, size, animationPhase);
    return;
  }

  const image = r.image;
  if (!image) return;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  drawImageCover(ctx, image, x, y, size);
  ctx.restore();
  strokeAvatarRing(ctx, x, y, size, animationPhase);
}

function drawDateBadge(ctx, title, value, x, y, w = 280, h = 80) {
  fillRoundRect(ctx, x, y, w, h, 14, "rgba(43, 52, 67, 0.92)");
  fillRoundRect(ctx, x + 10, y + 10, w - 20, 24, 9, "rgba(88, 99, 120, 0.62)");
  drawLabel(ctx, title, x + 18, y + 22, {
    size: 15,
    weight: "700",
    color: "#e0e5ee",
    forcePrimaryFont: true,
  });
  drawLabel(ctx, fitText(ctx, value, w - 32, 21, "700"), x + 18, y + 55, {
    size: 21,
    weight: "700",
    color: "#f2f5fa",
    useNumericFont: true,
  });
}

function drawDateBadgeCompact(ctx, title, value, x, y, w) {
  const h = 36;
  fillRoundRect(ctx, x, y, w, h, 11, "rgba(43, 52, 67, 0.95)");
  fillRoundRect(ctx, x + 8, y + 5, w - 16, 15, 6, "rgba(88, 99, 120, 0.62)");
  drawLabel(ctx, title, x + 12, y + 14, {
    size: 11,
    weight: "700",
    color: "#e8ecf4",
    forcePrimaryFont: true,
  });
  drawLabel(ctx, fitText(ctx, value, w - 24, 16, "700"), x + 12, y + 27, {
    size: 15,
    weight: "700",
    color: "#f6f8fc",
    useNumericFont: true,
  });
}

function drawDateBadgeStat(ctx, title, value, x, y, w, options = {}) {
  const h = options.h ?? 54;
  const pillH = options.pillH ?? 20;
  const padX = options.padX ?? 10;
  const padY = options.padY ?? 8;
  const pillRx = options.pillRx ?? 8;
  const outerRx = options.outerRx ?? 13;
  const titleSize = options.titleSize ?? 14;
  const valueSize = options.valueSize ?? 20;
  const titleY = options.titleY ?? 20;
  const valueY = options.valueY ?? 40;
  const labelPadX = options.labelPadX ?? 16;
  fillRoundRect(ctx, x, y, w, h, outerRx, "rgba(43, 52, 67, 0.95)");
  fillRoundRect(ctx, x + padX, y + padY, w - padX * 2, pillH, pillRx, "rgba(88, 99, 120, 0.55)");
  drawLabel(ctx, title, x + labelPadX, y + titleY, {
    size: titleSize,
    weight: "700",
    color: STATS_BODY,
    forcePrimaryFont: true,
  });
  drawLabel(ctx, fitText(ctx, value, w - labelPadX * 2, valueSize, "700"), x + labelPadX, y + valueY, {
    size: valueSize,
    weight: "700",
    color: STATS_VALUE,
    useNumericFont: true,
  });
}

function drawMetricPanel(ctx, title, rows, x, y, w, h, options = {}) {
  fillRoundRect(ctx, x, y, w, h, 18, "rgba(46, 55, 70, 0.94)");
  strokeRoundRect(ctx, x, y, w, h, 18, "rgba(255,255,255,0.05)", 1);
  drawLabel(ctx, title, x + 14, y + 22, {
    size: 24,
    weight: "700",
    color: STATS_TITLE,
    forcePrimaryFont: true,
  });
  if (options.glyph) {
    drawPanelHeaderGlyph(ctx, options.glyph, x + w - 18, y + 24);
  } else if (options.icon) {
    drawLabel(ctx, options.icon, x + w - 32, y + 26, {
      size: 20,
      weight: "700",
      color: STATS_MUTED,
      align: "right",
      baseline: "middle",
    });
  }

  const startY = y + 40;
  const bottomPad = options.denseRows ? 6 : 10;
  const innerPad = options.denseRows ? 4 : 8;
  const periodBoxW = options.denseRows ? 62 : 80;
  const rowGap = options.denseRows ? 5 : 8;
  const n = rows.length;
  const rowsAreaH = Math.max(0, h - (startY - y) - bottomPad);
  const gapsTotal = n > 1 ? (n - 1) * rowGap : 0;
  const totalForRows = Math.max(0, rowsAreaH - gapsTotal);
  const baseRowH = n > 0 ? Math.floor(totalForRows / n) : 50;
  const remPx = n > 0 ? totalForRows - baseRowH * n : 0;
  const labelFont = Math.min(
    24,
    Math.max(18, Math.round((baseRowH + (remPx > 0 ? 1 : 0)) * 0.4)),
  );
  let rowCursor = startY;
  for (let i = 0; i < n; i += 1) {
    const rowH = baseRowH + (i < remPx ? 1 : 0);
    const rowY = rowCursor;
    rowCursor += rowH + (i < n - 1 ? rowGap : 0);
    const rowInnerLeft = x + innerPad;
    const rowInnerW = w - innerPad * 2;
    const rowRx = rowH >= 52 ? 12 : 11;
    fillRoundRect(ctx, rowInnerLeft, rowY, rowInnerW, rowH, rowRx, "rgba(19, 26, 37, 0.92)");
    fillRoundRect(ctx, rowInnerLeft, rowY, periodBoxW, rowH, rowRx, "rgba(10, 16, 27, 0.95)");
    const midY = rowY + rowH / 2;
    drawLabel(ctx, rows[i].label, rowInnerLeft + periodBoxW / 2, midY, {
      size: labelFont,
      weight: "700",
      align: "center",
      color: STATS_BODY,
      useNumericFont: true,
    });
    const valueMaxW = rowInnerW - periodBoxW - rowGap - 10;
    const valueRightX = rowInnerLeft + rowInnerW - 6;
    drawLabel(
      ctx,
      fitText(ctx, rows[i].value, valueMaxW, labelFont, "700"),
      valueRightX,
      midY,
      { size: labelFont, weight: "700", align: "right", color: STATS_VALUE, useNumericFont: true },
    );
  }
}

function drawBigLookbackPanel(ctx, title, bigValue, subtitle, x, y, w, h) {
  fillRoundRect(ctx, x, y, w, h, 18, "rgba(46, 55, 70, 0.94)");
  strokeRoundRect(ctx, x, y, w, h, 18, "rgba(255,255,255,0.05)", 1);
  drawLabel(ctx, title, x + 14, y + 22, {
    size: 21,
    weight: "700",
    color: "#e2e7ef",
    forcePrimaryFont: true,
  });
  drawPanelHeaderGlyph(ctx, "bolt", x + w - 18, y + 24);
  const innerPad = 14;
  const innerX = x + innerPad;
  const innerY = y + 46;
  const innerW = w - innerPad * 2;
  const innerH = h - 46 - innerPad;
  fillRoundRect(ctx, innerX, innerY, innerW, innerH, 14, "rgba(28, 36, 50, 0.95)");
  strokeRoundRect(ctx, innerX, innerY, innerW, innerH, 14, "rgba(255,255,255,0.04)", 1);
  const centerX = x + w / 2;
  const contentY = y + h / 2 + 4;
  drawLabel(ctx, String(bigValue), centerX, contentY - 14, {
    size: 44,
    weight: "800",
    color: "#eef3fb",
    align: "center",
    baseline: "middle",
    useNumericFont: true,
  });
  drawLabel(ctx, String(subtitle || ""), centerX, contentY + 20, {
    size: 18,
    weight: "600",
    color: "#8b95a5",
    align: "center",
    baseline: "middle",
  });
}

function drawMetricPanelStatbotRows(ctx, title, rows, x, y, w, h, options = {}) {
  fillRoundRect(ctx, x, y, w, h, 18, "rgba(46, 55, 70, 0.94)");
  strokeRoundRect(ctx, x, y, w, h, 18, "rgba(255,255,255,0.05)", 1);
  drawLabel(ctx, title, x + 14, y + 22, {
    size: 21,
    weight: "700",
    color: STATS_TITLE,
    forcePrimaryFont: true,
  });
  if (options.glyph) {
    drawPanelHeaderGlyph(ctx, options.glyph, x + w - 18, y + 24);
  } else if (options.icon) {
    drawLabel(ctx, options.icon, x + w - 32, y + 26, {
      size: 18,
      weight: "700",
      color: STATS_MUTED,
      align: "right",
      baseline: "middle",
    });
  }
  const rowHeight = 50;
  const startY = y + 42;
  const innerPad = 8;
  const periodBoxW = 80;
  const rowGap = 8;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] || { period: "-", value: "-" };
    const rowY = startY + i * rowHeight;
    const rowInnerLeft = x + innerPad;
    const rowInnerW = w - innerPad * 2;
    fillRoundRect(ctx, rowInnerLeft, rowY, rowInnerW, 50, 11, "rgba(19, 26, 37, 0.92)");
    fillRoundRect(ctx, rowInnerLeft, rowY, periodBoxW, 50, 11, "rgba(10, 16, 27, 0.95)");
    drawLabel(ctx, row.period, rowInnerLeft + periodBoxW / 2, rowY + 25, {
      size: 22,
      weight: "700",
      align: "center",
      color: STATS_BODY,
      useNumericFont: true,
    });
    const valueMaxW = rowInnerW - periodBoxW - rowGap - 10;
    const valueRightX = rowInnerLeft + rowInnerW - 6;
    drawLabel(ctx, fitText(ctx, row.value, valueMaxW, 20, "700"), valueRightX, rowY + 25, {
      size: 20,
      weight: "600",
      align: "right",
      color: STATS_VALUE,
      useNumericFont: true,
    });
  }
}

async function drawTopListCardStatbotStyle(ctx, title, rows, x, y, w, h, options = {}) {
  const unit = String(options.unit || "");
  fillRoundRect(ctx, x, y, w, h, 18, "rgba(46, 55, 70, 0.94)");
  strokeRoundRect(ctx, x, y, w, h, 18, "rgba(255,255,255,0.05)", 1);
  drawLabel(ctx, title, x + 14, y + 22, {
    size: 21,
    weight: "700",
    color: STATS_TITLE,
    forcePrimaryFont: true,
  });
  if (options.glyph) {
    drawPanelHeaderGlyph(ctx, options.glyph, x + w - 18, y + 24);
  } else if (options.icon) {
    drawLabel(ctx, options.icon, x + w - 32, y + 26, {
      size: 18,
      weight: "700",
      color: STATS_MUTED,
      align: "right",
      baseline: "middle",
    });
  }
  const rowHeight = 56;
  const startY = y + 44;
  const rp = 10;
  for (let i = 0; i < 3; i += 1) {
    const row = rows?.[i] || { label: "—", value: "0" };
    const rowY = startY + i * rowHeight;
    const valueText = unit ? `${row.value} ${unit}` : String(row.value ?? "0");
    const labelClean = sanitizeDisplayLabel(prepareVisibleText(row.label || "—"));
    const vw = textWidth(ctx, valueText, 22, "700");
    const labelMax = Math.max(100, w - rp * 2 - Math.min(200, vw + 28));
    await drawLabelWithEmoji(
      ctx,
      fitText(ctx, labelClean, labelMax, 22, "700"),
      x + rp,
      rowY + rowHeight / 2,
      { size: 22, weight: "700", color: STATS_BODY, align: "left" },
    );
    drawLabel(ctx, valueText, x + w - rp, rowY + rowHeight / 2, {
      size: 22,
      weight: "700",
      align: "right",
      color: STATS_VALUE,
      useNumericFont: true,
    });
  }
}

async function drawTopCard(ctx, title, first, second, x, y, w, h, options = {}) {
  const showRank = options.showRank !== false;
  fillRoundRect(ctx, x, y, w, h, 18, "rgba(46, 55, 70, 0.94)");
  strokeRoundRect(ctx, x, y, w, h, 18, "rgba(255,255,255,0.05)", 1);
  drawLabel(ctx, title, x + 12, y + 22, {
    size: 24,
    weight: "700",
    color: STATS_TITLE,
    forcePrimaryFont: true,
  });
  if (options.glyph) {
    drawPanelHeaderGlyph(ctx, options.glyph, x + w - 18, y + 24);
  } else if (options.icon) {
    drawLabel(ctx, options.icon, x + w - 32, y + 26, {
      size: 20,
      weight: "700",
      color: STATS_MUTED,
      align: "right",
      baseline: "middle",
    });
  }

  const edge = options.dense ? 6 : 8;
  const titleBand = 40;
  const bottomPad = options.dense ? 6 : 10;
  const rowGap = options.dense ? 8 : 10;
  const rowsAreaH = Math.max(0, h - titleBand - bottomPad);
  const gapsTotal = rowGap;
  const totalForRows = Math.max(0, rowsAreaH - gapsTotal);
  const baseRowH = Math.floor(totalForRows / 2);
  const remPx = totalForRows - baseRowH * 2;
  const row1H = baseRowH + (remPx > 0 ? 1 : 0);
  const row2H = baseRowH + (remPx > 1 ? 1 : 0);
  const chipW = w - edge * 2;
  let chipY = y + titleBand;
  await drawTopChip(
    ctx,
    first?.label || "-",
    first?.value || "-",
    first?.unit || "",
    1,
    x + edge,
    chipY,
    chipW,
    row1H,
    { showRank },
  );
  chipY += row1H + rowGap;
  await drawTopChip(
    ctx,
    second?.label || "-",
    second?.value || "-",
    second?.unit || "",
    2,
    x + edge,
    chipY,
    chipW,
    row2H,
    { showRank },
  );
}

async function drawTopChip(ctx, label, value, unit, position, x, y, w, h, options = {}) {
  const showRank = options.showRank !== false;
  const rowRx = h >= 58 ? 14 : 12;
  fillRoundRect(ctx, x, y, w, h, rowRx, "rgba(12, 18, 28, 0.95)");
  const safeLabel = sanitizeDisplayLabel(prepareVisibleText(label));
  const valueStr = `${String(value ?? "")}${unit ? ` ${unit}` : ""}`;
  const labelSize = Math.min(26, Math.max(18, Math.round(h * 0.34)));
  const valueSize = Math.min(34, Math.max(20, Math.round(h * 0.4)));
  const rankSize = Math.min(48, Math.max(30, Math.round(h * 0.58)));
  const vw = textWidth(ctx, valueStr, valueSize, "800");
  const labelMax = showRank
    ? w - 360
    : Math.max(
        Math.floor(w * 0.5),
        w - Math.min(Math.floor(w * 0.46), vw + 24),
      );
  const valueRight = showRank ? x + w - 112 : x + w - 10;
  const labelX = x + 14;
  const hashMatch = safeLabel.match(/^#+\s*(.*)$/s);
  if (hashMatch) {
    const channelName = sanitizeDisplayLabel(prepareVisibleText(hashMatch[1] || "—"));
    const hashW = textWidth(ctx, "#", labelSize, "800");
    drawLabel(ctx, "#", labelX, y + h / 2, {
      size: labelSize,
      weight: "800",
      color: STATS_MUTED,
      align: "left",
      forcePrimaryFont: true,
    });
    await drawLabelWithEmoji(
      ctx,
      fitText(ctx, channelName, Math.max(80, labelMax - hashW - 8), labelSize, "700"),
      labelX + hashW + 8,
      y + h / 2,
      { size: labelSize, weight: "700", color: STATS_BODY, align: "left" },
    );
  } else {
    await drawLabelWithEmoji(
      ctx,
      fitText(ctx, safeLabel, labelMax, labelSize, "700"),
      labelX,
      y + h / 2,
      { size: labelSize, weight: "700", color: STATS_BODY, align: "left" },
    );
  }
  drawLabel(ctx, valueStr, valueRight, y + h / 2, {
    size: valueSize,
    weight: "800",
    align: "right",
    color: STATS_VALUE,
    useNumericFont: true,
  });
  if (showRank) {
    drawLabel(ctx, `#${Number(position || 0) || "-"}`, x + w - 10, y + h / 2, {
      size: rankSize,
      weight: "900",
      align: "right",
      color: STATS_TITLE,
      useNumericFont: true,
    });
  }
}

function drawChart(ctx, chart, x, y, w, h, options = {}) {
  const animPhase =
    typeof options.animationPhase === "number" && Number.isFinite(options.animationPhase)
      ? options.animationPhase
      : null;
  const pulse = animPhase == null ? 0 : Math.sin(animPhase * Math.PI * 2);
  const rawReveal = animPhase == null ? 1 : Math.min(1, Math.max(0, animPhase));
  const lineReveal = rawReveal >= 0.998 ? 1 : rawReveal;

  fillRoundRect(ctx, x, y, w, h, 18, "rgba(46, 55, 70, 0.94)");
  strokeRoundRect(ctx, x, y, w, h, 18, "rgba(255,255,255,0.05)", 1);

  drawSolidStatTitle(ctx, "Charts", x + 14, y + 24, w - 200, 24, 14, STATS_TITLE);
  if (options.glyph) {
    drawPanelHeaderGlyph(ctx, options.glyph, x + w - 18, y + 24);
  } else if (options.icon) {
    drawLabel(ctx, options.icon, x + w - 32, y + 26, {
      size: 20,
      weight: "700",
      color: STATS_MUTED,
      align: "right",
      baseline: "middle",
    });
  }
  ctx.fillStyle = CHART_LINE_MSG;
  ctx.beginPath();
  ctx.arc(x + w - 218, y + 24, 4, 0, Math.PI * 2);
  ctx.fill();
  drawLabel(ctx, "Msg", x + w - 206, y + 24, {
    size: 16,
    weight: "700",
    color: STATS_MUTED,
    forcePrimaryFont: true,
  });
  ctx.fillStyle = CHART_LINE_VOICE;
  ctx.beginPath();
  ctx.arc(x + w - 108, y + 24, 4, 0, Math.PI * 2);
  ctx.fill();
  drawLabel(ctx, "Voice", x + w - 96, y + 24, {
    size: 16,
    weight: "700",
    color: STATS_MUTED,
    forcePrimaryFont: true,
  });

  const px = x + 14;
  const py = y + 42;
  const pw = w - 28;
  const ph = h - 56;
  const plotPadX = 8;
  const innerLeft = px + plotPadX;
  const innerW = pw - plotPadX * 2;
  fillRoundRect(ctx, px, py, pw, ph, 12, "rgba(25, 34, 49, 0.98)");
  const points = Array.isArray(chart) ? chart : [];
  if (points.length < 2) return;
  const msgValues = points.map((p) => Number(p?.text || 0));
  const voiceValues = points.map((p) => Number(p?.voiceSeconds || 0) / 3600);
  const maxMsg = Math.max(1, ...msgValues);
  const maxVoice = Math.max(1, ...voiceValues);

  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i += 1) {
    const yy = py + ((ph - 10) * i) / 4;
    ctx.beginPath();
    ctx.moveTo(innerLeft, yy);
    ctx.lineTo(innerLeft + innerW, yy);
    ctx.stroke();
  }

  const nPt = points.length;
  const projectX = (idx) =>
    nPt < 2 ? innerLeft : innerLeft + (idx / (nPt - 1)) * innerW;
  const projectY = (value, seriesMax) => py + ph - (value / Math.max(1, seriesMax)) * (ph - 16) - 8;
  const baseY = py + ph - 6;
  const clipRight = innerLeft + innerW * lineReveal;

  function fillUnderLine(strokeHex, fillTopRgba, values, maxV) {
    const pts = values.map((v, i) => ({
      x: projectX(i),
      y: projectY(v, maxV),
    }));
    ctx.save();
    ctx.beginPath();
    ctx.rect(innerLeft, py, innerW * lineReveal, ph);
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(pts[0].x, baseY);
    pts.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[pts.length - 1].x, baseY);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, py, 0, baseY);
    g.addColorStop(0, fillTopRgba);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.rect(innerLeft, py, innerW * lineReveal, ph);
    ctx.clip();
    ctx.shadowColor = strokeHex;
    ctx.shadowBlur = 8 + (animPhase == null ? 0 : pulse * 3);
    ctx.strokeStyle = strokeHex;
    ctx.lineWidth = 2.6;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    pts.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
    ctx.restore();
  }

  fillUnderLine(CHART_LINE_MSG, "rgba(122, 184, 154, 0.18)", msgValues, maxMsg);
  fillUnderLine(CHART_LINE_VOICE, "rgba(168, 148, 196, 0.16)", voiceValues, maxVoice);

  const ptsMsg = msgValues.map((v, i) => ({
    x: projectX(i),
    y: projectY(v, maxMsg),
  }));
  const ptsVoice = voiceValues.map((v, i) => ({
    x: projectX(i),
    y: projectY(v, maxVoice),
  }));
  const dotR = 3 + (animPhase == null ? 0 : pulse * 0.5);
  [...ptsMsg, ...ptsVoice].forEach((p, idx) => {
    if (p.x > clipRight + 0.5) return;
    const col = idx < ptsMsg.length ? CHART_LINE_MSG : CHART_LINE_VOICE;
    ctx.fillStyle = "#f0f4f8";
    ctx.beginPath();
    ctx.arc(p.x, p.y, dotR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.35;
    ctx.stroke();
  });
}

function drawVoiceOnlyChart(ctx, chart, x, y, w, h, options = {}) {
  const animPhase =
    typeof options.animationPhase === "number" && Number.isFinite(options.animationPhase)
      ? options.animationPhase
      : null;
  const pulse = animPhase == null ? 0 : Math.sin(animPhase * Math.PI * 2);
  const rawReveal = animPhase == null ? 1 : Math.min(1, Math.max(0, animPhase));
  const lineReveal = rawReveal >= 0.998 ? 1 : rawReveal;

  fillRoundRect(ctx, x, y, w, h, 18, "rgba(46, 55, 70, 0.94)");
  strokeRoundRect(ctx, x, y, w, h, 18, "rgba(255,255,255,0.05)", 1);
  drawSolidStatTitle(ctx, "Voice", x + 14, y + 24, w - 60, 24, 14, STATS_TITLE);
  drawPanelHeaderGlyph(ctx, "voice", x + w - 18, y + 24);
  const px = x + 14;
  const py = y + 42;
  const pw = w - 28;
  const ph = h - 56;
  const plotPadX = 8;
  const innerLeft = px + plotPadX;
  const innerW = pw - plotPadX * 2;
  fillRoundRect(ctx, px, py, pw, ph, 12, "rgba(25, 34, 49, 0.98)");
  const points = Array.isArray(chart) ? chart : [];
  if (points.length < 2) return;
  const nPt = points.length;
  const voiceValues = points.map((p) => Number(p?.voiceSeconds || 0) / 3600);
  const maxVoice = Math.max(0.01, ...voiceValues);
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i += 1) {
    const yy = py + ((ph - 10) * i) / 4;
    ctx.beginPath();
    ctx.moveTo(innerLeft, yy);
    ctx.lineTo(innerLeft + innerW, yy);
    ctx.stroke();
  }
  const projectX = (idx) =>
    nPt < 2 ? innerLeft : innerLeft + (idx / (nPt - 1)) * innerW;
  const projectY = (value) => py + ph - (value / maxVoice) * (ph - 16) - 8;
  const baseY = py + ph - 6;
  const pts = voiceValues.map((v, i) => ({ x: projectX(i), y: projectY(v) }));
  const clipRight = innerLeft + innerW * lineReveal;
  ctx.save();
  ctx.beginPath();
  ctx.rect(innerLeft, py, innerW * lineReveal, ph);
  ctx.clip();
  ctx.beginPath();
  ctx.moveTo(pts[0].x, baseY);
  pts.forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.lineTo(pts[pts.length - 1].x, baseY);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, py, 0, baseY);
  g.addColorStop(0, "rgba(168, 148, 196, 0.22)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.rect(innerLeft, py, innerW * lineReveal, ph);
  ctx.clip();
  ctx.shadowColor = CHART_LINE_VOICE;
  ctx.shadowBlur = 8 + (animPhase == null ? 0 : pulse * 3);
  ctx.strokeStyle = CHART_LINE_VOICE;
  ctx.lineWidth = 2.6;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  pts.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.stroke();
  ctx.restore();
  const dotR = 3 + (animPhase == null ? 0 : pulse * 0.5);
  ctx.fillStyle = "#f0f4f8";
  pts.forEach((p) => {
    if (p.x > clipRight + 0.5) return;
    ctx.beginPath();
    ctx.arc(p.x, p.y, dotR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = CHART_LINE_VOICE;
    ctx.lineWidth = 1.35;
    ctx.stroke();
  });
}

function drawMessageOnlyChart(ctx, chart, x, y, w, h, options = {}) {
  const animPhase =
    typeof options.animationPhase === "number" && Number.isFinite(options.animationPhase)
      ? options.animationPhase
      : null;
  const pulse = animPhase == null ? 0 : Math.sin(animPhase * Math.PI * 2);
  const lineReveal = animPhase == null ? 1 : Math.min(1, Math.max(0, animPhase));

  fillRoundRect(ctx, x, y, w, h, 18, "rgba(46, 55, 70, 0.94)");
  strokeRoundRect(ctx, x, y, w, h, 18, "rgba(255,255,255,0.05)", 1);
  drawSolidStatTitle(ctx, "Messaggi", x + 14, y + 24, w - 60, 24, 14, STATS_TITLE);
  drawPanelHeaderGlyph(ctx, "message", x + w - 18, y + 24);
  const px = x + 14;
  const py = y + 42;
  const pw = w - 28;
  const ph = h - 56;
  const plotPadX = 8;
  const innerLeft = px + plotPadX;
  const innerW = pw - plotPadX * 2;
  fillRoundRect(ctx, px, py, pw, ph, 12, "rgba(25, 34, 49, 0.98)");
  const points = Array.isArray(chart) ? chart : [];
  if (points.length < 2) return;
  const nPt = points.length;
  const textValues = points.map((p) => Number(p?.text || 0));
  const maxText = Math.max(0.01, ...textValues);
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i += 1) {
    const yy = py + ((ph - 10) * i) / 4;
    ctx.beginPath();
    ctx.moveTo(innerLeft, yy);
    ctx.lineTo(innerLeft + innerW, yy);
    ctx.stroke();
  }
  const projectX = (idx) =>
    nPt < 2 ? innerLeft : innerLeft + (idx / (nPt - 1)) * innerW;
  const projectY = (value) => py + ph - (value / maxText) * (ph - 16) - 8;
  const baseY = py + ph - 6;
  const pts = textValues.map((v, i) => ({ x: projectX(i), y: projectY(v) }));
  const clipRight = innerLeft + innerW * lineReveal;
  ctx.save();
  ctx.beginPath();
  ctx.rect(innerLeft, py, innerW * lineReveal, ph);
  ctx.clip();
  ctx.beginPath();
  ctx.moveTo(pts[0].x, baseY);
  pts.forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.lineTo(pts[pts.length - 1].x, baseY);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, py, 0, baseY);
  g.addColorStop(0, "rgba(122, 184, 154, 0.22)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.rect(innerLeft, py, innerW * lineReveal, ph);
  ctx.clip();
  ctx.shadowColor = CHART_LINE_MSG;
  ctx.shadowBlur = 8 + (animPhase == null ? 0 : pulse * 3);
  ctx.strokeStyle = CHART_LINE_MSG;
  ctx.lineWidth = 2.6;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  pts.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.stroke();
  ctx.restore();
  const dotR = 3 + (animPhase == null ? 0 : pulse * 0.5);
  ctx.fillStyle = "#f0f4f8";
  pts.forEach((p) => {
    if (p.x > clipRight + 0.5) return;
    ctx.beginPath();
    ctx.arc(p.x, p.y, dotR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = CHART_LINE_MSG;
    ctx.lineWidth = 1.35;
    ctx.stroke();
  });
}

async function paintChannelActivityCanvas(
  ctx,
  {
    channelName,
    channelIconUrl,
    createdOn,
    joinedOn,
    lookbackDays,
    windows,
    topUsersText,
    topUsersVoice,
    chart,
    isTextChannel,
    guildName,
  },
  animationPhase = 0,
  channelIconResolved = null,
) {
  const safeLookback = [1, 7, 14, 21, 30].includes(Number(lookbackDays)) ? Number(lookbackDays) : 14;
  const lookbackWindow = windows?.[`d${safeLookback}`] || windows?.d14 || {};
  const width = 1280;
  const height = 900;

  const M = 20;
  const GAP = STATS_GAP;
  const topRowH = 248;
  const contentW = width - M * 2;
  const topPanelW = Math.floor((contentW - GAP * 2) / 3);
  const topX2 = M + topPanelW + GAP;
  const topX3 = topX2 + topPanelW + GAP;
  const bottomPanelW = Math.floor((contentW - GAP) / 2);
  const bottomX2 = M + bottomPanelW + GAP;

  drawBackground(ctx, width, height);

  const avatarSize = 96;
  const avatarX = M + 8;
  const textLeft = avatarX + avatarSize + 20;
  const statBadgeW = STATS_HEADER_BADGE_W;
  const badgeX = width - M - statBadgeW;
  const nameMaxW = Math.max(320, badgeX - textLeft - 16);
  const chTitleRaw = sanitizeDisplayLabel(
    prepareVisibleText(String(channelName || "").replace(/^#+\s*/, "").trim() || "channel"),
  );
  const chLayout = computeWrappedTitleLines(ctx, chTitleRaw, nameMaxW, {
    startSize: 54,
    minSize: 20,
    weight: "700",
    maxLines: 2,
    fallback: "channel",
  });
  const guildPrepared = prepareVisibleText(prepareCanvasHeaderText(guildName, "Server"));
  const guildLayout = computeWrappedTitleLines(ctx, guildPrepared, nameMaxW, {
    startSize: 24,
    minSize: 14,
    weight: "600",
    maxLines: 3,
    fallback: "Server",
  });
  const chLineH = Math.max(22, Math.round(chLayout.size * 1.08));
  const chBlockH = chLayout.lines.length * chLineH;
  const guildGap = 4;
  const guildLineH = Math.max(18, Math.round(guildLayout.size * 1.06));
  const guildBlockH = guildLayout.lines.length * guildLineH;
  const textBlockH = chBlockH + guildGap + guildBlockH;
  const badgeH = 58;
  const badgeGap = 8;
  const badgeStackH = badgeH + badgeGap + badgeH;
  const headerPadY = 10;
  const headerBandH = Math.max(textBlockH + headerPadY * 2, badgeStackH + headerPadY * 2, avatarSize + headerPadY * 2);
  const textBlockTop = 16 + headerPadY;
  const avatarY = 16 + Math.max(0, (headerBandH - avatarSize) / 2);
  const badgeColY = 16 + headerPadY;
  const contentTop = 16 + headerBandH + 14;
  const bottomRowH = 220;
  const bottomTop = contentTop + topRowH + GAP;
  const channelDateBadgeOpts = {
    h: badgeH,
    pillH: 22,
    padX: 10,
    padY: 8,
    pillRx: 8,
    outerRx: 12,
    titleSize: 14,
    valueSize: 22,
    titleY: 19,
    valueY: 42,
    labelPadX: 14,
  };

  fillRoundRect(ctx, M, 16, contentW, headerBandH, 22, "rgba(32, 42, 57, 0.9)");
  strokeRoundRect(ctx, M, 16, contentW, headerBandH, 22, "rgba(255,255,255,0.06)", 1);

  if (channelIconUrl && !isTextChannel) {
    await drawAvatarCircle(ctx, channelIconUrl, avatarX, avatarY, avatarSize, animationPhase, channelIconResolved);
  } else {
    fillRoundRect(ctx, avatarX, avatarY, avatarSize, avatarSize, avatarSize / 2, "rgba(50, 60, 75, 0.95)");
    drawActivityGlyph(ctx, "hash", avatarX + avatarSize / 2, avatarY + avatarSize / 2, 38, STATS_PANEL_GLYPH);
  }
  for (let li = 0; li < chLayout.lines.length; li += 1) {
    const y = textBlockTop + chLineH / 2 + li * chLineH;
    await drawLabelWithEmoji(ctx, chLayout.lines[li], textLeft, y, {
      size: chLayout.size,
      weight: "700",
      color: STATS_TITLE,
      forcePrimaryFont: true,
    });
  }
  for (let li = 0; li < guildLayout.lines.length; li += 1) {
    const y = textBlockTop + chBlockH + guildGap + guildLineH / 2 + li * guildLineH;
    await drawLabelWithEmoji(ctx, guildLayout.lines[li], textLeft, y, {
      size: guildLayout.size,
      weight: "600",
      color: "#d2dce8",
      forcePrimaryFont: true,
    });
  }
  drawDateBadgeStat(ctx, "Created", dateTextCompact(createdOn), badgeX, badgeColY, statBadgeW, channelDateBadgeOpts);
  drawDateBadgeStat(ctx, "Joined", dateTextCompact(joinedOn), badgeX, badgeColY + badgeH + badgeGap, statBadgeW, channelDateBadgeOpts);

  if (isTextChannel) {
    drawMetricPanel(
      ctx,
      "Channel Lookback",
      [
        { label: "1d", value: `${compactNumber(windows?.d1?.text || 0)} messages` },
        { label: "7d", value: `${compactNumber(windows?.d7?.text || 0)} messages` },
        { label: `${safeLookback}d`, value: `${compactNumber(lookbackWindow?.text || 0)} messages` },
      ],
      M,
      contentTop,
      topPanelW,
      topRowH,
      { glyph: "message" },
    );
    drawMetricPanel(
      ctx,
      "Contributors",
      [
        { label: "1d", value: `${Number(windows?.d1?.contributors || 0)} members` },
        { label: "7d", value: `${Number(windows?.d7?.contributors || 0)} members` },
        { label: `${safeLookback}d`, value: `${Number(lookbackWindow?.contributors || 0)} members` },
      ],
      topX2,
      contentTop,
      topPanelW,
      topRowH,
      { glyph: "users" },
    );
    drawMetricPanel(
      ctx,
      "Messages",
      [
        { label: "1d", value: `${compactNumber(windows?.d1?.text || 0)} messages` },
        { label: "7d", value: `${compactNumber(windows?.d7?.text || 0)} messages` },
        { label: "30d", value: `${compactNumber(windows?.d30?.text || 0)} messages` },
      ],
      topX3,
      contentTop,
      topPanelW,
      topRowH,
      { glyph: "message" },
    );
    const topText = topUsersText || [];
    await drawTopCard(
      ctx,
      "Top Members",
      {
        label: topText[0]?.label || "-",
        value: compactNumber(topText[0]?.value || 0),
        unit: "msg",
      },
      {
        label: topText[1]?.label || "-",
        value: compactNumber(topText[1]?.value || 0),
        unit: "msg",
      },
      M,
      bottomTop,
      bottomPanelW,
      bottomRowH,
      { showRank: false, dense: true, glyph: "message" },
    );
    drawChart(ctx, chart, bottomX2, bottomTop, bottomPanelW, bottomRowH, { animationPhase, glyph: "chart" });
  } else {
    drawMetricPanel(
      ctx,
      "Channel Lookback",
      [
        { label: "1d", value: `${formatHours(windows?.d1?.voiceSeconds || 0)} hours` },
        { label: "7d", value: `${formatHours(windows?.d7?.voiceSeconds || 0)} hours` },
        { label: `${safeLookback}d`, value: `${formatHours(lookbackWindow?.voiceSeconds || 0)} hours` },
      ],
      M,
      contentTop,
      topPanelW,
      topRowH,
      { glyph: "voice" },
    );
    drawMetricPanel(
      ctx,
      "Contributors",
      [
        { label: "1d", value: `${Number(windows?.d1?.contributors || 0)} members` },
        { label: "7d", value: `${Number(windows?.d7?.contributors || 0)} members` },
        { label: `${safeLookback}d`, value: `${Number(lookbackWindow?.contributors || 0)} members` },
      ],
      topX2,
      contentTop,
      topPanelW,
      topRowH,
      { glyph: "users" },
    );
    drawMetricPanel(
      ctx,
      "Voice Activity",
      [
        { label: "1d", value: `${formatHours(windows?.d1?.voiceSeconds || 0)} hours` },
        { label: "7d", value: `${formatHours(windows?.d7?.voiceSeconds || 0)} hours` },
        { label: "30d", value: `${formatHours(windows?.d30?.voiceSeconds || 0)} hours` },
      ],
      topX3,
      contentTop,
      topPanelW,
      topRowH,
      { glyph: "voice" },
    );
    const topVoice = topUsersVoice || [];
    await drawTopCard(
      ctx,
      "Top Members",
      {
        label: topVoice[0]?.label || "-",
        value: formatHours(topVoice[0]?.value || 0),
        unit: "h",
      },
      {
        label: topVoice[1]?.label || "-",
        value: formatHours(topVoice[1]?.value || 0),
        unit: "h",
      },
      M,
      bottomTop,
      bottomPanelW,
      bottomRowH,
      { showRank: false, dense: true, glyph: "voice" },
    );
    drawChart(ctx, chart, bottomX2, bottomTop, bottomPanelW, bottomRowH, { animationPhase, glyph: "chart" });
  }

  drawLabel(ctx, `Lookback: Last ${safeLookback} days`, M, height - 20, {
    size: 18,
    weight: "700",
    color: STATS_MUTED,
    forcePrimaryFont: true,
  });
}

async function renderChannelActivityCanvas(props) {
  registerCanvasFonts(getCanvasModule());
  const width = 1280;
  const height = 900;
  const channelIconResolved =
    props.channelIconPrefetch ??
    (props.channelIconUrl ? await loadAvatarForStatsCanvas(props.channelIconUrl) : null);
  let GIFEncoder = null;
  try {
    GIFEncoder = require("gif-encoder-2");
  } catch {
    GIFEncoder = null;
  }

  if (!GIFEncoder || !ACTIVITY_CANVAS_GIF) {
    const canvas = getCanvasModule().createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    await paintChannelActivityCanvas(ctx, props, null, channelIconResolved);
    return canvas.toBuffer("image/png");
  }

  const frameCount = ACTIVITY_CHANNEL_ANIM_FRAMES;
  const encoder = new GIFEncoder(width, height);
  encoder.start();
  encoder.setRepeat(0);
  encoder.setDelay(72);
  encoder.setQuality(12);
  const canvas = getCanvasModule().createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  for (let f = 0; f < frameCount; f += 1) {
    await paintChannelActivityCanvas(ctx, props, frameCount > 1 ? f / (frameCount - 1) : 1, channelIconResolved);
    encoder.addFrame(ctx.getImageData(0, 0, width, height).data);
  }
  encoder.finish();
  return Buffer.from(encoder.out.getData());
}

async function drawTopListCard(ctx, title, rows, x, y, w, h, options = {}) {
  const unit = String(options.unit || "");
  fillRoundRect(ctx, x, y, w, h, 18, "rgba(46, 55, 70, 0.94)");
  strokeRoundRect(ctx, x, y, w, h, 18, "rgba(255,255,255,0.05)", 1);
  drawLabel(ctx, title, x + 12, y + 22, {
    size: 21,
    weight: "700",
    color: STATS_TITLE,
    forcePrimaryFont: true,
  });
  if (options.glyph) {
    drawPanelHeaderGlyph(ctx, options.glyph, x + w - 18, y + 24);
  } else if (options.icon) {
    drawLabel(ctx, options.icon, x + w - 32, y + 26, {
      size: 20,
      weight: "700",
      color: STATS_MUTED,
      align: "right",
      baseline: "middle",
    });
  }

  const rowHeight = 62;
  const gap = 6;
  const startY = y + 42;

  const rowPad = 8;
  for (let i = 0; i < 3; i += 1) {
    const row = rows?.[i] || { label: "N/A", value: 0 };
    const rowY = startY + i * (rowHeight + gap);
    fillRoundRect(ctx, x + rowPad, rowY, w - rowPad * 2, rowHeight, 12, "rgba(12, 18, 28, 0.95)");
    fillRoundRect(ctx, x + rowPad, rowY, 74, rowHeight, 12, "rgba(10, 16, 27, 0.95)");

    drawLabel(ctx, String(i + 1), x + rowPad + 37, rowY + rowHeight / 2, {
      size: 22,
      weight: "800",
      color: STATS_BODY,
      align: "center",
      useNumericFont: true,
    });

    const valueText = unit ? `${row.value} ${unit}` : String(row.value ?? 0);
    const vw = textWidth(ctx, valueText, 24, "800");
    const labelMax = Math.max(120, w - rowPad * 2 - 74 - Math.min(200, vw + 36));
    const labelClean = sanitizeDisplayLabel(prepareVisibleText(row.label || "N/A"));
    await drawLabelWithEmoji(
      ctx,
      fitText(ctx, labelClean, labelMax, 24, "700"),
      x + rowPad + 74 + 10,
      rowY + rowHeight / 2,
      { size: 24, weight: "700", color: STATS_BODY, align: "left" },
    );

    const valueWidth = Math.min(w - rowPad * 2 - 74, Math.max(110, vw + 26),);
    fillRoundRect(
      ctx,
      x + w - rowPad - valueWidth,
      rowY + 10,
      valueWidth,
      rowHeight - 20,
      10,
      "rgba(30, 39, 54, 0.95)",
    );
    drawLabel(ctx, valueText, x + w - rowPad - 10, rowY + rowHeight / 2, {
      size: 24,
      weight: "800",
      color: STATS_VALUE,
      align: "right",
      useNumericFont: true,
    });
  }
}

function dateText(value) {
  if (!value) return "N/A";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "N/A";
  return d.toLocaleDateString("en-US", {
    timeZone: ROME_TIME_ZONE,
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

async function paintUserActivityCanvas(
  ctx,
  {
    guildName,
    userTag,
    displayName,
    avatarUrl,
    createdOn,
    joinedOn,
    lookbackDays,
    windows,
    ranks,
    topChannelsText,
    topChannelsVoice,
    chart,
  },
  animationPhase = 0,
  avatarResolved = null,
) {
  const safeLookback = [1, 7, 14, 21, 30].includes(Number(lookbackDays)) ? Number(lookbackDays) : 14;
  const lookbackKey = `d${safeLookback}`;
  const lookbackWindow = windows?.[lookbackKey] || windows?.d14 || {};
  const width = 1280;
  const height = 740;
  const rightColW = STATS_HEADER_BADGE_W;
  const rightColX = width - 20 - rightColW;
  const avatarSize = 96;
  const avatarX = 28;
  const textLeft = avatarX + avatarSize + 20;
  const guildTitleMax = Math.max(320, rightColX - textLeft - 16);

  drawBackground(ctx, width, height);

  const displayFull = sanitizeDisplayLabel(String(displayName || userTag || "").trim()) || "—";
  const displayLayout = computeWrappedTitleLines(ctx, displayFull, guildTitleMax, {
    startSize: 58,
    minSize: 20,
    weight: "700",
    maxLines: 2,
    fallback: "—",
  });
  const guildPrepared = prepareVisibleText(prepareCanvasHeaderText(guildName, "Server"));
  const guildLayout = computeWrappedTitleLines(ctx, guildPrepared, guildTitleMax, {
    startSize: 26,
    minSize: 14,
    weight: "600",
    maxLines: 3,
    fallback: "Server",
  });
  const displayLineH = Math.max(22, Math.round(displayLayout.size * 1.06));
  const guildGap = 3;
  const guildLineH = Math.max(18, Math.round(guildLayout.size * 1.06));
  const displayBlockH = displayLayout.lines.length * displayLineH;
  const guildBlockH = guildLayout.lines.length * guildLineH;
  const textBlockH = displayBlockH + guildGap + guildBlockH;
  const badgeH = 58;
  const badgeGap = 8;
  const badgeStackH = badgeH + badgeGap + badgeH;
  const headerPadY = 10;
  const headerBarH = Math.max(textBlockH + headerPadY * 2, badgeStackH + headerPadY * 2, avatarSize + headerPadY * 2);
  const textBlockTop = 16 + headerPadY;
  const avatarY = 16 + Math.max(0, (headerBarH - avatarSize) / 2);
  const userDateBadgeOpts = {
    h: badgeH,
    pillH: 22,
    padX: 10,
    padY: 8,
    pillRx: 8,
    outerRx: 12,
    titleSize: 14,
    valueSize: 22,
    titleY: 19,
    valueY: 42,
    labelPadX: 14,
  };

  fillRoundRect(ctx, 20, 16, 1240, headerBarH, 22, "rgba(32, 42, 57, 0.9)");
  strokeRoundRect(ctx, 20, 16, 1240, headerBarH, 22, "rgba(255,255,255,0.06)", 1);

  await drawAvatarCircle(ctx, avatarUrl, avatarX, avatarY, avatarSize, animationPhase, avatarResolved);
  for (let li = 0; li < displayLayout.lines.length; li += 1) {
    const y = textBlockTop + displayLineH / 2 + li * displayLineH;
    await drawLabelWithEmoji(ctx, displayLayout.lines[li], textLeft, y, {
      size: displayLayout.size,
      weight: "700",
      color: STATS_TITLE,
      forcePrimaryFont: true,
    });
  }
  for (let li = 0; li < guildLayout.lines.length; li += 1) {
    const y = textBlockTop + displayBlockH + guildGap + guildLineH / 2 + li * guildLineH;
    await drawLabelWithEmoji(ctx, guildLayout.lines[li], textLeft, y, {
      size: guildLayout.size,
      weight: "600",
      color: "#d2dce8",
      forcePrimaryFont: true,
    });
  }

  const badgeColY = 16 + Math.max(4, (headerBarH - badgeStackH) / 2);
  drawDateBadgeStat(ctx, "Created", dateTextCompact(createdOn), rightColX, badgeColY, rightColW, userDateBadgeOpts);
  drawDateBadgeStat(ctx, "Joined", dateTextCompact(joinedOn), rightColX, badgeColY + badgeH + badgeGap, rightColW, userDateBadgeOpts);

  const userMetricsTop = 16 + headerBarH + 14;
  const userTopRowY = userMetricsTop + 236 + STATS_GAP;

  drawMetricPanel(
    ctx,
    "Server Ranks",
    [
      { label: "Text", value: `#${ranks?.text || "-"}` },
      { label: "Voice", value: `#${ranks?.voice || "-"}` },
    ],
    20,
    userMetricsTop,
    400,
    236,
    { glyph: "trophy", denseRows: true },
  );

  drawMetricPanel(
    ctx,
    "Messaggi",
    [
      { label: "1d", value: `${compactNumber(windows?.d1?.text)} msg` },
      { label: "7d", value: `${compactNumber(windows?.d7?.text)} msg` },
      {
        label: `${safeLookback}d`,
        value: `${compactNumber(lookbackWindow?.text)} msg`,
      },
    ],
    440,
    userMetricsTop,
    400,
    236,
    { glyph: "message", denseRows: true },
  );

  drawMetricPanel(
    ctx,
    "Voice Activity",
    [
      { label: "1d", value: `${formatHours(windows?.d1?.voiceSeconds)} h` },
      { label: "7d", value: `${formatHours(windows?.d7?.voiceSeconds)} h` },
      {
        label: `${safeLookback}d`,
        value: `${formatHours(lookbackWindow?.voiceSeconds)} h`,
      },
    ],
    860,
    userMetricsTop,
    400,
    236,
    { glyph: "voice", denseRows: true },
  );

  await drawTopCard(
    ctx,
    "Top Channels",
    {
      label: topChannelsText?.[0]?.label || "#-",
      value: compactNumber(topChannelsText?.[0]?.value || 0),
      unit: "msg",
    },
    {
      label: topChannelsVoice?.[0]?.label || "#-",
      value: formatHours(topChannelsVoice?.[0]?.value || 0),
      unit: "h",
    },
    20,
    userTopRowY,
    610,
    242,
    { showRank: false, glyph: "chart", dense: true },
  );

  drawChart(ctx, chart, 650, userTopRowY, 610, 242, {
    glyph: "chart",
    animationPhase,
  });
  drawLabel(ctx, `Lookback: Last ${safeLookback} days`, 32, height - 22, {
    size: 22,
    weight: "700",
    color: "#b9c7d9",
    forcePrimaryFont: true,
  });
}

async function renderUserActivityCanvas(props) {
  registerCanvasFonts(getCanvasModule());
  const width = 1280;
  const height = 740;
  const avatarResolved =
    props.avatarPrefetch ?? (props.avatarUrl ? await loadAvatarForStatsCanvas(props.avatarUrl) : null);
  let GIFEncoder = null;
  try {
    GIFEncoder = require("gif-encoder-2");
  } catch {
    GIFEncoder = null;
  }

  if (!GIFEncoder || !ACTIVITY_CANVAS_GIF) {
    const canvas = getCanvasModule().createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    await paintUserActivityCanvas(ctx, props, null, avatarResolved);
    return canvas.toBuffer("image/png");
  }

  const animFrames = ACTIVITY_CANVAS_ANIM_FRAMES;
  const encoder = new GIFEncoder(width, height);
  encoder.start();
  encoder.setRepeat(0);
  encoder.setDelay(72);
  encoder.setQuality(12);
  const canvas = getCanvasModule().createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  for (let f = 0; f < animFrames; f += 1) {
    const phase = animFrames > 1 ? f / (animFrames - 1) : 1;
    await paintUserActivityCanvas(ctx, props, phase, avatarResolved);
    encoder.addFrame(ctx.getImageData(0, 0, width, height).data);
  }
  encoder.setDelay(ACTIVITY_CANVAS_STATIC_TAIL_DELAY_MS);
  await paintUserActivityCanvas(ctx, props, 1, avatarResolved);
  encoder.addFrame(ctx.getImageData(0, 0, width, height).data);
  encoder.finish();
  return Buffer.from(encoder.out.getData());
}

async function paintServerActivityCanvas(
  ctx,
  {
    guildName,
    guildIconUrl,
    createdOn,
    invitedBotOn,
    lookbackDays,
    windows,
    topUsersText,
    topUsersVoice,
    topChannelsText,
    topChannelsVoice,
    chart,
  },
  animationPhase = 0,
  guildIconResolved = null,
) {
  const safeLookback = [1, 7, 14, 21, 30].includes(Number(lookbackDays)) ? Number(lookbackDays) : 14;
  const lookbackKey = `d${safeLookback}`;
  const lookbackWindow = windows?.[lookbackKey] || windows?.d14 || {};
  const width = 1280;
  const height = 940;

  drawBackground(ctx, width, height);

  const avatarSize = 96;
  const avatarX = 28;
  const textLeft = avatarX + avatarSize + 20;
  const statBadgeW = STATS_HEADER_BADGE_W;
  const badgeX = width - 20 - statBadgeW;
  const nameMaxW = Math.max(320, badgeX - textLeft - 16);
  const guildPrepared = prepareVisibleText(prepareCanvasHeaderText(guildName, "Server"));
  const guildLayout = computeWrappedTitleLines(ctx, guildPrepared, nameMaxW, {
    startSize: 50,
    minSize: 16,
    weight: "700",
    maxLines: 3,
    fallback: "Server",
  });
  const subtitleStr = "Server Overview";
  const subSize = getFittedFontSize(ctx, subtitleStr, nameMaxW, 22, 14, "600");
  const guildLineH = Math.max(20, Math.round(guildLayout.size * 1.06));
  const guildBlockH = guildLayout.lines.length * guildLineH;
  const titleSubGap = 3;
  const subLineH = Math.max(16, Math.round(subSize * 1.04));
  const textBlockH = guildBlockH + titleSubGap + subLineH;
  const badgeH = 58;
  const badgeGap = 8;
  const badgeStackH = badgeH + badgeGap + badgeH;
  const headerPadY = 10;
  const headerBandH = Math.max(textBlockH + headerPadY * 2, badgeStackH + headerPadY * 2, avatarSize + headerPadY * 2);
  const textBlockTop = 16 + headerPadY;
  const subtitleY = textBlockTop + guildBlockH + titleSubGap + subLineH / 2;
  const avatarY = 16 + Math.max(0, (headerBandH - avatarSize) / 2);
  const badgeColY = 16 + headerPadY;
  const serverDateBadgeOpts = {
    h: badgeH,
    pillH: 22,
    padX: 10,
    padY: 8,
    pillRx: 8,
    outerRx: 12,
    titleSize: 14,
    valueSize: 22,
    titleY: 19,
    valueY: 42,
    labelPadX: 14,
  };

  fillRoundRect(ctx, 20, 16, 1240, headerBandH, 22, "rgba(32, 42, 57, 0.9)");
  strokeRoundRect(ctx, 20, 16, 1240, headerBandH, 22, "rgba(255,255,255,0.06)", 1);

  await drawAvatarCircle(ctx, guildIconUrl, avatarX, avatarY, avatarSize, animationPhase, guildIconResolved);
  for (let li = 0; li < guildLayout.lines.length; li += 1) {
    const y = textBlockTop + guildLineH / 2 + li * guildLineH;
    await drawLabelWithEmoji(ctx, guildLayout.lines[li], textLeft, y, {
      size: guildLayout.size,
      weight: "700",
      color: "#e8eef5",
      forcePrimaryFont: true,
    });
  }
  drawLabel(ctx, subtitleStr, textLeft, subtitleY, {
    size: subSize,
    weight: "600",
    color: "#a8b6c8",
    forcePrimaryFont: true,
  });

  drawDateBadgeStat(ctx, "Created", dateTextCompact(createdOn), badgeX, badgeColY, statBadgeW, serverDateBadgeOpts);
  drawDateBadgeStat(ctx, "Joined", dateTextCompact(invitedBotOn), badgeX, badgeColY + badgeH + badgeGap, statBadgeW, serverDateBadgeOpts);

  const metricsTop = 16 + headerBandH + 14;

  drawMetricPanel(
    ctx,
    "Messaggi",
    [
      { label: "1d", value: `${compactNumber(windows?.d1?.text)} messages` },
      { label: "7d", value: `${compactNumber(windows?.d7?.text)} messages` },
      {
        label: `${safeLookback}d`,
        value: `${compactNumber(lookbackWindow?.text)} messages`,
      },
    ],
    20,
    metricsTop,
    400,
    220,
    { denseRows: true, glyph: "message" },
  );

  drawMetricPanel(
    ctx,
    "Voice Activity",
    [
      { label: "1d", value: `${formatHours(windows?.d1?.voiceSeconds)} hours` },
      { label: "7d", value: `${formatHours(windows?.d7?.voiceSeconds)} hours` },
      {
        label: `${safeLookback}d`,
        value: `${formatHours(lookbackWindow?.voiceSeconds)} hours`,
      },
    ],
    440,
    metricsTop,
    400,
    220,
    { denseRows: true, glyph: "voice" },
  );

  drawMetricPanel(
    ctx,
    "Contributors",
    [
      {
        label: "1d",
        value: `${Number(windows?.d1?.contributors || 0)} members`,
      },
      {
        label: "7d",
        value: `${Number(windows?.d7?.contributors || 0)} members`,
      },
      {
        label: `${safeLookback}d`,
        value: `${Number(lookbackWindow?.contributors || 0)} members`,
      },
    ],
    860,
    metricsTop,
    400,
    220,
    { denseRows: true, glyph: "users" },
  );

  const topRowY = metricsTop + 220 + 22;

  await drawTopCard(
    ctx,
    "Top Members",
    {
      label: topUsersText?.[0]?.label || "-",
      value: compactNumber(topUsersText?.[0]?.value || 0),
      unit: "messages",
    },
    {
      label: topUsersVoice?.[0]?.label || "-",
      value: formatHours(topUsersVoice?.[0]?.value || 0),
      unit: "hours",
    },
    20,
    topRowY,
    600,
    220,
    { showRank: false, dense: true, glyph: "trophy" },
  );

  await drawTopCard(
    ctx,
    "Top Channels",
    {
      label: topChannelsText?.[0]?.label || "#-",
      value: compactNumber(topChannelsText?.[0]?.value || 0),
      unit: "messages",
    },
    {
      label: topChannelsVoice?.[0]?.label || "#-",
      value: formatHours(topChannelsVoice?.[0]?.value || 0),
      unit: "hours",
    },
    640,
    topRowY,
    620,
    220,
    { showRank: false, dense: true, glyph: "chart" },
  );

  const chartY = topRowY + 220 + 18;
  drawChart(ctx, chart, 20, chartY, 1240, 240, { animationPhase, glyph: "chart" });
  drawLabel(ctx, `Lookback: Last ${safeLookback} days`, 32, height - 22, {
    size: 22,
    weight: "700",
    color: "#b9c7d9",
    forcePrimaryFont: true,
  });
}

async function renderServerActivityCanvas(props) {
  registerCanvasFonts(getCanvasModule());
  const width = 1280;
  const height = 940;
  const forceStatic = Boolean(props?.forceStatic);
  const guildIconResolved =
    props.guildIconPrefetch ??
    (props.guildIconUrl ? await loadAvatarForStatsCanvas(props.guildIconUrl) : null);
  let GIFEncoder = null;
  try {
    GIFEncoder = require("gif-encoder-2");
  } catch {
    GIFEncoder = null;
  }

  if (!GIFEncoder || !ACTIVITY_CANVAS_GIF || forceStatic) {
    const canvas = getCanvasModule().createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    await paintServerActivityCanvas(ctx, props, null, guildIconResolved);
    return canvas.toBuffer("image/png", { compressionLevel: 1 });
  }

  const animFrames = ACTIVITY_CANVAS_ANIM_FRAMES;
  const encoder = new GIFEncoder(width, height);
  encoder.start();
  encoder.setRepeat(0);
  encoder.setDelay(72);
  encoder.setQuality(10);
  const canvas = getCanvasModule().createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  for (let f = 0; f < animFrames; f += 1) {
    const phase = animFrames > 1 ? f / (animFrames - 1) : 1;
    await paintServerActivityCanvas(ctx, props, phase, guildIconResolved);
    encoder.addFrame(ctx);
  }
  encoder.setDelay(ACTIVITY_CANVAS_STATIC_TAIL_DELAY_MS);
  await paintServerActivityCanvas(ctx, props, 1, guildIconResolved);
  encoder.addFrame(ctx);
  encoder.finish();
  return Buffer.from(encoder.out.getData());
}

async function renderTopStatisticsCanvas({ guildName, guildIconUrl, lookbackDays = 14, topUsersText = [], topChannelsText = [], topUsersVoice = [], topChannelsVoice = [] }) {
  registerCanvasFonts(getCanvasModule());
  const safeLookback = [1, 7, 14, 21, 30].includes(Number(lookbackDays)) ? Number(lookbackDays) : 14;
  const width = 1280;
  const height = 900;
  const canvas = getCanvasModule().createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  drawBackground(ctx, width, height);

  const topGuildLine = stripBrokenReplacementChars(guildName || "Server") || "Server";
  const topLayout = computeWrappedTitleLines(ctx, topGuildLine, 820, {
    startSize: 42,
    minSize: 18,
    weight: "700",
    maxLines: 2,
    fallback: "Server",
  });
  const nameLine1Y = 38;
  const topSubtitleY = nameLine1Y + topLayout.lines.length * topLayout.lineHeight + 12;
  const headerBandH = Math.max(96, Math.min(130, topSubtitleY + 22 - 16));
  const headerDelta = headerBandH - 96;

  fillRoundRect(ctx, 20, 16, 1240, headerBandH, 22, "rgba(32, 42, 57, 0.9)");
  strokeRoundRect(ctx, 20, 16, 1240, headerBandH, 22, "rgba(255,255,255,0.06)", 1);

  const topGuildIconResolved = guildIconUrl ? await loadAvatarForStatsCanvas(guildIconUrl) : null;
  await drawAvatarCircle(ctx, guildIconUrl, 28, 24, 80, null, topGuildIconResolved);
  for (let li = 0; li < topLayout.lines.length; li += 1) {
    await drawLabelWithEmoji(ctx, topLayout.lines[li], 124, nameLine1Y + li * topLayout.lineHeight, {
      size: topLayout.size,
      weight: "700",
      color: STATS_TITLE,
      forcePrimaryFont: true,
    });
  }
  drawLabel(ctx, "Top Statistics", 124, topSubtitleY, {
    size: 24,
    weight: "600",
    color: STATS_MUTED,
    forcePrimaryFont: true,
  });

  drawSolidStatTitle(ctx, "Messaggi", 24, 146 + headerDelta, 900, 26, 15, STATS_MUTED);

  await drawTopListCard(
    ctx,
    "Top Users",
    topUsersText.map((x) => ({
      label: x?.label || "N/A",
      value: compactNumber(x?.value || 0),
    })),
    20,
    168 + headerDelta,
    610,
    296,
    { unit: "msg", glyph: "message" },
  );

  await drawTopListCard(
    ctx,
    "Top Channels",
    topChannelsText.map((x) => ({
      label: x?.label || "N/A",
      value: compactNumber(x?.value || 0),
    })),
    650,
    168 + headerDelta,
    610,
    296,
    { unit: "msg", glyph: "chart" },
  );

  drawSolidStatTitle(ctx, "Voice Activity", 24, 478 + headerDelta, 900, 26, 15, STATS_MUTED);

  await drawTopListCard(
    ctx,
    "Top Users",
    topUsersVoice.map((x) => ({
      label: x?.label || "N/A",
      value: formatHours(x?.value || 0),
    })),
    20,
    500 + headerDelta,
    610,
    296,
    { unit: "h", glyph: "voice" },
  );

  await drawTopListCard(
    ctx,
    "Top Channels",
    topChannelsVoice.map((x) => ({
      label: x?.label || "N/A",
      value: formatHours(x?.value || 0),
    })),
    650,
    500 + headerDelta,
    610,
    296,
    { unit: "h", glyph: "voice" },
  );

  drawLabel(
    ctx,
    `Lookback: Last ${safeLookback} days | Timezone: Europe/Rome`,
    24,
    844 + headerDelta,
    {
      size: 20,
      weight: "700",
      color: STATS_MUTED,
      forcePrimaryFont: true,
    },
  );

  return canvas.toBuffer("image/png");
}

async function renderTopStatisticsSingleCanvas({ guildName, guildIconUrl, lookbackDays = 14, title = "Top Statistics", rows = [], unit = "msg", mode = "messages" }) {
  registerCanvasFonts(getCanvasModule());
  const safeLookback = [1, 7, 14, 21, 30].includes(Number(lookbackDays)) ? Number(lookbackDays) : 14;
  const width = 1280;
  const height = 900;
  const canvas = getCanvasModule().createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  drawBackground(ctx, width, height);

  const singleGuildLine = stripBrokenReplacementChars(guildName || "Server") || "Server";
  const singleLayout = computeWrappedTitleLines(ctx, singleGuildLine, 820, {
    startSize: 42,
    minSize: 18,
    weight: "700",
    maxLines: 2,
    fallback: "Server",
  });
  const nameLine1Y = 38;
  const singleSubtitleY = nameLine1Y + singleLayout.lines.length * singleLayout.lineHeight + 12;
  const headerBandH = Math.max(96, Math.min(130, singleSubtitleY + 22 - 16));
  const headerDelta = headerBandH - 96;

  fillRoundRect(ctx, 20, 16, 1240, headerBandH, 22, "rgba(32, 42, 57, 0.9)");
  strokeRoundRect(ctx, 20, 16, 1240, headerBandH, 22, "rgba(255,255,255,0.06)", 1);

  const singleGuildIconResolved = guildIconUrl ? await loadAvatarForStatsCanvas(guildIconUrl) : null;
  await drawAvatarCircle(ctx, guildIconUrl, 28, 24, 80, null, singleGuildIconResolved);
  for (let li = 0; li < singleLayout.lines.length; li += 1) {
    await drawLabelWithEmoji(ctx, singleLayout.lines[li], 124, nameLine1Y + li * singleLayout.lineHeight, {
      size: singleLayout.size,
      weight: "700",
      color: STATS_TITLE,
      forcePrimaryFont: true,
    });
  }
  drawLabel(ctx, "Top Statistics", 124, singleSubtitleY, {
    size: 24,
    weight: "600",
    color: STATS_MUTED,
    forcePrimaryFont: true,
  });

  drawSolidStatTitle(ctx, title, 24, 168 + headerDelta, 1220, 32, 18, STATS_MUTED);

  const normalizedRows = Array.isArray(rows) ? rows.map((x) => ({ label: x?.label || "N/A", value: mode === "voice" ? formatHours(x?.value || 0) : compactNumber(x?.value || 0), })) : [];

  await drawTopListCard(
    ctx,
    "Top 3",
    normalizedRows,
    20,
    232 + headerDelta,
    1240,
    528,
    { unit, glyph: mode === "voice" ? "voice" : "message" },
  );

  drawLabel(
    ctx,
    `Lookback: Last ${safeLookback} days | Timezone: Europe/Rome`,
    24,
    824 + headerDelta,
    {
      size: 20,
      weight: "700",
      color: STATS_MUTED,
      forcePrimaryFont: true,
    },
  );

  return canvas.toBuffer("image/png");
}

async function drawTopRowsColumn(ctx, rows, { x, y, w, rankStart = 1, unit = "msg", rowHeight = 62, rowGap = 8 }) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return;
  for (let i = 0; i < list.length; i += 1) {
    const row = list[i];
    const rowY = y + i * (rowHeight + rowGap);
    fillRoundRect(ctx, x, rowY, w, rowHeight, 12, "rgba(12, 18, 28, 0.95)");
    fillRoundRect(ctx, x, rowY, 72, rowHeight, 12, "rgba(10, 16, 27, 0.95)");

    const rank = rankStart + i;
    drawLabel(ctx, String(rank), x + 36, rowY + rowHeight / 2, {
      size: 22,
      weight: "800",
      color: STATS_BODY,
      align: "center",
      useNumericFont: true,
    });

    const labelMaxWidth = w - 260;
    await drawLabelWithEmoji(
      ctx,
      fitText(ctx, sanitizeDisplayLabel(prepareVisibleText(row.label || "N/A")), labelMaxWidth, 24, "700"),
      x + 90,
      rowY + rowHeight / 2,
      { size: 24, weight: "700", color: STATS_BODY, align: "left" },
    );

    const valueText = `${row.value} ${unit}`;
    const valueWidth = Math.min(w - 240, Math.max(110, textWidth(ctx, valueText, 24, "800") + 26),);
    fillRoundRect(
      ctx,
      x + w - valueWidth - 10,
      rowY + 9,
      valueWidth,
      rowHeight - 18,
      10,
      "rgba(30, 39, 54, 0.95)",
    );
    drawLabel(ctx, valueText, x + w - 18, rowY + rowHeight / 2, {
      size: 24,
      weight: "800",
      color: STATS_VALUE,
      align: "right",
      useNumericFont: true,
    });
  }
}

async function renderTopLeaderboardPageCanvas({
  guildName,
  guildIconUrl,
  lookbackDays = 14,
  title = "Top Statistics",
  page = 1,
  totalPages = 1,
  rows = [],
  unit = "msg",
  mode = "messages",
  allTime = false,
  customFooterLine = null,
}) {
  registerCanvasFonts(getCanvasModule());
  const safeLookback = [1, 7, 14, 21, 30].includes(Number(lookbackDays)) ? Number(lookbackDays) : 14;
  const safePage = Math.max(1, Number(page || 1));
  const safeTotalPages = Math.max(1, Number(totalPages || 1));
  const mappedRows = (Array.isArray(rows) ? rows : []).map((row) => ({ label: row?.label || "N/A", value: mode === "voice" ? formatHours(row?.value || 0) : compactNumber(row?.value || 0), }));
  const totalRows = mappedRows.length;
  const forceSingleWideColumn = safePage === safeTotalPages && totalRows > 0 && totalRows < 5;
  const splitAt = totalRows > 5 ? 5 : Math.ceil(totalRows / 2);
  const leftRows = forceSingleWideColumn ? mappedRows : mappedRows.slice(0, splitAt);
  const rightRows = forceSingleWideColumn ? [] : mappedRows.slice(splitAt, 10);
  const panelHeight = 560;
  const width = 1280;
  const height = 900;
  const canvas = getCanvasModule().createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  drawBackground(ctx, width, height);

  const lbGuildLine = stripBrokenReplacementChars(guildName || "Server") || "Server";
  const lbLayout = computeWrappedTitleLines(ctx, lbGuildLine, 820, {
    startSize: 42,
    minSize: 18,
    weight: "700",
    maxLines: 2,
    fallback: "Server",
  });
  const nameLine1Y = 38;
  const lbSubtitleY = nameLine1Y + lbLayout.lines.length * lbLayout.lineHeight + 12;
  const headerBandH = Math.max(96, Math.min(130, lbSubtitleY + 22 - 16));
  const headerDelta = headerBandH - 96;
  const panelY = 216 + headerDelta;
  const footerY = 824 + headerDelta;

  fillRoundRect(ctx, 20, 16, 1240, headerBandH, 22, "rgba(32, 42, 57, 0.9)");
  strokeRoundRect(ctx, 20, 16, 1240, headerBandH, 22, "rgba(255,255,255,0.06)", 1);

  const lbGuildIconResolved = guildIconUrl ? await loadAvatarForStatsCanvas(guildIconUrl) : null;
  await drawAvatarCircle(ctx, guildIconUrl, 28, 24, 80, null, lbGuildIconResolved);
  for (let li = 0; li < lbLayout.lines.length; li += 1) {
    await drawLabelWithEmoji(ctx, lbLayout.lines[li], 124, nameLine1Y + li * lbLayout.lineHeight, {
      size: lbLayout.size,
      weight: "700",
      color: STATS_TITLE,
      forcePrimaryFont: true,
    });
  }
  drawLabel(ctx, "Top Statistics", 124, lbSubtitleY, {
    size: 24,
    weight: "600",
    color: STATS_MUTED,
    forcePrimaryFont: true,
  });

  drawSolidStatTitle(ctx, title, 24, 160 + headerDelta, 1220, 32, 18, STATS_MUTED);

  fillRoundRect(ctx, 20, panelY, 1240, panelHeight, 18, "rgba(46, 55, 70, 0.92)");
  strokeRoundRect(ctx, 20, panelY, 1240, panelHeight, 18, "rgba(255,255,255,0.05)", 1);

  const panelInnerTop = panelY + 20;
  const panelInnerBottom = panelY + panelHeight - 20;
  const panelInnerHeight = panelInnerBottom - panelInnerTop;
  const computeColumnLayout = (count) => { const safeCount = Math.max(1, Number(count || 0)); const rowGap = safeCount > 1 ? 7 : 0; const rowHeight = Math.max(46, Math.floor((panelInnerHeight - rowGap * (safeCount - 1)) / safeCount),); return { rowHeight, rowGap }; }; if (forceSingleWideColumn) {
    const singleLayout = computeColumnLayout(leftRows.length);
    await drawTopRowsColumn(ctx, leftRows, {
      x: 34,
      y: panelInnerTop,
      w: 1212,
      rankStart: (safePage - 1) * 10 + 1,
      unit,
      rowHeight: singleLayout.rowHeight,
      rowGap: singleLayout.rowGap,
    });
  } else {
    const leftLayout = computeColumnLayout(leftRows.length);
    const rightLayout = computeColumnLayout(rightRows.length);

    await drawTopRowsColumn(ctx, leftRows, {
      x: 34,
      y: panelInnerTop,
      w: 600,
      rankStart: (safePage - 1) * 10 + 1,
      unit,
      rowHeight: leftLayout.rowHeight,
      rowGap: leftLayout.rowGap,
    });
    await drawTopRowsColumn(ctx, rightRows, {
      x: 646,
      y: panelInnerTop,
      w: 600,
      rankStart: (safePage - 1) * 10 + leftRows.length + 1,
      unit,
      rowHeight: rightLayout.rowHeight,
      rowGap: rightLayout.rowGap,
    });
  }

  if (!leftRows.length && !rightRows.length) {
    drawLabel(ctx, "Nessun dato disponibile", width / 2, panelY + panelHeight / 2, {
      size: 34,
      weight: "700",
      color: STATS_MUTED,
      align: "center",
      forcePrimaryFont: true,
    });
  }

  const footerText =
    typeof customFooterLine === "string" && customFooterLine.trim()
      ? customFooterLine.trim()
      : allTime
        ? `Page ${safePage}/${safeTotalPages} | All-time | Timezone: Europe/Rome`
        : `Page ${safePage}/${safeTotalPages} | Lookback: Last ${safeLookback} days | Timezone: Europe/Rome`;
  drawLabel(ctx, footerText, 24, footerY, {
    size: 20,
    weight: "700",
    color: STATS_MUTED,
    forcePrimaryFont: true,
  });

  return canvas.toBuffer("image/png");
}

module.exports = { renderUserActivityCanvas, renderServerActivityCanvas, renderChannelActivityCanvas, renderTopStatisticsCanvas, renderTopStatisticsSingleCanvas, renderTopLeaderboardPageCanvas, formatCanvasChannelLabel, prefetchStatsCanvasAvatar: loadAvatarForStatsCanvas };