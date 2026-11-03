/** Serata film: evento Discord della settimana e titolo scritto nell'evento. */
const { TARGET_WEEKDAY, getRomeParts, getRomeSaturdayKeyForWeek, getRomeDateKey, getExtraFixedMovieNight, getFixedMovieTitleForDate, isMovieNightClockInStartWindow, getMovieNightEventStartDate } = require("./movieNightSchedule") as typeof import("./movieNightSchedule");
const { extractMovieNightProposalTitle } = require("../utils/movieNightProposal") as typeof import("../utils/movieNightProposal");

const MOVIE_NIGHT_NAME = "SERATA FILM";
const MOVIE_NIGHT_EVENT_CHANNEL_ID = "1497535199813042306";

function isMovieNightEventChannelAndStatus(event?) {
  if (String(event?.channelId || "") !== MOVIE_NIGHT_EVENT_CHANNEL_ID) return false;
  const status = Number(event?.status || 0);
  return status === 1 || status === 2;
}

function isMovieNightEventName(event?) {
  return String(event?.name || "").toUpperCase().includes(MOVIE_NIGHT_NAME);
}

function isSaturdayMovieNightStart(startDate?, now = new Date()) {
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

function isExtraMovieNightStart(startDate?, now = new Date()) {
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

function isTargetMovieNightTimeAndChannel(event?, now = new Date()) {
  if (!isMovieNightEventChannelAndStatus(event)) return false;
  const startDate = getMovieNightEventStartDate(event);
  if (!startDate) return false;
  return isSaturdayMovieNightStart(startDate, now) || isExtraMovieNightStart(startDate, now);
}

function isTargetMovieNightEvent(event?, now = new Date()) {
  return isMovieNightEventName(event) && isTargetMovieNightTimeAndChannel(event, now);
}

function isFixedScheduleMovieNightEvent(event?, now = new Date()) {
  const startDate = getMovieNightEventStartDate(event) || now;
  return Boolean(getFixedMovieTitleForDate(startDate)) && isTargetMovieNightTimeAndChannel(event, now);
}

function isRelaxedSaturdayMovieNightEvent(event?, now = new Date()) {
  if (!isMovieNightEventName(event) || !isMovieNightEventChannelAndStatus(event)) return false;
  const startDate = getMovieNightEventStartDate(event);
  return isSaturdayMovieNightStart(startDate, now);
}

function pickBestMovieNightEvent(candidates?, now = new Date()) {
  const list = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
  if (!list.length) return null;
  const exact = list.filter((event?) => isTargetMovieNightEvent(event, now) || isFixedScheduleMovieNightEvent(event, now));
  const pool = exact.length ? exact : list.filter((event?) => isRelaxedSaturdayMovieNightEvent(event, now));
  return [...pool].sort((a?, b?) => Number(a.scheduledStartTimestamp || 0) - Number(b.scheduledStartTimestamp || 0))[0] || null;
}

async function fetchMovieNightEventById(guild?, eventId?) {
  const id = String(eventId || "").trim();
  if (!id || !guild?.scheduledEvents?.fetch) return null;
  const event = await guild.scheduledEvents.fetch(id).catch(() => null);
  if (!event || !isMovieNightEventName(event)) return null;
  return event;
}

async function findCurrentWeekMovieNightEvent(guild?, now = new Date()) {
  if (!guild?.scheduledEvents?.fetch) return null;
  const events = await guild.scheduledEvents.fetch().catch((err?) => {
    global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] scheduled events fetch failed:", err?.message || err);
    return null;
  });
  if (!events?.size) return null;
  return pickBestMovieNightEvent([...events.values()], now);
}

function extractTitleFromEventDescription(description?) {
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

function resolveTitleFromMovieNightEvent(event?) {
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

async function findExtraMovieNightEvent(guild?, eventDateKey?, now = new Date()) {
  if (!guild?.scheduledEvents?.fetch || !eventDateKey) return null;
  const events = await guild.scheduledEvents.fetch().catch(() => null);
  if (!events?.size) return null;
  const candidates = [...events.values()].filter((event?) => {
    if (!isMovieNightEventName(event) || !isMovieNightEventChannelAndStatus(event)) return false;
    const startDate = getMovieNightEventStartDate(event);
    if (!startDate) return false;
    return getRomeDateKey(startDate) === eventDateKey && isMovieNightClockInStartWindow(startDate);
  });
  if (!candidates.length) return null;
  return [...candidates].sort((a?, b?) => Number(a.scheduledStartTimestamp || 0) - Number(b.scheduledStartTimestamp || 0))[0];
}

export = { MOVIE_NIGHT_NAME, MOVIE_NIGHT_EVENT_CHANNEL_ID, isTargetMovieNightEvent, isFixedScheduleMovieNightEvent, fetchMovieNightEventById, findCurrentWeekMovieNightEvent, resolveTitleFromMovieNightEvent, findExtraMovieNightEvent };
