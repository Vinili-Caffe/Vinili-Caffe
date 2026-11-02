/**
 * Site Wordle API — stesso puzzle giornaliero di +wordle (wordleService).
 * wordleDailySync1: con login, la partita del giorno è sul profilo (no rifarla da altro device).
 * wordleOnePerDay1: max 1 partita/giorno cross-lingua (IT iniziata → no EN lo stesso giorno).
 */
"use strict";

const wordle = require("../../Minigames/services/wordleService") as typeof import("../../Minigames/services/wordleService");
const {
  cleanGame,
  loadDailyGame,
  loadStartedDailyGame,
  saveDailyGame,
  resolveOptionalAuth,
  isStartedGame,
} = require("./siteWordleDailyApi") as typeof import("./siteWordleDailyApi");

function parseLang(raw?) {
  return wordle.parseLang(raw) || "it";
}

function publicBoard(history?, answer?, marksRows?) {
  return (history || []).map((g?, i?) => ({
    guess: String(g || "").toUpperCase(),
    marks: marksRows[i] || wordle.scoreGuess(answer, g),
  }));
}

function responseFromStored(stored?, day?, lang?) {
  const board = Array.isArray(stored.board) ? stored.board : [];
  return {
    ok: true,
    day,
    lang: stored.lang || lang,
    synced: true,
    locked: true,
    lockedLang: stored.lang || lang,
    done: Boolean(stored.done),
    won: Boolean(stored.won),
    lost: Boolean(stored.lost),
    answer: stored.done && stored.answer ? String(stored.answer).toUpperCase() : undefined,
    board,
    attempts: board.length,
    maxAttempts: wordle.MAX_ATTEMPTS,
    keyMarks: stored.keyMarks || {},
    message:
      stored.lang && stored.lang !== lang
        ? "Hai già giocato oggi in un'altra lingua. Una sola partita al giorno."
        : undefined,
  };
}

function gameFromPlay(opts?) {
  return cleanGame({
    day: opts.day,
    lang: opts.lang,
    board: opts.board,
    done: opts.done,
    won: opts.won,
    lost: opts.lost,
    answer: opts.answer || "",
    keyMarks: opts.keyMarks || {},
  });
}

async function handleSiteWordleTodayGet(client?, req?, res?) {
  try {
    const cfg = client?.config?.minigames?.wordle || null;
    await wordle.ensureReady(cfg);
    let lang = parseLang(req.query?.lang);
    const day = wordle.todayKey();
    const payload: Record<string, any> = {
      ok: true,
      day,
      lang,
      wordLen: wordle.WORD_LEN,
      maxAttempts: wordle.MAX_ATTEMPTS,
      playUrl: "https://www.viniliecaffe.it/wordle/",
      locked: false,
      lockedLang: null,
    };
    const auth = await resolveOptionalAuth(client, req);
    if (auth) {
      const locked = await loadStartedDailyGame(auth.guild?.id, auth.userId, day);
      if (locked) {
        payload.lang = locked.lang;
        payload.game = locked;
        payload.locked = true;
        payload.lockedLang = locked.lang;
      } else {
        const game = await loadDailyGame(auth.guild?.id, auth.userId, lang);
        if (game && game.day === day) payload.game = game;
      }
    }
    return res.json(payload);
  } catch (err) {
    global.logger?.warn?.("[siteWordle] today failed:", err?.message || err);
    return res.status(503).json({ ok: false, error: "unavailable", message: "Wordle non pronto." });
  }
}

