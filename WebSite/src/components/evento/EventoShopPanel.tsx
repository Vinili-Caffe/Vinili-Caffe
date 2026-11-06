"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence } from "motion/react";
import { attackEventoFaction, buyEventoUnit, fetchEventoShop } from "@/lib/evento-api";
import { useAuth } from "@/lib/auth";
import { showToast } from "@/components/ui/toast";
import { EventoBtn, EventoKicker, EventoPanel } from "@/components/evento/EventoUi";
import { EventoBattleFx, type BattleFxData } from "@/components/evento/EventoBattleFx";
import { EventoCreditsIcon } from "@/components/evento/EventoCreditsIcon";
import { EventoTroopIcon } from "@/components/evento/EventoTroopIcon";
import { cn } from "@/lib/cn";

type Unit = { id: string; label: string; cost: number; power: number; tier: number };

/** Shop + attacco/difesa: gated dal rango fazione (permessi buy/war). */
export function EventoShopPanel({
  embedded = false,
  className,
}: {
  embedded?: boolean;
  className?: string;
}) {
  const { token, ready, login } = useAuth();
  const [units, setUnits] = useState<Unit[]>([]);
  const [buyEnabled, setBuyEnabled] = useState(false);
  const [attackEnabled, setAttackEnabled] = useState(false);
  const [canBuyTroops, setCanBuyTroops] = useState(false);
  const [canWar, setCanWar] = useState(false);
  const [credits, setCredits] = useState(0);
  const [bactaQty, setBactaQty] = useState(0);
  const [useBacta, setUseBacta] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [battle, setBattle] = useState<BattleFxData | null>(null);

  const reload = useCallback(async (opts?: { soft?: boolean }) => {
    if (!ready) return;
    if (!opts?.soft) setLoading(true);
    const st = await fetchEventoShop(token);
    if (!opts?.soft) setLoading(false);
    if (!st?.ok) return;
    setUnits(st.shop?.units || []);
    setBuyEnabled(Boolean(st.buyEnabled));
    setAttackEnabled(Boolean(st.attackEnabled));
    setCanBuyTroops(Boolean((st as { canBuyTroops?: boolean }).canBuyTroops ?? st.buyEnabled));
    setCanWar(Boolean((st as { canWar?: boolean }).canWar ?? st.attackEnabled));
    setCredits(st.wallet?.credits || 0);
    const bQty = Math.max(0, Math.floor(Number(st.wallet?.items?.bacta) || 0));
    setBactaQty(bQty);
    if (bQty < 1) setUseBacta(false);
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
    void reload({ soft: true });
  }

  async function attack(defend: boolean) {
    if (!token || busy || !attackEnabled) return;
    setBusy(true);
    const out = await attackEventoFaction(token, defend, !defend && useBacta);
    setBusy(false);
    if (!out?.ok) {
      showToast(out?.message || "Azione non riuscita.", true);
      return;
    }
    if (out.bactaUsed) setUseBacta(false);
    if (out.pending) {
      showToast(out.message || (defend ? "Difesa dichiarata." : "Attacco dichiarato: in attesa."));
      void reload({ soft: true });
      return;
    }
    setBattle({
      defend,
      ok: true,
      message: out?.message,
      winner: out?.winner,
      attackPower: out?.attackPower,
      defendPower: out?.defendPower,
    });
    void reload({ soft: true });
  }

  if (loading && !battle) {
    return embedded ? <div className="h-40 animate-pulse rounded-3xl bg-crema/8" /> : null;
  }
  if (!token) {
    if (embedded) return null;
    return (
      <div className="mx-auto mb-10 max-w-4xl px-6 text-center">
        <button type="button" onClick={login} className="text-sm text-caramel underline underline-offset-2">
          Accedi per lo shop fazioni
        </button>
      </div>
    );
  }

  const showShop = canBuyTroops;
  const showWar = canWar;

  if (!showShop && !showWar) {
    return (
      <div className={cn(embedded ? "" : "mx-auto mb-12 max-w-4xl px-6", className)}>
        <EventoPanel glow="none">
          <EventoKicker>Comando militare</EventoKicker>
          <p className="mt-2 text-sm text-crema/60">
            Il tuo rango non può acquistare truppe né dichiarare guerra. Chiedi una promozione al rango massimo della
            fazione.
          </p>
        </EventoPanel>
      </div>
    );
  }

  return (
    <div className={cn(embedded ? "" : "mx-auto mb-12 max-w-4xl px-6", className)}>
      <EventoPanel glow="gold">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <EventoKicker>Comando militare</EventoKicker>
            <p className="mt-1 flex items-center gap-2 font-sans text-2xl font-semibold tracking-tight text-crema">
              <EventoCreditsIcon size="md" className="shrink-0" />
              <span className="tabular-nums">{credits.toLocaleString("it-IT")}</span>
              <span className="text-base text-crema/55">crediti personali</span>
            </p>
          </div>
          {showWar ? (
            <div className="flex flex-col items-end gap-2">
              {bactaQty > 0 ? (
                <label className="flex cursor-pointer items-center gap-2 text-xs text-crema/70">
                  <input
                    type="checkbox"
                    checked={useBacta}
                    disabled={busy || !attackEnabled}
                    onChange={(e) => setUseBacta(e.target.checked)}
                    className="size-3.5 accent-caramel"
                  />
                  Usa Bacta in attacco (×{bactaQty})
                </label>
              ) : null}
              <div className="flex gap-2">
                <EventoBtn variant="danger" disabled={!attackEnabled || busy} onClick={() => void attack(false)}>
                  Attacca
                </EventoBtn>
                <EventoBtn variant="blue" disabled={!attackEnabled || busy} onClick={() => void attack(true)}>
                  Difendi
                </EventoBtn>
              </div>
            </div>
          ) : (
            <p className="max-w-xs text-right text-xs text-crema/45">
              Attacco/difesa riservati ai ranghi superiori.
            </p>
          )}
        </div>

        {showShop ? (
          <>
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {units.map((u) => (
                <li
                  key={u.id}
                  className="flex items-center justify-between gap-3 rounded-xl bg-black/35 px-3.5 py-3 ring-1 ring-sand/15"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <EventoTroopIcon unitId={u.id} size="sm" alt={u.label} className="shrink-0" />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-crema">{u.label}</p>
                      <p className="flex flex-wrap items-center gap-1 text-xs text-crema/45">
                        <span>
                          Tier {u.tier} · potenza {u.power} ·
                        </span>
                        <EventoCreditsIcon size="xs" className="opacity-90" />
                        <span className="tabular-nums">{u.cost.toLocaleString("it-IT")}</span>
                      </p>
                    </div>
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
              <p className="mt-3 text-xs text-crema/45">Acquisti disponibili quando l&apos;economia è attiva.</p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-crema/55">Il tuo rango non può acquistare truppe.</p>
        )}
      </EventoPanel>

      <AnimatePresence>
        {battle ? <EventoBattleFx data={battle} onClose={() => setBattle(null)} /> : null}
      </AnimatePresence>
    </div>
  );
}
