const { isViniliFullFeatureGuild } = require("./guildFeatureScope");
const { isTenantFeaturePrefixCommand } = require("./openMediaCommands");

function resolveTenantPrefixRestriction(guildId, commandName, options = {}) {
  if (isViniliFullFeatureGuild(guildId)) return null;
  if (isTenantFeaturePrefixCommand(commandName)) return null;
  if (options?.returnDetails) {
    return {
      allowed: false,
      reason: "multi_guild_tenant_only_media",
      requiredRoles: null,
      channels: null,
    };
  }
  return false;
}

module.exports = { isViniliFullFeatureGuild, resolveTenantPrefixRestriction };