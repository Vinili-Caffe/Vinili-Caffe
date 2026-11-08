/** Vincitori attività: settimane, mesi e ore in ora di Roma. */
const TIME_ZONE = "Europe/Rome";
const HOGWARTS_BIWEEKLY_MS = 14 * 24 * 60 * 60 * 1000;

function getRomeOffsetMs(utcDate?) {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, timeZoneName: "shortOffset", hour: "2-digit" });
  const zoneName = formatter.formatToParts(utcDate).find((part?) => part.type === "timeZoneName")?.value;
  const match = String(zoneName || "GMT+0").match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/i);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return sign * (hours * 60 + minutes) * 60 * 1000;
}

function createUtcFromRomeLocal(year?, month?, day?, hour?, minute?, second?) {
  const baseUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const firstOffsetMs = getRomeOffsetMs(new Date(baseUtcMs));
  let utcMs = baseUtcMs - firstOffsetMs;
  const secondOffsetMs = getRomeOffsetMs(new Date(utcMs));
  if (secondOffsetMs !== firstOffsetMs) utcMs = baseUtcMs - secondOffsetMs;
  return new Date(utcMs);
}

function getRomeDateTimeParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts: any = fmt.formatToParts(date).reduce((acc?, part?) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(parts.year || 0),
    month: Number(parts.month || 1),
    day: Number(parts.day || 1),
    hour: Number(parts.hour || 0),
    minute: Number(parts.minute || 0),
    second: Number(parts.second || 0),
    weekday: weekdayMap[String(parts.weekday || "Sun")] ?? 0,
  };
}

function getLastSunday21BoundaryMsAtOrBefore(date = new Date()) {
  const nowMs = date instanceof Date ? date.getTime() : Number(date);
  if (!Number.isFinite(nowMs)) return Date.now();
  const p = getRomeDateTimeParts(new Date(nowMs));
  if (p.weekday === 0) {
    const thisSunday21 = createUtcFromRomeLocal(p.year, p.month, p.day, 21, 0, 0).getTime();
    if (nowMs < thisSunday21) {
      return createUtcFromRomeLocal(p.year, p.month, p.day - 7, 21, 0, 0).getTime();
    }
    return thisSunday21;
  }
  return createUtcFromRomeLocal(p.year, p.month, p.day - p.weekday, 21, 0, 0).getTime();
}

function pad2(value?) {
  return String(value).padStart(2, "0");
}

function getTimeParts(date?) {
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false });
  const parts = formatter.formatToParts(date);
  const map: Record<string, any> = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
  };
}

function getWeekKey(date?) {
  const { year, month, day } = getTimeParts(date);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  const dayNr = (utcDate.getUTCDay() + 6) % 7;
  utcDate.setUTCDate(utcDate.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 4));
  const weekNr = 1 + Math.round(((utcDate as any) - (firstThursday as any)) / (7 * 24 * 60 * 60 * 1000));
  return `${utcDate.getUTCFullYear()}-W${pad2(weekNr)}`;
}

function getMinigameRankWeekKeyForPublish(now = new Date()) {
  const boundaryEnd = getLastSunday21BoundaryMsAtOrBefore(now);
  const anchor = new Date(boundaryEnd - 2 * 60 * 60 * 1000);
  return getWeekKey(anchor);
}

/** Chiave ISO della settimana successiva al boundary domenica 21:00 Rome (non getWeekKey(now): di domenica è ancora la settimana chiusa). */
function getNextWeekKeyAfterSunday21Boundary(now = new Date()) {
  const boundaryEnd = getLastSunday21BoundaryMsAtOrBefore(now);
  return getWeekKey(new Date(boundaryEnd + 24 * 60 * 60 * 1000));
}

function getDateKeysForWeekKey(weekKey?) {
  const match = String(weekKey || "").match(/^(\d{4})-W(\d{2})$/);
  if (!match) return [];
  const year = Number(match[1]);
  const isoWeek = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(isoWeek) || isoWeek < 1) return [];
  const jan4Utc = Date.UTC(year, 0, 4, 12, 0, 0);
  const jan4 = new Date(jan4Utc);
  const jan4Day = (jan4.getUTCDay() + 6) % 7;
  const mondayWeek1Utc = jan4Utc - jan4Day * 24 * 60 * 60 * 1000;
  const mondayTargetUtc = mondayWeek1Utc + (isoWeek - 1) * 7 * 24 * 60 * 60 * 1000;
  const out = [];
  for (let i = 0; i < 7; i += 1) {
    const date = new Date(mondayTargetUtc + i * 24 * 60 * 60 * 1000);
    const parts = getTimeParts(date);
    out.push(`${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`);
  }
  return out;
}

