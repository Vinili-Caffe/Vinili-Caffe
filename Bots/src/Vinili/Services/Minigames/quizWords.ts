/** Minigiochi quiz: numero, parola, scrittura veloce, impiccato. */
const axios = require("axios") as typeof import("axios").default;
const { getFastTypingPhrases, getHangmanWords } = require("../../Data/Minigames/minigameBanks") as typeof import("../../Data/Minigames/minigameBanks");
const { shouldUseHalloweenTheme, getHalloweenHangmanWords } = require("../../Utils/Minigames/halloweenMinigameHooks") as typeof import("../../Utils/Minigames/halloweenMinigameHooks");
const { warnMinigame } = require("./minigameLog") as typeof import("./minigameLog");
const { normalizeCountryName, buildPromptImageAttachment } = require("./minigameImages") as typeof import("./minigameImages");
const { buildGuessNumberEmbed, buildGuessWordEmbed, buildFastTypeEmbed, buildHangmanEmbed, buildTimeoutNumberEmbed, buildTimeoutWordEmbed, buildTimeoutFastTypeEmbed, buildTimeoutHangmanEmbed } = require("./minigameEmbeds") as typeof import("./minigameEmbeds");
const { randomBetween } = require("./minigameSources") as typeof import("./minigameSources");
const { getChannelCached, pickRandomItem } = require("./minigameUtils") as typeof import("./minigameUtils");
const { shuffleString, normalizeWord, normalizeRewardExp, maskHangmanWord, buildRevealHint, buildNumberNearHint } = require("./minigameText") as typeof import("./minigameText");
const { activeGames, pickQuestionAvoidRecent } = require("./minigameState") as typeof import("./minigameState");
const { sendMinigameRolePing } = require("./minigameRolePing") as typeof import("./minigameRolePing");
const { sendMinigameMessage } = require("./minigameDiscord") as typeof import("./minigameDiscord");
const { markSent, saveActiveGame, sendMinigameTimeoutAndClose, scheduleGenericHint } = require("./minigameRound") as typeof import("./minigameRound");
const { translateToItalian, extractWordListFromApiPayload, loadWordList, fetchPhraseFromApiCandidates, isValidHangmanWord } = require("./quizSources") as typeof import("./quizSources");

const DEFAULT_FAST_TYPE_API_URLS = ["https://api.quotable.io/random", "https://zenquotes.io/api/random",];
const DEFAULT_MAX_FAST_TYPE_PHRASE_LENGTH = 180;

async function startGuessNumberGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId) return false;
  if (activeGames.has(channelId)) return false;

  const min = Math.max(1, Number(cfg?.guessNumber?.min || 1));
  let max = Math.max(min, Number(cfg?.guessNumber?.max || 100));
  const rewardExp = normalizeRewardExp(cfg?.guessNumber?.rewardExp ?? 100);
  const durationMs = Math.max(60000, Number(cfg?.guessNumber?.durationMs || 180000));

  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  const target = randomBetween(min, max);
  const roleId = cfg.roleId;

  await sendMinigameRolePing(channel, cfg, roleId);
  const numberAttachment = buildPromptImageAttachment("Indovina il numero", [`Tra ${min} e ${max}`], "guess_number", "", client);
  const numberEmbed = buildGuessNumberEmbed(min, max, rewardExp, durationMs);
  if (numberAttachment) numberEmbed.setImage(`attachment://${numberAttachment.name}`);
  const gameMessage = await sendMinigameMessage(channel, { embeds: [numberEmbed], files: numberAttachment ? [numberAttachment] : [], }).catch(() => null);

  const timeout = setTimeout(async () => { const game = activeGames.get(channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, channelId, channel, game, buildTimeoutNumberEmbed(game.target)); }, durationMs); timeout.unref?.();
  const hintTimeout = await scheduleGenericHint(client, channelId, durationMs, buildNumberNearHint(target, min, max),);

  activeGames.set(channelId, {
    type: "guessNumber",
    target,
    min,
    max,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });

  await saveActiveGame(client, cfg, {
    type: "guessNumber",
    target: String(target),
    min,
    max,
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });

  markSent(channelId);

  return true;
}

