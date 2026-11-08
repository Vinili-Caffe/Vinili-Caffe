const { getBotState, setBotState } = require("../../../shared/botState/botStateStore") as typeof import("../../../shared/botState/botStateStore");
const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const TIME_ZONE = "Europe/Rome";
const FINAL_ANNOUNCE_FRIDAY_WEEKDAY = 5;
const FINAL_ANNOUNCE_FRIDAY_HOUR = 21;
const FINAL_ANNOUNCE_SATURDAY_HOUR = 12;
const MOVIE_NIGHT_FILM_HOUR = 21;
const MOVIE_NIGHT_FILM_MINUTE = 0;
const MOVIE_NIGHT_EVENT_ADVANCE_MINUTES = 15;
const MOVIE_NIGHT_EVENT_WINDOW_BEFORE_MIN = 5;
const MOVIE_NIGHT_EVENT_WINDOW_AFTER_MIN = 10;
const MOVIE_NIGHT_DISPLAY_TIME = `${String(MOVIE_NIGHT_FILM_HOUR).padStart(2, "0")}:${String(MOVIE_NIGHT_FILM_MINUTE).padStart(2, "0")}`;
const MOVIE_NIGHT_CLOSING_LINE_FRIDAY = `> ${E.VC_Rocket} Ci vediamo domani! E ricorda: chi partecipa all'evento in vocale riceverà il **doppio** degli **XP** validi per la top weekly. Non mancare!`;
const MOVIE_NIGHT_CLOSING_LINE_SATURDAY = `> ${E.VC_Rocket} Ci vediamo stasera! E ricorda: chi partecipa all'evento in vocale riceverà il **doppio** degli **XP** validi per la top weekly. Non mancare!`;
const MOVIE_NIGHT_CLOSING_LINE_STARWARS = `> ${E.VC_Rocket} Durante tutta la serata, la **fazione** con più utenti e con più media di tempo in vocale riceverà crediti e **XP** personali a chi guarda almeno **30 minuti**. Non mancare!`;

function buildMovieNightFinalClosingLines({ fridayAdvance = false, starWarsFilmNight = false } = {}) {
  if (starWarsFilmNight) return [MOVIE_NIGHT_CLOSING_LINE_STARWARS];
  return [fridayAdvance ? MOVIE_NIGHT_CLOSING_LINE_FRIDAY : MOVIE_NIGHT_CLOSING_LINE_SATURDAY];
}
const ITALIAN_MONTH_NAMES = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const TARGET_WEEKDAY = 6;

function getMovieNightDiscordEventStartWindow() {
  const filmTotal = MOVIE_NIGHT_FILM_HOUR * 60 + MOVIE_NIGHT_FILM_MINUTE;
  const eventTotal = ((filmTotal - MOVIE_NIGHT_EVENT_ADVANCE_MINUTES) % (24 * 60) + 24 * 60) % (24 * 60);
  const eventMinute = eventTotal % 60;
  return {
    hour: Math.floor(eventTotal / 60),
    minuteLo: Math.max(0, eventMinute - MOVIE_NIGHT_EVENT_WINDOW_BEFORE_MIN),
    minuteHi: Math.min(59, eventMinute + MOVIE_NIGHT_EVENT_WINDOW_AFTER_MIN),
  };
}

/** Voce calendario fisso serata film (titolo e/o skip; event/poster opzionali). */
type FixedMovieNightEntry = {
  title?: string;
  skip?: boolean;
  event?: string;
  /** Cover evento Discord (CDN). */
  poster?: string;
};

const SW_POSTER_CDN = "https://cdn.viniliecaffe.it/images/starwars/posters";
const SW_POSTER_V = "20261104p1";
function swPoster(slug?) {
  return `${SW_POSTER_CDN}/${String(slug || "").trim()}.jpg?v=${SW_POSTER_V}`;
}

