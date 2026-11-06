"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Crosshair, Timer, Zap } from "lucide-react";
import { EventoBtn } from "@/components/evento/EventoUi";
import { cn } from "@/lib/cn";

export type AccademiaPoolTarget = { id: string; points?: number; r?: number };

type TargetPhase = "in" | "live" | "out" | "hit";

type LiveTarget = {
  id: string;
  points: number;
  x: number;
  y: number;
  sizePct: number;
  lifeMs: number;
  bornAt: number;
  phase: TargetPhase;
};

/** Max bersagli contemporanei (solo durante un burst gemello). */
const LIVE_MAX = 2;
/** Vita breve: più difficile da colpire. */
const LIFE_MS_MIN = 980;
const LIFE_MS_MAX = 1480;
const EXIT_MS = 240;
/** Distanza minima tra due bersagli (% arena). */
const MIN_SEP = 46;
/** Gap dopo uno spawn singolo / fine burst. */
const SOLO_GAP_MIN = 720;
const SOLO_GAP_MAX = 1280;
/** Secondo del burst: ravvicinato nel tempo. */
const PAIR_GAP_MIN = 160;
const PAIR_GAP_MAX = 280;
/** Probabilità che lo spawn successivo sia un burst da 2. */
const PAIR_CHANCE = 0.42;

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function pickPos(existing: LiveTarget[]): { x: number; y: number } {
  const active = existing.filter((t) => t.phase === "in" || t.phase === "live");
  for (let i = 0; i < 36; i += 1) {
    const x = rand(10, 90);
    const y = rand(12, 88);
    const ok = active.every((t) => Math.hypot(t.x - x, t.y - y) >= MIN_SEP);
    if (ok) return { x, y };
  }
  /* fallback: angolo opposto al vivo */
  if (active[0]) {
    return {
      x: active[0].x < 50 ? rand(68, 90) : rand(10, 32),
      y: active[0].y < 50 ? rand(62, 88) : rand(12, 36),
    };
  }
  return { x: rand(14, 86), y: rand(16, 84) };
}

type Props = {
  pool: AccademiaPoolTarget[];
  sessionSec?: number;
  showChrome?: boolean;
  autoStart?: boolean;
  hint?: string;
  startLabel?: string;
  onStart?: () => void;
  onComplete: (hits: string[]) => void;
  className?: string;
};

/**
 * Arena Accademia: spawn uno alla volta, lontani; a volte un burst da 2
 * ravvicinato nel tempo. Comparsa/scomparsa animate; vita breve.
 */
