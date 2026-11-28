"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";

const WEEKS = 12;
const DAY_MS = 86_400_000;
const DAYS_IT = ["L", "M", "M", "G", "V", "S", "D"];

function shift(day: string, n: number) {
  return new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}
function pretty(day: string) {
  return new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
}

/** colore del quadretto: dal vuoto al caramello pieno (50 punti = tutti e cinque i giochi al meglio) */
function tone(p: number) {
  if (!p) return "bg-crema/[0.06]";
  if (p < 10) return "bg-caramel/25";
  if (p < 20) return "bg-caramel/45";
  if (p < 32) return "bg-caramel/70";
  return "bg-ember shadow-[0_0_8px_rgba(240,180,110,0.55)]";
}

/**
 * Calendario a quadretti dei giochi del giorno (idea: heatmap di bklit): 12 settimane, una colonna
 * per settimana (lunedì in alto), più scuro = più punti quel giorno. Oggi ha il bordo.
 */
export function DailyHeatmap({ history, today }: { history: Record<string, number>; today: string }) {
  const reduce = useReducedMotion();
  const dow = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7; /* 0 = lunedì */
  const firstMonday = shift(today, -dow - (WEEKS - 1) * 7);
  const weeks = Array.from({ length: WEEKS }, (_, w) => Array.from({ length: 7 }, (_, d) => shift(firstMonday, w * 7 + d)));
  const played = Object.keys(history).length;
  const total = Object.values(history).reduce((s, p) => s + p, 0);

  return (
    <div className="mt-4 rounded-2xl bg-black/20 p-3 ring-1 ring-sand/10">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-sand/70">Ultime 12 settimane</p>
        <p className="text-[0.7rem] tabular-nums text-crema/50">
          {played} {played === 1 ? "giorno" : "giorni"} · {total} pt
        </p>
      </div>
      <div className="flex gap-[3px]">
        <div className="mr-1 grid grid-rows-7 gap-[3px] text-[0.5rem] leading-none text-crema/35">
          {DAYS_IT.map((d, i) => (
            <span key={i} className="flex h-[13px] items-center">
              {i % 2 === 0 ? d : ""}
            </span>
          ))}
        </div>
        {weeks.map((days, w) => (
          <div key={w} className="grid grid-rows-7 gap-[3px]">
            {days.map((day, d) => {
              const future = day > today;
              const p = history[day] || 0;
              return (
                <motion.span
                  key={day}
                  title={future ? undefined : `${pretty(day)}: ${p ? `${p} pt` : "nessun gioco"}`}
                  initial={reduce ? false : { opacity: 0, scale: 0.4 }}
                  animate={{ opacity: future ? 0 : 1, scale: 1 }}
                  transition={{ delay: reduce ? 0 : (w * 7 + d) * 0.004, duration: 0.25 }}
                  className={cn(
                    "size-[13px] rounded-[3px]",
                    tone(p),
                    day === today && "ring-1 ring-crema/70",
                  )}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-end gap-1 text-[0.55rem] text-crema/40">
        meno
        {[0, 5, 15, 25, 40].map((p) => (
          <span key={p} className={cn("size-[9px] rounded-[2px]", tone(p))} />
        ))}
        più
      </div>
    </div>
  );
}
