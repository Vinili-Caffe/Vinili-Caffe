/** Minigiochi: rendering canvas per prompt, cartelli, impiccato. */
const axios = require("axios") as any;
const { registerCanvasFonts, fontStackPrimaryOnly } = require("../../Utils/Render/canvasFonts") as typeof import("../../Utils/Render/canvasFonts");
const { drawLabelWithEmoji, tokenizeEmojiText } = require("../../Utils/Render/canvasEmojiRichText") as typeof import("../../Utils/Render/canvasEmojiRichText");
const { AttachmentBuilder } = require("discord.js") as typeof import("discord.js");
const { polishItalianQuestionText, loadImageBufferFromUrl } = require("./minigameImageRemote") as typeof import("./minigameImageRemote");

const CANVAS_STYLE = { bgGradStart: "#2c2419", bgGradEnd: "#1a1510", cardFill: "rgba(247, 241, 232, 0.96)", cardStroke: "rgba(111, 78, 55, 0.5)", titleColor: "#8b7355", bodyColor: "#2c2419", padding: 44, radius: 22 };

let canvasModule = null;
let createCanvas = null;
let loadImage = null;
try {
  canvasModule = require("canvas");
  createCanvas = canvasModule.createCanvas;
  loadImage = canvasModule.loadImage;
} catch (error) {
  global.logger?.warn?.(
    "[minigameService] canvas non disponibile: modalità immagini disattivata",
    error?.message || error,
  );
  createCanvas = () => {
    throw new Error("canvas_non_disponibile");
  };
  loadImage = async () => {
    throw new Error("canvas_non_disponibile");
  };
}

function wrapPromptText(ctx?, text?, maxWidth?) {
  const source = String(text || "").replace(/\s+/g, " ").trim();
  if (!source) return [""];
  const words = source.split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    if (ctx.measureText(word).width <= maxWidth) {
      current = word;
      continue;
    }
    let chunk = "";
    for (const ch of word) {
      const chunkCandidate = `${chunk}${ch}`;
      if (ctx.measureText(chunkCandidate).width <= maxWidth) {
        chunk = chunkCandidate;
      } else {
        if (chunk) lines.push(chunk);
        chunk = ch;
      }
    }
    current = chunk;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [source];
}

function buildFastTypePromptImage(phrase?, labelText = "Scrivi esattamente questa frase") {
  try {
    registerCanvasFonts(canvasModule);
    const width = 1200;
    const height = 420;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    const padding = CANVAS_STYLE.padding;
    const radius = 20;

    fillCanvasBackground(ctx, width, height);
    const cardX = padding;
    const cardY = padding;
    const cardW = width - padding * 2;
    const cardH = height - padding * 2;
    fillCanvasCard(ctx, cardX, cardY, cardW, cardH, radius);

    const phraseText = String(phrase || "").trim() || "...";
    const usableWidth = cardW - 80;
    ctx.font = fontStackPrimaryOnly(42, "700");
    const phraseLines = wrapPromptText(ctx, phraseText, usableWidth);
    const lineHeight = 54;
    const totalPhraseHeight = phraseLines.length * lineHeight;
    const labelHeight = 36;
    const gapLabelPhrase = 16;
    const totalContentHeight = labelHeight + gapLabelPhrase + totalPhraseHeight;
    const contentStartY = cardY + (cardH - totalContentHeight) / 2;

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = CANVAS_STYLE.titleColor;
    ctx.font = fontStackPrimaryOnly(28, "600");
    ctx.fillText(String(labelText || "Scrivi esattamente questa frase"), width / 2, contentStartY);

    let phraseY = contentStartY + labelHeight + gapLabelPhrase;
    ctx.font = fontStackPrimaryOnly(42, "700");
    ctx.fillStyle = CANVAS_STYLE.bodyColor;
    for (const line of phraseLines) {
      ctx.fillText(line, width / 2, phraseY, usableWidth);
      phraseY += lineHeight;
    }

    const name = "fast_type.png";
    return new AttachmentBuilder(canvas.toBuffer("image/png"), { name });
  } catch {
    return null;
  }
}

