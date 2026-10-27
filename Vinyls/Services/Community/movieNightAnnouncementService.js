const cron = require("node-cron");
const { OverwriteType } = require("discord.js");
const { runCronDetached } = require("../../../shared/scheduling/cronDetached");
const BotState = require("../../Schemas/BotState/botStateSchema");
const { COMPACT_BOTSTATE_KEY } = BotState;
const { getBotState, setBotState } = require("../../Utils/BotState/botStateStore");
const { isMongoReady } = require("../../Utils/Database/mongoConnect");
const { getClientGuildCached, getGuildChannelCached } = require("../../Utils/Interaction/interactionEntityCache");
const IDs = require("../../Utils/Config/ids");
const { extractMovieNightProposalTitle, movieNightTitleCompareKey } = require("../../Utils/Community/movieNightProposal");
const {
  ensureWatchedMovieNightTitlesReady,
  mergeWatchedTitleEntries,
} = require("../../Utils/Community/movieNightWatchedTitles");
const { siteWorkflowUrl } = require("../../Utils/Web/discordWorkflowUiGate");
const { resolveSerataFilmHouseLeaderboard, sendSerataFilmHouseLeaderboardToReportChannel, formatCombinedRankingLines, collectHouseRoleIdsFromRanked, HOUSE_POINTS_BY_RANK, startSerataFilmHouseAttendanceSession, snapshotSerataFilmHouseAttendance, clearSerataFilmHouseAttendanceSession, restoreSerataFilmHouseAttendanceSession } = require("./hogwartsSerataFilmHouseLeaderboardService");
const { isHogwartsWeeklyTopReplaced } = require("./weeklyActivityWinnersService");
const { startSerataFilmSession, finishSerataFilmSessionsForChannel } = require("../Staff/staffAutoValutazioniService");
const TIME_ZONE = "Europe/Rome";
const STATE_KEY = "movieNightAnnouncement.v1";
const ANNOUNCE_CRON = "0 15 * * 1";
const CLOSE_THREAD_CRON = "0 20 * * 5";
const FINAL_ANNOUNCEMENT_FRIDAY_CRON = "0 21 * * 5";
const FINAL_ANNOUNCEMENT_SATURDAY_CRON = "0 12 * * 6";
const EVENT_START_SWEEP_CRON = "*/2 * * * 3,6";
const STAGE_CLOSE_SWEEP_CRON = "*/5 * * * 3,4,6,0";
let movieNightStageCloseRecoveryRunning = false;
const FINAL_ANNOUNCE_FRIDAY_WEEKDAY = 5;
const FINAL_ANNOUNCE_FRIDAY_HOUR = 21;
const FINAL_ANNOUNCE_SATURDAY_HOUR = 12;
const MOVIE_NIGHT_NAME = "SERATA FILM";
const MOVIE_NIGHT_VOTE_EMOJI_ID = "1482535223001485473";
const MOVIE_NIGHT_TIE_POLL_DURATION_HOURS = 4;
const DISCORD_POLL_MAX_ANSWERS = 10;
const REVIEW_THREAD_NAME = "RECENSIONI E SUGGERIMENTI";
const REVIEW_THREAD_CLOSE_AFTER_MS = 24 * 60 * 60 * 1000;
const REVIEW_THREAD_SWEEP_MS = 5 * 60 * 1000;
const REVIEW_THREAD_DISCOVERY_MAX_AGE_MS = REVIEW_THREAD_CLOSE_AFTER_MS + 12 * 60 * 60 * 1000;
const FALLBACK_MOVIE_DESCRIPTION = "Non ho trovato una descrizione affidabile in italiano, ma sarà una buona occasione per scoprirlo insieme durante la serata.";
const ANNOUNCEMENT_CHANNEL_ID = "1481660281032675510";
const MOVIE_NIGHT_EVENT_CHANNEL_ID = "1497535199813042306";
const EVENTS_ROLE_ID = String(IDs.roles?.Events || "1544830669023346688");
/* serataFilmPingMerge1: Serata Film eliminato → ping Events */
const SERATA_FILM_ROLE_ID = String(IDs.roles?.Events || IDs.roles?.SerataFilm || "1544830669023346688");
const STAFF_COMMUNICATION_CHANNEL_ID = String(IDs.channels?.staffNews || "1442569239063167139");
const STAFF_COMMUNICATION_ROLE_ID = String(IDs.roles?.Staff || "1442568910070349985");
const MOVIE_NIGHT_FILM_HOUR = 21;
const MOVIE_NIGHT_FILM_MINUTE = 0;
const MOVIE_NIGHT_EVENT_ADVANCE_MINUTES = 15;
const MOVIE_NIGHT_EVENT_WINDOW_BEFORE_MIN = 5;
const MOVIE_NIGHT_EVENT_WINDOW_AFTER_MIN = 10;
const MOVIE_NIGHT_DISPLAY_TIME = `${String(MOVIE_NIGHT_FILM_HOUR).padStart(2, "0")}:${String(MOVIE_NIGHT_FILM_MINUTE).padStart(2, "0")}`;
const MOVIE_NIGHT_CLOSING_LINE_FRIDAY = "> <a:VC_Rocket:1468544312475123753> Ci vediamo domani! E ricorda: chi partecipa all'evento in vocale riceverà il **doppio** degli **XP** validi per la top weekly. Non mancare!";
const MOVIE_NIGHT_CLOSING_LINE_SATURDAY = "> <a:VC_Rocket:1468544312475123753> Ci vediamo stasera! E ricorda: chi partecipa all'evento in vocale riceverà il **doppio** degli **XP** validi per la top weekly. Non mancare!";
const MOVIE_NIGHT_CLOSING_LINE_DURING_EVENT = "> <a:VC_Rocket:1468544312475123753> Durante tutta la serata, la casata con più utenti e con più tempo in vocale riceverà più punti. Non mancare!";

function formatSerataFilmHouseCupPointsLabel() {
  return (Array.isArray(HOUSE_POINTS_BY_RANK) ? HOUSE_POINTS_BY_RANK : [])
    .map((pts) => `+${Math.max(0, Math.floor(Number(pts) || 0))}`)
    .filter(Boolean)
    .join(" · ");
}

function buildMovieNightFinalClosingLines({ fridayAdvance = false, hogwartsEventActive = false } = {}) {
  if (!hogwartsEventActive) {
    return [fridayAdvance ? MOVIE_NIGHT_CLOSING_LINE_FRIDAY : MOVIE_NIGHT_CLOSING_LINE_SATURDAY];
  }
  const when = fridayAdvance ? "domani" : "stasera";
  const pts = formatSerataFilmHouseCupPointsLabel();
  return [
    MOVIE_NIGHT_CLOSING_LINE_DURING_EVENT,
  ];
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
const FINAL_ANNOUNCEMENT_EXTRA_BEFORE_PING_SATURDAYS = new Set(["2026-05-23"]);
const CHAT_CHANNEL_ID = String(IDs.channels?.chat || "1442569130573303898");

const HARRY_POTTER_MOVIE_NIGHT_SCHEDULE = new Map([
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
  // Halloween 2026 — film già scelti, niente thread votazioni quelle settimane
  ["2026-10-24", { title: "Casper" }],
  ["2026-10-31", { title: "Nightmare Before Christmas" }],
]);

/** Serate film extra a data fissa (non sabato). State separato per non collisionare col sabato della stessa settimana. */
const EXTRA_FIXED_MOVIE_NIGHTS = new Map([
  ["2026-10-28", { title: "La sposa cadavere" }],
]);
const EXTRA_STATE_KEY = "movieNightExtra.v1";
const EXTRA_FINAL_EVE_CRON = "0 21 * * 2";
const EXTRA_FINAL_DAY_CRON = "0 12 * * 3";
const EXTRA_EVENT_START_SWEEP_CRON = "*/2 * * * 3";
const EXTRA_STAGE_CLOSE_SWEEP_CRON = "*/5 * * * 3,4";
let movieNightAnnouncementTasks = null;
let movieNightAnnouncementRunning = false;
let movieNightThreadCloseRunning = false;
let movieNightFinalAnnouncementRunning = false;
let movieNightFinalRepairRunning = false;
let movieNightEventStartRunning = false;
let movieNightReviewCloseTimer = null;
let movieNightReviewCloseSweep = null;
const movieNightStageCloseLocksByWeek = new Map();
const MOVIE_NIGHT_END_ANNOUNCE_MARKER = "SERATA FILM ANDATA";
const MOVIE_NIGHT_END_ANNOUNCE_DEDUPE_MS = 10 * 60 * 1000;

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
  const parts = {};
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

function toDateKey(year, month, day) {
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

function isStageCloseMessageForWeekKey(message, weekKey) {
  if (!message?.id) return false;
  const wk = String(weekKey || "").trim();
  if (!wk) return false;
  const created = Number(message.createdTimestamp || 0);
  if (!created) return false;
  return getRomeWeekKey(new Date(created)) === wk;
}

async function fetchStageCloseMessageForWeek(clientOrGuild, weekKey, state) {
  const channel = await resolveTextChannelForMovieNight(clientOrGuild);
  if (!channel?.messages?.fetch) return null;
  const messageId = String(state?.stageCloseMessageId || "").trim();
  if (!messageId || messageId === "pending") return null;
  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message || !isStageCloseMessageForWeekKey(message, weekKey)) return null;
  return message;
}

function formatMovieNightStaffDateLabel(date = new Date(), opts = {}) {
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
  // early next-day recovery for Wednesday extras (Thu before 04:00)
  if (parts.hour < 4) {
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    if (getExtraFixedMovieNight(yesterday)) return true;
  }
  return false;
}

function shouldAttemptMovieNightStageCloseRecovery(now = new Date()) {
  const parts = getRomeParts(now);
  const hm = parts.hour * 60 + parts.minute;
  const filmStart = MOVIE_NIGHT_FILM_HOUR * 60 + MOVIE_NIGHT_FILM_MINUTE;
  if (parts.weekday === TARGET_WEEKDAY) return hm >= filmStart;
  if (parts.weekday === 7) return hm < 4 * 60;
  if (getExtraFixedMovieNight(now) && hm >= filmStart) return true;
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

function hasMovieNightSpareggio(state) {
  return Boolean(String(state?.tieBreakerPollMessageId || "").trim());
}

function getRomeDateKey(date = new Date()) {
  const parts = getRomeParts(date);
  return toDateKey(parts.year, parts.month, parts.day);
}

function getHarryPotterMovieNightScheduleForWeek(date = new Date()) {
  return HARRY_POTTER_MOVIE_NIGHT_SCHEDULE.get(getRomeSaturdayKeyForWeek(date)) || null;
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

async function patchExtraMovieNightState(eventDateKey, patch) {
  const key = String(eventDateKey || "").trim();
  if (!key) return null;
  const all = await getExtraMovieNightState();
  const prev = all[key] && typeof all[key] === "object" ? all[key] : {};
  const next = { ...all, [key]: { ...prev, ...patch, eventDateKey: key } };
  await setBotState(EXTRA_STATE_KEY, next);
  return next[key];
}

function isMovieNightClockInStartWindow(startDate) {
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

function getMovieNightEventStartDate(event) {
  return event?.scheduledStartAt || (event?.scheduledStartTimestamp ? new Date(event.scheduledStartTimestamp) : null);
}

function isMovieNightEventChannelAndStatus(event) {
  if (String(event?.channelId || "") !== MOVIE_NIGHT_EVENT_CHANNEL_ID) return false;
  const status = Number(event?.status || 0);
  return status === 1 || status === 2;
}

function isMovieNightEventName(event) {
  return String(event?.name || "").toUpperCase().includes(MOVIE_NIGHT_NAME);
}

function isSaturdayMovieNightStart(startDate, now = new Date()) {
  if (!startDate) return false;
  const parts = getRomeParts(startDate);
  if (
    getRomeSaturdayKeyForWeek(startDate) !== getRomeSaturdayKeyForWeek(now) ||
    parts.weekday !== TARGET_WEEKDAY
  ) {
    return false;
  }
  return isMovieNightClockInStartWindow(startDate);
}

function isExtraMovieNightStart(startDate, now = new Date()) {
  if (!startDate || !getExtraFixedMovieNight(startDate)) return false;
  const startKey = getRomeDateKey(startDate);
  const nowKey = getRomeDateKey(now);
  if (startKey === nowKey) return isMovieNightClockInStartWindow(startDate);
  const nowParts = getRomeParts(now);
  if (nowParts.hour < 4) {
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    if (getRomeDateKey(yesterday) === startKey) return isMovieNightClockInStartWindow(startDate);
  }
  return false;
}

function isTargetMovieNightTimeAndChannel(event, now = new Date()) {
  if (!isMovieNightEventChannelAndStatus(event)) return false;
  const startDate = getMovieNightEventStartDate(event);
  if (!startDate) return false;
  return isSaturdayMovieNightStart(startDate, now) || isExtraMovieNightStart(startDate, now);
}

function isTargetMovieNightEvent(event, now = new Date()) {
  return isMovieNightEventName(event) && isTargetMovieNightTimeAndChannel(event, now);
}

function isFixedScheduleMovieNightEvent(event, now = new Date()) {
  const startDate = getMovieNightEventStartDate(event) || now;
  return Boolean(getFixedMovieTitleForDate(startDate)) && isTargetMovieNightTimeAndChannel(event, now);
}

function isRelaxedSaturdayMovieNightEvent(event, now = new Date()) {
  if (!isMovieNightEventName(event) || !isMovieNightEventChannelAndStatus(event)) return false;
  const startDate = getMovieNightEventStartDate(event);
  return isSaturdayMovieNightStart(startDate, now);
}

function pickBestMovieNightEvent(candidates, now = new Date()) {
  const list = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
  if (!list.length) return null;
  const exact = list.filter((event) => isTargetMovieNightEvent(event, now) || isFixedScheduleMovieNightEvent(event, now));
  const pool = exact.length ? exact : list.filter((event) => isRelaxedSaturdayMovieNightEvent(event, now));
  return [...pool].sort((a, b) => Number(a.scheduledStartTimestamp || 0) - Number(b.scheduledStartTimestamp || 0))[0] || null;
}

async function fetchMovieNightEventById(guild, eventId) {
  const id = String(eventId || "").trim();
  if (!id || !guild?.scheduledEvents?.fetch) return null;
  const event = await guild.scheduledEvents.fetch(id).catch(() => null);
  if (!event || !isMovieNightEventName(event)) return null;
  return event;
}

async function findCurrentWeekMovieNightEvent(guild, now = new Date()) {
  if (!guild?.scheduledEvents?.fetch) return null;
  const events = await guild.scheduledEvents.fetch().catch((err) => {
    global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] scheduled events fetch failed:", err?.message || err);
    return null;
  });
  if (!events?.size) return null;
  return pickBestMovieNightEvent([...events.values()], now);
}

function buildMovieNightAnnouncementMessage() {
  return [
    "## <a:VC_Announce:1482534613568979007> **SERATA FILM**",
    "",
    `> <:VC_Stats:1482527532682055780> Ecco il thread in cui suggerire il film da guardare **Sabato alle ${MOVIE_NIGHT_DISPLAY_TIME}**. Non c'è un genere definito, quindi potete consigliare **qualsiasi film**.`,
    "",
    "<:VC_PinkQuestionMark:1471892611026391306> Come funziona:",
    "<:VC_DoubleReply:1482532332509466797> Scrivete il nome di uno o più film (in messaggi separati) e il bot in automatico aggiungerà la reaction <a:VC_Vote:1482535223001485473> per votare;",
    "<:VC_Reply:1482532158080942191> Cliccate sulla reaction <a:VC_Vote:1482535223001485473> per votare un film (senza limiti, potete votare per quanti volete);",
    "",
    "<:VC_BanHammer:1482534474502897795> **VIETATO:**",
    "<:VC_Dot:1482532364222595303> Suggerire titoli di saghe con trama continua, è consentito solo se i film non richiedono di guardare tutti i film della saga in sequenza;",
    "<:VC_Dot:1482532364222595303> Suggerire film di durata maggiore di 2 ore e 30 minuti;",
    "<:VC_Dot:1482532364222595303> Suggerire un film già suggerito nello stesso thread;",
    "<:VC_Dot:1482532364222595303> Suggerire un film già visto in precedenza;",
    "<:VC_Dot:1482532364222595303> Parlare di altro, qui si dovrà solo scrivere il titolo del film.",
    "",
    "<a:VC_Alarm:1482706641618079816> È fatto obbligo di specificare l'anno di uscita del film (anche tra parentesi), soprattutto se ci sono più versioni dello stesso film. Senza anno il messaggio viene cancellato automaticamente.",
    "",
    "<:VC_Attention:1482534443632558151> **PENA:** __Cancellazione dei messaggi__",
    "",
    `<a:VC_Ping:1482694298687246377>︲<@&${EVENTS_ROLE_ID}>`,
  ].join("\n");
}

function joinMovieTitlesForMessage(titles) {
  const list = titles.map((title) => `**${title}**`);
  if (list.length <= 2) return list.join(" e ");
  return `${list.slice(0, -1).join(", ")} e ${list[list.length - 1]}`;
}

function buildTieBreakerAnnouncementMessage(threadId, titles) {
  return [
    "## <a:VC_Announce:1482534613568979007> **SERATA FILM**",
    "",
    `> <:VC_Stats:1482527532682055780>  Essendoci un **pareggio** nel thread <#${threadId}> tra ${joinMovieTitlesForMessage(titles)} abbiamo deciso di fare un breve sondaggio per decidere quale guardare!`,
    "",
    "<a:VC_Vote:1482535223001485473> __Votate il sondaggio in basso__",
    "",
    `<a:VC_Ping:1482694298687246377>︲<@&${EVENTS_ROLE_ID}>`,
  ].join("\n");
}

function buildDiscordEventUrl(guildId, eventId) {
  const gid = String(guildId || IDs.guilds?.main || "");
  const eid = String(eventId || "");
  if (!gid || !eid) return "https://discord.com/events";
  return `https://discord.com/events/${gid}/${eid}`;
}

function buildMovieNightStaffCommunicationMessage({ title, dateLabel }) {
  const film = String(title || "").trim() || "il film in programma";
  const when = String(dateLabel || "").trim() || `Oggi, alle ${MOVIE_NIGHT_DISPLAY_TIME}`;
  return [
    "# <a:VC_Alert:1482706673176150077> COMUNICAZIONE SERATA FILM",
    "",
    `> <a:VC_Calendar:1482706208149475358> **${when}**, proietteremo **${film}**. Durerà all'incirca un'ora e mezza ma tanto saremo tutti mutati (__non silenziati__) quindi potete anche stare AFK. __L'importante è essere presenti nel canale vocale.__`,
    "",
    "> <a:VC_Exclamation:1482534702077444217> Dobbiamo far vedere che gli eventi sono frequentati. L'affluenza genera interesse e credibilità. Se lo staff partecipa in massa, si innesca un effetto catena positivo su tutta la community perché gli utenti vedranno che l'iniziativa funziona e si uniranno di più in futuro. __Chi non parteciperà all'evento è importante che sia conscio del fatto che riceverà una valutazione negativa.__",
    "",
    "> <:VC_handleft:1482730852164305068><:VC_handright:1482730777719476305> Supportare l'evento equivale a sostenere il server. Non si tratta solo di guardare un film, ma di mandare un segnale chiaro: *le iniziative della community contano e meritano attenzione.*",
    "",
    "> <a:VC_Rocket:1468544312475123753> Vi ricordo anche che in vocale gli **XP** sono **doppi**. Questo è da tenere in considerazione per futuri eventi.",
    "",
    `> <:VC_OfflineStatus:1482527117051957380> Ricordo a tutti che potete segnalare la vostra assenza alla serata film fino alle 20:45 di Sabato sul **sito staff** (<${siteWorkflowUrl("staff")}>), ciò per evitare valutazioni negative errate.`,
    "",
    `<a:VC_Ping:1482694298687246377>・<@&${STAFF_COMMUNICATION_ROLE_ID}>`,
  ].join("\n");
}

function buildFinalAnnouncementMonthlyActivityBlock() {
  return [
    "> # <a:VC_Exclamation:1482534702077444217> RICORDA L’EVENTO MENSILE!",
    `Il membro che a fine mese risulterà il più attivo vincerà Nitro Boost per un mese, il secondo una decorazione da massimo 15,99€ e il terzo il ruolo VIP+ per 30 giorni! Ti aspettiamo in <#${CHAT_CHANNEL_ID}>!`,
  ].join("\n");
}

function buildFinalMovieNightAnnouncementMessage({ title, description, eventUrl, saturdayKey, announceSlot, hogwartsEventActive = false }) {
  const fridayAdvance = String(announceSlot || "").toLowerCase() === "friday";
  const whenLine = fridayAdvance
    ? `> <:VC_movie:1497534838801174559> Tutto è pronto! **Domani** sera, alle **${MOVIE_NIGHT_DISPLAY_TIME}**, inizierà il nostro appuntamento con il cinema trasmettendo **${title}**!`
    : `> <:VC_movie:1497534838801174559> Tutto è pronto! Questa sera, alle **${MOVIE_NIGHT_DISPLAY_TIME}**, inizierà il nostro appuntamento con il cinema trasmettendo **${title}**!`;
  const lines = [
    "# <a:VC_Announce:1482534613568979007> SERATA FILM",
    "",
    whenLine,
    "",
    "<:VC_Info:1482526956703580372> Non sai di cosa parla?",
    description,
    "",
    ...buildMovieNightFinalClosingLines({ fridayAdvance, hogwartsEventActive }),
    "",
    `<:VC_CommunityManager:1494286896459681924> [Salva l'evento](${eventUrl})`,
  ];
  const satKey = String(saturdayKey || "").trim();
  if (satKey && FINAL_ANNOUNCEMENT_EXTRA_BEFORE_PING_SATURDAYS.has(satKey)) {
    lines.push("", buildFinalAnnouncementMonthlyActivityBlock());
  }
  lines.push("", `<a:VC_Ping:1482694298687246377>︲<@&${SERATA_FILM_ROLE_ID}>`);
  return lines.join("\n");
}

function buildMovieNightStartAnnouncementMessage(title) {
  return [
    "# <a:VC_Announce:1482534613568979007> SERATA FILM",
    "",
    `> <:VC_movie:1497534838801174559> Tutto è pronto! Tra pochi minuti, alle **${MOVIE_NIGHT_DISPLAY_TIME}**, inizierà il nostro appuntamento con il cinema trasmettendo **${title}**!`,
    "",
    `<a:VC_HeartsPink:1468685897389052008> Vi aspettiamo in numerosi in <#${MOVIE_NIGHT_EVENT_CHANNEL_ID}>`,
    "",
    `<a:VC_Ping:1482694298687246377>︲<@&${SERATA_FILM_ROLE_ID}> . @everyone`,
  ].join("\n");
}

function buildMovieNightEndAnnouncementMessage(title, options = {}) {
  const lb = options?.lb && typeof options.lb === "object" ? options.lb : options;
  const hogwartsEventActive = options?.hogwartsEventActive === true;
  const reviewThreadId = String(options?.reviewThreadId || "").trim();
  const reviewCta = reviewThreadId
    ? `<a:VC_NewsExclamation:1471891662786527253> Hai un suggerimento o vuoi lasciare una recensione per i prossimi eventi? Scrivi in <#${reviewThreadId}>!`
    : "<a:VC_NewsExclamation:1471891662786527253> Hai un suggerimento o vuoi lasciare una recensione per i prossimi eventi? Usa il thread qui sotto!";
  const lines = [
    "# <:VC_Firework:1470796227913322658> SERATA FILM ANDATA!",
    "",
    `> <a:VC_HeartsBlue:1468686100045369404> Grazie per aver partecipato attivamente alla proiezione di **${title}**. `,
    "",
  ];
  if (hogwartsEventActive && lb?.ok && Array.isArray(lb.rankedCombined) && lb.rankedCombined.length && lb.eventCfg) {
    lines.push(
      "<a:VC_Winner:1482535294757507255> **Top casate più attive in vocale**",
      ...formatCombinedRankingLines(lb.rankedCombined, lb.eventCfg),
      "",
      "_Punti assegnati alla Coppa delle Case: 200 · 150 · 100 · 50._",
      "",
    );
  }
  lines.push(
    reviewCta,
    "",
    "> <a:VC_lil_swag:1494319540954464327>  Alla prossima proiezione!",
    "",
    `<a:VC_Ping:1482694298687246377>︲<@&${SERATA_FILM_ROLE_ID}>`,
  );
  return lines.join("\n");
}

function withReviewThreadMentionInEndContent(content, threadId) {
  const id = String(threadId || "").trim();
  const raw = String(content || "");
  if (!id || !raw) return raw;
  if (raw.includes(`<#${id}>`)) return raw;
  const linked =
    `<a:VC_NewsExclamation:1471891662786527253> Hai un suggerimento o vuoi lasciare una recensione per i prossimi eventi? Scrivi in <#${id}>!`;
  if (raw.includes("Usa il thread qui sotto!")) {
    return raw.replace(
      /<a:VC_NewsExclamation:[^>]+>\s*Hai un suggerimento o vuoi lasciare una recensione per i prossimi eventi\? Usa il thread qui sotto!/,
      linked,
    );
  }
  return raw;
}

async function publishMovieNightAnnouncement(guild, event, weekKey) {
  const channel = guild.channels.cache.get(ANNOUNCEMENT_CHANNEL_ID) || (await getGuildChannelCached(guild, ANNOUNCEMENT_CHANNEL_ID));
  if (!channel?.isTextBased?.() || !channel?.send) {
    return { ok: false, reason: "announcement_channel_unavailable" };
  }

  const message = await channel.send({
    content: buildMovieNightAnnouncementMessage(),
    allowedMentions: { roles: [EVENTS_ROLE_ID] },
    __skipNoticeEmbed: true,
  });
  let thread = await message.startThread({
    name: MOVIE_NIGHT_NAME,
    autoArchiveDuration: 10080,
    reason: "Thread automatico suggerimenti Serata Film",
  }).catch(() => null);
  if (!thread) {
    thread = await message.startThread({
      name: MOVIE_NIGHT_NAME,
      autoArchiveDuration: 1440,
      reason: "Thread automatico suggerimenti Serata Film",
    }).catch((err) => {
      global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] thread create failed:", err?.message || err);
      return null;
    });
  }

  const previousState = await getBotState(STATE_KEY, null);
  const previousWeekKey = String(previousState?.weekKey || "");
  const keepPriorWeekFields = previousWeekKey && previousWeekKey === weekKey && previousState && typeof previousState === "object";
  const openReviewFields = pickOpenReviewThreadStateFields(previousState);
  const archivedWatched = mergeWatchedTitleEntries(
    previousState?.watchedMovieTitles,
    previousState?.stageCloseMovieTitle
      ? {
          title: previousState.stageCloseMovieTitle,
          source: "week_roll_stage",
          weekKey: previousWeekKey,
          saturdayKey: previousState?.finalAnnouncedSaturdayKey || "",
        }
      : null,
    previousState?.finalMovieTitle
      ? {
          title: previousState.finalMovieTitle,
          source: "week_roll_final",
          weekKey: previousWeekKey,
          saturdayKey: previousState?.finalAnnouncedSaturdayKey || "",
        }
      : null,
    previousState?.eventStartMovieTitle
      ? {
          title: previousState.eventStartMovieTitle,
          source: "week_roll_event",
          weekKey: previousWeekKey,
          saturdayKey: previousState?.finalAnnouncedSaturdayKey || "",
        }
      : null,
  );
  await setBotState(STATE_KEY, {
    ...(keepPriorWeekFields ? previousState : openReviewFields),
    watchedMovieTitles: archivedWatched,
    watchedTitlesBootstrappedAt: previousState?.watchedTitlesBootstrappedAt || "",
    weekKey,
    guildId: String(guild.id || ""),
    eventId: String(event?.id || ""),
    messageId: String(message.id || ""),
    threadId: String(thread?.id || ""),
    announcedAt: new Date().toISOString(),
    /* movieNightStrictProposal1: anno + durata/vecchiaia dal prossimo announce in poi */
    strictProposalRules: true,
  });

  return { ok: true, messageId: String(message.id || ""), threadId: String(thread?.id || "") };
}

async function syncLiveMovieNightAnnouncementMessage(client) {
  const state = await getBotState(STATE_KEY, null).catch(() => null);
  const messageId = String(state?.messageId || "").trim();
  const guildId = String(state?.guildId || IDs.guilds?.main || "").trim();
  if (!messageId || !guildId) return { ok: false, reason: "no_state_message" };
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return { ok: false, reason: "guild_not_found" };
  const channel =
    guild.channels.cache.get(ANNOUNCEMENT_CHANNEL_ID) ||
    (await getGuildChannelCached(guild, ANNOUNCEMENT_CHANNEL_ID).catch(() => null));
  if (!channel?.messages?.fetch) return { ok: false, reason: "channel_unavailable" };
  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message) return { ok: false, reason: "message_not_found" };
  const content = buildMovieNightAnnouncementMessage();
  if (String(message.content || "") === content) {
    return { ok: true, reason: "already_synced", messageId, skippedStrict: true };
  }
  await message.edit({
    content,
    allowedMentions: { roles: [...new Set([EVENTS_ROLE_ID, SERATA_FILM_ROLE_ID].filter(Boolean))] },
  });
  /* Non attivare strictProposalRules sul thread già aperto */
  return { ok: true, reason: "edited", messageId, skippedStrict: true };
}

function truncateDescription(text, maxLength = 520) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) return clean;
  const sliced = clean.slice(0, maxLength + 1);
  const sentenceEnd = Math.max(sliced.lastIndexOf(". "), sliced.lastIndexOf("! "), sliced.lastIndexOf("? "));
  if (sentenceEnd >= 180) return clean.slice(0, sentenceEnd + 1).trim();
  return `${clean.slice(0, maxLength).replace(/\s+\S*$/, "").trim()}...`;
}

