/** Quiz Star Wars: domanda (e opzioni) sull'immagine, risposta in chat. */
const __path = require("path") as typeof import("path");
const __eventCoreVinili = (rel: string) => __path.join(__path.resolve(__dirname, "../../../../../../src/Vinili"), rel);

const {
  getStarWarsQuizBank,
  pickRandomQuizBackgroundUrl,
} = require("../../Utils/Eventi/starWarsQuizBank") as typeof import("../../Utils/Eventi/starWarsQuizBank");
const { polishItalianQuestionText, buildStarWarsQuizPromptImage } = require(__eventCoreVinili("Minigames/services/minigameImages"));
const { buildStarWarsQuizEmbed } = require(__eventCoreVinili("Minigames/services/minigameEmbeds"));
const { buildAliases } = require(__eventCoreVinili("Minigames/services/minigameSources"));
const { getChannelCached } = require(__eventCoreVinili("Minigames/services/minigameUtils"));
const { normalizeRewardExp, buildRevealHint, shuffleArray } = require(__eventCoreVinili("Minigames/services/minigameText"));
const { activeGames, pickQuestionAvoidRecent } = require(__eventCoreVinili("Minigames/services/minigameState"));
const { sendMinigameRolePing } = require(__eventCoreVinili("Minigames/services/minigameRolePing"));
const { sendMinigameMessage } = require(__eventCoreVinili("Minigames/services/minigameDiscord"));
const {
  markSent,
  saveActiveGame,
  scheduleMinigameRoundTimeout,
  scheduleGenericHint,
} = require(__eventCoreVinili("Minigames/services/minigameRound"));

function prepareQuizPick(raw?) {
  if (!raw?.question || !Array.isArray(raw?.answers)) return null;
  const kind = String(raw.kind || "text");
  const question = polishItalianQuestionText(String(raw.question));
  let choices = Array.isArray(raw.choices) ? raw.choices.map((c?) => String(c || "").trim()).filter(Boolean) : [];
  let correctIndex = -1;
  let answers = buildAliases(raw.answers);

  let answerBool = null;
  if (kind === "mc" && choices.length >= 2) {
    const correctTexts = new Set(buildAliases(raw.answers));
    const indexed = choices.map((c?, i?) => ({ c, i, norm: buildAliases([c]) }));
    const shuffled = shuffleArray(indexed.slice());
    choices = shuffled.map((x?) => x.c);
    correctIndex = shuffled.findIndex((x?) => x.norm.some((a?) => correctTexts.has(a)));
    if (correctIndex < 0) correctIndex = 0;
    answers = buildAliases([choices[correctIndex], ...(raw.answers || [])]);
  } else if (kind === "vf") {
    choices = ["Vero", "Falso"];
    const first = String(raw.answers?.[0] || "").trim().toLowerCase();
    answerBool = ["vero", "true", "v", "si", "sì", "yes", "y"].includes(first);
  } else {
    choices = [];
  }

  return {
    id: raw.id || null,
    kind: kind === "mc" || kind === "vf" ? kind : "text",
    question,
    answers,
    answer: kind === "vf" ? answerBool : undefined,
    choices,
    correctIndex: kind === "mc" ? correctIndex : -1,
    displayAnswer: String(raw.answers?.[0] || choices[correctIndex] || "sconosciuta"),
  };
}

async function startStarWarsQuizGame(client?, cfg?, options: Record<string, any> = {}) {
  const channelId = String(options.channelId || cfg?.channelId || "").trim();
  if (!channelId || activeGames.has(channelId)) return false;

  const bank = getStarWarsQuizBank();
  if (!bank.length) return false;

  let pool = bank;
  const forceKind = String(options.forceKind || "").trim().toLowerCase();
  if (forceKind === "mc" || forceKind === "vf" || forceKind === "text") {
    pool = bank.filter((q?) => q.kind === forceKind);
    if (!pool.length) pool = bank;
  }

  const localPick = pickQuestionAvoidRecent(channelId, "starWarsQuiz", pool, (q?) => q?.question, 30);
  const prepared = prepareQuizPick(localPick);
  if (!prepared?.answers?.length) return false;

  const rewardExp = normalizeRewardExp(cfg?.starWarsQuiz?.rewardExp ?? 50);
  const rewardCredits = Math.max(0, Math.floor(Number(cfg?.starWarsQuiz?.rewardCredits ?? 5000) || 0));
  const durationMs = Math.max(60000, Number(cfg?.starWarsQuiz?.durationMs || 180000));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  const {
    resolveMalusForQuizStart,
    applyActiveMalusToPrepared,
  } = require("../Community/starWarsQuizMalusService") as typeof import("../Community/starWarsQuizMalusService");
  const malus = await resolveMalusForQuizStart(client);
  const display = applyActiveMalusToPrepared(prepared, malus);

  await sendMinigameRolePing(channel, cfg);
  const backgroundUrl = pickRandomQuizBackgroundUrl();
  const attachment = await buildStarWarsQuizPromptImage({
    kind: prepared.kind,
    question: display.displayQuestion || prepared.question,
    choices: display.displayChoices?.length ? display.displayChoices : prepared.choices,
    backgroundUrl,
    malusTitle: malus?.def?.title || "",
  });
  const embed = buildStarWarsQuizEmbed(prepared.kind, rewardExp, durationMs, rewardCredits, malus);
  if (attachment) embed.setImage(`attachment://${attachment.name}`);

  const gameMessage = await sendMinigameMessage(channel, {
    embeds: [embed],
    files: attachment ? [attachment] : [],
  }).catch(() => null);

  const timeout = scheduleMinigameRoundTimeout(client, cfg, channelId, channel, durationMs);
  const hintTimeout = await scheduleGenericHint(
    client,
    channelId,
    durationMs,
    `Risposta: ${buildRevealHint(prepared.displayAnswer)}`,
  );

  const gameState: Record<string, any> = {
    type: "starWarsQuiz",
    kind: prepared.kind,
    question: prepared.question,
    displayQuestion: display.displayQuestion || prepared.question,
    answers: prepared.answers,
    answer: prepared.answer,
    choices: prepared.choices,
    displayChoices: display.displayChoices || prepared.choices,
    correctIndex: prepared.correctIndex,
    displayAnswer: prepared.displayAnswer,
    backgroundUrl,
    rewardExp,
    malusId: malus?.malusId || null,
    malusTitle: malus?.def?.title || null,
    frozenUserIds: Array.isArray(malus?.frozenUserIds) ? malus.frozenUserIds : [],
    geoFactionId: malus?.geoFactionId || malus?.focusFaction || null,
    geonosianCorrectIds: [],
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  };
  activeGames.set(channelId, gameState);

  await saveActiveGame(client, cfg, {
    type: "starWarsQuiz",
    target: JSON.stringify({
      kind: prepared.kind,
      question: prepared.question,
      displayQuestion: gameState.displayQuestion,
      answers: prepared.answers,
      answer: prepared.answer,
      choices: prepared.choices,
      displayChoices: gameState.displayChoices,
      correctIndex: prepared.correctIndex,
      displayAnswer: prepared.displayAnswer,
      backgroundUrl,
      malusId: gameState.malusId,
      malusTitle: gameState.malusTitle,
      frozenUserIds: gameState.frozenUserIds,
      geoFactionId: gameState.geoFactionId,
      geonosianCorrectIds: [],
    }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });
  markSent(channelId);
  return true;
}

export = { startStarWarsQuizGame, prepareQuizPick };