async function handleSiteWordleGuessPost(client?, req?, res?) {
  try {
    const cfg = client?.config?.minigames?.wordle || null;
    await wordle.ensureReady(cfg);
    const body = req.body && typeof req.body === "object" ? req.body : {};
    let lang = parseLang(body.lang || req.query?.lang);
    const day = wordle.todayKey();
    const historyRaw = Array.isArray(body.history) ? body.history : [];
    let history = historyRaw
      .map((g?) => wordle.normalizeWord(g))
      .filter((g?) => g.length === wordle.WORD_LEN)
      .slice(0, wordle.MAX_ATTEMPTS);

    const auth = await resolveOptionalAuth(client, req);
    if (auth) {
      const locked = await loadStartedDailyGame(auth.guild?.id, auth.userId, day);
      if (locked) {
        /* già iniziata oggi in un'altra lingua → niente seconda partita */
        if (locked.lang !== lang) {
          return res.json(responseFromStored(locked, day, lang));
        }
        if (locked.done) {
          return res.json(responseFromStored(locked, day, lang));
        }
        if (locked.board.length > history.length) {
          return res.json(responseFromStored(locked, day, lang));
        }
      } else {
        const stored = await loadDailyGame(auth.guild?.id, auth.userId, lang);
        if (stored && stored.day === day && isStartedGame(stored)) {
          if (stored.done) return res.json(responseFromStored(stored, day, lang));
          if (stored.board.length > history.length) return res.json(responseFromStored(stored, day, lang));
        }
      }
    }

    const answer = wordle.pickDailyAnswer(lang, day);

    if (history.some((g?) => g === answer) || history.length >= wordle.MAX_ATTEMPTS) {
      const marksRows = history.map((g?) => wordle.scoreGuess(answer, g));
      const board = publicBoard(history, answer, marksRows);
      const won = history.some((g?) => g === answer);
      const lost = !won && history.length >= wordle.MAX_ATTEMPTS;
      if (auth) {
        const kept = await saveDailyGame(
          auth.guild?.id,
          auth.userId,
          gameFromPlay({ day, lang, board, done: true, won, lost, answer: answer.toUpperCase() }),
        );
        if (kept && kept.lang !== lang) {
          return res.json(responseFromStored(kept, day, lang));
        }
      }
      return res.json({
        ok: true,
        day,
        lang,
        locked: true,
        lockedLang: lang,
        done: true,
        won,
        lost,
        answer: answer.toUpperCase(),
        board,
        attempts: history.length,
      });
    }

    const check = wordle.isValidGuess(lang, body.guess);
    if (!check.ok) {
      return res.status(400).json({
        ok: false,
        error: check.reason || "invalid",
        message:
          check.reason === "len"
            ? `Serve una parola di ${wordle.WORD_LEN} lettere.`
            : check.reason === "dict"
              ? "Parola non nel dizionario."
              : "Tentativo non valido.",
      });
    }
    if (history.includes(check.word)) {
      return res.status(400).json({ ok: false, error: "dup", message: "Hai già provato questa parola." });
    }

    const nextHistory = history.concat([check.word]);
    const marks = wordle.scoreGuess(answer, check.word);
    const marksRows = nextHistory.map((g?) => wordle.scoreGuess(answer, g));
    const board = publicBoard(nextHistory, answer, marksRows);
    const won = check.word === answer;
    const lost = !won && nextHistory.length >= wordle.MAX_ATTEMPTS;
    const done = won || lost;

    if (auth) {
      const kept = await saveDailyGame(
        auth.guild?.id,
        auth.userId,
        gameFromPlay({
          day,
          lang,
          board,
          done,
          won,
          lost,
          answer: done ? answer.toUpperCase() : "",
        }),
      );
      if (kept && kept.lang !== lang) {
        return res.json(responseFromStored(kept, day, lang));
      }
    }

    return res.json({
      ok: true,
      day,
      lang,
      locked: true,
      lockedLang: lang,
      guess: check.word.toUpperCase(),
      marks,
      board,
      attempts: nextHistory.length,
      maxAttempts: wordle.MAX_ATTEMPTS,
      won,
      lost,
      done,
      answer: done ? answer.toUpperCase() : undefined,
    });
  } catch (err) {
    global.logger?.warn?.("[siteWordle] guess failed:", err?.message || err);
    return res.status(503).json({ ok: false, error: "unavailable", message: "Wordle non pronto." });
  }
}

export = {
  handleSiteWordleTodayGet,
  handleSiteWordleGuessPost,
};
