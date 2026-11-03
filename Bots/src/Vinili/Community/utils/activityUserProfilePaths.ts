const { ACTIVITY_MAIN_GUILD_ID } = require("../schemas/communitySchemas") as typeof import("../schemas/communitySchemas");

function automodBadUser(...parts) {
  return ["moderation", "automodBadUser", ...parts].join(".");
}

function joinGateSuspicious(...parts) {
  return ["moderation", "joinGateSuspicious", ...parts].join(".");
}

const MOD_CASES_PATH = "moderation.modCases";

function totals(...parts) {
  return ["profile", "totals", ...parts].join(".");
}

export = {
  ACTIVITY_MAIN_GUILD_ID,
  automodBadUser,
  joinGateSuspicious,
  totals,
  MOD_CASES_PATH,
};