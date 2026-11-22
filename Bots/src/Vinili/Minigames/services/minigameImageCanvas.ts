/** Minigiochi: rendering canvas per prompt, cartelli, impiccato. */
const axios = require("axios") as any;
const { registerCanvasFonts, fontStackPrimaryOnly } = require("../../Community/utils/Render/canvasFonts") as typeof import("../../Community/utils/Render/canvasFonts");
const {
  drawLabelWithEmoji,
  tokenizeEmojiText,
  wrapRichTextToLines,
  measureRichTextWidth,
} = require("../../Community/utils/Render/canvasEmojiRichText") as typeof import("../../Community/utils/Render/canvasEmojiRichText");
const { AttachmentBuilder } = require("discord.js") as typeof import("discord.js");
const { polishItalianQuestionText, loadImageBufferFromUrl } = require("./minigameImageRemote") as typeof import("./minigameImageRemote");

/**
 * Visual system minigiochi classici (no SW/Halloween).
 * Brand Vinili: viola #826bc2 su espresso scuro — card glass, non “foglietto crema”.
 */
const CANVAS_STYLE = {
  bgDeep: "#0c0a12",
  bgMid: "#16101f",
  bgGlow: "rgba(130, 107, 194, 0.38)",
  bgGlowSoft: "rgba(130, 107, 194, 0.12)",
  cardFill: "rgba(22, 16, 32, 0.92)",
  cardFillTop: "rgba(38, 28, 56, 0.96)",
  cardStroke: "rgba(168, 148, 220, 0.42)",
  cardStrokeInner: "rgba(255, 255, 255, 0.06)",
  accent: "#826bc2",
  accentHot: "#a78bfa",
  titleColor: "#d4c4f5",
  bodyColor: "#f3eefc",
  mutedColor: "rgba(214, 200, 240, 0.62)",
  dangerColor: "#f0a090",
  hangmanStroke: "#cbb8ef",
  padding: 40,
  radius: 28,
};

let canvasModule = null;
let createCanvas = null;
let loadImage = null;
try {
  canvasModule = require("canvas");
  createCanvas = canvasModule.createCanvas;
  loadImage = canvasModule.loadImage;
} catch (error) {
  /* bot-workers usa spesso Node diverso da bots-vinyls: niente spam se non serve canvas qui */
  const quietWorker =
    String(process.env.MINIGAMES_WORKER || "").trim() === "1" ||
    String(process.env.BOT_SCHEDULER_WORKER || "").trim() === "1";
  if (!quietWorker) {
    global.logger?.warn?.(
      "[minigameService] canvas non disponibile: modalità immagini disattivata",
      error?.message || error,
    );
  }
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

function buildFastTypePromptImage(phrase?, labelText = "Scrivi questa frase prima di tutti") {
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

    drawCanvasTitle(ctx, String(labelText || "Scrivi questa frase prima di tutti"), width / 2, contentStartY, {
      size: 28,
      maxWidth: usableWidth,
    });

    let phraseY = contentStartY + labelHeight + gapLabelPhrase;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
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

    drawCanvasTitle(ctx, "Quiz Patente", textCenterX, y, { size: 52, maxWidth: usableWidth });
    y += titleHeight + titleGap;

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
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
      ctx.fillStyle = CANVAS_STYLE.accentHot;
      ctx.font = fontStackPrimaryOnly(46, "700");
      ctx.fillText("Rispondi con vero o falso", textCenterX, y);
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
  const base = ctx.createLinearGradient(0, 0, width * 0.2, height);
  base.addColorStop(0, CANVAS_STYLE.bgMid);
  base.addColorStop(0.55, CANVAS_STYLE.bgDeep);
  base.addColorStop(1, "#08060d");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);

  /* alone viola brand in alto a destra */
  const glow = ctx.createRadialGradient(width * 0.82, height * 0.12, 20, width * 0.78, height * 0.18, Math.max(width, height) * 0.55);
  glow.addColorStop(0, CANVAS_STYLE.bgGlow);
  glow.addColorStop(0.45, CANVAS_STYLE.bgGlowSoft);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  const glow2 = ctx.createRadialGradient(width * 0.12, height * 0.9, 10, width * 0.18, height * 0.85, Math.max(width, height) * 0.4);
  glow2.addColorStop(0, "rgba(90, 60, 140, 0.22)");
  glow2.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, width, height);

  /* vignetta leggera */
  const vig = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.25, width / 2, height / 2, Math.max(width, height) * 0.72);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, width, height);

  /* granello sottile (deterministic, no random per buffer stabili) */
  ctx.save();
  ctx.globalAlpha = 0.035;
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < 90; i += 1) {
    const x = ((i * 97) % Math.max(1, width - 2)) + 1;
    const y = ((i * 53) % Math.max(1, height - 2)) + 1;
    ctx.fillRect(x, y, 1.5, 1.5);
  }
  ctx.restore();
}

