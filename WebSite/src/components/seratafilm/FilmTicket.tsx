"use client";

import { useState } from "react";
import { AnimatePresence, motion} from "motion/react";
import { Clapperboard, Scissors } from "lucide-react";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion-safe";

/** codice a barre finto ma stabile: righe ricavate dal titolo */
function bars(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return Array.from({ length: 34 }, (_, i) => 1 + (((h >>> (i % 24)) ^ (i * 7)) & 3));
}

/**
 * Il biglietto della serata film (idea: Kokonut «boarding pass»): locandina, titolo, data e ora,
 * con la matrice tratteggiata che si strappa cliccandola, come all'ingresso del cinema.
 */
export function FilmTicket({ title, poster, atMs }: { title: string; poster: string; atMs: number }) {
  const reduce = useReducedMotionSafe();
  const [torn, setTorn] = useState(false);
  const d = new Date(atMs);
  const date = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Rome" }).format(d);
  const time = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" }).format(d);
  const code = bars(title);

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 16, rotate: -1.5 }}
      animate={{ opacity: 1, y: 0, rotate: -1.5 }}
      whileHover={reduce ? undefined : { rotate: 0, y: -2 }}
      transition={{ type: "spring", stiffness: 220, damping: 20 }}
      className="mx-auto mt-8 flex w-full max-w-xl text-left text-ink drop-shadow-[0_20px_30px_rgba(0,0,0,0.55)]"
    >
      {/* corpo del biglietto */}
      <div className="relative flex min-w-0 flex-1 gap-4 rounded-l-2xl bg-paper p-4 sm:p-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={poster} alt="" className="h-28 w-[4.6rem] shrink-0 rounded-md object-cover shadow-md ring-1 ring-black/20 sm:h-32 sm:w-[5.3rem]" />
        <div className="min-w-0 flex-1">
          <p className="inline-flex items-center gap-1.5 text-[0.6rem] font-bold uppercase tracking-[0.28em] text-[#8a4b22]">
            <Clapperboard className="size-3" /> Biglietto · Serata film
          </p>
          <p className="mt-1 line-clamp-2 font-display text-2xl font-semibold leading-tight sm:text-3xl">{title}</p>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-[0.6rem] uppercase tracking-[0.14em] text-ink/55">
            <div>
              <dt>Data</dt>
              <dd className="mt-0.5 text-[0.75rem] font-bold normal-case tracking-normal text-ink first-letter:uppercase">{date}</dd>
            </div>
            <div>
              <dt>Ore</dt>
              <dd className="mt-0.5 text-[0.75rem] font-bold tracking-normal text-ink">{time}</dd>
            </div>
            <div>
              <dt>Sala</dt>
              <dd className="mt-0.5 text-[0.75rem] font-bold normal-case tracking-normal text-ink">Stage Discord</dd>
            </div>
          </dl>
        </div>
        {/* i due mezzi cerchi del taglio */}
        <span aria-hidden className="absolute -right-2.5 -top-2.5 size-5 rounded-full bg-roast" />
        <span aria-hidden className="absolute -bottom-2.5 -right-2.5 size-5 rounded-full bg-roast" />
      </div>

      {/* la matrice: tratteggio, codice a barre, si strappa */}
      <div className="relative w-24 shrink-0 sm:w-28">
        <AnimatePresence>
          {!torn ? (
            <motion.button
              key="stub"
              type="button"
              onClick={() => setTorn(true)}
              title="Strappa il biglietto"
              exit={reduce ? { opacity: 0 } : { x: 60, y: 90, rotate: 28, opacity: 0, transition: { duration: 0.7, ease: [0.4, 0, 0.2, 1] } }}
              className="group flex size-full flex-col items-center justify-between rounded-r-2xl border-l-2 border-dashed border-ink/25 bg-paper px-2 py-4"
            >
              <span className="text-[0.55rem] font-bold uppercase tracking-[0.25em] text-ink/50 [writing-mode:vertical-rl]">Ammesso</span>
              <span aria-hidden className="flex h-10 items-end gap-px">
                {code.map((w, i) => (
                  <span key={i} className="h-full bg-ink" style={{ width: w }} />
                ))}
              </span>
              <span className="inline-flex items-center gap-1 text-[0.55rem] font-semibold text-[#8a4b22] opacity-70 transition group-hover:opacity-100">
                <Scissors className="size-3" /> strappa
              </span>
            </motion.button>
          ) : (
            <motion.p
              key="ok"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="grid size-full place-items-center rounded-r-2xl px-2 text-center font-script text-2xl leading-tight text-sand"
            >
              Ci vediamo in sala
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
