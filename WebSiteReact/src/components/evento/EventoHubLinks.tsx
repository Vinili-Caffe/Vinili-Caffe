"use client";

import { SmartLink } from "@/components/SmartLink";
import { useEventoStaffAccess } from "@/components/evento/EventoAccessGate";
import { EventoKicker, EventoPanel } from "@/components/evento/EventoUi";
import { eventoNavForViewer } from "@/lib/evento-starwars";
import { cn } from "@/lib/cn";

const ACCENTS: Record<string, string> = {
  avvento: "from-[#c9a227]/25 to-transparent",
  smistamento: "from-[#2ea8ff]/25 to-transparent",
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
    return <div className="mx-auto mb-8 h-40 max-w-4xl animate-pulse rounded-[1.35rem] bg-[#f0e6c8]/8 px-6" />;
  }

  if (!links.length) return null;

  return (
    <div className="mx-auto max-w-4xl px-6 pb-10">
      <EventoPanel glow="none" className="mb-5 !py-4 text-center">
        <EventoKicker>Settori della galassia</EventoKicker>
        <p className="mt-1 text-sm text-[#f0e6c8]/6">Scegli un mondo e entra nella missione.</p>
      </EventoPanel>
      <div className="grid gap-3 sm:grid-cols-2">
        {links.map((item) => (
          <SmartLink
            key={item.id}
            href={item.href}
            className={cn(
              "group relative overflow-hidden rounded-[1.25rem] border border-[#f0e6c8]/1 bg-[rgba(10,16,32,0.78)] p-5 ring-1 ring-[#f0e6c8]/12 transition hover:ring-[#c9a227]/45",
            )}
          >
            <div
              className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br opacity-80", ACCENTS[item.id] || "from-[#c9a227]/15 to-transparent")}
              aria-hidden
            />
            <p className="relative text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-[#c9a227]">
              {item.label}
              {item.soon ? " · soon" : ""}
            </p>
            <p className="relative mt-2 font-display text-2xl text-[#f0e6c8] transition group-hover:text-[#e4c76b]">
              {item.label}
            </p>
            <p className="relative mt-2 text-sm leading-relaxed text-[#f0e6c8]/65">{item.teaser}</p>
          </SmartLink>
        ))}
      </div>
    </div>
  );
}
