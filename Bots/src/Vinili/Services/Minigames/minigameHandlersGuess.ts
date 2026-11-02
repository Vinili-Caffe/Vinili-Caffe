/** Minigiochi: risposte ai guess classici in chat. */
const { normalizeCountryName } = require("./minigameImages") as typeof import("./minigameImages");
const { buildHintEmbed } = require("./minigameEmbeds") as typeof import("./minigameEmbeds");
const { compactNoSpaces, extractWordGuessCandidates, memoryEmojiMessageMatches } = require("./minigameText") as typeof import("./minigameText");
const { reactMinigameWrongEmoji } = require("./minigameDiscord") as typeof import("./minigameDiscord");
const { handleMinigameWin } = require("./minigameRound") as typeof import("./minigameRound");
const {
  rejectMinigameShotgunListingGuess,
  reactMinigameNearOrWrong,
  reactMinigameWrongIfAttempt,
  buildSongAnswerAliases,
  isSongGuessCorrect,
  isSingerGuessCorrect,
  isNearTextGuess,
  isLooseAliasGuessCorrect,
} = require("./minigameGuessMatchers") as typeof import("./minigameGuessMatchers");

const MINIGAME_COOLDOWN_EMOJI = "<a:VC_Loading:1482526818278969578>";

async function handleGuessMessage(message?, client?, cfg?, game?, content?, contentForGuess?) {
  if (game.type === "guessNumber") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    if (!/^\d+$/.test(content)) return false;
    const guess = Number(content);
    if (!Number.isFinite(guess)) return false;
    if (guess < game.min || guess > game.max) return false;

    if (guess === game.target) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }

    const range = Math.max(1, Number(game.max || 100) - Number(game.min || 1));
    const nearThreshold = Math.max(2, Math.round(range * 0.05));
    if (Math.abs(guess - game.target) <= nearThreshold) {
      await message.react("<a:VC_Flame:1482725674711126140>").catch(() => { });
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    await message
      .reply({ embeds: [buildHintEmbed(guess < game.target)] })
      .catch(() => { });
    return true;
  }

  if (game.type === "guessWord") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    const guessCandidates = extractWordGuessCandidates(contentForGuess);
    if (!guessCandidates.length) {
      return false;
    }
    const targetNorm = normalizeCountryName(game.target || "");
    const targetCompact = targetNorm ? compactNoSpaces(targetNorm) : "";
    const match = guessCandidates.some((c?) => {
      const cNorm = normalizeCountryName(c);
      return (
        cNorm === targetNorm ||
        (targetCompact && cNorm && compactNoSpaces(cNorm) === targetCompact)
      );
    });
    if (match) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (
      guessCandidates.some((candidate?) =>
        isNearTextGuess(candidate, [game.target], {
          maxDistance: 1,
          maxRatio: 0.25,
        }),
      )
    ) {
      await message.react("<a:VC_Flame:1482725674711126140>").catch(() => { });
      return false;
    }
    await reactMinigameWrongEmoji(message, game);
    return false;
  }

  if (game.type === "guessFlag") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizeCountryName, {
        minGuessLength: 4,
        minTokenLength: 3,
        singleTokenMinLength: 5,
      })
    ) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (
      isNearTextGuess(contentForGuess, game.answers, { maxDistance: 2, maxRatio: 0.25 })
    ) {
      await message.react("<a:VC_Flame:1482725674711126140>").catch(() => { });
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }

  if (game.type === "guessPlayer") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizePlayerGuess, {
        minGuessLength: 3,
        minTokenLength: 3,
        singleTokenMinLength: 4,
      })
    ) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (
      isNearTextGuess(contentForGuess, game.answers, { maxDistance: 2, maxRatio: 0.25 })
    ) {
      await message.react("<a:VC_Flame:1482725674711126140>").catch(() => { });
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }

  if (game.type === "guessSong") {
    if (await rejectMinigameShotgunListingGuess(message, content, "songAlbum")) return false;
    const songAnswers = buildSongAnswerAliases(game.title);
    if (
      isSongGuessCorrect(contentForGuess, songAnswers.length ? songAnswers : game.title)
    ) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (
      isNearTextGuess(
        contentForGuess,
        songAnswers.length ? songAnswers : [game.title],
        { maxDistance: 3, maxRatio: 0.25 },
      )
    ) {
      await message.react("<a:VC_Flame:1482725674711126140>").catch(() => { });
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }

  if (game.type === "guessCapital") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizeCountryName, {
        minGuessLength: 3,
        minTokenLength: 3,
        singleTokenMinLength: 4,
      })
    ) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (
      isNearTextGuess(contentForGuess, game.answers, { maxDistance: 2, maxRatio: 0.25 })
    ) {
      await message.react("<a:VC_Flame:1482725674711126140>").catch(() => { });
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }

  if (game.type === "guessReverseCapital") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizeCountryName, {
        minGuessLength: 3,
        minTokenLength: 3,
        singleTokenMinLength: 4,
      })
    ) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (
      isNearTextGuess(contentForGuess, game.answers, { maxDistance: 2, maxRatio: 0.25 })
    ) {
      await message.react("<a:VC_Flame:1482725674711126140>").catch(() => { });
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }

  if (game.type === "guessRegionCapital") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizeCountryName, {
        minGuessLength: 3,
        minTokenLength: 3,
        singleTokenMinLength: 4,
      })
    ) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (
      isNearTextGuess(contentForGuess, game.answers, { maxDistance: 2, maxRatio: 0.25 })
    ) {
      await message.react("<a:VC_Flame:1482725674711126140>").catch(() => { });
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }

  if (game.type === "fastType") {
    const normalizedContent = normalizeCountryName(contentForGuess);
    const phraseNorm = game.normalizedPhrase || normalizeCountryName(game.phrase || "");
    if (
      normalizedContent === phraseNorm ||
      (compactNoSpaces(normalizedContent) && compactNoSpaces(normalizedContent) === compactNoSpaces(phraseNorm))
    ) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    await reactMinigameNearOrWrong(message, normalizedContent, game, [game.normalizedPhrase], {
      maxDistance: 2,
      maxRatio: 0.2,
      minGuessLength: 6,
    });
    return false;
  }

  if (game.type === "memoryEmoji") {
    if (!game.promptMessageId || Date.now() < Number(game.acceptsAt || 0)) {
      await message.react(MINIGAME_COOLDOWN_EMOJI).catch(() => { });
      return false;
    }
    if (memoryEmojiMessageMatches(content, game.normalizedSequence)) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    await reactMinigameWrongIfAttempt(message, content, game);
    return false;
  }

  if (game.type === "guessTeam") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizeCountryName, {
        minGuessLength: 3,
        minTokenLength: 3,
        singleTokenMinLength: 3,
      })
    ) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (
      isNearTextGuess(contentForGuess, game.answers, { maxDistance: 2, maxRatio: 0.25 })
    ) {
      await message.react("<a:VC_Flame:1482725674711126140>").catch(() => { });
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }

  if (game.type === "guessSinger") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    if (isSingerGuessCorrect(contentForGuess, game.answers)) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (
      isNearTextGuess(contentForGuess, game.answers, { maxDistance: 2, maxRatio: 0.25 })
    ) {
      await message.react("<a:VC_Flame:1482725674711126140>").catch(() => { });
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }

  if (game.type === "guessAlbum") {
    if (await rejectMinigameShotgunListingGuess(message, content, "songAlbum")) return false;
    if (isSongGuessCorrect(contentForGuess, game.answers)) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (
      isNearTextGuess(contentForGuess, game.answers, { maxDistance: 3, maxRatio: 0.25 })
    ) {
      await message.react("<a:VC_Flame:1482725674711126140>").catch(() => { });
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }
  return null;
}

export = { handleGuessMessage };
