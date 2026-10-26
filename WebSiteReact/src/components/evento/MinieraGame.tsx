"use client";

import { useCallback, useEffect, useState } from "react";
import { Gem, Pickaxe } from "lucide-react";
import { digEventoMiniera, fetchEventoMiniera } from "@/lib/evento-api";
import { useAuth } from "@/lib/auth";
import { showToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { EventoBtn, EventoKicker, EventoLoginGate, EventoPanel, EventoSkeleton, EventoTitle } from "@/components/evento/EventoUi";

const COLOR_GLOW: Record<string, string> = {
  rosso: "from-rose-500/40 to-rose-900/20 ring-rose-400/40",
  blu: "from-sky-400/40 to-blue-900/20 ring-sky-400/40",
  verde: "from-emerald-400/40 to-emerald-900/20 ring-emerald-400/40",
  viola: "from-violet-400/40 to-violet-900/20 ring-violet-400/40",
  giallo: "from-amber-300/40 to-amber-900/20 ring-amber-300/40",
  bianco: "from-white/30 to-slate-700/20 ring-white/40",
};

function glowFor(color: string) {
  const key = String(color || "").toLowerCase();
  for (const [k, v] of Object.entries(COLOR_GLOW)) {
    if (key.includes(k)) return v;
  }
  return "from-[#c9a227]/30 to-[#2ea8ff]/10 ring-[#c9a227]/35";
}

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

  if (loading) return <EventoSkeleton className="mx-auto max-w-lg px-6" />;
  if (!token) {
    return (
      <div className="mx-auto max-w-lg px-6">
        <EventoLoginGate label="Accedi per scavare cristalli Kyber nella miniera di Ilum." onLogin={login} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-5 px-6">
      <EventoPanel className="text-center" glow="gold">
        <Pickaxe className="mx-auto size-9 text-sand" aria-hidden />
        <EventoKicker>Estrazioni oggi</EventoKicker>
        <EventoTitle>{remaining}</EventoTitle>
        <p className="mt-1 text-sm text-crema/65">rimaste · cristalli Kyber</p>

        {last ? (
          <div
            className={cn(
              "mx-auto mt-5 max-w-xs rounded-2xl bg-gradient-to-br p-4 ring-1",
              glowFor(last.color),
            )}
          >
            <Gem className="mx-auto size-7 text-crema" aria-hidden />
            <p className="mt-2 font-display text-xl text-crema">
              {last.color}
              {last.rare ? " · raro" : ""}
            </p>
            <p className="text-[0.65rem] uppercase tracking-[0.25em] text-crema/55">Ultimo ritrovamento</p>
          </div>
        ) : null}

        <EventoBtn className="mt-6 w-full sm:w-auto" disabled={!canDig || busy} onClick={() => void dig()}>
          {busy ? "Scavo…" : "Scava"}
        </EventoBtn>
      </EventoPanel>

      {finds.length ? (
        <EventoPanel glow="none">
          <EventoKicker>Bottino di oggi</EventoKicker>
          <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {finds.map((f, i) => (
              <li
                key={`${f.color}-${i}`}
                className={cn(
                  "rounded-xl bg-gradient-to-br px-3 py-2.5 text-center text-sm ring-1",
                  glowFor(f.color),
                )}
              >
                <span className="font-medium text-crema">{f.color}</span>
                {f.rare ? <span className="mt-0.5 block text-[0.6rem] uppercase tracking-wider text-sand">raro</span> : null}
              </li>
            ))}
          </ul>
        </EventoPanel>
      ) : null}
    </div>
  );
}
