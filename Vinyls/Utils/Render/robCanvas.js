const canvasModule = require("canvas");
const GIFEncoder = require("gif-encoder-2");
const { formatGaleoni } = require("../../Services/Community/gringottService");
const { registerCanvasFonts, drawTextWithSpecialFallback } = require("./canvasFonts");
const { createCanvas } = canvasModule;
const USE_PNG = String(process.env.VC_ROB_CANVAS_PNG ?? "0").trim() === "1";
const HOLD_FRAMES = 8;
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

function truncateName(name, max = 16) {
  const s = String(name || "Bersaglio").trim() || "Bersaglio";
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function drawBg(ctx, width, height) {
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#120a06");
  bg.addColorStop(0.35, "#2a1a0e");
  bg.addColorStop(0.7, "#1a1008");
  bg.addColorStop(1, "#080504");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  const torchL = ctx.createRadialGradient(90, 140, 8, 90, 140, 160);
  torchL.addColorStop(0, "rgba(255,180,80,0.22)");
  torchL.addColorStop(1, "rgba(255,120,40,0)");
  ctx.fillStyle = torchL;
  ctx.fillRect(0, 0, width * 0.45, height);
  const torchR = ctx.createRadialGradient(width - 90, 140, 8, width - 90, 140, 160);
  torchR.addColorStop(0, "rgba(255,180,80,0.22)");
  torchR.addColorStop(1, "rgba(255,120,40,0)");
  ctx.fillStyle = torchR;
  ctx.fillRect(width * 0.55, 0, width * 0.45, height);
  fillRoundRect(ctx, 32, 44, width - 64, height - 68, 22, "rgba(0,0,0,0.25)");
  strokeRoundRect(ctx, 32, 44, width - 64, height - 68, 22, "rgba(212,175,55,0.45)", 2);
  const foil = ctx.createLinearGradient(40, 48, width - 40, 78);
  foil.addColorStop(0, "rgba(184,134,11,0.65)");
  foil.addColorStop(0.5, "rgba(255,220,140,0.35)");
  foil.addColorStop(1, "rgba(139,105,20,0.65)");
  fillRoundRect(ctx, 48, 50, width - 96, 32, 10, foil);
  strokeRoundRect(ctx, 48, 50, width - 96, 32, 10, "rgba(45,34,8,0.5)", 1);
  const floor = ctx.createLinearGradient(0, height - 120, 0, height);
  floor.addColorStop(0, "rgba(60,45,30,0)");
  floor.addColorStop(0.4, "rgba(90,70,45,0.35)");
  floor.addColorStop(1, "rgba(40,30,20,0.55)");
  ctx.fillStyle = floor;
  ctx.fillRect(48, height - 130, width - 96, 90);
  for (let i = 0; i < 9; i += 1) {
    const mx = 70 + i * ((width - 140) / 8);
    ctx.strokeStyle = "rgba(212,175,55,0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(mx, height - 118);
    ctx.lineTo(mx + 18, height - 72);
    ctx.stroke();
  }
}

function drawPillar(ctx, x, top, h) {
  const w = 28;
  const grad = ctx.createLinearGradient(x, top, x + w, top);
  grad.addColorStop(0, "#3d2e1a");
  grad.addColorStop(0.5, "#5c4528");
  grad.addColorStop(1, "#2a1f12");
  fillRoundRect(ctx, x, top, w, h, 6, grad);
  fillRoundRect(ctx, x - 4, top - 10, w + 8, 14, 4, "#b8860b");
  strokeRoundRect(ctx, x - 4, top - 10, w + 8, 14, 4, "#5c4510", 1);
}

function drawGaleone(ctx, cx, cy, r) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  ctx.ellipse(0, r * 0.85, r * 0.62, r * 0.08, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fill();
  const edge = ctx.createLinearGradient(-r, -r, r, r);
  edge.addColorStop(0, "#e8c84a");
  edge.addColorStop(0.5, "#b8860b");
  edge.addColorStop(1, "#6b5210");
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = edge;
  ctx.fill();
  ctx.lineWidth = Math.max(2, r * 0.06);
  ctx.strokeStyle = "#3d2e08";
  ctx.stroke();
  const face = ctx.createRadialGradient(-r * 0.2, -r * 0.25, r * 0.05, 0, 0, r * 0.72);
  face.addColorStop(0, "#fff4c8");
  face.addColorStop(0.6, "#d4af37");
  face.addColorStop(1, "#8b6914");
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.76, 0, Math.PI * 2);
  ctx.fillStyle = face;
  ctx.fill();
  drawPlainText(ctx, "G", 0, 1, { size: Math.floor(r * 0.72), color: "#4a3810", weight: "900" });
  ctx.restore();
}

