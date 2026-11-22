/**
 * Wordle ×4 (Quordle-style): 4 risposte, 9 tentativi, un guess su tutte le griglie aperte.
 * EXP casuale per tentativi totali se login + in server.
 */
"use strict";

const wordle = require("../../Minigames/services/wordleService") as typeof import("../../Minigames/services/wordleService");
const {
  cleanGame,
  emptyBoards,
  loadDailyGame,
  loadStartedDailyGame,
  saveDailyGame,
  isStartedGame,
} = require("./siteWordleQuadDailyApi") as typeof import("./siteWordleQuadDailyApi");
const {
  resolveWordleAuth,
  loadClaim,
  claimWordleExp,
  rewardMeta,
  quadRange,
} = require("./siteWordleRewards") as typeof import("./siteWordleRewards");
const { resolveOptionalAuth } = require("./siteWordleDailyApi") as typeof import("./siteWordleDailyApi");
const { getWordleRemindEnabled } = require("../../Minigames/services/wordleDailyReminderService") as typeof import("../../Minigames/services/wordleDailyReminderService");

function parseLang(raw?) {
  return wordle.parseLang(raw) || "it";
}

function buildBoardsFromHistory(answers?, history?) {
  const boards = emptyBoards();
  for (let bi = 0; bi < boards.length; bi++) {
    const answer = answers[bi];
    const rows = [];
    let won = false;
    for (const g of history || []) {
      if (won) break;
      const marks = wordle.scoreGuess(answer, g);
      rows.push({ guess: String(g).toUpperCase(), marks });
      if (wordle.normalizeWord(g) === wordle.normalizeWord(answer)) won = true;
    }
    boards[bi] = {
      rows,
      won,
      done: won,
      answer: won ? String(answer).toUpperCase() : "",
    };
  }
  return boards;
}

function publicBoards(boards?, revealAll?) {
  return (boards || []).map((b?) => ({
    rows: b.rows || [],
    won: Boolean(b.won),
    done: Boolean(b.done || b.won),
    answer: revealAll || b.won || b.done ? String(b.answer || "").toUpperCase() || undefined : undefined,
  }));
}

function mergeKeyMarks(boards?) {
  const RANK = { b: 1, y: 2, g: 3 };
  /** @type {Record<string, string>} */
  const keys: Record<string, any> = {};
  for (const b of boards || []) {
    for (const row of b.rows || []) {
      const g = String(row.guess || "").toLowerCase();
      const marks = row.marks || [];
      for (let i = 0; i < 5; i++) {
        const ch = g.charAt(i);
        if (!ch) continue;
        const m = marks[i] || "b";
        if (!keys[ch] || RANK[m] > RANK[keys[ch]]) keys[ch] = m;
      }
    }
  }
  return keys;
}

async function attachReward(client?, req?, payload?, day?) {
  const status = await resolveWordleAuth(client, req);
  let claimed = null;
  if (status.kind === "member" && status.auth) {
    claimed = await loadClaim(status.auth.guild?.id, status.auth.userId, "quad", day);
  }
  payload.reward = rewardMeta({ kind: status.kind, mode: "quad", claimed });
  return status;
}

async function tryAward(client?, auth?, opts?) {
  if (!auth?.guild || !auth?.userId) return null;
  const attempts = Number(opts?.attempts) || 0;
  if (attempts < 4) return null;
  return claimWordleExp({
    client,
    guild: auth.guild,
    member: auth.member,
    userId: auth.userId,
    mode: "quad",
    day: opts.day,
    attempts,
    lang: opts.lang,
  });
}

function responseFromStored(stored?, day?, lang?) {
  const reveal = Boolean(stored.done);
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
    guesses: stored.guesses || [],
    boards: publicBoards(stored.boards, reveal),
    attempts: (stored.guesses || []).length,
    maxAttempts: wordle.QUAD_MAX_ATTEMPTS,
    boardCount: wordle.QUAD_BOARDS,
    keyMarks: stored.keyMarks || mergeKeyMarks(stored.boards),
    message:
      stored.lang && stored.lang !== lang
        ? "Hai già giocato al Wordle ×4 oggi in un'altra lingua."
        : undefined,
  };
}

function gameFromPlay(opts?) {
  return cleanGame({
    day: opts.day,
    lang: opts.lang,
    guesses: opts.guesses,
    boards: opts.boards,
    done: opts.done,
    won: opts.won,
    lost: opts.lost,
    keyMarks: opts.keyMarks || {},
  });
}

