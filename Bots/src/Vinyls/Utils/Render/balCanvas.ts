const canvasModule = require("canvas") as typeof import("canvas");
const { registerCanvasFonts } = require("./canvasFonts") as typeof import("./canvasFonts");
const { sanitizeCanvasDisplayName, normalizeTextForCanvas } = require("./canvasUtils") as typeof import("./canvasUtils");
const { createCanvas } = canvasModule;
let fontsReady = false;

function ensureFonts() {
  if (fontsReady) return;
  registerCanvasFonts(canvasModule);
  fontsReady = true;
}

function roundRect(ctx?, x?, y?, w?, h?, r?) {
  const width = Math.max(0, Number(w) || 0);
  const height = Math.max(0, Number(h) || 0);
  const rr = Math.max(0, Math.min(Number(r) || 0, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + width, y, x + width, y + height, rr);
  ctx.arcTo(x + width, y + height, x, y + height, rr);
  ctx.arcTo(x, y + height, x, y, rr);
  ctx.arcTo(x, y, x + width, y, rr);
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

function formatShort(amount?, label?) {
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  return `${n} ${label}`;
}

function drawCurrencyCard(ctx?, x?, y?, w?, h?, opts: Record<string, any> = {}) {
  const accent = opts.accent || "#a855f7";
  const emoji = opts.emoji || "💿";
  const title = opts.title || "Vinili";
  const balance = Math.max(0, Math.floor(Number(opts.balance) || 0));
  const earned = Math.max(0, Math.floor(Number(opts.earned) || 0));
  const spent = Math.max(0, Math.floor(Number(opts.spent) || 0));
  const balanceLabel = opts.balanceLabel || title;
  fillRoundRect(ctx, x, y, w, h, 14, "rgba(0,0,0,0.38)");
  strokeRoundRect(ctx, x, y, w, h, 14, accent, 2);
  drawPlainText(ctx, `${emoji} ${title}`, x + w / 2, y + 22, { size: 14, color: accent, weight: "800" });
  const balanceStr = formatShort(balance, balanceLabel);
  let balSize = opts.largeBalance ? 36 : 28;
  const minBalSize = opts.largeBalance ? 22 : 18;
  while (balSize > minBalSize && measurePlain(ctx, balanceStr, balSize, "900") > w - 24) balSize -= 2;
  drawPlainText(ctx, balanceStr, x + w / 2, y + (opts.largeBalance ? 72 : 58), { size: balSize, color: "#f8fafc", weight: "900" });
  drawPlainText(ctx, opts.subtitle || "Saldo", x + w / 2, y + (opts.largeBalance ? 102 : 82), { size: 11, color: "#94a3b8", weight: "600" });
  const pillW = Math.floor((w - 20) / 2);
  const pillY = y + h - 54;
  const pillH = 40;
  fillRoundRect(ctx, x + 8, pillY, pillW, pillH, 8, "rgba(0,0,0,0.35)");
  strokeRoundRect(ctx, x + 8, pillY, pillW, pillH, 8, "#4ade80", 1);
  drawPlainText(ctx, "Guadagnati", x + 8 + pillW / 2, pillY + 12, { size: 10, color: "#94a3b8", weight: "700" });
  drawPlainText(ctx, String(earned), x + 8 + pillW / 2, pillY + pillH - 12, { size: 13, color: "#4ade80", weight: "800" });
  fillRoundRect(ctx, x + 12 + pillW, pillY, pillW, pillH, 8, "rgba(0,0,0,0.35)");
  strokeRoundRect(ctx, x + 12 + pillW, pillY, pillW, pillH, 8, "#f87171", 1);
  drawPlainText(ctx, "Spesi", x + 12 + pillW + pillW / 2, pillY + 12, { size: 10, color: "#94a3b8", weight: "700" });
  drawPlainText(ctx, String(spent), x + 12 + pillW + pillW / 2, pillY + pillH - 12, { size: 13, color: "#f87171", weight: "800" });
}

function drawFooterBar(ctx?, barX?, barY?, barW?, footerH?, left?, right?) {
  fillRoundRect(ctx, barX, barY, barW, footerH, 12, "rgba(0,0,0,0.45)");
  drawPlainText(ctx, left, barX + 16, barY + footerH / 2, { size: 13, color: "#94a3b8", align: "left", weight: "700" });
  const fittedRight = fitPlainText(ctx, right, Math.floor(barW * 0.48), 13, "700");
  drawPlainText(ctx, fittedRight, barX + barW - 16, barY + footerH / 2, { size: 13, color: "#d97706", align: "right", weight: "700" });
}

function drawGaleoniStrip(ctx?, barX?, stripY?, barW?, stripH?, galeoni?, hint?) {
  fillRoundRect(ctx, barX, stripY, barW, stripH, 12, "rgba(0,0,0,0.42)");
  strokeRoundRect(ctx, barX, stripY, barW, stripH, 12, "#fbbf24", 2);
  drawPlainText(ctx, "🪙 GRINGOTT · GALEONI", barX + 16, stripY + 16, { size: 12, color: "#fbbf24", align: "left", weight: "800" });
  drawPlainText(ctx, formatShort(galeoni.balance || 0, "Galeoni"), barX + barW - 16, stripY + 16, { size: 14, color: "#fef3c7", align: "right", weight: "900" });
  const line = String(hint || "").trim() || "Evento Hogwarts attivo";
  drawPlainText(ctx, fitPlainText(ctx, line, barW - 32, 11, "600"), barX + barW / 2, stripY + stripH - 14, { size: 11, color: "#cbd5e1", weight: "600" });
}

function drawArena(ctx?, params?) {
  const width = params.width;
  const height = params.height;
  const cx = Math.floor(width / 2);
  const galeoniOnly = Boolean(params.galeoniOnly);
  const showGaleoniBridge = Boolean(params.showGaleoni) && !galeoniOnly;
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
  strokeRoundRect(ctx, fx, fy, fw, fh, 18, galeoniOnly ? "#fbbf24" : "#6f4e37", 2);
  const bandH = 44;
  const bandX = fx + 14;
  const bandW = fw - 28;
  const bandY = fy + 10;
  const foil = ctx.createLinearGradient(bandX, bandY, bandX + bandW, bandY + bandH);
  if (galeoniOnly) {
    foil.addColorStop(0, "rgba(251,191,36,0.22)");
    foil.addColorStop(0.5, "rgba(146,64,14,0.4)");
    foil.addColorStop(1, "rgba(251,191,36,0.22)");
  } else {
    foil.addColorStop(0, "rgba(168,85,247,0.25)");
    foil.addColorStop(0.5, "rgba(111,78,55,0.45)");
    foil.addColorStop(1, "rgba(168,85,247,0.25)");
  }
  fillRoundRect(ctx, bandX, bandY, bandW, bandH, 10, foil);
  strokeRoundRect(ctx, bandX, bandY, bandW, bandH, 10, "rgba(45,34,8,0.35)", 1);
  drawPlainText(ctx, galeoniOnly ? "GRINGOTT" : "VINILI & CAFFÈ", cx, bandY + bandH / 2 - 7, { size: 18, color: "#e2e8f0", weight: "900" });
  const sub = fitPlainText(ctx, sanitizeCanvasDisplayName(params.targetLabel || "Conto", 28, "Conto"), bandW - 20, 11, "600");
  drawPlainText(ctx, sub, cx, bandY + bandH / 2 + 11, { size: 11, color: "#cbd5e1", weight: "600" });

  const footerH = 36;
  const barX = fx + 14;
  const barW = fw - 28;
  const stripH = 54;
  const bottomPad = 10;
  const reservedBottom = galeoniOnly
    ? footerH + bottomPad + 12
    : footerH + bottomPad + (showGaleoniBridge ? stripH + 14 : 0);

  const cardGap = 16;
  const cardY = fy + bandH + 28;
  const cardAreaH = Math.max(120, fh - bandH - 28 - reservedBottom);
  const galeoni = params.galeoni || {};

  if (galeoniOnly) {
    const cardW = fw - 32;
    drawCurrencyCard(ctx, fx + 16, cardY, cardW, cardAreaH, {
      title: "Galeoni",
      emoji: "🪙",
      accent: "#fbbf24",
      balance: galeoni.balance,
      earned: galeoni.earned,
      spent: galeoni.spent,
      balanceLabel: "Galeoni",
      subtitle: "Saldo evento Hogwarts",
      largeBalance: true,
    });
    const barY = frameBottom - footerH - bottomPad;
    const left = "Evento Hogwarts";
    const right = params.noticeShort || "Galeoni d'Oro";
    drawFooterBar(ctx, barX, barY, barW, footerH, left, right);
    return;
  }

  const cardW = Math.floor((fw - cardGap - 32) / 2);
  const vinili = params.vinili || {};
  const caffe = params.caffe || {};
  drawCurrencyCard(ctx, fx + 16, cardY, cardW, cardAreaH, {
    title: "Vinili",
    emoji: "💿",
    accent: "#a855f7",
    balance: vinili.balance,
    earned: vinili.earned,
    spent: vinili.spent,
  });
  drawCurrencyCard(ctx, fx + 16 + cardW + cardGap, cardY, cardW, cardAreaH, {
    title: "Caffè",
    emoji: "☕",
    accent: "#d97706",
    balance: caffe.balance,
    earned: caffe.earned,
    spent: caffe.spent,
  });

  let barY = frameBottom - footerH - bottomPad;
  if (showGaleoniBridge) {
    const stripY = barY - stripH - 8;
    drawGaleoniStrip(ctx, barX, stripY, barW, stripH, galeoni, params.bridgeHint);
  }
  const left = params.staffMode ? "Gestione High Staff" : showGaleoniBridge ? "Economia server + Hogwarts" : "Economia server";
  const right = params.noticeShort || "Vinili & Caffè";
  drawFooterBar(ctx, barX, barY, barW, footerH, left, right);
}

async function renderBalCanvas(params: Record<string, any> = {}) {
  if (!canvasModule) throw new Error("Canvas module not available");
  ensureFonts();
  const galeoniOnly = Boolean(params.galeoniOnly);
  const width = 760;
  const height = galeoniOnly ? 420 : params.showGaleoni ? 520 : 420;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  drawArena(ctx, {
    width,
    height,
    targetLabel: sanitizeCanvasDisplayName(params.targetLabel || "Conto", 32, "Conto"),
    vinili: params.vinili || {},
    caffe: params.caffe || {},
    galeoni: params.galeoni || {},
    showGaleoni: Boolean(params.showGaleoni),
    galeoniOnly,
    bridgeHint: String(params.bridgeHint || "").trim(),
    staffMode: Boolean(params.staffMode),
    noticeShort: String(params.noticeShort || "Vinili & Caffè").trim() || "Vinili & Caffè",
  });
  return { buffer: canvas.toBuffer("image/png"), format: "png" };
}

renderBalCanvas.warmup = function warmup() {
  if (!canvasModule) return;
  ensureFonts();
  try {
    renderBalCanvas({
      targetLabel: "Utente",
      vinili: { balance: 12, earned: 20, spent: 8 },
      caffe: { balance: 8, earned: 15, spent: 7 },
      staffMode: true,
    });
    renderBalCanvas({
      targetLabel: "Utente",
      galeoniOnly: true,
      showGaleoni: true,
      galeoni: { balance: 999, earned: 1200, spent: 201 },
      noticeShort: "Galeoni d'Oro",
    });
  } catch (_) {}
};

export = renderBalCanvas;
