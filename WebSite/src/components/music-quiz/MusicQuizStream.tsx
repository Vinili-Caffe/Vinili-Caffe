"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Crown, Eye, Loader2, MessageSquare, Radio, SkipForward, Trophy } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { preloadClips } from "@/lib/clipCache";
import {
  answerMusicQuizRound,
  startMusicQuizSession,
  MUSIC_QUIZ_ANSWER_MS,
  type MusicQuizDifficulty,
  type MusicQuizPackCard,
  type MusicQuizRound,
} from "@/lib/musicQuiz";
import {
  connectKick,
  connectTwitch,
  connectYoutube,
  kickChannel,
  parseAnswer,
  twitchChannel,
  youtubeChannel,
  type ChatMessage,
  type ChatStatus,
  type StreamPlatform,
} from "@/lib/streamChat";
import { GameStage, QuizTurntable, RoundDots, useCountdown, useQuizClip } from "./QuizStage";

const NEXT_AFTER_MS = 7000;

type Answer = { choice: number; ms: number; user: string };
type Player = { user: string; points: number; correct: number };
type Reveal = { correctIndex: number; title: string; artist: string; cover?: string; winners: Array<{ user: string; points: number }>; counts: number[] };

/** Punti di una risposta giusta: 100 subito, scende fino a 20 allo scadere (come nelle altre modalità). */
const pointsFor = (ms: number, total: number) => Math.round(100 - 80 * Math.max(0, Math.min(1, ms / total)));

const PLATFORMS: Array<{ id: StreamPlatform; label: string; prefix: string; ready: boolean }> = [
  { id: "twitch", label: "Twitch", prefix: "twitch.tv/", ready: true },
  { id: "youtube", label: "YouTube", prefix: "youtube.com/@", ready: true },
  { id: "kick", label: "Kick", prefix: "kick.com/", ready: true },
];

