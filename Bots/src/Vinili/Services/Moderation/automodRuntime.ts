/** Automod: config runtime, soglie live, panic e snapshot. */
const { DEFAULT_AUTOMOD_RUNTIME, writeJsonSafe, clampNumber, sanitizeAutoModRuntimeConfig, setByPath, validateAutoModRuntimeConfig } = require("./automodConfigSanitize") as typeof import("./automodConfigSanitize");
const { TEXT_RULES, AUTOMOD_SCAM_CONFIG, AUTOMOD_CONFIG_PATH, rawAutomodRuntimeConfig, URL_EXPANSION_CACHE, nowMs } = require("./automodText") as typeof import("./automodText");
const { MENTION_RULES, ATTACHMENT_RULES, ACTION_COOLDOWN, ACTION_COOLDOWN_MS } = require("./automodActions") as typeof import("./automodActions");
const { ACTION_CHANNEL_LOG_COOLDOWN, NATIVE_STAFF_PING_COOLDOWN, GUILD_PANIC_STATE, ACTION_CHANNEL_LOG_COOLDOWN_MS, NATIVE_STAFF_PING_COOLDOWN_MS, PANIC_MODE, getPanicState } = require("./automodEmbeds") as typeof import("./automodEmbeds");
const { USER_STATE } = require("./automodExempt") as typeof import("./automodExempt");
const { AUTO_TIMEOUT_PROFILE } = require("./automodBadUser") as typeof import("./automodBadUser");
const { GUILD_INSTANT_EVENTS, prunePanicAccounts, registerPanicTrigger } = require("./automodNative") as typeof import("./automodNative");
const { isAutomodMainGuild, isPanicModeActive } = require("./automodDetect") as typeof import("./automodDetect");

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

function maybeCleanupRuntimeMaps(at = nowMs()) {
  if (at - Number(lastRuntimeCleanupAt || 0) >= RUNTIME_CLEANUP_INTERVAL_MS) {
    cleanupRuntimeMaps(at);
    lastRuntimeCleanupAt = at;
  }
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

function isAutomodEnabled() { return AUTOMOD_ENABLED; }
function isAutomodAntispamEnabled() { return AUTOMOD_ANTISPAM_ENABLED; }
function isMonitorUnwhitelistedWebhooksEnabled() { return AUTOMOD_MONITOR_UNWHITELISTED_WEBHOOKS; }
function getAutomodRuntimeConfig() { return automodRuntimeConfig; }
function getMaxHeat() { return MAX_HEAT; }
function getDecayPerSec() { return DECAY_PER_SEC; }
function getWarnThreshold() { return WARN_THRESHOLD; }
function getDeleteThreshold() { return DELETE_THRESHOLD; }
function getTimeoutThreshold() { return TIMEOUT_THRESHOLD; }
function isHeatResetOnPunishment() { return HEAT_RESET_ON_PUNISHMENT; }
function areAutoTimeoutsEnabled() { return AUTO_TIMEOUTS_ENABLED; }
function getRegularTimeoutMs() { return REGULAR_TIMEOUT_MS; }
function getAutoTimeoutRegularMs() { return AUTO_TIMEOUT_REGULAR_MS; }
function getAutoTimeoutCapMs() { return AUTO_TIMEOUT_CAP_MS; }
function getAutoTimeoutCapStrike() { return AUTO_TIMEOUT_CAP_STRIKE; }
function isAutoTimeoutMultiplierEnabled() { return AUTO_TIMEOUT_MULTIPLIER_ENABLED; }
function getAutoTimeoutMultiplierPercent() { return AUTO_TIMEOUT_MULTIPLIER_PERCENT; }
function getAutoTimeoutProfileResetMs() { return AUTO_TIMEOUT_PROFILE_RESET_MS; }
function getMentionLockdownTrigger() { return MENTION_LOCKDOWN_TRIGGER; }
function getMentionLockdownWindowMs() { return MENTION_LOCKDOWN_WINDOW_MS; }

export = {
  INSTANT_LINK_KEYS,
  isDiscordNativeAutomodEnabled,
  shouldSkipViolationForDiscordNative,
  clearAutoModPanicState,
  getAutoModPanicSnapshot,
  triggerAutoModPanicExternal,
  maybeCleanupRuntimeMaps,
  getAutoModConfigSnapshot,
  getAutoModRulesSnapshot,
  updateAutoModConfig,
  isAutomodEnabled,
  isAutomodAntispamEnabled,
  isMonitorUnwhitelistedWebhooksEnabled,
  getAutomodRuntimeConfig,
  getMaxHeat,
  getDecayPerSec,
  getWarnThreshold,
  getDeleteThreshold,
  getTimeoutThreshold,
  isHeatResetOnPunishment,
  areAutoTimeoutsEnabled,
  getRegularTimeoutMs,
  getAutoTimeoutRegularMs,
  getAutoTimeoutCapMs,
  getAutoTimeoutCapStrike,
  isAutoTimeoutMultiplierEnabled,
  getAutoTimeoutMultiplierPercent,
  getAutoTimeoutProfileResetMs,
  getMentionLockdownTrigger,
  getMentionLockdownWindowMs,
};
