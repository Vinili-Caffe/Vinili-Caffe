const { EmbedBuilder, PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const IDs: any = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { isSecurityProfileImmune, hasAdminsProfileCapability, hasModeratorsProfileCapability, getSecurityStaticsSnapshot, isExtraOwner, } = require("./securityProfilesService") as typeof import("./securityProfilesService");
const { isJoinGateSuspiciousAccount, } = require("./joinGateSuspiciousService") as typeof import("./joinGateSuspiciousService");
const { CORE_EXEMPT_USER_IDS } = require("./joinGateExemptUtils") as typeof import("./joinGateExemptUtils");
const { ActivityUserProfile, ACTIVITY_MAIN_GUILD_ID } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { automodBadUser } = require("../../Utils/Community/activityUserProfilePaths") as typeof import("../../Utils/Community/activityUserProfilePaths");
const { pickPrimaryAutomodRegolaBucket, getAutomodRegolaSanction, formatRegolaDotFromBucket, buildAutomodRegolaSummaryLine, violationKeyLabelIt } = require("../../Utils/Moderation/modRegolamentoConstants") as typeof import("../../Utils/Moderation/modRegolamentoConstants");
const { isMinigameFloodExemptChannel } = require("../Minigames/minigameService") as typeof import("../Minigames/minigameService");
const { detectGrabbedScamImage } = require("../../Utils/Moderation/grabbedScamImageMatcher") as typeof import("../../Utils/Moderation/grabbedScamImageMatcher");
const { getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { memberDisplayName } = require("../../Utils/Discord/guildDiscordIdentity") as typeof import("../../Utils/Discord/guildDiscordIdentity");
const { DEFAULT_AUTOMOD_RUNTIME, writeJsonSafe, clampNumber, sanitizeAutoModRuntimeConfig, setByPath, validateAutoModRuntimeConfig } = require("./automodConfigSanitize") as typeof import("./automodConfigSanitize");
const { URL_EXPANSION_CACHE, TEXT_RULES, AUTOMOD_SCAM_CONFIG, AUTOMOD_CONFIG_PATH, rawAutomodRuntimeConfig, isShortenerHost, nowMs, trimWindow, trimNormHistory, trimRecentMessageHistory, normalizeContent, looksLikeLegitConversation, stripQuotedAndCodeText, getAllowedInviteCodes, buildModerationScanText, detectScam, detectScamImageBait, extractUrls, isAutomodMediaEmbedUrl, filterUrlsForAttachmentLinkRule, expandShortUrl, isImageAttachment, similarityRatio, countEmojiApprox, countCaseCharacters, stripUrlsForCharacterRule } = require("./automodText") as typeof import("./automodText");
const { USER_STATE, BAD_USER_CACHE, EXEMPT_CHANNEL_IDS, isUnderExemptCategory, isWhitelistedByCategory, resolveProfileKey, isDbReady, getCachedBadUser, setCachedBadUser, isStaffZoneExemptChannel, isVerifiedBotMessage, isCrossServerForwardedMessage, isVerifiedBotUserId, isAutoModRoleExemptMember, isLikelyCommandMessage } = require("./automodExempt") as typeof import("./automodExempt");
const { AUTO_TIMEOUT_PROFILE, DISCORD_TIMEOUT_MAX_MS, getAutoTimeoutProfileKey, getRegolaTimeoutStrikeCount, incrementRegolaTimeoutStrike, pickSortedViolations, firstViolationLabel } = require("./automodBadUser") as typeof import("./automodBadUser");
const { ACTION_CHANNEL_LOG_COOLDOWN, NATIVE_STAFF_PING_COOLDOWN, GUILD_PANIC_STATE, ACTION_CHANNEL_LOG_COOLDOWN_MS, NATIVE_STAFF_PING_COOLDOWN_MS, PANIC_MODE, getPanicState, resolveLogChannel, pingStaffAutomodAlert, scheduleAutomodSanzioniStickyReposition, truncateText, escapeDiscordTripleBackticks, buildAutomodAttachmentLinkEvidenceLine, automodEmbedColor, automodActionLabelIt, formatAutomodViolationTechnical, buildAutomodRegolaFieldValue, formatDurationShort, registerAutoModCase, sendAutomodActionInChannel, sendPanicModeLog } = require("./automodEmbeds") as typeof import("./automodEmbeds");
const { ACTION_COOLDOWN, ACTION_COOLDOWN_MS, MENTION_RULES, ATTACHMENT_RULES, recordAutomodMetric, isAutomodPublicNoticeCooldownClear, touchAutomodPublicNoticeCooldown, deleteRelatedViolationMessages, resolveInstantTimeoutOverrideMs } = require("./automodActions") as typeof import("./automodActions");
const { AUTOMOD_IMAGE_ONLY_HEAT_MULTIPLIER, isAutomodMainGuild, SUSPICIOUS_ACCOUNT_STRONG_KEYS, SPAM_WHITELIST_CATEGORY_IDS, INVITE_WHITELIST_CHANNEL_IDS, MENTION_WHITELIST_CHANNEL_IDS, EVERYONE_WHITELIST_CHANNEL_IDS, isWhitelistedByChannel, applyProfileHeat, resolveAttachmentHeatScale, resolveImageOnlyMaxCount, isPanicModeActive, detectInvite, findBlacklistedWordMatch, countZalgo } = require("./automodDetect") as typeof import("./automodDetect");
const { GUILD_INSTANT_EVENTS, PANIC_TRIGGER_KEYS, ensureAutomodHotSnapshotLoaded, markDiscordNativeHandled, wasDiscordNativeHandled, prunePanicAccounts, isRaiderInPanic, registerPanicTrigger, registerGuildInstantSignal, getState, buildMessageFromAutomodExecution, pingStaffForAutomodExecution } = require("./automodNative") as typeof import("./automodNative");

const EXTERNAL_PANIC_SIGNAL_COOLDOWN = new Map();
let DECAY_PER_SEC = 2;
let MAX_HEAT = 100;
let WARN_THRESHOLD = 35;
let DELETE_THRESHOLD = 65;
let TIMEOUT_THRESHOLD = 100;
const RUNTIME_CLEANUP_INTERVAL_MS = 30_000;
let AUTO_TIMEOUTS_ENABLED = true;
let AUTO_TIMEOUT_REGULAR_MS = 1 * 60_000;
let AUTO_TIMEOUT_CAP_MS = 11 * 60_000;
let AUTO_TIMEOUT_CAP_STRIKE = 3;
let AUTO_TIMEOUT_MULTIPLIER_ENABLED = true;
let AUTO_TIMEOUT_MULTIPLIER_PERCENT = 200;
let AUTO_TIMEOUT_PROFILE_RESET_MS = 6 * 60 * 60_000;
let REGULAR_TIMEOUT_MS = AUTO_TIMEOUT_REGULAR_MS;
const EXTERNAL_PANIC_SIGNAL_COOLDOWN_MS = 90_000;
let HEAT_RESET_ON_PUNISHMENT = true;
let MENTION_LOCKDOWN_TRIGGER = 50;
let MENTION_LOCKDOWN_WINDOW_MS = 3_000;
let AUTOMOD_ENABLED = true;
let AUTOMOD_ANTISPAM_ENABLED = true;
let AUTOMOD_MONITOR_UNWHITELISTED_WEBHOOKS = true;
let DISCORD_NATIVE_AUTOMOD_ENABLED = true;
let DISCORD_NATIVE_SKIP_KEYS = new Set([
  "word_blacklist",
  "mention_everyone",
  "mention_hour_cap",
]);
TEXT_RULES.linkBlacklist.domains = [...new Set([...(TEXT_RULES.linkBlacklist.domains || []), ...(AUTOMOD_SCAM_CONFIG.domains || [])])];
let automodRuntimeConfig = sanitizeAutoModRuntimeConfig(rawAutomodRuntimeConfig);
if (
  JSON.stringify(rawAutomodRuntimeConfig || {}) !==
  JSON.stringify(automodRuntimeConfig || {})
) {
  writeJsonSafe(AUTOMOD_CONFIG_PATH, automodRuntimeConfig);
}
let lastRuntimeCleanupAt = 0;

function applyAutomodRuntime() {
  const status = automodRuntimeConfig?.status || {};
  AUTOMOD_ENABLED =
    typeof status.enabled === "boolean"
      ? status.enabled
      : DEFAULT_AUTOMOD_RUNTIME.status.enabled;
  AUTOMOD_ANTISPAM_ENABLED =
    typeof status.antiSpamEnabled === "boolean"
      ? status.antiSpamEnabled
      : DEFAULT_AUTOMOD_RUNTIME.status.antiSpamEnabled;
  AUTOMOD_MONITOR_UNWHITELISTED_WEBHOOKS =
    typeof status.monitorUnwhitelistedWebhooks === "boolean"
      ? status.monitorUnwhitelistedWebhooks
      : DEFAULT_AUTOMOD_RUNTIME.status.monitorUnwhitelistedWebhooks;
  const t = automodRuntimeConfig?.thresholds || {};
  WARN_THRESHOLD = Number.isFinite(Number(t.warn))
    ? Number(t.warn)
    : DEFAULT_AUTOMOD_RUNTIME.thresholds.warn;
  DELETE_THRESHOLD = Number.isFinite(Number(t.delete))
    ? Number(t.delete)
    : DEFAULT_AUTOMOD_RUNTIME.thresholds.delete;
  TIMEOUT_THRESHOLD = Number.isFinite(Number(t.timeout))
    ? Number(t.timeout)
    : DEFAULT_AUTOMOD_RUNTIME.thresholds.timeout;
  const hs = automodRuntimeConfig?.heatSystem || {};
  MAX_HEAT = Number.isFinite(Number(hs.maxHeat))
    ? Number(hs.maxHeat)
    : DEFAULT_AUTOMOD_RUNTIME.heatSystem.maxHeat;
  DECAY_PER_SEC = Number.isFinite(Number(hs.decayPerSec))
    ? Number(hs.decayPerSec)
    : DEFAULT_AUTOMOD_RUNTIME.heatSystem.decayPerSec;
  HEAT_RESET_ON_PUNISHMENT =
    typeof hs.resetOnPunishment === "boolean"
      ? hs.resetOnPunishment
      : DEFAULT_AUTOMOD_RUNTIME.heatSystem.resetOnPunishment;

  const at = automodRuntimeConfig?.autoTimeouts || {};
  AUTO_TIMEOUTS_ENABLED =
    typeof at.enabled === "boolean"
      ? at.enabled
      : DEFAULT_AUTOMOD_RUNTIME.autoTimeouts.enabled;
  AUTO_TIMEOUT_REGULAR_MS = Number.isFinite(Number(at.regularStrikeDurationMs))
    ? Number(at.regularStrikeDurationMs)
    : DEFAULT_AUTOMOD_RUNTIME.autoTimeouts.regularStrikeDurationMs;
  AUTO_TIMEOUT_CAP_MS = Number.isFinite(Number(at.capStrikeDurationMs))
    ? Number(at.capStrikeDurationMs)
    : DEFAULT_AUTOMOD_RUNTIME.autoTimeouts.capStrikeDurationMs;
  AUTO_TIMEOUT_CAP_STRIKE = Number.isFinite(Number(at.capStrike))
    ? Number(at.capStrike)
    : DEFAULT_AUTOMOD_RUNTIME.autoTimeouts.capStrike;
  AUTO_TIMEOUT_MULTIPLIER_ENABLED =
    typeof at.multiplierEnabled === "boolean"
      ? at.multiplierEnabled
      : DEFAULT_AUTOMOD_RUNTIME.autoTimeouts.multiplierEnabled;
  AUTO_TIMEOUT_MULTIPLIER_PERCENT = Number.isFinite(Number(at.multiplierPercent))
    ? Number(at.multiplierPercent)
    : DEFAULT_AUTOMOD_RUNTIME.autoTimeouts.multiplierPercent;
  AUTO_TIMEOUT_PROFILE_RESET_MS = Number.isFinite(Number(at.profileResetMs))
    ? Number(at.profileResetMs)
    : DEFAULT_AUTOMOD_RUNTIME.autoTimeouts.profileResetMs;
  REGULAR_TIMEOUT_MS = AUTO_TIMEOUT_REGULAR_MS;

  const al = automodRuntimeConfig?.autoLockdown || {};
  MENTION_LOCKDOWN_TRIGGER = Number.isFinite(Number(al.mentionTrigger))
    ? Number(al.mentionTrigger)
    : DEFAULT_AUTOMOD_RUNTIME.autoLockdown.mentionTrigger;
  MENTION_LOCKDOWN_WINDOW_MS = Number.isFinite(Number(al.mentionWindowMs))
    ? Number(al.mentionWindowMs)
    : DEFAULT_AUTOMOD_RUNTIME.autoLockdown.mentionWindowMs;
  MENTION_RULES.hourCap = Number.isFinite(Number(al.mentionHourCap))
    ? Number(al.mentionHourCap)
    : DEFAULT_AUTOMOD_RUNTIME.autoLockdown.mentionHourCap;
  MENTION_RULES.userMentions.minUserMentions = Number.isFinite(Number(al.mentionPerMessageLimit))
    ? Math.max(1, Math.floor(Number(al.mentionPerMessageLimit)))
    : MENTION_RULES.userMentions.minUserMentions;

  const hf = automodRuntimeConfig?.heatFilters || {};
  MENTION_RULES.enabled =
    hf.mentions !== undefined
      ? Boolean(hf.mentions)
      : DEFAULT_AUTOMOD_RUNTIME.heatFilters.mentions;
  ATTACHMENT_RULES.enabled =
    hf.attachments !== undefined
      ? Boolean(hf.attachments)
      : DEFAULT_AUTOMOD_RUNTIME.heatFilters.attachments;
  TEXT_RULES.regularMessage.enabled =
    hf.regularMessage !== undefined
      ? Boolean(hf.regularMessage)
      : DEFAULT_AUTOMOD_RUNTIME.heatFilters.regularMessage;
  TEXT_RULES.suspiciousAccount.enabled =
    hf.suspiciousAccount !== undefined
      ? Boolean(hf.suspiciousAccount)
      : DEFAULT_AUTOMOD_RUNTIME.heatFilters.suspiciousAccount;
  TEXT_RULES.similarMessage.enabled =
    hf.similarMessage !== undefined
      ? Boolean(hf.similarMessage)
      : DEFAULT_AUTOMOD_RUNTIME.heatFilters.similarMessage;
  TEXT_RULES.emojis.enabled =
    hf.emojis !== undefined
      ? Boolean(hf.emojis)
      : DEFAULT_AUTOMOD_RUNTIME.heatFilters.emojis;
  TEXT_RULES.newLines.enabled =
    hf.newLines !== undefined
      ? Boolean(hf.newLines)
      : DEFAULT_AUTOMOD_RUNTIME.heatFilters.newLines;
  TEXT_RULES.zalgo.enabled =
    hf.zalgo !== undefined
      ? Boolean(hf.zalgo)
      : DEFAULT_AUTOMOD_RUNTIME.heatFilters.zalgo;
  TEXT_RULES.characters.enabled =
    hf.characters !== undefined
      ? Boolean(hf.characters)
      : DEFAULT_AUTOMOD_RUNTIME.heatFilters.characters;
  TEXT_RULES.inviteLinks.enabled =
    hf.inviteLinks !== undefined
      ? Boolean(hf.inviteLinks)
      : DEFAULT_AUTOMOD_RUNTIME.heatFilters.inviteLinks;
  TEXT_RULES.maliciousLinks.enabled =
    hf.maliciousLinks !== undefined
      ? Boolean(hf.maliciousLinks)
      : DEFAULT_AUTOMOD_RUNTIME.heatFilters.maliciousLinks;
  TEXT_RULES.nsfwLinks.enabled =
    hf.nsfwLinks !== undefined
      ? Boolean(hf.nsfwLinks)
      : DEFAULT_AUTOMOD_RUNTIME.heatFilters.nsfwLinks;
  TEXT_RULES.wordBlacklist.enabled =
    hf.wordBlacklist !== undefined
      ? Boolean(hf.wordBlacklist)
      : DEFAULT_AUTOMOD_RUNTIME.heatFilters.wordBlacklist;
  TEXT_RULES.linkBlacklist.enabled =
    hf.linkBlacklist !== undefined
      ? Boolean(hf.linkBlacklist)
      : DEFAULT_AUTOMOD_RUNTIME.heatFilters.linkBlacklist;
  TEXT_RULES.crossServerForward.enabled =
    hf.crossServerForwards !== undefined
      ? Boolean(hf.crossServerForwards)
      : DEFAULT_AUTOMOD_RUNTIME.heatFilters.crossServerForwards;

  const p = automodRuntimeConfig?.panic || {};
  const d = DEFAULT_AUTOMOD_RUNTIME.panic;
  PANIC_MODE.enabled = typeof p.enabled === "boolean" ? p.enabled : d.enabled;
  PANIC_MODE.considerActivityHistory = typeof p.considerActivityHistory === "boolean" ? p.considerActivityHistory : d.considerActivityHistory;
  PANIC_MODE.useGlobalBadUsersDb = typeof p.useGlobalBadUsersDb === "boolean" ? p.useGlobalBadUsersDb : d.useGlobalBadUsersDb;
  PANIC_MODE.triggerCount = clampNumber(p.triggerCount, 1, 30, d.triggerCount);
  PANIC_MODE.triggerWindowMs = clampNumber(p.triggerWindowMs, 10_000, 24 * 60 * 60_000, d.triggerWindowMs);
  PANIC_MODE.durationMs = clampNumber(p.durationMs, 30_000, 24 * 60 * 60_000, d.durationMs);
  PANIC_MODE.raidWindowMs = clampNumber(p.raidWindowMs, 10_000, 60 * 60_000, d.raidWindowMs);
  PANIC_MODE.raidUserThreshold = clampNumber(p.raidUserThreshold, 1, 100, d.raidUserThreshold);
  PANIC_MODE.raidYoungThreshold = clampNumber(p.raidYoungThreshold, 1, 100, d.raidYoungThreshold);
  PANIC_MODE.lockCommands = typeof p.lockCommands === "boolean" ? p.lockCommands : d.lockCommands;

  const dn = automodRuntimeConfig?.discordNative || {};
  const dnDefault: any = DEFAULT_AUTOMOD_RUNTIME.discordNative || {};
  DISCORD_NATIVE_AUTOMOD_ENABLED =
    typeof dn.enabled === "boolean" ? dn.enabled : dnDefault.enabled !== false;
  const skipList = Array.isArray(dn.skipBotDetectionFor)
    ? dn.skipBotDetectionFor
    : dnDefault.skipBotDetectionFor || [];
  DISCORD_NATIVE_SKIP_KEYS = new Set(
    skipList.map((x?) => String(x || "").trim()).filter(Boolean),
  );
}
applyAutomodRuntime();

function isDiscordNativeAutomodEnabled(guildId?) {
  if (!DISCORD_NATIVE_AUTOMOD_ENABLED) return false;
  return isAutomodMainGuild(guildId);
}

function shouldSkipViolationForDiscordNative(key?) {
  if (!DISCORD_NATIVE_AUTOMOD_ENABLED) return false;
  return DISCORD_NATIVE_SKIP_KEYS.has(String(key || ""));
}

function clearAutoModPanicState(guildId?) {
  const key = String(guildId || "").trim();
  if (key) GUILD_PANIC_STATE.delete(key);
  try {
    const { invalidateSecurityLockCache } = require("./securityOrchestratorService") as typeof import("./securityOrchestratorService");
    invalidateSecurityLockCache(key);
  } catch (_) {}
}

const INSTANT_LINK_KEYS = new Set(["invite", "scam_pattern", "scam_image_bait", "grabbed_scam_image", "nsfw_link", "word_blacklist", "link_blacklist", "mention_everyone", "mention_hour_cap", "mentions_lockdown",]);

const WHITELISTED_WEBHOOK_IDS = new Set((Array.isArray(IDs.webhooks?.whitelist) ? IDs.webhooks.whitelist : []).filter(Boolean).map(String),);
const TRUSTED_WEBHOOK_AUTHOR_IDS = new Set([IDs.bots?.DISBOARD, IDs.bots?.Discadia, IDs.bots?.VoteManager, IDs.bots?.Dyno, IDs.bots?.Wick, ...CORE_EXEMPT_USER_IDS,].filter(Boolean).map(String),);
const { isAutomodExemptChannel } = require("../../Utils/Moderation/automodChannelExemptions") as typeof import("../../Utils/Moderation/automodChannelExemptions");

function getProfileConfig(message?) {
  const key = resolveProfileKey(message);
  const defaults = DEFAULT_AUTOMOD_RUNTIME.profiles.default;
  const configured = automodRuntimeConfig?.profiles?.[key] || automodRuntimeConfig?.profiles?.default || {};
  return { key, ...defaults, ...configured };
}

function percentToHeat(percent?) {
  return (Number(percent) / 100) * MAX_HEAT;
}

function applyHeatFactor(key?, heat?) {
  const factors = automodRuntimeConfig?.heatFactors || {};
  const base = Number(heat || 0);
  const factor = Number(factors?.[key]);
  const safeFactor = Number.isFinite(factor) ? factor : 1;
  return Number(Math.max(0, base * safeFactor).toFixed(2));
}

function getHeatCaps(profile = null) {
  const c = automodRuntimeConfig?.heatCaps || {};
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
      : WARN_THRESHOLD,
    delete: Number.isFinite(Number(fromProfile.delete))
      ? Number(fromProfile.delete)
      : DELETE_THRESHOLD,
    timeout: Number.isFinite(Number(fromProfile.timeout))
      ? Number(fromProfile.timeout)
      : TIMEOUT_THRESHOLD,
  };
}

function getAutoModPanicSnapshot(guildId?, at = nowMs()) {
  const state = getPanicState(guildId);
  const activeUntil = Number(state?.activeUntil || 0);
  return {
    enabled: Boolean(PANIC_MODE.enabled),
    active: Boolean(PANIC_MODE.enabled && activeUntil > at),
    activeUntil,
    remainingMs: Math.max(0, activeUntil - at),
    trackedAccounts: Number(state?.triggerAccounts?.size || 0),
    panicSignalsInWindow: Number(state?.panicSignals?.length || 0),
    lockCommands: Boolean(PANIC_MODE.lockCommands),
  };
}

function triggerAutoModPanicExternal(guildId?, sourceUserId = "external", options: Record<string, any> = {}, at = nowMs()) {
  if (!PANIC_MODE.enabled) return { activated: false, active: false, count: 0 };
  if (!guildId) return { activated: false, active: false, count: 0 };
  const signalKey = `${String(guildId)}:${String(sourceUserId || "external")}`;
  const lastTs = Number(EXTERNAL_PANIC_SIGNAL_COOLDOWN.get(signalKey) || 0);
  if (at - lastTs < EXTERNAL_PANIC_SIGNAL_COOLDOWN_MS) {
    const st = getPanicState(guildId);
    return {
      activated: false,
      active: isPanicModeActive(guildId, at),
      count: Number(st?.panicSignals?.length || 0),
    };
  }
  EXTERNAL_PANIC_SIGNAL_COOLDOWN.set(signalKey, at);
  return registerPanicTrigger(String(guildId), String(sourceUserId || "external"), options, at);
}

function computeNextAutoTimeoutDuration(message?, at = nowMs(), options: Record<string, any> = {}) {
  const dryRun = Boolean(options.dryRun);
  const key = getAutoTimeoutProfileKey(message);
  if (!key || key.startsWith(":")) {
    return { durationMs: AUTO_TIMEOUT_REGULAR_MS, strike: 1, capReached: false };
  }
  const stored = AUTO_TIMEOUT_PROFILE.get(key) || { strikes: 0, currentDurationMs: AUTO_TIMEOUT_REGULAR_MS, lastAt: 0, capReached: false, };
  const existing = dryRun ? { ...stored } : stored;
  if (at - Number(existing.lastAt || 0) > AUTO_TIMEOUT_PROFILE_RESET_MS) {
    existing.strikes = 0;
    existing.currentDurationMs = AUTO_TIMEOUT_REGULAR_MS;
    existing.capReached = false;
  }

  const nextStrike = Number(existing.strikes || 0) + 1;
  let durationMs = AUTO_TIMEOUT_REGULAR_MS;
  if (nextStrike < AUTO_TIMEOUT_CAP_STRIKE) {
    durationMs = AUTO_TIMEOUT_REGULAR_MS;
  } else if (nextStrike === AUTO_TIMEOUT_CAP_STRIKE) {
    durationMs = AUTO_TIMEOUT_CAP_MS;
    existing.capReached = true;
  } else if (AUTO_TIMEOUT_MULTIPLIER_ENABLED) {
    const base = Math.max(AUTO_TIMEOUT_CAP_MS, Number(existing.currentDurationMs || AUTO_TIMEOUT_CAP_MS),);
    durationMs = Math.round(base * (AUTO_TIMEOUT_MULTIPLIER_PERCENT / 100));
    existing.capReached = true;
  } else {
    durationMs = AUTO_TIMEOUT_CAP_MS;
    existing.capReached = true;
  }

  durationMs = Math.max(60_000, Math.min(DISCORD_TIMEOUT_MAX_MS, durationMs));
  existing.strikes = nextStrike;
  existing.currentDurationMs = durationMs;
  existing.lastAt = at;
  if (!dryRun) {
    AUTO_TIMEOUT_PROFILE.set(key, existing);
  }
  return { durationMs, strike: nextStrike, capReached: Boolean(existing.capReached) };
}

function isBadUserProfileStale(profile?, at = nowMs()) {
  const lastActionAt = profile?.lastActionAt ? new Date(profile.lastActionAt).getTime() : 0;
  if (!Number.isFinite(lastActionAt) || lastActionAt <= 0) return false;
  return at - lastActionAt > AUTO_TIMEOUT_PROFILE_RESET_MS;
}

async function getBadUserProfile(userId?, guildId = "") {
  const cached = getCachedBadUser(userId);
  if (cached !== undefined) {
    const joinGateSuspicious = guildId ? await isJoinGateSuspiciousAccount(guildId, userId) : false;
    if (!cached) {
      return joinGateSuspicious
        ? {
          suspicious: true,
          warnPoints: 0,
          activeStrikes: 0,
          activeStrikeReasons: [],
          timeoutActions: 0,
          totalTriggers: 0,
        }
        : null;
    }
    return {
      ...cached,
      suspicious: Boolean(joinGateSuspicious),
    };
  }
  if (!isDbReady()) {
    const joinGateSuspicious = guildId ? await isJoinGateSuspiciousAccount(guildId, userId) : false;
    return joinGateSuspicious
      ? {
        suspicious: true,
        warnPoints: 0,
        activeStrikes: 0,
        activeStrikeReasons: [],
        timeoutActions: 0,
        totalTriggers: 0,
      }
      : null;
  }
  try {
    const doc = await ActivityUserProfile.findOne(
      { guildId: ACTIVITY_MAIN_GUILD_ID, userId: String(userId) },
      {
        _id: 0,
        userId: 1,
        [automodBadUser()]: 1,
      },
    )
      .lean()
      .catch(() => null);
    const amSub = automodBadUser()
      .split(".")
      .reduce((acc?, k?) => acc?.[k], doc);
    const row = amSub ? { userId: doc.userId, ...amSub } : null;
    if (!row) {
      setCachedBadUser(userId, null, 15_000);
      const joinGateSuspicious = guildId ? await isJoinGateSuspiciousAccount(guildId, userId) : false;
      return joinGateSuspicious
        ? {
          suspicious: true,
          warnPoints: 0,
          activeStrikes: 0,
          activeStrikeReasons: [],
          timeoutActions: 0,
          totalTriggers: 0,
        }
        : null;
    }

    const at = nowMs();
    const stale = isBadUserProfileStale(row, at);
    const regolaRaw = row.regolaTimeoutStrikes;
    const hadRegolaStrikes =
      regolaRaw &&
      typeof regolaRaw === "object" &&
      Object.keys(regolaRaw).some((k?) => Number(regolaRaw[k] || 0) > 0);
    const regolaTimeoutStrikes =
      stale || typeof regolaRaw !== "object" || regolaRaw === null ? {} : { ...regolaRaw };
    const normalized = {
      ...row,
      warnPoints: stale ? 0 : Math.max(0, Number(row.warnPoints || 0)),
      activeStrikes: stale ? 0 : Math.max(0, Number(row.activeStrikes || 0)),
      activeStrikeReasons: stale ? [] : (Array.isArray(row.activeStrikeReasons) ? row.activeStrikeReasons : []),
      regolaTimeoutStrikes,
    };

    if (
      stale &&
      (Number(row.warnPoints || 0) > 0 ||
        Number(row.activeStrikes || 0) > 0 ||
        hadRegolaStrikes) &&
      (!guildId || !isExtraOwner(String(guildId), String(userId)))
    ) {
      ActivityUserProfile.updateOne(
        { guildId: ACTIVITY_MAIN_GUILD_ID, userId: String(userId) },
        {
          $set: {
            [automodBadUser("warnPoints")]: 0,
            [automodBadUser("activeStrikes")]: 0,
            [automodBadUser("activeStrikeReasons")]: [],
            [automodBadUser("regolaTimeoutStrikes")]: {},
          },
        },
      ).catch(() => { });
    }

    setCachedBadUser(userId, normalized, 60_000);
    const joinGateSuspicious = guildId ? await isJoinGateSuspiciousAccount(guildId, userId) : false;
    return {
      ...normalized,
      suspicious: Boolean(joinGateSuspicious),
    };
  } catch {
    return null;
  }
}

async function markBadUserTrigger(message?, violations?, heatValue?) {
  if (!isDbReady()) return;
  const userId = String(message.author?.id || "");
  if (!userId) return;
  if (shouldSkipAutomodBadUserDbWrite(message)) return;
  const reasons = [...new Set((violations || []).map((v?) => String(v?.key || "").trim()).filter(Boolean))].slice(0, 10);
  try {
    await ActivityUserProfile.updateOne(
      { guildId: ACTIVITY_MAIN_GUILD_ID, userId },
      {
        $set: {
          [automodBadUser("lastTriggerAt")]: new Date(),
          [automodBadUser("lastGuildId")]: String(message.guildId || ""),
          [automodBadUser("lastHeat")]: Number(heatValue || 0),
          [automodBadUser("reasons")]: reasons,
        },
      },
      { upsert: true, setDefaultsOnInsert: true },
    );
    BAD_USER_CACHE.delete(userId);
  } catch (err) {
    global.logger?.warn?.("[automod] ", err?.message || err);
  }
}

async function markBadUserAction(message?, action?, violations = []) {
  if (!isDbReady()) return;
  const userId = String(message?.author?.id || "");
  if (!userId) return;
  if (shouldSkipAutomodBadUserDbWrite(message)) return;
  const normalizedAction = String(action || "").trim().toLowerCase();
  const inc = { totalTriggers: 1, activeStrikes: 0, warnPoints: 0 };
  if (normalizedAction === "warn") inc.warnPoints = 1;
  if (
    normalizedAction === "timeout" ||
    normalizedAction === "ban" ||
    normalizedAction === "delete" ||
    normalizedAction === "delete_webhook"
  ) {
    inc.activeStrikes = 1;
  }
  const strikeReasons = (Array.isArray(violations) ? violations : []).map((v?) => firstViolationLabel([v])).filter(Boolean).slice(0, 5);
  const update: Record<string, any> = {
    $set: {
      [automodBadUser("lastActionAt")]: new Date(),
      [automodBadUser("lastAction")]: normalizedAction || null,
    },
    $inc: {
      [automodBadUser("totalTriggers")]: inc.totalTriggers,
      [automodBadUser("warnPoints")]: inc.warnPoints,
      [automodBadUser("activeStrikes")]: inc.activeStrikes,
    },
  };
  if (strikeReasons.length) {
    update.$push = {
      [automodBadUser("activeStrikeReasons")]: { $each: strikeReasons, $slice: -40 },
    };
  }
  try {
    await ActivityUserProfile.updateOne(
      { guildId: ACTIVITY_MAIN_GUILD_ID, userId },
      update,
      { upsert: true, setDefaultsOnInsert: true },
    );
    BAD_USER_CACHE.delete(userId);
  } catch (err) {
    global.logger?.warn?.("[automod] ", err?.message || err);
  }
}

async function registerAutoModTimeoutStrike(message?) {
  if (!isDbReady()) return { ok: false, timeoutActions: 0, escalate1h: false };
  const userId = String(message?.author?.id || "");
  if (!userId) return { ok: false, timeoutActions: 0, escalate1h: false };
  if (shouldSkipAutomodBadUserDbWrite(message)) return { ok: false, timeoutActions: 0, escalate1h: false };
  try {
    const updated = await ActivityUserProfile.findOneAndUpdate(
      { guildId: ACTIVITY_MAIN_GUILD_ID, userId },
      {
        $inc: { [automodBadUser("timeoutActions")]: 1 },
        $set: {
          [automodBadUser("lastActionAt")]: new Date(),
          [automodBadUser("lastAction")]: "timeout",
          [automodBadUser("lastGuildId")]: String(message?.guildId || ""),
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
        projection: { _id: 0, [automodBadUser("timeoutActions")]: 1 },
      },
    )
      .lean()
      .catch(() => null);
    BAD_USER_CACHE.delete(userId);
    const timeoutActions = Math.max(
      0,
      Number(updated?.moderation?.automodBadUser?.timeoutActions || 0),
    );
    return {
      ok: true,
      timeoutActions,
      escalate1h: timeoutActions > 0 && timeoutActions % 5 === 0,
    };
  } catch {
    return { ok: false, timeoutActions: 0, escalate1h: false };
  }
}

async function shouldEscalateNextAutoTimeout(message?) {
  if (!isDbReady()) return false;
  const userId = String(message?.author?.id || "");
  if (!userId) return false;
  if (shouldSkipAutomodBadUserDbWrite(message)) return false;
  try {
    const row = await ActivityUserProfile.findOne(
      { guildId: ACTIVITY_MAIN_GUILD_ID, userId },
      { _id: 0, [automodBadUser("timeoutActions")]: 1 },
    )
      .lean()
      .catch(() => null);
    const current = Math.max(
      0,
      Number(row?.moderation?.automodBadUser?.timeoutActions || 0),
    );
    const next = current + 1;
    return next > 0 && next % 5 === 0;
  } catch {
    return false;
  }
}

function cleanupRuntimeMaps(at = nowMs()) {
  const staleActionCutoff = at - ACTION_COOLDOWN_MS * 4;
  for (const [key, ts] of ACTION_COOLDOWN.entries()) {
    if (Number(ts || 0) < staleActionCutoff) ACTION_COOLDOWN.delete(key);
  }

  const staleNoticeCutoff = at - ACTION_CHANNEL_LOG_COOLDOWN_MS * 4;
  for (const [key, ts] of ACTION_CHANNEL_LOG_COOLDOWN.entries()) {
    if (Number(ts || 0) < staleNoticeCutoff) {
      ACTION_CHANNEL_LOG_COOLDOWN.delete(key);
    }
  }

  const staleNativePingCutoff = at - NATIVE_STAFF_PING_COOLDOWN_MS * 4;
  for (const [key, ts] of NATIVE_STAFF_PING_COOLDOWN.entries()) {
    if (Number(ts || 0) < staleNativePingCutoff) NATIVE_STAFF_PING_COOLDOWN.delete(key);
  }

  for (const [key, state] of USER_STATE.entries()) {
    if (!state || typeof state !== "object") {
      USER_STATE.delete(key);
      continue;
    }
    const idleFor = at - Number(state.lastAt || 0);
    const stale = idleFor > 2 * 60 * 60_000 && Number(state.heat || 0) <= 0 && (!Array.isArray(state.msgTimes) || state.msgTimes.length === 0) && (!Array.isArray(state.normHistory) || state.normHistory.length === 0) && (!Array.isArray(state.recentMessageHistory) || state.recentMessageHistory.length === 0) && (!Array.isArray(state.mentionTimes) || state.mentionTimes.length === 0) && (!Array.isArray(state.mentionHourTimes) || state.mentionHourTimes.length === 0) && (!Array.isArray(state.automodHits) || state.automodHits.length === 0);
    if (stale) USER_STATE.delete(key);
  }

  for (const [guildId, events] of GUILD_INSTANT_EVENTS.entries()) {
    const minTs = at - Number(PANIC_MODE.raidWindowMs || 120_000);
    const next = (Array.isArray(events) ? events : []).filter((item?) => Number(item?.ts || 0) >= minTs,);
    if (!next.length) GUILD_INSTANT_EVENTS.delete(guildId);
    else GUILD_INSTANT_EVENTS.set(guildId, next);
  }

  for (const [guildId, state] of GUILD_PANIC_STATE.entries()) {
    if (!state || typeof state !== "object") {
      GUILD_PANIC_STATE.delete(guildId);
      continue;
    }
    prunePanicAccounts(state, at);
    const active = Number(state.activeUntil || 0) > at;
    const noAccounts = !state.triggerAccounts || state.triggerAccounts.size === 0;
    const noSignals = !state.panicSignals || state.panicSignals.length === 0;
    if (!active && noAccounts && noSignals) {
      GUILD_PANIC_STATE.delete(guildId);
    }
  }

  for (const [url, payload] of URL_EXPANSION_CACHE.entries()) {
    if (Number(payload?.expiresAt || 0) <= at) URL_EXPANSION_CACHE.delete(url);
  }

  for (const [key, ts] of EXTERNAL_PANIC_SIGNAL_COOLDOWN.entries()) {
    if (at - Number(ts || 0) > EXTERNAL_PANIC_SIGNAL_COOLDOWN_MS * 2) {
      EXTERNAL_PANIC_SIGNAL_COOLDOWN.delete(key);
    }
  }

  for (const [key, payload] of AUTO_TIMEOUT_PROFILE.entries()) {
    if (at - Number(payload?.lastAt || 0) > AUTO_TIMEOUT_PROFILE_RESET_MS * 2) {
      AUTO_TIMEOUT_PROFILE.delete(key);
    }
  }
}

function decayHeat(state?, at = nowMs()) {
  const elapsedSec = Math.max(0, (at - state.lastAt) / 1000);
  state.heat = Math.max(0, state.heat - elapsedSec * DECAY_PER_SEC);
  state.lastAt = at;
}

function addHeat(state?, amount?) {
  state.heat = Math.min(MAX_HEAT, state.heat + amount);
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
  const shortenerConfig = automodRuntimeConfig?.shorteners || {};
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
  const shortenerConfig = automodRuntimeConfig?.shorteners || {};
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

function shouldSkipAutomodBadUserDbWrite(message?) {
  if (!message) return true;
  if (message.author?.bot || message.system) return true;
  const guildId = String(message.guildId || message.guild?.id || "");
  const userId = String(message.author?.id || "");
  if (!userId) return true;
  if (guildId && isExtraOwner(guildId, userId)) return true;
  if (isExempt(message)) return true;
  return false;
}

async function getAutoModMemberSnapshot(member?) {
  if (!member?.guild || !member?.user) {
    return {
      heat: 0,
      suspicious: false,
      warnPoints: 0,
      activeStrikes: 0,
      strikeReasons: [],
      whitelist: {
        spam: false,
        ping: false,
        advertising: false,
      },
    };
  }

  const guild = member.guild;
  const userId = String(member.id);
  const key = `${String(guild.id)}:${userId}`;
  const state = USER_STATE.get(key);
  const heat = Number(state?.heat || 0);

  const roleExempt = isAutoModRoleExemptMember(guild, member);
  let suspicious = false;
  let warnPoints = 0;
  let activeStrikes = 0;
  let strikeReasons = [];
  try {
    const profile = await getBadUserProfile(userId, guild.id);
    suspicious = Boolean(profile?.suspicious);
    warnPoints = Math.max(0, Number(profile?.warnPoints || 0));
    activeStrikes = Math.max(0, Number(profile?.activeStrikes || 0));
    strikeReasons = Array.isArray(profile?.activeStrikeReasons)
      ? profile.activeStrikeReasons
        .map((x?) => String(x || "").trim())
        .filter(Boolean)
      : [];
      } catch (err) {
        global.logger?.warn?.("[automod] ", err?.message || err);
      }

  return {
    heat,
    suspicious,
    warnPoints,
    activeStrikes,
    strikeReasons,
    whitelist: {
      spam: roleExempt,
      ping: roleExempt,
      advertising: roleExempt,
    },
  };
}

async function detectViolations(message?, state?, profile?) {
  const at = nowMs();
  const msgId = String(message.id || "");
  state.recentMessageHistory = Array.isArray(state.recentMessageHistory) ? state.recentMessageHistory : [];
  state.recentMessageHistory.push({ t: at, id: msgId });
  trimRecentMessageHistory(state.recentMessageHistory, 20_000, at);
  const content = String(message.content || "");
  const moderationContent = stripQuotedAndCodeText(content);
  const moderationScanText = buildModerationScanText(message, moderationContent);
  const normalized = normalizeContent(content);
  const extractedUrls = extractUrls(moderationScanText);
  const violations = [];
  const profileHeat = (value?, factorKey = "regularMessage") => applyProfileHeat(applyHeatFactor(factorKey, value), profile);
  /* ticketHateOnly1: in ticket categories only racist/homophobic slur filters apply */
  if (profile?.hateSpeechOnly === true) {
    const hateMatch = findBlacklistedWordMatch(moderationContent);
    if (hateMatch) {
      violations.push({
        key: "word_blacklist",
        heat: profileHeat(
          percentToHeat(TEXT_RULES.wordBlacklist.heat),
          "wordBlacklist",
        ),
        info:
          hateMatch.term && hateMatch.source
            ? `racist list (${hateMatch.source}: ${hateMatch.term})`
            : "racist list",
      });
    }
    return violations;
  }
  const channelId = String(message.channelId || "");
  const parentChannelId = String(message.channel?.parentId || "");
  const statics = getSecurityStaticsSnapshot(String(message?.guild?.id || ""));
  const dynamicPartneringChannels = Array.isArray(statics?.partneringChannelIds) ? statics.partneringChannelIds.map((id?) => String(id || "").trim()).filter(Boolean) : [];
  const { getPartnershipChannelId } = require("../../Utils/Partner/partnershipConfigResolver") as typeof import("../../Utils/Partner/partnershipConfigResolver");
  const tenantPartnershipChannel = getPartnershipChannelId(message?.guild?.id);
  const tenantPartnerChannels = tenantPartnershipChannel ? [tenantPartnershipChannel] : [];
  const inviteWhitelistSet = new Set([...INVITE_WHITELIST_CHANNEL_IDS, ...dynamicPartneringChannels, ...tenantPartnerChannels,]);
  const mentionWhitelistSet = new Set([...MENTION_WHITELIST_CHANNEL_IDS, ...dynamicPartneringChannels, ...tenantPartnerChannels,]);
  const everyoneWhitelistSet = new Set([...EVERYONE_WHITELIST_CHANNEL_IDS, ...dynamicPartneringChannels, ...tenantPartnerChannels,]);
  const spamWhitelisted = isWhitelistedByCategory(message.channel, SPAM_WHITELIST_CATEGORY_IDS);
  const minigameFloodExempt = await isMinigameFloodExemptChannel(message);
  const antiSpamFloodExempt = spamWhitelisted || minigameFloodExempt;
  const inviteWhitelisted = isWhitelistedByChannel(channelId, parentChannelId, inviteWhitelistSet,);
  const mentionWhitelisted = isWhitelistedByChannel(channelId, parentChannelId, mentionWhitelistSet,);
  const everyoneWhitelisted = isWhitelistedByChannel(channelId, parentChannelId, everyoneWhitelistSet,);
  const mentionsEnabled = profile?.mentionsEnabled !== false;
  const attachmentsEnabled = profile?.attachmentsEnabled !== false;
  const inviteLinksEnabled = profile?.inviteLinksEnabled !== false;
  const autoLockdownEnabled = automodRuntimeConfig?.autoLockdown?.enabled !== false;
  const hasMeaningfulTextPayload = String(moderationContent || "").trim().length >= 8;
  const attachmentListForCharRule = [...(message.attachments?.values?.() || [])];
  const imageAttachmentCountForCharRule = attachmentListForCharRule.filter((att?) => isImageAttachment(att)).length;
  const legitConversation = looksLikeLegitConversation(moderationContent || content);
  if (
    TEXT_RULES.crossServerForward.enabled &&
    isAutomodMainGuild(String(message.guildId || message.guild?.id || "")) &&
    isCrossServerForwardedMessage(message)
  ) {
    violations.push({
      key: "cross_server_forward",
      heat: profileHeat(
        percentToHeat(TEXT_RULES.crossServerForward.heat),
        "crossServerForward",
      ),
      info: String(message.reference?.guildId || "forward"),
    });
    return violations;
  }
  let suspiciousMessageAuthor = false;
  try {
    const badProfile = await getBadUserProfile(message.author?.id, message.guildId);
    suspiciousMessageAuthor = Boolean(badProfile?.suspicious);
  } catch {
    suspiciousMessageAuthor = false;
  }

  if (
    !antiSpamFloodExempt &&
    AUTOMOD_ANTISPAM_ENABLED &&
    TEXT_RULES.regularMessage.enabled
  ) {
    state.msgTimes.push(at);
    trimWindow(state.msgTimes, 8_000, at);
    if (state.msgTimes.length >= 6) {
      const recentForBurst = state.recentMessageHistory
        .slice(-Math.max(6, state.msgTimes.length))
        .map((row?) => String(row?.id || ""))
        .filter(Boolean);
      violations.push({
        key: "regular_message",
        heat: profileHeat(
          percentToHeat(TEXT_RULES.regularMessage.heat),
          "regularMessage",
        ),
        info: `${state.msgTimes.length}/8s`,
        relatedMessageIds: recentForBurst,
      });
    }
  }

  if (
    !antiSpamFloodExempt &&
    AUTOMOD_ANTISPAM_ENABLED &&
    TEXT_RULES.similarMessage.enabled &&
    normalized.length >= 8 &&
    !message.editedTimestamp
  ) {
    state.normHistory.push({ t: at, c: normalized, id: msgId });
    trimNormHistory(state.normHistory, 18_000, at);
    const ratio = TEXT_RULES.similarMessage.ratio;
            const similarThreshold = legitConversation ? 3 : 2;
    let similarCount = 0;
    const similarIds = [];
    for (const x of state.normHistory) {
      if (!x?.c) continue;
      if (msgId && String(x.id || "") === msgId) continue;
      if (similarityRatio(x.c, normalized) >= ratio) {
        similarCount += 1;
        if (x.id) similarIds.push(String(x.id));
        if (similarCount >= similarThreshold) break;
      }
    }
    if (similarCount >= similarThreshold) {
      violations.push({
        key: "similar_message",
        heat: profileHeat(
          percentToHeat(TEXT_RULES.similarMessage.heat),
          "similarMessage",
        ),
        info: `ratio>=${ratio.toFixed(2)} count:${similarCount}`,
        relatedMessageIds: similarIds,
      });
    }
  }

  const rawUserMentionCount = message.mentions?.users?.size || 0;
  const repliedUserId = message.mentions?.repliedUser?.id ? String(message.mentions.repliedUser.id) : null;
  const replyMentionAdjustment = repliedUserId && message.mentions?.users?.has?.(repliedUserId) ? 1 : 0;
  const userMentionCount = Math.max(0, rawUserMentionCount - replyMentionAdjustment,);
  const roleMentionCount = message.mentions?.roles?.size || 0;
  const everyoneMentionCount = message.mentions?.everyone ? 1 : 0;
  const effectiveMentionCount = (mentionWhitelisted ? 0 : userMentionCount + roleMentionCount) + (everyoneWhitelisted ? 0 : everyoneMentionCount);
  if (MENTION_RULES.enabled && mentionsEnabled) {
    if (effectiveMentionCount > 0) {
      const shortCap = Math.max(MENTION_LOCKDOWN_TRIGGER * 2, 100);
      const hourCap = Math.max(MENTION_RULES.hourCap * 2, 100);
      const roomShort = Math.max(0, shortCap - state.mentionTimes.length);
      const roomHour = Math.max(0, hourCap - state.mentionHourTimes.length);
      const toPush = Math.min(effectiveMentionCount, roomShort, roomHour);
      for (let i = 0; i < toPush; i += 1) {
        state.mentionTimes.push(at);
        state.mentionHourTimes.push(at);
      }
      trimWindow(state.mentionTimes, MENTION_LOCKDOWN_WINDOW_MS, at);
      trimWindow(state.mentionHourTimes, 60 * 60_000, at);
    }

    const minUserMentions = Math.max(
      1,
      Math.floor(Number(MENTION_RULES.userMentions?.minUserMentions ?? 5)),
    );
    if (
      !mentionWhitelisted &&
      MENTION_RULES.userMentions.enabled &&
      userMentionCount >= minUserMentions
    ) {
      violations.push({
        key: "mention_user",
        heat: profileHeat(
          userMentionCount * percentToHeat(MENTION_RULES.userMentions.heat),
          "mentions",
        ),
        info: `${userMentionCount} @user`,
      });
    }

    if (
      !mentionWhitelisted &&
      MENTION_RULES.roleMentions.enabled &&
      roleMentionCount > 0
    ) {
      violations.push({
        key: "mention_role",
        heat: profileHeat(
          roleMentionCount * percentToHeat(MENTION_RULES.roleMentions.heat),
          "mentions",
        ),
        info: `${roleMentionCount} @role`,
      });
    }

    if (
      !everyoneWhitelisted &&
      !shouldSkipViolationForDiscordNative("mention_everyone") &&
      MENTION_RULES.everyoneMentions.enabled &&
      everyoneMentionCount > 0
    ) {
      violations.push({
        key: "mention_everyone",
        heat: profileHeat(
          everyoneMentionCount *
          percentToHeat(MENTION_RULES.everyoneMentions.heat),
          "mentions",
        ),
        info: "@everyone/@here",
      });
    }

    if (
      autoLockdownEnabled &&
      !shouldSkipViolationForDiscordNative("mention_hour_cap") &&
      state.mentionHourTimes.length >= MENTION_RULES.hourCap
    ) {
      violations.push({
        key: "mention_hour_cap",
        heat: profileHeat(percentToHeat(100), "mentions"),
        info: `${state.mentionHourTimes.length}/${MENTION_RULES.hourCap} pings/1h`,
      });
    }

    if (autoLockdownEnabled && state.mentionTimes.length >= MENTION_LOCKDOWN_TRIGGER) {
      violations.push({
        key: "mentions_lockdown",
        heat: profileHeat(percentToHeat(100), "mentions"),
        info: `${state.mentionTimes.length}/${Math.floor(MENTION_LOCKDOWN_WINDOW_MS / 1000)}s`,
      });
    }
  }

  const inviteCode = detectInvite(moderationScanText) || detectInvite(moderationContent);
  if (
    inviteCode &&
    !inviteWhitelisted &&
    !shouldSkipViolationForDiscordNative("invite")
  ) {
    const allowedCodes = getAllowedInviteCodes(message);
    if (
      inviteLinksEnabled &&
      TEXT_RULES.inviteLinks.enabled &&
      !allowedCodes.has(inviteCode)
    ) {
      violations.push({
        key: "invite",
        heat: profileHeat(
          percentToHeat(TEXT_RULES.inviteLinks.heat),
          "inviteLinks",
        ),
        info: `discord.gg/${inviteCode}`,
      });
    }
  }

  if (TEXT_RULES.maliciousLinks.enabled && detectScam(moderationScanText)) {
    violations.push({
      key: "scam_pattern",
      heat: profileHeat(
        percentToHeat(TEXT_RULES.maliciousLinks.heat),
        "maliciousLinks",
      ),
      info: "pattern scam/malicious link",
    });
  }

  const accountCreatedAt = Number(new Date(message?.author?.createdAt || 0).getTime() || 0);
  const accountAgeMs = accountCreatedAt > 0 ? at - accountCreatedAt : 0;
  const youngAccountMaxMs = Number(AUTOMOD_SCAM_CONFIG.youngAccountMaxDays || 14) * 24 * 60 * 60_000;
  const youngAccount = accountAgeMs > 0 && accountAgeMs < youngAccountMaxMs;
  if (
    TEXT_RULES.maliciousLinks.enabled &&
    detectScamImageBait(message, moderationContent, {
      suspicious: suspiciousMessageAuthor,
      youngAccount,
      accountAgeMs,
    })
  ) {
    violations.push({
      key: "scam_image_bait",
      heat: profileHeat(
        percentToHeat(TEXT_RULES.maliciousLinks.heat),
        "maliciousLinks",
      ),
      info: "bait text + image scam",
    });
  }

  if (TEXT_RULES.maliciousLinks.enabled) {
    const grabbedHit = await detectGrabbedScamImage(message).catch((err?) => {
      global.logger?.warn?.("[automod] grabbed scam image scan failed:", err?.message || err);
      return null;
    });
    if (grabbedHit) {
      violations.push({
        key: "grabbed_scam_image",
        heat: profileHeat(
          percentToHeat(TEXT_RULES.maliciousLinks.heat),
          "maliciousLinks",
        ),
        info: `grabbed bait img (${grabbedHit.kind}:${grabbedHit.id})`,
      });
    }
  }

  if (await isNsfwUrl(moderationScanText, extractedUrls)) {
    violations.push({
      key: "nsfw_link",
      heat: profileHeat(
        percentToHeat(TEXT_RULES.nsfwLinks.heat),
        "nsfwLinks",
      ),
      info: "nsfw domain/url",
    });
  }

  const wordBlacklistMatch =
    shouldSkipViolationForDiscordNative("word_blacklist")
      ? null
      : findBlacklistedWordMatch(moderationContent);
  if (wordBlacklistMatch) {
    violations.push({
      key: "word_blacklist",
      heat: profileHeat(
        percentToHeat(TEXT_RULES.wordBlacklist.heat),
        "wordBlacklist",
      ),
      info:
        wordBlacklistMatch.term && wordBlacklistMatch.source
          ? `racist list (${wordBlacklistMatch.source}: ${wordBlacklistMatch.term})`
          : "racist list",
    });
  }

  if (
    !shouldSkipViolationForDiscordNative("link_blacklist") &&
    (await hasBlacklistedDomain(moderationScanText, extractedUrls))
  ) {
    violations.push({
      key: "link_blacklist",
      heat: profileHeat(
        percentToHeat(TEXT_RULES.linkBlacklist.heat),
        "linkBlacklist",
      ),
      info: "blacklisted domain",
    });
  }

  if (!spamWhitelisted && TEXT_RULES.emojis.enabled) {
    const emojiCount = countEmojiApprox(content);
    if (emojiCount >= TEXT_RULES.emojis.minCount) {
      violations.push({
        key: "emoji_spam",
        heat: profileHeat(
          percentToHeat(TEXT_RULES.emojis.heat),
          "emojis",
        ),
        info: `${emojiCount} emoji`,
      });
    }
  }

  if (!spamWhitelisted && TEXT_RULES.newLines.enabled) {
    const lineBreaks = (content.match(/\n/g) || []).length;
    if (lineBreaks >= TEXT_RULES.newLines.minCount) {
      violations.push({
        key: "new_lines",
        heat: profileHeat(
          percentToHeat(TEXT_RULES.newLines.heat),
          "newLines",
        ),
        info: `${lineBreaks} new lines`,
      });
    }
  }

  if (!spamWhitelisted && TEXT_RULES.zalgo.enabled) {
    const zalgoCount = countZalgo(content);
    if (zalgoCount >= TEXT_RULES.zalgo.minCount) {
      violations.push({
        key: "zalgo",
        heat: profileHeat(
          percentToHeat(TEXT_RULES.zalgo.heat),
          "zalgo",
        ),
        info: `${zalgoCount} combining chars`,
      });
    }
  }

  if (!spamWhitelisted && TEXT_RULES.characters.enabled) {
    const characterRuleContent = stripUrlsForCharacterRule(moderationContent);
    const strippedForCharLen = characterRuleContent.replace(/\s+/g, " ").trim();
    const skipCharSpamForHeavyImagePost =
      imageAttachmentCountForCharRule >= 3 &&
      strippedForCharLen.length < TEXT_RULES.characters.minChars;
    const { lower, upper, total } = countCaseCharacters(characterRuleContent);
    if (!skipCharSpamForHeavyImagePost && total >= TEXT_RULES.characters.minChars) {
      const upperRatio = total > 0 ? upper / total : 0;
      const repeatedCharBurst = /(.)\1{10,}/.test(characterRuleContent);
      const noisyShape = upperRatio >= 0.45 || repeatedCharBurst;
      if (legitConversation && !noisyShape) {
      } else {
        const lowerHeat = lower * (Number(TEXT_RULES.characters.lowercaseHeat) / 100) * MAX_HEAT;
        const upperHeat = upper * (Number(TEXT_RULES.characters.uppercaseHeat) / 100) * MAX_HEAT;
        const heat = Number((lowerHeat + upperHeat).toFixed(2));
        if (heat > 0) {
          violations.push({
            key: "characters",
            heat: profileHeat(heat, "characters"),
            info: `lower:${lower} upper:${upper} ratio:${upperRatio.toFixed(2)}`,
          });
        }
      }
    }
  }

  if (!spamWhitelisted && ATTACHMENT_RULES.enabled && attachmentsEnabled) {
    const embedCount = Array.isArray(message.embeds) ? message.embeds.length : 0;
    const stickerCount = message.stickers?.size || 0;
    const attachmentList = [...(message.attachments?.values?.() || [])];
    const imageCount = attachmentList.filter((att?) => isImageAttachment(att)).length;
    const fileCount = Math.max(0, attachmentList.length - imageCount);
    const linkCount = filterUrlsForAttachmentLinkRule(extractedUrls).length;
    const attachmentScale = resolveAttachmentHeatScale(profile);
    const imageOnlyMax = resolveImageOnlyMaxCount(profile);
    const isImageOnlyGallery =
      hasMeaningfulTextPayload === false &&
      embedCount === 0 &&
      stickerCount === 0 &&
      fileCount === 0 &&
      linkCount === 0 &&
      imageCount > 0 &&
      imageCount <= imageOnlyMax;
    const imageHeatMultiplier =
      attachmentScale != null
        ? attachmentScale
        : isImageOnlyGallery
          ? AUTOMOD_IMAGE_ONLY_HEAT_MULTIPLIER
          : 1;
    const scaleAttachmentHeat = (heat?) => (attachmentScale != null ? heat * attachmentScale : heat);

    if (ATTACHMENT_RULES.embeds.enabled && embedCount > 0) {
      violations.push({
        key: "attachment_embed",
        heat: profileHeat(
          scaleAttachmentHeat(embedCount * percentToHeat(ATTACHMENT_RULES.embeds.heat)),
          "attachments",
        ),
        info: `${embedCount} embed`,
      });
    }
    if (ATTACHMENT_RULES.images.enabled && imageCount > 0) {
      violations.push({
        key: "attachment_image",
        heat: profileHeat(
          scaleAttachmentHeat(
            imageCount * percentToHeat(ATTACHMENT_RULES.images.heat) * imageHeatMultiplier,
          ),
          "attachments",
        ),
        info: `${imageCount} image`,
      });
    }
    if (ATTACHMENT_RULES.files.enabled && fileCount > 0) {
      violations.push({
        key: "attachment_file",
        heat: profileHeat(
          scaleAttachmentHeat(fileCount * percentToHeat(ATTACHMENT_RULES.files.heat)),
          "attachments",
        ),
        info: `${fileCount} file`,
      });
    }
    if (ATTACHMENT_RULES.links.enabled && linkCount > 0) {
      violations.push({
        key: "attachment_link",
        heat: profileHeat(
          scaleAttachmentHeat(linkCount * percentToHeat(ATTACHMENT_RULES.links.heat)),
          "attachments",
        ),
        info: `${linkCount} link`,
      });
    }
    if (ATTACHMENT_RULES.stickers.enabled && stickerCount > 0) {
      violations.push({
        key: "attachment_sticker",
        heat: profileHeat(
          scaleAttachmentHeat(stickerCount * percentToHeat(ATTACHMENT_RULES.stickers.heat)),
          "attachments",
        ),
        info: `${stickerCount} sticker`,
      });
    }
  }

  if (
    !spamWhitelisted &&
    TEXT_RULES.suspiciousAccount.enabled &&
    suspiciousMessageAuthor &&
    hasMeaningfulTextPayload
  ) {
    const hasStrongSignal = violations.some((v?) =>
      SUSPICIOUS_ACCOUNT_STRONG_KEYS.has(String(v?.key || "")),
    );
    const panicActive = isPanicModeActive(message.guildId);
    if (hasStrongSignal || panicActive) {
      violations.push({
        key: "suspicious_account",
        heat: profileHeat(
          percentToHeat(TEXT_RULES.suspiciousAccount.heat),
          "suspiciousAccount",
        ),
        info: panicActive
          ? "suspicious member profile (panic mode)"
          : "suspicious member profile (strong trigger)",
      });
    }
  }

  return violations;
}

function buildAutomodStaffLogEmbed(message?, action?, violations?, heatValue?, context: Record<string, any> = {}) {
  const whoLog = memberDisplayName(message.member || message.author);
  const sorted = pickSortedViolations(violations);
  const violationDetail = sorted
    .slice(0, 6)
    .map((v?) => {
      const label = violationKeyLabelIt(v.key);
      const tech = formatAutomodViolationTechnical(v.info, { publicSafe: false });
      const heatBit = Number.isFinite(v.heat) && v.heat > 0 ? ` · heat ${v.heat.toFixed(1)}` : "";
      return tech ? `• **${label}**${heatBit}\n　↳ ${tech}` : `• **${label}**${heatBit}`;
    })
    .join("\n");
  const timeoutLabel = context.timeoutMs ? formatDurationShort(context.timeoutMs) : null;
  const title =
    action === "timeout"
      ? `AutoMod · timeout${timeoutLabel ? ` (${timeoutLabel})` : ""}`
      : action === "ban"
        ? "AutoMod · ban"
        : action === "delete" || action === "delete_webhook"
          ? "AutoMod · messaggio rimosso"
          : "AutoMod · avviso";
  const fields = [
    {
      name: "Utente",
      value: `${message.author}\n\`${message.author.id}\``,
      inline: true,
    },
    {
      name: "Canale",
      value: `${message.channel}\n\`${message.channelId}\``,
      inline: true,
    },
    {
      name: "Heat / azione",
      value: `**${Number(heatValue || 0).toFixed(1)}** · ${automodActionLabelIt(action)}${timeoutLabel ? `\nDurata: **${timeoutLabel}**` : ""}`,
      inline: true,
    },
    {
      name: "Regolamento",
      value: buildAutomodRegolaFieldValue(violations),
      inline: false,
    },
  ];
  if (violationDetail) {
    fields.push({
      name: "Filtri attivati",
      value: truncateText(violationDetail, 1020),
      inline: false,
    });
  }
  fields.push({
    name: "Decisione automatica",
    value: truncateText(buildAutoModDecisionExplain(action, heatValue, violations, context), 1020),
    inline: false,
  });
  const linkEvidenceLine = buildAutomodAttachmentLinkEvidenceLine(message, violations);
  if (linkEvidenceLine) {
    const linksBody = linkEvidenceLine
      .replace(/^🔗\s*\*\*Link conteggiati \(2\.4\):\*\*\s*/i, "")
      .replace(/^🔗[^\n]*\n?/, "")
      .trim();
    if (linksBody) {
      fields.push({
        name: "Link nel messaggio (2.4)",
        value: truncateText(linksBody, 1020),
        inline: false,
      });
    }
  }
  const embed = new EmbedBuilder()
    .setColor(automodEmbedColor(action))
    .setTitle(`${title} · ${whoLog}`)
    .addFields(fields)
    .setTimestamp();
  const rawMsg = String(message?.content || "").trim();
  if (rawMsg) {
    embed.addFields({
      name: "Testo del messaggio",
      value: `\`\`\`\n${escapeDiscordTripleBackticks(truncateText(rawMsg, 980))}\n\`\`\``,
      inline: false,
    });
  }
  return embed;
}

function buildAutoModDecisionExplain(action?, heatValue?, violations = [], context: Record<string, any> = {}) {
  const normalizedAction = String(action || "").toLowerCase();
  const heat = Number(heatValue || 0);
  const topRules = (Array.isArray(violations) ? violations : []).map((v?) => ({ key: String(v?.key || "unknown"), heat: Number(v?.heat || 0), })).sort((a?, b?) => b.heat - a.heat).slice(0, 3).map((v?) => Number.isFinite(v.heat) && v.heat > 0 ? `${v.key}:${v.heat.toFixed(1)}`
    : v.key,
  );
  const topRulesText = topRules.length ? topRules.join(" | ") : "n/d";
  const thresholds = getThresholdsForProfile(context?.profile || null);
  const reason = normalizedAction === "timeout" ? `heat ≥ soglia timeout (${heat.toFixed(1)} ≥ ${Number(thresholds.timeout || 0).toFixed(1)})`
    : normalizedAction === "ban"
      ? `ban (regolamento / severità; heat ${heat.toFixed(1)})`
    : normalizedAction === "delete" || normalizedAction === "delete_webhook"
      ? `heat ≥ soglia rimozione (${heat.toFixed(1)} ≥ ${Number(thresholds.delete || 0).toFixed(1)})`
      : normalizedAction === "warn"
        ? `heat ≥ soglia avviso (${heat.toFixed(1)} ≥ ${Number(thresholds.warn || 0).toFixed(1)})`
        : `azione=${normalizedAction || "sconosciuta"} heat=${heat.toFixed(1)}`;
  const regolaLine = truncateText(buildAutomodRegolaSummaryLine(violations), 240);
  const regolaBit = regolaLine ? ` | regolamento: ${regolaLine}` : "";
  return `${reason}; pesi violazioni: ${topRulesText}${regolaBit}`;
}

async function sendAutomodLog(message?, action?, violations?, heatValue?, context: Record<string, any> = {}) {
  const channel = await resolveLogChannel(message.guild);
  if (!channel?.isTextBased?.()) return;
  const embed = buildAutomodStaffLogEmbed(message, action, violations, heatValue, context);
  await channel.send({ embeds: [embed] }).catch(() => { });
}

async function warnUser(message?, state?, violations?, options: Record<string, any> = {}) {
  if (!options?.alreadyBlocked) {
    const deleted = await message.delete().then(() => true).catch(() => false);
    if (!deleted) return false;
  }
  await deleteRelatedViolationMessages(message, violations);
  await markBadUserAction(message, "warn", violations);
  await registerAutoModCase(message, "warn", violations);
  await sendAutomodLog(message, "warn", violations, state.heat);
  recordAutomodMetric(message, "warn", violations);
  if (isAutomodPublicNoticeCooldownClear(message)) {
    touchAutomodPublicNoticeCooldown(message);
    await sendAutomodActionInChannel(message, "warn", violations);
  }
  return true;
}

async function deleteMessage(message?, state?, violations?, options: Record<string, any> = {}) {
  if (!options?.alreadyBlocked) {
    const deleted = await message.delete().then(() => true).catch(() => false);
    if (!deleted) return false;
  }
  await deleteRelatedViolationMessages(message, violations);
  await markBadUserAction(message, "delete", violations);
  await registerAutoModCase(message, "delete", violations);
  await sendAutomodLog(message, "delete", violations, state.heat);
  recordAutomodMetric(message, "delete", violations);
  if (isAutomodPublicNoticeCooldownClear(message)) {
    touchAutomodPublicNoticeCooldown(message);
    await sendAutomodActionInChannel(message, "delete", violations);
  }
  return true;
}

async function banMemberFromAutomod(message?, state?, violations?, options: Record<string, any> = {}, meta: Record<string, any> = {}) {
  const member = message.member;
  if (!member) return false;
  const guild = message.guild;
  const me = guild?.members?.me;
  if (!me?.permissions?.has(PermissionsBitField.Flags.BanMembers)) {
    global.logger?.warn?.("[automod] ban: bot senza permesso BanMembers");
    return false;
  }
  if (!member.bannable) {
    global.logger?.warn?.("[automod] ban: membro non bannabile (owner, gerarchia ruoli, ecc.)", {
      userId: member.id,
    });
    return false;
  }
  const userId = String(message.author?.id || "");
  const gid = String(message.guildId || "");
  if (gid && String(guild.ownerId) === userId) return false;
  if (gid && isExtraOwner(gid, userId)) return false;

  await message.delete().catch(() => {});

  const primaryBucket = meta.primaryBucket ?? pickPrimaryAutomodRegolaBucket(violations);
  const regolaDot = formatRegolaDotFromBucket(primaryBucket);
  const banReason = truncateText(
    regolaDot
      ? `AutoMod: ban reg. ${regolaDot} (heat ${Number(state.heat || 0).toFixed(1)})`
      : `AutoMod: ban (heat ${Number(state.heat || 0).toFixed(1)})`,
    480,
  );

  const banned = await guild.members
    .ban(userId, { deleteMessageSeconds: 604800, reason: banReason })
    .then(() => true)
    .catch((err?) => {
      global.logger?.warn?.("[automod] ban() fallito:", err?.message || err);
      return false;
    });
  if (!banned) return false;

  if (primaryBucket) {
    await incrementRegolaTimeoutStrike(userId, primaryBucket);
  }

  const heatBeforeReset = Number(state.heat || 0);
  await markBadUserAction(message, "ban", violations);
  await registerAutoModCase(message, "ban", violations, {});
  if (HEAT_RESET_ON_PUNISHMENT) {
    state.heat = 0;
  }
  state.msgTimes = [];
  state.normHistory = [];
  state.mentionTimes = [];
  state.mentionHourTimes = [];

  await sendAutomodLog(message, "ban", violations, heatBeforeReset, {
    primaryBucket,
    regolaStrikeDisplay: primaryBucket ? Number(meta.prevRegolaStrikes || 0) + 1 : null,
  });
  recordAutomodMetric(message, "ban", violations);
  const publicNoticeOk =
    Boolean(options?.ignoreCooldown) || isAutomodPublicNoticeCooldownClear(message);
  if (publicNoticeOk) {
    touchAutomodPublicNoticeCooldown(message);
    await sendAutomodActionInChannel(message, "ban", violations, {});
  }
  scheduleAutomodSanzioniStickyReposition(message.client);
  return true;
}

async function timeoutMember(message?, state?, violations?, options: Record<string, any> = {}) {
  const member = message.member;
  if (!member) return false;

  const userId = String(message.author?.id || "");
  const primaryBucket = pickPrimaryAutomodRegolaBucket(violations);
  let prevRegolaStrikes = 0;
  if (primaryBucket) {
    prevRegolaStrikes = await getRegolaTimeoutStrikeCount(userId, primaryBucket);
  }
  const regolaSanction = primaryBucket
    ? getAutomodRegolaSanction(primaryBucket, prevRegolaStrikes)
    : null;
  if (regolaSanction?.type === "ban") {
    return banMemberFromAutomod(message, state, violations, options, {
      primaryBucket,
      prevRegolaStrikes,
    });
  }

  if (!AUTO_TIMEOUTS_ENABLED) return false;
  if (!member.moderatable) return false;
  const me = message.guild.members.me;
  if (!me?.permissions?.has(PermissionsBitField.Flags.ModerateMembers)) {
    return false;
  }
  const regolaLadderMs = regolaSanction?.type === "timeout" ? regolaSanction.ms : 0;
  const preview = computeNextAutoTimeoutDuration(message, nowMs(), { dryRun: true });
  let durationMs = Number(preview.durationMs || REGULAR_TIMEOUT_MS);
  const forcedDuration = Number(options?.forceDurationMs || 0);
  if (Number.isFinite(forcedDuration) && forcedDuration > 0) {
    durationMs = Math.max(durationMs, forcedDuration);
  }
  const escalate1h = await shouldEscalateNextAutoTimeout(message);
  if (escalate1h) {
    durationMs = Math.max(durationMs, 60 * 60_000);
  }
  if (regolaLadderMs > 0) {
    durationMs = Math.max(durationMs, regolaLadderMs);
  }
  durationMs = Math.max(60_000, Math.min(DISCORD_TIMEOUT_MAX_MS, durationMs));
  if (!options?.alreadyBlocked) {
    await message.delete().catch(() => { });
  }
  const regolaDot = formatRegolaDotFromBucket(primaryBucket);
  const timeoutReason = regolaDot
    ? `AutoMod: reg. ${regolaDot} (heat ${Number(state.heat || 0).toFixed(1)})`
    : `AutoMod: heat ${Number(state.heat || 0).toFixed(1)}`;
  const timedOut = await member.timeout(durationMs, truncateText(timeoutReason, 480))
    .then(() => true)
    .catch(() => false);
  if (!timedOut) return false;
  try {
    const { applyActiveMuteMirror } = require("./mutedMirrorRoleService") as typeof import("./mutedMirrorRoleService");
    await applyActiveMuteMirror(member, { reason: timeoutReason || "AutoMod timeout" });
  } catch (err) {
    global.logger?.warn?.("[automod] active mute mirror after timeout:", err?.message || err);
  }
  computeNextAutoTimeoutDuration(message, nowMs(), { dryRun: false });
  const heatBeforeReset = Number(state.heat || 0);
  if (primaryBucket) {
    await incrementRegolaTimeoutStrike(userId, primaryBucket);
  }
  await registerAutoModTimeoutStrike(message);
  await markBadUserAction(message, "timeout", violations);
  await registerAutoModCase(message, "timeout", violations, {
    timeoutMs: durationMs,
  });
  if (HEAT_RESET_ON_PUNISHMENT) {
    state.heat = 0;
  }
  state.msgTimes = [];
  state.normHistory = [];
  state.mentionTimes = [];
  state.mentionHourTimes = [];
  await sendAutomodLog(message, "timeout", violations, heatBeforeReset, {
    timeoutMs: durationMs,
    primaryBucket,
    regolaStrikeDisplay: primaryBucket ? prevRegolaStrikes + 1 : null,
  });
  recordAutomodMetric(message, "timeout", violations);
  const publicNoticeOk =
    Boolean(options?.ignoreCooldown) || isAutomodPublicNoticeCooldownClear(message);
  if (publicNoticeOk) {
    touchAutomodPublicNoticeCooldown(message);
    await sendAutomodActionInChannel(message, "timeout", violations, {
      timeoutMs: durationMs,
    });
  }
  scheduleAutomodSanzioniStickyReposition(message.client);
  return true;
}

async function runAutoModMessage(message?) {
  ensureAutomodHotSnapshotLoaded();
  const now = nowMs();
  if (now - Number(lastRuntimeCleanupAt || 0) >= RUNTIME_CLEANUP_INTERVAL_MS) {
    cleanupRuntimeMaps(now);
    lastRuntimeCleanupAt = now;
  }
  if (!message?.guild) return { blocked: false };
  if (message?.id && wasDiscordNativeHandled(message.id)) {
    return { blocked: true, action: "discord_native" };
  }
  if (!AUTOMOD_ENABLED) return { blocked: false, action: "automod_disabled" };
  if (await isVerifiedBotMessage(message)) return { blocked: false };
  if (message.webhookId) {
    if (
      !AUTOMOD_MONITOR_UNWHITELISTED_WEBHOOKS ||
      automodRuntimeConfig?.heatFilters?.webhookMessages === false
    ) {
      return { blocked: false, action: "webhook_filter_disabled" };
    }
    const webhookId = String(message.webhookId);
    const authorId = String(message.author?.id || "");
    const applicationId = String(message.applicationId || "");
    const clientAppId = String(message.client?.user?.id || "");

    if (
      CORE_EXEMPT_USER_IDS.has(authorId) ||
      isSecurityProfileImmune(String(message.guildId || ""), authorId)
    ) {
      return { blocked: false };
    }
    if (TRUSTED_WEBHOOK_AUTHOR_IDS.has(authorId)) return { blocked: false };
    if (applicationId && TRUSTED_WEBHOOK_AUTHOR_IDS.has(applicationId)) {
      return { blocked: false };
    }
    if (
      applicationId &&
      (applicationId === clientAppId ||
        CORE_EXEMPT_USER_IDS.has(applicationId) ||
        isSecurityProfileImmune(String(message.guildId || ""), applicationId))
    ) {
      return { blocked: false };
    }
    if (applicationId && (await isVerifiedBotUserId(message.client, applicationId))) {
      return { blocked: false, action: "verified_bot_webhook_exempt" };
    }
    if (WHITELISTED_WEBHOOK_IDS.has(webhookId)) return { blocked: false };
    await message.delete().catch(() => { });
    await markBadUserAction(message, "delete_webhook", [
      { key: "unwhitelisted_webhook" },
    ]);
    await registerAutoModCase(
      message,
      "delete_webhook",
      [{ key: "unwhitelisted_webhook" }],
    );
    await sendAutomodActionInChannel(
      message,
      "delete_webhook",
      [{ key: "unwhitelisted_webhook", heat: 0, info: webhookId }],
    );
    await sendAutomodLog(
      message,
      "delete_webhook",
      [{ key: "unwhitelisted_webhook", heat: 0, info: webhookId }],
      0,
    );
    recordAutomodMetric(message, "delete_webhook", [
      { key: "unwhitelisted_webhook" },
    ]);
    return { blocked: true, action: "delete_webhook", heat: 0 };
  }
  if (!message?.member && message?.guild) {
    const fetchedMember = await getGuildMemberCached(message.guild, message.author.id);
    if (fetchedMember) {
      try {
        message.member = fetchedMember;
      } catch (err) {
        global.logger?.warn?.("[automod] ", err?.message || err);
      }
    }
  }
  if (!message?.member) return { blocked: false };
  if (message.author?.bot || message.system) {
    return { blocked: false };
  }
  if (isLikelyCommandMessage(message)) {
    return { blocked: false, action: "command_exempt" };
  }
  if (isExempt(message)) return { blocked: false };

  const profile = getProfileConfig(message);
  const thresholds = getThresholdsForProfile(profile);
  const state = getState(message);
  decayHeat(state);
  const rawViolations = await detectViolations(message, state, profile);
  const legitConversation = looksLikeLegitConversation(stripQuotedAndCodeText(String(message.content || "")) || String(message.content || ""),);
  const violations = normalizeViolationsForHeat(rawViolations, { legitConversation, profile });
  if (!violations.length) return { blocked: false };

  /* bot slur catch: evita doppio timeout se Discord Native scatta dopo sul match esatto */
  if (
    message?.id &&
    violations.some((v?) => String(v?.key || "") === "word_blacklist")
  ) {
    markDiscordNativeHandled(message.id);
  }

  const at = nowMs();
  const shouldCountForPanic = violations.some((v?) => PANIC_TRIGGER_KEYS.has(String(v?.key || "")),);
  if (shouldCountForPanic) {
    state.automodHits.push(at);
    trimWindow(state.automodHits, PANIC_MODE.triggerWindowMs, at);

    let activityBoost = 0;
    if (PANIC_MODE.considerActivityHistory) {
      const priorRecentHits = Math.max(0, state.automodHits.length - 1);
      if (priorRecentHits >= 2) activityBoost = 1;
    }

    let dbBoost = 0;
    if (PANIC_MODE.useGlobalBadUsersDb) {
      const profile = await getBadUserProfile(message.author.id, message.guildId);
      const lastActionTs = profile?.lastActionAt ? new Date(profile.lastActionAt).getTime() : 0;
      const recentEnough = lastActionTs > 0 && at - lastActionTs <= AUTO_TIMEOUT_PROFILE_RESET_MS;
      const activeStrikes = Number(profile?.activeStrikes || 0);
      if (recentEnough && activeStrikes >= 2) dbBoost = 1;
    }
    const signal = registerGuildInstantSignal(message, at);
    let raidBoost = 0;
    if (signal.uniqueUsers >= Number(PANIC_MODE.raidUserThreshold || 3)) {
      raidBoost += 1;
    }
    if (signal.youngUsers >= Number(PANIC_MODE.raidYoungThreshold || 2)) {
      raidBoost += 1;
    }

    const panic = registerPanicTrigger(message.guildId, message.author.id, { activityBoost, dbBoost, raidBoost }, at,);

    if (panic.activated) {
      const activeUntil = getPanicState(message.guildId).activeUntil;
      await sendPanicModeLog(
        message,
        "panic_enabled",
        panic.count,
        activeUntil,
      );
    }
  }

  const panicActive = isPanicModeActive(message.guildId);
  const isRaider = isRaiderInPanic(message.guildId, message.author?.id, at);
  if (panicActive && isRaider) {
    state.heat = MAX_HEAT;
    await markBadUserTrigger(message, violations, state.heat);
    const instantOverrideMs = resolveInstantTimeoutOverrideMs(violations);
    const done = await timeoutMember(message, state, [...violations, { key: "panic_mode", heat: 0, info: "raider during panic" },], { ignoreCooldown: true, forceDurationMs: instantOverrideMs });
    if (done) return { blocked: true, action: "timeout", heat: state.heat };
    const deleted = await deleteMessage(message, state, [...violations, { key: "panic_mode", heat: 0, info: "timeout fallback -> delete" },]);
    return {
      blocked: Boolean(deleted),
      action: deleted ? "delete" : "enforcement_failed",
      heat: state.heat,
    };
  }

  const hasInstantLinkViolation = violations.some((v?) => INSTANT_LINK_KEYS.has(v.key),);
  if (hasInstantLinkViolation) {
    state.heat = MAX_HEAT;
    await markBadUserTrigger(message, violations, state.heat);
    const instantOverrideMs = resolveInstantTimeoutOverrideMs(violations);
    const done = await timeoutMember(message, state, violations, { ignoreCooldown: true, forceDurationMs: instantOverrideMs, });
    if (done) return { blocked: true, action: "timeout", heat: state.heat };
    const deleted = await deleteMessage(message, state, [...violations, { key: "link_blacklist", heat: 0, info: "timeout fallback -> delete" },]);
    return {
      blocked: Boolean(deleted),
      action: deleted ? "delete" : "enforcement_failed",
      heat: state.heat,
    };
  }

  const heatThisMessage = violations.reduce(
    (acc?, v?) => acc + Math.max(0, Number(v?.heat || 0)),
    0,
  );
  addHeat(state, heatThisMessage);
  await markBadUserTrigger(message, violations, state.heat);

  if (state.heat >= thresholds.timeout) {
    const timeoutOverrideMs = resolveInstantTimeoutOverrideMs(violations);
    const done = await timeoutMember(message, state, violations, { forceDurationMs: timeoutOverrideMs, });
    if (done) return { blocked: true, action: "timeout", heat: state.heat };
    const deleted = await deleteMessage(message, state, [...violations, { key: "regular_message", heat: 0, info: "timeout fallback -> delete" },]);
    return {
      blocked: Boolean(deleted),
      action: deleted ? "delete" : "enforcement_failed",
      heat: state.heat,
    };
  }

  if (state.heat >= thresholds.delete) {
    const deleted = await deleteMessage(message, state, violations);
    return {
      blocked: Boolean(deleted),
      action: deleted ? "delete" : "enforcement_failed",
      heat: state.heat,
    };
  }

  if (state.heat >= thresholds.warn) {
    const warned = await warnUser(message, state, violations);
    return {
      blocked: Boolean(warned),
      action: warned ? "warn" : "enforcement_failed",
      heat: state.heat,
    };
  }

  return { blocked: false, action: "heat", heat: state.heat };
}

function buildViolationHeatForNativeKey(key?, profile?) {
  const withProfile = (value?, factorKey?) =>
    applyProfileHeat(applyHeatFactor(factorKey, value), profile);
  const k = String(key || "");
  if (k === "invite") {
    return withProfile(percentToHeat(TEXT_RULES.inviteLinks.heat), "inviteLinks");
  }
  if (k === "link_blacklist") {
    return withProfile(percentToHeat(TEXT_RULES.linkBlacklist.heat), "linkBlacklist");
  }
  if (k === "word_blacklist") {
    return withProfile(percentToHeat(TEXT_RULES.wordBlacklist.heat), "wordBlacklist");
  }
  if (k === "mention_everyone") {
    return withProfile(
      percentToHeat(MENTION_RULES.everyoneMentions.heat),
      "mentions",
    );
  }
  if (k === "mention_hour_cap") {
    return withProfile(percentToHeat(100), "mentions");
  }
  return MAX_HEAT;
}

async function runDiscordNativeAutomodExecution(execution?, ruleHint = null) {
  ensureAutomodHotSnapshotLoaded();
  if (!isDiscordNativeAutomodEnabled(execution?.guildId)) return { handled: false };
  const { resolveAutomodExecutionRule, mapRuleNameToViolationKey } = require("./discordAutomodRulesService") as typeof import("./discordAutomodRulesService");
  const rule = ruleHint || (await resolveAutomodExecutionRule(execution));
  const ruleName = String(rule?.name || "");
  if (!ruleName.startsWith("[VC] ")) return { handled: false, reason: "rule_not_vc" };
  const messageId = String(execution?.messageId || "");
  if (messageId && wasDiscordNativeHandled(messageId)) {
    return { handled: true, action: "discord_native_dedupe" };
  }
  const message: any = await buildMessageFromAutomodExecution(execution);
  if (!message) return { handled: false, reason: "message_stub_failed" };
  if (isAutomodExemptChannel(message.channel, message.guild, message.client)) {
    return { handled: true, action: "exempt_channel" };
  }
  if (messageId) markDiscordNativeHandled(messageId);
  if (!AUTOMOD_ENABLED) return { handled: false, action: "automod_disabled" };
  if (await isVerifiedBotMessage(message)) return { handled: false };
  if (message.author?.bot || message.system) return { handled: false };

  if (!message.member) {
    const fetchedMember = await getGuildMemberCached(message.guild, message.author.id);
    if (fetchedMember) {
      try {
        message.member = fetchedMember;
      } catch (_) {}
    }
  }
  if (!message.member) return { handled: true, action: "staff_pinged_no_member" };
  if (isExempt(message)) return { handled: true, action: "staff_pinged_exempt" };

  const mapped = mapRuleNameToViolationKey(
    ruleName,
    execution?.matchedKeyword || execution?.matchedContent || "",
  );
  const profile = getProfileConfig(message);
  const violations = [
    {
      key: mapped.key,
      heat: buildViolationHeatForNativeKey(mapped.key, profile),
      info: mapped.info,
    },
  ];
  const state = getState(message);
  decayHeat(state);
  const at = nowMs();
  const shouldCountForPanic = violations.some((v?) =>
    PANIC_TRIGGER_KEYS.has(String(v?.key || "")),
  );
  if (shouldCountForPanic) {
    state.automodHits.push(at);
    trimWindow(state.automodHits, PANIC_MODE.triggerWindowMs, at);
    let activityBoost = 0;
    if (PANIC_MODE.considerActivityHistory) {
      const priorRecentHits = Math.max(0, state.automodHits.length - 1);
      if (priorRecentHits >= 2) activityBoost = 1;
    }
    let dbBoost = 0;
    if (PANIC_MODE.useGlobalBadUsersDb) {
      const badProfile = await getBadUserProfile(message.author.id, message.guildId);
      const lastActionTs = badProfile?.lastActionAt
        ? new Date(badProfile.lastActionAt).getTime()
        : 0;
      const recentEnough =
        lastActionTs > 0 && at - lastActionTs <= AUTO_TIMEOUT_PROFILE_RESET_MS;
      const activeStrikes = Number(badProfile?.activeStrikes || 0);
      if (recentEnough && activeStrikes >= 2) dbBoost = 1;
    }
    const signal = registerGuildInstantSignal(message, at);
    let raidBoost = 0;
    if (signal.uniqueUsers >= Number(PANIC_MODE.raidUserThreshold || 3)) {
      raidBoost += 1;
    }
    if (signal.youngUsers >= Number(PANIC_MODE.raidYoungThreshold || 2)) {
      raidBoost += 1;
    }
    const panic = registerPanicTrigger(message.guildId, message.author.id, {
      activityBoost,
      dbBoost,
      raidBoost,
    }, at);
    if (panic.activated) {
      const activeUntil = getPanicState(message.guildId).activeUntil;
      await sendPanicModeLog(message, "panic_enabled", panic.count, activeUntil);
    }
  }

  state.heat = MAX_HEAT;
  await markBadUserTrigger(message, violations, state.heat);
  const instantOverrideMs = resolveInstantTimeoutOverrideMs(violations);
  const nativeOpts = { ignoreCooldown: true, forceDurationMs: instantOverrideMs, alreadyBlocked: true };
  const panicActive = isPanicModeActive(message.guildId);
  const isRaider = isRaiderInPanic(message.guildId, message.author?.id, at);
  if (panicActive && isRaider) {
    const done = await timeoutMember(
      message,
      state,
      [...violations, { key: "panic_mode", heat: 0, info: "raider during panic" }],
      nativeOpts,
    );
    if (done) return { handled: true, action: "timeout", heat: state.heat };
    await registerAutoModCase(message, "delete", violations);
    await markBadUserAction(message, "delete", violations);
    await sendAutomodLog(message, "delete", violations, state.heat);
    recordAutomodMetric(message, "delete", violations);
    return { handled: true, action: "delete", heat: state.heat };
  }

  const done = await timeoutMember(message, state, violations, nativeOpts);
  if (done) return { handled: true, action: "timeout", heat: state.heat };
  await registerAutoModCase(message, "delete", violations);
  await markBadUserAction(message, "delete", violations);
  await sendAutomodLog(message, "delete", violations, state.heat);
  recordAutomodMetric(message, "delete", violations);
  if (isAutomodPublicNoticeCooldownClear(message)) {
    touchAutomodPublicNoticeCooldown(message);
    await sendAutomodActionInChannel(message, "delete", violations);
  }
  return { handled: true, action: "delete", heat: state.heat };
}

function getAutoModConfigSnapshot() {
  return JSON.parse(JSON.stringify(automodRuntimeConfig || DEFAULT_AUTOMOD_RUNTIME));
}

function getAutoModRulesSnapshot() {
  return JSON.parse(
    JSON.stringify({
      status: {
        enabled: Boolean(AUTOMOD_ENABLED),
        antiSpamEnabled: Boolean(AUTOMOD_ANTISPAM_ENABLED),
        monitorUnwhitelistedWebhooks: Boolean(AUTOMOD_MONITOR_UNWHITELISTED_WEBHOOKS),
      },
      textRules: TEXT_RULES,
      mentionRules: MENTION_RULES,
      attachmentRules: ATTACHMENT_RULES,
    }),
  );
}

function updateAutoModConfig(pathExpr?, value?) {
  const next = getAutoModConfigSnapshot();
  if (!setByPath(next, pathExpr, value)) {
    return { ok: false, reason: "invalid_path" };
  }
  const merged = sanitizeAutoModRuntimeConfig(next);
  const validation = validateAutoModRuntimeConfig(merged);
  if (!validation.ok) {
    return { ok: false, reason: validation.reason };
  }
  const saved = writeJsonSafe(AUTOMOD_CONFIG_PATH, merged);
  if (!saved) return { ok: false, reason: "save_failed" };
  automodRuntimeConfig = merged;
  applyAutomodRuntime();
  try {
    const pathKey = String(pathExpr || "");
    if (
      pathKey.startsWith("discordNative") ||
      pathKey.startsWith("heatFilters") ||
      pathKey.startsWith("autoLockdown")
    ) {
      const {
        scheduleDiscordAutomodRulesResync,
      } = require("./discordAutomodRulesService") as typeof import("./discordAutomodRulesService");
      const client = global.__vinylsDiscordClient || null;
      if (client) scheduleDiscordAutomodRulesResync(client);
    }
  } catch (_) {}
  return { ok: true, config: getAutoModConfigSnapshot() };
}

export = { runAutoModMessage, runDiscordNativeAutomodExecution, pingStaffForAutomodExecution, pingStaffAutomodAlert, getAutoModMemberSnapshot, isAutoModRoleExemptMember, getAutoModConfigSnapshot, getAutoModRulesSnapshot, updateAutoModConfig, getAutoModPanicSnapshot, triggerAutoModPanicExternal, clearAutoModPanicState, __test: { isLikelyCommandMessage, buildAutoModDecisionExplain, isAutomodMediaEmbedUrl, isNsfwUrl, isCrossServerForwardedMessage, detectScam, detectScamImageBait, buildModerationScanText, isStaffZoneExemptChannel } };