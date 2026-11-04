"use client";

import { usePathname } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";
import { SmartLink } from "@/components/SmartLink";
import { useEventoStaffAccess } from "@/components/evento/EventoAccessGate";
import { EVENTO_BRAND, eventoNavForViewer } from "@/lib/evento-starwars";
import { cn } from "@/lib/cn";

/** Navbar evento: sostituisce la nav del sito (bypass chrome VC). */
export function EventoTopNav() {
  const pathname = usePathname() || "/";
  const { ready, access } = useEventoStaffAccess();
  const items = ready ? eventoNavForViewer(access) : [];

  return (
    <header className="sticky top-0 z-40 border-b border-[#f0e6c8]/10 bg-[#05070f]/75 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-3 py-2.5 sm:px-5">
        <SmartLink
          href="/"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-crema/55 ring-1 ring-sand/15 transition hover:text-crema hover:ring-sand/35"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">Sito</span>
        </SmartLink>

        <SmartLink href="/evento/" className="group flex min-w-0 items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-full bg-[#c9a227]/15 ring-1 ring-[#c9a227]/40">
            <Sparkles className="size-3.5 text-sand" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-display text-base font-semibold tracking-[0.12em] text-crema sm:text-lg">
              {EVENTO_BRAND}
            </span>
            <span className="hidden text-[0.6rem] uppercase tracking-[0.28em] text-caramel/80 sm:block">
              Evento galattico
            </span>
          </span>
        </SmartLink>

        <nav
          aria-label="Pagine evento"
          className="ml-auto flex max-w-[58%] flex-1 items-center justify-end gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] sm:max-w-none sm:gap-1.5 [&::-webkit-scrollbar]:hidden"
        >
          {items.map((item) => {
            const active =
              item.id === "hub"
                ? pathname === "/evento" || pathname === "/evento/"
                : pathname === item.href ||
                  pathname === item.href.replace(/\/$/, "") ||
                  (item.id === "puzzle" && (pathname === "/puzzle" || pathname.startsWith("/puzzle/")));
            if (item.locked) {
              return (
                <span
                  key={item.id}
                  role="link"
                  aria-disabled="true"
                  title="In arrivo"
                  className="relative shrink-0 cursor-not-allowed rounded-full px-2.5 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-crema/35 sm:px-3 sm:text-[0.72rem]"
                >
                  <span className="blur-[2.5px] select-none" aria-hidden>
                    {item.label}
                  </span>
                </span>
              );
            }
            return (
              <SmartLink
                key={item.id}
                href={item.href}
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.14em] transition sm:px-3 sm:text-[0.72rem]",
                  active
                    ? "bg-[#c9a227]/20 text-crema ring-1 ring-[#c9a227]/55"
                    : "text-crema/55 hover:bg-white/5 hover:text-crema",
                )}
              >
                {item.label}
              </SmartLink>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
