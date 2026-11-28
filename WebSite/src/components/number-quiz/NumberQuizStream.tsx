"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Crown, Flame, MessageSquare, Timer, Users, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import {
  connectKick,
  connectTwitch,
  connectYoutube,
  kickChannel,
  twitchChannel,
  youtubeChannel,
  type ChatMessage,
  type ChatStatus,
  type StreamPlatform,
} from "@/lib/streamChat";
import { formatCount, formatNumberQuizValue, type NumberQuizItem } from "@/lib/numberQuiz";
import { Backdrop, CountUp, GameOver, HC_ROUNDS, Pill, Shell, heat, useDeck, type Loaded } from "./NumberQuizPlay";

const HL_VOTE_MS = 15_000;
const HC_VOTE_MS = 25_000;

const PLATFORMS: Array<{ id: StreamPlatform; label: string; prefix: string }> = [
  { id: "twitch", label: "Twitch", prefix: "twitch.tv/" },
  { id: "youtube", label: "YouTube", prefix: "youtube.com/@" },
  { id: "kick", label: "Kick", prefix: "kick.com/" },
];

/* ───────────── chat ───────────── */

export type StreamChat = ReturnType<typeof useStreamChat>;

/** Collegamento alla chat della live: resta aperto tra una partita e l'altra. */
export function useStreamChat() {
  const { token } = useAuth();
  const [platform, setPlatform] = useState<StreamPlatform>("twitch");
  const [input, setInput] = useState("");
  const [channel, setChannel] = useState("");
  const [status, setStatus] = useState<ChatStatus | "idle">("idle");
  const [lastMsg, setLastMsg] = useState<ChatMessage | null>(null);
  const [err, setErr] = useState("");
  const listeners = useRef(new Set<(m: ChatMessage) => void>());
  const close = useRef<(() => void) | null>(null);

  useEffect(() => () => close.current?.(), []);

  const onMessage = useCallback((m: ChatMessage) => {
    setLastMsg(m);
    listeners.current.forEach((fn) => fn(m));
  }, []);

  function connect() {
    setErr("");
    close.current?.();
    setLastMsg(null);
    if (platform === "twitch") {
      const name = twitchChannel(input);
      if (!name) return setErr("Scrivi il nome del canale Twitch.");
      setChannel(name);
      close.current = connectTwitch(name, onMessage, setStatus);
      return;
    }
    if (!token) return setErr("Accedi con Discord per collegare YouTube o Kick.");
    if (platform === "youtube") {
      const name = youtubeChannel(input);
      if (!name) return setErr("Scrivi l'@ del canale YouTube o il link della diretta.");
      setChannel(name);
      close.current = connectYoutube(name, token, onMessage, setStatus, setErr);
      return;
    }
    const name = kickChannel(input);
    if (!name) return setErr("Scrivi il nome del canale Kick.");
    setChannel(name);
    close.current = connectKick(name, token, onMessage, setStatus, setErr);
  }

  const subscribe = useCallback((fn: (m: ChatMessage) => void) => {
    listeners.current.add(fn);
    return () => void listeners.current.delete(fn);
  }, []);

  return { platform, setPlatform, input, setInput, channel, status, lastMsg, err, connect, subscribe, ready: status === "connected" };
}

