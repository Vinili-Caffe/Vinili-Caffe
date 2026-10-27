"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Crosshair, Timer, Trophy, Zap } from "lucide-react";
import { fetchEventoAccademia, submitEventoAccademia } from "@/lib/evento-api";
import { useAuth } from "@/lib/auth";
import { showToast } from "@/components/ui/toast";
import {
  EventoBtn,
  EventoKicker,
  EventoLoginGate,
  EventoPanel,
  EventoSkeleton,
  EventoTitle,
} from "@/components/evento/EventoUi";

type Target = { id: string; x: number; y: number; r: number; points: number };

/** Max bersagli visibili insieme durante la prova. */
const LIVE_MAX = 2;

export function AccademiaGame() {
  const { token, ready, login } = useAuth();
  const [loading, setLoading] = useState(true);
  const [pool, setPool] = useState<Target[]>([]);
  const [live, setLive] = useState<Target[]>([]);
  const [hits, setHits] = useState<string[]>([]);
  const [played, setPlayed] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [playable, setPlayable] = useState(false);
  const [running, setRunning] = useState(false);
  const [left, setLeft] = useState(30);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const spawnRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hitsRef = useRef<string[]>([]);
  const queueRef = useRef<Target[]>([]);
  const liveRef = useRef<Target[]>([]);
  const runningRef = useRef(false);

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
    const t = st.targets || [];
    setPool(t);
    setLive([]);
    liveRef.current = [];
    queueRef.current = [];
    setHits([]);
    hitsRef.current = [];
  }, [ready, token]);

  useEffect(() => {
    void reload();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (spawnRef.current) clearTimeout(spawnRef.current);
    };
  }, [reload]);

  async function finish(finalHits: string[]) {
    runningRef.current = false;
    setRunning(false);
    if (timerRef.current) clearInterval(timerRef.current);
    if (spawnRef.current) clearTimeout(spawnRef.current);
    setLive([]);
    liveRef.current = [];
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
    setPool([]);
  }

  function spawnNext() {
    if (!runningRef.current) return;
    const q = queueRef.current;
    const cur = liveRef.current;
    while (cur.length < LIVE_MAX && q.length) {
      const next = q.shift()!;
      cur.push(next);
    }
    liveRef.current = [...cur];
    setLive([...cur]);
  }

  function start() {
    if (!token || played || !pool.length) return;
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    queueRef.current = shuffled;
    liveRef.current = [];
    setLive([]);
    setHits([]);
    hitsRef.current = [];
    runningRef.current = true;
    setRunning(true);
    setLeft(30);
    spawnNext();
    /* secondo bersaglio dopo un attimo */
    spawnRef.current = setTimeout(() => spawnNext(), 700);
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
    if (!runningRef.current || hitsRef.current.includes(id)) return;
    const next = [...hitsRef.current, id];
    hitsRef.current = next;
    setHits(next);
    liveRef.current = liveRef.current.filter((x) => x.id !== id);
    setLive([...liveRef.current]);
    if (queueRef.current.length === 0 && liveRef.current.length === 0) {
      void finish(next);
      return;
    }
    spawnRef.current = setTimeout(() => spawnNext(), 280 + Math.random() * 420);
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
        Accademia fuori calendario ? in anteprima HS resta giocabile quando il backend la espone.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6">
      <EventoPanel glow="blue" className="!overflow-hidden !p-0">
        <div className="flex items-center justify-between gap-3 border-b border-sand/15 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2 text-sm text-crema/75">
            <Timer className="size-4 text-[#2ea8ff]" aria-hidden />
            <span className="font-display text-xl tabular-nums text-crema">{running ? `${left}s` : "30s"}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-crema/75">
            <Zap className="size-4 text-caramel" aria-hidden />
            <span className="tabular-nums">
              {hits.length}/{pool.length || "?"} colpi
            </span>
          </div>
        </div>

        {!running ? (
          <div className="px-4 py-4 sm:px-5">
            <div className="mb-4 flex items-start gap-3">
              <Crosshair className="mt-0.5 size-5 shrink-0 text-[#2ea8ff]" aria-hidden />
              <p className="text-sm leading-relaxed text-crema/70">
                I bersagli compaiono uno o due alla volta ? colpiscili prima che scada il tempo.
              </p>
            </div>
            <EventoBtn className="w-full" onClick={start} disabled={!pool.length}>
              Inizia la prova
            </EventoBtn>
          </div>
        ) : null}

        <div className="relative aspect-[4/3] bg-[radial-gradient(ellipse_at_center,rgba(18,32,64,0.9),rgba(5,7,15,0.95))]">
          <div
            className="pointer-events-none absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                "linear-gradient(rgba(46,168,255,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(46,168,255,0.12) 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }}
            aria-hidden
          />
          {!running ? (
            <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-crema/35">
              Arena pronta ? premi Inizia
            </p>
          ) : null}
          <AnimatePresence>
            {live.map((t) => (
              <motion.button
                key={t.id}
                type="button"
                aria-label={`Bersaglio ${t.points}`}
                disabled={!running}
                onClick={() => hit(t.id)}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.4, opacity: 0 }}
                transition={{ type: "spring", stiffness: 380, damping: 18 }}
                className="absolute rounded-full bg-gradient-to-br from-[#e4c76b] to-[#c9a227] shadow-[0_0_28px_rgba(201,162,39,0.85)] ring-2 ring-sand/50 hover:brightness-110"
                style={{
                  left: `${t.x}%`,
                  top: `${t.y}%`,
                  width: `${Math.max(t.r * 2, 7)}%`,
                  height: `${Math.max(t.r * 2, 7)}%`,
                  transform: "translate(-50%, -50%)",
                }}
              />
            ))}
          </AnimatePresence>
        </div>
      </EventoPanel>
    </div>
  );
}
