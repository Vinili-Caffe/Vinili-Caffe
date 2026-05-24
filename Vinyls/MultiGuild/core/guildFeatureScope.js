const { isMultiGuildLayerEnabled } = require("./env");
const { isViniliProtectedGuild } = require("./viniliProtectedGuilds");

function isViniliFullFeatureGuild(guildId) {
  if (!isMultiGuildLayerEnabled()) return true;
  return isViniliProtectedGuild(guildId);
}

module.exports = { isViniliFullFeatureGuild };