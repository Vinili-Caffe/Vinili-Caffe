/**
 * Sagome di Halloween (viewBox 100×100) disegnate UNA volta su un canvas fuori schermo e poi copiate
 * con drawImage a ogni frame: bordi puliti e niente ricalcolo di tracciati/ombre per ogni particella.
 */

export type HwKind = "bat" | "leaf" | "candy" | "ghost" | "spider" | "spark";

const BAT =
  "M50 40 C48 34 46 31 43 30 C44 33 44 36 42 38 C37 33 27 29 13 31 C19 35 22 41 20 47 C26 43 31 44 34 49 C36 45 40 45 43 48 C45 51 47 54 50 58 C53 54 55 51 57 48 C60 45 64 45 66 49 C69 44 74 43 80 47 C78 41 81 35 87 31 C73 29 63 33 58 38 C56 36 56 33 57 30 C54 31 52 34 50 40 Z";
const GHOST =
  "M50 10 C30 10 21 26 21 46 L21 86 C25 81 29 81 33 87 C37 81 41 81 45 87 C49 81 53 81 57 87 C61 81 65 81 69 87 C73 81 77 81 79 86 L79 46 C79 26 70 10 50 10 Z";
const LEAF = "M50 6 C73 21 82 46 65 71 C59 80 54 86 50 92 C46 86 41 80 35 71 C18 46 27 21 50 6 Z";
const CANDY = "M50 8 L82 84 Q50 96 18 84 Z";

const cache = new Map<string, HTMLCanvasElement>();

function paint(ctx: CanvasRenderingContext2D, kind: HwKind) {
  if (kind === "bat") {
    ctx.fillStyle = "#1a0f0b";
    ctx.fill(new Path2D(BAT));
    // occhietti
    ctx.fillStyle = "#ffb14a";
    ctx.beginPath();
    ctx.arc(47.5, 41, 1.3, 0, Math.PI * 2);
    ctx.arc(52.5, 41, 1.3, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (kind === "ghost") {
    const p = new Path2D(GHOST);
    const g = ctx.createLinearGradient(0, 10, 0, 90);
    g.addColorStop(0, "rgba(255,250,242,0.96)");
    g.addColorStop(1, "rgba(240,228,214,0.78)");
    ctx.fillStyle = g;
    ctx.fill(p);
    // contorno leggero: si vede anche sul tema chiaro
    ctx.strokeStyle = "rgba(60,36,22,0.35)";
    ctx.lineWidth = 2;
    ctx.stroke(p);
    ctx.fillStyle = "#2a1a12";
    ctx.beginPath();
    ctx.ellipse(40, 44, 5, 7, 0, 0, Math.PI * 2);
    ctx.ellipse(60, 44, 5, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(50, 61, 4.5, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (kind === "leaf") {
    const p = new Path2D(LEAF);
    const g = ctx.createLinearGradient(15, 10, 85, 90);
    g.addColorStop(0, "#f2a03d");
    g.addColorStop(0.55, "#d9601f");
    g.addColorStop(1, "#8c2f14");
    ctx.fillStyle = g;
    ctx.fill(p);
    ctx.strokeStyle = "rgba(90,30,10,0.55)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(50, 98);
    ctx.lineTo(50, 16);
    for (const y of [30, 44, 58, 70]) {
      const spread = y < 40 ? 12 : y < 60 ? 18 : 13;
      ctx.moveTo(50, y + 8);
      ctx.quadraticCurveTo(50 - spread * 0.4, y + 2, 50 - spread, y - 4);
      ctx.moveTo(50, y + 8);
      ctx.quadraticCurveTo(50 + spread * 0.4, y + 2, 50 + spread, y - 4);
    }
    ctx.stroke();
    return;
  }
  if (kind === "candy") {
    // candy corn: punta bianca, centro arancio, base gialla
    const p = new Path2D(CANDY);
    ctx.save();
    ctx.clip(p);
    ctx.fillStyle = "#ffd84a";
    ctx.fillRect(0, 0, 100, 100);
    ctx.fillStyle = "#ff8a1f";
    ctx.fillRect(0, 0, 100, 66);
    ctx.fillStyle = "#fff6e6";
    ctx.fillRect(0, 0, 100, 34);
    ctx.restore();
    ctx.strokeStyle = "rgba(90,40,10,0.35)";
    ctx.lineWidth = 2;
    ctx.stroke(p);
    return;
  }
  if (kind === "spider") {
    ctx.strokeStyle = "#1a0f0b";
    ctx.lineCap = "round";
    ctx.lineWidth = 3.2;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const a = -0.55 + i * 0.36;
        ctx.beginPath();
        ctx.moveTo(50, 52);
        ctx.quadraticCurveTo(50 + side * 22, 52 + a * 34 - 14, 50 + side * 36, 52 + a * 44);
        ctx.stroke();
      }
    }
    ctx.fillStyle = "#1a0f0b";
    ctx.beginPath();
    ctx.ellipse(50, 58, 13, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(50, 40, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ff9f3a";
    ctx.beginPath();
    ctx.arc(46.5, 39, 1.8, 0, Math.PI * 2);
    ctx.arc(53.5, 39, 1.8, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  // spark: brace calda con alone (gradiente, niente shadowBlur per frame)
  const g = ctx.createRadialGradient(50, 50, 0, 50, 50, 50);
  g.addColorStop(0, "rgba(255,236,190,1)");
  g.addColorStop(0.25, "rgba(255,170,70,0.9)");
  g.addColorStop(1, "rgba(255,120,30,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(50, 50, 50, 0, Math.PI * 2);
  ctx.fill();
}

/** Sprite quadrato di lato `px` (pixel di schermo) per la sagoma `kind`, già alla densità del display. */
export function hwSprite(kind: HwKind, px: number, dpr: number): HTMLCanvasElement {
  const bucket = Math.max(8, Math.round(px / 4) * 4);
  const key = `${kind}:${bucket}:${dpr}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  const side = Math.ceil(bucket * dpr);
  c.width = side;
  c.height = side;
  const ctx = c.getContext("2d");
  if (ctx) {
    ctx.scale(side / 100, side / 100);
    paint(ctx, kind);
  }
  cache.set(key, c);
  return c;
}

/** Ragnatela d'angolo: raggi dal vertice e fili che pendono tra un raggio e l'altro. */
export function cobwebPath(spokes = 7, rings = 6, size = 120): string {
  const angles = Array.from({ length: spokes }, (_, i) => (i / (spokes - 1)) * (Math.PI / 2));
  const parts: string[] = [];
  for (const a of angles) parts.push(`M0 0 L${(Math.cos(a) * size).toFixed(1)} ${(Math.sin(a) * size).toFixed(1)}`);
  for (let r = 1; r <= rings; r++) {
    const rad = (r / rings) * size * 0.92;
    for (let i = 0; i < angles.length - 1; i++) {
      const a1 = angles[i];
      const a2 = angles[i + 1];
      const x1 = Math.cos(a1) * rad;
      const y1 = Math.sin(a1) * rad;
      const x2 = Math.cos(a2) * rad;
      const y2 = Math.sin(a2) * rad;
      // il filo cede verso il vertice, come una ragnatela vera
      const mid = (a1 + a2) / 2;
      const sag = rad * 0.82;
      parts.push(
        `M${x1.toFixed(1)} ${y1.toFixed(1)} Q${(Math.cos(mid) * sag).toFixed(1)} ${(Math.sin(mid) * sag).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`,
      );
    }
  }
  return parts.join(" ");
}
