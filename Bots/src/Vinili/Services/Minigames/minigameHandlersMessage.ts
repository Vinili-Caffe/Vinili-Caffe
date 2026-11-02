/** Minigiochi: messaggio in chat durante una partita. */
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { normalizeUserAnswerText } = require("./minigameText") as typeof import("./minigameText");
const { getActivityWindowMs, getActivityScopeKey, recordActivity, canCountMessageForActivity } = require("./minigameActivity") as typeof import("./minigameActivity");
const { activeGames, channelWinClosing, isMinigameRehydrateBlocked, clearActiveGame } = require("./minigameState") as typeof import("./minigameState");
const { purgeExpiredMinigameDbState } = require("./minigameRound") as typeof import("./minigameRound");
const { getConfig } = require("./minigameConfig") as typeof import("./minigameConfig");
const { ensureTreasureHuntGame, handleTreasureHuntIncomingMessage } = require("./minigameTreasureHunt") as typeof import("./minigameTreasureHunt");
const stale = require("./minigameHandlersStale") as typeof import("./minigameHandlersStale");
const guess = require("./minigameHandlersGuess") as typeof import("./minigameHandlersGuess");
const quiz = require("./minigameHandlersQuiz") as typeof import("./minigameHandlersQuiz");
const hangman = require("./minigameHandlersHangman") as typeof import("./minigameHandlersHangman");
const culture = require("./minigameHandlersCulture") as typeof import("./minigameHandlersCulture");

const { isStaleOrInvalidActiveGame, closeStaleActiveMinigameChannel } = stale;

async function handleMinigameMessage(message?, client?) {
  const baseCfg = getConfig(client);
  if (!baseCfg?.enabled) return false;
  if (!message?.guild) return false;
  if (message.author?.bot) return false;
  const chId = String(message.channelId || "");
  if (channelWinClosing.has(chId)) return true;
  let cfg = baseCfg;
  cfg.guildId = String(message.guild.id || "");
  const chatId = String(cfg.channelId || "");
  const mediaId = String(IDs.channels.media || "").trim();
  const gameBucket = activeGames.get(chatId);
  if (
    !gameBucket &&
    canCountMessageForActivity(message) &&
    (chId === chatId || (mediaId && chId === mediaId))
  ) {
    recordActivity(getActivityScopeKey(cfg), getActivityWindowMs(cfg), message.author?.id);
  }
  if (chId !== chatId) return false;
  let game = activeGames.get(chId);
  if (!game) {
    game = await ensureTreasureHuntGame(client, cfg);
  }
  if (game?.type === "treasureHunt") {
    if (isStaleOrInvalidActiveGame(game)) {
      await closeStaleActiveMinigameChannel(client, cfg, cfg.channelId, game, message.channel);
      return false;
    }
    if (game.hadParticipation === undefined) game.hadParticipation = false;
    game.hadParticipation = true;
    return handleTreasureHuntIncomingMessage(message, client, cfg);
  }
  if (!game) {
    if (isMinigameRehydrateBlocked(chatId)) {
      await clearActiveGame(client, { ...cfg, guildId: message.guild.id }).catch(() => { });
    } else {
      await purgeExpiredMinigameDbState(client, { ...cfg, guildId: message.guild.id });
    }
    return false;
  }
  if (game && isStaleOrInvalidActiveGame(game)) {
    await closeStaleActiveMinigameChannel(client, cfg, cfg.channelId, game, message.channel);
    return false;
  }
  if (game) {
    if (game.hadParticipation === undefined) game.hadParticipation = false;
    game.hadParticipation = true;
  }
  if (!game) return false;

  const content = String(message.content || "").trim();
  const contentForGuess = normalizeUserAnswerText(content);

  const guessResult = await guess.handleGuessMessage(message, client, cfg, game, content, contentForGuess);
  if (guessResult !== null) return guessResult;
  const quizResult = await quiz.handleQuizMessage(message, client, cfg, game, content, contentForGuess);
  if (quizResult !== null) return quizResult;
  const hangmanResult = await hangman.handleHangmanMessage(message, client, cfg, game, content, contentForGuess);
  if (hangmanResult !== null) return hangmanResult;
  const cultureResult = await culture.handleCultureMessage(message, client, cfg, game, content, contentForGuess);
  if (cultureResult !== null) return cultureResult;
  return false;
}

export = { handleMinigameMessage };
