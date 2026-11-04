/** Cover Discord scheduled event da poster calendario fisso (CDN). */
const {
  getFixedMoviePosterForDate,
  getMovieNightEventStartDate,
} = require("./movieNightSchedule") as typeof import("./movieNightSchedule");

const MOVIE_NIGHT_NAME = "SERATA FILM";
const appliedPosterByEventId = new Map<string, string>();
const MAX_COVER_BYTES = 8 * 1024 * 1024;

function isMovieNightEventName(event?) {
  return String(event?.name || "").toUpperCase().includes(MOVIE_NIGHT_NAME);
}

async function fetchPosterBuffer(url?) {
  const u = String(url || "").trim();
  if (!u) return null;
  try {
    const res = await fetch(u, { redirect: "follow" });
    if (!res?.ok) return null;
    const ab = await res.arrayBuffer();
    const buf = Buffer.from(ab);
    if (!buf.length || buf.length > MAX_COVER_BYTES) return null;
    return buf;
  } catch (_) {
    return null;
  }
}

/**
 * Se l'evento SERATA FILM cade in una settimana con poster in calendario,
 * imposta la cover Discord (si attiva alla creazione / update / announce).
 */
async function ensureMovieNightScheduledEventPoster(event?, opts: Record<string, any> = {}) {
  if (!event?.edit || !isMovieNightEventName(event)) {
    return { ok: false, skipped: true, reason: "not_movie_night_event" };
  }
  const startDate = getMovieNightEventStartDate(event) || opts.now || new Date();
  const posterUrl = String(opts.posterUrl || getFixedMoviePosterForDate(startDate) || "").trim();
  if (!posterUrl) return { ok: false, skipped: true, reason: "no_poster" };

  const eventId = String(event.id || "").trim();
  if (!opts.force && eventId && appliedPosterByEventId.get(eventId) === posterUrl && event.image) {
    return { ok: true, skipped: true, reason: "already_applied", eventId, posterUrl };
  }

  const buf = await fetchPosterBuffer(posterUrl);
  if (!buf) return { ok: false, skipped: false, reason: "poster_fetch_failed", posterUrl };

  const edited = await event
    .edit({ image: buf, reason: opts.reason || "SERATA FILM: cover da calendario" })
    .then(() => true)
    .catch((err?) => {
      global.logger?.warn?.(
        "[MOVIE NIGHT POSTER] edit failed:",
        err?.message || err,
        "event=",
        eventId,
      );
      return false;
    });

  if (!edited) return { ok: false, skipped: false, reason: "edit_failed", eventId, posterUrl };
  if (eventId) appliedPosterByEventId.set(eventId, posterUrl);
  global.logger?.info?.("[MOVIE NIGHT POSTER] cover impostata", eventId, posterUrl);
  return { ok: true, changed: true, eventId, posterUrl };
}

export = { ensureMovieNightScheduledEventPoster };
