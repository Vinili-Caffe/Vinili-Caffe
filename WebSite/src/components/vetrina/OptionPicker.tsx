"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/cn";

export type PickerOption = { value: string; label: string };

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * Selettore con ricerca (al posto del "muro" di chip): un pulsante apre un pannello con
 * casella di ricerca ed elenco scorrevole. Singola o multipla scelta, con limite opzionale.
 */
export function OptionPicker({
  options,
  value,
  onChange,
  multiple = false,
  max,
  placeholder,
  searchPlaceholder = "Cerca…",
  icon,
  allLabel,
  className,
  align = "left",
}: {
  options: PickerOption[];
  value: string[];
  onChange: (next: string[]) => void;
  multiple?: boolean;
  max?: number;
  placeholder: string;
  searchPlaceholder?: string;
  icon?: ReactNode;
  /** solo scelta singola: voce per togliere il filtro ("Tutte le categorie") */
  allLabel?: string;
  className?: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<CSSProperties | null>(null);

  /* il pannello vive in document.body (fixed): nessun contenitore con overflow nascosto può tagliarlo */
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const b = trigger.current?.getBoundingClientRect();
      if (!b) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const width = Math.min(416, vw - 24);
      let left = align === "right" ? b.right - width : b.left;
      left = Math.max(12, Math.min(left, vw - width - 12));
      const below = vh - b.bottom;
      const up = below < 340 && b.top > below;
      setPos(up ? { position: "fixed", left, width, bottom: vh - b.top + 8 } : { position: "fixed", left, width, top: b.bottom + 8 });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (root.current?.contains(t) || panel.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.setTimeout(() => input.current?.focus(), 30);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const shown = useMemo(() => {
    const n = norm(q.trim());
    const list = n ? options.filter((o) => norm(o.label).includes(n) || norm(o.value).includes(n)) : options;
    /* le scelte già fatte in cima */
    return [...list.filter((o) => value.includes(o.value)), ...list.filter((o) => !value.includes(o.value))];
  }, [options, q, value]);

  const full = Boolean(multiple && max && value.length >= max);
  const labelOf = (v: string) => options.find((o) => o.value === v)?.label || v;

  function pick(v: string) {
    if (!multiple) {
      onChange(value[0] === v ? [] : [v]);
      setOpen(false);
      setQ("");
      return;
    }
    if (value.includes(v)) onChange(value.filter((x) => x !== v));
    else if (!full) onChange([...value, v]);
  }

  const summary = !value.length ? placeholder : multiple ? `${value.length} ${value.length === 1 ? "scelta" : "scelte"}` : labelOf(value[0]);

  return (
    <div ref={root} className={cn("relative", className)}>
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center gap-2 rounded-2xl px-4 py-2.5 text-left text-sm font-semibold ring-1 transition-colors [&>svg:first-child]:size-4 [&>svg:first-child]:shrink-0",
          value.length && !multiple ? "bg-ember/15 text-ember ring-ember/40" : "bg-espresso/60 text-crema/70 ring-sand/15 hover:text-crema hover:ring-sand/30",
        )}
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{summary}</span>
        <ChevronDown className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {multiple && value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {value.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 rounded-full bg-ember/15 py-1 pl-3 pr-1.5 text-sm font-semibold text-ember ring-1 ring-ember/30">
              {labelOf(v)}
              <button type="button" aria-label={`Togli ${labelOf(v)}`} onClick={() => onChange(value.filter((x) => x !== v))} className="rounded-full p-0.5 hover:bg-ember/20">
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {typeof document !== "undefined" &&
        createPortal(
      <AnimatePresence>
        {open && pos && (
          <motion.div
            ref={panel}
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            style={pos}
            className="z-[80] overflow-hidden rounded-2xl bg-roast/95 shadow-[0_30px_70px_-25px_rgba(0,0,0,0.95)] ring-1 ring-sand/20 backdrop-blur-xl"
            data-lenis-prevent
          >
            <label className="flex items-center gap-2 border-b border-sand/10 px-4 py-3">
              <Search className="size-4 shrink-0 text-crema/40" />
              <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder} className="min-w-0 flex-1 bg-transparent text-sm text-crema outline-none placeholder:text-crema/35" />
              {q && (
                <button type="button" aria-label="Pulisci" onClick={() => setQ("")} className="text-crema/40 hover:text-crema">
                  <X className="size-4" />
                </button>
              )}
            </label>
            <ul className="max-h-72 overflow-y-auto p-1.5" role="listbox" aria-multiselectable={multiple}>
              {!multiple && allLabel && !q && (
                <Row selected={!value.length} onClick={() => (onChange([]), setOpen(false))}>
                  {allLabel}
                </Row>
              )}
              {shown.map((o) => {
                const sel = value.includes(o.value);
                return (
                  <Row key={o.value} selected={sel} disabled={!sel && full} onClick={() => pick(o.value)}>
                    {o.label}
                  </Row>
                );
              })}
              {!shown.length && <li className="px-3 py-6 text-center text-sm text-crema/45">Nessun risultato per “{q}”.</li>}
            </ul>
            {multiple && (
              <div className="flex items-center justify-between border-t border-sand/10 px-4 py-2.5 text-xs text-crema/45">
                <span>
                  {value.length}
                  {max ? `/${max}` : ""} scelte{full ? " · limite raggiunto" : ""}
                </span>
                <button type="button" onClick={() => setOpen(false)} className="rounded-full bg-crema px-3 py-1 font-bold text-ink">
                  Fatto
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}

function Row({ selected, disabled, onClick, children }: { selected: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <li>
      <button
        type="button"
        role="option"
        aria-selected={selected}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors disabled:opacity-35",
          selected ? "bg-ember/12 font-semibold text-ember" : "text-crema/75 hover:bg-crema/6 hover:text-crema",
        )}
      >
        <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-md ring-1", selected ? "bg-ember text-ink ring-ember" : "ring-sand/30")}>
          {selected && <Check className="size-3" strokeWidth={3} />}
        </span>
        <span className="min-w-0 flex-1 truncate">{children}</span>
      </button>
    </li>
  );
}
