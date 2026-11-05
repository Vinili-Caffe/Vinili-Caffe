"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchEventoStatus, type EventoWallet } from "@/lib/evento-api";
import { useAuth } from "@/lib/auth";
import { EventoKicker, EventoPanel } from "@/components/evento/EventoUi";

/** Inventario arsenale personale (truppe + pending). */
export function EventoArmyPanel() {
  const { token, ready, login } = useAuth();
  const [wallet, setWallet] = useState<EventoWallet | null>(null);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [power, setPower] = useState(0);

  const reload = useCallback(async () => {
    if (!ready) return;
    const st = await fetchEventoStatus(token);
    if (st?.ok) {
      setWallet(st.wallet || null);
      setLabels(st.unitLabels || {});
      setPower(Math.max(0, Math.floor(Number(st.armyPower) || 0)));
    }
  }, [ready, token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const rows = useMemo(() => {
    const army = wallet?.army || {};
    const pending = wallet?.pendingTroops || {};
    const ids = new Set([...Object.keys(army), ...Object.keys(pending)]);
    return [...ids]
      .map((id) => ({
        id,
        qty: Math.max(0, Math.floor(Number(army[id]) || 0)),
        pending: Math.max(0, Math.floor(Number(pending[id]) || 0)),
        label: labels[id] || id.replace(/_/g, " "),
      }))
      .filter((r) => r.qty > 0 || r.pending > 0)
      .sort((a, b) => a.label.localeCompare(b.label, "it"));
  }, [wallet, labels]);

  const totalUnits = useMemo(() => rows.reduce((s, r) => s + r.qty, 0), [rows]);

  if (!token) {
    return (
      <div className="mx-auto mb-8 max-w-4xl px-6 text-center">
        <button type="button" onClick={login} className="text-sm text-caramel underline underline-offset-2">
          Accedi per vedere l&apos;arsenale
        </button>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="mx-auto mb-10 max-w-4xl px-6">
        <EventoPanel glow="gold">
          <EventoKicker>Inventario arsenale</EventoKicker>
          <p className="mt-2 text-sm text-crema/60">
            Nessuna truppa personale. Compra unità dallo shop fazioni qui sotto.
          </p>
        </EventoPanel>
      </div>
    );
  }

  return (
    <div className="mx-auto mb-10 max-w-4xl px-6">
      <EventoPanel glow="gold">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 text-center sm:text-left">
            <EventoKicker>Inventario arsenale</EventoKicker>
            <p className="mt-1 text-sm text-crema/60">Truppe personali versate alla fazione.</p>
          </div>
          <div className="mx-auto flex gap-2 sm:mx-0">
            <p className="rounded-full bg-[#c9a227]/15 px-3 py-1 text-sm font-semibold tabular-nums text-[#f0d78c] ring-1 ring-[#c9a227]/35">
              {totalUnits} {totalUnits === 1 ? "unità" : "unità"}
            </p>
            <p className="rounded-full bg-sky-500/15 px-3 py-1 text-sm font-semibold tabular-nums text-sky-200 ring-1 ring-sky-400/30">
              potenza {power.toLocaleString("it-IT")}
            </p>
          </div>
        </div>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {rows.map((r) => (
            <li key={r.id} className="rounded-2xl bg-black/40 px-3 py-3 ring-1 ring-sand/15">
              <p className="line-clamp-2 text-xs font-semibold text-crema">{r.label}</p>
              <p className="mt-2 font-sans text-2xl font-bold tabular-nums tracking-tight text-[#e4c76b]">×{r.qty}</p>
              {r.pending > 0 ? (
                <p className="mt-1 text-[0.65rem] uppercase tracking-wider text-crema/40">
                  +{r.pending} in arrivo
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </EventoPanel>
    </div>
  );
}
