/** Automod: analisi del testo e dei link (truffe, NSFW, domini, inviti, emoji, maiuscole). */
const path = require("path") as typeof import("path");
const axios = require("axios") as any;
const IDs: any = require("../../Config/ids") as typeof import("../../Config/ids");
const { loadAutomodScamConfig } = require("../utils/automodScamConfig") as typeof import("../utils/automodScamConfig");
const { readJsonSafe } = require("./automodConfigSanitize") as typeof import("./automodConfigSanitize");

const URL_EXPANSION_CACHE = new Map();
const TEXT_RULES = { regularMessage: { enabled: true, heat: 15, timeoutMs: 15 * 60_000, }, suspiciousAccount: { enabled: true, heat: 7, timeoutMs: 15 * 60_000, }, similarMessage: { enabled: true, heat: 22, ratio: 0.8, timeoutMs: 15 * 60_000, }, emojis: { enabled: true, heat: 9, minCount: 8, timeoutMs: 15 * 60_000, }, newLines: { enabled: true, heat: 5, minCount: 6, timeoutMs: 15 * 60_000, }, zalgo: { enabled: true, heat: 1.5, minCount: 6, timeoutMs: 15 * 60_000, }, characters: { enabled: true, lowercaseHeat: 0.08, uppercaseHeat: 0.12, minChars: 40, timeoutMs: 15 * 60_000, }, inviteLinks: { enabled: true, heat: 100, timeoutMs: 60 * 60_000, }, maliciousLinks: { enabled: true, heat: 100, timeoutMs: 60 * 60_000, }, nsfwLinks: { enabled: true, crawlShorteners: true, heat: 100, timeoutMs: 30 * 60_000, }, wordBlacklist: { enabled: true, useProfaneList: false, useVulgarList: false, useRacistList: true, heat: 100, timeoutMs: 45 * 60_000, }, linkBlacklist: { enabled: true, heat: 100, timeoutMs: 45 * 60_000, domains: ["dsc.gg"], }, crossServerForward: { enabled: true, heat: 100, timeoutMs: 0, }, };
const AUTOMOD_SCAM_CONFIG = loadAutomodScamConfig();
const AUTOMOD_CONFIG_PATH = path.resolve(__dirname, "../config/automodConfig.json",);
const SHORTENER_HOSTS = new Set(["bit.ly", "tinyurl.com", "t.co", "cutt.ly", "is.gd", "rebrand.ly", "tiny.cc", "shorturl.at", "goo.gl", "ow.ly", "buff.ly",]);

const rawAutomodRuntimeConfig = readJsonSafe(AUTOMOD_CONFIG_PATH, {});

function isShortenerHost(host?) {
  const h = String(host || "").toLowerCase();
  if (!h) return false;
  return [...SHORTENER_HOSTS].some((token?) => h === token || h.endsWith(`.${token}`));
}

function nowMs() {
  return Date.now();
}

function trimWindow(list?, windowMs?, at = nowMs()) {
  if (!Array.isArray(list) || !list.length) return;
  const min = at - windowMs;
  let idx = 0;
  while (idx < list.length && Number(list[idx] || 0) < min) idx += 1;
  if (idx > 0) list.splice(0, idx);
}

function trimNormHistory(history?, windowMs?, at = nowMs()) {
  if (!Array.isArray(history) || !history.length) return;
  const min = at - windowMs;
  let idx = 0;
  while (idx < history.length && Number(history[idx]?.t || 0) < min) idx += 1;
  if (idx > 0) history.splice(0, idx);
}

function trimRecentMessageHistory(history?, windowMs?, at = nowMs()) {
  if (!Array.isArray(history) || !history.length) return;
  const min = at - windowMs;
  let idx = 0;
  while (idx < history.length && Number(history[idx]?.t || 0) < min) idx += 1;
  if (idx > 0) history.splice(0, idx);
}

