const canvasModule = require("canvas");
const GIFEncoder = require("gif-encoder-2");
const { registerCanvasFonts, drawTextWithSpecialFallback } = require("./canvasFonts");
const { formatGaleoni } = require("../../Services/Community/gringottService");
const { RED_NUMBERS } = require("../../Services/Community/serverEconomyService");
const { createCanvas } = canvasModule;
const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const POCKET_COUNT = WHEEL_ORDER.length;
const CHOICE_LABEL = { rosso: "Rosso", nero: "Nero", pari: "Pari", dispari: "Dispari" };
const USE_PNG = String(process.env.VC_ROULETTE_CANVAS_PNG ?? "0").trim() === "1";
const HOLD_RESULT_FRAMES = 3;
let fontsReady = false;

function ensureFonts() {
  if (fontsReady) return;
  registerCanvasFonts(canvasModule);
  fontsReady = true;
}

function pocketColor(number) {
  if (number === 0) return "#1f9d55";
  return RED_NUMBERS.has(number) ? "#c41e3a" : "#141414";
}

function pocketIndex(number) {
  const idx = WHEEL_ORDER.indexOf(Number(number));
  return idx >= 0 ? idx : 0;
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
    size: opts.size || 24,
    weight: opts.weight || "700",
    color: opts.color || "#ffffff",
    align: opts.align || "center",
    baseline: opts.baseline || "middle",
    forcePrimaryFont: opts.forcePrimaryFont === true,
  });
}

