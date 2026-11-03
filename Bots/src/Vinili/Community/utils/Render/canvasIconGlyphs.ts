const canvasModule = require("canvas") as typeof import("canvas");

let path2dCtorMemo;
function getPath2DConstructor() {
  if (path2dCtorMemo !== undefined) return path2dCtorMemo;
  const candidates = [(canvasModule as any).Path2D, typeof globalThis !== "undefined" ? globalThis.Path2D : null];
  for (const Ctor of candidates) {
    if (typeof Ctor !== "function") continue;
    try {
      const probe = new Ctor("M0 0 L1 0 L1 1 Z");
      if (probe) {
        path2dCtorMemo = Ctor;
        return Ctor;
      }
    } catch {
          }
  }
  path2dCtorMemo = null;
  return null;
}

function fillPath2D(ctx?, d?) {
  const Ctor = getPath2DConstructor();
  if (!Ctor) return false;
  try {
    ctx.fill(new Ctor(d));
    return true;
  } catch {
    return false;
  }
}

function strokePath2D(ctx?, d?, lineWidth?) {
  const Ctor = getPath2DConstructor();
  if (!Ctor) return false;
  try {
    ctx.lineWidth = lineWidth;
    ctx.stroke(new Ctor(d));
    return true;
  } catch {
    return false;
  }
}

function drawStatIconGeometric(ctx?, icon?) {
  if (icon === "bolt") {
    ctx.beginPath();
    ctx.moveTo(19, 1);
    ctx.lineTo(8, 16);
    ctx.lineTo(15, 16);
    ctx.lineTo(12, 31);
    ctx.lineTo(24, 14);
    ctx.lineTo(17, 14);
    ctx.closePath();
    ctx.fill();
    return;
  }
  if (icon === "star") {
    const cx = 16;
    const cy = 16;
    const spikes = 5;
    const outer = 9;
    const inner = 4;
    const step = Math.PI / spikes;
    let rot = -Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(rot) * outer, cy + Math.sin(rot) * outer);
    for (let i = 0; i < spikes; i++) {
      rot += step;
      ctx.lineTo(cx + Math.cos(rot) * inner, cy + Math.sin(rot) * inner);
      rot += step;
      ctx.lineTo(cx + Math.cos(rot) * outer, cy + Math.sin(rot) * outer);
    }
    ctx.closePath();
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(8, 10);
  ctx.quadraticCurveTo(16, 5, 24, 10);
  ctx.lineTo(22, 19);
  ctx.quadraticCurveTo(16, 26, 10, 19);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  ctx.moveTo(6, 8);
  ctx.quadraticCurveTo(6, 6, 9, 7);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(26, 8);
  ctx.quadraticCurveTo(26, 6, 23, 7);
  ctx.stroke();
  ctx.fillRect(14, 20, 4, 6);
  ctx.fillRect(8, 26, 16, 3.6);
}

function fillRoundTopBar(ctx?, x?, bottomY?, w?, h?, rTop?) {
  const y = bottomY - h;
  const rt = Math.min(rTop, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x, bottomY);
  ctx.lineTo(x, y + rt);
  ctx.quadraticCurveTo(x, y, x + rt, y);
  ctx.lineTo(x + w - rt, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rt);
  ctx.lineTo(x + w, bottomY);
  ctx.closePath();
  ctx.fill();
}

function drawRankStyleStatIcon(ctx?, icon?) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  let useVectors = false;
  if (icon === "trophy") {
    useVectors =
      fillPath2D(ctx, "M8 6h16l-2 10c-1.2 3-4.1 5-6 5s-4.8-2-6-5L8 6Z") &&
      strokePath2D(ctx, "M6 8c-2.9.4-4.8 2-4.8 4.7 0 3.4 2.8 5.8 6.7 5.8M26 8c2.9.4 4.8 2 4.8 4.7 0 3.4-2.8 5.8-6.7 5.8", 3.2) &&
      fillPath2D(ctx, "M14 20h4v6h-4z") &&
      fillPath2D(ctx, "M8 26h16v3.6H8z");
  } else if (icon === "bolt") {
    useVectors = fillPath2D(ctx, "M19 1 8 16h7l-3 15 12-17h-7l2-13Z");
  } else if (icon === "star") {
    useVectors = fillPath2D(ctx, "m16 2 3.8 8 8.7 1-6.5 5.7 1.8 8.5L16 21l-7.8 5.2 1.8-8.5L3.5 11l8.7-1L16 2Z");
  }
  if (!useVectors) drawStatIconGeometric(ctx, icon);
}

function drawExtraGlyph(ctx?, kind?) {
  if (kind === "message") {
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    const bubble =
      "M7.5 7h17c1.1 0 2 .9 2 2v9.5c0 1.1-.9 2-2 2h-8.5l-5.2 4.3V20.5H7.5c-1.1 0-2-.9-2-2V9c0-1.1.9-2 2-2z";
    fillPath2D(ctx, bubble);
    ctx.strokeStyle = "rgba(255,255,255,0.32)";
    ctx.lineWidth = 2;
    strokePath2D(ctx, bubble, 2);
    ctx.strokeStyle = "rgba(255,255,255,0.58)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(11.5, 12.5);
    ctx.lineTo(23.5, 12.5);
    ctx.moveTo(11.5, 17);
    ctx.lineTo(20.5, 17);
    ctx.stroke();
    return;
  }
  if (kind === "voice") {
    const base = 24.5;
    const r = 2.8;
    fillRoundTopBar(ctx, 6.5, base, 6.5, 9, r);
    fillRoundTopBar(ctx, 12.75, base, 6.5, 15.5, r);
    fillRoundTopBar(ctx, 19, base, 6.5, 11.5, r);
    return;
  }
  if (kind === "users") {
    ctx.globalAlpha = 0.82;
    ctx.beginPath();
    ctx.arc(9.5, 12.5, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(22.5, 12.5, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(16, 11.5, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(5, 27.5);
    ctx.quadraticCurveTo(16, 20.5, 27, 27.5);
    ctx.lineTo(27, 28.5);
    ctx.lineTo(5, 28.5);
    ctx.closePath();
    ctx.fill();
    return;
  }
  if (kind === "chart") {
    const base = 25;
    const r = 2.5;
    fillRoundTopBar(ctx, 5.5, base, 6.5, 9, r);
    fillRoundTopBar(ctx, 12.75, base, 6.5, 15, r);
    fillRoundTopBar(ctx, 20, base, 6.5, 19, r);
    return;
  }
  if (kind === "hash") {
    ctx.lineWidth = 3.6;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(11.5, 5.5);
    ctx.lineTo(8, 26.5);
    ctx.moveTo(21.5, 5.5);
    ctx.lineTo(18, 26.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(5.5, 12.5);
    ctx.lineTo(26.5, 16.5);
    ctx.moveTo(4.5, 18.5);
    ctx.lineTo(25.5, 22.5);
    ctx.stroke();
  }
}

function drawActivityGlyph(ctx?, kind?, cx?, cy?, pixelSize?, color?) {
  const k = String(kind || "").toLowerCase();
  const scale = Math.max(8, Number(pixelSize) || 24) / 32;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-16, -16);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  if (["bolt", "star", "trophy"].includes(k)) {
    drawRankStyleStatIcon(ctx, k);
  } else {
    drawExtraGlyph(ctx, k);
  }
  ctx.restore();
}

export = { drawActivityGlyph };