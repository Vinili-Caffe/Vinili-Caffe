"use client";

import { useCallback, useEffect, useState } from "react";
import { attackEventoFaction, buyEventoUnit, fetchEventoShop } from "@/lib/evento-api";
import { useAuth } from "@/lib/auth";
import { showToast } from "@/components/ui/toast";

type Unit = { id: string; label: string; cost: number; power: number; tier: number };

export function EventoShopPanel() {
  const { token, ready, login } = useAuth();
  const [units, setUnits] = useState<Unit[]>([]);
  const [buyEnabled, setBuyEnabled] = useState(false);
  const [attackEnabled, setAttackEnabled] = useState(false);
  const [credits, setCredits] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    const st = await fetchEventoShop(token);
    setLoading(false);
    if (!st?.ok) return;
    setUnits(st.shop?.units || []);
    setBuyEnabled(Boolean(st.buyEnabled));
    setAttackEnabled(Boolean(st.attackEnabled));
    setCredits(st.wallet?.credits || 0);
  }, [ready, token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function buy(unitId: string) {
    if (!token || busy || !buyEnabled) return;
    setBusy(true);
    const out = await buyEventoUnit(token, unitId, 1);
    setBusy(false);
    if (!out?.ok) {
      showToast(out?.message || "Acquisto fallito.", true);
      return;
    }
    showToast("Unità acquistata.");
    void reload();
  }

  async function attack(defend: boolean) {
    if (!token || busy || !attackEnabled) return;
    setBusy(true);
    const out = await attackEventoFaction(token, defend);
    setBusy(false);
    showToast(out?.message || (out?.ok ? "Ok" : "Fallito"), !out?.ok);
    void reload();
  }

  if (loading) return null;
  if (!token) {
    return (
      <div className="mx-auto mb-10 max-w-3xl px-6 text-center">
        <button type="button" onClick={login} className="text-sm text-[#c9a227] underline">
          Accedi per lo shop fazioni
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto mb-14 max-w-3xl px-6">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#f0e6c8]/70">Shop truppe</p>
          <p className="text-sm text-crema/70">{credits.toLocaleString("it-IT")} crediti</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!attackEnabled || busy}
            onClick={() => void attack(false)}
            className="rounded-full bg-[#8b1a1a] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            Attacca
          </button>
          <button
            type="button"
            disabled={!attackEnabled || busy}
            onClick={() => void attack(true)}
            className="rounded-full bg-[#2f6fed] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            Difendi
          </button>
        </div>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {units.map((u) => (
          <li key={u.id} className="flex items-center justify-between gap-2 rounded-xl bg-[#0b1220]/70 px-3 py-2 ring-1 ring-[#f0e6c8]/12">
            <div>
              <p className="text-sm font-semibold text-[#f0e6c8]">{u.label}</p>
              <p className="text-xs text-crema/55">
                T{u.tier} · pot {u.power} · {u.cost.toLocaleString("it-IT")}
              </p>
            </div>
            <button
              type="button"
              disabled={!buyEnabled || busy || credits < u.cost}
              onClick={() => void buy(u.id)}
              className="rounded-full bg-[#c9a227] px-3 py-1 text-xs font-semibold text-[#1a140c] disabled:opacity-40"
            >
              Compra
            </button>
          </li>
        ))}
      </ul>
      {!buyEnabled ? <p className="mt-2 text-xs text-crema/50">Acquisti in anteprima HS o quando economia ON.</p> : null}
    </div>
  );
}
