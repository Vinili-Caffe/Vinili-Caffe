const { isMultiGuildLayerEnabled } = require("./env");
const { isViniliProtectedGuild } = require("./viniliProtectedGuilds");
const { canInvokePrefixCommand, mapCategoryToFeature } = require("./accessPolicy");
const MUSIC_PREFIX_COMMANDS = new Set(["play", "pause", "resume", "skip", "stop", "volume", "shuffle", "clear", "repeat", "previous", "rewind", "restart", "now", "next", "queue", "lyrics", "requested", "upcoming"]);
const TTS_PREFIX_COMMANDS = new Set(["join", "leave", "set", "voices"]);
const UTILITY_PREFIX_COMMANDS = new Set(["help", "settings", "ping", "avatar", "banner", "afk", "snipe", "quote"]);
const MINIGAMES_PREFIX_COMMANDS = new Set(["ship"]);

function normalizeCommandName(commandName) {
  return String(commandName || "").trim().toLowerCase();
}

function resolveTenantPrefixFeatureCategory(commandName) {
  const cmd = normalizeCommandName(commandName);
  if (MUSIC_PREFIX_COMMANDS.has(cmd)) return "music";
  if (TTS_PREFIX_COMMANDS.has(cmd)) return "tts";
  if (UTILITY_PREFIX_COMMANDS.has(cmd)) return "utility";
  if (MINIGAMES_PREFIX_COMMANDS.has(cmd)) return "minigames";
  return null;
}

function resolveOpenMediaCategory(commandName) {
  return resolveTenantPrefixFeatureCategory(commandName);
}

function isTenantFeaturePrefixCommand(commandName) {
  return Boolean(resolveTenantPrefixFeatureCategory(commandName));
}

function isOpenMediaPrefixCommand(commandName) {
  return isTenantFeaturePrefixCommand(commandName);
}

function buildAllowResult(options, reason) {
  if (options?.returnDetails) {
    return { allowed: true, reason, requiredRoles: null, channels: null };
  }
  return true;
}

function buildDenyResult(options, reason) {
  if (options?.returnDetails) {
    return { allowed: false, reason, requiredRoles: null, channels: null };
  }
  return false;
}

function resolveTenantFeaturePrefixBypass(guildId, commandName, options = {}) {
  if (!isMultiGuildLayerEnabled()) return null;
  const gid = String(guildId || "").trim();
  if (!gid) return null;
  if (isViniliProtectedGuild(gid)) return null;

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

function resolveOpenMediaPrefixBypass(guildId, commandName, options = {}) {
  return resolveTenantFeaturePrefixBypass(guildId, commandName, options);
}

module.exports = { MUSIC_PREFIX_COMMANDS, TTS_PREFIX_COMMANDS, UTILITY_PREFIX_COMMANDS, MINIGAMES_PREFIX_COMMANDS, resolveTenantPrefixFeatureCategory, resolveOpenMediaCategory, isTenantFeaturePrefixCommand, isOpenMediaPrefixCommand, resolveTenantFeaturePrefixBypass, resolveOpenMediaPrefixBypass };