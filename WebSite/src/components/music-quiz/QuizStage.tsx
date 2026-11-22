"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Headphones, Play, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/cn";

/* ───────── audio: un solo lettore, il brano parte quando è pronto e si ferma dopo clipMs ───────── */

export type ClipState = "loading" | "playing" | "done" | "blocked" | "error";

/**
 * Suona l'anteprima per `clipMs`. `startedAt` è quando è partito davvero il brano (performance.now):
 * da lì si conta il tempo per rispondere. Se il browser blocca l'audio (nessun clic prima) lo stato è
 * «blocked» e basta toccare «Ascolta»; se il brano non si carica parte comunque il tempo.
 */
export function useQuizClip(url: string | null | undefined, clipMs: number, key: string | number) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const stopTimer = useRef(0);
  const failTimer = useRef(0);
  const [state, setState] = useState<ClipState>("loading");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [playedAt, setPlayedAt] = useState<number | null>(null);

  const playFromStart = useCallback(() => {
    const a = audio.current;
    if (!a) return;
    window.clearTimeout(stopTimer.current);
    try {
      a.currentTime = 0;
    } catch {
      /* ancora senza dati */
    }
    void a
      .play()
      .then(() => {
        const now = performance.now();
        setStartedAt((prev) => prev ?? now);
        setPlayedAt(now);
        setState("playing");
        stopTimer.current = window.setTimeout(() => {
          a.pause();
          setState("done");
        }, clipMs);
      })
      .catch(() => setState("blocked"));
  }, [clipMs]);

  useEffect(() => {
    if (!url) return;
    const a = audio.current || new Audio();
    audio.current = a;
    a.preload = "auto";
    setState("loading");
    setStartedAt(null);
    setPlayedAt(null);
    window.clearTimeout(stopTimer.current);
    window.clearTimeout(failTimer.current);
    const onReady = () => {
      window.clearTimeout(failTimer.current);
      playFromStart();
    };
    const onError = () => {
      window.clearTimeout(failTimer.current);
      setState("error");
      setStartedAt((prev) => prev ?? performance.now());
    };
    a.addEventListener("canplaythrough", onReady, { once: true });
    a.addEventListener("error", onError, { once: true });
    a.src = url;
    a.load();
    /* brano che non arriva: si gioca lo stesso, il tempo parte */
    failTimer.current = window.setTimeout(onError, 7000);
    return () => {
      a.removeEventListener("canplaythrough", onReady);
      a.removeEventListener("error", onError);
      window.clearTimeout(stopTimer.current);
      window.clearTimeout(failTimer.current);
      a.pause();
    };
  }, [url, key, playFromStart]);

  useEffect(
    () => () => {
      audio.current?.pause();
      audio.current = null;
    },
    [],
  );

  const stop = useCallback(() => {
    window.clearTimeout(stopTimer.current);
    audio.current?.pause();
  }, []);

  return { state, startedAt, playedAt, replay: playFromStart, stop };
}

