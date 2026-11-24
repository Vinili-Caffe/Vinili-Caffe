/**
 * Music Quiz: importa una playlist da Spotify, Apple Music o YouTube (anche YouTube Music).
 * Da lì prendiamo solo l'elenco dei brani; l'anteprima da 30 secondi arriva dallo stesso brano su Deezer
 * (Spotify: codice ISRC, quindi brano esatto; Apple e YouTube: ricerca per artista e titolo).
 */
const axios = require("axios") as any;
const { requireMusicQuizHighStaff, sendAuthError } =
  require("./siteMusicQuizAuth") as typeof import("./siteMusicQuizAuth");
const deezer = require("./siteMusicQuizDeezer") as typeof import("./siteMusicQuizDeezer");

type Track = NonNullable<ReturnType<typeof import("./siteMusicQuizDeezer").mapTrack>>;
type Wanted = { isrc?: string; artist?: string; title: string };
type Source = { name: string; cover: string; total: number; items: Wanted[] };

/* nessun vero limite: solo un tetto di sicurezza (ogni brano importato è una ricerca su Deezer) */
const MAX_TRACKS = 500;
const MAX_ITEMS = 500;
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

class ImportError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

/* ---------------- Spotify ---------------- */

let tokenCache = { token: "", until: 0 };

async function spotifyToken() {
  const id = String(process.env.SPOTIFY_CLIENT_ID || "").trim();
  const secret = String(process.env.SPOTIFY_CLIENT_SECRET || "").trim();
  if (!id || !secret) return "";
  if (tokenCache.token && tokenCache.until > Date.now() + 30_000) return tokenCache.token;
  const res = await axios.post("https://accounts.spotify.com/api/token", "grant_type=client_credentials", {
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    timeout: 10_000,
  });
  const token = String(res?.data?.access_token || "");
  if (token) tokenCache = { token, until: Date.now() + Math.max(60, Number(res.data.expires_in) || 3600) * 1000 };
  return token;
}

async function spotifyGet(path: string, token: string) {
  const res = await axios.get(`https://api.spotify.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 12_000,
    validateStatus: () => true,
  });
  return { status: Number(res?.status || 0), data: res?.data };
}

async function fromSpotify(id: string): Promise<Source> {
  const token = await spotifyToken();
  if (!token) throw new ImportError("spotify_off", "L'import da Spotify ora non è disponibile.", 503);
  const head = await spotifyGet(`playlists/${id}?market=IT&fields=name,images,tracks.total`, token);
  if (head.status === 404) {
    throw new ImportError(
      "not_found",
      "Playlist non trovata. Deve essere pubblica; quelle create da Spotify stesso (Top 50, Hot Hits…) non si possono importare.",
      404,
    );
  }
  if (head.status !== 200) throw new Error(`spotify ${head.status}`);
  const items: Wanted[] = [];
  for (let offset = 0; offset < MAX_ITEMS; offset += 50) {
    const page = await spotifyGet(
      `playlists/${id}/tracks?market=IT&limit=50&offset=${offset}&fields=next,items(track(name,is_local,artists(name),external_ids(isrc)))`,
      token,
    );
    if (page.status !== 200) break;
    for (const it of page.data?.items || []) {
      const t = it?.track;
      if (!t?.name || t.is_local) continue;
      items.push({
        isrc: String(t.external_ids?.isrc || "").trim().toUpperCase() || undefined,
        artist: String(t.artists?.[0]?.name || ""),
        title: String(t.name),
      });
    }
    if (!page.data?.next) break;
  }
  return {
    name: String(head.data?.name || ""),
    cover: String(head.data?.images?.[0]?.url || ""),
    total: Number(head.data?.tracks?.total || items.length) || 0,
    items,
  };
}

/** Playlist pubbliche di Spotify per nome (artista, genere…). Quelle create da Spotify stesso
    («This Is…», Top 50) l'API non le apre più: si saltano. */
async function searchSpotifyPlaylists(q: string, limit = 24) {
  const query = String(q || "").trim();
  if (!query) return [];
  try {
    const token = await spotifyToken();
    if (!token) return [];
    const r = await spotifyGet(`search?type=playlist&market=IT&limit=${Math.min(50, limit)}&q=${encodeURIComponent(query)}`, token);
    if (r.status !== 200) return [];
    return (r.data?.playlists?.items || [])
      .filter((p: any) => p?.id && p?.name && p?.owner?.id !== "spotify" && Number(p?.tracks?.total || 0) >= 12)
      .map((p: any) => ({
        id: String(p.id),
        name: String(p.name),
        cover: String(p.images?.[0]?.url || ""),
        trackCount: Number(p.tracks?.total || 0) || 0,
        owner: String(p.owner?.display_name || ""),
        fans: 0,
        kind: "spotify" as const,
      }));
  } catch {
    return [];
  }
}

/* ---------------- Apple Music (pagina pubblica della playlist) ---------------- */

async function fromApple(url: string): Promise<Source> {
  const res = await axios.get(url, { headers: { "User-Agent": BROWSER_UA }, timeout: 15_000, validateStatus: () => true });
  if (res.status === 404) {
    /* pl.u-… = playlist di un utente: si apre da fuori solo se è pubblica */
    throw new ImportError(
      "not_found",
      /\/pl\.u-/.test(url)
        ? "Apple Music dice che questa playlist non esiste: di solito vuol dire che è privata. Nell'app di Musica rendila pubblica (Mostra nel mio profilo / Pubblica la playlist), poi copia di nuovo il link."
        : "Playlist di Apple Music non trovata.",
      404,
    );
  }
  const html = String(res.data || "");
  const m = html.match(/<script[^>]*id="serialized-server-data"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new ImportError("not_found", "Non riesco a leggere questa playlist di Apple Music. Deve essere pubblica.", 404);
  const data = JSON.parse(m[1]!);
  const items: Wanted[] = [];
  const seen = new Set<string>();
  (function walk(o: any) {
    if (!o || typeof o !== "object" || items.length >= MAX_ITEMS) return;
    if (Array.isArray(o)) return o.forEach(walk);
    if (typeof o.title === "string" && typeof o.artistName === "string" && o.duration && !seen.has(String(o.id))) {
      seen.add(String(o.id));
      items.push({ artist: o.artistName, title: o.title });
      return;
    }
    for (const k of Object.keys(o)) walk(o[k]);
  })(data);
  const meta = (p: string) => html.match(new RegExp(`<meta[^>]+property="${p}"[^>]+content="([^"]*)"`))?.[1] || "";
  const name = decodeEntities(meta("og:title")).replace(/\s*(su|on) Apple\s*Music\s*$/i, "").trim();
  return { name, cover: meta("og:image"), total: items.length, items };
}

