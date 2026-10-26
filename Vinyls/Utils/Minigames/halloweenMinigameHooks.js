const {
  getHalloweenQuizBank,
  getHalloweenMemoryEmojiBank,
  getHalloweenHangmanWords,
  getHalloweenGuessYearBank,
  getHalloweenCompleteVerseBank,
  buildHalloweenMissingEmojiRound,
  buildHalloweenCountBatsRound,
} = require("../../Data/Minigames/halloweenMinigameBanks");
const { isHalloweenEventLive, isWithinHalloweenCandyHours } = require("../Web/halloweenEventConfig");

const HALLOWEEN_EXCLUSIVE_GAME_TYPES = Object.freeze([
  "halloweenQuiz",
  "memoryEmoji",
  "halloweenFindGhost",
  "hangman",
  "guessYear",
  "completeVerse",
  "halloweenMissingEmoji",
  "halloweenCountBats",
  "halloweenTrickOrTreat",
]);

const HALLOWEEN_CUSTOM_GAME_TYPES = Object.freeze([
  "halloweenQuiz",
  "halloweenFindGhost",
  "halloweenMissingEmoji",
  "halloweenCountBats",
  "halloweenTrickOrTreat",
]);

function isHalloweenExclusiveMinigamesEnabled(client, cfg) {
  const raw = client?.config?.minigames?.halloweenExclusiveDuringEvent;
  if (raw === false) return false;
  if (raw === true) return true;
  return cfg?.halloweenExclusiveDuringEvent !== false;
}

function isHalloweenEventLiveForMinigames(client, nowMs = Date.now(), guildId = null) {
  return isHalloweenEventLive(client, nowMs, guildId);
}

function isHalloweenMinigameType(type) {
  return HALLOWEEN_EXCLUSIVE_GAME_TYPES.includes(String(type || ""));
}

function isHalloweenCustomMinigameType(type) {
  return HALLOWEEN_CUSTOM_GAME_TYPES.includes(String(type || ""));
}

function shouldUseHalloweenTheme(cfg) {
  return Boolean(cfg?.halloweenEventLive) && isHalloweenExclusiveMinigamesEnabled(null, cfg);
}

function getHalloweenExclusiveAvailableTypes(cfg, nowMs = Date.now()) {
  const types = [];
  if (cfg?.halloweenQuiz !== false && getHalloweenQuizBank().length) types.push("halloweenQuiz");
  if (cfg?.memoryEmoji !== false && getHalloweenMemoryEmojiBank().length) types.push("memoryEmoji");
  if (cfg?.halloweenFindGhost !== false) types.push("halloweenFindGhost");
  if (cfg?.hangman !== false && getHalloweenHangmanWords().length) types.push("hangman");
  if (cfg?.guessYear !== false && getHalloweenGuessYearBank().length) types.push("guessYear");
  if (cfg?.completeVerse !== false && getHalloweenCompleteVerseBank().length) types.push("completeVerse");
  if (cfg?.halloweenMissingEmoji !== false) types.push("halloweenMissingEmoji");
  if (cfg?.halloweenCountBats !== false) types.push("halloweenCountBats");
  // ToT NON è in rotazione minigames: lo spawna solo il loop caramelle (alternanza React ↔ ToT, 08–24).
  // Altrimenti ogni ToT occupa il canale ~15m e “mangia” gli slot quiz/pipistrelli/ecc.
  return types;
}

module.exports = {
  HALLOWEEN_EXCLUSIVE_GAME_TYPES,
  HALLOWEEN_CUSTOM_GAME_TYPES,
  isHalloweenExclusiveMinigamesEnabled,
  isHalloweenEventLiveForMinigames,
  isHalloweenMinigameType,
  isHalloweenCustomMinigameType,
  shouldUseHalloweenTheme,
  getHalloweenExclusiveAvailableTypes,
  isWithinHalloweenCandyHours,
  getHalloweenQuizBank,
  getHalloweenMemoryEmojiBank,
  getHalloweenHangmanWords,
  getHalloweenGuessYearBank,
  getHalloweenCompleteVerseBank,
  buildHalloweenMissingEmojiRound,
  buildHalloweenCountBatsRound,
};
