/** Resoconti settimanali: invio resoconto staff per un membro. */
const { ensureStaff } = require("../../Utils/Staff/staffDocUtils") as typeof import("../../Utils/Staff/staffDocUtils");
const { getStaffDoc } = require("../../Utils/Staff/valutazionePanelActions") as typeof import("../../Utils/Staff/valutazionePanelActions");
const { STAFF_NEW_EMOJI } = require("../../Utils/Community/staffListUtils") as typeof import("../../Utils/Community/staffListUtils");
const { getStaffRoleEmojiByRoleId } = require("../../Utils/Community/staffRoleEmoji") as typeof import("../../Utils/Community/staffRoleEmoji");
const { STAFF_ACTIVITY_LIMITS, evaluateStaffWeeklyLimitsWithSwap, evaluateStaffWeeklyLimitsAtMultiplier, formatStaffLimitsSwapLine, STAFF_SANCTION_LIMITS, toSafeNumber, formatHoursFromSeconds } = require("./resocontoLimits") as typeof import("./resocontoLimits");
const { buildCostanzaLines, overviewLooksLikeEmptyFallback, serializeCostanzaChart } = require("./resocontoActivity") as typeof import("./resocontoActivity");
const { getStaffPauseLine, hadPauseAtLeastOneDayDuringWeek, didPauseEndDuringWeek } = require("./resocontoPauses") as typeof import("./resocontoPauses");
const { wasPexedInWeek } = require("./resocontoMembers") as typeof import("./resocontoMembers");
const { computeActivityGrade, computeBehaviorGrade, buildStaffResocontoAzioneDisplay } = require("./resocontoGrades") as typeof import("./resocontoGrades");
const { STAFF_LIMITS_POSITIVE_MULTIPLIER, shouldSkipLimitAutovalutazioniForStaffMember, shouldSkipSanctionAutovalutazioniForStaffMember, applyWeeklyStaffAutoValutazioniForMember } = require("./resocontoAutoValutazioni") as typeof import("./resocontoAutoValutazioni");
const { appendStaffResocontoPostedId, appendStaffResocontoPostedRoleId, hadStaffRoleResocontoPostedThisCycle, hasSiteResocontoThisWeek } = require("./resocontoSegmentPosted") as typeof import("./resocontoSegmentPosted");

