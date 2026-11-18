/** Minigiochi quiz: cultura generale, matematica, anni, versi, emoji, film, proverbi, sinonimi. */
const axios = require("axios") as any;
const { getGuessYearBank, getCompleteVerseBank, getGuessEmojiBank, getQuoteFilmBank, getProverbBank, getSynonymAntonymBank, getItalianGkBank } = require("../../Minigames/data/minigameBanks") as typeof import("../../Minigames/data/minigameBanks");
const { shouldUseHalloweenTheme, getHalloweenGuessYearBank, getHalloweenCompleteVerseBank } = require("../../Minigames/utils/halloweenMinigameHooks") as typeof import("../../Minigames/utils/halloweenMinigameHooks");
const {
  shouldUseStarWarsTheme,
  getStarWarsCompleteQuoteBank,
} = require("../../Minigames/utils/starWarsMinigameHooks") as typeof import("../../Minigames/utils/starWarsMinigameHooks");
const { warnMinigame } = require("./minigameLog") as typeof import("./minigameLog");
const { normalizeCountryName, polishItalianQuestionText, buildEmojiRichPromptImageAttachment, buildPromptImageAttachment, buildMathExpressionImageAttachment, resolveMinigamePromptAttachment, fetchMediaCoverImage, fetchCinemaAtmosphereImage, buildRemoteGuessImageCardAttachment, buildAtmosphereTextCardAttachment } = require("./minigameImages") as typeof import("./minigameImages");
const { buildItalianGkEmbed, buildMathExpressionEmbed, buildTimeoutItalianGkEmbed, buildTimeoutMathEmbed, buildGuessYearEmbed, buildCompleteVerseEmbed, buildGuessEmojiEmbed, buildQuoteFilmEmbed, buildCompleteProverbEmbed, buildSynonymAntonymEmbed } = require("./minigameEmbeds") as typeof import("./minigameEmbeds");
const { buildAliases } = require("./minigameSources") as typeof import("./minigameSources");
const { getChannelCached, pickRandomItem } = require("./minigameUtils") as typeof import("./minigameUtils");
const { compactNoSpaces, normalizeRewardExp, isLikelyItalianText, createMathQuestion, buildRevealHint } = require("./minigameText") as typeof import("./minigameText");
const { activeGames, isQuestionKeyRecent, pushQuestionKeyToRecent, pickQuestionAvoidRecent, recentLimitForBank } = require("./minigameState") as typeof import("./minigameState");
const { sendMinigameRolePing } = require("./minigameRolePing") as typeof import("./minigameRolePing");
const { sendMinigameMessage } = require("./minigameDiscord") as typeof import("./minigameDiscord");
const { minigameDraftVars } = require("./minigameDraftSend") as typeof import("./minigameDraftSend");
const { markSent, saveActiveGame, scheduleMinigameRoundTimeout, sendMinigameTimeoutAndClose, scheduleGenericHint } = require("./minigameRound") as typeof import("./minigameRound");
const { translateToItalian, buildItalianGkApiUrls, parseItalianGkQuestionFromPayload } = require("./quizSources") as typeof import("./quizSources");
const { fetchGuessYearApiCandidates, pickGuessYearFromApiPool } = require("./minigameYearSources") as typeof import("./minigameYearSources");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");

