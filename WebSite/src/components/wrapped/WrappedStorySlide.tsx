"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion-safe";
import { Avatar } from "@/components/Avatar";
import { VinylRecord } from "@/components/VinylRecord";
import type { WrappedPayload } from "@/lib/wrapped";
import type { WrappedMood } from "@/lib/wrappedMoods";
import type { StoryCard } from "@/lib/wrappedStories";

const ease = [0.22, 1, 0.36, 1] as const;

/** «1.234 messaggi» / «12,5 h» → cifra grezza + unità */
function splitStat(stat?: string) {
  const m = String(stat || "")
    .replace(/\u00a0|\u202f/g, " ")
    .trim()
    .match(/^([\d.,]+)\s*(.*)$/);
  if (!m) return null;
  /* «h» e «min» per esteso: sotto un numero enorme si leggono meglio */
  const unit = m[2] === "h" ? "ore" : m[2] === "min" ? "minuti" : m[2] || "";
  return { num: m[1]!, unit };
}

/** Intero da stringa it-IT («1.272.342» / «112.103» / «155» / «12,5»). */
function parseStatInt(value: string): number | null {
  const raw = String(value || "")
    .replace(/\u00a0|\u202f/g, "")
    .trim();
  if (!raw) return null;
  /* solo interi con punti migliaia */
  if (/^\d{1,3}(\.\d{3})+$/.test(raw) || /^\d+$/.test(raw)) {
    const n = Number(raw.replace(/\./g, ""));
    return Number.isFinite(n) ? n : null;
  }
  /* decimali it: 12,5 → 13 arrotondato per il count-up */
  if (/^\d{1,3}(\.\d{3})*,\d+$/.test(raw) || /^\d+,\d+$/.test(raw)) {
    const n = Number(raw.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? Math.round(n) : null;
  }
  /* fallback: tieni solo le cifre */
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

/* il numero conta da zero (interi, scritti all'italiana) */
function CountUp({ value }: { value: string }) {
  const reduce = useReducedMotionSafe();
  const target = parseStatInt(value);
  /* null finché non sappiamo se animare: così non restiamo bloccati su 0
     quando useReducedMotionSafe passa false→true dopo il mount. */
  const [n, setN] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    if (target == null) {
      setN(null);
      return;
    }
    if (reduce) {
      setN(target);
      return;
    }
    setN(0);
    let raf = 0;
    let alive = true;
    const start = performance.now();
    const tick = (t: number) => {
      if (!alive) return;
      const p = Math.min(1, (t - start) / 1100);
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setN(target);
    };
    raf = requestAnimationFrame(tick);
    /* garanzia: anche con RAF sospeso (tab in background) il valore finale arriva */
    const done = window.setTimeout(() => {
      if (alive) setN(target);
    }, 1200);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.clearTimeout(done);
    };
  }, [ready, target, reduce]);
  if (n == null) return <>{value}</>;
  return <>{new Intl.NumberFormat("it-IT").format(n)}</>;
}

function Kicker({ text, mood }: { text: string; mood: WrappedMood }) {
  return (
    <motion.p
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.45, ease }}
      className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold"
      style={{ borderColor: `${mood.ink}40`, color: mood.ink }}
    >
      <span className="size-1.5 rounded-full" style={{ background: mood.mark }} />
      {text}
    </motion.p>
  );
}

function Body({ card, mood, delay = 0.35 }: { card: StoryCard; mood: WrappedMood; delay?: number }) {
  return (
    <>
      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay, duration: 0.5, ease }}
        className="mt-5 max-w-lg text-lg leading-snug sm:text-xl"
        style={{ color: mood.ink, opacity: 0.85 }}
      >
        {card.body}
      </motion.p>
      {card.footnote ? (
        <motion.p
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: delay + 0.2, duration: 0.4, ease }}
          className="mt-5 inline-flex rounded-full px-4 py-2 text-sm font-bold"
          style={{ background: mood.ink, color: mood.paper }}
        >
          {card.footnote}
        </motion.p>
      ) : null}
    </>
  );
}

/**
 * Una scheda del Wrapped, a tutta pagina.
 * - saluto: la tua foto al centro di un disco
 * - numeri: il dato enorme che conta, poi il titolo evidenziato e la frase
 * - ruolo: una copertina d'album con il tuo ruolo
 */
