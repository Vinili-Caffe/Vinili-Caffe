/** Minigiochi: messaggio in chat durante una partita. */
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { normalizeUserAnswerText } = require("./minigameText") as typeof import("./minigameText");
const { getActivityWindowMs, getActivityScopeKey, recordActivity, canCountMessageForActivity } = require("./minigameActivity") as typeof import("./minigameActivity");
const { activeGames, channelWinClosing, endMinigameWinClose, isMinigameRehydrateBlocked, clearActiveGame } = require("./minigameState") as typeof import("./minigameState");
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
  if (!chId) return false;

  // Claim di chiusura stantio: non bloccare le risposte per sempre
  if (channelWinClosing.has(chId)) {
    endMinigameWinClose(chId);
  }

  const officialChatId = String(baseCfg.channelId || "");
  const mediaId = String(IDs.channels.media || "").trim();
  const gameHere = activeGames.get(chId);

  // Activity solo sul canale ufficiale / media quando non c'è partita
  if (
    !gameHere &&
    canCountMessageForActivity(message) &&
    (chId === officialChatId || (mediaId && chId === mediaId))
  ) {
    recordActivity(getActivityScopeKey(baseCfg), getActivityWindowMs(baseCfg), message.author?.id);
  }

  // Accetta risposte su QUALSIASI canale con partita attiva (swspawn / canale ufficiale)
  if (!gameHere && chId !== officialChatId) return false;

  // cfg.channelId DEVE essere il canale del messaggio, altrimenti win/close silenziosi
  const cfg = {
    ...baseCfg,
    guildId: String(message.guild.id || ""),
    channelId: chId,
  };

  let game = gameHere;
  if (!game && chId === officialChatId) {
    game = await ensureTreasureHuntGame(client, cfg);
  }
  if (game?.type === "treasureHunt") {
    if (isStaleOrInvalidActiveGame(game)) {
      await closeStaleActiveMinigameChannel(client, cfg, chId, game, message.channel);
      return false;
    }
    if (game.hadParticipation === undefined) game.hadParticipation = false;
    game.hadParticipation = true;
    return handleTreasureHuntIncomingMessage(message, client, cfg);
  }
  if (!game) {
    if (isMinigameRehydrateBlocked(chId)) {
      await clearActiveGame(client, cfg).catch(() => { });
    } else {
      await purgeExpiredMinigameDbState(client, cfg);
    }
    return false;
  }
  if (isStaleOrInvalidActiveGame(game)) {
    await closeStaleActiveMinigameChannel(client, cfg, chId, game, message.channel);
    return false;
  }

  /* Evento SW: senza smistamento non si participa ai minigame in rotazione. */
  if (baseCfg.starWarsEventLive) {
    try {
      const {
        isStarWarsSortedParticipant,
        UNSORTED_MG_MSG,
      } = require("../../../../archivio/starwars/src/Vinili/Services/Community/starWarsDiscordMinigamesService") as typeof import("../../../../archivio/starwars/src/Vinili/Services/Community/starWarsDiscordMinigamesService");
      const ok = await isStarWarsSortedParticipant(client || message.client, message.guildId, message.author?.id);
      if (!ok) {
        await message.reply(UNSORTED_MG_MSG).catch(() => null);
        return true;
      }
    } catch (_) {}
  }

  if (game.hadParticipation === undefined) game.hadParticipation = false;
  game.hadParticipation = true;

  // Malus freeze SW: lista in-memory sul game; Mongo solo per malus freeze
  try {
    const uid = String(message.author?.id || "");
    const frozenIds = Array.isArray(game.frozenUserIds) ? game.frozenUserIds.map(String) : [];
    if (uid && frozenIds.includes(uid)) {
      await message.react("🧊").catch(() => null);
      return true;
    }
    const malusId = String(game.malusId || "").toLowerCase();
    if (malusId === "hansicle" || malusId === "sospensione") {
      const { isUserFrozenForQuiz } = require("../../../../archivio/starwars/src/Vinili/Services/Community/starWarsQuizMalusService");
      if (await isUserFrozenForQuiz(uid)) {
        await message.react("🧊").catch(() => null);
        return true;
      }
    }
  } catch (_) {}

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
