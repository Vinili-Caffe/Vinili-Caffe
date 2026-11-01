/** Resoconti settimanali: date e finestre della settimana in ora di Roma. */
const TIME_ZONE = "Europe/Rome";
const RESOCONTO_CLOSE_HOUR_ROME = 20;

function wait(ms?) {
  return new Promise((resolve?) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

function getRomeDateParts(date?) {
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", });
  const parts = formatter.formatToParts(date);
  const out: Record<string, any> = {};
  for (const part of parts) {
    if (part.type !== "literal") out[part.type] = part.value;
  }
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
  };
}

function getRomeOffsetMs(utcDate?) {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, timeZoneName: "shortOffset", hour: "2-digit", });
  const timeZoneName = formatter.formatToParts(utcDate).find((part?) => part.type === "timeZoneName")?.value;

  const match = String(timeZoneName || "GMT+0").match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/i,);
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
  if (secondOffsetMs !== firstOffsetMs) {
    utcMs = baseUtcMs - secondOffsetMs;
  }
  return new Date(utcMs);
}

function parseRomeWallClock(referenceDate?) {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = f.formatToParts(referenceDate);
  const o: Record<string, any> = {};
  for (const x of parts) {
    if (x.type !== "literal") o[x.type] = x.value;
  }
  return {
    year: Number(o.year),
    month: Number(o.month),
    day: Number(o.day),
    weekday: String(o.weekday || "").replace(/\.$/, ""),
    hour: Number(o.hour),
    minute: Number(o.minute),
  };
}

function addDaysToRomeYmd(year?, month?, day?, deltaDays?) {
  const mid = createUtcFromRomeLocal(year, month, day, 12, 0, 0);
  return getRomeDateParts(new Date(mid.getTime() + deltaDays * 86400000));
}

function getResocontoClosingSundayUtc(referenceNow = new Date()) {
  const r = parseRomeWallClock(referenceNow);
  const wdMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const w = wdMap[r.weekday];
  const H = RESOCONTO_CLOSE_HOUR_ROME;
  if (w == null) {
    return createUtcFromRomeLocal(r.year, r.month, r.day, H, 0, 0);
  }

  let sunY = r.year;
  let sunM = r.month;
  let sunD = r.day;

  if (w === 0) {
    const thisSunClose = createUtcFromRomeLocal(r.year, r.month, r.day, H, 0, 0);
    if (referenceNow.getTime() < thisSunClose.getTime()) {
      const prev = addDaysToRomeYmd(r.year, r.month, r.day, -7);
      sunY = prev.year;
      sunM = prev.month;
      sunD = prev.day;
    }
  } else {
    const prev = addDaysToRomeYmd(r.year, r.month, r.day, -w);
    sunY = prev.year;
    sunM = prev.month;
    sunD = prev.day;
  }

  return createUtcFromRomeLocal(sunY, sunM, sunD, H, 0, 0);
}

function getPartnerLeaderboardWeekBoundsUtc(now = new Date()) {
  const r = parseRomeWallClock(now);
  const daysFromMonday = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[r.weekday] ?? 0;
  const monParts = addDaysToRomeYmd(r.year, r.month, r.day, -daysFromMonday);
  const weekStart = createUtcFromRomeLocal(monParts.year, monParts.month, monParts.day, 0, 0, 0);
  const nextMonParts = addDaysToRomeYmd(monParts.year, monParts.month, monParts.day, 7);
  const weekEndExclusive = createUtcFromRomeLocal(
    nextMonParts.year,
    nextMonParts.month,
    nextMonParts.day,
    0,
    0,
    0,
  );
  return { weekStart, weekEndExclusive };
}

function getCurrentResocontoPexWeekWindowUtc(referenceNow = new Date()) {
  const r = parseRomeWallClock(referenceNow);
  const wdMap = { Sun: 6, Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5 };
  const daysFromMonday = wdMap[r.weekday] ?? 0;
  const monParts = addDaysToRomeYmd(r.year, r.month, r.day, -daysFromMonday);
  const sunParts = addDaysToRomeYmd(monParts.year, monParts.month, monParts.day, 6);
  return {
    windowStart: createUtcFromRomeLocal(monParts.year, monParts.month, monParts.day, 0, 0, 0),
    windowEndExclusive: createUtcFromRomeLocal(
      sunParts.year,
      sunParts.month,
      sunParts.day,
      RESOCONTO_CLOSE_HOUR_ROME,
      0,
      0,
    ),
  };
}

