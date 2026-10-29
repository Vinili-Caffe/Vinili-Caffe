"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Reveal } from "@/components/Reveal";
import { cn } from "@/lib/cn";
import { playTypeSfx, unlockTypeSfx } from "@/lib/type-sfx";
import {
  MAX_ATTEMPTS,
  WORD_LEN,
  buildShareText,
  emptyStats,
  fetchDailyGame,
  findLocalStartedGame,
  isStartedGame,
  loadSavedGame,
  loadStats,
  loadToday,
  marksFromBoard,
  parseLang,
  postGuess,
  preferGame,
  pushDailyGame,
  recordFinishedGame,
  saveGame,
  upgradeKey,
  writeDayLock,
  type BoardRow,
  type KeyMarks,
  type Mark,
  type SavedGame,
  type WordleLang,
  type WordleStats as StatsData,
  type WordleToday,
} from "@/lib/wordle";
import { WordleKeyboard } from "./WordleKeyboard";
import { WordleStats } from "./WordleStats";
import { celebrate } from "@/lib/confetti";
import { useFxCap } from "@/components/effects/DeviceFxProvider";
import { useAuth } from "@/lib/auth";
import { pushStats, syncStats } from "@/lib/wordle";
import { useI18n } from "@/lib/i18n";

type Props = { initial: WordleToday | null };

const tileMark = (m?: Mark) => {
  if (m === "g") return "bg-[#58a64b] text-white ring-[#58a64b]/50";
  if (m === "y") return "bg-[#c9a227] text-ink ring-[#c9a227]/45";
  if (m === "b") return "bg-mocha text-crema/50 ring-sand/10";
  return "bg-mocha/80 text-crema ring-sand/18";
};

function CoasterTile({
  letter,
  mark,
  filled,
  reveal,
  shake,
  delay = 0,
}: {
  letter: string;
  mark?: Mark;
  filled?: boolean;
  reveal?: boolean;
  shake?: boolean;
  delay?: number;
}) {
  return (
    <motion.div
      animate={shake ? { x: [0, -6, 6, -4, 4, 0] } : reveal ? { rotateY: [90, 0], scale: [0.92, 1] } : { scale: filled ? 1.04 : 1 }}
      transition={
        shake
          ? { duration: 0.35 }
          : reveal
            ? { delay, duration: 0.35, ease: [0.22, 1, 0.36, 1] }
            : { type: "spring", stiffness: 420, damping: 22 }
      }
      className={cn(
        "relative grid aspect-square w-full place-items-center rounded-xl font-sans text-2xl font-bold uppercase leading-none lining-nums ring-1 sm:rounded-2xl sm:text-3xl",
        mark ? tileMark(mark) : filled ? "bg-mocha text-crema ring-sand/30" : "bg-roast/90 text-crema/25 ring-sand/12",
        !mark && "shadow-[inset_0_1px_0_rgba(244,233,216,0.06)]",
      )}
      style={{ transformStyle: "preserve-3d" }}
    >
      {!mark && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-[18%] rounded-full border border-sand/10 opacity-40"
        />
      )}
      <span className="relative block leading-none tracking-wide">{letter}</span>
    </motion.div>
  );
}

