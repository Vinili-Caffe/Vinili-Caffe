/** Resoconti settimanali: invio dei resoconti di un ruolo. */
const IDs: any = require("../../Config/ids") as typeof import("../../Config/ids");
const { ActivityUserProfile } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const { getUserOverviewStats } = require("../../Community/services/activityService") as typeof import("../../Community/services/activityService");
const { getClientGuildCached, getGuildMemberCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { getRomeDateParts, getCurrentResocontoPexWeekWindowUtc, getPmResocontoWindow } = require("./resocontoTime") as typeof import("./resocontoTime");
const { collectResocontoVoiceExcludeIds, buildResocontoOverviewOptions } = require("./resocontoActivity") as typeof import("./resocontoActivity");
const { resolveStaffRole, collectResocontoDiscordMemberIdsForSegment, shouldSkipResocontoForPexInCalendarWeek, wasPexedOnResocontoDay, wasPromotedToRoleInWindow, wasFirstStaffPromotionFromMemberInWindow } = require("./resocontoMembers") as typeof import("./resocontoMembers");
const { getWeeklySanctionCountByMod, hydrateGuildMembersForResoconto } = require("./resocontoMessages") as typeof import("./resocontoMessages");
const { writeLastResocontoRun, loadStaffResocontoPostedIds } = require("./resocontoSegmentPosted") as typeof import("./resocontoSegmentPosted");
const { processStaffResocontoMember } = require("./resocontoSegmentStaff") as typeof import("./resocontoSegmentStaff");
const { processPmResocontoMember } = require("./resocontoSegmentPm") as typeof import("./resocontoSegmentPm");

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

    if (matchStaffSegment) {
      const staffResult = await processStaffResocontoMember({
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
      });
      sentCount += staffResult.sent;
      completedCount += staffResult.completed;
      skippedCounts.alreadyPosted += staffResult.alreadyPosted;
      skippedCounts.pexWindow += staffResult.pexWindow;
      skippedCounts.sendFailed += staffResult.sendFailed;
      staffDoc = staffResult.staffDoc;
    }

    const matchPmSegment =
      segment === "pm" &&
      member.roles.cache.has(String(IDs.roles.PartnerManager));
    if (matchPmSegment) {
      const pmResult = await processPmResocontoMember({
        member,
        userId,
        staffDoc,
        jobsDebug,
        forceTarget,
        ignorePostedState,
        guild,
        guildId,
        resocontoWeekKey,
        pmPexedInCurrentWeek,
        newSiteWorkflowMessageId,
      });
      sentCount += pmResult.sent;
    }
  }
  if (segment === "director") {
    await writeLastResocontoRun();
  }
  return { sent: sentCount, eligible: eligibleCount, completed: completedCount, skipped: skippedCounts, segment };
}

export = { runWeeklyStaffResocontoSegment };
