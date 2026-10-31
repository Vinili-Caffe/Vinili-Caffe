/** Notizie giochi: lettura dell'articolo (pagina, riassunto, link veri di Google News). */
const axios = require("axios") as typeof import("axios").default;
const { hasDisallowedScript, isNearTitleDuplicate } = require("./gameNewsDedupe") as typeof import("./gameNewsDedupe");
const { ARTICLE_BRIEF_MAX, stripHtml, stripLeadingTitleEcho, trimBriefAtSentence, cleanArticleBrief, decodeXml } = require("./gameNewsText") as typeof import("./gameNewsText");

const HTTP_TIMEOUT_MS = 20_000;
const HTTP_RETRIES = 2;

function isTransientHttpError(err?) {
  const code = String(err?.code || err?.cause?.code || err?.message || "");
  return /ECONNABORTED|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|UND_ERR|AbortError|TimeoutError|socket hang up|network/i.test(
    code,
  );
}
const ARTICLE_BRIEF_MIN = 180;
const HTML_FETCH_PROXIES = [
  (u?) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u?) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
  (u?) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
];
/** cache HTML scrape (evita doppio fetch nello stesso post) */
const htmlDocCache = new Map();
const HTML_DOC_CACHE_TTL_MS = 15 * 60 * 1000;

