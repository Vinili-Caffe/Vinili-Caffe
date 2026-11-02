/** Musica: link Spotify e titoli cliccabili nei messaggi. */
const { logMusic, parsePlainMusicQueryHint } = require("./musicSearch") as typeof import("./musicSearch");
const { scoreTrackMetaMatch } = require("./musicMatch") as typeof import("./musicMatch");

function safeEmbedBoldFragment(s?) {
  return String(s || "")
    .replace(/\*/g, "")
    .replace(/_/g, "")
    .trim() || "Traccia";
}

const MUSIC_SPOTIFY_URL_LOOKUP = String(process.env.MUSIC_SPOTIFY_URL_LOOKUP || "1").trim() === "1";
const SPOTIFY_CLIENT_ID = String(process.env.SPOTIFY_CLIENT_ID || "").trim();
const SPOTIFY_CLIENT_SECRET = String(process.env.SPOTIFY_CLIENT_SECRET || "").trim();
let _spotifyTokenCache = { accessToken: "", expiresAtMs: 0 };

function safeDiscordLinkLabel(s?) {
  let t = String(s || "").trim();
  t = t.replace(/\*\*/g, "");
  t = t.replace(/[\[\]()]/g, "");
  return t.trim() || "Traccia";
}

function extractOpenSpotifyTrackUrl(uri?) {
  const u = String(uri || "").trim();
  const m = u.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track\/[a-zA-Z0-9]+)/);
  if (m) return `https://open.spotify.com/${m[1]}`;
  return null;
}

function spotifySchemeToTrackHttps(uri?) {
  const m = String(uri || "").trim().match(/^spotify:track:([a-zA-Z0-9]+)/i);
  if (m) return `https://open.spotify.com/track/${m[1]}`;
  return null;
}

function spotifyIsrcSearchUrl(t?) {
  const raw = String(t?.info?.isrc || "").trim().replace(/\s+/g, "");
  if (!raw) return null;
  const compact = raw.replace(/-/g, "").toUpperCase();
  if (!/^[A-Z0-9]{12}$/.test(compact)) return null;
  const hyphenated = `${compact.slice(0, 2)}-${compact.slice(2, 5)}-${compact.slice(5, 7)}-${compact.slice(7)}`;
  return `https://open.spotify.com/search/isrc%3A${encodeURIComponent(hyphenated)}`;
}

function spotifyDirectUrlFromTrack(t?) {
  if (!t?.info) return null;
  const uri = String(t.info.uri || "").trim();
  let u = extractOpenSpotifyTrackUrl(uri);
  if (u) return u;
  u = spotifySchemeToTrackHttps(uri);
  if (u) return u;
  const src = String(t.info.sourceName || "").toLowerCase();
  const id = String(t.info.identifier || "").trim();
  if (src.includes("spotify") && /^[a-zA-Z0-9]{21,22}$/.test(id)) {
    return `https://open.spotify.com/track/${id}`;
  }
  return null;
}

/* spsearchFix1: non usare Lavalink spsearch (LavaSrc SocketTimeout → stack PM2).
   Lookup link Spotify via Web API client-credentials (stesso clientId di application.yml). */
async function fetchSpotifyClientCredentialsToken() {
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) return "";
  const now = Date.now();
  if (_spotifyTokenCache.accessToken && _spotifyTokenCache.expiresAtMs > now + 30_000) {
    return _spotifyTokenCache.accessToken;
  }
  const basic = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) return "";
  const j: any = await res.json().catch(() => null);
  const tok = String(j?.access_token || "").trim();
  const expiresIn = Math.max(60, Number(j?.expires_in) || 3600);
  if (!tok) return "";
  _spotifyTokenCache = { accessToken: tok, expiresAtMs: now + expiresIn * 1000 };
  return tok;
}

async function trySpotifyDirectUrlViaSearch(_node?, track?) {
  if (!MUSIC_SPOTIFY_URL_LOOKUP || !track?.info) return null;
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) return null;
  const title = String(track.info.title || "").trim();
  const author = String(track.info.author || "").trim();
  const q = [title, author].filter(Boolean).join(" ").trim();
  if (q.length < 2) return null;
  try {
    const tok = await fetchSpotifyClientCredentialsToken();
    if (!tok) return null;
    const url =
      "https://api.spotify.com/v1/search?" +
      new URLSearchParams({
        q: q.slice(0, 280),
        type: "track",
        limit: "5",
        market: String(process.env.SPOTIFY_MARKET || "IT").trim() || "IT",
      }).toString();
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${tok}`, Accept: "application/json" },
    });
    if (!res.ok) return null;
    const j: any = await res.json().catch(() => null);
    const items = Array.isArray(j?.tracks?.items) ? j.tracks.items : [];
    const hit = items.find((it?) => it?.external_urls?.spotify || it?.id) || items[0];
    if (!hit) return null;
    const open = String(hit?.external_urls?.spotify || "").trim();
    if (open) return open;
    const id = String(hit?.id || "").trim();
    if (/^[a-zA-Z0-9]{21,22}$/.test(id)) return `https://open.spotify.com/track/${id}`;
    return null;
  } catch (err) {
    logMusic("spotify web search:", err?.message || err);
    return null;
  }
}

