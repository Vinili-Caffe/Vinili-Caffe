"use client";

import { useEffect, useRef } from "react";

const COLORS = ["#d4a888", "#6dcf8a", "#f0e2cf", "#e07a6a", "#8ec5ff", "#f6c945", "#ffffff", "#c9a0ff"];

type Part = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  drag: number;
  w: number;
  hh: number;
  rot: number;
  vr: number;
  color: string;
  born: number;
  kind: "rect" | "strip";
};

/** Raffiche da due cannoni (come puzzle-page.js). */
export function PuzzleConfetti({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const parts: Part[] = [];
    const cannons = [
      { x: 28, y: h - 12, base: -Math.PI * 0.72, spread: 0.55 },
      { x: w - 28, y: h - 12, base: -Math.PI * 0.28, spread: 0.55 },
    ];

    function spawnBurst(count: number, powerScale: number) {
      for (let c = 0; c < cannons.length; c++) {
        const side = cannons[c]!;
        for (let n = 0; n < count; n++) {
          const ang = side.base + (Math.random() - 0.5) * side.spread;
          const spd = (9.5 + Math.random() * 11) * powerScale;
          parts.push({
            x: side.x + (Math.random() - 0.5) * 10,
            y: side.y + (Math.random() - 0.5) * 8,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            g: 0.16 + Math.random() * 0.08,
            drag: 0.992 + Math.random() * 0.004,
            w: 3 + Math.random() * 5,
            hh: 7 + Math.random() * 10,
            rot: Math.random() * Math.PI * 2,
            vr: -0.35 + Math.random() * 0.7,
            color: COLORS[(parts.length + n) % COLORS.length]!,
            born: 0,
            kind: Math.random() < 0.35 ? "rect" : "strip",
          });
        }
      }
    }

    spawnBurst(70, 1.15);
    spawnBurst(55, 1);
    const start = performance.now();
    let nextBurst = 0.18;
    let burstN = 0;

    function frame(now: number) {
      const t = (now - start) / 1000;
      while (burstN < 10 && t >= nextBurst) {
        spawnBurst(38 + Math.floor(Math.random() * 22), 0.92 + Math.random() * 0.25);
        burstN += 1;
        nextBurst += 0.16 + Math.random() * 0.1;
      }

      ctx!.clearRect(0, 0, w, h);

      for (let ci = 0; ci < cannons.length; ci++) {
        const gun = cannons[ci]!;
        const left = ci === 0;
        ctx!.save();
        ctx!.translate(gun.x, gun.y);
        ctx!.rotate(left ? -0.55 : 0.55);
        ctx!.fillStyle = "rgba(212,168,136,0.55)";
        ctx!.beginPath();
        ctx!.moveTo(-7, 10);
        ctx!.lineTo(7, 10);
        ctx!.lineTo(3, -18);
        ctx!.lineTo(-3, -18);
        ctx!.closePath();
        ctx!.fill();
        ctx!.fillStyle = "rgba(255,240,220,0.35)";
        ctx!.fillRect(-2.5, -22, 5, 8);
        ctx!.restore();
      }

      let alive = 0;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i]!;
        if (p.born === 0) p.born = t;
        const age = t - p.born;
        p.vx *= p.drag;
        p.vy = p.vy * p.drag + p.g;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        if (p.y < h + 60 && age < 3.8 && p.x > -80 && p.x < w + 80) {
          alive++;
          ctx!.save();
          ctx!.translate(p.x, p.y);
          ctx!.rotate(p.rot);
          ctx!.globalAlpha = Math.max(0, 1 - Math.max(0, age - 2.4) / 1.4);
          ctx!.fillStyle = p.color;
          if (p.kind === "strip") ctx!.fillRect(-p.w * 0.35, -p.hh / 2, p.w * 0.7, p.hh);
          else ctx!.fillRect(-p.w / 2, -p.hh * 0.35, p.w, p.hh * 0.7);
          ctx!.restore();
        }
      }

      if ((alive > 0 || burstN < 10) && t < 5.2) raf = requestAnimationFrame(frame);
      else ctx!.clearRect(0, 0, w, h);
    }

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ctx.clearRect(0, 0, w, h);
    };
  }, [active]);

  if (!active) return null;
  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[60]"
      aria-hidden="true"
    />
  );
}
