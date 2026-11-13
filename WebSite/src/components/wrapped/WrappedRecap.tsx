"use client";

import { motion, useReducedMotion } from "motion/react";
import { RotateCcw, Share2 } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { VinylRecord } from "@/components/VinylRecord";
import { fmt, type WrappedPayload } from "@/lib/wrapped";
import { moodForStoryKey } from "@/lib/wrappedMoods";
import type { StoryCard } from "@/lib/wrappedStories";

const ease = [0.22, 1, 0.36, 1] as const;

/**
 * Ultima scheda del Wrapped: il retro della copertina.
 * In alto chi sei, poi i numeri grossi e sotto la scaletta di tutte le schede viste, ognuna col suo dato.
 */
export function WrappedRecap({
  data,
  cards,
  accent,
  onShare,
  onReplay,
}: {
  data: WrappedPayload;
  cards: StoryCard[];
  accent: string;
  onShare: () => void;
  onReplay: () => void;
}) {
  const still = useReducedMotion();
  const a = data.allTime;
  const tracks = cards.filter((c) => c.key !== "hello" && c.key !== "share" && c.key !== "role" && c.stat);
  const role = cards.find((c) => c.key === "role");
  /* livello, classifica e top %: badge sotto il nome (messaggi e vocale stanno già nella scaletta) */
  const pills: { label: string; strong?: boolean }[] = [
    { label: `Livello ${fmt(a.level)}` },
    { label: `#${fmt(a.allTimeRank)} in classifica` },
    ...(a.betterThanPct > 0 ? [{ label: `Top ${Math.max(1, 100 - a.betterThanPct)}% del server`, strong: true }] : []),
  ];

  return (
    <div
      className="mx-auto w-full max-w-xl cursor-default text-left"
      onClick={(e) => e.stopPropagation()}
    >
      {/* copertina: disco che spunta dalla busta, avatar sopra */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease }}
        className="relative overflow-hidden rounded-[1.75rem] bg-[#f4e9d8]/[0.06] p-5 ring-1 ring-[#c4a07a]/25 backdrop-blur-md sm:p-6"
      >
        <motion.div
          className="pointer-events-none absolute -right-16 -top-16 size-48 opacity-60 sm:-right-12 sm:-top-12 sm:size-56"
          animate={still ? undefined : { rotate: 360 }}
          transition={{ duration: 18, ease: "linear", repeat: Infinity }}
          aria-hidden
        >
          <VinylRecord className="size-full" />
        </motion.div>
        <div className="relative flex items-center gap-4">
          <span className="shrink-0 rounded-full p-[3px]" style={{ background: accent }}>
            <Avatar userId={data.user.id} src={data.user.avatarUrl || undefined} name={data.user.displayName} className="size-16 sm:size-20" noPresence />
          </span>
          <div className="min-w-0 pr-16 sm:pr-24">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.24em]" style={{ color: accent }}>
              Vinili Wrapped · {data.year}
            </p>
            <p className="mt-1 truncate font-display text-3xl font-semibold leading-tight text-[#f4e9d8] sm:text-4xl">{data.user.displayName}</p>
            <p className="mt-0.5 truncate text-sm text-[#f4e9d8]/70">{role ? role.title : data.archetype.label}</p>
          </div>
        </div>

        <div className="relative mt-4 flex flex-wrap gap-2">
          {pills.map((p, i) => (
            <motion.span
              key={p.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.07, duration: 0.4, ease }}
              className={
                p.strong
                  ? "inline-flex rounded-full px-3 py-1 text-xs font-semibold text-[#1a120c]"
                  : "inline-flex rounded-full bg-black/25 px-3 py-1 text-xs font-semibold text-[#f4e9d8] ring-1 ring-[#f4e9d8]/15"
              }
              style={p.strong ? { background: accent } : undefined}
            >
              {p.label}
            </motion.span>
          ))}
        </div>
      </motion.div>

      {/* la scaletta del tuo anno: ogni scheda vista, col suo dato */}
      {tracks.length ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.5, ease }}
          className="mt-3 rounded-[1.75rem] bg-black/25 p-4 ring-1 ring-[#f4e9d8]/10 sm:p-5"
        >
          <p className="px-1 text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-[#c4a07a]/80">Lato B · la tua scaletta</p>
          <ol className="mt-2">
            {tracks.map((t, i) => {
              const tone = moodForStoryKey(t.key).accent;
              return (
                <motion.li
                  key={t.key}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.25 + i * 0.07, duration: 0.4, ease }}
                  className="flex items-center gap-3 border-b border-dashed border-[#f4e9d8]/10 px-1 py-2.5 last:border-b-0"
                >
                  <span className="w-6 shrink-0 font-mono text-xs text-[#f4e9d8]/35 lining-nums">{String(i + 1).padStart(2, "0")}</span>
                  <span className="size-2 shrink-0 rounded-full" style={{ background: tone }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-[#f4e9d8]">{t.title === t.stat ? t.kicker : t.title}</span>
                    {t.title === t.stat ? null : <span className="block truncate text-[0.7rem] uppercase tracking-[0.14em] text-[#f4e9d8]/40">{t.kicker}</span>}
                  </span>
                  <span className="shrink-0 text-right font-display text-lg font-semibold lining-nums" style={{ color: tone }}>
                    {t.stat}
                  </span>
                </motion.li>
              );
            })}
          </ol>
        </motion.div>
      ) : null}

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 + tracks.length * 0.07, duration: 0.4, ease }}
        className="mt-4 flex flex-wrap items-center justify-center gap-2"
      >
        <button
          type="button"
          onClick={onShare}
          className="inline-flex min-h-11 items-center gap-2 rounded-full px-6 text-sm font-semibold text-[#1a120c] shadow-[0_12px_40px_-12px_rgba(240,180,110,0.55)] transition hover:brightness-105 active:scale-[0.98]"
          style={{ background: accent }}
        >
          <Share2 className="size-4" aria-hidden /> Condividi il tuo anno
        </button>
        <button
          type="button"
          onClick={onReplay}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#f4e9d8]/10 px-5 text-sm font-semibold text-[#f4e9d8] ring-1 ring-[#f4e9d8]/15 transition hover:bg-[#f4e9d8]/15"
        >
          <RotateCcw className="size-4" aria-hidden /> Rigira il disco
        </button>
      </motion.div>
    </div>
  );
}
