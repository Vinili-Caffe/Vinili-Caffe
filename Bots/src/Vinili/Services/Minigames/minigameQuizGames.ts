/** Minigiochi a domanda: indovina numero/parola/bandiera/giocatore/canzone/capitale/squadra/cantante/album/anno/città/emoji, scrittura veloce, impiccato, cultura generale, quiz patente, matematica, citazioni, proverbi, sinonimi. */
const axios = require("axios") as typeof import("axios").default;
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require("discord.js") as typeof import("discord.js");
const { getGuessYearBank, getCompleteVerseBank, getGuessEmojiBank, getQuoteFilmBank, getProverbBank, getSynonymAntonymBank, getGuessCityBank, getItalianGkBank, getDrivingTrueFalseBank, getDrivingMultipleChoiceBank, getDrivingSignQuestions, getFastTypingPhrases, getHangmanWords } = require("../../Data/Minigames/minigameBanks") as typeof import("../../Data/Minigames/minigameBanks");
const { warnMinigame } = require("./minigameLog") as typeof import("./minigameLog");
const { normalizeCountryName, polishItalianQuestionText, fetchWikiRegionImage, fetchSingerImageFallback, buildDrivingQuizPromptImage, buildEmojiRichPromptImageAttachment, buildPromptImageAttachment, fetchRawImageAttachment, buildRemoteGuessImageCardAttachment, buildMathExpressionImageAttachment, censorArtworkImage, buildRegionNameImageAttachment } = require("./minigameImages") as typeof import("./minigameImages");
const { buildGuessNumberEmbed, buildGuessWordEmbed, buildGuessFlagEmbed, buildGuessPlayerEmbed, buildGuessSongEmbed, buildGuessCapitalEmbed, buildGuessRegionCapitalEmbed, buildGuessReverseCapitalEmbed, buildFastTypeEmbed, buildGuessTeamEmbed, buildGuessSingerEmbed, buildGuessAlbumEmbed, buildHangmanEmbed, buildItalianGkEmbed, DRIVING_QUIZ_LETTERS, buildDrivingQuizEmbed, buildMathExpressionEmbed, buildTimeoutNumberEmbed, buildTimeoutWordEmbed, buildTimeoutFlagEmbed, buildTimeoutPlayerEmbed, buildTimeoutCapitalEmbed, buildTimeoutRegionCapitalEmbed, buildTimeoutReverseCapitalEmbed, buildTimeoutFastTypeEmbed, buildTimeoutTeamEmbed, buildTimeoutSingerEmbed, buildTimeoutHangmanEmbed, buildTimeoutItalianGkEmbed, buildTimeoutDrivingQuizEmbed, buildTimeoutMathEmbed, buildGuessYearEmbed, buildCompleteVerseEmbed, buildGuessEmojiEmbed, buildQuoteFilmEmbed, buildCompleteProverbEmbed, buildSynonymAntonymEmbed, buildGuessCityEmbed } = require("./minigameEmbeds") as typeof import("./minigameEmbeds");
const { randomBetween, loadCountryList, loadCapitalQuestionBank, loadReverseCapitalQuestionBank, loadRegionCapitalQuestionBank, loadFootballTeamsFromApi, loadSingersFromApi, loadAlbumsFromApi, normalizePlayerGuess, buildAliases, fetchPlayerFromRandomLetter, fetchFamousPlayer, fetchLeagueFamousPlayer, fetchRandomSong, fetchPopularSong } = require("./minigameSources") as typeof import("./minigameSources");
const { getChannelCached, pickRandomItem } = require("./minigameUtils") as typeof import("./minigameUtils");
const { shuffleString, normalizeWord, compactNoSpaces, isValidGuessWord, normalizeRewardExp, decodeQuizText, isLikelyItalianText, normalizeTruthValue, createMathQuestion, maskHangmanWord, buildPlayerAnswerAliases, buildPlainMaskedTextHint, buildRevealHint, buildCountryHint, buildCapitalHint, buildRegionCapitalHint, buildNumberNearHint, shuffleArray } = require("./minigameText") as typeof import("./minigameText");
const { activeGames, isQuestionKeyRecent, pushQuestionKeyToRecent, pickQuestionAvoidRecent } = require("./minigameState") as typeof import("./minigameState");
const { sendMinigameRolePing } = require("./minigameRolePing") as typeof import("./minigameRolePing");
const { sendMinigameMessage } = require("./minigameDiscord") as typeof import("./minigameDiscord");
const { markSent, saveActiveGame, scheduleMinigameRoundTimeout, sendMinigameTimeoutAndClose, scheduleGenericHint } = require("./minigameRound") as typeof import("./minigameRound");

let cachedWords = null;
let cachedWordsAt = 0;
const WORD_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_FAST_TYPE_API_URLS = ["https://api.quotable.io/random", "https://zenquotes.io/api/random",];
const DEFAULT_MAX_FAST_TYPE_PHRASE_LENGTH = 180;
const DEFAULT_DRIVING_QUIZ_API_URL = "https://opentdb.com/api.php?amount=5&category=28&encode=url3986";
const MYMEMORY_MAX_CHARS = 450;
const MYMEMORY_BASE = "https://api.mymemory.translated.net/get";
const ITALIAN_GK_DEFAULT_CATEGORIES = ["cultura-generale", "storia", "geografia", "scienza", "arte", "musica", "sport", "letteratura", "cinema", "tecnologia",];

async function translateToItalian(text?, cfg: Record<string, any> = {}) {
  if (cfg?.translateApiToItalian === false) return String(text || "").trim();
  const raw = String(text || "").trim();
  if (!raw) return raw;

  const chunks = [];
  let rest = raw;
  while (rest.length > MYMEMORY_MAX_CHARS) {
    const slice = rest.slice(0, MYMEMORY_MAX_CHARS);
    const lastDot = slice.lastIndexOf(".");
    const splitAt = lastDot >= 0 ? lastDot + 1 : MYMEMORY_MAX_CHARS;
    chunks.push(rest.slice(0, splitAt).trim());
    rest = rest.slice(splitAt).trim();
  }
  if (rest) chunks.push(rest);

  const fetchChunk = async (chunk?) => {
    const url = `${MYMEMORY_BASE}?q=${encodeURIComponent(chunk)}&langpair=en|it`;
    for (let attempt = 0; attempt <= 1; attempt += 1) {
      try {
        const res = await axios.get(url, { timeout: 8000 });
        const t = res?.data?.responseData?.translatedText;
        return t && typeof t === "string" ? t.trim() : chunk;
      } catch (err) {
        const is429 = err?.response?.status === 429;
        if (is429 && attempt === 0) {
          await new Promise((r?) => setTimeout(r, 2500));
          continue;
        }
        return chunk;
      }
    }
    return chunk;
  };
  const results = await Promise.all(chunks.filter(Boolean).map(fetchChunk));
  return results.length ? results.join(" ").replace(/\s+\./g, ".").trim() : raw;
}

