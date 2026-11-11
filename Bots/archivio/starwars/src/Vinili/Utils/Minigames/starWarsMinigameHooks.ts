/**
 * Hook minigame Star Wars — pool esclusivo in chat durante l'evento,
 * banche tema, finestre orarie spawn.
 */
"use strict";

const __path = require("path") as typeof import("path");
const __eventCoreVinili = (rel: string) => __path.join(__path.resolve(__dirname, "../../../../../../src/Vinili"), rel);

const { isStarWarsEventLive, isStarWarsPublicWindowOpen, isStarWarsForceLiveOnTestGuild, getTestGuildIdSafe, resolveStarWarsEventConfig } = require("../Eventi/starWarsEventConfig") as typeof import("../Eventi/starWarsEventConfig");
const { FEATURES, resolveFeatureStateNow } = require("../Eventi/starWarsEventCalendar") as typeof import("../Eventi/starWarsEventCalendar");
const { getStarWarsQuizBank } = require("../Eventi/starWarsQuizBank") as typeof import("../Eventi/starWarsQuizBank");
const { getStarWarsHangmanWords, getStarWarsMemoryEmojiBank, getStarWarsFastTypePhrases, getStarWarsCompleteQuoteBank, getStarWarsPlanetsBank, maskPlanetHint } = require("../Eventi/starWarsMinigameBanks") as typeof import("../Eventi/starWarsMinigameBanks");

/** Tipi in rotazione esclusiva SW (quiz + minigames a tema). */
const STAR_WARS_EXCLUSIVE_GAME_TYPES = Object.freeze([
  "starWarsQuiz",
  "memoryEmoji",
  "findBot",
  "findBotVoice",
  "hangman",
  "guessNumber",
  "fastType",
  "starWarsGuessPlanet",
  "completeVerse",
]);

const STAR_WARS_CUSTOM_GAME_TYPES = Object.freeze(["starWarsQuiz", "starWarsGuessPlanet"]);

/**
 * Minigame Discord “speciali”: in coda 15′ insieme agli altri quando il calendario li apre.
 * Non contano per la cassa quiz / niente malus.
 */
const STAR_WARS_SPECIAL_DISCORD_TYPES = Object.freeze([
  "podrace",
  "cacciatore",
  "scova",
  "ordine66",
  "attacca_base",
  "conquista",
  "pg",
  "reliquie",
  "convoglio",
  "ewok",
  "olocron",
]);

const SPECIAL_TYPE_FEATURE = Object.freeze({
  podrace: FEATURES.MINIGAME_PODRACE,
  cacciatore: FEATURES.MINIGAME_CACCIATORE,
  scova: FEATURES.MINIGAME_SCOVA,
  ordine66: FEATURES.MINIGAME_ORDINE66,
  attacca_base: FEATURES.MINIGAME_ATTACCA_BASE,
  conquista: FEATURES.GAME_CONQUISTA,
  pg: FEATURES.GAME_COLLEZIONA_PG,
  reliquie: FEATURES.GAME_RELIQUIE,
  convoglio: FEATURES.MINIGAME_PROTEGGI,
  ewok: FEATURES.MINIGAME_CACCIA_EWOK,
  olocron: FEATURES.GAME_OLOCRON,
});

/** Minigames chat: 06:00 → 02:00 (overnight). */
const SW_MINIGAME_WINDOW = Object.freeze({
  start: { hour: 6, minute: 0 },
  end: { hour: 2, minute: 0 },
});

/** Malus: 08:00 → 00:00. */
const SW_MALUS_WINDOW = Object.freeze({
  start: { hour: 8, minute: 0 },
  end: { hour: 24, minute: 0 },
});

const SW_MINIGAME_INTERVAL_MS = 15 * 60 * 1000;
const SW_MINIGAME_DURATION_MS = 3 * 60 * 1000;
const SW_MALUS_INTERVAL_MS = 45 * 60 * 1000;

