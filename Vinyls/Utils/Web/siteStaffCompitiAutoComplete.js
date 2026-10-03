/**
 * Auto-submit compiti settimanali (trigger → status submitted; HS conferma).
 * Marker: compitiAutoSubmit1
 */
const {
  tryAutoSubmitCompito,
  tickInviteActiveCompiti,
  currentRomeIsoWeekKey,
} = require("./siteStaffCompitiApi");

module.exports = {
  tryAutoSubmitCompito,
  tickInviteActiveCompiti,
  currentRomeIsoWeekKey,
};
