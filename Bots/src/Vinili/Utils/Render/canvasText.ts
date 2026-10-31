/** Immagini attività: testi (pulizia, misure, etichette, date). */
const { drawTextWithSpecialFallback } = require("./canvasFonts") as typeof import("./canvasFonts");
const { prepareVisibleText, textWidth, wrapRichTextToLines } = require("./canvasEmojiRichText") as typeof import("./canvasEmojiRichText");

const ROME_TIME_ZONE = "Europe/Rome";

const STATS_TITLE = "#e8edf2";

function stripBrokenReplacementChars(input?) {
  return String(input || "").replace(/\uFFFD/g, "").replace(/\s{2,}/g, " ").trim();
}

function sanitizeDisplayLabel(input?) {
  return String(input || "")
    .replace(/[\u00AD\u034F\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
}

function drawSolidStatTitle(ctx?, text?, x?, y?, maxWidth?, maxSize?, minSize?, color = STATS_TITLE) {
  const value = prepareVisibleText(String(text || "").trim() || "—");
  const size = getFittedFontSize(ctx, value, maxWidth, maxSize, minSize, "700");
  drawLabel(ctx, value, x, y, { size, weight: "700", color, forcePrimaryFont: true });
}

function formatCanvasDisplayText(input?, maxLen = 0) {
  let text = stripBrokenReplacementChars(sanitizeDisplayLabel(String(input || "").trim()));
  if (!text) return "—";
  if (maxLen > 0 && text.length > maxLen) text = `${text.slice(0, Math.max(1, maxLen - 1))}…`;
  return text;
}

function prepareCanvasHeaderText(input?, fallback = "—") {
  const text = stripBrokenReplacementChars(sanitizeDisplayLabel(String(input || "").trim()));
  return text || fallback;
}

function formatCanvasChannelLabel(rawName?) {
  const cleaned = formatCanvasDisplayText(String(rawName || "").replace(/^#+\s*/, "").trim());
  return cleaned === "—" ? "# —" : `# ${cleaned}`;
}

function dateTextCompact(value?) {
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

function formatHours(seconds?) {
  return (Number(seconds || 0) / 3600).toFixed(2);
}

function compactNumber(value?) {
  const n = Number(value || 0);
  if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(2)}k`;
  return `${n}`;
}

function fitText(ctx?, text?, maxWidth?, size = 16, weight = "600") {
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

function getFittedFontSize(ctx?, text?, maxWidth?, maxSize = 52, minSize = 14, weight = "600") {
  const value = prepareVisibleText(String(text || "").trim());
  if (!value) return maxSize;
  for (let s = maxSize; s >= minSize; s -= 2) {
    if (textWidth(ctx, value, s, weight) <= maxWidth) return s;
  }
  return minSize;
}

function getFittedFontSizeOneLineEmoji(ctx?, text?, maxWidth?, maxSize?, minSize?, weight?) {
  const prep = prepareVisibleText(String(text || "").trim());
  if (!prep) return maxSize;
  for (let s = maxSize; s >= minSize; s -= 1) {
    const lines = wrapRichTextToLines(ctx, prep, maxWidth, s, weight);
    if (lines.length <= 1) return s;
  }
  return minSize;
}

function computeWrappedTitleLines(ctx?, rawText?, nameMaxW?, options: Record<string, any> = {}) {
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

function drawLabelFull(ctx?, text?, x?, y?, maxWidth?, maxSize = 52, options: Record<string, any> = {}) {
  const value = String(text || "").trim() || "—";
  const size = getFittedFontSize(ctx, value, maxWidth, maxSize, options.minSize ?? 14, options.weight ?? "700");
  drawLabel(ctx, value, x, y, { ...options, size });
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

function dateText(value?) {
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

export = { STATS_TITLE, stripBrokenReplacementChars, sanitizeDisplayLabel, drawSolidStatTitle, prepareCanvasHeaderText, formatCanvasChannelLabel, dateTextCompact, formatHours, compactNumber, fitText, getFittedFontSize, computeWrappedTitleLines, drawLabel };