/* ---------------- YouTube / YouTube Music (pagina pubblica della playlist) ---------------- */

const NOISE = /\b(official|video|audio|lyrics?|lyric video|testo|visuali[sz]er|videoclip|clip ufficiale|4k|hd|hq|prod\.?|remaster(ed)?)\b/i;

function cleanVideoTitle(raw: string) {
  return raw
    .replace(/[([【][^)\]】]*[)\]】]/g, (part) => (NOISE.test(part) ? " " : part))
    .replace(/\s+(ft\.?|feat\.?|featuring)\s.+$/i, "")
    .replace(/\s*\|.*$/, "")
    .replace(/["“”]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function splitArtistTitle(rawTitle: string, channel: string): Wanted {
  const t = cleanVideoTitle(rawTitle);
  const parts = t.split(/\s+[-–—]\s+/);
  if (parts.length >= 2) return { artist: parts[0]!.trim(), title: parts.slice(1).join(" - ").trim() };
  const artist = channel.replace(/\s*-\s*Topic$/i, "").replace(/VEVO$/i, "").replace(/\s*(official|ufficiale)$/i, "").trim();
  return { artist, title: t };
}

async function fromYouTube(listId: string): Promise<Source> {
  const res = await axios.get(`https://www.youtube.com/playlist?list=${encodeURIComponent(listId)}&hl=it`, {
    headers: { "User-Agent": BROWSER_UA, "Accept-Language": "it-IT,it;q=0.9", Cookie: "SOCS=CAI" },
    timeout: 15_000,
    validateStatus: () => true,
  });
  const html = String(res.data || "");
  const m = html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/);
  if (!m) throw new ImportError("not_found", "Non riesco a leggere questa playlist di YouTube. Deve essere pubblica o non in elenco.", 404);
  const data = JSON.parse(m[1]!);
  const items: Wanted[] = [];
  (function walk(o: any) {
    if (!o || typeof o !== "object" || items.length >= MAX_ITEMS) return;
    if (Array.isArray(o)) return o.forEach(walk);
    const v = o.playlistVideoRenderer;
    if (v) {
      const title = String(v.title?.runs?.[0]?.text || v.title?.simpleText || "");
      if (title) items.push(splitArtistTitle(title, String(v.shortBylineText?.runs?.[0]?.text || "")));
      return;
    }
    const meta = o.lockupViewModel?.metadata?.lockupMetadataViewModel;
    if (meta?.title?.content) {
      const channel = String(meta.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts?.[0]?.text?.content || "");
      items.push(splitArtistTitle(String(meta.title.content), channel));
      return;
    }
    for (const k of Object.keys(o)) walk(o[k]);
  })(data);
  if (!items.length) throw new ImportError("not_found", "Questa playlist di YouTube è vuota o privata.", 404);
  const name = String(data?.metadata?.playlistMetadataRenderer?.title || data?.header?.pageHeaderRenderer?.pageTitle || "");
  return { name, cover: "", total: items.length, items };
}

/* ---------------- riconoscimento del link ---------------- */

