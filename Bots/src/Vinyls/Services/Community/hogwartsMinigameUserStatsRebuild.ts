const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { resolveHogwartsEventConfig } = require("../../Utils/Web/hogwartsSortingConfig") as typeof import("../../Utils/Web/hogwartsSortingConfig");
const { housePointPeriodKey, dateOnlyMs } = require("../../Utils/Web/hogwartsHousePointPeriods") as typeof import("../../Utils/Web/hogwartsHousePointPeriods");
const { getIsoWeekKey } = require("../Community/expService") as typeof import("./expService");
const { loadSortedHouseByUserId } = require("./weeklyActivityWinnersService") as typeof import("./weeklyActivityWinnersService");
const {
  buildRoundsFromMessages,
  parsePodiumSummaryLegacy,
  parseSingleWinnerLegacy,
  parseUnsortedCloseLegacy,
  collectPodiumWinnersFromReactions,
  roundNeedsReactionScan,
  isPodiumSummaryMessage,
  isSingleWinnerMessage,
  isUnsortedCloseMessage,
  parseUserId,
} = require("./hogwartsMinigameHousePointsBackfillService") as typeof import("./hogwartsMinigameHousePointsBackfillService");

const WIN_TITLE_RE = /Un utente ha vinto|Posto in classifica Hogwarts|Minigame Hogwarts concluso|Podio Minigame|Classifica Minigame/i;

function romeEndOfDayMs(ymd?) {
  const start = dateOnlyMs(String(ymd || "").trim(), false);
  if (!Number.isFinite(start)) return null;
  return start + 24 * 60 * 60 * 1000 - 1;
}

function parseEffectiveExpFromText(text?, userId?) {
  const uid = String(userId || "").trim();
  const src = String(text || "");
  if (!uid || !src.includes(`<@${uid}>`)) return 0;
  const patterns = [
    /guadagnato\s+\*\*(\d+)\s*exp\*\*/i,
    /—\s+\*\*(\d+)\s*exp\*\*/i,
    /·\s+\*\*(\d+)\s*exp\*\*/i,
    /\*\*(\d+)\s*exp\*\*/i,
  ];
  for (const re of patterns) {
    const m = src.match(re);
    if (m) return Math.max(0, Math.floor(Number(m[1]) || 0));
  }
  return 0;
}

function parseBaseRewardFromRound(round?) {
  const embed = round?.startMessage?.embeds?.[0];
  const desc = String(embed?.description || embed?.data?.description || "");
  const m = desc.match(/ottenere\s+\*\*(\d+)\s*exp\*\*/i);
  if (m) return Math.max(0, Math.floor(Number(m[1]) || 0));
  return 100;
}

function parseStreakFromText(text?, userId?) {
  const uid = String(userId || "").trim();
  const src = String(text || "");
  if (!uid || !src.includes(`<@${uid}>`)) return { streak: 0, best: 0 };
  const streakM = src.match(/Serie di vittorie:\s+\*\*(\d+)\*\*\s+\(record:\s+\*\*(\d+)\*\*\)/i);
  if (streakM) {
    return {
      streak: Math.max(0, Math.floor(Number(streakM[1]) || 0)),
      best: Math.max(0, Math.floor(Number(streakM[2]) || 0)),
    };
  }
  return { streak: 0, best: 0 };
}

function roundWinFromEmbedMessages(round?, userId?) {
  const uid = String(userId || "").trim();
  let bestExp = 0;
  let streak = 0;
  let best = 0;
  for (const msg of round?.messages || []) {
    if (!msg?.author?.bot || !msg.embeds?.length) continue;
    for (const embed of msg.embeds) {
      const title = String(embed?.title || embed?.data?.title || "");
      const desc = String(embed?.description || embed?.data?.description || "");
      if (!WIN_TITLE_RE.test(title) && !desc.includes(`<@${uid}>`)) continue;
      if (!desc.includes(`<@${uid}>`)) continue;
      const exp = parseEffectiveExpFromText(desc, uid);
      if (exp > bestExp) bestExp = exp;
      const streakInfo = parseStreakFromText(desc, uid);
      if (streakInfo.streak > streak) streak = streakInfo.streak;
      if (streakInfo.best > best) best = streakInfo.best;
    }
  }
  return { exp: bestExp, streak, best };
}

