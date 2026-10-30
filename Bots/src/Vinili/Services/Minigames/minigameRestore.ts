/** Minigiochi: ripristino del gioco in corso dopo un riavvio del bot (per ogni tipo). */
const { minigameStateFindOneLean } = require("../../Utils/BotState/domainStatesStore") as typeof import("../../Utils/BotState/domainStatesStore");
const { warnMinigame } = require("./minigameLog") as typeof import("./minigameLog");
const { normalizeCountryName } = require("./minigameImages") as typeof import("./minigameImages");
const { buildTimeoutNumberEmbed, buildTimeoutWordEmbed, buildTimeoutFlagEmbed, buildTimeoutPlayerEmbed, buildTimeoutSongEmbed, buildTimeoutFindBotEmbed, buildTimeoutFindBotVoiceEmbed, buildTimeoutCapitalEmbed, buildTimeoutRegionCapitalEmbed, buildTimeoutReverseCapitalEmbed, buildTimeoutFastTypeEmbed, buildTimeoutTeamEmbed, buildTimeoutSingerEmbed, buildTimeoutAlbumEmbed, buildTimeoutHangmanEmbed, buildTimeoutDrivingQuizEmbed, buildTimeoutMathEmbed, buildTimeoutGuessYearEmbed, buildTimeoutCompleteVerseEmbed, buildTimeoutGuessEmojiEmbed, buildTimeoutQuoteFilmEmbed, buildTimeoutCompleteProverbEmbed, buildTimeoutSynonymAntonymEmbed, buildTimeoutGuessCityEmbed, buildTreasureHuntTimeoutEmbed } = require("./minigameEmbeds") as typeof import("./minigameEmbeds");
const { normalizePlayerGuess, buildAliases } = require("./minigameSources") as typeof import("./minigameSources");
const { getChannelCached } = require("./minigameUtils") as typeof import("./minigameUtils");
const { compactNoSpaces, buildPlayerAnswerAliases, buildRevealHint, buildCountryHint, buildCapitalHint, buildRegionCapitalHint } = require("./minigameText") as typeof import("./minigameText");
const { activeGames, clearActiveGame } = require("./minigameState") as typeof import("./minigameState");
const { sendMinigameMessage } = require("./minigameDiscord") as typeof import("./minigameDiscord");
const { treasureHuntDisplayTexts, getTreasureHuntMessageUrl } = require("./minigameTreasureEmoji") as typeof import("./minigameTreasureEmoji");
const { resolveMinigameGuildIdAsync, parseStateTarget, buildMinigameTimeoutEmbedForGame, buildGameSnapshotFromPersistedState, closeExpiredMinigameState, sendMinigameTimeoutAndClose, scheduleMinuteHint, scheduleGenericHint } = require("./minigameRound") as typeof import("./minigameRound");
const { getConfig, loadRotationState } = require("./minigameConfig") as typeof import("./minigameConfig");
const { mountRestoredTrickOrTreat, restoreTrickOrTreatSideSlot } = require("./minigameTrickOrTreat") as typeof import("./minigameTrickOrTreat");
const { mountTreasureHuntGame } = require("./minigameTreasureHunt") as typeof import("./minigameTreasureHunt");
const { mountMemoryEmojiGameFromState } = require("./minigameMemory") as typeof import("./minigameMemory");
const { scheduleFindMinigameTimeout, joinFindBotVoiceChannel } = require("./minigameFindBot") as typeof import("./minigameFindBot");

