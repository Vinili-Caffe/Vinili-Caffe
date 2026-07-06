const FILE_BASE_TO_GAME_TYPE = {
  guess_number: "guessNumber",
  guess_word: "guessWord",
  guess_flag: "guessFlag",
  guess_player: "guessPlayer",
  guess_song: "guessSong",
  guess_capital: "guessCapital",
  guess_reverse_capital: "guessReverseCapital",
  guess_region_capital: "guessRegionCapital",
  fast_type: "fastType",
  guess_team: "guessTeam",
  guess_singer: "guessSinger",
  guess_album: "guessAlbum",
  hangman: "hangman",
  italian_gk: "italianGK",
  driving_quiz: "drivingQuiz",
  math_expression: "mathExpression",
  find_bot: "findBot",
  memory_emoji: "memoryEmoji",
  guess_year: "guessYear",
  complete_verse: "completeVerse",
  guess_emoji: "guessEmoji",
  quote_film: "quoteFilm",
  complete_proverb: "completeProverb",
  synonym_antonym: "synonymAntonym",
  guess_city: "guessCity",
  treasure_hunt: "treasureHunt",
  hogwarts_guess_character: "hogwartsGuessCharacter",
};

const HOGWARTS_BONUS_PROMPT_TITLES = {
  guessNumber: "Incantesimo numerico",
  guessWord: "Runa letterale",
  guessFlag: "Stemmi del mondo magico",
  guessPlayer: "Indovina il mago",
  guessSong: "Melodia incantata",
  guessCapital: "Capitale del mondo magico",
  guessReverseCapital: "Nome magico inverso",
  guessRegionCapital: "Luogo magico",
  fastType: "Formula magica",
  guessTeam: "Squadra di Quidditch",
  guessSinger: "Voce incantata",
  guessAlbum: "Tomo incantato",
  hangman: "Enigma del Basilisk",
  italianGK: "Sapienza di Hogwarts",
  drivingQuiz: "Patente del Ministero",
  mathExpression: "Runa aritmetica",
  findBot: "Trova il fantasma",
  memoryEmoji: "Memoria magica",
  guessYear: "Anno del film magico",
  completeVerse: "Completa la formula",
  guessEmoji: "Indovina con le rune",
  quoteFilm: "Citazione magica",
  completeProverb: "Proverbio del Cappello",
  synonymAntonym: "Sinonimo arcano",
  guessCity: "Città incantata",
  treasureHunt: "Caccia al tesoro",
  hogwartsGuessCharacter: "Indovina il personaggio",
};

const HOGWARTS_BONUS_PROMPT_SUBTITLES = {
  fastType: "Pronuncia esattamente questa formula",
  guessWord: "Decifra la runa",
  italianGK: "Rispondi alla domanda",
  hangman: "Enigma del Basilisk",
  guessFlag: "Quale stemma è questo?",
};

function resolveGameTypeFromKey(key) {
  const raw = String(key || "").trim();
  if (!raw) return "";
  if (HOGWARTS_BONUS_PROMPT_TITLES[raw]) return raw;
  return FILE_BASE_TO_GAME_TYPE[raw] || raw;
}

function shouldApplyHogwartsBonusTheme(cfg, gameTypeOrFileBase) {
  if (!cfg?.hogwartsEventLive) return false;
  if (cfg.hogwartsExclusiveDuringEvent === false) return false;
  const gameType = resolveGameTypeFromKey(gameTypeOrFileBase);
  if (!gameType) return false;
  const raw = cfg?.hogwartsEventBonusMinigames;
  if (raw === false) return false;
  const themed = ["hogwartsQuiz", "findScroll", "hogwartsMemoryEmoji", "hogwartsCipher", "hogwartsObservationTower"];
  if (themed.includes(gameType)) return false;
  if (raw === true || raw === "all" || !Array.isArray(raw)) return true;
  return raw.map((t) => String(t || "").trim()).includes(gameType);
}

function resolveHogwartsBonusPromptTitle(cfg, gameTypeOrFileBase, defaultTitle) {
  if (!shouldApplyHogwartsBonusTheme(cfg, gameTypeOrFileBase)) return String(defaultTitle || "Minigioco");
  const gameType = resolveGameTypeFromKey(gameTypeOrFileBase);
  return HOGWARTS_BONUS_PROMPT_TITLES[gameType] || String(defaultTitle || "Minigioco");
}

function resolveHogwartsBonusPromptSubtitle(cfg, gameTypeOrFileBase, defaultSubtitle) {
  if (!shouldApplyHogwartsBonusTheme(cfg, gameTypeOrFileBase)) return String(defaultSubtitle || "");
  const gameType = resolveGameTypeFromKey(gameTypeOrFileBase);
  return HOGWARTS_BONUS_PROMPT_SUBTITLES[gameType] || String(defaultSubtitle || "");
}

function pickHogwartsBonusBank(cfg, gameType, defaultBank, hogwartsBank) {
  if (!shouldApplyHogwartsBonusTheme(cfg, gameType)) return defaultBank;
  const themed = hogwartsBank;
  if (Array.isArray(themed) && themed.length) return themed;
  if (typeof themed === "function") {
    const resolved = themed();
    if (Array.isArray(resolved) && resolved.length) return resolved;
  }
  return defaultBank;
}

module.exports = {
  shouldApplyHogwartsBonusTheme,
  resolveHogwartsBonusPromptTitle,
  resolveHogwartsBonusPromptSubtitle,
  resolveGameTypeFromKey,
  pickHogwartsBonusBank,
};