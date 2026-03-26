/**
 * Path Mongo/Mongoose per campi dentro `activityuserprofiles` (ActivityUserProfile).
 * Evita stringhe duplicate e nomi di collection legacy.
 */
const { ACTIVITY_MAIN_GUILD_ID } = require("../../Schemas/Community/communitySchemas");

function automodBadUser(...parts) {
  return ["moderation", "automodBadUser", ...parts].join(".");
}

function joinGateSuspicious(...parts) {
  return ["moderation", "joinGateSuspicious", ...parts].join(".");
}

function sponsorMainLeave(...parts) {
  return ["profile", "sponsorMainLeave", ...parts].join(".");
}

/** Path root per array case compact in ActivityUserProfile (ex `mod_case_users`). */
const MOD_CASES_PATH = "moderation.modCases";

function totals(...parts) {
  return ["profile", "totals", ...parts].join(".");
}

module.exports = {
  ACTIVITY_MAIN_GUILD_ID,
  automodBadUser,
  joinGateSuspicious,
  sponsorMainLeave,
  totals,
  MOD_CASES_PATH,
};