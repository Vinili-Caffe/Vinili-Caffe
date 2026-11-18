"use client";

import type { CSSProperties } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/cn";

function Wreath({ className, gid }: { className?: string; gid: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <radialGradient id={gid} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#2f6b3a" />
          <stop offset="1" stopColor="#143d1f" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="38" fill="none" stroke={`url(#${gid})`} strokeWidth="14" />
      <circle cx="50" cy="50" r="38" fill="none" stroke="#1f4f2a" strokeWidth="3" opacity="0.5" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
        const a = (deg * Math.PI) / 180;
        const x = 50 + Math.cos(a) * 38;
        const y = 50 + Math.sin(a) * 38;
        return <circle key={deg} cx={x} cy={y} r="3.2" fill={deg % 90 === 0 ? "#c41e3a" : "#d4af37"} />;
      })}
      <path d="M42 18 C46 8 54 8 58 18 L50 28 Z" fill="#c41e3a" />
      <path d="M44 16 C48 10 52 10 56 16" fill="none" stroke="#d4af37" strokeWidth="2" />
    </svg>
  );
}

function Tree({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 100" className={className} aria-hidden>
      <path d="M40 6 L58 28 L50 28 L66 48 L56 48 L72 72 L8 72 L24 48 L14 48 L30 28 L22 28 Z" fill="#1f6b3a" />
      <path d="M40 6 L52 28 L40 24 L54 48 L40 42 L62 72 L18 72 L40 42 L26 48 L40 24 L28 28 Z" fill="#2f8a4a" opacity="0.55" />
      <rect x="34" y="72" width="12" height="16" rx="2" fill="#6b3f1f" />
      <circle cx="40" cy="8" r="4" fill="#f5d76e" />
      <circle cx="32" cy="36" r="2.2" fill="#c41e3a" />
      <circle cx="48" cy="42" r="2.2" fill="#d4af37" />
      <circle cx="28" cy="58" r="2.4" fill="#f0f4ff" />
      <circle cx="52" cy="60" r="2.4" fill="#c41e3a" />
      <circle cx="40" cy="50" r="2" fill="#3ecf6e" />
    </svg>
  );
}

function Gift({ className, color = "#c41e3a" }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 70 60" className={className} aria-hidden>
      <rect x="8" y="22" width="54" height="34" rx="4" fill={color} />
      <rect x="8" y="14" width="54" height="12" rx="3" fill={color} opacity="0.85" />
      <rect x="30" y="14" width="10" height="42" fill="#d4af37" />
      <rect x="8" y="28" width="54" height="8" fill="#d4af37" />
      <path d="M35 14 C28 4 18 8 22 16 M35 14 C42 4 52 8 48 16" fill="none" stroke="#d4af37" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function CandyCane({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 90" className={className} aria-hidden>
      <path d="M28 78 C28 40 28 28 20 18 C14 10 8 12 8 20" fill="none" stroke="#f8f4f0" strokeWidth="10" strokeLinecap="round" />
      <path
        d="M28 78 C28 40 28 28 20 18 C14 10 8 12 8 20"
        fill="none"
        stroke="#c41e3a"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray="9 11"
      />
    </svg>
  );
}

function Stocking({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 70" className={className} aria-hidden>
      <path
        d="M14 8 H34 V22 C34 22 38 28 38 36 C38 48 34 54 28 58 C22 62 18 66 12 66 C6 66 4 60 6 54 C8 48 10 42 10 34 V8 Z"
        fill="#c41e3a"
      />
      <rect x="12" y="4" width="24" height="10" rx="2" fill="#f0f4ff" />
      <circle cx="24" cy="28" r="2.2" fill="#d4af37" />
      <circle cx="20" cy="40" r="1.8" fill="#d4af37" />
      <circle cx="28" cy="44" r="1.8" fill="#f5d76e" />
    </svg>
  );
}

function Holly({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 60 50" className={className} aria-hidden>
      <path d="M8 28 C18 8 28 10 30 22 C32 10 42 8 52 28 C40 24 34 32 30 40 C26 32 20 24 8 28 Z" fill="#1f6b3a" />
      <path d="M12 30 C20 16 26 18 28 26 C24 24 18 28 12 30 Z" fill="#2f8a4a" opacity="0.7" />
      <circle cx="28" cy="34" r="3.2" fill="#c41e3a" />
      <circle cx="34" cy="32" r="2.8" fill="#a01830" />
      <circle cx="31" cy="38" r="2.6" fill="#c41e3a" />
    </svg>
  );
}

function Bell({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 48" className={className} aria-hidden>
      <path d="M20 4 C12 4 8 12 8 20 L8 28 C4 30 2 34 2 38 H38 C38 34 36 30 32 28 L32 20 C32 12 28 4 20 4 Z" fill="#d4af37" />
      <ellipse cx="20" cy="38" rx="18" ry="5" fill="#b8922a" />
      <circle cx="20" cy="40" r="3.5" fill="#c41e3a" />
      <circle cx="20" cy="6" r="2.5" fill="#f5d76e" />
    </svg>
  );
}

function StarOrnament({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <path
        d="M20 2 L24 14 L36 14 L26 22 L30 34 L20 26 L10 34 L14 22 L4 14 L16 14 Z"
        fill="#f5d76e"
        stroke="rgba(180,120,20,0.45)"
        strokeWidth="1"
      />
    </svg>
  );
}

function SnowflakeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <g stroke="rgba(230,245,255,0.85)" strokeWidth="2.2" strokeLinecap="round" fill="none">
        {[0, 60, 120].map((deg) => (
          <path key={deg} d="M20 4 V36 M20 12 L14 8 M20 12 L26 8 M20 28 L14 32 M20 28 L26 32" transform={`rotate(${deg} 20 20)`} />
        ))}
      </g>
    </svg>
  );
}

