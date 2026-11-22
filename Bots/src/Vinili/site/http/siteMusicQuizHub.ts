/** Music Quiz: contenuti della pagina principale (classifiche Deezer + quiz del sito), in cache. */
const deezer = require("./siteMusicQuizDeezer") as typeof import("./siteMusicQuizDeezer");
const { SiteDocument, SITE_DOCUMENT_TYPE } =
  require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");

type Card = {
  slug: string;
  title: string;
  cover: string;
  kind: string;
  deezerId?: string;
  plays?: number;
  trackCount?: number;
  authorName?: string;
  label?: string;
};

/** Classifiche italiane, in ordine di preferenza: «Top Italy» di Deezer dipende dal paese da cui si chiede, Filtr Italy no. */
const ITALY_CHARTS = ["579513551", "1116187241"];
const TOP_WORLD = "3155776842";

/** Generi: gli artisti vengono dalla playlist di riferimento del genere (l'elenco «per genere» di Deezer ripete la classifica). */
const GENRES = [
  { id: "pop", name: "Pop", q: "Pop All Stars" },
  { id: "rap", name: "Rap italiano", q: "Rap Italiano" },
  { id: "cantautori", name: "Cantautori", q: "Cantautori Italiani" },
  { id: "rock", name: "Rock", q: "Rock Essentials" },
  { id: "indie", name: "Indie", q: "Indie italiano" },
  { id: "dance", name: "Dance", q: "Global Dance Hits" },
  { id: "rnb", name: "R&B", q: "R&B Hits" },
  { id: "metal", name: "Metal", q: "Metal Essentials" },
];

const DECADES = [
  { label: "Anni '60", q: "60s Hits" },
  { label: "Anni '70", q: "70s Hits" },
  { label: "Anni '80", q: "80s Hits" },
  { label: "Anni '90", q: "90s Hits" },
  { label: "Anni 2000", q: "00s Hits" },
  { label: "Anni 2010", q: "10s Hits" },
];

const PLAYLIST_QUERIES = [
  "Hit Italiane anni 90-2000",
  "Festivalbar",
  "Sanremo",
  "Rap Italiano",
  "Christmas Hits",
  "Rock Essentials",
  "Disco Essentials",
  "Global Dance Hits",
  "Colonne sonore film",
  "Tormentoni estate",
  "Cartoni animati sigle",
  "Love songs",
];

const TTL_MS = 30 * 60_000;
let cache: { at: number; data: Record<string, unknown> } | null = null;
let building: Promise<Record<string, unknown>> | null = null;

const artistCard = (a: { id: string; name: string; cover: string }): Card => ({
  slug: `artist-${a.id}`,
  title: a.name,
  cover: a.cover,
  kind: "artist",
  deezerId: a.id,
});

const playlistCard = (p: { id: string; name: string; cover: string; trackCount?: number }, label?: string): Card => ({
  slug: `playlist-${p.id}`,
  title: label || p.name,
  cover: p.cover,
  kind: "playlist",
  deezerId: p.id,
  trackCount: p.trackCount,
  ...(label ? { label: p.name } : {}),
});

/** Deezer accetta ~50 richieste ogni 5 secondi: poche alla volta. */
async function inBatches<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>) {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const part = await Promise.all(items.slice(i, i + size).map((x) => fn(x).catch(() => null as unknown as R)));
    out.push(...part);
  }
  return out;
}

async function buildDeezerPart() {
  let italy: Awaited<ReturnType<typeof deezer.playlistArtists>> = [];
  let topItaly: Awaited<ReturnType<typeof deezer.playlistInfo>> = null;
  for (const id of ITALY_CHARTS) {
    italy = await deezer.playlistArtists(id, 24).catch(() => []);
    if (italy.length >= 10) {
      topItaly = await deezer.playlistInfo(id).catch(() => null);
      break;
    }
  }
  const world = await deezer.playlistInfo(TOP_WORLD).catch(() => null);

  const decades = (
    await inBatches(DECADES, 3, async (d) => {
      const p = await deezer.bestPlaylist(d.q, 30, d.q);
      return p ? playlistCard(p, d.label) : null;
    })
  ).filter(Boolean) as Card[];

  const found = (await inBatches(PLAYLIST_QUERIES, 4, (q) => deezer.bestPlaylist(q, 20))).filter(Boolean) as Array<
    NonNullable<Awaited<ReturnType<typeof deezer.bestPlaylist>>>
  >;
  const seenPl = new Set<string>();
  const playlists: Card[] = [];
  for (const p of [topItaly, world, ...found]) {
    if (!p || seenPl.has(p.id)) continue;
    seenPl.add(p.id);
    playlists.push(playlistCard(p));
  }

  const genres = (
    await inBatches(GENRES, 4, async (g) => {
      const p = await deezer.bestPlaylist(g.q, 20, g.q);
      const artists = p ? await deezer.playlistArtists(p.id, 14) : [];
      return artists.length >= 4 ? { id: g.id, name: g.name, items: artists.map(artistCard) } : null;
    })
  ).filter(Boolean);

  return {
    featured: italy.slice(0, 5).map(artistCard),
    trendingArtists: italy.slice(5, 24).map(artistCard),
    playlists,
    decades,
    genres,
  };
}

function packCard(p: any): Card {
  const payload = p?.payload || {};
  return {
    slug: String(p.boardSlug),
    title: String(p.title || p.boardSlug),
    cover: String(p.boardIconUrl || payload.cover || ""),
    kind: String(payload.kind || (payload.community ? "community" : payload.source || "")),
    plays: Number(payload.plays || 0),
    trackCount: Array.isArray(payload.tracks) ? payload.tracks.length : 0,
    ...(payload.community ? { authorName: String(p.authorName || "") } : {}),
  };
}

async function buildSitePart() {
  const base = { docType: SITE_DOCUMENT_TYPE.MUSIC_QUIZ_PACK };
  const fields = "boardSlug title boardIconUrl authorName payload.kind payload.source payload.cover payload.plays payload.community payload.tracks.id";
  const [communityNew, communityTop, popular, recent] = await Promise.all([
    SiteDocument.find({ ...base, "payload.community": true }).select(fields).sort({ createdAt: -1 }).limit(20).lean(),
    SiteDocument.find({ ...base, "payload.community": true }).select(fields).sort({ "payload.plays": -1 }).limit(20).lean(),
    SiteDocument.find({ ...base, "payload.community": { $ne: true }, "payload.plays": { $gt: 0 } })
      .select(fields)
      .sort({ "payload.plays": -1 })
      .limit(20)
      .lean(),
    SiteDocument.find({ ...base, "payload.plays": { $gt: 0 } }).select(fields).sort({ updatedAt: -1 }).limit(20).lean(),
  ]);
  return {
    communityNew: (communityNew || []).map(packCard),
    communityTop: (communityTop || []).map(packCard),
    popular: (popular || []).map(packCard),
    recent: (recent || []).map(packCard),
  };
}

async function getDeezerPart() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  if (!building) {
    building = buildDeezerPart()
      .then((data) => {
        /* se Deezer non risponde, meglio i dati vecchi che una pagina vuota */
        if ((data.featured as Card[]).length || !cache) cache = { at: Date.now(), data };
        return cache!.data;
      })
      .finally(() => {
        building = null;
      });
  }
  if (cache) return cache.data;
  return building;
}

async function buildMusicQuizHub() {
  /* i quiz del sito si leggono sempre freschi; Deezer viene dalla cache */
  const [dz, site] = await Promise.all([getDeezerPart(), buildSitePart()]);
  return { ...dz, ...site };
}

export = { buildMusicQuizHub };