async function tryItalianGkFromApi(channelId?, cfg?, recentLimit = 60) {
  const apiUrls = buildItalianGkApiUrls(cfg);
  if (!apiUrls.length) return null;
  /* OpenTDB è in inglese: non richiedere italiano sul testo grezzo */
  const requireItalian = cfg?.italianGK?.requireItalian === true;
  for (const apiUrl of apiUrls.slice(0, 6)) {
    try {
      const res = await axios.get(apiUrl, { timeout: 15000 });
      const parsed = parseItalianGkQuestionFromPayload(res?.data);
      if (!parsed?.question || !parsed?.answers?.length) continue;
      if (requireItalian && !isLikelyItalianText(parsed.question)) continue;
      if (isQuestionKeyRecent(channelId, "italianGK", parsed.question, recentLimit)) continue;
      let questionRow = parsed;
      if (cfg?.translateApiToItalian !== false) {
        const [q, a] = await Promise.all([
          translateToItalian(questionRow.question, cfg),
          translateToItalian(String(questionRow.answers?.[0] || ""), cfg),
        ]);
        if (q) questionRow = { ...questionRow, question: polishItalianQuestionText(q) };
        if (a) questionRow = { ...questionRow, answers: buildAliases([a]) };
      }
      return questionRow;
    } catch (err) {
      warnMinigame(err);
    }
  }
  return null;
}

async function startItalianGkGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;

  let questionRow = null;
  let fromApi = false;
  const gkBank = getItalianGkBank();
  const recentLimit = recentLimitForBank(gkBank, 50);
  /* preferisci API spesso: altrimenti la bank locale monopolizza e ripete */
  const preferApi = cfg?.italianGK?.useDefaultApi !== false && Math.random() < 0.65;
  if (preferApi) {
    questionRow = await tryItalianGkFromApi(channelId, cfg, recentLimit);
    if (questionRow) fromApi = true;
  }
  if (!questionRow) {
    const localPick = pickQuestionAvoidRecent(channelId, "italianGK", gkBank, (q?) => q?.question, recentLimit);
    if (localPick?.question && Array.isArray(localPick?.answers)) {
      questionRow = {
        question: polishItalianQuestionText(String(localPick.question)),
        answers: buildAliases(localPick.answers),
      };
    }
  }
  if (!questionRow && !preferApi) {
    questionRow = await tryItalianGkFromApi(channelId, cfg, recentLimit);
    if (questionRow) fromApi = true;
  }
  if (!questionRow) return false;
  if (!questionRow.answers.length) return false;
  if (fromApi) pushQuestionKeyToRecent(channelId, "italianGK", questionRow.question, recentLimit);
  questionRow = {
    ...questionRow,
    question: polishItalianQuestionText(questionRow.question),
  };

  const rewardExp = normalizeRewardExp(cfg?.italianGK?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.italianGK?.durationMs || 180000));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  if (cfg.roleId)
    await sendMinigameRolePing(channel, cfg);
  const gkAttachment = buildPromptImageAttachment("Cultura generale", [questionRow.question], "italian_gk", "", client);
  const gkEmbed = buildItalianGkEmbed(rewardExp, durationMs);
  if (gkAttachment) {
    gkEmbed.setImage(`attachment://${gkAttachment.name}`);
  }
  const gameMessage = await sendMinigameMessage(
    channel,
    { embeds: [gkEmbed], files: gkAttachment ? [gkAttachment] : [] },
    { type: "italianGK", kind: "start", vars: minigameDraftVars(channel, { exp: rewardExp, durationMs, question: questionRow.question }) },
  ).catch(() => null);
  const displayAnswer = String(questionRow.answers[0] || "sconosciuta");

  const timeout = setTimeout(async () => { const game = activeGames.get(channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, channelId, channel, game, buildTimeoutItalianGkEmbed(game.displayAnswer)); }, durationMs); timeout.unref?.();
  const hintTimeout = await scheduleGenericHint(client, channelId, durationMs, `Risposta: ${buildRevealHint(displayAnswer)}`,
  );

  activeGames.set(channelId, {
    type: "italianGK",
    question: questionRow.question,
    answers: questionRow.answers,
    displayAnswer,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });

  const saved = await saveActiveGame(client, cfg, {
    type: "italianGK",
    target: JSON.stringify({
      question: questionRow.question,
      answers: questionRow.answers,
      displayAnswer,
    }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });

  if (!saved) return false;
  markSent(channelId);
  return true;
}