function FireworkBurst({ className, color = "#f5d76e" }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 80 80" className={className} aria-hidden>
      <circle cx="40" cy="40" r="3.5" fill={color} opacity="0.95" />
      {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => {
        const a = (deg * Math.PI) / 180;
        const x2 = 40 + Math.cos(a) * 28;
        const y2 = 40 + Math.sin(a) * 28;
        return (
          <line
            key={deg}
            x1={40 + Math.cos(a) * 6}
            y1={40 + Math.sin(a) * 6}
            x2={x2}
            y2={y2}
            stroke={color}
            strokeWidth="2.2"
            strokeLinecap="round"
            opacity={0.75 + (deg % 60 === 0 ? 0.2 : 0)}
          />
        );
      })}
      {[15, 75, 135, 195, 255, 315].map((deg) => {
        const a = (deg * Math.PI) / 180;
        return <circle key={`d-${deg}`} cx={40 + Math.cos(a) * 18} cy={40 + Math.sin(a) * 18} r="2" fill={color} opacity="0.85" />;
      })}
    </svg>
  );
}

function WitchHat({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 70 70" className={className} aria-hidden>
      <ellipse cx="35" cy="54" rx="28" ry="7" fill="#2a1a12" opacity="0.9" />
      <path d="M35 8 L52 48 L18 48 Z" fill="#1a1210" />
      <path d="M35 8 L44 40 L26 40 Z" fill="#3a2820" opacity="0.55" />
      <rect x="18" y="44" width="34" height="7" rx="2" fill="#6b1f2a" />
      <circle cx="35" cy="47.5" r="2.4" fill="#d4af37" />
      <path d="M35 8 C30 14 28 20 30 26" fill="none" stroke="#d4af37" strokeWidth="1.6" opacity="0.7" />
    </svg>
  );
}

function Broom({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 110" className={className} aria-hidden>
      <rect x="17" y="4" width="6" height="62" rx="2" fill="#8b5a2b" />
      <path d="M8 64 L20 60 L32 64 L36 100 L20 106 L4 100 Z" fill="#c4a574" />
      <path d="M10 68 L20 64 L30 68 M9 78 L20 74 L31 78 M8 88 L20 84 L32 88" fill="none" stroke="#8b5a2b" strokeWidth="1.4" opacity="0.55" />
      <ellipse cx="20" cy="64" rx="12" ry="4" fill="#6b4226" />
    </svg>
  );
}