function fillCanvasCard(ctx?, x?, y?, w?, h?, radius = null) {
  const r = radius ?? CANVAS_STYLE.radius;
  ctx.save();
  /* ombra soft sotto la card */
  ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 10;
  const fill = ctx.createLinearGradient(x, y, x, y + h);
  fill.addColorStop(0, CANVAS_STYLE.cardFillTop);
  fill.addColorStop(1, CANVAS_STYLE.cardFill);
  ctx.fillStyle = fill;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  /* bordo viola */
  ctx.strokeStyle = CANVAS_STYLE.cardStroke;
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, r);
  ctx.stroke();

  /* highlight interno top */
  ctx.strokeStyle = CANVAS_STYLE.cardStrokeInner;
  ctx.lineWidth = 1;
  roundRect(ctx, x + 3, y + 3, w - 6, h - 6, Math.max(8, r - 4));
  ctx.stroke();
  ctx.restore();
}

function drawCanvasTitle(ctx?, text?, cx?, y?, opts: { size?: number; maxWidth?: number } = {}) {
  const size = Math.max(28, Number(opts.size) || 64);
  const maxWidth = Number(opts.maxWidth) || 1200;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = CANVAS_STYLE.titleColor;
  ctx.font = fontStackPrimaryOnly(size, "700");
  /* leggero glow sul titolo */
  ctx.shadowColor = "rgba(130, 107, 194, 0.55)";
  ctx.shadowBlur = 18;
  ctx.fillText(String(text || "Minigioco").slice(0, 56), cx, y, maxWidth);
  ctx.shadowBlur = 0;
  ctx.restore();
}