export function MusicQuizStream({
  pack,
  difficulty,
  onExit,
}: {
  pack: MusicQuizPackCard;
  difficulty: MusicQuizDifficulty;
  onExit: () => void;
}) {
  const { token } = useAuth();
  const [platform, setPlatform] = useState<StreamPlatform>("twitch");
  const [channelInput, setChannelInput] = useState("");
  const [channel, setChannel] = useState("");
  const [status, setStatus] = useState<ChatStatus | "idle">("idle");
  const [lastMsg, setLastMsg] = useState<ChatMessage | null>(null);
  const [err, setErr] = useState("");

  const [phase, setPhase] = useState<"setup" | "playing" | "finished">("setup");
  const [session, setSession] = useState<{ id: string; clipMs: number; answerMs: number; total: number } | null>(null);
  const [round, setRound] = useState<MusicQuizRound | null>(null);
  const [next, setNext] = useState<{ round: MusicQuizRound | null; done: boolean } | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [answered, setAnswered] = useState(0);
  const [feed, setFeed] = useState<Array<{ user: string; at: number }>>([]);
  const [players, setPlayers] = useState<Record<string, Player>>({});
  const [history, setHistory] = useState<(boolean | null)[]>([]);

  const answers = useRef(new Map<string, Answer>());
  const live = useRef({ playing: false, startedAt: null as number | null });
  const closeChat = useRef<(() => void) | null>(null);
  const advanceTimer = useRef(0);

  const clipMs = session?.clipMs || 5000;
  const answerMs = session?.answerMs || MUSIC_QUIZ_ANSWER_MS;
  const clip = useQuizClip(round?.previewUrl, clipMs, round ? `${session?.id}-${round.index}` : "none", round?.start);
  const left = useCountdown(clip.startedAt, answerMs, Boolean(round) && !reveal);

  live.current = { playing: phase === "playing" && Boolean(round) && !reveal, startedAt: clip.startedAt };

  useEffect(
    () => () => {
      closeChat.current?.();
      window.clearTimeout(advanceTimer.current);
    },
    [],
  );

  function onChatMessage(m: ChatMessage) {
    setLastMsg(m);
    const { playing, startedAt } = live.current;
    if (!playing || startedAt == null) return;
    const choice = parseAnswer(m.text);
    if (choice == null) return;
    const key = m.user.toLowerCase();
    /* vale solo la prima risposta di ognuno */
    if (answers.current.has(key)) return;
    answers.current.set(key, { choice, ms: Math.max(0, m.at - startedAt), user: m.user });
    setAnswered(answers.current.size);
    setFeed((f) => [{ user: m.user, at: m.at }, ...f].slice(0, 6));
  }

  function connect() {
    setErr("");
    closeChat.current?.();
    setLastMsg(null);

    if (platform === "twitch") {
      const name = twitchChannel(channelInput);
      if (!name) return setErr("Scrivi il nome del canale Twitch, per esempio «viniliecaffe».");
      setChannel(name);
      closeChat.current = connectTwitch(name, onChatMessage, setStatus);
      return;
    }

    if (!token) return setErr("Accedi con Discord per collegare YouTube o Kick.");

    if (platform === "youtube") {
      const name = youtubeChannel(channelInput);
      if (!name) return setErr("Scrivi l’@ del canale YouTube o il link della diretta.");
      setChannel(name);
      closeChat.current = connectYoutube(name, token, onChatMessage, setStatus, setErr);
      return;
    }

    const name = kickChannel(channelInput);
    if (!name) return setErr("Scrivi il nome del canale Kick, per esempio «xqc».");
    setChannel(name);
    closeChat.current = connectKick(name, token, onChatMessage, setStatus, setErr);
  }

  async function start() {
    if (!token) return;
    setErr("");
    const r = await startMusicQuizSession(token, { slug: pack.slug, difficulty, mode: "stream" });
    if (!r.ok) return setErr(r.message);
    preloadClips(r.data.upcoming || [r.data.round.previewUrl]);
    setSession({ id: r.data.sessionId, clipMs: r.data.clipMs, answerMs: r.data.answerMs || MUSIC_QUIZ_ANSWER_MS, total: r.data.round.total || 10 });
    setPlayers({});
    setHistory([]);
    beginRound(r.data.round);
    setPhase("playing");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function beginRound(r: MusicQuizRound) {
    answers.current = new Map();
    setAnswered(0);
    setFeed([]);
    setReveal(null);
    setNext(null);
    setRound(r);
  }

  async function doReveal() {
    if (!token || !session || !round || reveal || revealing) return;
    setRevealing(true);
    clip.stop();
    /* lo streamer non gioca: chiede al server la risposta giusta (nessun punto per lui) */
    const r = await answerMusicQuizRound(token, { sessionId: session.id, index: round.index, choice: -1, ms: answerMs });
    setRevealing(false);
    if (!r.ok) return setErr(r.message);
    const correctIndex = r.data.correctIndex;
    const counts = [0, 0, 0, 0];
    const winners: Array<{ user: string; points: number }> = [];
    for (const a of answers.current.values()) {
      counts[a.choice] = (counts[a.choice] || 0) + 1;
      if (a.choice === correctIndex) winners.push({ user: a.user, points: pointsFor(a.ms, answerMs) });
    }
    winners.sort((x, y) => y.points - x.points);
    setPlayers((prev) => {
      const out = { ...prev };
      for (const [key, a] of answers.current) out[key] = out[key] || { user: a.user, points: 0, correct: 0 };
      for (const w of winners) {
        const key = w.user.toLowerCase();
        out[key] = { user: w.user, points: (out[key]?.points || 0) + w.points, correct: (out[key]?.correct || 0) + 1 };
      }
      return out;
    });
    setHistory((h) => [...h, winners.length > 0]);
    setReveal({ correctIndex, title: r.data.title, artist: r.data.artist, cover: r.data.cover, winners, counts });
    setNext({ round: r.data.nextRound, done: r.data.done || !r.data.nextRound });
  }

  function advance() {
    window.clearTimeout(advanceTimer.current);
    if (!next) return;
    if (next.done || !next.round) {
      setPhase("finished");
      setRound(null);
      return;
    }
    beginRound(next.round);
  }

  /* tempo finito: si rivela da solo */
  useEffect(() => {
    if (left <= 0 && clip.startedAt != null && !reveal && phase === "playing") void doReveal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);

  useEffect(() => {
    if (!reveal) return;
    advanceTimer.current = window.setTimeout(advance, NEXT_AFTER_MS);
    return () => window.clearTimeout(advanceTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal]);

  const ranking = useMemo(() => Object.values(players).filter((p) => p.points > 0).sort((a, b) => b.points - a.points), [players]);

  /* ---------- schermata iniziale: collega la chat ---------- */
  if (phase === "setup") {
    const p = PLATFORMS.find((x) => x.id === platform)!;
    return (
      <div className="mx-auto max-w-3xl space-y-6 px-4 pb-20 pt-24 sm:pt-28">
        <button type="button" onClick={onExit} className="inline-flex items-center gap-1.5 text-sm text-crema/60 transition hover:text-crema">
          <ArrowLeft className="size-4" aria-hidden /> Torna al quiz
        </button>
        <section className="rounded-[2rem] bg-gradient-to-br from-mocha to-roast p-6 ring-1 ring-sand/15 sm:p-8">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-caramel">
            <Radio className="size-3.5" aria-hidden /> In diretta
          </p>
          <h1 className="mt-2 font-display text-4xl font-semibold text-crema">{pack.title}</h1>
          <p className="mt-2 text-crema/65">
            Collega la chat della tua live: chi guarda risponde scrivendo in chat <b className="text-crema">1</b>, <b className="text-crema">2</b>, <b className="text-crema">3</b> o{" "}
            <b className="text-crema">4</b>. Conta solo la prima risposta di ognuno, e chi è più veloce prende più punti.
          </p>

          <div className="mt-6 grid grid-cols-3 gap-2">
            {PLATFORMS.map((x) => (
              <button
                key={x.id}
                type="button"
                disabled={!x.ready}
                onClick={() => setPlatform(x.id)}
                className={cn(
                  "relative rounded-2xl px-3 py-3 text-sm font-bold transition disabled:cursor-not-allowed",
                  platform === x.id ? "bg-crema text-ink" : "bg-crema/[0.06] text-crema/80 hover:bg-crema/[0.1]",
                  !x.ready && "opacity-45",
                )}
              >
                {x.label}
                {!x.ready ? <span className="mt-0.5 block text-[0.65rem] font-semibold uppercase tracking-wider opacity-70">in arrivo</span> : null}
              </button>
            ))}
          </div>

          <form
            className="mt-3 flex items-center gap-2 rounded-2xl bg-espresso/80 p-1.5 pl-4 ring-1 ring-sand/20 focus-within:ring-2 focus-within:ring-caramel/60"
            onSubmit={(e) => {
              e.preventDefault();
              connect();
            }}
          >
            <span className="shrink-0 text-crema/50">{p.prefix}</span>
            <input
              value={channelInput}
              onChange={(e) => setChannelInput(e.target.value)}
              placeholder="nome del canale"
              className="min-w-0 flex-1 bg-transparent py-2 text-crema outline-none placeholder:text-crema/30"
            />
            <button type="submit" disabled={!channelInput.trim()} className="rounded-xl bg-caramel px-4 py-2 text-sm font-bold text-ink transition hover:brightness-110 disabled:opacity-40">
              {status === "connecting" ? "Collego…" : channel && status === "connected" ? "Cambia" : "Collega"}
            </button>
          </form>

          {channel ? (
            <div className="mt-3 flex items-center gap-2.5 rounded-2xl bg-ink/30 px-4 py-3 text-sm">
              <span className={cn("size-2.5 shrink-0 rounded-full", status === "connected" ? "bg-emerald-400" : status === "error" ? "bg-ember" : "animate-pulse bg-caramel")} />
              <span className="min-w-0 flex-1 truncate text-crema/75">
                {status === "connected"
                  ? lastMsg
                    ? <>Chat collegata · <b className="text-crema">{lastMsg.user}</b>: {lastMsg.text}</>
                    : <>Chat di <b className="text-crema">{channel}</b> collegata: aspetto il primo messaggio…</>
                  : status === "error"
                    ? "Non riesco a collegarmi alla chat, riprovo…"
                    : "Mi collego alla chat…"}
              </span>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => void start()}
            disabled={status !== "connected"}
            className="mt-6 w-full rounded-full bg-gradient-to-r from-caramel to-ember px-6 py-3.5 font-bold text-ink transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-40"
          >
            Inizia la partita
          </button>
          {err ? <p className="mt-3 text-center text-sm text-ember">{err}</p> : null}
        </section>
        <p className="text-center text-xs leading-relaxed text-crema/45">
          Consiglio: aggiungi questa finestra alla live (in OBS come «Cattura finestra» o «Sorgente browser») così la chat vede domande e risposte. La chat si legge soltanto, non scriviamo nulla.
        </p>
      </div>
    );
  }

  /* ---------- fine: classifica della chat ---------- */
  if (phase === "finished") {
    const [first, second, third] = ranking;
    return (
      <div className="mx-auto max-w-3xl space-y-6 px-4 pb-20 pt-24 sm:pt-28">
        <section className="rounded-[2rem] bg-gradient-to-br from-mocha to-roast p-6 text-center ring-1 ring-sand/15 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-caramel">{pack.title} · fine</p>
          <h1 className="mt-2 font-display text-4xl font-semibold text-crema">Classifica della chat</h1>
          {!ranking.length ? (
            <p className="mt-6 text-crema/60">Nessuno ha indovinato questa volta.</p>
          ) : (
            <div className="mt-8 flex items-end justify-center gap-3">
              {[second, first, third].map((p, i) =>
                p ? (
                  <motion.div
                    key={p.user}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 + i * 0.15 }}
                    className="flex w-28 flex-col items-center sm:w-36"
                  >
                    {i === 1 ? <Crown className="mb-1 size-6 text-caramel" aria-hidden /> : null}
                    <p className="w-full truncate font-semibold text-crema">{p.user}</p>
                    <p className="text-sm tabular-nums text-caramel">{p.points} punti</p>
                    <div
                      className={cn(
                        "mt-2 grid w-full place-items-center rounded-t-2xl font-display text-3xl font-semibold text-ink",
                        i === 1 ? "h-28 bg-caramel" : i === 0 ? "h-20 bg-crema/70" : "h-14 bg-ember/70",
                      )}
                    >
                      {i === 1 ? 1 : i === 0 ? 2 : 3}
                    </div>
                  </motion.div>
                ) : (
                  <div key={i} className="w-28 sm:w-36" />
                ),
              )}
            </div>
          )}
          {ranking.length > 3 ? (
            <ol className="mx-auto mt-6 max-w-md space-y-1 text-left" start={4}>
              {ranking.slice(3, 10).map((p, i) => (
                <li key={p.user} className="flex items-center gap-3 rounded-xl bg-crema/[0.05] px-3 py-2 text-sm">
                  <span className="w-5 tabular-nums text-crema/45">{i + 4}</span>
                  <span className="min-w-0 flex-1 truncate text-crema">{p.user}</span>
                  <span className="tabular-nums text-caramel">{p.points}</span>
                </li>
              ))}
            </ol>
          ) : null}
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={() => void start()} className="rounded-full bg-gradient-to-r from-caramel to-ember px-6 py-3 font-bold text-ink transition hover:-translate-y-0.5">
              Un&apos;altra partita
            </button>
            <button type="button" onClick={onExit} className="rounded-full px-5 py-3 text-sm font-semibold text-crema/80 ring-1 ring-sand/25 transition hover:bg-crema/[0.06]">
              Torna al quiz
            </button>
          </div>
        </section>
      </div>
    );
  }

  /* ---------- partita ---------- */
  if (!round || !session) return null;
  const totalAnswers = reveal ? reveal.counts.reduce((a, b) => a + b, 0) : answered;
  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:pt-28">
      <GameStage
        cover={pack.cover}
        top={
          <>
            <span className="inline-flex min-w-0 items-center gap-2 text-sm text-crema/70">
              <span className={cn("size-2 shrink-0 rounded-full", status === "connected" ? "bg-emerald-400" : "animate-pulse bg-ember")} />
              <span className="truncate">
                {PLATFORMS.find((x) => x.id === platform)?.label} · <b className="text-crema">{channel}</b>
              </span>
            </span>
            <RoundDots total={session.total} current={round.index} results={history} />
            <button type="button" onClick={onExit} className="text-sm font-semibold text-crema/55 hover:text-crema">
              Esci
            </button>
          </>
        }
        side={<QuizTurntable cover={pack.cover} clip={clip.state} clipMs={clipMs} left={reveal ? answerMs : left} totalMs={answerMs} onReplay={clip.replay} />}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-caramel">
            Domanda {round.index + 1} di {session.total}
          </p>
          <p className="inline-flex items-center gap-1.5 text-sm text-crema/70">
            <MessageSquare className="size-4" aria-hidden /> {totalAnswers} {totalAnswers === 1 ? "risposta" : "risposte"}
          </p>
        </div>
        <h2 className="font-display text-3xl font-semibold text-crema sm:text-4xl">
          {reveal ? "Era questa!" : <>Scrivi in chat il <span className="text-caramel">numero</span></>}
        </h2>

        <div className="grid gap-2.5">
          {round.options.map((opt, i) => {
            const right = reveal && i === reveal.correctIndex;
            const share = reveal && totalAnswers ? Math.round(((reveal.counts[i] || 0) / totalAnswers) * 100) : 0;
            return (
              <div
                key={`${i}-${opt}`}
                className={cn(
                  "relative flex min-h-16 items-center gap-4 overflow-hidden rounded-2xl px-4 py-3 ring-1 transition-colors",
                  right ? "bg-emerald-500/15 ring-emerald-400/60" : reveal ? "bg-roast/50 ring-sand/10" : "bg-roast/80 ring-sand/15",
                )}
              >
                {reveal ? (
                  <motion.span
                    aria-hidden
                    initial={{ width: 0 }}
                    animate={{ width: `${share}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className={cn("absolute inset-y-0 left-0", right ? "bg-emerald-400/15" : "bg-crema/[0.05]")}
                  />
                ) : null}
                <span
                  className={cn(
                    "relative grid size-11 shrink-0 place-items-center rounded-xl font-display text-2xl font-semibold",
                    right ? "bg-emerald-400 text-ink" : "bg-caramel/15 text-caramel",
                  )}
                >
                  {i + 1}
                </span>
                <span className={cn("relative min-w-0 flex-1 text-lg font-medium leading-snug [overflow-wrap:anywhere]", reveal && !right ? "text-crema/45" : "text-crema")}>
                  {opt}
                </span>
                {reveal ? <span className="relative shrink-0 text-sm tabular-nums text-crema/60">{share}%</span> : null}
              </div>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          {reveal ? (
            <motion.div key="reveal" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl bg-ink/30 p-4 ring-1 ring-sand/10">
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={reveal.cover || pack.cover || "/images/logo-disco.png"} alt="" className="size-14 shrink-0 rounded-xl object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-xl font-semibold text-crema">{reveal.title}</p>
                  <p className="truncate text-sm text-crema/60">{reveal.artist}</p>
                </div>
                <button type="button" onClick={advance} className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-crema/[0.08] px-4 py-2 text-sm font-semibold text-crema hover:bg-crema/[0.14]">
                  Avanti <SkipForward className="size-4" aria-hidden />
                </button>
              </div>
              <p className="mt-3 text-sm text-crema/70">
                {reveal.winners.length ? (
                  <>
                    <Trophy className="mr-1 inline size-4 text-caramel" aria-hidden />
                    {reveal.winners.slice(0, 5).map((w, i) => (
                      <span key={w.user}>
                        {i ? ", " : ""}
                        <b className="text-crema">{w.user}</b> +{w.points}
                      </span>
                    ))}
                    {reveal.winners.length > 5 ? ` e altri ${reveal.winners.length - 5}` : ""}
                  </>
                ) : (
                  "Nessuno ha indovinato."
                )}
              </p>
            </motion.div>
          ) : (
            <motion.div key="live" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                <AnimatePresence initial={false}>
                  {feed.map((f) => (
                    <motion.span
                      key={`${f.user}-${f.at}`}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      className="rounded-full bg-crema/[0.07] px-2.5 py-1 text-xs text-crema/75"
                    >
                      {f.user} ha risposto
                    </motion.span>
                  ))}
                </AnimatePresence>
              </div>
              <button
                type="button"
                onClick={() => void doReveal()}
                disabled={revealing || clip.startedAt == null}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-crema/[0.08] px-4 py-2 text-sm font-semibold text-crema transition hover:bg-crema/[0.14] disabled:opacity-40"
              >
                {revealing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Eye className="size-4" aria-hidden />} Mostra la risposta
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        {err ? <p className="text-sm text-ember">{err}</p> : null}
      </GameStage>

      {ranking.length ? (
        <section className="mt-6 rounded-3xl bg-roast/60 p-4 ring-1 ring-sand/10">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-crema/55">Classifica della chat</h3>
          <ol className="flex flex-wrap gap-2">
            {ranking.slice(0, 8).map((p, i) => (
              <li key={p.user} className={cn("flex items-center gap-2 rounded-full px-3 py-1.5 text-sm", i === 0 ? "bg-caramel/20 text-caramel" : "bg-crema/[0.06] text-crema/80")}>
                <span className="tabular-nums opacity-60">{i + 1}</span>
                <span className="max-w-[10rem] truncate font-semibold">{p.user}</span>
                <span className="tabular-nums">{p.points}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
