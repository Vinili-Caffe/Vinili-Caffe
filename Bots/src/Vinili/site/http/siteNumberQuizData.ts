/**
 * Number Quiz: categorie costruite da API pubbliche (Deezer, Wikidata, TVMaze, AniList, PokeAPI, Open Food Facts, Wikipedia).
 * Ogni categoria si scarica una volta, si salva su disco e si rinnova dopo qualche giorno.
 * Nessuna chiave, nessun dato degli utenti: alle API va solo un User-Agent generico.
 */
import fs = require("fs");
import os = require("os");
import path = require("path");

export type NQItem = { name: string; value: number; sub?: string; image?: string };
export type NQFormat = "number" | "year" | "duration" | "money" | "decimal";
export type NQCategory = {
  id: string;
  topic: string;
  title: string;
  question: string;
  description: string;
  emoji: string;
  unit: string;
  format: NQFormat;
  /** voci da tenere: le più note in testa (per le API con ordine di popolarità) */
  max?: number;
  ttlDays?: number;
  build: () => Promise<NQItem[]>;
};

/* Wikimedia chiede un contatto nel User-Agent: senza, rifiuta quasi tutto (autorizzato dal proprietario del sito) */
const UA = "ViniliCaffeNumberQuiz/1.0 (https://www.viniliecaffe.it/quiz/numeri/; quiz game)";
const DIR = path.join(os.homedir(), ".vc-state", "number-quiz");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson(url: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<any> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(url, {
        ...init,
        signal: ctrl.signal,
        headers: { "User-Agent": UA, Accept: "application/json", ...((init.headers as any) || {}) },
      });
      if (r.status === 429 || r.status >= 500) {
        /* rispetta l'attesa che chiede il servizio (massimo 15 secondi) */
        const ra = Number(r.headers.get("retry-after"));
        await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(15, ra) * 1000 : 2000 * (attempt + 1));
        continue;
      }
      if (!r.ok) return null;
      return await r.json();
    } catch {
      await sleep(800 * (attempt + 1));
    } finally {
      clearTimeout(t);
    }
  }
  return null;
}

/* esegue i lavori pochi alla volta, con una pausa: le API gratuite non vanno martellate */
async function pool<T, R>(items: T[], size: number, gapMs: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k]!);
      if (gapMs) await sleep(gapMs);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return out;
}

const clean = (s: unknown, max = 70) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function dedupe(items: NQItem[], keep: "first" | "min" | "max" = "first") {
  const map = new Map<string, NQItem>();
  for (const it of items) {
    if (!it || !it.name || !Number.isFinite(it.value)) continue;
    const k = `${it.name.toLowerCase()}|${(it.sub || "").toLowerCase()}`;
    const prev = map.get(k);
    if (!prev) map.set(k, it);
    else if (keep === "min" && it.value < prev.value) map.set(k, { ...prev, value: it.value, image: prev.image || it.image });
    else if (keep === "max" && it.value > prev.value) map.set(k, { ...prev, value: it.value, image: prev.image || it.image });
    else if (!prev.image && it.image) prev.image = it.image;
  }
  return [...map.values()];
}

/* ───────────── Wikidata ───────────── */

function commonsThumb(url?: string) {
  if (!url) return "";
  const file = decodeURIComponent(String(url).split("/Special:FilePath/")[1] || "");
  if (!file) return "";
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=900`;
}

async function sparql(query: string) {
  const data = await getJson(
    "https://query.wikidata.org/sparql",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/sparql-results+json" },
      body: `query=${encodeURIComponent(query)}`,
    },
    90_000,
  );
  return (data?.results?.bindings || []) as any[];
}

type WdSpec = {
  /** classe (P31) oppure frammento SPARQL che lega ?i */
  cls?: string;
  where?: string;
  prop: string;
  /** valore normalizzato nell'unità base (metri, metri², secondi) */
  normalized?: boolean;
  /** quantità con unità fissa (es. dollari Q4917) */
  unit?: string;
  date?: boolean;
  minLinks?: number;
  image?: string;
  sub?: string;
  limit?: number;
  scale?: number;
  keep?: "first" | "min" | "max";
  minValue?: number;
  maxValue?: number;
  /** immagine dalla Wikipedia inglese (locandine e copertine, anche se non libere) */
  enwiki?: boolean;
  /** frammento SPARQL che lega ?v, al posto di quello costruito da prop (es. follower di una sola piattaforma) */
  rawValue?: string;
};

async function wikidata(spec: WdSpec): Promise<NQItem[]> {
  const value = spec.rawValue
    ? spec.rawValue
    : spec.normalized
    ? `?i p:${spec.prop} ?st. ?st psn:${spec.prop}/wikibase:quantityAmount ?v; wikibase:rank ?rk. FILTER(?rk != wikibase:DeprecatedRank)`
    : spec.unit
      ? `?i p:${spec.prop} ?st. ?st psv:${spec.prop} [wikibase:quantityAmount ?v; wikibase:quantityUnit wd:${spec.unit}]; wikibase:rank ?rk. FILTER(?rk != wikibase:DeprecatedRank)`
      : `?i wdt:${spec.prop} ?v.`;
  const q = `SELECT ?i ?l ?v ?img ?subLabel ?en WHERE {
    ${spec.where || `?i wdt:P31 wd:${spec.cls}.`}
    ${spec.minLinks ? `?i wikibase:sitelinks ?s. FILTER(?s >= ${spec.minLinks})` : ""}
    ${value}
    ${spec.image ? `OPTIONAL { ?i wdt:${spec.image} ?img }` : ""}
    ${spec.sub ? `OPTIONAL { ?i wdt:${spec.sub} ?sub }` : ""}
    ${spec.enwiki ? `OPTIONAL { ?art schema:about ?i; schema:isPartOf <https://en.wikipedia.org/>; schema:name ?en }` : ""}
    SERVICE wikibase:label { bd:serviceParam wikibase:language "it,en". ?i rdfs:label ?l. ${spec.sub ? "?sub rdfs:label ?subLabel." : ""} }
  } LIMIT ${spec.limit || 6000}`;
  const rows = await sparql(q);
  /* stesso elemento con più valori (anni diversi, più statistiche): se ne tiene uno solo per id */
  const byId = new Map<string, NQItem>();
  const enTitle = new Map<NQItem, string>();
  const keep = spec.keep || "first";
  for (const r of rows) {
    const id = String(r.i?.value || "");
    const name = clean(r.l?.value);
    if (!id || !name || /^Q\d+$/.test(name)) continue;
    let v: number;
    if (spec.date) {
      const m = /^(-?\d{1,4})-/.exec(String(r.v?.value || ""));
      if (!m) continue;
      v = Number(m[1]);
    } else v = Math.round(Number(r.v?.value) * (spec.scale || 1) * 100) / 100;
    if (!Number.isFinite(v) || (spec.minValue != null && v < spec.minValue) || (spec.maxValue != null && v > spec.maxValue)) continue;
    const sub = clean(r.subLabel?.value, 50);
    const image = r.img?.value ? commonsThumb(r.img.value) : "";
    const prev = byId.get(id);
    if (!prev) {
      const item: NQItem = { name, value: v, ...(sub && !/^Q\d+$/.test(sub) ? { sub } : {}), ...(image ? { image } : {}) };
      byId.set(id, item);
      if (r.en?.value) enTitle.set(item, String(r.en.value));
      continue;
    }
    if ((keep === "min" && v < prev.value) || (keep === "max" && v > prev.value)) prev.value = v;
    if (!prev.image && image) prev.image = image;
  }
  if (spec.enwiki) await enwikiImages([...byId.values()].filter((x) => !x.image && enTitle.has(x)), enTitle);
  /* nomi uguali (es. due comuni omonimi nella stessa provincia) confonderebbero: resta il primo */
  return dedupe([...byId.values()], "first");
}

/** Immagine principale della pagina inglese, a gruppi di 50 titoli (locandine comprese) */
async function enwikiImages(items: NQItem[], titles: Map<NQItem, string>) {
  for (let i = 0; i < items.length; i += 50) {
    const byTitle = new Map<string, NQItem>();
    for (const it of items.slice(i, i + 50)) byTitle.set(titles.get(it)!, it);
    const q = await getJson(
      `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&piprop=thumbnail&pithumbsize=700&pilicense=any&pilimit=50&titles=${encodeURIComponent([...byTitle.keys()].join("|"))}`,
    );
    const back = new Map<string, string>();
    for (const n of q?.query?.normalized || []) back.set(n.to, n.from);
    for (const p of Object.values(q?.query?.pages || {}) as any[]) {
      const src = p?.thumbnail?.source;
      const it = byTitle.get(back.get(p.title) || p.title);
      if (src && it) it.image = src;
    }
    await sleep(120);
  }
}

/* ───────────── Deezer ───────────── */

type DzArtist = { id: number; name: string; picture: string };
let dzArtistsCache: { at: number; list: DzArtist[] } | null = null;

/* artisti di partenza da tutto il mondo: da qui si allarga con gli «artisti simili» di Deezer */
const GLOBAL_SEEDS = [
  "Taylor Swift", "Drake", "The Weeknd", "Bad Bunny", "BTS", "Ed Sheeran", "Beyoncé", "Rihanna", "Eminem", "Coldplay",
  "Imagine Dragons", "Billie Eilish", "Ariana Grande", "Dua Lipa", "Shakira", "Daft Punk", "Metallica", "Queen",
  "The Beatles", "Michael Jackson", "Madonna", "Rosalía", "Karol G", "Post Malone", "Kendrick Lamar", "Travis Scott",
  "Adele", "Bruno Mars", "Lady Gaga", "Justin Bieber", "Kanye West", "J Balvin", "BLACKPINK", "Stromae", "AC/DC",
  "Nirvana", "Linkin Park", "Red Hot Chili Peppers", "Arctic Monkeys", "Harry Styles", "Olivia Rodrigo", "SZA",
  "Doja Cat", "Sabrina Carpenter", "Peso Pluma", "Rauw Alejandro", "Anitta", "Burna Boy", "Wizkid", "Aya Nakamura",
  "Indila", "David Guetta", "Calvin Harris", "Avicii", "Martin Garrix", "Marshmello", "Elton John", "David Bowie",
  "Pink Floyd", "Led Zeppelin", "The Rolling Stones", "ABBA", "Bob Marley", "Whitney Houston", "Celine Dion",
  "Frank Ocean", "Tyler, The Creator", "Lana Del Rey", "Katy Perry", "Miley Cyrus", "Sia", "Maroon 5", "OneRepublic",
  "Twenty One Pilots", "Green Day", "Foo Fighters", "Muse", "Gorillaz", "Rammstein", "Måneskin", "Andrea Bocelli",
  "Laura Pausini", "Enrique Iglesias", "Ricky Martin", "Daddy Yankee", "Ozuna", "Feid", "Stray Kids", "NewJeans",
  "Jung Kook", "Tame Impala", "The Killers", "Oasis", "Radiohead", "U2", "Bon Jovi", "Guns N' Roses", "Kygo",
];

/* Deezer accetta circa 50 richieste ogni 5 secondi: una alla volta, con un passo fisso, e si riprova se dice «troppe» */
let dzNext = 0;
async function dz(pathname: string): Promise<any> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const wait = Math.max(0, dzNext - Date.now());
    dzNext = Math.max(Date.now(), dzNext) + 140;
    if (wait) await sleep(wait);
    const r = await getJson(`https://api.deezer.com${pathname}`, {}, 20_000);
    if (r?.error?.code === 4) {
      dzNext = Date.now() + 5500;
      continue;
    }
    return r?.error ? null : r;
  }
  return null;
}