function isFallbackMovieDescription(text) {
  const t = String(text || "").trim();
  if (!t) return true;
  return t === FALLBACK_MOVIE_DESCRIPTION || t.includes("Non ho trovato una descrizione affidabile");
}

async function fetchJson(url, { timeoutMs = 12000, retries = 1 } = {}) {
  if (typeof fetch !== "function") return null;
  let last = null;
  for (let attempt = 0; attempt <= Math.max(0, retries); attempt += 1) {
    const signal =
      typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
        ? AbortSignal.timeout(timeoutMs)
        : undefined;
    const response = await fetch(url, {
      signal,
      headers: {
        /* movieDescWiki1: UA contattabile — Wikimedia blocca UA anonimi/intermittenti */
        "User-Agent": "ViniliECaffeBot/1.1 (movie-night; +https://viniliecaffe.it; discord.viniliecaffe.gg)",
        Accept: "application/json",
      },
    }).catch((err) => {
      last = err;
      return null;
    });
    if (response?.ok) {
      const json = await response.json().catch(() => null);
      if (json) return json;
    } else {
      last = response;
      /* movieDesc429Fix1: 429 → aspetta Retry-After (max 8s), non martellare */
      if (response && Number(response.status) === 429) {
        let waitMs = 2500 * (attempt + 1);
        try {
          const ra = Number(response.headers?.get?.("retry-after") || 0);
          if (Number.isFinite(ra) && ra > 0) waitMs = Math.min(8000, Math.max(waitMs, ra * 1000));
        } catch (_) {}
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
        break;
      }
    }
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, 450 * (attempt + 1)));
    }
  }
  if (last) {
    try {
      global.logger?.warn?.("[movieNight] fetchJson failed:", String(url).slice(0, 120), last?.status || last?.message || last);
    } catch (_) {}
  }
  return null;
}

function buildMovieSearchQueries(title, { lean = false } = {}) {
  const rawTitle = String(title || "").trim();
  /* movieDesc429Fix1: di default 1 sola query — le 3 varianti film×IT/EN ×Wikidata = 429 */
  if (lean) return rawTitle ? [rawTitle] : [];
  return [...new Set([
    rawTitle,
    `film ${rawTitle}`,
    `${rawTitle} film`,
  ].filter(Boolean))];
}

function stripMovieTitleDecorations(title) {
  return String(title || "")
    .replace(/\s*\((film|film d'animazione|animazione|movie)[^)]*\)\s*$/i, "")
    .trim();
}

function compactMovieTitle(title) {
  return stripMovieTitleDecorations(title)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\u00c0-\u024f]/gi, "");
}

function scoreMovieTitleMatch(movieTitle, pageTitle) {
  const movie = compactMovieTitle(movieTitle);
  const page = compactMovieTitle(pageTitle);
  if (!movie || !page) return 0;
  if (page === movie) return 1000;
  if (page.startsWith(movie) || movie.startsWith(page)) return 900;
  if (page.includes(movie) || movie.includes(page)) return 800;
  return 0;
}

function wikipediaPageLooksLikeMovieNoise(pageTitle) {
  const t = String(pageTitle || "");
  return /\((franchise|serie|series|soundtrack|album|videogioco|video game|disambigua)\)/i.test(t) ||
    /\b(franchise|colonna sonora|soundtrack|personaggi di)\b/i.test(t);
}

function pickBestWikipediaSearchResult(movieTitle, results) {
  let bestTitle = null;
  let bestScore = 0;
  for (const entry of results || []) {
    const pageTitle = String(entry?.title || "").trim();
    if (!pageTitle || wikipediaPageLooksLikeMovieNoise(pageTitle)) continue;
    const score = scoreMovieTitleMatch(movieTitle, pageTitle);
    if (score > bestScore) {
      bestScore = score;
      bestTitle = pageTitle;
    }
  }
  /* movieDescWiki1: soglia 700 (era 800) — titoli IT/EN con anno/sottotitolo fallivano spesso */
  if (bestScore >= 700) return bestTitle;
  /* ultimo tentativo: primo risultato “pulito” se contiene il titolo compatto */
  const movie = compactMovieTitle(movieTitle);
  for (const entry of results || []) {
    const pageTitle = String(entry?.title || "").trim();
    if (!pageTitle || wikipediaPageLooksLikeMovieNoise(pageTitle)) continue;
    const page = compactMovieTitle(pageTitle);
    if (movie && page && (page.includes(movie) || movie.includes(page))) return pageTitle;
  }
  return null;
}

async function searchWikipediaPageTitle(lang, title) {
  const safeLang = String(lang || "it").toLowerCase();
  /* movieDesc429Fix1: prima solo titolo; se fallisce UNA variante "film …" */
  const queries = [
    ...buildMovieSearchQueries(title, { lean: true }),
    `film ${String(title || "").trim()}`,
  ].filter(Boolean);
  const seen = new Set();
  for (const query of queries) {
    if (seen.has(query)) continue;
    seen.add(query);
    const searchUrl = new URL(`https://${safeLang}.wikipedia.org/w/api.php`);
    searchUrl.searchParams.set("action", "query");
    searchUrl.searchParams.set("list", "search");
    searchUrl.searchParams.set("format", "json");
    searchUrl.searchParams.set("origin", "*");
    searchUrl.searchParams.set("srlimit", "8");
    searchUrl.searchParams.set("srsearch", query);
    const search = await fetchJson(searchUrl.toString());
    const pageTitle = pickBestWikipediaSearchResult(title, search?.query?.search);
    if (pageTitle) return pageTitle;
  }
  return null;
}

function wikipediaExtractIsUsable(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length < 60) return false;
  if (/può riferirsi a|may refer to|disambigua/i.test(clean)) return false;
  return true;
}

async function fetchWikipediaExtract(lang, pageTitle) {
  const safeLang = String(lang || "it").toLowerCase();
  const safeTitle = String(pageTitle || "").trim();
  if (!safeTitle) return null;
  const extractUrl = new URL(`https://${safeLang}.wikipedia.org/w/api.php`);
  extractUrl.searchParams.set("action", "query");
  extractUrl.searchParams.set("prop", "extracts");
  extractUrl.searchParams.set("exintro", "1");
  extractUrl.searchParams.set("explaintext", "1");
  extractUrl.searchParams.set("redirects", "1");
  extractUrl.searchParams.set("format", "json");
  extractUrl.searchParams.set("origin", "*");
  extractUrl.searchParams.set("titles", safeTitle);
  const extract = await fetchJson(extractUrl.toString());
  const pages = extract?.query?.pages ? Object.values(extract.query.pages) : [];
  const text = pages[0]?.extract || null;
  return wikipediaExtractIsUsable(text) ? text : null;
}

function wikidataLooksLikeMovie(entity) {
  const text = [
    entity?.description,
    entity?.label,
    entity?.match?.text,
  ].map((value) => String(value || "").toLowerCase()).join(" ");
  /* movieDescWiki1: escludi soundtrack/franchise/game (prima matchavano per la parola "film") */
  if (/\b(soundtrack|colonna sonora|franchise|serie televisiva|tv series|videogioco|video game|album|song)\b/i.test(text)) {
    return false;
  }
  return /\b(film|movie|pellicola|cinema|anime|animated)\b/i.test(text);
}