async function listRoundWinnerUserIds(round?, botId?, sortedHouseByUserId?, reactionCache?) {
  const uidSet = new Set();
  const close = round?.closeMessage;
  if (!close) return [];
  if (isPodiumSummaryMessage(close)) {
    for (const row of parsePodiumSummaryLegacy(close)) {
      const uid = String(row.userId || "").trim();
      if (uid) uidSet.add(uid);
    }
    return [...uidSet];
  }
  if (isSingleWinnerMessage(close)) {
    const legacy = parseSingleWinnerLegacy(close);
    if (legacy?.userId) uidSet.add(String(legacy.userId));
    if (!uidSet.size && roundNeedsReactionScan(round) && botId) {
      const cacheKey = String(round.startId || "");
      let reactionWinners = reactionCache?.get?.(cacheKey);
      if (!reactionWinners) {
        reactionWinners = await collectPodiumWinnersFromReactions(round, botId, sortedHouseByUserId);
        reactionCache?.set?.(cacheKey, reactionWinners);
      }
      for (const w of reactionWinners || []) {
        const uid = String(w.userId || "").trim();
        if (uid) uidSet.add(uid);
      }
    }
    return [...uidSet];
  }
  if (isUnsortedCloseMessage(close)) {
    const legacy = parseUnsortedCloseLegacy(close);
    if (legacy?.userId) uidSet.add(String(legacy.userId));
  }
  return [...uidSet];
}

async function detectUserWinInRound(round?, userId?, botId?, sortedHouseByUserId?, reactionCache?) {
  const uid = String(userId || "").trim();
  if (!uid || !round?.closeMessage) return null;
  const close = round.closeMessage;
  const closeMs = round.closeMs || round.startMs || Date.now();
  let source = "";
  if (isPodiumSummaryMessage(close)) {
    const rows = parsePodiumSummaryLegacy(close);
    const row = rows.find((r?) => String(r.userId) === uid);
    if (row) source = "podium_summary";
    else return null;
  } else if (isSingleWinnerMessage(close)) {
    const legacy = parseSingleWinnerLegacy(close);
    if (!legacy || String(legacy.userId) !== uid) {
      if (roundNeedsReactionScan(round) && botId) {
        const cacheKey = String(round.startId || "");
        let reactionWinners = reactionCache?.get?.(cacheKey);
        if (!reactionWinners) {
          reactionWinners = await collectPodiumWinnersFromReactions(round, botId, sortedHouseByUserId);
          reactionCache?.set?.(cacheKey, reactionWinners);
        }
        if (!reactionWinners.some((w?) => String(w.userId) === uid)) return null;
        source = "reaction_podium";
      } else {
        return null;
      }
    } else {
      source = legacy.unsorted ? "unsorted_single" : "single_winner";
    }
  } else if (isUnsortedCloseMessage(close)) {
    const legacy = parseUnsortedCloseLegacy(close);
    if (!legacy || String(legacy.userId) !== uid) return null;
    source = "unsorted_close";
  } else {
    return null;
  }
  const embedInfo = roundWinFromEmbedMessages(round, uid);
  let exp = embedInfo.exp;
  if (exp <= 0 && isPodiumSummaryMessage(close)) {
    const block = String(close.embeds?.[0]?.description || close.embeds?.[0]?.data?.description || "")
      .split(/\n\n+/)
      .find((b?) => b.includes(`<@${uid}>`));
    exp = parseEffectiveExpFromText(block || "", uid);
  }
  if (exp <= 0) exp = parseBaseRewardFromRound(round);
  return {
    roundId: String(round.startId || ""),
    ms: closeMs,
    source,
    exp,
    streak: embedInfo.streak,
    bestStreak: embedInfo.best,
    periodKey: String(housePointPeriodKey(closeMs)?.key || "").trim(),
  };
}

