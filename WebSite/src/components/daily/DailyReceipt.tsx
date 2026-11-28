"use client";

import { useState } from "react";
import { AnimatePresence, motion} from "motion/react";
import { Copy, Receipt } from "lucide-react";
import { DAILY_GAMES, type DailyMe } from "@/lib/daily";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion-safe";

function prettyDay(day: string) {
  return new Intl.DateTimeFormat("it-IT", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${day}T12:00:00Z`),
  );
}

/** riga a puntini: «Wordle ............ 6 pt» */
function dots(left: string, right: string, width = 30) {
  const n = Math.max(2, width - left.length - right.length);
  return `${left} ${".".repeat(n)} ${right}`;
}

/**
 * Lo scontrino del bar con i giochi del giorno (idea: Kokonut «receipt printer»): esce dalla stampante
 * riga per riga, con i punti di ogni gioco, il totale e la serie. Si copia per condividerlo.
 */
export function DailyReceipt({ me }: { me: DailyMe }) {
  const reduce = useReducedMotionSafe();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const done = me.todayGames || {};
  const day = me.today || "";
  const total = DAILY_GAMES.reduce((s, g) => s + (done[g.id]?.p || 0), 0);
  const lines = DAILY_GAMES.map((g) => dots(g.label, done[g.id] ? `${done[g.id]!.p} pt` : "--"));
  const text = [
    "VINILI & CAFFÈ",
    "giochi del giorno",
    prettyDay(day),
    "-".repeat(30),
    ...lines,
    "-".repeat(30),
    dots("TOTALE", `${total} pt`),
    dots("Serie", `${me.streak ?? 0} giorni`),
    "",
    "grazie, torna domani",
  ].join("\n");

  function copy() {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  }

  const rows = [
    { t: "VINILI & CAFFÈ", c: "text-center text-base font-bold tracking-[0.2em]" },
    { t: "giochi del giorno", c: "text-center text-[0.7rem] uppercase tracking-[0.25em] opacity-70" },
    { t: prettyDay(day), c: "text-center text-[0.7rem] opacity-60" },
    { t: "-".repeat(30), c: "opacity-40" },
    ...lines.map((t) => ({ t, c: "" })),
    { t: "-".repeat(30), c: "opacity-40" },
    { t: dots("TOTALE", `${total} pt`), c: "font-bold" },
    { t: dots("Serie", `${me.streak ?? 0} giorni`), c: "" },
    { t: "grazie, torna domani ☕", c: "pt-2 text-center text-[0.7rem] italic opacity-70" },
  ];

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-crema/[0.06] px-3 py-2.5 text-sm font-semibold text-crema ring-1 ring-sand/15 transition hover:bg-crema/10"
      >
        <Receipt className="size-4 text-caramel" /> {open ? "Chiudi lo scontrino" : "Lo scontrino di oggi"}
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            key="receipt"
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            {/* la bocca della stampante */}
            <div className="mx-3 mt-3 h-2 rounded-full bg-black/60 shadow-[inset_0_2px_3px_rgba(0,0,0,0.9)]" />
            <motion.div
              initial={reduce ? false : { y: -40 }}
              animate={{ y: 0 }}
              transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
              className="relative mx-5 -mt-1 bg-paper px-4 pb-6 pt-4 font-mono text-[0.72rem] leading-relaxed text-ink shadow-[0_14px_30px_-12px_rgba(0,0,0,0.8)]"
              style={{
                /* bordo seghettato in fondo, come lo strappo dello scontrino */
                WebkitMaskImage:
                  "linear-gradient(#000 0 0) top/100% calc(100% - 8px) no-repeat, conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) bottom/12px 8px repeat-x",
                maskImage:
                  "linear-gradient(#000 0 0) top/100% calc(100% - 8px) no-repeat, conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) bottom/12px 8px repeat-x",
              }}
            >
              {rows.map((r, i) => (
                <motion.p
                  key={i}
                  initial={reduce ? false : { opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: reduce ? 0 : 0.25 + i * 0.07 }}
                  className={`whitespace-pre ${r.c}`}
                >
                  {r.t}
                </motion.p>
              ))}
            </motion.div>
            <button
              type="button"
              onClick={copy}
              className="mx-auto mt-3 flex items-center gap-1.5 text-xs font-semibold text-caramel hover:text-ember"
            >
              <Copy className="size-3.5" /> {copied ? "Copiato" : "Copia lo scontrino"}
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
