/** Minigiochi quiz: quiz della patente. */
const axios = require("axios") as typeof import("axios").default;
const { getDrivingTrueFalseBank, getDrivingMultipleChoiceBank, getDrivingSignQuestions } = require("../../Data/Minigames/minigameBanks") as typeof import("../../Data/Minigames/minigameBanks");
const { warnMinigame } = require("./minigameLog") as typeof import("./minigameLog");
const { normalizeCountryName, buildDrivingQuizPromptImage } = require("./minigameImages") as typeof import("./minigameImages");
const { DRIVING_QUIZ_LETTERS, buildDrivingQuizEmbed, buildTimeoutDrivingQuizEmbed } = require("./minigameEmbeds") as typeof import("./minigameEmbeds");
const { getChannelCached, pickRandomItem } = require("./minigameUtils") as typeof import("./minigameUtils");
const { normalizeRewardExp, normalizeTruthValue, shuffleArray } = require("./minigameText") as typeof import("./minigameText");
const { activeGames, isQuestionKeyRecent, pushQuestionKeyToRecent, pickQuestionAvoidRecent } = require("./minigameState") as typeof import("./minigameState");
const { sendMinigameRolePing } = require("./minigameRolePing") as typeof import("./minigameRolePing");
const { sendMinigameMessage } = require("./minigameDiscord") as typeof import("./minigameDiscord");
const { markSent, saveActiveGame, sendMinigameTimeoutAndClose, scheduleGenericHint } = require("./minigameRound") as typeof import("./minigameRound");
const { translateToItalian } = require("./quizSources") as typeof import("./quizSources");

const DEFAULT_DRIVING_QUIZ_API_URL = "https://opentdb.com/api.php?amount=5&category=28&encode=url3986";

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

export = { startDrivingQuizGame };
