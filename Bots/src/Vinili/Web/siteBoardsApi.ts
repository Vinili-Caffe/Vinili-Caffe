/**
 * Vinili Boards — public server/bot directory API.
 * Docs live in sitedocuments (BOARD_LISTING / BOARD_VOTE / BOARD_BUMP / BOARD_REPORT).
 */
const crypto = require("crypto") as typeof import("crypto");
const fs = require("node:fs") as typeof import("node:fs");
const path = require("node:path") as typeof import("node:path");
const mongoose = require("mongoose") as typeof import("mongoose");
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../Schemas/Community/communitySchemas") as typeof import("../Schemas/Community/communitySchemas");
const { fetchDiscordOAuthMe } = require("./discordOauthMe") as typeof import("./discordOauthMe");
const { assertWebsiteStaffAccess } = require("./siteStaffAccessApi") as typeof import("./siteStaffAccessApi");
const { memberIsHighStaffEligible } = require("../Utils/Staff/staffRoleHierarchy") as typeof import("../Utils/Staff/staffRoleHierarchy");
const {
  buildKnownBotGuildIdSet,
  syncKnownBotGuildIdsFromRest,
} = require("./siteDashboardApi") as typeof import("./siteDashboardApi");
const { PermissionFlagsBits, ChannelType } = require("discord.js") as typeof import("discord.js");
const IDs = require("../Utils/Config/ids") as typeof import("../Utils/Config/ids");
const { voteCountMonthKeyRome } = require("../Utils/romeVoteMonthKey") as typeof import("../Utils/romeVoteMonthKey");

/* boardsBannerUpload1 */
const { resolveSiteUploadRoot } = require("./siteUploadRoots") as typeof import("./siteUploadRoots");
const { savePublicSiteMedia, cdnOrigin } = require("./siteCdnMedia") as typeof import("./siteCdnMedia");
const BOARD_BANNER_UPLOAD_ROOT = resolveSiteUploadRoot("site-boards");
const BOARD_BANNER_MAX_BYTES = 2.5 * 1024 * 1024;
const BOARD_BANNER_MIME = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);

const BL = SITE_DOCUMENT_TYPE.BOARD_LISTING;
const MAIN_GUILD_ID = String(IDs?.guilds?.main || "").trim();
const MAIN_GUILD_SITE = "https://www.viniliecaffe.it";
const BV = SITE_DOCUMENT_TYPE.BOARD_VOTE;
const BB = SITE_DOCUMENT_TYPE.BOARD_BUMP;
const BR = SITE_DOCUMENT_TYPE.BOARD_REPORT;
const BREV = SITE_DOCUMENT_TYPE.BOARD_REVIEW;

/* apiWarmSwr1: public listings list SWR */
const LISTINGS_CACHE_TTL_MS = 90_000;
const LISTINGS_STALE_KEEP_MS = 10 * 60 * 1000;
const listingsCache = new Map();
const listingsInflight = new Map();

function listingsCacheKey(query: Record<string, any> = {}) {
  return [
    String(query.kind || ""),
    String(query.q || "").toLowerCase(),
    String(query.tag || "").toLowerCase(),
    String(query.category || "").toLowerCase(),
    String(query.locale || "").toLowerCase(),
    String(query.guildTag || query.guildtag || ""),
    String(query.sort || "score").toLowerCase(),
    String(Math.max(1, Number(query.page) || 1)),
    String(Math.min(48, Math.max(1, Number(query.perPage) || 24))),
    query.allowClosed ? "1" : "0",
  ].join("|");
}

function readListingsCache(key?) {
  const entry = listingsCache.get(key);
  if (!entry) return null;
  const age = Date.now() - entry.at;
  if (age < LISTINGS_CACHE_TTL_MS) return { payload: entry.payload, fresh: true };
  if (age < LISTINGS_STALE_KEEP_MS) return { payload: entry.payload, fresh: false };
  listingsCache.delete(key);
  return null;
}

function writeListingsCache(key?, payload?) {
  if (listingsCache.size > 48) {
    const first = listingsCache.keys().next().value;
    if (first) listingsCache.delete(first);
  }
  listingsCache.set(key, { at: Date.now(), payload });
}

function invalidateListingsListCache() {
  listingsCache.clear();
  listingsInflight.clear();
}

function emitBoardsChanged(action?, extras: Record<string, any> = {}) {
  try {
    invalidateListingsListCache();
  } catch (_) {}
  try {
    const { broadcastSiteBoardsChanged } = require("./siteSuggestionsBroadcast") as typeof import("./siteSuggestionsBroadcast");
    broadcastSiteBoardsChanged(action, extras && typeof extras === "object" ? extras : {});
  } catch (_) {}
}

const ACTIVE_STATUSES = ["pending", "approved"];
/* boardsFormFields2: expanded taxonomy */
/* boardsCatsTagsIt1: catalogo ampio — generali + hobby + giochi */
/* boardsMaxCatsTags12: max 12 cat/tag + catalogo allargato */
const BOARD_CATEGORIES = [
  "community",
  "social",
  "amicizia",
  "chiacchiere",
  "chill",
  "hangout",
  "late-night",
  "eventi",
  "tornei",
  "quiz",
  "italia",
  "international",
  "lingue",
  "language-exchange",
  "gaming",
  "esports",
  "clan",
  "indie-games",
  "speedrun",
  "minecraft",
  "roblox",
  "fortnite",
  "valorant",
  "lol",
  "gta",
  "fivem",
  "genshin",
  "honkai",
  "zenless",
  "pokemon",
  "apex",
  "overwatch",
  "rust",
  "warzone",
  "rocket-league",
  "osu",
  "smash",
  "nintendo",
  "fps",
  "mmo",
  "mobile-games",
  "retro-games",
  "giochi-tavolo",
  "dnd",
  "musica",
  "karaoke",
  "radio",
  "podcast",
  "dj",
  "producer",
  "kpop",
  "jpop",
  "metal",
  "hiphop",
  "stream",
  "vtuber",
  "twitch-creators",
  "youtube-creators",
  "anime",
  "manga",
  "otaku",
  "cosplay",
  "roleplay",
  "city-rp",
  "fantasy",
  "horror",
  "scifi",
  "mystery",
  "true-crime",
  "fumetti",
  "memes",
  "art",
  "creativita",
  "design",
  "3d-art",
  "editing",
  "photography",
  "scrittura",
  "teatro",
  "ballo",
  "cinema",
  "movies",
  "series",
  "books",
  "book-club",
  "istruzione",
  "studio",
  "universita",
  "coding",
  "tech",
  "ai",
  "bot-dev",
  "opensource",
  "crypto",
  "trading",
  "business",
  "lavoro",
  "freelance",
  "marketing",
  "science",
  "spazio",
  "storia",
  "filosofia",
  "sports",
  "calcio",
  "basket",
  "tennis",
  "formula1",
  "fitness",
  "outdoor",
  "animali",
  "food",
  "cucina",
  "viaggi",
  "travel",
  "moda",
  "fashion",
  "bellezza",
  "salute",
  "lifestyle",
  "auto",
  "moto",
  "faidate",
  "collezionismo",
  "vinili",
  "cafe",
  "dating",
  "lgbt",
  "nsfw",
  "giveaway",
  "partnership",
  "support",
  "news",
  "altro",
];
/* boardsFormUi1: tutte le lingue i18n (VcI18n.SUPPORTED) */
/* boardsLocalesDd32: catalogo ampio + max 32 selezionabili */
const BOARD_LOCALES = [
  "it",
  "en",
  "es",
  "fr",
  "de",
  "pt",
  "ru",
  "zh",
  "ja",
  "ko",
  "ar",
  "nl",
  "pl",
  "tr",
  "hi",
  "id",
  "uk",
  "vi",
  "ro",
  "sv",
  "cs",
  "da",
  "el",
  "fi",
  "hu",
  "no",
  "th",
  "he",
  "bn",
  "ms",
  "fil",
  "ca",
  "sk",
  "bg",
  "hr",
  "sr",
  "sl",
  "et",
  "lv",
  "lt",
  "fa",
  "ur",
  "sw",
  "af",
  "sq",
  "ka",
  "hy",
  "az",
  "kk",
  "uz",
  "mn",
  "ne",
  "si",
  "my",
  "km",
  "lo",
  "am",
  "ga",
  "cy",
  "eu",
  "gl",
  "is",
  "mt",
  "lb",
  "be",
  "mk",
  "bs",
  "ta",
  "te",
  "yo",
];
const BOARD_LOCALE_LABELS = {
  it: "Italiano",
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  pt: "Português",
  ru: "Русский",
  zh: "中文",
  ja: "日本語",
  ko: "한국어",
  ar: "العربية",
  nl: "Nederlands",
  pl: "Polski",
  tr: "Türkçe",
  hi: "हिन्दी",
  id: "Indonesia",
  uk: "Українська",
  vi: "Tiếng Việt",
  ro: "Română",
  sv: "Svenska",
  cs: "Čeština",
  da: "Dansk",
  el: "Ελληνικά",
  fi: "Suomi",
  hu: "Magyar",
  no: "Norsk",
  th: "ไทย",
  he: "עברית",
  bn: "বাংলা",
  ms: "Bahasa Melayu",
  fil: "Filipino",
  ca: "Català",
  sk: "Slovenčina",
  bg: "Български",
  hr: "Hrvatski",
  sr: "Српски",
  sl: "Slovenščina",
  et: "Eesti",
  lv: "Latviešu",
  lt: "Lietuvių",
  fa: "فارسی",
  ur: "اردو",
  sw: "Kiswahili",
  af: "Afrikaans",
  sq: "Shqip",
  ka: "ქართული",
  hy: "Հայերեն",
  az: "Azərbaycan",
  kk: "Қазақша",
  uz: "Oʻzbekcha",
  mn: "Монгол",
  ne: "नेपाली",
  si: "සිංහල",
  my: "မြန်မာ",
  km: "ខ្មែរ",
  lo: "ລາວ",
  am: "አማርኛ",
  ga: "Gaeilge",
  cy: "Cymraeg",
  eu: "Euskara",
  gl: "Galego",
  is: "Íslenska",
  mt: "Malti",
  lb: "Lëtzebuergesch",
  be: "Беларуская",
  mk: "Македонски",
  bs: "Bosanski",
  ta: "தமிழ்",
  te: "తెలుగు",
  yo: "Yorùbá",
};
const BOARD_CATEGORY_LABELS = {
  community: "Community",
  social: "Social",
  amicizia: "Amicizia",
  chiacchiere: "Chiacchiere",
  chill: "Chill / Vocal",
  hangout: "Hangout",
  "late-night": "Late night",
  eventi: "Eventi",
  tornei: "Tornei",
  quiz: "Quiz / Trivia",
  italia: "Italia",
  international: "Internazionale",
  lingue: "Lingue",
  "language-exchange": "Language exchange",
  gaming: "Gaming",
  esports: "Esports",
  clan: "Clan / Team",
  "indie-games": "Indie games",
  speedrun: "Speedrun",
  minecraft: "Minecraft",
  roblox: "Roblox",
  fortnite: "Fortnite",
  valorant: "Valorant",
  lol: "League of Legends",
  gta: "GTA",
  fivem: "FiveM / RP",
  genshin: "Genshin / gacha",
  honkai: "Honkai",
  zenless: "Zenless Zone Zero",
  pokemon: "Pokémon",
  apex: "Apex Legends",
  overwatch: "Overwatch",
  rust: "Rust",
  warzone: "Warzone / CoD",
  "rocket-league": "Rocket League",
  osu: "osu!",
  smash: "Smash Bros",
  nintendo: "Nintendo",
  fps: "FPS",
  mmo: "MMO / RPG",
  "mobile-games": "Giochi mobile",
  "retro-games": "Retro / Emulazione",
  "giochi-tavolo": "Giochi da tavolo",
  dnd: "D&D / TTRPG",
  musica: "Musica",
  karaoke: "Karaoke",
  radio: "Radio",
  podcast: "Podcast",
  dj: "DJ",
  producer: "Producer / Beatmaking",
  kpop: "K-pop",
  jpop: "J-pop",
  metal: "Metal",
  hiphop: "Hip-hop / Rap",
  stream: "Streaming",
  vtuber: "VTuber",
  "twitch-creators": "Creator Twitch",
  "youtube-creators": "Creator YouTube",
  anime: "Anime",
  manga: "Manga",
  otaku: "Otaku",
  cosplay: "Cosplay",
  roleplay: "Roleplay",
  "city-rp": "City RP",
  fantasy: "Fantasy",
  horror: "Horror",
  scifi: "Sci-Fi",
  mystery: "Mystery",
  "true-crime": "True crime",
  fumetti: "Fumetti",
  memes: "Memes",
  art: "Arte",
  creativita: "Creatività",
  design: "Design",
  "3d-art": "3D / Blender",
  editing: "Video editing",
  photography: "Fotografia",
  scrittura: "Scrittura",
  teatro: "Teatro",
  ballo: "Ballo / Dance",
  cinema: "Cinema",
  movies: "Film",
  series: "Serie TV",
  books: "Libri",
  "book-club": "Book club",
  istruzione: "Istruzione",
  studio: "Studio",
  universita: "Università",
  coding: "Coding",
  tech: "Tech",
  ai: "AI",
  "bot-dev": "Sviluppo bot",
  opensource: "Open source",
  crypto: "Crypto",
  trading: "Trading",
  business: "Business",
  lavoro: "Lavoro",
  freelance: "Freelance",
  marketing: "Marketing",
  science: "Scienza",
  spazio: "Spazio",
  storia: "Storia",
  filosofia: "Filosofia",
  sports: "Sport",
  calcio: "Calcio",
  basket: "Basket",
  tennis: "Tennis",
  formula1: "Formula 1",
  fitness: "Fitness",
  outdoor: "Outdoor",
  animali: "Animali",
  food: "Food",
  cucina: "Cucina",
  viaggi: "Viaggi",
  travel: "Travel",
  moda: "Moda",
  fashion: "Fashion",
  bellezza: "Bellezza",
  salute: "Salute",
  lifestyle: "Lifestyle",
  auto: "Auto",
  moto: "Moto",
  faidate: "Fai da te",
  collezionismo: "Collezionismo",
  vinili: "Vinili / Musica fisica",
  cafe: "Caffè / Chill café",
  dating: "Dating",
  lgbt: "LGBTQ+",
  nsfw: "NSFW",
  giveaway: "Giveaway",
  partnership: "Partnership",
  support: "Supporto",
  news: "Notizie",
  altro: "Altro",
};
const BOARD_SOCIAL_KEYS = ["youtube", "twitch", "instagram", "tiktok", "x", "github", "website"];
/* boardsCatsTagsIt1: catalogo tag ampio + tanti IT + creati utenti */
const BOARD_TAG_CATALOG = [
  "18plus",
  "16plus",
  "13plus",
  "active",
  "ai",
  "ai-art",
  "amicizia",
  "amici",
  "animali",
  "anime",
  "anime-ita",
  "anime-rp",
  "apex",
  "art",
  "arte",
  "asmr",
  "auto",
  "basket",
  "beginners",
  "bellezza",
  "benvenuti",
  "bot",
  "bot-ita",
  "books",
  "building",
  "business",
  "calcio",
  "canzoni",
  "carta",
  "casual",
  "chiacchiere",
  "chill",
  "cinema",
  "clan",
  "classica",
  "coding",
  "collezionismo",
  "community",
  "community-ita",
  "competitive",
  "console",
  "cosplay",
  "creative",
  "creativita",
  "crypto",
  "crypto-trading",
  "cucina",
  "dating",
  "design",
  "devtools",
  "discord",
  "diy",
  "economia",
  "economy",
  "edm",
  "emoji",
  "emulation",
  "english",
  "esami",
  "esports",
  "europe",
  "eventi",
  "events",
  "faction",
  "fai-da-te",
  "family-friendly",
  "fantasy",
  "fashion",
  "film",
  "filosofia",
  "fitness",
  "fivem",
  "food",
  "formula1",
  "fortnite",
  "fotografia",
  "fps",
  "francese",
  "friendly",
  "fumetti",
  "gacha",
  "gaming",
  "gaming-ita",
  "genshin",
  "giochi",
  "giochi-tavolo",
  "giveaway",
  "giveaway-ita",
  "gta",
  "gta-rp",
  "hardcore",
  "help",
  "helpdesk",
  "hiphop",
  "horror",
  "indie",
  "international",
  "investing",
  "italiano",
  "italia",
  "italy",
  "jpop",
  "karaoke",
  "kpop",
  "language-exchange",
  "lavoro",
  "lgbt",
  "libri",
  "lingue",
  "linux",
  "lol",
  "loot",
  "manga",
  "manga-ita",
  "manhwa",
  "marketing",
  "memes",
  "memes-ita",
  "metal",
  "minecraft",
  "minecraft-ita",
  "mobile",
  "moda",
  "modded",
  "mods",
  "moto",
  "movies",
  "music",
  "musica",
  "musica-ita",
  "news",
  "notizie",
  "nft",
  "nitro",
  "nsfw",
  "opensource",
  "otaku",
  "outdoor",
  "overwatch",
  "palworld",
  "partnership",
  "pc",
  "photography",
  "podcast",
  "pokemon",
  "poker",
  "principianti",
  "pve",
  "pvp",
  "radio",
  "raid",
  "rap",
  "retro",
  "roblox",
  "rock",
  "roleplay",
  "rp",
  "rp-ita",
  "rp-serio",
  "rp-serious",
  "rust",
  "salute",
  "scacchi",
  "science",
  "scienza",
  "scrittura",
  "scuola",
  "series",
  "serie-tv",
  "sfw",
  "smp",
  "social",
  "solo-italia",
  "spagnolo",
  "spazio",
  "sports",
  "staff",
  "staff-hiring",
  "startup",
  "storia",
  "streaming",
  "studio",
  "study",
  "support",
  "supporto",
  "survival",
  "talk",
  "tech",
  "tecnologia",
  "tedesco",
  "tennis",
  "trading",
  "travel",
  "twitch",
  "universita",
  "valorant",
  "vanilla",
  "vc",
  "viaggi",
  "vocal",
  "voicechat",
  "vtuber",
  "web3",
  "welcoming",
  "writing",
  "youtube",
  "zenless",
  /* boardsMaxCatsTags12: extra tag */
  "24-7",
  "3d",
  "after-hours",
  "among-us",
  "animal-crossing",
  "apex-legends",
  "asmr-ita",
  "ballo",
  "beatmaking",
  "blender",
  "bookclub",
  "boost",
  "cafe",
  "call-of-duty",
  "cityrp",
  "cod",
  "competitive-ita",
  "cosplay-ita",
  "creator",
  "creators",
  "dead-by-daylight",
  "destiny",
  "dj-set",
  "dnd",
  "dungeons-and-dragons",
  "editing",
  "emotes",
  "freelance",
  "gacha-ita",
  "hangout",
  "hellodiscord",
  "honkai",
  "indie",
  "indie-dev",
  "jams",
  "jazz",
  "kpop-ita",
  "language-buddy",
  "late-night",
  "leveling",
  "minecraft-smp",
  "mystery",
  "nintendo",
  "nightcore",
  "opensource",
  "osu",
  "producer",
  "quiz",
  "rocket-league",
  "smash",
  "smp-ita",
  "speedrun",
  "stardew",
  "stickers",
  "teatro",
  "tornei",
  "trivia",
  "true-crime",
  "ttrpg",
  "vinili",
  "vinyl",
  "warzone",
  "wow",
  "wuthering",
  "zzz",
];
function boardsConfig(client?) {
  const raw = client?.config?.boards && typeof client.config.boards === "object" ? client.config.boards : {};
  const turnstile =
    raw.turnstile && typeof raw.turnstile === "object" ? raw.turnstile : {};
  const ads = raw.ads && typeof raw.ads === "object" ? raw.ads : {};
  const adProvider = String(ads.provider || "mock").trim().toLowerCase() || "mock";
  return {
    enabled: raw.enabled !== false,
    publicOpen: raw.publicOpen === true,
    voteCooldownHours: Math.max(1, Number(raw.voteCooldownHours) || 12),
    bumpCooldownHours: Math.max(0.25, Number(raw.bumpCooldownHours) || 2),
    scoreVotesWeight: Math.max(0, Number(raw.scoreVotesWeight) || 1),
    scoreBumpsWeight: Math.max(0, Number(raw.scoreBumpsWeight) || 3),
    /* boardsMaxCatsTags12: default 12 categorie / 12 tag */
    maxTags: Math.max(1, Math.min(24, Number(raw.maxTags) || 12)),
    maxCategories: Math.max(1, Math.min(24, Number(raw.maxCategories) || 12)),
    /* boardsLocalesDd32: max 32 lingue */
    maxLocales: Math.max(1, Math.min(32, Number(raw.maxLocales) || 32)),
    maxMarkdownChars: Math.max(200, Math.min(8000, Number(raw.maxMarkdownChars) || 4000)),
    /* boardsDescMinPreview1: min caratteri descrizioni */
    minTaglineChars: Math.max(8, Math.min(80, Number(raw.minTaglineChars) || 20)),
    minDescriptionChars: Math.max(20, Math.min(500, Number(raw.minDescriptionChars) || 80)),
    /* boardsVoteFlow1 + boardsVoteNoCountdown1: 0 = Vota subito (ad+turnstile restano) */
    voteCountdownSeconds: Math.max(0, Math.min(60, Number(raw.voteCountdownSeconds) || 0)),
    /* boardsVoteNoAdCountdown1: 0 = niente attesa sponsor */
    voteAdSeconds: Math.max(0, Math.min(120, Number(raw.voteAdSeconds) || Number(ads.minWatchSeconds) || 0)),
    turnstileSiteKey: String(turnstile.siteKey || "").trim(),
    turnstileSecretKey: String(turnstile.secretKey || "").trim(),
    ads: {
      provider: ["mock", "adsense", "none"].includes(adProvider) ? adProvider : "mock",
      adsenseClient: String(ads.adsenseClient || "").trim(),
      adsenseSlot: String(ads.adsenseSlot || "").trim(),
      minWatchSeconds: Math.max(0, Math.min(120, Number(ads.minWatchSeconds) || Number(raw.voteAdSeconds) || 0)),
    },
    categories: BOARD_CATEGORIES.slice(),
    locales: BOARD_LOCALES.slice(),
  };
}

