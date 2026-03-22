/**
 * Path Mongo/Mongoose per campi dentro `activityuserprofiles` (ActivityUserProfile).
 * Evita stringhe duplicate e nomi di collection legacy.
 */
const { ACTIVITY_GLOBAL_GUILD_ID } = require("../../Schemas/Community/communitySchemas");

function automodBadUser(...parts) {
  return ["moderation", "automodBadUser", ...parts].join(".");
}

function joinGateSuspicious(...parts) {
  return ["moderation", "joinGateSuspicious", ...parts].join(".");
}

function sponsorMainLeave(...parts) {
  return ["profile", "sponsorMainLeave", ...parts].join(".");
}

function totals(...parts) {
  return ["totals", ...parts].join(".");
}

module.exports = {
  ACTIVITY_GLOBAL_GUILD_ID,
  automodBadUser,
  joinGateSuspicious,
  sponsorMainLeave,
  totals,
};