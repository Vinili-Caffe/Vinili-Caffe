const {
  buildLast7DaysHourKeys,
  createUtcFromRomeLocal,
  getLastSunday21BoundaryMsAtOrBefore,
} = require("../../Services/Community/weeklyActivityWinnersService");
const IDs = require("../Config/ids");
const { listCustomPrivateVoiceChannelsByOwner } = require("../Interaction/customRoleUtils");
const { isChannelInCustomPrivateCategory } = require("./customPrivateCategoryUtils");
const { PermissionsBitField } = require("discord.js");

const TIME_ZONE = "Europe/Rome";
const CUSTOM_VOC_WEEKLY_MIN_SECONDS = 5 * 60 * 60;
const CUSTOM_VOC_MAX_FAILED_WEEKS = 3;
const CUSTOM_VOC_RECREATION_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;
const CUSTOM_VOC_RETROACTIVE_MAX_WEEKS = 104;

const romeDateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  weekday: "short",
});

function getRomeDateTimeParts(date = new Date()) {
  const parts = romeDateTimeFormatter.formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
    weekday: weekdayMap[map.weekday] ?? 0,
  };
}

function getCurrentCustomVocWeekEndMs(date = new Date()) {
  const nowMs = date instanceof Date ? date.getTime() : Number(date);
  const p = getRomeDateTimeParts(new Date(nowMs));
  if (p.weekday === 0) {
    const thisSunday21 = createUtcFromRomeLocal(p.year, p.month, p.day, 21, 0, 0).getTime();
    if (nowMs < thisSunday21) return thisSunday21;
    return createUtcFromRomeLocal(p.year, p.month, p.day + 7, 21, 0, 0).getTime();
  }
  const daysUntilSunday = 7 - p.weekday;
  return createUtcFromRomeLocal(p.year, p.month, p.day + daysUntilSunday, 21, 0, 0).getTime();
}

