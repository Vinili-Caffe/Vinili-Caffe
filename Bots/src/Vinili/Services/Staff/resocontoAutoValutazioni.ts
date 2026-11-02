/** Resoconti settimanali: valutazioni automatiche (limiti, sanzioni, revisori) e collegamento ai log. */
const {
  STAFF_LIMITS_POSITIVE_MULTIPLIER,
  shouldSkipLimitAutovalutazioniForStaffMember,
  shouldSkipSanctionAutovalutazioniForStaffMember,
  shouldSkipManualResocontoVp,
  shouldSkipManualResocontoVn,
  getResocontoCycleWeekKey,
  getResocontoCycleMessagesSince,
} = require("./resocontoAutoValShared") as typeof import("./resocontoAutoValShared");
const {
  classifyResocontoReviewerAutoEntry,
  staffHasResocontoCompitoClaim,
  rememberResocontoCompitoClaim,
} = require("./resocontoAutoValReviewer") as typeof import("./resocontoAutoValReviewer");
const {
  ensureWeeklyLimitAutoValutazione,
  applyWeeklyStaffAutoValutazioniForMember,
} = require("./resocontoAutoValEnsure") as typeof import("./resocontoAutoValEnsure");

export = {
  STAFF_LIMITS_POSITIVE_MULTIPLIER,
  shouldSkipLimitAutovalutazioniForStaffMember,
  shouldSkipSanctionAutovalutazioniForStaffMember,
  shouldSkipManualResocontoVp,
  shouldSkipManualResocontoVn,
  classifyResocontoReviewerAutoEntry,
  staffHasResocontoCompitoClaim,
  rememberResocontoCompitoClaim,
  ensureWeeklyLimitAutoValutazione,
  applyWeeklyStaffAutoValutazioniForMember,
  getResocontoCycleWeekKey,
  getResocontoCycleMessagesSince,
};
