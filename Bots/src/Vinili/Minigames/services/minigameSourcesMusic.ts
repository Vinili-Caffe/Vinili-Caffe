/** Minigiochi: cantanti, album e canzoni. */
const axios = require("axios") as any;
const { warnMinigame } = require("./minigameLog") as typeof import("./minigameLog");
const { normalizeCountryName, pickBestSingerImage } = require("./minigameImages") as typeof import("./minigameImages");
const { randomBetween, buildAliases } = require("./minigameSourcesShared") as typeof import("./minigameSourcesShared");

let cachedSongs = null;
let cachedSongsAt = 0;
const SONG_CACHE_TTL_MS = 15 * 60 * 1000;
let cachedSingers = null;
let cachedSingersAt = 0;
const SINGER_CACHE_TTL_MS = 3 * 60 * 60 * 1000;
let cachedAlbums = null;
let cachedAlbumsAt = 0;
const ALBUM_CACHE_TTL_MS = 3 * 60 * 60 * 1000;

const DEFAULT_ONLY_FAMOUS_MIN_FANS = 50000;
const FALLBACK_MIN_FANS = 20000;
const MIN_SINGERS_AFTER_FILTER = 15;

async function loadSingersFromApi(cfg?) {
  const now = Date.now();
  if (cachedSingers && now - cachedSingersAt < SINGER_CACHE_TTL_MS)
    return cachedSingers;

  const apiUrl = cfg?.guessSinger?.apiUrl || "https://api.deezer.com/chart/0/artists?limit=100";
  const minFans = Number(cfg?.guessSinger?.onlyFamousMinFans ?? DEFAULT_ONLY_FAMOUS_MIN_FANS) || 0;
  const out = [];
  try {
    const res = await axios.get(apiUrl, { timeout: 15000 });
    const list = Array.isArray(res?.data?.data) ? res.data.data : [];
    for (const artist of list) {
      const name = artist?.name;
      const image = pickBestSingerImage(artist);
      if (!name) continue;
      const fans = Number(artist?.nb_fan ?? 0);
      if (minFans > 0 && fans < minFans) continue;
      out.push({ name, answers: buildAliases([name]), image });
    }
    if (minFans > 0 && out.length < MIN_SINGERS_AFTER_FILTER) {
      out.length = 0;
      const fallback = Number(cfg?.guessSinger?.fallbackMinFans ?? FALLBACK_MIN_FANS) || FALLBACK_MIN_FANS;
      for (const artist of list) {
        const name = artist?.name;
        const image = pickBestSingerImage(artist);
        if (!name) continue;
        if (Number(artist?.nb_fan ?? 0) < fallback) continue;
        out.push({ name, answers: buildAliases([name]), image });
      }
    }
  } catch (err) {
    warnMinigame(err);
  }
  cachedSingers = out;
  cachedSingersAt = now;
  return cachedSingers;
}

async function loadAlbumsFromApi(cfg?) {
  const now = Date.now();
  if (cachedAlbums && now - cachedAlbumsAt < ALBUM_CACHE_TTL_MS)
    return cachedAlbums;

  const onlyFamousArtists = cfg?.guessAlbum?.onlyFamousArtists !== false;
  let famousArtistNames = null;
  if (onlyFamousArtists) {
    const singers = await loadSingersFromApi(cfg);
    famousArtistNames = new Set(singers.map((s?) => normalizeCountryName(s?.name)).filter(Boolean));
  }

  const apiUrl = cfg?.guessAlbum?.apiUrl || "https://api.deezer.com/chart/0/albums?limit=100";
  const out = [];
  try {
    const res = await axios.get(apiUrl, { timeout: 15000 });
    const list = Array.isArray(res?.data?.data) ? res.data.data : [];
    for (const album of list) {
      const title = album?.title;
      const artist = album?.artist?.name || "Artista sconosciuto";
      const image = album?.cover_xl || album?.cover_big || album?.cover_medium || album?.cover || null;
      if (!title || !image) continue;
      if (onlyFamousArtists && famousArtistNames && !famousArtistNames.has(normalizeCountryName(artist)))
        continue;
      out.push({ album: title, artist, answers: buildAliases([title]), image });
    }
  } catch (err) {
    warnMinigame(err);
  }

  cachedAlbums = out;
  cachedAlbumsAt = now;
  return cachedAlbums;
}

