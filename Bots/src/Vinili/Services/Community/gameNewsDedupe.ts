/** Notizie giochi: notizie doppie o vecchie. */
const { currentEaFcEdition, extractYearsFromText, extractFcEditions } = require("./gameNewsCatalog") as typeof import("./gameNewsCatalog");

const BLOCKED_NEWS_HOST_RE =
  /\b(playground\.ru|kanobu\.ru|stopgame\.ru|cyber\.sports\.ru|championat\.com|dtf\.ru|vc\.ru|vk\.com|yandex\.ru|mail\.ru|rutube\.ru)\b/i;

const JUNK_TITLE_RE =
  /\b(gameplay|walkthrough|trailer reaction|consigli|tips?|guide|guida|how to|come (si |fare|diventare)|ouendan|nintendo\s*ds|cold\s*war|black\s*ops\s*cold|modern\s*warfare\s*2019|warzone\s*caldera|\bmeme\b|sfavorito|reaction)\b/i;
const UPDATEISH_RE =
  /\b(update|patch|snapshot|release|stagione|season|title\s*update|manutenzione|maintenance|hotfix|changelog|notes|aggiornamento|versione|version|brawl\s*talk|mid[- ]?season|content\s*update|novit[aà]|disponibile|arriva|ritorna|returns|event(?:o)?|collab|crossover|launch|lancio|trailer)\b/i;

function isStaleOrJunkItem(item?, maxAgeMs?, nowMs = Date.now()) {
  const title = String(item?.title || "");
  const summary = String(item?.summary || "");
  const blob = `${title} ${summary}`;
  const sourceKind = String(item?.sourceType || item?.id || "");
  const currentYear = new Date(nowMs).getFullYear();
  const isGoogle = String(item?.sourceType || "") === "google_news" || /:gnews:/i.test(sourceKind);

  if (JUNK_TITLE_RE.test(blob)) return { reject: true, reason: "junk" };
  if (hasDisallowedScript(blob)) return { reject: true, reason: "foreign-script" };
  if (BLOCKED_NEWS_HOST_RE.test(String(item?.url || "")) || BLOCKED_NEWS_HOST_RE.test(blob)) {
    return { reject: true, reason: "blocked-host" };
  }
  if (isGoogle && !UPDATEISH_RE.test(blob)) return { reject: true, reason: "not-update" };

  const years = extractYearsFromText(blob);
  if (years.some((y?) => y <= currentYear - 2)) {
    return { reject: true, reason: "old-year" };
  }

  /* Snapshot Minecraft tipo 24w03a → anno 2024 */
  const snap = title.match(/\b(\d{2})w\d{2}[a-z]?\b/i);
  if (snap) {
    const snapYear = 2000 + Number(snap[1]);
    if (snapYear < currentYear) return { reject: true, reason: "old-snapshot" };
  }
  if (item.gameKey === "minecraft" && /\b1\.20(\.|$|\s)/i.test(title) && currentYear >= 2025) {
    return { reject: true, reason: "old-mc-version" };
  }

  if (item.gameKey === "fifa") {
    const currentFc = currentEaFcEdition(new Date(nowMs));
    const editions = extractFcEditions(blob);
    if (editions.some((n?) => n < currentFc)) {
      return { reject: true, reason: "old-fc-edition" };
    }
  }

  const publishedMs = item?.publishedAt ? Date.parse(item.publishedAt) : NaN;
  const hasDate = Number.isFinite(publishedMs);
  if (hasDate) {
    if (publishedMs < nowMs - maxAgeMs) return { reject: true, reason: "too-old" };
    if (publishedMs > nowMs + 2 * 24 * 60 * 60 * 1000) return { reject: true, reason: "future" };
  } else if (isGoogle) {
    /* Google senza data affidabile = spesso riciclo vecchio: skip */
    return { reject: true, reason: "gnews-no-date" };
  } else if (String(item?.sourceType || "") === "brawlstars_blog_html") {
    /* blog senza data: solo release-notes / update-like */
    const url = String(item?.url || "");
    if (!/release-notes/i.test(url) && !UPDATEISH_RE.test(blob)) {
      return { reject: true, reason: "brawl-no-date-soft" };
    }
  }

  return { reject: false };
}

