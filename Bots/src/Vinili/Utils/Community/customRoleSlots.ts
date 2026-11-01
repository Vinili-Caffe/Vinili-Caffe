const IDs = require("../Config/ids") as typeof import("../Config/ids");

function uniqDiscordRoleIds(list?) {
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

const CUSTOM_ROLE_DOUBLE_SLOT_ROLE_IDS = uniqDiscordRoleIds([
  IDs?.roles?.DoubleBooster,
  IDs?.roles?.VIPplus,
  IDs?.roles?.["VIP+"],
  IDs?.roles?.Level120,
]);

const CUSTOM_ROLE_SINGLE_SLOT_ROLE_IDS = uniqDiscordRoleIds([
  IDs?.roles?.VIP,
  IDs?.roles?.ServerBooster,
  IDs?.roles?.Level50,
]);

function getCustomRoleSlotCapFromRoles(member?) {
  if (!member?.roles?.cache) return 0;
  if (CUSTOM_ROLE_DOUBLE_SLOT_ROLE_IDS.some((roleId?) => member.roles.cache.has(roleId))) return 2;
  if (CUSTOM_ROLE_SINGLE_SLOT_ROLE_IDS.some((roleId?) => member.roles.cache.has(roleId))) return 1;
  return 0;
}

function normalizeCustomRoleExtraUnlocks(arg?) {
  if (arg && typeof arg === "object" && !Array.isArray(arg)) {
    return Boolean(
      arg.hasContestSecondPlaceUnlock ||
        arg.contest ||
        arg.hasEventWeek2Grant ||
        arg.hasEventWeek3Grant ||
        arg.hasPartnerManagerCustomBundle,
    );
  }
  return Boolean(arg);
}

function getCustomRoleSlotCapWithContest(member?, extraUnlocks?) {
  const fromRoles = getCustomRoleSlotCapFromRoles(member);
  return Math.max(fromRoles, normalizeCustomRoleExtraUnlocks(extraUnlocks) ? 1 : 0);
}

function memberHasCustomRolePanelAccess(member?, extraUnlocks?) {
  return getCustomRoleSlotCapWithContest(member, extraUnlocks) >= 1;
}

export = {
  getCustomRoleSlotCapFromRoles,
  getCustomRoleSlotCapWithContest,
  memberHasCustomRolePanelAccess,
};