export function ChatPanel({ chat }: { chat: StreamChat }) {
  const p = PLATFORMS.find((x) => x.id === chat.platform) || PLATFORMS[0]!;
  return (
    <motion.section
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="mt-4 rounded-3xl bg-roast/85 p-5 ring-1 ring-sand/15">
        <p className="flex items-center gap-2 font-display text-xl text-crema">
          <MessageSquare className="size-5 text-caramel" /> Collega la chat della live
        </p>
        <p className="mt-1 text-sm text-crema/60">
          Chi guarda gioca scrivendo in chat: <b className="text-crema">1</b> o <b className="text-crema">2</b> in «Più o meno», il numero in «Caldo o freddo».
          Si legge soltanto, non scriviamo niente in chat.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {PLATFORMS.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => chat.setPlatform(x.id)}
              className={cn(
                "rounded-2xl px-3 py-2.5 text-sm font-bold transition",
                chat.platform === x.id ? "bg-crema text-ink" : "bg-crema/[0.06] text-crema/80 hover:bg-crema/[0.1]",
              )}
            >
              {x.label}
            </button>
          ))}
        </div>
        <form
          className="mt-3 flex items-center gap-2 rounded-2xl bg-espresso/80 p-1.5 pl-4 ring-1 ring-sand/20 focus-within:ring-2 focus-within:ring-caramel/60"
          onSubmit={(e) => {
            e.preventDefault();
            chat.connect();
          }}
        >
          <span className="shrink-0 text-sm text-crema/50">{p.prefix}</span>
          <input
            value={chat.input}
            onChange={(e) => chat.setInput(e.target.value)}
            placeholder="nome del canale"
            className="min-w-0 flex-1 bg-transparent py-2 text-crema outline-none placeholder:text-crema/30"
          />
          <button type="submit" disabled={!chat.input.trim()} className="rounded-xl bg-caramel px-4 py-2 text-sm font-bold text-ink transition hover:brightness-110 disabled:opacity-40">
            {chat.status === "connecting" ? "Collego…" : chat.channel && chat.ready ? "Cambia" : "Collega"}
          </button>
        </form>
        {chat.channel ? (
          <div className="mt-3 flex items-center gap-2.5 rounded-2xl bg-ink/30 px-4 py-3 text-sm">
            <span className={cn("size-2.5 shrink-0 rounded-full", chat.ready ? "bg-emerald-400" : chat.status === "error" ? "bg-ember" : "animate-pulse bg-caramel")} />
            <span className="min-w-0 flex-1 truncate text-crema/75">
              {chat.ready ? (
                chat.lastMsg ? (
                  <>
                    Chat collegata · <b className="text-crema">{chat.lastMsg.user}</b>: {chat.lastMsg.text}
                  </>
                ) : (
                  <>
                    Chat di <b className="text-crema">{chat.channel}</b> collegata: aspetto il primo messaggio…
                  </>
                )
              ) : chat.status === "error" ? (
                "Non riesco a collegarmi alla chat, riprovo…"
              ) : (
                "Mi collego alla chat…"
              )}
            </span>
          </div>
        ) : null}
        {chat.err ? <p className="mt-3 text-sm text-ember">{chat.err}</p> : null}
        <p className="mt-3 text-xs text-crema/40">Consiglio: aggiungi questa finestra alla live (in OBS «Cattura finestra») così la chat vede le carte.</p>
      </div>
    </motion.section>
  );
}

/* ───────────── pezzi comuni dello stream ───────────── */

type Viewer = { user: string; points: number; correct: number };

function useCountdown(deadline: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadline) return;
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [deadline]);
  return deadline ? Math.max(0, deadline - now) : 0;
}

function addPoints(prev: Record<string, Viewer>, list: Array<{ user: string; points: number; correct?: boolean }>) {
  const out = { ...prev };
  for (const x of list) {
    const k = x.user.toLowerCase();
    const v = out[k] || { user: x.user, points: 0, correct: 0 };
    out[k] = { user: v.user, points: v.points + x.points, correct: v.correct + (x.correct ? 1 : 0) };
  }
  return out;
}

function Ranking({ viewers, limit = 10 }: { viewers: Record<string, Viewer>; limit?: number }) {
  const list = Object.values(viewers)
    .sort((a, b) => b.points - a.points)
    .slice(0, limit);
  if (!list.length) return <p className="mt-4 text-sm text-crema/50">Nessuno ha fatto punti questa volta.</p>;
  return (
    <ol className="mt-4 space-y-1.5 text-left">
      {list.map((v, i) => (
        <li key={v.user} className={cn("flex items-center gap-3 rounded-xl px-3 py-2", i === 0 ? "bg-caramel/20 ring-1 ring-caramel/40" : "bg-crema/[0.04]")}>
          <span className="w-5 text-center font-mono text-sm font-bold text-crema/60">{i === 0 ? <Crown className="size-4 text-caramel" /> : i + 1}</span>
          <span className="min-w-0 flex-1 truncate font-semibold text-crema">{v.user}</span>
          <span className="font-mono text-sm tabular-nums text-caramel">{formatCount(v.points)}</span>
        </li>
      ))}
    </ol>
  );
}

