/** Notizie giochi: fonti (Steam, Google News, Fortnite, LoL, Minecraft, Brawl Stars, Valorant, osu!). */
const { BLOCKED_NEWS_HOST_RE, hasDisallowedScript } = require("./gameNewsDedupe") as typeof import("./gameNewsDedupe");
const { stripHtml, decodeXml, classifyImportance } = require("./gameNewsText") as typeof import("./gameNewsText");
const { isTransientHttpError, isBareGoogleNewsHome, httpGet } = require("./gameNewsArticles") as typeof import("./gameNewsArticles");

const SOURCE_FAIL_LOG_COOLDOWN_MS = 15 * 60 * 1000;
const lastSourceFailLogAt = new Map();

function warnSourceFailThrottled(source?, detail?, transient?) {
  const key = `${source?.type || "?"}|${source?.url || source?.appId || source?.query || ""}`;
  const now = Date.now();
  const last = Number(lastSourceFailLogAt.get(key) || 0);
  if (now - last < SOURCE_FAIL_LOG_COOLDOWN_MS) return;
  lastSourceFailLogAt.set(key, now);
  const msg = `[GAME NEWS] source fail ${source.type}${source.url ? ` ${source.url}` : source.appId ? ` app:${source.appId}` : source.query ? ` q:${source.query}` : ""} → ${detail}`;
  if (transient) global.logger?.warn?.(msg);
  else global.logger?.error?.(msg);
}
const ARTICLE_SUMMARY_MAX = 1600;

function parseRssItems(xml?, limit = 8) {
  const raw = String(xml || "");
  const items = [];
  const blocks = raw.match(/<item[\s\S]*?<\/item>|<entry[\s\S]*?<\/entry>/gi) || [];
  for (const block of blocks.slice(0, limit)) {
    const title = decodeXml(
      (block.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "",
    );
    const link = decodeXml(
      (block.match(/<link[^>]*href=["']([^"']+)["']/i) || [])[1] ||
        (block.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1] ||
        "",
    ).replace(/&amp;/gi, "&");
    const guid = decodeXml(
      (block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i) || [])[1] ||
        (block.match(/<id[^>]*>([\s\S]*?)<\/id>/i) || [])[1] ||
        "",
    ).replace(/&amp;/gi, "&");
    const desc = stripHtml(
      decodeXml(
        (block.match(/<content:encoded[^>]*>([\s\S]*?)<\/content:encoded>/i) || [])[1] ||
          (block.match(/<content[^>]*type=["']html["'][^>]*>([\s\S]*?)<\/content>/i) || [])[1] ||
          (block.match(/<description[^>]*>([\s\S]*?)<\/description>/i) || [])[1] ||
          (block.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i) || [])[1] ||
          (block.match(/<content[^>]*>([\s\S]*?)<\/content>/i) || [])[1] ||
          "",
      ),
    );
    const pub =
      (block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) || [])[1] ||
      (block.match(/<published[^>]*>([\s\S]*?)<\/published>/i) || [])[1] ||
      (block.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i) || [])[1] ||
      "";
    if (!title && !link) continue;
    /* evita link inutili tipo https://news.google.com/ (channel/home) */
    let articleUrl = link || "";
    if (isBareGoogleNewsHome(articleUrl)) articleUrl = "";
    if (!articleUrl && guid && !isBareGoogleNewsHome(guid) && /articles\//i.test(guid)) {
      articleUrl = guid;
    }
    if (!articleUrl && !title) continue;
    items.push({
      id: String(guid || link || title).slice(0, 180),
      title: title || "Novità",
      url: articleUrl,
      summary: desc.slice(0, ARTICLE_SUMMARY_MAX),
      publishedAt: pub ? new Date(pub).toISOString() : null,
    });
  }
  return items;
}

async function fetchSteamNews(appId?, count = 8, opts: Record<string, any> = {}) {
  const url = `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${encodeURIComponent(appId)}&count=${count}&maxlength=1200&format=json`;
  const data = await httpGet(url);
  const news = data?.appnews?.newsitems;
  if (!Array.isArray(news)) return [];
  return news
    .filter((n?) => {
      const label = String(n.feedlabel || "").toLowerCase();
      const title = String(n.title || "");
      if (/workshop/.test(label)) return false;
      if (
        /\b(workshop|i made|mod pack|character pack|reskin|my greatest|challenge yet|random teleports|hot dog vendors|ufo sightings)\b/i.test(
          title,
        )
      ) {
        return false;
      }
      if (opts.officialOnly) {
        if (/community/.test(label) && !/product update|news/i.test(label)) return false;
        if (!/\b(gta\s*online|title update|gtav|gta\s*v|rockstar|patch|update)\b/i.test(title)) return false;
      }
      return true;
    })
    .map((n?) => ({
      id: `steam:${appId}:${n.gid || n.url || n.title}`,
      title: String(n.title || "Novità Steam").trim(),
      url: String(n.url || "").trim(),
      summary: stripHtml(n.contents || "").slice(0, ARTICLE_SUMMARY_MAX),
      publishedAt: n.date ? new Date(Number(n.date) * 1000).toISOString() : null,
    }));
}

