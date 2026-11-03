/** Attività: somme, classifiche interne e grafico per giorno. */
const { ActivityUserProfile } = require("../schemas/communitySchemas") as typeof import("../schemas/communitySchemas");
const { DAY_MS } = require("./activityTime") as typeof import("./activityTime");
const { shouldSkipBackfillRow } = require("./activityBackfill") as typeof import("./activityBackfill");

function safeTopRank(map?, targetId?) {
  const rows = Array.from(map.entries()).sort((a?, b?) => b[1] - a[1]);
  const index = rows.findIndex(([id]) => String(id) === String(targetId));
  return index >= 0 ? index + 1 : null;
}

function pushMapValue(target?, key?, amount?) {
  if (!key || !Number.isFinite(amount) || amount <= 0) return;
  target.set(key, (target.get(key) || 0) + amount);
}

function topNFromMap(map?, n = 3) {
  return Array.from(map.entries())
    .sort((a?, b?) => b[1] - a[1])
    .slice(0, n)
    .map(([id, value]) => ({ id, value }));
}

function toMapFromTopList(list = []) {
  const out = new Map();
  for (const row of Array.isArray(list) ? list : []) {
    const id = String(row?.id || "");
    const value = Number(row?.value || 0);
    if (!id || value <= 0) continue;
    out.set(id, (out.get(id) || 0) + value);
  }
  return out;
}

function secondsInLastNDays(startedAt?, days?, nowMs = Date.now()) {
  const safeDays = Math.max(1, Math.min(31, Number(days || 1)));
  const startMs = new Date(startedAt).getTime();
  if (!Number.isFinite(startMs)) return 0;
  const windowStartMs = nowMs - safeDays * DAY_MS;
  const effectiveStartMs = Math.max(startMs, windowStartMs);
  if (effectiveStartMs >= nowMs) return 0;
  return Math.max(0, Math.floor((nowMs - effectiveStartMs) / 1000));
}

async function loadLiveVoiceSessions(guildId?) {
  const docs = await ActivityUserProfile.find({ guildId, "profile.totals.sessionStartedAt": { $ne: null } })
    .select("userId profile.totals.sessionStartedAt profile.totals.sessionChannelId")
    .lean()
    .catch(() => []);
  const list = Array.isArray(docs) ? docs : [];
  return list.map((row?) => ({
    userId: row.userId,
    voice: {
      sessionStartedAt: row.profile?.totals?.sessionStartedAt,
      sessionChannelId: row.profile?.totals?.sessionChannelId,
    },
  }));
}

async function getLiveVoiceOverlay(guildId?, days = null) {
  const userVoice = new Map();
  const channelVoice = new Map();
  let totalVoiceSeconds = 0;
  const rows = await loadLiveVoiceSessions(guildId);
  if (!rows.length) return { userVoice, channelVoice, totalVoiceSeconds };

  const nowMs = Date.now();
  const safeDays = days == null ? null : Math.max(1, Math.min(31, Number(days || 1)));

  for (const row of rows) {
    const userId = String(row?.userId || "");
    const startedAt = row?.voice?.sessionStartedAt;
    const channelId = String(row?.voice?.sessionChannelId || "");
    if (!userId || !startedAt) continue;
    const addSeconds = safeDays == null ? Math.max(0, Math.floor((nowMs - new Date(startedAt).getTime()) / 1000),) : secondsInLastNDays(startedAt, safeDays, nowMs);
    if (!addSeconds) continue;
    pushMapValue(userVoice, userId, addSeconds);
    if (channelId) pushMapValue(channelVoice, channelId, addSeconds);
    totalVoiceSeconds += addSeconds;
  }

  return { userVoice, channelVoice, totalVoiceSeconds };
}

function aggregateFromHourlyRows(rows = [], hourKeys = [], topLimit = 3) {
  const safeTopLimit = Math.max(1, Math.min(500, Number(topLimit || 3)));
  const hourSet = new Set(Array.isArray(hourKeys) ? hourKeys : []);
  const userText = new Map();
  const userVoice = new Map();
  const channelText = new Map();
  const channelVoice = new Map();
  const contributors = new Set();

  for (const row of rows) {
    const hourKey = String(row?.hourKey || "");
    if (!hourSet.has(hourKey)) continue;
    if (shouldSkipBackfillRow(hourKey, hourSet)) continue;

    const userId = String(row?.userId || "");
    const textCount = Number(row?.textCount || 0);
    const voiceSeconds = Number(row?.voiceSeconds || 0);

    if (userId && (textCount > 0 || voiceSeconds > 0)) contributors.add(userId);
    if (userId) {
      pushMapValue(userText, userId, textCount);
      pushMapValue(userVoice, userId, voiceSeconds);
    }

    const textChannels = row?.textChannels || {};
    for (const [channelId, value] of Object.entries(textChannels)) {
      pushMapValue(channelText, String(channelId || ""), Number(value || 0));
    }

    const voiceChannels = row?.voiceChannels || {};
    for (const [channelId, value] of Object.entries(voiceChannels)) {
      pushMapValue(channelVoice, String(channelId || ""), Number(value || 0));
    }
  }

  return {
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
    contributors: contributors.size,
    topUsersText: topNFromMap(userText, safeTopLimit),
    topUsersVoice: topNFromMap(userVoice, safeTopLimit),
    topChannelsText: topNFromMap(channelText, safeTopLimit),
    topChannelsVoice: topNFromMap(channelVoice, safeTopLimit),
    contributorIds: contributors,
  };
}

