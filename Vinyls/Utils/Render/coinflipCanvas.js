const canvasModule = require("canvas");
const GIFEncoder = require("gif-encoder-2");
const { formatGaleoni } = require("../../Services/Community/gringottService");
const { registerCanvasFonts, drawTextWithSpecialFallback } = require("./canvasFonts");
const { sideLabel } = require("../Economy/coinflipEngine");
const { createCanvas } = canvasModule;
const USE_PNG = String(process.env.VC_COINFLIP_CANVAS_PNG ?? "0").trim() === "1";
const HOLD_RESULT_FRAMES = 6;
let fontsReady = false;

function ensureFonts() {
  if (fontsReady) return;
  registerCanvasFonts(canvasModule);
  fontsReady = true;
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function fillRoundRect(ctx, x, y, w, h, r, fillStyle) {
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = fillStyle;
  ctx.fill();
  ctx.restore();
}

function strokeRoundRect(ctx, x, y, w, h, r, strokeStyle, lineWidth = 2) {
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
  ctx.restore();
}

function drawText(ctx, text, x, y, opts = {}) {
  drawTextWithSpecialFallback(ctx, text, x, y, {
    size: opts.size || 22,
    weight: opts.weight || "700",
    color: opts.color || "#ffffff",
    align: opts.align || "center",
    baseline: opts.baseline || "middle",
    forcePrimaryFont: opts.forcePrimaryFont === true,
  });
}

function drawPlainText(ctx, text, x, y, opts = {}) {
  ctx.save();
  const size = Math.max(10, Math.floor(Number(opts.size) || 18));
  ctx.font = `${opts.weight || "700"} ${size}px Arial, Helvetica, sans-serif`;
  ctx.fillStyle = opts.color || "#ffffff";
  ctx.textAlign = opts.align || "center";
  ctx.textBaseline = opts.baseline || "middle";
  ctx.fillText(String(text ?? ""), x, y);
  ctx.restore();
}

function drawBg(ctx, width, height) {
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#0a2618");
  bg.addColorStop(0.5, "#14532d");
  bg.addColorStop(1, "#052e16");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  fillRoundRect(ctx, 40, 54, width - 80, height - 72, 22, "rgba(0,0,0,0.2)");
  strokeRoundRect(ctx, 40, 54, width - 80, height - 72, 22, "rgba(212,175,55,0.4)", 2);
}

function visibleSideForFrame(params) {
  const flip = params.flipResult || "";
  const player = params.playerChoice || "";
  if (!params.animating) {
    if (params.hasResult) return flip || player || "";
    return "";
  }
  const total = Math.max(1, params.totalFrames || 24);
  const idx = Math.max(0, Math.min(total - 1, params.frameIndex || 0));
  if (idx >= total - 2) return flip || player || "testa";
  return idx % 2 === 0 ? "testa" : "croce";
}

function paramsSpinScale(spinT) {
  return Math.max(0.16, Math.abs(Math.cos((Number(spinT) || 0) * Math.PI * 5)));
}

function drawCrownMark(ctx, s) {
  const w = s * 0.48;
  ctx.fillStyle = "#4a3810";
  ctx.strokeStyle = "#2d2208";
  ctx.lineWidth = Math.max(2, s * 0.035);
  ctx.beginPath();
  ctx.moveTo(-w / 2, s * 0.1);
  ctx.lineTo(-w * 0.32, -s * 0.2);
  ctx.lineTo(-w * 0.1, s * 0.04);
  ctx.lineTo(0, -s * 0.28);
  ctx.lineTo(w * 0.1, s * 0.04);
  ctx.lineTo(w * 0.32, -s * 0.2);
  ctx.lineTo(w / 2, s * 0.1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawCrossMark(ctx, s) {
  ctx.strokeStyle = "#4a3810";
  ctx.lineWidth = Math.max(2, s * 0.07);
  const arm = s * 0.2;
  ctx.beginPath();
  ctx.moveTo(0, -arm);
  ctx.lineTo(0, arm);
  ctx.moveTo(-arm, 0);
  ctx.lineTo(arm, 0);
  ctx.stroke();
}

function drawCoinFace(ctx, side, radius) {
  const ink = "#3d2e08";
  if (side === "testa") {
    drawCrownMark(ctx, radius * 0.55);
    drawPlainText(ctx, "T", 0, radius * 0.02, { size: Math.floor(radius * 0.38), color: ink, weight: "900" });
    return;
  }
  if (side === "croce") {
    drawCrossMark(ctx, radius * 0.5);
    drawPlainText(ctx, "C", 0, radius * 0.05, { size: Math.floor(radius * 0.36), color: ink, weight: "900" });
    return;
  }
  drawPlainText(ctx, "?", 0, 0, { size: Math.floor(radius * 0.42), color: "#5c4510", weight: "900" });
}

function drawCoin(ctx, cx, cy, radius, side, spinT) {
  const scaleX = paramsSpinScale(spinT);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  ctx.ellipse(0, radius * 0.9, radius * 0.68 * scaleX, radius * 0.09, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fill();
  ctx.scale(scaleX, 1);
  const edge = ctx.createLinearGradient(-radius, -radius, radius, radius);
  edge.addColorStop(0, "#c9a227");
  edge.addColorStop(0.45, "#8b6914");
  edge.addColorStop(1, "#5c4510");
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = edge;
  ctx.fill();
  ctx.lineWidth = Math.max(3, radius * 0.04);
  ctx.strokeStyle = "#2d2208";
  ctx.stroke();
  const face = ctx.createRadialGradient(-radius * 0.25, -radius * 0.3, radius * 0.05, 0, 0, radius * 0.78);
  face.addColorStop(0, "#f0dfa0");
  face.addColorStop(0.55, "#d4af37");
  face.addColorStop(1, "#9a7b1a");
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.8, 0, Math.PI * 2);
  ctx.fillStyle = face;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.66, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(45,34,8,0.25)";
  ctx.lineWidth = 2;
  ctx.stroke();
  if (scaleX > 0.34) drawCoinFace(ctx, side, radius * 0.72);
  ctx.restore();
}

function drawMiniCoin(ctx, x, y, side, active) {
  const r = 34;
  drawCoin(ctx, x, y, r, side || "", 1);
  if (active) {
    ctx.save();
    ctx.strokeStyle = "#f8d875";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r + 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  const lbl = side === "testa" ? "TESTA" : side === "croce" ? "CROCE" : "";
  if (lbl) drawPlainText(ctx, lbl, x, y + r + 16, { size: 12, color: active ? "#f8d875" : "#94a3b8", weight: "800" });
}

function buildStatusText(params) {
  const hasResult = Boolean(params.hasResult && !params.animating && params.flipResult);
  if (hasResult) {
    const pick = params.playerChoice ? sideLabel(params.playerChoice) : "—";
    const flip = sideLabel(params.flipResult);
    if (params.win) return { right: `${pick} → ${flip}  ·  Vittoria +${formatGaleoni(params.payout)}`, color: "#4ade80" };
    return { right: `${pick} → ${flip}  ·  Sconfitta`, color: "#f87171" };
  }
  if (params.animating) return { right: "La moneta gira…", color: "#f8d875" };
  return { right: "Scegli Testa o Croce", color: "#e2e8f0" };
}

function drawInfoRow(ctx, width, y, leftText, rightText, rightColor) {
  if (leftText) drawPlainText(ctx, leftText, 64, y, { size: 14, color: "#94a3b8", align: "left", weight: "700" });
  if (rightText) drawText(ctx, rightText, width - 64, y, { size: 15, color: rightColor || "#f1f5f9", align: "right", forcePrimaryFont: true });
}

function drawArena(ctx, params) {
  const width = params.width;
  const height = params.height;
  const hasResult = Boolean(params.hasResult && !params.animating && params.flipResult);
  drawBg(ctx, width, height);
  drawText(ctx, "TESTA O CROCE", width / 2, 32, { size: 24, color: "#f8d875", weight: "900", forcePrimaryFont: true });
  const infoY = height - 42;
  const coinR = 92;
  const coinY = Math.round((54 + infoY - 36) / 2);
  const spinT = params.animating ? (params.frameIndex || 0) / Math.max(1, (params.totalFrames || 24) - 1) : 1;
  const visible = visibleSideForFrame(params);
  if (!hasResult) {
    const pc = params.playerChoice || "";
    drawMiniCoin(ctx, width * 0.26, coinY, "testa", pc === "testa");
    drawMiniCoin(ctx, width * 0.74, coinY, "croce", pc === "croce");
  }
  drawCoin(ctx, width / 2, coinY, coinR, visible, spinT);
  const betLine = params.bet > 0 ? `Puntata: ${formatGaleoni(params.bet)}` : "";
  const status = buildStatusText(params);
  drawInfoRow(ctx, width, infoY, betLine, status.right, status.color);
}

function spinFrameTiming() {
  const totalFrames = Math.max(18, Math.min(36, Math.floor(Number(process.env.VC_COINFLIP_GIF_FRAMES ?? 22))));
  const delay = Math.max(70, Math.min(160, Math.floor(Number(process.env.VC_COINFLIP_GIF_DELAY_MS ?? 95))));
  const gifFrames = totalFrames + HOLD_RESULT_FRAMES;
  return { totalFrames, delay, gifFrames, durationMs: gifFrames * delay + 80 };
}

function renderIdlePng(params) {
  const width = 760;
  const height = 420;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const timing = spinFrameTiming();
  drawArena(ctx, {
    width,
    height,
    bet: params.bet,
    playerChoice: params.playerChoice,
    flipResult: params.flipResult,
    hasResult: params.hasResult,
    win: params.win,
    payout: params.payout,
    animating: false,
    frameIndex: timing.totalFrames - 1,
    totalFrames: timing.totalFrames,
  });
  return canvas.toBuffer("image/png");
}

async function renderSpinGif(params) {
  const width = 760;
  const height = 420;
  const { totalFrames, delay, gifFrames } = spinFrameTiming();
  const encoder = new GIFEncoder(width, height);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  encoder.start();
  encoder.setRepeat(0);
  encoder.setDelay(delay);
  encoder.setQuality(12);
  for (let i = 0; i < gifFrames; i += 1) {
    const frameIndex = Math.min(i, totalFrames - 1);
    ctx.clearRect(0, 0, width, height);
    drawArena(ctx, {
      width,
      height,
      bet: params.bet,
      playerChoice: params.playerChoice,
      flipResult: params.flipResult,
      hasResult: true,
      win: params.win,
      payout: params.payout,
      animating: true,
      frameIndex,
      totalFrames,
    });
    encoder.addFrame(ctx);
  }
  encoder.finish();
  const out = encoder.out.getData();
  if (!out || !out.length) throw new Error("empty gif");
  return Buffer.from(out);
}

async function renderCoinflipCanvas(params = {}) {
  if (!canvasModule) throw new Error("Canvas module not available");
  ensureFonts();
  const animating = Boolean(params.animating);
  const normalized = {
    bet: Math.max(0, Math.floor(Number(params.bet) || 0)),
    playerChoice: String(params.playerChoice || ""),
    flipResult: String(params.flipResult || ""),
    hasResult: Boolean(params.hasResult),
    win: Boolean(params.win),
    payout: Math.max(0, Math.floor(Number(params.payout) || 0)),
    animating,
  };
  try {
    if (animating && !USE_PNG) {
      return { buffer: await renderSpinGif(normalized), format: "gif" };
    }
    return { buffer: renderIdlePng(normalized), format: "png" };
  } catch (err) {
    global.logger?.warn?.("[COINFLIP CANVAS] render failed:", err?.message || err);
    return { buffer: renderIdlePng(normalized), format: "png" };
  }
}

renderCoinflipCanvas.spinAnimationDurationMs = function spinAnimationDurationMs() {
  return spinFrameTiming().durationMs;
};

renderCoinflipCanvas.warmup = function warmup() {
  if (!canvasModule) return;
  ensureFonts();
  try {
    renderIdlePng({ bet: 5, hasResult: false });
  } catch (_) {}
};

module.exports = renderCoinflipCanvas;