async function fetchGoogleNews(query?) {
  const q = String(query || "").trim();
  if (!q) return [];
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=it&gl=IT&ceid=IT:it`;
  const xml = await httpGet(url, { responseType: "text", transformResponse: [(d?) => d] });
  return parseRssItems(typeof xml === "string" ? xml : String(xml || ""), 8)
    .filter((item?) => {
      const blob = `${item.title || ""} ${item.summary || ""} ${item.url || ""}`;
      if (hasDisallowedScript(blob)) return false;
      if (BLOCKED_NEWS_HOST_RE.test(blob)) return false;
      return true;
    })
    .slice(0, 6)
    .map((item?) => ({
      ...item,
      id: `gnews:${item.id}`,
    }));
}

async function fetchFortniteApiNews() {
  /* /v2/news a volte 404 intermittente; fallback BR-only */
  let data = null;
  try {
    data = await httpGet("https://fortnite-api.com/v2/news");
  } catch (err) {
    const status = Number(err?.response?.status || 0);
    if (status === 404 || isTransientHttpError(err)) {
      data = await httpGet("https://fortnite-api.com/v2/news/br");
    } else {
      throw err;
    }
  }
  const root = data?.data;
  const br = root?.br || root;
  const list = Array.isArray(br?.motds) ? br.motds : Array.isArray(br) ? br : [];
  return list.slice(0, 8).map((m?, i?) => ({
    id: `fortnite-api:${m.id || m.title || i}`,
    title: String(m.title || "Novità Fortnite").trim(),
    url: "https://www.fortnite.com/news",
    summary: stripHtml(m.body || m.tabTitle || "").slice(0, ARTICLE_SUMMARY_MAX),
    publishedAt: null,
  }));
}

async function fetchLolVersionsAsPatchHint() {
  /* unofficial ma stabile: nuova versione ddragon ≈ patch LoL */
  const versions = await httpGet("https://ddragon.leagueoflegends.com/api/versions.json");
  if (!Array.isArray(versions) || !versions.length) return [];
  const latest = String(versions[0] || "").trim();
  if (!/^\d+\.\d+/.test(latest)) return [];
  const patch = latest.split(".").slice(0, 2).join(".");
  return [
    {
      id: `lol-ddragon:${patch}`,
      title: `Patch Notes ${patch}`,
      url: `https://www.leagueoflegends.com/it-it/news/game-updates/patch-${patch.replace(".", "-")}-notes/`,
      summary: `È disponibile la patch ${patch} di League of Legends.`,
      publishedAt: null,
    },
  ];
}

async function fetchMojangJavaPatch() {
  const data = await httpGet("https://launchercontent.mojang.com/javaPatchNotes.json");
  const entries = Array.isArray(data?.entries) ? data.entries : Array.isArray(data) ? data : [];
  /* solo le 2 più recenti — il JSON Mojang tiene storico senza date utili */
  return entries.slice(0, 2).map((e?, i?) => {
    const ver = String(e?.version || e?.title || `patch-${i}`).trim();
    const title = String(e?.title || `Minecraft ${ver}`).trim();
    const body = stripHtml(e?.body || e?.content || e?.shortText || "").slice(0, ARTICLE_SUMMARY_MAX);
    return {
      id: `mojang-java:${ver}:${title}`.slice(0, 180),
      title,
      url: String(e?.url || `https://www.minecraft.net/en-us/article/${encodeURIComponent(ver)}`).trim(),
      summary: body,
      publishedAt: e?.date ? new Date(e.date).toISOString() : null,
    };
  });
}

