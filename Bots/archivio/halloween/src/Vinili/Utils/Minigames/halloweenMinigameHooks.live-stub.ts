/** Halloween minigame hooks — detached from live event (local stub). */

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

function isHalloweenExclusiveMinigamesEnabled(_client?, cfg?) {
  return cfg?.halloweenExclusiveDuringEvent !== false;
}

function isHalloweenEventLiveForMinigames(_client?, _nowMs = Date.now(), _guildId = null) {
  return false;
}

function isHalloweenMinigameType(_type?) {
  return false;
}

function isHalloweenCustomMinigameType(_type?) {
  return false;
}

function shouldUseHalloweenTheme(_cfg?) {
  return false;
}

function getHalloweenExclusiveAvailableTypes(_cfg?, _nowMs = Date.now()) {
  return [];
}

function isWithinHalloweenCandyHours(_client?, _nowMs = Date.now()) {
  return false;
}

function getHalloweenQuizBank() {
  return [];
}
function getHalloweenMemoryEmojiBank() {
  return [];
}
function getHalloweenHangmanWords() {
  return [];
}
function getHalloweenGuessYearBank() {
  return [];
}
function getHalloweenCompleteVerseBank() {
  return [];
}
function buildHalloweenMissingEmojiRound() {
  return null;
}
function buildHalloweenCountBatsRound() {
  return null;
}

export = {
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
