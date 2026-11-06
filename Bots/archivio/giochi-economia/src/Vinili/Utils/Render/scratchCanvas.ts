const canvasModule = require("canvas") as typeof import("canvas");
const GIFEncoder = require("gif-encoder-2");
const { formatGaleoni } = require("../../Services/Community/gringottService") as typeof import("../../Services/Community/gringottService");
const { registerCanvasFonts, drawTextWithSpecialFallback } = require("./canvasFonts") as typeof import("./canvasFonts");
const { symbolLabel } = require("../Economy/scratchEngine") as typeof import("../Economy/scratchEngine");
const { createCanvas } = canvasModule;
const USE_PNG = String(process.env.VC_SCRATCH_CANVAS_PNG ?? "0").trim() === "1";
const HOLD_FRAMES = 8;
const CELL_LAYOUT = { x0: 132, y0: 108, w: 158, h: 96, gap: 14, cols: 3 };
let fontsReady = false;
let scratchNoise = null;

function ensureFonts() {
  if (fontsReady) return;
  registerCanvasFonts(canvasModule);
  fontsReady = true;
}

function ensureNoise(width?, height?) {
  if (scratchNoise && scratchNoise.width === width && scratchNoise.height === height) return scratchNoise;
  const c = createCanvas(width, height);
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(width, height);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 140 + Math.floor(Math.random() * 80);
    img.data[i] = v;
    img.data[i + 1] = v + 4;
    img.data[i + 2] = v + 8;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  scratchNoise = c;
  return scratchNoise;
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

function drawText(ctx?, text?, x?, y?, opts: Record<string, any> = {}) {
  drawTextWithSpecialFallback(ctx, text, x, y, {
    size: opts.size || 22,
    weight: opts.weight || "700",
    color: opts.color || "#ffffff",
    align: opts.align || "center",
    baseline: opts.baseline || "middle",
    forcePrimaryFont: opts.forcePrimaryFont === true,
  });
}

function drawPlainText(ctx?, text?, x?, y?, opts: Record<string, any> = {}) {
  ctx.save();
  const size = Math.max(10, Math.floor(Number(opts.size) || 18));
  ctx.font = `${opts.weight || "700"} ${size}px Arial, Helvetica, sans-serif`;
  ctx.fillStyle = opts.color || "#ffffff";
  ctx.textAlign = opts.align || "center";
  ctx.textBaseline = opts.baseline || "middle";
  ctx.fillText(String(text ?? ""), x, y);
  ctx.restore();
}

function cellXY(index?) {
  const col = index % CELL_LAYOUT.cols;
  const row = Math.floor(index / CELL_LAYOUT.cols);
  const x = CELL_LAYOUT.x0 + col * (CELL_LAYOUT.w + CELL_LAYOUT.gap);
  const y = CELL_LAYOUT.y0 + row * (CELL_LAYOUT.h + CELL_LAYOUT.gap);
  return { x, y, w: CELL_LAYOUT.w, h: CELL_LAYOUT.h };
}

function drawTicketBg(ctx?, width?, height?) {
  try {
    const { drawStarWarsBg } = require("./starWarsEconomyTheme") as typeof import("./starWarsEconomyTheme");
    drawStarWarsBg(ctx, width, height, { panel: false });
  } catch (_) {
    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, "#020617");
    bg.addColorStop(0.35, "#0b1224");
    bg.addColorStop(1, "#111827");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
  }
  fillRoundRect(ctx, 28, 40, width - 56, height - 58, 20, "#0f172a");
  strokeRoundRect(ctx, 28, 40, width - 56, height - 58, 20, "#FFE81F", 3);
  fillRoundRect(ctx, 36, 48, width - 72, height - 74, 16, "#111827");
  const foil = ctx.createLinearGradient(36, 48, width - 36, 80);
  foil.addColorStop(0, "rgba(56,189,248,0.45)");
  foil.addColorStop(0.5, "rgba(255,232,31,0.35)");
  foil.addColorStop(1, "rgba(56,189,248,0.4)");
  fillRoundRect(ctx, 40, 52, width - 80, 36, 8, foil);
  drawText(ctx, "GRATTA E VINCI", width / 2, 62, { size: 17, color: "#020617", weight: "900", forcePrimaryFont: true });
  drawPlainText(ctx, "Trova 3 simboli uguali · Crediti", width / 2, 80, { size: 11, color: "rgba(15,23,42,0.85)", weight: "700" });
  const shine = ctx.createLinearGradient(50, 90, width - 50, height - 70);
  shine.addColorStop(0, "rgba(255,255,255,0.2)");
  shine.addColorStop(0.15, "rgba(255,255,255,0)");
  ctx.fillStyle = shine;
  fillRoundRect(ctx, 44, 88, width - 88, height - 130, 12, "rgba(255,255,255,0.06)");
}

