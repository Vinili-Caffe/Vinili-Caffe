/** Minigiochi quiz: cultura generale, matematica, anni, versi, emoji, film, proverbi, sinonimi. */
const axios = require("axios") as any;
const { getGuessYearBank, getCompleteVerseBank, getGuessEmojiBank, getQuoteFilmBank, getProverbBank, getSynonymAntonymBank, getItalianGkBank } = require("../../Minigames/data/minigameBanks") as typeof import("../../Minigames/data/minigameBanks");
const { shouldUseHalloweenTheme, getHalloweenGuessYearBank, getHalloweenCompleteVerseBank } = require("../../Minigames/utils/halloweenMinigameHooks") as typeof import("../../Minigames/utils/halloweenMinigameHooks");
const { warnMinigame } = require("./minigameLog") as typeof import("./minigameLog");
const { normalizeCountryName, polishItalianQuestionText, buildEmojiRichPromptImageAttachment, buildPromptImageAttachment, buildMathExpressionImageAttachment } = require("./minigameImages") as typeof import("./minigameImages");
const { buildItalianGkEmbed, buildMathExpressionEmbed, buildTimeoutItalianGkEmbed, buildTimeoutMathEmbed, buildGuessYearEmbed, buildCompleteVerseEmbed, buildGuessEmojiEmbed, buildQuoteFilmEmbed, buildCompleteProverbEmbed, buildSynonymAntonymEmbed } = require("./minigameEmbeds") as typeof import("./minigameEmbeds");
const { buildAliases } = require("./minigameSources") as typeof import("./minigameSources");
const { getChannelCached, pickRandomItem } = require("./minigameUtils") as typeof import("./minigameUtils");
const { compactNoSpaces, normalizeRewardExp, isLikelyItalianText, createMathQuestion, buildRevealHint } = require("./minigameText") as typeof import("./minigameText");
const { activeGames, isQuestionKeyRecent, pushQuestionKeyToRecent, pickQuestionAvoidRecent } = require("./minigameState") as typeof import("./minigameState");
const { sendMinigameRolePing } = require("./minigameRolePing") as typeof import("./minigameRolePing");
const { sendMinigameMessage } = require("./minigameDiscord") as typeof import("./minigameDiscord");
const { markSent, saveActiveGame, scheduleMinigameRoundTimeout, sendMinigameTimeoutAndClose, scheduleGenericHint } = require("./minigameRound") as typeof import("./minigameRound");
const { translateToItalian, buildItalianGkApiUrls, parseItalianGkQuestionFromPayload } = require("./quizSources") as typeof import("./quizSources");

