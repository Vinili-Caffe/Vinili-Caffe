/** Bacheche: pulizia dei campi inviati (testo, link, tag, categorie, lingue, social, colore) e immagini del server da Discord. */
const { cdnOrigin } = require("../../Web/siteCdnMedia") as typeof import("../../Web/siteCdnMedia");
const { BOARD_CATEGORIES, BOARD_LOCALES, BOARD_SOCIAL_KEYS } = require("./boardCatalog") as typeof import("./boardCatalog");

function snowflakeOk(id?) {
  return /^\d{17,22}$/.test(String(id || "").trim());
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

function sanitizeAccent(value?) {
  const v = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
  return "";
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

export = { snowflakeOk, slugify, sanitizeText, sanitizeUrl, sanitizeTags, tagMatchesQuery, sanitizeCategories, sanitizeLocales, SOCIAL_HANDLE_BUILDERS, sanitizeSocials, discordGuildBannerUrl, discordGuildIconUrl, preferAnimatedDiscordMediaUrl, discordGuildInviteHint, sanitizeAccent, sanitizeBoardFeatures };
