"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Crosshair, Timer, Trophy, Zap } from "lucide-react";
import { fetchEventoAccademia, submitEventoAccademia } from "@/lib/evento-api";
import { useAuth } from "@/lib/auth";
import { showToast } from "@/components/ui/toast";
import { EventoBtn, EventoKicker, EventoLoginGate, EventoPanel, EventoSkeleton, EventoTitle } from "@/components/evento/EventoUi";

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

  if (loading) return <EventoSkeleton className="mx-auto max-w-2xl px-6" />;
  if (!token) return <div className="mx-auto max-w-lg px-6"><EventoLoginGate label="Accedi per le prove a tempo dell'Accademia Jedi." onLogin={login} /></div>;

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

  if (!playable && !targets.length) {
    return (
      <p className="mx-auto max-w-lg px-6 text-center text-sm text-crema/55">
        Accademia fuori calendario ? in anteprima HS resta giocabile quando il backend la espone.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6">
      <EventoPanel glow="blue" className="!p-0 overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-sand/15 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2 text-sm text-crema/75">
            <Timer className="size-4 text-[#2ea8ff]" aria-hidden />
            <span className="font-display text-xl tabular-nums text-crema">{running ? `${left}s` : "30s"}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-crema/75">
            <Zap className="size-4 text-caramel" aria-hidden />
            <span className="tabular-nums">{hits.length} colpi</span>
          </div>
        </div>

        {!running ? (
          <div className="px-4 py-4 sm:px-5">
            <div className="mb-4 flex items-start gap-3">
              <Crosshair className="mt-0.5 size-5 shrink-0 text-[#2ea8ff]" aria-hidden />
              <p className="text-sm leading-relaxed text-crema/70">
                Colpisci i bersagli luminosi prima che scada il tempo. Ogni hit vale punti ? svuota l&apos;arena.
              </p>
            </div>
            <EventoBtn className="w-full" onClick={start} disabled={!targets.length}>
              Inizia la prova
            </EventoBtn>
          </div>
        ) : null}

        <div
          className="relative aspect-[4/3] bg-[radial-gradient(ellipse_at_center,rgba(18,32,64,0.9),rgba(5,7,15,0.95))]"
          onClick={(e) => e.preventDefault()}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                "linear-gradient(rgba(46,168,255,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(46,168,255,0.12) 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }}
            aria-hidden
          />
          {targets.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-label={`Bersaglio ${t.points}`}
              disabled={!running}
              onClick={() => hit(t.id)}
              className="absolute rounded-full bg-gradient-to-br from-[#e4c76b] to-[#c9a227] shadow-[0_0_22px_rgba(201,162,39,0.75)] ring-2 ring-sand/40 transition hover:scale-110 disabled:opacity-40"
              style={{
                left: `${t.x}%`,
                top: `${t.y}%`,
                width: `${Math.max(t.r * 2, 6)}%`,
                height: `${Math.max(t.r * 2, 6)}%`,
                transform: "translate(-50%, -50%)",
              }}
            />
          ))}
        </div>
      </EventoPanel>
    </div>
  );
}
