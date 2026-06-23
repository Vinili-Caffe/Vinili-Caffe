/**
 * Conteggio partnership valide (stesso criterio di partnerLeaderboardRuntime.countValidAllTimePartners).
 * Duplicato qui per evitare dipendenze circolari con la classifica.
 */
function countPartnerCreateActions(actions) {
  if (!Array.isArray(actions)) return 0;
  return actions.reduce((total, action) => {
    if (String(action?.action || "").toLowerCase() !== "create") return total;
    if (Array.isArray(action.auditPenaltyDates) && action.auditPenaltyDates.length > 0) return total;
    return total + 1;
  }, 0);
}

/** Punti partner mostrati: max(contatore, storico create) − riscatti premi (`staff.partnerRedeemSpend`). */
function resolvePartnerPointsShown(staff) {
  if (!staff || typeof staff !== "object") return 0;
  const fromActions = countPartnerCreateActions(staff.partnerActions);
  const fromCounter = Math.max(0, Math.floor(Number(staff.partnerCount ?? 0)));
  const spend = Math.max(0, Math.floor(Number(staff.partnerRedeemSpend ?? 0)));
  return Math.max(0, Math.max(fromCounter, fromActions) - spend);
}

module.exports = { resolvePartnerPointsShown, countPartnerCreateActions };