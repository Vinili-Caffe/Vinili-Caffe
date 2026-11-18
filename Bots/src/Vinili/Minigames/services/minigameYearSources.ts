/** Fonti API per indovina-l'anno: TVMaze (serie) + iTunes (canzoni/album). */
const axios = require("axios") as any;
const { warnMinigame } = require("./minigameLog") as typeof import("./minigameLog");
const { pickRandomItem } = require("./minigameUtils") as typeof import("./minigameUtils");

const TVMAZE_PAGE_MAX = 40;
const yearCache = { shows: null as any[] | null, songs: null as any[] | null, albums: null as any[] | null, at: 0 };
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function parseYear(value?) {
  const raw = String(value || "").trim();
  const m = raw.match(/(19|20)\d{2}/);
  if (!m) return null;
  const y = Number(m[0]);
  return Number.isFinite(y) && y >= 1900 && y <= 2100 ? y : null;
}

async function fetchTvMazeShows() {
  const now = Date.now();
  if (yearCache.shows && now - yearCache.at < CACHE_TTL_MS) return yearCache.shows;
  const page = Math.floor(Math.random() * TVMAZE_PAGE_MAX);
  try {
    const res = await axios.get(`https://api.tvmaze.com/shows?page=${page}`, { timeout: 12000 });
    const list = Array.isArray(res?.data) ? res.data : [];
    const out = list
      .map((s?) => {
        const title = String(s?.name || "").trim();
        const year = parseYear(s?.premiered);
        if (!title || !year) return null;
        if (String(s?.type || "").toLowerCase() === "animation" && Math.random() < 0.4) return null;
        return { type: "series", title, year, source: "tvmaze" };
      })
      .filter(Boolean);
    if (out.length >= 20) {
      yearCache.shows = out;
      yearCache.at = now;
    }
    return out;
  } catch (err) {
    warnMinigame(err);
    return yearCache.shows || [];
  }
}

async function fetchItunesMedia(entity: "song" | "album") {
  const key = entity === "song" ? "songs" : "albums";
  const now = Date.now();
  if (yearCache[key] && now - yearCache.at < CACHE_TTL_MS) return yearCache[key] as any[];
  const feed =
    entity === "song"
      ? "https://itunes.apple.com/it/rss/topsongs/limit=100/json"
      : "https://itunes.apple.com/it/rss/topalbums/limit=100/json";
  try {
    const res = await axios.get(feed, { timeout: 12000 });
    const entries = res?.data?.feed?.entry;
    const list = Array.isArray(entries) ? entries : [];
    const out = list
      .map((e?) => {
        const title = String(e?.["im:name"]?.label || e?.title?.label || "").trim();
        const artist = String(e?.["im:artist"]?.label || "").trim();
        const year = parseYear(e?.["im:releaseDate"]?.label || e?.["im:releaseDate"]?.attributes?.label);
        if (!title || !year) return null;
        return {
          type: entity === "song" ? "song" : "album",
          title,
          subtitle: artist || null,
          year,
          source: "itunes",
        };
      })
      .filter(Boolean);
    if (out.length >= 10) {
      (yearCache as any)[key] = out;
      yearCache.at = now;
    }
    return out;
  } catch (err) {
    warnMinigame(err);
    return ((yearCache as any)[key] as any[]) || [];
  }
}

async function fetchGuessYearApiCandidates(limit = 40) {
  const [shows, songs, albums] = await Promise.all([
    fetchTvMazeShows(),
    fetchItunesMedia("song"),
    fetchItunesMedia("album"),
  ]);
  const pool = [...shows, ...songs, ...albums];
  if (!pool.length) return [];
  const shuffled = pool.slice();
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.max(1, Number(limit) || 40));
}

function pickGuessYearFromApiPool(pool = [], isRecent?) {
  const list = Array.isArray(pool) ? pool : [];
  if (!list.length) return null;
  const fresh = typeof isRecent === "function"
    ? list.filter((row?) => !isRecent(`${row.type}:${row.title}:${row.year}`))
    : list;
  return pickRandomItem(fresh.length ? fresh : list) || null;
}

export = { fetchGuessYearApiCandidates, pickGuessYearFromApiPool, parseYear };
