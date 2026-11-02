/** Minigiochi: ripristino di quiz, impiccato, halloween, memoria e cultura. */
const { normalizeCountryName } = require("./minigameImages") as typeof import("./minigameImages");
const { buildTimeoutHangmanEmbed, buildTimeoutDrivingQuizEmbed, buildTimeoutMathEmbed, buildTimeoutGuessYearEmbed, buildTimeoutCompleteVerseEmbed, buildTimeoutGuessEmojiEmbed, buildTimeoutQuoteFilmEmbed, buildTimeoutCompleteProverbEmbed, buildTimeoutSynonymAntonymEmbed, buildTimeoutGuessCityEmbed } = require("./minigameEmbeds") as typeof import("./minigameEmbeds");
const { compactNoSpaces, buildRevealHint } = require("./minigameText") as typeof import("./minigameText");
const { activeGames, clearActiveGame } = require("./minigameState") as typeof import("./minigameState");
const { parseStateTarget, buildMinigameTimeoutEmbedForGame, buildGameSnapshotFromPersistedState, closeExpiredMinigameState, sendMinigameTimeoutAndClose, scheduleGenericHint } = require("./minigameRound") as typeof import("./minigameRound");
const { mountMemoryEmojiGameFromState } = require("./minigameMemory") as typeof import("./minigameMemory");

