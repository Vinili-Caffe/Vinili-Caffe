/** Attività: statistiche di utente, server e canale. */
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { getLastNDaysKeys } = require("./activityTime") as typeof import("./activityTime");
const { OVERVIEW_STATS_CACHE_TTL_MS, loadDailyRows } = require("./activityRows") as typeof import("./activityRows");
const { ensureMessageKeys, ensureVoiceKeys, getOrCreateActivityUser } = require("./activityUser") as typeof import("./activityUser");
const { pushMapValue, topNFromMap, getLiveVoiceOverlay } = require("./activityAggregate") as typeof import("./activityAggregate");

const overviewStatsCache = new Map();

function getOverviewStatsCache(key?) {
  if (!OVERVIEW_STATS_CACHE_TTL_MS) return null;
  const entry = overviewStatsCache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    if (entry) overviewStatsCache.delete(key);
    return null;
  }
  return entry.value;
}

function setOverviewStatsCache(key?, value?) {
  if (!OVERVIEW_STATS_CACHE_TTL_MS) return;
  overviewStatsCache.set(key, { value, expiresAt: Date.now() + OVERVIEW_STATS_CACHE_TTL_MS });
}

async function getUserActivityStats(guildId?, userId?) {
  const now = new Date();
  let doc = await getOrCreateActivityUser(guildId, userId);
  if (!doc) {
    return {
      messages: { daily: 0, weekly: 0, total: 0 },
      voice: { dailySeconds: 0, weeklySeconds: 0, totalSeconds: 0 },
    };
  }
  if (!doc.profile) doc.profile = {};
  if (!doc.profile.totals) doc.profile.totals = {};
  ensureMessageKeys(doc, now);
  ensureVoiceKeys(doc, now);

  let liveVoiceSeconds = 0;
  if (doc.profile?.totals?.sessionStartedAt) {
    liveVoiceSeconds = Math.max(
      0,
      Math.floor(
        (now.getTime() - new Date(doc.profile.totals.sessionStartedAt).getTime()) / 1000,
      ),
    );
  }

  await doc.save();

  return {
    messages: {
      daily: Number(doc.profile.totals.messagesDaily || 0),
      weekly: Number(doc.profile.totals.messagesWeekly || 0),
      total: Number(doc.profile.totals.messagesTotal || 0),
    },
    voice: {
      dailySeconds: Number(doc.profile.totals.voiceDailySeconds || 0) + liveVoiceSeconds,
      weeklySeconds: Number(doc.profile.totals.voiceWeeklySeconds || 0) + liveVoiceSeconds,
      totalSeconds: Number(doc.profile.totals.voiceTotalSeconds || 0) + liveVoiceSeconds,
    },
  };
}

async function getServerActivityStats(guildId?, days = 7) {
  const dateKeys = getLastNDaysKeys(days);
  const rows = await loadDailyRows(guildId, dateKeys);

  const userText = new Map();
  const userVoice = new Map();
  const channelText = new Map();
  const channelVoice = new Map();

  for (const row of rows) {
    const textCount = Number(row?.textCount || 0);
    const voiceSeconds = Number(row?.voiceSeconds || 0);
    pushMapValue(userText, String(row.userId || ""), textCount);
    pushMapValue(userVoice, String(row.userId || ""), voiceSeconds);

    const textChannels = row?.textChannels || {};
    for (const [channelId, value] of Object.entries(textChannels)) {
      pushMapValue(channelText, String(channelId || ""), Number(value || 0));
    }

    const voiceChannels = row?.voiceChannels || {};
    for (const [channelId, value] of Object.entries(voiceChannels)) {
      pushMapValue(channelVoice, String(channelId || ""), Number(value || 0));
    }
  }
  const liveOverlay = await getLiveVoiceOverlay(guildId, days);
  for (const [userId, value] of liveOverlay.userVoice.entries()) {
    pushMapValue(userVoice, userId, value);
  }
  for (const [channelId, value] of liveOverlay.channelVoice.entries()) {
    pushMapValue(channelVoice, channelId, value);
  }

  if (rows.length === 0) {
    const users = await ActivityUserProfile.find({ guildId })
      .select("userId profile.totals.messagesWeekly profile.totals.messagesTotal profile.totals.voiceWeeklySeconds profile.totals.voiceTotalSeconds")
      .lean()
      .catch(() => []);

    const retroUserText = new Map();
    const retroUserVoice = new Map();
    let retroTextTotal = 0;
    let retroVoiceTotal = 0;
    const useWeekly = Number(days || 7) <= 7;

    for (const row of users) {
      const t = row?.profile?.totals || {};
      const textValue = Number(useWeekly ? t.messagesWeekly : t.messagesTotal) || 0;
      const voiceValue = Number(useWeekly ? t.voiceWeeklySeconds : t.voiceTotalSeconds) || 0;
      pushMapValue(retroUserText, String(row?.userId || ""), textValue);
      pushMapValue(retroUserVoice, String(row?.userId || ""), voiceValue);
      retroTextTotal += textValue;
      retroVoiceTotal += voiceValue;
    }
    for (const [userId, value] of liveOverlay.userVoice.entries()) {
      pushMapValue(retroUserVoice, userId, value);
    }
    retroVoiceTotal += Number(liveOverlay.totalVoiceSeconds || 0);

    return {
      days: Math.max(1, Math.min(31, Number(days || 7))),
      totals: {
        text: retroTextTotal,
        voiceSeconds: retroVoiceTotal,
      },
      topUsersText: topNFromMap(retroUserText, 3),
      topUsersVoice: topNFromMap(retroUserVoice, 3),
      topChannelsText: [],
      topChannelsVoice: [],
      approximate: true,
    };
  }

  return {
    days: Math.max(1, Math.min(31, Number(days || 7))),
    totals: {
      text: Array.from(userText.values()).reduce(
        (sum?, value?) => sum + value,
        0,
      ),
      voiceSeconds: Array.from(userVoice.values()).reduce(
        (sum?, value?) => sum + value,
        0,
      ),
    },
    topUsersText: topNFromMap(userText, 3),
    topUsersVoice: topNFromMap(userVoice, 3),
    topChannelsText: topNFromMap(channelText, 3),
    topChannelsVoice: topNFromMap(channelVoice, 3),
    approximate: false,
  };
}

