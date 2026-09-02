const { EmbedBuilder, PermissionsBitField, UserFlagsBitField, MessageReferenceType } = require("discord.js");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const axios = require("axios");
const { readSnapshotWithMeta, writeSnapshotWithMeta } = require("../../../shared/recovery/snapshotStore");
const { registerShutdownFlush, armShutdownCheckpoint } = require("../../../shared/recovery/shutdownCheckpoint");
const IDs = require("../../Utils/Config/ids");
const { isSecurityProfileImmune, hasAdminsProfileCapability, hasModeratorsProfileCapability, getSecurityStaticsSnapshot, isExtraOwner, } = require("./securityProfilesService");
const { isJoinGateSuspiciousAccount, } = require("./joinGateSuspiciousService");
const { CORE_EXEMPT_USER_IDS } = require("./joinGateExemptUtils");
const { ActivityUserProfile, ACTIVITY_MAIN_GUILD_ID } = require("../../Schemas/Community/communitySchemas");
const { automodBadUser } = require("../../Utils/Community/activityUserProfilePaths");
const { isValidGuildUserId } = require("../../Utils/DB/validateWriteIds");
const { pickPrimaryAutomodRegolaBucket, getAutomodRegolaSanction, formatRegolaDotFromBucket, buildAutomodRegolaSummaryLine, violationKeyLabelIt, MOD_RULE_DETAIL, } = require("../../Utils/Moderation/modRegolamentoConstants");
const { formatItalianMinutesPlain } = require("../../Utils/Text/italianDurationLabels");
const { isChannelInTicketCategory } = require("../../Utils/Ticket/ticketCategoryUtils");
const { isMinigameFloodExemptChannel } = require("../Minigames/minigameService");
const { loadAutomodScamConfig } = require("../../Utils/Moderation/automodScamConfig");
const { createModCase, getModConfig, logModCase, formatDuration } = require("../../Utils/Moderation/moderation");
const { getGuildChannelCached, getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache");
const { accountUsername } = require("../../Utils/Discord/guildDiscordIdentity");
const USER_STATE = new Map();
const ACTION_COOLDOWN = new Map();
const ACTION_CHANNEL_LOG_COOLDOWN = new Map();
const NATIVE_STAFF_PING_COOLDOWN = new Map();
const GUILD_PANIC_STATE = new Map();
const BAD_USER_CACHE = new Map();
const GUILD_INSTANT_EVENTS = new Map();
const URL_EXPANSION_CACHE = new Map();
const EXTERNAL_PANIC_SIGNAL_COOLDOWN = new Map();
const AUTO_TIMEOUT_PROFILE = new Map();
const VERIFIED_BOT_USER_CACHE = new Map();
let DECAY_PER_SEC = 2;
let MAX_HEAT = 100;
let WARN_THRESHOLD = 35;
let DELETE_THRESHOLD = 65;
let TIMEOUT_THRESHOLD = 100;
const ACTION_COOLDOWN_MS = 12_000;
const ACTION_CHANNEL_LOG_COOLDOWN_MS = 6_000;
const ACTION_CHANNEL_NOTICE_DELETE_MS = 10_000;
const NATIVE_STAFF_PING_COOLDOWN_MS = 8_000;
const RUNTIME_CLEANUP_INTERVAL_MS = 30_000;
let AUTO_TIMEOUTS_ENABLED = true;
let AUTO_TIMEOUT_REGULAR_MS = 1 * 60_000;
let AUTO_TIMEOUT_CAP_MS = 11 * 60_000;
let AUTO_TIMEOUT_CAP_STRIKE = 3;
let AUTO_TIMEOUT_MULTIPLIER_ENABLED = true;
let AUTO_TIMEOUT_MULTIPLIER_PERCENT = 200;
let AUTO_TIMEOUT_PROFILE_RESET_MS = 6 * 60 * 60_000;
const DISCORD_TIMEOUT_MAX_MS = 28 * 24 * 60 * 60_000;
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
const NATIVE_HANDLED_MESSAGES = new Map();
const NATIVE_HANDLED_TTL_MS = 30_000;
const PANIC_MODE = { enabled: true, considerActivityHistory: true, useGlobalBadUsersDb: true, triggerCount: 3, triggerWindowMs: 10 * 60_000, durationMs: 10 * 60_000, raidWindowMs: 120_000, raidUserThreshold: 6, raidYoungThreshold: 4, lockCommands: false, };
const PANIC_TRIGGER_KEYS = new Set(["invite", "scam_pattern", "scam_image_bait", "nsfw_link", "word_blacklist", "link_blacklist", "mention_everyone", "mentions_lockdown", "mention_hour_cap", "unwhitelisted_webhook",]);
const MENTION_RULES = {
  enabled: true,
  timeoutMs: 45 * 60_000,
  hourCap: 20,
  userMentions: { enabled: true, heat: 15, minUserMentions: 5 },
  roleMentions: { enabled: true, heat: 20 },
  everyoneMentions: { enabled: true, heat: 100 },
};
const ATTACHMENT_RULES = { enabled: true, timeoutMs: 0, embeds: { enabled: true, heat: 12 }, images: { enabled: true, heat: 6 }, files: { enabled: true, heat: 12 }, links: { enabled: true, heat: 10 }, stickers: { enabled: true, heat: 12 }, };
const AUTOMOD_IMAGE_ONLY_MAX_COUNT = 30;
const AUTOMOD_IMAGE_ONLY_HEAT_MULTIPLIER = 0.12;
const TEXT_RULES = { regularMessage: { enabled: true, heat: 15, timeoutMs: 15 * 60_000, }, suspiciousAccount: { enabled: true, heat: 7, timeoutMs: 15 * 60_000, }, similarMessage: { enabled: true, heat: 22, ratio: 0.8, timeoutMs: 15 * 60_000, }, emojis: { enabled: true, heat: 9, minCount: 8, timeoutMs: 15 * 60_000, }, newLines: { enabled: true, heat: 5, minCount: 6, timeoutMs: 15 * 60_000, }, zalgo: { enabled: true, heat: 1.5, minCount: 6, timeoutMs: 15 * 60_000, }, characters: { enabled: true, lowercaseHeat: 0.08, uppercaseHeat: 0.12, minChars: 40, timeoutMs: 15 * 60_000, }, inviteLinks: { enabled: true, heat: 100, timeoutMs: 60 * 60_000, }, maliciousLinks: { enabled: true, heat: 100, timeoutMs: 60 * 60_000, }, nsfwLinks: { enabled: true, crawlShorteners: true, heat: 100, timeoutMs: 30 * 60_000, }, wordBlacklist: { enabled: true, useProfaneList: false, useVulgarList: false, useRacistList: true, heat: 100, timeoutMs: 45 * 60_000, }, linkBlacklist: { enabled: true, heat: 100, timeoutMs: 45 * 60_000, domains: ["dsc.gg"], }, crossServerForward: { enabled: true, heat: 100, timeoutMs: 0, }, };
const AUTOMOD_SCAM_CONFIG = loadAutomodScamConfig();
TEXT_RULES.linkBlacklist.domains = [...new Set([...(TEXT_RULES.linkBlacklist.domains || []), ...(AUTOMOD_SCAM_CONFIG.domains || [])])];
const AUTOMOD_CONFIG_PATH = path.resolve(__dirname, "../../Utils/Config/automodConfig.json",);
const AUTOMOD_METRICS_PATH = path.resolve(__dirname, "../../Utils/Config/automodMetrics.json",);
const AUTOMOD_HOT_SNAPSHOT_PATH = path.resolve(__dirname, "..", "..", "Data", "automodHotSnapshot.json");
const AUTOMOD_HOT_SNAPSHOT_DEBOUNCE_MS = 2000;
let automodHotSnapshotLoaded = false;
let automodHotSnapshotTimer = null;
const SHORTENER_HOSTS = new Set(["bit.ly", "tinyurl.com", "t.co", "cutt.ly", "is.gd", "rebrand.ly", "tiny.cc", "shorturl.at", "goo.gl", "ow.ly", "buff.ly",]);
const DEFAULT_AUTOMOD_RUNTIME = { status: { enabled: true, antiSpamEnabled: true, monitorUnwhitelistedWebhooks: true, }, thresholds: { warn: 35, delete: 65, timeout: 100, }, heatSystem: { maxHeat: 100, decayPerSec: 2, resetOnPunishment: true, }, autoTimeouts: { enabled: true, regularStrikeDurationMs: 60_000, capStrikeDurationMs: 11 * 60_000, capStrike: 3, multiplierEnabled: true, multiplierPercent: 200, profileResetMs: 6 * 60 * 60_000, }, autoLockdown: { enabled: true, mentionTrigger: 50, mentionWindowMs: 3_000, mentionHourCap: 20, }, heatFilters: { regularMessage: true, suspiciousAccount: true, similarMessage: true, emojis: true, newLines: true, zalgo: true, characters: true, inviteLinks: true, maliciousLinks: true, nsfwLinks: true, wordBlacklist: true, linkBlacklist: true, mentions: true, attachments: true, webhookMessages: true, crossServerForwards: true, }, heatFactors: { regularMessage: 1, suspiciousAccount: 1, similarMessage: 1, emojis: 1, newLines: 1, zalgo: 1, characters: 1, inviteLinks: 1, maliciousLinks: 1, nsfwLinks: 1, wordBlacklist: 1, linkBlacklist: 1, mentions: 1, attachments: 1, crossServerForward: 1, }, heatCaps: { maxPerMessage: 85, charactersMax: 40, textClusterMax: 35, attachmentClusterMax: 100, mentionClusterMax: 70, }, panic: { enabled: true, considerActivityHistory: true, useGlobalBadUsersDb: true, triggerCount: 3, triggerWindowMs: 10 * 60_000, durationMs: 10 * 60_000, raidWindowMs: 120_000, raidUserThreshold: 6, raidYoungThreshold: 4, lockCommands: false, }, shorteners: { crawl: true, timeoutMs: 2200, maxHops: 3, }, profiles: { default: { exempt: false, heatMultiplier: 1, attachmentHeatMultiplier: 0.12, attachmentClusterMax: 100, imageOnlyMaxCount: 30, mentionsEnabled: true, attachmentsEnabled: true, inviteLinksEnabled: true, }, media: { exempt: false, heatMultiplier: 1, mentionsEnabled: true, attachmentsEnabled: true, inviteLinksEnabled: true, }, ticket: { exempt: true, heatMultiplier: 0.6, mentionsEnabled: false, attachmentsEnabled: false, inviteLinksEnabled: false, }, staff: { exempt: true, heatMultiplier: 0.25, mentionsEnabled: false, attachmentsEnabled: false, inviteLinksEnabled: false, }, }, discordNative: { enabled: true, syncOnStartup: true, skipBotDetectionFor: ["word_blacklist", "mention_everyone", "mention_hour_cap"], }, };

function deepMerge(base, override) {
  if (!override || typeof override !== "object") return base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      out[key] &&
      typeof out[key] === "object" &&
      !Array.isArray(out[key])
    ) {
      out[key] = deepMerge(out[key], value);
      continue;
    }
    out[key] = value;
  }
  return out;
}

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJsonSafe(filePath, value) {
  try {
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    return true;
  } catch {
    return false;
  }
}

function readAutomodHotSnapshotRaw() {
  return readSnapshotWithMeta({
    filePath: AUTOMOD_HOT_SNAPSHOT_PATH,
    walPath: `${AUTOMOD_HOT_SNAPSHOT_PATH}.wal`,
    key: "vinyls_automod_hot",
    version: 1,
    fallback: {},
  });
}

