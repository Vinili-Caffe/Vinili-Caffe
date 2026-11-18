"use client";

import { useEffect, useRef, useState } from "react";
import {
  EFFECT_KEYS,
  effectEnabled,
  isBefanaSeason,
  isChristmasSeason,
  isNewYearSeason,
} from "@/lib/site-effects";
import { christmasBudgetFromCaps } from "@/lib/device-fx";
import { isPerfPaused } from "@/lib/perf-pause";
import { useDeviceFx } from "./DeviceFxProvider";
import { BefanaSky, ChristmasDecor, NewYearSky } from "./ChristmasDecor";
import { cn } from "@/lib/cn";
import { xmasSprite, type XmasKind } from "./christmas-sprites";

type Particle = {
  kind: XmasKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  size: number;
  alpha: number;
  phase: number;
};

type FireworkSpark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
};

const FIREWORK_COLORS = ["#f5d76e", "#ff6b8a", "#7ec8ff", "#6fd9a0", "#ffb347", "#e0b0ff", "#fff4d6"];

function pickKind(): XmasKind {
  const r = Math.random();
  if (r < 0.52) return "flake";
  if (r < 0.72) return "snow";
  if (r < 0.84) return "ornament";
  if (r < 0.93) return "star";
  return "spark";
}

function spawn(w: number, h: number, fromTop = true): Particle {
  const kind = pickKind();
  const size =
    kind === "spark" ? 2 + Math.random() * 5 : kind === "ornament" || kind === "star" ? 11 + Math.random() * 14 : 9 + Math.random() * 16;
  return {
    kind,
    x: Math.random() * w,
    y: fromTop ? -20 - Math.random() * h * 0.35 : Math.random() * h,
    vx: (Math.random() - 0.5) * (kind === "ornament" ? 0.4 : 0.85),
    vy: kind === "spark" ? 0.14 + Math.random() * 0.35 : 0.35 + Math.random() * 1.15,
    rot: Math.random() * Math.PI * 2,
    vr: (Math.random() - 0.5) * 0.035,
    size,
    alpha: kind === "spark" ? 0.45 + Math.random() * 0.5 : 0.6 + Math.random() * 0.4,
    phase: Math.random() * Math.PI * 2,
  };
}

function burstFireworks(cx: number, cy: number, into: FireworkSpark[]) {
  const color = FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)]!;
  const n = 22 + Math.floor(Math.random() * 16);
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + (Math.random() - 0.5) * 0.2;
    const speed = 1.2 + Math.random() * 2.8;
    into.push({
      x: cx,
      y: cy,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life: 1,
      maxLife: 0.55 + Math.random() * 0.55,
      size: 1.4 + Math.random() * 2.4,
      color,
    });
  }
  /* secondario più piccolo */
  const color2 = FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)]!;
  const n2 = 10 + Math.floor(Math.random() * 8);
  for (let i = 0; i < n2; i++) {
    const a = Math.random() * Math.PI * 2;
    const speed = 0.5 + Math.random() * 1.4;
    into.push({
      x: cx,
      y: cy,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life: 1,
      maxLife: 0.4 + Math.random() * 0.4,
      size: 1 + Math.random() * 1.6,
      color: color2,
    });
  }
}

function drawParticle(ctx: CanvasRenderingContext2D, p: Particle, t: number, dpr: number) {
  const px = p.kind === "spark" ? p.size * 5 : p.size * 2;
  const img = xmasSprite(p.kind, px, dpr);
  ctx.globalAlpha = p.kind === "spark" ? p.alpha * (0.5 + 0.5 * Math.sin(t * 0.01 + p.phase)) : p.alpha;
  ctx.drawImage(img, -px / 2, -px / 2, px, px);
  ctx.globalAlpha = 1;
}

/** Watermark in basso: solo dopo lo scroll oltre l’hero (non copre SCORRI). */
function SeasonGreetingWatermark({ text, hidden, always }: { text: string; hidden?: boolean; /** sempre visibile (riduci-movimento a Capodanno/Befana) */ always?: boolean }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const update = () => {
      const threshold = Math.max(420, Math.round(window.innerHeight * 0.85));
      setVisible(window.scrollY >= threshold);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div className="absolute inset-x-0 bottom-10 flex justify-center sm:bottom-12">
      <span
        className={cn(
          "select-none font-script text-3xl text-[#f5e6c8] drop-shadow-[0_2px_14px_rgba(0,0,0,0.55)] transition-opacity duration-500 light:text-[#7a1f2e] light:drop-shadow-[0_2px_10px_rgba(255,255,255,0.45)] sm:text-4xl",
          (visible || always) && !hidden ? "opacity-90" : "opacity-0",
        )}
      >
        {text}
      </span>
    </div>
  );
}

