/** Minigiochi: configurazione letta dal bot, giochi disponibili e rotazione giornaliera dei tipi. */
const { minigameRotationFindOneLean, minigameRotationFindOneAndUpdate } = require("../../../shared/botState/domainStatesStore") as typeof import("../../../shared/botState/domainStatesStore");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { getMemoryEmojiBank } = require("../../Minigames/data/minigameBanks") as typeof import("../../Minigames/data/minigameBanks");
const { isHalloweenEventLiveForMinigames, isHalloweenExclusiveMinigamesEnabled, shouldUseHalloweenTheme, getHalloweenExclusiveAvailableTypes } = require("../../Minigames/utils/halloweenMinigameHooks") as typeof import("../../Minigames/utils/halloweenMinigameHooks");
const {
  isStarWarsEventLiveForMinigames,
  shouldUseStarWarsTheme,
  getStarWarsExtraAvailableTypes,
  getStarWarsExclusiveAvailableTypes,
  SW_MINIGAME_WINDOW,
  SW_MINIGAME_INTERVAL_MS,
  SW_MINIGAME_DURATION_MS,
} = require("../../Minigames/utils/starWarsMinigameHooks") as typeof import("../../Minigames/utils/starWarsMinigameHooks");
const { mergeFindBotVoiceExcludedChannelIds } = require("../../Minigames/utils/findBotVoiceChannelEligibility") as typeof import("../../Minigames/utils/findBotVoiceChannelEligibility");
const { randomBetween } = require("./minigameSources") as typeof import("./minigameSources");
const { getChannelCached, getRomeDateKey } = require("./minigameUtils") as typeof import("./minigameUtils");
const { shuffleArray } = require("./minigameText") as typeof import("./minigameText");
const { lastSentAtByChannel } = require("./minigameActivity") as typeof import("./minigameActivity");
const { lastPlayedGameTypesByChannel, lastPlayedAtByChannelAndType } = require("./minigameState") as typeof import("./minigameState");

let rotationDate = null;
let rotationQueue = [];
const LAST_PLAYED_ROTATION_SIZE = 3;
const GAME_TYPE_COOLDOWN_MS = 30 * 60 * 1000;

function applyDashboardMinigameScoring(base?) {
  if (!base || typeof base !== "object") return base;
  try {
    const LVL = require("../../../MultiGuild/services/levelsRuntime") as typeof import("../../../MultiGuild/services/levelsRuntime");
    const scoring = LVL.getMinigameScoringSync(String(IDs.guilds?.main || ""));
    if (!scoring) return base;
    const out: any = {
      ...base,
      fastGuess: { ...(base.fastGuess || {}), ...(scoring.fastGuess || {}) },
      streak: { ...(base.streak || {}), ...(scoring.streak || {}) },
    };
    for (const row of Array.isArray(scoring.rewardExpByType) ? scoring.rewardExpByType : []) {
      const type = String(row?.type || "").trim();
      if (!type) continue;
      /* spegne il tipo nella rotazione (getAvailableGameTypes usa !== false) */
      if (row?.enabled === false) {
        out[type] = false;
        continue;
      }
      const rewardExp = Math.max(1, Math.floor(Number(row.rewardExp) || 0));
      const durationMs = Math.max(15_000, Math.min(1_800_000, Math.floor(Number(row.durationMs) || 0) || 180_000));
      const prev = out[type] && typeof out[type] === "object" ? out[type] : {};
      out[type] = { ...prev, rewardExp, durationMs };
      /* Caccia al tesoro: scala i bucket rispetto al valore medio di default (150). */
      if (type === "treasureHunt" && Array.isArray(prev.buckets) && prev.buckets.length) {
        const mid = 150;
        const factor = rewardExp / mid;
        out[type] = {
          ...out[type],
          buckets: prev.buckets.map((b: any) => {
            if (!b || typeof b !== "object") return b;
            const baseExp = Math.max(1, Math.floor(Number(b.rewardExp) || mid));
            return { ...b, rewardExp: Math.max(1, Math.round(baseExp * factor)) };
          }),
        };
      }
    }
    return out;
  } catch {
    return base;
  }
}