function detect(input: string): { kind: "spotify" | "apple" | "youtube"; id: string; url: string } | null {
  const s = String(input || "").trim();
  const sp = s.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?playlist\/([A-Za-z0-9]{16,40})/) || s.match(/spotify:playlist:([A-Za-z0-9]{16,40})/);
  if (sp) return { kind: "spotify", id: sp[1]!, url: s };
  /* con o senza il nome nel percorso: /it/playlist/nome/pl.xxx oppure /it/playlist/pl.u-xxx (condivisa da un utente) */
  const am = s.match(/https?:\/\/(?:embed\.)?music\.apple\.com\/([a-z]{2})\/playlist\/(?:[^\s/?#]+\/)?(pl\.[A-Za-z0-9._-]+)/);
  if (am) return { kind: "apple", id: am[2]!, url: `https://music.apple.com/${am[1]}/playlist/${am[2]}` };
  const yt = s.match(/(?:youtube\.com|youtu\.be)\/.*[?&]list=([A-Za-z0-9_-]{10,64})/);
  if (yt) return { kind: "youtube", id: yt[1]!, url: s };
  return null;
}

/* ---------------- stesso brano su Deezer ---------------- */

const norm = (s: string) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function sameArtist(a: string, b: string) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return true;
  return x.includes(y) || y.includes(x) || x.split(" ").some((w) => w.length > 2 && y.split(" ").includes(w));
}

/* Deezer accetta 50 richieste ogni 5 secondi: ne facciamo al massimo 40, condivise tra tutti gli import */
const recent: number[] = [];
async function deezerSlot() {
  for (;;) {
    const now = Date.now();
    while (recent.length && now - recent[0]! > 5_000) recent.shift();
    if (recent.length < 40) {
      recent.push(now);
      return;
    }
    await new Promise((r) => setTimeout(r, 5_000 - (now - recent[0]!) + 20));
  }
}

async function deezerJson(path: string, params?: Record<string, string>) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await deezerSlot();
    const res = await axios.get(`https://api.deezer.com${path}`, { params, timeout: 10_000 });
    /* code 4 = troppe richieste: aspetta e riprova */
    if (res?.data?.error?.code === 4) {
      await new Promise((r) => setTimeout(r, 1_500));
      continue;
    }
    return res?.data;
  }
  return null;
}

async function findOnDeezer(w: Wanted): Promise<Track | null> {
  try {
    if (w.isrc) {
      const d = await deezerJson(`/track/isrc:${encodeURIComponent(w.isrc)}`);
      if (!d?.error) {
        const t = deezer.mapTrack(d);
        if (t) return t;
      }
    }
    if (!w.title) return null;
    const title = w.title.replace(/\s*[([].*?[)\]]/g, "").trim() || w.title;
    const queries = w.artist ? [`artist:"${w.artist}" track:"${title}"`, `${w.artist} ${title}`] : [title];
    for (const q of queries) {
      const d = await deezerJson("/search/track", { q, limit: "5" });
      for (const raw of d?.data || []) {
        const t = deezer.mapTrack(raw);
        if (t && (!w.artist || sameArtist(t.artist, w.artist))) return t;
      }
    }
  } catch {
    /* un brano che non si trova non blocca gli altri */
  }
  return null;
}

async function importPlaylist(url: string, maxTracks = MAX_TRACKS) {
  const link = detect(url);
  if (!link) throw new ImportError("bad_link", "Incolla il link di una playlist di Spotify, Apple Music o YouTube.");
  const src =
      link.kind === "spotify" ? await fromSpotify(link.id) : link.kind === "apple" ? await fromApple(link.url) : await fromYouTube(link.id);

    /* Deezer accetta ~50 richieste ogni 5 secondi: pochi brani alla volta */
    const tracks: Track[] = [];
    const ids = new Set<string>();
    const wanted = src.items.slice(0, MAX_ITEMS);
    for (let i = 0; i < wanted.length && tracks.length < maxTracks; i += 6) {
      const found = await Promise.all(wanted.slice(i, i + 6).map(findOnDeezer));
      for (const t of found) {
        if (t && !ids.has(t.id) && tracks.length < maxTracks) {
          ids.add(t.id);
          tracks.push(t);
        }
      }
    }

    return { source: link.kind, playlist: { name: src.name.slice(0, 80), cover: src.cover, total: src.total }, tracks };
}

async function handleMusicQuizSpotifyImportGet(client?, req?, res?) {
  const auth = await requireMusicQuizHighStaff(client, req);
  if (sendAuthError(res, auth)) return;
  try {
    return res.json({ ok: true, ...(await importPlaylist(String(req.query?.url || ""))) });
  } catch (err: any) {
    if (err instanceof ImportError) return res.status(err.status).json({ ok: false, error: err.code, message: err.message });
    global.logger?.warn?.("[music-quiz] import:", err?.message || err);
    return res.status(502).json({ ok: false, error: "import_error", message: "Il servizio non risponde, riprova tra poco." });
  }
}

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export = { handleMusicQuizSpotifyImportGet, importPlaylist, searchSpotifyPlaylists, detect, cleanVideoTitle, splitArtistTitle };