function hasDisallowedScript(text?) {
  /* cirillico / arabo / CJK / hangul — niente articoli russi tipo PlayGround.ru */
  return /[\u0400-\u04FF\u0500-\u052F\u2DE0-\u2DFF\uA640-\uA69F]/.test(String(text || ""))
    || /[\u0600-\u06FF]/.test(String(text || ""))
    || /[\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/.test(String(text || ""));
}

function normComparable(text?) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

/** Host ufficiali publisher / store — preferiti rispetto a aggregatori e siti terzi. */
const OFFICIAL_NEWS_HOST_RE =
  /\b(steampowered\.com|steamcommunity\.com|ea\.com|eaassets\.com|easports\.com|minecraft\.net|mojang\.com|fortnite\.com|epicgames\.com|leagueoflegends\.com|playvalorant\.com|riotgames\.com|roblox\.com|rockstargames\.com|callofduty\.com|activision\.com|psyoni?x\.com|rocketleague\.com|innersloth\.com|osu\.ppy\.sh|supercell\.com|blog\.brawlstars\.com|blizzard\.com|playoverwatch\.com|ubisoft\.com)\b/i;

const SOURCE_OFFICIAL_BASE = {
  mojang_java_patch: 100,
  fortnite_blog: 95,
  brawlstars_blog_html: 95,
  osu_news_json: 95,
  osu_news_html: 90,
  fortnite_api: 90,
  lol_ddragon: 88,
  valorant_api_version: 88,
  steam: 80,
  rss: 72,
  google_news: 12,
};

const STORY_STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "news", "novita", "novità", "disponibile", "available",
  "update", "aggiornamento", "patch", "notes", "note", "di", "la", "il", "lo", "le", "gli",
  "of", "a", "an", "ea", "sports", "fc", "new", "nuovo", "nuova", "arriva", "riceve",
  "title", "version", "versione", "release", "now", "live", "out", "via", "trailer",
  /* gameNewsStoryDedupe2: lead-in clickbait / filler (stesso evento, titoli diversi) */
  "ora", "ufficiale", "ufficialmente", "confermato", "confermata", "breaking", "exclusive",
  "finally", "finalmente", "ecco", "svelato", "svelata", "annunciato", "annunciata",
  "tema", "tematica", "collaboration", "collaborazione", "crossover", "event", "evento",
  "arrivo", "incoming", "comes", "coming", "su", "nel", "nella", "dei", "delle", "del",
]);

function extractVersionTokens(text?) {
  const out = new Set();
  const s = String(text || "");
  for (const m of s.matchAll(/\b(\d{1,2}\.\d{1,2}(?:\.\d{1,3}){0,2})\b/g)) {
    out.add(`v:${m[1]}`);
  }
  for (const m of s.matchAll(/\b(\d{2})w\d{2}[a-z]?\b/gi)) {
    out.add(`snap:${String(m[0]).toLowerCase()}`);
  }
  for (const m of s.matchAll(/\b(?:season|stagione)\s*(\d{1,3})\b/gi)) {
    out.add(`szn:${m[1]}`);
  }
  for (const m of s.matchAll(/\b(?:chapter|capitolo)\s*(\d{1,3})\b/gi)) {
    out.add(`ch:${m[1]}`);
  }
  /* solo interi tipo "Title Update 12", non il "1" di 1.0.1 */
  for (const m of s.matchAll(/\btitle\s*update\s*(\d+)(?!\.\d)/gi)) {
    out.add(`tu:${m[1]}`);
  }
  return [...out];
}

function titleStoryTokens(title?) {
  return String(title || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t?) => t.length >= 3 && !STORY_STOP_WORDS.has(t));
}

