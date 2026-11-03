/**
 * movieNightWatchedBlock1
 * Storico film già proiettati alle serate + match per bloccare nuovi suggerimenti.
 */

const { getBotState, setBotState } = require("../../../shared/botState/botStateStore") as typeof import("../../../shared/botState/botStateStore");
const {
  extractMovieNightProposalTitle,
  movieNightTitleCompareKey,
  movieNightTitlesMatch,
} = require("./movieNightProposal") as typeof import("./movieNightProposal");

const STATE_KEY = "movieNightAnnouncement.v1";
const ANNOUNCEMENT_CHANNEL_ID = "1481660281032675510";
const MAX_WATCHED_ENTRIES = 250;
const BOOTSTRAP_LOOKBACK = 200;

/* Allineare con HARRY_POTTER_MOVIE_NIGHT_SCHEDULE in movieNightAnnouncementService.js */
const FIXED_MOVIE_NIGHT_BY_SATURDAY = new Map([
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
]);

const ROME_PARTS_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
});
const WEEKDAY_INDEX = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

function getRomeParts(date = new Date()) {
  const parts: Record<string, any> = {};
  for (const part of ROME_PARTS_FORMATTER.formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: WEEKDAY_INDEX[parts.weekday] || 0,
  };
}

function toDateKey(year?, month?, day?) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getRomeSaturdayKeyForWeek(date = new Date()) {
  const parts = getRomeParts(date);
  const utcDate = Date.UTC(parts.year, parts.month - 1, parts.day);
  const saturdayUtc = utcDate + (6 - Math.max(1, parts.weekday)) * 24 * 60 * 60 * 1000;
  const saturday = new Date(saturdayUtc);
  return toDateKey(saturday.getUTCFullYear(), saturday.getUTCMonth() + 1, saturday.getUTCDate());
}

function normalizeWatchedEntry(entry?) {
  if (!entry) return null;
  if (typeof entry === "string") {
    const title = extractMovieNightProposalTitle(entry) || String(entry || "").trim();
    if (!title) return null;
    return { title, key: movieNightTitleCompareKey(title), at: "", source: "legacy" };
  }
  if (typeof entry !== "object") return null;
  const title =
    extractMovieNightProposalTitle(entry.title || entry.movieTitle || "") ||
    String(entry.title || entry.movieTitle || "").trim();
  if (!title) return null;
  return {
    title,
    key: movieNightTitleCompareKey(title) || String(entry.key || "").trim(),
    at: String(entry.at || ""),
    source: String(entry.source || "state"),
    saturdayKey: String(entry.saturdayKey || ""),
    weekKey: String(entry.weekKey || ""),
  };
}

function mergeWatchedTitleEntries(...groups) {
  const byKey = new Map();
  for (const group of groups) {
    const list = Array.isArray(group) ? group : group ? [group] : [];
    for (const raw of list) {
      const entry = normalizeWatchedEntry(raw);
      if (!entry?.key) continue;
      if (!byKey.has(entry.key)) byKey.set(entry.key, entry);
    }
  }
  return [...byKey.values()].slice(-MAX_WATCHED_ENTRIES);
}

function listFixedPastWatchedTitles(now = new Date()) {
  const currentSat = getRomeSaturdayKeyForWeek(now);
  const out = [];
  for (const [saturdayKey, entry] of FIXED_MOVIE_NIGHT_BY_SATURDAY.entries()) {
    if (entry?.skip || !entry?.title) continue;
    if (String(saturdayKey) >= currentSat) continue;
    out.push({ title: entry.title, saturdayKey, source: "fixed_schedule" });
  }
  return out;
}

function collectWatchedTitlesFromState(state?, now = new Date()) {
  const fromHistory = Array.isArray(state?.watchedMovieTitles) ? state.watchedMovieTitles : [];
  const currentSat = getRomeSaturdayKeyForWeek(now);
  const stateSat = String(state?.finalAnnouncedSaturdayKey || state?.saturdayKey || "").trim();
  const extras = [];
  const stageTitle = String(state?.stageCloseMovieTitle || "").trim();
  if (stageTitle) extras.push({ title: stageTitle, source: "stage_close", saturdayKey: stateSat });
  const finalTitle = String(state?.finalMovieTitle || "").trim();
  /* Solo se la serata di quel titolo è già passata (sabato < sabato corrente). */
  if (finalTitle && stateSat && stateSat < currentSat) {
    extras.push({ title: finalTitle, source: "final_title", saturdayKey: stateSat });
  }
  const eventTitle = String(state?.eventStartMovieTitle || "").trim();
  if (eventTitle && stateSat && stateSat < currentSat) {
    extras.push({ title: eventTitle, source: "event_start", saturdayKey: stateSat });
  }
  return mergeWatchedTitleEntries(fromHistory, extras, listFixedPastWatchedTitles(now));
}