/* nameSearchOrig1: plain-text → seed Spotify Web API (titolo/artista/ISRC veri),
   poi remirror YT. Evita pick cieco ytsearch:"… topic". */
async function searchSpotifyTrackMetaForQuery(rawQuery?) {
  if (!MUSIC_SPOTIFY_URL_LOOKUP) return null;
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) return null;
  const q = String(rawQuery || "")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (q.length < 2) return null;
  try {
    const tok = await fetchSpotifyClientCredentialsToken();
    if (!tok) return null;
    const url =
      "https://api.spotify.com/v1/search?" +
      new URLSearchParams({
        q: q.slice(0, 280),
        type: "track",
        limit: "8",
        market: String(process.env.SPOTIFY_MARKET || "IT").trim() || "IT",
      }).toString();
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${tok}`, Accept: "application/json" },
    });
    if (!res.ok) return null;
    const j: any = await res.json().catch(() => null);
    const items = Array.isArray(j?.tracks?.items) ? j.tracks.items : [];
    if (!items.length) return null;
    const hint = parsePlainMusicQueryHint(q);
    const wanted = { title: hint.title || q, author: hint.author || "" };
    let best = null;
    let bestAdj = -1;
    for (const hit of items) {
      const title = String(hit?.name || "").trim();
      const author = Array.isArray(hit?.artists)
        ? hit.artists.map((a?) => a?.name).filter(Boolean).join(", ")
        : "";
      const score = scoreTrackMetaMatch(wanted, {
        title,
        author,
        length: Number(hit?.duration_ms) || 0,
        isrc: hit?.external_ids?.isrc || "",
      });
      const pop = Number(hit?.popularity) || 0;
      const adj = score + pop / 1000;
      if (adj > bestAdj) {
        bestAdj = adj;
        best = hit;
      }
    }
    if (!best || bestAdj < 0.45) return null;
    const open = String(best?.external_urls?.spotify || "").trim();
    const id = String(best?.id || "").trim();
    const outUrl =
      open ||
      (/^[a-zA-Z0-9]{21,22}$/.test(id) ? `https://open.spotify.com/track/${id}` : "");
    if (!outUrl) return null;
    return {
      title: String(best.name || "").trim(),
      author: Array.isArray(best.artists)
        ? best.artists.map((a?) => a?.name).filter(Boolean).join(", ")
        : "",
      isrc: String(best?.external_ids?.isrc || "").trim(),
      length: Number(best?.duration_ms) || 0,
      url: outUrl,
    };
  } catch (err) {
    logMusic("spotify name seed:", err?.message || err);
    return null;
  }
}

async function resolveSpotifyWebUrl(node?, track?) {
  const direct = spotifyDirectUrlFromTrack(track);
  if (direct) return direct;
  const fromSearch = await trySpotifyDirectUrlViaSearch(node, track);
  if (fromSearch) return fromSearch;
  return spotifyIsrcSearchUrl(track);
}

function formatTrackTitleMarkdownLink(trackLabel?, spotifyUrl?) {
  const safe = safeDiscordLinkLabel(trackLabel);
  if (spotifyUrl) return `[**${safe}**](${spotifyUrl})`;
  return `**${safe}**`;
}

function resolveSpotifyWebUrlSync(track?) {
  if (!track?.info) return null;
  return spotifyDirectUrlFromTrack(track) || spotifyIsrcSearchUrl(track);
}

function splitNowPlayingLabel(label?) {
  const s = String(label || "").trim();
  if (!s) return { title: "Traccia", author: "" };
  const em = s.split(/\s*—\s*/);
  if (em.length >= 2) {
    return { title: em[0].trim(), author: em.slice(1).join(" — ").trim() };
  }
  const hy = s.split(/\s+-\s+/);
  if (hy.length >= 2) {
    return { title: hy[0].trim(), author: hy.slice(1).join(" - ").trim() };
  }
  return { title: s, author: "" };
}

export = { safeEmbedBoldFragment, safeDiscordLinkLabel, searchSpotifyTrackMetaForQuery, resolveSpotifyWebUrl, formatTrackTitleMarkdownLink, resolveSpotifyWebUrlSync, splitNowPlayingLabel };