async function searchWikidataMoviePageTitle(title, targetLang) {
  const ids = [];
  const fallbackIds = [];
  /* movieDesc429Fix1: max 2 search (it+en, solo titolo) — prima erano fino a 12 → 429 */
  for (const lang of ["it", "en"]) {
    for (const query of buildMovieSearchQueries(title, { lean: true })) {
      const searchUrl = new URL("https://www.wikidata.org/w/api.php");
      searchUrl.searchParams.set("action", "wbsearchentities");
      searchUrl.searchParams.set("format", "json");
      searchUrl.searchParams.set("origin", "*");
      searchUrl.searchParams.set("language", lang);
      searchUrl.searchParams.set("uselang", lang);
      searchUrl.searchParams.set("type", "item");
      searchUrl.searchParams.set("limit", "5");
      searchUrl.searchParams.set("search", query);
      const search = await fetchJson(searchUrl.toString());
      for (const entity of search?.search || []) {
        if (!entity?.id) continue;
        if (wikidataLooksLikeMovie(entity)) {
          if (!ids.includes(entity.id)) ids.push(entity.id);
        } else if (!fallbackIds.includes(entity.id)) {
          fallbackIds.push(entity.id);
        }
      }
      if (ids.length >= 3) break;
    }
    if (ids.length >= 3) break;
  }
  const candidateIds = ids.length ? ids : fallbackIds;
  if (!candidateIds.length) return null;

  const entitiesUrl = new URL("https://www.wikidata.org/w/api.php");
  entitiesUrl.searchParams.set("action", "wbgetentities");
  entitiesUrl.searchParams.set("format", "json");
  entitiesUrl.searchParams.set("origin", "*");
  entitiesUrl.searchParams.set("props", "sitelinks");
  entitiesUrl.searchParams.set("sitefilter", "itwiki|enwiki");
  entitiesUrl.searchParams.set("ids", candidateIds.slice(0, 5).join("|"));
  const data = await fetchJson(entitiesUrl.toString());
  const site = `${String(targetLang || "it").toLowerCase()}wiki`;
  for (const id of candidateIds) {
    const titleForLang = data?.entities?.[id]?.sitelinks?.[site]?.title;
    if (titleForLang && !wikipediaPageLooksLikeMovieNoise(titleForLang)) return titleForLang;
  }
  return null;
}

async function translateEnglishToItalian(text) {
  const clean = truncateDescription(text, 900);
  if (!clean) return null;
  const url = new URL("https://api.mymemory.translated.net/get");
  url.searchParams.set("q", clean);
  url.searchParams.set("langpair", "en|it");
  const data = await fetchJson(url.toString());
  const translated = String(data?.responseData?.translatedText || "").trim();
  if (!translated || translated.toLowerCase() === clean.toLowerCase()) return null;
  return truncateDescription(translated);
}

const movieDescriptionCache = new Map();

async function fetchItalianMovieDescription(title) {
  const rawTitle = String(title || "").trim();
  if (!rawTitle) return FALLBACK_MOVIE_DESCRIPTION;
  const cacheKey = rawTitle.toLowerCase();
  if (movieDescriptionCache.has(cacheKey)) return movieDescriptionCache.get(cacheKey);

  /* movieDesc429Fix1: Wikipedia IT (1–2 req) → extract; Wikidata solo se serve.
     Prima: fino a ~12+ search Wikidata/Wiki in loop → HTTP 429 → fallback sempre. */
  const italianPageTitle = await searchWikipediaPageTitle("it", rawTitle);
  const italianDescription = italianPageTitle ? await fetchWikipediaExtract("it", italianPageTitle) : null;
  if (italianDescription) {
    const out = truncateDescription(italianDescription);
    movieDescriptionCache.set(cacheKey, out);
    return out;
  }

  const viaWikidataIt = await searchWikidataMoviePageTitle(rawTitle, "it");
  if (viaWikidataIt && viaWikidataIt !== italianPageTitle) {
    const viaWdDesc = await fetchWikipediaExtract("it", viaWikidataIt);
    if (viaWdDesc) {
      const out = truncateDescription(viaWdDesc);
      movieDescriptionCache.set(cacheKey, out);
      return out;
    }
  }

  const englishPageTitle = await searchWikipediaPageTitle("en", rawTitle);
  const englishDescription = englishPageTitle ? await fetchWikipediaExtract("en", englishPageTitle) : null;
  if (englishDescription) {
    const translatedDescription = await translateEnglishToItalian(englishDescription);
    const out =
      translatedDescription && wikipediaExtractIsUsable(translatedDescription)
        ? translatedDescription
        : truncateDescription(englishDescription);
    movieDescriptionCache.set(cacheKey, out);
    return out;
  }

  try {
    global.logger?.warn?.("[movieNight] description fallback for title:", rawTitle);
  } catch (_) {}
  return FALLBACK_MOVIE_DESCRIPTION;
}

/* movieNightProposalTitleSmart1: titolo annuncio da Wikipedia/Wikidata, non dal messaggio grezzo */
async function resolveCanonicalMovieTitle(rawTitle) {
  const extracted = extractMovieNightProposalTitle(rawTitle) || String(rawTitle || "").trim();
  if (!extracted) return "";
  try {
    /* movieDesc429Fix1: Wikipedia prima (meno roundtrip); evita 429 prima della trama */
    const italianPageTitle =
      (await searchWikipediaPageTitle("it", extracted)) ||
      (await searchWikidataMoviePageTitle(extracted, "it"));
    if (italianPageTitle) return stripMovieTitleDecorations(italianPageTitle) || extracted;
    const englishPageTitle =
      (await searchWikipediaPageTitle("en", extracted)) ||
      (await searchWikidataMoviePageTitle(extracted, "en"));
    if (englishPageTitle) return stripMovieTitleDecorations(englishPageTitle) || extracted;
  } catch (err) {
    try {
      global.logger?.warn?.("[MOVIE NIGHT] canonicalize title failed:", err?.message || err);
    } catch (_) {}
  }
  return extracted;
}

async function fetchAllThreadMessages(thread, limit = 1000) {
  const messages = [];
  let before;
  while (messages.length < limit) {
    const batch = await thread.messages.fetch({ limit: Math.min(100, limit - messages.length), ...(before ? { before } : {}) }).catch(() => null);
    if (!batch?.size) break;
    messages.push(...batch.values());
    before = batch.last()?.id;
    if (batch.size < 100) break;
  }
  return messages;
}

function getMovieVoteReaction(message) {
  return message.reactions?.cache?.find((reaction) => {
    const emojiId = String(reaction?.emoji?.id || "");
    const emojiName = String(reaction?.emoji?.name || "");
    return emojiId === MOVIE_NIGHT_VOTE_EMOJI_ID || emojiName === "VC_Vote";
  }) || null;
}

async function countReactionVotes(reaction, botUserId) {
  if (!reaction) return 0;
  const voterIds = new Set();
  let after;
  while (true) {
    const users = await reaction.users.fetch({ limit: 100, ...(after ? { after } : {}) }).catch(() => null);
    if (!users?.size) break;
    for (const user of users.values()) {
      if (!user?.bot && String(user.id || "") !== String(botUserId || "")) voterIds.add(String(user.id));
    }
    after = users.last()?.id;
    if (users.size < 100) break;
  }
  return voterIds.size;
}

async function collectMovieNightVoteResults(thread, client) {
  const messages = await fetchAllThreadMessages(thread);
  const proposals = messages
    .filter((message) => !message.author?.bot && !message.webhookId && !message.system)
    .filter((message) => extractMovieNightProposalTitle(message.content))
    .sort((a, b) => Number(a.createdTimestamp || 0) - Number(b.createdTimestamp || 0));
  const results = [];
  for (const message of proposals) {
    const title = extractMovieNightProposalTitle(message.content);
    if (!title) continue;
    const key = movieNightTitleCompareKey(title);
    const votes = await countReactionVotes(getMovieVoteReaction(message), client?.user?.id);
    /* movieNightProposalTitleSmart1: stessi film con testo diverso → un solo risultato (voti sommati) */
    const existing = results.find((r) => r._key === key);
    if (existing) {
      existing.votes += votes;
      continue;
    }
    results.push({ messageId: String(message.id || ""), title, votes, _key: key });
  }
  return results.map(({ _key, ...rest }) => rest);
}

async function maybePublishTieBreakerPoll(client, thread, state) {
  if (state?.tieBreakerPollMessageId) return { skipped: true, reason: "tie_poll_already_sent" };
  const results = await collectMovieNightVoteResults(thread, client);
  if (!results.length) return { skipped: true, reason: "no_movie_proposals", voteResults: [] };

  const topVotes = Math.max(...results.map((result) => result.votes));
  const tied = results.filter((result) => result.votes === topVotes);
  if (tied.length < 2) {
    return { skipped: true, reason: "no_tie", topVotes, winner: tied[0]?.title || null, voteResults: results };
  }

  const options = tied.slice(0, DISCORD_POLL_MAX_ANSWERS);
  const channel = thread.guild?.channels?.cache?.get(ANNOUNCEMENT_CHANNEL_ID) || (await getGuildChannelCached(thread.guild, ANNOUNCEMENT_CHANNEL_ID));
  if (!channel?.isTextBased?.() || !channel?.send) {
    return { skipped: true, reason: "announcement_channel_unavailable" };
  }

  const pollMessage = await channel.send({
    content: buildTieBreakerAnnouncementMessage(thread.id, options.map((option) => option.title)),
    allowedMentions: { roles: [...new Set([EVENTS_ROLE_ID, SERATA_FILM_ROLE_ID].filter(Boolean))] },
    __skipNoticeEmbed: true,
    poll: {
      question: { text: `Quale film guardiamo domani alle ${MOVIE_NIGHT_DISPLAY_TIME}?` },
      answers: options.map((option) => ({ text: option.title })),
      duration: MOVIE_NIGHT_TIE_POLL_DURATION_HOURS,
      allowMultiselect: false,
    },
  });
  return {
    ok: true,
    tieBreakerPollMessageId: String(pollMessage.id || ""),
    tiedMovieTitles: options.map((option) => option.title),
    voteResults: results,
    topVotes,
    truncated: tied.length > options.length,
  };
}

function resolveWinnerFromVoteResults(voteResults) {
  const results = Array.isArray(voteResults) ? voteResults : [];
  if (!results.length) return null;
  return [...results]
    .filter((result) => String(result?.title || "").trim())
    .sort((a, b) => Number(b.votes || 0) - Number(a.votes || 0))[0]?.title || null;
}

async function resolveTieBreakerPollWinner(client, state) {
  const pollMessageId = String(state?.tieBreakerPollMessageId || "");
  if (!pollMessageId) return null;
  const channel = client.channels.cache.get(ANNOUNCEMENT_CHANNEL_ID) || (await client.channels.fetch(ANNOUNCEMENT_CHANNEL_ID).catch(() => null));
  const message = await channel?.messages?.fetch?.(pollMessageId).catch(() => null);
  const answers = [...(message?.poll?.answers?.values?.() || [])]
    .filter((answer) => String(answer?.text || "").trim())
    .sort((a, b) => Number(b.voteCount || 0) - Number(a.voteCount || 0) || Number(a.id || 0) - Number(b.id || 0));
  return answers[0]?.text || null;
}

function extractTitleFromEventDescription(description) {
  const desc = String(description || "").trim();
  if (!desc) return null;
  const patterns = [
    /(?:film|titolo|proiezione|stasera|guardiamo|trasmettendo|proiettando)\s*[:\-–—]\s*(.+)/iu,
    /(?:trasmettendo|proiettando)\s+(.+?)(?:[.!?\n]|$)/iu,
  ];
  for (const pattern of patterns) {
    const match = desc.match(pattern);
    if (!match?.[1]) continue;
    const title = extractMovieNightProposalTitle(match[1]);
    if (title && title.toUpperCase() !== MOVIE_NIGHT_NAME) return title;
  }
  for (const line of desc.split(/\n+/)) {
    const title = extractMovieNightProposalTitle(line);
    if (title && title.toUpperCase() !== MOVIE_NIGHT_NAME && title.length >= 2) return title;
  }
  return null;
}

function resolveTitleFromMovieNightEvent(event) {
  const name = String(event?.name || "").trim();
  if (!name) return extractTitleFromEventDescription(event?.description);

  const splitPatterns = [
    /^serata\s*film\s*(?:[\|\-–—:»>]+\s*)+(.+)$/iu,
    /^(.+?)\s*(?:[\|\-–—:]+\s*)+serata\s*film\s*$/iu,
  ];
  for (const pattern of splitPatterns) {
    const match = name.match(pattern);
    if (!match?.[1]) continue;
    const title = extractMovieNightProposalTitle(match[1]);
    if (title && title.toUpperCase() !== MOVIE_NIGHT_NAME) return title;
  }

  let rest = name;
  if (name.toUpperCase().includes(MOVIE_NIGHT_NAME)) {
    rest = name
      .replace(/serata\s*film/gi, " ")
      .replace(/^[\s|\-–—:>]+/, "")
      .replace(/[\s|\-–—:]+$/, "")
      .trim();
  }
  const title = extractMovieNightProposalTitle(rest) || extractMovieNightProposalTitle(name);
  if (title && title.toUpperCase() !== MOVIE_NIGHT_NAME) return title;
  return extractTitleFromEventDescription(event?.description);
}

async function resolveAnnouncementChannel(client) {
  return (
    client?.channels?.cache?.get(ANNOUNCEMENT_CHANNEL_ID) ||
    (await client?.channels?.fetch?.(ANNOUNCEMENT_CHANNEL_ID).catch(() => null))
  );
}

function isMovieNightVoteThread(thread, weekKey) {
  if (!thread?.isThread?.()) return false;
  const threadName = String(thread.name || "").trim().toUpperCase();
  if (threadName !== MOVIE_NIGHT_NAME) return false;
  const createdAt = Number(thread.createdTimestamp || 0);
  if (!createdAt) return false;
  return getRomeWeekKey(new Date(createdAt)) === weekKey;
}

async function discoverMovieNightVoteThread(client, weekKey) {
  const key = String(weekKey || "").trim();
  if (!key) return null;
  const channel = await resolveAnnouncementChannel(client);
  if (!channel?.isTextBased?.()) return null;

  const candidates = [];
  if (channel.threads?.fetchActive) {
    const active = await channel.threads.fetchActive().catch(() => null);
    if (active?.threads?.size) candidates.push(...active.threads.values());
  }
  if (channel.threads?.fetchArchived) {
    let before;
    for (let page = 0; page < 4; page += 1) {
      const archived = await channel.threads
        .fetchArchived({ limit: 25, ...(before ? { before } : {}) })
        .catch(() => null);
      if (!archived?.threads?.size) break;
      candidates.push(...archived.threads.values());
      before = archived.threads.last()?.id;
      if (archived.threads.size < 25) break;
    }
  }

  const fromThreads = candidates.filter((thread) => isMovieNightVoteThread(thread, key));
  if (fromThreads.length) {
    return [...fromThreads].sort((a, b) => Number(b.createdTimestamp || 0) - Number(a.createdTimestamp || 0))[0];
  }

  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!messages?.size) return null;
  const sorted = [...messages.values()].sort(
    (a, b) => Number(b.createdTimestamp || 0) - Number(a.createdTimestamp || 0),
  );
  for (const message of sorted) {
    if (getRomeWeekKey(new Date(Number(message.createdTimestamp || 0))) !== key) continue;
    if (!message.hasThread) continue;
    const thread = message.thread || (await message.fetchThread?.().catch(() => null));
    if (isMovieNightVoteThread(thread, key)) return thread;
  }
  return null;
}

async function hydrateMovieNightStateForWeek(client, state, weekKey) {
  const key = String(weekKey || "").trim();
  const base = state && typeof state === "object" ? { ...state } : {};
  if (!key) return base;
  if (base.threadId && base.weekKey === key) return base;
  const thread = await discoverMovieNightVoteThread(client, key);
  if (!thread?.id) return base;
  return {
    ...base,
    weekKey: key,
    threadId: String(thread.id),
    guildId: String(thread.guildId || base.guildId || IDs.guilds?.main || ""),
  };
}

async function resolveMovieNightThread(client, threadId) {
  const id = String(threadId || "");
  if (!id) return null;
  return client.channels.cache.get(id) || (await client.channels.fetch(id).catch(() => null));
}

async function resolveMovieTitleFromVoteThread(client, state, weekKey = "") {
  const key = String(weekKey || state?.weekKey || "").trim();
  let thread = null;
  const threadId = String(state?.threadId || "");
  if (threadId) thread = await resolveMovieNightThread(client, threadId);
  if (!thread?.isThread?.() && key) {
    thread = await discoverMovieNightVoteThread(client, key);
  }
  if (!thread?.isThread?.()) return null;
  const voteResults = await collectMovieNightVoteResults(thread, client).catch(() => []);
  const fromVotes = resolveWinnerFromVoteResults(voteResults);
  if (fromVotes) return fromVotes;
  const topVotes = voteResults.length ? Math.max(...voteResults.map((r) => Number(r.votes || 0))) : 0;
  if (topVotes > 0) {
    const leader = voteResults.find((r) => Number(r.votes || 0) === topVotes);
    if (leader?.title) return leader.title;
  }
  return null;
}

async function resolveFinalMovieTitle(client, state, now = new Date()) {
  const weekKey = getRomeWeekKey(now);
  if (getHarryPotterMovieNightScheduleForWeek(now)?.skip && !getExtraFixedMovieNight(now)) return null;
  const fromSchedule = getFixedMovieTitleForDate(now);
  if (fromSchedule) return fromSchedule;
  const savedTitle = String(state?.finalMovieTitle || "").trim();
  if (savedTitle && String(state?.weekKey || "") === weekKey) return savedTitle;
  const hydrated = await hydrateMovieNightStateForWeek(client, state, weekKey);
  let raw =
    (await resolveTieBreakerPollWinner(client, hydrated)) ||
    resolveWinnerFromVoteResults(hydrated?.voteResults) ||
    (await resolveMovieTitleFromVoteThread(client, hydrated, weekKey).catch(() => null));
  if (!raw) {
    const guildId = String(IDs.guilds?.main || client?.config?.mainGuildId || "");
    const guild = guildId
      ? await getClientGuildCached(client, guildId).catch(() => null)
      : null;
    if (guild) {
      const event = await findCurrentWeekMovieNightEvent(guild, now);
      raw = resolveTitleFromMovieNightEvent(event);
      if (!raw) {
        const storedEventId = String(hydrated?.eventId || state?.eventId || event?.id || "").trim();
        if (storedEventId) {
          const storedEvent = await fetchMovieNightEventById(guild, storedEventId);
          raw = resolveTitleFromMovieNightEvent(storedEvent);
        }
      }
    }
  }
  if (!raw) return null;
  const cleaned = extractMovieNightProposalTitle(raw) || String(raw).trim();
  if (!cleaned) return null;
  return (await resolveCanonicalMovieTitle(cleaned)) || cleaned;
}

