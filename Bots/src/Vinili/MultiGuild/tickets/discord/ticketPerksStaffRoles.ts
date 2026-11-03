const IDs = require("../../../Config/ids") as typeof import("../../../Config/ids");
const SENIOR_MODERATOR_ROLE_ID = IDs.roles.SeniorModerator;
const DIRECTOR_ROLE_ID = IDs.roles.Director;
const HIGHSTAFF_ROLE_ID = IDs.roles.HighStaff;
const PERKS_STAFF_ROLE_IDS = [SENIOR_MODERATOR_ROLE_ID, DIRECTOR_ROLE_ID, HIGHSTAFF_ROLE_ID].filter(Boolean);
const PERKS_PING_ROLE_IDS = [SENIOR_MODERATOR_ROLE_ID, DIRECTOR_ROLE_ID].filter(Boolean);

function memberCanAccessPerksTicket(member?) {
  if (!member?.roles?.cache) return false;
  return PERKS_STAFF_ROLE_IDS.some((roleId?) => member.roles.cache.has(roleId));
}

export = { PERKS_STAFF_ROLE_IDS, memberCanAccessPerksTicket };