function extractWordListFromApiPayload(payload?) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.words)) return payload.words;
  if (Array.isArray(payload?.data)) return payload.data;
  if (typeof payload?.word === "string") return [payload.word];
  if (typeof payload?.text === "string") return [payload.text];
  if (typeof payload?.answer === "string") return [payload.answer];
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const keys = Object.keys(payload).filter((k?) => typeof k === "string" && k.trim().length >= 2);
    if (keys.length) return keys;
  }
  return [];
}

async function loadWordList(cfg?) {
  const now = Date.now();
  if (cachedWords && now - cachedWordsAt < WORD_CACHE_TTL_MS)
    return cachedWords;

  const apiUrl = cfg?.guessWord?.apiUrl;
  let list = [];
  if (apiUrl) {
    try {
      const res = await axios.get(apiUrl, { timeout: 15000 });
      list = extractWordListFromApiPayload(res?.data);
    } catch (err) {
      warnMinigame(err);
    }
  }

  const filtered = list.map(normalizeWord).filter(isValidGuessWord);

  cachedWords = filtered;
  cachedWordsAt = now;
  return cachedWords;
}

function buildItalianGkApiUrls(cfg?) {
  const rawUrls = Array.isArray(cfg?.italianGK?.apiUrls) ? cfg.italianGK.apiUrls : cfg?.italianGK?.apiUrl ? [cfg.italianGK.apiUrl] : [];

  const categories = Array.isArray(cfg?.italianGK?.categories) && cfg.italianGK.categories.length ? cfg.italianGK.categories : ITALIAN_GK_DEFAULT_CATEGORIES;

  const out = [];
  for (const raw of rawUrls) {
    const base = String(raw || "").trim();
    if (!base) continue;

    if (base.includes("{category}")) {
      const shuffled = categories.slice();
      for (let i = shuffled.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      for (const category of shuffled) {
        out.push(
          base
            .replace(/\{category\}/g, encodeURIComponent(category))
            .replace(/\{lang\}/g, "it"),
        );
      }
      continue;
    }

    out.push(base.replace(/\{lang\}/g, "it"));
  }

  return out;
}

function parseItalianGkQuestionFromPayload(payload?) {
  const direct = payload && typeof payload === "object" ? payload : null;
  if (direct?.question && (direct?.answer || direct?.correct_answer)) {
    return {
      question: polishItalianQuestionText(decodeQuizText(direct.question)),
      answers: buildAliases([
        decodeQuizText(direct.answer || direct.correct_answer),
      ]),
    };
  }

  const list = Array.isArray(direct?.data) ? direct.data : Array.isArray(direct?.results) ? direct.results : Array.isArray(payload) ? payload : [];
  if (!list.length) return null;

  const pick = pickRandomItem(list);
  if (!pick) return null;
  const question = pick.question || pick.domanda || pick.q || pick.text || null;
  const answer = pick.answer || pick.correct_answer || pick.risposta || pick.a || null;
  if (!question || !answer) return null;

  return {
    question: polishItalianQuestionText(decodeQuizText(question)),
    answers: buildAliases([decodeQuizText(answer)]),
  };
}

async function resolveGuessPuzzleAttachment({
  imageUrl = null,
  title,
  fallbackLines = [],
  fileBaseName = "guess_image",
  client = null,
  channelId = null,
}) {
  const base = String(fileBaseName || "guess_image").replace(/[^\w.\-]+/g, "_");
  const fileName = `${base}.png`;
  if (imageUrl) {
    const card = await buildRemoteGuessImageCardAttachment(imageUrl, title, fileName);
    if (card) return card;
    const raw = await fetchRawImageAttachment(imageUrl, `${base}.jpg`);
    if (raw) return raw;
  }
  return buildPromptImageAttachment(
    title,
    fallbackLines,
    fileBaseName,
    "",
    client,
  );
}
const CENSOR_STEP_INTERVAL_MS = 60 * 1000;

function scheduleArtworkCensorSteps(params?) {
  const { channelId, channel, gameMessageId, originalArtworkUrl, durationMs, buildEmbed, rewardExp, attachmentName, gameType } = params;
  if (!channelId || !channel || !gameMessageId || !originalArtworkUrl || !buildEmbed) return [];
  const timeouts = [];
  const totalMinutes = Math.max(1, Math.floor(durationMs / CENSOR_STEP_INTERVAL_MS));
  for (let step = 1; step < totalMinutes; step++) {
    const delay = durationMs - step * CENSOR_STEP_INTERVAL_MS;
    if (delay < 8000) continue;
    const isLastStep = step === totalMinutes - 1;
    const alpha = isLastStep ? 0 : Math.max(0, 0.9 - (step * 0.9) / Math.max(1, totalMinutes - 1));
    const t = setTimeout(async () => {
      const game = activeGames.get(channelId);
      if (!game || (game.type !== "guessSong" && game.type !== "guessAlbum")) return;
      try {
        const msg = await channel.messages.fetch(gameMessageId).catch(() => null);
        if (!msg?.editable) return;
        if (alpha <= 0) {
          const embed = buildEmbed(rewardExp, durationMs, originalArtworkUrl);
          const payload = gameType === "guessSong" ? { embeds: [embed], components: msg.components, files: [] } : { embeds: [embed], files: [] };
          await msg.edit(payload).catch(() => {});
          return;
        }
        const censored = await censorArtworkImage(originalArtworkUrl, { attachmentName, overlayAlpha: alpha });
        if (!censored) return;
        const embed = buildEmbed(rewardExp, durationMs, `attachment://${censored.attachmentName}`);
        const files = [new AttachmentBuilder(censored.buffer, { name: censored.attachmentName })];
        const payload = gameType === "guessSong" ? { embeds: [embed], components: msg.components, files } : { embeds: [embed], files };
        await msg.edit(payload).catch(() => {});
      } catch (err) {
      warnMinigame(err);
    }
    }, delay);
    if (typeof t.unref === "function") t.unref();
    timeouts.push(t);
  }
  return timeouts;
}

function getDrivingQuizThematicHint(row?) {
  const s = String(row?.statement || "").toLowerCase();
  if (!s) return null;
  if (/velocit|limite|km\/h|130|50|90/.test(s)) return `<a:VC_Flame:1482725674711126140> La domanda riguarda i **limiti di velocità**.`;
  if (/precedenza|incrocio|destra|fermarsi/.test(s)) return `<a:VC_Flame:1482725674711126140> La domanda riguarda **precedenza** o **incroci**.`;
  if (/semaforo|rosso|giallo|verde/.test(s)) return `<a:VC_Flame:1482725674711126140> La domanda riguarda i **semafori**.`;
  if (/segnal|triangolo|circolare|ottagonale|stop/.test(s)) return `<a:VC_Flame:1482725674711126140> La domanda riguarda la **segnaletica stradale**.`;
  if (/sosta|parcheggio|divieto/.test(s)) return `<a:VC_Flame:1482725674711126140> La domanda riguarda **sosta** o **parcheggio**.`;
  if (/cintur|casco|telefono/.test(s)) return `<a:VC_Flame:1482725674711126140> La domanda riguarda **obblighi** del conducente.`;
  if (/sorpasso|autostrada|corsia/.test(s)) return `<a:VC_Flame:1482725674711126140> La domanda riguarda **sorpasso** o **autostrada**.`;
  return `<a:VC_Flame:1482725674711126140> La risposta è **Vero** o **Falso**: rifletti sulla normativa.`;
}

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

async function startGuessFlagGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId) return false;
  if (activeGames.has(channelId)) return false;

  const countries = await loadCountryList(cfg);
  if (!countries.length) return false;

  const rewardExp = normalizeRewardExp(cfg?.guessFlag?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.guessFlag?.durationMs || 180000));

  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  const target = pickQuestionAvoidRecent(channelId, "guessFlag", countries, (c?) => c?.displayName || (Array.isArray(c?.names) ? c.names[0] : "") || "", 20) || countries[randomBetween(0, countries.length - 1)];
  if (!target) return false;

  const roleId = cfg.roleId;
  await sendMinigameRolePing(channel, cfg, roleId);

  const flagEmbed = buildGuessFlagEmbed(target.flagUrl, rewardExp, durationMs);
  const gameMessage = await sendMinigameMessage(channel, { embeds: [flagEmbed] }).catch(() => null);

  const timeout = setTimeout(async () => { const game = activeGames.get(channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, channelId, channel, game, buildTimeoutFlagEmbed(game.displayName)); }, durationMs); timeout.unref?.();

  const countryHint = buildCountryHint(target);
  const hintTimeout = await scheduleGenericHint(
    client,
    channelId,
    durationMs,
    countryHint || `Nazione: ${buildRevealHint(target.displayName)}`,
  );

  activeGames.set(channelId, {
    type: "guessFlag",
    answers: target.names,
    displayName: target.displayName,
    hintData: target.region || target.populationLabel || target.languages ? { region: target.region, subregion: target.subregion, populationLabel: target.populationLabel, languages: target.languages } : null,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });

  await saveActiveGame(client, cfg, {
    type: "guessFlag",
    target: JSON.stringify({
      names: target.names,
      displayName: target.displayName,
      flagUrl: target.flagUrl,
      region: target.region,
      subregion: target.subregion,
      populationLabel: target.populationLabel,
      languages: target.languages,
    }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });

  markSent(channelId);

  return true;
}