async function processStaffResocontoMember({
  member,
  userId,
  staffDoc,
  staffRoleId,
  graceNewStaffRole,
  skipForStaffPexInWindow,
  wasPexedResocontoDay,
  jobsDebug,
  segment,
  forceTarget,
  ignorePostedState,
  guild,
  guildId,
  resocontoWeekKey,
  staffResocontoPostedIds,
  overviewMap,
  sanctionCountByModId,
  weekStart,
  weekEnd,
  newSiteWorkflowMessageId,
}) {
  let nextStaffDoc = staffDoc;
  const alreadyHadStaffResocontoThisCycle =
    !forceTarget &&
    !ignorePostedState &&
    staffRoleId &&
    (
      hadStaffRoleResocontoPostedThisCycle(staffResocontoPostedIds, staffRoleId, userId) ||
      (await hasSiteResocontoThisWeek(guildId, resocontoWeekKey, userId, "s"))
    );
  const shouldSkipStaffResoconto =
    wasPexedResocontoDay || alreadyHadStaffResocontoThisCycle;
  const skipLimitAutovalutazione = shouldSkipLimitAutovalutazioniForStaffMember({
    graceNewStaffRole,
    wasPexedResocontoDay,
  });
  const skipSanctionAutovalutazione = shouldSkipSanctionAutovalutazioniForStaffMember({
    graceNewStaffRole,
    wasPexedResocontoDay,
  });
  const result = {
    sent: 0,
    completed: alreadyHadStaffResocontoThisCycle ? 1 : 0,
    alreadyPosted: alreadyHadStaffResocontoThisCycle ? 1 : 0,
    pexWindow: wasPexedResocontoDay ? 1 : 0,
    sendFailed: 0,
    staffDoc: nextStaffDoc,
  };
  if (skipForStaffPexInWindow && jobsDebug) {
    global.logger?.info?.(`[WEEKLY STAFF RESOCONTO] Staff pex in calendar week: ${userId} segment=${segment}`);
  }

  if (!shouldSkipStaffResoconto) {
    const overview = overviewMap.get(userId);
    const overviewUnavailable = overviewLooksLikeEmptyFallback(overview);
    if (overviewUnavailable) {
      if (jobsDebug) {
        global.logger?.info?.(`[WEEKLY STAFF RESOCONTO] Staff overview unavailable: ${userId} (${member.user?.tag || member.user?.username || "unknown"}) segment=${segment}`);
      }
    }
    const d7 = overview?.windows?.d7;
    const weeklyMessages = Math.max(0, Math.floor(toSafeNumber(d7?.text ?? 0)),);
    const weeklyVoiceSeconds = Math.max(0, Math.floor(toSafeNumber(d7?.voiceSeconds ?? 0)),);
    const weeklyVoiceHours = weeklyVoiceSeconds / 3600;
    const limits = STAFF_ACTIVITY_LIMITS[String(staffRoleId)];
    const canEvaluateWeeklyLimits =
      Boolean(limits) &&
      !graceNewStaffRole &&
      !overviewUnavailable;
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
    const endedPauseDuringWeek = didPauseEndDuringWeek(staffDoc, weekStart, weekEnd, "Staff");
    const inPauseDuringWeek = hadPauseAtLeastOneDayDuringWeek(staffDoc, weekStart, weekEnd, "Staff");
    const currentlyInPause = Boolean(
      getStaffPauseLine(staffDoc, "Staff")?.includes("**In pausa**"),
    );
    const sanctionLimit = STAFF_SANCTION_LIMITS[String(staffRoleId)];
    const weeklySanctions = sanctionLimit != null ? sanctionCountByModId.get(userId) || 0 : 0;
    const metWeeklySanctionLimit =
      sanctionLimit != null &&
      weeklySanctions >= sanctionLimit;

    if (!skipLimitAutovalutazione || !skipSanctionAutovalutazione) {
      await applyWeeklyStaffAutoValutazioniForMember({
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
        skipLimitAutovalutazione,
        skipSanctionAutovalutazione,
      });
      const refreshedProfile = await getStaffDoc(guild.id, userId);
      if (refreshedProfile) {
        nextStaffDoc = ensureStaff(refreshedProfile);
        staffDoc = nextStaffDoc;
      }
    }

                      const activityGrade = overviewUnavailable
      ? "Non disponibile"
      : computeActivityGrade(staffRoleId, weeklyMessages, weeklyVoiceHours);
    const behaviorGrade = computeBehaviorGrade(staffDoc?.positiveCount, staffDoc?.negativeCount);
    const pexedInWeek = wasPexedInWeek(staffDoc, weekStart);

    const { display: action, actionKey, isNulla } = buildStaffResocontoAzioneDisplay({
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
    const staffNewBadge = isNulla && graceNewStaffRole ? ` ${STAFF_NEW_EMOJI}` : "";

    const staffRoleEmoji = getStaffRoleEmojiByRoleId(staffRoleId);
    const contentLines = [
      `${staffRoleEmoji} **Staffer:** __**<@${userId}>**__${staffNewBadge}`,
      `<:VC_Mention:1482526855289634997> **Ruolo:** __<@&${staffRoleId}>__`,
      `<:VC_Chat:1482532573002465413> **Messaggi in una settimana:** __${weeklyMessages}__`,
      `<:voice:1467639623735054509> **Ore in una settimana:** __${formatHoursFromSeconds(weeklyVoiceSeconds)}__`,
      ...buildCostanzaLines(overview),
      `<a:VC_Exclamation:1482534702077444217>  **Attività:** __${activityGrade}__`,
      `<:VC_Eye:1331619214410383381> **Condotta:** __${behaviorGrade}__`,
    ];
    if (sanctionLimit != null) {
      contentLines.push(`<:VC_Dot:1443660294596329582> **Sanzioni nella settimana:** __${weeklySanctions}__ (minimo __${sanctionLimit}__)`);
    }
    const swapLine = formatStaffLimitsSwapLine(limitsEvaluation);
    if (swapLine) contentLines.push(swapLine);
    if (overviewUnavailable) {
      contentLines.push("<a:VC_Exclamation:1482534702077444217> **Stats attività non disponibili:** controllare manualmente.");
    }
    contentLines.push(`<:VC_BanHammer:1482534474502897795> **Azione:** __${action}__`);
    const pauseLine = getStaffPauseLine(staffDoc, "Staff", member);
    if (pauseLine) contentLines.push(pauseLine);

    const contentBody = contentLines.join("\n");
    let staffMsg = null;
    const siteMessageId = newSiteWorkflowMessageId();
    try {
      const { persistResocontoWorkflowFromPayload } = require("../../site/workflow/siteStaffWorkflowStore") as typeof import("../../site/workflow/siteStaffWorkflowStore");
      await persistResocontoWorkflowFromPayload(guild, {
        messageId: siteMessageId,
        channelId: "site",
        userId,
        kind: "s",
        roleId: staffRoleId,
        actionKey,
        content: contentBody,
        status: "pending",
        createdAt: new Date(),
        weekKey: resocontoWeekKey,
        workflowFields: {
          costanzaChart: serializeCostanzaChart(overview),
          activityGrade,
          behaviorGrade,
          azioneDisplay: action,
          weeklyMessages,
          weeklyVoiceSeconds,
          isNewStaff: Boolean(graceNewStaffRole),
          inPause: Boolean(currentlyInPause || inPauseDuringWeek),
          pauseEnded: Boolean(endedPauseDuringWeek),
          activityLimits: limits
            ? { messages: Number(limits.messages || 0), hours: Number(limits.hours || 0) }
            : null,
          sanctionLimit: sanctionLimit != null ? Number(sanctionLimit) : null,
          weeklySanctions: Number(weeklySanctions) || 0,
        },
      });
      staffMsg = { id: siteMessageId };
    } catch (err) {
      global.logger?.warn?.("[WEEKLY STAFF RESOCONTO] site persist failed:", err?.message || err);
      staffMsg = null;
    }
    if (staffMsg) {
      result.sent += 1;
      result.completed += 1;
      try {
        const { notifyInboxStaffNewItem } = require("../../site/workflow/siteStaffWorkflowNotifications") as typeof import("../../site/workflow/siteStaffWorkflowNotifications");
        const subjectName = String(member?.displayName || member?.user?.username || userId).trim();
        void notifyInboxStaffNewItem({
          guild,
          queue: "resoconti",
          subjectUserId: String(userId),
          subjectName,
          kind: "s",
          roleId: staffRoleId,
          title: "Nuovo resoconto staff",
          body: `Resoconto di ${subjectName} in attesa di revisione.`,
          messageId: String(staffMsg?.id || ""),
          dedupeKey: `inbox:resoconti:new:${staffMsg?.id || userId}`,
        }).catch(() => 0);
      } catch (_) {}
      await appendStaffResocontoPostedId(guildId, resocontoWeekKey, userId);
      await appendStaffResocontoPostedRoleId(guildId, resocontoWeekKey, userId, staffRoleId);
      staffResocontoPostedIds.add(userId);
      staffResocontoPostedIds.add(`${staffRoleId}:${userId}`);
    } else {
      result.sendFailed += 1;
    }
  } else {
    const reason = alreadyHadStaffResocontoThisCycle
      ? "already_posted_this_cycle"
      : wasPexedResocontoDay
        ? "staff_pex_resoconto_day"
        : "unknown";
    if (jobsDebug) {
      global.logger?.info?.(`[WEEKLY STAFF RESOCONTO] Staff skipped: ${userId} (${member.user?.tag || member.user?.username || "unknown"}) segment=${segment} reason=${reason}`);
    }
  }

  if (!skipLimitAutovalutazione || !skipSanctionAutovalutazione) {
    await applyWeeklyStaffAutoValutazioniForMember({
      guild,
      member,
      staffDoc: nextStaffDoc,
      staffRoleId,
      overview: overviewMap.get(userId),
      resocontoWeekKey,
      sanctionCountByModId,
      graceNewStaffRole,
      weekStart,
      weekEnd,
      skipLimitAutovalutazione,
      skipSanctionAutovalutazione,
    });
  }

  result.staffDoc = nextStaffDoc;
  return result;
}

export = { processStaffResocontoMember };
