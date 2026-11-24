"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, animate, motion } from "motion/react";
import {
  ArrowLeft,
  ArrowUpDown,
  Check,
  Copy,
  Flame,
  Loader2,
  Radio,
  RotateCcw,
  Thermometer,
  Trophy,
  User,
  X,
} from "lucide-react";
import { ChatPanel, StreamHigherLower, StreamHotCold, useStreamChat, type StreamChat } from "./NumberQuizStream";
import { SmartLink } from "@/components/SmartLink";
import { page } from "@/lib/site";
import { cn } from "@/lib/cn";
import {
  countNumberQuizPlay,
  formatCount,
  formatNumberQuizValue,
  loadNumberQuizCategory,
  readBest,
  writeBest,
  type NumberQuizCategory,
  type NumberQuizItem,
} from "@/lib/numberQuiz";

export type Mode = "hl" | "hc";
export type Loaded = { category: NumberQuizCategory; items: NumberQuizItem[]; min: number; max: number };

export const HC_ROUNDS = 10;

export function NumberQuizPlay() {
  const sp = useSearchParams();
  const id = String(sp.get("cat") || "").trim();
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<Mode | null>(null);
  const [run, setRun] = useState(0);
  const [stream, setStream] = useState(false);
  const chat = useStreamChat();

  useEffect(() => {
    if (!id) {
      setError("Scegli una categoria per giocare.");
      return;
    }
    let alive = true;
    let timer = 0;
    const load = () =>
      void loadNumberQuizCategory(id, 100).then((r) => {
        if (!alive) return;
        if (r.ok) setData(r.data);
        else if (r.preparing) {
          setError("");
          timer = window.setTimeout(load, 8000);
        } else setError(r.message);
      });
    load();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [id]);

  function start(m: Mode) {
    setMode(m);
    setRun((n) => n + 1);
    if (data) void countNumberQuizPlay(data.category.id);
  }

  if (error) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="text-crema/70">{error}</p>
        <BackLink />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="grid place-items-center gap-3 py-28 text-center text-sm text-crema/55">
        <Loader2 className="size-8 animate-spin text-caramel" />
        Preparo le domande…
      </div>
    );
  }

  return (
    <>
      {/* si rimonta all'uscita da una partita, così rilegge i record */}
      <Setup key={mode ? "playing" : `setup-${run}`} data={data} onStart={start} stream={stream} setStream={setStream} chat={chat} />
      <AnimatePresence>
        {stream && mode === "hl" ? (
          <StreamHigherLower key={`shl-${run}`} data={data} chat={chat} onExit={() => setMode(null)} onRestart={() => start("hl")} />
        ) : stream && mode === "hc" ? (
          <StreamHotCold key={`shc-${run}`} data={data} chat={chat} onExit={() => setMode(null)} onRestart={() => start("hc")} />
        ) : mode === "hl" ? (
          <HigherLower key={`hl-${run}`} data={data} onExit={() => setMode(null)} onRestart={() => start("hl")} />
        ) : mode === "hc" ? (
          <HotCold key={`hc-${run}`} data={data} onExit={() => setMode(null)} onRestart={() => start("hc")} />
        ) : null}
      </AnimatePresence>
    </>
  );
}

function BackLink() {
  return (
    <SmartLink
      href={page("/quiz/numeri/")}
      className="mt-5 inline-flex items-center gap-2 rounded-full bg-caramel px-5 py-2.5 text-sm font-bold text-ink"
    >
      <ArrowLeft className="size-4" /> Tutte le categorie
    </SmartLink>
  );
}

/* ───────────── scelta della modalità ───────────── */

