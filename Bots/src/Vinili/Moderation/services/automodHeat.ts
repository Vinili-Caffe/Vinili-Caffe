/** Automod: heat, profilo canale, link NSFW/blacklist, esenzioni messaggio. */
const { isSecurityProfileImmune, hasAdminsProfileCapability, hasModeratorsProfileCapability } = require("../../Security/services/securityProfilesService") as typeof import("../../Security/services/securityProfilesService");
const { CORE_EXEMPT_USER_IDS } = require("./joinGateExemptUtils") as typeof import("./joinGateExemptUtils");
const { DEFAULT_AUTOMOD_RUNTIME } = require("./automodConfigSanitize") as typeof import("./automodConfigSanitize");
const { TEXT_RULES, nowMs, isShortenerHost, extractUrls, isAutomodMediaEmbedUrl, expandShortUrl } = require("./automodText") as typeof import("./automodText");
const { EXEMPT_CHANNEL_IDS, isUnderExemptCategory, isStaffZoneExemptChannel, resolveProfileKey } = require("./automodExempt") as typeof import("./automodExempt");
const { isAutomodExemptChannel } = require("../utils/automodChannelExemptions") as typeof import("../utils/automodChannelExemptions");
const { bindAutomodDecisionDeps } = require("./automodDecisions") as typeof import("./automodDecisions");
const {
  INSTANT_LINK_KEYS,
  getAutomodRuntimeConfig,
  getMaxHeat,
  getDecayPerSec,
  getWarnThreshold,
  getDeleteThreshold,
  getTimeoutThreshold,
} = require("./automodRuntime") as typeof import("./automodRuntime");

function getProfileConfig(message?) {
  const key = resolveProfileKey(message);
  const defaults = DEFAULT_AUTOMOD_RUNTIME.profiles.default;
  const configured = getAutomodRuntimeConfig()?.profiles?.[key] || getAutomodRuntimeConfig()?.profiles?.default || {};
  return { key, ...defaults, ...configured };
}

function percentToHeat(percent?) {
  return (Number(percent) / 100) * getMaxHeat();
}

function applyHeatFactor(key?, heat?) {
  const factors = getAutomodRuntimeConfig()?.heatFactors || {};
  const base = Number(heat || 0);
  const factor = Number(factors?.[key]);
  const safeFactor = Number.isFinite(factor) ? factor : 1;
  return Number(Math.max(0, base * safeFactor).toFixed(2));
}

function getHeatCaps(profile = null) {
  const c = getAutomodRuntimeConfig()?.heatCaps || {};
  const d = DEFAULT_AUTOMOD_RUNTIME.heatCaps;
  const profileCap = Number(profile?.attachmentClusterMax);
  return {
    maxPerMessage: Number.isFinite(Number(c.maxPerMessage))
      ? Number(c.maxPerMessage)
      : d.maxPerMessage,
    charactersMax: Number.isFinite(Number(c.charactersMax))
      ? Number(c.charactersMax)
      : d.charactersMax,
    textClusterMax: Number.isFinite(Number(c.textClusterMax))
      ? Number(c.textClusterMax)
      : d.textClusterMax,
    attachmentClusterMax: Number.isFinite(profileCap)
      ? profileCap
      : Number.isFinite(Number(c.attachmentClusterMax))
        ? Number(c.attachmentClusterMax)
        : d.attachmentClusterMax,
    mentionClusterMax: Number.isFinite(Number(c.mentionClusterMax))
      ? Number(c.mentionClusterMax)
      : d.mentionClusterMax,
  };
}

function normalizeViolationsForHeat(violations = [], options: Record<string, any> = {}) {
  const caps = getHeatCaps(options?.profile || null);
  const legitConversation = Boolean(options?.legitConversation);
  const mergedByKey = new Map();
  for (const entry of Array.isArray(violations) ? violations : []) {
    const key = String(entry?.key || "").trim();
    if (!key) continue;
    const prev = mergedByKey.get(key);
    const heat = Math.max(0, Number(entry?.heat || 0));
    if (!prev || heat > Number(prev.heat || 0)) {
      mergedByKey.set(key, { ...entry, heat });
    }
  }
  const items = Array.from(mergedByKey.values());
  const hasInstant = items.some((v?) => INSTANT_LINK_KEYS.has(String(v?.key || "")));
  const textClusterKeys = new Set(["regular_message", "similar_message", "emoji_spam", "new_lines", "zalgo",]);
  const attachmentKeys = new Set(["attachment_embed", "attachment_image", "attachment_file", "attachment_link", "attachment_sticker",]);
  const mentionKeys = new Set(["mention_user", "mention_role", "mention_everyone", "mention_hour_cap", "mentions_lockdown",]);

  let textClusterHeat = 0;
  let attachmentClusterHeat = 0;
  let mentionClusterHeat = 0;
  let totalHeat = 0;

  for (const v of items) {
    const key = String(v?.key || "");
    let heat = Math.max(0, Number(v?.heat || 0));
    if (hasInstant && (textClusterKeys.has(key) || key === "characters")) {
      heat = Math.min(heat, 8);
    }
    if (legitConversation && (key === "regular_message" || key === "similar_message")) {
      heat = heat * 0.65;
    }
    if (key === "characters") {
      heat = Math.min(heat, caps.charactersMax);
    } else if (textClusterKeys.has(key)) {
      const room = Math.max(0, caps.textClusterMax - textClusterHeat);
      heat = Math.min(heat, room);
      textClusterHeat += heat;
    } else if (attachmentKeys.has(key)) {
      const room = Math.max(0, caps.attachmentClusterMax - attachmentClusterHeat);
      heat = Math.min(heat, room);
      attachmentClusterHeat += heat;
    } else if (mentionKeys.has(key)) {
      const room = Math.max(0, caps.mentionClusterMax - mentionClusterHeat);
      heat = Math.min(heat, room);
      mentionClusterHeat += heat;
    }
    const globalRoom = Math.max(0, caps.maxPerMessage - totalHeat);
    heat = Math.min(heat, globalRoom);
    v.heat = Number(Math.max(0, heat).toFixed(2));
    totalHeat += v.heat;
  }
  return items.filter((v?) => Number(v?.heat || 0) > 0);
}