function TimerBar({ left, total }: { left: number; total: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-crema/10">
      <motion.div className="h-full rounded-full bg-caramel" style={{ width: `${(left / total) * 100}%` }} />
    </div>
  );
}

/** Numeri scritti in chat: «1.234», «1,5», «12k», «3 milioni», «2:45» (durate). */
export function parseChatNumber(raw: string, format: Loaded["category"]["format"]): number | null {
  const text = String(raw || "").toLowerCase().replace(/[’']/g, "").trim();
  if (format === "duration") {
    const d = /^(\d{1,3}):([0-5]\d)$/.exec(text);
    if (d) return Number(d[1]) * 60 + Number(d[2]);
  }
  const m = /^(-?\d[\d.,\s]*)\s*(k|mila|m|mln|milioni|milione|mld|miliardi|miliardo|b)?\b/.exec(text);
  if (!m) return null;
  let s = m[1]!.replace(/\s/g, "");
  if (s.includes(".") && s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  else if (/^-?\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, "");
  else s = s.replace(",", ".");
  let n = Number(s);
  if (!Number.isFinite(n)) return null;
  const mult = m[2];
  if (mult === "k" || mult === "mila") n *= 1e3;
  else if (mult === "m" || mult === "mln" || mult === "milioni" || mult === "milione") n *= 1e6;
  else if (mult === "mld" || mult === "miliardi" || mult === "miliardo" || mult === "b") n *= 1e9;
  return n;
}

/* ───────────── più o meno, con la chat ───────────── */

type SHLPhase = "vote" | "reveal" | "right" | "wrong";

export function StreamHigherLower({
  data,
  chat,
  onExit,
  onRestart,
}: {
  data: Loaded;
  chat: StreamChat;
  onExit: () => void;
  onRestart: () => void;
}) {
  const c = data.category;
  const next = useDeck(data);
  const [pair, setPair] = useState<[NumberQuizItem, NumberQuizItem] | null>(null);
  const [phase, setPhase] = useState<SHLPhase>("vote");
  const [deadline, setDeadline] = useState<number | null>(null);
  const [counts, setCounts] = useState<[number, number]>([0, 0]);
  const [streak, setStreak] = useState(0);
  const [viewers, setViewers] = useState<Record<string, Viewer>>({});
  const [skipped, setSkipped] = useState(false);
  const votes = useRef(new Map<string, { side: 0 | 1; ms: number; user: string }>());
  const live = useRef({ open: false, startedAt: 0 });
  const timers = useRef<number[]>([]);
  const streakRef = useRef(0);
  const left = useCountdown(phase === "vote" ? deadline : null);

  const openVote = useCallback(() => {
    votes.current = new Map();
    setCounts([0, 0]);
    setSkipped(false);
    live.current = { open: true, startedAt: Date.now() };
    setDeadline(Date.now() + HL_VOTE_MS);
    setPhase("vote");
  }, []);

  useEffect(() => {
    const a = next();
    setPair([a, next(a, { streak: 0 })]);
    openVote();
    const t = timers.current;
    return () => t.forEach((x) => window.clearTimeout(x));
  }, [next, openVote]);

  useEffect(
    () =>
      chat.subscribe((m) => {
        if (!live.current.open) return;
        const t = m.text.trim().replace(/^!/, "");
        const side = t === "1" ? 0 : t === "2" ? 1 : null;
        if (side == null) return;
        const k = m.user.toLowerCase();
        if (votes.current.has(k)) return;
        votes.current.set(k, { side, ms: Math.max(0, m.at - live.current.startedAt), user: m.user });
        setCounts((x) => (side === 0 ? [x[0] + 1, x[1]] : [x[0], x[1] + 1]));
      }),
    [chat],
  );

  const reveal = useCallback(() => {
    if (!pair || !live.current.open) return;
    live.current.open = false;
    const [a, b] = pair;
    const winners = new Set<0 | 1>(a.value === b.value ? [0, 1] : [a.value > b.value ? 0 : 1]);
    const all = [...votes.current.values()];
    setViewers((prev) =>
      addPoints(
        prev,
        all.map((v) => ({ user: v.user, correct: winners.has(v.side), points: winners.has(v.side) ? Math.round(100 - 80 * Math.min(1, v.ms / HL_VOTE_MS)) : 0 })),
      ),
    );
    const c0 = all.filter((v) => v.side === 0).length;
    const c1 = all.length - c0;
    setPhase("reveal");
    timers.current.push(
      window.setTimeout(() => {
        /* nessun voto: si passa oltre senza perdere la serie */
        if (!all.length) {
          setSkipped(true);
          setPhase("right");
        } else {
          const majority: 0 | 1 = c0 >= c1 ? 0 : 1;
          if (!winners.has(majority)) return setPhase("wrong");
          streakRef.current += 1;
          setStreak((s) => s + 1);
          setPhase("right");
        }
        timers.current.push(
          window.setTimeout(() => {
            const keep = b;
            setPair([keep, next(keep, { streak: streakRef.current })]);
            openVote();
          }, 1800),
        );
      }, 1400),
    );
  }, [pair, next, openVote]);

  useEffect(() => {
    if (phase === "vote" && deadline && left <= 0) reveal();
  }, [left, phase, deadline, reveal]);

  if (!pair) return null;
  const [a, b] = pair;
  const total = counts[0] + counts[1];

  return (
    <Shell
      onExit={onExit}
      top={
        <>
          <Pill icon={<Flame className="size-4" />} label="Serie" value={streak} hot={streak > 0} />
          <Pill icon={<Users className="size-4" />} label="Voti" value={total} />
        </>
      }
    >
      <div className="relative flex flex-1 flex-col overflow-hidden sm:flex-row">
        <AnimatePresence mode="popLayout" initial={false}>
          {[a, b].map((it, idx) => {
            const side = idx as 0 | 1;
            const revealed = side === 0 || phase !== "vote";
            const share = total ? Math.round((counts[side] / total) * 100) : 0;
            const won = phase !== "vote" && it.value >= (side === 0 ? b : a).value;
            return (
              <motion.div
                key={it.name}
                layout
                initial={{ opacity: 0, x: 120 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -160 }}
                transition={{ type: "spring", stiffness: 210, damping: 28 }}
                className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6 text-center"
              >
                <Backdrop item={it} />
                <div className={cn("pointer-events-none absolute inset-0 transition", phase !== "vote" && won ? "bg-emerald-500/15" : phase !== "vote" ? "bg-ember/10" : "")} />
                <span className="absolute left-1/2 top-16 -translate-x-1/2 rounded-2xl bg-crema px-4 py-1.5 font-display text-2xl font-bold text-ink shadow-xl sm:top-20">
                  {side + 1}
                </span>
                <div className="relative flex max-w-lg flex-col items-center">
                  <h2 className="text-balance font-display text-3xl leading-tight text-crema drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)] sm:text-5xl">{it.name}</h2>
                  {it.sub ? <p className="mt-1.5 text-sm font-semibold text-crema/70">{it.sub}</p> : null}
                  <div className="mt-4 min-h-[4.5rem]">
                    {revealed ? (
                      <>
                        <p className="font-mono text-4xl font-bold tabular-nums text-caramel drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)] sm:text-6xl">
                          {side === 1 ? <CountUp to={it.value} format={c.format} /> : formatNumberQuizValue(it.value, c.format)}
                        </p>
                        {c.unit ? <p className="mt-1 text-sm text-crema/70">{c.unit}</p> : null}
                      </>
                    ) : (
                      <span className="grid size-16 place-items-center rounded-2xl bg-ink/60 font-display text-4xl text-crema ring-1 ring-sand/25 backdrop-blur">?</span>
                    )}
                  </div>
                  {/* barra dei voti della chat */}
                  <div className="mt-4 w-56 max-w-full">
                    <div className="h-3 overflow-hidden rounded-full bg-ink/60 ring-1 ring-sand/20">
                      <motion.div className="h-full bg-caramel" animate={{ width: `${share}%` }} transition={{ type: "spring", stiffness: 160, damping: 22 }} />
                    </div>
                    <p className="mt-1 text-xs font-semibold text-crema/75">
                      {share}% · {counts[side]} {counts[side] === 1 ? "voto" : "voti"}
                    </p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2">
          <motion.div
            key={phase}
            initial={{ scale: 0.4 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 420, damping: 16 }}
            className={cn(
              "grid size-16 place-items-center rounded-full font-display text-xl font-bold ring-4 ring-ink sm:size-20",
              phase === "right" ? "bg-emerald-500 text-white" : phase === "wrong" ? "bg-ember text-white" : "bg-crema text-ink",
            )}
          >
            {phase === "right" ? <Check className="size-9" /> : phase === "wrong" ? <X className="size-9" /> : phase === "vote" ? Math.ceil(left / 1000) : "VS"}
          </motion.div>
        </div>

        <div className="absolute inset-x-0 bottom-0 z-20 p-4">
          <div className="mx-auto max-w-xl rounded-2xl bg-ink/80 p-3 ring-1 ring-sand/20 backdrop-blur">
            <div className="flex items-center gap-3">
              <p className="min-w-0 flex-1 text-sm font-semibold text-crema">
                {phase === "vote"
                  ? `${c.question} Scrivete 1 o 2 in chat!`
                  : skipped
                    ? "Nessun voto: si va avanti."
                    : phase === "wrong"
                      ? "La chat ha sbagliato"
                      : phase === "right"
                        ? "Giusto"
                        : "Vediamo…"}
              </p>
              {phase === "vote" ? (
                <button type="button" onClick={reveal} className="shrink-0 rounded-xl bg-caramel px-3 py-2 text-xs font-semibold text-ink">
                  Rivela ora
                </button>
              ) : null}
            </div>
            {phase === "vote" ? (
              <div className="mt-2">
                <TimerBar left={left} total={HL_VOTE_MS} />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {phase === "wrong" ? (
          <GameOver
            title={`Serie di ${streak}`}
            record={false}
            subtitle={`La chat si è fermata a ${streak}. Classifica di chi ha votato:`}
            share={`La mia chat ha fatto una serie di ${streak} a «${c.title}» nel Number Quiz di Vinili & Caffè!`}
            onRestart={onRestart}
            onExit={onExit}
            extra={<Ranking viewers={viewers} />}
          />
        ) : null}
      </AnimatePresence>
    </Shell>
  );
}

/* ───────────── caldo o freddo, con la chat ───────────── */

type Guess = { user: string; value: number; ms: number };

export function StreamHotCold({ data, chat, onExit, onRestart }: { data: Loaded; chat: StreamChat; onExit: () => void; onRestart: () => void }) {
  const c = data.category;
  const next = useDeck(data);
  const [round, setRound] = useState(1);
  const [item, setItem] = useState<NumberQuizItem | null>(null);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [count, setCount] = useState(0);
  const [result, setResult] = useState<Array<Guess & { points: number; label: string; emoji: string }> | null>(null);
  const [viewers, setViewers] = useState<Record<string, Viewer>>({});
  const [done, setDone] = useState(false);
  const guesses = useRef(new Map<string, Guess>());
  const live = useRef({ open: false, startedAt: 0 });
  const left = useCountdown(!result && !done ? deadline : null);

  const openRound = useCallback(() => {
    guesses.current = new Map();
    setCount(0);
    setResult(null);
    live.current = { open: true, startedAt: Date.now() };
    setDeadline(Date.now() + HC_VOTE_MS);
  }, []);

  useEffect(() => {
    setItem(next());
    openRound();
  }, [next, openRound]);

  useEffect(
    () =>
      chat.subscribe((m) => {
        if (!live.current.open) return;
        const v = parseChatNumber(m.text.replace(/^!/, ""), c.format);
        if (v == null) return;
        const k = m.user.toLowerCase();
        if (guesses.current.has(k)) return;
        guesses.current.set(k, { user: m.user, value: v, ms: Math.max(0, m.at - live.current.startedAt) });
        setCount(guesses.current.size);
      }),
    [chat, c.format],
  );

  const reveal = useCallback(() => {
    if (!item || !live.current.open) return;
    live.current.open = false;
    const scored = [...guesses.current.values()]
      .map((g) => ({ ...g, ...heat(g.value, item.value, c.format) }))
      .sort((x, y) => y.points - x.points || x.ms - y.ms);
    setResult(scored);
    setViewers((prev) => addPoints(prev, scored.map((s) => ({ user: s.user, points: s.points, correct: s.points >= 700 }))));
  }, [item, c.format]);

  useEffect(() => {
    if (!result && !done && deadline && left <= 0) reveal();
  }, [left, result, done, deadline, reveal]);

  function advance() {
    if (round >= HC_ROUNDS) return setDone(true);
    setRound((r) => r + 1);
    setItem((prev) => next(prev || undefined));
    openRound();
  }

  const leader = useMemo(() => Object.values(viewers).sort((a, b) => b.points - a.points)[0], [viewers]);
  if (!item) return null;

  return (
    <Shell
      onExit={onExit}
      top={
        <>
          <Pill icon={<span className="text-[11px]">#</span>} label="Domanda" value={`${round}/${HC_ROUNDS}`} />
          <Pill icon={<Users className="size-4" />} label="Risposte" value={count} />
          {leader ? <Pill icon={<Crown className="size-4" />} label={leader.user.slice(0, 14)} value={formatCount(leader.points)} hot /> : null}
        </>
      }
    >
      <div className="relative flex flex-1 flex-col">
        <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6 pb-4 pt-20 text-center">
          <Backdrop item={item} />
          <div className="relative w-full max-w-2xl">
            <p className="text-xs font-semibold text-caramel">{c.title}</p>
            <h2 className="mt-2 text-balance font-display text-4xl leading-tight text-crema drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)] sm:text-6xl">{item.name}</h2>
            {item.sub ? <p className="mt-1.5 text-sm font-semibold text-crema/70">{item.sub}</p> : null}
            {result ? (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-5">
                <p className="font-mono text-5xl font-bold tabular-nums text-caramel sm:text-6xl">
                  <CountUp to={item.value} format={c.format} />
                </p>
                {c.unit ? <p className="mt-1 text-sm text-crema/70">{c.unit}</p> : null}
                <ol className="mx-auto mt-5 max-w-md space-y-1.5 text-left">
                  {result.slice(0, 5).map((g, i) => (
                    <motion.li
                      key={g.user}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.4 + i * 0.08 }}
                      className={cn("flex items-center gap-3 rounded-xl px-3 py-2 backdrop-blur", i === 0 ? "bg-caramel/25 ring-1 ring-caramel/50" : "bg-ink/60")}
                    >
                      <span aria-hidden>{g.emoji}</span>
                      <span className="min-w-0 flex-1 truncate font-semibold text-crema">{g.user}</span>
                      <span className="font-mono text-sm tabular-nums text-crema/70">{formatNumberQuizValue(g.value, c.format)}</span>
                      <span className="w-14 text-right font-mono text-sm font-bold tabular-nums text-caramel">+{g.points}</span>
                    </motion.li>
                  ))}
                  {!result.length ? <li className="text-center text-sm text-crema/60">Nessuno ha risposto.</li> : null}
                </ol>
              </motion.div>
            ) : null}
          </div>
        </div>

        <div className="relative z-10 border-t border-sand/10 bg-ink/90 px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-4 backdrop-blur-xl">
          <div className="mx-auto flex max-w-2xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm font-semibold text-crema">
                {result ? (
                  `Risposte: ${result.length}`
                ) : (
                  <>
                    <Timer className="size-4 text-caramel" /> Scrivete il numero in chat{c.unit ? ` (${c.unit})` : ""}: {Math.ceil(left / 1000)}s
                  </>
                )}
              </p>
              {!result ? (
                <div className="mt-2">
                  <TimerBar left={left} total={HC_VOTE_MS} />
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={result ? advance : reveal}
              className="inline-flex h-12 min-w-[9rem] items-center justify-center gap-2 rounded-2xl bg-caramel px-6 text-sm font-semibold text-ink transition hover:brightness-105"
            >
              {result ? (round >= HC_ROUNDS ? "Classifica" : "Avanti") : "Rivela ora"}
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {done ? (
          <GameOver
            title="Classifica della chat"
            record={false}
            subtitle={`${HC_ROUNDS} domande, fino a 1.000 punti l'una.`}
            share={`Abbiamo giocato a «${c.title}» (Caldo o freddo) in live nel Number Quiz di Vinili & Caffè!`}
            onRestart={onRestart}
            onExit={onExit}
            extra={<Ranking viewers={viewers} />}
          />
        ) : null}
      </AnimatePresence>
    </Shell>
  );
}

