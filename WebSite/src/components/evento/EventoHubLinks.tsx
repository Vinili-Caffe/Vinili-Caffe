"use client";

import { SmartLink } from "@/components/SmartLink";
import { useEventoStaffAccess } from "@/components/evento/EventoAccessGate";
import { EventoKicker, EventoPanel } from "@/components/evento/EventoUi";
import { eventoNavForViewer } from "@/lib/evento-starwars";
import { cn } from "@/lib/cn";

const ACCENTS: Record<string, string> = {
  avvento: "from-caramel/30 to-transparent",
  smistamento: "from-sky-500/25 to-transparent",
  accademia: "from-emerald-500/20 to-transparent",
  gara: "from-orange-500/20 to-transparent",
  miniera: "from-violet-500/20 to-transparent",
  puzzle: "from-rose-500/20 to-transparent",
};

/** Card hub: sezioni consentite al viewer. */
export function EventoHubLinks() {
  const { ready, access } = useEventoStaffAccess();
  const links = ready ? eventoNavForViewer(access).filter((n) => n.id !== "hub") : [];

  if (!ready) {
    return <div className="mx-auto mb-8 h-40 max-w-4xl animate-pulse rounded-3xl bg-crema/8 px-6" />;
  }

  if (!links.length) return null;

  return (
    <div className="mx-auto max-w-4xl px-6 pb-10">
      <EventoPanel glow="none" className="mb-5 !py-4 text-center">
        <EventoKicker>Settori della galassia</EventoKicker>
        <p className="mt-1 text-sm text-crema/70">Scegli un mondo e entra nella missione.</p>
      </EventoPanel>
      <div className="grid gap-3 sm:grid-cols-2">
        {links.map((item) => (
          <SmartLink
            key={item.id}
            href={item.href}
            className={cn(
              "group relative overflow-hidden rounded-3xl bg-gradient-to-b from-caramel/[0.12] via-roast/90 to-roast p-5 ring-1 ring-sand/15 transition hover:ring-caramel/45",
            )}
          >
            <div
              className={cn(
                "pointer-events-none absolute inset-0 bg-gradient-to-br opacity-90",
                ACCENTS[item.id] || "from-caramel/20 to-transparent",
              )}
              aria-hidden
            />
            <p className="relative text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-caramel">
              {item.label}
              {item.soon ? " · soon" : ""}
            </p>
            <p className="relative mt-2 font-display text-2xl text-crema transition group-hover:text-sand">
              {item.label}
            </p>
            <p className="relative mt-2 text-sm leading-relaxed text-crema/70">{item.teaser}</p>
          </SmartLink>
        ))}
      </div>
    </div>
  );
}
