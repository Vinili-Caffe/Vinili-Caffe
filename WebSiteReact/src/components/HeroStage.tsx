"use client";

import { useId, useSyncExternalStore } from "react";
import { motion, useReducedMotion } from "motion/react";
import { DISCORD_INVITE } from "@/lib/site";
import { useI18n } from "@/lib/i18n";
import { getVinylMusicApi, subscribeVinylMusic } from "@/lib/vinyl-music-bus";
import { cn } from "@/lib/cn";

function DiscordMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 127.14 96.36" aria-hidden className={className} fill="currentColor">
      <path d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15ZM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.44-12.74S54 46 53.89 53s-5.05 12.69-11.44 12.69Zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69Z" />
    </svg>
  );
}

/** Vinile stile promo: solchi + script oro “Vinili & Caffè” sul disco. */
function HeroVinyl({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, "");
  const grooves = Array.from({ length: 28 }, (_, i) => 18 + i * 1.05);
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <radialGradient id={`${uid}-disc`} cx="42%" cy="38%" r="62%">
          <stop offset="0%" stopColor="#2a2a2a" />
          <stop offset="45%" stopColor="#121212" />
          <stop offset="100%" stopColor="#050505" />
        </radialGradient>
        <radialGradient id={`${uid}-label`} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#f0d5a8" />
          <stop offset="55%" stopColor="#c9945a" />
          <stop offset="100%" stopColor="#8a5a30" />
        </radialGradient>
        <linearGradient id={`${uid}-gold`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffe9c4" />
          <stop offset="50%" stopColor="#e0b06a" />
          <stop offset="100%" stopColor="#b07838" />
        </linearGradient>
        <filter id={`${uid}-soft`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1.2" stdDeviation="1.2" floodColor="#000" floodOpacity="0.55" />
        </filter>
      </defs>

      <circle cx="50" cy="50" r="49.2" fill={`url(#${uid}-disc)`} filter={`url(#${uid}-soft)`} />
      {grooves.map((r, i) => (
        <circle
          key={r}
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={i % 2 ? "#1a1a1a" : "#0a0a0a"}
          strokeWidth="0.55"
        />
      ))}
      <circle cx="50" cy="50" r="49.2" fill="none" stroke="#3a3a3a" strokeWidth="0.4" opacity="0.5" />

      {/* script oro sul vinile (come promo) */}
      <text
        x="50"
        y="34"
        textAnchor="middle"
        fill={`url(#${uid}-gold)`}
        fontSize="7.2"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontStyle="italic"
        letterSpacing="0.4"
        style={{ filter: "drop-shadow(0 0.5px 0.5px rgba(0,0,0,0.65))" }}
      >
        Vinili &amp; Caffè
      </text>

      <circle cx="50" cy="50" r="14.5" fill={`url(#${uid}-label)`} />
      <circle cx="50" cy="50" r="13.4" fill="none" stroke="#6b4426" strokeWidth="0.4" opacity="0.55" />
      <circle cx="50" cy="50" r="2.1" fill="#1a120c" />
      <circle cx="50" cy="50" r="0.7" fill="#c9a46e" opacity="0.7" />
    </svg>
  );
}

function Tonearm({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 90 120" className={className} aria-hidden>
      <defs>
        <linearGradient id={`${uid}-metal`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f5f2ec" />
          <stop offset="45%" stopColor="#c8c2b6" />
          <stop offset="100%" stopColor="#6e6860" />
        </linearGradient>
        <filter id={`${uid}-sh`} x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="2" stdDeviation="1.6" floodColor="#000" floodOpacity="0.5" />
        </filter>
      </defs>
      <g filter={`url(#${uid}-sh)`}>
        <circle cx="68" cy="16" r="11" fill="#1c1611" stroke="#b8b2a6" strokeWidth="1.4" />
        <circle cx="68" cy="16" r="5" fill={`url(#${uid}-metal)`} />
        <circle cx="68" cy="16" r="1.6" fill="#2a241c" />
        <path
          d="M68 16 L64 55 Q62 72 46 84 L24 100"
          fill="none"
          stroke={`url(#${uid}-metal)`}
          strokeWidth="3.6"
          strokeLinecap="round"
        />
        <g transform="rotate(-34 22 102)">
          <ellipse cx="22" cy="105" rx="9" ry="2.6" fill="#000" opacity="0.3" />
          <rect x="12" y="97" width="20" height="9" rx="2" fill={`url(#${uid}-metal)`} stroke="#1a140f" strokeWidth="0.7" />
          <rect x="15" y="105.5" width="3.2" height="2.2" rx="0.4" fill="#1a140f" />
        </g>
      </g>
    </svg>
  );
}

/**
 * Card hero costruita in CSS/SVG (spunto dal promo 3D — niente foto baked).
 * Tap sul disco = play/pause; Entra → Discord.
 */
export function HeroStage({ className }: { className?: string }) {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const vinyl = useSyncExternalStore(subscribeVinylMusic, getVinylMusicApi, () => null);
  const playing = Boolean(vinyl?.on);

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.12, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      className={cn("relative mx-auto w-full max-w-[21rem] sm:max-w-[24rem]", className)}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-12 -z-10 rounded-[3rem] bg-[radial-gradient(circle_at_48%_42%,rgba(217,154,91,0.5),transparent_64%)] blur-3xl"
      />

      <motion.div
        animate={reduce ? undefined : { y: [0, -5, 0] }}
        transition={{ duration: 6.8, repeat: Infinity, ease: "easeInOut" }}
        className={cn(
          "relative overflow-visible rounded-[1.85rem]",
          "bg-[linear-gradient(160deg,rgba(72,52,40,0.55)_0%,rgba(32,22,16,0.72)_48%,rgba(18,12,9,0.82)_100%)]",
          "p-5 shadow-[0_42px_90px_-34px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,230,200,0.14)]",
          "ring-1 ring-white/10 backdrop-blur-xl sm:p-6",
        )}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[1.85rem] bg-[radial-gradient(ellipse_at_85%_10%,rgba(255,200,140,0.12),transparent_40%)]"
        />

        {/* header: Discord + dots */}
        <div className="relative z-[1] flex items-start justify-between">
          <a
            href={DISCORD_INVITE}
            target="_blank"
            rel="noopener"
            aria-label={t("common.discord")}
            className={cn(
              "inline-flex size-12 items-center justify-center rounded-full",
              "bg-gradient-to-br from-[#8091f0] to-[#3f49b8] text-white",
              "shadow-[0_14px_28px_-10px_rgba(88,101,242,0.9),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_-3px_6px_rgba(0,0,0,0.35)]",
              "ring-1 ring-white/25 transition-transform hover:-translate-y-0.5 active:scale-95",
            )}
          >
            <DiscordMark className="size-6" />
          </a>
          <span className="mt-2 flex gap-1.5" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-1.5 rounded-full bg-crema/40 shadow-[0_1px_0_rgba(0,0,0,0.4)]" />
            ))}
          </span>
        </div>

        {/* deck + chat */}
        <div className="relative mt-4">
          {/* base giradischi */}
          <div
            className={cn(
              "relative mx-auto aspect-square w-[86%] max-w-[17rem]",
              "rounded-[1.25rem]",
              "bg-[linear-gradient(155deg,#3f3a36_0%,#252220_40%,#141210_100%)]",
              "p-[8%]",
              "shadow-[0_22px_40px_-14px_rgba(0,0,0,0.95),0_1px_0_rgba(255,255,255,0.12),inset_0_1px_0_rgba(255,255,255,0.16),inset_0_-12px_24px_rgba(0,0,0,0.45)]",
              "ring-1 ring-black/50",
            )}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-[1.25rem] bg-[radial-gradient(ellipse_at_28%_18%,rgba(255,255,255,0.14),transparent_50%)]"
            />

            <button
              type="button"
              onClick={() => vinyl?.toggle()}
              aria-label={playing ? "Metti in pausa la musica" : "Avvia la musica"}
              aria-pressed={playing}
              className={cn(
                "relative block size-full rounded-full outline-none",
                "bg-[conic-gradient(from_200deg,#ece8e0,#8a857c,#f2eee6,#5c5852,#ebe7df,#9a958c)]",
                "p-[2.8%] shadow-[0_12px_22px_-8px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.4)]",
                "transition-transform duration-150 active:scale-[0.98]",
                "focus-visible:ring-2 focus-visible:ring-caramel/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1a1410]",
              )}
            >
              <motion.div
                className="size-full will-change-transform"
                animate={playing && !reduce ? { rotate: 360 } : { rotate: 0 }}
                transition={
                  playing && !reduce
                    ? { duration: 1.8, repeat: Infinity, ease: "linear" }
                    : { duration: 0.55, ease: [0.22, 1, 0.36, 1] }
                }
              >
                <HeroVinyl className="size-full" />
              </motion.div>
              <span
                aria-hidden
                className="pointer-events-none absolute inset-[5%] rounded-full bg-[conic-gradient(from_210deg,transparent_0deg,rgba(255,245,230,0.28)_26deg,transparent_65deg)]"
              />
            </button>

            <Tonearm className="pointer-events-none absolute -right-[2%] top-[2%] z-10 h-[78%] w-[42%]" />

            {/* switch dettaglio in basso a destra base */}
            <span
              aria-hidden
              className="absolute bottom-[5%] right-[7%] size-2.5 rounded-full bg-gradient-to-b from-[#4a4540] to-[#1a1816] shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_1px_2px_rgba(0,0,0,0.6)]"
            />
          </div>

          {/* bolle chat */}
          <div className="pointer-events-none absolute -right-1 top-[22%] flex flex-col items-end gap-2.5 sm:right-0" aria-hidden>
            <motion.span
              className="mr-4 rounded-2xl rounded-br-md bg-gradient-to-br from-[#6a5c50] to-[#3d322a] px-3 py-2 shadow-[0_10px_20px_-10px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,230,200,0.12)] ring-1 ring-black/30"
              animate={reduce ? undefined : { y: [0, -3, 0] }}
              transition={{ duration: 3.4, delay: 0.35, repeat: Infinity, ease: "easeInOut" }}
            >
              <span className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="size-1.5 rounded-full bg-crema/50" />
                ))}
              </span>
            </motion.span>
            <motion.span
              className="rounded-2xl rounded-br-md bg-gradient-to-br from-[#7a6a5c] to-[#45382e] px-3.5 py-2.5 shadow-[0_12px_24px_-10px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,230,200,0.14)] ring-1 ring-black/30"
              animate={reduce ? undefined : { y: [0, -4, 0] }}
              transition={{ duration: 3.1, repeat: Infinity, ease: "easeInOut" }}
            >
              <span className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="size-1.5 rounded-full bg-crema/55" />
                ))}
              </span>
            </motion.span>
          </div>
        </div>

        {/* footer: avatar + Entra */}
        <div className="relative z-[1] mt-5 flex items-center justify-between gap-3 sm:mt-6">
          <div className="flex items-center gap-2" aria-hidden>
            <span className="size-9 rounded-full bg-gradient-to-br from-[#4a3a2e] to-[#1a120c] shadow-md ring-2 ring-[#1a120c]/80" />
            <div className="flex -space-x-2.5">
              {["#d4b48a", "#8b5a2b", "#f0e0c8"].map((c, i) => (
                <span
                  key={c}
                  className="size-8 rounded-full ring-2 ring-[#1a120c]/85"
                  style={{
                    background: `linear-gradient(145deg, ${c}, #2a1a12)`,
                    zIndex: 3 - i,
                  }}
                />
              ))}
            </div>
          </div>

          <motion.a
            href={DISCORD_INVITE}
            target="_blank"
            rel="noopener"
            whileHover={reduce ? undefined : { y: -3, scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            transition={{ type: "spring", stiffness: 420, damping: 22 }}
            className={cn(
              "inline-flex min-w-[8rem] items-center justify-center rounded-full",
              "bg-gradient-to-b from-[#d9a878] to-[#a85d32]",
              "px-8 py-3.5 text-sm font-semibold tracking-wide text-white",
              "shadow-[0_14px_30px_-12px_rgba(168,93,50,0.95),inset_0_1px_0_rgba(255,240,220,0.5),inset_0_-2px_0_rgba(80,40,18,0.4)]",
              "ring-1 ring-sand/25",
            )}
          >
            Entra
            <span className="sr-only"> — {t("common.discord")}</span>
          </motion.a>
        </div>
      </motion.div>
    </motion.div>
  );
}