/** Art CDN per embed classici SW che altrimenti restano senza immagine. */
const SW_CLASSIC_ART_CDN = "https://cdn.viniliecaffe.it/images/starwars";
const SW_CLASSIC_ART_V = "20261111c3";
const STAR_WARS_CLASSIC_EMBED_ART = Object.freeze({
  findBotNear: `${SW_CLASSIC_ART_CDN}/sw-findbot-near.jpg?v=${SW_CLASSIC_ART_V}`,
  memoryRecall: `${SW_CLASSIC_ART_CDN}/sw-memory-recall.jpg?v=${SW_CLASSIC_ART_V}`,
  pgEscaped: `${SW_CLASSIC_ART_CDN}/sw-pg-escaped.jpg?v=${SW_CLASSIC_ART_V}`,
  reliquiaPerduta: `${SW_CLASSIC_ART_CDN}/sw-reliquia-perduta.jpg?v=${SW_CLASSIC_ART_V}`,
  /** vittoria pool classici SW — blu (Repubblica / light) */
  classicWin: `${SW_CLASSIC_ART_CDN}/sw-classic-win-repubblica.jpg?v=${SW_CLASSIC_ART_V}`,
  classicWinRepubblica: `${SW_CLASSIC_ART_CDN}/sw-classic-win-repubblica.jpg?v=${SW_CLASSIC_ART_V}`,
  /** vittoria pool classici SW — rosso (Separatisti / dark) */
  classicWinSeparatisti: `${SW_CLASSIC_ART_CDN}/sw-classic-win-separatisti.jpg?v=${SW_CLASSIC_ART_V}`,
  /** timeout / sconfitta pool classici SW */
  classicLose: `${SW_CLASSIC_ART_CDN}/sw-classic-lose.jpg?v=${SW_CLASSIC_ART_V}`,
});

const CLASSIC_WIN_DARK_FACTIONS = new Set(["separatisti", "impero", "nuovo_ordine"]);

function classicWinSideFromFaction(factionId?) {
  const f = String(factionId || "").trim().toLowerCase();
  return CLASSIC_WIN_DARK_FACTIONS.has(f) ? "separatisti" : "repubblica";
}

async function resolveWinnerFactionIdForClassicWin(cfg?, winnerId?) {
  const uid = String(winnerId || cfg?.winnerId || "").trim();
  if (!uid) return "";
  try {
    const { getStarWarsWallet } = require("../../Services/Community/starWarsEventWalletService") as typeof import("../../Services/Community/starWarsEventWalletService");
    const ids = [
      ...new Set(
        [
          resolveMinigameGuildIdForStarWars(cfg?.client || null, cfg?.guildId || null),
          getMainGuildIdSafe(),
          String(cfg?.guildId || "").trim(),
        ].filter(Boolean),
      ),
    ];
    for (const gid of ids) {
      const wallet = await getStarWarsWallet(gid, uid);
      const fid = String(wallet?.factionId || "").trim().toLowerCase();
      if (fid) return fid;
    }
  } catch (_) {}
  return "";
}

async function resolveStarWarsClassicWinImageUrl(cfg?, winnerId?) {
  if (!shouldUseStarWarsTheme(cfg)) return null;
  const factionId = await resolveWinnerFactionIdForClassicWin(cfg, winnerId);
  if (classicWinSideFromFaction(factionId) === "separatisti") {
    return STAR_WARS_CLASSIC_EMBED_ART.classicWinSeparatisti || null;
  }
  return STAR_WARS_CLASSIC_EMBED_ART.classicWinRepubblica || STAR_WARS_CLASSIC_EMBED_ART.classicWin || null;
}

function resolveStarWarsClassicLoseImageUrl(cfg?) {
  if (!shouldUseStarWarsTheme(cfg)) return null;
  return STAR_WARS_CLASSIC_EMBED_ART.classicLose || null;
}

function getMainGuildIdSafe() {
  try {
    const IDs = require(__eventCoreVinili("Config/ids"));
    return String(IDs.guilds?.main || "").trim();
  } catch (_) {
    return "";
  }
}

/**
 * Guild della chat minigame effettiva.
 * IMPORTANTE: NON rimappare al test quando force-live — altrimenti il main
 * eredita starWarsEventLive=true e spawna quiz SW su IDs.channels.chat (main).
 */
