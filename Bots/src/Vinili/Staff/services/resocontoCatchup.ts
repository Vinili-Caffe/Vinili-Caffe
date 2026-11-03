/** Resoconti settimanali: recupero delle valutazioni automatiche saltate. */
const IDs: any = require("../../Config/ids") as typeof import("../../Config/ids");
const { ActivityUserProfile } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const { getUserOverviewStats } = require("../../Community/services/activityService") as typeof import("../../Community/services/activityService");
const { getClientGuildCached, getGuildMemberCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { STAFF_ACTIVITY_LIMITS, STAFF_SANCTION_LIMITS } = require("./resocontoLimits") as typeof import("./resocontoLimits");
const { getRomeDateParts, getCurrentResocontoPexWeekWindowUtc, getStaffResocontoEvaluationWindow } = require("./resocontoTime") as typeof import("./resocontoTime");
const { collectResocontoVoiceExcludeIds, buildResocontoOverviewOptions, overviewLooksLikeEmptyFallback } = require("./resocontoActivity") as typeof import("./resocontoActivity");
const { resolveStaffRole, collectMemberIdsMatchingResocontoStaffSegment, wasPexedOnResocontoDay, wasFirstStaffPromotionFromMemberInWindow } = require("./resocontoMembers") as typeof import("./resocontoMembers");
const { findAutoValutazioneEntry } = require("./resocontoGrades") as typeof import("./resocontoGrades");
const { shouldSkipLimitAutovalutazioniForStaffMember, shouldSkipSanctionAutovalutazioniForStaffMember, applyWeeklyStaffAutoValutazioniForMember } = require("./resocontoAutoValutazioni") as typeof import("./resocontoAutoValutazioni");
const { getWeeklySanctionCountByMod, hydrateGuildMembersForResoconto } = require("./resocontoMessages") as typeof import("./resocontoMessages");

function getStaffRoleIdForResocontoSegment(segment?) {
  if (segment === "helper") return String(IDs.roles.Helper || "").trim();
  if (segment === "mod") return String(IDs.roles.Mod || "").trim();
  if (segment === "senior_moderator") return String(IDs.roles.SeniorModerator || "").trim();
  if (segment === "director") return String(IDs.roles.Director || "").trim();
  return "";
}

async function runWeeklyLimitAutoValutazioniCatchupSegment(client?, segment?, now = new Date(), opts: Record<string, any> = {}) {
  const staffRoleId = getStaffRoleIdForResocontoSegment(segment);
  const limits = STAFF_ACTIVITY_LIMITS[String(staffRoleId)];
  if (!staffRoleId || !limits) return;

  const guildId = String(IDs.guilds?.main || "");
  if (!guildId) return;
  const guild = await getClientGuildCached(client, guildId);
  if (!guild) return;
  await hydrateGuildMembersForResoconto(guild, `catchup_${segment}`);

  const resocontoExcludeVoiceChannels = collectResocontoVoiceExcludeIds(guild);
  const resocontoOverviewVoiceExclude =
    resocontoExcludeVoiceChannels.size > 0 ? resocontoExcludeVoiceChannels : null;
  const resocontoScope = buildResocontoOverviewOptions(guild, now);
  const { weekStart, weekEnd } = getStaffResocontoEvaluationWindow(now);
  const pexSkipWindow = getCurrentResocontoPexWeekWindowUtc(now);
  const closingPartsForResocontoKey = getRomeDateParts(pexSkipWindow.windowEndExclusive);
  const resocontoWeekKey = `${closingPartsForResocontoKey.year}-${String(closingPartsForResocontoKey.month).padStart(2, "0")}-${String(closingPartsForResocontoKey.day).padStart(2, "0")}`;

  const staffDocs = await ActivityUserProfile.find({ guildId, staff: { $exists: true } }, { userId: 1, staff: 1 }).lean().catch(() => []);
  const staffMap = new Map((Array.isArray(staffDocs) ? staffDocs : []).map((row?) => [String(row.userId), row.staff || {}]));
  const idsFromGuildRoles = collectMemberIdsMatchingResocontoStaffSegment(guild, staffRoleId);
  const idsFromStaffDocs = (Array.isArray(staffDocs) ? staffDocs : [])
    .map((row?) => String(row?.userId || ""))
    .filter(Boolean);
  const userIds = Array.from(new Set([...idsFromGuildRoles, ...idsFromStaffDocs]));
  if (!userIds.length) return;

  const fetchedMembers = await Promise.all(userIds.map((userId?) => getGuildMemberCached(guild, userId)));
  const members = fetchedMembers.filter((member?) =>
    member &&
    !member.user?.bot &&
    String(resolveStaffRole(member) || "") === String(staffRoleId),
  );
  if (!members.length) return;
  let eligibleCount = 0;
  let appliedCount = 0;
  let existingCount = 0;
  let skippedCount = 0;
  const forceAutoValutazioni = Boolean(opts.force || opts.forceAutoValutazioni);
  const sanctionCountByModId = await getWeeklySanctionCountByMod(guildId, weekStart, weekEnd);

  const overviewResults = await Promise.all(
    members.map((member?) =>
      getUserOverviewStats(
        guildId,
        member.id,
        7,
        resocontoOverviewVoiceExclude,
        resocontoScope,
      ).catch((err?) => {
        global.logger?.warn?.("[WEEKLY STAFF RESOCONTO] catchup overview stats failed:", member.id, err?.message || err);
        return { __error: true };
      })),
  );

  for (let i = 0; i < members.length; i += 1) {
    const member = members[i];
    const userId = String(member.id);
    const staffDoc = staffMap.get(userId) || null;
    const graceNewStaffRole = wasFirstStaffPromotionFromMemberInWindow(
      staffDoc,
      staffRoleId,
      pexSkipWindow.windowStart,
      pexSkipWindow.windowEndExclusive,
    );
    const wasPexedResocontoDay = wasPexedOnResocontoDay(staffDoc, now);
    const skipLimitAutovalutazione = shouldSkipLimitAutovalutazioniForStaffMember({
      graceNewStaffRole,
      wasPexedResocontoDay,
    });
    const skipSanctionAutovalutazione = shouldSkipSanctionAutovalutazioniForStaffMember({
      graceNewStaffRole,
      wasPexedResocontoDay,
    });
    const limitsKey = `weekly_limits:${resocontoWeekKey}:${staffRoleId}`;
    const sanctionsKey = `weekly_sanzioni:${resocontoWeekKey}:${staffRoleId}`;
    const limitsEntry = findAutoValutazioneEntry(staffDoc, limitsKey);
    const sanctionsEntry = findAutoValutazioneEntry(staffDoc, sanctionsKey);
        const hasLimitsValutazione = Boolean(limitsEntry) && !limitsEntry.spentByTrade;
    const hasSanctionsValutazione = Boolean(sanctionsEntry) && !sanctionsEntry.spentByTrade;
    const sanctionLimit = STAFF_SANCTION_LIMITS[String(staffRoleId)];
    const weeklySanctions = sanctionCountByModId?.get?.(userId) || 0;
    const metWeeklySanctionLimit =
      sanctionLimit != null && weeklySanctions >= sanctionLimit;
    if (skipLimitAutovalutazione) {
      skippedCount += 1;
      if (opts.verbose) {
        console.log(JSON.stringify({ userId, skipped: true, reason: "staff_pex_resoconto_day" }));
      }
      continue;
    }
    if (hasLimitsValutazione && (!metWeeklySanctionLimit || hasSanctionsValutazione)) {
      skippedCount += 1;
      if (opts.verbose) {
        console.log(JSON.stringify({ userId, skipped: true, reason: "already_complete" }));
      }
      continue;
    }
    eligibleCount += 1;

    const result: any = await applyWeeklyStaffAutoValutazioniForMember({
      guild,
      member,
      staffDoc,
      staffRoleId,
      overview: overviewResults[i],
      resocontoWeekKey,
      sanctionCountByModId,
      graceNewStaffRole,
      weekStart,
      weekEnd,
      force: forceAutoValutazioni,
      skipLimitAutovalutazione,
      skipSanctionAutovalutazione,
    }).catch((err?) => {
      global.logger?.warn?.(
        "[WEEKLY STAFF RESOCONTO] same-day catchup valutazione failed:",
        userId,
        err?.message || err,
      );
      return { limits: false, sanctions: false };
    });
    const createdCount = Number(result?.limits) + Number(result?.sanctions);
    if (createdCount > 0) {
      appliedCount += createdCount;
    } else if (
      result?.skippedLimits === "exists" ||
      result?.skippedLimits === "equivalent_exists" ||
      result?.skippedSanctions === "exists" ||
      result?.skippedSanctions === "equivalent_exists"
    ) {
      existingCount += 1;
    } else if (result?.skippedLimits === "skip_context" && result?.skippedSanctions == null) {
      skippedCount += 1;
    } else if (result?.skippedLimits === "pause_week" && !result?.sanctions) {
      skippedCount += 1;
    } else if (overviewLooksLikeEmptyFallback(overviewResults[i]) && !result?.sanctions) {
      skippedCount += 1;
    } else if (!result?.limits && !result?.sanctions) {
      skippedCount += 1;
    }
    if (opts.verbose) {
      const weeklySanctions = sanctionCountByModId?.get?.(userId) || 0;
      console.log(JSON.stringify({
        userId,
        weeklySanctions,
        limits: Boolean(result?.limits),
        sanctions: Boolean(result?.sanctions),
        skippedLimits: result?.skippedLimits || null,
        skippedSanctions: result?.skippedSanctions || null,
      }));
    }
  }
  return {
    segment,
    eligible: eligibleCount,
    applied: appliedCount,
    existing: existingCount,
    skipped: skippedCount,
  };
}

export = { runWeeklyLimitAutoValutazioniCatchupSegment };