function Atmosphere({ strong }: { strong: boolean }) {
  return (
    <>
      <div
        className={cn(
          "absolute inset-0",
          strong ? "opacity-[0.55]" : "opacity-[0.42]",
          "bg-[radial-gradient(ellipse_at_center,transparent_48%,rgba(8,20,40,0.4)_100%)] light:bg-[radial-gradient(ellipse_at_center,transparent_52%,rgba(160,190,220,0.28)_100%)] light:opacity-[0.45]",
        )}
      />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_95%_80%_at_50%_100%,rgba(255,140,60,0.16),transparent_70%)] light:bg-[radial-gradient(ellipse_95%_80%_at_50%_100%,rgba(255,170,90,0.1),transparent_70%)]" />
      <div
        className="vc-xmas-glow absolute inset-x-[-10%] bottom-[-10%] h-[55%] opacity-60 light:opacity-35"
        style={{
          maskImage: "linear-gradient(to top, #000 0%, #000 35%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to top, #000 0%, #000 35%, transparent 100%)",
        }}
      />
      {/* stelle/luci sparse — anche statiche con riduci-movimento */}
      <div className="vc-xmas-twinkle absolute left-[12%] top-[18%] size-2.5 rounded-full sm:left-[18%] sm:top-[22%]" />
      <div className="vc-xmas-twinkle vc-xmas-twinkle--b absolute right-[14%] top-[24%] size-2 rounded-full sm:right-[22%] sm:top-[30%]" />
      <div className="vc-xmas-twinkle vc-xmas-twinkle--c absolute left-[38%] top-[12%] size-2 rounded-full sm:left-[40%] sm:top-[16%]" />
      <div className="vc-xmas-twinkle absolute right-[36%] top-[14%] size-1.5 rounded-full opacity-80" />
      <div className="vc-xmas-twinkle vc-xmas-twinkle--b absolute left-[68%] top-[20%] size-2 rounded-full" />
      <div className="vc-xmas-twinkle vc-xmas-twinkle--c absolute right-[8%] top-[42%] size-1.5 rounded-full hidden sm:block" />
      <div className="vc-xmas-twinkle absolute left-[6%] top-[48%] size-2 rounded-full hidden md:block" />
      <div className="vc-xmas-twinkle vc-xmas-twinkle--b absolute left-[52%] top-[8%] size-1.5 rounded-full hidden lg:block" />
    </>
  );
}

/**
 * Atmosfera natalizia su tutto il sito (light + dark).
 * Capodanno (1–7 gen 12): fuochi + «Buon Anno». Befana (6 gen): decor dedicati.
 * Riduci-movimento: decor densi + neve ferma + vignette (niente canvas).
 * Motion on: neve/canvas abbondante + cheer.
 */
