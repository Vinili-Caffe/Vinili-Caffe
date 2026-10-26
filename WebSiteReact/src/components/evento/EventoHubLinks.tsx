"use client";

import { SmartLink } from "@/components/SmartLink";
import { useEventoStaffAccess } from "@/components/evento/EventoAccessGate";
import { eventoNavForViewer } from "@/lib/evento-starwars";
import { cn } from "@/lib/cn";

/** Card hub: solo sezioni consentite al viewer. */
export function EventoHubLinks() {
  const { ready, access } = useEventoStaffAccess();
  const links = ready ? eventoNavForViewer(access).filter((n) => n.id !== "hub") : [];

  if (!ready) {
    return <div className="mx-auto mb-8 h-32 max-w-3xl animate-pulse rounded-2xl bg-crema/8 px-6" />;
  }

  if (!links.length) return null;

  return (
    <div className="mx-auto grid max-w-3xl gap-3 px-6 pb-8 sm:grid-cols-2">
      {links.map((item) => (
        <SmartLink
          key={item.id}
          href={item.href}
          className={cn(
            "rounded-2xl bg-gradient-to-br from-[#0b1220]/90 to-[#1a140c]/90 p-5 ring-1 ring-[#f0e6c8]/18 transition hover:ring-[#f0e6c8]/40",
          )}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#f0e6c8]/75">
            {item.label}
            {item.soon ? " · soon" : ""}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-crema/75">{item.teaser}</p>
        </SmartLink>
      ))}
    </div>
  );
}