/** Artisti da classifiche (generale e per genere) e dai nomi italiani: migliaia, con i fan veri. */
async function deezerArtists(): Promise<(DzArtist & { fans: number })[]> {
  const ids = new Map<number, DzArtist & { fans: number }>();
  /* ricerca e «artisti simili» portano già i fan; le classifiche no */
  const add = (a: any) => {
    if (!a?.id || !a?.name) return;
    const prev = ids.get(a.id);
    const fans = Number(a.nb_fan || 0);
    if (prev) {
      if (!prev.fans && fans) prev.fans = fans;
      return;
    }
    ids.set(a.id, { id: a.id, name: clean(a.name), picture: String(a.picture_xl || a.picture_big || ""), fans });
  };
  const genres = (await dz("/genre"))?.data || [];
  /* le classifiche di Deezer seguono il Paese del server (Italia): si usano poco, il grosso viene dagli artisti mondiali */
  for (const g of genres.slice(0, 8)) (await dz(`/chart/${g.id}/artists?limit=25`))?.data?.forEach(add);
  for (const name of GLOBAL_SEEDS) (await dz(`/search/artist?q=${encodeURIComponent(name)}&limit=1`))?.data?.slice(0, 1).forEach(add);

  /* allarga a catena con gli artisti simili, finché sono qualche migliaio */
  const queue = [...ids.keys()];
  const done = new Set<number>();
  let calls = 0;
  while (queue.length && ids.size < 4000 && calls < 900) {
    const id = queue.shift()!;
    if (done.has(id)) continue;
    done.add(id);
    calls++;
    const before = ids.size;
    ((await dz(`/artist/${id}/related?limit=25`))?.data || []).forEach(add);
    for (const k of [...ids.keys()].slice(before)) queue.push(k);
  }

  /* i pochi senza fan (arrivati dalle classifiche) si chiedono uno per uno */
  const missing = [...ids.values()].filter((a) => !a.fans);
  for (const a of missing) {
    const r = await dz(`/artist/${a.id}`);
    a.fans = Number(r?.nb_fan || 0);
    if (r?.picture_xl) a.picture = String(r.picture_xl);
  }
  return [...ids.values()].filter((a) => a.fans > 0 && a.picture);
}

async function deezerArtistsCached() {
  if (dzArtistsCache && Date.now() - dzArtistsCache.at < 6 * 3600_000) return dzArtistsCache.list as any[];
  const list = await deezerArtists();
  dzArtistsCache = { at: Date.now(), list };
  return list as any[];
}

async function deezerTopArtists(n: number) {
  const all = await deezerArtistsCached();
  return all.slice().sort((a, b) => b.fans - a.fans).slice(0, n);
}

/* ───────────── altre API ───────────── */

/** Stesso scaricamento per più categorie (Pokémon, prodotti, serie, anime): si fa una volta ogni qualche ora. */
function memo<T>(fn: () => Promise<T>, ms = 6 * 3600_000) {
  let at = 0;
  let p: Promise<T> | null = null;
  return () => {
    if (!p || Date.now() - at > ms) {
      at = Date.now();
      p = fn().catch((e) => {
        p = null;
        throw e;
      });
    }
    return p;
  };
}

const tvmazeShows = memo(async () => {
  const pages = Array.from({ length: 80 }, (_, i) => i);
  const res = await pool(pages, 3, 150, (p) => getJson(`https://api.tvmaze.com/shows?page=${p}`));
  const shows: any[] = res.flatMap((x) => (Array.isArray(x) ? x : []));
  return shows.filter((s) => Number(s.weight) >= 90 && s.image?.medium);
});

async function anilistList(type: "ANIME" | "MANGA", pages = 24) {
  const out: any[] = [];
  for (let page = 1; page <= pages; page++) {
    const r = await getJson("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `{Page(page:${page},perPage:50){media(type:${type},sort:POPULARITY_DESC,isAdult:false){title{romaji english} averageScore popularity seasonYear startDate{year} episodes chapters volumes duration coverImage{extraLarge large}}}}`,
      }),
    });
    out.push(...(r?.data?.Page?.media || []));
    await sleep(800);
  }
  return out;
}
const anilist = memo(() => anilistList("ANIME"));
const anilistManga = memo(() => anilistList("MANGA", 20));

const pokemon = memo(async () => {
  const list = await getJson("https://pokeapi.co/api/v2/pokemon?limit=1025");
  const urls: string[] = (list?.results || []).map((x: any) => x.url);
  const res = await pool(urls, 6, 40, (u) => getJson(u));
  return res.filter(Boolean);
});

const foodItaly = memo(async () => {
  const res = await foodPages();
  return res;
});

async function foodPages() {
  const pages = Array.from({ length: 12 }, (_, i) => i + 1);
  const res = await pool(pages, 2, 700, (p) =>
    getJson(
      `https://world.openfoodfacts.org/api/v2/search?sort_by=unique_scans_n&page_size=100&page=${p}&fields=product_name_en,product_name,brands,nutriments,image_front_small_url,image_front_url`,
      {},
      40_000,
    ),
  );
  return res.flatMap((x) => x?.products || []);
}

async function wikipediaTop(lang: "it" | "en" = "it"): Promise<NQItem[]> {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const r = await getJson(`https://wikimedia.org/api/rest_v1/metrics/pageviews/top/${lang}.wikipedia/all-access/${y}/${m}/all-days`);
  const arts: any[] = (r?.items?.[0]?.articles || []).filter(
    (a: any) => !/^(Pagina_principale|Main_Page|Speciale:|Special:|File:|Wikipedia:|Categoria:|Category:|Aiuto:|Help:|Portale:|Portal:|Template:|Utente:|User:|Progetto:|XHamster|Pornhub|xHamster)/.test(a.article) && a.article !== "-",
  );
  const items: NQItem[] = arts.slice(0, 900).map((a) => ({ name: clean(a.article.replace(/_/g, " ")), value: Number(a.views) }));
  /* immagini a gruppi di 50 titoli */
  for (let i = 0; i < items.length; i += 50) {
    const chunk = items.slice(i, i + 50);
    const titles = chunk.map((x) => x.name).join("|");
    const q = await getJson(
      `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&piprop=thumbnail&pithumbsize=800&redirects=1&titles=${encodeURIComponent(titles)}`,
    );
    const pages: any[] = Object.values(q?.query?.pages || {});
    const norm = new Map<string, string>();
    for (const n of [...(q?.query?.normalized || []), ...(q?.query?.redirects || [])]) norm.set(n.to, n.from);
    for (const p of pages) {
      const src = p?.thumbnail?.source;
      if (!src) continue;
      const original = norm.get(p.title) || p.title;
      const it = chunk.find((x) => x.name === original || x.name === p.title);
      if (it) it.image = src;
    }
    await sleep(150);
  }
  return items;
}

/* ───────────── categorie ───────────── */

const anTitle = (a: any) => clean(a?.title?.english || a?.title?.romaji);
const anImg = (a: any) => String(a?.coverImage?.extraLarge || a?.coverImage?.large || "");

