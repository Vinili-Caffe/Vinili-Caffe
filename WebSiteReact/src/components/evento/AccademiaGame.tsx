"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

type PoolTarget = { id: string; x: number; y: number; r: number; points: number };

type LiveTarget = {
  id: string;
  points: number;
  laneY: number;
  sizePct: number;
  durationSec: number;
  /** performance.now() allo spawn */
  bornAt: number;
};

/** Max bersagli in volo insieme. */
const LIVE_MAX = 2;
/** left %: da destra (108) a sinistra (-18) */
const FROM_X = 108;
const TO_X = -18;

export function AccademiaGame() {
  const { token, ready, login } = useAuth();
  const [loading, setLoading] = useState(true);
  const [pool, setPool] = useState<PoolTarget[]>([]);
  const [live, setLive] = useState<LiveTarget[]>([]);
  const [hits, setHits] = useState<string[]>([]);
  const [played, setPlayed] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [playable, setPlayable] = useState(false);
  const [running, setRunning] = useState(false);
  const [left, setLeft] = useState(30);
  /** tick per ripaintare left% senza Motion (funziona anche con animazioni off) */
  const [, setTick] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const spawnRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const missTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const hitsRef = useRef<string[]>([]);
  const queueRef = useRef<PoolTarget[]>([]);
  const liveRef = useRef<LiveTarget[]>([]);
  const runningRef = useRef(false);
  const finishingRef = useRef(false);
  const spawnIndexRef = useRef(0);

  const clearMissTimers = useCallback(() => {
    for (const t of missTimersRef.current.values()) clearTimeout(t);
    missTimersRef.current.clear();
  }, []);

  const clearTimers = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (spawnRef.current) clearTimeout(spawnRef.current);
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    timerRef.current = null;
    spawnRef.current = null;
    rafRef.current = null;
    clearMissTimers();
  }, [clearMissTimers]);

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
    return () => clearTimers();
  }, [reload, clearTimers]);

  function startRaf() {
    if (rafRef.current != null) return;
    const loop = () => {
      if (!runningRef.current) {
        rafRef.current = null;
        return;
      }
      setTick((n) => (n + 1) % 1_000_000);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }

  async function finish(finalHits: string[]) {
    if (finishingRef.current) return;
    finishingRef.current = true;
    runningRef.current = false;
    setRunning(false);
    clearTimers();
    setLive([]);
    liveRef.current = [];
    if (!token) return;
    const out = await submitEventoAccademia(
      token,
      finalHits.map((id) => ({ id })),
    );
    if (!out?.ok) {
      showToast(out?.message || "Invio fallito.", true);
      finishingRef.current = false;
      return;
    }
    setPlayed(true);
    setScore(out.score ?? null);
    showToast(`Prova conclusa · ${out.score ?? 0} punti`);
    setPool([]);
  }

  function maybeEnd() {
    if (!runningRef.current) return;
    if (queueRef.current.length === 0 && liveRef.current.length === 0) {
      void finish(hitsRef.current);
    }
  }

  function scheduleSpawn(delayMs: number) {
    if (spawnRef.current) clearTimeout(spawnRef.current);
    spawnRef.current = setTimeout(() => {
      spawnOne();
    }, delayMs);
  }

  function spawnOne() {
    if (!runningRef.current) return;
    if (liveRef.current.length >= LIVE_MAX) {
      scheduleSpawn(280);
      return;
    }
    const next = queueRef.current.shift();
    if (!next) {
      maybeEnd();
      return;
    }

    const i = spawnIndexRef.current++;
    const sizePct = Math.max(next.r * 1.6, 8);
    const laneY = 18 + ((next.y || 40) % 64);
    const durationSec = Math.max(2.2, 4.6 - i * 0.18 - sizePct * 0.04);

    const liveT: LiveTarget = {
      id: next.id,
      points: next.points,
      laneY: Math.min(82, Math.max(14, laneY)),
      sizePct,
      durationSec,
      bornAt: performance.now(),
    };
    liveRef.current = [...liveRef.current, liveT];
    setLive([...liveRef.current]);

    const missT = setTimeout(() => missExit(liveT.id), liveT.durationSec * 1000 + 40);
    missTimersRef.current.set(liveT.id, missT);

    if (queueRef.current.length > 0) {
      const gap = liveRef.current.length >= LIVE_MAX ? 900 : 550 + Math.random() * 500;
      scheduleSpawn(gap);
    }
  }

  function start() {
    if (!token || played || !pool.length) return;
    finishingRef.current = false;
    clearTimers();
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    queueRef.current = shuffled;
    liveRef.current = [];
    spawnIndexRef.current = 0;
    setLive([]);
    setHits([]);
    hitsRef.current = [];
    runningRef.current = true;
    setRunning(true);
    setLeft(30);
    startRaf();
    spawnOne();
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

  function clearMiss(id: string) {
    const t = missTimersRef.current.get(id);
    if (t) clearTimeout(t);
    missTimersRef.current.delete(id);
  }

  function hit(id: string) {
    if (!runningRef.current || hitsRef.current.includes(id)) return;
    clearMiss(id);
    const next = [...hitsRef.current, id];
    hitsRef.current = next;
    setHits(next);
    liveRef.current = liveRef.current.filter((x) => x.id !== id);
    setLive([...liveRef.current]);
    if (queueRef.current.length === 0 && liveRef.current.length === 0) {
      void finish(next);
      return;
    }
    if (queueRef.current.length > 0 && liveRef.current.length < LIVE_MAX) {
      scheduleSpawn(180 + Math.random() * 220);
    }
  }

  function missExit(id: string) {
    clearMiss(id);
    if (!runningRef.current) return;
    if (!liveRef.current.some((t) => t.id === id)) return;
    liveRef.current = liveRef.current.filter((x) => x.id !== id);
    setLive([...liveRef.current]);
    if (queueRef.current.length === 0 && liveRef.current.length === 0) {
      void finish(hitsRef.current);
      return;
    }
    if (queueRef.current.length > 0 && liveRef.current.length < LIVE_MAX) {
      scheduleSpawn(120);
    }
  }

  function xFor(t: LiveTarget) {
    const elapsed = (performance.now() - t.bornAt) / 1000;
    const p = Math.min(1, Math.max(0, elapsed / t.durationSec));
    return FROM_X + (TO_X - FROM_X) * p;
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
          <p className="mt-3 text-sm text-crema/65">Prossimo slot tra circa 4 ore. La Forza e con te.</p>
        </EventoPanel>
      </div>
    );
  }

  if (!playable && !pool.length) {
    return (
      <p className="mx-auto max-w-lg px-6 text-center text-sm text-crema/55">
        Accademia fuori calendario - in anteprima HS resta giocabile quando il backend la espone.
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
              {hits.length}/{pool.length || "-"} colpi
            </span>
          </div>
        </div>

        {!running ? (
          <div className="px-4 py-4 sm:px-5">
            <div className="mb-4 flex items-start gap-3">
              <Crosshair className="mt-0.5 size-5 shrink-0 text-[#2ea8ff]" aria-hidden />
              <p className="text-sm leading-relaxed text-crema/70">
                I bersagli entrano da destra e attraversano l&apos;arena: colpiscili in volo. Piu&apos; ne restano,
                piu&apos; e&apos; difficile.
              </p>
            </div>
            <EventoBtn className="w-full" onClick={start} disabled={!pool.length}>
              Inizia la prova
            </EventoBtn>
          </div>
        ) : null}

        <div className="relative aspect-[4/3] overflow-hidden bg-[radial-gradient(ellipse_at_center,rgba(18,32,64,0.9),rgba(5,7,15,0.95))]">
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
              Arena pronta - premi Inizia
            </p>
          ) : null}
          {live.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-label={`Bersaglio ${t.points}`}
              disabled={!running}
              onClick={() => hit(t.id)}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-[#e4c76b] to-[#c9a227] shadow-[0_0_28px_rgba(201,162,39,0.85)] ring-2 ring-sand/50 hover:brightness-110 active:scale-90"
              style={{
                left: `${xFor(t)}%`,
                top: `${t.laneY}%`,
                width: `${t.sizePct}%`,
                height: `${t.sizePct}%`,
                aspectRatio: "1",
              }}
            />
          ))}
        </div>
      </EventoPanel>
    </div>
  );
}