function flushAutomodHotSnapshotNow() {
  try {
    const actionCooldown = {};
    for (const [key, ts] of ACTION_COOLDOWN.entries()) {
      if (!key) continue;
      const at = Number(ts || 0);
      if (!Number.isFinite(at) || at <= 0) continue;
      actionCooldown[String(key)] = at;
    }
    writeSnapshotWithMeta({
      filePath: AUTOMOD_HOT_SNAPSHOT_PATH,
      walPath: `${AUTOMOD_HOT_SNAPSHOT_PATH}.wal`,
      key: "vinyls_automod_hot",
      version: 1,
      payload: { actionCooldown },
    });
  } catch { }
}

function scheduleAutomodHotSnapshotPersist() {
  if (automodHotSnapshotTimer) return;
  automodHotSnapshotTimer = setTimeout(() => {
    automodHotSnapshotTimer = null;
    flushAutomodHotSnapshotNow();
  }, AUTOMOD_HOT_SNAPSHOT_DEBOUNCE_MS);
  automodHotSnapshotTimer.unref?.();
}

function ensureAutomodHotSnapshotLoaded() {
  if (automodHotSnapshotLoaded) return;
  armShutdownCheckpoint();
  automodHotSnapshotLoaded = true;
  const raw = readAutomodHotSnapshotRaw();
  const rows = raw?.actionCooldown && typeof raw.actionCooldown === "object"
    ? raw.actionCooldown
    : {};
  const now = nowMs();
  const maxAge = ACTION_COOLDOWN_MS * 4;
  for (const [key, ts] of Object.entries(rows)) {
    const at = Number(ts || 0);
    if (!key || !Number.isFinite(at) || at <= 0) continue;
    if (now - at > maxAge) continue;
    ACTION_COOLDOWN.set(String(key), at);
  }
  if (!global.__vinylsAutomodHotFlushRegistered) {
    global.__vinylsAutomodHotFlushRegistered = true;
    registerShutdownFlush("vinyls_automod_hot", () => flushAutomodHotSnapshotNow());
  }
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function sanitizeAutoModRuntimeConfig(rawCfg) {
  const merged = deepMerge(DEFAULT_AUTOMOD_RUNTIME, rawCfg || {});
  merged.status = merged.status || {};
  merged.status.enabled =
    typeof merged.status.enabled === "boolean"
      ? merged.status.enabled
      : DEFAULT_AUTOMOD_RUNTIME.status.enabled;
  merged.status.antiSpamEnabled =
    typeof merged.status.antiSpamEnabled === "boolean"
      ? merged.status.antiSpamEnabled
      : DEFAULT_AUTOMOD_RUNTIME.status.antiSpamEnabled;
  merged.status.monitorUnwhitelistedWebhooks =
    typeof merged.status.monitorUnwhitelistedWebhooks === "boolean"
      ? merged.status.monitorUnwhitelistedWebhooks
      : DEFAULT_AUTOMOD_RUNTIME.status.monitorUnwhitelistedWebhooks;
  merged.thresholds = merged.thresholds || {};
  merged.thresholds.warn = clampNumber(
    merged.thresholds.warn,
    0,
    200,
    DEFAULT_AUTOMOD_RUNTIME.thresholds.warn,
  );
  merged.thresholds.delete = clampNumber(
    merged.thresholds.delete,
    0,
    200,
    DEFAULT_AUTOMOD_RUNTIME.thresholds.delete,
  );
  merged.thresholds.timeout = clampNumber(
    merged.thresholds.timeout,
    0,
    200,
    DEFAULT_AUTOMOD_RUNTIME.thresholds.timeout,
  );
  if (merged.thresholds.delete < merged.thresholds.warn) {
    merged.thresholds.delete = merged.thresholds.warn;
  }
  if (merged.thresholds.timeout < merged.thresholds.delete) {
    merged.thresholds.timeout = merged.thresholds.delete;
  }
  merged.heatSystem = merged.heatSystem || {};
  merged.heatSystem.maxHeat = clampNumber(
    merged.heatSystem.maxHeat,
    50,
    200,
    DEFAULT_AUTOMOD_RUNTIME.heatSystem.maxHeat,
  );
  merged.heatSystem.decayPerSec = clampNumber(
    merged.heatSystem.decayPerSec,
    0,
    10,
    DEFAULT_AUTOMOD_RUNTIME.heatSystem.decayPerSec,
  );
  merged.heatSystem.resetOnPunishment =
    typeof merged.heatSystem.resetOnPunishment === "boolean"
      ? merged.heatSystem.resetOnPunishment
      : DEFAULT_AUTOMOD_RUNTIME.heatSystem.resetOnPunishment;

  merged.autoTimeouts = merged.autoTimeouts || {};
  merged.autoTimeouts.enabled =
    typeof merged.autoTimeouts.enabled === "boolean"
      ? merged.autoTimeouts.enabled
      : DEFAULT_AUTOMOD_RUNTIME.autoTimeouts.enabled;
  merged.autoTimeouts.regularStrikeDurationMs = clampNumber(
    merged.autoTimeouts.regularStrikeDurationMs,
    30_000,
    24 * 60 * 60_000,
    DEFAULT_AUTOMOD_RUNTIME.autoTimeouts.regularStrikeDurationMs,
  );
  merged.autoTimeouts.capStrikeDurationMs = clampNumber(
    merged.autoTimeouts.capStrikeDurationMs,
    merged.autoTimeouts.regularStrikeDurationMs,
    28 * 24 * 60 * 60_000,
    DEFAULT_AUTOMOD_RUNTIME.autoTimeouts.capStrikeDurationMs,
  );
  merged.autoTimeouts.capStrike = clampNumber(
    merged.autoTimeouts.capStrike,
    2,
    20,
    DEFAULT_AUTOMOD_RUNTIME.autoTimeouts.capStrike,
  );
  merged.autoTimeouts.multiplierEnabled =
    typeof merged.autoTimeouts.multiplierEnabled === "boolean"
      ? merged.autoTimeouts.multiplierEnabled
      : DEFAULT_AUTOMOD_RUNTIME.autoTimeouts.multiplierEnabled;
  merged.autoTimeouts.multiplierPercent = clampNumber(
    merged.autoTimeouts.multiplierPercent,
    100,
    500,
    DEFAULT_AUTOMOD_RUNTIME.autoTimeouts.multiplierPercent,
  );
  merged.autoTimeouts.profileResetMs = clampNumber(
    merged.autoTimeouts.profileResetMs,
    60_000,
    7 * 24 * 60 * 60_000,
    DEFAULT_AUTOMOD_RUNTIME.autoTimeouts.profileResetMs,
  );

  merged.autoLockdown = merged.autoLockdown || {};
  merged.autoLockdown.enabled =
    typeof merged.autoLockdown.enabled === "boolean"
      ? merged.autoLockdown.enabled
      : DEFAULT_AUTOMOD_RUNTIME.autoLockdown.enabled;
  merged.autoLockdown.mentionTrigger = clampNumber(
    merged.autoLockdown.mentionTrigger,
    5,
    200,
    DEFAULT_AUTOMOD_RUNTIME.autoLockdown.mentionTrigger,
  );
  merged.autoLockdown.mentionWindowMs = clampNumber(
    merged.autoLockdown.mentionWindowMs,
    1_000,
    60_000,
    DEFAULT_AUTOMOD_RUNTIME.autoLockdown.mentionWindowMs,
  );
  merged.autoLockdown.mentionHourCap = clampNumber(
    merged.autoLockdown.mentionHourCap,
    5,
    400,
    DEFAULT_AUTOMOD_RUNTIME.autoLockdown.mentionHourCap,
  );

  merged.heatFilters = merged.heatFilters || {};
  for (const key of Object.keys(DEFAULT_AUTOMOD_RUNTIME.heatFilters)) {
    merged.heatFilters[key] =
      typeof merged.heatFilters[key] === "boolean"
        ? merged.heatFilters[key]
        : DEFAULT_AUTOMOD_RUNTIME.heatFilters[key];
  }

  merged.heatFactors = merged.heatFactors || {};
  for (const [key, fallback] of Object.entries(DEFAULT_AUTOMOD_RUNTIME.heatFactors)) {
    merged.heatFactors[key] = clampNumber(
      merged.heatFactors[key],
      0,
      5,
      fallback,
    );
  }
  merged.heatCaps = merged.heatCaps || {};
  merged.heatCaps.maxPerMessage = clampNumber(
    merged.heatCaps.maxPerMessage,
    20,
    200,
    DEFAULT_AUTOMOD_RUNTIME.heatCaps.maxPerMessage,
  );
  merged.heatCaps.charactersMax = clampNumber(
    merged.heatCaps.charactersMax,
    5,
    150,
    DEFAULT_AUTOMOD_RUNTIME.heatCaps.charactersMax,
  );
  merged.heatCaps.textClusterMax = clampNumber(
    merged.heatCaps.textClusterMax,
    5,
    150,
    DEFAULT_AUTOMOD_RUNTIME.heatCaps.textClusterMax,
  );
  merged.heatCaps.attachmentClusterMax = clampNumber(
    merged.heatCaps.attachmentClusterMax,
    5,
    150,
    DEFAULT_AUTOMOD_RUNTIME.heatCaps.attachmentClusterMax,
  );
  merged.heatCaps.mentionClusterMax = clampNumber(
    merged.heatCaps.mentionClusterMax,
    5,
    200,
    DEFAULT_AUTOMOD_RUNTIME.heatCaps.mentionClusterMax,
  );

  merged.panic = merged.panic || {};
  merged.panic.triggerCount = clampNumber(
    merged.panic.triggerCount,
    1,
    30,
    DEFAULT_AUTOMOD_RUNTIME.panic.triggerCount,
  );
  merged.panic.triggerWindowMs = clampNumber(
    merged.panic.triggerWindowMs,
    10_000,
    24 * 60 * 60_000,
    DEFAULT_AUTOMOD_RUNTIME.panic.triggerWindowMs,
  );
  merged.panic.durationMs = clampNumber(
    merged.panic.durationMs,
    30_000,
    24 * 60 * 60_000,
    DEFAULT_AUTOMOD_RUNTIME.panic.durationMs,
  );
  merged.panic.raidWindowMs = clampNumber(
    merged.panic.raidWindowMs,
    10_000,
    60 * 60_000,
    DEFAULT_AUTOMOD_RUNTIME.panic.raidWindowMs,
  );
  merged.panic.raidUserThreshold = clampNumber(
    merged.panic.raidUserThreshold,
    1,
    100,
    DEFAULT_AUTOMOD_RUNTIME.panic.raidUserThreshold,
  );
  merged.panic.raidYoungThreshold = clampNumber(
    merged.panic.raidYoungThreshold,
    1,
    100,
    DEFAULT_AUTOMOD_RUNTIME.panic.raidYoungThreshold,
  );
  merged.panic.lockCommands =
    typeof merged.panic.lockCommands === "boolean"
      ? merged.panic.lockCommands
      : DEFAULT_AUTOMOD_RUNTIME.panic.lockCommands;
  merged.discordNative = merged.discordNative || {};
  merged.discordNative.enabled =
    typeof merged.discordNative.enabled === "boolean"
      ? merged.discordNative.enabled
      : DEFAULT_AUTOMOD_RUNTIME.discordNative.enabled;
  merged.discordNative.syncOnStartup =
    typeof merged.discordNative.syncOnStartup === "boolean"
      ? merged.discordNative.syncOnStartup
      : DEFAULT_AUTOMOD_RUNTIME.discordNative.syncOnStartup;
  const skipDefault = DEFAULT_AUTOMOD_RUNTIME.discordNative.skipBotDetectionFor || [];
  const skipRaw = Array.isArray(merged.discordNative.skipBotDetectionFor)
    ? merged.discordNative.skipBotDetectionFor
    : skipDefault;
  merged.discordNative.skipBotDetectionFor = [
    ...new Set(
      skipRaw.map((x) => String(x || "").trim()).filter(Boolean),
    ),
  ];
  if (!merged.discordNative.skipBotDetectionFor.length) {
    merged.discordNative.skipBotDetectionFor = [...skipDefault];
  }
  return merged;
}

const rawAutomodRuntimeConfig = readJsonSafe(AUTOMOD_CONFIG_PATH, {});
let automodRuntimeConfig = sanitizeAutoModRuntimeConfig(rawAutomodRuntimeConfig);
if (
  JSON.stringify(rawAutomodRuntimeConfig || {}) !==
  JSON.stringify(automodRuntimeConfig || {})
) {
  writeJsonSafe(AUTOMOD_CONFIG_PATH, automodRuntimeConfig);
}
const automodMetrics = readJsonSafe(AUTOMOD_METRICS_PATH, { guilds: {} });
let metricsSaveTimer = null;
let lastRuntimeCleanupAt = 0;

function scheduleMetricsSave() {
  if (metricsSaveTimer) clearTimeout(metricsSaveTimer);
  metricsSaveTimer = setTimeout(() => {
    metricsSaveTimer = null;
    writeJsonSafe(AUTOMOD_METRICS_PATH, automodMetrics);
  }, 1200);
  if (typeof metricsSaveTimer?.unref === "function") metricsSaveTimer.unref();
}

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
  const dnDefault = DEFAULT_AUTOMOD_RUNTIME.discordNative || {};
  DISCORD_NATIVE_AUTOMOD_ENABLED =
    typeof dn.enabled === "boolean" ? dn.enabled : dnDefault.enabled !== false;
  const skipList = Array.isArray(dn.skipBotDetectionFor)
    ? dn.skipBotDetectionFor
    : dnDefault.skipBotDetectionFor || [];
  DISCORD_NATIVE_SKIP_KEYS = new Set(
    skipList.map((x) => String(x || "").trim()).filter(Boolean),
  );
}
applyAutomodRuntime();