export const CATEGORIES: NQCategory[] = [
  /* musica */
  {
    id: "fan-deezer",
    topic: "Musica",
    title: "Fan degli artisti su Deezer",
    question: "Chi ha più fan su Deezer?",
    description: "Migliaia di artisti di tutto il mondo: chi ha più fan?",
    emoji: "🎧",
    unit: "fan",
    format: "number",
    ttlDays: 5,
    build: async () =>
      /* sotto i 30.000 fan sono quasi tutti sconosciuti: niente gusto a indovinare */
      (await deezerArtistsCached()).filter((a) => a.fans >= 30_000).map((a) => ({ name: a.name, value: a.fans, image: a.picture })),
  },
  {
    id: "brani-deezer",
    topic: "Musica",
    title: "Popolarità dei brani",
    question: "Quale brano è più popolare su Deezer?",
    description: "Il punteggio di popolarità di Deezer, da 0 a un milione.",
    emoji: "🎵",
    unit: "punti",
    format: "number",
    ttlDays: 5,
    build: async () => {
      const artists = await deezerTopArtists(450);
      const res = await pool(artists, 4, 100, async (a) => (await dz(`/artist/${a.id}/top?limit=8`))?.data || []);
      return dedupe(
        res.flat().map((t: any) => ({
          name: clean(t.title_short || t.title),
          sub: clean(t.artist?.name, 50),
          value: Number(t.rank || 0),
          image: String(t.album?.cover_xl || ""),
        })),
      ).filter((x) => x.value > 0);
    },
  },
  {
    id: "album-anno",
    topic: "Musica",
    title: "Anno di uscita degli album",
    question: "Quale album è uscito dopo?",
    description: "Album famosi di ogni epoca: è uscito prima o dopo?",
    emoji: "💿",
    unit: "",
    format: "year",
    /* da Wikidata: data della prima uscita (Deezer spesso ha quella della ristampa digitale) */
    build: () =>
      wikidata({
        where: "?i wikibase:sitelinks ?ss. hint:Prior hint:rangeSafe true. FILTER(?ss >= 20) ?i wdt:P31 wd:Q482994.",
        prop: "P577",
        date: true,
        sub: "P175",
        enwiki: true,
        keep: "min",
        limit: 9000,
        minValue: 1940,
      }),
  },
  {
    id: "durata-brani",
    topic: "Musica",
    title: "Durata dei brani",
    question: "Quale brano dura di più?",
    description: "Dai pezzi da due minuti alle suite infinite.",
    emoji: "⏱️",
    unit: "",
    format: "duration",
    ttlDays: 10,
    build: async () => {
      const artists = await deezerTopArtists(300);
      const res = await pool(artists, 4, 100, async (a) => (await dz(`/artist/${a.id}/top?limit=6`))?.data || []);
      return dedupe(
        res.flat().map((t: any) => ({
          name: clean(t.title_short || t.title),
          sub: clean(t.artist?.name, 50),
          value: Number(t.duration || 0),
          image: String(t.album?.cover_xl || ""),
        })),
      ).filter((x) => x.value > 30);
    },
  },
  /* geografia */
  {
    id: "paesi-popolazione",
    topic: "Geografia",
    title: "Popolazione dei Paesi",
    question: "Quale Paese ha più abitanti?",
    description: "Tutti i Paesi del mondo, con la popolazione più recente.",
    emoji: "🌍",
    unit: "abitanti",
    format: "number",
    build: () => wikidata({ cls: "Q6256", prop: "P1082", image: "P41", keep: "max", minValue: 1000 }),
  },
  {
    id: "paesi-superficie",
    topic: "Geografia",
    title: "Superficie dei Paesi",
    question: "Quale Paese è più grande?",
    description: "Dalla Russia al Vaticano: quanti km² ha?",
    emoji: "🗺️",
    unit: "km²",
    format: "number",
    build: () => wikidata({ cls: "Q6256", prop: "P2046", normalized: true, scale: 1e-6, image: "P41", keep: "max", minValue: 1 }),
  },
  {
    id: "paesi-pil",
    topic: "Geografia",
    title: "PIL dei Paesi",
    question: "Quale Paese ha il PIL più alto?",
    description: "Prodotto interno lordo in dollari.",
    emoji: "💰",
    unit: "$",
    format: "money",
    build: () => wikidata({ cls: "Q6256", prop: "P2131", unit: "Q4917", image: "P41", keep: "max", minValue: 1e8 }),
  },
  {
    id: "paesi-vita",
    topic: "Geografia",
    title: "Aspettativa di vita",
    question: "Dove si vive più a lungo?",
    description: "Anni di vita attesi alla nascita, Paese per Paese.",
    emoji: "❤️",
    unit: "anni",
    format: "decimal",
    build: () => wikidata({ cls: "Q6256", prop: "P2250", image: "P41", keep: "max", minValue: 30 }),
  },
  {
    id: "citta-mondo",
    topic: "Geografia",
    title: "Grandi città del mondo",
    question: "Quale città ha più abitanti?",
    description: "Quasi mille metropoli: quale è più popolosa?",
    emoji: "🏙️",
    unit: "abitanti",
    format: "number",
    build: () =>
      wikidata({
        where: "?i wdt:P1082 ?pp. FILTER(?pp > 600000) ?i wdt:P31/wdt:P279* wd:Q515.",
        prop: "P1082",
        image: "P18",
        sub: "P17",
        keep: "max",
        minValue: 300000,
      }),
  },
  {
    id: "capitali",
    topic: "Geografia",
    title: "Popolazione delle capitali",
    question: "Quale capitale ha più abitanti?",
    description: "Le capitali di tutti i Paesi.",
    emoji: "🏛️",
    unit: "abitanti",
    format: "number",
    build: () =>
      wikidata({ where: "?c wdt:P31 wd:Q6256; wdt:P36 ?i.", prop: "P1082", image: "P18", sub: "P17", keep: "max", minValue: 1000 }),
  },
  {
    id: "montagne",
    topic: "Natura",
    title: "Altezza delle montagne",
    question: "Quale montagna è più alta?",
    description: "Migliaia di vette di tutto il mondo.",
    emoji: "🏔️",
    unit: "m",
    format: "number",
    build: () =>
      wikidata({ where: "?i wdt:P2660 ?prom. FILTER(?prom >= 600)", prop: "P2044", image: "P18", sub: "P17", keep: "max", minValue: 200, maxValue: 8900 }),
  },
  {
    id: "vulcani",
    topic: "Natura",
    title: "Altezza dei vulcani",
    question: "Quale vulcano è più alto?",
    description: "Vulcani attivi e spenti di tutto il pianeta.",
    emoji: "🌋",
    unit: "m",
    format: "number",
    build: () => wikidata({ cls: "Q8072", prop: "P2044", normalized: true, image: "P18", sub: "P17", minLinks: 3, minValue: 50 }),
  },
  {
    id: "fiumi",
    topic: "Natura",
    title: "Lunghezza dei fiumi",
    question: "Quale fiume è più lungo?",
    description: "Fiumi di tutto il mondo, in chilometri.",
    emoji: "🌊",
    unit: "km",
    format: "number",
    build: () => wikidata({ cls: "Q4022", prop: "P2043", normalized: true, scale: 0.001, image: "P18", sub: "P17", minLinks: 25, minValue: 5, maxValue: 7000 }),
  },
  {
    id: "laghi",
    topic: "Natura",
    title: "Superficie dei laghi",
    question: "Quale lago è più grande?",
    description: "Laghi di tutto il mondo, in km².",
    emoji: "🏞️",
    unit: "km²",
    format: "number",
    build: () => wikidata({ cls: "Q23397", prop: "P2046", normalized: true, scale: 1e-6, image: "P18", sub: "P17", minLinks: 10, minValue: 0.1 }),
  },
  {
    id: "isole",
    topic: "Natura",
    title: "Superficie delle isole",
    question: "Quale isola è più grande?",
    description: "Dalla Groenlandia agli isolotti, in km².",
    emoji: "🏝️",
    unit: "km²",
    format: "number",
    build: () => wikidata({ cls: "Q23442", prop: "P2046", normalized: true, scale: 1e-6, image: "P18", sub: "P17", minLinks: 12, minValue: 0.1 }),
  },
  {
    id: "grattacieli",
    topic: "Mondo",
    title: "Altezza dei grattacieli",
    question: "Quale grattacielo è più alto?",
    description: "I palazzi più alti del pianeta.",
    emoji: "🏢",
    unit: "m",
    format: "number",
    build: () => wikidata({ cls: "Q11303", prop: "P2048", normalized: true, image: "P18", sub: "P131", minLinks: 3, minValue: 80 }),
  },
  {
    id: "stadi",
    topic: "Sport",
    title: "Capienza degli stadi",
    question: "Quale stadio contiene più persone?",
    description: "Stadi di calcio e non solo, posti a sedere.",
    emoji: "🏟️",
    unit: "posti",
    format: "number",
    build: () =>
      wikidata({ where: "?i wdt:P31/wdt:P279? wd:Q483110.", prop: "P1083", image: "P18", sub: "P131", minLinks: 8, keep: "max", minValue: 2000 }),
  },
  /* persone */
  {
    id: "nascita-famosi",
    topic: "Persone",
    title: "Anno di nascita dei famosi",
    question: "Chi è nato dopo?",
    description: "Personaggi famosi di ogni epoca: chi è più giovane?",
    emoji: "🎂",
    unit: "",
    format: "year",
    build: () =>
      wikidata({
        where: "?i wikibase:sitelinks ?ss. hint:Prior hint:rangeSafe true. FILTER(?ss >= 90) ?i wdt:P31 wd:Q5.",
        prop: "P569",
        date: true,
        image: "P18",
        keep: "min",
        limit: 9000,
        minValue: 1000,
      }),
  },
  /* cinema, tv, giochi */
  {
    id: "film-anno",
    topic: "Cinema e TV",
    title: "Anno di uscita dei film",
    question: "Quale film è uscito dopo?",
    description: "Migliaia di film famosi, dal muto a oggi.",
    emoji: "🎬",
    unit: "",
    format: "year",
    build: () => wikidata({ enwiki: true, cls: "Q11424", prop: "P577", date: true, minLinks: 35, keep: "min", limit: 9000 }),
  },
  {
    id: "film-durata",
    topic: "Cinema e TV",
    title: "Durata dei film",
    question: "Quale film dura di più?",
    description: "Minuti di film: dai corti ai kolossal.",
    emoji: "🍿",
    unit: "minuti",
    format: "number",
    build: () => wikidata({ enwiki: true, cls: "Q11424", prop: "P2047", normalized: true, scale: 1 / 60, minLinks: 35, keep: "max", limit: 9000, minValue: 20 }),
  },
  {
    id: "film-incassi",
    topic: "Cinema e TV",
    title: "Incassi dei film",
    question: "Quale film ha incassato di più?",
    description: "Incassi in dollari al botteghino.",
    emoji: "🎟️",
    unit: "$",
    format: "money",
    build: () => wikidata({ enwiki: true, cls: "Q11424", prop: "P2142", unit: "Q4917", minLinks: 20, keep: "max", limit: 9000, minValue: 100000 }),
  },
  {
    id: "serie-voto",
    topic: "Cinema e TV",
    title: "Voto delle serie TV",
    question: "Quale serie ha il voto più alto?",
    description: "Il voto medio del pubblico su TVMaze, da 1 a 10.",
    emoji: "📺",
    unit: "/10",
    format: "decimal",
    ttlDays: 14,
    build: async () =>
      (await tvmazeShows())
        .filter((s) => s.rating?.average)
        .map((s) => ({ name: clean(s.name), value: Number(s.rating.average), sub: clean(s.network?.name || s.webChannel?.name || "", 40), image: String(s.image.original || s.image.medium) })),
  },
  {
    id: "serie-anno",
    topic: "Cinema e TV",
    title: "Anno di debutto delle serie TV",
    question: "Quale serie è iniziata dopo?",
    description: "Dalle serie storiche a quelle di oggi.",
    emoji: "🗓️",
    unit: "",
    format: "year",
    ttlDays: 14,
    build: async () =>
      (await tvmazeShows())
        .filter((s) => s.premiered)
        .map((s) => ({ name: clean(s.name), value: Number(String(s.premiered).slice(0, 4)), sub: clean(s.network?.name || s.webChannel?.name || "", 40), image: String(s.image.original || s.image.medium) })),
  },
  {
    id: "videogiochi-anno",
    topic: "Cinema e TV",
    title: "Anno di uscita dei videogiochi",
    question: "Quale gioco è uscito dopo?",
    description: "Da Pong ai giochi di oggi.",
    emoji: "🎮",
    unit: "",
    format: "year",
    build: () => wikidata({ enwiki: true, cls: "Q7889", prop: "P577", date: true, minLinks: 20, keep: "min", limit: 9000, minValue: 1950 }),
  },
  /* anime */
  {
    id: "anime-voto",
    topic: "Anime",
    title: "Voto degli anime",
    question: "Quale anime ha il voto più alto?",
    description: "Il voto medio su AniList, da 0 a 100.",
    emoji: "🎌",
    unit: "/100",
    format: "number",
    build: async () => (await anilist()).filter((a) => a.averageScore).map((a) => ({ name: anTitle(a), value: Number(a.averageScore), image: anImg(a) })),
  },
  {
    id: "anime-popolarita",
    topic: "Anime",
    title: "Popolarità degli anime",
    question: "Quale anime è più seguito?",
    description: "Quante persone lo hanno in lista su AniList.",
    emoji: "⭐",
    unit: "persone",
    format: "number",
    build: async () => (await anilist()).map((a) => ({ name: anTitle(a), value: Number(a.popularity || 0), image: anImg(a) })),
  },
  {
    id: "anime-anno",
    topic: "Anime",
    title: "Anno di uscita degli anime",
    question: "Quale anime è uscito dopo?",
    description: "Dai classici agli ultimi usciti.",
    emoji: "📅",
    unit: "",
    format: "year",
    build: async () => (await anilist()).filter((a) => a.seasonYear).map((a) => ({ name: anTitle(a), value: Number(a.seasonYear), image: anImg(a) })),
  },
  /* pokémon */
  {
    id: "pokemon-peso",
    topic: "Pokémon",
    title: "Peso dei Pokémon",
    question: "Quale Pokémon pesa di più?",
    description: "Tutti i Pokémon, in chili.",
    emoji: "⚖️",
    unit: "kg",
    format: "decimal",
    ttlDays: 60,
    build: async () =>
      (await pokemon()).map((p) => ({ name: pokeName(p.name), value: Number(p.weight) / 10, image: pokeImg(p) })).filter((x) => x.value > 0),
  },
  {
    id: "pokemon-altezza",
    topic: "Pokémon",
    title: "Altezza dei Pokémon",
    question: "Quale Pokémon è più alto?",
    description: "Tutti i Pokémon, in metri.",
    emoji: "📏",
    unit: "m",
    format: "decimal",
    ttlDays: 60,
    build: async () =>
      (await pokemon()).map((p) => ({ name: pokeName(p.name), value: Number(p.height) / 10, image: pokeImg(p) })).filter((x) => x.value > 0),
  },
  {
    id: "pokemon-statistiche",
    topic: "Pokémon",
    title: "Statistiche dei Pokémon",
    question: "Quale Pokémon ha le statistiche più alte?",
    description: "La somma delle statistiche base.",
    emoji: "💥",
    unit: "punti",
    format: "number",
    ttlDays: 60,
    build: async () =>
      (await pokemon()).map((p) => ({
        name: pokeName(p.name),
        value: (p.stats || []).reduce((s: number, x: any) => s + Number(x.base_stat || 0), 0),
        image: pokeImg(p),
      })),
  },
  /* cibo */
  {
    id: "calorie",
    topic: "Cibo",
    title: "Calorie dei prodotti",
    question: "Quale prodotto ha più calorie?",
    description: "I prodotti più scansionati al mondo: kcal ogni 100 g.",
    emoji: "🍫",
    unit: "kcal / 100 g",
    format: "number",
    ttlDays: 20,
    build: async () =>
      dedupe(
        (await foodItaly())
          .map((p: any) => ({
            name: clean(p.product_name_en || p.product_name, 60),
            sub: clean(String(p.brands || "").split(",")[0], 40),
            value: Math.round(Number(p.nutriments?.["energy-kcal_100g"])),
            image: String(p.image_front_url || p.image_front_small_url || ""),
          }))
          .filter((x) => x.name && x.image && Number.isFinite(x.value) && x.value >= 0 && x.value < 950),
      ),
  },
];