function buildDrivingQuizPromptImage(row?) {
  try {
    registerCanvasFonts(canvasModule);
    const width = 1400;
    const height = 780;
    const padding = CANVAS_STYLE.padding;
    const radius = CANVAS_STYLE.radius;
    const cardW = width - padding * 2;
    const cardH = height - padding * 2;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    const hasSign = Boolean(row?.signType);
    const signAreaW = hasSign ? 420 : 0;
    const textAreaW = cardW - signAreaW - (hasSign ? 42 : 0);
    const usableWidth = textAreaW - 70;

    const isMultiple = (row?.questionType === "multiple" || hasSign) && Array.isArray(row?.options) && row.options.length >= 2;
    const statement = String(row?.statement ?? "").trim() || "Domanda";
    ctx.font = fontStackPrimaryOnly(58, "700");
    const statementLines = wrapPromptText(ctx, statement, usableWidth);
    let optionsLines = [];
    if (isMultiple) {
      ctx.font = fontStackPrimaryOnly(42, "700");
      for (let i = 0; i < row.options.length; i++) {
        const opt = String(row.options[i] ?? "").trim();
        const letter = ["A", "B", "C", "D"][i] ?? String(i + 1);
        optionsLines.push(...wrapPromptText(ctx, `${letter}) ${opt}`, usableWidth - 36));
      }
    }

    fillCanvasBackground(ctx, width, height);
    const cardX = padding;
    const cardY = padding;
    fillCanvasCard(ctx, cardX, cardY, cardW, cardH, radius);

    let textStartX = cardX + (cardW - textAreaW) / 2;
    if (hasSign) {
      textStartX = cardX + signAreaW + 24;
      const signCx = cardX + signAreaW / 2;
      const signCy = cardY + cardH / 2;
      drawRoadSign(ctx, row.signType, signCx, signCy, 260);
    }

    const textCenterX = hasSign ? textStartX + textAreaW / 2 : width / 2;
    const titleHeight = 54;
    const titleGap = 24;
    const statementLineHeight = 68;
    const optionsGap = 20;
    const optionLineHeight = 52;
    const boolHintHeight = 50;
    const boolGap = 16;

    const statementHeight = statementLines.length * statementLineHeight;
    const optionsHeight = isMultiple ? optionsGap + optionsLines.length * optionLineHeight : boolGap + boolHintHeight;
    const totalContentHeight = titleHeight + titleGap + statementHeight + optionsHeight;
    let y = cardY + (cardH - totalContentHeight) / 2;

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = CANVAS_STYLE.titleColor;
    ctx.font = fontStackPrimaryOnly(56, "700");
    ctx.fillText("Quiz patente", textCenterX, y);
    y += titleHeight + titleGap;

    ctx.fillStyle = CANVAS_STYLE.bodyColor;
    ctx.font = fontStackPrimaryOnly(58, "700");
    for (const line of statementLines) {
      ctx.fillText(line, textCenterX, y, usableWidth);
      y += statementLineHeight;
    }

    if (isMultiple) {
      y += optionsGap;
      ctx.font = fontStackPrimaryOnly(42, "700");
      for (const line of optionsLines) {
        ctx.fillText(line, textCenterX, y, usableWidth);
        y += optionLineHeight;
      }
    } else {
      y += boolGap;
      ctx.fillStyle = CANVAS_STYLE.titleColor;
      ctx.font = fontStackPrimaryOnly(46, "700");
      ctx.fillText("Rispondi: Vero o Falso", textCenterX, y);
    }

    const name = "driving_quiz.png";
    return new AttachmentBuilder(canvas.toBuffer("image/png"), { name });
  } catch {
    return null;
  }
}