async function fetchFortniteBlog(locale = "it") {
  const url = `https://www.fortnite.com/api/blog/getPosts?category=&locale=${encodeURIComponent(locale)}&offset=0&postsPerPage=6`;
  const data = await httpGet(url);
  const posts = Array.isArray(data?.blogList) ? data.blogList : Array.isArray(data) ? data : [];
  return posts.slice(0, 6).map((p?) => {
    const slug = String(p?.slug || p?._id || p?.title || "").trim();
    const title = String(p?.title || "Novità Fortnite").trim();
    const link = p?.link || (slug ? `https://www.fortnite.com/news/${slug}` : "https://www.fortnite.com/news");
    return {
      id: `fortnite:${locale}:${slug || title}`.slice(0, 180),
      title,
      url: String(link).trim(),
      summary: stripHtml(p?.short || p?.content || p?.metaTags?.description || "").slice(0, ARTICLE_SUMMARY_MAX),
      publishedAt: p?.date || p?.lastModified || null,
    };
  });
}

async function fetchFromSource(source?) {
  try {
    let items = [];
    if (source.type === "steam") {
      items = await fetchSteamNews(source.appId, 8, { officialOnly: source.officialOnly === true });
    } else if (source.type === "mojang_java_patch") {
      items = await fetchMojangJavaPatch();
    } else if (source.type === "fortnite_blog") {
      items = await fetchFortniteBlog(source.locale || "it");
    } else if (source.type === "fortnite_api") {
      items = await fetchFortniteApiNews();
    } else if (source.type === "lol_ddragon") {
      items = await fetchLolVersionsAsPatchHint();
    } else if (source.type === "valorant_api_version") {
      items = await fetchValorantVersionHint();
    } else if (source.type === "osu_news_html" || source.type === "osu_news_json") {
      items = await fetchOsuNewsJson();
    } else if (source.type === "brawlstars_blog_html") {
      items = await fetchBrawlStarsBlogHtml();
    } else if (source.type === "google_news") {
      items = await fetchGoogleNews(source.query);
    } else if (source.type === "rss") {
      const xml = await httpGet(source.url, { responseType: "text", transformResponse: [(d?) => d] });
      items = parseRssItems(typeof xml === "string" ? xml : String(xml || ""), 8);
    }
    return (items || []).map((item?) => ({ ...item, sourceType: source.type }));
  } catch (err) {
    const status = Number(err?.response?.status || 0);
    /* 429/403/404 tipici su feed terziari flaky: warn soft, no error spam */
    if (status === 429 || status === 403 || status === 404) {
      warnSourceFailThrottled(source, `HTTP ${status}`, true);
      return [];
    }
    const detail = status
      ? `HTTP ${status}`
      : err?.code || err?.message || String(err);
    warnSourceFailThrottled(source, detail, isTransientHttpError(err) || !status);
  }
  return [];
}

function titleFromBrawlPath(pathname?) {
  const parts = String(pathname || "")
    .replace(/\/+$/, "")
    .split("/")
    .filter(Boolean);
  const slug = parts[parts.length - 1] || "";
  if (!slug || slug === "blog" || /^page-\d+$/i.test(slug) || /^\d+$/.test(slug)) return "";
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c?) => c.toUpperCase())
    .trim();
}

function isBrawlArticlePath(pathname?) {
  return /\/en\/games\/brawlstars\/blog\/(?:release-notes|community|esports|game|news|creators)\/[a-z0-9][a-z0-9-]+\/?$/i.test(
    String(pathname || ""),
  );
}

async function fetchBrawlStarsBlogHtml() {
  const pageUrls = [
    "https://supercell.com/en/games/brawlstars/blog/",
    "https://blog.brawlstars.com/",
  ];
  const seen = new Set();
  const items = [];

  for (const pageUrl of pageUrls) {
    if (items.length >= 8) break;
    let raw = "";
    try {
      raw = String(
        await httpGet(pageUrl, {
          responseType: "text",
          transformResponse: [(d?) => d],
          headers: { Accept: "text/html" },
        }) || "",
      );
    } catch (_) {
      continue;
    }

    const pathRe =
      /(?:href|canonical)="((?:https:\/\/(?:supercell\.com|blog\.brawlstars\.com))?\/en\/games\/brawlstars\/blog\/[^"#?]+)"/gi;
    let m;
    while ((m = pathRe.exec(raw)) && items.length < 8) {
      let link = m[1].split("?")[0].replace(/\/+$/, "") + "/";
      if (link.startsWith("/")) link = `https://supercell.com${link}`;
      let pathname = "/";
      try {
        pathname = new URL(link).pathname;
      } catch (_) {
        continue;
      }
      if (!isBrawlArticlePath(pathname) || seen.has(link)) continue;
      const title = titleFromBrawlPath(pathname);
      if (!title || title.length < 8) continue;
      if (/^(Türkçe|Español|Русский|Deutsch|Français|Português|Italiano|日本語|한국어|中文)/i.test(title)) {
        continue;
      }
      seen.add(link);
      items.push({
        id: `brawlstars:${pathname}`.slice(0, 180),
        title,
        url: link,
        summary: "",
        publishedAt: null,
      });
    }
  }

  /* preferisci release-notes in cima */
  items.sort((a?, b?) => {
    const score = (u?) => (/release-notes/i.test(u.url) ? 0 : /community|game/i.test(u.url) ? 1 : 2);
    return score(a) - score(b);
  });
  return items.slice(0, 6);
}