function metaTagContent(html?, key?) {
  const h = String(html || "");
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']+)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${key}["']`,
      "i",
    ),
  ];
  for (const re of patterns) {
    const m = h.match(re);
    if (m && m[1]) return decodeXml(m[1]).replace(/\s+/g, " ").trim();
  }
  return "";
}

function looksLikeCloudflareChallenge(html?) {
  const head = String(html || "").slice(0, 4000);
  return /just a moment|cf-browser-verification|checking your browser|attention required|enable javascript and cookies|security service to protect against malicious bots/i.test(
    head,
  );
}

function looksLikeUsefulHtml(html?) {
  const h = String(html || "");
  if (h.length < 800) return false;
  if (looksLikeCloudflareChallenge(h)) return false;
  if (/<p[\s>]|og:description|articleBody|twitter:description/i.test(h)) return true;
  return h.length > 12000 && /<html/i.test(h);
}

function unwrapProxyPayload(raw?, viaGetJson?) {
  let html = String(raw || "");
  if (viaGetJson) {
    try {
      const j = JSON.parse(html);
      html = String(j?.contents || j?.content || j?.data || "");
    } catch (_) {}
  }
  return html;
}

/**
 * Scarica HTML: diretto, poi proxy anti-CF (allorigins/codetabs) con 1 retry sul primo proxy.
 */
async function fetchHtmlDocument(url?) {
  const target = String(url || "").trim();
  if (!target || !/^https?:\/\//i.test(target)) return "";

  const cached = htmlDocCache.get(target);
  if (cached && Date.now() - cached.at < HTML_DOC_CACHE_TTL_MS) {
    return cached.html || "";
  }

  const browserHeaders = {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Cache-Control": "no-cache",
  };

  let html = "";
  try {
    const direct = String(
      await httpGet(target, {
        responseType: "text",
        transformResponse: [(d?) => d],
        headers: browserHeaders,
        maxRedirects: 5,
        timeout: 8_000,
        validateStatus: (s?) => s >= 200 && s < 500,
      }) || "",
    );
    if (looksLikeUsefulHtml(direct)) html = direct;
  } catch (_) {}

  if (!html) {
    for (let i = 0; i < HTML_FETCH_PROXIES.length; i++) {
      const proxyUrl = HTML_FETCH_PROXIES[i](target);
      const viaGetJson = /allorigins\.win\/get\?/i.test(proxyUrl);
      const attempts = i === 0 ? 2 : 1;
      for (let attempt = 0; attempt < attempts; attempt++) {
        try {
          const raw = String(
            await httpGet(proxyUrl, {
              responseType: "text",
              transformResponse: [(d?) => d],
              headers: {
                Accept: "text/html,application/json,*/*",
                "User-Agent": browserHeaders["User-Agent"],
              },
              maxRedirects: 3,
              timeout: 16_000,
              validateStatus: (s?) => s >= 200 && s < 500,
            }) || "",
          );
          const got = unwrapProxyPayload(raw, viaGetJson);
          if (looksLikeUsefulHtml(got)) {
            html = got;
            break;
          }
        } catch (_) {}
      }
      if (html) break;
    }
  }

  if (htmlDocCache.size > 80) {
    const oldest = [...htmlDocCache.entries()].sort((a?, b?) => a[1].at - b[1].at)[0];
    if (oldest) htmlDocCache.delete(oldest[0]);
  }
  htmlDocCache.set(target, { at: Date.now(), html });
  return html;
}

function extractJsonLdArticleText(html?) {
  const blocks = String(html || "").match(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  ) || [];
  const out = [];
  for (const block of blocks.slice(0, 6)) {
    const raw = block.replace(/^[\s\S]*?>/, "").replace(/<\/script>$/i, "");
    try {
      const data = JSON.parse(raw.trim());
      const nodes = Array.isArray(data) ? data : data?.["@graph"] ? data["@graph"] : [data];
      for (const n of nodes) {
        if (!n || typeof n !== "object") continue;
        const type = String(n["@type"] || "");
        if (!/Article|NewsArticle|BlogPosting|WebPage/i.test(type) && !n.articleBody && !n.description) {
          continue;
        }
        if (n.articleBody) out.push(String(n.articleBody));
        if (n.description) out.push(String(n.description));
      }
    } catch (_) {}
  }
  return stripHtml(out.join(" ")).replace(/\s+/g, " ").trim();
}

function isJunkParagraph(p?) {
  const t = String(p || "");
  if (t.length < 55) return true;
  if (
    /\b(cookie|privacy|newsletter|subscribe|registrati|accetta|advertisement|pubblicit[aà]|segui su|leggi anche|related|all rights reserved|copyright)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  /* menu / chrome siti gaming */
  if (
    /\b(Home Giochi|Guide Notizie Recensioni|Missioni App|GAMES\+|Calendario Giochi|Sblocca con)\b/i.test(t)
  ) {
    return true;
  }
  const linkish = (t.match(/\b(Home|Notizie|Guide|Recensioni|Offerte|Login|Menu)\b/gi) || []).length;
  if (linkish >= 4 && t.length < 280) return true;
  return false;
}

function extractParagraphsFromHtml(html?) {
  let h = String(html || "");
  h = h
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ");

  const buckets = [];
  const articleMatch = h.match(/<article[\s\S]*?<\/article>/i);
  if (articleMatch) buckets.push(articleMatch[0]);
  const mainMatch = h.match(/<main[\s\S]*?<\/main>/i);
  if (mainMatch) buckets.push(mainMatch[0]);
  buckets.push(h);

  const paras = [];
  const seen = new Set();
  for (const chunk of buckets) {
    const re = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let m;
    while ((m = re.exec(chunk)) && paras.length < 18) {
      const p = stripHtml(m[1]).replace(/\s+/g, " ").trim();
      if (isJunkParagraph(p)) continue;
      const key = p.slice(0, 80).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      paras.push(p);
    }
    if (paras.length >= 4) break;
  }
  return paras;
}

/**
 * Scarica la pagina e ricava un pezzo di articolo (meta + paragrafi).
 * @returns {string}
 */
async function fetchArticleExcerpt(url?, title?) {
  const target = String(url || "").trim();
  if (!target || !/^https?:\/\//i.test(target)) return "";
  if (/news\.google\.com/i.test(target)) return "";

  const html = await fetchHtmlDocument(target);
  if (!html || html.length < 200) return "";
  if (hasDisallowedScript(html.slice(0, 4000))) return "";

  const metaBits = [
    metaTagContent(html, "og:description"),
    metaTagContent(html, "twitter:description"),
    metaTagContent(html, "description"),
  ].filter(Boolean);

  const ld = extractJsonLdArticleText(html);
  const paras = extractParagraphsFromHtml(html);

  const candidates = [];
  for (const m of metaBits) {
    const stripped = stripLeadingTitleEcho(title, m);
    if (stripped && !isNearTitleDuplicate(title, stripped) && stripped.length >= 50) {
      candidates.push(stripped);
    } else if (!isNearTitleDuplicate(title, m) && m.length >= 50) {
      candidates.push(m);
    }
  }
  if (ld) {
    const stripped = stripLeadingTitleEcho(title, ld);
    const use = stripped && stripped.length >= 80 ? stripped : ld;
    if (!isNearTitleDuplicate(title, use) && use.length >= 80) candidates.push(use);
  }
  if (paras.length) {
    /* primi paragrafi utili = corpo articolo (non teaser) */
    const joined = paras.slice(0, 8).join(" ");
    if (!isNearTitleDuplicate(title, joined)) candidates.push(joined);
  }

  /* scegli il più lungo (più informazione), poi taglia */
  candidates.sort((a?, b?) => b.length - a.length);
  for (const c of candidates) {
    const cleaned = cleanArticleBrief(title, c);
    if (cleaned && cleaned.length >= ARTICLE_BRIEF_MIN) return cleaned;
    if (c.length >= ARTICLE_BRIEF_MIN && !isNearTitleDuplicate(title, c)) {
      return trimBriefAtSentence(c, ARTICLE_BRIEF_MAX);
    }
  }
  return "";
}

/**
 * Compone il testo dell'articolo: summary RSS se buono, altrimenti fetch pagina.
 */
async function resolveArticleBrief(title?, summary?, articleUrl?) {
  let brief = cleanArticleBrief(title, summary);
  if (brief && brief.length >= ARTICLE_BRIEF_MIN) return brief;
  const fetched = await fetchArticleExcerpt(articleUrl, title);
  if (fetched && fetched.length > (brief || "").length) return fetched;
  return brief || fetched || "";
}

function isBareGoogleNewsHome(url?) {
  try {
    const u = new URL(String(url || "").trim());
    if (!/news\.google\.com$/i.test(u.hostname)) return false;
    const p = (u.pathname || "/").replace(/\/+$/, "") || "/";
    return p === "/" || p === "/home" || p === "/news";
  } catch (_) {
    return /^https?:\/\/news\.google\.com\/?$/i.test(String(url || "").trim());
  }
}

function googleNewsArticleId(url?) {
  try {
    const u = new URL(String(url || "").trim());
    if (!/news\.google\.com$/i.test(u.hostname)) return "";
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && (parts[parts.length - 2] === "articles" || parts[parts.length - 2] === "read")) {
      return String(parts[parts.length - 1] || "").split("?")[0];
    }
  } catch (_) {}
  return "";
}

function isExternalArticleUrl(url?) {
  const s = String(url || "").trim();
  if (!/^https?:\/\//i.test(s)) return false;
  if (/google\.(com|it|news)|gstatic\.com|googleusercontent\.com/i.test(s)) return false;
  if (isBareGoogleNewsHome(s)) return false;
  return true;
}

/** Decode Google News /rss/articles/CBMi… → URL editore (signature + batchexecute). */
async function decodeGoogleNewsArticleUrl(sourceUrl?) {
  const artId = googleNewsArticleId(sourceUrl);
  if (!artId) return "";
  let hl = "it";
  let gl = "IT";
  let ceid = "IT:it";
  try {
    const qs = new URL(String(sourceUrl)).searchParams;
    if (qs.get("hl")) hl = qs.get("hl");
    if (qs.get("gl")) gl = qs.get("gl");
    if (qs.get("ceid")) ceid = qs.get("ceid");
  } catch (_) {}

  const paramsUrl =
    `https://news.google.com/rss/articles/${encodeURIComponent(artId)}` +
    `?hl=${encodeURIComponent(hl)}&gl=${encodeURIComponent(gl)}&ceid=${encodeURIComponent(ceid)}`;

  let html = "";
  try {
    let current = paramsUrl;
    for (let hop = 0; hop < 4; hop += 1) {
      const res = await axios.get(current, {
        timeout: 12000,
        maxRedirects: 0,
        validateStatus: (s?) => (s >= 200 && s < 400) || s === 301 || s === 302 || s === 303 || s === 307 || s === 308,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
        responseType: "text",
        transformResponse: [(d?) => d],
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = String(res.headers?.location || "").trim();
        if (!loc) break;
        const next = loc.startsWith("http") ? loc : new URL(loc, current).href;
        if (!/news\.google\.com/i.test(next)) break;
        current = next;
        continue;
      }
      html = String(res.data || "");
      break;
    }
  } catch (_) {
    return "";
  }

  const sg =
    (html.match(/data-n-a-sg=["']([^"']+)["']/i) || [])[1] ||
    (html.match(/data-n-a-sg=\\"([^\\"]+)\\"/i) || [])[1] ||
    "";
  const ts =
    (html.match(/data-n-a-ts=["']([^"']+)["']/i) || [])[1] ||
    (html.match(/data-n-a-ts=\\"([^\\"]+)\\"/i) || [])[1] ||
    "";
  if (!sg || !ts) return "";

  const inner = [
    "garturlreq",
    [
      ["X", "X", ["X", "X"], null, null, 1, 1, ceid || "IT:it", null, 1, null, null, null, null, null, 0, 1],
      "X",
      "X",
      1,
      [1, 1, 1],
      1,
      1,
      null,
      0,
      0,
      null,
      0,
    ],
    artId,
    /^\d+$/.test(String(ts)) ? Number(ts) : ts,
    sg,
  ];
  const envelopes = [["Fbv4je", JSON.stringify(inner), null, "0"]];
  const body = `f.req=${encodeURIComponent(JSON.stringify([envelopes]))}`;

  try {
    const res = await axios.post(
      "https://news.google.com/_/DotsSplashUi/data/batchexecute?rpcids=Fbv4je",
      body,
      {
        timeout: 15000,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Origin: "https://news.google.com",
          Referer: paramsUrl,
        },
        responseType: "text",
        transformResponse: [(d?) => d],
        validateStatus: (s?) => s >= 200 && s < 500,
      },
    );
    let text = String(res.data || "");
    if (text.includes("\n\n")) text = text.split("\n\n", 2)[1] || text;
    text = text.replace(/^\)\]\}'\s*\n?/, "").trim();
    const rows = JSON.parse(text);
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!Array.isArray(row) || row.length < 3) continue;
      if (!(row[0] === "wrb.fr" || row[1] === "Fbv4je")) continue;
      let payload = row[2];
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch (_) {
          continue;
        }
      }
      if (Array.isArray(payload) && payload[0] === "garturlres" && isExternalArticleUrl(payload[1])) {
        return String(payload[1]).trim();
      }
    }
  } catch (_) {}
  return "";
}

