"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight, Swords } from "lucide-react";
import { fetchEventoWars, type EventoWarSummary } from "@/lib/evento-api";
import { useAuth } from "@/lib/auth";
import { useEventoFactionSync } from "@/lib/evento-faction-sync";
import { EventoPanel } from "@/components/evento/EventoUi";
import { EventoWarReportModal } from "@/components/evento/EventoWarReportModal";
import { cn } from "@/lib/cn";

function fmt(n?: number | null) {
  return Math.max(0, Math.floor(Number(n) || 0)).toLocaleString("it-IT");
}

function formatWhen(iso?: string | null, hourKey?: string | null) {
  const raw = iso || (hourKey ? `${hourKey}:00:00.000Z` : null);
  if (!raw) return "—";
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return String(hourKey || "—");
  return d.toLocaleString("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Registro guerre fazione — visibile a tutti i ranghi; apri per il resoconto. */
export function EventoWarRegistryPanel({ enabled }: { enabled?: boolean }) {
  const { token, ready } = useAuth();
  const [wars, setWars] = useState<EventoWarSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!ready || !token || !enabled) return;
    const out = await fetchEventoWars(token, 40);
    setWars(out?.ok ? out.wars || [] : []);
    setLoading(false);
  }, [ready, token, enabled]);

  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    void reload();
  }, [enabled, reload]);

  useEventoFactionSync(() => {
    void reload();
  }, { enabled: Boolean(enabled), pollMs: 20_000 });

  if (!enabled) return null;

  return (
    <>
      <EventoPanel glow="blue" className="!overflow-hidden">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-sky-300/90">
              Cronache di guerra
            </p>
            <h3 className="mt-1 font-display text-2xl text-crema sm:text-3xl">Registro guerre</h3>
            <p className="mt-1 text-sm text-crema/55">
              Tutti i ranghi possono consultare gli scontri e aprirne il resoconto completo.
            </p>
          </div>
          <span className="rounded-full bg-sky-500/15 px-3 py-1.5 text-xs font-semibold tabular-nums text-sky-100 ring-1 ring-sky-400/30">
            {fmt(wars.length)} battaglie
          </span>
        </div>

        {loading && !wars.length ? (
          <div className="h-28 animate-pulse rounded-2xl bg-crema/8" />
        ) : !wars.length ? (
          <p className="rounded-2xl bg-black/35 px-4 py-8 text-center text-sm text-crema/55 ring-1 ring-white/10">
            Nessuna guerra registrata ancora. Gli scontri orari appariranno qui a risoluzione.
          </p>
        ) : (
          <ul className="space-y-2">
            {wars.map((w, i) => {
              const dead =
                (Number(w.left?.deadCount) || 0) + (Number(w.right?.deadCount) || 0);
              const result =
                w.youWon === true
                  ? "Vittoria"
                  : w.youWon === false
                    ? "Sconfitta"
                    : w.winnerLabel
                      ? w.winnerLabel
                      : "Stallo";
              return (
                <motion.li
                  key={w.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(0.3, i * 0.03), duration: 0.3 }}
                >
                  <button
                    type="button"
                    onClick={() => setOpenId(w.id)}
                    className={cn(
                      "group flex w-full flex-wrap items-center gap-3 rounded-2xl bg-black/40 px-3 py-3 text-left ring-1 ring-white/10 transition hover:bg-black/55 hover:ring-sky-400/35 sm:px-4",
                      w.youWon === true && "ring-emerald-400/25",
                      w.youWon === false && "ring-rose-400/25",
                    )}
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sky-500/15 ring-1 ring-sky-400/30">
                      <Swords className="size-4 text-sky-200" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-crema">{w.modeLabel || "Guerra"}</span>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[0.65rem] font-semibold",
                            w.youWon === true && "bg-emerald-500/20 text-emerald-200",
                            w.youWon === false && "bg-rose-500/20 text-rose-200",
                            w.youWon == null && "bg-white/10 text-crema/70",
                          )}
                        >
                          {result}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs text-crema/50">
                        {w.left?.factionLabel || "—"} vs {w.right?.factionLabel || "—"} ·{" "}
                        {formatWhen(w.resolvedAt, w.hourKey)} · cadute {fmt(dead)}
                      </span>
                    </span>
                    <ChevronRight
                      className="size-4 shrink-0 text-crema/35 transition group-hover:translate-x-0.5 group-hover:text-sky-200"
                      aria-hidden
                    />
                  </button>
                </motion.li>
              );
            })}
          </ul>
        )}
      </EventoPanel>

      <AnimatePresence>
        {openId && token ? (
          <EventoWarReportModal warId={openId} token={token} onClose={() => setOpenId(null)} />
        ) : null}
      </AnimatePresence>
    </>
  );
}