function CoalSack({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 70" className={className} aria-hidden>
      <path d="M18 22 C14 28 12 40 14 54 C16 64 24 68 32 68 C40 68 48 64 50 54 C52 40 50 28 46 22 Z" fill="#2c2a28" />
      <path d="M20 24 C18 34 18 48 22 58 C28 54 36 54 42 58 C44 48 44 34 42 24 Z" fill="#3d3a36" opacity="0.55" />
      <path d="M22 18 C24 10 40 10 42 18 L46 24 H18 Z" fill="#5a4030" />
      <path d="M28 10 C30 4 34 4 36 10" fill="none" stroke="#d4af37" strokeWidth="2" strokeLinecap="round" />
      <circle cx="24" cy="48" r="3.2" fill="#1a1816" />
      <circle cx="34" cy="52" r="2.8" fill="#111" />
      <circle cx="40" cy="44" r="2.4" fill="#222" />
    </svg>
  );
}

function BefanaSock({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 72" className={className} aria-hidden>
      <path
        d="M14 10 H34 V24 C34 24 40 30 40 38 C40 50 34 56 28 60 C22 64 16 68 10 68 C4 68 2 62 4 56 C6 50 8 44 8 36 V10 Z"
        fill="#4a2a6a"
      />
      <rect x="12" y="6" width="24" height="10" rx="2" fill="#f0e6d8" />
      <circle cx="22" cy="34" r="2" fill="#d4af37" />
      <circle cx="28" cy="42" r="1.8" fill="#c41e3a" />
      <circle cx="18" cy="48" r="2.2" fill="#1a1816" />
      <circle cx="26" cy="54" r="1.8" fill="#222" />
    </svg>
  );
}

function GarlandLights({ live }: { live: boolean }) {
  /* tante lampadine edge-to-edge: preserveAspectRatio=none → tutta la larghezza viewport */
  const bulbs = Array.from({ length: 36 }, (_, i) => i);
  const W = 1200;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-11 overflow-hidden sm:h-14">
      <svg
        viewBox={`0 0 ${W} 44`}
        preserveAspectRatio="none"
        className="block size-full opacity-95"
        aria-hidden
      >
        <path
          d={`M0 10 Q${W * 0.12} 26 ${W * 0.25} 12 T${W * 0.5} 14 T${W * 0.75} 12 T${W} 16`}
          fill="none"
          stroke="rgba(80,50,30,0.55)"
          strokeWidth="1.8"
          vectorEffect="non-scaling-stroke"
        />
        {bulbs.map((i) => {
          const x = 10 + (i / (bulbs.length - 1)) * (W - 20);
          const y = 10 + Math.sin(i * 0.85) * 7;
          const color = i % 3 === 0 ? "#c41e3a" : i % 3 === 1 ? "#d4af37" : "#3ecf6e";
          return (
            <motion.circle
              key={i}
              cx={x}
              cy={y + 12}
              r="4.5"
              fill={color}
              initial={false}
              animate={live ? { opacity: [0.4, 1, 0.5, 1] } : { opacity: 0.95 }}
              transition={live ? { duration: 1.6 + (i % 5) * 0.22, repeat: Infinity, ease: "easeInOut", delay: i * 0.06 } : undefined}
              style={{ filter: `drop-shadow(0 0 8px ${color})` }}
            />
          );
        })}
      </svg>
    </div>
  );
}

