const IDs = require("../Config/ids");

/**
 * Utenti Discord assegnati ai resoconti per segmento (ID utente, non ruolo).
 * Mappatura fornita dallo staff: ogni @ è la persona che revisiona quel segmento.
 */
const RESOCONTO_SEGMENT_REVIEWER_USER_IDS = {
  pm: ["778934882671656972"],
  helper: ["1334154605445124121"],
  mod: ["1371740280063135908"],
  senior_moderator: ["1056898661365317645"],
  director: ["470373387609571339"],
  admin: ["295500038401163264"],
};

const STAFF_ROLE_ID_TO_REVIEWER_USER_IDS = {
  [String(IDs.roles?.Helper || "")]: RESOCONTO_SEGMENT_REVIEWER_USER_IDS.helper,
  [String(IDs.roles?.Mod || "")]: RESOCONTO_SEGMENT_REVIEWER_USER_IDS.mod,
  [String(IDs.roles?.SeniorModerator || "")]: RESOCONTO_SEGMENT_REVIEWER_USER_IDS.senior_moderator,
  [String(IDs.roles?.Director || "")]: RESOCONTO_SEGMENT_REVIEWER_USER_IDS.director,
  [String(IDs.roles?.Admin || "")]: RESOCONTO_SEGMENT_REVIEWER_USER_IDS.admin,
};

function normalizeUserIds(ids) {
  return [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id || "").trim()).filter((id) => /^\d{16,22}$/.test(id)))];
}

function getResocontoReviewerUserIdsForSegment(segment, staffRoleId = null) {
  const seg = String(segment || "").trim();
  if (seg && RESOCONTO_SEGMENT_REVIEWER_USER_IDS[seg]) {
    return normalizeUserIds(RESOCONTO_SEGMENT_REVIEWER_USER_IDS[seg]);
  }
  const rid = String(staffRoleId || "").trim();
  if (rid && STAFF_ROLE_ID_TO_REVIEWER_USER_IDS[rid]) {
    return normalizeUserIds(STAFF_ROLE_ID_TO_REVIEWER_USER_IDS[rid]);
  }
  return [];
}

/** @deprecated usa getResocontoReviewerUserIdsForSegment */
function getResocontoNotifyRoleIdForSegment(segment, staffRoleId = null) {
  const users = getResocontoReviewerUserIdsForSegment(segment, staffRoleId);
  return users[0] || null;
}

function memberIsResocontoReviewerForSegment(member, segment, staffRoleId = null) {
  const uid = String(member?.id || "").trim();
  if (!uid) return false;
  return getResocontoReviewerUserIdsForSegment(segment, staffRoleId).includes(uid);
}

/** Founder può revisionare ma non riceve la valutazione automatica del compito. */
function memberIsExcludedFromResocontoReviewerReward(member) {
  if (!member?.roles?.cache) return false;
  const founderId = String(IDs.roles?.Founder || "").trim();
  return founderId && member.roles.cache.has(founderId);
}

function getResocontoButtonAllowedRoleIds(payload = {}) {
  const managerId = String(IDs.roles?.Manager || "").trim();
  const founderId = String(IDs.roles?.Founder || "").trim();
  return [managerId, founderId].filter((id) => /^\d{16,22}$/.test(id));
}

function memberHasResocontoButtonAccess(member, payload = {}) {
  if (!member?.id) return false;
  const alwaysRoleIds = getResocontoButtonAllowedRoleIds(payload);
  if (member?.roles?.cache && alwaysRoleIds.some((roleId) => member.roles.cache.has(String(roleId)))) {
    return true;
  }

  const kind = String(payload.kind || "");
  if (kind === "p") {
    return memberIsResocontoReviewerForSegment(member, "pm");
  }

  const staffRoleId = String(payload.roleId || "").trim();
  if (staffRoleId === String(IDs.roles?.Admin || "")) {
    return memberIsResocontoReviewerForSegment(member, "admin");
  }

  return memberIsResocontoReviewerForSegment(member, null, staffRoleId);
}

function parseResocontoPayloadFromCustomId(customId) {
  const raw = String(customId || "");
  if (raw.startsWith("resoconto_apply:") || raw.startsWith("resoconto_reject:")) {
    const parts = raw.split(":");
    const kind = String(parts[1] || "");
    const userId = String(parts[2] || "");
    if (kind === "s") {
      return { kind, userId, roleId: String(parts[3] || "") };
    }
    if (kind === "p") {
      return { kind, userId, roleId: null };
    }
  }
  if (raw.startsWith("resoconto_override:")) {
    const parts = raw.split(":");
    const kind = String(parts[1] || "");
    if (kind === "s") {
      return { kind, userId: String(parts[2] || ""), roleId: String(parts[3] || "") };
    }
    if (kind === "p") {
      return { kind, userId: String(parts[2] || ""), roleId: null };
    }
  }
  if (raw.startsWith("resoconto_reason:")) {
    const parts = raw.split(":");
    const kind = String(parts[1] || "");
    if (kind === "s") {
      return { kind, userId: String(parts[2] || ""), roleId: String(parts[3] || "") };
    }
    if (kind === "p") {
      return { kind, userId: String(parts[2] || ""), roleId: null };
    }
  }
  return null;
}

function interactionHasResocontoButtonAccess(interaction) {
  const payload = parseResocontoPayloadFromCustomId(interaction?.customId);
  if (!payload) return false;
  return memberHasResocontoButtonAccess(interaction?.member, payload);
}

function hasCandidatureReviewAccess(interaction) {
  const member = interaction?.member;
  if (!member?.roles?.cache) return false;

  const directorId = String(IDs.roles?.Director || "").trim();
  if (directorId && member.roles.cache.has(directorId)) return false;

  const allowed = [IDs.roles?.Admin, IDs.roles?.Manager, IDs.roles?.Founder]
    .filter(Boolean)
    .map((id) => String(id));
  return allowed.some((roleId) => member.roles.cache.has(roleId));
}

function isResocontoInteraction(customId) {
  const id = String(customId || "");
  return (
    id.startsWith("resoconto_apply:") ||
    id.startsWith("resoconto_reject:") ||
    id.startsWith("resoconto_override:") ||
    id.startsWith("resoconto_reason:")
  );
}

function isCandidatureStaffReviewInteraction(customId) {
  const id = String(customId || "");
  return (
    id.startsWith("apply_pex:") ||
    id.startsWith("apply_reject:") ||
    id.startsWith("apply_pex_modal:")
  );
}

module.exports = {
  RESOCONTO_SEGMENT_REVIEWER_USER_IDS,
  getResocontoReviewerUserIdsForSegment,
  getResocontoNotifyRoleIdForSegment,
  memberIsResocontoReviewerForSegment,
  memberIsExcludedFromResocontoReviewerReward,
  getResocontoButtonAllowedRoleIds,
  memberHasResocontoButtonAccess,
  interactionHasResocontoButtonAccess,
  parseResocontoPayloadFromCustomId,
  hasCandidatureReviewAccess,
  isResocontoInteraction,
  isCandidatureStaffReviewInteraction,
};
