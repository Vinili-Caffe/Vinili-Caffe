/**
 * Site Wordle API — stesso puzzle giornaliero di +wordle (wordleService).
 * wordleDailySync1: con login, la partita del giorno è sul profilo (no rifarla da altro device).
 * wordleOnePerDay1: max 1 partita/giorno cross-lingua (IT iniziata → no EN lo stesso giorno).
 * wordleExp1: EXP casuale per tentativi se login + in server.
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
const {
  resolveWordleAuth,
  loadClaim,
  claimWordleExp,
  rewardMeta,
  classicRange,
} = require("./siteWordleRewards") as typeof import("./siteWordleRewards");
const {
  getWordleRemindEnabled,
  setWordleRemindEnabled,
  autoEnableFromRequest,
} = require("../../Minigames/services/wordleDailyReminderService") as typeof import("../../Minigames/services/wordleDailyReminderService");

const { recordDailyResult } = require("../../Minigames/services/dailyGamesService") as typeof import("../../Minigames/services/dailyGamesService");

function parseLang(raw?) {
  return wordle.parseLang(raw) || "it";
}

function publicBoard(history?, answer?, marksRows?) {
  return (history || []).map((g?, i?) => ({
    guess: String(g || "").toUpperCase(),
    marks: marksRows[i] || wordle.scoreGuess(answer, g),
  }));
}

function winningAttempts(history?, answer?) {
  const a = wordle.normalizeWord(answer);
  for (let i = 0; i < (history || []).length; i++) {
    if (wordle.normalizeWord(history[i]) === a) return i + 1;
  }
  return 0;
}

async function attachReward(client?, req?, payload?, opts?) {
  const day = opts?.day || payload?.day || wordle.todayKey();
  const mode = "classic";
  const status = await resolveWordleAuth(client, req);
  let claimed = null;
  if (status.kind === "member" && status.auth) {
    claimed = await loadClaim(status.auth.guild?.id, status.auth.userId, mode, day);
  }
  payload.reward = rewardMeta({ kind: status.kind, mode, claimed });
  return { status, claimed };
}

async function tryAwardWin(client?, auth?, opts?) {
  if (!auth?.guild || !auth?.userId) return null;
  const attempts = Number(opts?.attempts) || 0;
  if (!(attempts > 0)) return null;
  const result = await claimWordleExp({
    client,
    guild: auth.guild,
    member: auth.member,
    userId: auth.userId,
    mode: "classic",
    day: opts.day,
    attempts,
    lang: opts.lang,
  });
  if (!result?.ok) return null;
  return result;
}

function responseFromStored(stored?, day?, lang?, rewardExtra?) {
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
    ...(rewardExtra || {}),
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
    await attachReward(client, req, payload, { day });
    const status = await resolveWordleAuth(client, req);
    if (status.kind === "member" && status.auth) {
      payload.remindEnabled = await getWordleRemindEnabled(status.auth.guild?.id, status.auth.userId);
    } else {
      payload.remindEnabled = false;
    }
    return res.json(payload);
  } catch (err) {
    global.logger?.warn?.("[siteWordle] today failed:", err?.message || err);
    return res.status(503).json({ ok: false, error: "unavailable", message: "Wordle non pronto." });
  }
}

async function handleSiteWordleGuessPost(client?, req?, res?) {
  /* remindAuto1: prima partita → promemoria acceso (se mai toccato) */
  void autoEnableFromRequest(client, req);
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
          const out = responseFromStored(locked, day, lang);
          await attachReward(client, req, out, { day });
          return res.json(out);
        }
        if (locked.done) {
          const out = responseFromStored(locked, day, lang);
          await attachReward(client, req, out, { day });
          return res.json(out);
        }
        if (locked.board.length > history.length) {
          const out = responseFromStored(locked, day, lang);
          await attachReward(client, req, out, { day });
          return res.json(out);
        }
      } else {
        const stored = await loadDailyGame(auth.guild?.id, auth.userId, lang);
        if (stored && stored.day === day && isStartedGame(stored)) {
          if (stored.done) {
            const out = responseFromStored(stored, day, lang);
            await attachReward(client, req, out, { day });
            return res.json(out);
          }
          if (stored.board.length > history.length) {
            const out = responseFromStored(stored, day, lang);
            await attachReward(client, req, out, { day });
            return res.json(out);
          }
        }
      }
    }

    const answer = wordle.pickDailyAnswer(lang, day);

    if (history.some((g?) => g === answer) || history.length >= wordle.MAX_ATTEMPTS) {
      const marksRows = history.map((g?) => wordle.scoreGuess(answer, g));
      const board = publicBoard(history, answer, marksRows);
      const won = history.some((g?) => g === answer);
      const lost = !won && history.length >= wordle.MAX_ATTEMPTS;
      /* giochi del giorno: classifica settimanale e serie combinata */
      if (auth) void recordDailyResult(auth.userId, "wordle", day, { solved: won, attempts: winningAttempts(history, answer) || history.length }).catch(() => false);
      if (auth) {
        const kept = await saveDailyGame(
          auth.guild?.id,
          auth.userId,
          gameFromPlay({ day, lang, board, done: true, won, lost, answer: answer.toUpperCase() }),
        );
        if (kept && kept.lang !== lang) {
          const out = responseFromStored(kept, day, lang);
          await attachReward(client, req, out, { day });
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
        answer: answer.toUpperCase(),
        board,
        attempts: history.length,
      };
      if (won && auth) {
        const award = await tryAwardWin(client, auth, {
          day,
          lang,
          attempts: winningAttempts(history, answer) || history.length,
        });
        if (award) {
          payload.expGained = award.exp;
          payload.expAlready = Boolean(award.already);
        }
      }
      await attachReward(client, req, payload, { day });
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
    const marks = wordle.scoreGuess(answer, check.word);
    const marksRows = nextHistory.map((g?) => wordle.scoreGuess(answer, g));
    const board = publicBoard(nextHistory, answer, marksRows);
    const won = check.word === answer;
    const lost = !won && nextHistory.length >= wordle.MAX_ATTEMPTS;
    const done = won || lost;
    if (auth && done) void recordDailyResult(auth.userId, "wordle", day, { solved: won, attempts: nextHistory.length }).catch(() => false);

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
        const out = responseFromStored(kept, day, lang);
        await attachReward(client, req, out, { day });
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
      marks,
      board,
      attempts: nextHistory.length,
      maxAttempts: wordle.MAX_ATTEMPTS,
      won,
      lost,
      done,
      answer: done ? answer.toUpperCase() : undefined,
    };

    if (won && auth) {
      const award = await tryAwardWin(client, auth, {
        day,
        lang,
        attempts: nextHistory.length,
      });
      if (award) {
        payload.expGained = award.exp;
        payload.expAlready = Boolean(award.already);
      }
    }
    await attachReward(client, req, payload, { day });
    return res.json(payload);
  } catch (err) {
    global.logger?.warn?.("[siteWordle] guess failed:", err?.message || err);
    return res.status(503).json({ ok: false, error: "unavailable", message: "Wordle non pronto." });
  }
}

