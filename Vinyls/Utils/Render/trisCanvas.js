const canvasModule = require("canvas");
const { formatGaleoni } = require("../../Services/Community/gringottService");
const { registerCanvasFonts, drawTextWithSpecialFallback } = require("./canvasFonts");
const { sanitizeCanvasDisplayName, normalizeTextForCanvas } = require("./canvasUtils");
const { BOT, PLAYER, cellLabel } = require("../Economy/trisEngine");
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

function truncateChars(name, max = 16) {
  return sanitizeCanvasDisplayName(name, max, "—");
}

function fitPlainText(ctx, text, maxWidth, size = 14, weight = "700") {
  const raw = String(text || "");
  if (!raw) return "";
  ctx.save();
  ctx.font = `${weight} ${Math.max(10, Math.floor(size))}px Arial, Helvetica, sans-serif`;
  if (ctx.measureText(raw).width <= maxWidth) {
    ctx.restore();
    return raw;
  }
  const ellipsis = "…";
  let out = raw;
  while (out.length > 1 && ctx.measureText(`${out}${ellipsis}`).width > maxWidth) {
    out = out.slice(0, -1);
  }
  ctx.restore();
  return `${out}${ellipsis}`;
}

const TRIS_WIDTH = 760;
const TRIS_HEIGHT = 500;
const TRIS_GAP = 10;
const TRIS_HEADER_BOTTOM = 92;
const TRIS_FOOTER_H = 58;
const TRIS_FOOTER_MARGIN = 18;
const TRIS_PANEL_PAD = 36;

function trisLayout(width, height) {
  const boardTop = TRIS_HEADER_BOTTOM + 10;
  const boardBottom = height - TRIS_FOOTER_H - TRIS_FOOTER_MARGIN;
  const boardH = boardBottom - boardTop;
  const boardW = width - TRIS_PANEL_PAD * 2 - 48;
  const cell = Math.floor(Math.min((boardW - TRIS_GAP * 2) / 3, (boardH - TRIS_GAP * 2) / 3));
  const gridW = cell * 3 + TRIS_GAP * 2;
  const gridH = gridW;
  return {
    cell,
    gap: TRIS_GAP,
    gridX: Math.floor((width - gridW) / 2),
    gridY: Math.floor(boardTop + (boardH - gridH) / 2),
    footerY: height - TRIS_FOOTER_H - TRIS_FOOTER_MARGIN,
    footerH: TRIS_FOOTER_H,
    panelY: 52,
    panelH: height - TRIS_FOOTER_MARGIN - 52,
  };
}

function drawBg(ctx, width, height, layout) {
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#0f172a");
  bg.addColorStop(0.5, "#1e293b");
  bg.addColorStop(1, "#0b1220");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  fillRoundRect(ctx, TRIS_PANEL_PAD, layout.panelY, width - TRIS_PANEL_PAD * 2, layout.panelH, 28, "rgba(0,0,0,0.24)");
  strokeRoundRect(ctx, TRIS_PANEL_PAD, layout.panelY, width - TRIS_PANEL_PAD * 2, layout.panelH, 28, "rgba(212,175,55,0.35)", 2);
}

function drawBoard(ctx, board, layout) {
  const { cell, gap, gridX, gridY } = layout;
  const markSize = Math.max(52, Math.floor(cell * 0.58));
  const numSize = Math.max(18, Math.floor(cell * 0.2));
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const idx = row * 3 + col;
      const x = gridX + col * (cell + gap);
      const y = gridY + row * (cell + gap);
      const mark = board[idx];
      fillRoundRect(ctx, x, y, cell, cell, 16, mark ? "rgba(255,255,255,0.95)" : "rgba(15,23,42,0.75)");
      strokeRoundRect(ctx, x, y, cell, cell, 16, mark === PLAYER ? "#38bdf8" : mark === BOT ? "#f87171" : "rgba(148,163,184,0.45)", mark ? 4 : 2);
      if (mark) {
        const color = mark === PLAYER ? "#0369a1" : "#b91c1c";
        drawPlainText(ctx, cellLabel(mark), x + cell / 2, y + cell / 2, { size: markSize, color, weight: "900" });
      } else {
        drawPlainText(ctx, String(idx + 1), x + cell / 2, y + cell / 2, { size: numSize, color: "#64748b", weight: "700" });
      }
    }
  }
}

