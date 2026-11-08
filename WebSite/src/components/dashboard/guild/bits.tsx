"use client";

import { AnimatePresence, motion } from "motion/react";
import { Checkbox } from "@/components/ui";
import { cn } from "@/lib/cn";

export const fieldClass =
  "mt-1.5 w-full rounded-[0.7rem] bg-espresso/80 px-3.5 py-2.5 text-sm text-crema ring-1 ring-sand/12 outline-none transition placeholder:text-crema/28 hover:ring-sand/22 focus:ring-2 focus:ring-caramel/40 disabled:opacity-50";

export const labelClass = "text-[0.7rem] font-medium tracking-[0.01em] text-crema/55";

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
        "relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
        checked ? "bg-caramel" : "bg-crema/14 ring-1 ring-inset ring-sand/18",
        disabled && "cursor-not-allowed opacity-45",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 size-6 rounded-full bg-paper shadow-[0_2px_8px_rgba(0,0,0,0.35)] transition-[left] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
          checked ? "left-[1.35rem]" : "left-0.5",
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
        "rounded-xl px-3.5 py-2.5 text-sm ring-1",
        error
          ? "bg-[#a83a2c]/12 text-[#f0a493] ring-[#a83a2c]/28 light:text-[#a83a2c]"
          : "bg-crema/[0.04] text-crema/70 ring-sand/12",
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
    <div className="max-w-full overflow-x-auto pb-0.5">
      <div
        className="inline-flex min-w-full gap-0.5 rounded-2xl bg-espresso/55 p-1 ring-1 ring-sand/[0.08] sm:min-w-0"
        role="tablist"
        aria-label={label}
      >
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
                "relative shrink-0 whitespace-nowrap rounded-xl px-3.5 py-2 text-[0.8125rem] font-medium transition-colors duration-200",
                on ? "bg-mocha text-crema shadow-[0_8px_24px_-16px_rgba(0,0,0,0.9)]" : "text-crema/45 hover:text-crema/80",
              )}
            >
              {tab.label}
              {on ? (
                <span
                  className="absolute inset-x-3.5 -bottom-px h-px rounded-full bg-caramel/80"
                  aria-hidden
                />
              ) : null}
            </button>
          );
        })}
      </div>
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
    <ul className="mt-1.5 max-h-48 space-y-0.5 overflow-y-auto rounded-xl bg-espresso/55 p-1.5 ring-1 ring-sand/10">
      {options.map((opt) => {
        const on = set.has(opt.id);
        return (
          <li key={opt.id}>
            <label
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-crema/[0.04]",
                on ? "text-crema" : "text-crema/60",
              )}
            >
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

/** Riga di impostazione: titolo, spiegazione e controllo a destra. */
export function SettingRow({
  title,
  description,
  children,
  icon,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3.5 px-4 py-3.5 first:pt-3.5 last:pb-3.5 sm:px-5">
      {icon ? (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-[0.65rem] bg-crema/[0.045] text-crema/50 [&>svg]:size-4">
          {icon}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="text-[0.9rem] font-medium leading-snug text-crema">{title}</p>
        {description ? <p className="mt-0.5 text-[0.75rem] leading-relaxed text-crema/42">{description}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** Lista raggruppata stile Settings: una superficie, divider sottili. */
export function SettingsGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("overflow-hidden rounded-2xl bg-espresso/40 ring-1 ring-sand/[0.08]", className)}>
      <div className="divide-y divide-sand/[0.07]">{children}</div>
    </div>
  );
}

/** Intestazione di blocco dentro una tab (senza eyebrow). */
export function SectionHead({
  title,
  description,
  aside,
}: {
  title: string;
  description?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-[0.95rem] font-semibold tracking-[-0.01em] text-crema">{title}</h3>
        {description ? <p className="mt-0.5 max-w-prose text-[0.75rem] leading-relaxed text-crema/42">{description}</p> : null}
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </div>
  );
}

/** Banner modulo on/off: quiet status, non una card marketing. */
export function ModuleBanner({
  icon,
  title,
  status,
  active,
  control,
}: {
  icon: React.ReactNode;
  title: string;
  status: string;
  active: boolean;
  control: React.ReactNode;
}) {
  return (
    <section className="flex flex-wrap items-center gap-4 rounded-2xl bg-roast/90 px-4 py-4 ring-1 ring-sand/[0.09] sm:px-5">
      <span
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-2xl ring-1 [&>svg]:size-5",
          active ? "bg-caramel/12 text-ember ring-caramel/22" : "bg-crema/[0.04] text-crema/40 ring-sand/12",
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[0.95rem] font-semibold tracking-[-0.01em] text-crema">{title}</p>
        <p className="mt-1 flex items-center gap-2 text-[0.75rem] text-crema/48">
          <span className={cn("size-1.5 rounded-full", active ? "bg-[#7fc48c]" : "bg-crema/28")} aria-hidden />
          {status}
        </p>
      </div>
      {control}
    </section>
  );
}

export function RowActions({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

export const miniBtn =
  "inline-flex items-center justify-center gap-1.5 rounded-xl bg-crema/[0.05] px-3 py-1.5 text-xs font-semibold text-crema/85 ring-1 ring-sand/12 transition hover:bg-crema/[0.09] hover:text-crema disabled:opacity-45";

export const dangerBtn =
  "inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#a83a2c]/12 px-3 py-1.5 text-xs font-semibold text-[#f0a493] light:text-[#a83a2c] ring-1 ring-[#a83a2c]/28 transition hover:bg-[#a83a2c]/20 disabled:opacity-45";

export const primaryMini =
  "inline-flex items-center justify-center gap-1.5 rounded-xl bg-caramel px-3 py-1.5 text-xs font-semibold text-ink shadow-[0_10px_24px_-14px_rgba(217,154,91,0.75)] transition hover:brightness-105 disabled:opacity-45";

export const dashPrimaryBtn =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-caramel px-4 py-2 text-sm font-semibold text-ink shadow-[0_12px_28px_-16px_rgba(217,154,91,0.8)] transition-[transform,filter] duration-200 ease-out hover:brightness-105 active:scale-[0.97] disabled:opacity-50";

export const dashSecondaryBtn =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-crema/[0.05] px-4 py-2 text-sm font-semibold text-crema/85 ring-1 ring-sand/14 transition hover:bg-crema/[0.08] hover:text-crema disabled:opacity-50";

export const discordBtn =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-[#5865f2] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 active:scale-[0.97]";

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
    <section className={cn("overflow-hidden rounded-2xl bg-roast/85 ring-1 ring-sand/[0.09]", className)}>
      {title ? (
        <header className={cn("flex items-start gap-3.5 px-4 py-4 sm:px-5", children && "border-b border-sand/[0.07]")}>
          {icon ? (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-crema/[0.045] text-crema/55 ring-1 ring-sand/10 [&>svg]:size-[1.05rem]">
              {icon}
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 className="text-[0.95rem] font-semibold tracking-[-0.01em] text-crema">{title}</h2>
            {description ? <div className="mt-0.5 text-[0.75rem] leading-relaxed text-crema/42">{description}</div> : null}
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
        "flex min-w-0 items-center gap-3 rounded-2xl bg-espresso/45 p-3.5 text-left ring-1 ring-sand/[0.08]",
        onClick && "transition hover:ring-sand/20",
      )}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-xl [&>svg]:size-4",
          tone === "accent" && "bg-caramel/12 text-ember",
          tone === "ok" && "bg-[#5f9a6a]/14 text-[#9fd0a8] light:text-[#2f6b3f]",
          tone === "default" && "bg-crema/[0.045] text-crema/55",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[0.68rem] font-medium text-crema/42">{label}</span>
        <span className="mt-0.5 block truncate font-display text-[1.35rem] font-semibold leading-none tabular-nums tracking-[-0.02em] text-crema">
          {value}
        </span>
        {hint ? <span className="mt-1 block truncate text-[0.68rem] text-crema/32">{hint}</span> : null}
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
    <div className="mx-auto max-w-lg rounded-2xl bg-roast/85 px-6 py-10 text-center ring-1 ring-sand/[0.09]">
      <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-crema/[0.045] text-crema/55 ring-1 ring-sand/10 [&>svg]:size-5">
        {icon}
      </span>
      <h2 className="mt-4 font-display text-2xl font-semibold tracking-[-0.02em] text-crema">{title}</h2>
      {children ? <div className="mt-2 text-sm leading-relaxed text-crema/52">{children}</div> : null}
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
            initial={{ opacity: 0, y: 12, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: 8, filter: "blur(4px)" }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              "pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-2xl px-4 py-2.5 text-sm font-medium shadow-[0_18px_40px_-18px_rgba(0,0,0,0.85)]",
              toast.err ? "bg-[#a83a2c] text-[#fff0ec]" : "bg-mocha text-crema ring-1 ring-sand/14",
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