async function describeFinalMovieTitleMiss(client, state, now = new Date()) {
  const bits = [];
  if (getFixedMovieTitleForWeek(now)) bits.push("schedule_ok");
  else bits.push("no_schedule");
  const voteCount = Array.isArray(state?.voteResults) ? state.voteResults.length : 0;
  bits.push(`voteResults=${voteCount}`);
  bits.push(state?.tieBreakerPollMessageId ? "tie_poll=yes" : "tie_poll=no");
  bits.push(state?.threadId ? `thread=${state.threadId}` : "thread=none");
  const guildId = String(IDs.guilds?.main || client?.config?.mainGuildId || "");
  const guild = guildId ? await getClientGuildCached(client, guildId).catch(() => null) : null;
  if (!guild) {
    bits.push("guild=missing");
    return bits.join(" ");
  }
  const event = await findCurrentWeekMovieNightEvent(guild, now);
  if (!event) {
    bits.push("event=not_found");
    return bits.join(" ");
  }
  const startDate = getMovieNightEventStartDate(event);
  const parts = startDate ? getRomeParts(startDate) : null;
  bits.push(`event=${event.id}`);
  bits.push(parts ? `eventStart=${parts.hour}:${String(parts.minute).padStart(2, "0")}` : "eventStart=?");
  const title = resolveTitleFromMovieNightEvent(event);
  bits.push(`eventName=${String(event.name || "").slice(0, 60)}`);
  bits.push(title ? `eventTitle=${title.slice(0, 40)}` : "eventTitle=unparsed");
  const discovered = await discoverMovieNightVoteThread(client, getRomeWeekKey(now)).catch(() => null);
  bits.push(discovered?.id ? `discoveredThread=${discovered.id}` : "discoveredThread=none");
  return bits.join(" ");
}

async function fetchAnnouncementChannel(client) {
  return (
    client.channels.cache.get(ANNOUNCEMENT_CHANNEL_ID) ||
    (await client.channels.fetch(ANNOUNCEMENT_CHANNEL_ID).catch(() => null))
  );
}

async function finalAnnouncementMessageStillExists(client, messageId) {
  const id = String(messageId || "").trim();
  if (!id) return false;
  const channel = await fetchAnnouncementChannel(client);
  if (!channel?.messages?.fetch) return false;
  const message = await channel.messages.fetch(id).catch(() => null);
  return Boolean(message?.id);
}

async function fetchStaffCommunicationChannel(client) {
  const cached = client.channels.cache.get(STAFF_COMMUNICATION_CHANNEL_ID) || null;
  if (cached?.isTextBased?.()) return cached;
  const fetched = await client.channels.fetch(STAFF_COMMUNICATION_CHANNEL_ID).catch(() => null);
  if (fetched?.isTextBased?.()) return fetched;
  const guildId = String(IDs.guilds?.main || client?.config?.mainGuildId || "");
  const guild = guildId ? await getClientGuildCached(client, guildId).catch(() => null) : null;
  if (!guild) return null;
  return getGuildChannelCached(guild, STAFF_COMMUNICATION_CHANNEL_ID).catch(() => null);
}

function messageTextHaystack(message) {
  const parts = [String(message?.content || "")];
  const embeds = Array.isArray(message?.embeds) ? message.embeds : [];
  for (const embed of embeds) {
    parts.push(String(embed?.title || ""), String(embed?.description || ""));
  }
  return parts.join("\n");
}

async function staffCommunicationMessageStillExists(client, messageId) {
  const id = String(messageId || "").trim();
  if (!id) return false;
  const channel = await fetchStaffCommunicationChannel(client);
  if (!channel?.messages?.fetch) return false;
  const message = await channel.messages.fetch(id).catch(() => null);
  return Boolean(message?.id);
}

async function staffCommunicationPostExistsInChannel(client, { title, weekKey, sinceMs } = {}) {
  const channel = await fetchStaffCommunicationChannel(client);
  if (!channel?.messages?.fetch) return false;
  const film = String(title || "").trim();
  if (!film) return false;
  const since = Number(sinceMs) || getWeekKeyStartMs(weekKey) || Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (!recent?.size) return false;
  const marker = /COMUNICAZIONE SERATA FILM/i;
  for (const message of recent.values()) {
    if (Number(message.createdTimestamp || 0) < since) continue;
    const haystack = messageTextHaystack(message);
    if (!marker.test(haystack)) continue;
    if (haystack.includes(film)) return true;
  }
  return false;
}

async function isMovieNightFinalPublicAnnouncePresent(client, state, weekKey, now = new Date()) {
  if (isMovieNightFixedScheduleSkipWeek(now)) return false;
  const messageId = String(state?.finalAnnouncementMessageId || "").trim();
  if (messageId && (await finalAnnouncementMessageStillExists(client, messageId))) return true;
  const wk = String(weekKey || "").trim();
  const sat = String(getRomeSaturdayKeyForWeek(now) || "").trim();
  if (!wk) return false;
  const announceStatus = await resolveMovieNightFinalAnnounceStatus(client, state, wk, sat, now);
  return Boolean(announceStatus.done);
}

function movieNightStaffCommunicationStatePatch(staffResult, saturdayKey) {
  if (!staffResult?.ok || staffResult.skipped) return {};
  const messageId = String(staffResult.messageId || "").trim();
  if (!messageId) return {};
  return {
    staffCommunicationMessageId: messageId,
    staffCommunicationAt: new Date().toISOString(),
    staffAnnouncedSaturdayKey: String(saturdayKey || ""),
  };
}

function getWeekKeyStartMs(weekKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(weekKey || "").trim());
  if (!match) return 0;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function buildMovieNightStaffCommunicationPayload({ title, now = new Date(), announceSlot = "" }) {
  return {
    content: buildMovieNightStaffCommunicationMessage({
      title,
      dateLabel: formatMovieNightStaffDateLabel(now, {
        advanceForSaturday: String(announceSlot || "").toLowerCase() === "friday",
      }),
    }),
    allowedMentions: { roles: [STAFF_COMMUNICATION_ROLE_ID] },
        __skipNoticeEmbed: true,
  };
}

async function fetchFinalAnnouncementMessage(client, messageId) {
  const id = String(messageId || "").trim();
  if (!id) return null;
  const channel = await fetchAnnouncementChannel(client);
  if (!channel?.messages?.fetch) return null;
  return channel.messages.fetch(id).catch(() => null);
}

async function resolveMovieNightFinalAnnounceStatus(client, state, weekKey, saturdayKey, now = new Date()) {
  const wk = String(weekKey || "").trim();
  const sat = String(saturdayKey || "").trim();
  if (!wk) return { done: false };
  const expectedTitle = getFixedMovieTitleForWeek(now) || null;
  const messageId = String(state?.finalAnnouncementMessageId || "").trim();
  const message = messageId ? await fetchFinalAnnouncementMessage(client, messageId) : null;
  const messageValid = Boolean(message?.id && isStageCloseMessageForWeekKey(message, wk));
  if (sat && String(state?.finalAnnouncedSaturdayKey || "") === sat) {
    const savedTitle = String(state?.finalMovieTitle || "").trim();
    if (expectedTitle && savedTitle !== expectedTitle) {
      if (messageValid) {
        return { done: true, reason: "already_announced_saturday_title_drift", repairTitle: expectedTitle };
      }
      return { done: false };
    }
    if (!messageId || messageValid) {
      return { done: true, reason: "already_announced_saturday" };
    }
    return { done: false };
  }
  if (messageId && String(state?.weekKey || "") === wk && messageValid) {
    const content = String(message.content || "");
    if (expectedTitle && !content.includes(expectedTitle)) {
      return {
        done: true,
        reason: "already_announced_title_drift",
        repairTitle: expectedTitle,
        repairSaturdayKey: Boolean(sat && String(state?.finalAnnouncedSaturdayKey || "") !== sat),
      };
    }
    return {
      done: true,
      reason: "already_announced",
      repairSaturdayKey: Boolean(sat && String(state?.finalAnnouncedSaturdayKey || "") !== sat),
      repairWeekKey: false,
    };
  }
  return { done: false };
}

async function resolveMovieNightStaffCommunicationStatus(client, state, saturdayKey, title, now = new Date(), weekKey = "") {
  if (isMovieNightFixedScheduleSkipWeek(now)) {
    return { done: true, reason: "fixed_schedule_skip" };
  }
  const sat = String(saturdayKey || "").trim();
  const resolvedTitle =
    String(title || state?.finalMovieTitle || "").trim() ||
    getFixedMovieTitleForWeek(now) ||
    "";
  if (!resolvedTitle) return { done: false, reason: "title_unavailable" };
  if (!sat || String(state?.staffAnnouncedSaturdayKey || "") !== sat) {
    return { done: false, reason: "different_week" };
  }
  const messageId = String(state?.staffCommunicationMessageId || "").trim();
  if (messageId) {
    const channel = await fetchStaffCommunicationChannel(client);
    const message = channel?.messages?.fetch ? await channel.messages.fetch(messageId).catch(() => null) : null;
    if (message?.id && messageTextHaystack(message).includes(resolvedTitle)) {
      return { done: true, reason: "already_announced_this_week", messageId: String(message.id || "") };
    }
  }
  if (await staffCommunicationPostExistsInChannel(client, { title: resolvedTitle, weekKey })) {
    return { done: true, reason: "already_announced_channel_scan" };
  }
  return { done: false, reason: "needs_send" };
}

async function resolveMovieNightEventStartStatus(client, state, weekKey) {
  const wk = String(weekKey || "").trim();
  if (!wk || String(state?.weekKey || "") !== wk) return { done: false };
  const messageId = String(state?.eventStartMessageId || "").trim();
  if (!messageId) return { done: false };
  const announcedAt = String(state?.eventStartAnnouncedAt || "").trim();
  if (announcedAt && getRomeWeekKey(new Date(announcedAt)) !== wk) return { done: false };
  const channel = await fetchAnnouncementChannel(client);
  if (!channel?.messages?.fetch) return { done: false };
  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message?.id) return { done: false };
  if (getRomeWeekKey(new Date(Number(message.createdTimestamp || 0))) !== wk) return { done: false };
  return { done: true, reason: "already_announced" };
}

async function repairMovieNightFinalAnnounceState(client, state, weekKey, saturdayKey, status) {
  if (!status || typeof state !== "object") return state;
  const sat = String(saturdayKey || "").trim();
  const needsRepair =
    status.repairSaturdayKey || status.repairWeekKey || status.repairTitle;
  if (!needsRepair) return state;
  const next = {
    ...state,
    weekKey: String(weekKey || state.weekKey || ""),
  };
  if (sat && status.repairSaturdayKey) next.finalAnnouncedSaturdayKey = sat;
  if (status.repairTitle) next.finalMovieTitle = String(status.repairTitle);
  await setBotState(STATE_KEY, next);
  return next;
}

async function repairMovieNightStaffCommunicationState(client, state, saturdayKey, status) {
  if (!status?.repairSaturdayKey || !state || typeof state !== "object") return state;
  const sat = String(saturdayKey || "").trim();
  if (!sat) return state;
  const next = {
    ...state,
    staffAnnouncedSaturdayKey: sat,
  };
  await setBotState(STATE_KEY, next);
  return next;
}

function logMovieNightFinalResult(result, label = "") {
  if (!result || result.ok || result.skipped) return;
  const tag = label ? `[MOVIE NIGHT FINAL] ${label}` : "[MOVIE NIGHT FINAL]";
  global.logger?.warn?.(`${tag} errore:`, result.reason || "unknown");
}

async function maybePublishMovieNightStaffCommunication(client, { state, saturdayKey, weekKey, now, announceSlot, title }) {
  if (isMovieNightFixedScheduleSkipWeek(now)) {
    return { ok: true, skipped: true, reason: "fixed_schedule_skip", weekKey };
  }
  const resolvedTitle =
    String(title || state?.finalMovieTitle || "").trim() ||
    getFixedMovieTitleForWeek(now) ||
    (await resolveFinalMovieTitle(client, state, now).catch(() => null));
  if (!resolvedTitle) {
    global.logger?.warn?.("[MOVIE NIGHT STAFF] titolo non disponibile", weekKey ? `week=${weekKey}` : "");
    return { ok: false, reason: "title_unavailable", weekKey };
  }

  const staffStatus = await resolveMovieNightStaffCommunicationStatus(client, state, saturdayKey, resolvedTitle, now, weekKey);
  if (staffStatus.done) {
    return {
      ok: true,
      skipped: true,
      messageId: staffStatus.messageId || String(state?.staffCommunicationMessageId || ""),
      weekKey,
    };
  }

  const channel = await fetchStaffCommunicationChannel(client);
  if (!channel?.isTextBased?.() || !channel?.send) {
    return { ok: false, reason: "staff_channel_unavailable", weekKey, channelId: STAFF_COMMUNICATION_CHANNEL_ID };
  }

  if (isMovieNightFixedScheduleSkipWeek(now)) {
    return { ok: true, skipped: true, reason: "fixed_schedule_skip", weekKey };
  }

  try {
    const message = await channel.send(
      buildMovieNightStaffCommunicationPayload({
        title: resolvedTitle,
        now,
        announceSlot,
      }),
    );
    return { ok: true, messageId: String(message.id || ""), weekKey };
  } catch (err) {
    const result = {
      ok: false,
      reason: "staff_send_failed",
      weekKey,
      detail: String(err?.message || err || ""),
    };
    global.logger?.warn?.(
      "[MOVIE NIGHT STAFF] invio fallito:",
      result.reason,
      weekKey ? `week=${weekKey}` : "",
      result.detail ? `(${result.detail})` : "",
    );
    return result;
  }
}

async function runMovieNightFinalAnnouncementCheck(client, opts = {}) {
  if (movieNightFinalAnnouncementRunning) {
    const out = { skipped: true, reason: "already_running" };
    logMovieNightFinalResult(out, "concurrent");
    return out;
  }
  movieNightFinalAnnouncementRunning = true;
  try {
    if (!isMongoReady()) {
      const out = { skipped: true, reason: "mongo_not_ready" };
      logMovieNightFinalResult(out);
      return out;
    }
    const now = opts.now || new Date();
    const weekKey = getRomeWeekKey(now);
    const saturdayKey = getRomeSaturdayKeyForWeek(now);
    const announceSlot = getMovieNightFinalAnnouncementSlot(now, opts.slot);
    if (!opts.force && !announceSlot) {
      const out = { skipped: true, reason: "outside_final_announce_slot", weekKey };
      logMovieNightFinalResult(out);
      return out;
    }
    let state = await hydrateMovieNightStateForWeek(client, await getBotState(STATE_KEY, null), weekKey);
    if (announceSlot === "friday" && !opts.force && hasMovieNightSpareggio(state)) {
      const out = { skipped: true, reason: "spareggio_deferred_to_saturday", weekKey, saturdayKey };
      logMovieNightFinalResult(out);
      return out;
    }
    if (announceSlot === "friday" && state?.threadId && !state?.closedAt) {
      await runMovieNightThreadCloseCheck(client, { now }).catch((err) => {
        global.logger?.warn?.("[MOVIE NIGHT FINAL] friday thread close before announce failed:", err?.message || err);
      });
      state = (await hydrateMovieNightStateForWeek(client, await getBotState(STATE_KEY, null), weekKey)) || state;
      if (!opts.force && hasMovieNightSpareggio(state)) {
        const out = { skipped: true, reason: "spareggio_deferred_to_saturday", weekKey, saturdayKey };
        logMovieNightFinalResult(out);
        return out;
      }
    }
    if (state?.threadId && !state?.closedAt && announceSlot !== "friday") {
      await runMovieNightThreadCloseCheck(client, { now }).catch((err) => {
        global.logger?.warn?.("[MOVIE NIGHT FINAL] thread close before announce failed:", err?.message || err);
      });
      state = (await hydrateMovieNightStateForWeek(client, await getBotState(STATE_KEY, null), weekKey)) || state;
    }
    const fixedSchedule = getHarryPotterMovieNightScheduleForWeek(now);
    if (fixedSchedule?.skip) {
      const out = { skipped: true, reason: "fixed_schedule_skip", weekKey };
      logMovieNightFinalResult(out);
      return out;
    }
    const hasFixedMovie = Boolean(getFixedMovieTitleForWeek(now));
    const allowWithoutMondayState =
      hasFixedMovie || FINAL_ANNOUNCEMENT_EXTRA_BEFORE_PING_SATURDAYS.has(saturdayKey);
    if (state?.weekKey !== weekKey && !allowWithoutMondayState) {
      const out = {
        skipped: true,
        reason: "state_not_current_week",
        weekKey,
        stateWeekKey: state?.weekKey || null,
      };
      logMovieNightFinalResult(out);
      return out;
    }
    if (!opts.force) {
      const announceStatus = await resolveMovieNightFinalAnnounceStatus(client, state, weekKey, saturdayKey, now);
      if (announceStatus.done) {
        state = await repairMovieNightFinalAnnounceState(client, state, weekKey, saturdayKey, announceStatus);
        /* movieDescWiki1: ripara anche descrizione fallback (non solo title drift) */
        const needsDescRepair =
          Boolean(announceStatus.repairTitle) ||
          isFallbackMovieDescription(state?.finalMovieDescription);
        if (needsDescRepair) {
          await repairFinalMovieNightAnnouncementDescription(client).catch((err) => {
            global.logger?.warn?.("[MOVIE NIGHT FINAL] description repair failed:", err?.message || err);
          });
        }
        const staffResult = await maybePublishMovieNightStaffCommunication(client, {
          state,
          saturdayKey,
          weekKey,
          now,
          announceSlot,
          title: state?.finalMovieTitle || getFixedMovieTitleForWeek(now),
        });
        const staffPatch = movieNightStaffCommunicationStatePatch(staffResult, saturdayKey);
        if (Object.keys(staffPatch).length) {
          await setBotState(STATE_KEY, {
            ...state,
            ...staffPatch,
          });
        }
        const out = {
          skipped: true,
          reason: announceStatus.reason || "already_announced",
          weekKey,
          saturdayKey,
        };
        logMovieNightFinalResult(out);
        return out;
      }
    }

    const title = await resolveFinalMovieTitle(client, state, now);
    if (!title) {
      const detail = await describeFinalMovieTitleMiss(client, state, now).catch(() => "");
      const out = { skipped: true, reason: "winner_unavailable", weekKey, detail };
      logMovieNightFinalResult(out);
      if (detail) global.logger?.warn?.("[MOVIE NIGHT FINAL] winner_unavailable:", detail);
      return out;
    }

    const channel = await fetchAnnouncementChannel(client);
    if (!channel?.isTextBased?.() || !channel?.send) {
      const out = { skipped: true, reason: "announcement_channel_unavailable", weekKey };
      logMovieNightFinalResult(out);
      return out;
    }

    const description = await fetchItalianMovieDescription(title);
    const guildId = String(IDs.guilds?.main || client?.config?.mainGuildId || "");
    const guild = guildId ? await getClientGuildCached(client, guildId).catch(() => null) : null;
    const event = guild ? await findCurrentWeekMovieNightEvent(guild, now) : null;
    const previousState =
      state?.weekKey === weekKey && typeof state === "object"
        ? state
        : typeof state === "object"
          ? state
          : {};
    const message = await channel.send({
      content: buildFinalMovieNightAnnouncementMessage({
        title,
        description,
        eventUrl: buildDiscordEventUrl(previousState?.guildId || guildId || IDs.guilds?.main, previousState?.eventId || event?.id),
        saturdayKey,
        announceSlot,
        hogwartsEventActive: isHogwartsWeeklyTopReplaced(client),
      }),
      allowedMentions: { roles: [...new Set([EVENTS_ROLE_ID, SERATA_FILM_ROLE_ID].filter(Boolean))] },
      __skipNoticeEmbed: true,
    });

    const staffResult = await maybePublishMovieNightStaffCommunication(client, {
      state: previousState,
      saturdayKey,
      weekKey,
      now,
      announceSlot,
      title,
    });
    await setBotState(STATE_KEY, {
      ...previousState,
      weekKey,
      guildId: String(guild?.id || previousState?.guildId || guildId || ""),
      eventId: String(event?.id || previousState?.eventId || ""),
      finalMovieTitle: title,
      finalMovieDescription: description,
      finalAnnouncementMessageId: String(message.id || ""),
      finalAnnouncedSaturdayKey: saturdayKey,
      finalAnnouncedAt: new Date().toISOString(),
      ...movieNightStaffCommunicationStatePatch(staffResult, saturdayKey),
    });
    const out = {
      ok: true,
      title,
      messageId: String(message.id || ""),
      staffCommunicationMessageId: staffResult?.ok ? String(staffResult.messageId || "") : "",
      weekKey,
    };
    logMovieNightFinalResult(out);
    return out;
  } finally {
    movieNightFinalAnnouncementRunning = false;
  }
}

