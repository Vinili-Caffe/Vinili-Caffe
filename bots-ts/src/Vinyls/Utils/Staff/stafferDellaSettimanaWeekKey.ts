"use strict";

const TIME_ZONE = "Europe/Rome";

function pad2(n?) {
  return String(n).padStart(2, "0");
}

function getRomeOffsetMs(utcDate?) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    timeZoneName: "shortOffset",
    hour: "2-digit",
  });
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

function getRomeDateTimeParts(date?) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  const parts: Record<string, any> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(parts.year || 1970),
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

function getIsoWeekKeyFromYmd(year?, month?, day?) {
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  const dayNr = (utcDate.getUTCDay() + 6) % 7;
  utcDate.setUTCDate(utcDate.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 4));
  const weekNr = 1 + Math.round(((utcDate as any) - (firstThursday as any)) / (7 * 24 * 60 * 60 * 1000));
  return `${utcDate.getUTCFullYear()}-W${pad2(weekNr)}`;
}

/** Giovedì ISO della settimana (stesso bridge dei compiti: mese = mese del giovedì). */
function isoWeekThursdayUtc(isoYear?, isoWeek?) {
  const y = Math.floor(Number(isoYear) || 0);
  const w = Math.floor(Number(isoWeek) || 0);
  if (!y || w < 1 || w > 53) return null;
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - day + 1 + (w - 1) * 7);
  const thursday = new Date(monday);
  thursday.setUTCDate(monday.getUTCDate() + 3);
  return thursday;
}

function monthKeyForStaffWeekKey(weekKey?) {
  const m = /^(\d{4})-W(\d{2})$/.exec(String(weekKey || "").trim());
  if (!m) return "";
  const thu = isoWeekThursdayUtc(Number(m[1]), Number(m[2]));
  if (!thu) return "";
  return `${thu.getUTCFullYear()}-${pad2(thu.getUTCMonth() + 1)}`;
}

function formatRomeMonthKey(date = new Date()) {
  if (!date || !date.getTime) return "";
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((p?) => p.type === "year")?.value;
  const month = parts.find((p?) => p.type === "month")?.value;
  if (!year || !month) return "";
  return `${year}-${month}`;
}

function coerceMonthKey(raw?) {
  if (raw && typeof raw === "object") {
    const y = Number(raw.year);
    const mo = Number(raw.month);
    if (Number.isFinite(y) && y >= 1970 && Number.isFinite(mo) && mo >= 1 && mo <= 12) {
      return `${y}-${pad2(mo)}`;
    }
  }
  const s = String(raw || "").trim();
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  return "";
}

/**
 * Mese del bonus Staffer: mese del giovedì della weekKey (non il giorno di grant).
 * Così una settimana a cavallo tra due mesi non perde il bonus al 1°.
 */
function resolveStafferBonusMonthKey({ weekKey = "", monthKey = "", now = new Date() } = {}) {
  return (
    coerceMonthKey(monthKey) ||
    monthKeyForStaffWeekKey(weekKey) ||
    formatRomeMonthKey(now instanceof Date ? now : new Date())
  );
}

/** Mese “compiti/staffer” della data: giovedì ISO della settimana Rome di quel giorno. */
function monthKeyForRomeDateViaIsoWeek(date = new Date()) {
  const p = getRomeDateTimeParts(date instanceof Date ? date : new Date());
  const wk = getIsoWeekKeyFromYmd(p.year, p.month, p.day);
  return monthKeyForStaffWeekKey(wk) || formatRomeMonthKey(date instanceof Date ? date : new Date());
}

/** Week key della fascia Staffer della settimana (ancora: ultima domenica 21 Europe/Rome). */
function getStaffWeekKeyNow(now = new Date()) {
  const boundary = getLastSunday21BoundaryMsAtOrBefore(now);
  const p = getRomeDateTimeParts(new Date(boundary + 60 * 60 * 1000));
  return getIsoWeekKeyFromYmd(p.year, p.month, p.day);
}

export = {
  TIME_ZONE,
  getStaffWeekKeyNow,
  getLastSunday21BoundaryMsAtOrBefore,
  createUtcFromRomeLocal,
  monthKeyForStaffWeekKey,
  formatRomeMonthKey,
  coerceMonthKey,
  resolveStafferBonusMonthKey,
  monthKeyForRomeDateViaIsoWeek,
};