/** Cornice foto arrotolata + glow viola; ritaglia l’immagine dentro. */
function drawClippedPhoto(ctx?, photo?, x?, y?, w?, h?, radius = 18) {
  if (!photo) return;
  ctx.save();
  ctx.shadowColor = "rgba(130, 107, 194, 0.4)";
  ctx.shadowBlur = 22;
  ctx.fillStyle = "rgba(8, 6, 14, 0.95)";
  roundRect(ctx, x - 5, y - 5, w + 10, h + 10, radius + 3);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.beginPath();
  roundRect(ctx, x, y, w, h, radius);
  ctx.clip();
  ctx.drawImage(photo, x, y, w, h);
  ctx.restore();
  ctx.strokeStyle = "rgba(167, 139, 250, 0.55)";
  ctx.lineWidth = 2.5;
  roundRect(ctx, x, y, w, h, radius);
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
    fillCanvasCard(ctx, 28, 28, width - 56, height - 56, 22);

    const safeMax = Math.max(3, Math.min(10, Number(maxMisses) || 10));
    const m = Math.max(0, Math.min(safeMax, Number(misses) || 0));
    const ts = buildHangmanStepThresholds(safeMax);

    const leftZoneCenterX = 240;
    const wordCenterX = 600;
    const contentTop = 108;
    const contentBottom = 380;

    const poleBottomY = contentBottom - 24;
    const poleTopY = contentTop + 20;
    const poleX = leftZoneCenterX - 70;
    const beamStartX = poleX;
    const beamEndX = poleX + 140;
    const headCx = (beamStartX + beamEndX) / 2;
    const headCy = poleTopY + 32;
    const ropeY = poleTopY + 8;

    ctx.strokeStyle = CANVAS_STYLE.hangmanStroke;
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

    drawCanvasTitle(ctx, String(headerTitle || "Impiccato"), width / 2, 48, { size: 40, maxWidth: width - 120 });

    const wordStr = String(maskedWord || "").trim() || "_";
    ctx.fillStyle = CANVAS_STYLE.bodyColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = fontStackPrimaryOnly(44, "700");
    ctx.fillText(wordStr, wordCenterX, (contentTop + contentBottom) / 2, width - 320);

    const isLost = m >= safeMax;
    ctx.fillStyle = isLost ? CANVAS_STYLE.dangerColor : CANVAS_STYLE.mutedColor;
    ctx.font = fontStackPrimaryOnly(28, "700");
    ctx.fillText(`Errori: ${m}/${safeMax}`, width / 2, height - 58);

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

/** Solo emoji (o quasi): riga grande. Prosa + emoji sparse → font testo normale. */
function isEmojiHeavyLine(text?) {
  const tokens = tokenizeEmojiText(String(text || ""));
  const emojiCount = tokens.filter((t?) => t.type === "emoji" || t.type === "custom_emoji").length;
  if (!emojiCount) return false;
  const plain = tokens
    .filter((t?) => t.type === "text")
    .map((t?) => String(t.value || "").replace(/[\s\W_]+/g, ""))
    .join("");
  return plain.length <= 2;
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

    const usableWidth = cardW - 140;
    const titleText = String(title || "Minigioco");
    await drawLabelWithEmoji(ctx, titleText, width / 2, cardY + 52, {
      size: 56,
      weight: "700",
      color: CANVAS_STYLE.titleColor,
      align: "center",
      baseline: "top",
      forcePrimaryFont: true,
    });

    const sourceLines = Array.isArray(lines)
      ? lines.map((line?) => String(line || "").trim()).filter(Boolean)
      : [];
    if (!sourceLines.length) sourceLines.push("...");

    /* Adatta il font: le emoji nelle righe miste restano alla stessa misura del testo (niente 112px). */
    let textSize = 46;
    let emojiOnlySize = 96;
    let wrappedRows: { line: string; heavy: boolean; size: number; h: number }[] = [];
    const pack = (tSize: number, eSize: number) => {
      const rows = [];
      for (const raw of sourceLines) {
        const heavy = isEmojiHeavyLine(raw);
        const size = heavy ? eSize : tSize;
        const parts =
          heavy && !/\s/.test(raw)
            ? [raw]
            : wrapRichTextToLines(ctx, raw, usableWidth, size, "700");
        const list = parts.length ? parts : [raw];
        for (const line of list) {
          const lineHeavy = heavy || isEmojiHeavyLine(line);
          const lineSize = lineHeavy ? eSize : tSize;
          rows.push({
            line,
            heavy: lineHeavy,
            size: lineSize,
            h: lineHeavy ? lineSize + 28 : Math.round(lineSize * 1.28),
          });
        }
      }
      return rows;
    };

    for (; textSize >= 32; textSize -= 2, emojiOnlySize = Math.max(64, emojiOnlySize - 4)) {
      wrappedRows = pack(textSize, emojiOnlySize);
      const totalH = wrappedRows.reduce((s, r) => s + r.h, 0);
      const maxBody = cardH - 200;
      if (totalH <= maxBody && wrappedRows.length <= 6) break;
    }

    const totalBodyH = wrappedRows.reduce((s, r) => s + r.h, 0);
    const bodyTop = cardY + 160;
    const bodyBottom = cardY + cardH - 48;
    let y = bodyTop + Math.max(0, (bodyBottom - bodyTop - totalBodyH) / 2);

    for (const row of wrappedRows) {
      if (y + row.h * 0.35 > bodyBottom) break;
      /* Se ancora troppo largo (emoji custom lunghe), taglia con ellipsis. */
      let draw = row.line;
      if (measureRichTextWidth(ctx, draw, row.size, "700") > usableWidth) {
        const clipped = wrapRichTextToLines(ctx, draw, usableWidth, row.size, "700");
        draw = clipped[0] || draw;
      }
      await drawLabelWithEmoji(ctx, draw, width / 2, y + row.h * 0.45, {
        size: row.size,
        weight: "700",
        color: CANVAS_STYLE.bodyColor,
        align: "center",
        baseline: "middle",
        forcePrimaryFont: !row.heavy,
      });
      y += row.h;
    }

    const name = `${String(fileBaseName || "minigame").replace(/[^a-z0-9_-]/gi, "_").toLowerCase()}.png`;
    return new AttachmentBuilder(canvas.toBuffer("image/png"), { name });
  } catch (err) {
    global.logger?.warn?.("[MINIGAMES] buildEmojiRichPromptImageAttachment:", err?.message || err);
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

      drawCanvasTitle(ctx, String(title || "Quiz di Cultura Generale"), width / 2, cardY + 72, {
        size: 68,
        maxWidth: cardW - 120,
      });

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

      ctx.textAlign = "center";
      ctx.textBaseline = "top";
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

      drawCanvasTitle(ctx, String(title || "Indovina la parola da queste lettere"), width / 2, cardY + 72, {
        size: 68,
        maxWidth: cardW - 120,
      });

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
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
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
    const fastLabel = "Scrivi questa frase prima di tutti";
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

    drawCanvasTitle(ctx, String(title || "Minigioco"), width / 2, cardY + 52, {
      size: 60,
      maxWidth: cardW - 120,
    });

    const usableWidth = cardW - 120;
    const sourceLines = Array.isArray(lines) ? lines.map((line?) => String(line || "").trim()).filter(Boolean) : [];
    const renderedLines = [];
    for (const line of sourceLines) {
      ctx.font = fontStackPrimaryOnly(56, "700");
      renderedLines.push(...wrapPromptText(ctx, line, usableWidth));
    }
    if (!renderedLines.length) renderedLines.push("...");

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
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
    const photo = Buffer.isBuffer(imageUrl) ? await loadImage(imageUrl).catch(() => null) : await loadImageBufferFromUrl(imageUrl);
    if (!photo?.width || !photo?.height) return null;
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
    drawCanvasTitle(ctx, String(title || "Indovina").slice(0, 48), width / 2, cardY + 44, {
      size: 56,
      maxWidth: cardW - 100,
    });
    /* zona sotto il titolo: foto centrata; piccole (bandiere) si ingrandiscono fino a 3× */
    const areaTop = cardY + 128;
    const areaBottom = cardY + cardH - 40;
    const maxW = cardW - 140;
    const maxH = areaBottom - areaTop;
    const scale = Math.min(maxW / photo.width, maxH / photo.height, 3);
    const drawW = Math.round(photo.width * scale);
    const drawH = Math.round(photo.height * scale);
    const x = Math.round((width - drawW) / 2);
    const y = Math.round(areaTop + (maxH - drawH) / 2);
    drawClippedPhoto(ctx, photo, x, y, drawW, drawH, Math.min(20, Math.round(Math.min(drawW, drawH) / 12)));
    const name = String(fileName || "guess_image.png").replace(/[^\w.\-]+/g, "_");
    return new AttachmentBuilder(canvas.toBuffer("image/png"), { name: name.endsWith(".png") ? name : `${name}.png` });
  } catch {
    return null;
  }
}