async function openMovieNightStagePermissions(guild) {
  const channel = guild.channels.cache.get(MOVIE_NIGHT_EVENT_CHANNEL_ID) || (await getGuildChannelCached(guild, MOVIE_NIGHT_EVENT_CHANNEL_ID));
  if (!channel?.permissionOverwrites?.edit) return false;

  const permissionPatch = {
    ViewChannel: true,
    Connect: true,
  };
  await channel.permissionOverwrites.edit(guild.roles.everyone.id, permissionPatch, { reason: "Apertura Serata Film", type: OverwriteType.Role }).catch((err) => {
    global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] everyone permission open failed:", err?.message || err);
  });
  const memberRoleId = String(IDs.roles?.Member || "");
  if (memberRoleId) {
    await channel.permissionOverwrites.edit(memberRoleId, permissionPatch, { reason: "Apertura Serata Film", type: OverwriteType.Role }).catch((err) => {
      global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] member permission open failed:", err?.message || err);
    });
  }
  return true;
}

async function closeMovieNightStagePermissions(guild) {
  const channel = guild.channels.cache.get(MOVIE_NIGHT_EVENT_CHANNEL_ID) || (await getGuildChannelCached(guild, MOVIE_NIGHT_EVENT_CHANNEL_ID));
  if (!channel?.permissionOverwrites?.edit) return false;

  const permissionPatch = {
    Connect: false,
  };
  await channel.permissionOverwrites.edit(guild.roles.everyone.id, permissionPatch, { reason: "Chiusura Serata Film", type: OverwriteType.Role }).catch((err) => {
    global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] everyone permission close failed:", err?.message || err);
  });
  const memberRoleId = String(IDs.roles?.Member || "");
  if (memberRoleId) {
    await channel.permissionOverwrites.edit(memberRoleId, permissionPatch, { reason: "Chiusura Serata Film", type: OverwriteType.Role }).catch((err) => {
      global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] member permission close failed:", err?.message || err);
    });
  }
  return true;
}

async function handleMovieNightEventStart(event, opts = {}) {
  const now = opts.now || new Date();
  const startDate = event?.scheduledStartAt || (event?.scheduledStartTimestamp ? new Date(event.scheduledStartTimestamp) : now);
  const fixedSchedule = getHarryPotterMovieNightScheduleForWeek(startDate);
  if (fixedSchedule?.skip) return { skipped: true, reason: "fixed_schedule_skip" };
  if (!isTargetMovieNightEvent(event, now) && !isFixedScheduleMovieNightEvent(event, now)) return { skipped: true, reason: "not_movie_night_event" };
  const guild = event.guild || (await event.client?.guilds?.fetch?.(event.guildId).catch(() => null));
  if (!guild) return { skipped: true, reason: "guild_unavailable" };
  const client = event.client || guild.client;
  const weekKey = getRomeWeekKey(startDate);
  const state = await getBotState(STATE_KEY, null);
  if (!opts.force) {
    const startStatus = await resolveMovieNightEventStartStatus(client, state, weekKey);
    if (startStatus.done) {
      let permissionsOpened = false;
      if (!String(state?.stagePermissionsOpenedAt || "").trim() || String(state?.weekKey || "") !== weekKey) {
        permissionsOpened = await openMovieNightStagePermissions(guild);
        if (permissionsOpened && state && typeof state === "object") {
          await setBotState(STATE_KEY, {
            ...state,
            weekKey,
            stagePermissionsOpenedAt: new Date().toISOString(),
          });
        }
      }
      await startSerataFilmHouseAttendanceSession(guild).catch((err) => {
        global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] serata film house attendance start failed:", err?.message || err);
      });
      await startSerataFilmSession(event).catch((err) => {
        global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] serata film staff session start failed:", err?.message || err);
      });
      return { skipped: true, reason: startStatus.reason || "already_announced", weekKey, permissionsOpened };
    }
  }

  const permissionsOpened = await openMovieNightStagePermissions(guild);
  const title = (await resolveFinalMovieTitle(client, state, startDate).catch(() => null)) || state?.finalMovieTitle || "il film scelto";
  const channel = guild.channels.cache.get(ANNOUNCEMENT_CHANNEL_ID) || (await getGuildChannelCached(guild, ANNOUNCEMENT_CHANNEL_ID));
  if (!channel?.isTextBased?.() || !channel?.send) {
    return { skipped: true, reason: "announcement_channel_unavailable", weekKey, permissionsOpened };
  }

  const message = await channel.send({
    content: buildMovieNightStartAnnouncementMessage(title),
    allowedMentions: { parse: ["everyone"], roles: [SERATA_FILM_ROLE_ID] },
    __skipNoticeEmbed: true,
  });
  await setBotState(STATE_KEY, {
    ...(state && typeof state === "object" ? state : {}),
    weekKey,
    guildId: String(guild.id || ""),
    eventId: String(event.id || state?.eventId || ""),
    eventStartMovieTitle: title,
    eventStartMessageId: String(message.id || ""),
    stagePermissionsOpenedAt: permissionsOpened ? new Date().toISOString() : state?.stagePermissionsOpenedAt || "",
    eventStartAnnouncedAt: new Date().toISOString(),
  });
  await startSerataFilmHouseAttendanceSession(guild).catch((err) => {
    global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] serata film house attendance start failed:", err?.message || err);
  });
  await startSerataFilmSession(event).catch((err) => {
    global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] serata film staff session start failed:", err?.message || err);
  });
  return { ok: true, messageId: String(message.id || ""), title, permissionsOpened, weekKey };
}

async function resolveTextChannelForMovieNight(clientOrGuild) {
  const guild = clientOrGuild?.guilds ? null : clientOrGuild;
  const client = clientOrGuild?.guilds ? clientOrGuild : guild?.client;
  if (guild) {
    return guild.channels.cache.get(ANNOUNCEMENT_CHANNEL_ID) || (await getGuildChannelCached(guild, ANNOUNCEMENT_CHANNEL_ID));
  }
  return client?.channels?.cache?.get(ANNOUNCEMENT_CHANNEL_ID) || (await client?.channels?.fetch?.(ANNOUNCEMENT_CHANNEL_ID).catch(() => null));
}

function pickOpenReviewThreadStateFields(state) {
  if (!state || typeof state !== "object") return {};
  const threadId = String(state.reviewThreadId || "").trim();
  if (!threadId || state.reviewThreadClosedAt) return {};
  return {
    reviewThreadId: threadId,
    reviewThreadCloseAt: Number(state.reviewThreadCloseAt || 0) || null,
    stageCloseMessageId: String(state.stageCloseMessageId || ""),
    stageCloseMovieTitle: String(state.stageCloseMovieTitle || ""),
    stageClosedAt: String(state.stageClosedAt || ""),
    stagePermissionsClosedAt: String(state.stagePermissionsClosedAt || ""),
  };
}

function resolveReviewThreadCloseAtFromStageCloseMessage(message, state = null) {
  const fromState = Number(state?.reviewThreadCloseAt || 0);
    if (fromState > Date.now()) return fromState;
  const created = Number(message?.createdTimestamp || 0);
  if (created > 0) return created + REVIEW_THREAD_CLOSE_AFTER_MS;
  return Date.now() + REVIEW_THREAD_CLOSE_AFTER_MS;
}

async function discoverOpenMovieNightReviewThread(client) {
  const channel = await resolveTextChannelForMovieNight(client);
  if (!channel?.messages?.fetch) return null;
  const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (!messages?.size) return null;
  for (const message of messages.values()) {
    if (!isMovieNightStageCloseMessage(message, client, REVIEW_THREAD_DISCOVERY_MAX_AGE_MS)) continue;
    const thread = await resolveReviewThreadFromMessage(message);
    if (!thread?.isThread?.()) continue;
    if (thread.locked && thread.archived) continue;
    return {
      threadId: String(thread.id),
      closeAt: resolveReviewThreadCloseAtFromStageCloseMessage(message),
      stageCloseMessageId: String(message.id || ""),
    };
  }
  return null;
}

async function syncMovieNightReviewThreadClosedState(client, state) {
  const threadId = String(state?.reviewThreadId || "").trim();
  if (!threadId || state?.reviewThreadClosedAt) return state;
  const thread = client.channels.cache.get(threadId) || (await client.channels.fetch(threadId).catch(() => null));
  if (!thread?.isThread?.() || !thread.locked || !thread.archived) return state;
  const next = {
    ...state,
    reviewThreadClosedAt: new Date().toISOString(),
  };
  const saved = await setBotState(STATE_KEY, next);
  return saved ? next : state;
}

async function ensureMovieNightReviewThreadTracking(client) {
  let state = await getBotState(STATE_KEY, null);
  if (state?.reviewThreadId && !state?.reviewThreadClosedAt) {
    state = await syncMovieNightReviewThreadClosedState(client, state);
    if (state?.reviewThreadClosedAt) {
      return { ok: true, source: "state_sync", threadId: String(state.reviewThreadId || ""), alreadyClosed: true };
    }
    const closeAt = Number(state.reviewThreadCloseAt || 0);
        if (closeAt > Date.now()) scheduleMovieNightReviewThreadClose(client, closeAt);
    return { ok: true, source: "state", threadId: String(state.reviewThreadId || ""), closeAt };
  }

  const discovered = await discoverOpenMovieNightReviewThread(client);
  if (discovered?.threadId) {
    const nextState = {
      ...(state && typeof state === "object" ? state : {}),
      reviewThreadId: discovered.threadId,
      reviewThreadCloseAt: discovered.closeAt,
      reviewThreadClosedAt: "",
      stageCloseMessageId: discovered.stageCloseMessageId || state?.stageCloseMessageId || "",
    };
    await setBotState(STATE_KEY, nextState);
    if (Number(discovered.closeAt || 0) > Date.now()) {
      scheduleMovieNightReviewThreadClose(client, discovered.closeAt);
    }
    return { ok: true, source: "discovered", threadId: discovered.threadId, closeAt: discovered.closeAt };
  }

    const channel = await resolveTextChannelForMovieNight(client);
  const weekKey = String(state?.weekKey || getRomeWeekKey()).trim();
  const endMessage =
    (await findRecentMovieNightEndAnnouncementInChannel(
      channel,
      client,
      weekKey,
      REVIEW_THREAD_DISCOVERY_MAX_AGE_MS,
    ).catch(() => null)) ||
    (await findRecentMovieNightEndAnnouncementInChannel(
      channel,
      client,
      "",
      REVIEW_THREAD_DISCOVERY_MAX_AGE_MS,
    ).catch(() => null));
  if (!endMessage) {
    return {
      skipped: true,
      reason: state?.reviewThreadClosedAt ? "already_closed_in_state" : "no_open_review_thread",
    };
  }

  const mainGuildId = String(IDs.guilds?.main || client?.config?.mainGuildId || "");
  const guild =
    (mainGuildId ? await getClientGuildCached(client, mainGuildId).catch(() => null) : null) ||
    endMessage.guild ||
    null;
  const title =
    state?.stageCloseMovieTitle ||
    state?.finalMovieTitle ||
    state?.eventStartMovieTitle ||
    "il film scelto";
  const ensured = await ensureReviewThreadForEndMessage(endMessage, {
    client,
    guild,
    weekKey: weekKey || getRomeWeekKey(),
    title,
    state,
    permissionsClosed: Boolean(state?.stagePermissionsClosedAt),
  });
  if (!ensured.thread?.id) return { skipped: true, reason: "review_thread_create_failed" };
  return {
    ok: true,
    source: "created_missing",
    threadId: String(ensured.thread.id),
    closeAt: ensured.reviewThreadCloseAt,
  };
}

async function closeReviewThreadById(client, threadId) {
  const id = String(threadId || "");
  if (!id) return { ok: false, alreadyClosed: false };
  let thread = client.channels.cache.get(id) || (await client.channels.fetch(id).catch(() => null));
  if (!thread?.isThread?.()) return { ok: false, alreadyClosed: false };
  if (thread.locked && thread.archived) {
    return { ok: true, alreadyClosed: true };
  }
  if (thread.archived && !thread.locked) {
    await thread.setArchived(false, "Riapertura tecnica per bloccare recensioni Serata Film").catch(() => null);
    thread = (await client.channels.fetch(id).catch(() => null)) || thread;
  }
  if (!thread.locked && thread.setLocked) {
    await thread.setLocked(true, "Chiusura recensioni Serata Film").catch((err) => {
      global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] review thread lock failed:", err?.message || err);
    });
    thread = (await client.channels.fetch(id).catch(() => null)) || thread;
  }
  if (!thread.archived && thread.setArchived) {
    await thread.setArchived(true, "Chiusura recensioni Serata Film").catch((err) => {
      global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] review thread archive failed:", err?.message || err);
    });
    thread = (await client.channels.fetch(id).catch(() => null)) || thread;
  }
  const done = Boolean(thread?.locked && thread.archived);
  return { ok: done, alreadyClosed: false };
}

const reviewThreadCloseLogOnce = new Set();

async function closeMovieNightReviewThreadIfDue(client, opts = {}) {
  await ensureMovieNightReviewThreadTracking(client).catch((err) => {
    global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] review thread tracking failed:", err?.message || err);
  });
  let state = await getBotState(STATE_KEY, null);
  if (!state?.reviewThreadId || state?.reviewThreadClosedAt) {
    return { skipped: true, reason: "no_open_review_thread" };
  }
  const closeAt = Number(state.reviewThreadCloseAt || 0);
  if (!opts.force && (!closeAt || Date.now() < closeAt)) return { skipped: true, reason: "not_due" };
  const threadId = String(state.reviewThreadId || "");
  const closeResult = await closeReviewThreadById(client, threadId);
  if (!closeResult?.ok) return { skipped: true, reason: "thread_close_failed" };
  const saved = await setBotState(STATE_KEY, {
    ...state,
    reviewThreadClosedAt: new Date().toISOString(),
  });
  if (!saved) {
    if (!reviewThreadCloseLogOnce.has(`persist:${threadId}`)) {
      reviewThreadCloseLogOnce.add(`persist:${threadId}`);
      global.logger?.warn?.(
        "[MOVIE NIGHT ANNOUNCE] review thread closed on Discord but state persist failed:",
        threadId,
      );
    }
    return { ok: false, reason: "persist_failed", threadId };
  }
  return { ok: true, threadId, alreadyClosed: Boolean(closeResult.alreadyClosed) };
}

function scheduleMovieNightReviewThreadClose(client, closeAt) {
  if (movieNightReviewCloseTimer) clearTimeout(movieNightReviewCloseTimer);
  const dueAt = Number(closeAt || 0);
  if (!dueAt || dueAt <= Date.now()) {
        movieNightReviewCloseTimer = null;
    closeMovieNightReviewThreadIfDue(client, { force: true }).catch((err) => {
      global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] review thread close timer failed:", err?.message || err);
    });
    return;
  }
  const delay = Math.max(1000, dueAt - Date.now());
  movieNightReviewCloseTimer = setTimeout(() => {
    movieNightReviewCloseTimer = null;
    closeMovieNightReviewThreadIfDue(client, { force: true }).catch((err) => {
      global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] review thread close timer failed:", err?.message || err);
    });
  }, delay);
  movieNightReviewCloseTimer.unref?.();
}

async function withMovieNightStageCloseLock(weekKey, fn) {
  const lockKey = String(weekKey || "");
  const prev = movieNightStageCloseLocksByWeek.get(lockKey) || Promise.resolve();
  const mine = prev.catch(() => {}).then(() => fn());
  movieNightStageCloseLocksByWeek.set(lockKey, mine);
  try {
    return await mine;
  } finally {
    if (movieNightStageCloseLocksByWeek.get(lockKey) === mine) {
      movieNightStageCloseLocksByWeek.delete(lockKey);
    }
  }
}