export function WrappedStorySlide({ card, mood, data }: { card: StoryCard; mood: WrappedMood; data: WrappedPayload }) {
  const reduce = useReducedMotionSafe();
  const stat = splitStat(card.stat);

  if (card.key === "hello") {
    return (
      <div className="flex flex-col items-start">
        <motion.div
          initial={reduce ? false : { scale: 0.6, rotate: -90, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ duration: 0.9, ease }}
          className="relative mb-8 size-36 sm:size-44"
        >
          <motion.div
            className="size-full"
            animate={reduce ? undefined : { rotate: 360 }}
            transition={reduce ? undefined : { duration: 9, repeat: Infinity, ease: "linear" }}
          >
            <VinylRecord className="size-full drop-shadow-[0_20px_40px_rgba(0,0,0,0.5)]" />
          </motion.div>
          <Avatar
            userId={data.user.id}
            src={data.user.avatarUrl || undefined}
            name={data.user.displayName}
            noPresence
            className="absolute left-1/2 top-1/2 size-[42%] -translate-x-1/2 -translate-y-1/2 ring-4 ring-[#1b1410]"
          />
        </motion.div>
        <Kicker text={card.kicker} mood={mood} />
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.6, ease }}
          className="mt-4 font-display text-[clamp(3.2rem,13vw,7.5rem)] font-semibold leading-[0.9] tracking-tight"
          style={{ color: mood.ink }}
        >
          {card.title}
        </motion.h1>
        <Body card={card} mood={mood} />
      </div>
    );
  }

  if (card.key === "role") {
    return (
      <div className="flex flex-col items-start">
        <Kicker text={card.kicker} mood={mood} />
        {/* la copertina del tuo album, con il disco che esce dalla busta */}
        <div className="relative mt-6 w-full max-w-[19rem] sm:max-w-sm">
          <motion.div
            className="absolute inset-y-[6%] right-[-34%] aspect-square"
            initial={reduce ? false : { x: "-40%", rotate: -60 }}
            animate={{ x: 0, rotate: 0 }}
            transition={{ delay: 0.45, duration: 1, ease }}
          >
            <motion.div className="size-full" animate={reduce ? undefined : { rotate: 360 }} transition={reduce ? undefined : { duration: 12, repeat: Infinity, ease: "linear" }}>
              <VinylRecord className="size-full" />
            </motion.div>
          </motion.div>
          <motion.div
            initial={reduce ? false : { y: 40, rotate: -8, opacity: 0 }}
            animate={{ y: 0, rotate: -2, opacity: 1 }}
            transition={{ duration: 0.7, ease }}
            className="relative flex aspect-square flex-col justify-between p-6 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.6)]"
            style={{ background: mood.mark, color: mood.paper }}
          >
            <div className="flex items-start justify-between text-xs font-semibold opacity-80">
              <span>Vinili & Caffè</span>
              <span>Lato A</span>
            </div>
            <p className="font-display text-[clamp(2.2rem,9vw,3.4rem)] font-semibold leading-[0.92]">{card.title}</p>
            <p className="text-xs font-semibold opacity-80">{data.user.displayName}</p>
          </motion.div>
        </div>
        <Body card={card} mood={mood} delay={0.6} />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start">
      <Kicker text={card.kicker} mood={mood} />
      {stat ? (
        <>
          <motion.p
            initial={reduce ? false : { opacity: 0, y: 40, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.1, duration: 0.7, ease }}
            className="mt-4 font-display text-[clamp(5rem,26vw,13rem)] font-semibold leading-[0.82] tracking-tight lining-nums"
            style={{ color: mood.ink }}
          >
            <CountUp key={stat.num} value={stat.num} />
          </motion.p>
          {stat.unit ? (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="mt-2 text-xl font-bold uppercase tracking-[0.18em] sm:text-2xl"
              style={{ color: mood.ink, opacity: 0.7 }}
            >
              {stat.unit}
            </motion.p>
          ) : null}
        </>
      ) : null}
      {card.title !== card.stat ? (
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: stat ? 0.45 : 0.15, duration: 0.5, ease }}
          className={stat ? "mt-6 font-display text-3xl font-semibold leading-tight sm:text-5xl" : "mt-4 font-display text-[clamp(3rem,12vw,6.5rem)] font-semibold leading-[0.92]"}
        >
          {/* titolo «evidenziato» come un'etichetta incollata */}
          <span className="box-decoration-clone px-2 py-0.5" style={{ background: mood.ink, color: mood.paper }}>
            {card.title}
          </span>
        </motion.h2>
      ) : null}
      <Body card={card} mood={mood} delay={stat ? 0.6 : 0.35} />
    </div>
  );
}