function getConfig(client?) {
  const cfg = client?.config?.minigames || null;
  if (!cfg) return null;
  /*
   * Chat minigame = sempre canale main.
   * Tema/pool SW sul main SOLO con finestra pubblica (1 dic 12:00+, publicEnabled).
   * testGuildForceLive NON attiva mai SW sulla chat main: lo staging resta sul server test
   * (spawn staff / mainGuildId remappato nei minigame Discord speciali).
   */
  const { isStarWarsPublicWindowOpen } = require("../../../../archivio/starwars/src/Vinili/Utils/Eventi/starWarsEventConfig") as typeof import("../../../../archivio/starwars/src/Vinili/Utils/Eventi/starWarsEventConfig");
  const starWarsEventLive =
    Boolean(isStarWarsPublicWindowOpen(client)) &&
    isStarWarsEventLiveForMinigames(client, Date.now(), IDs.guilds?.main || null);
  const base = applyDashboardMinigameScoring({
    ...cfg,
    halloweenEventLive: isHalloweenEventLiveForMinigames(client),
    halloweenExclusiveDuringEvent: isHalloweenExclusiveMinigamesEnabled(client, cfg),
    starWarsEventLive,
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
  });
  if (!starWarsEventLive) return base;
  // Durante SW: 15 min, 3 min durata, finestra 06→02; EXP da dashboard (overlay) se presente
  const swRewardExp = base?.starWarsQuiz?.rewardExp ?? cfg?.starWarsQuiz?.rewardExp ?? 50;
  const swPlanetExp = base?.starWarsGuessPlanet?.rewardExp ?? cfg?.starWarsGuessPlanet?.rewardExp ?? swRewardExp;
  const swQuizDuration = { durationMs: SW_MINIGAME_DURATION_MS, rewardExp: swRewardExp };
  const swPlanetDuration = { durationMs: SW_MINIGAME_DURATION_MS, rewardExp: swPlanetExp };
  const swClassicDuration = { durationMs: SW_MINIGAME_DURATION_MS };
  return {
    ...base,
    intervalMs: SW_MINIGAME_INTERVAL_MS,
    noParticipationIntervalMs: SW_MINIGAME_INTERVAL_MS,
    timeWindow: {
      start: { ...SW_MINIGAME_WINDOW.start },
      end: { ...SW_MINIGAME_WINDOW.end },
    },
    starWarsQuiz: { ...(cfg.starWarsQuiz || {}), ...swQuizDuration, rewardCredits: cfg?.starWarsQuiz?.rewardCredits ?? 5000, rewardExp: swRewardExp },
    starWarsGuessPlanet: { ...(cfg.starWarsGuessPlanet || {}), ...swPlanetDuration },
    guessNumber: { ...(base.guessNumber || cfg.guessNumber || {}), ...swClassicDuration },
    hangman: { ...(base.hangman || cfg.hangman || {}), ...swClassicDuration },
    fastType: { ...(base.fastType || cfg.fastType || {}), ...swClassicDuration, useDefaultApi: false },
    memoryEmoji: { ...(base.memoryEmoji || cfg.memoryEmoji || {}), ...swClassicDuration },
    completeVerse: { ...(base.completeVerse || cfg.completeVerse || {}), ...swClassicDuration },
    findBot: { ...base.findBot, ...(cfg.findBot || {}), ...swClassicDuration },
    findBotVoice: { ...base.findBotVoice, ...(cfg.findBotVoice || {}), ...swClassicDuration },
  };
}

function getGameTypeRotationWeight(cfg?, type?) {
  return 1;
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
  if (cfg?.starWarsEventLive) return 0;
  return GAME_TYPE_COOLDOWN_MS;
}

function getAvailableGameTypes(cfg?) {
  if (shouldUseHalloweenTheme(cfg)) {
    return getHalloweenExclusiveAvailableTypes(cfg);
  }
  if (shouldUseStarWarsTheme(cfg)) {
    return getStarWarsExclusiveAvailableTypes(cfg);
  }
  const types = [];
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
  if (cfg?.drivingQuiz !== false) types.push("drivingQuiz");
  if (cfg?.mathExpression !== false) types.push("mathExpression");
  if (cfg?.findBot !== false) types.push("findBot");
  if (cfg?.findBotVoice !== false) types.push("findBotVoice");
  if (cfg?.memoryEmoji !== false && getMemoryEmojiBank().length) types.push("memoryEmoji");
  if (cfg?.guessYear !== false) types.push("guessYear");
  if (cfg?.completeVerse !== false) types.push("completeVerse");
  if (cfg?.guessEmoji !== false) types.push("guessEmoji");
  if (cfg?.quoteFilm !== false) types.push("quoteFilm");
  if (cfg?.completeProverb !== false) types.push("completeProverb");
  if (cfg?.synonymAntonym !== false) types.push("synonymAntonym");
  if (cfg?.guessCity !== false) types.push("guessCity");
  if (cfg?.treasureHunt !== false) types.push("treasureHunt");
  for (const t of getStarWarsExtraAvailableTypes(cfg)) {
    if (!types.includes(t)) types.push(t);
  }
  return types;
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
  await (minigameRotationFindOneAndUpdate as any)(
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
  await (minigameRotationFindOneAndUpdate as any)(
    { guildId, channelId },
    { $set: { dateKey, queue: rotationQueue, lastSentAt: lastSentAtByChannel.get(channelId) || 0 } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => { });
}

async function getNextGameType(client?, cfg?) {
  const available = getAvailableGameTypes(cfg);
  if (available.length === 0) return null;
  const guildId = cfg?.guildId ?? (cfg?.channelId ? (await getChannelCached(client, cfg.channelId))?.guild?.id ?? null : null);
  await loadRotationState(client, cfg, guildId);
  const todayKey = getRomeDateKey(new Date());
  const queueSet = new Set(rotationQueue);
  const queueMatchesConfig = available.length === queueSet.size && available.every((t?) => queueSet.has(t));
  if (rotationDate !== todayKey || rotationQueue.length === 0 || !queueMatchesConfig) {
    rotationDate = todayKey;
    rotationQueue = shuffleArray(expandGameTypesByRotationWeight(cfg, available.slice()));
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
  if (rotationQueue.length < halfAvailable && available.length > 0) {
    rotationQueue = shuffleArray(expandGameTypesByRotationWeight(cfg, available.slice()));
  }
  let next = rotationQueue.shift() || available[0];
  while ((excludeSet.has(next) || isOnCooldown(next)) && (rotationQueue.length > 0 || available.length > 1)) {
    if (rotationQueue.length > 0) {
      rotationQueue.push(next);
      next = rotationQueue.shift();
    } else {
      const others = available.filter((t?) => !excludeSet.has(t) && !isOnCooldown(t));
      next = others.length ? others[randomBetween(0, others.length - 1)] : available[0];
      break;
    }
  }
  if (next) {
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

export = { LAST_PLAYED_ROTATION_SIZE, getConfig, getAvailableGameTypes, loadRotationState, saveRotationState, getNextGameType, requeueGameType };
