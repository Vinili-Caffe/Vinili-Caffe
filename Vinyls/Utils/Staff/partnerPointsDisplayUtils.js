function countPartnerCreateActions(actions, opts = {}) {
  if (!Array.isArray(actions)) return 0;
  const afterMs = Math.max(0, Number(opts.afterMs || 0) || 0);
  return actions.reduce((total, action) => {
    if (String(action?.action || "").toLowerCase() !== "create") return total;
    if (Array.isArray(action.auditPenaltyDates) && action.auditPenaltyDates.length > 0) return total;
    if (afterMs > 0) {
      const when = action?.date != null ? new Date(action.date).getTime() : 0;
      if (!Number.isFinite(when) || when < afterMs) return total;
    }
    return total + 1;
  }, 0);
}

function getPartnerServerResetMs(staff) {
  if (!staff || typeof staff !== "object") return 0;
  const raw = staff.partnerServerResetAt;
  if (!raw) return 0;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) && ms > 0 ? ms : 0;
}

function legacyPartnerCountFloor(staff) {
  if (!staff || typeof staff !== "object") return 0;
  return Math.max(0, Math.floor(Number(staff.partnerCount ?? 0) || 0));
}

function resolvePartnerHistoryAttributed(staff) {
  if (!staff || typeof staff !== "object") return 0;
  return Math.max(countPartnerCreateActions(staff.partnerActions), legacyPartnerCountFloor(staff));
}

function resolvePartnerTotalEarned(staff) {
  if (!staff || typeof staff !== "object") return 0;
  const afterMs = getPartnerServerResetMs(staff);
  const fromActions = countPartnerCreateActions(staff.partnerActions, { afterMs });
  if (afterMs > 0) return fromActions;
  return Math.max(fromActions, legacyPartnerCountFloor(staff));
}

function resolvePartnerPointsShown(staff) {
  const earned = resolvePartnerTotalEarned(staff);
  if (!staff || typeof staff !== "object") return earned;
  const spend = Math.max(0, Math.floor(Number(staff.partnerRedeemSpend ?? 0)));
  return Math.max(0, earned - spend);
}

module.exports = {
  resolvePartnerPointsShown,
  resolvePartnerTotalEarned,
  resolvePartnerHistoryAttributed,
  countPartnerCreateActions,
  getPartnerServerResetMs,
  legacyPartnerCountFloor,
};