function isAutomodMainGuild(guildId) {
  const gid = String(guildId || "").trim();
  if (!gid) return false;
  const mainId = String(ACTIVITY_MAIN_GUILD_ID || IDs.guilds?.main || "").trim();
  return Boolean(mainId && gid === mainId);
}

function isDiscordNativeAutomodEnabled(guildId) {
  if (!DISCORD_NATIVE_AUTOMOD_ENABLED) return false;
  return isAutomodMainGuild(guildId);
}

function getDiscordNativeViolationSkipKeys() {
  return new Set(DISCORD_NATIVE_SKIP_KEYS);
}

function markDiscordNativeHandled(messageId) {
  const id = String(messageId || "").trim();
  if (!id) return;
  const at = nowMs();
  NATIVE_HANDLED_MESSAGES.set(id, at);
  if (NATIVE_HANDLED_MESSAGES.size > 5000) {
    for (const [key, ts] of NATIVE_HANDLED_MESSAGES.entries()) {
      if (at - Number(ts || 0) > NATIVE_HANDLED_TTL_MS) {
        NATIVE_HANDLED_MESSAGES.delete(key);
      }
    }
  }
}

function wasDiscordNativeHandled(messageId) {
  const id = String(messageId || "").trim();
  if (!id) return false;
  const ts = Number(NATIVE_HANDLED_MESSAGES.get(id) || 0);
  if (!ts) return false;
  if (nowMs() - ts > NATIVE_HANDLED_TTL_MS) {
    NATIVE_HANDLED_MESSAGES.delete(id);
    return false;
  }
  return true;
}

function shouldSkipViolationForDiscordNative(key) {
  if (!DISCORD_NATIVE_AUTOMOD_ENABLED) return false;
  return DISCORD_NATIVE_SKIP_KEYS.has(String(key || ""));
}

function clearAutoModPanicState(guildId) {
  const key = String(guildId || "").trim();
  if (key) GUILD_PANIC_STATE.delete(key);
  try {
    const { invalidateSecurityLockCache } = require("./securityOrchestratorService");
    invalidateSecurityLockCache(key);
  } catch (_) {}
}

const WICK_EQUIV = { textClusterMultiplier: 1.1875, upperCharMultiplier: 9.90575, lowerCharMultiplier: 14.866, };

const INSTANT_LINK_KEYS = new Set(["invite", "scam_pattern", "scam_image_bait", "nsfw_link", "word_blacklist", "link_blacklist", "mention_everyone", "mention_hour_cap", "mentions_lockdown",]);
const SUSPICIOUS_ACCOUNT_STRONG_KEYS = new Set([
  "mention_user",
  "mention_role",
  "mention_everyone",
  "mention_hour_cap",
  "mentions_lockdown",
  "invite",
  "scam_pattern",
  "scam_image_bait",
  "nsfw_link",
  "link_blacklist",
  "attachment_embed",
  "attachment_image",
  "attachment_file",
  "attachment_link",
  "attachment_sticker",
]);

const RACIST_WORD_PATTERNS = [/\bn[\W_]*[i1l!|][\W_]*g[\W_]*g[\W_]*([e3][\W_]*)?r\b/iu, /\bk[\W_]*i[\W_]*k[\W_]*e\b/iu, /\bc[\W_]*h[\W_]*i[\W_]*n[\W_]*k\b/iu, /\bw[\W_]*e[\W_]*t[\W_]*b[\W_]*a[\W_]*c[\W_]*k\b/iu, /\bp[\W_]*a[\W_]*k[\W_]*i\b/iu,];

function parseWordArrayFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((x) => String(x || "").trim().toLowerCase())
      .filter((x) => x.length >= 3);
  } catch {
    return [];
  }
}

function loadCustomRacistWords() {
  const singleFile = path.resolve(__dirname, "../../Utils/Config/automodRacistWords.json",);
  const folderPath = path.resolve(__dirname, "../../Utils/Config/automodRacistWords",);

  const all = new Set(parseWordArrayFile(singleFile));
  try {
    if (fs.existsSync(folderPath)) {
      const entries = fs.readdirSync(folderPath, { withFileTypes: true }).filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".json") && e.name.toLowerCase() !== "sources.json",).map((e) => path.join(folderPath, e.name));
      for (const file of entries) {
        for (const word of parseWordArrayFile(file)) all.add(word);
      }
    }
  } catch (err) {
    global.logger?.warn?.("[automod] ", err?.message || err);
  }
  return [...all];
}

const CUSTOM_RACIST_WORDS = loadCustomRacistWords();

const LEET_MAP = new Map([["0", "o"], ["1", "i"], ["3", "e"], ["4", "a"], ["5", "s"], ["6", "g"], ["7", "t"], ["8", "b"], ["9", "g"], ["@", "a"], ["$", "s"], ["!", "i"], ["|", "i"],]);

function toLeetNormalized(input) {
  let out = "";
  for (const ch of String(input || "")) {
    out += LEET_MAP.get(ch) || ch;
  }
  return out;
}

const WHITELISTED_WEBHOOK_IDS = new Set((Array.isArray(IDs.webhooks?.whitelist) ? IDs.webhooks.whitelist : []).filter(Boolean).map(String),);
const VERIFIED_BOT_IDS = new Set(Object.values(IDs?.bots || {}).filter(Boolean).map(String),);
const TRUSTED_WEBHOOK_AUTHOR_IDS = new Set([IDs.bots?.DISBOARD, IDs.bots?.Discadia, IDs.bots?.VoteManager, IDs.bots?.Dyno, IDs.bots?.Wick, ...CORE_EXEMPT_USER_IDS,].filter(Boolean).map(String),);
const EXEMPT_CHANNEL_IDS = new Set([IDs.channels.staffChat, IDs.channels.staffCmds, IDs.channels.modLogs, IDs.channels.activityLogs, IDs.channels.midChat, IDs.channels.streamerChat].filter(Boolean).map(String),);
const { isAutomodExemptChannel } = require("../../Utils/Moderation/automodChannelExemptions");
const EXEMPT_CATEGORY_IDS = new Set(["1442569074310643845"]);
const SPAM_WHITELIST_CATEGORY_IDS = new Set([IDs?.categories?.categoryGames, "1442569074310643845",].filter(Boolean).map(String),);
const INVITE_WHITELIST_CHANNEL_IDS = new Set([IDs?.channels?.partnerships, "1442569193470824448",].filter(Boolean).map(String),);
const MENTION_WHITELIST_CHANNEL_IDS = new Set([IDs?.channels?.partnerships, "1442569193470824448",].filter(Boolean).map(String),);
const EVERYONE_WHITELIST_CHANNEL_IDS = new Set([IDs?.channels?.partnerships, "1442569193470824448",].filter(Boolean).map(String),);

function isTicketLikeCategory(category) {
  const name = String(category?.name || "").toLowerCase().trim();
  if (!name) return false;
  return (
    name.includes("ticket") ||
    name.includes("tickets") ||
    name.includes("support tickets")
  );
}

function isTicketLikeChannel(channel) {
  if (!channel) return false;
  if (isChannelInTicketCategory(channel)) return true;
  const channelName = String(channel?.name || "").toLowerCase().trim();
  if (channelName.includes("ticket")) return true;
  const parent = channel?.parent || channel?.parentChannel || channel?.parentThread || null;
  if (parent && isTicketLikeCategory(parent)) return true;
  const grandParent = parent?.parent || parent?.parentChannel || null;
  if (grandParent && isTicketLikeCategory(grandParent)) return true;
  return false;
}

function isUnderExemptCategory(channel) {
  if (!channel) return false;
  if (EXEMPT_CATEGORY_IDS.has(String(channel.id || ""))) return true;
  if (EXEMPT_CATEGORY_IDS.has(String(channel.parentId || ""))) return true;
  const parent = channel.parent;
  if (!parent) return false;
  if (EXEMPT_CATEGORY_IDS.has(String(parent.id || ""))) return true;
  if (EXEMPT_CATEGORY_IDS.has(String(parent.parentId || ""))) return true;
  return false;
}

function isWhitelistedByCategory(channel, setRef) {
  if (!channel) return false;
  const set = setRef instanceof Set ? setRef : new Set();
  if (!set.size) return false;
  if (set.has(String(channel.id || ""))) return true;
  if (set.has(String(channel.parentId || ""))) return true;
  const parent = channel.parent;
  if (!parent) return false;
  if (set.has(String(parent.id || ""))) return true;
  if (set.has(String(parent.parentId || ""))) return true;
  return false;
}

function isWhitelistedByChannel(channelId, parentChannelId, setRef) {
  const set = setRef instanceof Set ? setRef : new Set();
  if (!set.size) return false;
  return set.has(String(channelId || "")) || set.has(String(parentChannelId || ""));
}

