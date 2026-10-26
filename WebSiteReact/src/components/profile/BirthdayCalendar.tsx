"use client";

import { useCallback, useEffect, useId, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Cake, ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import { setChromeOpen } from "@/lib/chrome-open";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";
import {
  daysInMonth,
  entryMeta,
  groupByDay,
  leadingBlanks,
  loadBirthdaysMonth,
  shiftMonth,
  type BirthdayEntry,
  type BirthdaysMonth,
} from "@/lib/birthdays";
import { cn } from "@/lib/cn";

const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

/** Overlay calendario compleanni (parity col pop del sito vecchio). */
export function BirthdayCalendar({
  open,
  onClose,
  highlightUserId,
}: {
  open: boolean;
  onClose: () => void;
  highlightUserId?: string | null;
}) {
  const chromeId = useId();
  useBodyScrollLock(open);
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState<BirthdaysMonth | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async (m: number, y: number) => {
    setLoading(true);
    setError(false);
    const out = await loadBirthdaysMonth(m, y);
    setLoading(false);
    if (!out) {
      setError(true);
      return;
    }
    setData(out);
    setMonth(out.month);
    setYear(out.year);
  }, []);

  useEffect(() => {
    if (!open) return;
    setChromeOpen(`bday-${chromeId}`, true);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const n = new Date();
    setMonth(n.getMonth() + 1);
    setYear(n.getFullYear());
    setData(null);
    void load(n.getMonth() + 1, n.getFullYear());
    return () => {
      setChromeOpen(`bday-${chromeId}`, false);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, chromeId, load]);

  const go = (delta: number) => {
    const next = shiftMonth(month, year, delta);
    setMonth(next.month);
    setYear(next.year);
    void load(next.month, next.year);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[12040] flex items-center justify-center overflow-auto overscroll-contain bg-black/60 p-3 backdrop-blur-md sm:p-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`Calendario compleanni ${data?.monthLabel || ""}`}
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              "relative my-auto flex w-[min(96vw,38rem)] max-h-[min(90vh,44rem)] flex-col overflow-hidden rounded-[1.15rem] p-4 shadow-[0_28px_70px_rgba(0,0,0,0.55)]",
              "bg-[linear-gradient(165deg,rgba(28,20,15,0.99),rgba(12,9,7,0.99))]",
              "ring-1 ring-sand/35",
              loading && data && "pointer-events-none opacity-75",
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="mb-3 flex shrink-0 items-center justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => go(-1)}
                  aria-label="Mese precedente"
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-espresso/90 text-crema ring-1 ring-sand/30 transition hover:bg-mocha hover:ring-sand/50"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <h2 className="inline-flex min-w-0 items-center gap-2 text-center text-[1.02rem] font-extrabold capitalize tracking-wide text-crema">
                  <Cake className="size-4 shrink-0 text-sand" />
                  <span className="truncate">
                    {data?.monthLabel || "…"} {year}
                  </span>
                </h2>
                <button
                  type="button"
                  onClick={() => go(1)}
                  aria-label="Mese successivo"
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-espresso/90 text-crema ring-1 ring-sand/30 transition hover:bg-mocha hover:ring-sand/50"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Chiudi"
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-espresso/90 text-crema ring-1 ring-sand/30 hover:bg-mocha"
              >
                <X className="size-4" />
              </button>
            </header>

            <div className={cn("min-h-0 flex-1 overflow-auto pr-0.5", loading && data && "blur-[1px]")}>
              {!data && loading && (
                <div className="grid min-h-40 place-items-center gap-2 text-sm text-crema/70">
                  <Loader2 className="size-5 animate-spin text-sand" />
                  Caricamento calendario…
                </div>
              )}
              {error && !data && (
                <p className="py-10 text-center text-sm text-crema/60">Calendario non disponibile al momento.</p>
              )}
              {data && <CalendarBody data={data} highlightUserId={highlightUserId} />}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function CalendarBody({ data, highlightUserId }: { data: BirthdaysMonth; highlightUserId?: string | null }) {
  const byDay = groupByDay(data.entries);
  const totalDays = daysInMonth(data.month, data.year);
  const lead = leadingBlanks(data.month, data.year);
  const cells: ReactNode[] = [];
  for (let i = 0; i < lead; i++) {
    cells.push(<span key={`e${i}`} className="min-h-14" aria-hidden />);
  }
  for (let d = 1; d <= totalDays; d++) {
    const dayEntries = byDay[d] || [];
    const isToday = data.todayDay === d;
    const hasMine = highlightUserId
      ? dayEntries.some((e) => String(e.userId) === String(highlightUserId))
      : false;
    cells.push(
      <div
        key={d}
        className={cn(
          "flex min-h-14 flex-col gap-0.5 rounded-lg border border-sand/15 bg-crema/[0.03] px-1 py-1",
          isToday && "border-sand/50 shadow-[0_0_10px_rgba(212,168,136,0.16)]",
          dayEntries.length > 0 && "border-sand/35 bg-[rgba(168,118,82,0.1)]",
          hasMine && "border-sand/60 shadow-[0_0_12px_rgba(212,168,136,0.2)]",
        )}
      >
        <span className="text-[0.62rem] font-extrabold lining-nums text-crema/75">{d}</span>
        {dayEntries.length > 0 && (
          <div className="flex min-w-0 flex-col gap-0.5">
            {dayEntries.slice(0, 3).map((e) => (
              <a
                key={e.userId}
                href={e.profileUrl || `/user/?id=${e.userId}`}
                title={e.label || e.displayName}
                className="truncate text-[0.58rem] font-semibold leading-tight text-sand hover:underline"
              >
                {e.displayName}
              </a>
            ))}
            {dayEntries.length > 3 && (
              <span className="text-[0.55rem] font-bold text-crema/45">+{dayEntries.length - 3}</span>
            )}
          </div>
        )}
      </div>,
    );
  }

  return (
    <>
      <div className="mb-2 grid grid-cols-7 gap-1" aria-label="Calendario mensile">
        {WEEKDAYS.map((w) => (
          <span key={w} className="pb-0.5 text-center text-[0.62rem] font-bold uppercase tracking-wider text-crema/45">
            {w}
          </span>
        ))}
        {cells}
      </div>
      <MonthList entries={data.entries} monthLabel={data.monthLabel} year={data.year} highlightUserId={highlightUserId} />
    </>
  );
}

function MonthList({
  entries,
  monthLabel,
  year,
  highlightUserId,
}: {
  entries: BirthdayEntry[];
  monthLabel: string;
  year: number;
  highlightUserId?: string | null;
}) {
  if (!entries.length) {
    return <p className="mt-3 py-2 text-center text-sm text-crema/50">Nessun compleanno registrato per questo mese.</p>;
  }
  return (
    <div className="mt-3 border-t border-sand/15 pt-3">
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-crema/45">Compleanni in {monthLabel}</p>
      <ul className="flex flex-col gap-1.5">
        {entries.map((e) => {
          const mine = highlightUserId && String(e.userId) === String(highlightUserId);
          return (
            <li key={e.userId}>
              <a
                href={e.profileUrl || `/user/?id=${e.userId}`}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm ring-1 transition-colors",
                  mine ? "bg-sand/15 ring-sand/40" : "bg-crema/[0.04] ring-sand/10 hover:bg-crema/[0.07]",
                )}
              >
                <span className="min-w-0 truncate font-semibold text-crema">{e.displayName}</span>
                <span className="shrink-0 text-xs text-crema/55 lining-nums">{entryMeta(e, year)}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