async function startMathExpressionGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const row = createMathQuestion();
  if (!row?.expression) return false;

  const rewardExp = normalizeRewardExp(cfg?.mathExpression?.rewardExp ?? 100);
  const durationMs = Math.max(60000, Number(cfg?.mathExpression?.durationMs || 150000));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  if (cfg.roleId)
    await sendMinigameRolePing(channel, cfg);
  const expressionAttachment = buildMathExpressionImageAttachment(row.expression);
  const files = expressionAttachment ? [expressionAttachment] : [];
  const gameMessage = await sendMinigameMessage(
    channel,
    { embeds: [buildMathExpressionEmbed(rewardExp, durationMs, expressionAttachment?.name || null)], files },
    { type: "mathExpression", kind: "start", vars: minigameDraftVars(channel, { exp: rewardExp, durationMs, expression: row.expression }) },
  ).catch(() => null);

  const timeout = setTimeout(async () => { const game = activeGames.get(channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, channelId, channel, game, buildTimeoutMathEmbed(game.answer)); }, durationMs); timeout.unref?.();
  const answerNum = Number(row.answer);
  const hintRangeText = Number.isFinite(answerNum) ? `${E.VC_Flame} Il risultato è compreso tra **${Math.floor(answerNum - 2)}** e **${Math.ceil(answerNum + 2)}**.`
    : `${E.VC_Flame} Il risultato è un numero intero.`;
  const hintTimeout = await scheduleGenericHint(client, channelId, durationMs, hintRangeText,);

  activeGames.set(channelId, {
    type: "mathExpression",
    expression: row.expression,
    answer: String(row.answer),
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });

  const saved = await saveActiveGame(client, cfg, {
    type: "mathExpression",
    target: JSON.stringify({
      expression: row.expression,
      answer: String(row.answer),
    }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });

  if (!saved) return false;
  markSent(channelId);
  return true;
}

async function startGuessYearGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const bank = shouldUseHalloweenTheme(cfg) ? getHalloweenGuessYearBank() : getGuessYearBank();
  const recentLimit = recentLimitForBank(bank, 60);
  let pick = null;
  /* TVMaze + iTunes: varietà enorme oltre la bank locale */
  if (!shouldUseHalloweenTheme(cfg) && cfg?.guessYear?.useDefaultApi !== false && Math.random() < 0.55) {
    const apiPool = await fetchGuessYearApiCandidates(50).catch(() => []);
    pick = pickGuessYearFromApiPool(apiPool, (key?) => isQuestionKeyRecent(channelId, "guessYear", key, recentLimit));
    if (pick) pushQuestionKeyToRecent(channelId, "guessYear", `${pick.type}:${pick.title}:${pick.year}`, recentLimit);
  }
  if (!pick) {
    pick = pickQuestionAvoidRecent(channelId, "guessYear", bank, (r?) => `${r.type}:${r.title}:${r.year}`, recentLimit);
  }
  if (!pick) return false;
  const rewardExp = normalizeRewardExp(cfg?.guessYear?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.guessYear?.durationMs || 180000));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;
  await sendMinigameRolePing(channel, cfg);
  const typeLabel = { film: "Film", series: "Serie TV", song: "Canzone", album: "Album" }[pick.type] || pick.type;
  const coverTitle = pick.subtitle ? `${pick.title} — ${pick.subtitle}` : pick.title;
  const coverUrl = await fetchMediaCoverImage(pick.title, pick.type).catch(() => null);
  const yearTitle = shouldUseHalloweenTheme(cfg) ? "Indovina l'anno Halloween" : "Indovina l'anno";
  const attachment =
    (coverUrl
      ? await buildRemoteGuessImageCardAttachment(
          coverUrl,
          `${String(pick.title || "").slice(0, 36)}${typeLabel ? ` · ${typeLabel}` : ""}`,
          "guess_year.png",
        ).catch(() => null)
      : null) ||
    buildPromptImageAttachment(yearTitle, [coverTitle, `Categoria: ${typeLabel}`], "guess_year", "", client);
  const imageUrl = attachment ? `attachment://${attachment.name}` : null;
  /* con poster: embed corto (la copertina è la domanda); senza: titolo nel testo */
  const embed = buildGuessYearEmbed(pick.title, pick.subtitle || null, rewardExp, durationMs, coverUrl ? imageUrl : null);
  if (imageUrl) embed.setImage(imageUrl);
  if (shouldUseHalloweenTheme(cfg)) embed.setTitle("Indovina l'anno Halloween 🎃");
  const gameMessage = await sendMinigameMessage(
    channel,
    { embeds: [embed], files: attachment ? [attachment] : [] },
    {
      type: "guessYear",
      kind: "start",
      vars: minigameDraftVars(channel, {
        exp: rewardExp,
        durationMs,
        title: coverUrl ? typeLabel : pick.title,
        image: imageUrl || "",
        prompt: coverUrl
          ? `Guarda l’immagine (${typeLabel}) e indovina l’anno di uscita per **${rewardExp} exp**.`
          : undefined,
      }),
    },
  ).catch(() => null);
  const timeout = scheduleMinigameRoundTimeout(client, cfg, channelId, channel, durationMs);
  const yearHint = `${E.VC_Flame} L'anno è tra **${pick.year - 5}** e **${pick.year + 5}**.`;
  const hintTimeout = await scheduleGenericHint(client, channelId, durationMs, yearHint);
  activeGames.set(channelId, {
    type: "guessYear",
    title: pick.title,
    subtitle: pick.subtitle || null,
    year: pick.year,
    answers: [String(pick.year), String(pick.year).slice(-2)],
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });
  const saved = await saveActiveGame(client, cfg, {
    type: "guessYear",
    target: JSON.stringify({ title: pick.title, subtitle: pick.subtitle, year: pick.year }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });
  if (!saved) return false;
  markSent(channelId);
  return true;
}

