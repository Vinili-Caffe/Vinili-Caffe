/** Automod: lettura, unione e controllo della configurazione. */
const fs = require("fs") as typeof import("fs");

const DEFAULT_AUTOMOD_RUNTIME = { status: { enabled: true, antiSpamEnabled: true, monitorUnwhitelistedWebhooks: true, }, thresholds: { warn: 35, delete: 65, timeout: 100, }, heatSystem: { maxHeat: 100, decayPerSec: 2, resetOnPunishment: true, }, autoTimeouts: { enabled: true, regularStrikeDurationMs: 60_000, capStrikeDurationMs: 11 * 60_000, capStrike: 3, multiplierEnabled: true, multiplierPercent: 200, profileResetMs: 6 * 60 * 60_000, }, autoLockdown: { enabled: true, mentionTrigger: 50, mentionWindowMs: 3_000, mentionHourCap: 20, }, heatFilters: { regularMessage: true, suspiciousAccount: true, similarMessage: true, emojis: true, newLines: true, zalgo: true, characters: true, inviteLinks: true, maliciousLinks: true, nsfwLinks: true, wordBlacklist: true, linkBlacklist: true, mentions: true, attachments: true, webhookMessages: true, crossServerForwards: true, }, heatFactors: { regularMessage: 1, suspiciousAccount: 1, similarMessage: 1, emojis: 1, newLines: 1, zalgo: 1, characters: 1, inviteLinks: 1, maliciousLinks: 1, nsfwLinks: 1, wordBlacklist: 1, linkBlacklist: 1, mentions: 1, attachments: 1, crossServerForward: 1, }, heatCaps: { maxPerMessage: 85, charactersMax: 40, textClusterMax: 35, attachmentClusterMax: 100, mentionClusterMax: 70, }, panic: { enabled: true, considerActivityHistory: true, useGlobalBadUsersDb: true, triggerCount: 3, triggerWindowMs: 10 * 60_000, durationMs: 10 * 60_000, raidWindowMs: 120_000, raidUserThreshold: 6, raidYoungThreshold: 4, lockCommands: false, }, shorteners: { crawl: true, timeoutMs: 2200, maxHops: 3, }, profiles: { default: { exempt: false, heatMultiplier: 1, attachmentHeatMultiplier: 0.12, attachmentClusterMax: 100, imageOnlyMaxCount: 30, mentionsEnabled: true, attachmentsEnabled: true, inviteLinksEnabled: true, }, media: { exempt: false, heatMultiplier: 1, mentionsEnabled: true, attachmentsEnabled: true, inviteLinksEnabled: true, }, ticket: { exempt: false, hateSpeechOnly: true, heatMultiplier: 1, mentionsEnabled: false, attachmentsEnabled: false, inviteLinksEnabled: false, }, staff: { exempt: true, heatMultiplier: 0.25, mentionsEnabled: false, attachmentsEnabled: false, inviteLinksEnabled: false, }, }, discordNative: { enabled: true, syncOnStartup: true, skipBotDetectionFor: ["mention_everyone", "mention_hour_cap"], }, };

function deepMerge(base?, override?) {
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

function readJsonSafe(filePath?, fallback?) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJsonSafe(filePath?, value?) {
  try {
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    return true;
  } catch {
    return false;
  }
}

function clampNumber(value?, min?, max?, fallback?) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function sanitizeAutoModRuntimeConfig(rawCfg?) {
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
      skipRaw.map((x?) => String(x || "").trim()).filter(Boolean),
    ),
  ];
  if (!merged.discordNative.skipBotDetectionFor.length) {
    merged.discordNative.skipBotDetectionFor = [...skipDefault];
  }
  return merged;
}

function setByPath(target?, pathExpr?, value?) {
  const path = String(pathExpr || "").split(".").map((x?) => x.trim()).filter(Boolean);
  if (!path.length) return false;
  if (path.some((key?) => ["__proto__", "prototype", "constructor"].includes(key))) {
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

function isFiniteNumber(value?) {
  return Number.isFinite(Number(value));
}

function validateAutoModRuntimeConfig(cfg?) {
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
    if (!Number.isFinite(value) || (value as any) < min || (value as any) > max) {
      return { ok: false, reason: `invalid_panic_${key}` };
    }
  }
  if (p.lockCommands !== undefined && typeof p.lockCommands !== "boolean") {
    return { ok: false, reason: "invalid_panic_lockCommands" };
  }
  return { ok: true };
}

export = { DEFAULT_AUTOMOD_RUNTIME, readJsonSafe, writeJsonSafe, clampNumber, sanitizeAutoModRuntimeConfig, setByPath, validateAutoModRuntimeConfig };