function isMovieNightStageCloseMessage(message, client, maxAgeMs = MOVIE_NIGHT_END_ANNOUNCE_DEDUPE_MS) {
  if (!message) return false;
  const botId = String(client?.user?.id || "");
  if (botId && String(message.author?.id || "") !== botId) return false;
  if (!String(message.content || "").includes(MOVIE_NIGHT_END_ANNOUNCE_MARKER)) return false;
  const age = Date.now() - Number(message.createdTimestamp || 0);
  return age >= 0 && age <= maxAgeMs;
}

async function findRecentMovieNightEndAnnouncementInChannel(channel, client, weekKey, maxAgeMs = MOVIE_NIGHT_END_ANNOUNCE_DEDUPE_MS) {
  if (!channel?.messages?.fetch) return null;
  const wk = String(weekKey || "").trim();
  const messages = await channel.messages.fetch({ limit: 25 }).catch(() => null);
  if (!messages?.size) return null;
  for (const message of messages.values()) {
    if (!isMovieNightStageCloseMessage(message, client, maxAgeMs)) continue;
    if (wk && !isStageCloseMessageForWeekKey(message, wk)) continue;
    return message;
  }
  return null;
}

async function claimMovieNightStageCloseSlot(weekKey) {
  if (!isMongoReady()) return { claimed: true, reason: "no_mongo" };
  const stageCloseIdPath = `value.${STATE_KEY}.stageCloseMessageId`;
  const weekKeyPath = `value.${STATE_KEY}.weekKey`;
  try {
    const compact = await BotState.findOne({ key: COMPACT_BOTSTATE_KEY }).lean();
    if (!compact) {
      const state = await getBotState(STATE_KEY, null);
      if (state?.weekKey === weekKey && state?.stageCloseMessageId && state.stageCloseMessageId !== "pending") {
        return { claimed: false, reason: "already_announced", state };
      }
      await setBotState(STATE_KEY, {
        ...(state && typeof state === "object" ? state : {}),
        weekKey,
        stageCloseMessageId: "pending",
      });
      return { claimed: true, reason: "legacy_reserve" };
    }
    const result = await BotState.updateOne(
      {
        key: COMPACT_BOTSTATE_KEY,
        $or: [
          { [weekKeyPath]: { $ne: weekKey } },
          { [stageCloseIdPath]: { $exists: false } },
          { [stageCloseIdPath]: null },
          { [stageCloseIdPath]: "" },
        ],
      },
      {
        $set: {
          [stageCloseIdPath]: "pending",
          [weekKeyPath]: weekKey,
        },
      },
    );
    if (Number(result?.modifiedCount || 0) > 0) return { claimed: true };
    const state = await getBotState(STATE_KEY, null);
    if (state?.weekKey === weekKey && state?.stageCloseMessageId && state.stageCloseMessageId !== "pending") {
      return { claimed: false, reason: "already_announced", state };
    }
    return { claimed: false, reason: "pending_other", state };
  } catch (err) {
    global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] stage close claim failed:", err?.message || err);
    return { claimed: true, reason: "claim_error_fallback" };
  }
}

async function resolveReviewThreadFromMessage(message) {
  if (!message) return null;
  if (message.thread?.isThread?.()) return message.thread;
  const fetched = await message.fetch?.().catch(() => null);
  if (fetched?.thread?.isThread?.()) return fetched.thread;
    const threadId = String(message.id || "").trim();
  const client = message.client;
  if (!threadId || !client?.channels?.fetch) return null;
  const byId =
    client.channels.cache.get(threadId) ||
    (await client.channels.fetch(threadId).catch(() => null));
  return byId?.isThread?.() ? byId : null;
}

async function createMovieNightReviewThread(message) {
  if (!message?.startThread) return null;
  const existing = await resolveReviewThreadFromMessage(message);
  if (existing?.id) return existing;

  const attempts = [
    { autoArchiveDuration: 1440 },
    { autoArchiveDuration: 10080 },
    { autoArchiveDuration: 60 },
  ];
  for (let i = 0; i < attempts.length; i += 1) {
    const opts = attempts[i];
    const thread = await message
      .startThread({
        name: REVIEW_THREAD_NAME,
        reason: "Thread automatico recensioni e suggerimenti Serata Film",
        ...opts,
      })
      .catch((err) => {
        global.logger?.warn?.(
          "[MOVIE NIGHT ANNOUNCE] review thread create failed:",
          `archive=${opts.autoArchiveDuration}`,
          err?.code || "",
          err?.message || err,
        );
        return null;
      });
    if (thread?.id) return thread;
    if (i < attempts.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
  }
  return null;
}

async function ensureReviewThreadForEndMessage(message, {
  client,
  guild,
  weekKey,
  title,
  state,
  permissionsClosed = false,
} = {}) {
  if (!message?.id) return { thread: null, created: false };
  let thread = await resolveReviewThreadFromMessage(message);
  let created = false;
  if (!thread?.id) {
    thread = await createMovieNightReviewThread(message);
    created = Boolean(thread?.id);
  }
  if (!thread?.id) return { thread: null, created: false };

  const nextContent = withReviewThreadMentionInEndContent(message.content, thread.id);
  if (nextContent && nextContent !== String(message.content || "") && message.editable) {
    await message.edit({ content: nextContent }).catch((err) => {
      global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] review thread mention edit failed:", err?.message || err);
    });
  }

  const reviewThreadCloseAt = created
    ? resolveReviewThreadCloseAtFromStageCloseMessage(message, null)
    : resolveReviewThreadCloseAtFromStageCloseMessage(message, state);
  if (guild && weekKey) {
    await persistMovieNightStageCloseState({
      state,
      guild,
      weekKey,
      title: title || state?.stageCloseMovieTitle || "il film scelto",
      messageId: message.id,
      threadId: thread.id,
      reviewThreadCloseAt,
      permissionsClosed: permissionsClosed || Boolean(state?.stagePermissionsClosedAt),
    });
  }
  if (client) scheduleMovieNightReviewThreadClose(client, reviewThreadCloseAt);
  return { thread, created, reviewThreadCloseAt };
}

async function persistMovieNightStageCloseState({
  state,
  guild,
  weekKey,
  title,
  messageId,
  threadId,
  reviewThreadCloseAt,
  permissionsClosed,
}) {
  const saturdayKey = getRomeSaturdayKeyForWeek(new Date());
  const watchedMovieTitles = mergeWatchedTitleEntries(state?.watchedMovieTitles, {
    title,
    source: "stage_close",
    weekKey,
    saturdayKey,
    at: new Date().toISOString(),
  });
  await setBotState(STATE_KEY, {
    ...(state && typeof state === "object" ? state : {}),
    weekKey,
    guildId: String(guild.id || ""),
    stageCloseMovieTitle: title,
    stageCloseMessageId: String(messageId || ""),
    reviewThreadId: String(threadId || ""),
    reviewThreadCloseAt,
    reviewThreadClosedAt: threadId ? "" : state?.reviewThreadClosedAt || "",
    stagePermissionsClosedAt: permissionsClosed ? new Date().toISOString() : state?.stagePermissionsClosedAt || "",
    stageClosedAt: new Date().toISOString(),
    watchedMovieTitles,
  });
}

async function maybePublishSerataFilmHouseLeaderboard(client, guild, weekKey, state, movieTitle, lbResult = null) {
  if (!client || !guild || !weekKey) return null;
  try {
    const result = lbResult || await resolveSerataFilmHouseLeaderboard(client, {
      guild,
      weekKey,
      state,
      movieTitle,
      skipDiscordSends: true,
    });
    if (!result?.ok || !result.embed) return result;
    await sendSerataFilmHouseLeaderboardToReportChannel(client, result, { skipIfPublished: true });
    return result;
  } catch (err) {
    global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] serata film house leaderboard failed:", err?.message || err);
    return null;
  }
}

async function isSerataFilmStageLive(guild) {
  if (!guild) return false;
  const channel = guild.channels.cache.get(MOVIE_NIGHT_EVENT_CHANNEL_ID)
    || (await getGuildChannelCached(guild, MOVIE_NIGHT_EVENT_CHANNEL_ID).catch(() => null));
  if (channel?.stageInstance) return true;
  const cached = guild.stageInstances?.cache?.find?.((row) => String(row?.channelId || "") === MOVIE_NIGHT_EVENT_CHANNEL_ID);
  if (cached) return true;
  const fetched = await guild.stageInstances?.fetch?.().catch(() => null);
  return Boolean(fetched?.find?.((row) => String(row?.channelId || "") === MOVIE_NIGHT_EVENT_CHANNEL_ID));
}

async function repairMovieNightEndAnnouncementLeaderboard(client, { guild, weekKey, state, title, lbResult = null } = {}) {
  if (!client || !isHogwartsWeeklyTopReplaced(client)) return { skipped: true, reason: "hogwarts_inactive" };
  const messageId = String(state?.stageCloseMessageId || "").trim();
  if (!messageId || messageId === "pending") return { skipped: true, reason: "no_close_message" };
  const channel = await resolveTextChannelForMovieNight(guild || client);
  if (!channel?.messages?.fetch) return { skipped: true, reason: "channel_unavailable" };
  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message?.edit) return { skipped: true, reason: "message_unavailable" };
  const wk = String(weekKey || state?.weekKey || getRomeWeekKey()).trim();
  if (!isStageCloseMessageForWeekKey(message, wk)) {
    return { skipped: true, reason: "message_wrong_week" };
  }
  const previous = String(message.content || "");
  if (previous.includes("Top casate più attive in vocale")) return { skipped: true, reason: "already_has_leaderboard" };
  const filmTitle = String(title || state?.stageCloseMovieTitle || state?.finalMovieTitle || "il film scelto").trim();
  const lbState = {
    ...(state && typeof state === "object" ? state : {}),
    weekKey: wk,
    stageCloseMovieTitle: filmTitle,
    stageClosedAt: state?.stageClosedAt || new Date().toISOString(),
  };
  const lb = lbResult || await resolveSerataFilmHouseLeaderboard(client, {
    guild: guild || channel.guild,
    weekKey: wk,
    state: lbState,
    movieTitle: filmTitle,
    skipDiscordSends: true,
  }).catch(() => null);
  if (!lb?.ok || !Array.isArray(lb.rankedCombined) || !lb.rankedCombined.length) {
    return { skipped: true, reason: lb?.reason || "leaderboard_unavailable" };
  }
  const hogwartsRoleIds = collectHouseRoleIdsFromRanked(lb.rankedCombined, lb.eventCfg);
  await message.edit({
    content: buildMovieNightEndAnnouncementMessage(filmTitle, {
      hogwartsEventActive: true,
      lb,
      reviewThreadId: state?.reviewThreadId || message.thread?.id || message.id,
    }),
    embeds: lb.embed ? [lb.embed] : [],
    allowedMentions: {
      roles: [SERATA_FILM_ROLE_ID, ...hogwartsRoleIds].filter(Boolean),
    },
    __skipNoticeEmbed: true,
  });
  return { ok: true, messageId, rankedCombined: lb.rankedCombined };
}

async function ensureSerataFilmEndLeaderboardPublished(client, guild, weekKey, state, title, lbResult = null) {
  if (!client || !guild || !weekKey || !isHogwartsWeeklyTopReplaced(client)) return null;
  const filmTitle = String(title || state?.stageCloseMovieTitle || state?.finalMovieTitle || "il film scelto").trim();
  const lb = await maybePublishSerataFilmHouseLeaderboard(client, guild, weekKey, state, filmTitle, lbResult);
  const closeMessage = await fetchStageCloseMessageForWeek(guild, weekKey, state);
  if (!closeMessage) return lb;
  await repairMovieNightEndAnnouncementLeaderboard(client, {
    guild,
    weekKey,
    state: { ...(state && typeof state === "object" ? state : {}), stageCloseMessageId: closeMessage.id },
    title: filmTitle,
    lbResult: lb || lbResult,
  }).catch((err) => {
    global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] end message leaderboard repair failed:", err?.message || err);
  });
  return lb;
}

async function runMovieNightStageCloseRecoveryCheck(client, opts = {}) {
  if (movieNightStageCloseRecoveryRunning) return { skipped: true, reason: "already_running" };
  movieNightStageCloseRecoveryRunning = true;
  try {
    const now = opts.now || new Date();
    if (!shouldAttemptMovieNightStageCloseRecovery(now)) {
      return { skipped: true, reason: "outside_window" };
    }
    if (resolveExtraMovieNightDateKey(now)) {
      return await runExtraMovieNightStageCloseCheck(client, opts);
    }
    const fixedSchedule = getHarryPotterMovieNightScheduleForWeek(now);
    if (fixedSchedule?.skip) return { skipped: true, reason: "fixed_schedule_skip" };
    const weekKey = getRomeWeekKey(now);
    const state = await getBotState(STATE_KEY, null);
    const mainGuildId = String(IDs.guilds?.main || client?.config?.mainGuildId || "");
    const guild = mainGuildId ? await getClientGuildCached(client, mainGuildId).catch(() => null) : null;
    if (!guild) return { skipped: true, reason: "guild_unavailable" };
    const title = (await resolveFinalMovieTitle(client, state, now).catch(() => null))
      || state?.finalMovieTitle
      || state?.eventStartMovieTitle
      || getFixedMovieTitleForWeek(now)
      || "il film scelto";
    if (state?.weekKey === weekKey && state?.stageCloseMessageId && state.stageCloseMessageId !== "pending") {
      const closeMessage = await fetchStageCloseMessageForWeek(guild, weekKey, state);
      if (closeMessage) {
        const lb = await ensureSerataFilmEndLeaderboardPublished(client, guild, weekKey, {
          ...(state && typeof state === "object" ? state : {}),
          stageCloseMessageId: closeMessage.id,
        }, title);
        await ensureMovieNightReviewThreadTracking(client).catch((err) => {
          global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] review thread tracking on recovery failed:", err?.message || err);
        });
        await closeMovieNightReviewThreadIfDue(client).catch((err) => {
          global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] review thread close on recovery failed:", err?.message || err);
        });
        return { ok: true, skipped: true, reason: "close_already_done", leaderboard: lb?.ok ? "published" : lb?.reason || "none" };
      }
    }
    if (await isSerataFilmStageLive(guild)) {
      return { skipped: true, reason: "stage_still_live" };
    }
    return await handleMovieNightStageClose(
      { guild, channelId: MOVIE_NIGHT_EVENT_CHANNEL_ID, client: guild.client },
      { now, force: Boolean(opts.force) },
    );
  } finally {
    movieNightStageCloseRecoveryRunning = false;
  }
}