function drawArena(ctx, params) {
  const width = params.width;
  const height = params.height;
  const layout = trisLayout(width, height);
  const board = Array.isArray(params.board) ? params.board : Array(9).fill("");
  drawBg(ctx, width, height, layout);
  drawText(ctx, "TRIS", width / 2, 34, { size: 26, color: "#f8d875", weight: "900", forcePrimaryFont: true });
  const subtitleMax = width - 96;
  let subtitle = "Tu = X  ·  Bot = O";
  if (params.isPvp) {
    const nameBudget = Math.floor(subtitleMax / 2) - 48;
    const p1 = fitPlainText(ctx, truncateChars(params.playerName || "X", 18), nameBudget, 14, "700");
    const p2 = fitPlainText(ctx, truncateChars(params.opponentName || "O", 18), nameBudget, 14, "700");
    subtitle = `${p1} = X  ·  ${p2} = O`;
    if (params.phase === "playing" && params.turnName) {
      const turn = fitPlainText(ctx, truncateChars(params.turnName, 14), 120, 14, "700");
      subtitle = fitPlainText(ctx, `${subtitle}  ·  Turno: ${turn}`, subtitleMax, 14, "700");
    } else {
      subtitle = fitPlainText(ctx, subtitle, subtitleMax, 14, "700");
    }
  }
  drawPlainText(ctx, subtitle, width / 2, 78, { size: 14, color: "#94a3b8", weight: "700" });
  drawBoard(ctx, board, layout);
  let footer = "Premi Inizia per giocare";
  let footerColor = "#e2e8f0";
    const status = String(params.statusLine || "").trim();
  const statusIsInviteNoise =
    /sfida|accetta o rifiuta|Galeoni|@\d{5,}/i.test(status) || status.length > 42;
  if (status && !statusIsInviteNoise) {
    footer = status;
    footerColor = "#e2e8f0";
  } else if (params.phase === "pending") {
    footer = params.bet > 0
      ? `Sfida PvP · ${formatGaleoni(params.bet)} ciascuno · Accetta o rifiuta`
      : "Accetta o rifiuta la sfida";
    footerColor = "#f8d875";
  } else if (params.phase === "playing") {
    footer = "Tocca una casella libera";
    footerColor = "#f8d875";
  } else if (params.phase === "done" && params.resultLabel) {
    footer = params.resultLabel;
    footerColor = params.win ? "#4ade80" : params.draw ? "#f8d875" : "#f87171";
  }
  const betLine = params.bet > 0 ? `Puntata: ${formatGaleoni(params.bet)}` : "";
  const footerH = layout.footerH;
  const footerY = layout.footerY;
  const footerInnerW = width - 120;
  fillRoundRect(ctx, 48, footerY, width - 96, footerH, 16, "rgba(0,0,0,0.45)");
  const footerMid = footerY + footerH / 2;
  const footerDraw = fitPlainText(ctx, footer.replace(/\*\*/g, ""), footerInnerW, 17, "700");
  if (betLine) {
    drawPlainText(ctx, betLine, width / 2, footerMid - 12, { size: 14, color: "#cbd5e1" });
    drawText(ctx, footerDraw, width / 2, footerMid + 12, { size: 17, color: footerColor, forcePrimaryFont: true });
  } else {
    drawText(ctx, footerDraw, width / 2, footerMid, { size: 17, color: footerColor, forcePrimaryFont: true });
  }
}

async function renderTrisCanvas(params = {}) {
  if (!canvasModule) throw new Error("Canvas module not available");
  ensureFonts();
  const width = TRIS_WIDTH;
  const height = TRIS_HEIGHT;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  drawArena(ctx, {
    width,
    height,
    board: params.board || [],
    bet: Math.max(0, Math.floor(Number(params.bet) || 0)),
    phase: String(params.phase || "idle"),
    resultLabel: String(params.resultLabel || ""),
    win: Boolean(params.win),
    draw: Boolean(params.draw),
    isPvp: Boolean(params.isPvp),
    playerName: sanitizeCanvasDisplayName(params.playerName || "", 0, "X"),
    opponentName: sanitizeCanvasDisplayName(params.opponentName || "", 0, "O"),
    turnName: sanitizeCanvasDisplayName(params.turnName || "", 0, ""),
    statusLine: normalizeTextForCanvas(String(params.statusLine || "").trim()),
  });
  return { buffer: canvas.toBuffer("image/png"), format: "png" };
}

renderTrisCanvas.warmup = function warmup() {
  if (!canvasModule) return;
  ensureFonts();
  try {
    renderTrisCanvas({ phase: "idle", bet: 10 });
  } catch (_) {}
};

module.exports = renderTrisCanvas;