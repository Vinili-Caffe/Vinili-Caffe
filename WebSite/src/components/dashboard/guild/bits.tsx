"use client";

import { EmojiText } from "@/components/discord/EmojiText";
import { AnimatePresence, motion } from "motion/react";
import { Diamond } from "lucide-react";
import { SmartLink } from "@/components/SmartLink";
import { Checkbox } from "@/components/ui";
import { cn } from "@/lib/cn";
import { page } from "@/lib/site";

export const fieldClass =
  "mt-1.5 w-full rounded-lg bg-espresso/70 px-3 py-2.5 text-sm text-crema ring-1 ring-sand/15 outline-none transition placeholder:text-crema/50 hover:ring-sand/25 focus:ring-2 focus:ring-caramel/45 disabled:opacity-50";

export const labelClass = "text-[0.8rem] font-semibold text-crema/80";

export function Toggle({
  checked,
  disabled,
  onChange,
  label,
  size = "md",
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label: string;
  /** "sm": righe di un gruppo di impostazioni; "md": interruttore principale di un modulo */
  size?: "sm" | "md";
}) {
  const sm = size === "sm";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative shrink-0 rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-caramel",
        sm ? "h-5 w-9" : "h-6 w-11",
        checked ? "bg-gradient-to-r from-caramel to-ember shadow-[0_0_14px_-4px_rgba(217,154,91,0.8)]" : "bg-crema/12 ring-1 ring-inset ring-sand/20",
        disabled && "cursor-not-allowed opacity-45",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 rounded-full shadow-[0_2px_6px_rgba(0,0,0,0.45)] transition-[left,background-color] duration-200 ease-out",
          sm ? "size-4" : "size-5",
          checked ? (sm ? "left-[1.125rem] bg-paper" : "left-[1.375rem] bg-paper") : "left-0.5 bg-crema/70",
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
    <div className="max-w-full overflow-x-auto border-b border-sand/12">
      <div
        className="flex min-w-max gap-1"
        role="tablist"
        aria-label={label}
        onKeyDown={(e) => {
          if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
          const i = tabs.findIndex((t) => t.id === value);
          const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
          if (next) {
            e.preventDefault();
            onChange(next.id);
          }
        }}
      >
        {tabs.map((tab) => {
          const on = tab.id === value;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={on}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(tab.id)}
              className={cn(
                "relative -mb-px whitespace-nowrap px-3.5 pb-2.5 pt-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-caramel",
                on ? "text-crema" : "text-crema/60 hover:text-crema",
              )}
            >
              {tab.label}
              <span
                className={cn(
                  "absolute inset-x-2 bottom-0 h-0.5 rounded-full transition-colors",
                  on ? "bg-gradient-to-r from-caramel to-ember" : "bg-transparent",
                )}
                aria-hidden
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className={labelClass}>{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs leading-relaxed text-crema/60">{hint}</span> : null}
    </label>
  );
}

/** Testata di un editor: torna all'elenco, titolo, azioni principali in alto (layout.md › Desktop). */
export function EditorHeader({
  backLabel,
  onBack,
  title,
  subtitle,
  actions,
  inColumn = false,
}: {
  /** dentro una colonna (accanto a un elenco): niente margini negativi, angoli arrotondati */
  inColumn?: boolean;
  backLabel: string;
  onBack: () => void;
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "sticky top-14 z-20 flex flex-wrap items-center gap-3 bg-roast/95 px-4 py-3 backdrop-blur-md",
        inColumn ? "rounded-xl ring-1 ring-sand/10" : "-mx-4 -mt-4 mb-1 border-b border-sand/10 sm:-mx-5 sm:px-5",
      )}
    >
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-semibold text-crema/70 transition hover:bg-crema/[0.05] hover:text-crema"
      >
        <span aria-hidden>←</span> {backLabel}
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-crema">{title}</p>
        {subtitle ? <p className="truncate text-xs text-crema/60">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Gruppo dentro un editor: titolo breve, spiegazione e contenuto. */
export function FormGroup({ title, description, children }: { title: string; description?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-espresso/45 p-4 ring-1 ring-sand/10">
      <h3 className="text-sm font-semibold text-crema">{title}</h3>
      {description ? <p className="mt-0.5 text-xs leading-relaxed text-crema/60">{description}</p> : null}
      <div className="mt-3.5">{children}</div>
    </section>
  );
}

/** Etichetta di stato con testo (mai solo colore: accessibility.md › Vision). */
export function StatusBadge({ tone = "muted", children }: { tone?: "ok" | "warn" | "muted" | "accent"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider",
        tone === "ok" && "bg-[#5f9a6a]/15 text-[#9fd0a8] light:text-[#2f6b3f]",
        tone === "warn" && "bg-[#a83a2c]/15 text-[#f0a493] light:text-[#a83a2c]",
        tone === "accent" && "bg-caramel/15 text-ember",
        tone === "muted" && "bg-crema/[0.07] text-crema/65",
      )}
    >
      {children}
    </span>
  );
}

export function MultiCheck({
  options,
  selected,
  onChange,
  lockedIds,
  empty = "Nessuna opzione disponibile.",
}: {
  options: { id: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  lockedIds?: string[];
  empty?: string;
}) {
  if (!options.length) return <p className="text-xs text-crema/60">{empty}</p>;
  const set = new Set(selected);
  const locked = new Set((lockedIds || []).map(String));
  return (
    <ul className="mt-1.5 max-h-48 min-h-0 flex-1 space-y-0.5 overflow-y-auto rounded-lg bg-espresso/60 p-1.5 ring-1 ring-sand/12">
      {options.map((opt) => {
        const on = set.has(opt.id);
        const isLocked = locked.has(opt.id);
        return (
          <li key={opt.id}>
            <label
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                isLocked ? "cursor-default text-crema/75" : "cursor-pointer hover:bg-crema/[0.05]",
                on ? "text-crema" : "text-crema/65",
              )}
            >
              <Checkbox
                checked={on}
                disabled={isLocked}
                className="size-3.5"
                onChange={() => {
                  if (isLocked) return;
                  const next = new Set(set);
                  if (on) next.delete(opt.id);
                  else next.add(opt.id);
                  onChange([...next]);
                }}
              />
              <span className="min-w-0 flex-1 truncate"><EmojiText text={opt.label} /></span>
              {isLocked ? <span className="shrink-0 text-[0.65rem] uppercase tracking-wide text-crema/40">sistema</span> : null}
            </label>
          </li>
        );
      })}
    </ul>
  );
}