async function startGuessPlayerGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId) return false;
  if (activeGames.has(channelId)) return false;

  const rewardExp = normalizeRewardExp(cfg?.guessPlayer?.rewardExp ?? 100);
  const durationMs = Math.max(60000, Number(cfg?.guessPlayer?.durationMs || 180000));

  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  const [infoFamous, infoLeague, infoLetter] = await Promise.all([
    fetchFamousPlayer(cfg),
    fetchLeagueFamousPlayer(cfg),
    fetchPlayerFromRandomLetter(cfg),
  ]);
  let info = infoFamous || infoLeague || infoLetter;
  if (!info) return false;

  if (cfg?.translateApiToItalian !== false) {
    const [name, team, nationality] = await Promise.all([translateToItalian(info.name, cfg), translateToItalian(info.team, cfg), translateToItalian(info.nationality, cfg),]);
    if (name) info = { ...info, name };
    if (team) info = { ...info, team };
    if (nationality) info = { ...info, nationality };
  }

  const roleId = cfg.roleId;
  await sendMinigameRolePing(channel, cfg, roleId);
  const playerAttachment = await resolveGuessPuzzleAttachment({
    imageUrl: info.image,
    title: "Indovina il calciatore",
    fallbackLines: [buildPlainMaskedTextHint(info.name) || "Chi è questo calciatore?"],
    fileBaseName: "guess_player",
    client,
    channelId,
  });
  const playerEmbed = buildGuessPlayerEmbed(
    rewardExp,
    durationMs,
    playerAttachment ? `attachment://${playerAttachment.name}` : null,
  );

  const gameMessage = await sendMinigameMessage(
    channel,
    { embeds: [playerEmbed], ...(playerAttachment ? { files: [playerAttachment] } : {}) }
  ).catch(() => null);

  const timeout = setTimeout(async () => { const game = activeGames.get(channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, channelId, channel, game, buildTimeoutPlayerEmbed(game.displayName)); }, durationMs); timeout.unref?.();

  const hintTimeout = await scheduleGenericHint(client, channelId, durationMs, `${info.team} \u2022 ${info.nationality} \u2022 ${buildRevealHint(info.name)}`,
  );

  activeGames.set(channelId, {
    type: "guessPlayer",
    answers: buildPlayerAnswerAliases(info.name, info.aliases),
    fullAnswer: normalizePlayerGuess(info.name),
    displayName: info.name,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });

  await saveActiveGame(client, cfg, {
    type: "guessPlayer",
    target: JSON.stringify({
      name: info.name,
      team: info.team,
      nationality: info.nationality,
      image: info.image,
      aliases: buildPlayerAnswerAliases(info.name, info.aliases),
    }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });

  markSent(channelId);
  return true;
}

