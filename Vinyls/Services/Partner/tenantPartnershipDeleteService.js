const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { deletePartnerActionMessages } = require("./partnerManagerLeaveService");
const { invalidateLeaderboardCache } = require("./tenantLeaderboardService");
const { evaluateTenantObjectives } = require("./tenantObjectiveService");
const {
  resolvePartnershipLifecycleLogChannelId,
  shouldApplyMainPartnershipFilters,
} = require("../../Utils/Partner/partnershipConfigResolver");
const { sendPartnershipDeleteLog, findPartnershipLogIdFromExecuteLogs } = require("./partnershipExecuteLogService");
const { MANAGER_LEFT_SERVER_REASON, logPointRemoval } = require("./partnerAuditService");
const { countPartnerCreateActions } = require("../../Utils/Staff/partnerPointsDisplayUtils");
const { extractInviteCode } = require("../../Utils/Partner/partnershipMessageUtils");
const {
  collectPartnershipMessageText,
  extractManagerIdFromPartnershipText,
  extractPartnerNamesFromMessage,
  isThankYouPartnershipMessage,
  normalizePartnerLookupName,
  extractPartnershipLogIdFromMessage,
  normalizePartnershipLogId,
} = require("../../Utils/Partner/partnershipLogMessageUtils");

async function findPartnerActionByGlobalLogId(guildId, globalLogId) {
  const gid = String(guildId || "").trim();
  const id = normalizePartnershipLogId(globalLogId);
  if (!gid || !id) return null;

  const doc = await ActivityUserProfile.findOne({
    guildId: gid,
    "staff.partnerActions": {
      $elemMatch: {
        action: "create",
        globalLogId: id,
      },
    },
  }).catch(() => null);

  if (!doc?.staff?.partnerActions) return null;
  const actions = Array.isArray(doc.staff.partnerActions) ? doc.staff.partnerActions : [];
  const index = actions.findIndex(
    (row) => String(row?.action || "").toLowerCase() === "create" && Number(row?.globalLogId) === id,
  );
  if (index < 0) return null;
  return { doc, index, action: actions[index], partnershipId: id };
}

async function findPartnerActionByMessage(guildId, message) {
  const gid = String(guildId || "").trim();
  const mid = String(message?.id || "").trim();
  if (!gid || !mid) return null;

  const messageText = collectPartnershipMessageText(message);
  const messageInvite = extractInviteCode(messageText);
  const messageManagerId = extractManagerIdFromPartnershipText(messageText);
  const messagePartnerNames = extractPartnerNamesFromMessage(message);
  const messageCreated =
    Number(message?.createdTimestamp) ||
    (message?.createdAt instanceof Date ? message.createdAt.getTime() : Date.now());
  const thankYouMessage = isThankYouPartnershipMessage(message);

  const docs = await ActivityUserProfile.find({
    guildId: gid,
    "staff.partnerActions": {
      $elemMatch: { action: "create" },
    },
  }).catch(() => []);

  let best = null;
  let bestScore = 0;

  for (const doc of docs) {
    const actions = Array.isArray(doc.staff?.partnerActions) ? doc.staff.partnerActions : [];
    for (let index = 0; index < actions.length; index += 1) {
      const action = actions[index];
      if (String(action?.action || "").toLowerCase() !== "create") continue;

      let score = 0;
      const msgIds = (Array.isArray(action.partnerMessageIds) ? action.partnerMessageIds : []).map(String);

      if (msgIds.includes(mid)) score += 100;

      if (messageInvite && action.invite) {
        const actionInviteCode = extractInviteCode(String(action.invite));
        if (
          actionInviteCode &&
          actionInviteCode.toLowerCase() === String(messageInvite).toLowerCase()
        ) {
          score += 60;
        }
      }

      if (messageManagerId && String(action.managerId || "") === String(messageManagerId)) {
        score += 25;
      }

      const partnerName = normalizePartnerLookupName(action.partner);
      if (partnerName) {
        for (const candidateName of messagePartnerNames) {
          if (
            candidateName === partnerName ||
            candidateName.includes(partnerName) ||
            partnerName.includes(candidateName)
          ) {
            score += 45;
          }
        }
        if (messageText.toLowerCase().includes(partnerName)) score += 20;
      }

      const actionDate = action.date ? new Date(action.date).getTime() : 0;
      if (actionDate > 0) {
        const diff = Math.abs(messageCreated - actionDate);
        if (diff <= 15 * 60 * 1000) score += 30;
        else if (diff <= 60 * 60 * 1000) score += 12;
        else if (diff <= 6 * 60 * 60 * 1000) score += 5;
      }

      if (thankYouMessage && msgIds.includes(mid)) score += 20;

      if (
        String(message.author?.id || "") === String(doc.userId || "") &&
        messageInvite &&
        !thankYouMessage
      ) {
        score += 15;
      }

      if (score > bestScore) {
        bestScore = score;
        best = {
          doc,
          index,
          action,
          partnershipId: normalizePartnershipLogId(action?.globalLogId) || null,
          score: bestScore,
        };
      }
    }
  }

  if (!best || bestScore < 25) return null;
  return best;
}