/* elementi famosi di una classe: prima il filtro sulla notorietà (veloce), poi la classe */
const famous = (minLinks: number, tail: string) =>
  `?i wikibase:sitelinks ?ss. hint:Prior hint:rangeSafe true. FILTER(?ss >= ${minLinks}) ${tail}`;

const yearCat = (
  id: string,
  topic: string,
  title: string,
  question: string,
  description: string,
  emoji: string,
  where: string,
  prop: string,
  extra: Partial<WdSpec> = {},
): NQCategory => ({
  id,
  topic,
  title,
  question,
  description,
  emoji,
  unit: "",
  format: "year",
  build: () => wikidata({ where, prop, date: true, keep: "min", limit: 9000, ...extra }),
});

const pokeStat = (stat: string) => (p: any) => Number((p.stats || []).find((s: any) => s.stat?.name === stat)?.base_stat || 0);

const MORE: NQCategory[] = [
  /* musica */
  {
    id: "album-fan-deezer",
    topic: "Musica",
    title: "Fan degli album su Deezer",
    question: "Quale album ha più fan su Deezer?",
    description: "Gli album degli artisti più seguiti: quanti lo hanno tra i preferiti?",
    emoji: "📀",
    unit: "fan",
    format: "number",
    ttlDays: 10,
    build: async () => {
      const artists = await deezerTopArtists(350);
      const out: NQItem[] = [];
      for (const a of artists) {
        const r = await dz(`/artist/${a.id}/albums?limit=25`);
        for (const al of (r?.data || []) as any[]) {
          if (al.record_type !== "album" || !(Number(al.fans) >= 2000)) continue;
          out.push({ name: clean(al.title), sub: a.name, value: Number(al.fans), image: String(al.cover_xl || "") });
        }
      }
      return dedupe(out, "max");
    },
  },
  yearCat("singoli-anno", "Musica", "Anno di uscita delle canzoni", "Quale canzone è uscita dopo?", "Canzoni famose di ogni epoca: prima o dopo?", "🎶",
    famous(15, "?i wdt:P31 wd:Q134556."), "P577", { sub: "P175", enwiki: true, minValue: 1900 }),
  yearCat("band-anno", "Musica", "Anno di nascita delle band", "Quale band si è formata dopo?", "Dai Beatles ai Måneskin: quando si sono formati?", "🎸",
    famous(30, "?i wdt:P31 wd:Q215380."), "P571", { image: "P18", enwiki: true, minValue: 1900 }),
  yearCat("cantanti-nascita", "Musica", "Anno di nascita dei cantanti", "Chi è nato dopo?", "Cantanti di tutto il mondo: chi è più giovane?", "🎤",
    famous(35, "?i wdt:P106 wd:Q177220; wdt:P31 wd:Q5."), "P569", { image: "P18", minValue: 1850 }),
  /* persone e sport */
  yearCat("attori-nascita", "Persone", "Anno di nascita degli attori", "Chi è nato dopo?", "Attori e attrici famosi: chi è più giovane?", "🎭",
    famous(45, "?i wdt:P106 wd:Q33999; wdt:P31 wd:Q5."), "P569", { image: "P18", minValue: 1850 }),
  yearCat("famosi-morte", "Persone", "Anno di morte dei famosi", "Chi è morto dopo?", "Personaggi storici: chi è vissuto più tardi?", "🕯️",
    famous(90, "?i wdt:P31 wd:Q5."), "P570", { image: "P18", keep: "max" }),
  yearCat("calciatori-nascita", "Sport", "Anno di nascita dei calciatori", "Chi è nato dopo?", "Campioni di ieri e di oggi.", "⚽",
    famous(45, "?i wdt:P106 wd:Q937857; wdt:P31 wd:Q5."), "P569", { image: "P18", minValue: 1850 }),
  {
    id: "cestisti-altezza",
    topic: "Sport",
    title: "Altezza dei cestisti",
    question: "Chi è più alto?",
    description: "Giocatori di basket famosi, in centimetri.",
    emoji: "🏀",
    unit: "cm",
    format: "number",
    build: () =>
      wikidata({ where: famous(12, "?i wdt:P106 wd:Q3665646; wdt:P31 wd:Q5."), prop: "P2048", normalized: true, scale: 100, image: "P18", minValue: 150, maxValue: 240 }),
  },
  {
    id: "calciatori-altezza",
    topic: "Sport",
    title: "Altezza dei calciatori",
    question: "Chi è più alto?",
    description: "Calciatori famosi, in centimetri.",
    emoji: "📏",
    unit: "cm",
    format: "number",
    build: () =>
      wikidata({ where: famous(35, "?i wdt:P106 wd:Q937857; wdt:P31 wd:Q5."), prop: "P2048", normalized: true, scale: 100, image: "P18", minValue: 150, maxValue: 215 }),
  },
  yearCat("squadre-fondazione", "Sport", "Anno di fondazione delle squadre", "Quale squadra è nata dopo?", "Club di calcio di tutto il mondo.", "🛡️",
    famous(25, "?i wdt:P31 wd:Q476028."), "P571", { image: "P154", sub: "P17", minValue: 1850 }),
  yearCat("piloti-nascita", "Sport", "Anno di nascita dei piloti di F1", "Chi è nato dopo?", "Piloti di Formula 1 di ogni epoca.", "🏎️",
    famous(15, "?i wdt:P106 wd:Q10841764; wdt:P31 wd:Q5."), "P569", { image: "P18", minValue: 1890 }),
  {
    id: "arene",
    topic: "Sport",
    title: "Capienza dei palazzetti",
    question: "Quale arena contiene più persone?",
    description: "Palazzetti e arene coperte di tutto il mondo.",
    emoji: "🎪",
    unit: "posti",
    format: "number",
    build: () => wikidata({ cls: "Q641226", prop: "P1083", image: "P18", sub: "P131", minLinks: 5, keep: "max", minValue: 1000 }),
  },
  /* geografia in più */
  {
    id: "paesi-densita",
    topic: "Geografia",
    title: "Densità dei Paesi",
    question: "Quale Paese è più affollato?",
    description: "Abitanti per km²: da Monaco alla Mongolia.",
    emoji: "👥",
    unit: "ab./km²",
    format: "number",
    build: async () => {
      const [pop, area] = await Promise.all([
        wikidata({ cls: "Q6256", prop: "P1082", image: "P41", keep: "max", minValue: 1000 }),
        wikidata({ cls: "Q6256", prop: "P2046", normalized: true, scale: 1e-6, keep: "max", minValue: 0.3 }),
      ]);
      const areas = new Map(area.map((x) => [x.name, x.value]));
      return pop
        .filter((p) => areas.get(p.name))
        .map((p) => ({ ...p, value: Math.round((p.value / areas.get(p.name)!) * 10) / 10 }));
    },
  },
  {
    id: "capitali-altitudine",
    topic: "Geografia",
    title: "Altitudine delle capitali",
    question: "Quale capitale è più in alto?",
    description: "Da La Paz ad Amsterdam: a che quota sono?",
    emoji: "🏙️",
    unit: "m",
    format: "number",
    build: () => wikidata({ where: "?c wdt:P31 wd:Q6256; wdt:P36 ?i.", prop: "P2044", image: "P18", sub: "P17", keep: "max" }),
  },
  yearCat("citta-fondazione", "Geografia", "Anno di fondazione delle città", "Quale città è stata fondata dopo?", "Grandi città del mondo: quando sono nate?", "🏰",
    "?i wdt:P1082 ?pp. FILTER(?pp > 500000) ?i wdt:P31/wdt:P279* wd:Q515.", "P571", { image: "P18", sub: "P17" }),
  {
    id: "lingue",
    topic: "Mondo",
    title: "Parlanti delle lingue",
    question: "Quale lingua è parlata da più persone?",
    description: "Le lingue del mondo e quante persone le parlano.",
    emoji: "🗣️",
    unit: "persone",
    format: "number",
    build: () => wikidata({ where: famous(40, "VALUES ?k { wd:Q34770 wd:Q1288568 wd:Q33742 } ?i wdt:P31 ?k."), prop: "P1098", keep: "max", minValue: 1000 }),
  },
  {
    id: "aeroporti",
    topic: "Mondo",
    title: "Passeggeri degli aeroporti",
    question: "Quale aeroporto ha più passeggeri?",
    description: "Passeggeri in un anno, negli aeroporti più grandi.",
    emoji: "✈️",
    unit: "passeggeri",
    format: "number",
    build: () => wikidata({ where: famous(15, "?i wdt:P31 wd:Q1248784."), prop: "P3872", image: "P18", sub: "P131", keep: "max", minValue: 100000 }),
  },
  {
    id: "ponti",
    topic: "Mondo",
    title: "Lunghezza dei ponti",
    question: "Quale ponte è più lungo?",
    description: "Ponti famosi di tutto il mondo, in metri.",
    emoji: "🌉",
    unit: "m",
    format: "number",
    build: () => wikidata({ cls: "Q12280", prop: "P2043", normalized: true, image: "P18", sub: "P131", minLinks: 4, minValue: 20 }),
  },
  {
    id: "musei-visitatori",
    topic: "Mondo",
    title: "Visitatori dei musei",
    question: "Quale museo ha più visitatori?",
    description: "Visitatori in un anno nei musei più famosi.",
    emoji: "🖼️",
    unit: "visitatori",
    format: "number",
    build: () => wikidata({ where: famous(15, "VALUES ?k { wd:Q33506 wd:Q207694 wd:Q1007870 wd:Q588140 } ?i wdt:P31 ?k."), prop: "P1174", image: "P18", sub: "P131", keep: "max", minValue: 10000 }),
  },
  /* storia, arte, libri */
  yearCat("battaglie", "Storia", "Anno delle battaglie", "Quale battaglia è avvenuta dopo?", "Dalle Termopili alla Normandia.", "⚔️",
    famous(12, "?i wdt:P31 wd:Q178561."), "P585", { image: "P18" }),
  yearCat("quadri", "Arte", "Anno dei quadri famosi", "Quale quadro è stato dipinto dopo?", "Capolavori della pittura: prima o dopo?", "🎨",
    famous(25, "?i wdt:P31 wd:Q3305213."), "P571", { image: "P18", sub: "P170" }),
  yearCat("libri", "Libri", "Anno di uscita dei libri", "Quale libro è uscito dopo?", "Romanzi e classici famosi.", "📚",
    famous(35, "?i wdt:P31 wd:Q7725634."), "P577", { sub: "P50", enwiki: true }),
  /* aziende e auto */
  yearCat("aziende-fondazione", "Aziende", "Anno di fondazione delle aziende", "Quale azienda è nata dopo?", "Marchi famosi: quando sono nati?", "🏢",
    famous(40, "VALUES ?k { wd:Q4830453 wd:Q891723 wd:Q6881511 wd:Q43229 wd:Q167037 } ?i wdt:P31 ?k."), "P571", { image: "P154", sub: "P17", minValue: 1600 }),
  {
    id: "aziende-dipendenti",
    topic: "Aziende",
    title: "Dipendenti delle aziende",
    question: "Quale azienda ha più dipendenti?",
    description: "Le grandi aziende del mondo e quante persone ci lavorano.",
    emoji: "👔",
    unit: "dipendenti",
    format: "number",
    build: () => wikidata({ where: famous(40, "VALUES ?k { wd:Q4830453 wd:Q891723 wd:Q6881511 wd:Q43229 wd:Q167037 } ?i wdt:P31 ?k."), prop: "P1128", image: "P154", sub: "P17", keep: "max", minValue: 100 }),
  },
  yearCat("auto-anno", "Aziende", "Anno di uscita delle auto", "Quale auto è uscita dopo?", "Modelli di auto famosi.", "🚗",
    famous(15, "?i wdt:P31 wd:Q3231690."), "P571", { image: "P18", sub: "P176", minValue: 1885 }),
  /* scienza */
  {
    id: "elementi-massa",
    topic: "Scienza",
    title: "Numero atomico degli elementi",
    question: "Quale elemento ha il numero atomico più alto?",
    description: "Tutti gli elementi della tavola periodica.",
    emoji: "⚛️",
    unit: "",
    format: "number",
    ttlDays: 120,
    build: () => wikidata({ cls: "Q11344", prop: "P1086", image: "P18", minValue: 1, maxValue: 130 }),
  },
  yearCat("elementi-scoperta", "Scienza", "Anno di scoperta degli elementi", "Quale elemento è stato scoperto dopo?", "Dall'antichità ai laboratori moderni.", "🔬",
    "?i wdt:P31 wd:Q11344.", "P575", { image: "P18", minValue: 1000 }),
  yearCat("universita", "Scienza", "Anno di fondazione delle università", "Quale università è nata dopo?", "Da Bologna a Stanford.", "🎓",
    famous(30, "VALUES ?k { wd:Q3918 wd:Q875538 wd:Q902104 } ?i wdt:P31 ?k."), "P571", { image: "P18", sub: "P17" }),
  /* anime, manga, tv */
  {
    id: "anime-episodi",
    topic: "Anime",
    title: "Episodi degli anime",
    question: "Quale anime ha più episodi?",
    description: "Da One Piece ai film: quanti episodi ha?",
    emoji: "🔢",
    unit: "episodi",
    format: "number",
    build: async () => (await anilist()).filter((a) => a.episodes).map((a) => ({ name: anTitle(a), value: Number(a.episodes), image: anImg(a) })),
  },
  {
    id: "manga-voto",
    topic: "Manga",
    title: "Voto dei manga",
    question: "Quale manga ha il voto più alto?",
    description: "Il voto medio su AniList, da 0 a 100.",
    emoji: "📖",
    unit: "/100",
    format: "number",
    build: async () => (await anilistManga()).filter((a) => a.averageScore).map((a) => ({ name: anTitle(a), value: Number(a.averageScore), image: anImg(a) })),
  },
  {
    id: "manga-popolarita",
    topic: "Manga",
    title: "Popolarità dei manga",
    question: "Quale manga è più seguito?",
    description: "Quante persone lo hanno in lista su AniList.",
    emoji: "🔥",
    unit: "persone",
    format: "number",
    build: async () => (await anilistManga()).map((a) => ({ name: anTitle(a), value: Number(a.popularity || 0), image: anImg(a) })),
  },
  {
    id: "manga-capitoli",
    topic: "Manga",
    title: "Capitoli dei manga",
    question: "Quale manga ha più capitoli?",
    description: "Solo i manga conclusi o con il conteggio noto.",
    emoji: "📚",
    unit: "capitoli",
    format: "number",
    build: async () => (await anilistManga()).filter((a) => a.chapters).map((a) => ({ name: anTitle(a), value: Number(a.chapters), image: anImg(a) })),
  },
  {
    id: "manga-anno",
    topic: "Manga",
    title: "Anno di uscita dei manga",
    question: "Quale manga è uscito dopo?",
    description: "Dai classici agli ultimi successi.",
    emoji: "🗓️",
    unit: "",
    format: "year",
    build: async () => (await anilistManga()).filter((a) => a.startDate?.year).map((a) => ({ name: anTitle(a), value: Number(a.startDate.year), image: anImg(a) })),
  },
  {
    id: "serie-durata",
    topic: "Cinema e TV",
    title: "Durata degli episodi delle serie",
    question: "Quale serie ha gli episodi più lunghi?",
    description: "Minuti per episodio, in media.",
    emoji: "⏳",
    unit: "minuti",
    format: "number",
    ttlDays: 14,
    build: async () =>
      (await tvmazeShows())
        .filter((s) => s.averageRuntime || s.runtime)
        .map((s) => ({ name: clean(s.name), value: Number(s.averageRuntime || s.runtime), sub: clean(s.network?.name || s.webChannel?.name || "", 40), image: String(s.image.original || s.image.medium) })),
  },
  /* pokémon in più */
  ...(
    [
      ["pokemon-velocita", "Velocità dei Pokémon", "Quale Pokémon è più veloce?", "speed", "💨"],
      ["pokemon-attacco", "Attacco dei Pokémon", "Quale Pokémon ha più attacco?", "attack", "🗡️"],
      ["pokemon-ps", "PS dei Pokémon", "Quale Pokémon ha più PS?", "hp", "💚"],
      ["pokemon-difesa", "Difesa dei Pokémon", "Quale Pokémon ha più difesa?", "defense", "🛡️"],
    ] as const
  ).map(
    ([id, title, question, stat, emoji]): NQCategory => ({
      id,
      topic: "Pokémon",
      title,
      question,
      description: "La statistica base di tutti i Pokémon.",
      emoji,
      unit: "",
      format: "number",
      ttlDays: 60,
      build: async () => (await pokemon()).map((p) => ({ name: pokeName(p.name), value: pokeStat(stat)(p), image: pokeImg(p) })).filter((x) => x.value > 0),
    }),
  ),
  {
    id: "pokemon-numero",
    topic: "Pokémon",
    title: "Numero nel Pokédex",
    question: "Quale Pokémon viene dopo nel Pokédex?",
    description: "Da Bulbasaur all'ultima generazione.",
    emoji: "📕",
    unit: "",
    format: "number",
    ttlDays: 60,
    build: async () => (await pokemon()).map((p) => ({ name: pokeName(p.name), value: Number(p.id), image: pokeImg(p) })),
  },
  /* cibo in più */
  ...(
    [
      ["zuccheri", "Zuccheri dei prodotti", "Quale prodotto ha più zuccheri?", "sugars_100g", "🍬", "g di zuccheri / 100 g"],
      ["grassi", "Grassi dei prodotti", "Quale prodotto ha più grassi?", "fat_100g", "🧈", "g di grassi / 100 g"],
      ["proteine", "Proteine dei prodotti", "Quale prodotto ha più proteine?", "proteins_100g", "💪", "g di proteine / 100 g"],
      ["sale", "Sale dei prodotti", "Quale prodotto ha più sale?", "salt_100g", "🧂", "g di sale / 100 g"],
    ] as const
  ).map(
    ([id, title, question, key, emoji, unit]): NQCategory => ({
      id,
      topic: "Cibo",
      title,
      question,
      description: "I prodotti più scansionati al mondo.",
      emoji,
      unit,
      format: "decimal",
      ttlDays: 20,
      build: async () =>
        dedupe(
          (await foodItaly())
            .map((p: any) => ({
              name: clean(p.product_name_en || p.product_name, 60),
              sub: clean(String(p.brands || "").split(",")[0], 40),
              value: Math.round(Number(p.nutriments?.[key]) * 10) / 10,
              image: String(p.image_front_url || p.image_front_small_url || ""),
            }))
            .filter((x) => x.name && x.image && Number.isFinite(x.value) && x.value >= 0 && x.value <= 100),
        ),
    }),
  ),
  {
    id: "wikipedia-mondo",
    topic: "Persone",
    title: "Visite su Wikipedia nel mondo",
    question: "Quale pagina è stata letta di più il mese scorso?",
    description: "Le pagine più lette della Wikipedia inglese nell'ultimo mese.",
    emoji: "🌐",
    unit: "visite",
    format: "number",
    ttlDays: 3,
    build: () => wikipediaTop("en"),
  },
];
CATEGORIES.push(...MORE);

