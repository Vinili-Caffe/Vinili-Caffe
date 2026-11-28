"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Copy, FastForward, Loader2, Pause, Play, Search, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { clipSource } from "@/lib/clipCache";
import { activityShare, isDiscordActivity } from "@/lib/discordActivity";
import { reportLive } from "@/lib/activityLive";
import {
  coverImageUrl,
  guessDaily,
  loadDailyKindMe,
  loadDailyToday,
  readLocalDaily,
  searchDaily,
  writeLocalDaily,
  type DailyGuess,
  type DailyHit,
  type DailyKind,
  type DailyState,
  type DailyToday,
} from "@/lib/daily";
import { page } from "@/lib/site";
import { cn } from "@/lib/cn";
import { celebrate } from "@/lib/confetti";
import { CoverRevealSlider } from "./CoverRevealSlider";
import { SplitFlapCountdown } from "./SplitFlapCountdown";
import { QuizRewardNote, type QuizReward } from "@/components/number-quiz/QuizRewardNote";

const NAME: Record<DailyKind, string> = { song: "Canzone del giorno", cover: "Copertina del giorno" };
const HREF: Record<DailyKind, string> = { song: "/quiz/canzone/", cover: "/quiz/copertina/" };

/* nell'Attività di Discord le immagini esterne sono bloccate: passano dal nostro server */
function proxied(url: string) {
  if (!url || typeof window === "undefined" || !isDiscordActivity()) return url;
  return `/webhooks/site-number-quiz/img?u=${encodeURIComponent(url)}`;
}

/**
 * Canzone del giorno (si sente sempre di più a ogni errore) e Copertina del giorno (si schiarisce a ogni errore).
 * Uguali per tutti, una partita al giorno; con l'accesso vale su ogni dispositivo.
 */
