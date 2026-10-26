"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchEventoGara, pickEventoGara } from "@/lib/evento-api";
import { useAuth } from "@/lib/auth";
import { showToast } from "@/components/ui/toast";

export function GaraGame() {
  const { token, ready, login } = useAuth();
  const [loading, setLoading] = useState(true);
  const [pods, setPods] = useState<Array<{ id: string; label: string }>>([]);
  const [pick, setPick] = useState<string | null>(null);
  const [result, setResult] = useState<{ place: number; won: boolean } | null>(null);
  const [canPick, setCanPick] = useState(false);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    const st = await fetchEventoGara(token);
    setLoading(false);
    if (!st?.ok) {
      showToast(st?.message || "Gara non disponibile.", true);
      return;
    }
    setPods(st.pods || []);
    setPick(st.pick || null);
    setResult(st.result || null);
    setCanPick(Boolean(st.canPick));
  }, [ready, token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function choose(podId: string) {
    if (!token || busy || !canPick) return;
    setBusy(true);
    const out = await pickEventoGara(token, podId);
    setBusy(false);
    if (!out?.ok) {
      showToast(out?.message || "Scelta non riuscita.", true);
      return;
    }
    setPick(podId);
    setResult(out.result || null);
    setCanPick(false);
    showToast(out.result?.won ? "Hai vinto la gara!" : `Arrivo ${out.result?.place}°`);
  }

  if (loading) {
    return <div className="mx-auto h-40 max-w-lg animate-pulse rounded-2xl bg-crema/8" aria-busy="true" />;
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-lg px-6 pb-16 text-center">
        <p className="mb-4 text-sm text-crema/70">Accedi per scegliere lo sguscio.</p>
        <button type="button" onClick={login} className="rounded-full bg-[#5865f2] px-5 py-2.5 text-sm font-semibold text-white">
          Accedi
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-6 pb-20">
      {result ? (
        <div className="mb-6 rounded-2xl bg-[#0b1220]/80 px-4 py-3 text-center ring-1 ring-[#f0e6c8]/15">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#f0e6c8]/70">Esito slot</p>
          <p className="mt-1 font-display text-2xl text-[#f0e6c8]">
            {result.won ? "Vittoria" : `${result.place}° posto`}
          </p>
          {pick ? <p className="mt-1 text-sm text-crema/65">Sguscio: {pods.find((p) => p.id === pick)?.label || pick}</p> : null}
        </div>
      ) : null}
      <div className="grid gap-2">
        {pods.map((p) => (
          <button
            key={p.id}
            type="button"
            disabled={!canPick || busy}
            onClick={() => void choose(p.id)}
            className="rounded-xl bg-gradient-to-r from-[#1a140c] to-[#0b1220] px-4 py-3 text-left text-sm font-semibold text-[#f0e6c8] ring-1 ring-[#f0e6c8]/15 transition hover:ring-[#c9a227]/50 disabled:opacity-40"
          >
            {p.label}
          </button>
        ))}
      </div>
      {!canPick && !result ? (
        <p className="mt-4 text-center text-sm text-crema/60">Gara non selezionabile in questo slot.</p>
      ) : null}
    </div>
  );
}
