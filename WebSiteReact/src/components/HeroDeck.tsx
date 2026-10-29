"use client";

import { useSyncExternalStore } from "react";
import { motion, useReducedMotion } from "motion/react";
import { VinylRecord } from "@/components/VinylRecord";
import { getVinylMusicApi, subscribeVinylMusic } from "@/lib/vinyl-music-bus";
import { cn } from "@/lib/cn";

function DiscordMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 127.14 96.36" aria-hidden className={className} fill="currentColor">
      <path d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15ZM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.44-12.74S54 46 53.89 53s-5.05 12.69-11.44 12.69Zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69Z" />
    </svg>
  );
}

function ChatBubble({ className, delay = 0 }: { className?: string; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      aria-hidden
      className={cn(
        "rounded-2xl rounded-bl-md bg-gradient-to-br from-[#5a4a3e] to-[#3a2c22] px-3.5 py-2.5 shadow-[0_10px_24px_-12px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,230,200,0.12)] ring-1 ring-black/40",
        className,
      )}
      animate={reduce ? undefined : { y: [0, -3, 0], opacity: [0.85, 1, 0.85] }}
      transition={{ duration: 3.2, delay, repeat: Infinity, ease: "easeInOut" }}
    >
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="size-1.5 rounded-full bg-crema/55"
            animate={reduce ? undefined : { opacity: [0.35, 1, 0.35] }}
            transition={{ duration: 1.2, delay: delay + i * 0.18, repeat: Infinity }}
          />
        ))}
      </span>
    </motion.div>
  );
}

/**
 * Giradischi hero stile “deck 3D” (riferimento promo):
 * piatto sospeso, vetro, ombre morbide — tap sul disco = play/pause musica globale.
 */
