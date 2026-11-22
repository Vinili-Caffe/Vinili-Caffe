/** Deezer pubblico (search / artist / playlist / chart) — solo server-side. */
const axios = require("axios") as any;

const DEEZER = "https://api.deezer.com";
const TIMEOUT = 12_000;

type MusicQuizTrack = {
  id: string;
  title: string;
  artist: string;
  artistId: string;
  album: string;
  cover: string;
  previewUrl: string;
};

function mapTrack(raw?): MusicQuizTrack | null {
  if (!raw) return null;
  const previewUrl = String(raw.preview || "").trim();
  if (!previewUrl) return null;
  const id = String(raw.id || "").trim();
  const title = String(raw.title_short || raw.title || "").trim();
  const artist = String(raw.artist?.name || "").trim();
  if (!id || !title || !artist) return null;
  return {
    id,
    title,
    artist,
    artistId: String(raw.artist?.id || "").trim(),
    album: String(raw.album?.title || "").trim(),
    cover: String(raw.album?.cover_medium || raw.album?.cover || raw.artist?.picture_medium || "").trim(),
    previewUrl,
  };
}

async function deezerGet(path?, params?) {
  const url = path.startsWith("http") ? path : `${DEEZER}${path}`;
  const res = await axios.get(url, { params: params || {}, timeout: TIMEOUT });
  return res?.data;
}

async function searchArtists(q?, limit = 12) {
  const data = await deezerGet("/search/artist", { q: String(q || "").trim(), limit });
  const list = Array.isArray(data?.data) ? data.data : [];
  return list
    .map((a?) => ({
      id: String(a?.id || ""),
      name: String(a?.name || ""),
      cover: String(a?.picture_medium || a?.picture || ""),
      fans: Number(a?.nb_fan || 0) || 0,
      kind: "artist" as const,
    }))
    .filter((a?) => a.id && a.name);
}

async function searchPlaylists(q?, limit = 12) {
  const data = await deezerGet("/search/playlist", { q: String(q || "").trim(), limit });
  const list = Array.isArray(data?.data) ? data.data : [];
  return list
    .map((p?) => ({
      id: String(p?.id || ""),
      name: String(p?.title || ""),
      cover: String(p?.picture_medium || p?.picture || ""),
      fans: Number(p?.nb_fans || 0) || 0,
      trackCount: Number(p?.nb_tracks || 0) || 0,
      kind: "playlist" as const,
    }))
    .filter((p?) => p.id && p.name);
}

async function searchTracks(q?, limit = 24) {
  const data = await deezerGet("/search/track", { q: String(q || "").trim(), limit });
  const list = Array.isArray(data?.data) ? data.data : [];
  return list.map(mapTrack).filter(Boolean) as MusicQuizTrack[];
}

async function artistTopTracks(artistId?, limit = 50) {
  const data = await deezerGet(`/artist/${encodeURIComponent(String(artistId))}/top`, { limit });
  const list = Array.isArray(data?.data) ? data.data : [];
  return list.map(mapTrack).filter(Boolean) as MusicQuizTrack[];
}

async function artistInfo(artistId?) {
  const a = await deezerGet(`/artist/${encodeURIComponent(String(artistId))}`);
  if (!a?.id) return null;
  return {
    id: String(a.id),
    name: String(a.name || ""),
    cover: String(a.picture_medium || a.picture || ""),
    fans: Number(a.nb_fan || 0) || 0,
    kind: "artist" as const,
  };
}

async function playlistTracks(playlistId?, limit = 80) {
  const out: MusicQuizTrack[] = [];
  let url: string | null = `${DEEZER}/playlist/${encodeURIComponent(String(playlistId))}/tracks?limit=${Math.min(50, limit)}`;
  while (url && out.length < limit) {
    const data = await deezerGet(url);
    const list = Array.isArray(data?.data) ? data.data : [];
    for (const raw of list) {
      const t = mapTrack(raw);
      if (t) out.push(t);
      if (out.length >= limit) break;
    }
    url = data?.next && out.length < limit ? String(data.next) : null;
  }
  return out;
}

async function playlistInfo(playlistId?) {
  const p = await deezerGet(`/playlist/${encodeURIComponent(String(playlistId))}`);
  if (!p?.id) return null;
  return {
    id: String(p.id),
    name: String(p.title || ""),
    cover: String(p.picture_medium || p.picture || ""),
    fans: Number(p.nb_fans || 0) || 0,
    trackCount: Number(p.nb_tracks || 0) || 0,
    kind: "playlist" as const,
  };
}

async function chartTracks(limit = 40) {
  const data = await deezerGet("/chart/0/tracks", { limit });
  const list = Array.isArray(data?.data) ? data.data : [];
  return list.map(mapTrack).filter(Boolean) as MusicQuizTrack[];
}

async function chartArtists(limit = 12) {
  const data = await deezerGet("/chart/0/artists", { limit });
  const list = Array.isArray(data?.data) ? data.data : [];
  return list
    .map((a?) => ({
      id: String(a?.id || ""),
      name: String(a?.name || ""),
      cover: String(a?.picture_medium || a?.picture || ""),
      fans: Number(a?.nb_fan || 0) || 0,
      kind: "artist" as const,
    }))
    .filter((a?) => a.id && a.name);
}

export = {
  mapTrack,
  searchArtists,
  searchPlaylists,
  searchTracks,
  artistTopTracks,
  artistInfo,
  playlistTracks,
  playlistInfo,
  chartTracks,
  chartArtists,
};
