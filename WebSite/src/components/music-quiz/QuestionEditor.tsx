"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Check, Loader2, Pause, Play, RefreshCw, Shuffle, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { clipSource } from "@/lib/clipCache";
import { loadArtistTitles, type MusicQuizTrack } from "@/lib/musicQuiz";

/** Un brano del quiz con le scelte di chi lo crea. */
export type QuizQuestion = MusicQuizTrack & {
  /** secondo dell'anteprima da cui parte lo spezzone */
  start: number;
  /** risposta giusta come la vedono i giocatori (vuota = titolo del brano) */
  answer: string;
  /** fino a 3 risposte sbagliate scritte a mano (vuote = scelte a caso tra gli altri brani) */
  wrong: string[];
};

export const PREVIEW_SEC = 30;
/** lo spezzone più lungo in partita (difficoltà «5 secondi») */
export const CLIP_SEC = 5;
export const MAX_START = PREVIEW_SEC - CLIP_SEC;
/** lo spezzone si sposta a blocchi di 5 secondi: 0–5, 5–10 … 25–30 */
const SEGMENTS = PREVIEW_SEC / CLIP_SEC;

export const asQuestion = (t: MusicQuizTrack): QuizQuestion => ({ ...t, start: 0, answer: "", wrong: ["", "", ""] });

/** domanda toccata da chi crea: si vede un pallino nell'elenco */
export const isCustomized = (q: QuizQuestion) => q.start > 0 || Boolean(q.answer.trim()) || q.wrong.some((w) => w.trim());