async function startCompleteVerseGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const bank = shouldUseStarWarsTheme(cfg)
    ? getStarWarsCompleteQuoteBank()
    : shouldUseHalloweenTheme(cfg)
      ? getHalloweenCompleteVerseBank()
      : getCompleteVerseBank();
  const pick = pickQuestionAvoidRecent(channelId, "completeVerse", bank, (r?) => r.verse, recentLimitForBank(bank, 40));
  if (!pick) return false;
  const rewardExp = normalizeRewardExp(cfg?.completeVerse?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.completeVerse?.durationMs || 180000));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;
  await sendMinigameRolePing(channel, cfg);
  const promptTitle = shouldUseHalloweenTheme(cfg) && !shouldUseStarWarsTheme(cfg)
    ? "Completa il verso Halloween"
    : "Completa il verso";
  const verseLines = [pick.verse, `${pick.song} — ${pick.artist}`];
  /* copertina brano/artista come atmosfera (titolo già noto); SW resta sul path tematico */
  let attachment = null;
  let verseSwBg = null;
  if (!shouldUseStarWarsTheme(cfg)) {
    const coverUrl = await fetchMediaCoverImage(pick.song || pick.artist, "song").catch(() => null);
    if (coverUrl) {
      attachment = await buildAtmosphereTextCardAttachment(promptTitle, verseLines, coverUrl, "complete_verse.png").catch(
        () => null,
      );
    }
  }
  if (!attachment) {
    const resolved = await resolveMinigamePromptAttachment(cfg, promptTitle, verseLines, "complete_verse", client);
    attachment = resolved?.attachment || null;
    verseSwBg = resolved?.backgroundUrl || null;
  }
  const imageUrl = attachment ? `attachment://${attachment.name}` : null;
  const embed = buildCompleteVerseEmbed(rewardExp, durationMs, imageUrl);
  if (shouldUseHalloweenTheme(cfg) && !shouldUseStarWarsTheme(cfg)) embed.setTitle("Completa il verso Halloween 🎃");
  const gameMessage = await sendMinigameMessage(
    channel,
    { embeds: [embed], files: attachment ? [attachment] : [] },
    { type: "completeVerse", kind: "start", vars: minigameDraftVars(channel, { exp: rewardExp, durationMs }) },
  ).catch(() => null);
  const timeout = scheduleMinigameRoundTimeout(client, cfg, channelId, channel, durationMs);
  const hintText = `Verso: ${buildRevealHint(pick.answer)}`;
  const hintTimeout = await scheduleGenericHint(client, channelId, durationMs, hintText);
  const answerNorm = normalizeCountryName(pick.answer);
  const answers = [
    answerNorm,
    pick.answer,
    compactNoSpaces(answerNorm),
    ...(Array.isArray(pick.answers) ? pick.answers.map((a) => normalizeCountryName(a)).filter(Boolean) : []),
  ];
  activeGames.set(channelId, {
    type: "completeVerse",
    verse: pick.verse,
    answer: pick.answer,
    answers,
    song: pick.song,
    artist: pick.artist,
    rewardExp,
    swBackgroundUrl: verseSwBg || null,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });
  const saved = await saveActiveGame(client, cfg, {
    type: "completeVerse",
    target: JSON.stringify({ verse: pick.verse, answer: pick.answer, song: pick.song, artist: pick.artist }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });
  if (!saved) return false;
  markSent(channelId);
  return true;
}

