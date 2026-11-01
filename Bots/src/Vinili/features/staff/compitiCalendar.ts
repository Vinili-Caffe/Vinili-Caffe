/** Compiti staff: settimane e mesi in ora di Roma, scadenze della domenica. */
function isoWeekThursdayUtc(year?, week?) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const day = jan4.getUTCDay() || 7;
  const thursday = new Date(jan4);
  thursday.setUTCDate(jan4.getUTCDate() - day + 1 + (week - 1) * 7 + 3);
  return thursday;
}

/** Quante settimane ISO (giovedì in mese) ci sono in YYYY-MM — tipicamente 4 o 5, a volte 3. */
function isoWeeksInMonthKey(monthKey?) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(monthKey || ""));
  if (!m) return 4;
  const year = Number(m[1]);
  const month = Number(m[2]); // 1-12
  let count = 0;
  // ISO weeks can spill across years; scan previous year week 48..53 and current 1..53
  for (const y of [year - 1, year]) {
    for (let w = 1; w <= 53; w++) {
      const thu = isoWeekThursdayUtc(y, w);
      if (thu.getUTCFullYear() === year && thu.getUTCMonth() + 1 === month) count += 1;
    }
  }
  return Math.max(3, Math.min(6, count || 4));
}

function romeParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type?) => {
    const hit = parts.find((p?) => p.type === type);
    return hit ? hit.value : "";
  };
  return {
    y: Number(get("year")) || 0,
    m: Number(get("month")) || 0,
    d: Number(get("day")) || 0,
    weekday: String(get("weekday") || ""),
    hour: Number(get("hour")) || 0,
    minute: Number(get("minute")) || 0,
  };
}

function currentRomeIsoWeekKey(date = new Date()) {
  const { y, m, d } = romeParts(date);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((utc as any) - (yearStart as any)) / 86400000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function romeMonthKey(date = new Date()) {
  const { y, m } = romeParts(date);
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** Sunday 18:00 Europe/Rome of the ISO week containing `date`. */
function sundaySubmitDeadlineMs(date = new Date()) {
  const { y, m, d } = romeParts(date);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const dayNum = utc.getUTCDay() || 7; // Mon=1..Sun=7
  const toSun = 7 - dayNum;
  utc.setUTCDate(utc.getUTCDate() + toSun);
  // Interpret as Rome local Sunday 18:00 via formatter offset approximation:
  // Build ISO string as Rome wall time then parse with offset from formatter.
  const ymd = `${utc.getUTCFullYear()}-${String(utc.getUTCMonth() + 1).padStart(2, "0")}-${String(utc.getUTCDate()).padStart(2, "0")}`;
  return romeWallTimeToUtcMs(ymd, 18, 0);
}

/** Sunday 24:00 Rome = Monday 00:00 Rome after that Sunday. */
function sundayReviewDeadlineMs(date = new Date()) {
  const submit = sundaySubmitDeadlineMs(date);
  // +6 hours from 18:00 → 24:00
  return submit + 6 * 60 * 60 * 1000;
}

function romeWallTimeToUtcMs(ymd?, hour?, minute?) {
  // Use iterative approach: guess UTC and adjust to match Rome wall clock
  let guess = Date.parse(`${ymd}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+01:00`);
  if (!Number.isFinite(guess)) guess = Date.parse(`${ymd}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`);
  for (let i = 0; i < 4; i++) {
    const p = romeParts(new Date(guess));
    const want = `${ymd} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    const got = `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")} ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
    if (want === got) return guess;
    const wantMs = Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)), hour, minute);
    const gotMs = Date.UTC(p.y, p.m - 1, p.d, p.hour, p.minute);
    guess += wantMs - gotMs;
  }
  return guess;
}

function weekKeysInRomeMonth(monthKey?) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(monthKey || ""));
  if (!m) return [];
  const year = Number(m[1]);
  const month = Number(m[2]);
  const keys = [];
  for (const y of [year - 1, year]) {
    for (let w = 1; w <= 53; w++) {
      const thu = isoWeekThursdayUtc(y, w);
      if (thu.getUTCFullYear() === year && thu.getUTCMonth() + 1 === month) {
        keys.push(`${y}-W${String(w).padStart(2, "0")}`);
      }
    }
  }
  keys.sort();
  return keys;
}

function prevRomeMonthKey(monthKey?) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(monthKey || ""));
  if (!m) return "";
  let y = Number(m[1]);
  let mo = Number(m[2]) - 1;
  if (mo < 1) {
    mo = 12;
    y -= 1;
  }
  return `${y}-${String(mo).padStart(2, "0")}`;
}

function monthKeyForWeekKey(weekKey?) {
  const m = /^(\d{4})-W(\d{2})$/.exec(String(weekKey || ""));
  if (!m) return "";
  const thursday = isoWeekThursdayUtc(Number(m[1]), Number(m[2]));
  return `${thursday.getUTCFullYear()}-${String(thursday.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** compitiMonthBridge1: mese compiti = mese del giovedì ISO (non calendario Rome).
 *  Evita buco nell'ultima settimana che contiene già il 1° del mese successivo. */
function compitiActiveMonthKey(weekKey = "") {
  const wk = String(weekKey || currentRomeIsoWeekKey() || "").trim();
  return monthKeyForWeekKey(wk) || romeMonthKey();
}

function dateKeysForIsoWeekKey(weekKey?) {
  const m = /^(\d{4})-W(\d{2})$/.exec(String(weekKey || ""));
  if (!m) return [];
  const year = Number(m[1]);
  const week = Number(m[2]);
  const thu = isoWeekThursdayUtc(year, week);
  const monday = new Date(thu);
  monday.setUTCDate(thu.getUTCDate() - 3);
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    out.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`,
    );
  }
  return out;
}

function deadlinesPayload(now = new Date()) {
  const submitMs = sundaySubmitDeadlineMs(now);
  const reviewMs = sundayReviewDeadlineMs(now);
  return {
    submitDeadlineMs: submitMs,
    reviewDeadlineMs: reviewMs,
    submitOpen: Date.now() < submitMs,
    reviewOpen: Date.now() < reviewMs,
  };
}

export = { isoWeeksInMonthKey, currentRomeIsoWeekKey, romeMonthKey, sundaySubmitDeadlineMs, sundayReviewDeadlineMs, weekKeysInRomeMonth, prevRomeMonthKey, monthKeyForWeekKey, compitiActiveMonthKey, dateKeysForIsoWeekKey, deadlinesPayload };