function sumVoiceSecondsFromHourRow(row?, excludeVoiceChannelIds?) {
  const exclude =
    excludeVoiceChannelIds instanceof Set && excludeVoiceChannelIds.size > 0 ? excludeVoiceChannelIds : null;
  if (!exclude) return Number(row?.voiceSeconds || 0);
  const voiceChannels = row?.voiceChannels || {};
  const keys = Object.keys(voiceChannels);
  if (!keys.length) return Number(row?.voiceSeconds || 0);
  let sum = 0;
  for (const [channelId, value] of Object.entries(voiceChannels)) {
    if (exclude.has(String(channelId))) continue;
    sum += Number(value || 0);
  }
  return sum;
}

function sumTextFromHourRow(row?, includeTextChannelIds?) {
  const include =
    includeTextChannelIds instanceof Set && includeTextChannelIds.size > 0
      ? includeTextChannelIds
      : null;
  if (!include) return Number(row?.textCount || 0);
  const textChannels = row?.textChannels || {};
  const keys = Object.keys(textChannels);
  if (!keys.length) return 0;
  let sum = 0;
  for (const [channelId, value] of Object.entries(textChannels)) {
    if (!include.has(String(channelId))) continue;
    sum += Number(value || 0);
  }
  return sum;
}

function aggregateUserHourlyRows(
  rows = [],
  hourKeys = [],
  excludeVoiceChannelIds = null,
  includeTextChannelIds = null,
  includeVoiceChannelIds = null,
) {
  const exclude =
    excludeVoiceChannelIds instanceof Set && excludeVoiceChannelIds.size > 0 ? excludeVoiceChannelIds : null;
  const includeText =
    includeTextChannelIds instanceof Set && includeTextChannelIds.size > 0
      ? includeTextChannelIds
      : null;
  const includeVoice =
    includeVoiceChannelIds instanceof Set && includeVoiceChannelIds.size > 0
      ? includeVoiceChannelIds
      : null;
  const hourSet = new Set(Array.isArray(hourKeys) ? hourKeys : []);
  const channelText = new Map();
  const channelVoice = new Map();
  let text = 0;
  let voiceSeconds = 0;

  for (const row of rows) {
    const hourKey = String(row?.hourKey || "");
    if (!hourSet.has(hourKey)) continue;
    if (shouldSkipBackfillRow(hourKey, hourSet)) continue;
    const rowText = sumTextFromHourRow(row, includeText);
    const rowVoice = sumVoiceSecondsFromHourRow(row, exclude);
    text += rowText;
    if (includeVoice) {
      const voiceChannels = row?.voiceChannels || {};
      let rowVoiceIncluded = 0;
      for (const [channelId, value] of Object.entries(voiceChannels)) {
        const channelIdStr = String(channelId || "");
        if (exclude && exclude.has(channelIdStr)) continue;
        if (!includeVoice.has(channelIdStr)) continue;
        rowVoiceIncluded += Number(value || 0);
      }
      voiceSeconds += rowVoiceIncluded;
    } else {
      voiceSeconds += rowVoice;
    }

    const textChannels = row?.textChannels || {};
    for (const [channelId, value] of Object.entries(textChannels)) {
      if (includeText && !includeText.has(String(channelId || ""))) continue;
      pushMapValue(channelText, String(channelId || ""), Number(value || 0));
    }

    const voiceChannels = row?.voiceChannels || {};
    for (const [channelId, value] of Object.entries(voiceChannels)) {
      const channelIdStr = String(channelId || "");
      if (exclude && exclude.has(channelIdStr)) continue;
      if (includeVoice && !includeVoice.has(channelIdStr)) continue;
      pushMapValue(channelVoice, String(channelId || ""), Number(value || 0));
    }
  }

  return { text, voiceSeconds, topChannelsText: topNFromMap(channelText, 3), topChannelsVoice: topNFromMap(channelVoice, 3) };
}

function buildChartByDayFromHourlyRows(
  rows = [],
  hourKeys = [],
  excludeVoiceChannelIds = null,
  includeTextChannelIds = null,
  includeVoiceChannelIds = null,
) {
  const exclude =
    excludeVoiceChannelIds instanceof Set && excludeVoiceChannelIds.size > 0 ? excludeVoiceChannelIds : null;
  const includeText =
    includeTextChannelIds instanceof Set && includeTextChannelIds.size > 0
      ? includeTextChannelIds
      : null;
  const includeVoice =
    includeVoiceChannelIds instanceof Set && includeVoiceChannelIds.size > 0
      ? includeVoiceChannelIds
      : null;
  const hourSet = new Set(Array.isArray(hourKeys) ? hourKeys : []);
  const byDay = new Map();

  for (const row of rows) {
    const hourKey = String(row?.hourKey || "");
    if (!hourSet.has(hourKey)) continue;
    if (shouldSkipBackfillRow(hourKey, hourSet)) continue;
    const dayKey = hourKey.split("T")[0] || "";
    if (!dayKey) continue;
    const current = byDay.get(dayKey) || { text: 0, voiceSeconds: 0 };
    current.text += sumTextFromHourRow(row, includeText);
    if (includeVoice) {
      const voiceChannels = row?.voiceChannels || {};
      for (const [channelId, value] of Object.entries(voiceChannels)) {
        const channelIdStr = String(channelId || "");
        if (exclude && exclude.has(channelIdStr)) continue;
        if (!includeVoice.has(channelIdStr)) continue;
        current.voiceSeconds += Number(value || 0);
      }
    } else {
      current.voiceSeconds += sumVoiceSecondsFromHourRow(row, exclude);
    }
    byDay.set(dayKey, current);
  }

  return byDay;
}

export = { safeTopRank, pushMapValue, topNFromMap, toMapFromTopList, secondsInLastNDays, loadLiveVoiceSessions, getLiveVoiceOverlay, aggregateFromHourlyRows, sumVoiceSecondsFromHourRow, sumTextFromHourRow, aggregateUserHourlyRows, buildChartByDayFromHourlyRows };