const HARRY_POTTER_MOVIE_NIGHT_SCHEDULE = new Map<string, FixedMovieNightEntry>([
  ["2026-06-06", { title: "Harry Potter e la pietra filosofale" }],
  ["2026-06-13", { title: "Harry Potter e la camera dei segreti" }],
  ["2026-06-20", { skip: true }],
  ["2026-06-27", { title: "Harry Potter e il prigioniero di Azkaban" }],
  ["2026-07-04", { title: "Harry Potter e il calice di fuoco" }],
  ["2026-07-11", { skip: true }],
  ["2026-07-18", { title: "Harry Potter e l'Ordine della Fenice" }],
  ["2026-07-25", { title: "Harry Potter e il principe mezzosangue" }],
  ["2026-08-01", { skip: true }],
  ["2026-08-08", { title: "Harry Potter e i Doni della Morte - Parte 1" }],
  ["2026-08-15", { skip: true }],
  ["2026-08-22", { skip: true }],
  ["2026-08-29", { title: "Harry Potter e i Doni della Morte - Parte 2" }],
  ["2026-10-24", { title: "Casper" }],
  ["2026-10-31", { title: "Nightmare Before Christmas" }],
]);

const STAR_WARS_MOVIE_NIGHT_SCHEDULE = new Map<string, FixedMovieNightEntry>([
  ["2026-12-05", { title: "Star Wars: La minaccia fantasma", event: "starwars", poster: swPoster("la-minaccia-fantasma") }],
  ["2026-12-12", { title: "Star Wars: L'attacco dei cloni", event: "starwars", poster: swPoster("lattacco-dei-cloni") }],
  ["2026-12-19", { title: "Star Wars: La vendetta dei Sith", event: "starwars", poster: swPoster("la-vendetta-dei-sith") }],
  /* Gap: niente serata / niente thread voto */
  ["2026-12-26", { skip: true, event: "starwars" }],
  ["2027-01-02", { title: "Star Wars: Rogue One", event: "starwars", poster: swPoster("rogue-one") }],
  ["2027-01-09", { title: "Star Wars: Una nuova speranza", event: "starwars", poster: swPoster("una-nuova-speranza") }],
  ["2027-01-16", { title: "Star Wars: L'impero colpisce ancora", event: "starwars", poster: swPoster("limpero-colpisce-ancora") }],
  ["2027-01-23", { title: "Star Wars: Il ritorno dello Jedi", event: "starwars", poster: swPoster("il-ritorno-dello-jedi") }],
  ["2027-01-30", { title: "Star Wars: Il risveglio della forza", event: "starwars", poster: swPoster("il-risveglio-della-forza") }],
  /* Gap: niente serata / niente thread voto */
  ["2027-02-06", { skip: true, event: "starwars" }],
  ["2027-02-13", { title: "Star Wars: Gli ultimi Jedi", event: "starwars", poster: swPoster("gli-ultimi-jedi") }],
  ["2027-02-20", { title: "Star Wars: L'ascesa di Skywalker", event: "starwars", poster: swPoster("lascesa-di-skywalker") }],
]);

const EXTRA_FIXED_MOVIE_NIGHTS = new Map<string, FixedMovieNightEntry>([
  ["2026-10-28", { title: "La sposa cadavere" }],
]);
const EXTRA_STATE_KEY = "movieNightExtra.v1";

const ROME_PARTS_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const WEEKDAY_INDEX = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

function getRomeParts(date = new Date()) {
  const parts: Record<string, any> = {};
  for (const part of ROME_PARTS_FORMATTER.formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  const hour = Number(parts.hour) === 24 ? 0 : Number(parts.hour);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: WEEKDAY_INDEX[parts.weekday] || 0,
    hour,
    minute: Number(parts.minute),
  };
}

function toDateKey(year?, month?, day?) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getRomeWeekKey(date = new Date()) {
  const parts = getRomeParts(date);
  const utcDate = Date.UTC(parts.year, parts.month - 1, parts.day);
  const mondayUtc = utcDate - (Math.max(1, parts.weekday) - 1) * 24 * 60 * 60 * 1000;
  const monday = new Date(mondayUtc);
  return toDateKey(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate());
}

