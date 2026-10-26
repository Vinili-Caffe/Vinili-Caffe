"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/cn";

function DeathStar({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden>
      <defs>
        <radialGradient id="sw-ds" cx="38%" cy="35%" r="65%">
          <stop offset="0" stopColor="#9aa8c4" />
          <stop offset="0.45" stopColor="#4a5568" />
          <stop offset="1" stopColor="#1a2030" />
        </radialGradient>
        <radialGradient id="sw-ds-dish" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#c9d4e8" />
          <stop offset="0.55" stopColor="#5b6b84" />
          <stop offset="1" stopColor="#2a3348" />
        </radialGradient>
      </defs>
      <circle cx="60" cy="60" r="52" fill="url(#sw-ds)" stroke="rgba(240,230,200,0.25)" strokeWidth="1" />
      <ellipse cx="60" cy="60" rx="52" ry="10" fill="none" stroke="rgba(15,20,30,0.55)" strokeWidth="1.2" />
      <ellipse cx="60" cy="60" rx="52" ry="22" fill="none" stroke="rgba(15,20,30,0.35)" strokeWidth="0.8" />
      <circle cx="42" cy="38" r="16" fill="url(#sw-ds-dish)" stroke="rgba(201,162,39,0.35)" strokeWidth="0.8" />
      <circle cx="42" cy="38" r="4" fill="#1e293b" stroke="rgba(240,230,200,0.4)" strokeWidth="0.6" />
      {/* finestre */}
      {[
        [78, 48],
        [88, 62],
        [72, 72],
        [92, 78],
        [68, 88],
      ].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="3" height="2" rx="0.4" fill="rgba(226,232,240,0.55)" />
      ))}
    </svg>
  );
}

function TieFighter({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 48" className={className} aria-hidden>
      <rect x="2" y="4" width="10" height="40" rx="1" fill="#1e293b" stroke="rgba(148,163,184,0.5)" strokeWidth="0.8" />
      <rect x="68" y="4" width="10" height="40" rx="1" fill="#1e293b" stroke="rgba(148,163,184,0.5)" strokeWidth="0.8" />
      <line x1="12" y1="24" x2="32" y2="24" stroke="#64748b" strokeWidth="2" />
      <line x1="48" y1="24" x2="68" y2="24" stroke="#64748b" strokeWidth="2" />
      <circle cx="40" cy="24" r="10" fill="#0f172a" stroke="#94a3b8" strokeWidth="1.2" />
      <circle cx="40" cy="24" r="4" fill="#38bdf8" opacity="0.85" />
      <circle cx="40" cy="24" r="1.5" fill="#e2e8f0" />
    </svg>
  );
}

function XWing({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 40" className={className} aria-hidden>
      <path d="M8 20 L42 18 L58 18 L92 14 L92 26 L58 22 L42 22 Z" fill="#cbd5e1" stroke="#64748b" strokeWidth="0.7" />
      <path d="M30 8 L48 17 L30 14 Z M30 32 L48 23 L30 26 Z" fill="#94a3b8" />
      <path d="M70 6 L88 16 L70 12 Z M70 34 L88 24 L70 28 Z" fill="#64748b" />
      <circle cx="50" cy="20" r="3" fill="#ef4444" opacity="0.9" />
      <rect x="20" y="17" width="8" height="6" rx="1" fill="#1e293b" />
    </svg>
  );
}