async function startGuessSongGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId) return false;
  if (activeGames.has(channelId)) return false;

  const rewardExp = normalizeRewardExp(cfg?.guessSong?.rewardExp ?? 100);
  const durationMs = Math.max(60000, Number(cfg?.guessSong?.durationMs || 180000));

  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  const onlyFamous = cfg?.guessSong?.onlyFamous !== false;
  let info = await fetchPopularSong(cfg);
  if (!info && !onlyFamous) {
    info = await fetchRandomSong(cfg);
  }
  if (!info?.title || !info?.artist) return false;

  const roleId = cfg.roleId;
  await sendMinigameRolePing(channel, cfg, roleId);

  const previewCustomId = `minigame_song_preview:${Date.now()}`;
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(previewCustomId).setLabel("Ascolta anteprima").setEmoji(`<:VC_Preview:1482527267992375368>`).setStyle(ButtonStyle.Secondary).setDisabled(!info.previewUrl),);

  const songAttachmentName = "minigame_song.png";
  let songImageUrl = info.artwork;
  const songCensored = info.artwork ? await censorArtworkImage(info.artwork, { attachmentName: songAttachmentName, overlayAlpha: 0.98 }) : null;
  if (songCensored) {
    songImageUrl = `attachment://${songCensored.attachmentName}`;
  }
  const songFiles = songCensored ? [new AttachmentBuilder(songCensored.buffer, { name: songCensored.attachmentName })] : [];
  const gameMessage = await sendMinigameMessage(channel, { embeds: [buildGuessSongEmbed(rewardExp, durationMs, songImageUrl)], components: [row], files: songFiles, }).catch(() => null);

  const censorRevealTimeouts = info.artwork && gameMessage?.id
    ? scheduleArtworkCensorSteps({
        channelId,
        channel,
        gameMessageId: gameMessage.id,
        originalArtworkUrl: info.artwork,
        durationMs,
        buildEmbed: buildGuessSongEmbed,
        rewardExp,
        attachmentName: songAttachmentName,
        gameType: "guessSong",
      })
    : [];

  const timeout = scheduleMinigameRoundTimeout(client, cfg, channelId, channel, durationMs);

  const songHint = info.artistCountry || info.genre
    ? `<a:VC_Flame:1482725674711126140> Artista da **${info.artistCountry || "?"}**, genere **${info.genre || "?"}**. Il titolo: ${buildRevealHint(info.title)}`
    : `Canzone: ${buildRevealHint(info.title)}`;
  const hintTimeout = await scheduleGenericHint(client, channelId, durationMs, songHint,
  );

  activeGames.set(channelId, {
    type: "guessSong",
    title: info.title,
    artist: info.artist,
    previewUrl: info.previewUrl || null,
    previewCustomId,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    censorRevealTimeouts,
    gameMessageId: gameMessage?.id || null,
  });

  await saveActiveGame(client, cfg, {
    type: "guessSong",
    target: JSON.stringify({
      title: info.title,
      artist: info.artist,
      album: info.album,
      artwork: info.artwork,
      genre: info.genre,
      artistCountry: info.artistCountry,
      previewUrl: info.previewUrl,
    }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
    customId: previewCustomId,
  });

  markSent(channelId);
  return true;
}