function resolveMinigameGuildIdForStarWars(client?, guildId = null) {
  const explicit = String(guildId || "").trim();
  if (explicit) return explicit;
  return getMainGuildIdSafe() || getTestGuildIdSafe() || null;
}

/**
 * Live per rotazione chat minigame:
 * - guild test: solo con testGuildForceLive
 * - guild main: SOLO con finestra pubblica aperta (1 dic 12:00+)
 * Mai “live sul main” solo perché lo staging test è acceso.
 */
function isStarWarsEventLiveForMinigames(client?, nowMs = Date.now(), guildId = null) {
  const now = new Date(nowMs);
  const gid = resolveMinigameGuildIdForStarWars(client, guildId);
  if (!gid) return false;
  const testId = getTestGuildIdSafe();
  const mainId = getMainGuildIdSafe();
  if (testId && gid === testId) return isStarWarsForceLiveOnTestGuild(client, gid);
  if (mainId && gid === mainId) {
    /* Hard-gate: niente pool SW sulla chat main prima del pubblico. */
    if (!isStarWarsPublicWindowOpen(client, now)) return false;
    return isStarWarsEventLive(client, now, gid);
  }
  return false;
}

/** Channel chat dove spawnare in staging (test) vs produzione (main). */
function resolveStarWarsMinigameChannelId(client?) {
  try {
    const IDs = require(__eventCoreVinili("Config/ids"));
    const baseChat = String(IDs.channels?.chat || "").trim();
    const cfg = resolveStarWarsEventConfig(client);
    const testId = getTestGuildIdSafe();
    if (!(cfg?.testGuildForceLive && testId)) return baseChat;
    const { remapChannelIdForGuild } = require(__eventCoreVinili(
      "Config/testGuildMirrorRemap",
    )) as { remapChannelIdForGuild: (guildId: string, channelId: string) => string };
    return remapChannelIdForGuild(testId, baseChat) || baseChat;
  } catch (_) {
    try {
      const IDs = require(__eventCoreVinili("Config/ids"));
      return String(IDs.channels?.chat || "").trim();
    } catch {
      return "";
    }
  }
}

function shouldUseStarWarsTheme(cfg?) {
  return Boolean(cfg?.starWarsEventLive);
}

function isStarWarsQuizMinigameType(type?) {
  return String(type || "") === "starWarsQuiz";
}

function isStarWarsCustomMinigameType(type?) {
  return STAR_WARS_CUSTOM_GAME_TYPES.includes(String(type || ""));
}

function isStarWarsSpecialDiscordType(type?) {
  return STAR_WARS_SPECIAL_DISCORD_TYPES.includes(String(type || "").trim());
}

/** Vittorie dei minigame in pool SW: stessi premi quiz (crediti + cassa ogni 10). Speciali Discord esclusi. */
function countsTowardStarWarsEventWinRewards(type?, cfg?) {
  if (!shouldUseStarWarsTheme(cfg)) return false;
  const t = String(type || "").trim();
  if (!t || isStarWarsSpecialDiscordType(t)) return false;
  return STAR_WARS_EXCLUSIVE_GAME_TYPES.includes(t);
}

function shouldIncludeStarWarsQuiz(cfg?) {
  if (cfg?.starWarsQuiz === false) return false;
  if (!getStarWarsQuizBank().length) return false;
  if (cfg?.starWarsEventLive) return true;
  return false;
}

function getStarWarsSpecialAvailableTypes(now = new Date()) {
  const active = new Set(resolveFeatureStateNow(now).features || []);
  const out = [];
  for (const type of STAR_WARS_SPECIAL_DISCORD_TYPES) {
    const feature = SPECIAL_TYPE_FEATURE[type];
    if (feature && active.has(feature)) out.push(type);
  }
  return out;
}

