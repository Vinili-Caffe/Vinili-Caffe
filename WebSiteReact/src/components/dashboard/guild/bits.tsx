"use client";

import { Checkbox } from "@/components/ui";
import { cn } from "@/lib/cn";

export const fieldClass =
  "mt-1.5 w-full rounded-xl bg-espresso/70 px-3 py-2 text-sm text-crema ring-1 ring-sand/20 outline-none focus:ring-caramel/40 disabled:opacity-50";

export const labelClass = "text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-crema/45";

export function Toggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-10 shrink-0 rounded-full transition-colors",
        checked ? "bg-caramel" : "bg-crema/15 ring-1 ring-sand/25",
        disabled && "cursor-not-allowed opacity-45",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 size-5 rounded-full bg-espresso shadow transition-transform",
          checked ? "left-[1.15rem]" : "left-0.5",
        )}
        aria-hidden
      />
    </button>
  );
}

export function Notice({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return (
    <p
      className={cn(
        "rounded-xl px-3 py-2.5 text-sm ring-1",
        error ? "bg-[#a83a2c]/15 text-[#f0a493] light:text-[#a83a2c] ring-[#a83a2c]/30" : "bg-caramel/10 text-crema/75 ring-caramel/25",
      )}
    >
      {children}
    </p>
  );
}

export function Subnav<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto pb-0.5" role="tablist" aria-label={label}>
      {tabs.map((tab) => {
        const on = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(tab.id)}
            className={cn(
              "shrink-0 rounded-lg px-2.5 py-1 text-[0.7rem] font-semibold transition-colors",
              on
                ? "bg-caramel/20 text-ember ring-1 ring-caramel/35"
                : "bg-crema/5 text-crema/55 ring-1 ring-sand/12 hover:text-crema",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}

export function MultiCheck({
  options,
  selected,
  onChange,
  empty = "Nessuna opzione disponibile.",
}: {
  options: { id: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  empty?: string;
}) {
  if (!options.length) return <p className="text-xs text-crema/40">{empty}</p>;
  const set = new Set(selected);
  return (
    <ul className="max-h-40 space-y-1 overflow-y-auto rounded-xl bg-espresso/40 p-2 ring-1 ring-sand/12">
      {options.map((opt) => {
        const on = set.has(opt.id);
        return (
          <li key={opt.id}>
            <label className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-sm text-crema/80 hover:bg-crema/5">
              <Checkbox
                checked={on}
                className="size-3.5"
                onChange={() => {
                  const next = new Set(set);
                  if (on) next.delete(opt.id);
                  else next.add(opt.id);
                  onChange([...next]);
                }}
              />
              <span className="truncate">{opt.label}</span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

export function RowActions({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

export const miniBtn =
  "rounded-full bg-crema/8 px-3 py-1.5 text-xs font-semibold text-crema/80 ring-1 ring-sand/20 transition hover:ring-sand/40 disabled:opacity-45";

export const dangerBtn =
  "rounded-full bg-[#a83a2c]/15 px-3 py-1.5 text-xs font-semibold text-[#f0a493] light:text-[#a83a2c] ring-1 ring-[#a83a2c]/30 disabled:opacity-45";

export const primaryMini =
  "rounded-full bg-gradient-to-r from-caramel to-ember px-3 py-1.5 text-xs font-semibold text-ink disabled:opacity-45";
