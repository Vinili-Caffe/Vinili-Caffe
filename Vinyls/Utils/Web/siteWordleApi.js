/**
 * Site Wordle API — stesso puzzle giornaliero di +wordle (wordleService).
 * Stateless: il client tiene lo storico; la risposta non viene mai esposta finché non è finita.
 */
"use strict";

const wordle = require("../../Services/Minigames/wordleService");

function parseLang(raw) {
  return wordle.parseLang(raw) || "it";
}

function publicBoard(history, answer, marksRows) {
  return (history || []).map((g, i) => ({
    guess: String(g || "").toUpperCase(),
    marks: marksRows[i] || wordle.scoreGuess(answer, g),
  }));
}

async function handleSiteWordleTodayGet(client, req, res) {
  try {
    const cfg = client?.config?.minigames?.wordle || null;
    await wordle.ensureReady(cfg);
    const lang = parseLang(req.query?.lang);
    const day = wordle.todayKey();
    return res.json({
      ok: true,
      day,
      lang,
      wordLen: wordle.WORD_LEN,
      maxAttempts: wordle.MAX_ATTEMPTS,
      playUrl: "https://www.viniliecaffe.it/wordle/",
    });
  } catch (err) {
    global.logger?.warn?.("[siteWordle] today failed:", err?.message || err);
    return res.status(503).json({ ok: false, error: "unavailable", message: "Wordle non pronto." });
  }
}

async function handleSiteWordleGuessPost(client, req, res) {
  try {
    const cfg = client?.config?.minigames?.wordle || null;
    await wordle.ensureReady(cfg);
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const lang = parseLang(body.lang || req.query?.lang);
    const day = wordle.todayKey();
    const answer = wordle.pickDailyAnswer(lang, day);
    const historyRaw = Array.isArray(body.history) ? body.history : [];
    const history = historyRaw
      .map((g) => wordle.normalizeWord(g))
      .filter((g) => g.length === wordle.WORD_LEN)
      .slice(0, wordle.MAX_ATTEMPTS);

    if (history.some((g) => g === answer) || history.length >= wordle.MAX_ATTEMPTS) {
      const marksRows = history.map((g) => wordle.scoreGuess(answer, g));
      return res.json({
        ok: true,
        day,
        lang,
        done: true,
        won: history.some((g) => g === answer),
        lost: !history.some((g) => g === answer) && history.length >= wordle.MAX_ATTEMPTS,
        answer: answer.toUpperCase(),
        board: publicBoard(history, answer, marksRows),
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
    const marksRows = nextHistory.map((g) => wordle.scoreGuess(answer, g));
    const won = check.word === answer;
    const lost = !won && nextHistory.length >= wordle.MAX_ATTEMPTS;

    return res.json({
      ok: true,
      day,
      lang,
      guess: check.word.toUpperCase(),
      marks,
      board: publicBoard(nextHistory, answer, marksRows),
      attempts: nextHistory.length,
      maxAttempts: wordle.MAX_ATTEMPTS,
      won,
      lost,
      done: won || lost,
      answer: won || lost ? answer.toUpperCase() : undefined,
    });
  } catch (err) {
    global.logger?.warn?.("[siteWordle] guess failed:", err?.message || err);
    return res.status(503).json({ ok: false, error: "unavailable", message: "Wordle non pronto." });
  }
}

module.exports = {
  handleSiteWordleTodayGet,
  handleSiteWordleGuessPost,
};