async function startGuessEmojiGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const bank = getGuessEmojiBank();
  if (!Array.isArray(bank) || !bank.length) return false;
  let pick = pickQuestionAvoidRecent(channelId, "guessEmoji", bank, (r?) => r.emojis, recentLimitForBank(bank, 40));
  if (!pick) pick = pickRandomItem(bank);
  if (!pick) return false;
  const sourceAnswers = Array.isArray(pick.answers) && pick.answers.length
    ? pick.answers
    : (pick.answer ? [pick.answer] : []);
  const displayAnswer = String(sourceAnswers[0] || "").trim();
  const answers = Array.from(
    new Set(
      sourceAnswers.flatMap((value?) => {
        const raw = String(value || "").trim();
        const normalized = normalizeCountryName(raw);
        const compact = compactNoSpaces(normalized || raw);
        return [normalized, compact];
      }).filter(Boolean),
    ),
  );
  if (!answers.length) return false;
  const rewardExp = normalizeRewardExp(cfg?.guessEmoji?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.guessEmoji?.durationMs || 180000));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;
  await sendMinigameRolePing(channel, cfg);
  const attachment = await buildEmojiRichPromptImageAttachment(
    "Indovina da emoji",
    [pick.emojis, `Categoria: ${pick.category}`],
    "guess_emoji",
  );
  const imageUrl = attachment ? `attachment://${attachment.name}` : null;
  const embed = buildGuessEmojiEmbed(rewardExp, durationMs, imageUrl);
  const gameMessage = await sendMinigameMessage(
    channel,
    { embeds: [embed], files: attachment ? [attachment] : [] },
    { type: "guessEmoji", kind: "start", vars: minigameDraftVars(channel, { exp: rewardExp, durationMs }) },
  ).catch(() => null);
  if (!gameMessage) return false;
  const timeout = scheduleMinigameRoundTimeout(client, cfg, channelId, channel, durationMs);
  const hintText = `Risposta: ${buildRevealHint(displayAnswer || sourceAnswers[0] || "")}`;
  const hintTimeout = await scheduleGenericHint(client, channelId, durationMs, hintText);
  activeGames.set(channelId, {
    type: "guessEmoji",
    emojis: pick.emojis,
    displayAnswer,
    answers,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });
  const saved = await saveActiveGame(client, cfg, {
    type: "guessEmoji",
    target: JSON.stringify({ emojis: pick.emojis, answers: sourceAnswers, displayAnswer }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });
  if (!saved) return false;
  markSent(channelId);
  return true;
}

