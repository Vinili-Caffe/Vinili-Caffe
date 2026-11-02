/** Resoconti settimanali: invio resoconto Partner Manager per un membro. */
const { STAFF_NEW_EMOJI } = require("../../Utils/Community/staffListUtils") as typeof import("../../Utils/Community/staffListUtils");
const { getPmResocontoWindow } = require("./resocontoTime") as typeof import("./resocontoTime");
const { wasPartnerManagerInPauseForResocontoWeek, getPmResocontoPauseDisplayLine } = require("./resocontoPauses") as typeof import("./resocontoPauses");
const { isPmResocontoExcludedUserId, wasPmPromotedInResocontoSkipWindow, wasPmPexedInWeek } = require("./resocontoMembers") as typeof import("./resocontoMembers");
const { computePmAction, pmActionToKey } = require("./resocontoGrades") as typeof import("./resocontoGrades");
const { countPmWeeklyPartners } = require("./resocontoMessages") as typeof import("./resocontoMessages");
const { hasSiteResocontoThisWeek } = require("./resocontoSegmentPosted") as typeof import("./resocontoSegmentPosted");

async function processPmResocontoMember({
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
}) {
  const alreadyHadPmResocontoThisCycle =
    !forceTarget &&
    !ignorePostedState &&
    (await hasSiteResocontoThisWeek(guildId, resocontoWeekKey, userId, "p"));
  const pmWindow = getPmResocontoWindow(new Date());
  const pmPromotedInResocontoWindow = wasPmPromotedInResocontoSkipWindow(staffDoc, pmWindow.weekStart, pmWindow.weekEnd);
  const shouldSkipPmResoconto =
    !forceTarget &&
    isPmResocontoExcludedUserId(userId);
  const result = { sent: 0 };

  if (
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
      result.sent += 1;
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
  } else {
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

  return result;
}

export = { processPmResocontoMember };