/* ───────────── terza infornata: ancora più temi ───────────── */

const numCat = (
  id: string,
  topic: string,
  title: string,
  question: string,
  description: string,
  emoji: string,
  unit: string,
  format: NQFormat,
  spec: WdSpec,
): NQCategory => ({ id, topic, title, question, description, emoji, unit, format, build: () => wikidata(spec) });

const job = (occ: string) => `?i wdt:P106 wd:${occ}; wdt:P31 wd:Q5.`;
const born = (id: string, title: string, description: string, emoji: string, occ: string, links: number) =>
  yearCat(id, "Persone", title, "Chi è nato dopo?", description, emoji, famous(links, job(occ)), "P569", { image: "P18", minValue: 1000 });

const MORE2: NQCategory[] = [
  /* persone */
  born("scrittori-nascita", "Anno di nascita degli scrittori", "Scrittori e poeti di ogni epoca.", "✒️", "Q36180", 60),
  born("pittori-nascita", "Anno di nascita dei pittori", "Da Giotto a Warhol.", "🖌️", "Q1028181", 40),
  born("compositori-nascita", "Anno di nascita dei compositori", "Da Bach a Morricone.", "🎼", "Q36834", 40),
  born("filosofi-nascita", "Anno di nascita dei filosofi", "Pensatori di tutte le epoche.", "🤔", "Q4964182", 45),
  born("registi-nascita", "Anno di nascita dei registi", "Registi di cinema famosi.", "🎥", "Q2526255", 70),
  born("rapper-nascita", "Anno di nascita dei rapper", "Rapper di tutto il mondo.", "🎙️", "Q2252262", 25),
  born("tennisti-nascita", "Anno di nascita dei tennisti", "Campioni del tennis.", "🎾", "Q10833314", 25),
  born("ciclisti-nascita", "Anno di nascita dei ciclisti", "Campioni del ciclismo.", "🚴", "Q2309784", 20),
  born("astronauti-nascita", "Anno di nascita degli astronauti", "Chi è andato nello spazio.", "👩‍🚀", "Q11631", 20),
  yearCat("scrittori-morte", "Persone", "Anno di morte degli scrittori", "Chi è morto dopo?", "Grandi scrittori del passato.", "📜",
    famous(60, job("Q36180")), "P570", { image: "P18", keep: "max", minValue: 1000 }),
  yearCat("pittori-morte", "Persone", "Anno di morte dei pittori", "Chi è morto dopo?", "Grandi pittori del passato.", "🖼️",
    famous(40, job("Q1028181")), "P570", { image: "P18", keep: "max", minValue: 1000 }),
  yearCat("imperatori", "Storia", "Anno di nascita degli imperatori romani", "Chi è nato dopo?", "Da Augusto agli ultimi imperatori.", "🏛️",
    "?i wdt:P39 wd:Q842606.", "P569", { image: "P18" }),
  yearCat("papi", "Storia", "Anno di nascita dei papi", "Chi è nato dopo?", "I papi della storia.", "⛪",
    "?i wdt:P39 wd:Q19546.", "P569", { image: "P18", minValue: 1 }),
  yearCat("trattati", "Storia", "Anno dei trattati", "Quale trattato è stato firmato dopo?", "Trattati e accordi famosi.", "📜",
    famous(25, "?i wdt:P31 wd:Q131569."), "P585", { image: "P18" }),
  numCat("tennisti-altezza", "Sport", "Altezza dei tennisti", "Chi è più alto?", "Tennisti famosi, in centimetri.", "📏", "cm", "number",
    { where: famous(15, job("Q10833314")), prop: "P2048", normalized: true, scale: 100, image: "P18", minValue: 150, maxValue: 215 }),
  /* sport */
  numCat("circuiti", "Sport", "Lunghezza dei circuiti", "Quale circuito è più lungo?", "Circuiti di Formula 1 e motori, in metri.", "🏁", "m", "number",
    { where: famous(8, "VALUES ?k { wd:Q2338524 wd:Q1081138 } ?i wdt:P31 ?k."), prop: "P2043", normalized: true, image: "P18", sub: "P17", minValue: 500, maxValue: 30000 }),
  yearCat("nba-fondazione", "Sport", "Anno di fondazione delle squadre NBA", "Quale squadra è nata dopo?", "Le squadre di basket NBA.", "🏀",
    "?i wdt:P118 wd:Q155223; wdt:P31 wd:Q13393265.", "P571", { image: "P154" }),
  /* geografia */
  numCat("stati-usa", "Geografia", "Popolazione degli Stati USA", "Quale Stato ha più abitanti?", "I 50 Stati degli Stati Uniti.", "🇺🇸", "abitanti", "number",
    { cls: "Q35657", prop: "P1082", image: "P41", keep: "max" }),
  numCat("paesi-isu", "Geografia", "Indice di sviluppo umano", "Quale Paese ha l'indice più alto?", "Da 0 a 1: salute, istruzione e reddito.", "📊", "", "decimal",
    { cls: "Q6256", prop: "P1081", image: "P41", keep: "max", minValue: 0.2, maxValue: 1 }),
  numCat("paesi-fertilita", "Geografia", "Figli per donna", "Dove nascono più bambini?", "Il tasso di fecondità di ogni Paese.", "👶", "figli per donna", "decimal",
    { cls: "Q6256", prop: "P4841", image: "P41", keep: "max", minValue: 0.5, maxValue: 9 }),
  yearCat("paesi-nascita", "Geografia", "Anno di nascita dei Paesi", "Quale Paese è nato dopo?", "Indipendenze e fondazioni degli Stati di oggi.", "🎉",
    "?i wdt:P31 wd:Q6256.", "P571", { image: "P41", keep: "max" }),
  numCat("citta-altitudine", "Geografia", "Altitudine delle grandi città", "Quale città è più in alto?", "Metropoli del mondo, dal mare agli altipiani.", "🌄", "m", "number",
    { where: "?i wdt:P1082 ?pp. FILTER(?pp > 600000) ?i wdt:P31/wdt:P279* wd:Q515.", prop: "P2044", image: "P18", sub: "P17", keep: "max" }),
  numCat("fiumi-portata", "Natura", "Portata dei fiumi", "Quale fiume porta più acqua?", "Metri cubi d'acqua al secondo.", "💧", "m³/s", "number",
    { cls: "Q4022", prop: "P2225", normalized: true, image: "P18", sub: "P17", minLinks: 15, keep: "max", minValue: 1 }),
  /* spazio e scienza */
  numCat("stelle-distanza", "Scienza", "Distanza delle stelle", "Quale stella è più lontana?", "Le stelle più famose del cielo, in anni luce.", "⭐", "anni luce", "decimal",
    { where: famous(25, "?i wdt:P31 wd:Q523."), prop: "P2583", normalized: true, scale: 1 / 9.4607e15, image: "P18", keep: "first", minValue: 0.01 }),
  yearCat("missioni-spaziali", "Scienza", "Anno delle missioni spaziali", "Quale missione è partita dopo?", "Dallo Sputnik alle sonde di oggi.", "🚀",
    famous(25, "VALUES ?k { wd:Q2133344 wd:Q752783 wd:Q26529 wd:Q40218 } ?i wdt:P31 ?k."), "P619", { image: "P18", minValue: 1950 }),
  /* tecnologia */
  yearCat("smartphone", "Tecnologia", "Anno di uscita degli smartphone", "Quale telefono è uscito dopo?", "iPhone, Samsung, Nokia e tanti altri.", "📱",
    famous(8, "?i wdt:P31 wd:Q19723451."), "P577", { image: "P18", sub: "P176", minValue: 1990 }),
  yearCat("linguaggi", "Tecnologia", "Anno dei linguaggi di programmazione", "Quale linguaggio è nato dopo?", "Dal Fortran a Rust.", "💻",
    famous(25, "?i wdt:P31/wdt:P279? wd:Q9143."), "P571", { image: "P154", minValue: 1940 }),
  yearCat("siti-web", "Tecnologia", "Anno di nascita dei siti web", "Quale sito è nato dopo?", "Social, motori di ricerca e servizi famosi.", "🌐",
    famous(35, "?i wdt:P31/wdt:P279? wd:Q35127."), "P571", { image: "P154", minValue: 1985 }),
  yearCat("aerei", "Tecnologia", "Primo volo degli aerei", "Quale aereo ha volato dopo?", "Aerei famosi, dal Wright Flyer ai jet di oggi.", "✈️",
    famous(15, "?i wdt:P31/wdt:P279? wd:Q15056993."), "P606", { image: "P18", sub: "P176", minValue: 1900 }),
  /* cinema e tv */
  numCat("film-budget", "Cinema e TV", "Budget dei film", "Quale film è costato di più?", "Quanto è costato girarlo, in dollari.", "💸", "$", "money",
    { cls: "Q11424", prop: "P2130", unit: "Q4917", minLinks: 20, keep: "max", limit: 9000, minValue: 10000, enwiki: true }),
  yearCat("animazione-anno", "Cinema e TV", "Anno dei film d'animazione", "Quale cartone è uscito dopo?", "Disney, Pixar, Ghibli e tanti altri.", "🧸",
    famous(20, "?i wdt:P31 wd:Q202866."), "P577", { enwiki: true }),
  numCat("serie-stagioni", "Cinema e TV", "Stagioni delle serie TV", "Quale serie ha più stagioni?", "Serie famose: quante stagioni hanno?", "📺", "stagioni", "number",
    { where: famous(30, "?i wdt:P31 wd:Q5398426."), prop: "P2437", keep: "max", minValue: 1, enwiki: true }),
  numCat("serie-episodi", "Cinema e TV", "Episodi delle serie TV", "Quale serie ha più episodi?", "Dalle miniserie alle soap infinite.", "🎞️", "episodi", "number",
    { where: famous(30, "?i wdt:P31 wd:Q5398426."), prop: "P1113", keep: "max", minValue: 2, enwiki: true }),
  /* libri */
  numCat("libri-pagine", "Libri", "Pagine dei libri", "Quale libro è più lungo?", "Romanzi e classici: quante pagine?", "📖", "pagine", "number",
    { where: famous(20, "?i wdt:P31 wd:Q7725634."), prop: "P1104", keep: "max", minValue: 20, enwiki: true }),
  /* aziende */
  numCat("aziende-fatturato", "Aziende", "Fatturato delle aziende", "Quale azienda fattura di più?", "Ricavi annuali, in dollari.", "📈", "$", "money",
    { where: famous(30, "VALUES ?k { wd:Q4830453 wd:Q891723 wd:Q6881511 wd:Q43229 wd:Q167037 } ?i wdt:P31 ?k."), prop: "P2139", unit: "Q4917", image: "P154", sub: "P17", keep: "max", minValue: 1e6 }),
  numCat("aziende-borsa", "Aziende", "Valore in borsa delle aziende", "Quale azienda vale di più?", "Capitalizzazione di mercato, in dollari.", "🏦", "$", "money",
    { where: famous(25, "VALUES ?k { wd:Q4830453 wd:Q891723 wd:Q6881511 wd:Q43229 wd:Q167037 } ?i wdt:P31 ?k."), prop: "P2226", unit: "Q4917", image: "P154", sub: "P17", keep: "max", minValue: 1e6 }),
  yearCat("case-auto", "Aziende", "Anno di fondazione delle case auto", "Quale marca è nata dopo?", "Ferrari, Toyota, Tesla e tutte le altre.", "🚘",
    famous(15, "?i wdt:P31 wd:Q786820."), "P571", { image: "P154", sub: "P17", minValue: 1800 }),
  /* mondo */
  yearCat("stadi-apertura", "Mondo", "Anno di apertura degli stadi", "Quale stadio è stato aperto dopo?", "Stadi di tutto il mondo.", "🏟️",
    famous(10, "?i wdt:P31 wd:Q483110."), "P1619", { image: "P18", sub: "P131", minValue: 1850 }),
  yearCat("aeroporti-apertura", "Mondo", "Anno di apertura degli aeroporti", "Quale aeroporto è stato aperto dopo?", "I grandi aeroporti del mondo.", "🛫",
    famous(15, "?i wdt:P31 wd:Q1248784."), "P1619", { image: "P18", sub: "P131", minValue: 1900 }),
  yearCat("grattacieli-anno", "Mondo", "Anno di costruzione dei grattacieli", "Quale grattacielo è stato finito dopo?", "Dall'Empire State Building al Burj Khalifa.", "🏗️",
    "?i wdt:P31 wd:Q11303; wikibase:sitelinks ?ss. FILTER(?ss >= 4)", "P1619", { image: "P18", sub: "P131", minValue: 1880 }),
  yearCat("ponti-anno", "Mondo", "Anno di costruzione dei ponti", "Quale ponte è stato costruito dopo?", "Ponti famosi di tutto il mondo.", "🌉",
    famous(12, "?i wdt:P31 wd:Q12280."), "P571", { image: "P18", sub: "P131" }),
  yearCat("musei-fondazione", "Mondo", "Anno di fondazione dei musei", "Quale museo è nato dopo?", "Dal Louvre ai musei di oggi.", "🏛️",
    famous(20, "VALUES ?k { wd:Q33506 wd:Q207694 wd:Q1007870 wd:Q588140 } ?i wdt:P31 ?k."), "P571", { image: "P18", sub: "P131" }),
  numCat("universita-studenti", "Mondo", "Studenti delle università", "Quale università ha più studenti?", "Grandi università del mondo.", "🎓", "studenti", "number",
    { where: famous(25, "VALUES ?k { wd:Q3918 wd:Q875538 wd:Q902104 } ?i wdt:P31 ?k."), prop: "P2196", image: "P18", sub: "P17", keep: "max", minValue: 100 }),
  /* pokémon, cibo, anime in più */
  ...(
    [
      ["pokemon-attacco-speciale", "Attacco speciale dei Pokémon", "Quale Pokémon ha più attacco speciale?", "special-attack", "✨"],
      ["pokemon-difesa-speciale", "Difesa speciale dei Pokémon", "Quale Pokémon ha più difesa speciale?", "special-defense", "🔰"],
    ] as const
  ).map(
    ([id, title, question, stat, emoji]): NQCategory => ({
      id,
      topic: "Pokémon",
      title,
      question,
      description: "La statistica base di tutti i Pokémon.",
      emoji,
      unit: "",
      format: "number",
      ttlDays: 60,
      build: async () => (await pokemon()).map((p) => ({ name: pokeName(p.name), value: pokeStat(stat)(p), image: pokeImg(p) })).filter((x) => x.value > 0),
    }),
  ),
  {
    id: "pokemon-esperienza",
    topic: "Pokémon",
    title: "Esperienza base dei Pokémon",
    question: "Quale Pokémon dà più esperienza?",
    description: "Quanta esperienza si prende sconfiggendolo.",
    emoji: "🎖️",
    unit: "PE",
    format: "number",
    ttlDays: 60,
    build: async () => (await pokemon()).map((p) => ({ name: pokeName(p.name), value: Number(p.base_experience || 0), image: pokeImg(p) })).filter((x) => x.value > 0),
  },
  ...(
    [
      ["carboidrati", "Carboidrati dei prodotti", "Quale prodotto ha più carboidrati?", "carbohydrates_100g", "🍞", "g di carboidrati / 100 g"],
      ["fibre", "Fibre dei prodotti", "Quale prodotto ha più fibre?", "fiber_100g", "🌾", "g di fibre / 100 g"],
      ["grassi-saturi", "Grassi saturi dei prodotti", "Quale prodotto ha più grassi saturi?", "saturated-fat_100g", "🥓", "g di grassi saturi / 100 g"],
    ] as const
  ).map(
    ([id, title, question, key, emoji, unit]): NQCategory => ({
      id,
      topic: "Cibo",
      title,
      question,
      description: "I prodotti più scansionati al mondo.",
      emoji,
      unit,
      format: "decimal",
      ttlDays: 20,
      build: async () =>
        dedupe(
          (await foodItaly())
            .map((p: any) => ({
              name: clean(p.product_name_en || p.product_name, 60),
              sub: clean(String(p.brands || "").split(",")[0], 40),
              value: Math.round(Number(p.nutriments?.[key]) * 10) / 10,
              image: String(p.image_front_url || p.image_front_small_url || ""),
            }))
            .filter((x) => x.name && x.image && Number.isFinite(x.value) && x.value >= 0 && x.value <= 100),
        ),
    }),
  ),
  {
    id: "anime-durata",
    topic: "Anime",
    title: "Durata degli episodi degli anime",
    question: "Quale anime ha gli episodi più lunghi?",
    description: "Minuti per episodio, dai corti ai film.",
    emoji: "⏲️",
    unit: "minuti",
    format: "number",
    build: async () => (await anilist()).filter((a) => a.duration).map((a) => ({ name: anTitle(a), value: Number(a.duration), image: anImg(a) })),
  },
  {
    id: "manga-volumi",
    topic: "Manga",
    title: "Volumi dei manga",
    question: "Quale manga ha più volumi?",
    description: "Solo i manga con il conteggio noto.",
    emoji: "📚",
    unit: "volumi",
    format: "number",
    build: async () => (await anilistManga()).filter((a) => a.volumes).map((a) => ({ name: anTitle(a), value: Number(a.volumes), image: anImg(a) })),
  },
];
CATEGORIES.push(...MORE2);

