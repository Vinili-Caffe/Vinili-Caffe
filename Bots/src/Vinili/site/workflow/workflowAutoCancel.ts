/** Workflow staff: annullo automatico di resoconti e pause non più validi. */
const { SiteDocument } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { getGuildMemberCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { WORKFLOW_DOC, updateStaffWorkflowStatusByDedupe } = require("./workflowWrites") as typeof import("./workflowWrites");
const { memberStillRelevantForResoconto, resocontoAutoCancelLabel, memberEligibleForPauseRole, autoCancelPendingPausesIfNotEligible, reconcilePendingPauseWorkflows } = require("./workflowSync") as typeof import("./workflowSync");

async function cancelPendingResocontiWorkflowForUser(guildId?, userId?, extras: Record<string, any> = {}) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return 0;
  const kind = String(extras.kind || "").trim().toLowerCase();
  const filter: Record<string, any> = {
    docType: WORKFLOW_DOC,
    guildId: gid,
    userId: uid,
    workflowQueue: "resoconti",
    status: "pending",
  };
  if (kind === "s" || kind === "p") filter.workflowKind = kind;
  const result = await SiteDocument.updateMany(
    filter,
    {
      $set: {
        status: "cancelled",
        decidedAt: extras.decidedAt || new Date(),
        staffReason: String(extras.statusLabel || extras.staffReason || "Annullato (depex)").slice(0, 200),
        workflowDecidedBy: String(extras.decidedBy || "system").slice(0, 32),
        ...(String(extras.decidedByName || "").trim()
          ? { workflowDecidedByName: String(extras.decidedByName).trim().slice(0, 120) }
          : {}),
      },
    },
  ).catch(() => null);
    const modified = Number(result?.modifiedCount || 0);
  if (modified > 0) {
    try {
      const { broadcastSiteStaffWorkflowChanged } = require("../suggestions/siteSuggestionsBroadcast") as typeof import("../suggestions/siteSuggestionsBroadcast");
      broadcastSiteStaffWorkflowChanged("resoconti");
    } catch (_) {}
    try {
      const { clearStaffProfileCacheForUser } = require("../staff/siteStaffProfileApi") as typeof import("../staff/siteStaffProfileApi");
      clearStaffProfileCacheForUser(uid, { action: "resoconti" });
    } catch (_) {}
  }
  return modified;
}

async function pruneDepexedPendingResoconti(guild?, guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid || !guild) return 0;
  const pendingDocs = await SiteDocument.find({
    docType: WORKFLOW_DOC,
    guildId: gid,
    workflowQueue: "resoconti",
    status: "pending",
  })
    .select("userId workflowKind workflowRoleId dedupeKey")
    .lean()
    .catch(() => []);
  if (!pendingDocs?.length) return 0;

  const memberByUser = new Map();
  let updated = 0;
  for (const doc of pendingDocs) {
    const uid = String(doc?.userId || "").trim();
    const dedupeKey = String(doc?.dedupeKey || "").trim();
    const kind = String(doc?.workflowKind || "").trim().toLowerCase();
    if (!uid || !dedupeKey || (kind !== "s" && kind !== "p")) continue;

    if (!memberByUser.has(uid)) {
      const member = await getGuildMemberCached(guild, uid, { preferFresh: true }).catch(() => null);
      memberByUser.set(uid, member || null);
    }
    const member = memberByUser.get(uid);
    if (memberStillRelevantForResoconto(member, kind, doc?.workflowRoleId)) continue;

    const statusLabel = resocontoAutoCancelLabel(member, kind);
    await updateStaffWorkflowStatusByDedupe(gid, dedupeKey, "cancelled", {
      statusLabel,
      decidedBy: "system",
    });
    updated += 1;
  }
  return updated;
}

async function cancelPendingPauseWorkflowForUser(guildId?, userId?, extras: Record<string, any> = {}) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return 0;
  const pauseId = String(extras.pauseId || extras.workflowPauseId || "").trim();
  const filter: Record<string, any> = {
    docType: WORKFLOW_DOC,
    guildId: gid,
    userId: uid,
    workflowQueue: "pause",
    status: "pending",
  };
  if (pauseId) filter.workflowPauseId = pauseId;
  const statusLabel = String(extras.statusLabel || extras.staffReason || "Annullato (depex)").slice(0, 200);
  const result = await SiteDocument.updateMany(filter, {
    $set: {
      status: "cancelled",
      decidedAt: extras.decidedAt || new Date(),
      staffReason: statusLabel,
      "workflowFields.statusLabel": statusLabel,
      workflowDecidedBy: String(extras.decidedBy || "system").slice(0, 32),
      ...(String(extras.decidedByName || "").trim()
        ? { workflowDecidedByName: String(extras.decidedByName).trim().slice(0, 120) }
        : {}),
    },
  }).catch(() => null);
    return Number(result?.modifiedCount || 0);
}

function filterPauseInboxItemsCachedOnly(guild?, items?, knownStaffIds = null) {
  if (!guild || !Array.isArray(items) || !items.length) return items || [];
  const known =
    knownStaffIds instanceof Set
      ? knownStaffIds
      : Array.isArray(knownStaffIds)
        ? new Set(knownStaffIds.map((id?) => String(id || "").trim()).filter(Boolean))
        : null;
  const out = [];
  for (const item of items) {
    const status = String(item?.status || "").trim().toLowerCase() || "pending";
    const uid = String(item?.userId || "").trim();
    if (!uid) continue;
    /* pauseReviewFix1: usa track (Staff/Entrambi/PM), non label display tipo "Moderator" */
    const ruolo =
      item?.ruoloTrack ||
      item?.workflowFields?.ruoloTrack ||
      item?.ruoloRichiesto ||
      item?.ruolo ||
      item?.workflowFields?.ruoloRichiesto ||
      item?.fields?.ruoloRichiesto ||
      "Staff";
    const member = guild.members?.cache?.get(uid) || null;
    if (member) {
      if (!memberEligibleForPauseRole(member, ruolo)) continue;
      out.push(item);
      continue;
    }
        if (known && known.has(uid)) {
      out.push(item);
      continue;
    }
        if (status === "pending") out.push(item);
  }
  return out;
}

async function prunePendingPauseInboxUsers(guild?, client?, guildId?, items?) {
  const pendingUsers = [];
  const seen = new Set();
  for (const item of items || []) {
    if (String(item?.status || "") !== "pending") continue;
    const uid = String(item?.userId || "").trim();
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    pendingUsers.push(uid);
  }
  for (const uid of pendingUsers) {
    await autoCancelPendingPausesIfNotEligible(guild, uid, { decidedBy: "system" }).catch(() => 0);
  }
  if (client && guildId) {
    await reconcilePendingPauseWorkflows(client, guildId).catch(() => 0);
  }
}

export = { cancelPendingResocontiWorkflowForUser, pruneDepexedPendingResoconti, cancelPendingPauseWorkflowForUser, filterPauseInboxItemsCachedOnly, prunePendingPauseInboxUsers };