async function fetchValorantVersionHint() {
  const data = await httpGet("https://valorant-api.com/v1/version");
  const d = data?.data;
  if (!d) return [];
  const ver = String(d.version || d.riotClientVersion || "").trim();
  const build = String(d.buildVersion || d.buildDate || ver).trim();
  if (!ver && !build) return [];
  const id = `valorant-api:${ver || build}`;
  return [
    {
      id,
      title: `Valorant ${ver || build}`,
      url: "https://playvalorant.com/it-it/news/",
      summary: `Nuova versione client Valorant rilevata: ${ver || build}.`,
      publishedAt: d.buildDate ? new Date(d.buildDate).toISOString() : null,
    },
  ];
}

async function fetchOsuNewsJson() {
  /* osu! risponde JSON con Accept: application/json */
  try {
    const data = await httpGet("https://osu.ppy.sh/home/news", {
      headers: { Accept: "application/json" },
    });
    const posts = Array.isArray(data?.news_posts)
      ? data.news_posts
      : Array.isArray(data)
        ? data
        : [];
    if (posts.length) {
      return posts.slice(0, 6).map((n?) => {
        const slug = String(n.slug || "").trim();
        const id = n.id || slug || n.title;
        return {
          id: `osu:${id}`,
          title: String(n.title || "Novità osu!").trim(),
          url: slug
            ? `https://osu.ppy.sh/home/news/${slug}`
            : "https://osu.ppy.sh/home/news",
          summary: stripHtml(n.preview || n.first_image || "").slice(0, ARTICLE_SUMMARY_MAX),
          publishedAt: n.published_at || null,
        };
      });
    }
  } catch (_) {}

  /* fallback HTML / embedded */
  const html = await httpGet("https://osu.ppy.sh/home/news", {
    responseType: "text",
    transformResponse: [(d?) => d],
    headers: { Accept: "text/html" },
  });
  const raw = String(html || "");
  if (raw.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(raw);
      const posts = Array.isArray(parsed?.news_posts) ? parsed.news_posts : [];
      return posts.slice(0, 6).map((n?) => {
        const slug = String(n.slug || "").trim();
        return {
          id: `osu:${n.id || slug || n.title}`,
          title: String(n.title || "Novità osu!").trim(),
          url: slug ? `https://osu.ppy.sh/home/news/${slug}` : "https://osu.ppy.sh/home/news",
          summary: stripHtml(n.preview || "").slice(0, ARTICLE_SUMMARY_MAX),
          publishedAt: n.published_at || null,
        };
      });
    } catch (_) {}
  }
  const items = [];
  const re = /href="(https:\/\/osu\.ppy\.sh\/home\/news\/[^"]+)"[^>]*>\s*<[^>]*>\s*([^<]{8,120})/gi;
  let m;
  while ((m = re.exec(raw)) && items.length < 6) {
    const url = m[1];
    const title = stripHtml(m[2] || "").trim();
    if (!title || !url) continue;
    items.push({ id: `osu:${url}`, title, url, summary: "", publishedAt: null });
  }
  return items;
}

async function collectGameItems(game?) {
  const byId = new Map();
  let sourceOk = 0;
  let sourceEmpty = 0;
  for (const source of game.sources || []) {
    const items = await fetchFromSource(source);
    if (items.length) sourceOk += 1;
    else sourceEmpty += 1;
    for (const item of items) {
      const id = `${game.key}:${item.id}`;
      if (byId.has(id)) continue;
      byId.set(id, {
        ...item,
        id,
        gameKey: game.key,
        gameLabel: game.label,
        emoji: game.emoji,
        roleId: game.roleId,
        color: game.color,
        sourceType: item.sourceType || source.type,
        importance: classifyImportance(item.title, item.summary),
      });
    }
  }
  return [...byId.values()];
}

export = { collectGameItems };
