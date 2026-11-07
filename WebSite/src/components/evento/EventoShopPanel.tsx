"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "motion/react";
import { attackEventoFaction, buyEventoUnit, fetchEventoShop } from "@/lib/evento-api";
import { notifyEventoFactionSync, useEventoFactionSync } from "@/lib/evento-faction-sync";
import { useAuth } from "@/lib/auth";
import { showToast } from "@/components/ui/toast";
import { EventoBtn, EventoKicker, EventoPanel } from "@/components/evento/EventoUi";
import { EventoBattleFx, type BattleFxData } from "@/components/evento/EventoBattleFx";
import { EventoCreditsIcon } from "@/components/evento/EventoCreditsIcon";
import { EventoTroopIcon } from "@/components/evento/EventoTroopIcon";
import {
  EventoWarDeployModal,
  type WarDeployUnit,
} from "@/components/evento/EventoWarDeployModal";
import { cn } from "@/lib/cn";

type Unit = { id: string; label: string; cost: number; power: number; tier: number };

/** Shop + attacco/difesa: gated dal rango fazione (permessi buy/war). */
export function EventoShopPanel({
  embedded = false,
  className,
  refreshKey = 0,
}: {
  embedded?: boolean;
  className?: string;
  /** Incrementa dopo promote/demote per ricalcolare i permessi subito. */
  refreshKey?: number;
}) {
  const { token, ready, login } = useAuth();
  const [units, setUnits] = useState<Unit[]>([]);
  const [army, setArmy] = useState<Record<string, number>>({});
  const [buyEnabled, setBuyEnabled] = useState(false);
  const [attackEnabled, setAttackEnabled] = useState(false);
  const [canBuyTroops, setCanBuyTroops] = useState(false);
  const [canWar, setCanWar] = useState(false);
  const [credits, setCredits] = useState(0);
  const [bactaQty, setBactaQty] = useState(0);
  const [factionId, setFactionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [battle, setBattle] = useState<BattleFxData | null>(null);
  const [warMode, setWarMode] = useState<"attack" | "defend" | null>(null);

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
    /* Shop paga dalla banca fazione, non dai crediti personali. */
    setCredits(Math.max(0, Math.floor(Number(st.bankCredits) || 0)));
    const armyMap =
      st.wallet?.army && typeof st.wallet.army === "object" ? { ...st.wallet.army } : {};
    setArmy(armyMap);
    const bQty = Math.max(0, Math.floor(Number(st.wallet?.items?.bacta) || 0));
    setBactaQty(bQty);
    setFactionId(st.wallet?.factionId || null);
  }, [ready, token]);

  const softReload = useCallback(() => {
    void reload({ soft: true });
  }, [reload]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (refreshKey > 0) softReload();
  }, [refreshKey, softReload]);

  /* Promote/demote (anche da altro tab) + poll: shop appare/scompare col rango. */
  /* Live economy + backup lento per caveau/guerre non riflesse nel solo wallet. */
  useEventoFactionSync(softReload, { pollMs: 8_000 });

  const deployUnits: WarDeployUnit[] = useMemo(() => {
    const byId = new Map(units.map((u) => [u.id, u]));
    const rows: WarDeployUnit[] = [];
    for (const [id, raw] of Object.entries(army || {})) {
      const available = Math.max(0, Math.floor(Number(raw) || 0));
      if (available < 1) continue;
      const cat = byId.get(id);
      rows.push({
        id,
        label: cat?.label || id,
        power: Math.max(0, Math.floor(Number(cat?.power) || 0)),
        available,
      });
    }
    rows.sort((a, b) => b.power - a.power || a.label.localeCompare(b.label, "it"));
    return rows;
  }, [army, units]);

  async function buy(unitId: string) {
    if (!token || busy || !buyEnabled) return;
    setBusy(true);
    const out = await buyEventoUnit(token, unitId, 1);
    setBusy(false);
    if (!out?.ok) {
      showToast(out?.message || "Acquisto fallito.", true);
      return;
    }
    showToast("Unità acquistata dalla banca fazione.");
    void reload({ soft: true });
    notifyEventoFactionSync("shop_buy");
  }

  function openWar(mode: "attack" | "defend") {
    if (!token || busy || !attackEnabled) return;
    if (!deployUnits.length) {
      showToast("Hangar vuoto: non ci sono truppe da schierare.", true);
      return;
    }
    setWarMode(mode);
  }

  async function confirmWar(payload: { deploy: Record<string, number>; useBacta: boolean }) {
    if (!token || busy || !warMode) return;
    const defend = warMode === "defend";
    setBusy(true);
    const out = await attackEventoFaction(token, {
      defend,
      useBacta: !defend && payload.useBacta,
      deploy: payload.deploy,
    });
    setBusy(false);
    if (!out?.ok) {
      showToast(out?.message || "Azione non riuscita.", true);
      return;
    }
    setWarMode(null);
    const healed =
      out.bactaUsed && out.bactaHealed && typeof out.bactaHealed === "object" ? out.bactaHealed : null;
    const healedN = healed
      ? Object.values(healed).reduce((a, n) => a + Math.max(0, Math.floor(Number(n) || 0)), 0)
      : 0;
    const bactaBit =
      out.bactaUsed && healedN > 0
        ? ` Bacta: +${healedN.toLocaleString("it-IT")} truppe recuperate.`
        : out.bactaUsed
          ? " Bacta iniettato."
          : "";
    if (out.pending) {
      showToast(
        `${out.message || (defend ? "Difesa dichiarata." : "Attacco dichiarato: in attesa.")}${bactaBit}`,
      );
      void reload({ soft: true });
      notifyEventoFactionSync(out.bactaUsed ? "war_bacta" : "war_pending");
      return;
    }
    setBattle({
      defend,
      ok: true,
      message: out?.message,
      winner: out?.winner,
      attackPower: out?.attackPower ?? out?.deployPower,
      defendPower: out?.defendPower,
    });
    if (bactaBit) showToast(bactaBit.trim());
    void reload({ soft: true });
    notifyEventoFactionSync(out.bactaUsed ? "war_bacta" : "war_resolved");
  }

  if (loading && !battle) {
    return embedded ? <div className="h-40 animate-pulse rounded-3xl bg-crema/8" /> : null;
  }
  if (!token) {
    if (embedded) return null;
    return (
      <div className="mx-auto mb-10 max-w-4xl px-6 text-center">
        <button
          type="button"
          onClick={login}
          className="text-sm text-cyan-300 underline underline-offset-2 hover:text-cyan-100"
        >
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
              <span className="text-base text-crema/55">crediti banca fazione</span>
            </p>
          </div>
          {showWar ? (
            <div className="flex flex-col items-end gap-2">
              <p className="text-xs text-crema/50">
                Hangar · {deployUnits.reduce((a, u) => a + u.available, 0).toLocaleString("it-IT")} unità
                {bactaQty > 0 ? ` · Bacta ×${bactaQty}` : ""}
              </p>
              <div className="flex gap-2">
                <EventoBtn variant="danger" disabled={!attackEnabled || busy} onClick={() => openWar("attack")}>
                  Attacca
                </EventoBtn>
                <EventoBtn variant="blue" disabled={!attackEnabled || busy} onClick={() => openWar("defend")}>
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
                  className="flex items-center justify-between gap-3 rounded-xl bg-black/40 px-3.5 py-3 ring-1 ring-cyan-300/15"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <EventoTroopIcon
                      unitId={u.id}
                      factionId={factionId}
                      size="sm"
                      alt={u.label}
                      className="shrink-0"
                    />
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
        {warMode ? (
          <EventoWarDeployModal
            mode={warMode}
            units={deployUnits}
            bactaQty={bactaQty}
            factionId={factionId}
            busy={busy}
            onClose={() => {
              if (!busy) setWarMode(null);
            }}
            onConfirm={(payload) => void confirmWar(payload)}
          />
        ) : null}
        {battle ? <EventoBattleFx data={battle} onClose={() => setBattle(null)} /> : null}
      </AnimatePresence>
    </div>
  );
}
