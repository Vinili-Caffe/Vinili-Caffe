"use client";

import { useCallback, useEffect, useState } from "react";
import { Flag, Rocket } from "lucide-react";
import { fetchEventoGara, pickEventoGara } from "@/lib/evento-api";
import { useAuth } from "@/lib/auth";
import { showToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { EventoBtn, EventoKicker, EventoLoginGate, EventoPanel, EventoSkeleton, EventoTitle } from "@/components/evento/EventoUi";

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

  if (loading) return <EventoSkeleton className="mx-auto max-w-xl px-6" />;
  if (!token) {
    return (
      <div className="mx-auto max-w-lg px-6">
        <EventoLoginGate label="Accedi per scegliere lo sguscio e lanciare la gara su Tatooine." onLogin={login} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-6 space-y-5">
      {result ? (
        <EventoPanel className="text-center" glow={result.won ? "gold" : "blue"}>
          <Flag className="mx-auto size-9 text-[#e4c76b]" aria-hidden />
          <EventoKicker>Esito slot</EventoKicker>
          <EventoTitle>{result.won ? "Vittoria!" : `${result.place}° posto`}</EventoTitle>
          {pick ? (
            <p className="mt-2 text-sm text-[#f0e6c8]/65">
              Sguscio: {pods.find((p) => p.id === pick)?.label || pick}
            </p>
          ) : null}
        </EventoPanel>
      ) : (
        <EventoPanel glow="none" className="text-center">
          <Rocket className="mx-auto size-8 text-[#2ea8ff]" aria-hidden />
          <EventoKicker>Podracing Championship</EventoKicker>
          <p className="mt-2 text-sm text-[#f0e6c8]/65">Scegli lo sguscio. Un solo pick per slot.</p>
        </EventoPanel>
      )}

      <ul className="grid gap-3">
        {pods.map((p, i) => {
          const selected = pick === p.id;
          return (
            <li key={p.id}>
              <button
                type="button"
                disabled={!canPick || busy}
                onClick={() => void choose(p.id)}
                className={cn(
                  "group relative flex w-full items-center gap-4 overflow-hidden rounded-2xl px-4 py-4 text-left ring-1 transition",
                  selected
                    ? "bg-gradient-to-r from-[#c9a227]/25 to-[#2ea8ff]/15 ring-[#c9a227]/55"
                    : "bg-[rgba(10,16,32,0.75)] ring-[#f0e6c8]/12 hover:ring-[#2ea8ff]/40",
                  "disabled:opacity-45",
                )}
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#2ea8ff]/15 font-display text-lg text-[#2ea8ff] ring-1 ring-[#2ea8ff]/30">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-xl text-[#f0e6c8]">{p.label}</span>
                  <span className="text-xs uppercase tracking-[0.2em] text-[#f0e6c8]/4">
                    {selected ? "Selezionato" : canPick ? "Tocca per gareggiare" : "Bloccato"}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {!canPick && !result ? (
        <p className="text-center text-sm text-[#f0e6c8]/5">Gara non selezionabile in questo slot.</p>
      ) : null}
      {canPick ? (
        <p className="text-center text-xs text-[#f0e6c8]/4">La scelta è definitiva per lo slot corrente.</p>
      ) : null}
      {result && !canPick ? (
        <div className="text-center">
          <EventoBtn variant="ghost" onClick={() => void reload()}>
            Aggiorna
          </EventoBtn>
        </div>
      ) : null}
    </div>
  );
}
