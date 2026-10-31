/** Attività: chiavi di giorno, ora e settimana. */
const TIME_ZONE = "Europe/Rome";
const DAY_MS = 24 * 60 * 60 * 1000;

function pad2(value?) {
  return String(value).padStart(2, "0");
}

function getTimeParts(date?) {
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", });
  const parts = formatter.formatToParts(date);
  const map: Record<string, any> = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    weekday: map.weekday,
  };
}

function getDayKey(date?) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const map: Record<string, any> = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return `${map.year}-${map.month}-${map.day}`;
}

function getHourKey(date?) {
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false, });
  const parts = formatter.formatToParts(date);
  const map: Record<string, any> = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return `${map.year}-${map.month}-${map.day}T${map.hour}`;
}

function getLastNDaysKeys(days?) {
  const safeDays = Math.max(1, Math.min(31, Number(days || 7)));
  const keys = [];
  const now = new Date();
  for (let i = 0; i < safeDays; i += 1) {
    const d = new Date(now.getTime() - i * DAY_MS);
    keys.push(getDayKey(d));
  }
  return keys;
}

function getLastNHourKeys(hours?) {
  const safeHours = Math.max(1, Math.min(24 * 31, Number(hours || 24)));
  const keys = [];
  const now = new Date();
  for (let i = 0; i < safeHours; i += 1) {
    const d = new Date(now.getTime() - i * 60 * 60 * 1000);
    keys.push(getHourKey(d));
  }
  return keys;
}

function getHourKeysBetween(startDate?, endDate?) {
  const startMs = new Date(startDate).getTime();
  let endMs = new Date(endDate).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return getLastNHourKeys(24 * 7);
  endMs = Math.min(endMs, Date.now());
  if (endMs <= startMs) return [];
  const keys = [];
  let t = Math.floor(startMs / 3_600_000) * 3_600_000;
  const hardCap = 24 * 10;
  while (t < endMs && keys.length < hardCap) {
    keys.push(getHourKey(new Date(t)));
    t += 3_600_000;
  }
  return keys;
}

function getDayKeysBetween(startDate?, endDate?) {
  const startMs = new Date(startDate).getTime();
  let endMs = new Date(endDate).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return getLastNDaysKeys(7);
  endMs = Math.min(endMs, Date.now());
  if (endMs <= startMs) return [];
  const keys = [];
  let t = startMs;
  const hardCap = 14;
  while (t < endMs && keys.length < hardCap) {
    keys.push(getDayKey(new Date(t)));
    t += DAY_MS;
  }
    return Array.from(new Set(keys));
}

function secondsOverlappingRange(startedAt?, rangeStartMs?, rangeEndMs?, nowMs = Date.now()) {
  const start = startedAt instanceof Date ? startedAt.getTime() : new Date(startedAt).getTime();
  if (!Number.isFinite(start)) return 0;
  const from = Math.max(start, rangeStartMs);
  const to = Math.min(nowMs, rangeEndMs);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return 0;
  return Math.max(0, Math.floor((to - from) / 1000));
}

function expandDateKeysToHourKeys(dateKeys = []) {
  const out = [];
  for (const raw of dateKeys || []) {
    const dk = String(raw || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dk)) continue;
    for (let h = 0; h < 24; h += 1) out.push(`${dk}T${pad2(h)}`);
  }
  return out;
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

function getDayBoundsForDateKey(dateKey?) {
  const match = String(dateKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]) - 1;
  const d = Number(match[3]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const baseMs = Date.UTC(y, m, d, 0, 0, 0, 0);
  const hourMs = 60 * 60 * 1000;
  let startMs = null;
  for (let offset = -24; offset <= 48; offset += 1) {
    const ms = baseMs + offset * hourMs;
    if (getDayKey(new Date(ms)) === dateKey) {
      startMs = ms;
      break;
    }
  }
  if (startMs == null) return null;
  let endMs = startMs + DAY_MS;
  for (let offset = 1; offset <= 48; offset += 1) {
    const ms = startMs + offset * hourMs;
    if (getDayKey(new Date(ms)) !== dateKey) {
      endMs = ms;
      break;
    }
  }
  return { startMs, endMs };
}

export = { DAY_MS, getDayKey, getHourKey, getLastNDaysKeys, getLastNHourKeys, getHourKeysBetween, getDayKeysBetween, secondsOverlappingRange, expandDateKeysToHourKeys, getWeekKey, getDayBoundsForDateKey };