function resolveProfileKey(message) {
  const channelId = String(message?.channelId || "");
  const parentId = String(message?.channel?.parentId || "");
  const mediaChannelId = String(IDs?.channels?.media || "");
  if (isTicketLikeChannel(message?.channel)) return "ticket";
  if (channelId && (channelId === mediaChannelId || parentId === mediaChannelId))
    return "media";
  if (
    EXEMPT_CHANNEL_IDS.has(channelId) ||
    EXEMPT_CHANNEL_IDS.has(parentId) ||
    isStaffZoneExemptChannel(message?.channel) ||
    isAutomodExemptChannel(message?.channel, message?.guild, message?.client) ||
    isUnderExemptCategory(message?.channel)
  ) {
    return "staff";
  }
  return "default";
}

function getProfileConfig(message) {
  const key = resolveProfileKey(message);
  const defaults = DEFAULT_AUTOMOD_RUNTIME.profiles.default;
  const configured = automodRuntimeConfig?.profiles?.[key] || automodRuntimeConfig?.profiles?.default || {};
  return { key, ...defaults, ...configured };
}

function percentToHeat(percent) {
  return (Number(percent) / 100) * MAX_HEAT;
}

function applyProfileHeat(heat, profile) {
  const multiplier = Number(profile?.heatMultiplier || 1);
  const scaled = Number(heat || 0) * (Number.isFinite(multiplier) ? multiplier : 1);
  return Number(Math.max(0, scaled).toFixed(2));
}

function resolveAttachmentHeatScale(profile) {
  const configured = Number(profile?.attachmentHeatMultiplier);
  if (!Number.isFinite(configured)) return null;
  return Math.max(0, Math.min(1, configured));
}

function resolveImageOnlyMaxCount(profile) {
  const configured = Number(profile?.imageOnlyMaxCount);
  if (Number.isFinite(configured) && configured > 0) return Math.floor(configured);
  return AUTOMOD_IMAGE_ONLY_MAX_COUNT;
}

