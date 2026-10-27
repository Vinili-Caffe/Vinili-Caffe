const canvasModule = require("canvas");
const GIFEncoder = require("gif-encoder-2");
const { formatGaleoni } = require("../../Services/Community/gringottService");
const { registerCanvasFonts, drawTextWithSpecialFallback } = require("./canvasFonts");
const { sanitizeCanvasDisplayName, normalizeTextForCanvas } = require("./canvasUtils");
const { createCanvas } = canvasModule;
const CHOICES = ["sasso", "carta", "forbici"];
const CHOICE_LABEL = { sasso: "Sasso", carta: "Carta", forbici: "Forbici" };
const USE_PNG = String(process.env.VC_RPS_CANVAS_PNG ?? "0").trim() === "1";
const COUNTDOWN_END_FRAME = 12;
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
    size: opts.size || 24,
    weight: opts.weight || "700",
    color: opts.color || "#ffffff",
    align: opts.align || "center",
    baseline: opts.baseline || "middle",
    forcePrimaryFont: opts.forcePrimaryFont === true,
  });
}

function strokeFill(ctx, fill, stroke = "#4a2c1a", lineWidth = 4) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
}

function drawBg(ctx, width, height, frameIndex) {
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#140a14");
  bg.addColorStop(0.42, "#2a1420");
  bg.addColorStop(1, "#08060c");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  const glow = ctx.createRadialGradient(width / 2, height * 0.42, 40, width / 2, height * 0.42, width * 0.55);
  glow.addColorStop(0, "rgba(212,175,55,0.12)");
  glow.addColorStop(1, "rgba(212,175,55,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.globalAlpha = 0.2;
  for (let i = 0; i < 18; i += 1) {
    const x = (i * 91 + frameIndex * 4) % (width + 50) - 25;
    const y = 24 + ((i * 61) % (height - 90));
    ctx.fillStyle = i % 2 === 0 ? "#f7d56d" : "#c4b5fd";
    ctx.beginPath();
    ctx.arc(x, y, i % 2 === 0 ? 2 : 1.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function normalizeChoice(value) {
  const v = String(value || "").trim().toLowerCase();
  if (["rock", "sasso"].includes(v)) return "sasso";
  if (["paper", "carta"].includes(v)) return "carta";
  if (["scissors", "forbici", "forbice"].includes(v)) return "forbici";
  return CHOICES.includes(v) ? v : "";
}

function drawMoveRock(ctx, s) {
  ctx.beginPath();
  ctx.ellipse(0, s * 0.1, s * 0.36, s * 0.3, 0, 0, Math.PI * 2);
  strokeFill(ctx, "#f0b48a", "#5c3820", s * 0.045);
  for (let i = 0; i < 4; i += 1) {
    const ox = -s * 0.225 + i * s * 0.15;
    ctx.beginPath();
    ctx.ellipse(ox, -s * 0.2, s * 0.085, s * 0.12, 0, 0, Math.PI * 2);
    strokeFill(ctx, "#f8c8a4", "#5c3820", s * 0.035);
  }
  ctx.beginPath();
  ctx.ellipse(s * 0.3, s * 0.06, s * 0.1, s * 0.16, 0.35, 0, Math.PI * 2);
  strokeFill(ctx, "#e8a878", "#5c3820", s * 0.035);
}

function drawMovePaper(ctx, s) {
  ctx.beginPath();
  ctx.ellipse(0, s * 0.18, s * 0.28, s * 0.22, 0, 0, Math.PI * 2);
  strokeFill(ctx, "#f0b48a", "#5c3820", s * 0.04);
  for (let i = 0; i < 4; i += 1) {
    const ox = -s * 0.27 + i * s * 0.18;
    fillRoundRect(ctx, ox - s * 0.07, -s * 0.38, s * 0.14, s * 0.42, s * 0.07, "#f8c8a4");
    strokeRoundRect(ctx, ox - s * 0.07, -s * 0.38, s * 0.14, s * 0.42, s * 0.07, "#5c3820", s * 0.035);
  }
  ctx.beginPath();
  ctx.ellipse(-s * 0.38, s * 0.12, s * 0.12, s * 0.18, -0.5, 0, Math.PI * 2);
  strokeFill(ctx, "#e8a878", "#5c3820", s * 0.035);
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.fillRect(-s * 0.12, -s * 0.28, s * 0.06, s * 0.22);
}

function drawMoveScissors(ctx, s) {
  ctx.beginPath();
  ctx.ellipse(0, s * 0.22, s * 0.2, s * 0.16, 0, 0, Math.PI * 2);
  strokeFill(ctx, "#f0b48a", "#5c3820", s * 0.04);
  ctx.beginPath();
  ctx.ellipse(-s * 0.1, -s * 0.12, s * 0.09, s * 0.28, -0.15, 0, Math.PI * 2);
  strokeFill(ctx, "#f8c8a4", "#5c3820", s * 0.035);
  ctx.beginPath();
  ctx.ellipse(s * 0.1, -s * 0.12, s * 0.09, s * 0.28, 0.15, 0, Math.PI * 2);
  strokeFill(ctx, "#f8c8a4", "#5c3820", s * 0.035);
  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = s * 0.055;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-s * 0.08, -s * 0.32);
  ctx.lineTo(-s * 0.22, -s * 0.58);
  ctx.moveTo(s * 0.08, -s * 0.32);
  ctx.lineTo(s * 0.22, -s * 0.58);
  ctx.stroke();
  ctx.fillStyle = "#e2e8f0";
  ctx.beginPath();
  ctx.arc(-s * 0.24, -s * 0.6, s * 0.065, 0, Math.PI * 2);
  ctx.arc(s * 0.24, -s * 0.6, s * 0.065, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#64748b";
  ctx.lineWidth = s * 0.03;
  ctx.stroke();
}

function drawMoveSymbol(ctx, cx, cy, choice, mirror, scale = 1) {
  const s = 72 * scale;
  const kind = normalizeChoice(choice) || "sasso";
  ctx.save();
  ctx.translate(cx, cy);
  if (mirror) ctx.scale(-1, 1);
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 8;
  if (kind === "carta") drawMovePaper(ctx, s);
  else if (kind === "forbici") drawMoveScissors(ctx, s);
  else drawMoveRock(ctx, s);
  ctx.restore();
}

function drawStageRing(ctx, cx, cy, fillAccent, strokeAccent, pending) {
  const r = 88;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  const ring = ctx.createRadialGradient(cx, cy, r * 0.55, cx, cy, r);
  ring.addColorStop(0, pending ? "rgba(255,255,255,0.06)" : fillAccent);
  ring.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = ring;
  ctx.fill();
  ctx.strokeStyle = pending ? "rgba(255,255,255,0.12)" : strokeAccent;
  ctx.lineWidth = pending ? 2 : 3;
  ctx.setLineDash(pending ? [8, 8] : []);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawHand(ctx, cx, cy, choice, mirror, bounce, pending) {
  const y = cy + bounce;
  const fillAccent = mirror ? "rgba(251,113,133,0.2)" : "rgba(96,165,250,0.2)";
  const strokeAccent = mirror ? "rgba(251,113,133,0.55)" : "rgba(96,165,250,0.55)";
  drawStageRing(ctx, cx, y, fillAccent, strokeAccent, pending);
  if (pending) {
    drawMoveSymbol(ctx, cx, y, "sasso", mirror, 0.88);
    fillRoundRect(ctx, cx - 48, y + 54, 96, 26, 13, "rgba(0,0,0,0.45)");
    drawText(ctx, "Pronto", cx, y + 67, { size: 16, color: "#94a3b8", weight: "700", forcePrimaryFont: true });
    return;
  }
  drawMoveSymbol(ctx, cx, y, choice, mirror, 1);
  const label = CHOICE_LABEL[normalizeChoice(choice)] || "";
  fillRoundRect(ctx, cx - 56, y + 52, 112, 30, 15, "rgba(0,0,0,0.5)");
  strokeRoundRect(ctx, cx - 56, y + 52, 112, 30, 15, mirror ? "rgba(251,113,133,0.5)" : "rgba(96,165,250,0.5)", 2);
  drawText(ctx, label, cx, y + 67, { size: 17, color: "#fafafa", weight: "800", forcePrimaryFont: true });
}

function truncateName(name, max = 12) {
  return sanitizeCanvasDisplayName(name, max, "Giocatore");
}

function cycleChoice(frameIndex, offset = 0) {
  return CHOICES[(Math.floor(frameIndex / 3) + offset) % CHOICES.length];
}

function playerRevealFrame(totalFrames) {
  return Math.max(COUNTDOWN_END_FRAME + 4, totalFrames - 14);
}

function botRevealFrame(totalFrames) {
  return Math.max(COUNTDOWN_END_FRAME + 6, totalFrames - 6);
}

function choiceForSide(params, side, frameIndex, totalFrames) {
  const animating = Boolean(params.animating);
  const hasResult = Boolean(params.hasResult);
  const player = normalizeChoice(params.playerChoice);
  const bot = normalizeChoice(params.botChoice);
  if (!animating) {
    if (!hasResult) return "sasso";
    return side === "player" ? player : bot;
  }
  if (frameIndex < COUNTDOWN_END_FRAME) return "sasso";
  const reveal = side === "player" ? playerRevealFrame(totalFrames) : botRevealFrame(totalFrames);
  if (frameIndex >= reveal && hasResult) return side === "player" ? player : bot;
  return cycleChoice(frameIndex, side === "player" ? 0 : 1);
}

function countdownText(frameIndex) {
  if (frameIndex <= 2) return "3";
  if (frameIndex <= 5) return "2";
  if (frameIndex <= 8) return "1";
  if (frameIndex <= 12) return "VIA!";
  return "";
}

function bounceOffset(frameIndex, animating) {
  if (!animating) return 0;
  if (frameIndex < COUNTDOWN_END_FRAME) return Math.sin(frameIndex * 0.85) * 10;
  return Math.sin(frameIndex * 1.2) * 6;
}

function drawPlayerPod(ctx, x, y, w, h, name, borderColor) {
  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, "rgba(18,12,24,0.92)");
  grad.addColorStop(1, "rgba(8,6,12,0.95)");
  fillRoundRect(ctx, x, y, w, h, 26, grad);
  strokeRoundRect(ctx, x, y, w, h, 26, borderColor, 3);
  fillRoundRect(ctx, x + 14, y + 50, w - 28, h - 64, 20, "rgba(255,255,255,0.03)");
  fillRoundRect(ctx, x + 16, y + 14, w - 32, 34, 14, "rgba(0,0,0,0.35)");
  drawText(ctx, truncateName(name), x + w / 2, y + 31, { size: 20, color: "#f8fafc", weight: "800" });
}

function drawArena(ctx, params) {
  const width = params.width;
  const height = params.height;
  const frameIndex = params.frameIndex;
  const totalFrames = params.totalFrames;
  const animating = Boolean(params.animating);
  const hasResult = Boolean(params.hasResult);
  drawBg(ctx, width, height, frameIndex);

  drawText(ctx, "SASSO · CARTA · FORBICI", width / 2, 36, { size: 26, color: "#f8d875", weight: "900", forcePrimaryFont: true });

  const podW = 268;
  const podH = 292;
  const podY = 72;
  const leftX = 44;
  const rightX = width - podW - 44;
  drawPlayerPod(ctx, leftX, podY, podW, podH, params.playerName, "#60a5fa");
  drawPlayerPod(ctx, rightX, podY, podW, podH, params.opponentName, "#fb7185");

  const vsY = podY + podH / 2 - 6;
  fillRoundRect(ctx, width / 2 - 38, vsY - 38, 76, 76, 38, "rgba(212,175,55,0.18)");
  strokeRoundRect(ctx, width / 2 - 38, vsY - 38, 76, 76, 38, "#d4af37", 3);
  drawText(ctx, "VS", width / 2, vsY + 2, { size: 28, color: "#f8d875", weight: "900", forcePrimaryFont: true });

  const bounce = bounceOffset(frameIndex, animating);
  const playerChoice = choiceForSide(params, "player", frameIndex, totalFrames);
  const botChoice = choiceForSide(params, "bot", frameIndex, totalFrames);
  const gestureY = podY + 158;
  const waitingChoice = !hasResult && !animating;
  drawHand(ctx, leftX + podW / 2, gestureY, playerChoice, false, bounce, waitingChoice);
  drawHand(ctx, rightX + podW / 2, gestureY, botChoice, true, -bounce * 0.85, waitingChoice);

  const countdown = animating ? countdownText(frameIndex) : "";
  if (countdown) {
    fillRoundRect(ctx, width / 2 - 64, podY + 52, 128, 48, 22, "rgba(0,0,0,0.55)");
    strokeRoundRect(ctx, width / 2 - 64, podY + 52, 128, 48, 22, "rgba(248,216,117,0.4)", 2);
    drawText(ctx, countdown, width / 2, podY + 76, { size: countdown === "VIA!" ? 24 : 32, color: "#fef08a", weight: "900", forcePrimaryFont: true });
  }

  let footer = "Scegli sasso, carta o forbici con i pulsanti";
  let footerColor = "#e2e8f0";
  if (params.statusLine) {
    footer = params.statusLine;
    footerColor = "#f8d875";
  } else if (params.phase === "pending") {
    footer = params.bet > 0
      ? `Sfida PvP · ${formatGaleoni(params.bet)} ciascuno · Accetta o rifiuta`
      : "Accetta o rifiuta la sfida";
    footerColor = "#f8d875";
  } else if (animating && frameIndex >= COUNTDOWN_END_FRAME && !hasResult) {
    footer = "Le mosse si rivelano...";
    footerColor = "#f8d875";
  } else if (hasResult) {
    const pLabel = CHOICE_LABEL[normalizeChoice(params.playerChoice)] || "";
    const bLabel = CHOICE_LABEL[normalizeChoice(params.botChoice)] || "";
    if (params.isPvp) {
      if (params.draw) {
        footer = `Pareggio — ${pLabel} vs ${bLabel}`;
        footerColor = "#f8d875";
      } else {
        footer = `${params.winnerName || "Vincitore"} vince ${formatGaleoni(params.bet * 2)}`;
        footerColor = "#4ade80";
      }
    } else if (params.draw) {
      footer = `Pareggio — ${pLabel} vs ${bLabel}`;
      footerColor = "#f8d875";
    } else if (params.win) {
      footer = `Vittoria — ${pLabel} batte ${bLabel}`;
      footerColor = "#4ade80";
    } else {
      footer = `Sconfitta — ${bLabel} batte ${pLabel}`;
      footerColor = "#f87171";
    }
  }
  const footerY = height - 48;
  fillRoundRect(ctx, 48, footerY, width - 96, 36, 16, "rgba(0,0,0,0.45)");
  drawText(ctx, normalizeTextForCanvas(footer), width / 2, footerY + 18, { size: 18, color: footerColor, forcePrimaryFont: true });
}

function normalizeParams(params = {}) {
  return {
    bet: Math.max(0, Math.floor(Number(params.bet) || 0)),
    phase: String(params.phase || ""),
    playerName: sanitizeCanvasDisplayName(params.playerName || "Tu", 0, "Tu"),
    opponentName: sanitizeCanvasDisplayName(params.opponentName || "Rivale", 0, "Rivale"),
    playerChoice: normalizeChoice(params.playerChoice),
    botChoice: normalizeChoice(params.botChoice),
    win: Boolean(params.win),
    draw: Boolean(params.draw),
    hasResult: Boolean(params.hasResult),
    animating: Boolean(params.animating),
    isPvp: Boolean(params.isPvp),
    winnerName: sanitizeCanvasDisplayName(params.winnerName || "", 0, ""),
    statusLine: normalizeTextForCanvas(String(params.statusLine || "").trim()),
  };
}

function spinFrameTiming() {
  const totalFrames = Math.max(14, Math.min(44, Math.floor(Number(process.env.VC_RPS_GIF_FRAMES ?? 16))));
  const delay = Math.max(80, Math.min(180, Math.floor(Number(process.env.VC_RPS_GIF_DELAY_MS ?? 110))));
  const gifFrames = totalFrames + HOLD_RESULT_FRAMES;
  return { totalFrames, delay, gifFrames, durationMs: gifFrames * delay + 80 };
}

function renderIdlePng(params) {
  const width = 760;
  const height = 480;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const timing = spinFrameTiming();
  drawArena(ctx, {
    ...normalizeParams({ ...params, animating: false }),
    width,
    height,
    frameIndex: timing.totalFrames - 1,
    totalFrames: timing.totalFrames,
    animating: false,
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
  encoder.setQuality(12);
  for (let i = 0; i < gifFrames; i += 1) {
    const frameIndex = Math.min(i, totalFrames - 1);
    ctx.clearRect(0, 0, width, height);
    drawArena(ctx, { ...normalized, width, height, frameIndex, totalFrames, animating: true });
    encoder.addFrame(ctx);
  }
  encoder.finish();
  const out = encoder.out.getData();
  if (!out || !out.length) throw new Error("empty gif");
  return Buffer.from(out);
}

async function renderRpsCanvas(params = {}) {
  if (!canvasModule) throw new Error("Canvas module not available");
  ensureFonts();
  const animating = Boolean(params.animating);
  try {
    if (animating && !USE_PNG) {
      return { buffer: await renderSpinGif(params), format: "gif" };
    }
    return { buffer: renderIdlePng(params), format: "png" };
  } catch (err) {
    global.logger?.warn?.("[RPS CANVAS] render failed:", err?.message || err);
    return { buffer: renderIdlePng(params), format: "png" };
  }
}

renderRpsCanvas.spinAnimationDurationMs = function spinAnimationDurationMs() {
  return spinFrameTiming().durationMs;
};

renderRpsCanvas.warmup = function warmup() {
  if (!canvasModule) return;
  ensureFonts();
  try {
    renderIdlePng({ bet: 5, hasResult: false });
  } catch (_) {}
};

module.exports = renderRpsCanvas;