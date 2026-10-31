/** Musica: dalla richiesta dell'utente alle ricerche da provare su Lavalink. */
const { LoadType } = require("shoukaku") as typeof import("shoukaku");

const MUSIC_LOGS = String(process.env.MUSIC_LOGS || "0").trim() === "1";

function getMusicSearchMode() {
  const m = String(process.env.MUSIC_SEARCH_MODE || "").trim().toLowerCase();
  if (m === "spotify") return "spotify";
  if (m === "spotify_first") return "spotify_first";
  return "youtube";
}

function isYoutubeLikeUrl(query?) {
  const lower = String(query || "").trim().toLowerCase();
  if (!lower.startsWith("http://") && !lower.startsWith("https://")) return false;
  return (
    lower.includes("youtube.com") ||
    lower.includes("youtu.be") ||
    lower.includes("music.youtube.com")
  );
}

function logMusic(...args) {
  if (!MUSIC_LOGS) return;
  global.logger?.info?.("[MUSIC]", ...args);
}

function normalizeLavalinkLoadType(res?) {
  const raw = res?.loadType;
  if (raw == null) return "";
  const s = String(raw).trim().toLowerCase();
  if (s === String(LoadType.TRACK).toLowerCase() || s === "track") return "track";
  if (s === String(LoadType.SEARCH).toLowerCase() || s === "search") return "search";
  if (s === String(LoadType.PLAYLIST).toLowerCase() || s === "playlist") return "playlist";
  if (s === String(LoadType.EMPTY).toLowerCase() || s === "empty") return "empty";
  if (s === String(LoadType.ERROR).toLowerCase() || s === "error") return "error";
  return s;
}

function tracksFromResolve(res?) {
  if (!res) return [];
  const lt = normalizeLavalinkLoadType(res);
  const d = res.data;
  if (lt === "track") return d ? [d] : [];
  if (lt === "search") {
    if (Array.isArray(d)) return d;
    if (d && Array.isArray(d.tracks)) return d.tracks;
    return [];
  }
  if (lt === "playlist") {
    return Array.isArray(d?.tracks) ? d.tracks : [];
  }
  if (lt === "empty" || lt === "error") return [];
  if (Array.isArray(d) && d.length && d[0]?.encoded != null) return d;
  if (d && typeof d === "object" && d.encoded != null && d.info) return [d];
  if (d && typeof d === "object" && Array.isArray(d.tracks) && d.tracks.length && d.tracks[0]?.encoded != null) {
    return d.tracks;
  }
  return [];
}

function lavalinkErrorHint(res?) {
  if (!res || normalizeLavalinkLoadType(res) !== "error" || res.data == null) return null;
  const d = res.data;
  if (typeof d === "string") return d;
  if (typeof d === "object") {
    return d.message || d.exception || d.cause || null;
  }
  return null;
}

function isPlainTextMusicQuery(q?) {
  const t = String(q || "").trim();
  if (!t) return false;
  const lower = t.toLowerCase();
  if (lower.startsWith("http://") || lower.startsWith("https://")) return false;
  if (/^spotify:/i.test(t)) return false;
  if (/^[a-z0-9]+search:/i.test(t)) return false;
  return true;
}

