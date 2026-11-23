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
  /** autore (solo sul server: al sito arriva «mine») */
  ownerId?: string;
  mine?: boolean;
};

/** «mine» per chi guarda, senza mandare al sito chi è l'autore */
function withMine(cards: Card[], viewerId?: string): Card[] {
  return cards.map(({ ownerId, ...c }) => (viewerId && ownerId && ownerId === viewerId ? { ...c, mine: true } : c));
}

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
    ...(payload.community
      ? { authorName: payload.anonymous ? "" : String(p.authorName || ""), category: String(payload.category || ""), ownerId: String(p.userId || "") }
      : {}),
  };
}

async function buildSitePart() {
  /* i quiz «non in elenco» si aprono solo con il link */
  const base = { docType: SITE_DOCUMENT_TYPE.MUSIC_QUIZ_PACK, "payload.visibility": { $ne: "unlisted" } };
  const fields =
    "boardSlug title boardIconUrl authorName userId payload.kind payload.source payload.cover payload.plays payload.community payload.anonymous payload.category payload.tracks.id";
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

async function buildMusicQuizHub(viewerId?: string) {
  /* i quiz del sito si leggono sempre freschi; Deezer viene dalla cache */
  const [dz, site] = await Promise.all([getDeezerPart(), buildSitePart()]);
  return {
    ...dz,
    communityNew: withMine(site.communityNew, viewerId),
    communityTop: withMine(site.communityTop, viewerId),
    popular: withMine(site.popular, viewerId),
    recent: withMine(site.recent, viewerId),
  };
}

/* ---------- quiz simili a un quiz ---------- */

const similarCache = new Map<string, { at: number; items: Card[] }>();

/** l'artista che conta di più in un quiz: quello del quiz o il più presente tra i brani */
function mainArtistId(pack: any): string {
  const payload = pack?.payload || {};
  if (payload.source === "artist" && payload.deezerId) return String(payload.deezerId);
  const counts = new Map<string, number>();
  for (const t of Array.isArray(payload.tracks) ? payload.tracks : []) {
    const id = String(t?.artistId || "");
    if (id) counts.set(id, (counts.get(id) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

/** Quiz da proporre sotto un quiz: artisti simili (Deezer) e quiz della community della stessa categoria. */
async function buildSimilar(slug: string): Promise<Card[]> {
  const hit = similarCache.get(slug);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.items;
  const pack: any = await SiteDocument.findOne({ docType: SITE_DOCUMENT_TYPE.MUSIC_QUIZ_PACK, boardSlug: slug })
    .select("boardSlug payload.source payload.deezerId payload.category payload.tags payload.tracks.artistId")
    .lean();
  const artistId = /^artist-(\d+)$/.exec(slug)?.[1] || mainArtistId(pack);
  const category = String(pack?.payload?.category || "");
  const tags: string[] = Array.isArray(pack?.payload?.tags) ? pack.payload.tags : [];
  const [related, community] = await Promise.all([
    artistId ? deezer.relatedArtists(artistId, 12).catch(() => []) : Promise.resolve([]),
    category || tags.length
      ? SiteDocument.find({
          docType: SITE_DOCUMENT_TYPE.MUSIC_QUIZ_PACK,
          boardSlug: { $ne: slug },
          "payload.community": true,
          "payload.visibility": { $ne: "unlisted" },
          $or: [...(category ? [{ "payload.category": category }] : []), ...(tags.length ? [{ "payload.tags": { $in: tags } }] : [])],
        })
          .select("boardSlug title boardIconUrl authorName userId payload.kind payload.source payload.cover payload.plays payload.community payload.anonymous payload.category payload.tracks.id")
          .sort({ "payload.plays": -1 })
          .limit(8)
          .lean()
          .catch(() => [])
      : Promise.resolve([]),
  ]);
  const items = [...(community || []).map(packCard), ...related.map(artistCard)].filter((c) => c.slug !== slug).slice(0, 16);
  similarCache.set(slug, { at: Date.now(), items });
  if (similarCache.size > 500) similarCache.delete(similarCache.keys().next().value!);
  return items;
}

export = { buildMusicQuizHub, buildSimilar, withMine };
