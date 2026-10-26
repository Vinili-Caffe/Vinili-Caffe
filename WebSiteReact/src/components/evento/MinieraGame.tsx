"use client";

import { useCallback, useEffect, useState } from "react";
import { digEventoMiniera, fetchEventoMiniera } from "@/lib/evento-api";
import { useAuth } from "@/lib/auth";
import { showToast } from "@/components/ui/toast";

export function MinieraGame() {
  const { token, ready, login } = useAuth();
  const [loading, setLoading] = useState(true);
  const [remaining, setRemaining] = useState(0);
  const [canDig, setCanDig] = useState(false);
  const [finds, setFinds] = useState<Array<{ color: string; rare: boolean }>>([]);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ color: string; rare: boolean } | null>(null);

  const reload = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    const st = await fetchEventoMiniera(token);
    setLoading(false);
    if (!st?.ok) {
      showToast(st?.message || "Miniera non disponibile.", true);
      return;
    }
    setRemaining(st.remaining ?? 0);
    setCanDig(Boolean(st.canDig));
    setFinds(st.finds || []);
  }, [ready, token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function dig() {
    if (!token || busy || !canDig) return;
    setBusy(true);
    const out = await digEventoMiniera(token);
    setBusy(false);
    if (!out?.ok) {
      showToast(out?.message || "Estrazione fallita.", true);
      return;
    }
    setLast(out.find || null);
    setRemaining(out.remaining ?? 0);
    setCanDig((out.remaining ?? 0) > 0);
    if (out.find) setFinds((f) => [...f, out.find!]);
    showToast(out.find?.rare ? `Kyber ${out.find.color} RARO!` : `Kyber ${out.find?.color || "?"}`);
  }

  if (loading) {
    return <div className="mx-auto h-40 max-w-lg animate-pulse rounded-2xl bg-crema/8" aria-busy="true" />;
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-lg px-6 pb-16 text-center">
        <p className="mb-4 text-sm text-crema/70">Accedi per scavare nella miniera.</p>
        <button type="button" onClick={login} className="rounded-full bg-[#5865f2] px-5 py-2.5 text-sm font-semibold text-white">
          Accedi
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-6 pb-20 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#f0e6c8]/70">Estrazioni oggi</p>
      <p className="mt-1 font-display text-3xl text-[#f0e6c8]">{remaining} rimaste</p>
      {last ? (
        <p className="mt-3 text-sm text-crema/75">
          Ultimo: <span className="text-[#c9a227]">{last.color}</span>
          {last.rare ? " · raro" : ""}
        </p>
      ) : null}
      <button
        type="button"
        disabled={!canDig || busy}
        onClick={() => void dig()}
        className="mt-6 rounded-full bg-[#c9a227] px-6 py-2.5 text-sm font-semibold text-[#1a140c] disabled:opacity-40"
      >
        Scava
      </button>
      {finds.length ? (
        <ul className="mt-8 space-y-1 text-left text-sm text-crema/65">
          {finds.map((f, i) => (
            <li key={`${f.color}-${i}`}>
              Kyber {f.color}
              {f.rare ? " ★" : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
