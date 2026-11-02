/** Automod: pipeline su messageCreate / messageUpdate. */
const IDs: any = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { isSecurityProfileImmune } = require("./securityProfilesService") as typeof import("./securityProfilesService");
const { CORE_EXEMPT_USER_IDS } = require("./joinGateExemptUtils") as typeof import("./joinGateExemptUtils");
const { getGuildMemberCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { nowMs, looksLikeLegitConversation, stripQuotedAndCodeText, trimWindow } = require("./automodText") as typeof import("./automodText");
const { isVerifiedBotMessage, isVerifiedBotUserId, isLikelyCommandMessage } = require("./automodExempt") as typeof import("./automodExempt");
const { PANIC_MODE, getPanicState, registerAutoModCase, sendAutomodActionInChannel, sendPanicModeLog } = require("./automodEmbeds") as typeof import("./automodEmbeds");
const { recordAutomodMetric, resolveInstantTimeoutOverrideMs } = require("./automodActions") as typeof import("./automodActions");
const { isPanicModeActive } = require("./automodDetect") as typeof import("./automodDetect");
const { PANIC_TRIGGER_KEYS, ensureAutomodHotSnapshotLoaded, markDiscordNativeHandled, wasDiscordNativeHandled, isRaiderInPanic, registerPanicTrigger, registerGuildInstantSignal, getState } = require("./automodNative") as typeof import("./automodNative");
const { sendAutomodLog } = require("./automodDecisions") as typeof import("./automodDecisions");
const { detectViolations: detectViolationsCore } = require("./automodViolationDetect") as typeof import("./automodViolationDetect");
const {
  INSTANT_LINK_KEYS,
  isAutomodEnabled,
  isAutomodAntispamEnabled,
  isMonitorUnwhitelistedWebhooksEnabled,
  getAutomodRuntimeConfig,
  getMaxHeat,
  getAutoTimeoutProfileResetMs,
  getMentionLockdownTrigger,
  getMentionLockdownWindowMs,
  maybeCleanupRuntimeMaps,
  shouldSkipViolationForDiscordNative,
} = require("./automodRuntime") as typeof import("./automodRuntime");
const {
  percentToHeat,
  applyHeatFactor,
  isNsfwUrl,
  hasBlacklistedDomain,
  isExempt,
  getProfileConfig,
  getThresholdsForProfile,
  normalizeViolationsForHeat,
  decayHeat,
  addHeat,
} = require("./automodHeat") as typeof import("./automodHeat");
const {
  getBadUserProfile,
  markBadUserTrigger,
  markBadUserAction,
  warnUser,
  deleteMessage,
} = require("./automodBadUserTrack") as typeof import("./automodBadUserTrack");
const { timeoutMember } = require("./automodBanTimeout") as typeof import("./automodBanTimeout");

const WHITELISTED_WEBHOOK_IDS = new Set((Array.isArray(IDs.webhooks?.whitelist) ? IDs.webhooks.whitelist : []).filter(Boolean).map(String),);
const TRUSTED_WEBHOOK_AUTHOR_IDS = new Set([IDs.bots?.DISBOARD, IDs.bots?.Discadia, IDs.bots?.VoteManager, IDs.bots?.Dyno, IDs.bots?.Wick, ...CORE_EXEMPT_USER_IDS,].filter(Boolean).map(String),);

function getDetectViolationDeps() {
  return {
    shouldSkipViolationForDiscordNative,
    getBadUserProfile,
    percentToHeat,
    applyHeatFactor,
    isNsfwUrl,
    hasBlacklistedDomain,
    automodAntispamEnabled: isAutomodAntispamEnabled(),
    mentionLockdownTrigger: getMentionLockdownTrigger(),
    mentionLockdownWindowMs: getMentionLockdownWindowMs(),
    maxHeat: getMaxHeat(),
    isAutoLockdownEnabled: () => getAutomodRuntimeConfig()?.autoLockdown?.enabled !== false,
  };
}

async function detectViolations(message?, state?, profile?) {
  return detectViolationsCore(message, state, profile, getDetectViolationDeps());
}

async function runAutoModMessage(message?) {
  ensureAutomodHotSnapshotLoaded();
  const now = nowMs();
  maybeCleanupRuntimeMaps(now);
  if (!message?.guild) return { blocked: false };
  if (message?.id && wasDiscordNativeHandled(message.id)) {
    return { blocked: true, action: "discord_native" };
  }
  if (!isAutomodEnabled()) return { blocked: false, action: "automod_disabled" };
  if (await isVerifiedBotMessage(message)) return { blocked: false };
  if (message.webhookId) {
    if (
      !isMonitorUnwhitelistedWebhooksEnabled() ||
      getAutomodRuntimeConfig()?.heatFilters?.webhookMessages === false
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
      const recentEnough = lastActionTs > 0 && at - lastActionTs <= getAutoTimeoutProfileResetMs();
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
    state.heat = getMaxHeat();
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
    state.heat = getMaxHeat();
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

export = { runAutoModMessage };
