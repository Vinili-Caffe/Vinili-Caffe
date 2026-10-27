"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PackageOpen } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { fetchEventoStatus, openEventoCrate, type EventoWallet } from "@/lib/evento-api";
import { ADVENT_CRATE_LABELS, type AdventCrateId } from "@/lib/evento-avvento";
import { useAuth } from "@/lib/auth";
import { showToast } from "@/components/ui/toast";
import { EventoBtn, EventoKicker, EventoPanel } from "@/components/evento/EventoUi";

type LootShow = { crateId: string; credits: number; exp: number; note?: string | null };

/** Inventario casse + apri 1 a 1. */
export function EventoCratesPanel() {
  const { token, ready, login } = useAuth();
  const [wallet, setWallet] = useState<EventoWallet | null>(null);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [loot, setLoot] = useState<LootShow | null>(null);

  const reload = useCallback(async () => {
    if (!ready) return;
    const st = await fetchEventoStatus(token);
    if (st?.ok) {
      setWallet(st.wallet || null);
      setLabels(st.crateLabels || {});
    }
  }, [ready, token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const rows = useMemo(() => {
    const crates = wallet?.crates || {};
    return Object.entries(crates)
      .map(([id, qty]) => ({ id, qty: Math.max(0, Math.floor(Number(qty) || 0)) }))
      .filter((r) => r.qty > 0)
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [wallet]);

  async function openOne(crateId: string) {
    if (!token || busy) return;
    setBusy(crateId);
    const out = await openEventoCrate(token, crateId);
    setBusy(null);
    if (!out?.ok) {
      showToast(out?.message || "Apertura fallita.", true);
      return;
    }
    setLoot({
      crateId,
      credits: out.loot?.credits || 0,
      exp: out.loot?.exp || 0,
      note: out.loot?.note,
    });
    if (out.wallet) setWallet(out.wallet);
    else void reload();
    showToast("Cassa aperta!");
  }

  if (!token) {
    return (
      <div className="mx-auto mb-8 max-w-4xl px-6 text-center">
        <button type="button" onClick={login} className="text-sm text-caramel underline underline-offset-2">
          Accedi per aprire le casse
        </button>
      </div>
    );
  }

  if (!rows.length) return null;

  return (
    <div className="mx-auto mb-10 max-w-4xl px-6">
      <EventoPanel glow="gold">
        <div className="mb-4 flex items-center gap-3">
          <PackageOpen className="size-6 text-[#e4c76b]" aria-hidden />
          <div>
            <EventoKicker>Inventario casse</EventoKicker>
            <p className="text-sm text-crema/60">Tocca Apri per estrarre crediti / exp.</p>
          </div>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {rows.map((r) => {
            const name =
              labels[r.id] || ADVENT_CRATE_LABELS[r.id as AdventCrateId] || r.id;
            return (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-xl bg-black/35 px-3.5 py-3 ring-1 ring-sand/15"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-crema">{name}</p>
                  <p className="text-xs text-crema/45">x{r.qty}</p>
                </div>
                <EventoBtn
                  className="!px-3 !py-1.5 !text-xs"
                  disabled={Boolean(busy)}
                  onClick={() => void openOne(r.id)}
                >
                  {busy === r.id ? "..." : "Apri"}
                </EventoBtn>
              </li>
            );
          })}
        </ul>
      </EventoPanel>

      <AnimatePresence>
        {loot ? (
          <motion.div
            className="fixed inset-0 z-[80] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button
              type="button"
              className="absolute inset-0 bg-[#05070f]/80 backdrop-blur-sm"
              aria-label="Chiudi"
              onClick={() => setLoot(null)}
            />
            <motion.div
              className="relative z-10 w-full max-w-sm rounded-3xl bg-gradient-to-b from-[#121a32] to-[#05070f] p-6 text-center ring-1 ring-[#c9a227]/40"
              initial={{ scale: 0.9, y: 16 }}
              animate={{ scale: 1, y: 0 }}
            >
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-[#e4c76b]">Loot</p>
              <p className="mt-2 font-display text-2xl text-crema">
                {labels[loot.crateId] || loot.crateId}
              </p>
              <p className="mt-4 text-lg text-sand">
                +{loot.credits.toLocaleString("it-IT")} crediti
                {loot.exp ? ` · +${loot.exp.toLocaleString("it-IT")} exp` : ""}
              </p>
              {loot.note ? <p className="mt-2 text-xs text-crema/55">{loot.note}</p> : null}
              <EventoBtn className="mt-5" onClick={() => setLoot(null)}>
                Ok
              </EventoBtn>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
