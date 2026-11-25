"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Reveal } from "@/components/Reveal";
import { cn } from "@/lib/cn";
import { playTypeSfx, unlockTypeSfx } from "@/lib/type-sfx";
import {
  WORD_LEN,
  emptyStats,
  parseLang,
  upgradeKey,
  type KeyMarks,
  type Mark,
  type WordleLang,
  type WordleRewardInfo,
  type WordleStats as StatsData,
} from "@/lib/wordle";
import {
  QUAD_BOARDS,
  QUAD_MAX_ATTEMPTS,
  buildQuadShareText,
  claimQuadExp,
  fetchQuadDaily,
  findLocalStartedQuad,
  isStartedQuad,
  loadQuadStats,
  loadQuadToday,
  loadSavedQuad,
  postQuadGuess,
  preferQuad,
  pushQuadDaily,
  recordFinishedQuad,
  saveQuadGame,
  type QuadBoardState,
  type QuadToday,
  type SavedQuadGame,
} from "@/lib/wordleQuad";
import { WordleKeyboard } from "./WordleKeyboard";
import { WordleRewardBanner } from "./WordleRewardBanner";
import { activityShare, isDiscordActivity } from "@/lib/discordActivity";
import { WordleStats } from "./WordleStats";
import { celebrate } from "@/lib/confetti";
import { useFxCap } from "@/components/effects/DeviceFxProvider";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

type Props = { initial: QuadToday | null };

const tileMark = (m?: Mark) => {
  if (m === "g") return "bg-[#58a64b] text-white ring-[#58a64b]/50";
  if (m === "y") return "bg-[#c9a227] text-ink ring-[#c9a227]/45";
  if (m === "b") return "bg-mocha text-crema/50 ring-sand/10";
  return "bg-mocha/80 text-crema ring-sand/18";
};

function MiniTile({
  letter,
  mark,
  filled,
  shake,
}: {
  letter: string;
  mark?: Mark;
  filled?: boolean;
  shake?: boolean;
}) {
  return (
    <motion.div
      animate={shake ? { x: [0, -3, 3, -2, 2, 0] } : { scale: filled && !mark ? 1.03 : 1 }}
      transition={shake ? { duration: 0.3 } : { type: "spring", stiffness: 420, damping: 22 }}
      className={cn(
        /* basse ma leggibili in 2×2 largo */
        "relative grid h-[1.35rem] w-full place-items-center rounded-[3px] font-sans text-[0.62rem] font-bold uppercase leading-none ring-1 sm:h-[1.55rem] sm:text-[0.72rem] md:h-[1.7rem] md:text-xs",
        mark ? tileMark(mark) : filled ? "bg-mocha text-crema ring-sand/30" : "bg-roast/90 text-crema/25 ring-sand/12",
      )}
    >
      <span className="relative block leading-none">{letter}</span>
    </motion.div>
  );
}

function emptyBoards(): QuadBoardState[] {
  return Array.from({ length: QUAD_BOARDS }, () => ({ rows: [], won: false, done: false }));
}

