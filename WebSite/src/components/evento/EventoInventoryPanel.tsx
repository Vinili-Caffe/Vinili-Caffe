"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "motion/react";
import {
  fetchEventoStatus,
  openEventoCrate,
  useEventoItem,
  type EventoUtilityItemId,
  type EventoWallet,
} from "@/lib/evento-api";
import { ADVENT_CRATE_LABELS, type AdventCrateId } from "@/lib/evento-avvento";
import { useAuth } from "@/lib/auth";
import { showToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { useEventoFactionSync } from "@/lib/evento-faction-sync";
import { EventoBtn, EventoKicker, EventoPanel, EventoTitle } from "@/components/evento/EventoUi";
import {
  EventoCrateArt,
  EventoCrateOpenOverlay,
  type CrateLootPayload,
} from "@/components/evento/EventoCrateArt";
import { EventoUtilityIcon } from "@/components/evento/EventoUtilityIcon";

type TabId = "casse" | "oggetti";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "casse", label: "Casse" },
  { id: "oggetti", label: "Oggetti" },
];

/** Solo inventario personale — Bacta/Sconto vivono nella pagina Fazione. */
const PERSONAL_ITEM_IDS: EventoUtilityItemId[] = ["festival_ancestors", "riciclaggio_hutt"];

const FALLBACK_LABELS: Record<string, string> = {
  festival_ancestors: "Festival Ancestors",
  riciclaggio_hutt: "Riciclaggio degli Hutt",
};

const FALLBACK_BLURBS: Record<string, string> = {
  festival_ancestors: "Crediti ed exp doppi dai voti per 24 ore.",
  riciclaggio_hutt: "+10% crediti dai minigames per 24 ore.",
};

function utilityQty(items: Record<string, unknown> | undefined, id: string) {
  const v = items?.[id];
  return Math.max(0, Math.floor(Number(v) || 0));
}

