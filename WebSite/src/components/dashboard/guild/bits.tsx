"use client";

import { AnimatePresence, motion } from "motion/react";
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

/* ── Mattoncini grafici della dashboard (card modulo, statistiche, pulsanti) ── */

export const dashPrimaryBtn =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-caramel to-ember px-4 py-2 text-sm font-semibold text-ink shadow-[0_10px_24px_-14px_rgba(217,154,91,0.9)] transition-[transform,filter] duration-200 ease-out hover:brightness-105 active:scale-[0.97] disabled:opacity-50";

export const dashSecondaryBtn =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-crema/[0.06] px-4 py-2 text-sm font-semibold text-crema/85 ring-1 ring-sand/20 transition hover:bg-crema/[0.09] hover:text-crema disabled:opacity-50";

export const discordBtn =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-[#5865f2] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 active:scale-[0.97]";

/** Card della dashboard: intestazione con icona, titolo, descrizione e controlli a destra. */
export function Panel({
  icon,
  title,
  description,
  aside,
  children,
  className,
  bodyClassName,
}: {
  icon?: React.ReactNode;
  title?: string;
  description?: React.ReactNode;
  aside?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("rounded-2xl bg-roast/80 ring-1 ring-sand/10", className)}>
      {title ? (
        <header className={cn("flex items-start gap-3 px-4 py-3.5 sm:px-5", children && "border-b border-sand/[0.08]")}>
          {icon ? (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-caramel/12 text-ember ring-1 ring-caramel/20 [&>svg]:size-[1.05rem]">
              {icon}
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 className="text-[0.95rem] font-semibold text-crema">{title}</h2>
            {description ? <div className="mt-0.5 text-xs leading-relaxed text-crema/45">{description}</div> : null}
          </div>
          {aside ? <div className="flex shrink-0 items-center gap-2">{aside}</div> : null}
        </header>
      ) : null}
      {children ? <div className={cn("px-4 py-4 sm:px-5", bodyClassName)}>{children}</div> : null}
    </section>
  );
}

/** Riquadro numero (membri, ticket aperti…). */
export function StatTile({
  icon,
  label,
  value,
  hint,
  tone = "default",
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "default" | "accent" | "ok";
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={cn(
        "flex min-w-0 items-center gap-3 rounded-xl bg-espresso/55 p-3 text-left ring-1 ring-sand/10",
        onClick && "transition hover:ring-sand/25",
      )}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg [&>svg]:size-4",
          tone === "accent" && "bg-caramel/15 text-ember",
          tone === "ok" && "bg-[#5f9a6a]/15 text-[#9fd0a8] light:text-[#2f6b3f]",
          tone === "default" && "bg-crema/[0.06] text-crema/60",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-crema/40">{label}</span>
        <span className="block truncate font-display text-xl font-semibold leading-tight tabular-nums text-crema">{value}</span>
        {hint ? <span className="block truncate text-[0.68rem] text-crema/35">{hint}</span> : null}
      </span>
    </Tag>
  );
}

/** Schermata di stato (login, accesso negato, vuoto…). */
export function StateCard({
  icon,
  title,
  children,
  actions,
}: {
  icon: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-lg rounded-2xl bg-roast/80 px-6 py-10 text-center ring-1 ring-sand/10">
      <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-caramel/12 text-ember ring-1 ring-caramel/20 [&>svg]:size-5">
        {icon}
      </span>
      <h2 className="mt-4 font-display text-2xl font-semibold text-crema">{title}</h2>
      {children ? <div className="mt-2 text-sm leading-relaxed text-crema/55">{children}</div> : null}
      {actions ? <div className="mt-6 flex flex-wrap justify-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Notifica in basso (salvato / errore). */
export function DashToast({ toast }: { toast: { msg: string; err: boolean } | null }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[70] flex justify-center px-4 lg:pl-64" aria-live="polite">
      <AnimatePresence>
        {toast ? (
          <motion.div
            key={toast.msg}
            role="status"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className={cn(
              "pointer-events-auto flex max-w-sm items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium shadow-[0_18px_40px_-16px_rgba(0,0,0,0.8)]",
              toast.err ? "bg-[#a83a2c] text-[#fff0ec]" : "bg-mocha text-crema ring-1 ring-caramel/35",
            )}
          >
            <span className={cn("size-2 shrink-0 rounded-full", toast.err ? "bg-[#fff0ec]" : "bg-[#7fc48c]")} aria-hidden />
            {toast.msg}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
