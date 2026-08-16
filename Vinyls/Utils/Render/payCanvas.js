const canvasModule = require("canvas");
const { formatGaleoni } = require("../../Services/Community/gringottService");
const { registerCanvasFonts } = require("./canvasFonts");
const { normalizeTextForCanvas, sanitizeCanvasDisplayName } = require("./canvasUtils");
const { createCanvas } = canvasModule;
const ACCENT = "#fbbf24";
const ACCENT_GLOW = "rgba(251,191,36,0.4)";
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
  ctx.fillText(normalizeTextForCanvas(String(text ?? "")), x, y);
  ctx.restore();
}

function fitPlainText(ctx, text, maxW, size, weight = "700") {
  const s = normalizeTextForCanvas(String(text ?? ""));
  if (measurePlain(ctx, s, size, weight) <= maxW) return s;
  let cut = s;
  while (cut.length > 2 && measurePlain(ctx, `${cut}…`, size, weight) > maxW) cut = cut.slice(0, -1);
  return `${cut}…`;
}

function formatGaleoniShort(amount) {
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  return `${n} ${n === 1 ? "Galeone" : "Galeoni"}`;
}

function drawHeaderBand(ctx, cx, bandX, bandW, bandY, bandH) {
  const foil = ctx.createLinearGradient(bandX, bandY, bandX + bandW, bandY + bandH);
  foil.addColorStop(0, ACCENT_GLOW);
  foil.addColorStop(0.5, "rgba(255,248,220,0.5)");
  foil.addColorStop(1, ACCENT_GLOW);
  fillRoundRect(ctx, bandX, bandY, bandW, bandH, 10, foil);
  strokeRoundRect(ctx, bandX, bandY, bandW, bandH, 10, "rgba(45,34,8,0.35)", 1);
  drawPlainText(ctx, "PAGAMENTO", cx, bandY + bandH / 2 - 8, { size: 22, color: "#5c4510", weight: "900" });
  drawPlainText(ctx, "Trasferimento Galeoni · Gringott", cx, bandY + bandH / 2 + 12, { size: 11, color: "#78350f", weight: "600" });
}

function drawCoinIcon(ctx, cx, cy) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  ctx.arc(0, 0, 34, 0, Math.PI * 2);
  ctx.fillStyle = "#fbbf24";
  ctx.fill();
  ctx.strokeStyle = "#b45309";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 22, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(180,83,9,0.55)";
  ctx.lineWidth = 2;
  ctx.stroke();
  drawPlainText(ctx, "G", 0, 1, { size: 28, color: "#78350f", weight: "900" });
  ctx.restore();
}

function drawTransferRow(ctx, cx, y, fromName, toName, maxW) {
  const from = fitPlainText(ctx, fromName, maxW * 0.38, 14, "800");
  const to = fitPlainText(ctx, toName, maxW * 0.38, 14, "800");
  drawPlainText(ctx, from, cx - 96, y, { size: 14, color: "#fde68a", weight: "800", align: "right" });
  drawPlainText(ctx, "→", cx, y, { size: 18, color: ACCENT, weight: "900" });
  drawPlainText(ctx, to, cx + 96, y, { size: 14, color: "#86efac", weight: "800", align: "left" });
}

function drawBalanceRow(ctx, x, y, w, label, balance) {
  fillRoundRect(ctx, x, y, w, 44, 10, "rgba(0,0,0,0.42)");
  drawPlainText(ctx, label, x + 14, y + 14, { size: 11, color: "#94a3b8", weight: "700", align: "left" });
  drawPlainText(ctx, formatGaleoniShort(balance), x + w - 14, y + 30, { size: 14, color: "#e2e8f0", weight: "800", align: "right" });
}

function drawArena(ctx, params) {
  const width = params.width;
  const height = params.height;
  const cx = Math.floor(width / 2);
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
  fillRoundRect(ctx, fx, fy, fw, fh, 18, "rgba(0,0,0,0.3)");
  strokeRoundRect(ctx, fx, fy, fw, fh, 18, ACCENT, 2);
  drawHeaderBand(ctx, cx, fx + 14, fw - 28, fy + 10, 44);
  drawCoinIcon(ctx, cx, fy + 108);
  let amountSize = 36;
  const amountStr = formatGaleoniShort(params.amount);
  while (amountSize > 22 && measurePlain(ctx, amountStr, amountSize, "900") > fw - 48) amountSize -= 2;
  drawPlainText(ctx, amountStr, cx, fy + 168, { size: amountSize, color: "#4ade80", weight: "900" });
  drawPlainText(ctx, "Inviato con successo", cx, fy + 198, { size: 12, color: "#86efac", weight: "600" });
  drawTransferRow(ctx, cx, fy + 232, params.senderName, params.recipientName, fw - 48);
  const rowW = Math.floor((fw - 48) / 2);
  const rowY = fy + fh - 72;
  drawBalanceRow(ctx, fx + 16, rowY, rowW, "Saldo mittente", params.senderBalance);
  drawBalanceRow(ctx, fx + fw - rowW - 16, rowY, rowW, "Saldo destinatario", params.recipientBalance);
  fillRoundRect(ctx, fx + 14, fy + fh - 28, fw - 28, 22, 8, "rgba(0,0,0,0.45)");
  drawPlainText(ctx, "Gringott", fx + 28, fy + fh - 17, { size: 12, color: "#94a3b8", weight: "700", align: "left" });
  drawPlainText(ctx, formatGaleoni(params.amount), fx + fw - 28, fy + fh - 17, { size: 12, color: "#4ade80", weight: "700", align: "right" });
}

async function renderPayCanvas(params = {}) {
  if (!canvasModule) throw new Error("Canvas module not available");
  ensureFonts();
  const width = 760;
  const height = 420;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  drawArena(ctx, {
    width,
    height,
    amount: Math.max(0, Math.floor(Number(params.amount) || 0)),
    senderName: sanitizeCanvasDisplayName(params.senderName || "Mittente", 20, "Mittente"),
    recipientName: sanitizeCanvasDisplayName(params.recipientName || "Destinatario", 20, "Destinatario"),
    senderBalance: Math.max(0, Math.floor(Number(params.senderBalance) || 0)),
    recipientBalance: Math.max(0, Math.floor(Number(params.recipientBalance) || 0)),
  });
  return { buffer: canvas.toBuffer("image/png"), format: "png" };
}

renderPayCanvas.warmup = function warmup() {
  if (!canvasModule) return;
  ensureFonts();
  try {
    renderPayCanvas({ amount: 50, senderName: "Harry", recipientName: "Ron", senderBalance: 120, recipientBalance: 80 });
  } catch (_) {}
};

module.exports = renderPayCanvas;