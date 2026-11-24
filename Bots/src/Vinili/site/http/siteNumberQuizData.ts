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

const UA = "NumberQuizGame/1.0 (higher-or-lower quiz; contact via site)";
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
        await sleep(1500 * (attempt + 1));
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
};

async function wikidata(spec: WdSpec): Promise<NQItem[]> {
  const value = spec.normalized
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

const ITALIAN_SEEDS = [
  "Vasco Rossi", "Ligabue", "Laura Pausini", "Eros Ramazzotti", "Jovanotti", "Zucchero", "Tiziano Ferro", "Elisa",
  "Marco Mengoni", "Mahmood", "Blanco", "Annalisa", "Elodie", "Ultimo", "Sfera Ebbasta", "Måneskin", "Geolier",
  "Lazza", "Tananai", "Angelina Mango", "Lucio Dalla", "Lucio Battisti", "Fabrizio De André", "Mina", "Adriano Celentano",
  "Franco Battiato", "Pino Daniele", "Renato Zero", "Gianni Morandi", "Max Pezzali", "Cesare Cremonini", "Giorgia",
  "Negramaro", "Thegiornalisti", "Calcutta", "Coez", "Marracash", "Gué", "Salmo", "Fabri Fibra", "Anna", "Shiva",
  "Tedua", "Madame", "Irama", "Emma", "Alessandra Amoroso", "Gigi D'Alessio", "Il Volo", "Andrea Bocelli", "Nek",
  "Raf", "Umberto Tozzi", "Antonello Venditti", "Francesco De Gregori", "Loredana Bertè", "Fiorella Mannoia",
  "Gianna Nannini", "Subsonica", "Afterhours", "Litfiba", "883", "Articolo 31", "J-Ax", "Fedez", "Achille Lauro",
  "Rkomi", "Ghali", "Capo Plaza", "Tony Effe", "Olly", "Clara", "Gazzelle", "Carl Brave", "Fulminacci", "Colapesce",
  "Dimartino", "Levante", "Noemi", "Arisa", "Francesca Michielin", "Diodato", "Brunori Sas", "Niccolò Fabi",
  "Daniele Silvestri", "Samuele Bersani", "Caparezza", "Modà", "Club Dogo", "Baby K", "Boomdabash", "Paola e Chiara",
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
  for (const g of [{ id: 0 }, ...genres]) (await dz(`/chart/${g.id}/artists?limit=100`))?.data?.forEach(add);
  for (const name of ITALIAN_SEEDS) (await dz(`/search/artist?q=${encodeURIComponent(name)}&limit=1`))?.data?.slice(0, 1).forEach(add);

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

async function tvmazeShows() {
  const pages = Array.from({ length: 80 }, (_, i) => i);
  const res = await pool(pages, 3, 150, (p) => getJson(`https://api.tvmaze.com/shows?page=${p}`));
  const shows: any[] = res.flatMap((x) => (Array.isArray(x) ? x : []));
  return shows.filter((s) => Number(s.weight) >= 90 && s.image?.medium);
}

async function anilist(perPage = 50, pages = 24) {
  const out: any[] = [];
  for (let page = 1; page <= pages; page++) {
    const r = await getJson("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `{Page(page:${page},perPage:${perPage}){media(type:ANIME,sort:POPULARITY_DESC,isAdult:false){title{romaji english} averageScore popularity seasonYear episodes coverImage{extraLarge large}}}}`,
      }),
    });
    out.push(...(r?.data?.Page?.media || []));
    await sleep(800);
  }
  return out;
}

async function pokemon() {
  const list = await getJson("https://pokeapi.co/api/v2/pokemon?limit=1025");
  const urls: string[] = (list?.results || []).map((x: any) => x.url);
  const res = await pool(urls, 6, 40, (u) => getJson(u));
  return res.filter(Boolean);
}

async function foodItaly() {
  const pages = Array.from({ length: 12 }, (_, i) => i + 1);
  const res = await pool(pages, 2, 700, (p) =>
    getJson(
      `https://world.openfoodfacts.org/api/v2/search?countries_tags_en=italy&sort_by=unique_scans_n&page_size=100&page=${p}&fields=product_name_it,product_name,brands,nutriments,image_front_small_url,image_front_url`,
      {},
      40_000,
    ),
  );
  return res.flatMap((x) => x?.products || []);
}

async function wikipediaTop(): Promise<NQItem[]> {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const r = await getJson(`https://wikimedia.org/api/rest_v1/metrics/pageviews/top/it.wikipedia/all-access/${y}/${m}/all-days`);
  const arts: any[] = (r?.items?.[0]?.articles || []).filter(
    (a: any) => !/^(Pagina_principale|Speciale:|File:|Wikipedia:|Categoria:|Aiuto:|Portale:|Template:|Utente:|Progetto:)/.test(a.article) && a.article !== "-",
  );
  const items: NQItem[] = arts.slice(0, 900).map((a) => ({ name: clean(a.article.replace(/_/g, " ")), value: Number(a.views) }));
  /* immagini a gruppi di 50 titoli */
  for (let i = 0; i < items.length; i += 50) {
    const chunk = items.slice(i, i + 50);
    const titles = chunk.map((x) => x.name).join("|");
    const q = await getJson(
      `https://it.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&piprop=thumbnail&pithumbsize=800&redirects=1&titles=${encodeURIComponent(titles)}`,
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
    id: "comuni",
    topic: "Italia",
    title: "Abitanti dei comuni italiani",
    question: "Quale comune ha più abitanti?",
    description: "Quasi 8.000 comuni, dalla metropoli al paesino.",
    emoji: "🇮🇹",
    unit: "abitanti",
    format: "number",
    build: () => wikidata({ cls: "Q747074", prop: "P1082", image: "P18", sub: "P131", keep: "max", limit: 12000, minValue: 30 }),
  },
  {
    id: "comuni-altitudine",
    topic: "Italia",
    title: "Altitudine dei comuni italiani",
    question: "Quale comune è più in alto?",
    description: "Dal livello del mare alle Alpi: a che quota sta?",
    emoji: "⛰️",
    unit: "m",
    format: "number",
    build: () => wikidata({ cls: "Q747074", prop: "P2044", normalized: true, image: "P18", sub: "P131", limit: 12000 }),
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
  {
    id: "wikipedia-visite",
    topic: "Persone",
    title: "Visite su Wikipedia",
    question: "Quale pagina è stata letta di più il mese scorso?",
    description: "Le pagine più lette di Wikipedia in italiano nell'ultimo mese.",
    emoji: "📈",
    unit: "visite",
    format: "number",
    ttlDays: 3,
    build: wikipediaTop,
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
    description: "I prodotti più comprati in Italia: kcal ogni 100 g.",
    emoji: "🍫",
    unit: "kcal / 100 g",
    format: "number",
    ttlDays: 20,
    build: async () =>
      dedupe(
        (await foodItaly())
          .map((p: any) => ({
            name: clean(p.product_name_it || p.product_name, 60),
            sub: clean(String(p.brands || "").split(",")[0], 40),
            value: Math.round(Number(p.nutriments?.["energy-kcal_100g"])),
            image: String(p.image_front_url || p.image_front_small_url || ""),
          }))
          .filter((x) => x.name && x.image && Number.isFinite(x.value) && x.value >= 0 && x.value < 950),
      ),
  },
];

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