async function startQuoteFilmGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const bank = getQuoteFilmBank();
  const pick = pickQuestionAvoidRecent(channelId, "quoteFilm", bank, (r?) => r.quote, recentLimitForBank(bank, 70));
  if (!pick) return false;
  const rewardExp = normalizeRewardExp(cfg?.quoteFilm?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.quoteFilm?.durationMs || 180000));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;
  await sendMinigameRolePing(channel, cfg);
  const displayQuote = String(pick.quoteIt || pick.quote || "").trim();
  if (!displayQuote) return false;
  /* atmosfera cinema + citazione (mai il poster del film: spoilerebbe la risposta) */
  const atmosphereUrl = await fetchCinemaAtmosphereImage().catch(() => null);
  let attachment =
    atmosphereUrl
      ? await buildAtmosphereTextCardAttachment(
          "Citazione da film/serie",
          [`“${displayQuote}”`],
          atmosphereUrl,
          "quote_film.png",
        ).catch(() => null)
      : null;
  if (!attachment) {
    try {
      const resolved = await resolveMinigamePromptAttachment(
        cfg,
        "Citazione da film/serie",
        [`“${displayQuote}”`],
        "quote_film",
        client,
      );
      attachment = resolved?.attachment || null;
    } catch (err) {
      warnMinigame(err);
    }
  }
  if (!attachment) {
    attachment = buildPromptImageAttachment("Citazione da film/serie", [`“${displayQuote}”`], "quote_film", "", client);
  }
  const imageUrl = attachment ? `attachment://${attachment.name}` : null;
  const embed = buildQuoteFilmEmbed(displayQuote, rewardExp, durationMs, imageUrl);
  const startPrompt = imageUrl
    ? `Citazione sull’immagine — da quale film o serie? **${rewardExp} exp**.`
    : `*“${displayQuote}”* — Da quale film o serie? **${rewardExp} exp**.`;
  const gameMessage = await sendMinigameMessage(
    channel,
    { embeds: [embed], files: attachment ? [attachment] : [] },
    {
      type: "quoteFilm",
      kind: "start",
      vars: minigameDraftVars(channel, {
        exp: rewardExp,
        durationMs,
        quote: displayQuote,
        prompt: startPrompt,
        image: imageUrl || "",
      }),
    },
  ).catch(() => null);
  const timeout = scheduleMinigameRoundTimeout(client, cfg, channelId, channel, durationMs);
  const hintText = `Film/Serie: ${buildRevealHint(pick.answer)}`;
  const hintTimeout = await scheduleGenericHint(client, channelId, durationMs, hintText);
  const displayAnswer = pick.answer;
  const answers = [normalizeCountryName(pick.answer), normalizeCountryName(displayAnswer)];
  if (pick.answers && pick.answers.length) answers.push(...pick.answers.map((a?) => normalizeCountryName(a)));
  activeGames.set(channelId, {
    type: "quoteFilm",
    quote: displayQuote,
    answer: pick.answer,
    answers,
    displayAnswer,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });
  const saved = await saveActiveGame(client, cfg, {
    type: "quoteFilm",
    target: JSON.stringify({ quote: displayQuote, answer: pick.answer, displayAnswer: pick.answer }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });
  if (!saved) return false;
  markSent(channelId);
  return true;
}

