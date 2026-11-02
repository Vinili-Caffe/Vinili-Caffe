/**
 * Auto-submit compiti settimanali (trigger → status submitted; HS conferma).
 * Marker: compitiAutoSubmit1
 */
const {
  tryAutoSubmitCompito,
  currentRomeIsoWeekKey,
} = require("./siteStaffCompitiApi") as typeof import("./siteStaffCompitiApi");

export = {
  tryAutoSubmitCompito,
  currentRomeIsoWeekKey,
};
