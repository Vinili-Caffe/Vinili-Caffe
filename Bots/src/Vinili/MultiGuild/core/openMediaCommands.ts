const { isMultiGuildLayerEnabled } = require("./env") as typeof import("./env");
const { isViniliProtectedGuild } = require("./viniliProtectedGuilds") as typeof import("./viniliProtectedGuilds");
const { canInvokePrefixCommand, mapCategoryToFeature } = require("./accessPolicy") as typeof import("./accessPolicy");
const { resolveGuildAccess } = require("./guildRegistry") as typeof import("./guildRegistry");
const MUSIC_PREFIX_COMMANDS = new Set(["play", "pause", "resume", "skip", "stop", "volume", "shuffle", "clear", "repeat", "previous", "rewind", "restart", "now", "next", "queue", "lyrics", "requested", "upcoming"]);
const TTS_PREFIX_COMMANDS = new Set(["join", "leave", "set", "voices"]);
const UTILITY_PREFIX_COMMANDS = new Set(["ping", "avatar", "banner", "afk", "snipe", "quote", "repost", "clip", "invite", "invites"]);
const TENANT_ALWAYS_PREFIX_COMMANDS = new Set([
  "ping",
  "invite",
  "quote",
  "repost",
  "clip",
]);
const MINIGAMES_PREFIX_COMMANDS = new Set(["ship"]);
const PARTNERSHIP_PREFIX_COMMANDS = new Set([
  "help",
  "settings",
  "profile",
  "description",
  "blacklist",
  "setup",
  "history",
  "leaderboard",
  "server",
  "random",
  "user",
  "points",
  "badges",
]);
const { MODERATION_PREFIX_COMMANDS } = require("./tenantModerationPermissions") as typeof import("./tenantModerationPermissions");

function normalizeCommandName(commandName?) {
  return String(commandName || "").trim().toLowerCase();
}

function resolveTenantPrefixFeatureCategory(commandName?) {
  const cmd = normalizeCommandName(commandName);
  if (MUSIC_PREFIX_COMMANDS.has(cmd)) return "music";
  if (TTS_PREFIX_COMMANDS.has(cmd)) return "tts";
  if (UTILITY_PREFIX_COMMANDS.has(cmd)) return "utility";
  if (MINIGAMES_PREFIX_COMMANDS.has(cmd)) return "minigames";
  if (MODERATION_PREFIX_COMMANDS.has(cmd)) return "moderation";
  if (PARTNERSHIP_PREFIX_COMMANDS.has(cmd)) return "partnership";
  return null;
}

function resolveOpenMediaCategory(commandName?) {
  return resolveTenantPrefixFeatureCategory(commandName);
}

function isTenantFeaturePrefixCommand(commandName?) {
  return Boolean(resolveTenantPrefixFeatureCategory(commandName));
}

function isOpenMediaPrefixCommand(commandName?) {
  return isTenantFeaturePrefixCommand(commandName);
}

function buildAllowResult(options?, reason?) {
  if (options?.returnDetails) {
    return { allowed: true, reason, requiredRoles: null, channels: null };
  }
  return true;
}

function buildDenyResult(options?, reason?) {
  if (options?.returnDetails) {
    return { allowed: false, reason, requiredRoles: null, channels: null };
  }
  return false;
}

function resolveTenantFeaturePrefixBypass(guildId?, commandName?, options: Record<string, any> = {}) {
  if (!isMultiGuildLayerEnabled()) return null;
  const gid = String(guildId || "").trim();
  if (!gid) return null;
  if (isViniliProtectedGuild(gid)) return null;

  const cmd = normalizeCommandName(commandName);
  if (TENANT_ALWAYS_PREFIX_COMMANDS.has(cmd)) {
    const access = resolveGuildAccess(gid);
    if (!access?.managed) return null;
    if (!access.allowed) {
      return buildDenyResult(options, access.reason || "tenant_disabled");
    }
    return buildAllowResult(options, "multi_guild_tenant_always");
  }

  const category = resolveTenantPrefixFeatureCategory(commandName);
  if (!category) return null;

  const gate = canInvokePrefixCommand(gid, category);
  if (!gate.managed) {
    return buildAllowResult(options, "multi_guild_tenant_feature");
  }
  if (!gate.ok) {
    return buildDenyResult(options, gate.reason || `feature_disabled:${mapCategoryToFeature(category)}`);
  }
  return buildAllowResult(options, gate.reason || "multi_guild_tenant_feature");
}

function resolveOpenMediaPrefixBypass(guildId?, commandName?, options: Record<string, any> = {}) {
  return resolveTenantFeaturePrefixBypass(guildId, commandName, options);
}

export = { MUSIC_PREFIX_COMMANDS, TTS_PREFIX_COMMANDS, UTILITY_PREFIX_COMMANDS, TENANT_ALWAYS_PREFIX_COMMANDS, MINIGAMES_PREFIX_COMMANDS, PARTNERSHIP_PREFIX_COMMANDS, MODERATION_PREFIX_COMMANDS, resolveTenantPrefixFeatureCategory, resolveOpenMediaCategory, isTenantFeaturePrefixCommand, isOpenMediaPrefixCommand, resolveTenantFeaturePrefixBypass, resolveOpenMediaPrefixBypass };