const OPEN_SPOTIFY_PATH_RE =
  /^https?:\/\/open\.spotify\.com\/(?:intl-[a-z]{2,}(?:-[a-z]+)?\/)?(playlist|album|track)\/([a-zA-Z0-9]+)\/?(?:[?#].*)?$/i;

function normalizeOpenSpotifyHttpUrl(raw?) {
  const s = String(raw || "").trim();
  const m = s.match(OPEN_SPOTIFY_PATH_RE);
  if (!m) return null;
  return `https://open.spotify.com/${m[1].toLowerCase()}/${m[2]}`;
}

function openSpotifyHttpsToSpotifyUri(query?) {
  const canon = normalizeOpenSpotifyHttpUrl(query) || String(query || "").trim();
  const m = canon.match(/^https:\/\/open\.spotify\.com\/(playlist|album|track)\/([a-zA-Z0-9]+)$/i);
  if (!m) return null;
  return `spotify:${m[1].toLowerCase()}:${m[2]}`;
}

function isSpotifyPodcastOnlyInput(query?) {
  const q = String(query || "").trim();
  if (!q) return false;
  if (/^spotify:(show|episode):/i.test(q)) return true;
  const lower = q.toLowerCase();
  return /open\.spotify\.com\/(?:intl-[a-z-]+\/)?(show|episode)\//i.test(lower);
}

function isOpenSpotifyMusicUrlInput(query?) {
  const q = String(query || "").trim();
  if (!q) return false;
  if (/^spotify:(playlist|album|track):/i.test(q)) return true;
  const lower = q.toLowerCase();
  if (!lower.includes("open.spotify.com")) return false;
  return /\/(?:intl-[a-z]{2,}(?:-[a-z]+)?\/)?(playlist|album|track)\//i.test(lower);
}

function isLikelySpotifyPodcastTrack(t?) {
  const u = String(t?.info?.uri || "").toLowerCase();
  if (u.includes("/episode/") || u.includes("spotify:episode:")) return true;
  const ident = String(t?.info?.identifier || "").toLowerCase().trim();
  if (ident.startsWith("spotify:episode:")) return true;
  return false;
}

function filterOutSpotifyPodcastTracks(tracks?) {
  if (!Array.isArray(tracks) || !tracks.length) return [];
  return tracks.filter((t?) => !isLikelySpotifyPodcastTrack(t));
}

function parsePlainMusicQueryHint(raw?) {
  const q = String(raw || "").replace(/,/g, " ").replace(/\s+/g, " ").trim();
  if (!q) return { title: "", author: "", query: "" };
  let title = q;
  let author = "";
  const dash = q.match(/^(.{2,80}?)\s+[-–—]\s+(.{2,120})$/);
  if (dash) {
    author = dash[1].trim();
    title = dash[2].trim();
  } else {
    const by = q.match(/^(.{2,120}?)\s+by\s+(.{2,80})$/i);
    if (by) {
      title = by[1].trim();
      author = by[2].trim();
    } else {
      /* nameSearchStrict1: "titolo di Artista" / "titolo del Artista" */
      const di = q.match(/^(.{2,120}?)\s+(?:di|del|della|dei|degli|by)\s+(.{2,80})$/i);
      if (di) {
        title = di[1].trim();
        author = di[2].trim();
      }
    }
  }
  return { title, author, query: [title, author].filter(Boolean).join(" ").trim() || q };
}

function buildResolveAttempts(userQuery?) {
  const raw = String(userQuery || "").trim();
  if (!raw) return [];
  const mode = getMusicSearchMode();
  const primary = normalizeLavalinkResolveQuery(raw);
  const attempts = [];
  if (isPlainTextMusicQuery(raw)) {
    /* nameSearchStrict1: se c'è artista → query artista-titolo PRIMA; ytmsearch dopo (cover) */
    const hint = parsePlainMusicQueryHint(raw);
    const base = hint.query || raw.replace(/,/g, " ").replace(/\s+/g, " ").trim();
    const officialQ = `${base} official audio`.replace(/\s+/g, " ").trim();
    const topicQ = hint.author
      ? `${hint.title} ${hint.author} topic`.replace(/\s+/g, " ").trim()
      : `${base} topic`;
    if (hint.author && hint.title) {
      /* perfP1: meno cascata (era 5+ytm+sc); quality-first */
      attempts.push(
        `ytsearch:${hint.author} - ${hint.title} official audio`,
        `ytsearch:${hint.author} - ${hint.title}`,
        `ytsearch:${hint.title} ${hint.author}`,
      );
    }
    /* nameSearchOrig1: senza artista NON cercare "… topic" — picka cover Topic sbagliate
       (es. Hey Soul Sister → Skye - Topic invece di Train). */
    attempts.push(`ytsearch:${officialQ}`, `ytsearch:${base}`);
    if (String(process.env.VC_MUSIC_SEARCH_YTM || "1").trim() !== "0") {
      attempts.push(`ytmsearch:${base}`);
    }
    if (String(process.env.VC_MUSIC_SEARCH_SC || "").trim() === "1") {
      attempts.push(`scsearch:${base}`);
    }
    if (hint.author && String(process.env.VC_MUSIC_SEARCH_TOPIC || "").trim() === "1") {
      attempts.push(`ytsearch:${topicQ}`);
    }
    if (mode === "spotify" || mode === "spotify_first") {
      /* spsearchFix1: non appendere spsearch (LavaSrc SocketTimeout); yt* già in attempts */
    }
    return [...new Set(attempts.filter(Boolean))];
  }
  attempts.push(primary);
  const spotifyUriAlt = openSpotifyHttpsToSpotifyUri(raw);
  if (spotifyUriAlt && !attempts.includes(spotifyUriAlt)) attempts.push(spotifyUriAlt);
  return [...new Set(attempts)];
}

async function fetchSpotifyOembedMeta(url?) {
  const u = String(url || "").trim();
  if (!u || !/open\.spotify\.com/i.test(u)) return null;
  try {
    const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(u)}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const j: any = await res.json().catch(() => null);
    const title = String(j?.title || "").trim();
    const author = String(j?.author_name || "").trim();
    if (!title) return null;
    return { title, author };
  } catch (err) {
    logMusic("spotify oembed:", err?.message || err);
    return null;
  }
}

function buildStableRemirrorAttempts(title?, author?, isrc?) {
  const attempts = [];
  const t = String(title || "").trim();
  const a = String(author || "").trim().split(",")[0].trim();
  const isrcClean = String(isrc || "").trim().replace(/\s+/g, "");
  const q = [t, a].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  /* isrcFirst1: ISRC prima (metadata Spotify), poi titolo — altrimenti cover/remix vincono */
  /* perfP1: remirror più corto */
  if (isrcClean) attempts.push(`ytsearch:${isrcClean}`);
  if (q) attempts.push(`ytsearch:${q} official audio`, `ytsearch:${q}`);
  if (t && a) attempts.push(`ytsearch:${a} - ${t}`);
  if (t) attempts.push(`ytsearch:${t} official audio`);
  if (String(process.env.VC_MUSIC_SEARCH_YTM || "1").trim() !== "0") {
    if (isrcClean) attempts.push(`ytmsearch:${isrcClean}`);
    if (t && a) attempts.push(`ytmsearch:${t} ${a}`);
    else if (t) attempts.push(`ytmsearch:${t}`);
  }
  return [...new Set(attempts.filter(Boolean))];
}

function normalizeLavalinkResolveQuery(raw?) {
  const q = String(raw || "").trim();
  if (!q) return q;
  const lower = q.toLowerCase();
  if (lower.startsWith("http://") || lower.startsWith("https://")) return q;
  if (/^spotify:/i.test(q)) return q;
  if (/^[a-z0-9]+search:/i.test(q)) return q;
  const envPrefix = String(process.env.MUSIC_SEARCH_PREFIX || "").trim();
  /* spsearchFix1: LavaSrc spsearch timeouta — plain text sempre yt* (Spotify URL restano LavaSrc) */
  const fallback = "ytsearch:";
  const prefix = envPrefix || fallback;
  const p = prefix.endsWith(":") ? prefix : `${prefix}:`;
  return `${p}${q}`;
}

export = { getMusicSearchMode, isYoutubeLikeUrl, logMusic, normalizeLavalinkLoadType, tracksFromResolve, lavalinkErrorHint, isPlainTextMusicQuery, normalizeOpenSpotifyHttpUrl, isSpotifyPodcastOnlyInput, isOpenSpotifyMusicUrlInput, filterOutSpotifyPodcastTracks, parsePlainMusicQueryHint, buildResolveAttempts, fetchSpotifyOembedMeta, buildStableRemirrorAttempts };