export function WordleQuadBoard({ initial }: Props) {
  const { locale, t } = useI18n();
  const siteLang = parseLang(locale);
  const { token, login, ready: authReady } = useAuth();
  const confettiRich = useFxCap("confettiRich");

  const [lang, setLang] = useState<WordleLang>(initial?.lang || siteLang);
  const [day, setDay] = useState(initial?.day || "");
  const [playUrl, setPlayUrl] = useState(initial?.playUrl || "");
  const [boards, setBoards] = useState<QuadBoardState[]>(() => initial?.game?.boards || emptyBoards());
  const [guesses, setGuesses] = useState<string[]>(() => initial?.game?.guesses || []);
  const [current, setCurrent] = useState("");
  const [done, setDone] = useState(Boolean(initial?.game?.done));
  const [won, setWon] = useState(Boolean(initial?.game?.won));
  const [lost, setLost] = useState(Boolean(initial?.game?.lost));
  const [keyMarks, setKeyMarks] = useState<KeyMarks>(() => initial?.game?.keyMarks || {});
  const [busy, setBusy] = useState(false);
  const [booting, setBooting] = useState(true);
  const [toast, setToast] = useState("");
  const [shake, setShake] = useState(false);
  const [reward, setReward] = useState<WordleRewardInfo | null>(initial?.reward || null);
  const [expGained, setExpGained] = useState<number | null>(null);
  const [copyHint, setCopyHint] = useState("");
  const [shareHint, setShareHint] = useState("");
  const [inActivity, setInActivity] = useState(false);
  useEffect(() => setInActivity(isDiscordActivity()), []);
  const [stats, setStats] = useState<StatsData>(() => emptyStats());
  const [remindEnabled, setRemindEnabled] = useState(Boolean(initial?.remindEnabled));
  const toastTimer = useRef<number | null>(null);
  const claimTried = useRef(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 1800);
  }, []);

  const persist = useCallback(
    (game: SavedQuadGame) => {
      saveQuadGame(game);
      if (token) void pushQuadDaily(token, game);
    },
    [token],
  );

  const applyGame = useCallback((game: SavedQuadGame, d: string, l: WordleLang) => {
    setBoards(game.boards?.length ? game.boards : emptyBoards());
    setGuesses(game.guesses || []);
    setDone(Boolean(game.done));
    setWon(Boolean(game.won));
    setLost(Boolean(game.lost));
    setKeyMarks(game.keyMarks || {});
    setLang(l);
    setDay(d);
  }, []);

  const boot = useCallback(
    async (preferredLang: WordleLang) => {
      setBooting(true);
      setCurrent("");
      claimTried.current = false;

      let bootLang = preferredLang;
      let today = await loadQuadToday({ lang: bootLang, token });
      if (!today?.day) {
        today = {
          day: new Date().toISOString().slice(0, 10),
          lang: bootLang,
          wordLen: WORD_LEN,
          maxAttempts: QUAD_MAX_ATTEMPTS,
          boardCount: QUAD_BOARDS,
          playUrl: "https://www.viniliecaffe.it/wordle/quattro/",
        };
      }
      if (today.lockedLang) bootLang = today.lockedLang;
      else if (today.game && isStartedQuad(today.game)) bootLang = today.game.lang;
      else {
        const localForDay = findLocalStartedQuad(today.day);
        if (localForDay?.lang) bootLang = localForDay.lang;
      }

      const local = preferQuad(loadSavedQuad(bootLang, today.day), findLocalStartedQuad(today.day));
      let remote = today.game || null;
      if (token && !remote) remote = await fetchQuadDaily(token, bootLang, today.day);
      if (remote && remote.day !== today.day) remote = null;
      const saved = preferQuad(local, remote);

      if (saved && isStartedQuad(saved)) {
        applyGame(saved, today.day, saved.lang || bootLang);
        persist({ ...saved, day: today.day, lang: saved.lang || bootLang });
      } else {
        setBoards(emptyBoards());
        setGuesses([]);
        setDone(false);
        setWon(false);
        setLost(false);
        setKeyMarks({});
        setLang(bootLang);
        setDay(today.day);
      }

      setPlayUrl(today.playUrl);
      setStats(loadQuadStats(bootLang));
      if (today.reward) setReward(today.reward);
      if (today.reward?.expAwarded) setExpGained(today.reward.expAwarded);
      setRemindEnabled(Boolean(today.remindEnabled));
      setBooting(false);
    },
    [applyGame, persist, token],
  );

  useEffect(() => {
    /* aspetta di sapere se c'è l'accesso: così la partita fatta su un altro dispositivo arriva subito */
    if (!authReady) return;
    void boot(siteLang);
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, [boot, siteLang, authReady]);

  useEffect(() => {
    if (!token || booting || !won || !done || claimTried.current) return;
    if (reward?.claimed || (expGained != null && expGained > 0)) return;
    claimTried.current = true;
    const history = guesses.map((g) => String(g || "").toLowerCase());
    if (history.length < 4) return;
    void claimQuadExp({ token, lang, history }).then((res) => {
      if (res.reward) setReward(res.reward);
      if (res.ok && res.expGained) {
        setExpGained(res.expGained);
        if (!res.expAlready) showToast(t("wordle.expGain", { n: res.expGained }));
      }
    });
  }, [token, booting, won, done, reward?.claimed, expGained, guesses, lang, showToast, t]);

  const submit = useCallback(async () => {
    if (done || busy) return;
    if (current.length !== WORD_LEN) {
      setShake(true);
      window.setTimeout(() => setShake(false), 400);
      showToast(t("wordle.needLetters"));
      return;
    }
    setBusy(true);
    const history = guesses.map((g) => String(g || "").toLowerCase());
    const res = await postQuadGuess({ lang, guess: current, history, token });
    if (!res.ok) {
      setShake(true);
      window.setTimeout(() => setShake(false), 400);
      showToast(res.message || t("wordle.invalidWord"));
      setBusy(false);
      return;
    }

    const playLang: WordleLang = res.lang ? parseLang(res.lang) : lang;
    if (playLang !== lang) setLang(playLang);

    const nextBoards = res.boards?.length ? res.boards : boards;
    const nextGuesses = res.guesses || [...guesses, String(res.guess || current).toUpperCase()];
    const nextKeys = res.keyMarks || keyMarks;
    let mergedKeys = nextKeys;
    if (!res.keyMarks && res.guess) {
      const g = String(res.guess).toLowerCase();
      for (const marks of res.marksPerBoard || []) {
        if (!marks) continue;
        for (let i = 0; i < WORD_LEN; i++) {
          mergedKeys = upgradeKey(mergedKeys, g.charAt(i), marks[i] || "b");
        }
      }
    }

    setBoards(nextBoards);
    setGuesses(nextGuesses);
    setKeyMarks(mergedKeys);
    setCurrent("");
    setWon(Boolean(res.won));
    setLost(Boolean(res.lost));
    setDone(Boolean(res.done));
    if (res.reward) setReward(res.reward);
    if (typeof res.expGained === "number" && res.expGained > 0) setExpGained(res.expGained);

    persist({
      day,
      lang: playLang,
      guesses: nextGuesses,
      boards: nextBoards,
      done: Boolean(res.done),
      won: Boolean(res.won),
      lost: Boolean(res.lost),
      keyMarks: mergedKeys,
    });

    if (res.done) {
      const s = recordFinishedQuad({
        lang: playLang,
        day,
        won: Boolean(res.won),
        attempts: nextGuesses.length,
      });
      setStats(s);
      if (res.won && res.expGained && !res.expAlready) showToast(t("wordle.expGain", { n: res.expGained }));
      else showToast(res.won ? t("wordle.allGuessed") : t("wordle.timeUp"));
      if (res.won) window.setTimeout(() => celebrate(confettiRich), 400);
    }

    setBusy(false);
  }, [boards, busy, confettiRich, current, day, done, guesses, keyMarks, lang, persist, showToast, token, t]);

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
      ? buildQuadShareText({
          lang,
          day,
          won,
          attempts: guesses.length,
          boards,
          playUrl: playUrl || undefined,
        })
      : null;

  const copyResult = async () => {
    if (!shareText) return;
    try {
      await navigator.clipboard.writeText(shareText);
      setCopyHint(t("wordle.copiedShort"));
      showToast(t("wordle.gridsCopied"));
    } catch {
      showToast(t("wordle.copyFailed"));
    }
    window.setTimeout(() => setCopyHint(""), 2000);
  };

  const share = async () => {
    if (!shareText) return;
    /* nell'Attività: finestra di condivisione di Discord (chat o canale), con il link per giocare */
    if (inActivity) {
      if (await activityShare(shareText)) setShareHint(t("wordle.shared"));
      window.setTimeout(() => setShareHint(""), 2000);
      return;
    }
    try {
      if (navigator.share) {
        await navigator.share({ text: shareText });
        setShareHint(t("wordle.shared"));
      } else {
        await copyResult();
        setShareHint(t("wordle.copiedShort"));
        return;
      }
    } catch {
      await copyResult();
      setShareHint(t("wordle.copiedShort"));
    }
    window.setTimeout(() => setShareHint(""), 2000);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-2 px-3 pb-16 sm:px-5">
      <WordleRewardBanner
        reward={reward}
        mode="quad"
        won={won && done}
        attempts={guesses.length}
        expGained={expGained}
        onLogin={login}
      />
      {/* promemoria: si accende da solo alla prima partita e si spegne da /notifications/ */}

      <div>
        <div className="mb-1 min-h-[1rem] text-center" role="status" aria-live="polite">
          <AnimatePresence mode="wait">
            {toast ? (
              <motion.p
                key={toast}
                initial={{ opacity: 0, y: 2 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-xs font-semibold text-ember"
              >
                {toast}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>

        {lost ? (
          <div className="mb-1.5 flex flex-wrap justify-center gap-x-3 gap-y-0.5 text-[0.7rem]">
            {boards.map((b, i) =>
              !b.won && b.answer ? (
                <span key={i} className="text-crema/60">
                  #{i + 1}{" "}
                  <span className="font-bold uppercase tracking-wide text-ember">{b.answer}</span>
                </span>
              ) : null,
            )}
          </div>
        ) : null}

        <div
          className={cn(
            "mx-auto grid w-full max-w-3xl grid-cols-2 gap-x-3 gap-y-3 sm:gap-x-4 sm:gap-y-4",
            booting && "animate-pulse",
          )}
          aria-label={t("wordle.quadGridAria")}
        >
          {boards.map((board, bi) => {
            const solved = board.won;
            return (
              <div key={bi} className={cn("min-w-0", solved && "ring-1 ring-[#58a64b]/40 rounded-sm p-0.5")}>
                <div className="flex flex-col gap-px">
                  {Array.from({ length: QUAD_MAX_ATTEMPTS }, (_, r) => {
                    const entry = board.rows[r];
                    const isCurrent =
                      !solved && !done && r === board.rows.length && guesses.length === board.rows.length;
                    return (
                      <div key={r} className="grid grid-cols-5 gap-px">
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
                            <MiniTile
                              key={c}
                              letter={letter}
                              mark={mark}
                              filled={filled}
                              shake={shake && isCurrent}
                            />
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-2">
          <WordleKeyboard compact keyMarks={keyMarks} disabled={busy || done || booting} onKey={onKey} />
        </div>
      </div>

      <Reveal delay={0.05}>
        <WordleStats
          stats={stats}
          maxAttempts={QUAD_MAX_ATTEMPTS}
          shareText={shareText}
          onShare={share}
          shareLabel={shareHint || t("wordle.share")}
          onCopy={shareText ? copyResult : undefined}
          copyLabel={copyHint || t("wordle.copyResult")}
        />
      </Reveal>
    </div>
  );
}