/** Claim EXP dopo login (partita già vinta da guest / altro device). Body: { lang, history }. */
async function handleSiteWordleClaimPost(client?, req?, res?) {
  try {
    const cfg = client?.config?.minigames?.wordle || null;
    await wordle.ensureReady(cfg);
    const status = await resolveWordleAuth(client, req);
    if (status.kind === "guest") {
      return res.status(401).json({
        ok: false,
        error: "login_required",
        message: "Accedi con Discord per ricevere l'EXP.",
        reward: rewardMeta({ kind: "guest", mode: "classic" }),
      });
    }
    if (status.kind === "outsider") {
      return res.status(403).json({
        ok: false,
        error: "not_in_guild",
        message: "Entra nel server Vinili & Caffè per ricevere l'EXP del Wordle.",
        reward: rewardMeta({ kind: "outsider", mode: "classic" }),
      });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const lang = parseLang(body.lang);
    const day = wordle.todayKey();
    const answer = wordle.pickDailyAnswer(lang, day);
    const historyRaw = Array.isArray(body.history) ? body.history : [];
    const history = historyRaw
      .map((g?) => wordle.normalizeWord(g))
      .filter((g?) => g.length === wordle.WORD_LEN)
      .slice(0, wordle.MAX_ATTEMPTS);

    if (!history.length) {
      return res.status(400).json({ ok: false, error: "no_history", message: "Nessuna partita da riscattare." });
    }
    for (const g of history) {
      const check = wordle.isValidGuess(lang, g);
      if (!check.ok) {
        return res.status(400).json({ ok: false, error: "invalid_history", message: "Partita non valida." });
      }
    }
    const attempts = winningAttempts(history, answer);
    if (!attempts) {
      return res.status(400).json({ ok: false, error: "not_won", message: "Serve una vittoria di oggi per l'EXP." });
    }

    const auth = status.auth;
    const marksRows = history.map((g?) => wordle.scoreGuess(answer, g));
    const board = publicBoard(history, answer, marksRows);
    await saveDailyGame(
      auth.guild?.id,
      auth.userId,
      gameFromPlay({
        day,
        lang,
        board,
        done: true,
        won: true,
        lost: false,
        answer: answer.toUpperCase(),
      }),
    );

    const award = await tryAwardWin(client, auth, { day, lang, attempts });
    const claimed = await loadClaim(auth.guild?.id, auth.userId, "classic", day);
    const [lo, hi] = classicRange(attempts);
    return res.json({
      ok: true,
      day,
      lang,
      attempts,
      expGained: award?.exp ?? claimed?.exp ?? 0,
      expAlready: Boolean(award?.already || (claimed && !award)),
      expRange: { min: lo, max: hi },
      reward: rewardMeta({ kind: "member", mode: "classic", claimed }),
    });
  } catch (err) {
    global.logger?.warn?.("[siteWordle] claim failed:", err?.message || err);
    return res.status(503).json({ ok: false, error: "unavailable" });
  }
}

/** Opt-in promemoria mezzanotte. Body: { enabled: boolean } */
async function handleSiteWordleRemindPost(client?, req?, res?) {
  try {
    const status = await resolveWordleAuth(client, req);
    if (status.kind === "guest") {
      return res.status(401).json({ ok: false, error: "login_required", message: "Accedi per attivare i promemoria." });
    }
    if (status.kind === "outsider") {
      return res.status(403).json({
        ok: false,
        error: "not_in_guild",
        message: "Entra nel server Vinili & Caffè per i promemoria Wordle.",
      });
    }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const enabled = Boolean(body.enabled);
    await setWordleRemindEnabled(status.auth.guild?.id, status.auth.userId, enabled);
    return res.json({
      ok: true,
      remindEnabled: enabled,
      message: enabled
        ? "Ti avviseremo a mezzanotte (sito, o DM se non hai le notifiche attive)."
        : "Promemoria Wordle disattivato.",
    });
  } catch (err) {
    global.logger?.warn?.("[siteWordle] remind failed:", err?.message || err);
    return res.status(503).json({ ok: false, error: "unavailable" });
  }
}

export = {
  handleSiteWordleTodayGet,
  handleSiteWordleGuessPost,
  handleSiteWordleClaimPost,
  handleSiteWordleRemindPost,
};
