"use client";

import type { CSSProperties } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/cn";






/* ───────── xmasSoft1: lucine vere e neve morbida al posto dei disegni piatti ───────── */

/** colori delle lampadine: soprattutto bianco caldo e ambra, qualche rossa e verde */
const BULB_COLORS = ["#ffe2a3", "#ff9f43", "#ffe2a3", "#e8454f", "#ffe2a3", "#3fbf7f", "#ffcf70"];
/* Capodanno: champagne, oro e argento; Befana: ambra calda e viola */
const BULB_COLORS_NEW_YEAR = ["#fff1c9", "#f5d76e", "#ffffff", "#e6c068", "#fff6e0", "#cfd8e6"];
const BULB_COLORS_BEFANA = ["#ffcf70", "#b48cff", "#ffe2a3", "#e8a54f", "#ffcf70", "#8f6bd8"];
const SWAGS = 4; /* festoni del filo */
const PER_SWAG = 9; /* lampadine per festone */
const SAG = 11; /* quanto cala il filo a metà festone (px): poco, così le lampadine non coprono la barra */

/** altezza del filo (px) in un punto 0..1 della larghezza: archi che calano fra un aggancio e l'altro */
function wireY(u: number) {
  const k = (u * SWAGS) % 1;
  return 1 + SAG * (1 - (2 * k - 1) ** 2);
}

/**
 * Fila di lucine vere in cima: un filo scuro che cala in festoni, lampadine di vetro con il portalampada,
 * il riflesso e un alone di luce morbido. Brillano piano, a turno.
 */
function StringLights({ live, palette = BULB_COLORS }: { live: boolean; palette?: string[] }) {
  const n = SWAGS * PER_SWAG;
  const bulbs = Array.from({ length: n }, (_, i) => {
    const u = (i + 0.5) / n;
    const y = wireY(u);
    /* inclinazione della lampadina = pendenza del filo in quel punto */
    const dy = wireY(Math.min(1, u + 0.004)) - wireY(Math.max(0, u - 0.004));
    const tilt = Math.max(-28, Math.min(28, (Math.atan2(dy, 0.008 * 1400) * 180) / Math.PI));
    return { u, y, tilt, color: palette[i % palette.length]!, i };
  });
  /* il filo: tanti punti della stessa curva */
  const pts = Array.from({ length: 241 }, (_, k) => {
    const u = k / 240;
    return `${(u * 1000).toFixed(1)},${wireY(u).toFixed(1)}`;
  });
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-10" aria-hidden>
      <svg viewBox="0 0 1000 24" preserveAspectRatio="none" className="absolute inset-x-0 top-0 h-6 w-full">
        <polyline points={pts.join(" ")} fill="none" stroke="rgba(20,14,10,0.85)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
        <polyline points={pts.join(" ")} fill="none" stroke="rgba(255,220,170,0.12)" strokeWidth="0.6" vectorEffect="non-scaling-stroke" transform="translate(0,-0.6)" />
      </svg>
      {bulbs.map((b) => (
        <span
          key={b.i}
          className={cn("absolute", b.i % 2 === 1 && "hidden sm:block")}
          style={{ left: `${b.u * 100}%`, top: `${b.y}px`, transform: `translateX(-50%) rotate(${b.tilt}deg)`, transformOrigin: "50% 0" }}
        >
          {/* portalampada */}
          <span className="mx-auto block h-[6px] w-[5px] rounded-t-[1px] bg-gradient-to-b from-[#3a3a36] to-[#141412] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]" />
          {/* alone di luce */}
          <motion.span
            className="absolute left-1/2 top-[9px] block size-9 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ background: `radial-gradient(circle, ${b.color}55 0%, ${b.color}22 35%, transparent 70%)` }}
            initial={false}
            animate={live ? { opacity: [0.55, 1, 0.7, 1, 0.55], scale: [0.9, 1.06, 0.95, 1.04, 0.9] } : { opacity: 0.85, scale: 1 }}
            transition={live ? { duration: 3.2 + (b.i % 5) * 0.55, repeat: Infinity, ease: "easeInOut", delay: (b.i * 0.37) % 3 } : undefined}
          />
          {/* il vetro: goccia con il riflesso */}
          <span
            className="relative mx-auto -mt-px block h-[13px] w-[9px] rounded-[50%_50%_46%_46%/38%_38%_62%_62%]"
            style={{
              background: `radial-gradient(circle at 36% 28%, rgba(255,255,255,0.95) 0 12%, ${b.color} 38%, color-mix(in srgb, ${b.color} 60%, #000) 100%)`,
              boxShadow: `0 0 6px 1px ${b.color}aa, 0 0 14px 3px ${b.color}44`,
            }}
          />
        </span>
      ))}
    </div>
  );
}

