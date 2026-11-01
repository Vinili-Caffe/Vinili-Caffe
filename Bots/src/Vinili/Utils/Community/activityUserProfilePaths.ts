const { ACTIVITY_MAIN_GUILD_ID } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");

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