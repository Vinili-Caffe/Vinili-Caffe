/** Minigiochi: stato condiviso dei giochi in corso (mappe per canale, chiusura dei round, domande recenti). */
const { minigameStateDeleteOne } = require("../../../shared/botState/domainStatesStore") as typeof import("../../../shared/botState/domainStatesStore");
const { warnMinigame } = require("./minigameLog") as typeof import("./minigameLog");
const { getChannelCached, pickRandomItem } = require("./minigameUtils") as typeof import("./minigameUtils");
const { shuffleArray } = require("./minigameText") as typeof import("./minigameText");
const { getRecentQuestionKey } = require("./minigameActivity") as typeof import("./minigameActivity");

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
const standbyChannels = new Set();
const lastNoParticipationEndAtByChannel = new Map();
const lastPlayedGameTypesByChannel = new Map();
const lastPlayedAtByChannelAndType = new Map();
const startingChannels = new Set();
const recentQuestionKeysByChannel = new Map();

function recordNoParticipationIfNeeded(channelId?, game?) {
  if (!channelId || !game) return;
  if (game.hadParticipation) return;
  lastNoParticipationEndAtByChannel.set(channelId, Date.now());
}

function clearNoParticipationDelay(channelId?) {
  if (channelId) lastNoParticipationEndAtByChannel.delete(channelId);
}

async function clearActiveGame(client?, cfg?, gameHint = null) {
  const channelId = cfg?.channelId;
  if (!channelId) return;
  activeGames.delete(channelId);
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
      const { scheduleRepostRouletteAfterMinigame } = require("../../Community/services/repostRouletteService") as typeof import("../../Community/services/repostRouletteService");
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

async function beginMinigameWinClose(client?, cfg?, game = null) {
  const channelId = String(cfg?.channelId || "").trim();
  if (!channelId) return false;
  if (!tryClaimMinigameChannelClose(channelId)) return false;
  try {
    const live = activeGames.get(channelId) || game;
    markMinigameRoundClosed(live);
    clearMinigameRoundTimers(live);
    activeGames.delete(channelId);
    let guildId = String(cfg?.guildId || "").trim();
    if (!guildId) {
      const channel = await getChannelCached(client, channelId);
      guildId = String(channel?.guild?.id || "").trim();
    }
    if (guildId) {
      await clearActiveGame(client, { ...cfg, guildId, channelId }).catch((err?) => warnMinigame(err));
    }
    return true;
  } catch (err) {
    warnMinigame(err);
    endMinigameWinClose(channelId);
    return false;
  }
}

function endMinigameWinClose(channelId?) {
  channelWinClosing.delete(String(channelId || "").trim());
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

function tryClaimMinigameChannelClose(channelId?) {
  const chId = String(channelId || "").trim();
  if (!chId) return false;
  if (channelWinClosing.has(chId)) return false;
  channelWinClosing.add(chId);
  return true;
}

/** Avvio del gioco successivo: lo registra minigameService (così i moduli dei giochi non lo richiamano direttamente). */
const nextGameHook: { start: null | ((client: any) => Promise<unknown>) } = { start: null };

export = { nextGameHook, activeGames, channelWinClosing, treasureHuntReactLocks, blockMinigameRehydrate, isMinigameRehydrateBlocked, pendingGames, standbyChannels, lastNoParticipationEndAtByChannel, lastPlayedGameTypesByChannel, lastPlayedAtByChannelAndType, startingChannels, recordNoParticipationIfNeeded, clearNoParticipationDelay, clearActiveGame, clearMinigameRoundTimers, beginMinigameWinClose, endMinigameWinClose, isQuestionKeyRecent, pushQuestionKeyToRecent, pickQuestionAvoidRecent, tryClaimMinigameChannelClose };
