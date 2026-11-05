"use client";

import { usePathname } from "next/navigation";
import { ArrowLeft, ChevronDown, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SmartLink } from "@/components/SmartLink";
import { useEventoStaffAccess } from "@/components/evento/EventoAccessGate";
import {
  EVENTO_BRAND,
  eventoEventiNavForViewer,
  eventoPrimaryNavForViewer,
  type EventoNavItemView,
} from "@/lib/evento-starwars";
import { cn } from "@/lib/cn";
import { page } from "@/lib/site";

function linkActive(pathname: string, href: string, id: string) {
  const p = pathname.endsWith("/") ? pathname : `${pathname}/`;
  const h = href.endsWith("/") ? href : `${href}/`;
  if (id === "hub" || h === "/evento/") return p === "/evento/";
  if (h === "/puzzle/") return p === "/puzzle/" || p.startsWith("/puzzle/");
  return p === h || p.startsWith(h);
}

function EventiMenu({ items }: { items: EventoNavItemView[] }) {
  const pathname = usePathname() || "/";
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const active = items.some((l) => !l.locked && linkActive(pathname, l.href, l.id));

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (!items.length) return null;

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.14em] transition sm:px-3 sm:text-[0.72rem]",
          active ? "bg-[#c9a227]/20 text-crema ring-1 ring-[#c9a227]/55" : "text-crema/55 hover:bg-white/5 hover:text-crema",
        )}
      >
        Eventi
        <ChevronDown className={cn("size-3 opacity-70 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute right-0 top-full z-50 mt-1 min-w-[11rem] overflow-hidden rounded-2xl bg-[#0a1020]/95 p-1.5 ring-1 ring-[#c9a227]/25 backdrop-blur-xl"
          >
            <ul>
              {items.map((item) =>
                item.locked ? (
                  <li key={item.id}>
                    <span className="block cursor-not-allowed rounded-xl px-3 py-2 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-crema/35">
                      <span className="blur-[2.5px] select-none">{item.label}</span>
                    </span>
                  </li>
                ) : (
                  <li key={item.id}>
                    <SmartLink
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "block rounded-xl px-3 py-2 text-[0.7rem] font-semibold uppercase tracking-[0.14em] transition",
                        linkActive(pathname, item.href, item.id)
                          ? "bg-[#c9a227]/20 text-crema"
                          : "text-crema/70 hover:bg-white/5 hover:text-crema",
                      )}
                    >
                      {item.label}
                    </SmartLink>
                  </li>
                ),
              )}
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** Navbar evento: sostituisce la nav del sito (bypass chrome VC). */
export function EventoTopNav() {
  const pathname = usePathname() || "/";
  const { ready, access } = useEventoStaffAccess();
  const primary = ready ? eventoPrimaryNavForViewer(access) : [];
  const eventi = ready ? eventoEventiNavForViewer(access) : [];

  return (
    <header className="sticky top-0 z-40 border-b border-[#f0e6c8]/10 bg-[#05070f]/75 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-3 py-2.5 sm:px-5">
        <SmartLink
          href={page("/")}
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
          {primary.map((item) => {
            const active = linkActive(pathname, item.href, item.id);
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
          <EventiMenu items={eventi} />
        </nav>
      </div>
    </header>
  );
}