function getThresholdsForProfile(profile?) {
  const fromProfile = profile?.thresholds || {};
  return {
    warn: Number.isFinite(Number(fromProfile.warn))
      ? Number(fromProfile.warn)
      : getWarnThreshold(),
    delete: Number.isFinite(Number(fromProfile.delete))
      ? Number(fromProfile.delete)
      : getDeleteThreshold(),
    timeout: Number.isFinite(Number(fromProfile.timeout))
      ? Number(fromProfile.timeout)
      : getTimeoutThreshold(),
  };
}

bindAutomodDecisionDeps({ getThresholdsForProfile });

function decayHeat(state?, at = nowMs()) {
  const elapsedSec = Math.max(0, (at - state.lastAt) / 1000);
  state.heat = Math.max(0, state.heat - elapsedSec * getDecayPerSec());
  state.lastAt = at;
}

function addHeat(state?, amount?) {
  state.heat = Math.min(getMaxHeat(), state.heat + amount);
}

async function isNsfwUrl(content?, preExtractedUrls = null) {
  if (!TEXT_RULES.nsfwLinks.enabled) return false;
  const nsfwHostTokens = [
    "porn",
    "xvideos",
    "xnxx",
    "xhamster",
    "hentai",
    "nsfw",
    "rule34",
    "redtube",
    "youporn",
    "onlyfans",
    "pornhub",
    "eporner",
    "brazzers",
  ];
  const nsfwPathTokens = [
    "xvideos",
    "xnxx",
    "xhamster",
    "hentai",
    "rule34",
    "redtube",
    "youporn",
    "onlyfans",
    "pornhub",
    "eporner",
    "brazzers",
  ];
  const shortenerConfig = getAutomodRuntimeConfig()?.shorteners || {};
  const urls = Array.isArray(preExtractedUrls) ? preExtractedUrls : extractUrls(content);
  for (const url of urls) {
    if (isAutomodMediaEmbedUrl(url)) continue;
    let host = String(url.hostname || "").toLowerCase();
    const path = String(url.pathname || "").toLowerCase();
    if (!host) continue;
    if (isShortenerHost(host)) {
      if (!TEXT_RULES.nsfwLinks.crawlShorteners || !shortenerConfig.crawl) {
        continue;
      }
      const expandedHost = await expandShortUrl(url.toString(), shortenerConfig);
      if (expandedHost) host = expandedHost;
    }
    if (nsfwHostTokens.some((t?) => host.includes(t))) return true;
    if (nsfwPathTokens.some((t?) => path.includes(t))) return true;
  }
  return false;
}

async function hasBlacklistedDomain(content?, preExtractedUrls = null) {
  if (!TEXT_RULES.linkBlacklist.enabled) return false;
  const urls = Array.isArray(preExtractedUrls) ? preExtractedUrls : extractUrls(content);
  if (!urls.length) return false;
  const blockedDomains = (TEXT_RULES.linkBlacklist.domains || []).map((x?) => String(x || "").trim().toLowerCase()).filter(Boolean);
  if (!blockedDomains.length) return false;
  const shortenerConfig = getAutomodRuntimeConfig()?.shorteners || {};
  for (const url of urls) {
    let host = String(url.hostname || "").toLowerCase();
    if (isShortenerHost(host) && shortenerConfig.crawl) {
      const expandedHost = await expandShortUrl(url.toString(), shortenerConfig);
      if (expandedHost) host = expandedHost;
    }
    if (blockedDomains.some((d?) => host === d || host.endsWith(`.${d}`))) {
      return true;
    }
  }
  return false;
}

function isExempt(message?) {
  if (!message.guild) return true;
  const guildId = String(message.guild?.id || "");
  const userId = String(message.author?.id || "");
  if (userId && CORE_EXEMPT_USER_IDS.has(userId)) return true;
  if (userId && String(message.guild.ownerId || "") === userId) return true;
  if (guildId && userId && isSecurityProfileImmune(guildId, userId)) return true;
  if (EXEMPT_CHANNEL_IDS.has(String(message.channelId))) return true;
  if (isStaffZoneExemptChannel(message.channel)) return true;
  if (isAutomodExemptChannel(message.channel, message.guild, message.client)) return true;
  if (isUnderExemptCategory(message.channel)) return true;
  const profile = getProfileConfig(message);
  if (profile?.exempt) return true;
  if (!message.member) return false;
  if (
    hasAdminsProfileCapability(message.member, "fullImmunity") ||
    hasAdminsProfileCapability(message.member, "automodImmunity") ||
    hasAdminsProfileCapability(message.member, "profanityWhitelist") ||
    hasModeratorsProfileCapability(message.member, "automodImmunity") ||
    hasModeratorsProfileCapability(message.member, "profanityWhitelist")
  ) {
    return true;
  }
  return false;
}

export = {
  getProfileConfig,
  percentToHeat,
  applyHeatFactor,
  normalizeViolationsForHeat,
  getThresholdsForProfile,
  decayHeat,
  addHeat,
  isNsfwUrl,
  hasBlacklistedDomain,
  isExempt,
};
