/**
 * Canvas conferma +deposita — allineato al tema Star Wars degli altri comandi economy.
 */
"use strict";

const __path = require("path") as typeof import("path");

function loadCanvasModule() {
  try {
    return require("canvas") as typeof import("canvas");
  } catch (_) {}
  /* Archivio non ha node_modules: risolvi il canvas del live Vinili. */
  const candidates = [
    __path.resolve(__dirname, "../../../../../../src/Vinili/node_modules/canvas"),
    __path.resolve(__dirname, "../../../../../../../src/Vinili/node_modules/canvas"),
  ];
  for (const c of candidates) {
    try {
      return require(c) as typeof import("canvas");
    } catch (_) {}
  }
  throw new Error("canvas module not available");
}

const canvasModule = loadCanvasModule();
const { formatEconomyAmountShort } = require("../Economy/economyDisplayHelpers") as typeof import("../Economy/economyDisplayHelpers");
const { registerCanvasFonts } = require("./canvasFonts") as typeof import("./canvasFonts");
const { normalizeTextForCanvas } = require("./canvasUtils") as typeof import("./canvasUtils");
const { createCanvas } = canvasModule;

let fontsReady = false;

function ensureFonts() {
  if (fontsReady) return;
  registerCanvasFonts(canvasModule);
  fontsReady = true;
}

function fillRoundRect(ctx?, x?, y?, w?, h?, r?, fillStyle?) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
  ctx.fillStyle = fillStyle;
  ctx.fill();
  ctx.restore();
}

function strokeRoundRect(ctx?, x?, y?, w?, h?, r?, strokeStyle?, lineWidth = 2) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
  ctx.restore();
}

function measurePlain(ctx?, text?, size?, weight = "700") {
  ctx.save();
  ctx.font = `${weight} ${size}px Arial, Helvetica, sans-serif`;
  const w = ctx.measureText(String(text ?? "")).width;
  ctx.restore();
  return w;
}

function drawPlainText(ctx?, text?, x?, y?, opts: Record<string, any> = {}) {
  ctx.save();
  const size = Math.max(10, Math.floor(Number(opts.size) || 18));
  ctx.font = `${opts.weight || "700"} ${size}px Arial, Helvetica, sans-serif`;
  ctx.fillStyle = opts.color || "#ffffff";
  ctx.textAlign = opts.align || "center";
  ctx.textBaseline = opts.baseline || "middle";
  ctx.fillText(normalizeTextForCanvas(String(text ?? "")), x, y);
  ctx.restore();
}

function fitPlainText(ctx?, text?, maxW?, size?, weight = "700") {
  const s = normalizeTextForCanvas(String(text ?? ""));
  if (measurePlain(ctx, s, size, weight) <= maxW) return s;
  let cut = s;
  while (cut.length > 2 && measurePlain(ctx, `${cut}…`, size, weight) > maxW) cut = cut.slice(0, -1);
  return `${cut}…`;
}

