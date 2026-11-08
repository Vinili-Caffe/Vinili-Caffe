
const { minigameStateDeleteOne, minigameStateDeleteMany, minigameRotationDeleteOne, minigameRotationDeleteMany } = require("../../../shared/botState/domainStatesStore") as typeof import("../../../shared/botState/domainStatesStore");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { logMinigameSpawn, logMaybeStartSkip, warnMinigame, logMinigameDebug, is429Error } = require("./minigameLog") as typeof import("./minigameLog");
const { getMinigameRomeTime, getChannelSafe, getChannelCached, isWithinAllowedWindow } = require("./minigameUtils") as typeof import("./minigameUtils");
const { lastSentAtByChannel, getActivityWindowMs, getMinMessages, getRecentActivityStats, computeAdaptiveMinMessages, isReadyByActivity, assessFreshSpawnChatActivity, getActivityScopeKey, backfillRecentChatActivityFromHistory, isFailsafeDue } = require("./minigameActivity") as typeof import("./minigameActivity");
const { nextGameHook, activeGames, channelWinClosing, blockMinigameRehydrate, pendingGames, standbyChannels, lastNoParticipationEndAtByChannel, lastPlayedGameTypesByChannel, lastPlayedAtByChannelAndType, startingChannels, clearMinigameRoundTimers } = require("./minigameState") as typeof import("./minigameState");
const { clearRolePingSentThisStart } = require("./minigameRolePing") as typeof import("./minigameRolePing");
const { sendMinigameMessage } = require("./minigameDiscord") as typeof import("./minigameDiscord");
const { resolveMinigameGuildIdAsync, purgeExpiredMinigameDbState, leaveFindBotVoiceChannel } = require("./minigameRound") as typeof import("./minigameRound");
const { LAST_PLAYED_ROTATION_SIZE, getConfig, getAvailableGameTypes, saveRotationState, getNextGameType, requeueGameType } = require("./minigameConfig") as typeof import("./minigameConfig");
const { suppressMinigameSnipe, pickSnipeEntryForChannel, shouldSkipStoringSnipe, redactSnipeContentForMinigame } = require("./minigameSnipe") as typeof import("./minigameSnipe");
const { startTreasureHuntGame } = require("./minigameTreasureHunt") as typeof import("./minigameTreasureHunt");
const { startStandardMemoryEmojiGame } = require("./minigameMemory") as typeof import("./minigameMemory");
const { shouldDeferTtsLeaveForFindBotVoiceMinigame, startFindBotGame, startFindBotVoiceGame } = require("./minigameFindBot") as typeof import("./minigameFindBot");
const { startGuessNumberGame, startGuessWordGame, startGuessFlagGame, startGuessPlayerGame, startGuessSongGame, startGuessCapitalGame, startGuessRegionCapitalGame, startGuessReverseCapitalGame, startFastTypeGame, startGuessTeamGame, startGuessSingerGame, startGuessAlbumGame, startHangmanGame, startItalianGkGame, startDrivingQuizGame, startMathExpressionGame, startGuessYearGame, startCompleteVerseGame, startGuessEmojiGame, startQuoteFilmGame, startCompleteProverbGame, startSynonymAntonymGame, startGuessCityGame } = require("./minigameQuizGames") as typeof import("./minigameQuizGames");
const { restoreActiveGames } = require("./minigameRestoreCore") as typeof import("./minigameRestoreCore");
const { isStaleOrInvalidActiveGame, closeStaleActiveMinigameChannel, handleMinigameReaction, handleMinigameMessage, handleMinigameButton, isMinigameFloodExemptChannel, handleMinigameVoiceState } = require("./minigameHandlers") as typeof import("./minigameHandlers");
const { envFlagOn, shouldStartExternalWorkerLoop } = require("../../../shared/runtime/externalWorkerGate") as typeof import("../../../shared/runtime/externalWorkerGate");
const { getBotState, setBotState } = require("../../../shared/botState/botStateStore") as typeof import("../../../shared/botState/botStateStore");

