"use client";

import { useEffect, useRef, useState } from "react";
import { useDeviceFx } from "./DeviceFxProvider";
import { StarWarsDecor } from "./StarWarsDecor";

type Star = { x: number; y: number; z: number; s: number; tw: number };
type Bolt = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  w: number;
  color: string;
  glow: string;
};
type Spark = { x: number; y: number; vx: number; vy: number; life: number; max: number; c: string };

/**
 * Atmosfera Star Wars su /evento: starfield denso, laser, scintille hyperspace.
 * Decor SVG a bordo (Death Star / sabers / navi) come HalloweenDecor.
 */
export function StarWarsFx() {
  const { caps, ready } = useDeviceFx();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (!ready) {
      setOn(false);
      return;
    }
    try {
      if (document.documentElement.classList.contains("vc-phone-preview")) {
        setOn(false);
        return;
      }
    } catch {
      /* ignore */
    }
    setOn(true);
  }, [ready]);

  useEffect(() => {
    if (!on || !caps.canvas) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let raf = 0;
    let w = 0;
    let h = 0;
    let dpr = 1;
    const stars: Star[] = [];
    const bolts: Bolt[] = [];
    const sparks: Spark[] = [];
    const rich = Boolean(caps.particles && caps.motion);

    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const seed = () => {
      stars.length = 0;
      const count = Math.max(80, Math.min(rich ? 280 : 150, Math.floor(w * h * (rich ? 0.00022 : 0.00012))));
      for (let i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          z: 0.15 + Math.random() * 0.85,
          s: 0.35 + Math.random() * 1.8,
          tw: Math.random() * Math.PI * 2,
        });
      }
    };

    const spawnBolt = () => {
      if (!caps.motion || bolts.length > (rich ? 7 : 3)) return;
      const blue = Math.random() > 0.42;
      const fromLeft = Math.random() > 0.5;
      const speed = 9 + Math.random() * 14;
      bolts.push({
        x: fromLeft ? -30 : w + 30,
        y: h * (0.12 + Math.random() * 0.7),
        vx: fromLeft ? speed : -speed,
        vy: (Math.random() - 0.5) * 3.5,
        life: 0,
        max: 22 + Math.random() * 28,
        w: 1.6 + Math.random() * 2.2,
        color: blue ? "rgba(96,210,255,0.95)" : "rgba(255,70,90,0.92)",
        glow: blue ? "rgba(46,168,255,0.55)" : "rgba(225,29,72,0.5)",
      });
    };

    const spawnHyperspace = () => {
      if (!caps.motion || !rich) return;
      const cx = w * 0.5;
      const cy = h * 0.45;
      for (let i = 0; i < 28; i++) {
        const ang = Math.random() * Math.PI * 2;
        const sp = 4 + Math.random() * 14;
        sparks.push({
          x: cx,
          y: cy,
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp,
          life: 0,
          max: 18 + Math.random() * 22,
          c: Math.random() > 0.3 ? "rgba(240,230,200,0.85)" : "rgba(56,189,248,0.7)",
        });
      }
    };

    resize();
    seed();
    let last = performance.now();
    let boltCd = 900;
    let hyperCd = 12000 + Math.random() * 8000;

    const tick = (now: number) => {
      const dt = Math.min(34, now - last) / 16.67;
      last = now;
      ctx.clearRect(0, 0, w, h);

      /* leggera vignette / nebula */
      const g = ctx.createRadialGradient(w * 0.5, h * 0.2, 0, w * 0.5, h * 0.35, Math.max(w, h) * 0.7);
      g.addColorStop(0, "rgba(18,40,80,0.12)");
      g.addColorStop(0.55, "rgba(5,7,15,0)");
      g.addColorStop(1, "rgba(5,7,15,0.25)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      for (const st of stars) {
        const tw = 0.4 + 0.6 * Math.sin(now * 0.0012 * (0.5 + st.z) + st.tw);
        const a = (0.2 + 0.65 * tw) * st.z;
        ctx.fillStyle = `rgba(240,230,200,${a})`;
        ctx.beginPath();
        ctx.arc(st.x, st.y, st.s * st.z, 0, Math.PI * 2);
        ctx.fill();
        if (st.z > 0.7 && tw > 0.85) {
          ctx.strokeStyle = `rgba(228,199,107,${a * 0.45})`;
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(st.x - st.s * 2, st.y);
          ctx.lineTo(st.x + st.s * 2, st.y);
          ctx.moveTo(st.x, st.y - st.s * 2);
          ctx.lineTo(st.x, st.y + st.s * 2);
          ctx.stroke();
        }
        if (caps.motion) {
          st.y += 0.012 * st.z * dt * 16;
          st.x += 0.004 * st.z * dt * 16;
          if (st.y > h + 3) {
            st.y = -3;
            st.x = Math.random() * w;
          }
          if (st.x > w + 3) st.x = -3;
        }
      }

      if (caps.motion) {
        boltCd -= dt * 16;
        hyperCd -= dt * 16;
        if (boltCd <= 0) {
          spawnBolt();
          if (rich && Math.random() > 0.55) spawnBolt();
          boltCd = 700 + Math.random() * (rich ? 1600 : 2800);
        }
        if (hyperCd <= 0) {
          spawnHyperspace();
          hyperCd = 14000 + Math.random() * 16000;
        }

        for (let i = bolts.length - 1; i >= 0; i--) {
          const b = bolts[i]!;
          b.life += 1;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          const a = Math.max(0, 1 - b.life / b.max);
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.strokeStyle = b.glow.replace(/[\d.]+\)$/, `${a * 0.55})`);
          ctx.lineWidth = b.w * 3.2;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(b.x, b.y);
          ctx.lineTo(b.x - b.vx * 2.8, b.y - b.vy * 2.8);
          ctx.stroke();
          ctx.strokeStyle = b.color.replace(/[\d.]+\)$/, `${a})`);
          ctx.lineWidth = b.w;
          ctx.beginPath();
          ctx.moveTo(b.x, b.y);
          ctx.lineTo(b.x - b.vx * 2.2, b.y - b.vy * 2.2);
          ctx.stroke();
          ctx.restore();
          if (b.life >= b.max || b.x < -100 || b.x > w + 100) bolts.splice(i, 1);
        }

        for (let i = sparks.length - 1; i >= 0; i--) {
          const s = sparks[i]!;
          s.life += 1;
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          const a = Math.max(0, 1 - s.life / s.max);
          ctx.strokeStyle = s.c.replace(/[\d.]+\)$/, `${a})`);
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(s.x - s.vx * 1.8, s.y - s.vy * 1.8);
          ctx.stroke();
          if (s.life >= s.max) sparks.splice(i, 1);
        }
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    const onResize = () => {
      resize();
      seed();
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [on, caps.canvas, caps.motion, caps.particles]);

  if (!on) return null;

  return (
    <>
      <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-[44] opacity-90" aria-hidden />
      <StarWarsDecor live={Boolean(caps.continuous && caps.motion)} />
    </>
  );
}
