const cron = require("node-cron") as typeof import("node-cron");
const { getBotState, setBotState } = require("../../../shared/botState/botStateStore") as typeof import("../../../shared/botState/botStateStore");
const IDs: any = require("../../Config/ids") as typeof import("../../Config/ids");
const { getUserOverviewStats } = require("../../Community/services/activityService") as typeof import("../../Community/services/activityService");
const { getGuildMemberCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { ensureStaff } = require("../../Staff/utils/staffDocUtils") as typeof import("../../Staff/utils/staffDocUtils");
const { ensureStaffProfileDoc, getStaffDoc } = require("../../Staff/utils/valutazionePanelActions") as typeof import("../../Staff/utils/valutazionePanelActions");
const { STAFF_ACTIVITY_LIMITS, STAFF_LIMITS_MSG_PER_HOUR_SWAP, evaluateStaffWeeklyLimitsWithSwap, evaluateStaffWeeklyLimitsAtMultiplier, STAFF_SANCTION_LIMITS, toSafeNumber } = require("./resocontoLimits") as typeof import("./resocontoLimits");
const { TIME_ZONE, getRomeDateParts, parseRomeWallClock, getPartnerLeaderboardWeekBoundsUtc, getCurrentResocontoPexWeekWindowUtc, getPmResocontoWindow, getStaffResocontoEvaluationWindow, resolveResocontoWeekKey, getResocontoWeekRangeFromWeekKey } = require("./resocontoTime") as typeof import("./resocontoTime");
const { collectResocontoVoiceExcludeIds, buildResocontoOverviewOptions, overviewLooksLikeEmptyFallback, serializeCostanzaChart } = require("./resocontoActivity") as typeof import("./resocontoActivity");
const { getStaffPauseLine, hadPauseAtLeastOneDayDuringWeek, didPauseEndDuringWeek } = require("./resocontoPauses") as typeof import("./resocontoPauses");
const { resolveStaffRole, wasPexedInWeek, wasFirstStaffPromotionFromMemberInWindow } = require("./resocontoMembers") as typeof import("./resocontoMembers");
const { computeActivityGrade, computeBehaviorGrade, buildStaffResocontoAzioneDisplay } = require("./resocontoGrades") as typeof import("./resocontoGrades");
const { STAFF_LIMITS_POSITIVE_MULTIPLIER, shouldSkipManualResocontoVp, shouldSkipManualResocontoVn, classifyResocontoReviewerAutoEntry, staffHasResocontoCompitoClaim, rememberResocontoCompitoClaim, ensureWeeklyLimitAutoValutazione, getResocontoCycleWeekKey, getResocontoCycleMessagesSince } = require("./resocontoAutoValutazioni") as typeof import("./resocontoAutoValutazioni");
const { getWeeklySanctionCountByMod } = require("./resocontoMessages") as typeof import("./resocontoMessages");
const { runWeeklyStaffResocontoSegment } = require("./resocontoSegment") as typeof import("./resocontoSegment");
const { runWeeklyLimitAutoValutazioniCatchupSegment } = require("./resocontoCatchup") as typeof import("./resocontoCatchup");
const RESOCONTO_CRON_EXPRESSION = "0 15 * * 0";
const RESOCONTO_SUNDAY_SEGMENTS = ["pm", "helper", "mod", "senior_moderator", "director"];
const STAFF_RESOCONTO_SEGMENTS = ["helper", "mod", "senior_moderator", "director"];
const RESOCONTO_CRON_SEGMENTS = RESOCONTO_SUNDAY_SEGMENTS.map((segment?) => ({
  segment,
  expression: RESOCONTO_CRON_EXPRESSION,
}));
let weeklyStaffResocontoTasks = [];

async function runWeeklyStaffResoconti(client?, opts: Record<string, any> = {}) {
  const seg = opts.segment;
  if (seg && seg !== "all") {
    await runWeeklyStaffResocontoSegment(client, seg, opts);
    return;
  }
  for (const s of RESOCONTO_SUNDAY_SEGMENTS) {
    await runWeeklyStaffResocontoSegment(client, s, opts);
  }
}

function getPassedStaffResocontoSegments(now = new Date()) {
  const r = parseRomeWallClock(now);
  if (r.weekday !== "Sun") return [];
  const currentMinutes = Number(r.hour || 0) * 60 + Number(r.minute || 0);
  if (currentMinutes < 15 * 60) return [];
  return [...STAFF_RESOCONTO_SEGMENTS];
}

async function runSameDayWeeklyLimitAutoValutazioniRecovery(client?) {
  const now = new Date();
  const r = parseRomeWallClock(now);
  if (r.weekday !== "Sun") return;
  const currentMinutes = Number(r.hour || 0) * 60 + Number(r.minute || 0);
    if (currentMinutes < 15 * 60) return;
  for (const segment of STAFF_RESOCONTO_SEGMENTS) {
    await runWeeklyLimitAutoValutazioniCatchupSegment(client, segment, now)
      .catch((err?) => {
        global.logger?.error?.(`[WEEKLY STAFF RESOCONTO] Same-day recovery failed (${segment}):`, err);
        return null;
      });
  }
}

async function runSameDayStaffResocontoRecovery(client?) {
  const now = new Date();
  const segments = getPassedStaffResocontoSegments(now);
  if (!segments.length) return;
  const guildId = String(IDs.guilds?.main || "");
  const pexSkipWindow = getCurrentResocontoPexWeekWindowUtc(now);
  const closingPartsForResocontoKey = getRomeDateParts(pexSkipWindow.windowEndExclusive);
  const resocontoWeekKey = `${closingPartsForResocontoKey.year}-${String(closingPartsForResocontoKey.month).padStart(2, "0")}-${String(closingPartsForResocontoKey.day).padStart(2, "0")}`;
  const recoveryKey = `staffResocontoSameDayRecovery:${guildId}:${resocontoWeekKey}`;
  const recoveryState = await getBotState(recoveryKey, { done: false });
  if (recoveryState?.done) return;
  for (const segment of segments) {
    await runWeeklyStaffResocontoSegment(client, segment, { recovery: true })
      .catch((err?) => {
        global.logger?.error?.(`[WEEKLY STAFF RESOCONTO] Same-day staff recovery failed (${segment}):`, err);
        return null;
      });
  }
  await setBotState(recoveryKey, { done: true, at: Date.now() });
}

function hasPassedPmResocontoTime(now = new Date()) {
  const r = parseRomeWallClock(now);
  if (r.weekday !== "Sun") return false;
  const currentMinutes = Number(r.hour || 0) * 60 + Number(r.minute || 0);
  return currentMinutes >= 15 * 60;
}

async function runSameDayPmResocontoRecovery(client?) {
  const now = new Date();
  if (!hasPassedPmResocontoTime(now)) return;
  const guildId = String(IDs.guilds?.main || "");
  const pexSkipWindow = getCurrentResocontoPexWeekWindowUtc(now);
  const closingPartsForResocontoKey = getRomeDateParts(pexSkipWindow.windowEndExclusive);
  const resocontoWeekKey = `${closingPartsForResocontoKey.year}-${String(closingPartsForResocontoKey.month).padStart(2, "0")}-${String(closingPartsForResocontoKey.day).padStart(2, "0")}`;
  const recoveryKey = `pmResocontoSameDayRecovery:${guildId}:${resocontoWeekKey}`;
  const recoveryState = await getBotState(recoveryKey, { done: false });
  if (recoveryState?.done) return;
  await runWeeklyStaffResocontoSegment(client, "pm", { recovery: true });
  await setBotState(recoveryKey, { done: true, at: Date.now() });
}

function startWeeklyStaffResocontoLoop(client?) {
  if (weeklyStaffResocontoTasks.length) return weeklyStaffResocontoTasks[0];

  const task = cron.schedule(
    RESOCONTO_CRON_EXPRESSION,
    () => {
      void runWeeklyStaffResoconti(client).catch((err?) => {
        global.logger?.error?.("[WEEKLY STAFF RESOCONTO] Execution failed (sunday 15:00 batch)", err);
      });
    },
    { timezone: TIME_ZONE, noOverlap: true },
  );
  weeklyStaffResocontoTasks.push(task);

  setTimeout(() => {
    runSameDayPmResocontoRecovery(client).catch((err?) => {
      global.logger?.error?.("[WEEKLY STAFF RESOCONTO] Same-day PM recovery failed:", err);
    });
  }, 45_000).unref?.();

  setTimeout(() => {
    runSameDayStaffResocontoRecovery(client).catch((err?) => {
      global.logger?.error?.("[WEEKLY STAFF RESOCONTO] Same-day staff recovery failed:", err);
    });
  }, 55_000).unref?.();

  setTimeout(() => {
    runSameDayWeeklyLimitAutoValutazioniRecovery(client).catch((err?) => {
      global.logger?.error?.("[WEEKLY STAFF RESOCONTO] Same-day recovery failed:", err);
    });
  }, 75_000).unref?.();

  const { startResocontoReviewerRewardRecoveryLoop } = require("./resocontoReviewerRewardService") as typeof import("./resocontoReviewerRewardService");
  startResocontoReviewerRewardRecoveryLoop(client);

  return weeklyStaffResocontoTasks[0];
}

async function buildStaffResocontoApplyPlanForMember(guild?, userId?, staffRoleId?) {
  const member = await getGuildMemberCached(guild, userId).catch(() => null);
  if (!member || !staffRoleId) {
    return { display: "Nulla", actionKey: "nl", isNulla: true, pendingManualActions: [] };
  }

  const now = new Date();
  const { weekStart, weekEnd } = getPmResocontoWindow(now);
  const pexSkipWindow = getCurrentResocontoPexWeekWindowUtc(now);
  const resocontoWeekKey = resolveResocontoWeekKey(now);

  const profileDoc = await ensureStaffProfileDoc(await getStaffDoc(guild.id, userId), guild.id, userId);
  const staffDoc = ensureStaff(profileDoc);
  const graceNewStaffRole = wasFirstStaffPromotionFromMemberInWindow(
    staffDoc,
    staffRoleId,
    pexSkipWindow.windowStart,
    pexSkipWindow.windowEndExclusive,
  );

  const resocontoScope = buildResocontoOverviewOptions(guild, now);
  const resocontoVoiceExclude = collectResocontoVoiceExcludeIds(guild);
  const overview = await getUserOverviewStats(
    guild.id,
    userId,
    7,
    resocontoVoiceExclude.size > 0 ? resocontoVoiceExclude : null,
    resocontoScope,
  ).catch(() => null);
  const overviewUnavailable = overviewLooksLikeEmptyFallback(overview);
  const d7 = overview?.windows?.d7;
  const weeklyMessages = Math.max(0, Math.floor(toSafeNumber(d7?.text ?? 0)));
  const weeklyVoiceSeconds = Math.max(0, Math.floor(toSafeNumber(d7?.voiceSeconds ?? 0)));
  const weeklyVoiceHours = weeklyVoiceSeconds / 3600;
  const limits = STAFF_ACTIVITY_LIMITS[String(staffRoleId)];
  const canEvaluateWeeklyLimits =
    Boolean(limits) && !graceNewStaffRole && !overviewUnavailable;
  const limitsEvaluation = limits
    ? evaluateStaffWeeklyLimitsWithSwap(weeklyMessages, weeklyVoiceHours, limits)
    : null;
  const doubleLimitsEvaluation = limits
    ? evaluateStaffWeeklyLimitsAtMultiplier(
        weeklyMessages,
        weeklyVoiceHours,
        limits,
        STAFF_LIMITS_POSITIVE_MULTIPLIER,
      )
    : null;
  const reachedWeeklyLimits = Boolean(canEvaluateWeeklyLimits && limitsEvaluation?.reached);
  const reachedDoubleWeeklyLimits = Boolean(
    canEvaluateWeeklyLimits && doubleLimitsEvaluation?.reached,
  );
  const activityGrade = overviewUnavailable
    ? "Non disponibile"
    : computeActivityGrade(staffRoleId, weeklyMessages, weeklyVoiceHours);
  const behaviorGrade = computeBehaviorGrade(staffDoc?.positiveCount, staffDoc?.negativeCount);
  const endedPauseDuringWeek = didPauseEndDuringWeek(staffDoc, weekStart, weekEnd, "Staff");
  const inPauseDuringWeek = hadPauseAtLeastOneDayDuringWeek(staffDoc, weekStart, weekEnd, "Staff");
  const currentlyInPause = Boolean(getStaffPauseLine(staffDoc, "Staff")?.includes("**In pausa**"));
  const sanctionLimit = STAFF_SANCTION_LIMITS[String(staffRoleId)];
  const sanctionCountByModId = await getWeeklySanctionCountByMod(guild.id, weekStart, weekEnd);
  const weeklySanctions = sanctionLimit != null ? sanctionCountByModId.get(String(userId)) || 0 : 0;
  const metWeeklySanctionLimit = sanctionLimit != null && weeklySanctions >= sanctionLimit;

  const pexedInWeek = wasPexedInWeek(staffDoc, weekStart);
  return buildStaffResocontoAzioneDisplay({
    staffDoc,
    staffRoleId,
    resocontoWeekKey,
    graceNewStaffRole,
    overviewUnavailable,
    inPauseDuringWeek,
    currentlyInPause,
    endedPauseDuringWeek,
    activityGrade,
    behaviorGrade,
    reachedWeeklyLimits,
    reachedDoubleWeeklyLimits,
    canEvaluateWeeklyLimits,
    metWeeklySanctionLimit,
    pexedInWeek,
    member,
  });
}

export = {
  startWeeklyStaffResocontoLoop,
  getPartnerLeaderboardWeekBoundsUtc,
  getCurrentResocontoPexWeekWindowUtc,
  wasFirstStaffPromotionFromMemberInWindow,
  getStaffResocontoEvaluationWindow,
  getWeeklySanctionCountByMod,
  resolveStaffRole,
  getResocontoCycleWeekKey,
  getResocontoCycleMessagesSince,
  classifyResocontoReviewerAutoEntry,
  staffHasResocontoCompitoClaim,
  rememberResocontoCompitoClaim,
  buildStaffResocontoApplyPlanForMember,
  shouldSkipManualResocontoVp,
  shouldSkipManualResocontoVn,
  resolveResocontoWeekKey,
  getResocontoWeekRangeFromWeekKey,
  serializeCostanzaChart,
  collectResocontoVoiceExcludeIds,
  buildResocontoOverviewOptions,
  ensureWeeklyLimitAutoValutazione,
  STAFF_ACTIVITY_LIMITS,
  STAFF_LIMITS_MSG_PER_HOUR_SWAP,
  STAFF_LIMITS_POSITIVE_MULTIPLIER,
  evaluateStaffWeeklyLimitsWithSwap,
  evaluateStaffWeeklyLimitsAtMultiplier,
  STAFF_SANCTION_LIMITS,
};