export function DailyMusicGame({ kind }: { kind: DailyKind }) {
  const { token, ready: authReady } = useAuth();
  const [today, setToday] = useState<DailyToday | null>(null);
  const [raw, setRaw] = useState<DailyGuess[]>([]);
  const [state, setState] = useState<DailyState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reward, setReward] = useState<QuizReward>(null);

  /* la partita di oggi: dal browser e, con l'accesso, dal server */
  useEffect(() => {
    if (!authReady) return;
    let alive = true;
    void (async () => {
      const t = await loadDailyToday(kind);
      if (!alive) return;
      if (!t) return setError("Il gioco di oggi non è ancora pronto: riprova tra poco.");
      setToday(t);
      let guesses = readLocalDaily(kind, t.day) || [];
      if (token) {
        const me = await loadDailyKindMe(token, kind);
        if (!alive) return;
        const remote = me?.game;
        if (remote && (remote.done || remote.guesses.length > guesses.length)) {
          /* i tentativi veri li tiene il server: qui serve solo quanti sono */
          guesses = remote.guesses.map(() => ({ skip: true }));
          writeLocalDaily(kind, t.day, guesses);
          setRaw(guesses);
          setState(remote);
          return;
        }
      }
      setRaw(guesses);
      if (guesses.length) {
        const s = await guessDaily(token, kind, t.day, guesses);
        if (alive && s) setState(s);
      }
    })();
    return () => {
      alive = false;
    };
  }, [kind, token, authReady]);

  const used = state?.guesses.length ?? raw.length;
  const done = Boolean(state?.done);
  const max = today?.maxAttempts || 6;

  useEffect(() => {
    if (!today) return;
    reportLive({ game: kind === "song" ? "canzone" : "copertina", mode: "daily", attempts: used, max, solved: Boolean(state?.solved), done });
  }, [kind, today, used, max, state?.solved, done]);

  const send = useCallback(
    async (g: DailyGuess) => {
      if (!today || done || busy) return;
      const next = [...raw, g];
      setBusy(true);
      const s = await guessDaily(token, kind, today.day, next);
      setBusy(false);
      if (!s) return setError("Non riesco a inviare il tentativo, riprova.");
      setError("");
      setRaw(next);
      writeLocalDaily(kind, today.day, next);
      setState(s);
      if (s.reward) setReward(s.reward);
      /* coriandoli solo quando indovini adesso (non quando riapri la pagina) */
      if (s.solved) window.setTimeout(() => celebrate(true), 350);
    },
    [today, done, busy, raw, token, kind],
  );

  if (error && !today) return <p className="mx-auto max-w-md rounded-3xl bg-roast/80 p-6 text-center text-sm text-crema/70 ring-1 ring-sand/12">{error}</p>;
  if (!today) {
    return (
      <div className="grid place-items-center py-16">
        <Loader2 className="size-7 animate-spin text-caramel" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-20">
      <p className="mb-4 text-center text-sm text-crema/60">
        {NAME[kind]} <b className="text-crema">#{today.number}</b> · uguale per tutti, cambia a mezzanotte
      </p>

      {kind === "song" ? <SongPlayer today={today} used={used} done={done} /> : <CoverView today={today} used={used} state={state} />}

      {/* tentativi */}
      <ol className="mx-auto mt-5 grid max-w-md gap-1.5">
        {Array.from({ length: max }, (_, i) => {
          const g = state?.guesses[i];
          return (
            <li
              key={i}
              className={cn(
                "flex h-10 items-center gap-2 rounded-xl px-3 text-sm ring-1",
                !g
                  ? "bg-crema/[0.03] text-crema/25 ring-sand/10"
                  : g.result === "hit"
                    ? "bg-emerald-500/15 text-emerald-200 ring-emerald-400/30"
                    : g.result === "artist"
                      ? "bg-[#c9a227]/15 text-[#f0d27a] ring-[#c9a227]/35"
                      : g.result === "skip"
                        ? "bg-crema/[0.05] text-crema/45 ring-sand/12"
                        : "bg-ember/10 text-crema/75 ring-ember/25",
              )}
            >
              <span className="w-5 shrink-0 text-center font-mono text-xs opacity-60">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">
                {!g ? "" : g.result === "skip" ? (kind === "song" ? "Saltato: si sente di più" : "Saltato: si vede di più") : g.label}
              </span>
              {g?.result === "artist" ? <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide">artista giusto</span> : null}
              {g?.result === "hit" ? <Check className="size-4 shrink-0" /> : null}
            </li>
          );
        })}
      </ol>

      {!done ? <GuessBox kind={kind} busy={busy} onPick={(h) => void send({ id: h.id, title: h.title, artist: h.artist })} onSkip={() => void send({ skip: true })} /> : null}
      {error ? <p className="mt-3 text-center text-sm text-ember">{error}</p> : null}

      <AnimatePresence>{done && state ? <Result kind={kind} state={state} reward={reward} /> : null}</AnimatePresence>
    </div>
  );
}

/* ───── la canzone: si sente sempre di più (1, 2, 4, 7, 11, 16 secondi) ───── */
function SongPlayer({ today, used, done }: { today: DailyToday; used: number; done: boolean }) {
  const clips = today.clips || [1, 2, 4, 7, 11, 16];
  const total = clips[clips.length - 1] || 16;
  const length = done ? total : clips[Math.min(used, clips.length - 1)] || 1;
  const audio = useRef<HTMLAudioElement | null>(null);
  const tick = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);

  useEffect(
    () => () => {
      audio.current?.pause();
      window.clearInterval(tick.current);
    },
    [],
  );

  async function toggle() {
    if (!today.preview) return;
    const a = audio.current || new Audio();
    audio.current = a;
    if (playing) {
      a.pause();
      window.clearInterval(tick.current);
      setPlaying(false);
      return;
    }
    const src = await clipSource(today.preview, 4000);
    if (a.dataset.for !== today.preview) {
      a.src = src;
      a.dataset.for = today.preview;
    }
    a.currentTime = 0;
    await a.play().catch(() => null);
    setPlaying(true);
    tick.current = window.setInterval(() => {
      setPos(a.currentTime);
      if (a.currentTime >= length || a.ended) {
        a.pause();
        window.clearInterval(tick.current);
        setPlaying(false);
        setPos(0);
      }
    }, 50);
  }

  return (
    <div className="mx-auto max-w-md rounded-3xl bg-roast/80 p-5 ring-1 ring-sand/12">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => void toggle()}
          aria-label={playing ? "Ferma" : "Ascolta"}
          className="grid size-14 shrink-0 place-items-center rounded-full bg-gradient-to-br from-caramel to-ember text-ink shadow-lg transition hover:scale-105"
        >
          {playing ? <Pause className="size-6" /> : <Play className="ml-0.5 size-6" />}
        </button>
        <div className="min-w-0 flex-1">
          {/* la barra: la parte chiara è quanto puoi ascoltare adesso, le tacche i prossimi tentativi */}
          <div className="relative h-3 overflow-hidden rounded-full bg-crema/[0.07]">
            <div className="absolute inset-y-0 left-0 rounded-full bg-caramel/30" style={{ width: `${(length / total) * 100}%` }} />
            <div className="absolute inset-y-0 left-0 rounded-full bg-caramel" style={{ width: `${(Math.min(pos, length) / total) * 100}%` }} />
            {clips.slice(0, -1).map((c) => (
              <span key={c} className="absolute inset-y-0 w-px bg-espresso/80" style={{ left: `${(c / total) * 100}%` }} />
            ))}
          </div>
          <p className="mt-2 text-xs text-crema/55">
            {done ? "Ora la senti tutta" : `Puoi ascoltare ${length} ${length === 1 ? "secondo" : "secondi"}`}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ───── la copertina: a quadretti, più fini a ogni errore; a fine partita quella vera ───── */
function CoverView({ today, used, state }: { today: DailyToday; used: number; state: DailyState | null }) {
  const levels = today.levels || 6;
  const level = Math.min(used, levels - 1);
  const src = state?.done && state.answer?.cover ? proxied(state.answer.cover) : coverImageUrl(today.day, level);
  return (
    <div className="mx-auto aspect-square w-full max-w-xs overflow-hidden rounded-3xl bg-roast ring-1 ring-sand/15 shadow-[0_24px_50px_-20px_rgba(0,0,0,0.8)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img key={src} src={src} alt="Copertina da indovinare" className="size-full object-cover [image-rendering:pixelated]" />
    </div>
  );
}

/* ───── cerca e scegli: brani per la canzone, album per la copertina (senza immagini, aiuterebbero) ───── */
function GuessBox({ kind, busy, onPick, onSkip }: { kind: DailyKind; busy: boolean; onPick: (h: DailyHit) => void; onSkip: () => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<DailyHit[]>([]);
  const [searching, setSearching] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) {
      setHits([]);
      return;
    }
    const n = ++seq.current;
    setSearching(true);
    const t = window.setTimeout(() => {
      void searchDaily(kind, text).then((r) => {
        if (n !== seq.current) return;
        setHits(r);
        setSearching(false);
      });
    }, 250);
    return () => window.clearTimeout(t);
  }, [q, kind]);

  return (
    <div className="mx-auto mt-4 max-w-md">
      <div className="flex gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">{kind === "song" ? "Cerca il brano" : "Cerca l'album"}</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-crema/45" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={kind === "song" ? "Scrivi titolo o artista…" : "Scrivi album o artista…"}
            className="h-12 w-full rounded-2xl border-0 bg-roast/90 pl-11 pr-10 text-sm text-crema outline-none ring-1 ring-sand/20 placeholder:text-crema/35 focus:ring-2 focus:ring-caramel/60"
          />
          {q ? (
            <button type="button" onClick={() => setQ("")} aria-label="Cancella" className="absolute right-3 top-1/2 -translate-y-1/2 text-crema/45 hover:text-crema">
              <X className="size-4" />
            </button>
          ) : null}
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={onSkip}
          className="inline-flex h-12 shrink-0 items-center gap-1.5 rounded-2xl px-4 text-xs font-bold uppercase tracking-wide text-crema/70 ring-1 ring-sand/20 transition hover:text-crema disabled:opacity-50"
        >
          <FastForward className="size-4" /> Salta
        </button>
      </div>
      {q.trim().length >= 2 ? (
        <ul className="mt-2 overflow-hidden rounded-2xl bg-roast/95 ring-1 ring-sand/15">
          {searching && !hits.length ? (
            <li className="flex items-center justify-center py-4">
              <Loader2 className="size-4 animate-spin text-caramel" />
            </li>
          ) : null}
          {!searching && !hits.length ? <li className="py-4 text-center text-sm text-crema/50">Nessun risultato.</li> : null}
          {hits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  onPick(h);
                  setQ("");
                }}
                className="flex w-full items-baseline gap-2 px-4 py-2.5 text-left text-sm transition hover:bg-crema/[0.06] disabled:opacity-50"
              >
                <span className="min-w-0 truncate font-semibold text-crema">{h.title}</span>
                <span className="min-w-0 shrink truncate text-crema/50">{h.artist}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* ───── fine: la soluzione, il risultato da condividere e l'EXP ───── */
function Result({ kind, state, reward }: { kind: DailyKind; state: DailyState; reward: QuizReward }) {
  const [copied, setCopied] = useState(false);
  const squares = useMemo(
    () => state.guesses.map((g) => (g.result === "hit" ? "🟩" : g.result === "artist" ? "🟨" : g.result === "skip" ? "⬛" : "🟥")).join(""),
    [state.guesses],
  );
  const score = state.solved ? `${state.attempts}/${state.maxAttempts}` : `X/${state.maxAttempts}`;

  function share() {
    const head = `${NAME[kind]} #${state.number} ${score}\n${squares}`;
    if (isDiscordActivity()) return void activityShare(head);
    void navigator.clipboard?.writeText(`${head}\n${window.location.origin}${page(HREF[kind])}`).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "mx-auto mt-6 flex max-w-md flex-col items-center rounded-3xl p-6 text-center ring-1",
        state.solved ? "bg-emerald-500/10 ring-emerald-400/30" : "bg-roast/80 ring-sand/12",
      )}
    >
      <p className={cn("font-display text-3xl", state.solved ? "text-emerald-300" : "text-crema")}>{state.solved ? "Indovinato!" : "Non questa volta"}</p>
      <p className="mt-1 text-sm text-crema/60">{state.solved ? `In ${state.attempts} su ${state.maxAttempts}` : "Tentativi finiti"}</p>
      {state.answer ? (
        <div className="mt-4 flex w-full items-center gap-3 rounded-2xl bg-espresso/60 p-3 text-left ring-1 ring-sand/10">
          {state.answer.cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={proxied(state.answer.cover)} alt="" className="size-14 shrink-0 rounded-xl object-cover" />
          ) : null}
          <div className="min-w-0">
            <p className="truncate font-semibold text-crema">{state.answer.title}</p>
            <p className="truncate text-sm text-crema/60">{state.answer.artist}</p>
          </div>
        </div>
      ) : null}
      {kind === "cover" && state.answer?.cover ? (
        <CoverRevealSlider before={coverImageUrl(state.day, 0)} after={proxied(state.answer.cover)} />
      ) : null}
      <p className="mt-4 text-2xl tracking-[0.15em]">{squares}</p>
      <button
        type="button"
        onClick={share}
        className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-caramel to-ember text-sm font-bold uppercase tracking-wide text-ink"
      >
        <Copy className="size-4" /> {copied ? "Copiato" : "Condividi il risultato"}
      </button>
      <QuizRewardNote reward={reward} />
      <SplitFlapCountdown label={kind === "song" ? "Nuova canzone tra" : "Nuova copertina tra"} />
    </motion.div>
  );
}
