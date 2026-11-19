"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Bruciatura realistica di una carta.
 * - Fronte del fuoco irregolare (campo di "tempo di bruciatura" = distanza dai punti d'innesco + rumore):
 *   la carta sparisce davvero (mask-image sul foglio), testo compreso.
 * - Davanti al fronte: brunitura e fascia carbonizzata; sul bordo una brace incandescente che tremola;
 *   oltre il bordo una frangia nera da carta bruciata.
 * - Particelle: fiamme che salgono dal bordo, scintille, fumo, fiocchi di cenere.
 * Tutto su un canvas sopra la carta (più largo e alto, così fiamme e fumo escono dal foglio).
 */

type P = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  rot: number;
  vr: number;
};

const COLS = 72;
const BURN_MS = 3300;
const TAIL_MS = 1400;
/* bande del fronte (in unità di "tempo di bruciatura" 0…1) */
const FRINGE = 0.016;
const GLOW_IN = -0.01;
const GLOW_OUT = 0.022;
const CHAR = 0.085;
const SCORCH = 0.2;

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Rumore a valori con interpolazione morbida + fbm a 4 ottave. */
function makeNoise(rand: () => number) {
  const N = 64;
  const grid = new Float32Array(N * N);
  for (let i = 0; i < grid.length; i += 1) grid[i] = rand();
  const at = (x: number, y: number) => grid[(((y % N) + N) % N) * N + (((x % N) + N) % N)];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const noise = (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = smooth(x - xi);
    const fy = smooth(y - yi);
    const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * fx;
    const b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * fx;
    return a + (b - a) * fy;
  };
  return (x: number, y: number) => {
    let v = 0;
    let amp = 0.5;
    let f = 1;
    for (let o = 0; o < 4; o += 1) {
      v += amp * noise(x * f, y * f);
      amp *= 0.5;
      f *= 2.07;
    }
    return v / 0.9375;
  };
}

/** Sprite radiale (fiamma, fumo) pre-disegnato una volta. */
function sprite(stops: [number, string][]) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  for (const [o, col] of stops) grad.addColorStop(o, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
}

let SPRITES: { hot: HTMLCanvasElement; flame: HTMLCanvasElement; deep: HTMLCanvasElement; smoke: HTMLCanvasElement } | null = null;
function sprites() {
  if (!SPRITES) {
    SPRITES = {
      hot: sprite([
        [0, "rgba(255,245,215,0.95)"],
        [0.3, "rgba(255,205,110,0.75)"],
        [0.7, "rgba(255,130,40,0.25)"],
        [1, "rgba(255,110,30,0)"],
      ]),
      flame: sprite([
        [0, "rgba(255,180,80,0.9)"],
        [0.4, "rgba(255,110,30,0.55)"],
        [0.75, "rgba(210,55,15,0.18)"],
        [1, "rgba(180,40,10,0)"],
      ]),
      deep: sprite([
        [0, "rgba(220,70,20,0.7)"],
        [0.5, "rgba(150,30,10,0.35)"],
        [1, "rgba(80,10,5,0)"],
      ]),
      smoke: sprite([
        [0, "rgba(70,62,56,0.55)"],
        [0.5, "rgba(55,50,46,0.25)"],
        [1, "rgba(40,36,34,0)"],
      ]),
    };
  }
  return SPRITES;
}

