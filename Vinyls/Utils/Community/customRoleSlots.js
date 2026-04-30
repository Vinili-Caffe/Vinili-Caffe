const IDs = require("../Config/ids");

function uniqDiscordRoleIds(list) {
  const out = [];
  const seen = new Set();
  for (const id of Array.isArray(list) ? list : []) {
    const s = String(id || "").trim();
    if (!/^\d{17,22}$/.test(s) || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/** Tier premium: max 2 custom role totali (primario + secondario), non cumulabili con altri ruoli. */
const CUSTOM_ROLE_DOUBLE_SLOT_ROLE_IDS = uniqDiscordRoleIds([
  IDs?.roles?.DoubleBooster,
  IDs?.roles?.VIPplus,
  IDs?.roles?.["VIP+"],
]);

/** Tier base: max 1 custom role totale (anche se ne hai piu di uno tra Level 50 / Booster / VIP). */
const CUSTOM_ROLE_SINGLE_SLOT_ROLE_IDS = uniqDiscordRoleIds([
  IDs?.roles?.VIP,
  IDs?.roles?.ServerBooster,
  IDs?.roles?.Level50,
]);

function getCustomRoleSlotCapFromRoles(member) {
  if (!member?.roles?.cache) return 0;
  if (CUSTOM_ROLE_DOUBLE_SLOT_ROLE_IDS.some((roleId) => member.roles.cache.has(roleId))) return 2;
  if (CUSTOM_ROLE_SINGLE_SLOT_ROLE_IDS.some((roleId) => member.roles.cache.has(roleId))) return 1;
  return 0;
}

/** Unlock contest: al massimo +1 slot rispetto a zero (non si somma ad altri tier). */
function getCustomRoleSlotCapWithContest(member, hasContestSecondPlaceUnlock) {
  const fromRoles = getCustomRoleSlotCapFromRoles(member);
  return Math.max(fromRoles, hasContestSecondPlaceUnlock ? 1 : 0);
}

function memberHasCustomRolePanelAccess(member, hasContestSecondPlaceUnlock) {
  return getCustomRoleSlotCapWithContest(member, Boolean(hasContestSecondPlaceUnlock)) >= 1;
}

/** Il secondo slot esiste solo col tier premium (2 totali), mai da cumulo Level50+Booster ecc. */
function memberHasCustomRoleSecondarySlot(member) {
  return getCustomRoleSlotCapFromRoles(member) >= 2;
}

module.exports = {
  CUSTOM_ROLE_DOUBLE_SLOT_ROLE_IDS,
  CUSTOM_ROLE_SINGLE_SLOT_ROLE_IDS,
  getCustomRoleSlotCapFromRoles,
  getCustomRoleSlotCapWithContest,
  memberHasCustomRolePanelAccess,
  memberHasCustomRoleSecondarySlot,
};