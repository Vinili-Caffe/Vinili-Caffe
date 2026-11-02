/** Resoconti settimanali: creazione/relink auto-val e applicazione limiti/sanzioni. */
const { ensureStaff, getOrCreateStaffDoc } = require("../../Utils/Staff/staffDocUtils") as typeof import("../../Utils/Staff/staffDocUtils");
const { ensureStaffProfileDoc, getStaffDoc, valutazionePositiveAddCore, valutazioneNegativeAddCore } = require("../../Utils/Staff/valutazionePanelActions") as typeof import("../../Utils/Staff/valutazionePanelActions");
const { STAFF_ACTIVITY_LIMITS, evaluateStaffWeeklyLimitsWithSwap, evaluateStaffWeeklyLimitsAtMultiplier, STAFF_SANCTION_LIMITS, toSafeNumber } = require("./resocontoLimits") as typeof import("./resocontoLimits");
const { overviewLooksLikeEmptyFallback } = require("./resocontoActivity") as typeof import("./resocontoActivity");
const { hadPauseAtLeastOneDayDuringWeek, hydrateStaffPausesFromWorkflowIfMissing } = require("./resocontoPauses") as typeof import("./resocontoPauses");
const { findAutoValutazioneEntry } = require("./resocontoGrades") as typeof import("./resocontoGrades");
const { STAFF_LIMITS_POSITIVE_MULTIPLIER, findLogForReasonNeedlesSince, getResocontoCycleMessagesSince } = require("./resocontoAutoValShared") as typeof import("./resocontoAutoValShared");
const { parseResocontoReviewerTaskKey, hasResocontoReviewerTaskAutoEntry, classifyResocontoReviewerAutoEntry, staffHasResocontoCompitoClaim, rememberResocontoCompitoClaim } = require("./resocontoAutoValReviewer") as typeof import("./resocontoAutoValReviewer");

function resocontoAutoActor(guild?) {
  return { user: guild?.client?.user || { username: "Automazione Resoconti" }, member: null };
}

const autoValutazioneInFlight = new Map();

function autoValutazioneLockKey(guildId?, userId?, key?) {
  return `${String(guildId || "")}:${String(userId || "")}:${String(key || "")}`;
}

async function withAutoValutazioneLock(lockKey?, fn?) {
  while (autoValutazioneInFlight.has(lockKey)) {
    await autoValutazioneInFlight.get(lockKey);
  }
  let release = () => {};
  const gate = new Promise((resolve?) => {
    release = (resolve as any);
  });
  autoValutazioneInFlight.set(lockKey, gate);
  try {
    return await fn();
  } finally {
    autoValutazioneInFlight.delete(lockKey);
    release();
  }
}

async function relinkScopedAutoValutazione(profileDoc?, staff?, keyStr?, reason?, type?, log?) {
  if (!profileDoc || !staff || !log) return null;
  if (!Array.isArray(staff.autoValutazioni)) staff.autoValutazioni = [];
  if (findAutoValutazioneEntry(staff, keyStr)) {
    return { ok: true, skipped: "exists", relinked: true };
  }
  staff.autoValutazioni.push({
    key: String(keyStr),
    type: String(type || "positive"),
    reason: String(reason || ""),
    channelId: String(log.channelId || ""),
    messageId: String(log.messageId || ""),
    createdAt: log.createdAt || new Date(),
    updatedAt: new Date(),
  });
  profileDoc.markModified("staff");
  await profileDoc.save();
  return { ok: true, skipped: "relinked", relinked: true };
}