export function WordleBoard({ initial }: Props) {
  const { locale } = useI18n();
  const siteLang = parseLang(locale);
  const [lang, setLang] = useState<WordleLang>(initial?.lang || siteLang);
  const [day, setDay] = useState(initial?.day || "");
  const [playUrl, setPlayUrl] = useState(initial?.playUrl || "");
  const [board, setBoard] = useState<BoardRow[]>([]);
  const [current, setCurrent] = useState("");
  const [done, setDone] = useState(false);
  const [won, setWon] = useState(false);
  const confettiRich = useFxCap("confettiRich");
  const { token } = useAuth();

  const [lost, setLost] = useState(false);
  const [answer, setAnswer] = useState("");
  const [keyMarks, setKeyMarks] = useState<KeyMarks>({});
  const [busy, setBusy] = useState(false);
  const [booting, setBooting] = useState(true);
  // statistiche dal profilo (stesse su telefono e PC) appena c'è il login
  useEffect(() => {
    if (!token || booting) return;
    let alive = true;
    void syncStats(token, lang).then((s) => {
      if (alive) setStats(s);
    });
    return () => {
      alive = false;
    };
  }, [token, lang, booting]);
  const [toast, setToast] = useState("");
  const [shake, setShake] = useState(false);
  const [revealRow, setRevealRow] = useState<number | null>(null);
  const [stats, setStats] = useState<StatsData>(() => emptyStats());
  const [shareHint, setShareHint] = useState("");
  const [copyHint, setCopyHint] = useState("");
  const toastTimer = useRef<number | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 1600);
  }, []);

  const persist = useCallback(
    (next: {
      board: BoardRow[];
      done: boolean;
      won: boolean;
      lost: boolean;
      answer: string;
      keyMarks: KeyMarks;
      day: string;
      lang: WordleLang;
    }) => {
      const game: SavedGame = {
        day: next.day,
        lang: next.lang,
        board: next.board,
        done: next.done,
        won: next.won,
        lost: next.lost,
        answer: next.answer,
        keyMarks: next.keyMarks,
      };
      saveGame(game);
      if (token) void pushDailyGame(token, game);
    },
    [token],
  );

  const boot = useCallback(async (preferredLang: WordleLang) => {
    setBooting(true);
    setCurrent("");
    setBusy(false);
    setRevealRow(null);

    /* wordleOnePerDay1: se oggi hai già iniziato in un'altra lingua, resta su quella */
    const localStarted = findLocalStartedGame(
      /* day unknown yet — scan with ISO today; refined after /today */ new Date().toISOString().slice(0, 10),
    );
    let bootLang: WordleLang =
      (localStarted?.lang as WordleLang) || preferredLang;

    let today = await loadToday({ lang: bootLang, token });
    if (!today?.day) {
      today = {
        day: new Date().toISOString().slice(0, 10),
        lang: bootLang,
        wordLen: WORD_LEN,
        maxAttempts: MAX_ATTEMPTS,
        playUrl: "https://www.viniliecaffe.it/wordle/",
      };
    }

    if (today.lockedLang) bootLang = today.lockedLang;
    else if (today.game && isStartedGame(today.game)) bootLang = today.game.lang;
    else {
      const localForDay = findLocalStartedGame(today.day);
      if (localForDay?.lang) bootLang = localForDay.lang;
    }

    const local = preferGame(loadSavedGame(bootLang, today.day), findLocalStartedGame(today.day));
    let remote = today.game || null;
    if (token && !remote) remote = await fetchDailyGame(token, bootLang, today.day);
    if (remote && remote.day !== today.day) remote = null;
    if (remote && isStartedGame(remote)) bootLang = remote.lang;
    const saved = preferGame(local, remote);
    if (saved && isStartedGame(saved)) {
      bootLang = saved.lang;
      writeDayLock(today.day, bootLang);
    }

    if (saved) {
      let nextAnswer = String(saved.answer || "");
      let nextLost = Boolean(saved.lost);
      let nextWon = Boolean(saved.won);
      let nextDone = Boolean(saved.done);
      if (nextDone && nextLost && !nextAnswer && saved.board.length) {
        const sync = await postGuess({
          lang: bootLang,
          guess: saved.board[saved.board.length - 1]?.guess || "aaaaa",
          history: saved.board.map((r) => r.guess),
          token,
        });
        if (sync.ok && sync.answer) {
          nextAnswer = String(sync.answer);
          nextLost = Boolean(sync.lost);
          nextWon = Boolean(sync.won);
          nextDone = Boolean(sync.done);
        }
      }
      const keys = saved.keyMarks && Object.keys(saved.keyMarks).length ? saved.keyMarks : marksFromBoard(saved.board);
      setBoard(saved.board);
      setDone(nextDone);
      setWon(nextWon);
      setLost(nextLost);
      setAnswer(nextAnswer);
      setKeyMarks(keys);
      persist({
        board: saved.board,
        done: nextDone,
        won: nextWon,
        lost: nextLost,
        answer: nextAnswer,
        keyMarks: keys,
        day: today.day,
        lang: bootLang,
      });
    } else {
      setBoard([]);
      setDone(false);
      setWon(false);
      setLost(false);
      setAnswer("");
      setKeyMarks({});
    }

    setLang(bootLang);
    setDay(today.day);
    setPlayUrl(today.playUrl);
    setStats(loadStats(bootLang));
    setBooting(false);
  }, [persist, token]);

  useEffect(() => {
    /* se oggi c'è già una partita, non ri-bootare al cambio lingua sito */
    if (day && isStartedGame({ day, lang, board, done, won, lost, answer, keyMarks })) {
      return;
    }
    void boot(siteLang);
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lock on started day game
  }, [boot, siteLang]);

  const submit = useCallback(async () => {
    if (done || busy) return;
    if (current.length !== WORD_LEN) {
      setShake(true);
      window.setTimeout(() => setShake(false), 400);
      showToast("Servono 5 lettere");
      return;
    }
    setBusy(true);
    const history = board.map((r) => String(r.guess || "").toLowerCase());
    const res = await postGuess({ lang, guess: current, history, token });
    if (!res.ok) {
      setShake(true);
      window.setTimeout(() => setShake(false), 400);
      showToast(res.message || "Parola non valida");
      setBusy(false);
      return;
    }

    const playLang: WordleLang = res.lang ? parseLang(res.lang) : lang;
    if (playLang !== lang) setLang(playLang);
    if (day) writeDayLock(day, playLang);

    /* synced: altro device / altra lingua già usata oggi → ripristina quella partita */
    if (res.synced && Array.isArray(res.board)) {
      const nextBoard = res.board;
      const nextKeys =
        res.keyMarks && Object.keys(res.keyMarks).length ? (res.keyMarks as KeyMarks) : marksFromBoard(nextBoard);
      const nextDone = Boolean(res.done);
      const nextWon = Boolean(res.won);
      const nextLost = Boolean(res.lost);
      const nextAnswer = res.answer ? String(res.answer) : answer;
      setBoard(nextBoard);
      setKeyMarks(nextKeys);
      setCurrent("");
      setWon(nextWon);
      setLost(nextLost);
      setDone(nextDone);
      if (res.answer) setAnswer(String(res.answer));
      persist({
        board: nextBoard,
        done: nextDone,
        won: nextWon,
        lost: nextLost,
        answer: nextAnswer,
        keyMarks: nextKeys,
        day,
        lang: playLang,
      });
      showToast(
        res.message ||
          (nextDone ? (nextWon ? "Già completato oggi" : `Era ${nextAnswer || "…"}`) : "Partita sincronizzata"),
      );
      setBusy(false);
      return;
    }

    const guess = String(res.guess || current).toUpperCase();
    const marks = (Array.isArray(res.marks) ? res.marks : []) as Mark[];
    const nextBoard = [...board, { guess, marks }];
    let nextKeys = keyMarks;
    for (let i = 0; i < WORD_LEN; i++) {
      nextKeys = upgradeKey(nextKeys, guess.charAt(i).toLowerCase(), marks[i] || "b");
    }
    const nextDone = Boolean(res.done);
    const nextWon = Boolean(res.won);
    const nextLost = Boolean(res.lost);
    const nextAnswer = res.answer ? String(res.answer) : answer;

    setRevealRow(nextBoard.length - 1);
    setBoard(nextBoard);
    setKeyMarks(nextKeys);
    setCurrent("");
    setWon(nextWon);
    setLost(nextLost);
    setDone(nextDone);
    if (res.answer) setAnswer(String(res.answer));

    persist({
      board: nextBoard,
      done: nextDone,
      won: nextWon,
      lost: nextLost,
      answer: nextAnswer,
      keyMarks: nextKeys,
      day,
      lang: playLang,
    });

    if (nextDone) {
      const s = recordFinishedGame({ lang: playLang, day, won: nextWon, attempts: nextBoard.length });
      setStats(s);
      if (token) void pushStats(token, playLang, s);
      showToast(nextWon ? "Bravo!" : `Era ${nextAnswer}`);
      // vittoria: coriandoli appena finisce di girare l'ultima riga
      if (nextWon) window.setTimeout(() => celebrate(confettiRich), 650);
    }

    window.setTimeout(() => setRevealRow(null), 500);
    setBusy(false);
  }, [answer, board, busy, current, day, done, keyMarks, lang, persist, showToast, confettiRich, token]);

  const onKey = useCallback(
    (key: string) => {
      if (done || busy || booting) return;
      unlockTypeSfx();
      if (key === "Enter") {
        playTypeSfx();
        void submit();
        return;
      }
      if (key === "Backspace") {
        playTypeSfx();
        setCurrent((c) => c.slice(0, -1));
        return;
      }
      const ch = String(key || "").toLowerCase();
      if (!/^[a-z]$/.test(ch)) return;
      setCurrent((c) => {
        if (c.length >= WORD_LEN) return c;
        playTypeSfx();
        return c + ch;
      });
    },
    [booting, busy, done, submit],
  );

  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const t = ev.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (ev.key === "Enter") {
        ev.preventDefault();
        onKey("Enter");
        return;
      }
      if (ev.key === "Backspace") {
        ev.preventDefault();
        onKey("Backspace");
        return;
      }
      if (/^[a-zA-Z]$/.test(ev.key)) {
        ev.preventDefault();
        onKey(ev.key.toLowerCase());
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onKey]);

  const shareText =
    done && day
      ? buildShareText({
          lang,
          day,
          won,
          attempts: board.length,
          board,
          playUrl: playUrl || undefined,
        })
      : null;

  const copyResult = async () => {
    if (!shareText) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText);
        setCopyHint("Copiato");
        showToast("Griglia copiata");
      } else {
        showToast("Copia non disponibile");
      }
    } catch {
      showToast("Copia non riuscita");
    }
    window.setTimeout(() => setCopyHint(""), 2000);
  };

  const share = async () => {
    if (!shareText) return;
    try {
      if (navigator.share) {
        await navigator.share({ text: shareText });
        setShareHint("Condiviso");
      } else {
        await copyResult();
        setShareHint("Copiato");
        return;
      }
    } catch {
      try {
        await navigator.clipboard.writeText(shareText);
        setShareHint("Copiato");
        showToast("Griglia copiata");
      } catch {
        showToast("Condivisione annullata");
      }
    }
    window.setTimeout(() => setShareHint(""), 2000);
  };

  return (
    <div className="mx-auto max-w-lg space-y-8 px-4 pb-24 sm:px-6">
      <Reveal>
        <div>
          <div className="mb-3 min-h-[1.5rem] text-center" role="status" aria-live="polite">
            <AnimatePresence mode="wait">
              {toast ? (
                <motion.p
                  key={toast}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-sm font-semibold text-ember"
                >
                  {toast}
                </motion.p>
              ) : null}
            </AnimatePresence>
          </div>

          {lost && answer ? (
            <p className="mb-3 rounded-2xl bg-crema/8 px-4 py-2.5 text-center text-sm ring-1 ring-sand/15">
              La parola era <span className="font-display text-base font-bold uppercase tracking-wider text-ember">{answer}</span>
            </p>
          ) : null}

          <div
            className={cn(
              "mx-auto mt-1 grid w-full max-w-[19rem] gap-1.5 sm:max-w-[22rem] sm:gap-2",
              booting && "animate-pulse",
            )}
            style={{ gridTemplateRows: `repeat(${MAX_ATTEMPTS}, minmax(0, 1fr))` }}
            aria-label="Griglia Wordle"
          >
            {Array.from({ length: MAX_ATTEMPTS }, (_, r) => {
              const entry = board[r];
              const isCurrent = r === board.length && !done;
              const isReveal = revealRow === r;
              return (
                <div key={r} className="grid grid-cols-5 gap-1.5 sm:gap-2">
                  {Array.from({ length: WORD_LEN }, (_, c) => {
                    let letter = "";
                    let mark: Mark | undefined;
                    let filled = false;
                    if (entry?.guess) {
                      letter = entry.guess.charAt(c) || "";
                      mark = entry.marks?.[c];
                      filled = Boolean(letter);
                    } else if (isCurrent) {
                      letter = current.charAt(c) || "";
                      filled = Boolean(letter);
                    }
                    return (
                      <CoasterTile
                        key={c}
                        letter={letter}
                        mark={mark}
                        filled={filled}
                        reveal={isReveal && Boolean(mark)}
                        shake={shake && isCurrent}
                        delay={c * 0.06}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>

          <div className="mt-6">
            <WordleKeyboard keyMarks={keyMarks} disabled={busy || done || booting} onKey={onKey} />
          </div>
        </div>
      </Reveal>

      <Reveal delay={0.1}>
        <WordleStats
          stats={stats}
          shareText={shareText}
          onShare={share}
          shareLabel={shareHint || "Condividi"}
          onCopy={shareText ? copyResult : undefined}
          copyLabel={copyHint || "Copia risultato"}
        />
      </Reveal>
    </div>
  );
}
