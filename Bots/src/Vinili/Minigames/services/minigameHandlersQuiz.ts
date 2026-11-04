/** Minigiochi: risposte a quiz, patente, matematica, halloween e Star Wars. */
const { normalizeCountryName } = require("./minigameImages") as typeof import("./minigameImages");
const { DRIVING_QUIZ_LETTERS } = require("./minigameEmbeds") as typeof import("./minigameEmbeds");
const { compactNoSpaces, normalizeTruthValue, parseMathGuess } = require("./minigameText") as typeof import("./minigameText");
const { reactMinigameWrongEmoji } = require("./minigameDiscord") as typeof import("./minigameDiscord");
const { handleMinigameWin } = require("./minigameRound") as typeof import("./minigameRound");
const { rejectMinigameShotgunListingGuess, reactMinigameNearOrWrong, isLooseAliasGuessCorrect } = require("./minigameGuessMatchers") as typeof import("./minigameGuessMatchers");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const MINIGAME_COOLDOWN_EMOJI = E.VC_Loading__969578;
const DRIVING_QUIZ_USER_ANSWER_COOLDOWN_DEFAULT_MS = 5000;

/** MC: lettera/numero solo se il messaggio è SOLO quella; altrimenti testo (Anakin ≠ A). */
function resolveMultipleChoiceGuess(contentForGuess?, choices = [], correctIndex?, answers = [], displayChoices = null) {
  const opts = Array.isArray(choices) ? choices : [];
  const shown = Array.isArray(displayChoices) && displayChoices.length ? displayChoices : opts;
  const norm = normalizeCountryName(contentForGuess);
  const idxCap = Number.isFinite(correctIndex) ? Number(correctIndex) : -1;
  if (!norm || !opts.length || idxCap < 0) return { interpretable: false, correct: false };

  if (/^\d+$/.test(norm)) {
    const num = Number.parseInt(norm, 10);
    if (num >= 1 && num <= opts.length) {
      return { interpretable: true, correct: num - 1 === idxCap };
    }
  }

  if (/^[a-d]$/i.test(norm)) {
    const idx = DRIVING_QUIZ_LETTERS.indexOf(norm.toUpperCase());
    if (idx >= 0 && idx < opts.length) {
      return { interpretable: true, correct: idx === idxCap };
    }
  }

  if (
    answers?.length &&
    isLooseAliasGuessCorrect(contentForGuess, answers, normalizeCountryName, {
      minGuessLength: 2,
      minTokenLength: 2,
      singleTokenMinLength: 2,
    })
  ) {
    return { interpretable: true, correct: true };
  }

  const pools = [opts];
  if (shown !== opts) pools.push(shown);
  for (const pool of pools) {
    for (let i = 0; i < pool.length; i += 1) {
      const optNorm = normalizeCountryName(pool[i] || "");
      if (!optNorm) continue;
      if (norm === optNorm || (compactNoSpaces(norm) && compactNoSpaces(norm) === compactNoSpaces(optNorm))) {
        return { interpretable: true, correct: i === idxCap };
      }
    }
  }

  return { interpretable: false, correct: false };
}

async function maybeHandleStarWarsQuizWin(message?, game?, cfg?, isCorrect?) {
  const { evaluateStarWarsQuizAnswerGates } = require("../../../../archivio/starwars/src/Vinili/Services/Community/starWarsQuizMalusService") as typeof import("../../../../archivio/starwars/src/Vinili/Services/Community/starWarsQuizMalusService");
  const gate = await evaluateStarWarsQuizAnswerGates(message, game, isCorrect);
  if (gate?.blocked) return true;
  if (gate?.pendingTeam) return true;
  if (!isCorrect) return false;
  if (gate?.teamReady && Array.isArray(gate.correctUserIds)) {
    game.geonosianCorrectIds = gate.correctUserIds;
  }
  await handleMinigameWin(message, game, cfg);
  if (String(game?.malusId || "") === "geonosiana" && Array.isArray(game?.geonosianCorrectIds)) {
    try {
      const { grantStarWarsQuizWinRewards } = require("../../../../archivio/starwars/src/Vinili/Services/Community/starWarsQuizRewards") as typeof import("../../../../archivio/starwars/src/Vinili/Services/Community/starWarsQuizRewards");
      const winnerId = String(message.author?.id || "");
      for (const uid of game.geonosianCorrectIds) {
        if (!uid || String(uid) === winnerId) continue;
        await grantStarWarsQuizWinRewards(message.client, {
          guildId: message.guild?.id,
          userId: uid,
          cfg,
        }).catch(() => null);
      }
    } catch (_) {}
  }
  return true;
}