async function handleSiteWordleQuadTodayGet(client?, req?, res?) {
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
      maxAttempts: wordle.QUAD_MAX_ATTEMPTS,
      boardCount: wordle.QUAD_BOARDS,
      playUrl: "https://www.viniliecaffe.it/wordle/quattro/",
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
    await attachReward(client, req, payload, day);
    const status = await resolveWordleAuth(client, req);
    if (status.kind === "member" && status.auth) {
      payload.remindEnabled = await getWordleRemindEnabled(status.auth.guild?.id, status.auth.userId);
    } else {
      payload.remindEnabled = false;
    }
    return res.json(payload);
  } catch (err) {
    global.logger?.warn?.("[siteWordleQuad] today failed:", err?.message || err);
    return res.status(503).json({ ok: false, error: "unavailable", message: "Wordle ×4 non pronto." });
  }
}

async function handleSiteWordleQuadGuessPost(client?, req?, res?) {
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
      .slice(0, wordle.QUAD_MAX_ATTEMPTS);

    const auth = await resolveOptionalAuth(client, req);
    if (auth) {
      const locked = await loadStartedDailyGame(auth.guild?.id, auth.userId, day);
      if (locked) {
        if (locked.lang !== lang) {
          const out = responseFromStored(locked, day, lang);
          await attachReward(client, req, out, day);
          return res.json(out);
        }
        if (locked.done) {
          const out = responseFromStored(locked, day, lang);
          await attachReward(client, req, out, day);
          return res.json(out);
        }
        if ((locked.guesses || []).length > history.length) {
          const out = responseFromStored(locked, day, lang);
          await attachReward(client, req, out, day);
          return res.json(out);
        }
      } else {
        const stored = await loadDailyGame(auth.guild?.id, auth.userId, lang);
        if (stored && stored.day === day && isStartedGame(stored)) {
          if (stored.done) {
            const out = responseFromStored(stored, day, lang);
            await attachReward(client, req, out, day);
            return res.json(out);
          }
          if ((stored.guesses || []).length > history.length) {
            const out = responseFromStored(stored, day, lang);
            await attachReward(client, req, out, day);
            return res.json(out);
          }
        }
      }
    }

    const answers = wordle.pickDailyAnswers(lang, day, wordle.QUAD_BOARDS);

    /* replay / already finished history */
    if (history.length >= wordle.QUAD_MAX_ATTEMPTS || buildBoardsFromHistory(answers, history).every((b?) => b.won)) {
      const boards = buildBoardsFromHistory(answers, history);
      const won = boards.every((b?) => b.won);
      const lost = !won;
      /* reveal remaining answers on lose */
      for (let i = 0; i < boards.length; i++) {
        if (!boards[i].won) {
          boards[i].answer = String(answers[i]).toUpperCase();
          boards[i].done = true;
        }
      }
      const keyMarks = mergeKeyMarks(boards);
      if (auth) {
        const kept = await saveDailyGame(
          auth.guild?.id,
          auth.userId,
          gameFromPlay({ day, lang, guesses: history.map((g?) => g.toUpperCase()), boards, done: true, won, lost, keyMarks }),
        );
        if (kept && kept.lang !== lang) {
          const out = responseFromStored(kept, day, lang);
          await attachReward(client, req, out, day);
          return res.json(out);
        }
      }
      const payload: Record<string, any> = {
        ok: true,
        day,
        lang,
        locked: true,
        lockedLang: lang,
        done: true,
        won,
        lost,
        guesses: history.map((g?) => g.toUpperCase()),
        boards: publicBoards(boards, true),
        attempts: history.length,
        maxAttempts: wordle.QUAD_MAX_ATTEMPTS,
        boardCount: wordle.QUAD_BOARDS,
        keyMarks,
      };
      if (won && auth) {
        const award = await tryAward(client, auth, { day, lang, attempts: history.length });
        if (award?.ok) {
          payload.expGained = award.exp;
          payload.expAlready = Boolean(award.already);
        }
      }
      await attachReward(client, req, payload, day);
      return res.json(payload);
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
    const boards = buildBoardsFromHistory(answers, nextHistory);
    const won = boards.every((b?) => b.won);
    const lost = !won && nextHistory.length >= wordle.QUAD_MAX_ATTEMPTS;
    const done = won || lost;
    if (done) {
      for (let i = 0; i < boards.length; i++) {
        if (!boards[i].won) {
          boards[i].answer = String(answers[i]).toUpperCase();
          boards[i].done = true;
        }
      }
    }
    const keyMarks = mergeKeyMarks(boards);
    const lastMarks = boards.map((b?) => {
      const last = b.rows[b.rows.length - 1];
      return last?.marks || null;
    });

    if (auth) {
      const kept = await saveDailyGame(
        auth.guild?.id,
        auth.userId,
        gameFromPlay({
          day,
          lang,
          guesses: nextHistory.map((g?) => g.toUpperCase()),
          boards,
          done,
          won,
          lost,
          keyMarks,
        }),
      );
      if (kept && kept.lang !== lang) {
        const out = responseFromStored(kept, day, lang);
        await attachReward(client, req, out, day);
        return res.json(out);
      }
    }

    const payload: Record<string, any> = {
      ok: true,
      day,
      lang,
      locked: true,
      lockedLang: lang,
      guess: check.word.toUpperCase(),
      marksPerBoard: lastMarks,
      guesses: nextHistory.map((g?) => g.toUpperCase()),
      boards: publicBoards(boards, done),
      attempts: nextHistory.length,
      maxAttempts: wordle.QUAD_MAX_ATTEMPTS,
      boardCount: wordle.QUAD_BOARDS,
      keyMarks,
      won,
      lost,
      done,
    };

    if (won && auth) {
      const award = await tryAward(client, auth, { day, lang, attempts: nextHistory.length });
      if (award?.ok) {
        payload.expGained = award.exp;
        payload.expAlready = Boolean(award.already);
      }
    }
    await attachReward(client, req, payload, day);
    return res.json(payload);
  } catch (err) {
    global.logger?.warn?.("[siteWordleQuad] guess failed:", err?.message || err);
    return res.status(503).json({ ok: false, error: "unavailable", message: "Wordle ×4 non pronto." });
  }
}

