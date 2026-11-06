const canvasModule = require("canvas") as typeof import("canvas");
const { formatGaleoni } = require("../../Services/Community/gringottService") as typeof import("../../Services/Community/gringottService");
const { registerCanvasFonts, drawTextWithSpecialFallback } = require("./canvasFonts") as typeof import("./canvasFonts");
const { handValue, SUIT_SYMBOL } = require("../Economy/blackjackEngine") as typeof import("../Economy/blackjackEngine");
const { createCanvas } = canvasModule;
let fontsReady = false;

function ensureFonts() {
  if (fontsReady) return;
  registerCanvasFonts(canvasModule);
  fontsReady = true;
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
  const weight = opts.weight || "700";
  ctx.font = `${weight} ${size}px Arial, Helvetica, sans-serif`;
  ctx.fillStyle = opts.color || "#ffffff";
  ctx.textAlign = opts.align || "center";
  ctx.textBaseline = opts.baseline || "middle";
  ctx.fillText(String(text ?? ""), x, y);
  ctx.restore();
}

function cardInkColor(suit?) {
  return suit === "hearts" || suit === "diamonds" ? "#b91c1c" : "#0f172a";
}

function drawBg(ctx?, width?, height?) {
  try {
    const { drawStarWarsBg, SW } = require("./starWarsEconomyTheme") as typeof import("./starWarsEconomyTheme");
    drawStarWarsBg(ctx, width, height, {
      pad: 36,
      radius: 28,
      panelFill: "rgba(8,15,32,0.55)",
      panelStroke: SW.panelStroke,
    });
    return;
  } catch (_) {}
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#020617");
  bg.addColorStop(0.5, "#0b1224");
  bg.addColorStop(1, "#111827");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  fillRoundRect(ctx, 36, 56, width - 72, height - 76, 28, "rgba(0,0,0,0.22)");
  strokeRoundRect(ctx, 36, 56, width - 72, height - 76, 28, "rgba(255,232,31,0.35)", 2);
}

function drawCardBack(ctx?, x?, y?) {
  const w = 72;
  const h = 100;
  fillRoundRect(ctx, x, y, w, h, 10, "#1a2744");
  strokeRoundRect(ctx, x, y, w, h, 10, "#d4af37", 2);
  fillRoundRect(ctx, x + 10, y + 12, w - 20, h - 24, 8, "rgba(212,175,55,0.15)");
  drawText(ctx, "VC", x + w / 2, y + h / 2, { size: 22, color: "#d4af37", weight: "900" });
}

function drawCard(ctx?, x?, y?, card?, hidden = false) {
  const w = 72;
  const h = 100;
  if (hidden || !card) {
    drawCardBack(ctx, x, y);
    return;
  }
  fillRoundRect(ctx, x, y, w, h, 10, "#fffef8");
  strokeRoundRect(ctx, x, y, w, h, 10, "#d4af37", 3);
  const rank = String(card?.rank || "?");
  const suit = String(card?.suit || "spades");
  const ink = cardInkColor(suit);
  const sym = SUIT_SYMBOL[suit] || "♠";
  const wideRank = rank.length > 1;
  const pad = 9;
  const cornerRankSize = wideRank ? 11 : 13;
  const cornerSuitSize = wideRank ? 12 : 13;
  const centerRankSize = wideRank ? 22 : 30;
  const centerSuitSize = wideRank ? 24 : 28;
  const centerRankY = y + (wideRank ? 46 : 28);
  const centerSuitY = y + (wideRank ? 70 : 62);
  drawPlainText(ctx, rank, x + pad, y + pad, {
    size: cornerRankSize,
    color: ink,
    weight: "800",
    align: "left",
    baseline: "top",
  });
  drawPlainText(ctx, sym, x + pad, y + pad + cornerRankSize + 1, {
    size: cornerSuitSize,
    color: ink,
    weight: "700",
    align: "left",
    baseline: "top",
  });
  drawPlainText(ctx, rank, x + w / 2, centerRankY, { size: centerRankSize, color: ink, weight: "900" });
  drawPlainText(ctx, sym, x + w / 2, centerSuitY, { size: centerSuitSize, color: ink, weight: "700" });
  drawPlainText(ctx, sym, x + w - pad, y + h - pad, {
    size: cornerSuitSize,
    color: ink,
    weight: "700",
    align: "right",
    baseline: "bottom",
  });
  drawPlainText(ctx, rank, x + w - pad, y + h - pad - cornerSuitSize - 2, {
    size: cornerRankSize,
    color: ink,
    weight: "800",
    align: "right",
    baseline: "bottom",
  });
}