function sleep(ms?) {
  return new Promise((resolve?) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

function snowflakeFromMs(ms?) {
  const n = BigInt(Math.max(0, Math.floor(Number(ms) || 0)));
  return ((n - 1289430000000n) << 22n).toString();
}

async function fetchChannelMessagesBetween(channel?, sinceMs?, untilMs?, options: Record<string, any> = {}) {
  const out = [];
  const delayMs = Math.max(0, Math.floor(Number(options.delayMs) || 200));
  let before;
  let batches = 0;
  while (true) {
    const opts: Record<string, any> = { limit: 100 };
    if (before) opts.before = before;
    const batch = await channel.messages.fetch(opts).catch(() => null);
    if (!batch?.size) break;
    batches += 1;
    const arr = [...batch.values()];
    let reachedOlder = false;
    for (const msg of arr) {
      const ts = msg.createdTimestamp;
      if (ts > untilMs) continue;
      if (ts < sinceMs) {
        reachedOlder = true;
        continue;
      }
      out.push(msg);
    }
    const oldest = arr.reduce((a?, b?) => (a.createdTimestamp < b.createdTimestamp ? a : b));
    if (oldest.createdTimestamp < sinceMs || batch.size < 100) break;
    before = oldest.id;
    if (typeof options.onBatch === "function") {
      options.onBatch({ batches, messages: out.length, channelId: channel.id });
    }
    if (delayMs > 0) await sleep(delayMs);
  }
  return out.sort((a?, b?) => a.createdTimestamp - b.createdTimestamp);
}

async function fetchRoundsForChannel(client?, channelId?, sinceMs?, untilMs?, options: Record<string, any> = {}) {
  const channel = await client.channels.fetch(String(channelId || "").trim()).catch(() => null);
  if (!channel?.messages?.fetch) return { rounds: [], messageCount: 0 };
  if (typeof options.onChannelStart === "function") options.onChannelStart(channelId);
  const messages = await fetchChannelMessagesBetween(channel, sinceMs, untilMs, {
    delayMs: options.fetchDelayMs,
    onBatch: (info?) => {
      if (typeof options.onBatch === "function") options.onBatch({ ...info, channelId });
    },
  });
  return { rounds: buildRoundsFromMessages(messages), messageCount: messages.length };
}

function dedupeWinsByRound(wins?) {
  const map = new Map();
  for (const row of wins) {
    const key = String(row.roundId || `${row.ms}:${row.source}`);
    const prev = map.get(key);
    if (!prev || row.exp > prev.exp) map.set(key, row);
  }
  return [...map.values()].sort((a?, b?) => a.ms - b.ms);
}

function aggregateWinStats(wins?) {
  const sorted = dedupeWinsByRound(wins);
  let totalExp = 0;
  let currentStreak = 0;
  let bestStreak = 0;
  const winsByPeriod: Record<string, any> = {};
  const weeklyExp: Record<string, any> = {};
  for (const row of sorted) {
    totalExp += Math.max(0, Math.floor(Number(row.exp) || 0));
    if (row.streak > 0) currentStreak = row.streak;
    if (row.bestStreak > bestStreak) bestStreak = row.bestStreak;
    if (row.periodKey) winsByPeriod[row.periodKey] = (winsByPeriod[row.periodKey] || 0) + 1;
    const wk = getIsoWeekKey(new Date(row.ms));
    weeklyExp[wk] = (weeklyExp[wk] || 0) + Math.max(0, Math.floor(Number(row.exp) || 0));
  }
  if (bestStreak <= 0 && sorted.length) bestStreak = Math.min(sorted.length, currentStreak || sorted.length);
  const weekKey = getIsoWeekKey(new Date());
  return {
    wins: sorted,
    totalExp,
    winCount: sorted.length,
    currentStreak: currentStreak || 0,
    bestStreak,
    winsByPeriod,
    weeklyKey: weekKey,
    weeklyExp: weeklyExp[weekKey] || 0,
  };
}

function resolveChannelIds(options: Record<string, any> = {}) {
  const out = new Set();
  const chatId = String(IDs.channels?.chat || "").trim();
  if (chatId) out.add(chatId);
  if (options.includeAllHouseChannels) {
    for (const key of ["hogwartsHouseGryffindor", "hogwartsHouseHufflepuff", "hogwartsHouseRavenclaw", "hogwartsHouseSlytherin"]) {
      const id = String(IDs.channels?.[key] || "").trim();
      if (id) out.add(id);
    }
  } else {
    const extra = Array.isArray(options.extraChannelIds) ? options.extraChannelIds : [];
    for (const id of extra) {
      const ch = String(id || "").trim();
      if (ch) out.add(ch);
    }
    const houseKeys = Array.isArray(options.houseChannelKeys) ? options.houseChannelKeys : ["hogwartsHouseHufflepuff"];
    for (const key of houseKeys) {
      const id = String(IDs.channels?.[key] || "").trim();
      if (id) out.add(id);
    }
  }
  return [...out];
}

async function rebuildUserMinigameStatsFromDiscord(client?, options: Record<string, any> = {}) {
  const guildId = String(options.guildId || IDs.guilds?.main || "").trim();
  const userId = String(options.userId || "").trim();
  const eventCfg = resolveHogwartsEventConfig(client);
  const eventKey = String(eventCfg?.eventKey || options.eventKey || "hogwarts_summer_2026").trim();
  if (!client || !guildId || !userId) return { ok: false, reason: "missing_input" };
  const eventStartMs = Number(eventCfg?.sortingStartMs ?? eventCfg?.startMs);
  const defaultFromMs = Number.isFinite(eventStartMs) ? eventStartMs : dateOnlyMs("2026-06-01", false);
  const defaultToMs = Math.min(Date.now(), romeEndOfDayMs("2026-06-14") || Date.now());
  const sinceMs = Number.isFinite(Number(options.sinceMs)) ? Number(options.sinceMs) : defaultFromMs;
  const untilMs = Number.isFinite(Number(options.untilMs)) ? Number(options.untilMs) : defaultToMs;
  const channelIds = resolveChannelIds(options);
  if (!channelIds.length) return { ok: false, reason: "no_channels" };
  const sortedHouseByUserId = await loadSortedHouseByUserId(guildId, eventKey);
  const botId = String(client.user?.id || "").trim();
  const reactionCache = new Map();
  const allWins = [];
  const roundsByChannel: Record<string, any> = {};
  const messagesByChannel: Record<string, any> = {};
  for (const channelId of channelIds) {
    if (typeof options.onChannelStart === "function") options.onChannelStart(channelId);
    const fetched = await fetchRoundsForChannel(client, channelId, sinceMs, untilMs, {
      fetchDelayMs: options.fetchDelayMs,
      onBatch: options.onBatch,
    });
    roundsByChannel[(channelId as any)] = fetched.rounds.length;
    messagesByChannel[(channelId as any)] = fetched.messageCount;
    for (const round of fetched.rounds) {
      const win = await detectUserWinInRound(round, userId, botId, sortedHouseByUserId, reactionCache);
      if (win) allWins.push({ ...win, channelId });
    }
  }
  const stats = aggregateWinStats(allWins);
  return {
    ok: true,
    guildId,
    userId,
    eventKey,
    sinceMs,
    untilMs,
    channelIds,
    roundsByChannel,
    messagesByChannel,
    ...stats,
  };
}

export = {
  rebuildUserMinigameStatsFromDiscord,
  aggregateWinStats,
  romeEndOfDayMs,
  fetchChannelMessagesBetween,
  detectUserWinInRound,
  resolveChannelIds,
  fetchRoundsForChannel,
  listRoundWinnerUserIds,
};