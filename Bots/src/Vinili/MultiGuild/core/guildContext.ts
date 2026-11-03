const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { resolveGuildAccess } = require("./guildRegistry") as typeof import("./guildRegistry");
const { createFeatureGate } = require("./featureGate") as typeof import("./featureGate");
const { buildIdsOverlay } = require("../bridge/legacyIds") as typeof import("../bridge/legacyIds");
const { isViniliProtectedGuild } = require("./viniliProtectedGuilds") as typeof import("./viniliProtectedGuilds");

function resolveGuildContext(guildId?) {
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

export = { resolveGuildContext };