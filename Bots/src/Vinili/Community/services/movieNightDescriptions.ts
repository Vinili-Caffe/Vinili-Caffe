/** Serata film: trama del film da Wikipedia e Wikidata (in italiano). */
const { extractMovieNightProposalTitle } = require("../utils/movieNightProposal") as typeof import("../utils/movieNightProposal");

const FALLBACK_MOVIE_DESCRIPTION = "Non ho trovato una descrizione affidabile in italiano, ma sarà una buona occasione per scoprirlo insieme durante la serata.";

function truncateDescription(text?, maxLength = 520) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) return clean;
  const sliced = clean.slice(0, maxLength + 1);
  const sentenceEnd = Math.max(sliced.lastIndexOf(". "), sliced.lastIndexOf("! "), sliced.lastIndexOf("? "));
  if (sentenceEnd >= 180) return clean.slice(0, sentenceEnd + 1).trim();
  return `${clean.slice(0, maxLength).replace(/\s+\S*$/, "").trim()}...`;
}

function isFallbackMovieDescription(text?) {
  const t = String(text || "").trim();
  if (!t) return true;
  return t === FALLBACK_MOVIE_DESCRIPTION || t.includes("Non ho trovato una descrizione affidabile");
}

async function fetchJson(url?, { timeoutMs = 12000, retries = 1 } = {}) {
  if (typeof fetch !== "function") return null;
  let last = null;
  for (let attempt = 0; attempt <= Math.max(0, retries); attempt += 1) {
    const signal =
      typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
        ? AbortSignal.timeout(timeoutMs)
        : undefined;
    const response = await fetch(url, {
      signal,
      headers: {
        /* movieDescWiki1: UA contattabile — Wikimedia blocca UA anonimi/intermittenti */
        "User-Agent": "ViniliECaffeBot/1.1 (movie-night; +https://viniliecaffe.it; discord.viniliecaffe.gg)",
        Accept: "application/json",
      },
    }).catch((err?) => {
      last = err;
      return null;
    });
    if (response?.ok) {
      const json = await response.json().catch(() => null);
      if (json) return json;
    } else {
      last = response;
      /* movieDesc429Fix1: 429 → aspetta Retry-After (max 8s), non martellare */
      if (response && Number(response.status) === 429) {
        let waitMs = 2500 * (attempt + 1);
        try {
          const ra = Number(response.headers?.get?.("retry-after") || 0);
          if (Number.isFinite(ra) && ra > 0) waitMs = Math.min(8000, Math.max(waitMs, ra * 1000));
        } catch (_) {}
        if (attempt < retries) {
          await new Promise((r?) => setTimeout(r, waitMs));
          continue;
        }
        break;
      }
    }
    if (attempt < retries) {
      await new Promise((r?) => setTimeout(r, 450 * (attempt + 1)));
    }
  }
  if (last) {
    try {
      global.logger?.warn?.("[movieNight] fetchJson failed:", String(url).slice(0, 120), last?.status || last?.message || last);
    } catch (_) {}
  }
  return null;
}

function buildMovieSearchQueries(title?, { lean = false } = {}) {
  const rawTitle = String(title || "").trim();
  /* movieDesc429Fix1: di default 1 sola query — le 3 varianti film×IT/EN ×Wikidata = 429 */
  if (lean) return rawTitle ? [rawTitle] : [];
  return [...new Set([
    rawTitle,
    `film ${rawTitle}`,
    `${rawTitle} film`,
  ].filter(Boolean))];
}

