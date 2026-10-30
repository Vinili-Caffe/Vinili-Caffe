/** Date degli eventi (Halloween, Star Wars…): "2026-11-02T12:00:00" letto come ora di Roma → millisecondi.
    Era in hogwartsSortingConfig (evento Hogwarts, ora in Bots/archivio). */
function getRomeOffsetMs(utcDate?) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Rome",
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

function createUtcFromRomeLocal(year?, month?, day?, hour?, minute?, second?, ms = 0) {
  const baseUtcMs = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  const firstOffsetMs = getRomeOffsetMs(new Date(baseUtcMs));
  let utcMs = baseUtcMs - firstOffsetMs;
  const secondOffsetMs = getRomeOffsetMs(new Date(utcMs));
  if (secondOffsetMs !== firstOffsetMs) utcMs = baseUtcMs - secondOffsetMs;
  return new Date(utcMs);
}

function parseEventLocalParts(value?) {
  const d = String(value || "").trim();
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/);
  if (!m) return null;
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: m[4] !== undefined ? Number(m[4]) : null,
    minute: m[5] !== undefined ? Number(m[5]) : 0,
    second: m[6] !== undefined ? Number(m[6]) : 0,
    ms: m[7] !== undefined ? Number(String(m[7]).padEnd(3, "0")) : 0,
  };
}

function parseFallbackTimeParts(fallbackTime?) {
  const m = String(fallbackTime || "00:00:00").match(/(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?/);
  if (!m) return { hour: 0, minute: 0, second: 0, ms: 0 };
  return {
    hour: Number(m[1] || 0),
    minute: Number(m[2] || 0),
    second: Number(m[3] || 0),
    ms: m[4] !== undefined ? Number(String(m[4]).padEnd(3, "0")) : 0,
  };
}

function parseEventDateMs(value?, timezone?, fallbackTime?) {
  const parts = parseEventLocalParts(value);
  if (!parts) return null;
  const fb = parseFallbackTimeParts(fallbackTime);
  const hour = parts.hour !== null ? parts.hour : fb.hour;
  const minute = parts.hour !== null ? parts.minute : fb.minute;
  const second = parts.hour !== null ? parts.second : fb.second;
  const ms = parts.hour !== null ? parts.ms : fb.ms;
  const tz = String(timezone || "Europe/Rome").trim() || "Europe/Rome";
  try {
    if (tz === "Europe/Rome") {
      const utc = createUtcFromRomeLocal(parts.year, parts.month, parts.day, hour, minute, second, ms);
      const out = utc.getTime();
      return Number.isFinite(out) ? out : null;
    }
    const normalized =
      parts.hour !== null
        ? `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}.${String(ms).padStart(3, "0")}`
        : `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}T${String(fb.hour).padStart(2, "0")}:${String(fb.minute).padStart(2, "0")}:${String(fb.second).padStart(2, "0")}.${String(fb.ms).padStart(3, "0")}`;
    const out = new Date(normalized).getTime();
    return Number.isFinite(out) ? out : null;
  } catch {
    return null;
  }
}

/** Data "2026-11-02" o "2026-11-02 12:00" nell'ora del server (fallbackTime se manca l'ora). */
function parseScheduleMs(value?, fallbackTime = "12:00:00") {
  const d = String(value || "").trim();
  if (!d) return null;
  if (/^d{4}-d{2}-d{2}$/.test(d)) {
    const ms = new Date(`${d}T${fallbackTime}`).getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  const normalized = d.includes("T") || /sd{2}:d{2}/.test(d) ? d.replace(/s+/, "T") : `${d}T${fallbackTime}`;
  const ms = new Date(normalized).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Fine giornata di una data "AAAA-MM-GG": il giorno dopo all'ora endHour (default 10). */
function addDaysYmd(ymd?, days?) {
  const base = new Date(`${ymd}T12:00:00`);
  if (!Number.isFinite(base.getTime())) return "";
  base.setDate(base.getDate() + days);
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, "0");
  const day = String(base.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseScheduleEndMs(value?, options: Record<string, any> = {}) {
  const endHour = Number.isFinite(Number(options.endHour)) ? Number(options.endHour) : 10;
  const hourStr = `${String(Math.floor(endHour)).padStart(2, "0")}:00:00`;
  const d = String(value || "").trim();
  if (!d) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const nextDay = addDaysYmd(d, 1);
    if (!nextDay) return null;
    const ms = new Date(`${nextDay}T${hourStr}`).getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  return parseScheduleMs(d, hourStr);
}

export = { parseEventDateMs, parseScheduleMs, parseScheduleEndMs };
