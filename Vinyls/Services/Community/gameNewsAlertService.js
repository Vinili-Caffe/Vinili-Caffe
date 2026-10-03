/**
 * Novità giochi → canale announcement come articolo plain (no embed).
 * Ping ruolo + link completo in fondo. Solo news fresche (no edizioni/anni vecchi).
 */
const axios = require("axios");
const { ChannelType } = require("discord.js");
const IDs = require("../../Utils/Config/ids");
const { getBotState, setBotState } = require("../../Utils/BotState/botStateStore");
const { getClientGuildCached, getGuildChannelCached } = require("../../Utils/Interaction/interactionEntityCache");

const STATE_KEY = "gameNewsAlert.v1";
const MYMEMORY_BASE = "https://api.mymemory.translated.net/get";
const MYMEMORY_MAX = 450;
const DEFAULT_POLL_MS = 20 * 60 * 1000;
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const HTTP_TIMEOUT_MS = 12_000;
const ARTICLE_SUMMARY_MAX = 1600;
const ARTICLE_BRIEF_MAX = 1400;
const ARTICLE_BRIEF_MIN = 180;
const HTML_FETCH_PROXIES = [
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
  (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
];
/** cache HTML scrape (evita doppio fetch nello stesso post) */
const htmlDocCache = new Map();
const HTML_DOC_CACHE_TTL_MS = 15 * 60 * 1000;
const BLOCKED_NEWS_HOST_RE =
  /\b(playground\.ru|kanobu\.ru|stopgame\.ru|cyber\.sports\.ru|championat\.com|dtf\.ru|vc\.ru|vk\.com|yandex\.ru|mail\.ru|rutube\.ru)\b/i;
const loopStarted = new WeakSet();
let pollInFlight = false;

const MAJOR_RE =
  /\b(patch\s*notes?|patch\s*note|major\s*update|season\s*\d+|nuova\s*stagione|stagione\s*\d+|battle\s*pass|capitolo\s*\d+|chapter\s*\d+|mid[- ]?season|aggiornamento\s*importante|version\s*\d+\.\d+|v\d+\.\d+(\.\d+)?|release\s*notes?|full\s*patch|content\s*update|nuovo\s*aggiornamento)\b/i;
const MINOR_RE =
  /\b(hotfix|hot[- ]?fix|bug\s*fix|maintenance|manutenzione|server\s*status|downtime|known\s*issues?|minor\s*update|piccolo\s*fix|bilanciamento|balance\s*patch|emergency\s*fix|snapshot|pre[- ]?release|beta|experimental)\b/i;

/** Catalogo giochi del menu personalizza + fonti ufficiali e non. */
function defaultGamesCatalog() {
  const R = IDs.roles || {};
  return [
    {
      key: "minecraft",
      label: "Minecraft",
      emoji: "⛏️",
      roleId: R.GameMinecraft,
      color: 0x5d9c3f,
      sources: [
        { type: "mojang_java_patch" },
        { type: "google_news", query: "Minecraft Java (update OR patch OR snapshot) when:7d" },
      ],
    },
    {
      key: "lol",
      label: "League of Legends",
      emoji: "⚔️",
      roleId: R.GameLeagueOfLegends,
      color: 0xc89b3c,
      sources: [
        { type: "lol_ddragon" },
        { type: "google_news", query: "League of Legends patch notes when:7d" },
      ],
    },
    {
      key: "fortnite",
      label: "Fortnite",
      emoji: "🪂",
      roleId: R.GameFortnite,
      color: 0x9d4dbb,
      sources: [
        { type: "fortnite_api" },
        { type: "google_news", query: "Fortnite (update OR patch OR stagione OR chapter) when:7d" },
      ],
    },
    {
      key: "roblox",
      label: "Roblox",
      emoji: "🧱",
      roleId: R.GameRoblox,
      color: 0xe2231a,
      sources: [
        { type: "rss", url: "https://blog.roblox.com/feed/" },
        { type: "google_news", query: "Roblox (update OR release notes OR patch) when:7d" },
      ],
    },
    {
      key: "gta",
      label: "Grand Theft Auto",
      emoji: "🚗",
      roleId: R.GameGrandTheftAuto,
      color: 0x6c9e3c,
      sources: [
        { type: "steam", appId: 271590, officialOnly: true },
        { type: "google_news", query: "GTA Online (update OR \"Title Update\" OR Rockstar) when:7d" },
      ],
    },
    {
      key: "cod",
      label: "Call of Duty",
      emoji: "🔫",
      roleId: R.GameCallOfDuty,
      color: 0x4a7c2c,
      sources: [
        { type: "steam", appId: 2933080 },
        { type: "steam", appId: 2519060 },
        { type: "google_news", query: "Call of Duty (patch notes OR update OR Warzone) when:7d" },
      ],
    },
    {
      key: "rocketleague",
      label: "Rocket League",
      emoji: "🚀",
      roleId: R.GameRocketLeague,
      color: 0x0078f2,
      sources: [
        { type: "steam", appId: 252950 },
        { type: "google_news", query: "Rocket League patch notes when:7d" },
      ],
    },
    {
      key: "amongus",
      label: "Among Us",
      emoji: "🕵️",
      roleId: R.GameAmongUs,
      color: 0xc51111,
      sources: [
        { type: "steam", appId: 945360 },
        { type: "google_news", query: "Among Us (update OR patch OR ruolo) when:7d" },
      ],
    },
    {
      key: "osu",
      label: "OSU!",
      emoji: "🎯",
      roleId: R.GameOsu,
      color: 0xff66aa,
      sources: [
        { type: "osu_news_json" },
        { type: "google_news", query: "\"osu!\" (lazer OR \"patch notes\" OR changelog) when:7d" },
      ],
    },
    {
      key: "sims",
      label: "The Sims",
      emoji: "🏠",
      roleId: R.GameTheSims,
      color: 0x7ac143,
      sources: [
        { type: "steam", appId: 1222670 },
        { type: "google_news", query: "The Sims 4 (update OR patch) when:7d" },
      ],
    },
    {
      key: "valorant",
      label: "Valorant",
      emoji: "🔫",
      roleId: R.GameValorant,
      color: 0xff4655,
      sources: [
        { type: "valorant_api_version" },
        { type: "google_news", query: "Valorant patch notes when:7d" },
      ],
    },
    {
      key: "fifa",
      label: "FIFA / EA FC",
      emoji: "⚽",
      roleId: R.GameFifa,
      color: 0x1a1f71,
      /* solo FC 27 (Steam 4080220); edizioni precedenti filtrate anche per titolo */
      sources: [
        { type: "steam", appId: 4080220 },
        {
          type: "google_news",
          query: "(\"EA Sports FC 27\" OR \"EA FC 27\" OR \"FC 27\") (update OR patch OR \"Title Update\") when:7d",
        },
      ],
    },
    {
      key: "brawlstars",
      label: "Brawl Stars",
      emoji: "⭐",
      roleId: R.GameBrawlStars,
      color: 0xf7c948,
      sources: [
        { type: "brawlstars_blog_html" },
        {
          type: "google_news",
          query: "\"Brawl Stars\" (\"brawl talk\" OR update OR maintenance OR patch OR balance) when:7d",
        },
      ],
    },
  ];
}

function resolveConfig(client) {
  const raw = client?.config?.gameNewsAlerts && typeof client.config.gameNewsAlerts === "object"
    ? client.config.gameNewsAlerts
    : {};
  const channelId = String(raw.channelId || IDs.channels?.gameNews || "1553533004591276122").trim();
  const pollIntervalMs = Math.max(
    10 * 60 * 1000,
    Math.min(6 * 60 * 60 * 1000, Number(raw.pollIntervalMs) || DEFAULT_POLL_MS),
  );
  const catalog = defaultGamesCatalog();
  const enabledKeys = Array.isArray(raw.enabledGames) && raw.enabledGames.length
    ? new Set(raw.enabledGames.map((k) => String(k || "").trim().toLowerCase()).filter(Boolean))
    : null;
  const games = catalog
    .filter((g) => !enabledKeys || enabledKeys.has(g.key))
    .map((g) => {
      const override = Array.isArray(raw.games) ? raw.games.find((x) => String(x?.key || "") === g.key) : null;
      return {
        ...g,
        roleId: String(override?.roleId || g.roleId || "").trim(),
        enabled: override?.enabled === false ? false : true,
      };
    })
    .filter((g) => g.enabled && g.roleId);
  const maxAgeMs = Math.max(
    24 * 60 * 60 * 1000,
    Math.min(30 * 24 * 60 * 60 * 1000, Number(raw.maxAgeMs) || DEFAULT_MAX_AGE_MS),
  );
  return {
    enabled: raw.enabled !== false,
    channelId,
    pollIntervalMs,
    maxAgeMs,
    translateToItalian: raw.translateToItalian !== false,
    crosspost: raw.crosspost === true,
    maxPostsPerPoll: Math.max(1, Math.min(8, Number(raw.maxPostsPerPoll) || 3)),
    games,
  };
}

/** EA FC N esce a settembre anno N-1 → a set 2026 è FC 27. */
function currentEaFcEdition(now = new Date()) {
  const y = now.getFullYear() % 100;
  const month = now.getMonth() + 1;
  return month >= 9 ? y + 1 : y;
}

function extractYearsFromText(text) {
  return [...String(text || "").matchAll(/\b(20\d{2})\b/g)].map((m) => Number(m[1]));
}

function extractFcEditions(text) {
  const out = [];
  const re = /\b(?:EA\s*Sports\s*)?(?:FC|FIFA)\s*(\d{2})\b/gi;
  let m;
  while ((m = re.exec(String(text || "")))) {
    const n = Number(m[1]);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

const JUNK_TITLE_RE =
  /\b(gameplay|walkthrough|trailer reaction|consigli|tips?|guide|guida|how to|come (si |fare|diventare)|ouendan|nintendo\s*ds|cold\s*war|black\s*ops\s*cold|modern\s*warfare\s*2019|warzone\s*caldera|\bmeme\b|sfavorito|reaction)\b/i;
const UPDATEISH_RE =
  /\b(update|patch|snapshot|release|stagione|season|title\s*update|manutenzione|maintenance|hotfix|changelog|notes|aggiornamento|versione|version|brawl\s*talk|mid[- ]?season|content\s*update|novit[aà]|disponibile|arriva|ritorna|returns|event(?:o)?|collab|crossover|launch|lancio|trailer)\b/i;

function isStaleOrJunkItem(item, maxAgeMs, nowMs = Date.now()) {
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
  if (years.some((y) => y <= currentYear - 2)) {
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
    if (editions.some((n) => n < currentFc)) {
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

/* Steam news: [img]{STEAM_CLAN_IMAGE}/clanId/hash.png[/img] → CDN (o rimossi dal brief). */
const STEAM_CLAN_IMAGE_BASE = "https://clan.fastly.steamstatic.com/images";

function expandSteamPlaceholders(text) {
  return String(text || "")
    .replace(/\{STEAM_CLAN_IMAGE\}/gi, STEAM_CLAN_IMAGE_BASE)
    .replace(/\{STEAM_CLAN_LOC_IMAGE\}/gi, STEAM_CLAN_IMAGE_BASE);
}

/** Toglie BBCode Steam + URL immagine clan dal testo (articolo plain Discord). */
function stripSteamMarkup(text) {
  let t = expandSteamPlaceholders(text);
  /* [img]...[/img] e varianti con attrs */
  t = t.replace(/\[img[^\]]*\][\s\S]*?\[\/img\]/gi, " ");
  t = t.replace(/\[url=((?:https?:\/\/)[^\]]+)\]([\s\S]*?)\[\/url\]/gi, "$2 $1");
  t = t.replace(/\[url\]((?:https?:\/\/)[^\[]+)\[\/url\]/gi, "$1");
  t = t.replace(
    /\[\/?(?:p|b|i|u|h[1-6]|list|olist|\*|quote|spoiler|code|strike|noparse|previewyoutube|carousel)[^\]]*\]/gi,
    " ",
  );
  /* path/url clan rimasti soli (placeholder non espansi o img già strippati) */
  t = t.replace(/\{STEAM_CLAN_(?:LOC_)?IMAGE\}\/[^\s\[\]<>"']+/gi, " ");
  t = t.replace(
    /https?:\/\/(?:clan\.fastly\.steamstatic\.com\/images|clan\.akamai\.steamstatic\.com\/images|cdn\.cloudflare\.steamstatic\.com\/steamcommunity\/public\/images\/clans|steamcommunity\.com\/economy\/image)\/[^\s\[\]<>"']+/gi,
    " ",
  );
  t = t.replace(/https?:\/\/[^\s\[\]<>"']+\.(?:png|jpe?g|gif|webp|svg)(?:\?[^\s\[\]<>"']*)?/gi, " ");
  return t;
}

function stripHtml(html) {
  return stripSteamMarkup(String(html || ""))
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function hasDisallowedScript(text) {
  /* cirillico / arabo / CJK / hangul — niente articoli russi tipo PlayGround.ru */
  return /[\u0400-\u04FF\u0500-\u052F\u2DE0-\u2DFF\uA640-\uA69F]/.test(String(text || ""))
    || /[\u0600-\u06FF]/.test(String(text || ""))
    || /[\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/.test(String(text || ""));
}

/**
 * Identità gioco: evita ping Fortnite su news Rocket League (e simili).
 * Host ufficiale vince; altrimenti nome gioco nel titolo/summary.
 */
const GAME_IDENTITY = {
  minecraft: {
    nameRe: /\bminecraft\b/i,
    hostRe: /\b(minecraft\.net|mojang\.com)\b/i,
  },
  lol: {
    nameRe: /\b(league\s*of\s*legends|\blol\b|wild\s*rift)\b/i,
    hostRe: /\b(leagueoflegends\.com|riotgames\.com)\b/i,
  },
  fortnite: {
    nameRe: /\bfortnite\b/i,
    hostRe: /\b(fortnite\.com|epicgames\.com)\b/i,
  },
  roblox: {
    nameRe: /\broblox\b/i,
    hostRe: /\broblox\.com\b/i,
  },
  gta: {
    nameRe: /\b(gta\s*(online|v|5|vi|6)|grand\s*theft\s*auto)\b/i,
    hostRe: /\brockstargames\.com\b/i,
  },
  cod: {
    nameRe: /\b(call\s*of\s*duty|\bcod\b|warzone|black\s*ops|modern\s*warfare)\b/i,
    hostRe: /\b(callofduty\.com|activision\.com)\b/i,
  },
  rocketleague: {
    nameRe: /\brocket\s*league\b/i,
    hostRe: /\b(rocketleague\.com|psyoni?x\.com)\b/i,
  },
  amongus: {
    nameRe: /\bamong\s*us\b/i,
    hostRe: /\binnersloth\.com\b/i,
  },
  osu: {
    nameRe: /\bosu!?\b/i,
    hostRe: /\bosu\.ppy\.sh\b/i,
  },
  sims: {
    nameRe: /\b(the\s*sims|sims\s*4)\b/i,
    hostRe: /\b(ea\.com|easports\.com)\b/i,
  },
  valorant: {
    nameRe: /\bvalorant\b/i,
    hostRe: /\b(playvalorant\.com|riotgames\.com)\b/i,
  },
  fifa: {
    nameRe: /\b(ea\s*sports\s*fc|ea\s*fc|\bfifa\b|\bfc\s*2\d\b)\b/i,
    hostRe: /\b(ea\.com|easports\.com)\b/i,
  },
  brawlstars: {
    nameRe: /\bbrawl\s*stars\b/i,
    hostRe: /\b(supercell\.com|brawlstars\.com)\b/i,
  },
};

function newsContentBlob(item) {
  return `${item?.title || ""} ${item?.summary || ""} ${item?.url || ""}`;
}

function newsHost(item) {
  try {
    return new URL(String(item?.url || "")).hostname.replace(/^www\./i, "");
  } catch (_) {
    return "";
  }
}

/** Inferisci gameKey da host/titolo; null se ambiguo. */
function inferGameKeyFromContent(item) {
  const blob = newsContentBlob(item);
  const host = newsHost(item);
  const hostHits = [];
  const nameHits = [];
  for (const [key, id] of Object.entries(GAME_IDENTITY)) {
    if (host && id.hostRe && id.hostRe.test(host)) hostHits.push(key);
    if (id.nameRe && id.nameRe.test(blob)) nameHits.push(key);
  }
  if (hostHits.length === 1) return hostHits[0];
  if (nameHits.length === 1) return nameHits[0];
  /* host + nome stesso gioco */
  if (hostHits.length && nameHits.length) {
    const both = hostHits.filter((k) => nameHits.includes(k));
    if (both.length === 1) return both[0];
  }
  return null;
}

/**
 * Allinea emoji/roleId al gioco vero (contenuto/URL).
 * @returns {{ item: object, reject: boolean, reason?: string, reassigned?: boolean }}
 */
function reconcileGameIdentity(item, gamesByKey) {
  if (!item || !item.gameKey) return { item, reject: true, reason: "no-game" };
  const claimed = String(item.gameKey);
  const inferred = inferGameKeyFromContent(item);
  const id = GAME_IDENTITY[claimed];
  const blob = newsContentBlob(item);
  const host = newsHost(item);

  if (inferred && inferred !== claimed) {
    const target = gamesByKey.get(inferred);
    if (target && target.roleId) {
      return {
        item: {
          ...item,
          gameKey: target.key,
          gameLabel: target.label,
          emoji: target.emoji,
          roleId: target.roleId,
          color: target.color,
          _reassignedFrom: claimed,
        },
        reject: false,
        reassigned: true,
      };
    }
    return { item, reject: true, reason: `wrong-game:${claimed}->${inferred}` };
  }

  /* Google senza match chiaro sul gioco dichiarato → skip (evita ping sbagliato) */
  if (String(item.sourceType || "") === "google_news" && id) {
    const nameOk = id.nameRe ? id.nameRe.test(blob) : true;
    const hostOk = id.hostRe && host ? id.hostRe.test(host) : false;
    const steamOk = /\bsteampowered\.com|steamcommunity\.com\b/i.test(host);
    if (!nameOk && !hostOk && !steamOk) {
      return { item, reject: true, reason: "gnews-game-mismatch" };
    }
  }

  /* titolo/host chiaramente di un ALTRO gioco (anche senza inferenza unica) */
  if (id) {
    for (const [otherKey, otherId] of Object.entries(GAME_IDENTITY)) {
      if (otherKey === claimed) continue;
      const otherName = otherId.nameRe && otherId.nameRe.test(blob);
      const otherHost = otherId.hostRe && host && otherId.hostRe.test(host);
      const selfName = id.nameRe && id.nameRe.test(blob);
      if ((otherHost || (otherName && !selfName)) && otherKey !== inferred) {
        /* prova reassign se possibile */
        const target = gamesByKey.get(otherKey);
        if (target && target.roleId && (otherHost || otherName)) {
          return {
            item: {
              ...item,
              gameKey: target.key,
              gameLabel: target.label,
              emoji: target.emoji,
              roleId: target.roleId,
              color: target.color,
              _reassignedFrom: claimed,
            },
            reject: false,
            reassigned: true,
          };
        }
        return { item, reject: true, reason: `alien-game:${otherKey}` };
      }
    }
  }

  /* sempre riaggancia emoji/role dal catalogo live (niente ID stantii) */
  const live = gamesByKey.get(claimed);
  if (live && live.roleId) {
    return {
      item: {
        ...item,
        gameLabel: live.label || item.gameLabel,
        emoji: live.emoji || item.emoji,
        roleId: live.roleId,
        color: live.color || item.color,
      },
      reject: false,
    };
  }
  return { item, reject: false };
}

function normComparable(text) {
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

function extractVersionTokens(text) {
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

function titleStoryTokens(title) {
  return String(title || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STORY_STOP_WORDS.has(t));
}

/** Token “nucleo” storia: ordinati, senza clickbait in testa al titolo. */
function storyCoreTokens(title) {
  const raw = titleStoryTokens(stripSourceSuffix(title));
  const uniq = [...new Set(raw)];
  uniq.sort();
  return uniq;
}

function tokenJaccard(a, b) {
  if (!a.length || !b.length) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter += 1;
  const union = sa.size + sb.size - inter;
  return union ? inter / union : 0;
}

function tokenOverlapCount(a, b) {
  if (!a.length || !b.length) return 0;
  const sb = new Set(b);
  let n = 0;
  for (const t of new Set(a)) if (sb.has(t)) n += 1;
  return n;
}

/** Chiave storia per anti-doppio (stessa patch da Steam + Google → 1 sola). */
function storyFingerprint(item) {
  const gameKey = String(item?.gameKey || "x").toLowerCase();
  const title = stripSourceSuffix(item?.title || "");
  const allVers = extractVersionTokens(`${title} ${item?.summary || ""}`);
  /* preferisci versione dotted/snapshot: allinea "Title Update 1.0.1" e "patch 1.0.1" */
  const dotted = allVers.filter((v) => v.startsWith("v:") || v.startsWith("snap:"));
  const vers = dotted.length ? dotted : allVers;
  if (vers.length) return `${gameKey}|${vers.sort().join(",")}`;
  /* gameNewsStoryDedupe2: token ordinati (non i primi 7 in ordine titolo) —
     "Ora è ufficiale: FNAF arriva su Fortnite" ≡ "FNAF arriva a Fortnite" */
  const tokens = storyCoreTokens(title).slice(0, 8);
  return `${gameKey}|t:${tokens.join("-") || normComparable(title).slice(0, 48)}`;
}

function storyRecord(item, at = Date.now()) {
  return {
    gameKey: String(item?.gameKey || "").toLowerCase(),
    title: stripSourceSuffix(item?.title || "").slice(0, 220),
    summary: String(item?.summary || "").slice(0, 280),
    fp: storyFingerprint(item),
    at: Number(at) || Date.now(),
  };
}

function rememberStory(state, item, at = Date.now()) {
  if (!state || !item) return;
  const rec = storyRecord(item, at);
  const list = Array.isArray(state.recentStories) ? state.recentStories.slice() : [];
  const filtered = list.filter((s) => s && s.fp !== rec.fp);
  filtered.unshift(rec);
  state.recentStories = filtered.slice(0, 120);
  state.seen[`story:${rec.fp}`] = Number(at) || Date.now();
}

function matchesRecentStory(state, item) {
  if (!state || !item) return false;
  const recent = Array.isArray(state.recentStories) ? state.recentStories : [];
  for (const s of recent) {
    if (!s) continue;
    if (isSameNewsStory(s, item)) return true;
  }
  return false;
}

function sourceOfficialRank(item) {
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

function hasVersionFingerprint(fp) {
  return /\|(?:v|snap|tu|szn|ch):/.test(String(fp || ""));
}

function isSameNewsStory(a, b) {
  if (!a || !b) return false;
  if (String(a.gameKey || "") !== String(b.gameKey || "")) return false;
  const fa = storyFingerprint(a);
  const fb = storyFingerprint(b);
  if (fa && fa === fb) return true;
  const va = new Set(extractVersionTokens(`${a.title || ""} ${a.summary || ""}`).filter((x) => x.startsWith("v:") || x.startsWith("snap:")));
  const vb = new Set(extractVersionTokens(`${b.title || ""} ${b.summary || ""}`).filter((x) => x.startsWith("v:") || x.startsWith("snap:")));
  if ([...va].some((x) => vb.has(x))) return true;
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
function dedupePreferOfficial(items) {
  const list = Array.isArray(items) ? [...items] : [];
  list.sort((a, b) => {
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
    const dupOf = kept.find((k) => isSameNewsStory(k, item));
    if (dupOf) {
      discarded.push(item);
      continue;
    }
    kept.push(item);
  }
  kept.sort((a, b) => {
    const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    if (tb !== ta) return tb - ta;
    const maj = (x) => (x.importance === "major" ? 1 : 0);
    if (maj(b) !== maj(a)) return maj(b) - maj(a);
    return sourceOfficialRank(b) - sourceOfficialRank(a);
  });
  return { kept, discarded };
}

function stripSourceSuffix(text) {
  return String(text || "")
    .replace(/\s*[-–|]\s*[A-Za-z0-9][\w .]{1,40}$/u, "")
    .replace(/\s+(?:games\.gg|everyeye\.it|multiplayer\.it|spaziogames|tomshw\.it|ign italia|smartworld|icrewplay|playground\.ru)\s*$/i, "")
    .trim();
}

/** True se body ≈ titolo (anche con piccole differenze tipo nel/in). */
function isNearTitleDuplicate(title, body) {
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

/** Se la prima frase ripete il titolo, tieni il resto (spesso meta/OG). */
function stripLeadingTitleEcho(title, body) {
  let text = String(body || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const t = stripSourceSuffix(String(title || "").replace(/\s+/g, " ").trim());
  if (!t) return text;
  /* match prefisso titolo + punteggiatura */
  const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  text = text.replace(new RegExp(`^${esc}\\s*[.!?\\-:–—]?\\s*`, "i"), "").trim();
  const parts = text.split(/(?<=[.!?])\s+/);
  if (parts.length >= 2 && isNearTitleDuplicate(t, parts[0]) && parts[0].length < 180) {
    return parts.slice(1).join(" ").trim();
  }
  if (isNearTitleDuplicate(t, text) && text.length > t.length + 50) {
    const nt = normComparable(t);
    const nb = normComparable(text);
    if (nb.startsWith(nt)) {
      const cut = text.slice(t.length).replace(/^[\s.!?\-:–—]+/, "").trim();
      if (cut.length >= 40) return cut;
    }
  }
  return text;
}

function trimBriefAtSentence(text, maxLen) {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  if (raw.length <= maxLen) return raw;
  const cut = raw.slice(0, maxLen);
  const dot = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (dot >= Math.floor(maxLen * 0.45)) return cut.slice(0, dot + 1).trim();
  const sp = cut.lastIndexOf(" ");
  return (sp >= 80 ? cut.slice(0, sp) : cut).trim();
}

/** Breve articolo: niente eco del titolo; lunghezza da articolo (non teaser). */
function cleanArticleBrief(title, summary) {
  const t = stripSourceSuffix(String(title || "").replace(/\s+/g, " ").trim());
  let body = stripSteamMarkup(String(summary || ""));
  body = stripSourceSuffix(body.replace(/\s+/g, " ").trim());
  if (!body) return "";
  body = stripLeadingTitleEcho(t, body);
  if (!body) return "";
  if (isNearTitleDuplicate(t, body)) return "";
  if (body.length < 40) return "";
  return trimBriefAtSentence(body, ARTICLE_BRIEF_MAX);
}

function metaTagContent(html, key) {
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

function looksLikeCloudflareChallenge(html) {
  const head = String(html || "").slice(0, 4000);
  return /just a moment|cf-browser-verification|checking your browser|attention required|enable javascript and cookies|security service to protect against malicious bots/i.test(
    head,
  );
}

function looksLikeUsefulHtml(html) {
  const h = String(html || "");
  if (h.length < 800) return false;
  if (looksLikeCloudflareChallenge(h)) return false;
  if (/<p[\s>]|og:description|articleBody|twitter:description/i.test(h)) return true;
  return h.length > 12000 && /<html/i.test(h);
}

function unwrapProxyPayload(raw, viaGetJson) {
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
async function fetchHtmlDocument(url) {
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
        transformResponse: [(d) => d],
        headers: browserHeaders,
        maxRedirects: 5,
        timeout: 8_000,
        validateStatus: (s) => s >= 200 && s < 500,
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
              transformResponse: [(d) => d],
              headers: {
                Accept: "text/html,application/json,*/*",
                "User-Agent": browserHeaders["User-Agent"],
              },
              maxRedirects: 3,
              timeout: 16_000,
              validateStatus: (s) => s >= 200 && s < 500,
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
    const oldest = [...htmlDocCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) htmlDocCache.delete(oldest[0]);
  }
  htmlDocCache.set(target, { at: Date.now(), html });
  return html;
}

function extractJsonLdArticleText(html) {
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

function isJunkParagraph(p) {
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

function extractParagraphsFromHtml(html) {
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
async function fetchArticleExcerpt(url, title) {
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
  candidates.sort((a, b) => b.length - a.length);
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
async function resolveArticleBrief(title, summary, articleUrl) {
  let brief = cleanArticleBrief(title, summary);
  if (brief && brief.length >= ARTICLE_BRIEF_MIN) return brief;
  const fetched = await fetchArticleExcerpt(articleUrl, title);
  if (fetched && fetched.length > (brief || "").length) return fetched;
  return brief || fetched || "";
}

function decodeXml(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

async function translateToItalian(text) {
  const raw = String(text || "").trim();
  if (!raw) return raw;
  if (/[àèéìòù]/i.test(raw) && !/\b(the|and|with|patch notes|update)\b/i.test(raw)) {
    return raw;
  }
  const chunks = [];
  let rest = raw;
  while (rest.length > MYMEMORY_MAX) {
    const slice = rest.slice(0, MYMEMORY_MAX);
    const lastDot = slice.lastIndexOf(".");
    const splitAt = lastDot >= 80 ? lastDot + 1 : MYMEMORY_MAX;
    chunks.push(rest.slice(0, splitAt).trim());
    rest = rest.slice(splitAt).trim();
  }
  if (rest) chunks.push(rest);

  const out = [];
  for (const chunk of chunks) {
    try {
      const url = `${MYMEMORY_BASE}?q=${encodeURIComponent(chunk)}&langpair=en|it`;
      const res = await axios.get(url, { timeout: 8000 });
      const t = res?.data?.responseData?.translatedText;
      out.push(t && typeof t === "string" ? t.trim() : chunk);
      await new Promise((r) => setTimeout(r, 350));
    } catch (_) {
      out.push(chunk);
    }
  }
  return out.join(" ").replace(/\s+\./g, ".").trim() || raw;
}

function classifyImportance(title, summary) {
  const blob = `${title || ""} ${summary || ""}`;
  if (JUNK_TITLE_RE.test(blob)) return "minor";
  if (MINOR_RE.test(blob) && !MAJOR_RE.test(blob)) return "minor";
  if (MAJOR_RE.test(blob)) return "major";
  if (/\b(patch\s*notes?|title\s*update|aggiornamento|nuova\s*stagione|stagione\s*\d+)\b/i.test(blob)) {
    return "major";
  }
  return "minor";
}

function isBareGoogleNewsHome(url) {
  try {
    const u = new URL(String(url || "").trim());
    if (!/news\.google\.com$/i.test(u.hostname)) return false;
    const p = (u.pathname || "/").replace(/\/+$/, "") || "/";
    return p === "/" || p === "/home" || p === "/news";
  } catch (_) {
    return /^https?:\/\/news\.google\.com\/?$/i.test(String(url || "").trim());
  }
}

function googleNewsArticleId(url) {
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

function isExternalArticleUrl(url) {
  const s = String(url || "").trim();
  if (!/^https?:\/\//i.test(s)) return false;
  if (/google\.(com|it|news)|gstatic\.com|googleusercontent\.com/i.test(s)) return false;
  if (isBareGoogleNewsHome(s)) return false;
  return true;
}

/** Decode Google News /rss/articles/CBMi… → URL editore (signature + batchexecute). */
async function decodeGoogleNewsArticleUrl(sourceUrl) {
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
        validateStatus: (s) => (s >= 200 && s < 400) || s === 301 || s === 302 || s === 303 || s === 307 || s === 308,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
        responseType: "text",
        transformResponse: [(d) => d],
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
        transformResponse: [(d) => d],
        validateStatus: (s) => s >= 200 && s < 500,
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

async function resolveArticleUrl(url) {
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

async function httpGet(url, opts = {}) {
  const res = await axios.get(url, {
    timeout: HTTP_TIMEOUT_MS,
    headers: {
      "User-Agent": "ViniliGameNews/1.0 (+https://viniliecaffe.it)",
      Accept: "application/json, application/rss+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.8",
      ...(opts.headers || {}),
    },
    validateStatus: (s) => s >= 200 && s < 400,
    ...opts,
  });
  return res.data;
}

function parseRssItems(xml, limit = 8) {
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

async function fetchSteamNews(appId, count = 8, opts = {}) {
  const url = `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${encodeURIComponent(appId)}&count=${count}&maxlength=1200&format=json`;
  const data = await httpGet(url);
  const news = data?.appnews?.newsitems;
  if (!Array.isArray(news)) return [];
  return news
    .filter((n) => {
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
    .map((n) => ({
      id: `steam:${appId}:${n.gid || n.url || n.title}`,
      title: String(n.title || "Novità Steam").trim(),
      url: String(n.url || "").trim(),
      summary: stripHtml(n.contents || "").slice(0, ARTICLE_SUMMARY_MAX),
      publishedAt: n.date ? new Date(Number(n.date) * 1000).toISOString() : null,
    }));
}

async function fetchGoogleNews(query) {
  const q = String(query || "").trim();
  if (!q) return [];
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=it&gl=IT&ceid=IT:it`;
  const xml = await httpGet(url, { responseType: "text", transformResponse: [(d) => d] });
  return parseRssItems(typeof xml === "string" ? xml : String(xml || ""), 8)
    .filter((item) => {
      const blob = `${item.title || ""} ${item.summary || ""} ${item.url || ""}`;
      if (hasDisallowedScript(blob)) return false;
      if (BLOCKED_NEWS_HOST_RE.test(blob)) return false;
      return true;
    })
    .slice(0, 6)
    .map((item) => ({
      ...item,
      id: `gnews:${item.id}`,
    }));
}

async function fetchFortniteApiNews() {
  const data = await httpGet("https://fortnite-api.com/v2/news");
  const br = data?.data?.br;
  const list = Array.isArray(br?.motds) ? br.motds : Array.isArray(br) ? br : [];
  return list.slice(0, 8).map((m, i) => ({
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
  return entries.slice(0, 2).map((e, i) => {
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
  return posts.slice(0, 6).map((p) => {
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

async function fetchFromSource(source) {
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
      const xml = await httpGet(source.url, { responseType: "text", transformResponse: [(d) => d] });
      items = parseRssItems(typeof xml === "string" ? xml : String(xml || ""), 8);
    }
    return (items || []).map((item) => ({ ...item, sourceType: source.type }));
  } catch (err) {
    const status = Number(err?.response?.status || 0);
    /* 429/403 tipici su feed terziari: non spammiamo i log */
    if (status === 429 || status === 403) return [];
    const detail = status
      ? `HTTP ${status}`
      : err?.code || err?.message || String(err);
    global.logger?.error?.(
      `[GAME NEWS] source fail ${source.type}${source.url ? ` ${source.url}` : source.appId ? ` app:${source.appId}` : source.query ? ` q:${source.query}` : ""} → ${detail}`,
    );
  }
  return [];
}

function titleFromBrawlPath(pathname) {
  const parts = String(pathname || "")
    .replace(/\/+$/, "")
    .split("/")
    .filter(Boolean);
  const slug = parts[parts.length - 1] || "";
  if (!slug || slug === "blog" || /^page-\d+$/i.test(slug) || /^\d+$/.test(slug)) return "";
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function isBrawlArticlePath(pathname) {
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
          transformResponse: [(d) => d],
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
  items.sort((a, b) => {
    const score = (u) => (/release-notes/i.test(u.url) ? 0 : /community|game/i.test(u.url) ? 1 : 2);
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
      return posts.slice(0, 6).map((n) => {
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
    transformResponse: [(d) => d],
    headers: { Accept: "text/html" },
  });
  const raw = String(html || "");
  if (raw.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(raw);
      const posts = Array.isArray(parsed?.news_posts) ? parsed.news_posts : [];
      return posts.slice(0, 6).map((n) => {
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

async function collectGameItems(game) {
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

async function loadState() {
  const raw = await getBotState(STATE_KEY, null);
  if (!raw || typeof raw !== "object") {
    return { initialized: false, seen: {}, recentStories: [], lastPollAt: null };
  }
  const recentStories = Array.isArray(raw.recentStories)
    ? raw.recentStories.filter((s) => s && s.title && s.gameKey).slice(0, 120)
    : [];
  return {
    initialized: Boolean(raw.initialized),
    seen: raw.seen && typeof raw.seen === "object" ? raw.seen : {},
    recentStories,
    lastPollAt: raw.lastPollAt || null,
  };
}

async function saveState(state) {
  const seenEntries = Object.entries(state.seen || {});
  if (seenEntries.length > 800) {
    seenEntries.sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0));
    state.seen = Object.fromEntries(seenEntries.slice(0, 600));
  }
  const recentStories = Array.isArray(state.recentStories)
    ? state.recentStories.filter((s) => s && s.title && s.gameKey).slice(0, 120)
    : [];
  await setBotState(STATE_KEY, {
    initialized: Boolean(state.initialized),
    seen: state.seen || {},
    recentStories,
    lastPollAt: state.lastPollAt || new Date().toISOString(),
  });
}

function buildArticleContent(item, titleIt, summaryIt, articleUrl) {
  const emoji = item.emoji || "🎮";
  const title = stripSourceSuffix(String(titleIt || item.title || "Novità").trim()).slice(0, 220);
  const body = cleanArticleBrief(title, summaryIt);
  const ping = item.roleId ? `<@&${item.roleId}>` : "";
  const link = String(articleUrl || item.url || "").trim();

  /* emoji + titolo, poi corpo articolo (se c'è), poi ping + link */
  const parts = [`${emoji} **${title}**`];
  if (body) parts.push("", body);
  parts.push("");
  if (ping) parts.push(ping);
  if (link) parts.push(link);

  let content = parts.join("\n").trim();
  if (content.length > 1950) {
    const head = `${emoji} **${title}**`;
    const foot = [ping, link].filter(Boolean).join("\n");
    const budget = 1950 - head.length - foot.length - 4;
    const brief = body && budget > 80 ? `\n\n${trimBriefAtSentence(body, budget)}` : "";
    content = `${head}${brief}\n\n${foot}`.trim().slice(0, 2000);
  }
  return content;
}

async function postItem(client, cfg, item) {
  const guildId = String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
  const guild = await getClientGuildCached(client, guildId).catch(() => null);
  if (!guild) return { ok: false, reason: "guild" };
  const channel =
    guild.channels.cache.get(cfg.channelId) ||
    (await getGuildChannelCached(guild, cfg.channelId).catch(() => null));
  if (!channel?.isTextBased?.()) return { ok: false, reason: "channel" };

  if (hasDisallowedScript(`${item.title || ""} ${item.summary || ""}`)) {
    return { ok: false, reason: "foreign-script" };
  }

  const articleUrl = await resolveArticleUrl(item.url);
  if (BLOCKED_NEWS_HOST_RE.test(articleUrl)) {
    return { ok: false, reason: "blocked-host" };
  }

  /* dopo resolve URL: ri-check identità (google → host ufficiale) */
  const gamesByKey = new Map((cfg.games || []).map((g) => [g.key, g]));
  const identity = reconcileGameIdentity({ ...item, url: articleUrl || item.url }, gamesByKey);
  if (identity.reject) {
    return { ok: false, reason: identity.reason || "wrong-game" };
  }
  const postReady = identity.item;

  let titleIt = String(item.title || "").trim();
  /* corpo: se RSS ripete il titolo / è corto → scrape pagina */
  let summaryRaw = await resolveArticleBrief(
    titleIt,
    String(item.summary || "").trim(),
    articleUrl || postReady.url,
  );

  if (cfg.translateToItalian) {
    titleIt = await translateToItalian(titleIt);
    if (summaryRaw && !hasDisallowedScript(summaryRaw)) {
      summaryRaw = await translateToItalian(summaryRaw);
      /* dopo translate può ri-assomigliare al titolo */
      summaryRaw = cleanArticleBrief(titleIt, summaryRaw) || summaryRaw;
      if (isNearTitleDuplicate(titleIt, summaryRaw)) summaryRaw = "";
    }
  }
  if (hasDisallowedScript(`${titleIt} ${summaryRaw}`)) {
    return { ok: false, reason: "foreign-script-after-translate" };
  }

  /* se ancora vuoto dopo translate, ritenta scrape con titolo IT */
  if (!summaryRaw || summaryRaw.length < ARTICLE_BRIEF_MIN) {
    const again = await resolveArticleBrief(titleIt, String(item.summary || ""), articleUrl || postReady.url);
    if (again && again.length > (summaryRaw || "").length) {
      summaryRaw = cfg.translateToItalian ? await translateToItalian(again) : again;
      summaryRaw = cleanArticleBrief(titleIt, summaryRaw) || summaryRaw;
      if (isNearTitleDuplicate(titleIt, summaryRaw)) summaryRaw = again;
    }
  }

  const content = buildArticleContent(postReady, titleIt, summaryRaw, articleUrl || postReady.url);
  const msg = await channel.send({
    content,
    allowedMentions: postReady.roleId ? { roles: [postReady.roleId] } : { parse: [] },
  });

  if (cfg.crosspost && Number(channel.type) === ChannelType.GuildAnnouncement && typeof msg?.crosspost === "function") {
    await msg.crosspost().catch(() => null);
  }
  return {
    ok: true,
    messageId: msg?.id || null,
    gameKey: postReady.gameKey,
    reassigned: Boolean(identity.reassigned),
    briefLen: summaryRaw.length,
  };
}

let recentHydratedOnce = false;

async function hydrateRecentStoriesFromChannel(client, cfg, state) {
  /* gameNewsStoryDedupe2: una volta, importa titoli già in canale → anti-doppio articoli alternativi */
  if (recentHydratedOnce) return 0;
  if ((state.recentStories || []).length >= 10) {
    recentHydratedOnce = true;
    return 0;
  }
  recentHydratedOnce = true;
  try {
    const ch = await client.channels.fetch(cfg.channelId).catch(() => null);
    if (!ch || typeof ch.messages?.fetch !== "function") return 0;
    const msgs = await ch.messages.fetch({ limit: 35 });
    let n = 0;
    const sorted = [...msgs.values()].sort((a, b) => (b.createdTimestamp || 0) - (a.createdTimestamp || 0));
    for (const msg of sorted) {
      if (!msg?.author?.bot) continue;
      const content = String(msg.content || "");
      const m = content.match(/\*\*(.+?)\*\*/);
      const title = m ? String(m[1] || "").trim() : "";
      if (!title || title.length < 8) continue;
      const seedItem = {
        gameKey: "fortnite",
        title,
        summary: content.replace(/\*\*[^*]+\*\*/g, "").slice(0, 200),
        sourceType: "seed_channel",
        url: msg.url || "",
      };
      try {
        const inferred = inferGameKeyFromContent(seedItem);
        if (inferred) seedItem.gameKey = inferred;
        else {
          for (const g of cfg.games || []) {
            const lab = String(g.label || g.key || "").toLowerCase();
            if (lab && title.toLowerCase().includes(lab)) {
              seedItem.gameKey = g.key;
              break;
            }
          }
        }
      } catch (_) {}
      rememberStory(state, seedItem, msg.createdTimestamp || Date.now());
      n += 1;
    }
    return n;
  } catch (err) {
    global.logger?.error?.("[GAME NEWS] hydrate recentStories failed:", err?.message || err);
    return 0;
  }
}

async function runGameNewsPoll(client) {
  if (pollInFlight) return { skipped: true, reason: "inflight" };
  const cfg = resolveConfig(client);
  if (!cfg.enabled || !cfg.channelId || !cfg.games.length) return { skipped: true, reason: "disabled" };

  pollInFlight = true;
  try {
    const state = await loadState();
    try {
      await hydrateRecentStoriesFromChannel(client, cfg, state);
    } catch (_) {}
    const discovered = [];
    for (const game of cfg.games) {
      const items = await collectGameItems(game);
      for (const item of items) discovered.push(item);
    }

    if (!state.initialized) {
      const now = Date.now();
      for (const item of discovered) {
        state.seen[item.id] = now;
        rememberStory(state, item, now);
      }
      state.initialized = true;
      state.lastPollAt = new Date().toISOString();
      await saveState(state);
      return { ok: true, seeded: true, seen: Object.keys(state.seen).length };
    }

    const nowMs = Date.now();
    let skippedStale = 0;
    let skippedDupStory = 0;
    let skippedWrongGame = 0;
    let reassignedGame = 0;
    const gamesByKey = new Map((cfg.games || []).map((g) => [g.key, g]));
    /* backfill story: da id già visti ancora in feed (evita re-post terziari dopo Steam) */
    const alreadySeenLive = [];
    for (const item of discovered) {
      if (!state.seen[item.id]) continue;
      rememberStory(state, item, state.seen[item.id]);
      alreadySeenLive.push(item);
    }
    const allNew = [];
    for (const rawItem of discovered) {
      if (state.seen[rawItem.id]) continue;
      const identity = reconcileGameIdentity(rawItem, gamesByKey);
      if (identity.reject) {
        state.seen[rawItem.id] = nowMs;
        skippedWrongGame += 1;
        continue;
      }
      const item = identity.item;
      if (identity.reassigned) {
        reassignedGame += 1;
      }
      const fp = storyFingerprint(item);
      const storyKey = `story:${fp}`;
      if (state.seen[storyKey]) {
        /* stessa storia già postata da altra fonte */
        state.seen[item.id] = nowMs;
        rememberStory(state, item, nowMs);
        skippedDupStory += 1;
        continue;
      }
      /* gameNewsStoryDedupe2: fuzzy vs feed live + ultime storie postate */
      if (
        alreadySeenLive.some((s) => isSameNewsStory(s, item)) ||
        matchesRecentStory(state, item)
      ) {
        state.seen[item.id] = nowMs;
        rememberStory(state, item, nowMs);
        skippedDupStory += 1;
        continue;
      }
      const stale = isStaleOrJunkItem(item, cfg.maxAgeMs, nowMs);
      if (stale.reject) {
        /* marca come visto così non ripesca eternamente lo stesso scrap vecchio */
        state.seen[item.id] = nowMs;
        skippedStale += 1;
        continue;
      }
      allNew.push(item);
    }

    const { kept: deduped, discarded: dupDiscarded } = dedupePreferOfficial(allNew);
    for (const d of dupDiscarded) {
      state.seen[d.id] = nowMs;
      rememberStory(state, d, nowMs);
      skippedDupStory += 1;
    }

    const toPost = deduped.slice(0, cfg.maxPostsPerPoll);
    const posted = [];
    for (const item of toPost) {
      const fp = storyFingerprint(item);
      try {
        const res = await postItem(client, cfg, item);
        state.seen[item.id] = Date.now();
        rememberStory(state, item, Date.now());
        posted.push({
          id: item.id,
          story: fp,
          gameKey: item.gameKey,
          sourceType: item.sourceType,
          importance: item.importance,
          ok: res.ok,
          reason: res.reason || null,
        });
        await new Promise((r) => setTimeout(r, 1500));
      } catch (err) {
        global.logger?.error?.("[GAME NEWS] post failed:", item.id, err?.message || err);
        state.seen[item.id] = Date.now();
        rememberStory(state, item, Date.now());
        posted.push({ id: item.id, ok: false, err: err?.message || String(err) });
      }
    }

    state.lastPollAt = new Date().toISOString();
    await saveState(state);
    return {
      ok: true,
      posted: posted.length,
      skippedStale,
      skippedDupStory,
      skippedWrongGame,
      reassignedGame,
      details: posted,
    };
  } finally {
    pollInFlight = false;
  }
}

function startGameNewsAlertLoop(client) {
  if (!client || loopStarted.has(client)) return;
  loopStarted.add(client);
  const cfg = resolveConfig(client);
  if (!cfg.enabled) {
    return;
  }

  const tick = () => {
    runGameNewsPoll(client).catch((err) => {
      global.logger?.error?.("[GAME NEWS] poll error:", err?.message || err);
    });
  };

  setTimeout(tick, 45_000);
  const timer = setInterval(tick, cfg.pollIntervalMs);
  if (typeof timer.unref === "function") timer.unref();
  client._gameNewsAlertInterval = timer;
}

module.exports = {
  startGameNewsAlertLoop,
  runGameNewsPoll,
  resolveConfig,
  classifyImportance,
  defaultGamesCatalog,
  collectGameItems,
  isStaleOrJunkItem,
  currentEaFcEdition,
  buildArticleContent,
  cleanArticleBrief,
  stripHtml,
  stripSteamMarkup,
  expandSteamPlaceholders,
  hasDisallowedScript,
  resolveArticleUrl,
  storyFingerprint,
  storyCoreTokens,
  sourceOfficialRank,
  dedupePreferOfficial,
  isSameNewsStory,
  matchesRecentStory,
  rememberStory,
  reconcileGameIdentity,
  inferGameKeyFromContent,
  fetchArticleExcerpt,
  resolveArticleBrief,
  isNearTitleDuplicate,
};
