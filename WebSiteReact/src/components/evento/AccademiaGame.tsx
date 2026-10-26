"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchEventoAccademia, submitEventoAccademia } from "@/lib/evento-api";
import { useAuth } from "@/lib/auth";
import { showToast } from "@/components/ui/toast";

type Target = { id: string; x: number; y: number; r: number; points: number };

export function AccademiaGame() {
  const { token, ready, login } = useAuth();
  const [loading, setLoading] = useState(true);
  const [targets, setTargets] = useState<Target[]>([]);
  const [hits, setHits] = useState<string[]>([]);
  const [played, setPlayed] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [playable, setPlayable] = useState(false);
  const [running, setRunning] = useState(false);
  const [left, setLeft] = useState(30);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hitsRef = useRef<string[]>([]);

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
    setTargets(st.targets || []);
    setHits([]);
    hitsRef.current = [];
  }, [ready, token]);

  useEffect(() => {
    void reload();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [reload]);

  async function finish(finalHits: string[]) {
    setRunning(false);
    if (timerRef.current) clearInterval(timerRef.current);
    if (!token) return;
    const out = await submitEventoAccademia(
      token,
      finalHits.map((id) => ({ id })),
    );
    if (!out?.ok) {
      showToast(out?.message || "Invio fallito.", true);
      return;
    }
    setPlayed(true);
    setScore(out.score ?? null);
    showToast(`Prova conclusa · ${out.score ?? 0} punti`);
    setTargets([]);
  }

  function start() {
    if (!token || played || !targets.length) return;
    setRunning(true);
    setLeft(30);
    timerRef.current = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          void finish(hitsRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }

  function hit(id: string) {
    if (!running || hitsRef.current.includes(id)) return;
    const next = [...hitsRef.current, id];
    hitsRef.current = next;
    setHits(next);
    setTargets((t) => {
      const leftTargets = t.filter((x) => x.id !== id);
      if (leftTargets.length === 0) void finish(next);
      return leftTargets;
    });
  }

  if (loading) {
    return <div className="mx-auto h-48 max-w-lg animate-pulse rounded-2xl bg-crema/8" aria-busy="true" />;
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-lg px-6 pb-16 text-center">
        <p className="mb-4 text-sm text-crema/70">Accedi per le prove all&apos;Accademia.</p>
        <button type="button" onClick={login} className="rounded-full bg-[#5865f2] px-5 py-2.5 text-sm font-semibold text-white">
          Accedi
        </button>
      </div>
    );
  }

  if (played) {
    return (
      <div className="mx-auto max-w-lg px-6 pb-16 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#f0e6c8]/70">Prova completata</p>
        <p className="mt-2 font-display text-3xl text-[#f0e6c8]">{score ?? 0} punti</p>
        <p className="mt-2 text-sm text-crema/65">Torna allo slot successivo (ogni 4 ore).</p>
      </div>
    );
  }

  if (!playable && !targets.length) {
    return <p className="mx-auto max-w-lg px-6 pb-16 text-center text-sm text-crema/65">Accademia non in calendario — in anteprima HS è comunque giocabile quando il backend la espone.</p>;
  }

  return (
    <div className="mx-auto max-w-xl px-6 pb-20">
      <div className="mb-3 flex items-center justify-between text-sm text-crema/70">
        <span>{running ? `${left}s` : "Pronto"}</span>
        <span>{hits.length} colpi</span>
      </div>
      {!running ? (
        <button
          type="button"
          onClick={start}
          disabled={!targets.length}
          className="mb-4 w-full rounded-full bg-[#c9a227] px-5 py-2.5 text-sm font-semibold text-[#1a140c] disabled:opacity-40"
        >
          Inizia prova (30s)
        </button>
      ) : null}
      <div
        className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-gradient-to-br from-[#0b1220] to-[#1a140c] ring-1 ring-[#f0e6c8]/15"
        onClick={(e) => e.preventDefault()}
      >
        {targets.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-label={`Bersaglio ${t.points}`}
            disabled={!running}
            onClick={() => hit(t.id)}
            className="absolute rounded-full bg-[#c9a227]/90 shadow-[0_0_12px_rgba(201,162,39,0.5)] transition hover:scale-110 disabled:opacity-50"
            style={{
              left: `${t.x}%`,
              top: `${t.y}%`,
              width: `${t.r * 2}%`,
              height: `${t.r * 2}%`,
              transform: "translate(-50%, -50%)",
            }}
          />
        ))}
      </div>
    </div>
  );
}