async function fetchRandomSong(cfg?) {
  const apiBase = cfg?.guessSong?.apiUrl;
  if (!apiBase) return null;
  const popularTerms = Array.isArray(cfg?.guessSong?.popularTerms) && cfg.guessSong.popularTerms.length ? cfg.guessSong.popularTerms : ["the weeknd", "dua lipa", "ed sheeran", "drake", "ariana grande", "taylor swift", "billie eilish", "maneskin", "elodie", "sfera ebbasta", "thasup", "bad bunny", "eminem", "coldplay", "maroon 5", "bruno mars", "adele", "beyoncé", "rihanna", "justin bieber", "shawn mendes", "harry styles", "the chainsmokers", "david guetta", "calvin harris", "marco mengoni", "fedez", "j-ax", "ghali", "salmo", "lazza", "madame", "rosa chemical", "tananai", "blanco", "ultimo", "lorenzo fragola", "laura pausini", "eros ramazzotti", "vasco rossi", "ligabue", "tiziano ferro", "jovanotti", "giorgia", "alessandra amoroso", "articolo 31", "gemitaiz", "caparezza",];
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const term = popularTerms[randomBetween(0, popularTerms.length - 1)];
    const url = `${apiBase}${encodeURIComponent(term)}&entity=song&limit=50`;
    try {
      const res = await axios.get(url, { timeout: 15000 });
      const results = Array.isArray(res?.data?.results) ? res.data.results : [];
      const songs = results.filter((item?) => item?.trackName && item?.artistName && item?.previewUrl,);
      if (!songs.length) continue;
      const song = songs[randomBetween(0, songs.length - 1)];
      const artwork = song.artworkUrl100 ? song.artworkUrl100.replace("100x100bb", "600x600bb") : null;
      const genre = song.primaryGenreName || "Genere sconosciuto";
      const artistCountry = await fetchArtistCountry(cfg, song.artistName);
      return {
        title: song.trackName,
        artist: song.artistName,
        album: song.collectionName || "Album sconosciuto",
        artwork,
        genre,
        artistCountry: artistCountry || "Nazionalità sconosciuta",
        previewUrl: song.previewUrl || null,
      };
    } catch (err) {
      warnMinigame(err);
    }
  }
  return null;
}

const POPULAR_SONG_TOP_PER_SOURCE = 50;
const DEFAULT_POPULAR_FEEDS = [
  "https://itunes.apple.com/it/rss/topsongs/limit=100/json",
  "https://itunes.apple.com/us/rss/topsongs/limit=100/json",
  "https://itunes.apple.com/gb/rss/topsongs/limit=100/json",
  "https://itunes.apple.com/fr/rss/topsongs/limit=100/json",
  "https://itunes.apple.com/de/rss/topsongs/limit=100/json",
];

async function loadPopularSongList(cfg?) {
  const now = Date.now();
  if (cachedSongs && now - cachedSongsAt < SONG_CACHE_TTL_MS)
    return cachedSongs;
  const all = [];
  const topN = Math.max(20, Number(cfg?.guessSong?.topPerSource ?? POPULAR_SONG_TOP_PER_SOURCE) || POPULAR_SONG_TOP_PER_SOURCE);

  const deezerChartUrl = cfg?.guessSong?.deezerChartUrl || "https://api.deezer.com/chart/0/tracks?limit=100";
  try {
    const chartRes = await axios.get(deezerChartUrl, { timeout: 15000 });
    const tracks = Array.isArray(chartRes?.data?.data) ? chartRes.data.data : [];
    const slice = tracks.slice(0, topN);
    for (const track of slice) {
      if (!track?.title || !track?.artist?.name) continue;
      all.push({
        source: "deezer",
        id: String(track.id || ""),
        title: track.title,
        artist: track.artist.name,
        album: track?.album?.title || "Album sconosciuto",
        artwork:
          track?.album?.cover_xl ||
          track?.album?.cover_big ||
          track?.album?.cover_medium ||
          null,
        genre: "Popolare",
        previewUrl: track.preview || null,
      });
    }
  } catch (err) {
    warnMinigame(err);
  }

  const feeds = (Array.isArray(cfg?.guessSong?.popularFeeds) as any)?.length ? cfg.guessSong.popularFeeds : DEFAULT_POPULAR_FEEDS;
  for (const feed of feeds) {
    if (!feed) continue;
    try {
      const res = await axios.get(feed, { timeout: 15000 });
      const entries = Array.isArray(res?.data?.feed?.entry) ? res.data.feed.entry : [];
      const sliceEntries = entries.slice(0, topN);
      for (const entry of sliceEntries) {
        const id = entry?.id?.attributes?.["im:id"] || entry?.id?.attributes?.im_id;
        const title = entry?.["im:name"]?.label || entry?.title?.label;
        const artist = entry?.["im:artist"]?.label || entry?.["im:artist"]?.name;
        const images = Array.isArray(entry?.["im:image"]) ? entry["im:image"] : [];
        const artwork = images.length ? images[images.length - 1].label : null;
        if (!id || !title || !artist) continue;
        all.push({
          source: "itunes_feed",
          id: String(id),
          title,
          artist,
          artwork,
        });
      }
    } catch (err) {
      warnMinigame(err);
    }
  }
  cachedSongs = all;
  cachedSongsAt = now;
  return cachedSongs;
}