async function handleMovieNightStageClose(stageInstance, opts = {}) {
  const guild = stageInstance?.guild || stageInstance?.client?.guilds?.cache?.get(stageInstance?.guildId || "");
  const channelId = String(stageInstance?.channelId || stageInstance?.channel?.id || "");
  if (!guild || channelId !== MOVIE_NIGHT_EVENT_CHANNEL_ID) return { skipped: true, reason: "not_movie_night_stage" };

  const client = stageInstance?.client || guild.client;
  const attendanceSnapshot = opts.attendanceSnapshot instanceof Map
    ? opts.attendanceSnapshot
    : snapshotSerataFilmHouseAttendance(guild.id);

  // serataFilmFinishFromClose1: always attempt staff auto-vals on stage close / recovery
  // (even if announce was already posted — vals may have been skipped before).
  const stateEarly = await getBotState(STATE_KEY, null).catch(() => null);
  const staffAuto = await finishSerataFilmSessionsForChannel(guild, channelId, {
    attendanceSnapshot,
    eventId: String(stateEarly?.eventId || stageInstance?.id || `stage-${Date.now()}`),
    startedAt: Date.parse(String(stateEarly?.eventStartAnnouncedAt || stateEarly?.stagePermissionsOpenedAt || "")) || undefined,
  }).catch((err) => {
    global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] serata film staff auto finish failed:", err?.message || err);
    return { ok: false, error: String(err?.message || err) };
  });

  const weekKey = String(opts.weekKeyOverride || "").trim() || getRomeWeekKey(opts.now || new Date());
  const fixedSchedule = getHarryPotterMovieNightScheduleForWeek(opts.now || new Date());
  if (fixedSchedule?.skip && !opts.movieTitleOverride) return { skipped: true, reason: "fixed_schedule_skip", weekKey, staffAuto };

  const result = await withMovieNightStageCloseLock(weekKey, async () => {
    const state = await getBotState(STATE_KEY, null);
    if (!opts.force) {
        const existingForWeek = await fetchStageCloseMessageForWeek(guild, weekKey, state);
      if (existingForWeek) {
        const title = String(opts.movieTitleOverride || "").trim()
          || (await resolveFinalMovieTitle(client, state, opts.now || new Date()).catch(() => null))
          || state?.finalMovieTitle
          || state?.eventStartMovieTitle
          || "il film scelto";
        await ensureReviewThreadForEndMessage(existingForWeek, {
          client,
          guild,
          weekKey,
          title,
          state,
          permissionsClosed: Boolean(state?.stagePermissionsClosedAt),
        });
        await ensureSerataFilmEndLeaderboardPublished(client, guild, weekKey, {
          ...(state && typeof state === "object" ? state : {}),
          stageCloseMessageId: existingForWeek.id,
        }, title);
        return { skipped: true, reason: "already_announced", weekKey, leaderboardEnsured: true };
      }
    }

    const permissionsClosed = await closeMovieNightStagePermissions(guild);
    const title = String(opts.movieTitleOverride || "").trim()
      || (await resolveFinalMovieTitle(client, state, opts.now || new Date()).catch(() => null))
      || state?.finalMovieTitle
      || state?.eventStartMovieTitle
      || "il film scelto";
    const channel = await resolveTextChannelForMovieNight(guild);
    if (!channel?.isTextBased?.() || !channel?.send) {
      return { skipped: true, reason: "announcement_channel_unavailable", weekKey, permissionsClosed };
    }

    const existingMessage = !opts.force ? await findRecentMovieNightEndAnnouncementInChannel(channel, client, weekKey) : null;
    if (existingMessage) {
      const ensured = await ensureReviewThreadForEndMessage(existingMessage, {
        client,
        guild,
        weekKey,
        title,
        state,
        permissionsClosed,
      });
      const nextState = {
        ...(state && typeof state === "object" ? state : {}),
        weekKey,
        guildId: String(guild.id || ""),
        stageCloseMovieTitle: title,
        stageCloseMessageId: String(existingMessage.id || ""),
        reviewThreadId: String(ensured.thread?.id || state?.reviewThreadId || ""),
        reviewThreadCloseAt: ensured.reviewThreadCloseAt || state?.reviewThreadCloseAt || null,
        stagePermissionsClosedAt: permissionsClosed ? new Date().toISOString() : state?.stagePermissionsClosedAt || "",
        stageClosedAt: new Date().toISOString(),
      };
      await ensureSerataFilmEndLeaderboardPublished(client, guild, weekKey, nextState, title);
      return {
        ok: true,
        deduped: true,
        reason: "channel_recent_message",
        messageId: String(existingMessage.id || ""),
        threadId: String(ensured.thread?.id || ""),
        title,
        permissionsClosed,
        weekKey,
        nextState,
      };
    }

    if (!opts.force) {
      const claim = await claimMovieNightStageCloseSlot(weekKey);
      if (!claim.claimed) {
        if (claim.reason === "already_announced" || claim.reason === "pending_other") {
          const retryMessage = await findRecentMovieNightEndAnnouncementInChannel(channel, client, weekKey);
          if (retryMessage) {
            const ensured = await ensureReviewThreadForEndMessage(retryMessage, {
              client,
              guild,
              weekKey,
              title,
              state: claim.state || state,
              permissionsClosed,
            });
            const nextState = {
              ...(claim.state || state || {}),
              weekKey,
              stageCloseMovieTitle: title,
              stageCloseMessageId: String(retryMessage.id || ""),
              reviewThreadId: String(ensured.thread?.id || ""),
              stageClosedAt: new Date().toISOString(),
            };
            await ensureSerataFilmEndLeaderboardPublished(client, guild, weekKey, nextState, title);
            return {
              ok: true,
              deduped: true,
              reason: "claim_lost_channel_message",
              messageId: String(retryMessage.id || ""),
              threadId: String(ensured.thread?.id || ""),
              title,
              permissionsClosed,
              weekKey,
              nextState,
            };
          }
        }
        return { skipped: true, reason: claim.reason || "claim_failed", weekKey, permissionsClosed };
      }
    }

    const hogwartsEventActive = isHogwartsWeeklyTopReplaced(client);
    const lbState = {
      ...(state && typeof state === "object" ? state : {}),
      weekKey,
      stageCloseMovieTitle: title,
      stageClosedAt: new Date().toISOString(),
    };
    let lbResult = null;
    if (hogwartsEventActive) {
      try {
        lbResult = await resolveSerataFilmHouseLeaderboard(client, {
          guild,
          weekKey,
          state: lbState,
          movieTitle: title,
          skipDiscordSends: true,
          attendanceSnapshot,
        });
      } catch (err) {
        global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] serata film house leaderboard resolve failed:", err?.message || err);
      }
    }

    const hogwartsRoleIds = hogwartsEventActive && lbResult?.rankedCombined
      ? collectHouseRoleIdsFromRanked(lbResult.rankedCombined, lbResult.eventCfg)
      : [];
    const message = await channel.send({
      content: buildMovieNightEndAnnouncementMessage(title, { hogwartsEventActive, lb: lbResult || {} }),
      embeds: hogwartsEventActive && lbResult?.embed ? [lbResult.embed] : [],
      allowedMentions: {
        roles: [SERATA_FILM_ROLE_ID, ...hogwartsRoleIds].filter(Boolean),
      },
      __skipNoticeEmbed: true,
    });
    const ensured = await ensureReviewThreadForEndMessage(message, {
      client,
      guild,
      weekKey,
      title,
      state,
      permissionsClosed,
    });
    const reviewThreadCloseAt =
      ensured.reviewThreadCloseAt || Date.now() + REVIEW_THREAD_CLOSE_AFTER_MS;
    const nextState = {
      ...(state && typeof state === "object" ? state : {}),
      weekKey,
      guildId: String(guild.id || ""),
      stageCloseMovieTitle: title,
      stageCloseMessageId: String(message.id || ""),
      reviewThreadId: String(ensured.thread?.id || ""),
      reviewThreadCloseAt,
      stagePermissionsClosedAt: permissionsClosed ? new Date().toISOString() : state?.stagePermissionsClosedAt || "",
      stageClosedAt: new Date().toISOString(),
    };
    return {
      ok: true,
      messageId: String(message.id || ""),
      threadId: String(ensured.thread?.id || ""),
      title,
      permissionsClosed,
      weekKey,
      nextState,
      lbResult,
    };
  });

  if (result?.ok && isHogwartsWeeklyTopReplaced(client)) {
    const lbState = result.nextState || (await getBotState(STATE_KEY, null));
    await ensureSerataFilmEndLeaderboardPublished(client, guild, weekKey, lbState, result.title, result.lbResult);
  }
  clearSerataFilmHouseAttendanceSession(guild.id);
  return result;
}

async function runMovieNightAnnouncementCheck(client, opts = {}) {
  if (movieNightAnnouncementRunning) return { skipped: true, reason: "already_running" };
  movieNightAnnouncementRunning = true;
  try {
    const now = opts.now || new Date();
    const weekKey = getRomeWeekKey(now);
    const fixedSchedule = getHarryPotterMovieNightScheduleForWeek(now);
    if (fixedSchedule) {
      return { skipped: true, reason: fixedSchedule.skip ? "fixed_schedule_skip" : "fixed_schedule_movie", weekKey };
    }
    const state = await getBotState(STATE_KEY, null);
    if (!opts.force && state?.weekKey === weekKey && state?.messageId) {
      return { skipped: true, reason: "already_announced", weekKey };
    }

    const mainGuildId = String(IDs.guilds?.main || client?.config?.mainGuildId || "");
    const guild = (mainGuildId && (client.guilds.cache.get(mainGuildId) || (await getClientGuildCached(client, mainGuildId)))) || client.guilds.cache.first();
    if (!guild) return { skipped: true, reason: "guild_unavailable", weekKey };

    const event = await findCurrentWeekMovieNightEvent(guild, now);
    if (!event) return { skipped: true, reason: "event_not_found", weekKey };

    return await publishMovieNightAnnouncement(guild, event, weekKey);
  } finally {
    movieNightAnnouncementRunning = false;
  }
}

async function runMovieNightThreadCloseCheck(client, opts = {}) {
  if (movieNightThreadCloseRunning) return { skipped: true, reason: "already_running" };
  movieNightThreadCloseRunning = true;
  try {
    const now = opts.now || new Date();
    const weekKey = getRomeWeekKey(now);
    const fixedSchedule = getHarryPotterMovieNightScheduleForWeek(now);
    if (fixedSchedule) {
      return { skipped: true, reason: fixedSchedule.skip ? "fixed_schedule_skip" : "fixed_schedule_no_vote_thread", weekKey };
    }
    let state = await hydrateMovieNightStateForWeek(client, await getBotState(STATE_KEY, null), weekKey);
    if (!state?.threadId) {
      return { skipped: true, reason: "thread_not_recorded", weekKey };
    }
    if (!opts.force && state?.closedAt) {
      return { skipped: true, reason: "already_closed", weekKey };
    }

    const thread = await resolveMovieNightThread(client, state.threadId);
    if (!thread?.isThread?.()) return { skipped: true, reason: "thread_unavailable", weekKey };
    const tieBreaker = await maybePublishTieBreakerPoll(client, thread, state).catch((err) => {
      global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] tie breaker poll failed:", err?.message || err);
      return { skipped: true, reason: "tie_poll_failed" };
    });
    if (thread.archived && !thread.locked) {
      await thread.setArchived(false, "Riapertura tecnica per bloccare il thread Serata Film").catch(() => null);
    }
    if (!thread.locked && thread.setLocked) {
      await thread.setLocked(true, "Chiusura votazioni Serata Film").catch((err) => {
        global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] thread lock failed:", err?.message || err);
      });
    }
    if (!thread.archived && thread.setArchived) {
      await thread.setArchived(true, "Chiusura votazioni Serata Film").catch((err) => {
        global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] thread archive failed:", err?.message || err);
      });
    }

    await setBotState(STATE_KEY, {
      ...state,
      weekKey,
      voteResults: Array.isArray(tieBreaker?.voteResults) ? tieBreaker.voteResults : state?.voteResults || [],
      tieBreakerPollMessageId: tieBreaker?.tieBreakerPollMessageId || state?.tieBreakerPollMessageId || "",
      tiedMovieTitles: tieBreaker?.tiedMovieTitles || state?.tiedMovieTitles || [],
      topTieVotes: Number.isFinite(Number(tieBreaker?.topVotes)) ? Number(tieBreaker.topVotes) : state?.topTieVotes,
      closedAt: new Date().toISOString(),
    });
    return { ok: true, threadId: String(thread.id || ""), weekKey };
  } finally {
    movieNightThreadCloseRunning = false;
  }
}

function inferFinalAnnounceSlotFromMessage(content) {
  return /\*\*Domani\*\*/.test(String(content || "")) ? "friday" : "saturday";
}

async function repairFinalMovieNightAnnouncementDescription(client) {
  if (movieNightFinalRepairRunning) return { skipped: true, reason: "already_running" };
  movieNightFinalRepairRunning = true;
  try {
    const state = await getBotState(STATE_KEY, null);
    const messageId = String(state?.finalAnnouncementMessageId || "").trim();
    const now = new Date();
    const weekKey = getRomeWeekKey(now);
    const title =
      (await resolveFinalMovieTitle(client, state, now).catch(() => null)) ||
      getFixedMovieTitleForWeek(now) ||
      String(state?.finalMovieTitle || "").trim();
    if (!messageId || !title) return { skipped: true, reason: "no_announcement" };

    const savedTitle = String(state?.finalMovieTitle || "").trim();
    const savedDesc = String(state?.finalMovieDescription || "").trim();
    const hogwartsEventActive = isHogwartsWeeklyTopReplaced(client);
    const savedHogwartsBlock = state?.finalAnnouncementHogwartsBlock === true;
    const message = await fetchFinalAnnouncementMessage(client, messageId);
    if (!message?.edit) return { skipped: true, reason: "message_unavailable", title };
    if (!isStageCloseMessageForWeekKey(message, weekKey)) {
      return { skipped: true, reason: "message_wrong_week", title };
    }

    const announceSlot = inferFinalAnnounceSlotFromMessage(message.content);
    const saturdayKey = String(getRomeSaturdayKeyForWeek(now) || state?.finalAnnouncedSaturdayKey || "").trim();
    const needsDescriptionFetch =
      savedTitle !== title ||
      !savedDesc ||
      isFallbackMovieDescription(savedDesc) ||
      savedHogwartsBlock !== hogwartsEventActive;
    const description = needsDescriptionFetch
      ? await fetchItalianMovieDescription(title)
      : savedDesc;
    const content = buildFinalMovieNightAnnouncementMessage({
      title,
      description,
      eventUrl: buildDiscordEventUrl(state?.guildId || IDs.guilds?.main, state?.eventId),
      saturdayKey,
      announceSlot,
      hogwartsEventActive,
    });
    const previousContent = String(message.content || "");
    if (content === previousContent && savedTitle === title) {
      return { skipped: true, reason: "already_correct", title };
    }

    await message.edit({
      content,
      allowedMentions: { roles: [...new Set([EVENTS_ROLE_ID, SERATA_FILM_ROLE_ID].filter(Boolean))] },
    });
    await setBotState(STATE_KEY, {
      ...state,
      weekKey,
      finalMovieTitle: title,
      finalMovieDescription: description,
      finalAnnouncedSaturdayKey: saturdayKey || state?.finalAnnouncedSaturdayKey || "",
      finalAnnouncementHogwartsBlock: hogwartsEventActive,
      finalMovieDescriptionRepairedAt: new Date().toISOString(),
    });
    return { ok: true, title, messageId, description, hogwartsEventActive };
  } finally {
    movieNightFinalRepairRunning = false;
  }
}

async function republishMovieNightStaffCommunicationAsPlainText(client, opts = {}) {
  const now = opts.now || new Date();
  const channel = await fetchStaffCommunicationChannel(client);
  if (!channel?.isTextBased?.() || !channel?.messages?.fetch) {
    return { ok: false, reason: "staff_channel_unavailable" };
  }

  const state = await getBotState(STATE_KEY, null);
  const title =
    String(opts.title || state?.finalMovieTitle || "").trim() ||
    getFixedMovieTitleForWeek(now) ||
    "Harry Potter e i Doni della Morte - Parte 1";
  const saturdayKey = getRomeSaturdayKeyForWeek(now);
  const weekKey = getRomeWeekKey(now);
  const announceSlot =
    String(opts.announceSlot || getMovieNightFinalAnnouncementSlot(now) || getMovieNightStartupRecoverySlot(now) || "friday").toLowerCase() ===
    "saturday"
      ? "saturday"
      : "friday";

  const recent = await channel.messages.fetch({ limit: 40 }).catch(() => null);
  const marker = /COMUNICAZIONE SERATA FILM/i;
  const deletedIds = [];
  if (recent?.size) {
    for (const message of recent.values()) {
      const haystack = messageTextHaystack(message);
      if (!marker.test(haystack)) continue;
      if (title && !haystack.includes(title) && !/harry potter/i.test(haystack)) continue;
      const hasEmbed = Array.isArray(message.embeds) && message.embeds.length > 0;
      const contentEmpty = !String(message.content || "").trim();
            const tracked = String(state?.staffCommunicationMessageId || "") === String(message.id || "");
      if (!hasEmbed && !tracked) continue;
      if (hasEmbed || (tracked && contentEmpty)) {
        await message.delete().catch(() => null);
        deletedIds.push(String(message.id));
      }
    }
  }

  if (state && typeof state === "object") {
    await setBotState(STATE_KEY, {
      ...state,
      staffCommunicationMessageId: "",
      staffCommunicationAt: "",
      staffAnnouncedSaturdayKey: "",
    });
  }

  const message = await channel.send(
    buildMovieNightStaffCommunicationPayload({
      title,
      now,
      announceSlot,
    }),
  );
  const messageId = String(message?.id || "");
  await setBotState(STATE_KEY, {
    ...(state && typeof state === "object" ? state : {}),
    weekKey,
    finalMovieTitle: title,
    staffCommunicationMessageId: messageId,
    staffCommunicationAt: new Date().toISOString(),
    staffAnnouncedSaturdayKey: saturdayKey,
  });

  return {
    ok: true,
    messageId,
    deletedIds,
    title,
    weekKey,
    saturdayKey,
  };
}

async function repairMovieNightStaffCommunication(client, opts = {}) {
  const state = await getBotState(STATE_KEY, null);
  const now = opts.now || new Date();
  if (isMovieNightFixedScheduleSkipWeek(now) && !opts.force) {
    return { skipped: true, reason: "fixed_schedule_skip" };
  }
  if (!opts.force && !shouldAllowMovieNightStaffCommunication(now)) {
    return { skipped: true, reason: "outside_staff_communication_window" };
  }
  const weekKey = getRomeWeekKey(now);
  const saturdayKey = getRomeSaturdayKeyForWeek(now);
  const hydrated = await hydrateMovieNightStateForWeek(client, state, weekKey);
  const publicPresent = await isMovieNightFinalPublicAnnouncePresent(client, hydrated, weekKey, now);
  if (!publicPresent) return { skipped: true, reason: "no_public_announce" };
  const slotHint = getMovieNightStartupRecoverySlot(now) || "";
  const announceSlot = resolveMovieNightStaffAnnounceSlot(now, slotHint);
  if (!announceSlot) return { skipped: true, reason: "outside_staff_communication_window" };
  const title =
    (await resolveFinalMovieTitle(client, hydrated, now).catch(() => null)) ||
    hydrated?.finalMovieTitle ||
    getFixedMovieTitleForWeek(now);
  const staffResult = await maybePublishMovieNightStaffCommunication(client, {
    state: hydrated,
    saturdayKey,
    weekKey,
    now,
    announceSlot,
    title,
  });
  const staffPatch = movieNightStaffCommunicationStatePatch(staffResult, saturdayKey);
  if (Object.keys(staffPatch).length) {
    await setBotState(STATE_KEY, {
      ...(hydrated && typeof hydrated === "object" ? hydrated : {}),
      ...staffPatch,
    });
  }
  if (staffResult?.ok && staffResult.skipped) return { ok: true, skipped: true, title };
  if (staffResult?.ok) return { ok: true, sent: true, messageId: staffPatch.staffCommunicationMessageId, title };
  return { ok: false, reason: staffResult?.reason || "staff_send_failed" };
}

async function ensureMovieNightStaffCommunicationOnStartup(client, opts = {}) {
  const { isRecoveryPrimaryShard } = require("../../Utils/Community/supportersChannelEmbedRecoveryUtils");
  if (!isRecoveryPrimaryShard(client)) return { ok: false, reason: "not_primary_shard" };
  if (!isMongoReady()) return { ok: false, reason: "mongo_not_ready" };
  const now = opts.now || new Date();
  if (isMovieNightFixedScheduleSkipWeek(now) && !opts.force) {
    return { ok: true, skipped: true, reason: "fixed_schedule_skip" };
  }
  return repairMovieNightStaffCommunication(client, opts);
}