function Setup({
  data,
  onStart,
  stream,
  setStream,
  chat,
}: {
  data: Loaded;
  onStart: (m: Mode) => void;
  stream: boolean;
  setStream: (v: boolean) => void;
  chat: StreamChat;
}) {
  const c = data.category;
  const [best, setBest] = useState({ hl: 0, hc: 0 });
  useEffect(() => setBest({ hl: readBest(c.id, "hl"), hc: readBest(c.id, "hc") }), [c.id]);
  const previews = useMemo(() => data.items.filter((x) => x.image).slice(0, 6), [data.items]);

  return (
    <div className="relative overflow-hidden">
      {c.cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.cover} alt="" className="absolute inset-0 size-full scale-110 object-cover opacity-25 blur-2xl" />
      ) : null}
      <div className="relative mx-auto w-full max-w-4xl px-4 pb-20 pt-6">
        <SmartLink
          href={page("/quiz/numeri/")}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold uppercase tracking-wide text-crema/60 transition hover:bg-crema/[0.06] hover:text-crema"
        >
          <ArrowLeft className="size-4" /> Categorie
        </SmartLink>

        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="mt-4 text-center">
          <span className="text-5xl" aria-hidden>
            {c.emoji}
          </span>
          <p className="mt-3 text-xs font-bold uppercase tracking-[0.2em] text-caramel">Number Quiz · {c.topic}</p>
          <h1 className="mt-2 text-balance font-display text-4xl text-crema sm:text-5xl">{c.title}</h1>
          <p className="mx-auto mt-3 max-w-xl text-crema/65">{c.description}</p>
          <p className="mt-3 text-sm text-crema/45">
            {formatCount(c.count)} voci{c.plays ? ` · ${formatCount(c.plays)} partite` : ""}
          </p>
        </motion.div>

        {previews.length ? (
          <div className="mt-6 flex justify-center -space-x-3">
            {previews.map((p, i) => (
              <motion.img
                key={p.name}
                src={p.image}
                alt=""
                initial={{ opacity: 0, y: 10, rotate: 0 }}
                animate={{ opacity: 1, y: 0, rotate: (i - 2.5) * 4 }}
                transition={{ delay: 0.1 + i * 0.05 }}
                className="size-16 rounded-2xl bg-roast object-cover shadow-xl ring-2 ring-espresso sm:size-20"
              />
            ))}
          </div>
        ) : null}

        {/* da solo o con la chat della live, come nel Music Quiz */}
        <div className="mx-auto mt-8 grid max-w-md grid-cols-2 gap-1 rounded-2xl bg-ink/50 p-1 ring-1 ring-sand/15">
          {[
            { id: false, label: "Da solo", hint: "Gioca tu", icon: <User className="size-4" /> },
            { id: true, label: "In stream", hint: "Gioca la tua chat", icon: <Radio className="size-4" /> },
          ].map((o) => (
            <button
              key={String(o.id)}
              type="button"
              onClick={() => setStream(o.id)}
              className={cn("relative rounded-xl px-3 py-2.5 text-left transition", stream === o.id ? "text-ink" : "text-crema/70 hover:text-crema")}
            >
              {stream === o.id ? <motion.span layoutId="nq-who" className="absolute inset-0 rounded-xl bg-crema" /> : null}
              <span className="relative flex items-center gap-2 text-sm font-bold">
                {o.icon} {o.label}
              </span>
              <span className={cn("relative block text-xs", stream === o.id ? "text-ink/60" : "text-crema/45")}>{o.hint}</span>
            </button>
          ))}
        </div>
        <AnimatePresence initial={false}>{stream ? <ChatPanel key="chat" chat={chat} /> : null}</AnimatePresence>

        <div className={cn("mt-6 grid gap-4 transition sm:grid-cols-2", stream && !chat.ready && "pointer-events-none opacity-45")}>
          <ModeTile
            icon={<ArrowUpDown className="size-6" />}
            title="Più o meno"
            text={
              stream
                ? `La chat vota 1 o 2 entro 15 secondi: decide la maggioranza, e chi vota giusto e veloce fa più punti.`
                : `${c.question} Tocca la carta giusta e allunga la serie: al primo errore è finita.`
            }
            record={stream ? (chat.ready ? "Classifica della chat a fine partita" : "Collega prima la chat") : best.hl ? `Record: serie di ${best.hl}` : "Nessun record ancora"}
            onClick={() => onStart("hl")}
            primary
          />
          <ModeTile
            icon={<Thermometer className="size-6" />}
            title="Caldo o freddo"
            text={
              stream
                ? `${HC_ROUNDS} domande: la chat scrive il numero (anche «12k» o «3 milioni»), chi si avvicina di più prende più punti.`
                : `Indovina il numero esatto. ${HC_ROUNDS} domande, fino a 1.000 punti l'una: più ti avvicini, più punti fai.`
            }
            record={stream ? (chat.ready ? "Classifica della chat a fine partita" : "Collega prima la chat") : best.hc ? `Record: ${formatCount(best.hc)} punti` : "Nessun record ancora"}
            onClick={() => onStart("hc")}
          />
        </div>
      </div>
    </div>
  );
}

