"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Trophy } from "lucide-react";
import { fetchEventoAccademia, submitEventoAccademia } from "@/lib/evento-api";
import { useAuth } from "@/lib/auth";
import { showToast } from "@/components/ui/toast";
import {
  EventoKicker,
  EventoLoginGate,
  EventoPanel,
  EventoSkeleton,
  EventoTitle,
} from "@/components/evento/EventoUi";
import { AccademiaArena, type AccademiaPoolTarget } from "@/components/evento/AccademiaArena";

export function AccademiaGame() {
  const { token, ready, login } = useAuth();
  const [loading, setLoading] = useState(true);
  const [pool, setPool] = useState<AccademiaPoolTarget[]>([]);
  const [played, setPlayed] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [playable, setPlayable] = useState(false);
  const [playToken, setPlayToken] = useState<string | null>(null);
  const playTokenRef = useRef<string | null>(null);
  const startedAtRef = useRef<number>(0);
  const finishingRef = useRef(false);

  const reload = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    const st = await fetchEventoAccademia(token);
    setLoading(false);
    if (!st?.ok) {
      showToast(st?.message || "Accademia non disponibile.", true);
      return;
    }
    setPlayable(Boolean(st.playable));
    setPlayed(Boolean(st.played));
    setScore(st.lastScore ?? null);
    const tok = st.playToken ? String(st.playToken) : null;
    setPlayToken(tok);
    playTokenRef.current = tok;
    setPool(st.targets || []);
    finishingRef.current = false;
  }, [ready, token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function onComplete(hits: string[]) {
    if (finishingRef.current) return;
    finishingRef.current = true;
    if (!token) return;
    const out = await submitEventoAccademia(
      token,
      hits.map((id) => ({ id })),
      { playToken: playTokenRef.current, startedAt: startedAtRef.current || Date.now() },
    );
    if (!out?.ok) {
      showToast(out?.message || "Invio fallito.", true);
      finishingRef.current = false;
      return;
    }
    setPlayed(true);
    setScore(out.score ?? null);
    const crate = String(out.crateId || "").trim();
    const exp = Number(out.exp) || 0;
    const crateLabel =
      crate === "omega" ? "Cassa Omega" : crate === "beta" ? "Cassa Beta" : crate === "alpha" ? "Cassa Alpha" : crate;
    showToast(
      crateLabel
        ? `Prova conclusa · ${crateLabel}${exp ? ` + ${exp} exp` : ""}`
        : `Prova conclusa · ${out.score ?? 0} punti`,
    );
    setPool([]);
  }

  if (loading) return <EventoSkeleton className="mx-auto max-w-2xl px-6" />;
  if (!token) {
    return (
      <div className="mx-auto max-w-lg px-6">
        <EventoLoginGate label="Accedi per le prove a tempo dell'Accademia Jedi." onLogin={login} />
      </div>
    );
  }

  if (played) {
    return (
      <div className="mx-auto max-w-lg px-6">
        <EventoPanel className="text-center" glow="gold">
          <Trophy className="mx-auto size-10 text-sand" aria-hidden />
          <EventoKicker>Prova completata</EventoKicker>
          <EventoTitle>{score ?? 0} punti</EventoTitle>
          <p className="mt-3 text-sm text-crema/65">Prossimo slot tra circa 4 ore. La Forza è con te.</p>
        </EventoPanel>
      </div>
    );
  }

  if (!playable && !pool.length) {
    return (
      <p className="mx-auto max-w-lg px-6 text-center text-sm text-crema/55">
        Accademia fuori calendario — in anteprima HS resta giocabile quando il backend la espone.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6">
      <EventoPanel glow="blue" className="!overflow-hidden !p-0">
        <AccademiaArena
          key={playToken || "accademia"}
          pool={pool}
          sessionSec={30}
          hint="Uno alla volta, lontani — a volte due di fila. Più sei veloce, meglio è: ≤12s Omega+300 · ≤22s Beta+200 · altrimenti Alpha+100."
          startLabel="Inizia la prova"
          onStart={() => {
            startedAtRef.current = Date.now();
          }}
          onComplete={(hits) => void onComplete(hits)}
        />
      </EventoPanel>
    </div>
  );
}