const MINIGAME_SPAWN_REQUEST_KEY = "minigameSpawnRequest";
const spawnConsumerTimers = new WeakMap();
















const loopState = new WeakSet();
const loopIntervals = new WeakMap();
const expireSweepTimers = new WeakMap();
/* Slot fissi Europe/Rome: dalle 7:00 all’1:00 (overnight). */
const MINIGAME_FIRST_HOUR = 7;
const MINIGAME_LAST_HOUR = 1;
const MINIGAME_LAST_MINUTE = 0;
const MINIGAME_SLOT_MINUTES = [0, 15, 30, 45];
let lastMinigameSlotKey = null;
const MINIGAME_INTERVAL_SLOT_SLACK_MS = Math.max(0, Math.min(5 * 60 * 1000, Number(process.env.MINIGAME_INTERVAL_SLOT_SLACK_MS ?? 90_000)));
/* Halloween archiviato: tipi custom non avviati dal core. */
const HALLOWEEN_STARTER_GAME_TYPES = new Set([
  "halloweenFindGhost",
  "halloweenQuiz",
  "halloweenMissingEmoji",
  "halloweenCountBats",
  "halloweenTrickOrTreat",
]);

async function startHalloweenTrickOrTreatGameForAlternate(_client?, _cfg?) {
  return false;
}

async function processHalloweenMinigamesShowcaseForce(_client?) {}

function isMinigameFixedSlot(rome?, client = null) {
  const { hour, minute } = rome;
  if (!MINIGAME_SLOT_MINUTES.includes(minute)) return false;
  const startMin = MINIGAME_FIRST_HOUR * 60;
  const endMin = MINIGAME_LAST_HOUR * 60 + MINIGAME_LAST_MINUTE;
  const cur = hour * 60 + minute;
  /* Overnight (7:00 → 1:00): fuori dalle 01:00+ fino alle 07:00- */
  if (endMin < startMin) {
    return cur >= startMin || cur <= endMin;
  }
  if (cur < startMin || cur > endMin) return false;
  return true;
}

function minigameSlotKeyFromRome(rome?) {
  return `${rome.year}-${String(rome.month).padStart(2, "0")}-${String(rome.day).padStart(2, "0")}_${rome.hour}_${rome.minute}`;
}