function formatLeft(expiresAt?: string) {
  const exp = Date.parse(String(expiresAt || ""));
  if (!Number.isFinite(exp)) return "";
  const ms = exp - Date.now();
  if (ms <= 0) return "scaduto";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m`;
  return `${Math.max(1, m)}m`;
}

/** Inventario hub personale: solo Casse / Oggetti (niente arsenale né stock fazione). */
export function EventoInventoryPanel() {
  const { token, ready, login } = useAuth();
  const [tab, setTab] = useState<TabId>("casse");
  const [wallet, setWallet] = useState<EventoWallet | null>(null);
  const [crateLabels, setCrateLabels] = useState<Record<string, string>>({});
  const [utilityLabels, setUtilityLabels] = useState<Record<string, string>>({});
  const [utilityCatalog, setUtilityCatalog] = useState<
    Array<{ id: string; label: string; blurb: string; kind: string }>
  >([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [loot, setLoot] = useState<CrateLootPayload | null>(null);

  const reload = useCallback(async () => {
    if (!ready) return;
    const st = await fetchEventoStatus(token);
    if (!st?.ok) return;
    setWallet(st.wallet || null);
    setCrateLabels(st.crateLabels || {});
    setUtilityLabels(st.utilityLabels || {});
    setUtilityCatalog(Array.isArray(st.utilityItems) ? st.utilityItems : []);
  }, [ready, token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const softReload = useCallback(() => {
    if (loot) return; /* non disturbare l'overlay apertura cassa */
    void reload();
  }, [loot, reload]);

  useEventoFactionSync(softReload, { pollMs: 0 });

  const crateRows = useMemo(() => {
    const crates = wallet?.crates || {};
    return Object.entries(crates)
      .map(([id, qty]) => ({ id, qty: Math.max(0, Math.floor(Number(qty) || 0)) }))
      .filter((r) => r.qty > 0)
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [wallet]);

  const crateTotal = useMemo(() => crateRows.reduce((s, r) => s + r.qty, 0), [crateRows]);

  const itemRows = useMemo(() => {
    const fromCatalog = utilityCatalog
      .map((c) => c.id)
      .filter((id): id is EventoUtilityItemId => PERSONAL_ITEM_IDS.includes(id as EventoUtilityItemId));
    const ids = fromCatalog.length > 0 ? fromCatalog : PERSONAL_ITEM_IDS;
    return ids
      .map((id) => {
        const meta = utilityCatalog.find((c) => c.id === id);
        return {
          id,
          qty: utilityQty(wallet?.items, id),
          label: meta?.label || utilityLabels[id] || FALLBACK_LABELS[id] || id,
          blurb: meta?.blurb || FALLBACK_BLURBS[id] || "",
          buff: wallet?.buffs?.[id],
        };
      })
      .filter((r) => r.qty > 0 || r.buff?.active);
  }, [wallet, utilityCatalog, utilityLabels]);

  const counts: Record<TabId, number> = {
    casse: crateTotal,
    oggetti: itemRows.reduce((s, r) => s + r.qty, 0),
  };

  async function openOne(crateId: string) {
    if (!token || busy || loot) return;
    setBusy(crateId);
    const out = await openEventoCrate(token, crateId);
    setBusy(null);
    if (!out?.ok) {
      showToast(out?.message || "Apertura fallita.", true);
      return;
    }
    const name = crateLabels[crateId] || ADVENT_CRATE_LABELS[crateId as AdventCrateId] || crateId;
    setLoot({
      crateId,
      label: name,
      credits: out.loot?.credits || 0,
      exp: out.loot?.exp || 0,
      items: out.loot?.items || null,
      itemLabels: utilityLabels,
      troops: out.loot?.troops || null,
      troopLabels: out.loot?.troopLabels || null,
      note: out.loot?.note,
      factionId: out.wallet?.factionId || wallet?.factionId || null,
    });
    if (out.wallet) setWallet(out.wallet);
    else void reload();
  }

  async function useOne(itemId: string) {
    if (!token || busy) return;
    setBusy(itemId);
    const out = await useEventoItem(token, itemId);
    setBusy(null);
    if (!out?.ok) {
      showToast(out?.message || "Uso fallito.", true);
      return;
    }
    showToast(out.message || "Oggetto usato.");
    if (out.wallet) setWallet(out.wallet);
    else void reload();
  }

  if (!token) {
    return (
      <div className="mx-auto mb-8 max-w-4xl px-6 text-center">
        <button
          type="button"
          onClick={login}
          className="text-sm text-cyan-300 underline underline-offset-2 hover:text-cyan-100"
        >
          Accedi per vedere l&apos;inventario
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto mb-10 max-w-4xl px-6">
      <EventoPanel glow="gold">
        <div className="relative mb-5 text-center">
          <EventoKicker>Deposito · personale</EventoKicker>
          <EventoTitle className="text-center text-2xl uppercase tracking-[0.22em] sm:text-3xl">Inventario</EventoTitle>
          <p className="mt-2 text-sm text-crema/50">
            Arsenale e rifornimenti fazione sono nella pagina Fazione.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Sezioni inventario"
          className="mb-5 grid grid-cols-2 gap-1 rounded-2xl bg-black/40 p-1 ring-1 ring-cyan-300/20"
        >
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={cn(
                  "rounded-xl px-2 py-2.5 text-center text-sm font-semibold transition",
                  active
                    ? "bg-cyan-400/15 text-cyan-100 ring-1 ring-cyan-300/35 shadow-[0_0_18px_-6px_rgba(56,189,248,0.45)]"
                    : "text-crema/65 hover:bg-cyan-400/8 hover:text-crema",
                )}
              >
                <span className="block truncate">{t.label}</span>
                <span
                  className={cn(
                    "mt-0.5 block font-sans text-[0.7rem] tabular-nums tracking-tight",
                    active ? "text-cyan-100/70" : "text-crema/40",
                  )}
                >
                  {counts[t.id]}
                </span>
              </button>
            );
          })}
        </div>

        {tab === "casse" ? (
          crateRows.length ? (
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {crateRows.map((r) => {
                const name = crateLabels[r.id] || ADVENT_CRATE_LABELS[r.id as AdventCrateId] || r.id;
                const loading = busy === r.id;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      disabled={Boolean(busy) || Boolean(loot)}
                      onClick={() => void openOne(r.id)}
                      className="group flex w-full flex-col items-center overflow-visible rounded-2xl bg-black/40 px-2 pb-3 pt-4 ring-1 ring-cyan-300/15 transition hover:bg-black/55 hover:ring-cyan-300/35 disabled:opacity-60"
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
                      <p className="mt-1 font-sans text-lg font-bold tabular-nums tracking-tight text-[#e4c76b]">
                        ×{r.qty}
                      </p>
                      <p className="mt-0.5 text-[0.65rem] uppercase tracking-wider text-crema/40">
                        {loading ? "Apertura…" : "Apri"}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-center text-sm text-crema/55">Nessuna cassa nell&apos;inventario.</p>
          )
        ) : null}

        {tab === "oggetti" ? (
          itemRows.length ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              {itemRows.map((r) => {
                const loading = busy === r.id;
                const buffOn = Boolean(r.buff?.active);
                return (
                  <li key={r.id} className="rounded-2xl bg-black/40 p-4 ring-1 ring-cyan-300/15">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <EventoUtilityIcon itemId={r.id} size="md" alt={r.label} className="shrink-0" />
                        <div className="min-w-0">
                          <p className="font-semibold text-crema">{r.label}</p>
                          <p className="mt-1 text-xs text-crema/55">{r.blurb}</p>
                          {buffOn ? (
                            <p className="mt-2 text-xs font-semibold text-[#86efac]">
                              Attivo · {formatLeft(r.buff?.expiresAt)}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <p className="shrink-0 font-sans text-xl font-bold tabular-nums tracking-tight text-[#e4c76b]">
                        ×{r.qty}
                      </p>
                    </div>
                    <EventoBtn
                      className="mt-3 w-full"
                      disabled={r.qty < 1 || Boolean(busy) || buffOn}
                      onClick={() => void useOne(r.id)}
                    >
                      {loading ? "…" : buffOn ? "Già attivo" : "Usa"}
                    </EventoBtn>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-center text-sm text-crema/55">
              Nessun oggetto personale. Bacta e sconti sono nella pagina Fazione.
            </p>
          )
        ) : null}
      </EventoPanel>

      <AnimatePresence>
        {loot ? <EventoCrateOpenOverlay loot={loot} onClose={() => setLoot(null)} /> : null}
      </AnimatePresence>
    </div>
  );
}