/** Riga di impostazione: titolo, spiegazione e controllo a destra (interruttori, select…). */
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
    <div className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
      {icon ? (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-crema/[0.05] text-crema/55 [&>svg]:size-4">{icon}</span>
      ) : null}
      <div className="min-w-0 flex-1 pr-1">
        <p className="text-sm font-medium text-crema">{title}</p>
        {description ? <p className="mt-0.5 text-xs leading-relaxed text-crema/60">{description}</p> : null}
      </div>
      <div className="shrink-0 pl-1">{children}</div>
    </div>
  );
}

export function RowActions({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}

export const miniBtn =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-crema/[0.06] px-3 py-1.5 text-xs font-semibold text-crema/85 ring-1 ring-sand/15 transition hover:bg-crema/[0.1] hover:text-crema disabled:opacity-45";

export const dangerBtn =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#a83a2c]/12 px-3 py-1.5 text-xs font-semibold text-[#f0a493] light:text-[#a83a2c] ring-1 ring-[#a83a2c]/30 transition hover:bg-[#a83a2c]/20 disabled:opacity-45";

export const primaryMini =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-caramel to-ember px-3 py-1.5 text-xs font-semibold text-ink shadow-[0_8px_20px_-12px_rgba(217,154,91,0.9)] transition hover:brightness-105 disabled:opacity-45";

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
            {description ? <div className="mt-0.5 text-xs leading-relaxed text-crema/60">{description}</div> : null}
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
        <span className="block text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-crema/60">{label}</span>
        <span className="block truncate font-display text-xl font-semibold leading-tight tabular-nums text-crema">{value}</span>
        {hint ? <span className="block truncate text-[0.68rem] text-crema/50">{hint}</span> : null}
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

/** Notifica in basso (salvato / errore), centrata sullo schermo. */
export function DashToast({ toast }: { toast: { msg: string; err: boolean } | null }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[70] flex justify-center px-4" aria-live="polite">
      <AnimatePresence>
        {toast ? (
          <motion.div
            key={toast.msg}
            role="status"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className={cn(
              "pointer-events-auto inline-flex max-w-sm items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium shadow-[0_18px_40px_-16px_rgba(0,0,0,0.8)]",
              toast.err ? "bg-[#a83a2c] text-[#fff0ec]" : "bg-mocha text-crema ring-1 ring-caramel/35",
            )}
          >
            <span className={cn("size-2 shrink-0 rounded-full", toast.err ? "bg-[#fff0ec]" : "bg-[#7fc48c]")} aria-hidden />
            <span className="text-center">{toast.msg}</span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** Etichetta sulle funzioni Premium: sempre visibile, anche quando il server ce l'ha. */
export function PremiumBadge({ active }: { active?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.65rem] font-semibold ring-1",
        active ? "bg-caramel/15 text-ember ring-caramel/35" : "bg-crema/[0.06] text-crema/70 ring-sand/20",
      )}
      title={active ? "Funzione Premium: attiva su questo server" : "Funzione Premium: non attiva su questo server"}
    >
      <Diamond className="size-3" aria-hidden />
      Premium
    </span>
  );
}

/** Funzione riservata a Premium: spiega cosa manca e porta ad attivarlo. */
export function PremiumLock({ feature, note, className }: { feature: string; note?: string; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 rounded-xl bg-caramel/[0.09] p-3.5 ring-1 ring-caramel/30 sm:flex-row sm:items-center", className)}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-caramel/15 text-ember ring-1 ring-caramel/25" aria-hidden>
        <Diamond className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-crema">{feature} è una funzione Premium</p>
        <p className="mt-0.5 text-xs text-crema/65">{note || "Attiva Premium su questo server con i tuoi crediti per usarla."}</p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <SmartLink href={page("/dashboard/premium/")} className={cn(primaryMini, "inline-flex items-center gap-1.5")}>
          Attiva Premium
        </SmartLink>
        <SmartLink href={page("/dashboard/premium/vantaggi/")} className={miniBtn}>
          Cosa include
        </SmartLink>
      </div>
    </div>
  );
}

/* ── Skeleton di caricamento (stessa forma del contenuto che arriva) ── */

function Bone({ className }: { className?: string }) {
  return <span className={cn("block animate-pulse rounded bg-crema/[0.07]", className)} aria-hidden />;
}

/** Righe di un elenco: icona/avatar + due righe di testo + azione. */
export function RowsSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <ul className={cn("divide-y divide-sand/[0.07] overflow-hidden rounded-xl bg-espresso/45 ring-1 ring-sand/10", className)} aria-busy aria-label="Caricamento">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-3">
          <Bone className="size-9 shrink-0 rounded-lg" />
          <span className="min-w-0 flex-1 space-y-1.5">
            <Bone className="h-3.5" />
            <Bone className="h-3 w-2/5 bg-crema/[0.05]" />
          </span>
          <Bone className="h-7 w-16 shrink-0 rounded-lg" />
        </li>
      ))}
    </ul>
  );
}