async function getChannelOverviewStats(guildId?, channelId?, lookbackDays = 14) {
  const safeLookback = [1, 7, 14, 21, 30].includes(Number(lookbackDays)) ? Number(lookbackDays) : 14;
  const channelIdStr = String(channelId || "");
  if (!guildId || !channelIdStr) {
    return {
      lookbackDays: safeLookback,
      windows: { d1: {}, d7: {}, d14: {}, d21: {}, d30: {} },
      topUsersText: [],
      topUsersVoice: [],
      chart: [],
    };
  }
  const cacheKey = `channel:${guildId}:${channelIdStr}:${safeLookback}`;
  const cached = getOverviewStatsCache(cacheKey);
  if (cached) return cached;
  const dayKeys1 = getLastNDaysKeys(1);
  const dayKeys7 = getLastNDaysKeys(7);
  const dayKeys14 = getLastNDaysKeys(14);
  const dayKeys21 = getLastNDaysKeys(21);
  const dayKeys30 = getLastNDaysKeys(30);
  const dayKeysLookback = getLastNDaysKeys(safeLookback);
  const allKeys = Array.from(new Set([...dayKeys1, ...dayKeys7, ...dayKeys14, ...dayKeys21, ...dayKeys30, ...dayKeysLookback]));
  const rows = await loadDailyRows(guildId, allKeys);

  const getChannelVal = (row?, key?) => {
    const map = row?.[key];
    if (!map) return 0;
    const v = typeof map.get === "function" ? map.get(channelIdStr) : map[channelIdStr];
    return Math.max(0, Number(v || 0));
  };

  const byDay = new Map();
  const userTextAll = new Map();
  const userVoiceAll = new Map();
  const contrib1 = new Set();
  const contrib7 = new Set();
  const contrib14 = new Set();
  const contrib21 = new Set();
  const contrib30 = new Set();

  for (const row of rows) {
    const dateKey = String(row?.dateKey || "");
    const userId = String(row?.userId || "");
    const textVal = getChannelVal(row, "textChannels");
    const voiceVal = getChannelVal(row, "voiceChannels");
    if (textVal <= 0 && voiceVal <= 0) continue;

    if (dateKey) {
      const cur = byDay.get(dateKey) || { text: 0, voiceSeconds: 0 };
      cur.text += textVal;
      cur.voiceSeconds += voiceVal;
      byDay.set(dateKey, cur);
    }
    pushMapValue(userTextAll, userId, textVal);
    pushMapValue(userVoiceAll, userId, voiceVal);
    if (dayKeys1.includes(dateKey)) contrib1.add(userId);
    if (dayKeys7.includes(dateKey)) contrib7.add(userId);
    if (dayKeys14.includes(dateKey)) contrib14.add(userId);
    if (dayKeys21.includes(dateKey)) contrib21.add(userId);
    if (dayKeys30.includes(dateKey)) contrib30.add(userId);
  }

  const sumForKeys = (keys?) => {
    let text = 0;
    let voice = 0;
    for (const key of keys) {
      const cur = byDay.get(key);
      if (cur) {
        text += cur.text;
        voice += cur.voiceSeconds;
      }
    }
    return { text, voiceSeconds: voice };
  };

  const liveOverlay = await getLiveVoiceOverlay(guildId, safeLookback);
  const liveForChannel = Number(liveOverlay.channelVoice?.get?.(channelIdStr) || 0);
  if (liveForChannel > 0) {
    const lastKey = dayKeysLookback[dayKeysLookback.length - 1];
    if (lastKey) {
      const cur = byDay.get(lastKey) || { text: 0, voiceSeconds: 0 };
      cur.voiceSeconds += liveForChannel;
      byDay.set(lastKey, cur);
    }
  }

  const d1 = sumForKeys(dayKeys1);
  const d7 = sumForKeys(dayKeys7);
  const d14 = sumForKeys(dayKeys14);
  const d21 = sumForKeys(dayKeys21);
  const d30 = sumForKeys(dayKeys30);

  const chart = dayKeysLookback.slice().reverse().map((dayKey?) => {
    const point = byDay.get(dayKey) || { text: 0, voiceSeconds: 0 };
    return {
      dayKey,
      text: Number(point.text || 0),
      voiceSeconds: Number(point.voiceSeconds || 0),
    };
  });

  const result = {
    lookbackDays: safeLookback,
    windows: {
      d1: { ...d1, contributors: contrib1.size },
      d7: { ...d7, contributors: contrib7.size },
      d14: { ...d14, contributors: contrib14.size },
      d21: { ...d21, contributors: contrib21.size },
      d30: { ...d30, contributors: contrib30.size },
    },
    topUsersText: topNFromMap(userTextAll, 3),
    topUsersVoice: topNFromMap(userVoiceAll, 3),
    chart,
  };
  setOverviewStatsCache(cacheKey, result);
  return result;
}

export = { getOverviewStatsCache, setOverviewStatsCache, getUserActivityStats, getServerActivityStats, getChannelOverviewStats };