async function restoreActiveGames(client?) {
  const cfg = getConfig(client);
  if (!cfg?.enabled || !cfg.channelId) return;
  let channel = await getChannelCached(client, cfg.channelId);
  let guildId = channel?.guild?.id || null;
  if (!guildId) guildId = await resolveMinigameGuildIdAsync(cfg, client);
  if (!guildId) return;
  if (!channel) channel = await getChannelCached(client, cfg.channelId);
  await loadRotationState(client, { ...cfg, guildId }, guildId);
  const restoreCfg = { ...cfg, guildId };
  // ToT su slot dedicato: resta attivo anche se Impiccato occupa lo slot minigioco.
  if (channel?.guild) {
    await restoreTrickOrTreatSideSlot(client, restoreCfg, channel).catch((err?) => warnMinigame(err));
  }
  const state = await minigameStateFindOneLean({ guildId, channelId: cfg.channelId, }).catch(() => null);
  if (!state) return;
  const now = Date.now();
  const endsAt = new Date(state.endsAt).getTime();
  if (endsAt <= now) {
    if (channel) await closeExpiredMinigameState(client, restoreCfg, channel, state);
    else await clearActiveGame(client, restoreCfg);
    return;
  }
  if (!channel?.guild) return;
  const remainingMs = endsAt - now;
  if (state.type === "guessNumber") {
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutNumberEmbed(game.target)); }, remainingMs); timeout.unref?.();
    const game = {
      type: "guessNumber",
      target: Number(state.target),
      min: Number(state.min),
      max: Number(state.max),
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      gameMessageId: state.gameMessageId || null,
    };
    activeGames.set(cfg.channelId, game);
    return;
  }
  if (state.type === "guessWord") {
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutWordEmbed(game.target)); }, remainingMs); timeout.unref?.();
    activeGames.set(cfg.channelId, {
      type: "guessWord",
      target: String(state.target || "").toLowerCase(),
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "guessFlag") {
    const parsed = parseStateTarget(state.target);
    const answers = Array.isArray(parsed?.names) ? parsed.names : [];
    const displayName = parsed?.displayName || "la bandiera";
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutFlagEmbed(game.displayName)); }, remainingMs); timeout.unref?.();
    const countryHint = buildCountryHint(parsed);
    const hintTimeout = await scheduleGenericHint(
      client,
      cfg.channelId,
      remainingMs,
      countryHint || `Nazione: ${buildRevealHint(displayName)}`,
    );
    activeGames.set(cfg.channelId, {
      type: "guessFlag",
      answers,
      displayName,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "guessPlayer") {
    const parsed = parseStateTarget(state.target);
    const name = parsed?.name || "il calciatore";
    const team = parsed?.team || "Squadra sconosciuta";
    const nationality = parsed?.nationality || "Nazionalità sconosciuta";
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutPlayerEmbed(game.displayName)); }, remainingMs); timeout.unref?.();
    const hintTimeout = await scheduleGenericHint(client, cfg.channelId, remainingMs, `${team} \u2022 ${nationality} \u2022 ${buildRevealHint(name)}`,
  );
    activeGames.set(cfg.channelId, {
      type: "guessPlayer",
      answers: buildPlayerAnswerAliases(name, parsed?.aliases),
      fullAnswer: normalizePlayerGuess(name),
      displayName: name,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "guessSong") {
    const parsed = parseStateTarget(state.target);
    const title = parsed?.title || "la canzone";
    const artist = parsed?.artist || "";
    const artistCountry = parsed?.artistCountry || "Nazionalità sconosciuta";
    const genre = parsed?.genre || "Genere sconosciuto";
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutSongEmbed(game.title, game.artist)); }, remainingMs); timeout.unref?.();
    const hintTimeout = await scheduleGenericHint(client, cfg.channelId, remainingMs, `${artistCountry} \u2022 ${genre} \u2022 Canzone: ${buildRevealHint(title)}`,
  );
    activeGames.set(cfg.channelId, {
      type: "guessSong",
      title,
      artist,
      previewUrl: parsed?.previewUrl || null,
      previewCustomId: state.customId || null,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "guessCapital") {
    const parsed = parseStateTarget(state.target);
    const country = parsed?.country || "nazione sconosciuta";
    const answers = Array.isArray(parsed?.answers) ? parsed.answers : [];
    const displayAnswer = parsed?.displayAnswer || answers[0] || "sconosciuta";
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutCapitalEmbed(game.country, game.displayAnswer)); }, remainingMs); timeout.unref?.();
    const capitalHint = buildCapitalHint(country);
    const hintTimeout = await scheduleGenericHint(client, cfg.channelId, remainingMs, capitalHint || `Capitale: ${buildRevealHint(displayAnswer)}`);
    activeGames.set(cfg.channelId, {
      type: "guessCapital",
      country,
      answers,
      displayAnswer,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "guessReverseCapital") {
    const parsed = parseStateTarget(state.target);
    const capital = parsed?.capital || "capitale sconosciuta";
    const country = parsed?.country || "nazione sconosciuta";
    const answers = Array.isArray(parsed?.answers) ? parsed.answers : [];
    const displayAnswer = parsed?.displayAnswer || country || answers[0] || "sconosciuto";
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutReverseCapitalEmbed(game.capital, game.displayAnswer)); }, remainingMs); timeout.unref?.();
    const capitalHint = buildCapitalHint(country);
    const hintTimeout = await scheduleGenericHint(client, cfg.channelId, remainingMs, capitalHint || `Stato: ${buildRevealHint(displayAnswer)}`);
    activeGames.set(cfg.channelId, {
      type: "guessReverseCapital",
      capital,
      country,
      answers,
      displayAnswer,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "guessRegionCapital") {
    const parsed = parseStateTarget(state.target);
    const region = parsed?.region || "regione sconosciuta";
    const answers = Array.isArray(parsed?.answers) ? parsed.answers : [];
    const displayAnswer = parsed?.displayAnswer || answers[0] || "sconosciuto";
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutRegionCapitalEmbed(game.region, game.displayAnswer),); }, remainingMs); timeout.unref?.();
    const regionHint = buildRegionCapitalHint(region);
    const hintTimeout = await scheduleGenericHint(client, cfg.channelId, remainingMs, regionHint || `Capoluogo: ${buildRevealHint(displayAnswer)}`);
    activeGames.set(cfg.channelId, {
      type: "guessRegionCapital",
      region,
      answers,
      displayAnswer,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "fastType") {
    const parsed = parseStateTarget(state.target);
    const phrase = parsed?.phrase || "";
    const normalizedPhrase = parsed?.normalizedPhrase || normalizeCountryName(phrase);
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutFastTypeEmbed(game.phrase)); }, remainingMs); timeout.unref?.();
    activeGames.set(cfg.channelId, {
      type: "fastType",
      phrase,
      normalizedPhrase,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "guessTeam") {
    const parsed = parseStateTarget(state.target);
    const team = parsed?.team || "squadra sconosciuta";
    const answers = Array.isArray(parsed?.answers) ? parsed.answers : buildAliases([team]);
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutTeamEmbed(game.team)); }, remainingMs); timeout.unref?.();
    activeGames.set(cfg.channelId, {
      type: "guessTeam",
      team,
      answers,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "guessSinger") {
    const parsed = parseStateTarget(state.target);
    const name = parsed?.name || "cantante sconosciuto";
    const answers = Array.isArray(parsed?.answers) ? parsed.answers : buildAliases([name]);
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutSingerEmbed(game.name)); }, remainingMs); timeout.unref?.();
    activeGames.set(cfg.channelId, {
      type: "guessSinger",
      name,
      answers,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "guessAlbum") {
    const parsed = parseStateTarget(state.target);
    const album = parsed?.album || "album sconosciuto";
    const artist = parsed?.artist || "artista sconosciuto";
    const answers = Array.isArray(parsed?.answers) ? parsed.answers : buildAliases([album]);
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutAlbumEmbed(game.album, game.artist)); }, remainingMs); timeout.unref?.();
    activeGames.set(cfg.channelId, {
      type: "guessAlbum",
      album,
      artist,
      answers,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
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
    return;
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
    return;
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
    return;
  }
  if (state.type === "halloweenTrickOrTreat") {
    // Legacy: ToT era sullo slot minigioco → migra sul side slot
    await mountRestoredTrickOrTreat(client, restoreCfg, channel, state);
    return;
  }
  if (state.type === "memoryEmoji") {
    await mountMemoryEmojiGameFromState(client, cfg, channel, state, remainingMs);
    return;
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
    return;
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
    return;
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
    return;
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
    return;
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
    if (!answers.length) return;
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
    return;
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
    return;
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
    return;
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
    return;
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
    return;
  }
  if (state.type === "treasureHunt") {
    const parsed = parseStateTarget(state.target);
    const decoy = String(parsed?.decoy || "");
    const winner = String(parsed?.winner || "");
    const winnerMessageId = parsed?.winnerMessageId ? String(parsed.winnerMessageId) : null;
    if (!decoy || !winner) {
      await clearActiveGame(client, cfg);
      return;
    }
    if (winnerMessageId) {
      const winnerExists = await channel.messages.fetch(winnerMessageId).catch(() => null);
      if (!winnerExists) {
        const url = getTreasureHuntMessageUrl(channel.guildId || channel.guild?.id, channel.id, winnerMessageId);
        const labels = await treasureHuntDisplayTexts(channel.guild, decoy, winner);
        await sendMinigameMessage(channel, {
            embeds: [
              buildTreasureHuntTimeoutEmbed(labels.decoy, labels.winner, url),
            ],
          })
          .catch(() => {});
        await clearActiveGame(client, cfg);
        return;
      }
    }
    await mountTreasureHuntGame(client, cfg, channel, state, remainingMs);
    return;
  }
  if (state.type === "findBot" || state.type === "halloweenFindGhost") {
    const timeoutEmbedBuilder =
      state.type === "halloweenFindGhost"
        ? () => buildTimeoutFindBotEmbed().setTitle("Tempo scaduto — il fantasma è scappato 👻")
        : buildTimeoutFindBotEmbed;
    const timeout = scheduleFindMinigameTimeout(client, cfg, cfg.channelId, channel, state.customId, remainingMs, timeoutEmbedBuilder);
    const hintTimeout = await scheduleMinuteHint(client, state.targetChannelId, remainingMs, cfg.channelId,);
    const game = {
      type: state.type,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      channelId: state.targetChannelId,
      messageId: state.gameMessageId || null,
      mainMessageId: state.mainMessageId || null,
      customId: state.customId,
    };
    activeGames.set(cfg.channelId, game);
    return;
  }
  if (state.type === "findBotVoice") {
    const voiceChannelId = String(state.targetChannelId || "").trim();
    const guildId = String(channel.guild?.id || cfg.guildId || "");
    if (voiceChannelId && channel.guild) {
      const voiceChannel =
        channel.guild.channels.cache.get(voiceChannelId) ||
        (await channel.guild.channels.fetch(voiceChannelId).catch(() => null));
      if (voiceChannel?.isVoiceBased?.()) {
        await joinFindBotVoiceChannel(channel.guild, voiceChannel).catch(() => null);
      }
    }
    const sessionId = state.customId || `minigame_findbotvoice:restored:${Date.now()}`;
    const timeout = scheduleFindMinigameTimeout(
      client,
      cfg,
      cfg.channelId,
      channel,
      sessionId,
      remainingMs,
      buildTimeoutFindBotVoiceEmbed,
    );
    const hintTimeout = voiceChannelId
      ? await scheduleMinuteHint(client, voiceChannelId, remainingMs, cfg.channelId)
      : null;
    activeGames.set(cfg.channelId, {
      type: "findBotVoice",
      guildId,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      channelId: voiceChannelId,
      voiceChannelId,
      mainMessageId: state.mainMessageId || null,
      customId: sessionId,
    });
    return;
  }
}

export = { restoreActiveGames };
