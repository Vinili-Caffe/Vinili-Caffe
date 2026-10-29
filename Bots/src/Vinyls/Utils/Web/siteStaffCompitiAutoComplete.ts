/**
 * Auto-submit compiti settimanali (trigger → status submitted; HS conferma).
 * Marker: compitiAutoSubmit1
 */
const {
  tryAutoSubmitCompito,
  tickInviteActiveCompiti,
  currentRomeIsoWeekKey,
} = require("./siteStaffCompitiApi") as typeof import("./siteStaffCompitiApi");

export = {
  tryAutoSubmitCompito,
  tickInviteActiveCompiti,
  currentRomeIsoWeekKey,
};
