const { HOUSES } = require("./hogwartsSortingBank");
const TIME_ZONE = "Europe/Rome";
const PERIOD_CLOSE_HOUR = 21;
const HOGWARTS_HOUSE_POINT_PERIODS = Object.freeze([
  { key: "2026-06-01_2026-06-14", start: "2026-06-01", end: "2026-06-14", label: "1° anno", rangeLabel: "1 – 14 giugno 2026" },
  { key: "2026-06-15_2026-06-28", start: "2026-06-15", end: "2026-06-28", label: "2° anno", rangeLabel: "15 – 28 giugno 2026" },
  { key: "2026-06-29_2026-07-12", start: "2026-06-29", end: "2026-07-12", label: "3° anno", rangeLabel: "29 giugno – 12 luglio 2026" },
  { key: "2026-07-13_2026-07-26", start: "2026-07-13", end: "2026-07-26", label: "4° anno", rangeLabel: "13 – 26 luglio 2026" },
  { key: "2026-07-27_2026-08-09", start: "2026-07-27", end: "2026-08-09", label: "5° anno", rangeLabel: "27 luglio – 9 agosto 2026" },
  { key: "2026-08-10_2026-08-23", start: "2026-08-10", end: "2026-08-23", label: "6° anno", rangeLabel: "10 – 23 agosto 2026" },
  { key: "2026-08-24_2026-08-31", start: "2026-08-24", end: "2026-08-31", label: "7° anno", rangeLabel: "24 – 31 agosto 2026" },
]);
const PERIOD_END_DATES = new Set(HOGWARTS_HOUSE_POINT_PERIODS.map((p) => p.end));

function getRomeOffsetMs(utcDate) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    timeZoneName: "shortOffset",
    hour: "2-digit",
  });
  const zoneName = formatter.formatToParts(utcDate).find((part) => part.type === "timeZoneName")?.value;
  const match = String(zoneName || "GMT+0").match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/i);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return sign * (hours * 60 + minutes) * 60 * 1000;
}

function createUtcFromRomeLocal(year, month, day, hour, minute, second, ms = 0) {
  const baseUtcMs = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  const firstOffsetMs = getRomeOffsetMs(new Date(baseUtcMs));
  let utcMs = baseUtcMs - firstOffsetMs;
  const secondOffsetMs = getRomeOffsetMs(new Date(utcMs));
  if (secondOffsetMs !== firstOffsetMs) utcMs = baseUtcMs - secondOffsetMs;
  return new Date(utcMs);
}

function parseYmd(value) {
  const m = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

function romeStartOfDayMs(ymd) {
  const p = parseYmd(ymd);
  if (!p) return null;
  return createUtcFromRomeLocal(p.year, p.month, p.day, 0, 0, 0, 0).getTime();
}

function romePeriodCloseMs(ymd) {
  const p = parseYmd(ymd);
  if (!p) return null;
  return createUtcFromRomeLocal(p.year, p.month, p.day, PERIOD_CLOSE_HOUR, 0, 0, 0).getTime();
}

function buildPeriodBounds() {
  const rows = [];
  for (let i = 0; i < HOGWARTS_HOUSE_POINT_PERIODS.length; i += 1) {
    const period = HOGWARTS_HOUSE_POINT_PERIODS[i];
    const closeMs = romePeriodCloseMs(period.end);
    const startMs = i === 0 ? romeStartOfDayMs(period.start) : rows[i - 1].endMs;
    if (!Number.isFinite(startMs) || !Number.isFinite(closeMs)) continue;
    rows.push({ period, startMs, endMs: closeMs });
  }
  return rows;
}

let cachedPeriodBounds = null;

function getPeriodBounds() {
  if (!cachedPeriodBounds) cachedPeriodBounds = buildPeriodBounds();
  return cachedPeriodBounds;
}

function resolvePeriodBounds(periodOrKey) {
  const key = typeof periodOrKey === "string" ? periodOrKey : String(periodOrKey?.key || "").trim();
  if (!key) return null;
  return getPeriodBounds().find((row) => row.period.key === key) || null;
}

function dateOnlyMs(value, endOfDay = false) {
  const ymd = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  if (endOfDay && PERIOD_END_DATES.has(ymd)) return romePeriodCloseMs(ymd);
  if (endOfDay) {
    const p = parseYmd(ymd);
    if (!p) return null;
    return createUtcFromRomeLocal(p.year, p.month, p.day, 23, 59, 59, 999).getTime();
  }
  return romeStartOfDayMs(ymd);
}

function housePointPeriodKey(nowMs = Date.now()) {
  const now = Number(nowMs || Date.now());
  const bounds = getPeriodBounds();
  for (const row of bounds) {
    if (now >= row.startMs && now < row.endMs) return row.period;
  }
  const last = bounds[bounds.length - 1];
  if (last && now >= last.startMs && now <= last.endMs) return last.period;
  return null;
}

function housePointPeriodKeyForClose(closeMs) {
  const ms = Number(closeMs);
  if (!Number.isFinite(ms)) return null;
  return housePointPeriodKey(ms - 1) || housePointPeriodKey(ms);
}

function periodEndingOnDate(romeDateKey) {
  const dk = String(romeDateKey || "").trim();
  if (!dk) return null;
  return HOGWARTS_HOUSE_POINT_PERIODS.find((p) => p.end === dk) || null;
}

function periodStartingOnDate(romeDateKey) {
  const dk = String(romeDateKey || "").trim();
  if (!dk) return null;
  return HOGWARTS_HOUSE_POINT_PERIODS.find((p) => p.start === dk) || null;
}

function nextPeriodAfter(period) {
  if (!period?.key) return null;
  const idx = HOGWARTS_HOUSE_POINT_PERIODS.findIndex((p) => p.key === period.key);
  if (idx < 0 || idx >= HOGWARTS_HOUSE_POINT_PERIODS.length - 1) return null;
  return HOGWARTS_HOUSE_POINT_PERIODS[idx + 1];
}

function findHousePointPeriod(periodKey) {
  const key = String(periodKey || "").trim();
  if (!key) return null;
  return HOGWARTS_HOUSE_POINT_PERIODS.find((p) => p.key === key) || null;
}

function rankHousesForPeriod(pointsDoc, periodKey) {
  const byPeriod = pointsDoc?.rawWebhook?.byPeriod && typeof pointsDoc.rawWebhook.byPeriod === "object" ? pointsDoc.rawWebhook.byPeriod : {};
  const row = byPeriod[String(periodKey || "").trim()] || {};
  const ranked = HOUSES.map((houseId) => ({
    houseId,
    points: Math.max(0, Math.floor(Number(row[houseId]) || 0)),
  })).sort((a, b) => b.points - a.points);
  return ranked;
}

module.exports = {
  HOGWARTS_HOUSE_POINT_PERIODS,
  TIME_ZONE,
  PERIOD_CLOSE_HOUR,
  dateOnlyMs,
  romeStartOfDayMs,
  romePeriodCloseMs,
  getPeriodBounds,
  resolvePeriodBounds,
  housePointPeriodKey,
  housePointPeriodKeyForClose,
  periodEndingOnDate,
  periodStartingOnDate,
  nextPeriodAfter,
  findHousePointPeriod,
  rankHousesForPeriod,
};