function Lightsaber({
  className,
  color = "#2ea8ff",
  flip,
}: {
  className?: string;
  color?: string;
  flip?: boolean;
}) {
  return (
    <svg viewBox="0 0 28 140" className={cn(className, flip && "-scale-x-100")} aria-hidden>
      <defs>
        <linearGradient id={`sw-blade-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
          <stop offset="0.12" stopColor={color} stopOpacity="0.95" />
          <stop offset="1" stopColor={color} stopOpacity="0.15" />
        </linearGradient>
      </defs>
      <rect x="11" y="8" width="6" height="88" rx="3" fill={`url(#sw-blade-${color.replace("#", "")})`} style={{ filter: `drop-shadow(0 0 8px ${color})` }} />
      <rect x="8" y="96" width="12" height="28" rx="2" fill="#94a3b8" stroke="#475569" strokeWidth="0.8" />
      <rect x="10" y="100" width="8" height="4" fill="#1e293b" />
      <rect x="10" y="108" width="8" height="3" fill={color} opacity="0.85" />
      <circle cx="14" cy="122" r="2.2" fill="#e2e8f0" />
    </svg>
  );
}

function KyberCrystal({ className, color = "#38bdf8" }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 40 56" className={className} aria-hidden>
      <defs>
        <linearGradient id={`sw-ky-${color.replace("#", "")}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="0.35" stopColor={color} />
          <stop offset="1" stopColor="#0f172a" stopOpacity="0.8" />
        </linearGradient>
      </defs>
      <path
        d="M20 2 L34 18 L28 54 L12 54 L6 18 Z"
        fill={`url(#sw-ky-${color.replace("#", "")})`}
        stroke="rgba(240,230,200,0.45)"
        strokeWidth="0.8"
        style={{ filter: `drop-shadow(0 0 10px ${color})` }}
      />
      <path d="M20 6 L28 18 L20 48 L12 18 Z" fill="rgba(255,255,255,0.22)" />
    </svg>
  );
}

function RebelEmblem({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <circle cx="32" cy="32" r="28" fill="none" stroke="#c9a227" strokeWidth="2.2" opacity="0.85" />
      <path
        d="M32 10 L38 28 L56 28 L42 38 L48 56 L32 44 L16 56 L22 38 L8 28 L26 28 Z"
        fill="none"
        stroke="#e4c76b"
        strokeWidth="1.6"
        strokeLinejoin="round"
        opacity="0.9"
      />
    </svg>
  );
}

/**
 * Decorazioni Star Wars ai bordi (come le zucche/pipistrelli Halloween):
 * Death Star, TIE, X-Wing, sabers, kyber, emblem — vive anche a motion ridotto.
 */
export function StarWarsDecor({ live }: { live: boolean }) {
  const sway = (amp: number, dur: number, delay = 0) =>
    live
      ? {
          animate: { y: [-amp, amp, -amp], rotate: [-amp * 0.35, amp * 0.35, -amp * 0.35] },
          transition: { duration: dur, repeat: Infinity, ease: "easeInOut" as const, delay },
        }
      : {};

  return (
    <div className="pointer-events-none fixed inset-0 z-[45] overflow-hidden" aria-hidden>
      {/* Nebulose */}
      <div
        className="absolute -left-32 top-10 size-[28rem] rounded-full opacity-50 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(46,168,255,0.28), transparent 68%)" }}
      />
      <div
        className="absolute -right-28 bottom-0 size-[32rem] rounded-full opacity-45 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(201,162,39,0.22), transparent 65%)" }}
      />
      <div
        className="absolute left-1/3 top-1/2 size-64 -translate-y-1/2 rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(124,58,237,0.2), transparent 70%)" }}
      />

      {/* Death Star — alto destra */}
      <motion.div
        className="absolute right-2 top-16 opacity-80 sm:right-6 sm:top-20"
        animate={live ? { rotate: [0, 4, 0], y: [0, 6, 0] } : undefined}
        transition={live ? { duration: 14, repeat: Infinity, ease: "easeInOut" } : undefined}
      >
        <DeathStar className="w-24 drop-shadow-[0_0_24px_rgba(148,163,184,0.35)] sm:w-36 md:w-44" />
      </motion.div>

      {/* Saber blu — alto sinistra */}
      <motion.div className="absolute left-2 top-24 origin-bottom sm:left-5 sm:top-28" {...sway(5, 6.5)}>
        <Lightsaber color="#2ea8ff" className="h-28 w-6 opacity-90 sm:h-40 sm:w-7" />
      </motion.div>

      {/* Saber rosso — basso destra */}
      <motion.div className="absolute bottom-16 right-3 origin-top sm:bottom-24 sm:right-8" {...sway(4, 7.2, 0.6)}>
        <Lightsaber color="#e11d48" flip className="h-24 w-5 opacity-85 sm:h-36 sm:w-6" />
      </motion.div>

      {/* TIE fighters in volo */}
      <motion.div
        className="absolute left-[-10%] top-[28%] hidden opacity-70 sm:block"
        animate={live ? { x: ["0vw", "120vw"], y: [0, 40, -20, 10] } : undefined}
        transition={live ? { duration: 28, repeat: Infinity, ease: "linear", delay: 2 } : undefined}
      >
        <TieFighter className="w-16 drop-shadow-[0_0_12px_rgba(56,189,248,0.45)] md:w-20" />
      </motion.div>
      <motion.div
        className="absolute left-[-15%] top-[55%] opacity-60"
        animate={live ? { x: ["0vw", "130vw"], y: [0, -30, 20] } : undefined}
        transition={live ? { duration: 36, repeat: Infinity, ease: "linear", delay: 10 } : undefined}
      >
        <TieFighter className="w-12 sm:w-14" />
      </motion.div>

      {/* X-Wing */}
      <motion.div
        className="absolute right-[-12%] top-[40%] opacity-75"
        animate={live ? { x: ["0vw", "-130vw"], y: [0, 25, -15, 5] } : undefined}
        transition={live ? { duration: 32, repeat: Infinity, ease: "linear", delay: 6 } : undefined}
      >
        <XWing className="w-20 drop-shadow-[0_0_14px_rgba(239,68,68,0.35)] sm:w-28" />
      </motion.div>

      {/* Kyber crystals basso sinistra */}
      <div className="absolute bottom-3 left-3 flex items-end gap-1 sm:bottom-5 sm:left-6 sm:gap-2">
        <motion.div {...sway(3, 4.5)}>
          <KyberCrystal color="#38bdf8" className="w-7 opacity-90 sm:w-10" />
        </motion.div>
        <motion.div {...sway(4, 5.2, 0.4)}>
          <KyberCrystal color="#c9a227" className="w-5 opacity-85 sm:w-8" />
        </motion.div>
        <motion.div className="hidden sm:block" {...sway(3.5, 4.8, 0.9)}>
          <KyberCrystal color="#e11d48" className="w-6 opacity-80" />
        </motion.div>
      </div>

      {/* Emblema rebel — basso centro-destra */}
      <motion.div
        className="absolute bottom-28 right-[22%] hidden opacity-40 md:block"
        animate={live ? { rotate: [0, 360] } : undefined}
        transition={live ? { duration: 80, repeat: Infinity, ease: "linear" } : undefined}
      >
        <RebelEmblem className="w-16" />
      </motion.div>

      {/* Scanline / HUD oro sottile */}
      <motion.div
        className="absolute inset-x-0 top-[18%] h-px bg-gradient-to-r from-transparent via-[#c9a227]/50 to-transparent"
        animate={live ? { opacity: [0.15, 0.55, 0.15] } : { opacity: 0.25 }}
        transition={live ? { duration: 5, repeat: Infinity, ease: "easeInOut" } : undefined}
      />
      <motion.div
        className="absolute inset-x-0 bottom-[22%] h-px bg-gradient-to-r from-transparent via-[#2ea8ff]/40 to-transparent"
        animate={live ? { opacity: [0.1, 0.45, 0.1] } : { opacity: 0.2 }}
        transition={live ? { duration: 6.5, repeat: Infinity, ease: "easeInOut", delay: 1 } : undefined}
      />
    </div>
  );
}
