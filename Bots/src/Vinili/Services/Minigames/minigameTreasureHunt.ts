/** Caccia al tesoro: avvio, reazioni, messaggi in arrivo, fine per tempo scaduto e ripristino. */
const { minigameStateFindOneLean } = require("../../Utils/BotState/domainStatesStore") as typeof import("../../Utils/BotState/domainStatesStore");
const { warnMinigame } = require("./minigameLog") as typeof import("./minigameLog");
const { buildTreasureHuntStartEmbed, buildTreasureHuntTimeoutEmbed } = require("./minigameEmbeds") as typeof import("./minigameEmbeds");
const { randomBetween } = require("./minigameSources") as typeof import("./minigameSources");
const { getChannelCached, sleepMs } = require("./minigameUtils") as typeof import("./minigameUtils");
const { normalizeRewardExp } = require("./minigameText") as typeof import("./minigameText");
const { activeGames, channelWinClosing, treasureHuntReactLocks, isMinigameRehydrateBlocked, recordNoParticipationIfNeeded, clearActiveGame, endMinigameWinClose, tryClaimMinigameChannelClose } = require("./minigameState") as typeof import("./minigameState");
const { sendMinigameRolePing } = require("./minigameRolePing") as typeof import("./minigameRolePing");
const { sendMinigameMessage } = require("./minigameDiscord") as typeof import("./minigameDiscord");
const { logTreasureHuntReactDebug, getTreasureHuntCfg, ensureGuildEmojisForTreasure, normalizeTreasureEmojiPair, findMessageReactionByToken, treasureReactErrorMeta, reactTreasureHuntEmojiWithFallbacks, treasureHuntDisplayTexts, pickTreasureHuntBucket, pickTreasureHuntEmojiPair, removeTreasureHuntReactions, serializeTreasureHuntTarget, getTreasureHuntMessageUrl } = require("./minigameTreasureEmoji") as typeof import("./minigameTreasureEmoji");
const { markSent, saveActiveGame, parseStateTarget, closeExpiredMinigameState } = require("./minigameRound") as typeof import("./minigameRound");

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
  return mountTreasureHuntGame(client, { ...cfg, guildId }, channel, state, remainingMs);
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
  if (live._claiming) return false;
  if (live.winnerMessageId) return false;
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

async function cleanupTreasureHuntReactions(channel?, game?) {
  if (!game?.candidateIds?.length) return;
  await removeTreasureHuntReactions(channel, game.candidateIds, game.decoy, game.winner).catch(() => {});
}

async function finishTreasureHuntByTimeout(client?, cfg?, channel?, game?) {
  if (!channel?.send) return;
  const channelId = String(cfg?.channelId || "");
  if (!tryClaimMinigameChannelClose(channelId)) return;
  try {
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
  if (!pair?.decoy || !pair?.winner) return false;
  const startedAt = Date.now();
  if (cfg.roleId) {
    await sendMinigameRolePing(channel, cfg);
  }
  const timeout = setTimeout(async () => {
    const current = activeGames.get(channelId);
    if (!current || current.type !== "treasureHunt") return;
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
  markSent(channelId);
  return true;
}

export = { mountTreasureHuntGame, ensureTreasureHuntGame, handleTreasureHuntIncomingMessage, cleanupTreasureHuntReactions, startTreasureHuntGame };
