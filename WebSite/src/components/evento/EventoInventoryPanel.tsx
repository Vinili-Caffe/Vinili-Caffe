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
import { EventoPanel } from "@/components/evento/EventoUi";
import {
  EventoCrateArt,
  EventoCrateOpenOverlay,
  type CrateLootPayload,
} from "@/components/evento/EventoCrateArt";
import { EventoUtilityIcon } from "@/components/evento/EventoUtilityIcon";
import { EventoTroopIcon } from "@/components/evento/EventoTroopIcon";

type TabId = "casse" | "arsenale" | "oggetti";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "casse", label: "Casse" },
  { id: "arsenale", label: "Arsenale" },
  { id: "oggetti", label: "Oggetti" },
];

const FALLBACK_LABELS: Record<string, string> = {
  bacta: "Bacta",
  festival_ancestors: "Festival Ancestors",
  riciclaggio_hutt: "Riciclaggio degli Hutt",
  sconto_mercato_nero: "Sconto mercato nero",
};

const FALLBACK_BLURBS: Record<string, string> = {
  bacta: "Cura il 5% dell'esercito personale (solo truppe).",
  festival_ancestors: "Crediti ed exp doppi dai voti per 24 ore.",
  riciclaggio_hutt: "+10% crediti dai minigames per 24 ore.",
  sconto_mercato_nero: "Shop al −20% per 24 ore.",
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

/** Inventario unico hub: switch Casse / Arsenale / Oggetti. */
export function EventoInventoryPanel() {
  const { token, ready, login } = useAuth();
  const [tab, setTab] = useState<TabId>("casse");
  const [wallet, setWallet] = useState<EventoWallet | null>(null);
  const [crateLabels, setCrateLabels] = useState<Record<string, string>>({});
  const [unitLabels, setUnitLabels] = useState<Record<string, string>>({});
  const [utilityLabels, setUtilityLabels] = useState<Record<string, string>>({});
  const [utilityCatalog, setUtilityCatalog] = useState<
    Array<{ id: string; label: string; blurb: string; kind: string }>
  >([]);
  const [armyPower, setArmyPower] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [loot, setLoot] = useState<CrateLootPayload | null>(null);

  const reload = useCallback(async () => {
    if (!ready) return;
    const st = await fetchEventoStatus(token);
    if (!st?.ok) return;
    setWallet(st.wallet || null);
    setCrateLabels(st.crateLabels || {});
    setUnitLabels(st.unitLabels || {});
    setUtilityLabels(st.utilityLabels || {});
    setUtilityCatalog(Array.isArray(st.utilityItems) ? st.utilityItems : []);
    setArmyPower(Math.max(0, Math.floor(Number(st.armyPower) || 0)));
  }, [ready, token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const crateRows = useMemo(() => {
    const crates = wallet?.crates || {};
    return Object.entries(crates)
      .map(([id, qty]) => ({ id, qty: Math.max(0, Math.floor(Number(qty) || 0)) }))
      .filter((r) => r.qty > 0)
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [wallet]);

  const crateTotal = useMemo(() => crateRows.reduce((s, r) => s + r.qty, 0), [crateRows]);

  const armyRows = useMemo(() => {
    const army = wallet?.army || {};
    const pending = wallet?.pendingTroops || {};
    const isTierKey = (id: string) => /^tier\s*[1-4]$/i.test(String(id || "").trim());
    const ids = new Set([...Object.keys(army), ...Object.keys(pending)]);
    return [...ids]
      .filter((id) => !isTierKey(id))
      .map((id) => ({
        id,
        qty: Math.max(0, Math.floor(Number(army[id]) || 0)),
        pending: Math.max(0, Math.floor(Number(pending[id]) || 0)),
        label: unitLabels[id] || id.replace(/_/g, " "),
      }))
      .filter((r) => r.qty > 0 || r.pending > 0)
      .sort((a, b) => a.label.localeCompare(b.label, "it"));
  }, [wallet, unitLabels]);

  const armyTotal = useMemo(() => armyRows.reduce((s, r) => s + r.qty, 0), [armyRows]);

  const itemRows = useMemo(() => {
    const ids =
      utilityCatalog.length > 0
        ? utilityCatalog.map((c) => c.id)
        : (Object.keys(FALLBACK_LABELS) as EventoUtilityItemId[]);
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
    arsenale: armyTotal,
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
      note: out.loot?.note,
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
        <button type="button" onClick={login} className="text-sm text-caramel underline underline-offset-2">
          Accedi per vedere l&apos;inventario
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto mb-10 max-w-4xl px-6">
      <EventoPanel glow="gold">
        <div className="relative mb-5 text-center">
          <h2 className="font-display text-2xl font-semibold uppercase tracking-[0.22em] text-caramel sm:text-3xl">
            Inventario
          </h2>
          {tab === "arsenale" && armyRows.length ? (
            <p className="mt-2 inline-flex rounded-full bg-sky-500/15 px-3 py-1 text-sm font-semibold tabular-nums text-sky-200 ring-1 ring-sky-400/30">
              potenza {armyPower.toLocaleString("it-IT")}
            </p>
          ) : null}
        </div>

        <div
          role="tablist"
          aria-label="Sezioni inventario"
          className="mb-5 grid grid-cols-3 gap-1 rounded-2xl bg-black/40 p-1 ring-1 ring-white/10"
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
                    ? "bg-gradient-to-r from-caramel to-ember text-ink shadow-sm"
                    : "text-crema/65 hover:bg-crema/8 hover:text-crema",
                )}
              >
                <span className="block truncate">{t.label}</span>
                <span
                  className={cn(
                    "mt-0.5 block font-sans text-[0.7rem] tabular-nums tracking-tight",
                    active ? "text-ink/70" : "text-crema/40",
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
                      className="group flex w-full flex-col items-center overflow-visible rounded-2xl bg-black/40 px-2 pb-3 pt-4 ring-1 ring-sand/15 transition hover:bg-black/55 hover:ring-[#c9a227]/35 disabled:opacity-60"
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
          ) : null
        ) : null}

        {tab === "arsenale" ? (
          armyRows.length ? (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {armyRows.map((r) => (
                <li key={r.id} className="rounded-2xl bg-black/40 px-3 py-3 ring-1 ring-sand/15">
                  <div className="flex items-start gap-2.5">
                    <EventoTroopIcon unitId={r.id} size="sm" alt={r.label} className="shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-xs font-semibold text-crema">{r.label}</p>
                      <p className="mt-2 font-sans text-2xl font-bold tabular-nums tracking-tight text-[#e4c76b]">
                        ×{r.qty}
                      </p>
                      {r.pending > 0 ? (
                        <p className="mt-1 text-[0.65rem] uppercase tracking-wider text-crema/40">
                          +{r.pending} in arrivo
                        </p>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : null
        ) : null}

        {tab === "oggetti" ? (
          itemRows.length ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              {itemRows.map((r) => {
                const loading = busy === r.id;
                const buffOn = Boolean(r.buff?.active);
                return (
                  <li key={r.id} className="rounded-2xl bg-black/40 p-4 ring-1 ring-sand/15">
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
                    <button
                      type="button"
                      disabled={r.qty < 1 || Boolean(busy) || (buffOn && r.id !== "bacta")}
                      onClick={() => void useOne(r.id)}
                      className="mt-3 w-full rounded-full bg-gradient-to-r from-caramel to-ember py-2 text-sm font-semibold text-ink disabled:opacity-40"
                    >
                      {loading ? "…" : buffOn && r.id !== "bacta" ? "Già attivo" : "Usa"}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null
        ) : null}
      </EventoPanel>

      <AnimatePresence>
        {loot ? <EventoCrateOpenOverlay loot={loot} onClose={() => setLoot(null)} /> : null}
      </AnimatePresence>
    </div>
  );
}