async function recoverMovieNightAnnouncementsOnStartup(client, opts = {}) {
  const { isRecoveryPrimaryShard } = require("../../Utils/Community/supportersChannelEmbedRecoveryUtils");
  if (!isRecoveryPrimaryShard(client)) return { ok: false, reason: "not_primary_shard" };
  if (!isMongoReady()) return { ok: false, reason: "mongo_not_ready" };
  const now = opts.now || new Date();
  const steps = {};
  const weekKey = getRomeWeekKey(now);
  const saturdayKey = getRomeSaturdayKeyForWeek(now);
  const state = await hydrateMovieNightStateForWeek(client, await getBotState(STATE_KEY, null), weekKey);
  const publicPresent = await isMovieNightFinalPublicAnnouncePresent(client, state, weekKey, now);
  if (publicPresent) {
    steps.finalAnnouncementRepair = await repairFinalMovieNightAnnouncementDescription(client);
    steps.staffCommunication = await repairMovieNightStaffCommunication(client, { now });
  }
  const slot = getMovieNightStartupRecoverySlot(now);
  if (!slot) return { ok: true, skipped: true, reason: "outside_recovery_window", steps };
  if (slot === "monday") {
    steps.mondayAnnounce = await runMovieNightAnnouncementCheck(client, { now });
  } else if (slot === "thread_close") {
    steps.threadClose = await runMovieNightThreadCloseCheck(client, { now });
  } else if (slot === "final_friday") {
    steps.finalFriday = await runMovieNightFinalAnnouncementCheck(client, { now, slot: "friday" });
  } else if (slot === "final_saturday") {
    steps.finalSaturday = await runMovieNightFinalAnnouncementCheck(client, { now, slot: "saturday" });
  } else if (slot === "event_start") {
    steps.eventStart = await runMovieNightEventStartCheck(client, { now });
  }
  if (shouldAttemptMovieNightStageCloseRecovery(now)) {
    steps.stageClose = await runMovieNightStageCloseRecoveryCheck(client, { now });
  }
  const mainGuildId = String(IDs.guilds?.main || client?.config?.mainGuildId || "");
  const mainGuild = mainGuildId
    ? (client.guilds.cache.get(mainGuildId) || (await getClientGuildCached(client, mainGuildId).catch(() => null)))
    : client.guilds.cache.first();
  if (mainGuild) {
    steps.serataFilmAttendanceRestore = await restoreSerataFilmHouseAttendanceSession(mainGuild).then(() => ({ ok: true })).catch((err) => ({
      ok: false,
      error: err?.message || String(err),
    }));
  }
  steps.reviewThreadTracking = await ensureMovieNightReviewThreadTracking(client).catch((err) => ({
    ok: false,
    error: err?.message || String(err),
  }));
  steps.reviewThreadClose = await closeMovieNightReviewThreadIfDue(client).catch((err) => ({
    ok: false,
    error: err?.message || String(err),
  }));
  return { ok: true, slot, steps };
}

async function findExtraMovieNightEvent(guild, eventDateKey, now = new Date()) {
  if (!guild?.scheduledEvents?.fetch || !eventDateKey) return null;
  const events = await guild.scheduledEvents.fetch().catch(() => null);
  if (!events?.size) return null;
  const candidates = [...events.values()].filter((event) => {
    if (!isMovieNightEventName(event) || !isMovieNightEventChannelAndStatus(event)) return false;
    const startDate = getMovieNightEventStartDate(event);
    if (!startDate) return false;
    return getRomeDateKey(startDate) === eventDateKey && isMovieNightClockInStartWindow(startDate);
  });
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => Number(a.scheduledStartTimestamp || 0) - Number(b.scheduledStartTimestamp || 0))[0];
}

async function runExtraMovieNightFinalAnnouncementCheck(client, opts = {}) {
  const now = opts.now || new Date();
  const slot = String(opts.slot || "").trim().toLowerCase(); // eve | day
  const eventDateKey =
    slot === "eve"
      ? (() => {
          const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
          return getExtraFixedMovieNight(tomorrow) ? getRomeDateKey(tomorrow) : "";
        })()
      : resolveExtraMovieNightDateKey(now);
  if (!eventDateKey) return { skipped: true, reason: "no_extra_movie_tonight" };
  const title = String(EXTRA_FIXED_MOVIE_NIGHTS.get(eventDateKey)?.title || "").trim();
  if (!title) return { skipped: true, reason: "extra_title_missing", eventDateKey };
  const all = await getExtraMovieNightState();
  const state = all[eventDateKey] && typeof all[eventDateKey] === "object" ? all[eventDateKey] : {};
  const alreadyKey = slot === "eve" ? "finalEveMessageId" : "finalDayMessageId";
  if (!opts.force && state[alreadyKey]) {
    return { skipped: true, reason: "already_announced", eventDateKey, slot };
  }
  const channel = await fetchAnnouncementChannel(client);
  if (!channel?.isTextBased?.() || !channel?.send) {
    return { skipped: true, reason: "announcement_channel_unavailable", eventDateKey };
  }
  const description = await fetchItalianMovieDescription(title);
  const guildId = String(IDs.guilds?.main || client?.config?.mainGuildId || "");
  const guild = guildId ? await getClientGuildCached(client, guildId).catch(() => null) : null;
  const event = guild ? await findExtraMovieNightEvent(guild, eventDateKey, now) : null;
  const announceSlot = slot === "eve" ? "friday" : "saturday";
  const message = await channel.send({
    content: buildFinalMovieNightAnnouncementMessage({
      title,
      description,
      eventUrl: buildDiscordEventUrl(guildId || IDs.guilds?.main, event?.id || state.eventId),
      saturdayKey: eventDateKey,
      announceSlot,
      hogwartsEventActive: false,
    }),
    allowedMentions: { roles: [...new Set([EVENTS_ROLE_ID, SERATA_FILM_ROLE_ID].filter(Boolean))] },
    __skipNoticeEmbed: true,
  });
  await patchExtraMovieNightState(eventDateKey, {
    title,
    description,
    eventId: String(event?.id || state.eventId || ""),
    guildId: String(guild?.id || guildId || ""),
    [alreadyKey]: String(message.id || ""),
    finalAnnouncedAt: new Date().toISOString(),
  });
  try {
    const staffChannel = await fetchStaffCommunicationChannel(client);
    if (staffChannel?.isTextBased?.() && staffChannel?.send && !state.staffCommunicationMessageId) {
      const dateLabel = formatMovieNightStaffDateLabel(
        slot === "eve" ? new Date(now.getTime() + 24 * 60 * 60 * 1000) : now,
        { advanceForSaturday: false },
      );
      // Per mercoledì: etichetta esplicita
      const parts = getRomeParts(slot === "eve" ? new Date(now.getTime() + 24 * 60 * 60 * 1000) : now);
      const monthName = ITALIAN_MONTH_NAMES[Math.max(0, parts.month - 1)] || "";
      const wedLabel =
        slot === "eve"
          ? `Mercoledì ${parts.day} ${monthName}, alle ${MOVIE_NIGHT_DISPLAY_TIME}`
          : `Oggi, ${parts.day} ${monthName}, alle ${MOVIE_NIGHT_DISPLAY_TIME}`;
      const staffMsg = await staffChannel.send({
        content: buildMovieNightStaffCommunicationMessage({
          title,
          dateLabel: wedLabel || dateLabel,
        }),
        allowedMentions: { roles: [STAFF_COMMUNICATION_ROLE_ID] },
        __skipNoticeEmbed: true,
      });
      await patchExtraMovieNightState(eventDateKey, {
        staffCommunicationMessageId: String(staffMsg?.id || ""),
      });
    }
  } catch (err) {
    global.logger?.warn?.("[MOVIE NIGHT EXTRA] staff communication failed:", err?.message || err);
  }
  global.logger?.info?.("[MOVIE NIGHT EXTRA] final announce", { eventDateKey, slot, title, messageId: message.id });
  return { ok: true, eventDateKey, slot, title, messageId: String(message.id || "") };
}

async function runExtraMovieNightEventStartCheck(client, opts = {}) {
  const now = opts.now || new Date();
  const eventDateKey = resolveExtraMovieNightDateKey(now);
  if (!eventDateKey) return { skipped: true, reason: "no_extra_movie" };
  const title = String(EXTRA_FIXED_MOVIE_NIGHTS.get(eventDateKey)?.title || "").trim();
  if (!title) return { skipped: true, reason: "extra_title_missing" };
  const all = await getExtraMovieNightState();
  const state = all[eventDateKey] && typeof all[eventDateKey] === "object" ? all[eventDateKey] : {};
  if (!opts.force && state.eventStartMessageId) {
    return { skipped: true, reason: "already_started", eventDateKey };
  }
  const mainGuildId = String(IDs.guilds?.main || client?.config?.mainGuildId || "");
  const guild = mainGuildId ? await getClientGuildCached(client, mainGuildId).catch(() => null) : null;
  if (!guild) return { skipped: true, reason: "guild_unavailable" };
  const event = await findExtraMovieNightEvent(guild, eventDateKey, now);
  if (!event) return { skipped: true, reason: "no_event" };
  const status = Number(event.status || 0);
  if (status === 3 || status === 4) return { skipped: true, reason: "event_ended" };
  const startMs = Number(event.scheduledStartTimestamp || getMovieNightEventStartDate(event)?.getTime() || 0);
  if (status === 1 && startMs && now.getTime() + 60_000 < startMs) {
    return { skipped: true, reason: "event_not_due" };
  }
  const permissionsOpened = await openMovieNightStagePermissions(guild);
  const channel = guild.channels.cache.get(ANNOUNCEMENT_CHANNEL_ID) || (await getGuildChannelCached(guild, ANNOUNCEMENT_CHANNEL_ID));
  if (!channel?.isTextBased?.() || !channel?.send) {
    return { skipped: true, reason: "announcement_channel_unavailable", permissionsOpened };
  }
  const message = await channel.send({
    content: buildMovieNightStartAnnouncementMessage(title),
    allowedMentions: { parse: ["everyone"], roles: [SERATA_FILM_ROLE_ID] },
    __skipNoticeEmbed: true,
  });
  await patchExtraMovieNightState(eventDateKey, {
    title,
    eventId: String(event.id || ""),
    guildId: String(guild.id || ""),
    eventStartMessageId: String(message.id || ""),
    eventStartAnnouncedAt: new Date().toISOString(),
    stagePermissionsOpenedAt: permissionsOpened ? new Date().toISOString() : state.stagePermissionsOpenedAt || "",
  });
  await startSerataFilmSession(event).catch((err) => {
    global.logger?.warn?.("[MOVIE NIGHT EXTRA] staff session start failed:", err?.message || err);
  });
  return { ok: true, eventDateKey, title, messageId: String(message.id || ""), permissionsOpened };
}

async function runExtraMovieNightStageCloseCheck(client, opts = {}) {
  const now = opts.now || new Date();
  const eventDateKey = resolveExtraMovieNightDateKey(now);
  if (!eventDateKey) return { skipped: true, reason: "no_extra_movie" };
  if (!shouldAttemptMovieNightStageCloseRecovery(now) && !opts.force) {
    return { skipped: true, reason: "outside_window" };
  }
  const title = String(EXTRA_FIXED_MOVIE_NIGHTS.get(eventDateKey)?.title || getFixedMovieTitleForDate(now) || "il film scelto").trim();
  const all = await getExtraMovieNightState();
  const state = all[eventDateKey] && typeof all[eventDateKey] === "object" ? all[eventDateKey] : {};
  if (!opts.force && state.stageCloseMessageId) {
    return { skipped: true, reason: "already_closed", eventDateKey };
  }
  const mainGuildId = String(IDs.guilds?.main || client?.config?.mainGuildId || "");
  const guild = mainGuildId ? await getClientGuildCached(client, mainGuildId).catch(() => null) : null;
  if (!guild) return { skipped: true, reason: "guild_unavailable" };
  if (!opts.force && (await isSerataFilmStageLive(guild))) {
    return { skipped: true, reason: "stage_still_live" };
  }
  // riusa la chiusura stage standard ma con weekKey = eventDateKey per tracking review
  const result = await handleMovieNightStageClose(
    { guild, channelId: MOVIE_NIGHT_EVENT_CHANNEL_ID, client: guild.client },
    { now, force: Boolean(opts.force), movieTitleOverride: title, weekKeyOverride: eventDateKey },
  );
  if (result?.ok || result?.nextState?.stageCloseMessageId) {
    await patchExtraMovieNightState(eventDateKey, {
      title,
      stageCloseMessageId: String(result?.messageId || result?.nextState?.stageCloseMessageId || ""),
      stageClosedAt: new Date().toISOString(),
      reviewThreadId: String(result?.threadId || result?.nextState?.reviewThreadId || ""),
    });
  }
  return result || { skipped: true, reason: "stage_close_noop", eventDateKey };
}

async function runMovieNightEventStartCheck(client, opts = {}) {
  if (movieNightEventStartRunning) return { skipped: true, reason: "already_running" };
  movieNightEventStartRunning = true;
  try {
    const now = opts.now || new Date();
    if (!shouldAttemptMovieNightEventStartRecovery(now)) {
      return { skipped: true, reason: "outside_window" };
    }
    if (resolveExtraMovieNightDateKey(now)) {
      return await runExtraMovieNightEventStartCheck(client, opts);
    }
    const mainGuildId = String(IDs.guilds?.main || client?.config?.mainGuildId || "");
    const guild = mainGuildId ? await getClientGuildCached(client, mainGuildId).catch(() => null) : null;
    if (!guild) return { skipped: true, reason: "guild_unavailable" };
    const event = await findCurrentWeekMovieNightEvent(guild, now);
    if (!event) return { skipped: true, reason: "no_event" };
    const status = Number(event.status || 0);
    if (status === 3 || status === 4) return { skipped: true, reason: "event_ended" };
    const startMs = Number(event.scheduledStartTimestamp || getMovieNightEventStartDate(event)?.getTime() || 0);
    if (status === 1 && startMs && now.getTime() + 60_000 < startMs) {
      return { skipped: true, reason: "event_not_due" };
    }
    return await handleMovieNightEventStart(event, { now, force: Boolean(opts.force) });
  } finally {
    movieNightEventStartRunning = false;
  }
}

function startMovieNightAnnouncementLoop(client) {
  const dedicated = String(process.env.COMMUNITY_POLL_WORKER || "").trim() === "1";
  const external = String(process.env.COMMUNITY_POLL_EXTERNAL || "").trim() === "1";
  if (external && !dedicated) return null;
  if (!client || movieNightAnnouncementTasks) return movieNightAnnouncementTasks;
  ensureMovieNightReviewThreadTracking(client).catch((err) => {
    global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] review thread tracking on loop start failed:", err?.message || err);
  });
  closeMovieNightReviewThreadIfDue(client).catch((err) => {
    global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] review thread close on loop start failed:", err?.message || err);
  });
  ensureWatchedMovieNightTitlesReady(client).catch((err) => {
    global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] watched titles bootstrap failed:", err?.message || err);
  });
  const announceTask = cron.schedule(
    ANNOUNCE_CRON,
    runCronDetached("[MOVIE NIGHT ANNOUNCE]", () => runMovieNightAnnouncementCheck(client)),
    { timezone: TIME_ZONE, noOverlap: true },
  );
  const closeTask = cron.schedule(
    CLOSE_THREAD_CRON,
    runCronDetached("[MOVIE NIGHT THREAD CLOSE]", () => runMovieNightThreadCloseCheck(client)),
    { timezone: TIME_ZONE, noOverlap: true },
  );
  const finalAnnouncementFridayTask = cron.schedule(
    FINAL_ANNOUNCEMENT_FRIDAY_CRON,
    runCronDetached("[MOVIE NIGHT FINAL ANNOUNCE FRIDAY]", () =>
      runMovieNightFinalAnnouncementCheck(client, { slot: "friday" }),
    ),
    { timezone: TIME_ZONE, noOverlap: true },
  );
  const finalAnnouncementSaturdayTask = cron.schedule(
    FINAL_ANNOUNCEMENT_SATURDAY_CRON,
    runCronDetached("[MOVIE NIGHT FINAL ANNOUNCE SATURDAY]", () =>
      runMovieNightFinalAnnouncementCheck(client, { slot: "saturday" }),
    ),
    { timezone: TIME_ZONE, noOverlap: true },
  );
  const extraFinalEveTask = cron.schedule(
    EXTRA_FINAL_EVE_CRON,
    runCronDetached("[MOVIE NIGHT EXTRA FINAL EVE]", () =>
      runExtraMovieNightFinalAnnouncementCheck(client, { slot: "eve" }),
    ),
    { timezone: TIME_ZONE, noOverlap: true },
  );
  const extraFinalDayTask = cron.schedule(
    EXTRA_FINAL_DAY_CRON,
    runCronDetached("[MOVIE NIGHT EXTRA FINAL DAY]", () =>
      runExtraMovieNightFinalAnnouncementCheck(client, { slot: "day" }),
    ),
    { timezone: TIME_ZONE, noOverlap: true },
  );
  const eventStartSweepTask = cron.schedule(
    EVENT_START_SWEEP_CRON,
    runCronDetached("[MOVIE NIGHT EVENT START]", () => runMovieNightEventStartCheck(client)),
    { timezone: TIME_ZONE, noOverlap: true },
  );
  const stageCloseSweepTask = cron.schedule(
    STAGE_CLOSE_SWEEP_CRON,
    runCronDetached("[MOVIE NIGHT STAGE CLOSE]", () => runMovieNightStageCloseRecoveryCheck(client)),
    { timezone: TIME_ZONE, noOverlap: true },
  );
  // keep EXTRA_EVENT_START/STAGE cron constants for documentation; sweeps already cover Wed via EVENT_START_SWEEP_CRON
  void EXTRA_EVENT_START_SWEEP_CRON;
  void EXTRA_STAGE_CLOSE_SWEEP_CRON;
  movieNightReviewCloseSweep = setInterval(() => {
    closeMovieNightReviewThreadIfDue(client).catch((err) => {
      global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] review thread close sweep failed:", err?.message || err);
    });
  }, REVIEW_THREAD_SWEEP_MS);
  movieNightReviewCloseSweep.unref?.();
  movieNightAnnouncementTasks = {
    announceTask,
    closeTask,
    finalAnnouncementFridayTask,
    finalAnnouncementSaturdayTask,
    extraFinalEveTask,
    extraFinalDayTask,
    eventStartSweepTask,
    stageCloseSweepTask,
  };
  return movieNightAnnouncementTasks;
}

module.exports = { syncLiveMovieNightAnnouncementMessage, buildMovieNightStaffCommunicationMessage, buildFinalMovieNightAnnouncementMessage, buildMovieNightEndAnnouncementMessage, buildMovieNightAnnouncementMessage, buildMovieNightStartAnnouncementMessage, buildTieBreakerAnnouncementMessage, collectMovieNightVoteResults, ensureMovieNightStaffCommunicationOnStartup, fetchItalianMovieDescription, findCurrentWeekMovieNightEvent, getFixedMovieTitleForWeek, getHarryPotterMovieNightScheduleForWeek, getRomeWeekKey, handleMovieNightEventStart, handleMovieNightStageClose, isMovieNightFixedScheduleSkipWeek, isTargetMovieNightEvent, closeMovieNightStagePermissions, closeMovieNightReviewThreadIfDue, repairFinalMovieNightAnnouncementDescription, recoverMovieNightAnnouncementsOnStartup, republishMovieNightStaffCommunicationAsPlainText, resolveCanonicalMovieTitle, runMovieNightAnnouncementCheck, runMovieNightEventStartCheck, runMovieNightFinalAnnouncementCheck, runMovieNightStageCloseRecoveryCheck, runMovieNightThreadCloseCheck, startMovieNightAnnouncementLoop };