async function startCompleteProverbGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const proverbBank = getProverbBank();
  const bank = (proverbBank || []).filter((r?) => r && String(r.end || "").trim() !== "");
  const pick = pickQuestionAvoidRecent(channelId, "completeProverb", bank, (r?) => r.start, recentLimitForBank(bank, 40));
  if (!pick) return false;
  const rewardExp = normalizeRewardExp(cfg?.completeProverb?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.completeProverb?.durationMs || 180000));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;
  await sendMinigameRolePing(channel, cfg);
  const attachment = buildPromptImageAttachment("Completa il proverbio", [pick.start], "complete_proverb", "", client);
  const imageUrl = attachment ? `attachment://${attachment.name}` : null;
  const embed = buildCompleteProverbEmbed(rewardExp, durationMs, imageUrl);
  const gameMessage = await sendMinigameMessage(
    channel,
    { embeds: [embed], files: attachment ? [attachment] : [] },
    { type: "completeProverb", kind: "start", vars: minigameDraftVars(channel, { exp: rewardExp, durationMs }) },
  ).catch(() => null);
  const timeout = scheduleMinigameRoundTimeout(client, cfg, channelId, channel, durationMs);
  const hintText = `Completamento: ${buildRevealHint(pick.end) ?? "—"}`;
  const hintTimeout = await scheduleGenericHint(client, channelId, durationMs, hintText);
  const endNorm = normalizeCountryName(pick.end);
  const answers = [endNorm, pick.end, compactNoSpaces(endNorm)].filter(Boolean);
  activeGames.set(channelId, {
    type: "completeProverb",
    start: pick.start,
    end: pick.end,
    answers,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });
  const saved = await saveActiveGame(client, cfg, {
    type: "completeProverb",
    target: JSON.stringify({ start: pick.start, end: pick.end }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });
  if (!saved) return false;
  markSent(channelId);
  return true;
}

async function startSynonymAntonymGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const bank = getSynonymAntonymBank();
  const pick = pickQuestionAvoidRecent(channelId, "synonymAntonym", bank, (r?) => `${r.word}:${r.kind}`, recentLimitForBank(bank, 40));
  if (!pick) return false;
  const rewardExp = normalizeRewardExp(cfg?.synonymAntonym?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.synonymAntonym?.durationMs || 180000));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;
  await sendMinigameRolePing(channel, cfg);
  const answer = pick.kind === "antonym" ? pick.antonym : pick.synonym;
  const kindLabel = pick.kind === "antonym" ? "il contrario" : "un sinonimo";
  const attachment = buildPromptImageAttachment(pick.kind === "antonym" ? "Trova il contrario" : "Trova il sinonimo", [`Parola: ${pick.word}`, `Scrivi ${kindLabel} di questa parola.`], "synonym_antonym", "", client);
  const imageUrl = attachment ? `attachment://${attachment.name}` : null;
  const embed = buildSynonymAntonymEmbed(pick.word, pick.kind, rewardExp, durationMs, imageUrl);
  const gameMessage = await sendMinigameMessage(
    channel,
    { embeds: [embed], files: attachment ? [attachment] : [] },
    { type: "synonymAntonym", kind: "start", vars: minigameDraftVars(channel, { exp: rewardExp, durationMs, word: pick.word }) },
  ).catch(() => null);
  const timeout = scheduleMinigameRoundTimeout(client, cfg, channelId, channel, durationMs);
  const hintText = `Risposta: ${buildRevealHint(answer)}`;
  const hintTimeout = await scheduleGenericHint(client, channelId, durationMs, hintText);
  const answerNorm = normalizeCountryName(answer);
  const answers = [answerNorm, answer, compactNoSpaces(answerNorm)].filter(Boolean);
  activeGames.set(channelId, {
    type: "synonymAntonym",
    word: pick.word,
    answer,
    answers,
    kind: pick.kind,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });
  const saved = await saveActiveGame(client, cfg, {
    type: "synonymAntonym",
    target: JSON.stringify({ word: pick.word, answer, kind: pick.kind }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });
  if (!saved) return false;
  markSent(channelId);
  return true;
}

export = { startItalianGkGame, startMathExpressionGame, startGuessYearGame, startCompleteVerseGame, startGuessEmojiGame, startQuoteFilmGame, startCompleteProverbGame, startSynonymAntonymGame };