function drawHandRow(ctx?, cards?, startX?, y?, hideSecond?) {
  const list = Array.isArray(cards) ? cards : [];
  const gap = 18;
  const cardW = 72;
  if (!list.length) return;
  for (let i = 0; i < list.length; i += 1) {
    drawCard(ctx, startX + i * (cardW + gap), y, list[i], hideSecond && i === 1);
  }
}

function drawIdlePlaceholders(ctx?, startX?, y?) {
  drawCardBack(ctx, startX, y);
  drawCardBack(ctx, startX + 90, y);
}

function drawArena(ctx?, params?) {
  const width = params.width;
  const height = params.height;
  drawBg(ctx, width, height);
  drawText(ctx, "BLACKJACK", width / 2, 34, { size: 26, color: "#f8d875", weight: "900", forcePrimaryFont: true });
  const dealerY = 88;
  const playerY = 248;
  drawText(ctx, "Banco", 80, dealerY - 18, { size: 16, color: "#94a3b8", align: "left", weight: "700" });
  if ((params.dealerHand || []).length) {
    drawHandRow(ctx, params.dealerHand, 80, dealerY, Boolean(params.hideDealerHole));
  } else if (params.phase === "idle") {
    drawIdlePlaceholders(ctx, 80, dealerY);
  }
  const dVal = params.hideDealerHole && (params.dealerHand || []).length >= 2
    ? handValue([params.dealerHand[0]]).total
    : handValue(params.dealerHand).total;
  const dLabel = params.hideDealerHole ? `Valore: ${dVal}+` : `Valore: ${dVal}`;
  drawPlainText(ctx, dLabel, width - 44, dealerY + 42, { size: 18, color: "#f1f5f9", align: "right" });
  drawText(ctx, "Tu", 80, playerY - 18, { size: 16, color: "#94a3b8", align: "left", weight: "700" });
  if ((params.playerHand || []).length) {
    drawHandRow(ctx, params.playerHand, 80, playerY, false);
  } else if (params.phase === "idle") {
    drawIdlePlaceholders(ctx, 80, playerY);
  }
  const pVal = handValue(params.playerHand).total;
  drawPlainText(ctx, `Valore: ${pVal}`, width - 44, playerY + 42, { size: 18, color: "#f1f5f9", align: "right" });
  let status = "Distribuisci o regola la puntata";
  let statusColor = "#e2e8f0";
  if (params.phase === "playing") {
    status = "Carta o Stai — batti il banco";
    statusColor = "#f8d875";
  } else if (params.phase === "done" && params.resultLabel) {
    status = params.resultLabel;
    statusColor = params.win ? "#4ade80" : params.draw ? "#f8d875" : "#f87171";
  }
  const betLine = params.bet > 0
    ? `Puntata: ${formatGaleoni(params.bet)}${params.doubled ? " · x2" : ""}`
    : "";
  const infoY = playerY + 118;
  if (betLine) {
    drawPlainText(ctx, betLine, 72, infoY, { size: 15, color: "#cbd5e1", align: "left", weight: "700" });
    drawText(ctx, status, width - 72, infoY, { size: 16, color: statusColor, align: "right", forcePrimaryFont: true });
  } else {
    drawText(ctx, status, width / 2, infoY, { size: 16, color: statusColor, forcePrimaryFont: true });
  }
}

async function renderBlackjackCanvas(params: Record<string, any> = {}) {
  if (!canvasModule) throw new Error("Canvas module not available");
  ensureFonts();
  const width = 760;
  const height = 420;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  drawArena(ctx, {
    width,
    height,
    bet: Math.max(0, Math.floor(Number(params.bet) || 0)),
    doubled: Boolean(params.doubled),
    phase: String(params.phase || "idle"),
    playerHand: params.playerHand || [],
    dealerHand: params.dealerHand || [],
    hideDealerHole: Boolean(params.hideDealerHole),
    resultLabel: String(params.resultLabel || ""),
    win: Boolean(params.win),
    draw: Boolean(params.draw),
  });
  return { buffer: canvas.toBuffer("image/png"), format: "png" };
}

renderBlackjackCanvas.warmup = function warmup() {
  if (!canvasModule) return;
  ensureFonts();
  try {
    renderBlackjackCanvas({ phase: "idle", bet: 10 });
  } catch (_) {}
};

export = renderBlackjackCanvas;