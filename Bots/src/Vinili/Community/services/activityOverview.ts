/** Attività: panoramica di server e utente (con cache). */
const { ActivityUserProfile } = require("../schemas/communitySchemas") as typeof import("../schemas/communitySchemas");
const { getLastNDaysKeys, getLastNHourKeys, getHourKeysBetween, getDayKeysBetween, secondsOverlappingRange } = require("./activityTime") as typeof import("./activityTime");
const { loadHourlyRows } = require("./activityRows") as typeof import("./activityRows");
const { maybeAwaitHourlyBackfillForGuild } = require("./activityBackfill") as typeof import("./activityBackfill");
const { safeTopRank, pushMapValue, topNFromMap, toMapFromTopList, secondsInLastNDays, loadLiveVoiceSessions, getLiveVoiceOverlay, aggregateFromHourlyRows, sumVoiceSecondsFromHourRow, sumTextFromHourRow, aggregateUserHourlyRows, buildChartByDayFromHourlyRows } = require("./activityAggregate") as typeof import("./activityAggregate");
const { getOverviewStatsCache, setOverviewStatsCache } = require("./activityStats") as typeof import("./activityStats");

async function getServerOverviewStats(guildId?, lookbackDays = 14, topLimit = 3) {
  const safeTopLimit = Math.max(1, Math.min(500, Number(topLimit || 3)));
  const safeLookback = [1, 7, 14, 21, 30].includes(Number(lookbackDays)) ? Number(lookbackDays) : 14;
  const cacheKey = `server:${guildId}:${safeLookback}:${safeTopLimit}`;
  const cached = getOverviewStatsCache(cacheKey);
  if (cached) return cached;
  await maybeAwaitHourlyBackfillForGuild(guildId);
  const hourKeys1 = getLastNHourKeys(24);
  const hourKeys7 = getLastNHourKeys(24 * 7);
  const hourKeys14 = getLastNHourKeys(24 * 14);
  const hourKeys21 = getLastNHourKeys(24 * 21);
  const hourKeys30 = getLastNHourKeys(24 * 30);
  const hourKeysLookback = getLastNHourKeys(24 * safeLookback);
  const allHourKeys = Array.from(new Set([...hourKeys1, ...hourKeys7, ...hourKeys14, ...hourKeys21, ...hourKeys30, ...hourKeysLookback,]),);
  const dayKeysLookback = getLastNDaysKeys(safeLookback);
  const hourlyRows = await loadHourlyRows(guildId, allHourKeys);
  const agg1 = aggregateFromHourlyRows(hourlyRows, hourKeys1, safeTopLimit);
  const agg7 = aggregateFromHourlyRows(hourlyRows, hourKeys7, safeTopLimit);
  const agg14 = aggregateFromHourlyRows(hourlyRows, hourKeys14, safeTopLimit);
  const agg21 = aggregateFromHourlyRows(hourlyRows, hourKeys21, safeTopLimit);
  const agg30 = aggregateFromHourlyRows(hourlyRows, hourKeys30, safeTopLimit);
  const aggLookback = aggregateFromHourlyRows(hourlyRows, hourKeysLookback, safeTopLimit,);
  const chartByDay = buildChartByDayFromHourlyRows(hourlyRows, hourKeysLookback,);

  const chartPoints = dayKeysLookback.slice().reverse().map((dayKey?) => { const point = chartByDay.get(dayKey) || { text: 0, voiceSeconds: 0, }; return { dayKey, text: Number(point.text || 0), voiceSeconds: Number(point.voiceSeconds || 0), }; }); const liveOverlayLookback = await getLiveVoiceOverlay(guildId, safeLookback);
  if (liveOverlayLookback.totalVoiceSeconds > 0) {
    const liveSessions = await loadLiveVoiceSessions(guildId);
    const nowMs = Date.now();
    const byUserLookback = toMapFromTopList(aggLookback.topUsersVoice);
    const byChannelLookback = toMapFromTopList(aggLookback.topChannelsVoice);
    const contributorSets = { d1: new Set(agg1?.contributorIds || []), d7: new Set(agg7?.contributorIds || []), d14: new Set(agg14?.contributorIds || []), d21: new Set(agg21?.contributorIds || []), d30: new Set(agg30?.contributorIds || []), };
    const windowsAgg = { d1: agg1, d7: agg7, d14: agg14, d21: agg21, d30: agg30, };

    for (const row of liveSessions) {
      const userId = String(row?.userId || "");
      const startedAt = row?.voice?.sessionStartedAt;
      const channelId = String(row?.voice?.sessionChannelId || "");
      if (!userId || !startedAt) continue;

      for (const days of [1, 7, 14, 21, 30]) {
        const key = `d${days}`;
        const addSeconds = secondsInLastNDays(startedAt, days, nowMs);
        if (!addSeconds) continue;
        windowsAgg[key].totals.voiceSeconds += addSeconds;
        contributorSets[key].add(userId);
      }

      const addLookback = Number(liveOverlayLookback.userVoice.get(userId) || 0) || 0;
      if (addLookback > 0) {
        byUserLookback.set(userId, (byUserLookback.get(userId) || 0) + addLookback);
        if (channelId) {
          byChannelLookback.set(
            channelId,
            (byChannelLookback.get(channelId) || 0) + addLookback,
          );
        }
        const lastPoint = chartPoints[chartPoints.length - 1];
        if (lastPoint) lastPoint.voiceSeconds += addLookback;
      }
    }

    agg1.contributors = contributorSets.d1.size;
    agg7.contributors = contributorSets.d7.size;
    agg14.contributors = contributorSets.d14.size;
    agg21.contributors = contributorSets.d21.size;
    agg30.contributors = contributorSets.d30.size;
    aggLookback.topUsersVoice = topNFromMap(byUserLookback, safeTopLimit);
    aggLookback.topChannelsVoice = topNFromMap(byChannelLookback, safeTopLimit);
  }

  const hasTrackedRows = hourlyRows.length > 0;
  if (!hasTrackedRows) {
    const users = await ActivityUserProfile.find({ guildId })
      .select("userId profile.totals.messagesWeekly profile.totals.messagesTotal profile.totals.voiceWeeklySeconds profile.totals.voiceTotalSeconds")
      .lean()
      .catch(() => []);
    const userText = new Map();
    const userVoice = new Map();
    let totalText7 = 0;
    let totalVoice7 = 0;
    let totalText14 = 0;
    let totalVoice14 = 0;
    let totalText21 = 0;
    let totalVoice21 = 0;
    let totalText30 = 0;
    let totalVoice30 = 0;

    for (const row of users) {
      const id = String(row?.userId || "");
      const t = row?.profile?.totals || {};
      const textWeekly = Number(t.messagesWeekly || 0);
      const textTotal = Number(t.messagesTotal || 0);
      const voiceWeekly = Number(t.voiceWeeklySeconds || 0);
      const voiceTotal = Number(t.voiceTotalSeconds || 0);
      totalText7 += textWeekly;
      totalVoice7 += voiceWeekly;
      totalText14 += textTotal;
      totalVoice14 += voiceTotal;
      totalText21 += textTotal;
      totalVoice21 += voiceTotal;
      totalText30 += textTotal;
      totalVoice30 += voiceTotal;
      pushMapValue(userText, id, textTotal);
      pushMapValue(userVoice, id, voiceTotal);
    }

    const live1 = await getLiveVoiceOverlay(guildId, 1);
    const liveContrib1 = new Set(
      [...(live1.userVoice?.keys?.() || [])].map(String).filter(Boolean),
    );
    const fallbackWindows = {
      d1: {
        text: 0,
        voiceSeconds: Number(live1.totalVoiceSeconds || 0),
        contributors: liveContrib1.size,
      },
      d7: { text: totalText7, voiceSeconds: totalVoice7, contributors: 0 },
      d14: { text: totalText14, voiceSeconds: totalVoice14, contributors: 0 },
      d21: { text: totalText21, voiceSeconds: totalVoice21, contributors: 0 },
      d30: { text: totalText30, voiceSeconds: totalVoice30, contributors: 0 },
    };

    const fallbackResult = {
      approximate: true,
      lookbackDays: safeLookback,
      windows: fallbackWindows,
      topUsersText: topNFromMap(userText, safeTopLimit),
      topUsersVoice: topNFromMap(userVoice, safeTopLimit),
      topChannelsText: [],
      topChannelsVoice: [],
      chart: chartPoints,
    };
    setOverviewStatsCache(cacheKey, fallbackResult);
    return fallbackResult;
  }

  const result = {
    approximate: false,
    lookbackDays: safeLookback,
    windows: {
      d1: {
        text: agg1.totals.text,
        voiceSeconds: agg1.totals.voiceSeconds,
        contributors: agg1.contributors,
      },
      d7: {
        text: agg7.totals.text,
        voiceSeconds: agg7.totals.voiceSeconds,
        contributors: agg7.contributors,
      },
      d14: {
        text: agg14.totals.text,
        voiceSeconds: agg14.totals.voiceSeconds,
        contributors: agg14.contributors,
      },
      d21: {
        text: agg21.totals.text,
        voiceSeconds: agg21.totals.voiceSeconds,
        contributors: agg21.contributors,
      },
      d30: {
        text: agg30.totals.text,
        voiceSeconds: agg30.totals.voiceSeconds,
        contributors: agg30.contributors,
      },
    },
    topUsersText: aggLookback.topUsersText,
    topUsersVoice: aggLookback.topUsersVoice,
    topChannelsText: aggLookback.topChannelsText,
    topChannelsVoice: aggLookback.topChannelsVoice,
    chart: chartPoints,
  };
  setOverviewStatsCache(cacheKey, result);
  return result;
}