function featureGate(client?) {
  const cfg = boardsConfig(client);
  if (!cfg.enabled) {
    return { ok: false, status: 503, error: "boards_disabled", message: "La Bacheca non è attiva." };
  }
  return { ok: true, cfg };
}

function snowflakeOk(id?) {
  return /^\d{17,22}$/.test(String(id || "").trim());
}

/* siteApiFetchLiteBoot1: prefer fetchLite on site-api REST client */
async function fetchGuildPreferLite(client?, guildId?) {
  const gid = String(guildId || "").trim();
  if (!client?.guilds || !snowflakeOk(gid)) return null;
  const cached = client.guilds.cache?.get?.(gid) || null;
  if (cached?.members && typeof cached.members.fetch === "function" && cached.partial !== true) {
    return cached;
  }
  try {
    const lite = client.guilds.fetchLite;
    if (client._isSiteApiRestClient && typeof lite === "function") {
      return await lite(gid);
    }
  } catch (_) {}
  try {
    return (await client.guilds.fetch?.(gid).catch(() => null)) || cached;
  } catch (_) {
    return cached;
  }
}

function slugify(input?) {
  const base = String(input || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "listing";
}

function sanitizeText(value?, max?) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .slice(0, max);
}

function sanitizeUrl(value?, max = 500) {
  let u = sanitizeText(value, max);
  if (!u) return "";
  /* boardsBannerUpload1: path file banner hostati sul sito */
  if (/^\/webhooks\/site-boards\/files\/\d+\/[a-z0-9._-]+$/i.test(u)) {
    return u.slice(0, max);
  }
  /* boardsBannerHttps1: Discord CDN sempre https (no mixed content in anteprima) */
  if (/^http:\/\/(?:[a-z0-9.-]+\.)?discord(?:app)?\.(?:com|net|gg|co)\//i.test(u)) {
    u = u.replace(/^http:\/\//i, "https://");
  }
  if (!/^https:\/\//i.test(u)) return "";
  try {
    const origin = cdnOrigin();
    if (origin && u.startsWith(`${origin}/uploads/site-boards/`)) return u.slice(0, max);
  } catch (_) {}
  return u;
}

function isUploadedBoardBannerUrl(url?) {
  const s = String(url || "");
  if (/\/webhooks\/site-boards\/files\/\d+\//i.test(s)) return true;
  try {
    const origin = cdnOrigin();
    return Boolean(origin && s.startsWith(`${origin}/uploads/site-boards/`));
  } catch (_) {
    return false;
  }
}

function boardBannerExtForMime(mime?) {
  const m = String(mime || "").toLowerCase();
  if (m === "image/png") return "png";
  if (m === "image/webp") return "webp";
  if (m === "image/gif") return "gif";
  return "jpg";
}

function parseBoardBannerDataUrl(raw?) {
  const s = String(raw || "").trim();
  const m = /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([a-z0-9+/=\s]+)$/i.exec(s);
  if (!m) return null;
  let mime = String(m[1] || "").toLowerCase();
  if (mime === "image/jpg") mime = "image/jpeg";
  if (!BOARD_BANNER_MIME.has(mime) && mime !== "image/jpeg") return null;
  let buf;
  try {
    buf = Buffer.from(String(m[2] || "").replace(/\s+/g, ""), "base64");
  } catch {
    return null;
  }
  if (!buf.length || buf.length > BOARD_BANNER_MAX_BYTES) return null;
  return { mime, buffer: buf };
}

async function uploadBoardBanner(client?, payload: Record<string, any> = {}) {
  /* boardsBannerAuthFix1: fetchDiscordOAuthMe → {ok,me}; usa resolveBoardsUser */
  const auth = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) {
    return {
      ok: false,
      status: Number(auth.status) || 401,
      error: auth.error || "unauthorized",
      message: auth.message || "Accedi con Discord.",
    };
  }
  const userId = String(auth.userId || "").trim();
  const parsed = parseBoardBannerDataUrl(payload.image || payload.dataUrl || payload.bannerImage);
  if (!parsed) {
    return {
      ok: false,
      status: 400,
      error: "invalid_image",
      message: "Carica un’immagine PNG, JPG, WEBP o GIF (max 2,5 MB).",
    };
  }
  const dir = path.join(BOARD_BANNER_UPLOAD_ROOT, userId);
  const name = `banner-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}.${boardBannerExtForMime(parsed.mime)}`;
  const fallbackUrl = `/webhooks/site-boards/files/${encodeURIComponent(userId)}/${encodeURIComponent(name)}`;
  const saved = await savePublicSiteMedia({
    diskPath: path.join(dir, name),
    buffer: parsed.buffer,
    cdnKey: `uploads/site-boards/${userId}/${name}`,
    contentType: parsed.mime,
    fallbackUrl,
  });
  const url = saved.url;
  return { ok: true, status: 200, url, bannerUrl: url, message: "Banner caricato." };
}

function resolveStoredBoardBannerFile(userId?, fileName?) {
  const uid = String(userId || "").trim();
  const name = String(fileName || "").trim();
  if (!/^\d{5,32}$/.test(uid) || !/^[a-z0-9._-]+$/i.test(name)) return null;
  const full = path.join(BOARD_BANNER_UPLOAD_ROOT, uid, name);
  if (!full.startsWith(path.join(BOARD_BANNER_UPLOAD_ROOT, uid))) return null;
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return null;
  return full;
}

function mimeFromBoardBannerFileName(fileName?) {
  const ext = path.extname(String(fileName || "")).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
}

async function serveBoardBannerFile(req?, res?) {
  const userId = String(req.params?.userId || "");
  const fileName = String(req.params?.fileName || "");
  const full = resolveStoredBoardBannerFile(userId, fileName);
  if (full) {
    res.setHeader("Content-Type", mimeFromBoardBannerFileName(fileName));
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.status(200).send(fs.readFileSync(full));
  }
  const { cdnUrlForKey } = require("./siteCdnMedia") as typeof import("./siteCdnMedia");
  const cdn = cdnUrlForKey(
    `uploads/site-boards/${decodeURIComponent(userId)}/${decodeURIComponent(fileName)}`,
  );
  if (cdn) {
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.redirect(301, cdn);
  }
  return res.status(404).json({ ok: false, error: "not_found", message: "File non trovato." });
}

function sanitizeTags(tags?, maxTags?) {
  const arr = Array.isArray(tags) ? tags : String(tags || "").split(/[,;]/);
  const out = [];
  const seen = new Set();
  for (const raw of arr) {
    const t = sanitizeText(raw, 32).toLowerCase().replace(/\s+/g, "-");
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= maxTags) break;
  }
  return out;
}

/** Substring match senza String#includes/indexOf (host patch / filter su "game"). */
function tagMatchesQuery(tag?, q?) {
  const hay = String(tag || "").toLowerCase();
  const needle = String(q || "").toLowerCase();
  if (!needle) return true;
  if (hay.length < needle.length) return false;
  outer: for (let i = 0; i <= hay.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (hay.charCodeAt(i + j) !== needle.charCodeAt(j)) continue outer;
    }
    return true;
  }
  return false;
}