function ModeTile({
  icon,
  title,
  text,
  record,
  onClick,
  primary,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  record: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        "flex flex-col items-start rounded-3xl p-5 text-left ring-1 transition",
        primary ? "bg-gradient-to-br from-caramel/25 via-roast to-roast ring-caramel/45" : "bg-roast/85 ring-sand/15 hover:ring-caramel/35",
      )}
    >
      <span className={cn("grid size-12 place-items-center rounded-2xl", primary ? "bg-caramel text-ink" : "bg-crema/[0.08] text-caramel")}>{icon}</span>
      <span className="mt-4 font-display text-2xl text-crema">{title}</span>
      <span className="mt-1.5 text-sm text-crema/60">{text}</span>
      <span className="mt-4 flex w-full items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-crema/45">
          <Trophy className="size-3.5" /> {record}
        </span>
        <span className="rounded-full bg-crema px-5 py-2 text-xs font-bold uppercase tracking-wide text-ink">Gioca</span>
      </span>
    </motion.button>
  );
}

/* ───────────── pezzi comuni ───────────── */

export function useDeck(data: Loaded) {
  const deck = useRef<NumberQuizItem[]>([]);
  const seen = useRef(new Set<string>());
  const loading = useRef(false);

  const refill = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    const r = await loadNumberQuizCategory(data.category.id, 100);
    loading.current = false;
    if (r.ok) deck.current.push(...r.data.items.filter((x) => !seen.current.has(x.name)));
  }, [data.category.id]);

  useEffect(() => {
    deck.current = data.items.slice().sort(() => Math.random() - 0.5);
  }, [data.items]);

  const next = useCallback(
    (avoid?: NumberQuizItem) => {
      if (deck.current.length < 12) void refill();
      for (let i = 0; i < deck.current.length; i++) {
        const it = deck.current[i]!;
        if (seen.current.has(it.name)) continue;
        if (avoid && (it.name === avoid.name || it.value === avoid.value) && deck.current.length - i > 1) continue;
        deck.current.splice(i, 1);
        seen.current.add(it.name);
        return it;
      }
      /* finite le voci nuove: si ricomincia */
      seen.current.clear();
      const it = deck.current.shift() || data.items[Math.floor(Math.random() * data.items.length)]!;
      seen.current.add(it.name);
      return it;
    },
    [data.items, refill],
  );
  return next;
}

export function Shell({ children, onExit, top }: { children: React.ReactNode; onExit: () => void; top: React.ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] flex flex-col overflow-clip bg-ink text-crema"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 p-3 sm:p-4">
        <button
          type="button"
          onClick={onExit}
          aria-label="Esci dalla partita"
          className="pointer-events-auto grid size-11 place-items-center rounded-full bg-ink/70 text-crema ring-1 ring-sand/20 backdrop-blur transition hover:bg-ink"
        >
          <X className="size-5" />
        </button>
        <div className="pointer-events-auto flex items-center gap-2">{top}</div>
      </div>
      {children}
    </motion.div>
  );
}

export function Pill({ icon, label, value, hot }: { icon: React.ReactNode; label: string; value: string | number; hot?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-10 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold uppercase tracking-wide ring-1 backdrop-blur",
        hot ? "bg-caramel text-ink ring-caramel" : "bg-ink/70 text-crema/75 ring-sand/20",
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
      <motion.span key={String(value)} initial={{ scale: 1.6 }} animate={{ scale: 1 }} className="font-mono text-sm tabular-nums">
        {value}
      </motion.span>
    </span>
  );
}