function GarlandLightsLow({ live }: { live: boolean }) {
  const bulbs = Array.from({ length: 28 }, (_, i) => i);
  const W = 1200;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-9 hidden h-8 overflow-hidden opacity-70 sm:block sm:top-11">
      <svg
        viewBox={`0 0 ${W} 32`}
        preserveAspectRatio="none"
        className="block size-full"
        aria-hidden
      >
        <path
          d={`M0 6 Q${W * 0.12} 20 ${W * 0.25} 8 T${W * 0.5} 10 T${W * 0.75} 8 T${W} 12`}
          fill="none"
          stroke="rgba(80,50,30,0.35)"
          strokeWidth="1.2"
          vectorEffect="non-scaling-stroke"
        />
        {bulbs.map((i) => {
          const x = 14 + (i / (bulbs.length - 1)) * (W - 28);
          const y = 6 + Math.sin(i * 1.1) * 5;
          const color = i % 3 === 0 ? "#3ecf6e" : i % 3 === 1 ? "#c41e3a" : "#d4af37";
          return (
            <motion.circle
              key={i}
              cx={x}
              cy={y + 10}
              r="3.2"
              fill={color}
              initial={false}
              animate={live ? { opacity: [0.35, 0.95, 0.45, 0.95] } : { opacity: 0.8 }}
              transition={live ? { duration: 2 + (i % 4) * 0.3, repeat: Infinity, ease: "easeInOut", delay: i * 0.1 } : undefined}
              style={{ filter: `drop-shadow(0 0 5px ${color})` }}
            />
          );
        })}
      </svg>
    </div>
  );
}

/** Neve ferma sparsa: chi ha riduci-movimento la vede comunque. */
function StaticSnow() {
  const flakes: { t: string; l: string; s: string }[] = [
    { t: "6%", l: "4%", s: "w-3 opacity-70" },
    { t: "12%", l: "18%", s: "w-2.5 opacity-55" },
    { t: "8%", l: "32%", s: "w-4 opacity-65" },
    { t: "15%", l: "48%", s: "w-2 opacity-50" },
    { t: "5%", l: "62%", s: "w-3.5 opacity-70" },
    { t: "11%", l: "78%", s: "w-2.5 opacity-55" },
    { t: "7%", l: "90%", s: "w-3 opacity-60" },
    { t: "28%", l: "8%", s: "w-2 opacity-45" },
    { t: "34%", l: "22%", s: "w-3 opacity-50" },
    { t: "40%", l: "40%", s: "w-2.5 opacity-40" },
    { t: "30%", l: "58%", s: "w-3.5 opacity-55" },
    { t: "38%", l: "74%", s: "w-2 opacity-45" },
    { t: "26%", l: "88%", s: "w-3 opacity-50" },
    { t: "52%", l: "12%", s: "w-2.5 opacity-40" },
    { t: "58%", l: "30%", s: "w-2 opacity-35" },
    { t: "48%", l: "52%", s: "w-3 opacity-45" },
    { t: "55%", l: "70%", s: "w-2.5 opacity-40" },
    { t: "62%", l: "86%", s: "w-2 opacity-35" },
    { t: "72%", l: "6%", s: "w-3 opacity-45" },
    { t: "78%", l: "24%", s: "w-2.5 opacity-40" },
    { t: "70%", l: "44%", s: "w-2 opacity-35" },
    { t: "76%", l: "66%", s: "w-3.5 opacity-50" },
    { t: "82%", l: "82%", s: "w-2.5 opacity-40" },
    { t: "88%", l: "14%", s: "w-2 opacity-35" },
    { t: "92%", l: "38%", s: "w-3 opacity-40" },
    { t: "90%", l: "56%", s: "w-2.5 opacity-35" },
    { t: "94%", l: "78%", s: "w-2 opacity-30" },
    { t: "18%", l: "10%", s: "w-1.5 opacity-40 hidden sm:block" },
    { t: "44%", l: "16%", s: "w-1.5 opacity-35 hidden sm:block" },
    { t: "66%", l: "50%", s: "w-2 opacity-30 hidden md:block" },
    { t: "22%", l: "96%", s: "w-2.5 opacity-45 hidden sm:block" },
    { t: "84%", l: "94%", s: "w-2 opacity-35 hidden sm:block" },
  ];
  return (
    <div className="vc-xmas-static-snow absolute inset-0">
      {flakes.map((f, i) => (
        <span
          key={i}
          className={cn("vc-xmas-flake absolute", f.s)}
          style={
            {
              top: f.t,
              left: f.l,
              "--vc-xmas-flake-delay": `${(i % 8) * 0.45}s`,
              "--vc-xmas-flake-dur": `${5.5 + (i % 5) * 0.7}s`,
            } as CSSProperties
          }
        >
          <SnowflakeMark className="size-full drop-shadow-[0_0_4px_rgba(200,230,255,0.35)] light:opacity-90" />
        </span>
      ))}
    </div>
  );
}