/**
 * Card testo su foto d’atmosfera (es. citazione film: sala cinema, NON il poster della risposta).
 * Se la foto non carica → null (il chiamante fa fallback al prompt classico).
 */
async function buildAtmosphereTextCardAttachment(title?, lines = [], atmosphereUrl?, fileName = "atmosphere_text.png") {
  try {
    registerCanvasFonts(canvasModule);
    if (!atmosphereUrl) return null;
    const photo = Buffer.isBuffer(atmosphereUrl)
      ? await loadImage(atmosphereUrl).catch(() => null)
      : await loadImageBufferFromUrl(atmosphereUrl);
    if (!photo?.width || !photo?.height) return null;

    const width = 1400;
    const height = 780;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    const scale = Math.max(width / photo.width, height / photo.height);
    const dw = Math.round(photo.width * scale);
    const dh = Math.round(photo.height * scale);
    ctx.drawImage(photo, Math.round((width - dw) / 2), Math.round((height - dh) / 2), dw, dh);
    ctx.fillStyle = "rgba(8, 6, 14, 0.74)";
    ctx.fillRect(0, 0, width, height);
    const glow = ctx.createRadialGradient(width * 0.5, height * 0.35, 40, width * 0.5, height * 0.4, width * 0.55);
    glow.addColorStop(0, CANVAS_STYLE.bgGlowSoft);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    const cardX = CANVAS_STYLE.padding;
    const cardY = CANVAS_STYLE.padding;
    const cardW = width - CANVAS_STYLE.padding * 2;
    const cardH = height - CANVAS_STYLE.padding * 2;
    fillCanvasCard(ctx, cardX, cardY, cardW, cardH);

    drawCanvasTitle(ctx, String(title || "Minigioco").slice(0, 52), width / 2, cardY + 52, {
      size: 52,
      maxWidth: cardW - 120,
    });

    const usableWidth = cardW - 140;
    const sourceLines = Array.isArray(lines) ? lines.map((line?) => String(line || "").trim()).filter(Boolean) : [];
    const renderedLines = [];
    for (const line of sourceLines) {
      ctx.font = fontStackPrimaryOnly(48, "700");
      renderedLines.push(...wrapPromptText(ctx, line, usableWidth));
    }
    if (!renderedLines.length) renderedLines.push("…");

    let fontSize = renderedLines.length > 6 ? 40 : renderedLines.length > 4 ? 46 : 52;
    ctx.font = fontStackPrimaryOnly(fontSize, "700");
    const lineHeight = Math.round(fontSize * 1.28);
    const totalHeight = renderedLines.length * lineHeight;
    let y = Math.max(cardY + 160, Math.round(cardY + (cardH - totalHeight) / 2 + 20));
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = CANVAS_STYLE.bodyColor;
    ctx.font = fontStackPrimaryOnly(fontSize, "700");
    for (const line of renderedLines) {
      if (y + lineHeight > cardY + cardH - 36) break;
      ctx.fillText(line, width / 2, y, usableWidth);
      y += lineHeight;
    }

    const name = String(fileName || "atmosphere_text.png").replace(/[^\w.\-]+/g, "_");
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
    fillCanvasCard(ctx, pad, pad, cardW, cardH, 22);

    drawCanvasTitle(ctx, "Calcola", width / 2, pad + 36, { size: 28, maxWidth: cardW - 80 });
    ctx.fillStyle = CANVAS_STYLE.bodyColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(130, 107, 194, 0.45)";
    ctx.shadowBlur = 16;
    ctx.font = fontStackPrimaryOnly(112, "700");
    ctx.fillText(String(expression || ""), width / 2, height / 2 + 18);
    ctx.shadowBlur = 0;

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
    const buffer = canvas.toBuffer("image/png");
    if (opts?.cardTitle) {
      const cardAtt: any = await buildRemoteGuessImageCardAttachment(buffer, String(opts.cardTitle), attachmentName);
      if (cardAtt?.attachment) return { buffer: cardAtt.attachment, attachmentName };
    }
    return { buffer, attachmentName };
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
    fillCanvasCard(ctx, pad, pad, cardW, cardH, 22);

    drawCanvasTitle(ctx, label, width / 2, 118, { size: 36, maxWidth: cardW - 80 });
    ctx.fillStyle = CANVAS_STYLE.bodyColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(130, 107, 194, 0.4)";
    ctx.shadowBlur = 14;
    ctx.font = fontStackPrimaryOnly(88, "700");
    ctx.fillText(safeRegion, width / 2, 250, width - 140);
    ctx.shadowBlur = 0;

    return new AttachmentBuilder(canvas.toBuffer("image/png"), {
      name: "region_name.png",
    });
  } catch {
    return null;
  }
}