function drawVaultIcon(ctx?, cx?, cy?) {
  ctx.save();
  ctx.translate(cx, cy);
  const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 48);
  glow.addColorStop(0, "rgba(255,232,31,0.28)");
  glow.addColorStop(1, "rgba(255,232,31,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(-52, -52, 104, 104);

  fillRoundRect(ctx, -36, -28, 72, 58, 10, "#1e293b");
  strokeRoundRect(ctx, -36, -28, 72, 58, 10, "#FFE81F", 2.5);

  /* porta caveau */
  ctx.beginPath();
  ctx.arc(0, 2, 18, 0, Math.PI * 2);
  ctx.fillStyle = "#0f172a";
  ctx.fill();
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 2, 8, 0, Math.PI * 2);
  ctx.fillStyle = "#FFE81F";
  ctx.fill();

  /* bulloni */
  for (const [bx, by] of [
    [-28, -20],
    [28, -20],
    [-28, 22],
    [28, 22],
  ]) {
    ctx.beginPath();
    ctx.arc(bx, by, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = "#94a3b8";
    ctx.fill();
  }

  /* freccia deposito in alto */
  ctx.fillStyle = "#4ade80";
  ctx.beginPath();
  ctx.moveTo(0, -46);
  ctx.lineTo(-8, -34);
  ctx.lineTo(-3, -34);
  ctx.lineTo(-3, -22);
  ctx.lineTo(3, -22);
  ctx.lineTo(3, -34);
  ctx.lineTo(8, -34);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawStatPill(ctx?, x?, y?, w?, h?, label?, value?, accent?) {
  fillRoundRect(ctx, x, y, w, h, 12, "rgba(0,0,0,0.42)");
  strokeRoundRect(ctx, x, y, w, h, 12, accent || "rgba(148,163,184,0.35)", 1.5);
  drawPlainText(ctx, label, x + w / 2, y + 16, { size: 11, color: "#94a3b8", weight: "700" });
  let size = 20;
  while (size > 13 && measurePlain(ctx, value, size, "900") > w - 16) size -= 1;
  drawPlainText(ctx, value, x + w / 2, y + h - 20, { size, color: "#f8fafc", weight: "900" });
}

async function renderDepositCanvas(params: Record<string, any> = {}) {
  if (!canvasModule) throw new Error("Canvas module not available");
  ensureFonts();
  const width = 760;
  const height = 400;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const client = params.client || null;
  const deposited = Math.max(0, Math.floor(Number(params.deposited) || 0));
  const bankCredits = Math.max(0, Math.floor(Number(params.bankCredits) || 0));
  const contribution = Math.max(0, Math.floor(Number(params.contribution) || 0));
  const walletLeft = Math.max(0, Math.floor(Number(params.walletCredits) || 0));
  const factionLabel = fitPlainText(
    ctx,
    String(params.factionLabel || params.factionId || "Fazione").trim() || "Fazione",
    420,
    14,
    "800",
  );

  try {
    const { drawStarWarsBg } = require("./starWarsEconomyTheme") as typeof import("./starWarsEconomyTheme");
    drawStarWarsBg(ctx, width, height, { panel: false });
  } catch (_) {
    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, "#0f172a");
    bg.addColorStop(0.55, "#1e293b");
    bg.addColorStop(1, "#020617");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
  }

  const fx = 36;
  const fy = 36;
  const fw = width - 72;
  const fh = height - 72;
  fillRoundRect(ctx, fx, fy, fw, fh, 18, "rgba(8,15,32,0.72)");
  strokeRoundRect(ctx, fx, fy, fw, fh, 18, "#FFE81F", 2);

  const cx = Math.floor(width / 2);
  const bandX = fx + 14;
  const bandW = fw - 28;
  const bandY = fy + 12;
  const bandH = 48;
  const foil = ctx.createLinearGradient(bandX, bandY, bandX + bandW, bandY + bandH);
  foil.addColorStop(0, "rgba(255,232,31,0.35)");
  foil.addColorStop(0.5, "rgba(255,248,220,0.5)");
  foil.addColorStop(1, "rgba(56,189,248,0.28)");
  fillRoundRect(ctx, bandX, bandY, bandW, bandH, 10, foil);
  strokeRoundRect(ctx, bandX, bandY, bandW, bandH, 10, "rgba(45,34,8,0.35)", 1);
  drawPlainText(ctx, "DEPOSITO BANCA", cx, bandY + bandH / 2 - 8, {
    size: 20,
    color: "#5c4510",
    weight: "900",
  });
  drawPlainText(ctx, `Caveau · ${factionLabel}`, cx, bandY + bandH / 2 + 12, {
    size: 12,
    color: "#78350f",
    weight: "600",
  });

  drawVaultIcon(ctx, cx, fy + 128);

  const amountStr = `+${formatEconomyAmountShort(deposited, client)}`;
  let amountSize = 34;
  while (amountSize > 22 && measurePlain(ctx, amountStr, amountSize, "900") > fw - 48) amountSize -= 2;
  drawPlainText(ctx, amountStr, cx, fy + 198, { size: amountSize, color: "#4ade80", weight: "900" });
  drawPlainText(ctx, "Versati alla banca della fazione", cx, fy + 224, {
    size: 13,
    color: "#86efac",
    weight: "700",
  });

  const pillGap = 12;
  const pillW = Math.floor((fw - 40 - pillGap * 2) / 3);
  const pillY = fy + fh - 86;
  const pillH = 58;
  const pillStart = fx + 20;
  drawStatPill(
    ctx,
    pillStart,
    pillY,
    pillW,
    pillH,
    "Caveau",
    formatEconomyAmountShort(bankCredits, client),
    "rgba(255,232,31,0.45)",
  );
  drawStatPill(
    ctx,
    pillStart + pillW + pillGap,
    pillY,
    pillW,
    pillH,
    "Tuo contributo",
    formatEconomyAmountShort(contribution, client),
    "rgba(56,189,248,0.45)",
  );
  drawStatPill(
    ctx,
    pillStart + (pillW + pillGap) * 2,
    pillY,
    pillW,
    pillH,
    "Saldo personale",
    formatEconomyAmountShort(walletLeft, client),
    "rgba(148,163,184,0.4)",
  );

  return { buffer: canvas.toBuffer("image/png"), width, height };
}

renderDepositCanvas.warmup = function warmup() {
  setImmediate(() => {
    renderDepositCanvas({
      deposited: 1000,
      bankCredits: 5000,
      contribution: 1000,
      walletCredits: 2500,
      factionLabel: "Ribellione",
    }).catch(() => {});
  });
};

export = renderDepositCanvas;