async function startGuessWordGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId) return false;
  if (activeGames.has(channelId)) return false;

  let words = [];
  if (!words.length) words = await loadWordList(cfg);
  if (!words.length) return false;

  const rewardExp = normalizeRewardExp(cfg?.guessWord?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.guessWord?.durationMs || 180000));

  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  const target = String(words[randomBetween(0, words.length - 1)] || "",).toLowerCase();
  if (!target) return false;

  const roleId = cfg.roleId;
  await sendMinigameRolePing(channel, cfg, roleId);
  const scrambled = (() => {
    let s = shuffleString(target);
    return s;
  })();
  const wordAttachment = buildPromptImageAttachment("Indovina la parola", [scrambled], "guess_word", "", client);
  const wordEmbed = buildGuessWordEmbed(scrambled, rewardExp, durationMs);
  if (wordAttachment) {
    wordEmbed.setImage(`attachment://${wordAttachment.name}`);
  }
  const gameMessage = await sendMinigameMessage(channel, { embeds: [wordEmbed], files: wordAttachment ? [wordAttachment] : [], }).catch(() => null);

  const timeout = setTimeout(async () => { const game = activeGames.get(channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, channelId, channel, game, buildTimeoutWordEmbed(game.target)); }, durationMs); timeout.unref?.();
  const hintTimeout = await scheduleGenericHint(client, channelId, durationMs, `Parola: ${buildRevealHint(target, 0.4, false)}`,
  );

  activeGames.set(channelId, {
    type: "guessWord",
    target,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });

  await saveActiveGame(client, cfg, {
    type: "guessWord",
    target,
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });

  markSent(channelId);

  return true;
}

async function startFastTypeGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;

  let phrase = "";
  let fromApi = false;
  const customApiUrl = cfg?.fastType?.apiUrl || null;
  if (customApiUrl) {
    phrase = await fetchPhraseFromApiCandidates(customApiUrl);
    if (phrase) fromApi = true;
  }
  if (!phrase && (cfg?.fastType?.useDefaultApi !== false)) {
    phrase = await fetchPhraseFromApiCandidates(DEFAULT_FAST_TYPE_API_URLS);
    if (phrase) fromApi = true;
  }
  if (!phrase) {
    const customPhrases = Array.isArray(cfg?.fastType?.phrases) ? cfg.fastType.phrases : [];
    const fallbackPhrases = customPhrases.length
      ? customPhrases
      : getFastTypingPhrases();
    phrase = String(pickRandomItem(fallbackPhrases) || "").trim();
  }
  if (!phrase) return false;
  if (fromApi) {
    const translated = await translateToItalian(phrase, cfg);
    if (translated) phrase = translated;
  }

  const maxLen = Number(cfg?.fastType?.maxPhraseLength) || DEFAULT_MAX_FAST_TYPE_PHRASE_LENGTH;
  if (phrase.length > maxLen) {
    const lastSpace = phrase.slice(0, maxLen).lastIndexOf(" ");
    phrase = (lastSpace > 0 ? phrase.slice(0, lastSpace) : phrase.slice(0, maxLen)).trim();
  }
  if (!phrase) return false;

  const rewardExp = normalizeRewardExp(cfg?.fastType?.rewardExp ?? 100);
  const durationMs = Math.max(60000, Number(cfg?.fastType?.durationMs || 120000));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  if (cfg.roleId)
    await sendMinigameRolePing(channel, cfg);
  const fastTypeAttachment = buildPromptImageAttachment("Scrivi la frase", [phrase], "fast_type", "", client);
  const fastTypeEmbed = buildFastTypeEmbed(phrase, rewardExp, durationMs);
  if (fastTypeAttachment) {
    fastTypeEmbed.setImage(`attachment://${fastTypeAttachment.name}`);
  }
  const gameMessage = await sendMinigameMessage(channel, { embeds: [fastTypeEmbed], files: fastTypeAttachment ? [fastTypeAttachment] : [], }).catch(() => null);

  const timeout = setTimeout(async () => { const game = activeGames.get(channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, channelId, channel, game, buildTimeoutFastTypeEmbed(game.phrase)); }, durationMs); timeout.unref?.();

  activeGames.set(channelId, {
    type: "fastType",
    phrase,
    normalizedPhrase: normalizeCountryName(phrase),
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout: null,
    gameMessageId: gameMessage?.id || null,
  });

  await saveActiveGame(client, cfg, {
    type: "fastType",
    target: JSON.stringify({
      phrase,
      normalizedPhrase: normalizeCountryName(phrase),
    }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });

  markSent(channelId);
  return true;
}