/** Token “nucleo” storia: ordinati, senza clickbait in testa al titolo. */
function storyCoreTokens(title?) {
  const raw = titleStoryTokens(stripSourceSuffix(title));
  const uniq = [...new Set(raw)];
  uniq.sort();
  return uniq;
}

function tokenJaccard(a?, b?) {
  if (!a.length || !b.length) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter += 1;
  const union = sa.size + sb.size - inter;
  return union ? inter / union : 0;
}

function tokenOverlapCount(a?, b?) {
  if (!a.length || !b.length) return 0;
  const sb = new Set(b);
  let n = 0;
  for (const t of new Set(a)) if (sb.has(t)) n += 1;
  return n;
}

/** Chiave storia per anti-doppio (stessa patch da Steam + Google → 1 sola). */
function storyFingerprint(item?) {
  const gameKey = String(item?.gameKey || "x").toLowerCase();
  const title = stripSourceSuffix(item?.title || "");
  const allVers = extractVersionTokens(`${title} ${item?.summary || ""}`);
  /* preferisci versione dotted/snapshot: allinea "Title Update 1.0.1" e "patch 1.0.1" */
  const dotted = allVers.filter((v?: any) => v.startsWith("v:") || v.startsWith("snap:"));
  const vers = dotted.length ? dotted : allVers;
  if (vers.length) return `${gameKey}|${vers.sort().join(",")}`;
  /* gameNewsStoryDedupe2: token ordinati (non i primi 7 in ordine titolo) —
     "Ora è ufficiale: FNAF arriva su Fortnite" ≡ "FNAF arriva a Fortnite" */
  const tokens = storyCoreTokens(title).slice(0, 8);
  return `${gameKey}|t:${tokens.join("-") || normComparable(title).slice(0, 48)}`;
}

function storyRecord(item?, at = Date.now()) {
  return {
    gameKey: String(item?.gameKey || "").toLowerCase(),
    title: stripSourceSuffix(item?.title || "").slice(0, 220),
    summary: String(item?.summary || "").slice(0, 280),
    fp: storyFingerprint(item),
    at: Number(at) || Date.now(),
  };
}

function rememberStory(state?, item?, at = Date.now()) {
  if (!state || !item) return;
  const rec = storyRecord(item, at);
  const list = Array.isArray(state.recentStories) ? state.recentStories.slice() : [];
  const filtered = list.filter((s?) => s && s.fp !== rec.fp);
  filtered.unshift(rec);
  state.recentStories = filtered.slice(0, 120);
  state.seen[`story:${rec.fp}`] = Number(at) || Date.now();
}

function matchesRecentStory(state?, item?) {
  if (!state || !item) return false;
  const recent = Array.isArray(state.recentStories) ? state.recentStories : [];
  for (const s of recent) {
    if (!s) continue;
    if (isSameNewsStory(s, item)) return true;
  }
  return false;
}

function sourceOfficialRank(item?) {
  const t = String(item?.sourceType || "");
  let rank = SOURCE_OFFICIAL_BASE[t];
  if (!Number.isFinite(rank)) rank = 40;
  const url = String(item?.url || "");
  try {
    const host = new URL(url).hostname.replace(/^www\./i, "");
    if (OFFICIAL_NEWS_HOST_RE.test(host)) rank += 28;
    if (/news\.google\.com$/i.test(host)) rank -= 25;
  } catch (_) {
    if (OFFICIAL_NEWS_HOST_RE.test(url)) rank += 20;
  }
  if (item?.importance === "major") rank += 3;
  return rank;
}

function hasVersionFingerprint(fp?) {
  return /\|(?:v|snap|tu|szn|ch):/.test(String(fp || ""));
}

