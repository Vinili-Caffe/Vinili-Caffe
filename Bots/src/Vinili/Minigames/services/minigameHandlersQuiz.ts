/** Minigiochi: risposte a quiz, patente, matematica e halloween. */
const { normalizeCountryName } = require("./minigameImages") as typeof import("./minigameImages");
const { DRIVING_QUIZ_LETTERS } = require("./minigameEmbeds") as typeof import("./minigameEmbeds");
const { compactNoSpaces, normalizeTruthValue, parseMathGuess } = require("./minigameText") as typeof import("./minigameText");
const { reactMinigameWrongEmoji } = require("./minigameDiscord") as typeof import("./minigameDiscord");
const { handleMinigameWin } = require("./minigameRound") as typeof import("./minigameRound");
const { rejectMinigameShotgunListingGuess, reactMinigameNearOrWrong, isLooseAliasGuessCorrect } = require("./minigameGuessMatchers") as typeof import("./minigameGuessMatchers");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const MINIGAME_COOLDOWN_EMOJI = E.VC_Loading__969578;
const DRIVING_QUIZ_USER_ANSWER_COOLDOWN_DEFAULT_MS = 5000;

async function handleQuizMessage(message?, client?, cfg?, game?, content?, contentForGuess?) {
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
      const norm = normalizeCountryName(contentForGuess);
      const letter = norm.charAt(0);
      const num = Number.parseInt(norm, 10);
      if (Number.isFinite(num) && num >= 1 && num <= game.options.length) {
        interpretable = true;
        if (num - 1 === game.correctIndex) correct = true;
      } else if (DRIVING_QUIZ_LETTERS.indexOf(letter.toUpperCase()) >= 0) {
        const idx = DRIVING_QUIZ_LETTERS.indexOf(letter.toUpperCase());
        if (idx < game.options.length) {
          interpretable = true;
          if (idx === game.correctIndex) correct = true;
        }
      } else if (norm) {
        const correctText = normalizeCountryName(game.options[game.correctIndex] || "");
        if (
          correctText &&
          (norm === correctText || (compactNoSpaces(norm) && compactNoSpaces(norm) === compactNoSpaces(correctText)))
        ) {
          interpretable = true;
          correct = true;
        } else {
          const matchesAnyOption = game.options.some((opt?) => {
            const optNorm = normalizeCountryName(opt || "");
            if (!optNorm) return false;
            if (norm === optNorm) return true;
            const cn = compactNoSpaces(norm);
            const co = compactNoSpaces(optNorm);
            return Boolean(cn && co && cn === co);
          });
          if (matchesAnyOption) interpretable = true;
        }
      }
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
