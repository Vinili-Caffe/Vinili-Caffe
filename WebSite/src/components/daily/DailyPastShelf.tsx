"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion} from "motion/react";
import { ChevronLeft, ChevronRight, History } from "lucide-react";
import { loadDailyHistory, type DailyKind, type DailyPast } from "@/lib/daily";
import { cn } from "@/lib/cn";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion-safe";

const SIDE = 3; /* copertine visibili per lato */

function prettyDay(day: string) {
  return new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
}

/**
 * Lo scaffale dei giorni scorsi: le canzoni o le copertine già indovinate (mai quella di oggi),
 * a coverflow come uno scaffale di dischi (idea: Motion «carousel coverflow»).
 */
export function DailyPastShelf({ kind }: { kind: DailyKind }) {
  const reduce = useReducedMotionSafe();
  const [items, setItems] = useState<DailyPast[] | null>(null);
  const [i, setI] = useState(0);

  useEffect(() => {
    let alive = true;
    void loadDailyHistory(kind).then((r) => {
      if (alive) setItems(r?.items || []);
    });
    return () => {
      alive = false;
    };
  }, [kind]);

  if (!items || !items.length) return null;
  const cur = items[Math.min(i, items.length - 1)]!;
  const go = (n: number) => setI(Math.max(0, Math.min(items.length - 1, n)));

  return (
    <section className="mx-auto mt-14 w-full max-w-5xl px-4 pb-6" aria-label="I giorni scorsi">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-caramel">
            <History className="size-3.5" /> I giorni scorsi
          </p>
          <h2 className="mt-1 font-display text-3xl text-crema">
            {kind === "song" ? "Le canzoni già uscite" : "Le copertine già uscite"}
          </h2>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => go(i - 1)}
            disabled={i <= 0}
            aria-label="Più recente"
            className="grid size-10 place-items-center rounded-full bg-crema/[0.06] text-crema ring-1 ring-sand/20 transition hover:bg-crema/10 disabled:opacity-30"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => go(i + 1)}
            disabled={i >= items.length - 1}
            aria-label="Più vecchia"
            className="grid size-10 place-items-center rounded-full bg-crema/[0.06] text-crema ring-1 ring-sand/20 transition hover:bg-crema/10 disabled:opacity-30"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
      </div>

      {/* lo scaffale: la copertina al centro è dritta e ha il disco che esce dalla busta, le altre girate in prospettiva */}
      <motion.div
        className="relative h-64 select-none overflow-hidden sm:h-80"
        style={{ perspective: 1100 }}
        drag={reduce ? false : "x"}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.18}
        onDragEnd={(_, info) => {
          if (info.offset.x < -50 || info.velocity.x < -400) go(i + 1);
          else if (info.offset.x > 50 || info.velocity.x > 400) go(i - 1);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") go(i + 1);
          if (e.key === "ArrowLeft") go(i - 1);
        }}
        tabIndex={0}
        role="listbox"
        aria-label="Scorri i giorni scorsi"
      >
        {/* riflesso del ripiano */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-caramel/10 to-transparent" />
        {items.map((it, k) => {
          const off = k - i;
          if (Math.abs(off) > SIDE) return null;
          const center = off === 0;
          return (
            <motion.button
              key={it.day}
              type="button"
              role="option"
              aria-selected={center}
              aria-label={`${prettyDay(it.day)}: ${it.title}, ${it.artist}`}
              onClick={() => go(k)}
              className="absolute left-1/2 top-1/2 size-40 sm:size-56"
              initial={false}
              animate={{
                x: `calc(-50% + ${off * (center ? 0 : 62) + Math.sign(off) * (center ? 0 : 70)}%)`,
                y: "-50%",
                rotateY: center ? 0 : off < 0 ? 48 : -48,
                scale: center ? 1 : 0.8,
                zIndex: 20 - Math.abs(off),
                opacity: Math.abs(off) === SIDE ? 0.35 : 1,
              }}
              transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 30 }}
              style={{ transformStyle: "preserve-3d" }}
            >
              {/* il disco che spunta dalla busta (solo la copertina al centro) */}
              <motion.span
                aria-hidden
                className="absolute inset-[4%] rounded-full bg-[repeating-radial-gradient(circle,#0b0705_0_1.5px,#221812_1.5px_3px)] shadow-[0_10px_30px_rgba(0,0,0,0.6)] ring-1 ring-sand/20"
                initial={false}
                animate={{ x: center ? "34%" : "0%", rotate: center && !reduce ? 360 : 0 }}
                transition={
                  center && !reduce
                    ? { x: { type: "spring", stiffness: 140, damping: 18 }, rotate: { duration: 6, ease: "linear", repeat: Infinity } }
                    : { duration: 0.3 }
                }
              >
                <span
                  className="absolute inset-[34%] rounded-full bg-cover bg-center ring-1 ring-black/40"
                  style={{ backgroundImage: `url(${it.cover})` }}
                />
                <span className="absolute inset-[48%] rounded-full bg-espresso" />
              </motion.span>
              <img
                src={it.cover}
                alt=""
                loading="lazy"
                draggable={false}
                className={cn(
                  "relative size-full rounded-xl object-cover ring-1 ring-black/40",
                  center ? "shadow-[0_24px_60px_-18px_rgba(0,0,0,0.9)]" : "shadow-[0_14px_30px_-14px_rgba(0,0,0,0.8)] brightness-75",
                )}
              />
              <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[0.65rem] font-bold tabular-nums text-crema/90 backdrop-blur-sm">
                #{it.n}
              </span>
            </motion.button>
          );
        })}
      </motion.div>

      <AnimatePresence mode="wait">
        <motion.div
          key={cur.day}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
          className="mt-4 text-center"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sand/70">
            {kind === "song" ? "Canzone" : "Copertina"} #{cur.n} · {prettyDay(cur.day)}
          </p>
          <p className="mt-1 font-display text-2xl text-crema">{kind === "cover" && cur.album ? cur.album : cur.title}</p>
          <p className="text-sm text-crema/60">{cur.artist}</p>
        </motion.div>
      </AnimatePresence>
    </section>
  );
}