function stripMovieTitleDecorations(title?) {
  return String(title || "")
    .replace(/\s*\((film|film d'animazione|animazione|movie)[^)]*\)\s*$/i, "")
    .trim();
}

function compactMovieTitle(title?) {
  return stripMovieTitleDecorations(title)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\u00c0-\u024f]/gi, "");
}

function scoreMovieTitleMatch(movieTitle?, pageTitle?) {
  const movie = compactMovieTitle(movieTitle);
  const page = compactMovieTitle(pageTitle);
  if (!movie || !page) return 0;
  if (page === movie) return 1000;
  if (page.startsWith(movie) || movie.startsWith(page)) return 900;
  if (page.includes(movie) || movie.includes(page)) return 800;
  return 0;
}

function wikipediaPageLooksLikeMovieNoise(pageTitle?) {
  const t = String(pageTitle || "");
  return /\((franchise|serie|series|soundtrack|album|videogioco|video game|disambigua)\)/i.test(t) ||
    /\b(franchise|colonna sonora|soundtrack|personaggi di)\b/i.test(t);
}

function pickBestWikipediaSearchResult(movieTitle?, results?) {
  let bestTitle = null;
  let bestScore = 0;
  for (const entry of results || []) {
    const pageTitle = String(entry?.title || "").trim();
    if (!pageTitle || wikipediaPageLooksLikeMovieNoise(pageTitle)) continue;
    const score = scoreMovieTitleMatch(movieTitle, pageTitle);
    if (score > bestScore) {
      bestScore = score;
      bestTitle = pageTitle;
    }
  }
  /* movieDescWiki1: soglia 700 (era 800) — titoli IT/EN con anno/sottotitolo fallivano spesso */
  if (bestScore >= 700) return bestTitle;
  /* ultimo tentativo: primo risultato “pulito” se contiene il titolo compatto */
  const movie = compactMovieTitle(movieTitle);
  for (const entry of results || []) {
    const pageTitle = String(entry?.title || "").trim();
    if (!pageTitle || wikipediaPageLooksLikeMovieNoise(pageTitle)) continue;
    const page = compactMovieTitle(pageTitle);
    if (movie && page && (page.includes(movie) || movie.includes(page))) return pageTitle;
  }
  return null;
}

async function searchWikipediaPageTitle(lang?, title?) {
  const safeLang = String(lang || "it").toLowerCase();
  /* movieDesc429Fix1: prima solo titolo; se fallisce UNA variante "film …" */
  const queries = [
    ...buildMovieSearchQueries(title, { lean: true }),
    `film ${String(title || "").trim()}`,
  ].filter(Boolean);
  const seen = new Set();
  for (const query of queries) {
    if (seen.has(query)) continue;
    seen.add(query);
    const searchUrl = new URL(`https://${safeLang}.wikipedia.org/w/api.php`);
    searchUrl.searchParams.set("action", "query");
    searchUrl.searchParams.set("list", "search");
    searchUrl.searchParams.set("format", "json");
    searchUrl.searchParams.set("origin", "*");
    searchUrl.searchParams.set("srlimit", "8");
    searchUrl.searchParams.set("srsearch", query);
    const search = await fetchJson(searchUrl.toString());
    const pageTitle = pickBestWikipediaSearchResult(title, search?.query?.search);
    if (pageTitle) return pageTitle;
  }
  return null;
}

function wikipediaExtractIsUsable(text?) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length < 60) return false;
  if (/può riferirsi a|may refer to|disambigua/i.test(clean)) return false;
  return true;
}

async function fetchWikipediaExtract(lang?, pageTitle?) {
  const safeLang = String(lang || "it").toLowerCase();
  const safeTitle = String(pageTitle || "").trim();
  if (!safeTitle) return null;
  const extractUrl = new URL(`https://${safeLang}.wikipedia.org/w/api.php`);
  extractUrl.searchParams.set("action", "query");
  extractUrl.searchParams.set("prop", "extracts");
  extractUrl.searchParams.set("exintro", "1");
  extractUrl.searchParams.set("explaintext", "1");
  extractUrl.searchParams.set("redirects", "1");
  extractUrl.searchParams.set("format", "json");
  extractUrl.searchParams.set("origin", "*");
  extractUrl.searchParams.set("titles", safeTitle);
  const extract = await fetchJson(extractUrl.toString());
  const pages = extract?.query?.pages ? Object.values(extract.query.pages) : [];
  const text = pages[0]?.extract || null;
  return wikipediaExtractIsUsable(text) ? text : null;
}

function wikidataLooksLikeMovie(entity?) {
  const text = [
    entity?.description,
    entity?.label,
    entity?.match?.text,
  ].map((value?) => String(value || "").toLowerCase()).join(" ");
  /* movieDescWiki1: escludi soundtrack/franchise/game (prima matchavano per la parola "film") */
  if (/\b(soundtrack|colonna sonora|franchise|serie televisiva|tv series|videogioco|video game|album|song)\b/i.test(text)) {
    return false;
  }
  return /\b(film|movie|pellicola|cinema|anime|animated)\b/i.test(text);
}

async function searchWikidataMoviePageTitle(title?, targetLang?) {
  const ids = [];
  const fallbackIds = [];
  /* movieDesc429Fix1: max 2 search (it+en, solo titolo) — prima erano fino a 12 → 429 */
  for (const lang of ["it", "en"]) {
    for (const query of buildMovieSearchQueries(title, { lean: true })) {
      const searchUrl = new URL("https://www.wikidata.org/w/api.php");
      searchUrl.searchParams.set("action", "wbsearchentities");
      searchUrl.searchParams.set("format", "json");
      searchUrl.searchParams.set("origin", "*");
      searchUrl.searchParams.set("language", lang);
      searchUrl.searchParams.set("uselang", lang);
      searchUrl.searchParams.set("type", "item");
      searchUrl.searchParams.set("limit", "5");
      searchUrl.searchParams.set("search", query);
      const search = await fetchJson(searchUrl.toString());
      for (const entity of search?.search || []) {
        if (!entity?.id) continue;
        if (wikidataLooksLikeMovie(entity)) {
          if (!ids.includes(entity.id)) ids.push(entity.id);
        } else if (!fallbackIds.includes(entity.id)) {
          fallbackIds.push(entity.id);
        }
      }
      if (ids.length >= 3) break;
    }
    if (ids.length >= 3) break;
  }
  const candidateIds = ids.length ? ids : fallbackIds;
  if (!candidateIds.length) return null;

  const entitiesUrl = new URL("https://www.wikidata.org/w/api.php");
  entitiesUrl.searchParams.set("action", "wbgetentities");
  entitiesUrl.searchParams.set("format", "json");
  entitiesUrl.searchParams.set("origin", "*");
  entitiesUrl.searchParams.set("props", "sitelinks");
  entitiesUrl.searchParams.set("sitefilter", "itwiki|enwiki");
  entitiesUrl.searchParams.set("ids", candidateIds.slice(0, 5).join("|"));
  const data = await fetchJson(entitiesUrl.toString());
  const site = `${String(targetLang || "it").toLowerCase()}wiki`;
  for (const id of candidateIds) {
    const titleForLang = data?.entities?.[id]?.sitelinks?.[site]?.title;
    if (titleForLang && !wikipediaPageLooksLikeMovieNoise(titleForLang)) return titleForLang;
  }
  return null;
}

