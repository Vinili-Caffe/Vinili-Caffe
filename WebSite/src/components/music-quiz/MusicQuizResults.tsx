"use client";

import { motion } from "motion/react";
import { Check, RotateCcw, Trophy, X } from "lucide-react";
import { page } from "@/lib/site";
import { SmartLink } from "@/components/SmartLink";
import { cn } from "@/lib/cn";
import type { MusicQuizDifficulty } from "@/lib/musicQuiz";
import { MusicQuizLeaderboard } from "./MusicQuizLeaderboard";

export type RoundRecap = { title: string; artist: string; cover?: string; correct: boolean; points: number };

const DIFF_LABEL: Record<MusicQuizDifficulty, string> = { "5s": "5 secondi", "3s": "3 secondi", "1s": "1 secondo" };

function verdict(ratio: number) {
  if (ratio >= 0.9) return "Orecchio d'oro.";
  if (ratio >= 0.7) return "Te la cavi alla grande.";
  if (ratio >= 0.45) return "Niente male, ma si può fare meglio.";
  if (ratio > 0) return "Serve un altro giro di ascolti.";
  return "Questa playlist non è proprio la tua.";
}

export function MusicQuizResults({
  packSlug,
  packTitle,
  packCover,
  difficulty,
  score,
  best,
  maxScore,
  correctCount,
  rounds,
  recap,
  onAgain,
  onExit,
}: {
  packSlug: string;
  packTitle: string;
  packCover?: string;
  difficulty: MusicQuizDifficulty;
  score: number;
  best: number;
  maxScore: number;
  correctCount: number;
  rounds: number;
  recap: RoundRecap[];
  onAgain: () => void;
  onExit: () => void;
}) {
  const ratio = maxScore ? score / maxScore : 0;
  const record = score >= best && score > 0;
  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 pb-20 pt-24 sm:pt-28">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-mocha to-roast p-7 text-center ring-1 ring-sand/15"
      >
        {packCover ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={packCover} alt="" className="pointer-events-none absolute inset-0 size-full scale-110 object-cover opacity-15 blur-2xl" />
        ) : null}
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-caramel">{packTitle}</p>
          <motion.p
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 220, damping: 16, delay: 0.1 }}
            className="mt-3 font-display text-7xl font-semibold tabular-nums text-crema"
          >
            {score}
          </motion.p>
          <p className="mt-1 text-sm text-crema/60">su {maxScore} punti</p>
          <p className="mt-4 font-display text-2xl text-crema">{verdict(ratio)}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2 text-sm">
            <span className="rounded-full bg-crema/[0.07] px-3 py-1 text-crema/80 ring-1 ring-sand/15">
              {correctCount} giuste su {rounds}
            </span>
            <span className="rounded-full bg-crema/[0.07] px-3 py-1 text-crema/80 ring-1 ring-sand/15">Ascolto di {DIFF_LABEL[difficulty]}</span>
            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 ring-1", record ? "bg-caramel/20 text-caramel ring-caramel/40" : "bg-crema/[0.07] text-crema/80 ring-sand/15")}>
              <Trophy className="size-3.5" aria-hidden /> {record ? "Nuovo record personale" : `Il tuo record: ${best}`}
            </span>
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={onAgain}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-6 py-3 font-bold text-ink transition hover:-translate-y-0.5"
            >
              <RotateCcw className="size-4" aria-hidden /> Rigioca
            </button>
            <button type="button" onClick={onExit} className="rounded-full px-5 py-3 text-sm font-semibold text-crema/80 ring-1 ring-sand/25 transition hover:bg-crema/[0.06]">
              Cambia difficoltà
            </button>
            <SmartLink href={page("/music-quiz/")} className="rounded-full px-5 py-3 text-sm font-semibold text-crema/80 ring-1 ring-sand/25 transition hover:bg-crema/[0.06]">
              Altri quiz
            </SmartLink>
          </div>
        </div>
      </motion.section>

      {recap.length ? (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-crema/55">Le canzoni</h2>
          <ol className="space-y-2">
            {recap.map((r, i) => (
              <motion.li
                key={`${i}-${r.title}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + i * 0.04 }}
                className="flex items-center gap-3 rounded-2xl bg-roast/70 p-2.5 ring-1 ring-sand/10"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.cover || "/images/logo-disco.png"} alt="" className="size-11 shrink-0 rounded-lg object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-crema">{r.title}</p>
                  <p className="truncate text-xs text-crema/55">{r.artist}</p>
                </div>
                {r.correct ? (
                  <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold tabular-nums text-emerald-300">
                    <Check className="size-4" aria-hidden /> +{r.points}
                  </span>
                ) : (
                  <X className="size-4 shrink-0 text-ember" aria-label="Sbagliata" />
                )}
              </motion.li>
            ))}
          </ol>
        </section>
      ) : null}

      <MusicQuizLeaderboard slug={packSlug} difficulty={difficulty} />
    </div>
  );
}