function drawCoinScatter(ctx, width, height, phase, frameIndex) {
  const spots = [
    [95, height - 88, 16], [130, height - 72, 12], [width - 95, height - 88, 16], [width - 128, height - 74, 13],
  ];
  for (const [x, y, r] of spots) drawGaleone(ctx, x, y, r);
  if (phase === "success") {
    const burst = 6;
    for (let i = 0; i < burst; i += 1) {
      const t = (frameIndex % 20) / 20;
      const ang = (i / burst) * Math.PI * 2 + t * 0.4;
      const dist = 55 + t * 35;
      const cx = width / 2 + Math.cos(ang) * dist;
      const cy = height * 0.48 + Math.sin(ang) * dist * 0.6 - t * 20;
      drawGaleone(ctx, cx, cy, 10 + (i % 3) * 3);
    }
  }
}

function drawTargetBadge(ctx, x, y, name) {
  const label = truncateName(name, 14);
  fillRoundRect(ctx, x, y, 200, 52, 12, "rgba(15,10,6,0.72)");
  strokeRoundRect(ctx, x, y, 200, 52, 12, "rgba(212,175,55,0.55)", 2);
  ctx.save();
  ctx.translate(x + 28, y + 26);
  ctx.fillStyle = "#94a3b8";
  ctx.beginPath();
  ctx.arc(0, -6, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1e293b";
  ctx.beginPath();
  ctx.arc(0, 14, 16, Math.PI, 0);
  ctx.fill();
  ctx.restore();
  drawPlainText(ctx, "BERSAGLIO", x + 118, y + 16, { size: 10, color: "#a8a29e", weight: "800" });
  drawPlainText(ctx, label, x + 118, y + 34, { size: 14, color: "#fef3c7", weight: "800" });
}

function drawBankBadge(ctx, x, y) {
  fillRoundRect(ctx, x, y, 200, 52, 12, "rgba(15,10,6,0.72)");
  strokeRoundRect(ctx, x, y, 200, 52, 12, "rgba(212,175,55,0.65)", 2);
  drawGaleone(ctx, x + 28, y + 28, 18);
  drawGaleone(ctx, x + 48, y + 22, 11);
  drawGaleone(ctx, x + 48, y + 36, 10);
  drawPlainText(ctx, "CASSAFORTE", x + 118, y + 16, { size: 10, color: "#a8a29e", weight: "800" });
  drawPlainText(ctx, "Gringott", x + 118, y + 34, { size: 14, color: "#fef3c7", weight: "800" });
}

function drawBankVaultMeter(ctx, x, y, w) {
  fillRoundRect(ctx, x - w / 2, y, w, 52, 12, "rgba(15,10,6,0.72)");
  strokeRoundRect(ctx, x - w / 2, y, w, 52, 12, "rgba(212,175,55,0.55)", 2);
  drawPlainText(ctx, "RISERVA", x, y + 14, { size: 10, color: "#a8a29e", weight: "800" });
  drawPlainText(ctx, "∞ Galeoni", x, y + 34, { size: 16, color: "#f8d875", weight: "900" });
}

function drawChanceMeter(ctx, x, y, w, pct) {
  const p = Math.max(1, Math.min(99, Math.floor(Number(pct) || 35)));
  fillRoundRect(ctx, x - w / 2, y, w, 52, 12, "rgba(15,10,6,0.72)");
  strokeRoundRect(ctx, x - w / 2, y, w, 52, 12, "rgba(212,175,55,0.55)", 2);
  drawPlainText(ctx, "SUCCESSO", x, y + 14, { size: 10, color: "#a8a29e", weight: "800" });
  const barX = x - w / 2 + 14;
  const barW = w - 28;
  const barY = y + 30;
  fillRoundRect(ctx, barX, barY, barW, 10, 5, "rgba(30,20,12,0.9)");
  const fillW = Math.max(8, Math.round((barW * p) / 100));
  const barGrad = ctx.createLinearGradient(barX, barY, barX + fillW, barY);
  barGrad.addColorStop(0, "#65a30d");
  barGrad.addColorStop(1, "#f8d875");
  fillRoundRect(ctx, barX, barY, fillW, 10, 5, barGrad);
  drawPlainText(ctx, `${p}%`, x, y + 36, { size: 13, color: "#fef3c7", weight: "900" });
}

function drawVaultDoor(ctx, cx, cy, radius, opts) {
  const { progress, success, failed, animating, frameIndex } = opts;
  const openAmt = success ? 0.22 : animating ? progress * 0.06 : 0;
  ctx.save();
  ctx.translate(cx, cy);
  const outerR = radius + 18;
  const ringGrad = ctx.createRadialGradient(0, 0, radius * 0.5, 0, 0, outerR);
  ringGrad.addColorStop(0, "#5c4528");
  ringGrad.addColorStop(0.7, "#8b6914");
  ringGrad.addColorStop(1, "#3d2e08");
  ctx.beginPath();
  ctx.arc(0, 0, outerR, 0, Math.PI * 2);
  ctx.fillStyle = ringGrad;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = failed ? "#7f1d1d" : "#d4af37";
  ctx.stroke();
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    const rx = Math.cos(a) * (outerR - 8);
    const ry = Math.sin(a) * (outerR - 8);
    ctx.beginPath();
    ctx.arc(rx, ry, 5, 0, Math.PI * 2);
    ctx.fillStyle = failed ? "#450a0a" : "#c9a227";
    ctx.fill();
    ctx.strokeStyle = "#2d2208";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  const doorGrad = ctx.createRadialGradient(-radius * 0.2, -radius * 0.3, radius * 0.1, 0, 0, radius);
  if (failed) {
    doorGrad.addColorStop(0, "#5c2020");
    doorGrad.addColorStop(1, "#1a0808");
  } else if (success) {
    doorGrad.addColorStop(0, "#6b5210");
    doorGrad.addColorStop(1, "#2d2208");
  } else {
    doorGrad.addColorStop(0, "#4a3d2a");
    doorGrad.addColorStop(1, "#1f1810");
  }
  const drawHalf = (sign) => {
    ctx.save();
    ctx.rotate(sign * openAmt);
    ctx.beginPath();
    if (sign < 0) ctx.arc(0, 0, radius, Math.PI / 2, -Math.PI / 2, true);
    else ctx.arc(0, 0, radius, -Math.PI / 2, Math.PI / 2, true);
    ctx.closePath();
    ctx.fillStyle = doorGrad;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = failed ? "#991b1b" : "#8b6914";
    ctx.stroke();
    for (let g = -2; g <= 2; g += 1) {
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sign * g * (radius * 0.22), -radius * 0.85);
      ctx.lineTo(sign * g * (radius * 0.22), radius * 0.85);
      ctx.stroke();
    }
    ctx.restore();
  };
  drawHalf(-1);
  drawHalf(1);
  if (!success && !failed) {
    ctx.fillStyle = "#1a1208";
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 0.12, radius * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#d4af37";
    ctx.lineWidth = 2;
    ctx.stroke();
    drawPlainText(ctx, "G", 0, 0, { size: Math.floor(radius * 0.28), color: "#d4af37", weight: "900" });
  }
  if (success) {
    const glow = ctx.createRadialGradient(0, 0, 10, 0, 0, radius * 1.2);
    glow.addColorStop(0, "rgba(255,230,120,0.7)");
    glow.addColorStop(1, "rgba(255,200,80,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.15, 0, Math.PI * 2);
    ctx.fill();
  }
  if (failed) {
    ctx.strokeStyle = "#fca5a5";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-radius * 0.55, -radius * 0.55);
    ctx.lineTo(radius * 0.55, radius * 0.55);
    ctx.moveTo(radius * 0.55, -radius * 0.55);
    ctx.lineTo(-radius * 0.55, radius * 0.55);
    ctx.stroke();
    fillRoundRect(ctx, -52, -radius - 38, 104, 26, 8, "rgba(127,29,29,0.92)");
    drawPlainText(ctx, "ALLARME", 0, -radius - 25, { size: 14, color: "#fecaca", weight: "900" });
  }
  if (animating && progress > 0.1) {
    const sparkN = 5;
    for (let s = 0; s < sparkN; s += 1) {
      const sp = ((frameIndex + s * 3) % 12) / 12;
      const sx = -radius * 0.6 + sp * radius * 1.2;
      const sy = Math.sin(sp * Math.PI * 4 + progress * 6) * radius * 0.35;
      ctx.fillStyle = `rgba(255,220,120,${0.4 + progress * 0.5})`;
      ctx.beginPath();
      ctx.arc(sx, sy, 3 + progress * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawThief(ctx, x, y, progress, frameIndex) {
  const bob = Math.sin((frameIndex || 0) * 0.55) * 4;
  ctx.save();
  ctx.translate(x, y + bob);
  ctx.globalAlpha = 0.88;
  ctx.fillStyle = "#0f172a";
  ctx.beginPath();
  ctx.ellipse(0, -28, 22, 26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-18, -8);
  ctx.lineTo(18, -8);
  ctx.lineTo(14, 32);
  ctx.lineTo(-14, 32);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#1e293b";
  ctx.beginPath();
  ctx.ellipse(0, -32, 18, 8, 0, 0, Math.PI);
  ctx.fill();
  const eyeGlow = 0.35 + progress * 0.45;
  ctx.fillStyle = `rgba(248,216,117,${eyeGlow})`;
  ctx.beginPath();
  ctx.arc(-7, -30, 3, 0, Math.PI * 2);
  ctx.arc(7, -30, 3, 0, Math.PI * 2);
  ctx.fill();
  const sack = 12 + Math.floor(progress * 8);
  ctx.fillStyle = "#78350f";
  fillRoundRect(ctx, 16, 4, sack, sack + 6, 6, "#92400e");
  strokeRoundRect(ctx, 16, 4, sack, sack + 6, 6, "#d4af37", 1);
  if (progress > 0.5) drawGaleone(ctx, 16 + sack / 2, 10 + sack / 2, 7);
  ctx.restore();
}

function buildStatus(params) {
  if (params.animating) return { right: "Infiltrazione in corso…", color: "#f8d875" };
  if (params.phase === "done" && params.hasResult) {
    if (params.success) return { right: `Bottino ${formatGaleoni(params.amount)}`, color: "#4ade80" };
    return { right: `Multa ${formatGaleoni(params.penalty)}`, color: "#f87171" };
  }
  if (params.isBank) return { right: "Cassaforte · premi Colpo", color: "#f8d875" };
  return { right: "Premi Colpo per tentare", color: "#e2e8f0" };
}

function drawInfoRow(ctx, width, y, leftText, rightText, rightColor) {
  if (leftText) drawPlainText(ctx, leftText, 64, y, { size: 14, color: "#94a3b8", align: "left", weight: "700" });
  if (rightText) drawText(ctx, rightText, width - 64, y, { size: 15, color: rightColor || "#f1f5f9", align: "right", forcePrimaryFont: true });
}

function drawArena(ctx, params) {
  const width = params.width;
  const height = params.height;
  const progress = params.animating
    ? Math.max(0, Math.min(1, (params.frameIndex || 0) / Math.max(1, (params.totalFrames || 20) - 1)))
    : params.phase === "done" ? 1 : 0;
  const success = Boolean(params.success);
  const failed = params.phase === "done" && !success && params.hasResult;
  const animating = Boolean(params.animating);
  drawBg(ctx, width, height);
  drawText(ctx, "COLPO A GRINGOTT", width / 2, 66, { size: 22, color: "#3d2e08", weight: "900", forcePrimaryFont: true });
  drawPillar(ctx, 58, 100, height - 175);
  drawPillar(ctx, width - 86, 100, height - 175);
  if (params.isBank) {
    drawBankBadge(ctx, 72, 98);
    drawBankVaultMeter(ctx, width - 72, 98, 168);
  } else {
    drawTargetBadge(ctx, 72, 98, params.targetName);
    drawChanceMeter(ctx, width - 72, 98, 168, params.successChance);
  }
  const vaultCx = width / 2;
  const vaultCy = Math.round((100 + height - 52) / 2) + 8;
  const vaultR = 108;
  if (failed) {
    ctx.save();
    ctx.globalAlpha = 0.25 + Math.sin((params.frameIndex || 0) * 0.5) * 0.08;
    const alarm = ctx.createRadialGradient(vaultCx, vaultCy, 20, vaultCx, vaultCy, vaultR + 60);
    alarm.addColorStop(0, "rgba(239,68,68,0.45)");
    alarm.addColorStop(1, "rgba(127,29,29,0)");
    ctx.fillStyle = alarm;
    ctx.fillRect(vaultCx - vaultR - 80, vaultCy - vaultR - 80, (vaultR + 80) * 2, (vaultR + 80) * 2);
    ctx.restore();
  }
  drawVaultDoor(ctx, vaultCx, vaultCy, vaultR, {
    progress,
    success,
    failed,
    animating,
    frameIndex: params.frameIndex || 0,
  });
  const thiefStart = 120;
  const thiefEnd = vaultCx - vaultR - 36;
  const thiefX = animating || (params.phase === "done" && params.hasResult)
    ? thiefStart + (thiefEnd - thiefStart) * Math.min(1, progress * 1.05)
    : thiefStart + (thiefEnd - thiefStart) * 0.35;
  if (!success) drawThief(ctx, thiefX, vaultCy + 42, progress, params.frameIndex || 0);
  drawCoinScatter(ctx, width, height, success ? "success" : "idle", params.frameIndex || 0);
  const status = buildStatus(params);
  const leftInfo = params.isBank ? "Furto · Gringott" : `Furto · ${truncateName(params.targetName, 12)}`;
  drawInfoRow(ctx, width, height - 42, leftInfo, status.right, status.color);
}

function spinFrameTiming() {
  const totalFrames = Math.max(18, Math.min(32, Math.floor(Number(process.env.VC_ROB_GIF_FRAMES ?? 22))));
  const delay = Math.max(75, Math.min(140, Math.floor(Number(process.env.VC_ROB_GIF_DELAY_MS ?? 95))));
  const gifFrames = totalFrames + HOLD_FRAMES;
  return { totalFrames, delay, gifFrames, durationMs: gifFrames * delay + 80 };
}

function renderPng(params) {
  const width = 760;
  const height = 420;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const timing = spinFrameTiming();
  drawArena(ctx, {
    width,
    height,
    phase: params.phase,
    targetName: params.targetName,
    successChance: params.successChance,
    success: params.success,
    hasResult: params.hasResult,
    amount: params.amount,
    penalty: params.penalty,
    animating: false,
    frameIndex: timing.totalFrames - 1,
    totalFrames: timing.totalFrames,
    isBank: Boolean(params.isBank),
  });
  return canvas.toBuffer("image/png");
}

async function renderRobGif(params) {
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
      phase: "animating",
      targetName: params.targetName,
      successChance: params.successChance,
      success: params.success,
      hasResult: true,
      amount: params.amount,
      penalty: params.penalty,
      animating: true,
      frameIndex,
      totalFrames,
      isBank: Boolean(params.isBank),
    });
    encoder.addFrame(ctx);
  }
  encoder.finish();
  const out = encoder.out.getData();
  if (!out || !out.length) throw new Error("empty gif");
  return Buffer.from(out);
}

async function renderRobCanvas(params = {}) {
  if (!canvasModule) throw new Error("Canvas module not available");
  ensureFonts();
  const normalized = {
    phase: String(params.phase || "idle"),
    targetName: String(params.targetName || ""),
    successChance: Math.max(1, Math.min(99, Math.floor(Number(params.successChance) || 35))),
    success: Boolean(params.success),
    hasResult: Boolean(params.hasResult),
    amount: Math.max(0, Math.floor(Number(params.amount) || 0)),
    penalty: Math.max(0, Math.floor(Number(params.penalty) || 0)),
    animating: Boolean(params.animating),
    isBank: Boolean(params.isBank),
  };
  try {
    if (normalized.animating && !USE_PNG) {
      return { buffer: await renderRobGif(normalized), format: "gif" };
    }
    return { buffer: renderPng(normalized), format: "png" };
  } catch (err) {
    global.logger?.warn?.("[ROB CANVAS] render failed:", err?.message || err);
    return { buffer: renderPng(normalized), format: "png" };
  }
}

renderRobCanvas.spinAnimationDurationMs = function spinAnimationDurationMs() {
  return spinFrameTiming().durationMs;
};

renderRobCanvas.warmup = function warmup() {
  if (!canvasModule) return;
  ensureFonts();
  try {
    renderPng({ phase: "idle", targetName: "?" });
  } catch (_) {}
};

module.exports = renderRobCanvas;