async function startGuessCapitalGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;

  const questions = await loadCapitalQuestionBank(cfg);
  const pick = pickQuestionAvoidRecent(channelId, "guessCapital", questions, (row?) => row?.country, 28,);
  if (!pick?.country || !Array.isArray(pick?.answers) || !pick.answers.length)
    return false;

  const rewardExp = normalizeRewardExp(cfg?.guessCapital?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.guessCapital?.durationMs || 180000));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  if (cfg.roleId)
    await sendMinigameRolePing(channel, cfg);
  const capitalAttachment = !pick.image ? buildPromptImageAttachment("Indovina la capitale", [pick.country], "guess_capital", "", client) : null;
  const capitalEmbed = buildGuessCapitalEmbed(pick.country, rewardExp, durationMs, pick.image || (capitalAttachment ? `attachment://${capitalAttachment.name}` : null));
  const gameMessage = await sendMinigameMessage(channel, { embeds: [capitalEmbed], files: capitalAttachment ? [capitalAttachment] : [], }).catch(() => null);

  const timeout = setTimeout(async () => { const game = activeGames.get(channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, channelId, channel, game, buildTimeoutCapitalEmbed(game.country, game.displayAnswer)); }, durationMs); timeout.unref?.();
  const displayAnswer = String(pick.answers[0] || "sconosciuta");
  const capitalHint = buildCapitalHint(pick.country);
  const hintTimeout = await scheduleGenericHint(
    client,
    channelId,
    durationMs,
    capitalHint || `Capitale: ${buildRevealHint(displayAnswer)}`,
  );
  activeGames.set(channelId, {
    type: "guessCapital",
    country: pick.country,
    answers: pick.answers,
    image: pick.image || null,
    displayAnswer,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });

  await saveActiveGame(client, cfg, {
    type: "guessCapital",
    target: JSON.stringify({
      country: pick.country,
      answers: pick.answers,
      image: pick.image || null,
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

async function startGuessRegionCapitalGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;

  const questions = await loadRegionCapitalQuestionBank(cfg);
  const pick = pickQuestionAvoidRecent(channelId, "guessRegionCapital", questions, (row?) => row?.region, 20,);
  if (!pick?.region || !Array.isArray(pick?.answers) || !pick.answers.length)
    return false;

  const rewardExp = normalizeRewardExp(cfg?.guessRegionCapital?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.guessRegionCapital?.durationMs || 180000));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  if (cfg.roleId)
    await sendMinigameRolePing(channel, cfg);
  const image = await fetchWikiRegionImage(pick.region);
  const regionNameAttachment = !image ? (buildRegionNameImageAttachment(pick.region) || buildPromptImageAttachment("Indovina il capoluogo", [pick.region], "guess_region_capital", "", client)) : null;
  const regionImageUrl = image || (regionNameAttachment ? `attachment://${regionNameAttachment.name}` : null);
  const gameMessage = await sendMinigameMessage(channel, { embeds: [buildGuessRegionCapitalEmbed(pick.region, rewardExp, durationMs, regionImageUrl, regionNameAttachment?.name || null,),], files: regionNameAttachment ? [regionNameAttachment] : [], }).catch(() => null);

  const timeout = setTimeout(async () => { const game = activeGames.get(channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, channelId, channel, game, buildTimeoutRegionCapitalEmbed(game.region, game.displayAnswer),); }, durationMs); timeout.unref?.();
  const displayAnswer = String(pick.answers[0] || "sconosciuto");
  const regionHint = buildRegionCapitalHint(pick.region);
  const hintTimeout = await scheduleGenericHint(
    client,
    channelId,
    durationMs,
    regionHint || `Capoluogo: ${buildRevealHint(displayAnswer)}`,
  );
  activeGames.set(channelId, {
    type: "guessRegionCapital",
    region: pick.region,
    answers: pick.answers,
    image,
    displayAnswer,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });

  await saveActiveGame(client, cfg, {
    type: "guessRegionCapital",
    target: JSON.stringify({
      region: pick.region,
      answers: pick.answers,
      image,
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

async function startGuessReverseCapitalGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;

  const questions = await loadReverseCapitalQuestionBank(cfg);
  if (!questions.length) return false;
  const pick = pickQuestionAvoidRecent(channelId, "guessReverseCapital", questions, (row?) => `${row?.capital ?? ""}\t${row?.country ?? ""}`, 28,);
  if (!pick?.capital || !pick?.country || !Array.isArray(pick?.answers) || !pick.answers.length)
    return false;

  const rewardExp = normalizeRewardExp(cfg?.guessReverseCapital?.rewardExp ?? cfg?.guessCapital?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.guessReverseCapital?.durationMs ?? cfg?.guessCapital?.durationMs ?? 180000));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  if (cfg.roleId)
    await sendMinigameRolePing(channel, cfg);
  const reverseCapitalAttachment = !pick.image ? buildPromptImageAttachment("Capitale inverso", [pick.capital], "guess_reverse_capital", "", client) : null;
  const reverseCapitalEmbed = buildGuessReverseCapitalEmbed(pick.capital, rewardExp, durationMs, pick.image || (reverseCapitalAttachment ? `attachment://${reverseCapitalAttachment.name}` : null));
  const gameMessage = await sendMinigameMessage(channel, { embeds: [reverseCapitalEmbed], files: reverseCapitalAttachment ? [reverseCapitalAttachment] : [], }).catch(() => null);

  const timeout = setTimeout(async () => { const game = activeGames.get(channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, channelId, channel, game, buildTimeoutReverseCapitalEmbed(game.capital, game.displayAnswer)); }, durationMs); timeout.unref?.();
  const displayAnswer = String(pick.country);
  const capitalHint = buildCapitalHint(pick.country);
  const hintTimeout = await scheduleGenericHint(
    client,
    channelId,
    durationMs,
    capitalHint || `Stato: ${buildRevealHint(displayAnswer)}`,
  );
  activeGames.set(channelId, {
    type: "guessReverseCapital",
    capital: pick.capital,
    country: pick.country,
    answers: pick.answers,
    displayAnswer,
    image: pick.image || null,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });

  await saveActiveGame(client, cfg, {
    type: "guessReverseCapital",
    target: JSON.stringify({
      capital: pick.capital,
      country: pick.country,
      answers: pick.answers,
      displayAnswer,
      image: pick.image || null,
    }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });

  markSent(channelId);
  return true;
}

function parsePhraseFromApiPayload(payload?) {
  if (payload == null) return "";
  if (typeof payload === "string") return payload.trim();
  const text = payload.content ?? payload.quote ?? payload.text ?? payload.phrase ?? payload.frase ?? payload.body ?? payload.q ?? payload.message ?? "";
  return String(text).trim();
}

async function fetchPhraseFromApi(apiUrl?, timeoutMs = 15000) {
  try {
    const res = await axios.get(apiUrl, { timeout: timeoutMs });
    const data = res?.data;
    if (Array.isArray(data)) {
      const item = pickRandomItem(data);
      return parsePhraseFromApiPayload(item);
    }
    return parsePhraseFromApiPayload(data);
  } catch {
    return "";
  }
}

async function fetchPhraseFromApiCandidates(apiCandidates?, timeoutMs = 15000) {
  const candidates = Array.isArray(apiCandidates) ? apiCandidates : [apiCandidates];
  for (const candidate of candidates) {
    const apiUrl = String(candidate || "").trim();
    if (!apiUrl) continue;
    const phrase = await fetchPhraseFromApi(apiUrl, timeoutMs);
    if (phrase) return phrase;
  }
  return "";
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

async function startGuessTeamGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const teams = await loadFootballTeamsFromApi(cfg);
  const pick = pickQuestionAvoidRecent(channelId, "guessTeam", teams, (t?) => t?.team || t?.id || "", 15) || pickRandomItem(teams);
  if (!pick?.team || !pick?.answers?.length) return false;

  const rewardExp = normalizeRewardExp(cfg?.guessTeam?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.guessTeam?.durationMs || 180000));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  if (cfg.roleId)
    await sendMinigameRolePing(channel, cfg);
  const teamAttachment = await resolveGuessPuzzleAttachment({
    imageUrl: pick.image,
    title: "Indovina la squadra",
    fallbackLines: [buildPlainMaskedTextHint(pick.team) || "Quale squadra è?"],
    fileBaseName: "guess_team",
    client,
    channelId,
  });
  const teamEmbed = buildGuessTeamEmbed(
    rewardExp,
    durationMs,
    teamAttachment ? `attachment://${teamAttachment.name}` : null,
  );
  const gameMessage = await sendMinigameMessage(
    channel,
    { embeds: [teamEmbed], ...(teamAttachment ? { files: [teamAttachment] } : {}) }
  ).catch(() => null);

  const timeout = setTimeout(async () => { const game = activeGames.get(channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, channelId, channel, game, buildTimeoutTeamEmbed(game.team)); }, durationMs); timeout.unref?.();
  const hintTimeout = await scheduleGenericHint(client, channelId, durationMs, `Squadra: ${buildRevealHint(pick.team)}`,
  );

  activeGames.set(channelId, {
    type: "guessTeam",
    team: pick.team,
    answers: pick.answers,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });

  await saveActiveGame(client, cfg, {
    type: "guessTeam",
    target: JSON.stringify({
      team: pick.team,
      answers: pick.answers,
      image: pick.image || null,
    }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });

  markSent(channelId);
  return true;
}

async function startGuessSingerGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const singers = await loadSingersFromApi(cfg);
  const pick = pickQuestionAvoidRecent(channelId, "guessSinger", singers, (s?) => s?.name || "", 15) || pickRandomItem(singers);
  if (!pick?.name || !pick?.answers?.length) return false;
  const resolvedImage = pick.image || (await fetchSingerImageFallback(pick.name, cfg));

  const rewardExp = normalizeRewardExp(cfg?.guessSinger?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.guessSinger?.durationMs || 180000));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  if (cfg.roleId)
    await sendMinigameRolePing(channel, cfg);
  const singerAttachment = await resolveGuessPuzzleAttachment({
    imageUrl: resolvedImage,
    title: "Indovina il cantante",
    fallbackLines: [buildPlainMaskedTextHint(pick.name) || "Chi è questo cantante?"],
    fileBaseName: "guess_singer",
    client,
    channelId,
  });
  const singerEmbed = buildGuessSingerEmbed(
    rewardExp,
    durationMs,
    singerAttachment ? `attachment://${singerAttachment.name}` : null,
  );
  const gameMessage = await sendMinigameMessage(
    channel,
    { embeds: [singerEmbed], ...(singerAttachment ? { files: [singerAttachment] } : {}) }
  ).catch(() => null);

  const timeout = setTimeout(async () => { const game = activeGames.get(channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, channelId, channel, game, buildTimeoutSingerEmbed(game.name)); }, durationMs); timeout.unref?.();
  const hintTimeout = await scheduleGenericHint(client, channelId, durationMs, `Cantante: ${buildRevealHint(pick.name)}`,
  );

  activeGames.set(channelId, {
    type: "guessSinger",
    name: pick.name,
    answers: pick.answers,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });

  await saveActiveGame(client, cfg, {
    type: "guessSinger",
    target: JSON.stringify({
      name: pick.name,
      answers: pick.answers,
      image: resolvedImage || null,
    }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });

  markSent(channelId);
  return true;
}

async function startGuessAlbumGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const albums = await loadAlbumsFromApi(cfg);
  const pick = pickQuestionAvoidRecent(channelId, "guessAlbum", albums, (a?) => `${a?.album || ""}|${a?.artist || ""}`, 15) || pickRandomItem(albums);
  if (!pick?.album || !pick?.answers?.length) return false;

  const rewardExp = normalizeRewardExp(cfg?.guessAlbum?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.guessAlbum?.durationMs || 180000));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  if (cfg.roleId)
    await sendMinigameRolePing(channel, cfg);

  const albumAttachmentName = "minigame_album.png";
  let albumImageUrl = pick.image;
  const albumCensored = pick.image ? await censorArtworkImage(pick.image, { attachmentName: albumAttachmentName, overlayAlpha: 0.98 }) : null;
  if (albumCensored) {
    albumImageUrl = `attachment://${albumCensored.attachmentName}`;
  }
  const albumFallbackAttachment = !albumImageUrl ? buildPromptImageAttachment("Indovina l'album", [pick.album, pick.artist], "guess_album", "", client) : null;
  if (albumFallbackAttachment) albumImageUrl = `attachment://${albumFallbackAttachment.name}`;
  const albumFiles = albumCensored ? [new AttachmentBuilder(albumCensored.buffer, { name: albumCensored.attachmentName })] : (albumFallbackAttachment ? [albumFallbackAttachment] : []);
  const gameMessage = await sendMinigameMessage(channel, { embeds: [buildGuessAlbumEmbed(rewardExp, durationMs, albumImageUrl)], files: albumFiles, }).catch(() => null);

  const censorRevealTimeouts = pick.image && gameMessage?.id
    ? scheduleArtworkCensorSteps({
        channelId,
        channel,
        gameMessageId: gameMessage.id,
        originalArtworkUrl: pick.image,
        durationMs,
        buildEmbed: buildGuessAlbumEmbed,
        rewardExp,
        attachmentName: albumAttachmentName,
        gameType: "guessAlbum",
      })
    : [];

  const timeout = scheduleMinigameRoundTimeout(client, cfg, channelId, channel, durationMs);
  const hintTimeout = await scheduleGenericHint(client, channelId, durationMs, `Artista: **${pick.artist}** \u2022 Album: ${buildRevealHint(pick.album)}`,
  );

  activeGames.set(channelId, {
    type: "guessAlbum",
    album: pick.album,
    artist: pick.artist,
    answers: pick.answers,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    censorRevealTimeouts,
    gameMessageId: gameMessage?.id || null,
  });

  await saveActiveGame(client, cfg, {
    type: "guessAlbum",
    target: JSON.stringify({
      album: pick.album,
      artist: pick.artist,
      answers: pick.answers,
      image: pick.image || null,
    }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });

  markSent(channelId);
  return true;
}

function isValidHangmanWord(word?) {
  if (!word || typeof word !== "string") return false;
  const w = word.trim();
  if (w.length < 4 || w.length > 12) return false;
  return /^\p{L}+$/u.test(w);
}

async function startHangmanGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;

  let words = [];
  const apiUrl = cfg?.hangman?.apiUrl || cfg?.guessWord?.apiUrl || null;
  if (apiUrl) {
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
    const fallbackWords = customWords.length ? customWords : getHangmanWords();
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

function parseDrivingQuizFromPayload(payload?) {
  if (payload == null) return null;

  if (Array.isArray(payload?.results) && payload.results.length > 0) {
    const item = pickRandomItem(payload.results);
    const question = item?.question;
    if (!question) return null;
    try {
      const statement = decodeURIComponent(String(question).replace(/\+/g, " "));
      if (!statement) return null;

      const qType = String(item?.type || "boolean").toLowerCase();
      if (qType === "multiple") {
        const correct = decodeURIComponent(String(item?.correct_answer || "").replace(/\+/g, " "),);
        const incorrect = Array.isArray(item?.incorrect_answers) ? item.incorrect_answers.map((a?) => decodeURIComponent(String(a || "").replace(/\+/g, " ")),) : [];
        const all = shuffleArray([correct, ...incorrect]);
        const correctIndex = all.indexOf(correct);
        if (correctIndex < 0 || all.length < 2) return null;
        return {
          questionType: "multiple",
          statement,
          options: all,
          correctIndex,
        };
      }

      const correct = String(item?.correct_answer || "").toLowerCase();
      if (correct === "true" || correct === "false")
        return {
          questionType: "trueFalse",
          statement,
          answer: correct === "true",
        };
    } catch (err) {
      warnMinigame(err);
    }
    return null;
  }

  const statement = payload.statement ?? payload.question ?? payload.text ?? "";
  if (!statement) return null;

  const options = payload.options ?? payload.choices;
  if (Array.isArray(options) && options.length >= 2) {
    const correctIndex = typeof payload.correctIndex === "number" ? payload.correctIndex : typeof payload.correct === "number" ? payload.correct : -1;
    const correctAnswer = payload.correctAnswer ?? payload.correct_answer;
    let idx = correctIndex;
    if (idx < 0 && correctAnswer != null) {
      const norm = normalizeCountryName(String(correctAnswer));
      idx = options.findIndex(
        (o?) => normalizeCountryName(String(o)) === norm,
      );
    }
    if (idx >= 0 && idx < options.length)
      return {
        questionType: "multiple",
        statement: String(statement).trim(),
        options: options.map((o?) => String(o).trim()),
        correctIndex: idx,
      };
  }

  const rawAnswer = payload.answer ?? payload.correct_answer ?? payload.correct;
  const parsedAnswer = typeof rawAnswer === "boolean" ? rawAnswer : normalizeTruthValue(String(rawAnswer ?? ""));
  if (parsedAnswer === null) return null;
  return {
    questionType: "trueFalse",
    statement: String(statement).trim(),
    answer: parsedAnswer,
  };
}

function shuffleDrivingMultipleChoiceRow(row?) {
  if (!row || row.questionType !== "multiple") return row;
  if (!Array.isArray(row.options) || row.options.length < 2) return row;
  const n = row.options.length;
  const rawCorrect = Number(row.correctIndex);
  if (!Number.isFinite(rawCorrect)) return row;
  const boundedCorrect = Math.max(0, Math.min(Math.floor(rawCorrect), n - 1));
  const tagged = row.options.map((option?, idx?) => ({
    option: String(option ?? "").trim(),
    idx,
  }));
  const shuffled = shuffleArray(tagged);
  const correctIndex = shuffled.findIndex((entry?) => entry.idx === boundedCorrect);
  if (correctIndex < 0) return row;
  return {
    ...row,
    options: shuffled.map((entry?) => entry.option),
    correctIndex,
  };
}

function isDrivingPatenteRelated(statement?) {
  if (!statement || typeof statement !== "string") return false;
  const s = statement.toLowerCase();
  const offTopic = [
    "logo", "animale", "animal", "marchio", "brand", "manufacturer", "automobilistica",
    "raffigurato", "depicted", "which animal", "quale animale", "porsche", "ferrari",
    "symbol of", "simbolo del", "casa automobilistica", "car manufacturer", "depicted on",
    "aria condizionata", "air conditioning", "primo veicolo", "first vehicle", "standard di fabbrica",
    "dotato di", "equipped with", "packard", "tucker", "hudson", "quale fu il primo",
    "which was the first", "invented", "inventato", "storia", "history", "anno di",
    "year of", "fondat", "founded",
  ];
  if (offTopic.some((w?) => s.includes(w))) return false;
  const onTopic = [
    "conducente", "segnale", "strada", "velocit", "speed", "limit", "limite", "patente",
    "semaforo", "traffic", "precedenza", "priority", "divieto", "obbligo", "corsia", "lane",
    "autostrada", "highway", "sorpasso", "overtak", "sosta", "parking", "pedonale", "pedestrian",
    "incrocio", "intersection", "freno", "brake", "cintura", "seat belt", "triangolo", "hazard",
    "incident", "incidente", "codice della strada", "traffic law", "road sign",
  ];
  return onTopic.some((w?) => s.includes(w));
}

function appendCacheBuster(url?) {
  if (!url || typeof url !== "string") return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}_=${Date.now()}`;
}

async function fetchDrivingQuizFromApi(apiUrl?, timeoutMs = 15000) {
  try {
    const res = await axios.get(apiUrl, { timeout: timeoutMs });
    const data = res?.data;
    if (Array.isArray(data)) {
      const item = pickRandomItem(data);
      return parseDrivingQuizFromPayload(item);
    }
    return parseDrivingQuizFromPayload(data);
  } catch {
    return null;
  }
}

async function startDrivingQuizGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;

  let row = null;
  let fromApi = false;

  const customApiUrl = cfg?.drivingQuiz?.apiUrl || null;
  const maxApiRetries = 3;
  if (customApiUrl) {
    for (let r = 0; r < maxApiRetries && !row; r++) {
      row = await fetchDrivingQuizFromApi(appendCacheBuster(customApiUrl));
      if (row && !isDrivingPatenteRelated(row.statement)) row = null;
      if (row && isQuestionKeyRecent(channelId, "drivingQuiz", row.statement, 20)) row = null;
      if (row) fromApi = true;
    }
  }
  if (!row && (cfg?.drivingQuiz?.useDefaultApi === true)) {
    for (let r = 0; r < maxApiRetries && !row; r++) {
      row = await fetchDrivingQuizFromApi(appendCacheBuster(DEFAULT_DRIVING_QUIZ_API_URL));
      if (row && !isDrivingPatenteRelated(row.statement)) row = null;
      if (row && isQuestionKeyRecent(channelId, "drivingQuiz", row.statement, 20)) row = null;
      if (row) fromApi = true;
    }
  }

  if (!row) {
    const fallbackSources = [
      () => { const signPick = pickQuestionAvoidRecent(channelId, "drivingSign", getDrivingSignQuestions(), (x?) => x?.statement, 20); if (signPick?.statement && signPick?.signType && Array.isArray(signPick?.options) && signPick.options.length >= 2 && typeof signPick?.correctIndex === "number" && signPick.correctIndex >= 0 && signPick.correctIndex < signPick.options.length) { return { questionType: "multiple", signType: String(signPick.signType), statement: String(signPick.statement), options: signPick.options.map((o?) => String(o)), correctIndex: signPick.correctIndex, }; } return null; },
      () => { const localPick = pickQuestionAvoidRecent(channelId, "drivingMultiple", getDrivingMultipleChoiceBank(), (x?) => x?.statement, 20); if (localPick?.statement && Array.isArray(localPick?.options) && localPick.options.length >= 2 && typeof localPick?.correctIndex === "number" && localPick.correctIndex >= 0 && localPick.correctIndex < localPick.options.length) { return { questionType: "multiple", statement: String(localPick.statement), options: localPick.options.map((o?) => String(o)), correctIndex: localPick.correctIndex, }; } return null; },
      () => { const localPick = pickQuestionAvoidRecent(channelId, "drivingTrueFalse", getDrivingTrueFalseBank(), (x?) => x?.statement, 20); if (localPick?.statement != null && typeof localPick?.answer === "boolean") { return { questionType: "trueFalse", statement: String(localPick.statement), answer: Boolean(localPick.answer), }; } return null; },
    ];
    for (let i = fallbackSources.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [fallbackSources[i], fallbackSources[j]] = [fallbackSources[j], fallbackSources[i]];
    }
    for (const getFallback of fallbackSources) {
      row = getFallback();
      if (row) break;
    }
  }
  if (!row) return false;
  if (fromApi && row.statement) pushQuestionKeyToRecent(channelId, "drivingQuiz", row.statement, 20);
  if (fromApi && row.statement) {
    const toTranslate = [row.statement];
    if (row.questionType === "multiple" && Array.isArray(row.options)) toTranslate.push(...row.options);
    const translatedAll = await Promise.all(toTranslate.map((o?) => translateToItalian(o, cfg)));
    if (translatedAll[0]) row = { ...row, statement: translatedAll[0] };
    if (row.questionType === "multiple" && translatedAll.length > 1 && translatedAll.slice(1).every(Boolean))
      row = { ...row, options: translatedAll.slice(1) };
  }
  if (row.questionType === "multiple") {
    row = shuffleDrivingMultipleChoiceRow(row);
  }

  const rewardExp = normalizeRewardExp(cfg?.drivingQuiz?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.drivingQuiz?.durationMs || 180000));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  if (cfg.roleId)
    await sendMinigameRolePing(channel, cfg);
  const drivingAttachment = buildDrivingQuizPromptImage(row);
  const drivingEmbed = buildDrivingQuizEmbed(row, rewardExp, durationMs);
  if (drivingAttachment) {
    drivingEmbed.setImage(`attachment://${drivingAttachment.name}`);
  }
  const gameMessage = await sendMinigameMessage(channel, { embeds: [drivingEmbed], files: drivingAttachment ? [drivingAttachment] : [], }).catch(() => null);

  const timeout = setTimeout(async () => { const game = activeGames.get(channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, channelId, channel, game, buildTimeoutDrivingQuizEmbed(game)); }, durationMs); timeout.unref?.();

  let hintTimeout = null;
  if (row.questionType === "multiple" && Number.isFinite(row.correctIndex) && Array.isArray(row.options) && row.options.length >= 2) {
    const n = row.options.length;
    const correctIdx = Math.max(0, Math.min(row.correctIndex, n - 1));
    const otherIdx = correctIdx <= 0 ? 1 : (correctIdx >= n - 1 ? n - 2 : (Math.random() < 0.5 ? correctIdx - 1 : correctIdx + 1));
    const [i1, i2] = [Math.min(correctIdx, otherIdx), Math.max(correctIdx, otherIdx)];
    if (i1 >= 0 && i2 < n) {
      const L1 = DRIVING_QUIZ_LETTERS[i1] ?? String(i1 + 1);
      const L2 = DRIVING_QUIZ_LETTERS[i2] ?? String(i2 + 1);
      hintTimeout = await scheduleGenericHint(
        client,
        channelId,
        durationMs,
        `<a:VC_Flame:1482725674711126140> La risposta è tra **${L1}** e **${L2}**.`,
      );
    }
  } else if (row.questionType === "trueFalse" && row.statement) {
    const thematicHint = getDrivingQuizThematicHint(row);
    if (thematicHint) {
      hintTimeout = await scheduleGenericHint(client, channelId, durationMs, thematicHint);
    }
  }

  const gameState: Record<string, any> = { type: "drivingQuiz", questionType: row.questionType ?? "trueFalse", statement: row.statement, rewardExp, startedAt: Date.now(), endsAt: Date.now() + durationMs, timeout, hintTimeout, gameMessageId: gameMessage?.id || null, };
  if (row.questionType === "multiple") {
    gameState.options = row.options;
    const optLen = Array.isArray(row.options) ? row.options.length : 0;
    gameState.correctIndex = Math.max(0, Math.min(Number(row.correctIndex), optLen - 1));
  } else {
    gameState.answer = Boolean(row.answer);
  }

  activeGames.set(channelId, gameState);

  await saveActiveGame(client, cfg, {
    type: "drivingQuiz",
    target: JSON.stringify(
      row.questionType === "multiple"
        ? {
          statement: row.statement,
          options: row.options,
          correctIndex: row.correctIndex,
        }
        : {
          statement: row.statement,
          answer: row.answer,
        },
    ),
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
  const bank = getGuessYearBank();
  const pick = pickQuestionAvoidRecent(channelId, "guessYear", bank, (r?) => `${r.type}:${r.title}:${r.year}`, 25);
  if (!pick) return false;
  const rewardExp = normalizeRewardExp(cfg?.guessYear?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.guessYear?.durationMs || 180000));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;
  await sendMinigameRolePing(channel, cfg);
  const typeLabel = { film: "Film", series: "Serie TV", song: "Canzone", album: "Album" }[pick.type] || pick.type;
  const lines = [pick.subtitle ? `${pick.title} — ${pick.subtitle}` : pick.title, `Categoria: ${typeLabel}`];
  const attachment = buildPromptImageAttachment("Indovina l'anno", lines, "guess_year", "", client);
  const imageUrl = attachment ? `attachment://${attachment.name}` : null;
  const embed = buildGuessYearEmbed(pick.title, pick.subtitle || null, rewardExp, durationMs, imageUrl);
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
  const bank = getCompleteVerseBank();
  const pick = pickQuestionAvoidRecent(channelId, "completeVerse", bank, (r?) => r.verse, 15);
  if (!pick) return false;
  const rewardExp = normalizeRewardExp(cfg?.completeVerse?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.completeVerse?.durationMs || 180000));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;
  await sendMinigameRolePing(channel, cfg);
  const attachment = buildPromptImageAttachment("Completa il verso", [pick.verse, `${pick.song} — ${pick.artist}`], "complete_verse", "", client);
  const imageUrl = attachment ? `attachment://${attachment.name}` : null;
  const embed = buildCompleteVerseEmbed(pick.verse, rewardExp, durationMs, imageUrl);
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

async function startGuessCityGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const bank = getGuessCityBank();
  const pick = pickQuestionAvoidRecent(channelId, "guessCity", bank, (r?) => r.landmark, 20);
  if (!pick) return false;
  const rewardExp = normalizeRewardExp(cfg?.guessCity?.rewardExp ?? 150);
  const durationMs = Math.max(60000, Number(cfg?.guessCity?.durationMs || 180000));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;
  await sendMinigameRolePing(channel, cfg);
  const attachment = buildPromptImageAttachment("Indovina la città", [pick.landmark, pick.country ? `Paese: ${pick.country}` : ""].filter(Boolean), "guess_city", "", client);
  const imageUrl = attachment ? `attachment://${attachment.name}` : null;
  const embed = buildGuessCityEmbed(pick.landmark, rewardExp, durationMs, imageUrl);
  const gameMessage = await sendMinigameMessage(channel, { embeds: [embed], files: attachment ? [attachment] : [] }).catch(() => null);
  const timeout = scheduleMinigameRoundTimeout(client, cfg, channelId, channel, durationMs);
  const hintText = `Città: ${buildRevealHint(pick.city)}`;
  const hintTimeout = await scheduleGenericHint(client, channelId, durationMs, hintText);
  const cityNorm = normalizeCountryName(pick.city);
  const answers = [cityNorm, pick.city, compactNoSpaces(cityNorm)].filter(Boolean);
  activeGames.set(channelId, {
    type: "guessCity",
    landmark: pick.landmark,
    city: pick.city,
    answers,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });
  await saveActiveGame(client, cfg, {
    type: "guessCity",
    target: JSON.stringify({ landmark: pick.landmark, city: pick.city }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });
  markSent(channelId);
  return true;
}

export = { startGuessNumberGame, startGuessWordGame, startGuessFlagGame, startGuessPlayerGame, startGuessSongGame, startGuessCapitalGame, startGuessRegionCapitalGame, startGuessReverseCapitalGame, startFastTypeGame, startGuessTeamGame, startGuessSingerGame, startGuessAlbumGame, startHangmanGame, startItalianGkGame, startDrivingQuizGame, startMathExpressionGame, startGuessYearGame, startCompleteVerseGame, startGuessEmojiGame, startQuoteFilmGame, startCompleteProverbGame, startSynonymAntonymGame, startGuessCityGame };