export function HeroDeck({ className }: { className?: string }) {
  const vinyl = useSyncExternalStore(subscribeVinylMusic, getVinylMusicApi, () => null);
  const playing = Boolean(vinyl?.on);
  const reduce = useReducedMotion();

  return (
    <div
      className={cn("relative w-full", className)}
      style={{ perspective: "1100px" }}
    >
      <motion.div
        className="relative"
        style={{ transformStyle: "preserve-3d" }}
        animate={
          reduce
            ? undefined
            : {
                rotateX: [6, 7.5, 6],
                rotateY: [-8, -6, -8],
                y: [0, -4, 0],
              }
        }
        transition={{ duration: 7.5, repeat: Infinity, ease: "easeInOut" }}
      >
        {/* glow sotto il piatto */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-[12%_8%_8%] rounded-[40%] bg-[radial-gradient(ellipse_at_center,rgba(217,154,91,0.45),transparent_70%)] blur-2xl"
        />

        {/* base deck rialzata */}
        <div
          className={cn(
            "relative mx-auto aspect-square w-[88%] max-w-[17.5rem]",
            "rounded-[1.35rem]",
            "bg-[linear-gradient(155deg,#4a3426_0%,#2a1b12_42%,#1a100a_100%)]",
            "p-[7%]",
            "shadow-[0_28px_50px_-18px_rgba(0,0,0,0.95),0_2px_0_rgba(255,220,180,0.08),inset_0_1px_0_rgba(255,230,200,0.18),inset_0_-10px_28px_rgba(0,0,0,0.45)]",
            "ring-1 ring-black/50",
          )}
          style={{ transform: "translateZ(12px)" }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[1.35rem] bg-[radial-gradient(ellipse_at_30%_20%,rgba(255,220,180,0.14),transparent_55%)]"
          />

          {/* platter metallico */}
          <div
            className="relative size-full rounded-full p-[3%] shadow-[0_16px_28px_-8px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.35)]"
            style={{
              background:
                "conic-gradient(from 210deg,#f0ece6,#9a958c,#e8e4dc,#6f6a63,#f4f0ea,#8a857c,#e4e0d8)",
            }}
          >
            <button
              type="button"
              onClick={() => vinyl?.toggle()}
              aria-label={playing ? "Metti in pausa la musica" : "Avvia la musica"}
              className={cn(
                "relative block size-full rounded-full outline-none",
                "shadow-[inset_0_0_0_1px_rgba(0,0,0,0.65),0_8px_20px_-6px_rgba(0,0,0,0.75)]",
                "transition-transform duration-200 ease-out active:scale-[0.985]",
                "focus-visible:ring-2 focus-visible:ring-caramel/70 focus-visible:ring-offset-2 focus-visible:ring-offset-espresso",
              )}
            >
              <motion.div
                className="size-full will-change-transform"
                animate={playing && !reduce ? { rotate: 360 } : { rotate: 0 }}
                transition={
                  playing && !reduce
                    ? { duration: 60 / 33.333, repeat: Infinity, ease: "linear" }
                    : { duration: 0.6, ease: [0.22, 1, 0.36, 1] }
                }
              >
                <VinylRecord className="size-full drop-shadow-[0_6px_14px_rgba(0,0,0,0.55)]" />
              </motion.div>

              {/* specular highlight sul disco */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-[4%] rounded-full bg-[conic-gradient(from_200deg,transparent_0deg,rgba(255,245,230,0.22)_28deg,transparent_70deg,transparent_200deg,rgba(255,245,230,0.1)_230deg,transparent_270deg)]"
              />
            </button>
          </div>

          {/* braccio metallico */}
          <div
            aria-hidden
            className="pointer-events-none absolute right-[4%] top-[6%] z-10 h-[72%] w-[38%]"
            style={{ transform: "translateZ(18px)" }}
          >
            <svg viewBox="0 0 80 120" className="size-full overflow-visible">
              <defs>
                <linearGradient id="hero-arm" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#f7f3ec" />
                  <stop offset="0.45" stopColor="#cfc8bc" />
                  <stop offset="1" stopColor="#7a7468" />
                </linearGradient>
                <filter id="hero-arm-sh" x="-30%" y="-30%" width="160%" height="160%">
                  <feDropShadow dx="0" dy="2" stdDeviation="1.4" floodColor="#000" floodOpacity="0.45" />
                </filter>
              </defs>
              <g filter="url(#hero-arm-sh)">
                <circle cx="62" cy="14" r="9" fill="#1a140f" stroke="#cfc8bc" strokeWidth="1.2" />
                <circle cx="62" cy="14" r="4.2" fill="url(#hero-arm)" />
                <path
                  d="M62 14 L58 52 Q56 68 42 78 L22 92"
                  fill="none"
                  stroke="url(#hero-arm)"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                />
                <g transform="rotate(-32 20 94)">
                  <ellipse cx="20" cy="96" rx="8" ry="2.4" fill="#000" opacity="0.28" />
                  <rect x="12" y="90" width="16" height="7" rx="1.6" fill="url(#hero-arm)" stroke="#1a140f" strokeWidth="0.6" />
                  <rect x="14" y="96.5" width="3" height="2" rx="0.4" fill="#1a140f" />
                </g>
              </g>
            </svg>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export function HeroDiscordBadge({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.span
      aria-hidden
      className={cn(
        "inline-flex size-11 items-center justify-center rounded-full",
        "bg-gradient-to-br from-[#7289da] to-[#4752c4] text-white",
        "shadow-[0_12px_28px_-8px_rgba(88,101,242,0.85),inset_0_1px_0_rgba(255,255,255,0.35),inset_0_-2px_0_rgba(0,0,0,0.25)]",
        "ring-1 ring-white/25",
        className,
      )}
      whileHover={reduce ? undefined : { y: -2, scale: 1.05 }}
      transition={{ type: "spring", stiffness: 420, damping: 22 }}
    >
      <DiscordMark className="size-[1.35rem]" />
    </motion.span>
  );
}

export function HeroChatStack({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col items-end gap-2", className)} aria-hidden>
      <ChatBubble className="mr-3 scale-90 opacity-80" delay={0.4} />
      <ChatBubble delay={0} />
    </div>
  );
}

export function HeroMenuDots({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-1.5 px-1", className)} aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className="size-1.5 rounded-full bg-crema/35 shadow-[0_1px_0_rgba(0,0,0,0.35)]" />
      ))}
    </span>
  );
}