export function CountUp({ to, format }: { to: number; format: NumberQuizCategory["format"] }) {
  const [v, setV] = useState(format === "year" ? Math.round(to * 0.98) : 0);
  useEffect(() => {
    const from = format === "year" ? Math.round(to - Math.min(60, Math.abs(to) * 0.03)) : 0;
    const c = animate(from, to, {
      duration: 1,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (x) => setV(format === "decimal" ? Math.round(x * 100) / 100 : Math.round(x)),
    });
    return () => c.stop();
  }, [to, format]);
  return <>{formatNumberQuizValue(v, format)}</>;
}

export function Backdrop({ item }: { item: NumberQuizItem }) {
  return item.image ? (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.image} alt="" className="absolute inset-0 size-full scale-125 object-cover opacity-50 blur-xl" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.image} alt="" className="absolute inset-0 size-full object-cover opacity-90" />
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/55 to-ink/25" />
    </>
  ) : (
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(214,154,95,0.25),transparent_60%),linear-gradient(160deg,#2a1d16,#120c09)]" />
  );
}

/* ───────────── più o meno ───────────── */

type HLPhase = "pick" | "reveal" | "right" | "wrong";

function HigherLower({ data, onExit, onRestart }: { data: Loaded; onExit: () => void; onRestart: () => void }) {
  const c = data.category;
  const next = useDeck(data);
  const [pair, setPair] = useState<[NumberQuizItem, NumberQuizItem] | null>(null);
  const [phase, setPhase] = useState<HLPhase>("pick");
  const [picked, setPicked] = useState<0 | 1 | null>(null);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(() => readBest(c.id, "hl"));
  const bestAtStart = useRef(best);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const a = next();
    setPair([a, next(a)]);
    const t = timers.current;
    return () => t.forEach((x) => window.clearTimeout(x));
  }, [next]);

  const choose = useCallback(
    (side: 0 | 1) => {
      if (phase !== "pick" || !pair) return;
      const [a, b] = pair;
      const chosen = side === 0 ? a : b;
      const other = side === 0 ? b : a;
      const ok = chosen.value >= other.value;
      setPicked(side);
      setPhase("reveal");
      timers.current.push(
        window.setTimeout(() => {
          if (!ok) {
            setPhase("wrong");
            return;
          }
          setStreak((s) => {
            const n = s + 1;
            if (n > bestAtStart.current && n > readBest(c.id, "hl")) {
              writeBest(c.id, "hl", n);
              setBest(n);
            }
            return n;
          });
          setPhase("right");
          timers.current.push(
            window.setTimeout(() => {
              /* la carta più alta resta, a destra ne arriva una nuova */
              const keep = a.value >= b.value ? a : b;
              setPair([keep, next(keep)]);
              setPicked(null);
              setPhase("pick");
            }, 1000),
          );
        }, 1300),
      );
    },
    [phase, pair, c.id, next],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "1") choose(0);
      else if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "2") choose(1);
      else if (e.key === "Escape") onExit();
      else if (e.key === "Enter" && phase === "wrong") onRestart();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [choose, onExit, onRestart, phase]);

  if (!pair) return null;
  const [a, b] = pair;
  /* il primo valore si vede sempre; il secondo si scopre dopo la scelta */
  const showB = phase !== "pick";

  return (
    <Shell
      onExit={onExit}
      top={
        <>
          <Pill icon={<Flame className="size-4" />} label="Serie" value={streak} hot={streak > 0} />
          <Pill icon={<Trophy className="size-4" />} label="Record" value={best} />
        </>
      }
    >
      <div className="relative flex flex-1 flex-col overflow-hidden sm:flex-row">
        <AnimatePresence mode="popLayout" initial={false}>
          {[a, b].map((it, idx) => {
            const side = idx as 0 | 1;
            const revealed = side === 0 || showB;
            const isPicked = picked === side;
            const won = phase !== "pick" && it.value >= (side === 0 ? b : a).value;
            return (
              <motion.button
                key={it.name}
                layout
                type="button"
                disabled={phase !== "pick"}
                onClick={() => choose(side)}
                initial={{ opacity: 0, x: 120 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -160 }}
                transition={{ type: "spring", stiffness: 210, damping: 28 }}
                className={cn(
                  "group relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6 text-center outline-none",
                  phase === "pick" ? "cursor-pointer" : "cursor-default",
                )}
              >
                <Backdrop item={it} />
                <div
                  className={cn(
                    "pointer-events-none absolute inset-0 transition duration-300",
                    phase === "pick" ? "group-hover:bg-caramel/10" : "",
                    phase !== "pick" && won ? "bg-emerald-500/15" : "",
                    phase !== "pick" && !won ? "bg-ember/10" : "",
                    isPicked ? "ring-4 ring-inset ring-crema/70" : "",
                  )}
                />
                <div className="relative flex max-w-lg flex-col items-center">
                  <h2 className="text-balance font-display text-3xl leading-tight text-crema drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)] sm:text-5xl">
                    {it.name}
                  </h2>
                  {it.sub ? <p className="mt-1.5 text-sm font-semibold uppercase tracking-wide text-crema/70 sm:text-base">{it.sub}</p> : null}
                  <div className="mt-4 min-h-[4.5rem] sm:mt-6">
                    {revealed ? (
                      <>
                        <p className="font-mono text-4xl font-bold tabular-nums text-caramel drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)] sm:text-6xl">
                          {side === 1 ? <CountUp to={it.value} format={c.format} /> : formatNumberQuizValue(it.value, c.format)}
                        </p>
                        {c.unit ? <p className="mt-1 text-sm text-crema/70">{c.unit}</p> : null}
                      </>
                    ) : (
                      <div className="flex flex-col items-center">
                        <span className="grid size-16 place-items-center rounded-2xl bg-ink/60 font-display text-4xl text-crema ring-1 ring-sand/25 backdrop-blur transition group-hover:scale-110 sm:size-20">
                          ?
                        </span>
                        <span className="mt-3 rounded-full bg-crema/90 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-ink opacity-90 transition group-hover:opacity-100">
                          Tocca se è più alto
                        </span>
                      </div>
                    )}
                  </div>
                  {side === 0 && phase === "pick" ? (
                    <span className="mt-3 rounded-full bg-ink/60 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-crema/80 ring-1 ring-sand/20 opacity-0 backdrop-blur transition group-hover:opacity-100">
                      Tocca se è più alto
                    </span>
                  ) : null}
                </div>
              </motion.button>
            );
          })}
        </AnimatePresence>

        {/* domanda e disco centrale */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
          <motion.div
            key={phase === "pick" ? `vs-${a.name}` : phase}
            initial={{ scale: 0.4, rotate: -30 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 16 }}
            className={cn(
              "grid size-16 place-items-center rounded-full font-display text-xl font-bold shadow-[0_10px_40px_rgba(0,0,0,0.6)] ring-4 ring-ink sm:size-20 sm:text-2xl",
              phase === "right" ? "bg-emerald-500 text-white" : phase === "wrong" ? "bg-ember text-white" : "bg-crema text-ink",
            )}
          >
            {phase === "right" ? <Check className="size-9" /> : phase === "wrong" ? <X className="size-9" /> : phase === "reveal" ? <Loader2 className="size-7 animate-spin" /> : "VS"}
          </motion.div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center p-4 sm:bottom-auto sm:top-4">
          <p className="rounded-full bg-ink/75 px-5 py-2 text-center text-sm font-semibold text-crema ring-1 ring-sand/20 backdrop-blur">
            {c.question}
          </p>
        </div>
      </div>

      <AnimatePresence>
        {phase === "wrong" ? (
          <GameOver
            title={`Serie di ${streak}`}
            record={streak > bestAtStart.current && streak > 0}
            subtitle={`Record in questa categoria: ${Math.max(best, streak)}`}
            share={`Ho fatto una serie di ${streak} a «${c.title}» nel Number Quiz di Vinili & Caffè!`}
            onRestart={onRestart}
            onExit={onExit}
          />
        ) : null}
      </AnimatePresence>
    </Shell>
  );
}

