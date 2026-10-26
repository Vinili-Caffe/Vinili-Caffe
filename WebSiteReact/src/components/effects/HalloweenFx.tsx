"use client";

import { useEffect, useRef, useState } from "react";
import { EFFECT_KEYS, effectEnabled, isHalloweenSeason } from "@/lib/site-effects";
import { halloweenBudgetFromCaps } from "@/lib/device-fx";
import { isPerfPaused } from "@/lib/perf-pause";
import { useDeviceFx } from "./DeviceFxProvider";
import { HalloweenDecor } from "./HalloweenDecor";
import { cn } from "@/lib/cn";
import { cobwebPath, hwSprite } from "./halloween-sprites";

const WEB = cobwebPath();

type Kind = "bat" | "leaf" | "candy" | "ghost" | "spider" | "spark";

type Particle = {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  size: number;
  alpha: number;
  phase: number;
  life: number;
};

type Flyer = {
  x: number;
  y: number;
  vx: number;
  size: number;
  flap: number;
  alive: boolean;
};

function pickKind(): Kind {
  const r = Math.random();
  if (r < 0.22) return "bat";
  if (r < 0.42) return "leaf";
  if (r < 0.58) return "candy";
  if (r < 0.72) return "ghost";
  if (r < 0.86) return "spider";
  return "spark";
}

function spawn(w: number, h: number, fromTop = true): Particle {
  const kind = pickKind();
  const size =
    kind === "spark" ? 2 + Math.random() * 3 : kind === "ghost" ? 14 + Math.random() * 10 : 10 + Math.random() * 14;
  return {
    kind,
    x: Math.random() * w,
    y: fromTop ? -20 - Math.random() * h * 0.3 : Math.random() * h,
    vx: (Math.random() - 0.5) * (kind === "bat" ? 1.4 : 0.55),
    vy: kind === "spark" ? 0.15 + Math.random() * 0.35 : 0.35 + Math.random() * 1.1,
    rot: Math.random() * Math.PI * 2,
    vr: (Math.random() - 0.5) * 0.04,
    size,
    alpha: kind === "spark" ? 0.35 + Math.random() * 0.45 : 0.55 + Math.random() * 0.4,
    phase: Math.random() * Math.PI * 2,
    life: 1,
  };
}

/** Disegna una particella con lo sprite pronto (bat: ali che sbattono = scala verticale). */
function drawParticle(ctx: CanvasRenderingContext2D, p: Particle, t: number, dpr: number) {
  const px = p.kind === "spark" ? p.size * 4 : p.size * 2;
  const img = hwSprite(p.kind, px, dpr);
  ctx.globalAlpha = p.kind === "spark" ? p.alpha * (0.55 + 0.45 * Math.sin(t * 0.01 + p.phase)) : p.alpha;
  if (p.kind === "spider") {
    // filo da cui pende
    ctx.strokeStyle = "rgba(120,100,90,0.5)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(0, -px * 0.1);
    ctx.lineTo(0, -px * 1.8);
    ctx.stroke();
  }
  if (p.kind === "bat") {
    const flap = 0.55 + 0.45 * Math.abs(Math.sin(t * 0.014 + p.phase));
    ctx.scale(1, flap);
  }
  if (p.kind === "ghost") ctx.translate(0, Math.sin(t * 0.008 + p.phase) * 2);
  ctx.drawImage(img, -px / 2, -px / 2, px, px);
  ctx.globalAlpha = 1;
}

function drawFlyer(ctx: CanvasRenderingContext2D, f: Flyer, t: number, dpr: number) {
  const px = f.size * 2.6;
  const img = hwSprite("bat", px, dpr);
  const flap = 0.5 + 0.5 * Math.abs(Math.sin(t * 0.02 + f.flap));
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.scale(f.vx > 0 ? 1 : -1, flap);
  ctx.globalAlpha = 0.85;
  ctx.drawImage(img, -px / 2, -px / 2, px, px);
  ctx.restore();
}

/**
 * Atmosfera Halloween su tutto il sito: nebbia, ragnatele, particelle.
 * Budget dalle capability DeviceFx (metriche + FPS), non da profili fissi.
 */