async function handleSiteWordleQuadClaimPost(client?, req?, res?) {
  try {
    const cfg = client?.config?.minigames?.wordle || null;
    await wordle.ensureReady(cfg);
    const status = await resolveWordleAuth(client, req);
    if (status.kind === "guest") {
      return res.status(401).json({
        ok: false,
        error: "login_required",
        message: "Accedi con Discord per ricevere l'EXP.",
        reward: rewardMeta({ kind: "guest", mode: "quad" }),
      });
    }
    if (status.kind === "outsider") {
      return res.status(403).json({
        ok: false,
        error: "not_in_guild",
        message: "Entra nel server Vinili & Caffè per ricevere l'EXP del Wordle ×4.",
        reward: rewardMeta({ kind: "outsider", mode: "quad" }),
      });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const lang = parseLang(body.lang);
    const day = wordle.todayKey();
    const answers = wordle.pickDailyAnswers(lang, day, wordle.QUAD_BOARDS);
    const historyRaw = Array.isArray(body.history) ? body.history : [];
    const history = historyRaw
      .map((g?) => wordle.normalizeWord(g))
      .filter((g?) => g.length === wordle.WORD_LEN)
      .slice(0, wordle.QUAD_MAX_ATTEMPTS);

    if (history.length < 4) {
      return res.status(400).json({ ok: false, error: "no_history", message: "Nessuna partita da riscattare." });
    }
    for (const g of history) {
      if (!wordle.isValidGuess(lang, g).ok) {
        return res.status(400).json({ ok: false, error: "invalid_history", message: "Partita non valida." });
      }
    }
    const boards = buildBoardsFromHistory(answers, history);
    if (!boards.every((b?) => b.won)) {
      return res.status(400).json({ ok: false, error: "not_won", message: "Serve una vittoria completa di oggi." });
    }

    const auth = status.auth;
    const keyMarks = mergeKeyMarks(boards);
    await saveDailyGame(
      auth.guild?.id,
      auth.userId,
      gameFromPlay({
        day,
        lang,
        guesses: history.map((g?) => g.toUpperCase()),
        boards,
        done: true,
        won: true,
        lost: false,
        keyMarks,
      }),
    );

    const award = await tryAward(client, auth, { day, lang, attempts: history.length });
    const claimed = await loadClaim(auth.guild?.id, auth.userId, "quad", day);
    const [lo, hi] = quadRange(history.length);
    return res.json({
      ok: true,
      day,
      lang,
      attempts: history.length,
      expGained: award?.exp ?? (Number(claimed?.exp) || 0),
      expAlready: Boolean(award?.already || (claimed && !award)),
      expRange: { min: lo, max: hi },
      reward: rewardMeta({ kind: "member", mode: "quad", claimed }),
    });
  } catch (err) {
    global.logger?.warn?.("[siteWordleQuad] claim failed:", err?.message || err);
    return res.status(503).json({ ok: false, error: "unavailable" });
  }
}

export = {
  handleSiteWordleQuadTodayGet,
  handleSiteWordleQuadGuessPost,
  handleSiteWordleQuadClaimPost,
};