async function getUserOverviewStats(guildId?, userId?, lookbackDays = 14, excludeVoiceChannelIds = null, options = null) {
  const exclude =
    excludeVoiceChannelIds instanceof Set && excludeVoiceChannelIds.size > 0 ? excludeVoiceChannelIds : null;
  const includeText =
    options?.includeTextChannelIds instanceof Set && options.includeTextChannelIds.size > 0
      ? options.includeTextChannelIds
      : null;
  const includeVoice =
    options?.includeVoiceChannelIds instanceof Set && options.includeVoiceChannelIds.size > 0
      ? options.includeVoiceChannelIds
      : null;
  const rangeStartMs = options?.rangeStart ? new Date(options.rangeStart).getTime() : NaN;
  const rangeEndMs = options?.rangeEnd ? new Date(options.rangeEnd).getTime() : NaN;
  const useRange = Number.isFinite(rangeStartMs) && Number.isFinite(rangeEndMs) && rangeEndMs > rangeStartMs;
  const safeLookback = [1, 7, 14, 21, 30].includes(Number(lookbackDays)) ? Number(lookbackDays) : 14;
  const cacheKey = useRange
    ? `user:${guildId}:${userId}:range:${rangeStartMs}:${rangeEndMs}:${includeText ? "t" : ""}:${includeVoice ? "v" : ""}:${exclude ? "x" : ""}`
    : `user:${guildId}:${userId}:${safeLookback}`;
  const cached = getOverviewStatsCache(cacheKey);
  if (cached) return cached;
  await maybeAwaitHourlyBackfillForGuild(guildId);
  const lookbackKey = `d${safeLookback}`;
  const hourKeys1 = getLastNHourKeys(24);
  const hourKeys7 = useRange ? getHourKeysBetween(rangeStartMs, rangeEndMs) : getLastNHourKeys(24 * 7);
  const hourKeys14 = getLastNHourKeys(24 * 14);
  const hourKeys21 = getLastNHourKeys(24 * 21);
  const hourKeys30 = getLastNHourKeys(24 * 30);
  const hourKeysLookback = useRange ? hourKeys7 : getLastNHourKeys(24 * safeLookback);
  const allHourKeys = Array.from(new Set([...hourKeys1, ...hourKeys7, ...hourKeys14, ...hourKeys21, ...hourKeys30, ...hourKeysLookback,]),);
  const dayKeysLookback = useRange ? getDayKeysBetween(rangeStartMs, rangeEndMs) : getLastNDaysKeys(safeLookback);

  const [userRows, guildRows14, liveDoc, liveGuildSessions] = await Promise.all([
    loadHourlyRows(guildId, allHourKeys, userId),
    loadHourlyRows(guildId, hourKeysLookback),
    ActivityUserProfile.findOne({ guildId, userId, "profile.totals.sessionStartedAt": { $ne: null } })
      .select("profile.totals.sessionStartedAt profile.totals.sessionChannelId")
      .lean()
      .catch(() => null),
    loadLiveVoiceSessions(guildId),
  ]);

  const agg1 = aggregateUserHourlyRows(userRows, hourKeys1, exclude, includeText, includeVoice);
  const agg7 = aggregateUserHourlyRows(userRows, hourKeys7, exclude, includeText, includeVoice);
  const agg14 = aggregateUserHourlyRows(userRows, hourKeys14, exclude, includeText, includeVoice);
  const agg21 = aggregateUserHourlyRows(userRows, hourKeys21, exclude, includeText, includeVoice);
  const agg30 = aggregateUserHourlyRows(userRows, hourKeys30, exclude, includeText, includeVoice);
  const aggLookback = aggregateUserHourlyRows(userRows, hourKeysLookback, exclude, includeText, includeVoice);
  const userChartByDay = buildChartByDayFromHourlyRows(userRows, hourKeysLookback, exclude, includeText, includeVoice);

  const chart = dayKeysLookback.slice().reverse().map((dayKey?) => {
    const point = userChartByDay.get(dayKey) || { text: 0, voiceSeconds: 0 };
    return { dayKey, text: Number(point.text || 0), voiceSeconds: Number(point.voiceSeconds || 0) };
  });

  if (liveDoc?.profile?.totals?.sessionStartedAt) {
    const nowMs = Date.now();
    const startedAt = liveDoc.profile?.totals?.sessionStartedAt;
    const channelId = String(liveDoc?.profile?.totals?.sessionChannelId || "");
    const skipLiveVoice = Boolean(
      (exclude && channelId && exclude.has(channelId)) ||
      (includeVoice && channelId && !includeVoice.has(channelId)),
    );
    if (!skipLiveVoice) {
      const add1 = secondsInLastNDays(startedAt, 1, nowMs);
      const add7 = useRange
        ? secondsOverlappingRange(startedAt, rangeStartMs, rangeEndMs, nowMs)
        : secondsInLastNDays(startedAt, 7, nowMs);
      const add14 = secondsInLastNDays(startedAt, 14, nowMs);
      const add21 = secondsInLastNDays(startedAt, 21, nowMs);
      const add30 = secondsInLastNDays(startedAt, 30, nowMs);
      const addLookback = useRange
        ? add7
        : secondsInLastNDays(startedAt, safeLookback, nowMs);
      agg1.voiceSeconds += add1;
      agg7.voiceSeconds += add7;
      agg14.voiceSeconds += add14;
      agg21.voiceSeconds += add21;
      agg30.voiceSeconds += add30;
      if (addLookback > 0) {
        if (channelId) {
          const byChannel = toMapFromTopList(aggLookback.topChannelsVoice);
          byChannel.set(channelId, (byChannel.get(channelId) || 0) + addLookback);
          aggLookback.topChannelsVoice = topNFromMap(byChannel, 3);
        }
        const lastPoint = chart[chart.length - 1];
        if (lastPoint) lastPoint.voiceSeconds += addLookback;
      }
    }
  }

  const rankTextMap = new Map();
  const rankVoiceMap = new Map();
  for (const row of guildRows14) {
    const id = String(row?.userId || "");
    pushMapValue(rankTextMap, id, sumTextFromHourRow(row, includeText));
    if (includeVoice) {
      const voiceChannels = row?.voiceChannels || {};
      let voiceIncluded = 0;
      for (const [channelId, value] of Object.entries(voiceChannels)) {
        const channelIdStr = String(channelId || "");
        if (exclude && exclude.has(channelIdStr)) continue;
        if (!includeVoice.has(channelIdStr)) continue;
        voiceIncluded += Number(value || 0);
      }
      pushMapValue(rankVoiceMap, id, voiceIncluded);
    } else {
      pushMapValue(rankVoiceMap, id, sumVoiceSecondsFromHourRow(row, exclude));
    }
  }

  const liveGuildSessionsList = liveGuildSessions || [];
  if (liveGuildSessionsList.length) {
    const nowMs = Date.now();
    for (const row of liveGuildSessionsList) {
      const id = String(row?.userId || "");
      const startedAt = row?.voice?.sessionStartedAt;
      if (!id || !startedAt) continue;
      const add = secondsInLastNDays(startedAt, safeLookback, nowMs);
      if (!add) continue;
      const channelId = String(row?.voice?.sessionChannelId || "");
      if (exclude && channelId && exclude.has(channelId)) continue;
      if (includeVoice && channelId && !includeVoice.has(channelId)) continue;
      pushMapValue(rankVoiceMap, id, add);
    }
  }

  let rankText = safeTopRank(rankTextMap, userId);
  let rankVoice = safeTopRank(rankVoiceMap, userId);

  if (!userRows.length) {
    const doc = await ActivityUserProfile.findOne({ guildId, userId }).select("profile.totals").lean().catch(() => null);
    const t = doc?.profile?.totals || {};
    const fallback = {
      d1: { text: Number(t.messagesDaily || 0), voiceSeconds: Number(t.voiceDailySeconds || 0) },
      d7: { text: Number(t.messagesWeekly || 0), voiceSeconds: Number(t.voiceWeeklySeconds || 0) },
      d14: { text: Number(t.messagesTotal || 0), voiceSeconds: Number(t.voiceTotalSeconds || 0) },
      d21: { text: Number(t.messagesTotal || 0), voiceSeconds: Number(t.voiceTotalSeconds || 0) },
      d30: { text: Number(t.messagesTotal || 0), voiceSeconds: Number(t.voiceTotalSeconds || 0) },
    };
    const fallbackResult = {
      approximate: true,
      lookbackDays: safeLookback,
      windows: fallback,
      ranks: { text: rankText, voice: rankVoice },
      topChannelsText: [],
      topChannelsVoice: [],
      chart,
    };
    setOverviewStatsCache(cacheKey, fallbackResult);
    return fallbackResult;
  }

  const result = {
    approximate: false,
    lookbackDays: safeLookback,
    windows: {
      d1: {
        text: agg1.text,
        voiceSeconds: agg1.voiceSeconds,
      },
      d7: { text: agg7.text, voiceSeconds: agg7.voiceSeconds },
      d14: { text: agg14.text, voiceSeconds: agg14.voiceSeconds },
      d21: { text: agg21.text, voiceSeconds: agg21.voiceSeconds },
      d30: { text: agg30.text, voiceSeconds: agg30.voiceSeconds },
    },
    ranks: { text: rankText, voice: rankVoice },
    topChannelsText: aggLookback.topChannelsText,
    topChannelsVoice: aggLookback.topChannelsVoice,
    chart,
  };
  setOverviewStatsCache(cacheKey, result);
  return result;
}

export = { getServerOverviewStats, getUserOverviewStats };
