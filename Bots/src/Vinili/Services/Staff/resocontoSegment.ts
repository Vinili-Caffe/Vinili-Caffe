/** Resoconti settimanali: invio dei resoconti di un ruolo. */
const { getBotState, setBotState } = require("../../Utils/BotState/botStateStore") as typeof import("../../Utils/BotState/botStateStore");
const IDs: any = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { getUserOverviewStats } = require("../Community/activityService") as typeof import("../Community/activityService");
const { getClientGuildCached, getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { STAFF_NEW_EMOJI } = require("../../Utils/Community/staffListUtils") as typeof import("../../Utils/Community/staffListUtils");
const { getStaffRoleEmojiByRoleId } = require("../../Utils/Community/staffRoleEmoji") as typeof import("../../Utils/Community/staffRoleEmoji");
const { ensureStaff } = require("../../Utils/Staff/staffDocUtils") as typeof import("../../Utils/Staff/staffDocUtils");
const { getStaffDoc } = require("../../Utils/Staff/valutazionePanelActions") as typeof import("../../Utils/Staff/valutazionePanelActions");
const { STAFF_ACTIVITY_LIMITS, evaluateStaffWeeklyLimitsWithSwap, evaluateStaffWeeklyLimitsAtMultiplier, formatStaffLimitsSwapLine, STAFF_SANCTION_LIMITS, toSafeNumber, formatHoursFromSeconds } = require("./resocontoLimits") as typeof import("./resocontoLimits");
const { getRomeDateParts, getCurrentResocontoPexWeekWindowUtc, getPmResocontoWindow } = require("./resocontoTime") as typeof import("./resocontoTime");
const { collectResocontoVoiceExcludeIds, buildResocontoOverviewOptions, buildCostanzaLines, overviewLooksLikeEmptyFallback, serializeCostanzaChart } = require("./resocontoActivity") as typeof import("./resocontoActivity");
const { getStaffPauseLine, hadPauseAtLeastOneDayDuringWeek, didPauseEndDuringWeek, wasPartnerManagerInPauseForResocontoWeek, getPmResocontoPauseDisplayLine } = require("./resocontoPauses") as typeof import("./resocontoPauses");
const { isPmResocontoExcludedUserId, resolveStaffRole, collectResocontoDiscordMemberIdsForSegment, wasPexedInWeek, wasPmPromotedInResocontoSkipWindow, shouldSkipResocontoForPexInCalendarWeek, wasPexedOnResocontoDay, wasPmPexedInWeek, wasPromotedToRoleInWindow, wasFirstStaffPromotionFromMemberInWindow } = require("./resocontoMembers") as typeof import("./resocontoMembers");
const { computeActivityGrade, computeBehaviorGrade, buildStaffResocontoAzioneDisplay, computePmAction, pmActionToKey } = require("./resocontoGrades") as typeof import("./resocontoGrades");
const { STAFF_LIMITS_POSITIVE_MULTIPLIER, shouldSkipLimitAutovalutazioniForStaffMember, shouldSkipSanctionAutovalutazioniForStaffMember, applyWeeklyStaffAutoValutazioniForMember } = require("./resocontoAutoValutazioni") as typeof import("./resocontoAutoValutazioni");
const { countPmWeeklyPartners, getWeeklySanctionCountByMod, hydrateGuildMembersForResoconto } = require("./resocontoMessages") as typeof import("./resocontoMessages");

const BOT_STATE_KEY_LAST_RESOCONTO = "lastResocontoRun";

async function writeLastResocontoRun() {
  await setBotState(BOT_STATE_KEY_LAST_RESOCONTO, { lastRunAt: Date.now() });
}

const BOT_STATE_KEY_STAFF_RESOCONTO_POSTED_PREFIX = "staffResocontoPosted";

function buildStaffResocontoPostedStateKey(guildId?, resocontoWeekKey?) {
  return `${BOT_STATE_KEY_STAFF_RESOCONTO_POSTED_PREFIX}:${String(guildId || "")}:${String(resocontoWeekKey || "")}`;
}

async function loadStaffResocontoPostedIds(guildId?, resocontoWeekKey?) {
  const key = buildStaffResocontoPostedStateKey(guildId, resocontoWeekKey);
  const cur = await getBotState(key, { userIds: [] });
  return new Set((Array.isArray(cur?.userIds) ? cur.userIds : [])
    .map((x?) => String(x || "").trim())
    .filter((id?) => /^\d{17,20}$/.test(id) || /^\d{16,20}:\d{17,20}$/.test(id)));
}

async function appendStaffResocontoPostedId(guildId?, resocontoWeekKey?, userId?) {
  const uid = String(userId || "").trim();
  if (!/^\d{17,20}$/.test(uid)) return;
  const key = buildStaffResocontoPostedStateKey(guildId, resocontoWeekKey);
  const cur = await getBotState(key, { userIds: [] });
  const arr = Array.isArray(cur?.userIds) ? cur.userIds.map((x?) => String(x || "").trim()).filter(Boolean) : [];
  if (arr.includes(uid)) return;
  arr.push(uid);
  await setBotState(key, { userIds: arr });
}

async function appendStaffResocontoPostedRoleId(guildId?, resocontoWeekKey?, userId?, roleId?) {
  const uid = String(userId || "").trim();
  const rid = String(roleId || "").trim();
  if (!/^\d{17,20}$/.test(uid) || !rid) return;
  const key = buildStaffResocontoPostedStateKey(guildId, resocontoWeekKey);
  const cur = await getBotState(key, { userIds: [] });
  const arr = Array.isArray(cur?.userIds) ? cur.userIds.map((x?) => String(x || "").trim()).filter(Boolean) : [];
  const roleKey = `${rid}:${uid}`;
  if (!arr.includes(roleKey)) arr.push(roleKey);
  await setBotState(key, { userIds: arr });
}

function hadStaffRoleResocontoPostedThisCycle(staffResocontoPostedIds?, staffRoleId?, userId?) {
  const uid = String(userId || "").trim();
  const rid = String(staffRoleId || "").trim();
  if (!uid || !rid || !staffResocontoPostedIds) return false;
  return staffResocontoPostedIds.has(`${rid}:${uid}`);
}

async function runWeeklyStaffResocontoSegment(client?, segment?, opts: Record<string, any> = {}) {
  const allowed = new Set(["pm", "helper", "mod", "senior_moderator", "director"]);
  if (!allowed.has(segment)) return { sent: 0, eligible: 0, segment };
  const jobsDebug = String(process.env.DEBUG_JOBS || "").trim() === "1";
  const targetUserId = String(opts.userId || opts.targetUserId || "").trim();
  const forceTarget = Boolean(opts.force && /^\d{16,20}$/.test(targetUserId));
  const ignorePostedState = Boolean(opts.ignorePostedState);

  const { newSiteWorkflowMessageId } = require("../../site/http/discordWorkflowUiGate") as typeof import("../../site/http/discordWorkflowUiGate");

  const guildId = String(IDs.guilds?.main || "");
  if (!guildId) return { sent: 0, eligible: 0, segment };

  const guild = await getClientGuildCached(client, guildId);
  if (!guild) return { sent: 0, eligible: 0, segment };
  await hydrateGuildMembersForResoconto(guild, segment);

  const resocontoExcludeVoiceChannels = collectResocontoVoiceExcludeIds(guild);
  const resocontoOverviewVoiceExclude =
    resocontoExcludeVoiceChannels.size > 0 ? resocontoExcludeVoiceChannels : null;
  const now = new Date();
  const resocontoScope = buildResocontoOverviewOptions(guild, now);

  const { weekStart, weekEnd } = getPmResocontoWindow(now);
  const pexSkipWindow = getCurrentResocontoPexWeekWindowUtc(now);
  const closingPartsForResocontoKey = getRomeDateParts(pexSkipWindow.windowEndExclusive);
  const resocontoWeekKey = `${closingPartsForResocontoKey.year}-${String(closingPartsForResocontoKey.month).padStart(2, "0")}-${String(closingPartsForResocontoKey.day).padStart(2, "0")}`;
  const staffResocontoPostedIds = await loadStaffResocontoPostedIds(guildId, resocontoWeekKey);
  const staffDocs = await ActivityUserProfile.find({ guildId, staff: { $exists: true } }, { userId: 1, staff: 1 }).lean().catch(() => []);

  async function hasSiteResocontoThisWeek(userId?, kind?) {
    try {
      const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
      const doc = await SiteDocument.findOne({
        docType: SITE_DOCUMENT_TYPE.STAFF_WORKFLOW,
        guildId,
        workflowQueue: "resoconti",
        userId: String(userId),
        workflowKind: String(kind),
        workflowWeekKey: resocontoWeekKey,
      })
        .select({ _id: 1 })
        .lean()
        .catch(() => null);
      return Boolean(doc);
    } catch {
      return false;
    }
  }

  const wantStaffForSegment =
    segment === "helper" ||
    segment === "mod" ||
    segment === "senior_moderator" ||
    segment === "director"
      ? String(
          segment === "helper"
            ? IDs.roles.Helper
            : segment === "mod"
              ? IDs.roles.Mod
              : segment === "senior_moderator"
                ? IDs.roles.SeniorModerator
                : IDs.roles.Director,
        )
      : null;

  const idsFromStaffDocs = (Array.isArray(staffDocs) ? staffDocs : [])
    .map((row?) => String(row?.userId || ""))
    .filter(Boolean);
  const idsFromGuildRoles = collectResocontoDiscordMemberIdsForSegment(guild, segment);
  const knownStaffUserIds = forceTarget
    ? [targetUserId]
    : Array.from(new Set([...idsFromStaffDocs, ...idsFromGuildRoles]));
  if (!knownStaffUserIds.length) return { sent: 0, eligible: 0, segment };

  const fetchedMembers = await Promise.all(knownStaffUserIds.map((userId?) => getGuildMemberCached(guild, userId)),);

  const candidateMembers = [];
  for (const member of fetchedMembers) {
    if (!member) continue;
    if (member.user?.bot) continue;

    const hasStaffRole = Boolean(resolveStaffRole(member));
    const hasPmRole = member.roles.cache.has(String(IDs.roles.PartnerManager));
    if (!hasStaffRole && !hasPmRole) continue;

    candidateMembers.push(member);
  }
  if (!candidateMembers.length) return { sent: 0, eligible: 0, segment };

  const staffMap = new Map((Array.isArray(staffDocs) ? staffDocs : []).map((row?) => [String(row.userId), row.staff || {}]));

  const staffUserIds = candidateMembers.filter((m?) => resolveStaffRole(m)).map((m?) => String(m.id));
  const overviewResults = await Promise.all(
    staffUserIds.map((uid?) =>
      getUserOverviewStats(
        guildId,
        uid,
        7,
        resocontoOverviewVoiceExclude,
        resocontoScope,
      ).catch((err?) => {
        global.logger?.warn?.("[WEEKLY STAFF RESOCONTO] overview stats failed:", uid, err?.message || err);
        return { __error: true };
      })),
  );
  const overviewMap = new Map(staffUserIds.map((id?, i?) => [id, overviewResults[i] || null]),);
  const sanctionCountByModId = await getWeeklySanctionCountByMod(guildId, weekStart, weekEnd);
  let sentCount = 0;
  let eligibleCount = 0;
  let completedCount = 0;
  const skippedCounts = {
    alreadyPosted: 0,
    pexWindow: 0,
    sendFailed: 0,
  };

  for (const member of candidateMembers) {
    const userId = String(member.id);
    let staffDoc = staffMap.get(userId) || null;
    const staffRoleId = resolveStaffRole(member);
    const graceNewStaffRole =
      Boolean(staffRoleId) &&
      wasFirstStaffPromotionFromMemberInWindow(staffDoc, staffRoleId, pexSkipWindow.windowStart, pexSkipWindow.windowEndExclusive);
    const pmPexedInCurrentWeek = wasPromotedToRoleInWindow(
      staffDoc,
      IDs.roles.PartnerManager,
      pexSkipWindow.windowStart,
      pexSkipWindow.windowEndExclusive,
    );
    const skipForStaffPexInWindow = shouldSkipResocontoForPexInCalendarWeek(
      staffDoc,
      pexSkipWindow.windowStart,
      pexSkipWindow.windowEndExclusive,
    );
    const wasPexedResocontoDay = wasPexedOnResocontoDay(staffDoc, now);

    const matchStaffSegment =
      wantStaffForSegment && staffRoleId && String(staffRoleId) === wantStaffForSegment;
    if (matchStaffSegment) eligibleCount += 1;

    const alreadyHadStaffResocontoThisCycle =
      !forceTarget &&
      !ignorePostedState &&
      staffRoleId &&
      (
        hadStaffRoleResocontoPostedThisCycle(staffResocontoPostedIds, staffRoleId, userId) ||
        (await hasSiteResocontoThisWeek(userId, "s"))
      );
    const shouldSkipStaffResoconto =
      matchStaffSegment &&
      (wasPexedResocontoDay || alreadyHadStaffResocontoThisCycle);
    const skipLimitAutovalutazione = shouldSkipLimitAutovalutazioniForStaffMember({
      graceNewStaffRole,
      wasPexedResocontoDay,
    });
    const skipSanctionAutovalutazione = shouldSkipSanctionAutovalutazioniForStaffMember({
      graceNewStaffRole,
      wasPexedResocontoDay,
    });
    if (matchStaffSegment && alreadyHadStaffResocontoThisCycle) completedCount += 1;
    if (matchStaffSegment && alreadyHadStaffResocontoThisCycle) skippedCounts.alreadyPosted += 1;
    if (matchStaffSegment && wasPexedResocontoDay) skippedCounts.pexWindow += 1;
    if (matchStaffSegment && skipForStaffPexInWindow && jobsDebug) {
      global.logger?.info?.(`[WEEKLY STAFF RESOCONTO] Staff pex in calendar week: ${userId} segment=${segment}`);
    }

    if (matchStaffSegment && !shouldSkipStaffResoconto) {
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
          staffDoc = ensureStaff(refreshedProfile);
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
        sentCount += 1;
        completedCount += 1;
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
        skippedCounts.sendFailed += 1;
      }
    } else if (matchStaffSegment) {
      const reason = alreadyHadStaffResocontoThisCycle
        ? "already_posted_this_cycle"
        : wasPexedResocontoDay
          ? "staff_pex_resoconto_day"
          : "unknown";
      if (jobsDebug) {
        global.logger?.info?.(`[WEEKLY STAFF RESOCONTO] Staff skipped: ${userId} (${member.user?.tag || member.user?.username || "unknown"}) segment=${segment} reason=${reason}`);
      }
    }

    if (matchStaffSegment && (!skipLimitAutovalutazione || !skipSanctionAutovalutazione)) {
      await applyWeeklyStaffAutoValutazioniForMember({
        guild,
        member,
        staffDoc,
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

    const matchPmSegment =
      segment === "pm" &&
      member.roles.cache.has(String(IDs.roles.PartnerManager));
    const alreadyHadPmResocontoThisCycle =
      matchPmSegment &&
      !forceTarget &&
      !ignorePostedState &&
      (await hasSiteResocontoThisWeek(userId, "p"));
    const pmWindow = matchPmSegment ? getPmResocontoWindow(new Date()) : null;
    const pmPromotedInResocontoWindow = pmWindow
      ? wasPmPromotedInResocontoSkipWindow(staffDoc, pmWindow.weekStart, pmWindow.weekEnd)
      : false;
    const shouldSkipPmResoconto =
      matchPmSegment &&
      !forceTarget &&
      isPmResocontoExcludedUserId(userId);

    if (
      matchPmSegment &&
      !alreadyHadPmResocontoThisCycle &&
      !shouldSkipPmResoconto &&
      !isPmResocontoExcludedUserId(userId)
    ) {
      const weeklyPartners = countPmWeeklyPartners(staffDoc, pmWindow.weekStart, pmWindow.weekEnd,);
      const pmPexedInWeek = wasPmPexedInWeek(staffDoc, pmWindow.weekStart);
      const pmInPauseDuringWeek = wasPartnerManagerInPauseForResocontoWeek(staffDoc, pmWindow.weekStart, pmWindow.weekEnd, member);
      const pmCurrentlyInPause = Boolean(
        getPmResocontoPauseDisplayLine(staffDoc, member)?.includes("**In pausa**"),
      );
      const basePmAction = pmInPauseDuringWeek ? "Nulla" : computePmAction(weeklyPartners, pmPexedInWeek);
      let action;
      if (pmPexedInCurrentWeek) {
        action = "Nulla — promosso PM nella settimana";
      } else if (pmPromotedInResocontoWindow) {
        action = "Nulla — nuovo Partner Manager";
      } else if (pmCurrentlyInPause || pmInPauseDuringWeek) {
        action = "Nulla — in pausa";
      } else {
        action = basePmAction;
      }
      const pmPauseLine = getPmResocontoPauseDisplayLine(staffDoc, member);
      const pmNewBadge =
        (pmPexedInCurrentWeek || pmPromotedInResocontoWindow) &&
        String(action).startsWith("Nulla")
          ? ` ${STAFF_NEW_EMOJI}`
          : "";
      const pmContentLines = [
        `<:VC_PartnerManager:1494286911286808576> **Partner Manager:** __<@${userId}>__${pmNewBadge}`,
        `<:partneredserverowner:1443651871125409812> **Partner:** __${weeklyPartners}__`,
        `<:VC_BanHammer:1482534474502897795> **Azione:** __${action}__`,
      ];
      if (pmPauseLine) pmContentLines.push(pmPauseLine);

      const pmContentBody = pmContentLines.join("\n");
      let pmMsg = null;
      const siteMessageId = newSiteWorkflowMessageId();
      try {
        const { persistResocontoWorkflowFromPayload } = require("../../site/workflow/siteStaffWorkflowStore") as typeof import("../../site/workflow/siteStaffWorkflowStore");
        await persistResocontoWorkflowFromPayload(guild, {
          messageId: siteMessageId,
          channelId: "site",
          userId,
          kind: "p",
          roleId: null,
          actionKey: pmActionToKey(basePmAction),
          content: pmContentBody,
          status: "pending",
          createdAt: new Date(),
          weekKey: resocontoWeekKey,
          workflowFields: {
            weeklyPartners,
            azioneDisplay: String(action || ""),
            isNewStaff: Boolean(pmPexedInCurrentWeek || pmPromotedInResocontoWindow),
            inPause: Boolean(pmCurrentlyInPause || pmInPauseDuringWeek),
          },
        });
        pmMsg = { id: siteMessageId };
      } catch (err) {
        global.logger?.warn?.("[WEEKLY STAFF RESOCONTO] site PM persist failed:", err?.message || err);
        pmMsg = null;
      }
      if (pmMsg) {
        sentCount += 1;
        try {
          const { notifyInboxStaffNewItem } = require("../../site/workflow/siteStaffWorkflowNotifications") as typeof import("../../site/workflow/siteStaffWorkflowNotifications");
          const subjectName = String(member?.displayName || member?.user?.username || userId).trim();
          void notifyInboxStaffNewItem({
            guild,
            queue: "resoconti",
            subjectUserId: String(userId),
            subjectName,
            kind: "p",
            title: "Nuovo resoconto PM",
            body: `Resoconto Partner Manager di ${subjectName} in attesa di revisione.`,
            messageId: String(pmMsg?.id || ""),
            dedupeKey: `inbox:resoconti:new:${pmMsg?.id || userId}`,
          }).catch(() => 0);
        } catch (_) {}
      }
    } else if (matchPmSegment) {
      const reason = alreadyHadPmResocontoThisCycle
        ? "already_posted_this_cycle"
        : shouldSkipPmResoconto
        ? "pex_window"
        : isPmResocontoExcludedUserId(userId)
        ? "excluded_config"
        : "unknown";
      if (jobsDebug) {
        global.logger?.info?.(`[WEEKLY STAFF RESOCONTO] PM skipped: ${userId} (${member.user?.tag || member.user?.username || "unknown"}) reason=${reason}`);
      }
    }
  }
  if (segment === "director") {
    await writeLastResocontoRun();
  }
  return { sent: sentCount, eligible: eligibleCount, completed: completedCount, skipped: skippedCounts, segment };
}

export = { runWeeklyStaffResocontoSegment };