function isSameNewsStory(a?, b?) {
  if (!a || !b) return false;
  if (String(a.gameKey || "") !== String(b.gameKey || "")) return false;
  const fa = storyFingerprint(a);
  const fb = storyFingerprint(b);
  if (fa && fa === fb) return true;
  const va = new Set(extractVersionTokens(`${a.title || ""} ${a.summary || ""}`).filter((x?: any) => x.startsWith("v:") || x.startsWith("snap:")));
  const vb = new Set(extractVersionTokens(`${b.title || ""} ${b.summary || ""}`).filter((x?: any) => x.startsWith("v:") || x.startsWith("snap:")));
  if ([...va].some((x?) => vb.has(x))) return true;
  /* versioni esplicite diverse → storie diverse (no merge per jaccard) */
  if (hasVersionFingerprint(fa) && hasVersionFingerprint(fb) && fa !== fb) return false;
  const ta = storyCoreTokens(a.title);
  const tb = storyCoreTokens(b.title);
  const overlap = tokenOverlapCount(ta, tb);
  const jac = tokenJaccard(ta, tb);
  /* gameNewsStoryDedupe2: ≥3 token nucleo in comune (es. five/nights/freddy/fortnite)
     anche se un titolo ha filler extra e jaccard scende. */
  if (overlap >= 3) return true;
  if (overlap >= 2 && jac >= 0.4) return true;
  return jac >= 0.5;
}

/**
 * Una sola notizia per storia; tiene la fonte più ufficiale.
 * @returns {{ kept: object[], discarded: object[] }}
 */
function dedupePreferOfficial(items?) {
  const list = Array.isArray(items) ? [...items] : [];
  list.sort((a?, b?) => {
    const ra = sourceOfficialRank(a);
    const rb = sourceOfficialRank(b);
    if (rb !== ra) return rb - ra;
    const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    return tb - ta;
  });
  const kept = [];
  const discarded = [];
  for (const item of list) {
    const dupOf = kept.find((k?) => isSameNewsStory(k, item));
    if (dupOf) {
      discarded.push(item);
      continue;
    }
    kept.push(item);
  }
  kept.sort((a?, b?) => {
    const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    if (tb !== ta) return tb - ta;
    const maj = (x?) => (x.importance === "major" ? 1 : 0);
    if (maj(b) !== maj(a)) return maj(b) - maj(a);
    return sourceOfficialRank(b) - sourceOfficialRank(a);
  });
  return { kept, discarded };
}

function stripSourceSuffix(text?) {
  return String(text || "")
    .replace(/\s*[-–|]\s*[A-Za-z0-9][\w .]{1,40}$/u, "")
    .replace(/\s+(?:games\.gg|everyeye\.it|multiplayer\.it|spaziogames|tomshw\.it|ign italia|smartworld|icrewplay|playground\.ru)\s*$/i, "")
    .trim();
}

/** True se body ≈ titolo (anche con piccole differenze tipo nel/in). */
function isNearTitleDuplicate(title?, body?) {
  const t = stripSourceSuffix(String(title || "").replace(/\s+/g, " ").trim());
  const b = stripSourceSuffix(String(body || "").replace(/\s+/g, " ").trim());
  if (!b) return true;
  const nt = normComparable(t);
  const nb = normComparable(b);
  if (!nb) return true;
  if (nb === nt) return true;
  if (nt && (nb.startsWith(nt) || nt.startsWith(nb))) return true;
  if (nt.length >= 24 && nb.length >= 24) {
    const shorter = nt.length <= nb.length ? nt : nb;
    const longer = nt.length <= nb.length ? nb : nt;
    if (longer.includes(shorter) && longer.length - shorter.length < 36) return true;
  }
  return tokenJaccard(titleStoryTokens(t), titleStoryTokens(b)) >= 0.72;
}

export = { BLOCKED_NEWS_HOST_RE, JUNK_TITLE_RE, isStaleOrJunkItem, hasDisallowedScript, normComparable, storyCoreTokens, storyFingerprint, rememberStory, matchesRecentStory, sourceOfficialRank, isSameNewsStory, dedupePreferOfficial, stripSourceSuffix, isNearTitleDuplicate };