export function ChristmasFx() {
  const { caps, ready } = useDeviceFx();
  const [season, setSeason] = useState(false);
  const [newYear, setNewYear] = useState(false);
  const [befana, setBefana] = useState(false);
  const [fxOn, setFxOn] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cheer, setCheer] = useState(false);
  const budget = christmasBudgetFromCaps(caps);
  const greeting = newYear ? "Buon Anno" : "Buon Natale";

  useEffect(() => {
    if (!ready) {
      setSeason(false);
      setNewYear(false);
      setBefana(false);
      setFxOn(false);
      return;
    }

    const sync = () => {
      const inSeason = isChristmasSeason();
      setSeason(inSeason);
      setNewYear(inSeason && isNewYearSeason());
      setBefana(inSeason && isBefanaSeason());
      try {
        if (inSeason) document.documentElement.setAttribute("data-vc-season", "christmas");
        else if (document.documentElement.getAttribute("data-vc-season") === "christmas") {
          document.documentElement.removeAttribute("data-vc-season");
        }
        if (inSeason && isNewYearSeason()) document.documentElement.setAttribute("data-vc-newyear", "1");
        else document.documentElement.removeAttribute("data-vc-newyear");
        if (inSeason && isBefanaSeason()) document.documentElement.setAttribute("data-vc-befana", "1");
        else document.documentElement.removeAttribute("data-vc-befana");
      } catch {
        /* ignore */
      }
      if (!inSeason) {
        setFxOn(false);
        return;
      }
      let phonePreview = false;
      try {
        phonePreview = document.documentElement.classList.contains("vc-phone-preview");
      } catch {
        /* ignore */
      }
      setFxOn(!phonePreview && effectEnabled(EFFECT_KEYS.christmasFx, true));
    };

    sync();
    /* Capodanno / Befana: sync periodico per mezzanotte senza reload. */
    const poll = window.setInterval(sync, 60_000);
    return () => window.clearInterval(poll);
  }, [ready, caps.motion, caps.canvas, caps.particles]);

  useEffect(() => {
    if (!fxOn || !budget.canvas || budget.particles <= 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const maxParticles = budget.particles;
    const allowCheer = budget.boo;
    const dprCap = budget.dprCap;
    const fireworksOn = newYear;
    let w = 0;
    let h = 0;
    let dpr = 1;
    const particles: Particle[] = [];
    const sparks: FireworkSpark[] = [];
    let nextCheerAt = performance.now() + 16000 + Math.random() * 28000;
    let nextBurstAt = performance.now() + 1200 + Math.random() * 1800;
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
      for (let i = 0; i < maxParticles; i++) particles.push(spawn(w, h, Math.random() > 0.25));
    };

    const tick = (now: number) => {
      if (!running) return;
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
        p.x += p.vx * (dt / 16) + Math.sin(p.phase) * 0.28;
        p.y += p.vy * (dt / 16);
        p.rot += p.vr * (dt / 16);
        if (p.y > h + 40 || p.x < -60 || p.x > w + 60) Object.assign(p, spawn(w, h, true));

        ctx.save();
        ctx.translate(p.x, p.y);
        if (p.kind === "flake" || p.kind === "snow" || p.kind === "ornament" || p.kind === "star") ctx.rotate(p.rot);
        drawParticle(ctx, p, now, dpr);
        ctx.restore();
      }

      if (fireworksOn) {
        if (now >= nextBurstAt && sparks.length < 220) {
          nextBurstAt = now + 1800 + Math.random() * 3200;
          const cx = w * (0.12 + Math.random() * 0.76);
          const cy = h * (0.12 + Math.random() * 0.42);
          burstFireworks(cx, cy, sparks);
          if (Math.random() > 0.55) {
            burstFireworks(w * (0.12 + Math.random() * 0.76), h * (0.15 + Math.random() * 0.35), sparks);
          }
        }

        for (let i = sparks.length - 1; i >= 0; i--) {
          const s = sparks[i]!;
          s.life -= (dt / 1000) / s.maxLife;
          s.x += s.vx * (dt / 16);
          s.y += s.vy * (dt / 16);
          s.vy += 0.035 * (dt / 16);
          s.vx *= 0.99;
          if (s.life <= 0) {
            sparks.splice(i, 1);
            continue;
          }
          const a = Math.max(0, Math.min(1, s.life));
          ctx.beginPath();
          ctx.fillStyle = s.color;
          ctx.globalAlpha = a * 0.95;
          ctx.shadowColor = s.color;
          ctx.shadowBlur = 10;
          ctx.arc(s.x, s.y, s.size * (0.6 + a * 0.6), 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.globalAlpha = 1;
        }
      }

      if (allowCheer && now >= nextCheerAt) {
        nextCheerAt = now + 22000 + Math.random() * 38000;
        setCheer(true);
        window.setTimeout(() => setCheer(false), 1600);
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
  }, [fxOn, budget.canvas, budget.particles, budget.boo, budget.dprCap, newYear]);

  if (!season) return null;

  /* Riduci-movimento / FX off: atmosfera + decor pieni (niente canvas). */
  if (!fxOn || !caps.motion) {
    return (
      <div className="pointer-events-none fixed inset-0 z-[40] overflow-hidden" aria-hidden>
        <Atmosphere strong={false} />
        <ChristmasDecor live={false} newYear={newYear} befana={befana} />
        {/* Capodanno e Befana fermi ma ben visibili: niente fuochi animati, quindi cielo pieno e saluto sempre su */}
        {newYear ? <NewYearSky /> : null}
        {befana ? <BefanaSky /> : null}
        <SeasonGreetingWatermark text={befana ? "Buona Befana" : greeting} always={newYear || befana} />
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-[40] overflow-hidden" aria-hidden>
      <Atmosphere strong={!budget.cssOnly} />

      <ChristmasDecor live={caps.continuous} newYear={newYear} befana={befana} />
      {befana ? <BefanaSky /> : null}

      {budget.canvas && budget.particles > 0 ? <canvas ref={canvasRef} className="absolute inset-0 size-full" /> : null}

      {/* watermark dopo l’hero; cheer = versione grande al centro */}
      <SeasonGreetingWatermark text={greeting} hidden={cheer} />
      {budget.boo ? (
        <div
          className={cn(
            "absolute inset-0 flex items-center justify-center transition-opacity duration-500",
            cheer ? "opacity-100" : "opacity-0",
          )}
        >
          <span
            className={cn(
              "select-none font-script text-4xl text-[#f5e6c8] drop-shadow-[0_2px_18px_rgba(0,0,0,0.55)] transition-transform duration-700 ease-out sm:text-6xl",
              "light:text-[#7a1f2e] light:drop-shadow-[0_2px_12px_rgba(255,255,255,0.5)]",
              cheer ? "translate-y-0 scale-100" : "translate-y-5 scale-90",
            )}
          >
            {greeting}
          </span>
        </div>
      ) : null}
    </div>
  );
}