async function startHangmanGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;

  let words = [];
  if (shouldUseHalloweenTheme(cfg)) {
    words = getHalloweenHangmanWords().map(normalizeWord).filter(isValidHangmanWord);
  }
  const apiUrl = cfg?.hangman?.apiUrl || cfg?.guessWord?.apiUrl || null;
  if (!words.length && apiUrl) {
    try {
      const res = await axios.get(apiUrl, { timeout: 15000 });
      const list = extractWordListFromApiPayload(res?.data);
      words = list.map(normalizeWord).filter(isValidHangmanWord);
    } catch (err) {
      warnMinigame(err);
    }
  }
  if (!words.length) {
    const fromShared = await loadWordList(cfg);
    words = fromShared.filter(isValidHangmanWord);
  }
  if (!words.length) {
    const customWords = Array.isArray(cfg?.hangman?.words) ? cfg.hangman.words : [];
    const fallbackWords = customWords.length
      ? customWords
      : shouldUseHalloweenTheme(cfg)
        ? getHalloweenHangmanWords()
        : getHangmanWords();
    words = fallbackWords.map(normalizeWord).filter(isValidHangmanWord);
  }
  if (!words.length) return false;

  const pickedWord = pickQuestionAvoidRecent(channelId, "hangman", words, (w?) => normalizeCountryName(w) || String(w || "").trim().toLowerCase(), 20) || pickRandomItem(words);
  const word = normalizeCountryName(pickedWord);
  if (!word) return false;

  const rewardExp = normalizeRewardExp(cfg?.hangman?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.hangman?.durationMs || 240000));
  let maxMisses = Math.max(3, Number(cfg?.hangman?.maxMisses || 10));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  if (cfg.roleId)
    await sendMinigameRolePing(channel, cfg);
  const guessedLetters = [];
  const maskedWord = maskHangmanWord(word, new Set(guessedLetters));
  const hangmanAttachment = buildPromptImageAttachment("Impiccato", [maskedWord, `Errori: 0/${maxMisses}`],
    "hangman", "", client);
  let hangmanEmbed = buildHangmanEmbed(maskedWord, rewardExp, durationMs);
  if (shouldUseHalloweenTheme(cfg)) hangmanEmbed.setTitle("Impiccato Halloween 🎃");
  if (hangmanAttachment) {
    hangmanEmbed.setImage(`attachment://${hangmanAttachment.name}`);
  }
  const gameMessage = await sendMinigameMessage(channel, { embeds: [hangmanEmbed], files: hangmanAttachment ? [hangmanAttachment] : [], }).catch(() => null);

  const timeout = setTimeout(async () => { const game = activeGames.get(channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, channelId, channel, game, buildTimeoutHangmanEmbed(game.word)); }, durationMs); timeout.unref?.();
    const hintTimeout = null;

  activeGames.set(channelId, {
    type: "hangman",
    word,
    guessedLetters,
    misses: 0,
    userMisses: {},
    maxMisses,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });

  await saveActiveGame(client, cfg, {
    type: "hangman",
    target: JSON.stringify({ word, guessedLetters, misses: 0, maxMisses, userMisses: {} }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });

  markSent(channelId);
  return true;
}

export = { startGuessNumberGame, startGuessWordGame, startFastTypeGame, startHangmanGame };
