/**
 * Vinili Boards — public server/bot directory API.
 * Docs live in sitedocuments (BOARD_LISTING / BOARD_VOTE / BOARD_BUMP / BOARD_REPORT).
 */
const crypto = require("crypto");
const mongoose = require("mongoose");
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");
const { fetchDiscordOAuthMe } = require("./discordOauthMe");
const { assertWebsiteStaffAccess } = require("./siteStaffAccessApi");
const {
  buildKnownBotGuildIdSet,
  syncKnownBotGuildIdsFromRest,
} = require("./siteDashboardApi");
const { PermissionFlagsBits, ChannelType } = require("discord.js");
const IDs = require("../Config/ids");

const BL = SITE_DOCUMENT_TYPE.BOARD_LISTING;
const MAIN_GUILD_ID = String(IDs?.guilds?.main || "").trim();
const MAIN_GUILD_SITE = "https://www.viniliecaffe.it";
const BV = SITE_DOCUMENT_TYPE.BOARD_VOTE;
const BB = SITE_DOCUMENT_TYPE.BOARD_BUMP;
const BR = SITE_DOCUMENT_TYPE.BOARD_REPORT;

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
const SENSITIVE_PATCH_KEYS = new Set([
  "name",
  "inviteUrl",
  "botInviteUrl",
  "discordId",
  "boardInviteUrl",
  "boardBotInviteUrl",
]);

function boardsConfig(client) {
  const raw = client?.config?.boards && typeof client.config.boards === "object" ? client.config.boards : {};
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
    categories: BOARD_CATEGORIES.slice(),
    locales: BOARD_LOCALES.slice(),
  };
}

function featureGate(client) {
  const cfg = boardsConfig(client);
  if (!cfg.enabled) {
    return { ok: false, status: 503, error: "boards_disabled", message: "La Bacheca non è attiva." };
  }
  return { ok: true, cfg };
}

function snowflakeOk(id) {
  return /^\d{17,22}$/.test(String(id || "").trim());
}

function slugify(input) {
  const base = String(input || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "listing";
}

function sanitizeText(value, max) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .slice(0, max);
}

