const canvasModule = require("canvas");
const { formatGaleoni } = require("../../Services/Community/gringottService");
const { registerCanvasFonts } = require("./canvasFonts");
const { createCanvas } = canvasModule;
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

function measurePlain(ctx, text, size, weight = "700") {
  ctx.save();
  ctx.font = `${weight} ${size}px Arial, Helvetica, sans-serif`;
  const w = ctx.measureText(String(text ?? "")).width;
  ctx.restore();
  return w;
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

function fitPlainText(ctx, text, maxW, size, weight = "700") {
  const s = String(text ?? "");
  if (measurePlain(ctx, s, size, weight) <= maxW) return s;
  let cut = s;
  while (cut.length > 2 && measurePlain(ctx, `${cut}…`, size, weight) > maxW) cut = cut.slice(0, -1);
  return `${cut}…`;
}

function formatShort(amount) {
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  return `${n} ${n === 1 ? "Galeone" : "Galeoni"}`;
}

function drawVaultIcon(ctx, cx, cy) {
  ctx.save();
  ctx.translate(cx, cy);
  const gold = ctx.createLinearGradient(-40, -30, 40, 40);
  gold.addColorStop(0, "#fde68a");
  gold.addColorStop(0.5, "#d4af37");
  gold.addColorStop(1, "#92400e");
  fillRoundRect(ctx, -52, -18, 104, 56, 10, "rgba(15,23,42,0.55)");
  strokeRoundRect(ctx, -52, -18, 104, 56, 10, "#d4af37", 2);
  ctx.beginPath();
  ctx.arc(0, -8, 22, Math.PI, 0);
  ctx.lineWidth = 4;
  ctx.strokeStyle = gold;
  ctx.stroke();
  fillRoundRect(ctx, -34, 2, 68, 28, 6, gold);
  strokeRoundRect(ctx, -34, 2, 68, 28, 6, "#78350f", 1.5);
  ctx.fillStyle = "#451a03";
  ctx.fillRect(-6, 10, 12, 14);
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.arc(-22 + i * 22, 30, 7, 0, Math.PI * 2);
    ctx.fillStyle = i === 1 ? "#fbbf24" : "#f59e0b";
    ctx.fill();
    ctx.strokeStyle = "#78350f";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.restore();
}

function drawStatPill(ctx, x, y, w, h, label, value, accent) {
  fillRoundRect(ctx, x, y, w, h, 10, "rgba(0,0,0,0.42)");
  strokeRoundRect(ctx, x, y, w, h, 10, accent, 1.5);
  drawPlainText(ctx, label, x + w / 2, y + 14, { size: 11, color: "#94a3b8", weight: "700" });
  const fitted = fitPlainText(ctx, value, w - 16, 14, "800");
  drawPlainText(ctx, fitted, x + w / 2, y + h - 16, { size: 14, color: accent, weight: "800" });
}

function drawArena(ctx, params) {
  const width = params.width;
  const height = params.height;
  const cx = Math.floor(width / 2);
  const accent = "#d4af37";
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, "#0f172a");
  bg.addColorStop(0.55, "#1e293b");
  bg.addColorStop(1, "#020617");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  const fx = 36;
  const fy = 40;
  const fw = width - 72;
  const fh = height - 80;
  const frameBottom = fy + fh;
  fillRoundRect(ctx, fx, fy, fw, fh, 18, "rgba(0,0,0,0.3)");
  strokeRoundRect(ctx, fx, fy, fw, fh, 18, accent, 2);
  const bandH = 44;
  const bandX = fx + 14;
  const bandW = fw - 28;
  const bandY = fy + 10;
  const foil = ctx.createLinearGradient(bandX, bandY, bandX + bandW, bandY + bandH);
  foil.addColorStop(0, "rgba(212,175,55,0.35)");
  foil.addColorStop(0.5, "rgba(255,248,220,0.5)");
  foil.addColorStop(1, "rgba(212,175,55,0.35)");
  fillRoundRect(ctx, bandX, bandY, bandW, bandH, 10, foil);
  strokeRoundRect(ctx, bandX, bandY, bandW, bandH, 10, "rgba(45,34,8,0.35)", 1);
  drawPlainText(ctx, "GRINGOTT", cx, bandY + bandH / 2 - 7, { size: 20, color: "#5c4510", weight: "900" });
  const sub = fitPlainText(ctx, params.targetLabel || "Conto", bandW - 20, 11, "600");
  drawPlainText(ctx, sub, cx, bandY + bandH / 2 + 11, { size: 11, color: "#78350f", weight: "600" });
  drawVaultIcon(ctx, cx, fy + 118);
  const balanceStr = formatShort(params.balance);
  let balSize = 36;
  while (balSize > 22 && measurePlain(ctx, balanceStr, balSize, "900") > fw - 48) balSize -= 2;
  drawPlainText(ctx, balanceStr, cx, fy + 178, { size: balSize, color: accent, weight: "900" });
  drawPlainText(ctx, "Saldo disponibile", cx, fy + 206, { size: 12, color: "#94a3b8", weight: "600" });
  const pillW = Math.floor((fw - 48) / 2);
  const pillY = fy + 228;
  const pillH = 52;
  drawStatPill(ctx, fx + 16, pillY, pillW, pillH, "Guadagnati", formatShort(params.earned), "#4ade80");
  drawStatPill(ctx, fx + 24 + pillW, pillY, pillW, pillH, "Spesi", formatShort(params.spent), "#f87171");
  const footerH = 36;
  const barX = fx + 14;
  const barW = fw - 28;
  const barY = frameBottom - footerH - 10;
  fillRoundRect(ctx, barX, barY, barW, footerH, 12, "rgba(0,0,0,0.45)");
  const left = params.staffMode ? "Gestione High Staff" : "Economia Galeoni";
  const right = params.noticeShort || "Gringott";
  drawPlainText(ctx, left, barX + 16, barY + footerH / 2, { size: 13, color: "#94a3b8", align: "left", weight: "700" });
  const fittedRight = fitPlainText(ctx, right, Math.floor(barW * 0.5), 13, "700");
  drawPlainText(ctx, fittedRight, barX + barW - 16, barY + footerH / 2, { size: 13, color: accent, align: "right", weight: "700" });
}

async function renderBalCanvas(params = {}) {
  if (!canvasModule) throw new Error("Canvas module not available");
  ensureFonts();
  const width = 760;
  const height = 420;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  drawArena(ctx, {
    width,
    height,
    targetLabel: String(params.targetLabel || "Conto").trim() || "Conto",
    balance: Math.max(0, Math.floor(Number(params.balance) || 0)),
    earned: Math.max(0, Math.floor(Number(params.earned) || 0)),
    spent: Math.max(0, Math.floor(Number(params.spent) || 0)),
    staffMode: Boolean(params.staffMode),
    noticeShort: String(params.noticeShort || "Gringott").trim() || "Gringott",
  });
  return { buffer: canvas.toBuffer("image/png"), format: "png" };
}

renderBalCanvas.warmup = function warmup() {
  if (!canvasModule) return;
  ensureFonts();
  try {
    renderBalCanvas({ targetLabel: "Utente", balance: 120, earned: 200, spent: 80, staffMode: true });
  } catch (_) {}
};

module.exports = renderBalCanvas;