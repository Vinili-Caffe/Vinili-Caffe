"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

const WEEK = ["Lu", "Ma", "Me", "Gi", "Ve", "Sa", "Do"];

function parseIso(v: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(y!, m! - 1, d!);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() == b.getFullYear() && a.getMonth() == b.getMonth() && a.getDate() == b.getDate();
}

function formatIt(iso: string) {
  const d = parseIso(iso);
  if (!d) return "";
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

/** Campo data custom (calendario in portal, niente picker OS). */
export function DateField({
  value,
  onChange,
  min,
  required,
  disabled,
  className,
  "aria-label": ariaLabel,
  id,
  placeholder = "Scegli data…",
}: {
  value: string;
  onChange: (iso: string) => void;
  min?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  id?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const uid = useId();
  const selected = parseIso(value);
  const minDate = min ? parseIso(min) : null;
  const [view, setView] = useState(() => startOfMonth(selected || new Date()));
  const [pos, setPos] = useState({ top: 0, left: 0, place: "below" as "below" | "above" });

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (open && selected) setView(startOfMonth(selected));
  }, [open, selected]);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const el = trigger.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const h = 320;
      const place = window.innerHeight - r.bottom < h && r.top > h ? "above" : "below";
      let left = r.left;
      const w = 280;
      if (left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - 8 - w);
      setPos({ top: place === "below" ? r.bottom + 6 : r.top - 6, left, place });
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

  const monthLabel = view.toLocaleDateString("it-IT", { month: "long", year: "numeric" });

  return (
    <div ref={box} className="relative min-w-0">
      <button
        ref={trigger}
        type="button"
        id={id}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={`${uid}-cal`}
        aria-label={ariaLabel}
        aria-required={required || undefined}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={cn(
          "inline-flex w-full items-center justify-between gap-2 rounded-xl bg-espresso/70 px-3 py-2 text-left text-sm text-crema outline-none ring-1 ring-sand/15 transition",
          "hover:bg-espresso/85 focus-visible:ring-caramel/50 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      >
        <span className={cn(!value && "text-crema/45")}>{value ? formatIt(value) : placeholder}</span>
        <CalendarDays className="size-4 shrink-0 text-crema/50" aria-hidden />
      </button>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {open ? (
              <motion.div
                ref={panel}
                id={`${uid}-cal`}
                role="dialog"
                aria-label={ariaLabel || "Calendario"}
                initial={{ opacity: 0, y: pos.place === "below" ? -6 : 6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: pos.place === "below" ? -6 : 6, scale: 0.98 }}
                transition={{ duration: 0.14 }}
                style={{
                  position: "fixed",
                  top: pos.place === "below" ? pos.top : undefined,
                  bottom: pos.place === "above" ? window.innerHeight - pos.top : undefined,
                  left: pos.left,
                  width: 280,
                }}
                className="z-[120] rounded-2xl bg-roast/97 p-3 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)] ring-1 ring-sand/15 backdrop-blur-xl"
              >
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
                    <span key={w} className="py-1 text-center text-[0.65rem] font-bold uppercase tracking-wider text-crema/40">
                      {w}
                    </span>
                  ))}
                  {cells.map((d, i) => {
                    if (!d) return <span key={`e-${i}`} />;
                    const iso = toIso(d);
                    const disabledDay = !!(minDate && d < new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate()));
                    const on = selected ? sameDay(d, selected) : false;
                    const today = sameDay(d, new Date());
                    return (
                      <button
                        key={iso}
                        type="button"
                        disabled={disabledDay}
                        onClick={() => {
                          onChange(iso);
                          setOpen(false);
                        }}
                        className={cn(
                          "inline-flex aspect-square items-center justify-center rounded-xl text-sm lining-nums transition",
                          disabledDay && "cursor-not-allowed text-crema/25",
                          !disabledDay && !on && "text-crema/80 hover:bg-crema/10",
                          on && "bg-caramel font-semibold text-ink",
                          !on && today && "ring-1 ring-caramel/40",
                        )}
                      >
                        {d.getDate()}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}
