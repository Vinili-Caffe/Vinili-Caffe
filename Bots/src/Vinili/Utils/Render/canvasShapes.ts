/** Immagini attività: forme di base (rettangoli arrotondati, sfondo, avatar, date). */
const { fitText, drawLabel } = require("./canvasText") as typeof import("./canvasText");
const { drawActivityGlyph } = require("./canvasIconGlyphs") as typeof import("./canvasIconGlyphs");

const STATS_BODY = "#c5d0db";
const STATS_VALUE = "#dce6ef";
const STATS_PANEL_GLYPH = "#c6d4e8";

function roundRectPath(ctx?, x?, y?, w?, h?, r = 16) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function fillRoundRect(ctx?, x?, y?, w?, h?, r?, color?) {
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = color;
  ctx.fill();
}

function strokeRoundRect(ctx?, x?, y?, w?, h?, r?, color?, width = 1) {
  roundRectPath(ctx, x, y, w, h, r);
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.stroke();
}

function drawPanelHeaderGlyph(ctx?, glyphKind?, rightX?, centerY?, pixel = 30, color = STATS_PANEL_GLYPH) {
  if (!glyphKind) return;
  const cx = rightX - pixel / 2;
  const haloR = pixel * 0.58;
  ctx.save();
  const glow = ctx.createRadialGradient(cx, centerY, 0, cx, centerY, haloR);
  glow.addColorStop(0, "rgba(160, 188, 220, 0.22)");
  glow.addColorStop(0.55, "rgba(120, 150, 190, 0.08)");
  glow.addColorStop(1, "rgba(120, 150, 190, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, centerY, haloR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  drawActivityGlyph(ctx, glyphKind, cx, centerY, pixel, color);
}

function drawBackground(ctx?, width?, height?) {
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#111722");
  bg.addColorStop(0.55, "#171f2b");
  bg.addColorStop(1, "#121924");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const glowA = ctx.createRadialGradient(180, 80, 10, 180, 80, 260);
  glowA.addColorStop(0, "rgba(88, 136, 255, 0.28)");
  glowA.addColorStop(1, "rgba(88, 136, 255, 0)");
  ctx.fillStyle = glowA;
  ctx.fillRect(0, 0, width, height);

  const glowB = ctx.createRadialGradient(width - 110, height - 120, 20, width - 110, height - 120, 300,);
  glowB.addColorStop(0, "rgba(62, 196, 85, 0.16)");
  glowB.addColorStop(1, "rgba(62, 196, 85, 0)");
  ctx.fillStyle = glowB;
  ctx.fillRect(0, 0, width, height);
}

function strokeAvatarRing(ctx?, x?, y?, size?, animationPhase?) {
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.78)";
  ctx.stroke();
  if (typeof animationPhase === "number" && Number.isFinite(animationPhase)) {
    const pulse = 0.4 + 0.55 * Math.sin(animationPhase * Math.PI * 2);
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2 + 2.5, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(120, 170, 230, ${0.2 + pulse * 0.45})`;
    ctx.lineWidth = 2.2;
    ctx.stroke();
  }
}

function drawImageCover(ctx?, img?, dx?, dy?, dSize?) {
  const iw = img.width || img.naturalWidth;
  const ih = img.height || img.naturalHeight;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (!iw || !ih) {
    ctx.drawImage(img, dx, dy, dSize, dSize);
    return;
  }
  const scale = Math.max(dSize / iw, dSize / ih);
  const sw = dSize / scale;
  const sh = dSize / scale;
  const sx = Math.max(0, (iw - sw) / 2);
  const sy = Math.max(0, (ih - sh) / 2);
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dSize, dSize);
}

function drawDateBadge(ctx?, title?, value?, x?, y?, w = 280, h = 80) {
  fillRoundRect(ctx, x, y, w, h, 14, "rgba(43, 52, 67, 0.92)");
  fillRoundRect(ctx, x + 10, y + 10, w - 20, 24, 9, "rgba(88, 99, 120, 0.62)");
  drawLabel(ctx, title, x + 18, y + 22, {
    size: 15,
    weight: "700",
    color: "#e0e5ee",
    forcePrimaryFont: true,
  });
  drawLabel(ctx, fitText(ctx, value, w - 32, 21, "700"), x + 18, y + 55, {
    size: 21,
    weight: "700",
    color: "#f2f5fa",
    useNumericFont: true,
  });
}

function drawDateBadgeCompact(ctx?, title?, value?, x?, y?, w?) {
  const h = 36;
  fillRoundRect(ctx, x, y, w, h, 11, "rgba(43, 52, 67, 0.95)");
  fillRoundRect(ctx, x + 8, y + 5, w - 16, 15, 6, "rgba(88, 99, 120, 0.62)");
  drawLabel(ctx, title, x + 12, y + 14, {
    size: 11,
    weight: "700",
    color: "#e8ecf4",
    forcePrimaryFont: true,
  });
  drawLabel(ctx, fitText(ctx, value, w - 24, 16, "700"), x + 12, y + 27, {
    size: 15,
    weight: "700",
    color: "#f6f8fc",
    useNumericFont: true,
  });
}

function drawDateBadgeStat(ctx?, title?, value?, x?, y?, w?, options: Record<string, any> = {}) {
  const h = options.h ?? 54;
  const pillH = options.pillH ?? 20;
  const padX = options.padX ?? 10;
  const padY = options.padY ?? 8;
  const pillRx = options.pillRx ?? 8;
  const outerRx = options.outerRx ?? 13;
  const titleSize = options.titleSize ?? 14;
  const valueSize = options.valueSize ?? 20;
  const titleY = options.titleY ?? 20;
  const valueY = options.valueY ?? 40;
  const labelPadX = options.labelPadX ?? 16;
  fillRoundRect(ctx, x, y, w, h, outerRx, "rgba(43, 52, 67, 0.95)");
  fillRoundRect(ctx, x + padX, y + padY, w - padX * 2, pillH, pillRx, "rgba(88, 99, 120, 0.55)");
  drawLabel(ctx, title, x + labelPadX, y + titleY, {
    size: titleSize,
    weight: "700",
    color: STATS_BODY,
    forcePrimaryFont: true,
  });
  drawLabel(ctx, fitText(ctx, value, w - labelPadX * 2, valueSize, "700"), x + labelPadX, y + valueY, {
    size: valueSize,
    weight: "700",
    color: STATS_VALUE,
    useNumericFont: true,
  });
}

export = { STATS_BODY, STATS_VALUE, STATS_PANEL_GLYPH, fillRoundRect, strokeRoundRect, drawPanelHeaderGlyph, drawBackground, strokeAvatarRing, drawImageCover, drawDateBadgeStat };