function drawSymbolIcon(ctx?, sym?, cx?, cy?, size?) {
  const s = size;
  if (sym === "coin") {
    const g = ctx.createRadialGradient(cx - s * 0.2, cy - s * 0.2, s * 0.1, cx, cy, s * 0.5);
    g.addColorStop(0, "#fff4c2");
    g.addColorStop(1, "#b8860b");
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = "#5c4510";
    ctx.lineWidth = 2;
    ctx.stroke();
    drawPlainText(ctx, "G", cx, cy, { size: Math.floor(s * 0.38), color: "#4a3810", weight: "900" });
    return;
  }
  if (sym === "star") {
    ctx.fillStyle = "#eab308";
    ctx.strokeStyle = "#a16207";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 5; i += 1) {
      const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
      const px = cx + Math.cos(a) * s * 0.42;
      const py = cy + Math.sin(a) * s * 0.42;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    return;
  }
  if (sym === "seven") {
    drawPlainText(ctx, "7", cx, cy, { size: Math.floor(s * 0.72), color: "#dc2626", weight: "900" });
    return;
  }
  if (sym === "gem") {
    ctx.fillStyle = "#38bdf8";
    ctx.strokeStyle = "#0369a1";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.4);
    ctx.lineTo(cx + s * 0.35, cy);
    ctx.lineTo(cx, cy + s * 0.42);
    ctx.lineTo(cx - s * 0.35, cy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    return;
  }
  if (sym === "gift") {
    fillRoundRect(ctx, cx - s * 0.32, cy - s * 0.12, s * 0.64, s * 0.42, 6, "#ef4444");
    ctx.fillStyle = "#fbbf24";
    fillRoundRect(ctx, cx - s * 0.34, cy - s * 0.32, s * 0.68, s * 0.22, 4, "#fbbf24");
    ctx.fillStyle = "#b91c1c";
    ctx.fillRect(cx - 3, cy - s * 0.32, 6, s * 0.62);
    return;
  }
  if (sym === "clover") {
    ctx.fillStyle = "#22c55e";
    ctx.strokeStyle = "#166534";
    ctx.lineWidth = 2;
    for (const [ox, oy] of [
      [0, -0.22],
      [0.2, 0.05],
      [-0.2, 0.05],
      [0, 0.22],
    ]) {
      ctx.beginPath();
      ctx.ellipse(cx + ox * s, cy + oy * s, s * 0.16, s * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    return;
  }
  if (sym === "moon") {
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.38, 0, Math.PI * 2);
    ctx.fillStyle = "#e2e8f0";
    ctx.fill();
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + s * 0.14, cy - s * 0.06, s * 0.32, 0, Math.PI * 2);
    ctx.fillStyle = "#0f172a";
    ctx.fill();
    return;
  }
  if (sym === "heart") {
    ctx.fillStyle = "#f43f5e";
    ctx.strokeStyle = "#9f1239";
    ctx.lineWidth = 2;
    ctx.beginPath();
    const top = cy - s * 0.12;
    ctx.moveTo(cx, cy + s * 0.38);
    ctx.bezierCurveTo(cx + s * 0.48, cy + s * 0.05, cx + s * 0.42, top - s * 0.18, cx, top + s * 0.08);
    ctx.bezierCurveTo(cx - s * 0.42, top - s * 0.18, cx - s * 0.48, cy + s * 0.05, cx, cy + s * 0.38);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    return;
  }
  if (sym === "bell") {
    ctx.fillStyle = "#fbbf24";
    ctx.strokeStyle = "#b45309";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.28, cy + s * 0.18);
    ctx.quadraticCurveTo(cx - s * 0.3, cy - s * 0.2, cx, cy - s * 0.38);
    ctx.quadraticCurveTo(cx + s * 0.3, cy - s * 0.2, cx + s * 0.28, cy + s * 0.18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    fillRoundRect(ctx, cx - s * 0.34, cy + s * 0.14, s * 0.68, s * 0.14, 4, "#f59e0b");
    ctx.beginPath();
    ctx.arc(cx, cy - s * 0.42, s * 0.08, 0, Math.PI * 2);
    ctx.fillStyle = "#fde68a";
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy + s * 0.32, s * 0.08, 0, Math.PI * 2);
    ctx.fillStyle = "#92400e";
    ctx.fill();
    return;
  }
  if (sym === "cherry") {
    for (const [ox, oy] of [
      [-0.14, 0.08],
      [0.16, 0.12],
    ]) {
      ctx.beginPath();
      ctx.arc(cx + ox * s, cy + oy * s, s * 0.2, 0, Math.PI * 2);
      ctx.fillStyle = "#dc2626";
      ctx.fill();
      ctx.strokeStyle = "#7f1d1d";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.strokeStyle = "#166534";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.14, cy - s * 0.02);
    ctx.quadraticCurveTo(cx - s * 0.05, cy - s * 0.28, cx + s * 0.02, cy - s * 0.34);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.16, cy + s * 0.02);
    ctx.quadraticCurveTo(cx + s * 0.08, cy - s * 0.22, cx + s * 0.02, cy - s * 0.34);
    ctx.stroke();
    return;
  }
  if (sym === "lemon") {
    ctx.fillStyle = "#facc15";
    ctx.strokeStyle = "#a16207";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, s * 0.34, s * 0.26, -0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx - s * 0.08, cy - s * 0.08, s * 0.1, s * 0.06, -0.4, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fill();
    return;
  }
  if (sym === "orb") {
    const g = ctx.createRadialGradient(cx - s * 0.15, cy - s * 0.15, s * 0.05, cx, cy, s * 0.42);
    g.addColorStop(0, "#a5f3fc");
    g.addColorStop(0.55, "#0ea5e9");
    g.addColorStop(1, "#075985");
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = "#0c4a6e";
    ctx.lineWidth = 2;
    ctx.stroke();
    return;
  }
  drawPlainText(ctx, "VC", cx, cy, { size: Math.floor(s * 0.34), color: "#7c3aed", weight: "900" });
  const ring = ctx.createRadialGradient(cx, cy, s * 0.1, cx, cy, s * 0.45);
  ring.addColorStop(0, "rgba(167,139,250,0.5)");
  ring.addColorStop(1, "rgba(124,58,237,0)");
  ctx.fillStyle = ring;
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.45, 0, Math.PI * 2);
  ctx.fill();
}

