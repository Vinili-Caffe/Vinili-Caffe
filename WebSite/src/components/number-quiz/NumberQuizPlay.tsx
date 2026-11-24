"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, animate, motion } from "motion/react";
import { ArrowDown, ArrowLeft, ArrowUp, Check, Flame, Loader2, RotateCcw, Trophy, X } from "lucide-react";
import { SmartLink } from "@/components/SmartLink";
import { useAuth } from "@/lib/auth";
import { page } from "@/lib/site";
import { cn } from "@/lib/cn";
import {
  builtinNumberQuiz,
  countNumberQuizPlay,
  formatQuizNumber,
  loadNumberQuiz,
  type NumberQuizItem,
  type NumberQuizPack,
} from "@/lib/numberQuiz";

type Phase = "guess" | "reveal" | "right" | "wrong";

function shuffle<T>(arr: T[]) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const bestKey = (slug: string) => `vc-numquiz-best:${slug}`;
function readBest(slug: string) {
  try {
    return Number(localStorage.getItem(bestKey(slug)) || 0) || 0;
  } catch {
    return 0;
  }
}
function writeBest(slug: string, n: number) {
  try {
    localStorage.setItem(bestKey(slug), String(n));
  } catch {
    /* niente memoria: il record vale solo per questa partita */
  }
}

/** Numero che sale fino al valore vero quando si scopre la carta. */
function CountUp({ to, plain, run }: { to: number; plain?: boolean; run: boolean }) {
  const [v, setV] = useState(run ? 0 : to);
  useEffect(() => {
    if (!run) {
      setV(to);
      return;
    }
    const decimals = Number.isInteger(to) ? 0 : 1;
    const c = animate(0, to, {
      duration: 0.9,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (x) => setV(decimals ? Math.round(x * 10) / 10 : Math.round(x)),
    });
    return () => c.stop();
  }, [to, run]);
  return <>{formatQuizNumber(v, plain)}</>;
}

export function NumberQuizPlay() {
  const sp = useSearchParams();
  const slug = String(sp.get("slug") || "").trim();
  const { token } = useAuth();
  const [pack, setPack] = useState<NumberQuizPack | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!slug) {
      setError("Scegli una categoria per giocare.");
      return;
    }
    const builtin = builtinNumberQuiz(slug);
    if (builtin) {
      setPack(builtin);
      return;
    }
    let alive = true;
    void loadNumberQuiz(slug, token).then((r) => {
      if (!alive) return;
      if (r.ok) setPack(r.data.pack);
      else setError(r.message);
    });
    return () => {
      alive = false;
    };
  }, [slug, token]);

  if (error) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-crema/70">{error}</p>
        <SmartLink href={page("/quiz/numeri/")} className="mt-5 inline-flex items-center gap-2 rounded-full bg-caramel px-5 py-2.5 text-sm font-bold text-ink">
          <ArrowLeft className="size-4" /> Tutte le categorie
        </SmartLink>
      </div>
    );
  }
  if (!pack?.items) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="size-7 animate-spin text-caramel" />
      </div>
    );
  }
  return <Game key={pack.slug} pack={pack} items={pack.items} />;
}

