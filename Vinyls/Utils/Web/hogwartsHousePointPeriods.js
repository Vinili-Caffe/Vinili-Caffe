const { HOUSES } = require("./hogwartsSortingBank");
const HOGWARTS_HOUSE_POINT_PERIODS = Object.freeze([
  { key: "2026-06-01_2026-06-14", start: "2026-06-01", end: "2026-06-14", label: "1° anno", rangeLabel: "1 – 14 giugno 2026" },
  { key: "2026-06-15_2026-06-28", start: "2026-06-15", end: "2026-06-28", label: "2° anno", rangeLabel: "15 – 28 giugno 2026" },
  { key: "2026-06-29_2026-07-12", start: "2026-06-29", end: "2026-07-12", label: "3° anno", rangeLabel: "29 giugno – 12 luglio 2026" },
  { key: "2026-07-13_2026-07-26", start: "2026-07-13", end: "2026-07-26", label: "4° anno", rangeLabel: "13 – 26 luglio 2026" },
  { key: "2026-07-27_2026-08-09", start: "2026-07-27", end: "2026-08-09", label: "5° anno", rangeLabel: "27 luglio – 9 agosto 2026" },
  { key: "2026-08-10_2026-08-23", start: "2026-08-10", end: "2026-08-23", label: "6° anno", rangeLabel: "10 – 23 agosto 2026" },
  { key: "2026-08-24_2026-08-31", start: "2026-08-24", end: "2026-08-31", label: "7° anno", rangeLabel: "24 – 31 agosto 2026" },
]);

function dateOnlyMs(value, endOfDay = false) {
  const s = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const ms = new Date(`${s}T${endOfDay ? "23:59:59.999" : "00:00:00"}`).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function housePointPeriodKey(nowMs = Date.now()) {
  const now = Number(nowMs || Date.now());
  for (const period of HOGWARTS_HOUSE_POINT_PERIODS) {
    const start = dateOnlyMs(period.start, false);
    const end = dateOnlyMs(period.end, true);
    if (Number.isFinite(start) && Number.isFinite(end) && now >= start && now <= end) return period;
  }
  return null;
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

function rankHousesForPeriod(pointsDoc, periodKey) {
  const byPeriod = pointsDoc?.rawWebhook?.byPeriod && typeof pointsDoc.rawWebhook.byPeriod === "object" ? pointsDoc.rawWebhook.byPeriod : {};
  const row = byPeriod[String(periodKey || "").trim()] || {};
  const ranked = HOUSES.map((houseId) => ({
    houseId,
    points: Math.max(0, Math.floor(Number(row[houseId]) || 0)),
  })).sort((a, b) => b.points - a.points);
  return ranked;
}

module.exports = { HOGWARTS_HOUSE_POINT_PERIODS, dateOnlyMs, housePointPeriodKey, periodEndingOnDate, periodStartingOnDate, nextPeriodAfter, rankHousesForPeriod };