async function restoreQuizGames(client?, cfg?, channel?, restoreCfg?, state?, remainingMs?, endsAt?) {
  if (state.type === "hangman") {
    const parsed = parseStateTarget(state.target);
    const word = normalizeCountryName(parsed?.word || "");
    const guessedLetters = Array.isArray(parsed?.guessedLetters) ? parsed.guessedLetters : [];
    const misses = Number(parsed?.misses || 0);
    const maxMisses = Number(parsed?.maxMisses || 10);
    const userMisses = parsed?.userMisses && typeof parsed.userMisses === "object" ? parsed.userMisses : {};
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutHangmanEmbed(game.word)); }, remainingMs); timeout.unref?.();
    activeGames.set(cfg.channelId, {
      type: "hangman",
      word,
      guessedLetters,
      misses,
      userMisses,
      maxMisses,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      gameMessageId: state.gameMessageId || null,
    });
    return true;
  }
  if (state.type === "italianGK" || state.type === "halloweenQuiz") {
    const parsed = parseStateTarget(state.target);
    const question = parsed?.question || "Domanda";
    const answers = Array.isArray(parsed?.answers) ? parsed.answers : [];
    const displayAnswer = parsed?.displayAnswer || answers[0] || "sconosciuta";
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildMinigameTimeoutEmbedForGame(game)); }, remainingMs); timeout.unref?.();
    activeGames.set(cfg.channelId, {
      type: state.type,
      question,
      answers,
      displayAnswer,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      gameMessageId: state.gameMessageId || null,
    });
    return true;
  }
  if (state.type === "halloweenMissingEmoji" || state.type === "halloweenCountBats") {
    const parsed = parseStateTarget(state.target);
    const snapshot = buildGameSnapshotFromPersistedState(state);
    const timeout = setTimeout(async () => {
      const game = activeGames.get(cfg.channelId);
      if (!game) return;
      await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildMinigameTimeoutEmbedForGame(game));
    }, remainingMs);
    timeout.unref?.();
    activeGames.set(cfg.channelId, {
      ...snapshot,
      type: state.type,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      gameMessageId: state.gameMessageId || null,
      missing: parsed?.missing,
      count: parsed?.count,
      display: parsed?.display,
      choices: Array.isArray(parsed?.choices) ? parsed.choices : snapshot.choices || [],
      answers: parsed?.answers || snapshot.answers,
      displayAnswer: snapshot.displayAnswer,
    });
    return true;
  }
  if (state.type === "halloweenTrickOrTreat") {
    if (channel) await closeExpiredMinigameState(client, restoreCfg, channel, state);
    else await clearActiveGame(client, restoreCfg);
    return true;
  }
  if (state.type === "memoryEmoji") {
    await mountMemoryEmojiGameFromState(client, cfg, channel, state, remainingMs);
    return true;
  }
  if (state.type === "drivingQuiz") {
    const parsed = parseStateTarget(state.target);
    const statement = parsed?.statement || "";
    const isMultiple = Array.isArray(parsed?.options) && Number.isFinite(parsed?.correctIndex);
    const gameState: Record<string, any> = { type: "drivingQuiz", questionType: isMultiple ? "multiple" : "trueFalse", statement, rewardExp: Number(state.rewardExp || 0), startedAt: new Date(state.startedAt).getTime(), endsAt, timeout: null, gameMessageId: state.gameMessageId || null, };
    if (isMultiple) {
      gameState.options = parsed.options;
      gameState.correctIndex = parsed.correctIndex;
    } else {
      gameState.answer = Boolean(parsed?.answer);
    }
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutDrivingQuizEmbed(game)); }, remainingMs); timeout.unref?.();
    gameState.timeout = timeout;
    activeGames.set(cfg.channelId, gameState);
    return true;
  }
  if (state.type === "mathExpression") {
    const parsed = parseStateTarget(state.target);
    const expression = parsed?.expression || "";
    const answer = String(parsed?.answer || "0");
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutMathEmbed(game.answer)); }, remainingMs); timeout.unref?.();
    activeGames.set(cfg.channelId, {
      type: "mathExpression",
      expression,
      answer,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      gameMessageId: state.gameMessageId || null,
    });
    return true;
  }
  if (state.type === "guessYear") {
    const parsed = parseStateTarget(state.target);
    const year = Number(parsed?.year) || 0;
    const title = parsed?.title || "";
    const subtitle = parsed?.subtitle || "";
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutGuessYearEmbed(game.title, game.subtitle, game.year)); }, remainingMs); timeout.unref?.();
    const hintText = `Anno: ${buildRevealHint(String(year))}`;
    const hintTimeout = await scheduleGenericHint(client, cfg.channelId, remainingMs, hintText);
    activeGames.set(cfg.channelId, {
      type: "guessYear",
      year,
      title,
      subtitle,
      answers: [String(year), String(year).slice(-2)],
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      gameMessageId: state.gameMessageId || null,
    });
    return true;
  }
  if (state.type === "completeVerse") {
    const parsed = parseStateTarget(state.target);
    const answerNorm = normalizeCountryName(parsed?.answer || "");
    const answers = Array.isArray(parsed?.answers) && parsed.answers.length
      ? parsed.answers
      : [answerNorm, parsed?.answer, compactNoSpaces(answerNorm)].filter(Boolean);
    const verse = parsed?.verse || "";
    const answer = parsed?.answer || "";
    const song = parsed?.song || "";
    const artist = parsed?.artist || "";
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutCompleteVerseEmbed(game.answer, game.song, game.artist)); }, remainingMs); timeout.unref?.();
    const hintText = `Verso: ${buildRevealHint(answer)}`;
    const hintTimeout = await scheduleGenericHint(client, cfg.channelId, remainingMs, hintText);
    activeGames.set(cfg.channelId, {
      type: "completeVerse",
      answers,
      verse,
      answer,
      song,
      artist,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      gameMessageId: state.gameMessageId || null,
    });
    return true;
  }
  if (state.type === "guessEmoji") {
    const parsed = parseStateTarget(state.target);
    const sourceAnswers = Array.isArray(parsed?.answers) && parsed.answers.length
      ? parsed.answers
      : (parsed?.answer ? [parsed.answer] : []);
    const answers = Array.from(
      new Set(
        sourceAnswers.map((value?) => normalizeCountryName(value)).filter(Boolean),
      ),
    );
    const displayAnswer = String(parsed?.displayAnswer || sourceAnswers[0] || answers[0] || "").trim();
    if (!answers.length) return true;
    const emojis = parsed?.emojis || "";
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutGuessEmojiEmbed(game.emojis, game.displayAnswer || game.answers?.[0] || "")); }, remainingMs); timeout.unref?.();
    const hintText = `Risposta: ${buildRevealHint(displayAnswer || answers[0] || "")}`;
    const hintTimeout = await scheduleGenericHint(client, cfg.channelId, remainingMs, hintText);
    activeGames.set(cfg.channelId, {
      type: "guessEmoji",
      answers,
      displayAnswer,
      emojis,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      gameMessageId: state.gameMessageId || null,
    });
    return true;
  }
  if (state.type === "quoteFilm") {
    const parsed = parseStateTarget(state.target);
    const primaryAnswer = String(parsed?.answer || parsed?.displayAnswer || "").trim();
    const answerNorm = normalizeCountryName(primaryAnswer);
    const answers = Array.isArray(parsed?.answers) && parsed.answers.length
      ? parsed.answers
      : [answerNorm, primaryAnswer, compactNoSpaces(answerNorm)].filter(Boolean);
    const quote = parsed?.quote || "";
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutQuoteFilmEmbed(game.quote, game.answers?.[0] || "")); }, remainingMs); timeout.unref?.();
    const hintText = `Film/Serie: ${buildRevealHint(answers[0] || "")}`;
    const hintTimeout = await scheduleGenericHint(client, cfg.channelId, remainingMs, hintText);
    activeGames.set(cfg.channelId, {
      type: "quoteFilm",
      answers,
      quote,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      gameMessageId: state.gameMessageId || null,
    });
    return true;
  }
  if (state.type === "completeProverb") {
    const parsed = parseStateTarget(state.target);
    const endNorm = normalizeCountryName(parsed?.end || "");
    const answers = Array.isArray(parsed?.answers) && parsed.answers.length
      ? parsed.answers
      : [endNorm, parsed?.end, compactNoSpaces(endNorm)].filter(Boolean);
    const start = parsed?.start || "";
    const end = parsed?.end || "";
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutCompleteProverbEmbed(game.start, game.end)); }, remainingMs); timeout.unref?.();
    const hintText = `Fine proverbio: ${buildRevealHint(end) ?? "—"}`;
    const hintTimeout = await scheduleGenericHint(client, cfg.channelId, remainingMs, hintText);
    activeGames.set(cfg.channelId, {
      type: "completeProverb",
      answers,
      start,
      end,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      gameMessageId: state.gameMessageId || null,
    });
    return true;
  }
  if (state.type === "synonymAntonym") {
    const parsed = parseStateTarget(state.target);
    const answerRaw = parsed?.answer;
    const answerNorm = normalizeCountryName(answerRaw || "");
    const answers = Array.isArray(parsed?.answers) && parsed.answers.length
      ? parsed.answers
      : [answerNorm, answerRaw, compactNoSpaces(answerNorm)].filter(Boolean);
    const word = parsed?.word || "";
    const kind = parsed?.kind || "synonym";
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; const solution = game.answers?.[0] ?? game.answer ?? ""; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutSynonymAntonymEmbed(game.word, solution, game.kind)); }, remainingMs); timeout.unref?.();
    const hintReveal = buildRevealHint(answers[0] ?? answerRaw ?? "");
    const hintText = (kind === "antonym" ? "Contrario: " : "Sinonimo: ") + (hintReveal != null ? hintReveal : "—");
    const hintTimeout = await scheduleGenericHint(client, cfg.channelId, remainingMs, hintText);
    activeGames.set(cfg.channelId, {
      type: "synonymAntonym",
      answers,
      word,
      kind,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      gameMessageId: state.gameMessageId || null,
    });
    return true;
  }
  if (state.type === "guessCity") {
    const parsed = parseStateTarget(state.target);
    const cityNorm = normalizeCountryName(parsed?.city || "");
    const answers = Array.isArray(parsed?.answers) && parsed.answers.length
      ? parsed.answers
      : [cityNorm, parsed?.city, compactNoSpaces(cityNorm)].filter(Boolean);
    const landmark = parsed?.landmark || "";
    const city = parsed?.city || "";
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutGuessCityEmbed(game.landmark, game.city || game.answers?.[0] || "")); }, remainingMs); timeout.unref?.();
    const hintText = `Città: ${buildRevealHint(city || answers[0] || "")}`;
    const hintTimeout = await scheduleGenericHint(client, cfg.channelId, remainingMs, hintText);
    activeGames.set(cfg.channelId, {
      type: "guessCity",
      answers,
      landmark,
      city,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      gameMessageId: state.gameMessageId || null,
    });
    return true;
  }
  return false;
}

export = { restoreQuizGames };
