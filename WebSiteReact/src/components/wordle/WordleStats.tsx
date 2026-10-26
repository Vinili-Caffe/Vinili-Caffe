"use client";

import { motion } from "motion/react";
import { BarChart3, Copy, Flame, Share2, Trophy } from "lucide-react";
import { type WordleStats as Stats } from "@/lib/wordle";
import { cn } from "@/lib/cn";

type Props = {
  stats: Stats;
  shareText?: string | null;
  onShare?: () => void;
  shareLabel?: string;
  onCopy?: () => void;
  copyLabel?: string;
};

/** Contatore del bancone: partite, serie, distribuzione. */
export function WordleStats({ stats, shareText, onShare, shareLabel = "Condividi", onCopy, copyLabel = "Copia risultato" }: Props) {
  const winPct = stats.played ? Math.round((stats.won / stats.played) * 100) : 0;
  const maxBar = Math.max(1, ...stats.distribution);

  const cards = [
    { label: "Giocate", value: stats.played, icon: BarChart3 },
    { label: "% vittorie", value: winPct, icon: Trophy },
    { label: "Serie", value: stats.currentStreak, icon: Flame },
    { label: "Record", value: stats.maxStreak, icon: Flame },
  ];

  return (
    <div className="rounded-3xl bg-roast/70 p-5 ring-1 ring-sand/12 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-caramel">Statistiche</p>
          <h3 className="mt-1 font-display text-2xl font-semibold">Le tue partite</h3>
        </div>
        {shareText && (onShare || onCopy) ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {onCopy ? (
              <button
                type="button"
                onClick={onCopy}
                className="inline-flex items-center gap-2 rounded-full bg-crema/8 px-4 py-2 text-sm font-semibold text-crema ring-1 ring-sand/25 transition hover:bg-crema/12"
              >
                <Copy className="size-4" />
                <span className="hidden sm:inline">{copyLabel}</span>
              </button>
            ) : null}
            {onShare ? (
              <button
                type="button"
                onClick={onShare}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-4 py-2 text-sm font-semibold text-ink transition hover:-translate-y-0.5"
              >
                <Share2 className="size-4" />
                <span className="hidden sm:inline">{shareLabel}</span>
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-5 grid grid-cols-4 gap-2">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl bg-crema/[0.04] px-2 py-3 text-center ring-1 ring-sand/10">
            <p className="font-display text-2xl font-semibold lining-nums text-crema sm:text-3xl">{c.value}</p>
            <p className="mt-0.5 text-[0.65rem] uppercase tracking-wider text-crema/45 sm:text-xs">{c.label}</p>
          </div>
        ))}
      </div>

      <p className="mt-6 text-xs font-semibold uppercase tracking-[0.25em] text-crema/40">Distribuzione</p>
      <ul className="mt-3 space-y-1.5">
        {stats.distribution.map((n, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="w-4 shrink-0 text-sm lining-nums text-crema/55">{i + 1}</span>
            <div className="h-7 flex-1 overflow-hidden rounded-lg bg-crema/[0.04] ring-1 ring-sand/10">
              <motion.div
                className={cn(
                  "flex h-full min-w-[1.75rem] items-center justify-end rounded-lg px-2 text-xs font-semibold lining-nums",
                  n > 0 ? "bg-caramel/80 text-ink" : "bg-crema/8 text-crema/40",
                )}
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(n > 0 ? 12 : 8, (n / maxBar) * 100)}%` }}
                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              >
                {n}
              </motion.div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
