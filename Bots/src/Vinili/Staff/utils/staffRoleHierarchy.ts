const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const {
  remapRoleIdForward,
  memberHasAnyRemappedRole,
} = require("../../Config/emergencyRoleIdRemap") as typeof import("../../Config/emergencyRoleIdRemap");

const STAFF_LADDER_KEYS_HIGH_TO_LOW = Object.freeze([
  "Founder",
  "Manager",
  "Admin",
  "Director",
  "SeniorModerator",
  "Mod",
  "Helper",
]);

function staffRoleId(key?) {
  const raw = String(IDs.roles?.[key] || "").trim();
  if (!raw) return "";
  return remapRoleIdForward(raw) || raw;
}

function staffLadderRoleIds(keys = STAFF_LADDER_KEYS_HIGH_TO_LOW) {
  return keys.map(staffRoleId).filter(Boolean);
}

/** Remap-aware role check (post emergency role restore). */
function memberHasRoleId(member?, roleIdOrIds?) {
  return memberHasAnyRemappedRole(member, roleIdOrIds);
}

function memberHasConfiguredRole(member?, roleKey?) {
  const id = staffRoleId(roleKey);
  if (!id) return false;
  return memberHasRoleId(member, id);
}

function getHighestStaffLadderRoleId(member?, keys = STAFF_LADDER_KEYS_HIGH_TO_LOW) {
  if (!member?.roles?.cache) return null;
  for (const key of keys) {
    const id = staffRoleId(key);
    if (id && memberHasRoleId(member, id)) return id;
  }
  return null;
}

function memberHasAnyRoleKey(member?, keys?) {
  if (!member?.roles?.cache) return false;
  return staffLadderRoleIds(keys).some((id?) => memberHasRoleId(member, id));
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

const STAFF_HIGH_STAFF_ELIGIBLE_KEYS = Object.freeze([
  "Founder",
  "Manager",
  "Admin",
  "HighStaff",
]);

function memberIsHighStaffEligible(member?) {
  return memberHasAnyRoleKey(member, STAFF_HIGH_STAFF_ELIGIBLE_KEYS);
}

function memberHasDirectorRole(member?) {
  return memberHasAnyRoleKey(member, ["Director"]);
}

function memberCanReviewAppelli(member?) {
  return memberIsHighStaffEligible(member) || memberHasDirectorRole(member);
}

/** Staffer del mese / della settimana — tolti su ogni depex. */
function stafferAwardRoleIds() {
  return [
    staffRoleId("StafferDelMese"),
    staffRoleId("StafferDellaSettimana"),
  ].filter(Boolean);
}

async function stripStafferAwardRoles(member?) {
  const ids = stafferAwardRoleIds();
  if (!ids.length || !member?.roles?.remove) return member;
  const held = ids.filter((id?) => memberHasRoleId(member, id));
  if (!held.length) return member;
  await member.roles.remove(held).catch(() => null);
  return member;
}

export = {
  STAFF_LADDER_KEYS_HIGH_TO_LOW,
  STAFF_HIGH_STAFF_ELIGIBLE_KEYS,
  staffRoleId,
  staffLadderRoleIds,
  memberHasRoleId,
  memberHasConfiguredRole,
  getHighestStaffLadderRoleId,
  memberHasAnyRoleKey,
  memberIsHighStaffEligible,
  memberHasDirectorRole,
  memberCanReviewAppelli,
  stafferAwardRoleIds,
  stripStafferAwardRoles,
};
