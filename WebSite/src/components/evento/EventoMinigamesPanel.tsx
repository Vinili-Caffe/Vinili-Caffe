"use client";

import { useEffect, useMemo, useState } from "react";
import { Lock } from "lucide-react";
import { SmartLink } from "@/components/SmartLink";
import { useEventoStaffAccess } from "@/components/evento/EventoAccessGate";
import { fetchEventoMinigames } from "@/lib/evento-api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { EVENTO_NAV } from "@/lib/evento-starwars";
import { EventoKicker, EventoPanel } from "@/components/evento/EventoUi";

type CalItem = {
  id: string;
  label: string;
  active: boolean;
  implemented: boolean;
  teaser: string;
  kind: string;
  unlockDate?: string | null;
  adventDay?: number | null;
  unlockNote?: string | null;
  href?: string | null;
};

const HREF_BY_ID: Record<string, string> = Object.fromEntries(
  EVENTO_NAV.filter((n) => n.id !== "hub").map((n) => [n.id, n.href]),
);

/** Calendario attività: sbloccate nitide, bloccate blur (HS: tutto leggibile / apribile). */
export function EventoMinigamesPanel({ embedded = false }: { embedded?: boolean }) {
  const { token, ready } = useAuth();
  const { highStaff } = useEventoStaffAccess();
  const [items, setItems] = useState<CalItem[]>([]);
  const [meta, setMeta] = useState<{ epoch?: string | null; economyOn?: boolean }>({});

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    fetchEventoMinigames(token).then((r) => {
      if (!alive || !r?.ok) return;
      setItems(r.items || []);
      setMeta({ epoch: r.epoch, economyOn: r.economyOn });
    });
    return () => {
      alive = false;
    };
  }, [ready, token]);

  const cells = useMemo(() => {
    /* Ordina per data sblocco calendario (poi label). */
    const list = [...items].sort((a, b) => {
      const da = a.unlockDate || "9999";
      const db = b.unlockDate || "9999";
      if (da !== db) return da.localeCompare(db);
      return String(a.label).localeCompare(String(b.label), "it");
    });
    while (list.length % 7 !== 0 && list.length > 0) {
      list.push({
        id: `__pad-${list.length}`,
        label: "",
        active: false,
        implemented: false,
        teaser: "",
        kind: "pad",
      });
    }
    return list;
  }, [items]);

  if (!items.length) return null;

  const body = (
    <>
      {!embedded ? (
        <div className="mb-4 text-center">
          <EventoKicker>Calendario attività</EventoKicker>
          <p className="mt-1 text-sm text-crema/65">
            {highStaff
              ? "Anteprima High Staff — tutte le missioni leggibili"
              : "Le missioni si sbloccano col calendario"}
            {meta.epoch ? ` · ${meta.epoch}` : ""}
            {meta.economyOn ? " · economia on" : ""}.
          </p>
        </div>
      ) : null}

      <div className="mb-2 hidden grid-cols-7 gap-1.5 text-center text-[0.55rem] font-semibold uppercase tracking-[0.2em] text-crema/40 sm:grid">
        {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-7 sm:gap-1.5">
        {cells.map((it) => {
          if (it.kind === "pad") {
            return <li key={it.id} className="hidden min-h-[5.5rem] sm:block" aria-hidden />;
          }
          const liveOpen = it.active && it.implemented;
          const href = it.href || HREF_BY_ID[it.id];
          const canOpen = Boolean(href && it.implemented && (liveOpen || highStaff));
          const showClear = liveOpen || highStaff;
          const dayBadge = it.adventDay != null ? it.adventDay : null;
          const footer = canOpen
            ? highStaff && !liveOpen
              ? "Anteprima"
              : "Apri"
            : highStaff
              ? "Presto"
              : "Bloccata";
          const inner = (
            <>
              <span className="absolute left-2 top-1.5 text-[0.65rem] font-semibold tabular-nums text-crema/45">
                {dayBadge != null ? (
                  <span className="text-[#e4c76b]/85">A{dayBadge}</span>
                ) : (
                  "—"
                )}
              </span>
              {!showClear ? (
                <Lock className="absolute right-2 top-1.5 size-3 text-crema/35" aria-hidden />
              ) : null}
              <span
                className={cn(
                  "mt-4 block font-display text-base leading-tight sm:text-sm",
                  showClear ? "text-crema" : "text-crema/70",
                )}
              >
                {it.label}
              </span>
              <span className="mt-1 block line-clamp-2 text-[0.65rem] leading-snug text-crema/50">
                {it.unlockNote || it.teaser || it.kind}
              </span>
              {it.unlockDate ? (
                <span className="mt-0.5 block text-[0.5rem] tabular-nums text-crema/35">{it.unlockDate}</span>
              ) : null}
              <span
                className={cn(
                  "mt-auto pt-2 text-[0.55rem] uppercase tracking-[0.16em]",
                  canOpen ? "font-semibold tracking-[0.18em] text-[#e4c76b]/80" : "text-crema/30",
                )}
              >
                {footer}
              </span>
            </>
          );

          return (
            <li key={it.id} className="min-h-[7.5rem] sm:min-h-[5.5rem]">
              {canOpen && href ? (
                <SmartLink
                  href={href}
                  className={cn(
                    "relative flex h-full flex-col overflow-hidden rounded-2xl bg-gradient-to-br from-[#c9a227]/20 to-[#2ea8ff]/10 p-2.5 ring-1 ring-[#c9a227]/45 transition hover:ring-[#e4c76b]/70 sm:rounded-xl",
                  )}
                >
                  {inner}
                </SmartLink>
              ) : showClear ? (
                <div
                  className={cn(
                    "relative flex h-full flex-col overflow-hidden rounded-2xl bg-black/35 p-2.5 ring-1 ring-sand/15 sm:rounded-xl",
                  )}
                  aria-label={`${it.label} anteprima`}
                >
                  <div className="relative flex h-full flex-col">{inner}</div>
                </div>
              ) : (
                <div
                  className={cn(
                    "relative flex h-full flex-col overflow-hidden rounded-2xl bg-black/40 p-2.5 ring-1 ring-sand/10 sm:rounded-xl",
                  )}
                  aria-label={`${it.label} bloccata`}
                >
                  <div className="pointer-events-none absolute inset-0 backdrop-blur-[6px]" aria-hidden />
                  <div className="relative flex h-full flex-col opacity-55 blur-[2.5px] select-none">{inner}</div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );

  if (embedded) return <div className="w-full">{body}</div>;

  return (
    <div className="mx-auto max-w-4xl px-6 pb-16">
      <EventoPanel glow="none" className="!p-4 sm:!p-5">
        {body}
      </EventoPanel>
    </div>
  );
}
