"use client";

import { usePathname } from "next/navigation";
import { SmartLink } from "@/components/SmartLink";
import { useEventoStaffAccess } from "@/components/evento/EventoAccessGate";
import { eventoNavForViewer } from "@/lib/evento-starwars";
import { cn } from "@/lib/cn";

/** Tab sottomenu evento Star Wars (filtrate per HS / finestra pubblica + feature calendar). */
export function EventoNav({ className }: { className?: string }) {
  const pathname = usePathname() || "/";
  const { ready, access } = useEventoStaffAccess();
  const items = ready ? eventoNavForViewer(access) : [];

  if (!items.length) return null;

  return (
    <nav
      aria-label="Evento Star Wars"
      className={cn(
        "mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-1.5 px-4 sm:gap-2",
        className,
      )}
    >
      {items.map((item) => {
        const active =
          item.id === "hub"
            ? pathname === "/evento" || pathname === "/evento/"
            : pathname === item.href || pathname === item.href.replace(/\/$/, "");
        if (item.locked) {
          return (
            <span
              key={item.id}
              role="link"
              aria-disabled="true"
              title="In arrivo"
              className="cursor-not-allowed rounded-full bg-black/20 px-3 py-1.5 text-xs font-semibold tracking-wide text-crema/35 ring-1 ring-sand/10 sm:text-[0.8rem]"
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
              "rounded-full px-3 py-1.5 text-xs font-semibold tracking-wide ring-1 transition-colors sm:text-[0.8rem]",
              active
                ? "bg-crema/15 text-crema ring-sand/45"
                : "bg-black/25 text-crema/70 ring-sand/15 hover:bg-black/40 hover:text-crema",
            )}
          >
            {item.label}
            {item.soon ? <span className="ml-1 opacity-50">·</span> : null}
          </SmartLink>
        );
      })}
    </nav>
  );
}
