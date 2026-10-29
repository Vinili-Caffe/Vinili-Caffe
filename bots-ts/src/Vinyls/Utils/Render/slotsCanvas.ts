const canvasModule = require("canvas") as typeof import("canvas");
const GIFEncoder = require("gif-encoder-2");
const { registerCanvasFonts, drawTextWithSpecialFallback } = require("./canvasFonts") as typeof import("./canvasFonts");
const { formatGaleoni } = require("../../Services/Community/gringottService") as typeof import("../../Services/Community/gringottService");

const { createCanvas } = canvasModule;
const SYMBOLS = ["🍒", "🍋", "🔔", "⭐", "💎", "7️⃣"];
const SYMBOL_KEYS = {
  "🍒": "cherry",
  "🍋": "lemon",
  "🔔": "bell",
  "⭐": "star",
  "💎": "diamond",
  "7️⃣": "seven",
  "7": "seven",
};
const USE_PNG = String(process.env.VC_SLOTS_CANVAS_PNG ?? "0").trim() === "1";
let fontsReady = false;

function ensureFonts() {
  if (fontsReady) return;
  registerCanvasFonts(canvasModule);
  fontsReady = true;
}

function clampNumber(value?, fallback?, min?, max?) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function roundRect(ctx?, x?, y?, w?, h?, r?) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function fillRoundRect(ctx?, x?, y?, w?, h?, r?, fillStyle?) {
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = fillStyle;
  ctx.fill();
  ctx.restore();
}

function strokeRoundRect(ctx?, x?, y?, w?, h?, r?, strokeStyle?, lineWidth = 2) {
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
  ctx.restore();
}