/** Elenco a sinistra + editor a destra (Pannelli, Form, Team). */
export function EditorSkeleton({ items = 4 }: { items?: number }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]" aria-busy aria-label="Caricamento">
      <div className="space-y-2">
        <Bone className="h-4 w-20" />
        {Array.from({ length: items }, (_, i) => (
          <Bone key={i} className="h-10 rounded-lg" />
        ))}
        <Bone className="h-10 rounded-lg bg-crema/[0.04]" />
      </div>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <span className="w-1/2 space-y-2">
            <Bone className="h-5" />
            <Bone className="h-3 w-2/3 bg-crema/[0.05]" />
          </span>
          <Bone className="h-8 w-24 rounded-lg" />
        </div>
        {[0, 1].map((g) => (
          <div key={g} className="space-y-3 rounded-xl bg-espresso/45 p-4 ring-1 ring-sand/10">
            <Bone className="h-4 w-1/4" />
            <Bone className="h-10 rounded-lg" />
            <Bone className="h-10 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Modulo a sinistra + elenco a destra (Blacklist) o gruppi di impostazioni (Partnership). */
export function FormSkeleton({ withList = false }: { withList?: boolean }) {
  return (
    <div className={cn("grid gap-4", withList && "xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]")} aria-busy aria-label="Caricamento">
      <div className="space-y-3 rounded-xl bg-espresso/45 p-4 ring-1 ring-sand/10">
        <Bone className="h-4 w-1/3" />
        <Bone className="h-3 w-2/3 bg-crema/[0.05]" />
        <Bone className="h-10 rounded-lg" />
        <Bone className="h-10 rounded-lg" />
        <Bone className="h-10 rounded-lg" />
        <Bone className="h-9 rounded-lg bg-caramel/15" />
      </div>
      {withList ? <RowsSkeleton rows={5} /> : null}
    </div>
  );
}
