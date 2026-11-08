/**
 * Auto-submit compiti settimanali (trigger → status submitted; HS conferma).
 * Marker: compitiAutoSubmit1
 */
const {
  tryAutoSubmitCompito,
  tryAutoFailCompito,
  currentRomeIsoWeekKey,
} = require("./siteStaffCompitiApi") as typeof import("./siteStaffCompitiApi");

export = {
  tryAutoSubmitCompito,
  tryAutoFailCompito,
  currentRomeIsoWeekKey,
};