function applyHeatFactor(key, heat) {
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

function normalizeViolationsForHeat(violations = [], options = {}) {
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
  const hasInstant = items.some((v) => INSTANT_LINK_KEYS.has(String(v?.key || "")));
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
  return items.filter((v) => Number(v?.heat || 0) > 0);
}

function getThresholdsForProfile(profile) {
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

function dayKeyFromMs(ts = Date.now()) {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = `${d.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${d.getUTCDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getGuildMetricsBucket(guildId, dayKey) {
  const gid = String(guildId || "noguild");
  if (!automodMetrics.guilds || typeof automodMetrics.guilds !== "object") {
    automodMetrics.guilds = {};
  }
  if (!automodMetrics.guilds[gid]) automodMetrics.guilds[gid] = { days: {} };
  if (!automodMetrics.guilds[gid].days[dayKey]) {
    automodMetrics.guilds[gid].days[dayKey] = {
      actions: {},
      rules: {},
      channels: {},
      users: {},
      panicEnabled: 0,
    };
  }
  return automodMetrics.guilds[gid].days[dayKey];
}

function recordAutomodMetric(message, action, violations = []) {
  const guildId = String(message?.guildId || "");
  if (!guildId) return;
  const bucket = getGuildMetricsBucket(guildId, dayKeyFromMs());
  const actionKey = String(action || "unknown");
  bucket.actions[actionKey] = Number(bucket.actions[actionKey] || 0) + 1;
  const channelId = String(message?.channelId || "");
  if (channelId) {
    bucket.channels[channelId] = Number(bucket.channels[channelId] || 0) + 1;
  }
  const userId = String(message?.author?.id || "");
  if (userId) {
    bucket.users[userId] = Number(bucket.users[userId] || 0) + 1;
  }
  for (const v of Array.isArray(violations) ? violations : []) {
    const key = String(v?.key || "").trim();
    if (!key) continue;
    bucket.rules[key] = Number(bucket.rules[key] || 0) + 1;
  }
  scheduleMetricsSave();
}

function recordPanicEnabledMetric(guildId) {
  const gid = String(guildId || "");
  if (!gid) return;
  const bucket = getGuildMetricsBucket(gid, dayKeyFromMs());
  bucket.panicEnabled = Number(bucket.panicEnabled || 0) + 1;
  scheduleMetricsSave();
}

function isShortenerHost(host) {
  const h = String(host || "").toLowerCase();
  if (!h) return false;
  return [...SHORTENER_HOSTS].some((token) => h === token || h.endsWith(`.${token}`));
}

function nowMs() {
  return Date.now();
}

function isDbReady() {
  return mongoose.connection?.readyState === 1;
}

function getPanicState(guildId) {
  const key = String(guildId || "");
  const existing = GUILD_PANIC_STATE.get(key);
  if (existing) {
    if (!Array.isArray(existing.panicSignals)) existing.panicSignals = [];
    return existing;
  }
  const initial = { activeUntil: 0, triggerAccounts: new Map(), panicSignals: [], };
  GUILD_PANIC_STATE.set(key, initial);
  return initial;
}

function prunePanicAccounts(state, at = nowMs()) {
  const minTs = at - PANIC_MODE.triggerWindowMs;
  for (const [userId, payload] of state.triggerAccounts.entries()) {
    const ts = typeof payload === "number" ? payload : Number(payload?.ts || 0);
    if (ts < minTs) state.triggerAccounts.delete(userId);
  }
  if (Array.isArray(state.panicSignals)) {
    state.panicSignals = state.panicSignals.filter((ts) => Number(ts || 0) >= minTs);
  }
}

function isPanicModeActive(guildId, at = nowMs()) {
  if (!PANIC_MODE.enabled) return false;
  const state = getPanicState(guildId);
  return state.activeUntil > at;
}

function isRaiderInPanic(guildId, userId, at = nowMs()) {
  if (!PANIC_MODE.enabled || !guildId || !userId) return false;
  const state = getPanicState(guildId);
  if (state.activeUntil <= at) return false;
  return state.triggerAccounts?.has?.(String(userId)) === true;
}

function getAutoModPanicSnapshot(guildId, at = nowMs()) {
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

function triggerAutoModPanicExternal(guildId, sourceUserId = "external", options = {}, at = nowMs()) {
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

function registerPanicTrigger(guildId, userId, options = {}, at = nowMs()) {
  if (!PANIC_MODE.enabled) return { activated: false, active: false, count: 0 };
  const activityBoost = Math.max(0, Math.min(1, Math.floor(Number(options.activityBoost || 0))),);
  const dbBoost = Math.max(0, Math.min(1, Math.floor(Number(options.dbBoost || 0))),);
  const raidBoost = Math.max(0, Math.min(1, Math.floor(Number(options.raidBoost || 0))),);
  const state = getPanicState(guildId);
  prunePanicAccounts(state, at);
  if (!Array.isArray(state.panicSignals)) state.panicSignals = [];
  state.panicSignals.push(at);
  state.triggerAccounts.set(String(userId), {
    ts: at,
    activityBoost,
    dbBoost,
    raidBoost,
  });
  const signalCount = Number(state.panicSignals.length || 0);
  const alreadyActive = state.activeUntil > at;
  if (signalCount >= PANIC_MODE.triggerCount) {
    state.activeUntil = Math.max(state.activeUntil, at + PANIC_MODE.durationMs);
  }
  const nowActive = state.activeUntil > at;
  if (!alreadyActive && nowActive) {
    try {
      const { invalidateSecurityLockCache } = require("./securityOrchestratorService");
      invalidateSecurityLockCache(guildId);
    } catch (_) {}
  }
  return { activated: !alreadyActive && nowActive, active: nowActive, count: signalCount };
}

function registerGuildInstantSignal(message, at = nowMs()) {
  const guildId = String(message?.guildId || "");
  if (!guildId) return { uniqueUsers: 0, youngUsers: 0 };
  const existing = GUILD_INSTANT_EVENTS.get(guildId) || [];
  const minTs = at - Number(PANIC_MODE.raidWindowMs || 120_000);
  const events = existing.filter((item) => Number(item?.ts || 0) >= minTs);
  const accountAgeMs = at - Number(new Date(message?.author?.createdAt || 0).getTime() || 0);
  const isYoung = accountAgeMs > 0 && accountAgeMs < 7 * 24 * 60 * 60_000;
  events.push({
    ts: at,
    userId: String(message?.author?.id || ""),
    young: isYoung,
  });
  GUILD_INSTANT_EVENTS.set(guildId, events);
  const uniqueUsers = new Set(events.map((e) => String(e.userId || ""))).size;
  const youngUsers = new Set(events.filter((e) => e.young).map((e) => String(e.userId || "")),).size;
  return { uniqueUsers, youngUsers };
}

function getAutoTimeoutProfileKey(message) {
  return `${String(message?.guildId || "")}:${String(message?.author?.id || "")}`;
}

function computeNextAutoTimeoutDuration(message, at = nowMs(), options = {}) {
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

function getCachedBadUser(userId, at = nowMs()) {
  const cached = BAD_USER_CACHE.get(String(userId));
  if (!cached) return undefined;
  if (cached.expiresAt < at) {
    BAD_USER_CACHE.delete(String(userId));
    return undefined;
  }
  return cached.value;
}

function setCachedBadUser(userId, value, ttlMs = 60_000) {
  BAD_USER_CACHE.set(String(userId), {
    value,
    expiresAt: nowMs() + ttlMs,
  });
}

function isBadUserProfileStale(profile, at = nowMs()) {
  const lastActionAt = profile?.lastActionAt ? new Date(profile.lastActionAt).getTime() : 0;
  if (!Number.isFinite(lastActionAt) || lastActionAt <= 0) return false;
  return at - lastActionAt > AUTO_TIMEOUT_PROFILE_RESET_MS;
}

function isSafeRegolaBucketId(bucketId) {
  const b = String(bucketId || "").trim();
  return /^[0-9]+_[0-9]+$/.test(b) && b.length <= 12;
}

async function getRegolaTimeoutStrikeCount(userId, bucketId) {
  if (!isSafeRegolaBucketId(bucketId) || !isDbReady()) return 0;
  const uid = String(userId || "").trim();
  if (!isValidGuildUserId(ACTIVITY_MAIN_GUILD_ID, uid)) return 0;
  try {
    const doc = await ActivityUserProfile.findOne(
      { guildId: ACTIVITY_MAIN_GUILD_ID, userId: uid },
      { _id: 0, moderation: 1 },
    )
      .lean()
      .catch(() => null);
    const strikes = doc?.moderation?.automodBadUser?.regolaTimeoutStrikes || {};
    return Math.max(0, Math.min(100, Number(strikes[String(bucketId)] || 0)));
  } catch {
    return 0;
  }
}

async function incrementRegolaTimeoutStrike(userId, bucketId) {
  if (!isSafeRegolaBucketId(bucketId) || !isDbReady()) return;
  const uid = String(userId || "").trim();
  if (!isValidGuildUserId(ACTIVITY_MAIN_GUILD_ID, uid)) return;
  const path = `${automodBadUser("regolaTimeoutStrikes")}.${String(bucketId).trim()}`;
  try {
    await ActivityUserProfile.updateOne(
      { guildId: ACTIVITY_MAIN_GUILD_ID, userId: uid },
      { $inc: { [path]: 1 } },
      { upsert: true, setDefaultsOnInsert: true },
    );
    BAD_USER_CACHE.delete(uid);
  } catch (err) {
    global.logger?.warn?.("[automod] ", err?.message || err);
  }
}

async function getBadUserProfile(userId, guildId = "") {
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
      .reduce((acc, k) => acc?.[k], doc);
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
      Object.keys(regolaRaw).some((k) => Number(regolaRaw[k] || 0) > 0);
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

async function markBadUserTrigger(message, violations, heatValue) {
  if (!isDbReady()) return;
  const userId = String(message.author?.id || "");
  if (!userId) return;
  if (shouldSkipAutomodBadUserDbWrite(message)) return;
  const reasons = [...new Set((violations || []).map((v) => String(v?.key || "").trim()).filter(Boolean))].slice(0, 10);
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

async function markBadUserAction(message, action, violations = []) {
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
  const strikeReasons = (Array.isArray(violations) ? violations : []).map((v) => firstViolationLabel([v])).filter(Boolean).slice(0, 5);
  const update = {
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

async function registerAutoModTimeoutStrike(message) {
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

async function shouldEscalateNextAutoTimeout(message) {
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

function getUserKey(message) {
  return `${message.guildId}:${message.author.id}`;
}

function getState(message) {
  const key = getUserKey(message);
  const existing = USER_STATE.get(key);
  if (existing) return existing;
  const initial = { heat: 0, lastAt: nowMs(), msgTimes: [], normHistory: [], recentMessageHistory: [], mentionTimes: [], mentionHourTimes: [], automodHits: [], };
  USER_STATE.set(key, initial);
  return initial;
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
    const next = (Array.isArray(events) ? events : []).filter((item) => Number(item?.ts || 0) >= minTs,);
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

function decayHeat(state, at = nowMs()) {
  const elapsedSec = Math.max(0, (at - state.lastAt) / 1000);
  state.heat = Math.max(0, state.heat - elapsedSec * DECAY_PER_SEC);
  state.lastAt = at;
}

function addHeat(state, amount) {
  state.heat = Math.min(MAX_HEAT, state.heat + amount);
}

function trimWindow(list, windowMs, at = nowMs()) {
  if (!Array.isArray(list) || !list.length) return;
  const min = at - windowMs;
  let idx = 0;
  while (idx < list.length && Number(list[idx] || 0) < min) idx += 1;
  if (idx > 0) list.splice(0, idx);
}

function trimNormHistory(history, windowMs, at = nowMs()) {
  if (!Array.isArray(history) || !history.length) return;
  const min = at - windowMs;
  let idx = 0;
  while (idx < history.length && Number(history[idx]?.t || 0) < min) idx += 1;
  if (idx > 0) history.splice(0, idx);
}

function trimRecentMessageHistory(history, windowMs, at = nowMs()) {
  if (!Array.isArray(history) || !history.length) return;
  const min = at - windowMs;
  let idx = 0;
  while (idx < history.length && Number(history[idx]?.t || 0) < min) idx += 1;
  if (idx > 0) history.splice(0, idx);
}

function normalizeContent(content) {
  return String(content || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " url ")
    .replace(/<a?:\w+:\d+>/g, " emoji ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countDistinctWords(content) {
  const text = String(content || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (!text) return 0;
  const words = text.split(/[^\p{L}\p{N}]+/gu).map((x) => String(x || "").trim()).filter((x) => x.length >= 2);
  return new Set(words).size;
}

function looksLikeLegitConversation(content) {
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

function stripQuotedAndCodeText(content) {
  const text = String(content || "");
  if (!text) return "";
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]+`/g, " ")
    .split("\n")
    .filter((line) => !String(line || "").trim().startsWith(">"))
    .join("\n")
    .trim();
}

function detectInvite(content) {
  const text = String(content || "");
  const match = text.match(/(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/([a-zA-Z0-9-]{2,})/i,);
  return match ? String(match[1] || "").toLowerCase() : null;
}

function getAllowedInviteCodes(message) {
  const codes = new Set();
  const ownInvite = String(IDs?.links?.invite || "").trim();
  const ownCode = ownInvite.match(/discord\.gg\/([a-zA-Z0-9-]{2,})/i)?.[1];
  if (ownCode) codes.add(ownCode.toLowerCase());
  const vanity = String(message.guild?.vanityURLCode || "").trim();
  if (vanity) codes.add(vanity.toLowerCase());
  return codes;
}

function stripTrustedMediaUrlsFromText(content) {
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

function buildModerationScanText(message, moderationContent) {
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
  /\b(give(?:away|ing)\s+(?:away\s+)?\$?\d[\d,.]*\b)/,
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
  /\b(riftroll|betchoco|nozawin|serowin)\b/i,
];

function detectScam(content) {
  const text = stripTrustedMediaUrlsFromText(content).toLowerCase();
  if (!text) return false;
  if (SCAM_CRYPTO_PATTERNS.some((re) => re.test(text))) return true;
  const domains = AUTOMOD_SCAM_CONFIG.domains || [];
  return domains.some((domain) => domain && text.includes(String(domain).toLowerCase()));
}

function isYoungScamAccount(options = {}) {
  const youngDays = Number(AUTOMOD_SCAM_CONFIG.youngAccountMaxDays || 14);
  const accountAgeMs = Number(options.accountAgeMs || 0);
  const youngMs = youngDays * 24 * 60 * 60_000;
  if (options.youngAccount) return true;
  return accountAgeMs > 0 && accountAgeMs < youngMs;
}

function detectScamImageBait(message, moderationContent, options = {}) {
  const attachmentList = [...(message?.attachments?.values?.() || [])];
  const imageCount = attachmentList.filter((att) => isImageAttachment(att)).length;
  if (imageCount < 1) return false;
  const text = String(moderationContent || "").trim();
  const maxLen = Number(AUTOMOD_SCAM_CONFIG.imageBaitMaxTextLength || 48);
  if (!text || text.length > maxLen) return false;
    if (detectScam(text)) return true;

  const hasStrong = SCAM_IMAGE_STRONG_BAIT_PATTERNS.some((re) => re.test(text));
  const hasSoft = SCAM_IMAGE_SOFT_BAIT_PATTERNS.some((re) => re.test(text));
  if (!hasStrong && !hasSoft) return false;

  const young = isYoungScamAccount(options);
  const suspicious = Boolean(options.suspicious);

    if (!hasStrong) {
    return young && suspicious && text.length <= 16;
  }

      if (suspicious) return true;
  if (young && text.length <= 28) return true;
  const strongHits = SCAM_IMAGE_STRONG_BAIT_PATTERNS.filter((re) => re.test(text)).length;
  return strongHits >= 2 && text.length <= 28;
}

function hostnameHasNoEmptyDnsLabels(hostname) {
  const labels = String(hostname || "").split(".");
  if (labels.length < 2) return false;
  return !labels.some((label) => !label || label.length > 63);
}

function isAutomodBareDomainSentenceFalsePositive(raw) {
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

function isAutomodUntrustedBareDomain(raw, url) {
  const match = String(raw || "").trim().replace(/^[*_~|`]+|[*_~|`]+$/g, "");
  if (!match || /^https?:\/\//i.test(match) || /^www\./i.test(match)) return false;
  const labels = String(url?.hostname || "").toLowerCase().split(".").filter(Boolean);
  if (labels.length < 2) return true;
  const tld = labels[labels.length - 1];
  return !AUTOMOD_BARE_DOMAIN_TRUSTED_TLDS.has(tld);
}

function extractUrls(content) {
  const text = String(content || "");
  const matches =
    text.match(/(?:https?:\/\/)?(?:www\.)?[^\s/$.?#]+\.[^\s]+/gi) || [];
  return matches
    .filter((raw) => !isAutomodBareDomainSentenceFalsePositive(raw))
    .map((raw) => {
      const value = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      try {
        return { url: new URL(value), raw };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter((entry) => hostnameHasNoEmptyDnsLabels(entry.url.hostname))
    .filter((entry) => !isAutomodUntrustedBareDomain(entry.raw, entry.url))
    .map((entry) => entry.url);
}

function isAutomodMediaEmbedUrl(url) {
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

function isAutomodNumericDecimalFalsePositiveUrl(url) {
  if (!url) return false;
  const host = String(url.hostname || "").toLowerCase().trim();
  if (!host) return false;
  const path = String(url.pathname || "");
  const search = String(url.search || "");
  if (path !== "/" && path !== "") return false;
  if (search) return false;
  const labels = host.split(".").filter(Boolean);
  if (!labels.length) return false;
  if (labels.every((lab) => /^\d+$/.test(lab))) return true;
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

function filterUrlsForAttachmentLinkRule(urls) {
  if (!Array.isArray(urls) || !urls.length) return [];
  return urls.filter(
    (u) => !isAutomodMediaEmbedUrl(u) && !isAutomodNumericDecimalFalsePositiveUrl(u),
  );
}

function toAbsoluteUrl(location, base) {
  try {
    return new URL(String(location || ""), base).toString();
  } catch {
    return null;
  }
}

async function expandShortUrl(url, config) {
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
      const response = await axios.get(current, { maxRedirects: 0, timeout: timeoutMs, validateStatus: (s) => s >= 200 && s < 400, headers: { "User-Agent": "Mozilla/5.0 (AutoMod URL Guard)", }, });
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

function isImageAttachment(att) {
  if (!att) return false;
  const contentType = String(att.contentType || "").toLowerCase();
  if (contentType.startsWith("image/")) return true;
  const name = String(att.name || att.filename || "").toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|tiff?|avif|heic|heif|svg)$/.test(name);
}

async function isNsfwUrl(content, preExtractedUrls = null) {
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
    if (nsfwHostTokens.some((t) => host.includes(t))) return true;
    if (nsfwPathTokens.some((t) => path.includes(t))) return true;
  }
  return false;
}

async function hasBlacklistedDomain(content, preExtractedUrls = null) {
  if (!TEXT_RULES.linkBlacklist.enabled) return false;
  const urls = Array.isArray(preExtractedUrls) ? preExtractedUrls : extractUrls(content);
  if (!urls.length) return false;
  const blockedDomains = (TEXT_RULES.linkBlacklist.domains || []).map((x) => String(x || "").trim().toLowerCase()).filter(Boolean);
  if (!blockedDomains.length) return false;
  const shortenerConfig = automodRuntimeConfig?.shorteners || {};
  for (const url of urls) {
    let host = String(url.hostname || "").toLowerCase();
    if (isShortenerHost(host) && shortenerConfig.crawl) {
      const expandedHost = await expandShortUrl(url.toString(), shortenerConfig);
      if (expandedHost) host = expandedHost;
    }
    if (blockedDomains.some((d) => host === d || host.endsWith(`.${d}`))) {
      return true;
    }
  }
  return false;
}

function findBlacklistedWordMatch(content) {
  if (!TEXT_RULES.wordBlacklist.enabled) return null;
  const text = String(content || "");
  if (!text) return null;
  const normalizedBase = text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const normalized = toLeetNormalized(normalizedBase);
  const normalizedTokens = normalized.split(/[^\p{L}\p{N}]+/gu).map((x) => String(x || "").trim()).filter(Boolean);
  const tokenSet = new Set(normalizedTokens);

  if (TEXT_RULES.wordBlacklist.useRacistList) {
    for (let i = 0; i < RACIST_WORD_PATTERNS.length; i += 1) {
      const re = RACIST_WORD_PATTERNS[i];
      if (re.test(text) || re.test(normalized)) {
        return {
          source: "regex",
          term: `pattern#${i + 1}`,
        };
      }
    }
    for (const term of CUSTOM_RACIST_WORDS) {
      const normalizedTerm = toLeetNormalized(String(term || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(),);
      if (!normalizedTerm) continue;

      if (/\s/.test(normalizedTerm)) {
        const padded = ` ${normalized} `;
        const needle = ` ${normalizedTerm} `;
        if (padded.includes(needle)) {
          return {
            source: "custom_phrase",
            term,
          };
        }
      } else if (tokenSet.has(normalizedTerm)) {
        return {
          source: "custom_token",
          term,
        };
      }
    }
  }

  return null;
}

function levenshteinDistance(a, b) {
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

function similarityRatio(a, b) {
  const s = String(a || "");
  const t = String(b || "");
  const maxLen = Math.max(s.length, t.length);
  if (!maxLen) return 1;
  const distance = levenshteinDistance(s, t);
  return 1 - distance / maxLen;
}

function countEmojiApprox(content) {
  const text = String(content || "");
  const custom = (text.match(/<a?:\w+:\d+>/g) || []).length;
  const unicode = (text.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu) || []).length;
  return custom + unicode;
}

function countZalgo(content) {
  return (String(content || "").match(/[\u0300-\u036f]/g) || []).length;
}

function countCaseCharacters(content) {
  const text = String(content || "");
  const lower = (text.match(/\p{Ll}/gu) || []).length;
  const upper = (text.match(/\p{Lu}/gu) || []).length;
  return { lower, upper, total: lower + upper };
}

function stripUrlsForCharacterRule(content) {
  let s = String(content || "").replace(/https?:\/\/\S+/gi, " ");
  s = s.replace(/(?:https?:)?\/\/cdn\.discordapp\.(?:com|net)\/\S+/gi, " ");
  s = s.replace(/\bcdn\.discordapp\.(?:com|net)\/attachments\/\S+/gi, " ");
  s = s.replace(/\b(?:cdn\.discordapp\.(?:com|net)|media\.discordapp\.(?:com|net))\S+/gi, " ");
  s = s.replace(/<a?:\w+:\d+>/g, " ");
  return s;
}

function isStaffZoneExemptChannel(channel) {
  if (!channel) return false;
  try {
    const { isChannelOrThreadUnderStaffChat } = require("../../Utils/Staff/staffChatChannelUtils");
    const { isChannelOrThreadUnderStaffCmds } = require("../../Utils/Staff/staffCmdsChannelUtils");
    return isChannelOrThreadUnderStaffChat(channel) || isChannelOrThreadUnderStaffCmds(channel);
  } catch {
    return false;
  }
}

function isExempt(message) {
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

function shouldSkipAutomodBadUserDbWrite(message) {
  if (!message) return true;
  if (message.author?.bot || message.system) return true;
  const guildId = String(message.guildId || message.guild?.id || "");
  const userId = String(message.author?.id || "");
  if (!userId) return true;
  if (guildId && isExtraOwner(guildId, userId)) return true;
  if (isExempt(message)) return true;
  return false;
}

async function isVerifiedBotMessage(message) {
  if (!message) return false;
  const authorId = String(message.author?.id || "");
  const applicationId = String(message.applicationId || "");
  if (authorId && VERIFIED_BOT_IDS.has(authorId)) return true;
  if (applicationId && VERIFIED_BOT_IDS.has(applicationId)) return true;
  if (message.author?.bot) {
    try {
      const flags = message.author.flags || (typeof message.author.fetchFlags === "function" ? await message.author.fetchFlags().catch(() => null) : null);
      if (flags?.has?.(UserFlagsBitField.Flags.VerifiedBot)) return true;
    } catch (err) {
      global.logger?.warn?.("[automod] ", err?.message || err);
    }
  }
  return false;
}

function isCrossServerForwardedMessage(message) {
  const currentGuildId = String(message?.guildId || message?.guild?.id || "").trim();
  if (!currentGuildId) return false;
  const ref = message?.reference;
  const refType = Number(ref?.type);
  if (ref && refType === MessageReferenceType?.Default) return false;
  if (ref && Number.isFinite(refType) && refType === 0) return false;
  const isDiscordForward =
    refType === MessageReferenceType?.Forward ||
    (Number.isFinite(refType) && refType === 1);
  const hasForwardSnapshots = Number(message?.messageSnapshots?.size || 0) > 0;
  if (!isDiscordForward && !hasForwardSnapshots) return false;
  const sourceGuildId = String(ref?.guildId || "").trim();
  if (sourceGuildId && sourceGuildId === currentGuildId) return false;
  if (sourceGuildId && sourceGuildId !== currentGuildId) return true;
  if (hasForwardSnapshots) return true;
  return false;
}

async function isVerifiedBotUserId(client, userId) {
  const id = String(userId || "").trim();
  if (!id) return false;
  if (VERIFIED_BOT_IDS.has(id)) return true;
  if (VERIFIED_BOT_USER_CACHE.has(id)) {
    return VERIFIED_BOT_USER_CACHE.get(id);
  }
  let verified = false;
  try {
    const user = client?.users?.cache?.get?.(id) || (await client?.users?.fetch?.(id).catch(() => null));
    if (user?.bot) {
      const flags = user.flags || (typeof user.fetchFlags === "function" ? await user.fetchFlags().catch(() => null) : null);
      verified = Boolean(flags?.has?.(UserFlagsBitField.Flags.VerifiedBot));
    }
  } catch {
    verified = false;
  }
  VERIFIED_BOT_USER_CACHE.set(id, verified);
  return verified;
}

function isAutoModRoleExemptMember(guild, member) {
  if (!guild || !member) return false;
  if (String(guild.ownerId || "") === String(member.id || "")) return true;
  if (isSecurityProfileImmune(String(guild?.id || ""), String(member.id || ""))) {
    return true;
  }
  if (hasAdminsProfileCapability(member, "fullImmunity")) return true;
  if (hasAdminsProfileCapability(member, "automodImmunity")) return true;
  if (hasModeratorsProfileCapability(member, "automodImmunity")) return true;
  if (CORE_EXEMPT_USER_IDS.has(String(member.id || ""))) return true;
  return false;
}

async function getAutoModMemberSnapshot(member) {
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
        .map((x) => String(x || "").trim())
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

async function detectViolations(message, state, profile) {
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
  const channelId = String(message.channelId || "");
  const parentChannelId = String(message.channel?.parentId || "");
  const statics = getSecurityStaticsSnapshot(String(message?.guild?.id || ""));
  const dynamicPartneringChannels = Array.isArray(statics?.partneringChannelIds) ? statics.partneringChannelIds.map((id) => String(id || "").trim()).filter(Boolean) : [];
  const { getPartnershipChannelId } = require("../../Utils/Partner/partnershipConfigResolver");
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
  const imageAttachmentCountForCharRule = attachmentListForCharRule.filter((att) => isImageAttachment(att)).length;
  const profileHeat = (value, factorKey = "regularMessage") => applyProfileHeat(applyHeatFactor(factorKey, value), profile);
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
        .map((row) => String(row?.id || ""))
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
    const imageCount = attachmentList.filter((att) => isImageAttachment(att)).length;
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
    const scaleAttachmentHeat = (heat) => (attachmentScale != null ? heat * attachmentScale : heat);

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
    const hasStrongSignal = violations.some((v) =>
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

function getCooldownKey(message) {
  return `${message.guildId}:${message.author.id}`;
}

function isLikelyCommandMessage(message) {
  const content = String(message?.content || "").trim();
  if (!content) return false;
  const dynamicPrefixes = [];
  const cfgPrefix = message?.client?.config?.prefix;
  if (Array.isArray(cfgPrefix)) {
    for (const entry of cfgPrefix) {
      const value = String(entry || "").trim();
      if (value) dynamicPrefixes.push(value);
    }
  } else if (typeof cfgPrefix === "string" && cfgPrefix.trim()) {
    dynamicPrefixes.push(cfgPrefix.trim());
  }
  if (!dynamicPrefixes.length) {
    dynamicPrefixes.push("+");
  }
  return dynamicPrefixes.some((prefix) => {
    if (!content.startsWith(prefix)) return false;
    return content.length > prefix.length;
  });
}

function isAutomodPublicNoticeCooldownClear(message) {
  const key = getCooldownKey(message);
  const last = ACTION_COOLDOWN.get(key) || 0;
  return nowMs() - last >= ACTION_COOLDOWN_MS;
}

function touchAutomodPublicNoticeCooldown(message) {
  ACTION_COOLDOWN.set(getCooldownKey(message), nowMs());
  scheduleAutomodHotSnapshotPersist();
}

async function resolveLogChannel(guild) {
  const channelId = IDs.channels.modLogs || IDs.channels.activityLogs;
  if (!channelId) return null;
  return guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId));
}

async function resolveDiscordNativeAutomodAlertChannel(guild) {
  const channelId = String(IDs.channels?.sanzioniUtenti || "").trim();
  if (!guild || !channelId) return null;
  return guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId));
}

async function pingStaffAutomodAlert(message) {
  const roleId = String(IDs.roles?.Staff || "").trim();
  if (!message?.guild || !roleId) {
    global.logger?.warn?.("[automod] staff ping skipped: missing Staff role id");
    return false;
  }
  const authorId = String(message.author?.id || "").trim() || "unknown";
  const cdKey = `${message.guild.id}:${authorId}`;
  const last = NATIVE_STAFF_PING_COOLDOWN.get(cdKey) || 0;
  if (nowMs() - last < NATIVE_STAFF_PING_COOLDOWN_MS) return false;
  NATIVE_STAFF_PING_COOLDOWN.set(cdKey, nowMs());

  const channel = await resolveDiscordNativeAutomodAlertChannel(message.guild);
  if (!channel?.isTextBased?.()) {
    global.logger?.warn?.("[automod] staff ping skipped: sanzioniUtenti channel missing");
    return false;
  }

  const who = message.author ? `${message.author}` : "un utente";
  const where = message.channel ? `${message.channel}` : "un canale";
  try {
    const sent = await channel.send({
      content: `<@&${roleId}> AutoMod Discord ha bloccato un messaggio di ${who} in ${where}.`,
      allowedMentions: { parse: [], roles: [roleId], users: [] },
    });
    return Boolean(sent);
  } catch (err) {
    global.logger?.warn?.(
      "[automod] staff ping failed:",
      err?.message || err,
      `| channel=${channel.id} role=${roleId}`,
    );
    return false;
  }
}

function scheduleAutomodSanzioniStickyReposition(client, delayMs = 2500) {
  if (!client) return;
  try {
    const { maybeRepositionModerationSticky } = require("../../Utils/Moderation/moderationStickyPanelRuntime");
    void maybeRepositionModerationSticky(null, client, { delayMs }).catch(() => null);
  } catch (_) {}
}

function truncateText(input, max = 700) {
  const text = String(input || "").trim();
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function escapeDiscordTripleBackticks(text) {
  return String(text || "").replace(/```/g, "`\u200b``");
}

function buildAutomodAttachmentLinkEvidenceLine(message, violations = []) {
  if (!violations.some((v) => String(v?.key || "") === "attachment_link")) return null;
  const mod = stripQuotedAndCodeText(String(message?.content || ""));
  const urls = filterUrlsForAttachmentLinkRule(extractUrls(mod));
  if (!urls.length) {
    return "🔗 **Link conteggiati (2.4):** nessun URL estraibile dopo i filtri AutoMod (citazioni `>` o testo in code block esclusi dal conteggio). Se il messaggio era lungo, controlla anche oltre l’anteprima qui sotto.";
  }
  const joined = urls
    .map((u) => truncateText(String(u), 96))
    .join("\n");
  return `🔗 **Link conteggiati (2.4):**\n${truncateText(joined, 900)}`;
}

function pickSortedViolations(violations = []) {
  return [...(Array.isArray(violations) ? violations : [])]
    .map((v) => ({
      key: String(v?.key || "unknown").trim(),
      heat: Number(v?.heat || 0),
      info: v?.info ? String(v.info).trim() : "",
    }))
    .filter((v) => v.key && v.key !== "unknown")
    .sort((a, b) => b.heat - a.heat);
}

function automodEmbedColor(action) {
  const a = String(action || "").toLowerCase();
  if (a === "ban") return 0x992f22;
  if (a === "timeout") return 0xe67e22;
  if (a === "delete" || a === "delete_webhook") return 0xf59e0b;
  return 0x5865f2;
}

function automodActionLabelIt(action) {
  const a = String(action || "").toLowerCase();
  if (a === "timeout") return "Timeout";
  if (a === "ban") return "Ban";
  if (a === "delete" || a === "delete_webhook") return "Messaggio rimosso";
  return "Avviso";
}

function formatAutomodViolationTechnical(info, { publicSafe = false } = {}) {
  const raw = String(info || "").trim();
  if (!raw) return null;
  if (publicSafe) {
    if (/racist list|word_blacklist|blacklist|custom_token|profane|vulgar/i.test(raw)) {
      return "Corrispondenza in lista parole vietate.";
    }
    const invite = raw.match(/discord\.gg\/(\S+)/i);
    if (invite) return `Invito rilevato: \`discord.gg/${truncateText(invite[1], 32)}\``;
    return truncateText(raw, 100);
  }
  const racist = raw.match(/racist list\s*\(([^:]+):\s*.+\)/i);
  if (racist) {
    const src =
      String(racist[1] || "").trim() === "custom_token"
        ? "lista personalizzata server"
        : String(racist[1] || "").replace(/_/g, " ");
    return `Blacklist (${src}) · termine non mostrato nel log`;
  }
  return truncateText(raw, 180);
}

function buildAutomodRegolaFieldValue(violations = []) {
  const bucket = pickPrimaryAutomodRegolaBucket(violations);
  const dot = formatRegolaDotFromBucket(bucket);
  if (!dot) return "Nessun riferimento regolamento automatico.";
  const detail = MOD_RULE_DETAIL[dot];
  if (!detail) return `Regola **${dot}**`;
  const plain = detail
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  return `**${dot}** — ${truncateText(plain, 220)}`;
}

function firstViolationLabel(violations = []) {
  const sorted = pickSortedViolations(violations);
  if (!sorted.length) return "Violazione regolamento";
  return violationKeyLabelIt(sorted[0].key);
}

function buildAutomodChannelEmbed(message, action, violations, context = {}) {
  const who = accountUsername(message.member || message.author);
  const sorted = pickSortedViolations(violations);
  const primary = sorted[0];
  const durationLabel = context.timeoutMs ? formatDurationShort(context.timeoutMs) : null;
  const actionIt = automodActionLabelIt(action);
  const title =
    action === "timeout"
      ? `${actionIt}${durationLabel ? ` · ${durationLabel}` : ""}`
      : actionIt;
  const fields = [
    {
      name: "Utente",
      value: `${message.author}\n\`${message.author.id}\``,
      inline: true,
    },
    {
      name: "Violazione",
      value: primary ? violationKeyLabelIt(primary.key) : "Violazione regolamento",
      inline: true,
    },
  ];
  if (durationLabel) {
    fields.push({ name: "Durata", value: durationLabel, inline: true });
  }
  fields.push({
    name: "Regolamento",
    value: buildAutomodRegolaFieldValue(violations),
    inline: false,
  });
  const tech = primary ? formatAutomodViolationTechnical(primary.info, { publicSafe: true }) : null;
  if (tech) {
    fields.push({ name: "Dettaglio", value: tech, inline: false });
  }
  return new EmbedBuilder()
    .setColor(automodEmbedColor(action))
    .setTitle(`${title} · ${who}`)
    .addFields(fields)
    .setFooter({ text: "AutoMod · Vinili & Caffè" });
}

function buildAutomodStaffLogEmbed(message, action, violations, heatValue, context = {}) {
  const whoLog = accountUsername(message.member || message.author);
  const sorted = pickSortedViolations(violations);
  const violationDetail = sorted
    .slice(0, 6)
    .map((v) => {
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

function formatDurationShort(ms) {
  const totalMinutes = Math.max(1, Math.round(Number(ms || 0) / 60_000));
  if (totalMinutes % 60 === 0) return `${totalMinutes / 60}h`;
  return `${totalMinutes}m`;
}

function buildAutoModDecisionExplain(action, heatValue, violations = [], context = {}) {
  const normalizedAction = String(action || "").toLowerCase();
  const heat = Number(heatValue || 0);
  const topRules = (Array.isArray(violations) ? violations : []).map((v) => ({ key: String(v?.key || "unknown"), heat: Number(v?.heat || 0), })).sort((a, b) => b.heat - a.heat).slice(0, 3).map((v) => Number.isFinite(v.heat) && v.heat > 0 ? `${v.key}:${v.heat.toFixed(1)}`
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

function buildAutoModCaseReason(action, violations = [], context = {}) {
  const keys = Array.isArray(violations) ? violations.map((v) => String(v?.key || "").trim()).filter(Boolean).slice(0, 6) : [];
  const rules = keys.length ? keys.join(", ") : "sconosciuto";
  const timeoutText = context?.timeoutMs ? ` | timeout ${formatDuration(context.timeoutMs)}`
    : "";
  const snippetRaw = String(context?.content || "").trim();
  const snippet = snippetRaw ? ` | msg: ${truncateText(snippetRaw, 120)}` : "";
  const regolaLine = truncateText(buildAutomodRegolaSummaryLine(violations), 280);
  const regolaBit = regolaLine ? ` | regolamento: ${regolaLine}` : "";
  return `[AUTOMOD] ${String(action || "azione").toUpperCase()} | filtri: ${rules}${timeoutText}${regolaBit}${snippet}`;
}

async function registerAutoModCase(message, action, violations = [], context = {}) {
  try {
    const guild = message?.guild;
    const userId = String(message?.author?.id || "");
    const modId = String(message?.client?.user?.id || "");
    if (!guild?.id || !userId || !modId) return null;
    const normalizedAction = String(action || "").trim().toLowerCase();
    const mappedAction = normalizedAction === "timeout" ? "MUTE" : normalizedAction === "ban" ? "BAN" : normalizedAction === "warn" ? "WARN" : "DELETE";
    const durationMs = mappedAction === "MUTE" && Number(context?.timeoutMs) > 0 ? Number(context.timeoutMs) : null;
    const reason = buildAutoModCaseReason(action, violations, { timeoutMs: durationMs, content: message?.content || "", });
    const config = await getModConfig(guild.id);
    const { doc, created } = await createModCase({ guildId: guild.id, action: mappedAction, userId, modId, reason, durationMs, context: { channelId: String(message?.channelId || message?.channel?.id || ""), messageId: String(message?.id || ""), }, dedupe: { enabled: true, byMessageId: true, windowMs: 90_000, matchReason: true, }, });
    if (created) {
      await logModCase({
        client: message.client,
        guild,
        modCase: doc,
        config,
      });
    }
    return doc;
  } catch {
    return null;
  }
}

async function sendAutomodActionInChannel(message, action, violations, context = {}) {
  if (!message?.channel?.isTextBased?.()) return;
  const reason = firstViolationLabel(violations);
  const cooldownKey = [String(message.guildId || "noguild"), String(message.channelId || "nochannel"), String(message.author?.id || "nouser"), String(action || "action"), reason,].join(":");
  const lastSentAt = ACTION_CHANNEL_LOG_COOLDOWN.get(cooldownKey) || 0;
  if (nowMs() - lastSentAt < ACTION_CHANNEL_LOG_COOLDOWN_MS) return;
  ACTION_CHANNEL_LOG_COOLDOWN.set(cooldownKey, nowMs());
  const embed = buildAutomodChannelEmbed(message, action, violations, context);
  const sent = await message.channel.send({ embeds: [embed] }).catch(() => null);
  if (sent) {
    const timer = setTimeout(() => {
      sent.delete().catch(() => { });
    }, ACTION_CHANNEL_NOTICE_DELETE_MS);
    timer.unref?.();
  }
  return sent;
}

async function sendAutomodLog(message, action, violations, heatValue, context = {}) {
  const channel = await resolveLogChannel(message.guild);
  if (!channel?.isTextBased?.()) return;
  const embed = buildAutomodStaffLogEmbed(message, action, violations, heatValue, context);
  await channel.send({ embeds: [embed] }).catch(() => { });
}

async function sendPanicModeLog(message, event, count, activeUntil) {
  const channel = await resolveLogChannel(message.guild);
  if (!channel?.isTextBased?.()) return;
  const when = Math.floor(activeUntil / 1000);
  const state = getPanicState(message.guildId);
  const triggerAccountIds = Array.from(state?.triggerAccounts?.keys?.() || []).filter(Boolean).slice(-10);
  const embed = new EmbedBuilder()
    .setColor(event === "panic_enabled" ? "#ED4245" : "#5865F2")
    .setTitle(event === "panic_enabled" ? "AutoMod Panic Mode enabled!" : "AutoMod Panic Mode update",)
    .setDescription([
      `<a:VC_Alert:1482706673176150077> **Automod Filter:** Panic Mode`, `<:channeltext:1443247596922470551> **Channel:** ${message.channel}[\`${message.channelId}\`]`, `<:member_role_icon:1330530086792728618> **Member:** ${message.author}[\`${message.author.id}\`]`, `<a:VC_Alert:1482706673176150077> **Event:** ${event}`,
      `<a:VC_Alert:1482706673176150077> **Panic signals (window):** ${count}/${PANIC_MODE.triggerCount}`,
      triggerAccountIds.length
        ? `<a:VC_Alert:1482706673176150077> **Trigger IDs:** ${triggerAccountIds.map((id) => `\`${id}\``).join(", ")}`
        : null,
      `<a:VC_Alert:1482706673176150077> **Duration:** ${formatItalianMinutesPlain(Math.round(PANIC_MODE.durationMs / 60_000))}`,
      `<a:VC_Alert:1482706673176150077> **Active Until:** <t:${when}:F>`,
    ].join("\n"),
    )
    .setTimestamp();
  await channel.send({ embeds: [embed] }).catch(() => { });
  if (event === "panic_enabled") {
    recordPanicEnabledMetric(message.guildId);
  }
}

function collectRelatedViolationMessageIds(violations, currentMessageId) {
  const current = String(currentMessageId || "");
  const ids = new Set();
  for (const violation of Array.isArray(violations) ? violations : []) {
    const list = Array.isArray(violation?.relatedMessageIds)
      ? violation.relatedMessageIds
      : [];
    for (const rawId of list) {
      const id = String(rawId || "").trim();
      if (!id || id === current) continue;
      ids.add(id);
    }
  }
  return [...ids];
}

async function deleteRelatedViolationMessages(message, violations) {
  const channel = message?.channel;
  if (!channel?.messages?.fetch) return 0;
  const relatedIds = collectRelatedViolationMessageIds(violations, message?.id);
  if (!relatedIds.length) return 0;
  let removed = 0;
  for (const id of relatedIds) {
    const extra = await channel.messages.fetch(id).catch(() => null);
    if (!extra) continue;
    const ok = await extra.delete().then(() => true).catch(() => false);
    if (ok) removed += 1;
  }
  return removed;
}

async function warnUser(message, state, violations, options = {}) {
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

async function deleteMessage(message, state, violations, options = {}) {
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

async function banMemberFromAutomod(message, state, violations, options = {}, meta = {}) {
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
    .catch((err) => {
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

async function timeoutMember(message, state, violations, options = {}) {
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
    const { applyActiveMuteMirror } = require("./mutedMirrorRoleService");
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

function resolveInstantTimeoutOverrideMs(violations = []) {
  let maxMs = 0;
  for (const violation of Array.isArray(violations) ? violations : []) {
    const key = String(violation?.key || "");
    if (key === "regular_message") {
      maxMs = Math.max(maxMs, Number(TEXT_RULES.regularMessage.timeoutMs || 0));
    } else if (key === "suspicious_account") {
      maxMs = Math.max(maxMs, Number(TEXT_RULES.suspiciousAccount.timeoutMs || 0));
    } else if (key === "similar_message") {
      maxMs = Math.max(maxMs, Number(TEXT_RULES.similarMessage.timeoutMs || 0));
    } else if (
      key === "mention_user" ||
      key === "mention_role" ||
      key === "mention_everyone" ||
      key === "mention_hour_cap" ||
      key === "mentions_lockdown"
    ) {
      maxMs = Math.max(maxMs, Number(MENTION_RULES.timeoutMs || 0));
    } else if (key === "invite") {
      maxMs = Math.max(maxMs, Number(TEXT_RULES.inviteLinks.timeoutMs || 0));
    } else if (key === "scam_pattern" || key === "scam_image_bait") {
      maxMs = Math.max(maxMs, Number(TEXT_RULES.maliciousLinks.timeoutMs || 0));
    } else if (key === "nsfw_link") {
      maxMs = Math.max(maxMs, Number(TEXT_RULES.nsfwLinks.timeoutMs || 0));
    } else if (key === "word_blacklist") {
      maxMs = Math.max(maxMs, Number(TEXT_RULES.wordBlacklist.timeoutMs || 0));
    } else if (key === "link_blacklist") {
      maxMs = Math.max(maxMs, Number(TEXT_RULES.linkBlacklist.timeoutMs || 0));
    } else if (key === "emoji_spam") {
      maxMs = Math.max(maxMs, Number(TEXT_RULES.emojis.timeoutMs || 0));
    } else if (key === "new_lines") {
      maxMs = Math.max(maxMs, Number(TEXT_RULES.newLines.timeoutMs || 0));
    } else if (key === "zalgo") {
      maxMs = Math.max(maxMs, Number(TEXT_RULES.zalgo.timeoutMs || 0));
    } else if (key === "characters") {
      maxMs = Math.max(maxMs, Number(TEXT_RULES.characters.timeoutMs || 0));
    } else if (
      key === "attachment_embed" ||
      key === "attachment_image" ||
      key === "attachment_file" ||
      key === "attachment_link" ||
      key === "attachment_sticker"
    ) {
      maxMs = Math.max(maxMs, Number(ATTACHMENT_RULES.timeoutMs || 0));
    }
  }
  return Number.isFinite(maxMs) && maxMs > 0 ? maxMs : 0;
}

async function runAutoModMessage(message) {
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

  const at = nowMs();
  const shouldCountForPanic = violations.some((v) => PANIC_TRIGGER_KEYS.has(String(v?.key || "")),);
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

  const hasInstantLinkViolation = violations.some((v) => INSTANT_LINK_KEYS.has(v.key),);
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
    (acc, v) => acc + Math.max(0, Number(v?.heat || 0)),
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

function buildViolationHeatForNativeKey(key, profile) {
  const withProfile = (value, factorKey) =>
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

async function buildMessageFromAutomodExecution(execution) {
  const guild = execution?.guild;
  const client = execution?.client;
  if (!guild || !client) return null;
  const channelId = String(execution?.channelId || "");
  const userId = String(execution?.userId || "");
  if (!channelId || !userId) return null;
  const channel =
    execution?.channel ||
    (await getGuildChannelCached(guild, channelId).catch(() => null));
  const member = await getGuildMemberCached(guild, userId).catch(() => null);
  const author = member?.user || (await client.users.fetch(userId).catch(() => null));
  if (!author) return null;
  return {
    guild,
    guildId: String(guild.id),
    channel,
    channelId,
    author,
    member: member || null,
    id: String(execution?.messageId || ""),
    content: String(execution?.content || execution?.matchedContent || ""),
    client,
  };
}

async function pingStaffForAutomodExecution(execution) {
  const message = await buildMessageFromAutomodExecution(execution);
  if (!message) return false;
  if (isAutomodExemptChannel(message.channel, message.guild, message.client)) return false;
  return pingStaffAutomodAlert(message);
}

async function runDiscordNativeAutomodExecution(execution, ruleHint = null) {
  ensureAutomodHotSnapshotLoaded();
  if (!isDiscordNativeAutomodEnabled(execution?.guildId)) return { handled: false };
  const { resolveAutomodExecutionRule, mapRuleNameToViolationKey } = require("./discordAutomodRulesService");
  const rule = ruleHint || (await resolveAutomodExecutionRule(execution));
  const ruleName = String(rule?.name || "");
  if (!ruleName.startsWith("[VC] ")) return { handled: false, reason: "rule_not_vc" };
  const messageId = String(execution?.messageId || "");
  if (messageId && wasDiscordNativeHandled(messageId)) {
    return { handled: true, action: "discord_native_dedupe" };
  }
  const message = await buildMessageFromAutomodExecution(execution);
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
  const shouldCountForPanic = violations.some((v) =>
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

function setByPath(target, pathExpr, value) {
  const path = String(pathExpr || "").split(".").map((x) => x.trim()).filter(Boolean);
  if (!path.length) return false;
  if (path.some((key) => ["__proto__", "prototype", "constructor"].includes(key))) {
    return false;
  }
  let ref = target;
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i];
    if (["__proto__", "prototype", "constructor"].includes(key)) return false;
    if (!ref[key] || typeof ref[key] !== "object") ref[key] = {};
    ref = ref[key];
  }
  if (["__proto__", "prototype", "constructor"].includes(path[path.length - 1])) {
    return false;
  }
  ref[path[path.length - 1]] = value;
  return true;
}

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function validateAutoModRuntimeConfig(cfg) {
  const status = cfg?.status || {};
  const t = cfg?.thresholds || {};
  const hs = cfg?.heatSystem || {};
  const at = cfg?.autoTimeouts || {};
  const al = cfg?.autoLockdown || {};
  const hf = cfg?.heatFactors || {};
  const hc = cfg?.heatCaps || {};
  const p = cfg?.panic || {};
  if (!isFiniteNumber(t.warn) || Number(t.warn) < 0 || Number(t.warn) > 200) {
    return { ok: false, reason: "invalid_threshold_warn" };
  }
  if (!isFiniteNumber(t.delete) || Number(t.delete) < 0 || Number(t.delete) > 200) {
    return { ok: false, reason: "invalid_threshold_delete" };
  }
  if (!isFiniteNumber(t.timeout) || Number(t.timeout) < 0 || Number(t.timeout) > 200) {
    return { ok: false, reason: "invalid_threshold_timeout" };
  }
  if (!(Number(t.warn) <= Number(t.delete) && Number(t.delete) <= Number(t.timeout))) {
    return { ok: false, reason: "invalid_threshold_order" };
  }
  if (
    typeof status.enabled !== "boolean" ||
    typeof status.antiSpamEnabled !== "boolean" ||
    typeof status.monitorUnwhitelistedWebhooks !== "boolean"
  ) {
    return { ok: false, reason: "invalid_status_toggles" };
  }
  const heatChecks = [["maxHeat", hs.maxHeat, 50, 200], ["decayPerSec", hs.decayPerSec, 0, 10],];
  for (const [key, value, min, max] of heatChecks) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < min || n > max) {
      return { ok: false, reason: `invalid_heat_${key}` };
    }
  }
  const autoTimeoutChecks = [["regularStrikeDurationMs", at.regularStrikeDurationMs, 30_000, 24 * 60 * 60_000], ["capStrikeDurationMs", at.capStrikeDurationMs, 30_000, 28 * 24 * 60 * 60_000], ["capStrike", at.capStrike, 2, 20], ["multiplierPercent", at.multiplierPercent, 100, 500], ["profileResetMs", at.profileResetMs, 60_000, 7 * 24 * 60 * 60_000],];
  for (const [key, value, min, max] of autoTimeoutChecks) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < min || n > max) {
      return { ok: false, reason: `invalid_autotimeout_${key}` };
    }
  }
  if (Number(at.capStrikeDurationMs) < Number(at.regularStrikeDurationMs)) {
    return { ok: false, reason: "invalid_autotimeout_cap_duration" };
  }
  const autoLockdownChecks = [["mentionTrigger", al.mentionTrigger, 5, 200], ["mentionWindowMs", al.mentionWindowMs, 1_000, 60_000], ["mentionHourCap", al.mentionHourCap, 5, 400],];
  for (const [key, value, min, max] of autoLockdownChecks) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < min || n > max) {
      return { ok: false, reason: `invalid_autolockdown_${key}` };
    }
  }
  for (const [key, value] of Object.entries(hf || {})) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > 5) {
      return { ok: false, reason: `invalid_heatfactor_${key}` };
    }
  }
  const heatCapChecks = [["maxPerMessage", hc.maxPerMessage, 20, 200], ["charactersMax", hc.charactersMax, 5, 150], ["textClusterMax", hc.textClusterMax, 5, 150], ["attachmentClusterMax", hc.attachmentClusterMax, 5, 150], ["mentionClusterMax", hc.mentionClusterMax, 5, 200],];
  for (const [key, value, min, max] of heatCapChecks) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < min || n > max) {
      return { ok: false, reason: `invalid_heatcap_${key}` };
    }
  }

  const panicChecks = [["triggerCount", 1, 30], ["triggerWindowMs", 10_000, 24 * 60 * 60_000], ["durationMs", 30_000, 24 * 60 * 60_000], ["raidWindowMs", 10_000, 60 * 60_000], ["raidUserThreshold", 1, 100], ["raidYoungThreshold", 1, 100],];
  for (const [key, min, max] of panicChecks) {
    const value = Number(p[key]);
    if (!Number.isFinite(value) || value < min || value > max) {
      return { ok: false, reason: `invalid_panic_${key}` };
    }
  }
  if (p.lockCommands !== undefined && typeof p.lockCommands !== "boolean") {
    return { ok: false, reason: "invalid_panic_lockCommands" };
  }
  return { ok: true };
}

function updateAutoModConfig(pathExpr, value) {
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
      } = require("./discordAutomodRulesService");
      const client = global.__vinylsDiscordClient || null;
      if (client) scheduleDiscordAutomodRulesResync(client);
    }
  } catch (_) {}
  return { ok: true, config: getAutoModConfigSnapshot() };
}

module.exports = { runAutoModMessage, runDiscordNativeAutomodExecution, pingStaffForAutomodExecution, pingStaffAutomodAlert, isDiscordNativeAutomodEnabled, getDiscordNativeViolationSkipKeys, getAutoModMemberSnapshot, isAutoModRoleExemptMember, getAutoModConfigSnapshot, getAutoModRulesSnapshot, updateAutoModConfig, isPanicModeActiveForGuild: isPanicModeActive, getAutoModPanicSnapshot, triggerAutoModPanicExternal, clearAutoModPanicState, __test: { isLikelyCommandMessage, buildAutoModDecisionExplain, isAutomodMediaEmbedUrl, isNsfwUrl, isCrossServerForwardedMessage, detectScam, detectScamImageBait, buildModerationScanText, isStaffZoneExemptChannel } };