async function startItalianGkGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;

  let questionRow = null;
  const gkBank = getItalianGkBank();
  const localPick = pickQuestionAvoidRecent(channelId, "italianGK", gkBank, (q?) => q?.question, 20);
  if (localPick?.question && Array.isArray(localPick?.answers)) {
    questionRow = {
      question: polishItalianQuestionText(String(localPick.question)),
      answers: buildAliases(localPick.answers),
    };
  }
  let fromApi = false;
  if (!questionRow) {
    const apiUrls = buildItalianGkApiUrls(cfg);
    const requireItalian = cfg?.italianGK?.requireItalian !== false;
    if (apiUrls.length) {
      for (const apiUrl of apiUrls) {
        try {
          const res = await axios.get(apiUrl, { timeout: 15000 });
          const parsed = parseItalianGkQuestionFromPayload(res?.data);
          if (!parsed?.question || !parsed?.answers?.length) continue;
          if (requireItalian && !isLikelyItalianText(parsed.question)) continue;
          if (isQuestionKeyRecent(channelId, "italianGK", parsed.question, 20)) continue;
          questionRow = parsed;
          fromApi = true;
          break;
        } catch (err) {
      warnMinigame(err);
    }
      }
    }
    if (questionRow && apiUrls.length && cfg?.translateApiToItalian !== false) {
      const [q, a] = await Promise.all([
        translateToItalian(questionRow.question, cfg),
        translateToItalian(String(questionRow.answers?.[0] || ""), cfg),
      ]);
      if (q) questionRow = { ...questionRow, question: polishItalianQuestionText(q) };
      if (a) questionRow = { ...questionRow, answers: buildAliases([a]) };
    }
  }
  if (!questionRow) return false;
  if (!questionRow.answers.length) return false;
  if (fromApi) pushQuestionKeyToRecent(channelId, "italianGK", questionRow.question, 20);
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
  const gkEmbed = buildItalianGkEmbed(questionRow.question, rewardExp, durationMs);
  if (gkAttachment) {
    gkEmbed.setImage(`attachment://${gkAttachment.name}`);
  }
  const gameMessage = await sendMinigameMessage(channel, { embeds: [gkEmbed], files: gkAttachment ? [gkAttachment] : [], }).catch(() => null);
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

  await saveActiveGame(client, cfg, {
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
  const gameMessage = await sendMinigameMessage(channel, { embeds: [buildMathExpressionEmbed(row.expression, rewardExp, durationMs, expressionAttachment?.name || null,),], files, }).catch(() => null);

  const timeout = setTimeout(async () => { const game = activeGames.get(channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, channelId, channel, game, buildTimeoutMathEmbed(game.answer)); }, durationMs); timeout.unref?.();
  const answerNum = Number(row.answer);
  const hintRangeText = Number.isFinite(answerNum) ? `<a:VC_Flame:1482725674711126140> Il risultato è compreso tra **${Math.floor(answerNum - 2)}** e **${Math.ceil(answerNum + 2)}**.`
    : `<a:VC_Flame:1482725674711126140> Il risultato è un numero intero.`;
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

  await saveActiveGame(client, cfg, {
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

  markSent(channelId);
  return true;
}

async function startGuessYearGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const bank = shouldUseHalloweenTheme(cfg) ? getHalloweenGuessYearBank() : getGuessYearBank();
  const pick = pickQuestionAvoidRecent(channelId, "guessYear", bank, (r?) => `${r.type}:${r.title}:${r.year}`, 25);
  if (!pick) return false;
  const rewardExp = normalizeRewardExp(cfg?.guessYear?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.guessYear?.durationMs || 180000));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;
  await sendMinigameRolePing(channel, cfg);
  const typeLabel = { film: "Film", series: "Serie TV", song: "Canzone", album: "Album" }[pick.type] || pick.type;
  const lines = [pick.subtitle ? `${pick.title} — ${pick.subtitle}` : pick.title, `Categoria: ${typeLabel}`];
  const attachment = buildPromptImageAttachment(shouldUseHalloweenTheme(cfg) ? "Indovina l'anno Halloween" : "Indovina l'anno", lines, "guess_year", "", client);
  const imageUrl = attachment ? `attachment://${attachment.name}` : null;
  const embed = buildGuessYearEmbed(pick.title, pick.subtitle || null, rewardExp, durationMs, imageUrl);
  if (shouldUseHalloweenTheme(cfg)) embed.setTitle("Indovina l'anno Halloween 🎃");
  const gameMessage = await sendMinigameMessage(channel, { embeds: [embed], files: attachment ? [attachment] : [] }).catch(() => null);
  const timeout = scheduleMinigameRoundTimeout(client, cfg, channelId, channel, durationMs);
  const yearHint = `<a:VC_Flame:1482725674711126140> L'anno è tra **${pick.year - 5}** e **${pick.year + 5}**.`;
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
  await saveActiveGame(client, cfg, {
    type: "guessYear",
    target: JSON.stringify({ title: pick.title, subtitle: pick.subtitle, year: pick.year }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });
  markSent(channelId);
  return true;
}

async function startCompleteVerseGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const bank = shouldUseHalloweenTheme(cfg) ? getHalloweenCompleteVerseBank() : getCompleteVerseBank();
  const pick = pickQuestionAvoidRecent(channelId, "completeVerse", bank, (r?) => r.verse, 15);
  if (!pick) return false;
  const rewardExp = normalizeRewardExp(cfg?.completeVerse?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.completeVerse?.durationMs || 180000));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;
  await sendMinigameRolePing(channel, cfg);
  const attachment = buildPromptImageAttachment(shouldUseHalloweenTheme(cfg) ? "Completa il verso Halloween" : "Completa il verso", [pick.verse, `${pick.song} — ${pick.artist}`], "complete_verse", "", client);
  const imageUrl = attachment ? `attachment://${attachment.name}` : null;
  const embed = buildCompleteVerseEmbed(pick.verse, rewardExp, durationMs, imageUrl);
  if (shouldUseHalloweenTheme(cfg)) embed.setTitle("Completa il verso Halloween 🎃");
  const gameMessage = await sendMinigameMessage(channel, { embeds: [embed], files: attachment ? [attachment] : [] }).catch(() => null);
  const timeout = scheduleMinigameRoundTimeout(client, cfg, channelId, channel, durationMs);
  const hintText = `Verso: ${buildRevealHint(pick.answer)}`;
  const hintTimeout = await scheduleGenericHint(client, channelId, durationMs, hintText);
  const answerNorm = normalizeCountryName(pick.answer);
  const answers = [answerNorm, pick.answer, compactNoSpaces(answerNorm)];
  activeGames.set(channelId, {
    type: "completeVerse",
    verse: pick.verse,
    answer: pick.answer,
    answers,
    song: pick.song,
    artist: pick.artist,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });
  await saveActiveGame(client, cfg, {
    type: "completeVerse",
    target: JSON.stringify({ verse: pick.verse, answer: pick.answer, song: pick.song, artist: pick.artist }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });
  markSent(channelId);
  return true;
}

async function startGuessEmojiGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const bank = getGuessEmojiBank();
  if (!Array.isArray(bank) || !bank.length) return false;
  let pick = pickQuestionAvoidRecent(channelId, "guessEmoji", bank, (r?) => r.emojis, 15);
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
  const embed = buildGuessEmojiEmbed(pick.emojis, rewardExp, durationMs, imageUrl);
  const gameMessage = await sendMinigameMessage(channel, { embeds: [embed], files: attachment ? [attachment] : [] }).catch(() => null);
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
  await saveActiveGame(client, cfg, {
    type: "guessEmoji",
    target: JSON.stringify({ emojis: pick.emojis, answers: sourceAnswers, displayAnswer }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });
  markSent(channelId);
  return true;
}

async function startQuoteFilmGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const bank = getQuoteFilmBank();
  const pick = pickQuestionAvoidRecent(channelId, "quoteFilm", bank, (r?) => r.quote, 15);
  if (!pick) return false;
  const rewardExp = normalizeRewardExp(cfg?.quoteFilm?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.quoteFilm?.durationMs || 180000));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;
  await sendMinigameRolePing(channel, cfg);
  const displayQuote = pick.quoteIt || pick.quote;
  const attachment = buildPromptImageAttachment("Citazione da film/serie", [displayQuote], "quote_film", "", client);
  const imageUrl = attachment ? `attachment://${attachment.name}` : null;
  const embed = buildQuoteFilmEmbed(displayQuote, rewardExp, durationMs, imageUrl);
  const gameMessage = await sendMinigameMessage(channel, { embeds: [embed], files: attachment ? [attachment] : [] }).catch(() => null);
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
  await saveActiveGame(client, cfg, {
    type: "quoteFilm",
    target: JSON.stringify({ quote: displayQuote, answer: pick.answer, displayAnswer: pick.answer }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });
  markSent(channelId);
  return true;
}