async function ensureWeeklyLimitAutoValutazione({ guild, member, key, type, reason, force = false, equivalentReasonNeedles = null }) {
  if (!guild || !member?.user || !key || !type) return { ok: false };
  const keyStr = String(key || "");
  const lockKey = autoValutazioneLockKey(guild.id, member.id, keyStr);
  return withAutoValutazioneLock(lockKey, async () => {
  const { resolveStaffValutazioniChannel } = require("../../Utils/Staff/staffChannelUtils") as typeof import("../../Utils/Staff/staffChannelUtils");
  const channel = await resolveStaffValutazioniChannel(guild, guild.client);
  
  let profileDoc = await ensureStaffProfileDoc(
    await getStaffDoc(guild.id, member.id),
    guild.id,
    member.id,
  );
  let staff = ensureStaff(profileDoc);
  if (!staff) return { ok: false, skipped: "no_staff_doc" };
  if (!Array.isArray(staff.autoValutazioni)) staff.autoValutazioni = [];
  const weeklyLimitReasons = Array.isArray(equivalentReasonNeedles)
    ? equivalentReasonNeedles
    : type === "negative"
      ? ["limiti settimanali non raggiunti", "limiti settimanali non rispettati"]
      : ["limiti settimanali completati", "limiti settimanali rispettati", "limiti settimanali superati almeno del doppio"];
  const isWeeklyLimitsKey = keyStr.startsWith("weekly_limits:");
  const isWeeklySanzioniKey = keyStr.startsWith("weekly_sanzioni:");
  const isResocontoReviewerKey = keyStr.startsWith("resoconto_reviewer_task:");
  const isWeeklyScopedKey = isWeeklyLimitsKey || isWeeklySanzioniKey || isResocontoReviewerKey;

  if (isResocontoReviewerKey && !force) {
    const parsedClaim = parseResocontoReviewerTaskKey(keyStr);
    if (
      parsedClaim &&
      staffHasResocontoCompitoClaim(staff, parsedClaim.weekKey, parsedClaim.segment, parsedClaim.userId)
    ) {
      return { ok: true, skipped: "compito_claim" };
    }
  }

  if ((isWeeklyLimitsKey || isWeeklySanzioniKey) && !force) {
            const existingWeekly = findAutoValutazioneEntry(staff, keyStr);
    if (existingWeekly) {
      if (existingWeekly.spentByTrade) {
        return { ok: true, skipped: "spent_by_trade" };
      }
      return { ok: true, skipped: "exists" };
    }
    const since = getResocontoCycleMessagesSince();
    const linked = findLogForReasonNeedlesSince(staff, weeklyLimitReasons, type, since, {
      unlinkedOnly: true,
    });
    if (linked?.log) {
      const logReason = String(linked.log?.reason || linked.reason || "").toLowerCase();
      const reasonMatchesLog = weeklyLimitReasons.some((needle?) => logReason.includes(needle));
      if (reasonMatchesLog) {
        const relinked = await relinkScopedAutoValutazione(
          profileDoc,
          staff,
          keyStr,
          linked.reason || String(reason || ""),
          type,
          linked.log,
        );
        if (relinked) return relinked;
      }
    }
  }

  if (!isWeeklyScopedKey) {
    const reasonList = type === "negative" ? staff.negativeReasons : staff.positiveReasons;
    const alreadyHasEquivalentWeeklyLimitValutazione =
      weeklyLimitReasons.length > 0 &&
      Array.isArray(reasonList) &&
      reasonList.some((entry?) => {
        const normalized = String(entry || "").toLowerCase();
        return weeklyLimitReasons.some((needle?) => normalized.includes(needle));
      });
    if (alreadyHasEquivalentWeeklyLimitValutazione) {
      return { ok: true, skipped: "equivalent_exists" };
    }
  }
  let existing = findAutoValutazioneEntry(staff, keyStr);
  if (existing?.spentByTrade && !force) {
    if (isResocontoReviewerKey) {
      const parsed = parseResocontoReviewerTaskKey(keyStr);
      if (parsed && rememberResocontoCompitoClaim(staff, parsed.weekKey, parsed.segment, parsed.userId)) {
        profileDoc.markModified("staff");
        await profileDoc.save();
      }
    }
    return { ok: true, skipped: "spent_by_trade" };
  }
  if (existing && !force && isResocontoReviewerKey) {
    const claim = await classifyResocontoReviewerAutoEntry(
      guild,
      existing,
      String(reason || ""),
    );
    if (claim === "active" || claim === "spent") {
      const parsed = parseResocontoReviewerTaskKey(keyStr);
      if (claim === "spent") {
        existing.spentByTrade = true;
        existing.spentAt = existing.spentAt || new Date();
        existing.spentReason = existing.spentReason || "claim_preserved_after_message_change";
        existing.updatedAt = new Date();
      }
      if (parsed) rememberResocontoCompitoClaim(staff, parsed.weekKey, parsed.segment, parsed.userId);
      profileDoc.markModified("staff");
      await profileDoc.save();
      return { ok: true, skipped: claim === "spent" ? "spent_by_trade" : "exists" };
    }
        staff.autoValutazioni = staff.autoValutazioni.filter(
      (entry?) => String(entry?.key || "") !== keyStr,
    );
    profileDoc.markModified("staff");
    await profileDoc.save();
    existing = null;
  }
  if (existing && !force) return { ok: true, skipped: "exists" };
  if (keyStr.startsWith("resoconto_reviewer_task:")) {
    const parsed = parseResocontoReviewerTaskKey(keyStr);
    if (parsed && hasResocontoReviewerTaskAutoEntry(staff, { ...parsed, type, reason }) && !force) {
      const existingReviewer = findAutoValutazioneEntry(staff, keyStr);
      if (existingReviewer?.spentByTrade) {
        if (rememberResocontoCompitoClaim(staff, parsed.weekKey, parsed.segment, parsed.userId)) {
          profileDoc.markModified("staff");
          await profileDoc.save();
        }
        return { ok: true, skipped: "spent_by_trade" };
      }
      const claim = await classifyResocontoReviewerAutoEntry(
        guild,
        existingReviewer,
        String(reason || ""),
      );
      if (claim === "active" || claim === "spent") {
        if (claim === "spent" && existingReviewer) {
          existingReviewer.spentByTrade = true;
          existingReviewer.spentAt = existingReviewer.spentAt || new Date();
          existingReviewer.updatedAt = new Date();
        }
        rememberResocontoCompitoClaim(staff, parsed.weekKey, parsed.segment, parsed.userId);
        profileDoc.markModified("staff");
        await profileDoc.save();
        return { ok: true, skipped: claim === "spent" ? "spent_by_trade" : "exists" };
      }
      staff.autoValutazioni = staff.autoValutazioni.filter(
        (entry?) => String(entry?.key || "") !== keyStr,
      );
      profileDoc.markModified("staff");
      await profileDoc.save();
    }
  }
  if (existing && force) {
    staff.autoValutazioni = staff.autoValutazioni.filter((entry?) => String(entry?.key || "") !== keyStr);
    profileDoc.markModified("staff");
  }

  profileDoc = await ensureStaffProfileDoc(
    await getStaffDoc(guild.id, member.id),
    guild.id,
    member.id,
  );
  staff = ensureStaff(profileDoc);
  if (!staff) return { ok: false, skipped: "no_staff_doc" };
  existing = findAutoValutazioneEntry(staff, keyStr);
  if (existing?.spentByTrade && !force) return { ok: true, skipped: "spent_by_trade" };
  if (existing && !force) return { ok: true, skipped: "exists" };

  const actor = resocontoAutoActor(guild);
  const result = type === "negative"
    ? await valutazioneNegativeAddCore(guild, profileDoc, member.user, reason, actor, channel)
    : await valutazionePositiveAddCore(profileDoc, member.user, reason, actor, channel);

  if (!result?.ok && !result?.message) {
    return { ok: false, skipped: "valutazione_post_failed" };
  }

  profileDoc = await getOrCreateStaffDoc(guild.id, member.id);
  if (!profileDoc) return { ok: false, skipped: "no_profile" };
  const freshStaff = ensureStaff(profileDoc);
  if (!Array.isArray(freshStaff.autoValutazioni)) freshStaff.autoValutazioni = [];
  if (findAutoValutazioneEntry(freshStaff, keyStr) && !force) {
    return { ok: true, skipped: "exists" };
  }
  freshStaff.autoValutazioni = freshStaff.autoValutazioni.filter(
    (entry?) => String(entry?.key || "") !== keyStr,
  );
  freshStaff.autoValutazioni.push({
    key: keyStr,
    type: String(type),
    reason: String(reason || ""),
    channelId: channel?.id ? String(channel.id) : null,
    messageId: result?.message?.id ? String(result.message.id) : null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  if (isResocontoReviewerKey) {
    const parsed = parseResocontoReviewerTaskKey(keyStr);
    if (parsed) {
      rememberResocontoCompitoClaim(freshStaff, parsed.weekKey, parsed.segment, parsed.userId);
    }
  }
  profileDoc.markModified("staff");
  await profileDoc.save();
  return { ok: true, created: true, reviewerId: String(member.id || "") };
  });
}

async function applyWeeklyStaffAutoValutazioniForMember({
  guild,
  member,
  staffDoc,
  staffRoleId,
  overview,
  resocontoWeekKey,
  sanctionCountByModId,
  graceNewStaffRole,
  weekStart,
  weekEnd,
  force = false,
  skipLimitAutovalutazione = false,
  skipSanctionAutovalutazione = false,
}) {
  const userId = String(member?.id || "");
  const limits = STAFF_ACTIVITY_LIMITS[String(staffRoleId)];
  const overviewUnavailable = overviewLooksLikeEmptyFallback(overview);
  const canEvaluateWeeklyLimits =
    Boolean(limits) && !graceNewStaffRole && !overviewUnavailable;

  const d7 = overview?.windows?.d7;
  const weeklyMessages = Math.max(0, Math.floor(toSafeNumber(d7?.text ?? 0)));
  const weeklyVoiceSeconds = Math.max(0, Math.floor(toSafeNumber(d7?.voiceSeconds ?? 0)));
  const weeklyVoiceHours = weeklyVoiceSeconds / 3600;
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
  const tripleLimitsEvaluation = limits
    ? evaluateStaffWeeklyLimitsAtMultiplier(weeklyMessages, weeklyVoiceHours, limits, 3)
    : null;
  const reachedWeeklyLimits = Boolean(canEvaluateWeeklyLimits && limitsEvaluation?.reached);
  const reachedDoubleWeeklyLimits = Boolean(
    canEvaluateWeeklyLimits && doubleLimitsEvaluation?.reached,
  );
  const reachedTripleWeeklyLimits = Boolean(
    canEvaluateWeeklyLimits && tripleLimitsEvaluation?.reached,
  );
    await hydrateStaffPausesFromWorkflowIfMissing(guild?.id, userId, staffDoc).catch(() => null);
  const inPauseAtLeastOneDay = hadPauseAtLeastOneDayDuringWeek(
    staffDoc,
    weekStart,
    weekEnd,
    "Staff",
  );

  let limitsResult: Record<string, any> = { ok: true, skipped: skipLimitAutovalutazione ? "skip_context" : "ineligible" };
  if (canEvaluateWeeklyLimits && !skipLimitAutovalutazione) {
            const shouldApplyPositive =
      reachedDoubleWeeklyLimits && !inPauseAtLeastOneDay && !graceNewStaffRole;
    const shouldApplyNegative =
      !reachedWeeklyLimits && !inPauseAtLeastOneDay && !graceNewStaffRole;
    limitsResult = {
      ok: true,
      skipped: inPauseAtLeastOneDay ? "pause_week" : "ineligible",
    };
    if (shouldApplyPositive) {
      limitsResult = await ensureWeeklyLimitAutoValutazione({
        guild,
        member,
        key: `weekly_limits:${resocontoWeekKey}:${staffRoleId}`,
        type: "positive",
        reason: "Limiti settimanali superati almeno del doppio.",
        equivalentReasonNeedles: [
          "limiti settimanali superati almeno del doppio",
        ],
        force,
      }).catch((err?) => {
        global.logger?.warn?.(
          "[WEEKLY STAFF RESOCONTO] weekly limit valutazione failed:",
          userId,
          err?.message || err,
        );
        return { ok: false };
      });
    } else if (shouldApplyNegative) {
      limitsResult = await ensureWeeklyLimitAutoValutazione({
        guild,
        member,
        key: `weekly_limits:${resocontoWeekKey}:${staffRoleId}`,
        type: "negative",
        reason: "Limiti settimanali non raggiunti.",
        force,
      }).catch((err?) => {
        global.logger?.warn?.(
          "[WEEKLY STAFF RESOCONTO] weekly limit valutazione failed:",
          userId,
          err?.message || err,
        );
        return { ok: false };
      });
    } else if (!reachedWeeklyLimits && graceNewStaffRole) {
      limitsResult = { ok: true, skipped: "grace_new_role" };
    } else if (reachedWeeklyLimits && !reachedDoubleWeeklyLimits) {
      limitsResult = { ok: true, skipped: "below_double_limits" };
    }
  }

  let sanctionsResult = null;
  const sanctionLimit = STAFF_SANCTION_LIMITS[String(staffRoleId)];
  const weeklySanctions = sanctionCountByModId?.get?.(userId) || 0;
  const metWeeklySanctionLimit =
    sanctionLimit != null && weeklySanctions >= sanctionLimit;
  if (metWeeklySanctionLimit && !skipSanctionAutovalutazione && !graceNewStaffRole) {
    sanctionsResult = await ensureWeeklyLimitAutoValutazione({
      guild,
      member,
      key: `weekly_sanzioni:${resocontoWeekKey}:${staffRoleId}`,
      type: "positive",
      reason: "Compito sanzioni completato.",
      equivalentReasonNeedles: ["compito sanzioni completato"],
      force,
    }).catch((err?) => {
      global.logger?.warn?.(
        "[WEEKLY STAFF RESOCONTO] weekly sanctions valutazione failed:",
        userId,
        err?.message || err,
      );
      return { ok: false };
    });
  } else if (graceNewStaffRole && metWeeklySanctionLimit) {
    sanctionsResult = { ok: true, skipped: "grace_new_role" };
  }

  if (reachedTripleWeeklyLimits && !inPauseAtLeastOneDay && guild?.id && userId) {
    try {
      const { tryAutoSubmitCompito } = require("../../site/staff/siteStaffCompitiAutoComplete") as typeof import("../../site/staff/siteStaffCompitiAutoComplete");
      await tryAutoSubmitCompito(global.botClient || guild?.client, {
        guildId: guild.id,
        userId,
        taskId: "limits_triple",
        evidence: `Limiti ×3 raggiunti (${weeklyMessages} msg / ${weeklyVoiceHours.toFixed(1)}h) · ${resocontoWeekKey}`,
      });
    } catch (err) {
      global.logger?.warn?.("[WEEKLY STAFF RESOCONTO] compiti limits_triple:", err?.message || err);
    }
  }

  return {
    limits: Boolean(limitsResult?.created),
    sanctions: Boolean(sanctionsResult?.created),
    skippedLimits: limitsResult?.skipped || null,
    skippedSanctions: sanctionsResult?.skipped || null,
  };
}

export = { ensureWeeklyLimitAutoValutazione, applyWeeklyStaffAutoValutazioniForMember };