async function fetchPopularSong(cfg?) {
  const list = await loadPopularSongList(cfg);
  if (!list.length) return null;
  const onlyWithPreview = list.filter((item?) => item?.previewUrl);
  const pool = onlyWithPreview.length ? onlyWithPreview : list;
  const pick = pool[randomBetween(0, pool.length - 1)];
  if (!pick?.id) return null;

  if (pick.source === "deezer") {
    const artistCountry = await fetchArtistCountry(cfg, pick.artist);
    return {
      title: pick.title,
      artist: pick.artist,
      album: pick.album || "Album sconosciuto",
      artwork: pick.artwork || null,
      genre: pick.genre || "Genere sconosciuto",
      artistCountry: artistCountry || "Nazionalità sconosciuta",
      previewUrl: pick.previewUrl || null,
    };
  }

  const lookupUrl = `https://itunes.apple.com/lookup?id=${encodeURIComponent(pick.id)}`;
  try {
    const res = await axios.get(lookupUrl, { timeout: 15000 });
    const item = Array.isArray(res?.data?.results) ? res.data.results[0] : null;
    if (!item?.trackName || !item?.artistName) return null;
    const genre = item?.primaryGenreName || "Genere sconosciuto";
    const artistCountry = await fetchArtistCountry(cfg, pick.artist);
    return {
      title: item?.trackName || pick.title,
      artist: item?.artistName || pick.artist,
      album: item?.collectionName || "Album sconosciuto",
      artwork: item?.artworkUrl100
        ? item.artworkUrl100.replace("100x100bb", "600x600bb")
        : pick.artwork,
      genre,
      artistCountry: artistCountry || "Nazionalità sconosciuta",
      previewUrl: item?.previewUrl || null,
    };
  } catch {
    return null;
  }
}

function normalizeArtistLabel(value?) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\((feat|ft)\.?[^)]*\)/g, " ")
    .replace(/\b(feat|ft)\.?[\s\S]*$/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildArtistSearchTerms(artistName?) {
  const raw = String(artistName || "").trim();
  const normalized = normalizeArtistLabel(raw);
  const terms = new Set();
  if (raw) terms.add(raw);
  if (normalized && normalized !== raw.toLowerCase()) terms.add(normalized);
  return Array.from(terms).filter(Boolean);
}

function pickBestArtistCandidate(candidates?, artistName?) {
  if (!Array.isArray(candidates) || !candidates.length) return null;
  const target = normalizeArtistLabel(artistName);
  const scored = candidates.map((artist?) => { const artistLabel = normalizeArtistLabel(artist?.name); const hasCountry = Boolean(artist?.country || artist?.area?.name); const mbScore = Number(artist?.score || 0); let nameScore = 0; if (artistLabel && target) { if (artistLabel === target) nameScore = 120; else if (artistLabel.includes(target) || target.includes(artistLabel)) nameScore = 60; } const countryBonus = hasCountry ? 30 : 0; return { artist, score: mbScore + nameScore + countryBonus }; }).sort((a?, b?) => b.score - a.score);
  return scored[0]?.artist || null;
}

async function fetchArtistCountry(cfg?, artistName?) {
  if (!artistName) return null;
  const apiBase = cfg?.guessSong?.artistApiUrl || "https://musicbrainz.org/ws/2/artist/?query=artist:";
  const terms = buildArtistSearchTerms(artistName);
  const urls = [];

  for (const term of terms) {
    urls.push(`${apiBase}${encodeURIComponent((term as any))}&fmt=json&limit=8`);
  }
  urls.push(
    `https://musicbrainz.org/ws/2/artist/?query=artist:${encodeURIComponent(artistName)}&fmt=json&limit=8`,
  );
  urls.push(
    `https://musicbrainz.org/ws/2/artist/?query=artist:%22${encodeURIComponent(artistName)}%22&fmt=json&limit=8`,
  );

  const seen = new Set();
  for (const url of urls) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    try {
      const res = await axios.get(url, { timeout: 15000, headers: { "User-Agent": "ViniliCaffeBot/1.0 (discord bot)", }, });
      const candidates = Array.isArray(res?.data?.artists) ? res.data.artists : [];
      const artist = pickBestArtistCandidate(candidates, artistName);
      const country = artist?.country || artist?.area?.name || null;
      if (country) return country;
    } catch (err) {
      warnMinigame(err);
    }
  }
  return null;
}

export = { loadSingersFromApi, loadAlbumsFromApi, fetchRandomSong, fetchPopularSong };
