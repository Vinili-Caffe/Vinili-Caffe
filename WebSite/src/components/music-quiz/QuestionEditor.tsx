"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Check, Pause, Play, RefreshCw, Shuffle, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { clipSource } from "@/lib/clipCache";
import type { MusicQuizTrack } from "@/lib/musicQuiz";

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
  onChange,
  onReplace,
  onRemove,
}: {
  q: QuizQuestion;
  index: number;
  total: number;
  /** titoli degli altri brani del quiz, per «Riempi a caso» */
  pool: string[];
  onChange: (next: QuizQuestion) => void;
  onReplace: () => void;
  onRemove: () => void;
}) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const tick = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);

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

  function fillRandom() {
    const correct = (q.answer.trim() || q.title).toLowerCase();
    const choices = [...new Set(pool)].filter((t) => t.toLowerCase() !== correct);
    for (let i = choices.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [choices[i], choices[j]] = [choices[j]!, choices[i]!];
    }
    onChange({ ...q, wrong: [0, 1, 2].map((i) => choices[i] || "") });
  }

  const setWrong = (i: number, v: string) => onChange({ ...q, wrong: q.wrong.map((w, k) => (k === i ? v : w)) });
  const left = (q.start / PREVIEW_SEC) * 100;
  const width = (CLIP_SEC / PREVIEW_SEC) * 100;

  return (
    <motion.section
      key={q.id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-7 rounded-[2rem] bg-gradient-to-br from-mocha to-roast p-5 ring-1 ring-sand/15 sm:p-8"
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-crema/60">
          Domanda {index + 1} / {total}
        </p>
        <button type="button" onClick={onRemove} className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-crema/45 transition hover:text-ember">
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
              className="grid size-14 shrink-0 place-items-center rounded-full bg-gradient-to-br from-caramel to-ember text-ink shadow-lg transition hover:scale-105"
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
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-crema/55">Spezzone</p>
          <p className="font-mono text-xs tabular-nums text-crema/70">
            {mmss(q.start)} – {mmss(q.start + CLIP_SEC)}
          </p>
        </div>
        <div className="relative mt-3 h-8">
          <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-crema/10" />
          <div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-caramel" style={{ left: `${left}%`, width: `${width}%` }} />
          <input
            type="range"
            min={0}
            max={MAX_START}
            step={0.5}
            value={q.start}
            onChange={(e) => onChange({ ...q, start: Number(e.target.value) })}
            aria-label="Da che secondo parte lo spezzone"
            className="absolute inset-0 w-full cursor-pointer appearance-none bg-transparent [&::-moz-range-thumb]:size-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-crema [&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-crema [&::-webkit-slider-thumb]:shadow-[0_0_0_4px_rgba(214,154,95,0.45)]"
          />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-crema/45">
          Deezer dà 30 secondi di anteprima: scegli da dove parte lo spezzone. In partita se ne sentono 5, 3 o 1 secondo a seconda della difficoltà, sempre da questo punto.
        </p>
      </div>

      {/* risposte */}
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-crema/55">Risposte</p>
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
          <AnswerInput letter="A" value={q.answer} placeholder={q.title} onChange={(v) => onChange({ ...q, answer: v })} correct />
          {[0, 1, 2].map((i) => (
            <AnswerInput key={i} letter={"BCD"[i]!} value={q.wrong[i] || ""} placeholder="Scelta a caso" onChange={(v) => setWrong(i, v)} />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-crema/45">Le risposte lasciate vuote si riempiono da sole con altri brani del quiz, diverse a ogni partita.</p>
          <button
            type="button"
            onClick={fillRandom}
            disabled={pool.length < 2}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-crema/75 transition hover:text-caramel disabled:opacity-40"
          >
            <Shuffle className="size-4" aria-hidden /> Riempi le opzioni a caso
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
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-ink/10 text-sm font-bold text-ink/60">{letter}</span>
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
