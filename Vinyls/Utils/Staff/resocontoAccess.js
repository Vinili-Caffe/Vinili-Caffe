const IDs = require("../Config/ids");

/**
 * Utenti Discord assegnati ai resoconti per segmento (ID utente, non ruolo).
 *
 * 2026-08-03: dopo depex di 1334154605445124121, 778934882671656972 fa
 * PM/Helper/Mod/Senior Mod. Director resta a chi è sopra.
 * Admin: nessun resoconto settimanale.
 */
const RESOCONTO_SEGMENT_REVIEWER_USER_IDS = {
  pm: ["778934882671656972"],
  helper: ["778934882671656972"],
  mod: ["778934882671656972"],
  senior_moderator: ["778934882671656972"],
  director: ["295500038401163264"],
};

const RESOCONTO_REVIEWER_SHIFT_CHAIN = ["mod", "senior_moderator", "director"];

const STAFF_ROLE_ID_TO_REVIEWER_USER_IDS = {
  [String(IDs.roles?.Helper || "")]: RESOCONTO_SEGMENT_REVIEWER_USER_IDS.helper,
  [String(IDs.roles?.Mod || "")]: RESOCONTO_SEGMENT_REVIEWER_USER_IDS.mod,
  [String(IDs.roles?.SeniorModerator || "")]: RESOCONTO_SEGMENT_REVIEWER_USER_IDS.senior_moderator,
  [String(IDs.roles?.Director || "")]: RESOCONTO_SEGMENT_REVIEWER_USER_IDS.director,
};

function normalizeUserIds(ids) {
  return [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id || "").trim()).filter((id) => /^\d{16,22}$/.test(id)))];
}

/**
 * Scala i revisori di un livello (es. dopo depex del revisore mod).
 * Il segmento director in cima va riassegnato con `topSegmentReviewers`.
 */
function shiftResocontoReviewersDownOneLevel({ topSegmentReviewers = [] } = {}) {
  const previous = {};
  for (const segment of RESOCONTO_REVIEWER_SHIFT_CHAIN) {
    previous[segment] = normalizeUserIds(RESOCONTO_SEGMENT_REVIEWER_USER_IDS[segment]);
  }
  for (let index = 0; index < RESOCONTO_REVIEWER_SHIFT_CHAIN.length - 1; index += 1) {
    const segment = RESOCONTO_REVIEWER_SHIFT_CHAIN[index];
    const source = RESOCONTO_REVIEWER_SHIFT_CHAIN[index + 1];
    RESOCONTO_SEGMENT_REVIEWER_USER_IDS[segment] = [...previous[source]];
  }
  const topReviewers = normalizeUserIds(topSegmentReviewers);
  if (topReviewers.length) {
    RESOCONTO_SEGMENT_REVIEWER_USER_IDS.director = topReviewers;
  }
  return { ...RESOCONTO_SEGMENT_REVIEWER_USER_IDS };
}

function removeResocontoReviewerUserId(userId) {
  const uid = String(userId || "").trim();
  if (!/^\d{16,22}$/.test(uid)) return false;
  let removed = false;
  for (const segment of Object.keys(RESOCONTO_SEGMENT_REVIEWER_USER_IDS)) {
    const before = normalizeUserIds(RESOCONTO_SEGMENT_REVIEWER_USER_IDS[segment]);
    const after = before.filter((id) => id !== uid);
    if (after.length !== before.length) {
      RESOCONTO_SEGMENT_REVIEWER_USER_IDS[segment] = after;
      removed = true;
    }
  }
  return removed;
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

/** Segmenti per cui `userId` è revisore assegnato. */
function getResocontoSegmentsForReviewerUserId(userId) {
  const uid = String(userId || "").trim();
  if (!/^\d{16,22}$/.test(uid)) return [];
  return Object.keys(RESOCONTO_SEGMENT_REVIEWER_USER_IDS).filter((segment) =>
    getResocontoReviewerUserIdsForSegment(segment).includes(uid),
  );
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

/** Founder/Manager possono revisionare ma non ricevono la valutazione automatica del compito. */
function memberIsExcludedFromResocontoReviewerReward(member) {
  if (!member?.roles?.cache) return false;
  const blockedRoleIds = [
    IDs.roles?.Founder,
    IDs.roles?.Manager,
  ]
    .map((id) => String(id || "").trim())
    .filter(Boolean);
  return blockedRoleIds.some((roleId) => member.roles.cache.has(roleId));
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
  const userId = String(interaction?.user?.id || member?.id || "").trim();
  const ownerId = String(interaction?.guild?.ownerId || "").trim();
  if (userId && ownerId && userId === ownerId) return true;

  if (!member?.roles?.cache) return false;

  const allowed = [IDs.roles?.Admin, IDs.roles?.Manager, IDs.roles?.Founder]
    .filter(Boolean)
    .map((id) => String(id));
  // Admin/Manager/Founder vincono anche se la persona ha anche Director.
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
  RESOCONTO_REVIEWER_SHIFT_CHAIN,
  shiftResocontoReviewersDownOneLevel,
  removeResocontoReviewerUserId,
  getResocontoReviewerUserIdsForSegment,
  getResocontoSegmentsForReviewerUserId,
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