function Game({ pack, items }: { pack: NumberQuizPack; items: NumberQuizItem[] }) {
  const deck = useRef<NumberQuizItem[]>([]);
  const [left, setLeft] = useState<NumberQuizItem | null>(null);
  const [right, setRight] = useState<NumberQuizItem | null>(null);
  const [phase, setPhase] = useState<Phase>("guess");
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [round, setRound] = useState(0);
  const counted = useRef(false);
  const bestAtStart = useRef(0);

  /* la prossima carta: diversa da quella a sinistra e, se si può, con un numero diverso */
  const draw = useCallback(
    (from: NumberQuizItem) => {
      for (let tries = 0; tries < items.length * 2; tries++) {
        if (!deck.current.length) deck.current = shuffle(items);
        const next = deck.current.pop()!;
        if (next.name !== from.name && (next.value !== from.value || tries > items.length)) return next;
      }
      return items.find((x) => x.name !== from.name) || from;
    },
    [items],
  );

  const start = useCallback(() => {
    deck.current = shuffle(items);
    const first = deck.current.pop()!;
    setLeft(first);
    setRight(draw(first));
    setStreak(0);
    bestAtStart.current = readBest(pack.slug);
    setPhase("guess");
    setRound((r) => r + 1);
  }, [items, draw, pack.slug]);

  useEffect(() => {
    setBest(readBest(pack.slug));
    start();
    if (pack.community && !counted.current) {
      counted.current = true;
      void countNumberQuizPlay(pack.slug);
    }
  }, [pack.slug, pack.community, start]);

  function guess(higher: boolean) {
    if (phase !== "guess" || !left || !right) return;
    /* a pari merito vanno bene tutte e due le risposte */
    const ok = right.value === left.value || (higher ? right.value > left.value : right.value < left.value);
    setPhase("reveal");
    window.setTimeout(() => {
      if (ok) {
        const n = streak + 1;
        setStreak(n);
        if (n > best) {
          setBest(n);
          writeBest(pack.slug, n);
        }
        setPhase("right");
        window.setTimeout(() => {
          setLeft(right);
          setRight(draw(right));
          setPhase("guess");
          setRound((r) => r + 1);
        }, 900);
      } else {
        setPhase("wrong");
      }
    }, 1000);
  }

  /* da tastiera: frecce su e giù */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowUp") guess(true);
      else if (e.key === "ArrowDown") guess(false);
      else if (e.key === "Enter" && phase === "wrong") start();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!left || !right) return null;
  const shown = phase !== "guess";

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-16 pt-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <SmartLink href={page("/quiz/numeri/")} className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold uppercase tracking-wide text-crema/60 transition hover:bg-crema/[0.06] hover:text-crema">
          <ArrowLeft className="size-4" /> Categorie
        </SmartLink>
        <div className="flex items-center gap-2">
          <Pill icon={<Flame className="size-3.5" />} label="Serie" value={streak} hot={streak > 0} />
          <Pill icon={<Trophy className="size-3.5" />} label="Record" value={best} />
        </div>
      </div>

      <h1 className="mb-5 text-center font-display text-2xl text-crema sm:text-3xl">
        <span className="mr-2" aria-hidden>
          {pack.emoji}
        </span>
        {pack.title}
      </h1>

      <div className="relative grid gap-3 sm:grid-cols-2 sm:gap-4">
        <AnimatePresence mode="popLayout" initial={false}>
          <Card key={`l-${round}-${left.name}`} item={left} tone="left">
            <p className="font-mono text-4xl font-bold tabular-nums text-crema sm:text-5xl">
              {formatQuizNumber(left.value, pack.plain)}
            </p>
            {pack.unit ? <p className="mt-1 text-sm text-crema/55">{pack.unit}</p> : null}
          </Card>

          <Card key={`r-${round}-${right.name}`} item={right} tone={phase === "right" ? "right" : phase === "wrong" ? "wrong" : "idle"}>
            {shown ? (
              <>
                <p className="font-mono text-4xl font-bold tabular-nums text-crema sm:text-5xl">
                  <CountUp to={right.value} plain={pack.plain} run />
                </p>
                {pack.unit ? <p className="mt-1 text-sm text-crema/55">{pack.unit}</p> : null}
              </>
            ) : (
              <div className="flex w-full max-w-xs flex-col gap-2">
                <GuessButton onClick={() => guess(true)} icon={<ArrowUp className="size-5" />} label={pack.more} />
                <GuessButton onClick={() => guess(false)} icon={<ArrowDown className="size-5" />} label={pack.less} />
                <p className="mt-1 text-xs text-crema/45">rispetto a {left.name}</p>
              </div>
            )}
          </Card>
        </AnimatePresence>

        {/* il disco al centro: VS, poi giusto o sbagliato */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
          <motion.div
            key={phase}
            initial={{ scale: 0.6, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 18 }}
            className={cn(
              "grid size-14 place-items-center rounded-full font-display text-lg font-bold ring-4 ring-espresso",
              phase === "right" ? "bg-emerald-500 text-white" : phase === "wrong" ? "bg-ember text-white" : "bg-caramel text-ink",
            )}
          >
            {phase === "right" ? <Check className="size-7" /> : phase === "wrong" ? <X className="size-7" /> : "VS"}
          </motion.div>
        </div>
      </div>

      <AnimatePresence>
        {phase === "wrong" ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ delay: 0.5 }}
            className="mx-auto mt-6 max-w-md rounded-3xl bg-roast/80 p-5 text-center ring-1 ring-sand/15"
          >
            <p className="text-sm uppercase tracking-wide text-crema/50">Partita finita</p>
            <p className="mt-1 font-display text-3xl text-crema">
              Serie di <span className="text-caramel">{streak}</span>
            </p>
            {streak > bestAtStart.current ? <p className="mt-1 text-sm font-semibold text-caramel">Nuovo record!</p> : null}
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={start}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-6 py-3 text-sm font-bold uppercase tracking-wide text-ink transition hover:brightness-105"
              >
                <RotateCcw className="size-4" /> Rigioca
              </button>
              <SmartLink
                href={page("/quiz/numeri/")}
                className="inline-flex items-center gap-2 rounded-full bg-crema/[0.07] px-5 py-3 text-sm font-bold uppercase tracking-wide text-crema ring-1 ring-sand/15 transition hover:bg-crema/[0.12]"
              >
                Altre categorie
              </SmartLink>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function Card({
  item,
  tone,
  children,
}: {
  item: NumberQuizItem;
  tone: "left" | "idle" | "right" | "wrong";
  children: React.ReactNode;
}) {
  return (
    <motion.section
      layout
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ type: "spring", stiffness: 260, damping: 28 }}
      className={cn(
        "relative flex min-h-[15rem] flex-col items-center justify-center overflow-hidden rounded-3xl p-6 text-center ring-1 transition-colors sm:min-h-[22rem]",
        tone === "right"
          ? "bg-emerald-900/40 ring-emerald-400/50"
          : tone === "wrong"
            ? "bg-ember/15 ring-ember/50"
            : tone === "left"
              ? "bg-roast/80 ring-sand/15"
              : "bg-espresso/80 ring-caramel/25",
      )}
    >
      {item.image ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.image} alt="" className="absolute inset-0 size-full object-cover opacity-30" />
          <div className="absolute inset-0 bg-gradient-to-t from-espresso via-espresso/60 to-transparent" />
        </>
      ) : null}
      <div className="relative flex flex-col items-center">
        <h2 className="max-w-full text-balance font-display text-2xl leading-tight text-crema sm:text-3xl">{item.name}</h2>
        {item.sub ? <p className="mt-1 text-sm text-crema/55">{item.sub}</p> : null}
        <div className="mt-5 flex w-full flex-col items-center">{children}</div>
      </div>
    </motion.section>
  );
}

function GuessButton({ onClick, icon, label }: { onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-crema/[0.08] px-5 text-sm font-bold uppercase tracking-wide text-crema ring-1 ring-sand/20 transition hover:bg-caramel hover:text-ink"
    >
      {icon}
      {label}
    </motion.button>
  );
}

function Pill({ icon, label, value, hot }: { icon: React.ReactNode; label: string; value: number; hot?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-bold uppercase tracking-wide ring-1",
        hot ? "bg-caramel/20 text-caramel ring-caramel/40" : "bg-crema/[0.06] text-crema/70 ring-sand/15",
      )}
    >
      {icon}
      {label}
      <motion.span key={value} initial={{ scale: 1.5 }} animate={{ scale: 1 }} className="font-mono tabular-nums text-crema">
        {value}
      </motion.span>
    </span>
  );
}
