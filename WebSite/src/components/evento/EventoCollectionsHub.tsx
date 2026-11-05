"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Gem, Users } from "lucide-react";
import { fetchEventoCollezioni, type EventoCollectionDeck } from "@/lib/evento-api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { EventoKicker, EventoPanel, EventoSkeleton } from "@/components/evento/EventoUi";

type Mode = "pg" | "reliquie";

function CollectionGrid({ deck, accent }: { deck: EventoCollectionDeck; accent: Mode }) {
  const pct = Math.round((deck.ownedCount / Math.max(1, deck.total)) * 100);
  const bar = accent === "reliquie" ? "from-[#c9a227] to-[#f5e6a3]" : "from-[#3b82f6] to-[#93c5fd]";
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <EventoKicker>
            {deck.active ? "In corso" : "Collezione aperta"} · {deck.ownedCount}/{deck.total}
          </EventoKicker>
          <p className="mt-1 text-sm text-crema/60">
            {accent === "pg"
              ? "Personaggi trovati nei minigiochi Discord."
              : "Reliquie trovate nei minigiochi Discord."}
          </p>
        </div>
        <p className="font-display text-2xl font-bold tabular-nums text-crema">
          {deck.ownedCount}
          <span className="text-crema/40">/{deck.total}</span>
        </p>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-crema/10">
        <div className={cn("h-full rounded-full bg-gradient-to-r", bar)} style={{ width: `${pct}%` }} />
      </div>
      <ul className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
        {deck.items.map((it) => (
          <li
            key={it.id}
            title={it.owned ? it.name : "Non ancora trovata"}
            className={cn(
              "flex flex-col items-center justify-start gap-1.5 rounded-xl px-1.5 py-2 ring-1",
              it.owned ? "bg-crema/[0.07] ring-sand/20" : "bg-black/20 ring-sand/8",
            )}
          >
            <span className="flex size-10 shrink-0 items-center justify-center sm:size-11">
              {it.thumbUrl || it.silhouetteUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={it.owned ? it.thumbUrl || it.silhouetteUrl : it.silhouetteUrl || it.thumbUrl}
                  alt={it.owned ? it.name : ""}
                  loading="lazy"
                  data-vc-lightbox-ignore
                  className={cn("size-full object-contain", !it.owned && "opacity-25 brightness-0")}
                  draggable={false}
                />
              ) : (
                <span className={cn("size-8 rounded-full bg-crema/15", !it.owned && "opacity-30")} />
              )}
            </span>
            <span
              className={cn(
                "w-full break-words hyphens-auto text-center text-[0.65rem] font-semibold leading-tight",
                it.owned
                  ? "text-crema/90"
                  : "pointer-events-none select-none text-crema/75 blur-[5px] [filter:blur(5px)]",
              )}
              aria-hidden={!it.owned}
            >
              {it.name || "???"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Hub collezioni: switch PG ↔ Reliquie (visibili da sblocco fino a fine evento). */
export function EventoCollectionsHub() {
  const { token, ready } = useAuth();
  const [loading, setLoading] = useState(true);
  const [pg, setPg] = useState<EventoCollectionDeck | null>(null);
  const [reliquie, setReliquie] = useState<EventoCollectionDeck | null>(null);
  const [mode, setMode] = useState<Mode>("pg");

  const reload = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    const st = await fetchEventoCollezioni(token);
    setLoading(false);
    if (!st?.ok || !st.visible) {
      setPg(null);
      setReliquie(null);
      return;
    }
    setPg(st.pg || null);
    setReliquie(st.reliquie || null);
  }, [ready, token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const tabs = useMemo(() => {
    const out: Array<{ id: Mode; label: string; icon: typeof Users; count?: string }> = [];
    if (pg) out.push({ id: "pg", label: "PG", icon: Users, count: `${pg.ownedCount}/${pg.total}` });
    if (reliquie)
      out.push({
        id: "reliquie",
        label: "Reliquie",
        icon: Gem,
        count: `${reliquie.ownedCount}/${reliquie.total}`,
      });
    return out;
  }, [pg, reliquie]);

  useEffect(() => {
    if (mode === "pg" && !pg && reliquie) setMode("reliquie");
    if (mode === "reliquie" && !reliquie && pg) setMode("pg");
  }, [mode, pg, reliquie]);

  if (loading) {
    return <EventoSkeleton className="mx-auto mb-10 max-w-4xl px-6" />;
  }
  if (!tabs.length) return null;

  const active = mode === "reliquie" ? reliquie : pg;
  if (!active) return null;

  return (
    <div className="mx-auto mb-10 max-w-4xl px-6">
      <EventoPanel glow="gold" className="!p-4 sm:!p-5">
        <div className="mb-5 flex flex-col items-center gap-3">
          <h2 className="text-center font-display text-2xl font-semibold uppercase tracking-[0.22em] text-caramel sm:text-3xl">
            Collezioni
          </h2>
          {tabs.length > 1 ? (
            <div
              role="tablist"
              aria-label="Collezioni evento"
              className="inline-flex rounded-2xl bg-black/45 p-1 ring-1 ring-[#c9a227]/25"
            >
              {tabs.map((t) => {
                const Icon = t.icon;
                const selected = mode === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setMode(t.id)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition",
                      selected
                        ? t.id === "reliquie"
                          ? "bg-gradient-to-r from-[#c9a227]/90 to-[#e4c76b] text-[#0a1020] shadow-[0_0_20px_-6px_rgba(201,162,39,0.7)]"
                          : "bg-gradient-to-r from-[#2ea8ff]/90 to-[#7dd3fc] text-[#0a1020] shadow-[0_0_20px_-6px_rgba(46,168,255,0.55)]"
                        : "text-crema/55 hover:text-crema/85",
                    )}
                  >
                    <Icon className="size-3.5" aria-hidden />
                    {t.label}
                    {t.count ? <span className="tabular-nums opacity-80">{t.count}</span> : null}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        <CollectionGrid deck={active} accent={mode === "reliquie" && reliquie ? "reliquie" : "pg"} />
      </EventoPanel>
    </div>
  );
}