function sanitizeUrl(value, max = 500) {
  const u = sanitizeText(value, max);
  if (!u) return "";
  if (!/^https:\/\//i.test(u)) return "";
  return u;
}

function sanitizeTags(tags, maxTags) {
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
function tagMatchesQuery(tag, q) {
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

function sanitizeCategories(raw, maxCategories) {
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

function sanitizeLocales(raw, maxLocales) {
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
  youtube: (h) => `https://www.youtube.com/@${h}`,
  twitch: (h) => `https://www.twitch.tv/${h}`,
  instagram: (h) => `https://www.instagram.com/${h}`,
  tiktok: (h) => `https://www.tiktok.com/@${h}`,
  x: (h) => `https://x.com/${h}`,
  github: (h) => `https://github.com/${h}`,
  website: (h) => (/^https?:\/\//i.test(h) ? h : `https://${h}`),
};

function normalizeSocialHandle(key, raw) {
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

function sanitizeSocials(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const key of BOARD_SOCIAL_KEYS) {
    const v = normalizeSocialHandle(key, raw[key]);
    if (v) out[key] = v;
  }
  return out;
}

function discordGuildBannerUrl(guild) {
  if (!guild?.id || !guild.banner) return "";
  const hash = String(guild.banner);
  const ext = hash.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/banners/${guild.id}/${hash}.${ext}?size=1024`;
}

function discordGuildInviteHint(guild) {
  const code = String(guild?.vanityURLCode || "").trim();
  if (!code) return "";
  return sanitizeUrl(`https://discord.gg/${code}`);
}

async function resolveGuildBoardDefaults(client, guildId) {
  const gid = String(guildId || "").trim();
  if (!snowflakeOk(gid) || !client) return { inviteUrl: "", bannerUrl: "", siteUrl: "" };
  let guild = null;
  try {
    guild = client.guilds.cache.get(gid) || (await client.guilds.fetch(gid).catch(() => null));
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

function sanitizeAccent(value) {
  const v = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
  return "";
}

function viniliBotInviteUrl(client, guildId) {
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

function listingChecklist(doc, cfgIn) {
  const cfg = cfgIn && typeof cfgIn === "object" ? cfgIn : {};
  const minTagline = Math.max(8, Math.min(80, Number(cfg.minTaglineChars) || 20));
  const minDesc = Math.max(20, Math.min(500, Number(cfg.minDescriptionChars) || 80));
  const kind = String(doc?.boardKind || "") === "bot" ? "bot" : "server";
  const name = String(doc?.title || "").trim();
  const tagline = String(doc?.boardTagline || "").trim();
  const description = String(doc?.content || doc?.boardMarkdown || "").trim();
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
      label: "Descrizione breve (min " + minTagline + ")",
    },
    {
      id: "description",
      required: true,
      ok: description.length >= minDesc,
      label: "Descrizione lunga (min " + minDesc + ")",
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
      label: "Social",
    },
  ];
  const missing = items.filter((i) => i.required && !i.ok).map((i) => i.id);
  return { items, missing, complete: missing.length === 0, categories, locales };
}

function hashIp(ip) {
  const raw = String(ip || "").trim();
  if (!raw) return "";
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 40);
}

function clientIp(req) {
  const xf = String(req?.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return xf || String(req?.socket?.remoteAddress || "").trim();
}

function dayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function computeScore(votes30d, bumps7d, cfg) {
  return Math.max(0, Number(votes30d) || 0) * cfg.scoreVotesWeight + Math.max(0, Number(bumps7d) || 0) * cfg.scoreBumpsWeight;
}

function serializeListing(doc, opts = {}) {
  if (!doc) return null;
  const wf = doc.boardModeration && typeof doc.boardModeration === "object" ? doc.boardModeration : {};
  const categories = sanitizeCategories(doc.boardCategories);
  const locales = sanitizeLocales(
    Array.isArray(doc.boardLocales) && doc.boardLocales.length
      ? doc.boardLocales
      : doc.boardLocale
        ? [doc.boardLocale]
        : [],
  );
  const socials = sanitizeSocials(doc.boardSocials);
  const checklist = listingChecklist(doc);
  const out = {
    id: String(doc._id),
    kind: String(doc.boardKind || ""),
    discordId: String(doc.boardDiscordId || ""),
    slug: String(doc.boardSlug || ""),
    status: String(doc.status || ""),
    ownerUserId: String(doc.userId || ""),
    name: String(doc.title || ""),
    tagline: String(doc.boardTagline || ""),
    description: String(doc.content || doc.boardMarkdown || ""),
    tags: Array.isArray(doc.boardTags) ? doc.boardTags.map(String) : [],
    categories,
    locales,
    locale: locales[0] || String(doc.boardLocale || ""),
    visitorNotes: String(doc.boardVisitorNotes || ""),
    siteUrl: String(doc.boardSiteUrl || ""),
    socials,
    inviteUrl: String(doc.boardInviteUrl || ""),
    botInviteUrl: String(doc.boardBotInviteUrl || ""),
    bannerUrl: String(doc.boardBannerUrl || ""),
    iconUrl: String(doc.boardIconUrl || ""),
    nsfw: Boolean(doc.boardNsfw) || categories.includes("nsfw"),
    score: Number(doc.boardScore) || 0,
    votes30d: Number(doc.boardVotes30d) || 0,
    bumps7d: Number(doc.boardBumps7d) || 0,
    bumpedAt: doc.boardBumpedAt ? new Date(doc.boardBumpedAt).toISOString() : null,
    accent: String(doc.boardAccent || ""),
    markdown: "",
    stats: doc.boardStats && typeof doc.boardStats === "object" ? doc.boardStats : {},
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

async function resolveBoardsUser(accessToken) {
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

async function fetchManageableGuilds(accessToken) {
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
    const json = await res.json();
    const PERM_ADMIN = 0x8n;
    const PERM_MANAGE_GUILD = 0x20n;
    const guilds = (Array.isArray(json) ? json : []).filter((row) => {
      if (row?.owner === true) return true;
      try {
        const perms = BigInt(row?.permissions ?? 0);
        return (perms & PERM_ADMIN) === PERM_ADMIN || (perms & PERM_MANAGE_GUILD) === PERM_MANAGE_GUILD;
      } catch {
        return false;
      }
    });
    return { ok: true, guilds };
  } catch {
    return { ok: false, status: 502, error: "discord_unreachable", message: "Discord non raggiungibile." };
  }
}

async function uniqueSlug(base) {
  let slug = slugify(base);
  for (let i = 0; i < 12; i += 1) {
    const candidate = i === 0 ? slug : `${slug}-${i + 1}`;
    const exists = await SiteDocument.exists({ docType: BL, boardSlug: candidate });
    if (!exists) return candidate;
  }
  return `${slug}-${Date.now().toString(36)}`;
}

async function assertBotInGuild(client, guildId) {
  const gid = String(guildId || "").trim();
  if (!snowflakeOk(gid) || !client) return false;
  try {
    await syncKnownBotGuildIdsFromRest(client).catch(() => null);
  } catch (_) {}
  const known = buildKnownBotGuildIdSet(client);
  if (known.has(gid)) return true;
  try {
    const g = client.guilds.cache.get(gid) || (await client.guilds.fetch(gid).catch(() => null));
    return Boolean(g);
  } catch {
    return false;
  }
}

async function assertCanClaimServer(client, accessToken, discordId) {
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
  const match = (Array.isArray(list.guilds) ? list.guilds : []).find((g) => String(g?.id || "") === gid);
  if (!match) {
    return {
      ok: false,
      status: 403,
      error: "not_manageable",
      message: "Devi essere owner o avere Gestisci server su quel server Discord.",
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
    iconUrl: match.icon
      ? `https://cdn.discordapp.com/icons/${gid}/${match.icon}.png?size=128`
      : "",
    botPresent: true,
  };
}

async function recomputeListingScore(listingId, cfg) {
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

async function listListings(client, query = {}) {
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
  const sort = String(query.sort || "score").trim().toLowerCase();
  const page = Math.max(1, Number(query.page) || 1);
  const perPage = Math.min(48, Math.max(1, Number(query.perPage) || 24));
  const filter = { docType: BL, status: "approved" };
  if (kind === "server" || kind === "bot") filter.boardKind = kind;
  if (tag) filter.boardTags = tag;
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [
      { title: rx },
      { boardTagline: rx },
      { boardSlug: rx },
      { boardTags: rx },
      { boardInviteUrl: rx },
      { boardBotInviteUrl: rx },
      { boardCategories: rx },
      { content: rx },
    ];
  }
  let sortSpec = { boardScore: -1, boardBumpedAt: -1, createdAt: -1 };
  if (sort === "new") sortSpec = { createdAt: -1 };
  else if (sort === "bumps") sortSpec = { boardBumpedAt: -1, boardScore: -1 };
  else if (sort === "votes") sortSpec = { boardVotes30d: -1, boardScore: -1 };

  const total = await SiteDocument.countDocuments(filter);
  const rows = await SiteDocument.find(filter)
    .sort(sortSpec)
    .skip((page - 1) * perPage)
    .limit(perPage)
    .lean();
  return {
    ok: true,
    status: 200,
    page,
    perPage,
    total,
    listings: rows.map((r) => serializeListing(r)),
    enabled: cfg.enabled,
    publicOpen: cfg.publicOpen,
  };
}

async function getListingBySlug(client, slug, opts = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const cfg = gate.cfg;
  if (!cfg.publicOpen && !opts.allowClosed) {
    return {
      ok: false,
      status: 403,
      error: "boards_preview",
      message: "La Bacheca è in anteprima staff.",
      publicOpen: false,
    };
  }
  const s = slugify(slug);
  const doc = await SiteDocument.findOne({ docType: BL, boardSlug: s }).lean();
  if (!doc || doc.status !== "approved") {
    return { ok: false, status: 404, error: "not_found", message: "Scheda non trovata." };
  }
  return { ok: true, status: 200, listing: serializeListing(doc), publicOpen: cfg.publicOpen };
}

function getBoardsPublicConfig(client) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
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
  };
}

async function listBoardTags(client, payload = {}) {
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
    items = items.filter((x) => tagMatchesQuery(String(x.tag || ""), q));
  }
  items.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  items = items.slice(0, limit);
  return {
    ok: true,
    status: 200,
    maxTags: gate.cfg.maxTags,
    tags: items.map((x) => x.tag),
    items,
  };
}

async function createListing(client, payload = {}) {
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

  const dup = await SiteDocument.findOne({
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

  const tagline = sanitizeText(payload.tagline, 160);
  const description = sanitizeText(
    payload.description || payload.markdown,
    Math.max(2000, cfg.maxMarkdownChars || 4000),
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
    boardMarkdown: "",
    boardScore: 0,
    boardVotes30d: 0,
    boardBumps7d: 0,
    boardBumpedAt: null,
    boardStats: {},
    boardModeration: { notes: "", submittedByName: auth.globalName || auth.username || "" },
    authorName: auth.globalName || auth.username || "",
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
  return {
    ok: true,
    status: 201,
    listing: serializeListing(doc.toObject(), { includeMod: true }),
  };
}

async function patchListing(client, payload = {}) {
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
  let sensitive = false;
  if (body.name != null) {
    doc.title = sanitizeText(body.name, 100) || doc.title;
    if (SENSITIVE_PATCH_KEYS.has("name")) sensitive = true;
  }
  if (body.tagline != null) doc.boardTagline = sanitizeText(body.tagline, 160);
  if (body.description != null) {
    doc.content = sanitizeText(body.description, Math.max(2000, cfg.maxMarkdownChars || 4000));
    doc.boardMarkdown = "";
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
  if (body.inviteUrl != null) {
    doc.boardInviteUrl = sanitizeUrl(body.inviteUrl);
    sensitive = true;
  }
  if (body.botInviteUrl != null) {
    doc.boardBotInviteUrl = sanitizeUrl(body.botInviteUrl);
    sensitive = true;
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

  if (sensitive && doc.status === "approved") {
    doc.status = "pending";
    const mod = doc.boardModeration && typeof doc.boardModeration === "object" ? { ...doc.boardModeration } : {};
    mod.rependingAt = new Date().toISOString();
    mod.rependingReason = "sensitive_fields_changed";
    doc.boardModeration = mod;
  }

  await doc.save();
  return { ok: true, status: 200, listing: serializeListing(doc.toObject(), { includeMod: true }) };
}

async function listMine(client, payload = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const auth = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  const rows = await SiteDocument.find({ docType: BL, userId: auth.userId }).sort({ updatedAt: -1 }).lean();
  return { ok: true, status: 200, listings: rows.map((r) => serializeListing(r, { includeMod: true })) };
}

async function listClaimableServers(client, payload = {}) {
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
    .filter((g) => snowflakeOk(g?.id))
    .map((g) => {
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
        iconUrl: g.icon ? `https://cdn.discordapp.com/icons/${id}/${g.icon}.png?size=128` : "",
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
      (a, b) =>
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
      "Per pubblicare un server serve il bot Vinili & Caffè nel server (e permesso Gestisci server).",
  };
}

async function submitListing(client, payload = {}) {
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
  const check = listingChecklist(doc.toObject(), gate.cfg);
  if (!check.complete) {
    return {
      ok: false,
      status: 400,
      error: "incomplete",
      message: "Completa la checklist prima di inviare a controllo.",
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
  return { ok: true, status: 200, listing: serializeListing(doc.toObject(), { includeMod: true }) };
}

function inviteUrlFromCode(code) {
  const c = String(code || "").trim().replace(/^https?:\/\/(www\.)?discord\.(gg|com)\/(invite\/)?/i, "");
  if (!c || /[^a-zA-Z0-9-]/i.test(c) || c.length > 64) return "";
  return sanitizeUrl(`https://discord.gg/${c}`);
}

function discordInviteErrorMessage(err) {
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

async function generateInvite(client, payload = {}) {
  /* boardsGenInvite3: SEMPRE invite nuovo infinito (no vanity / no riuso esistenti) */
  /* boardsGenInvite4: no thread (createInvite missing) + guild.invites.create */
  /* boardsGenInvite5: site-api usa client._rest (non client.rest) */
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
    guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId));
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

  const finish = async (inviteUrl) => {
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

  const me = guild.members.me || (await guild.members.fetchMe().catch(() => null));
  if (!me) {
    return {
      ok: false,
      status: 403,
      error: "bot_member_missing",
      message: "Il bot è nel server ma non riesco a leggerlo. Riprova tra poco.",
    };
  }

  const canInvite = (ch) => {
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
    try {
      return Boolean(ch.permissionsFor(me)?.has?.(PermissionFlagsBits.CreateInstantInvite));
    } catch {
      return false;
    }
  };

  const ranked = [...guild.channels.cache.values()]
    .filter(canInvite)
    .sort((a, b) => {
      const score = (ch) => {
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

  async function createInviteOnChannel(channel) {
    const chId = String(channel?.id || "").trim();
    if (!chId) throw new Error("missing_channel");
    /* Preferisci createInvite sul canale (REST shim) o GuildInviteManager */
    if (typeof channel.createInvite === "function") {
      return channel.createInvite(inviteOpts);
    }
    if (typeof guild.invites?.create === "function") {
      return guild.invites.create(chId, inviteOpts);
    }
    const rest = client?._rest || client?.rest;
    if (rest && typeof rest.post === "function") {
      const { Routes } = require("discord.js");
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

async function guildBoardDefaults(client, payload = {}) {
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
    const gen = await generateInvite(client, {
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

async function voteListing(client, payload = {}, reqMeta = {}) {
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

  const dedupe = `${id}:${auth.userId}:${dayKey()}`;
  const existing = await SiteDocument.findOne({ docType: BV, dedupeKey: dedupe }).lean();
  if (existing) {
    return {
      ok: false,
      status: 429,
      error: "vote_cooldown",
      message: `Puoi votare di nuovo tra circa ${cfg.voteCooldownHours} ore (max 1 voto/giorno).`,
    };
  }

  /* also enforce rolling cooldown window */
  const since = new Date(Date.now() - cfg.voteCooldownHours * 60 * 60 * 1000);
  const recent = await SiteDocument.findOne({
    docType: BV,
    boardListingId: id,
    userId: auth.userId,
    createdAt: { $gte: since },
  }).lean();
  if (recent) {
    return { ok: false, status: 429, error: "vote_cooldown", message: "Hai già votato di recente per questa scheda." };
  }

  try {
    await SiteDocument.create({
      docType: BV,
      userId: auth.userId,
      boardListingId: id,
      guildId: String(listing.boardDiscordId || ""),
      dedupeKey: dedupe,
      boardClientIpHash: hashIp(reqMeta.ip),
      authorName: auth.globalName || auth.username || "",
    });
  } catch (err) {
    if (err && (err.code === 11000 || String(err.message || "").includes("duplicate"))) {
      return { ok: false, status: 429, error: "vote_cooldown", message: "Voto già registrato." };
    }
    throw err;
  }

  const scores = await recomputeListingScore(id, cfg);
  return { ok: true, status: 200, voted: true, ...scores };
}

async function bumpListing(client, payload = {}, reqMeta = {}) {
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
  return { ok: true, status: 200, bumped: true, bumpedAt: listing.boardBumpedAt.toISOString(), ...scores };
}

async function reportListing(client, payload = {}) {
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
  const listing = await SiteDocument.findOne({ _id: id, docType: BL }).lean();
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

async function modListPending(client, payload = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const staff = await assertWebsiteStaffAccess(client, payload.accessToken);
  if (!staff?.ok) {
    return {
      ok: false,
      status: Number(staff?.status) || 403,
      error: staff?.error || "forbidden",
      message: staff?.message || "Accesso staff richiesto.",
    };
  }
  const status = String(payload.status || "pending").trim() || "pending";
  const filter = { docType: BL };
  if (status === "all") {
    filter.status = { $nin: ["draft"] };
  } else if (status === "draft") {
    filter.status = "pending";
  } else {
    filter.status = status;
  }
  const rows = await SiteDocument.find(filter).sort({ updatedAt: -1 }).limit(100).lean();
  return { ok: true, status: 200, listings: rows.map((r) => serializeListing(r, { includeMod: true })) };
}

async function modDecide(client, payload = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const staff = await assertWebsiteStaffAccess(client, payload.accessToken);
  if (!staff?.ok) {
    return {
      ok: false,
      status: Number(staff?.status) || 403,
      error: staff?.error || "forbidden",
      message: staff?.message || "Accesso staff richiesto.",
    };
  }
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
  return { ok: true, status: 200, listing: serializeListing(doc.toObject(), { includeMod: true }) };
}

async function refreshListingStats(client, listing) {
  if (!listing || listing.boardKind !== "server") return listing;
  const gid = String(listing.boardDiscordId || "").trim();
  if (!snowflakeOk(gid) || !client?.guilds) return listing;
  try {
    const guild =
      client.guilds.cache.get(gid) || (await client.guilds.fetch(gid).catch(() => null));
    if (!guild) return listing;
    const stats = {
      members: Number(guild.memberCount) || 0,
      name: String(guild.name || ""),
      refreshedAt: new Date().toISOString(),
    };
    await SiteDocument.updateOne(
      { _id: listing._id || listing.id, docType: BL },
      {
        $set: {
          boardStats: stats,
          boardIconUrl:
            listing.boardIconUrl ||
            (guild.icon ? guild.iconURL({ size: 128, extension: "png" }) : listing.boardIconUrl || ""),
        },
      },
    );
    return { ...listing, boardStats: stats };
  } catch {
    return listing;
  }
}

async function runBoardsStatsJob(client) {
  const gate = featureGate(client);
  if (!gate.ok) return { ok: false, skipped: true };
  const rows = await SiteDocument.find({ docType: BL, status: "approved", boardKind: "server" })
    .select({ _id: 1, boardDiscordId: 1, boardKind: 1, boardIconUrl: 1 })
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
function ensureBoardsStatsScheduler(client) {
  if (statsTimer) return;
  const minutes = Math.max(15, Number(client?.config?.boards?.statsRefreshMinutes) || 60);
  statsTimer = setInterval(() => {
    runBoardsStatsJob(client).catch((err) => {
      global.logger?.warn?.("[boards] stats job:", err?.message || err);
    });
  }, minutes * 60 * 1000);
  if (typeof statsTimer.unref === "function") statsTimer.unref();
}

module.exports = {
  boardsConfig,
  getBoardsPublicConfig,
  listBoardTags,
  listListings,
  getListingBySlug,
  createListing,
  patchListing,
  submitListing,
  generateInvite,
  guildBoardDefaults,
  listMine,
  listClaimableServers,
  voteListing,
  bumpListing,
  reportListing,
  modListPending,
  modDecide,
  runBoardsStatsJob,
  ensureBoardsStatsScheduler,
  serializeListing,
  clientIp,
  BOARD_CATEGORIES,
  BOARD_LOCALES,
  BOARD_LOCALE_LABELS,
  BOARD_TAG_CATALOG,
};