function isMovieNightTitleAlreadyWatched(title?, state?, now = new Date()) {
  const proposed = movieNightTitleCompareKey(title);
  if (!proposed) return false;
  const watched = collectWatchedTitlesFromState(state, now);
  return watched.some((entry?) => {
    if (entry?.key && entry.key === proposed) return true;
    /* stesso matcher del thread: Cars ≡ Cars 1, Kung Fu Panda ≡ Kung Fu Panda 1 */
    if (movieNightTitlesMatch(title, entry?.title || "")) return true;
    if (entry?.key && movieNightTitlesMatch(proposed, entry.key)) return true;
    return false;
  });
}

function extractTitleFromAnnouncementContent(content?) {
  const raw = String(content || "");
  const patterns = [
    /trasmettendo\s+\*\*(.+?)\*\*/iu,
    /proiezione di\s+\*\*(.+?)\*\*/iu,
    /proietteremo\s+\*\*(.+?)\*\*/iu,
  ];
  for (const re of patterns) {
    const m = raw.match(re);
    if (m?.[1]) {
      const title = extractMovieNightProposalTitle(m[1]) || String(m[1]).trim();
      if (title && title.length >= 2 && !/^il film scelto$/iu.test(title)) return title;
    }
  }
  return "";
}

async function bootstrapWatchedMovieNightTitlesFromChannel(client?) {
  const state = await getBotState(STATE_KEY, null);
  if (state?.watchedTitlesBootstrappedAt) {
    return { ok: true, skipped: true, reason: "already_bootstrapped", count: (state.watchedMovieTitles || []).length };
  }
  const channel =
    client?.channels?.cache?.get?.(ANNOUNCEMENT_CHANNEL_ID) ||
    (await client?.channels?.fetch?.(ANNOUNCEMENT_CHANNEL_ID).catch(() => null));
  if (!channel?.messages?.fetch) {
    return { ok: false, reason: "channel_unavailable" };
  }
  const found = [];
  let before;
  let fetched = 0;
  while (fetched < BOOTSTRAP_LOOKBACK) {
    const limit = Math.min(100, BOOTSTRAP_LOOKBACK - fetched);
    const batch = await channel.messages.fetch({ limit, ...(before ? { before } : {}) }).catch(() => null);
    if (!batch?.size) break;
    const rows = [...batch.values()];
    fetched += rows.length;
    for (const message of rows) {
      if (message.author?.id && client?.user?.id && String(message.author.id) !== String(client.user.id)) continue;
      const title = extractTitleFromAnnouncementContent(message.content);
      if (!title) continue;
      found.push({
        title,
        at: message.createdAt?.toISOString?.() || new Date(message.createdTimestamp || Date.now()).toISOString(),
        source: "announce_bootstrap",
      });
    }
    if (rows.length < limit) break;
    before = rows[rows.length - 1]?.id;
  }
  const base = state && typeof state === "object" ? state : {};
  const nextEntries = mergeWatchedTitleEntries(
    base.watchedMovieTitles,
    found,
    listFixedPastWatchedTitles(new Date()),
    base.stageCloseMovieTitle,
  );
  const next = {
    ...base,
    watchedMovieTitles: nextEntries,
    watchedTitlesBootstrappedAt: new Date().toISOString(),
  };
  await setBotState(STATE_KEY, next);
  return { ok: true, count: nextEntries.length, bootstrapped: found.length };
}

async function ensureWatchedMovieNightTitlesReady(client?) {
  try {
    return await bootstrapWatchedMovieNightTitlesFromChannel(client);
  } catch (err) {
    global.logger?.warn?.("[MOVIE NIGHT WATCHED] bootstrap failed:", err?.message || err);
    return { ok: false, reason: "bootstrap_error" };
  }
}

async function isProposedMovieNightTitleAlreadyWatched(title?, now = new Date()) {
  const state = await getBotState(STATE_KEY, null);
  return isMovieNightTitleAlreadyWatched(title, state, now);
}

export = {
  STATE_KEY,
  ensureWatchedMovieNightTitlesReady,
  isProposedMovieNightTitleAlreadyWatched,
  mergeWatchedTitleEntries,
};