function drawBg(ctx, width, height, frameIndex, lite = false) {
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#0c0a10");
  bg.addColorStop(0.45, "#1a1018");
  bg.addColorStop(1, "#06050a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.globalAlpha = 0.18;
  const sparkCount = lite ? 8 : 16;
  for (let i = 0; i < sparkCount; i += 1) {
    const x = (i * 97 + frameIndex * 5) % (width + 60) - 30;
    const y = 28 + ((i * 53) % (height - 70));
    ctx.fillStyle = i % 2 === 0 ? "#d4af37" : "#f8fafc";
    ctx.beginPath();
    ctx.arc(x, y, i % 2 === 0 ? 2.2 : 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

function pocketCenterAngle(idx) {
  const pocketAngle = (Math.PI * 2) / POCKET_COUNT;
  return idx * pocketAngle;
}

function wheelRotationForResult(resultNumber) {
  const targetIdx = pocketIndex(resultNumber);
  return -Math.PI / 2 - pocketCenterAngle(targetIdx);
}

function wheelAngleForFrame(frameIndex, totalFrames, resultNumber) {
  const targetAngle = wheelRotationForResult(resultNumber);
  const spins = 3.2 + (Number(resultNumber) % 5) * 0.25;
  const progress = easeOutCubic(Math.min(1, frameIndex / Math.max(1, totalFrames - 1)));
  return spins * Math.PI * 2 * (1 - progress) + targetAngle * progress;
}

function drawWheelRim(ctx, radius) {
  const rimGrad = ctx.createRadialGradient(0, 0, radius * 0.88, 0, 0, radius + 18);
  rimGrad.addColorStop(0, "#5c3d18");
  rimGrad.addColorStop(0.55, "#2a1a0a");
  rimGrad.addColorStop(1, "#120a04");
  ctx.beginPath();
  ctx.arc(0, 0, radius + 18, 0, Math.PI * 2);
  ctx.fillStyle = rimGrad;
  ctx.fill();
  ctx.strokeStyle = "#e8c56a";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, radius + 8, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawWheel(ctx, cx, cy, radius, wheelRotation, highlightNumber, lite = false) {
  const pocketAngle = (Math.PI * 2) / POCKET_COUNT;
  ctx.save();
  ctx.translate(cx, cy);
  drawWheelRim(ctx, radius);
  ctx.rotate(wheelRotation);

  for (let i = 0; i < POCKET_COUNT; i += 1) {
    const number = WHEEL_ORDER[i];
    const start = i * pocketAngle - pocketAngle / 2;
    const end = start + pocketAngle;
    const isHit = highlightNumber != null && Number(number) === Number(highlightNumber);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius, start, end);
    ctx.closePath();
    ctx.fillStyle = pocketColor(number);
    ctx.fill();
    if (isHit) {
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = "#fef08a";
      ctx.fill();
      ctx.restore();
    }
    ctx.strokeStyle = isHit ? "#fef08a" : "rgba(255,255,255,0.14)";
    ctx.lineWidth = isHit ? 3 : lite ? 0.7 : 1.1;
    ctx.stroke();

    if (!lite || isHit) {
      const mid = pocketCenterAngle(i);
      const tx = Math.cos(mid) * radius * 0.72;
      const ty = Math.sin(mid) * radius * 0.72;
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(mid + Math.PI / 2);
      drawText(ctx, String(number), 0, 0, {
        size: number >= 10 ? 12 : 14,
        color: "#f8fafc",
        weight: "800",
        forcePrimaryFont: true,
      });
      ctx.restore();
    }
  }

  const hubGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, radius * 0.3);
  hubGrad.addColorStop(0, "#fff0b3");
  hubGrad.addColorStop(0.45, "#d4af37");
  hubGrad.addColorStop(1, "#4a3410");
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.28, 0, Math.PI * 2);
  ctx.fillStyle = hubGrad;
  ctx.fill();
  ctx.strokeStyle = "#fef3c7";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.1, 0, Math.PI * 2);
  ctx.fillStyle = "#1a1208";
  ctx.fill();
  ctx.restore();
}

function drawBallMarker(ctx, cx, cy, radius) {
  const tipY = cy - radius - 20;
  ctx.save();
  ctx.fillStyle = "#d4af37";
  ctx.strokeStyle = "#fef08a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, tipY - 16);
  ctx.lineTo(cx - 12, tipY + 4);
  ctx.lineTo(cx + 12, tipY + 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = "rgba(248,216,117,0.45)";
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(cx, tipY + 6);
  ctx.lineTo(cx, cy - radius + 4);
  ctx.stroke();
  ctx.restore();
}

function drawBall(ctx, cx, cy, radius, frameIndex, lite = false) {
  const wobble = Math.sin(frameIndex * 0.9) * 2.5;
  const ballR = radius + 10 + wobble;
  const bx = cx;
  const by = cy - ballR;
  ctx.save();
  if (!lite) {
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 10;
  }
  ctx.beginPath();
  ctx.arc(bx, by, 9, 0, Math.PI * 2);
  const ballGrad = ctx.createRadialGradient(bx - 2, by - 2, 1, bx, by, 9);
  ballGrad.addColorStop(0, "#ffffff");
  ballGrad.addColorStop(0.45, "#e2e8f0");
  ballGrad.addColorStop(1, "#94a3b8");
  ctx.fillStyle = ballGrad;
  ctx.fill();
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function canvasFooter(text) {
  return String(text || "").replace(/\*\*/g, "");
}

function choiceLabel(choice, isNumber) {
  if (isNumber) return `Numero ${choice}`;
  return CHOICE_LABEL[String(choice || "").toLowerCase()] || String(choice || "—");
}

function drawBetPanel(ctx, x, y, w, h, params) {
  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, "rgba(22,14,18,0.94)");
  grad.addColorStop(1, "rgba(8,6,10,0.96)");
  fillRoundRect(ctx, x, y, w, h, 22, grad);
  strokeRoundRect(ctx, x, y, w, h, 22, "#d4af37", 2.5);
  drawText(ctx, "PUNTATA", x + w / 2, y + 28, { size: 14, color: "#94a3b8", weight: "700", forcePrimaryFont: true });
  drawText(ctx, choiceLabel(params.playerChoice, params.isNumber), x + w / 2, y + 58, {
    size: 22,
    color: "#f8d875",
    weight: "900",
    forcePrimaryFont: true,
  });
  if (params.bet > 0) {
    drawText(ctx, formatGaleoni(params.bet), x + w / 2, y + 92, { size: 18, color: "#e2e8f0", weight: "800", forcePrimaryFont: true });
  }
  const chips = [
    { label: "R", color: "#c41e3a", on: params.playerChoice === "rosso" },
    { label: "N", color: "#1e293b", on: params.playerChoice === "nero" },
    { label: "P", color: "#2563eb", on: params.playerChoice === "pari" },
    { label: "D", color: "#7c3aed", on: params.playerChoice === "dispari" },
  ];
  const chipY = y + 128;
  for (let i = 0; i < chips.length; i += 1) {
    const cx = x + 36 + i * 58;
    ctx.beginPath();
    ctx.arc(cx, chipY, 20, 0, Math.PI * 2);
    ctx.fillStyle = chips[i].on ? chips[i].color : "rgba(255,255,255,0.08)";
    ctx.fill();
    ctx.strokeStyle = chips[i].on ? "#fef08a" : "rgba(212,175,55,0.35)";
    ctx.lineWidth = chips[i].on ? 3 : 1.5;
    ctx.stroke();
    drawText(ctx, chips[i].label, cx, chipY, { size: 14, color: "#f8fafc", weight: "900", forcePrimaryFont: true });
  }
}

function drawResultBadge(ctx, x, y, w, result, win) {
  if (!result || result.number == null) return;
  const num = Number(result.number);
  const color = result.color || (num === 0 ? "verde" : RED_NUMBERS.has(num) ? "rosso" : "nero");
  fillRoundRect(ctx, x, y, w, 88, 18, "rgba(0,0,0,0.5)");
  strokeRoundRect(ctx, x, y, w, 88, 18, win ? "#4ade80" : "#f87171", 2);
  drawText(ctx, "ESITO", x + w / 2, y + 22, { size: 13, color: "#94a3b8", weight: "700", forcePrimaryFont: true });
  drawText(ctx, String(num), x + w / 2, y + 50, { size: 34, color: "#fef08a", weight: "900", forcePrimaryFont: true });
  drawText(ctx, `${color} · ${result.evenOdd || ""}`, x + w / 2, y + 74, { size: 14, color: "#e2e8f0", weight: "700", forcePrimaryFont: true });
}

function resolveWheelFrame(frameIndex, totalFrames, hasResult, animating) {
  if (!hasResult) return frameIndex;
  if (animating) return frameIndex;
  return Math.max(0, totalFrames - 1);
}

function drawArena(ctx, params) {
  const width = params.width;
  const height = params.height;
  const frameIndex = params.frameIndex;
  const totalFrames = params.totalFrames;
  const animating = Boolean(params.animating);
  const hasResult = Boolean(params.hasResult);
  const result = params.spinResult || {};
  const lite = Boolean(params.lite);
  drawBg(ctx, width, height, frameIndex, lite);

  drawText(ctx, "ROULETTE", width / 2, 34, { size: 24, color: "#f8d875", weight: "900", forcePrimaryFont: true });

  const wheelCx = Math.round(width * 0.34);
  const wheelCy = Math.round(height * 0.54);
  const wheelR = 162;
  const activeFrame = resolveWheelFrame(frameIndex, totalFrames, hasResult, animating);
  const wheelRot = hasResult
    ? wheelAngleForFrame(activeFrame, totalFrames, result.number)
    : frameIndex * 0.03;
  const showHighlight = hasResult && (!animating || activeFrame >= totalFrames - 3);
  const highlight = showHighlight ? result.number : null;
  const wheelLite = lite || (animating && activeFrame < totalFrames - 4);
  drawWheel(ctx, wheelCx, wheelCy, wheelR, wheelRot, highlight, wheelLite);
  drawBallMarker(ctx, wheelCx, wheelCy, wheelR);
  drawBall(ctx, wheelCx, wheelCy, wheelR, frameIndex, wheelLite);

  const panelX = Math.round(width * 0.56);
  const panelY = 78;
  const panelW = Math.min(300, width - panelX - 24);
  drawBetPanel(ctx, panelX, panelY, panelW, 190, params);
  if (hasResult && (!animating || activeFrame >= totalFrames - 3)) {
    drawResultBadge(ctx, panelX, panelY + 208, panelW, result, params.win);
  }

  let footer = params.playerChoice ? "Premi Gira per lanciare la pallina" : "Scegli rosso, nero, pari, dispari o un numero";
  let footerColor = "#e2e8f0";
  if (animating && !hasResult) {
    footer = "La ruota sta girando...";
    footerColor = "#f8d875";
  } else if (animating) {
    footer = "La pallina rallenta...";
    footerColor = "#f8d875";
  } else if (hasResult) {
    if (params.win) {
      footer = `Vincita ${formatGaleoni(params.payout)}`;
      footerColor = "#4ade80";
    } else {
      footer = "Puntata persa";
      footerColor = "#f87171";
    }
  }
  const footerY = height - 48;
  fillRoundRect(ctx, 48, footerY, width - 96, 36, 16, "rgba(0,0,0,0.45)");
  drawText(ctx, canvasFooter(footer), width / 2, footerY + 18, { size: 18, color: footerColor, forcePrimaryFont: true });
}

function normalizeParams(params = {}) {
  const spin = params.spinResult && typeof params.spinResult === "object" ? params.spinResult : {};
  return {
    bet: Math.max(0, Math.floor(Number(params.bet) || 0)),
    playerChoice: String(params.playerChoice || "").trim().toLowerCase(),
    isNumber: Boolean(params.isNumber),
    spinResult: spin,
    win: Boolean(params.win),
    payout: Math.max(0, Math.floor(Number(params.payout) || 0)),
    hasResult: Boolean(params.hasResult),
    animating: Boolean(params.animating),
  };
}

function spinFrameTiming() {
  const totalFrames = Math.max(14, Math.min(36, Math.floor(Number(process.env.VC_ROULETTE_GIF_FRAMES ?? 18))));
  const delay = Math.max(55, Math.min(140, Math.floor(Number(process.env.VC_ROULETTE_GIF_DELAY_MS ?? 70))));
  const gifFrames = totalFrames + HOLD_RESULT_FRAMES;
  return { totalFrames, delay, gifFrames, durationMs: gifFrames * delay + 60 };
}

function renderIdlePng(params) {
  const width = 760;
  const height = 480;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const timing = spinFrameTiming();
  const normalized = normalizeParams(params);
  const endFrame = normalized.hasResult ? timing.totalFrames - 1 : 0;
  drawArena(ctx, {
    ...normalized,
    width,
    height,
    frameIndex: endFrame,
    totalFrames: timing.totalFrames,
    animating: false,
  });
  return canvas.toBuffer("image/png");
}

function renderSpinPreviewPng(params) {
  const width = 760;
  const height = 480;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const timing = spinFrameTiming();
  const normalized = normalizeParams({
    ...params,
    animating: true,
    hasResult: false,
    spinResult: {},
    win: false,
    payout: 0,
  });
  drawArena(ctx, {
    ...normalized,
    width,
    height,
    frameIndex: 0,
    totalFrames: timing.totalFrames,
    animating: true,
    lite: true,
  });
  return canvas.toBuffer("image/png");
}

async function renderSpinGif(params) {
  const width = 760;
  const height = 480;
  const { totalFrames, delay, gifFrames } = spinFrameTiming();
  const normalized = normalizeParams({ ...params, animating: true, hasResult: true });
  const encoder = new GIFEncoder(width, height);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  encoder.start();
  encoder.setRepeat(0);
  encoder.setDelay(delay);
  encoder.setQuality(10);
  for (let i = 0; i < gifFrames; i += 1) {
    const frameIndex = Math.min(i, totalFrames - 1);
    const lite = frameIndex < totalFrames - 4;
    ctx.clearRect(0, 0, width, height);
    drawArena(ctx, { ...normalized, width, height, frameIndex, totalFrames, animating: true, lite });
    encoder.addFrame(ctx);
  }
  encoder.finish();
  const out = encoder.out.getData();
  if (!out || !out.length) throw new Error("empty gif");
  return Buffer.from(out);
}

async function renderRouletteCanvas(params = {}) {
  if (!canvasModule) throw new Error("Canvas module not available");
  ensureFonts();
  const animating = Boolean(params.animating);
  const previewSpin = Boolean(params.previewSpin);
  try {
    if (previewSpin) {
      return { buffer: renderSpinPreviewPng(params), format: "png" };
    }
    if (animating && !USE_PNG) {
      return { buffer: await renderSpinGif(params), format: "gif" };
    }
    return { buffer: renderIdlePng(params), format: "png" };
  } catch (err) {
    global.logger?.warn?.("[ROULETTE CANVAS] render failed:", err?.message || err);
    return { buffer: renderIdlePng(params), format: "png" };
  }
}

renderRouletteCanvas.spinAnimationDurationMs = function spinAnimationDurationMs() {
  return spinFrameTiming().durationMs;
};

renderRouletteCanvas.warmup = function warmup() {
  if (!canvasModule) return;
  ensureFonts();
  try {
    renderIdlePng({ bet: 5, playerChoice: "rosso", hasResult: false });
    renderSpinPreviewPng({
      bet: 5,
      playerChoice: "rosso",
    });
  } catch (_) {}
};

module.exports = renderRouletteCanvas;