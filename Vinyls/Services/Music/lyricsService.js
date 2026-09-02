const { initLavalinkMusicIfEnabled, isLavalinkUsable } = require("./lavalinkMusicService");

const LRCLIB_BASE = "https://lrclib.net/api";
const LYRICS_PAGE_MAX = 3800;

const lyricsUiSessions = new Map();

function lrclibHeaders() {
  return {
    Accept: "application/json",
    "User-Agent": "ViniliCaffeDiscordBot/1.0 (+lyrics)",
  };
}

function encodedFromPlayerTrack(track) {
  if (typeof track === "string") return track;
  if (track?.encoded && typeof track.encoded === "string") return track.encoded;
  return null;
}

function stripSyncedTimestamps(s) {
  return String(s || "").replace(/\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/g, "").trim();
}

function normalizeLyricsBody(record) {
  if (!record) return "";
  let raw = String(record.plainLyrics || "").trim();
  if (!raw && record.syncedLyrics) {
    raw = stripSyncedTimestamps(record.syncedLyrics);
  }
  return raw.trim();
}

function pickBestLyricsRecord(arr) {
  if (!Array.isArray(arr) || !arr.length) return null;
  const withPlain = arr.find((r) => String(r?.plainLyrics || "").trim());
  if (withPlain) return withPlain;
  const withSync = arr.find((r) => String(r?.syncedLyrics || "").trim());
  return withSync || arr[0];
}

function chunkLyrics(text, maxLen = LYRICS_PAGE_MAX) {
  const t = String(text || "").trim();
  if (!t) return [];
  const pages = [];
  let rest = t;
  while (rest.length) {
    if (rest.length <= maxLen) {
      pages.push(rest);
      break;
    }
    let cut = rest.lastIndexOf("\n\n", maxLen);
    if (cut < maxLen / 2) cut = rest.lastIndexOf("\n", maxLen);
    if (cut < maxLen / 2) cut = maxLen;
    const chunk = rest.slice(0, cut).trim();
    if (chunk) pages.push(chunk);
    rest = rest.slice(cut).trim();
    if (!rest) break;
  }
  return pages.length ? pages : [t.slice(0, maxLen)];
}

async function lrclibSearch(q) {
  const url = `${LRCLIB_BASE}/search?q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: lrclibHeaders() });
  if (!res.ok) return null;
  return res.json();
}

async function lrclibGet(trackName, artistName, albumName, durationSec) {
  const params = new URLSearchParams({
    track_name: trackName,
    artist_name: artistName,
    album_name: albumName || "Unknown",
    duration: String(Math.max(0, durationSec || 0)),
  });
  const url = `${LRCLIB_BASE}/get?${params}`;
  const res = await fetch(url, { headers: lrclibHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return res.json();
}

function resolveNode(client) {
  const sh = client?.shoukaku;
  return (
    sh?.nodes?.get(process.env.LAVALINK_NODE_NAME || "main") ||
    (typeof sh?.getIdealNode === "function" ? sh.getIdealNode() : null) ||
    (sh?.nodes?.size ? sh.nodes.values().next().value : null)
  );
}

async function resolveGuildLyrics(client, guild, query) {
  if (!guild?.id) return { ok: false, message: "Solo in server." };
  const guildId = guild.id;
  const trimmed = String(query || "").trim();

  if (trimmed) {
    let arr;
    try {
      arr = await lrclibSearch(trimmed);
    } catch (err) {
      global.logger?.warn?.("[LYRICS] search:", err?.message || err);
      return { ok: false, message: "Impossibile contattare il servizio testi." };
    }
    if (!Array.isArray(arr) || !arr.length) {
      return { ok: false, message: "Nessun testo trovato per questa ricerca." };
    }
    const hit = pickBestLyricsRecord(arr);
    const body = normalizeLyricsBody(hit);
    if (hit?.instrumental && !body) {
      return { ok: false, message: "Brano strumentale (nessun testo)." };
    }
    if (!body) {
      return { ok: false, message: "Nessun testo trovato per questa ricerca." };
    }
    const title = `${hit.trackName} — ${hit.artistName}`;
    return { ok: true, title, pages: chunkLyrics(body) };
  }

  initLavalinkMusicIfEnabled(client);
  if (!isLavalinkUsable(client)) {
    return { ok: false, message: "Lavalink non disponibile." };
  }
  const player = client.shoukaku?.players?.get(guildId);
  if (!player?.track) {
    return {
      ok: false,
      message: "Non c'è nulla in riproduzione. Usa `+lyrics <titolo o artista>`.",
    };
  }
  const node = resolveNode(client);
  const enc = encodedFromPlayerTrack(player.track);
  if (!node?.rest?.decode || !enc) {
    return { ok: false, message: "Impossibile leggere il brano in riproduzione." };
  }
  let trackName = "";
  let artistName = "";
  let albumName = "Unknown";
  let durationSec = 0;
  try {
    const t = await node.rest.decode(enc);
    trackName = String(t?.info?.title || "").trim();
    artistName = String(t?.info?.author || "").trim();
    albumName = String(t?.info?.album || "").trim() || "Unknown";
    durationSec = Math.max(0, Math.round(Number(t?.info?.length || 0) / 1000));
  } catch (err) {
    global.logger?.warn?.("[LYRICS] decode:", err?.message || err);
    return { ok: false, message: "Impossibile leggere il brano in riproduzione." };
  }
  if (!trackName) {
    return { ok: false, message: "Titolo non disponibile per i testi." };
  }

  let hit = null;
  try {
    hit = await lrclibGet(trackName, artistName, albumName, durationSec);
  } catch (err) {
    global.logger?.warn?.("[LYRICS] get:", err?.message || err);
  }
  if (!hit || !normalizeLyricsBody(hit)) {
    let arr;
    try {
      arr = await lrclibSearch(`${trackName} ${artistName}`.trim());
    } catch (err) {
      global.logger?.warn?.("[LYRICS] search2:", err?.message || err);
      return { ok: false, message: "Impossibile contattare il servizio testi." };
    }
    hit = arr?.length ? pickBestLyricsRecord(arr) : null;
  }
  if (!hit) {
    return { ok: false, message: "Nessun testo trovato per il brano in riproduzione." };
  }
  const body = normalizeLyricsBody(hit);
  if (hit.instrumental && !body) {
    return { ok: false, message: "Brano strumentale (nessun testo)." };
  }
  if (!body) {
    return { ok: false, message: "Nessun testo trovato per il brano in riproduzione." };
  }
  const title = `${hit.trackName} — ${hit.artistName}`;
  return { ok: true, title, pages: chunkLyrics(body) };
}

function registerLyricsSession(sessionKey, data) {
  lyricsUiSessions.set(sessionKey, data);
}

function deleteLyricsSession(sessionKey) {
  lyricsUiSessions.delete(sessionKey);
}

function getLyricsSession(sessionKey) {
  return lyricsUiSessions.get(sessionKey) || null;
}

module.exports = {
  resolveGuildLyrics,
  registerLyricsSession,
  deleteLyricsSession,
  getLyricsSession,
  LYRICS_PAGE_MAX,
};