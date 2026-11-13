"use client";

import { forwardRef, useState, type TextareaHTMLAttributes } from "react";
import { useUnsavedChanges, useUnsavedState } from "@/lib/unsaved-changes";
import { EmojiText } from "@/components/discord/EmojiText";
import { AnimatePresence, motion } from "motion/react";
import { Check, Diamond, Info, Maximize2, Minimize2, RotateCcw, TriangleAlert } from "lucide-react";
import { SmartLink } from "@/components/SmartLink";
import { Checkbox } from "@/components/ui";
import { cn } from "@/lib/cn";
import { page } from "@/lib/site";

export const fieldClass =
  "mt-1.5 w-full rounded-xl bg-espresso/70 px-3 py-2.5 text-sm text-crema ring-1 ring-sand/15 outline-none transition placeholder:text-crema/45 hover:ring-sand/25 focus:bg-espresso/90 focus:ring-2 focus:ring-caramel/45 disabled:opacity-50";

export const labelClass = "text-[0.8rem] font-semibold text-crema/80";

/** Textarea dashboard: resize + pulsante espandi/riduci (le caselle di default sono troppo basse). */
export const ExpandableTextarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { expandedMinClass?: string }
>(function ExpandableTextarea({ className, rows = 5, expandedMinClass = "min-h-[min(52vh,28rem)]", ...props }, ref) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="relative mt-1.5 min-w-0">
      <textarea
        {...props}
        ref={ref}
        rows={expanded ? Math.max(Number(rows) || 5, 14) : rows}
        className={cn(
          fieldClass,
          "mt-0 min-h-[7.5rem] resize-y leading-relaxed pr-10",
          expanded && expandedMinClass,
          className,
        )}
      />
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        title={expanded ? "Riduci" : "Espandi"}
        aria-label={expanded ? "Riduci casella di testo" : "Espandi casella di testo"}
        aria-pressed={expanded}
        className="absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-md bg-espresso/90 text-crema/70 ring-1 ring-sand/20 transition hover:bg-crema/10 hover:text-crema"
      >
        {expanded ? <Minimize2 className="size-3.5" aria-hidden /> : <Maximize2 className="size-3.5" aria-hidden />}
      </button>
    </div>
  );
});

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
  const Icon = error ? TriangleAlert : Info;
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-2xl px-3.5 py-3 text-sm ring-1",
        error ? "bg-[#a83a2c]/12 text-[#f0a493] light:text-[#a83a2c] ring-[#a83a2c]/30" : "bg-caramel/[0.08] text-crema/80 ring-caramel/20",
      )}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", error ? "" : "text-ember")} aria-hidden />
      <div className="min-w-0 flex-1 leading-relaxed">{children}</div>
    </div>
  );
}

/* ── Pezzi grafici delle pagine (testata, sezioni, pillole, barra di salvataggio) ── */

type IconType = React.ComponentType<{ className?: string }>;

/** Testata di una pagina della dashboard: icona grande, titolo, stato e (se serve) interruttore principale. */
export function PageHero({
  icon: Icon,
  title,
  text,
  on,
  onToggle,
  toggleLabel,
  accent = "#d99a5b",
  aside,
}: {
  icon: IconType;
  title: string;
  text?: React.ReactNode;
  /** stato attivo/spento: se manca niente pallino */
  on?: boolean;
  onToggle?: (v: boolean) => void;
  toggleLabel?: string;
  accent?: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-mocha via-roast to-espresso p-5 ring-1 ring-sand/15 sm:p-6">
      <div className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full opacity-25 blur-3xl" style={{ background: accent }} aria-hidden />
      <div className="pointer-events-none absolute -bottom-24 left-1/3 size-48 rounded-full opacity-10 blur-3xl" style={{ background: accent }} aria-hidden />
      <div className="relative flex flex-wrap items-center gap-4">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-crema/[0.06] ring-1 ring-sand/15" style={{ color: accent }}>
          <Icon className="size-7" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-2xl font-semibold text-crema">{title}</h2>
            {on != null ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1",
                  on ? "bg-emerald-500/12 text-emerald-300 light:text-emerald-700 ring-emerald-400/25" : "bg-crema/[0.05] text-crema/55 ring-sand/15",
                )}
              >
                <span className={cn("size-1.5 rounded-full", on ? "bg-emerald-400" : "bg-crema/35")} aria-hidden />
                {on ? "Attivo" : "Spento"}
              </span>
            ) : null}
          </div>
          {text ? <p className="mt-1 max-w-2xl text-sm leading-relaxed text-crema/65">{text}</p> : null}
        </div>
        {aside}
        {onToggle && on != null ? <Toggle checked={on} onChange={onToggle} label={toggleLabel || title} /> : null}
      </div>
    </div>
  );
}