function normalizeContent(content?) {
  return String(content || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " url ")
    .replace(/<a?:\w+:\d+>/g, " emoji ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countDistinctWords(content?) {
  const text = String(content || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (!text) return 0;
  const words = text.split(/[^\p{L}\p{N}]+/gu).map((x?) => String(x || "").trim()).filter((x?) => x.length >= 2);
  return new Set(words).size;
}

function looksLikeLegitConversation(content?) {
  const text = String(content || "").trim();
  if (!text) return false;
  const distinctWords = countDistinctWords(text);
  const hasSentencePunctuation = /[.!?;,]/.test(text);
  const hasSpaces = /\s/.test(text);
  const hasTooManyLinks = (text.match(/https?:\/\/\S+/gi) || []).length >= 2;
  if (!hasSpaces || !hasSentencePunctuation || hasTooManyLinks) return false;
  if (text.length >= 72 && distinctWords >= 8) return true;
  return text.length >= 120 && distinctWords >= 10;
}

function stripQuotedAndCodeText(content?) {
  const text = String(content || "");
  if (!text) return "";
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]+`/g, " ")
    .split("\n")
    .filter((line?) => !String(line || "").trim().startsWith(">"))
    .join("\n")
    .trim();
}

function getAllowedInviteCodes(message?) {
  const codes = new Set();
  const ownInvite = String(IDs?.links?.invite || "").trim();
  const ownCode = ownInvite.match(/discord\.gg\/([a-zA-Z0-9-]{2,})/i)?.[1];
  if (ownCode) codes.add(ownCode.toLowerCase());
  const vanity = String(message.guild?.vanityURLCode || "").trim();
  if (vanity) codes.add(vanity.toLowerCase());
  return codes;
}

function stripTrustedMediaUrlsFromText(content?) {
  const text = String(content || "");
  if (!text) return "";
  const urlMatches = text.match(/(?:https?:\/\/)?(?:www\.)?[^\s/$.?#]+\.[^\s]+/gi) || [];
  if (!urlMatches.length) return text;

  let out = text;
  for (const rawUrl of urlMatches) {
    const normalized = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    let parsed = null;
    try {
      parsed = new URL(normalized);
    } catch {
      parsed = null;
    }
    if (!parsed || !isAutomodMediaEmbedUrl(parsed)) continue;
    out = out.replace(rawUrl, " ");
  }
  return out;
}

function buildModerationScanText(message?, moderationContent?) {
  let text = String(moderationContent || "");
  for (const embed of message?.embeds || []) {
    text += ` ${embed.url || ""} ${embed.title || ""} ${embed.description || ""} ${embed.author?.name || ""}`;
    for (const field of embed.fields || []) {
      text += ` ${field.name || ""} ${field.value || ""}`;
    }
  }
  for (const att of message?.attachments?.values?.() || []) {
    text += ` ${att.name || ""}`;
  }
  return text.trim();
}

const SCAM_CRYPTO_PATTERNS = [
  /(discord|steam|epic)[a-z0-9-]*\.(gift|nitro|airdrop|drop|claim|free)\b/,
  /(free|claim).{0,24}(nitro|steam\s*gift|gift(?:card)?|airdrop)\b/,
  /@everyone.{0,40}(nitro|gift|claim|airdrop)/,
  /(verify|login).{0,30}(discord|steam|epic).{0,30}(gift|nitro|reward|airdrop)/,
  /\b(crypto\s+casino|casino\s+crypto)\b/,
  /\b(mr\s*beast|mrbeast)\b.{0,80}\b(crypto|casino|giveaway|promo|usdt|\$\d|register|withdraw)/,
  /\b(mr\s*beast|mrbeast)\b.{0,40}\b(launch|celebrat)/,
  /\b(vyro\s+project|linked to our)\b/i,
  /\b(riftroll|betchoco|nozawin|serowin)\b/i,
  /\b(activate\s+code|special\s+promocode|promocode)\b/i,
    /\bcongratulations\b.{0,40}\b(reward|bonus|withdraw|crypto|casino|usdt|gift|nitro)\b/i,
  /\b(your reward has been|reward has been successfully)\b/i,
  /* scamGiveawayFp1: require real currency marker — "giveaway 50 euro" in chat is normal */
  /\b(give(?:away|ing)\s+(?:away\s+)?(?:\$|€|£)\s*\d[\d,.]*)\b/,
  /\b(give(?:away|ing)\s+(?:away\s+)?\d[\d,.]*\s*(?:\$|€|£)(?!\w))/,
  /\b(give(?:away|ing)\s+(?:away\s+)?(?:usd|usdt)\s*\d[\d,.]*)\b/,
  /\b(promo\s+code|special\s+promo)\b/,
  /\b(withdraw(?:al)?\s+success(?:ful)?)\b/,
  /\b(usdt|btc|eth)\b.{0,40}\b(withdraw|bonus|giveaway|promo|register)\b/,
  /\b(register|sign\s*up).{0,40}\b(withdraw|bonus|instant)\b/,
  /\bcelebrat(?:e|ing)\b.{0,40}\b(launch|crypto|casino)\b/,
  /\blost\s+your\s+crypto\s+to\s+a\s+scam\b/i,
  /\bkate\s+expert\s+services\b/i,
  /\bkateexpertsservices\b/i,
  /\bno\s+upfront\s+payment\b/i,
  /\bcrypto\s+asset\s+tracing\b/i,
  /\brecovery\s+assessment\b/i,
  /\b(funds?\s+(?:have\s+been\s+)?successfully\s+recovered)\b/i,
  /\b7884\s*893\s*099\b/,
];

const SCAM_IMAGE_SOFT_BAIT_PATTERNS = [
  /^omg\b/i,
  /\bwow\b/i,
  /\u{1F633}/u,
  /\b(guarda questo|look at this|check this)\b/i,
];

const SCAM_IMAGE_STRONG_BAIT_PATTERNS = [
  /\b(free money|guadagn)\b/i,
  /[\u{1F4B0}\u{1F911}\u{1F4B5}]/u,
  /\b(mrbeast|mr\s*beast)\b/i,
  /\b(bonus|promocode|promo\s*code|activate\s+code)\b/i,
  /\b(withdraw(?:al)?|casino|crypto)\b/i,
  /\b(clicca qui|claim|redeem)\b/i,
  /\b(soldi facili|soldi gratis|guadagna)\b/i,
  /\$\d{2,5}\b/,
  /\b(riftroll|betchoco|nozawin|serowin|peagax|dopxbit)\b/i,
];

function detectScam(content?) {
  const text = stripTrustedMediaUrlsFromText(content).toLowerCase();
  if (!text) return false;
  if (SCAM_CRYPTO_PATTERNS.some((re?) => re.test(text))) return true;
  const domains = AUTOMOD_SCAM_CONFIG.domains || [];
  return domains.some((domain?) => domain && text.includes(String(domain).toLowerCase()));
}

function isYoungScamAccount(options: Record<string, any> = {}) {
  const youngDays = Number(AUTOMOD_SCAM_CONFIG.youngAccountMaxDays || 14);
  const accountAgeMs = Number(options.accountAgeMs || 0);
  const youngMs = youngDays * 24 * 60 * 60_000;
  if (options.youngAccount) return true;
  return accountAgeMs > 0 && accountAgeMs < youngMs;
}

function detectScamImageBait(message?, moderationContent?, options: Record<string, any> = {}) {
  const attachmentList = [...(message?.attachments?.values?.() || [])];
  const imageCount = attachmentList.filter((att?) => isImageAttachment(att)).length;
  if (imageCount < 1) return false;
  const text = String(moderationContent || "").trim();
  const maxLen = Number(AUTOMOD_SCAM_CONFIG.imageBaitMaxTextLength || 48);
  if (!text || text.length > maxLen) return false;
    if (detectScam(text)) return true;

  const hasStrong = SCAM_IMAGE_STRONG_BAIT_PATTERNS.some((re?) => re.test(text));
  const hasSoft = SCAM_IMAGE_SOFT_BAIT_PATTERNS.some((re?) => re.test(text));
  if (!hasStrong && !hasSoft) return false;

  const young = isYoungScamAccount(options);
  const suspicious = Boolean(options.suspicious);

    if (!hasStrong) {
    return young && suspicious && text.length <= 16;
  }

      if (suspicious) return true;
  if (young && text.length <= 28) return true;
  const strongHits = SCAM_IMAGE_STRONG_BAIT_PATTERNS.filter((re?) => re.test(text)).length;
  return strongHits >= 2 && text.length <= 28;
}

function hostnameHasNoEmptyDnsLabels(hostname?) {
  const labels = String(hostname || "").split(".");
  if (labels.length < 2) return false;
  return !labels.some((label?) => !label || label.length > 63);
}

function isAutomodBareDomainSentenceFalsePositive(raw?) {
  const match = String(raw || "").trim().replace(/^[*_~|`]+|[*_~|`]+$/g, "");
  if (!match) return false;
  if (/^https?:\/\//i.test(match) || /^www\./i.test(match)) return false;
  return /[a-zà-öø-ÿ]\.[A-ZÀ-ÖØ-Þ]/.test(match);
}

const AUTOMOD_BARE_DOMAIN_TRUSTED_TLDS = new Set([
  "com", "org", "net", "edu", "gov", "mil", "int", "it", "io", "me", "tv", "co", "uk", "de", "fr", "es", "eu",
  "app", "dev", "xyz", "info", "biz", "gg", "ly", "to", "cc", "ws", "fm", "ru", "br", "jp", "cn", "au", "ca",
  "nl", "pl", "pt", "ch", "at", "be", "se", "no", "dk", "fi", "ie", "us", "online", "shop", "store", "tech",
  "cloud", "live", "ai", "pro", "link", "click", "site", "vip",
]);

function isAutomodUntrustedBareDomain(raw?, url?) {
  const match = String(raw || "").trim().replace(/^[*_~|`]+|[*_~|`]+$/g, "");
  if (!match || /^https?:\/\//i.test(match) || /^www\./i.test(match)) return false;
  const labels = String(url?.hostname || "").toLowerCase().split(".").filter(Boolean);
  if (labels.length < 2) return true;
  const tld = labels[labels.length - 1];
  return !AUTOMOD_BARE_DOMAIN_TRUSTED_TLDS.has(tld);
}

function extractUrls(content?) {
  const text = String(content || "");
  const matches =
    text.match(/(?:https?:\/\/)?(?:www\.)?[^\s/$.?#]+\.[^\s]+/gi) || [];
  return matches
    .filter((raw?) => !isAutomodBareDomainSentenceFalsePositive(raw))
    .map((raw?) => {
      const value = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      try {
        return { url: new URL(value), raw };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter((entry?) => hostnameHasNoEmptyDnsLabels(entry.url.hostname))
    .filter((entry?) => !isAutomodUntrustedBareDomain(entry.raw, entry.url))
    .map((entry?) => entry.url);
}

function isAutomodMediaEmbedUrl(url?) {
  if (!url) return false;
  const host = String(url.hostname || "").toLowerCase();
  const path = String(url.pathname || "").toLowerCase();
  if (/\.discordapp\.(com|net)$/i.test(host)) return true;
  if (/(?:^|\.)tenor\.(com|co)$/i.test(host)) return true;
  if (host === "tenor.googleapis.com" || host.endsWith(".tenor.googleapis.com")) return true;
  if (/(?:^|\.)giphy\.com$/i.test(host)) return true;
  if (/(?:^|\.)gfycat\.com$/i.test(host)) return true;
    if (/(?:^|\.)klipy\.com$/i.test(host)) return true;
  if (/\.(gif|webm|mp4|png|jpe?g|jpeg|webp|avif)(?:\?|#|$)/i.test(path)) return true;
  return false;
}

function isAutomodNumericDecimalFalsePositiveUrl(url?) {
  if (!url) return false;
  const host = String(url.hostname || "").toLowerCase().trim();
  if (!host) return false;
  const path = String(url.pathname || "");
  const search = String(url.search || "");
  if (path !== "/" && path !== "") return false;
  if (search) return false;
  const labels = host.split(".").filter(Boolean);
  if (!labels.length) return false;
  if (labels.every((lab?) => /^\d+$/.test(lab))) return true;
  if (labels.length === 2 && /^\d+$/.test(labels[0])) {
    const tail = labels[1];
    if (
      /^\d+(min|mins|minuti|sec|secs|secondi|ore|h|ms|rpm|kg|serie|rep|reps)s?$/i.test(tail)
    ) {
      return true;
    }
  }
  return false;
}

function filterUrlsForAttachmentLinkRule(urls?) {
  if (!Array.isArray(urls) || !urls.length) return [];
  return urls.filter(
    (u?) => !isAutomodMediaEmbedUrl(u) && !isAutomodNumericDecimalFalsePositiveUrl(u),
  );
}

function toAbsoluteUrl(location?, base?) {
  try {
    return new URL(String(location || ""), base).toString();
  } catch {
    return null;
  }
}

async function expandShortUrl(url?, config?) {
  const key = String(url || "").trim();
  if (!key) return null;
  const cached = URL_EXPANSION_CACHE.get(key);
  if (cached && cached.expiresAt > nowMs()) return cached.value;

  const timeoutMs = Math.max(400, Number(config?.timeoutMs || 2200));
  const maxHops = Math.max(1, Number(config?.maxHops || 3));
  let current = key;
  let finalHost = "";

  for (let i = 0; i < maxHops; i += 1) {
    try {
      const response = await axios.get(current, { maxRedirects: 0, timeout: timeoutMs, validateStatus: (s?) => s >= 200 && s < 400, headers: { "User-Agent": "Mozilla/5.0 (AutoMod URL Guard)", }, });
      const nextLocation = response?.headers?.location || response?.headers?.Location || null;
      const parsed = new URL(current);
      finalHost = String(parsed.hostname || "").toLowerCase();
      if (!nextLocation) break;
      const next = toAbsoluteUrl(nextLocation, current);
      if (!next) break;
      current = next;
    } catch {
      break;
    }
  }

  URL_EXPANSION_CACHE.set(key, {
    value: finalHost || null,
    expiresAt: nowMs() + 10 * 60_000,
  });
  return finalHost || null;
}

function isImageAttachment(att?) {
  if (!att) return false;
  const contentType = String(att.contentType || "").toLowerCase();
  if (contentType.startsWith("image/")) return true;
  const name = String(att.name || att.filename || "").toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|tiff?|avif|heic|heif|svg)$/.test(name);
}

function levenshteinDistance(a?, b?) {
  const s = String(a || "");
  const t = String(b || "");
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  const cols = t.length + 1;
  const prev = new Array(cols);
  const curr = new Array(cols);
  for (let j = 0; j < cols; j += 1) prev[j] = j;
  for (let i = 1; i <= s.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= t.length; j += 1) {
      const cost = s.charCodeAt(i - 1) === t.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j < cols; j += 1) prev[j] = curr[j];
  }
  return prev[t.length];
}

function similarityRatio(a?, b?) {
  const s = String(a || "");
  const t = String(b || "");
  const maxLen = Math.max(s.length, t.length);
  if (!maxLen) return 1;
  const distance = levenshteinDistance(s, t);
  return 1 - distance / maxLen;
}

function countEmojiApprox(content?) {
  const text = String(content || "");
  const custom = (text.match(/<a?:\w+:\d+>/g) || []).length;
  const unicode = (text.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu) || []).length;
  return custom + unicode;
}

function countCaseCharacters(content?) {
  const text = String(content || "");
  const lower = (text.match(/\p{Ll}/gu) || []).length;
  const upper = (text.match(/\p{Lu}/gu) || []).length;
  return { lower, upper, total: lower + upper };
}

function stripUrlsForCharacterRule(content?) {
  let s = String(content || "").replace(/https?:\/\/\S+/gi, " ");
  s = s.replace(/(?:https?:)?\/\/cdn\.discordapp\.(?:com|net)\/\S+/gi, " ");
  s = s.replace(/\bcdn\.discordapp\.(?:com|net)\/attachments\/\S+/gi, " ");
  s = s.replace(/\b(?:cdn\.discordapp\.(?:com|net)|media\.discordapp\.(?:com|net))\S+/gi, " ");
  s = s.replace(/<a?:\w+:\d+>/g, " ");
  return s;
}

export = { URL_EXPANSION_CACHE, TEXT_RULES, AUTOMOD_SCAM_CONFIG, AUTOMOD_CONFIG_PATH, rawAutomodRuntimeConfig, isShortenerHost, nowMs, trimWindow, trimNormHistory, trimRecentMessageHistory, normalizeContent, looksLikeLegitConversation, stripQuotedAndCodeText, getAllowedInviteCodes, buildModerationScanText, detectScam, detectScamImageBait, extractUrls, isAutomodMediaEmbedUrl, filterUrlsForAttachmentLinkRule, expandShortUrl, isImageAttachment, similarityRatio, countEmojiApprox, countCaseCharacters, stripUrlsForCharacterRule };
