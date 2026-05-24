const IDs = require("../../Utils/Config/ids");
const { resolveGuildAccess } = require("./guildRegistry");
const { createFeatureGate } = require("./featureGate");
const { buildIdsOverlay } = require("../bridge/legacyIds");
const { isViniliProtectedGuild } = require("./viniliProtectedGuilds");

function resolveGuildContext(guildId) {
  const gid = String(guildId || "").trim();
  const access = resolveGuildAccess(gid);
  const protectedGuild = isViniliProtectedGuild(gid) || access.protected === true;
  const managed = access.managed === true && !protectedGuild;
  const entry = access.entry;
  const ids = protectedGuild ? IDs : buildIdsOverlay(entry, IDs);
  const features = protectedGuild ? {} : entry?.features || {};
  return {
    guildId: gid,
    protected: protectedGuild,
    managed,
    allowed: access.allowed,
    mode: access.mode,
    reason: access.reason,
    label: protectedGuild ? "vinili_protected" : entry?.label || null,
    entry,
    ids,
    legacy: false,
    features: createFeatureGate(features),
  };
}

module.exports = { resolveGuildContext };