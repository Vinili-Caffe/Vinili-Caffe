"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence } from "motion/react";
import { attackEventoFaction, buyEventoUnit, fetchEventoShop } from "@/lib/evento-api";
import { useAuth } from "@/lib/auth";
import { showToast } from "@/components/ui/toast";
import { EventoBtn, EventoKicker, EventoPanel } from "@/components/evento/EventoUi";
import { EventoBattleFx, type BattleFxData } from "@/components/evento/EventoBattleFx";

type Unit = { id: string; label: string; cost: number; power: number; tier: number };

export function EventoShopPanel() {
  const { token, ready, login } = useAuth();
  const [units, setUnits] = useState<Unit[]>([]);
  const [buyEnabled, setBuyEnabled] = useState(false);
  const [attackEnabled, setAttackEnabled] = useState(false);
  const [credits, setCredits] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [battle, setBattle] = useState<BattleFxData | null>(null);

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
    showToast("Unita acquistata.");
    void reload();
  }

  async function attack(defend: boolean) {
    if (!token || busy || !attackEnabled) return;
    setBusy(true);
    const out = await attackEventoFaction(token, defend);
    setBusy(false);
    setBattle({
      defend,
      ok: Boolean(out?.ok),
      message: out?.message,
      winner: out?.winner,
      attackPower: out?.attackPower,
      defendPower: out?.defendPower,
    });
    void reload();
  }

  if (loading) return null;
  if (!token) {
    return (
      <div className="mx-auto mb-10 max-w-4xl px-6 text-center">
        <button type="button" onClick={login} className="text-sm text-caramel underline underline-offset-2">
          Accedi per lo shop fazioni
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto mb-12 max-w-4xl px-6">
      <EventoPanel glow="gold">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <EventoKicker>Arsenale fazioni</EventoKicker>
            <p className="mt-1 font-display text-2xl text-crema">
              {credits.toLocaleString("it-IT")}{" "}
              <span className="text-base text-crema/55">crediti</span>
            </p>
          </div>
          <div className="flex gap-2">
            <EventoBtn variant="danger" disabled={!attackEnabled || busy} onClick={() => void attack(false)}>
              Attacca
            </EventoBtn>
            <EventoBtn variant="blue" disabled={!attackEnabled || busy} onClick={() => void attack(true)}>
              Difendi
            </EventoBtn>
          </div>
        </div>

        <ul className="grid gap-2.5 sm:grid-cols-2">
          {units.map((u) => (
            <li
              key={u.id}
              className="flex items-center justify-between gap-3 rounded-xl bg-black/35 px-3.5 py-3 ring-1 ring-sand/15"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-crema">{u.label}</p>
                <p className="text-xs text-crema/45">
                  Tier {u.tier} · potenza {u.power} · {u.cost.toLocaleString("it-IT")} cr
                </p>
              </div>
              <EventoBtn
                className="!px-3 !py-1.5 !text-xs"
                disabled={!buyEnabled || busy || credits < u.cost}
                onClick={() => void buy(u.id)}
              >
                Compra
              </EventoBtn>
            </li>
          ))}
        </ul>
        {!buyEnabled ? (
          <p className="mt-3 text-xs text-crema/45">Acquisti in anteprima HS o quando l&apos;economia e attiva.</p>
        ) : null}
      </EventoPanel>

      <AnimatePresence>
        {battle ? <EventoBattleFx data={battle} onClose={() => setBattle(null)} /> : null}
      </AnimatePresence>
    </div>
  );
}
