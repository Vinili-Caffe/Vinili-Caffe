// @ts-nocheck
/* Tema grafico economia Star Wars (spazio + accenti giallo/ciano). */
"use strict";

const SW = Object.freeze({
  bg0: "#020617",
  bg1: "#0b1224",
  bg2: "#111827",
  accent: "#FFE81F",
  accentSoft: "rgba(255,232,31,0.35)",
  cyan: "#38bdf8",
  cyanSoft: "rgba(56,189,248,0.28)",
  panel: "rgba(8,15,32,0.72)",
  panelStroke: "rgba(255,232,31,0.38)",
  text: "#f8fafc",
  muted: "#94a3b8",
  win: "#4ade80",
  lose: "#f87171",
});

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

/** Sfondo spazio + stelle + pannello centrale. */
function drawStarWarsBg(ctx?, width?, height?, opts: Record<string, any> = {}) {
  const frame = Math.max(0, Math.floor(Number(opts.frameIndex) || 0));
  const pad = Number.isFinite(opts.pad) ? opts.pad : 28;
  const radius = Number.isFinite(opts.radius) ? opts.radius : 24;

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, SW.bg0);
  bg.addColorStop(0.45, SW.bg1);
  bg.addColorStop(1, SW.bg2);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  for (let i = 0; i < 42; i += 1) {
    const x = (i * 97 + frame * 5) % (width + 40) - 20;
    const y = 18 + ((i * 53 + frame * 3) % Math.max(40, height - 36));
    const bright = i % 5 === 0;
    ctx.globalAlpha = bright ? 0.55 : 0.22;
    ctx.fillStyle = bright ? SW.accent : "#ffffff";
    ctx.beginPath();
    ctx.arc(x, y, bright ? 2.2 : 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  const glow = ctx.createRadialGradient(width * 0.72, height * 0.18, 10, width * 0.72, height * 0.18, width * 0.55);
  glow.addColorStop(0, "rgba(56,189,248,0.16)");
  glow.addColorStop(1, "rgba(56,189,248,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  const glow2 = ctx.createRadialGradient(width * 0.2, height * 0.85, 8, width * 0.2, height * 0.85, width * 0.45);
  glow2.addColorStop(0, "rgba(255,232,31,0.1)");
  glow2.addColorStop(1, "rgba(255,232,31,0)");
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, width, height);

  if (opts.panel !== false) {
    fillRoundRect(ctx, pad, pad + 18, width - pad * 2, height - pad * 2 - 10, radius, opts.panelFill || SW.panel);
    strokeRoundRect(ctx, pad, pad + 18, width - pad * 2, height - pad * 2 - 10, radius, opts.panelStroke || SW.panelStroke, 2);
  }

  /* Linea “spada laser” in alto */
  const saberY = pad + 8;
  const saberGrad = ctx.createLinearGradient(pad, saberY, width - pad, saberY);
  saberGrad.addColorStop(0, "rgba(56,189,248,0)");
  saberGrad.addColorStop(0.2, SW.cyan);
  saberGrad.addColorStop(0.5, SW.accent);
  saberGrad.addColorStop(0.8, SW.cyan);
  saberGrad.addColorStop(1, "rgba(56,189,248,0)");
  ctx.save();
  ctx.strokeStyle = saberGrad;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(pad + 12, saberY);
  ctx.lineTo(width - pad - 12, saberY);
  ctx.stroke();
  ctx.restore();
}

export = {
  SW,
  drawStarWarsBg,
  fillRoundRect,
  strokeRoundRect,
};