export function GameOver({
  title,
  subtitle,
  record,
  share,
  onRestart,
  onExit,
  extra,
}: {
  title: string;
  subtitle: string;
  record: boolean;
  share: string;
  onRestart: () => void;
  onExit: () => void;
  extra?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  async function doShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ text: share, url });
        return;
      }
    } catch {
      /* annullato: si copia */
    }
    void navigator.clipboard?.writeText(`${share} ${url}`).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  }
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ delay: 0.6 }}
      className="absolute inset-0 z-40 grid place-items-center bg-ink/70 p-4 backdrop-blur-sm"
    >
      <motion.div
        initial={{ y: 40, scale: 0.94 }}
        animate={{ y: 0, scale: 1 }}
        transition={{ delay: 0.6, type: "spring", stiffness: 260, damping: 22 }}
        className="w-full max-w-sm rounded-[2rem] bg-roast p-6 text-center ring-1 ring-sand/20 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)]"
      >
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-crema/50">Partita finita</p>
        <p className="mt-2 font-display text-4xl text-crema">{title}</p>
        {record ? (
          <motion.p
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.9 }}
            className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-caramel px-3 py-1 text-xs font-bold uppercase text-ink"
          >
            <Trophy className="size-3.5" /> Nuovo record
          </motion.p>
        ) : null}
        <p className="mt-2 text-sm text-crema/55">{subtitle}</p>
        {extra}
        <div className="mt-5 grid gap-2">
          <button
            type="button"
            onClick={onRestart}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-caramel to-ember text-sm font-bold uppercase tracking-wide text-ink transition hover:brightness-105"
          >
            <RotateCcw className="size-4" /> Rigioca
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void doShare()}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-crema/[0.07] text-xs font-bold uppercase tracking-wide text-crema ring-1 ring-sand/15 transition hover:bg-crema/[0.12]"
            >
              <Copy className="size-4" /> {copied ? "Copiato" : "Condividi"}
            </button>
            <button
              type="button"
              onClick={onExit}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-crema/[0.07] text-xs font-bold uppercase tracking-wide text-crema ring-1 ring-sand/15 transition hover:bg-crema/[0.12]"
            >
              Modalità
            </button>
          </div>
          <SmartLink href={page("/quiz/numeri/")} className="mt-1 text-xs font-semibold text-crema/50 hover:text-crema">
            Cambia categoria
          </SmartLink>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ───────────── caldo o freddo ───────────── */