export function AccademiaArena({
  pool,
  sessionSec = 30,
  showChrome = true,
  autoStart = false,
  hint = "I bersagli compaiono uno alla volta, lontani tra loro — a volte due di fila. Colpiscili prima che spariscano.",
  startLabel = "Inizia la prova",
  onStart,
  onComplete,
  className,
}: Props) {
  const [live, setLive] = useState<LiveTarget[]>([]);
  const [hits, setHits] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [left, setLeft] = useState(sessionSec);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const spawnRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const missTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const exitTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const hitsRef = useRef<string[]>([]);
  const queueRef = useRef<AccademiaPoolTarget[]>([]);
  const liveRef = useRef<LiveTarget[]>([]);
  const runningRef = useRef(false);
  const finishingRef = useRef(false);
  const pairPendingRef = useRef(false);
  const arenaRef = useRef<HTMLDivElement>(null);
  const hitLockRef = useRef<Set<string>>(new Set());
  const onCompleteRef = useRef(onComplete);
  const onStartRef = useRef(onStart);
  onCompleteRef.current = onComplete;
  onStartRef.current = onStart;

  const clearMissTimers = useCallback(() => {
    for (const t of missTimersRef.current.values()) clearTimeout(t);
    missTimersRef.current.clear();
  }, []);

  const clearExitTimers = useCallback(() => {
    for (const t of exitTimersRef.current.values()) clearTimeout(t);
    exitTimersRef.current.clear();
  }, []);

  const clearTimers = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (spawnRef.current) clearTimeout(spawnRef.current);
    timerRef.current = null;
    spawnRef.current = null;
    clearMissTimers();
    clearExitTimers();
  }, [clearMissTimers, clearExitTimers]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  function syncLive(next: LiveTarget[]) {
    liveRef.current = next;
    setLive(next);
  }

  function finish(finalHits: string[]) {
    if (finishingRef.current) return;
    finishingRef.current = true;
    runningRef.current = false;
    setRunning(false);
    clearTimers();
    syncLive([]);
    onCompleteRef.current(finalHits);
  }

  function maybeEnd() {
    if (!runningRef.current) return;
    if (queueRef.current.length === 0 && liveRef.current.length === 0) {
      finish(hitsRef.current);
    }
  }

  function scheduleSpawn(delayMs: number) {
    if (spawnRef.current) clearTimeout(spawnRef.current);
    spawnRef.current = setTimeout(() => {
      spawnRef.current = null;
      spawnOne();
    }, delayMs);
  }

  function activeCount() {
    return liveRef.current.filter((t) => t.phase === "in" || t.phase === "live").length;
  }

  function scheduleNextAfterSpawn() {
    if (queueRef.current.length < 1) return;
    if (pairPendingRef.current) {
      pairPendingRef.current = false;
      scheduleSpawn(rand(PAIR_GAP_MIN, PAIR_GAP_MAX));
      return;
    }
    /* prossima ondata solo quando lo slot è libero (dopo exit) */
  }

  function scheduleWaveIfIdle() {
    if (!runningRef.current) return;
    if (queueRef.current.length < 1) {
      maybeEnd();
      return;
    }
    if (activeCount() > 0) return;
    if (liveRef.current.length > 0) return; /* ancora in exit */
    if (spawnRef.current) return; /* spawn già schedulato (burst / prossima ondata) */
    /* Dopo hit/miss: nuova ondata appena l’arena è libera. */
    scheduleSpawn(rand(SOLO_GAP_MIN, SOLO_GAP_MAX));
  }

  function spawnOne() {
    if (!runningRef.current) return;
    if (activeCount() >= LIVE_MAX) {
      scheduleSpawn(260);
      return;
    }
    const next = queueRef.current.shift();
    if (!next) {
      maybeEnd();
      return;
    }

    const sizePct = Math.max(Number(next.r) > 0 ? Number(next.r) * 0.95 : 5.5, 4.8);
    const pos = pickPos(liveRef.current);
    const lifeMs = Math.round(rand(LIFE_MS_MIN, LIFE_MS_MAX));
    const liveT: LiveTarget = {
      id: next.id,
      points: Number(next.points) || 1,
      x: pos.x,
      y: pos.y,
      sizePct,
      lifeMs,
      bornAt: performance.now(),
      phase: "in",
    };
    syncLive([...liveRef.current, liveT]);

    /* dopo l'ingresso diventa "live" (clickabile) */
    window.setTimeout(() => {
      if (!runningRef.current) return;
      const cur = liveRef.current.find((t) => t.id === liveT.id);
      if (!cur || cur.phase !== "in") return;
      syncLive(liveRef.current.map((t) => (t.id === liveT.id ? { ...t, phase: "live" as const } : t)));
    }, 160);

    const missT = setTimeout(() => beginExit(liveT.id, "out"), lifeMs);
    missTimersRef.current.set(liveT.id, missT);

    if (queueRef.current.length > 0) {
      if (pairPendingRef.current) {
        scheduleNextAfterSpawn();
      } else if (activeCount() === 1 && Math.random() < PAIR_CHANCE) {
        /* burst: secondo quasi subito, lontano nello spazio */
        pairPendingRef.current = true;
        scheduleNextAfterSpawn();
      }
      /* altrimenti aspetta idle dopo exit */
    }
  }

  function clearMiss(id: string) {
    const t = missTimersRef.current.get(id);
    if (t) clearTimeout(t);
    missTimersRef.current.delete(id);
  }

  function removeTarget(id: string) {
    const exitT = exitTimersRef.current.get(id);
    if (exitT) clearTimeout(exitT);
    exitTimersRef.current.delete(id);
    clearMiss(id);
    syncLive(liveRef.current.filter((x) => x.id !== id));
    if (queueRef.current.length === 0 && liveRef.current.length === 0) {
      finish(hitsRef.current);
      return;
    }
    scheduleWaveIfIdle();
  }

  function beginExit(id: string, phase: "out" | "hit") {
    clearMiss(id);
    if (!runningRef.current) return;
    const cur = liveRef.current.find((t) => t.id === id);
    if (!cur || cur.phase === "out" || cur.phase === "hit") return;
    syncLive(liveRef.current.map((t) => (t.id === id ? { ...t, phase } : t)));
    const exitT = setTimeout(() => removeTarget(id), EXIT_MS);
    exitTimersRef.current.set(id, exitT);
  }

  function hit(id: string) {
    if (!runningRef.current || hitsRef.current.includes(id) || hitLockRef.current.has(id)) return;
    const cur = liveRef.current.find((t) => t.id === id);
    if (!cur || cur.phase === "out" || cur.phase === "hit") return;
    /* clickabile solo dopo pop-in */
    if (cur.phase === "in") return;
    hitLockRef.current.add(id);
    const next = [...hitsRef.current, id];
    hitsRef.current = next;
    setHits(next);
    beginExit(id, "hit");
  }

  function onArenaPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!runningRef.current) return;
    const arena = arenaRef.current;
    if (!arena) return;
    const rect = arena.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const px = ((e.clientX - rect.left) / rect.width) * 100;
    const py = ((e.clientY - rect.top) / rect.height) * 100;
    let best: { id: string; d: number } | null = null;
    for (const t of liveRef.current) {
      if (t.phase !== "live") continue;
      const r = Math.max(t.sizePct / 2, 5.5);
      const dx = px - t.x;
      const dy = ((py - t.y) * rect.height) / rect.width;
      const d = Math.hypot(dx, dy);
      if (d <= r && (!best || d < best.d)) best = { id: t.id, d };
    }
    if (best) {
      e.preventDefault();
      hit(best.id);
    }
  }

  function start() {
    if (!pool.length || runningRef.current) return;
    finishingRef.current = false;
    pairPendingRef.current = false;
    clearTimers();
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    queueRef.current = shuffled;
    syncLive([]);
    setHits([]);
    hitsRef.current = [];
    hitLockRef.current = new Set();
    runningRef.current = true;
    setRunning(true);
    setLeft(sessionSec);
    try {
      onStartRef.current?.();
    } catch {
      /* ignore */
    }
    /* primo dopo un attimo di tensione */
    scheduleSpawn(380 + Math.random() * 220);
    timerRef.current = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          finish(hitsRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }

  useEffect(() => {
    if (autoStart && pool.length && !runningRef.current && !finishingRef.current) {
      start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al mount / cambio pool
  }, [autoStart, pool]);

  return (
    <div className={className}>
      {showChrome ? (
        <div className="flex items-center justify-between gap-3 border-b border-sand/15 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2 text-sm text-crema/75">
            <Timer className="size-4 text-[#2ea8ff]" aria-hidden />
            <span className="font-display text-xl tabular-nums text-crema">{running ? `${left}s` : `${sessionSec}s`}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-crema/75">
            <Zap className="size-4 text-caramel" aria-hidden />
            <span className="tabular-nums">
              {hits.length}/{pool.length || "—"} colpi
            </span>
          </div>
        </div>
      ) : null}

      {!running && showChrome ? (
        <div className="px-4 py-4 sm:px-5">
          <div className="mb-4 flex items-start gap-3">
            <Crosshair className="mt-0.5 size-5 shrink-0 text-[#2ea8ff]" aria-hidden />
            <p className="text-sm leading-relaxed text-crema/70">{hint}</p>
          </div>
          <EventoBtn className="w-full" onClick={start} disabled={!pool.length}>
            {startLabel}
          </EventoBtn>
        </div>
      ) : null}

      <div
        ref={arenaRef}
        className="relative aspect-[4/3] touch-manipulation overflow-hidden bg-[radial-gradient(ellipse_at_center,rgba(18,32,64,0.9),rgba(5,7,15,0.95))]"
        onPointerDown={onArenaPointerDown}
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
        {!running ? (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-crema/35">
            Arena pronta
          </p>
        ) : null}
        {live.map((t) => {
          const size = Math.max(t.sizePct, 5.2);
          const clickable = running && t.phase === "live";
          return (
            <button
              key={t.id}
              type="button"
              aria-label={`Bersaglio ${t.points}`}
              disabled={!clickable}
              data-phase={t.phase}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (clickable) hit(t.id);
              }}
              className={cn(
                "pointer-events-auto absolute rounded-full bg-gradient-to-br from-[#e4c76b] to-[#c9a227] ring-2 ring-sand/50",
                t.phase === "in" && "vc-accademia-in",
                t.phase === "live" && "vc-accademia-live",
                t.phase === "out" && "vc-accademia-out",
                t.phase === "hit" && "vc-accademia-hit",
              )}
              style={{
                left: `${t.x}%`,
                top: `${t.y}%`,
                width: `${size}%`,
                height: `${size}%`,
                minWidth: 30,
                minHeight: 30,
                aspectRatio: "1",
                touchAction: "manipulation",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

/** Pool locale per lo step smistamento (nessun punteggio fazione). */
export function makeGateTargets(count = 10): AccademiaPoolTarget[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `gate-${i + 1}`,
    points: 1,
    r: 4.2 + (i % 3) * 0.6,
  }));
}
