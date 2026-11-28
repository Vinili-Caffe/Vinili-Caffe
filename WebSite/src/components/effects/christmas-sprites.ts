/**
 * Sagome natalizie (viewBox 100×100) cacheate su canvas offscreen → drawImage a ogni frame.
 */

export type XmasKind = "snow" | "flake" | "ornament" | "star" | "spark";

const cache = new Map<string, HTMLCanvasElement>();

function paint(ctx: CanvasRenderingContext2D, kind: XmasKind) {
  /* neve vera: un puntino sfocato (come fuori fuoco), niente fiocco disegnato */
  if (kind === "snow") {
    const g = ctx.createRadialGradient(50, 50, 0, 50, 50, 50);
    g.addColorStop(0, "rgba(255,255,255,0.95)");
    g.addColorStop(0.35, "rgba(240,248,255,0.7)");
    g.addColorStop(1, "rgba(220,235,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(50, 50, 50, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (kind === "flake") {
    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.fillStyle = "rgba(230,245,255,0.55)";
    ctx.lineWidth = 3.2;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.moveTo(50, 50);
      ctx.lineTo(50 + Math.cos(a) * 38, 50 + Math.sin(a) * 38);
      const bx = 50 + Math.cos(a) * 22;
      const by = 50 + Math.sin(a) * 22;
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + Math.cos(a + 0.7) * 10, by + Math.sin(a + 0.7) * 10);
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + Math.cos(a - 0.7) * 10, by + Math.sin(a - 0.7) * 10);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(50, 50, 5, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (kind === "ornament") {
    const g = ctx.createRadialGradient(42, 38, 4, 50, 52, 40);
    g.addColorStop(0, "#ff6b6b");
    g.addColorStop(0.55, "#c41e3a");
    g.addColorStop(1, "#7a1024");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(50, 56, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d4af37";
    ctx.fillRect(42, 16, 16, 12);
    ctx.strokeStyle = "rgba(255,230,160,0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(50, 16, 7, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.beginPath();
    ctx.ellipse(38, 46, 8, 12, -0.4, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (kind === "star") {
    ctx.fillStyle = "#f5d76e";
    ctx.strokeStyle = "rgba(180,120,20,0.45)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      const b = a + Math.PI / 5;
      const ox = 50 + Math.cos(a) * 40;
      const oy = 50 + Math.sin(a) * 40;
      const ix = 50 + Math.cos(b) * 16;
      const iy = 50 + Math.sin(b) * 16;
      if (i === 0) ctx.moveTo(ox, oy);
      else ctx.lineTo(ox, oy);
      ctx.lineTo(ix, iy);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    return;
  }
  /* spark */
  const g = ctx.createRadialGradient(50, 50, 0, 50, 50, 40);
  g.addColorStop(0, "rgba(255,250,220,0.95)");
  g.addColorStop(0.4, "rgba(255,210,120,0.55)");
  g.addColorStop(1, "rgba(255,180,80,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(50, 50, 40, 0, Math.PI * 2);
  ctx.fill();
}

export function xmasSprite(kind: XmasKind, px: number, dpr: number): HTMLCanvasElement {
  const size = Math.max(8, Math.ceil(px * dpr));
  const key = `${kind}:${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (ctx) {
    ctx.scale(size / 100, size / 100);
    paint(ctx, kind);
  }
  cache.set(key, c);
  return c;
}