async function handleQuizMessage(message?, client?, cfg?, game?, content?, contentForGuess?) {
  if (game.type === "starWarsQuiz") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    const kind = String(game.kind || "text");
    if (kind === "mc" && Array.isArray(game.choices) && Number.isFinite(game.correctIndex)) {
      const { interpretable, correct } = resolveMultipleChoiceGuess(
        contentForGuess,
        game.choices,
        game.correctIndex,
        game.answers,
        game.displayChoices,
      );
      if (correct) return maybeHandleStarWarsQuizWin(message, game, cfg, true);
      /* freeze check anche su risposte sbagliate */
      if (await maybeHandleStarWarsQuizWin(message, game, cfg, false)) return true;
      if (interpretable) await reactMinigameWrongEmoji(message, game);
      return false;
    }
    if (kind === "vf") {
      const guess = normalizeTruthValue(contentForGuess);
      if (guess === null) {
        if (await maybeHandleStarWarsQuizWin(message, game, cfg, false)) return true;
        return false;
      }
      // Confronto booleano (come patente): non solo alias testuali
      let expected = typeof game.answer === "boolean" ? game.answer : null;
      if (expected === null) {
        expected = normalizeTruthValue(
          Array.isArray(game.answers) && game.answers.length ? game.answers[0] : game.displayAnswer,
        );
      }
      const ok =
        expected !== null
          ? guess === expected
          : isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizeCountryName, {
              minGuessLength: 1,
              minTokenLength: 1,
              singleTokenMinLength: 1,
            });
      if (ok) return maybeHandleStarWarsQuizWin(message, game, cfg, true);
      if (await maybeHandleStarWarsQuizWin(message, game, cfg, false)) return true;
      await reactMinigameWrongEmoji(message, game);
      return false;
    }
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizeCountryName, {
        minGuessLength: 2,
        minTokenLength: 2,
        singleTokenMinLength: 2,
      })
    ) {
      return maybeHandleStarWarsQuizWin(message, game, cfg, true);
    }
    if (await maybeHandleStarWarsQuizWin(message, game, cfg, false)) return true;
    await reactMinigameNearOrWrong(message, contentForGuess, game, game.answers, {
      maxDistance: 2,
      maxRatio: 0.25,
      minGuessLength: 2,
    });
    return false;
  }

  if (game.type === "italianGK" || game.type === "halloweenQuiz") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizeCountryName, {
        minGuessLength: 2,
        minTokenLength: 2,
        singleTokenMinLength: 2,
      })
    ) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    await reactMinigameNearOrWrong(message, contentForGuess, game, game.answers, {
      maxDistance: 2,
      maxRatio: 0.25,
      minGuessLength: 2,
    });
    return false;
  }

  if (game.type === "halloweenMissingEmoji") {
    const guess = String(content || "").trim();
    const choices = Array.isArray(game.choices) ? game.choices : [];
    const asIndex = Number.parseInt(guess, 10);
    const fromNumber =
      Number.isFinite(asIndex) && asIndex >= 1 && asIndex <= choices.length ? choices[asIndex - 1] : null;
    const matched =
      (guess && game.answers?.some((a?) => String(a) === guess)) ||
      (fromNumber && game.answers?.some((a?) => String(a) === String(fromNumber)));
    if (matched) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    await reactMinigameWrongEmoji(message, game);
    return false;
  }

  if (game.type === "halloweenCountBats") {
    const n = Number.parseInt(String(contentForGuess || "").replace(/[^\d]/g, ""), 10);
    if (Number.isFinite(n) && n === Number(game.count)) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    await reactMinigameWrongEmoji(message, game);
    return false;
  }

  if (game.type === "drivingQuiz") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    const isMultiple = game.questionType === "multiple" && Array.isArray(game.options) && Number.isFinite(game.correctIndex);
    let interpretable = false;
    let correct = false;
    if (isMultiple) {
      const resolved = resolveMultipleChoiceGuess(
        contentForGuess,
        game.options,
        game.correctIndex,
        [],
        null,
      );
      interpretable = resolved.interpretable;
      correct = resolved.correct;
    } else {
      const guess = normalizeTruthValue(contentForGuess);
      if (guess !== null) {
        interpretable = true;
        if (guess === game.answer) correct = true;
      }
    }
    if (interpretable) {
      const userId = String(message.author?.id || "");
      const cooldownMs = Math.max(0, Number(cfg?.drivingQuiz?.userAnswerCooldownMs ?? DRIVING_QUIZ_USER_ANSWER_COOLDOWN_DEFAULT_MS));
      if (userId && cooldownMs > 0) {
        if (!game.userLastAnswerAt || typeof game.userLastAnswerAt !== "object") {
          game.userLastAnswerAt = {};
        }
        const last = Number(game.userLastAnswerAt[userId] || 0);
        const nowMs = Date.now();
        if (last && nowMs - last < cooldownMs) {
          await message.react(MINIGAME_COOLDOWN_EMOJI).catch(() => { });
          return false;
        }
        game.userLastAnswerAt[userId] = nowMs;
      }
    }
    if (correct) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (interpretable) {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }

  if (game.type === "mathExpression") {
    const guessNum = parseMathGuess(contentForGuess);
    if (!Number.isFinite(guessNum)) return false;
    const answerNum = Number(String(game.answer).replace(",", "."));
    if (
      Number.isFinite(guessNum) &&
      Number.isFinite(answerNum) &&
      Math.abs(guessNum - answerNum) <= 0.01
    ) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (
      Number.isFinite(guessNum) &&
      Number.isFinite(answerNum) &&
      Math.abs(guessNum - answerNum) <= 1
    ) {
      await message.react(E.VC_Flame).catch(() => { });
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }
  return null;
}

export = { handleQuizMessage };