/** Millisecondi rimasti per rispondere, aggiornati a ogni frame. */
export function useCountdown(startedAt: number | null, totalMs: number, active: boolean) {
  const [left, setLeft] = useState(totalMs);
  useEffect(() => {
    if (startedAt == null || !active) {
      if (startedAt == null) setLeft(totalMs);
      return;
    }
    let raf = 0;
    const tick = () => {
      const l = Math.max(0, totalMs - (performance.now() - startedAt));
      setLeft(l);
      if (l > 0) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [startedAt, totalMs, active]);
  return left;
}

/* ───────── giradischi con il tempo intorno ───────── */

export function QuizTurntable({
  cover,
  clip,
  clipMs,
  left,
  totalMs,
  onReplay,
}: {
  cover?: string;
  clip: ClipState;
  clipMs: number;
  left: number;
  totalMs: number;
  onReplay: () => void;
}) {
  const spinning = clip === "playing";
  const r = 118;
  const c = 2 * Math.PI * r;
  const frac = left / totalMs;
  const urgent = left < 4000;
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative grid size-[17rem] place-items-center sm:size-[19rem]">
        {/* tempo per rispondere */}
        <svg viewBox="0 0 260 260" className="absolute inset-0 size-full -rotate-90" aria-hidden>
          <circle cx="130" cy="130" r={r} fill="none" strokeWidth="6" className="stroke-crema/[0.07]" />
          <circle
            cx="130"
            cy="130"
            r={r}
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - frac)}
            className={cn("transition-[stroke] duration-300", urgent ? "stroke-ember" : "stroke-caramel")}
          />
        </svg>
        {/* disco */}
        <motion.div
          animate={spinning ? { rotate: 360 } : { rotate: 0 }}
          transition={spinning ? { repeat: Infinity, ease: "linear", duration: 2.2 } : { duration: 0.6 }}
          className="relative grid size-[13.5rem] place-items-center rounded-full bg-[repeating-radial-gradient(circle,#0b0705_0_1.5px,#21160f_1.5px_3px)] shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)] ring-1 ring-sand/15 sm:size-[15rem]"
        >
          <span className="absolute inset-0 rounded-full bg-[conic-gradient(from_40deg,transparent_0deg,rgba(244,233,216,0.08)_40deg,transparent_80deg,transparent_180deg,rgba(244,233,216,0.06)_220deg,transparent_260deg)]" />
          <span className="relative size-[38%] overflow-hidden rounded-full bg-gradient-to-br from-caramel to-ember ring-4 ring-espresso">
            {cover ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={cover} alt="" className="size-full object-cover opacity-90" />
            ) : null}
            <span className="absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-espresso ring-2 ring-crema/20" />
          </span>
        </motion.div>
        {/* secondi rimasti */}
        <span
          className={cn(
            "absolute -bottom-1 rounded-full px-3 py-1 font-display text-lg font-semibold tabular-nums ring-1 backdrop-blur",
            urgent ? "bg-ember/20 text-ember ring-ember/40" : "bg-espresso/80 text-crema ring-sand/20",
          )}
        >
          {Math.ceil(left / 1000)}s
        </span>
      </div>

      <div className="flex min-h-10 items-center gap-3">
        {clip === "loading" ? (
          <span className="inline-flex items-center gap-2 text-sm text-crema/60">
            <Headphones className="size-4 animate-pulse" aria-hidden /> Carico il brano…
          </span>
        ) : clip === "blocked" ? (
          <button
            type="button"
            onClick={onReplay}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-5 py-2.5 text-sm font-bold text-ink"
          >
            <Play className="size-4" aria-hidden /> Ascolta
          </button>
        ) : clip === "error" ? (
          <span className="text-sm text-ember">Il brano non si è caricato: prova a indovinare lo stesso.</span>
        ) : (
          <>
            <ClipBar playing={clip === "playing"} clipMs={clipMs} />
            <button
              type="button"
              onClick={onReplay}
              disabled={clip === "playing"}
              className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium text-crema/80 ring-1 ring-sand/20 transition hover:bg-crema/[0.06] hover:text-crema disabled:opacity-40"
            >
              <RotateCcw className="size-3.5" aria-hidden /> Riascolta
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ClipBar({ playing, clipMs }: { playing: boolean; clipMs: number }) {
  return (
    <span className="relative h-1.5 w-28 overflow-hidden rounded-full bg-crema/10">
      <motion.span
        key={playing ? "on" : "off"}
        initial={{ width: playing ? "0%" : "100%" }}
        animate={{ width: "100%" }}
        transition={{ duration: playing ? clipMs / 1000 : 0, ease: "linear" }}
        className="absolute inset-y-0 left-0 rounded-full bg-caramel"
      />
    </span>
  );
}

/* ───────── risposte ───────── */

const LETTERS = ["A", "B", "C", "D"];

export function AnswerGrid({
  options,
  disabled,
  picked,
  correctIndex,
  onPick,
}: {
  options: string[];
  disabled: boolean;
  picked: number | null;
  correctIndex?: number | null;
  onPick: (i: number) => void;
}) {
  const revealed = correctIndex != null && correctIndex >= 0;
  return (
    <div className="grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2">
      {options.map((opt, i) => {
        const isRight = revealed && i === correctIndex;
        const isWrongPick = revealed && picked === i && i !== correctIndex;
        const isPicked = !revealed && picked === i;
        return (
          <motion.button
            key={`${i}-${opt}`}
            type="button"
            disabled={disabled}
            onClick={() => onPick(i)}
            whileTap={disabled ? undefined : { scale: 0.97 }}
            animate={isWrongPick ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }}
            transition={{ duration: 0.35 }}
            className={cn(
              "group flex min-h-16 min-w-0 items-center gap-3 rounded-2xl px-4 py-3 text-left ring-1 transition-colors",
              isRight
                ? "bg-emerald-500/15 text-crema ring-emerald-400/60"
                : isWrongPick
                  ? "bg-ember/15 text-crema ring-ember/60"
                  : isPicked
                    ? "bg-caramel/20 text-crema ring-caramel/60"
                    : revealed
                      ? "bg-roast/50 text-crema/45 ring-sand/10"
                      : "bg-roast/80 text-crema ring-sand/15 hover:bg-mocha/70 hover:ring-caramel/45",
            )}
          >
            <span
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-xl font-display text-lg font-semibold",
                isRight ? "bg-emerald-400 text-ink" : isWrongPick ? "bg-ember text-ink" : "bg-crema/[0.07] text-caramel group-hover:bg-caramel/20",
              )}
            >
              {isRight ? <Check className="size-5" aria-hidden /> : isWrongPick ? <X className="size-5" aria-hidden /> : LETTERS[i]}
            </span>
            <span className="min-w-0 text-[0.95rem] font-medium leading-snug [overflow-wrap:anywhere]">{opt}</span>
          </motion.button>
        );
      })}
    </div>
  );
}