function scratchMaskStrokes(ctx?, x?, y?, w?, h?, progress?, seed?) {
  const strokes = 18 + Math.floor(progress * 28);
  ctx.save();
  roundRect(ctx, x, y, w, h, 10);
  ctx.clip();
  ctx.globalCompositeOperation = "destination-out";
  for (let i = 0; i < strokes; i += 1) {
    const t = (i + seed * 0.17) / strokes;
    if (t > progress) break;
    const rx = x + 8 + ((seed * 9301 + i * 49297) % 1000) / 1000 * (w - 16);
    const ry = y + 8 + ((seed * 233 + i * 1291) % 1000) / 1000 * (h - 16);
    const rw = 12 + ((i * 17 + seed) % 28);
    const rh = 8 + ((i * 11 + seed) % 18);
    ctx.beginPath();
    ctx.ellipse(rx, ry, rw, rh, (i + seed) * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawScratchLayer(ctx?, x?, y?, w?, h?, progress?, seed?) {
  if (progress >= 0.995) return;
  const silver = ctx.createLinearGradient(x, y, x + w, y + h);
  silver.addColorStop(0, "#d1d5db");
  silver.addColorStop(0.35, "#f8fafc");
  silver.addColorStop(0.65, "#cbd5e1");
  silver.addColorStop(1, "#9ca3af");
  fillRoundRect(ctx, x, y, w, h, 10, silver);
  const noise = ensureNoise(w, h);
  ctx.save();
  roundRect(ctx, x, y, w, h, 10);
  ctx.clip();
  ctx.globalAlpha = 0.42;
  ctx.drawImage(noise, x, y, w, h);
  ctx.globalAlpha = 1;
  ctx.restore();
  strokeRoundRect(ctx, x, y, w, h, 10, "rgba(148,163,184,0.6)", 1);
  scratchMaskStrokes(ctx, x, y, w, h, progress, seed);
  if (progress < 0.35) {
    drawPlainText(ctx, "GRATTA", x + w / 2, y + h / 2 - 8, { size: 11, color: "rgba(71,85,105,0.75)", weight: "800" });
    drawPlainText(ctx, "QUI", x + w / 2, y + h / 2 + 10, { size: 11, color: "rgba(71,85,105,0.75)", weight: "800" });
  }
}

function drawCell(ctx?, index?, symbol?, progress?) {
  const { x, y, w, h } = cellXY(index);
  fillRoundRect(ctx, x, y, w, h, 10, "#1e1b4b");
  strokeRoundRect(ctx, x, y, w, h, 10, "rgba(212,175,55,0.45)", 1);
  drawSymbolIcon(ctx, symbol, x + w / 2, y + h / 2, Math.min(w, h) * 0.72);
  drawScratchLayer(ctx, x, y, w, h, progress, index + 1);
}

function resolveProgress(revealed?, progress?, index?, animating?, frameIndex?, totalFrames?) {
  if (Array.isArray(progress) && progress[index] != null) return Math.max(0, Math.min(1, Number(progress[index]) || 0));
  if (revealed && revealed[index]) return 1;
  if (!animating) return revealed && revealed[index] ? 1 : 0;
  const order = [4, 0, 8, 2, 6, 1, 7, 3, 5];
  const pos = order.indexOf(index);
  const per = totalFrames / order.length;
  const start = pos * per;
  const end = start + per * 1.2;
  const t = (frameIndex - start) / (end - start);
  return Math.max(0, Math.min(1, t));
}

function buildStatus(params?) {
  if (params.phase === "idle") return { left: "Regola: 3 uguali", right: "Compra un biglietto e gratta", color: "#64748b" };
  if (params.phase === "ready") return { left: params.bet > 0 ? `Biglietto: ${formatGaleoni(params.bet)}` : "", right: "Cerca 3 simboli uguali", color: "#f8d875" };
  if (params.animating) return { left: params.bet > 0 ? `Biglietto: ${formatGaleoni(params.bet)}` : "", right: "Grattata in corso…", color: "#f8d875" };
  if (params.phase === "done" && params.eval) {
    const e = params.eval;
    const left = params.bet > 0 ? `Biglietto: ${formatGaleoni(params.bet)}` : "";
    if (e.win) {
      return { left, right: `${e.max}x ${symbolLabel(e.best)}  ·  +${formatGaleoni(params.payout)}`, color: "#4ade80" };
    }
    return { left, right: "Nessuna vincita — riprova!", color: "#f87171" };
  }
  return { left: "", right: "", color: "#e2e8f0" };
}

function drawArena(ctx?, params?) {
  const width = params.width;
  const height = params.height;
  drawTicketBg(ctx, width, height);
  const symbols = Array.isArray(params.symbols) ? params.symbols : [];
  const revealed = Array.isArray(params.revealed) ? params.revealed : [];
  const progress = Array.isArray(params.progress) ? params.progress : null;
  const totalFrames = Math.max(1, params.totalFrames || 24);
  for (let i = 0; i < 9; i += 1) {
    const p = resolveProgress(revealed, progress, i, params.animating, params.frameIndex || 0, totalFrames);
    drawCell(ctx, i, symbols[i] || "coin", p);
  }
  const status = buildStatus(params);
  const infoY = height - 38;
  if (status.left) drawPlainText(ctx, status.left, 56, infoY, { size: 13, color: "#78716c", align: "left", weight: "700" });
  if (status.right) drawText(ctx, status.right, width - 56, infoY, { size: 14, color: status.color, align: "right", forcePrimaryFont: true });
}

function spinFrameTiming() {
  const totalFrames = Math.max(14, Math.min(40, Math.floor(Number(process.env.VC_SCRATCH_GIF_FRAMES ?? 16))));
  const delay = Math.max(75, Math.min(140, Math.floor(Number(process.env.VC_SCRATCH_GIF_DELAY_MS ?? 90))));
  const gifFrames = totalFrames + HOLD_FRAMES;
  return { totalFrames, delay, gifFrames, durationMs: gifFrames * delay + 80 };
}

function renderPng(params?) {
  const width = 760;
  const height = 480;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  drawArena(ctx, { width, height, ...params, animating: false });
  return canvas.toBuffer("image/png");
}

async function renderScratchGif(params?) {
  const width = 760;
  const height = 480;
  const { totalFrames, delay, gifFrames } = spinFrameTiming();
  const encoder = new GIFEncoder(width, height);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  encoder.start();
  encoder.setRepeat(0);
  encoder.setDelay(delay);
  encoder.setQuality(10);
  for (let i = 0; i < gifFrames; i += 1) {
    const frameIndex = Math.min(i, totalFrames - 1);
    ctx.clearRect(0, 0, width, height);
    drawArena(ctx, {
      width,
      height,
      ...params,
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

async function renderScratchCanvas(params: Record<string, any> = {}) {
  if (!canvasModule) throw new Error("Canvas module not available");
  ensureFonts();
  const normalized = {
    phase: String(params.phase || "idle"),
    bet: Math.max(0, Math.floor(Number(params.bet) || 0)),
    symbols: params.symbols || [],
    revealed: params.revealed || [],
    progress: params.progress || null,
    eval: params.eval || null,
    payout: Math.max(0, Math.floor(Number(params.payout) || 0)),
    animating: Boolean(params.animating),
  };
  try {
    if (normalized.animating && !USE_PNG) {
      return { buffer: await renderScratchGif(normalized), format: "gif" };
    }
    return { buffer: renderPng(normalized), format: "png" };
  } catch (err) {
    global.logger?.warn?.("[SCRATCH CANVAS] render failed:", err?.message || err);
    return { buffer: renderPng(normalized), format: "png" };
  }
}

renderScratchCanvas.spinAnimationDurationMs = function spinAnimationDurationMs() {
  return spinFrameTiming().durationMs;
};

renderScratchCanvas.warmup = function warmup() {
  if (!canvasModule) return;
  ensureFonts();
  try {
    renderPng({ phase: "idle", bet: 10 });
  } catch (_) {}
};

export = renderScratchCanvas;