async function resolvePartnershipLogIdForDeletion(guild, action, contextMessage = null) {
  const fromAction = normalizePartnershipLogId(action?.globalLogId);
  if (fromAction) return fromAction;

  if (contextMessage) {
    const fromContext = extractPartnershipLogIdFromMessage(contextMessage);
    if (fromContext) return fromContext;
  }

  return findPartnershipLogIdFromExecuteLogs(guild, action);
}

async function executePartnershipDeletion(guild, match, actorUserId, client, reason = "unknown", contextMessage = null) {
  if (!match?.doc?.staff?.partnerActions || match.index < 0) {
    return { ok: false, reason: "not_found" };
  }

  const { doc, index, action } = match;
  const partnershipId =
    normalizePartnershipLogId(match.partnershipId) ||
    (await resolvePartnershipLogIdForDeletion(guild, action, contextMessage));
  const wasPenalized =
    Array.isArray(action?.auditPenaltyDates) && action.auditPenaltyDates.length > 0;

  const leaveReason = String(reason || "").trim().toLowerCase();
  let staffIsPartnerManager = true;
  if (leaveReason === "manager_leave") {
    const { memberHasPartnerManagerRole } = require("../../Utils/Partner/partnershipConfigResolver");
    const staffMember = await guild.members.fetch(String(doc.userId || "")).catch(() => null);
    staffIsPartnerManager = memberHasPartnerManagerRole(staffMember, guild.id);
  }
  if (leaveReason === "manager_leave" && !wasPenalized && staffIsPartnerManager) {
    await logPointRemoval(guild, doc.userId, MANAGER_LEFT_SERVER_REASON, action).catch((err) => {
      global.logger?.warn?.("[tenantPartnershipDelete] puntiTolti log failed:", err?.message || err);
    });
  }

  await deletePartnerActionMessages(guild, action);

  const removedManagerId = String(action?.managerId || "").trim();
  doc.staff.partnerActions.splice(index, 1);

  if (leaveReason === "manager_leave" && !staffIsPartnerManager && !wasPenalized) {
      } else if (!wasPenalized) {
    doc.staff.partnerCount = Math.max(0, Number(doc.staff.partnerCount || 0) - 1);
  } else {
    const { getPartnerServerResetMs } = require("../../Utils/Staff/partnerPointsDisplayUtils");
    doc.staff.partnerCount = countPartnerCreateActions(doc.staff.partnerActions, {
      afterMs: getPartnerServerResetMs(doc.staff),
    });
  }

  if (removedManagerId && String(doc.staff.managerId || "") === removedManagerId) {
    const lastCreate = [...doc.staff.partnerActions]
      .reverse()
      .find((row) => String(row?.action || "").toLowerCase() === "create");
    doc.staff.managerId = lastCreate?.managerId || null;
  }

  doc.markModified("staff");
  await doc.save().catch((err) => {
    global.logger?.warn?.("[tenantPartnershipDelete] save failed:", err?.message || err);
    throw err;
  });

  invalidateLeaderboardCache();

  if (!shouldApplyMainPartnershipFilters(guild.id)) {
    await evaluateTenantObjectives(client, guild.id, doc.userId, { refreshLeaderboard: true }).catch(() => null);
  }

  await sendPartnershipDeleteLog({
    client,
    guild,
    logsChannelId: resolvePartnershipLifecycleLogChannelId(guild.id),
    partnershipId,
    pmUserId: doc.userId,
    managerId: action?.managerId || null,
    partnerName: action?.partner || "",
    actorUserId,
    reason,
  }).catch(() => null);

  return {
    ok: true,
    partnershipId,
    pmUserId: doc.userId,
    managerId: action?.managerId || null,
    partnerName: action?.partner || "",
        pointsAdjusted: !(leaveReason === "manager_leave" && !staffIsPartnerManager && !wasPenalized) && !wasPenalized,
  };
}