function roundRect(ctx?, x?, y?, w?, h?, r?) {
  if (r <= 0) {
    ctx.rect(x, y, w, h);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function fillCanvasBackground(ctx?, width?, height?) {
  const g = ctx.createLinearGradient(0, 0, width, height);
  g.addColorStop(0, CANVAS_STYLE.bgGradStart);
  g.addColorStop(1, CANVAS_STYLE.bgGradEnd);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
}

function fillCanvasCard(ctx?, x?, y?, w?, h?, radius = null) {
  const r = radius ?? CANVAS_STYLE.radius;
  ctx.fillStyle = CANVAS_STYLE.cardFill;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.strokeStyle = CANVAS_STYLE.cardStroke;
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, r);
  ctx.stroke();
}

function drawRoadSign(ctx?, signType?, cx?, cy?, size?) {
  const s = Math.max(20, size || 120);
  const r = s / 2;
  ctx.save();

  switch (String(signType || "").toLowerCase()) {
    case "danger": {
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#e00";
      ctx.lineWidth = Math.max(2, s / 25);
      ctx.beginPath();
      ctx.moveTo(cx, cy - r + 8);
      ctx.lineTo(cx + r - 8, cy + r * 0.5);
      ctx.lineTo(cx - r + 8, cy + r * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#e00";
      ctx.font = fontStackPrimaryOnly(Math.round(s / 3), "700");
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("!", cx, cy);
      break;
    }
    case "stop": {
      const pts = 8;
      ctx.fillStyle = "#e00";
      ctx.beginPath();
      for (let i = 0; i < pts; i++) {
        const a = (i / pts) * Math.PI * 2 - Math.PI / 2;
        const x = cx + (r - 4) * Math.cos(a);
        const y = cy + (r - 4) * Math.sin(a);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = fontStackPrimaryOnly(Math.round(s / 4.5), "700");
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("STOP", cx, cy);
      break;
    }
    case "give_way": {
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#e00";
      ctx.lineWidth = Math.max(2, s / 25);
      ctx.beginPath();
      ctx.moveTo(cx, cy + r - 8);
      ctx.lineTo(cx + r - 8, cy - r * 0.5);
      ctx.lineTo(cx - r + 8, cy - r * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
    case "no_entry": {
      ctx.fillStyle = "#e00";
      ctx.beginPath();
      ctx.arc(cx, cy, r - 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillRect(cx - r * 0.6, cy - s / 8, r * 1.2, s / 4);
      break;
    }
    case "parking": {
      ctx.fillStyle = "#0066b3";
      ctx.fillRect(cx - r + 4, cy - r * 0.7, (r - 4) * 2, r * 1.4);
      ctx.fillStyle = "#fff";
      ctx.font = fontStackPrimaryOnly(Math.round(s / 2.2), "700");
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("P", cx, cy);
      break;
    }
    case "no_parking": {
      ctx.fillStyle = "#0066b3";
      ctx.strokeStyle = "#e00";
      ctx.lineWidth = Math.max(3, s / 20);
      ctx.beginPath();
      ctx.arc(cx, cy, r - 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#e00";
      ctx.lineWidth = Math.max(4, s / 15);
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.5, cy + r * 0.5);
      ctx.lineTo(cx + r * 0.5, cy - r * 0.5);
      ctx.stroke();
      break;
    }
    case "speed_50": {
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#e00";
      ctx.lineWidth = Math.max(2, s / 25);
      ctx.beginPath();
      ctx.arc(cx, cy, r - 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#000";
      ctx.font = fontStackPrimaryOnly(Math.round(s / 2.5), "700");
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("50", cx, cy);
      break;
    }
    case "obligation_right": {
      ctx.fillStyle = "#0066b3";
      ctx.beginPath();
      ctx.arc(cx, cy, r - 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.35, cy);
      ctx.lineTo(cx + r * 0.35, cy - r * 0.35);
      ctx.lineTo(cx + r * 0.35, cy + r * 0.35);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "obligation_forward": {
      ctx.fillStyle = "#0066b3";
      ctx.beginPath();
      ctx.arc(cx, cy, r - 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 0.4);
      ctx.lineTo(cx - r * 0.25, cy + r * 0.35);
      ctx.lineTo(cx, cy + r * 0.15);
      ctx.lineTo(cx + r * 0.25, cy + r * 0.35);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "pedestrian_crossing": {
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#e00";
      ctx.lineWidth = Math.max(2, s / 25);
      ctx.beginPath();
      ctx.moveTo(cx, cy - r + 8);
      ctx.lineTo(cx + r - 8, cy + r * 0.5);
      ctx.lineTo(cx - r + 8, cy + r * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#000";
      ctx.font = fontStackPrimaryOnly(Math.round(s / 4), "700");
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("PED", cx, cy);
      break;
    }
    case "no_overtaking": {
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#e00";
      ctx.lineWidth = Math.max(2, s / 25);
      ctx.beginPath();
      ctx.arc(cx, cy, r - 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#e00";
      ctx.fillRect(cx - r * 0.5, cy - r * 0.2, r * 0.35, r * 0.4);
      ctx.fillRect(cx + r * 0.15, cy - r * 0.2, r * 0.35, r * 0.4);
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.45, cy);
      ctx.lineTo(cx + r * 0.45, cy);
      ctx.strokeStyle = "#e00";
      ctx.lineWidth = Math.max(3, s / 25);
      ctx.stroke();
      break;
    }
    case "priority_road": {
      const d = r - 4;
      ctx.fillStyle = "#ffcc00";
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = Math.max(2, s / 30);
      ctx.beginPath();
      ctx.moveTo(cx, cy - d);
      ctx.lineTo(cx + d, cy);
      ctx.lineTo(cx, cy + d);
      ctx.lineTo(cx - d, cy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
    default:
      ctx.fillStyle = "#888";
      ctx.beginPath();
      ctx.arc(cx, cy, r - 4, 0, Math.PI * 2);
      ctx.fill();
  }

  ctx.restore();
}

function buildHangmanStepThresholds(safeMax?) {
  const ts = new Array(10).fill(safeMax + 1);
  ts[0] = 1;
  ts[1] = 2;
  ts[2] = 3;
  ts[3] = 4;
  ts[4] = 5;
  ts[5] = 6;
  ts[9] = safeMax;
  if (safeMax >= 8) ts[6] = 7;
  if (safeMax >= 9) ts[7] = 8;
  if (safeMax >= 10) ts[8] = 9;
  return ts;
}

function buildHangmanImageAttachment(maskedWord?, misses = 0, maxMisses = 10, fileName = "hangman.png", headerTitle = "Impiccato") {
  try {
    registerCanvasFonts(canvasModule);
    const width = 900;
    const height = 520;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    fillCanvasBackground(ctx, width, height);

    const innerGrad = ctx.createLinearGradient(0, 0, width, 0);
    innerGrad.addColorStop(0, "#3d2e26");
    innerGrad.addColorStop(0.5, "#5c4538");
    innerGrad.addColorStop(1, "#3d2e26");
    ctx.fillStyle = innerGrad;
    ctx.strokeStyle = CANVAS_STYLE.cardStroke;
    ctx.lineWidth = 3;
    roundRect(ctx, 32, 32, width - 64, height - 64, 16);
    ctx.fill();
    ctx.stroke();

    const safeMax = Math.max(3, Math.min(10, Number(maxMisses) || 10));
    const m = Math.max(0, Math.min(safeMax, Number(misses) || 0));
    const ts = buildHangmanStepThresholds(safeMax);

    const leftZoneCenterX = 240;
    const wordCenterX = 600;
    const contentTop = 100;
    const contentBottom = 380;

    const poleBottomY = contentBottom - 24;
    const poleTopY = contentTop + 20;
    const poleX = leftZoneCenterX - 70;
    const beamStartX = poleX;
    const beamEndX = poleX + 140;
    const headCx = (beamStartX + beamEndX) / 2;
    const headCy = poleTopY + 32;
    const ropeY = poleTopY + 8;

    ctx.strokeStyle = "#b8a99a";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.moveTo(poleX, poleBottomY);
    ctx.lineTo(poleX, poleTopY);
    ctx.lineTo(beamEndX, poleTopY);
    ctx.stroke();

    if (m >= ts[0]) {
      ctx.beginPath();
      ctx.moveTo(headCx, poleTopY);
      ctx.lineTo(headCx, ropeY + 16);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(headCx, headCy, 20, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (m >= ts[1]) {
      ctx.beginPath();
      ctx.moveTo(headCx, headCy + 20);
      ctx.lineTo(headCx, headCy + 58);
      ctx.stroke();
    }
    if (m >= ts[2]) {
      ctx.beginPath();
      ctx.moveTo(headCx, headCy + 32);
      ctx.lineTo(headCx - 24, headCy + 52);
      ctx.stroke();
    }
    if (m >= ts[3]) {
      ctx.beginPath();
      ctx.moveTo(headCx, headCy + 32);
      ctx.lineTo(headCx + 24, headCy + 52);
      ctx.stroke();
    }
    if (m >= ts[4]) {
      ctx.beginPath();
      ctx.moveTo(headCx, headCy + 58);
      ctx.lineTo(headCx - 20, headCy + 88);
      ctx.stroke();
    }
    if (m >= ts[5]) {
      ctx.beginPath();
      ctx.moveTo(headCx, headCy + 58);
      ctx.lineTo(headCx + 20, headCy + 88);
      ctx.stroke();
    }
    if (m >= ts[6]) {
      ctx.beginPath();
      ctx.moveTo(headCx - 24, headCy + 52);
      ctx.lineTo(headCx - 36, headCy + 62);
      ctx.stroke();
    }
    if (m >= ts[7]) {
      ctx.beginPath();
      ctx.moveTo(headCx + 24, headCy + 52);
      ctx.lineTo(headCx + 36, headCy + 62);
      ctx.stroke();
    }
    if (m >= ts[8]) {
      ctx.beginPath();
      ctx.moveTo(headCx - 20, headCy + 88);
      ctx.lineTo(headCx - 32, headCy + 88);
      ctx.moveTo(headCx + 20, headCy + 88);
      ctx.lineTo(headCx + 32, headCy + 88);
      ctx.stroke();
    }
    if (m >= ts[9]) {
      ctx.beginPath();
      ctx.moveTo(headCx - 6, headCy - 4);
      ctx.lineTo(headCx + 6, headCy + 12);
      ctx.moveTo(headCx + 6, headCy - 4);
      ctx.lineTo(headCx - 6, headCy + 12);
      ctx.stroke();
    }

    ctx.fillStyle = "#e8e0d5";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = fontStackPrimaryOnly(42, "700");
    ctx.fillText(String(headerTitle || "Impiccato"), width / 2, 54);

    const wordStr = String(maskedWord || "").trim() || "_";
    ctx.fillStyle = "#e8e0d5";
    ctx.font = fontStackPrimaryOnly(44, "700");
    ctx.fillText(wordStr, wordCenterX, (contentTop + contentBottom) / 2, width - 320);

    const isLost = m >= safeMax;
    ctx.fillStyle = isLost ? "#f5b3a6" : "#c9b89f";
    ctx.font = fontStackPrimaryOnly(28, "700");
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`Errori: ${m}/${safeMax}`, width / 2, height - 60);

    return new AttachmentBuilder(canvas.toBuffer("image/png"), { name: fileName });
  } catch {
    return null;
  }
}

function promptLineHasEmoji(text?) {
  return tokenizeEmojiText(String(text || "")).some(
    (token?) => token.type === "emoji" || token.type === "custom_emoji",
  );
}

async function buildEmojiRichPromptImageAttachment(title?, lines = [], fileBaseName = "minigame") {
  try {
    registerCanvasFonts(canvasModule);
    const width = 1400;
    const height = 780;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    fillCanvasBackground(ctx, width, height);
    const cardX = CANVAS_STYLE.padding;
    const cardY = CANVAS_STYLE.padding;
    const cardW = width - CANVAS_STYLE.padding * 2;
    const cardH = height - CANVAS_STYLE.padding * 2;
    fillCanvasCard(ctx, cardX, cardY, cardW, cardH);

    await drawLabelWithEmoji(ctx, String(title || "Minigioco"), width / 2, cardY + 48, {
      size: 68,
      weight: "700",
      color: CANVAS_STYLE.titleColor,
      align: "center",
      baseline: "top",
      forcePrimaryFont: true,
    });

    const sourceLines = Array.isArray(lines)
      ? lines.map((line?) => String(line || "").trim()).filter(Boolean)
      : [];
    const bodyBlocks = sourceLines.map((line?) => ({
      line,
      isEmojiLine: promptLineHasEmoji(line),
    }));
    if (!bodyBlocks.length) bodyBlocks.push({ line: "...", isEmojiLine: false });

    const emojiSize = 112;
    const textSize = 44;
    const emojiBlockH = emojiSize + 36;
    const textBlockH = textSize + 28;
    const totalBodyH = bodyBlocks.reduce(
      (sum?, block?) => sum + (block.isEmojiLine ? emojiBlockH : textBlockH),
      0,
    );
    let y = Math.max(cardY + 180, Math.round(cardY + (cardH - totalBodyH) / 2 + 40));

    for (const block of bodyBlocks) {
      const size = block.isEmojiLine ? emojiSize : textSize;
      const blockH = block.isEmojiLine ? emojiBlockH : textBlockH;
      const centerY = y + Math.round(blockH / 2);
      await drawLabelWithEmoji(ctx, block.line, width / 2, centerY, {
        size,
        weight: "700",
        color: CANVAS_STYLE.bodyColor,
        align: "center",
        baseline: "middle",
        forcePrimaryFont: !block.isEmojiLine,
      });
      y += blockH;
    }

    const name = `${String(fileBaseName || "minigame").replace(/[^a-z0-9_-]/gi, "_").toLowerCase()}.png`;
    return new AttachmentBuilder(canvas.toBuffer("image/png"), { name });
  } catch {
    return null;
  }
}

function buildPromptImageAttachment(title?, lines = [], fileBaseName = "minigame", fileNameSuffix = "", client = null) {
  if (fileBaseName === "italian_gk" && Array.isArray(lines) && lines.length > 0) {
    try {
      registerCanvasFonts(canvasModule);
      const width = 1400;
      const height = 780;
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");

      fillCanvasBackground(ctx, width, height);
      const cardX = CANVAS_STYLE.padding;
      const cardY = CANVAS_STYLE.padding;
      const cardW = width - CANVAS_STYLE.padding * 2;
      const cardH = height - CANVAS_STYLE.padding * 2;
      fillCanvasCard(ctx, cardX, cardY, cardW, cardH);

      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = CANVAS_STYLE.titleColor;
      ctx.font = fontStackPrimaryOnly(76, "800");
      ctx.fillText(String(title || "Cultura generale"), width / 2, cardY + 100);

      const question = polishItalianQuestionText(String(lines[0] || "").trim() || "Domanda");
      const usableWidth = cardW - 150;
      let questionFont = 64;
      let questionLines = [];
      for (; questionFont >= 42; questionFont -= 2) {
        ctx.font = fontStackPrimaryOnly(questionFont, "700");
        questionLines = wrapPromptText(ctx, question, usableWidth);
        if (questionLines.length <= 5) break;
      }

      const lineHeight = Math.round(questionFont * 1.22);
      const totalH = questionLines.length * lineHeight;
      let y = Math.round(cardY + 200 + Math.max(0, (cardH - 300 - totalH) / 2));

      ctx.fillStyle = CANVAS_STYLE.bodyColor;
      ctx.font = fontStackPrimaryOnly(questionFont, "700");
      for (const line of questionLines) {
        ctx.fillText(line, width / 2, y, usableWidth);
        y += lineHeight;
      }

      return new AttachmentBuilder(canvas.toBuffer("image/png"), {
        name: "italian_gk.png",
      });
    } catch {
      return null;
    }
  }

  if (fileBaseName === "guess_word" && Array.isArray(lines) && lines.length > 0) {
    try {
      registerCanvasFonts(canvasModule);
      const width = 1400;
      const height = 780;
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");

      fillCanvasBackground(ctx, width, height);
      const cardX = CANVAS_STYLE.padding;
      const cardY = CANVAS_STYLE.padding;
      const cardW = width - CANVAS_STYLE.padding * 2;
      const cardH = height - CANVAS_STYLE.padding * 2;
      fillCanvasCard(ctx, cardX, cardY, cardW, cardH);

      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = CANVAS_STYLE.titleColor;
      ctx.font = fontStackPrimaryOnly(76, "800");
      ctx.fillText(String(title || "Indovina la parola"), width / 2, cardY + 100);

      const scrambled = String(lines[0] || "").trim() || "?";
      const usableWidth = cardW - 150;
      let fontSize = 72;
      let textLines = [];
      for (; fontSize >= 44; fontSize -= 4) {
        ctx.font = fontStackPrimaryOnly(fontSize, "700");
        textLines = wrapPromptText(ctx, scrambled, usableWidth);
        if (textLines.length <= 3) break;
      }
      const lineHeight = Math.round(fontSize * 1.22);
      const totalH = textLines.length * lineHeight;
      let y = Math.round(cardY + 200 + Math.max(0, (cardH - 300 - totalH) / 2));
      ctx.fillStyle = CANVAS_STYLE.bodyColor;
      ctx.font = fontStackPrimaryOnly(fontSize, "700");
      for (const line of textLines) {
        ctx.fillText(line, width / 2, y, usableWidth);
        y += lineHeight;
      }

      return new AttachmentBuilder(canvas.toBuffer("image/png"), { name: "guess_word.png" });
    } catch {
      return null;
    }
  }
  if (fileBaseName === "hangman" && Array.isArray(lines) && lines.length >= 2) {
    const masked = String(lines[0] || "").trim();
    const errMatch = String(lines[1] || "").match(/Errori:\s*(\d+)\/(\d+)/);
    const misses = errMatch ? parseInt(errMatch[1], 10) : 0;
    const maxMisses = errMatch ? parseInt(errMatch[2], 10) : 10;
    const safeSuffix = String(fileNameSuffix || "").replace(/[^a-z0-9_-]/gi, "");
    const out = buildHangmanImageAttachment(
      masked,
      misses,
      maxMisses,
      safeSuffix ? `hangman_${safeSuffix}.png` : "hangman.png",
      title,
    );
    if (out) return out;
  }
  if (fileBaseName === "fast_type" && Array.isArray(lines) && lines.length > 0) {
    const fastLabel = "Scrivi esattamente questa frase";
    const out = buildFastTypePromptImage(lines[0], fastLabel);
    if (out) return out;
  }

  try {
    registerCanvasFonts(canvasModule);
    const width = 1400;
    const height = 780;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    fillCanvasBackground(ctx, width, height);
    const cardX = CANVAS_STYLE.padding;
    const cardY = CANVAS_STYLE.padding;
    const cardW = width - CANVAS_STYLE.padding * 2;
    const cardH = height - CANVAS_STYLE.padding * 2;
    fillCanvasCard(ctx, cardX, cardY, cardW, cardH);

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = CANVAS_STYLE.titleColor;
    ctx.font = fontStackPrimaryOnly(68, "700");
    ctx.fillText(String(title || "Minigioco"), width / 2, cardY + 48);

    const usableWidth = cardW - 120;
    const sourceLines = Array.isArray(lines) ? lines.map((line?) => String(line || "").trim()).filter(Boolean) : [];
    const renderedLines = [];
    for (const line of sourceLines) {
      ctx.font = fontStackPrimaryOnly(56, "700");
      renderedLines.push(...wrapPromptText(ctx, line, usableWidth));
    }
    if (!renderedLines.length) renderedLines.push("...");

    ctx.font = fontStackPrimaryOnly(56, "700");
    ctx.fillStyle = CANVAS_STYLE.bodyColor;
    const lineHeight = 76;
    const totalHeight = renderedLines.length * lineHeight;
    let y = Math.max(cardY + 180, Math.round(cardY + (cardH - totalHeight) / 2));
    for (const line of renderedLines) {
      ctx.fillText(line, width / 2, y, usableWidth);
      y += lineHeight;
    }

    const name = `${String(fileBaseName || "minigame").replace(/[^a-z0-9_-]/gi, "_").toLowerCase()}.png`;
    return new AttachmentBuilder(canvas.toBuffer("image/png"), { name });
  } catch {
    return null;
  }
}

async function buildRemoteGuessImageCardAttachment(imageUrl?, title?, fileName = "guess_image.png") {
  try {
    registerCanvasFonts(canvasModule);
    const photo = await loadImageBufferFromUrl(imageUrl);
    if (!photo) return null;
    const width = 1400;
    const height = 780;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    fillCanvasBackground(ctx, width, height);
    const cardX = CANVAS_STYLE.padding;
    const cardY = CANVAS_STYLE.padding;
    const cardW = width - CANVAS_STYLE.padding * 2;
    const cardH = height - CANVAS_STYLE.padding * 2;
    fillCanvasCard(ctx, cardX, cardY, cardW, cardH);
    ctx.textAlign = "center";
    ctx.fillStyle = CANVAS_STYLE.titleColor;
    ctx.font = fontStackPrimaryOnly(64, "700");
    ctx.fillText(String(title || "Indovina").slice(0, 48), width / 2, cardY + 48);
    const maxW = cardW - 120;
    const maxH = cardH - 200;
    const scale = Math.min(maxW / photo.width, maxH / photo.height, 1);
    const drawW = Math.round(photo.width * scale);
    const drawH = Math.round(photo.height * scale);
    const x = (width - drawW) / 2;
    const y = cardY + 140;
    ctx.drawImage(photo, x, y, drawW, drawH);
    const name = String(fileName || "guess_image.png").replace(/[^\w.\-]+/g, "_");
    return new AttachmentBuilder(canvas.toBuffer("image/png"), { name: name.endsWith(".png") ? name : `${name}.png` });
  } catch {
    return null;
  }
}

function buildMathExpressionImageAttachment(expression?) {
  try {
    registerCanvasFonts(canvasModule);
    const width = 1200;
    const height = 420;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    fillCanvasBackground(ctx, width, height);
    const pad = CANVAS_STYLE.padding;
    const cardW = width - pad * 2;
    const cardH = height - pad * 2;
    fillCanvasCard(ctx, pad, pad, cardW, cardH, 20);

    ctx.fillStyle = CANVAS_STYLE.bodyColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = fontStackPrimaryOnly(120, "700");
    ctx.fillText(String(expression || ""), width / 2, height / 2);

    const name = "math_expression.png";
    return new AttachmentBuilder(canvas.toBuffer("image/png"), { name });
  } catch {
    return null;
  }
}

const CENSORED_ARTWORK_MAX_SIDE = 600;
const CENSOR_MAX_BLUR_PX = 55;

async function censorArtworkImage(imageUrl?, opts: Record<string, any> = {}) {
  if (!imageUrl || typeof imageUrl !== "string") return null;
  const overlayAlpha = Math.max(0, Math.min(1, Number(opts?.overlayAlpha ?? 0.98)));
  try {
    const res = await axios.get(imageUrl, { responseType: "arraybuffer", timeout: 12000 });
    const buf = Buffer.from(res.data);
    if (!buf?.length) return null;
    const img = await loadImage(buf);
    if (!img || !img.width || !img.height) return null;

    const maxSide = CENSORED_ARTWORK_MAX_SIDE;
    let w = img.width;
    let h = img.height;
    if (w > maxSide || h > maxSide) {
      if (w >= h) {
        h = Math.round((h * maxSide) / w);
        w = maxSide;
      } else {
        w = Math.round((w * maxSide) / h);
        h = maxSide;
      }
    }

    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext("2d");

    if (overlayAlpha > 0) {
      const blurPx = (Math.min(w, h) / 400) * CENSOR_MAX_BLUR_PX * overlayAlpha;
      ctx.filter = `blur(${Math.max(1, Math.round(blurPx))}px)`;
    }
    ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, w, h);
    ctx.filter = "none";

    const attachmentName = opts?.attachmentName || "minigame_artwork.png";
    return { buffer: canvas.toBuffer("image/png"), attachmentName };
  } catch {
    return null;
  }
}

function buildRegionNameImageAttachment(regionName?) {
  const safeRegion = String(regionName || "").trim();
  if (!safeRegion) return null;
  const label = "Regione";
  try {
    registerCanvasFonts(canvasModule);
    const width = 1200;
    const height = 420;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    fillCanvasBackground(ctx, width, height);
    const pad = CANVAS_STYLE.padding;
    const cardW = width - pad * 2;
    const cardH = height - pad * 2;
    fillCanvasCard(ctx, pad, pad, cardW, cardH, 20);

    ctx.fillStyle = CANVAS_STYLE.titleColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = fontStackPrimaryOnly(52, "700");
    ctx.fillText(label, width / 2, 140);
    ctx.fillStyle = CANVAS_STYLE.bodyColor;
    ctx.font = fontStackPrimaryOnly(96, "700");
    ctx.fillText(safeRegion, width / 2, 250, width - 120);

    return new AttachmentBuilder(canvas.toBuffer("image/png"), {
      name: "region_name.png",
    });
  } catch {
    return null;
  }
}

export = {
  buildDrivingQuizPromptImage,
  buildEmojiRichPromptImageAttachment,
  buildPromptImageAttachment,
  buildRemoteGuessImageCardAttachment,
  buildMathExpressionImageAttachment,
  censorArtworkImage,
  buildRegionNameImageAttachment,
};
