const IDs = require("../Config/ids");

function alwaysAccessStaffThreadRoleIds() {
  return [IDs.roles?.Founder, IDs.roles?.Manager, IDs.roles?.Admin].filter(Boolean).map(String);
}

function resolveStaffThreadQualifyingRoleIds(spec) {
  return [...new Set([...(spec?.roleIds?.() || []), ...alwaysAccessStaffThreadRoleIds()])];
}

/**
 * @returns {boolean|null} null se la cache ruoli non è affidabile
 */
function memberHasStaffThreadAccess(member, spec) {
  const uid = String(member?.id || "").trim();
  const reviewerUserIds = (spec?.reviewerUserIds?.() || []).map(String).filter(Boolean);
  if (uid && reviewerUserIds.includes(uid)) return true;

  const cache = member?.roles?.cache;
  if (!cache || cache.size === 0) return null;
  const roleIds = resolveStaffThreadQualifyingRoleIds(spec);
  return roleIds.some((rid) => cache.has(String(rid)));
}

function memberQualifiesForStaffThreadSpec(member, spec) {
  const access = memberHasStaffThreadAccess(member, spec);
  return access === true;
}

module.exports = {
  alwaysAccessStaffThreadRoleIds,
  resolveStaffThreadQualifyingRoleIds,
  memberHasStaffThreadAccess,
  memberQualifiesForStaffThreadSpec,
};
