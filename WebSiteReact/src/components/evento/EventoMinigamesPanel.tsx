"use client";

import { useEffect, useState } from "react";
import { fetchEventoMinigames } from "@/lib/evento-api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";

/** Registry minigames (HS): stato calendario + “implemented” flag. */
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
    <div className="mx-auto max-w-3xl px-6 pb-16">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#f0e6c8]/70">
        Attività · registry
        {meta.epoch ? ` · ${meta.epoch}` : ""}
        {meta.economyOn ? " · economia on" : " · economia off"}
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {items.map((it) => (
          <li
            key={it.id}
            className={cn(
              "rounded-xl px-3 py-2.5 ring-1",
              it.active ? "bg-[#f0e6c8]/10 ring-[#f0e6c8]/35" : "bg-black/25 ring-sand/10 opacity-70",
            )}
          >
            <p className="text-sm font-medium text-crema">
              {it.label}
              <span className="ml-2 text-[10px] uppercase tracking-wider text-crema/45">{it.kind}</span>
            </p>
            <p className="mt-0.5 text-xs text-crema/55">{it.teaser}</p>
            <p className="mt-1 text-[10px] uppercase tracking-wider text-crema/40">
              {it.active ? "calendario: on" : "calendario: off"}
              {" · "}
              {it.implemented ? "play ok" : "scaffold"}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