async function startCompleteProverbGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const proverbBank = getProverbBank();
  const bank = (proverbBank || []).filter((r?) => r && String(r.end || "").trim() !== "");
  const pick = pickQuestionAvoidRecent(channelId, "completeProverb", bank, (r?) => r.start, 15);
  if (!pick) return false;
  const rewardExp = normalizeRewardExp(cfg?.completeProverb?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.completeProverb?.durationMs || 180000));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;
  await sendMinigameRolePing(channel, cfg);
  const attachment = buildPromptImageAttachment("Completa il proverbio", [pick.start], "complete_proverb", "", client);
  const imageUrl = attachment ? `attachment://${attachment.name}` : null;
  const embed = buildCompleteProverbEmbed(pick.start, rewardExp, durationMs, imageUrl);
  const gameMessage = await sendMinigameMessage(channel, { embeds: [embed], files: attachment ? [attachment] : [] }).catch(() => null);
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
  await saveActiveGame(client, cfg, {
    type: "completeProverb",
    target: JSON.stringify({ start: pick.start, end: pick.end }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });
  markSent(channelId);
  return true;
}

async function startSynonymAntonymGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const bank = getSynonymAntonymBank();
  const pick = pickQuestionAvoidRecent(channelId, "synonymAntonym", bank, (r?) => `${r.word}:${r.kind}`, 20);
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
  const gameMessage = await sendMinigameMessage(channel, { embeds: [embed], files: attachment ? [attachment] : [] }).catch(() => null);
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
  await saveActiveGame(client, cfg, {
    type: "synonymAntonym",
    target: JSON.stringify({ word: pick.word, answer, kind: pick.kind }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });
  markSent(channelId);
  return true;
}

export = { startItalianGkGame, startMathExpressionGame, startGuessYearGame, startCompleteVerseGame, startGuessEmojiGame, startQuoteFilmGame, startCompleteProverbGame, startSynonymAntonymGame };