/** neve ferma e morbida (chi ha riduci-movimento la vede comunque): puntini sfocati, più piccoli e più tenui lontano */
function StaticSnow() {
  const flakes = Array.from({ length: 34 }, (_, i) => {
    const r = (n: number) => {
      const x = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453;
      return x - Math.floor(x);
    };
    const size = 2 + r(1) * 4.5;
    return { t: `${r(2) * 96}%`, l: `${r(3) * 98}%`, size, o: 0.18 + (size / 6.5) * 0.45, hideSm: i % 3 === 0 };
  });
  return (
    <div className="vc-xmas-static-snow absolute inset-0">
      {flakes.map((f, i) => (
        <span
          key={i}
          className={cn("vc-xmas-flake absolute rounded-full", f.hideSm && "hidden sm:block")}
          style={
            {
              top: f.t,
              left: f.l,
              width: f.size,
              height: f.size,
              opacity: f.o,
              background: "radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(235,245,255,0.6) 45%, transparent 75%)",
              filter: f.size < 3.5 ? "blur(0.6px)" : "blur(0.3px)",
              "--vc-xmas-flake-delay": `${(i % 8) * 0.45}s`,
              "--vc-xmas-flake-dur": `${5.5 + (i % 5) * 0.7}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

/**
 * Natale: lucine vere in cima e neve morbida (niente più disegni ai bordi che coprivano i contenuti).
 * Capodanno: fuochi statici. Befana (6 gen): scopa, cappello, calza, carbone.
 * Con motion: luci che pulsano e leggero sway.
 */
export function ChristmasDecor({
  live,
  newYear = false,
  befana = false,
}: {
  live: boolean;
  newYear?: boolean;
  befana?: boolean;
}) {
  return (
    <>
      <StaticSnow />
      <StringLights live={live} palette={newYear ? BULB_COLORS_NEW_YEAR : befana ? BULB_COLORS_BEFANA : BULB_COLORS} />

    </>
  );
}

/* ───────── Capodanno e Befana fermi (riduci-movimento): ben visibili ma senza animazioni ───────── */

const NEW_YEAR_BURSTS: { left: string; top: string; size: number; color: string; hideSm?: boolean }[] = [
  { left: "9%", top: "16%", size: 170, color: "#f5d76e" },
  { left: "30%", top: "8%", size: 110, color: "#ff8fa8", hideSm: true },
  { left: "70%", top: "9%", size: 120, color: "#9fd3ff", hideSm: true },
  { left: "91%", top: "17%", size: 160, color: "#e6c068" },
];

/** uno scoppio fermo: due anelli di puntini che sfumano verso l'esterno, alone morbido al centro */
function BokehBurst({ size, color }: { size: number; color: string }) {
  const dots = Array.from({ length: 46 }, (_, i) => {
    const r = (n: number) => {
      const x = Math.sin(i * 91.7 + n * 37.1 + size) * 9301.17;
      return x - Math.floor(x);
    };
    const ring = i < 28 ? 1 : 0.62;
    const ang = (i / (i < 28 ? 28 : 18)) * Math.PI * 2 + r(1) * 0.2;
    const dist = (size / 2) * ring * (0.82 + r(2) * 0.2);
    return { x: Math.cos(ang) * dist, y: Math.sin(ang) * dist + dist * 0.08, s: 2 + r(3) * 3.2 * ring, o: 0.35 + r(4) * 0.55 };
  });
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div className="absolute inset-[18%] rounded-full" style={{ background: `radial-gradient(circle, ${color}55 0%, ${color}14 45%, transparent 70%)` }} />
      {dots.map((p, i) => (
        <span
          key={i}
          className="absolute left-1/2 top-1/2 rounded-full"
          style={{
            width: p.s,
            height: p.s,
            opacity: p.o,
            transform: `translate(calc(-50% + ${p.x}px), calc(-50% + ${p.y}px))`,
            background: `radial-gradient(circle, #fff 0%, ${color} 45%, transparent 75%)`,
            boxShadow: `0 0 6px ${color}`,
          }}
        />
      ))}
    </div>
  );
}

/** Cielo di Capodanno fermo (riduci-movimento): pochi scoppi luminosi ai lati, il centro resta libero. */
export function NewYearSky() {
  return (
    <>
      {NEW_YEAR_BURSTS.map((b, i) => (
        <div
          key={i}
          className={cn("absolute -translate-x-1/2 opacity-80", b.hideSm && "hidden md:block")}
          style={{ left: b.left, top: b.top }}
        >
          <BokehBurst size={b.size} color={b.color} />
        </div>
      ))}
    </>
  );
}

/** La Befana sulla scopa: solo la sagoma nera, controluce davanti alla luna. */
function BefanaSilhouette({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 80" className={className} aria-hidden>
      <g fill="#0b0706">
        {/* scopa con la saggina */}
        <path d="M14 58 L130 34 L131 37 L15 61 Z" />
        <path d="M16 56 C6 52 0 54 -2 56 C2 58 4 62 0 66 C6 66 12 64 18 62 Z" />
        {/* mantello e corpo */}
        <path d="M60 52 C62 34 80 22 92 26 C100 29 102 40 96 48 C90 54 78 56 70 56 Z" />
        <path d="M60 52 C52 56 44 64 38 72 C52 68 64 62 72 56 Z" />
        {/* testa, cappello, naso */}
        <circle cx="94" cy="22" r="6" />
        <path d="M84 20 L106 16 L92 -2 Z" />
        <path d="M99 23 L106 25 L99 26 Z" />
        {/* sacco sulle spalle */}
        <path d="M70 40 C64 30 72 22 80 26 C86 30 84 40 78 44 Z" />
      </g>
    </svg>
  );
}

/** Cielo della Befana: luna piena in alto a destra (luce morbida e macchie), lei controluce che la attraversa. */
export function BefanaSky() {
  return (
    <div className="absolute right-[6%] top-[12%] sm:right-[8%] sm:top-[13%]" aria-hidden>
      <div className="relative size-24 sm:size-32">
        {/* alone della luna */}
        <div className="absolute inset-[-55%] rounded-full bg-[radial-gradient(circle,rgba(255,240,205,0.28)_0%,rgba(255,240,205,0.08)_40%,transparent_68%)]" />
        {/* la luna: luce da sinistra, macchie morbide */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: [
              "radial-gradient(circle at 34% 30%, #fffaf0 0%, #f6ecd2 38%, #e2d3ad 72%, #c9b98f 100%)",
            ].join(","),
            boxShadow: "0 0 40px 6px rgba(255,236,190,0.35), inset -10px -8px 22px rgba(120,100,60,0.35)",
          }}
        >
          <span className="absolute left-[22%] top-[28%] size-[22%] rounded-full bg-[#cdbf98]/45 blur-[2px]" />
          <span className="absolute left-[55%] top-[48%] size-[16%] rounded-full bg-[#c8b88e]/40 blur-[2px]" />
          <span className="absolute left-[40%] top-[66%] size-[12%] rounded-full bg-[#cdbf98]/35 blur-[1.5px]" />
          <span className="absolute left-[62%] top-[22%] size-[9%] rounded-full bg-[#cdbf98]/30 blur-[1px]" />
        </div>
        {/* lei, controluce */}
        <BefanaSilhouette className="absolute left-[-38%] top-[30%] w-[120%] drop-shadow-[0_0_6px_rgba(255,236,190,0.25)]" />
      </div>
    </div>
  );
}