/**
 * Decor natalizi ai bordi + neve ferma: sempre, anche con riduci-movimento.
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
  const sway = (amp: number, dur: number, delay = 0) =>
    live
      ? { animate: { rotate: [-amp, amp, -amp] }, transition: { duration: dur, repeat: Infinity, ease: "easeInOut" as const, delay } }
      : {};

  return (
    <>
      <StaticSnow />
      <GarlandLights live={live} />
      <GarlandLightsLow live={live} />

      <Holly className="absolute left-1 top-12 size-10 opacity-90 sm:left-2 sm:top-14 sm:size-14 light:opacity-80" />
      <Holly className="absolute right-1 top-12 size-10 -scale-x-100 opacity-90 sm:right-2 sm:top-14 sm:size-14 light:opacity-80" />
      <Holly className="absolute bottom-16 left-1 size-9 opacity-75 sm:bottom-20 sm:left-2 sm:size-12" />
      <Holly className="absolute bottom-16 right-1 size-9 -scale-x-100 opacity-75 sm:bottom-20 sm:right-2 sm:size-12" />

      <motion.div className="absolute left-3 top-20 sm:left-5 sm:top-24" {...sway(3, 6.5)}>
        <Wreath gid="xmas-wreath-l" className="size-16 drop-shadow-[0_0_16px_rgba(60,140,80,0.45)] sm:size-24 light:opacity-95" />
      </motion.div>
      <motion.div className="absolute right-3 top-20 sm:right-5 sm:top-24" {...sway(3, 7.2, 0.4)}>
        <Wreath gid="xmas-wreath-r" className="size-16 drop-shadow-[0_0_16px_rgba(60,140,80,0.45)] sm:size-24 light:opacity-95" />
      </motion.div>

      <div className="absolute left-[4.5rem] top-14 flex gap-1 sm:left-[7.5rem] sm:top-16 sm:gap-2">
        <motion.div {...sway(5, 4.2)}>
          {befana ? (
            <BefanaSock className="h-12 w-8 drop-shadow-[0_0_8px_rgba(90,50,130,0.4)] sm:h-16 sm:w-11" />
          ) : (
            <Stocking className="h-12 w-8 drop-shadow-[0_0_8px_rgba(196,30,58,0.35)] sm:h-16 sm:w-11" />
          )}
        </motion.div>
        <motion.div className="mt-2 hidden sm:block" {...sway(5, 4.8, 0.3)}>
          <Stocking className="h-14 w-9 drop-shadow-[0_0_8px_rgba(196,30,58,0.35)]" />
        </motion.div>
      </div>
      <div className="absolute right-[4.5rem] top-14 flex gap-1 sm:right-[7.5rem] sm:top-16 sm:gap-2">
        <motion.div className="mt-2 hidden sm:block" {...sway(5, 4.5, 0.2)}>
          {befana ? (
            <BefanaSock className="h-14 w-9 drop-shadow-[0_0_8px_rgba(90,50,130,0.4)]" />
          ) : (
            <Stocking className="h-14 w-9 drop-shadow-[0_0_8px_rgba(196,30,58,0.35)]" />
          )}
        </motion.div>
        <motion.div {...sway(5, 4.1, 0.15)}>
          <Stocking className="h-12 w-8 drop-shadow-[0_0_8px_rgba(196,30,58,0.35)] sm:h-16 sm:w-11" />
        </motion.div>
      </div>

      <motion.div className="absolute left-2 top-[42%] sm:left-4" {...sway(4, 5.5)}>
        <StarOrnament className="size-7 drop-shadow-[0_0_10px_rgba(245,215,110,0.55)] sm:size-10" />
      </motion.div>
      <motion.div className="absolute right-2 top-[38%] sm:right-4" {...sway(4, 6.1, 0.25)}>
        <Bell className="h-10 w-8 drop-shadow-[0_0_10px_rgba(212,175,55,0.45)] sm:h-14 sm:w-11" />
      </motion.div>
      <motion.div className="absolute left-3 top-[58%] hidden sm:block" {...sway(3, 5.8, 0.5)}>
        <Bell className="h-11 w-9 drop-shadow-[0_0_10px_rgba(212,175,55,0.4)]" />
      </motion.div>
      <motion.div className="absolute right-3 top-[55%] hidden sm:block" {...sway(3, 6.4, 0.35)}>
        <StarOrnament className="size-9 drop-shadow-[0_0_10px_rgba(245,215,110,0.5)]" />
      </motion.div>

      {newYear ? (
        <>
          <FireworkBurst
            className="absolute left-[10%] top-[22%] size-14 opacity-80 drop-shadow-[0_0_14px_rgba(245,215,110,0.55)] sm:left-[14%] sm:top-[18%] sm:size-20"
            color="#f5d76e"
          />
          <FireworkBurst
            className="absolute right-[12%] top-[28%] size-12 opacity-75 drop-shadow-[0_0_12px_rgba(255,90,120,0.5)] sm:right-[16%] sm:top-[20%] sm:size-16"
            color="#ff6b8a"
          />
          <FireworkBurst
            className="absolute left-[42%] top-[10%] hidden size-10 opacity-70 sm:block sm:size-14"
            color="#7ec8ff"
          />
          <FireworkBurst
            className="absolute right-[28%] top-[42%] size-11 opacity-65 drop-shadow-[0_0_10px_rgba(120,220,160,0.45)] sm:size-14"
            color="#6fd9a0"
          />
        </>
      ) : null}

      {befana ? (
        <>
          <motion.div className="absolute right-2 top-[48%] sm:right-5 sm:top-[46%]" {...sway(3.5, 6.2, 0.2)}>
            <WitchHat className="size-14 drop-shadow-[0_0_12px_rgba(40,20,10,0.45)] sm:size-20" />
          </motion.div>
          <motion.div className="absolute left-1 top-[46%] -rotate-12 sm:left-3 sm:top-[44%]" {...sway(2.5, 7, 0.4)}>
            <Broom className="h-28 w-10 drop-shadow-[0_0_10px_rgba(100,70,30,0.35)] sm:h-36 sm:w-12" />
          </motion.div>
          <div className="absolute bottom-28 right-2 sm:bottom-32 sm:right-4">
            <CoalSack className="h-14 w-12 opacity-95 drop-shadow-[0_0_10px_rgba(0,0,0,0.35)] sm:h-16 sm:w-14" />
          </div>
        </>
      ) : null}

      <div className="vc-xmas-tree absolute bottom-2 left-2 flex items-end gap-0.5 drop-shadow-[0_0_18px_rgba(40,120,60,0.4)] sm:bottom-3 sm:left-4 sm:gap-1">
        <motion.div {...sway(2.5, 5.8)}>
          <Tree className="h-24 w-[4.75rem] sm:h-32 sm:w-[6.5rem]" />
        </motion.div>
        <div className="mb-0.5 flex flex-col gap-0.5">
          <Gift className="h-8 w-10 opacity-95 sm:h-10 sm:w-12" color="#1f6b3a" />
          <Gift className="h-9 w-11 opacity-95 sm:h-11 sm:w-14" />
        </div>
        <CandyCane className="mb-1 hidden h-14 w-6 opacity-90 sm:block sm:h-16 sm:w-7" />
      </div>

      <div className="absolute bottom-3 right-3 flex items-end gap-1.5 sm:bottom-4 sm:right-5 sm:gap-2">
        {befana ? <CoalSack className="mb-1 h-11 w-10 opacity-90 sm:h-12 sm:w-11" /> : null}
        <Gift className="h-8 w-10 opacity-90 sm:h-10 sm:w-12" color="#1f6b3a" />
        <Gift className="h-10 w-12 opacity-95 sm:h-12 sm:w-14" />
        <motion.div {...sway(4, 4.8, 0.2)}>
          <CandyCane className="h-[4.5rem] w-8 drop-shadow-[0_0_12px_rgba(196,30,58,0.4)] sm:h-24 sm:w-10" />
        </motion.div>
        <motion.div className="hidden sm:block" {...sway(3.5, 5.2, 0.4)}>
          <CandyCane className="h-16 w-7 opacity-85" />
        </motion.div>
      </div>
    </>
  );
}