/* ───────────── quarta infornata: temi mondiali, popolarità e social ───────────── */

/** ultimi 12 mesi interi, nel formato dell'API delle visite di Wikipedia */
function lastYearRange() {
  const end = new Date();
  end.setUTCDate(1);
  end.setUTCDate(0);
  const start = new Date(Date.UTC(end.getUTCFullYear() - 1, end.getUTCMonth() + 1, 1));
  const f = (d: Date) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}00`;
  return { from: f(start), to: f(end) };
}

/**
 * «Quanto è cercato»: visite alla pagina inglese di Wikipedia nell'ultimo anno.
 * Stesso spirito delle ricerche su Google, ma con dati pubblici: vale per qualsiasi tema.
 */
async function popularity(where: string, opts: { sub?: string; limit?: number; image?: string } = {}): Promise<NQItem[]> {
  const q = `SELECT ?i ?l ?en ?img ?subLabel WHERE {
    ${where}
    ?art schema:about ?i; schema:isPartOf <https://en.wikipedia.org/>; schema:name ?en.
    OPTIONAL { ?i wdt:${opts.image || "P18"} ?img }
    ${opts.sub ? `OPTIONAL { ?i wdt:${opts.sub} ?sub }` : ""}
    SERVICE wikibase:label { bd:serviceParam wikibase:language "it,en". ?i rdfs:label ?l. ${opts.sub ? "?sub rdfs:label ?subLabel." : ""} }
  } LIMIT ${opts.limit || 700}`;
  const rows = await sparql(q);
  const byId = new Map<string, { item: NQItem; en: string }>();
  for (const r of rows) {
    const id = String(r.i?.value || "");
    const name = clean(r.l?.value);
    if (!id || byId.has(id) || !name || /^Q\d+$/.test(name) || !r.en?.value) continue;
    const sub = clean(r.subLabel?.value, 50);
    byId.set(id, {
      en: String(r.en.value),
      item: { name, value: 0, ...(sub && !/^Q\d+$/.test(sub) ? { sub } : {}), ...(r.img?.value ? { image: commonsThumb(r.img.value) } : {}) },
    });
  }
  const { from, to } = lastYearRange();
  const list = [...byId.values()];
  /* poche alla volta: Wikimedia rallenta chi esagera */
  await pool(list, 3, 80, async (x) => {
    const title = encodeURIComponent(x.en.replace(/ /g, "_"));
    const r = await getJson(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${title}/monthly/${from}/${to}`);
    x.item.value = ((r?.items || []) as any[]).reduce((s, m) => s + Number(m.views || 0), 0);
  });
  /* chi non ha immagine su Wikidata la prende dalla pagina inglese */
  const noImg = list.filter((x) => !x.item.image);
  const titles = new Map(noImg.map((x) => [x.item, x.en] as const));
  await enwikiImages(noImg.map((x) => x.item), titles);
  return dedupe(list.map((x) => x.item).filter((x) => x.value > 1000), "max");
}