/** Sezione di una pagina: icona, titolo, spiegazione, controlli a destra. */
export function PageSection({
  icon: Icon,
  title,
  text,
  right,
  children,
  className,
}: {
  icon?: IconType;
  title: string;
  text?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-3xl bg-roast/60 p-4 ring-1 ring-sand/10 sm:p-5", className)}>
      <div className="mb-4 flex flex-wrap items-start gap-3">
        {Icon ? (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-caramel/12 text-ember">
            <Icon className="size-4" />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-crema">{title}</h3>
          {text ? <p className="text-xs leading-relaxed text-crema/55">{text}</p> : null}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

/** Controllo a pillole (scelta tra poche opzioni). */
export function Pills<K extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: K;
  onChange: (k: K) => void;
  options: { id: K; label: string; icon?: IconType; dot?: string }[];
  ariaLabel: string;
}) {
  return (
    <div className="inline-flex max-w-full flex-wrap gap-1 rounded-xl bg-espresso/70 p-1 ring-1 ring-sand/10" role="tablist" aria-label={ariaLabel}>
      {options.map((o) => {
        const on = value === o.id;
        const Icon = o.icon;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.id)}
            className={cn("relative inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors", on ? "text-crema" : "text-crema/55 hover:text-crema")}
          >
            {on ? <motion.span layoutId={`pill-${ariaLabel}`} className="absolute inset-0 rounded-lg bg-mocha ring-1 ring-sand/15" transition={{ type: "spring", stiffness: 500, damping: 40 }} /> : null}
            <span className="relative inline-flex items-center gap-1.5">
              {o.dot ? <span className="size-2 rounded-full" style={{ background: o.dot }} aria-hidden /> : null}
              {Icon ? <Icon className="size-3.5" /> : null}
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Segna le modifiche non salvate di un pannello e le collega alla barra in basso (GlobalSaveBar).
 * Si mette nel JSX dopo aver definito salva/annulla: non disegna niente.
 */
export function TrackUnsaved({ dirty, onSave, onReset }: { dirty: boolean; onSave?: () => unknown; onReset?: () => void }) {
  useUnsavedChanges(dirty, { onSave, onReset });
  return null;
}

/** Barra unica in basso: compare quando una pagina ha modifiche da salvare (Salva / Annulla). */
export function GlobalSaveBar() {
  const st = useUnsavedState();
  const [busy, setBusy] = useState(false);
  const show = st.count > 0 && (st.canSave || st.canReset);
  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          initial={{ opacity: 0, y: 28, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 28, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
          className="pointer-events-none fixed inset-x-0 bottom-5 z-[75] flex justify-center px-4"
          role="region"
          aria-label="Modifiche non salvate"
        >
          <div className="pointer-events-auto flex w-full max-w-2xl items-center gap-3 rounded-2xl bg-mocha/95 px-4 py-3 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)] ring-1 ring-caramel/30 backdrop-blur-md sm:px-5">
            <span className="relative flex size-2.5 shrink-0" aria-hidden>
              <span className="absolute inset-0 animate-ping rounded-full bg-ember/60" />
              <span className="relative size-2.5 rounded-full bg-ember" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-crema">Hai modifiche non salvate</p>
              <p className="hidden text-xs text-crema/55 sm:block">Salvale prima di cambiare pagina, o annullale per tornare a com&apos;era.</p>
            </div>
            {st.canReset ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => st.resetAll()}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-crema/70 transition hover:bg-crema/[0.06] hover:text-crema disabled:opacity-45"
              >
                <RotateCcw className="size-3.5" aria-hidden /> Annulla
              </button>
            ) : null}
            {st.canSave ? (
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await st.saveAll();
                  } finally {
                    setBusy(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-caramel to-ember px-4 py-2 text-sm font-semibold text-ink shadow-[0_10px_24px_-12px_rgba(217,154,91,0.9)] transition hover:brightness-105 disabled:opacity-60"
              >
                <Check className="size-4" aria-hidden /> {busy ? "Salvataggio…" : "Salva"}
              </button>
            ) : null}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/** Barra in basso quando ci sono modifiche da salvare. */
export function SaveBar({ show, busy, onSave, onReset }: { show: boolean; busy: boolean; onSave: () => void; onReset?: () => void }) {
  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          className="sticky bottom-4 z-20 mx-auto flex max-w-xl items-center gap-3 rounded-2xl bg-mocha/95 px-4 py-3 shadow-[0_18px_50px_-18px_rgba(0,0,0,0.85)] ring-1 ring-sand/20 backdrop-blur"
        >
          <span className="size-2 rounded-full bg-ember" aria-hidden />
          <p className="flex-1 text-sm font-medium text-crema">Hai modifiche non salvate</p>
          {onReset ? (
            <button type="button" className="rounded-lg px-3 py-1.5 text-sm font-semibold text-crema/70 hover:text-crema" disabled={busy} onClick={onReset}>
              Annulla
            </button>
          ) : null}
          <button type="button" className={primaryMini} disabled={busy} onClick={onSave}>
            <Check className="size-3.5" /> Salva
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
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
    <div className="max-w-full overflow-x-auto">
      <div
        className="inline-flex min-w-max gap-1 rounded-xl bg-espresso/70 p-1 ring-1 ring-sand/10"
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
                "relative whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-caramel",
                on ? "text-crema" : "text-crema/55 hover:text-crema",
              )}
            >
              {on ? (
                <motion.span
                  layoutId={`subnav-${label}`}
                  className="absolute inset-0 rounded-lg bg-mocha ring-1 ring-sand/15"
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  aria-hidden
                />
              ) : null}
              <span className="relative">{tab.label}</span>
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
    <section className="rounded-2xl bg-espresso/45 p-4 ring-1 ring-sand/10 sm:p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-crema">
        <span className="h-3.5 w-1 rounded-full bg-gradient-to-b from-caramel to-ember" aria-hidden />
        {title}
      </h3>
      {description ? <p className="mt-1 text-xs leading-relaxed text-crema/60">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Etichetta di stato con testo (mai solo colore: accessibility.md › Vision). */
export function StatusBadge({ tone = "muted", children }: { tone?: "ok" | "warn" | "muted" | "accent"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider",
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
  lockedLabel = "sistema",
  empty = "Nessuna opzione disponibile.",
}: {
  options: { id: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  lockedIds?: string[];
  /** Badge accanto alle voci bloccate. Stringa vuota = nascosto. */
  lockedLabel?: string;
  empty?: string;
}) {
  if (!options.length) return <p className="mt-1.5 text-xs text-crema/60">{empty}</p>;
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
              {isLocked && lockedLabel ? (
                <span className="shrink-0 text-[0.65rem] uppercase tracking-wide text-crema/40">{lockedLabel}</span>
              ) : null}
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
    <div className="flex items-center gap-4 py-3.5 first:pt-0 last:pb-0">
      {icon ? (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-caramel/[0.09] text-ember/80 [&>svg]:size-4">{icon}</span>
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
    <section className={cn("rounded-3xl bg-roast/70 ring-1 ring-sand/10", className)}>
      {title ? (
        <header className={cn("flex items-start gap-3 px-4 py-4 sm:px-5", children && "border-b border-sand/[0.08]")}>
          {icon ? (
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-caramel/20 to-ember/5 text-ember ring-1 ring-caramel/20 [&>svg]:size-[1.1rem]">
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
      {children ? <div className={cn("px-4 py-4 sm:px-5 sm:py-5", bodyClassName)}>{children}</div> : null}
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
        "group relative flex min-w-0 items-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-br from-espresso/70 to-espresso/40 p-3.5 text-left ring-1 ring-sand/10",
        onClick && "transition hover:-translate-y-0.5 hover:ring-sand/25",
      )}
    >
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl [&>svg]:size-[1.05rem]",
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