function getPmResocontoWindow(now = new Date()) {
    const { windowStart, windowEndExclusive } = getCurrentResocontoPexWeekWindowUtc(now);
  const endCap = new Date(windowEndExclusive.getTime() - 2 * 60 * 1000);
  if (now.getTime() >= windowEndExclusive.getTime()) {
    return { weekStart: windowStart, weekEnd: endCap };
  }
  const weekEnd = now.getTime() < endCap.getTime() ? now : endCap;
  return { weekStart: windowStart, weekEnd };
}

function getStaffResocontoEvaluationWindow(now = new Date()) {
  const { weekStart, weekEnd } = getPmResocontoWindow(now);
  const r = parseRomeWallClock(now);
  if (r.weekday !== "Sun") return { weekStart, weekEnd };
  const currentMinutes = Number(r.hour || 0) * 60 + Number(r.minute || 0);
  const closeMinutes = RESOCONTO_CLOSE_HOUR_ROME * 60 + 1;
  if (currentMinutes < closeMinutes) return { weekStart, weekEnd };
  const romeToday = getRomeDateParts(now);
  const thisSundayCloseStart = createUtcFromRomeLocal(
    romeToday.year,
    romeToday.month,
    romeToday.day,
    RESOCONTO_CLOSE_HOUR_ROME,
    1,
    0,
  );
  return {
    weekStart: new Date(thisSundayCloseStart.getTime() - 7 * 24 * 60 * 60 * 1000),
    weekEnd: new Date(thisSundayCloseStart.getTime() - 2 * 60 * 1000),
  };
}

function getWeekStartDate(now = new Date()) {
  const date = new Date(now);
  date.setDate(date.getDate() - 7);
  return date;
}

function dayKeyToWeekdayLabel(dayKey?) {
  if (!dayKey || typeof dayKey !== "string") return "?";
  const [y, m, d] = dayKey.split("-").map(Number);
  if (!y || !m || !d) return "?";
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const formatter = new Intl.DateTimeFormat("it-IT", { timeZone: TIME_ZONE, weekday: "short" });
  return formatter.format(date).replace(".", "").slice(0, 3);
}

function parseItalianDate(value?) {
  if (!value || typeof value !== "string") return null;
  const m = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  if (!Number.isFinite(d) || !Number.isFinite(mo) || !Number.isFinite(y)) return null;
  const date = createUtcFromRomeLocal(y, mo, d, 0, 0, 0);
  const chk = getRomeDateParts(date);
  if (chk.year !== y || chk.month !== mo || chk.day !== d) return null;
  return date;
}

function getRomeStartOfDayUtc(reference = new Date()) {
  const p = getRomeDateParts(reference);
  return createUtcFromRomeLocal(p.year, p.month, p.day, 0, 0, 0);
}

function resolveResocontoWeekKey(now = new Date()) {
  const pexSkipWindow = getCurrentResocontoPexWeekWindowUtc(now);
  const closingPartsForResocontoKey = getRomeDateParts(pexSkipWindow.windowEndExclusive);
  return `${closingPartsForResocontoKey.year}-${String(closingPartsForResocontoKey.month).padStart(2, "0")}-${String(closingPartsForResocontoKey.day).padStart(2, "0")}`;
}

function getResocontoWeekRangeFromWeekKey(weekKey?) {
  const raw = String(weekKey || "").trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  const sundayStart = createUtcFromRomeLocal(y, mo, d, 0, 0, 0);
  const weekStart = new Date(sundayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
  const weekEnd = createUtcFromRomeLocal(y, mo, d, RESOCONTO_CLOSE_HOUR_ROME, 0, 0);
  return { weekStart, weekEnd };
}

function formatThreadDateTime(value?) {
  const when = value instanceof Date ? value : new Date(value);
  if (!when || Number.isNaN(when.getTime())) return null;
  return when.toLocaleString("it-IT", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export = { TIME_ZONE, wait, getRomeDateParts, createUtcFromRomeLocal, parseRomeWallClock, addDaysToRomeYmd, getResocontoClosingSundayUtc, getPartnerLeaderboardWeekBoundsUtc, getCurrentResocontoPexWeekWindowUtc, getPmResocontoWindow, getStaffResocontoEvaluationWindow, getWeekStartDate, dayKeyToWeekdayLabel, parseItalianDate, getRomeStartOfDayUtc, resolveResocontoWeekKey, getResocontoWeekRangeFromWeekKey, formatThreadDateTime };