function getStarWarsExclusiveAvailableTypes(cfg?) {
  if (!shouldUseStarWarsTheme(cfg)) return [];
  const types = [];
  for (const t of STAR_WARS_EXCLUSIVE_GAME_TYPES) {
    if (t === "starWarsQuiz" && !shouldIncludeStarWarsQuiz(cfg)) continue;
    if (t === "starWarsGuessPlanet" && cfg?.starWarsGuessPlanet === false) continue;
    if (t === "starWarsGuessPlanet" && !getStarWarsPlanetsBank(true).length) continue;
    if (t === "memoryEmoji" && !getStarWarsMemoryEmojiBank().length) continue;
    if (t === "hangman" && !getStarWarsHangmanWords().length) continue;
    if (t === "fastType" && !getStarWarsFastTypePhrases().length) continue;
    if (t === "completeVerse" && !getStarWarsCompleteQuoteBank().length) continue;
    if (t === "findBot" && cfg?.findBot === false) continue;
    if (t === "findBotVoice" && cfg?.findBotVoice === false) continue;
    if (t === "guessNumber" && cfg?.guessNumber === false) continue;
    types.push(t);
  }
  for (const t of getStarWarsSpecialAvailableTypes()) {
    if (!types.includes(t)) types.push(t);
  }
  return types;
}

/** Extra types quando SW non è esclusivo (legacy: solo quiz in coda mista). */
function getStarWarsExtraAvailableTypes(cfg?) {
  if (shouldUseStarWarsTheme(cfg)) return [];
  if (!shouldIncludeStarWarsQuiz(cfg)) return [];
  return ["starWarsQuiz"];
}

function getRomeParts(date?) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date instanceof Date ? date : new Date(date || Date.now()));
  const map: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return {
    hour: Number(map.hour || 0),
    minute: Number(map.minute || 0),
  };
}

/** Supporta finestre overnight (es. 6→2). end hour 24 = mezzanotte. */
function isWithinRomeWindow(now?, start?, end?) {
  const startMinutes = (Number(start?.hour) || 0) * 60 + (Number(start?.minute) || 0);
  let endHour = Number(end?.hour);
  if (!Number.isFinite(endHour)) endHour = 24;
  const endMinutes = endHour * 60 + (Number(end?.minute) || 0);
  const parts = getRomeParts(now);
  const current = parts.hour * 60 + parts.minute;
  if (endMinutes <= startMinutes) {
    // overnight: es. 06:00 → 02:00
    return current >= startMinutes || current < endMinutes;
  }
  return current >= startMinutes && current < endMinutes;
}

function isWithinStarWarsMinigameHours(nowMs = Date.now()) {
  return isWithinRomeWindow(new Date(nowMs), SW_MINIGAME_WINDOW.start, SW_MINIGAME_WINDOW.end);
}

function isWithinStarWarsMalusHours(nowMs = Date.now()) {
  return isWithinRomeWindow(new Date(nowMs), SW_MALUS_WINDOW.start, SW_MALUS_WINDOW.end);
}

export = {
  STAR_WARS_EXCLUSIVE_GAME_TYPES,
  STAR_WARS_CUSTOM_GAME_TYPES,
  STAR_WARS_SPECIAL_DISCORD_TYPES,
  SPECIAL_TYPE_FEATURE,
  STAR_WARS_CLASSIC_EMBED_ART,
  resolveStarWarsClassicWinImageUrl,
  resolveStarWarsClassicLoseImageUrl,
  SW_MINIGAME_WINDOW,
  SW_MALUS_WINDOW,
  SW_MINIGAME_INTERVAL_MS,
  SW_MINIGAME_DURATION_MS,
  SW_MALUS_INTERVAL_MS,
  isStarWarsEventLiveForMinigames,
  shouldUseStarWarsTheme,
  resolveStarWarsMinigameChannelId,
  resolveMinigameGuildIdForStarWars,
  isStarWarsQuizMinigameType,
  isStarWarsCustomMinigameType,
  isStarWarsSpecialDiscordType,
  countsTowardStarWarsEventWinRewards,
  shouldIncludeStarWarsQuiz,
  getStarWarsSpecialAvailableTypes,
  getStarWarsExclusiveAvailableTypes,
  getStarWarsExtraAvailableTypes,
  getStarWarsQuizBank,
  getStarWarsHangmanWords,
  getStarWarsMemoryEmojiBank,
  getStarWarsFastTypePhrases,
  getStarWarsCompleteQuoteBank,
  getStarWarsPlanetsBank,
  maskPlanetHint,
  isWithinRomeWindow,
  isWithinStarWarsMinigameHours,
  isWithinStarWarsMalusHours,
};