async function deletePartnershipByGlobalLogId(guild, globalLogId, actorUserId, client, reason = "slash_command") {
  const match = await findPartnerActionByGlobalLogId(guild?.id, globalLogId);
  if (!match) return { ok: false, reason: "not_found" };
  return executePartnershipDeletion(guild, match, actorUserId, client, reason);
}

async function deletePartnershipByMessage(guild, message, actorUserId, client, reason = "context_menu") {
  const match = await findPartnerActionByMessage(guild?.id, message);
  if (!match) return { ok: false, reason: "not_found" };
  return executePartnershipDeletion(guild, match, actorUserId, client, reason, message);
}

async function deletePartnershipFromContextMessage(guild, message, actorUserId, client, reason = "context_menu") {
  const logId = extractPartnershipLogIdFromMessage(message);
  if (logId) {
    const byLog = await deletePartnershipByGlobalLogId(guild, logId, actorUserId, client, reason);
    if (byLog?.ok) return byLog;
  }
  return deletePartnershipByMessage(guild, message, actorUserId, client, reason);
}

async function deletePartnershipsForManagerLeave(guild, managerUserId, client) {
  const gid = String(guild?.id || "").trim();
  const mid = String(managerUserId || "").trim();
  if (!gid || !mid) return 0;

  let removed = 0;
  while (true) {
    const doc = await ActivityUserProfile.findOne({
      guildId: gid,
      "staff.partnerActions": {
        $elemMatch: {
          action: "create",
          managerId: mid,
        },
      },
    }).catch(() => null);
    if (!doc?.staff?.partnerActions) break;

    const actions = Array.isArray(doc.staff.partnerActions) ? doc.staff.partnerActions : [];
    const index = actions.findIndex(
      (row) =>
        String(row?.action || "").toLowerCase() === "create" &&
        String(row?.managerId || "") === mid,
    );
    if (index < 0) break;

    const action = actions[index];
    const result = await executePartnershipDeletion(
      guild,
      {
        doc,
        index,
        action,
        partnershipId: normalizePartnershipLogId(action?.globalLogId) || null,
      },
      mid,
      client,
      "manager_leave",
    ).catch(() => ({ ok: false }));
    if (!result?.ok) break;
    removed += 1;
  }
  return removed;
}

async function deletePartnershipsForPmStaffLeave(guild, pmUserId, client) {
  const gid = String(guild?.id || "").trim();
  const uid = String(pmUserId || "").trim();
  if (!gid || !uid) return 0;

  let removed = 0;
  while (true) {
    const doc = await ActivityUserProfile.findOne({
      guildId: gid,
      userId: uid,
      "staff.partnerActions": {
        $elemMatch: { action: "create" },
      },
    }).catch(() => null);
    if (!doc?.staff?.partnerActions) break;

    const actions = Array.isArray(doc.staff.partnerActions) ? doc.staff.partnerActions : [];
    const index = actions.findIndex(
      (row) => String(row?.action || "").toLowerCase() === "create",
    );
    if (index < 0) break;

    const action = actions[index];
    const result = await executePartnershipDeletion(
      guild,
      {
        doc,
        index,
        action,
        partnershipId: normalizePartnershipLogId(action?.globalLogId) || null,
      },
      uid,
      client,
      "pm_staff_leave",
    ).catch((err) => {
      global.logger?.warn?.(
        "[tenantPartnershipDelete] pm_staff_leave delete failed:",
        err?.message || err,
      );
      return { ok: false };
    });
    if (!result?.ok) break;
    removed += 1;
  }

  if (removed > 0) {
    await ActivityUserProfile.updateOne(
      { guildId: gid, userId: uid },
      {
        $set: {
          "staff.partnerCount": 0,
          "staff.managerId": null,
          updatedAt: new Date(),
        },
      },
    ).catch(() => null);
    invalidateLeaderboardCache();
  }

  return removed;
}

module.exports = {
  findPartnerActionByGlobalLogId,
  findPartnerActionByMessage,
  executePartnershipDeletion,
  deletePartnershipByGlobalLogId,
  deletePartnershipByMessage,
  deletePartnershipFromContextMessage,
  deletePartnershipsForManagerLeave,
  deletePartnershipsForPmStaffLeave,
};