const popCat = (id: string, topic: string, title: string, description: string, emoji: string, where: string, opts: { sub?: string; limit?: number; image?: string } = {}): NQCategory => ({
  id,
  topic,
  title,
  question: "Quale è stato più cercato?",
  description,
  emoji,
  unit: "visite in un anno",
  format: "number",
  ttlDays: 20,
  build: () => popularity(where, opts),
});

/* follower su una piattaforma: P8687 con la piattaforma indicata dal qualificatore (account) */
const followers = (qualifier: string) =>
  `?i p:P8687 ?st. ?st ps:P8687 ?v; pq:${qualifier} ?acc; wikibase:rank ?rk. FILTER(?rk != wikibase:DeprecatedRank)`;

const MORE3: NQCategory[] = [
  /* popolarità: quanto è cercato */
  popCat("cerca-cibi", "Popolarità", "Cibi più cercati", "Pizza, sushi, tacos: quale piatto interessa di più al mondo?", "🍕", famous(25, "?i wdt:P31/wdt:P279? wd:Q746549.")),
  popCat("cerca-animali", "Popolarità", "Animali più cercati", "Dal leone al panda: quale animale cerca di più la gente?", "🦁", famous(80, "?i wdt:P31 wd:Q16521. ?i wdt:P2067 ?massa.")),
  popCat("cerca-supereroi", "Popolarità", "Supereroi più cercati", "Marvel, DC e non solo.", "🦸", famous(15, "VALUES ?k { wd:Q188784 wd:Q1114461 wd:Q15773347 } ?i wdt:P31 ?k.")),
  popCat("cerca-calciatori", "Popolarità", "Calciatori più cercati", "Da Messi a Haaland: chi interessa di più?", "⚽", famous(60, "?i wdt:P106 wd:Q937857; wdt:P31 wd:Q5.")),
  popCat("cerca-cantanti", "Popolarità", "Cantanti più cercati", "Le star della musica di tutto il mondo.", "🎤", famous(70, "?i wdt:P106 wd:Q177220; wdt:P31 wd:Q5.")),
  popCat("cerca-attori", "Popolarità", "Attori più cercati", "Le star di Hollywood e non solo.", "🎬", famous(75, "?i wdt:P106 wd:Q33999; wdt:P31 wd:Q5.")),
  popCat("cerca-squadre", "Popolarità", "Squadre di calcio più cercate", "I club più seguiti del pianeta.", "🛡️", famous(45, "?i wdt:P31 wd:Q476028."), { image: "P154", sub: "P17" }),
  popCat("cerca-marche", "Popolarità", "Marche più cercate", "Apple, Nike, Coca-Cola…", "🏷️", famous(60, "VALUES ?k { wd:Q4830453 wd:Q891723 wd:Q6881511 wd:Q167037 wd:Q431289 } ?i wdt:P31 ?k."), { image: "P154" }),
  popCat("cerca-videogiochi", "Popolarità", "Videogiochi più cercati", "Minecraft, GTA, Fortnite…", "🎮", famous(40, "?i wdt:P31 wd:Q7889.")),
  popCat("cerca-paesi", "Popolarità", "Paesi più cercati", "Quale Paese interessa di più?", "🌍", "?i wdt:P31 wd:Q6256.", { image: "P41" }),
  popCat("cerca-film", "Popolarità", "Film più cercati", "I film di cui si legge di più.", "🎞️", famous(70, "?i wdt:P31 wd:Q11424.")),
  popCat("cerca-serie", "Popolarità", "Serie TV più cercate", "Quale serie fa più curiosità?", "📺", famous(45, "?i wdt:P31 wd:Q5398426.")),
  popCat("cerca-youtuber", "Popolarità", "YouTuber più cercati", "Da MrBeast a PewDiePie.", "▶️", famous(15, "?i wdt:P106 wd:Q17125263; wdt:P31 wd:Q5.")),
  popCat("cerca-citta", "Popolarità", "Città più cercate", "Le città che incuriosiscono di più.", "🌆", famous(150, "?i wdt:P31/wdt:P279? wd:Q515."), { sub: "P17" }),
  popCat("cerca-pokemon", "Popolarità", "Pokémon più cercati", "Pikachu batte tutti?", "⚡", famous(15, "?i wdt:P31/wdt:P279 wd:Q3966183.")),
  /* social e soldi */
  {
    id: "follower-instagram",
    topic: "Social",
    title: "Follower su Instagram",
    question: "Chi ha più follower su Instagram?",
    description: "Star, sportivi e marchi: quanti li seguono?",
    emoji: "📸",
    unit: "follower",
    format: "number",
    ttlDays: 20,
    build: () => wikidata({ where: famous(15, ""), prop: "P8687", rawValue: followers("P2003"), image: "P18", keep: "max", minValue: 10000 }),
  },
  {
    id: "iscritti-youtube",
    topic: "Social",
    title: "Iscritti su YouTube",
    question: "Quale canale ha più iscritti?",
    description: "YouTuber, cantanti e canali famosi.",
    emoji: "📺",
    unit: "iscritti",
    format: "number",
    ttlDays: 20,
    build: () => wikidata({ where: famous(20, ""), prop: "P8687", rawValue: followers("P2397"), image: "P18", keep: "max", minValue: 10000, limit: 12000 }),
  },
  {
    id: "follower-x",
    topic: "Social",
    title: "Follower su X (Twitter)",
    question: "Chi ha più follower su X?",
    description: "Politici, star e sportivi.",
    emoji: "🐦",
    unit: "follower",
    format: "number",
    ttlDays: 20,
    build: () => wikidata({ where: famous(50, ""), prop: "P8687", rawValue: followers("P6552"), image: "P18", keep: "max", minValue: 10000, limit: 12000 }),
  },
  numCat("patrimonio", "Persone", "Patrimonio delle celebrità", "Chi è più ricco?", "Miliardari, star e sportivi: quanto valgono?", "💎", "$", "money",
    { where: famous(15, "?i wdt:P31 wd:Q5."), prop: "P2218", unit: "Q4917", image: "P18", keep: "max", minValue: 1e6 }),
  numCat("altezza-famosi", "Persone", "Altezza dei personaggi famosi", "Chi è più alto?", "Star, sportivi e politici: quanto sono alti?", "📏", "cm", "number",
    { where: famous(80, "?i wdt:P31 wd:Q5."), prop: "P2048", normalized: true, scale: 100, image: "P18", keep: "max", minValue: 120, maxValue: 240 }),
  numCat("giochi-venduti", "Cinema e TV", "Videogiochi più venduti", "Quale gioco ha venduto di più?", "Copie vendute nel mondo.", "🕹️", "copie", "number",
    { cls: "Q7889", prop: "P2664", keep: "max", minValue: 10000, enwiki: true }),
  numCat("animali-peso", "Natura", "Peso degli animali", "Quale animale pesa di più?", "Dalla balena al colibrì, in chili.", "🐘", "kg", "decimal",
    { where: famous(40, "?i wdt:P31 wd:Q16521."), prop: "P2067", normalized: true, image: "P18", keep: "max", minValue: 0.001 }),
];
CATEGORIES.push(...MORE3);

