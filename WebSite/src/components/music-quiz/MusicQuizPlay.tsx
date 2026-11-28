"use client";

import { useSitePresence } from "@/lib/presenceState";
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  answerMusicQuizRound,
  finishMusicQuizSession,
  MUSIC_QUIZ_ANSWER_MS,
  type MusicQuizDifficulty,
  type MusicQuizRound,
} from "@/lib/musicQuiz";
import { MusicQuizResults, type RoundRecap } from "./MusicQuizResults";
import type { QuizReward } from "@/components/number-quiz/QuizRewardNote";
import { AnswerGrid, GameStage, QuizTurntable, RevealCard, RoundDots, useCountdown, useQuizClip } from "./QuizStage";

type Feedback = { correct: boolean; timeout: boolean; title: string; artist: string; cover?: string; points: number; correctIndex: number; picked: number | null };

/* dopo la risposta si va avanti da soli, o prima con «Avanti» */
const NEXT_AFTER_MS = 2600;

export function MusicQuizPlay({
  sessionId,
  packSlug,
  packTitle,
  packCover,
  difficulty,
  clipMs,
  answerMs = MUSIC_QUIZ_ANSWER_MS,
  initialRound,
  onExit,
  onAgain,
}: {
  sessionId: string;
  packSlug: string;
  packTitle: string;
  packCover?: string;
  difficulty: MusicQuizDifficulty;
  clipMs: number;
  answerMs?: number;
  initialRound: MusicQuizRound;
  onExit: () => void;
  onAgain: () => void;
}) {
  const { token } = useAuth();
  const [round, setRound] = useState<MusicQuizRound>(initialRound);
  const [next, setNext] = useState<{ round: MusicQuizRound | null; done: boolean } | null>(null);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [recap, setRecap] = useState<RoundRecap[]>([]);
  const [err, setErr] = useState("");
  const [results, setResults] = useState<{ score: number; best: number; maxScore: number; correctCount: number; rounds: number; reward?: QuizReward } | null>(null);
  const advanceTimer = useRef(0);

  const total = round.total || 10;
  const clip = useQuizClip(round.previewUrl, clipMs, round.index, round.start);
  const left = useCountdown(clip.startedAt, answerMs, !feedback);
  /* stato su Discord (PreMiD / Attività): quiz, domanda e punti */
  const [startedAt] = useState(() => Date.now());
  useSitePresence(
    {
      details: `Music Quiz · ${packTitle}`,
      state: results ? `Ha finito con ${results.score} punti` : `Domanda ${round.index + 1} di ${round.total || 10} · ${score} punti`,
      image: packCover,
      imageText: packTitle,
      startedAt,
    },
    2,
  );

  async function send(choice: number) {
    if (sending || feedback) return;
    setSending(true);
    setPicked(choice >= 0 ? choice : null);
    const ms = clip.startedAt != null ? Math.round(performance.now() - clip.startedAt) : answerMs;
    const r = await answerMusicQuizRound(token || "", { sessionId, index: round.index, choice, ms });
    setSending(false);
    if (!r.ok) {
      setErr(r.message);
      setPicked(null);
      return;
    }
    clip.stop();
    setScore(r.data.score);
    const fb: Feedback = {
      correct: r.data.correct,
      timeout: choice < 0,
      title: r.data.title,
      artist: r.data.artist,
      cover: r.data.cover,
      points: r.data.points,
      correctIndex: r.data.correctIndex,
      picked: choice >= 0 ? choice : null,
    };
    setFeedback(fb);
    setRecap((prev) => [...prev, { title: fb.title, artist: fb.artist, cover: fb.cover, correct: fb.correct, points: fb.points }]);
    setNext({ round: r.data.nextRound, done: r.data.done || !r.data.nextRound });
  }

  /* tempo scaduto: risposta vuota */
  useEffect(() => {
    if (left <= 0 && clip.startedAt != null && !feedback && !sending) void send(-1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);

  async function advance() {
    window.clearTimeout(advanceTimer.current);
    if (!next) return;
    if (next.done || !next.round) {
      const fin = await finishMusicQuizSession(token || "", sessionId);
      if (fin.ok) {
        setResults({ score: fin.data.score, best: fin.data.best, maxScore: fin.data.maxScore, correctCount: fin.data.correctCount, rounds: fin.data.rounds, reward: fin.data.reward });
      } else setErr(fin.message);
      return;
    }
    setFeedback(null);
    setPicked(null);
    setNext(null);
    setErr("");
    setRound(next.round);
  }

  useEffect(() => {
    if (!feedback) return;
    advanceTimer.current = window.setTimeout(() => void advance(), NEXT_AFTER_MS);
    return () => window.clearTimeout(advanceTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedback]);

  if (results) {
    return (
      <MusicQuizResults
        packSlug={packSlug}
        packTitle={packTitle}
        packCover={packCover}
        difficulty={difficulty}
        recap={recap}
        {...results}
        onAgain={onAgain}
        onExit={onExit}
      />
    );
  }

  const dots = Array.from({ length: total }, (_, i) => (recap[i] ? recap[i].correct : null));

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-24 sm:pt-28">
      <GameStage
        cover={packCover}
        top={
          <>
            <button type="button" onClick={onExit} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-crema/70 ring-1 ring-sand/15 transition hover:text-crema">
              <ArrowLeft className="size-4" aria-hidden /> Esci
            </button>
            <div className="hidden min-w-0 flex-1 items-center justify-center gap-3 sm:flex">
              <span className="truncate text-sm font-semibold text-crema/80">{packTitle}</span>
              <RoundDots total={total} current={round.index} results={dots} />
            </div>
            <motion.span
              key={score}
              initial={{ scale: 1.25 }}
              animate={{ scale: 1 }}
              className="min-w-16 rounded-full bg-caramel/15 px-3 py-1.5 text-center font-display text-lg font-semibold tabular-nums text-caramel ring-1 ring-caramel/30"
            >
              {score}
            </motion.span>
          </>
        }
        side={<QuizTurntable cover={packCover} clip={clip.state} clipMs={clipMs} left={feedback ? answerMs : left} totalMs={answerMs} onReplay={clip.replay} />}
      >
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-caramel">
              Domanda {round.index + 1} di {total}
            </p>
            <p className="mt-1 font-display text-3xl font-semibold text-crema">Che canzone è?</p>
          </div>
          <span className="sm:hidden">
            <RoundDots total={total} current={round.index} results={dots} />
          </span>
        </div>

        <AnswerGrid
          options={round.options}
          disabled={Boolean(feedback) || sending || clip.startedAt == null}
          picked={feedback ? feedback.picked : picked}
          correctIndex={feedback ? feedback.correctIndex : null}
          timedOut={Boolean(feedback?.timeout)}
          onPick={(i) => void send(i)}
        />

        <RevealCard
          show={Boolean(feedback)}
          correct={Boolean(feedback?.correct)}
          timeout={feedback?.timeout}
          points={feedback?.points || 0}
          title={feedback?.title || ""}
          artist={feedback?.artist || ""}
          cover={feedback?.cover}
        >
          <button
            type="button"
            onClick={() => void advance()}
            className="ml-1 inline-flex shrink-0 items-center gap-1 rounded-full bg-crema/10 px-3 py-2 text-sm font-semibold text-crema ring-1 ring-sand/20 transition hover:bg-crema/15"
          >
            {next?.done ? "Risultati" : "Avanti"} <ArrowRight className="size-4" aria-hidden />
          </button>
        </RevealCard>

        {err ? <p className="text-sm text-ember">{err}</p> : null}
      </GameStage>
    </div>
  );
}
