const canvasModule = require("canvas");
const { formatDuration } = require("../../Services/Community/galeoniEconomyService");
const { registerCanvasFonts } = require("./canvasFonts");
const { createCanvas } = canvasModule;

const TYPE_META = {
  daily: { title: "GIORNALIERA", sub: "Ricompensa giornaliera", accent: "#fbbf24", glow: "rgba(251,191,36,0.4)", label: "Giornaliera" },
  weekly: { title: "SETTIMANALE", sub: "Ricompensa settimanale", accent: "#60a5fa", glow: "rgba(96,165,250,0.4)", label: "Settimanale" },
  monthly: { title: "MENSILE", sub: "Ricompensa mensile", accent: "#c084fc", glow: "rgba(192,132,252,0.4)", label: "Mensile" },
};
let fontsReady = false;

function ensureFonts() {
  if (fontsReady) return;
  registerCanvasFonts(canvasModule);
  fontsReady = true;
}

function formatGaleoniShort(amount) {
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  return `${n} ${n === 1 ? "Galeone" : "Galeoni"}`;
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

function drawHeaderBand(ctx, cx, bandX, bandW, bandY, bandH, meta) {
  const foil = ctx.createLinearGradient(bandX, bandY, bandX + bandW, bandY + bandH);
  foil.addColorStop(0, meta.glow);
  foil.addColorStop(0.5, "rgba(255,248,220,0.5)");
  foil.addColorStop(1, meta.glow);
  fillRoundRect(ctx, bandX, bandY, bandW, bandH, 10, foil);
  strokeRoundRect(ctx, bandX, bandY, bandW, bandH, 10, "rgba(45,34,8,0.35)", 1);
  let titleSize = 20;
  while (titleSize > 12 && measurePlain(ctx, meta.title, titleSize, "900") > bandW - 20) titleSize -= 1;
  drawPlainText(ctx, meta.title, cx, bandY + bandH / 2 - 7, { size: titleSize, color: "#5c4510", weight: "900" });
  drawPlainText(ctx, meta.sub, cx, bandY + bandH / 2 + 11, { size: 11, color: "#78350f", weight: "600" });
}

function drawThemeIcon(ctx, type, cx, cy, ready, claimed) {
  ctx.save();
  ctx.translate(cx, cy);
  const on = ready || claimed;
  if (type === "daily") {
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * Math.PI * 2;
      ctx.strokeStyle = on ? "rgba(251,191,36,0.45)" : "rgba(148,163,184,0.18)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 28, Math.sin(a) * 28);
      ctx.lineTo(Math.cos(a) * 44, Math.sin(a) * 44);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, Math.PI * 2);
    ctx.fillStyle = on ? "#fbbf24" : "#64748b";
    ctx.fill();
    ctx.strokeStyle = on ? "#b45309" : "#475569";
    ctx.lineWidth = 2;
    ctx.stroke();
  } else if (type === "weekly") {
    for (let i = 0; i < 7; i += 1) {
      const a = -Math.PI / 2 + (i / 7) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 38, Math.sin(a) * 38, 6, 0, Math.PI * 2);
      ctx.fillStyle = on ? "#60a5fa" : "#475569";
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fillStyle = on ? "#2563eb" : "#334155";
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(-12, 5, 20, 0, Math.PI * 2);
    ctx.fillStyle = on ? "#d8b4fe" : "#64748b";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(14, 7, 15, 0, Math.PI * 2);
    ctx.fillStyle = on ? "#a78bfa" : "#475569";
    ctx.fill();
    for (let i = 0; i < 4; i += 1) {
      ctx.fillStyle = "#fef9c3";
      ctx.beginPath();
      ctx.arc(-22 + i * 14, -22, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawStreakBlock(ctx, cx, topY, maxShow, count, accent) {
  const barW = Math.min(340, 24 + maxShow * 30);
  const x = cx - barW / 2;
  drawPlainText(ctx, `Streak x${Math.max(1, count)}`, cx, topY, { size: 12, color: "#cbd5e1", weight: "800" });
  const barY = topY + 16;
  const barH = 20;
  fillRoundRect(ctx, x, barY, barW, barH, 8, "rgba(0,0,0,0.42)");
  const gap = 4;
  const pad = 8;
  const inner = barW - pad * 2;
  const segW = Math.max(10, Math.floor((inner - gap * (maxShow - 1)) / maxShow));
  const slots = Math.min(maxShow, Math.max(1, count));
  for (let i = 0; i < maxShow; i += 1) {
    const dx = x + pad + i * (segW + gap);
    fillRoundRect(ctx, dx, barY + 4, segW, barH - 8, 4, i < slots ? accent : "rgba(51,65,85,0.9)");
  }
}

function drawInfoFooter(ctx, width, frameX, frameW, frameBottom, h, leftText, rightText, rightColor) {
  const padX = 14;
  const barX = frameX + padX;
  const barW = frameW - padX * 2;
  const barY = frameBottom - h - 10;
  fillRoundRect(ctx, barX, barY, barW, h, 12, "rgba(0,0,0,0.45)");
  const midY = barY + h / 2;
  const innerPad = 16;
  drawPlainText(ctx, leftText, barX + innerPad, midY, { size: 13, color: "#94a3b8", align: "left", weight: "700" });
  const maxRight = Math.floor(barW * 0.52);
  const fitted = fitPlainText(ctx, rightText, maxRight, 13, "700");
  drawPlainText(ctx, fitted, barX + barW - innerPad, midY, { size: 13, color: rightColor, align: "right", weight: "700" });
}

function drawArena(ctx, params) {
  const width = params.width;
  const height = params.height;
  const incomeType = ["daily", "weekly", "monthly"].includes(params.incomeType) ? params.incomeType : "daily";
  const meta = TYPE_META[incomeType];
  const canClaim = Boolean(params.canClaim);
  const claimed = Boolean(params.claimed);
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
  const frameBottom = fy + fh;
  fillRoundRect(ctx, fx, fy, fw, fh, 18, "rgba(0,0,0,0.3)");
  strokeRoundRect(ctx, fx, fy, fw, fh, 18, meta.accent, 2);
  const bandH = 44;
  drawHeaderBand(ctx, cx, fx + 14, fw - 28, fy + 10, bandH, meta);
  const iconY = fy + 98;
  drawThemeIcon(ctx, incomeType, cx, iconY, canClaim || claimed, claimed);
  const amount = claimed ? params.claimedAmount : params.totalPreview;
  const amountY = fy + 158;
  let amountSize = 34;
  const amountStr = formatGaleoniShort(amount);
  while (amountSize > 22 && measurePlain(ctx, amountStr, amountSize, "900") > fw - 48) amountSize -= 2;
  drawPlainText(ctx, amountStr, cx, amountY, { size: amountSize, color: claimed ? "#4ade80" : meta.accent, weight: "900" });
  const subY = amountY + 28;
  if (claimed) {
    drawPlainText(ctx, "Accreditato sul saldo", cx, subY, { size: 12, color: "#86efac" });
  } else if (params.bonusAmount > 0) {
    drawPlainText(ctx, `Base ${formatGaleoniShort(params.baseReward)} + ${formatGaleoniShort(params.bonusAmount)} bonus`, cx, subY, { size: 12, color: "#94a3b8" });
  } else {
    drawPlainText(ctx, `Ricompensa base ${formatGaleoniShort(params.baseReward)}`, cx, subY, { size: 12, color: "#94a3b8" });
  }
  const maxStreak = incomeType === "monthly" ? 8 : incomeType === "weekly" ? 7 : 5;
  drawStreakBlock(ctx, cx, fy + 198, maxStreak, params.streakCount || 1, meta.accent);
  let statusRight = "Pronto";
  let statusColor = "#4ade80";
  if (claimed) {
    statusRight = `+${formatGaleoniShort(params.claimedAmount)}`;
    statusColor = "#4ade80";
  } else if (!canClaim) {
    statusRight = `Tra ${formatDuration(params.remainingMs)}`;
    statusColor = "#fca5a5";
  }
  drawInfoFooter(ctx, width, fx, fw, frameBottom, 38, meta.label, statusRight, statusColor);
}

async function renderIncomeRewardCanvas(params = {}) {
  if (!canvasModule) throw new Error("Canvas module not available");
  ensureFonts();
  const width = 760;
  const height = 420;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  drawArena(ctx, {
    width,
    height,
    incomeType: ["daily", "weekly", "monthly"].includes(params.incomeType) ? params.incomeType : "daily",
    canClaim: Boolean(params.canClaim),
    claimed: Boolean(params.claimed),
    remainingMs: Math.max(0, Number(params.remainingMs) || 0),
    baseReward: Math.max(0, Math.floor(Number(params.baseReward) || 0)),
    bonusAmount: Math.max(0, Math.floor(Number(params.bonusAmount) || 0)),
    totalPreview: Math.max(0, Math.floor(Number(params.totalPreview) || 0)),
    claimedAmount: Math.max(0, Math.floor(Number(params.claimedAmount) || 0)),
    streakCount: Math.max(1, Math.floor(Number(params.streakCount) || 1)),
  });
  return { buffer: canvas.toBuffer("image/png"), format: "png" };
}

renderIncomeRewardCanvas.warmup = function warmup() {
  if (!canvasModule) return;
  ensureFonts();
  try {
    renderIncomeRewardCanvas({ incomeType: "weekly", canClaim: true, baseReward: 250, totalPreview: 250, streakCount: 1 });
  } catch (_) {}
};

module.exports = renderIncomeRewardCanvas;