function drawBg(ctx?, width?, height?, frameIndex?) {
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#180d18");
  bg.addColorStop(0.48, "#32161f");
  bg.addColorStop(1, "#09070d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = 0.22;
  for (let i = 0; i < 24; i += 1) {
    const x = (i * 83 + frameIndex * 7) % (width + 80) - 40;
    const y = 34 + ((i * 47) % (height - 80));
    ctx.fillStyle = i % 3 === 0 ? "#f7d56d" : "#ffffff";
    ctx.beginPath();
    ctx.arc(x, y, i % 3 === 0 ? 2.4 : 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  const glow = ctx.createRadialGradient(width / 2, height / 2, 60, width / 2, height / 2, width * 0.62);
  glow.addColorStop(0, "rgba(212,175,55,0.22)");
  glow.addColorStop(1, "rgba(212,175,55,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
}

function drawText(ctx?, text?, x?, y?, opts: Record<string, any> = {}) {
  drawTextWithSpecialFallback(ctx, text, x, y, {
    size: opts.size || 24,
    weight: opts.weight || "700",
    color: opts.color || "#ffffff",
    align: opts.align || "center",
    baseline: opts.baseline || "middle",
    forcePrimaryFont: opts.forcePrimaryFont === true,
  });
}

function symbolKey(symbol?) {
  return SYMBOL_KEYS[String(symbol || "").trim()] || "cherry";
}

function drawStarPath(ctx?, cx?, cy?, outer?, inner?) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const r = i % 2 === 0 ? outer : inner;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function strokeFill(ctx?, fill?, stroke = "#35151a", lineWidth = 5) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
}

function drawSlotSymbol(ctx?, symbol?, cx?, cy?, size?) {
  const key = symbolKey(symbol);
  const s = Math.max(24, Number(size) || 64);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.shadowColor = "rgba(0,0,0,0.22)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;

  if (key === "cherry") {
    ctx.strokeStyle = "#315c22";
    ctx.lineWidth = s * 0.08;
    ctx.beginPath();
    ctx.moveTo(-s * 0.12, -s * 0.16);
    ctx.quadraticCurveTo(0, -s * 0.5, s * 0.2, -s * 0.58);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s * 0.12, -s * 0.16);
    ctx.quadraticCurveTo(s * 0.18, -s * 0.48, s * 0.2, -s * 0.58);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(-s * 0.2, s * 0.08, s * 0.23, s * 0.25, -0.45, 0, Math.PI * 2);
    strokeFill(ctx, "#dc2626", "#6f1111", s * 0.055);
    ctx.beginPath();
    ctx.ellipse(s * 0.2, s * 0.1, s * 0.23, s * 0.25, 0.45, 0, Math.PI * 2);
    strokeFill(ctx, "#ef4444", "#6f1111", s * 0.055);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.beginPath();
    ctx.arc(-s * 0.28, -s * 0.01, s * 0.055, 0, Math.PI * 2);
    ctx.fill();
  } else if (key === "lemon") {
    ctx.rotate(-0.25);
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.42, s * 0.25, 0, 0, Math.PI * 2);
    strokeFill(ctx, "#facc15", "#7c4a03", s * 0.06);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.beginPath();
    ctx.ellipse(-s * 0.12, -s * 0.08, s * 0.12, s * 0.045, -0.15, 0, Math.PI * 2);
    ctx.fill();
  } else if (key === "bell") {
    ctx.beginPath();
    ctx.moveTo(-s * 0.34, s * 0.22);
    ctx.quadraticCurveTo(-s * 0.26, -s * 0.34, 0, -s * 0.36);
    ctx.quadraticCurveTo(s * 0.26, -s * 0.34, s * 0.34, s * 0.22);
    ctx.lineTo(-s * 0.34, s * 0.22);
    strokeFill(ctx, "#f59e0b", "#69420c", s * 0.055);
    fillRoundRect(ctx, -s * 0.4, s * 0.18, s * 0.8, s * 0.15, s * 0.07, "#d97706");
    ctx.beginPath();
    ctx.arc(0, s * 0.38, s * 0.09, 0, Math.PI * 2);
    strokeFill(ctx, "#fbbf24", "#69420c", s * 0.04);
  } else if (key === "star") {
    drawStarPath(ctx, 0, 0, s * 0.43, s * 0.19);
    strokeFill(ctx, "#facc15", "#7c4a03", s * 0.055);
  } else if (key === "diamond") {
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.46);
    ctx.lineTo(s * 0.4, -s * 0.08);
    ctx.lineTo(0, s * 0.48);
    ctx.lineTo(-s * 0.4, -s * 0.08);
    ctx.closePath();
    strokeFill(ctx, "#38bdf8", "#075985", s * 0.055);
    ctx.strokeStyle = "rgba(255,255,255,0.72)";
    ctx.lineWidth = s * 0.035;
    ctx.beginPath();
    ctx.moveTo(-s * 0.18, -s * 0.08);
    ctx.lineTo(0, s * 0.36);
    ctx.lineTo(s * 0.18, -s * 0.08);
    ctx.stroke();
  } else {
    ctx.font = `900 ${Math.floor(s * 0.86)}px "Noto Sans", "Arial", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = s * 0.05;
    ctx.strokeStyle = "#7f1d1d";
    ctx.strokeText("7", 0, s * 0.04);
    ctx.fillStyle = "#ef4444";
    ctx.fillText("7", 0, s * 0.04);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillRect(-s * 0.13, -s * 0.21, s * 0.26, s * 0.045);
  }
  ctx.restore();
}

function reelSettleFrame(reelIndex?, totalFrames?) {
  return totalFrames - 22 + reelIndex * 6;
}

function reelSymbolForFrame(reelIndex?, finalSymbol?, frameIndex?, totalFrames?, animating?) {
  if (!animating) return finalSymbol;
  const settle = reelSettleFrame(reelIndex, totalFrames);
  if (frameIndex >= settle) return finalSymbol;
  const spinOffset = Math.floor(frameIndex * (0.85 + reelIndex * 0.28)) + reelIndex * 2;
  return SYMBOLS[(spinOffset + frameIndex + reelIndex) % SYMBOLS.length];
}

function leverPullAmount(frameIndex?, animating?) {
  if (!animating) return 0;
  const pullEnd = 7;
  const releaseEnd = 11;
  if (frameIndex <= pullEnd) return frameIndex / pullEnd;
  if (frameIndex <= releaseEnd) return 1 - (frameIndex - pullEnd) / (releaseEnd - pullEnd);
  return 0;
}

function drawLever(ctx?, width?, machineTop?, frameIndex?, animating?) {
  const leverX = width - 108;
  const leverTop = machineTop + 48;
  const pull = leverPullAmount(frameIndex, animating);
  const knobX = leverX + 34;
  const knobY = leverTop + 108 + pull * 30;
  ctx.save();
  ctx.strokeStyle = "#d6aa42";
  ctx.lineWidth = 12;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(leverX, leverTop);
  ctx.lineTo(knobX, knobY);
  ctx.stroke();
  ctx.fillStyle = "#ef4444";
  ctx.beginPath();
  ctx.arc(knobX, knobY, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(knobX - 6, knobY - 6, 7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawReel(ctx?, x?, y?, w?, h?, symbol?, spinning?, frameIndex?) {
  fillRoundRect(ctx, x, y, w, h, 24, "#f8ead0");
  strokeRoundRect(ctx, x, y, w, h, 24, spinning ? "#f5c84b" : "#fff2a8", spinning ? 5 : 7);
  ctx.save();
  roundRect(ctx, x + 8, y + 8, w - 16, h - 16, 18);
  ctx.clip();
  const inner = ctx.createLinearGradient(0, y, 0, y + h);
  inner.addColorStop(0, "#fff8e8");
  inner.addColorStop(0.5, "#ffffff");
  inner.addColorStop(1, "#e8d6b7");
  ctx.fillStyle = inner;
  ctx.fillRect(x + 8, y + 8, w - 16, h - 16);
  if (spinning) {
    ctx.globalAlpha = 0.45;
    const yOff = (frameIndex * 10) % 54;
    for (let i = -1; i < 4; i += 1) {
      drawSlotSymbol(ctx, SYMBOLS[(frameIndex + i) % SYMBOLS.length], x + w / 2, y + 18 + i * 54 + yOff, 34);
    }
    ctx.globalAlpha = 1;
  }
  drawSlotSymbol(ctx, symbol, x + w / 2, y + h / 2 + 3, 78);
  ctx.restore();
}

function drawMachine(ctx?, params?) {
  const width = params.width;
  const height = params.height;
  const frameIndex = params.frameIndex;
  const totalFrames = params.totalFrames;
  const reels = params.reels;
  const animating = Boolean(params.animating);
  const hasResult = Boolean(params.hasResult);
  drawBg(ctx, width, height, animating ? frameIndex : 0);

  const machineX = 72;
  const machineTop = 78;
  const machineW = width - 144;
  const machineH = 294;
  const betY = 54;
  const betSize = 34;

  drawText(ctx, `Puntata: ${formatGaleoni(params.bet)}`, width / 2, betY, {
    size: betSize,
    color: "#f3e2bc",
    weight: "800",
    forcePrimaryFont: true,
  });

  fillRoundRect(ctx, machineX, machineTop, machineW, machineH, 38, "rgba(8,7,12,0.82)");
  strokeRoundRect(ctx, machineX, machineTop, machineW, machineH, 38, "#b9822d", 5);
  fillRoundRect(ctx, machineX + 32, machineTop + 30, machineW - 64, 188, 26, "rgba(212,175,55,0.16)");

  const reelW = 132;
  const gap = 26;
  const startX = (width - reelW * 3 - gap * 2) / 2;
  const reelY = machineTop + 56;
  const reelsSpinning = animating && frameIndex > 11;
  for (let i = 0; i < 3; i += 1) {
    const settle = reelSettleFrame(i, totalFrames);
    const spinning = animating && reelsSpinning && frameIndex < settle;
    const sym = reelSymbolForFrame(i, reels[i], frameIndex, totalFrames, animating);
    drawReel(ctx, startX + i * (reelW + gap), reelY, reelW, 128, sym, spinning, frameIndex);
  }

  const finalPhase = !animating || frameIndex >= totalFrames - 5;
  let footerText = "Premi Gira per iniziare";
  let footerColor = "#f8d875";
  if (animating && !finalPhase) {
    footerText = frameIndex <= 11 ? "Tira la manopola..." : "I rulli stanno girando...";
    footerColor = "#f8d875";
  } else if (hasResult) {
    footerText = params.win ? `Vincita ${params.payout} Galeoni` : "Nessuna vincita";
    footerColor = params.win ? "#71f3a1" : "#f87171";
  }
  const footerY = machineTop + machineH - 60;
  fillRoundRect(ctx, 136, footerY, width - 272, 42, 18, "rgba(0,0,0,0.36)");
  drawText(ctx, footerText, width / 2, footerY + 22, {
    size: 24,
    color: footerColor,
    forcePrimaryFont: true,
  });

  drawLever(ctx, width, machineTop, frameIndex, animating);
}

function normalizeParams(params: Record<string, any> = {}) {
  const reels = Array.isArray(params.reels) ? params.reels.slice(0, 3).map((x?) => String(x || "🍒")) : ["🍒", "🍒", "🍒"];
  while (reels.length < 3) reels.push("🍒");
  return {
    reels,
    bet: Math.max(0, Math.floor(Number(params.bet) || 0)),
    payout: Math.max(0, Math.floor(Number(params.payout) || 0)),
    win: Boolean(params.win),
    hasResult: Boolean(params.hasResult),
    animating: Boolean(params.animating),
  };
}

function spinFrameTiming() {
  const totalFrames = Math.max(12, Math.min(48, Math.floor(Number(process.env.VC_SLOTS_GIF_FRAMES ?? 14))));
  const delay = Math.max(60, Math.min(150, Math.floor(Number(process.env.VC_SLOTS_GIF_DELAY_MS ?? 80))));
  return { totalFrames, delay, durationMs: totalFrames * delay + 120 };
}

function renderIdlePng(params?) {
  const width = 760;
  const height = 450;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const timing = spinFrameTiming();
  drawMachine(ctx, {
    ...normalizeParams({ ...params, animating: false }),
    width,
    height,
    frameIndex: timing.totalFrames - 1,
    totalFrames: timing.totalFrames,
    animating: false,
  });
  return canvas.toBuffer("image/png");
}

async function renderSpinGif(params?) {
  const width = 760;
  const height = 450;
  const { totalFrames, delay } = spinFrameTiming();
  const normalized = normalizeParams({ ...params, animating: true });
  const encoder = new GIFEncoder(width, height);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  encoder.start();
  encoder.setRepeat(0);
  encoder.setDelay(delay);
  encoder.setQuality(10);
  for (let i = 0; i < totalFrames; i += 1) {
    ctx.clearRect(0, 0, width, height);
    drawMachine(ctx, { ...normalized, width, height, frameIndex: i, totalFrames, animating: true });
    encoder.addFrame(ctx);
  }
  encoder.finish();
  const out = encoder.out.getData();
  if (!out || !out.length) throw new Error("empty gif");
  return Buffer.from(out);
}

async function renderSlotsCanvas(params: Record<string, any> = {}) {
  if (!canvasModule) throw new Error("Canvas module not available");
  ensureFonts();
  const animating = Boolean(params.animating);
  try {
    if (animating && !USE_PNG) {
      return { buffer: await renderSpinGif(params), format: "gif" };
    }
    return { buffer: renderIdlePng(params), format: "png" };
  } catch (err) {
    global.logger?.warn?.("[SLOTS CANVAS] render failed:", err?.message || err);
    return { buffer: renderIdlePng(params), format: "png" };
  }
}

renderSlotsCanvas.spinAnimationDurationMs = function spinAnimationDurationMs() {
  return spinFrameTiming().durationMs;
};

renderSlotsCanvas.warmup = function warmup() {
  if (!canvasModule) return;
  ensureFonts();
  try {
    renderIdlePng({ reels: ["🍒", "🍋", "🔔"], bet: 0, hasResult: false });
  } catch (_) {}
};

export = renderSlotsCanvas;