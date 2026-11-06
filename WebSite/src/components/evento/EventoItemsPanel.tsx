"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchEventoStatus,
  useEventoItem,
  type EventoUtilityItemId,
  type EventoWallet,
} from "@/lib/evento-api";
import { useAuth } from "@/lib/auth";
import { showToast } from "@/components/ui/toast";
import { useEventoFactionSync } from "@/lib/evento-faction-sync";
import { EventoKicker, EventoPanel } from "@/components/evento/EventoUi";
import { EventoUtilityIcon } from "@/components/evento/EventoUtilityIcon";

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

/** Inventario utility personale (Festival / Hutt). Bacta e sconto → pagina Fazione. */
export function EventoItemsPanel() {
  const { token, ready, login } = useAuth();
  const [wallet, setWallet] = useState<EventoWallet | null>(null);
  const [catalog, setCatalog] = useState<Array<{ id: string; label: string; blurb: string; kind: string }>>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!ready) return;
    const st = await fetchEventoStatus(token);
    if (st?.ok) {
      setWallet(st.wallet || null);
      setCatalog(Array.isArray(st.utilityItems) ? st.utilityItems : []);
      setLabels(st.utilityLabels || {});
    }
  }, [ready, token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEventoFactionSync(reload, { pollMs: 0 });

  const rows = useMemo(() => {
    const fromCatalog = catalog
      .map((c) => c.id)
      .filter((id): id is EventoUtilityItemId => PERSONAL_ITEM_IDS.includes(id as EventoUtilityItemId));
    const ids = fromCatalog.length > 0 ? fromCatalog : PERSONAL_ITEM_IDS;
    return ids
      .map((id) => {
        const meta = catalog.find((c) => c.id === id);
        return {
          id,
          qty: utilityQty(wallet?.items, id),
          label: meta?.label || labels[id] || FALLBACK_LABELS[id] || id,
          blurb: meta?.blurb || FALLBACK_BLURBS[id] || "",
          buff: wallet?.buffs?.[id],
        };
      })
      .filter((r) => r.qty > 0 || r.buff?.active);
  }, [wallet, catalog, labels]);

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
          Accedi per usare gli oggetti
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto mb-10 max-w-4xl px-6">
      <EventoPanel glow="gold">
        <div className="mb-5 text-center sm:text-left">
          <EventoKicker>Inventario oggetti</EventoKicker>
          <p className="mt-1 text-sm text-crema/60">
            {rows.length
              ? "Buff personali 24h dalle casse. Bacta e sconti sono nella pagina Fazione."
              : "Nessun oggetto personale. Aprono dalle casse."}
          </p>
        </div>
        {rows.length ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {rows.map((r) => {
              const loading = busy === r.id;
              const buffOn = Boolean(r.buff?.active);
              return (
                <li
                  key={r.id}
                  className="rounded-2xl bg-black/40 p-4 ring-1 ring-sand/15"
                >
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
                    disabled={r.qty < 1 || Boolean(busy) || buffOn}
                    onClick={() => void useOne(r.id)}
                    className="mt-3 w-full rounded-full bg-gradient-to-r from-caramel to-ember py-2 text-sm font-semibold text-ink disabled:opacity-40"
                  >
                    {loading ? "…" : buffOn ? "Già attivo" : "Usa"}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </EventoPanel>
    </div>
  );
}