async function translateEnglishToItalian(text?) {
  const clean = truncateDescription(text, 900);
  if (!clean) return null;
  const url = new URL("https://api.mymemory.translated.net/get");
  url.searchParams.set("q", clean);
  url.searchParams.set("langpair", "en|it");
  const data = await fetchJson(url.toString());
  const translated = String(data?.responseData?.translatedText || "").trim();
  if (!translated || translated.toLowerCase() === clean.toLowerCase()) return null;
  return truncateDescription(translated);
}

const movieDescriptionCache = new Map();

async function fetchItalianMovieDescription(title?) {
  const rawTitle = String(title || "").trim();
  if (!rawTitle) return FALLBACK_MOVIE_DESCRIPTION;
  const cacheKey = rawTitle.toLowerCase();
  if (movieDescriptionCache.has(cacheKey)) return movieDescriptionCache.get(cacheKey);

  /* movieDesc429Fix1: Wikipedia IT (1–2 req) → extract; Wikidata solo se serve.
     Prima: fino a ~12+ search Wikidata/Wiki in loop → HTTP 429 → fallback sempre. */
  const italianPageTitle = await searchWikipediaPageTitle("it", rawTitle);
  const italianDescription = italianPageTitle ? await fetchWikipediaExtract("it", italianPageTitle) : null;
  if (italianDescription) {
    const out = truncateDescription(italianDescription);
    movieDescriptionCache.set(cacheKey, out);
    return out;
  }

  const viaWikidataIt = await searchWikidataMoviePageTitle(rawTitle, "it");
  if (viaWikidataIt && viaWikidataIt !== italianPageTitle) {
    const viaWdDesc = await fetchWikipediaExtract("it", viaWikidataIt);
    if (viaWdDesc) {
      const out = truncateDescription(viaWdDesc);
      movieDescriptionCache.set(cacheKey, out);
      return out;
    }
  }

  const englishPageTitle = await searchWikipediaPageTitle("en", rawTitle);
  const englishDescription = englishPageTitle ? await fetchWikipediaExtract("en", englishPageTitle) : null;
  if (englishDescription) {
    const translatedDescription = await translateEnglishToItalian(englishDescription);
    const out =
      translatedDescription && wikipediaExtractIsUsable(translatedDescription)
        ? translatedDescription
        : truncateDescription(englishDescription);
    movieDescriptionCache.set(cacheKey, out);
    return out;
  }

  try {
    global.logger?.warn?.("[movieNight] description fallback for title:", rawTitle);
  } catch (_) {}
  return FALLBACK_MOVIE_DESCRIPTION;
}

/* movieNightProposalTitleSmart1: titolo annuncio da Wikipedia/Wikidata, non dal messaggio grezzo */
async function resolveCanonicalMovieTitle(rawTitle?) {
  const extracted = extractMovieNightProposalTitle(rawTitle) || String(rawTitle || "").trim();
  if (!extracted) return "";
  try {
    /* movieDesc429Fix1: Wikipedia prima (meno roundtrip); evita 429 prima della trama */
    const italianPageTitle =
      (await searchWikipediaPageTitle("it", extracted)) ||
      (await searchWikidataMoviePageTitle(extracted, "it"));
    if (italianPageTitle) return stripMovieTitleDecorations(italianPageTitle) || extracted;
    const englishPageTitle =
      (await searchWikipediaPageTitle("en", extracted)) ||
      (await searchWikidataMoviePageTitle(extracted, "en"));
    if (englishPageTitle) return stripMovieTitleDecorations(englishPageTitle) || extracted;
  } catch (err) {
    try {
      global.logger?.warn?.("[MOVIE NIGHT] canonicalize title failed:", err?.message || err);
    } catch (_) {}
  }
  return extracted;
}

export = { isFallbackMovieDescription, fetchItalianMovieDescription, resolveCanonicalMovieTitle };
