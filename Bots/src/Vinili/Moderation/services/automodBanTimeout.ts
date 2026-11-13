/** Automod: ban e timeout membro. */
const { PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const { isExtraOwner } = require("../../Security/services/securityProfilesService") as typeof import("../../Security/services/securityProfilesService");
const { pickPrimaryAutomodRegolaBucket, getAutomodRegolaSanction, formatRegolaDotFromBucket } = require("../utils/modRegolamentoConstants") as typeof import("../utils/modRegolamentoConstants");
const { nowMs } = require("./automodText") as typeof import("./automodText");
const { DISCORD_TIMEOUT_MAX_MS, getRegolaTimeoutStrikeCount, incrementRegolaTimeoutStrike } = require("./automodBadUser") as typeof import("./automodBadUser");
const { registerAutoModCase, sendAutomodActionInChannel, truncateText } = require("./automodEmbeds") as typeof import("./automodEmbeds");
const { recordAutomodMetric, isAutomodPublicNoticeCooldownClear, touchAutomodPublicNoticeCooldown } = require("./automodActions") as typeof import("./automodActions");
const { sendAutomodLog } = require("./automodDecisions") as typeof import("./automodDecisions");
const { areAutoTimeoutsEnabled, getRegularTimeoutMs, isHeatResetOnPunishment } = require("./automodRuntime") as typeof import("./automodRuntime");
const {
  computeNextAutoTimeoutDuration,
  shouldEscalateNextAutoTimeout,
  registerAutoModTimeoutStrike,
  markBadUserAction,
} = require("./automodBadUserTrack") as typeof import("./automodBadUserTrack");

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
  if (isHeatResetOnPunishment()) {
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

  if (!areAutoTimeoutsEnabled()) return false;
  if (!member.moderatable) return false;
  const me = message.guild.members.me;
  if (!me?.permissions?.has(PermissionsBitField.Flags.ModerateMembers)) {
    return false;
  }
  const regolaLadderMs = regolaSanction?.type === "timeout" ? regolaSanction.ms : 0;
  const preview = computeNextAutoTimeoutDuration(message, nowMs(), { dryRun: true });
  let durationMs = Number(preview.durationMs || getRegularTimeoutMs());
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
  if (isHeatResetOnPunishment()) {
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
  return true;
}

export = { banMemberFromAutomod, timeoutMember };
