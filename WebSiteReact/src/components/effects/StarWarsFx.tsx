"use client";

import { useEffect, useRef, useState } from "react";
import { useDeviceFx } from "./DeviceFxProvider";
import { StarWarsDecor } from "./StarWarsDecor";

type Star = { x: number; y: number; z: number; s: number };
type Streak = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string };

/**
 * Atmosfera Star Wars su /evento: starfield + scie laser occasionali.
 * Sostituisce HalloweenFx quando EventoChrome è attivo.
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
    const streaks: Streak[] = [];
    const nStars = Math.max(40, Math.min(140, Math.floor((caps.particles ? 110 : 55) * (caps.motion ? 1 : 0.5))));

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
      for (let i = 0; i < nStars; i++) {
        stars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          z: 0.2 + Math.random() * 0.8,
          s: 0.4 + Math.random() * 1.4,
        });
      }
    };

    const spawnStreak = () => {
      if (!caps.motion || streaks.length > 3) return;
      const fromLeft = Math.random() > 0.45;
      const color = Math.random() > 0.55 ? "rgba(46,168,255,0.85)" : "rgba(225,29,72,0.75)";
      streaks.push({
        x: fromLeft ? -40 : w + 40,
        y: h * (0.15 + Math.random() * 0.55),
        vx: fromLeft ? 6 + Math.random() * 8 : -(6 + Math.random() * 8),
        vy: (Math.random() - 0.5) * 2.2,
        life: 0,
        max: 28 + Math.random() * 36,
        color,
      });
    };

    resize();
    seed();
    let last = performance.now();
    let streakCd = 1800;

    const tick = (now: number) => {
      const dt = Math.min(32, now - last);
      last = now;
      ctx.clearRect(0, 0, w, h);

      for (const st of stars) {
        const tw = 0.45 + 0.55 * Math.sin(now * 0.001 * st.z + st.x);
        ctx.fillStyle = `rgba(240,230,200,${(0.25 + 0.55 * tw) * st.z})`;
        ctx.beginPath();
        ctx.arc(st.x, st.y, st.s * st.z, 0, Math.PI * 2);
        ctx.fill();
        if (caps.motion) {
          st.y += 0.008 * st.z * dt;
          if (st.y > h + 2) {
            st.y = -2;
            st.x = Math.random() * w;
          }
        }
      }

      if (caps.motion) {
        streakCd -= dt;
        if (streakCd <= 0) {
          spawnStreak();
          streakCd = 2200 + Math.random() * 4200;
        }
        for (let i = streaks.length - 1; i >= 0; i--) {
          const s = streaks[i]!;
          s.life += 1;
          s.x += s.vx;
          s.y += s.vy;
          const a = Math.max(0, 1 - s.life / s.max);
          ctx.strokeStyle = s.color.replace(/[\d.]+\)$/, `${a})`);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(s.x - s.vx * 3.5, s.y - s.vy * 3.5);
          ctx.stroke();
          if (s.life >= s.max || s.x < -80 || s.x > w + 80) streaks.splice(i, 1);
        }
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [on, caps.canvas, caps.motion, caps.particles]);

  if (!on) return null;

  return (
    <>
      <canvas
        ref={canvasRef}
        className="pointer-events-none fixed inset-0 z-[44] opacity-80"
        aria-hidden
      />
      <StarWarsDecor live={Boolean(caps.continuous && caps.motion)} />
    </>
  );
}
