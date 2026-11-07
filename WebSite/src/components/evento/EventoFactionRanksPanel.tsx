"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { ChevronDown, ChevronUp, Crown, Shield } from "lucide-react";
import {
  fetchEventoFactionRanks,
  postEventoFactionRankAction,
  type EventoFactionRanksSnapshot,
} from "@/lib/evento-api";
import { notifyEventoFactionSync } from "@/lib/evento-faction-sync";
import { useAuth } from "@/lib/auth";
import { showToast } from "@/components/ui/toast";
import { EventoBtn, EventoPanel } from "@/components/evento/EventoUi";
import { cn } from "@/lib/cn";

function stripMd(s?: string | null) {
  return String(s || "")
    .replace(/\*\*/g, "")
    .trim();
}

/** Gestione ranghi fazione — solo rango massimo (o claim se vacante). */
export function EventoFactionRanksPanel({
  enabled,
  onChanged,
}: {
  enabled?: boolean;
  /** Dopo promote/demote/claim — aggiorna shop/hub subito. */
  onChanged?: () => void;
}) {
  const { token, ready } = useAuth();
  const [data, setData] = useState<EventoFactionRanksSnapshot | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!ready || !token) return;
    setLoading(true);
    const out = await fetchEventoFactionRanks(token);
    setData(out);
    setLoading(false);
  }, [ready, token]);

  useEffect(() => {
    if (!enabled) return;
    void reload();
  }, [enabled, reload]);

  async function act(action: "promote" | "demote" | "claim", userId?: string) {
    if (!token || busy) return;
    setBusy(`${action}:${userId || "self"}`);
    const out = await postEventoFactionRankAction(token, action, userId);
    setBusy(null);
    if (!out?.ok) {
      showToast(out?.message || "Operazione non riuscita.", true);
      return;
    }
    showToast(stripMd(out.message) || "Fatto.");
    await reload();
    onChanged?.();
    notifyEventoFactionSync(action);
  }

  if (!enabled) return null;
  if (loading && !data) {
    return (
      <EventoPanel glow="gold">
        <p className="text-sm text-crema/50">Carico organico fazione…</p>
      </EventoPanel>
    );
  }
  if (!data?.ok) {
    return (
      <EventoPanel glow="gold">
        <p className="text-sm text-crema/55">{data?.message || "Ranghi non disponibili."}</p>
      </EventoPanel>
    );
  }

  const manage = Boolean(data.canManageRanks);
  const claim = Boolean(data.canClaimMarshal);
  const members = data.members || [];

  return (
    <EventoPanel glow="gold" className="!overflow-hidden">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-[#e4c76b]">
            Catena di comando
          </p>
          <h3 className="mt-1 font-display text-2xl text-crema sm:text-3xl">Ranghi fazione</h3>
          <p className="mt-1 text-sm text-crema/55">
            {manage
              ? "Puoi promuovere o declassare i membri (il tuo rango resta fisso)."
              : claim
                ? "Nessun comandante: puoi reclamare il rango massimo."
                : "Solo il rango massimo gestisce le promozioni."}
          </p>
        </div>
        {data.selfRank?.label ? (
          <span className="rounded-full bg-[#c9a227]/20 px-3 py-1.5 text-xs font-semibold text-[#e4c76b] ring-1 ring-[#c9a227]/40">
            Tu · {data.selfRank.label}
          </span>
        ) : null}
      </div>

      {claim ? (
        <div className="mb-5 rounded-2xl bg-gradient-to-r from-[#c9a227]/20 to-transparent p-4 ring-1 ring-[#c9a227]/35">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <Crown className="mt-0.5 size-5 shrink-0 text-[#e4c76b]" aria-hidden />
              <div>
                <p className="font-semibold text-crema">Comando vacante</p>
                <p className="mt-0.5 text-xs text-crema/60">
                  Nessuno ha il rango massimo in questa fazione.
                </p>
              </div>
            </div>
            <EventoBtn disabled={Boolean(busy)} onClick={() => void act("claim")}>
              {busy === "claim:self" ? "…" : "Reclama il comando"}
            </EventoBtn>
          </div>
        </div>
      ) : null}

      <ul className="space-y-2">
        {members.map((m, i) => {
          const tier = Number(m.tier) || 1;
          const canUp = manage && !m.isSelf && tier < 3;
          const canDown = manage && !m.isSelf && tier > 1 && tier < 4;
          return (
            <motion.li
              key={m.userId}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(0.35, i * 0.03), duration: 0.35 }}
              className={cn(
                "flex flex-wrap items-center gap-3 rounded-2xl bg-black/40 px-3 py-3 ring-1 ring-cyan-300/15 sm:px-4",
                m.isMarshal && "ring-[#c9a227]/40",
                m.isSelf && "bg-[#c9a227]/8",
              )}
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                {m.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.avatarUrl}
                    alt=""
                    width={40}
                    height={40}
                    className="size-10 shrink-0 rounded-full object-cover ring-1 ring-white/15"
                    data-vc-lightbox-ignore
                  />
                ) : (
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15">
                    <Shield className="size-4 text-crema/50" aria-hidden />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate font-semibold text-crema">
                    {m.displayName}
                    {m.isSelf ? <span className="ml-1.5 text-xs font-normal text-crema/45">(tu)</span> : null}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[#e4c76b]/90">
                    {m.isMarshal ? <Crown className="size-3.5 shrink-0" aria-hidden /> : null}
                    <span className="truncate">{m.rank?.label || `Rango ${tier}`}</span>
                  </p>
                </div>
              </div>

              {manage && !m.isSelf ? (
                <div className="ml-auto flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    title="Declassa"
                    disabled={!canDown || Boolean(busy)}
                    onClick={() => void act("demote", m.userId)}
                    className="inline-flex size-9 items-center justify-center rounded-full bg-white/5 text-crema/80 ring-1 ring-white/10 transition hover:bg-rose-500/20 hover:text-rose-200 disabled:opacity-30"
                  >
                    <ChevronDown className="size-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    title="Promuovi"
                    disabled={!canUp || Boolean(busy)}
                    onClick={() => void act("promote", m.userId)}
                    className="inline-flex size-9 items-center justify-center rounded-full bg-white/5 text-crema/80 ring-1 ring-white/10 transition hover:bg-sky-500/20 hover:text-sky-200 disabled:opacity-30"
                  >
                    <ChevronUp className="size-4" aria-hidden />
                  </button>
                </div>
              ) : null}
            </motion.li>
          );
        })}
      </ul>

      {!members.length ? (
        <p className="rounded-2xl bg-black/40 px-4 py-8 text-center text-sm text-crema/55 ring-1 ring-cyan-300/15">
          Nessun membro in fazione.
        </p>
      ) : null}
    </EventoPanel>
  );
}