/* ───────── la canzone giusta, dopo la risposta ───────── */

export function RevealCard({
  show,
  correct,
  timeout,
  points,
  title,
  artist,
  cover,
  children,
}: {
  show: boolean;
  correct: boolean;
  timeout?: boolean;
  points: number;
  title: string;
  artist: string;
  cover?: string;
  children?: React.ReactNode;
}) {
  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          initial={{ opacity: 0, y: 14, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ type: "spring", stiffness: 260, damping: 24 }}
          className={cn(
            "flex w-full items-center gap-4 rounded-3xl p-4 ring-1",
            correct ? "bg-emerald-500/10 ring-emerald-400/40" : "bg-roast/80 ring-sand/15",
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cover || "/images/logo-disco.png"} alt="" className="size-16 shrink-0 rounded-xl object-cover ring-1 ring-sand/15" />
          <div className="min-w-0 flex-1">
            <p className={cn("text-xs font-semibold uppercase tracking-[0.18em]", correct ? "text-emerald-300" : timeout ? "text-crema/55" : "text-ember")}>
              {correct ? "Giusto!" : timeout ? "Tempo scaduto" : "Sbagliato"}
            </p>
            <p className="mt-0.5 truncate font-display text-xl font-semibold text-crema">{title}</p>
            <p className="truncate text-sm text-crema/60">{artist}</p>
          </div>
          {correct ? (
            <motion.span
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 14, delay: 0.1 }}
              className="shrink-0 font-display text-3xl font-semibold tabular-nums text-emerald-300"
            >
              +{points}
            </motion.span>
          ) : null}
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/** Pallini dell'avanzamento: verdi le giuste, rossi gli errori, il cerchio pieno è la domanda attuale. */
export function RoundDots({ total, current, results }: { total: number; current: number; results: (boolean | null)[] }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`Domanda ${current + 1} di ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 rounded-full transition-all duration-300",
            i === current ? "w-6 bg-caramel" : "w-1.5",
            i !== current && results[i] === true && "bg-emerald-400",
            i !== current && results[i] === false && "bg-ember/80",
            i !== current && results[i] == null && "bg-crema/15",
          )}
        />
      ))}
    </div>
  );
}