export function heat(guess: number, real: number, format: NumberQuizCategory["format"]) {
  let closeness: number;
  if (format === "year") {
    closeness = Math.max(0, 1 - Math.abs(guess - real) / 30);
  } else {
    const g = Math.max(guess, 1e-9);
    const r = Math.max(real, 1e-9);
    /* conta il rapporto, non la differenza: metà o il doppio valgono uguale; da dieci volte in su zero punti */
    closeness = Math.max(0, 1 - Math.abs(Math.log(g / r)) / Math.log(10));
  }
  const points = Math.round(1000 * closeness ** 1.6);
  const label =
    closeness > 0.97 ? "Bollente" : closeness > 0.85 ? "Caldissimo" : closeness > 0.65 ? "Caldo" : closeness > 0.4 ? "Tiepido" : closeness > 0.15 ? "Freddo" : "Gelido";
  const emoji = closeness > 0.85 ? "🔥" : closeness > 0.65 ? "♨️" : closeness > 0.4 ? "🌤️" : closeness > 0.15 ? "❄️" : "🧊";
  return { points, label, emoji, closeness };
}

/* cursore: lineare per gli anni, logaritmico per il resto (da 10 a 10 miliardi stanno sulla stessa barra) */
function toSlider(v: number, min: number, max: number, log: boolean) {
  if (!log) return (v - min) / (max - min || 1);
  const lo = Math.log(Math.max(min, 1e-6));
  const hi = Math.log(Math.max(max, min * 10, 1e-5));
  return (Math.log(Math.max(v, 1e-6)) - lo) / (hi - lo || 1);
}
function fromSlider(t: number, min: number, max: number, log: boolean, format: NumberQuizCategory["format"]) {
  let v: number;
  if (!log) v = min + t * (max - min);
  else {
    const lo = Math.log(Math.max(min, 1e-6));
    const hi = Math.log(Math.max(max, min * 10, 1e-5));
    v = Math.exp(lo + t * (hi - lo));
  }
  if (format === "decimal") return Math.round(v * 10) / 10;
  if (v > 1000) {
    const mag = 10 ** (Math.floor(Math.log10(v)) - 2);
    return Math.round(v / mag) * mag;
  }
  return Math.round(v);
}