export function BurnFx({
  active,
  delayMs = 0,
  seed,
  sheetRef,
}: {
  active: boolean;
  delayMs?: number;
  seed: string;
  sheetRef: RefObject<HTMLDivElement | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const sheet = sheetRef.current;
    const canvas = canvasRef.current;
    if (!active || !sheet || !canvas) return;

    const clearMask = () => {
      sheet.style.removeProperty("mask-image");
      sheet.style.removeProperty("-webkit-mask-image");
      sheet.style.removeProperty("mask-size");
      sheet.style.removeProperty("-webkit-mask-size");
      sheet.style.removeProperty("visibility");
    };

    /* anche con "riduci movimento": la cerimonia è il momento clou della pagina */
    const W = sheet.offsetWidth;
    const H = sheet.offsetHeight;
    if (W < 10 || H < 10) return clearMask;

    /* canvas sopra la carta: margini per fiamme e fumo che escono dal foglio */
    const mx = W * 0.14;
    const mt = Math.min(H * 0.7, 260);
    const mb = H * 0.08;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const CW = W + mx * 2;
    const CH = H + mt + mb;
    canvas.style.left = `${-mx}px`;
    canvas.style.top = `${-mt}px`;
    canvas.style.width = `${CW}px`;
    canvas.style.height = `${CH}px`;
    canvas.width = Math.round(CW * dpr);
    canvas.height = Math.round(CH * dpr);
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    /* campo del tempo di bruciatura */
    const rand = mulberry(hashSeed(seed));
    const fbm = makeNoise(rand);
    const cols = COLS;
    const rows = Math.max(24, Math.min(160, Math.round((COLS * H) / W)));
    const n = cols * rows;
    const T = new Float32Array(n);
    const shimmer = new Float32Array(n);
    const ignitions: { x: number; y: number }[] = [];
    const count = 2 + (rand() < 0.55 ? 1 : 0);
    for (let k = 0; k < count; k += 1) ignitions.push({ x: 0.12 + rand() * 0.76, y: 1.02 });
    if (rand() < 0.5) ignitions.push({ x: rand() < 0.5 ? -0.02 : 1.02, y: 0.78 + rand() * 0.2 });
    const aspect = H / W;
    let tMin = Infinity;
    let tMax = -Infinity;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const x = (c + 0.5) / cols;
        const y = (r + 0.5) / rows;
        let d = Infinity;
        for (const p of ignitions) {
          const dx = x - p.x;
          const dy = (y - p.y) * aspect;
          /* il fuoco sale più in fretta di quanto si allarghi */
          const dist = Math.sqrt(dx * dx * 1.35 + dy * dy * 0.8);
          if (dist < d) d = dist;
        }
        const v = d + 0.28 * fbm(x * 5.2, y * 5.2 * aspect) + 0.06 * fbm(x * 19, y * 19 * aspect);
        T[r * cols + c] = v;
        shimmer[r * cols + c] = rand() * Math.PI * 2;
        if (v < tMin) tMin = v;
        if (v > tMax) tMax = v;
      }
    }
    for (let i = 0; i < n; i += 1) T[i] = (T[i] - tMin) / (tMax - tMin);

    /* buffer a bassa risoluzione: maschera della carta, effetti (char/frangia), bagliore */
    const mk = (w: number, h: number) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      return c;
    };
    const maskC = mk(cols, rows);
    /* maschera ingrandita con interpolazione: bordo morbido e frastagliato, non a scalini */
    const maskBig = mk(Math.max(cols, Math.round(W / 2)), Math.max(rows, Math.round(H / 2)));
    const maskBigX = maskBig.getContext("2d")!;
    maskBigX.imageSmoothingEnabled = true;
    maskBigX.imageSmoothingQuality = "high";
    const fxC = mk(cols, rows);
    const glowC = mk(cols, rows);
    const maskX = maskC.getContext("2d")!;
    const fxX = fxC.getContext("2d")!;
    const glowX = glowC.getContext("2d")!;
    const maskImg = maskX.createImageData(cols, rows);
    const fxImg = fxX.createImageData(cols, rows);
    const glowImg = glowX.createImageData(cols, rows);
    const edge = new Int32Array(n);
    const burnedPrev = new Uint8Array(n);

    sheet.style.setProperty("mask-size", "100% 100%");
    sheet.style.setProperty("-webkit-mask-size", "100% 100%");

    const S = sprites();
    const flames: P[] = [];
    const sparks: P[] = [];
    const smoke: P[] = [];
    const ash: P[] = [];
    const scale = Math.max(0.7, Math.min(1.4, W / 320));
    const cellW = W / cols;
    const cellH = H / rows;

    let raf = 0;
    let start = 0;
    let last = 0;
    let frame = 0;
    let paperGone = false;

    const step = (now: number) => {
      raf = requestAnimationFrame(step);
      if (!start) start = now + delayMs;
      const el = now - start;
      if (el < 0) return;
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
      last = now;
      frame += 1;
      /* t: un filo prima di 0 (solo brunitura/innesco) → oltre 1 (tutto bruciato) */
      /* il fuoco parte piano e poi prende */
      const t = -0.05 + Math.pow(Math.min(el / BURN_MS, 1.3), 1.3) * 1.12;

      let edges = 0;
      if (!paperGone) {
        const md = maskImg.data;
        const fd = fxImg.data;
        const gd = glowImg.data;
        const flick = el * 0.012;
        for (let i = 0; i < n; i += 1) {
          const d = T[i] - t;
          const o = i * 4;
          /* maschera: bordo morbido di un soffio */
          const m = d <= -0.004 ? 0 : d >= 0.006 ? 1 : (d + 0.004) / 0.01;
          md[o] = md[o + 1] = md[o + 2] = 255;
          md[o + 3] = m * 255;
          /* frangia nera oltre il bordo, carbonizzato e brunitura davanti */
          let fr = 0;
          let fg = 0;
          let fb = 0;
          let fa = 0;
          if (d < 0 && d > -FRINGE) {
            const k = 1 + d / FRINGE;
            fr = 22;
            fg = 13;
            fb = 8;
            fa = 235 * k * k;
          } else if (d >= 0 && d < CHAR) {
            const k = 1 - d / CHAR;
            fr = 30 + 40 * (1 - k);
            fg = 15 + 22 * (1 - k);
            fb = 7 + 8 * (1 - k);
            fa = 245 * Math.pow(k, 1.4);
          } else if (d >= CHAR && d < SCORCH) {
            const k = 1 - (d - CHAR) / (SCORCH - CHAR);
            fr = 120;
            fg = 66;
            fb = 22;
            fa = 95 * k * k;
          }
          fd[o] = fr;
          fd[o + 1] = fg;
          fd[o + 2] = fb;
          fd[o + 3] = fa;
          /* brace incandescente sul bordo, che tremola */
          if (d > GLOW_IN && d < GLOW_OUT) {
            const k = d < 0 ? 1 - d / GLOW_IN : 1 - d / GLOW_OUT;
            const s = 0.7 + 0.3 * Math.sin(flick + shimmer[i]) * Math.sin(flick * 0.63 + shimmer[i] * 1.7);
            const g = Math.max(0, k * s);
            gd[o] = 255;
            gd[o + 1] = 90 + 150 * g * g;
            gd[o + 2] = 20 + 90 * g * g * g;
            gd[o + 3] = 255 * Math.min(1, g * 1.25);
            if (d >= 0 && d < 0.012) edge[edges++] = i;
          } else {
            gd[o + 3] = 0;
          }
          /* cenere che si stacca dove la carta è appena sparita */
          if (d < 0 && !burnedPrev[i]) {
            burnedPrev[i] = 1;
            if (rand() < 0.012 && ash.length < 70) {
              const c = i % cols;
              const r = (i / cols) | 0;
              ash.push({
                x: mx + (c + 0.5) * cellW,
                y: mt + (r + 0.5) * cellH,
                vx: (rand() - 0.5) * 30,
                vy: -20 - rand() * 50,
                life: 0,
                max: 1.2 + rand() * 1.4,
                size: (2 + rand() * 4) * scale,
                rot: rand() * Math.PI,
                vr: (rand() - 0.5) * 6,
              });
            }
          }
        }
        maskX.putImageData(maskImg, 0, 0);
        fxX.putImageData(fxImg, 0, 0);
        glowX.putImageData(glowImg, 0, 0);
        /* aggiorno la maschera della carta ogni 2 frame (basta e costa poco) */
        if (frame % 2 === 1 || t > 1.07) {
          maskBigX.clearRect(0, 0, maskBig.width, maskBig.height);
          maskBigX.drawImage(maskC, 0, 0, maskBig.width, maskBig.height);
          const url = `url(${maskBig.toDataURL()})`;
          sheet.style.setProperty("mask-image", url);
          sheet.style.setProperty("-webkit-mask-image", url);
        }
        if (t > 1.08) {
          paperGone = true;
          sheet.style.setProperty("visibility", "hidden");
        }
      }

      /* nuove particelle dal bordo acceso */
      if (edges > 0 && !paperGone) {
        const pick = () => {
          const i = edge[(rand() * edges) | 0];
          const c = i % cols;
          const r = (i / cols) | 0;
          return { x: mx + (c + rand()) * cellW, y: mt + (r + rand()) * cellH };
        };
        const fN = Math.min(18, 3 + edges * 0.09) * (dt / 0.016);
        for (let k = 0; k < fN && flames.length < 420; k += 1) {
          const p = pick();
          flames.push({
            x: p.x,
            y: p.y,
            vx: (rand() - 0.5) * 14,
            vy: -(55 + rand() * 70) * scale,
            life: 0,
            max: 0.45 + rand() * 0.45,
            size: (14 + rand() * 16) * scale,
            rot: rand() * Math.PI * 2,
            vr: 2 + rand() * 4,
          });
        }
        if (rand() < 0.5 * (dt / 0.016) && sparks.length < 60) {
          const p = pick();
          sparks.push({
            x: p.x,
            y: p.y,
            vx: (rand() - 0.5) * 70,
            vy: -(90 + rand() * 170) * scale,
            life: 0,
            max: 0.7 + rand() * 1.1,
            size: (1 + rand() * 1.4) * scale,
            rot: 0,
            vr: 0,
          });
        }
        if (rand() < 0.16 * (dt / 0.016) && smoke.length < 30) {
          const p = pick();
          smoke.push({
            x: p.x,
            y: p.y - 10,
            vx: (rand() - 0.5) * 14,
            vy: -(26 + rand() * 30) * scale,
            life: 0,
            max: 1.6 + rand() * 1.2,
            size: (18 + rand() * 16) * scale,
            rot: rand() * Math.PI * 2,
            vr: 0,
          });
        }
      }

      ctx.clearRect(0, 0, CW, CH);
      ctx.imageSmoothingEnabled = true;
      if (!paperGone) {
        /* carbonizzato e frangia */
        ctx.globalCompositeOperation = "source-over";
        ctx.drawImage(fxC, mx, mt, W, H);
      }

      /* fumo (sotto le fiamme) */
      ctx.globalCompositeOperation = "source-over";
      for (let k = smoke.length - 1; k >= 0; k -= 1) {
        const p = smoke[k];
        p.life += dt;
        if (p.life >= p.max) {
          smoke.splice(k, 1);
          continue;
        }
        const a = p.life / p.max;
        p.vx += Math.sin(el * 0.002 + p.rot) * 8 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const s = p.size * (1 + a * 2.2);
        /* fumo leggero: si vede sul nero, non sporca la carta */
        ctx.globalAlpha = 0.2 * Math.sin(Math.PI * a) * (1 - a * 0.4);
        ctx.drawImage(S.smoke, p.x - s, p.y - s, s * 2, s * 2);
      }

      if (!paperGone) {
        /* brace: bagliore nitido + alone più largo */
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 1;
        ctx.drawImage(glowC, mx, mt, W, H);
        ctx.globalAlpha = 0.55;
        ctx.drawImage(glowC, mx - 6, mt - 6, W + 12, H + 12);
        ctx.globalAlpha = 0.25;
        ctx.drawImage(glowC, mx - 18, mt - 22, W + 36, H + 36);
      }

      /* fiamme: lingue che salgono, si stringono e passano dal bianco-giallo al rosso */
      ctx.globalCompositeOperation = "lighter";
      for (let k = flames.length - 1; k >= 0; k -= 1) {
        const p = flames[k];
        p.life += dt;
        if (p.life >= p.max) {
          flames.splice(k, 1);
          continue;
        }
        const a = p.life / p.max;
        p.rot += p.vr * dt;
        p.x += (p.vx + Math.sin(p.rot) * 22 * scale) * dt;
        p.y += p.vy * dt;
        p.vy -= 30 * scale * dt;
        /* lingua di fuoco: sprite stirato in verticale e inclinato nel verso del moto, si assottiglia salendo */
        const w = p.size * (1 - a * 0.55);
        const h = w * (2.3 + a * 1.8);
        const img = a < 0.22 ? S.hot : a < 0.6 ? S.flame : S.deep;
        ctx.globalAlpha = 0.5 * Math.pow(1 - a, 1.1) * (a < 0.1 ? a / 0.1 : 1);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.atan2(p.vx, -p.vy) * 0.6);
        ctx.drawImage(img, -w / 2, -h * 0.8, w, h);
        ctx.restore();
      }

      /* scintille: piccole strisce luminose */
      ctx.lineCap = "round";
      for (let k = sparks.length - 1; k >= 0; k -= 1) {
        const p = sparks[k];
        p.life += dt;
        if (p.life >= p.max) {
          sparks.splice(k, 1);
          continue;
        }
        const a = p.life / p.max;
        p.vy += 70 * dt;
        p.vx += (rand() - 0.5) * 120 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        ctx.globalAlpha = (1 - a) * (0.6 + 0.4 * Math.sin(p.life * 40));
        ctx.strokeStyle = a < 0.5 ? "#fff1c4" : "#ff9a3c";
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.025, p.y - p.vy * 0.025);
        ctx.stroke();
      }

      /* fiocchi di cenere: salgono col calore, poi ricadono girando */
      ctx.globalCompositeOperation = "source-over";
      for (let k = ash.length - 1; k >= 0; k -= 1) {
        const p = ash[k];
        p.life += dt;
        if (p.life >= p.max) {
          ash.splice(k, 1);
          continue;
        }
        const a = p.life / p.max;
        p.vy += 45 * dt;
        p.vx += Math.sin(p.life * 3 + p.rot) * 20 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        ctx.globalAlpha = (1 - a) * 0.85;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(1, Math.abs(Math.cos(p.rot * 1.3)) * 0.8 + 0.2);
        ctx.fillStyle = a < 0.15 ? "#ff7a2a" : "#2a2420";
        ctx.fillRect(-p.size / 2, -p.size / 3, p.size, (p.size * 2) / 3);
        ctx.restore();
      }
      ctx.globalAlpha = 1;

      if (paperGone && !flames.length && !sparks.length && !smoke.length && !ash.length && el > BURN_MS + TAIL_MS) {
        cancelAnimationFrame(raf);
      }
    };
    raf = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(raf);
      clearMask();
      ctx.clearRect(0, 0, CW, CH);
    };
  }, [active, delayMs, seed, sheetRef]);

  if (!active) return null;
  /* max-w-none: il preflight limita i canvas al 100% del contenitore e schiaccerebbe il fuoco */
  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute z-[5] max-w-none" />;
}