function computeMsUntilNextRomeSlotStart(client?) {
  const now = Date.now();
  /* Gap massimo fuori finestra ~6h (01→07): cerca un po’ oltre. */
  const maxAhead = 8 * 60 * 60 * 1000;
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

function canStartByInterval(cfg?, client = null) {
  const intervalMs = Number(cfg?.intervalMs || 15 * 60 * 1000);
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

async function safeStartGameByType(client?, cfg?, gameType?) {
  try {
    if (HALLOWEEN_STARTER_GAME_TYPES.has(String(gameType || ""))) {
      return false;
    }
    if (gameType === "guessWord") return startGuessWordGame(client, cfg);
    if (gameType === "guessFlag") return startGuessFlagGame(client, cfg);
    if (gameType === "guessPlayer") return startGuessPlayerGame(client, cfg);
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
    if (gameType === "drivingQuiz") return startDrivingQuizGame(client, cfg);
    if (gameType === "mathExpression")
      return startMathExpressionGame(client, cfg);
    if (gameType === "findBot") return startFindBotGame(client, cfg);
    if (gameType === "findBotVoice") return startFindBotVoiceGame(client, cfg);
    if (gameType === "memoryEmoji") return startStandardMemoryEmojiGame(client, cfg);
    if (gameType === "guessNumber") return startGuessNumberGame(client, cfg);
    if (gameType === "guessYear") return startGuessYearGame(client, cfg);
    if (gameType === "completeVerse") return startCompleteVerseGame(client, cfg);
    if (gameType === "guessEmoji") return startGuessEmojiGame(client, cfg);
    if (gameType === "quoteFilm") return startQuoteFilmGame(client, cfg);
    if (gameType === "completeProverb") return startCompleteProverbGame(client, cfg);
    if (gameType === "synonymAntonym") return startSynonymAntonymGame(client, cfg);
    if (gameType === "guessCity") return startGuessCityGame(client, cfg);
    if (gameType === "treasureHunt") return startTreasureHuntGame(client, cfg);
    if (gameType === "starWarsQuiz" || gameType === "starWarsGuessPlanet") {
      /* Hard gate: mai sul main finché l'evento non è pubblico. */
      if (!cfg?.starWarsEventLive) return { started: false, skipToNext: true };
      if (gameType === "starWarsQuiz") {
        const { startStarWarsQuizGame } = require("../../../../archivio/starwars/src/Vinili/Services/Minigames/minigameStarWarsQuiz") as typeof import("../../../../archivio/starwars/src/Vinili/Services/Minigames/minigameStarWarsQuiz");
        return startStarWarsQuizGame(client, cfg);
      }
      const { startStarWarsGuessPlanetGame } = require("../../../../archivio/starwars/src/Vinili/Services/Minigames/minigameStarWarsGuessPlanet") as typeof import("../../../../archivio/starwars/src/Vinili/Services/Minigames/minigameStarWarsGuessPlanet");
      return startStarWarsGuessPlanetGame(client, cfg);
    }
    {
      const { isStarWarsSpecialDiscordType } = require("../../Minigames/utils/starWarsMinigameHooks") as typeof import("../../Minigames/utils/starWarsMinigameHooks");
      if (isStarWarsSpecialDiscordType(gameType)) {
        if (!cfg?.starWarsEventLive) return { started: false, skipToNext: true };
        const { startSpecialFromRotation } = require("../../../../archivio/starwars/src/Vinili/Services/Community/starWarsDiscordMinigamesService") as typeof import("../../../../archivio/starwars/src/Vinili/Services/Community/starWarsDiscordMinigamesService");
        const { markSent } = require("./minigameRoundStart") as typeof import("./minigameRoundStart");
        const out = await startSpecialFromRotation(client, gameType, { channelId: cfg?.channelId || null });
        if (out?.ok) {
          if (cfg?.channelId) markSent(cfg.channelId);
          return true;
        }
        return { started: false, skipToNext: true };
      }
    }
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

nextGameHook.start = (client) => maybeStartRandomGame(client, false);

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

    const now = new Date();
    if (!force) {
      const windowStart = cfg?.timeWindow?.start;
      const windowEnd = cfg?.timeWindow?.end;
      // Halloween: sempre; SW: finestra 06→02 (anche overnight)
      if (!cfg.halloweenEventLive && !isWithinAllowedWindow(now, windowStart, windowEnd)) {
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
      // Halloween / Star Wars: niente requisiti attività / fresh chat
      if (!cfg.halloweenEventLive && !cfg.starWarsEventLive) {
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

      const result = await safeStartGameByType(client, cfg, gameType);
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
        if (cfg.starWarsEventLive) {
          try {
            const { isStarWarsSpecialDiscordType } = require("../../Minigames/utils/starWarsMinigameHooks");
            if (!isStarWarsSpecialDiscordType(gameType)) {
              const { attachMalusToStartedGame } = require("../../../../archivio/starwars/src/Vinili/Services/Community/starWarsQuizMalusService");
              const attached = await attachMalusToStartedGame(client, gameType);
              if (attached && cfg.channelId && activeGames.has(cfg.channelId)) {
                const g = activeGames.get(cfg.channelId);
                g.swMalusAttached = true;
                g.malusId = g.malusId || attached.malusId;
                g.frozenUserIds = Array.isArray(attached.frozenUserIds) ? attached.frozenUserIds : g.frozenUserIds || [];
              }
            }
          } catch (_) {}
        }
        pendingGames.delete(cfg.channelId);
        await saveRotationState(client, cfg);
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

function getActiveGameForChannel(channelId?) {
  return activeGames.get(String(channelId || "").trim()) || null;
}

async function sweepExpiredMinigames(client?) {
  const cfg = getConfig(client);
  if (!cfg?.enabled) return;
  for (const [mapKey, game] of [...activeGames.entries()]) {
    if (!isStaleOrInvalidActiveGame(game)) continue;
    if (game?.type === "halloweenTrickOrTreat") {
      const channelId = String(mapKey || "").trim();
      const closeCfg = { ...cfg, channelId };
      if (!closeCfg.guildId && game?.guildId) closeCfg.guildId = String(game.guildId);
      clearMinigameRoundTimers(game);
      activeGames.delete(mapKey);
      await closeStaleActiveMinigameChannel(client, closeCfg, channelId, game).catch((err?) => warnMinigame(err));
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

async function requestMinigameSlotSpawn(slotKey?, channelId?) {
  const key = String(slotKey || "").trim();
  if (!key) return false;
  await setBotState(MINIGAME_SPAWN_REQUEST_KEY, {
    slotKey: key,
    channelId: String(channelId || "").trim() || null,
    requestedAt: Date.now(),
  });
  return true;
}

async function consumeMinigameSpawnRequests(client?) {
  const req = await getBotState(MINIGAME_SPAWN_REQUEST_KEY, null);
  const slotKey = String(req?.slotKey || "").trim();
  if (!slotKey) return false;
  if (slotKey === lastMinigameSlotKey) {
    await setBotState(MINIGAME_SPAWN_REQUEST_KEY, null);
    return false;
  }
  await setBotState(MINIGAME_SPAWN_REQUEST_KEY, null);
  const cfg = getConfig(client);
  try {
    if (!pendingGames.has(cfg?.channelId) && cfg?.channelId) {
      const type = await getNextGameType(client, cfg);
      if (type) pendingGames.set(cfg.channelId, { type, createdAt: Date.now() });
    }
    const started = await maybeStartRandomGame(client, false);
    if (started) lastMinigameSlotKey = slotKey;
    return Boolean(started);
  } catch (err) {
    global.logger?.error?.("[MINIGAMES] consume spawn failed", err?.message || err);
    return false;
  }
}

function startMinigameSpawnConsumerLoop(client?) {
  if (spawnConsumerTimers.has(client)) return;
  const tickMs = Math.max(5_000, Math.min(60_000, Number(process.env.VC_MINIGAME_SPAWN_CONSUMER_MS || 10_000) || 10_000));
  const tick = () => {
    void consumeMinigameSpawnRequests(client).catch((err?) => warnMinigame(err));
  };
  tick();
  const timer = setInterval(tick, tickMs);
  timer.unref?.();
  spawnConsumerTimers.set(client, timer);
}

/**
 * Worker-only: scrive richieste slot su BotState; il gateway le consuma e avvia il round in-process.
 */
function startMinigameSlotRequestLoop(client?) {
  if (!shouldStartExternalWorkerLoop("MINIGAMES")) return;
  if (envFlagOn("MINIGAMES_EXTERNAL") && !envFlagOn("MINIGAMES_WORKER")) return;
  if (loopState.has(client)) return;
  loopState.add(client);
  const cfg = getConfig(client);
  logMinigameSpawn("slot request loop started (worker)", {
    channelId: cfg?.channelId,
    enabled: Boolean(cfg?.enabled),
  });
  const schedule = () => {
    const ms = computeMsUntilNextRomeSlotStart(client);
    const timer = setTimeout(async () => {
      try {
        const cfgTick = getConfig(client);
        if (!cfgTick?.enabled) return;
        const rome = getMinigameRomeTime(new Date(), client);
        if (!isMinigameFixedSlot(rome, client)) return;
        const slotKey = minigameSlotKeyFromRome(rome);
        if (slotKey === lastMinigameSlotKey) return;
        await requestMinigameSlotSpawn(slotKey, cfgTick.channelId);
        lastMinigameSlotKey = slotKey;
        logMinigameDebug("slot request enqueued", { slotKey });
      } catch (err) {
        global.logger?.error?.("[MINIGAMES] slot request tick", err);
      }
      schedule();
    }, ms);
    timer.unref?.();
    loopIntervals.set(client, timer);
  };
  schedule();
}

async function bootstrapMinigameScheduler(client?) {
  const cfg = getConfig(client);
  const externalSplit = envFlagOn("MINIGAMES_EXTERNAL");
  const isWorker = envFlagOn("MINIGAMES_WORKER");

  /* Worker: solo timer slot → BotState; niente restore/expire (state live resta sul gateway). */
  if (externalSplit && isWorker) {
    startMinigameSlotRequestLoop(client);
    return;
  }

  try {
    await restoreActiveGames(client);
  } catch (err) {
    global.logger?.error?.("[MINIGAMES] restoreActiveGames failed:", err?.message || err);
  }

  let activityBackfill = { ok: false, count: 0 };
  try {
    activityBackfill = await backfillRecentChatActivityFromHistory(client, cfg);
  } catch (err) {
    global.logger?.warn?.("[MINIGAMES] activity backfill:", err?.message || err);
  }

  logMinigameSpawn("bootstrap scheduler", {
    channelId: cfg?.channelId,
    minigamesEnabled: Boolean(cfg?.enabled),
    activityBackfill,
    activeMainGame: cfg?.channelId ? activeGames.get(String(cfg.channelId))?.type || null : null,
    externalSplit,
  });

  try {
    startMinigameExpireSweep(client);
  } catch (err) {
    global.logger?.warn?.("[MINIGAMES] expire sweep failed to start:", err?.message || err);
  }

  if (externalSplit && !isWorker) {
    startMinigameSpawnConsumerLoop(client);
    return;
  }

  try {
    startMinigameLoop(client);
  } catch (err) {
    global.logger?.error?.("[MINIGAMES] startMinigameLoop failed:", err?.message || err);
  }
}

function scheduleMinigameLoopTick(client?) {
  const cfg = getConfig(client);
  const ms = computeMsUntilNextRomeSlotStart(client);
  logMinigameSpawn("scheduler: Rome :00/:15 slots", {
    channelId: cfg?.channelId,
    delayMs: ms,
    delayMin: Math.round(ms / 60_000),
  }, "warn");
  logMinigameDebug("schedule next minigame tick", { delayMs: ms });
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

function startMinigameLoop(client?) {
  if (loopState.has(client)) return;
  loopState.add(client);
  const cfg = getConfig(client);
  logMinigameSpawn("scheduler loop started", {
    channelId: cfg?.channelId,
    enabled: Boolean(cfg?.enabled),
  });
  scheduleMinigameLoopTick(client);
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
    if (((g?.type === "findBot" || g?.type === "halloweenFindGhost") || g?.type === "findBotVoice") && targetId === id) {
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

export = {
  startMinigameLoop,
  startMinigameSlotRequestLoop,
  bootstrapMinigameScheduler,
  handleMinigameMessage,
  handleMinigameButton,
  handleMinigameReaction,
  handleMinigameVoiceState,
  shouldDeferTtsLeaveForFindBotVoiceMinigame,
  clearGameForChannel,
  isMinigameFloodExemptChannel,
  isMinigameChannelBusy,
  isMainChatMinigameChannelBusy,
  getActiveGameForChannel,
  getConfig,
  pickSnipeEntryForChannel,
  redactSnipeContentForMinigame,
  suppressMinigameSnipe,
  shouldSkipStoringSnipe,
  startHalloweenTrickOrTreatGameForAlternate,
  processHalloweenMinigamesShowcaseForce,
};