export function HalloweenFx() {
  const { caps, ready } = useDeviceFx();
  const [on, setOn] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [boo, setBoo] = useState(false);
  const budget = halloweenBudgetFromCaps(caps);

  useEffect(() => {
    // le decorazioni ferme si vedono anche con gli effetti spenti: niente canvas né nebbia, solo SVG
    if (!ready) {
      setOn(false);
      return;
    }
    if (!isHalloweenSeason()) {
      setOn(false);
      return;
    }
    if (!effectEnabled(EFFECT_KEYS.halloweenFx, true)) {
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
  }, [ready, caps.motion, caps.canvas, caps.particles]);

  useEffect(() => {
    if (!on || !budget.canvas || budget.particles <= 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const maxParticles = budget.particles;
    const allowFlyer = budget.flyer;
    const allowBoo = budget.boo;
    const dprCap = budget.dprCap;
    let w = 0;
    let h = 0;
    let dpr = 1;
    const particles: Particle[] = [];
    let flyer: Flyer | null = null;
    let nextFlyerAt = performance.now() + 4000 + Math.random() * 8000;
    let nextBooAt = performance.now() + 18000 + Math.random() * 40000;
    let raf = 0;
    let last = performance.now();
    let running = true;
    let clearedWhilePaused = false;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, dprCap);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const seed = () => {
      particles.length = 0;
      for (let i = 0; i < maxParticles; i++) particles.push(spawn(w, h, Math.random() > 0.35));
    };

    const tick = (now: number) => {
      if (!running) return;
      // tab nascosta / sheet / digitazione: stop RAF (riprende su visibilitychange)
      if (document.hidden || isPerfPaused()) {
        if (!clearedWhilePaused) {
          ctx.clearRect(0, 0, w, h);
          clearedWhilePaused = true;
        }
        last = now;
        raf = 0;
        return;
      }
      clearedWhilePaused = false;
      const dt = Math.min(32, now - last);
      last = now;
      ctx.clearRect(0, 0, w, h);

      for (const p of particles) {
        p.phase += dt * 0.002;
        p.x += p.vx * (dt / 16) + Math.sin(p.phase) * (p.kind === "ghost" ? 0.35 : 0.15);
        p.y += p.vy * (dt / 16);
        p.rot += p.vr * (dt / 16);
        if (p.kind === "spider") p.vy = Math.min(1.6, p.vy + 0.002 * dt);

        if (p.y > h + 40 || p.x < -60 || p.x > w + 60) {
          Object.assign(p, spawn(w, h, true));
        }

        ctx.save();
        ctx.translate(p.x, p.y);
        // ruotano solo foglie e caramelle; pipistrelli, fantasmi e ragni restano dritti
        if (p.kind === "leaf" || p.kind === "candy") ctx.rotate(p.rot);
        else if (p.kind === "bat") ctx.rotate(Math.sin(p.phase) * 0.25);
        drawParticle(ctx, p, now, dpr);
        ctx.restore();
      }

      if (allowFlyer && !flyer && now >= nextFlyerAt) {
        const left = Math.random() > 0.5;
        flyer = {
          x: left ? -80 : w + 80,
          y: 60 + Math.random() * (h * 0.45),
          vx: (left ? 1 : -1) * (2.2 + Math.random() * 1.6),
          size: 22 + Math.random() * 18,
          flap: Math.random() * 10,
          alive: true,
        };
        nextFlyerAt = now + 9000 + Math.random() * 16000;
      }
      if (flyer?.alive) {
        flyer.x += flyer.vx * (dt / 16);
        flyer.y += Math.sin(now * 0.004 + flyer.flap) * 0.55;
        drawFlyer(ctx, flyer, now, dpr);
        if (flyer.x < -120 || flyer.x > w + 120) flyer = null;
      }

      if (allowBoo && now >= nextBooAt) {
        nextBooAt = now + 25000 + Math.random() * 55000;
        setBoo(true);
        window.setTimeout(() => setBoo(false), 900);
      }

      raf = requestAnimationFrame(tick);
    };

    const resume = () => {
      if (!running || raf || document.hidden || isPerfPaused()) return;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };
    const onVis = () => {
      if (document.hidden) {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        return;
      }
      resume();
    };

    resize();
    seed();
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVis);
    raf = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [on, budget.canvas, budget.particles, budget.flyer, budget.boo, budget.dprCap]);

  if (!on) return null;

  if (!caps.motion) {
    return (
      <div className="pointer-events-none fixed inset-0 z-[40] overflow-hidden" aria-hidden>
        <HalloweenDecor live={false} />
      </div>
    );
  }

  const cssOnly = budget.cssOnly;
  const showFog = budget.fog;

  return (
    <div className="pointer-events-none fixed inset-0 z-[40] overflow-hidden" aria-hidden>
      {/* vignette calda */}
      <div
        className={cn(
          "absolute inset-0 light:opacity-[0.35]",
          cssOnly ? "opacity-[0.4]" : "opacity-[0.55]",
          "bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(40,12,4,0.45)_100%)]",
        )}
      />
      {/* bagliore zucca basso */}
      <div className="absolute inset-x-0 bottom-0 h-[42%] bg-[radial-gradient(ellipse_at_50%_100%,rgba(255,120,30,0.16),transparent_65%)] light:bg-[radial-gradient(ellipse_at_50%_100%,rgba(255,140,50,0.1),transparent_65%)]" />
      {/* nebbia blur solo se cap fog */}
      {showFog ? (
        <>
          <div className="vc-hw-fog absolute inset-x-[-10%] bottom-[-8%] h-[38%] opacity-70 light:opacity-40" />
          <div className="vc-hw-fog vc-hw-fog--slow absolute inset-x-[-15%] bottom-[-12%] h-[28%] opacity-50 light:opacity-30" />
        </>
      ) : (
        <div className="absolute inset-x-0 bottom-0 h-[28%] bg-[linear-gradient(to_top,rgba(255,200,150,0.08),transparent)] opacity-60" />
      )}

      {/* ragnatele d'angolo */}
      <svg className={cn("absolute left-0 top-0 size-40 text-crema sm:size-56", cssOnly ? "opacity-[0.16]" : "opacity-[0.24]", "light:opacity-[0.2]")} viewBox="0 0 120 120" fill="none">
        <path d={WEB} stroke="currentColor" strokeWidth="0.55" strokeLinecap="round" />
      </svg>
      <svg
        className={cn(
          "absolute right-0 top-0 size-32 -scale-x-100 text-crema sm:size-44",
          cssOnly ? "opacity-[0.14]" : "opacity-[0.2]",
          "light:opacity-[0.16]",
        )}
        viewBox="0 0 120 120"
        fill="none"
      >
        <path d={WEB} stroke="currentColor" strokeWidth="0.6" strokeLinecap="round" />
      </svg>

      {!cssOnly && (
        <>
          <div className="vc-hw-eyes absolute bottom-6 left-[12%] hidden sm:block" />
          <div className="vc-hw-eyes vc-hw-eyes--right absolute bottom-10 right-[18%] hidden md:block" />
        </>
      )}

      <HalloweenDecor live={caps.continuous} />

      {budget.canvas && budget.particles > 0 ? <canvas ref={canvasRef} className="absolute inset-0 size-full" /> : null}

      {/* boo raro */}
      {budget.boo ? (
        <div
          className={cn(
            "absolute inset-0 flex items-center justify-center transition-opacity duration-500",
            boo ? "opacity-100" : "opacity-0",
          )}
        >
          {/* fantasmino che fa "Boo!" e sparisce */}
          <span
            className={cn(
              "flex select-none flex-col items-center transition-transform duration-700 ease-out",
              boo ? "translate-y-0 scale-100" : "translate-y-6 scale-90",
            )}
          >
            <svg viewBox="0 0 100 100" className="size-24 drop-shadow-[0_0_28px_rgba(255,170,80,0.45)] sm:size-32" aria-hidden>
              <path
                d="M50 10 C30 10 21 26 21 46 L21 86 C25 81 29 81 33 87 C37 81 41 81 45 87 C49 81 53 81 57 87 C61 81 65 81 69 87 C73 81 77 81 79 86 L79 46 C79 26 70 10 50 10 Z"
                fill="rgba(255,248,238,0.92)"
                stroke="rgba(60,36,22,0.35)"
                strokeWidth="2"
              />
              <ellipse cx="40" cy="44" rx="5" ry="7" fill="#2a1a12" />
              <ellipse cx="60" cy="44" rx="5" ry="7" fill="#2a1a12" />
              <ellipse cx="50" cy="62" rx="6" ry="8" fill="#2a1a12" />
            </svg>
            <span className="-mt-1 font-script text-5xl text-ember drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)] sm:text-6xl">Boo!</span>
          </span>
        </div>
      ) : null}
    </div>
  );
}
