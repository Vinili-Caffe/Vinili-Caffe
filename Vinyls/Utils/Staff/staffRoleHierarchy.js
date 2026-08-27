const IDs = require("../Config/ids");

/** Chiavi ruoli staff in ordine decrescente (Founder → … → Helper). */
const STAFF_LADDER_KEYS_HIGH_TO_LOW = Object.freeze([
  "Founder",
  "Manager",
  "Admin",
  "Director",
  "SeniorModerator",
  "Mod",
  "Helper",
]);

function staffRoleId(key) {
  return String(IDs.roles?.[key] || "").trim();
}

function staffLadderRoleIds(keys = STAFF_LADDER_KEYS_HIGH_TO_LOW) {
  return keys.map(staffRoleId).filter(Boolean);
}

function getHighestStaffLadderRoleId(member, keys = STAFF_LADDER_KEYS_HIGH_TO_LOW) {
  if (!member?.roles?.cache) return null;
  for (const key of keys) {
    const id = staffRoleId(key);
    if (id && member.roles.cache.has(id)) return id;
  }
  return null;
}

function memberHasAnyRoleKey(member, keys) {
  if (!member?.roles?.cache) return false;
  return staffLadderRoleIds(keys).some((id) => member.roles.cache.has(id));
}

const STAFF_PROMOTION_ROLE_UP = Object.freeze({
  [staffRoleId("Member")]: staffRoleId("Helper"),
  [staffRoleId("Helper")]: staffRoleId("Mod"),
  [staffRoleId("Mod")]: staffRoleId("SeniorModerator"),
  [staffRoleId("SeniorModerator")]: staffRoleId("Director"),
  [staffRoleId("Director")]: staffRoleId("Admin"),
  [staffRoleId("Admin")]: staffRoleId("Manager"),
});

const STAFF_COORDINATOR_ROLE_KEYS = Object.freeze([
  "Founder",
  "Manager",
  "Admin",
  "Director",
  "HighStaff",
]);

/** Accesso dashboard sito: solo High Staff+ del main (NO Director / Manage Server). */
const STAFF_HIGH_STAFF_ELIGIBLE_KEYS = Object.freeze([
  "Founder",
  "Manager",
  "Admin",
  "HighStaff",
]);

function memberIsHighStaffEligible(member) {
  return memberHasAnyRoleKey(member, STAFF_HIGH_STAFF_ELIGIBLE_KEYS);
}

/** Director: candidature + appelli in inbox (non le pause High Staff). */
function memberHasDirectorRole(member) {
  return memberHasAnyRoleKey(member, ["Director"]);
}

function memberCanReviewAppelli(member) {
  return memberIsHighStaffEligible(member) || memberHasDirectorRole(member);
}

module.exports = {
  STAFF_LADDER_KEYS_HIGH_TO_LOW,
  STAFF_PROMOTION_ROLE_UP,
  STAFF_COORDINATOR_ROLE_KEYS,
  STAFF_HIGH_STAFF_ELIGIBLE_KEYS,
  staffRoleId,
  staffLadderRoleIds,
  getHighestStaffLadderRoleId,
  memberHasAnyRoleKey,
  memberIsHighStaffEligible,
  memberHasDirectorRole,
  memberCanReviewAppelli,
};
