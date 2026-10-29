const { isViniliFullFeatureGuild } = require("./guildFeatureScope") as typeof import("./guildFeatureScope");
const { isTenantFeaturePrefixCommand } = require("./openMediaCommands") as typeof import("./openMediaCommands");

function resolveTenantPrefixRestriction(guildId?, commandName?, options: Record<string, any> = {}) {
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

export = { isViniliFullFeatureGuild, resolveTenantPrefixRestriction };