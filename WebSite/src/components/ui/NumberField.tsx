"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Campo numerico custom: niente frecce del sistema, pulsanti − / + del sito.
 * - onChange: a ogni modifica (digitando o coi pulsanti); `null` se il campo è vuoto e `nullable`.
 * - onCommit: quando hai finito (uscita dal campo o clic su − / +), col valore già nei limiti.
 */
export function NumberField({
  value,
  onChange,
  onCommit,
  min,
  max,
  step = 1,
  nullable = false,
  placeholder,
  disabled,
  name,
  id,
  "aria-label": ariaLabel,
  className,
  size = "md",
}: {
  value: number | null;
  onChange?: (n: number | null) => void;
  onCommit?: (n: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  nullable?: boolean;
  placeholder?: string;
  disabled?: boolean;
  name?: string;
  id?: string;
  "aria-label"?: string;
  className?: string;
  size?: "md" | "sm";
}) {
  /* testo mentre scrivi; fuori dal campo si mostra il valore vero */
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value == null ? "" : String(value));

  const clamp = (n: number) => {
    let v = n;
    if (min != null) v = Math.max(min, v);
    if (max != null) v = Math.min(max, v);
    return v;
  };

  const parse = (raw: string): number | null => {
    const t = raw.trim().replace(",", ".");
    if (!t || t === "-") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };

  const commit = (raw: string) => {
    setDraft(null);
    const n = parse(raw);
    if (n == null) {
      const next = nullable ? null : clamp(value ?? min ?? 0);
      if (next !== value) onChange?.(next);
      onCommit?.(next);
      return;
    }
    const next = clamp(n);
    if (next !== value) onChange?.(next);
    onCommit?.(next);
  };

  const bump = (dir: 1 | -1) => {
    const base = value ?? (dir > 0 ? (min ?? 0) - step : (min ?? 0) + step);
    const next = clamp(base + dir * step);
    setDraft(null);
    onChange?.(next);
    onCommit?.(next);
  };

  const btn =
    "flex shrink-0 items-center justify-center text-crema/60 transition hover:bg-crema/[0.06] hover:text-crema disabled:pointer-events-none disabled:opacity-35";
  const h = size === "sm" ? "h-8" : "h-10";

  return (
    <div
      className={cn(
        "mt-1.5 flex w-full items-stretch overflow-hidden rounded-lg bg-espresso/70 ring-1 ring-sand/15 transition hover:ring-sand/25 focus-within:ring-2 focus-within:ring-caramel/45",
        h,
        disabled && "opacity-50",
        className,
      )}
    >
      <button type="button" tabIndex={-1} aria-label="Meno" className={cn(btn, "w-8 border-r border-sand/10")} disabled={disabled || (value != null && min != null && value <= min)} onClick={() => bump(-1)}>
        <Minus className="size-3.5" aria-hidden />
      </button>
      <input
        id={id}
        name={name}
        aria-label={ariaLabel}
        inputMode="numeric"
        autoComplete="off"
        value={shown}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => setDraft(shown)}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d.,-]/g, "");
          setDraft(raw);
          const n = parse(raw);
          if (n != null) onChange?.(n);
          else if (!raw.trim() && nullable) onChange?.(null);
        }}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") {
            e.preventDefault();
            bump(1);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            bump(-1);
          } else if (e.key === "Enter") {
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="min-w-0 flex-1 bg-transparent px-2 text-center text-sm tabular-nums text-crema outline-none placeholder:text-crema/50"
      />
      <button type="button" tabIndex={-1} aria-label="Più" className={cn(btn, "w-8 border-l border-sand/10")} disabled={disabled || (value != null && max != null && value >= max)} onClick={() => bump(1)}>
        <Plus className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}
