/**
 * Conteggio partnership valide (stesso criterio di partnerLeaderboardRuntime.countValidAllTimePartners).
 * Duplicato qui per evitare dipendenze circolari con la classifica.
 *
 * @param {object[]} actions
 * @param {{ afterMs?: number }} [opts] — se afterMs > 0, conta solo create con date >= afterMs (score server post-reset)
 */
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

/** Contatore denormalizzato legacy (e target di `addPartnerPoints`). */
function legacyPartnerCountFloor(staff) {
  if (!staff || typeof staff !== "object") return 0;
  return Math.max(0, Math.floor(Number(staff.partnerCount ?? 0) || 0));
}

/**
 * Partner attribuite allo storico (profilo): ignora il reset server.
 * Usa max(actions, partnerCount): lo storico vecchio vive spesso solo sul contatore.
 */
function resolvePartnerHistoryAttributed(staff) {
  if (!staff || typeof staff !== "object") return 0;
  return Math.max(countPartnerCreateActions(staff.partnerActions), legacyPartnerCountFloor(staff));
}

/**
 * Partner totali “attive” sul server (classifica / punti spendibili).
 * - Con `partnerServerResetAt`: solo create valide dopo il reset (partnerCount è stato azzerato).
 * - Senza reset: max(actions valide, partnerCount) — altrimenti spariscono i punti legacy
 *   e quelli aggiunti da High Staff (che incrementano solo `partnerCount`).
 */
function resolvePartnerTotalEarned(staff) {
  if (!staff || typeof staff !== "object") return 0;
  const afterMs = getPartnerServerResetMs(staff);
  const fromActions = countPartnerCreateActions(staff.partnerActions, { afterMs });
  if (afterMs > 0) return fromActions;
  return Math.max(fromActions, legacyPartnerCountFloor(staff));
}

/** Punti spendibili sul server: earned attivi − riscatti. */
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