function listCompletedWeekEndMsForBackfill(untilMs, lastEvalMs = 0, maxWeeks = CUSTOM_VOC_RETROACTIVE_MAX_WEEKS) {
  const boundary = getLastSunday21BoundaryMsAtOrBefore(untilMs);
  const lastEval = Number(lastEvalMs) || 0;
  const out = [];
  let cursor = boundary;
  for (let i = 0; i < maxWeeks; i += 1) {
    if (cursor <= lastEval) break;
    out.unshift(cursor);
    cursor -= 7 * 24 * 60 * 60 * 1000;
  }
  return out;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function buildRomeDateKeysForWeekEnding(weekEndMs) {
  const keys = new Set();
  for (let h = 0; h < 24 * 7; h += 1) {
    const d = new Date(Number(weekEndMs) - h * 60 * 60 * 1000);
    const parts = getRomeDateTimeParts(d);
    keys.add(`${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`);
  }
  return keys;
}

function collectOwnerCustomVocChannelIds(profileLean, guild, ownerId, primaryChannelId) {
  const ids = new Set();
  const primary = String(primaryChannelId || "").trim();
  if (primary) ids.add(primary);
  if (guild && ownerId) {
    for (const ch of listCustomPrivateVoiceChannelsByOwner(guild, ownerId)) {
      ids.add(String(ch.id));
    }
  }
  const hourly = toObjectMap(profileLean?.profile?.totals?.hourly || profileLean?.totals?.hourly);
  for (const row of Object.values(hourly)) {
    const voiceChannels = toObjectMap(row?.voiceChannels);
    for (const cid of Object.keys(voiceChannels)) {
      if (ids.has(String(cid))) continue;
      const ch = guild?.channels?.cache?.get(String(cid));
      if (!ch || !ch.isVoiceBased?.()) continue;
      if (!isChannelInCustomPrivateCategory(ch, guild)) continue;
      const ow = ch.permissionOverwrites?.cache?.get(String(ownerId));
      if (!ow?.allow?.has?.(PermissionsBitField.Flags.ManageChannels)) continue;
      ids.add(String(cid));
    }
  }
  return [...ids];
}

function sumCustomVocVoiceSecondsFromDaily(daily, channelIds, weekEndMs) {
  const idSet = new Set(channelIds.map((id) => String(id)));
  if (!idSet.size) return 0;
  const dailyMap = toObjectMap(daily);
  const dateKeys = buildRomeDateKeysForWeekEnding(weekEndMs);
  let total = 0;
  for (const dateKey of dateKeys) {
    const voiceChannels = toObjectMap(dailyMap?.[dateKey]?.voiceChannels);
    for (const [cid, value] of Object.entries(voiceChannels)) {
      if (!idSet.has(String(cid))) continue;
      const sec = Number(value || 0);
      if (Number.isFinite(sec) && sec > 0) total += sec;
    }
  }
  return Math.floor(total);
}

function sumCustomVocVoiceSecondsFromHourlyForChannels(hourly, channelIds, weekEndMs) {
  const idSet = new Set(channelIds.map((id) => String(id)));
  if (!idSet.size) return 0;
  const keys = new Set(buildLast7DaysHourKeys(Number(weekEndMs)));
  const hourlyMap = toObjectMap(hourly);
  let total = 0;
  for (const [hourKey, row] of Object.entries(hourlyMap)) {
    if (!keys.has(String(hourKey))) continue;
    const voiceChannels = toObjectMap(row?.voiceChannels);
    for (const [cid, value] of Object.entries(voiceChannels)) {
      if (!idSet.has(String(cid))) continue;
      const sec = Number(value || 0);
      if (Number.isFinite(sec) && sec > 0) total += sec;
    }
  }
  return Math.floor(total);
}

function toObjectMap(value) {
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(value.entries());
  return typeof value === "object" ? value : {};
}

function sumCustomVocVoiceSecondsFromHourly(hourly, channelId, weekEndMs) {
  const cid = String(channelId || "").trim();
  if (!cid) return 0;
  const keys = new Set(buildLast7DaysHourKeys(Number(weekEndMs)));
  const hourlyMap = toObjectMap(hourly);
  let total = 0;
  for (const [hourKey, row] of Object.entries(hourlyMap)) {
    if (!keys.has(String(hourKey))) continue;
    const voiceChannels = toObjectMap(row?.voiceChannels);
    const sec = Number(voiceChannels[cid] || 0);
    if (Number.isFinite(sec) && sec > 0) total += sec;
  }
  return Math.floor(total);
}

function getLiveCustomVocSessionSeconds(profileLean, channelId, weekEndMs) {
  const cid = String(channelId || "").trim();
  const totals = profileLean?.profile?.totals || profileLean?.totals || {};
  const sessionChannelId = String(profileLean?.sessionChannelId || totals?.sessionChannelId || "");
  if (!cid || sessionChannelId !== cid) return 0;
  const started = profileLean?.sessionStartedAt || totals?.sessionStartedAt;
  if (!started) return 0;
  const startMs = new Date(started).getTime();
  if (!Number.isFinite(startMs)) return 0;
  const weekStartMs = Number(weekEndMs) - 7 * 24 * 60 * 60 * 1000;
  const effectiveStart = Math.max(startMs, weekStartMs);
  const now = Date.now();
  const effectiveEnd = Math.min(now, Number(weekEndMs));
  if (effectiveEnd <= effectiveStart) return 0;
  return Math.floor((effectiveEnd - effectiveStart) / 1000);
}

function sumCustomVocVoiceSecondsForWeek(profileLean, channelId, weekEndMs, { includeLiveSession = false, guild = null, ownerId = null } = {}) {
  const channelIds = guild && ownerId
    ? collectOwnerCustomVocChannelIds(profileLean, guild, ownerId, channelId)
    : [String(channelId || "").trim()].filter(Boolean);
  const hourly = profileLean?.profile?.totals?.hourly || profileLean?.totals?.hourly;
  const daily = profileLean?.profile?.totals?.daily || profileLean?.totals?.daily;
  const fromHourly = sumCustomVocVoiceSecondsFromHourlyForChannels(hourly, channelIds, weekEndMs);
  const fromDaily = fromHourly > 0 ? 0 : sumCustomVocVoiceSecondsFromDaily(daily, channelIds, weekEndMs);
  const stored = fromHourly > 0 ? fromHourly : fromDaily;
  if (!includeLiveSession) return stored;
  const liveChannelId = String(channelId || channelIds[0] || "").trim();
  return stored + getLiveCustomVocSessionSeconds(profileLean, liveChannelId, weekEndMs);
}

function formatCustomVocHoursFromSeconds(seconds) {
  const sec = Math.max(0, Number(seconds) || 0);
  const hours = sec / 3600;
  if (hours < 10) return `${hours.toFixed(1)}h`;
  return `${Math.round(hours)}h`;
}

function formatCustomVocRemainingLabel(seconds) {
  const remaining = Math.max(0, CUSTOM_VOC_WEEKLY_MIN_SECONDS - (Number(seconds) || 0));
  if (remaining <= 0) return null;
  const hours = remaining / 3600;
  if (hours < 1) {
    const mins = Math.ceil(remaining / 60);
    return `${mins} min`;
  }
  return formatCustomVocHoursFromSeconds(remaining);
}

function formatRecreationBlockedUntilLabel(untilDate) {
  const ms = untilDate instanceof Date ? untilDate.getTime() : new Date(untilDate).getTime();
  if (!Number.isFinite(ms)) return "—";
  const parts = getRomeDateTimeParts(new Date(ms));
  return `${String(parts.day).padStart(2, "0")}/${String(parts.month).padStart(2, "0")}/${parts.year} alle 21:00`;
}

function formatCooldownRemainingLabel(untilDate, nowMs = Date.now()) {
  const ms = untilDate instanceof Date ? untilDate.getTime() : new Date(untilDate).getTime();
  if (!Number.isFinite(ms) || ms <= nowMs) return null;
  const diff = ms - nowMs;
  const days = Math.ceil(diff / (24 * 60 * 60 * 1000));
  if (days >= 2) return `${days} giorni`;
  const hours = Math.ceil(diff / (60 * 60 * 1000));
  return hours <= 1 ? "meno di 1 ora" : `${hours} ore`;
}

function buildCustomVocWeeklyActivityPanelState(customRoleLean, profileLean) {
  const channelId = String(customRoleLean?.customVocChannelId || "").trim();
  const failedWeekStreak = Math.max(0, Number(customRoleLean?.customVocFailedWeekStreak || 0));
  const recreationBlockedUntil = customRoleLean?.customVocRecreationBlockedUntil || null;
  const recreationBlockedMs = recreationBlockedUntil ? new Date(recreationBlockedUntil).getTime() : 0;
  const now = Date.now();
  const recreationBlocked = Number.isFinite(recreationBlockedMs) && recreationBlockedMs > now;
  const weekEndMs = getCurrentCustomVocWeekEndMs();
  const weekSeconds = channelId
    ? sumCustomVocVoiceSecondsForWeek(profileLean || {}, channelId, weekEndMs, { includeLiveSession: true })
    : 0;
  const meetsRequirement = weekSeconds >= CUSTOM_VOC_WEEKLY_MIN_SECONDS;
  return {
    hasChannel: Boolean(channelId),
    weekSeconds,
    weekHoursLabel: formatCustomVocHoursFromSeconds(weekSeconds),
    minHoursLabel: "5h",
    remainingHoursLabel: meetsRequirement ? null : formatCustomVocRemainingLabel(weekSeconds),
    failedWeekStreak,
    weeksUntilDeletion: Math.max(0, CUSTOM_VOC_MAX_FAILED_WEEKS - failedWeekStreak),
    recreationBlocked,
    recreationBlockedLabel: recreationBlocked ? formatRecreationBlockedUntilLabel(recreationBlockedUntil) : null,
    cooldownRemainingLabel: recreationBlocked ? formatCooldownRemainingLabel(recreationBlockedUntil, now) : null,
    meetsRequirement,
  };
}

function buildCustomVocWeeklyActivityEmbedLines(activityState) {
  if (!activityState || typeof activityState !== "object") return [];
  const lines = [];
  if (activityState.recreationBlocked) {
    lines.push(`<a:VC_Alert:1482706673176150077> Ricreazione bloccata${activityState.cooldownRemainingLabel ? ` per ancora **${activityState.cooldownRemainingLabel}**` : ""} (fino al **${activityState.recreationBlockedLabel || "—"}**).`);
    lines.push("<:VC_Info:1482526956703580372> Dopo **3 settimane** consecutive sotto **5 ore** la vocale viene eliminata; per ricrearla serve attendere **2 settimane**.");
    return lines;
  }
  if (activityState.hasChannel) {
    lines.push(`<a:VC_Calendar:1482706208149475358> Ore questa settimana: **${activityState.weekHoursLabel}** / **${activityState.minHoursLabel}** richieste`);
    if (activityState.remainingHoursLabel) {
      lines.push(`<:VC_Dot:1482532364222595303> Mancano ancora **${activityState.remainingHoursLabel}** per il minimo settimanale`);
    }
    if (activityState.failedWeekStreak > 0) {
      lines.push(`<a:VC_Alert:1482706673176150077> Settimane sotto soglia: **${activityState.failedWeekStreak}/${CUSTOM_VOC_MAX_FAILED_WEEKS}** — alla terza la vocale viene eliminata **domenica alle 21:00**`);
    } else if (activityState.meetsRequirement) {
      lines.push("<:VC_OnlineStatus:1482527088912240650> Requisito settimanale attuale raggiunto");
    }
    lines.push("<:VC_Info:1482526956703580372> Minimo **5 ore/settimana** nella tua vocale (periodo: domenica 21:00 → domenica 21:00, ora di Roma).");
    return lines;
  }
  lines.push("<:VC_Info:1482526956703580372> Minimo **5 ore/settimana** nella vocale privata; **3 settimane** consecutive sotto soglia → eliminazione **domenica 21:00** e attesa di **2 settimane** per ricrearla.");
  return lines;
}

module.exports = {
  CUSTOM_VOC_WEEKLY_MIN_SECONDS,
  CUSTOM_VOC_MAX_FAILED_WEEKS,
  CUSTOM_VOC_RECREATION_COOLDOWN_MS,
  CUSTOM_VOC_RETROACTIVE_MAX_WEEKS,
  getCurrentCustomVocWeekEndMs,
  getLastSunday21BoundaryMsAtOrBefore,
  listCompletedWeekEndMsForBackfill,
  sumCustomVocVoiceSecondsFromHourly,
  sumCustomVocVoiceSecondsFromHourlyForChannels,
  sumCustomVocVoiceSecondsFromDaily,
  collectOwnerCustomVocChannelIds,
  sumCustomVocVoiceSecondsForWeek,
  buildCustomVocWeeklyActivityPanelState,
  buildCustomVocWeeklyActivityEmbedLines,
  formatCustomVocHoursFromSeconds,
};