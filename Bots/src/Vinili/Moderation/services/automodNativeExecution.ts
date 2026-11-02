/** Automod: esecuzione regole native Discord ([VC]). */
const { getGuildMemberCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { TEXT_RULES, nowMs, trimWindow } = require("./automodText") as typeof import("./automodText");
const { isVerifiedBotMessage } = require("./automodExempt") as typeof import("./automodExempt");
const { PANIC_MODE, getPanicState, registerAutoModCase, sendAutomodActionInChannel, sendPanicModeLog } = require("./automodEmbeds") as typeof import("./automodEmbeds");
const { MENTION_RULES, recordAutomodMetric, isAutomodPublicNoticeCooldownClear, touchAutomodPublicNoticeCooldown, resolveInstantTimeoutOverrideMs } = require("./automodActions") as typeof import("./automodActions");
const { applyProfileHeat, isPanicModeActive } = require("./automodDetect") as typeof import("./automodDetect");
const { isAutomodExemptChannel } = require("../utils/automodChannelExemptions") as typeof import("../utils/automodChannelExemptions");
const { PANIC_TRIGGER_KEYS, ensureAutomodHotSnapshotLoaded, markDiscordNativeHandled, wasDiscordNativeHandled, isRaiderInPanic, registerPanicTrigger, registerGuildInstantSignal, getState, buildMessageFromAutomodExecution } = require("./automodNative") as typeof import("./automodNative");
const { sendAutomodLog } = require("./automodDecisions") as typeof import("./automodDecisions");
const {
  isDiscordNativeAutomodEnabled,
  isAutomodEnabled,
  getMaxHeat,
  getAutoTimeoutProfileResetMs,
} = require("./automodRuntime") as typeof import("./automodRuntime");
const { percentToHeat, applyHeatFactor, isExempt, getProfileConfig, decayHeat } = require("./automodHeat") as typeof import("./automodHeat");
const { getBadUserProfile, markBadUserTrigger, markBadUserAction } = require("./automodBadUserTrack") as typeof import("./automodBadUserTrack");
const { timeoutMember } = require("./automodBanTimeout") as typeof import("./automodBanTimeout");

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
  return getMaxHeat();
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
  if (!isAutomodEnabled()) return { handled: false, action: "automod_disabled" };
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
        lastActionTs > 0 && at - lastActionTs <= getAutoTimeoutProfileResetMs();
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

  state.heat = getMaxHeat();
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

export = { runDiscordNativeAutomodExecution };