function getRomeSaturdayKeyForWeek(date = new Date()) {
  const parts = getRomeParts(date);
  const utcDate = Date.UTC(parts.year, parts.month - 1, parts.day);
  const saturdayUtc = utcDate + (TARGET_WEEKDAY - Math.max(1, parts.weekday)) * 24 * 60 * 60 * 1000;
  const saturday = new Date(saturdayUtc);
  return toDateKey(saturday.getUTCFullYear(), saturday.getUTCMonth() + 1, saturday.getUTCDate());
}

function formatMovieNightStaffDateLabel(date = new Date(), opts: Record<string, any> = {}) {
  if (opts.advanceForSaturday) {
    const satKey = getRomeSaturdayKeyForWeek(date);
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(satKey || ""));
    if (match) {
      const day = Number(match[3]);
      const monthName = ITALIAN_MONTH_NAMES[Math.max(0, Number(match[2]) - 1)] || "";
      return `Sabato ${day} ${monthName}, alle ${MOVIE_NIGHT_DISPLAY_TIME}`;
    }
  }
  const parts = getRomeParts(date);
  const monthName = ITALIAN_MONTH_NAMES[Math.max(0, parts.month - 1)] || "";
  return `Oggi, ${parts.day} ${monthName}, alle ${MOVIE_NIGHT_DISPLAY_TIME}`;
}

function getMovieNightFinalAnnouncementSlot(now = new Date(), forcedSlot = "") {
  const forced = String(forcedSlot || "").trim().toLowerCase();
  if (forced === "friday" || forced === "saturday") return forced;
  const parts = getRomeParts(now);
  if (parts.weekday === FINAL_ANNOUNCE_FRIDAY_WEEKDAY && parts.hour === FINAL_ANNOUNCE_FRIDAY_HOUR) return "friday";
  if (parts.weekday === TARGET_WEEKDAY && parts.hour === FINAL_ANNOUNCE_SATURDAY_HOUR) return "saturday";
  return "";
}

function shouldAllowMovieNightStaffCommunication(now = new Date()) {
  const parts = getRomeParts(now);
  const hm = parts.hour * 60 + parts.minute;
  if (parts.weekday === FINAL_ANNOUNCE_FRIDAY_WEEKDAY && hm >= FINAL_ANNOUNCE_FRIDAY_HOUR * 60) return true;
  if (parts.weekday === TARGET_WEEKDAY && hm >= FINAL_ANNOUNCE_SATURDAY_HOUR * 60) return true;
  return false;
}

function resolveMovieNightStaffAnnounceSlot(now = new Date(), slotHint = "") {
  const hint = String(slotHint || "").trim().toLowerCase();
  if (hint === "final_friday") return "friday";
  if (hint === "final_saturday") return "saturday";
  const cronSlot = getMovieNightFinalAnnouncementSlot(now, "");
  if (cronSlot) return cronSlot;
  const parts = getRomeParts(now);
  if (parts.weekday === FINAL_ANNOUNCE_FRIDAY_WEEKDAY) return "friday";
  if (parts.weekday === TARGET_WEEKDAY) return "saturday";
  return "";
}

function shouldAttemptMovieNightEventStartRecovery(now = new Date()) {
  const parts = getRomeParts(now);
  const eventWindow = getMovieNightDiscordEventStartWindow();
  const cur = parts.hour * 60 + parts.minute;
  const inEveningWindow = cur >= eventWindow.hour * 60 + eventWindow.minuteLo;
  if (parts.weekday === TARGET_WEEKDAY && inEveningWindow) return true;
  if (getExtraFixedMovieNight(now) && inEveningWindow) return true;
  if (parts.weekday === 7 && parts.hour < 8) return true;
  if (parts.hour < 4) {
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    if (getExtraFixedMovieNight(yesterday)) return true;
  }
  return false;
}

/** Recovery chiusura: solo tardi (dopo il film), non alle 21:00 all'inizio serata.
 *  La chiusura primaria resta stageInstanceDelete; lo sweep è un fallback notturno. */
const MOVIE_NIGHT_STAGE_CLOSE_RECOVERY_HOUR = 23;
const MOVIE_NIGHT_STAGE_CLOSE_RECOVERY_MINUTE = 30;