function HotCold({ data, onExit, onRestart }: { data: Loaded; onExit: () => void; onRestart: () => void }) {
  const c = data.category;
  const next = useDeck(data);
  const log = c.format !== "year" && data.min > 0 && data.max / Math.max(data.min, 1e-9) > 20;
  const [round, setRound] = useState(1);
  const [item, setItem] = useState<NumberQuizItem | null>(null);
  const [t, setT] = useState(0.5);
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState<ReturnType<typeof heat> & { guess: number } | null>(null);
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(false);
  const bestAtStart = useRef(readBest(c.id, "hc"));
  const [history, setHistory] = useState<number[]>([]);

  useEffect(() => {
    setItem(next());
  }, [next]);

  const guess = typed.trim() ? Number(typed.replace(/\./g, "").replace(",", ".")) : fromSlider(t, data.min, data.max, log, c.format);

  function confirm() {
    if (!item || result || !Number.isFinite(guess)) return;
    const h = heat(guess, item.value, c.format);
    setResult({ ...h, guess });
    setTotal((s) => s + h.points);
    setHistory((list) => [...list, h.points]);
  }

  function advance() {
    if (round >= HC_ROUNDS) {
      const final = total;
      if (final > readBest(c.id, "hc")) writeBest(c.id, "hc", final);
      setDone(true);
      return;
    }
    setRound((r) => r + 1);
    setItem((prev) => next(prev || undefined));
    setResult(null);
    setTyped("");
    setT(0.5);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onExit();
      else if (e.key === "Enter") {
        if (done) onRestart();
        else if (result) advance();
        else confirm();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!item) return null;
  const realPos = toSlider(item.value, data.min, data.max, log);
  const guessPos = result ? toSlider(result.guess, data.min, data.max, log) : t;

  return (
    <Shell
      onExit={onExit}
      top={
        <>
          <Pill icon={<span className="text-[11px]">#</span>} label="Domanda" value={`${round}/${HC_ROUNDS}`} />
          <Pill icon={<Trophy className="size-4" />} label="Punti" value={formatCount(total)} hot={total > 0} />
        </>
      }
    >
      <div className="relative flex flex-1 flex-col">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={item.name}
            initial={{ opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.4 }}
            className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6 pb-4 pt-20 text-center"
          >
            <Backdrop item={item} />
            <div className="relative">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-caramel">{c.title}</p>
              <h2 className="mt-2 text-balance font-display text-4xl leading-tight text-crema drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)] sm:text-6xl">
                {item.name}
              </h2>
              {item.sub ? <p className="mt-1.5 text-sm font-semibold uppercase tracking-wide text-crema/70">{item.sub}</p> : null}
              <AnimatePresence>
                {result ? (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-5">
                    <p className="font-mono text-5xl font-bold tabular-nums text-caramel sm:text-6xl">
                      <CountUp to={item.value} format={c.format} />
                    </p>
                    {c.unit ? <p className="mt-1 text-sm text-crema/70">{c.unit}</p> : null}
                    <motion.p
                      initial={{ scale: 0.5 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 380, damping: 14, delay: 0.3 }}
                      className="mt-4 inline-flex items-center gap-2 rounded-full bg-ink/70 px-4 py-2 text-base font-bold text-crema ring-1 ring-sand/25 backdrop-blur"
                    >
                      <span aria-hidden>{result.emoji}</span> {result.label} · +{formatCount(result.points)}
                    </motion.p>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* comandi */}
        <div className="relative z-10 border-t border-sand/10 bg-ink/90 px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-4 backdrop-blur-xl">
          <div className="mx-auto max-w-2xl">
            <p className="mb-2 text-center text-sm text-crema/70">
              Il numero esatto{c.unit ? ` (${c.unit})` : ""}: scrivilo o usa il cursore
            </p>
            <div className="mb-3 flex items-baseline justify-center gap-2">
              <input
                value={typed || formatNumberQuizValue(guess, c.format === "money" ? "number" : c.format)}
                onChange={(e) => setTyped(e.target.value.replace(/[^\d.,:-]/g, ""))}
                onFocus={(e) => {
                  setTyped(String(guess));
                  window.setTimeout(() => e.target.select(), 0);
                }}
                disabled={Boolean(result)}
                inputMode="decimal"
                aria-label="La tua risposta"
                className="w-full max-w-xs rounded-2xl bg-transparent text-center font-mono text-3xl font-bold tabular-nums text-crema outline-none focus:bg-crema/[0.06] sm:text-4xl"
              />
              {c.unit ? <span className="shrink-0 text-sm text-crema/55">{c.unit}</span> : null}
            </div>
            <div className="relative h-12">
              <div className="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 rounded-full bg-gradient-to-r from-sky-500/60 via-caramel/70 to-ember/80" />
              {result ? (
                <motion.div
                  initial={{ left: `${guessPos * 100}%` }}
                  animate={{ left: `${Math.min(1, Math.max(0, realPos)) * 100}%` }}
                  transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
                >
                  <span className="block size-7 rounded-full bg-emerald-400 ring-4 ring-ink" />
                </motion.div>
              ) : null}
              <input
                type="range"
                min={0}
                max={1000}
                value={Math.round(Math.min(1, Math.max(0, guessPos)) * 1000)}
                disabled={Boolean(result)}
                onChange={(e) => {
                  setTyped("");
                  setT(Number(e.target.value) / 1000);
                }}
                aria-label="Scegli il numero"
                className="absolute inset-0 w-full cursor-pointer appearance-none bg-transparent disabled:cursor-default [&::-moz-range-thumb]:size-8 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-4 [&::-moz-range-thumb]:border-ink [&::-moz-range-thumb]:bg-crema [&::-webkit-slider-thumb]:size-8 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-4 [&::-webkit-slider-thumb]:border-ink [&::-webkit-slider-thumb]:bg-crema [&::-webkit-slider-thumb]:shadow-[0_4px_16px_rgba(0,0,0,0.6)]"
              />
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-crema/40">
              <span>{formatNumberQuizValue(data.min, c.format)}</span>
              <span>{formatNumberQuizValue(data.max, c.format)}</span>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <div className="flex flex-1 gap-1">
                {Array.from({ length: HC_ROUNDS }, (_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "h-1.5 flex-1 rounded-full",
                      history[i] == null ? "bg-crema/10" : history[i]! > 700 ? "bg-ember" : history[i]! > 300 ? "bg-caramel" : "bg-sky-400",
                    )}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={result ? advance : confirm}
                className="inline-flex h-12 min-w-[9rem] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-caramel to-ember px-6 text-sm font-bold uppercase tracking-wide text-ink transition hover:brightness-105"
              >
                {result ? (round >= HC_ROUNDS ? "Risultato" : "Avanti") : "Conferma"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {done ? (
          <GameOver
            title={`${formatCount(total)} punti`}
            record={total > bestAtStart.current && total > 0}
            subtitle={`Su ${formatCount(HC_ROUNDS * 1000)} possibili · record ${formatCount(Math.max(bestAtStart.current, total))}`}
            share={`Ho fatto ${formatCount(total)} punti a «${c.title}» (Caldo o freddo) nel Number Quiz di Vinili & Caffè!`}
            onRestart={onRestart}
            onExit={onExit}
          />
        ) : null}
      </AnimatePresence>
    </Shell>
  );
}
