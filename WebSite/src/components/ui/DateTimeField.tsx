"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

const WEEK = ["Lu", "Ma", "Me", "Gi", "Ve", "Sa", "Do"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DDTHH:mm" (ora locale, come input datetime-local) → Date */
function parseLocal(v: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v || "");
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toLocalDateTime(d: Date | number): string {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
}

const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const dayKey = (d: Date) => d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate();

function label(d: Date) {
  const day = d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  return `${day}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Campo data + ora custom (calendario e colonne ore/minuti in un pannello in portal, niente picker del sistema).
 * Valore come input datetime-local: "2026-11-14T21:00", ora locale.
 */
export function DateTimeField({
  value,
  onChange,
  min,
  disabled,
  className,
  "aria-label": ariaLabel,
  placeholder = "Scegli data e ora…",
}: {
  value: string;
  onChange: (v: string) => void;
  /** stesso formato del valore: giorni e orari prima sono spenti */
  min?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const hourCol = useRef<HTMLDivElement>(null);
  const minCol = useRef<HTMLDivElement>(null);
  const uid = useId();
  const selected = parseLocal(value);
  const minDate = min ? parseLocal(min) : null;
  const [view, setView] = useState(() => startOfMonth(selected || new Date()));
  const [pos, setPos] = useState({ top: 0, left: 0, width: 392, place: "below" as "below" | "above", narrow: false });

  /* all'apertura: ora e minuti scelti in vista */
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      for (const col of [hourCol.current, minCol.current]) {
        const on = col?.querySelector<HTMLElement>("[data-on='true']");
        if (col && on) col.scrollTop += on.getBoundingClientRect().top - col.getBoundingClientRect().top - (col.clientHeight - on.clientHeight) / 2;
      }
    }, 30);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const el = trigger.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const narrow = window.innerWidth < 440;
      const w = narrow ? Math.min(300, window.innerWidth - 16) : 392;
      const h = narrow ? 470 : 340;
      const place = window.innerHeight - r.bottom < h && r.top > h ? "above" : "below";
      let left = r.left;
      if (left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - 8 - w);
      setPos({ top: place === "below" ? r.bottom + 6 : r.top - 6, left, width: w, place, narrow });
    };
    update();
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (box.current?.contains(t) || panel.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  const cells = useMemo(() => {
    const first = startOfMonth(view);
    const offset = (first.getDay() + 6) % 7; // lunedì = 0
    const days: (Date | null)[] = [];
    for (let i = 0; i < offset; i++) days.push(null);
    const dim = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    for (let d = 1; d <= dim; d++) days.push(new Date(view.getFullYear(), view.getMonth(), d));
    while (days.length % 7) days.push(null);
    return days;
  }, [view]);

  /** cambia un pezzo (giorno, ora o minuti) tenendo il resto; se finisce prima del minimo, sale al minimo */
  const commit = (patch: { day?: Date; hour?: number; minute?: number }) => {
    const nextHour = new Date();
    nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
    const base = selected || (minDate && minDate > nextHour ? minDate : nextHour);
    const day = patch.day || base;
    let next = new Date(day.getFullYear(), day.getMonth(), day.getDate(), patch.hour ?? base.getHours(), patch.minute ?? base.getMinutes());
    if (minDate && next < minDate) next = new Date(minDate);
    onChange(toLocalDateTime(next));
  };

  const cur = selected || null;
  const sameSelDay = (d: Date) => !!cur && dayKey(d) === dayKey(cur);
  const minDayKey = minDate ? dayKey(minDate) : -1;
  const onMinDay = !!cur && !!minDate && dayKey(cur) === minDayKey;
  const hourOff = (h: number) => onMinDay && h < minDate!.getHours();
  const minuteOff = (m: number) => onMinDay && cur!.getHours() === minDate!.getHours() && m < minDate!.getMinutes();
  const monthLabel = view.toLocaleDateString("it-IT", { month: "long", year: "numeric" });

  const timeBtn = (on: boolean, off: boolean) =>
    cn(
      "flex h-8 w-full shrink-0 items-center justify-center rounded-lg text-sm lining-nums transition",
      on ? "bg-caramel font-semibold text-ink" : off ? "cursor-not-allowed text-crema/25" : "text-crema/80 hover:bg-crema/10",
    );

  return (
    <div ref={box} className="relative min-w-0">
      <button
        ref={trigger}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={`${uid}-dt`}
        aria-label={ariaLabel}
        onClick={() => {
          if (disabled) return;
          /* all'apertura: il mese della data scelta */
          if (!open) setView(startOfMonth(parseLocal(value) || new Date()));
          setOpen(!open);
        }}
        className={cn(
          "inline-flex h-10 w-full items-center justify-between gap-2 rounded-xl bg-espresso/70 px-3 text-left text-sm text-crema outline-none ring-1 ring-sand/15 transition",
          "hover:bg-espresso/85 focus-visible:ring-caramel/50 disabled:cursor-not-allowed disabled:opacity-50",
          open && "ring-caramel/50",
          className,
        )}
      >
        <span className={cn("truncate first-letter:uppercase", !cur && "text-crema/45")}>{cur ? label(cur) : placeholder}</span>
        <CalendarClock className="size-4 shrink-0 text-crema/50" aria-hidden />
      </button>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open ? (
              <motion.div
                ref={panel}
                id={`${uid}-dt`}
                role="dialog"
                aria-label={ariaLabel || "Data e ora"}
                initial={{ opacity: 0, y: pos.place === "below" ? -6 : 6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: pos.place === "below" ? -6 : 6, scale: 0.98 }}
                transition={{ duration: 0.14 }}
                style={{
                  position: "fixed",
                  top: pos.place === "below" ? pos.top : undefined,
                  bottom: pos.place === "above" ? window.innerHeight - pos.top : undefined,
                  left: pos.left,
                  width: pos.width,
                }}
                className="z-[120] rounded-2xl bg-roast/97 p-3 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)] ring-1 ring-sand/15 backdrop-blur-xl"
              >
                <div className={cn("flex gap-3", pos.narrow && "flex-col")}>
                  {/* calendario */}
                  <div className={cn(pos.narrow ? "w-full" : "w-[264px] shrink-0")}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        aria-label="Mese precedente"
                        onClick={() => setView((v) => addMonths(v, -1))}
                        className="inline-flex size-8 items-center justify-center rounded-full bg-crema/6 text-crema ring-1 ring-sand/15 hover:bg-crema/10"
                      >
                        <ChevronLeft className="size-4" />
                      </button>
                      <p className="font-display text-base font-semibold capitalize text-crema">{monthLabel}</p>
                      <button
                        type="button"
                        aria-label="Mese successivo"
                        onClick={() => setView((v) => addMonths(v, 1))}
                        className="inline-flex size-8 items-center justify-center rounded-full bg-crema/6 text-crema ring-1 ring-sand/15 hover:bg-crema/10"
                      >
                        <ChevronRight className="size-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-7 gap-0.5">
                      {WEEK.map((w) => (
                        <span key={w} className="py-1 text-center text-xs font-semibold text-crema/40">
                          {w}
                        </span>
                      ))}
                      {cells.map((d, i) => {
                        if (!d) return <span key={`e-${i}`} />;
                        const off = minDayKey > 0 && dayKey(d) < minDayKey;
                        const on = sameSelDay(d);
                        const today = dayKey(d) === dayKey(new Date());
                        return (
                          <button
                            key={d.getDate()}
                            type="button"
                            disabled={off}
                            onClick={() => commit({ day: d })}
                            className={cn(
                              "inline-flex aspect-square items-center justify-center rounded-xl text-sm lining-nums transition",
                              off && "cursor-not-allowed text-crema/25",
                              !off && !on && "text-crema/80 hover:bg-crema/10",
                              on && "bg-caramel font-semibold text-ink",
                              !on && today && "ring-1 ring-caramel/40",
                            )}
                          >
                            {d.getDate()}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* ore e minuti */}
                  <div className={cn("flex gap-1.5", pos.narrow ? "h-36" : "h-[276px] flex-1 border-l border-sand/10 pl-3")}>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <p className="pb-1 text-center text-xs font-semibold text-crema/40">Ora</p>
                      <div ref={hourCol} className="flex flex-1 flex-col gap-0.5 overflow-y-auto py-8 overscroll-contain [scrollbar-width:none] [mask-image:linear-gradient(to_bottom,transparent,black_14%,black_86%,transparent)] [&::-webkit-scrollbar]:hidden">
                        {HOURS.map((h) => {
                          const on = !!cur && cur.getHours() === h;
                          const off = hourOff(h);
                          return (
                            <button key={h} type="button" data-on={on} disabled={off} onClick={() => commit({ hour: h })} className={timeBtn(on, off)}>
                              {pad(h)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <p className="pb-1 text-center text-xs font-semibold text-crema/40">Min</p>
                      <div ref={minCol} className="flex flex-1 flex-col gap-0.5 overflow-y-auto py-8 overscroll-contain [scrollbar-width:none] [mask-image:linear-gradient(to_bottom,transparent,black_14%,black_86%,transparent)] [&::-webkit-scrollbar]:hidden">
                        {MINUTES.map((m) => {
                          const on = !!cur && cur.getMinutes() === m;
                          const off = minuteOff(m);
                          return (
                            <button key={m} type="button" data-on={on} disabled={off} onClick={() => commit({ minute: m })} className={timeBtn(on, off)}>
                              {pad(m)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 border-t border-sand/10 pt-3">
                  <p className="min-w-0 truncate text-xs text-crema/55 first-letter:uppercase">{cur ? label(cur) : "Nessuna data"}</p>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="inline-flex items-center rounded-full bg-caramel px-3.5 py-1.5 text-xs font-semibold text-ink"
                  >
                    Fatto
                  </button>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}
