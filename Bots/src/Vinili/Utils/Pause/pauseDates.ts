/** Pause: date in ora di Roma, festivi e giorni di pausa. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const PAUSE_FESTIVI_TIMEZONE = "Europe/Rome";

function getRomeDateKey(date?) {
  if (!date || !date.getTime) return "";
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: PAUSE_FESTIVI_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = formatter.formatToParts(date);
  const year = parts.find((p?) => p.type === "year")?.value;
  const month = parts.find((p?) => p.type === "month")?.value;
  const day = parts.find((p?) => p.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : "";
}

function getRomeDayStartUtcMs(dayUtc?) {
  if (!dayUtc || !Number.isFinite(dayUtc.getTime?.())) return null;
  const y = dayUtc.getUTCFullYear();
  const m = dayUtc.getUTCMonth();
  const d = dayUtc.getUTCDate();
  const targetKey = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  let lo = Date.UTC(y, m, d) - 14 * 60 * 60 * 1000;
  let hi = Date.UTC(y, m, d) + 14 * 60 * 60 * 1000;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (getRomeDateKey(new Date(mid)) >= targetKey) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

function getEasterSunday(year?) {
  const y = Number(year);
  if (!Number.isFinite(y)) return null;
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { year: y, month, day };
}

function getFestiviSetForYear(year?) {
  const set = new Set();
  const y = Number(year);
  if (!Number.isFinite(y)) return set;
  const pad = (n?) => String(n).padStart(2, "0");
  set.add(`${y}-12-24`);
  set.add(`${y}-12-25`);
  set.add(`${y}-12-26`);
  set.add(`${y}-12-31`);
  set.add(`${y}-01-01`);
    set.add(`${y}-04-25`);
  set.add(`${y}-05-01`);
  set.add(`${y}-06-02`);
  set.add(`${y}-08-15`);
  const pasqua = getEasterSunday(y);
  if (pasqua) {
    set.add(`${y}-${pad(pasqua.month)}-${pad(pasqua.day)}`);
    const pasquetta = new Date(y, pasqua.month - 1, pasqua.day + 1);
    set.add(`${pasquetta.getFullYear()}-${pad(pasquetta.getMonth() + 1)}-${pad(pasquetta.getDate())}`);
  }
  return set;
}

function countFestiviInRange(start?, end?) {
  if (!start || !end || end < start) return 0;
  let count = 0;
  const startUtc = start.getTime();
  const endUtc = end.getTime();
  for (let t = startUtc; t <= endUtc; t += MS_PER_DAY) {
    const date = new Date(t);
    const key = getRomeDateKey(date);
    if (!key) continue;
    const y = parseInt(key.slice(0, 4), 10);
    if (getFestiviSetForYear(y).has(key)) count += 1;
  }
  return count;
}

function parseItalianDate(value?) {
  if (!value || typeof value !== "string") return null;
  const raw = value.trim();
  let match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  let day = null;
  let month = null;
  let year = null;
  if (match) {
    day = Number(match[1]);
    month = Number(match[2]);
    year = Number(match[3]);
  } else {
    match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return null;
  return date;
}

function getPauseDaysBetween(startRaw?, endRaw?) {
  const start = parseItalianDate(startRaw);
  const end = parseItalianDate(endRaw);
  if (!start || !end || end < start) return null;
  return Math.floor(((end as any) - (start as any)) / MS_PER_DAY) + 1;
}

function getTodayUtc() {
  const key = getRomeDateKey(new Date());
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ""));
  if (match) {
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  }
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function getCurrentYearBoundsUtc() {
  const now = getTodayUtc();
  const year = now.getUTCFullYear();
  return {
    yearStart: new Date(Date.UTC(year, 0, 1)),
    yearEnd: new Date(Date.UTC(year, 11, 31)),
  };
}

function countOverlapDays(start?, end?, windowStart?, windowEnd?) {
  if (!start || !end || end < start) return 0;
  const overlapStart = start > windowStart ? start : windowStart;
  const overlapEnd = end < windowEnd ? end : windowEnd;
  if (overlapEnd < overlapStart) return 0;
  return Math.floor((overlapEnd - overlapStart) / MS_PER_DAY) + 1;
}

function countEffectiveOverlapDays(start?, end?, windowStart?, windowEnd?) {
  const raw = countOverlapDays(start, end, windowStart, windowEnd);
  if (raw === 0) return 0;
  const overlapStart = start > windowStart ? start : windowStart;
  const overlapEnd = end < windowEnd ? end : windowEnd;
  const festivi = countFestiviInRange(overlapStart, overlapEnd);
  return Math.max(0, raw - festivi);
}

function rangesOverlap(startA?, endA?, startB?, endB?) {
  if (!startA || !endA || !startB || !endB) return false;
  return startA <= endB && startB <= endA;
}

function getMonthBoundsUtc(year?, month?) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
  return {
    monthStart: new Date(Date.UTC(y, m - 1, 1)),
    monthEnd: new Date(Date.UTC(y, m, 0, 23, 59, 59, 999)),
  };
}

function filterPausesByMonth(pauses?, year?, month?) {
  const bounds = getMonthBoundsUtc(year, month);
  if (!bounds || !Array.isArray(pauses)) return [];
  return pauses.filter((pause?) => {
    const start = parseItalianDate(pause?.dataRichiesta);
    const end = parseItalianDate(pause?.dataRitorno);
    return start && end && countOverlapDays(start, end, bounds.monthStart, bounds.monthEnd) > 0;
  });
}

function getRomeMonthKey(date?) {
  if (!date || !date.getTime) return null;
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit" });
  const parts = formatter.formatToParts(date);
  const year = parts.find((p?) => p.type === "year")?.value;
  const month = parts.find((p?) => p.type === "month")?.value;
  if (!year || !month) return null;
  return { year: Number(year), month: Number(month) };
}

function getRomeDateParts(date?) {
  if (!date || !date.getTime) return null;
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = formatter.formatToParts(date);
  const year = parts.find((p?) => p.type === "year")?.value;
  const month = parts.find((p?) => p.type === "month")?.value;
  const day = parts.find((p?) => p.type === "day")?.value;
  if (!year || !month || !day) return null;
  return { year: Number(year), month: Number(month), day: Number(day) };
}

function getMonthKeyForPauseCount(dataRichiesta?, dataRitorno?) {
  const start = parseItalianDate(dataRichiesta);
  const end = parseItalianDate(dataRitorno);
  if (!start || !end) return null;
  const startKey = getRomeMonthKey(start);
  const endKey = getRomeMonthKey(end);
  if (!startKey || !endKey) return null;
  if (startKey.year === endKey.year && startKey.month === endKey.month) return startKey;
  const endParts = getRomeDateParts(end);
  if (!endParts) return startKey;
  if (endParts.day <= 5) return startKey;
  return endKey;
}

function getStaffWeekKeyNow(now = new Date()) {
  const { getStaffWeekKeyNow: resolveWeekKey } = require("../Staff/stafferDellaSettimanaWeekKey") as typeof import("../Staff/stafferDellaSettimanaWeekKey");
  return resolveWeekKey(now);
}

function coerceMonthKey(raw?) {
  const { coerceMonthKey: coerce } = require("../Staff/stafferDellaSettimanaWeekKey") as typeof import("../Staff/stafferDellaSettimanaWeekKey");
  return coerce(raw);
}

export = { MS_PER_DAY, getRomeDayStartUtcMs, parseItalianDate, getPauseDaysBetween, getTodayUtc, getCurrentYearBoundsUtc, countOverlapDays, countEffectiveOverlapDays, rangesOverlap, filterPausesByMonth, getMonthKeyForPauseCount, getStaffWeekKeyNow, coerceMonthKey };
