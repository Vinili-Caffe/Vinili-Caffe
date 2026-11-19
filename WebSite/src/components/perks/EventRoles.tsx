"use client";

import { CalendarDays, Cake, Clock, Eye, Lock, Rocket, Trophy, TreePine, Wand2, type LucideIcon } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { RichText } from "@/components/RichText";
import { useEventoStaffAccess } from "@/components/evento/EventoAccessGate";
import { cn } from "@/lib/cn";
import { EVENT_ROLES, type EventRole } from "@/lib/perks";

/* colori per evento: sfondo, alone, anello e icona */
const THEMES: Record<EventRole["theme"], { icon: LucideIcon; card: string; glow: string; iconBox: string }> = {
  hogwarts: {
    icon: Wand2,
    card: "from-[#3a1416] via-roast to-roast ring-[#c9a227]/25",
    glow: "bg-[#7f1d1d]/30",
    iconBox: "bg-[#7f1d1d]/30 text-[#f0c75e] ring-[#c9a227]/35",
  },
  hogwartsGold: {
    icon: Trophy,
    card: "from-[#3b2a0c] via-roast to-roast ring-[#f0c75e]/35",
    glow: "bg-[#f0c75e]/20",
    iconBox: "bg-[#f0c75e]/15 text-[#ffd977] ring-[#f0c75e]/40",
  },
  starwars: {
    icon: Rocket,
    card: "from-[#0b1a2e] via-roast to-roast ring-[#38bdf8]/25",
    glow: "bg-[#38bdf8]/20",
    iconBox: "bg-[#38bdf8]/15 text-[#9be3ff] ring-[#38bdf8]/35",
  },
  natale: {
    icon: TreePine,
    card: "from-[#0f2a1a] via-roast to-roast ring-[#ef4444]/25",
    glow: "bg-[#16a34a]/25",
    iconBox: "bg-[#16a34a]/20 text-[#86efac] ring-[#ef4444]/35",
  },
  anniversario: {
    icon: Cake,
    card: "from-caramel/25 via-roast to-roast ring-caramel/30",
    glow: "bg-caramel/25",
    iconBox: "bg-caramel/20 text-ember ring-caramel/40",
  },
};

const STATUS: Record<EventRole["status"], { label: string; cls: string }> = {
  available: { label: "Ottenibile", cls: "bg-[#22c55e]/15 text-[#86efac] ring-[#22c55e]/30" },
  soon: { label: "In arrivo", cls: "bg-ember/15 text-ember ring-ember/30" },
  ended: { label: "Non più ottenibile", cls: "bg-crema/[0.06] text-crema/55 ring-sand/15" },
};

function Pill({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider ring-1", className)}>
      {children}
    </span>
  );
}

function RoleCard({ r, preview }: { r: EventRole; preview: boolean }) {
  const t = THEMES[r.theme];
  const Icon = t.icon;
  const st = STATUS[r.status];
  return (
    <article
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-3xl bg-gradient-to-br p-6 ring-1 transition duration-300 hover:-translate-y-1 hover:ring-2",
        t.card,
        r.status === "ended" && "saturate-[0.65]",
      )}
    >
      <div className={cn("pointer-events-none absolute -right-12 -top-12 size-44 rounded-full blur-3xl transition-opacity duration-500 group-hover:opacity-100 opacity-70", t.glow)} />
      <div className="relative flex items-start justify-between gap-3">
        <span className={cn("flex size-12 items-center justify-center rounded-2xl ring-1", t.iconBox)}>
          <Icon className="size-6" />
        </span>
        <div className="flex flex-wrap justify-end gap-1.5">
          {preview ? (
            <Pill className="bg-[#5865f2]/15 text-[#c9cdfb] ring-[#5865f2]/35">
              <Eye className="size-3" /> Solo high staff
            </Pill>
          ) : null}
          <Pill className={st.cls}>
            {r.status === "ended" ? <Lock className="size-3" /> : r.status === "soon" ? <Clock className="size-3" /> : null}
            {st.label}
          </Pill>
        </div>
      </div>
      <p className="relative mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-caramel">{r.event}</p>
      <h3 className="relative mt-1.5 font-display text-xl font-semibold leading-snug [&>span]:max-w-full">
        <RichText text={`<<${r.role}>>`} />
      </h3>
      <p className="relative mt-3 flex-1 text-sm leading-relaxed text-crema/65">
        <RichText text={r.how} />
      </p>
      <p className="relative mt-5 flex items-center gap-2 border-t border-sand/10 pt-4 text-xs text-crema/50">
        <CalendarDays className="size-3.5" /> {r.period}
      </p>
    </article>
  );
}

/** Carta segreta per gli utenti: nessun testo vero nel DOM, solo forme sfocate e il lucchetto. */
function SecretCard() {
  return (
    <article className="relative flex h-full min-h-64 flex-col overflow-hidden rounded-3xl bg-gradient-to-br from-mocha/70 via-roast to-roast p-6 ring-1 ring-sand/12" aria-label="Ruolo evento in arrivo">
      <div aria-hidden className="flex flex-1 select-none flex-col blur-[6px]">
        <div className="flex items-start justify-between">
          <span className="size-12 rounded-2xl bg-caramel/25" />
          <span className="h-5 w-20 rounded-full bg-ember/25" />
        </div>
        <span className="mt-5 h-3 w-28 rounded-full bg-caramel/40" />
        <span className="mt-3 h-6 w-4/5 rounded-lg bg-[#5865f2]/35" />
        <span className="mt-4 h-3 w-full rounded-full bg-crema/15" />
        <span className="mt-2 h-3 w-11/12 rounded-full bg-crema/15" />
        <span className="mt-2 h-3 w-2/3 rounded-full bg-crema/15" />
        <span className="mt-auto h-3 w-1/3 rounded-full bg-crema/10" />
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-roast/30 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-espresso/80 ring-1 ring-caramel/35">
          <Lock className="size-5 text-caramel" />
        </span>
        <p className="font-display text-lg font-semibold">Ruolo in arrivo</p>
        <p className="max-w-[16rem] text-xs text-crema/55">Lo sveliamo all&apos;inizio dell&apos;evento. Resta sintonizzato.</p>
      </div>
    </article>
  );
}

export function EventRoles() {
  const { ready, highStaff } = useEventoStaffAccess();
  const canPreview = ready && highStaff;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {EVENT_ROLES.map((r, i) => (
        <Reveal key={r.role} delay={(i % 3) * 0.06} className="h-full">
          {r.secret && !canPreview ? <SecretCard /> : <RoleCard r={r} preview={Boolean(r.secret)} />}
        </Reveal>
      ))}
    </div>
  );
}