async function paintStarWarsSceneBackground(ctx?, width?, height?, backgroundUrl?) {
  const bgUrl = String(backgroundUrl || "").trim();
  if (bgUrl) {
    const img = await loadImageBufferFromUrl(bgUrl);
    if (img?.width && img?.height) {
      const scale = Math.max(width / img.width, height / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.drawImage(img, (width - dw) / 2, (height - dh) / 2, dw, dh);
      return;
    }
  }
  fillCanvasBackground(ctx, width, height);
}

function paintStarWarsPanel(ctx?, panelX?, panelY?, panelW?, panelH?, alpha = 0.74) {
  ctx.fillStyle = `rgba(5, 8, 16, ${alpha})`;
  roundRect(ctx, panelX, panelY, panelW, panelH, 28);
  ctx.fill();
  ctx.strokeStyle = "rgba(201, 162, 39, 0.6)";
  ctx.lineWidth = 3;
  roundRect(ctx, panelX, panelY, panelW, panelH, 28);
  ctx.stroke();
}

/** Prompt generico stile SW (sfondo CDN + pannello oro) per qualsiasi minigame a tema. */
async function buildStarWarsThemedPromptImage(row?) {
  try {
    registerCanvasFonts(canvasModule);
    const title = String(row?.title || "Minigioco").trim() || "Minigioco";
    const lines = Array.isArray(row?.lines)
      ? row.lines.map((l?) => String(l || "").trim()).filter(Boolean)
      : [];
    const bgUrl = String(row?.backgroundUrl || "").trim();
    const heroUrl = String(row?.heroImageUrl || "").trim();
    const fileName = String(row?.fileName || "starwars_minigame.png").replace(/[^\w.\-]+/g, "_") || "starwars_minigame.png";

    const W = 1280;
    const H = 720;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d");
    await paintStarWarsSceneBackground(ctx, W, H, bgUrl);

    const panelX = 70;
    const panelY = 90;
    const panelW = W - 140;
    const panelH = H - 180;
    paintStarWarsPanel(ctx, panelX, panelY, panelW, panelH, 0.76);

    const usableW = panelW - 100;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    await drawLabelWithEmoji(ctx, title.slice(0, 48), W / 2, panelY + 58, {
      size: 40,
      weight: "700",
      color: "#e4c76b",
      align: "center",
      baseline: "alphabetic",
      forcePrimaryFont: true,
    });

    let contentTop = panelY + 110;
    if (heroUrl) {
      const hero = await loadImageBufferFromUrl(heroUrl);
      if (hero?.width && hero?.height) {
        const maxW = panelW - 160;
        const maxH = Math.min(340, panelH - (lines.length ? 220 : 140));
        const scale = Math.min(maxW / hero.width, maxH / hero.height, 1);
        const dw = hero.width * scale;
        const dh = hero.height * scale;
        const hx = (W - dw) / 2;
        const hy = contentTop;
        ctx.save();
        roundRect(ctx, hx - 4, hy - 4, dw + 8, dh + 8, 16);
        ctx.clip();
        ctx.drawImage(hero, hx, hy, dw, dh);
        ctx.restore();
        ctx.strokeStyle = "rgba(201, 162, 39, 0.55)";
        ctx.lineWidth = 2;
        roundRect(ctx, hx - 4, hy - 4, dw + 8, dh + 8, 16);
        ctx.stroke();
        contentTop = hy + dh + 36;
      }
    }

    const textSize = heroUrl ? 32 : 42;
    const emojiOnlySize = heroUrl ? 56 : 72;
    ctx.font = fontStackPrimaryOnly(textSize, "700");
    const wrapped = [];
    for (const raw of lines) {
      const heavy = isEmojiHeavyLine(raw);
      /* sequenze solo-emoji: non spezzare; prosa+emoji → wrap rich */
      if (heavy && !/\s/.test(String(raw || "").trim())) {
        wrapped.push({ line: raw, heavy: true });
      } else {
        const parts = wrapRichTextToLines(ctx, raw, usableW, heavy ? emojiOnlySize : textSize, "700");
        for (const line of parts.length ? parts : [raw]) {
          wrapped.push({ line, heavy: isEmojiHeavyLine(line) });
        }
      }
    }
    const lineHeights = wrapped.map((row?) =>
      row.heavy ? emojiOnlySize + 16 : heroUrl ? 42 : 56,
    );
    const blockH = lineHeights.reduce((sum?, h?) => sum + h, 0);
    const areaBottom = panelY + panelH - 36;
    let y =
      contentTop +
      Math.max(0, (areaBottom - contentTop - blockH) / 2) +
      (heroUrl ? 28 : 40);
    for (let i = 0; i < wrapped.length; i += 1) {
      const row = wrapped[i];
      const lineH = lineHeights[i];
      if (y + lineH * 0.35 > areaBottom) break;
      await drawLabelWithEmoji(ctx, row.line, W / 2, y + lineH * 0.45, {
        size: row.heavy ? emojiOnlySize : textSize,
        weight: "700",
        color: "#f4e9d8",
        align: "center",
        baseline: "middle",
        forcePrimaryFont: !row.heavy,
      });
      y += lineH;
    }

    return new AttachmentBuilder(canvas.toBuffer("image/png"), { name: fileName });
  } catch {
    return null;
  }
}

async function buildStarWarsQuizPromptImage(row?) {
  try {
    registerCanvasFonts(canvasModule);
    const kind = String(row?.kind || "text");
    const question = String(row?.question || "").trim() || "Domanda";
    const choices = Array.isArray(row?.choices) ? row.choices.map((c?) => String(c || "").trim()).filter(Boolean) : [];
    const malusTitle = String(row?.malusTitle || "").trim();
    const title =
      kind === "vf" ? "VERO O FALSO" : kind === "mc" ? "QUIZ STAR WARS" : "QUIZ STAR WARS";
    const bgUrl = String(row?.backgroundUrl || "").trim();

    const W = 1280;
    const H = 720;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d");
    await paintStarWarsSceneBackground(ctx, W, H, bgUrl);

    const panelX = 70;
    const panelY = 90;
    const panelW = W - 140;
    const panelH = H - 180;
    paintStarWarsPanel(ctx, panelX, panelY, panelW, panelH, 0.74);

    const usableW = panelW - 100;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#e4c76b";
    ctx.font = fontStackPrimaryOnly(42, "700");
    ctx.fillText(title, W / 2, panelY + 58);
    if (malusTitle) {
      ctx.fillStyle = "rgba(248, 113, 113, 0.95)";
      ctx.font = fontStackPrimaryOnly(24, "700");
      ctx.fillText(malusTitle, W / 2, panelY + 92);
    }

    if (kind === "vf" && choices.length >= 2) {
      const boxW = Math.floor((panelW - 160) / 2);
      const boxH = 90;
      const boxY = panelY + panelH - 150;
      const leftX = panelX + 60;
      const rightX = panelX + panelW - 60 - boxW;

      ctx.fillStyle = "#f4e9d8";
      ctx.font = fontStackPrimaryOnly(38, "700");
      const qLines = wrapPromptText(ctx, question, usableW);
      const lineH = 50;
      const blockH = qLines.length * lineH;
      const areaTop = panelY + (malusTitle ? 120 : 100);
      const areaBottom = boxY - 28;
      let y = areaTop + Math.max(0, (areaBottom - areaTop - blockH) / 2) + lineH * 0.75;
      for (const line of qLines) {
        ctx.fillText(line, W / 2, y);
        y += lineH;
      }
      const labels = [choices[0] || "Vero", choices[1] || "Falso"];
      for (const [i, boxX] of [
        [0, leftX],
        [1, rightX],
      ] as const) {
        ctx.fillStyle = "rgba(255,255,255,0.1)";
        roundRect(ctx, boxX, boxY, boxW, boxH, 18);
        ctx.fill();
        ctx.strokeStyle = "rgba(201, 162, 39, 0.45)";
        ctx.lineWidth = 2;
        roundRect(ctx, boxX, boxY, boxW, boxH, 18);
        ctx.stroke();
        ctx.fillStyle = "#f8fafc";
        ctx.font = fontStackPrimaryOnly(36, "700");
        ctx.textBaseline = "middle";
        ctx.fillText(String(labels[i]), boxX + boxW / 2, boxY + boxH / 2);
      }
    } else if (kind === "mc" && choices.length >= 2) {
      ctx.fillStyle = "#f4e9d8";
      ctx.font = fontStackPrimaryOnly(36, "700");
      const qLines = wrapPromptText(ctx, question, usableW);
      let y = panelY + (malusTitle ? 160 : 140);
      for (const line of qLines) {
        ctx.fillText(line, W / 2, y);
        y += 48;
      }

      const letters = ["A", "B", "C", "D"];
      y += 24;
      ctx.font = fontStackPrimaryOnly(30, "700");
      const choiceW = panelW - 120;
      for (let i = 0; i < Math.min(choices.length, 4); i++) {
        const label = `${letters[i]})  ${choices[i]}`;
        const boxY = y - 34;
        ctx.fillStyle = "rgba(255,255,255,0.09)";
        roundRect(ctx, panelX + 60, boxY, choiceW, 54, 14);
        ctx.fill();
        ctx.fillStyle = "#f8fafc";
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillText(label, panelX + 88, y, choiceW - 40);
        ctx.textAlign = "center";
        y += 68;
      }
    } else {
      /* text: domanda centrata in altezza nel pannello */
      ctx.fillStyle = "#f4e9d8";
      ctx.font = fontStackPrimaryOnly(44, "700");
      const qLines = wrapPromptText(ctx, question, usableW);
      const lineH = 58;
      const blockH = qLines.length * lineH;
      let y = panelY + (panelH - blockH) / 2 + 20;
      for (const line of qLines) {
        ctx.fillText(line, W / 2, y);
        y += lineH;
      }
      ctx.fillStyle = "rgba(244, 233, 216, 0.55)";
      ctx.font = fontStackPrimaryOnly(26, "600");
      ctx.fillText("Scrivi la risposta nel canale", W / 2, panelY + panelH - 48);
    }

    return new AttachmentBuilder(canvas.toBuffer("image/png"), { name: "starwars_quiz.png" });
  } catch {
    return null;
  }
}

async function buildStarWarsQuizAnnounceImage(row?) {
  try {
    registerCanvasFonts(canvasModule);
    const title = String(row?.title || "MALUS QUIZ").trim() || "MALUS QUIZ";
    const lines = Array.isArray(row?.lines) ? row.lines.map((l?) => String(l || "").trim()).filter(Boolean) : [];
    const bgUrl = String(row?.backgroundUrl || "").trim();

    const W = 1280;
    const H = 720;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d");
    await paintStarWarsSceneBackground(ctx, W, H, bgUrl);

    const panelX = 70;
    const panelY = 90;
    const panelW = W - 140;
    const panelH = H - 180;
    paintStarWarsPanel(ctx, panelX, panelY, panelW, panelH, 0.78);

    const usableW = panelW - 100;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#e4c76b";
    ctx.font = fontStackPrimaryOnly(40, "700");
    ctx.fillText("MALUS QUIZ", W / 2, panelY + 58);

    ctx.fillStyle = "#f4e9d8";
    ctx.font = fontStackPrimaryOnly(44, "700");
    const titleLines = wrapPromptText(ctx, title, usableW);
    let y = panelY + 130;
    for (const line of titleLines) {
      ctx.fillText(line, W / 2, y);
      y += 52;
    }

    y += 16;
    ctx.fillStyle = "rgba(244, 233, 216, 0.9)";
    ctx.font = fontStackPrimaryOnly(30, "600");
    for (const raw of lines) {
      const wrapped = wrapPromptText(ctx, raw, usableW);
      for (const line of wrapped) {
        if (y > panelY + panelH - 40) break;
        ctx.fillText(line, W / 2, y);
        y += 40;
      }
      y += 10;
    }

    return new AttachmentBuilder(canvas.toBuffer("image/png"), { name: "starwars_quiz_malus.png" });
  } catch {
    return null;
  }
}

export = {
  buildDrivingQuizPromptImage,
  buildEmojiRichPromptImageAttachment,
  buildPromptImageAttachment,
  buildRemoteGuessImageCardAttachment,
  buildAtmosphereTextCardAttachment,
  buildMathExpressionImageAttachment,
  censorArtworkImage,
  buildRegionNameImageAttachment,
  buildStarWarsThemedPromptImage,
  buildStarWarsQuizPromptImage,
  buildStarWarsQuizAnnounceImage,
};