function pokeName(n: string) {
  return String(n || "")
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
function pokeImg(p: any) {
  return String(p?.sprites?.other?.["official-artwork"]?.front_default || p?.sprites?.front_default || "");
}

/* ───────────── cache ───────────── */

type Stored = { at: number; items: NQItem[] };
const mem = new Map<string, Stored>();
const building = new Map<string, Promise<Stored | null>>();

function fileOf(id: string) {
  return path.join(DIR, `${id}.json`);
}

function readDisk(id: string): Stored | null {
  try {
    const x = JSON.parse(fs.readFileSync(fileOf(id), "utf8"));
    return Array.isArray(x?.items) ? x : null;
  } catch {
    return null;
  }
}

function writeDisk(id: string, s: Stored) {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    const tmp = `${fileOf(id)}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(s), "utf8");
    fs.renameSync(tmp, fileOf(id));
  } catch (err: any) {
    global.logger?.warn?.("[number-quiz] salvataggio:", err?.message || err);
  }
}

function buildNow(cat: NQCategory): Promise<Stored | null> {
  const running = building.get(cat.id);
  if (running) return running;
  const job = (async () => {
    const t = Date.now();
    try {
      let items = (await cat.build()).filter((x) => x && x.name && Number.isFinite(x.value));
      items = items.map((x) => ({ ...x, image: x.image || undefined, sub: x.sub || undefined }));
      if (cat.max) items = items.slice(0, cat.max);
      if (items.length < 12) {
        global.logger?.warn?.(`[number-quiz] ${cat.id}: solo ${items.length} voci, tengo i dati vecchi`);
        return mem.get(cat.id) || null;
      }
      const s = { at: Date.now(), items };
      mem.set(cat.id, s);
      writeDisk(cat.id, s);
      global.logger?.info?.(`[number-quiz] ${cat.id}: ${items.length} voci in ${Math.round((Date.now() - t) / 1000)}s`);
      return s;
    } catch (err: any) {
      global.logger?.warn?.(`[number-quiz] ${cat.id}:`, err?.message || err);
      return mem.get(cat.id) || null;
    } finally {
      building.delete(cat.id);
    }
  })();
  building.set(cat.id, job);
  return job;
}

/** Voci della categoria: subito quelle in memoria o su disco; se sono vecchie si rinnovano dietro le quinte. */
export async function categoryItems(id: string, wait = false): Promise<NQItem[] | null> {
  const cat = CATEGORIES.find((c) => c.id === id);
  if (!cat) return null;
  let s = mem.get(id) || null;
  if (!s) {
    s = readDisk(id);
    if (s) mem.set(id, s);
  }
  const stale = !s || Date.now() - s.at > (cat.ttlDays || 21) * 86_400_000;
  if (stale) {
    const job = buildNow(cat);
    if (!s && wait) s = await job;
  }
  return s?.items || null;
}

export function categoryStatus(id: string) {
  const s = mem.get(id) || readDisk(id);
  if (s && !mem.has(id)) mem.set(id, s);
  return { ready: Boolean(s?.items?.length), count: s?.items?.length || 0, building: building.has(id), items: s?.items || [] };
}

/** All'avvio prepara le categorie mancanti o vecchie, una alla volta. */
let warmed = false;
export function warmNumberQuiz() {
  if (warmed) return;
  warmed = true;
  const pass = async () => {
    for (const c of CATEGORIES) {
      const s = mem.get(c.id) || readDisk(c.id);
      if (s) mem.set(c.id, s);
      if (!s || Date.now() - s.at > (c.ttlDays || 21) * 86_400_000) await buildNow(c);
    }
  };
  /* subito dopo l'avvio, poi ogni 6 ore: rinnova le vecchie e riprova quelle non riuscite */
  setTimeout(() => void pass(), 20_000);
  setInterval(() => void pass(), 6 * 3600_000).unref?.();
}
