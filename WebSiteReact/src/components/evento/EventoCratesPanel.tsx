"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "motion/react";
import { fetchEventoStatus, openEventoCrate, type EventoWallet } from "@/lib/evento-api";
import { ADVENT_CRATE_LABELS, type AdventCrateId } from "@/lib/evento-avvento";
import { useAuth } from "@/lib/auth";
import { showToast } from "@/components/ui/toast";
import { EventoKicker, EventoPanel } from "@/components/evento/EventoUi";
import {
  EventoCrateArt,
  EventoCrateOpenOverlay,
  type CrateLootPayload,
} from "@/components/evento/EventoCrateArt";

/** Inventario casse: chest vere + apertura con card premio. */
export function EventoCratesPanel() {
  const { token, ready, login } = useAuth();
  const [wallet, setWallet] = useState<EventoWallet | null>(null);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [loot, setLoot] = useState<CrateLootPayload | null>(null);

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
    if (!token || busy || loot) return;
    setBusy(crateId);
    const out = await openEventoCrate(token, crateId);
    setBusy(null);
    if (!out?.ok) {
      showToast(out?.message || "Apertura fallita.", true);
      return;
    }
    const name = labels[crateId] || ADVENT_CRATE_LABELS[crateId as AdventCrateId] || crateId;
    setLoot({
      crateId,
      label: name,
      credits: out.loot?.credits || 0,
      exp: out.loot?.exp || 0,
      note: out.loot?.note,
    });
    if (out.wallet) setWallet(out.wallet);
    else void reload();
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
        <div className="mb-5 text-center sm:text-left">
          <EventoKicker>Inventario casse</EventoKicker>
          <p className="mt-1 text-sm text-crema/60">Tocca una cassa per aprirla e rivelare i premi.</p>
        </div>
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {rows.map((r) => {
            const name = labels[r.id] || ADVENT_CRATE_LABELS[r.id as AdventCrateId] || r.id;
            const loading = busy === r.id;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  disabled={Boolean(busy) || Boolean(loot)}
                  onClick={() => void openOne(r.id)}
                  className="group flex w-full flex-col items-center rounded-2xl bg-black/40 px-2 pb-3 pt-4 ring-1 ring-sand/15 transition hover:bg-black/55 hover:ring-[#c9a227]/35 disabled:opacity-60"
                >
                  <EventoCrateArt
                    crateId={r.id}
                    size="md"
                    qty={r.qty}
                    shake={loading}
                    open={false}
                  />
                  <p className="mt-2 line-clamp-2 px-1 text-center text-xs font-semibold text-crema group-hover:text-[#f0d78c]">
                    {name}
                  </p>
                  <p className="mt-0.5 text-[0.65rem] uppercase tracking-wider text-crema/40">
                    {loading ? "Apertura…" : "Apri"}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      </EventoPanel>

      <AnimatePresence>
        {loot ? <EventoCrateOpenOverlay loot={loot} onClose={() => setLoot(null)} /> : null}
      </AnimatePresence>
    </div>
  );
}
