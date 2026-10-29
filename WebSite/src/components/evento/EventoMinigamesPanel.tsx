"use client";

import { useEffect, useMemo, useState } from "react";
import { Lock } from "lucide-react";
import { SmartLink } from "@/components/SmartLink";
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
};

const HREF_BY_ID: Record<string, string> = Object.fromEntries(
  EVENTO_NAV.filter((n) => n.id !== "hub").map((n) => [n.id, n.href]),
);

/** Calendario attività hub: sbloccate nitide, bloccate blur. */
export function EventoMinigamesPanel() {
  const { token, ready } = useAuth();
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
    const list = [...items];
    /* griglia calendario 7 colonne; pad a multiplo di 7 per look calendario */
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

  return (
    <div className="mx-auto max-w-4xl px-6 pb-16">
      <EventoPanel glow="none" className="!p-4 sm:!p-5">
        <div className="mb-4 text-center">
          <EventoKicker>Calendario attività</EventoKicker>
          <p className="mt-1 text-sm text-crema/65">
            Le missioni si sbloccano col calendario
            {meta.epoch ? ` · ${meta.epoch}` : ""}
            {meta.economyOn ? " · economia on" : ""}.
          </p>
        </div>

        <div className="mb-2 hidden grid-cols-7 gap-1.5 text-center text-[0.55rem] font-semibold uppercase tracking-[0.2em] text-crema/40 sm:grid">
          {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>

        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-7 sm:gap-1.5">
          {cells.map((it, idx) => {
            if (it.kind === "pad") {
              return <li key={it.id} className="hidden min-h-[5.5rem] sm:block" aria-hidden />;
            }
            const unlocked = it.active && it.implemented;
            const href = HREF_BY_ID[it.id];
            const dayNum = idx + 1;
            const inner = (
              <>
                <span className="absolute left-2 top-1.5 text-[0.65rem] font-semibold tabular-nums text-crema/45">
                  {dayNum}
                </span>
                {!unlocked ? (
                  <Lock className="absolute right-2 top-1.5 size-3 text-crema/35" aria-hidden />
                ) : null}
                <span
                  className={cn(
                    "mt-4 block font-display text-base leading-tight sm:text-sm",
                    unlocked ? "text-crema" : "text-crema/70",
                  )}
                >
                  {it.label}
                </span>
                <span className="mt-1 block line-clamp-2 text-[0.65rem] leading-snug text-crema/50">
                  {it.teaser || it.kind}
                </span>
                {unlocked ? (
                  <span className="mt-auto pt-2 text-[0.55rem] font-semibold uppercase tracking-[0.18em] text-[#e4c76b]/80">
                    Apri
                  </span>
                ) : (
                  <span className="mt-auto pt-2 text-[0.55rem] uppercase tracking-[0.16em] text-crema/30">
                    Bloccata
                  </span>
                )}
              </>
            );

            return (
              <li key={it.id} className="min-h-[7.5rem] sm:min-h-[5.5rem]">
                {unlocked && href ? (
                  <SmartLink
                    href={href}
                    className={cn(
                      "relative flex h-full flex-col overflow-hidden rounded-2xl bg-gradient-to-br from-[#c9a227]/20 to-[#2ea8ff]/10 p-2.5 ring-1 ring-[#c9a227]/45 transition hover:ring-[#e4c76b]/70 sm:rounded-xl",
                    )}
                  >
                    {inner}
                  </SmartLink>
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
      </EventoPanel>
    </div>
  );
}
