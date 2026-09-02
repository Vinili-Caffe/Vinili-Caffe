const IDs = require("../Config/ids");

function alwaysAccessStaffThreadRoleIds() {
  return [IDs.roles?.Founder, IDs.roles?.Manager, IDs.roles?.Admin].filter(Boolean).map(String);
}

function isHighStaffExclusiveThreadSpec(spec) {
  const key = String(spec?.key || "");
    return key === "high" || key === "highStaff";
}

function resolveStaffThreadQualifyingRoleIds(spec) {
  return [...new Set([...(spec?.roleIds?.() || []), ...alwaysAccessStaffThreadRoleIds()])];
}

function memberHasStaffThreadAccess(member, spec) {
  const uid = String(member?.id || "").trim();
  const reviewerUserIds = (spec?.reviewerUserIds?.() || []).map(String).filter(Boolean);
  if (uid && reviewerUserIds.includes(uid)) return true;

  const cache = member?.roles?.cache;
  if (!cache || cache.size === 0) return null;

  const always = alwaysAccessStaffThreadRoleIds();
  if (always.some((rid) => cache.has(String(rid)))) return true;

    if (isHighStaffExclusiveThreadSpec(spec)) {
    const directorId = String(IDs.roles?.Director || "").trim();
    if (directorId && cache.has(directorId)) return false;
  }

  const roleIds = resolveStaffThreadQualifyingRoleIds(spec);
  return roleIds.some((rid) => cache.has(String(rid)));
}

function memberQualifiesForStaffThreadSpec(member, spec) {
  const access = memberHasStaffThreadAccess(member, spec);
  return access === true;
}

module.exports = {
  alwaysAccessStaffThreadRoleIds,
  isHighStaffExclusiveThreadSpec,
  resolveStaffThreadQualifyingRoleIds,
  memberHasStaffThreadAccess,
  memberQualifiesForStaffThreadSpec,
};