const mmss = (s: number) => {
  const t = Math.max(0, Math.floor(s));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

export function QuestionEditor({
  q,
  index,
  total,
  pool,
  token,
  onChange,
  onReplace,
  onRemove,
}: {
  q: QuizQuestion;
  index: number;
  total: number;
  /** titoli degli altri brani del quiz: riserva per «Riempi a caso» se l'artista ha pochi brani */
  pool: string[];
  token: string | null;
  onChange: (next: QuizQuestion) => void;
  onReplace: () => void;
  onRemove: () => void;
}) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const tick = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [filling, setFilling] = useState(false);

  /* brano o spezzone cambiato: si ferma quello che suonava */
  useEffect(() => {
    audio.current?.pause();
    window.clearInterval(tick.current);
    setPlaying(false);
    setPos(0);
  }, [q.id, q.start]);
  useEffect(
    () => () => {
      audio.current?.pause();
      window.clearInterval(tick.current);
    },
    [],
  );

  async function toggle() {
    if (!q.previewUrl) return;
    const a = audio.current || new Audio();
    audio.current = a;
    if (playing) {
      a.pause();
      window.clearInterval(tick.current);
      setPlaying(false);
      return;
    }
    const src = await clipSource(q.previewUrl, 4000);
    if (a.dataset.for !== q.previewUrl) {
      a.src = src;
      a.dataset.for = q.previewUrl;
    }
    const begin = () => {
      try {
        a.currentTime = q.start;
      } catch {
        /* ancora senza dati */
      }
      void a.play().then(() => {
        setPlaying(true);
        tick.current = window.setInterval(() => {
          const p = a.currentTime - q.start;
          setPos(Math.max(0, p));
          if (p >= CLIP_SEC || a.ended) {
            a.pause();
            window.clearInterval(tick.current);
            setPlaying(false);
          }
        }, 50);
      });
    };
    if (a.readyState >= 2) begin();
    else a.addEventListener("canplay", begin, { once: true });
  }

  /** risposte sbagliate credibili: altri brani dello stesso artista (poi, se non bastano, gli altri brani del quiz) */
  async function fillRandom() {
    setFilling(true);
    const fromArtist = token && q.artistId ? await loadArtistTitles(token, q.artistId).catch(() => []) : [];
    setFilling(false);
    const key = (t: string) => t.toLowerCase().replace(/\s*[([].*?[)\]]/g, "").trim();
    const correct = key(q.answer.trim() || q.title);
    const pick = (list: string[]) => {
      const out = [...new Set(list)].filter((t) => key(t) && key(t) !== correct);
      for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    };
    const seen = new Set<string>();
    const chosen = [...pick(fromArtist), ...pick(pool)].filter((t) => (seen.has(key(t)) ? false : (seen.add(key(t)), true))).slice(0, 3);
    onChange({ ...q, wrong: [0, 1, 2].map((i) => chosen[i] || "") });
  }

  const setWrong = (i: number, v: string) => onChange({ ...q, wrong: q.wrong.map((w, k) => (k === i ? v : w)) });

  return (
    <motion.section
      key={q.id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-7 rounded-[2rem] bg-gradient-to-br from-mocha to-roast p-5 ring-1 ring-sand/15 sm:p-8"
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-crema/60">
          Domanda {index + 1} / {total}
        </p>
        <button type="button" onClick={onRemove} className="inline-flex items-center gap-1.5 text-xs font-semibold text-crema/45 transition hover:text-ember">
          <Trash2 className="size-3.5" aria-hidden /> Rimuovi
        </button>
      </div>

      {/* brano */}
      <div className="flex flex-col gap-4 rounded-3xl bg-ink/30 p-4 ring-1 ring-sand/10 sm:flex-row sm:items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={q.cover || "/images/logo-disco.png"} alt="" className="size-28 shrink-0 rounded-2xl object-cover shadow-lg ring-1 ring-sand/15 sm:size-32" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-display text-2xl font-semibold text-crema">{q.title}</p>
              <p className="truncate text-sm text-crema/60">{q.artist}</p>
            </div>
            <button type="button" onClick={onReplace} className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-crema/60 transition hover:text-caramel">
              <RefreshCw className="size-3.5" aria-hidden /> Cambia brano
            </button>
          </div>
          <div className="mt-3 flex items-center gap-4">
            <button
              type="button"
              onClick={() => void toggle()}
              aria-label={playing ? "Ferma lo spezzone" : "Ascolta lo spezzone"}
              className="grid size-14 shrink-0 place-items-center rounded-full bg-caramel text-ink shadow-lg transition "
            >
              {playing ? <Pause className="size-6 fill-current" /> : <Play className="ml-0.5 size-6 fill-current" />}
            </button>
            <div className="min-w-0 flex-1">
              <div className="h-1.5 overflow-hidden rounded-full bg-crema/10">
                <div className="h-full rounded-full bg-caramel transition-[width] duration-100" style={{ width: `${Math.min(100, (pos / CLIP_SEC) * 100)}%` }} />
              </div>
            </div>
            <p className="shrink-0 font-mono text-sm tabular-nums text-crema">
              {mmss(pos)} / {mmss(CLIP_SEC)}
            </p>
          </div>
        </div>
      </div>

      {/* spezzone */}
      <div>
        <div className="flex items-baseline justify-between">
          <p className="text-xs font-semibold text-crema/55">Spezzone</p>
          <p className="font-mono text-xs tabular-nums text-crema/70">
            {mmss(q.start)} – {mmss(q.start + CLIP_SEC)}
          </p>
        </div>
        <SegmentPicker value={Math.round(q.start / CLIP_SEC)} onChange={(i) => onChange({ ...q, start: i * CLIP_SEC })} />
        <p className="mt-2 text-xs leading-relaxed text-crema/45">
          Deezer dà 30 secondi di anteprima: trascina il pezzo da 5 secondi da far ascoltare, si sposta di 5 secondi alla volta. Con le difficoltà più alte se ne sentono solo i primi 3 o 1 secondo.
        </p>
      </div>

      {/* risposte */}
      <div>
        <p className="text-xs font-semibold text-crema/55">Risposte</p>
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
          <AnswerInput letter="A" value={q.answer} placeholder={q.title} onChange={(v) => onChange({ ...q, answer: v })} correct />
          {[0, 1, 2].map((i) => (
            <AnswerInput key={i} letter={"BCD"[i]!} value={q.wrong[i] || ""} placeholder="Scelta a caso" onChange={(v) => setWrong(i, v)} />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-crema/45">Le risposte lasciate vuote si riempiono da sole con altri brani dello stesso artista, diverse a ogni partita. «A caso» te le mostra subito, così puoi cambiarle.</p>
          <button
            type="button"
            onClick={() => void fillRandom()}
            disabled={filling}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-crema/75 transition hover:text-caramel disabled:opacity-50"
          >
            {filling ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Shuffle className="size-4" aria-hidden />} Riempi le opzioni a caso
          </button>
        </div>
      </div>
    </motion.section>
  );
}

function AnswerInput({
  letter,
  value,
  placeholder,
  onChange,
  correct,
}: {
  letter: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  correct?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex items-center gap-3 rounded-2xl bg-crema px-3 py-3 ring-2 transition focus-within:ring-caramel",
        correct ? "ring-emerald-400/70" : "ring-transparent",
      )}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-ink/10 text-sm font-semibold text-ink/60">{letter}</span>
      <input
        value={value}
        maxLength={90}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-[0.95rem] font-semibold text-ink outline-none placeholder:font-semibold placeholder:text-ink/35"
      />
      <span
        className={cn("grid size-8 shrink-0 place-items-center rounded-full", correct ? "bg-emerald-500 text-white" : "bg-ink/10 text-ink/30")}
        title={correct ? "Risposta giusta" : "Risposta sbagliata"}
      >
        <Check className="size-4" aria-hidden />
      </span>
    </label>
  );
}

/** Barra dell'anteprima (30 s): il pezzo da 5 secondi si trascina intero e scatta di 5 in 5. */
function SegmentPicker({ value, onChange }: { value: number; onChange: (i: number) => void }) {
  const bar = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const at = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect();
    return Math.max(0, Math.min(SEGMENTS - 1, Math.floor(((clientX - r.left) / r.width) * SEGMENTS)));
  };
  return (
    <div className="mt-3">
      <div
        ref={bar}
        role="slider"
        tabIndex={0}
        aria-label="Pezzo da ascoltare"
        aria-valuemin={0}
        aria-valuemax={SEGMENTS - 1}
        aria-valuenow={value}
        aria-valuetext={`da ${mmss(value * CLIP_SEC)} a ${mmss((value + 1) * CLIP_SEC)}`}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowUp") onChange(Math.min(SEGMENTS - 1, value + 1));
          if (e.key === "ArrowLeft" || e.key === "ArrowDown") onChange(Math.max(0, value - 1));
        }}
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          onChange(at(e.clientX));
        }}
        onPointerMove={(e) => {
          if (dragging.current) {
            const i = at(e.clientX);
            if (i !== value) onChange(i);
          }
        }}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
        className="group relative h-8 cursor-grab touch-none select-none outline-none active:cursor-grabbing"
      >
        {/* binario sottile con una tacca ogni 5 secondi */}
        <span className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-crema/10" />
        {Array.from({ length: SEGMENTS - 1 }, (_, i) => (
          <span
            key={i}
            className="absolute top-1/2 h-2.5 w-px -translate-y-1/2 bg-crema/20"
            style={{ left: `${((i + 1) / SEGMENTS) * 100}%` }}
          />
        ))}
        {/* il pezzo da 5 secondi: si sposta intero, a scatti */}
        <motion.span
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-caramel group-focus-visible:ring-2 group-focus-visible:ring-caramel/50"
          style={{ width: `${100 / SEGMENTS}%` }}
          animate={{ left: `${(value / SEGMENTS) * 100}%` }}
          transition={{ type: "spring", stiffness: 520, damping: 40 }}
        >
          <span className="absolute -left-2 top-1/2 size-4 -translate-y-1/2 rounded-full bg-caramel shadow-[0_0_0_4px_rgba(214,154,95,0.25)]" />
          <span className="absolute -right-2 top-1/2 size-4 -translate-y-1/2 rounded-full bg-caramel shadow-[0_0_0_4px_rgba(214,154,95,0.25)]" />
        </motion.span>
      </div>
    </div>
  );
}