function shouldAttemptMovieNightStageCloseRecovery(now = new Date()) {
  const parts = getRomeParts(now);
  const hm = parts.hour * 60 + parts.minute;
  const recoveryFrom = MOVIE_NIGHT_STAGE_CLOSE_RECOVERY_HOUR * 60 + MOVIE_NIGHT_STAGE_CLOSE_RECOVERY_MINUTE;
  if (parts.weekday === TARGET_WEEKDAY) return hm >= recoveryFrom;
  if (parts.weekday === 7) return hm < 4 * 60;
  if (getExtraFixedMovieNight(now) && hm >= recoveryFrom) return true;
  if (parts.hour < 4) {
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    if (getExtraFixedMovieNight(yesterday)) return true;
  }
  return false;
}

function getMovieNightStartupRecoverySlot(now = new Date()) {
  const parts = getRomeParts(now);
  const wd = parts.weekday;
  const hm = parts.hour * 60 + parts.minute;
  if (shouldAttemptMovieNightEventStartRecovery(now)) return "event_start";
  if (wd === 1 && hm >= 15 * 60) return "monday";
  if (wd === 2) return "monday";
  if (wd === 5 && hm >= 20 * 60 && hm < 21 * 60) return "thread_close";
  if (wd === 5 && hm >= 21 * 60) return "final_friday";
  if (wd === 6 && hm < 12 * 60) return "thread_close";
  if (wd === 6 && hm >= 12 * 60) return "final_saturday";
  return null;
}

function hasMovieNightSpareggio(state?) {
  return Boolean(String(state?.tieBreakerPollMessageId || "").trim());
}

function getRomeDateKey(date = new Date()) {
  const parts = getRomeParts(date);
  return toDateKey(parts.year, parts.month, parts.day);
}

function getHarryPotterMovieNightScheduleForWeek(date = new Date()) {
  const satKey = getRomeSaturdayKeyForWeek(date);
  return STAR_WARS_MOVIE_NIGHT_SCHEDULE.get(satKey) || HARRY_POTTER_MOVIE_NIGHT_SCHEDULE.get(satKey) || null;
}

function getStarWarsMovieNightScheduleForWeek(date = new Date()) {
  return STAR_WARS_MOVIE_NIGHT_SCHEDULE.get(getRomeSaturdayKeyForWeek(date)) || null;
}

function isStarWarsMovieNightWeek(date = new Date()) {
  return Boolean(getStarWarsMovieNightScheduleForWeek(date)?.title);
}

function getExtraFixedMovieNight(date = new Date()) {
  return EXTRA_FIXED_MOVIE_NIGHTS.get(getRomeDateKey(date)) || null;
}

function isMovieNightFixedScheduleSkipWeek(date = new Date()) {
  return Boolean(getHarryPotterMovieNightScheduleForWeek(date)?.skip);
}

function getFixedMovieTitleForWeek(date = new Date()) {
  const entry = getHarryPotterMovieNightScheduleForWeek(date);
  return entry?.skip ? null : String(entry?.title || "").trim() || null;
}

function getFixedMoviePosterForWeek(date = new Date()) {
  const entry = getHarryPotterMovieNightScheduleForWeek(date);
  if (!entry || entry.skip) return null;
  return String(entry.poster || "").trim() || null;
}

function getFixedMoviePosterForDate(date = new Date()) {
  const extra = getExtraFixedMovieNight(date);
  if (extra?.poster) return String(extra.poster).trim();
  const parts = getRomeParts(date);
  if (parts.hour < 4) {
    const yesterday = new Date(date.getTime() - 24 * 60 * 60 * 1000);
    const yExtra = getExtraFixedMovieNight(yesterday);
    if (yExtra?.poster) return String(yExtra.poster).trim();
  }
  return getFixedMoviePosterForWeek(date);
}

