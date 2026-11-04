/** Minigiochi: risposte ad anno, verso, emoji, film, proverbio, sinonimi e città. */
const { normalizeCountryName } = require("./minigameImages") as typeof import("./minigameImages");
const { buildYearHintEmbed } = require("./minigameEmbeds") as typeof import("./minigameEmbeds");
const { reactMinigameWrongEmoji } = require("./minigameDiscord") as typeof import("./minigameDiscord");
const { handleMinigameWin } = require("./minigameRound") as typeof import("./minigameRound");
const { rejectMinigameShotgunListingGuess, isNearTextGuess, isLooseAliasGuessCorrect } = require("./minigameGuessMatchers") as typeof import("./minigameGuessMatchers");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
async function handleCultureMessage(message?, client?, cfg?, game?, content?, contentForGuess?) {
  if (game.type === "guessYear") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    const guessNum = parseInt(content.replace(/\D/g, ""), 10);
    if (!Number.isFinite(guessNum)) return false;
    if (guessNum === game.year) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    const diff = Math.abs(guessNum - game.year);
    if (diff <= 2) await message.react(E.VC_Flame).catch(() => {});
    else await reactMinigameWrongEmoji(message, game);
    await message
      .reply({ embeds: [buildYearHintEmbed(guessNum < game.year)] })
      .catch(() => {});
    return true;
  }

  if (game.type === "completeVerse") {
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
    if (isNearTextGuess(contentForGuess, game.answers, { maxDistance: 2, maxRatio: 0.3 })) {
      await message.react(E.VC_Flame).catch(() => {});
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }

  if (game.type === "guessEmoji") {
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
    if (isNearTextGuess(contentForGuess, game.answers, { maxDistance: 2, maxRatio: 0.3 })) {
      await message.react(E.VC_Flame).catch(() => {});
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }

  if (game.type === "quoteFilm") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizeCountryName, {
        minGuessLength: 2,
        minTokenLength: 2,
        singleTokenMinLength: 3,
      })
    ) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (isNearTextGuess(contentForGuess, game.answers, { maxDistance: 2, maxRatio: 0.25 })) {
      await message.react(E.VC_Flame).catch(() => {});
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }

  if (game.type === "completeProverb") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizeCountryName, {
        minGuessLength: 1,
        minTokenLength: 1,
        singleTokenMinLength: 2,
      })
    ) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (isNearTextGuess(contentForGuess, game.answers, { maxDistance: 2, maxRatio: 0.35 })) {
      await message.react(E.VC_Flame).catch(() => {});
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }

  if (game.type === "synonymAntonym") {
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
    if (isNearTextGuess(contentForGuess, game.answers, { maxDistance: 1, maxRatio: 0.25 })) {
      await message.react(E.VC_Flame).catch(() => {});
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }

  if (game.type === "guessCity") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizeCountryName, {
        minGuessLength: 2,
        minTokenLength: 2,
        singleTokenMinLength: 3,
      })
    ) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (isNearTextGuess(contentForGuess, game.answers, { maxDistance: 2, maxRatio: 0.25 })) {
      await message.react(E.VC_Flame).catch(() => {});
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }
  return null;
}

export = { handleCultureMessage };