function buildLast7DaysHourKeys(endMs?) {
  const keys = [];
  for (let h = 0; h < 24 * 7; h += 1) {
    const d = new Date(endMs - h * 60 * 60 * 1000);
    const parts = getTimeParts(d);
    keys.push(`${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}T${pad2(parts.hour)}`);
  }
  return keys;
}

function daysInCalendarMonthRome(year?, month1to12?) {
  return new Date(year, month1to12, 0).getDate();
}

function buildCalendarMonthHourKeys(year?, month1to12?) {
  const dim = daysInCalendarMonthRome(year, month1to12);
  const keys = [];
  for (let day = 1; day <= dim; day += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      keys.push(`${year}-${pad2(month1to12)}-${pad2(day)}T${pad2(hour)}`);
    }
  }
  return keys;
}

function getPreviousRomeCalendarMonth(anchor = new Date()) {
  const p = getRomeDateTimeParts(anchor);
  let y = p.year;
  let m = p.month;
  if (m <= 1) {
    y -= 1;
    m = 12;
  } else {
    m -= 1;
  }
  return { year: y, month: m };
}

function buildLastHoursHourKeys(endMs?, hours?) {
  const totalHours = Math.max(1, Math.min(24 * 31, Number(hours) || 1));
  const keys = [];
  for (let h = 0; h < totalHours; h += 1) {
    const d = new Date(endMs - h * 60 * 60 * 1000);
    const parts = getTimeParts(d);
    keys.push(`${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}T${pad2(parts.hour)}`);
  }
  return keys;
}

function buildHourKeysBetweenMs(startMs?, endMs?) {
  const from = Number(startMs);
  const to = Number(endMs);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return [];
  const keys = [];
  let cursor = from;
  let guard = 0;
  while (cursor <= to && guard < 72) {
    const parts = getTimeParts(new Date(cursor));
    keys.push(`${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}T${pad2(parts.hour)}`);
    cursor += 60 * 60 * 1000;
    guard += 1;
  }
  const endParts = getTimeParts(new Date(to));
  keys.push(`${endParts.year}-${pad2(endParts.month)}-${pad2(endParts.day)}T${pad2(endParts.hour)}`);
  return [...new Set(keys)];
}

function hourKeyToBoundsMs(hourKey?) {
  const m = String(hourKey || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})$/);
  if (!m) return { startMs: 0, endMs: 0 };
  const start = createUtcFromRomeLocal(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), 0, 0);
  const startMs = start.getTime();
  return { startMs, endMs: startMs + 60 * 60 * 1000 };
}

function overlapRangeMs(rangeStart?, rangeEnd?, clipStart?, clipEnd?) {
  return Math.max(0, Math.min(rangeEnd, clipEnd) - Math.max(rangeStart, clipStart));
}

function buildAnchorDateFromWeekKey(weekKey?) {
  const keys = getDateKeysForWeekKey(weekKey);
  const lastDay = String(keys[keys.length - 1] || "");
  const m = lastDay.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    return createUtcFromRomeLocal(year, month, day, 22, 0, 0);
}

function previousMonthKeyRome(now = new Date()) {
  const p = getPreviousRomeCalendarMonth(now);
  return `${p.year}-${pad2(p.month)}`;
}

export = { TIME_ZONE, createUtcFromRomeLocal, getLastSunday21BoundaryMsAtOrBefore, getWeekKey, getMinigameRankWeekKeyForPublish, getNextWeekKeyAfterSunday21Boundary, buildLast7DaysHourKeys, buildCalendarMonthHourKeys, getPreviousRomeCalendarMonth, buildLastHoursHourKeys, buildHourKeysBetweenMs, hourKeyToBoundsMs, overlapRangeMs, buildAnchorDateFromWeekKey, previousMonthKeyRome };
