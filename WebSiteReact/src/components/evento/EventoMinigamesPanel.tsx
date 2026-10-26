"use client";

import { useEffect, useState } from "react";
import { fetchEventoMinigames } from "@/lib/evento-api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { EventoKicker, EventoPanel } from "@/components/evento/EventoUi";

/** Registry minigames: calendario + implemented. */
export function EventoMinigamesPanel() {
  const { token, ready } = useAuth();
  const [items, setItems] = useState<
    Array<{ id: string; label: string; active: boolean; implemented: boolean; teaser: string; kind: string }>
  >([]);
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

  if (!items.length) return null;

  return (
    <div className="mx-auto max-w-4xl px-6 pb-16">
      <EventoPanel glow="none">
        <EventoKicker>
          Registry attività
          {meta.epoch ? ` · ${meta.epoch}` : ""}
          {meta.economyOn ? " · economia on" : " · economia off"}
        </EventoKicker>
        <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {items.map((it) => (
            <li
              key={it.id}
              className={cn(
                "rounded-xl px-3.5 py-3 ring-1",
                it.active
                  ? "bg-[#c9a227]/12 ring-[#c9a227]/4"
                  : "bg-black/25 ring-sand/15 opacity-75",
              )}
            >
              <p className="text-sm font-semibold text-crema">
                {it.label}
                <span className="ml-2 text-[0.6rem] uppercase tracking-[0.18em] text-crema/45">
                  {it.kind}
                </span>
              </p>
              <p className="mt-1 text-xs leading-relaxed text-crema/55">{it.teaser}</p>
              <p className="mt-2 text-[0.6rem] uppercase tracking-[0.16em] text-crema/35">
                {it.active ? "calendario on" : "calendario off"}
                {" · "}
                {it.implemented ? "play ok" : "scaffold"}
              </p>
            </li>
          ))}
        </ul>
      </EventoPanel>
    </div>
  );
}