function sanitizeCategories(raw?, maxCategories?) {
  const max = Math.max(1, Math.min(24, Number(maxCategories) || 12));
  const arr = Array.isArray(raw) ? raw : String(raw || "").split(/[,;]/);
  const out = [];
  const seen = new Set();
  for (const item of arr) {
    const t = sanitizeText(item, 32).toLowerCase().replace(/[^a-z0-9_\-]/g, "");
    if (!BOARD_CATEGORIES.includes(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

function sanitizeLocales(raw?, maxLocales?) {
  const max = Math.max(1, Math.min(32, Number(maxLocales) || 32));
  const arr = Array.isArray(raw) ? raw : String(raw || "").split(/[,;]/);
  const out = [];
  const seen = new Set();
  for (const item of arr) {
    const t = sanitizeText(item, 8).toLowerCase();
    if (!BOARD_LOCALES.includes(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/* boardsFormPrefill1: social handle (@nick) → URL canonico */
const SOCIAL_HANDLE_BUILDERS = {
  youtube: (h?) => `https://www.youtube.com/@${h}`,
  twitch: (h?) => `https://www.twitch.tv/${h}`,
  instagram: (h?) => `https://www.instagram.com/${h}`,
  tiktok: (h?) => `https://www.tiktok.com/@${h}`,
  x: (h?) => `https://x.com/${h}`,
  github: (h?) => `https://github.com/${h}`,
  website: (h?) => (/^https?:\/\//i.test(h) ? h : `https://${h}`),
};

function normalizeSocialHandle(key?, raw?) {
  let v = String(raw || "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v) || (key === "website" && /\./.test(v))) {
    return sanitizeUrl(key === "website" && !/^https?:\/\//i.test(v) ? `https://${v}` : v, 500);
  }
  v = v.replace(/^@+/, "").replace(/^\/+/, "").trim();
  v = v.replace(
    /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:@|c\/|channel\/)?|twitch\.tv\/|instagram\.com\/|tiktok\.com\/@?|x\.com\/|twitter\.com\/|github\.com\/)/i,
    "",
  );
  v = v.split(/[/?#]/)[0].replace(/^@+/, "").trim();
  if (!v || v.length > 64) return "";
  if (key !== "website" && !/^[A-Za-z0-9._-]+$/.test(v)) return "";
  const builder = SOCIAL_HANDLE_BUILDERS[key];
  return builder ? sanitizeUrl(builder(v), 500) : "";
}

function sanitizeSocials(raw?) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, any> = {};
  for (const key of BOARD_SOCIAL_KEYS) {
    const v = normalizeSocialHandle(key, raw[key]);
    if (v) out[key] = v;
  }
  return out;
}

function discordGuildBannerUrl(guild?) {
  if (!guild?.id || !guild.banner) return "";
  const hash = String(guild.banner);
  const ext = hash.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/banners/${guild.id}/${hash}.${ext}?size=1024`;
}

/* boardsAnimIcon1: icone/banner Discord a_* → .gif (non .png statico) */
function discordGuildIconUrl(guildOrId?, iconHash?, size = 128) {
  const gid = String(guildOrId?.id || guildOrId || "").trim();
  const hash = String(guildOrId?.icon || iconHash || "").trim();
  if (!gid || !hash) return "";
  const ext = hash.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/icons/${gid}/${hash}.${ext}?size=${size}`;
}

function preferAnimatedDiscordMediaUrl(url?) {
  let u = String(url || "").trim();
  if (!u) return "";
  /* boardsAnimIcon2 + boardsAnimIconForce1: anche cdn.discord.com / media.discordapp.net */
  if (
    /(?:cdn\.discordapp\.com|cdn\.discord\.com|media\.discordapp\.net)\/(?:icons|banners|avatars|app-icons|guilds)\//i.test(
      u,
    ) &&
    (/\/a_[a-f0-9]+\./i.test(u) || /[?&]animated=true(?:&|$)/i.test(u) || /\.gif(?:$|[?#])/i.test(u))
  ) {
    u = u.replace(/\.(png|webp|jpg|jpeg)(\?|$)/i, ".gif$2");
    u = u.replace(/([?&])format=(?:png|webp|jpeg|jpg)(&|$)/gi, (_m?, sep?, trail?) => (trail === "&" ? sep : ""));
    u = u.replace(/([?&])animated=false(&|$)/gi, (_m?, sep?, trail?) => (trail === "&" ? sep : ""));
  }
  return u;
}

function discordGuildInviteHint(guild?) {
  const code = String(guild?.vanityURLCode || "").trim();
  if (!code) return "";
  return sanitizeUrl(`https://discord.gg/${code}`);
}

async function resolveGuildBoardDefaults(client?, guildId?) {
  const gid = String(guildId || "").trim();
  if (!snowflakeOk(gid) || !client) return { inviteUrl: "", bannerUrl: "", siteUrl: "" };
  let guild = null;
  try {
    guild = client.guilds.cache.get(gid) || (await fetchGuildPreferLite(client, gid));
  } catch (_) {
    guild = null;
  }
  if (!guild) return { inviteUrl: "", bannerUrl: "", siteUrl: "" };
  try {
    if (!guild.vanityURLCode && guild.features?.includes?.("VANITY_URL")) {
      await guild.fetch().catch(() => null);
    }
  } catch (_) {}
  const siteUrl =
    MAIN_GUILD_ID && String(guild.id) === MAIN_GUILD_ID ? MAIN_GUILD_SITE : "";
  return {
    inviteUrl: discordGuildInviteHint(guild) || "",
    bannerUrl: discordGuildBannerUrl(guild) || "",
    siteUrl,
  };
}

function sanitizeAccent(value?) {
  const v = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
  return "";
}

function viniliBotInviteUrl(client?, guildId?) {
  /* botInviteScopes2: always Vinili official + code grant invite */
  const official = String(
    process.env.DISCORD_CLIENT_ID_OFFICIAL ||
      process.env.DISCORD_CLIENT_ID ||
      client?.config?.clientId ||
      client?.user?.id ||
      "",
  ).trim();
  const clientId = snowflakeOk(official) ? official : "";
  if (!clientId) return "";
  const params = new URLSearchParams({
    client_id: clientId,
    permissions: String(PermissionFlagsBits.Administrator),
    response_type: "code",
    redirect_uri: "https://viniliecaffe.it/",
    integration_type: "0",
    scope: "applications.commands.permissions.update bot applications.commands guilds.join",
    prompt: "none",
  });
  const gid = String(guildId || "").trim();
  if (snowflakeOk(gid)) {
    params.set("guild_id", gid);
    params.set("disable_guild_select", "true");
  }
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

function listingChecklist(doc?, cfgIn?) {
  const cfg = cfgIn && typeof cfgIn === "object" ? cfgIn : {};
  const minTagline = Math.max(8, Math.min(80, Number(cfg.minTaglineChars) || 20));
  const minDesc = Math.max(20, Math.min(500, Number(cfg.minDescriptionChars) || 80));
  const kind = String(doc?.boardKind || "") === "bot" ? "bot" : "server";
  const name = String(doc?.title || "").trim();
  const tagline = String(doc?.boardTagline || "").trim();
  /* boardsKeepMdDraft1: preferisci boardMarkdown (md lungo) a content */
  const description = String(doc?.boardMarkdown || doc?.content || "").trim();
  const categories = sanitizeCategories(doc?.boardCategories);
  const locales = sanitizeLocales(doc?.boardLocales?.length ? doc.boardLocales : doc?.boardLocale);
  const inviteUrl = String(doc?.boardInviteUrl || "").trim();
  const botInviteUrl = String(doc?.boardBotInviteUrl || "").trim();
  const inviteOk =
    kind === "bot"
      ? Boolean(sanitizeUrl(botInviteUrl) || sanitizeUrl(inviteUrl))
      : Boolean(sanitizeUrl(inviteUrl));
  const items = [
    { id: "name", required: true, ok: Boolean(name), label: "Nome" },
    {
      id: "tagline",
      required: true,
      ok: tagline.length >= minTagline,
      label: "Descrizione breve (min. " + minTagline + " caratteri)",
    },
    {
      id: "description",
      required: true,
      ok: description.length >= minDesc,
      label: "Descrizione completa (min. " + minDesc + " caratteri)",
    },
    { id: "categories", required: true, ok: categories.length >= 1, label: "Almeno una categoria" },
    { id: "locales", required: true, ok: locales.length >= 1, label: "Almeno una lingua" },
    { id: "invite", required: true, ok: inviteOk, label: kind === "bot" ? "Invite bot" : "Invite server" },
    {
      id: "siteUrl",
      required: false,
      ok: Boolean(sanitizeUrl(doc?.boardSiteUrl)),
      label: "Sito web",
    },
    {
      id: "socials",
      required: false,
      ok: Object.keys(sanitizeSocials(doc?.boardSocials)).length > 0,
      label: "Profili social",
    },
  ];
  const missing = items.filter((i?) => i.required && !i.ok).map((i?) => i.id);
  return { items, missing, complete: missing.length === 0, categories, locales };
}

function hashIp(ip?) {
  const raw = String(ip || "").trim();
  if (!raw) return "";
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 40);
}

function clientIp(req?) {
  const xf = String(req?.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return xf || String(req?.socket?.remoteAddress || "").trim();
}

function dayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function listingVotesMonth(doc?) {
  const key = voteCountMonthKeyRome();
  if (String(doc?.boardVotesMonthKey || "") !== key) return 0;
  return Math.max(0, Number(doc?.boardVotesMonth) || 0);
}

/* boardsFeatures1 */
function sanitizeBoardFeatures(raw?) {
  const src = raw && typeof raw === "object" ? raw : {};
  const paidTier = String(src.paidTier || src.hasPaidFeatures || "free")
    .trim()
    .toLowerCase();
  return {
    paidTier: paidTier === "paid" ? "paid" : "free",
    paidFeaturesAvailable: Boolean(src.paidFeaturesAvailable),
    acceptsPartnerships: Boolean(src.acceptsPartnerships),
    requireVerification: Boolean(src.requireVerification),
  };
}

function computeScore(votes30d?, bumps7d?, cfg?) {
  return Math.max(0, Number(votes30d) || 0) * cfg.scoreVotesWeight + Math.max(0, Number(bumps7d) || 0) * cfg.scoreBumpsWeight;
}

/* boardsVoteFlow1: sessioni voto (countdown → ad → turnstile) */
const voteSessions = new Map();
const VOTE_SESSION_TTL_MS = 15 * 60 * 1000;

function pruneVoteSessions() {
  const now = Date.now();
  for (const [id, sess] of voteSessions) {
    if (!sess || now - Number(sess.createdAt || 0) > VOTE_SESSION_TTL_MS) voteSessions.delete(id);
  }
  if (voteSessions.size > 5000) {
    const entries = [...voteSessions.entries()].sort((a?, b?) => a[1].createdAt - b[1].createdAt);
    for (let i = 0; i < entries.length - 4000; i += 1) voteSessions.delete(entries[i][0]);
  }
}

async function verifyTurnstileToken(secret?, token?, ip?) {
  const sec = String(secret || "").trim();
  const tok = String(token || "").trim();
  if (!sec) return { ok: true, skipped: true };
  if (!tok) return { ok: false, error: "missing_turnstile" };
  try {
    const body = new URLSearchParams();
    body.set("secret", sec);
    body.set("response", tok);
    if (ip) body.set("remoteip", String(ip));
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const data: any = await res.json().catch(() => null);
    if (data && data.success === true) return { ok: true };
    return { ok: false, error: "turnstile_failed", codes: data?.["error-codes"] || [] };
  } catch (err) {
    global.logger?.warn?.("[boards] turnstile verify:", err?.message || err);
    return { ok: false, error: "turnstile_error" };
  }
}

async function canUserVoteListing(listingId?, userId?, cfg?) {
  const id = String(listingId || "").trim();
  const uid = String(userId || "").trim();
  if (!id || !uid) return { ok: false, status: 400, error: "invalid", message: "Dati voto non validi." };
  const dedupe = `${id}:${uid}:${dayKey()}`;
  const existing = await SiteDocument.findOne({ docType: BV, dedupeKey: dedupe }).lean();
  if (existing) {
    return {
      ok: false,
      status: 429,
      error: "vote_cooldown",
      message: `Puoi votare di nuovo tra circa ${cfg.voteCooldownHours} ore (max 1 voto/giorno).`,
      nextVoteAt: null,
    };
  }
  const since = new Date(Date.now() - cfg.voteCooldownHours * 60 * 60 * 1000);
  const recent: any = await SiteDocument.findOne({
    docType: BV,
    boardListingId: id,
    userId: uid,
    createdAt: { $gte: since },
  })
    .sort({ createdAt: -1 })
    .lean();
  if (recent) {
    const next = new Date(new Date(recent.createdAt).getTime() + cfg.voteCooldownHours * 60 * 60 * 1000);
    return {
      ok: false,
      status: 429,
      error: "vote_cooldown",
      message: "Hai già votato di recente per questa scheda.",
      nextVoteAt: next.toISOString(),
    };
  }
  return { ok: true };
}

/* boardsListLite1: fields for public list cards (no markdown blob / moderation) */
const LIST_CARD_SELECT =
  "userId ownerId authorName authorAvatar authorAvatarHash authorAvatarUrl " +
  "title content boardKind boardDiscordId boardSlug status boardTagline boardMarkdown " +
  "boardTags boardCategories boardLocales boardLocale boardVisitorNotes boardSiteUrl " +
  "boardSocials boardInviteUrl boardBotInviteUrl boardBannerUrl boardIconUrl boardNsfw " +
  "boardFeatures boardScore boardVotes30d boardVotesMonth boardVotesMonthKey boardBumps7d " +
  "boardBumpedAt boardRatingAvg boardReviewsCount boardAccent boardStats createdAt updatedAt";

function serializeListing(doc?, opts: Record<string, any> = {}) {
  if (!doc) return null;
  const card = String(opts.mode || "") === "card";
  const wf = doc.boardModeration && typeof doc.boardModeration === "object" ? doc.boardModeration : {};
  const categories = sanitizeCategories(doc.boardCategories);
  const locales = sanitizeLocales(
    Array.isArray(doc.boardLocales) && doc.boardLocales.length
      ? doc.boardLocales
      : doc.boardLocale
        ? [doc.boardLocale]
        : [],
  );
  const socials = card ? {} : sanitizeSocials(doc.boardSocials);
  const checklist = listingChecklist(doc);
  const ownerUserId = String(doc.userId || doc.ownerId || "").trim();
  const authorName = String(
    doc.authorName ||
      (doc.boardModeration && doc.boardModeration.submittedByName) ||
      "",
  ).trim();
  const authorAvatar = String(doc.authorAvatar || doc.authorAvatarHash || "").trim();
  let authorAvatarUrl = preferAnimatedDiscordMediaUrl(String(doc.authorAvatarUrl || "").trim());
  if (!authorAvatarUrl && ownerUserId && authorAvatar) {
    const ext = /^a_/i.test(authorAvatar) ? "gif" : "png";
    authorAvatarUrl = `https://cdn.discordapp.com/avatars/${ownerUserId}/${authorAvatar}.${ext}?size=64`;
  }
  /* boardsListLite1: card → tagline/short desc only (skip full markdown payload) */
  const rawDesc = String(doc.boardMarkdown || doc.content || "");
  const description = card
    ? String(doc.boardTagline || "").trim() || rawDesc.slice(0, 280)
    : rawDesc;
  const out: Record<string, any> = {
    id: String(doc._id),
    kind: String(doc.boardKind || ""),
    discordId: String(doc.boardDiscordId || ""),
    slug: String(doc.boardSlug || ""),
    status: String(doc.status || ""),
    ownerUserId,
    authorName,
    authorAvatar,
    authorAvatarUrl,
    name: String(doc.title || ""),
    tagline: String(doc.boardTagline || ""),
    description,
    tags: Array.isArray(doc.boardTags) ? doc.boardTags.map(String).slice(0, card ? 12 : 48) : [],
    categories,
    locales,
    locale: locales[0] || String(doc.boardLocale || ""),
    visitorNotes: card ? "" : String(doc.boardVisitorNotes || ""),
    siteUrl: String(doc.boardSiteUrl || ""),
    socials,
    inviteUrl: String(doc.boardInviteUrl || ""),
    botInviteUrl: String(doc.boardBotInviteUrl || ""),
    bannerUrl: preferAnimatedDiscordMediaUrl(String(doc.boardBannerUrl || "")),
    iconUrl: preferAnimatedDiscordMediaUrl(String(doc.boardIconUrl || "")),
    nsfw: Boolean(doc.boardNsfw) || categories.includes("nsfw"),
    /* boardsFeatures1 */
    features: card ? [] : sanitizeBoardFeatures(doc.boardFeatures),
    score: Number(doc.boardScore) || 0,
    votes30d: Number(doc.boardVotes30d) || 0,
    /* boardsVoteFlow1 */
    votesMonth: listingVotesMonth(doc),
    votesMonthKey: voteCountMonthKeyRome(),
    bumps7d: Number(doc.boardBumps7d) || 0,
    bumpedAt: doc.boardBumpedAt ? new Date(doc.boardBumpedAt).toISOString() : null,
    ratingAvg: Number(doc.boardRatingAvg) || 0,
    reviewsCount: Number(doc.boardReviewsCount) || 0,
    accent: String(doc.boardAccent || ""),
    markdown: "",
    stats: card
      ? {}
      : doc.boardStats && typeof doc.boardStats === "object"
        ? doc.boardStats
        : {},
    checklist,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
  };
  if (opts.includeMod) {
    out.moderation = {
      notes: String(wf.notes || ""),
      reviewedBy: String(wf.reviewedBy || ""),
      reviewedAt: wf.reviewedAt ? String(wf.reviewedAt) : null,
      rejectReason: String(wf.rejectReason || doc.staffReason || ""),
    };
  }
  return out;
}

async function resolveBoardsUser(accessToken?) {
  const token = String(accessToken || "").trim();
  if (!token) {
    return { ok: false, status: 401, error: "missing_token", message: "Sessione Discord mancante: effettua il login." };
  }
  const meRes = await fetchDiscordOAuthMe(token);
  if (!meRes?.ok || !meRes.me) {
    return {
      ok: false,
      status: Number(meRes?.status) || 401,
      error: meRes?.error || "invalid_token",
      message: meRes?.message || "Sessione Discord non valida o scaduta.",
    };
  }
  const me = meRes.me;
  const userId = String(me.id || "").trim();
  if (!snowflakeOk(userId)) {
    return { ok: false, status: 401, error: "invalid_user", message: "Profilo Discord non valido." };
  }
  return {
    ok: true,
    userId,
    username: String(me.username || "").trim(),
    globalName: String(me.global_name || "").trim(),
    avatar: me.avatar || null,
  };
}

async function fetchManageableGuilds(accessToken?) {
  const token = String(accessToken || "").trim();
  if (!token) {
    return { ok: false, status: 401, error: "missing_token", message: "Sessione Discord mancante." };
  }
  try {
    const res = await fetch("https://discord.com/api/v10/users/@me/guilds", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "User-Agent": "DiscordBot (https://www.viniliecaffe.it, 1.0)",
      },
    });
    if (res.status === 401 || res.status === 403) {
      /* Discord spesso risponde 401 anche senza scope guilds (non solo token scaduto) */
      return {
        ok: false,
        status: res.status === 403 ? 403 : 401,
        error: "missing_guilds_scope",
        message:
          "Serve il permesso guilds: clicca “Rifai login Discord” e autorizza l’accesso ai tuoi server.",
      };
    }
    if (!res.ok) {
      return { ok: false, status: 502, error: "discord_guilds_failed", message: "Impossibile recuperare i server." };
    }
    const json: any = await res.json();
    /* boardsOwnerOnly1: solo server di cui l’utente è owner Discord (no admin / gestisci server) */
    const guilds = (Array.isArray(json) ? json : []).filter((row?) => row?.owner === true);
    return { ok: true, guilds };
  } catch {
    return { ok: false, status: 502, error: "discord_unreachable", message: "Discord non raggiungibile." };
  }
}

async function uniqueSlug(base?) {
  let slug = slugify(base);
  for (let i = 0; i < 12; i += 1) {
    const candidate = i === 0 ? slug : `${slug}-${i + 1}`;
    const exists = await SiteDocument.exists({ docType: BL, boardSlug: candidate });
    if (!exists) return candidate;
  }
  return `${slug}-${Date.now().toString(36)}`;
}

async function assertBotInGuild(client?, guildId?) {
  const gid = String(guildId || "").trim();
  if (!snowflakeOk(gid) || !client) return false;
  try {
    await syncKnownBotGuildIdsFromRest(client).catch(() => null);
  } catch (_) {}
  const known = buildKnownBotGuildIdSet(client);
  if (known.has(gid)) return true;
  try {
    const g = client.guilds.cache.get(gid) || (await fetchGuildPreferLite(client, gid));
    return Boolean(g);
  } catch {
    return false;
  }
}

async function assertCanClaimServer(client?, accessToken?, discordId?) {
  const gid = String(discordId || "").trim();
  if (!snowflakeOk(gid)) {
    return { ok: false, status: 400, error: "invalid_discord_id", message: "ID server non valido." };
  }
  const list = await fetchManageableGuilds(accessToken);
  if (!list?.ok) {
    return {
      ok: false,
      status: Number(list?.status) || 403,
      error: list?.error || "guilds_failed",
      message: list?.message || "Impossibile verificare i tuoi server.",
    };
  }
  const match = (Array.isArray(list.guilds) ? list.guilds : []).find((g?) => String(g?.id || "") === gid);
  if (!match) {
    return {
      ok: false,
      status: 403,
      error: "not_owner",
      message: "Puoi pubblicare solo server di cui sei il proprietario Discord.",
    };
  }
  const botOk = await assertBotInGuild(client, gid);
  if (!botOk) {
    return {
      ok: false,
      status: 403,
      error: "bot_not_in_guild",
      message:
        "Il bot Vinili & Caffè deve essere presente nel server. Invitalo e riprova.",
    };
  }
  return {
    ok: true,
    guild: match,
    name: String(match.name || "").trim() || `Server ${gid}`,
    iconUrl: match.icon ? discordGuildIconUrl(gid, match.icon, 128) : "",
    botPresent: true,
  };
}

async function recomputeListingScore(listingId?, cfg?) {
  const id = String(listingId || "").trim();
  if (!mongoose.isValidObjectId(id)) return;
  const sinceVote = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sinceBump = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [votes30d, bumps7d] = await Promise.all([
    SiteDocument.countDocuments({ docType: BV, boardListingId: id, createdAt: { $gte: sinceVote } }),
    SiteDocument.countDocuments({ docType: BB, boardListingId: id, createdAt: { $gte: sinceBump } }),
  ]);
  const score = computeScore(votes30d, bumps7d, cfg);
  await SiteDocument.updateOne(
    { _id: id, docType: BL },
    { $set: { boardVotes30d: votes30d, boardBumps7d: bumps7d, boardScore: score } },
  );
  return { votes30d, bumps7d, score };
}

async function listListingsUncached(client?, query: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const cfg = gate.cfg;
  if (!cfg.publicOpen && !query.allowClosed) {
    return {
      ok: true,
      status: 200,
      page: 1,
      perPage: 0,
      total: 0,
      listings: [],
      enabled: cfg.enabled,
      publicOpen: false,
      message: "La Bacheca è in anteprima staff. Torna presto.",
    };
  }
  const kind = String(query.kind || "").trim().toLowerCase();
  const q = sanitizeText(query.q, 80).toLowerCase();
  const tag = sanitizeText(query.tag, 32).toLowerCase();
  /* boardsExploreChipFilter1: filtri esatti da chip scheda (cat/lang/guild tag) */
  const category = sanitizeText(query.category, 40).toLowerCase();
  const locale = sanitizeText(query.locale, 16).toLowerCase();
  const guildTag = sanitizeText(query.guildTag || query.guildtag, 8);
  const sort = String(query.sort || "score").trim().toLowerCase();
  const page = Math.max(1, Number(query.page) || 1);
  const perPage = Math.min(48, Math.max(1, Number(query.perPage) || 24));
  const filter: Record<string, any> = { docType: BL, status: "approved" };
  if (kind === "server" || kind === "bot") filter.boardKind = kind;
  if (tag) filter.boardTags = tag;
  if (category) filter.boardCategories = category;
  if (locale) filter.boardLocales = locale;
  if (guildTag) {
    const gRx = new RegExp(
      `^${guildTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
      "i",
    );
    filter["boardStats.guildTag"] = gRx;
  }
  /* con filtro chip esatto, q resta solo label in UI (non restringe ulteriormente) */
  const chipExact = Boolean(tag || category || locale || guildTag);
  if (q && !chipExact) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [
      { title: rx },
      { boardTagline: rx },
      { boardSlug: rx },
      { boardTags: rx },
      { boardInviteUrl: rx },
      { boardBotInviteUrl: rx },
      { boardCategories: rx },
      { boardLocales: rx },
      { "boardStats.guildTag": rx },
      { content: rx },
    ];
  }
  let sortSpec: any = { boardScore: -1, boardBumpedAt: -1, createdAt: -1 };
  if (sort === "new") sortSpec = { createdAt: -1 };
  else if (sort === "bumps") sortSpec = { boardBumpedAt: -1, boardScore: -1 };
  else if (sort === "votes") sortSpec = { boardVotes30d: -1, boardScore: -1 };
  /* boardsSortReviews1: media stelle, poi n. recensioni */
  else if (sort === "reviews" || sort === "rating" || sort === "recensioni") {
    sortSpec = { boardRatingAvg: -1, boardReviewsCount: -1, boardScore: -1, createdAt: -1 };
  }

  const total = await SiteDocument.countDocuments(filter);
  /* boardsListLite1: projection + card serialize (no full markdown blobs) */
  const rows = await SiteDocument.find(filter)
    .select(LIST_CARD_SELECT)
    .sort((sortSpec as any))
    .skip((page - 1) * perPage)
    .limit(perPage)
    .lean();
  return {
    ok: true,
    status: 200,
    page,
    perPage,
    total,
    listings: rows.map((r?) => serializeListing(r, { mode: "card" })),
    enabled: cfg.enabled,
    publicOpen: cfg.publicOpen,
  };
}

async function listListings(client?, query: Record<string, any> = {}) {
  const key = listingsCacheKey(query);
  const hit = readListingsCache(key);
  if (hit?.fresh) return hit.payload;
  if (hit && !hit.fresh) {
    if (!listingsInflight.has(key)) {
      const p = listListingsUncached(client, query)
        .then((payload?) => {
          if (payload?.ok) writeListingsCache(key, payload);
          return payload;
        })
        .catch((err?) => {
          global.logger?.warn?.("[site-boards] listings refresh:", err?.message || err);
          return hit.payload;
        })
        .finally(() => listingsInflight.delete(key));
      listingsInflight.set(key, p);
    }
    return hit.payload;
  }
  let inflight = listingsInflight.get(key);
  if (!inflight) {
    inflight = listListingsUncached(client, query)
      .then((payload?) => {
        if (payload?.ok) writeListingsCache(key, payload);
        return payload;
      })
      .finally(() => listingsInflight.delete(key));
    listingsInflight.set(key, inflight);
  }
  return inflight;
}

function warmSiteBoardsListingsCache(client?) {
  return listListings(client, { sort: "score", page: 1, perPage: 24 }).catch((err?) => {
    global.logger?.warn?.("[site-boards] listings warm:", err?.message || err);
    return null;
  });
}

async function enrichListingAuthor(client?, listing?) {
  if (!listing || !listing.ownerUserId) return listing;
  if (listing.authorAvatarUrl && listing.authorName) return listing;
  try {
    const u =
      client?.users?.cache?.get(listing.ownerUserId) ||
      (await client?.users?.fetch?.(listing.ownerUserId).catch(() => null));
    if (!u) return listing;
    if (!listing.authorName) {
      listing.authorName = String(u.globalName || u.username || "").trim();
    }
    if (!listing.authorAvatar && u.avatar) {
      listing.authorAvatar = String(u.avatar);
    }
    if (!listing.authorAvatarUrl && u.displayAvatarURL) {
      listing.authorAvatarUrl = String(
        u.displayAvatarURL({ size: 64, extension: "png", forceStatic: false }),
      );
    } else if (!listing.authorAvatarUrl && listing.authorAvatar) {
      const ext = /^a_/i.test(listing.authorAvatar) ? "gif" : "png";
      listing.authorAvatarUrl = `https://cdn.discordapp.com/avatars/${listing.ownerUserId}/${listing.authorAvatar}.${ext}?size=64`;
    }
  } catch (_) {}
  return listing;
}

async function getListingBySlug(client?, slug?, opts: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const cfg = gate.cfg;
  const raw = String(slug || "").trim();
  let doc = null;
  /* boardsPendingRedirect1: accetta anche id Mongo nel path pubblico */
  if (mongoose.isValidObjectId(raw)) {
    doc = await SiteDocument.findOne({ _id: raw, docType: BL }).lean();
  }
  if (!doc) {
    const s = slugify(raw);
    if (s) doc = await SiteDocument.findOne({ docType: BL, boardSlug: s }).lean();
  }
  if (!doc) {
    return { ok: false, status: 404, error: "not_found", message: "Scheda non trovata." };
  }
  const st = String(doc.status || "").toLowerCase();
  /* boardsPendingRedirect1: pending/draft prima del gate publicOpen (redirect anche in anteprima) */
  if (st === "pending" || st === "draft" || st === "") {
    const token = String(opts.accessToken || "").trim();
    if (token) {
      const auth = await resolveBoardsUser(token);
      if (auth?.ok && String(auth.userId || "") === String(doc.userId || "")) {
        let listing = serializeListing(doc, { includeMod: true });
        if (!listing.authorName) listing.authorName = auth.globalName || auth.username || "";
        if (!listing.authorAvatar && auth.avatar) {
          listing.authorAvatar = String(auth.avatar);
          const ext = /^a_/i.test(listing.authorAvatar) ? "gif" : "png";
          listing.authorAvatarUrl = `https://cdn.discordapp.com/avatars/${auth.userId}/${listing.authorAvatar}.${ext}?size=64`;
        }
        await enrichListingAuthor(client, listing);
        listing = await refreshListingStats(client, listing);
        return {
          ok: true,
          status: 200,
          listing,
          ownerPreview: true,
          publicOpen: cfg.publicOpen,
        };
      }
    }
    return {
      ok: false,
      status: 404,
      error: "pending_not_public",
      message: "Questa scheda è in revisione e non è ancora pubblica.",
      kind: String(doc.boardKind || "") === "bot" ? "bot" : "server",
    };
  }
  if (st !== "approved") {
    return { ok: false, status: 404, error: "not_found", message: "Scheda non trovata." };
  }
  if (!cfg.publicOpen && !opts.allowClosed) {
    return {
      ok: false,
      status: 403,
      error: "boards_preview",
      message: "La Bacheca è in anteprima staff.",
      publicOpen: false,
    };
  }
  let listing = await enrichListingAuthor(client, serializeListing(doc));
  /* refresh membri on-read così la scheda mostra il conteggio (top.gg-like) */
  listing = await refreshListingStats(client, listing);
  return { ok: true, status: 200, listing, publicOpen: cfg.publicOpen };
}

function getBoardsPublicConfig(client?) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const ads: any = gate.cfg.ads || {};
  return {
    ok: true,
    status: 200,
    enabled: gate.cfg.enabled,
    publicOpen: gate.cfg.publicOpen,
    voteCooldownHours: gate.cfg.voteCooldownHours,
    bumpCooldownHours: gate.cfg.bumpCooldownHours,
    maxTags: gate.cfg.maxTags,
    maxCategories: gate.cfg.maxCategories,
    maxLocales: gate.cfg.maxLocales,
    maxMarkdownChars: gate.cfg.maxMarkdownChars,
    minTaglineChars: gate.cfg.minTaglineChars,
    minDescriptionChars: gate.cfg.minDescriptionChars,
    categories: gate.cfg.categories,
    locales: gate.cfg.locales,
    categoryLabels: Object.assign({}, BOARD_CATEGORY_LABELS),
    localeLabels: Object.assign({}, BOARD_LOCALE_LABELS),
    suggestedTags: BOARD_TAG_CATALOG.slice(),
    botInviteUrl: viniliBotInviteUrl(client, null),
    /* boardsVoteFlow1 — niente secret Turnstile in pubblico */
    voteCountdownSeconds: gate.cfg.voteCountdownSeconds,
    voteAdSeconds: gate.cfg.voteAdSeconds,
    turnstileSiteKey: gate.cfg.turnstileSiteKey || "",
    turnstileRequired: Boolean(gate.cfg.turnstileSecretKey),
    ads: {
      provider: ads.provider || "mock",
      adsenseClient: ads.adsenseClient || "",
      adsenseSlot: ads.adsenseSlot || "",
      minWatchSeconds: ads.minWatchSeconds || gate.cfg.voteAdSeconds,
    },
  };
}

async function listBoardTags(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const q = sanitizeText(payload.q || "", 40).toLowerCase().replace(/\s+/g, "-");
  const limit = Math.min(250, Math.max(40, Number(payload.limit) || 160));
  const used = new Map();
  try {
    const rows = await SiteDocument.aggregate([
      {
        $match: {
          docType: BL,
          boardTags: { $exists: true, $type: "array", $ne: [] },
        },
      },
      { $unwind: "$boardTags" },
      { $group: { _id: "$boardTags", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 800 },
    ]);
    for (const row of rows) {
      const tag = sanitizeText(row?._id, 32).toLowerCase().replace(/\s+/g, "-");
      if (!tag) continue;
      used.set(tag, Number(row.count) || 0);
    }
  } catch (err) {
    global.logger?.warn?.("[boards] listBoardTags aggregate:", err?.message || err);
  }

  const merged = new Map();
  for (const t of BOARD_TAG_CATALOG) {
    merged.set(t, { tag: t, count: used.get(t) || 0, source: true });
  }
  for (const [t, count] of used.entries()) {
    if (!merged.has(t)) merged.set(t, { tag: t, count, source: "user" });
    else merged.get(t).count = count;
  }

  let items = Array.from(merged.values());
  if (q) {
    items = items.filter((x?) => tagMatchesQuery(String(x.tag || ""), q));
  }
  items.sort((a?, b?) => b.count - a.count || a.tag.localeCompare(b.tag));
  items = items.slice(0, limit);
  return {
    ok: true,
    status: 200,
    maxTags: gate.cfg.maxTags,
    tags: items.map((x?) => x.tag),
    items,
  };
}

async function createListing(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const cfg = gate.cfg;
  const auth = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;

  const kind = String(payload.kind || "").trim().toLowerCase();
  if (kind !== "server" && kind !== "bot") {
    return { ok: false, status: 400, error: "invalid_kind", message: "kind deve essere server o bot." };
  }

  let discordId = String(payload.discordId || "").trim();
  let name = sanitizeText(payload.name, 100);
  let iconUrl = sanitizeUrl(payload.iconUrl);
  let inviteUrl = sanitizeUrl(payload.inviteUrl);
  let botInviteUrl = sanitizeUrl(payload.botInviteUrl);
  const wantPending =
    payload.submit === true || String(payload.status || "").trim().toLowerCase() === "pending";

  if (kind === "server") {
    const claim = await assertCanClaimServer(client, payload.accessToken, discordId);
    if (!claim.ok) return claim;
    if (!name) name = claim.name;
    if (!iconUrl) iconUrl = claim.iconUrl;
  } else {
    if (!snowflakeOk(discordId)) {
      return { ok: false, status: 400, error: "invalid_discord_id", message: "Bot Client ID non valido." };
    }
    if (!name) {
      return { ok: false, status: 400, error: "missing_name", message: "Nome bot obbligatorio." };
    }
    if (!botInviteUrl) {
      botInviteUrl = `https://discord.com/oauth2/authorize?client_id=${discordId}&scope=bot%20applications.commands&permissions=0`;
    }
  }

  const ownDraft = await SiteDocument.findOne({
    docType: BL,
    boardDiscordId: discordId,
    userId: auth.userId,
    status: "draft",
  });
  if (ownDraft) {
    return {
      ok: true,
      status: 200,
      resumed: true,
      listing: serializeListing(ownDraft.toObject(), { includeMod: true }),
      message: "Bozza esistente ripresa.",
    };
  }

  const dup: any = await SiteDocument.findOne({
    docType: BL,
    boardDiscordId: discordId,
    status: { $in: ACTIVE_STATUSES },
  }).lean();
  if (dup) {
    return {
      ok: false,
      status: 409,
      error: "duplicate",
      message: "Esiste già una scheda pending/approved per questo ID Discord.",
      listingId: String(dup._id),
    };
  }

  /* boardsTagline500: descrizione breve max 500 */
  const tagline = sanitizeText(payload.tagline, 500);
  const description = sanitizeText(
    payload.description || payload.markdown,
    Math.max(4000, cfg.maxMarkdownChars || 4000, 8000),
  );
  const tags = sanitizeTags(payload.tags, cfg.maxTags);
  const categories = sanitizeCategories(payload.categories, cfg.maxCategories);
  const locales = sanitizeLocales(payload.locales || payload.locale, cfg.maxLocales);
  const visitorNotes = sanitizeText(payload.visitorNotes, 1000);
  let siteUrl = sanitizeUrl(payload.siteUrl);
  const socials = sanitizeSocials(payload.socials);
  let bannerUrl = sanitizeUrl(payload.bannerUrl);
  if (kind === "server" && (!inviteUrl || !bannerUrl)) {
    const defs = await resolveGuildBoardDefaults(client, discordId);
    if (!inviteUrl && defs.inviteUrl) inviteUrl = defs.inviteUrl;
    if (!bannerUrl && defs.bannerUrl) bannerUrl = defs.bannerUrl;
    if (!siteUrl && defs.siteUrl) siteUrl = defs.siteUrl;
  }
  const locale = locales[0] || sanitizeText(payload.locale, 16).toLowerCase();
  const nsfw = Boolean(payload.nsfw) || categories.includes("nsfw");
  const accent = sanitizeAccent(payload.accent);
  const slug = await uniqueSlug(payload.slug || name || discordId);

  const draftDoc = {
    docType: BL,
    userId: auth.userId,
    ownerId: auth.userId,
    guildId: discordId,
    boardKind: kind,
    boardDiscordId: discordId,
    boardSlug: slug,
    status: "draft",
    title: name,
    boardTagline: tagline,
    content: description,
    boardTags: tags,
    boardCategories: categories,
    boardLocales: locales,
    boardVisitorNotes: visitorNotes,
    boardSiteUrl: siteUrl,
    boardSocials: socials,
    boardInviteUrl: inviteUrl,
    boardBotInviteUrl: botInviteUrl,
    boardBannerUrl: bannerUrl,
    boardIconUrl: iconUrl,
    boardLocale: locale,
    boardNsfw: nsfw,
    boardAccent: accent,
    boardMarkdown: description,
    boardFeatures: sanitizeBoardFeatures(payload.features),
    boardScore: 0,
    boardVotes30d: 0,
    boardBumps7d: 0,
    boardBumpedAt: null,
    boardStats: {},
    boardModeration: { notes: "", submittedByName: auth.globalName || auth.username || "" },
    authorName: auth.globalName || auth.username || "",
    authorAvatar: auth.avatar ? String(auth.avatar) : "",
  };

  if (wantPending) {
    const check = listingChecklist(draftDoc, cfg);
    if (!check.complete) {
      return {
        ok: false,
        status: 400,
        error: "incomplete",
        message: "Compila i campi obbligatori prima di inviare in moderazione.",
        checklist: check,
      };
    }
    draftDoc.status = "pending";
  }

  const doc = await SiteDocument.create(draftDoc);
  if (wantPending) {
    try {
      const { onBoardsListingPending } = require("./siteBoardsInboxBridge") as typeof import("./siteBoardsInboxBridge");
      void onBoardsListingPending(client, doc, {
        subjectName: auth.globalName || auth.username || "",
        notify: true,
      }).catch((err?) => {
        try {
          global.logger?.warn?.("[boards] onBoardsListingPending create failed:", err?.message || err);
        } catch (_) {}
      });
    } catch (err) {
      try {
        global.logger?.warn?.("[boards] onBoardsListingPending require/create failed:", err?.message || err);
      } catch (_) {}
    }
  }
  emitBoardsChanged(wantPending ? "submit" : "create", {
    listingId: String(doc._id),
    slug: String(doc.boardSlug || ""),
    kind: String(doc.boardKind || ""),
  });
  return {
    ok: true,
    status: 201,
    listing: serializeListing(doc.toObject(), { includeMod: true }),
  };
}

async function patchListing(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const cfg = gate.cfg;
  const auth = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  const id = String(payload.listingId || payload.id || "").trim();
  if (!mongoose.isValidObjectId(id)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID scheda non valido." };
  }
  const doc = await SiteDocument.findOne({ _id: id, docType: BL });
  if (!doc) return { ok: false, status: 404, error: "not_found", message: "Scheda non trovata." };
  if (String(doc.userId) !== auth.userId) {
    return { ok: false, status: 403, error: "forbidden", message: "Non sei il proprietario di questa scheda." };
  }
  if (doc.status === "suspended") {
    return { ok: false, status: 403, error: "suspended", message: "Scheda sospesa: contatta lo staff." };
  }

  const body = payload.patch && typeof payload.patch === "object" ? payload.patch : payload;
  /* boardsNoRependAfterApprove1: dopo approved le patch restano live, niente re-moderazione/notif */
  if (body.name != null) {
    doc.title = sanitizeText(body.name, 100) || doc.title;
  }
  if (body.tagline != null) {
    doc.boardTagline = sanitizeText(body.tagline, 500);
  }
  if (body.description != null) {
    /* boardsKeepMdDraft1: salva md in boardMarkdown+content, niente strip */
    const desc = sanitizeText(
      body.description,
      Math.max(4000, cfg.maxMarkdownChars || 4000, 8000),
    );
    doc.boardMarkdown = desc;
    doc.content = desc;
  }
  if (body.tags != null) doc.boardTags = sanitizeTags(body.tags, cfg.maxTags);
  if (body.categories != null) {
    doc.boardCategories = sanitizeCategories(body.categories, cfg.maxCategories);
  }
  if (body.locales != null || body.locale != null) {
    const locales = sanitizeLocales(body.locales != null ? body.locales : body.locale, cfg.maxLocales);
    doc.boardLocales = locales;
    if (locales[0]) doc.boardLocale = locales[0];
  }
  if (body.visitorNotes != null) doc.boardVisitorNotes = sanitizeText(body.visitorNotes, 1000);
  if (body.siteUrl != null) doc.boardSiteUrl = sanitizeUrl(body.siteUrl);
  if (body.socials != null) doc.boardSocials = sanitizeSocials(body.socials);
  if (body.features != null) doc.boardFeatures = sanitizeBoardFeatures(body.features);
  if (body.inviteUrl != null) {
    doc.boardInviteUrl = sanitizeUrl(body.inviteUrl);
  }
  if (body.botInviteUrl != null) {
    doc.boardBotInviteUrl = sanitizeUrl(body.botInviteUrl);
  }
  if (body.bannerUrl != null) doc.boardBannerUrl = sanitizeUrl(body.bannerUrl);
  if (body.iconUrl != null) doc.boardIconUrl = sanitizeUrl(body.iconUrl);
  if (body.locale != null && body.locales == null) {
    doc.boardLocale = sanitizeText(body.locale, 16).toLowerCase();
  }
  if (body.nsfw != null) doc.boardNsfw = Boolean(body.nsfw);
  if (body.accent != null) doc.boardAccent = sanitizeAccent(body.accent);
  if (Array.isArray(doc.boardCategories) && doc.boardCategories.includes("nsfw")) {
    doc.boardNsfw = true;
  }

  await doc.save();
  emitBoardsChanged("patch", {
    listingId: String(doc._id),
    slug: String(doc.boardSlug || ""),
    kind: String(doc.boardKind || ""),
  });
  return { ok: true, status: 200, listing: serializeListing(doc.toObject(), { includeMod: true }) };
}

async function listMine(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const auth = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  const rows = await SiteDocument.find({ docType: BL, userId: auth.userId }).sort({ updatedAt: -1 }).lean();
  return { ok: true, status: 200, listings: rows.map((r?) => serializeListing(r, { includeMod: true })) };
}

/* boardsMinePreview1: owner legge la propria scheda (anche pending/draft) */
async function getMyListingById(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const auth = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  const id = String(payload.listingId || payload.id || "").trim();
  if (!mongoose.isValidObjectId(id)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID scheda non valido." };
  }
  const doc = await SiteDocument.findOne({ _id: id, docType: BL, userId: auth.userId }).lean();
  if (!doc) return { ok: false, status: 404, error: "not_found", message: "Scheda non trovata." };
  let listing = serializeListing(doc, { includeMod: true });
  if (!listing.authorName) listing.authorName = auth.globalName || auth.username || "";
  if (!listing.authorAvatar && auth.avatar) {
    listing.authorAvatar = String(auth.avatar);
    const ext = /^a_/i.test(listing.authorAvatar) ? "gif" : "png";
    listing.authorAvatarUrl = `https://cdn.discordapp.com/avatars/${auth.userId}/${listing.authorAvatar}.${ext}?size=64`;
  }
  await enrichListingAuthor(client, listing);
  listing = await refreshListingStats(client, listing);
  return {
    ok: true,
    status: 200,
    listing,
    ownerPreview: true,
    publicOpen: gate.cfg.publicOpen,
  };
}

/* boardsBotLeftPurge1: cascade delete listing + votes/bumps/reports/reviews + banner */
async function purgeBoardListingDoc(client?, doc?, { reason = "purge" } = {}) {
  if (!doc) return { ok: false, deleted: false };
  const id = String(doc._id || "").trim();
  if (!id || !mongoose.isValidObjectId(id)) return { ok: false, deleted: false };
  const status = String(doc.status || "").trim().toLowerCase();

  try {
    const { onBoardsListingWithdrawn } = require("./siteBoardsInboxBridge") as typeof import("./siteBoardsInboxBridge");
    if (typeof onBoardsListingWithdrawn === "function") {
      await onBoardsListingWithdrawn(client, doc, { reason: String(reason || "purge") }).catch(() => null);
    }
  } catch (_) {}

  await Promise.allSettled([
    SiteDocument.deleteMany({ docType: BV, boardListingId: id }),
    SiteDocument.deleteMany({ docType: BB, boardListingId: id }),
    SiteDocument.deleteMany({ docType: BR, boardListingId: id }),
    SiteDocument.deleteMany({ docType: BREV, boardListingId: id }),
  ]);

  try {
    const bannerUrl = String(doc.boardBannerUrl || "").trim();
    if (bannerUrl.includes("/webhooks/site-boards/files/")) {
      const m = bannerUrl.match(/\/files\/([^/]+)\/([^/?#]+)/);
      if (m) {
        const filePath = path.join(BOARD_BANNER_UPLOAD_ROOT, m[1], m[2]);
        if (filePath.startsWith(BOARD_BANNER_UPLOAD_ROOT)) {
          fs.unlink(filePath, () => {});
        }
      }
    }
  } catch (_) {}

  await SiteDocument.deleteOne({ _id: id, docType: BL });
  emitBoardsChanged("purge", { listingId: id });
  return { ok: true, deleted: true, listingId: id, wasStatus: status };
}

/**
 * Bot uscito dal server: elimina tutte le schede bacheca di quel guild
 * (bozza/pending/approved/…) + dati collegati. Non tocca schede bot.
 */
async function deleteServerListingsForLeftGuild(client?, guildId?, opts: Record<string, any> = {}) {
  const gid = String(guildId || "").trim();
  if (!snowflakeOk(gid)) return { ok: false, deleted: 0, listingIds: [] };
  const reason = String(opts.reason || "bot_left_guild").trim() || "bot_left_guild";
  const docs = await SiteDocument.find({
    docType: BL,
    boardKind: "server",
    $or: [{ boardDiscordId: gid }, { guildId: gid }],
  }).catch(() => []);
  const listingIds = [];
  for (const doc of Array.isArray(docs) ? docs : []) {
    const result = await purgeBoardListingDoc(client, doc, { reason }).catch((err?) => {
      global.logger?.warn?.(
        "[boards] purge on guild leave failed:",
        gid,
        String(doc?._id || ""),
        err?.message || err,
      );
      return null;
    });
    if (result?.deleted) listingIds.push(String(result.listingId));
  }
  if (listingIds.length) {
    global.logger?.info?.(
      `[boards] bot left guild ${gid}: purged ${listingIds.length} server listing(s)`,
      listingIds.join(","),
    );
  }
  return { ok: true, deleted: listingIds.length, listingIds };
}

/* boardsMineDelete1: owner elimina bozza / ritira scheda propria */
async function deleteMyListing(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const auth = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  const id = String(payload.listingId || payload.id || "").trim();
  if (!mongoose.isValidObjectId(id)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID scheda non valido." };
  }
  const doc = await SiteDocument.findOne({ _id: id, docType: BL, userId: auth.userId });
  if (!doc) return { ok: false, status: 404, error: "not_found", message: "Scheda non trovata." };
  const status = String(doc.status || "").trim().toLowerCase();
  const deletable = new Set(["draft", "pending", "rejected", "approved", "suspended"]);
  if (!deletable.has(status)) {
    return {
      ok: false,
      status: 400,
      error: "not_deletable",
      message: "Questa scheda non può essere eliminata.",
    };
  }

  const purged = await purgeBoardListingDoc(client, doc, { reason: "owner_delete" });
  if (!purged?.deleted) {
    return { ok: false, status: 500, error: "delete_failed", message: "Eliminazione non riuscita." };
  }
  emitBoardsChanged("delete", { listingId: id });
  return { ok: true, status: 200, deleted: true, listingId: id, wasStatus: status };
}

/* boardsOwnerTools1: owner forza sync Discord (nome/icona/banner/membri/tag) */
async function refreshMyListing(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const auth = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  const id = String(payload.listingId || payload.id || "").trim();
  if (!mongoose.isValidObjectId(id)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID scheda non valido." };
  }
  const doc: any = await SiteDocument.findOne({ _id: id, docType: BL, userId: auth.userId }).lean();
  if (!doc) return { ok: false, status: 404, error: "not_found", message: "Scheda non trovata." };
  const kind = String(doc.boardKind || "") === "bot" ? "bot" : "server";
  if (kind !== "server") {
    return {
      ok: false,
      status: 400,
      error: "unsupported_kind",
      message: "Il refresh Discord è disponibile solo per le schede server.",
    };
  }
  const gid = String(doc.boardDiscordId || "").trim();
  if (!snowflakeOk(gid)) {
    return { ok: false, status: 400, error: "invalid_guild", message: "ID server non valido." };
  }
  let guild = null;
  try {
    guild =
      client?.guilds?.cache?.get(gid) || (await client?.guilds?.fetch?.(gid).catch(() => null));
  } catch (_) {
    guild = null;
  }
  if (!guild) {
    return {
      ok: false,
      status: 404,
      error: "guild_unavailable",
      message: "Il bot non è nel server o Discord non risponde. Riprova tra poco.",
    };
  }
  try {
    await guild.fetch().catch(() => null);
  } catch (_) {}

  const prev =
    (doc.boardStats && typeof doc.boardStats === "object" && doc.boardStats) || {};
  const inviteUrl = String(doc.boardInviteUrl || "").trim();
  const tagInfo: any = (await resolveGuildServerTag(client, guild, inviteUrl)) || {};
  const stats = {
    members: Number(guild.memberCount) || 0,
    name: String(guild.name || ""),
    guildTag: tagInfo.guildTag || prev.guildTag || "",
    guildTagBadge: tagInfo.guildTagBadge || prev.guildTagBadge || "",
    guildTagBadgeUrl: tagInfo.guildTagBadgeUrl || prev.guildTagBadgeUrl || "",
    guildTagBadgeColor: tagInfo.guildTagBadgeColor || prev.guildTagBadgeColor || "",
    guildTagBadgeColor2: tagInfo.guildTagBadgeColor2 || prev.guildTagBadgeColor2 || "",
    refreshedAt: new Date().toISOString(),
  };
  if (stats.guildTagBadge && !stats.guildTagBadgeUrl) {
    stats.guildTagBadgeUrl = guildTagBadgeCdnUrl(gid, stats.guildTagBadge);
  }
  const iconUrl =
    (guild.icon ? discordGuildIconUrl(guild, null, 256) : "") ||
    preferAnimatedDiscordMediaUrl(doc.boardIconUrl || "") ||
    "";
  const discordBanner =
    discordGuildBannerUrl(guild) || preferAnimatedDiscordMediaUrl(doc.boardBannerUrl || "") || "";
  const title = String(guild.name || doc.title || "").trim();
  const $set: Record<string, any> = {
    boardStats: stats,
    boardIconUrl: iconUrl,
    updatedAt: new Date(),
  };
  if (title) $set.title = title;
  /* boardsBannerUpload1: non sovrascrivere banner caricati dal form */
  if (discordBanner && !isUploadedBoardBannerUrl(doc.boardBannerUrl)) {
    $set.boardBannerUrl = discordBanner;
  }

  await SiteDocument.updateOne({ _id: doc._id, docType: BL }, { $set });
  const fresh = await SiteDocument.findOne({ _id: doc._id, docType: BL }).lean();
  let listing = serializeListing(fresh, { includeMod: true });
  await enrichListingAuthor(client, listing);
  return {
    ok: true,
    status: 200,
    listing,
    refreshed: true,
    message: "Dati Discord aggiornati.",
  };
}

async function listClaimableServers(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const auth = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  const list = await fetchManageableGuilds(payload.accessToken);
  if (!list?.ok) return list;
  try {
    await syncKnownBotGuildIdsFromRest(client).catch(() => null);
  } catch (_) {}
  const known = buildKnownBotGuildIdSet(client);
  const existing = await SiteDocument.find({
    docType: BL,
    boardKind: "server",
    status: { $in: [...ACTIVE_STATUSES, "draft"] },
  })
    .select({ boardDiscordId: 1, status: 1, userId: 1, _id: 1 })
    .lean();
  const taken = new Map();
  const ownDrafts = new Map();
  for (const e of existing) {
    const id = String(e.boardDiscordId || "");
    if (!id) continue;
    if (String(e.status) === "draft" && String(e.userId) === auth.userId) {
      ownDrafts.set(id, String(e._id));
    } else if (ACTIVE_STATUSES.includes(String(e.status))) {
      taken.set(id, String(e.status));
    }
  }
  const guilds = (Array.isArray(list.guilds) ? list.guilds : [])
    .filter((g?) => snowflakeOk(g?.id))
    .map((g?) => {
      const id = String(g.id);
      const botPresent = known.has(id) || Boolean(client?.guilds?.cache?.has?.(id));
      const alreadyListed = taken.has(id);
      const draftId = ownDrafts.get(id) || "";
      const dg = botPresent ? client?.guilds?.cache?.get?.(id) : null;
      const bannerUrl = dg ? discordGuildBannerUrl(dg) : "";
      const inviteUrl = dg ? discordGuildInviteHint(dg) : "";
      const siteUrl =
        MAIN_GUILD_ID && id === MAIN_GUILD_ID ? MAIN_GUILD_SITE : "";
      return {
        id,
        name: String(g.name || ""),
        iconUrl: g.icon ? discordGuildIconUrl(id, g.icon, 128) : "",
        owner: Boolean(g.owner),
        alreadyListed,
        botPresent,
        hasDraft: Boolean(draftId),
        draftId,
        claimable: botPresent && !alreadyListed,
        inviteBotUrl: viniliBotInviteUrl(client, id),
        /* boardsFormPrefill1 */
        bannerUrl: bannerUrl || "",
        inviteUrl: inviteUrl || "",
        siteUrl,
      };
    })
    .sort(
      (a?, b?) =>
        Number(b.claimable) - Number(a.claimable) ||
        Number(b.hasDraft) - Number(a.hasDraft) ||
        a.name.localeCompare(b.name, "it"),
    );
  return {
    ok: true,
    status: 200,
    guilds,
    botInviteUrl: viniliBotInviteUrl(client, null),
    inviteBotHint:
      "Puoi pubblicare solo server di cui sei proprietario Discord. Serve anche il bot Vinili & Caffè nel server.",
  };
}

async function submitListing(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const auth = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  const id = String(payload.listingId || payload.id || "").trim();
  if (!mongoose.isValidObjectId(id)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID scheda non valido." };
  }
  const doc = await SiteDocument.findOne({ _id: id, docType: BL });
  if (!doc) return { ok: false, status: 404, error: "not_found", message: "Scheda non trovata." };
  if (String(doc.userId) !== auth.userId) {
    return { ok: false, status: 403, error: "forbidden", message: "Non sei il proprietario di questa scheda." };
  }
  if (doc.status === "suspended") {
    return { ok: false, status: 403, error: "suspended", message: "Scheda sospesa: contatta lo staff." };
  }
  if (doc.status === "pending") {
    return { ok: true, status: 200, listing: serializeListing(doc.toObject(), { includeMod: true }), alreadyPending: true };
  }
  if (doc.status === "approved") {
    return { ok: false, status: 400, error: "already_approved", message: "Scheda già approvata." };
  }
  if (String(doc.boardKind) === "server") {
    const botOk = await assertBotInGuild(client, doc.boardDiscordId);
    if (!botOk) {
      return {
        ok: false,
        status: 403,
        error: "bot_not_in_guild",
        message: "Il bot Vinili & Caffè deve essere presente nel server prima dell’invio.",
      };
    }
  }
  const taglineLen = String(doc.boardTagline || "").length;
  if (taglineLen > 500) {
    return {
      ok: false,
      status: 400,
      error: "tagline_too_long",
      message:
        "Descrizione breve: massimo 500 caratteri (ora " +
        taglineLen +
        ", " +
        (500 - taglineLen) +
        ").",
      listing: serializeListing(doc.toObject(), { includeMod: true }),
    };
  }
  const check = listingChecklist(doc.toObject(), gate.cfg);
  if (!check.complete) {
    return {
      ok: false,
      status: 400,
      error: "incomplete",
      message: "Completa i campi obbligatori prima di inviare in moderazione.",
      checklist: check,
      listing: serializeListing(doc.toObject(), { includeMod: true }),
    };
  }
  doc.status = "pending";
  const mod = doc.boardModeration && typeof doc.boardModeration === "object" ? { ...doc.boardModeration } : {};
  mod.submittedAt = new Date().toISOString();
  mod.submittedByName = auth.globalName || auth.username || "";
  doc.boardModeration = mod;
  await doc.save();
  try {
    const { onBoardsListingPending } = require("./siteBoardsInboxBridge") as typeof import("./siteBoardsInboxBridge");
    void onBoardsListingPending(client, doc, {
      subjectName: auth.globalName || auth.username || "",
      notify: true,
    }).catch((err?) => {
      try {
        global.logger?.warn?.("[boards] onBoardsListingPending submit failed:", err?.message || err);
      } catch (_) {}
    });
  } catch (err) {
    try {
      global.logger?.warn?.("[boards] onBoardsListingPending require/submit failed:", err?.message || err);
    } catch (_) {}
  }
  emitBoardsChanged("submit", {
    listingId: String(doc._id),
    slug: String(doc.boardSlug || ""),
    kind: String(doc.boardKind || ""),
  });
  return { ok: true, status: 200, listing: serializeListing(doc.toObject(), { includeMod: true }) };
}

function inviteUrlFromCode(code?) {
  const c = String(code || "").trim().replace(/^https?:\/\/(www\.)?discord\.(gg|com)\/(invite\/)?/i, "");
  if (!c || /[^a-zA-Z0-9-]/i.test(c) || c.length > 64) return "";
  return sanitizeUrl(`https://discord.gg/${c}`);
}

function discordInviteErrorMessage(err?) {
  const code = Number(err?.code || err?.rawError?.code || 0) || 0;
  const raw = String(err?.message || err?.rawError?.message || "").trim();
  if (code === 50013 || /missing permissions/i.test(raw)) {
    return "Al bot mancano i permessi per creare invite. Incolla un link manualmente o dai Crea invito.";
  }
  if (code === 50001 || /missing access/i.test(raw)) {
    return "Il bot non ha accesso a nessun canale adatto. Incolla un invite manualmente.";
  }
  if (code === 30016 || /max number of invites/i.test(raw)) {
    return "Il server ha troppi invite attivi. Usa un invite esistente o cancellane alcuni.";
  }
  if (code === 50055 || /invite/i.test(raw) && /disabled/i.test(raw)) {
    return "Gli invite sono disabilitati su questo server. Incolla un link manualmente.";
  }
  if (/createInvite is not a function|invites\.create is not a function/i.test(raw)) {
    return "Nessun canale adatto per creare invite. Incolla un link manualmente.";
  }
  if (raw && raw.length < 180 && !/^error$/i.test(raw) && !/is not a function/i.test(raw)) return raw;
  return "Impossibile generare l’invite. Incollalo manualmente.";
}

async function generateInvite(client?, payload: Record<string, any> = {}) {
  /* boardsGenInvite3: SEMPRE invite nuovo infinito (no vanity / no riuso esistenti) */
  /* boardsGenInvite4: no thread (createInvite missing) + guild.invites.create */
  /* boardsGenInvite5: site-api usa client._rest (non client.rest) */
  /* boardsGenInvite6: no stub cache (members undefined) + me opzionale */
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const auth = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  const id = String(payload.listingId || payload.id || "").trim();
  let guildId = String(payload.guildId || payload.discordId || "").trim();
  let doc = null;
  if (mongoose.isValidObjectId(id)) {
    doc = await SiteDocument.findOne({ _id: id, docType: BL });
    if (!doc) return { ok: false, status: 404, error: "not_found", message: "Scheda non trovata." };
    if (String(doc.userId) !== auth.userId) {
      return { ok: false, status: 403, error: "forbidden", message: "Non sei il proprietario di questa scheda." };
    }
    if (String(doc.boardKind) !== "server") {
      return { ok: false, status: 400, error: "not_server", message: "Invite auto solo per schede server." };
    }
    guildId = String(doc.boardDiscordId || guildId || "").trim();
  }
  if (!snowflakeOk(guildId)) {
    return { ok: false, status: 400, error: "invalid_guild", message: "Server non valido." };
  }
  const claim = await assertCanClaimServer(client, payload.accessToken, guildId);
  if (!claim.ok) return claim;

  let guild = null;
  try {
    /* boardsGenInvite6: site-api cache ha stub partial senza members → forza fetch completo */
    const cached = client.guilds?.cache?.get?.(guildId) || null;
    const needsFull =
      !cached ||
      cached.partial === true ||
      !cached.members ||
      typeof cached.members.fetch !== "function";
    guild = needsFull ? await client.guilds.fetch(guildId) : cached;
  } catch (_) {
    guild = null;
  }
  if (!guild) {
    return {
      ok: false,
      status: 403,
      error: "bot_not_in_guild",
      message: "Il bot non è nel server: invita Vinili & Caffè e riprova.",
      inviteBotUrl: viniliBotInviteUrl(client, guildId),
    };
  }

  const finish = async (inviteUrl?) => {
    const url = sanitizeUrl(inviteUrl) || inviteUrlFromCode(inviteUrl);
    if (!url) {
      return { ok: false, status: 502, error: "invite_failed", message: "Invite creato ma URL non valido." };
    }
    const bannerUrl = discordGuildBannerUrl(guild) || "";
    if (doc) {
      doc.boardInviteUrl = url;
      if (bannerUrl && !String(doc.boardBannerUrl || "").trim()) doc.boardBannerUrl = bannerUrl;
      await doc.save();
      return {
        ok: true,
        status: 200,
        inviteUrl: url,
        bannerUrl,
        listing: serializeListing(doc.toObject(), { includeMod: true }),
      };
    }
    return { ok: true, status: 200, inviteUrl: url, bannerUrl, guildId };
  };

  try {
    if (typeof guild.channels?.fetch === "function") {
      await guild.channels.fetch().catch(() => null);
    }
  } catch (_) {}

  let me = guild.members?.me || null;
  if (!me && typeof guild.members?.fetchMe === "function") {
    me = await guild.members.fetchMe().catch(() => null);
  }
  if (!me && typeof guild.members?.fetch === "function") {
    const meId = String(client?.user?.id || "").trim();
    if (meId) me = await guild.members.fetch(meId).catch(() => null);
  }
  /* boardsGenInvite6: senza me (REST stub) prova createInvite e lascia fallire i 403 */

  const canInvite = (ch?) => {
    if (!ch || ch.type === ChannelType.GuildCategory) return false;
    /* boardsGenInvite4: i thread sono textBased ma NON hanno createInvite */
    try {
      if (typeof ch.isThread === "function" && ch.isThread()) return false;
    } catch (_) {}
    const t = ch.type;
    if (
      t === ChannelType.PublicThread ||
      t === ChannelType.PrivateThread ||
      t === ChannelType.AnnouncementThread
    ) {
      return false;
    }
    const usable =
      t === ChannelType.GuildText ||
      t === ChannelType.GuildAnnouncement ||
      t === ChannelType.GuildForum ||
      t === ChannelType.GuildVoice ||
      t === ChannelType.GuildStageVoice ||
      t === ChannelType.GuildMedia;
    if (!usable) return false;
    if (!me) return true;
    try {
      return Boolean(ch.permissionsFor(me)?.has?.(PermissionFlagsBits.CreateInstantInvite));
    } catch {
      return false;
    }
  };

  const ranked = [...guild.channels.cache.values()]
    .filter(canInvite)
    .sort((a?, b?) => {
      const score = (ch?) => {
        if (guild.systemChannelId && String(ch.id) === String(guild.systemChannelId)) return 0;
        if (guild.rulesChannelId && String(ch.id) === String(guild.rulesChannelId)) return 1;
        if (ch.type === ChannelType.GuildText) return 2;
        if (ch.type === ChannelType.GuildAnnouncement) return 3;
        return 9;
      };
      return score(a) - score(b) || Number(a.rawPosition ?? a.position ?? 0) - Number(b.rawPosition ?? b.position ?? 0);
    });

  if (!ranked.length) {
    return {
      ok: false,
      status: 403,
      error: "no_invite_channel",
      message:
        "Nessun canale dove il bot può creare un invite. Dai a Vinili il permesso “Crea invito” oppure incolla un link manualmente.",
    };
  }

  const inviteOpts = {
    maxAge: 0,
    maxUses: 0,
    unique: true,
    temporary: false,
    reason: `Bacheca Vinili — nuovo invite — ${auth.userId}`,
  };

  async function createInviteOnChannel(channel?) {
    const chId = String(channel?.id || "").trim();
    if (!chId) throw new Error("missing_channel");
    const rest = client?._rest || guild?.client?._rest || client?.rest;
    /* boardsGenInvite6: su site-api preferisci REST diretto (canali/cache senza createInvite) */
    if (client?._isSiteApiRestClient && rest && typeof rest.post === "function") {
      const { Routes } = require("discord.js") as typeof import("discord.js");
      const data = await rest.post(Routes.channelInvites(chId), {
        body: {
          max_age: inviteOpts.maxAge,
          max_uses: inviteOpts.maxUses,
          unique: inviteOpts.unique,
          temporary: inviteOpts.temporary,
        },
        reason: inviteOpts.reason,
      });
      const code = String(data?.code || "").trim();
      return {
        code,
        url: code ? `https://discord.gg/${code}` : "",
      };
    }
    if (typeof channel.createInvite === "function") {
      return channel.createInvite(inviteOpts);
    }
    if (typeof guild.invites?.create === "function") {
      return guild.invites.create(chId, inviteOpts);
    }
    if (rest && typeof rest.post === "function") {
      const { Routes } = require("discord.js") as typeof import("discord.js");
      const data = await rest.post(Routes.channelInvites(chId), {
        body: {
          max_age: inviteOpts.maxAge,
          max_uses: inviteOpts.maxUses,
          unique: inviteOpts.unique,
          temporary: inviteOpts.temporary,
        },
        reason: inviteOpts.reason,
      });
      const code = String(data?.code || "").trim();
      return {
        code,
        url: code ? `https://discord.gg/${code}` : "",
      };
    }
    throw new Error("createInvite unavailable");
  }

  let lastErr = null;
  for (const channel of ranked.slice(0, 8)) {
    try {
      const invite = await createInviteOnChannel(channel);
      const inviteUrl =
        sanitizeUrl(invite?.url) ||
        inviteUrlFromCode(invite?.code) ||
        inviteUrlFromCode(String(invite?.url || "").split("/").pop());
      if (inviteUrl) return finish(inviteUrl);
    } catch (err) {
      lastErr = err;
      global.logger?.warn?.(
        "[BOARDS] generate-invite channel fail",
        guildId,
        channel?.id,
        err?.code || "",
        err?.message || err,
      );
    }
  }

  return {
    ok: false,
    status: 502,
    error: "invite_failed",
    message: discordInviteErrorMessage(lastErr),
    discordCode: Number(lastErr?.code || lastErr?.rawError?.code || 0) || undefined,
  };
}

async function guildBoardDefaults(client?, payload: Record<string, any> = {}) {
  /* boardsFormPrefill1: invite vanity/banner per form */
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const auth = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  const guildId = String(payload.guildId || payload.discordId || "").trim();
  if (!snowflakeOk(guildId)) {
    return { ok: false, status: 400, error: "invalid_guild", message: "Server non valido." };
  }
  const claim = await assertCanClaimServer(client, payload.accessToken, guildId);
  if (!claim.ok) return claim;
  const defs = await resolveGuildBoardDefaults(client, guildId);
  let inviteUrl = defs.inviteUrl || "";
  if (!inviteUrl) {
    const gen: any = await generateInvite(client, {
      accessToken: payload.accessToken,
      guildId,
    });
    if (gen?.ok && gen.inviteUrl) inviteUrl = gen.inviteUrl;
  }
  return {
    ok: true,
    status: 200,
    guildId,
    inviteUrl: inviteUrl || "",
    bannerUrl: defs.bannerUrl || "",
    siteUrl: defs.siteUrl || "",
    name: claim.name || "",
    iconUrl: claim.iconUrl || "",
  };
}

/* boardsVoteFlow1 */
async function startListingVoteSession(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const cfg = gate.cfg;
  const auth = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  const id = String(payload.listingId || payload.id || "").trim();
  if (!mongoose.isValidObjectId(id)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID scheda non valido." };
  }
  const listing: any = await SiteDocument.findOne({ _id: id, docType: BL, status: "approved" }).lean();
  if (!listing) {
    return { ok: false, status: 404, error: "not_found", message: "Scheda non trovata o non approvata." };
  }
  const eligibility = await canUserVoteListing(id, auth.userId, cfg);
  if (!eligibility.ok) return eligibility;

  pruneVoteSessions();
  const sessionId = crypto.randomBytes(24).toString("hex");
  const now = Date.now();
  voteSessions.set(sessionId, {
    listingId: id,
    userId: auth.userId,
    createdAt: now,
    countdownAt: 0,
    adAt: 0,
  });
  ensureBoardsVoteReminderScheduler(client);
  return {
    ok: true,
    status: 200,
    sessionId,
    expiresInSec: Math.floor(VOTE_SESSION_TTL_MS / 1000),
    countdownSeconds: cfg.voteCountdownSeconds,
    adSeconds: cfg.voteAdSeconds,
    turnstileSiteKey: cfg.turnstileSiteKey || "",
    turnstileRequired: Boolean(cfg.turnstileSecretKey),
    ads: {
      provider: cfg.ads.provider,
      adsenseClient: cfg.ads.adsenseClient,
      adsenseSlot: cfg.ads.adsenseSlot,
      minWatchSeconds: cfg.ads.minWatchSeconds,
    },
    listing: {
      id,
      name: String(listing.title || ""),
      slug: String(listing.boardSlug || ""),
      iconUrl: preferAnimatedDiscordMediaUrl(String(listing.boardIconUrl || "")),
      kind: String(listing.boardKind || ""),
      votesMonth: listingVotesMonth(listing),
    },
    cooldownHours: cfg.voteCooldownHours,
  };
}

async function progressListingVoteSession(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const cfg = gate.cfg;
  const auth = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  const sessionId = String(payload.sessionId || "").trim();
  const step = String(payload.step || "").trim().toLowerCase();
  const sess = voteSessions.get(sessionId);
  if (!sess || sess.userId !== auth.userId) {
    return { ok: false, status: 400, error: "bad_session", message: "Sessione voto non valida o scaduta." };
  }
  if (Date.now() - sess.createdAt > VOTE_SESSION_TTL_MS) {
    voteSessions.delete(sessionId);
    return { ok: false, status: 400, error: "session_expired", message: "Sessione voto scaduta. Ricarica la pagina." };
  }
  const now = Date.now();
  if (step === "countdown") {
    /* boardsVoteNoCountdown1: con 0 secondi nessun wait */
    const needMs = Math.max(0, Number(cfg.voteCountdownSeconds) || 0) * 1000;
    if (needMs > 0 && now - sess.createdAt < needMs - 400) {
      return { ok: false, status: 400, error: "countdown_early", message: "Attendi la fine del countdown." };
    }
    sess.countdownAt = now;
    return { ok: true, status: 200, step: "countdown" };
  }
  if (step === "ad") {
    if (!sess.countdownAt) {
      return { ok: false, status: 400, error: "countdown_required", message: "Completa prima il countdown." };
    }
    if (payload.markStart === true) {
      sess.adStartedAt = now;
      return { ok: true, status: 200, step: "ad_start" };
    }
    if (!sess.adStartedAt) sess.adStartedAt = sess.countdownAt;
    /* boardsVoteNoAdCountdown1: 0s = nessun wait obbligatorio */
    const needAdSec = Math.max(0, Number(cfg.ads.minWatchSeconds) || Number(cfg.voteAdSeconds) || 0);
    const needAd = needAdSec > 0 ? needAdSec * 1000 - 400 : 0;
    if (cfg.ads.provider !== "none" && needAd > 0 && now - sess.adStartedAt < needAd) {
      return { ok: false, status: 400, error: "ad_early", message: "Guarda lo sponsor per il tempo richiesto." };
    }
    sess.adAt = now;
    return { ok: true, status: 200, step: "ad" };
  }
  return { ok: false, status: 400, error: "bad_step", message: "Step non valido." };
}

async function voteListing(client?, payload: Record<string, any> = {}, reqMeta: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const cfg = gate.cfg;
  const auth = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  const id = String(payload.listingId || payload.id || "").trim();
  if (!mongoose.isValidObjectId(id)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID scheda non valido." };
  }
  const listing = await SiteDocument.findOne({ _id: id, docType: BL, status: "approved" });
  if (!listing) return { ok: false, status: 404, error: "not_found", message: "Scheda non trovata o non approvata." };

  /* boardsVoteFlow1: richiede sessione completa + Turnstile se configurato */
  const sessionId = String(payload.sessionId || "").trim();
  const sess = voteSessions.get(sessionId);
  if (!sess || sess.userId !== auth.userId || sess.listingId !== id) {
    return {
      ok: false,
      status: 400,
      error: "bad_session",
      message: "Apri la pagina voto e completa sponsor e verifica.",
    };
  }
  if (Date.now() - sess.createdAt > VOTE_SESSION_TTL_MS) {
    voteSessions.delete(sessionId);
    return { ok: false, status: 400, error: "session_expired", message: "Sessione voto scaduta." };
  }
  if (!sess.countdownAt) {
    return { ok: false, status: 400, error: "countdown_required", message: "Avvia il voto dalla pagina dedicata prima di confermare." };
  }
  if (cfg.ads.provider !== "none" && !sess.adAt) {
    return { ok: false, status: 400, error: "ad_required", message: "Completa lo sponsor prima di votare." };
  }

  if (cfg.turnstileSecretKey) {
    const ts = await verifyTurnstileToken(cfg.turnstileSecretKey, payload.turnstileToken || payload.cfTurnstile, reqMeta.ip);
    if (!ts.ok) {
      return {
        ok: false,
        status: 403,
        error: ts.error || "turnstile_failed",
        message: "Verifica anti-robot non riuscita. Riprova.",
      };
    }
  }

  const eligibility = await canUserVoteListing(id, auth.userId, cfg);
  if (!eligibility.ok) return eligibility;

  const dedupe = `${id}:${auth.userId}:${dayKey()}`;
  const wantRemind = payload.remind === true || payload.reminder === true;
  const remindAt = wantRemind
    ? new Date(Date.now() + cfg.voteCooldownHours * 60 * 60 * 1000)
    : null;

  let voteDoc;
  try {
    voteDoc = await SiteDocument.create({
      docType: BV,
      userId: auth.userId,
      boardListingId: id,
      guildId: String(listing.boardDiscordId || ""),
      dedupeKey: dedupe,
      boardClientIpHash: hashIp(reqMeta.ip),
      authorName: auth.globalName || auth.username || "",
      boardRemindAt: remindAt,
      boardRemindSentAt: null,
    });
  } catch (err) {
    if (err && (err.code === 11000 || String(err.message || "").includes("duplicate"))) {
      return { ok: false, status: 429, error: "vote_cooldown", message: "Voto già registrato." };
    }
    throw err;
  }

  voteSessions.delete(sessionId);

  const monthKey = voteCountMonthKeyRome();
  const monthInc =
    String(listing.boardVotesMonthKey || "") === monthKey
      ? Math.max(0, Number(listing.boardVotesMonth) || 0) + 1
      : 1;
  await SiteDocument.updateOne(
    { _id: id, docType: BL },
    { $set: { boardVotesMonth: monthInc, boardVotesMonthKey: monthKey } },
  );

  const scores = await recomputeListingScore(id, cfg);
  ensureBoardsVoteReminderScheduler(client);
  emitBoardsChanged("vote", { listingId: id });
  return {
    ok: true,
    status: 200,
    voted: true,
    votesMonth: monthInc,
    votesMonthKey: monthKey,
    remindAt: remindAt ? remindAt.toISOString() : null,
    voteId: voteDoc ? String(voteDoc._id) : "",
    cooldownHours: cfg.voteCooldownHours,
    ...scores,
  };
}

async function setListingVoteReminder(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const cfg = gate.cfg;
  const auth = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  const id = String(payload.listingId || payload.id || "").trim();
  if (!mongoose.isValidObjectId(id)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID scheda non valido." };
  }
  const since = new Date(Date.now() - cfg.voteCooldownHours * 60 * 60 * 1000);
  const recent = await SiteDocument.findOne({
    docType: BV,
    boardListingId: id,
    userId: auth.userId,
    createdAt: { $gte: since },
  })
    .sort({ createdAt: -1 });
  if (!recent) {
    return { ok: false, status: 404, error: "no_recent_vote", message: "Nessun voto recente da ricordare." };
  }
  const enable = payload.enable !== false && payload.remind !== false;
  if (!enable) {
    recent.boardRemindAt = null;
    recent.boardRemindSentAt = null;
    await recent.save();
    return { ok: true, status: 200, remindAt: null, enabled: false };
  }
  const base = new Date(recent.createdAt).getTime() + cfg.voteCooldownHours * 60 * 60 * 1000;
  const remindAt = new Date(Math.max(Date.now() + 30_000, base));
  recent.boardRemindAt = remindAt;
  recent.boardRemindSentAt = null;
  await recent.save();
  ensureBoardsVoteReminderScheduler(client);
  return { ok: true, status: 200, remindAt: remindAt.toISOString(), enabled: true };
}

async function sweepBoardVoteReminders(client?) {
  const gate = featureGate(client);
  if (!gate.ok) return { ok: false, skipped: true };
  const now = new Date();
  const due = await SiteDocument.find({
    docType: BV,
    boardRemindAt: { $ne: null, $lte: now },
    boardRemindSentAt: null,
  })
    .sort({ boardRemindAt: 1 })
    .limit(40);
  if (!due.length) return { ok: true, sent: 0 };
  /* boardsListLite1: batch listing titles ($in) — no N+1 findOne */
  const listingIds = [
    ...new Set(
      due
        .map((v?) => String(v.boardListingId || "").trim())
        .filter((id?) => mongoose.isValidObjectId(id)),
    ),
  ];
  const listingById = new Map();
  if (listingIds.length) {
    try {
      const listings = await SiteDocument.find({
        _id: { $in: listingIds },
        docType: BL,
      })
        .select("title boardSlug")
        .lean();
      for (const row of listings || []) {
        listingById.set(String(row._id), row);
      }
    } catch (_) {}
  }
  let sent = 0;
  for (const vote of due) {
    const uid = String(vote.userId || "").trim();
    const listingId = String(vote.boardListingId || "").trim();
    if (!uid || !listingId) {
      vote.boardRemindSentAt = now;
      await vote.save().catch(() => null);
      continue;
    }
    const listing = listingById.get(listingId) || null;
    const name = String(listing?.title || "scheda").trim() || "scheda";
    const slug = String(listing?.boardSlug || "").trim();
    const openUrl = slug
      ? `https://www.viniliecaffe.it/bacheca/vota/?slug=${encodeURIComponent(slug)}`
      : `https://www.viniliecaffe.it/bacheca/vota/?id=${encodeURIComponent(listingId)}`;
    try {
      const { enqueueSiteInAppNotification } = require("./siteInAppNotificationsService") as typeof import("./siteInAppNotificationsService");
      const ok = await enqueueSiteInAppNotification({
        guildId: String(IDs.guilds?.main || "").trim() || "global",
        userId: uid,
        title: "Promemoria voto Bacheca",
        body: `Puoi votare di nuovo per ${name}. Grazie per il supporto!`,
        kind: "vote_reminder",
        openUrl,
        dedupeKey: `vote_reminder_boards_${listingId}_${String(vote._id)}`,
        dedupeWindowMs: Math.max(60_000, gate.cfg.voteCooldownHours * 60 * 60 * 1000),
        push: true,
      });
      vote.boardRemindSentAt = now;
      if (!ok) vote.boardRemindAt = null;
      await vote.save();
      if (ok) sent += 1;
    } catch (err) {
      global.logger?.warn?.("[boards] vote reminder:", err?.message || err);
    }
  }
  return { ok: true, sent };
}

let voteRemindTimer = null;
function ensureBoardsVoteReminderScheduler(client?) {
  if (voteRemindTimer) return;
  voteRemindTimer = setInterval(() => {
    sweepBoardVoteReminders(client).catch((err?) => {
      global.logger?.warn?.("[boards] vote remind sweep:", err?.message || err);
    });
  }, 60 * 1000);
  if (typeof voteRemindTimer.unref === "function") voteRemindTimer.unref();
  setTimeout(() => {
    sweepBoardVoteReminders(client).catch(() => null);
  }, 12_000).unref?.();
}

async function bumpListing(client?, payload: Record<string, any> = {}, reqMeta: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const cfg = gate.cfg;
  const auth = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  const id = String(payload.listingId || payload.id || "").trim();
  if (!mongoose.isValidObjectId(id)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID scheda non valido." };
  }
  const listing = await SiteDocument.findOne({ _id: id, docType: BL, status: "approved" });
  if (!listing) return { ok: false, status: 404, error: "not_found", message: "Scheda non trovata o non approvata." };
  if (String(listing.userId) !== auth.userId) {
    return { ok: false, status: 403, error: "forbidden", message: "Solo il proprietario può fare bump." };
  }

  const since = new Date(Date.now() - cfg.bumpCooldownHours * 60 * 60 * 1000);
  const recent = await SiteDocument.findOne({
    docType: BB,
    boardListingId: id,
    userId: auth.userId,
    createdAt: { $gte: since },
  }).lean();
  if (recent) {
    return {
      ok: false,
      status: 429,
      error: "bump_cooldown",
      message: `Bump in cooldown (${cfg.bumpCooldownHours}h).`,
    };
  }

  await SiteDocument.create({
    docType: BB,
    userId: auth.userId,
    boardListingId: id,
    guildId: String(listing.boardDiscordId || ""),
    boardClientIpHash: hashIp(reqMeta.ip),
    authorName: auth.globalName || auth.username || "",
  });
  listing.boardBumpedAt = new Date();
  await listing.save();
  const scores = await recomputeListingScore(id, cfg);
  emitBoardsChanged("bump", { listingId: id });
  return { ok: true, status: 200, bumped: true, bumpedAt: listing.boardBumpedAt.toISOString(), ...scores };
}

async function reportListing(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const auth = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  const id = String(payload.listingId || payload.id || "").trim();
  if (!mongoose.isValidObjectId(id)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID scheda non valido." };
  }
  const reason = sanitizeText(payload.reason, 500);
  if (reason.length < 8) {
    return { ok: false, status: 400, error: "short_reason", message: "Motivo troppo corto." };
  }
  const listing: any = await SiteDocument.findOne({ _id: id, docType: BL }).lean();
  if (!listing) return { ok: false, status: 404, error: "not_found", message: "Scheda non trovata." };
  await SiteDocument.create({
    docType: BR,
    userId: auth.userId,
    boardListingId: id,
    guildId: String(listing.boardDiscordId || ""),
    content: reason,
    status: "open",
    authorName: auth.globalName || auth.username || "",
  });
  return { ok: true, status: 201, reported: true };
}

/* boardsListingReviews1 */
function boardReviewAuthorAvatar(auth?) {
  const uid = String(auth?.userId || "").trim();
  const hash = String(auth?.avatar || "").trim();
  if (!uid || !hash) return "";
  const ext = /^a_/i.test(hash) ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${uid}/${hash}.${ext}?size=64`;
}

function discordDefaultAvatarUrl(userId?) {
  const uid = String(userId || "").trim();
  if (!uid) return "";
  try {
    const idx = Number((BigInt(uid) >> 22n) % 6n);
    return `https://cdn.discordapp.com/embed/avatars/${Number.isFinite(idx) ? idx : 0}.png`;
  } catch (_) {
    return "https://cdn.discordapp.com/embed/avatars/0.png";
  }
}

function serializeBoardReview(doc?, viewerUserId?) {
  if (!doc) return null;
  const likes = Array.isArray(doc.likedUserIds) ? doc.likedUserIds.map(String) : [];
  const uid = String(viewerUserId || "").trim();
  const replyText = String(doc.serverReplyContent || "").trim();
  const authorUserId = String(doc.userId || "").trim();
  let authorName = String(doc.authorName || "").trim();
  let authorAvatarUrl = preferAnimatedDiscordMediaUrl(String(doc.authorAvatarUrl || "").trim());
  if (!authorAvatarUrl && authorUserId) {
    authorAvatarUrl = discordDefaultAvatarUrl(authorUserId);
  }
  return {
    id: String(doc._id),
    listingId: String(doc.boardListingId || ""),
    userId: authorUserId,
    rating: Math.max(1, Math.min(5, Number(doc.rating) || 0)),
    content: String(doc.content || ""),
    status: String(doc.status || "approved"),
    authorName: authorName || "Utente",
    authorAvatarUrl,
    likeCount: likes.length,
    likedByMe: uid ? likes.includes(uid) : false,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
    /* boardsReviewReply1 */
    reply: replyText
      ? {
          content: replyText,
          at: doc.serverReplyAt ? new Date(doc.serverReplyAt).toISOString() : null,
          authorId: String(doc.serverReplyAuthorId || ""),
        }
      : null,
  };
}

/* boardsReviewsUiPager1 + boardsReviewsUiPolish1: sempre nick+avatar live da Discord userId */
async function hydrateBoardReviewAuthor(client?, doc?) {
  if (!doc) return null;
  const uid = String(doc.userId || "").trim();
  let name = String(doc.authorName || "").trim();
  let avatarUrl = preferAnimatedDiscordMediaUrl(String(doc.authorAvatarUrl || "").trim());
  if (!uid) {
    if (!avatarUrl) avatarUrl = "";
    return { authorName: name || "Utente", authorAvatarUrl: avatarUrl, patched: false };
  }
  try {
    let user = client?.users?.cache?.get?.(uid) || null;
    if (!user && client?.users?.fetch) {
      user = await client.users.fetch(uid).catch(() => null);
    }
    let member = null;
    if (MAIN_GUILD_ID && client?.guilds) {
      const g =
        client.guilds.cache?.get?.(MAIN_GUILD_ID) ||
        (await fetchGuildPreferLite(client, MAIN_GUILD_ID));
      if (g?.members?.fetch) {
        member = g.members.cache?.get?.(uid) || (await g.members.fetch(uid).catch(() => null));
      }
    }
    /* Sempre preferisci profilo Discord vivo (nick salvato spesso stale) */
    const liveName = String(
      member?.displayName || user?.globalName || user?.username || "",
    ).trim();
    if (liveName) name = liveName;
    else if (!name || /^\d{16,22}$/.test(name) || /^utente$/i.test(name)) name = "Utente";

    if (user?.displayAvatarURL) {
      avatarUrl = preferAnimatedDiscordMediaUrl(
        String(user.displayAvatarURL({ size: 64, extension: "png", forceStatic: false })),
      );
    } else if (member?.displayAvatarURL) {
      avatarUrl = preferAnimatedDiscordMediaUrl(
        String(member.displayAvatarURL({ size: 64, extension: "png", forceStatic: false })),
      );
    } else if (!avatarUrl) {
      avatarUrl = discordDefaultAvatarUrl(uid);
    }

    const patch: Record<string, any> = {};
    if (name && name !== String(doc.authorName || "").trim()) patch.authorName = name;
    if (avatarUrl && avatarUrl !== String(doc.authorAvatarUrl || "").trim()) {
      patch.authorAvatarUrl = avatarUrl;
    }
    if (user?.avatar != null && String(user.avatar || "") !== String(doc.authorAvatar || "").trim()) {
      patch.authorAvatar = String(user.avatar || "");
    }
    if (Object.keys(patch).length && doc._id) {
      await SiteDocument.updateOne({ _id: doc._id, docType: BREV }, { $set: patch }).catch(() => null);
    }
    return { authorName: name || "Utente", authorAvatarUrl: avatarUrl, patched: Object.keys(patch).length > 0 };
  } catch (_) {
    if (!avatarUrl && uid) avatarUrl = discordDefaultAvatarUrl(uid);
    return { authorName: name || "Utente", authorAvatarUrl: avatarUrl, patched: false };
  }
}

async function recomputeListingRating(listingId?) {
  const id = String(listingId || "").trim();
  if (!mongoose.isValidObjectId(id)) return { ratingAvg: 0, reviewsCount: 0 };
  const rows = await SiteDocument.find({
    docType: BREV,
    boardListingId: id,
    status: "approved",
  })
    .select({ rating: 1 })
    .lean();
  const count = rows.length;
  let avg = 0;
  if (count) {
    const sum = rows.reduce((acc?, r?) => acc + (Number(r.rating) || 0), 0);
    avg = Math.round((sum / count) * 10) / 10;
  }
  await SiteDocument.updateOne(
    { _id: id, docType: BL },
    { $set: { boardRatingAvg: avg, boardReviewsCount: count } },
  );
  return { ratingAvg: avg, reviewsCount: count };
}

async function listListingReviews(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const id = String(payload.listingId || payload.id || "").trim();
  if (!mongoose.isValidObjectId(id)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID scheda non valido." };
  }
  const listing: any = await SiteDocument.findOne({ _id: id, docType: BL }).lean();
  if (!listing) return { ok: false, status: 404, error: "not_found", message: "Scheda non trovata." };

  let viewerUserId = "";
  if (payload.accessToken) {
    const auth = await resolveBoardsUser(payload.accessToken);
    if (auth?.ok) viewerUserId = auth.userId;
  }

  const sortKey = String(payload.sort || "relevant").toLowerCase();
  /* boardsReviewsUiPager1 */
  const page = Math.max(1, Number(payload.page) || 1);
  const perPage = Math.min(24, Math.max(1, Number(payload.perPage) || 8));
  const rows = await SiteDocument.find({
    docType: BREV,
    boardListingId: id,
    status: "approved",
  })
    .limit(500)
    .lean();

  let reviews = rows.map((r?) => serializeBoardReview(r, viewerUserId)).filter(Boolean);
  if (sortKey === "newest") {
    reviews.sort((a?, b?) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  } else if (sortKey === "highest") {
    reviews.sort(
      (a?, b?) =>
        Number(b.rating) - Number(a.rating) ||
        String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
    );
  } else {
    reviews.sort(
      (a?, b?) =>
        Number(b.likeCount) - Number(a.likeCount) ||
        Number(b.rating) - Number(a.rating) ||
        String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
    );
  }

  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of reviews) {
    const k = String(Math.max(1, Math.min(5, Number(r.rating) || 0)));
    if (dist[k] != null) dist[k] += 1;
  }
  const ratingAvg = Number(listing.boardRatingAvg) || 0;
  const reviewsCount = Number(listing.boardReviewsCount) || reviews.length;
  const totalPages = Math.max(1, Math.ceil(reviews.length / perPage) || 1);
  const pageClamped = Math.min(page, totalPages);
  const sliceStart = (pageClamped - 1) * perPage;
  const pageSlice = reviews.slice(sliceStart, sliceStart + perPage);
  const docById = new Map(rows.map((d?) => [String(d._id), d]));

  const pageReviews = [];
  for (const r of pageSlice) {
    const doc = docById.get(String(r.id));
    if (!doc) {
      pageReviews.push(r);
      continue;
    }
    const hydrated = await hydrateBoardReviewAuthor(client, doc);
    const base = serializeBoardReview(
      {
        ...doc,
        authorName: hydrated?.authorName || doc.authorName,
        authorAvatarUrl: hydrated?.authorAvatarUrl || doc.authorAvatarUrl,
      },
      viewerUserId,
    );
    pageReviews.push(base || r);
  }

  let mine = null;
  if (viewerUserId) {
    const mineDoc: any = await SiteDocument.findOne({
      docType: BREV,
      boardListingId: id,
      userId: viewerUserId,
    }).lean();
    if (mineDoc) {
      const hydratedMine = await hydrateBoardReviewAuthor(client, mineDoc);
      mine = serializeBoardReview(
        {
          ...mineDoc,
          authorName: hydratedMine?.authorName || mineDoc.authorName,
          authorAvatarUrl: hydratedMine?.authorAvatarUrl || mineDoc.authorAvatarUrl,
        },
        viewerUserId,
      );
    }
  }

  const ownerId = String(listing.userId || listing.ownerId || "").trim();
  const isOwner = Boolean(viewerUserId) && Boolean(ownerId) && viewerUserId === ownerId;
  const canReply = isOwner;
  const cats = Array.isArray(listing.boardCategories)
    ? listing.boardCategories.map(String).filter(Boolean).slice(0, 4)
    : [];
  return {
    ok: true,
    status: 200,
    listingId: id,
    ratingAvg,
    reviewsCount,
    distribution: dist,
    reviews: pageReviews,
    page: pageClamped,
    perPage,
    totalPages,
    mine,
    /* boardsReviewsOwnerGuard1: creatore scheda non può auto-recensirsi */
    canReview:
      Boolean(viewerUserId) &&
      String(listing.status) === "approved" &&
      !mine &&
      !isOwner,
    isOwner,
    canReply,
    listing: {
      id,
      name: String(listing.title || ""),
      iconUrl: preferAnimatedDiscordMediaUrl(String(listing.boardIconUrl || "")),
      categories: cats,
    },
  };
}

async function createListingReview(client?, payload: Record<string, any> = {}, reqMeta: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const auth = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  const id = String(payload.listingId || payload.id || "").trim();
  if (!mongoose.isValidObjectId(id)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID scheda non valido." };
  }
  const rating = Math.round(Number(payload.rating));
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return { ok: false, status: 400, error: "invalid_rating", message: "Seleziona una valutazione da 1 a 5 stelle." };
  }
  const content = sanitizeText(payload.content || payload.text || "", 2048);
  if (content.length < 12) {
    return { ok: false, status: 400, error: "short_content", message: "La recensione è troppo corta." };
  }
  const listing: any = await SiteDocument.findOne({ _id: id, docType: BL, status: "approved" }).lean();
  if (!listing) {
    return { ok: false, status: 404, error: "not_found", message: "Scheda non trovata o non approvata." };
  }
  const listingOwnerId = String(listing.userId || listing.ownerId || "").trim();
  if (listingOwnerId && listingOwnerId === auth.userId) {
    return {
      ok: false,
      status: 403,
      error: "own_listing",
      message: "Non puoi recensire la tua stessa scheda o il tuo stesso server.",
    };
  }
  const existing = await SiteDocument.findOne({
    docType: BREV,
    boardListingId: id,
    userId: auth.userId,
  }).lean();
  if (existing) {
    return { ok: false, status: 409, error: "already_reviewed", message: "Hai già recensito questa scheda." };
  }

  let doc;
  try {
    doc = await SiteDocument.create({
      docType: BREV,
      userId: auth.userId,
      boardListingId: id,
      guildId: String(listing.boardDiscordId || ""),
      rating,
      content,
      status: "approved",
      likedUserIds: [],
      authorName: auth.globalName || auth.username || "",
      authorAvatarUrl: boardReviewAuthorAvatar(auth),
      boardClientIpHash: hashIp(reqMeta.ip),
    });
  } catch (err) {
    if (err && (err.code === 11000 || String(err.message || "").includes("duplicate"))) {
      return { ok: false, status: 409, error: "already_reviewed", message: "Hai già recensito questa scheda." };
    }
    throw err;
  }

  const agg = await recomputeListingRating(id);
  emitBoardsChanged("review", { listingId: id });
  return {
    ok: true,
    status: 201,
    review: serializeBoardReview(doc, auth.userId),
    ...agg,
  };
}

async function toggleListingReviewLike(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const auth = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  const reviewId = String(payload.reviewId || payload.id || "").trim();
  if (!mongoose.isValidObjectId(reviewId)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID recensione non valido." };
  }
  const review = await SiteDocument.findOne({ _id: reviewId, docType: BREV, status: "approved" });
  if (!review) return { ok: false, status: 404, error: "not_found", message: "Recensione non trovata." };
  const likes = Array.isArray(review.likedUserIds) ? review.likedUserIds.map(String) : [];
  const has = likes.includes(auth.userId);
  await SiteDocument.updateOne(
    { _id: reviewId, docType: BREV },
    has ? { $pull: { likedUserIds: auth.userId } } : { $addToSet: { likedUserIds: auth.userId } },
  );
  const updated = await SiteDocument.findById(reviewId).lean();
  return {
    ok: true,
    status: 200,
    review: serializeBoardReview(updated, auth.userId),
    liked: !has,
  };
}

async function reportListingReview(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const auth = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  const reviewId = String(payload.reviewId || payload.id || "").trim();
  if (!mongoose.isValidObjectId(reviewId)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID recensione non valido." };
  }
  const reason = sanitizeText(payload.reason, 500);
  if (reason.length < 8) {
    return { ok: false, status: 400, error: "short_reason", message: "Motivo troppo corto." };
  }
  const review: any = await SiteDocument.findOne({ _id: reviewId, docType: BREV }).lean();
  if (!review) return { ok: false, status: 404, error: "not_found", message: "Recensione non trovata." };
  await SiteDocument.create({
    docType: BR,
    userId: auth.userId,
    boardListingId: String(review.boardListingId || ""),
    guildId: String(review.guildId || ""),
    content: `review:${reviewId}: ${reason}`,
    status: "open",
    authorName: auth.globalName || auth.username || "",
  });
  return { ok: true, status: 201, reported: true };
}

/* boardsReviewReply1: risposta ufficiale del proprietario scheda */
async function upsertListingReviewReply(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const auth = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  const reviewId = String(payload.reviewId || payload.id || "").trim();
  if (!mongoose.isValidObjectId(reviewId)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID recensione non valido." };
  }
  const review: any = await SiteDocument.findOne({ _id: reviewId, docType: BREV, status: "approved" }).lean();
  if (!review) return { ok: false, status: 404, error: "not_found", message: "Recensione non trovata." };
  const listingId = String(review.boardListingId || "").trim();
  if (!mongoose.isValidObjectId(listingId)) {
    return { ok: false, status: 400, error: "invalid_listing", message: "Scheda non valida." };
  }
  const listing: any = await SiteDocument.findOne({ _id: listingId, docType: BL }).lean();
  if (!listing) return { ok: false, status: 404, error: "not_found", message: "Scheda non trovata." };
  if (String(listing.userId || listing.ownerId || "") !== auth.userId) {
    return {
      ok: false,
      status: 403,
      error: "forbidden",
      message: "Solo il creatore della scheda può rispondere alle recensioni.",
    };
  }

  const clear = payload.clear === true || payload.delete === true;
  const content = sanitizeText(payload.content || payload.text || "", 2000);
  if (!clear && content.length < 8) {
    return { ok: false, status: 400, error: "reply_too_short", message: "La risposta deve avere almeno 8 caratteri." };
  }

  const $set = clear
    ? {
        serverReplyContent: "",
        serverReplyAt: null,
        serverReplyAuthorId: "",
      }
    : {
        serverReplyContent: content,
        serverReplyAt: new Date(),
        serverReplyAuthorId: auth.userId,
      };

  const nextDoc = await SiteDocument.findOneAndUpdate(
    { _id: reviewId, docType: BREV },
    { $set },
    { new: true },
  ).lean();
  if (!nextDoc) {
    return { ok: false, status: 500, error: "save_failed", message: "Impossibile salvare la risposta." };
  }
  return {
    ok: true,
    status: 200,
    review: serializeBoardReview(nextDoc, auth.userId),
    message: clear ? "Risposta rimossa." : "Risposta pubblicata.",
  };
}

/**
 * boardsImportSiteServerReviews1
 * Specchio continuo: recensione SITE kind=server → board_review sulla scheda main guild.
 */
async function findMainGuildServerListing() {
  const gid = String(MAIN_GUILD_ID || "").trim();
  if (!gid) return null;
  const listing = await SiteDocument.findOne({
    docType: BL,
    boardKind: "server",
    status: "approved",
    $or: [{ boardDiscordId: gid }, { guildId: gid }],
  })
    .select({ _id: 1, boardDiscordId: 1, userId: 1 })
    .lean();
  return listing || null;
}

async function syncSiteServerReviewToMainBoardListing(siteReviewDoc?) {
  try {
    const src = siteReviewDoc && typeof siteReviewDoc === "object" ? siteReviewDoc : null;
    if (!src) return { ok: false, skipped: true };
    if (String(src.reviewKind || "").toLowerCase() !== "server") return { ok: false, skipped: true };
    const uid = String(src.userId || "").trim();
    if (!uid) return { ok: false, skipped: true };
    const listing: any = await findMainGuildServerListing();
    if (!listing) return { ok: false, skipped: true, reason: "no_listing" };
    const listingOwnerId = String(listing.userId || listing.ownerId || "").trim();
    if (listingOwnerId && listingOwnerId === uid) {
      return { ok: false, skipped: true, reason: "own_listing" };
    }
    const listingId = String(listing._id);
    const rating = Math.max(1, Math.min(5, Math.round(Number(src.rating) || 0)));
    const content = String(src.content || "").trim();
    if (!rating || content.length < 1) return { ok: false, skipped: true };

    const $set = {
      rating,
      content,
      status: "approved",
      likedUserIds: Array.isArray(src.likedUserIds) ? src.likedUserIds.map(String) : [],
      authorName: String(src.authorName || "Utente").trim() || "Utente",
      authorAvatarUrl: preferAnimatedDiscordMediaUrl(String(src.authorAvatarUrl || "")),
      serverReplyContent: String(src.serverReplyContent || ""),
      serverReplyAt: src.serverReplyAt ? new Date(src.serverReplyAt) : null,
      serverReplyAuthorId: String(src.serverReplyAuthorId || ""),
      guildId: String(listing.boardDiscordId || MAIN_GUILD_ID || ""),
      provider: "site_reviews_mirror",
    };

    await SiteDocument.findOneAndUpdate(
      { docType: BREV, boardListingId: listingId, userId: uid },
      {
        $set,
        $setOnInsert: {
          docType: BREV,
          boardListingId: listingId,
          userId: uid,
          createdBy: "site",
          dedupeKey: src._id ? `mirror_site_review:${String(src._id)}` : undefined,
          createdAt: src.createdAt ? new Date(src.createdAt) : new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    await recomputeListingRating(listingId);
    return { ok: true, listingId };
  } catch (err) {
    try {
      global.logger?.warn?.("[siteBoardsApi] syncSiteServerReviewToMainBoardListing:", err?.message || err);
    } catch (_) {}
    return { ok: false, error: String(err?.message || err) };
  }
}

async function removeSiteServerReviewFromMainBoardListing(userId?) {
  try {
    const uid = String(userId || "").trim();
    if (!uid) return { ok: false, skipped: true };
    const listing: any = await findMainGuildServerListing();
    if (!listing) return { ok: false, skipped: true };
    const listingId = String(listing._id);
    const del = await SiteDocument.deleteOne({
      docType: BREV,
      boardListingId: listingId,
      userId: uid,
    });
    if (del?.deletedCount) await recomputeListingRating(listingId);
    return { ok: true, listingId, deleted: Number(del?.deletedCount || 0) };
  } catch (err) {
    try {
      global.logger?.warn?.("[siteBoardsApi] removeSiteServerReviewFromMainBoardListing:", err?.message || err);
    } catch (_) {}
    return { ok: false, error: String(err?.message || err) };
  }
}

function assertBoardsModHighStaff(staff?) {
  if (!staff?.ok) {
    return {
      ok: false,
      status: Number(staff?.status) || 403,
      error: staff?.error || "forbidden",
      message: staff?.message || "Accesso staff richiesto.",
    };
  }
  /* boardsRevHsOnly1: moderazione bacheca solo High Staff */
  if (!memberIsHighStaffEligible(staff.member)) {
    return {
      ok: false,
      status: 403,
      error: "forbidden",
      message: "Solo High Staff.",
    };
  }
  return null;
}

async function modListPending(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const staff = await assertWebsiteStaffAccess(client, payload.accessToken);
  const denied = assertBoardsModHighStaff(staff);
  if (denied) return denied;
  const status = String(payload.status || "pending").trim() || "pending";
  const kind = String(payload.kind || payload.filter || "").trim().toLowerCase();
  const filter: Record<string, any> = { docType: BL };
  if (status === "all") {
    filter.status = { $nin: ["draft"] };
  } else if (status === "draft") {
    filter.status = "pending";
  } else {
    filter.status = status;
  }
  if (kind === "server" || kind === "bot") filter.boardKind = kind;
  const rows = await SiteDocument.find(filter).sort({ updatedAt: -1 }).limit(100).lean();
  return { ok: true, status: 200, listings: rows.map((r?) => serializeListing(r, { includeMod: true })) };
}

/* boardsRevPreview1: staff anteprima scheda pending (anche senza slug pubblico) */
async function getListingForStaffReview(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const staff = await assertWebsiteStaffAccess(client, payload.accessToken);
  const denied = assertBoardsModHighStaff(staff);
  if (denied) return denied;
  const id = String(payload.listingId || payload.id || "").trim();
  if (!mongoose.isValidObjectId(id)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID scheda non valido." };
  }
  const doc = await SiteDocument.findOne({ _id: id, docType: BL }).lean();
  if (!doc) return { ok: false, status: 404, error: "not_found", message: "Scheda non trovata." };
  let listing = await enrichListingAuthor(client, serializeListing(doc, { includeMod: true }));
  listing = await refreshListingStats(client, listing);
  return {
    ok: true,
    status: 200,
    listing,
    review: true,
    publicOpen: gate.cfg.publicOpen,
  };
}

async function modDecide(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const staff = await assertWebsiteStaffAccess(client, payload.accessToken);
  const denied = assertBoardsModHighStaff(staff);
  if (denied) return denied;
  const id = String(payload.listingId || payload.id || "").trim();
  const decision = String(payload.decision || "").trim().toLowerCase();
  if (!mongoose.isValidObjectId(id)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID scheda non valido." };
  }
  if (!["approve", "reject", "suspend"].includes(decision)) {
    return { ok: false, status: 400, error: "invalid_decision", message: "decision: approve|reject|suspend." };
  }
  const doc = await SiteDocument.findOne({ _id: id, docType: BL });
  if (!doc) return { ok: false, status: 404, error: "not_found", message: "Scheda non trovata." };

  const next =
    decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "suspended";
  doc.status = next;
  doc.decidedAt = new Date();
  doc.staffReason = sanitizeText(payload.reason, 1000);
  const mod = doc.boardModeration && typeof doc.boardModeration === "object" ? { ...doc.boardModeration } : {};
  mod.reviewedBy = String(staff.member?.id || staff.user?.id || "").trim();
  mod.reviewedAt = new Date().toISOString();
  mod.notes = sanitizeText(payload.notes, 1000);
  mod.rejectReason = doc.staffReason;
  doc.boardModeration = mod;
  await doc.save();
  try {
    const { onBoardsListingDecided } = require("./siteBoardsInboxBridge") as typeof import("./siteBoardsInboxBridge");
    const decidedBy = String(staff.member?.id || staff.user?.id || "").trim();
    const decidedByName = String(
      staff.member?.displayName || staff.user?.globalName || staff.user?.username || "",
    ).trim();
    void onBoardsListingDecided(client, doc, {
      decision,
      reason: doc.staffReason,
      decidedBy,
      decidedByName,
      notifyOwner: true,
    }).catch(() => null);
  } catch (_) {}
  emitBoardsChanged(decision === "approved" ? "mod_approve" : "mod_reject", {
    listingId: String(doc._id),
    slug: String(doc.boardSlug || ""),
    kind: String(doc.boardKind || ""),
  });
  return { ok: true, status: 200, listing: serializeListing(doc.toObject(), { includeMod: true }) };
}

function guildTagBadgeCdnUrl(guildId?, badgeHash?) {
  const gid = String(guildId || "").trim();
  const hash = String(badgeHash || "").trim();
  if (!snowflakeOk(gid) || !hash) return "";
  return `https://cdn.discordapp.com/guild-tag-badges/${gid}/${hash}.png?size=64`;
}

function parseDiscordInviteCode(url?) {
  const s = String(url || "").trim();
  if (!s) return "";
  const m = s.match(/(?:discord(?:app)?\.com\/invite\/|discord\.gg\/)([a-zA-Z0-9-]+)/i);
  if (m) return m[1];
  if (/^[a-zA-Z0-9-]{2,32}$/.test(s)) return s;
  return "";
}

/* boardsGuildTagUi2: invite.profile.badge_hash (Discord) via fetch raw — non solo client.rest */
async function fetchInviteJson(client?, code?) {
  const c = String(code || "").trim();
  if (!c) return null;
  if (client?.rest?.get) {
    try {
      const inv = await client.rest.get(`/invites/${encodeURIComponent(c)}?with_counts=true`);
      if (inv && (inv.profile || inv.guild)) return inv;
    } catch (_) {}
  }
  const token = String(
    client?.token ||
      process.env.DISCORD_TOKEN_OFFICIAL ||
      process.env.DISCORD_WEBSITE_BUILD_BOT_TOKEN ||
      "",
  ).trim();
  if (!token || typeof fetch !== "function") return null;
  try {
    const res = await fetch(
      `https://discord.com/api/v10/invites/${encodeURIComponent(c)}?with_counts=true`,
      {
        headers: {
          Authorization: `Bot ${token}`,
          "User-Agent": "DiscordBot (ViniliBoards, 1.0)",
        },
      },
    );
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  }
}

async function resolveGuildServerTag(client?, guild?, inviteUrl?) {
  const gid = String(guild?.id || "").trim();
  if (!snowflakeOk(gid)) return null;
  let tag = "";
  let badge = "";
  let colorPrimary = "";
  let colorSecondary = "";

  const code = parseDiscordInviteCode(inviteUrl);
  if (code) {
    const inv = await fetchInviteJson(client, code);
    const profile = inv?.profile || inv?.guild_profile || inv?.guild?.profile || null;
    if (profile) {
      tag = String(profile.tag || "").trim();
      badge = String(profile.badge_hash || profile.badgeHash || "").trim();
      colorPrimary = String(profile.badge_color_primary || profile.badgeColorPrimary || "").trim();
      colorSecondary = String(
        profile.badge_color_secondary || profile.badgeColorSecondary || "",
      ).trim();
    }
    if (!tag && inv?.guild?.tag) tag = String(inv.guild.tag).trim();
    if (!badge && inv?.guild?.badge_hash) badge = String(inv.guild.badge_hash).trim();
  }

  try {
    const cache = guild?.members?.cache;
    if (cache && typeof cache.values === "function") {
      for (const member of cache.values()) {
        const u = member?.user;
        if (!u) continue;
        const pg = u.primaryGuild || u.clan || null;
        if (!pg) continue;
        const idg = String(pg.identityGuildId || pg.identity_guild_id || "").trim();
        if (idg && idg !== gid) continue;
        const t = String(pg.tag || "").trim();
        const b = String(pg.badge || "").trim();
        if (t) {
          if (!tag) tag = t;
          if (b && !/^\d+$/.test(b) && !badge) badge = b;
          if (tag && badge) break;
        }
      }
    }
  } catch (_) {}

  if (!tag && gid === MAIN_GUILD_ID) tag = "V&C";
  tag = String(tag || "").trim().slice(0, 4);
  if (!tag) return null;
  return {
    guildTag: tag,
    guildTagBadge: badge || "",
    guildTagBadgeUrl: badge ? guildTagBadgeCdnUrl(gid, badge) : "",
    guildTagBadgeColor: colorPrimary || "",
    guildTagBadgeColor2: colorSecondary || "",
  };
}

async function refreshListingStats(client?, listing?) {
  if (!listing) return listing;
  const kind = String(listing.boardKind || listing.kind || "");
  if (kind !== "server") return listing;
  const gid = String(listing.boardDiscordId || listing.discordId || "").trim();
  if (!snowflakeOk(gid) || !client?.guilds) return listing;
  try {
    const guild =
      client.guilds.cache.get(gid) || (await fetchGuildPreferLite(client, gid));
    if (!guild) return listing;
    const prev =
      (listing.stats && typeof listing.stats === "object" && listing.stats) ||
      (listing.boardStats && typeof listing.boardStats === "object" && listing.boardStats) ||
      {};
    const inviteUrl = listing.inviteUrl || listing.boardInviteUrl || "";
    const tagInfo: any = (await resolveGuildServerTag(client, guild, inviteUrl)) || {};
    const stats = {
      members: Number(guild.memberCount) || 0,
      name: String(guild.name || ""),
      guildTag: tagInfo.guildTag || prev.guildTag || "",
      guildTagBadge: tagInfo.guildTagBadge || prev.guildTagBadge || "",
      guildTagBadgeUrl: tagInfo.guildTagBadgeUrl || prev.guildTagBadgeUrl || "",
      guildTagBadgeColor: tagInfo.guildTagBadgeColor || prev.guildTagBadgeColor || "",
      guildTagBadgeColor2: tagInfo.guildTagBadgeColor2 || prev.guildTagBadgeColor2 || "",
      refreshedAt: new Date().toISOString(),
    };
    if (stats.guildTagBadge && !stats.guildTagBadgeUrl) {
      stats.guildTagBadgeUrl = guildTagBadgeCdnUrl(gid, stats.guildTagBadge);
    }
    const iconUrl =
      (guild.icon ? discordGuildIconUrl(guild, null, 128) : "") ||
      preferAnimatedDiscordMediaUrl(listing.boardIconUrl || listing.iconUrl || "") ||
      "";
    await SiteDocument.updateOne(
      { _id: listing._id || listing.id, docType: BL },
      {
        $set: {
          boardStats: stats,
          boardIconUrl: iconUrl,
        },
      },
    );
    return {
      ...listing,
      boardStats: stats,
      stats: { ...(listing.stats && typeof listing.stats === "object" ? listing.stats : {}), ...stats },
      iconUrl: iconUrl || listing.iconUrl || "",
    };
  } catch {
    return listing;
  }
}

async function runBoardsStatsJob(client?) {
  const gate = featureGate(client);
  if (!gate.ok) return { ok: false, skipped: true };
  const rows = await SiteDocument.find({ docType: BL, status: "approved", boardKind: "server" })
    .select({ _id: 1, boardDiscordId: 1, boardKind: 1, boardIconUrl: 1, boardInviteUrl: 1, boardStats: 1 })
    .limit(80)
    .lean();
  let n = 0;
  for (const row of rows) {
    await refreshListingStats(client, row);
    n += 1;
  }
  /* refresh scores for top listings */
  const top = await SiteDocument.find({ docType: BL, status: "approved" })
    .select({ _id: 1 })
    .sort({ boardScore: -1 })
    .limit(100)
    .lean();
  for (const row of top) {
    await recomputeListingScore(String(row._id), gate.cfg);
  }
  return { ok: true, refreshed: n, scored: top.length };
}

let statsTimer = null;
function ensureBoardsStatsScheduler(client?) {
  if (statsTimer) return;
  const minutes = Math.max(15, Number(client?.config?.boards?.statsRefreshMinutes) || 60);
  statsTimer = setInterval(() => {
    runBoardsStatsJob(client).catch((err?) => {
      global.logger?.warn?.("[boards] stats job:", err?.message || err);
    });
  }, minutes * 60 * 1000);
  if (typeof statsTimer.unref === "function") statsTimer.unref();
}

/* boardsLinkCheck1: probe invite/social/sito/banner per ✓/✗ nel form */
/* boardsLinkCheck2: Instagram/X spesso 429 anti-bot → soft ✓ se handle valido */
const PROBE_UA = "ViniliBoardsLinkCheck/1.0 (+https://www.viniliecaffe.it)";
const probeRateByUser = new Map();

function probeAllow(userId?) {
  const now = Date.now();
  const key = String(userId || "anon");
  let bucket = probeRateByUser.get(key);
  if (!bucket || now - bucket.start > 60_000) {
    bucket = { start: now, n: 0 };
    probeRateByUser.set(key, bucket);
  }
  bucket.n += 1;
  if (probeRateByUser.size > 2000) {
    for (const [k, v] of probeRateByUser) {
      if (now - v.start > 120_000) probeRateByUser.delete(k);
    }
  }
  return bucket.n <= 90;
}

function inviteCodeFromRaw(raw?) {
  const v = String(raw || "").trim();
  if (!v) return "";
  return v
    .replace(/^https?:\/\/(www\.)?discord\.gg\//i, "")
    .replace(/^https?:\/\/(www\.)?discord\.com\/invite\//i, "")
    .replace(/^discord\.gg\//i, "")
    .replace(/^\/+/, "")
    .split(/[?#]/)[0]
    .trim();
}

async function fetchProbe(url?, opts: Record<string, any> = {}) {
  const method = opts.method || "GET";
  const timeoutMs = Math.max(1500, Math.min(8000, Number(opts.timeoutMs) || 5500));
  const ctrl = new AbortController();
  const t = setTimeout(() => {
    try {
      ctrl.abort();
    } catch (_) {}
  }, timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        Accept: opts.accept || "*/*",
        "User-Agent": PROBE_UA,
        ...(opts.headers || {}),
      },
    });
    return res;
  } finally {
    clearTimeout(t);
  }
}

async function probeHttpExists(url?, { expectImage = false, softBlockOk = false } = {}) {
  const target = String(url || "").trim();
  if (!/^https?:\/\//i.test(target)) {
    return { ok: false, found: false, reason: "invalid_url" };
  }
  let res = null;
  try {
    res = await fetchProbe(target, { method: "HEAD", timeoutMs: 4500 });
  } catch (_) {
    res = null;
  }
  const retryGet =
    !res ||
    res.status === 405 ||
    res.status === 501 ||
    res.status === 403 ||
    res.status === 429 ||
    res.status === 503;
  if (retryGet) {
    try {
      res = await fetchProbe(target, {
        method: "GET",
        timeoutMs: 5500,
        accept: expectImage ? "image/*,*/*;q=0.8" : "text/html,application/json,*/*;q=0.8",
        headers: {
          /* boardsLinkCheck2: UA browser riduce qualche blocco (non Instagram 429 sul VPS) */
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
        },
      });
    } catch (_) {
      if (softBlockOk) {
        return { ok: true, found: true, reason: "soft_ok_unreachable" };
      }
      return { ok: true, found: false, reason: "unreachable" };
    }
  }
  const status = Number(res.status) || 0;
  if (status === 404 || status === 410 || status === 451) {
    return { ok: true, found: false, reason: "not_found", status };
  }
  if (status >= 200 && status < 400) {
    if (expectImage) {
      const ct = String(res.headers.get("content-type") || "").toLowerCase();
      if (ct && !ct.startsWith("image/") && !ct.includes("octet-stream")) {
        return { ok: true, found: false, reason: "not_image", status, contentType: ct };
      }
    }
    return { ok: true, found: true, status };
  }
  if (status === 401 || status === 403 || status === 429 || status === 503) {
    /* social anti-bot (IG 429 sul VPS): handle valido → soft ✓ */
    if (softBlockOk || status === 401 || status === 403) {
      return { ok: true, found: true, reason: "soft_ok", status };
    }
  }
  return { ok: true, found: false, reason: "bad_status", status };
}

async function probeDiscordInvite(code?) {
  const c = String(code || "").trim();
  if (!/^[A-Za-z0-9-]{2,64}$/.test(c)) {
    return { ok: true, found: false, reason: "invalid_code" };
  }
  try {
    const res = await fetchProbe(`https://discord.com/api/v10/invites/${encodeURIComponent(c)}?with_counts=true`, {
      method: "GET",
      timeoutMs: 5500,
      accept: "application/json",
    });
    if (res.status === 404 || res.status === 410) {
      return { ok: true, found: false, reason: "not_found", status: res.status };
    }
    if (!res.ok) {
      return { ok: true, found: false, reason: "bad_status", status: res.status };
    }
    const data: any = await res.json().catch(() => null);
    const guildName = String(data?.guild?.name || data?.guild_name || "").trim();
    return {
      ok: true,
      found: true,
      status: res.status,
      label: guildName || undefined,
    };
  } catch (_) {
    return { ok: true, found: false, reason: "unreachable" };
  }
}

async function probeGithubUser(handle?) {
  const h = String(handle || "").trim();
  if (!/^[A-Za-z0-9-]{1,39}$/.test(h)) {
    return { ok: true, found: false, reason: "invalid_handle" };
  }
  try {
    const res = await fetchProbe(`https://api.github.com/users/${encodeURIComponent(h)}`, {
      method: "GET",
      timeoutMs: 5500,
      accept: "application/vnd.github+json",
      headers: { "X-GitHub-Api-Version": "2022-11-28" },
    });
    if (res.status === 404) return { ok: true, found: false, reason: "not_found", status: 404 };
    if (res.ok) {
      const data: any = await res.json().catch(() => null);
      return {
        ok: true,
        found: true,
        status: res.status,
        label: String(data?.login || h),
      };
    }
    return probeHttpExists(`https://github.com/${encodeURIComponent(h)}`);
  } catch (_) {
    return { ok: true, found: false, reason: "unreachable" };
  }
}

async function probeYoutubeHandle(handle?) {
  const h = String(handle || "").trim().replace(/^@+/, "");
  if (!h) return { ok: true, found: false, reason: "invalid_handle" };
  const url = `https://www.youtube.com/@${encodeURIComponent(h)}`;
  try {
    const oembed = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`;
    const res = await fetchProbe(oembed, { method: "GET", timeoutMs: 5500, accept: "application/json" });
    if (res.ok) {
      const data: any = await res.json().catch(() => null);
      return {
        ok: true,
        found: true,
        status: res.status,
        label: String(data?.author_name || h),
      };
    }
    if (res.status === 404) return { ok: true, found: false, reason: "not_found", status: 404 };
  } catch (_) {}
  return probeHttpExists(url, { softBlockOk: true });
}

async function probeBoardLink(client?, payload: Record<string, any> = {}) {
  void client;
  const auth = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  if (!probeAllow(auth.userId)) {
    return { ok: false, status: 429, error: "rate_limited", message: "Troppi controlli, riprova tra poco." };
  }

  const kind = String(payload.kind || payload.type || "").trim().toLowerCase();
  const raw = String(payload.value || payload.url || payload.handle || "").trim();
  if (!kind) {
    return { ok: false, status: 400, error: "missing_kind", message: "Tipo link mancante." };
  }
  if (!raw) {
    return { ok: true, status: 200, found: false, empty: true, kind };
  }

  const socialKeys = ["youtube", "twitch", "instagram", "tiktok", "x", "github"];
  if (kind === "invite" || kind === "discord_invite") {
    const code = inviteCodeFromRaw(raw);
    const out = await probeDiscordInvite(code);
    return { ...out, status: 200, kind: "invite", value: code ? `https://discord.gg/${code}` : "" };
  }

  if (kind === "bot_invite") {
    let url = raw;
    if (!/^https?:\/\//i.test(url)) url = `https://${url.replace(/^\/+/, "")}`;
    const okHost =
      /discord\.com\/(api\/)?oauth2\/authorize/i.test(url) ||
      /discordapp\.com\/(api\/)?oauth2\/authorize/i.test(url);
    if (!okHost || !/[?&]client_id=\d{5,}/i.test(url)) {
      return { ok: true, status: 200, found: false, kind, reason: "invalid_bot_invite" };
    }
    return { ok: true, status: 200, found: true, kind, value: url };
  }

  if (kind === "website" || kind === "site") {
    let url = raw;
    if (!/^https?:\/\//i.test(url)) url = `https://${url.replace(/^\/+/, "")}`;
    try {
      const u = new URL(url);
      if (!u.hostname || !u.hostname.includes(".")) {
        return { ok: true, status: 200, found: false, kind: "website", reason: "invalid_host" };
      }
      url = u.toString();
    } catch (_) {
      return { ok: true, status: 200, found: false, kind: "website", reason: "invalid_url" };
    }
    const out = await probeHttpExists(url);
    return { ...out, status: 200, kind: "website", value: url };
  }

  if (kind === "banner" || kind === "image") {
    let url = raw;
    if (!/^https?:\/\//i.test(url)) url = `https://${url.replace(/^\/+/, "")}`;
    try {
      url = new URL(url).toString();
    } catch (_) {
      return { ok: true, status: 200, found: false, kind: "banner", reason: "invalid_url" };
    }
    const out = await probeHttpExists(url, { expectImage: true });
    return { ...out, status: 200, kind: "banner", value: url };
  }

  if (socialKeys.includes(kind)) {
    const handle = String(raw)
      .replace(/^@+/, "")
      .replace(/^\/+/, "")
      .split(/[/?#]/)[0]
      .trim();
    if (!handle || !/^[A-Za-z0-9._-]{1,64}$/.test(handle)) {
      return { ok: true, status: 200, found: false, kind, reason: "invalid_handle" };
    }
    if (kind === "github") {
      const out = await probeGithubUser(handle);
      return { ...out, status: 200, kind, value: SOCIAL_HANDLE_BUILDERS.github(handle) };
    }
    if (kind === "youtube") {
      const out = await probeYoutubeHandle(handle);
      return { ...out, status: 200, kind, value: SOCIAL_HANDLE_BUILDERS.youtube(handle) };
    }
    const built = SOCIAL_HANDLE_BUILDERS[kind](handle);
    /* IG/X/TikTok/Twitch: anti-bot frequente → soft ✓ se handle ok */
    const out = await probeHttpExists(built, { softBlockOk: true });
    return { ...out, status: 200, kind, value: built };
  }

  return { ok: false, status: 400, error: "unknown_kind", message: "Tipo link non supportato." };
}

export = {
  boardsConfig,
  getBoardsPublicConfig,
  listBoardTags,
  listListings,
  warmSiteBoardsListingsCache,
  invalidateListingsListCache,
  /* boardsPendingRedirect1 */
  getListingBySlug,
  createListing,
  patchListing,
  submitListing,
  generateInvite,
  guildBoardDefaults,
  probeBoardLink,
  uploadBoardBanner,
  serveBoardBannerFile,
  listMine,
  getMyListingById,
  deleteMyListing,
  deleteServerListingsForLeftGuild,
  purgeBoardListingDoc,
  refreshMyListing,
  listClaimableServers,
  startListingVoteSession,
  progressListingVoteSession,
  voteListing,
  setListingVoteReminder,
  sweepBoardVoteReminders,
  ensureBoardsVoteReminderScheduler,
  bumpListing,
  reportListing,
  listListingReviews,
  createListingReview,
  toggleListingReviewLike,
  reportListingReview,
  upsertListingReviewReply,
  /* boardsImportSiteServerReviews1: mirror /recensioni SERVER → scheda main */
  syncSiteServerReviewToMainBoardListing,
  removeSiteServerReviewFromMainBoardListing,
  modListPending,
  getListingForStaffReview,
  modDecide,
  runBoardsStatsJob,
  ensureBoardsStatsScheduler,
  refreshListingStats,
  serializeListing,
  clientIp,
  BOARD_CATEGORIES,
  BOARD_LOCALES,
  BOARD_LOCALE_LABELS,
  BOARD_TAG_CATALOG,
};

/* boardsAnimIcon1 */

