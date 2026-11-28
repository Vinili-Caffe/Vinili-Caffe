"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion} from "motion/react";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion-safe";

/** secondi alla prossima mezzanotte di Roma (quando cambiano canzone e copertina) */
function secondsToRomeMidnight() {
  const now = new Date();
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  const done = Number(p.hour) * 3600 + Number(p.minute) * 60 + Number(p.second);
  return Math.max(0, 86400 - done);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** una tessera che gira come sul tabellone delle partenze */
function Flap({ ch }: { ch: string }) {
  const reduce = useReducedMotionSafe();
  return (
    <span className="relative inline-grid h-11 w-8 place-items-center overflow-hidden rounded-md bg-[#141010] font-mono text-2xl font-bold tabular-nums text-[#f4e9d8] shadow-[inset_0_-2px_0_rgba(0,0,0,0.6),0_6px_14px_-6px_rgba(0,0,0,0.9)] ring-1 ring-black/70 [perspective:200px] sm:h-14 sm:w-10 sm:text-3xl">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={ch}
          initial={reduce ? { opacity: 0 } : { rotateX: -90, opacity: 0.4 }}
          animate={reduce ? { opacity: 1 } : { rotateX: 0, opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { rotateX: 90, opacity: 0.4 }}
          transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
          className="col-start-1 row-start-1 [backface-visibility:hidden] [transform-origin:50%_50%]"
        >
          {ch}
        </motion.span>
      </AnimatePresence>
      {/* la fessura a metà tessera */}
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-black/80" />
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-white/[0.04]" />
    </span>
  );
}

/**
 * Conto alla rovescia alla prossima canzone/copertina, a tessere che girano (idea: Kokonut «split-flap text»).
 */
export function SplitFlapCountdown({ label = "Prossima tra" }: { label?: string }) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    setLeft(secondsToRomeMidnight());
    const id = window.setInterval(() => setLeft(secondsToRomeMidnight()), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (left == null) return null;
  const h = pad(Math.floor(left / 3600));
  const m = pad(Math.floor((left % 3600) / 60));
  const s = pad(left % 60);
  const groups = [h, m, s];
  return (
    <div className="mt-4 flex flex-col items-center" aria-label={`${label} ${h} ore ${m} minuti ${s} secondi`} role="timer">
      <p className="mb-2 text-[0.65rem] font-bold uppercase tracking-[0.22em] text-crema/50">{label}</p>
      <div className="flex items-center gap-1.5" aria-hidden>
        {groups.map((g, gi) => (
          <span key={gi} className="flex items-center gap-1">
            {g.split("").map((c, ci) => (
              <Flap key={ci} ch={c} />
            ))}
            {gi < 2 ? <span className="px-0.5 font-mono text-2xl font-bold text-caramel">:</span> : null}
          </span>
        ))}
      </div>
    </div>
  );
}