function getFixedMovieTitleForDate(date = new Date()) {
  const extra = getExtraFixedMovieNight(date);
  if (extra?.title) return String(extra.title).trim();
  const parts = getRomeParts(date);
  if (parts.hour < 4) {
    const yesterday = new Date(date.getTime() - 24 * 60 * 60 * 1000);
    const yExtra = getExtraFixedMovieNight(yesterday);
    if (yExtra?.title) return String(yExtra.title).trim();
  }
  return getFixedMovieTitleForWeek(date);
}

function resolveExtraMovieNightDateKey(now = new Date()) {
  if (getExtraFixedMovieNight(now)) return getRomeDateKey(now);
  const parts = getRomeParts(now);
  if (parts.hour < 4) {
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    if (getExtraFixedMovieNight(yesterday)) return getRomeDateKey(yesterday);
  }
  return "";
}

async function getExtraMovieNightState() {
  const raw = await getBotState(EXTRA_STATE_KEY, null);
  return raw && typeof raw === "object" ? raw : {};
}

async function patchExtraMovieNightState(eventDateKey?, patch?) {
  const key = String(eventDateKey || "").trim();
  if (!key) return null;
  const all = await getExtraMovieNightState();
  const prev = all[key] && typeof all[key] === "object" ? all[key] : {};
  const next = { ...all, [key]: { ...prev, ...patch, eventDateKey: key } };
  await setBotState(EXTRA_STATE_KEY, next);
  return next[key];
}

function isMovieNightClockInStartWindow(startDate?) {
  if (!startDate) return false;
  const parts = getRomeParts(startDate);
  const startTotal = parts.hour * 60 + parts.minute;
  const eventWindow = getMovieNightDiscordEventStartWindow();
  const eventLo = eventWindow.hour * 60 + eventWindow.minuteLo;
  const eventHi = eventWindow.hour * 60 + eventWindow.minuteHi;
  if (startTotal >= eventLo && startTotal <= eventHi) return true;
  const filmLo = MOVIE_NIGHT_FILM_HOUR * 60 + MOVIE_NIGHT_FILM_MINUTE;
  const filmHi = filmLo + MOVIE_NIGHT_EVENT_WINDOW_AFTER_MIN;
  return startTotal >= filmLo && startTotal <= filmHi;
}

function getMovieNightEventStartDate(event?) {
  return event?.scheduledStartAt || (event?.scheduledStartTimestamp ? new Date(event.scheduledStartTimestamp) : null);
}

function getWeekKeyStartMs(weekKey?) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(weekKey || "").trim());
  if (!match) return 0;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export = {
  TIME_ZONE,
  MOVIE_NIGHT_DISPLAY_TIME,
  MOVIE_NIGHT_FILM_HOUR,
  MOVIE_NIGHT_FILM_MINUTE,
  buildMovieNightFinalClosingLines,
  ITALIAN_MONTH_NAMES,
  TARGET_WEEKDAY,
  EXTRA_FIXED_MOVIE_NIGHTS,
  STAR_WARS_MOVIE_NIGHT_SCHEDULE,
  getRomeParts,
  getRomeWeekKey,
  getRomeSaturdayKeyForWeek,
  formatMovieNightStaffDateLabel,
  getMovieNightFinalAnnouncementSlot,
  shouldAllowMovieNightStaffCommunication,
  resolveMovieNightStaffAnnounceSlot,
  shouldAttemptMovieNightEventStartRecovery,
  shouldAttemptMovieNightStageCloseRecovery,
  getMovieNightStartupRecoverySlot,
  hasMovieNightSpareggio,
  getRomeDateKey,
  getHarryPotterMovieNightScheduleForWeek,
  getStarWarsMovieNightScheduleForWeek,
  isStarWarsMovieNightWeek,
  getExtraFixedMovieNight,
  isMovieNightFixedScheduleSkipWeek,
  getFixedMovieTitleForWeek,
  getFixedMovieTitleForDate,
  getFixedMoviePosterForWeek,
  getFixedMoviePosterForDate,
  resolveExtraMovieNightDateKey,
  getExtraMovieNightState,
  patchExtraMovieNightState,
  isMovieNightClockInStartWindow,
  getMovieNightEventStartDate,
  getWeekKeyStartMs,
};
