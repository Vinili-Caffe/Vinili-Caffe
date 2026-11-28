"use client";

import { reportLive } from "@/lib/activityLive";
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { Loader2 } from "lucide-react";
import { WordleKeyboard } from "@/components/wordle/WordleKeyboard";
import { DuelIntro, DuelResult, DuelWaiting, OpponentBar, useDuel } from "@/components/duel/DuelParts";
import { upgradeKey, WORD_LEN, type KeyMarks, type Mark } from "@/lib/wordle";
import type { DuelBoard } from "@/lib/duel";
import { cn } from "@/lib/cn";

const tileMark = (m?: Mark) => {
  if (m === "g") return "bg-[#58a64b] text-white ring-[#58a64b]/50";
  if (m === "y") return "bg-[#c9a227] text-ink ring-[#c9a227]/45";
  if (m === "b") return "bg-mocha text-crema/50 ring-sand/10";
  return "bg-mocha/80 text-crema ring-sand/18";
};

function Grid({ board, rows, current, active, small }: { board: DuelBoard; rows: number; current: string; active: boolean; small?: boolean }) {
  return (
    <div className={cn("mx-auto grid w-full gap-1", small ? "max-w-[11rem] sm:max-w-[13rem]" : "max-w-[19rem] gap-1.5 sm:max-w-[22rem] sm:gap-2", board.won && small && "opacity-80")}>
      {Array.from({ length: rows }, (_, r) => {
        const entry = board.rows[r];
        const isCurrent = active && !board.won && r === board.rows.length;
        return (
          <div key={r} className={cn("grid grid-cols-5", small ? "gap-1" : "gap-1.5 sm:gap-2")}>
            {Array.from({ length: WORD_LEN }, (_, c) => {
              const letter = entry ? entry.guess.charAt(c) : isCurrent ? current.charAt(c).toUpperCase() : "";
              const mark = entry?.marks?.[c];
              return (
                <motion.div
                  key={c}
                  initial={false}
                  animate={mark ? { rotateX: [90, 0] } : { rotateX: 0 }}
                  transition={{ duration: 0.35, delay: mark ? c * 0.05 : 0 }}
                  className={cn(
                    "grid aspect-square place-items-center rounded-lg font-mono font-semibold uppercase ring-1",
                    small ? "text-sm sm:text-base" : "text-xl sm:text-2xl",
                    tileMark(mark),
                    !mark && letter && "ring-caramel/60",
                  )}
                >
                  {letter}
                </motion.div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/** una delle quattro griglie del Quordle, con le stesse caselle di quello del giorno */
function QuadGrid({ board, rows, current, active }: { board: DuelBoard; rows: number; current: string; active: boolean }) {
  return (
    <div className={cn("min-w-0", board.won && "rounded-sm p-0.5 ring-1 ring-[#58a64b]/40")}>
      <div className="flex flex-col gap-px">
        {Array.from({ length: rows }, (_, r) => {
          const entry = board.rows[r];
          const isCurrent = active && !board.won && r === board.rows.length;
          return (
            <div key={r} className="grid grid-cols-5 gap-px">
              {Array.from({ length: WORD_LEN }, (_, c) => {
                const letter = entry ? entry.guess.charAt(c) : isCurrent ? current.charAt(c) : "";
                const mark = entry?.marks?.[c];
                const filled = Boolean(letter);
                return (
                  <motion.div
                    key={c}
                    animate={{ scale: filled && !mark ? 1.03 : 1 }}
                    transition={{ type: "spring", stiffness: 420, damping: 22 }}
                    className={cn(
                      "relative grid h-[1.35rem] w-full place-items-center rounded-[3px] font-sans text-xs font-semibold leading-none ring-1 sm:h-[1.55rem] sm:text-xs md:h-[1.7rem] md:text-xs",
                      mark ? tileMark(mark) : filled ? "bg-mocha text-crema ring-sand/30" : "bg-roast/90 text-crema/25 ring-sand/12",
                    )}
                  >
                    <span className="relative block leading-none">{letter}</span>
                  </motion.div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Allenamento o sfida di Wordle (una parola) o Quordle (quattro): le parole le controlla il server */
export function WordleDuel({ game, mode, lang, joinId: joinFrom }: { game: "wordle" | "quad"; mode: "duel" | "practice"; lang: string; joinId?: string | null }) {
  /* dopo «Nuova sfida» non si rientra più in quella del link */
  const [joinId, setJoinId] = useState(joinFrom || null);
  const { state, error, busy, ready, start, guess, reset } = useDuel(game, mode, lang, joinId);
  const [current, setCurrent] = useState("");
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState("");

  /* allenamento: si parte subito */
  useEffect(() => {
    if (mode === "practice" && ready && !state && !busy && !joinId && !error) void start();
  }, [mode, ready, state, busy, joinId, start, error]);

  const boards = useMemo(() => state?.boards || [], [state?.boards]);
  /* Attività: anteprima per gli altri della chiamata (solo colori, niente lettere) */
  useEffect(() => {
    if (!state || state.status === "waiting") return;
    reportLive({
      game,
      mode,
      grids: boards.map((b) => b.rows.map((r) => r.marks)),
      attempts: state.me.attempts,
      max: state.maxAttempts,
      solved: state.me.solved,
      done: state.me.done,
    });
  }, [state, boards, game, mode]);
  const playing = state?.status === "playing" && !state.me.done;

  const keyMarks = useMemo(() => {
    let k: KeyMarks = {};
    for (const b of boards) for (const row of b.rows) row.guess.split("").forEach((ch, i) => (k = upgradeKey(k, ch.toLowerCase(), row.marks[i])));
    return k;
  }, [boards]);

  const submit = useCallback(async () => {
    if (current.length !== WORD_LEN || sending) return;
    setSending(true);
    const r = await guess(current);
    setSending(false);
    if (r.ok) {
      setCurrent("");
      setNote("");
    } else {
      setNote(r.message);
      window.setTimeout(() => setNote(""), 2200);
    }
  }, [current, guess, sending]);

  const onKey = useCallback(
    (key: string) => {
      if (!playing || sending) return;
      if (key === "Enter") return void submit();
      if (key === "Backspace") return setCurrent((c) => c.slice(0, -1));
      const ch = String(key || "").toLowerCase();
      if (/^[a-z]$/.test(ch)) setCurrent((c) => (c.length >= WORD_LEN ? c : c + ch));
    },
    [playing, sending, submit],
  );

  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const t = ev.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (ev.key === "Enter" || ev.key === "Backspace" || /^[a-zA-Z]$/.test(ev.key)) {
        ev.preventDefault();
        onKey(ev.key.length === 1 ? ev.key.toLowerCase() : ev.key);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onKey]);

  function again() {
    setCurrent("");
    setJoinId(null);
    reset();
    if (mode === "practice") window.setTimeout(() => void start(), 0);
  }

  if (error) {
    return (
      <div className="mx-auto max-w-md rounded-3xl bg-roast/80 p-6 text-center text-sm text-crema/70 ring-1 ring-sand/12">
        {error}
        <button type="button" onClick={again} className="mt-4 block w-full rounded-xl py-2 text-xs font-semibold text-caramel ring-1 ring-sand/15">
          {mode === "practice" ? "Riprova" : "Crea una sfida nuova"}
        </button>
      </div>
    );
  }
  if (!state) {
    if (mode === "duel" && ready && !busy && !joinId) return <DuelIntro game={game} busy={busy} onStart={() => void start()} />;
    return (
      <div className="grid place-items-center py-16">
        <Loader2 className="size-7 animate-spin text-caramel" />
      </div>
    );
  }
  if (state.status === "waiting") return <DuelWaiting state={state} />;

  const quad = game === "quad";
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16">
      <OpponentBar state={state} />
      <p className="mb-3 text-center text-xs font-semibold text-crema/50">
        {mode === "practice" ? "Allenamento" : "Sfida"} · tentativo {Math.min(state.me.attempts + (state.me.done ? 0 : 1), state.maxAttempts)} di {state.maxAttempts}
      </p>
      {quad ? (
        /* come il Quordle del giorno: quattro griglie basse e larghe, 2×2 */
        <div className="mx-auto grid w-full max-w-3xl grid-cols-2 gap-x-3 gap-y-3 sm:gap-x-4 sm:gap-y-4">
          {boards.map((b, i) => (
            <QuadGrid key={i} board={b} rows={state.maxAttempts} current={current} active={playing} />
          ))}
        </div>
      ) : (
        boards.map((b, i) => <Grid key={i} board={b} rows={state.maxAttempts} current={current} active={playing} />)
      )}
      <p className={cn("mt-3 h-5 text-center text-sm text-ember", !note && "invisible")} role="status">
        {note || "·"}
      </p>
      {state.status === "finished" || state.me.done ? (
        state.status === "finished" ? (
          <DuelResult state={state} onAgain={again} />
        ) : (
          <p className="mt-4 text-center text-sm text-crema/65">Tentativi finiti: vediamo come va l&apos;avversario…</p>
        )
      ) : (
        <div className="mt-2">
          <WordleKeyboard keyMarks={keyMarks} disabled={!playing || sending} onKey={onKey} compact={quad} />
        </div>
      )}
    </div>
  );
}