async function resolveArticleUrl(url?) {
  const raw = decodeXml(String(url || "").trim());
  if (!raw) return "";
  /* Mai degradare a homepage Google News */
  if (isBareGoogleNewsHome(raw)) return "";
  if (!/news\.google\.com/i.test(raw)) return raw;

  const decoded = await decodeGoogleNewsArticleUrl(raw);
  if (decoded) return decoded;

  /* fallback: tieni il deep-link /rss/articles/… (meglio della home) */
  if (googleNewsArticleId(raw)) {
    return raw.split("#")[0];
  }
  return "";
}

async function httpGet(url?, opts: Record<string, any> = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt <= HTTP_RETRIES; attempt += 1) {
    try {
      const res = await axios.get(url, {
        timeout: HTTP_TIMEOUT_MS,
        headers: {
          "User-Agent": "ViniliGameNews/1.0 (+https://viniliecaffe.it)",
          Accept: "application/json, application/rss+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.8",
          ...(opts.headers || {}),
        },
        validateStatus: (s?) => s >= 200 && s < 400,
        ...opts,
      });
      return res.data;
    } catch (err) {
      lastErr = err;
      if (!isTransientHttpError(err) || attempt >= HTTP_RETRIES) break;
      await new Promise((r?) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw lastErr;
}

export = { isTransientHttpError, ARTICLE_BRIEF_MIN, fetchArticleExcerpt, resolveArticleBrief, isBareGoogleNewsHome, resolveArticleUrl, httpGet };
