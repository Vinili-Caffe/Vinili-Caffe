const axios = require("axios") as typeof import("axios").default;
const MINIGAME_429_THROTTLE_MS = 60 * 60 * 1000;
const MINIGAME_403_THROTTLE_MS = 60 * 1000;
let last429LogAt = 0;
let last403LogAt = 0;
let sportsDb429Until = 0;
let sportsDb429Consecutive = 0;
let sportsDb429LastHitAt = 0;
/** Free-tier TheSportsDB 429 is routine; keep quiet and back off hard. */
const SPORTSDB_429_BACKOFF_FLOOR_MS = 15 * 60_000;
const SPORTSDB_429_BACKOFF_CAP_MS = 6 * 60 * 60_000;
const { registerCanvasFonts, fontStackPrimaryOnly } = require("../../Utils/Render/canvasFonts") as typeof import("../../Utils/Render/canvasFonts");
const { drawLabelWithEmoji, tokenizeEmojiText } = require("../../Utils/Render/canvasEmojiRichText") as typeof import("../../Utils/Render/canvasEmojiRichText");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField, AttachmentBuilder, } = require("discord.js") as typeof import("discord.js");
const { minigameStateFindOneLean, minigameStateFindOneAndUpdate, minigameStateDeleteOne, minigameStateDeleteMany, minigameRotationFindOneLean, minigameRotationFindOneAndUpdate, minigameRotationDeleteOne, minigameRotationDeleteMany } = require("../../Utils/BotState/domainStatesStore") as typeof import("../../Utils/BotState/domainStatesStore");
const { ActivityUserProfile, SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { addExpWithLevel, shouldIgnoreExpForMember, incrementMinigameWinCounters } = require("../Community/expService") as typeof import("../Community/expService");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { getClientChannelCached, getGuildMemberCached, } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { getGuessYearBank, getCompleteVerseBank, getGuessEmojiBank, getQuoteFilmBank, getProverbBank, getSynonymAntonymBank, getGuessCityBank, getCapitalQuizBank, getItalianRegionCapitalBank, getItalianGkBank, getDrivingTrueFalseBank, getDrivingMultipleChoiceBank, getDrivingSignQuestions, getFastTypingPhrases, getHangmanWords, getTreasureHuntEmojiPairs, getHogwartsQuizBank, getHogwartsCipherBank, getHogwartsMemoryEmojiBank, getMemoryEmojiBank, CAPITAL_ITALIAN, CAPITAL_COUNTRY_REGION, REGION_AREA, REGION_HINT_DATA, FAMOUS_CAPITAL_COUNTRIES, FLAG_WELL_KNOWN_COUNTRIES } = require("../../Data/Minigames/minigameBanks") as typeof import("../../Data/Minigames/minigameBanks");
const { getHogwartsGuessWords, getHogwartsHangmanWords, getHogwartsFastTypingPhrases, getHogwartsGuessYearBank, getHogwartsQuoteFilmBank, getHogwartsCompleteVerseBank, getHogwartsProverbBank, getHogwartsSynonymAntonymBank, getHogwartsGuessCityBank, getHogwartsGuessEmojiBank, getHogwartsTreasureHuntEmojiPairs, getHogwartsItalianGkBank }: any = require("../../Data/Minigames/hogwartsBonusMinigameBanks") as typeof import("../../Data/Minigames/hogwartsBonusMinigameBanks");
const { getHogwartsCharacterBank } = require("../../Data/Minigames/hogwartsCharacterBank") as typeof import("../../Data/Minigames/hogwartsCharacterBank");
const { buildImageAttachmentFromRelativePath, resolveShopItemPublicImageUrl } = require("../../Utils/Web/hogwartsEventAssets") as typeof import("../../Utils/Web/hogwartsEventAssets");
const { safeLoadImage } = require("../../Utils/Render/safeLoadImage") as typeof import("../../Utils/Render/safeLoadImage");
const { shouldApplyHogwartsBonusTheme, resolveHogwartsBonusPromptTitle, resolveHogwartsBonusPromptSubtitle, pickHogwartsBonusBank } = require("../../Utils/Minigames/hogwartsBonusMinigameTheme") as typeof import("../../Utils/Minigames/hogwartsBonusMinigameTheme");
const {
  isHalloweenEventLiveForMinigames,
  isHalloweenExclusiveMinigamesEnabled,
  isHalloweenMinigameType,
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
} = require("../../Utils/Minigames/halloweenMinigameHooks") as typeof import("../../Utils/Minigames/halloweenMinigameHooks");
const {
  addHalloweenCandyWithPassAlong,
  buildHalloweenCandyUnlockPayload,
  resolveEventKey: resolveHalloweenCandyEventKey,
} = require("../Community/halloweenCandyService") as typeof import("../Community/halloweenCandyService");
const {
  buildTrickOrTreatRoundEmbed,
  buildTrickOrTreatEndedEmbed,
  buildTrickReplyEmbed,
  buildAlreadyKnockedEmbed,
  buildTrickOrTreatJumpUrl,
  buildTrickOrTreatHintMessage,
} = require("../../Utils/Minigames/halloweenTrickOrTreatUi") as typeof import("../../Utils/Minigames/halloweenTrickOrTreatUi");
const {
  registerHalloweenShowcaseDeps,
  processHalloweenMinigamesShowcaseForce,
} = require("./minigameHalloweenShowcaseService") as typeof import("./minigameHalloweenShowcaseService");
const { buildHalloweenFindGhostFoundEmbed } = require("../../Utils/Minigames/halloweenFindGhostUi") as typeof import("../../Utils/Minigames/halloweenFindGhostUi");
const { resolveHogwartsEventConfig, isEventWindowOpen } = require("../../Utils/Web/hogwartsSortingConfig") as typeof import("../../Utils/Web/hogwartsSortingConfig");
const { findSortingDoc, resolveSortedHouseId, resolveHouseIdFromMemberRoles, normalizeHogwartsHouseId: normalizeSortedHouseId } = require("../../Utils/Web/hogwartsSortingResolve") as typeof import("../../Utils/Web/hogwartsSortingResolve");
const { getHouseMeta } = require("../../Utils/Web/hogwartsSortingBank") as typeof import("../../Utils/Web/hogwartsSortingBank");
const { accountUsername, guildMemberDisplayAvatarUrlDynamic } = require("../../Utils/Discord/guildDiscordIdentity") as typeof import("../../Utils/Discord/guildDiscordIdentity");
const { isValidGuildUserId } = require("../../Utils/DB/validateWriteIds") as typeof import("../../Utils/DB/validateWriteIds");
const mongoose = require("mongoose") as typeof import("mongoose");
const { registerShutdownFlush, armShutdownCheckpoint } = require("../../../shared/recovery/shutdownCheckpoint") as typeof import("../../../shared/recovery/shutdownCheckpoint");
const { isBurrobirraActive, refreshBurrobirraActiveCache } = require("./burrobirraEffectService") as typeof import("./burrobirraEffectService");
const { applyBurrobirraToPayload, distortMinigameText, shuffleSpacedTokens } = require("../../Utils/Minigames/burrobirraDistortion") as typeof import("../../Utils/Minigames/burrobirraDistortion");
const {
  mergeFindBotVoiceExcludedChannelIds,
  isVoiceChannelEligibleForFindBotMinigame,
} = require("../../Utils/Minigames/findBotVoiceChannelEligibility") as typeof import("../../Utils/Minigames/findBotVoiceChannelEligibility");
const { formatItalianMinutesBold } = require("../../Utils/Text/italianDurationLabels") as typeof import("../../Utils/Text/italianDurationLabels");
const { applyDefaultFooterToEmbeds } = require("../../Utils/Embeds/defaultFooter") as typeof import("../../Utils/Embeds/defaultFooter");
const { TENANT_EMBED_COLOR } = require("../../MultiGuild/utils/tenantEmbedBranding") as typeof import("../../MultiGuild/utils/tenantEmbedBranding");
const MINIGAME_EMBED_COLOR = TENANT_EMBED_COLOR;
const activeGames = new Map();
const channelWinClosing = new Set();
const treasureHuntReactLocks = new Set();
const channelNoRehydrateUntil = new Map();
const MINIGAME_NO_REHYDRATE_MS = 300_000;

function blockMinigameRehydrate(channelId?, ms = MINIGAME_NO_REHYDRATE_MS) {
  const id = String(channelId || "").trim();
  if (!id) return;
  channelNoRehydrateUntil.set(id, Date.now() + Math.max(0, Number(ms) || MINIGAME_NO_REHYDRATE_MS));
}

function isMinigameRehydrateBlocked(channelId?) {
  const id = String(channelId || "").trim();
  const until = channelNoRehydrateUntil.get(id) || 0;
  if (until <= Date.now()) {
    if (channelNoRehydrateUntil.has(id)) channelNoRehydrateUntil.delete(id);
    return false;
  }
  return true;
}
const pendingGames = new Map();
const loopState = new WeakSet();
const loopIntervals = new WeakMap();
const expireSweepTimers = new WeakMap();
const hogwartsSpawnSchedulerByClient = new WeakMap();
const hogwartsSpawnPersistTimerByClient = new WeakMap();
const lastHogwartsSpawnRomeMinuteByChannel = new Map();
let hogwartsSpawnPersistClientRef = null;
let hogwartsSpawnShutdownPersistArmed = false;
let hogwartsPodiumAwardsShutdownFlushArmed = false;
const HOGWARTS_SPAWN_CHECKPOINT_INTERVAL_MS = 45_000;
const HOGWARTS_SPAWN_REQUIREMENT_MAX_WAIT_MS_DEFAULT = 5 * 60 * 1000;
const HOGWARTS_SPAWN_REQUIREMENT_RETRY_MS_DEFAULT = 2 * 60 * 1000;
let rotationDate = null;
let rotationQueue = [];
const recentMessages = new Map();
const standbyChannels = new Set();
const lastSentAtByChannel = new Map();
const lastNoParticipationEndAtByChannel = new Map();
const LAST_PLAYED_ROTATION_SIZE = 3;
const GAME_TYPE_COOLDOWN_MS = 30 * 60 * 1000;
const lastPlayedGameTypesByChannel = new Map();
const lastPlayedAtByChannelAndType = new Map();
const startingChannels = new Set();
const rolePingSentThisStart = new Set();
const ROLE_PING_RECENT_MS = 5 * 60 * 1000;
const MINIGAME_ROLE_PING_DOC_TYPE = SITE_DOCUMENT_TYPE.MINIGAME_ROLE_PING;
const recentQuestionKeysByChannel = new Map();
const hogwartsQuizDeckByChannel = new Map();
const hogwartsPodiumByChannel = new Map();
const hogwartsPodiumRegisterQueues = new Map();
const hogwartsPodiumPendingAwards = new Map();
const minigameChannelExclusiveQueues = new Map();
const hogwartsUnsortedWinnersByChannel = new Map();
const REWARD_CHANNEL_ID = IDs.channels.commands;
const MINIGAME_WIN_EMOJI = "<a:VC_Events:1482706144953897223>";
const MINIGAME_CORRECT_FALLBACK_EMOJI = "\u2714";
const MINIGAME_WRONG_EMOJI = "<a:VC_Cross:1482532424570376253>";
const BASILISK_BLOCK_EMOJI = "🪨";
const MINIGAME_COOLDOWN_EMOJI = "<a:VC_Loading:1482526818278969578>";
const OBSERVATION_TOWER_BRICK_EMOJI = "<a:VC_Flame:1482725674711126140>";
const OBSERVATION_TOWER_DEFAULT_TARGET_BRICKS = 50;
const OBSERVATION_TOWER_DEFAULT_MAX_PER_USER = 10;
const OBSERVATION_TOWER_DEFAULT_MIN_PLAYERS = 1;
const OBSERVATION_TOWER_DEFAULT_TIERS = Object.freeze([
  { weight: 1, targetBricks: 30, minPlayers: 3, housePoints: 50 },
  { weight: 1, targetBricks: 40, minPlayers: 4, housePoints: 100 },
  { weight: 1, targetBricks: 50, minPlayers: 5, housePoints: 150 },
]);
const DRIVING_QUIZ_USER_ANSWER_COOLDOWN_DEFAULT_MS = 5000;
const CANVAS_STYLE = { bgGradStart: "#2c2419", bgGradEnd: "#1a1510", cardFill: "rgba(247, 241, 232, 0.96)", cardStroke: "rgba(111, 78, 55, 0.5)", titleColor: "#8b7355", bodyColor: "#2c2419", padding: 44, radius: 22 };
const EXP_REWARDS = [{ exp: 500, roleId: IDs.roles.Rookie }, { exp: 1000, roleId: IDs.roles.Scout }, { exp: 1500, roleId: IDs.roles.Explorer }, { exp: 2500, roleId: IDs.roles.Tracker }, { exp: 5000, roleId: IDs.roles.Achiever }, { exp: 10000, roleId: IDs.roles.Vanguard }, { exp: 50000, roleId: IDs.roles.Mentor }, { exp: 100000, roleId: IDs.roles.Strategist },];
let cachedWords = null;
let cachedWordsAt = 0;
const WORD_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
let cachedCountries = null;
let cachedCountriesAt = 0;
const COUNTRY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
let cachedPlayers = null;
let cachedPlayersAt = 0;
const PLAYER_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
let cachedSongs = null;
let cachedSongsAt = 0;
const SONG_CACHE_TTL_MS = 15 * 60 * 1000;
let cachedCapitalQuestions = null;
let cachedCapitalQuestionsAt = 0;
const CAPITAL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
let cachedRegionCapitalQuestions = null;
let cachedRegionCapitalQuestionsAt = 0;
const REGION_CAPITAL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const regionImageCache = new Map();
let cachedTeams = null;
let cachedTeamsAt = 0;
const TEAM_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
let cachedLeaguePlayers = null;
let cachedLeaguePlayersAt = 0;
const LEAGUE_PLAYER_CACHE_TTL_MS = 3 * 60 * 60 * 1000;
let cachedSingers = null;
let cachedSingersAt = 0;
const SINGER_CACHE_TTL_MS = 3 * 60 * 60 * 1000;
const singerImageFallbackCache = new Map();
const SINGER_IMAGE_FALLBACK_TTL_MS = 24 * 60 * 60 * 1000;
let cachedAlbums = null;
let cachedAlbumsAt = 0;
const ALBUM_CACHE_TTL_MS = 3 * 60 * 60 * 1000;
const DEFAULT_FOOTBALL_LEAGUES = ["Italian Serie A", "English Premier League", "Spanish La Liga", "German Bundesliga", "French Ligue 1", "Dutch Eredivisie", "Belgian Pro League", "Portuguese Primeira Liga", "Saudi Pro League", "Turkish Super Lig", "Italian Serie B", "English League Championship", "American Major League Soccer",];
const TEAM_ITALIAN_MAP = getTeamItalianMap();
const DEFAULT_FAST_TYPE_API_URLS = ["https://api.quotable.io/random", "https://zenquotes.io/api/random",];
const DEFAULT_MAX_FAST_TYPE_PHRASE_LENGTH = 180;
const DEFAULT_DRIVING_QUIZ_API_URL = "https://opentdb.com/api.php?amount=5&category=28&encode=url3986";
const MYMEMORY_MAX_CHARS = 450;
const MYMEMORY_BASE = "https://api.mymemory.translated.net/get";
const ITALIAN_GK_DEFAULT_CATEGORIES = ["cultura-generale", "storia", "geografia", "scienza", "arte", "musica", "sport", "letteratura", "cinema", "tecnologia",];
const MINIGAME_FIXED_TIMEZONE = "Europe/Rome";
const HOGWARTS_SCROLL_MINIGAME_DEFAULT_START_DATE = "2026-06-15T14:00:00";
const HOGWARTS_MEMORY_MINIGAME_DEFAULT_START_DATE = "2026-06-29T14:00:00";
const HOGWARTS_CIPHER_MINIGAME_DEFAULT_START_DATE = "2026-07-13T14:00:00";
const HOGWARTS_TOWER_MINIGAME_DEFAULT_START_DATE = "2026-07-27T14:00:00";
const HOGWARTS_HOUSE_POINTS_DEFAULT_REWARD = 10;
const HOGWARTS_UNSORTED_HOUSE_POINTS_DEFAULT_REWARD = 25;
const HOGWARTS_PODIUM_SIZE = 3;
const HOGWARTS_PODIUM_HOUSE_POINTS = [10, 9, 8];
const HOGWARTS_PODIUM_BONUS_HALF_BASE_POINTS = [10, 8, 6];
const HOGWARTS_EVENT_SPAWN_MIN_INTERVAL_MS_DEFAULT = 12 * 60 * 1000;
const HOGWARTS_EVENT_SPAWN_MAX_INTERVAL_MS_DEFAULT = 18 * 60 * 1000;
const HOGWARTS_SPAWN_REQUIREMENT_POLL_MS = 15 * 1000;
const HOGWARTS_EVENT_BONUS_MINIGAME_TYPES_ALL = [
  "guessNumber", "guessWord", "guessFlag", "hogwartsGuessCharacter", "guessSong", "guessCapital", "guessReverseCapital",
  "guessRegionCapital", "fastType", "guessTeam", "guessSinger", "guessAlbum", "hangman",
  "mathExpression", "guessYear", "completeVerse", "guessEmoji",
  "completeProverb", "synonymAntonym", "guessCity", "treasureHunt",
];
const HOGWARTS_EVENT_BONUS_MINIGAME_TYPES_DEFAULT = HOGWARTS_EVENT_BONUS_MINIGAME_TYPES_ALL;
const HOGWARTS_EVENT_BONUS_HOUSE_POINTS_MULTIPLIER_DEFAULT = 0.5;
const TREASURE_HUNT_REACT_FALLBACKS = ["\u2693", "\u{1F48E}", "\u2728", "\u{1F3AF}", "\u{1F3C6}", "\u{1F4A1}", "\u2B50"];
const TREASURE_HUNT_REACT_SAFE_EXTRAS = ["\u2705", "\u{1F525}", "\u{1F3B5}"];
const HOGWARTS_HOUSE_MAP_CACHE_MS = 90 * 1000;
const hogwartsSortedHouseByUserCache = new Map();
const HOGWARTS_HOUSE_POINTS_DOC_OWNER_ID = "__event__";
const HOGWARTS_HOUSE_IDS = ["gryffindor", "hufflepuff", "ravenclaw", "slytherin"];
const { housePointPeriodKey: resolveHogwartsHousePointPeriod } = require("../../Utils/Web/hogwartsHousePointPeriods") as typeof import("../../Utils/Web/hogwartsHousePointPeriods");
const MINIGAME_FIRST_HOUR = 8;
const MINIGAME_LAST_HOUR = 23;
const MINIGAME_LAST_MINUTE = 45;
const MINIGAME_SLOT_MINUTES = [0, 15, 30, 45];
let lastMinigameSlotKey = null;
const MINIGAME_INTERVAL_SLOT_SLACK_MS = Math.max(0, Math.min(5 * 60 * 1000, Number(process.env.MINIGAME_INTERVAL_SLOT_SLACK_MS ?? 90_000)));
const MINIGAME_DEBUG = String(process.env.MINIGAME_DEBUG || "0") === "1";
const MINIGAME_SPAWN_LOG = String(process.env.MINIGAME_SPAWN_LOG || "0") === "1";
const HOGWARTS_SPAWN_BLOCKER_LOG_INTERVAL_MS = 60 * 1000;

function logMinigameSpawn(message?, data = null, level = "info") {
  if (!MINIGAME_SPAWN_LOG) return;
  const prefix = `[MINIGAMES-SPAWN] ${message}`;
  const logger = global.logger;
  if (!logger) return;
  if (level === "warn") {
    if (data != null && typeof data === "object") logger.warn?.(prefix, data);
    else logger.warn?.(prefix);
    return;
  }
  if (data != null && typeof data === "object") logger.info?.(prefix, data);
  else logger.info?.(prefix);
}

function shouldLogMinigameSpawnForCfg(cfg?, client?) {
  return Boolean(cfg?.hogwartsEventLive) && isHogwartsExclusiveMinigamesEnabled(client, cfg);
}

function logMaybeStartSkip(cfg?, client?, reason?, extra = null) {
  if (!shouldLogMinigameSpawnForCfg(cfg, client)) return;
  const payload = { channelId: cfg?.channelId || null, reason, ...(extra && typeof extra === "object" ? extra : {}) };
  logMinigameSpawn("maybeStart blocked", payload, "warn");
}

function isBenignDiscordMinigameError(err?) {
  const code = Number(err?.code ?? err?.rawError?.code);
  if ([10003, 10008, 10014, 10062, 50001, 50013, 90001].includes(code)) return true;
  const msg = String(err?.message || err?.rawError?.message || "");
  if (/unknown message/i.test(msg)) return true;
  if (/unknown emoji/i.test(msg)) return true;
  if (/missing (access|permissions)/i.test(msg)) return true;
  return false;
}

function warnMinigame(err?) {
  if (isBenignDiscordMinigameError(err)) return;
  const msg = err?.message || err?.response?.data || String(err);
  if (typeof msg === "string") {
    if (msg.includes("treasure_hunt_react_failed:decoy")) return;
  }
  const status = err?.response?.status;
  const url = err?.response?.config?.url || err?.config?.url;
  const is429 = status === 429 || (typeof msg === "string" && msg.includes("429"));
  const is403 = status === 403 || (typeof msg === "string" && msg.includes("403"));
  if (is403 && typeof url === "string" && /wikipedia\.org\/api\/rest_v1\/page\/summary/i.test(url)) return;
  if (is429 && typeof url === "string" && /thesportsdb\.com/i.test(url)) {
    noteSportsDb429(err);
    return;
  }
  const now = Date.now();
  if (is429 && now - last429LogAt < MINIGAME_429_THROTTLE_MS) return;
  if (is429) last429LogAt = now;
  if (is403 && now - last403LogAt < MINIGAME_403_THROTTLE_MS) return;
  if (is403) last403LogAt = now;
  const is503 = status === 503 || (typeof msg === "string" && /status code 503/i.test(msg));
  let host = null;
  try { host = url ? new URL(String(url)).host : null; } catch { host = null; }
  let logMsg = is403 ? `${msg} (API 403 Forbidden: chiave/permessi o IP bloccato)` : msg;
  if (is429) {
    logMsg = `429 rate limit${host ? ` (${host})` : ""}`;
  } else if (is503) {
    logMsg = `503 service unavailable${host ? ` (${host})` : ""}`;
  }
  if (is403 && url) logMsg += ` URL: ${typeof url === "string" ? url.replace(/\/api\/v1\/json\/[^/]+/, "/api/v1/json/***") : url}`;
  global.logger?.warn?.(`[minigameService] ${logMsg}`);
}

function noteSportsDb429(err?) {
  const now = Date.now();
  const retryAfterRaw = err?.response?.headers?.["retry-after"] || err?.response?.headers?.["Retry-After"];
  if (now - sportsDb429LastHitAt < SPORTSDB_429_BACKOFF_FLOOR_MS) sportsDb429Consecutive += 1;
  else sportsDb429Consecutive = 1;
  sportsDb429LastHitAt = now;
  let retryAfterMs = 0;
  if (typeof retryAfterRaw === "string" && retryAfterRaw.trim()) {
    const asNum = Number(retryAfterRaw);
    if (Number.isFinite(asNum) && asNum > 0) retryAfterMs = asNum * 1000;
    else {
      const t = Date.parse(retryAfterRaw);
      if (Number.isFinite(t)) retryAfterMs = Math.max(0, t - now);
    }
  }
  if (!retryAfterMs) {
    const expMultiplier = Math.min(8, 2 ** Math.max(0, sportsDb429Consecutive - 1));
    retryAfterMs = SPORTSDB_429_BACKOFF_FLOOR_MS * expMultiplier;
  }
  retryAfterMs = Math.min(SPORTSDB_429_BACKOFF_CAP_MS, Math.max(SPORTSDB_429_BACKOFF_FLOOR_MS, retryAfterMs));
  sportsDb429Until = Math.max(sportsDb429Until, now + retryAfterMs);
}

function isThesportsdb429(err?) {
  const msg = err?.message || err?.response?.data || String(err);
  const status = err?.response?.status;
  const url = err?.response?.config?.url || err?.config?.url;
  const is429 = status === 429 || (typeof msg === "string" && msg.includes("429"));
  return is429 && typeof url === "string" && /thesportsdb\.com/i.test(url);
}

function isSportsDbCoolingDown() {
  return Date.now() < sportsDb429Until;
}

/** Do not sleep on SportsDB 429 — skip the fetch and reuse cache. */
async function waitIfSportsDb429() {
  return;
}
let canvasModule = null;
let createCanvas = null;
let loadImage = null;
try {
  canvasModule = require("canvas");
  createCanvas = canvasModule.createCanvas;
  loadImage = canvasModule.loadImage;
} catch (error) {
  global.logger?.warn?.(
    "[minigameService] canvas non disponibile: modalità immagini disattivata",
    error?.message || error,
  );
  createCanvas = () => {
    throw new Error("canvas_non_disponibile");
  };
  loadImage = async () => {
    throw new Error("canvas_non_disponibile");
  };
}

function getTeamItalianMap() {
  const k = (s?) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const entries = [
    { keys: ["olympique marseille", "marseille"], display: "Marsiglia", extra: ["OM"] },
    { keys: ["juventus"], display: "Juventus", extra: ["Juve", "Juve FC", "Bianconeri"] },
    { keys: ["inter", "inter milan", "internazionale"], display: "Inter", extra: ["Internazionale", "Nerazzurri"] },
    { keys: ["ac milan", "milan"], display: "Milan", extra: ["AC Milan", "Rossoneri"] },
    { keys: ["napoli", "ssc napoli", "naples"], display: "Napoli", extra: ["Partenopei"] },
    { keys: ["roma", "as roma"], display: "Roma", extra: ["AS Roma", "Giallorossi"] },
    { keys: ["lazio", "ss lazio"], display: "Lazio", extra: ["SS Lazio", "Biancocelesti"] },
    { keys: ["atalanta", "atalanta bc", "atalanta bergamasca calcio"], display: "Atalanta", extra: ["Dea", "Nerazzurri"] },
    { keys: ["fiorentina", "acf fiorentina"], display: "Fiorentina", extra: ["Viola", "ACF Fiorentina"] },
    { keys: ["bologna", "bologna fc"], display: "Bologna", extra: ["Bologna FC", "Felsinei"] },
    { keys: ["torino", "torino fc"], display: "Torino", extra: ["Torino FC", "Granata"] },
    { keys: ["genoa", "genoa cfc"], display: "Genoa", extra: ["Genoa CFC", "Grifone"] },
    { keys: ["sampdoria", "uc sampdoria"], display: "Sampdoria", extra: ["Samp", "UC Sampdoria"] },
    { keys: ["cagliari", "cagliari calcio"], display: "Cagliari", extra: ["Rossoblù"] },
    { keys: ["udinese", "udinese calcio"], display: "Udinese", extra: ["Udinese Calcio"] },
    { keys: ["sassuolo", "us sassuolo"], display: "Sassuolo", extra: ["US Sassuolo"] },
    { keys: ["empoli", "empoli fc"], display: "Empoli", extra: ["Empoli FC"] },
    { keys: ["verona", "hellas verona", "verona fc"], display: "Verona", extra: ["Hellas Verona", "Gialloblù"] },
    { keys: ["lecce", "us lecce"], display: "Lecce", extra: ["US Lecce", "Giallorossi"] },
    { keys: ["frosinone", "frosinone calcio"], display: "Frosinone", extra: ["Frosinone Calcio"] },
    { keys: ["salernitana", "us salernitana"], display: "Salernitana", extra: ["US Salernitana"] },
    { keys: ["monza", "ac monza"], display: "Monza", extra: ["AC Monza", "Brianzoli"] },
    { keys: ["real madrid", "real madrid cf"], display: "Real Madrid", extra: ["Madrid", "Real", "Merengues"] },
    { keys: ["barcelona", "fc barcelona", "fc barcelona b"], display: "Barcellona", extra: ["Barcelona", "Barça", "Barca", "Blaugrana"] },
    { keys: ["atletico madrid", "atlético madrid", "club atletico de madrid"], display: "Atletico Madrid", extra: ["Atlético", "Atletico", "Colchoneros"] },
    { keys: ["sevilla", "sevilla fc"], display: "Siviglia", extra: ["Sevilla", "Sevilla FC"] },
    { keys: ["real betis", "real betis balompie"], display: "Real Betis", extra: ["Betis", "Real Betis"] },
    { keys: ["villarreal", "villarreal cf"], display: "Villarreal", extra: ["Villarreal CF", "Submarino Amarillo"] },
    { keys: ["valencia", "valencia cf"], display: "Valencia", extra: ["Valencia CF", "Che"] },
    { keys: ["real sociedad", "real sociedad de futbol"], display: "Real Sociedad", extra: ["Real Sociedad", "La Real"] },
    { keys: ["athletic bilbao", "athletic club", "athletic club bilbao"], display: "Athletic Bilbao", extra: ["Athletic", "Bilbao", "Leones"] },
    { keys: ["bayern munich", "fc bayern munich", "fc bayern münchen"], display: "Bayern Monaco", extra: ["Bayern", "Bayern Munich", "FC Bayern"] },
    { keys: ["borussia dortmund", "bv borussia dortmund"], display: "Borussia Dortmund", extra: ["Dortmund", "BVB", "Borussia"] },
    { keys: ["rb leipzig", "rasenballsport leipzig"], display: "RB Lipsia", extra: ["Leipzig", "RB Leipzig"] },
    { keys: ["bayer leverkusen", "bayer 04 leverkusen"], display: "Bayer Leverkusen", extra: ["Leverkusen", "Bayer"] },
    { keys: ["eintracht frankfurt", "eintracht frankfurt e v"], display: "Eintracht Francoforte", extra: ["Eintracht Frankfurt", "Frankfurt", "SGE"] },
    { keys: ["vfl wolfsburg", "vfl wolfsburg"], display: "Wolfsburg", extra: ["VfL Wolfsburg"] },
    { keys: ["paris saint germain", "paris saint-germain", "paris sg", "psg"], display: "Paris Saint-Germain", extra: ["PSG", "Paris SG", "Parigi"] },
    { keys: ["olympique lyonnais", "lyon"], display: "Olympique Lione", extra: ["Lione", "OL", "Lyon"] },
    { keys: ["lille", "lille osc", "losc lille"], display: "Lille", extra: ["Lille OSC", "LOSC"] },
    { keys: ["monaco", "as monaco", "as monaco fc"], display: "Monaco", extra: ["AS Monaco", "Monaco FC"] },
    { keys: ["rennes", "stade rennais", "stade rennais fc 1901"], display: "Rennes", extra: ["Stade Rennes", "Stade Rennais"] },
    { keys: ["manchester united", "manchester united fc"], display: "Manchester United", extra: ["United", "Man United", "Man Utd", "Red Devils"] },
    { keys: ["manchester city", "manchester city fc"], display: "Manchester City", extra: ["City", "Man City", "Citizens"] },
    { keys: ["liverpool", "liverpool fc"], display: "Liverpool", extra: ["Liverpool FC", "Reds"] },
    { keys: ["arsenal", "arsenal fc"], display: "Arsenal", extra: ["Arsenal FC", "Gunners"] },
    { keys: ["chelsea", "chelsea fc"], display: "Chelsea", extra: ["Chelsea FC", "Blues"] },
    { keys: ["tottenham hotspur", "tottenham"], display: "Tottenham", extra: ["Spurs", "Tottenham Hotspur"] },
    { keys: ["newcastle united", "newcastle united fc"], display: "Newcastle", extra: ["Newcastle United", "Magpies"] },
    { keys: ["west ham united", "west ham"], display: "West Ham", extra: ["West Ham United", "Hammers"] },
    { keys: ["brighton and hove albion", "brighton"], display: "Brighton", extra: ["Brighton & Hove Albion", "Seagulls"] },
    { keys: ["aston villa", "aston villa fc"], display: "Aston Villa", extra: ["Villa", "Villans"] },
    { keys: ["crystal palace", "crystal palace fc"], display: "Crystal Palace", extra: ["Palace", "Eagles"] },
    { keys: ["fulham", "fulham fc"], display: "Fulham", extra: ["Fulham FC"] },
    { keys: ["wolverhampton wanderers", "wolves", "wolverhampton"], display: "Wolverhampton", extra: ["Wolves", "Wanderers"] },
    { keys: ["everton", "everton fc"], display: "Everton", extra: ["Everton FC", "Toffees"] },
    { keys: ["nottingham forest", "nottingham forest fc"], display: "Nottingham Forest", extra: ["Forest", "Nott'm Forest"] },
    { keys: ["brentford", "brentford fc"], display: "Brentford", extra: ["Brentford FC", "Bees"] },
    { keys: ["ajax", "afc ajax", "ajax amsterdam"], display: "Ajax", extra: ["AFC Ajax", "Ajax Amsterdam"] },
    { keys: ["psv", "psv eindhoven"], display: "PSV Eindhoven", extra: ["PSV", "Eindhoven"] },
    { keys: ["feyenoord", "feyenoord rotterdam"], display: "Feyenoord", extra: ["Feyenoord Rotterdam"] },
    { keys: ["benfica", "sl benfica", "sport lisboa e benfica"], display: "Benfica", extra: ["SL Benfica", "Águias"] },
    { keys: ["porto", "fc porto", "fc porto porto"], display: "Porto", extra: ["FC Porto", "Dragões"] },
    { keys: ["sporting lisbon", "sporting cp", "sporting clube de portugal"], display: "Sporting Lisbona", extra: ["Sporting", "Sporting CP", "Leões"] },
    { keys: ["celtic", "celtic fc"], display: "Celtic", extra: ["Celtic FC", "Bhoys"] },
    { keys: ["rangers", "rangers fc"], display: "Rangers", extra: ["Rangers FC"] },
    { keys: ["galatasaray", "galatasaray sk"], display: "Galatasaray", extra: ["Galatasaray SK", "Cim-Bom"] },
    { keys: ["fenerbahce", "fenerbahçe", "fenerbahce sk"], display: "Fenerbahçe", extra: ["Fenerbahce", "Fener"] },
    { keys: ["besiktas", "beşiktaş", "besiktas jk"], display: "Beşiktaş", extra: ["Besiktas", "Kara Kartallar"] },
    { keys: ["al nassr", "al-nassr"], display: "Al-Nassr", extra: ["Al Nassr", "Nassr"] },
    { keys: ["al hilal", "al-hilal", "al hilal saud fc"], display: "Al-Hilal", extra: ["Al Hilal", "Hilal"] },
  ];
  const map = new Map();
  for (const { keys, display, extra } of entries) {
    const aliasList = Array.isArray(extra) ? extra : [];
    for (const key of keys) {
      const n = k(key);
      if (n) map.set(n, { display, extraAliases: aliasList });
    }
  }
  return map;
}

function logMinigameDebug(message?, data = null) {
  if (!MINIGAME_DEBUG) return;
  if (data && typeof data === "object") {
    global.logger?.info?.(`[MINIGAMES][DEBUG] ${message}`, data);
    return;
  }
  global.logger?.info?.(`[MINIGAMES][DEBUG] ${message}`);
}

function logTreasureHuntReactDebug(message?, data = null) {
  logMinigameDebug(`TreasureHunt ${message}`, data);
}

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

function getMinigameTimeZone(client?) {
  return client?.config?.minigames?.timeZone || MINIGAME_FIXED_TIMEZONE;
}

function getMinigameRomeTime(date?, client?) {
  const tz = client ? (client?.config?.minigames?.timeZone || MINIGAME_FIXED_TIMEZONE) : MINIGAME_FIXED_TIMEZONE;
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const map: Record<string, any> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function isMinigameFixedSlot(rome?, client = null) {
  const { hour, minute } = rome;
  if (!MINIGAME_SLOT_MINUTES.includes(minute)) return false;
  if (client && isHogwartsEventLiveForMinigames(client)) return false;
  if (hour < MINIGAME_FIRST_HOUR || hour > MINIGAME_LAST_HOUR) return false;
  if (hour === MINIGAME_LAST_HOUR && minute > MINIGAME_LAST_MINUTE) return false;
  return true;
}

function minigameSlotKeyFromRome(rome?) {
  return `${rome.year}-${String(rome.month).padStart(2, "0")}-${String(rome.day).padStart(2, "0")}_${rome.hour}_${rome.minute}`;
}

function computeMsUntilNextRomeSlotStart(client?) {
  const now = Date.now();
  const maxAhead = 4 * 60 * 60 * 1000;
  for (let ms = 0; ms <= maxAhead; ms += 1000) {
    const t = new Date(now + ms);
    const rome = getMinigameRomeTime(t, client);
    if (rome.second !== 0) continue;
    if (!MINIGAME_SLOT_MINUTES.includes(rome.minute)) continue;
    if (!isMinigameFixedSlot(rome, client)) continue;
    const slotKey = minigameSlotKeyFromRome(rome);
    if (slotKey === lastMinigameSlotKey) continue;
    return ms;
  }
  return 60_000;
}

const MINIGAME_QUESTION_BURROBIRRA = Object.freeze({ burrobirra: "question" });

function normalizeMinigameSendOptions(options?) {
  if (options && typeof options === "object") {
    return {
      seed: String(options.seed || "minigame"),
      burrobirra: options.burrobirra === "question" ? "question" : "off",
    };
  }
  const seed = String(options || "minigame");
  if (seed.endsWith(":question")) {
    return { seed: seed.slice(0, -":question".length) || "minigame", burrobirra: "question" };
  }
  return { seed, burrobirra: "off" };
}

function isBurrobirraActiveForChannel(client?, channelId?) {
  const chId = String(channelId || "").trim();
  if (!client || !chId) return isBurrobirraActive(client);
  try {
    const { getHouseIdForChannel } = require("../Community/hogwartsHouseChannelMinigameService") as typeof import("../Community/hogwartsHouseChannelMinigameService");
    if (getHouseIdForChannel(chId)) {
      const { isHouseBurrobirraLiveForChannel } = require("./hogwartsHouseBurrobirraEffectService") as typeof import("./hogwartsHouseBurrobirraEffectService");
      return isHouseBurrobirraLiveForChannel(client, chId);
    }
  } catch (_) {}
  return isBurrobirraActive(client);
}

function applyBurrobirraStrongDurationMs(client?, channelId?, durationMs?) {
  return Math.max(1, Number(durationMs) || 60000);
}

async function refreshBurrobirraCaches(client?) {
  if (!client) return;
  await refreshBurrobirraActiveCache(client).catch(() => false);
  try {
    const { refreshHouseBurrobirraCache } = require("./hogwartsHouseBurrobirraEffectService") as typeof import("./hogwartsHouseBurrobirraEffectService");
    await refreshHouseBurrobirraCache(client).catch(() => false);
  } catch (_) {}
}

function clearRolePingSentThisStart(channelId?) {
  const chId = String(channelId || "").trim();
  if (chId) rolePingSentThisStart.delete(chId);
}

async function hasRecentPersistedRolePing(channelId?) {
  const chId = String(channelId || "").trim();
  if (!chId || mongoose.connection?.readyState !== 1) return false;
  const doc = await SiteDocument.findOne({
    docType: MINIGAME_ROLE_PING_DOC_TYPE,
    dedupeKey: chId,
  })
    .select("rawWebhook cooldownUntil updatedAt")
    .lean()
    .catch(() => null);
  if (!doc) return false;
  const at = Math.floor(Number(doc?.rawWebhook?.at) || 0)
    || Math.floor(Number(doc?.cooldownUntil ? new Date(doc.cooldownUntil).getTime() - ROLE_PING_RECENT_MS : 0) || 0)
    || Math.floor(Number(doc?.updatedAt ? new Date(doc.updatedAt).getTime() : 0) || 0);
  if (!at || Date.now() - at > ROLE_PING_RECENT_MS) {
    await SiteDocument.deleteMany({ docType: MINIGAME_ROLE_PING_DOC_TYPE, dedupeKey: chId }).catch(() => null);
    return false;
  }
  return true;
}

async function persistRolePingSent(channelId?, guildId = "") {
  const chId = String(channelId || "").trim();
  if (!chId || mongoose.connection?.readyState !== 1) return;
  const now = Date.now();
  await SiteDocument.findOneAndUpdate(
    { docType: MINIGAME_ROLE_PING_DOC_TYPE, dedupeKey: chId },
    {
      $set: {
        guildId: String(guildId || IDs.guilds?.main || "").trim(),
        status: "active",
        cooldownUntil: new Date(now + ROLE_PING_RECENT_MS),
        rawWebhook: { at: now },
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
}

async function clearPersistedRolePing(channelId?) {
  const chId = String(channelId || "").trim();
  if (!chId || mongoose.connection?.readyState !== 1) return;
  await SiteDocument.deleteMany({ docType: MINIGAME_ROLE_PING_DOC_TYPE, dedupeKey: chId }).catch(() => null);
}

async function sendMinigameMessage(channel?, payload?, options: any = "minigame") {
  if (!channel?.send) return null;
  const client = channel.client;
  const opts = normalizeMinigameSendOptions(options);
  try {
    if (client && opts.burrobirra === "question") {
      await refreshBurrobirraCaches(client);
    }
    const chId = String(channel.id || "").trim();
    const game = chId ? activeGames.get(chId) : null;
    let applyBurrobirra = false;
    if (opts.burrobirra === "question") {
      if (game && typeof game === "object") {
        applyBurrobirra = Object.prototype.hasOwnProperty.call(game, "burrobirraApplies")
          ? Boolean(game.burrobirraApplies)
          : isBurrobirraActiveForChannel(client, chId);
      } else {
        applyBurrobirra = isBurrobirraActiveForChannel(client, chId);
      }
    }
    const processed = client && applyBurrobirra
      ? await applyBurrobirraToPayload(payload, opts.seed, { mode: "question" })
      : payload;
    const outgoing =
      processed && typeof processed === "object" && !Array.isArray(processed)
        ? applyDefaultFooterToEmbeds(processed, channel.guild)
        : processed;
    return await channel.send(outgoing);
  } catch (_) {
    return null;
  }
}

function distortPromptIfBurrobirra(client?, text?, seed = "", enabled = false) {
  if (!enabled || !client || text == null || text === "") return text;
  return distortMinigameText(String(text), seed);
}

function getConfig(client?) {
  const cfg = client?.config?.minigames || null;
  if (!cfg) return null;
  const hogwartsEventLive = isHogwartsEventLiveForMinigames(client);
  const halloweenEventLive = !hogwartsEventLive && isHalloweenEventLiveForMinigames(client);
  const halloweenExclusiveDuringEvent = isHalloweenExclusiveMinigamesEnabled(client, cfg);
  const hogwartsExclusiveDuringEvent = cfg.hogwartsExclusiveDuringEvent !== false;
  const hogwartsQuizRaw = cfg.hogwartsQuiz;
  const findScrollRaw = cfg.findScroll;
  const hogwartsMemoryRaw = cfg.hogwartsMemoryEmoji;
  const hogwartsCipherRaw = cfg.hogwartsCipher;
  const hogwartsTowerRaw = cfg.hogwartsObservationTower;
  const hogwartsQuizCfg = hogwartsQuizRaw === false
    ? false
    : {
        ...(hogwartsQuizRaw && typeof hogwartsQuizRaw === "object" ? hogwartsQuizRaw : {}),
        eventLive: hogwartsEventLive,
      };
  const findScrollCfg = findScrollRaw === false
    ? false
    : {
        ...(findScrollRaw && typeof findScrollRaw === "object" ? findScrollRaw : {}),
        eventLive: hogwartsEventLive,
        unlocked: isHogwartsScrollMinigameUnlocked(client),
      };
  const hogwartsMemoryCfg = hogwartsMemoryRaw === false
    ? false
    : {
        ...(hogwartsMemoryRaw && typeof hogwartsMemoryRaw === "object" ? hogwartsMemoryRaw : {}),
        eventLive: hogwartsEventLive,
        unlocked: isHogwartsMemoryMinigameUnlocked(client),
      };
  const hogwartsCipherCfg = hogwartsCipherRaw === false
    ? false
    : {
        ...(hogwartsCipherRaw && typeof hogwartsCipherRaw === "object" ? hogwartsCipherRaw : {}),
        eventLive: hogwartsEventLive,
        unlocked: isHogwartsCipherMinigameUnlocked(client),
      };
  const hogwartsTowerCfg = hogwartsTowerRaw === false
    ? false
    : {
        ...(hogwartsTowerRaw && typeof hogwartsTowerRaw === "object" ? hogwartsTowerRaw : {}),
        eventLive: hogwartsEventLive,
        unlocked: isHogwartsTowerMinigameUnlocked(client),
      };
  const out = {
    ...cfg,
    hogwartsEventLive,
    hogwartsExclusiveDuringEvent,
    halloweenEventLive,
    halloweenExclusiveDuringEvent,
    hogwartsQuiz: hogwartsQuizCfg,
    findScroll: findScrollCfg,
    hogwartsMemoryEmoji: hogwartsMemoryCfg,
    hogwartsCipher: hogwartsCipherCfg,
    hogwartsObservationTower: hogwartsTowerCfg,
    channelId: IDs.channels.chat,
    roleId: IDs.roles.Minigames,
    findBot: {
      ...(cfg.findBot || {}),
      requiredRoleId: IDs.roles.Member,
    },
    findBotVoice: {
      ...(cfg.findBotVoice || {}),
      requiredRoleId: IDs.roles.Member,
      excludedChannelIds: mergeFindBotVoiceExcludedChannelIds(
        client,
        cfg.findBotVoice?.excludedChannelIds || cfg.findBot?.excludedChannelIds || [],
      ),
    },
  };
  if (hogwartsEventLive && hogwartsExclusiveDuringEvent) {
    purgeNonHogwartsMinigameSchedulingState(out.channelId, out);
    const active = out.channelId ? activeGames.get(out.channelId) : null;
    if (active?.type && !isHogwartsEventMinigameType(active.type, out)) {
      if (active.timeout) clearTimeout(active.timeout);
      if (active.hintTimeout) clearTimeout(active.hintTimeout);
      if (active.revealTimeout) clearTimeout(active.revealTimeout);
      activeGames.delete(out.channelId);
    }
  } else if (halloweenEventLive && halloweenExclusiveDuringEvent) {
    const active = out.channelId ? activeGames.get(out.channelId) : null;
    if (active?.type && !isHalloweenMinigameType(active.type)) {
      if (active.timeout) clearTimeout(active.timeout);
      if (active.hintTimeout) clearTimeout(active.hintTimeout);
      if (active.revealTimeout) clearTimeout(active.revealTimeout);
      activeGames.delete(out.channelId);
    }
    if (rotationQueue.some((type?) => !isHalloweenMinigameType(type))) {
      rotationQueue = [];
    }
  }
  return out;
}

function isHogwartsEventLiveForMinigames(client?, nowMs = Date.now()) {
  try {
    const { isHogwartsRuntimeDisabled } = require("../../Utils/Web/hogwartsRuntimeKillSwitch") as typeof import("../../Utils/Web/hogwartsRuntimeKillSwitch");
    if (isHogwartsRuntimeDisabled(client)) return false;
  } catch (_) {}
  const eventCfg = resolveHogwartsEventConfig(client);
  return Boolean(isEventWindowOpen(eventCfg, nowMs)?.open);
}

function isHogwartsExclusiveMinigamesEnabled(client?, cfg?) {
  const raw = client?.config?.minigames?.hogwartsExclusiveDuringEvent;
  if (raw === false) return false;
  if (raw === true) return true;
  return cfg?.hogwartsExclusiveDuringEvent !== false;
}

const HOGWARTS_EVENT_MINIGAME_ROLE_ID = String(
  IDs.roles.HogwartsEventParticipant || "1507000390493798511",
).trim();

function buildMinigameRolePingContent(cfg?, extraRoleId?) {
  const roleIds = [];
  const seen = new Set();
  const push = (id?) => {
    const rid = String(id || "").trim();
    if (!rid || seen.has(rid)) return;
    seen.add(rid);
    roleIds.push(rid);
  };
  push(extraRoleId || cfg?.roleId);
  if (cfg?.hogwartsEventLive && !cfg?.hogwartsHouseChannelSpawn) push(HOGWARTS_EVENT_MINIGAME_ROLE_ID);
  if (!roleIds.length) return "";
  return roleIds.map((id?) => `<@&${id}>`).join(" ");
}

async function sendMinigameRolePing(channel?, cfg?, extraRoleId?) {
  const content = buildMinigameRolePingContent(cfg, extraRoleId);
  const chId = String(channel?.id || "").trim();
  if (!content || !chId || typeof channel?.send !== "function") return;
      if (rolePingSentThisStart.has(chId)) return;
  if (await hasRecentPersistedRolePing(chId)) {
    rolePingSentThisStart.add(chId);
    return;
  }
  rolePingSentThisStart.add(chId);
  try {
    await channel.send({ content });
    const guildId = String(cfg?.guildId || channel?.guild?.id || "").trim();
    await persistRolePingSent(chId, guildId);
  } catch (_) {
    rolePingSentThisStart.delete(chId);
  }
}

function purgeNonHogwartsMinigameSchedulingState(channelId?, cfg = null) {
  const isAllowed = (type?) => isHogwartsEventMinigameType(type, cfg);
  const hasBadQueue = rotationQueue.some((type?) => !isAllowed(type));
  if (hasBadQueue) {
    rotationQueue = [];
    rotationDate = "";
  }
  if (channelId) {
    const pending = pendingGames.get(channelId);
    if (pending?.type && !isAllowed(pending.type)) pendingGames.delete(channelId);
    const lastTypes = lastPlayedGameTypesByChannel.get(channelId) || [];
    const filtered = lastTypes.filter((type?) => isAllowed(type));
    if (filtered.length !== lastTypes.length) lastPlayedGameTypesByChannel.set(channelId, filtered);
  }
}

function parseMinigameDateStartMs(dateValue?) {
  const date = String(dateValue || "").trim();
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? `${date}T14:00:00`
    : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(date)
      ? date
      : "";
  if (!normalized) return null;
  const ms = new Date(normalized).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function isHogwartsScrollMinigameUnlocked(client?, nowMs = Date.now()) {
  if (!isHogwartsEventLiveForMinigames(client, nowMs)) return false;
  const raw = client?.config?.minigames?.findScroll;
  const cfg = raw && typeof raw === "object" ? raw : {};
  const startMs = parseMinigameDateStartMs(cfg.startDate || HOGWARTS_SCROLL_MINIGAME_DEFAULT_START_DATE);
  return Number.isFinite(startMs) && Number(nowMs || Date.now()) >= startMs;
}

function isHogwartsMemoryMinigameUnlocked(client?, nowMs = Date.now()) {
  if (!isHogwartsEventLiveForMinigames(client, nowMs)) return false;
  const raw = client?.config?.minigames?.hogwartsMemoryEmoji;
  const cfg = raw && typeof raw === "object" ? raw : {};
  const startMs = parseMinigameDateStartMs(cfg.startDate || HOGWARTS_MEMORY_MINIGAME_DEFAULT_START_DATE);
  return Number.isFinite(startMs) && Number(nowMs || Date.now()) >= startMs;
}

function isHogwartsCipherMinigameUnlocked(client?, nowMs = Date.now()) {
  if (!isHogwartsEventLiveForMinigames(client, nowMs)) return false;
  const raw = client?.config?.minigames?.hogwartsCipher;
  const cfg = raw && typeof raw === "object" ? raw : {};
  const startMs = parseMinigameDateStartMs(cfg.startDate || HOGWARTS_CIPHER_MINIGAME_DEFAULT_START_DATE);
  return Number.isFinite(startMs) && Number(nowMs || Date.now()) >= startMs;
}

function isHouseChannelTowerMinigameUnlocked(client?, nowMs = Date.now()) {
  if (!isHogwartsEventLiveForMinigames(client, nowMs)) return false;
  const houseRaw = client?.config?.minigames?.hogwartsHouseChannelMinigames;
  const houseCfg = houseRaw && typeof houseRaw === "object" ? houseRaw : {};
  if (houseCfg.towerEnabled === false) return false;
  const startDate = String(houseCfg.towerStartDate || "").trim();
  if (startDate) {
    const startMs = parseMinigameDateStartMs(startDate);
    return Number.isFinite(startMs) && nowMs >= startMs;
  }
  const eventCfg = resolveHogwartsEventConfig(client);
  const eventStart = Number(eventCfg?.sortingStartMs ?? eventCfg?.startMs);
  return Number.isFinite(eventStart) && nowMs >= eventStart;
}

function isHogwartsTowerMinigameUnlocked(client?, nowMs = Date.now(), options = null) {
  if (!isHogwartsEventLiveForMinigames(client, nowMs)) return false;
  if (options?.houseChannelSpawn) return isHouseChannelTowerMinigameUnlocked(client, nowMs);
  const raw = client?.config?.minigames?.hogwartsObservationTower;
  const cfg = raw && typeof raw === "object" ? raw : {};
  const startMs = parseMinigameDateStartMs(cfg.startDate || HOGWARTS_TOWER_MINIGAME_DEFAULT_START_DATE);
  return Number.isFinite(startMs) && Number(nowMs || Date.now()) >= startMs;
}

function getChannelSafe(client?, channelId?) {
  if (!channelId) return null;
  return client.channels.cache.get(channelId) || null;
}

async function getChannelCached(client?, channelId?) {
  return getChannelSafe(client, channelId) ||
    (await getClientChannelCached(client, channelId, { ttlMs: 30_000 }));
}

function getActivityWindowMs(cfg?) {
  return Math.max(60 * 1000, Number(cfg?.activityWindowMs || 15 * 60 * 1000));
}

function getMinMessages(cfg?) {
  return Math.max(1, Number(cfg?.minMessages ?? 1));
}

function getActivityThresholdCfg(cfg?) {
  const at = cfg?.activityThreshold;
  return at && typeof at === "object" ? at : {};
}

function normalizeActivityEntry(raw?) {
  if (typeof raw === "number" && Number.isFinite(raw)) return { t: raw, u: null };
  if (raw && typeof raw === "object" && Number.isFinite(Number(raw.t))) {
    const uid = raw.u != null && String(raw.u).trim() ? String(raw.u).trim() : null;
    return { t: Number(raw.t), u: uid };
  }
  return null;
}

function getRecentActivityStats(activityScopeKey?, windowMs?) {
  if (!activityScopeKey) return { count: 0, uniqueUsers: 0, avgPerUser: 0 };
  const safeWindowMs = Math.max(60 * 1000, Number(windowMs || 30 * 60 * 1000));
  const now = Date.now();
  const list = recentMessages.get(activityScopeKey) || [];
  const cutoff = now - safeWindowMs;
  const trimmed = [];
  for (const raw of list) {
    const e = normalizeActivityEntry(raw);
    if (!e || e.t < cutoff) continue;
    trimmed.push(e);
  }
  recentMessages.set(activityScopeKey, trimmed);
  const count = trimmed.length;
  const set = new Set();
  let unknown = 0;
  for (const e of trimmed) {
    if (e.u) set.add(e.u);
    else unknown += 1;
  }
  let uniqueUsers = set.size;
  if (unknown > 0) {
    uniqueUsers += Math.max(0, Math.min(unknown, Math.ceil(unknown / 4)));
  }
  uniqueUsers = Math.max(1, Math.min(count, uniqueUsers));
  const avgPerUser = count / uniqueUsers;
  return { count, uniqueUsers, avgPerUser };
}

function getTimeFactorAdaptive(at?, client?) {
  const h = getMinigameRomeTime(new Date(), client).hour;
  const nightStart = Number(at.nightHourStart ?? 2);
  const nightEnd = Number(at.nightHourEnd ?? 7);
  const inNight =
    nightStart <= nightEnd
      ? h >= nightStart && h < nightEnd
      : h >= nightStart || h < nightEnd;
  if (inNight) return Math.max(0.45, Number(at.nightFactor ?? 0.72));
  const peakStart = Number(at.peakHourStart ?? 18);
  const peakEnd = Number(at.peakHourEnd ?? 22);
  if (h >= peakStart && h <= peakEnd) return Math.max(0.5, Number(at.peakFactor ?? 1.2));
  return Math.max(0.5, Number(at.defaultTimeFactor ?? 1));
}

function getMemberFactorAdaptive(at?, client?, cfg?) {
  const ref = Math.max(50, Number(at.memberReference ?? 400));
  const minF = Number(at.memberFactorMin ?? 0.78);
  const maxF = Number(at.memberFactorMax ?? 1.38);
  const exp = Number(at.memberExponent ?? 0.28);
  const gid = String(cfg?.guildId || "").trim();
  const g = gid && client?.guilds?.cache?.get(gid);
  const members = Math.max(30, Number(g?.approximateMemberCount || g?.memberCount || ref));
  const raw = (members / ref) ** exp;
  return Math.min(maxF, Math.max(minF, raw));
}

function getSpamPenaltyMultiplier(at?, stats?) {
  const above = Math.max(1.5, Number(at.spamAvgMessagesPerUser ?? 4));
  if (stats.avgPerUser <= above) return 1;
  const per = Number(at.spamPenaltyPerExcess ?? 0.065);
  const cap = Number(at.spamPenaltyCap ?? 0.42);
  return 1 + Math.min(cap, (stats.avgPerUser - above) * per);
}

function computeAdaptiveMinMessages(cfg?, client?, stats?) {
  const at = getActivityThresholdCfg(cfg);
  if (at.enabled === false) return getMinMessages(cfg);
  const base = getMinMessages(cfg);
  const nRaw =
    base *
    getTimeFactorAdaptive(at, client) *
    getMemberFactorAdaptive(at, client, cfg) *
    getSpamPenaltyMultiplier(at, stats);
  const lo = Math.max(1, Math.floor(Number(at.hardMin ?? 12)));
  const hi = Math.max(lo, Math.floor(Number(at.hardMax ?? 120)));
  return Math.min(hi, Math.max(lo, Math.round(nRaw)));
}

function passesUniqueAuthorsGate(cfg?, stats?, effectiveMin?) {
  const at = getActivityThresholdCfg(cfg);
  if (at.enabled === false) return true;
  const minUnique = Math.max(
    2,
    Math.min(14, Math.ceil(effectiveMin / Math.max(4, Number(at.minUniqueDivisor ?? 12)))),
  );
  const bypassMultiple = Math.max(1.2, Number(at.uniqueBypassMultiple ?? 1.65));
  if (stats.uniqueUsers >= minUnique) return true;
  if (stats.count >= effectiveMin * bypassMultiple) return true;
  return false;
}

function isReadyByActivity(cfg?, client?) {
  const activityScopeKey = getActivityScopeKey(cfg);
  if (!activityScopeKey) return false;
  const windowMs = getActivityWindowMs(cfg);
  const stats = getRecentActivityStats(activityScopeKey, windowMs);
  const effectiveMin = computeAdaptiveMinMessages(cfg, client, stats);
  if (stats.count < effectiveMin) return false;
  if (!passesUniqueAuthorsGate(cfg, stats, effectiveMin)) return false;
  return true;
}

const FRESH_SPAWN_ACTIVITY_WINDOW_MS_DEFAULT = 5 * 60 * 1000;
const FRESH_SPAWN_MIN_MESSAGES_DEFAULT = 5;

function getFreshSpawnActivityGate(cfg?) {
  const raw = cfg?.spawnFreshActivity;
  const o = raw && typeof raw === "object" ? raw : {};
  if (o.enabled === false) return null;
  return {
    windowMs: Math.max(60_000, Math.floor(Number(o.windowMs) || FRESH_SPAWN_ACTIVITY_WINDOW_MS_DEFAULT)),
    minMessages: Math.max(1, Math.floor(Number(o.minMessages) || FRESH_SPAWN_MIN_MESSAGES_DEFAULT)),
  };
}

function assessFreshSpawnChatActivity(cfg?) {
  const gate = getFreshSpawnActivityGate(cfg);
  if (!gate) return { ok: true, skipped: true };
  const key = getActivityScopeKey(cfg);
  if (!key) return { ok: false, skipped: false, count: 0, ...gate, uniqueUsers: 0 };
  const stats = getRecentActivityStats(key, gate.windowMs);
  return {
    ok: stats.count >= gate.minMessages,
    skipped: false,
    count: stats.count,
    uniqueUsers: stats.uniqueUsers,
    minMessages: gate.minMessages,
    windowMs: gate.windowMs,
  };
}

function getActivityScopeKey(cfg?) {
  return String(cfg?.channelId || "");
}

function getFailsafeMs(cfg?) {
  if (cfg?.hogwartsEventLive) {
    const eventFailsafe = Math.floor(Number(cfg?.hogwartsEventSpawn?.failsafeMs) || 0);
    if (eventFailsafe >= 60_000) return eventFailsafe;
    return 45 * 60 * 1000;
  }
  return Math.max(60 * 1000, Number(cfg?.failsafeMs || 90 * 60 * 1000));
}

function recordActivity(activityScopeKey?, windowMs?, userId?) {
  if (!activityScopeKey) return;
  const safeWindowMs = Math.max(60 * 1000, Number(windowMs || 30 * 60 * 1000));
  const now = Date.now();
  const uid = userId != null && String(userId).trim() ? String(userId).trim() : null;
  const list = recentMessages.get(activityScopeKey) || [];
  list.push({ t: now, u: uid });
  const cutoff = now - safeWindowMs;
  const trimmed = [];
  for (const raw of list) {
    const e = normalizeActivityEntry(raw);
    if (e && e.t >= cutoff) trimmed.push(e);
  }
  recentMessages.set(activityScopeKey, trimmed);
}

async function backfillRecentChatActivityFromHistory(client?, cfg?) {
  const channelId = String(cfg?.channelId || "").trim();
  const scopeKey = getActivityScopeKey(cfg);
  if (!client || !channelId || !scopeKey) return { ok: false, count: 0 };
  const windowMs = Math.max(
    getActivityWindowMs(cfg),
    getFreshSpawnActivityGate(cfg)?.windowMs || 0,
    5 * 60 * 1000,
  );
  const channel = await getChannelCached(client, channelId);
  if (!channel?.messages?.fetch) return { ok: false, count: 0 };
  const cutoff = Date.now() - windowMs;
  let fetched;
  try {
    fetched = await channel.messages.fetch({ limit: 100 });
  } catch (err) {
    warnMinigame(err);
    return { ok: false, count: 0 };
  }
  const entries = [];
  for (const msg of fetched.values()) {
    if (!msg || msg.author?.bot) continue;
    const t = msg.createdTimestamp || 0;
    if (!t || t < cutoff) continue;
    const uid = msg.author?.id != null ? String(msg.author.id).trim() : null;
    if (!uid) continue;
    entries.push({ t, u: uid });
  }
  entries.sort((a?, b?) => a.t - b.t);
  if (!entries.length) return { ok: true, count: 0 };
  const existing = recentMessages.get(scopeKey) || [];
  const merged = [...existing, ...entries]
    .map(normalizeActivityEntry)
    .filter((e?) => e && e.t >= cutoff)
    .sort((a?, b?) => a.t - b.t);
  recentMessages.set(scopeKey, merged);
  return { ok: true, count: merged.length };
}

function getRecentCount(activityScopeKey?, windowMs?) {
  return getRecentActivityStats(activityScopeKey, windowMs).count;
}

function recordNoParticipationIfNeeded(channelId?, game?) {
  if (!channelId || !game) return;
  if (game.hadParticipation) return;
  lastNoParticipationEndAtByChannel.set(channelId, Date.now());
}

function clearNoParticipationDelay(channelId?) {
  if (channelId) lastNoParticipationEndAtByChannel.delete(channelId);
}

function getHogwartsSpawnRequirementMaxWaitMs(cfg?) {
  const raw = Math.floor(Number(cfg?.hogwartsEventSpawn?.requirementMaxWaitMs) || 0);
  if (raw >= 60_000) return raw;
  return HOGWARTS_SPAWN_REQUIREMENT_MAX_WAIT_MS_DEFAULT;
}

function getHogwartsSpawnRequirementRetryMs(cfg?) {
  const raw = Math.floor(Number(cfg?.hogwartsEventSpawn?.retryAfterRequirementMissMs) || 0);
  if (raw >= 60_000) return raw;
  return HOGWARTS_SPAWN_REQUIREMENT_RETRY_MS_DEFAULT;
}

function getHogwartsEventSpawnCfg(cfg?) {
  const raw = cfg?.hogwartsEventSpawn;
  const o = raw && typeof raw === "object" ? raw : {};
  const targetMs = Math.max(0, Math.floor(Number(o.targetIntervalMs) || 0));
  let minMs = Math.max(
    60_000,
    Number(o.minIntervalMs ?? cfg?.intervalMs ?? 0) ||
      (targetMs > 0 ? Math.floor(targetMs * 0.8) : HOGWARTS_EVENT_SPAWN_MIN_INTERVAL_MS_DEFAULT),
  );
  let maxMs = Math.max(
    minMs,
    Number(o.maxIntervalMs ?? 0) ||
      (targetMs > 0 ? Math.floor(targetMs * 1.2) : HOGWARTS_EVENT_SPAWN_MAX_INTERVAL_MS_DEFAULT),
  );
  if (targetMs > 0) {
    if (!o.minIntervalMs) minMs = Math.max(60_000, Math.floor(targetMs * 0.8));
    if (!o.maxIntervalMs) maxMs = Math.max(minMs, Math.floor(targetMs * 1.2));
  }
  const spawnCooldownMs = Math.max(
    60_000,
    Math.floor(Number(o.spawnCooldownMs) || 0) || minMs,
  );
  return {
    minIntervalMs: minMs,
    maxIntervalMs: maxMs,
    spawnCooldownMs,
    targetIntervalMs: targetMs || Math.floor((minMs + maxMs) / 2),
    minDistinctHouses: Math.max(2, Math.floor(Number(o.minDistinctHouses ?? 3) || 3)),
    minDistinctHousesWithSorted: Math.max(2, Math.floor(Number(o.minDistinctHousesWithSorted ?? 2) || 2)),
    requirementMaxWaitMs: getHogwartsSpawnRequirementMaxWaitMs(cfg),
    retryAfterRequirementMissMs: getHogwartsSpawnRequirementRetryMs(cfg),
  };
}

const HOGWARTS_SPAWN_SCHEDULER_DOC_TYPE = SITE_DOCUMENT_TYPE.HOGWARTS_MINIGAME_SPAWN_WINDOW;

function clearHogwartsSpawnSchedulerMemory(client?) {
  const state = hogwartsSpawnSchedulerByClient.get(client);
  if (!state) return;
  for (const timer of state.timers || []) {
    try {
      clearTimeout(timer);
    } catch (_) {}
  }
  hogwartsSpawnSchedulerByClient.delete(client);
  clearHogwartsSpawnPersistTimer(client);
}

function clearHogwartsSpawnPersistTimer(client?) {
  const timer = hogwartsSpawnPersistTimerByClient.get(client);
  if (!timer) return;
  try {
    clearInterval(timer);
  } catch (_) {}
  hogwartsSpawnPersistTimerByClient.delete(client);
}

function armHogwartsSpawnShutdownPersist() {
  if (hogwartsSpawnShutdownPersistArmed) return;
  hogwartsSpawnShutdownPersistArmed = true;
  armShutdownCheckpoint();
  registerShutdownFlush("vinyls_hogwarts_spawn_scheduler", async () => {
    const client = hogwartsSpawnPersistClientRef;
    if (!client) return;
    await persistHogwartsSpawnSchedulerDocAwait(client, "shutdown");
  });
}

/* rebootDurability1: await in-flight hogwarts podium awards on shutdown */
function armHogwartsPodiumAwardsShutdownFlush() {
  if (hogwartsPodiumAwardsShutdownFlushArmed) return;
  hogwartsPodiumAwardsShutdownFlushArmed = true;
  armShutdownCheckpoint();
  registerShutdownFlush("vinyls_hogwarts_podium_pending_awards", async () => {
    const keys = [...hogwartsPodiumPendingAwards.keys()];
    if (!keys.length) return;
    await Promise.allSettled(keys.map((key?) => waitForHogwartsPodiumPendingAwards(key)));
  });
}

function scheduleHogwartsSpawnPersistLoop(client?) {
  clearHogwartsSpawnPersistTimer(client);
  if (!hogwartsSpawnSchedulerByClient.has(client)) return;
  const timer = setInterval(() => {
    if (!hogwartsSpawnSchedulerByClient.has(client)) {
      clearHogwartsSpawnPersistTimer(client);
      return;
    }
    void persistHogwartsSpawnSchedulerDocAwait(client, "interval").catch((err?) => warnMinigame(err));
  }, HOGWARTS_SPAWN_CHECKPOINT_INTERVAL_MS);
  if (typeof timer.unref === "function") timer.unref();
  hogwartsSpawnPersistTimerByClient.set(client, timer);
}

async function resolveMinigameGuildIdAsync(cfg?, client?) {
  const sync = resolveMinigameGuildId(cfg, client);
  if (sync) return sync;
  const channelId = String(cfg?.channelId || IDs.channels?.chat || "").trim();
  if (!channelId || !client?.channels) return "";
  const cached = client.channels.cache?.get(channelId);
  if (cached?.guildId) return String(cached.guildId);
  const fetched = await client.channels.fetch(channelId).catch(() => null);
  if (fetched?.guildId) return String(fetched.guildId);
  return String(IDs.guilds?.main || "").trim();
}

async function deleteHogwartsSpawnSchedulerDocAwait(client?) {
  const cfg = getConfig(client);
  const channelId = String(cfg?.channelId || "").trim();
  if (!channelId || mongoose.connection?.readyState !== 1) return;
  const guildId = await resolveMinigameGuildIdAsync(cfg, client);
  const filter: Record<string, any> = { docType: HOGWARTS_SPAWN_SCHEDULER_DOC_TYPE, dedupeKey: channelId };
  if (guildId) filter.guildId = guildId;
  await SiteDocument.deleteMany(filter).catch((err?) => warnMinigame(err));
}

function deleteHogwartsSpawnSchedulerDoc(client?) {
  void deleteHogwartsSpawnSchedulerDocAwait(client);
}

async function persistHogwartsSpawnSchedulerDocAwait(client?, reason = "") {
  const state = hogwartsSpawnSchedulerByClient.get(client);
  const cfg = getConfig(client);
  if (!state || !cfg?.enabled) return false;
  const channelId = String(cfg?.channelId || "").trim();
  if (!channelId) {
    logMinigameSpawn("spawn checkpoint skip: no channelId", { reason: String(reason || "") }, "warn");
    return false;
  }
  if (mongoose.connection?.readyState !== 1) {
    logMinigameSpawn("spawn checkpoint skip: mongo not ready", { channelId, reason: String(reason || "") }, "warn");
    return false;
  }
  const guildId = await resolveMinigameGuildIdAsync(cfg, client);
  if (!guildId) {
    logMinigameSpawn("spawn checkpoint skip: no guildId", { channelId, reason: String(reason || "") }, "warn");
    return false;
  }
  const now = Date.now();
  const requirementMaxWaitMs = getHogwartsSpawnRequirementMaxWaitMs(cfg);
  const checkpointUntil = state.waitingForRequirements
    ? Math.max(now + 60_000, (Math.floor(Number(state.attemptStartedAt) || now)) + requirementMaxWaitMs)
    : Math.max(now + 60_000, Math.floor(Number(state.nextFireAtMs) || 0));
  if (!state.waitingForRequirements && checkpointUntil <= now) return false;
  try {
    await SiteDocument.findOneAndUpdate(
      {
        docType: HOGWARTS_SPAWN_SCHEDULER_DOC_TYPE,
        dedupeKey: channelId,
      },
      {
        $set: {
          guildId,
          status: "active",
          cooldownUntil: new Date(checkpointUntil),
          rawWebhook: {
            nextFireAtMs: Math.floor(Number(state.nextFireAtMs) || 0),
            waitingForRequirements: Boolean(state.waitingForRequirements),
            attemptStartedAt: Math.floor(Number(state.attemptStartedAt) || 0),
          },
        },
      },
      { upsert: true },
    );
    logMinigameSpawn("spawn checkpoint saved", {
      channelId,
      guildId,
      reason: String(reason || ""),
      checkpointUntilMs: checkpointUntil,
      msUntilFire: Math.max(0, (state.nextFireAtMs || 0) - now),
      waitingForRequirements: Boolean(state.waitingForRequirements),
    });
    return true;
  } catch (err) {
    logMinigameSpawn("spawn checkpoint save failed", {
      channelId,
      guildId,
      reason: String(reason || ""),
      error: err?.message || String(err),
    }, "warn");
    warnMinigame(err);
    return false;
  }
}

function persistHogwartsSpawnSchedulerDoc(client?) {
  void persistHogwartsSpawnSchedulerDocAwait(client, "touch").catch((err?) => warnMinigame(err));
}

function clearHogwartsSpawnScheduler(client?) {
  clearHogwartsSpawnSchedulerMemory(client);
  deleteHogwartsSpawnSchedulerDoc(client);
}

function getHogwartsSpawnRomeClockMinute(date?) {
  return getRomeParts(date).minute;
}

function noteHogwartsSpawnRomeMinute(channelId?, atMs = Date.now()) {
  const id = String(channelId || "").trim();
  if (!id) return;
  lastHogwartsSpawnRomeMinuteByChannel.set(id, getHogwartsSpawnRomeClockMinute(new Date(atMs)));
}

function pickHogwartsSpawnIntervalMs(cfg?, channelId?, fromMs = Date.now()) {
  const spawn = getHogwartsEventSpawnCfg(cfg);
  const lastMinute = lastHogwartsSpawnRomeMinuteByChannel.get(String(channelId || "").trim());
  for (let attempt = 0; attempt < 40; attempt += 1) {
    let delayMs = randomBetween(spawn.minIntervalMs, spawn.maxIntervalMs);
    if (attempt > 0) delayMs += randomBetween(20_000, 120_000);
    const fireAtMs = fromMs + delayMs;
    if (lastMinute == null) return { delayMs, fireAtMs };
    const minute = getHogwartsSpawnRomeClockMinute(new Date(fireAtMs));
    if (minute !== lastMinute) return { delayMs, fireAtMs };
  }
  const delayMs = randomBetween(spawn.minIntervalMs, spawn.maxIntervalMs);
  return { delayMs, fireAtMs: fromMs + delayMs };
}

async function restoreHogwartsSpawnSchedulerFromDb(client?) {
  const cfg = getConfig(client);
  const channelId = String(cfg?.channelId || "").trim();
  if (!cfg?.enabled || !channelId) {
    logMinigameSpawn("spawn restore skip: minigames off or no channel", { channelId }, "warn");
    return false;
  }
  if (!isHogwartsRandomSpawnMode(cfg, client)) {
    logMinigameSpawn("spawn restore skip: not hogwarts random mode", { channelId }, "warn");
    return false;
  }
  if (hogwartsSpawnSchedulerByClient.has(client)) return true;
  if (mongoose.connection?.readyState !== 1) {
    logMinigameSpawn("spawn restore skip: mongo not ready", { channelId }, "warn");
    return false;
  }
  const doc = await SiteDocument.findOne({
    docType: HOGWARTS_SPAWN_SCHEDULER_DOC_TYPE,
    dedupeKey: channelId,
  })
    .select("guildId rawWebhook cooldownUntil updatedAt")
    .sort({ cooldownUntil: -1, updatedAt: -1 })
    .lean()
    .catch(() => null);
  if (!doc) {
    logMinigameSpawn("spawn restore miss: no checkpoint in db", { channelId });
    return false;
  }
  const payload = doc.rawWebhook && typeof doc.rawWebhook === "object" ? doc.rawWebhook : {};
  const legacyCycleStart = Math.floor(Number(payload.cycleStart) || 0);
  const legacyMaxMs = Math.floor(Number(payload.maxMs) || 0);
  let nextFireAtMs = Math.floor(Number(payload.nextFireAtMs) || 0);
  if (!nextFireAtMs && legacyCycleStart > 0 && legacyMaxMs > 0) {
    logMinigameSpawn("spawn restore: legacy window checkpoint discarded", { channelId }, "warn");
    void deleteHogwartsSpawnSchedulerDocAwait(client);
    return false;
  }
  const waitingForRequirements = Boolean(payload.waitingForRequirements);
  const attemptStartedAt = Math.floor(Number(payload.attemptStartedAt) || 0);
  const now = Date.now();
  const requirementMaxWaitMs = getHogwartsSpawnRequirementMaxWaitMs(cfg);
  if (waitingForRequirements) {
    const startedAt = attemptStartedAt > 0 ? attemptStartedAt : now;
    if (now - startedAt >= requirementMaxWaitMs) {
      logMinigameSpawn("spawn restore miss: requirement wait expired", { channelId }, "warn");
      void deleteHogwartsSpawnSchedulerDocAwait(client);
      return false;
    }
  } else if (!nextFireAtMs || nextFireAtMs <= now - 60_000) {
    logMinigameSpawn("spawn restore miss: tick overdue", { channelId, nextFireAtMs, msPast: now - nextFireAtMs }, "warn");
    void deleteHogwartsSpawnSchedulerDocAwait(client);
    return false;
  }
  resumeHogwartsSpawnScheduler(client, { nextFireAtMs, waitingForRequirements, attemptStartedAt });
  scheduleHogwartsSpawnPersistLoop(client);
  return true;
}

function resumeHogwartsSpawnScheduler(client?, persisted?) {
  const cfg = getConfig(client);
  const nextFireAtMs = Math.floor(Number(persisted?.nextFireAtMs) || 0);
  const waitingForRequirements = Boolean(persisted?.waitingForRequirements);
  const attemptStartedAt = Math.floor(Number(persisted?.attemptStartedAt) || 0);
  const state = {
    nextFireAtMs,
    timers: [],
    waitingForRequirements,
    attemptStartedAt,
    lastBlockerLogAt: 0,
  };
  hogwartsSpawnSchedulerByClient.set(client, state);
  void persistHogwartsSpawnSchedulerDocAwait(client, "resume_touch").catch((err?) => warnMinigame(err));
  const now = Date.now();
  logMinigameSpawn("spawn scheduler resumed from db", {
    channelId: cfg?.channelId,
    nextFireAtMs,
    waitingForRequirements,
    attemptStartedAt,
    msUntilFire: Math.max(0, nextFireAtMs - now),
  });
  if (waitingForRequirements) {
    runHogwartsSpawnTask(() => runHogwartsRequirementPoll(client));
    return;
  }
  if (nextFireAtMs <= now) {
    const channelId = String(cfg?.channelId || "").trim();
    const active = channelId ? activeGames.get(channelId) : null;
    if (active && !isStaleOrInvalidActiveGame(active)) {
      const spawnCfg = getHogwartsEventSpawnCfg(cfg);
      const endsAt = Math.floor(Number(active.endsAt) || now);
      const delayMs = Math.max(5_000, endsAt - now + Math.max(0, Number(spawnCfg.spawnCooldownMs) || 0));
      state.nextFireAtMs = now + delayMs;
      logMinigameSpawn("spawn resume deferred: active game running", {
        channelId,
        type: active.type || null,
        endsAt,
        delayMs,
        delayMin: Math.round(delayMs / 60_000),
      }, "warn");
      void persistHogwartsSpawnSchedulerDocAwait(client, "resume_busy_defer").catch((err?) => warnMinigame(err));
      armHogwartsSpawnFireTimer(client, delayMs, "resume_busy_defer");
      return;
    }
        const spawnCfg = getHogwartsEventSpawnCfg(cfg);
    const lastSentRaw = lastSentAtByChannel.get(channelId) || 0;
    const lastSentMs =
      typeof lastSentRaw === "number"
        ? lastSentRaw
        : Number(new Date(lastSentRaw).getTime()) || 0;
    if (lastSentMs > 0) {
      const earliest = lastSentMs + Math.max(0, Number(spawnCfg.spawnCooldownMs) || 0);
      if (earliest > now) {
        const delayMs = Math.max(5_000, earliest - now);
        state.nextFireAtMs = now + delayMs;
        void persistHogwartsSpawnSchedulerDocAwait(client, "resume_cooldown_defer").catch((err?) => warnMinigame(err));
        armHogwartsSpawnFireTimer(client, delayMs, "resume_cooldown_defer");
        return;
      }
    }
    runHogwartsSpawnTask(() => onHogwartsScheduledSpawnTick(client, "resume_overdue"));
    return;
  }
  armHogwartsSpawnFireTimer(client, nextFireAtMs - now, "resume");
}

function pushHogwartsSpawnTimer(state?, timer?) {
  state.timers.push(timer);
  if (typeof timer.unref === "function") timer.unref();
}

function isHogwartsRandomSpawnMode(cfg?, client?) {
  return Boolean(cfg?.hogwartsEventLive) && isHogwartsExclusiveMinigamesEnabled(client, cfg);
}

function runHogwartsSpawnTask(task?) {
  try {
    const out = task();
    if (out != null && typeof out.then === "function") {
      out.catch((err?) => warnMinigame(err));
    }
  } catch (err) {
    warnMinigame(err);
  }
}

async function assessHogwartsScheduledSpawnReadyDetailed(cfg?, client?) {
  const channelId = String(cfg?.channelId || "");
  const blockers = [];
  if (!cfg?.enabled) blockers.push("cfg_disabled");
  if (!channelId) blockers.push("no_channel_id");
  await closeStaleMinigameChannelGameAwait(channelId, client, cfg);
  if (channelId && !activeGames.has(channelId)) {
    const guildId = await resolveMinigameGuildIdAsync(cfg, client);
    if (guildId) await purgeExpiredMinigameDbState(client, { ...cfg, guildId });
  }
  if (channelId && isMinigameChannelBusy(channelId)) blockers.push("channel_busy");
  if (cfg?.hogwartsEventLive && isHogwartsExclusiveMinigamesEnabled(client, cfg) && hasAnyHouseChannelMinigameBusy()) {
    blockers.push("house_channel_busy");
  }
  if (!canStartByInterval(cfg, client)) {
    const lastSent = lastSentAtByChannel.get(channelId) || 0;
    const spawnCfg = getHogwartsEventSpawnCfg(cfg);
    blockers.push({
      code: "interval_cooldown",
      lastSentAt: lastSent,
      msSinceLastSent: Date.now() - lastSent,
      minIntervalMs: spawnCfg.spawnCooldownMs,
    });
  }
  let housePresence = null;
  if (cfg?.hogwartsEventLive && isHogwartsExclusiveMinigamesEnabled(client, cfg)) {
    housePresence = await assessHogwartsHouseSpawnPresence(cfg, client);
    if (!housePresence.ok) blockers.push({ code: "house_gate", ...housePresence });
  }
  // Halloween: spawn senza gate attività (come richiesto per l’evento)
  if (!cfg?.halloweenEventLive) {
    const readyByActivity = isReadyByActivity(cfg, client);
    const failsafeDue = isFailsafeDue(cfg);
    if (!readyByActivity && !failsafeDue) {
      const key = getActivityScopeKey(cfg);
      const w = getActivityWindowMs(cfg);
      const stats = getRecentActivityStats(key, w);
      blockers.push({
        code: "activity",
        count: stats.count,
        uniqueUsers: stats.uniqueUsers,
        minMessagesEffective: computeAdaptiveMinMessages(cfg, client, stats),
        minMessagesAnchor: getMinMessages(cfg),
        failsafeDue: false,
      });
    }
    const freshActivity: any = assessFreshSpawnChatActivity(cfg);
    if (!freshActivity.ok && !freshActivity.skipped) {
      blockers.push({
        code: "fresh_chat_activity",
        count: freshActivity.count,
        uniqueUsers: freshActivity.uniqueUsers,
        minMessages: freshActivity.minMessages,
        windowMs: freshActivity.windowMs,
      });
    }
  }
  const available = getAvailableGameTypes(cfg);
  if (!available.length) blockers.push("no_game_types");
  return {
    ok: blockers.length === 0,
    blockers,
    housePresence,
    availableGameTypes: available.length,
    hogwartsRandomMode: isHogwartsRandomSpawnMode(cfg, client),
    hogwartsEventLive: Boolean(cfg?.hogwartsEventLive),
    hogwartsExclusive: isHogwartsExclusiveMinigamesEnabled(client, cfg),
  };
}

async function isHogwartsScheduledSpawnReady(cfg?, client?) {
  const assess = await assessHogwartsScheduledSpawnReadyDetailed(cfg, client);
  return assess.ok;
}

function logHogwartsSpawnBlockersThrottled(state?, assess?, context?) {
  if (!assess || assess.ok) return;
  const now = Date.now();
  const lastAt = Math.floor(Number(state?.lastBlockerLogAt) || 0);
  if (lastAt > 0 && now - lastAt < HOGWARTS_SPAWN_BLOCKER_LOG_INTERVAL_MS) return;
  if (state) state.lastBlockerLogAt = now;
  logMinigameSpawn(context, assess, "warn");
}

async function prepareAndMaybeStartRandomGame(client?, reason = "") {
  const cfg = getConfig(client);
  if (!cfg?.enabled || !cfg.channelId) return false;
  const channelId = cfg.channelId;
  await closeStaleMinigameChannelGameAwait(channelId, client, cfg);
  if (isMinigameChannelBusy(channelId)) {
    logMinigameSpawn("prepare: skip busy channel", {
      channelId,
      reason: String(reason || ""),
      type: activeGames.get(channelId)?.type || null,
    }, "warn");
    return false;
  }
  const lastSentBefore = lastSentAtByChannel.get(channelId) || 0;
  const hadActive = activeGames.has(channelId);
  if (!pendingGames.has(channelId)) {
    const type = await getNextGameType(client, cfg);
    if (!type) {
      logMinigameSpawn("prepare: no game type from rotation", { channelId, reason }, "warn");
      return false;
    }
    pendingGames.set(channelId, { type, createdAt: Date.now() });
  }
  await maybeStartRandomGame(client, false);
  if (activeGames.has(channelId) && !hadActive) {
    logMinigameSpawn("prepare: game started", { channelId, reason, type: activeGames.get(channelId)?.type || null });
    return true;
  }
  const lastSentAfter = lastSentAtByChannel.get(channelId) || 0;
  const started = lastSentAfter > lastSentBefore;
  if (!started && shouldLogMinigameSpawnForCfg(cfg, client)) {
    const assess = await assessHogwartsScheduledSpawnReadyDetailed(cfg, client);
    logMinigameSpawn("prepare: maybeStart did not send game", { channelId, reason, assess }, "warn");
  }
  return started;
}

function armHogwartsSpawnFireTimer(client?, delayMs?, reason?) {
  const state = hogwartsSpawnSchedulerByClient.get(client);
  const cfg = getConfig(client);
  if (!state || !cfg?.enabled) return;
  const safeDelay = Math.max(0, Math.floor(Number(delayMs) || 0));
  logMinigameSpawn("spawn tick scheduled", {
    channelId: cfg.channelId,
    reason: String(reason || ""),
    delayMs: safeDelay,
    delaySec: Math.round(safeDelay / 1000),
    fireAtMs: Date.now() + safeDelay,
    romeMinute: getHogwartsSpawnRomeClockMinute(new Date(Date.now() + safeDelay)),
  });
  const timer = setTimeout(() => {
    runHogwartsSpawnTask(() => onHogwartsScheduledSpawnTick(client, reason));
  }, safeDelay);
  pushHogwartsSpawnTimer(state, timer);
}

async function onHogwartsScheduledSpawnTick(client?, reason = "") {
  const state = hogwartsSpawnSchedulerByClient.get(client);
  const cfg = getConfig(client);
  if (!state || !cfg?.enabled) return;
  logMinigameSpawn("spawn tick firing", {
    channelId: cfg.channelId,
    reason: String(reason || ""),
    romeMinute: getHogwartsSpawnRomeClockMinute(new Date()),
  });
  const assess = await assessHogwartsScheduledSpawnReadyDetailed(cfg, client);
  if (assess.ok) {
    const started = await prepareAndMaybeStartRandomGame(client, String(reason || "scheduled_tick"));
    if (started) {
      noteHogwartsSpawnRomeMinute(cfg.channelId);
      await scheduleHogwartsNextRandomSpawn(client, { skipRestore: true, reason: "after_spawn" });
      return;
    }
    logMinigameSpawn("spawn tick: ready but start failed", { channelId: cfg.channelId, reason }, "warn");
    await scheduleHogwartsNextRandomSpawn(client, { skipRestore: true, reason: "tick_start_failed" });
    return;
  }
  logHogwartsSpawnBlockersThrottled(state, assess, "spawn tick blocked");
  state.waitingForRequirements = true;
  state.attemptStartedAt = Date.now();
  persistHogwartsSpawnSchedulerDoc(client);
  runHogwartsSpawnTask(() => runHogwartsRequirementPoll(client));
}

async function runHogwartsRequirementPoll(client?) {
  const state = hogwartsSpawnSchedulerByClient.get(client);
  const cfg = getConfig(client);
  if (!state || !cfg?.enabled || !state.waitingForRequirements) return;
  const now = Date.now();
  const attemptStartedAt = Math.floor(Number(state.attemptStartedAt) || now);
  const requirementMaxWaitMs = getHogwartsSpawnRequirementMaxWaitMs(cfg);
  const waitedMs = now - attemptStartedAt;
  if (waitedMs >= requirementMaxWaitMs) {
    logMinigameSpawn("spawn skipped: requirements not met in time", {
      channelId: cfg.channelId,
      waitedMs,
      maxWaitMs: requirementMaxWaitMs,
    }, "warn");
    await scheduleHogwartsNextRandomSpawn(client, {
      skipRestore: true,
      reason: "requirements_timeout",
      shortRetryMs: getHogwartsSpawnRequirementRetryMs(cfg),
    });
    return;
  }
  const ready = await isHogwartsScheduledSpawnReady(cfg, client);
  if (ready) {
    const started = await prepareAndMaybeStartRandomGame(client, "requirements_met");
    if (started) {
      noteHogwartsSpawnRomeMinute(cfg.channelId);
      await scheduleHogwartsNextRandomSpawn(client, { skipRestore: true, reason: "after_spawn_poll" });
      return;
    }
  }
  const assess = await assessHogwartsScheduledSpawnReadyDetailed(cfg, client);
  logHogwartsSpawnBlockersThrottled(state, assess, "requirement poll: still waiting");
  const remainingWait = requirementMaxWaitMs - waitedMs;
  const pollMs = Math.min(HOGWARTS_SPAWN_REQUIREMENT_POLL_MS, Math.max(5_000, remainingWait));
  const timer = setTimeout(() => {
    runHogwartsSpawnTask(() => runHogwartsRequirementPoll(client));
  }, pollMs);
  pushHogwartsSpawnTimer(state, timer);
}

async function scheduleHogwartsNextRandomSpawn(client?, options: Record<string, any> = {}) {
  if (hogwartsSpawnSchedulerByClient.has(client)) {
    if (!options.skipRestore) {
      const cfgActive = getConfig(client);
      logMinigameSpawn("next spawn skipped: scheduler already active", { channelId: cfgActive?.channelId });
      return;
    }
    clearHogwartsSpawnSchedulerMemory(client);
    await deleteHogwartsSpawnSchedulerDocAwait(client);
  }
  const cfg = getConfig(client);
  if (!cfg?.enabled) {
    logMinigameSpawn("next spawn skipped: minigames disabled", null, "warn");
    return;
  }
  if (!isHogwartsRandomSpawnMode(cfg, client)) {
    await deleteHogwartsSpawnSchedulerDocAwait(client);
    logMinigameSpawn("switching to Rome slot scheduler", {
      channelId: cfg.channelId,
      hogwartsEventLive: Boolean(cfg.hogwartsEventLive),
      hogwartsExclusive: isHogwartsExclusiveMinigamesEnabled(client, cfg),
    }, "warn");
    scheduleMinigameLoopTick(client);
    return;
  }
  if (!options.skipRestore && (await restoreHogwartsSpawnSchedulerFromDb(client))) return;
  const spawnCfg = getHogwartsEventSpawnCfg(cfg);
  let { delayMs, fireAtMs } = pickHogwartsSpawnIntervalMs(cfg, cfg.channelId);
  const shortRetryMs = Math.floor(Number(options.shortRetryMs) || 0);
  if (shortRetryMs >= 60_000) {
    delayMs = Math.min(delayMs, shortRetryMs);
    fireAtMs = Date.now() + delayMs;
  }
    const lastSentRaw = lastSentAtByChannel.get(cfg.channelId) || 0;
  const lastSentMs =
    typeof lastSentRaw === "number"
      ? lastSentRaw
      : Number(new Date(lastSentRaw).getTime()) || 0;
  if (lastSentMs > 0) {
    const earliest = lastSentMs + Math.max(0, Number(spawnCfg.spawnCooldownMs) || 0);
    if (fireAtMs < earliest) {
      fireAtMs = earliest;
      delayMs = Math.max(5_000, fireAtMs - Date.now());
    }
  }
  const state = {
    nextFireAtMs: fireAtMs,
    timers: [],
    waitingForRequirements: false,
    attemptStartedAt: 0,
    lastBlockerLogAt: 0,
  };
  hogwartsSpawnSchedulerByClient.set(client, state);
  hogwartsSpawnPersistClientRef = client;
  armHogwartsSpawnShutdownPersist();
  scheduleHogwartsSpawnPersistLoop(client);
  void persistHogwartsSpawnSchedulerDocAwait(client, "schedule").catch((err?) => warnMinigame(err));
  logMinigameSpawn("spawn interval scheduled", {
    channelId: cfg.channelId,
    delayMs,
    delayMin: Math.round(delayMs / 60_000),
    fireAtMs,
    romeMinute: getHogwartsSpawnRomeClockMinute(new Date(fireAtMs)),
    intervalMinMs: spawnCfg.minIntervalMs,
    intervalMaxMs: spawnCfg.maxIntervalMs,
  });
  armHogwartsSpawnFireTimer(client, delayMs, options.reason || "new_interval");
}
function getHogwartsEventBonusMinigameTypes(cfg?) {
  const raw = cfg?.hogwartsEventBonusMinigames;
  if (raw === true || raw === "all") return HOGWARTS_EVENT_BONUS_MINIGAME_TYPES_ALL.slice();
  if (raw === false) return [];
  if (!Array.isArray(raw)) return HOGWARTS_EVENT_BONUS_MINIGAME_TYPES_DEFAULT.slice();
  const list = raw.map((t?) => String(t || "").trim()).filter(Boolean);
  return list.length ? list : HOGWARTS_EVENT_BONUS_MINIGAME_TYPES_DEFAULT.slice();
}

function isHogwartsThemedMinigameType(type?) {
  return ["hogwartsQuiz", "findScroll", "hogwartsMemoryEmoji", "hogwartsCipher", "hogwartsObservationTower"].includes(String(type || ""));
}

function isHogwartsBonusMinigameType(type?, cfg?) {
  return getHogwartsEventBonusMinigameTypes(cfg).includes(String(type || ""));
}

function applyHogwartsBonusEmbedTitle(embed?, cfg?, gameType?, defaultTitle?) {
  if (!embed?.setTitle || !shouldApplyHogwartsBonusTheme(cfg, gameType)) return embed;
  const plain = String(defaultTitle || "").replace(/\s*<a:[^>]+>/g, "").trim();
  const themed = resolveHogwartsBonusPromptTitle(cfg, gameType, plain);
  embed.setTitle(`${themed} <a:VC_Exclamation:1482534702077444217>`);
  return embed;
}

function isHogwartsEventMinigameType(type?, cfg?) {
  return isHogwartsThemedMinigameType(type) || isHogwartsBonusMinigameType(type, cfg);
}

function isHogwartsHousePointsMinigameType(type?, cfg?) {
  if (!cfg?.hogwartsEventLive) return isHogwartsThemedMinigameType(type);
  return isHogwartsEventMinigameType(type, cfg);
}

function appendHogwartsEventBonusGameTypes(cfg?, types?) {
  const bonus = new Set(getHogwartsEventBonusMinigameTypes(cfg));
  const seen = new Set(types);
  const tryPush = (type?, ok?) => {
    if (!ok || !bonus.has(type) || seen.has(type)) return;
    seen.add(type);
    types.push(type);
  };
  tryPush("guessNumber", cfg?.guessNumber !== false);
  tryPush("guessWord", Boolean(cfg?.guessWord?.apiUrl));
  tryPush("guessFlag", Boolean(cfg?.guessFlag?.apiUrl));
  tryPush("hogwartsGuessCharacter", cfg?.hogwartsGuessCharacter !== false && getHogwartsCharacterBank().length);
  tryPush("guessSong", Boolean(cfg?.guessSong));
  tryPush("guessCapital", cfg?.guessCapital !== false);
  tryPush(
    "guessReverseCapital",
    cfg?.guessReverseCapital !== false && Boolean(cfg?.guessReverseCapital?.apiUrl || cfg?.guessCapital?.apiUrl),
  );
  tryPush("guessRegionCapital", cfg?.guessRegionCapital !== false);
  tryPush("fastType", cfg?.fastType !== false);
  tryPush("guessTeam", Boolean(cfg?.guessTeam));
  tryPush("guessSinger", Boolean(cfg?.guessSinger));
  tryPush("guessAlbum", Boolean(cfg?.guessAlbum));
  tryPush("hangman", cfg?.hangman !== false);
  tryPush("italianGK", cfg?.italianGK !== false);
  tryPush("drivingQuiz", cfg?.drivingQuiz !== false);
  tryPush("mathExpression", cfg?.mathExpression !== false);
  tryPush("findBot", cfg?.findBot !== false);
  tryPush("findBotVoice", cfg?.findBotVoice !== false);
  tryPush("memoryEmoji", cfg?.memoryEmoji !== false && getMemoryEmojiBank().length);
  tryPush("guessYear", cfg?.guessYear !== false);
  tryPush("completeVerse", cfg?.completeVerse !== false);
  tryPush("guessEmoji", cfg?.guessEmoji !== false);
  tryPush("quoteFilm", cfg?.quoteFilm !== false);
  tryPush("completeProverb", cfg?.completeProverb !== false);
  tryPush("synonymAntonym", cfg?.synonymAntonym !== false);
  tryPush("guessCity", cfg?.guessCity !== false);
  tryPush("treasureHunt", cfg?.treasureHunt !== false);
}

function splitHogwartsEventGameTypes(available?, cfg?) {
  const themed = [];
  const bonus = [];
  for (const type of available) {
    if (isHogwartsThemedMinigameType(type)) themed.push(type);
    else if (isHogwartsBonusMinigameType(type, cfg)) bonus.push(type);
  }
  return { themed, bonus };
}

function getGameTypeRotationWeight(cfg?, type?) {
  if (String(type || "") !== "hogwartsObservationTower") return 1;
  const w = Math.floor(Number(cfg?.hogwartsObservationTower?.rotationWeight ?? 1));
  if (!Number.isFinite(w) || w < 1) return 1;
  return Math.min(10, w);
}

function expandGameTypesByRotationWeight(cfg?, types?) {
  const list = Array.isArray(types) ? types : [];
  if (!list.length) return [];
  const out = [];
  for (const type of list) {
    const weight = getGameTypeRotationWeight(cfg, type);
    for (let i = 0; i < weight; i += 1) out.push(type);
  }
  return out;
}

function getGameTypeCooldownMs(type?, cfg?) {
  if (String(type || "") === "hogwartsObservationTower") {
    const n = Number(cfg?.hogwartsObservationTower?.cooldownMs);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return GAME_TYPE_COOLDOWN_MS;
}

function isHogwartsAlternatingRotationActive(cfg?) {
  if (!cfg?.hogwartsEventLive || !isHogwartsExclusiveMinigamesEnabled(null, cfg)) return false;
  const { themed, bonus } = splitHogwartsEventGameTypes(getAvailableGameTypes(cfg), cfg);
  return themed.length > 0 && bonus.length > 0;
}

function buildHogwartsAlternatingRotationQueue(themed?, bonus?, cfg = null) {
  const t = shuffleArray(expandGameTypesByRotationWeight(cfg, themed));
  const b = shuffleArray(bonus);
  if (!t.length) return b;
  if (!b.length) return t;
  const out = [];
  let ti = 0;
  let bi = 0;
  while (ti < t.length || bi < b.length) {
    if (ti < t.length) out.push(t[ti++]);
    if (bi < b.length) out.push(b[bi++]);
  }
  return out;
}

function getLastPlayedGameType(channelId?) {
  const arr = channelId ? (lastPlayedGameTypesByChannel.get(channelId) || []) : [];
  return arr.length ? String(arr[arr.length - 1] || "") : "";
}

function hogwartsWantsThemedNext(cfg?, channelId?) {
  const last = getLastPlayedGameType(channelId);
  if (!last) return true;
  if (isHogwartsBonusMinigameType(last, cfg)) return true;
  if (isHogwartsThemedMinigameType(last)) return false;
  return true;
}

function pickHogwartsAlternatingGameType(cfg?, channelId?, themed?, bonus?, excludeSet?, isOnCooldown?) {
  const primaryPool = hogwartsWantsThemedNext(cfg, channelId) ? themed : bonus;
  const secondaryPool = primaryPool === themed ? bonus : themed;
  const pickFromPool = (pool?) => {
    if (!pool.length) return null;
    const poolSet = new Set(pool);
    const queueFirst = rotationQueue.filter((t?) => poolSet.has(t));
    const ordered = [...new Set([...queueFirst, ...pool])];
    for (const type of ordered) {
      if (!excludeSet.has(type) && !isOnCooldown(type)) return type;
    }
    const fallback = pool.filter((t?) => !excludeSet.has(t) && !isOnCooldown(t));
    return fallback.length ? fallback[randomBetween(0, fallback.length - 1)] : null;
  };
  return pickFromPool(primaryPool) || pickFromPool(secondaryPool);
}

function resolveMinigameGuildId(cfg?, client?) {
  const fromCfg = String(cfg?.guildId || "").trim();
  if (fromCfg) return fromCfg;
  const channelId = String(cfg?.channelId || IDs.channels?.chat || "").trim();
  if (channelId && client?.channels?.cache) {
    const ch = client.channels.cache.get(channelId);
    if (ch?.guildId) return String(ch.guildId);
  }
  const mainGuildId = String(IDs.guilds?.main || "").trim();
  if (mainGuildId) return mainGuildId;
  return "";
}

function getActiveUserIdsFromActivity(cfg?) {
  const key = getActivityScopeKey(cfg);
  if (!key) return [];
  const windowMs = getActivityWindowMs(cfg);
  const now = Date.now();
  const cutoff = now - windowMs;
  const list = recentMessages.get(key) || [];
  const out = new Set();
  for (const raw of list) {
    const e = normalizeActivityEntry(raw);
    if (!e || e.t < cutoff || !e.u) continue;
    out.add(e.u);
  }
  return [...out];
}

function getActiveUserIdsFromVoice(client?, guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid || !client?.guilds?.cache) return [];
  const guild = client.guilds.cache.get(gid);
  if (!guild) return [];
  const out = new Set();
  for (const channel of guild.channels.cache.values()) {
    if (
      channel.type !== ChannelType.GuildVoice &&
      channel.type !== ChannelType.GuildStageVoice
    ) {
      continue;
    }
    for (const member of channel.members.values()) {
      const uid = String(member.id || "").trim();
      if (!uid || member.user?.bot) continue;
      out.add(uid);
    }
  }
  return [...out];
}

function mergeActiveUserIdsForHouseGate(cfg?, client?) {
  const guildId = resolveMinigameGuildId(cfg, client);
  const chatIds = getActiveUserIdsFromActivity(cfg);
  const voiceIds = getActiveUserIdsFromVoice(client, guildId);
  const merged = [...new Set([...chatIds, ...voiceIds])];
  return { guildId, chatIds, voiceIds, userIds: merged };
}

async function resolveSortedHousesForUserIds(guildId?, userIds?, eventKey?) {
  const gid = String(guildId || "").trim();
  const key = String(eventKey || "").trim() || "hogwarts";
  const ids = [...new Set(
    (Array.isArray(userIds) ? userIds : [])
      .map((id?) => String(id || "").trim())
      .filter((id?) => isValidGuildUserId(gid, id)),
  )];
  if (!gid || !ids.length) return new Map();
  const cacheKey = `${gid}:${key}`;
  let cached = hogwartsSortedHouseByUserCache.get(cacheKey);
  if (!cached || Date.now() - cached.at > HOGWARTS_HOUSE_MAP_CACHE_MS) {
    const rows = await SiteDocument.find({
      docType: SITE_DOCUMENT_TYPE.HOGWARTS_SORTING,
      guildId: gid,
      dedupeKey: key,
      status: { $in: HOGWARTS_HOUSE_IDS },
    })
      .select("userId status")
      .lean()
      .catch((err?) => {
        warnMinigame(err);
        return [];
      });
    const map = new Map();
    for (const row of rows) {
      const uid = String(row?.userId || "").trim();
      const house = normalizeHogwartsHouseId(row?.status);
      if (uid && house) map.set(uid, house);
    }
    cached = { at: Date.now(), map };
    hogwartsSortedHouseByUserCache.set(cacheKey, cached);
  }
  const out = new Map();
  for (const uid of ids) {
    const house = cached.map.get(uid);
    if (house) out.set(uid, house);
  }
  return out;
}

async function assessHogwartsHouseSpawnPresence(cfg?, client?) {
  if (!cfg?.hogwartsEventLive || !isHogwartsExclusiveMinigamesEnabled(client, cfg)) {
    return { ok: true, distinctHouses: 0, sortedActiveUsers: 0, unsortedActiveUsers: 0 };
  }
  const spawn = getHogwartsEventSpawnCfg(cfg);
  const presence = mergeActiveUserIdsForHouseGate(cfg, client);
  const userIds = presence.userIds;
  if (!userIds.length) {
    return {
      ok: false,
      distinctHouses: 0,
      sortedActiveUsers: 0,
      unsortedActiveUsers: 0,
      activeFromChat: 0,
      activeFromVoice: 0,
      guildId: presence.guildId,
    };
  }
  const houseByUser = await resolveSortedHousesForUserIds(
    presence.guildId,
    userIds,
    hogwartsHousePointsDedupeKey(client),
  );
  const houses = new Set();
  let sortedActiveUsers = 0;
  let unsortedActiveUsers = 0;
  for (const uid of userIds) {
    const house = houseByUser.get(uid);
    if (!house) {
      unsortedActiveUsers += 1;
      continue;
    }
    sortedActiveUsers += 1;
    houses.add(house);
  }
  const distinctHouses = houses.size;
  const ok =
    distinctHouses >= spawn.minDistinctHouses ||
    (distinctHouses >= spawn.minDistinctHousesWithSorted && unsortedActiveUsers >= 1);
  return {
    ok,
    distinctHouses,
    sortedActiveUsers,
    unsortedActiveUsers,
    activeFromChat: presence.chatIds.length,
    activeFromVoice: presence.voiceIds.length,
    guildId: presence.guildId,
    minDistinctHouses: spawn.minDistinctHouses,
    minDistinctHousesWithSorted: spawn.minDistinctHousesWithSorted,
  };
}

async function passesHogwartsHouseSpawnGate(cfg?, client?) {
  const stats = await assessHogwartsHouseSpawnPresence(cfg, client);
  return Boolean(stats.ok);
}

function applyHogwartsBonusHousePointMultiplier(cfg?, gameType?, points?) {
  if (!isHogwartsBonusMinigameType(gameType, cfg)) return points;
  const mult = Number(cfg?.hogwartsEventBonusHousePointsMultiplier ?? HOGWARTS_EVENT_BONUS_HOUSE_POINTS_MULTIPLIER_DEFAULT);
  const factor = Number.isFinite(mult) ? mult : HOGWARTS_EVENT_BONUS_HOUSE_POINTS_MULTIPLIER_DEFAULT;
  return Math.max(0, Math.floor(points * factor));
}

function canStartByInterval(cfg?, client = null) {
  const hogwartsSpawn =
    cfg?.hogwartsEventLive && isHogwartsExclusiveMinigamesEnabled(client, cfg) ? getHogwartsEventSpawnCfg(cfg) : null;
  const intervalMs = hogwartsSpawn
    ? hogwartsSpawn.spawnCooldownMs
    : Number(cfg?.intervalMs || 15 * 60 * 1000);
  const noPartMs = Number(cfg?.noParticipationIntervalMs ?? 30 * 60 * 1000) || 0;
  const channelId = cfg?.channelId;
  const now = Date.now();
  const lastSent = lastSentAtByChannel.get(channelId) || 0;
  const noPartEnd = lastNoParticipationEndAtByChannel.get(channelId) || 0;
  const cooldownStart = noPartEnd > 0 ? Math.max(lastSent, noPartEnd) : lastSent;
  const requiredCooldownMs = noPartEnd > 0 ? Math.max(intervalMs, noPartMs) : intervalMs;
  const minElapsed = Math.max(0, requiredCooldownMs - MINIGAME_INTERVAL_SLOT_SLACK_MS);
  if (now - cooldownStart < minElapsed) return false;
  return true;
}

function stampMinigameBurrobirraApplies(channelId?, client?) {
  const game = activeGames.get(String(channelId || "").trim());
  if (!game || typeof game !== "object" || game.burrobirraApplies !== undefined) return;
  game.burrobirraApplies = isBurrobirraActiveForChannel(client, channelId);
}

function markSent(channelId?) {
  if (!channelId) return;
  lastSentAtByChannel.set(channelId, Date.now());
  standbyChannels.delete(channelId);
  void clearPersistedRolePing(channelId);
  try {
    const { recordChatHubBotPost, extendChatHubQuietForMs, CHAT_HUB_SOURCES } = require("../../../shared/discord/chatHubBotPacing") as typeof import("../../../shared/discord/chatHubBotPacing");
    recordChatHubBotPost(channelId, CHAT_HUB_SOURCES.VINILI);
    extendChatHubQuietForMs(channelId, 45_000);
  } catch (_) {}
}

function isMinigameChannelBusy(channelId?) {
  const id = String(channelId || "").trim();
  if (!id) return false;
  return (
    activeGames.has(id) ||
    channelWinClosing.has(id) ||
    startingChannels.has(id)
  );
}

function resolveMainChatMinigameChannelId() {
  return String(IDs.channels?.chat || "").trim();
}

function isMainChatMinigameChannelBusy() {
  const chatId = resolveMainChatMinigameChannelId();
  return chatId ? isMinigameChannelBusy(chatId) : false;
}

function hasAnyHouseChannelMinigameBusy() {
  let houseChannelIds;
  try {
    const { HOUSE_CHANNEL_MAP } = require("../Community/hogwartsHouseChannelMinigameService") as typeof import("../Community/hogwartsHouseChannelMinigameService");
    houseChannelIds = HOUSE_CHANNEL_MAP ? [...HOUSE_CHANNEL_MAP.keys()] : [];
  } catch (_) {
    houseChannelIds = [];
  }
  for (const channelId of houseChannelIds) {
    if (isMinigameChannelBusy(channelId)) return true;
  }
  return false;
}

function hasAnyActiveMinigame() {
  for (const [key, game] of activeGames.entries()) {
    if (isTrickOrTreatMapKey(key) || game?.type === "halloweenTrickOrTreat") continue;
    return true;
  }
  return startingChannels.size > 0 || channelWinClosing.size > 0 || pendingGames.size > 0;
}

function clearStaleMinigameChannelGame(channelId?, client?, cfg?) {
  const id = String(channelId || "").trim();
  if (!id) return false;
  const game = activeGames.get(id);
  if (!game || !isStaleOrInvalidActiveGame(game)) return false;
  void closeStaleActiveMinigameChannel(client, cfg, id, game).catch((err?) => warnMinigame(err));
  return true;
}

async function closeStaleMinigameChannelGameAwait(channelId?, client?, cfg?) {
  const id = String(channelId || "").trim();
  if (!id) return false;
  const game = activeGames.get(id);
  if (!game || !isStaleOrInvalidActiveGame(game)) return false;
  await closeStaleActiveMinigameChannel(client, cfg, id, game).catch((err?) => warnMinigame(err));
  return true;
}

function isFailsafeDue(cfg?) {
  const channelId = cfg?.channelId;
  const activityScopeKey = getActivityScopeKey(cfg);
  if (!channelId || !activityScopeKey) return false;
  const lastSent = lastSentAtByChannel.get(channelId) || 0;
  if (!lastSent) return true;
  if (Date.now() - lastSent < getFailsafeMs(cfg)) return false;
  const minActivityForFailsafe = Math.max(8, Math.floor(getMinMessages(cfg) * 0.5));
  if (getRecentCount(activityScopeKey, getActivityWindowMs(cfg)) < minActivityForFailsafe) return false;
  return true;
}

function canCountMessageForActivity(message?) {
  if (!message?.guild || !message?.channel) return false;
  const channelId = String(message.channel?.id || "");
  const allowedChannelIds = new Set(
    [IDs.channels.chat, IDs.channels.media]
      .map((id?) => String(id || "").trim())
      .filter(Boolean),
  );
  if (!allowedChannelIds.has(channelId)) return false;
  const memberRoleId = String(IDs.roles.Member || "");
  if (!memberRoleId) return false;
  const memberRole = message.guild.roles?.cache?.get(memberRoleId) || null;
  if (!memberRole) return false;
  const perms = message.channel.permissionsFor(memberRole);
  if (!perms) return false;
  return perms.has("ViewChannel") && perms.has("SendMessages");
}

function isStaleOrInvalidActiveGame(game?, nowMs = Date.now()) {
  if (!game || typeof game !== "object") return true;
  const endsAt = Number(game.endsAt || 0);
  if (!Number.isFinite(endsAt) || endsAt <= 0) return true;
  return nowMs >= endsAt;
}

async function closeStaleActiveMinigameChannel(client?, cfg?, channelId?, game?, channel = null) {
  if (!game || !isStaleOrInvalidActiveGame(game)) return false;
  const chId = String(channelId || cfg?.channelId || "").trim();
  if (!chId) return false;
  clearMinigameRoundTimers(game);
  recordNoParticipationIfNeeded(chId, game);
  const targetChannel = channel || (await getChannelCached(client, chId));
  const closeCfg = { ...cfg, channelId: chId };
  if (!closeCfg.guildId && targetChannel?.guild?.id) {
    closeCfg.guildId = String(targetChannel.guild.id);
  }
  await sendMinigameTimeoutAndClose(
    client,
    closeCfg,
    chId,
    targetChannel,
    game,
    buildMinigameTimeoutEmbedForGame(game),
    { allowPersistedClose: true },
  ).catch((err?) => warnMinigame(err));
  return true;
}

/** ToT ≠ slot minigioco: chiave RAM + doc Mongo dedicati, così Impiccato/ecc. non li sovrascrivono. */
const TOT_MAP_SUFFIX = "::halloweenTrickOrTreat";
const TOT_STATE_SUFFIX = ":halloweenTrickOrTreat";

function trickOrTreatMapKey(channelId?) {
  return `${String(channelId || "").trim()}${TOT_MAP_SUFFIX}`;
}

function trickOrTreatStateChannelId(channelId?) {
  return `${String(channelId || "").trim()}${TOT_STATE_SUFFIX}`;
}

function isTrickOrTreatMapKey(key?) {
  return String(key || "").endsWith(TOT_MAP_SUFFIX);
}

function realChannelIdFromTotMapKey(key?) {
  const k = String(key || "");
  if (k.endsWith(TOT_MAP_SUFFIX)) return k.slice(0, -TOT_MAP_SUFFIX.length);
  return k;
}

function getTrickOrTreatGame(channelId?) {
  const ch = String(channelId || "").trim();
  if (!ch) return null;
  const side = activeGames.get(trickOrTreatMapKey(ch));
  if (side?.type === "halloweenTrickOrTreat") return side;
  const legacy = activeGames.get(ch);
  if (legacy?.type === "halloweenTrickOrTreat") return legacy;
  return null;
}

async function saveTrickOrTreatGame(client?, cfg?, payload?) {
  const channelId = String(cfg?.channelId || "").trim();
  if (!channelId) return;
  await saveActiveGame(client, { ...cfg, channelId: trickOrTreatStateChannelId(channelId) }, payload);
}

async function clearTrickOrTreatGame(client?, cfg?, gameHint = null) {
  const channelId = String(cfg?.channelId || "").trim();
  if (!channelId) return;
  const mapKey = trickOrTreatMapKey(channelId);
  const game = gameHint || activeGames.get(mapKey) || null;
  clearMinigameRoundTimers(game);
  activeGames.delete(mapKey);
  const legacy = activeGames.get(channelId);
  if (legacy?.type === "halloweenTrickOrTreat") {
    clearMinigameRoundTimers(legacy);
    activeGames.delete(channelId);
  }
  let guildId = String(cfg?.guildId || "").trim();
  if (!guildId) {
    const channel = await getChannelCached(client, channelId);
    guildId = String(channel?.guild?.id || "").trim();
  }
  if (!guildId) return;
  await minigameStateDeleteOne({ guildId, channelId: trickOrTreatStateChannelId(channelId) }).catch(() => {});
  // Migrazione legacy: ToT era sullo stesso doc del minigioco normale
  const main = await minigameStateFindOneLean({ guildId, channelId }).catch(() => null);
  if (main?.type === "halloweenTrickOrTreat") {
    await minigameStateDeleteOne({ guildId, channelId }).catch(() => {});
  }
}

function buildTrickOrTreatGameFromCustomId(wantId?, cfg?, messageId = null, messageCreatedTs = null) {
  const rawTs = String(wantId || "").split(":")[1] || "";
  let startedAt = Number(rawTs);
  if (!Number.isFinite(startedAt) || startedAt <= 0) {
    startedAt = Number(messageCreatedTs) || 0;
  }
  if (!Number.isFinite(startedAt) || startedAt <= 0) return null;
  const durationMs = Math.max(60_000, Number(cfg?.halloweenTrickOrTreat?.durationMs || 900_000));
  let endsAt = startedAt + durationMs;
  const ageMs = Date.now() - startedAt;
  // Troppo vecchio: messaggio orfano abbandonato
  if (ageMs > durationMs + 45 * 60_000) return null;
  // Bottone ancora lì ma timer scaduto (slot rubato da Impiccato): riapri 10 min
  if (endsAt <= Date.now()) {
    endsAt = Date.now() + Math.min(durationMs, 10 * 60_000);
  }
  return {
    type: "halloweenTrickOrTreat",
    rewardExp: normalizeRewardExp(cfg?.halloweenTrickOrTreat?.rewardExp ?? 100),
    treatChancePercent: Math.max(0, Math.min(100, Number(cfg?.halloweenTrickOrTreat?.treatChancePercent ?? 80))),
    candyOnTreat: Math.max(0, Math.floor(Number(cfg?.halloweenTrickOrTreat?.candyOnTreat ?? 1))),
    claimedBy: {},
    customId: String(wantId),
    startedAt,
    endsAt,
    timeout: null,
    hintTimeout: null,
    hintSent: true,
    gameMessageId: messageId || null,
    multiClaim: true,
    recovered: true,
  };
}

function scheduleTrickOrTreatRoundTimers(client?, cfg?, channel?, game?) {
  const channelId = String(cfg?.channelId || channel?.id || "").trim();
  if (!channelId || !game || game.type !== "halloweenTrickOrTreat") return game;
  const mapKey = trickOrTreatMapKey(channelId);
  const guildId = String(cfg?.guildId || channel?.guild?.id || "").trim();
  const remainingMs = Math.max(0, Number(game.endsAt || 0) - Date.now());
  clearMinigameRoundTimers(game);
  if (remainingMs <= 0) return game;
  const timeout = setTimeout(async () => {
    const live = activeGames.get(mapKey);
    if (!live || live.type !== "halloweenTrickOrTreat" || live.customId !== game.customId) return;
    clearMinigameRoundTimers(live);
    activeGames.delete(mapKey);
    await clearTrickOrTreatGame(client, { ...cfg, channelId, guildId }, live).catch(() => {});
    const claimed = Object.keys(live.claimedBy || {}).length;
    if (channel) {
      await sendMinigameMessage(channel, {
        embeds: [buildTrickOrTreatEndedEmbed(claimed)],
      }).catch(() => {});
    }
    setTimeout(() => {
      void maybeStartRandomGame(client, false).catch((err?) => warnMinigame(err));
    }, 1500).unref?.();
  }, remainingMs);
  timeout.unref?.();
  game.timeout = timeout;
  return game;
}

async function mountRestoredTrickOrTreat(client?, cfg?, channel?, state?) {
  const channelId = String(cfg?.channelId || "").trim();
  const guildId = String(cfg?.guildId || channel?.guild?.id || "").trim();
  if (!channelId || !state || state.type !== "halloweenTrickOrTreat") return null;
  const mapKey = trickOrTreatMapKey(channelId);
  const parsed = parseStateTarget(state.target);
  const customId = state.customId || parsed?.customId || `minigame_trickortreat:restored:${Date.now()}`;
  const existing = activeGames.get(mapKey);
  if (existing?.type === "halloweenTrickOrTreat" && String(existing.customId || "") === String(customId)) {
    return existing;
  }
  const endsAt = new Date(state.endsAt).getTime();
  if (!Number.isFinite(endsAt) || endsAt <= Date.now()) {
    await clearTrickOrTreatGame(client, { ...cfg, channelId, guildId });
    return null;
  }
  const startedAt = new Date(state.startedAt).getTime();
  const game = {
    type: "halloweenTrickOrTreat",
    rewardExp: Number(state.rewardExp || 0),
    treatChancePercent: Number(parsed?.treatChancePercent ?? 80),
    candyOnTreat: Number(parsed?.candyOnTreat ?? 1),
    claimedBy: parsed?.claimedBy && typeof parsed.claimedBy === "object" ? { ...parsed.claimedBy } : {},
    customId,
    startedAt,
    endsAt,
    timeout: null,
    hintTimeout: null,
    hintSent: true,
    gameMessageId: state.gameMessageId || null,
    multiClaim: true,
  };
  scheduleTrickOrTreatRoundTimers(client, { ...cfg, channelId, guildId }, channel, game);
  activeGames.set(mapKey, game);
  if (activeGames.get(channelId)?.type === "halloweenTrickOrTreat") {
    activeGames.delete(channelId);
  }
  await saveTrickOrTreatGame(client, { ...cfg, channelId, guildId }, {
    type: "halloweenTrickOrTreat",
    target: JSON.stringify({
      treatChancePercent: game.treatChancePercent,
      candyOnTreat: game.candyOnTreat,
      claimedBy: game.claimedBy,
      customId,
    }),
    rewardExp: game.rewardExp,
    startedAt: new Date(startedAt),
    endsAt: new Date(endsAt),
    gameMessageId: game.gameMessageId,
    customId,
  });
  if (guildId) {
    const main = await minigameStateFindOneLean({ guildId, channelId }).catch(() => null);
    if (main?.type === "halloweenTrickOrTreat") {
      await minigameStateDeleteOne({ guildId, channelId }).catch(() => {});
    }
  }
  return game;
}

async function restoreTrickOrTreatSideSlot(client?, cfg?, channel?) {
  const channelId = String(cfg?.channelId || "").trim();
  const guildId = String(cfg?.guildId || "").trim();
  if (!channelId || !guildId || !channel) return;
  if (getTrickOrTreatGame(channelId)) return;
  const state = await minigameStateFindOneLean({
    guildId,
    channelId: trickOrTreatStateChannelId(channelId),
  }).catch(() => null);
  if (!state || state.type !== "halloweenTrickOrTreat") return;
  await mountRestoredTrickOrTreat(client, { ...cfg, channelId, guildId }, channel, state);
}

async function saveActiveGame(client?, cfg?, payload?) {
  const channelId = cfg?.channelId;
  if (!channelId) return;
  let guildId = cfg?.guildId || null;
  if (!guildId) {
    const channel = await getChannelCached(client, channelId);
    guildId = channel?.guild?.id || null;
  }
  if (!guildId) return;
  await minigameStateFindOneAndUpdate(
    { guildId, channelId },
    { $set: { guildId, channelId, ...payload } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch((err?) => {
    global.logger?.warn?.("[MINIGAMES] saveActiveGame failed", {
      channelId,
      guildId,
      type: payload?.type || null,
      err: err?.message || String(err),
    });
  });
  const endsAt = Number(payload?.endsAt || 0);
  if (Number.isFinite(endsAt) && endsAt > Date.now()) {
    try {
      const { extendChatHubQuietUntil } = require("../../../shared/discord/chatHubBotPacing") as typeof import("../../../shared/discord/chatHubBotPacing");
      // Quiet sul canale reale anche se lo state è sul doc ToT sintetico
      const quietCh = String(channelId).endsWith(TOT_STATE_SUFFIX)
        ? String(channelId).slice(0, -TOT_STATE_SUFFIX.length)
        : channelId;
      extendChatHubQuietUntil(quietCh, endsAt + 90_000);
    } catch (_) {}
  }
}

async function purgeExpiredMinigameDbState(client?, cfg?) {
  const channelId = cfg?.channelId;
  if (!channelId) return;
  let guildId = String(cfg?.guildId || "").trim();
  if (!guildId) {
    const channel = await getChannelCached(client, channelId);
    guildId = String(channel?.guild?.id || "").trim();
  }
  if (!guildId) return;
  const state = await minigameStateFindOneLean({ guildId, channelId }).catch(() => null);
  if (!state) return;
  const endsAt = new Date(state.endsAt).getTime();
  if (endsAt <= Date.now()) {
    const channel = await getChannelCached(client, channelId);
    if (channel) {
      await closeExpiredMinigameState(client, { ...cfg, guildId }, channel, state);
    } else {
      await clearActiveGame(client, { ...cfg, guildId, channelId });
    }
    return;
  }
  const snapshot = { type: state.type };
  restoreHogwartsPodiumFromState(channelId, state, snapshot);
  if (isHogwartsPodiumWinMode(cfg, state.type, snapshot) && isHogwartsPodiumRoundComplete(snapshot, channelId)) {
    const channel = await getChannelCached(client, channelId);
    if (channel) {
      await closeExpiredMinigameState(client, { ...cfg, guildId }, channel, state);
    } else {
      await clearActiveGame(client, { ...cfg, guildId, channelId });
    }
  }
}

async function clearActiveGame(client?, cfg?, gameHint = null) {
  const channelId = cfg?.channelId;
  if (!channelId) return;
  const game = gameHint || activeGames.get(channelId) || null;
  if (game?.basilisk?.announceEndOnFinish) {
    try {
      const { maybeAnnouncePersistentCurseEndAfterMinigame } = require("../Community/hogwartsBasiliskService") as typeof import("../Community/hogwartsBasiliskService");
      await maybeAnnouncePersistentCurseEndAfterMinigame(client, game);
    } catch (err) {
      warnMinigame(err);
    }
  }
  activeGames.delete(channelId);
  clearHogwartsPodiumChannel(channelId);
  blockMinigameRehydrate(channelId);
  let guildId = cfg?.guildId || null;
  if (!guildId) {
    const channel = await getChannelCached(client, channelId);
    guildId = channel?.guild?.id || null;
  }
  if (!guildId) return;
  await minigameStateDeleteOne({ guildId, channelId }).catch(() => { });
  if (!activeGames.has(channelId) && !pendingGames.has(channelId)) {
    try {
      const { scheduleRepostRouletteAfterMinigame } = require("../Community/repostRouletteService") as typeof import("../Community/repostRouletteService");
      scheduleRepostRouletteAfterMinigame(client, guildId, channelId);
    } catch (err) {
      warnMinigame(err);
    }
  }
}

function clearMinigameRoundTimers(game?) {
  if (!game || typeof game !== "object") return;
  if (game.timeout) {
    clearTimeout(game.timeout);
    game.timeout = null;
  }
  if (game.hintTimeout) {
    clearTimeout(game.hintTimeout);
    game.hintTimeout = null;
  }
  if (game.revealTimeout) {
    clearTimeout(game.revealTimeout);
    game.revealTimeout = null;
  }
  if (Array.isArray(game.censorRevealTimeouts)) {
    game.censorRevealTimeouts.forEach((t?) => clearTimeout(t));
    game.censorRevealTimeouts = [];
  }
}

function markMinigameRoundClosed(game?) {
  if (!game || typeof game !== "object") return;
  game._roundClosed = true;
}

function shouldAbortMinigameTimeoutClose(game?, channelId?, options: Record<string, any> = {}) {
  const chId = String(channelId || "").trim();
  if (!game || game._roundClosed) return true;
  if (!chId) return true;
  if (options.allowPersistedClose) return false;
  return !activeGames.has(chId);
}

async function beginMinigameWinClose(client?, cfg?, game = null) {
  const channelId = String(cfg?.channelId || "").trim();
  if (!channelId) return false;
  if (!tryClaimMinigameChannelClose(channelId)) return false;
  const live = activeGames.get(channelId) || game;
  markMinigameRoundClosed(live);
  clearMinigameRoundTimers(live);
  activeGames.delete(channelId);
  let guildId = String(cfg?.guildId || "").trim();
  if (!guildId) {
    const channel = await getChannelCached(client, channelId);
    guildId = String(channel?.guild?.id || "").trim();
  }
  if (guildId) await clearActiveGame(client, { ...cfg, guildId, channelId });
  return true;
}

function endMinigameWinClose(channelId?) {
  channelWinClosing.delete(String(channelId || "").trim());
}

function randomBetween(min?, max?) {
  const a = Math.min(min, max);
  const b = Math.max(min, max);
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

function shuffleString(value?) {
  const arr = String(value || "").split("");
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join("");
}

function normalizeWord(raw?) {
  return String(raw || "")
    .trim()
    .toLowerCase();
}

function normalizeCountryName(raw?) {
  const specials = { "\u00df": "ss", "\u1e9e": "ss", "\u00e6": "ae", "\u00c6": "ae", "\u0153": "oe", "\u0152": "oe", "\u00f8": "o", "\u00d8": "o", "\u00e5": "a", "\u00c5": "a", "\u0142": "l", "\u0141": "l", "\u0111": "d", "\u0110": "d", "\u00f0": "d", "\u00d0": "d", "\u00fe": "th", "\u00de": "th", };
  const replaced = String(raw || "").replace(/[\u00df\u1e9e\u00e6\u00c6\u0153\u0152\u00f8\u00d8\u00e5\u00c5\u0142\u0141\u0111\u0110\u00f0\u00d0\u00fe\u00de]/g, (ch?) => specials[ch] || ch,);
  return replaced
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactNoSpaces(s?) {
  return String(s || "").replace(/\s+/g, "").trim();
}

function normalizeUserAnswerText(raw?) {
  return String(raw || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/[\u0060\u00B4\u2018\u2019\u201A\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, "-")
    .trim();
}

function countNonEmptyUserGuessLines(raw?) {
  return String(raw || "")
    .split(/\r?\n+/)
    .map((l?) => l.trim())
    .filter(Boolean).length;
}

function isMultiLineListingShotgunGuess(raw?) {
  return countNonEmptyUserGuessLines(raw) > 1;
}

function looksLikeInlineAnswerDump(raw?) {
  const single = String(raw || "").trim().replace(/\r?\n+/g, " ").trim();
  if (!single) return false;
  const pipeParts = single.split(/\s*\|\s*/).map((p?) => p.trim()).filter(Boolean);
  if (pipeParts.length >= 3) return true;
  const slashParts = single.split(/\s+\/\s+/).map((p?) => p.trim()).filter(Boolean);
  if (slashParts.length >= 3) return true;
  return false;
}

function isSongAlbumListingShotgunGuess(raw?) {
  return isMultiLineListingShotgunGuess(raw) || looksLikeInlineAnswerDump(raw);
}

async function rejectMinigameShotgunListingGuess(message?, rawContent?, mode?) {
  const hit =
    mode === "songAlbum"
      ? isSongAlbumListingShotgunGuess(rawContent)
      : isMultiLineListingShotgunGuess(rawContent);
  if (!hit) return false;
  await message.react(MINIGAME_WRONG_EMOJI).catch(() => {});
  return true;
}

const CASUAL_MINIGAME_PHRASES = new Set([
  "non e giusto", "non e vero", "non ho amici", "s e buggato", "s e buggata",
  "che schifo", "ma perche", "assurdo", "imbrogliato", "buggato", "buggata", "che casino",
]);

function shouldReactToMinigameWrongAttempt(contentForGuess?, game?) {
  const raw = String(contentForGuess || "").trim();
  if (!raw) return false;
  const norm = normalizeCountryName(raw);
  if (!norm) return false;
  if (CASUAL_MINIGAME_PHRASES.has(norm)) return false;
  const tokens = norm.split(/\s+/).filter(Boolean);
  if (game?.type === "fastType") return norm.length >= 4;
  if (game?.type === "hogwartsMemoryEmoji" || game?.type === "memoryEmoji") {
    return Boolean(normalizeHogwartsMemorySequence(raw));
  }
  if (tokens.length === 1 && tokens[0].length < 3) return false;
  return true;
}

async function reactMinigameNearOrWrong(message?, contentForGuess?, game?, answerPool?, nearOptions: Record<string, any> = {}) {
  if (!shouldReactToMinigameWrongAttempt(contentForGuess, game)) return;
  if (isNearTextGuess(contentForGuess, answerPool, nearOptions)) {
    await message.react("<a:VC_Flame:1482725674711126140>").catch(() => { });
  } else {
    await reactMinigameWrongEmoji(message, game);
  }
}

async function reactMinigameWrongIfAttempt(message?, contentForGuess?, game?) {
  if (!shouldReactToMinigameWrongAttempt(contentForGuess, game)) return;
  await reactMinigameWrongEmoji(message, game);
}

function isValidWord(word?) {
  if (!word) return false;
  if (word.length < 5 || word.length > 6) return false;
  return /^\p{L}+$/u.test(word);
}

function isValidGuessWord(word?) {
  if (!word) return false;
  if (word.length < 4 || word.length > 10) return false;
  return /^\p{L}+$/u.test(word);
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

function collectCountryNames(country?) {
  const names = new Set();
  const add = (value?) => { const normalized = normalizeCountryName(value); if (normalized) names.add(normalized); const compact = buildCompactAlias(value); if (compact) names.add(compact); };
  add(country?.translations?.ita?.common);
  add(country?.translations?.ita?.official);
  add(country?.name?.common);
  add(country?.name?.official);
  const nativeNames = country?.name?.nativeName || {};
  for (const key of Object.keys(nativeNames)) {
    add(nativeNames[key]?.common);
    add(nativeNames[key]?.official);
  }
  const translations = country?.translations || {};
  for (const key of Object.keys(translations)) {
    add(translations[key]?.common);
    add(translations[key]?.official);
  }
  const altSpellings = Array.isArray(country?.altSpellings) ? country.altSpellings : [];
  for (const alt of altSpellings) add(alt);
  return Array.from(names.values());
}

function isLikelyFamousCapitalCountry(countryDisplay?, aliases = [], cfg: Record<string, any> = {}) {
  const customFamous = Array.isArray(cfg?.guessCapital?.famousCountries) ? cfg.guessCapital.famousCountries : [];
  const allowlist = new Set([
    ...Array.from(FAMOUS_CAPITAL_COUNTRIES),
    ...customFamous.map((value?) => normalizeCountryName(value)).filter(Boolean),
  ]);
  const normalizedDisplay = normalizeCountryName(countryDisplay);
  if (normalizedDisplay && allowlist.has(normalizedDisplay)) return true;
  for (const alias of aliases) {
    const normalizedAlias = normalizeCountryName(alias);
    if (normalizedAlias && allowlist.has(normalizedAlias)) return true;
  }
  return false;
}

function isWellKnownFlagCountry(displayName?, namesArray = [], cfg: Record<string, any> = {}) {
  const custom = Array.isArray(cfg?.guessFlag?.famousCountries) ? cfg.guessFlag.famousCountries : [];
  const allowlist = new Set([
    ...Array.from(FLAG_WELL_KNOWN_COUNTRIES),
    ...custom.map((v?) => normalizeCountryName(v)).filter(Boolean),
  ]);
  const normalizedDisplay = normalizeCountryName(displayName);
  if (normalizedDisplay && allowlist.has(normalizedDisplay)) return true;
  for (const n of namesArray || []) {
    const norm = normalizeCountryName(n);
    if (norm && allowlist.has(norm)) return true;
  }
  return false;
}

async function loadCountryList(cfg?) {
  const now = Date.now();
  if (cachedCountries && now - cachedCountriesAt < COUNTRY_CACHE_TTL_MS)
    return cachedCountries;

  let apiUrl = cfg?.guessFlag?.apiUrl;
  if (apiUrl && apiUrl.includes("restcountries.com") && apiUrl.includes("fields=")) {
    apiUrl = apiUrl.replace(/fields=([^&]+)/, (_?, f?) => `fields=${f},region,subregion,population,languages`);
  }
  let list = [];
  if (apiUrl) {
    try {
      const res = await axios.get(apiUrl, { timeout: 15000 });
      if (Array.isArray(res?.data)) {
        list = res.data;
      }
    } catch (err) {
      warnMinigame(err);
    }
  }

  const MIN_POPULATION_FOR_FLAG = 280000;
  const REGION_LABELS = { Europe: "Europa", Africa: "Africa", Americas: "Americhe", Asia: "Asia", Oceania: "Oceania", Antarctic: "Antartide" };
  const useWellKnownOnly = cfg?.guessFlag?.useWellKnownOnly !== false;
  const mapped = list.map((country?) => {
    const names = collectCountryNames(country);
    const flagUrl = country?.flags?.png || country?.flags?.svg || country?.flags?.[0];
    const displayName = country?.translations?.ita?.common || country?.name?.common || country?.name?.official || null;
    if (!names.length || !flagUrl || !displayName) return null;
    const pop = country?.population;
    if (Number.isFinite(pop) && pop < MIN_POPULATION_FOR_FLAG) return null;
    const region = country?.region;
    const subregion = country?.subregion;
    const langs = country?.languages;
    let populationLabel = null;
    if (Number.isFinite(pop)) {
      if (pop >= 1_000_000_000) populationLabel = `~${(pop / 1_000_000_000).toFixed(1)} miliardi`;
      else if (pop >= 1_000_000) populationLabel = `~${Math.round(pop / 1_000_000)} milioni`;
      else if (pop >= 1_000) populationLabel = `~${Math.round(pop / 1_000)} mila`;
      else populationLabel = `~${pop}`;
    }
    const languageNames = langs && typeof langs === "object" ? Object.values(langs).slice(0, 2) : [];
    return {
      names,
      flagUrl,
      displayName,
      region: region ? (REGION_LABELS[region] || region) : null,
      subregion: subregion || null,
      populationLabel: populationLabel || null,
      languages: languageNames.length ? languageNames : null,
    };
  }).filter(Boolean).filter((item?) => !useWellKnownOnly || isWellKnownFlagCountry(item.displayName, item.names, cfg));
  cachedCountries = mapped;
  cachedCountriesAt = now;
  return cachedCountries;
}

const ALLOWED_REWARD_EXP = [100, 150, 200, 250];

function normalizeRewardExp(value?) {
  const num = Number(value);
  if (!Number.isFinite(num)) return ALLOWED_REWARD_EXP[0];
  let best = ALLOWED_REWARD_EXP[0];
  let bestDist = Math.abs(num - best);
  for (const a of ALLOWED_REWARD_EXP) {
    const d = Math.abs(num - a);
    if (d < bestDist) {
      bestDist = d;
      best = a;
    }
  }
  return best;
}

function shuffleArray(arr = []) {
  if (!Array.isArray(arr) || arr.length <= 1) return arr;
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pickRandomItem(list = []) {
  if (!Array.isArray(list) || !list.length) return null;
  return list[randomBetween(0, list.length - 1)] || null;
}

function getRecentQuestionKey(questionKey?) {
  return String(questionKey || "").trim().toLowerCase();
}

function isQuestionKeyRecent(channelId?, type?, questionKey?, recentLimit = 20) {
  if (!channelId || !type) return false;
  const key = `${channelId}:${type}`;
  const recent = recentQuestionKeysByChannel.get(key) || [];
  const k = getRecentQuestionKey(questionKey);
  return k && recent.includes(k);
}

function pushQuestionKeyToRecent(channelId?, type?, questionKey?, recentLimit = 20) {
  if (!channelId || !type) return;
  const k = getRecentQuestionKey(questionKey);
  if (!k) return;
  const key = `${channelId}:${type}`;
  const recent = recentQuestionKeysByChannel.get(key) || [];
  const next = recent.filter((x?) => x !== k);
  next.push(k);
  while (next.length > Math.max(5, Number(recentLimit || 20))) next.shift();
  recentQuestionKeysByChannel.set(key, next);
}

function pickQuestionAvoidRecent(channelId?, type?, list = [], keySelector?, recentLimit = 20) {
  if (!channelId || !type || !Array.isArray(list) || !list.length) {
    return pickRandomItem(shuffleArray(list));
  }
  const key = `${channelId}:${type}`;
  const recent = recentQuestionKeysByChannel.get(key) || [];
  const seen = new Set(recent);
  const shuffled = shuffleArray(list);
  const pool = shuffled.filter((item?) => { const k = getRecentQuestionKey(keySelector?.(item)); if (!k) return true; return !seen.has(k); });
  const picked = pickRandomItem(pool.length ? pool : shuffled);
  if (!picked) return null;
  const pickedKey = getRecentQuestionKey(keySelector?.(picked));
  if (pickedKey) pushQuestionKeyToRecent(channelId, type, pickedKey, recentLimit);
  return picked;
}

function parseStateTarget(rawTarget?, fallback: Record<string, any> = {}) {
  try {
    const parsed = JSON.parse(rawTarget || "{}");
    if (parsed && typeof parsed === "object") return parsed;
  } catch (err) {
    warnMinigame(err);
  }
  return fallback;
}

function decodeHtmlEntities(value?) {
  return String(value || "")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function safeDecodeURIComponent(value?) {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return String(value || "");
  }
}

function decodeQuizText(value?) {
  return decodeHtmlEntities(safeDecodeURIComponent(value));
}

function isLikelyItalianText(value?) {
  const normalized = normalizeCountryName(value);
  if (!normalized) return false;
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;

  const italianHints = new Set(["il", "lo", "la", "i", "gli", "le", "un", "una", "di", "del", "della", "che", "con", "per", "quale", "quando", "dove", "come", "chi", "quanti", "cosa",]);
  const englishHints = new Set(["the", "what", "which", "when", "where", "who", "how", "is", "are", "was", "were", "of", "in", "on",]);

  let itScore = 0;
  let enScore = 0;
  for (const token of tokens) {
    if (italianHints.has(token)) itScore += 1;
    if (englishHints.has(token)) enScore += 1;
  }

  return itScore >= enScore;
}

function polishItalianQuestionText(value?) {
  const src = String(value || "").replace(/\s+/g, " ").trim();
  if (!src) return "";
  return src
    .replace(/\bd\s+Italia\b/gi, "d'Italia")
    .replace(/\bl\s+Italia\b/gi, "l'Italia")
    .replace(/\bl\s+unità\b/gi, "l'unità")
    .replace(/\bQual e\b/gi, "Qual è")
    .replace(/\bpiu\b/gi, "più");
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

async function fetchWikiRegionImage(regionName?) {
  const normalized = String(regionName || "").trim();
  if (!normalized) return null;
  if (regionImageCache.has(normalized)) return regionImageCache.get(normalized);

  const titles = [normalized, `${normalized}(regione italiana)`,
    `Regione ${normalized}`,
  ];

  for (const title of titles) {
    const url = `https://it.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    try {
      const res = await axios.get(url, { timeout: 12000 });
      const image = res?.data?.thumbnail?.source || res?.data?.originalimage?.source || null;
      if (image) {
        regionImageCache.set(normalized, image);
        return image;
      }
    } catch (err) {
      warnMinigame(err);
    }
  }

  regionImageCache.set(normalized, null);
  return null;
}

async function loadCapitalQuestionBank(cfg?) {
  const now = Date.now();
  if (
    cachedCapitalQuestions &&
    now - cachedCapitalQuestionsAt < CAPITAL_CACHE_TTL_MS
  ) {
    return cachedCapitalQuestions;
  }

  const apiUrl = cfg?.guessCapital?.apiUrl || "https://restcountries.com/v3.1/all?fields=name,translations,capital,flags";
  const out = [];
  try {
    const res = await axios.get(apiUrl, { timeout: 15000 });
    const list = Array.isArray(res?.data) ? res.data : [];
    for (const country of list) {
      const countryDisplay = country?.translations?.ita?.common || country?.name?.common || null;
      const capitals = Array.isArray(country?.capital) ? country.capital : [];
      const image = country?.flags?.png || country?.flags?.svg || null;
      if (!countryDisplay || !capitals.length) continue;
      const countryAliases = collectCountryNames(country);
      if (!isLikelyFamousCapitalCountry(countryDisplay, countryAliases, cfg)) continue;
      const capitalNames = [...capitals];
      for (const cap of capitals) {
        const it = CAPITAL_ITALIAN[String(cap || "").trim()];
        if (it && !capitalNames.includes(it)) capitalNames.push(it);
      }
      const aliases = buildAliases(capitalNames);
      if (!aliases.length) continue;
      out.push({ country: String(countryDisplay), answers: aliases, image });
    }
  } catch (err) {
    warnMinigame(err);
  }

  cachedCapitalQuestions = out.length ? out : getCapitalQuizBank().map((row?) => ({ country: row.country, answers: row.answers, image: null }));
  cachedCapitalQuestionsAt = now;
  return cachedCapitalQuestions;
}

let cachedReverseCapitalQuestions = null;
let cachedReverseCapitalQuestionsAt = 0;

async function loadReverseCapitalQuestionBank(cfg?) {
  const now = Date.now();
  if (
    cachedReverseCapitalQuestions &&
    now - cachedReverseCapitalQuestionsAt < CAPITAL_CACHE_TTL_MS
  ) {
    return cachedReverseCapitalQuestions;
  }
  const apiUrl = cfg?.guessReverseCapital?.apiUrl || cfg?.guessCapital?.apiUrl || "https://restcountries.com/v3.1/all?fields=name,translations,capital,flags";
  const out = [];
  try {
    const res = await axios.get(apiUrl, { timeout: 15000 });
    const list = Array.isArray(res?.data) ? res.data : [];
    for (const country of list) {
      const countryDisplay = country?.translations?.ita?.common || country?.name?.common || null;
      const capitals = Array.isArray(country?.capital) ? country.capital : [];
      const image = country?.flags?.png || country?.flags?.svg || null;
      if (!countryDisplay || !capitals.length) continue;
      const countryAliases = collectCountryNames(country);
      if (!isLikelyFamousCapitalCountry(countryDisplay, countryAliases, cfg)) continue;
      const answers = buildAliases(countryAliases);
      if (!answers.length) continue;
      for (const cap of capitals) {
        const capitalStr = String(cap || "").trim();
        if (!capitalStr) continue;
        out.push({ capital: capitalStr, country: String(countryDisplay), answers, image });
      }
    }
  } catch (err) {
    warnMinigame(err);
  }
  cachedReverseCapitalQuestions = out.length ? out : [];
  cachedReverseCapitalQuestionsAt = now;
  return cachedReverseCapitalQuestions;
}

async function loadRegionCapitalQuestionBank(cfg?) {
  const now = Date.now();
  if (
    cachedRegionCapitalQuestions &&
    now - cachedRegionCapitalQuestionsAt < REGION_CAPITAL_CACHE_TTL_MS
  ) {
    return cachedRegionCapitalQuestions;
  }

  const apiUrl = cfg?.guessRegionCapital?.apiUrl || null;
  const out = [];
  if (apiUrl) {
    try {
      const res = await axios.get(apiUrl, { timeout: 15000 });
      const list = Array.isArray(res?.data) ? res.data : Array.isArray(res?.data?.data) ? res.data.data : [];
      for (const row of list) {
        const region = row?.region || row?.regione || row?.name || null;
        const capital = row?.capital || row?.capoluogo || null;
        if (!region || !capital) continue;
        const answers = buildAliases(Array.isArray(capital) ? capital : [capital],);
        if (!answers.length) continue;
        out.push({ region: String(region), answers });
      }
    } catch (err) {
      warnMinigame(err);
    }
  }

  if (!out.length) {
    for (const row of getItalianRegionCapitalBank()) {
      const region = row?.region || null;
      const answers = buildAliases(row?.answers || []);
      if (!region || !answers.length) continue;
      out.push({ region: String(region), answers });
    }
  }

  cachedRegionCapitalQuestions = out;
  cachedRegionCapitalQuestionsAt = now;
  return cachedRegionCapitalQuestions;
}

async function loadFootballTeamsFromApi(cfg?) {
  const now = Date.now();
  if (cachedTeams && now - cachedTeamsAt < TEAM_CACHE_TTL_MS)
    return cachedTeams;
  if (isSportsDbCoolingDown()) {
    return Array.isArray(cachedTeams) ? cachedTeams : [];
  }

  const apiBase = cfg?.guessTeam?.apiUrl || "https://www.thesportsdb.com/api/v1/json/123/search_all_teams.php?l=";
  const leagues = Array.isArray(cfg?.guessTeam?.leagues) && cfg.guessTeam.leagues.length ? cfg.guessTeam.leagues : DEFAULT_FOOTBALL_LEAGUES;
  const out = [];
  for (const league of leagues) {
    if (isSportsDbCoolingDown()) break;
    try {
      const url = `${apiBase}${encodeURIComponent(league)}`;
      const res = await axios.get(url, { timeout: 15000 });
      const teams = Array.isArray(res?.data?.teams) ? res.data.teams : [];
      for (const team of teams) {
        if (!isLikelyFamousTeam(team, cfg)) continue;
        const name = team?.strTeam;
        const badge = team?.strBadge || null;
        if (!name || !badge) continue;
        const normKey = normalizeCountryName(name);
        const italian = TEAM_ITALIAN_MAP.get(normKey);
        const displayName = italian?.display ?? name;
        const aliasSources = [name, team?.strTeamShort, team?.strTeamAlternate, displayName, ...(italian?.extraAliases ?? [])].filter(Boolean);
        const aliases = buildAliases(aliasSources);
        if (!aliases.length) continue;
        out.push({ team: displayName, teamId: team?.idTeam ? String(team.idTeam) : null, league, answers: aliases, image: badge });
      }
    } catch (err) {
      if (isThesportsdb429(err)) {
        noteSportsDb429(err);
        if (Array.isArray(cachedTeams) && cachedTeams.length) return cachedTeams;
        return out;
      }
      warnMinigame(err);
    }
  }

  cachedTeams = out;
  cachedTeamsAt = now;
  return cachedTeams;
}

const DEFAULT_ONLY_FAMOUS_MIN_FANS = 50000;
const FALLBACK_MIN_FANS = 20000;
const MIN_SINGERS_AFTER_FILTER = 15;

async function loadSingersFromApi(cfg?) {
  const now = Date.now();
  if (cachedSingers && now - cachedSingersAt < SINGER_CACHE_TTL_MS)
    return cachedSingers;

  const apiUrl = cfg?.guessSinger?.apiUrl || "https://api.deezer.com/chart/0/artists?limit=100";
  const minFans = Number(cfg?.guessSinger?.onlyFamousMinFans ?? DEFAULT_ONLY_FAMOUS_MIN_FANS) || 0;
  const out = [];
  try {
    const res = await axios.get(apiUrl, { timeout: 15000 });
    const list = Array.isArray(res?.data?.data) ? res.data.data : [];
    for (const artist of list) {
      const name = artist?.name;
      const image = pickBestSingerImage(artist);
      if (!name) continue;
      const fans = Number(artist?.nb_fan ?? 0);
      if (minFans > 0 && fans < minFans) continue;
      out.push({ name, answers: buildAliases([name]), image });
    }
    if (minFans > 0 && out.length < MIN_SINGERS_AFTER_FILTER) {
      out.length = 0;
      const fallback = Number(cfg?.guessSinger?.fallbackMinFans ?? FALLBACK_MIN_FANS) || FALLBACK_MIN_FANS;
      for (const artist of list) {
        const name = artist?.name;
        const image = pickBestSingerImage(artist);
        if (!name) continue;
        if (Number(artist?.nb_fan ?? 0) < fallback) continue;
        out.push({ name, answers: buildAliases([name]), image });
      }
    }
  } catch (err) {
    warnMinigame(err);
  }
  cachedSingers = out;
  cachedSingersAt = now;
  return cachedSingers;
}

function isDeezerArtistPlaceholderImage(url?) {
  const value = String(url || "").trim();
  if (!value) return true;
  if (!/^https?:\/\//i.test(value)) return true;
  if (/api\.deezer\.com\/artist\/\d+\/image/i.test(value)) return true;
  if (/\/images\/artist\/\/+/i.test(value)) return true;
  if (/\/images\/artist\/[^/]+\/\d+x\d+-000000-80-0-0\.(jpg|png|webp)$/i.test(value))
    return true;
  return false;
}

function pickBestSingerImage(artist?) {
  const candidates = [artist?.picture_xl, artist?.picture_big, artist?.picture_medium, artist?.picture_small, artist?.picture,].filter(Boolean);
  for (const candidate of candidates) {
    if (!isDeezerArtistPlaceholderImage(candidate)) return candidate;
  }
  return null;
}

async function fetchSingerImageFallback(name?, cfg?) {
  const artistName = String(name || "").trim();
  if (!artistName) return null;

  const cacheKey = normalizeCountryName(artistName);
  const cached = singerImageFallbackCache.get(cacheKey);
  if (cached && Date.now() - cached.at < SINGER_IMAGE_FALLBACK_TTL_MS) {
    return cached.url || null;
  }

  const fallbackApi = cfg?.guessSinger?.fallbackApiUrl || "https://www.theaudiodb.com/api/v1/json/2/search.php";
  try {
    const res = await axios.get(fallbackApi, { params: { s: artistName }, timeout: 15000, });
    const artists = Array.isArray(res?.data?.artists) ? res.data.artists : [];
    const best = artists.find((a?) => normalizeCountryName(a?.strArtist) === normalizeCountryName(artistName),);
    const picked = best || artists[0];
    const fallbackUrl = picked?.strArtistThumb || picked?.strArtistFanart || picked?.strArtistFanart2 || picked?.strArtistFanart3 || null;
    const url = isDeezerArtistPlaceholderImage(fallbackUrl) ? null : fallbackUrl;
    singerImageFallbackCache.set(cacheKey, { url, at: Date.now() });
    return url;
  } catch {
    singerImageFallbackCache.set(cacheKey, { url: null, at: Date.now() });
    return null;
  }
}

async function loadAlbumsFromApi(cfg?) {
  const now = Date.now();
  if (cachedAlbums && now - cachedAlbumsAt < ALBUM_CACHE_TTL_MS)
    return cachedAlbums;

  const onlyFamousArtists = cfg?.guessAlbum?.onlyFamousArtists !== false;
  let famousArtistNames = null;
  if (onlyFamousArtists) {
    const singers = await loadSingersFromApi(cfg);
    famousArtistNames = new Set(singers.map((s?) => normalizeCountryName(s?.name)).filter(Boolean));
  }

  const apiUrl = cfg?.guessAlbum?.apiUrl || "https://api.deezer.com/chart/0/albums?limit=100";
  const out = [];
  try {
    const res = await axios.get(apiUrl, { timeout: 15000 });
    const list = Array.isArray(res?.data?.data) ? res.data.data : [];
    for (const album of list) {
      const title = album?.title;
      const artist = album?.artist?.name || "Artista sconosciuto";
      const image = album?.cover_xl || album?.cover_big || album?.cover_medium || album?.cover || null;
      if (!title || !image) continue;
      if (onlyFamousArtists && famousArtistNames && !famousArtistNames.has(normalizeCountryName(artist)))
        continue;
      out.push({ album: title, artist, answers: buildAliases([title]), image });
    }
  } catch (err) {
    warnMinigame(err);
  }

  cachedAlbums = out;
  cachedAlbumsAt = now;
  return cachedAlbums;
}

function normalizePlayerGuess(raw?) {
  return normalizeCountryName(raw);
}

function normalizeSongGuess(raw?) {
  return normalizeCountryName(raw);
}

const LOOSE_STOPWORDS = new Set(["a", "an", "the", "of", "and", "or", "di", "del", "della", "dello", "dei", "degli", "da", "de", "d", "l", "il", "lo", "la", "i", "gli", "le", "feat", "ft", "featuring", "with",]);

function toMeaningfulTokens(raw?, minTokenLength = 3) {
  return String(raw || "")
    .split(/\s+/)
    .map((t?) => t.trim())
    .filter(Boolean)
    .filter((t?) => t.length >= minTokenLength)
    .filter((t?) => !LOOSE_STOPWORDS.has(t));
}

function buildCompactAlias(value?) {
  const normalized = normalizeCountryName(value);
  if (!normalized) return null;
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) return null;
  const compact = tokens.filter((t?) => t.length > 1).join(" ").trim();
  if (!compact || compact === normalized) return null;
  return compact;
}

function buildSongAnswerAliases(rawTitle?) {
  const raw = String(rawTitle || "").trim();
  if (!raw) return [];

  const aliases = new Set();
  const add = (value?) => { const normalized = normalizeSongGuess(value); if (normalized) aliases.add(normalized); const compact = buildCompactAlias(value); if (compact) aliases.add(compact); };

  add(raw);

  const withoutBrackets = raw.replace(/\s*[\(\[\{][^\)\]\}]*[\)\]\}]\s*/g, " ").replace(/\s+/g, " ").trim();
  add(withoutBrackets);

  const withoutFeat = raw.replace(/\s+(feat\.?|ft\.?|featuring|with)\s+.+$/i, "").trim();
  add(withoutFeat);
  add(
    withoutFeat
      .replace(/\s*[\(\[\{][^\)\]\}]*[\)\]\}]\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );

  const dashParts = raw.split(/\s(?:-|–|—)\s/).map((p?) => p.trim()).filter(Boolean);
  if (dashParts.length >= 2) {
    const left = dashParts[0];
    const right = dashParts.slice(1).join(" ");
    if (
      /(remaster|version|edit|mix|live|acoustic|karaoke|instrumental|bonus|mono|stereo|radio|explicit|clean|sped|slowed|rework|demo|deluxe|anniversary|session|soundtrack|from)\b/i.test(
        right,
      )
    ) {
      add(left);
    }
  }

  for (const part of raw
    .split(/[\/|]/g)
    .map((p?) => p.trim())
    .filter(Boolean)) {
    add(part);
  }

  return Array.from(aliases.values());
}

function isSongGuessCorrect(rawGuess?, rawAnswers?) {
  return isLooseAliasGuessCorrect(rawGuess, rawAnswers, normalizeSongGuess, {
    minGuessLength: 4,
    minTokenLength: 3,
    singleTokenMinLength: 6,
  });
}

function isSingerGuessCorrect(rawGuess?, rawAnswers?) {
  // Solo match completo (niente solo cognome).
  return isStrictAliasGuessCorrect(rawGuess, rawAnswers, normalizeCountryName);
}

function normalizeTruthValue(raw?) {
  const v = normalizeCountryName(raw);
  if (!v) return null;
  if (["vero", "v", "true", "t", "si", "sì", "yes", "y"].includes(v)) return true;
  if (["falso", "f", "false", "no", "n"].includes(v)) return false;
  return null;
}

function buildAliases(values = []) {
  const out = new Set();
  for (const value of values) {
    const normalized = normalizeCountryName(value);
    if (normalized) out.add(normalized);
    const compact = buildCompactAlias(value);
    if (compact) out.add(compact);
  }
  return Array.from(out.values());
}

function buildStrictBankAliases(values = [], normalizer = normalizeCountryName) {
  const out = new Set();
  for (const value of values) {
    const normalized = normalizer(value);
    if (normalized) out.add(normalized);
    const compact = buildCompactAlias(value);
    if (compact) out.add(compact);
    const nospace = compactNoSpaces(normalized);
    if (nospace && nospace !== normalized) out.add(nospace);
  }
  return Array.from(out.values());
}

function getExplicitBankSourceAnswers(rawAnswers?) {
  return (Array.isArray(rawAnswers) ? rawAnswers : [rawAnswers])
    .map((a?) => String(a || "").trim())
    .filter(Boolean);
}

function isExplicitBankAnswerCorrect(rawGuess?, rawAnswers?, normalizer = normalizeCountryName, _minTokenLength = 1) {
  // Risposta intera: niente token-set / pezzi della frase.
  return isStrictAliasGuessCorrect(rawGuess, rawAnswers, normalizer);
}

function normalizeQuizQuestionKey(questionText?) {
  return normalizeCountryName(polishItalianQuestionText(questionText) || questionText);
}

function findHogwartsQuizBankRow(questionText?) {
  const key = normalizeQuizQuestionKey(questionText);
  if (!key) return null;
  return findHogwartsQuizBankRowByKey(key);
}

function findHogwartsQuizBankRowByKey(questionKey?) {
  const key = String(questionKey || "").trim();
  if (!key) return null;
  for (const row of getHogwartsQuizBank()) {
    const rowKey = normalizeQuizQuestionKey(row?.question);
    if (rowKey && rowKey === key) return row;
  }
  return null;
}

function getHogwartsQuizBankSignature(bank?) {
  const list = Array.isArray(bank) ? bank : [];
  return list
    .map((row?, index?) => `${index}:${normalizeQuizQuestionKey(row?.question)}`)
    .filter((entry?) => !entry.endsWith(":"))
    .join("\x1e");
}

function buildHogwartsQuizDeckQueue(bank?) {
  const list = Array.isArray(bank) ? bank : [];
  const indices = [];
  for (let i = 0; i < list.length; i += 1) {
    const row = list[i];
    if (!row?.question || !Array.isArray(row?.answers) || !row.answers.length) continue;
    indices.push(i);
  }
  return shuffleArray(indices);
}

function pickNextHogwartsQuizFromDeck(channelId?) {
  const bank = getHogwartsQuizBank();
  if (!bank.length) return null;
  const deckKey = String(channelId || "").trim() || "__hogwarts_quiz__";
  const bankSig = getHogwartsQuizBankSignature(bank);
  let deck = hogwartsQuizDeckByChannel.get(deckKey);
  if (!deck || deck.bankSig !== bankSig || !Array.isArray(deck.queue) || !deck.queue.length) {
    deck = { bankSig, queue: buildHogwartsQuizDeckQueue(bank) };
    hogwartsQuizDeckByChannel.set(deckKey, deck);
  }
  const index = deck.queue.shift();
  const pick = bank[Number(index)] || null;
  if (!pick?.question || !Array.isArray(pick?.answers) || !pick.answers.length) {
    deck.queue = buildHogwartsQuizDeckQueue(bank);
    hogwartsQuizDeckByChannel.set(deckKey, deck);
    const retryIndex = deck.queue.shift();
    return bank[Number(retryIndex)] || null;
  }
  if (!deck.queue.length) {
    deck.queue = buildHogwartsQuizDeckQueue(bank);
    hogwartsQuizDeckByChannel.set(deckKey, deck);
  }
  return pick;
}

function addValuesToHogwartsQuizPool(pool?, values?) {
  if (!Array.isArray(values) || !values.length) return;
  const cleaned = values.map((a?) => String(a || "").trim()).filter(Boolean);
  if (!cleaned.length) return;
  for (const alias of buildStrictBankAliases(cleaned)) {
    if (alias) pool.add(alias);
  }
}

function resolveHogwartsQuizAnswerPool(game?) {
  const pool = new Set();
  const row =
    findHogwartsQuizBankRow(game?.question) ||
    findHogwartsQuizBankRowByKey(game?.questionKey);
  if (row?.answers?.length) {
    addValuesToHogwartsQuizPool(pool, row.answers);
    if (game && typeof game === "object") {
      game.sourceAnswers = row.answers.map((a?) => String(a || "").trim()).filter(Boolean);
      game.questionKey = normalizeQuizQuestionKey(row.question);
      game.answers = [...pool];
    }
  }
  addValuesToHogwartsQuizPool(pool, game?.sourceAnswers);
  if (!pool.size) {
    const legacy = Array.isArray(game?.answers)
      ? game.answers.map((a?) => String(a || "").trim()).filter(Boolean)
      : [];
    if (legacy.length) {
      const looksNormalized = legacy.every((a?) => /^[a-z0-9\s]+$/.test(a));
      if (looksNormalized) legacy.forEach((a?) => pool.add(a));
      else addValuesToHogwartsQuizPool(pool, legacy);
    }
  }
  return [...pool];
}

function getHogwartsQuizSourceAnswers(game?) {
  const fromGame = Array.isArray(game?.sourceAnswers) ? game.sourceAnswers : [];
  if (fromGame.length) {
    return fromGame.map((a?) => String(a || "").trim()).filter(Boolean);
  }
  const row =
    findHogwartsQuizBankRow(game?.question) ||
    findHogwartsQuizBankRowByKey(game?.questionKey);
  if (row?.answers?.length) {
    return row.answers.map((a?) => String(a || "").trim()).filter(Boolean);
  }
  return [];
}

function hogwartsQuizAnswerTokenCount(raw?, minTokenLength = 1) {
  return toMeaningfulTokens(normalizeCountryName(raw), minTokenLength).length;
}

function isCompleteHogwartsTokenSetMatch(rawGuess?, rawAnswer?, minTokenLength = 1) {
  const guessTokens = toMeaningfulTokens(normalizeCountryName(rawGuess), minTokenLength);
  const answerTokens = toMeaningfulTokens(normalizeCountryName(rawAnswer), minTokenLength);
  if (answerTokens.length < 2) return false;
  if (guessTokens.length !== answerTokens.length) return false;
  const answerSet = new Set(answerTokens);
  return guessTokens.every((token?) => answerSet.has(token));
}

function isHogwartsQuizGuessCorrect(rawGuess?, game?, poolIn?) {
  const sourceAnswers = getHogwartsQuizSourceAnswers(game);
  if (sourceAnswers.length) {
    return isExplicitBankAnswerCorrect(rawGuess, sourceAnswers, normalizeCountryName, 1);
  }
  const pool = Array.isArray(poolIn) && poolIn.length ? poolIn : resolveHogwartsQuizAnswerPool(game);
  return isExplicitBankAnswerCorrect(rawGuess, pool, normalizeCountryName, 1);
}

function getHogwartsCharacterSourceAnswers(game?) {
  const name = String(game?.displayName || "").trim();
  const aliases = Array.isArray(game?.sourceAliases) ? game.sourceAliases : [];
  return [name, ...aliases.map((a?) => String(a || "").trim())].filter(Boolean);
}

async function reactMinigameWin(message?) {
  let reacted = false;
  try {
    await message.react(MINIGAME_WIN_EMOJI);
    reacted = true;
  } catch (err) {
    warnMinigame(err);
  }
  if (!reacted) {
    await message.react(MINIGAME_CORRECT_FALLBACK_EMOJI).catch(() => {});
  }
}

function createMathQuestion() {
  const formatAnswer = (value?) => { const num = Number(value); if (!Number.isFinite(num)) return String(value); if (Math.abs(num - Math.round(num)) < 1e-9) return String(Math.round(num)); return String(Number(num.toFixed(2))); };

  const generators = [() => {
    const a = randomBetween(2, 60); const b = randomBetween(2, 60); const c = randomBetween(2, 40); return {
      expression: `${a}+${b}+${c}`,
      answer: formatAnswer(a + b + c),
    };
  },
  () => {
    let a = randomBetween(40, 120);
    const b = randomBetween(2, 50);
    const c = randomBetween(2, 30);
    if (a < b + c) a = b + c + randomBetween(5, 25);
    return {
      expression: `${a}-${b}-${c}`,
      answer: formatAnswer(a - b - c),
    };
  },
  () => {
    const a = randomBetween(2, 14);
    const b = randomBetween(2, 12);
    const c = randomBetween(2, 6);
    return {
      expression: `${a}×${b}×${c}`,
      answer: formatAnswer(a * b * c),
    };
  },
  () => {
    const divisor = randomBetween(2, 12);
    const result = randomBetween(2, 20);
    const dividend = divisor * result;
    return {
      expression: `${dividend}÷${divisor}`,
      answer: formatAnswer(result),
    };
  },
  () => {
    const root = randomBetween(2, 20);
    const n = root * root;
    return {
      expression: `√${n}`,
      answer: formatAnswer(root),
    };
  },
  () => {
    const a = randomBetween(2, 18);
    const b = randomBetween(2, 12);
    const c = randomBetween(2, 20);
    const d = randomBetween(2, 14);
    const left = a * b;
    return {
      expression: `(${a}×${b})+${c}-${d}`,
      answer: formatAnswer(left + c - d),
    };
  },
  () => {
    const root = randomBetween(2, 12);
    const n = root * root;
    const a = randomBetween(2, 30);
    const b = randomBetween(2, 20);
    return {
      expression: `√${n}+${a}-${b}`,
      answer: formatAnswer(root + a - b),
    };
  },
  ];

  const pick = generators[randomBetween(0, generators.length - 1)];
  return pick();
}

function parseMathGuess(raw?) {
  const compact = normalizeUserAnswerText(raw).replace(/\s+/g, "");
  if (!compact) return null;
  if (/[\p{L}]/u.test(compact)) return null;
  const base = compact.replace(/[^0-9+\-*/().,×÷]/g, "").replace(/,/g, ".").replace(/×/g, "*").replace(/÷/g, "/");
  if (!base) return null;
  if (/^-?\d+(\.\d+)?$/.test(base)) {
    const value = Number(base);
    return Number.isFinite(value) ? value : null;
  }
  if (!/^[0-9+\-*/().]+$/.test(base)) return null;
  try {
    const evaluated = Number(Function(`"use strict"; return (${base});`)());
    return Number.isFinite(evaluated) ? evaluated : null;
  } catch {
    return null;
  }
}

function wrapPromptText(ctx?, text?, maxWidth?) {
  const source = String(text || "").replace(/\s+/g, " ").trim();
  if (!source) return [""];
  const words = source.split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    if (ctx.measureText(word).width <= maxWidth) {
      current = word;
      continue;
    }
    let chunk = "";
    for (const ch of word) {
      const chunkCandidate = `${chunk}${ch}`;
      if (ctx.measureText(chunkCandidate).width <= maxWidth) {
        chunk = chunkCandidate;
      } else {
        if (chunk) lines.push(chunk);
        chunk = ch;
      }
    }
    current = chunk;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [source];
}

function buildFastTypePromptImage(phrase?, labelText = "Scrivi esattamente questa frase") {
  try {
    registerCanvasFonts(canvasModule);
    const width = 1200;
    const height = 420;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    const padding = CANVAS_STYLE.padding;
    const radius = 20;

    fillCanvasBackground(ctx, width, height);
    const cardX = padding;
    const cardY = padding;
    const cardW = width - padding * 2;
    const cardH = height - padding * 2;
    fillCanvasCard(ctx, cardX, cardY, cardW, cardH, radius);

    const phraseText = String(phrase || "").trim() || "...";
    const usableWidth = cardW - 80;
    ctx.font = fontStackPrimaryOnly(42, "700");
    const phraseLines = wrapPromptText(ctx, phraseText, usableWidth);
    const lineHeight = 54;
    const totalPhraseHeight = phraseLines.length * lineHeight;
    const labelHeight = 36;
    const gapLabelPhrase = 16;
    const totalContentHeight = labelHeight + gapLabelPhrase + totalPhraseHeight;
    const contentStartY = cardY + (cardH - totalContentHeight) / 2;

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = CANVAS_STYLE.titleColor;
    ctx.font = fontStackPrimaryOnly(28, "600");
    ctx.fillText(String(labelText || "Scrivi esattamente questa frase"), width / 2, contentStartY);

    let phraseY = contentStartY + labelHeight + gapLabelPhrase;
    ctx.font = fontStackPrimaryOnly(42, "700");
    ctx.fillStyle = CANVAS_STYLE.bodyColor;
    for (const line of phraseLines) {
      ctx.fillText(line, width / 2, phraseY, usableWidth);
      phraseY += lineHeight;
    }

    const name = "fast_type.png";
    return new AttachmentBuilder(canvas.toBuffer("image/png"), { name });
  } catch {
    return null;
  }
}

function buildDrivingQuizPromptImage(row?) {
  try {
    registerCanvasFonts(canvasModule);
    const width = 1400;
    const height = 780;
    const padding = CANVAS_STYLE.padding;
    const radius = CANVAS_STYLE.radius;
    const cardW = width - padding * 2;
    const cardH = height - padding * 2;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    const hasSign = Boolean(row?.signType);
    const signAreaW = hasSign ? 420 : 0;
    const textAreaW = cardW - signAreaW - (hasSign ? 42 : 0);
    const usableWidth = textAreaW - 70;

    const isMultiple = (row?.questionType === "multiple" || hasSign) && Array.isArray(row?.options) && row.options.length >= 2;
    const statement = String(row?.statement ?? "").trim() || "Domanda";
    ctx.font = fontStackPrimaryOnly(58, "700");
    const statementLines = wrapPromptText(ctx, statement, usableWidth);
    let optionsLines = [];
    if (isMultiple) {
      ctx.font = fontStackPrimaryOnly(42, "700");
      for (let i = 0; i < row.options.length; i++) {
        const opt = String(row.options[i] ?? "").trim();
        const letter = ["A", "B", "C", "D"][i] ?? String(i + 1);
        optionsLines.push(...wrapPromptText(ctx, `${letter}) ${opt}`, usableWidth - 36));
      }
    }

    fillCanvasBackground(ctx, width, height);
    const cardX = padding;
    const cardY = padding;
    fillCanvasCard(ctx, cardX, cardY, cardW, cardH, radius);

    let textStartX = cardX + (cardW - textAreaW) / 2;
    if (hasSign) {
      textStartX = cardX + signAreaW + 24;
      const signCx = cardX + signAreaW / 2;
      const signCy = cardY + cardH / 2;
      drawRoadSign(ctx, row.signType, signCx, signCy, 260);
    }

    const textCenterX = hasSign ? textStartX + textAreaW / 2 : width / 2;
    const titleHeight = 54;
    const titleGap = 24;
    const statementLineHeight = 68;
    const optionsGap = 20;
    const optionLineHeight = 52;
    const boolHintHeight = 50;
    const boolGap = 16;

    const statementHeight = statementLines.length * statementLineHeight;
    const optionsHeight = isMultiple ? optionsGap + optionsLines.length * optionLineHeight : boolGap + boolHintHeight;
    const totalContentHeight = titleHeight + titleGap + statementHeight + optionsHeight;
    let y = cardY + (cardH - totalContentHeight) / 2;

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = CANVAS_STYLE.titleColor;
    ctx.font = fontStackPrimaryOnly(56, "700");
    ctx.fillText("Quiz patente", textCenterX, y);
    y += titleHeight + titleGap;

    ctx.fillStyle = CANVAS_STYLE.bodyColor;
    ctx.font = fontStackPrimaryOnly(58, "700");
    for (const line of statementLines) {
      ctx.fillText(line, textCenterX, y, usableWidth);
      y += statementLineHeight;
    }

    if (isMultiple) {
      y += optionsGap;
      ctx.font = fontStackPrimaryOnly(42, "700");
      for (const line of optionsLines) {
        ctx.fillText(line, textCenterX, y, usableWidth);
        y += optionLineHeight;
      }
    } else {
      y += boolGap;
      ctx.fillStyle = CANVAS_STYLE.titleColor;
      ctx.font = fontStackPrimaryOnly(46, "700");
      ctx.fillText("Rispondi: Vero o Falso", textCenterX, y);
    }

    const name = "driving_quiz.png";
    return new AttachmentBuilder(canvas.toBuffer("image/png"), { name });
  } catch {
    return null;
  }
}

function roundRect(ctx?, x?, y?, w?, h?, r?) {
  if (r <= 0) {
    ctx.rect(x, y, w, h);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function fillCanvasBackground(ctx?, width?, height?) {
  const g = ctx.createLinearGradient(0, 0, width, height);
  g.addColorStop(0, CANVAS_STYLE.bgGradStart);
  g.addColorStop(1, CANVAS_STYLE.bgGradEnd);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
}

function fillCanvasCard(ctx?, x?, y?, w?, h?, radius = null) {
  const r = radius ?? CANVAS_STYLE.radius;
  ctx.fillStyle = CANVAS_STYLE.cardFill;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.strokeStyle = CANVAS_STYLE.cardStroke;
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, r);
  ctx.stroke();
}

function drawRoadSign(ctx?, signType?, cx?, cy?, size?) {
  const s = Math.max(20, size || 120);
  const r = s / 2;
  ctx.save();

  switch (String(signType || "").toLowerCase()) {
    case "danger": {
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#e00";
      ctx.lineWidth = Math.max(2, s / 25);
      ctx.beginPath();
      ctx.moveTo(cx, cy - r + 8);
      ctx.lineTo(cx + r - 8, cy + r * 0.5);
      ctx.lineTo(cx - r + 8, cy + r * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#e00";
      ctx.font = fontStackPrimaryOnly(Math.round(s / 3), "700");
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("!", cx, cy);
      break;
    }
    case "stop": {
      const pts = 8;
      ctx.fillStyle = "#e00";
      ctx.beginPath();
      for (let i = 0; i < pts; i++) {
        const a = (i / pts) * Math.PI * 2 - Math.PI / 2;
        const x = cx + (r - 4) * Math.cos(a);
        const y = cy + (r - 4) * Math.sin(a);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = fontStackPrimaryOnly(Math.round(s / 4.5), "700");
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("STOP", cx, cy);
      break;
    }
    case "give_way": {
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#e00";
      ctx.lineWidth = Math.max(2, s / 25);
      ctx.beginPath();
      ctx.moveTo(cx, cy + r - 8);
      ctx.lineTo(cx + r - 8, cy - r * 0.5);
      ctx.lineTo(cx - r + 8, cy - r * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
    case "no_entry": {
      ctx.fillStyle = "#e00";
      ctx.beginPath();
      ctx.arc(cx, cy, r - 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillRect(cx - r * 0.6, cy - s / 8, r * 1.2, s / 4);
      break;
    }
    case "parking": {
      ctx.fillStyle = "#0066b3";
      ctx.fillRect(cx - r + 4, cy - r * 0.7, (r - 4) * 2, r * 1.4);
      ctx.fillStyle = "#fff";
      ctx.font = fontStackPrimaryOnly(Math.round(s / 2.2), "700");
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("P", cx, cy);
      break;
    }
    case "no_parking": {
      ctx.fillStyle = "#0066b3";
      ctx.strokeStyle = "#e00";
      ctx.lineWidth = Math.max(3, s / 20);
      ctx.beginPath();
      ctx.arc(cx, cy, r - 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#e00";
      ctx.lineWidth = Math.max(4, s / 15);
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.5, cy + r * 0.5);
      ctx.lineTo(cx + r * 0.5, cy - r * 0.5);
      ctx.stroke();
      break;
    }
    case "speed_50": {
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#e00";
      ctx.lineWidth = Math.max(2, s / 25);
      ctx.beginPath();
      ctx.arc(cx, cy, r - 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#000";
      ctx.font = fontStackPrimaryOnly(Math.round(s / 2.5), "700");
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("50", cx, cy);
      break;
    }
    case "obligation_right": {
      ctx.fillStyle = "#0066b3";
      ctx.beginPath();
      ctx.arc(cx, cy, r - 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.35, cy);
      ctx.lineTo(cx + r * 0.35, cy - r * 0.35);
      ctx.lineTo(cx + r * 0.35, cy + r * 0.35);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "obligation_forward": {
      ctx.fillStyle = "#0066b3";
      ctx.beginPath();
      ctx.arc(cx, cy, r - 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 0.4);
      ctx.lineTo(cx - r * 0.25, cy + r * 0.35);
      ctx.lineTo(cx, cy + r * 0.15);
      ctx.lineTo(cx + r * 0.25, cy + r * 0.35);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "pedestrian_crossing": {
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#e00";
      ctx.lineWidth = Math.max(2, s / 25);
      ctx.beginPath();
      ctx.moveTo(cx, cy - r + 8);
      ctx.lineTo(cx + r - 8, cy + r * 0.5);
      ctx.lineTo(cx - r + 8, cy + r * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#000";
      ctx.font = fontStackPrimaryOnly(Math.round(s / 4), "700");
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("PED", cx, cy);
      break;
    }
    case "no_overtaking": {
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#e00";
      ctx.lineWidth = Math.max(2, s / 25);
      ctx.beginPath();
      ctx.arc(cx, cy, r - 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#e00";
      ctx.fillRect(cx - r * 0.5, cy - r * 0.2, r * 0.35, r * 0.4);
      ctx.fillRect(cx + r * 0.15, cy - r * 0.2, r * 0.35, r * 0.4);
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.45, cy);
      ctx.lineTo(cx + r * 0.45, cy);
      ctx.strokeStyle = "#e00";
      ctx.lineWidth = Math.max(3, s / 25);
      ctx.stroke();
      break;
    }
    case "priority_road": {
      const d = r - 4;
      ctx.fillStyle = "#ffcc00";
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = Math.max(2, s / 30);
      ctx.beginPath();
      ctx.moveTo(cx, cy - d);
      ctx.lineTo(cx + d, cy);
      ctx.lineTo(cx, cy + d);
      ctx.lineTo(cx - d, cy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
    default:
      ctx.fillStyle = "#888";
      ctx.beginPath();
      ctx.arc(cx, cy, r - 4, 0, Math.PI * 2);
      ctx.fill();
  }

  ctx.restore();
}

function buildHangmanStepThresholds(safeMax?) {
  const ts = new Array(10).fill(safeMax + 1);
  ts[0] = 1;
  ts[1] = 2;
  ts[2] = 3;
  ts[3] = 4;
  ts[4] = 5;
  ts[5] = 6;
  ts[9] = safeMax;
  if (safeMax >= 8) ts[6] = 7;
  if (safeMax >= 9) ts[7] = 8;
  if (safeMax >= 10) ts[8] = 9;
  return ts;
}

function buildHangmanImageAttachment(maskedWord?, misses = 0, maxMisses = 10, fileName = "hangman.png", headerTitle = "Impiccato") {
  try {
    registerCanvasFonts(canvasModule);
    const width = 900;
    const height = 520;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    fillCanvasBackground(ctx, width, height);

    const innerGrad = ctx.createLinearGradient(0, 0, width, 0);
    innerGrad.addColorStop(0, "#3d2e26");
    innerGrad.addColorStop(0.5, "#5c4538");
    innerGrad.addColorStop(1, "#3d2e26");
    ctx.fillStyle = innerGrad;
    ctx.strokeStyle = CANVAS_STYLE.cardStroke;
    ctx.lineWidth = 3;
    roundRect(ctx, 32, 32, width - 64, height - 64, 16);
    ctx.fill();
    ctx.stroke();

    const safeMax = Math.max(3, Math.min(10, Number(maxMisses) || 10));
    const m = Math.max(0, Math.min(safeMax, Number(misses) || 0));
    const ts = buildHangmanStepThresholds(safeMax);

    const leftZoneCenterX = 240;
    const wordCenterX = 600;
    const contentTop = 100;
    const contentBottom = 380;

    const poleBottomY = contentBottom - 24;
    const poleTopY = contentTop + 20;
    const poleX = leftZoneCenterX - 70;
    const beamStartX = poleX;
    const beamEndX = poleX + 140;
    const headCx = (beamStartX + beamEndX) / 2;
    const headCy = poleTopY + 32;
    const ropeY = poleTopY + 8;

    ctx.strokeStyle = "#b8a99a";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.moveTo(poleX, poleBottomY);
    ctx.lineTo(poleX, poleTopY);
    ctx.lineTo(beamEndX, poleTopY);
    ctx.stroke();

    if (m >= ts[0]) {
      ctx.beginPath();
      ctx.moveTo(headCx, poleTopY);
      ctx.lineTo(headCx, ropeY + 16);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(headCx, headCy, 20, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (m >= ts[1]) {
      ctx.beginPath();
      ctx.moveTo(headCx, headCy + 20);
      ctx.lineTo(headCx, headCy + 58);
      ctx.stroke();
    }
    if (m >= ts[2]) {
      ctx.beginPath();
      ctx.moveTo(headCx, headCy + 32);
      ctx.lineTo(headCx - 24, headCy + 52);
      ctx.stroke();
    }
    if (m >= ts[3]) {
      ctx.beginPath();
      ctx.moveTo(headCx, headCy + 32);
      ctx.lineTo(headCx + 24, headCy + 52);
      ctx.stroke();
    }
    if (m >= ts[4]) {
      ctx.beginPath();
      ctx.moveTo(headCx, headCy + 58);
      ctx.lineTo(headCx - 20, headCy + 88);
      ctx.stroke();
    }
    if (m >= ts[5]) {
      ctx.beginPath();
      ctx.moveTo(headCx, headCy + 58);
      ctx.lineTo(headCx + 20, headCy + 88);
      ctx.stroke();
    }
    if (m >= ts[6]) {
      ctx.beginPath();
      ctx.moveTo(headCx - 24, headCy + 52);
      ctx.lineTo(headCx - 36, headCy + 62);
      ctx.stroke();
    }
    if (m >= ts[7]) {
      ctx.beginPath();
      ctx.moveTo(headCx + 24, headCy + 52);
      ctx.lineTo(headCx + 36, headCy + 62);
      ctx.stroke();
    }
    if (m >= ts[8]) {
      ctx.beginPath();
      ctx.moveTo(headCx - 20, headCy + 88);
      ctx.lineTo(headCx - 32, headCy + 88);
      ctx.moveTo(headCx + 20, headCy + 88);
      ctx.lineTo(headCx + 32, headCy + 88);
      ctx.stroke();
    }
    if (m >= ts[9]) {
      ctx.beginPath();
      ctx.moveTo(headCx - 6, headCy - 4);
      ctx.lineTo(headCx + 6, headCy + 12);
      ctx.moveTo(headCx + 6, headCy - 4);
      ctx.lineTo(headCx - 6, headCy + 12);
      ctx.stroke();
    }

    ctx.fillStyle = "#e8e0d5";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = fontStackPrimaryOnly(42, "700");
    ctx.fillText(String(headerTitle || "Impiccato"), width / 2, 54);

    const wordStr = String(maskedWord || "").trim() || "_";
    ctx.fillStyle = "#e8e0d5";
    ctx.font = fontStackPrimaryOnly(44, "700");
    ctx.fillText(wordStr, wordCenterX, (contentTop + contentBottom) / 2, width - 320);

    const isLost = m >= safeMax;
    ctx.fillStyle = isLost ? "#f5b3a6" : "#c9b89f";
    ctx.font = fontStackPrimaryOnly(28, "700");
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`Errori: ${m}/${safeMax}`, width / 2, height - 60);

    return new AttachmentBuilder(canvas.toBuffer("image/png"), { name: fileName });
  } catch {
    return null;
  }
}

function promptLineHasEmoji(text?) {
  return tokenizeEmojiText(String(text || "")).some(
    (token?) => token.type === "emoji" || token.type === "custom_emoji",
  );
}

async function buildEmojiRichPromptImageAttachment(title?, lines = [], fileBaseName = "minigame") {
  try {
    registerCanvasFonts(canvasModule);
    const width = 1400;
    const height = 780;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    fillCanvasBackground(ctx, width, height);
    const cardX = CANVAS_STYLE.padding;
    const cardY = CANVAS_STYLE.padding;
    const cardW = width - CANVAS_STYLE.padding * 2;
    const cardH = height - CANVAS_STYLE.padding * 2;
    fillCanvasCard(ctx, cardX, cardY, cardW, cardH);

    await drawLabelWithEmoji(ctx, String(title || "Minigioco"), width / 2, cardY + 48, {
      size: 68,
      weight: "700",
      color: CANVAS_STYLE.titleColor,
      align: "center",
      baseline: "top",
      forcePrimaryFont: true,
    });

    const sourceLines = Array.isArray(lines)
      ? lines.map((line?) => String(line || "").trim()).filter(Boolean)
      : [];
    const bodyBlocks = sourceLines.map((line?) => ({
      line,
      isEmojiLine: promptLineHasEmoji(line),
    }));
    if (!bodyBlocks.length) bodyBlocks.push({ line: "...", isEmojiLine: false });

    const emojiSize = 112;
    const textSize = 44;
    const emojiBlockH = emojiSize + 36;
    const textBlockH = textSize + 28;
    const totalBodyH = bodyBlocks.reduce(
      (sum?, block?) => sum + (block.isEmojiLine ? emojiBlockH : textBlockH),
      0,
    );
    let y = Math.max(cardY + 180, Math.round(cardY + (cardH - totalBodyH) / 2 + 40));

    for (const block of bodyBlocks) {
      const size = block.isEmojiLine ? emojiSize : textSize;
      const blockH = block.isEmojiLine ? emojiBlockH : textBlockH;
      const centerY = y + Math.round(blockH / 2);
      await drawLabelWithEmoji(ctx, block.line, width / 2, centerY, {
        size,
        weight: "700",
        color: CANVAS_STYLE.bodyColor,
        align: "center",
        baseline: "middle",
        forcePrimaryFont: !block.isEmojiLine,
      });
      y += blockH;
    }

    const name = `${String(fileBaseName || "minigame").replace(/[^a-z0-9_-]/gi, "_").toLowerCase()}.png`;
    return new AttachmentBuilder(canvas.toBuffer("image/png"), { name });
  } catch {
    return null;
  }
}

function buildPromptImageAttachment(title?, lines = [], fileBaseName = "minigame", fileNameSuffix = "", client = null, distortQuestion = false) {
  const promptCfg = client ? getConfig(client) : null;
  title = resolveHogwartsBonusPromptTitle(promptCfg, fileBaseName, title);
  title = distortPromptIfBurrobirra(client, title, `${fileBaseName}:title`, distortQuestion);
    lines = Array.isArray(lines)
    ? lines.map((line?, idx?) => (
      fileBaseName === "hogwarts_cipher" || fileBaseName === "hangman"
        ? line
        : distortPromptIfBurrobirra(client, line, `${fileBaseName}:l${idx}`, distortQuestion)
    ))
    : lines;
  if (fileBaseName === "italian_gk" && Array.isArray(lines) && lines.length > 0) {
    try {
      registerCanvasFonts(canvasModule);
      const width = 1400;
      const height = 780;
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");

      fillCanvasBackground(ctx, width, height);
      const cardX = CANVAS_STYLE.padding;
      const cardY = CANVAS_STYLE.padding;
      const cardW = width - CANVAS_STYLE.padding * 2;
      const cardH = height - CANVAS_STYLE.padding * 2;
      fillCanvasCard(ctx, cardX, cardY, cardW, cardH);

      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = CANVAS_STYLE.titleColor;
      ctx.font = fontStackPrimaryOnly(76, "800");
      ctx.fillText(String(title || "Cultura generale"), width / 2, cardY + 100);

      const question = polishItalianQuestionText(String(lines[0] || "").trim() || "Domanda");
      const usableWidth = cardW - 150;
      let questionFont = 64;
      let questionLines = [];
      for (; questionFont >= 42; questionFont -= 2) {
        ctx.font = fontStackPrimaryOnly(questionFont, "700");
        questionLines = wrapPromptText(ctx, question, usableWidth);
        if (questionLines.length <= 5) break;
      }

      const lineHeight = Math.round(questionFont * 1.22);
      const totalH = questionLines.length * lineHeight;
      let y = Math.round(cardY + 200 + Math.max(0, (cardH - 300 - totalH) / 2));

      ctx.fillStyle = CANVAS_STYLE.bodyColor;
      ctx.font = fontStackPrimaryOnly(questionFont, "700");
      for (const line of questionLines) {
        ctx.fillText(line, width / 2, y, usableWidth);
        y += lineHeight;
      }

      return new AttachmentBuilder(canvas.toBuffer("image/png"), {
        name: "italian_gk.png",
      });
    } catch {
      return null;
    }
  }

  if (fileBaseName === "guess_word" && Array.isArray(lines) && lines.length > 0) {
    try {
      registerCanvasFonts(canvasModule);
      const width = 1400;
      const height = 780;
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");

      fillCanvasBackground(ctx, width, height);
      const cardX = CANVAS_STYLE.padding;
      const cardY = CANVAS_STYLE.padding;
      const cardW = width - CANVAS_STYLE.padding * 2;
      const cardH = height - CANVAS_STYLE.padding * 2;
      fillCanvasCard(ctx, cardX, cardY, cardW, cardH);

      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = CANVAS_STYLE.titleColor;
      ctx.font = fontStackPrimaryOnly(76, "800");
      ctx.fillText(String(title || "Indovina la parola"), width / 2, cardY + 100);

      const scrambled = String(lines[0] || "").trim() || "?";
      const usableWidth = cardW - 150;
      let fontSize = 72;
      let textLines = [];
      for (; fontSize >= 44; fontSize -= 4) {
        ctx.font = fontStackPrimaryOnly(fontSize, "700");
        textLines = wrapPromptText(ctx, scrambled, usableWidth);
        if (textLines.length <= 3) break;
      }
      const lineHeight = Math.round(fontSize * 1.22);
      const totalH = textLines.length * lineHeight;
      let y = Math.round(cardY + 200 + Math.max(0, (cardH - 300 - totalH) / 2));
      ctx.fillStyle = CANVAS_STYLE.bodyColor;
      ctx.font = fontStackPrimaryOnly(fontSize, "700");
      for (const line of textLines) {
        ctx.fillText(line, width / 2, y, usableWidth);
        y += lineHeight;
      }

      return new AttachmentBuilder(canvas.toBuffer("image/png"), { name: "guess_word.png" });
    } catch {
      return null;
    }
  }
  if (fileBaseName === "hangman" && Array.isArray(lines) && lines.length >= 2) {
    const masked = String(lines[0] || "").trim();
    const errMatch = String(lines[1] || "").match(/Errori:\s*(\d+)\/(\d+)/);
    const misses = errMatch ? parseInt(errMatch[1], 10) : 0;
    const maxMisses = errMatch ? parseInt(errMatch[2], 10) : 10;
    const safeSuffix = String(fileNameSuffix || "").replace(/[^a-z0-9_-]/gi, "");
    const out = buildHangmanImageAttachment(
      masked,
      misses,
      maxMisses,
      safeSuffix ? `hangman_${safeSuffix}.png` : "hangman.png",
      title,
    );
    if (out) return out;
  }
  if (fileBaseName === "fast_type" && Array.isArray(lines) && lines.length > 0) {
    const fastLabel = resolveHogwartsBonusPromptSubtitle(promptCfg, fileBaseName, "Scrivi esattamente questa frase");
    const out = buildFastTypePromptImage(lines[0], fastLabel);
    if (out) return out;
  }

  try {
    registerCanvasFonts(canvasModule);
    const width = 1400;
    const height = 780;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    fillCanvasBackground(ctx, width, height);
    const cardX = CANVAS_STYLE.padding;
    const cardY = CANVAS_STYLE.padding;
    const cardW = width - CANVAS_STYLE.padding * 2;
    const cardH = height - CANVAS_STYLE.padding * 2;
    fillCanvasCard(ctx, cardX, cardY, cardW, cardH);

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = CANVAS_STYLE.titleColor;
    ctx.font = fontStackPrimaryOnly(68, "700");
    ctx.fillText(String(title || "Minigioco"), width / 2, cardY + 48);

    const usableWidth = cardW - 120;
    const sourceLines = Array.isArray(lines) ? lines.map((line?) => String(line || "").trim()).filter(Boolean) : [];
    const renderedLines = [];
    for (const line of sourceLines) {
      ctx.font = fontStackPrimaryOnly(56, "700");
      renderedLines.push(...wrapPromptText(ctx, line, usableWidth));
    }
    if (!renderedLines.length) renderedLines.push("...");

    ctx.font = fontStackPrimaryOnly(56, "700");
    ctx.fillStyle = CANVAS_STYLE.bodyColor;
    const lineHeight = 76;
    const totalHeight = renderedLines.length * lineHeight;
    let y = Math.max(cardY + 180, Math.round(cardY + (cardH - totalHeight) / 2));
    for (const line of renderedLines) {
      ctx.fillText(line, width / 2, y, usableWidth);
      y += lineHeight;
    }

    const name = `${String(fileBaseName || "minigame").replace(/[^a-z0-9_-]/gi, "_").toLowerCase()}.png`;
    return new AttachmentBuilder(canvas.toBuffer("image/png"), { name });
  } catch {
    return null;
  }
}

async function buildGuessFlagCardAttachment(flagUrl?) {
  try {
    registerCanvasFonts(canvasModule);
    const flagImg = await loadImage(flagUrl).catch(() => null);
    if (!flagImg) return null;
    const width = 1400;
    const height = 780;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    fillCanvasBackground(ctx, width, height);
    const cardX = CANVAS_STYLE.padding;
    const cardY = CANVAS_STYLE.padding;
    const cardW = width - CANVAS_STYLE.padding * 2;
    const cardH = height - CANVAS_STYLE.padding * 2;
    fillCanvasCard(ctx, cardX, cardY, cardW, cardH);
    ctx.textAlign = "center";
    ctx.fillStyle = CANVAS_STYLE.titleColor;
    ctx.font = fontStackPrimaryOnly(68, "700");
    ctx.fillText("Indovina la bandiera", width / 2, cardY + 48);
    const maxW = cardW - 120;
    const maxH = cardH - 200;
    const scale = Math.min(maxW / flagImg.width, maxH / flagImg.height, 1);
    const drawW = Math.round(flagImg.width * scale);
    const drawH = Math.round(flagImg.height * scale);
    const x = (width - drawW) / 2;
    const y = cardY + 140;
    ctx.drawImage(flagImg, x, y, drawW, drawH);
    return new AttachmentBuilder(canvas.toBuffer("image/png"), { name: "guess_flag.png" });
  } catch {
    return null;
  }
}

/** Marker: sports_guess_attach_v1 — always attach puzzle image (Discord often fails to unfurl r2.thesportsdb.com). */
function normalizeExternalImageUrl(imageUrl?) {
  let url = String(imageUrl || "").trim();
  if (!url) return null;
  if (/^http:\/\//i.test(url)) url = `https://${url.slice("http://".length)}`;
  if (!/^https:\/\//i.test(url)) return null;
  return url;
}

async function loadImageBufferFromUrl(imageUrl?) {
  const url = normalizeExternalImageUrl(imageUrl);
  if (!url) return null;
  try {
    const viaSafe = await safeLoadImage(url, { suppressWarning: true });
    if (viaSafe?.width && viaSafe?.height) return viaSafe;
  } catch (_) {}
  try {
    const res = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 15000,
      maxContentLength: 8 * 1024 * 1024,
      headers: { "User-Agent": "ViniliCaffeBot/1.0", Accept: "image/*,*/*" },
      validateStatus: (status?) => status >= 200 && status < 300,
    });
    const buf = Buffer.from(res.data || []);
    if (!buf.length) return null;
    const img = await loadImage(buf).catch(() => null);
    if (img?.width && img?.height) return img;
  } catch (_) {}
  return null;
}

async function fetchRawImageAttachment(imageUrl?, fileName = "guess_image.jpg") {
  const url = normalizeExternalImageUrl(imageUrl);
  if (!url) return null;
  try {
    const res = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 15000,
      maxContentLength: 8 * 1024 * 1024,
      headers: { "User-Agent": "ViniliCaffeBot/1.0", Accept: "image/*,*/*" },
      validateStatus: (status?) => status >= 200 && status < 300,
    });
    const buf = Buffer.from(res.data || []);
    if (!buf || buf.length < 64) return null;
    let name = String(fileName || "guess_image.jpg").replace(/[^\w.\-]+/g, "_");
    const isPng = buf[0] === 0x89 && buf[1] === 0x50;
    const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
    const isWebp = buf.length > 12 && buf.slice(0, 4).toString("ascii") === "RIFF" && buf.slice(8, 12).toString("ascii") === "WEBP";
    if (isPng) name = name.replace(/\.[^.]+$/, ".png");
    else if (isJpg) name = name.replace(/\.[^.]+$/, ".jpg");
    else if (isWebp) name = name.replace(/\.[^.]+$/, ".webp");
    else if (/\.png($|\?)/i.test(url)) name = name.replace(/\.[^.]+$/, ".png");
    else name = name.replace(/\.[^.]+$/, ".jpg");
    if (!/\.(png|jpe?g|webp)$/i.test(name)) name = `${name}.jpg`;
    return new AttachmentBuilder(buf, { name });
  } catch (_) {
    return null;
  }
}

async function buildRemoteGuessImageCardAttachment(imageUrl?, title?, fileName = "guess_image.png") {
  try {
    registerCanvasFonts(canvasModule);
    const photo = await loadImageBufferFromUrl(imageUrl);
    if (!photo) return null;
    const width = 1400;
    const height = 780;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    fillCanvasBackground(ctx, width, height);
    const cardX = CANVAS_STYLE.padding;
    const cardY = CANVAS_STYLE.padding;
    const cardW = width - CANVAS_STYLE.padding * 2;
    const cardH = height - CANVAS_STYLE.padding * 2;
    fillCanvasCard(ctx, cardX, cardY, cardW, cardH);
    ctx.textAlign = "center";
    ctx.fillStyle = CANVAS_STYLE.titleColor;
    ctx.font = fontStackPrimaryOnly(64, "700");
    ctx.fillText(String(title || "Indovina").slice(0, 48), width / 2, cardY + 48);
    const maxW = cardW - 120;
    const maxH = cardH - 200;
    const scale = Math.min(maxW / photo.width, maxH / photo.height, 1);
    const drawW = Math.round(photo.width * scale);
    const drawH = Math.round(photo.height * scale);
    const x = (width - drawW) / 2;
    const y = cardY + 140;
    ctx.drawImage(photo, x, y, drawW, drawH);
    const name = String(fileName || "guess_image.png").replace(/[^\w.\-]+/g, "_");
    return new AttachmentBuilder(canvas.toBuffer("image/png"), { name: name.endsWith(".png") ? name : `${name}.png` });
  } catch {
    return null;
  }
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
    isBurrobirraActiveForChannel(client, channelId),
  );
}

function buildMathExpressionImageAttachment(expression?) {
  try {
    registerCanvasFonts(canvasModule);
    const width = 1200;
    const height = 420;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    fillCanvasBackground(ctx, width, height);
    const pad = CANVAS_STYLE.padding;
    const cardW = width - pad * 2;
    const cardH = height - pad * 2;
    fillCanvasCard(ctx, pad, pad, cardW, cardH, 20);

    ctx.fillStyle = CANVAS_STYLE.bodyColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = fontStackPrimaryOnly(120, "700");
    ctx.fillText(String(expression || ""), width / 2, height / 2);

    const name = "math_expression.png";
    return new AttachmentBuilder(canvas.toBuffer("image/png"), { name });
  } catch {
    return null;
  }
}

function normalizeCharForGuess(ch?) {
  return String(ch || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function maskHangmanWord(word?, guessed = new Set()) {
  return String(word || "")
    .split("")
    .map((ch?) => (guessed.has(normalizeCharForGuess(ch)) ? ch : "_"))
    .join(" ");
}

function countHangmanLetters(word?) {
  return String(word || "").replace(/\s+/g, "").length;
}

function levenshteinDistance(aRaw?, bRaw?) {
  const a = String(aRaw || "");
  const b = String(bRaw || "");
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1);
  const curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
  }
  return prev[b.length];
}

function isNearTextGuess(rawGuess?, rawAnswers?, options: Record<string, any> = {}) {
  const guess = normalizeCountryName(rawGuess);
  if (!guess || guess.length < Number(options?.minGuessLength || 3))
    return false;
  const answers = Array.isArray(rawAnswers) ? rawAnswers.map((x?) => normalizeCountryName(x)).filter(Boolean) : [normalizeCountryName(rawAnswers)].filter(Boolean);
  if (!answers.length) return false;

  const compactGuess = compactNoSpaces(guess);
  for (const answer of answers) {
    if (!answer) continue;
    if (guess === answer || (compactGuess && compactGuess === compactNoSpaces(answer))) return true;
  }

  const maxAbs = Number(options?.maxDistance || 2);
  const maxRatio = Number(options?.maxRatio || 0.28);
  for (const answer of answers) {
    if (!answer || guess === answer) continue;
    const dist = levenshteinDistance(guess, answer);
    const base = Math.max(guess.length, answer.length);
    if (dist <= maxAbs && dist / Math.max(1, base) <= maxRatio) return true;
  }
  return false;
}

function isStrictAliasGuessCorrect(
  rawGuess?,
  rawAnswers?,
  normalizer = normalizeCountryName,
) {
  const guess = normalizer(rawGuess);
  if (!guess) return false;

  const answers = Array.isArray(rawAnswers) ? rawAnswers.map((a?) => normalizer(a)).filter(Boolean) : [normalizer(rawAnswers)].filter(Boolean);
  if (!answers.length) return false;

  const uniqueAnswers = Array.from(new Set(answers));
  const compactGuess = compactNoSpaces(guess);

  for (const answer of uniqueAnswers) {
    if (guess === answer) return true;
    if (compactGuess && compactGuess === compactNoSpaces(answer)) return true;
  }
  return false;
}

/** Win solo se la risposta è intera (alias normalizzato / senza spazi). Niente substring né token. */
function isLooseAliasGuessCorrect(
  rawGuess?,
  rawAnswers?,
  normalizer = normalizeCountryName,
  _options: Record<string, any> = {},
) {
  return isStrictAliasGuessCorrect(rawGuess, rawAnswers, normalizer);
}

function extractWordGuessCandidates(raw?) {
  const lower = String(raw || "").toLowerCase();
  const tokens = lower
    .split(/[^a-zà-öø-ÿ]+/i)
    .map((t?) => t.trim())
    .filter(Boolean)
    .filter((t?) => t.length >= 4 && t.length <= 10);
  return Array.from(new Set(tokens));
}

function buildPlayerAnswerAliases(name?, aliases = []) {
  const out = new Set();
  const add = (value?) => {
    const normalized = normalizePlayerGuess(value);
    if (normalized) out.add(normalized);
    const compact = buildCompactAlias(value);
    if (compact) out.add(compact);
  };
  add(name);
  const extra = Array.isArray(aliases) ? aliases : [];
  for (const alias of extra) add(alias);
  return Array.from(out.values());
}

const PLAYER_RETIRED_PATTERNS = [
  /\s*_Retired\s*$/i,
  /\s*_retired\s*$/i,
  /\s*\(Retired\)\s*$/i,
  /\s*\(retired\)\s*$/i,
  /\s*-\s*Retired\s*$/i,
  /\s*Retired\s*$/i,
];
const PLAYER_RETIRED_ITALIAN = " (Ritirato)";

function normalizePlayerDisplayName(str?) {
  if (!str || typeof str !== "string") return str;
  let out = String(str).trim();
  for (const re of PLAYER_RETIRED_PATTERNS) {
    out = out.replace(re, PLAYER_RETIRED_ITALIAN);
  }
  return out.trim() || str;
}

function buildPlayerAliases(player?) {
  const aliases = new Set();
  const add = (value?) => { const normalized = normalizePlayerGuess(value); if (normalized) aliases.add(normalized); };
  add(player?.strPlayer);
  add(normalizePlayerDisplayName(player?.strPlayer));
  add(player?.strKnownAs);
  add(player?.strNickname);
  return Array.from(aliases.values());
}

function isFootballPlayer(player?) {
  if (!player || typeof player !== "object") return false;
  const sportRaw = String(player?.strSport || "").trim().toLowerCase();
  const teamRaw = String(player?.strTeam || "").trim().toLowerCase();
  const leagueRaw = String(player?.strLeague || "").trim().toLowerCase();
  const footballSports = new Set(["soccer", "association football", "football", "calcio",]);
  if (sportRaw && !footballSports.has(sportRaw)) return false;
  const blockedHints = ["rugby", "nfl", "basket", "nba", "hockey", "baseball", "cricket", "volley", "handball",];
  const combined = `${teamRaw} ${leagueRaw}`;
  if (blockedHints.some((hint?) => combined.includes(hint))) return false;
  return true;
}

function isYouthReserveOrWomenTeam(team?) {
  const combined = [
    team?.strTeam,
    team?.strLeague,
    team?.strLeagueAlternate,
    team?.strDescriptionEN,
    team?.strDescriptionIT,
  ]
    .map((value?) => String(value || "").toLowerCase())
    .join(" ");
  return /(women|femminile|femenino|u17|u18|u19|u20|u21|u23|academy|primavera|reserve|reserves|b team|under-\d+)/i.test(combined);
}

function scoreTeamPopularity(team?) {
  let score = 0;
  if (team?.strBadge) score += 3;
  if (team?.strLogo) score += 2;
  if (team?.strBanner) score += 1;
  if (team?.strFanart1 || team?.strFanart2 || team?.strFanart3 || team?.strFanart4) score += 2;
  if (team?.strStadiumThumb) score += 1;
  if (team?.strDescriptionEN || team?.strDescriptionIT) score += 1;
  if (team?.intFormedYear) score += 1;
  if (team?.strWebsite || team?.strFacebook || team?.strInstagram || team?.strTwitter || team?.strYoutube) score += 1;
  return score;
}

function isLikelyFamousTeam(team?, cfg?) {
  if (!team?.strTeam || !team?.strBadge) return false;
  if (isYouthReserveOrWomenTeam(team)) return false;
  const pinnedNames = Array.isArray(cfg?.guessTeam?.famousNames) ? cfg.guessTeam.famousNames.map((value?) => normalizeCountryName(value)).filter(Boolean) : [];
  const normalizedName = normalizeCountryName(team.strTeam);
  if (normalizedName && pinnedNames.includes(normalizedName)) return true;
  const minScore = Math.max(4, Number(cfg?.guessTeam?.leagueFamousMinScore || 6));
  return scoreTeamPopularity(team) >= minScore;
}

function hasUsablePlayerImage(player?) {
  return Boolean(player?.strThumb || player?.strCutout || player?.strRender);
}

function isYouthOrReservePlayer(player?) {
  const combined = [
    player?.strTeam,
    player?.strLeague,
    player?.strPosition,
    player?.strDescriptionEN,
    player?.strDescriptionIT,
  ]
    .map((value?) => String(value || "").toLowerCase())
    .join(" ");
  return /(u17|u18|u19|u20|u21|u23|youth|academy|primavera|reserve|reserves|b team|under-\d+)/i.test(combined);
}

function scorePlayerPopularity(player?) {
  let score = 0;
  if (player?.strThumb) score += 4;
  if (player?.strCutout) score += 4;
  if (player?.strRender) score += 2;
  if (player?.strFanart1) score += 2;
  if (player?.strBanner) score += 1;
  if (player?.strDescriptionEN || player?.strDescriptionIT) score += 2;
  if (player?.strFacebook || player?.strInstagram || player?.strTwitter) score += 1;
  if (player?.strPosition) score += 1;
  if (player?.strNumber) score += 1;
  if (player?.strNationality) score += 1;
  return score;
}

function isLikelyFamousFootballPlayer(player?, minScore = 7) {
  if (!isFootballPlayer(player)) return false;
  if (!player?.strPlayer) return false;
  if (isYouthOrReservePlayer(player)) return false;
  if (!hasUsablePlayerImage(player)) return false;
  return scorePlayerPopularity(player) >= minScore;
}

function buildPlayerInfoFromApiPlayer(player?) {
  if (!player?.strPlayer) return null;
  const image = player.strThumb || player.strCutout || player.strRender || null;
  if (!image) return null;
  return {
    name: normalizePlayerDisplayName(player.strPlayer),
    team: player.strTeam || "Squadra sconosciuta",
    nationality: player.strNationality || "Nazionalità sconosciuta",
    image,
    aliases: buildPlayerAliases(player),
  };
}

async function loadLeaguePlayersFromApi(cfg?) {
  const now = Date.now();
  if (cachedLeaguePlayers && now - cachedLeaguePlayersAt < LEAGUE_PLAYER_CACHE_TTL_MS) return cachedLeaguePlayers;
  if (isSportsDbCoolingDown()) {
    return Array.isArray(cachedLeaguePlayers) ? cachedLeaguePlayers : [];
  }

  const teams = await loadFootballTeamsFromApi(cfg);
  const playerApiBase = cfg?.guessPlayer?.teamApiUrl || "https://www.thesportsdb.com/api/v1/json/123/lookup_all_players.php?id=";
  const minPopularityScore = Math.max(5, Number(cfg?.guessPlayer?.leagueFamousMinScore || 7));
  const out = [];
  const seenNames = new Set();

  for (const team of teams) {
    if (isSportsDbCoolingDown()) break;
    const teamId = String(team?.teamId || "").trim();
    if (!teamId) continue;
    try {
      const url = `${playerApiBase}${encodeURIComponent(teamId)}`;
      const res = await axios.get(url, { timeout: 15000 });
      const players = Array.isArray(res?.data?.player) ? res.data.player : [];
      for (const player of players) {
        if (!isLikelyFamousFootballPlayer(player, minPopularityScore)) continue;
        const normalizedName = normalizePlayerGuess(player?.strPlayer);
        if (!normalizedName || seenNames.has(normalizedName)) continue;
        const info = buildPlayerInfoFromApiPlayer(player);
        if (!info) continue;
        seenNames.add(normalizedName);
        out.push(info);
      }
    } catch (err) {
      if (isThesportsdb429(err)) {
        noteSportsDb429(err);
        if (Array.isArray(cachedLeaguePlayers) && cachedLeaguePlayers.length) return cachedLeaguePlayers;
        return out;
      }
      warnMinigame(err);
    }
  }

  cachedLeaguePlayers = out;
  cachedLeaguePlayersAt = now;
  return cachedLeaguePlayers;
}

async function fetchPlayerInfo(cfg?, name?) {
  const apiBase = cfg?.guessPlayer?.apiUrl;
  if (!apiBase || !name) return null;
  const url = `${apiBase}${encodeURIComponent(name)}`;
  try {
    if (isSportsDbCoolingDown()) return null;
    const res = await axios.get(url, { timeout: 15000 });
    const players = res?.data?.player;
    if (!Array.isArray(players) || players.length === 0) return null;
    const filteredPlayers = players.filter((p?) => isFootballPlayer(p));
    if (!filteredPlayers.length) return null;
    const source = filteredPlayers;
    const player = source.find((p?) => (p?.strThumb || p?.strCutout) && p?.strPlayer) || source[0];
    if (!player?.strPlayer) return null;
    if (!player.strThumb && !player.strCutout) return null;
    return {
      name: normalizePlayerDisplayName(player.strPlayer),
      team: player.strTeam || "Squadra sconosciuta",
      nationality: player.strNationality || "Nazionalità sconosciuta",
      image: player.strThumb || player.strCutout || null,
      aliases: buildPlayerAliases(player),
    };
  } catch (err) {
    if (isThesportsdb429(err)) {
      noteSportsDb429(err);
      return null;
    }
    warnMinigame(err);
    return null;
  }
}

async function fetchPlayerFromRandomLetter(cfg?) {
  const apiBase = cfg?.guessPlayer?.apiUrl;
  if (!apiBase) return null;
  if (isSportsDbCoolingDown()) return null;
  const letters = "abcdefghijklmnopqrstuvwxyz";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (isSportsDbCoolingDown()) return null;
    const letter = letters[randomBetween(0, letters.length - 1)];
    const url = `${apiBase}${encodeURIComponent(letter)}`;
    try {
      const res = await axios.get(url, { timeout: 15000 });
      const players = res?.data?.player;
      if (!Array.isArray(players) || players.length === 0) continue;
      const filteredPlayers = players.filter((p?) => isFootballPlayer(p));
      if (!filteredPlayers.length) continue;
      const source = filteredPlayers;
      const withImage = source.filter((p?) => p?.strThumb || p?.strCutout);
      const pool = withImage.length ? withImage : source;
      const player = pool[randomBetween(0, pool.length - 1)];
      if (!player?.strPlayer) continue;
      if (!player.strThumb && !player.strCutout) continue;
      return {
        name: normalizePlayerDisplayName(player.strPlayer),
        team: player.strTeam || "Squadra sconosciuta",
        nationality: player.strNationality || "Nazionalità sconosciuta",
        image: player.strThumb || player.strCutout || null,
        aliases: buildPlayerAliases(player),
      };
    } catch (err) {
      if (isThesportsdb429(err)) {
        noteSportsDb429(err);
        return null;
      }
      warnMinigame(err);
    }
  }
  return null;
}

async function fetchFamousPlayer(cfg?) {
  const customNames = Array.isArray(cfg?.guessPlayer?.famousNames) ? cfg.guessPlayer.famousNames : [];
  const names = customNames.map((name?) => String(name || "").trim()).filter(Boolean);
  if (!names.length) return null;

  const maxAttempts = Math.min(10, names.length);
  const used = new Set();
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let pick = null;
    for (let guard = 0; guard < 20; guard += 1) {
      const candidate = names[randomBetween(0, names.length - 1)];
      if (!used.has(candidate)) {
        pick = candidate;
        used.add(candidate);
        break;
      }
    }
    if (!pick) break;
    const info = await fetchPlayerInfo(cfg, pick);
    if (info?.name && info?.image) return info;
  }
  return null;
}

async function fetchLeagueFamousPlayer(cfg?) {
  const players = await loadLeaguePlayersFromApi(cfg);
  if (!players.length) return null;
  return players[randomBetween(0, players.length - 1)] || null;
}

async function fetchRandomSong(cfg?) {
  const apiBase = cfg?.guessSong?.apiUrl;
  if (!apiBase) return null;
  const popularTerms = Array.isArray(cfg?.guessSong?.popularTerms) && cfg.guessSong.popularTerms.length ? cfg.guessSong.popularTerms : ["the weeknd", "dua lipa", "ed sheeran", "drake", "ariana grande", "taylor swift", "billie eilish", "maneskin", "elodie", "sfera ebbasta", "thasup", "bad bunny", "eminem", "coldplay", "maroon 5", "bruno mars", "adele", "beyoncé", "rihanna", "justin bieber", "shawn mendes", "harry styles", "the chainsmokers", "david guetta", "calvin harris", "marco mengoni", "fedez", "j-ax", "ghali", "salmo", "lazza", "madame", "rosa chemical", "tananai", "blanco", "ultimo", "lorenzo fragola", "laura pausini", "eros ramazzotti", "vasco rossi", "ligabue", "tiziano ferro", "jovanotti", "giorgia", "alessandra amoroso", "articolo 31", "gemitaiz", "caparezza",];
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const term = popularTerms[randomBetween(0, popularTerms.length - 1)];
    const url = `${apiBase}${encodeURIComponent(term)}&entity=song&limit=50`;
    try {
      const res = await axios.get(url, { timeout: 15000 });
      const results = Array.isArray(res?.data?.results) ? res.data.results : [];
      const songs = results.filter((item?) => item?.trackName && item?.artistName && item?.previewUrl,);
      if (!songs.length) continue;
      const song = songs[randomBetween(0, songs.length - 1)];
      const artwork = song.artworkUrl100 ? song.artworkUrl100.replace("100x100bb", "600x600bb") : null;
      const genre = song.primaryGenreName || "Genere sconosciuto";
      const artistCountry = await fetchArtistCountry(cfg, song.artistName);
      return {
        title: song.trackName,
        artist: song.artistName,
        album: song.collectionName || "Album sconosciuto",
        artwork,
        genre,
        artistCountry: artistCountry || "Nazionalità sconosciuta",
        previewUrl: song.previewUrl || null,
      };
    } catch (err) {
      warnMinigame(err);
    }
  }
  return null;
}

async function fetchAudioAttachment(url?) {
  if (!url) return null;
  try {
    const res = await axios.get(url, { responseType: "arraybuffer", timeout: 15000, });
    const data = Buffer.from(res.data);
    if (!data || !data.length) return null;
    return data;
  } catch {
    return null;
  }
}

const POPULAR_SONG_TOP_PER_SOURCE = 50;
const DEFAULT_POPULAR_FEEDS = [
  "https://itunes.apple.com/it/rss/topsongs/limit=100/json",
  "https://itunes.apple.com/us/rss/topsongs/limit=100/json",
  "https://itunes.apple.com/gb/rss/topsongs/limit=100/json",
  "https://itunes.apple.com/fr/rss/topsongs/limit=100/json",
  "https://itunes.apple.com/de/rss/topsongs/limit=100/json",
];

async function loadPopularSongList(cfg?) {
  const now = Date.now();
  if (cachedSongs && now - cachedSongsAt < SONG_CACHE_TTL_MS)
    return cachedSongs;
  const all = [];
  const topN = Math.max(20, Number(cfg?.guessSong?.topPerSource ?? POPULAR_SONG_TOP_PER_SOURCE) || POPULAR_SONG_TOP_PER_SOURCE);

  const deezerChartUrl = cfg?.guessSong?.deezerChartUrl || "https://api.deezer.com/chart/0/tracks?limit=100";
  try {
    const chartRes = await axios.get(deezerChartUrl, { timeout: 15000 });
    const tracks = Array.isArray(chartRes?.data?.data) ? chartRes.data.data : [];
    const slice = tracks.slice(0, topN);
    for (const track of slice) {
      if (!track?.title || !track?.artist?.name) continue;
      all.push({
        source: "deezer",
        id: String(track.id || ""),
        title: track.title,
        artist: track.artist.name,
        album: track?.album?.title || "Album sconosciuto",
        artwork:
          track?.album?.cover_xl ||
          track?.album?.cover_big ||
          track?.album?.cover_medium ||
          null,
        genre: "Popolare",
        previewUrl: track.preview || null,
      });
    }
  } catch (err) {
    warnMinigame(err);
  }

  const feeds = Array.isArray(cfg?.guessSong?.popularFeeds)?.length ? cfg.guessSong.popularFeeds : DEFAULT_POPULAR_FEEDS;
  for (const feed of feeds) {
    if (!feed) continue;
    try {
      const res = await axios.get(feed, { timeout: 15000 });
      const entries = Array.isArray(res?.data?.feed?.entry) ? res.data.feed.entry : [];
      const sliceEntries = entries.slice(0, topN);
      for (const entry of sliceEntries) {
        const id = entry?.id?.attributes?.["im:id"] || entry?.id?.attributes?.im_id;
        const title = entry?.["im:name"]?.label || entry?.title?.label;
        const artist = entry?.["im:artist"]?.label || entry?.["im:artist"]?.name;
        const images = Array.isArray(entry?.["im:image"]) ? entry["im:image"] : [];
        const artwork = images.length ? images[images.length - 1].label : null;
        if (!id || !title || !artist) continue;
        all.push({
          source: "itunes_feed",
          id: String(id),
          title,
          artist,
          artwork,
        });
      }
    } catch (err) {
      warnMinigame(err);
    }
  }
  cachedSongs = all;
  cachedSongsAt = now;
  return cachedSongs;
}

async function fetchPopularSong(cfg?) {
  const list = await loadPopularSongList(cfg);
  if (!list.length) return null;
  const onlyWithPreview = list.filter((item?) => item?.previewUrl);
  const pool = onlyWithPreview.length ? onlyWithPreview : list;
  const pick = pool[randomBetween(0, pool.length - 1)];
  if (!pick?.id) return null;

  if (pick.source === "deezer") {
    const artistCountry = await fetchArtistCountry(cfg, pick.artist);
    return {
      title: pick.title,
      artist: pick.artist,
      album: pick.album || "Album sconosciuto",
      artwork: pick.artwork || null,
      genre: pick.genre || "Genere sconosciuto",
      artistCountry: artistCountry || "Nazionalità sconosciuta",
      previewUrl: pick.previewUrl || null,
    };
  }

  const lookupUrl = `https://itunes.apple.com/lookup?id=${encodeURIComponent(pick.id)}`;
  try {
    const res = await axios.get(lookupUrl, { timeout: 15000 });
    const item = Array.isArray(res?.data?.results) ? res.data.results[0] : null;
    if (!item?.trackName || !item?.artistName) return null;
    const genre = item?.primaryGenreName || "Genere sconosciuto";
    const artistCountry = await fetchArtistCountry(cfg, pick.artist);
    return {
      title: item?.trackName || pick.title,
      artist: item?.artistName || pick.artist,
      album: item?.collectionName || "Album sconosciuto",
      artwork: item?.artworkUrl100
        ? item.artworkUrl100.replace("100x100bb", "600x600bb")
        : pick.artwork,
      genre,
      artistCountry: artistCountry || "Nazionalità sconosciuta",
      previewUrl: item?.previewUrl || null,
    };
  } catch {
    return null;
  }
}

function normalizeArtistLabel(value?) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\((feat|ft)\.?[^)]*\)/g, " ")
    .replace(/\b(feat|ft)\.?[\s\S]*$/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildArtistSearchTerms(artistName?) {
  const raw = String(artistName || "").trim();
  const normalized = normalizeArtistLabel(raw);
  const terms = new Set();
  if (raw) terms.add(raw);
  if (normalized && normalized !== raw.toLowerCase()) terms.add(normalized);
  return Array.from(terms).filter(Boolean);
}

function pickBestArtistCandidate(candidates?, artistName?) {
  if (!Array.isArray(candidates) || !candidates.length) return null;
  const target = normalizeArtistLabel(artistName);
  const scored = candidates.map((artist?) => { const artistLabel = normalizeArtistLabel(artist?.name); const hasCountry = Boolean(artist?.country || artist?.area?.name); const mbScore = Number(artist?.score || 0); let nameScore = 0; if (artistLabel && target) { if (artistLabel === target) nameScore = 120; else if (artistLabel.includes(target) || target.includes(artistLabel)) nameScore = 60; } const countryBonus = hasCountry ? 30 : 0; return { artist, score: mbScore + nameScore + countryBonus }; }).sort((a?, b?) => b.score - a.score);
  return scored[0]?.artist || null;
}

async function fetchArtistCountry(cfg?, artistName?) {
  if (!artistName) return null;
  const apiBase = cfg?.guessSong?.artistApiUrl || "https://musicbrainz.org/ws/2/artist/?query=artist:";
  const terms = buildArtistSearchTerms(artistName);
  const urls = [];

  for (const term of terms) {
    urls.push(`${apiBase}${encodeURIComponent(term)}&fmt=json&limit=8`);
  }
  urls.push(
    `https://musicbrainz.org/ws/2/artist/?query=artist:${encodeURIComponent(artistName)}&fmt=json&limit=8`,
  );
  urls.push(
    `https://musicbrainz.org/ws/2/artist/?query=artist:%22${encodeURIComponent(artistName)}%22&fmt=json&limit=8`,
  );

  const seen = new Set();
  for (const url of urls) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    try {
      const res = await axios.get(url, { timeout: 15000, headers: { "User-Agent": "ViniliCaffeBot/1.0 (discord bot)", }, });
      const candidates = Array.isArray(res?.data?.artists) ? res.data.artists : [];
      const artist = pickBestArtistCandidate(candidates, artistName);
      const country = artist?.country || artist?.area?.name || null;
      if (country) return country;
    } catch (err) {
      warnMinigame(err);
    }
  }
  return null;
}

function isWithinAllowedWindow(now?, start?, end?) {
  const startMinutes = (start?.hour ?? 9) * 60 + (start?.minute ?? 0);
  const endMinutes = (end?.hour ?? 23) * 60 + (end?.minute ?? 45);
  const parts = getRomeParts(now);
  const current = parts.hour * 60 + parts.minute;
  return current >= startMinutes && current <= endMinutes;
}

function getRomeParts(date?) {
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", });
  const parts = formatter.formatToParts(date);
  const map: Record<string, any> = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
  };
}

function getRomeDateKey(date?) {
  const parts = getRomeParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function buildGuessNumberEmbed(min?, max?, rewardExp?, durationMs?) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Indovina il numero <a:VC_Exclamation:1482534702077444217>")
    .setDescription(
      [
        `<:VC_EXP:1482534670896730143> Indovina un numero tra **${min}** e **${max}** per ottenere **${rewardExp} exp**.`,
        `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per indovinarlo!`,
        `> <a:VC_Winner:1482535294757507255> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`,
      ].join("\n"),
    );
}

function buildGuessWordEmbed(scrambled?, rewardExp?, durationMs?) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Indovina la parola <a:VC_Exclamation:1482534702077444217>")
    .setDescription(
      [
        `<:VC_EXP:1482534670896730143> Indovina la parola da queste lettere: **${scrambled}** per ottenere **${rewardExp} exp**.`,
        `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per indovinarla!`,
        `> <a:VC_Winner:1482535294757507255> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`,
      ].join("\n"),
    );
}

function buildGuessFlagEmbed(flagUrl?, rewardExp?, durationMs?) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Indovina la bandiera <a:VC_Exclamation:1482534702077444217>")
    .setDescription(
      [
        `<:VC_EXP:1482534670896730143> Indovina la nazione da questa bandiera per ottenere **${rewardExp} exp**.`,
        `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per indovinarla!`,
        `> <a:VC_Winner:1482535294757507255> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`,
      ].join("\n"),
    )
    .setImage(flagUrl);
}

function buildGuessPlayerEmbed(rewardExp?, durationMs?, imageUrl?) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Indovina il calciatore <a:VC_Exclamation:1482534702077444217>")
    .setDescription([
      `<:VC_EXP:1482534670896730143> Indovina il calciatore più famoso per ottenere **${rewardExp} exp**.`,
      `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per indovinarlo!`,
      `> <a:VC_Winner:1482535294757507255> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`,
    ].join("\n"),);
  if (imageUrl) {
    embed.setImage(imageUrl);
  }
  return embed;
}

function buildPlainMaskedTextHint(value?) {
  const normalized = normalizeCountryName(value);
  if (!normalized) return null;
  const plain = normalized.replace(/\s+/g, "");
  if (plain.length <= 2) return `Inizia con "${plain[0] || "?"}"`;
  return `Inizia con "${plain[0]}" e termina con "${plain[plain.length - 1]}" (${plain.length} lettere)`;
}

function buildHogwartsGuessCharacterEmbed(rewardExp?, durationMs?, clueLines = []) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const extra = Array.isArray(clueLines) ? clueLines.filter(Boolean) : [];
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Indovina il personaggio <a:VC_Exclamation:1482534702077444217>")
    .setDescription(
      [
        `<:VC_EXP:1482534670896730143> Indovina il personaggio di Harry Potter per ottenere **${rewardExp} exp**.`,
        ...extra,
        `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per indovinarlo!`,
        `> <a:VC_Winner:1482535294757507255> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`,
      ].join("\n"),
    );
  return embed;
}

async function buildHogwartsCharacterImageAttachment(imageUrl?) {
  try {
    registerCanvasFonts(canvasModule);
    const portrait = await safeLoadImage(imageUrl, { suppressWarning: true });
    if (!portrait) return null;
    const width = 1400;
    const height = 780;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    fillCanvasBackground(ctx, width, height);
    const cardX = CANVAS_STYLE.padding;
    const cardY = CANVAS_STYLE.padding;
    const cardW = width - CANVAS_STYLE.padding * 2;
    const cardH = height - CANVAS_STYLE.padding * 2;
    fillCanvasCard(ctx, cardX, cardY, cardW, cardH);
    ctx.textAlign = "center";
    ctx.fillStyle = CANVAS_STYLE.titleColor;
    ctx.font = fontStackPrimaryOnly(68, "700");
    ctx.fillText("Indovina il personaggio", width / 2, cardY + 48);
    const maxW = cardW - 120;
    const maxH = cardH - 200;
    const scale = Math.min(maxW / portrait.width, maxH / portrait.height, 1);
    const drawW = Math.round(portrait.width * scale);
    const drawH = Math.round(portrait.height * scale);
    const x = (width - drawW) / 2;
    const y = cardY + 140;
    ctx.drawImage(portrait, x, y, drawW, drawH);
    return new AttachmentBuilder(canvas.toBuffer("image/png"), { name: "hogwarts_guess_character.png" });
  } catch {
    return null;
  }
}

function resolveHogwartsCharacterImage(entry?, client = null) {
  const imageFile = String(entry?.imageFile || "").trim();
  if (imageFile) {
    const slug = String(entry?.name || "character").replace(/[^\w.-]+/g, "-").toLowerCase();
    const built = buildImageAttachmentFromRelativePath(imageFile, `hp-character-${slug}`);
    if (built?.attachment) {
      return { attachment: built.attachment, imageUrl: built.url };
    }
    const siteUrl = resolveShopItemPublicImageUrl(client, imageFile);
    if (siteUrl) return { attachment: null, imageUrl: siteUrl };
  }
  const imageUrl = String(entry?.imageUrl || "").trim();
  if (imageUrl) return { attachment: null, imageUrl };
  return { attachment: null, imageUrl: null };
}

function pickHogwartsCharacterEntry(channelId?) {
  const bank = getHogwartsCharacterBank();
  if (!Array.isArray(bank) || !bank.length) return null;
  return pickQuestionAvoidRecent(channelId, "hogwartsGuessCharacter", bank, (r?) => r?.name, 12) || pickRandomItem(bank);
}

function buildGuessSongEmbed(rewardExp?, durationMs?, artworkUrl?) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Indovina la canzone <a:VC_Exclamation:1482534702077444217>")
    .setDescription([
      `<:VC_EXP:1482534670896730143> Indovina la canzone per ottenere **${rewardExp} exp**.`,
      `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per indovinarla!`,
      `> <a:VC_Winner:1482535294757507255> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`,
    ].join("\n"),);
  if (artworkUrl) embed.setImage(artworkUrl);
  return embed;
}

function buildGuessCapitalEmbed(country?, rewardExp?, durationMs?, imageUrl = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Indovina la capitale <a:VC_Exclamation:1482534702077444217>")
    .setDescription([
      `<:VC_EXP:1482534670896730143> Indovina la capitale di **${country}** per ottenere **${rewardExp} exp**.`,
      `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per rispondere!`,
      `> <a:VC_Winner:1482535294757507255> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`,
    ].join("\n"),
    );
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildGuessRegionCapitalEmbed(region?, rewardExp?, durationMs?, imageUrl = null, imageName = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Indovina il capoluogo <a:VC_Exclamation:1482534702077444217>")
    .setDescription([
      `<:VC_EXP:1482534670896730143> Indovina il capoluogo della regione **${region}** per ottenere **${rewardExp} exp**.`,
      `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per rispondere!`,
      `> <a:VC_Winner:1482535294757507255> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`,
    ].join("\n"),
    );
  if (imageName) embed.setImage(`attachment://${imageName}`);
  else if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildGuessReverseCapitalEmbed(capital?, rewardExp?, durationMs?, imageUrl = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Capitale inverso <a:VC_Exclamation:1482534702077444217>")
    .setDescription([
      `<:VC_EXP:1482534670896730143> **${capital}** è la capitale di quale Stato? Indovina per **${rewardExp} exp**.`,
      `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per rispondere!`,
      `> <a:VC_Winner:1482535294757507255> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`,
    ].join("\n"),
    );
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildFastTypeEmbed(phrase?, rewardExp?, durationMs?) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Scrivi per primo la frase <a:VC_Exclamation:1482534702077444217>")
    .setDescription(
      [
        `<:VC_EXP:1482534670896730143> Il primo che scrive questa frase ottiene **${rewardExp} exp**.`,
        `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per scrivere la frase.`,
        `> <a:VC_Winner:1482535294757507255> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`,
      ].join("\n"),
    );
}

function buildGuessTeamEmbed(rewardExp?, durationMs?, imageUrl?) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Indovina la squadra di calcio <a:VC_Exclamation:1482534702077444217>")
    .setDescription([
      `<:VC_EXP:1482534670896730143> Indovina la squadra di calcio dal logo per ottenere **${rewardExp} exp**.`,
      `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per indovinare la squadra.`,
      `> <a:VC_Winner:1482535294757507255> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`,
    ].join("\n"),
    );
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildGuessSingerEmbed(rewardExp?, durationMs?, imageUrl?) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Indovina il cantante <a:VC_Exclamation:1482534702077444217>")
    .setDescription([
      `<:VC_EXP:1482534670896730143> Indovina il cantante dalla foto per ottenere **${rewardExp} exp**.`,
      `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per indovinare il cantante.`,
      `> <a:VC_Winner:1482535294757507255> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`,
    ].join("\n"),
    );
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildGuessAlbumEmbed(rewardExp?, durationMs?, imageUrlOrAttachment?) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Indovina l'album <a:VC_Exclamation:1482534702077444217>")
    .setDescription([
      `<:VC_EXP:1482534670896730143> Indovina l'album dalla copertina per ottenere **${rewardExp} exp**.`,
      `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per indovinare l'album.`,
      `> <a:VC_Winner:1482535294757507255> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`,
    ].join("\n"),
    );
  if (imageUrlOrAttachment) embed.setImage(imageUrlOrAttachment);
  return embed;
}

const CENSORED_ARTWORK_MAX_SIDE = 600;
const CENSOR_MAX_BLUR_PX = 55;
const CENSOR_STEP_INTERVAL_MS = 60 * 1000;

async function censorArtworkImage(imageUrl?, opts: Record<string, any> = {}) {
  if (!imageUrl || typeof imageUrl !== "string") return null;
  const overlayAlpha = Math.max(0, Math.min(1, Number(opts?.overlayAlpha ?? 0.98)));
  try {
    const res = await axios.get(imageUrl, { responseType: "arraybuffer", timeout: 12000 });
    const buf = Buffer.from(res.data);
    if (!buf?.length) return null;
    const img = await loadImage(buf);
    if (!img || !img.width || !img.height) return null;

    const maxSide = CENSORED_ARTWORK_MAX_SIDE;
    let w = img.width;
    let h = img.height;
    if (w > maxSide || h > maxSide) {
      if (w >= h) {
        h = Math.round((h * maxSide) / w);
        w = maxSide;
      } else {
        w = Math.round((w * maxSide) / h);
        h = maxSide;
      }
    }

    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext("2d");

    if (overlayAlpha > 0) {
      const blurPx = (Math.min(w, h) / 400) * CENSOR_MAX_BLUR_PX * overlayAlpha;
      ctx.filter = `blur(${Math.max(1, Math.round(blurPx))}px)`;
    }
    ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, w, h);
    ctx.filter = "none";

    const attachmentName = opts?.attachmentName || "minigame_artwork.png";
    return { buffer: canvas.toBuffer("image/png"), attachmentName };
  } catch {
    return null;
  }
}

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

function buildHangmanEmbed(maskedWord?, rewardExp?, durationMs?) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Impiccato <a:VC_Exclamation:1482534702077444217>")
    .setDescription(
      [
        `<:VC_EXP:1482534670896730143> Scrivi una lettera o prova la parola intera per ottenere **${rewardExp} exp**.`,
        `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per indovinare la parola.`,
        `> <a:VC_Winner:1482535294757507255> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`,
      ].join("\n"),
    );
}

function buildRegionNameImageAttachment(regionName?, client = null, seed = "guess_region_capital", distortQuestion = false) {
  let safeRegion = String(regionName || "").trim();
  if (!safeRegion) return null;
  let label = "Regione";
  label = distortPromptIfBurrobirra(client, label, `${seed}:label`, distortQuestion);
  safeRegion = distortPromptIfBurrobirra(client, safeRegion, `${seed}:region`, distortQuestion);
  try {
    registerCanvasFonts(canvasModule);
    const width = 1200;
    const height = 420;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    fillCanvasBackground(ctx, width, height);
    const pad = CANVAS_STYLE.padding;
    const cardW = width - pad * 2;
    const cardH = height - pad * 2;
    fillCanvasCard(ctx, pad, pad, cardW, cardH, 20);

    ctx.fillStyle = CANVAS_STYLE.titleColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = fontStackPrimaryOnly(52, "700");
    ctx.fillText(label, width / 2, 140);
    ctx.fillStyle = CANVAS_STYLE.bodyColor;
    ctx.font = fontStackPrimaryOnly(96, "700");
    ctx.fillText(safeRegion, width / 2, 250, width - 120);

    return new AttachmentBuilder(canvas.toBuffer("image/png"), {
      name: "region_name.png",
    });
  } catch {
    return null;
  }
}

function buildItalianGkEmbed(question?, rewardExp?, durationMs?) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Cultura generale <a:VC_Exclamation:1482534702077444217>")
    .setDescription(
      [
        `<:VC_EXP:1482534670896730143> **Domanda:** ${question} per ottenere **${rewardExp} exp**.`,
        `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per rispondere alla domanda.`,
        `> <a:VC_Winner:1482535294757507255> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`,
      ].join("\n"),
    );
}

function buildHogwartsQuizEmbed(question?, rewardExp?, durationMs?) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Quiz Evento <a:VC_Exclamation:1482534702077444217>")
    .setDescription(
      [
        `<:VC_EXP:1482534670896730143> **Domanda:** ${question} per ottenere **${rewardExp} exp**.`,
        `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per rispondere.`,
        `> <a:VC_Winner:1482535294757507255> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`,
      ].join("\n"),
    );
}

function buildHogwartsCipherEmbed(numbers?, rewardExp?, durationMs?, options = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const strong = Boolean(options?.burrobirraStrong);
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Codice Alfabetico <a:VC_Exclamation:1482534702077444217>")
    .setDescription(
      [
        strong
          ? `<:VC_EXP:1482534670896730143> Decifra e riordina per **${rewardExp} exp**.`
          : `<:VC_EXP:1482534670896730143> Decripta i seguenti numeri in una parola per ottenere **${rewardExp} exp**.`,
        strong
          ? "Ogni numero è una lettera (A=1…), ma **non** nell'ordine della parola: non basta convertirli in fila."
          : "Ogni numero indica la lettera in ordine alfabetico. Buona fortuna!",
        "",
        `# ${numbers}`,
        "",
        `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per rispondere.`,
      ].join("\n"),
    );
}

function emptyObservationTowerHouseBrickCounts() {
  const out: Record<string, any> = {};
  for (const id of HOGWARTS_HOUSE_IDS) out[id] = 0;
  return out;
}

function serializeObservationTowerHouseBrickCounts(counts?) {
  const out = emptyObservationTowerHouseBrickCounts();
  const source = counts && typeof counts === "object" ? counts : {};
  for (const id of HOGWARTS_HOUSE_IDS) {
    out[id] = Math.max(0, Math.floor(Number(source[id] || 0)));
  }
  return out;
}

function parseObservationTowerHouseBrickCounts(parsed?) {
  if (parsed?.houseBrickCounts && typeof parsed.houseBrickCounts === "object") {
    return serializeObservationTowerHouseBrickCounts(parsed.houseBrickCounts);
  }
  return emptyObservationTowerHouseBrickCounts();
}

function allObservationTowerHousesComplete(houseBrickCounts?, targetBricks?) {
  const target = Math.max(1, Math.floor(Number(targetBricks) || 1));
  const counts = serializeObservationTowerHouseBrickCounts(houseBrickCounts);
  return HOGWARTS_HOUSE_IDS.every((id?) => Number(counts[id] || 0) >= target);
}

function formatObservationTowerProgressBar(current?, target?, width = 12) {
  const t = Math.max(1, Math.floor(Number(target) || 1));
  const c = Math.max(0, Math.min(t, Math.floor(Number(current) || 0)));
  const filled = Math.round((c / t) * width);
  return `${"▰".repeat(filled)}${"▱".repeat(Math.max(0, width - filled))}`;
}

const OBSERVATION_TOWER_HOUSE_EMOJI = Object.freeze({
  gryffindor: "🦁",
  hufflepuff: "🦡",
  ravenclaw: "🦅",
  slytherin: "🐍",
});

function getObservationTowerMaxPerUser(game?) {
  return Math.max(1, Math.floor(Number(game?.maxPerUser) || OBSERVATION_TOWER_DEFAULT_MAX_PER_USER));
}

function getObservationTowerTargetBricks(game?) {
  return Math.max(1, Math.floor(Number(game?.targetBricks) || OBSERVATION_TOWER_DEFAULT_TARGET_BRICKS));
}

function getObservationTowerMinPlayers(game?) {
  const target = getObservationTowerTargetBricks(game);
  const maxPerUser = getObservationTowerMaxPerUser(game);
  const derived = Math.max(1, Math.ceil(target / maxPerUser));
  const configured = Math.floor(Number(game?.minPlayers));
  if (Number.isFinite(configured) && configured > 0) return Math.max(configured, derived);
  return derived;
}

function recomputeObservationTowerHouseBrickCounts(participantCounts?, participantHouses?, maxPerUser?, targetBricks?) {
  const max = Math.max(1, Math.floor(Number(maxPerUser) || OBSERVATION_TOWER_DEFAULT_MAX_PER_USER));
  const target = Math.max(1, Math.floor(Number(targetBricks) || OBSERVATION_TOWER_DEFAULT_TARGET_BRICKS));
  const bricks = emptyObservationTowerHouseBrickCounts();
  const counts = serializeObservationTowerParticipants(participantCounts);
  const houses = serializeObservationTowerParticipantHouses(participantHouses);
  for (const [uid, hid] of Object.entries(houses)) {
    const n = Math.min(max, Math.max(0, Math.floor(Number(counts[uid] || 0))));
    if (n <= 0) continue;
    bricks[hid] = Math.min(target, Number(bricks[hid] || 0) + n);
  }
  return bricks;
}

function syncObservationTowerBricksToUserCaps(game?) {
  if (!game) return game;
  game.houseBrickCounts = recomputeObservationTowerHouseBrickCounts(
    game.participantCounts,
    game.participantHouses,
    getObservationTowerMaxPerUser(game),
    getObservationTowerTargetBricks(game),
  );
  return game;
}

function formatObservationTowerHouseProgress(houseBrickCounts?, targetBricks?, soloHouseId = "", game = null) {
  const target = Math.max(1, Math.floor(Number(targetBricks) || 1));
  const counts = serializeObservationTowerHouseBrickCounts(houseBrickCounts);
  const soloHouse = String(soloHouseId || "").trim();
  const houseIds = soloHouse ? [soloHouse] : HOGWARTS_HOUSE_IDS;
  const minPlayers = game ? getObservationTowerMinPlayers({ ...game, targetBricks: target }) : 1;
  return houseIds
    .map((id?) => {
      const label = getHouseMeta(id)?.label || id;
      const emoji = OBSERVATION_TOWER_HOUSE_EMOJI[id] || "🧱";
      const n = Number(counts[id] || 0);
      const builders = game ? countObservationTowerHouseParticipants(game.participantHouses, id) : 0;
      const done = game
        ? isObservationTowerHouseComplete(id, { ...game, houseBrickCounts: counts, targetBricks: target })
        : n >= target;
      const bar = formatObservationTowerProgressBar(n, target);
      const mark = done ? "✅" : "⏳";
      const pct = Math.min(100, Math.round((n / target) * 100));
      const buildersPart = game ? ` · costruttori **${builders}/${minPlayers}**` : "";
      return `${mark} ${emoji} **${label}** · \`${bar}\` **${n}/${target}** (${pct}%)${buildersPart}`;
    })
    .join("\n");
}

function countObservationTowerParticipants(participantCounts?) {
  return Object.keys(serializeObservationTowerParticipants(participantCounts)).length;
}

function serializeObservationTowerParticipantHouses(participantHouses?) {
  const out: Record<string, any> = {};
  const source = participantHouses && typeof participantHouses === "object" ? participantHouses : {};
  for (const [userId, houseId] of Object.entries(source)) {
    const uid = String(userId || "").trim();
    const hid = normalizeHogwartsHouseId(houseId);
    if (uid && hid) out[uid] = hid;
  }
  return out;
}

function countObservationTowerHouseParticipants(participantHouses?, houseId?) {
  const hid = normalizeHogwartsHouseId(houseId);
  if (!hid) return 0;
  const houses = serializeObservationTowerParticipantHouses(participantHouses);
  let count = 0;
  for (const mappedHouse of Object.values(houses)) {
    if (mappedHouse === hid) count += 1;
  }
  return count;
}

function isObservationTowerHouseComplete(houseId?, game?) {
  const hid = normalizeHogwartsHouseId(houseId);
  if (!hid || !game) return false;
  const target = getObservationTowerTargetBricks(game);
  const minPlayers = getObservationTowerMinPlayers(game);
    const counts = recomputeObservationTowerHouseBrickCounts(
    game.participantCounts,
    game.participantHouses,
    getObservationTowerMaxPerUser(game),
    target,
  );
  if (Number(counts[hid] || 0) < target) return false;
    return countObservationTowerHouseParticipants(game.participantHouses, hid) >= minPlayers;
}

function isObservationTowerComplete(game?) {
  if (!game) return false;
  const soloHouseId = String(game.soloHouseId || game.hogwartsHouseChannel?.soloHouseId || "").trim();
  if (soloHouseId) return isObservationTowerHouseComplete(soloHouseId, game);
  return HOGWARTS_HOUSE_IDS.every((id?) => isObservationTowerHouseComplete(id, game));
}

function applyObservationTowerBrickCredit(game?, userId?, houseId?) {
  const uid = String(userId || "").trim();
  const hid = normalizeHogwartsHouseId(houseId);
  if (!game || !uid || !hid) return null;

  const maxPerUser = Math.max(1, Math.floor(Number(game.maxPerUser) || OBSERVATION_TOWER_DEFAULT_MAX_PER_USER));
  const targetBricks = Math.max(1, Math.floor(Number(game.targetBricks) || OBSERVATION_TOWER_DEFAULT_TARGET_BRICKS));
  const participantCounts = serializeObservationTowerParticipants(game.participantCounts);
  const participantHouses = serializeObservationTowerParticipantHouses(game.participantHouses);
  const houseBrickCounts = serializeObservationTowerHouseBrickCounts(game.houseBrickCounts);

  const probe = { ...game, participantCounts, participantHouses, houseBrickCounts };
  if (isObservationTowerHouseComplete(hid, probe)) {
    return { ok: false, reason: "house_complete", participantCounts, participantHouses, houseBrickCounts };
  }
  if (Number(participantCounts[uid] || 0) >= maxPerUser) {
    return { ok: false, reason: "user_cap", participantCounts, participantHouses, houseBrickCounts };
  }

  const alreadyBuilder = Boolean(participantHouses[uid]) || Number(participantCounts[uid] || 0) > 0;
    const syncedBricks = recomputeObservationTowerHouseBrickCounts(
    participantCounts,
    participantHouses,
    maxPerUser,
    targetBricks,
  );
  const bricks = Number(syncedBricks[hid] || 0);
  if (bricks >= targetBricks) {
        if (alreadyBuilder) {
      return {
        ok: false,
        reason: "brick_cap",
        participantCounts,
        participantHouses,
        houseBrickCounts: syncedBricks,
      };
    }
    participantHouses[uid] = hid;
    return {
      ok: true,
      reason: "builder_only",
      participantCounts,
      participantHouses,
      houseBrickCounts: recomputeObservationTowerHouseBrickCounts(
        participantCounts,
        participantHouses,
        maxPerUser,
        targetBricks,
      ),
    };
  }

  participantCounts[uid] = Number(participantCounts[uid] || 0) + 1;
  participantHouses[uid] = hid;
  return {
    ok: true,
    reason: "brick",
    participantCounts,
    participantHouses,
    houseBrickCounts: recomputeObservationTowerHouseBrickCounts(
      participantCounts,
      participantHouses,
      maxPerUser,
      targetBricks,
    ),
  };
}

function buildObservationTowerEmbed(targetBricks?, durationMs?, rewardExp?, maxPerUser?, minLetters?, housePoints = 0, unsortedHousePoints = 0, soloHouseId = "", minPlayers = 1) {
  const seconds = Math.max(1, Math.round(durationMs / 1000));
  const soloHouse = String(soloHouseId || "").trim();
  const soloLabel = soloHouse ? (getHouseMeta(soloHouse)?.label || soloHouse) : "";
  const minBuilders = Math.max(1, Math.floor(Number(minPlayers) || 1));
  const rewardLines = soloHouse
    ? [`> Quando **${soloLabel}** completa la torre, i partecipanti ricevono **${rewardExp} exp**.`]
    : [`> Quando **ogni casata** completa la sua torre, i partecipanti ricevono **${rewardExp} exp**.`];
  if (Number(housePoints || 0) > 0) {
    rewardLines.push(
      soloHouse
        ? `> Al completamento, la casata **${soloLabel}** riceve **${housePoints} punti**.`
        : `> Al termine, **ogni casata che completa** la torre riceve **${housePoints} punti** (anche se le altre non finiscono).`,
    );
  }
  if (!soloHouse && Number(unsortedHousePoints || 0) > 0) {
    rewardLines.push(`> Per ogni partecipante non smistato, tutte le case ricevono **${unsortedHousePoints} punti**.`);
  }
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Ristruttura la torre d'osservazione <a:VC_Exclamation:1482534702077444217>")
    .setDescription([
      soloHouse
        ? `<:VC_EXP:1482534670896730143> Solo i membri di **${soloLabel}** possono costruire: ogni messaggio valido vale **1 mattone**.`
        : `<:VC_EXP:1482534670896730143> Ogni messaggio valido vale **1 mattone** per la **tua casata** (serve lo smistamento).`,
      soloHouse
        ? `**${soloLabel}** deve raggiungere **${targetBricks} mattoni** entro **${seconds} secondi**.`
        : `Ogni casata deve raggiungere **${targetBricks} mattoni** entro **${seconds} secondi**.`,
      "",
      `> Minimo **${minLetters} lettere** per messaggio.`,
      `> Massimo **${maxPerUser} mattoni** per utente.`,
      minBuilders > 1
        ? (soloHouse
          ? `> Servono almeno **${minBuilders} costruttori** diversi della casata.`
          : `> Ogni casata deve avere almeno **${minBuilders} costruttori** diversi.`)
        : "",
      ...rewardLines,
    ].filter(Boolean).join("\n"));
}

function buildObservationTowerSuccessEmbed(houseBrickCounts?, targetBricks?, participantCount?, rewardExp?, topLines = [], housePoints = 0, unsortedHousePoints = 0, soloHouseId = "") {
  const soloHouse = String(soloHouseId || "").trim();
  const soloLabel = soloHouse ? (getHouseMeta(soloHouse)?.label || soloHouse) : "";
  const soloEmoji = soloHouse ? OBSERVATION_TOWER_HOUSE_EMOJI[soloHouse] || "🧱" : "";
  const lines = [
    soloHouse
      ? `<a:VC_Winner:1482535294757507255> ${soloEmoji} **${soloLabel}** ha ricostruito la torre d'osservazione!`
      : `<a:VC_Winner:1482535294757507255> Tutte le casate hanno ricostruito la torre d'osservazione!`,
    "",
    "<:VC_Stats:1482527532682055780> **Mattoni per casata**",
    formatObservationTowerHouseProgress(houseBrickCounts, targetBricks, soloHouseId),
    "",
    `<:VC_EXP:1482534670896730143> **${participantCount}** costruttori ricevono **${rewardExp} exp** ciascuno.`,
  ];
  if (Number(housePoints || 0) > 0) {
    lines.push(
      soloHouse
        ? `<a:VC_Winner:1482535294757507255> **${soloLabel}** guadagna **${housePoints} punti casa**.`
        : `<a:VC_Winner:1482535294757507255> Ogni casata guadagna **${housePoints} punti casa**.`,
    );
  }
  if (!soloHouse && Number(unsortedHousePoints || 0) > 0) {
    lines.push(`> Per ogni partecipante non smistato, tutte le case ricevono **${unsortedHousePoints} punti**.`);
  }
  if (topLines.length) {
    lines.push("", `🧱 **Top costruttori:** ${topLines.join(" · ")}`);
  }
  return new EmbedBuilder()
    .setColor(0xd4a888)
    .setTitle("Torre completata <a:VC_Exclamation:1482534702077444217>")
    .setDescription(lines.filter(Boolean).join("\n"));
}

function formatObservationTowerBoostSuffix(row?) {
  const mult = Math.max(1, Math.floor(Number(row?.consumableMultiplier) || 1));
  if (mult <= 1) return "";
  const labels = Array.isArray(row?.consumableLabels) ? row.consumableLabels.filter(Boolean) : [];
  const labelText = labels.length ? ` (${labels.join(" · ")})` : "";
  return ` · boost ×${mult}${labelText}`;
}

function buildObservationTowerTimeoutEmbed(houseBrickCounts?, targetBricks?, soloHouseId = "", opts: Record<string, any> = {}) {
  const soloHouse = String(soloHouseId || "").trim();
  const soloLabel = soloHouse ? (getHouseMeta(soloHouse)?.label || soloHouse) : "";
  const awardedRows = Array.isArray(opts.awardedHouses)
    ? opts.awardedHouses.filter((row?) => row && (row.label || row.houseId))
    : [];
  const awardedLabels = awardedRows.length
    ? awardedRows.map((row?) => String(row.label || getHouseMeta(row.houseId)?.label || row.houseId || "").trim()).filter(Boolean)
    : (Array.isArray(opts.awardedHouseLabels)
      ? opts.awardedHouseLabels.map((s?) => String(s || "").trim()).filter(Boolean)
      : []);
  const fallbackHousePoints = Math.max(0, Math.floor(Number(opts.housePoints) || 0));
  const hasAwards = awardedLabels.length > 0 && (awardedRows.some((r?) => Number(r.points) > 0) || fallbackHousePoints > 0);
  const gameForProgress = opts.game && typeof opts.game === "object" ? opts.game : null;
  const counts = serializeObservationTowerHouseBrickCounts(
    gameForProgress ? gameForProgress.houseBrickCounts : houseBrickCounts,
  );
  const target = Math.max(1, Math.floor(Number(targetBricks) || 1));
  const houseIds = soloHouse ? [soloHouse] : HOGWARTS_HOUSE_IDS;
  const completedCount = houseIds.filter((id?) =>
    gameForProgress
      ? isObservationTowerHouseComplete(id, gameForProgress)
      : Number(counts[id] || 0) >= target,
  ).length;

  const lead = soloHouse
    ? `La clessidra è vuota: **${soloLabel}** non ha chiuso i lavori in tempo.`
    : hasAwards
      ? `La clessidra è vuota… ma **${completedCount}/${houseIds.length}** casate hanno comunque completato la torre.`
      : `La clessidra è vuota: **nessuna casata** ha chiuso tutti i lavori in tempo.`;

  const embed = new EmbedBuilder()
    .setColor(hasAwards ? 0xc9a227 : 0x8b7bb8)
    .setTitle("<a:VC_pixeltime:1482535344103620771> Torre d'osservazione — tempo scaduto")
    .setDescription(
      [
        lead,
        "",
        "<:VC_Stats:1482527532682055780> **Progresso casate**",
        formatObservationTowerHouseProgress(counts, targetBricks, soloHouseId, gameForProgress),
      ].join("\n"),
    );

  if (hasAwards) {
    const awardLines =
      awardedRows.length === 1
        ? [
            `<a:VC_Winner:1482535294757507255> **${awardedLabels[0]}** riceve **${Number(awardedRows[0].points) || fallbackHousePoints} punti casa**${formatObservationTowerBoostSuffix(awardedRows[0])}`,
            `per aver completato la torre prima dello stop.`,
          ]
        : awardedRows.length > 1
          ? [
              `<a:VC_Winner:1482535294757507255> Casate premiate:`,
              ...awardedRows.map((row?) => {
                const label = String(row.label || getHouseMeta(row.houseId)?.label || row.houseId || "").trim();
                const pts = Number(row.points) || fallbackHousePoints;
                return `• **${label}** · **${pts} punti**${formatObservationTowerBoostSuffix(row)}`;
              }),
            ]
          : awardedLabels.length === 1
            ? [
                `<a:VC_Winner:1482535294757507255> **${awardedLabels[0]}** riceve **${fallbackHousePoints} punti casa**`,
                `per aver completato la torre prima dello stop.`,
              ]
            : [
                `<a:VC_Winner:1482535294757507255> Casate premiate (**${fallbackHousePoints} punti** ciascuna):`,
                ...awardedLabels.map((label?) => `• **${label}**`),
              ];
    embed.addFields({
      name: "Premi assegnati",
      value: awardLines.join("\n"),
    });
  } else if (!soloHouse) {
    embed.addFields({
      name: "Esito",
      value:
        "> Nessuna casata ha completato mattoni **e** costruttori minimi: nessun punto casa assegnato.",
    });
  }

  return embed;
}

function buildObservationTowerStopEmbed() {
  return new EmbedBuilder()
    .setColor(0xb08968)
    .setTitle("<a:VC_pixeltime:1482535344103620771> STOP — conteggio in corso")
    .setDescription(
      [
        "⏱️ **Tempo scaduto!** Non mandate altri mattoni.",
        "",
        "Sto ricalcolando i messaggi della round con calma per assegnare i punti in modo corretto…",
      ].join("\n"),
    );
}

const DRIVING_QUIZ_LETTERS = ["A", "B", "C", "D"];

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

function buildDrivingQuizEmbed(row?, rewardExp?, durationMs?) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const statement = row?.statement ?? "";
  const isMultiple = row?.questionType === "multiple" && Array.isArray(row.options) && row.options.length >= 2;
  const lines = [`<:VC_EXP:1482534670896730143> **${isMultiple ? "Domanda" : "Affermazione"}:** ${statement}`,
  ];
  if (isMultiple) {
    row.options.forEach((opt?, i?) => {
      const letter = DRIVING_QUIZ_LETTERS[i] ?? String(i + 1);
      lines.push(`**${letter})** ${opt}`);
    });
    lines.push("Rispondi con la lettera (A, B, C, D), il numero (1-4) o il testo della risposta.");
  } else {
    lines.push("Rispondi con `vero` o `falso`.");
  }
  lines.push(
    `Ricompensa: **${rewardExp} exp**`,
    `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)}.`,
  );
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Quiz patente <a:VC_Exclamation:1482534702077444217>")
    .setDescription(lines.join("\n"));
}

function buildMathExpressionEmbed( expression?, rewardExp?, durationMs?, imageName = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Espressione matematica <a:VC_Exclamation:1482534702077444217>")
    .setDescription([
      `<:VC_EXP:1482534670896730143> Risolvi: **${expression}** per ottenere **${rewardExp} exp**.`,
      `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per risolvere l'espressione.`,
      `> <a:VC_Winner:1482535294757507255> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`,
    ].join("\n"),
    );
  if (imageName) embed.setImage(`attachment://${imageName}`);
  return embed;
}

function buildFindBotEmbed(rewardExp?, durationMs?) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Trova il bot <a:VC_Exclamation:1482534702077444217>")
    .setDescription(
      [
        `<:VC_EXP:1482534670896730143> Trova il messaggio del bot tra i canali del server, premi il bottone per ottenere **${rewardExp} exp**.`,
        `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per trovarlo.`,
        `> <a:VC_Winner:1482535294757507255> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`,
      ].join("\n"),
    );
}

function buildFindBotButtonEmbed(rewardExp?, durationMs?) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Sei vicino al bot <a:VC_Exclamation:1482534702077444217>")
    .setDescription(
      [
        `<:VC_EXP:1482534670896730143> Hai trovato il messaggio nascosto: clicca il bottone per ottenere **${rewardExp} exp**.`,
        `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per cliccare il bottone.`,
        `> <a:VC_Winner:1482535294757507255> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`,
      ].join("\n"),
    );
}

function buildFindBotVoiceEmbed(rewardExp?, durationMs?) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Trova il bot in vocale <a:VC_Exclamation:1482534702077444217>")
    .setDescription(
      [
        `<:VC_EXP:1482534670896730143> Il bot si è nascosto in una **vocale vuota** del server: entra in quella vocale per ottenere **${rewardExp} exp**.`,
        `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per trovarlo.`,
        `> <a:VC_Winner:1482535294757507255> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`,
      ].join("\n"),
    );
}

function buildFindScrollEmbed(rewardExp?, durationMs?) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Trova la pergamena <a:VC_Exclamation:1482534702077444217>")
    .setDescription(
      [
        `<:VC_EXP:1482534670896730143> Trova la pergamena nascosta tra i canali del server, premi il bottone per ottenere **${rewardExp} exp**.`,
        `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per trovarla.`,
        `> <a:VC_Winner:1482535294757507255> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`,
      ].join("\n"),
    );
}

function buildFindScrollButtonEmbed(rewardExp?, durationMs?) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Hai trovato la pergamena <a:VC_Exclamation:1482534702077444217>")
    .setDescription(
      [
        `<:VC_EXP:1482534670896730143> Hai trovato la pergamena nascosta: clicca il bottone per ottenere **${rewardExp} exp**.`,
        `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per cliccare il bottone.`,
        `> <a:VC_Winner:1482535294757507255> Esegui il comando \`+mstats\` per vedere le tue statistiche dei minigiochi.`,
      ].join("\n"),
    );
}

function buildMinuteHintEmbed(channelId?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("<a:VC_Heart:1448672728822448141> Indizio")
    .setDescription(`<a:VC_Arrow:1482706699365257397> <#${channelId}>`);
}

function buildGenericHintEmbed(text?) {
  const safeText = typeof text === "string" ? text : String(text ?? "");
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("<a:VC_Heart:1448672728822448141> Indizio")
    .setDescription(`<a:VC_Arrow:1482706699365257397> ${safeText}`);
}

function buildMaskedTextHint(value?) {
  const normalized = normalizeCountryName(value);
  if (!normalized) return null;
  const plain = normalized.replace(/\s+/g, "");
  if (plain.length <= 2) return `<a:VC_Flame:1482725674711126140> Inizia con **${plain[0] || "?"}**`;
  return `<a:VC_Flame:1482725674711126140> Inizia con **${plain[0]}** e termina con **${plain[plain.length - 1]}** (${plain.length} lettere)`;
}

const ACCENT_TO_ASCII = {
  à: "a", á: "a", â: "a", ã: "a", ä: "a", å: "a", ā: "a", ă: "a", ą: "a", æ: "ae",
  è: "e", é: "e", ê: "e", ë: "e", ē: "e", ĕ: "e", ė: "e", ę: "e", ě: "e",
  ì: "i", í: "i", î: "i", ï: "i", ı: "i", ī: "i", ĭ: "i", į: "i",
  ò: "o", ó: "o", ô: "o", õ: "o", ö: "o", ō: "o", ŏ: "o", ő: "o", œ: "oe",
  ù: "u", ú: "u", û: "u", ü: "u", ū: "u", ŭ: "u", ů: "u", ű: "u",
  ñ: "n", Ñ: "N", ç: "c", Ç: "C", ý: "y", ÿ: "y", ß: "ss",
  À: "A", Á: "A", Â: "A", Ã: "A", Ä: "A", Å: "A", È: "E", É: "E", Ê: "E", Ë: "E",
  Ì: "I", Í: "I", Î: "I", Ï: "I", Ò: "O", Ó: "O", Ô: "O", õ: "O", Ö: "O",
  Ù: "U", Ú: "U", Û: "U", Ü: "U",
};

function normalizeHintTextForDiscord(str?) {
  if (str == null || typeof str !== "string") return "";
  let s = String(str).normalize("NFKC");
  const out = [];
  for (const ch of Array.from(s)) {
    const cp = ch.codePointAt(0);
    if (!Number.isFinite(cp)) {
      out.push(ch);
      continue;
    }
    if (ACCENT_TO_ASCII[ch] !== undefined) {
      out.push(ACCENT_TO_ASCII[ch]);
      continue;
    }
    if (cp >= 0xff01 && cp <= 0xff5e) {
      out.push(String.fromCodePoint(cp - 0xff01 + 0x21));
      continue;
    }
    if (cp >= 0x1d400 && cp <= 0x1d7ff) {
      const mathToAscii = [
        [0x1d400, 0x1d419, 0x41], [0x1d41a, 0x1d433, 0x61], [0x1d434, 0x1d44d, 0x41], [0x1d44e, 0x1d467, 0x61],
        [0x1d468, 0x1d481, 0x41], [0x1d482, 0x1d49b, 0x61], [0x1d49c, 0x1d4b5, 0x41], [0x1d4b6, 0x1d4cf, 0x61],
        [0x1d4d0, 0x1d4e9, 0x41], [0x1d4ea, 0x1d503, 0x61], [0x1d504, 0x1d51d, 0x41], [0x1d51e, 0x1d537, 0x61],
        [0x1d538, 0x1d551, 0x41], [0x1d552, 0x1d56b, 0x61], [0x1d56c, 0x1d585, 0x41], [0x1d586, 0x1d59f, 0x61],
        [0x1d5a0, 0x1d5b9, 0x41], [0x1d5ba, 0x1d5d3, 0x61], [0x1d5d4, 0x1d5ed, 0x41], [0x1d5ee, 0x1d607, 0x61],
        [0x1d608, 0x1d621, 0x41], [0x1d622, 0x1d63b, 0x61], [0x1d63c, 0x1d655, 0x41], [0x1d656, 0x1d66f, 0x61],
        [0x1d670, 0x1d689, 0x41], [0x1d68a, 0x1d6a3, 0x61],
        [0x1d7ce, 0x1d7d7, 0x30], [0x1d7e2, 0x1d7eb, 0x30], [0x1d7ec, 0x1d7f5, 0x30],
      ];
      let mapped = null;
      for (const [start, end, base] of mathToAscii) {
        if (cp >= start && cp <= end) {
          mapped = String.fromCodePoint(base + (cp - start));
          break;
        }
      }
      out.push(mapped ?? ch);
      continue;
    }
    if (cp <= 0x7f) {
      out.push(ch);
      continue;
    }
    const decomp = ch.normalize("NFD");
    if (decomp.length >= 1 && decomp[0].codePointAt(0) <= 0x7f) {
      out.push(decomp[0]);
      continue;
    }
    out.push(ch);
  }
  return out.join("");
}

function buildRevealHint(value?, revealRatio = 0.4, includeEmoji = false) {
  const raw = (typeof value === "string" ? value : String(value || ""));
  const normalized = normalizeHintTextForDiscord(raw).trim();
  if (!normalized) return null;
  const chars = normalized.split("");
  const charsLower = normalized.toLowerCase().split("");
  const indices = charsLower
    .map((_?, i?) => i)
    .filter((i?) => /[a-z0-9]/.test(charsLower[i]));
  if (indices.length === 0) return null;
  const wrap = (s?) => (includeEmoji ? `<a:VC_Flame:1482725674711126140> **${s}**` : `**${s}**`);
  const isLetterOrDigit = (c?) => /[a-z0-9]/i.test(c);
  if (indices.length <= 2) {
    const out = chars.map((c?, i?) => (indices.includes(i) ? c : isLetterOrDigit(c) ? "_" : c)).join("");
    return wrap(out.replace(/_/g, "\\_"));
  }
  const toReveal = Math.max(2, Math.min(indices.length, Math.round(indices.length * Math.min(0.5, Math.max(0.35, revealRatio)))));
  const revealedSet = new Set([indices[0], indices[indices.length - 1]]);
  const middle = indices.slice(1, -1);
  const step = middle.length <= 1 ? 1 : Math.max(1, Math.floor(middle.length / (toReveal - 2)));
  for (let k = 0; k < middle.length && revealedSet.size < toReveal; k += step) {
    revealedSet.add(middle[k]);
  }
  const out = chars.map((c?, i?) => {
    if (revealedSet.has(i)) return c;
    if (isLetterOrDigit(c)) return "_";
    return c;
  });
  const rawOut = out.join("");
  const escapedForDiscord = rawOut.replace(/_/g, "\\_");
  return wrap(escapedForDiscord);
}

function buildCountryHint(country?) {
  if (!country) return null;
  const parts = [];
  if (country.region) parts.push(`Continente: **${country.region}**`);
  if (country.subregion) parts.push(`Area: **${country.subregion}**`);
  if (country.populationLabel) parts.push(`Popolazione: **${country.populationLabel}**`);
  if (Array.isArray(country.languages) && country.languages.length) {
    parts.push(`Lingua/e: **${country.languages.slice(0, 2).join(", ")}**`);
  }
  if (!parts.length) return null;
  return `<a:VC_Flame:1482725674711126140> ${parts.join(" \u2022 ")}`;
}

function buildCapitalHint(countryName?) {
  const key = normalizeCountryName(countryName || "").replace(/\s+/g, " ");
  const region = key ? CAPITAL_COUNTRY_REGION[key] : null;
  if (!region) return null;
  return `<a:VC_Flame:1482725674711126140> Capitale di un paese in **${region}**.`;
}

function buildRegionCapitalHint(regionName?) {
  const data = regionName ? REGION_HINT_DATA[regionName] : null;
  if (!data) return null;
  const parts = [];
  if (Array.isArray(data.near) && data.near.length) {
    parts.push(`confina con **${data.near.join("** e **")}**`);
  }
  if (data.sea) {
    parts.push(`si affaccia sul **${data.sea}**`);
  }
  if (data.population) {
    parts.push(`ha circa **${data.population}** abitanti`);
  }
  if (!parts.length) return null;
  return `<a:VC_Flame:1482725674711126140> Capoluogo di una regione che ${parts.join(" • ")}.`;
}

function buildNumberNearHint(target?, min?, max?) {
  const low = Number(min || 1);
  const high = Number(max || 100);
  const range = Math.max(1, high - low);
  const band = Math.max(2, Math.round(range * 0.18));
  const from = Math.max(low, Number(target) - band);
  const to = Math.min(high, Number(target) + band);
  return `<a:VC_Flame:1482725674711126140> Il numero è tra **${from}** e **${to}**.`;
}

function buildHintEmbed(isHigher?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      isHigher
        ? "<:thumbsup:1471292172145004768> <a:VC_Arrow:1482706699365257397> Più alto!"
        : "<:thumbsdown:1471292163957457013> <a:VC_Arrow:1482706699365257397> Più basso!",
    );
}

function buildYearHintEmbed(guessBeforeTarget?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      guessBeforeTarget
        ? "<:thumbsup:1471292172145004768> <a:VC_Arrow:1482706699365257397> Dopo!"
        : "<:thumbsdown:1471292163957457013> <a:VC_Arrow:1482706699365257397> Prima!",
    );
}

function hogwartsPodiumPlaceEmoji(place?) {
  if (place === 1) return "<:VC_Podio1:1482694399283433582>";
  if (place === 2) return "<:VC_Podio2:1482694424411635712>";
  if (place === 3) return "<:VC_Podio3:1482694450806259744>";
  return "";
}

function hogwartsPodiumHouseLabel(houseId?) {
  const meta = getHouseMeta(houseId);
  return meta?.label || houseId || "casa";
}

function buildWinEmbed(winnerId?, effectiveExp?, totalExp?, details = null) {
  const podiumPlace = Number(details?.podiumPlace || 0);
  const podiumLead = podiumPlace > 0
    ? `${hogwartsPodiumPlaceEmoji(podiumPlace)} Complimenti <@${winnerId}>, **${podiumPlace}° posto** (${hogwartsPodiumHouseLabel(details?.houseId)}) — **${effectiveExp} exp**<a:VC_Exclamation:1482534702077444217>`
    : `<a:VC_Winner:1482535294757507255> Complimenti <@${winnerId}>, hai vinto e guadagnato **${effectiveExp} exp**<a:VC_Exclamation:1482534702077444217>`;
  const lines = [podiumLead];
  if (details) {
    const extras = [];
    if (details.fastBonus > 0) extras.push(`<a:VC_Flame:1482725674711126140> Risposta fulminea **+${details.fastBonus} exp**`);
    if (details.streakBonus > 0) extras.push(`<a:VC_Flame:1482725674711126140> Streak ${details.newStreak} **+${details.streakBonus} exp**`);
    if (details.housePoints > 0 && details.allHouses) {
      const petTag = details.petMultiplier > 1 ? ` (×${details.petMultiplier} ${details.petName || "animale"})` : "";
      extras.push(`<:VC_Hogwarts:1508766773837693061> Utente non smistato: **+${details.housePoints} punti** a tutte le case${petTag}`);
    } else if (details.housePoints > 0) {
      const petTag = details.petMultiplier > 1 ? ` (×${details.petMultiplier} ${details.petName || "animale"})` : "";
      extras.push(`<:VC_Hogwarts:1508766773837693061> Casa **+${details.housePoints} punti**${petTag}`);
    }
    if (extras.length) lines.push("", ...extras);
  }
  lines.push("", "<:VC_Stats:1482527532682055780> **Le tue statistiche:**", `<a:VC_Arrow:1482706699365257397> Ora hai un totale di **${totalExp} exp**`);
  if (details?.newStreak > 1) lines.push(`<a:VC_Arrow:1482706699365257397> Serie di vittorie: **${details.newStreak}** (record: **${details.bestStreak}**)`);
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle(
      podiumPlace > 0
        ? "<a:VC_Events:1482706144953897223> Posto in classifica Hogwarts<a:VC_Exclamation:1482534702077444217>"
        : "<a:VC_Events:1482706144953897223> Un utente ha vinto<a:VC_Exclamation:1482534702077444217>",
    )
    .setDescription(lines.join("\n"))
    .setFooter({
      text: 'Digita il comando "+mstats" per vedere i tuoi progressi',
    });
}

function getHighestEligibleReward(totalExp?) {
  const expValue = Number(totalExp || 0);
  let best = null;
  for (const reward of EXP_REWARDS) {
    if (expValue >= reward.exp) best = reward;
  }
  return best;
}

function getNextReward(totalExp?) {
  const expValue = Number(totalExp || 0);
  return EXP_REWARDS.find((reward?) => expValue < reward.exp) || null;
}

function buildRewardEmbed(member?, reward?, totalExp?) {
  const nextReward = getNextReward(totalExp);
  const remaining = nextReward ? Math.max(0, nextReward.exp - Number(totalExp || 0)) : 0;

  const description = [
    "<a:VC_Flower:1468685050966179841> Premio ricevuto <a:VC_Flower:1468685050966179841>",
    "",
    `<a:VC_Events:1482706144953897223> **__<@${member.id}>__**`,
    `hai ottenuto il ruolo <@&${reward.roleId}> per aver raggiunto **${reward.exp}** exp ai **Minigiochi** <a:VC_HeartsPink:1468685897389052008>`,
    "",
    nextReward
      ? `<a:VC_HeartsBlue:1468686100045369404> / ti mancano **${remaining}** exp per la prossima ricompensa!`
      : "<a:VC_HeartsBlue:1468686100045369404> / hai raggiunto la ricompensa **massima**!",
  ].join("\n");

  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setAuthor({
      name: accountUsername(member),
      iconURL: guildMemberDisplayAvatarUrlDynamic(member) || undefined,
    })
    .setDescription(description)
    .setFooter({
      text: "Gli exp guadagnati si sommano al tuo livello globale! Controlla le tue statistiche con il comando \`+mstats\`",
    });
}

async function handleExpReward(client?, member?, totalExp?) {
  if (!member?.guild) return;
  const reward = getHighestEligibleReward(totalExp);
  if (!reward) return;
  if (member.roles.cache.has(reward.roleId)) return;

  await member.roles.add(reward.roleId).catch(() => { });

  const rewardChannel = await getChannelCached(client, REWARD_CHANNEL_ID);
  if (!rewardChannel) return;
  await sendMinigameMessage(rewardChannel, {
      content: `${member}`,
      embeds: [buildRewardEmbed(member, reward, totalExp)],
    })
    .catch(() => { });
}

function buildTimeoutNumberEmbed(number?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! Il numero era **${number}**.`,
    );
}

function buildTimeoutWordEmbed(word?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! La parola era **${word}**.`,
    );
}

function buildTimeoutFlagEmbed(name?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! La bandiera era **${name}**.`,
    );
}

function buildTimeoutPlayerEmbed(name?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! Il calciatore era **${name}**.`,
    );
}

function buildTimeoutHogwartsGuessCharacterEmbed(name?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! Il personaggio era **${name}**.`,
    );
}

function buildTimeoutSongEmbed(title?, artist?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! Era **${title}** \u2014 ${artist}.`,
    );
}

function buildTimeoutFindBotEmbed() {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      "<a:VC_pixeltime:1482535344103620771> Tempo scaduto! Nessuno ha trovato il bot.",
    );
}

function buildTimeoutFindBotVoiceEmbed() {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      "<a:VC_pixeltime:1482535344103620771> Tempo scaduto! Nessuno è entrato nella vocale del bot.",
    );
}

function buildTimeoutFindScrollEmbed() {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      "<a:VC_pixeltime:1482535344103620771> Tempo scaduto! Nessuno ha trovato la pergamena.",
    );
}

function buildHogwartsMemorySequenceEmbed(sequence?, rewardExp?, displayMs?, options = null) {
  const seconds = Math.max(1, Math.round(Number(displayMs || 8000) / 1000));
  const safeSequence = String(sequence || "").trim();
  const strong = Boolean(options?.burrobirraStrong);
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Memoria <a:VC_Exclamation:1482534702077444217>")
    .setDescription([
      strong
        ? `<:VC_EXP:1482534670896730143> Indovina la sequenza corretta per **${rewardExp} exp**.`
        : `<:VC_EXP:1482534670896730143> Memorizza questa sequenza e riscrivila per ottenere **${rewardExp} exp**.`,
      "",
      `> <a:VC_pixeltime:1482535344103620771> La sequenza sparirà tra **${seconds} secondi**.`,
    ].join("\n"))
    .addFields({
      name: "Sequenza",
      value: safeSequence || "—",
      inline: false,
    });
}

function buildHogwartsMemoryRecallEmbed(durationMs?, options = null) {
  const minutes = Math.max(1, Math.round(Number(durationMs || 180000) / 60000));
  const strong = Boolean(options?.burrobirraStrong);
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Sequenza svanita <a:VC_Exclamation:1482534702077444217>")
    .setDescription([
      strong
        ? "Riscrivi in chat la sequenza **corretta** (non quella mescolata che hai visto)."
        : "Riscrivi in chat la sequenza di emoji esatta.",
      `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per riscriverla.`,
    ].join("\n"));
}

function buildTimeoutHogwartsMemoryEmbed(sequence?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! La sequenza era: **${sequence}**`,
    );
}

function buildTimeoutCapitalEmbed(country?, answer?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! La capitale di **${country}** era **${answer}**.`,
    );
}

function buildTimeoutRegionCapitalEmbed(region?, answer?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! Il capoluogo di **${region}** era **${answer}**.`,
    );
}

function buildTimeoutReverseCapitalEmbed(capital?, answer?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! **${capital}** è la capitale di **${answer}**.`,
    );
}

function buildTimeoutFastTypeEmbed(phrase?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! La frase era \`${phrase}\`.`,
    );
}

function buildTimeoutTeamEmbed(team?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! La squadra era **${team}**.`,
    );
}

function buildTimeoutSingerEmbed(name?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! Il cantante era **${name}**.`,
    );
}

function buildTimeoutAlbumEmbed(name?, artist?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! Era **${name}** di ${artist}.`,
    );
}

function buildTimeoutHangmanEmbed(word?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! La parola era **${word}**.`,
    );
}

function isHangmanFullWordMatch(guessText?, wordNorm?) {
  if (!guessText || !wordNorm) return false;
  return guessText === wordNorm || compactNoSpaces(guessText) === compactNoSpaces(wordNorm);
}

function shouldRevealHangmanSolutionOnBoard(cfg?, game?, channelId = "") {
  if (!game || game.type !== "hangman") return false;
  if (!isHogwartsPodiumWinMode(cfg, game.type, game)) return true;
  const chId = String(channelId || cfg?.channelId || "").trim();
  return isHogwartsPodiumRoundComplete(game, chId);
}

async function revealHangmanSolutionBoard(channelOrMessage?, game?, cfg = null) {
  if (!game || game.type !== "hangman") return;
  const word = String(game.word || "").trim();
  if (!word) return;
  const fullWordShown = word.split("").join(" ");
  const messageLike =
    channelOrMessage?.channel
      ? channelOrMessage
      : { channel: channelOrMessage, client: channelOrMessage?.client || null };
  if (!messageLike.channel) return;
  if (cfg && !shouldRevealHangmanSolutionOnBoard(cfg, game, messageLike.channel.id)) return;
  await updateHangmanBoardMessage(messageLike, game, fullWordShown);
}

async function updateHangmanBoardMessage(message?, game?, shownWord?) {
  const channel = message.channel;
  const gameMsg = game.gameMessageId && channel
    ? await channel.messages.fetch(game.gameMessageId).catch(() => null)
    : null;
  if (!gameMsg) return;
  const hmMax = Number(game.maxMisses || 10);
  const hmErr = Math.min(hmMax, Number(game.misses || 0));
  const hangmanSolvedAttachment = buildPromptImageAttachment(
    "Impiccato",
    [shownWord, `Errori: ${hmErr}/${hmMax}`],
    "hangman",
    `solved_${Date.now()}`, message.client, Boolean(game.burrobirraApplies));
  const hangmanSolvedEmbed = buildHangmanEmbed(
    shownWord,
    game.rewardExp,
    Math.max(1000, game.endsAt - Date.now()),
  );
  if (hangmanSolvedAttachment) {
    hangmanSolvedEmbed.setImage(`attachment://${hangmanSolvedAttachment.name}`);
  }
  await gameMsg
    .edit({
      embeds: [hangmanSolvedEmbed],
      files: hangmanSolvedAttachment ? [hangmanSolvedAttachment] : [],
    })
    .catch(() => {});
}

function buildHangmanLossEmbed(word?) {
  return new EmbedBuilder()
    .setColor("#ED4245")
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Errori esauriti! La parola era **${word}**.`,
    );
}

async function finalizeHangmanLoss(message?, client?, cfg?, game?) {
  if (!game || game._lossFinalized) return;
  game._lossFinalized = true;
  game._claiming = true;

  const channelId = String(cfg?.channelId || message?.channel?.id || "").trim();
  const channel = message?.channel || (await getChannelCached(client, channelId));
  const hmMax = Number(game.maxMisses || 10);
  const word = String(game.word || "");
  const fullWordShown = word.split("").join(" ");

  if (channel?.messages?.fetch && game.gameMessageId) {
    const gameMsg = await channel.messages.fetch(game.gameMessageId).catch(() => null);
    if (gameMsg?.edit) {
      const attachment = buildPromptImageAttachment(
        "Impiccato",
        [fullWordShown, `Errori: ${hmMax}/${hmMax}`],
        "hangman",
        `loss_${Date.now()}`,
        client,
        Boolean(game.burrobirraApplies),
      );
      const embed = buildHangmanEmbed(fullWordShown, game.rewardExp, 0);
      embed.setColor("#ED4245");
      if (attachment) embed.setImage(`attachment://${attachment.name}`);
      await gameMsg
        .edit({
          embeds: [embed],
          files: attachment ? [attachment] : [],
        })
        .catch(() => {});
    }
  }

  blockMinigameRehydrate(channelId);
  await sendMinigameTimeoutAndClose(client, cfg, channelId, channel, game, buildHangmanLossEmbed(word));
}

function buildTimeoutItalianGkEmbed(answer?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! La risposta era **${answer}**.`,
    );
}

function buildTimeoutHogwartsQuizEmbed(answer?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! La risposta del quiz era **${answer}**.`,
    );
}

function buildTimeoutHogwartsCipherEmbed(answer?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! La parola cifrata era **${answer}**.`,
    );
}

function buildTimeoutDrivingQuizEmbed(game?) {
  const isMultiple = game?.questionType === "multiple" && Array.isArray(game?.options) && Number.isFinite(game?.correctIndex);
  let text;
  if (isMultiple && game.options[game.correctIndex] != null) {
    const letter = DRIVING_QUIZ_LETTERS[game.correctIndex] ?? String(game.correctIndex + 1);
    text = `La risposta corretta era **${letter}) ${game.options[game.correctIndex]}**.`;
  } else {
    text = `La risposta corretta era **${game?.answer ? "vero" : "falso"}**.`;
  }
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! ${text}`,
    );
}

function buildTimeoutMathEmbed(answer?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! Il risultato corretto era **${answer}**.`,
    );
}

function buildTimeoutGuessYearEmbed(title?, subtitle?, year?) {
  const sub = subtitle ? ` — ${subtitle}` : "";
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! **${title}**${sub} era del **${year}**.`,
    );
}

function buildTimeoutCompleteVerseEmbed(answer?, song?, artist?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! La risposta era **${answer}** (${song} — ${artist}).`,
    );
}

function buildTimeoutGuessEmojiEmbed(emojis?, answer?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! ${emojis} era **${answer}**.`,
    );
}

function buildTimeoutQuoteFilmEmbed(quote?, answer?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! La citazione è da **${answer}**.`,
    );
}

function buildTimeoutCompleteProverbEmbed(start?, end?) {
  const full = String(end || "").trim() ? `${start} ${end}`.trim() : start;
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! Il proverbio completo: **${full}**.`,
    );
}

function buildTimeoutSynonymAntonymEmbed(word?, answer?, kind?) {
  const label = kind === "antonym" ? "Il contrario" : "Un sinonimo";
  const safeWord = word != null && String(word).trim() !== "" ? String(word) : "—";
  const safeAnswer = answer != null && String(answer).trim() !== "" ? String(answer) : "—";
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! ${label} di **${safeWord}** era **${safeAnswer}**.`,
    );
}

function buildTimeoutGuessCityEmbed(landmark?, city?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setDescription(
      `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! **${landmark}** si trova a **${city}**.`,
    );
}

function buildGuessYearEmbed(title?, subtitle?, rewardExp?, durationMs?, imageUrl = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const sub = subtitle ? ` — ${subtitle}` : "";
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Indovina l'anno <a:VC_Exclamation:1482534702077444217>")
    .setDescription([
      `<:VC_EXP:1482534670896730143> In che anno è uscito **${title}**${sub}? Scrivi l'anno per **${rewardExp} exp**.`,
      `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per rispondere!`,
      `> <a:VC_Winner:1482535294757507255> Esegui il comando \`+mstats\` per vedere le tue statistiche.`,
    ].join("\n"));
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildCompleteVerseEmbed(verse?, rewardExp?, durationMs?, imageUrl = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const promptLine = imageUrl
    ? `<:VC_EXP:1482534670896730143> Completa il verso **nell'immagine** per **${rewardExp} exp**.`
    : `<:VC_EXP:1482534670896730143> Completa: **${verse}** per **${rewardExp} exp**.`;
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Completa il verso <a:VC_Exclamation:1482534702077444217>")
    .setDescription([
      promptLine,
      `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per rispondere!`,
      `> <a:VC_Winner:1482535294757507255> Esegui il comando \`+mstats\` per vedere le tue statistiche.`,
    ].join("\n"));
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildGuessEmojiEmbed(emojis?, rewardExp?, durationMs?, imageUrl = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Indovina da emoji <a:VC_Exclamation:1482534702077444217>")
    .setDescription([
      `<:VC_EXP:1482534670896730143> Cosa rappresenta **${emojis}**? Scrivi film, serie o canzone per **${rewardExp} exp**.`,
      `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per rispondere!`,
      `> <a:VC_Winner:1482535294757507255> Esegui il comando \`+mstats\` per vedere le tue statistiche.`,
    ].join("\n"));
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildQuoteFilmEmbed(quote?, rewardExp?, durationMs?, imageUrl = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Citazione da film/serie <a:VC_Exclamation:1482534702077444217>")
    .setDescription([
      `<:VC_EXP:1482534670896730143> *"${quote}"* — Da quale film o serie? **${rewardExp} exp**.`,
      `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per rispondere!`,
      `> <a:VC_Winner:1482535294757507255> Esegui il comando \`+mstats\` per vedere le tue statistiche.`,
    ].join("\n"));
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildCompleteProverbEmbed(start?, rewardExp?, durationMs?, imageUrl = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const promptLine = imageUrl
    ? `<:VC_EXP:1482534670896730143> Completa il proverbio **nell'immagine** per **${rewardExp} exp**.`
    : `<:VC_EXP:1482534670896730143> **${start}** ... Completa il proverbio per **${rewardExp} exp**.`;
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Completa il proverbio <a:VC_Exclamation:1482534702077444217>")
    .setDescription([
      promptLine,
      `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per rispondere!`,
      `> <a:VC_Winner:1482535294757507255> Esegui il comando \`+mstats\` per vedere le tue statistiche.`,
    ].join("\n"));
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildSynonymAntonymEmbed(word?, kind?, rewardExp?, durationMs?, imageUrl = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const label = kind === "antonym" ? "il contrario" : "un sinonimo";
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle(kind === "antonym" ? "Trova il contrario <a:VC_Exclamation:1482534702077444217>" : "Trova il sinonimo <a:VC_Exclamation:1482534702077444217>")
    .setDescription([
      `<:VC_EXP:1482534670896730143> Scrivi ${label} di **${word}** per **${rewardExp} exp**.`,
      `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per rispondere!`,
      `> <a:VC_Winner:1482535294757507255> Esegui il comando \`+mstats\` per vedere le tue statistiche.`,
    ].join("\n"));
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildGuessCityEmbed(landmark?, rewardExp?, durationMs?, imageUrl = null) {
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Indovina la città <a:VC_Exclamation:1482534702077444217>")
    .setDescription([
      `<:VC_EXP:1482534670896730143> In quale città si trova **${landmark}**? **${rewardExp} exp**.`,
      `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)} per rispondere!`,
      `> <a:VC_Winner:1482535294757507255> Esegui il comando \`+mstats\` per vedere le tue statistiche.`,
    ].join("\n"));
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function getAvailableGameTypes(cfg?) {
  const types = [];
  const hogwartsOnly = Boolean(cfg?.hogwartsEventLive) && isHogwartsExclusiveMinigamesEnabled(null, cfg);
  if (hogwartsOnly) {
    if (cfg?.hogwartsQuiz !== false && getHogwartsQuizBank().length) types.push("hogwartsQuiz");
    if (cfg?.findScroll !== false && cfg?.findScroll?.unlocked) types.push("findScroll");
    if (cfg?.hogwartsMemoryEmoji !== false && cfg?.hogwartsMemoryEmoji?.unlocked && getHogwartsMemoryEmojiBank().length) types.push("hogwartsMemoryEmoji");
    if (cfg?.hogwartsCipher !== false && cfg?.hogwartsCipher?.unlocked && getHogwartsCipherBank().length) types.push("hogwartsCipher");
    if (cfg?.hogwartsObservationTower !== false && cfg?.hogwartsObservationTower?.unlocked) types.push("hogwartsObservationTower");
    appendHogwartsEventBonusGameTypes(cfg, types);
    return types;
  }
  if (shouldUseHalloweenTheme(cfg)) {
    return getHalloweenExclusiveAvailableTypes(cfg);
  }
  if (cfg?.guessNumber !== false) types.push("guessNumber");
  if (cfg?.guessWord?.apiUrl) types.push("guessWord");
  if (cfg?.guessFlag?.apiUrl) types.push("guessFlag");
  if (cfg?.guessPlayer?.apiUrl) types.push("guessPlayer");
  if (cfg?.guessSong) types.push("guessSong");
  if (cfg?.guessCapital !== false) types.push("guessCapital");
  if (cfg?.guessReverseCapital !== false && (cfg?.guessReverseCapital?.apiUrl || cfg?.guessCapital?.apiUrl)) types.push("guessReverseCapital");
  if (cfg?.guessRegionCapital !== false) types.push("guessRegionCapital");
  if (cfg?.fastType !== false) types.push("fastType");
  if (cfg?.guessTeam) types.push("guessTeam");
  if (cfg?.guessSinger) types.push("guessSinger");
  if (cfg?.guessAlbum) types.push("guessAlbum");
  if (cfg?.hangman !== false) types.push("hangman");
  if (cfg?.italianGK !== false) types.push("italianGK");
  if (cfg?.hogwartsQuiz !== false && cfg?.hogwartsQuiz?.eventLive && getHogwartsQuizBank().length) types.push("hogwartsQuiz");
  if (cfg?.drivingQuiz !== false) types.push("drivingQuiz");
  if (cfg?.mathExpression !== false) types.push("mathExpression");
  if (cfg?.findBot !== false) types.push("findBot");
  if (cfg?.findBotVoice !== false) types.push("findBotVoice");
  if (cfg?.findScroll !== false && cfg?.findScroll?.eventLive && cfg?.findScroll?.unlocked) types.push("findScroll");
  if (cfg?.memoryEmoji !== false && getMemoryEmojiBank().length) types.push("memoryEmoji");
  if (cfg?.hogwartsMemoryEmoji !== false && cfg?.hogwartsMemoryEmoji?.eventLive && cfg?.hogwartsMemoryEmoji?.unlocked && getHogwartsMemoryEmojiBank().length) types.push("hogwartsMemoryEmoji");
  if (cfg?.hogwartsCipher !== false && cfg?.hogwartsCipher?.eventLive && cfg?.hogwartsCipher?.unlocked && getHogwartsCipherBank().length) types.push("hogwartsCipher");
  if (cfg?.hogwartsObservationTower !== false && cfg?.hogwartsObservationTower?.eventLive && cfg?.hogwartsObservationTower?.unlocked) types.push("hogwartsObservationTower");
  if (cfg?.guessYear !== false) types.push("guessYear");
  if (cfg?.completeVerse !== false) types.push("completeVerse");
  if (cfg?.guessEmoji !== false) types.push("guessEmoji");
  if (cfg?.quoteFilm !== false) types.push("quoteFilm");
  if (cfg?.completeProverb !== false) types.push("completeProverb");
  if (cfg?.synonymAntonym !== false) types.push("synonymAntonym");
  if (cfg?.guessCity !== false) types.push("guessCity");
  if (cfg?.treasureHunt !== false) types.push("treasureHunt");
  return types;
}

function isHogwartsMinigameType(type?) {
  return isHogwartsThemedMinigameType(type);
}

function normalizeHogwartsHouseId(value?) {
  const fromSorted = normalizeSortedHouseId(value);
  if (fromSorted) return fromSorted;
  const house = String(value || "").trim().toLowerCase();
  return HOGWARTS_HOUSE_IDS.includes(house) ? house : "";
}

function hogwartsPodiumDistinctHouseCount(game?, channelId = "") {
  const podium = ensureHogwartsPodium(game, channelId);
  const houses = new Set(podium.map((row?) => normalizeHogwartsHouseId(row.houseId)).filter(Boolean));
  return houses.size;
}

function tryClaimMinigameChannelClose(channelId?) {
  const chId = String(channelId || "").trim();
  if (!chId) return false;
  if (channelWinClosing.has(chId)) return false;
  channelWinClosing.add(chId);
  return true;
}

async function runMinigameChannelExclusive(channelId?, task?) {
  const key = String(channelId || "_");
  const previous = minigameChannelExclusiveQueues.get(key) || Promise.resolve();
  let release = () => { };
  const gate = new Promise((resolve?) => {
    release = resolve;
  });
  minigameChannelExclusiveQueues.set(key, previous.then(() => gate));
  await previous;
  try {
    return await task();
  } finally {
    release();
    if (minigameChannelExclusiveQueues.get(key) === gate) {
      minigameChannelExclusiveQueues.delete(key);
    }
  }
}

async function runHogwartsPodiumRegisterExclusive(channelId?, task?) {
  const key = String(channelId || "_");
  const previous = hogwartsPodiumRegisterQueues.get(key) || Promise.resolve();
  let release = () => { };
  const gate = new Promise((resolve?) => {
    release = resolve;
  });
  hogwartsPodiumRegisterQueues.set(key, previous.then(() => gate));
  await previous;
  try {
    return await task();
  } finally {
    release();
    if (hogwartsPodiumRegisterQueues.get(key) === gate) {
      hogwartsPodiumRegisterQueues.delete(key);
    }
  }
}

function trackHogwartsPodiumAward(channelId?, awardPromise?) {
  const key = String(channelId || "").trim();
  if (!key) return awardPromise;
  armHogwartsPodiumAwardsShutdownFlush();
  let bucket = hogwartsPodiumPendingAwards.get(key);
  if (!bucket) {
    bucket = new Set();
    hogwartsPodiumPendingAwards.set(key, bucket);
  }
  const tracked = Promise.resolve(awardPromise).finally(() => {
    bucket.delete(tracked);
    if (bucket.size === 0) hogwartsPodiumPendingAwards.delete(key);
  });
  bucket.add(tracked);
  return tracked;
}

async function waitForHogwartsPodiumPendingAwards(channelId?) {
  const key = String(channelId || "").trim();
  const bucket = hogwartsPodiumPendingAwards.get(key);
  if (!bucket?.size) return;
  await Promise.allSettled([...bucket]);
}

function hogwartsPodiumRowsMissingAwards(game?, channelId = "") {
  const podium = ensureHogwartsPodium(game, channelId);
  return podium.filter((row?) => !row.award || typeof row.award !== "object");
}

async function awaitHogwartsPodiumAwardsReady(channelId?, game?, maxMs = 10_000) {
  const chId = String(channelId || "").trim();
  if (!chId || !game) return game;
  const deadline = Date.now() + Math.max(1000, Number(maxMs) || 10_000);
  while (Date.now() < deadline) {
    await waitForHogwartsPodiumPendingAwards(chId);
    if (!hogwartsPodiumRowsMissingAwards(game, chId).length) return game;
    await new Promise((resolve?) => setTimeout(resolve, 25));
  }
  return game;
}

function getHogwartsHousePointReward(cfg?, gameType?, game = null) {
  const houseChannelPts = Math.floor(Number(game?.hogwartsHouseChannel?.housePoints) || 0);
  if (houseChannelPts > 0) return houseChannelPts;
  const typeCfg = cfg?.[gameType] && typeof cfg[gameType] === "object" ? cfg[gameType] : {};
  const raw = typeCfg.housePoints ?? cfg?.hogwartsHousePointsPerWin ?? HOGWARTS_HOUSE_POINTS_DEFAULT_REWARD;
  return applyHogwartsBonusHousePointMultiplier(cfg, gameType, Math.max(0, Math.floor(Number(raw) || 0)));
}

function getHogwartsUnsortedHousePointReward(cfg?, gameType?) {
  const typeCfg = cfg?.[gameType] && typeof cfg[gameType] === "object" ? cfg[gameType] : {};
  const raw = typeCfg.unsortedHousePoints ?? cfg?.hogwartsUnsortedHousePointsPerWin ?? HOGWARTS_UNSORTED_HOUSE_POINTS_DEFAULT_REWARD;
  return Math.max(0, Math.floor(Number(raw) || 0));
}

function hogwartsHousePointsDedupeKey(client?) {
  const eventCfg = resolveHogwartsEventConfig(client);
  return String(eventCfg?.eventKey || "").trim() || "hogwarts";
}

function getHogwartsHousePointPeriodKey(nowMs = Date.now()) {
  return String(resolveHogwartsHousePointPeriod(nowMs)?.key || "").trim();
}

async function resolveHogwartsSortedHouse(guildId?, userId?, eventKey?, options: Record<string, any> = {}) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!isValidGuildUserId(gid, uid)) return "";
  const doc = await findSortingDoc(gid, uid, eventKey).catch((err?) => {
    warnMinigame(err);
    return null;
  });
  const fromDoc = resolveSortedHouseId(doc);
  if (fromDoc) return fromDoc;
  const client = options.client;
  let cfg = options.cfg;
  if (!cfg && client) cfg = resolveHogwartsEventConfig(client);
  const member = options.member;
  if (member && cfg) {
    const fromRole = resolveHouseIdFromMemberRoles(member, cfg);
    if (fromRole) return fromRole;
  }
  if (!client || !cfg) return "";
  const guild = client.guilds?.cache?.get(gid);
  if (!guild) return "";
  const resolvedMember =
    member ||
    guild.members.cache.get(uid) ||
    (await guild.members.fetch(uid).catch(() => null));
  if (!resolvedMember) return "";
  return resolveHouseIdFromMemberRoles(resolvedMember, cfg) || "";
}

async function rejectIfBasiliskBlockedMessage(message?, game?) {
  if (!game?.basilisk || !message?.guild) return false;
  const { isBasiliskBlockedForUser } = require("../Community/hogwartsBasiliskService") as typeof import("../Community/hogwartsBasiliskService");
  const blocked = await isBasiliskBlockedForUser(message.client, message.guild.id, message.author.id, game);
  if (!blocked) return false;
  await message.react(BASILISK_BLOCK_EMOJI).catch(() => message.react(MINIGAME_WRONG_EMOJI).catch(() => { }));
  return true;
}

async function rejectIfHogwartsEventBlacklistedMessage(message?) {
  if (!message?.author?.id) return false;
  const { isUserHighStaffExcludedFromHogwartsEvent } = require("../../Utils/Web/hogwartsEventParticipation") as typeof import("../../Utils/Web/hogwartsEventParticipation");
  const blocked = await isUserHighStaffExcludedFromHogwartsEvent(
    message.client,
    message.author.id,
    message.member,
  );
  if (!blocked) return false;
  await message.react(MINIGAME_WRONG_EMOJI).catch(() => { });
  return true;
}

async function rejectIfBasiliskBlockedInteraction(interaction?, game?) {
  if (!game?.basilisk || !interaction?.guild) return false;
  const { isBasiliskBlockedForUser } = require("../Community/hogwartsBasiliskService") as typeof import("../Community/hogwartsBasiliskService");
  const blocked = await isBasiliskBlockedForUser(interaction.client, interaction.guild.id, interaction.user.id, game);
  if (!blocked) return false;
  await interaction
    .reply({
      content: `${BASILISK_BLOCK_EMOJI} Sei pietrificato dal Basilisco e non puoi partecipare a questo minigioco.`,
      flags: 1 << 6,
    })
    .catch(() => { });
  return true;
}

async function rejectIfHogwartsEventBlacklistedInteraction(interaction?) {
  if (!interaction?.user?.id) return false;
  const {
    isUserHighStaffExcludedFromHogwartsEvent,
    HOGWARTS_BLACKLISTED_MESSAGE,
  } = require("../../Utils/Web/hogwartsEventParticipation") as typeof import("../../Utils/Web/hogwartsEventParticipation");
  const blocked = await isUserHighStaffExcludedFromHogwartsEvent(
    interaction.client,
    interaction.user.id,
    interaction.member,
  );
  if (!blocked) return false;
  await interaction
    .reply({
      content: HOGWARTS_BLACKLISTED_MESSAGE || "Sei escluso dall'evento Hogwarts e non puoi partecipare.",
      flags: 1 << 6,
    })
    .catch(() => { });
  return true;
}

function resolveHouseChannelRequiredHouseId(game?) {
  const meta = game?.hogwartsHouseChannel;
  if (!meta || typeof meta !== "object") return "";
  return normalizeHogwartsHouseId(meta.houseId || meta.soloHouseId || game?.soloHouseId);
}

async function isWrongHouseChannelMember(client?, guildId?, userId?, game?, member = null) {
  const requiredHouseId = resolveHouseChannelRequiredHouseId(game);
  if (!requiredHouseId) return false;
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return true;
  const houseId = await resolveHogwartsSortedHouse(gid, uid, hogwartsHousePointsDedupeKey(client), {
    client,
    member,
  });
  return !houseId || houseId !== requiredHouseId;
}

async function rejectIfWrongHouseChannelMemberMessage(message?, game?) {
  if (!message?.guild) return false;
  const member =
    message.member ||
    (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!(await isWrongHouseChannelMember(message.client, message.guild.id, message.author?.id, game, member))) {
    return false;
  }
  const cfg = getConfig(message.client);
  if (
    await shouldSuppressUnsortedWrongReaction(
      message.client,
      cfg,
      game,
      message.guild.id,
      message.author?.id,
      message.channel?.id || message.channelId,
      member,
    )
  ) {
    return true;
  }
  await reactMinigameWrongEmoji(message, game);
  return true;
}

async function rejectIfWrongHouseChannelMemberInteraction(interaction?, game?) {
  if (!interaction?.guild) return false;
  if (!(await isWrongHouseChannelMember(interaction.client, interaction.guild.id, interaction.user?.id, game))) return false;
  await interaction
    .reply({
      content: "<:cancel:1461730653677551691> Questo minigioco è riservato ai membri della sala comune di questa chat.",
      flags: 1 << 6,
    })
    .catch(() => { });
  return true;
}

async function awardHogwartsHousePointsForWinner(client?, guildId?, userId?, gameType?, amount?, unsortedAmount = 0) {
  const cfg = getConfig(client);
  const basePoints = Math.max(0, Math.floor(Number(amount) || 0));
  const baseFallback = Math.max(0, Math.floor(Number(unsortedAmount) || 0));
  if (!isHogwartsHousePointsMinigameType(gameType, cfg) || (basePoints <= 0 && baseFallback <= 0) || !isHogwartsEventLiveForMinigames(client)) return null;
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!isValidGuildUserId(gid, uid)) return null;
  const { isUserHighStaffExcludedFromHogwartsEvent } = require("../../Utils/Web/hogwartsEventParticipation") as typeof import("../../Utils/Web/hogwartsEventParticipation");
  if (await isUserHighStaffExcludedFromHogwartsEvent(client, uid, null)) return null;
  const eventKey = hogwartsHousePointsDedupeKey(client);
  const houseId = await resolveHogwartsSortedHouse(gid, uid, eventKey, { client });
  const allHouses = !houseId;
  const petBoostBase = allHouses ? baseFallback : basePoints;
  const { applyPetHousePointsBoost } = require("../Community/hogwartsShopBoostsService") as typeof import("../Community/hogwartsShopBoostsService");
  const petBoost = await applyPetHousePointsBoost(client, gid, uid, petBoostBase);
  const points = allHouses ? 0 : petBoost.points;
  const fallbackPoints = allHouses ? petBoost.points : 0;
  const petMultiplier = petBoost.multiplier;
  if (!houseId && fallbackPoints <= 0) return null;
  const now = new Date();
  const gamePath = `rawWebhook.byGame.${String(gameType || "").trim()}`;
  const periodKey = getHogwartsHousePointPeriodKey(now.getTime());
  const inc = {
    [gamePath]: allHouses ? fallbackPoints * HOGWARTS_HOUSE_IDS.length : points,
    "rawWebhook.total": allHouses ? fallbackPoints * HOGWARTS_HOUSE_IDS.length : points,
  };
  if (allHouses) {
    for (const id of HOGWARTS_HOUSE_IDS) {
      inc[`rawWebhook.totals.${id}`] = fallbackPoints;
      if (periodKey) inc[`rawWebhook.byPeriod.${periodKey}.${id}`] = fallbackPoints;
    }
  } else {
    inc[`rawWebhook.totals.${houseId}`] = points;
    if (periodKey) inc[`rawWebhook.byPeriod.${periodKey}.${houseId}`] = points;
    const { appendMemberHousePointsInc } = require("../Community/hogwartsMemberHousePointsService") as typeof import("../Community/hogwartsMemberHousePointsService");
    const memberSet: Record<string, any> = {};
    appendMemberHousePointsInc(inc, memberSet, { userId: uid, houseId, periodKey, points });
    await SiteDocument.findOneAndUpdate(
      {
        docType: SITE_DOCUMENT_TYPE.HOGWARTS_HOUSE_POINTS,
        guildId: gid,
        userId: HOGWARTS_HOUSE_POINTS_DOC_OWNER_ID,
        dedupeKey: eventKey,
      },
      {
        $setOnInsert: {
          docType: SITE_DOCUMENT_TYPE.HOGWARTS_HOUSE_POINTS,
          guildId: gid,
          userId: HOGWARTS_HOUSE_POINTS_DOC_OWNER_ID,
          dedupeKey: eventKey,
          createdBy: "minigames",
          status: "active",
        },
        $set: {
          planKey: "hogwarts_house_points",
          "rawWebhook.eventKey": eventKey,
          "rawWebhook.updatedAt": now,
          ...memberSet,
        },
        $inc: inc,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).catch((err?) => warnMinigame(err));
    const { recordHogwartsMinigameHousePointWin } = require("../Community/hogwartsShopBoostsService") as typeof import("../Community/hogwartsShopBoostsService");
    recordHogwartsMinigameHousePointWin(gid, uid, eventKey).catch(() => null);
    return {
      houseId,
      points,
      allHouses,
      petMultiplier: petMultiplier > 1 ? petMultiplier : 0,
      petName: petBoost.petName || "",
    };
  }
  await SiteDocument.findOneAndUpdate(
    {
      docType: SITE_DOCUMENT_TYPE.HOGWARTS_HOUSE_POINTS,
      guildId: gid,
      userId: HOGWARTS_HOUSE_POINTS_DOC_OWNER_ID,
      dedupeKey: eventKey,
    },
    {
      $setOnInsert: {
        docType: SITE_DOCUMENT_TYPE.HOGWARTS_HOUSE_POINTS,
        guildId: gid,
        userId: HOGWARTS_HOUSE_POINTS_DOC_OWNER_ID,
        dedupeKey: eventKey,
        createdBy: "minigames",
        status: "active",
      },
      $set: {
        planKey: "hogwarts_house_points",
        "rawWebhook.eventKey": eventKey,
        "rawWebhook.updatedAt": now,
      },
      $inc: inc,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch((err?) => warnMinigame(err));
  const { recordHogwartsMinigameHousePointWin } = require("../Community/hogwartsShopBoostsService") as typeof import("../Community/hogwartsShopBoostsService");
  recordHogwartsMinigameHousePointWin(gid, uid, eventKey).catch(() => null);
  return {
    houseId,
    points: allHouses ? fallbackPoints : points,
    allHouses,
    petMultiplier: petMultiplier > 1 ? petMultiplier : 0,
    petName: petBoost.petName || "",
  };
}

async function awardHogwartsHousePointsToHouse(client?, guildId?, houseId?, gameType?, amount?, opts: Record<string, any> = {}) {
  const cfg = getConfig(client);
  const basePoints = Math.max(0, Math.floor(Number(amount) || 0));
  const hid = normalizeHogwartsHouseId(houseId);
  if (!isHogwartsHousePointsMinigameType(gameType, cfg) || basePoints <= 0 || !hid || !isHogwartsEventLiveForMinigames(client)) return null;
  const gid = String(guildId || "").trim();
  if (!gid) return null;
  let points = basePoints;
  let consumableMultiplier = 1;
  let consumableLabels = [];
  if (opts.skipConsumableBoost !== true) {
    try {
      const { resolveHousePointsConsumableMultiplier } = require("../Community/hogwartsConsumableBoostsService") as typeof import("../Community/hogwartsConsumableBoostsService");
      const participantIds = Array.isArray(opts.participantUserIds)
        ? opts.participantUserIds.map((id?) => String(id || "").trim()).filter(Boolean)
        : [];
      const beneficiaryId = String(opts.userId || "").trim();
      let consumable = { multiplier: 1, labels: [] };
      if (participantIds.length > 0) {
                for (const uid of participantIds) {
          const row = await resolveHousePointsConsumableMultiplier(client, gid, uid, hid);
          const mult = Math.max(1, Number(row?.multiplier) || 1);
          if (mult > (Number(consumable.multiplier) || 1)) consumable = row;
        }
      } else {
                consumable = await resolveHousePointsConsumableMultiplier(client, gid, beneficiaryId, hid);
      }
      consumableMultiplier = Math.max(1, Number(consumable?.multiplier) || 1);
      consumableLabels = Array.isArray(consumable?.labels) ? consumable.labels : [];
      if (consumableMultiplier > 1) points = Math.max(0, Math.floor(basePoints * consumableMultiplier));
    } catch (err) {
      warnMinigame(err);
    }
  }
  const eventKey = hogwartsHousePointsDedupeKey(client);
  const now = new Date();
  const gamePath = `rawWebhook.byGame.${String(gameType || "").trim()}`;
  const periodKey = getHogwartsHousePointPeriodKey(now.getTime());
  const inc = {
    [gamePath]: points,
    "rawWebhook.total": points,
    [`rawWebhook.totals.${hid}`]: points,
  };
  if (periodKey) inc[`rawWebhook.byPeriod.${periodKey}.${hid}`] = points;
  const updated = await SiteDocument.findOneAndUpdate(
    {
      docType: SITE_DOCUMENT_TYPE.HOGWARTS_HOUSE_POINTS,
      guildId: gid,
      userId: HOGWARTS_HOUSE_POINTS_DOC_OWNER_ID,
      dedupeKey: eventKey,
    },
    {
      $setOnInsert: {
        docType: SITE_DOCUMENT_TYPE.HOGWARTS_HOUSE_POINTS,
        guildId: gid,
        userId: HOGWARTS_HOUSE_POINTS_DOC_OWNER_ID,
        dedupeKey: eventKey,
        createdBy: "minigames",
        status: "active",
      },
      $set: {
        planKey: "hogwarts_house_points",
        "rawWebhook.eventKey": eventKey,
        "rawWebhook.updatedAt": now,
      },
      $inc: inc,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch((err?) => {
    warnMinigame(err);
    return null;
  });
  if (!updated) return null;
  return {
    houseId: hid,
    points,
    basePoints,
    consumableMultiplier: consumableMultiplier > 1 ? consumableMultiplier : 1,
    consumableLabels,
    allHouses: false,
  };
}

function attachHogwartsHouseChannelMeta(game?, cfg?) {
  const meta = cfg?.hogwartsHouseChannelMeta;
  if (!game || !meta || typeof meta !== "object") return game;
  game.hogwartsHouseChannel = { ...meta };
  if (meta.soloHouseId) game.soloHouseId = String(meta.soloHouseId);
  return game;
}

function isHogwartsPodiumWinMode(cfg?, gameType?, game = null) {
  if (game?.finaleChaos || cfg?.finaleChaos) return false;
  if (game?.hogwartsHouseChannel?.singleWinner || cfg?.hogwartsHouseChannelMeta?.singleWinner) return false;
  if (!cfg?.hogwartsEventLive) return false;
  const type = String(gameType || "").trim();
  if (!type || type === "hogwartsObservationTower") return false;
  return isHogwartsHousePointsMinigameType(type, cfg);
}

function getHogwartsPodiumPlaceHousePoints(cfg?, gameType?, place?) {
  const isBonus = isHogwartsBonusMinigameType(gameType, cfg);
  const table = isBonus ? HOGWARTS_PODIUM_BONUS_HALF_BASE_POINTS : HOGWARTS_PODIUM_HOUSE_POINTS;
  const base = table[place] ?? 0;
  return applyHogwartsBonusHousePointMultiplier(cfg, gameType, Math.max(0, Math.floor(Number(base) || 0)));
}

function resolveMinigameChannelId(game?, channelId = "") {
  return String(channelId || game?.channelId || "").trim();
}

function ensureHogwartsPodium(game?, channelId = "") {
  const chId = resolveMinigameChannelId(game, channelId);
  const cached = chId ? hogwartsPodiumByChannel.get(chId) : null;
  if (Array.isArray(cached) && cached.length) {
    if (!Array.isArray(game?.hogwartsPodium) || !game.hogwartsPodium.length) {
      game.hogwartsPodium = cached.slice();
    }
    return game.hogwartsPodium;
  }
  if (!Array.isArray(game?.hogwartsPodium)) game.hogwartsPodium = [];
  return game.hogwartsPodium;
}

function hogwartsPodiumHasHouse(game?, houseId?, channelId = "") {
  const hid = normalizeHogwartsHouseId(houseId);
  if (!hid) return false;
  return ensureHogwartsPodium(game, channelId).some((row?) => normalizeHogwartsHouseId(row.houseId) === hid);
}

function hogwartsPodiumHouseEntry(game?, houseId?, channelId = "") {
  const hid = normalizeHogwartsHouseId(houseId);
  if (!hid) return null;
  return ensureHogwartsPodium(game, channelId).find((row?) => normalizeHogwartsHouseId(row.houseId) === hid) || null;
}

function hogwartsPodiumHasUser(game?, userId?, channelId = "") {
  const uid = String(userId || "").trim();
  if (!uid) return false;
  return ensureHogwartsPodium(game, channelId).some((row?) => String(row.userId || "") === uid);
}

async function isHogwartsPodiumSilentParticipant(client?, cfg?, game?, guildId?, userId?, channelId = "", member = null) {
  if (!isHogwartsPodiumWinMode(cfg, game?.type, game)) return false;
  const uid = String(userId || "").trim();
  if (!uid) return false;
  if (hogwartsRoundUserAlreadyRewarded(game, uid, channelId)) return true;
  const houseId = await resolveHogwartsSortedHouse(guildId, uid, hogwartsHousePointsDedupeKey(client), {
    client,
    member,
  });
  if (houseId && hogwartsPodiumHasHouse(game, houseId, channelId)) return true;
  if (!houseId && !isHogwartsPodiumEmpty(game, channelId)) return true;
  return false;
}

function ensureHogwartsUnsortedWinners(game?, channelId = "") {
  if (Array.isArray(game?.hogwartsUnsortedWinners) && game.hogwartsUnsortedWinners.length) return game.hogwartsUnsortedWinners;
  const cached = hogwartsUnsortedWinnersByChannel.get(String(channelId || "").trim());
  if (Array.isArray(cached) && cached.length) {
    game.hogwartsUnsortedWinners = cached.slice();
    return game.hogwartsUnsortedWinners;
  }
  game.hogwartsUnsortedWinners = [];
  return game.hogwartsUnsortedWinners;
}

function hogwartsRoundUserAlreadyRewarded(game?, userId?, channelId = "") {
  const uid = String(userId || "").trim();
  if (!uid) return false;
  if (hogwartsPodiumHasUser(game, uid, channelId)) return true;
  return ensureHogwartsUnsortedWinners(game, channelId).includes(uid);
}

function markHogwartsUnsortedRoundWinner(game?, userId?, channelId = "") {
  const uid = String(userId || "").trim();
  const id = String(channelId || "").trim();
  if (!uid) return;
  const winners = ensureHogwartsUnsortedWinners(game, id);
  if (!winners.includes(uid)) winners.push(uid);
  if (id) hogwartsUnsortedWinnersByChannel.set(id, winners.slice());
}

function parseHogwartsPodiumState(value?) {
  if (!value) return [];
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row?, idx?) => ({
        userId: String(row?.userId || "").trim(),
        houseId: normalizeHogwartsHouseId(row?.houseId),
        place: Number.isFinite(Number(row?.place)) ? Number(row.place) : idx,
        at: Number(row?.at || 0) || 0,
        award: row?.award && typeof row.award === "object" ? row.award : null,
      }))
      .filter((row?) => row.userId && row.houseId);
  } catch (_) {
    return [];
  }
}

function parseHogwartsUnsortedWinnersState(value?) {
  if (!value) return [];
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((id?) => String(id || "").trim()).filter(Boolean);
  } catch (_) {
    return [];
  }
}

function restoreHogwartsPodiumFromState(channelId?, state?, game = null) {
  const chId = String(channelId || "").trim();
  const restoredPodium = parseHogwartsPodiumState(state?.hogwartsPodium);
  const restoredUnsorted = parseHogwartsUnsortedWinnersState(state?.hogwartsUnsortedWinners);
  if (restoredPodium.length) hogwartsPodiumByChannel.set(chId, restoredPodium.slice());
  if (restoredUnsorted.length) hogwartsUnsortedWinnersByChannel.set(chId, restoredUnsorted.slice());
  if (game) {
    if (restoredPodium.length) game.hogwartsPodium = restoredPodium.slice();
    if (restoredUnsorted.length) game.hogwartsUnsortedWinners = restoredUnsorted.slice();
  }
  return { restoredPodium, restoredUnsorted };
}

async function persistHogwartsPodium(client?, cfg?, game?) {
  const channelId = String(cfg?.channelId || "").trim();
  if (!channelId) return;
  if (Array.isArray(game?.hogwartsPodium)) hogwartsPodiumByChannel.set(channelId, game.hogwartsPodium.slice());
  let guildId = String(cfg?.guildId || "").trim();
  if (!guildId) {
    const channel = await getChannelCached(client, channelId);
    guildId = String(channel?.guild?.id || "").trim();
  }
  if (!guildId) return;
  const patch: Record<string, any> = {};
  if (Array.isArray(game?.hogwartsPodium)) patch.hogwartsPodium = JSON.stringify(game.hogwartsPodium);
  if (Array.isArray(game?.hogwartsUnsortedWinners)) patch.hogwartsUnsortedWinners = JSON.stringify(game.hogwartsUnsortedWinners);
  if (!Object.keys(patch).length) return;
  await minigameStateFindOneAndUpdate(
    { guildId, channelId },
    { $set: patch },
  ).catch(() => { });
}

function isHogwartsPodiumEmpty(game?, channelId = "") {
  return ensureHogwartsPodium(game, channelId).length === 0;
}

async function shouldSuppressUnsortedWrongReaction(client?, cfg?, game?, guildId?, userId?, channelId = "", member = null) {
  if (!game || !isHogwartsPodiumWinMode(cfg, game?.type, game)) return false;
  const chId = String(channelId || cfg?.channelId || "").trim();
  if (isHogwartsPodiumEmpty(game, chId)) return false;
  const uid = String(userId || "").trim();
  const gid = String(guildId || "").trim();
  if (!uid || !gid) return false;
  const houseId = await resolveHogwartsSortedHouse(gid, uid, hogwartsHousePointsDedupeKey(client), {
    client,
    member,
  });
  return !houseId;
}

async function reactMinigameWrongEmoji(message?, game = null) {
  if (message && game?.type) {
    const client = message.client;
    const cfg = getConfig(client);
    const member =
      message.member ||
      (message.guild ? await getGuildMemberCached(message.guild, message.author.id).catch(() => null) : null);
    if (await shouldSuppressUnsortedWrongReaction(
      client,
      cfg,
      game,
      message.guild?.id,
      message.author?.id,
      message.channel?.id || message.channelId,
      member,
    )) {
      return;
    }
  }
  await message.react(MINIGAME_WRONG_EMOJI).catch(() => {});
}

function buildHogwartsUnsortedFirstCloseEmbed(cfg?, gameType?, userId?, award?) {
  const effectiveExp = Number(award?.effectiveExp || 0);
  const nextTotal = Number(award?.nextTotal || 0);
  const details = award?.details && typeof award.details === "object" ? award.details : null;
  const housePts = Number(details?.housePoints || 0) || getHogwartsUnsortedHousePointReward(cfg, gameType);
  const lines = [
    `<a:VC_Winner:1482535294757507255> <@${userId}> ha risposto per primo senza essere smistato<a:VC_Exclamation:1482534702077444217>`,
    "",
    "<a:VC_Arrow:1482706699365257397> Round chiuso immediatamente.",
  ];
  if (effectiveExp > 0) lines.push(`<a:VC_Arrow:1482706699365257397> **${effectiveExp} exp** guadagnate`);
  if (housePts > 0) {
    const petTag = details?.petMultiplier > 1 ? ` (×${details.petMultiplier} ${details.petName || "animale"})` : "";
    lines.push(`<:VC_Hogwarts:1508766773837693061> **+${housePts} punti** a tutte le case${petTag}`);
  }
  if (nextTotal > 0) lines.push(`<:VC_Stats:1482527532682055780> Totale minigame: **${nextTotal} exp**`);
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("<a:VC_Events:1482706144953897223> Minigame Hogwarts concluso<a:VC_Exclamation:1482534702077444217>")
    .setDescription(lines.join("\n"));
}

async function awardHogwartsPodiumUnsortedWin(ctx?) {
  const { client, guild, userId, cfg, game, channelId } = ctx;
  markHogwartsUnsortedRoundWinner(game, userId, cfg?.channelId || channelId);
  const award = await awardMinigameWinToUser({
    client,
    guild,
    userId,
    cfg,
    game,
    rewardExp: game.rewardExp,
    housePointAmount: 0,
    channelId,
  });
  if (award.member) {
    await handleExpReward(client, award.member, award.nextTotal);
  }
  return award;
}

async function handleHogwartsPodiumUnsortedWin(ctx?) {
  const { client, guild, userId, cfg, game, channelId, onReact, beforeClose, closeChannel } = ctx;
  const chId = String(cfg?.channelId || channelId || "").trim();
  const clearCfg = { ...cfg, guildId: guild.id };
  if (!isHogwartsPodiumEmpty(game, chId)) return { award: null, closed: false, rejected: true };
  if (typeof onReact === "function") await onReact().catch(() => { });
  const award = await awardHogwartsPodiumUnsortedWin({ client, guild, userId, cfg, game, channelId });
  if (!isHogwartsPodiumEmpty(game, chId)) {
    activeGames.set(chId, game);
    await persistHogwartsPodium(client, clearCfg, game);
    return { award, closed: false };
  }
  const channel = closeChannel || (await getChannelCached(client, cfg.channelId));
  if (typeof beforeClose === "function") await beforeClose().catch(() => { });
  await finishMinigameRoundClose(client, clearCfg, game, {
    channel,
    podiumSummaryEmbed: buildHogwartsUnsortedFirstCloseEmbed(cfg, game?.type, userId, award),
  });
  return { award, closed: true };
}

function clearHogwartsPodiumChannel(channelId?) {
  const id = String(channelId || "").trim();
  if (!id) return;
  hogwartsPodiumByChannel.delete(id);
  hogwartsUnsortedWinnersByChannel.delete(id);
  hogwartsPodiumPendingAwards.delete(id);
}

function isHogwartsPodiumRoundComplete(game?, channelId = "") {
  if (!game) return false;
  return hogwartsPodiumDistinctHouseCount(game, channelId) >= HOGWARTS_PODIUM_SIZE;
}

async function closeHogwartsPodiumRoundIfComplete(client?, cfg?, game?, channelId?, channel = null, options: Record<string, any> = {}) {
  const chId = String(channelId || cfg?.channelId || "").trim();
  if (!game || !chId) return false;
  if (!isHogwartsPodiumWinMode(cfg, game.type, game)) return false;
  if (!isHogwartsPodiumRoundComplete(game, chId)) return false;
  if (game._podiumClosing || channelWinClosing.has(chId)) return true;
  const live = activeGames.get(chId);
  if (live && live !== game) {
    ensureHogwartsPodium(live, chId);
    game = live;
  }
  markMinigameRoundClosed(game);
  game._podiumClosing = true;
  game._claiming = true;
  blockMinigameRehydrate(chId);
  clearMinigameRoundTimers(game);
  clearNoParticipationDelay(chId);
  const clearCfg = { ...cfg, channelId: chId };
  let guildId = String(clearCfg.guildId || "").trim();
  const targetChannel = channel || (await getChannelCached(client, chId));
  if (!guildId) {
    guildId = String(targetChannel?.guild?.id || "").trim();
    if (guildId) clearCfg.guildId = guildId;
  }
  if (typeof options.beforeClose === "function") {
    await options.beforeClose().catch(() => { });
  }
  await waitForHogwartsPodiumPendingAwards(chId);
  await awaitHogwartsPodiumAwardsReady(chId, game);
  const refreshed = activeGames.get(chId);
  if (refreshed && refreshed !== game) {
    ensureHogwartsPodium(refreshed, chId);
    game = refreshed;
  }
  if (game.type === "treasureHunt" && targetChannel) {
    await cleanupTreasureHuntReactions(targetChannel, game).catch(() => { });
  }
  if (game.type === "hangman" && targetChannel) {
    await revealHangmanSolutionBoard(targetChannel, game).catch(() => { });
  }
  const podiumSummaryEmbed = buildHogwartsPodiumSummaryEmbed(
    cfg,
    game.type,
    ensureHogwartsPodium(game, chId),
    options.embedOptions || {},
  );
  const closed = await finishMinigameRoundClose(client, clearCfg, game, {
    channel: targetChannel,
    podiumSummaryEmbed,
  });
  if (!closed && activeGames.has(chId)) {
    game._podiumClosing = false;
    game._claiming = false;
    return false;
  }
  return true;
}

async function tryRegisterHogwartsPodiumEntry(client?, game?, guildId?, userId?, channelId = "") {
  const chId = String(channelId || "").trim();
  return runHogwartsPodiumRegisterExclusive(chId, async () => {
    const uid = String(userId || "").trim();
    const gid = String(guildId || "").trim();
    if (!isValidGuildUserId(gid, uid)) return { ok: false, code: "invalid_ids" };
    if (hogwartsRoundUserAlreadyRewarded(game, uid, chId)) {
      return { ok: false, code: "user_already_won", houseId: "" };
    }
    const houseId = normalizeHogwartsHouseId(
      await resolveHogwartsSortedHouse(gid, uid, hogwartsHousePointsDedupeKey(client), { client }),
    );
    if (!houseId) return { ok: false, code: "not_sorted" };
    if (hogwartsPodiumHasHouse(game, houseId, chId)) return { ok: false, code: "house_already_won", houseId };
    {
      const { isUserHighStaffExcludedFromHogwartsEvent } = require("../../Utils/Web/hogwartsEventParticipation") as typeof import("../../Utils/Web/hogwartsEventParticipation");
      if (await isUserHighStaffExcludedFromHogwartsEvent(client, uid, null)) {
        return { ok: false, code: "hogwarts_blacklisted" };
      }
    }
    if (game?.basilisk) {
      const { isBasiliskBlockedForUser } = require("../Community/hogwartsBasiliskService") as typeof import("../Community/hogwartsBasiliskService");
      if (await isBasiliskBlockedForUser(client, gid, uid, game)) return { ok: false, code: "basilisk_blocked" };
    }
    const podium = ensureHogwartsPodium(game, chId);
    if (podium.length >= HOGWARTS_PODIUM_SIZE) return { ok: false, code: "podium_full" };
    const place = podium.length;
    const entry = { userId: uid, houseId, place, at: Date.now() };
    podium.push(entry);
    if (chId) hogwartsPodiumByChannel.set(chId, podium.slice());
    return { ok: true, entry, complete: isHogwartsPodiumRoundComplete(game, chId) };
  });
}

function formatHogwartsPodiumWinnerLine(cfg?, gameType?, row?) {
  const place = Number(row.place || 0) + 1;
  const basePts = getHogwartsPodiumPlaceHousePoints(cfg, gameType, row.place);
  const award = row.award && typeof row.award === "object" ? row.award : null;
  const effectiveExp = Number(award?.effectiveExp || 0);
  const nextTotal = Number(award?.nextTotal || 0);
  const details = award?.details && typeof award.details === "object" ? award.details : null;
  const housePts = Number(details?.housePoints || 0) || basePts;
  const chunks = [
    `${hogwartsPodiumPlaceEmoji(place)} <@${row.userId}> — **${hogwartsPodiumHouseLabel(row.houseId)}**`,
    effectiveExp > 0 ? `**${effectiveExp} exp**` : "",
    housePts > 0 ? `**+${housePts}** punti casa` : "",
  ].filter(Boolean);
  const lines = [chunks.join(" · ")];
  const extras = [];
  if (details?.fastBonus > 0) extras.push(`<a:VC_Flame:1482725674711126140> Risposta fulminea **+${details.fastBonus} exp**`);
  if (details?.streakBonus > 0) extras.push(`<a:VC_Flame:1482725674711126140> Streak ${details.newStreak} **+${details.streakBonus} exp**`);
  if (details?.petMultiplier > 1) extras.push(`×${details.petMultiplier} ${details.petName || "animale"}`);
  if (extras.length) lines.push(`> ${extras.join(" · ")}`);
  if (nextTotal > 0) lines.push(`> <:VC_Stats:1482527532682055780> Totale minigame: **${nextTotal} exp**`);
  return lines.join("\n");
}

function buildHogwartsPodiumSummaryEmbed(cfg?, gameType?, podium?, options: Record<string, any> = {}) {
  const timedOut = Boolean(options.timedOut);
  const count = podium.length;
  const distinctHouses = hogwartsPodiumDistinctHouseCount({ hogwartsPodium: podium });
  const lines = podium.map((row?) => formatHogwartsPodiumWinnerLine(cfg, gameType, row));
  const footer = timedOut
    ? (distinctHouses >= HOGWARTS_PODIUM_SIZE
      ? "<a:VC_Arrow:1482706699365257397> Tempo scaduto con podio completo."
      : `<a:VC_Arrow:1482706699365257397> Tempo scaduto con **${distinctHouses}** ${distinctHouses === 1 ? "casa" : "case"} in classifica.`)
    : (distinctHouses >= HOGWARTS_PODIUM_SIZE
      ? "<a:VC_Arrow:1482706699365257397> Tre case diverse hanno risposto per prime: round chiuso."
      : `<a:VC_Arrow:1482706699365257397> **${count}** ${count === 1 ? "risposta" : "risposte"} in classifica: round chiuso.`);
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle(
      distinctHouses >= HOGWARTS_PODIUM_SIZE
        ? "<a:VC_Events:1482706144953897223> Podio Minigame"
        : "<a:VC_Events:1482706144953897223> Classifica Minigame",
    )
    .setDescription(lines.join("\n\n") + (lines.length ? `\n\n${footer}` : footer));
}

function storeHogwartsPodiumEntryAward(game?, userId?, award?, channelId = "") {
  const uid = String(userId || "").trim();
  if (!uid || !award) return;
  const chId = String(channelId || "").trim();
  const row = ensureHogwartsPodium(game, chId).find((entry?) => entry.userId === uid);
  if (!row) return;
  row.award = {
    effectiveExp: Number(award.effectiveExp || 0),
    nextTotal: Number(award.nextTotal || 0),
    details: award.details || null,
  };
  if (chId && Array.isArray(game?.hogwartsPodium)) {
    hogwartsPodiumByChannel.set(chId, game.hogwartsPodium.slice());
  }
}

async function grantAndStoreHogwartsPodiumAward({
  client,
  guild,
  userId,
  cfg,
  game,
  channelId,
  reg,
}) {
  const award = await trackHogwartsPodiumAward(
    channelId,
    awardMinigameWinToUser({
      client,
      guild,
      userId,
      cfg,
      game,
      rewardExp: game.rewardExp,
      housePointAmount: getHogwartsPodiumPlaceHousePoints(cfg, game?.type, reg.entry.place),
      podiumMeta: { place: reg.entry.place + 1, houseId: reg.entry.houseId },
      channelId,
    }),
  );
  storeHogwartsPodiumEntryAward(game, userId, award, channelId);
  if (award.member) {
    await handleExpReward(client, award.member, award.nextTotal);
  }
  return award;
}

function buildMinigameTimeoutEmbedForGame(game?) {
  if (!game || !game.type) return null;
  const type = String(game.type);
  switch (type) {
    case "guessNumber":
      return buildTimeoutNumberEmbed(Number(game.target));
    case "guessWord":
      return buildTimeoutWordEmbed(String(game.target || ""));
    case "guessFlag":
      return buildTimeoutFlagEmbed(String(game.displayName || "la bandiera"));
    case "guessPlayer":
      return buildTimeoutPlayerEmbed(String(game.displayName || game.name || "il calciatore"));
    case "hogwartsGuessCharacter":
      return buildTimeoutHogwartsGuessCharacterEmbed(String(game.displayName || game.name || "il personaggio"));
    case "guessSong":
      return buildTimeoutSongEmbed(String(game.title || "la canzone"), String(game.artist || ""));
    case "guessCapital":
      return buildTimeoutCapitalEmbed(String(game.country || "nazione sconosciuta"), String(game.displayAnswer || game.answers?.[0] || "sconosciuta"));
    case "guessRegionCapital":
      return buildTimeoutRegionCapitalEmbed(String(game.region || "regione sconosciuta"), String(game.displayAnswer || game.answers?.[0] || "sconosciuto"));
    case "guessReverseCapital":
      return buildTimeoutReverseCapitalEmbed(String(game.capital || "capitale sconosciuta"), String(game.displayAnswer || game.country || game.answers?.[0] || "sconosciuto"));
    case "fastType":
      return buildTimeoutFastTypeEmbed(String(game.phrase || "frase sconosciuta"));
    case "guessTeam":
      return buildTimeoutTeamEmbed(String(game.team || "squadra sconosciuta"));
    case "guessSinger":
      return buildTimeoutSingerEmbed(String(game.name || "cantante sconosciuto"));
    case "guessAlbum":
      return buildTimeoutAlbumEmbed(String(game.album || "album sconosciuto"), String(game.artist || ""));
    case "hangman":
      return buildTimeoutHangmanEmbed(String(game.word || "parola sconosciuta"));
    case "italianGK":
      return buildTimeoutItalianGkEmbed(String(game.displayAnswer || game.answers?.[0] || "sconosciuta"));
    case "hogwartsQuiz":
      return buildTimeoutHogwartsQuizEmbed(String(game.displayAnswer || game.answers?.[0] || "sconosciuta"));
    case "hogwartsCipher":
      return buildTimeoutHogwartsCipherEmbed(String(game.displayAnswer || game.answers?.[0] || "sconosciuta"));
    case "hogwartsMemoryEmoji":
    case "memoryEmoji":
      return buildTimeoutHogwartsMemoryEmbed(String(game.sequence || ""));
    case "hogwartsObservationTower":
      return buildObservationTowerTimeoutEmbed(game.houseBrickCounts, game.targetBricks, game.soloHouseId || "");
    case "drivingQuiz":
      return buildTimeoutDrivingQuizEmbed(game);
    case "mathExpression":
      return buildTimeoutMathEmbed(String(game.answer ?? "0"));
    case "findBot":
      return buildTimeoutFindBotEmbed();
    case "halloweenFindGhost":
      return buildTimeoutFindBotEmbed().setTitle("Tempo scaduto — il fantasma è scappato 👻");
    case "findBotVoice":
      return buildTimeoutFindBotVoiceEmbed();
    case "findScroll":
      return buildTimeoutFindScrollEmbed();
    case "guessYear":
      return buildTimeoutGuessYearEmbed(String(game.title || "titolo"), String(game.subtitle || ""), Number(game.year) || 0);
    case "completeVerse":
      return buildTimeoutCompleteVerseEmbed(String(game.answer || "verso"), String(game.song || "canzone"), String(game.artist || "artista"));
    case "guessEmoji":
      return buildTimeoutGuessEmojiEmbed(String(game.emojis || ""), String(game.displayAnswer || game.answers?.[0] || ""));
    case "quoteFilm":
      return buildTimeoutQuoteFilmEmbed(String(game.quote || "citazione"), String(game.displayAnswer || game.answer || game.answers?.[0] || ""));
    case "completeProverb":
      return buildTimeoutCompleteProverbEmbed(String(game.start || ""), String(game.end || ""));
    case "synonymAntonym":
      return buildTimeoutSynonymAntonymEmbed(String(game.word || ""), String(game.answer ?? game.answers?.[0] ?? ""), String(game.kind || ""));
    case "guessCity":
      return buildTimeoutGuessCityEmbed(String(game.landmark || ""), String(game.city || game.answers?.[0] || ""));
    case "halloweenQuiz":
      return buildTimeoutItalianGkEmbed(String(game.displayAnswer || game.answers?.[0] || "sconosciuta")).setTitle("Tempo scaduto — Quiz Halloween");
    case "halloweenMissingEmoji":
      return new EmbedBuilder()
        .setColor(MINIGAME_EMBED_COLOR)
        .setTitle("Tempo scaduto 🎃")
        .setDescription(`L'emoji mancante era **${game.displayAnswer || game.missing || "?"}**.`);
    case "halloweenCountBats":
      return new EmbedBuilder()
        .setColor(MINIGAME_EMBED_COLOR)
        .setTitle("Tempo scaduto 🦇")
        .setDescription(`I pipistrelli erano **${game.displayAnswer || game.count || "?"}**.`);
    case "halloweenTrickOrTreat": {
      const claimed = Object.keys(game?.claimedBy || {}).length;
      return buildTrickOrTreatEndedEmbed(claimed);
    }
    default:
      return null;
  }
}

function buildGameSnapshotFromPersistedState(state?) {
  const type = String(state?.type || "").trim();
  const parsed = parseStateTarget(state.target);
  const game: Record<string, any> = { type, rewardExp: Number(state.rewardExp || 0) };
  switch (type) {
    case "guessNumber":
      game.target = Number(state.target);
      return game;
    case "guessWord":
      game.target = String(state.target || "");
      return game;
    case "guessFlag":
      game.displayName = parsed?.displayName || "la bandiera";
      return game;
    case "guessPlayer":
      game.displayName = parsed?.name || parsed?.displayName || "il calciatore";
      game.name = parsed?.name || game.displayName;
      return game;
    case "hogwartsGuessCharacter":
      game.displayName = parsed?.name || parsed?.displayName || "il personaggio";
      game.name = parsed?.name || game.displayName;
      return game;
    case "guessSong":
      game.title = parsed?.title || "la canzone";
      game.artist = parsed?.artist || "";
      return game;
    case "guessCapital":
      game.country = parsed?.country || "nazione sconosciuta";
      game.displayAnswer = parsed?.displayAnswer || parsed?.answers?.[0] || "sconosciuta";
      game.answers = parsed?.answers || [];
      return game;
    case "guessRegionCapital":
      game.region = parsed?.region || "regione sconosciuta";
      game.displayAnswer = parsed?.displayAnswer || parsed?.answers?.[0] || "sconosciuto";
      return game;
    case "guessReverseCapital":
      game.capital = parsed?.capital || "capitale sconosciuta";
      game.displayAnswer = parsed?.displayAnswer || parsed?.country || parsed?.answers?.[0] || "sconosciuto";
      return game;
    case "fastType":
      game.phrase = parsed?.phrase || "frase sconosciuta";
      return game;
    case "guessTeam":
      game.team = parsed?.team || "squadra sconosciuta";
      return game;
    case "guessSinger":
      game.name = parsed?.name || "cantante sconosciuto";
      return game;
    case "guessAlbum":
      game.album = parsed?.album || "album sconosciuto";
      game.artist = parsed?.artist || "";
      return game;
    case "hangman":
      game.word = parsed?.word || String(state.target || "parola sconosciuta");
      return game;
    case "italianGK":
    case "halloweenQuiz":
      game.displayAnswer = parsed?.displayAnswer || parsed?.answers?.[0] || "sconosciuta";
      game.answers = parsed?.answers || [];
      return game;
    case "halloweenMissingEmoji":
      game.display = parsed?.display || "";
      game.missing = parsed?.missing || "";
      game.choices = Array.isArray(parsed?.choices) ? parsed.choices : [];
      game.displayAnswer = parsed?.missing || parsed?.answers?.[0] || "?";
      game.answers = parsed?.answers || [];
      return game;
    case "halloweenCountBats":
      game.display = parsed?.display || "";
      game.count = Number(parsed?.count);
      game.displayAnswer = String(parsed?.count ?? parsed?.answers?.[0] ?? "?");
      game.answers = parsed?.answers || [];
      return game;
    case "halloweenTrickOrTreat":
      game.treatChancePercent = Number(parsed?.treatChancePercent ?? 80);
      game.candyOnTreat = Number(parsed?.candyOnTreat ?? 1);
      game.claimedBy = parsed?.claimedBy && typeof parsed.claimedBy === "object" ? parsed.claimedBy : {};
      game.customId = parsed?.customId || state.customId || "";
      game.multiClaim = true;
      return game;
    case "hogwartsQuiz":
      game.displayAnswer = parsed?.displayAnswer || parsed?.answers?.[0] || parsed?.sourceAnswers?.[0] || "sconosciuta";
      game.answers = parsed?.answers || [];
      game.question = parsed?.question || "";
      return game;
    case "hogwartsCipher":
      game.displayAnswer = parsed?.displayAnswer || parsed?.answers?.[0] || "sconosciuta";
      return game;
    case "hogwartsMemoryEmoji":
    case "memoryEmoji":
      game.sequence = parsed?.sequence || "";
      return game;
    case "hogwartsObservationTower":
      game.houseBrickCounts = parseObservationTowerHouseBrickCounts(parsed);
      game.targetBricks = Number(parsed?.targetBricks || OBSERVATION_TOWER_DEFAULT_TARGET_BRICKS);
      game.soloHouseId = String(parsed?.soloHouseId || "");
      return game;
    case "drivingQuiz":
      if (Array.isArray(parsed?.options) && Number.isFinite(parsed?.correctIndex)) {
        return { ...game, questionType: "multiple", options: parsed.options, correctIndex: parsed.correctIndex };
      }
      return { ...game, answer: Boolean(parsed?.answer) };
    case "mathExpression":
      game.answer = parsed?.answer ?? "0";
      return game;
    case "guessYear":
      game.title = parsed?.title || "titolo";
      game.subtitle = parsed?.subtitle || "";
      game.year = Number(parsed?.year) || 0;
      return game;
    case "completeVerse":
      game.answer = parsed?.answer || "verso";
      game.song = parsed?.song || "canzone";
      game.artist = parsed?.artist || "artista";
      return game;
    case "guessEmoji":
      game.emojis = parsed?.emojis || "";
      game.displayAnswer = parsed?.displayAnswer || parsed?.answers?.[0] || "";
      game.answers = parsed?.answers || [];
      return game;
    case "quoteFilm":
      game.quote = parsed?.quote || "citazione";
      game.displayAnswer = parsed?.displayAnswer || parsed?.answer || parsed?.answers?.[0] || "";
      game.answer = parsed?.answer || game.displayAnswer;
      return game;
    case "completeProverb":
      game.start = parsed?.start || "";
      game.end = parsed?.end || "";
      return game;
    case "synonymAntonym":
      game.word = parsed?.word || "";
      game.answer = parsed?.answer || parsed?.answers?.[0] || "";
      game.kind = parsed?.kind || "";
      game.answers = parsed?.answers || [];
      return game;
    case "guessCity":
      game.landmark = parsed?.landmark || "";
      game.city = parsed?.city || parsed?.answers?.[0] || "";
      game.answers = parsed?.answers || [];
      return game;
    case "findBot":
    case "halloweenFindGhost":
    case "findBotVoice":
    case "findScroll":
      return game;
    default:
      return { ...game, ...parsed };
  }
}

async function deleteFindMinigameRemoteMessage(guild?, gameOrState?) {
  const targetChannelId = String(gameOrState?.channelId || gameOrState?.targetChannelId || "").trim();
  const messageId = String(gameOrState?.messageId || gameOrState?.gameMessageId || "").trim();
  if (!guild || !targetChannelId || !messageId) return false;
  const targetChannel = guild.channels.cache.get(targetChannelId) || (await guild.channels.fetch(targetChannelId).catch(() => null));
  if (!targetChannel?.messages?.fetch) return false;
  const msg = await targetChannel.messages.fetch(messageId).catch(() => null);
  if (!msg) return false;
  await msg.delete().catch(() => {});
  return true;
}

async function finalizeFindMinigameTimeout(client?, cfg?, mainChannelId?, mainChannel?, game?, buildTimeoutEmbed?) {
  if (!game) return;
  if (game.type === "findBotVoice") {
    await leaveFindBotVoiceChannel(mainChannel?.guild?.id);
  } else {
    await deleteFindMinigameRemoteMessage(mainChannel?.guild, game);
  }
  await sendMinigameTimeoutAndClose(client, cfg, mainChannelId, mainChannel, game, buildTimeoutEmbed());
}

function scheduleFindMinigameTimeout(client?, cfg?, mainChannelId?, mainChannel?, customId?, durationMs?, buildTimeoutEmbed?) {
  const timer = setTimeout(async () => {
    const game = activeGames.get(mainChannelId);
    if (!game || game.customId !== customId) return;
    await finalizeFindMinigameTimeout(client, cfg, mainChannelId, mainChannel, game, buildTimeoutEmbed);
  }, durationMs);
  timer.unref?.();
  return timer;
}

async function closeExpiredMinigameState(client?, cfg?, channel?, state?) {
  const channelId = String(cfg?.channelId || "").trim();
  const guildId = String(channel?.guild?.id || cfg?.guildId || "").trim();
  const type = String(state?.type || "").trim();
  if (!channelId || !type) return;
    if (channel && (await tryAwardMissedMinigameWinFromHistory(client, cfg, channel, state))) {
    return;
  }
  if (type === "treasureHunt") {
    let decoy = "";
    let winner = "";
    let winnerMessageId = "";
    let candidateIds = [];
    try {
      const parsed = JSON.parse(state.target || "{}");
      decoy = String(parsed?.decoy || "");
      winner = String(parsed?.winner || "");
      winnerMessageId = String(parsed?.winnerMessageId || "");
      candidateIds = Array.isArray(parsed?.candidateIds) ? parsed.candidateIds.map(String) : [];
    } catch (err) {
      warnMinigame(err);
    }
    const game = {
      type: "treasureHunt",
      decoy,
      winner,
      winnerMessageId,
      candidateIds,
    };
    restoreHogwartsPodiumFromState(channelId, state, game);
    const podium = isHogwartsPodiumWinMode(cfg, "treasureHunt", game) ? ensureHogwartsPodium(game, channelId) : [];
    const url = getTreasureHuntMessageUrl(guildId, channel.id, winnerMessageId);
    if (podium.length > 0) {
      const embeds = [];
      if (winnerMessageId) embeds.push(buildTreasureHuntFoundEmbed(url));
      embeds.push(buildHogwartsPodiumSummaryEmbed(cfg, "treasureHunt", podium, { timedOut: true }));
      await sendMinigameMessage(channel, { embeds }).catch(() => { });
      if (candidateIds.length) removeTreasureHuntReactions(channel, candidateIds, decoy, winner).catch(() => { });
      await minigameStateDeleteOne({ guildId, channelId }).catch(() => { });
      clearHogwartsPodiumChannel(channelId);
      return;
    }
    const labels = await treasureHuntDisplayTexts(channel.guild, decoy, winner);
    await sendMinigameMessage(channel, {
      embeds: [buildTreasureHuntTimeoutEmbed(labels.decoy, labels.winner, url)],
    }).catch(() => { });
    if (candidateIds.length) removeTreasureHuntReactions(channel, candidateIds, decoy, winner).catch(() => { });
    await minigameStateDeleteOne({ guildId, channelId }).catch(() => { });
    return;
  }
  const game = buildGameSnapshotFromPersistedState(state);
  restoreHogwartsPodiumFromState(channelId, state, game);
  await sendMinigameTimeoutAndClose(
    client,
    cfg,
    channelId,
    channel,
    game,
    buildMinigameTimeoutEmbedForGame(game),
    { allowPersistedClose: true },
  );
  if (type === "findBot" || type === "findScroll" || type === "halloweenFindGhost") {
    await deleteFindMinigameRemoteMessage(channel.guild, state);
  }
  if (type === "findBotVoice") {
    await leaveFindBotVoiceChannel(channel.guild?.id);
  }
}

function scheduleMinigameRoundTimeout(client?, cfg?, channelId?, channel?, durationMs?) {
  const timer = setTimeout(async () => {
    const chId = String(channelId || "").trim();
    if (!chId || channelWinClosing.has(chId)) return;
    const game = activeGames.get(chId);
    if (game?.type === "hogwartsObservationTower") {
      if (shouldAbortMinigameTimeoutClose(game, chId)) return;
      if (game._finishClaimed || game._finishEmbedSent) return;
      await finishObservationTowerTimeout(client, cfg, chId, channel, game);
      return;
    }
    if (game && !shouldAbortMinigameTimeoutClose(game, chId)) {
      const won = await catchUpTextMinigameWinFromHistory(client, cfg, channel, game).catch(() => false);
      if (won || shouldAbortMinigameTimeoutClose(activeGames.get(chId), chId)) return;
      await sendMinigameTimeoutAndClose(client, cfg, chId, channel, game, buildMinigameTimeoutEmbedForGame(game));
      return;
    }
            try {
      let guildId = String(cfg?.guildId || channel?.guild?.id || "").trim();
      if (!guildId) guildId = await resolveMinigameGuildIdAsync({ ...cfg, channelId: chId }, client);
      await purgeExpiredMinigameDbState(client, { ...cfg, channelId: chId, guildId });
    } catch (err) {
      warnMinigame(err);
    }
  }, Math.max(0, Number(durationMs) || 0));
  timer.unref?.();
  return timer;
}

async function sendMinigameTimeoutAndClose(client?, cfg?, channelId?, channel?, game?, timeoutEmbed?, options: Record<string, any> = {}) {
  const chId = String(channelId || "").trim();
  if (shouldAbortMinigameTimeoutClose(game, chId, options)) return;
  if (!tryClaimMinigameChannelClose(chId)) return;
  try {
    recordNoParticipationIfNeeded(chId, game);
    clearMinigameRoundTimers(game);
    if (game?.type === "hangman") {
      const boardChannel = channel?.send ? channel : await getChannelCached(client, chId);
      if (boardChannel) await revealHangmanSolutionBoard(boardChannel, game).catch(() => { });
    }
    const embeds = [];
    const podium = isHogwartsPodiumWinMode(cfg, game?.type, game) ? ensureHogwartsPodium(game, chId) : [];
    if (podium.length > 0) {
      embeds.push(buildHogwartsPodiumSummaryEmbed(cfg, game.type, podium, { timedOut: true }));
    } else if (timeoutEmbed) {
      embeds.push(timeoutEmbed);
    } else {
            embeds.push(
        new EmbedBuilder()
          .setColor(MINIGAME_EMBED_COLOR)
          .setDescription(
            "<a:VC_pixeltime:1482535344103620771> Tempo scaduto! Nessuno ha vinto questo minigioco.",
          ),
      );
    }
    activeGames.delete(chId);
    clearHogwartsPodiumChannel(chId);
    if (embeds.length) {
      let targetChannel = channel?.send ? channel : null;
      let sent = targetChannel ? await sendMinigameMessage(targetChannel, { embeds }) : null;
      if (!sent) {
        const fresh = await getChannelCached(client, chId);
        if (fresh?.send) sent = await sendMinigameMessage(fresh, { embeds });
      }
      if (!sent) {
                await new Promise((r?) => setTimeout(r, 750));
        const retryCh = await getChannelCached(client, chId);
        if (retryCh?.send) sent = await sendMinigameMessage(retryCh, { embeds });
      }
      if (!sent) {
        global.logger?.warn?.("[MINIGAMES] timeout embed send failed", {
          channelId: chId,
          type: game?.type || null,
        });
      }
    }
    let guildId = String(cfg?.guildId || "").trim();
    if (!guildId) guildId = String(channel?.guild?.id || "").trim();
    await clearActiveGame(client, { ...cfg, channelId: chId, guildId }, game);
  } finally {
    endMinigameWinClose(chId);
  }
}

async function loadRotationState(client?, cfg?, guildIdOverride = null) {
  const channelId = cfg?.channelId;
  if (!channelId) return;
  const guildId = guildIdOverride ?? cfg?.guildId ?? (await getChannelCached(client, channelId))?.guild?.id ?? null;
  if (!guildId) return;
  const dateKey = getRomeDateKey(new Date());
  const doc = await minigameRotationFindOneLean({ guildId, channelId }).catch(() => null);
  if (doc?.lastSentAt) {
    const t = Number(new Date(doc.lastSentAt).getTime());
    if (Number.isFinite(t) && t > 0) lastSentAtByChannel.set(channelId, t);
  }
  if (doc && Array.isArray(doc.queue) && doc.dateKey === dateKey) {
    rotationDate = doc.dateKey;
    rotationQueue = shuffleArray(doc.queue.slice());
    return;
  }
  rotationDate = dateKey;
  rotationQueue = [];
  await minigameRotationFindOneAndUpdate(
    { guildId, channelId },
    { $set: { dateKey, queue: [] } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => { });
}

async function saveRotationState(client?, cfg?, guildIdOverride = null) {
  const channelId = cfg?.channelId;
  if (!channelId) return;
  const guildId = guildIdOverride ?? cfg?.guildId ?? (await getChannelCached(client, channelId))?.guild?.id ?? null;
  if (!guildId) return;
  const dateKey = rotationDate || getRomeDateKey(new Date());
  await minigameRotationFindOneAndUpdate(
    { guildId, channelId },
    { $set: { dateKey, queue: rotationQueue, lastSentAt: lastSentAtByChannel.get(channelId) || 0 } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => { });
}

function shuffleArray(arr?) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function getNextGameType(client?, cfg?) {
  const available = getAvailableGameTypes(cfg);
  if (available.length === 0) return null;
  const guildId = cfg?.guildId ?? (cfg?.channelId ? (await getChannelCached(client, cfg.channelId))?.guild?.id ?? null : null);
  await loadRotationState(client, cfg, guildId);
  const todayKey = getRomeDateKey(new Date());
  const halloweenCycle = shouldUseHalloweenTheme(cfg);
  const hogwartsAlternate = !halloweenCycle && isHogwartsAlternatingRotationActive(cfg);
  const { themed: hogwartsThemed, bonus: hogwartsBonus } = hogwartsAlternate
    ? splitHogwartsEventGameTypes(available, cfg)
    : { themed: [], bonus: [] };
  const queueSet = new Set(rotationQueue);
  const queueMatchesConfig = available.length === queueSet.size && available.every((t?) => queueSet.has(t));
  if (rotationDate !== todayKey || rotationQueue.length === 0 || (!halloweenCycle && !queueMatchesConfig)) {
    rotationDate = todayKey;
    rotationQueue = hogwartsAlternate
      ? buildHogwartsAlternatingRotationQueue(hogwartsThemed, hogwartsBonus, cfg)
      : shuffleArray(expandGameTypesByRotationWeight(cfg, available.slice()));
  }
  if (halloweenCycle) {
    const badQueue = rotationQueue.some((t?) => !available.includes(t));
    if (badQueue || rotationQueue.length === 0) {
      rotationQueue = shuffleArray(available.slice());
    }
  }
  const channelId = cfg?.channelId;
  const now = Date.now();
  const lastPlayedArr = channelId ? (lastPlayedGameTypesByChannel.get(channelId) || []) : [];
  const excludeSet = new Set(lastPlayedArr);
  const cooldownUntilByType = channelId ? (lastPlayedAtByChannelAndType.get(channelId) || new Map()) : new Map();
  const isOnCooldown = (type?) => {
    const at = cooldownUntilByType.get(type);
    return typeof at === "number" && now - at < getGameTypeCooldownMs(type, cfg);
  };
  const halfAvailable = Math.floor(available.length / 2);
  if (!halloweenCycle && rotationQueue.length < halfAvailable && available.length > 0) {
    rotationQueue = hogwartsAlternate
      ? buildHogwartsAlternatingRotationQueue(hogwartsThemed, hogwartsBonus, cfg)
      : shuffleArray(expandGameTypesByRotationWeight(cfg, available.slice()));
  }
  let next = null;
  if (hogwartsAlternate) {
    next = pickHogwartsAlternatingGameType(cfg, channelId, hogwartsThemed, hogwartsBonus, excludeSet, isOnCooldown);
  }
  if (!next) {
    if (halloweenCycle && rotationQueue.length === 0) {
      rotationQueue = shuffleArray(available.slice());
    }
    next = rotationQueue.shift() || available[0];
  }
  while ((excludeSet.has(next) || isOnCooldown(next)) && (rotationQueue.length > 0 || available.length > 1)) {
    if (hogwartsAlternate) {
      const retry = pickHogwartsAlternatingGameType(cfg, channelId, hogwartsThemed, hogwartsBonus, excludeSet, isOnCooldown);
      if (retry && retry !== next) {
        next = retry;
        continue;
      }
    }
    if (rotationQueue.length > 0) {
      if (halloweenCycle) {
        next = rotationQueue.shift();
      } else {
        rotationQueue.push(next);
        next = rotationQueue.shift();
      }
    } else if (halloweenCycle) {
      rotationQueue = shuffleArray(available.filter((t?) => t !== next));
      break;
    } else {
      const others = available.filter((t?) => !excludeSet.has(t) && !isOnCooldown(t));
      next = others.length ? others[randomBetween(0, others.length - 1)] : available[0];
      break;
    }
  }
  if (next && !halloweenCycle) {
    rotationQueue = rotationQueue.filter((type?) => type !== next);
    rotationQueue.push(next);
  }
  await saveRotationState(client, cfg, guildId);
  return next;
}

async function requeueGameType(client?, cfg?, gameType?) {
  if (!gameType) return;
  const available = getAvailableGameTypes(cfg);
  if (!available.includes(gameType)) return;
  if (!rotationDate) rotationDate = getRomeDateKey(new Date());
  rotationQueue = rotationQueue.filter((type?) => type !== gameType);
  rotationQueue.push(gameType);
  await saveRotationState(client, cfg);
}

async function scheduleMinuteHint(client?, hintChannelId?, durationMs?, channelId?, hintBeforeExpiryMs = 60 * 1000) {
  if (!hintChannelId || !durationMs || durationMs <= 60 * 1000) return null;
  const mainChannel = await getChannelCached(client, channelId);
  if (!mainChannel) return null;
  const beforeMs = Math.max(60 * 1000, Math.min(durationMs - 30 * 1000, Math.floor(Number(hintBeforeExpiryMs) || 60 * 1000)));
  const delay = durationMs - beforeMs;
  if (delay < 5 * 1000) return null;
  const timer = setTimeout(async () => {
    await sendMinigameMessage(mainChannel, { embeds: [buildMinuteHintEmbed(hintChannelId)] })
      .catch(() => { });
  }, delay);
  timer.unref?.();
  return timer;
}

async function scheduleGenericHint(client?, channelId?, durationMs?, hintText?) {
  if (!channelId || !durationMs || durationMs <= 60 * 1000 || !hintText)
    return null;
    if (isBurrobirraActiveForChannel(client, channelId)) return null;
  const channel = await getChannelCached(client, channelId);
  if (!channel) return null;
  const delay = durationMs - 60 * 1000;
  const timer = setTimeout(async () => {
    await sendMinigameMessage(channel, { embeds: [buildGenericHintEmbed(hintText)] })
      .catch(() => { });
  }, delay);
  timer.unref?.();
  return timer;
}

function buildMemoryEmojiPartialHint(sequence?) {
  const tokens = String(sequence || "")
    .split(/[\s·•|]+/)
    .map((t?) => String(t || "").trim())
    .filter(Boolean);
  const n = tokens.length;
  if (n < 2) return null;
  const revealCount = Math.min(n - 1, Math.max(1, Math.ceil(n / 2)));
  const order = tokens.map((_?, i?) => i);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = order[i];
    order[i] = order[j];
    order[j] = tmp;
  }
  const reveal = new Set(order.slice(0, revealCount));
  const shown = tokens.map((t?, i?) => (reveal.has(i) ? t : "❓"));
  return `<a:VC_Flame:1482725674711126140> Effetto **burrobirra**: ricordo sfocato… **${shown.join(" ")}** (${revealCount}/${n})`;
}

async function scheduleBurrobirraMemoryEmojiHint(client?, channelId?, durationMs?, sequence?) {
  if (!channelId || !durationMs || durationMs <= 60 * 1000) return null;
  const game = activeGames.get(String(channelId));
  const burroOn =
    Boolean(game?.burrobirraApplies) || isBurrobirraActiveForChannel(client, channelId);
  if (!burroOn) return null;
  const hintText = buildMemoryEmojiPartialHint(sequence);
  if (!hintText) return null;
  const channel = await getChannelCached(client, channelId);
  if (!channel) return null;
  const delay = Math.max(1000, durationMs - 60 * 1000);
  const timer = setTimeout(async () => {
    const live = activeGames.get(String(channelId));
    if (!live) return;
    if (live.type !== "memoryEmoji" && live.type !== "hogwartsMemoryEmoji") return;
    const stillBurro =
      Boolean(live.burrobirraApplies) || isBurrobirraActiveForChannel(client, channelId);
    if (!stillBurro) return;
    await sendMinigameMessage(channel, { embeds: [buildGenericHintEmbed(hintText)] }).catch(() => {});
  }, delay);
  timer.unref?.();
  return timer;
}

async function startGuessNumberGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId) return false;
  if (activeGames.has(channelId)) return false;

  const min = Math.max(1, Number(cfg?.guessNumber?.min || 1));
  let max = Math.max(min, Number(cfg?.guessNumber?.max || 100));
  if (isBurrobirraActiveForChannel(client, channelId)) {
    max = Math.max(max, min + Math.max(250, (max - min) * 4));
  }
  const rewardExp = normalizeRewardExp(cfg?.guessNumber?.rewardExp ?? 100);
  const durationMs = applyBurrobirraStrongDurationMs(client, channelId, Math.max(60000, Number(cfg?.guessNumber?.durationMs || 180000)));

  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  const target = randomBetween(min, max);
  const roleId = cfg.roleId;

  await sendMinigameRolePing(channel, cfg, roleId);
  const numberAttachment = buildPromptImageAttachment("Indovina il numero", [`Tra ${min} e ${max}`], "guess_number", "", client, isBurrobirraActiveForChannel(client, channelId));
  const numberEmbed = applyHogwartsBonusEmbedTitle(buildGuessNumberEmbed(min, max, rewardExp, durationMs), cfg, "guessNumber", "Indovina il numero");
  if (numberAttachment) numberEmbed.setImage(`attachment://${numberAttachment.name}`);
  const gameMessage = await sendMinigameMessage(channel, { embeds: [numberEmbed], files: numberAttachment ? [numberAttachment] : [], }, MINIGAME_QUESTION_BURROBIRRA).catch(() => null);

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

  stampMinigameBurrobirraApplies(channelId, client);
  markSent(channelId);

  return true;
}

async function startGuessWordGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId) return false;
  if (activeGames.has(channelId)) return false;

  let words = [];
  if (shouldApplyHogwartsBonusTheme(cfg, "guessWord")) {
    words = getHogwartsGuessWords().map(normalizeWord).filter(isValidGuessWord);
  }
  if (!words.length) words = await loadWordList(cfg);
  if (!words.length) return false;

  const rewardExp = normalizeRewardExp(cfg?.guessWord?.rewardExp ?? 150);
  const durationMs = applyBurrobirraStrongDurationMs(client, channelId, Math.max(60000, Number(cfg?.guessWord?.durationMs || 180000)));

  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  const target = String(words[randomBetween(0, words.length - 1)] || "",).toLowerCase();
  if (!target) return false;

  const roleId = cfg.roleId;
  await sendMinigameRolePing(channel, cfg, roleId);
  const scrambled = (() => {
    let s = shuffleString(target);
    if (isBurrobirraActiveForChannel(client, channelId)) {
      s = shuffleString(s);
      if (s === target) s = shuffleString(String(target).split("").reverse().join(""));
    }
    return s;
  })();
  const wordAttachment = buildPromptImageAttachment("Indovina la parola", [scrambled], "guess_word", "", client, isBurrobirraActiveForChannel(client, channelId));
  const wordEmbed = applyHogwartsBonusEmbedTitle(buildGuessWordEmbed(scrambled, rewardExp, durationMs), cfg, "guessWord", "Indovina la parola");
  if (wordAttachment) {
    wordEmbed.setImage(`attachment://${wordAttachment.name}`);
  }
  const gameMessage = await sendMinigameMessage(channel, { embeds: [wordEmbed], files: wordAttachment ? [wordAttachment] : [], }, MINIGAME_QUESTION_BURROBIRRA).catch(() => null);

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

  stampMinigameBurrobirraApplies(channelId, client);
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
  const durationMs = applyBurrobirraStrongDurationMs(client, channelId, Math.max(60000, Number(cfg?.guessFlag?.durationMs || 180000)));

  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  const target = pickQuestionAvoidRecent(channelId, "guessFlag", countries, (c?) => c?.displayName || (Array.isArray(c?.names) ? c.names[0] : "") || "", 20) || countries[randomBetween(0, countries.length - 1)];
  if (!target) return false;

  const roleId = cfg.roleId;
  await sendMinigameRolePing(channel, cfg, roleId);

  const flagEmbed = applyHogwartsBonusEmbedTitle(buildGuessFlagEmbed(target.flagUrl, rewardExp, durationMs), cfg, "guessFlag", "Indovina la bandiera");
  const gameMessage = await sendMinigameMessage(channel, { embeds: [flagEmbed] }, MINIGAME_QUESTION_BURROBIRRA).catch(() => null);

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

  stampMinigameBurrobirraApplies(channelId, client);
  markSent(channelId);

  return true;
}

async function startGuessPlayerGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId) return false;
  if (activeGames.has(channelId)) return false;

  const rewardExp = normalizeRewardExp(cfg?.guessPlayer?.rewardExp ?? 100);
  const durationMs = applyBurrobirraStrongDurationMs(client, channelId, Math.max(60000, Number(cfg?.guessPlayer?.durationMs || 180000)));

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
    { embeds: [playerEmbed], ...(playerAttachment ? { files: [playerAttachment] } : {}) },
    MINIGAME_QUESTION_BURROBIRRA,
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

  stampMinigameBurrobirraApplies(channelId, client);
  markSent(channelId);
  return true;
}

async function startHogwartsGuessCharacterGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;

  const entry = pickHogwartsCharacterEntry(channelId);
  if (!entry?.name) return false;

  const rewardExp = normalizeRewardExp(cfg?.hogwartsGuessCharacter?.rewardExp ?? cfg?.guessPlayer?.rewardExp ?? 150);
  const durationMs = applyBurrobirraStrongDurationMs(client, channelId, Math.max(60000, Number(cfg?.hogwartsGuessCharacter?.durationMs || cfg?.guessPlayer?.durationMs || 180000)));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  const name = String(entry.name || "").trim();
  const house = String(entry.house || "Hogwarts").trim();
  const role = String(entry.role || "Personaggio").trim();
  const aliases = Array.isArray(entry.aliases) ? entry.aliases : [];
  const { attachment, imageUrl } = resolveHogwartsCharacterImage(entry, client);
  const plainHint = buildPlainMaskedTextHint(name);
  const clueLines = [
    `> <a:VC_Arrow:1482706699365257397> **Casata:** ${house}`,
    `> <a:VC_Arrow:1482706699365257397> **Ruolo:** ${role}`,
    plainHint ? `> <a:VC_Flame:1482725674711126140> **Indizio:** ${plainHint}` : null,
  ].filter(Boolean);

  await sendMinigameRolePing(channel, cfg);
  let promptAttachment = attachment || null;
  let embedImageUrl = null;
  if (!promptAttachment && imageUrl && /^https?:\/\//i.test(imageUrl)) {
    promptAttachment = await buildHogwartsCharacterImageAttachment(imageUrl);
    if (!promptAttachment) embedImageUrl = imageUrl;
  }
  if (!promptAttachment && !embedImageUrl) {
    promptAttachment = buildPromptImageAttachment(
      "Indovina il personaggio",
      [plainHint || `${house} • ${role}`, "Chi è questo personaggio?"],
      "hogwarts_guess_character",
      "",
      client,
      isBurrobirraActiveForChannel(client, channelId),
    );
  }
  const characterEmbed = applyHogwartsBonusEmbedTitle(
    buildHogwartsGuessCharacterEmbed(rewardExp, durationMs, clueLines),
    cfg,
    "hogwartsGuessCharacter",
    "Indovina il personaggio",
  );
  const files = [];
  if (promptAttachment) {
    characterEmbed.setImage(`attachment://${promptAttachment.name}`);
    files.push(promptAttachment);
  } else if (embedImageUrl) {
    characterEmbed.setImage(embedImageUrl);
  }
  const gameMessage = await sendMinigameMessage(channel, { embeds: [characterEmbed], files }, MINIGAME_QUESTION_BURROBIRRA).catch(() => null);

  const timeout = setTimeout(async () => {
    const game = activeGames.get(channelId);
    if (!game) return;
    await sendMinigameTimeoutAndClose(client, cfg, channelId, channel, game, buildTimeoutHogwartsGuessCharacterEmbed(game.displayName));
  }, durationMs);
  timeout.unref?.();

  const hintTimeout = await scheduleGenericHint(client, channelId, durationMs, `${house} \u2022 ${role} \u2022 ${buildRevealHint(name)}`);

  const sourceAliases = aliases.map((a?) => String(a || "").trim()).filter(Boolean);
  activeGames.set(channelId, {
    type: "hogwartsGuessCharacter",
    answers: buildStrictBankAliases([name, ...sourceAliases], normalizePlayerGuess),
    sourceAliases,
    fullAnswer: normalizePlayerGuess(name),
    displayName: name,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  });

  await saveActiveGame(client, cfg, {
    type: "hogwartsGuessCharacter",
    target: JSON.stringify({
      name,
      house,
      role,
      imageUrl: imageUrl || null,
      aliases: sourceAliases,
    }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });

  stampMinigameBurrobirraApplies(channelId, client);
  markSent(channelId);
  return true;
}

async function startGuessSongGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId) return false;
  if (activeGames.has(channelId)) return false;

  const rewardExp = normalizeRewardExp(cfg?.guessSong?.rewardExp ?? 100);
  const durationMs = applyBurrobirraStrongDurationMs(client, channelId, Math.max(60000, Number(cfg?.guessSong?.durationMs || 180000)));

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
  const gameMessage = await sendMinigameMessage(channel, { embeds: [buildGuessSongEmbed(rewardExp, durationMs, songImageUrl)], components: [row], files: songFiles, }, MINIGAME_QUESTION_BURROBIRRA).catch(() => null);

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

  stampMinigameBurrobirraApplies(channelId, client);
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
  const durationMs = applyBurrobirraStrongDurationMs(client, channelId, Math.max(60000, Number(cfg?.guessCapital?.durationMs || 180000)));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  if (cfg.roleId)
    await sendMinigameRolePing(channel, cfg);
  const capitalAttachment = !pick.image ? buildPromptImageAttachment("Indovina la capitale", [pick.country], "guess_capital", "", client, isBurrobirraActiveForChannel(client, channelId)) : null;
  const capitalEmbed = buildGuessCapitalEmbed(pick.country, rewardExp, durationMs, pick.image || (capitalAttachment ? `attachment://${capitalAttachment.name}` : null));
  const gameMessage = await sendMinigameMessage(channel, { embeds: [capitalEmbed], files: capitalAttachment ? [capitalAttachment] : [], }, MINIGAME_QUESTION_BURROBIRRA).catch(() => null);

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

  stampMinigameBurrobirraApplies(channelId, client);
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
  const durationMs = applyBurrobirraStrongDurationMs(client, channelId, Math.max(60000, Number(cfg?.guessRegionCapital?.durationMs || 180000)));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  if (cfg.roleId)
    await sendMinigameRolePing(channel, cfg);
  const image = await fetchWikiRegionImage(pick.region);
  const burrobirraQuestion = isBurrobirraActiveForChannel(client, channelId);
  const regionNameAttachment = !image ? (buildRegionNameImageAttachment(pick.region, client, "guess_region_capital", burrobirraQuestion) || buildPromptImageAttachment("Indovina il capoluogo", [pick.region], "guess_region_capital", "", client, burrobirraQuestion)) : null;
  const regionImageUrl = image || (regionNameAttachment ? `attachment://${regionNameAttachment.name}` : null);
  const gameMessage = await sendMinigameMessage(channel, { embeds: [buildGuessRegionCapitalEmbed(pick.region, rewardExp, durationMs, regionImageUrl, regionNameAttachment?.name || null,),], files: regionNameAttachment ? [regionNameAttachment] : [], }, MINIGAME_QUESTION_BURROBIRRA).catch(() => null);

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

  stampMinigameBurrobirraApplies(channelId, client);
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
  const durationMs = applyBurrobirraStrongDurationMs(client, channelId, Math.max(60000, Number(cfg?.guessReverseCapital?.durationMs ?? cfg?.guessCapital?.durationMs ?? 180000)));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  if (cfg.roleId)
    await sendMinigameRolePing(channel, cfg);
  const reverseCapitalAttachment = !pick.image ? buildPromptImageAttachment("Capitale inverso", [pick.capital], "guess_reverse_capital", "", client, isBurrobirraActiveForChannel(client, channelId)) : null;
  const reverseCapitalEmbed = buildGuessReverseCapitalEmbed(pick.capital, rewardExp, durationMs, pick.image || (reverseCapitalAttachment ? `attachment://${reverseCapitalAttachment.name}` : null));
  const gameMessage = await sendMinigameMessage(channel, { embeds: [reverseCapitalEmbed], files: reverseCapitalAttachment ? [reverseCapitalAttachment] : [], }, MINIGAME_QUESTION_BURROBIRRA).catch(() => null);

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

  stampMinigameBurrobirraApplies(channelId, client);
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
  const hpFastType = shouldApplyHogwartsBonusTheme(cfg, "fastType");
  const customApiUrl = cfg?.fastType?.apiUrl || null;
  if (!hpFastType && customApiUrl) {
    phrase = await fetchPhraseFromApiCandidates(customApiUrl);
    if (phrase) fromApi = true;
  }
  if (!phrase && !hpFastType && (cfg?.fastType?.useDefaultApi !== false)) {
    phrase = await fetchPhraseFromApiCandidates(DEFAULT_FAST_TYPE_API_URLS);
    if (phrase) fromApi = true;
  }
  if (!phrase) {
    const customPhrases = Array.isArray(cfg?.fastType?.phrases) ? cfg.fastType.phrases : [];
    const fallbackPhrases = customPhrases.length
      ? customPhrases
      : pickHogwartsBonusBank(cfg, "fastType", getFastTypingPhrases(), getHogwartsFastTypingPhrases);
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
  const durationMs = applyBurrobirraStrongDurationMs(client, channelId, Math.max(60000, Number(cfg?.fastType?.durationMs || 120000)));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  if (cfg.roleId)
    await sendMinigameRolePing(channel, cfg);
  const fastTypeAttachment = buildPromptImageAttachment("Scrivi la frase", [phrase], "fast_type", "", client, isBurrobirraActiveForChannel(client, channelId));
  const fastTypeEmbed = applyHogwartsBonusEmbedTitle(buildFastTypeEmbed(phrase, rewardExp, durationMs), cfg, "fastType", "Scrivi la frase");
  if (fastTypeAttachment) {
    fastTypeEmbed.setImage(`attachment://${fastTypeAttachment.name}`);
  }
  const gameMessage = await sendMinigameMessage(channel, { embeds: [fastTypeEmbed], files: fastTypeAttachment ? [fastTypeAttachment] : [], }, MINIGAME_QUESTION_BURROBIRRA).catch(() => null);

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

  stampMinigameBurrobirraApplies(channelId, client);
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
  const durationMs = applyBurrobirraStrongDurationMs(client, channelId, Math.max(60000, Number(cfg?.guessTeam?.durationMs || 180000)));
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
    { embeds: [teamEmbed], ...(teamAttachment ? { files: [teamAttachment] } : {}) },
    MINIGAME_QUESTION_BURROBIRRA,
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

  stampMinigameBurrobirraApplies(channelId, client);
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
  const durationMs = applyBurrobirraStrongDurationMs(client, channelId, Math.max(60000, Number(cfg?.guessSinger?.durationMs || 180000)));
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
    { embeds: [singerEmbed], ...(singerAttachment ? { files: [singerAttachment] } : {}) },
    MINIGAME_QUESTION_BURROBIRRA,
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

  stampMinigameBurrobirraApplies(channelId, client);
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
  const durationMs = applyBurrobirraStrongDurationMs(client, channelId, Math.max(60000, Number(cfg?.guessAlbum?.durationMs || 180000)));
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
  const albumFallbackAttachment = !albumImageUrl ? buildPromptImageAttachment("Indovina l'album", [pick.album, pick.artist], "guess_album", "", client, isBurrobirraActiveForChannel(client, channelId)) : null;
  if (albumFallbackAttachment) albumImageUrl = `attachment://${albumFallbackAttachment.name}`;
  const albumFiles = albumCensored ? [new AttachmentBuilder(albumCensored.buffer, { name: albumCensored.attachmentName })] : (albumFallbackAttachment ? [albumFallbackAttachment] : []);
  const gameMessage = await sendMinigameMessage(channel, { embeds: [buildGuessAlbumEmbed(rewardExp, durationMs, albumImageUrl)], files: albumFiles, }, MINIGAME_QUESTION_BURROBIRRA).catch(() => null);

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

  stampMinigameBurrobirraApplies(channelId, client);
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
  if (shouldUseHalloweenTheme(cfg)) {
    words = getHalloweenHangmanWords().map(normalizeWord).filter(isValidHangmanWord);
  } else if (shouldApplyHogwartsBonusTheme(cfg, "hangman")) {
    words = getHogwartsHangmanWords().map(normalizeWord).filter(isValidHangmanWord);
  }
  const apiUrl = cfg?.hangman?.apiUrl || cfg?.guessWord?.apiUrl || null;
  if (!words.length && apiUrl) {
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
    const fallbackWords = customWords.length
      ? customWords
      : shouldUseHalloweenTheme(cfg)
        ? getHalloweenHangmanWords()
        : pickHogwartsBonusBank(cfg, "hangman", getHangmanWords(), getHogwartsHangmanWords);
    words = fallbackWords.map(normalizeWord).filter(isValidHangmanWord);
  }
  if (!words.length) return false;

  const pickedWord = pickQuestionAvoidRecent(channelId, "hangman", words, (w?) => normalizeCountryName(w) || String(w || "").trim().toLowerCase(), 20) || pickRandomItem(words);
  const word = normalizeCountryName(pickedWord);
  if (!word) return false;

  const rewardExp = normalizeRewardExp(cfg?.hangman?.rewardExp ?? 150);
  const durationMs = applyBurrobirraStrongDurationMs(client, channelId, Math.max(60000, Number(cfg?.hangman?.durationMs || 240000)));
  let maxMisses = Math.max(3, Number(cfg?.hangman?.maxMisses || 10));
  if (isBurrobirraActiveForChannel(client, channelId)) maxMisses = Math.max(3, Math.min(maxMisses, 5));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  if (cfg.roleId)
    await sendMinigameRolePing(channel, cfg);
  const guessedLetters = [];
  const maskedWord = maskHangmanWord(word, new Set(guessedLetters));
  const hangmanAttachment = buildPromptImageAttachment("Impiccato", [maskedWord, `Errori: 0/${maxMisses}`],
    "hangman", "", client, isBurrobirraActiveForChannel(client, channelId));
  let hangmanEmbed = applyHogwartsBonusEmbedTitle(buildHangmanEmbed(maskedWord, rewardExp, durationMs), cfg, "hangman", "Impiccato");
  if (shouldUseHalloweenTheme(cfg)) hangmanEmbed.setTitle("Impiccato Halloween 🎃");
  if (hangmanAttachment) {
    hangmanEmbed.setImage(`attachment://${hangmanAttachment.name}`);
  }
  const gameMessage = await sendMinigameMessage(channel, { embeds: [hangmanEmbed], files: hangmanAttachment ? [hangmanAttachment] : [], }, MINIGAME_QUESTION_BURROBIRRA).catch(() => null);

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

  stampMinigameBurrobirraApplies(channelId, client);
  markSent(channelId);
  return true;
}

async function startItalianGkGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;

  let questionRow = null;
  const gkBank = pickHogwartsBonusBank(cfg, "italianGK", getItalianGkBank(), getHogwartsItalianGkBank);
  const localPick = pickQuestionAvoidRecent(channelId, "italianGK", gkBank, (q?) => q?.question, 20);
  if (localPick?.question && Array.isArray(localPick?.answers)) {
    questionRow = {
      question: polishItalianQuestionText(String(localPick.question)),
      answers: buildAliases(localPick.answers),
    };
  }
  let fromApi = false;
  if (!questionRow && !shouldApplyHogwartsBonusTheme(cfg, "italianGK")) {
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
  const durationMs = applyBurrobirraStrongDurationMs(client, channelId, Math.max(60000, Number(cfg?.italianGK?.durationMs || 180000)));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  if (cfg.roleId)
    await sendMinigameRolePing(channel, cfg);
  const gkAttachment = buildPromptImageAttachment("Cultura generale", [questionRow.question], "italian_gk", "", client, isBurrobirraActiveForChannel(client, channelId));
  const gkEmbed = applyHogwartsBonusEmbedTitle(buildItalianGkEmbed(questionRow.question, rewardExp, durationMs), cfg, "italianGK", "Cultura generale");
  if (gkAttachment) {
    gkEmbed.setImage(`attachment://${gkAttachment.name}`);
  }
  const gameMessage = await sendMinigameMessage(channel, { embeds: [gkEmbed], files: gkAttachment ? [gkAttachment] : [], }, MINIGAME_QUESTION_BURROBIRRA).catch(() => null);
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

  stampMinigameBurrobirraApplies(channelId, client);
  markSent(channelId);
  return true;
}

async function startHogwartsQuizGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId) return false;
  if (!cfg?.hogwartsQuiz?.eventLive) return false;
  if (activeGames.has(channelId)) {
    const prev = activeGames.get(channelId);
    if (prev && !isStaleOrInvalidActiveGame(prev)) return false;
    if (prev?.timeout) clearTimeout(prev.timeout);
    if (prev?.hintTimeout) clearTimeout(prev.hintTimeout);
    activeGames.delete(channelId);
    await clearActiveGame(client, cfg);
  }

  const pick = pickNextHogwartsQuizFromDeck(channelId);
  if (!pick?.question || !Array.isArray(pick?.answers) || !pick.answers.length) return false;

  const questionKey = normalizeQuizQuestionKey(pick.question);
  const sourceAnswers = pick.answers.map((a?) => String(a || "").trim()).filter(Boolean);
  const answers = buildAliases(sourceAnswers);
  if (!answers.length) return false;

  const rewardExp = normalizeRewardExp(cfg?.hogwartsQuiz?.rewardExp ?? 180);
  const durationMs = applyBurrobirraStrongDurationMs(client, channelId, Math.max(60000, Number(cfg?.hogwartsQuiz?.durationMs || 180000)));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  if (cfg.roleId)
    await sendMinigameRolePing(channel, cfg);
  const question = polishItalianQuestionText(String(pick.question));
  const attachment = buildPromptImageAttachment("Quiz Evento", [question], "hogwarts_quiz", "", client, isBurrobirraActiveForChannel(client, channelId));
  const embed = buildHogwartsQuizEmbed(question, rewardExp, durationMs);
  if (attachment) embed.setImage(`attachment://${attachment.name}`);
  const gameMessage = await sendMinigameMessage(channel, { embeds: [embed], files: attachment ? [attachment] : [] }, MINIGAME_QUESTION_BURROBIRRA).catch(() => null);
  if (!gameMessage) return false;

  const displayAnswer = String(pick.answers[0] || answers[0] || "sconosciuta");
  const timeout = scheduleMinigameRoundTimeout(client, cfg, channelId, channel, durationMs);
  const hintTimeout = await scheduleGenericHint(client, channelId, durationMs, `Risposta: ${buildRevealHint(displayAnswer)}`);

  const hogwartsGame = {
    type: "hogwartsQuiz",
    question,
    questionKey,
    sourceAnswers,
    answers,
    displayAnswer,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    gameMessageId: gameMessage?.id || null,
  };
  hogwartsGame.answers = resolveHogwartsQuizAnswerPool(hogwartsGame);
  attachHogwartsHouseChannelMeta(hogwartsGame, cfg);
  activeGames.set(channelId, hogwartsGame);

  await saveActiveGame(client, cfg, {
    type: "hogwartsQuiz",
    target: JSON.stringify({
      question,
      questionKey,
      sourceAnswers: hogwartsGame.sourceAnswers,
      answers: hogwartsGame.answers,
      displayAnswer,
    }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });

  stampMinigameBurrobirraApplies(channelId, client);
  markSent(channelId);
  return true;
}

function encodeAlphabetCipherWord(word?) {
  const compact = compactNoSpaces(normalizeCountryName(word)).replace(/[^a-z]/g, "");
  if (!compact) return "";
  return Array.from(compact)
    .map((ch?) => ch.charCodeAt(0) - 96)
    .filter((n?) => n >= 1 && n <= 26)
    .join(" ");
}

function filterCipherAnswersMatchingWord(word?, rawAnswers = []) {
  const expected = encodeAlphabetCipherWord(word);
  const out = [];
  const seen = new Set();
  const push = (value?) => {
    const s = String(value || "").trim();
    if (!s) return;
    const key = normalizeCountryName(s) || s.toLowerCase();
    if (!key || seen.has(key)) return;
    if (expected && encodeAlphabetCipherWord(s) !== expected) return;
    if (!expected && key !== (normalizeCountryName(word) || String(word || "").toLowerCase())) return;
    seen.add(key);
    out.push(s);
  };
  push(word);
  for (const a of Array.isArray(rawAnswers) ? rawAnswers : []) push(a);
  if (out.length) return out;
  const fallback = String(word || "").trim();
  return fallback ? [fallback] : [];
}

function resolveHogwartsCipherAnswersFromParsed(parsed?) {
  const displayAnswer = String(parsed?.displayAnswer || "").trim();
  const rawSources = (Array.isArray(parsed?.sourceAnswers) && parsed.sourceAnswers.length
    ? parsed.sourceAnswers
    : (Array.isArray(parsed?.answers) ? parsed.answers : []))
    .map((a?) => String(a || "").trim())
    .filter(Boolean);
  const word = displayAnswer || rawSources[0] || "";
  const sourceAnswers = filterCipherAnswersMatchingWord(word, rawSources);
  const answerNumbers = String(parsed?.answerNumbers || "").trim() || encodeAlphabetCipherWord(word);
  return {
    sourceAnswers,
    answers: buildStrictBankAliases(sourceAnswers),
    displayAnswer: word || "sconosciuta",
    answerNumbers,
  };
}

function isHogwartsCipherGuessCorrect(rawGuess?, game?) {
  const expected = String(game?.answerNumbers || "").trim()
    || encodeAlphabetCipherWord(game?.displayAnswer || game?.sourceAnswers?.[0] || "");
  if (!expected) return false;
  const guessEnc = encodeAlphabetCipherWord(rawGuess);
  return Boolean(guessEnc && guessEnc === expected);
}

async function startHogwartsCipherGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  if (!cfg?.hogwartsCipher?.eventLive || !cfg?.hogwartsCipher?.unlocked) return false;

  const pick = pickQuestionAvoidRecent(channelId, "hogwartsCipher", getHogwartsCipherBank(), (q?) => q?.word, 20);
  if (!pick?.word) return false;
  const answerNumbers = encodeAlphabetCipherWord(pick.word);
  if (!answerNumbers) return false;
  const burrobirraStrong = isBurrobirraActiveForChannel(client, channelId);
    let numbers = burrobirraStrong
    ? shuffleCipherNumbersDifferentFromAnswer(answerNumbers)
    : answerNumbers;
  if (burrobirraStrong && numbers === answerNumbers) {
    numbers = shuffleSpacedTokens(answerNumbers, `${channelId}:cipher:${pick.word}:${Date.now()}`);
    if (numbers === answerNumbers) {
      numbers = String(answerNumbers).split(/\s+/).reverse().join(" ");
    }
  }
  const sourceAnswers = filterCipherAnswersMatchingWord(
    pick.word,
    Array.isArray(pick.answers) && pick.answers.length
      ? pick.answers
      : (Array.isArray(pick.answer) && pick.answer.length ? pick.answer : [pick.word]),
  );
  if (!sourceAnswers.length) return false;
  const answers = buildStrictBankAliases(sourceAnswers);
  if (!answers.length) return false;

  const rewardExp = normalizeRewardExp(cfg?.hogwartsCipher?.rewardExp ?? 260);
  const durationMs = applyBurrobirraStrongDurationMs(client, channelId, Math.max(60000, Number(cfg?.hogwartsCipher?.durationMs || 180000)));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  if (cfg.roleId)
    await sendMinigameRolePing(channel, cfg);
  const displayAnswer = String(pick.word);
  const attachment = buildPromptImageAttachment("Codice Alfabetico", [numbers], "hogwarts_cipher", "", client, burrobirraStrong);
  const embed = buildHogwartsCipherEmbed(numbers, rewardExp, durationMs, { burrobirraStrong });
  if (attachment) embed.setImage(`attachment://${attachment.name}`);
  const gameMessage = await sendMinigameMessage(channel, { embeds: [embed], files: attachment ? [attachment] : [] }, MINIGAME_QUESTION_BURROBIRRA).catch(() => null);
  if (!gameMessage) return false;

  const game = attachHogwartsHouseChannelMeta({
    type: "hogwartsCipher",
    numbers,
    answerNumbers,
    sourceAnswers,
    answers,
    displayAnswer,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout: null,
    hintTimeout: null,
    gameMessageId: gameMessage?.id || null,
  }, cfg);
  activeGames.set(channelId, game);
  game.timeout = scheduleMinigameRoundTimeout(client, cfg, channelId, channel, durationMs);
  game.hintTimeout = await scheduleGenericHint(client, channelId, durationMs, `Parola: ${buildRevealHint(displayAnswer)}`);

  await saveActiveGame(client, cfg, {
    type: "hogwartsCipher",
    target: JSON.stringify({
      numbers,
      answerNumbers,
      sourceAnswers,
      answers,
      displayAnswer,
    }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });

  stampMinigameBurrobirraApplies(channelId, client);
  markSent(channelId);
  return true;
}

function getObservationTowerTierPool(raw?) {
  const tiers = Array.isArray(raw?.tiers) ? raw.tiers : Array.isArray(raw?.towerTiers) ? raw.towerTiers : [];
  const usable = tiers.filter((t?) => t && typeof t === "object");
  if (usable.length) return usable;
  if (raw?.targetBricks != null || raw?.minPlayers != null || raw?.housePoints != null) {
    return [{
      weight: 1,
      targetBricks: raw?.targetBricks ?? OBSERVATION_TOWER_DEFAULT_TARGET_BRICKS,
      minPlayers: raw?.minPlayers ?? OBSERVATION_TOWER_DEFAULT_MIN_PLAYERS,
      housePoints: raw?.housePoints ?? 0,
    }];
  }
  return OBSERVATION_TOWER_DEFAULT_TIERS.slice();
}

function normalizeObservationTowerTier(raw?, fallback: Record<string, any> = {}) {
  return {
    targetBricks: Math.max(1, Math.floor(Number(raw?.targetBricks ?? fallback?.targetBricks ?? OBSERVATION_TOWER_DEFAULT_TARGET_BRICKS))),
    minPlayers: Math.max(1, Math.floor(Number(raw?.minPlayers ?? fallback?.minPlayers ?? OBSERVATION_TOWER_DEFAULT_MIN_PLAYERS))),
    housePoints: Math.max(0, Math.floor(Number(raw?.housePoints ?? fallback?.housePoints ?? 0))),
  };
}

function pickObservationTowerTier(raw?) {
  const pool = getObservationTowerTierPool(raw);
  const totalWeight = pool.reduce((acc?, t?) => acc + (Number(t.weight) > 0 ? Number(t.weight) : 1), 0);
  let pick = Math.random() * totalWeight;
  for (const tier of pool) {
    const weight = Number(tier.weight) > 0 ? Number(tier.weight) : 1;
    if (pick < weight) return normalizeObservationTowerTier(tier, raw);
    pick -= weight;
  }
  return normalizeObservationTowerTier(pool[pool.length - 1], raw);
}

function getObservationTowerCfg(cfg?) {
  const raw = cfg?.hogwartsObservationTower && typeof cfg.hogwartsObservationTower === "object" ? cfg.hogwartsObservationTower : {};
  const tier = raw.tierLocked
    ? normalizeObservationTowerTier(raw, raw)
    : pickObservationTowerTier(raw);
  return {
    targetBricks: tier.targetBricks,
    minPlayers: tier.minPlayers,
    housePoints: tier.housePoints,
    durationMs: Math.max(30000, Number(raw.durationMs || 60000)),
    rewardExp: normalizeRewardExp(raw.rewardExp ?? 150),
    maxPerUser: Math.max(1, Number(raw.maxPerUser || OBSERVATION_TOWER_DEFAULT_MAX_PER_USER)),
    minLetters: Math.max(1, Number(raw.minLetters || 5)),
  };
}

function syncObservationTowerSpawnCfgFromGame(cfg?, game?) {
  if (!cfg || !game || game.type !== "hogwartsObservationTower") return cfg;
  const housePoints = Math.max(0, Math.floor(Number(game.housePoints) || 0));
  const targetBricks = Math.max(1, Math.floor(Number(game.targetBricks) || OBSERVATION_TOWER_DEFAULT_TARGET_BRICKS));
  const minPlayers = getObservationTowerMinPlayers(game);
  if (cfg.hogwartsHouseChannelMeta && typeof cfg.hogwartsHouseChannelMeta === "object") {
    cfg.hogwartsHouseChannelMeta = {
      ...cfg.hogwartsHouseChannelMeta,
      housePoints: housePoints || cfg.hogwartsHouseChannelMeta.housePoints,
    };
  }
  if (cfg.hogwartsObservationTower && typeof cfg.hogwartsObservationTower === "object") {
    cfg.hogwartsObservationTower = {
      ...cfg.hogwartsObservationTower,
      targetBricks,
      minPlayers,
      housePoints,
      tierLocked: true,
    };
  }
  return cfg;
}

function getObservationTowerLetterCount(raw?) {
      const cleaned = String(raw || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/<a?:[\w~]+:\d+>/g, " ")
    .replace(/https?:\/\/\S+/gi, " ");
  const letters = cleaned
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .match(/\p{L}/gu);
  return letters ? letters.length : 0;
}

function mergeObservationTowerRecountWithLive(liveGame?, recounted?) {
  const liveParticipants = serializeObservationTowerParticipants(liveGame?.participantCounts);
  const liveHouses = serializeObservationTowerParticipantHouses(liveGame?.participantHouses);
  const outParticipants = { ...liveParticipants };
  const outHouses = { ...liveHouses };
  for (const [uid, n] of Object.entries(recounted?.participantCounts || {})) {
    outParticipants[uid] = Math.max(Number(outParticipants[uid] || 0), Number(n || 0));
  }
  for (const [uid, hid] of Object.entries(recounted?.participantHouses || {})) {
    if (hid) outHouses[uid] = hid;
  }
  const maxPerUser = getObservationTowerMaxPerUser(liveGame);
  const targetBricks = getObservationTowerTargetBricks(liveGame);
    const outBricks = recomputeObservationTowerHouseBrickCounts(
    outParticipants,
    outHouses,
    maxPerUser,
    targetBricks,
  );
  return {
    houseBrickCounts: serializeObservationTowerHouseBrickCounts(outBricks),
    participantCounts: serializeObservationTowerParticipants(outParticipants),
    participantHouses: serializeObservationTowerParticipantHouses(outHouses),
    hadParticipation:
      Boolean(recounted?.hadParticipation) ||
      Boolean(liveGame?.hadParticipation) ||
      Object.keys(outParticipants).length > 0,
  };
}

function serializeObservationTowerParticipants(participantCounts?) {
  const out: Record<string, any> = {};
  const source = participantCounts instanceof Map ? participantCounts.entries() : Object.entries(participantCounts || {});
  for (const [userId, count] of source) {
    const uid = String(userId || "").trim();
    const n = Math.max(0, Math.floor(Number(count || 0)));
    if (uid && n > 0) out[uid] = n;
  }
  return out;
}

function getObservationTowerParticipantUserIds(game?, houseId = "") {
  const counts = serializeObservationTowerParticipants(game?.participantCounts);
  const hid = normalizeHogwartsHouseId(houseId);
  const houses = game?.participantHouses;
  const out = [];
  for (const userId of Object.keys(counts)) {
    if (hid) {
      let userHouse = "";
      if (houses instanceof Map) userHouse = String(houses.get(userId) || "").trim();
      else if (houses && typeof houses === "object") userHouse = String(houses[userId] || "").trim();
      const normalizedUserHouse = normalizeHogwartsHouseId(userHouse);
      if (normalizedUserHouse && normalizedUserHouse !== hid) continue;
    }
    out.push(userId);
  }
  return out;
}

async function persistObservationTowerState(client?, cfg?, game?) {
  const soloHouseId = String(game.soloHouseId || game.hogwartsHouseChannel?.soloHouseId || cfg?.hogwartsHouseChannelMeta?.soloHouseId || "").trim();
  const basilisk = game?.basilisk && typeof game.basilisk === "object"
    ? {
        scope: String(game.basilisk.scope || ""),
        mode: String(game.basilisk.mode || ""),
        blockedHouseIds: Array.isArray(game.basilisk.blockedHouseIds) ? game.basilisk.blockedHouseIds.map(String) : [],
        blockedUserIds: Array.isArray(game.basilisk.blockedUserIds) ? game.basilisk.blockedUserIds.map(String) : [],
        struckHouseId: String(game.basilisk.struckHouseId || ""),
        announceHouseId: String(game.basilisk.announceHouseId || ""),
        announceEndOnFinish: game.basilisk.announceEndOnFinish === true,
        endedAnnounceHouseId: String(game.basilisk.endedAnnounceHouseId || "").trim(),
        endedAnnounceScope: String(game.basilisk.endedAnnounceScope || "").trim(),
      }
    : null;
  await saveActiveGame(client, cfg, {
    type: "hogwartsObservationTower",
    target: JSON.stringify({
      targetBricks: game.targetBricks,
      houseBrickCounts: serializeObservationTowerHouseBrickCounts(game.houseBrickCounts),
      participantCounts: serializeObservationTowerParticipants(game.participantCounts),
      participantHouses: serializeObservationTowerParticipantHouses(game.participantHouses),
      maxPerUser: game.maxPerUser,
      minLetters: game.minLetters,
      minPlayers: game.minPlayers,
      housePoints: Math.max(0, Math.floor(Number(game.housePoints) || 0)),
      soloHouseId,
      basilisk,
    }),
    rewardExp: game.rewardExp,
    startedAt: new Date(game.startedAt),
    endsAt: new Date(game.endsAt),
    gameMessageId: game.gameMessageId || null,
  });
}

function restoreObservationTowerBasiliskFromParsed(parsed?) {
  const raw = parsed?.basilisk;
  if (!raw || typeof raw !== "object") return null;
  return {
    scope: String(raw.scope || ""),
    mode: String(raw.mode || ""),
    blockedHouseIds: Array.isArray(raw.blockedHouseIds) ? raw.blockedHouseIds.map(String) : [],
    blockedUserIds: Array.isArray(raw.blockedUserIds) ? raw.blockedUserIds.map(String) : [],
    struckHouseId: String(raw.struckHouseId || ""),
    announceHouseId: String(raw.announceHouseId || ""),
    announceEndOnFinish: raw.announceEndOnFinish === true,
    endedAnnounceHouseId: String(raw.endedAnnounceHouseId || "").trim(),
    endedAnnounceScope: String(raw.endedAnnounceScope || "").trim(),
  };
}

function getObservationTowerTopBuilders(participantCounts?, limit = 5) {
  return Object.entries(serializeObservationTowerParticipants(participantCounts))
    .sort((a?, b?) => Number(b[1] || 0) - Number(a[1] || 0))
    .slice(0, limit)
    .map(([userId, count]) => `<@${userId}> (${count})`);
}

async function awardObservationTowerParticipants(client?, cfg?, guild?, participantCounts?, rewardExp?, housePoints?, unsortedHousePoints?, soloHouseId = "") {
  const awarded = [];
  const houseAwarded = [];
  let allHousesAwardCount = 0;
  const guildId = guild?.id;
  const skipPerUserHousePoints = Boolean(String(soloHouseId || "").trim());
  for (const [userId, count] of Object.entries(serializeObservationTowerParticipants(participantCounts))) {
    if (!guildId || !userId || Number(count || 0) <= 0) continue;
    const member = await getGuildMemberCached(guild, userId, { ttlMs: 20_000 });
    const ignoreExp = await shouldIgnoreExpForMember({ guildId, member, channelId: cfg.channelId });
    if (ignoreExp) continue;
    const result = await addExpWithLevel(guild, userId, rewardExp, false, true).catch((err?) => {
      warnMinigame(err);
      return null;
    });
    if (result) awarded.push(userId);
    if (!skipPerUserHousePoints) {
      const houseAward = await awardHogwartsHousePointsForWinner(client, guildId, userId, "hogwartsObservationTower", housePoints, unsortedHousePoints);
      if (houseAward) houseAwarded.push(userId);
      if (houseAward?.allHouses) allHousesAwardCount += 1;
    }
  }
  return { expAwarded: awarded, houseAwarded, allHousesAwardCount };
}

function tryClaimObservationTowerFinish(game?, channelId?) {
  if (!game || game._finishEmbedSent || game._finishClaimed || game._finishAwardsGiven) return false;
  const chId = String(channelId || "").trim();
  if (!tryClaimMinigameChannelClose(chId)) return false;
  game._finishClaimed = true;
  clearMinigameRoundTimers(game);
  if (chId) {
    activeGames.delete(chId);
    clearNoParticipationDelay(chId);
  }
  return true;
}

function tryClaimObservationTowerEmbed(game?) {
  if (!game || game._finishEmbedSent) return false;
  game._finishEmbedSent = true;
  return true;
}

function tryClaimObservationTowerAwards(game?) {
  if (!game || game._finishAwardsGiven) return false;
  game._finishAwardsGiven = true;
  return true;
}

function observationTowerMessageAlreadyProcessed(game?, messageId?) {
  const mid = String(messageId || "").trim();
  if (!mid || !game) return false;
  if (!game._processedBrickMessageIds) game._processedBrickMessageIds = new Set();
  if (game._processedBrickMessageIds.has(mid)) return true;
  game._processedBrickMessageIds.add(mid);
  if (game._processedBrickMessageIds.size > 400) {
    const drop = game._processedBrickMessageIds.size - 300;
    for (const id of game._processedBrickMessageIds) {
      game._processedBrickMessageIds.delete(id);
      if (drop <= 0) break;
    }
  }
  return false;
}

async function fetchObservationTowerMessagesPage(channel?, opts?) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const batch = await channel.messages.fetch(opts);
      if (batch?.size) return batch;
      return batch || null;
    } catch (err) {
      const status = Number(err?.status || err?.httpStatus || 0);
      const retryable = status === 429 || status >= 500 || status === 0;
      if (!retryable || attempt >= 3) {
        warnMinigame(err);
        return null;
      }
      const retryAfterMs = Math.max(
        350,
        Math.min(5_000, Number(err?.retryAfter || err?.data?.retry_after || 0) * 1000 || 400 * (attempt + 1)),
      );
      await new Promise((resolve?) => setTimeout(resolve, retryAfterMs));
    }
  }
  return null;
}

async function fetchObservationTowerRoundMessages(channel?, game?) {
  const out = [];
  if (!channel?.messages?.fetch) return { messages: out, complete: false };
  const afterId = String(game?.gameMessageId || "").trim();
  const endsAt = Number(game?.endsAt) || Date.now();
  const startedAt = Number(game?.startedAt) || 0;
  let before;
  let reachedStart = false;
  let truncated = false;
  const maxPages = 50;
  for (let page = 0; page < maxPages; page += 1) {
    const opts: Record<string, any> = { limit: 100 };
    if (before) opts.before = before;
    const batch = await fetchObservationTowerMessagesPage(channel, opts);
    if (!batch || !batch.size) {
      truncated = true;
      break;
    }
    const arr = [...batch.values()];
    let pageReachedStart = false;
    for (const msg of arr) {
      if (!msg) continue;
      const id = String(msg.id || "");
      const ts = Number(msg.createdTimestamp || 0);
      if (afterId) {
        try {
          if (id === afterId || BigInt(id) <= BigInt(afterId)) {
            pageReachedStart = true;
            continue;
          }
        } catch {
          if (id === afterId) {
            pageReachedStart = true;
            continue;
          }
        }
      }
      if (startedAt && ts && ts < startedAt - 2000) {
        pageReachedStart = true;
        continue;
      }
      if (ts && ts > endsAt) continue;
      out.push(msg);
    }
    if (pageReachedStart) reachedStart = true;
    const oldest = arr.reduce((acc?, msg?) => {
      if (!acc) return msg;
      const a = Number(acc.createdTimestamp || 0);
      const b = Number(msg.createdTimestamp || 0);
      if (b < a) return msg;
      if (b === a && String(msg.id) < String(acc.id)) return msg;
      return acc;
    }, null);
    before = oldest ? String(oldest.id) : "";
    if (!before || reachedStart || batch.size < 100) break;
    if (page === maxPages - 1) truncated = true;
  }
  const seen = new Set();
  const unique = [];
  for (const msg of out) {
    const id = String(msg?.id || "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push(msg);
  }
  unique.sort(
    (a?, b?) => Number(a.createdTimestamp || 0) - Number(b.createdTimestamp || 0) || String(a.id).localeCompare(String(b.id)),
  );
  const complete = !truncated && (reachedStart || (!afterId && !startedAt));
  return { messages: unique, complete };
}

async function recountObservationTowerBricks(channel?, game?, client?) {
  const houseBrickCounts = emptyObservationTowerHouseBrickCounts();
  const participantCounts: Record<string, any> = {};
  const participantHouses: Record<string, any> = {};
  const maxPerUser = Math.max(1, Math.floor(Number(game?.maxPerUser) || OBSERVATION_TOWER_DEFAULT_MAX_PER_USER));
  const minLetters = Math.max(1, Math.floor(Number(game?.minLetters) || 5));
  const targetBricks = Math.max(1, Math.floor(Number(game?.targetBricks) || OBSERVATION_TOWER_DEFAULT_TARGET_BRICKS));
  const soloHouseId = String(game?.soloHouseId || game?.hogwartsHouseChannel?.soloHouseId || "").trim();
  const guild = channel?.guild;
  const guildId = String(guild?.id || "").trim();
  const houseCache = new Map();
  const basiliskCache = new Map();
  let hadParticipation = false;

  const fetched = await fetchObservationTowerRoundMessages(channel, game);
  const messages = Array.isArray(fetched?.messages) ? fetched.messages : [];
  const fetchComplete = fetched?.complete === true;
  const tallyGame = {
    ...game,
    maxPerUser,
    targetBricks,
    minPlayers: getObservationTowerMinPlayers(game),
    participantCounts,
    participantHouses,
    houseBrickCounts,
  };
  for (const message of messages) {
    if (!message || message.author?.bot) continue;
    const content = String(message.content || "");
    if (getObservationTowerLetterCount(content) < minLetters) continue;
    const userId = String(message.author?.id || "").trim();
    if (!userId || !guildId) continue;

        if (game?.basilisk) {
      let blocked = basiliskCache.get(userId);
      if (blocked === undefined) {
        try {
          const { isBasiliskBlockedForUser } = require("../Community/hogwartsBasiliskService") as typeof import("../Community/hogwartsBasiliskService");
          blocked = await isBasiliskBlockedForUser(client, guildId, userId, game);
        } catch (_) {
          blocked = false;
        }
        basiliskCache.set(userId, Boolean(blocked));
      }
      if (blocked) continue;
    }

    let houseId = houseCache.get(userId);
    if (houseId === undefined) {
      const member =
        message.member ||
        (await getGuildMemberCached(guild, userId, { ttlMs: 30_000 }).catch(() => null));
      houseId = await resolveHogwartsSortedHouse(guildId, userId, hogwartsHousePointsDedupeKey(client), {
        client,
        member,
      });
      houseId = normalizeHogwartsHouseId(houseId) || "";
      houseCache.set(userId, houseId);
    }
    if (!houseId) continue;
    if (soloHouseId && houseId !== soloHouseId) continue;

    const applied = applyObservationTowerBrickCredit(tallyGame, userId, houseId);
    if (!applied?.ok) continue;
    tallyGame.participantCounts = applied.participantCounts;
    tallyGame.participantHouses = applied.participantHouses;
    tallyGame.houseBrickCounts = applied.houseBrickCounts;
    hadParticipation = true;
  }

  syncObservationTowerBricksToUserCaps(tallyGame);
  const recounted = {
    houseBrickCounts: serializeObservationTowerHouseBrickCounts(tallyGame.houseBrickCounts),
    participantCounts: serializeObservationTowerParticipants(tallyGame.participantCounts),
    participantHouses: serializeObservationTowerParticipantHouses(tallyGame.participantHouses),
    hadParticipation,
  };
      if (!fetchComplete) {
    let liveForMerge = game;
    if (game?.basilisk && guildId) {
      try {
        const { isBasiliskBlockedForUser } = require("../Community/hogwartsBasiliskService") as typeof import("../Community/hogwartsBasiliskService");
        const liveParticipants = serializeObservationTowerParticipants(game.participantCounts);
        const liveHouses = serializeObservationTowerParticipantHouses(game.participantHouses);
        for (const uid of Object.keys(liveParticipants)) {
          if (await isBasiliskBlockedForUser(client, guildId, uid, game)) {
            delete liveParticipants[uid];
            delete liveHouses[uid];
          }
        }
        liveForMerge = {
          ...game,
          participantCounts: liveParticipants,
          participantHouses: liveHouses,
        };
      } catch (_) {
        liveForMerge = game;
      }
    }
    const merged = mergeObservationTowerRecountWithLive(liveForMerge, recounted);
    return {
      ...merged,
      houseBrickCounts: recomputeObservationTowerHouseBrickCounts(
        merged.participantCounts,
        merged.participantHouses,
        maxPerUser,
        targetBricks,
      ),
    };
  }
  return recounted;
}

async function awardObservationTowerCompletedHouses(client?, guildId?, game?, housePoints?) {
  const points = Math.max(0, Math.floor(Number(housePoints) || 0));
  const awarded = [];
  if (points <= 0 || !guildId || !game) return awarded;
  const soloHouseId = String(game.soloHouseId || game.hogwartsHouseChannel?.soloHouseId || "").trim();
  const houseIds = soloHouseId ? [soloHouseId] : HOGWARTS_HOUSE_IDS.slice();
  for (const houseId of houseIds) {
    if (!isObservationTowerHouseComplete(houseId, game)) continue;
    const houseAward = await awardHogwartsHousePointsToHouse(
      client,
      guildId,
      houseId,
      "hogwartsObservationTower",
      points,
      { participantUserIds: getObservationTowerParticipantUserIds(game, houseId) },
    );
    if (houseAward) {
      awarded.push({
        houseId,
        label: getHouseMeta(houseId)?.label || houseId,
        points: Number(houseAward.points) || points,
        basePoints: Number(houseAward.basePoints) || points,
        consumableMultiplier: Number(houseAward.consumableMultiplier) || 1,
        consumableLabels: Array.isArray(houseAward.consumableLabels) ? houseAward.consumableLabels : [],
      });
    }
  }
  return awarded;
}

async function finishObservationTowerTimeout(client?, cfg?, channelId?, channel?, game?) {
  if (!game || game._finishClaimed || game._finishEmbedSent) return;
  const chId = String(channelId || "").trim();
  if (!tryClaimObservationTowerFinish(game, chId)) return;
  game._recounting = true;
  try {
    if (channel) {
      await sendMinigameMessage(channel, {
        embeds: [buildObservationTowerStopEmbed()],
      }).catch(() => { });
    }

        await new Promise((resolve?) => setTimeout(resolve, 750));

    if (channel?.messages?.fetch) {
      const recounted = await recountObservationTowerBricks(channel, game, client).catch((err?) => {
        warnMinigame(err);
        return null;
      });
      if (recounted) {
        game.houseBrickCounts = recounted.houseBrickCounts;
        game.participantCounts = recounted.participantCounts;
        game.participantHouses = recounted.participantHouses;
        if (recounted.hadParticipation) game.hadParticipation = true;
      }
    }

    syncObservationTowerBricksToUserCaps(game);
    recordNoParticipationIfNeeded(chId, game);

    if (isObservationTowerComplete(game)) {
            await finishObservationTowerSuccess(client, cfg, channel, game);
      return;
    }

    if (!tryClaimObservationTowerEmbed(game)) return;
    const soloHouseId = String(game.soloHouseId || game.hogwartsHouseChannel?.soloHouseId || "").trim();
    const housePoints = Math.max(0, Math.floor(Number(game.housePoints) || 0));
    let guildId = String(cfg?.guildId || "").trim();
    if (!guildId) guildId = String(channel?.guild?.id || "").trim();

    let awardedHouses = [];
    if (housePoints > 0 && guildId && tryClaimObservationTowerAwards(game)) {
      awardedHouses = await awardObservationTowerCompletedHouses(client, guildId, game, housePoints);
    }

    const timeoutEmbed = buildObservationTowerTimeoutEmbed(
      game.houseBrickCounts,
      game.targetBricks,
      soloHouseId,
      {
        housePoints,
        awardedHouses,
        awardedHouseLabels: awardedHouses.map((row?) => row.label),
        game,
      },
    );
    if (timeoutEmbed && channel) {
      await sendMinigameMessage(channel, { embeds: [timeoutEmbed] }).catch(() => { });
    }
    await clearActiveGame(client, { ...cfg, channelId: chId, guildId });
  } finally {
    endMinigameWinClose(chId);
  }
}

async function finishObservationTowerSuccess(client?, cfg?, channel?, game?) {
  if (!channel?.guild || !game || game._finishEmbedSent || game._finishAwardsGiven) return;
  const channelId = String(cfg?.channelId || "").trim();
  if (!game._finishClaimed && !tryClaimObservationTowerFinish(game, channelId)) return;
  if (!tryClaimObservationTowerAwards(game)) return;
  if (!tryClaimObservationTowerEmbed(game)) return;
  try {
    await clearActiveGame(client, { ...cfg, guildId: channel.guild.id, channelId });
    const soloHouseId = String(game.soloHouseId || game.hogwartsHouseChannel?.soloHouseId || "").trim();
    const housePoints = Math.max(0, Math.floor(Number(game.housePoints) || 0));
    const unsortedHousePoints = soloHouseId ? 0 : getHogwartsUnsortedHousePointReward(cfg, "hogwartsObservationTower");
    const awarded = await awardObservationTowerParticipants(
      client,
      cfg,
      channel.guild,
      game.participantCounts,
      game.rewardExp,
      0,
      unsortedHousePoints,
      soloHouseId,
    );
    let soloHouseAward = null;
    let housesAwarded = 0;
    if (soloHouseId && housePoints > 0) {
      soloHouseAward = await awardHogwartsHousePointsToHouse(
        client,
        channel.guild.id,
        soloHouseId,
        "hogwartsObservationTower",
        housePoints,
        { participantUserIds: getObservationTowerParticipantUserIds(game, soloHouseId) },
      );
      housesAwarded = soloHouseAward ? 1 : 0;
    } else if (!soloHouseId && housePoints > 0) {
      for (const houseId of HOGWARTS_HOUSE_IDS) {
        if (!isObservationTowerHouseComplete(houseId, game)) continue;
        const houseAward = await awardHogwartsHousePointsToHouse(
          client,
          channel.guild.id,
          houseId,
          "hogwartsObservationTower",
          housePoints,
          { participantUserIds: getObservationTowerParticipantUserIds(game, houseId) },
        );
        if (houseAward) housesAwarded += 1;
      }
    }
    const topLines = getObservationTowerTopBuilders(game.participantCounts, 5);
    const displayHousePoints = soloHouseId
      ? (soloHouseAward ? Number(soloHouseAward.points) || housePoints : 0)
      : (housesAwarded > 0 ? housePoints : 0);
    await sendMinigameMessage(channel, {
      embeds: [
        buildObservationTowerSuccessEmbed(
          game.houseBrickCounts,
          game.targetBricks,
          awarded.expAwarded.length || Object.keys(serializeObservationTowerParticipants(game.participantCounts)).length,
          game.rewardExp,
          topLines,
          displayHousePoints,
          awarded.allHousesAwardCount ? unsortedHousePoints : 0,
          soloHouseId,
        ),
      ],
    }).catch(() => { });
  } finally {
    activeGames.delete(channelId);
    endMinigameWinClose(channelId);
  }
}

async function processObservationTowerMessage(message?, client?, cfg?, game?) {
  if (await rejectIfHogwartsEventBlacklistedMessage(message)) return true;
  if (await rejectIfBasiliskBlockedMessage(message, game)) return true;
  if (game?._finishClaimed || game?._finishEmbedSent || game?._finishAwardsGiven || game?._recounting) return true;
  const content = String(message.content || "");
  if (getObservationTowerLetterCount(content) < Number(game.minLetters || 5)) {
    void reactMinigameWrongEmoji(message, game);
    return true;
  }
  const userId = String(message.author.id || "");
  const towerMember =
    message.member ||
    (await message.guild.members.fetch(message.author.id).catch(() => null));
  const houseId = await resolveHogwartsSortedHouse(message.guild.id, userId, hogwartsHousePointsDedupeKey(message.client), {
    client: message.client,
    member: towerMember,
  });
  if (!houseId) {
    void reactMinigameWrongEmoji(message, game);
    return true;
  }
  const soloHouseId = String(game.soloHouseId || game.hogwartsHouseChannel?.soloHouseId || "").trim();
  if (soloHouseId && houseId !== soloHouseId) {
    void reactMinigameWrongEmoji(message, game);
    return true;
  }

      const chId = String(cfg?.channelId || message.channelId || "");
  return runMinigameChannelExclusive(chId, async () => {
    if (channelWinClosing.has(chId)) return true;
    const liveGame = activeGames.get(chId);
    if (!liveGame || liveGame.type !== "hogwartsObservationTower") return true;
    if (liveGame._finishClaimed || liveGame._finishEmbedSent || liveGame._finishAwardsGiven || liveGame._recounting) return true;
    if (observationTowerMessageAlreadyProcessed(liveGame, message.id)) return true;

    const applied = applyObservationTowerBrickCredit(liveGame, userId, houseId);
    if (!applied?.ok) {
      void message.react(MINIGAME_COOLDOWN_EMOJI).catch(() => { });
      return true;
    }
    liveGame.participantCounts = applied.participantCounts;
    liveGame.participantHouses = applied.participantHouses;
    liveGame.houseBrickCounts = applied.houseBrickCounts;
    liveGame.hadParticipation = true;
    if (isObservationTowerComplete(liveGame)) {
      await persistObservationTowerState(client, cfg, liveGame).catch(() => { });
      if (!tryClaimObservationTowerFinish(liveGame, cfg.channelId)) {
        void message.react(MINIGAME_COOLDOWN_EMOJI).catch(() => { });
        return true;
      }
      void message.react(MINIGAME_WIN_EMOJI).catch(() => { });
      await finishObservationTowerSuccess(client, cfg, message.channel, liveGame);
      return true;
    }
        void message.react(OBSERVATION_TOWER_BRICK_EMOJI).catch(() => { });
    void persistObservationTowerState(client, cfg, liveGame).catch(() => { });
    return true;
  });
}

async function startObservationTowerGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  channelNoRehydrateUntil.delete(String(channelId));
  if (!cfg?.hogwartsObservationTower?.eventLive || !cfg?.hogwartsObservationTower?.unlocked) return false;
  const towerCfg = getObservationTowerCfg(cfg);
  const soloHouseId = String(cfg?.hogwartsHouseChannelMeta?.soloHouseId || "").trim();
  const housePoints = Math.max(0, Math.floor(Number(towerCfg.housePoints) || 0));
  const unsortedHousePoints = soloHouseId ? 0 : getHogwartsUnsortedHousePointReward(cfg, "hogwartsObservationTower");
  const channel = await getChannelCached(client, channelId);
  if (!channel?.guild) return false;

  if (cfg.roleId)
    await sendMinigameRolePing(channel, cfg);
  const gameMessage = await sendMinigameMessage(channel, {
    embeds: [
      buildObservationTowerEmbed(
        towerCfg.targetBricks,
        towerCfg.durationMs,
        towerCfg.rewardExp,
        towerCfg.maxPerUser,
        towerCfg.minLetters,
        housePoints,
        unsortedHousePoints,
        soloHouseId,
        towerCfg.minPlayers,
      ),
    ],
  }).catch(() => null);
  if (!gameMessage) return false;

  const startedAt = Date.now();
  const game = {
    type: "hogwartsObservationTower",
    targetBricks: towerCfg.targetBricks,
    houseBrickCounts: emptyObservationTowerHouseBrickCounts(),
    participantCounts: {},
    participantHouses: {},
    maxPerUser: towerCfg.maxPerUser,
    minLetters: towerCfg.minLetters,
    minPlayers: towerCfg.minPlayers,
    housePoints,
    rewardExp: towerCfg.rewardExp,
    startedAt,
    endsAt: startedAt + towerCfg.durationMs,
    timeout: null,
    gameMessageId: gameMessage.id,
    soloHouseId: soloHouseId || "",
    hogwartsHouseChannel: cfg?.hogwartsHouseChannelMeta || null,
  };

  const timeout = scheduleMinigameRoundTimeout(client, cfg, channelId, channel, towerCfg.durationMs);
  game.timeout = timeout;

  activeGames.set(channelId, game);
  await persistObservationTowerState(client, cfg, game);
  stampMinigameBurrobirraApplies(channelId, client);
  markSent(channelId);
  return true;
}

function shuffleArray(arr?) {
  const a = Array.isArray(arr) ? [...arr] : [];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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
  const durationMs = applyBurrobirraStrongDurationMs(client, channelId, Math.max(60000, Number(cfg?.drivingQuiz?.durationMs || 180000)));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  if (cfg.roleId)
    await sendMinigameRolePing(channel, cfg);
  const drivingAttachment = buildDrivingQuizPromptImage(row);
  const drivingEmbed = buildDrivingQuizEmbed(row, rewardExp, durationMs);
  if (drivingAttachment) {
    drivingEmbed.setImage(`attachment://${drivingAttachment.name}`);
  }
  const gameMessage = await sendMinigameMessage(channel, { embeds: [drivingEmbed], files: drivingAttachment ? [drivingAttachment] : [], }, MINIGAME_QUESTION_BURROBIRRA).catch(() => null);

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

  stampMinigameBurrobirraApplies(channelId, client);
  markSent(channelId);
  return true;
}

async function startMathExpressionGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const row = createMathQuestion();
  if (!row?.expression) return false;

  const rewardExp = normalizeRewardExp(cfg?.mathExpression?.rewardExp ?? 100);
  const durationMs = applyBurrobirraStrongDurationMs(client, channelId, Math.max(60000, Number(cfg?.mathExpression?.durationMs || 150000)));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  if (cfg.roleId)
    await sendMinigameRolePing(channel, cfg);
  const expressionAttachment = buildMathExpressionImageAttachment(row.expression);
  const files = expressionAttachment ? [expressionAttachment] : [];
  const gameMessage = await sendMinigameMessage(channel, { embeds: [buildMathExpressionEmbed(row.expression, rewardExp, durationMs, expressionAttachment?.name || null,),], files, }, MINIGAME_QUESTION_BURROBIRRA).catch(() => null);

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

  stampMinigameBurrobirraApplies(channelId, client);
  markSent(channelId);
  return true;
}

async function pickRandomFindBotChannel(guild?, requiredRoleId?, excludeChannelId = null, excludedChannelIds = null) {
  if (!guild) return null;
  await guild.channels.fetch().catch(() => {});
  const me = guild.members.me || guild.members.cache.get(guild.client?.user?.id);
  const roleToCheck = requiredRoleId ? guild.roles.cache.get(requiredRoleId) : guild.roles.everyone;
  const excludedSet = new Set(
    [excludeChannelId].filter(Boolean).concat(Array.isArray(excludedChannelIds) ? excludedChannelIds.filter((id?) => id != null && String(id).trim()) : []),
  );

  const channels = guild.channels.cache.filter((channel?) => {
    if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) return false;
    if (excludedSet.has(channel.id)) return false;
    if (!channel.viewable) return false;
    if (me && !me.permissions?.has(PermissionsBitField.Flags.Administrator) && !channel.permissionsFor(me)?.has([PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages])) return false;
    const memberPerms = channel.permissionsFor(roleToCheck);
    if (!memberPerms?.has(PermissionsBitField.Flags.ViewChannel)) return false;
    return true;
  });

  const list = Array.from(channels.values());
  return pickRandomItem(list);
}

const findBotVoiceSessionByGuild = new Map();

function countHumanMembersInVoiceChannel(channel?, botUserId = "") {
  if (!channel?.members) return 0;
  const botId = String(botUserId || "");
  return channel.members.filter((member?) => !member.user?.bot && String(member.id) !== botId).size;
}

function guildVoiceBusyForFindBotMinigame(guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid || findBotVoiceSessionByGuild.has(gid)) return false;
  try {
    const { getVoiceConnection, VoiceConnectionStatus } = require("@discordjs/voice") as typeof import("@discordjs/voice");
    const conn = getVoiceConnection(gid);
    return Boolean(conn && conn.state?.status !== VoiceConnectionStatus.Destroyed);
  } catch {
    return false;
  }
}

async function leaveFindBotVoiceChannel(guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return;
  const row = findBotVoiceSessionByGuild.get(gid);
  if (row?.connection) {
    try {
      row.connection.destroy();
    } catch (_) {}
  }
  findBotVoiceSessionByGuild.delete(gid);
}

function hasFindBotVoiceSession(guildId?, channelId = "") {
  const gid = String(guildId || "").trim();
  if (!gid) return false;
  const session = findBotVoiceSessionByGuild.get(gid);
  if (!session) return false;
  const cid = String(channelId || "").trim();
  if (!cid) return true;
  return String(session.channelId || "") === cid;
}

async function joinFindBotVoiceChannel(guild?, voiceChannel?) {
  const gid = String(guild?.id || "").trim();
  if (!gid || !voiceChannel?.id) return false;
  const { joinVoiceChannel, VoiceConnectionStatus, entersState } = require("@discordjs/voice") as typeof import("@discordjs/voice");
  await leaveFindBotVoiceChannel(gid);
  const liveGuild = guild?.voiceAdapterCreator ? guild : await guild.fetch().catch(() => guild);
  if (!liveGuild?.voiceAdapterCreator) return false;
  const channelId = String(voiceChannel.id);
  /* Pending PRIMA di join: voiceStateUpdate “bot solo in VC” altrimenti chiama leaveTtsGuild e butta fuori il minigame. */
  findBotVoiceSessionByGuild.set(gid, {
    channelId,
    connection: null,
    pending: true,
  });
  try {
    const connection = joinVoiceChannel({
      channelId,
      guildId: gid,
      adapterCreator: liveGuild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: true,
    });
    await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
    findBotVoiceSessionByGuild.set(gid, {
      channelId,
      connection,
    });
    return true;
  } catch (err) {
    warnMinigame(err);
    await leaveFindBotVoiceChannel(gid);
    return false;
  }
}

async function pickRandomEmptyVoiceChannel(guild?, requiredRoleId?, excludedChannelIds = null) {
  if (!guild) return null;
  await guild.channels.fetch().catch(() => {});
  const me = guild.members.me || guild.members.cache.get(guild.client?.user?.id);
  const botUserId = String(me?.id || guild.client?.user?.id || "");
  const roleToCheck = requiredRoleId ? guild.roles.cache.get(requiredRoleId) : guild.roles.everyone;
  const client = guild.client;

  const channels = guild.channels.cache.filter((channel?) => {
    if (channel.type !== ChannelType.GuildVoice) return false;
    if (!isVoiceChannelEligibleForFindBotMinigame(channel, client, excludedChannelIds)) return false;
    if (!channel.viewable) return false;
    if (countHumanMembersInVoiceChannel(channel, botUserId) > 0) return false;
    const otherBots = channel.members?.filter((member?) => member.user?.bot && String(member.id) !== botUserId).size || 0;
    if (otherBots > 0) return false;
    if (
      me &&
      !me.permissions?.has(PermissionsBitField.Flags.Administrator) &&
      !channel.permissionsFor(me)?.has([PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect])
    ) {
      return false;
    }
    const memberPerms = channel.permissionsFor(roleToCheck);
    if (!memberPerms?.has([PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect])) return false;
    return true;
  });

  const list = Array.from(channels.values());
  return pickRandomItem(list);
}

function resolveFindBotVoiceBotChannelId(guild?, game?) {
  const session = findBotVoiceSessionByGuild.get(String(guild?.id || "").trim());
  const fromSession = String(session?.channelId || "").trim();
  const fromGame = String(game?.channelId || game?.voiceChannelId || "").trim();
  const me = guild?.members?.me;
  const fromVoice = String(me?.voice?.channelId || "").trim();
  return fromVoice || fromSession || fromGame;
}

function syncFindBotVoiceTargetChannel(guild?, game?, channelId?) {
  const nextId = String(channelId || "").trim();
  if (!game || !nextId) return;
  const prevId = String(game.channelId || game.voiceChannelId || "").trim();
  if (prevId === nextId) return;
  game.channelId = nextId;
  game.voiceChannelId = nextId;
  const gid = String(guild?.id || "").trim();
  const session = findBotVoiceSessionByGuild.get(gid);
  if (session) session.channelId = nextId;
}

function getActiveFindBotVoiceGame(client?) {
  const cfg = getConfig(client);
  const mainChannelId = String(cfg?.channelId || "").trim();
  if (!mainChannelId) return null;
  const game = activeGames.get(mainChannelId);
  if (!game || game.type !== "findBotVoice") return null;
  return { cfg, game, mainChannelId };
}

function shouldDeferTtsLeaveForFindBotVoiceMinigame(client?, guildId?, channelId?) {
  const gid = String(guildId || "").trim();
  const cid = String(channelId || "").trim();
  /* Sessione pending/ready: copre la race join → empty-VC leave prima di activeGames.set */
  if (hasFindBotVoiceSession(gid, cid)) return true;
  const active = getActiveFindBotVoiceGame(client);
  if (!active) return false;
  if (String(active.game.guildId || "") !== gid) return false;
  const guild = client?.guilds?.cache?.get(gid) || null;
  const botVoiceId = guild
    ? resolveFindBotVoiceBotChannelId(guild, active.game)
    : String(active.game.channelId || active.game.voiceChannelId || "");
  if (!cid) return Boolean(botVoiceId);
  return String(botVoiceId || "") === cid;
}

async function startFindBotGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId) return false;
  if (activeGames.has(channelId)) return false;

  const durationMs = applyBurrobirraStrongDurationMs(client, channelId, Math.max(60000, Number(cfg?.findBot?.durationMs || 300000)));
  const rewardExp = normalizeRewardExp(cfg?.findBot?.rewardExp ?? 100);
  const requiredRoleId = cfg?.findBot?.requiredRoleId || null;
  const excludedChannelIds = cfg?.findBot?.excludedChannelIds || null;

  const mainChannel = await getChannelCached(client, channelId);
  if (!mainChannel?.guild) return false;

  let targetChannel = await pickRandomFindBotChannel(mainChannel.guild, requiredRoleId, channelId, excludedChannelIds);
  if (!targetChannel) {
    targetChannel = await pickRandomFindBotChannel(mainChannel.guild, requiredRoleId, null, excludedChannelIds);
  }
  if (!targetChannel) return false;

  const roleId = cfg.roleId;
  await sendMinigameRolePing(mainChannel, cfg, roleId);

  const findBotAttachment = buildPromptImageAttachment("Trova il bot", ["Cerca il messaggio nascosto in un canale del server.", "Clicca il pulsante quando lo trovi!"], "find_bot", "", client, false);
  const findBotEmbed = buildFindBotEmbed(rewardExp, durationMs);
  if (findBotAttachment) findBotEmbed.setImage(`attachment://${findBotAttachment.name}`);
  const mainMessage = await sendMinigameMessage(mainChannel, { embeds: [findBotEmbed], files: findBotAttachment ? [findBotAttachment] : [], }).catch(() => null);

  const customId = `minigame_findbot:${Date.now()}`;
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(customId).setEmoji(`<a:VC_Heart:1448672728822448141>`).setLabel("Clicca qui per vincere!").setStyle(ButtonStyle.Primary),);
  const gameMessage = await sendMinigameMessage(targetChannel, { embeds: [buildFindBotButtonEmbed(rewardExp, durationMs)], components: [row] }).catch((err?) => {
    global.logger?.error?.("[MINIGAMES] FindBot: send to target channel failed", { channelId: targetChannel.id, channelName: targetChannel.name, err: err?.message || err });
    return null;
  });
  if (!gameMessage) return false;

  const timeout = scheduleFindMinigameTimeout(client, cfg, channelId, mainChannel, customId, durationMs, buildTimeoutFindBotEmbed);
  const hintTimeout = await scheduleMinuteHint(client, targetChannel.id, durationMs, channelId,);

  activeGames.set(channelId, {
    type: "findBot",
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    channelId: targetChannel.id,
    messageId: gameMessage?.id || null,
    mainMessageId: mainMessage?.id || null,
    customId,
  });

  await saveActiveGame(client, cfg, {
    type: "findBot",
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    targetChannelId: targetChannel.id,
    gameMessageId: gameMessage?.id || null,
    mainMessageId: mainMessage?.id || null,
    customId,
  });

  stampMinigameBurrobirraApplies(channelId, client);
  markSent(channelId);

  return true;
}

async function startFindBotVoiceGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId) return false;
  if (activeGames.has(channelId)) return false;

  const durationMs = applyBurrobirraStrongDurationMs(client, channelId, Math.max(60000, Number(cfg?.findBotVoice?.durationMs || cfg?.findBot?.durationMs || 300000)));
  const rewardExp = normalizeRewardExp(cfg?.findBotVoice?.rewardExp ?? cfg?.findBot?.rewardExp ?? 100);
  const requiredRoleId = cfg?.findBotVoice?.requiredRoleId || cfg?.findBot?.requiredRoleId || null;
  const excludedChannelIds = cfg?.findBotVoice?.excludedChannelIds || cfg?.findBot?.excludedChannelIds || null;

  const mainChannel = await getChannelCached(client, channelId);
  if (!mainChannel?.guild) return false;
  const guildId = String(mainChannel.guild.id || "");
  if (guildVoiceBusyForFindBotMinigame(guildId)) return false;

  const targetVoice = await pickRandomEmptyVoiceChannel(mainChannel.guild, requiredRoleId, excludedChannelIds);
  if (!targetVoice) return false;

  const joined = await joinFindBotVoiceChannel(mainChannel.guild, targetVoice);
  if (!joined) return false;

  const roleId = cfg.roleId;
  await sendMinigameRolePing(mainChannel, cfg, roleId);

  const attachment = buildPromptImageAttachment(
    "Trova il bot in vocale",
    ["Il bot si è nascosto in una vocale vuota del server.", "Entra in quella vocale per vincere!"],
    "find_bot",
    "",
    client,
    false,
  );
  const introEmbed = buildFindBotVoiceEmbed(rewardExp, durationMs);
  if (attachment) introEmbed.setImage(`attachment://${attachment.name}`);
  const mainMessage = await sendMinigameMessage(mainChannel, {
    embeds: [introEmbed],
    files: attachment ? [attachment] : [],
  }).catch(() => null);

  const customId = `minigame_findbotvoice:${Date.now()}`;
  const timeout = scheduleFindMinigameTimeout(
    client,
    cfg,
    channelId,
    mainChannel,
    customId,
    durationMs,
    buildTimeoutFindBotVoiceEmbed,
  );
  const hintTimeout = await scheduleMinuteHint(client, targetVoice.id, durationMs, channelId);

  activeGames.set(channelId, {
    type: "findBotVoice",
    guildId,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    channelId: targetVoice.id,
    voiceChannelId: targetVoice.id,
    mainMessageId: mainMessage?.id || null,
    customId,
  });

  await saveActiveGame(client, cfg, {
    type: "findBotVoice",
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    targetChannelId: targetVoice.id,
    mainMessageId: mainMessage?.id || null,
    customId,
  });

  stampMinigameBurrobirraApplies(channelId, client);
  markSent(channelId);
  return true;
}

async function startFindScrollGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId) return false;
  if (activeGames.has(channelId)) return false;
  if (!cfg?.findScroll?.eventLive || !cfg?.findScroll?.unlocked) return false;

  const durationMs = applyBurrobirraStrongDurationMs(client, channelId, Math.max(60000, Number(cfg?.findScroll?.durationMs || 300000)));
  const rewardExp = normalizeRewardExp(cfg?.findScroll?.rewardExp ?? 220);
  const requiredRoleId = cfg?.findScroll?.requiredRoleId || IDs.roles.Member || null;
  const excludedChannelIds = cfg?.findScroll?.excludedChannelIds || cfg?.findBot?.excludedChannelIds || null;

  const mainChannel = await getChannelCached(client, channelId);
  if (!mainChannel?.guild) return false;

  let targetChannel = await pickRandomFindBotChannel(mainChannel.guild, requiredRoleId, channelId, excludedChannelIds);
  if (!targetChannel) {
    targetChannel = await pickRandomFindBotChannel(mainChannel.guild, requiredRoleId, null, excludedChannelIds);
  }
  if (!targetChannel) return false;

  const roleId = cfg.roleId;
  await sendMinigameRolePing(mainChannel, cfg, roleId);

  const finaleChaos = cfg?.findScroll?.finaleChaos && typeof cfg.findScroll.finaleChaos === "object"
    ? cfg.findScroll.finaleChaos
    : null;
  const attachment = buildPromptImageAttachment("Trova la pergamena", ["Cerca la pergamena nascosta in un canale del server.", "Clicca il pulsante quando la trovi!"], "find_scroll", "", client, false);
  let introEmbed;
  if (finaleChaos) {
    const minutes = Math.max(1, Math.round(durationMs / 60000));
    const needWinners = Math.max(2, Number(finaleChaos.requiredWinners) || 2);
    const boostLine = finaleChaos.firstSlot
      ? `\n<a:VC_Events:1482706144953897223> **Bonus 1° slot:** boost **2× ${finaleChaos.boostType === "exp" ? "EXP" : "punti casa"} ${finaleChaos.boostScope === "house" ? "di casata" : "personale"}** per **1 ora** (si somma agli altri).`
      : "";
    introEmbed = new EmbedBuilder()
      .setColor(MINIGAME_EMBED_COLOR)
      .setTitle("Caccia alle pergamene <a:VC_Exclamation:1482534702077444217>")
      .setDescription(
        [
          "Una **pergamena** è nascosta in un canale a caso: trovala e premi il bottone!",
          `> <a:VC_pixeltime:1482535344103620771> Hai **${minutes} minuti**.`,
          `> <a:VC_Winner:1482535294757507255> Servono **${needWinners} vincitori** diversi per chiudere il round.`,
          "",
          `**Premi (a ciascuno dei ${needWinners}):**`,
          `• **${Number(finaleChaos.rewardGaleoni) || 0} galeoni**`,
          `• **${Number(finaleChaos.rewardHousePoints) || 0} punti casa** (con multi animale / boost)`,
          boostLine,
        ].filter(Boolean).join("\n"),
      );
  } else {
    introEmbed = buildFindScrollEmbed(rewardExp, durationMs);
  }
  if (attachment) introEmbed.setImage(`attachment://${attachment.name}`);
  const mainMessage = await sendMinigameMessage(mainChannel, { embeds: [introEmbed], files: attachment ? [attachment] : [] }).catch(() => null);

  const customId = `minigame_findscroll:${Date.now()}`;
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(customId).setLabel("Raccogli la pergamena!").setStyle(ButtonStyle.Primary));
  const buttonEmbed = finaleChaos
    ? new EmbedBuilder()
      .setColor(MINIGAME_EMBED_COLOR)
      .setTitle("Hai trovato la pergamena <a:VC_Exclamation:1482534702077444217>")
      .setDescription("Clicca il bottone per raccogliere la pergamena e reclamare i premi!")
    : buildFindScrollButtonEmbed(rewardExp, durationMs);
  const gameMessage = await sendMinigameMessage(targetChannel, { embeds: [buttonEmbed], components: [row] }).catch((err?) => {
    global.logger?.error?.("[MINIGAMES] FindScroll: send to target channel failed", { channelId: targetChannel.id, channelName: targetChannel.name, err: err?.message || err });
    return null;
  });
  if (!gameMessage) return false;

  const timeout = scheduleFindMinigameTimeout(client, cfg, channelId, mainChannel, customId, durationMs, buildTimeoutFindScrollEmbed);
  const hintBefore = finaleChaos?.hintBeforeExpiryMs || 60 * 1000;
  const hintTimeout = await scheduleMinuteHint(client, targetChannel.id, durationMs, channelId, hintBefore);

  activeGames.set(channelId, {
    type: "findScroll",
    rewardExp: finaleChaos ? 0 : rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    channelId: targetChannel.id,
    messageId: gameMessage?.id || null,
    mainMessageId: mainMessage?.id || null,
    customId,
    ...(finaleChaos
      ? {
          finaleChaos: {
            ...finaleChaos,
            requiredWinners: Math.max(2, Number(finaleChaos.requiredWinners) || 2),
            winnerIds: Array.isArray(finaleChaos.winnerIds) ? finaleChaos.winnerIds.map(String) : [],
          },
          mapChannelId: channelId,
        }
      : {}),
  });

  await saveActiveGame(client, cfg, {
    type: "findScroll",
    rewardExp: finaleChaos ? 0 : rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    targetChannelId: targetChannel.id,
    gameMessageId: gameMessage?.id || null,
    mainMessageId: mainMessage?.id || null,
    customId,
    ...(finaleChaos
      ? {
          target: JSON.stringify({
            finaleChaos: {
              ...finaleChaos,
              requiredWinners: Math.max(2, Number(finaleChaos.requiredWinners) || 2),
              winnerIds: Array.isArray(finaleChaos.winnerIds) ? finaleChaos.winnerIds.map(String) : [],
            },
          }),
        }
      : {}),
  });

  stampMinigameBurrobirraApplies(channelId, client);
  markSent(channelId);

  return true;
}

async function startFinaleChaosFindScroll(client?, opts: Record<string, any> = {}) {
  const base = getConfig(client);
  if (!base?.channelId) return false;
  const announceId = String(opts.announceChannelId || base.channelId || "").trim();
  if (!announceId) return false;
    if (activeGames.has(announceId) || activeGames.has(base.channelId)) return false;
  const { CHAOS_FIND_SCROLL_WINNERS } = require("../Community/hogwartsFinaleChaosDayService") as typeof import("../Community/hogwartsFinaleChaosDayService");
  const requiredWinners = Math.max(1, Number(opts.requiredWinners) || Number(CHAOS_FIND_SCROLL_WINNERS) || 1);
  const durationMs = Math.max(60_000, Math.floor(Number(opts.durationMs) || 900000));
  const cfg = {
    ...base,
    roleId: opts.pingRoleId || base.roleId,
    channelId: announceId,
    finaleChaos: true,
    findScroll: {
      ...(base.findScroll && typeof base.findScroll === "object" ? base.findScroll : {}),
      eventLive: true,
      unlocked: true,
      durationMs,
      rewardExp: 0,
      finaleChaos: {
        firstSlot: opts.firstSlot === true,
        boostType: opts.boostType === "exp" ? "exp" : "housePoints",
        boostScope: opts.boostScope === "house" ? "house" : "personal",
        firstSlotBoostDurationMs: Math.max(60_000, Math.floor(Number(opts.firstSlotBoostDurationMs) || 3600000)),
        rewardGaleoni: Math.max(0, Math.floor(Number(opts.rewardGaleoni) || 1000)),
        rewardHousePoints: Math.max(0, Math.floor(Number(opts.rewardHousePoints) || 500)),
        hintBeforeExpiryMs: Math.max(60_000, Math.floor(Number(opts.hintBeforeExpiryMs) || 450000)),
        slotKey: String(opts.slotKey || "").trim(),
        chaosEventKey: String(opts.chaosEventKey || "").trim(),
        requiredWinners,
        winnerIds: [],
      },
    },
  };
  return startFindScrollGame(client, cfg);
}

async function tickFinaleChaosFindScrollHints(client?, chaosCfg?, nowMs = Date.now()) {
  const base = getConfig(client);
  if (!base?.channelId) return;
  for (const [mapChannelId, game] of activeGames.entries()) {
    if (!game || game.type !== "findScroll" || !game.finaleChaos) continue;
    if (game.finaleChaosHintSent) continue;
    const endsAt = Number(game.endsAt) || 0;
    if (!endsAt || nowMs >= endsAt) continue;
    const hintBefore = Math.max(
      60_000,
      Math.floor(
        Number(game.finaleChaos?.hintBeforeExpiryMs) ||
          Number(chaosCfg?.hintBeforeExpiryMs) ||
          450_000,
      ),
    );
    if (nowMs < endsAt - hintBefore) continue;
    const announceChannelId = String(game.mapChannelId || mapChannelId || base.channelId).trim();
    const targetChannelId = String(game.channelId || "").trim();
    if (!announceChannelId || !targetChannelId) continue;
    const mainChannel = await getChannelCached(client, announceChannelId);
    if (!mainChannel) continue;
    game.finaleChaosHintSent = true;
    await sendMinigameMessage(mainChannel, { embeds: [buildMinuteHintEmbed(targetChannelId)] }).catch(() => null);
  }
}

function normalizeHogwartsMemorySequence(value?) {
  return String(value || "")
    .normalize("NFC")
    .replace(/\uFE0F/g, "")
    .replace(/[\s,;|`*_~>"'’·•]+/g, "")
    .trim();
}

function isAbsurdMemoryAcceptsAt(value?) {
  const n = Number(value);
  return !Number.isFinite(n) || n >= 1e15;
}

function memoryEmojiMessageMatches(content?, normalizedSequence?) {
  const want = String(normalizedSequence || "");
  if (!want) return false;
  const raw = String(content || "");
  if (normalizeHogwartsMemorySequence(raw) === want) return true;
  for (const line of raw.split(/\r?\n/)) {
    const n = normalizeHogwartsMemorySequence(line);
    if (n && n === want) return true;
  }
  return false;
}

function displayHogwartsMemorySequence(row?) {
  if (Array.isArray(row?.sequence)) return row.sequence.map((x?) => String(x || "").trim()).filter(Boolean).join(" ");
  return String(row?.sequence || "").trim();
}

function shuffleMemoryEmojiRow(row?) {
  if (!row || typeof row !== "object") return row;
  if (!Array.isArray(row.sequence) || row.sequence.length <= 1) return row;
  return { ...row, sequence: shuffleArray(row.sequence) };
}

function shuffleMemoryTokensDifferentFromAnswer(answerTokens?) {
  const base = (Array.isArray(answerTokens) ? answerTokens : [])
    .map((x?) => String(x || "").trim())
    .filter(Boolean);
  if (base.length <= 1) return base.slice();
  const answerKey = normalizeHogwartsMemorySequence(base.join(" "));
  let next = shuffleArray(base.slice());
  for (let i = 0; i < 10; i += 1) {
    if (normalizeHogwartsMemorySequence(next.join(" ")) !== answerKey) return next;
    next = shuffleArray(base.slice());
  }
  next = base.slice().reverse();
  if (normalizeHogwartsMemorySequence(next.join(" ")) === answerKey && base.length > 2) {
    next = base.slice(1).concat(base[0]);
  }
  return next;
}

function shuffleCipherNumbersDifferentFromAnswer(answerNumbers?) {
  const base = String(answerNumbers || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (base.length <= 1) return base.join(" ");
  const answerKey = base.join(" ");
  let next = shuffleArray(base.slice());
  for (let i = 0; i < 12; i += 1) {
    if (next.join(" ") !== answerKey) return next.join(" ");
    next = shuffleArray(base.slice());
  }
  next = base.slice().reverse();
  if (next.join(" ") === answerKey && base.length > 2) {
    next = base.slice(1).concat(base[0]);
  }
  if (next.join(" ") === answerKey && base.length > 2) {
    next = [base[base.length - 1], ...base.slice(0, -1)];
  }
  return next.join(" ");
}

async function persistMemoryEmojiPromptState(client?, cfg?, game?, promptMessageId?) {
  if (!client || !cfg?.channelId || !game || !promptMessageId) return;
  game.promptMessageId = promptMessageId;
  let acceptsAt = Number(game.acceptsAt || 0);
    if (isAbsurdMemoryAcceptsAt(acceptsAt)) acceptsAt = Date.now();
  await saveActiveGame(client, cfg, {
    type: game.type,
    target: JSON.stringify({
      sequence: game.sequence,
      normalizedSequence: game.normalizedSequence,
      acceptsAt,
      sequenceMessageId: game.sequenceMessageId || null,
      promptMessageId,
      durationMs: game.durationMs || null,
    }),
    rewardExp: Number(game.rewardExp || 0),
    startedAt: new Date(game.startedAt || Date.now()),
    endsAt: new Date(game.endsAt || Date.now()),
    gameMessageId: promptMessageId,
  });
}

async function catchUpMemoryEmojiWinFromHistory(client?, cfg?, channel?, game?) {
  const chId = String(cfg?.channelId || channel?.id || "").trim();
  if (!client || !channel?.messages?.fetch || !game?.normalizedSequence || !chId) return false;
  if (!game.promptMessageId) return false;
  if (Date.now() < Number(game.acceptsAt || 0)) return false;
  if (activeGames.get(chId) !== game) return false;

  const batch = await channel.messages.fetch({ limit: 40 }).catch(() => null);
  if (!batch?.size) return false;

  const promptId = String(game.promptMessageId || "");
  const candidates = [...batch.values()]
    .filter((m?) => {
      if (!m || m.author?.bot || m.system || m.webhookId) return false;
      if (!promptId) return true;
            try {
        if (BigInt(String(m.id)) <= BigInt(promptId)) return false;
      } catch (_) {
        if (String(m.id) === promptId) return false;
      }
      return true;
    })
    .sort((a?, b?) => Number(a.createdTimestamp || 0) - Number(b.createdTimestamp || 0));

  for (const msg of candidates) {
    if (activeGames.get(chId) !== game) return false;
    if (!memoryEmojiMessageMatches(msg.content, game.normalizedSequence)) continue;
    await handleMinigameWin(msg, game, cfg);
    return true;
  }
  return false;
}

function createHogwartsQuizGameFromState(state?, cfg = null) {
  const parsed = parseStateTarget(state?.target);
  const question = parsed?.question || "Domanda";
  const questionKey =
    String(parsed?.questionKey || "").trim() || normalizeQuizQuestionKey(question);
  let sourceAnswers = Array.isArray(parsed?.sourceAnswers)
    ? parsed.sourceAnswers.map((a?) => String(a || "").trim()).filter(Boolean)
    : [];
  const bankRow = findHogwartsQuizBankRow(question) || findHogwartsQuizBankRowByKey(questionKey);
  if (bankRow?.answers?.length) {
    sourceAnswers = bankRow.answers.map((a?) => String(a || "").trim()).filter(Boolean);
  }
  if (!sourceAnswers.length && Array.isArray(parsed?.answers)) {
    sourceAnswers = parsed.answers.map((a?) => String(a || "").trim()).filter(Boolean);
  }
  const displayAnswer = parsed?.displayAnswer || sourceAnswers[0] || "sconosciuta";
  const game = {
    type: "hogwartsQuiz",
    question,
    questionKey,
    sourceAnswers,
    answers: [],
    displayAnswer,
    rewardExp: Number(state?.rewardExp || 0),
    startedAt: new Date(state?.startedAt || Date.now()).getTime(),
    endsAt: new Date(state?.endsAt || Date.now()).getTime(),
    timeout: null,
    hintTimeout: null,
    gameMessageId: state?.gameMessageId || null,
  };
  game.answers = resolveHogwartsQuizAnswerPool(game);
  return attachHogwartsHouseChannelMeta(game, cfg);
}

function messageContentMatchesMinigameWin(content?, game?) {
  if (!game?.type) return false;
  const raw = String(content || "").trim();
  if (!raw) return false;
  const contentForGuess = normalizeUserAnswerText(raw);
  if (!contentForGuess) return false;
  const type = String(game.type);

  if (type === "hogwartsQuiz") {
    return isHogwartsQuizGuessCorrect(contentForGuess, game, resolveHogwartsQuizAnswerPool(game));
  }
  if (type === "guessWord") {
    const target = String(game.target || "").toLowerCase();
    if (!target) return false;
    return extractWordGuessCandidates(contentForGuess).some((g?) => g === target);
  }
  if (type === "fastType") {
    const phrase = normalizeUserAnswerText(String(game.phrase || ""));
    return Boolean(phrase) && contentForGuess === phrase;
  }
  if (type === "mathExpression") {
    const guessNum = parseMathGuess(contentForGuess);
    const answerNum = Number(game.answer);
    return Number.isFinite(guessNum) && Number.isFinite(answerNum) && Math.abs(guessNum - answerNum) < 1e-6;
  }
  if (type === "guessYear") {
    const year = Number(game.year);
    const guess = Number(String(contentForGuess).replace(/[^\d]/g, ""));
    return Number.isFinite(year) && year > 0 && guess === year;
  }
  if (type === "completeProverb") {
    const end = normalizeCountryName(String(game.end || ""));
    const guess = normalizeCountryName(contentForGuess);
    return Boolean(end) && (guess === end || compactNoSpaces(guess) === compactNoSpaces(end));
  }
  if (type === "completeVerse" || type === "synonymAntonym") {
    const answers = [
      game.answer,
      ...(Array.isArray(game.answers) ? game.answers : []),
    ]
      .map((a?) => String(a || "").trim())
      .filter(Boolean);
    return isExplicitBankAnswerCorrect(contentForGuess, answers, normalizeCountryName, 1);
  }
  if (type === "hogwartsCipher") {
    return isHogwartsCipherGuessCorrect(contentForGuess, game);
  }
  if (type === "italianGK" || type === "guessCapital" || type === "guessRegionCapital" || type === "guessReverseCapital" || type === "guessEmoji" || type === "quoteFilm" || type === "guessCity" || type === "guessFlag" || type === "guessPlayer" || type === "hogwartsGuessCharacter" || type === "guessTeam" || type === "guessSinger" || type === "guessAlbum") {
    const answers = [
      ...(Array.isArray(game.answers) ? game.answers : []),
      game.displayAnswer,
      game.answer,
      game.displayName,
      game.name,
      game.team,
      game.city,
      game.target,
    ]
      .map((a?) => String(a || "").trim())
      .filter(Boolean);
    if (!answers.length) return false;
    return isExplicitBankAnswerCorrect(contentForGuess, answers, normalizeCountryName, 1);
  }
  if (Array.isArray(game.answers) && game.answers.length) {
    return isExplicitBankAnswerCorrect(contentForGuess, game.answers, normalizeCountryName, 1);
  }
  return false;
}

function buildCatchUpGameFromPersistedState(state?, cfg = null) {
  const type = String(state?.type || "").trim();
  if (!type) return null;
  if (type === "hogwartsQuiz") return createHogwartsQuizGameFromState(state, cfg);
  if (type === "hogwartsCipher") {
    const parsed = parseStateTarget(state.target);
    const cipherAnswers = resolveHogwartsCipherAnswersFromParsed(parsed);
    return attachHogwartsHouseChannelMeta(
      {
        type,
        numbers: parsed?.numbers || "",
        answerNumbers: cipherAnswers.answerNumbers,
        sourceAnswers: cipherAnswers.sourceAnswers,
        answers: cipherAnswers.answers,
        displayAnswer: cipherAnswers.displayAnswer,
        rewardExp: Number(state.rewardExp || 0),
        startedAt: new Date(state.startedAt || Date.now()).getTime(),
        endsAt: new Date(state.endsAt || Date.now()).getTime(),
        gameMessageId: state.gameMessageId || null,
      },
      cfg,
    );
  }
  if (type === "hogwartsMemoryEmoji" || type === "memoryEmoji") {
    const parsed = parseStateTarget(state.target);
    const sequence = parsed?.sequence || "";
    return attachHogwartsHouseChannelMeta(
      {
        type,
        sequence,
        normalizedSequence: parsed?.normalizedSequence || normalizeHogwartsMemorySequence(sequence),
        promptMessageId: parsed?.promptMessageId || (state.gameMessageId && String(state.gameMessageId) !== String(parsed?.sequenceMessageId || "") ? state.gameMessageId : null),
        acceptsAt: Math.min(Number(parsed?.acceptsAt || Date.now()) || Date.now(), Date.now()),
        rewardExp: Number(state.rewardExp || 0),
        startedAt: new Date(state.startedAt || Date.now()).getTime(),
        endsAt: new Date(state.endsAt || Date.now()).getTime(),
        gameMessageId: state.gameMessageId || null,
      },
      cfg,
    );
  }
  const snap = buildGameSnapshotFromPersistedState(state);
  if (!snap?.type) return null;
  snap.startedAt = new Date(state.startedAt || Date.now()).getTime();
  snap.endsAt = new Date(state.endsAt || Date.now()).getTime();
  snap.gameMessageId = state.gameMessageId || null;
  if (type === "guessWord") snap.target = String(state.target || "").toLowerCase();
  if (type === "guessFlag") {
    const parsed = parseStateTarget(state.target);
    snap.answers = Array.isArray(parsed?.names) ? parsed.names : [];
    snap.displayName = parsed?.displayName || snap.displayName;
  }
  if (type === "guessPlayer" || type === "hogwartsGuessCharacter") {
    const parsed = parseStateTarget(state.target);
    const name = parsed?.name || snap.displayName;
    snap.answers =
      type === "guessPlayer"
        ? buildPlayerAnswerAliases(name, parsed?.aliases)
        : buildStrictBankAliases(
            [name, ...(Array.isArray(parsed?.aliases) ? parsed.aliases : [])],
            normalizePlayerGuess,
          );
    snap.displayName = name;
    snap.sourceAliases = Array.isArray(parsed?.aliases) ? parsed.aliases : [];
  }
  return attachHogwartsHouseChannelMeta(snap, cfg);
}

async function catchUpTextMinigameWinFromHistory(client?, cfg?, channel?, game?) {
  const chId = String(cfg?.channelId || channel?.id || "").trim();
  if (!client || !channel?.messages?.fetch || !game || !chId) return false;
  if (activeGames.get(chId) !== game) return false;
  if (game.type === "hogwartsMemoryEmoji" || game.type === "memoryEmoji") {
    return catchUpMemoryEmojiWinFromHistory(client, cfg, channel, game);
  }

  const afterId = String(game.gameMessageId || "").trim();
  const endsAt = Number(game.endsAt) || Date.now();
  const startedAt = Number(game.startedAt) || 0;
  const batch = await channel.messages.fetch({ limit: 80 }).catch(() => null);
  if (!batch?.size) return false;

  const candidates = [...batch.values()]
    .filter((m?) => {
      if (!m || m.author?.bot || m.system || m.webhookId) return false;
      const ts = Number(m.createdTimestamp || 0);
      if (ts && endsAt && ts > endsAt + 1500) return false;
      if (startedAt && ts && ts < startedAt - 2000) return false;
      if (!afterId) return true;
      try {
        if (BigInt(String(m.id)) <= BigInt(afterId)) return false;
      } catch (_) {
        if (String(m.id) === afterId) return false;
      }
      return true;
    })
    .sort((a?, b?) => Number(a.createdTimestamp || 0) - Number(b.createdTimestamp || 0) || String(a.id).localeCompare(String(b.id)));

  for (const msg of candidates) {
    if (activeGames.get(chId) !== game) return false;
    if (!messageContentMatchesMinigameWin(msg.content, game)) continue;
    await handleMinigameWin(msg, game, cfg);
    return true;
  }
  return false;
}

async function tryAwardMissedMinigameWinFromHistory(client?, cfg?, channel?, state?) {
  const type = String(state?.type || "").trim();
  if (!type || type === "treasureHunt" || type === "hogwartsObservationTower" || type === "findBot" || type === "halloweenFindGhost" || type === "findBotVoice" || type === "findScroll" || type === "hangman" || type === "halloweenTrickOrTreat") {
    return false;
  }
  const chId = String(cfg?.channelId || channel?.id || "").trim();
  if (!chId || !channel?.messages?.fetch) return false;
  if (channelWinClosing.has(chId)) return false;

  const game = buildCatchUpGameFromPersistedState(state, cfg);
  if (!game) return false;
  restoreHogwartsPodiumFromState(chId, state, game);
  activeGames.set(chId, game);
  try {
    const won = await catchUpTextMinigameWinFromHistory(client, cfg, channel, game);
    if (won) return true;
  } catch (err) {
    warnMinigame(err);
  }
  if (activeGames.get(chId) === game) activeGames.delete(chId);
  return false;
}

function suppressMinigameSnipe(client?, channelId?, messageId?) {
  if (!client) return;
  const mid = String(messageId || "").trim();
  if (mid) {
    if (!(client._minigameSnipeSuppressIds instanceof Set)) client._minigameSnipeSuppressIds = new Set();
    client._minigameSnipeSuppressIds.add(mid);
    setTimeout(() => {
      try {
        client._minigameSnipeSuppressIds?.delete?.(mid);
      } catch (_) {}
    }, 120_000).unref?.();
  }
  const chId = String(channelId || "").trim();
  if (!chId || !(client.snipes instanceof Map)) return;
  const raw = client.snipes.get(chId);
  const history = Array.isArray(raw) ? raw : raw ? [raw] : [];
  if (!history.length) return;
  const secrets = collectActiveMinigameAnswerSecrets(activeGames.get(chId));
  const filtered = history.filter((item?) => {
    if (!item || typeof item !== "object") return false;
    if (mid && String(item.messageId || "") === mid) return false;
    if (item.hideForMinigame) return false;
    if (snipeContentLeaksMinigameAnswer(item.content, secrets)) return false;
    return true;
  });
  if (filtered.length) client.snipes.set(chId, filtered.slice(0, 10));
  else client.snipes.delete(chId);
}

function isMinigameSnipeSuppressed(client?, messageId?) {
  const mid = String(messageId || "").trim();
  if (!mid || !client) return false;
  return Boolean(client._minigameSnipeSuppressIds?.has?.(mid));
}

function collectActiveMinigameAnswerSecrets(game?) {
  const secrets = new Set();
  if (!game || typeof game !== "object") return secrets;
  const add = (value?) => {
    const raw = String(value ?? "").trim();
    if (!raw) return;
    secrets.add(raw);
    secrets.add(raw.toLowerCase());
    const compact = raw.toLowerCase().replace(/\s+/g, "");
    if (compact) secrets.add(compact);
    const noPunct = raw.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").trim();
    if (noPunct) secrets.add(noPunct);
    try {
      const mem = normalizeHogwartsMemorySequence(raw);
      if (mem) secrets.add(mem);
    } catch (_) {}
    try {
      const country = normalizeCountryName(raw);
      if (country) secrets.add(country);
    } catch (_) {}
  };
  add(game.sequence);
  add(game.normalizedSequence);
  add(game.answer);
  add(game.phrase);
  add(game.normalizedPhrase);
  add(game.word);
  add(game.target);
  add(game.year);
  add(game.correct);
  add(game.expression);
  add(game.city);
  add(game.landmark);
  add(game.title);
  add(game.subtitle);
  add(game.verse);
  if (Array.isArray(game.answers)) {
    for (const item of game.answers) add(item);
  }
  if (Array.isArray(game.sourceAnswers)) {
    for (const item of game.sourceAnswers) add(item);
  }
  if (Array.isArray(game.options) && Number.isFinite(game.correctIndex)) {
    add(game.options[game.correctIndex]);
  }
  if (typeof game.answer === "boolean") {
    add(game.answer ? "vero" : "falso");
    add(game.answer ? "true" : "false");
    add(game.answer ? "v" : "f");
  }
  return secrets;
}

function snipeContentLeaksMinigameAnswer(content?, secrets?) {
  const raw = String(content || "").trim();
  if (!raw || !(secrets instanceof Set) || !secrets.size) return false;
  const lower = raw.toLowerCase();
  const compact = lower.replace(/\s+/g, "");
  let memNorm = "";
  try {
    memNorm = normalizeHogwartsMemorySequence(raw);
  } catch (_) {}
  let countryNorm = "";
  try {
    countryNorm = normalizeCountryName(raw);
  } catch (_) {}
  for (const secret of secrets) {
    const s = String(secret || "").trim();
    if (!s) continue;
        if (s.length < 2 && !/^\d+$/.test(s)) continue;
    if (lower === s || compact === s.replace(/\s+/g, "")) return true;
    if (s.length >= 3 && (lower.includes(s) || compact.includes(s.replace(/\s+/g, "")))) return true;
    if (memNorm && memNorm === s) return true;
    if (countryNorm && countryNorm === s) return true;
  }
  return false;
}

function pickSnipeEntryForChannel(client?, channelId?, history?) {
  const list = Array.isArray(history) ? history : history ? [history] : [];
  const chId = String(channelId || "").trim();
  const game = chId ? activeGames.get(chId) : null;
  const secrets = collectActiveMinigameAnswerSecrets(game);
  for (const item of list) {
    if (!item || item.isEmbedOnly) continue;
    if (item.messageId && isMinigameSnipeSuppressed(client, item.messageId)) continue;
    if (item.hideForMinigame) continue;
    if (snipeContentLeaksMinigameAnswer(item.content, secrets)) continue;
    return item;
  }
  return null;
}

function shouldSkipStoringSnipe(client?, channelId?, payload?) {
  if (!payload || typeof payload !== "object") return true;
  if (payload.messageId && isMinigameSnipeSuppressed(client, payload.messageId)) return true;
  if (payload.hideForMinigame) return true;
  const chId = String(channelId || "").trim();
  const secrets = collectActiveMinigameAnswerSecrets(chId ? activeGames.get(chId) : null);
  return snipeContentLeaksMinigameAnswer(payload.content, secrets);
}

function redactSnipeContentForMinigame(client?, channelId?, content?) {
  const chId = String(channelId || "").trim();
  const secrets = collectActiveMinigameAnswerSecrets(chId ? activeGames.get(chId) : null);
  if (!snipeContentLeaksMinigameAnswer(content, secrets)) return String(content || "");
  return "Contenuto nascosto (risposta minigame).";
}

async function ensureMemoryEmojiRecallPrompt(client?, cfg?, channel?, game?, remainingMs?) {
  if (!game || !channel) return null;
  const existingId = String(game.promptMessageId || "").trim();
  if (existingId) {
    const existing = await channel.messages.fetch(existingId).catch(() => null);
    if (existing) return existing;
  }
  const prompt = await sendMinigameMessage(channel, {
    embeds: [
      buildHogwartsMemoryRecallEmbed(Math.max(60000, Number(remainingMs) || 60000), {
        burrobirraStrong: Boolean(game.burrobirraApplies),
      }),
    ],
  }).catch(() => null);
  if (prompt) {
    game.promptMessageId = prompt.id;
  }
  return prompt;
}

async function openMemoryEmojiAnswers(client?, cfg?, channel?, game?, options: Record<string, any> = {}) {
  if (!game) return;
  const channelId = String(cfg?.channelId || channel?.id || "").trim();
  const remainingOverride = Number(options.remainingMs);
  const durationMs =
    Number.isFinite(remainingOverride) && remainingOverride >= 0
      ? Math.max(1000, remainingOverride)
      : Math.max(60000, Number(game.durationMs || cfg?.[game.cfgKey || game.type]?.durationMs || 180000));
  const openAt = Date.now();
  game.acceptsAt = openAt;
  if (!options.preserveEndsAt) {
    game.endsAt = openAt + durationMs;
  }
  if (game.timeout) {
    try {
      clearTimeout(game.timeout);
    } catch (_) {}
  }
  if (channelId && channel) {
    const timeoutMs = options.preserveEndsAt
      ? Math.max(0, Number(game.endsAt || 0) - Date.now())
      : durationMs;
    game.timeout = scheduleMinigameRoundTimeout(client, cfg, channelId, channel, timeoutMs);
  }
  if (game.promptMessageId) {
    await persistMemoryEmojiPromptState(client, cfg, game, game.promptMessageId);
  }
    if (game.hintTimeout) {
    try {
      clearTimeout(game.hintTimeout);
    } catch (_) {}
    game.hintTimeout = null;
  }
  const hintWindowMs = options.preserveEndsAt
    ? Math.max(0, Number(game.endsAt || 0) - Date.now())
    : durationMs;
  if (channelId && (game.burrobirraApplies || isBurrobirraActiveForChannel(client, channelId))) {
    game.hintTimeout = await scheduleBurrobirraMemoryEmojiHint(
      client,
      channelId,
      hintWindowMs,
      game.sequence,
    );
  }
}

async function revealMemoryEmojiAndOpenAnswers(client?, cfg?, channel?, channelId?, type?, sequenceMessage = null, options: Record<string, any> = {}) {
  const game = activeGames.get(channelId);
  if (!game || game.type !== type) return;
    game.acceptsAt = Number.MAX_SAFE_INTEGER;
  const seqMsgId = String(game.sequenceMessageId || sequenceMessage?.id || "").trim();
  if (seqMsgId) suppressMinigameSnipe(client, channelId, seqMsgId);

  let deleted = false;
  if (sequenceMessage && typeof sequenceMessage.delete === "function") {
    deleted = await sequenceMessage.delete().then(() => true).catch(() => false);
  }
  if (!deleted && seqMsgId) {
    const msg = await channel.messages.fetch(seqMsgId).catch(() => null);
    if (msg) await msg.delete().catch(() => {});
  }
  game.sequenceMessageId = null;
  suppressMinigameSnipe(client, channelId, seqMsgId);

  const durationMs = Math.max(60000, Number(game.durationMs || 180000));
  const promptMs = Number.isFinite(Number(options.remainingMs))
    ? Number(options.remainingMs)
    : durationMs;
  const prompt = await ensureMemoryEmojiRecallPrompt(client, cfg, channel, game, promptMs);
  if (!prompt) return;
  await openMemoryEmojiAnswers(client, cfg, channel, game, options);
}

async function mountMemoryEmojiGameFromState(client?, cfg?, channel?, state?, remainingMs?) {
  const chId = String(cfg.channelId || "").trim();
  if (!chId || !channel) return;
  const endsAt = new Date(state.endsAt).getTime();
  const parsed = parseStateTarget(state.target);
  const sequence = parsed?.sequence || "";
  const normalizedSequence = parsed?.normalizedSequence || normalizeHogwartsMemorySequence(sequence);
  let savedAcceptsAt = Number(parsed?.acceptsAt || new Date(state.startedAt).getTime());
  if (isAbsurdMemoryAcceptsAt(savedAcceptsAt)) savedAcceptsAt = 0;
  const sequenceMessageId = String(parsed?.sequenceMessageId || "").trim() || null;
  let promptMessageId = String(parsed?.promptMessageId || "").trim() || null;
  if (
    !promptMessageId &&
    state.gameMessageId &&
    String(state.gameMessageId) !== String(sequenceMessageId || "")
  ) {
    promptMessageId = String(state.gameMessageId);
  }
  const startedAt = new Date(state.startedAt).getTime();
  const rewardExp = Number(state.rewardExp || 0);
  const durationMs = Math.max(60000, Number(parsed?.durationMs || 180000));
  const safeRemaining = Math.max(0, Number(remainingMs) || 0);

  const stillInDisplayPhase =
    Boolean(sequenceMessageId) && !promptMessageId && savedAcceptsAt > Date.now();

  let revealTimeout = null;
  let acceptsAt;
  let mountSequenceId = null;
  let mountPromptId = promptMessageId;

  if (stillInDisplayPhase) {
    acceptsAt = Number.MAX_SAFE_INTEGER;
    mountSequenceId = sequenceMessageId;
    mountPromptId = null;
    const delay = Math.min(Math.max(250, savedAcceptsAt - Date.now()), 2147483647);
    revealTimeout = setTimeout(() => {
      void (async () => {
        await revealMemoryEmojiAndOpenAnswers(client, cfg, channel, chId, state.type, null, {
          remainingMs: Math.max(0, endsAt - Date.now()),
          preserveEndsAt: true,
        });
        const live = activeGames.get(chId);
        if (live) await catchUpMemoryEmojiWinFromHistory(client, cfg, channel, live);
      })().catch(() => {});
    }, delay);
    revealTimeout.unref?.();
  } else {
    acceptsAt = Math.min(savedAcceptsAt || Date.now(), Date.now());
    mountSequenceId = null;
    mountPromptId = promptMessageId;
  }

  const timeout = scheduleMinigameRoundTimeout(client, cfg, chId, channel, safeRemaining);
  activeGames.set(
    chId,
    attachHogwartsHouseChannelMeta(
      {
        type: state.type,
        cfgKey: state.type === "hogwartsMemoryEmoji" ? "hogwartsMemoryEmoji" : "memoryEmoji",
        sequence,
        normalizedSequence,
        rewardExp,
        durationMs,
        startedAt,
        acceptsAt,
        endsAt,
        timeout,
        revealTimeout,
        hintTimeout: null,
        sequenceMessageId: mountSequenceId,
        promptMessageId: mountPromptId,
      },
      cfg,
    ),
  );
  restoreHogwartsPodiumFromState(chId, state, activeGames.get(chId));
  stampMinigameBurrobirraApplies(chId, client);

  if (stillInDisplayPhase) return;

  if (sequenceMessageId) {
    await revealMemoryEmojiAndOpenAnswers(client, cfg, channel, chId, state.type, null, {
      remainingMs: safeRemaining,
      preserveEndsAt: true,
    });
  } else {
    const game = activeGames.get(chId);
    if (game) {
      game.acceptsAt = Math.min(Number(game.acceptsAt) || Date.now(), Date.now());
      const prompt = await ensureMemoryEmojiRecallPrompt(client, cfg, channel, game, safeRemaining);
      if (prompt?.id) {
        await persistMemoryEmojiPromptState(client, cfg, game, prompt.id);
      }
      if (game.hintTimeout) {
        try {
          clearTimeout(game.hintTimeout);
        } catch (_) {}
        game.hintTimeout = null;
      }
      if (game.burrobirraApplies || isBurrobirraActiveForChannel(client, chId)) {
        game.hintTimeout = await scheduleBurrobirraMemoryEmojiHint(
          client,
          chId,
          safeRemaining,
          game.sequence,
        );
      }
    }
  }

  const live = activeGames.get(chId);
  if (live) await catchUpMemoryEmojiWinFromHistory(client, cfg, channel, live);
}

async function startMemoryEmojiGame(client?, cfg?, options?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const type = options?.type || "memoryEmoji";
  const cfgKey = options?.cfgKey || type;
  const gameCfg = cfg?.[cfgKey];
  if (gameCfg === false) return false;
  if (options?.requiresEvent && (!gameCfg?.eventLive || !gameCfg?.unlocked)) return false;

  const pick = pickQuestionAvoidRecent(channelId, type, options?.bank || [], displayHogwartsMemorySequence, 20);
    const sequence = displayHogwartsMemorySequence(shuffleMemoryEmojiRow(pick));
  const burrobirraStrong = isBurrobirraActiveForChannel(client, channelId);
  let displaySequence = sequence;
  if (burrobirraStrong) {
        const answerTokens = String(sequence).split(/\s+/).filter(Boolean);
    displaySequence = shuffleMemoryTokensDifferentFromAnswer(answerTokens).join("·");
  }
  const normalizedSequence = normalizeHogwartsMemorySequence(sequence);
  if (!sequence || !normalizedSequence) return false;

  const rewardExp = normalizeRewardExp(gameCfg?.rewardExp ?? 220);
  let displayMs = Math.max(3000, Number(gameCfg?.displayMs || 8000));
  if (burrobirraStrong) displayMs = Math.max(1800, Math.floor(displayMs * 0.4));
  const durationMs = applyBurrobirraStrongDurationMs(client, channelId, Math.max(60000, Number(gameCfg?.durationMs || 180000)));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;

  if (cfg.roleId)
    await sendMinigameRolePing(channel, cfg);

  const sequenceMessage = await sendMinigameMessage(
    channel,
    { embeds: [buildHogwartsMemorySequenceEmbed(displaySequence, rewardExp, displayMs, { burrobirraStrong })] },
    MINIGAME_QUESTION_BURROBIRRA,
  ).catch(() => null);
  if (!sequenceMessage) return false;
  suppressMinigameSnipe(client, channelId, sequenceMessage.id);

  const now = Date.now();
    const acceptsAt = Number.MAX_SAFE_INTEGER;
  const endsAt = now + displayMs + durationMs;
  const revealTimeout = setTimeout(() => {
    void revealMemoryEmojiAndOpenAnswers(client, cfg, channel, channelId, type, sequenceMessage).catch(() => {});
  }, displayMs);
  revealTimeout.unref?.();

  const timeout = scheduleMinigameRoundTimeout(client, cfg, channelId, channel, displayMs + durationMs);

  activeGames.set(channelId, attachHogwartsHouseChannelMeta({
    type,
    cfgKey,
    sequence,
    normalizedSequence,
    rewardExp,
    durationMs,
    startedAt: now,
    acceptsAt,
    endsAt,
    timeout,
    revealTimeout,
    hintTimeout: null,
    sequenceMessageId: sequenceMessage.id,
    promptMessageId: null,
    burrobirraApplies: burrobirraStrong,
  }, cfg));

  await saveActiveGame(client, cfg, {
    type,
    target: JSON.stringify({
      sequence,
      normalizedSequence,
      acceptsAt: now + displayMs,
      sequenceMessageId: sequenceMessage.id,
      durationMs,
    }),
    rewardExp,
    startedAt: new Date(now),
    endsAt: new Date(endsAt),
    gameMessageId: sequenceMessage.id,
  });

  stampMinigameBurrobirraApplies(channelId, client);
  markSent(channelId);
  return true;
}

async function startHogwartsMemoryEmojiGame(client?, cfg?) {
  return startMemoryEmojiGame(client, cfg, {
    type: "hogwartsMemoryEmoji",
    cfgKey: "hogwartsMemoryEmoji",
    bank: getHogwartsMemoryEmojiBank(),
    requiresEvent: true,
  });
}

async function startStandardMemoryEmojiGame(client?, cfg?) {
  const bank = shouldUseHalloweenTheme(cfg)
    ? getHalloweenMemoryEmojiBank()
    : pickHogwartsBonusBank(cfg, "memoryEmoji", getMemoryEmojiBank(), getHogwartsMemoryEmojiBank);
  return startMemoryEmojiGame(client, cfg, {
    type: "memoryEmoji",
    cfgKey: "memoryEmoji",
    bank,
  });
}

async function startGuessYearGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const bank = shouldUseHalloweenTheme(cfg)
    ? getHalloweenGuessYearBank()
    : pickHogwartsBonusBank(cfg, "guessYear", getGuessYearBank(), getHogwartsGuessYearBank);
  const pick = pickQuestionAvoidRecent(channelId, "guessYear", bank, (r?) => `${r.type}:${r.title}:${r.year}`, 25);
  if (!pick) return false;
  const rewardExp = normalizeRewardExp(cfg?.guessYear?.rewardExp ?? 150);
  const durationMs = applyBurrobirraStrongDurationMs(client, channelId, Math.max(60000, Number(cfg?.guessYear?.durationMs || 180000)));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;
  await sendMinigameRolePing(channel, cfg);
  const typeLabel = { film: "Film", series: "Serie TV", song: "Canzone", album: "Album" }[pick.type] || pick.type;
  const lines = [pick.subtitle ? `${pick.title} — ${pick.subtitle}` : pick.title, `Categoria: ${typeLabel}`];
  const attachment = buildPromptImageAttachment(shouldUseHalloweenTheme(cfg) ? "Indovina l'anno Halloween" : "Indovina l'anno", lines, "guess_year", "", client, isBurrobirraActiveForChannel(client, channelId));
  const imageUrl = attachment ? `attachment://${attachment.name}` : null;
  const embed = buildGuessYearEmbed(pick.title, pick.subtitle || null, rewardExp, durationMs, imageUrl);
  if (shouldUseHalloweenTheme(cfg)) embed.setTitle("Indovina l'anno Halloween 🎃");
  const gameMessage = await sendMinigameMessage(channel, { embeds: [embed], files: attachment ? [attachment] : [] }, MINIGAME_QUESTION_BURROBIRRA).catch(() => null);
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
  stampMinigameBurrobirraApplies(channelId, client);
  markSent(channelId);
  return true;
}

async function startCompleteVerseGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const bank = shouldUseHalloweenTheme(cfg)
    ? getHalloweenCompleteVerseBank()
    : pickHogwartsBonusBank(cfg, "completeVerse", getCompleteVerseBank(), getHogwartsCompleteVerseBank);
  const pick = pickQuestionAvoidRecent(channelId, "completeVerse", bank, (r?) => r.verse, 15);
  if (!pick) return false;
  const rewardExp = normalizeRewardExp(cfg?.completeVerse?.rewardExp ?? 150);
  const durationMs = applyBurrobirraStrongDurationMs(client, channelId, Math.max(60000, Number(cfg?.completeVerse?.durationMs || 180000)));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;
  await sendMinigameRolePing(channel, cfg);
  const attachment = buildPromptImageAttachment(shouldUseHalloweenTheme(cfg) ? "Completa il verso Halloween" : "Completa il verso", [pick.verse, `${pick.song} — ${pick.artist}`], "complete_verse", "", client, isBurrobirraActiveForChannel(client, channelId));
  const imageUrl = attachment ? `attachment://${attachment.name}` : null;
  const embed = buildCompleteVerseEmbed(pick.verse, rewardExp, durationMs, imageUrl);
  if (shouldUseHalloweenTheme(cfg)) embed.setTitle("Completa il verso Halloween 🎃");
  const gameMessage = await sendMinigameMessage(channel, { embeds: [embed], files: attachment ? [attachment] : [] }, MINIGAME_QUESTION_BURROBIRRA).catch(() => null);
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
  stampMinigameBurrobirraApplies(channelId, client);
  markSent(channelId);
  return true;
}

async function startGuessEmojiGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const bank = pickHogwartsBonusBank(cfg, "guessEmoji", getGuessEmojiBank(), getHogwartsGuessEmojiBank);
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
  const durationMs = applyBurrobirraStrongDurationMs(client, channelId, Math.max(60000, Number(cfg?.guessEmoji?.durationMs || 180000)));
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
  const gameMessage = await sendMinigameMessage(channel, { embeds: [embed], files: attachment ? [attachment] : [] }, MINIGAME_QUESTION_BURROBIRRA).catch(() => null);
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
  stampMinigameBurrobirraApplies(channelId, client);
  markSent(channelId);
  return true;
}

async function startQuoteFilmGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const bank = pickHogwartsBonusBank(cfg, "quoteFilm", getQuoteFilmBank(), getHogwartsQuoteFilmBank);
  const pick = pickQuestionAvoidRecent(channelId, "quoteFilm", bank, (r?) => r.quote, 15);
  if (!pick) return false;
  const rewardExp = normalizeRewardExp(cfg?.quoteFilm?.rewardExp ?? 150);
  const durationMs = applyBurrobirraStrongDurationMs(client, channelId, Math.max(60000, Number(cfg?.quoteFilm?.durationMs || 180000)));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;
  await sendMinigameRolePing(channel, cfg);
  const displayQuote = pick.quoteIt || pick.quote;
  const attachment = buildPromptImageAttachment("Citazione da film/serie", [displayQuote], "quote_film", "", client, isBurrobirraActiveForChannel(client, channelId));
  const imageUrl = attachment ? `attachment://${attachment.name}` : null;
  const embed = buildQuoteFilmEmbed(displayQuote, rewardExp, durationMs, imageUrl);
  const gameMessage = await sendMinigameMessage(channel, { embeds: [embed], files: attachment ? [attachment] : [] }, MINIGAME_QUESTION_BURROBIRRA).catch(() => null);
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
  stampMinigameBurrobirraApplies(channelId, client);
  markSent(channelId);
  return true;
}

async function startCompleteProverbGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const proverbBank = pickHogwartsBonusBank(cfg, "completeProverb", getProverbBank(), getHogwartsProverbBank);
  const bank = (proverbBank || []).filter((r?) => r && String(r.end || "").trim() !== "");
  const pick = pickQuestionAvoidRecent(channelId, "completeProverb", bank, (r?) => r.start, 15);
  if (!pick) return false;
  const rewardExp = normalizeRewardExp(cfg?.completeProverb?.rewardExp ?? 150);
  const durationMs = applyBurrobirraStrongDurationMs(client, channelId, Math.max(60000, Number(cfg?.completeProverb?.durationMs || 180000)));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;
  await sendMinigameRolePing(channel, cfg);
  const attachment = buildPromptImageAttachment("Completa il proverbio", [pick.start], "complete_proverb", "", client, isBurrobirraActiveForChannel(client, channelId));
  const imageUrl = attachment ? `attachment://${attachment.name}` : null;
  const embed = buildCompleteProverbEmbed(pick.start, rewardExp, durationMs, imageUrl);
  const gameMessage = await sendMinigameMessage(channel, { embeds: [embed], files: attachment ? [attachment] : [] }, MINIGAME_QUESTION_BURROBIRRA).catch(() => null);
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
  stampMinigameBurrobirraApplies(channelId, client);
  markSent(channelId);
  return true;
}

async function startSynonymAntonymGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const bank = pickHogwartsBonusBank(cfg, "synonymAntonym", getSynonymAntonymBank(), getHogwartsSynonymAntonymBank);
  const pick = pickQuestionAvoidRecent(channelId, "synonymAntonym", bank, (r?) => `${r.word}:${r.kind}`, 20);
  if (!pick) return false;
  const rewardExp = normalizeRewardExp(cfg?.synonymAntonym?.rewardExp ?? 150);
  const durationMs = applyBurrobirraStrongDurationMs(client, channelId, Math.max(60000, Number(cfg?.synonymAntonym?.durationMs || 180000)));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;
  await sendMinigameRolePing(channel, cfg);
  const answer = pick.kind === "antonym" ? pick.antonym : pick.synonym;
  const kindLabel = pick.kind === "antonym" ? "il contrario" : "un sinonimo";
  const attachment = buildPromptImageAttachment(pick.kind === "antonym" ? "Trova il contrario" : "Trova il sinonimo", [`Parola: ${pick.word}`, `Scrivi ${kindLabel} di questa parola.`], "synonym_antonym", "", client, isBurrobirraActiveForChannel(client, channelId));
  const imageUrl = attachment ? `attachment://${attachment.name}` : null;
  const embed = buildSynonymAntonymEmbed(pick.word, pick.kind, rewardExp, durationMs, imageUrl);
  const gameMessage = await sendMinigameMessage(channel, { embeds: [embed], files: attachment ? [attachment] : [] }, MINIGAME_QUESTION_BURROBIRRA).catch(() => null);
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
  stampMinigameBurrobirraApplies(channelId, client);
  markSent(channelId);
  return true;
}

async function startGuessCityGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const bank = pickHogwartsBonusBank(cfg, "guessCity", getGuessCityBank(), getHogwartsGuessCityBank);
  const pick = pickQuestionAvoidRecent(channelId, "guessCity", bank, (r?) => r.landmark, 20);
  if (!pick) return false;
  const rewardExp = normalizeRewardExp(cfg?.guessCity?.rewardExp ?? 150);
  const durationMs = applyBurrobirraStrongDurationMs(client, channelId, Math.max(60000, Number(cfg?.guessCity?.durationMs || 180000)));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;
  await sendMinigameRolePing(channel, cfg);
  const attachment = buildPromptImageAttachment("Indovina la città", [pick.landmark, pick.country ? `Paese: ${pick.country}` : ""].filter(Boolean), "guess_city", "", client, isBurrobirraActiveForChannel(client, channelId));
  const imageUrl = attachment ? `attachment://${attachment.name}` : null;
  const embed = buildGuessCityEmbed(pick.landmark, rewardExp, durationMs, imageUrl);
  const gameMessage = await sendMinigameMessage(channel, { embeds: [embed], files: attachment ? [attachment] : [] }, MINIGAME_QUESTION_BURROBIRRA).catch(() => null);
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
  stampMinigameBurrobirraApplies(channelId, client);
  markSent(channelId);
  return true;
}

function getTreasureHuntCfg(cfg?) {
  return cfg?.treasureHunt && typeof cfg.treasureHunt === "object"
    ? cfg.treasureHunt
    : null;
}

function normalizeTreasureEmojiKey(value?) {
  return String(value || "")
    .replace(/\uFE0F|\uFE0E/g, "")
    .trim();
}

function unicodeTreasureReactVariants(token?) {
  const s = String(token || "").trim();
  if (!s || s.startsWith("<") || /^\d{16,20}$/.test(s) || /^:[a-zA-Z0-9_]+:$/.test(s)) {
    return s ? [s] : [];
  }
  const stripped = normalizeTreasureEmojiKey(s);
  const withVs = stripped ? `${stripped}\uFE0F` : "";
  const out = [];
  for (const v of [s, stripped, withVs]) {
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

function parseTreasureEmojiToken(raw?) {
  const s = String(raw || "").trim();
  if (!s) return { display: "", react: "", id: "", name: "", animated: false };
  const m = s.match(/^<(a)?:([^:>]+):(\d{16,20})>$/);
  if (m) {
    return {
      display: s,
      react: s,
      id: m[3],
      name: m[2],
      animated: Boolean(m[1]),
    };
  }
  const short = s.match(/^:([a-zA-Z0-9_]+):$/);
  if (short) {
    return { display: s, react: s, id: "", name: short[1], animated: false };
  }
  if (/^\d{16,20}$/.test(s)) return { display: s, react: s, id: s, name: "", animated: false };
  return { display: s, react: s, id: "", name: s, animated: false };
}

function findGuildEmojiForTreasure(guild?, parsed?) {
  if (!guild?.emojis?.cache) return null;
  if (parsed?.id) {
    const byId = guild.emojis.cache.get(parsed.id);
    if (byId) return byId;
  }
  const name = String(parsed?.name || "").replace(/^:+|:+$/g, "").trim();
  if (!name) return null;
  return guild.emojis.cache.find((e?) => String(e.name || "") === name) || null;
}

function treasureEmojiMarkup(parsed?) {
  if (!parsed?.id || !parsed?.name) return "";
  return parsed.animated
    ? `<a:${parsed.name}:${parsed.id}>`
    : `<:${parsed.name}:${parsed.id}>`;
}

async function ensureGuildEmojisForTreasure(guild?) {
  if (!guild?.emojis?.fetch) return;
  if (guild.emojis.cache.size < 5) {
    await guild.emojis.fetch().catch(() => null);
  }
}

function formatTreasureEmojiForEmbed(guild?, token?) {
  const parsed = parseTreasureEmojiToken(token);
  const idMarkup = treasureEmojiMarkup(parsed);
  if (idMarkup) {
    const guildEmoji = findGuildEmojiForTreasure(guild, parsed);
    return guildEmoji ? guildEmoji.toString() : idMarkup;
  }
  const guildEmoji = findGuildEmojiForTreasure(guild, parsed);
  if (guildEmoji) return guildEmoji.toString();
  return parsed.display || String(token || "").trim();
}

function treasureReactTokenUsableInGuild(guild?, parsed?) {
  if (!parsed) return false;
  if (!parsed.id) return Boolean(String(parsed.react || "").trim());
  const guildEmoji = findGuildEmojiForTreasure(guild, parsed);
  if (!guildEmoji) return false;
  return guildEmoji.available !== false;
}

async function resolveTreasureReactToken(guild?, raw?, fallbackIndex = 0) {
  const rawStr = String(raw || "").trim();
  const parsed = parseTreasureEmojiToken(rawStr);
  if (guild?.emojis?.fetch && guild.emojis.cache.size < 5) {
    await guild.emojis.fetch().catch(() => null);
  }
  if (treasureReactTokenUsableInGuild(guild, parsed)) {
    const guildEmoji = findGuildEmojiForTreasure(guild, parsed);
    if (guildEmoji) return guildEmoji.toString();
    return parsed.react || rawStr;
  }
  const fb = TREASURE_HUNT_REACT_FALLBACKS[fallbackIndex % TREASURE_HUNT_REACT_FALLBACKS.length];
  return fb || "\u2693";
}

async function normalizeTreasureEmojiPair(guild?, pair?) {
  if (!pair) return pair;
  const decoyRaw = String(pair.decoy || "").trim();
  const winnerRaw = String(pair.winner || "").trim();
  const decoyReact = await resolveTreasureReactToken(guild, decoyRaw, 0);
  const winnerReact = await resolveTreasureReactToken(guild, winnerRaw, 1);
  return {
    decoy: decoyReact,
    winner: winnerReact,
    decoyDisplay: formatTreasureEmojiForEmbed(guild, decoyRaw),
    winnerDisplay: formatTreasureEmojiForEmbed(guild, winnerRaw),
  };
}

function treasureEmojiMatches(reactionEmoji?, token?) {
  const parsed = parseTreasureEmojiToken(token);
  const rid = String(reactionEmoji?.id || "");
  const rname = String(reactionEmoji?.name || "");
  if (parsed.id && rid) return parsed.id === rid;
  const tokenKey = normalizeTreasureEmojiKey(parsed.name || token);
  const reactKey = normalizeTreasureEmojiKey(rname);
  if (tokenKey && reactKey && tokenKey === reactKey) return true;
  return rname === String(token || "").trim();
}

function findMessageReactionByToken(message?, token?) {
  if (!message?.reactions?.cache) return null;
  const parsed = parseTreasureEmojiToken(token);
  return (
    message.reactions.cache.find((r?) => treasureEmojiMatches(r.emoji, token)) ||
    (parsed.id
      ? message.reactions.cache.find((r?) => String(r.emoji?.id || "") === parsed.id)
      : null)
  );
}

async function botPlacedTreasureReaction(message?, token?, client?) {
  const reaction = findMessageReactionByToken(message, token);
  if (!reaction) return false;
  let live = reaction;
  if (live.partial) {
    live = await live.fetch().catch(() => null);
    if (!live) return false;
  }
  if (live.me) return true;
  const botId = String(client?.user?.id || message?.client?.user?.id || "");
  if (!botId) return false;
  if (live.users?.cache?.has(botId)) return true;
  if (Number(live.count || 0) > 0 && typeof live.users?.fetch === "function") {
    const users = await live.users.fetch().catch(() => null);
    return Boolean(users?.has(botId));
  }
  return false;
}

function isTreasureReactAlreadyPresentError(err?) {
  const code = Number(err?.code ?? err?.rawError?.code);
  if ([10014, 90001].includes(code)) return false;
  const msg = String(err?.message || err?.rawError?.message || "");
  return /already\s+(reacted|added)|reaction\s+already/i.test(msg);
}

function treasureReactErrorMeta(err?) {
  if (!err) return null;
  return {
    code: err?.code ?? err?.rawError?.code ?? null,
    status: err?.status ?? err?.httpStatus ?? err?.rawError?.status ?? null,
    message: String(err?.message || err?.rawError?.message || err || "").slice(0, 180),
  };
}

function isTreasureReactRateLimited(err?) {
  const status = Number(err?.status ?? err?.httpStatus ?? err?.rawError?.status);
  if (status === 429) return true;
  const code = Number(err?.code ?? err?.rawError?.code);
  if (code === 429) return true;
  const msg = String(err?.message || err?.rawError?.message || "");
  return /rate\s*limit|too many requests|429/i.test(msg);
}

function treasureReactRetryAfterMs(err?, attempt = 0) {
  const raw =
    err?.retryAfter ??
    err?.rawError?.retry_after ??
    err?.data?.retry_after ??
    err?.response?.headers?.["retry-after"];
  const asNum = Number(raw);
  if (Number.isFinite(asNum) && asNum > 0) {
    return Math.min(8000, Math.max(250, asNum < 50 ? asNum * 1000 : asNum));
  }
  return Math.min(4000, 350 * (attempt + 1));
}

function sleepMs(ms?) {
  return new Promise((resolve?) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function treasureEmojiKeySet(values?) {
  const out = new Set();
  for (const value of Array.isArray(values) ? values : [values]) {
    const raw = String(value || "").trim();
    if (!raw) continue;
    out.add(raw);
    out.add(normalizeTreasureEmojiKey(raw));
  }
  out.delete("");
  return out;
}

async function reactTreasureHuntEmojiWithFallbacks(message?, token?, options: Record<string, any> = {}) {
  const intended = String(token || "").trim();
  if (!intended || typeof message?.react !== "function") {
    return { token: null, lastError: null };
  }
  const client = message.client;
  const exclude = treasureEmojiKeySet(options.exclude);
  const baseMeta = {
    channelId: String(message?.channelId || message?.channel?.id || ""),
    messageId: String(message?.id || ""),
    intended,
  };
  if (await botPlacedTreasureReaction(message, intended, client).catch(() => false)) {
    logTreasureHuntReactDebug("reaction already present before react", baseMeta);
    return { token: intended, lastError: null };
  }

  let lastError = null;
  const tryPlace = async (candidate?, label?) => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await reactTreasureHuntEmoji(message, candidate, { quiet: true });
      if (result === true || result?.ok) {
        logTreasureHuntReactDebug(`${label} react ok`, {
          ...baseMeta,
          candidate,
          attempt,
        });
        return candidate;
      }
      const err = result?.error || null;
      if (err) lastError = err;
      if (err && isTreasureReactRateLimited(err)) {
        const waitMs = treasureReactRetryAfterMs(err, attempt);
        logTreasureHuntReactDebug(`${label} rate limited, retrying`, {
          ...baseMeta,
          candidate,
          attempt,
          waitMs,
          err: treasureReactErrorMeta(err),
        });
        await sleepMs(waitMs);
        continue;
      }
      break;
    }
    const live = await message.fetch().catch(() => message);
    if (findMessageReactionByToken(live, candidate)) {
      logTreasureHuntReactDebug(`${label} visible after fetch`, { ...baseMeta, candidate });
      return candidate;
    }
    return null;
  };

  const primary = await tryPlace(intended, "primary");
  if (primary) return { token: primary, lastError: null };

  const afterPrimary = await message.fetch().catch(() => message);
  if (findMessageReactionByToken(afterPrimary || message, intended)) {
    logTreasureHuntReactDebug("primary react visible after fetch", baseMeta);
    return { token: intended, lastError: null };
  }

  const candidates = [];
  const seen = treasureEmojiKeySet([intended, ...exclude]);
  const add = (t?) => {
    const key = String(t || "").trim();
    if (!key) return;
    const norm = normalizeTreasureEmojiKey(key);
    if (seen.has(key) || seen.has(norm)) return;
    seen.add(key);
    seen.add(norm);
    candidates.push(key);
  };
  for (const fb of TREASURE_HUNT_REACT_FALLBACKS) add(fb);
  for (const fb of TREASURE_HUNT_REACT_SAFE_EXTRAS) add(fb);

  for (const candidate of candidates) {
    await sleepMs(280);
    if (findMessageReactionByToken(afterPrimary || message, candidate)) {
      logTreasureHuntReactDebug("fallback already present", { ...baseMeta, fallback: candidate });
      return { token: candidate, lastError: null };
    }
    const placed = await tryPlace(candidate, "fallback");
    if (placed) return { token: placed, lastError: null };
  }

  const latest = await message.fetch().catch(() => afterPrimary || message);
  if (findMessageReactionByToken(latest, intended)) {
    logTreasureHuntReactDebug("intended reaction visible on final fetch", baseMeta);
    return { token: intended, lastError: null };
  }
  for (const candidate of candidates) {
    if (findMessageReactionByToken(latest, candidate)) {
      logTreasureHuntReactDebug("fallback visible on final fetch", { ...baseMeta, fallback: candidate });
      return { token: candidate, lastError: null };
    }
  }
  logTreasureHuntReactDebug("all react attempts failed", {
    ...baseMeta,
    fallbackCount: candidates.length,
    exclude: [...exclude],
    lastError: treasureReactErrorMeta(lastError),
  });
  return { token: null, lastError };
}

async function reactTreasureHuntEmoji(message?, token?, options: Record<string, any> = {}) {
  const quiet = options.quiet === true;
  const parsed = parseTreasureEmojiToken(token);
  if (!parsed.react || typeof message?.react !== "function") {
    return { ok: false, error: null };
  }
  const guild = message.guild;
  const client = message.client;
  let lastError = null;
  const logReactError = (err?) => {
    lastError = err;
    if (!quiet && !isBenignDiscordMinigameError(err)) warnMinigame(err);
  };
  const acceptIfPresent = async (err?) => {
    if (isTreasureReactAlreadyPresentError(err)) return true;
    const live = await message.fetch().catch(() => message);
    return Boolean(findMessageReactionByToken(live, token));
  };
  if (parsed.id) {
    let emoji =
      guild?.emojis?.cache?.get(parsed.id) ||
      client?.emojis?.cache?.get(parsed.id);
    if (!emoji && guild?.emojis?.fetch) {
      emoji = await guild.emojis.fetch(parsed.id).catch(() => null);
    }
    if (emoji && emoji.available !== false) {
      try {
        await message.react(emoji);
        return { ok: true, error: null };
      } catch (err) {
        if (await acceptIfPresent(err)) return { ok: true, error: null };
        logReactError(err);
        if (isTreasureReactRateLimited(err)) return { ok: false, error: err };
      }
    }
    try {
      await message.react(parsed.display);
      return { ok: true, error: null };
    } catch (errA) {
      try {
        await message.react({
          id: parsed.id,
          name: parsed.name || "emoji",
          animated: parsed.animated,
        });
        return { ok: true, error: null };
      } catch (errB) {
        if (await acceptIfPresent(errB)) return { ok: true, error: null };
        logReactError(errB);
        return { ok: false, error: errB };
      }
    }
  }
  for (const variant of unicodeTreasureReactVariants(parsed.react)) {
    try {
      await message.react(variant);
      return { ok: true, error: null };
    } catch (err) {
      if (await acceptIfPresent(err)) return { ok: true, error: null };
      logReactError(err);
      if (isTreasureReactRateLimited(err)) return { ok: false, error: err };
    }
  }
  return { ok: false, error: lastError };
}

async function catchUpTreasureHuntReactions(channel?, game?) {
  if (!channel?.messages?.fetch || !game || !Array.isArray(game.candidateIds)) return;
  for (let i = 0; i < game.candidateIds.length; i += 1) {
    const msgId = String(game.candidateIds[i] || "");
    if (!msgId) continue;
    const msg = await channel.messages.fetch(msgId).catch(() => null);
    if (!msg) continue;
    const isWinner = i + 1 === Number(game.winnerIndex);
    const token = isWinner ? game.winner : game.decoy;
    if (findMessageReactionByToken(msg, token)) {
      if (isWinner && !game.winnerMessageId) {
        game.winnerMessageId = msgId;
        game.botWinnerReactionReady = true;
      }
      continue;
    }
    const placedResult = await reactTreasureHuntEmojiWithFallbacks(msg, token, {
      exclude: [isWinner ? game.decoy : game.winner],
    });
    const placed = placedResult?.token || null;
    if (!placed) continue;
    if (isWinner && placed !== game.winner) game.winner = placed;
    if (!isWinner && placed !== game.decoy) game.decoy = placed;
    if (isWinner) {
      game.winnerMessageId = msgId;
      game.botWinnerReactionReady = true;
    }
  }
}

async function mountTreasureHuntGame(client?, cfg?, channel?, state?, remainingMs?) {
  const parsed = parseStateTarget(state.target);
  const decoy = String(parsed?.decoy || "");
  const winner = String(parsed?.winner || "");
  const decoyDisplay = String(parsed?.decoyDisplay || decoy);
  const winnerDisplay = String(parsed?.winnerDisplay || winner);
  const winnerMessageId = parsed?.winnerMessageId ? String(parsed.winnerMessageId) : null;
  const candidateIds = Array.isArray(parsed?.candidateIds) ? parsed.candidateIds.map(String) : [];
  const introMessageId = parsed?.introMessageId ? String(parsed.introMessageId) : null;
  const targetCount = Math.max(1, Number(parsed?.targetCount || candidateIds.length || 0));
  const winnerIndex = Math.max(1, Number(parsed?.winnerIndex || 1));
  const collectedCount = Math.max(0, Number(parsed?.collectedCount ?? candidateIds.length));
  const endsAt = new Date(state.endsAt).getTime();
  if (!decoy || !winner || !targetCount || remainingMs <= 0) return null;
  const timeout = setTimeout(async () => {
    const game = activeGames.get(cfg.channelId);
    if (!game || game.type !== "treasureHunt") return;
    if (game._podiumClosing) return;
    recordNoParticipationIfNeeded(cfg.channelId, game);
    activeGames.delete(cfg.channelId);
    await finishTreasureHuntByTimeout(client, cfg, channel, game);
  }, remainingMs);
  timeout.unref?.();
  const game = {
    type: "treasureHunt",
    rewardExp: Number(state.rewardExp || 0),
    startedAt: new Date(state.startedAt).getTime(),
    endsAt,
    timeout,
    decoy,
    winner,
    decoyDisplay,
    winnerDisplay,
    winnerMessageId,
    botWinnerReactionReady: Boolean(winnerMessageId),
    winnerIndex,
    targetCount,
    collectedCount,
    candidateIds,
    introMessageId,
  };
  restoreHogwartsPodiumFromState(cfg.channelId, state, game);
  activeGames.set(cfg.channelId, game);
  await ensureGuildEmojisForTreasure(channel.guild);
  await catchUpTreasureHuntReactions(channel, game);
  await primeTreasureHuntRecentMessages(channel, client, cfg, game);
  if (game.winnerMessageId && !winnerMessageId) {
    await persistTreasureHuntState(client, cfg, game);
  }
  return game;
}

async function ensureTreasureHuntGame(client?, cfg?) {
  const channelId = cfg?.channelId;
  if (!channelId) return null;
  if (channelWinClosing.has(String(channelId))) return null;
  if (isMinigameRehydrateBlocked(channelId)) return null;
  const cached = activeGames.get(channelId);
  if (cached?.type === "treasureHunt") return cached;
  let guildId = String(cfg?.guildId || "").trim();
  const channel = await getChannelCached(client, channelId);
  if (!channel?.guild) return null;
  if (!guildId) guildId = String(channel.guild.id || "");
  const state = await minigameStateFindOneLean({ guildId, channelId }).catch(() => null);
  if (!state || state.type !== "treasureHunt") return null;
  const endsAt = new Date(state.endsAt).getTime();
  const remainingMs = endsAt - Date.now();
  if (remainingMs <= 0) {
    await closeExpiredMinigameState(client, { ...cfg, guildId }, channel, state);
    return null;
  }
  const podiumProbe = { type: "treasureHunt" };
  restoreHogwartsPodiumFromState(channelId, state, podiumProbe);
  if (isHogwartsPodiumWinMode(cfg, "treasureHunt", podiumProbe) && isHogwartsPodiumRoundComplete(podiumProbe, channelId)) {
    await recoverTreasureHuntPodiumLeaderboard(client, { ...cfg, guildId }, channel, state);
    return null;
  }
  return mountTreasureHuntGame(client, { ...cfg, guildId }, channel, state, remainingMs);
}

async function mountHogwartsQuizGameFromState(client?, cfg?, channel?, state?, remainingMs?) {
  const game = createHogwartsQuizGameFromState(state, cfg);
  const timeout = scheduleMinigameRoundTimeout(client, cfg, cfg.channelId, channel, remainingMs);
  const hintTimeout = await scheduleGenericHint(
    client,
    cfg.channelId,
    remainingMs,
    `Risposta: ${buildRevealHint(game.displayAnswer)}`,
  );
  game.timeout = timeout;
  game.hintTimeout = hintTimeout;
  restoreHogwartsPodiumFromState(cfg.channelId, state, game);
  if (isHogwartsPodiumWinMode(cfg, "hogwartsQuiz", game) && isHogwartsPodiumRoundComplete(game, cfg.channelId)) {
    clearMinigameRoundTimers(game);
    await clearActiveGame(client, { ...cfg, guildId: String(cfg?.guildId || channel?.guild?.id || "") });
    return null;
  }
  activeGames.set(cfg.channelId, game);
  await catchUpTextMinigameWinFromHistory(client, cfg, channel, game).catch(() => false);
  return activeGames.get(cfg.channelId) || null;
}

async function ensureHogwartsQuizGame(client?, cfg?) {
  const channelId = cfg?.channelId;
  if (!channelId) return null;
  if (channelWinClosing.has(String(channelId))) return null;
  if (isMinigameRehydrateBlocked(channelId)) return null;
  const cached = activeGames.get(channelId);
  if (cached?.type === "hogwartsQuiz") {
    resolveHogwartsQuizAnswerPool(cached);
    return cached;
  }
  let guildId = String(cfg?.guildId || "").trim();
  const channel = await getChannelCached(client, channelId);
  if (!channel?.guild) return null;
  if (!guildId) guildId = String(channel.guild.id || "");
  const state = await minigameStateFindOneLean({ guildId, channelId }).catch(() => null);
  if (!state || state.type !== "hogwartsQuiz") return null;
  const endsAt = new Date(state.endsAt).getTime();
  const remainingMs = endsAt - Date.now();
  if (remainingMs <= 0) return null;
  return await mountHogwartsQuizGameFromState(client, { ...cfg, guildId }, channel, state, remainingMs);
}

async function treasureHuntDisplayTexts(guild?, gameOrDecoy?, winnerOrGame?) {
  await ensureGuildEmojisForTreasure(guild);
  if (gameOrDecoy && typeof gameOrDecoy === "object") {
    const game = gameOrDecoy;
    return {
      decoy: formatTreasureEmojiForEmbed(guild, game.decoyDisplay || game.decoy),
      winner: formatTreasureEmojiForEmbed(guild, game.winnerDisplay || game.winner),
    };
  }
  return {
    decoy: formatTreasureEmojiForEmbed(guild, gameOrDecoy),
    winner: formatTreasureEmojiForEmbed(guild, winnerOrGame),
  };
}

function pickTreasureHuntBucket(treasureCfg?) {
  const buckets = Array.isArray(treasureCfg?.buckets) ? treasureCfg.buckets : [];
  const usable = buckets.filter((b?) => b && typeof b === "object");
  if (usable.length === 0) {
    return { minMessages: 20, maxMessages: 50, minDurationMs: 90000, maxDurationMs: 180000, rewardExp: 150 };
  }
  const totalWeight = usable.reduce((acc?, b?) => acc + (Number(b.weight) > 0 ? Number(b.weight) : 1), 0);
  let pick = Math.random() * totalWeight;
  for (const b of usable) {
    const w = Number(b.weight) > 0 ? Number(b.weight) : 1;
    if (pick < w) return b;
    pick -= w;
  }
  return usable[usable.length - 1];
}

function pickTreasureHuntEmojiPair(channelId?, treasureCfg?, cfg = null) {
  const fromCfg = Array.isArray(treasureCfg?.emojiPairs) ? treasureCfg.emojiPairs : [];
  const cfgPairs = fromCfg
    .map((p?) => ({
      decoy: String(p?.decoy || "").trim(),
      winner: String(p?.winner || "").trim(),
    }))
    .filter((p?) => p.decoy && p.winner);
  const pairs = cfgPairs.length
    ? cfgPairs
    : pickHogwartsBonusBank(cfg, "treasureHunt", getTreasureHuntEmojiPairs() || [], getHogwartsTreasureHuntEmojiPairs) || [];
  if (!pairs.length) return null;
  const pick = pickQuestionAvoidRecent(
    channelId,
    "treasureHunt",
    pairs,
    (p?) => `${p.decoy}|${p.winner}`,
    Math.max(3, Math.floor(pairs.length / 2)),
  );
  return pick || pickRandomItem(pairs);
}

async function removeTreasureHuntReactions(channel?, candidateIds?, decoyEmoji?, winnerEmoji?) {
  if (!channel?.messages?.fetch || !Array.isArray(candidateIds)) return;
  const botUser = channel.client?.user;
  if (!botUser) return;
  for (const id of candidateIds) {
    const msg = await channel.messages.fetch(String(id)).catch(() => null);
    if (!msg?.reactions?.cache) continue;
    for (const emoji of [decoyEmoji, winnerEmoji]) {
      const reaction = findMessageReactionByToken(msg, emoji);
      if (reaction) {
        await reaction.users.remove(botUser.id).catch(() => {});
      }
    }
  }
}

function buildTreasureHuntStartEmbed(decoyDisplay?, winnerDisplay?, targetCount?, durationMs?, rewardExp?) {
  const minutes = Math.max(1, Math.round(Number(durationMs || 0) / 60000));
  const decoyText = String(decoyDisplay || "").trim() || "la reaction indicata";
  const winnerText = String(winnerDisplay || "").trim() || "quella vincente";
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("<a:VC_Events:1482706144953897223> Caccia al tesoro<a:VC_Exclamation:1482534702077444217>")
    .setDescription(
      [
        `<:VC_Stats:1482527532682055780> Sui prossimi messaggi in chat metterò la reaction ${decoyText}.`,
        `<a:VC_Flame:1482725674711126140> Su **uno solo** comparirà ${winnerText}: trovalo e cliccaci sopra per primo!`,
        "",
        `<:VC_EXP:1482534670896730143> In palio: **${rewardExp} exp**`,
        `<a:VC_pixeltime:1482535344103620771> Hai circa **${minutes} min** prima che la caccia finisca.`,
      ].join("\n"),
    )
    .setFooter({ text: 'Clicca la reaction "vincente" sul messaggio giusto per vincere.' });
}

function serializeTreasureHuntTarget(game?) {
  return JSON.stringify({
    decoy: game.decoy,
    winner: game.winner,
    decoyDisplay: game.decoyDisplay || game.decoy,
    winnerDisplay: game.winnerDisplay || game.winner,
    winnerMessageId: game.winnerMessageId || "",
    candidateIds: Array.isArray(game.candidateIds) ? game.candidateIds : [],
    introMessageId: game.introMessageId || null,
    winnerIndex: Number(game.winnerIndex || 0),
    targetCount: Number(game.targetCount || 0),
    collectedCount: Number(game.collectedCount || 0),
  });
}

async function persistTreasureHuntState(client?, cfg?, game?) {
  if (!game || game.type !== "treasureHunt") return;
  await saveActiveGame(client, cfg, {
    type: "treasureHunt",
    target: serializeTreasureHuntTarget(game),
    rewardExp: game.rewardExp,
    startedAt: new Date(game.startedAt),
    endsAt: new Date(game.endsAt),
    gameMessageId: game.introMessageId || null,
  });
}

async function handleTreasureHuntIncomingMessage(message?, client?, cfg?) {
  const channelId = String(cfg?.channelId || "");
  if (channelWinClosing.has(channelId)) return false;
  let live = channelId ? activeGames.get(channelId) : null;
  if (!live || live.type !== "treasureHunt") {
    live = await ensureTreasureHuntGame(client, cfg);
  }
  if (!live || live.type !== "treasureHunt") return false;
  if (live._claiming || live._podiumClosing) return false;
  if (live.winnerMessageId) return false;
  if (
    isHogwartsPodiumWinMode(cfg, live.type, live) &&
    isHogwartsPodiumRoundComplete(live, channelId)
  ) {
    return false;
  }
  const targetCount = Math.max(1, Number(live.targetCount || 0));
  if (Number(live.collectedCount || 0) >= targetCount) return false;
  const startedAt = Number(live.startedAt || 0);
  const createdAt = message.createdTimestamp || message.createdAt?.getTime?.() || 0;
  if (startedAt && createdAt < startedAt - 500) return false;
  if (message.system) return false;
  if (message.author?.bot) return false;
  const msgId = String(message.id);
  if (live.introMessageId && msgId === String(live.introMessageId)) return false;
  if (Array.isArray(live.candidateIds) && live.candidateIds.some((id?) => String(id) === msgId)) {
    return true;
  }
  if (treasureHuntReactLocks.has(msgId)) return false;
  treasureHuntReactLocks.add(msgId);
  try {
  const nextCount = Number(live.collectedCount || 0) + 1;
  const winnerIndex = Math.max(1, Number(live.winnerIndex || 1));
  const isWinner = nextCount === winnerIndex;
  const emoji = isWinner ? live.winner : live.decoy;
  logTreasureHuntReactDebug("incoming candidate", {
    channelId: String(message?.channelId || message?.channel?.id || ""),
    messageId: msgId,
    authorId: String(message?.author?.id || ""),
    nextCount,
    winnerIndex,
    isWinner,
    emoji,
  });
  const excludeOther = [isWinner ? live.decoy : live.winner];
  const ageMs = Math.max(0, Date.now() - Number(createdAt || 0));
  if (ageMs < 350) await sleepMs(350 - ageMs);
  let placeResult = await reactTreasureHuntEmojiWithFallbacks(message, emoji, {
    exclude: excludeOther,
  });
  let placedToken = placeResult?.token || null;
  let lastReactError = placeResult?.lastError || null;
  if (!placedToken) {
    logTreasureHuntReactDebug("primary placement failed, delayed retry", {
      channelId: String(message?.channelId || message?.channel?.id || ""),
      messageId: msgId,
      isWinner,
      emoji,
      err: treasureReactErrorMeta(lastReactError),
    });
    await sleepMs(isWinner ? 700 : 500);
    placeResult = await reactTreasureHuntEmojiWithFallbacks(message, emoji, {
      exclude: excludeOther,
    });
    placedToken = placeResult?.token || null;
    lastReactError = placeResult?.lastError || lastReactError;
  }
  if (!placedToken) {
    const stillThere = await message.fetch().catch(() => null);
    if (stillThere && findMessageReactionByToken(stillThere, emoji)) {
      placedToken = emoji;
    } else if (stillThere) {
      global.logger?.warn?.("[MINIGAMES] TreasureHunt react placement failed", {
        channelId: String(message?.channelId || message?.channel?.id || ""),
        messageId: msgId,
        authorId: String(message?.author?.id || ""),
        nextCount,
        winnerIndex,
        isWinner,
        intendedEmoji: emoji,
        winnerEmoji: live.winner,
        decoyEmoji: live.decoy,
        reactionKeys: Array.from(stillThere.reactions?.cache?.keys?.() || []),
        lastError: treasureReactErrorMeta(lastReactError),
      });
      warnMinigame(new Error(`treasure_hunt_react_failed:${isWinner ? "winner" : "decoy"}:${emoji}`));
      return false;
    }
  } else {
    if (isWinner && placedToken !== live.winner) live.winner = placedToken;
    if (!isWinner && placedToken !== live.decoy) live.decoy = placedToken;
  }
  logTreasureHuntReactDebug("reaction placed", {
    channelId: String(message?.channelId || message?.channel?.id || ""),
    messageId: msgId,
    nextCount,
    isWinner,
    placedToken,
  });
  live.collectedCount = nextCount;
  if (!Array.isArray(live.candidateIds)) live.candidateIds = [];
  live.candidateIds.push(msgId);
  if (isWinner) {
    live.winnerMessageId = msgId;
    live.botWinnerReactionReady = true;
  }
  await persistTreasureHuntState(client, cfg, live);
  return Boolean(placedToken);
  } finally {
    treasureHuntReactLocks.delete(msgId);
  }
}

async function primeTreasureHuntRecentMessages(channel?, client?, cfg?, game?) {
  if (!channel?.messages?.fetch || !game || game.type !== "treasureHunt") return;
  const startedAt = Number(game.startedAt || 0);
  const batch = await channel.messages.fetch({ limit: 30 }).catch(() => null);
  if (!batch?.size) return;
  const sorted = [...batch.values()].sort(
    (a?, b?) => (a.createdTimestamp || 0) - (b.createdTimestamp || 0),
  );
  for (const msg of sorted) {
    if (game.winnerMessageId) break;
    if (Number(game.collectedCount || 0) >= Math.max(1, Number(game.targetCount || 0))) break;
    const createdAt = msg.createdTimestamp || msg.createdAt?.getTime?.() || 0;
    if (startedAt && createdAt < startedAt - 500) continue;
    await handleTreasureHuntIncomingMessage(msg, client, cfg);
  }
}

function buildTreasureHuntTimeoutEmbed(decoyDisplay?, winnerDisplay?, winnerMessageUrl?) {
  const decoyText = String(decoyDisplay || "").trim() || "le reaction";
  const winnerText = String(winnerDisplay || "").trim() || "quella vincente";
  const lines = [
    `<a:VC_pixeltime:1482535344103620771> Tempo scaduto! Nessuno ha trovato la reaction ${winnerText} tra le ${decoyText}.`,
  ];
  if (winnerMessageUrl) {
    lines.push("", `<a:VC_Arrow:1482706699365257397> Era questo messaggio: ${winnerMessageUrl}`);
  }
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("<a:VC_Alert:1482706673176150077> Caccia al tesoro conclusa")
    .setDescription(lines.join("\n"));
}

function buildTreasureHuntFoundEmbed(winnerMessageUrl?) {
  return new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("<a:VC_Winner:1482535294757507255> Tesoro trovato<a:VC_Exclamation:1482534702077444217>")
    .setDescription(
      winnerMessageUrl
        ? `<a:VC_Arrow:1482706699365257397> Il messaggio nascosto era: ${winnerMessageUrl}`
        : "<a:VC_Arrow:1482706699365257397> La caccia è terminata.",
    );
}

function getTreasureHuntMessageUrl(guildId?, channelId?, messageId?) {
  if (!guildId || !channelId || !messageId) return "";
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

async function computeMinigameAwardForUser({ guildId, userId, cfg, baseExp, startedAt, client = null, gameType = "" }) {
  const baseExpNorm = normalizeRewardExp(baseExp || 0);
  const elapsed = typeof startedAt === "number" ? Date.now() - startedAt : Infinity;
  const fastCfg = cfg?.fastGuess ?? {};
  const windowMs = Number(fastCfg.windowMs ?? 30000) || 0;
  const fastMultiplier = Number(fastCfg.multiplier ?? 1.5) || 1;
  const isFastGuess = windowMs > 0 && elapsed <= windowMs;
  const fastBonus = isFastGuess ? Math.round(baseExpNorm * (fastMultiplier - 1)) : 0;
  const streakCfg = cfg?.streak ?? {};
  const percentPerWin = Number(streakCfg.bonusPercentPerWin ?? 10) || 0;
  const maxBonusPercent = Number(streakCfg.maxBonusPercent ?? 50) || 0;
  let doc = await ActivityUserProfile.findOne({ guildId, userId })
    .select("profile.totals.exp.minigame")
    .lean()
    .catch(() => null);
  const prevStreak = Number(doc?.profile?.totals?.exp?.minigame?.currentStreak ?? 0);
  const prevBest = Number(doc?.profile?.totals?.exp?.minigame?.bestStreak ?? 0);
  const newStreak = prevStreak + 1;
  const bestStreak = Math.max(prevBest, newStreak);
  const streakBonusPercent = percentPerWin > 0 ? Math.min((newStreak - 1) * percentPerWin, maxBonusPercent) : 0;
  const streakBonus = Math.round(baseExpNorm * streakBonusPercent / 100);
  const effectiveExp = baseExpNorm + fastBonus + streakBonus;
  try {
    doc = await incrementMinigameWinCounters(guildId, userId, effectiveExp, newStreak, bestStreak);
  } catch (err) {
    warnMinigame(err);
  }
  if (client) {
    const { scheduleRoyaleMinigameRoleSync } = require("../Community/weeklyActivityWinnersService") as typeof import("../Community/weeklyActivityWinnersService");
    scheduleRoyaleMinigameRoleSync(client);
  }
  const nextTotal = Number(doc?.profile?.totals?.exp?.minigame?.totalExp ?? 0);
  ActivityUserProfile.updateMany(
    { guildId, userId: { $ne: userId } },
    { $set: { "profile.totals.exp.minigame.currentStreak": 0 } },
  ).catch((err?) => warnMinigame(err));
  const gameTypeNorm = String(gameType || "").trim();
  const houseAward = client && gameTypeNorm
    ? await awardHogwartsHousePointsForWinner(
      client,
      guildId,
      userId,
      gameTypeNorm,
      getHogwartsHousePointReward(cfg, gameTypeNorm),
      getHogwartsUnsortedHousePointReward(cfg, gameTypeNorm),
    )
    : null;
  const hasDetails = fastBonus > 0 || streakBonus > 0 || Number(houseAward?.points || 0) > 0;
  const details = hasDetails
    ? {
      baseExp: baseExpNorm,
      fastBonus,
      streakBonus,
      newStreak,
      bestStreak,
      housePoints: Number(houseAward?.points || 0),
      allHouses: Boolean(houseAward?.allHouses),
      petMultiplier: Number(houseAward?.petMultiplier || 0),
      petName: houseAward?.petName || "",
    }
    : null;
  return { baseExp: baseExpNorm, effectiveExp, nextTotal, details, newStreak, bestStreak };
}

async function cleanupTreasureHuntReactions(channel?, game?) {
  if (!game?.candidateIds?.length) return;
  await removeTreasureHuntReactions(channel, game.candidateIds, game.decoy, game.winner).catch(() => {});
}

async function sendTreasureHuntFoundOnce(channel?, game?) {
  if (!channel?.send || game?._treasureFoundAnnounced || !game?.winnerMessageId) return false;
  game._treasureFoundAnnounced = true;
  const guildId = channel.guildId || channel.guild?.id;
  const url = getTreasureHuntMessageUrl(guildId, channel.id, game.winnerMessageId);
  await sendMinigameMessage(channel, { embeds: [buildTreasureHuntFoundEmbed(url)] }).catch(() => {});
  return true;
}

async function recoverTreasureHuntPodiumLeaderboard(client?, cfg?, channel?, state?, options: Record<string, any> = {}) {
  const channelId = String(cfg?.channelId || "").trim();
  const guildId = String(cfg?.guildId || channel?.guild?.id || "").trim();
  if (!channelId || !channel?.send || !state || state.type !== "treasureHunt") return false;
  const parsed = parseStateTarget(state.target);
  const game = {
    type: "treasureHunt",
    decoy: String(parsed?.decoy || ""),
    winner: String(parsed?.winner || ""),
    winnerMessageId: parsed?.winnerMessageId ? String(parsed.winnerMessageId) : null,
    candidateIds: Array.isArray(parsed?.candidateIds) ? parsed.candidateIds.map(String) : [],
    rewardExp: Number(state.rewardExp || 0),
    startedAt: new Date(state.startedAt).getTime(),
  };
  restoreHogwartsPodiumFromState(channelId, state, game);
  const podium = isHogwartsPodiumWinMode(cfg, "treasureHunt", game) ? ensureHogwartsPodium(game, channelId) : [];
  if (!podium.length) return false;
  if (!tryClaimMinigameChannelClose(channelId)) return false;
  try {
    clearMinigameRoundTimers(game);
    const embeds = [];
    if (game.winnerMessageId) {
      embeds.push(
        buildTreasureHuntFoundEmbed(getTreasureHuntMessageUrl(guildId, channel.id, game.winnerMessageId)),
      );
    }
    embeds.push(buildHogwartsPodiumSummaryEmbed(cfg, "treasureHunt", podium, options.embedOptions || {}));
    await sendMinigameMessage(channel, { embeds }).catch(() => {});
    await cleanupTreasureHuntReactions(channel, game).catch(() => {});
    await clearActiveGame(client, { ...cfg, guildId, channelId });
    return true;
  } finally {
    endMinigameWinClose(channelId);
  }
}

async function finishTreasureHuntByTimeout(client?, cfg?, channel?, game?) {
  if (!channel?.send) return;
  const channelId = String(cfg?.channelId || "");
  if (!tryClaimMinigameChannelClose(channelId)) return;
  try {
    if (
      isHogwartsPodiumWinMode(cfg, game?.type, game) &&
      ensureHogwartsPodium(game, channelId).length === 0
    ) {
      let guildId = String(cfg?.guildId || channel.guild?.id || "").trim();
      const state = guildId
        ? await minigameStateFindOneLean({ guildId, channelId }).catch(() => null)
        : null;
      if (state) restoreHogwartsPodiumFromState(channelId, state, game);
    }
    const podium = isHogwartsPodiumWinMode(cfg, game?.type, game) ? ensureHogwartsPodium(game, channelId) : [];
    if (podium.length > 0) {
      clearMinigameRoundTimers(game);
      const embeds = [];
      if (game?.winnerMessageId) {
        embeds.push(
          buildTreasureHuntFoundEmbed(
            getTreasureHuntMessageUrl(channel.guildId || channel.guild?.id, channel.id, game.winnerMessageId),
          ),
        );
      }
      embeds.push(buildHogwartsPodiumSummaryEmbed(cfg, game.type, podium, { timedOut: true }));
      await sendMinigameMessage(channel, { embeds }).catch(() => {});
      await cleanupTreasureHuntReactions(channel, game);
      await clearActiveGame(client, cfg);
      return;
    }
    await cleanupTreasureHuntReactions(channel, game);
    const url = getTreasureHuntMessageUrl(channel.guildId || channel.guild?.id, channel.id, game?.winnerMessageId);
    const labels = await treasureHuntDisplayTexts(channel.guild, game);
    await sendMinigameMessage(channel, {
      embeds: [buildTreasureHuntTimeoutEmbed(labels.decoy, labels.winner, url)],
    }).catch(() => {});
    await clearActiveGame(client, cfg);
  } finally {
    endMinigameWinClose(channelId);
  }
}

async function startTreasureHuntGame(client?, cfg?) {
  const channelId = cfg?.channelId;
  if (!channelId) return false;
  if (activeGames.has(channelId)) return false;
  const treasureCfg = getTreasureHuntCfg(cfg);
  if (treasureCfg === null && cfg?.treasureHunt === false) return false;
  const bucket = pickTreasureHuntBucket(treasureCfg);
  const minMessages = Math.max(5, Number(bucket?.minMessages || 20));
  const maxMessages = Math.max(minMessages, Number(bucket?.maxMessages || minMessages));
  const minDurationMs = Math.max(30000, Number(bucket?.minDurationMs || 60000));
  const maxDurationMs = Math.max(minDurationMs, Number(bucket?.maxDurationMs || minDurationMs));
  const rewardExp = normalizeRewardExp(bucket?.rewardExp ?? 150);
  const targetCount = randomBetween(minMessages, maxMessages);
  const winnerIndex = targetCount <= 1 ? 1 : randomBetween(2, targetCount);
  const durationMs = randomBetween(minDurationMs, maxDurationMs);
  const channel = await getChannelCached(client, channelId);
  if (!channel?.isTextBased?.() || !channel.guild) return false;
  await ensureGuildEmojisForTreasure(channel.guild);
  const pairRaw = pickTreasureHuntEmojiPair(channelId, treasureCfg, cfg);
  if (!pairRaw) return false;
  let pair = await normalizeTreasureEmojiPair(channel.guild, pairRaw);
  if (isBurrobirraActiveForChannel(client, channelId)) {
    pair = {
      ...pair,
      decoy: pair.winner,
      winner: pair.decoy,
      decoyDisplay: pair.winnerDisplay || pair.winner,
      winnerDisplay: pair.decoyDisplay || pair.decoy,
      burrobirraSwapped: true,
    };
  }
  if (!pair?.decoy || !pair?.winner) return false;
  const startedAt = Date.now();
  if (cfg.roleId) {
    await sendMinigameRolePing(channel, cfg);
  }
  const timeout = setTimeout(async () => {
    const current = activeGames.get(channelId);
    if (!current || current.type !== "treasureHunt") return;
    if (current._podiumClosing) return;
    recordNoParticipationIfNeeded(channelId, current);
    activeGames.delete(channelId);
    await finishTreasureHuntByTimeout(client, cfg, channel, current);
  }, durationMs);
  timeout.unref?.();
  const game = {
    type: "treasureHunt",
    rewardExp,
    startedAt,
    endsAt: startedAt + durationMs,
    timeout,
    decoy: pair.decoy,
    winner: pair.winner,
    decoyDisplay: pair.decoyDisplay || pair.decoy,
    winnerDisplay: pair.winnerDisplay || pair.winner,
    winnerMessageId: null,
    botWinnerReactionReady: false,
    winnerIndex,
    targetCount,
    collectedCount: 0,
    candidateIds: [],
    introMessageId: null,
  };
  activeGames.set(channelId, game);
  await persistTreasureHuntState(client, cfg, game);
  const introEmbed = buildTreasureHuntStartEmbed(
    pair.decoyDisplay || pair.decoy,
    pair.winnerDisplay || pair.winner,
    targetCount,
    durationMs,
    rewardExp,
  );
  const introMessage = await sendMinigameMessage(channel, { embeds: [introEmbed] }).catch(() => null);
  if (introMessage?.id) {
    game.introMessageId = String(introMessage.id);
    await persistTreasureHuntState(client, cfg, game);
  }
  await primeTreasureHuntRecentMessages(channel, client, cfg, game);
  stampMinigameBurrobirraApplies(channelId, client);
  markSent(channelId);
  return true;
}

async function handleTreasureHuntPodiumReaction(client?, reaction?, user?, message?, game?, cfg?) {
  const botClient = client || message.client;
  const clearCfg = { ...cfg, guildId: message.guild.id };
  const channelId = String(clearCfg.channelId || "");
  const liveReaction = reaction;
  const reg = await tryRegisterHogwartsPodiumEntry(botClient, game, message.guild.id, user.id, channelId);
  if (!reg.ok) {
    if (reg.code === "basilisk_blocked" || reg.code === "hogwarts_blacklisted") {
      await liveReaction.users.remove(user.id).catch(() => {});
      return true;
    }
    if (reg.code === "not_sorted") {
      if (!isHogwartsPodiumEmpty(game, channelId)) {
        await liveReaction.users.remove(user.id).catch(() => {});
        return true;
      }
      if (game._claiming) return true;
      game._claiming = true;
      game.hadParticipation = true;
      blockMinigameRehydrate(channelId);
      if (game.timeout) clearTimeout(game.timeout);
      activeGames.delete(channelId);
      clearNoParticipationDelay(channelId);
      const channel = message.channel || (await getChannelCached(botClient, channelId));
      try {
        const result = await handleHogwartsPodiumUnsortedWin({
          client: botClient,
          guild: message.guild,
          userId: user.id,
          cfg,
          game,
          channelId,
          closeChannel: channel,
          beforeClose: async () => {
            await sendTreasureHuntFoundOnce(channel, game);
            await cleanupTreasureHuntReactions(channel, game);
          },
        });
        if (!result?.closed && channel) {
          await sendTreasureHuntFoundOnce(channel, game);
        }
      } catch (err) {
        warnMinigame(err);
      }
      return true;
    }
    await liveReaction.users.remove(user.id).catch(() => {});
    return true;
  }
  game.hadParticipation = true;
  const channel = message.channel || (await getChannelCached(botClient, channelId));
  try {
    const award = await grantAndStoreHogwartsPodiumAward({
      client: botClient,
      guild: message.guild,
      userId: user.id,
      cfg,
      game,
      channelId,
      reg,
    });
    await sendTreasureHuntFoundOnce(channel, game);
    if (reg.complete) {
      await waitForHogwartsPodiumPendingAwards(channelId);
      await closeHogwartsPodiumRoundIfComplete(botClient, clearCfg, game, channelId, channel);
    } else {
      activeGames.set(channelId, game);
      await persistHogwartsPodium(botClient, clearCfg, game);
      await persistTreasureHuntState(botClient, clearCfg, game);
    }
  } catch (err) {
    warnMinigame(err);
    if (reg.complete) {
      await waitForHogwartsPodiumPendingAwards(channelId).catch(() => { });
      await closeHogwartsPodiumRoundIfComplete(botClient, clearCfg, game, channelId, channel).catch(() => {});
    }
  }
  return true;
}

async function handleMinigameReaction(client?, reaction?, user?) {
  try {
    if (!reaction || !user || user.bot) return false;
    let liveReaction = reaction;
    if (liveReaction.partial) {
      liveReaction = await liveReaction.fetch().catch(() => null);
      if (!liveReaction) return false;
    }
    let message = liveReaction.message;
    if (message?.partial) {
      message = await message.fetch().catch(() => null);
      if (!message) return false;
    }
    if (!message?.guild) return false;
    const cfg = getConfig(client || message.client);
    if (!cfg?.enabled || !cfg.channelId) return false;
    let game = activeGames.get(cfg.channelId);
    if (!game || game.type !== "treasureHunt") {
      game = await ensureTreasureHuntGame(client || message.client, cfg);
    }
    if (!game || game.type !== "treasureHunt") return false;
    if (String(message.channelId || message.channel?.id || "") !== String(cfg.channelId)) return false;
    if (!game.winnerMessageId) return false;
    if (String(message.id) !== String(game.winnerMessageId)) return false;
    if (!treasureEmojiMatches(liveReaction.emoji, game.winner)) return false;
    const botClient = client || message.client;
    const botPlaced =
      Boolean(game.botWinnerReactionReady) ||
      (await botPlacedTreasureReaction(message, game.winner, botClient));
    if (!botPlaced) {
      await liveReaction.users.remove(user.id).catch(() => {});
      return false;
    }
    const podiumMode = isHogwartsPodiumWinMode(cfg, game.type, game);
    if (podiumMode) {
      return handleTreasureHuntPodiumReaction(client, liveReaction, user, message, game, cfg);
    }
    if (game._claiming) return true;
    game.hadParticipation = true;
    game._claiming = true;
    blockMinigameRehydrate(cfg.channelId);
    if (game.timeout) clearTimeout(game.timeout);
    activeGames.delete(cfg.channelId);
    clearNoParticipationDelay(cfg.channelId);
    const guildId = message.guild.id;
    const channel = message.channel
      || (await getChannelCached(client || message.client, cfg.channelId));
    let award;
    try {
      award = await computeMinigameAwardForUser({
        guildId,
        userId: user.id,
        cfg,
        baseExp: game.rewardExp,
        startedAt: game.startedAt,
        client: botClient,
        gameType: "treasureHunt",
      });
    } catch (err) {
      warnMinigame(err);
      activeGames.delete(cfg.channelId);
      return true;
    }
    const member = await message.guild.members.fetch(user.id).catch(() => null);
    const ignoreExp = await shouldIgnoreExpForMember({
      guildId,
      member,
      channelId: cfg.channelId,
    });
    if (!ignoreExp) {
      try {
        await addExpWithLevel(message.guild, user.id, award.effectiveExp, false, true);
      } catch (err) {
        warnMinigame(err);
      }
    }
    const winEmbed = buildWinEmbed(user.id, award.effectiveExp, award.nextTotal, award.details);
    const foundEmbed = buildTreasureHuntFoundEmbed(getTreasureHuntMessageUrl(guildId, cfg.channelId, game.winnerMessageId));
    if (channel?.send) {
      await sendMinigameMessage(channel, { embeds: [foundEmbed, winEmbed] }).catch(() => {});
    }
    if (member) {
      await handleExpReward(client || message.client, member, award.nextTotal);
    }
    if (channel && Array.isArray(game.candidateIds) && game.candidateIds.length) {
      await cleanupTreasureHuntReactions(channel, game);
    }
    await clearActiveGame(client || message.client, { ...cfg, guildId });
    return true;
  } catch (err) {
    warnMinigame(err);
    return false;
  }
}

function is429Error(error?) {
  const status = error?.response?.status;
  const msg = error?.message || String(error);
  return status === 429 || (typeof msg === "string" && msg.includes("429"));
}

async function startHalloweenQuizGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const bank = getHalloweenQuizBank();
  const localPick = pickQuestionAvoidRecent(channelId, "halloweenQuiz", bank, (q?) => q?.question, 20);
  if (!localPick?.question || !Array.isArray(localPick?.answers)) return false;
  const questionRow = {
    question: polishItalianQuestionText(String(localPick.question)),
    answers: buildAliases(localPick.answers),
  };
  if (!questionRow.answers.length) return false;
  const rewardExp = normalizeRewardExp(cfg?.halloweenQuiz?.rewardExp ?? cfg?.italianGK?.rewardExp ?? 150);
  const durationMs = applyBurrobirraStrongDurationMs(client, channelId, Math.max(60000, Number(cfg?.halloweenQuiz?.durationMs || 180000)));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;
  await sendMinigameRolePing(channel, cfg);
  const attachment = buildPromptImageAttachment("Quiz Halloween", [questionRow.question], "halloween_quiz", "", client, isBurrobirraActiveForChannel(client, channelId));
  const embed = buildItalianGkEmbed(questionRow.question, rewardExp, durationMs).setTitle("Quiz Halloween 🎃");
  if (attachment) embed.setImage(`attachment://${attachment.name}`);
  const gameMessage = await sendMinigameMessage(channel, { embeds: [embed], files: attachment ? [attachment] : [] }, MINIGAME_QUESTION_BURROBIRRA).catch(() => null);
  const displayAnswer = String(localPick.answers[0] || questionRow.answers[0] || "sconosciuta");
  const timeout = scheduleMinigameRoundTimeout(client, cfg, channelId, channel, durationMs);
  const hintTimeout = await scheduleGenericHint(client, channelId, durationMs, `Risposta: ${buildRevealHint(displayAnswer)}`);
  activeGames.set(channelId, {
    type: "halloweenQuiz",
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
    type: "halloweenQuiz",
    target: JSON.stringify({ question: questionRow.question, answers: questionRow.answers, displayAnswer }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });
  stampMinigameBurrobirraApplies(channelId, client);
  markSent(channelId);
  return true;
}

async function startHalloweenFindGhostGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const durationMs = applyBurrobirraStrongDurationMs(client, channelId, Math.max(60000, Number(cfg?.halloweenFindGhost?.durationMs || cfg?.findBot?.durationMs || 300000)));
  const rewardExp = normalizeRewardExp(cfg?.halloweenFindGhost?.rewardExp ?? cfg?.findBot?.rewardExp ?? 200);
  const requiredRoleId = cfg?.findBot?.requiredRoleId || null;
  const excludedChannelIds = cfg?.findBot?.excludedChannelIds || null;
  const mainChannel = await getChannelCached(client, channelId);
  if (!mainChannel?.guild) return false;
  let targetChannel = await pickRandomFindBotChannel(mainChannel.guild, requiredRoleId, channelId, excludedChannelIds);
  if (!targetChannel) targetChannel = await pickRandomFindBotChannel(mainChannel.guild, requiredRoleId, null, excludedChannelIds);
  if (!targetChannel) return false;
  await sendMinigameRolePing(mainChannel, cfg, cfg.roleId);
  const findBotAttachment = buildPromptImageAttachment("Trova il fantasma", ["Cerca il messaggio nascosto in un canale del server.", "Clicca il pulsante quando lo trovi!"], "halloween_find_ghost", "", client, false);
  const findBotEmbed = buildFindBotEmbed(rewardExp, durationMs)
    .setTitle("Trova il fantasma 👻")
    .setDescription(
      [
        `<:VC_Halloween:1558964785113206824> Un fantasma si è nascosto in un canale del server!`,
        `<:VC_EXP:1482534670896730143> Chi lo trova vince **${rewardExp} exp**.`,
        `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(Math.max(1, Math.round(durationMs / 60000)))} per cercarlo.`,
      ].join("\n"),
    );
  if (findBotAttachment) findBotEmbed.setImage(`attachment://${findBotAttachment.name}`);
  const mainMessage = await sendMinigameMessage(mainChannel, { embeds: [findBotEmbed], files: findBotAttachment ? [findBotAttachment] : [] }).catch(() => null);
  const customId = `minigame_findghost:${Date.now()}`;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(customId)
      .setEmoji("<:VC_Halloween:1558964785113206824>")
      .setLabel("Ho trovato il fantasma!")
      .setStyle(ButtonStyle.Primary),
  );
  const gameMessage = await sendMinigameMessage(targetChannel, {
    embeds: [buildHalloweenFindGhostFoundEmbed(rewardExp, durationMs)],
    components: [row],
  }).catch(() => null);
  if (!gameMessage) return false;
  const timeout = scheduleFindMinigameTimeout(client, cfg, channelId, mainChannel, customId, durationMs, () =>
    buildTimeoutFindBotEmbed().setTitle("Tempo scaduto — il fantasma è scappato 👻"),
  );
  const hintTimeout = await scheduleMinuteHint(client, targetChannel.id, durationMs, channelId);
  activeGames.set(channelId, {
    type: "halloweenFindGhost",
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout,
    channelId: targetChannel.id,
    messageId: gameMessage?.id || null,
    mainMessageId: mainMessage?.id || null,
    customId,
  });
  await saveActiveGame(client, cfg, {
    type: "halloweenFindGhost",
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    targetChannelId: targetChannel.id,
    gameMessageId: gameMessage?.id || null,
    mainMessageId: mainMessage?.id || null,
    customId,
  });
  stampMinigameBurrobirraApplies(channelId, client);
  markSent(channelId);
  return true;
}

async function startHalloweenMissingEmojiGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const pick = buildHalloweenMissingEmojiRound();
  if (!pick?.missing) return false;
  const rewardExp = normalizeRewardExp(cfg?.halloweenMissingEmoji?.rewardExp ?? 150);
  const durationMs = applyBurrobirraStrongDurationMs(client, channelId, Math.max(60000, Number(cfg?.halloweenMissingEmoji?.durationMs || 180000)));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;
  await sendMinigameRolePing(channel, cfg);
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const choices = Array.isArray(pick.choices) && pick.choices.length ? pick.choices : [pick.missing];
  const choicesLine = choices.map((e?, i?) => `**${i + 1}.** ${e}`).join("   ");
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Quale emoji manca? 🎃")
    .setDescription(
      [
        `<:VC_Halloween:1558964785113206824> Sequenza: **${pick.display}**`,
        "",
        `Scegli tra queste (scrivi l'emoji):`,
        choicesLine,
        "",
        `Chi indovina vince **${rewardExp} exp**.`,
        `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)}.`,
      ].join("\n"),
    );
  const gameMessage = await sendMinigameMessage(channel, { embeds: [embed] }).catch(() => null);
  const timeout = scheduleMinigameRoundTimeout(client, cfg, channelId, channel, durationMs);
  activeGames.set(channelId, {
    type: "halloweenMissingEmoji",
    display: pick.display,
    missing: pick.missing,
    choices,
    answers: pick.answers,
    displayAnswer: pick.missing,
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout: null,
    gameMessageId: gameMessage?.id || null,
  });
  await saveActiveGame(client, cfg, {
    type: "halloweenMissingEmoji",
    target: JSON.stringify({ display: pick.display, missing: pick.missing, answers: pick.answers, choices }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });
  stampMinigameBurrobirraApplies(channelId, client);
  markSent(channelId);
  return true;
}

async function startHalloweenCountBatsGame(client?, cfg?) {
  const channelId = cfg.channelId;
  if (!channelId || activeGames.has(channelId)) return false;
  const pick = buildHalloweenCountBatsRound();
  if (!pick || !Number.isFinite(pick.count)) return false;
  const rewardExp = normalizeRewardExp(cfg?.halloweenCountBats?.rewardExp ?? 150);
  const durationMs = applyBurrobirraStrongDurationMs(client, channelId, Math.max(60000, Number(cfg?.halloweenCountBats?.durationMs || 180000)));
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;
  await sendMinigameRolePing(channel, cfg);
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const embed = new EmbedBuilder()
    .setColor(MINIGAME_EMBED_COLOR)
    .setTitle("Conta i pipistrelli 🦇")
    .setDescription(
      [
        `${pick.display}`,
        `Quanti 🦇 ci sono? Scrivi il numero per vincere **${rewardExp} exp**.`,
        `> <a:VC_pixeltime:1482535344103620771> Hai ${formatItalianMinutesBold(minutes)}.`,
      ].join("\n"),
    );
  const gameMessage = await sendMinigameMessage(channel, { embeds: [embed] }).catch(() => null);
  const timeout = scheduleMinigameRoundTimeout(client, cfg, channelId, channel, durationMs);
  activeGames.set(channelId, {
    type: "halloweenCountBats",
    display: pick.display,
    count: pick.count,
    answers: pick.answers,
    displayAnswer: String(pick.count),
    rewardExp,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    timeout,
    hintTimeout: null,
    gameMessageId: gameMessage?.id || null,
  });
  await saveActiveGame(client, cfg, {
    type: "halloweenCountBats",
    target: JSON.stringify({ display: pick.display, count: pick.count, answers: pick.answers }),
    rewardExp,
    startedAt: new Date(),
    endsAt: new Date(Date.now() + durationMs),
    gameMessageId: gameMessage?.id || null,
  });
  stampMinigameBurrobirraApplies(channelId, client);
  markSent(channelId);
  return true;
}

async function startHalloweenTrickOrTreatGame(client?, cfg?, options: Record<string, any> = {}) {
  const channelId = cfg.channelId;
  const mapKey = trickOrTreatMapKey(channelId);
  // Solo un ToT per canale; Impiccato/altri minigiochi possono restare attivi in parallelo.
  if (!channelId || activeGames.has(mapKey) || getTrickOrTreatGame(channelId)) return false;
  const channel = await getChannelCached(client, channelId);
  if (!channel) return false;
  const guildId = String(cfg.guildId || channel.guild?.id || "").trim();
  const skipAlternate = Boolean(options.skipAlternate);
  if (!options.skipHourGate && !isWithinHalloweenCandyHours(Date.now())) {
    logMinigameDebug("skip: trick-or-treat outside candy hours 08-24", { channelId });
    return false;
  }

  // Alternanza con caccia emoji: se tocca hunt, spawn hunt al posto del TOT
  if (!skipAlternate && guildId) {
    try {
      const {
        peekNextCandyKind,
        KIND_HUNT,
      } = require("../../Utils/Minigames/halloweenCandyAlternate") as typeof import("../../Utils/Minigames/halloweenCandyAlternate");
      const next = await peekNextCandyKind(guildId);
      if (next === KIND_HUNT) {
        const hunt = require("../Community/halloweenEmojiHuntService") as typeof import("../Community/halloweenEmojiHuntService");
        const huntCfg = hunt.getHalloweenEmojiHuntConfig(client);
        const result = await hunt.spawnHunt(
          client,
          huntCfg,
          guildId,
          `tot-slot:${Date.now()}`,
          channelId,
          { skipAlternate: true },
        );
        return Boolean(result?.ok);
      }
    } catch (err) {
      warnMinigame(err);
    }
  }

  const rewardExp = normalizeRewardExp(cfg?.halloweenTrickOrTreat?.rewardExp ?? 100);
  const durationMs = Math.max(60000, Number(cfg?.halloweenTrickOrTreat?.durationMs || 900000));
  const treatChancePercent = Math.max(0, Math.min(100, Number(cfg?.halloweenTrickOrTreat?.treatChancePercent ?? 80)));
  const candyOnTreat = Math.max(0, Math.floor(Number(cfg?.halloweenTrickOrTreat?.candyOnTreat ?? 1)));
  await sendMinigameRolePing(channel, { ...cfg, guildId: guildId || cfg.guildId });
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  const customId = `minigame_trickortreat:${Date.now()}`;
  const embed = buildTrickOrTreatRoundEmbed({ minutes });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(customId)
      .setEmoji("<:VC_Halloween:1558964785113206824>")
      .setLabel("Trick or Treat!")
      .setStyle(ButtonStyle.Success),
  );
  const gameMessage = await sendMinigameMessage(channel, { embeds: [embed], components: [row] }).catch(() => null);
  if (!gameMessage) return false;
  const startedAt = Date.now();
  const endsAt = startedAt + durationMs;
  const game = {
    type: "halloweenTrickOrTreat",
    rewardExp,
    treatChancePercent,
    candyOnTreat,
    claimedBy: {},
    customId,
    startedAt,
    endsAt,
    timeout: null,
    hintTimeout: null,
    hintSent: false,
    gameMessageId: gameMessage.id,
    multiClaim: true,
  };
  scheduleTrickOrTreatRoundTimers(client, { ...cfg, guildId: guildId || cfg.guildId, channelId }, channel, game);
  const midDelay = Math.max(5_000, Math.floor(durationMs / 2));
  const hintTimeout = setTimeout(async () => {
    const live = activeGames.get(mapKey);
    if (!live || live.type !== "halloweenTrickOrTreat" || live.hintSent) return;
    live.hintSent = true;
    const remainingMs = Math.max(0, Number(live.endsAt || 0) - Date.now());
    const claimed = Object.keys(live.claimedBy || {}).length;
    const roleId = String(cfg?.roleId || IDs.roles?.Minigames || "").trim();
    const jumpUrl = buildTrickOrTreatJumpUrl(guildId, channelId, live.gameMessageId || gameMessage.id);
    const hint = buildTrickOrTreatHintMessage({ remainingMs, claimedCount: claimed, jumpUrl });
    await channel
      .send({
        content: roleId ? `<@&${roleId}>` : undefined,
        ...hint,
        allowedMentions: roleId ? { roles: [roleId] } : { parse: [] },
      })
      .catch(() => {});
  }, midDelay);
  hintTimeout.unref?.();
  game.hintTimeout = hintTimeout;
  activeGames.set(mapKey, game);
  // Pulisci eventuale ToT legacy sullo slot minigioco (non toccare hangman/altro).
  const legacy = activeGames.get(channelId);
  if (legacy?.type === "halloweenTrickOrTreat") activeGames.delete(channelId);
  await saveTrickOrTreatGame(client, { ...cfg, guildId: guildId || cfg.guildId, channelId }, {
    type: "halloweenTrickOrTreat",
    target: JSON.stringify({ treatChancePercent, candyOnTreat, claimedBy: {}, customId }),
    rewardExp,
    startedAt: new Date(startedAt),
    endsAt: new Date(endsAt),
    gameMessageId: gameMessage.id,
    customId,
  });
  if (guildId) {
    try {
      const { commitCandyKind, KIND_TOT } = require("../../Utils/Minigames/halloweenCandyAlternate") as typeof import("../../Utils/Minigames/halloweenCandyAlternate");
      await commitCandyKind(guildId, KIND_TOT);
    } catch (_) {}
  }
  // Dal loop caramelle: non resettare il cooldown minigames (ToT ≠ slot minigioco).
  if (!options.skipMarkSent) markSent(channelId);
  return true;
}

/** Usato dalla caccia emoji quando l’alternanza riserva un round TOT. */
async function startHalloweenTrickOrTreatGameForAlternate(client?, cfg?) {
  return startHalloweenTrickOrTreatGame(client, cfg, { skipAlternate: true, skipMarkSent: true });
}

async function handleHalloweenTrickOrTreatButton(interaction?, game?, cfg?) {
  const userId = String(interaction.user?.id || "");
  if (!userId) return true;
  if (!game.claimedBy || typeof game.claimedBy !== "object") game.claimedBy = {};
  if (game.claimedBy[userId]) {
    await interaction
      .reply({ embeds: [buildAlreadyKnockedEmbed()], flags: 1 << 6 })
      .catch(() => {});
    return true;
  }
  game.claimedBy[userId] = true;
  // Persisti claimedBy sul doc ToT dedicato (non sovrascrivere Impiccato/slot minigioco)
  try {
    const chId = String(interaction.channelId || cfg?.channelId || "").trim();
    if (chId) {
      await saveTrickOrTreatGame(interaction.client, { ...cfg, channelId: chId, guildId: interaction.guildId || cfg?.guildId }, {
        type: "halloweenTrickOrTreat",
        target: JSON.stringify({
          treatChancePercent: game.treatChancePercent,
          candyOnTreat: game.candyOnTreat,
          claimedBy: game.claimedBy,
          customId: game.customId,
        }),
        rewardExp: game.rewardExp,
        startedAt: new Date(game.startedAt || Date.now()),
        endsAt: new Date(game.endsAt || Date.now()),
        gameMessageId: game.gameMessageId || null,
        customId: game.customId,
      });
    }
  } catch (_) {}
  const roll = Math.random() * 100;
  const treat = roll < Number(game.treatChancePercent ?? 80);
  if (!treat) {
    await interaction
      .reply({ embeds: [buildTrickReplyEmbed()], flags: 1 << 6 })
      .catch(() => {});
    return true;
  }
  let candyUnlock = null;
  let candyCompleteLine = "";
  let passAlongPublic = null;
  const candyAmt = Math.max(0, Math.floor(Number(game.candyOnTreat ?? 1)));
  let candyResult = null;
  if (candyAmt > 0) {
    candyResult = await addHalloweenCandyWithPassAlong({
      guildId: interaction.guild.id,
      userId,
      amount: candyAmt,
      eventKey: resolveHalloweenCandyEventKey(interaction.client),
      reason: "trick_or_treat",
      source: "halloweenTrickOrTreat",
      client: interaction.client,
    });
    if (candyResult?.code === "passed_along" && candyResult?.passedToUserId) {
      candyCompleteLine = `🎃 Sacchetto pieno — la caramella vola a <@${candyResult.passedToUserId}>!`;
      candyUnlock = buildHalloweenCandyUnlockPayload({
        candyResult,
        userId: candyResult.passedToUserId,
        expGained: 0,
      });
      passAlongPublic = {
        content: `🍬 <@${userId}> ha il sacchetto pieno — la caramella passa a <@${candyResult.passedToUserId}>!`,
        embeds: candyUnlock?.embeds,
        components: candyUnlock?.components,
        allowedMentions: { users: [userId, candyResult.passedToUserId] },
      };
    } else if (candyResult?.code === "collection_complete") {
      candyCompleteLine = `🎃 Sacchetto pieno — collezione **${candyResult.ownedCount}/${candyResult.total}**!`;
    }
  }
  const baseExp = normalizeRewardExp(game.rewardExp || 0);
  let effectiveExp = baseExp;
  try {
    const doc = await ActivityUserProfile.findOne({ guildId: interaction.guild.id, userId })
      .select("profile.totals.exp.minigame")
      .lean()
      .catch(() => null);
    const prevStreak = Number(doc?.profile?.totals?.exp?.minigame?.currentStreak ?? 0);
    const prevBest = Number(doc?.profile?.totals?.exp?.minigame?.bestStreak ?? 0);
    const newStreak = prevStreak + 1;
    const bestStreak = Math.max(prevBest, newStreak);
    await incrementMinigameWinCounters(interaction.guild.id, userId, baseExp, newStreak, bestStreak);
    const member = await getGuildMemberCached(interaction.guild, userId, { ttlMs: 20_000 }).catch(() => null);
    const ignoreExp = await shouldIgnoreExpForMember({
      guildId: interaction.guild.id,
      member,
      channelId: cfg.channelId || null,
    });
    if (!ignoreExp && baseExp > 0) {
      await addExpWithLevel(interaction.guild, userId, baseExp, false, true);
    }
    effectiveExp = baseExp;
  } catch (err) {
    warnMinigame(err);
  }
  if (candyResult?.ok && candyResult?.code !== "passed_along") {
    candyUnlock = buildHalloweenCandyUnlockPayload({
      candyResult,
      userId,
      expGained: effectiveExp,
    });
  }
  const replyPayload: Record<string, any> = { flags: 1 << 6 };
  if (candyResult?.code === "passed_along") {
    replyPayload.embeds = [
      new EmbedBuilder()
        .setColor(0xff7a18)
        .setTitle("Dolcetto!")
        .setDescription(
          [
            candyCompleteLine,
            effectiveExp > 0 ? `✨ +**${effectiveExp}** exp` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        ),
    ];
  } else if (candyUnlock) {
    replyPayload.embeds = candyUnlock.embeds;
    replyPayload.components = candyUnlock.components;
  } else {
    replyPayload.embeds = [
      new EmbedBuilder()
        .setColor(0xff7a18)
        .setTitle("Dolcetto!")
        .setDescription(
          [
            candyCompleteLine || "🍬 La porta si apre… e trovi un premio!",
            effectiveExp > 0 ? `✨ +**${effectiveExp}** exp` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        ),
    ];
  }
  await interaction.reply(replyPayload).catch(() => {});
  if (passAlongPublic) {
    await interaction.channel?.send?.(passAlongPublic).catch(() => {});
  }
  return true;
}

async function safeStartGameByType(client?, cfg?, gameType?) {
  try {
    await refreshBurrobirraCaches(client);
    if (cfg?.hogwartsEventLive && isHogwartsExclusiveMinigamesEnabled(client, cfg) && !isHogwartsEventMinigameType(gameType, cfg)) return false;
    if (shouldUseHalloweenTheme(cfg) && !isHalloweenMinigameType(gameType)) return false;
    if (gameType === "guessWord") return startGuessWordGame(client, cfg);
    if (gameType === "guessFlag") return startGuessFlagGame(client, cfg);
    if (gameType === "guessPlayer") return startGuessPlayerGame(client, cfg);
    if (gameType === "hogwartsGuessCharacter") return startHogwartsGuessCharacterGame(client, cfg);
    if (gameType === "guessSong") return startGuessSongGame(client, cfg);
    if (gameType === "guessCapital") return startGuessCapitalGame(client, cfg);
    if (gameType === "guessReverseCapital") return startGuessReverseCapitalGame(client, cfg);
    if (gameType === "guessRegionCapital")
      return startGuessRegionCapitalGame(client, cfg);
    if (gameType === "fastType") return startFastTypeGame(client, cfg);
    if (gameType === "guessTeam") return startGuessTeamGame(client, cfg);
    if (gameType === "guessSinger") return startGuessSingerGame(client, cfg);
    if (gameType === "guessAlbum") return startGuessAlbumGame(client, cfg);
    if (gameType === "hangman") return startHangmanGame(client, cfg);
    if (gameType === "italianGK") return startItalianGkGame(client, cfg);
    if (gameType === "hogwartsQuiz") return startHogwartsQuizGame(client, cfg);
    if (gameType === "drivingQuiz") return startDrivingQuizGame(client, cfg);
    if (gameType === "mathExpression")
      return startMathExpressionGame(client, cfg);
    if (gameType === "findBot") return startFindBotGame(client, cfg);
    if (gameType === "halloweenFindGhost") return startHalloweenFindGhostGame(client, cfg);
    if (gameType === "findBotVoice") return startFindBotVoiceGame(client, cfg);
    if (gameType === "findScroll") return startFindScrollGame(client, cfg);
    if (gameType === "memoryEmoji") return startStandardMemoryEmojiGame(client, cfg);
    if (gameType === "hogwartsMemoryEmoji") return startHogwartsMemoryEmojiGame(client, cfg);
    if (gameType === "hogwartsCipher") return startHogwartsCipherGame(client, cfg);
    if (gameType === "hogwartsObservationTower") return startObservationTowerGame(client, cfg);
    if (gameType === "guessNumber") return startGuessNumberGame(client, cfg);
    if (gameType === "guessYear") return startGuessYearGame(client, cfg);
    if (gameType === "completeVerse") return startCompleteVerseGame(client, cfg);
    if (gameType === "guessEmoji") return startGuessEmojiGame(client, cfg);
    if (gameType === "quoteFilm") return startQuoteFilmGame(client, cfg);
    if (gameType === "completeProverb") return startCompleteProverbGame(client, cfg);
    if (gameType === "synonymAntonym") return startSynonymAntonymGame(client, cfg);
    if (gameType === "guessCity") return startGuessCityGame(client, cfg);
    if (gameType === "treasureHunt") return startTreasureHuntGame(client, cfg);
    if (gameType === "halloweenQuiz") return startHalloweenQuizGame(client, cfg);
    if (gameType === "halloweenMissingEmoji") return startHalloweenMissingEmojiGame(client, cfg);
    if (gameType === "halloweenCountBats") return startHalloweenCountBatsGame(client, cfg);
    if (gameType === "halloweenTrickOrTreat") return startHalloweenTrickOrTreatGame(client, cfg);
    return false;
  } catch (error) {
    warnMinigame(error);
    if (is429Error(error)) {
      return { started: false, skipToNext: true };
    }
    global.logger.error(`[MINIGAMES] Start failed for ${gameType}:`, error);
    return false;
  }
}

async function maybeStartRandomGame(client?, force = false) {
  const cfg = getConfig(client);
  let keepPending = false;
  let startedOk = false;
  if (!cfg?.enabled) {
    logMinigameDebug("skip: disabled");
    logMaybeStartSkip(cfg, client, "disabled");
    return false;
  }
  if (!cfg.channelId) {
    logMinigameDebug("skip: missing channelId");
    logMaybeStartSkip(cfg, client, "missing_channel_id");
    return false;
  }
  if (!cfg.guildId) {
    const cachedCh = getChannelSafe(client, cfg.channelId);
    if (cachedCh?.guild?.id) cfg.guildId = String(cachedCh.guild.id);
    else {
      const ch = await getChannelCached(client, cfg.channelId);
      if (ch?.guild?.id) cfg.guildId = String(ch.guild.id);
    }
  }
  if (startingChannels.has(cfg.channelId)) {
    logMinigameDebug("skip: already-starting", { channelId: cfg.channelId });
    logMaybeStartSkip(cfg, client, "already_starting");
    return false;
  }
  startingChannels.add(cfg.channelId);
  clearRolePingSentThisStart(cfg.channelId);
  try {
    if (activeGames.has(cfg.channelId)) {
      const game = activeGames.get(cfg.channelId);
      if (isStaleOrInvalidActiveGame(game)) {
        await closeStaleActiveMinigameChannel(client, cfg, cfg.channelId, game);
        logMinigameDebug("cleanup: stale active game", { channelId: cfg.channelId, type: game?.type || null });
      } else {
        // ToT (caramelle) o altro round ancora vivo: non bruciare lo slot — ritenta dopo.
        keepPending = true;
        logMinigameDebug("skip: active game still running", { channelId: cfg.channelId, type: game?.type || null, endsAt: game?.endsAt || null });
        logMaybeStartSkip(cfg, client, "active_game_running", { type: game?.type || null, endsAt: game?.endsAt || null });
        return false;
      }
    }

    if (
      cfg.hogwartsEventLive &&
      isHogwartsExclusiveMinigamesEnabled(client, cfg) &&
      !cfg.hogwartsHouseChannelSpawn &&
      String(cfg.channelId || "") === resolveMainChatMinigameChannelId() &&
      hasAnyHouseChannelMinigameBusy()
    ) {
      keepPending = true;
      logMinigameDebug("skip: house channel minigame active", { channelId: cfg.channelId });
      logMaybeStartSkip(cfg, client, "house_channel_busy");
      return false;
    }

    const now = new Date();
    if (!force) {
      const windowStart = cfg?.timeWindow?.start;
      const windowEnd = cfg?.timeWindow?.end;
      // Halloween: minigiochi sempre (no finestra globale); ToT/react hanno gate ore a parte
      if (!cfg.hogwartsEventLive && !cfg.halloweenEventLive && !isWithinAllowedWindow(now, windowStart, windowEnd)) {
        logMinigameDebug("skip: outside time window", { channelId: cfg.channelId });
        logMaybeStartSkip(cfg, client, "outside_time_window");
        return false;
      }
      if (!canStartByInterval(cfg, client)) {
        const lastSent = lastSentAtByChannel.get(cfg.channelId) || 0;
        keepPending = true;
        logMinigameDebug("skip: cooldown not elapsed", { channelId: cfg.channelId });
        logMaybeStartSkip(cfg, client, "interval_cooldown", { lastSentAt: lastSent, msSinceLastSent: Date.now() - lastSent });
        return false;
      }
      if (cfg.hogwartsEventLive && isHogwartsExclusiveMinigamesEnabled(client, cfg)) {
        const housePresence = await assessHogwartsHouseSpawnPresence(cfg, client);
        if (!housePresence.ok) {
          logMinigameDebug("skip: hogwarts house presence", {
            channelId: cfg.channelId,
            distinctHouses: housePresence.distinctHouses,
            sortedActiveUsers: housePresence.sortedActiveUsers,
            unsortedActiveUsers: housePresence.unsortedActiveUsers,
          });
          logMaybeStartSkip(cfg, client, "house_gate", housePresence);
          keepPending = true;
          return false;
        }
      }
      // Durante Halloween: niente requisiti attività / fresh chat (spawn sempre allo slot)
      if (!cfg.halloweenEventLive) {
        const readyByActivity = isReadyByActivity(cfg, client);
        const failsafeDue = isFailsafeDue(cfg);
        if (!readyByActivity && !failsafeDue) {
          standbyChannels.add(cfg.channelId);
          const w = getActivityWindowMs(cfg);
          const key = getActivityScopeKey(cfg);
          const stats = getRecentActivityStats(key, w);
          const effectiveMin = computeAdaptiveMinMessages(cfg, client, stats);
          logMinigameDebug("skip: insufficient activity", {
            channelId: cfg.channelId,
            count: stats.count,
            uniqueUsers: stats.uniqueUsers,
            minMessagesEffective: effectiveMin,
            minMessagesAnchor: getMinMessages(cfg),
          });
          logMaybeStartSkip(cfg, client, "insufficient_activity", {
            count: stats.count,
            uniqueUsers: stats.uniqueUsers,
            minMessagesEffective: effectiveMin,
          });
          keepPending = true;
          return false;
        }
        const freshActivity: any = assessFreshSpawnChatActivity(cfg);
        if (!freshActivity.ok && !freshActivity.skipped) {
          standbyChannels.add(cfg.channelId);
          logMinigameDebug("skip: insufficient fresh chat activity", {
            channelId: cfg.channelId,
            count: freshActivity.count,
            uniqueUsers: freshActivity.uniqueUsers,
            minMessages: freshActivity.minMessages,
            windowMs: freshActivity.windowMs,
          });
          logMaybeStartSkip(cfg, client, "fresh_chat_activity", {
            count: freshActivity.count,
            uniqueUsers: freshActivity.uniqueUsers,
            minMessages: freshActivity.minMessages,
            windowMs: freshActivity.windowMs,
          });
          keepPending = true;
          return false;
        }
      }
    }

    const channel = await getChannelCached(client, cfg.channelId);
    if (!channel) {
      logMinigameDebug("skip: target channel not found", { channelId: cfg.channelId });
      logMaybeStartSkip(cfg, client, "channel_not_found");
      return false;
    }
    cfg.guildId = String(channel?.guild?.id || cfg.guildId || "");
    if (cfg.hogwartsEventLive && isHogwartsExclusiveMinigamesEnabled(client, cfg)) {
      purgeNonHogwartsMinigameSchedulingState(cfg.channelId, cfg);
    }

    const available = getAvailableGameTypes(cfg);
    if (!available.length) {
      logMinigameDebug("skip: no available game types", { channelId: cfg.channelId });
      logMaybeStartSkip(cfg, client, "no_available_game_types");
      return false;
    }
    const tried = new Set();
    let pending = pendingGames.get(cfg.channelId);

    while (tried.size < available.length) {
      const gameType = pending?.type || (await getNextGameType(client, cfg));
      if (!gameType) return false;
      if (tried.has(gameType)) {
        pending = null;
        continue;
      }
      tried.add(gameType);

      const { runMinigameStartWithBasilisk } = require("../Community/hogwartsBasiliskService") as typeof import("../Community/hogwartsBasiliskService");
      const result = await runMinigameStartWithBasilisk(
        client,
        cfg,
        gameType,
        () => safeStartGameByType(client, cfg, gameType),
        { getActiveGame: (id?) => activeGames.get(String(id || "").trim()) },
      );
      const started = result === true || (result && result.started);

      if (started) {
        if (cfg.channelId) {
          const prev = lastPlayedGameTypesByChannel.get(cfg.channelId) || [];
          const next = [...prev.filter((t?) => t !== gameType), gameType].slice(-LAST_PLAYED_ROTATION_SIZE);
          lastPlayedGameTypesByChannel.set(cfg.channelId, next);
          let atMap = lastPlayedAtByChannelAndType.get(cfg.channelId);
          if (!atMap) {
            atMap = new Map();
            lastPlayedAtByChannelAndType.set(cfg.channelId, atMap);
          }
          atMap.set(gameType, Date.now());
        }
        pendingGames.delete(cfg.channelId);
        await saveRotationState(client, cfg);
        const live = activeGames.get(String(cfg.channelId || "").trim());
        if (live?.type === "hogwartsObservationTower" && live.basilisk) {
          await persistObservationTowerState(client, cfg, live).catch(() => null);
        }
        logMinigameDebug("start: game started", { channelId: cfg.channelId, gameType, force });
        logMinigameSpawn("maybeStart: game started", { channelId: cfg.channelId, gameType, force });
        startedOk = true;
        return true;
      }
      if (result && result.skipToNext) {
        logMinigameDebug("retry: game skipped to next type", { channelId: cfg.channelId, gameType });
        pendingGames.delete(cfg.channelId);
        pending = null;
        continue;
      }
      logMinigameDebug("retry: game failed, requeue type", { channelId: cfg.channelId, gameType });
      await requeueGameType(client, cfg, gameType);
      pendingGames.delete(cfg.channelId);
      pending = null;
    }
    logMinigameDebug("skip: all game types exhausted", { channelId: cfg.channelId, tried: Array.from(tried.values()) });
    logMaybeStartSkip(cfg, client, "all_game_types_exhausted", { tried: Array.from(tried.values()) });
    return false;
  } finally {
    startingChannels.delete(cfg.channelId);
    clearRolePingSentThisStart(cfg.channelId);
    if (cfg?.channelId && !keepPending && !startedOk) pendingGames.delete(cfg.channelId);
  }
}

async function spawnHouseChannelMinigame(client?, spawnCfg?, gameType?) {
  const channelId = String(spawnCfg?.channelId || "").trim();
  if (!channelId) return false;
  if (startingChannels.has(channelId)) return false;
  startingChannels.add(channelId);
  clearRolePingSentThisStart(channelId);
  try {
    const { runMinigameStartWithBasilisk } = require("../Community/hogwartsBasiliskService") as typeof import("../Community/hogwartsBasiliskService");
    const result = await runMinigameStartWithBasilisk(
      client,
      spawnCfg,
      gameType,
      () => safeStartGameByType(client, spawnCfg, gameType),
      { getActiveGame: (id?) => activeGames.get(String(id || "").trim()) },
    );
    if (result && result.basiliskSkip) return true;
    const started = result === true || (result && result.started);
    if (!started) return false;
    const game = activeGames.get(channelId);
    const meta = spawnCfg?.hogwartsHouseChannelMeta;
    if (game && meta && typeof meta === "object") {
      game.hogwartsHouseChannel = { ...meta };
      if (meta.soloHouseId) game.soloHouseId = String(meta.soloHouseId);
    }
    if (game?.type === "hogwartsObservationTower" && game.basilisk) {
      await persistObservationTowerState(client, spawnCfg, game).catch(() => null);
    }
    return true;
  } finally {
    startingChannels.delete(channelId);
    clearRolePingSentThisStart(channelId);
  }
}

function getActiveGameForChannel(channelId?) {
  return activeGames.get(String(channelId || "").trim()) || null;
}

async function sweepExpiredMinigames(client?) {
  const cfg = getConfig(client);
  if (!cfg?.enabled) return;
  for (const [mapKey, game] of [...activeGames.entries()]) {
    if (!isStaleOrInvalidActiveGame(game)) continue;
    if (game?.type === "halloweenTrickOrTreat" || isTrickOrTreatMapKey(mapKey)) {
      const realCh = isTrickOrTreatMapKey(mapKey)
        ? realChannelIdFromTotMapKey(mapKey)
        : String(mapKey || "").trim();
      const closeCfg = { ...cfg, channelId: realCh };
      if (!closeCfg.guildId && game?.guildId) closeCfg.guildId = String(game.guildId);
      const channel = await getChannelCached(client, realCh);
      clearMinigameRoundTimers(game);
      activeGames.delete(mapKey);
      await clearTrickOrTreatGame(client, closeCfg, game).catch((err?) => warnMinigame(err));
      const claimed = Object.keys(game?.claimedBy || {}).length;
      if (channel) {
        await sendMinigameMessage(channel, {
          embeds: [buildTrickOrTreatEndedEmbed(claimed)],
        }).catch(() => {});
      }
      continue;
    }
    const channelId = String(mapKey || "").trim();
    const closeCfg = { ...cfg, channelId };
    if (!closeCfg.guildId && game?.guildId) closeCfg.guildId = String(game.guildId);
    await closeStaleActiveMinigameChannel(client, closeCfg, channelId, game).catch((err?) => warnMinigame(err));
  }
  const mainChannelId = String(cfg.channelId || "").trim();
  if (mainChannelId && !activeGames.has(mainChannelId) && !channelWinClosing.has(mainChannelId)) {
    const guildId = await resolveMinigameGuildIdAsync({ ...cfg, channelId: mainChannelId }, client);
    if (guildId) {
      await purgeExpiredMinigameDbState(client, { ...cfg, guildId, channelId: mainChannelId }).catch((err?) => warnMinigame(err));
    }
  }
  try {
    const houseChannelSvc = require("../Community/hogwartsHouseChannelMinigameService") as typeof import("../Community/hogwartsHouseChannelMinigameService");
    const guildId = String(IDs.guilds?.main || "").trim();
    if (!guildId) return;
    for (const [channelId] of houseChannelSvc.HOUSE_CHANNEL_MAP) {
      const chId = String(channelId || "").trim();
      if (!chId || activeGames.has(chId) || channelWinClosing.has(chId)) continue;
      await purgeExpiredMinigameDbState(client, { guildId, channelId: chId }).catch((err?) => warnMinigame(err));
    }
  } catch (err) {
    warnMinigame(err);
  }
}

function startMinigameExpireSweep(client?) {
  if (expireSweepTimers.has(client)) return;
  const tick = () => {
    void sweepExpiredMinigames(client).catch((err?) => warnMinigame(err));
  };
  tick();
  /* perfP2: tick minigame meno frequente (era 20s) */
  const tickMs = Math.max(15_000, Math.min(120_000, Number(process.env.VC_MINIGAME_TICK_MS || 30_000) || 30_000));
  const timer = setInterval(tick, tickMs);
  timer.unref?.();
  expireSweepTimers.set(client, timer);
}

async function bootstrapMinigameScheduler(client?) {
  const { isHogwartsRuntimeDisabled } = require("../../Utils/Web/hogwartsRuntimeKillSwitch") as typeof import("../../Utils/Web/hogwartsRuntimeKillSwitch");
  const hogwartsOff = isHogwartsRuntimeDisabled(client);
  hogwartsSpawnPersistClientRef = client;
  if (!hogwartsOff) armHogwartsSpawnShutdownPersist();
  const cfg = getConfig(client);
  const eventCfg = resolveHogwartsEventConfig(client);
  const eventOpen = hogwartsOff ? { open: false } : isEventWindowOpen(eventCfg, Date.now());

      try {
    await restoreActiveGames(client);
  } catch (err) {
    global.logger?.error?.("[MINIGAMES] restoreActiveGames failed:", err?.message || err);
  }
  if (!hogwartsOff) {
    try {
      await restoreHouseChannelActiveGames(client);
    } catch (err) {
      global.logger?.warn?.("[MINIGAMES] restore house channel games:", err?.message || err);
    }
  }

  let activityBackfill = { ok: false, count: 0 };
  try {
    activityBackfill = await backfillRecentChatActivityFromHistory(client, cfg);
  } catch (err) {
    global.logger?.warn?.("[MINIGAMES] activity backfill:", err?.message || err);
  }

  let spawnSchedulerResumed = false;
  if (!hogwartsOff) {
    try {
      spawnSchedulerResumed = await restoreHogwartsSpawnSchedulerFromDb(client);
    } catch (err) {
      global.logger?.warn?.("[MINIGAMES] restore spawn scheduler:", err?.message || err);
    }
  }
  logMinigameSpawn("bootstrap scheduler", {
    channelId: cfg?.channelId,
    minigamesEnabled: Boolean(cfg?.enabled),
    hogwartsRuntimeDisabled: hogwartsOff,
    hogwartsEventWindowOpen: Boolean(eventOpen?.open),
    hogwartsEventLive: Boolean(cfg?.hogwartsEventLive),
    hogwartsExclusiveDuringEvent: cfg?.hogwartsExclusiveDuringEvent !== false,
    hogwartsExclusive: isHogwartsExclusiveMinigamesEnabled(client, cfg),
    hogwartsRandomMode: !hogwartsOff && isHogwartsRandomSpawnMode(cfg, client),
    spawnCfg: cfg ? getHogwartsEventSpawnCfg(cfg) : null,
    spawnSchedulerResumed,
    activityBackfill,
    activeMainGame: cfg?.channelId ? activeGames.get(String(cfg.channelId))?.type || null : null,
  });
  try {
    startMinigameLoop(client);
  } catch (err) {
    global.logger?.error?.("[MINIGAMES] startMinigameLoop failed:", err?.message || err);
  }
  try {
    startMinigameExpireSweep(client);
  } catch (err) {
    global.logger?.warn?.("[MINIGAMES] expire sweep failed to start:", err?.message || err);
  }
  if (!hogwartsOff) {
    try {
      const { bootstrapHogwartsHouseChannelMinigameScheduler } = require("../Community/hogwartsHouseChannelMinigameService") as typeof import("../Community/hogwartsHouseChannelMinigameService");
      await bootstrapHogwartsHouseChannelMinigameScheduler(client);
    } catch (err) {
      global.logger?.warn?.("[MINIGAMES] house channel scheduler:", err?.message || err);
    }
  }
}

function scheduleMinigameLoopTick(client?) {
  const { isHogwartsRuntimeDisabled } = require("../../Utils/Web/hogwartsRuntimeKillSwitch") as typeof import("../../Utils/Web/hogwartsRuntimeKillSwitch");
  const cfg = getConfig(client);
  if (!isHogwartsRuntimeDisabled(client) && isHogwartsRandomSpawnMode(cfg, client)) {
    logMinigameSpawn("scheduler: Hogwarts random mode active", {
      channelId: cfg?.channelId,
      hogwartsEventLive: Boolean(cfg?.hogwartsEventLive),
      hogwartsExclusive: isHogwartsExclusiveMinigamesEnabled(client, cfg),
    });
    runHogwartsSpawnTask(() => scheduleHogwartsNextRandomSpawn(client));
    return;
  }
  clearHogwartsSpawnScheduler(client);
  const ms = computeMsUntilNextRomeSlotStart(client);
  logMinigameSpawn("scheduler: Rome :00/:15 slots (not Hogwarts random)", {
    channelId: cfg?.channelId,
    hogwartsEventLive: Boolean(cfg?.hogwartsEventLive),
    hogwartsExclusive: isHogwartsExclusiveMinigamesEnabled(client, cfg),
    delayMs: ms,
    delayMin: Math.round(ms / 60_000),
  }, "warn");
  logMinigameDebug("schedule next minigame tick", { hogwartsRandom: false, delayMs: ms });
  const timer = setTimeout(async () => {
    try {
      const cfgTick = getConfig(client);
      if (!cfgTick?.enabled) return;
      const rome = getMinigameRomeTime(new Date(), client);
      if (!isMinigameFixedSlot(rome, client)) return;
      const slotKey = minigameSlotKeyFromRome(rome);
      if (slotKey === lastMinigameSlotKey) return;
      logMinigameDebug("slot tick", { slotKey, hour: rome.hour, minute: rome.minute });
      try {
        if (!pendingGames.has(cfgTick.channelId)) {
          const type = await getNextGameType(client, cfgTick);
          if (!type) return;
          pendingGames.set(cfgTick.channelId, { type, createdAt: Date.now() });
        }
        const started = await maybeStartRandomGame(client, false);
        // Se il canale è occupato (es. ToT caramelle), non bruciare lo slot: ritenta al prossimo tick.
        if (started) lastMinigameSlotKey = slotKey;
      } catch (slotErr) {
        global.logger?.error?.("[MINIGAMES] slot start failed", slotErr);
      }
    } catch (err) {
      global.logger?.error?.("[MINIGAMES] minigame loop tick", err);
    }
    scheduleMinigameLoopTick(client);
  }, ms);
  if (typeof timer.unref === "function") timer.unref();
  loopIntervals.set(client, timer);
}

/* halloween showcase → minigameHalloweenShowcaseService */
try {
  registerHalloweenShowcaseDeps({
    getConfig,
    clearGameForChannel,
    clearActiveGame,
    startHalloweenTrickOrTreatGame,
    safeStartGameByType,
    getChannelCached,
    normalizeRewardExp,
    buildPromptImageAttachment,
    buildFindBotEmbed,
    formatItalianMinutesBold,
    sendMinigameRolePing,
    sendMinigameMessage,
    buildHalloweenFindGhostFoundEmbed,
    warnMinigame,
  });
} catch (err) {
  global.logger?.warn?.("[MINIGAMES] halloween showcase deps:", err?.message || err);
}

function startMinigameLoop(client?) {
  if (loopState.has(client)) return;
  loopState.add(client);
  const cfg = getConfig(client);
  logMinigameSpawn("scheduler loop started", {
    channelId: cfg?.channelId,
    enabled: Boolean(cfg?.enabled),
    hogwartsRandomMode: isHogwartsRandomSpawnMode(cfg, client),
    hogwartsEventLive: Boolean(cfg?.hogwartsEventLive),
    hogwartsExclusive: isHogwartsExclusiveMinigamesEnabled(client, cfg),
  });
  scheduleMinigameLoopTick(client);
  const showcaseTimer = setInterval(() => {
    void processHalloweenMinigamesShowcaseForce(client).catch((err?) => warnMinigame(err));
  }, 8_000);
  showcaseTimer.unref?.();
  client._halloweenShowcaseTimer = showcaseTimer;
  setTimeout(() => {
    void processHalloweenMinigamesShowcaseForce(client).catch((err?) => warnMinigame(err));
  }, 4_000).unref?.();
}

async function forceStartMinigame(client?) {
  const cfg = getConfig(client);
  if (!cfg?.enabled) return;
  if (!cfg.channelId) return;
  if (activeGames.has(cfg.channelId)) return;
  const type = await getNextGameType(client, cfg);
  if (!type) return;
  pendingGames.set(cfg.channelId, { type, createdAt: Date.now() });
  await maybeStartRandomGame(client, true);
}

/**
 * Piccola chance di caramella su vittoria minigame (non TOT/caccia).
 * Stesso meccanismo unica + pass-along se collezione completa.
 */
async function maybeRollHalloweenCandyDrop({ client, guild, userId, cfg, game }) {
  const gid = String(guild?.id || "").trim();
  const uid = String(userId || "").trim();
  if (!client || !gid || !uid) return null;
  const gameType = String(game?.type || "").trim();
  if (gameType === "halloweenTrickOrTreat") return null;
  if (!isHalloweenEventLiveForMinigames(client, Date.now(), gid)) return null;

  const dropCfg =
    (cfg?.halloweenCandyDrop && typeof cfg.halloweenCandyDrop === "object" ? cfg.halloweenCandyDrop : null) ||
    (client?.config?.minigames?.halloweenCandyDrop && typeof client.config.minigames.halloweenCandyDrop === "object"
      ? client.config.minigames.halloweenCandyDrop
      : null) ||
    {};
  if (dropCfg.enabled === false) return null;
  const chance = Math.max(0, Math.min(100, Number(dropCfg.chancePercent ?? 6)));
  if (!(chance > 0) || Math.random() * 100 >= chance) return null;
  const amount = Math.max(1, Math.floor(Number(dropCfg.amount ?? 1)));

  try {
    const candyResult: any = await addHalloweenCandyWithPassAlong({
      guildId: gid,
      userId: uid,
      amount,
      eventKey: resolveHalloweenCandyEventKey(client),
      reason: "minigame_win_drop",
      source: `minigame:${gameType || "unknown"}`,
      client,
    });
    if (!candyResult) return null;
    if (candyResult.code === "passed_along" && candyResult.passedToUserId) {
      const unlock = buildHalloweenCandyUnlockPayload({
        candyResult,
        userId: candyResult.passedToUserId,
        expGained: 0,
      });
      return {
        code: "passed_along",
        candyResult,
        unlock,
        passedFromUserId: uid,
        passedToUserId: String(candyResult.passedToUserId),
      };
    }
    if (candyResult.ok) {
      const unlock = buildHalloweenCandyUnlockPayload({
        candyResult,
        userId: uid,
        expGained: 0,
      });
      return { code: "ok", candyResult, unlock, passedToUserId: null };
    }
    if (candyResult.code === "collection_complete") {
      return { code: "collection_complete", candyResult, unlock: null, passedToUserId: null };
    }
  } catch (err) {
    warnMinigame(err);
  }
  return null;
}

function mergeHalloweenCandyDropIntoMessage(basePayload?, award?, winnerUserId?) {
  const drop = award?.halloweenCandyDrop;
  if (!drop) return basePayload || {};
  const out = { ...(basePayload || {}) };
  const embeds = Array.isArray(out.embeds) ? out.embeds.slice() : [];
  const components = Array.isArray(out.components) ? out.components.slice() : [];
  if (drop.unlock?.embeds?.length) embeds.push(...drop.unlock.embeds);
  if (drop.unlock?.components?.length) components.push(...drop.unlock.components);
  out.embeds = embeds;
  if (components.length) out.components = components;
  if (drop.code === "passed_along" && drop.passedToUserId) {
    const line = `🍬 <@${winnerUserId}> ha il sacchetto pieno — la caramella passa a <@${drop.passedToUserId}>!`;
    out.content = out.content ? `${out.content}\n${line}` : line;
    const users = new Set([
      ...(out.allowedMentions?.users || []),
      String(winnerUserId || "").trim(),
      String(drop.passedToUserId),
    ].filter(Boolean));
    out.allowedMentions = { ...(out.allowedMentions || {}), users: [...users] };
  }
  return out;
}

async function awardMinigameWinToUser({
  client,
  guild,
  userId,
  cfg,
  game,
  rewardExp,
  housePointAmount = null,
  podiumMeta = null,
  channelId = null,
}) {
  const baseExp = normalizeRewardExp(rewardExp || 0);
  const startedAt = game?.startedAt ?? 0;
  const elapsed = typeof startedAt === "number" ? Date.now() - startedAt : Infinity;
  const fastCfg = cfg?.fastGuess ?? {};
  const windowMs = Number(fastCfg.windowMs ?? 30000) || 0;
  const fastMultiplier = Number(fastCfg.multiplier ?? 1.5) || 1;
  const isFastGuess = windowMs > 0 && elapsed <= windowMs;
  const fastBonus = isFastGuess ? Math.round(baseExp * (fastMultiplier - 1)) : 0;
  const streakCfg = cfg?.streak ?? {};
  const percentPerWin = Number(streakCfg.bonusPercentPerWin ?? 10) || 0;
  const maxBonusPercent = Number(streakCfg.maxBonusPercent ?? 50) || 0;
  let doc = await ActivityUserProfile.findOne({ guildId: guild.id, userId })
    .select("profile.totals.exp.minigame")
    .lean()
    .catch(() => null);
  const prevStreak = Number(doc?.profile?.totals?.exp?.minigame?.currentStreak ?? 0);
  const prevBest = Number(doc?.profile?.totals?.exp?.minigame?.bestStreak ?? 0);
  const newStreak = prevStreak + 1;
  const bestStreak = Math.max(prevBest, newStreak);
  const streakBonusPercent = percentPerWin > 0 ? Math.min((newStreak - 1) * percentPerWin, maxBonusPercent) : 0;
  const streakBonus = Math.round(baseExp * streakBonusPercent / 100);
  const effectiveExp = baseExp + fastBonus + streakBonus;
  try {
    doc = await incrementMinigameWinCounters(guild.id, userId, effectiveExp, newStreak, bestStreak);
  } catch (err) {
    warnMinigame(err);
  }
  if (client) {
    const { scheduleRoyaleMinigameRoleSync } = require("../Community/weeklyActivityWinnersService") as typeof import("../Community/weeklyActivityWinnersService");
    scheduleRoyaleMinigameRoleSync(client);
  }
  const nextTotal = Number(doc?.profile?.totals?.exp?.minigame?.totalExp ?? 0);
  ActivityUserProfile.updateMany(
    { guildId: guild.id, userId: { $ne: userId } },
    { $set: { "profile.totals.exp.minigame.currentStreak": 0 } },
  ).catch((err?) => warnMinigame(err));
  const member = await getGuildMemberCached(guild, userId, { ttlMs: 20_000 }).catch(() => null);
  const ignoreExp = await shouldIgnoreExpForMember({
    guildId: guild.id,
    member,
    channelId: channelId || cfg?.channelId || null,
  });
  if (!ignoreExp) {
    try {
      await addExpWithLevel(guild, userId, effectiveExp, false, true);
    } catch (err) {
      warnMinigame(err);
    }
  }
  const sortedHousePoints = housePointAmount == null
    ? getHogwartsHousePointReward(cfg, game?.type, game)
    : Math.max(0, Math.floor(Number(housePointAmount) || 0));
  const houseAward = await awardHogwartsHousePointsForWinner(
    client,
    guild.id,
    userId,
    game?.type,
    sortedHousePoints,
    podiumMeta ? 0 : getHogwartsUnsortedHousePointReward(cfg, game?.type),
  );
  const hasDetails = fastBonus > 0 || streakBonus > 0 || Number(houseAward?.points || 0) > 0 || Boolean(podiumMeta);
  const details = hasDetails
    ? {
      baseExp,
      fastBonus,
      streakBonus,
      newStreak,
      bestStreak,
      housePoints: Number(houseAward?.points || 0),
      allHouses: Boolean(houseAward?.allHouses),
      petMultiplier: Number(houseAward?.petMultiplier || 0),
      petName: houseAward?.petName || "",
      podiumPlace: podiumMeta?.place || 0,
      houseId: podiumMeta?.houseId || houseAward?.houseId || "",
    }
    : null;
  const halloweenCandyDrop = await maybeRollHalloweenCandyDrop({
    client,
    guild,
    userId,
    cfg,
    game,
  });
  return { effectiveExp, nextTotal, details, member, halloweenCandyDrop };
}

async function finishMinigameRoundClose(client?, cfg?, game?, options: Record<string, any> = {}) {
  const channelId = String(cfg?.channelId || "").trim();
  if (!channelId) return false;
  clearMinigameRoundTimers(game);
  clearHogwartsPodiumChannel(channelId);
  try {
    const closed = await beginMinigameWinClose(client, cfg, game);
    if (!closed) return false;
    if (options.podiumSummaryEmbed && options.channel) {
      await sendMinigameMessage(options.channel, { embeds: [options.podiumSummaryEmbed] }).catch(() => { });
    }
    return true;
  } finally {
    endMinigameWinClose(channelId);
  }
}

async function acknowledgeHogwartsPodiumButtonWin(interaction?, award = null) {
  await interaction.deferUpdate().catch(() => { });
  if (!award) return;
  const embed = buildWinEmbed(
    interaction.user.id,
    award.effectiveExp,
    award.nextTotal,
    award.details,
  );
  await interaction
    .followUp(
      mergeHalloweenCandyDropIntoMessage(
        { embeds: [embed], flags: 1 << 6 },
        award,
        interaction.user.id,
      ),
    )
    .catch(() => { });
}

function buildHogwartsPodiumRejectContent(reg?) {
  const code = String(reg?.code || "").trim();
  if (code === "house_already_won") {
    const label = hogwartsPodiumHouseLabel(reg.houseId);
    return `<:cancel:1461730653677551691> Un altro membro di **${label}** ha già cliccato per la tua casa in questo round.`;
  }
  if (code === "user_already_won") {
    return "<:cancel:1461730653677551691> Hai già ottenuto il premio in questo round.";
  }
  if (code === "podium_full") {
    return "<:cancel:1461730653677551691> Il podio è già completo per questo round.";
  }
  return "<:cancel:1461730653677551691> Non puoi partecipare a questo round.";
}

async function replyHogwartsPodiumButtonReject(interaction?, reg?) {
  const content = buildHogwartsPodiumRejectContent(reg);
  await interaction.reply({ content, flags: 1 << 6 }).catch(async () => {
    await interaction.followUp({ content, flags: 1 << 6 }).catch(() => { });
  });
}

async function handleMinigameWin(message?, game?, cfg?) {
  clearNoParticipationDelay(message.channelId);
  const client = message.client;
  const clearCfg = { ...cfg, guildId: message.guild.id };
  const channelId = String(clearCfg.channelId || "");
  const podiumMode = isHogwartsPodiumWinMode(cfg, game?.type, game);
  const winMember =
    message.member ||
    (await message.guild.members.fetch(message.author.id).catch(() => null));
  const skipBasiliskReaction =
    podiumMode &&
    (await isHogwartsPodiumSilentParticipant(
      client,
      cfg,
      game,
      message.guild.id,
      message.author.id,
      channelId,
      winMember,
    ));
  if (await rejectIfHogwartsEventBlacklistedMessage(message)) return;
  if (!skipBasiliskReaction && (await rejectIfBasiliskBlockedMessage(message, game))) return;
  if (await rejectIfWrongHouseChannelMemberMessage(message, game)) return;
  const shouldDeleteWinnerMessage =
    Boolean(cfg?.hogwartsEventLive) &&
    String(message?.channelId || "") === String(IDs.channels.chat || "") &&
    Boolean(message?.deletable);

  try {
    if (podiumMode) {
      if (isHogwartsPodiumRoundComplete(game, channelId)) {
        await closeHogwartsPodiumRoundIfComplete(client, clearCfg, game, channelId, message.channel);
        return;
      }
      const reg = await tryRegisterHogwartsPodiumEntry(client, game, message.guild.id, message.author.id, channelId);
      if (!reg.ok) {
        if (reg.code === "basilisk_blocked") {
          await rejectIfBasiliskBlockedMessage(message, game);
          return;
        }
        if (reg.code === "hogwarts_blacklisted") {
          await rejectIfHogwartsEventBlacklistedMessage(message);
          return;
        }
        if (reg.code === "not_sorted") {
          if (!isHogwartsPodiumEmpty(game, channelId)) {
            return;
          }
          try {
            const result = await handleHogwartsPodiumUnsortedWin({
              client,
              guild: message.guild,
              userId: message.author.id,
              cfg,
              game,
              channelId: message.channel?.id || message.channelId || null,
              onReact: () => reactMinigameWin(message),
              closeChannel: message.channel,
            });
            if (result?.rejected) return;
          } catch (err) {
            warnMinigame(err);
          }
          return;
        }
        if (reg.code === "podium_full" || reg.code === "house_already_won" || reg.code === "user_already_won") {
          if (isHogwartsPodiumRoundComplete(game, channelId)) {
            await closeHogwartsPodiumRoundIfComplete(client, clearCfg, game, channelId, message.channel);
          }
        }
        return;
      }
      try {
        await grantAndStoreHogwartsPodiumAward({
          client,
          guild: message.guild,
          userId: message.author.id,
          cfg,
          game,
          channelId: message.channel?.id || message.channelId || null,
          reg,
        });
        await reactMinigameWin(message);
        if (reg.complete) {
          await waitForHogwartsPodiumPendingAwards(channelId);
          await closeHogwartsPodiumRoundIfComplete(client, clearCfg, game, channelId, message.channel);
        } else {
          activeGames.set(channelId, game);
          await persistHogwartsPodium(client, clearCfg, game);
        }
      } catch (err) {
        warnMinigame(err);
        await reactMinigameWin(message).catch(() => { });
        if (reg.complete) {
          await waitForHogwartsPodiumPendingAwards(channelId).catch(() => { });
          await closeHogwartsPodiumRoundIfComplete(client, clearCfg, game, channelId, message.channel).catch(() => { });
        }
      }
      return;
    }

    const closed = await beginMinigameWinClose(client, clearCfg, game);
    if (!closed) return;
    try {
      const award = await awardMinigameWinToUser({
        client,
        guild: message.guild,
        userId: message.author.id,
        cfg,
        game,
        rewardExp: game.rewardExp,
        channelId: message.channel?.id || message.channelId || null,
      });
      await reactMinigameWin(message);
      await message
        .reply(
          mergeHalloweenCandyDropIntoMessage(
            {
              embeds: [buildWinEmbed(message.author.id, award.effectiveExp, award.nextTotal, award.details)],
            },
            award,
            message.author.id,
          ),
        )
        .catch(() => { });
      if (award.member) {
        await handleExpReward(client, award.member, award.nextTotal);
      }
    } catch (err) {
      warnMinigame(err);
      await reactMinigameWin(message).catch(() => { });
      await message.reply({
        content: "<:VC_Attention:1482534443632558151> Risposta registrata, ma non sono riuscito a completare i premi. Il round è comunque chiuso.",
      }).catch((replyErr?) => warnMinigame(replyErr));
    } finally {
      if (channelId) {
        clearHogwartsPodiumChannel(channelId);
        await clearActiveGame(client, clearCfg).catch(() => { });
        endMinigameWinClose(channelId);
      }
    }
  } finally {
    if (shouldDeleteWinnerMessage) {
      await message.delete().catch(() => { });
    }
  }
}

async function handleMinigameButtonWin(interaction?, game?, cfg?) {
  clearNoParticipationDelay(cfg.channelId);
  const client = interaction.client;
  const winCfg = { ...cfg, guildId: interaction.guild.id };
  const channelId = String(winCfg.channelId || "");
  const podiumMode = isHogwartsPodiumWinMode(cfg, game?.type, game);
  const skipBasiliskReaction =
    podiumMode &&
    (await isHogwartsPodiumSilentParticipant(
      client,
      cfg,
      game,
      interaction.guild.id,
      interaction.user.id,
      channelId,
      interaction.member,
    ));
  if (await rejectIfHogwartsEventBlacklistedInteraction(interaction)) return;
  if (!skipBasiliskReaction && (await rejectIfBasiliskBlockedInteraction(interaction, game))) return;
  if (await rejectIfWrongHouseChannelMemberInteraction(interaction, game)) return;
  if (podiumMode) {
    const reg = await tryRegisterHogwartsPodiumEntry(client, game, interaction.guild.id, interaction.user.id, channelId);
    if (!reg.ok) {
      if (reg.code === "basilisk_blocked") {
        await rejectIfBasiliskBlockedInteraction(interaction, game);
        return;
      }
      if (reg.code === "hogwarts_blacklisted") {
        await rejectIfHogwartsEventBlacklistedInteraction(interaction);
        return;
      }
      if (reg.code === "not_sorted") {
        if (!isHogwartsPodiumEmpty(game, channelId)) {
          await interaction.deferUpdate().catch(() => { });
          return;
        }
        try {
          const mainChannel = await getChannelCached(client, cfg.channelId);
          const result = await handleHogwartsPodiumUnsortedWin({
            client,
            guild: interaction.guild,
            userId: interaction.user.id,
            cfg,
            game,
            channelId: cfg.channelId || null,
            closeChannel: mainChannel,
            beforeClose: async () => {
              const channel = interaction.channel;
              const msg = await channel.messages.fetch(game.messageId).catch(() => null);
              if (msg) await msg.delete().catch(() => { });
            },
          });
          if (result?.rejected) {
            await interaction.deferUpdate().catch(() => { });
            return;
          }
          await acknowledgeHogwartsPodiumButtonWin(interaction, result?.award || null);
          if (!result.closed) return;
        } catch (err) {
          warnMinigame(err);
          await interaction.deferUpdate().catch(() => { });
        }
        return;
      }
      if (reg.code === "house_already_won" || reg.code === "user_already_won" || reg.code === "podium_full") {
        await replyHogwartsPodiumButtonReject(interaction, reg);
        return;
      }
      await interaction.deferUpdate().catch(() => { });
      return;
    }
    let award = null;
    try {
      award = await grantAndStoreHogwartsPodiumAward({
        client,
        guild: interaction.guild,
        userId: interaction.user.id,
        cfg,
        game,
        channelId: cfg.channelId || null,
        reg,
      });
    } catch (err) {
      warnMinigame(err);
    }
    if (reg.complete) {
      await waitForHogwartsPodiumPendingAwards(channelId);
      const mainChannel = await getChannelCached(client, cfg.channelId);
      await closeHogwartsPodiumRoundIfComplete(client, winCfg, game, channelId, mainChannel, {
        beforeClose: async () => {
          const channel = interaction.channel;
          const msg = await channel.messages.fetch(game.messageId).catch(() => null);
          if (msg) await msg.delete().catch(() => { });
        },
      });
      await acknowledgeHogwartsPodiumButtonWin(interaction, award);
    } else {
      activeGames.set(channelId, game);
      await persistHogwartsPodium(client, winCfg, game);
      await acknowledgeHogwartsPodiumButtonWin(interaction, award);
    }
    return;
  }

    if (game?.finaleChaos && game?.type === "findScroll") {
    const chaos = game.finaleChaos;
    const { CHAOS_FIND_SCROLL_WINNERS } = require("../Community/hogwartsFinaleChaosDayService") as typeof import("../Community/hogwartsFinaleChaosDayService");
    const required = Math.max(2, Number(chaos.requiredWinners) || Number(CHAOS_FIND_SCROLL_WINNERS) || 2);
    const uid = String(interaction.user.id || "").trim();
    const winners = Array.isArray(chaos.winnerIds) ? chaos.winnerIds.map(String) : [];
    if (winners.includes(uid)) {
      await interaction.reply({
        content: "<a:VC_Alert:1482706673176150077> Hai già raccolto questa pergamena.",
        flags: 1 << 6,
      }).catch(() => { });
      return;
    }
    if (winners.length >= required) {
      await interaction.reply({
        content: "<:cancel:1461730653677551691> Round già completato.",
        flags: 1 << 6,
      }).catch(() => { });
      return;
    }

    const wantCustomId = String(game.customId || "");
    let mapKey = "";
    for (const [key, g] of activeGames.entries()) {
      if (g && g.type === "findScroll" && String(g.customId || "") === wantCustomId && g.finaleChaos) {
        mapKey = String(key);
        break;
      }
    }
    if (!mapKey && game.mapChannelId) mapKey = String(game.mapChannelId);
    if (!mapKey) mapKey = String(cfg.channelId || "");
    const lockKey = `finale_scroll:${wantCustomId || mapKey}`;
    if (channelWinClosing.has(lockKey)) {
      await interaction.reply({
        content: "<:cancel:1461730653677551691> Qualcun altro sta reclamando… riprova.",
        flags: 1 << 6,
      }).catch(() => { });
      return;
    }
    channelWinClosing.add(lockKey);
    let roundComplete = false;
    try {
      const live = (mapKey && activeGames.get(mapKey)) || activeGames.get(cfg.channelId) || game;
      if (!live || live.customId !== game.customId || !live.finaleChaos) {
        await interaction.reply({
          content: "<:cancel:1461730653677551691> Partita già conclusa.",
          flags: 1 << 6,
        }).catch(() => { });
        return;
      }
            live.finaleChaos.requiredWinners = required;
      const liveWinners = Array.isArray(live.finaleChaos.winnerIds) ? live.finaleChaos.winnerIds.map(String) : [];
      if (liveWinners.includes(uid)) {
        await interaction.reply({
          content: "<a:VC_Alert:1482706673176150077> Hai già raccolto questa pergamena.",
          flags: 1 << 6,
        }).catch(() => { });
        return;
      }
      if (liveWinners.length >= required) {
        await interaction.reply({
          content: "<:cancel:1461730653677551691> Round già completato.",
          flags: 1 << 6,
        }).catch(() => { });
        return;
      }
      liveWinners.push(uid);
      live.finaleChaos.winnerIds = liveWinners;
      if (mapKey) activeGames.set(mapKey, live);
      else activeGames.set(String(cfg.channelId || ""), live);
      roundComplete = liveWinners.length >= required;

      const { grantFinaleChaosWinRewards } = require("../Community/hogwartsFinaleChaosDayService") as typeof import("../Community/hogwartsFinaleChaosDayService");
      const { formatGaleoni } = require("../Community/gringottService") as typeof import("../Community/gringottService");
      const need = required;
      const rewards = await grantFinaleChaosWinRewards(client, {
        guildId: interaction.guild.id,
        userIds: [uid],
        c: {
          rewardGaleoni: Number(chaos.rewardGaleoni) || 1000,
          rewardHousePoints: Number(chaos.rewardHousePoints) || 500,
          firstSlotBoostDurationMs: Number(chaos.firstSlotBoostDurationMs) || 3600000,
          eventKey: String(chaos.chaosEventKey || "hogwarts_finale_chaos"),
        },
        rewardKeyPrefix: `${chaos.chaosEventKey || "finale"}:${chaos.slotKey || game.customId || "scroll"}:findScroll`,
        reason: `Finale chaos — Caccia alle pergamene ${chaos.slotKey || ""}`,
                firstSlot: chaos.firstSlot === true && liveWinners.length === 1,
        boostType: chaos.boostType || "housePoints",
        boostScope: chaos.boostScope || "personal",
      });
      const award = rewards[0];
      const announceId = mapKey || String(cfg.channelId || "");
      const mainChannel = await getChannelCached(client, announceId);
      const place = liveWinners.length;
      const embed = new EmbedBuilder()
        .setColor(MINIGAME_EMBED_COLOR)
        .setTitle(roundComplete ? "Caccia alle pergamene — round completo!" : "Caccia alle pergamene — pergamena raccolta!")
        .setDescription(
          [
            `<@${uid}> è il **${place}°** a trovare la pergamena (**${place}/${need}**).`,
            "",
            `**${formatGaleoni(Number(chaos.rewardGaleoni) || 1000)}**`,
            `**${award?.house?.points || chaos.rewardHousePoints || 500} punti casa**`,
            chaos.firstSlot && liveWinners.length === 1
              ? `Boost attivo: **2× ${chaos.boostType === "exp" ? "EXP" : "punti casa"} ${chaos.boostScope === "house" ? "di casata" : "personale"}** per 1 ora (si somma)`
              : "",
            roundComplete
              ? ""
              : `Manca ancora **${need - place}** mago: la pergamena resta attiva!`,
          ].filter(Boolean).join("\n"),
        );
      if (mainChannel) {
        let sent = await sendMinigameMessage(mainChannel, { embeds: [embed] }).catch(() => null);
        if (!sent) {
          await new Promise((r?) => setTimeout(r, 750));
          const fresh = await getChannelCached(client, announceId);
          if (fresh) sent = await sendMinigameMessage(fresh, { embeds: [embed] }).catch(() => null);
        }
      }
      await interaction.reply({
        content: roundComplete
          ? "<a:VC_Events:1482706144953897223> Hai vinto! Round completo."
          : `<a:VC_Events:1482706144953897223> Hai vinto! Serve ancora **${need - place}** vincitore.`,
        flags: 1 << 6,
      }).catch(() => { });

            try {
        await saveActiveGame(
          client,
          { ...winCfg, channelId: announceId, guildId: interaction.guild.id },
          {
            type: "findScroll",
            rewardExp: 0,
            startedAt: live.startedAt ? new Date(live.startedAt) : new Date(),
            endsAt: live.endsAt ? new Date(live.endsAt) : new Date(Date.now() + 60_000),
            targetChannelId: live.channelId || null,
            gameMessageId: live.messageId || null,
            mainMessageId: live.mainMessageId || null,
            customId: live.customId,
            target: JSON.stringify({ finaleChaos: live.finaleChaos }),
          },
        );
      } catch (errPersist) {
        warnMinigame(errPersist);
      }

      if (roundComplete) {
        try {
          const channel = interaction.channel;
          const msg = await channel.messages.fetch(live.messageId || game.messageId).catch(() => null);
          if (msg) await msg.delete().catch(() => { });
        } catch (err) {
          warnMinigame(err);
        }
        if (live.timeout) clearTimeout(live.timeout);
        if (live.hintTimeout) clearTimeout(live.hintTimeout);
        clearHogwartsPodiumChannel(announceId);
        await clearActiveGame(client, { ...winCfg, channelId: announceId }).catch(() => { });
      }
    } finally {
      channelWinClosing.delete(lockKey);
    }
    return;
  }

  const closed = await beginMinigameWinClose(client, winCfg, game);
  if (!closed) {
    await interaction.reply({
      content: "<:cancel:1461730653677551691> Partita già conclusa.",
      flags: 1 << 6,
    }).catch(() => { });
    return;
  }
  try {
    const award = await awardMinigameWinToUser({
      client,
      guild: interaction.guild,
      userId: interaction.user.id,
      cfg,
      game,
      rewardExp: game.rewardExp,
      channelId: cfg.channelId || null,
    });
    const winEmbed = buildWinEmbed(interaction.user.id, award.effectiveExp, award.nextTotal, award.details);
    const mainChannel = await getChannelCached(client, cfg.channelId);
    if (mainChannel) {
      await sendMinigameMessage(
        mainChannel,
        mergeHalloweenCandyDropIntoMessage({ embeds: [winEmbed] }, award, interaction.user.id),
      ).catch(() => { });
    }
    await interaction.reply({
      content: "<a:VC_Events:1482706144953897223> Hai vinto!",
      flags: 1 << 6,
    }).catch(() => { });
    if (award.member) {
      await handleExpReward(client, award.member, award.nextTotal);
    }
    try {
      const channel = interaction.channel;
      const msg = await channel.messages.fetch(game.messageId).catch(() => null);
      if (msg) await msg.delete().catch(() => { });
    } catch (err) {
      warnMinigame(err);
    }
  } finally {
    clearHogwartsPodiumChannel(channelId);
    await clearActiveGame(client, winCfg).catch(() => { });
    endMinigameWinClose(channelId);
  }
}

async function handleMinigameMessage(message?, client?) {
  const baseCfg = getConfig(client);
  if (!baseCfg?.enabled) return false;
  if (!message?.guild) return false;
  if (message.author?.bot) return false;
  const chId = String(message.channelId || "");
  if (channelWinClosing.has(chId)) return true;
  const houseChannelSvc = require("../Community/hogwartsHouseChannelMinigameService") as typeof import("../Community/hogwartsHouseChannelMinigameService");
  let cfg = baseCfg;
  if (houseChannelSvc.isHogwartsHouseChannelId(chId)) {
    if (!activeGames.has(chId) && !isMinigameRehydrateBlocked(chId)) {
      await ensureHouseChannelActiveGameFromDb(client, chId, String(message.guild.id || ""));
    }
    if (!activeGames.has(chId)) return false;
    const houseId = houseChannelSvc.getHouseIdForChannel(chId);
    const active = activeGames.get(chId);
    const mode = active?.type === "hogwartsObservationTower" || active?.hogwartsHouseChannel?.mode === "tower"
      ? "tower"
      : "themed";
    cfg = houseChannelSvc.buildHouseChannelSpawnCfg(client, chId, houseId, mode);
    if (!cfg) {
      cfg = {
        ...baseCfg,
        channelId: chId,
        guildId: String(message.guild.id || IDs.guilds?.main || ""),
        hogwartsHouseChannelMeta: active?.hogwartsHouseChannel || {
          houseId,
          soloHouseId: houseId,
          mode,
        },
      };
    }
    cfg = syncObservationTowerSpawnCfgFromGame(cfg, active);
  }
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
  if (game.type === "hogwartsQuiz") {
    resolveHogwartsQuizAnswerPool(game);
  }
  if (game && isStaleOrInvalidActiveGame(game)) {
    await closeStaleActiveMinigameChannel(client, cfg, cfg.channelId, game, message.channel);
    return false;
  }
  if (game && cfg.hogwartsEventLive && isHogwartsExclusiveMinigamesEnabled(client, cfg) && !isHogwartsEventMinigameType(game.type, cfg)) {
    if (game.timeout) clearTimeout(game.timeout);
    if (game.hintTimeout) clearTimeout(game.hintTimeout);
    if (game.revealTimeout) clearTimeout(game.revealTimeout);
    activeGames.delete(cfg.channelId);
    await clearActiveGame(client, { ...cfg, guildId: message.guild.id });
    return false;
  }
  if (game) {
    if (game.hadParticipation === undefined) game.hadParticipation = false;
    game.hadParticipation = true;
  }
  if (!game) return false;
  if (isHogwartsPodiumRoundComplete(game, chatId)) {
    if (hogwartsPodiumRowsMissingAwards(game, chatId).length > 0 || hogwartsPodiumPendingAwards.has(chatId)) {
      return false;
    }
  }
  if (await closeHogwartsPodiumRoundIfComplete(client, cfg, game, chatId)) {
    return true;
  }

  const podiumMember =
    message.member ||
    (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (await isHogwartsPodiumSilentParticipant(client, cfg, game, message.guild.id, message.author.id, chatId, podiumMember)) {
    return true;
  }
  if (await rejectIfHogwartsEventBlacklistedMessage(message)) return true;
  if (await rejectIfBasiliskBlockedMessage(message, game)) return true;
  if (await rejectIfWrongHouseChannelMemberMessage(message, game)) return true;

  const content = String(message.content || "").trim();
  const contentForGuess = normalizeUserAnswerText(content);

  if (game.type === "guessNumber") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    if (!/^\d+$/.test(content)) return false;
    const guess = Number(content);
    if (!Number.isFinite(guess)) return false;
    if (guess < game.min || guess > game.max) return false;

    if (guess === game.target) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }

    const range = Math.max(1, Number(game.max || 100) - Number(game.min || 1));
    const nearThreshold = Math.max(2, Math.round(range * 0.05));
    if (Math.abs(guess - game.target) <= nearThreshold) {
      await message.react("<a:VC_Flame:1482725674711126140>").catch(() => { });
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    await message
      .reply({ embeds: [buildHintEmbed(guess < game.target)] })
      .catch(() => { });
    return true;
  }

  if (game.type === "guessWord") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    const guessCandidates = extractWordGuessCandidates(contentForGuess);
    if (!guessCandidates.length) {
      return false;
    }
    const targetNorm = normalizeCountryName(game.target || "");
    const targetCompact = targetNorm ? compactNoSpaces(targetNorm) : "";
    const match = guessCandidates.some((c?) => {
      const cNorm = normalizeCountryName(c);
      return (
        cNorm === targetNorm ||
        (targetCompact && cNorm && compactNoSpaces(cNorm) === targetCompact)
      );
    });
    if (match) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (
      guessCandidates.some((candidate?) =>
        isNearTextGuess(candidate, [game.target], {
          maxDistance: 1,
          maxRatio: 0.25,
        }),
      )
    ) {
      await message.react("<a:VC_Flame:1482725674711126140>").catch(() => { });
      return false;
    }
    await reactMinigameWrongEmoji(message, game);
    return false;
  }

  if (game.type === "guessFlag") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizeCountryName, {
        minGuessLength: 4,
        minTokenLength: 3,
        singleTokenMinLength: 5,
      })
    ) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (
      isNearTextGuess(contentForGuess, game.answers, { maxDistance: 2, maxRatio: 0.25 })
    ) {
      await message.react("<a:VC_Flame:1482725674711126140>").catch(() => { });
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }

  if (game.type === "hogwartsGuessCharacter") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    if (isExplicitBankAnswerCorrect(contentForGuess, getHogwartsCharacterSourceAnswers(game), normalizePlayerGuess, 1)) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    await reactMinigameNearOrWrong(message, contentForGuess, game, game.answers, {
      maxDistance: 2,
      maxRatio: 0.25,
      minGuessLength: 3,
    });
    return false;
  }

  if (game.type === "guessPlayer") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizePlayerGuess, {
        minGuessLength: 3,
        minTokenLength: 3,
        singleTokenMinLength: 4,
      })
    ) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (
      isNearTextGuess(contentForGuess, game.answers, { maxDistance: 2, maxRatio: 0.25 })
    ) {
      await message.react("<a:VC_Flame:1482725674711126140>").catch(() => { });
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }

  if (game.type === "guessSong") {
    if (await rejectMinigameShotgunListingGuess(message, content, "songAlbum")) return false;
    const songAnswers = buildSongAnswerAliases(game.title);
    if (
      isSongGuessCorrect(contentForGuess, songAnswers.length ? songAnswers : game.title)
    ) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (
      isNearTextGuess(
        contentForGuess,
        songAnswers.length ? songAnswers : [game.title],
        { maxDistance: 3, maxRatio: 0.25 },
      )
    ) {
      await message.react("<a:VC_Flame:1482725674711126140>").catch(() => { });
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }

  if (game.type === "guessCapital") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizeCountryName, {
        minGuessLength: 3,
        minTokenLength: 3,
        singleTokenMinLength: 4,
      })
    ) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (
      isNearTextGuess(contentForGuess, game.answers, { maxDistance: 2, maxRatio: 0.25 })
    ) {
      await message.react("<a:VC_Flame:1482725674711126140>").catch(() => { });
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }

  if (game.type === "guessReverseCapital") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizeCountryName, {
        minGuessLength: 3,
        minTokenLength: 3,
        singleTokenMinLength: 4,
      })
    ) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (
      isNearTextGuess(contentForGuess, game.answers, { maxDistance: 2, maxRatio: 0.25 })
    ) {
      await message.react("<a:VC_Flame:1482725674711126140>").catch(() => { });
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }

  if (game.type === "guessRegionCapital") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizeCountryName, {
        minGuessLength: 3,
        minTokenLength: 3,
        singleTokenMinLength: 4,
      })
    ) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (
      isNearTextGuess(contentForGuess, game.answers, { maxDistance: 2, maxRatio: 0.25 })
    ) {
      await message.react("<a:VC_Flame:1482725674711126140>").catch(() => { });
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }

  if (game.type === "fastType") {
    const normalizedContent = normalizeCountryName(contentForGuess);
    const phraseNorm = game.normalizedPhrase || normalizeCountryName(game.phrase || "");
    if (
      normalizedContent === phraseNorm ||
      (compactNoSpaces(normalizedContent) && compactNoSpaces(normalizedContent) === compactNoSpaces(phraseNorm))
    ) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    await reactMinigameNearOrWrong(message, normalizedContent, game, [game.normalizedPhrase], {
      maxDistance: 2,
      maxRatio: 0.2,
      minGuessLength: 6,
    });
    return false;
  }

  if (game.type === "hogwartsMemoryEmoji" || game.type === "memoryEmoji") {
    if (!game.promptMessageId || Date.now() < Number(game.acceptsAt || 0)) {
      await message.react(MINIGAME_COOLDOWN_EMOJI).catch(() => { });
      return false;
    }
    if (memoryEmojiMessageMatches(content, game.normalizedSequence)) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    await reactMinigameWrongIfAttempt(message, content, game);
    return false;
  }

  if (game.type === "hogwartsCipher") {
    if (isHogwartsCipherGuessCorrect(contentForGuess, game)) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    await reactMinigameNearOrWrong(message, contentForGuess, game, game.answers, {
      maxDistance: 2,
      maxRatio: 0.25,
      minGuessLength: 3,
    });
    return false;
  }

  if (game.type === "hogwartsObservationTower") {
    const liveGame = activeGames.get(chId);
    if (!liveGame || liveGame.type !== "hogwartsObservationTower") return false;
    if (liveGame._finishClaimed || liveGame._finishEmbedSent || liveGame._finishAwardsGiven) return true;
    return processObservationTowerMessage(message, client, cfg, liveGame);
  }

  if (game.type === "guessTeam") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizeCountryName, {
        minGuessLength: 3,
        minTokenLength: 3,
        singleTokenMinLength: 3,
      })
    ) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (
      isNearTextGuess(contentForGuess, game.answers, { maxDistance: 2, maxRatio: 0.25 })
    ) {
      await message.react("<a:VC_Flame:1482725674711126140>").catch(() => { });
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }

  if (game.type === "guessSinger") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    if (isSingerGuessCorrect(contentForGuess, game.answers)) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (
      isNearTextGuess(contentForGuess, game.answers, { maxDistance: 2, maxRatio: 0.25 })
    ) {
      await message.react("<a:VC_Flame:1482725674711126140>").catch(() => { });
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }

  if (game.type === "guessAlbum") {
    if (await rejectMinigameShotgunListingGuess(message, content, "songAlbum")) return false;
    if (isSongGuessCorrect(contentForGuess, game.answers)) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (
      isNearTextGuess(contentForGuess, game.answers, { maxDistance: 3, maxRatio: 0.25 })
    ) {
      await message.react("<a:VC_Flame:1482725674711126140>").catch(() => { });
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }

  if (game.type === "italianGK" || game.type === "halloweenQuiz") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizeCountryName, {
        minGuessLength: 2,
        minTokenLength: 2,
        singleTokenMinLength: 2,
      })
    ) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    await reactMinigameNearOrWrong(message, contentForGuess, game, game.answers, {
      maxDistance: 2,
      maxRatio: 0.25,
      minGuessLength: 2,
    });
    return false;
  }

  if (game.type === "halloweenMissingEmoji") {
    const guess = String(content || "").trim();
    const choices = Array.isArray(game.choices) ? game.choices : [];
    const asIndex = Number.parseInt(guess, 10);
    const fromNumber =
      Number.isFinite(asIndex) && asIndex >= 1 && asIndex <= choices.length ? choices[asIndex - 1] : null;
    const matched =
      (guess && game.answers?.some((a?) => String(a) === guess)) ||
      (fromNumber && game.answers?.some((a?) => String(a) === String(fromNumber)));
    if (matched) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    await reactMinigameWrongEmoji(message, game);
    return false;
  }

  if (game.type === "halloweenCountBats") {
    const n = Number.parseInt(String(contentForGuess || "").replace(/[^\d]/g, ""), 10);
    if (Number.isFinite(n) && n === Number(game.count)) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    await reactMinigameWrongEmoji(message, game);
    return false;
  }

  if (game.type === "hogwartsQuiz") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    const hogwartsAnswerPool = resolveHogwartsQuizAnswerPool(game);
    if (isHogwartsQuizGuessCorrect(contentForGuess, game, hogwartsAnswerPool)) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    await reactMinigameNearOrWrong(message, contentForGuess, game, hogwartsAnswerPool, {
      maxDistance: 2,
      maxRatio: 0.25,
      minGuessLength: 2,
    });
    return false;
  }

  if (game.type === "drivingQuiz") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    const isMultiple = game.questionType === "multiple" && Array.isArray(game.options) && Number.isFinite(game.correctIndex);
    let interpretable = false;
    let correct = false;
    if (isMultiple) {
      const norm = normalizeCountryName(contentForGuess);
      const letter = norm.charAt(0);
      const num = Number.parseInt(norm, 10);
      if (Number.isFinite(num) && num >= 1 && num <= game.options.length) {
        interpretable = true;
        if (num - 1 === game.correctIndex) correct = true;
      } else if (DRIVING_QUIZ_LETTERS.indexOf(letter.toUpperCase()) >= 0) {
        const idx = DRIVING_QUIZ_LETTERS.indexOf(letter.toUpperCase());
        if (idx < game.options.length) {
          interpretable = true;
          if (idx === game.correctIndex) correct = true;
        }
      } else if (norm) {
        const correctText = normalizeCountryName(game.options[game.correctIndex] || "");
        if (
          correctText &&
          (norm === correctText || (compactNoSpaces(norm) && compactNoSpaces(norm) === compactNoSpaces(correctText)))
        ) {
          interpretable = true;
          correct = true;
        } else {
          const matchesAnyOption = game.options.some((opt?) => {
            const optNorm = normalizeCountryName(opt || "");
            if (!optNorm) return false;
            if (norm === optNorm) return true;
            const cn = compactNoSpaces(norm);
            const co = compactNoSpaces(optNorm);
            return Boolean(cn && co && cn === co);
          });
          if (matchesAnyOption) interpretable = true;
        }
      }
    } else {
      const guess = normalizeTruthValue(contentForGuess);
      if (guess !== null) {
        interpretable = true;
        if (guess === game.answer) correct = true;
      }
    }
    if (interpretable) {
      const userId = String(message.author?.id || "");
      const cooldownMs = Math.max(0, Number(cfg?.drivingQuiz?.userAnswerCooldownMs ?? DRIVING_QUIZ_USER_ANSWER_COOLDOWN_DEFAULT_MS));
      if (userId && cooldownMs > 0) {
        if (!game.userLastAnswerAt || typeof game.userLastAnswerAt !== "object") {
          game.userLastAnswerAt = {};
        }
        const last = Number(game.userLastAnswerAt[userId] || 0);
        const nowMs = Date.now();
        if (last && nowMs - last < cooldownMs) {
          await message.react(MINIGAME_COOLDOWN_EMOJI).catch(() => { });
          return false;
        }
        game.userLastAnswerAt[userId] = nowMs;
      }
    }
    if (correct) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (interpretable) {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }

  if (game.type === "mathExpression") {
    const guessNum = parseMathGuess(contentForGuess);
    if (!Number.isFinite(guessNum)) return false;
    const answerNum = Number(String(game.answer).replace(",", "."));
    if (
      Number.isFinite(guessNum) &&
      Number.isFinite(answerNum) &&
      Math.abs(guessNum - answerNum) <= 0.01
    ) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (
      Number.isFinite(guessNum) &&
      Number.isFinite(answerNum) &&
      Math.abs(guessNum - answerNum) <= 1
    ) {
      await message.react("<a:VC_Flame:1482725674711126140>").catch(() => { });
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }

  if (game.type === "hangman") {
    if (game._claiming) return true;
    const maxMisses = Number(game.maxMisses || 10);
    const normalized = normalizeCountryName(contentForGuess);
    if (!normalized) return false;
    const guessParts = normalized.split(" ").filter(Boolean);
    if (guessParts.length !== 1) return false;
    const guessText = guessParts[0];
    const wordNorm = normalizeCountryName(String(game.word || ""));
    const userId = String(message.author?.id || "");
    if (!userId) return false;

    if (isHangmanFullWordMatch(guessText, wordNorm)) {
      if (shouldRevealHangmanSolutionOnBoard(cfg, game, message.channelId || message.channel?.id)) {
        const fullWordShown = String(game.word || "").split("").join(" ");
        await updateHangmanBoardMessage(message, game, fullWordShown);
      }
      await handleMinigameWin(message, game, cfg);
      return true;
    }

    if (game._lossFinalized) return true;

    const userMisses = game.userMisses && typeof game.userMisses === "object" ? game.userMisses : {};
    game.userMisses = userMisses;
    const currentUserMisses = Number(userMisses[userId] || 0);
    if (currentUserMisses >= maxMisses) {
      await reactMinigameWrongEmoji(message, game);
      return true;
    }

    if (
      guessText.length > 1 &&
      isNearTextGuess(guessText, [game.word], {
        maxDistance: 2,
        maxRatio: 0.28,
        minGuessLength: 4,
      })
    ) {
      await message.react("<a:VC_Flame:1482725674711126140>").catch(() => { });
      return true;
    }

    const guessed = new Set(
      (Array.isArray(game.guessedLetters) ? game.guessedLetters : [])
        .map((ch?) => normalizeCharForGuess(ch))
        .filter((ch?) => /^[a-z0-9]$/.test(ch)),
    );
    let guessHandled = false;
    if (guessText.length === 1 && /^[a-z0-9]$/.test(guessText)) {
      const letter = guessText;
      guessHandled = true;
      if (guessed.has(letter)) {
        await message.delete().catch(() => {});
        return true;
      }
      guessed.add(letter);
      game.guessedLetters = Array.from(guessed.values());
      const isCorrectLetter = wordNorm && wordNorm.includes(letter);
      if (!isCorrectLetter) {
        userMisses[userId] = currentUserMisses + 1;
        game.misses = Math.max(Number(game.misses || 0), Number(userMisses[userId] || 0));
        await reactMinigameWrongEmoji(message, game);
      } else {
        await message.react(MINIGAME_CORRECT_FALLBACK_EMOJI).catch(() => { });
      }
    } else if (guessText.length > 1) {
      guessHandled = true;
      userMisses[userId] = currentUserMisses + 1;
      game.misses = Math.max(Number(game.misses || 0), Number(userMisses[userId] || 0));
      await reactMinigameWrongEmoji(message, game);
    }
    if (!guessHandled) return false;

    const solved = wordNorm && wordNorm.split("").every((ch?) => guessed.has(normalizeCharForGuess(ch)));
    if (solved) {
      if (shouldRevealHangmanSolutionOnBoard(cfg, game, message.channelId || message.channel?.id)) {
        const fullWordShown = String(game.word || "").split("").join(" ");
        await updateHangmanBoardMessage(message, game, fullWordShown);
      }
      await handleMinigameWin(message, game, cfg);
      return true;
    }

    if (Number(game.misses || 0) >= maxMisses) {
      await finalizeHangmanLoss(message, client, cfg, game);
      return true;
    }

    await saveActiveGame(client, cfg, {
      type: "hangman",
      target: JSON.stringify({
        word: game.word,
        guessedLetters: game.guessedLetters,
        misses: Number(game.misses || 0),
        maxMisses: Number(game.maxMisses || 10),
        userMisses: game.userMisses && typeof game.userMisses === "object" ? game.userMisses : {},
      }),
      rewardExp: Number(game.rewardExp || 0),
      startedAt: new Date(game.startedAt || Date.now()),
      endsAt: new Date(game.endsAt || Date.now()),
      gameMessageId: game.gameMessageId || null,
    });

    const maskedWord = maskHangmanWord(game.word, guessed);
    const hmMaxU = Number(game.maxMisses || 10);
    const hmErrU = Math.min(hmMaxU, Number(game.misses || 0));
    const hangmanUpdateAttachment = buildPromptImageAttachment("Impiccato", [
      maskedWord,
      `Errori: ${hmErrU}/${hmMaxU}`,
    ],
      "hangman",
      `update_${Date.now()}`, client, Boolean(game.burrobirraApplies));
    const hangmanUpdateEmbed = buildHangmanEmbed(maskedWord, game.rewardExp, Math.max(1000, game.endsAt - Date.now()));
    if (hangmanUpdateAttachment) {
      hangmanUpdateEmbed.setImage(`attachment://${hangmanUpdateAttachment.name}`);
    }
    const channel = message.channel;
    const gameMsg = game.gameMessageId && channel ? await channel.messages.fetch(game.gameMessageId).catch(() => null) : null;
    if (gameMsg) {
      await gameMsg
        .edit({
          embeds: [hangmanUpdateEmbed],
          files: hangmanUpdateAttachment ? [hangmanUpdateAttachment] : [],
        })
        .catch(() => { });
    }
    return true;
  }

  if (game.type === "guessYear") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    const guessNum = parseInt(content.replace(/\D/g, ""), 10);
    if (!Number.isFinite(guessNum)) return false;
    if (guessNum === game.year) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    const diff = Math.abs(guessNum - game.year);
    if (diff <= 2) await message.react("<a:VC_Flame:1482725674711126140>").catch(() => {});
    else await reactMinigameWrongEmoji(message, game);
    await message
      .reply({ embeds: [buildYearHintEmbed(guessNum < game.year)] })
      .catch(() => {});
    return true;
  }

  if (game.type === "completeVerse") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizeCountryName, {
        minGuessLength: 2,
        minTokenLength: 2,
        singleTokenMinLength: 2,
      })
    ) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (isNearTextGuess(contentForGuess, game.answers, { maxDistance: 2, maxRatio: 0.3 })) {
      await message.react("<a:VC_Flame:1482725674711126140>").catch(() => {});
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }

  if (game.type === "guessEmoji") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizeCountryName, {
        minGuessLength: 2,
        minTokenLength: 2,
        singleTokenMinLength: 2,
      })
    ) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (isNearTextGuess(contentForGuess, game.answers, { maxDistance: 2, maxRatio: 0.3 })) {
      await message.react("<a:VC_Flame:1482725674711126140>").catch(() => {});
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }

  if (game.type === "quoteFilm") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizeCountryName, {
        minGuessLength: 2,
        minTokenLength: 2,
        singleTokenMinLength: 3,
      })
    ) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (isNearTextGuess(contentForGuess, game.answers, { maxDistance: 2, maxRatio: 0.25 })) {
      await message.react("<a:VC_Flame:1482725674711126140>").catch(() => {});
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }

  if (game.type === "completeProverb") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizeCountryName, {
        minGuessLength: 1,
        minTokenLength: 1,
        singleTokenMinLength: 2,
      })
    ) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (isNearTextGuess(contentForGuess, game.answers, { maxDistance: 2, maxRatio: 0.35 })) {
      await message.react("<a:VC_Flame:1482725674711126140>").catch(() => {});
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }

  if (game.type === "synonymAntonym") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizeCountryName, {
        minGuessLength: 2,
        minTokenLength: 2,
        singleTokenMinLength: 2,
      })
    ) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (isNearTextGuess(contentForGuess, game.answers, { maxDistance: 1, maxRatio: 0.25 })) {
      await message.react("<a:VC_Flame:1482725674711126140>").catch(() => {});
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }

  if (game.type === "guessCity") {
    if (await rejectMinigameShotgunListingGuess(message, content, "multiline")) return false;
    if (
      isLooseAliasGuessCorrect(contentForGuess, game.answers, normalizeCountryName, {
        minGuessLength: 2,
        minTokenLength: 2,
        singleTokenMinLength: 3,
      })
    ) {
      await handleMinigameWin(message, game, cfg);
      return true;
    }
    if (isNearTextGuess(contentForGuess, game.answers, { maxDistance: 2, maxRatio: 0.25 })) {
      await message.react("<a:VC_Flame:1482725674711126140>").catch(() => {});
    } else {
      await reactMinigameWrongEmoji(message, game);
    }
    return false;
  }

  return false;
}

async function handleMinigameButton(interaction?, client?) {
  if (!interaction?.isButton?.()) return false;
  const cfg = getConfig(client);
  if (!cfg?.enabled) return false;

  if (interaction.customId.startsWith("minigame_song_preview:")) {
    const clickedCustomId = String(interaction.customId || "");
    const clickedMessageId = String(interaction.message?.id || "");
    const clickedChannelId = String(interaction.channelId || "");

    let game = null;
    for (const [channelId, state] of activeGames.entries()) {
      if (!state || state.type !== "guessSong") continue;
      if (String(state.previewCustomId || "") === clickedCustomId) {
        game = state;
        break;
      }
      if (
        clickedMessageId &&
        clickedChannelId &&
        String(channelId || "") === clickedChannelId &&
        String(state.gameMessageId || "") === clickedMessageId
      ) {
        game = state;
      }
    }

    if (!game) {
      await interaction
        .reply({ content: "<:cancel:1461730653677551691> Anteprima non disponibile.", flags: 1 << 6 })
        .catch(() => { });
      return true;
    }

    await interaction.deferReply({ flags: 1 << 6 }).catch(() => { });
    if (!game.previewUrl) {
      await interaction
        .editReply({ content: "<:cancel:1461730653677551691> Anteprima non disponibile." })
        .catch(() => { });
      return true;
    }

    const audio = await fetchAudioAttachment(game.previewUrl);
    if (!audio) {
      await interaction
        .editReply({
          content: `<:cancel:1461730653677551691> Non riesco ad allegare il file, ascoltala qui:
${game.previewUrl}`,
        })
        .catch(() => { });
      return true;
    }

    const fallbackText = "<:link:1470064815899803668> Se su telefono non si riproduce, apri questo link per ascoltare: " + game.previewUrl;
    await interaction
      .editReply({
        content: fallbackText,
        files: [new AttachmentBuilder(audio, { name: "anteprima.m4a" })],
      })
      .catch(() => { });
    return true;
  }

  if (String(interaction.customId || "").startsWith("minigame_trickortreat:")) {
    const wantId = String(interaction.customId || "");
    const chId = String(interaction.channelId || cfg.channelId || "").trim();
    const mapKey = trickOrTreatMapKey(chId);
    let totGame = getTrickOrTreatGame(chId);
    if (!totGame || totGame.customId !== wantId) {
      totGame = null;
      for (const g of activeGames.values()) {
        if (g && g.type === "halloweenTrickOrTreat" && String(g.customId || "") === wantId) {
          totGame = g;
          break;
        }
      }
    }
    const mountTot = (game?) => {
      if (!game || !chId) return null;
      scheduleTrickOrTreatRoundTimers(
        interaction.client,
        { ...cfg, channelId: chId, guildId: interaction.guildId || cfg.guildId },
        interaction.channel,
        game,
      );
      activeGames.set(mapKey, game);
      const legacy = activeGames.get(chId);
      if (legacy?.type === "halloweenTrickOrTreat") activeGames.delete(chId);
      return game;
    };
    // Rehydrate da doc ToT dedicato (o legacy sullo slot minigioco se ancora ToT)
    if (!totGame && chId) {
      try {
        const guildId = String(interaction.guildId || "").trim();
        if (guildId) {
          let state = await minigameStateFindOneLean({
            guildId,
            channelId: trickOrTreatStateChannelId(chId),
          }).catch(() => null);
          if (!state || state.type !== "halloweenTrickOrTreat") {
            const main = await minigameStateFindOneLean({ guildId, channelId: chId }).catch(() => null);
            if (main?.type === "halloweenTrickOrTreat") state = main;
          }
          if (state?.type === "halloweenTrickOrTreat") {
            const parsed = parseStateTarget(state.target);
            const customId = state.customId || parsed?.customId || wantId;
            if (customId === wantId) {
              const endsAt = new Date(state.endsAt).getTime();
              if (endsAt > Date.now()) {
                totGame = mountTot({
                  type: "halloweenTrickOrTreat",
                  rewardExp: Number(state.rewardExp || 0),
                  treatChancePercent: Number(parsed?.treatChancePercent ?? 80),
                  candyOnTreat: Number(parsed?.candyOnTreat ?? 1),
                  claimedBy: parsed?.claimedBy && typeof parsed.claimedBy === "object" ? { ...parsed.claimedBy } : {},
                  customId,
                  startedAt: new Date(state.startedAt).getTime(),
                  endsAt,
                  timeout: null,
                  gameMessageId: state.gameMessageId || interaction.message?.id || null,
                  multiClaim: true,
                });
                await saveTrickOrTreatGame(
                  interaction.client,
                  { ...cfg, channelId: chId, guildId },
                  {
                    type: "halloweenTrickOrTreat",
                    target: JSON.stringify({
                      treatChancePercent: totGame.treatChancePercent,
                      candyOnTreat: totGame.candyOnTreat,
                      claimedBy: totGame.claimedBy,
                      customId,
                    }),
                    rewardExp: totGame.rewardExp,
                    startedAt: new Date(totGame.startedAt),
                    endsAt: new Date(totGame.endsAt),
                    gameMessageId: totGame.gameMessageId,
                    customId,
                  },
                ).catch(() => {});
              }
            }
          }
        }
      } catch (err) {
        warnMinigame(err);
      }
    }
    // Recovery immediato: Impiccato ha rubato lo slot — riattiva dal customId / timestamp messaggio
    if (!totGame && chId) {
      const recovered = buildTrickOrTreatGameFromCustomId(
        wantId,
        cfg,
        interaction.message?.id || null,
        interaction.message?.createdTimestamp || null,
      );
      if (recovered) {
        totGame = mountTot(recovered);
        await saveTrickOrTreatGame(
          interaction.client,
          { ...cfg, channelId: chId, guildId: interaction.guildId || cfg.guildId },
          {
            type: "halloweenTrickOrTreat",
            target: JSON.stringify({
              treatChancePercent: recovered.treatChancePercent,
              candyOnTreat: recovered.candyOnTreat,
              claimedBy: {},
              customId: wantId,
            }),
            rewardExp: recovered.rewardExp,
            startedAt: new Date(recovered.startedAt),
            endsAt: new Date(recovered.endsAt),
            gameMessageId: recovered.gameMessageId,
            customId: wantId,
          },
        ).catch(() => {});
        global.logger?.info?.("[MINIGAMES] ToT recovered from button customId (slot was stolen)", {
          channelId: chId,
          customId: wantId,
          endsAt: recovered.endsAt,
        });
      }
    }
    if (!totGame || totGame.type !== "halloweenTrickOrTreat" || interaction.customId !== totGame.customId) {
      await interaction
        .reply({
          content: "<:cancel:1461730653677551691> Round Trick or Treat non attivo.",
          flags: 1 << 6,
        })
        .catch(() => {});
      return true;
    }
    const totCfg = { ...cfg, channelId: chId || cfg.channelId, guildId: interaction.guildId || cfg.guildId };
    await handleHalloweenTrickOrTreatButton(interaction, totGame, totCfg);
    return true;
  }

  const game = activeGames.get(cfg.channelId);
  const isFindBotButton =
    String(interaction.customId || "").startsWith("minigame_findbot:");
  const isFindGhostButton =
    String(interaction.customId || "").startsWith("minigame_findghost:");
  const isFindScrollButton =
    String(interaction.customId || "").startsWith("minigame_findscroll:");
  const isFindHiddenButton = isFindBotButton || isFindScrollButton || isFindGhostButton;
  const expectedType = isFindScrollButton
    ? "findScroll"
    : isFindGhostButton
      ? "halloweenFindGhost"
      : "findBot";
  let liveGame = game && game.type === expectedType ? game : null;
  let liveMapKey = liveGame ? String(cfg.channelId || "") : "";
    if (!liveGame && isFindHiddenButton) {
    const wantId = String(interaction.customId || "");
    for (const [key, g] of activeGames.entries()) {
      if (g && g.type === expectedType && String(g.customId || "") === wantId) {
        liveGame = g;
        liveMapKey = String(key);
        break;
      }
    }
  }
  if (!liveGame) {
    if (isFindHiddenButton) {
      await interaction
        .reply({
          content: "<:cancel:1461730653677551691> Partita già conclusa o non attiva.",
          flags: 1 << 6,
        })
        .catch(() => {});
      return true;
    }
    return false;
  }
  if (interaction.customId !== liveGame.customId) {
    if (isFindHiddenButton) {
      await interaction
        .reply({
          content: "<:cancel:1461730653677551691> Questo pulsante non è più valido.",
          flags: 1 << 6,
        })
        .catch(() => {});
      return true;
    }
    return false;
  }

  const winCfg =
    liveMapKey && liveMapKey !== String(cfg.channelId || "")
      ? { ...cfg, channelId: liveMapKey }
      : cfg;
  if (liveGame.finaleChaos && liveGame.type === "findScroll") {
    try {
      const { CHAOS_FIND_SCROLL_WINNERS } = require("../Community/hogwartsFinaleChaosDayService") as typeof import("../Community/hogwartsFinaleChaosDayService");
      liveGame.finaleChaos.requiredWinners = Math.max(
        2,
        Number(liveGame.finaleChaos.requiredWinners) || Number(CHAOS_FIND_SCROLL_WINNERS) || 2,
      );
    } catch (_) {
      liveGame.finaleChaos.requiredWinners = Math.max(2, Number(liveGame.finaleChaos.requiredWinners) || 2);
    }
  }
  await handleMinigameButtonWin(interaction, liveGame, winCfg);
  return true;
}

async function restoreSingleHouseChannelActiveGame(client?, chId?, houseId?, guildId?) {
  const houseChannelSvc = require("../Community/hogwartsHouseChannelMinigameService") as typeof import("../Community/hogwartsHouseChannelMinigameService");
  const channelId = String(chId || "").trim();
  const gid = String(guildId || "").trim();
  if (!channelId || !gid || activeGames.has(channelId)) return false;
  if (channelWinClosing.has(channelId) || isMinigameRehydrateBlocked(channelId)) return false;
  const partialCfg = { guildId: gid, channelId };
  await purgeExpiredMinigameDbState(client, partialCfg);
  const state = await minigameStateFindOneLean({ guildId: gid, channelId }).catch(() => null);
  if (!state) return false;
  const endsAt = new Date(state.endsAt).getTime();
  if (endsAt <= Date.now()) {
    const channel = await getChannelCached(client, channelId);
    const mode = state.type === "hogwartsObservationTower" ? "tower" : "themed";
    const closeCfg = houseChannelSvc.buildHouseChannelSpawnCfg(client, channelId, houseId, mode) || partialCfg;
    closeCfg.guildId = gid;
    if (channel) {
      await closeExpiredMinigameState(client, closeCfg, channel, state);
    } else {
      await clearActiveGame(client, { ...partialCfg, guildId: gid, channelId });
    }
    return false;
  }
  if (!isHogwartsThemedMinigameType(state.type)) {
    await clearActiveGame(client, partialCfg);
    return false;
  }
  const mode = state.type === "hogwartsObservationTower" ? "tower" : "themed";
  const cfg = houseChannelSvc.buildHouseChannelSpawnCfg(client, channelId, houseId, mode);
  if (!cfg) {
    await clearActiveGame(client, partialCfg);
    return false;
  }
  cfg.guildId = gid;
  const channel = await getChannelCached(client, channelId);
  if (!channel?.guild) return false;
  const remainingMs = endsAt - Date.now();
  if (remainingMs <= 0) return false;
  await mountHouseChannelActiveGameFromState(client, cfg, channel, state, remainingMs);
  if (activeGames.has(channelId)) channelNoRehydrateUntil.delete(channelId);
  return activeGames.has(channelId);
}

async function ensureHouseChannelActiveGameFromDb(client?, channelId?, guildId?) {
  const houseChannelSvc = require("../Community/hogwartsHouseChannelMinigameService") as typeof import("../Community/hogwartsHouseChannelMinigameService");
  const chId = String(channelId || "").trim();
  const houseId = houseChannelSvc.getHouseIdForChannel(chId);
  if (!houseId) return false;
  const gid = String(guildId || IDs.guilds?.main || "").trim();
  if (!gid) return false;
  return restoreSingleHouseChannelActiveGame(client, chId, houseId, gid);
}

async function mountHouseChannelActiveGameFromState(client?, cfg?, channel?, state?, remainingMs?) {
  const chId = String(cfg.channelId || "").trim();
  const endsAt = new Date(state.endsAt).getTime();
  if (state.type === "hogwartsQuiz") {
    restoreHogwartsPodiumFromState(chId, state);
    await mountHogwartsQuizGameFromState(client, cfg, channel, state, remainingMs);
  } else if (state.type === "hogwartsCipher") {
    const parsed = parseStateTarget(state.target);
    const numbers = parsed?.numbers || "";
    const cipherAnswers = resolveHogwartsCipherAnswersFromParsed(parsed);
    const game = {
      type: "hogwartsCipher",
      numbers,
      answerNumbers: cipherAnswers.answerNumbers,
      sourceAnswers: cipherAnswers.sourceAnswers,
      answers: cipherAnswers.answers,
      displayAnswer: cipherAnswers.displayAnswer,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout: null,
      hintTimeout: null,
      gameMessageId: state.gameMessageId || null,
    };
    activeGames.set(cfg.channelId, attachHogwartsHouseChannelMeta(game, cfg));
    restoreHogwartsPodiumFromState(chId, state, game);
    game.timeout = scheduleMinigameRoundTimeout(client, cfg, cfg.channelId, channel, remainingMs);
    game.hintTimeout = await scheduleGenericHint(client, cfg.channelId, remainingMs, `Parola: ${buildRevealHint(cipherAnswers.displayAnswer)}`);
  } else if (state.type === "hogwartsMemoryEmoji" || state.type === "memoryEmoji") {
    await mountMemoryEmojiGameFromState(client, cfg, channel, state, remainingMs);
  } else if (state.type === "hogwartsObservationTower") {
    const parsed = parseStateTarget(state.target);
    const targetBricks = Math.max(1, Number(parsed?.targetBricks || OBSERVATION_TOWER_DEFAULT_TARGET_BRICKS));
    const houseBrickCounts = parseObservationTowerHouseBrickCounts(parsed);
    const participantCounts = serializeObservationTowerParticipants(parsed?.participantCounts);
    const participantHouses = serializeObservationTowerParticipantHouses(parsed?.participantHouses);
    const maxPerUser = Math.max(1, Number(parsed?.maxPerUser || OBSERVATION_TOWER_DEFAULT_MAX_PER_USER));
    const minLetters = Math.max(1, Number(parsed?.minLetters || 5));
    const soloHouseId = String(parsed?.soloHouseId || cfg?.hogwartsHouseChannelMeta?.soloHouseId || "").trim();
    const minPlayers = Math.max(1, Number(parsed?.minPlayers || OBSERVATION_TOWER_DEFAULT_MIN_PLAYERS));
    const housePoints = Math.max(0, Math.floor(Number(parsed?.housePoints) || 0));
    const rewardExp = Number(state.rewardExp || 0);
    syncObservationTowerSpawnCfgFromGame(cfg, {
      type: "hogwartsObservationTower",
      targetBricks,
      minPlayers,
      housePoints,
    });
    const startedAt = new Date(state.startedAt).getTime();
    const towerGame: Record<string, any> = {
      type: "hogwartsObservationTower",
      targetBricks,
      houseBrickCounts,
      participantCounts,
      participantHouses,
      maxPerUser,
      minLetters,
      minPlayers,
      housePoints,
      rewardExp,
      startedAt,
      endsAt,
      timeout: null,
      gameMessageId: state.gameMessageId || null,
      soloHouseId,
      hogwartsHouseChannel: cfg?.hogwartsHouseChannelMeta || null,
    };
    const restoredBasilisk = restoreObservationTowerBasiliskFromParsed(parsed);
    if (restoredBasilisk) towerGame.basilisk = restoredBasilisk;
    syncObservationTowerBricksToUserCaps(towerGame);
    if (isObservationTowerComplete(towerGame)) {
      await clearActiveGame(client, { guildId: cfg.guildId, channelId: chId });
      return;
    }
    activeGames.set(cfg.channelId, towerGame);
    towerGame.timeout = scheduleMinigameRoundTimeout(client, cfg, cfg.channelId, channel, remainingMs);
  } else {
    await clearActiveGame(client, { guildId: cfg.guildId, channelId: chId });
    return;
  }
  const game = activeGames.get(chId);
  if (game && cfg.hogwartsHouseChannelMeta) {
    game.hogwartsHouseChannel = { ...cfg.hogwartsHouseChannelMeta };
    if (cfg.hogwartsHouseChannelMeta.soloHouseId) {
      game.soloHouseId = String(cfg.hogwartsHouseChannelMeta.soloHouseId);
    }
  }
  if (game && game.type !== "hogwartsObservationTower") {
    await catchUpTextMinigameWinFromHistory(client, cfg, channel, game).catch(() => false);
  }
}

async function restoreHouseChannelActiveGames(client?) {
  const baseCfg = getConfig(client);
  if (!baseCfg?.enabled) return;
  const houseChannelSvc = require("../Community/hogwartsHouseChannelMinigameService") as typeof import("../Community/hogwartsHouseChannelMinigameService");
  const guildId = String(IDs.guilds?.main || "").trim();
  if (!guildId) return;
  for (const [channelId, houseId] of houseChannelSvc.HOUSE_CHANNEL_MAP) {
    await restoreSingleHouseChannelActiveGame(client, channelId, houseId, guildId);
  }
}

async function restoreActiveGames(client?) {
  const cfg = getConfig(client);
  if (!cfg?.enabled || !cfg.channelId) return;
  let channel = await getChannelCached(client, cfg.channelId);
  let guildId = channel?.guild?.id || null;
  if (!guildId) guildId = await resolveMinigameGuildIdAsync(cfg, client);
  if (!guildId) return;
  if (!channel) channel = await getChannelCached(client, cfg.channelId);
  await loadRotationState(client, { ...cfg, guildId }, guildId);
  const restoreCfg = { ...cfg, guildId };
  // ToT su slot dedicato: resta attivo anche se Impiccato occupa lo slot minigioco.
  if (channel?.guild) {
    await restoreTrickOrTreatSideSlot(client, restoreCfg, channel).catch((err?) => warnMinigame(err));
  }
  const state = await minigameStateFindOneLean({ guildId, channelId: cfg.channelId, }).catch(() => null);
  if (!state) return;
  if (restoreCfg.hogwartsEventLive && isHogwartsExclusiveMinigamesEnabled(client, restoreCfg) && !isHogwartsEventMinigameType(state.type, restoreCfg)) {
    await clearActiveGame(client, restoreCfg);
    return;
  }
  const now = Date.now();
  const endsAt = new Date(state.endsAt).getTime();
  if (endsAt <= now) {
    if (channel) await closeExpiredMinigameState(client, restoreCfg, channel, state);
    else await clearActiveGame(client, restoreCfg);
    return;
  }
  if (!channel?.guild) return;
  const remainingMs = endsAt - now;
  if (state.type === "guessNumber") {
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutNumberEmbed(game.target)); }, remainingMs); timeout.unref?.();
    const game = {
      type: "guessNumber",
      target: Number(state.target),
      min: Number(state.min),
      max: Number(state.max),
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      gameMessageId: state.gameMessageId || null,
    };
    restoreHogwartsPodiumFromState(cfg.channelId, state, game);
    activeGames.set(cfg.channelId, game);
    return;
  }
  restoreHogwartsPodiumFromState(cfg.channelId, state);
  if (state.type === "guessWord") {
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutWordEmbed(game.target)); }, remainingMs); timeout.unref?.();
    activeGames.set(cfg.channelId, {
      type: "guessWord",
      target: String(state.target || "").toLowerCase(),
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "guessFlag") {
    const parsed = parseStateTarget(state.target);
    const answers = Array.isArray(parsed?.names) ? parsed.names : [];
    const displayName = parsed?.displayName || "la bandiera";
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutFlagEmbed(game.displayName)); }, remainingMs); timeout.unref?.();
    const countryHint = buildCountryHint(parsed);
    const hintTimeout = await scheduleGenericHint(
      client,
      cfg.channelId,
      remainingMs,
      countryHint || `Nazione: ${buildRevealHint(displayName)}`,
    );
    activeGames.set(cfg.channelId, {
      type: "guessFlag",
      answers,
      displayName,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "guessPlayer") {
    const parsed = parseStateTarget(state.target);
    const name = parsed?.name || "il calciatore";
    const team = parsed?.team || "Squadra sconosciuta";
    const nationality = parsed?.nationality || "Nazionalità sconosciuta";
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutPlayerEmbed(game.displayName)); }, remainingMs); timeout.unref?.();
    const hintTimeout = await scheduleGenericHint(client, cfg.channelId, remainingMs, `${team} \u2022 ${nationality} \u2022 ${buildRevealHint(name)}`,
  );
    activeGames.set(cfg.channelId, {
      type: "guessPlayer",
      answers: buildPlayerAnswerAliases(name, parsed?.aliases),
      fullAnswer: normalizePlayerGuess(name),
      displayName: name,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "hogwartsGuessCharacter") {
    const parsed = parseStateTarget(state.target);
    const name = parsed?.name || "il personaggio";
    const house = parsed?.house || "Hogwarts";
    const role = parsed?.role || "Personaggio";
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutHogwartsGuessCharacterEmbed(game.displayName)); }, remainingMs); timeout.unref?.();
    const hintTimeout = await scheduleGenericHint(client, cfg.channelId, remainingMs, `${house} \u2022 ${role} \u2022 ${buildRevealHint(name)}`);
    const sourceAliases = Array.isArray(parsed?.aliases)
      ? parsed.aliases.map((a?) => String(a || "").trim()).filter(Boolean)
      : [];
    activeGames.set(cfg.channelId, {
      type: "hogwartsGuessCharacter",
      answers: buildStrictBankAliases([name, ...sourceAliases], normalizePlayerGuess),
      sourceAliases,
      fullAnswer: normalizePlayerGuess(name),
      displayName: name,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "guessSong") {
    const parsed = parseStateTarget(state.target);
    const title = parsed?.title || "la canzone";
    const artist = parsed?.artist || "";
    const artistCountry = parsed?.artistCountry || "Nazionalità sconosciuta";
    const genre = parsed?.genre || "Genere sconosciuto";
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutSongEmbed(game.title, game.artist)); }, remainingMs); timeout.unref?.();
    const hintTimeout = await scheduleGenericHint(client, cfg.channelId, remainingMs, `${artistCountry} \u2022 ${genre} \u2022 Canzone: ${buildRevealHint(title)}`,
  );
    activeGames.set(cfg.channelId, {
      type: "guessSong",
      title,
      artist,
      previewUrl: parsed?.previewUrl || null,
      previewCustomId: state.customId || null,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "guessCapital") {
    const parsed = parseStateTarget(state.target);
    const country = parsed?.country || "nazione sconosciuta";
    const answers = Array.isArray(parsed?.answers) ? parsed.answers : [];
    const displayAnswer = parsed?.displayAnswer || answers[0] || "sconosciuta";
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutCapitalEmbed(game.country, game.displayAnswer)); }, remainingMs); timeout.unref?.();
    const capitalHint = buildCapitalHint(country);
    const hintTimeout = await scheduleGenericHint(client, cfg.channelId, remainingMs, capitalHint || `Capitale: ${buildRevealHint(displayAnswer)}`);
    activeGames.set(cfg.channelId, {
      type: "guessCapital",
      country,
      answers,
      displayAnswer,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "guessReverseCapital") {
    const parsed = parseStateTarget(state.target);
    const capital = parsed?.capital || "capitale sconosciuta";
    const country = parsed?.country || "nazione sconosciuta";
    const answers = Array.isArray(parsed?.answers) ? parsed.answers : [];
    const displayAnswer = parsed?.displayAnswer || country || answers[0] || "sconosciuto";
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutReverseCapitalEmbed(game.capital, game.displayAnswer)); }, remainingMs); timeout.unref?.();
    const capitalHint = buildCapitalHint(country);
    const hintTimeout = await scheduleGenericHint(client, cfg.channelId, remainingMs, capitalHint || `Stato: ${buildRevealHint(displayAnswer)}`);
    activeGames.set(cfg.channelId, {
      type: "guessReverseCapital",
      capital,
      country,
      answers,
      displayAnswer,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "guessRegionCapital") {
    const parsed = parseStateTarget(state.target);
    const region = parsed?.region || "regione sconosciuta";
    const answers = Array.isArray(parsed?.answers) ? parsed.answers : [];
    const displayAnswer = parsed?.displayAnswer || answers[0] || "sconosciuto";
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutRegionCapitalEmbed(game.region, game.displayAnswer),); }, remainingMs); timeout.unref?.();
    const regionHint = buildRegionCapitalHint(region);
    const hintTimeout = await scheduleGenericHint(client, cfg.channelId, remainingMs, regionHint || `Capoluogo: ${buildRevealHint(displayAnswer)}`);
    activeGames.set(cfg.channelId, {
      type: "guessRegionCapital",
      region,
      answers,
      displayAnswer,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "fastType") {
    const parsed = parseStateTarget(state.target);
    const phrase = parsed?.phrase || "";
    const normalizedPhrase = parsed?.normalizedPhrase || normalizeCountryName(phrase);
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutFastTypeEmbed(game.phrase)); }, remainingMs); timeout.unref?.();
    activeGames.set(cfg.channelId, {
      type: "fastType",
      phrase,
      normalizedPhrase,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "guessTeam") {
    const parsed = parseStateTarget(state.target);
    const team = parsed?.team || "squadra sconosciuta";
    const answers = Array.isArray(parsed?.answers) ? parsed.answers : buildAliases([team]);
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutTeamEmbed(game.team)); }, remainingMs); timeout.unref?.();
    activeGames.set(cfg.channelId, {
      type: "guessTeam",
      team,
      answers,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "guessSinger") {
    const parsed = parseStateTarget(state.target);
    const name = parsed?.name || "cantante sconosciuto";
    const answers = Array.isArray(parsed?.answers) ? parsed.answers : buildAliases([name]);
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutSingerEmbed(game.name)); }, remainingMs); timeout.unref?.();
    activeGames.set(cfg.channelId, {
      type: "guessSinger",
      name,
      answers,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "guessAlbum") {
    const parsed = parseStateTarget(state.target);
    const album = parsed?.album || "album sconosciuto";
    const artist = parsed?.artist || "artista sconosciuto";
    const answers = Array.isArray(parsed?.answers) ? parsed.answers : buildAliases([album]);
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutAlbumEmbed(game.album, game.artist)); }, remainingMs); timeout.unref?.();
    activeGames.set(cfg.channelId, {
      type: "guessAlbum",
      album,
      artist,
      answers,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "hangman") {
    const parsed = parseStateTarget(state.target);
    const word = normalizeCountryName(parsed?.word || "");
    const guessedLetters = Array.isArray(parsed?.guessedLetters) ? parsed.guessedLetters : [];
    const misses = Number(parsed?.misses || 0);
    const maxMisses = Number(parsed?.maxMisses || 10);
    const userMisses = parsed?.userMisses && typeof parsed.userMisses === "object" ? parsed.userMisses : {};
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutHangmanEmbed(game.word)); }, remainingMs); timeout.unref?.();
    activeGames.set(cfg.channelId, {
      type: "hangman",
      word,
      guessedLetters,
      misses,
      userMisses,
      maxMisses,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "italianGK" || state.type === "halloweenQuiz") {
    const parsed = parseStateTarget(state.target);
    const question = parsed?.question || "Domanda";
    const answers = Array.isArray(parsed?.answers) ? parsed.answers : [];
    const displayAnswer = parsed?.displayAnswer || answers[0] || "sconosciuta";
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildMinigameTimeoutEmbedForGame(game)); }, remainingMs); timeout.unref?.();
    activeGames.set(cfg.channelId, {
      type: state.type,
      question,
      answers,
      displayAnswer,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "halloweenMissingEmoji" || state.type === "halloweenCountBats") {
    const parsed = parseStateTarget(state.target);
    const snapshot = buildGameSnapshotFromPersistedState(state);
    const timeout = setTimeout(async () => {
      const game = activeGames.get(cfg.channelId);
      if (!game) return;
      await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildMinigameTimeoutEmbedForGame(game));
    }, remainingMs);
    timeout.unref?.();
    activeGames.set(cfg.channelId, {
      ...snapshot,
      type: state.type,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      gameMessageId: state.gameMessageId || null,
      missing: parsed?.missing,
      count: parsed?.count,
      display: parsed?.display,
      choices: Array.isArray(parsed?.choices) ? parsed.choices : snapshot.choices || [],
      answers: parsed?.answers || snapshot.answers,
      displayAnswer: snapshot.displayAnswer,
    });
    return;
  }
  if (state.type === "halloweenTrickOrTreat") {
    // Legacy: ToT era sullo slot minigioco → migra sul side slot
    await mountRestoredTrickOrTreat(client, restoreCfg, channel, state);
    return;
  }
  if (state.type === "hogwartsQuiz") {
    await mountHogwartsQuizGameFromState(client, cfg, channel, state, remainingMs);
    return;
  }
  if (state.type === "hogwartsCipher") {
    const parsed = parseStateTarget(state.target);
    const numbers = parsed?.numbers || "";
    const cipherAnswers = resolveHogwartsCipherAnswersFromParsed(parsed);
    const game = {
      type: "hogwartsCipher",
      numbers,
      answerNumbers: cipherAnswers.answerNumbers,
      sourceAnswers: cipherAnswers.sourceAnswers,
      answers: cipherAnswers.answers,
      displayAnswer: cipherAnswers.displayAnswer,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout: null,
      hintTimeout: null,
      gameMessageId: state.gameMessageId || null,
    };
    restoreHogwartsPodiumFromState(cfg.channelId, state, game);
    activeGames.set(cfg.channelId, game);
    game.timeout = scheduleMinigameRoundTimeout(client, cfg, cfg.channelId, channel, remainingMs);
    game.hintTimeout = await scheduleGenericHint(client, cfg.channelId, remainingMs, `Parola: ${buildRevealHint(cipherAnswers.displayAnswer)}`);
    return;
  }
  if (state.type === "hogwartsObservationTower") {
    const parsed = parseStateTarget(state.target);
    const targetBricks = Math.max(1, Number(parsed?.targetBricks || OBSERVATION_TOWER_DEFAULT_TARGET_BRICKS));
    const houseBrickCounts = parseObservationTowerHouseBrickCounts(parsed);
    const participantCounts = serializeObservationTowerParticipants(parsed?.participantCounts);
    const participantHouses = serializeObservationTowerParticipantHouses(parsed?.participantHouses);
    const maxPerUser = Math.max(1, Number(parsed?.maxPerUser || OBSERVATION_TOWER_DEFAULT_MAX_PER_USER));
    const minLetters = Math.max(1, Number(parsed?.minLetters || 5));
    const soloHouseId = String(parsed?.soloHouseId || cfg?.hogwartsHouseChannelMeta?.soloHouseId || "").trim();
    const minPlayers = Math.max(1, Number(parsed?.minPlayers || OBSERVATION_TOWER_DEFAULT_MIN_PLAYERS));
    const housePoints = Math.max(0, Math.floor(Number(parsed?.housePoints) || 0));
    const rewardExp = Number(state.rewardExp || 0);
    const startedAt = new Date(state.startedAt).getTime();
    const towerGame: Record<string, any> = {
      type: "hogwartsObservationTower",
      targetBricks,
      houseBrickCounts,
      participantCounts,
      participantHouses,
      maxPerUser,
      minLetters,
      minPlayers,
      housePoints,
      rewardExp,
      startedAt,
      endsAt,
      timeout: null,
      gameMessageId: state.gameMessageId || null,
      soloHouseId,
      hogwartsHouseChannel: cfg?.hogwartsHouseChannelMeta || null,
    };
    const restoredBasilisk = restoreObservationTowerBasiliskFromParsed(parsed);
    if (restoredBasilisk) towerGame.basilisk = restoredBasilisk;
    syncObservationTowerBricksToUserCaps(towerGame);
    if (isObservationTowerComplete(towerGame)) {
      await clearActiveGame(client, { ...cfg, guildId: cfg.guildId || channel.guild?.id, channelId: cfg.channelId });
      return;
    }
    activeGames.set(cfg.channelId, towerGame);
    towerGame.timeout = scheduleMinigameRoundTimeout(client, cfg, cfg.channelId, channel, remainingMs);
    return;
  }
  if (state.type === "hogwartsMemoryEmoji" || state.type === "memoryEmoji") {
    await mountMemoryEmojiGameFromState(client, cfg, channel, state, remainingMs);
    return;
  }
  if (state.type === "drivingQuiz") {
    const parsed = parseStateTarget(state.target);
    const statement = parsed?.statement || "";
    const isMultiple = Array.isArray(parsed?.options) && Number.isFinite(parsed?.correctIndex);
    const gameState: Record<string, any> = { type: "drivingQuiz", questionType: isMultiple ? "multiple" : "trueFalse", statement, rewardExp: Number(state.rewardExp || 0), startedAt: new Date(state.startedAt).getTime(), endsAt, timeout: null, gameMessageId: state.gameMessageId || null, };
    if (isMultiple) {
      gameState.options = parsed.options;
      gameState.correctIndex = parsed.correctIndex;
    } else {
      gameState.answer = Boolean(parsed?.answer);
    }
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutDrivingQuizEmbed(game)); }, remainingMs); timeout.unref?.();
    gameState.timeout = timeout;
    activeGames.set(cfg.channelId, gameState);
    return;
  }
  if (state.type === "mathExpression") {
    const parsed = parseStateTarget(state.target);
    const expression = parsed?.expression || "";
    const answer = String(parsed?.answer || "0");
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutMathEmbed(game.answer)); }, remainingMs); timeout.unref?.();
    activeGames.set(cfg.channelId, {
      type: "mathExpression",
      expression,
      answer,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "guessYear") {
    const parsed = parseStateTarget(state.target);
    const year = Number(parsed?.year) || 0;
    const title = parsed?.title || "";
    const subtitle = parsed?.subtitle || "";
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutGuessYearEmbed(game.title, game.subtitle, game.year)); }, remainingMs); timeout.unref?.();
    const hintText = `Anno: ${buildRevealHint(String(year))}`;
    const hintTimeout = await scheduleGenericHint(client, cfg.channelId, remainingMs, hintText);
    activeGames.set(cfg.channelId, {
      type: "guessYear",
      year,
      title,
      subtitle,
      answers: [String(year), String(year).slice(-2)],
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "completeVerse") {
    const parsed = parseStateTarget(state.target);
    const answerNorm = normalizeCountryName(parsed?.answer || "");
    const answers = Array.isArray(parsed?.answers) && parsed.answers.length
      ? parsed.answers
      : [answerNorm, parsed?.answer, compactNoSpaces(answerNorm)].filter(Boolean);
    const verse = parsed?.verse || "";
    const answer = parsed?.answer || "";
    const song = parsed?.song || "";
    const artist = parsed?.artist || "";
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutCompleteVerseEmbed(game.answer, game.song, game.artist)); }, remainingMs); timeout.unref?.();
    const hintText = `Verso: ${buildRevealHint(answer)}`;
    const hintTimeout = await scheduleGenericHint(client, cfg.channelId, remainingMs, hintText);
    activeGames.set(cfg.channelId, {
      type: "completeVerse",
      answers,
      verse,
      answer,
      song,
      artist,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "guessEmoji") {
    const parsed = parseStateTarget(state.target);
    const sourceAnswers = Array.isArray(parsed?.answers) && parsed.answers.length
      ? parsed.answers
      : (parsed?.answer ? [parsed.answer] : []);
    const answers = Array.from(
      new Set(
        sourceAnswers.map((value?) => normalizeCountryName(value)).filter(Boolean),
      ),
    );
    const displayAnswer = String(parsed?.displayAnswer || sourceAnswers[0] || answers[0] || "").trim();
    if (!answers.length) return;
    const emojis = parsed?.emojis || "";
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutGuessEmojiEmbed(game.emojis, game.displayAnswer || game.answers?.[0] || "")); }, remainingMs); timeout.unref?.();
    const hintText = `Risposta: ${buildRevealHint(displayAnswer || answers[0] || "")}`;
    const hintTimeout = await scheduleGenericHint(client, cfg.channelId, remainingMs, hintText);
    activeGames.set(cfg.channelId, {
      type: "guessEmoji",
      answers,
      displayAnswer,
      emojis,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "quoteFilm") {
    const parsed = parseStateTarget(state.target);
    const primaryAnswer = String(parsed?.answer || parsed?.displayAnswer || "").trim();
    const answerNorm = normalizeCountryName(primaryAnswer);
    const answers = Array.isArray(parsed?.answers) && parsed.answers.length
      ? parsed.answers
      : [answerNorm, primaryAnswer, compactNoSpaces(answerNorm)].filter(Boolean);
    const quote = parsed?.quote || "";
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutQuoteFilmEmbed(game.quote, game.answers?.[0] || "")); }, remainingMs); timeout.unref?.();
    const hintText = `Film/Serie: ${buildRevealHint(answers[0] || "")}`;
    const hintTimeout = await scheduleGenericHint(client, cfg.channelId, remainingMs, hintText);
    activeGames.set(cfg.channelId, {
      type: "quoteFilm",
      answers,
      quote,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "completeProverb") {
    const parsed = parseStateTarget(state.target);
    const endNorm = normalizeCountryName(parsed?.end || "");
    const answers = Array.isArray(parsed?.answers) && parsed.answers.length
      ? parsed.answers
      : [endNorm, parsed?.end, compactNoSpaces(endNorm)].filter(Boolean);
    const start = parsed?.start || "";
    const end = parsed?.end || "";
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutCompleteProverbEmbed(game.start, game.end)); }, remainingMs); timeout.unref?.();
    const hintText = `Fine proverbio: ${buildRevealHint(end) ?? "—"}`;
    const hintTimeout = await scheduleGenericHint(client, cfg.channelId, remainingMs, hintText);
    activeGames.set(cfg.channelId, {
      type: "completeProverb",
      answers,
      start,
      end,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "synonymAntonym") {
    const parsed = parseStateTarget(state.target);
    const answerRaw = parsed?.answer;
    const answerNorm = normalizeCountryName(answerRaw || "");
    const answers = Array.isArray(parsed?.answers) && parsed.answers.length
      ? parsed.answers
      : [answerNorm, answerRaw, compactNoSpaces(answerNorm)].filter(Boolean);
    const word = parsed?.word || "";
    const kind = parsed?.kind || "synonym";
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; const solution = game.answers?.[0] ?? game.answer ?? ""; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutSynonymAntonymEmbed(game.word, solution, game.kind)); }, remainingMs); timeout.unref?.();
    const hintReveal = buildRevealHint(answers[0] ?? answerRaw ?? "");
    const hintText = (kind === "antonym" ? "Contrario: " : "Sinonimo: ") + (hintReveal != null ? hintReveal : "—");
    const hintTimeout = await scheduleGenericHint(client, cfg.channelId, remainingMs, hintText);
    activeGames.set(cfg.channelId, {
      type: "synonymAntonym",
      answers,
      word,
      kind,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "guessCity") {
    const parsed = parseStateTarget(state.target);
    const cityNorm = normalizeCountryName(parsed?.city || "");
    const answers = Array.isArray(parsed?.answers) && parsed.answers.length
      ? parsed.answers
      : [cityNorm, parsed?.city, compactNoSpaces(cityNorm)].filter(Boolean);
    const landmark = parsed?.landmark || "";
    const city = parsed?.city || "";
    const timeout = setTimeout(async () => { const game = activeGames.get(cfg.channelId); if (!game) return; await sendMinigameTimeoutAndClose(client, cfg, cfg.channelId, channel, game, buildTimeoutGuessCityEmbed(game.landmark, game.city || game.answers?.[0] || "")); }, remainingMs); timeout.unref?.();
    const hintText = `Città: ${buildRevealHint(city || answers[0] || "")}`;
    const hintTimeout = await scheduleGenericHint(client, cfg.channelId, remainingMs, hintText);
    activeGames.set(cfg.channelId, {
      type: "guessCity",
      answers,
      landmark,
      city,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      gameMessageId: state.gameMessageId || null,
    });
    return;
  }
  if (state.type === "treasureHunt") {
    const parsed = parseStateTarget(state.target);
    const decoy = String(parsed?.decoy || "");
    const winner = String(parsed?.winner || "");
    const winnerMessageId = parsed?.winnerMessageId ? String(parsed.winnerMessageId) : null;
    if (!decoy || !winner) {
      await clearActiveGame(client, cfg);
      return;
    }
    if (winnerMessageId) {
      const winnerExists = await channel.messages.fetch(winnerMessageId).catch(() => null);
      if (!winnerExists) {
        const url = getTreasureHuntMessageUrl(channel.guildId || channel.guild?.id, channel.id, winnerMessageId);
        const labels = await treasureHuntDisplayTexts(channel.guild, decoy, winner);
        await sendMinigameMessage(channel, {
            embeds: [
              buildTreasureHuntTimeoutEmbed(labels.decoy, labels.winner, url),
            ],
          })
          .catch(() => {});
        await clearActiveGame(client, cfg);
        return;
      }
    }
    await mountTreasureHuntGame(client, cfg, channel, state, remainingMs);
    return;
  }
  if (state.type === "findBot" || state.type === "halloweenFindGhost") {
    const timeoutEmbedBuilder =
      state.type === "halloweenFindGhost"
        ? () => buildTimeoutFindBotEmbed().setTitle("Tempo scaduto — il fantasma è scappato 👻")
        : buildTimeoutFindBotEmbed;
    const timeout = scheduleFindMinigameTimeout(client, cfg, cfg.channelId, channel, state.customId, remainingMs, timeoutEmbedBuilder);
    const hintTimeout = await scheduleMinuteHint(client, state.targetChannelId, remainingMs, cfg.channelId,);
    const game = {
      type: state.type,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      channelId: state.targetChannelId,
      messageId: state.gameMessageId || null,
      mainMessageId: state.mainMessageId || null,
      customId: state.customId,
    };
    restoreHogwartsPodiumFromState(cfg.channelId, state, game);
    activeGames.set(cfg.channelId, game);
    if (isHogwartsPodiumWinMode(cfg, state.type, game) && isHogwartsPodiumRoundComplete(game, cfg.channelId)) {
      await closeHogwartsPodiumRoundIfComplete(client, cfg, game, cfg.channelId, channel, {
        beforeClose: async () => {
          await deleteFindMinigameRemoteMessage(channel.guild, state);
        },
      });
    }
    return;
  }
  if (state.type === "findScroll") {
    const timeout = scheduleFindMinigameTimeout(client, cfg, cfg.channelId, channel, state.customId, remainingMs, buildTimeoutFindScrollEmbed);
    const hintTimeout = await scheduleMinuteHint(client, state.targetChannelId, remainingMs, cfg.channelId);
    let finaleChaos = null;
    try {
      const parsed = JSON.parse(state.target || "{}");
      if (parsed?.finaleChaos && typeof parsed.finaleChaos === "object") {
        finaleChaos = {
          ...parsed.finaleChaos,
          requiredWinners: Math.max(2, Number(parsed.finaleChaos.requiredWinners) || 2),
          winnerIds: Array.isArray(parsed.finaleChaos.winnerIds)
            ? parsed.finaleChaos.winnerIds.map(String)
            : [],
        };
      }
    } catch (errParseChaos) {
      warnMinigame(errParseChaos);
    }
    const game = {
      type: "findScroll",
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      channelId: state.targetChannelId,
      messageId: state.gameMessageId || null,
      mainMessageId: state.mainMessageId || null,
      customId: state.customId,
      ...(finaleChaos ? { finaleChaos } : {}),
    };
    restoreHogwartsPodiumFromState(cfg.channelId, state, game);
    activeGames.set(cfg.channelId, game);
    if (isHogwartsPodiumWinMode(cfg, "findScroll", game) && isHogwartsPodiumRoundComplete(game, cfg.channelId)) {
      await closeHogwartsPodiumRoundIfComplete(client, cfg, game, cfg.channelId, channel, {
        beforeClose: async () => {
          await deleteFindMinigameRemoteMessage(channel.guild, state);
        },
      });
    }
    return;
  }
  if (state.type === "findBotVoice") {
    const voiceChannelId = String(state.targetChannelId || "").trim();
    const guildId = String(channel.guild?.id || cfg.guildId || "");
    if (voiceChannelId && channel.guild) {
      const voiceChannel =
        channel.guild.channels.cache.get(voiceChannelId) ||
        (await channel.guild.channels.fetch(voiceChannelId).catch(() => null));
      if (voiceChannel?.isVoiceBased?.()) {
        await joinFindBotVoiceChannel(channel.guild, voiceChannel).catch(() => null);
      }
    }
    const sessionId = state.customId || `minigame_findbotvoice:restored:${Date.now()}`;
    const timeout = scheduleFindMinigameTimeout(
      client,
      cfg,
      cfg.channelId,
      channel,
      sessionId,
      remainingMs,
      buildTimeoutFindBotVoiceEmbed,
    );
    const hintTimeout = voiceChannelId
      ? await scheduleMinuteHint(client, voiceChannelId, remainingMs, cfg.channelId)
      : null;
    activeGames.set(cfg.channelId, {
      type: "findBotVoice",
      guildId,
      rewardExp: Number(state.rewardExp || 0),
      startedAt: new Date(state.startedAt).getTime(),
      endsAt,
      timeout,
      hintTimeout,
      channelId: voiceChannelId,
      voiceChannelId,
      mainMessageId: state.mainMessageId || null,
      customId: sessionId,
    });
    return;
  }
}

function clearGameForChannel(channelId?, client = null, guildId = null) {
  const id = String(channelId || "");
  if (!id) return;
  const game = activeGames.get(id);
  if (game) {
    if (game.type === "findBotVoice") {
      void leaveFindBotVoiceChannel(guildId || game.guildId);
    }
    if (game.timeout) clearTimeout(game.timeout);
    if (game.hintTimeout) clearTimeout(game.hintTimeout);
    if (game.revealTimeout) clearTimeout(game.revealTimeout);
    if (Array.isArray(game.censorRevealTimeouts))
      game.censorRevealTimeouts.forEach((t?) => clearTimeout(t));
  }
  activeGames.delete(id);
  pendingGames.delete(id);
  startingChannels.delete(id);
  blockMinigameRehydrate(id);
  for (const [mainChId, g] of [...activeGames.entries()]) {
    const targetId = String(g?.channelId || g?.voiceChannelId || "");
    if ((g?.type === "findBot" || g?.type === "halloweenFindGhost" || g?.type === "findScroll" || g?.type === "findBotVoice") && targetId === id) {
      if (g.type === "findBotVoice") {
        void leaveFindBotVoiceChannel(guildId || g.guildId);
      }
      if (g.timeout) clearTimeout(g.timeout);
      if (g.hintTimeout) clearTimeout(g.hintTimeout);
      activeGames.delete(mainChId);
      pendingGames.delete(mainChId);
      startingChannels.delete(mainChId);
      const gid = guildId || g.guildId || null;
      if (gid)
        minigameStateDeleteOne({ guildId: String(gid), channelId: mainChId }).catch(() => {});
      break;
    }
  }
  if (guildId) {
    minigameStateDeleteOne({ guildId, channelId: id }).catch(() => { });
    minigameRotationDeleteOne({ guildId, channelId: id }).catch(() => { });
  } else {
    minigameStateDeleteMany({ channelId: id }).catch(() => { });
    minigameRotationDeleteMany({ channelId: id }).catch(() => { });
  }
}

async function isMinigameFloodExemptChannel(message?) {
  const cfg = getConfig(message?.client);
  if (!cfg || cfg.enabled === false) return false;
  const msgChId = String(message?.channelId || "");
  if (!msgChId) return false;
  const userId = String(message?.author?.id || "").trim();
  const guildId = String(message?.guild?.id || "").trim();
  const game = activeGames.get(msgChId);
  const houseChannelSvc = require("../Community/hogwartsHouseChannelMinigameService") as typeof import("../Community/hogwartsHouseChannelMinigameService");
  const isHouseCh = houseChannelSvc.isHogwartsHouseChannelId(msgChId);

  async function resolveAuthorHouseId() {
    if (!guildId || !userId) return "";
    const houseId = await resolveHogwartsSortedHouse(
      guildId,
      userId,
      hogwartsHousePointsDedupeKey(message.client),
      {
        client: message.client,
        member: message.member || null,
        cfg: resolveHogwartsEventConfig(message.client),
      },
    );
    return normalizeHogwartsHouseId(houseId) || "";
  }

  if (game && typeof game === "object" && !isStaleOrInvalidActiveGame(game)) {
            if (game.type === "hogwartsObservationTower") {
      const houseId = await resolveAuthorHouseId();
      if (!houseId) return false;
      const soloHouseId = String(game.soloHouseId || game.hogwartsHouseChannel?.soloHouseId || "").trim();
      if (soloHouseId && houseId !== soloHouseId) return false;
      return true;
    }

    const mainChId = String(cfg.channelId || "");
    if (mainChId && msgChId === mainChId) return true;
    if ((game.type === "findBot" || game.type === "halloweenFindGhost" || game.type === "findScroll") && String(game.channelId || "") === msgChId) {
      return true;
    }
    if (isHouseCh) {
      const houseId = await resolveAuthorHouseId();
      const channelHouse = normalizeHogwartsHouseId(houseChannelSvc.getHouseIdForChannel(msgChId));
      return Boolean(houseId && channelHouse && houseId === channelHouse);
    }
  }

      if (isHouseCh) {
    const houseId = await resolveAuthorHouseId();
    if (!houseId) return false;
    const channelHouse = normalizeHogwartsHouseId(houseChannelSvc.getHouseIdForChannel(msgChId));
    return Boolean(channelHouse && houseId === channelHouse);
  }

  return false;
}

async function handleFindBotVoiceWin(client?, guild?, member?, game?, cfg?) {
  const winCfg = { ...cfg, guildId: String(guild?.id || cfg?.guildId || "") };
  const channelId = String(winCfg.channelId || "");
  if (!channelId || !member?.user || member.user.bot) return false;
  clearNoParticipationDelay(channelId);
  if (game?.basilisk) {
    const { isBasiliskBlockedForUser } = require("../Community/hogwartsBasiliskService") as typeof import("../Community/hogwartsBasiliskService");
    const blocked = await isBasiliskBlockedForUser(client, guild.id, member.id, game);
    if (blocked) return false;
  }
  if (await isWrongHouseChannelMember(client, guild.id, member.id, game, member)) return false;
  const closed = await beginMinigameWinClose(client, winCfg, game);
  if (!closed) return false;
  try {
    const award = await awardMinigameWinToUser({
      client,
      guild,
      userId: member.id,
      cfg,
      game,
      rewardExp: game.rewardExp,
      channelId,
    });
    const winEmbed = buildWinEmbed(member.id, award.effectiveExp, award.nextTotal, award.details);
    const mainChannel = await getChannelCached(client, channelId);
    if (mainChannel) {
      await sendMinigameMessage(
        mainChannel,
        mergeHalloweenCandyDropIntoMessage(
          {
            content: `${member}`,
            embeds: [winEmbed],
          },
          award,
          member.id,
        ),
      ).catch(() => {});
    }
    if (award.member) {
      await handleExpReward(client, award.member, award.nextTotal);
    }
    return true;
  } catch (err) {
    warnMinigame(err);
    return false;
  } finally {
    await leaveFindBotVoiceChannel(guild.id);
    clearHogwartsPodiumChannel(channelId);
    await clearActiveGame(client, winCfg).catch(() => {});
    endMinigameWinClose(channelId);
  }
}

async function handleMinigameVoiceState(oldState?, newState?, client?) {
  const guild = newState?.guild || oldState?.guild;
  if (!guild) return false;

  const botId = String(client?.user?.id || "");
  const stateUserId = String(newState?.id || oldState?.id || "");
  const active = getActiveFindBotVoiceGame(client);

  if (active && botId && stateUserId === botId) {
    const nextChannelId = String(newState?.channelId || "").trim();
    if (nextChannelId) {
      syncFindBotVoiceTargetChannel(guild, active.game, nextChannelId);
    }
  }

  const member = newState?.member || oldState?.member;
  if (!member?.user || member.user.bot) return false;
  const joinedChannelId = String(newState?.channelId || "");
  const previousChannelId = String(oldState?.channelId || "");
  if (!joinedChannelId || joinedChannelId === previousChannelId) return false;

  if (!active) return false;
  if (String(guild.id) !== String(active.game.guildId || guild.id)) return false;

  const botVoiceId = resolveFindBotVoiceBotChannelId(guild, active.game);
  if (!botVoiceId || botVoiceId !== joinedChannelId) return false;

  const botMember = guild.members.me || guild.members.cache.get(client?.user?.id);
  if (!botMember?.voice?.channelId || String(botMember.voice.channelId) !== botVoiceId) return false;

  return handleFindBotVoiceWin(client, guild, member, active.game, active.cfg);
}

export = { startMinigameLoop, forceStartMinigame, restoreActiveGames, bootstrapMinigameScheduler, handleMinigameMessage, handleMinigameButton, handleMinigameReaction, handleMinigameVoiceState, shouldDeferTtsLeaveForFindBotVoiceMinigame, hasFindBotVoiceSession, clearGameForChannel, isMinigameFloodExemptChannel, isMinigameChannelBusy, isMainChatMinigameChannelBusy, hasAnyHouseChannelMinigameBusy, hasAnyActiveMinigame, spawnHouseChannelMinigame, getActiveGameForChannel, getConfig, pickObservationTowerTier, isMinigameSnipeSuppressed, pickSnipeEntryForChannel, redactSnipeContentForMinigame, suppressMinigameSnipe, shouldSkipStoringSnipe, startFinaleChaosFindScroll, tickFinaleChaosFindScrollHints, startHalloweenTrickOrTreatGameForAlternate, processHalloweenMinigamesShowcaseForce };