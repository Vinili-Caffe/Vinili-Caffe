const { isMultiGuildLayerEnabled } = require("./env") as typeof import("./env");
const { isViniliProtectedGuild } = require("./viniliProtectedGuilds") as typeof import("./viniliProtectedGuilds");

function isViniliFullFeatureGuild(guildId?) {
  if (!isMultiGuildLayerEnabled()) return true;
  return isViniliProtectedGuild(guildId);
}

export = { isViniliFullFeatureGuild };