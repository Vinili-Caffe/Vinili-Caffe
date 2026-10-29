const { resolveGuildAccess } = require("./guildRegistry") as typeof import("./guildRegistry");
const { isViniliProtectedGuild } = require("./viniliProtectedGuilds") as typeof import("./viniliProtectedGuilds");
const { isViniliFullFeatureGuild } = require("./guildFeatureScope") as typeof import("./guildFeatureScope");

function isProtectedAccess(access?) {
  return access?.protected === true || access?.mode === "protected";
}

function shouldApplyMultiGuildLayer(guildId?) {
  if (!isViniliProtectedGuild(guildId)) {
    const access = resolveGuildAccess(guildId);
    return access.managed === true;
  }
  return false;
}

function shouldRunViniliAutomations(guildId?) {
  if (isViniliProtectedGuild(guildId)) return false;
  const access = resolveGuildAccess(guildId);
  return access.managed === true;
}

function shouldUseMultiGuildCommandGate(guildId?) {
  if (isViniliProtectedGuild(guildId)) return false;
  const access = resolveGuildAccess(guildId);
  if (!access.managed) return false;
  return true;
}

function isTenantFeatureEnabled(guildId?, featureKey?) {
  if (isViniliProtectedGuild(guildId)) return false;
  const key = String(featureKey || "").trim();
  if (!key) return false;
  const access = resolveGuildAccess(guildId);
  return (
    access?.managed === true &&
    access?.allowed === true &&
    access?.entry?.features?.[key] === true
  );
}

function canInvokePrefixCommand(guildId?, commandCategory?) {
  if (isViniliProtectedGuild(guildId)) {
    return { ok: true, managed: false, reason: "vinili_protected" };
  }
  const access = resolveGuildAccess(guildId);
  if (!access.managed) {
    return { ok: false, managed: false, reason: access.reason || "guild_not_managed" };
  }
  if (!access.allowed) {
    return { ok: false, managed: true, reason: access.reason || "tenant_disabled" };
  }
  const category = String(commandCategory || "").trim().toLowerCase();
  const featureKey = mapCategoryToFeature(category);
  if (!featureKey) {
    return { ok: true, managed: true, reason: "category_unmapped" };
  }
  const enabled = access.entry?.features?.[featureKey] === true;
  return enabled
    ? { ok: true, managed: true, reason: "feature_enabled" }
    : { ok: false, managed: true, reason: `feature_disabled:${featureKey}` };
}

function mapCategoryToFeature(category?) {
  const map = {
    utility: "utility",
    music: "music",
    tts: "tts",
    minigames: "minigames",
    moderation: "moderation",
    level: "level",
    stats: "stats",
    economy: "economy",
    staff: "staff_tools",
    admin: "staff_tools",
    dev: "staff_tools",
    partnership: "partnership",
  };
  return map[String(category || "").toLowerCase()] || null;
}

function shouldRunViniliCommunityFeatures(guildId?) {
  return isViniliFullFeatureGuild(guildId);
}

export = {
  isProtectedAccess,
  isViniliFullFeatureGuild,
  shouldRunViniliCommunityFeatures,
  shouldApplyMultiGuildLayer,
  shouldRunViniliAutomations,
  shouldUseMultiGuildCommandGate,
  canInvokePrefixCommand,
  mapCategoryToFeature,
  isTenantFeatureEnabled,
};