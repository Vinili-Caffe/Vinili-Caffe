const { isMultiGuildLayerEnabled } = require("./env") as typeof import("./env");
const { isViniliProtectedGuild } = require("./viniliProtectedGuilds") as typeof import("./viniliProtectedGuilds");
const { canInvokePrefixCommand, mapCategoryToFeature } = require("./accessPolicy") as typeof import("./accessPolicy");
const { resolveGuildAccess } = require("./guildRegistry") as typeof import("./guildRegistry");
const MUSIC_PREFIX_COMMANDS = new Set(["play", "pause", "resume", "skip", "stop", "volume", "shuffle", "clear", "repeat", "previous", "rewind", "restart", "now", "next", "queue", "lyrics", "requested", "upcoming"]);
const TTS_PREFIX_COMMANDS = new Set(["join", "leave", "set", "voices"]);
const UTILITY_PREFIX_COMMANDS = new Set(["avatar", "banner", "afk", "snipe", "invite", "invites", "help", "profile"]);
const BACHECA_PREFIX_COMMANDS = new Set(["quote", "repost", "clip"]);
/* help/profile in utility: sui tenant restano sempre usabili anche senza feature utility. */
const TENANT_ALWAYS_PREFIX_COMMANDS = new Set(["help", "profile"]);
const MINIGAMES_PREFIX_COMMANDS = new Set(["ship"]);
const PARTNERSHIP_PREFIX_COMMANDS = new Set([
  "settings",
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
  if (BACHECA_PREFIX_COMMANDS.has(cmd)) return "bacheca";
  if (UTILITY_PREFIX_COMMANDS.has(cmd)) return "utility";
  if (MINIGAMES_PREFIX_COMMANDS.has(cmd)) return "minigames";
  if (MODERATION_PREFIX_COMMANDS.has(cmd)) return "moderation";
  if (PARTNERSHIP_PREFIX_COMMANDS.has(cmd)) return "partnership";
  return null;
}

function isTenantFeaturePrefixCommand(commandName?) {
  return Boolean(resolveTenantPrefixFeatureCategory(commandName));
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

function isTenantBoardsEnabled(guildId?) {
  try {
    const { getTenantBoardsSync } = require("./tenantGuildSettings") as typeof import("./tenantGuildSettings");
    return getTenantBoardsSync(guildId)?.enabled === true;
  } catch {
    return false;
  }
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

  /* Bacheca / moderazione / partnership: modulo acceso (+ setup minimo, salvo +setup/+settings). */
  try {
    const MS = require("./moduleSwitches") as typeof import("./moduleSwitches");
    const mod =
      category === "bacheca"
        ? "bacheca"
        : category === "moderation"
          ? "moderation"
          : category === "partnership"
            ? "partnership"
            : null;
    if (mod) {
      const allowed =
        typeof MS.isCommandAllowedByModule === "function"
          ? MS.isCommandAllowedByModule(gid, cmd)
          : typeof MS.isModuleEffectivelyOn === "function"
            ? MS.isModuleEffectivelyOn(gid, mod)
            : true;
      if (!allowed) {
        if (options.returnDetails) {
          return {
            allowed: false,
            reason: "module_disabled",
            requiredRoles: null,
            channels: null,
            message: MS.DISABLED_COMMAND_MESSAGE || "Questo comando è disattivato su questo server.",
          };
        }
        return false;
      }
    }
  } catch (_) {}

  /* Bacheca: non è feature registry — si attiva solo dalla dashboard. */
  if (category === "bacheca") {
    const access = resolveGuildAccess(gid);
    if (!access?.managed) return null;
    if (!access.allowed) {
      return buildDenyResult(options, access.reason || "tenant_disabled");
    }
    if (!isTenantBoardsEnabled(gid)) {
      if (options.returnDetails) {
        try {
          const MS = require("./moduleSwitches") as typeof import("./moduleSwitches");
          return {
            allowed: false,
            reason: "board_disabled",
            requiredRoles: null,
            channels: null,
            message: MS.DISABLED_COMMAND_MESSAGE || "Questo comando è disattivato su questo server.",
          };
        } catch (_) {}
      }
      return buildDenyResult(options, "board_disabled");
    }
    return buildAllowResult(options, "multi_guild_tenant_boards");
  }

  const gate = canInvokePrefixCommand(gid, category);
  if (!gate.managed) {
    return buildAllowResult(options, "multi_guild_tenant_feature");
  }
  if (!gate.ok) {
    if (options.returnDetails) {
      try {
        const MS = require("./moduleSwitches") as typeof import("./moduleSwitches");
        return {
          allowed: false,
          reason: gate.reason || `feature_disabled:${mapCategoryToFeature(category)}`,
          requiredRoles: null,
          channels: null,
          message: MS.DISABLED_COMMAND_MESSAGE || "Questo comando è disattivato su questo server.",
        };
      } catch (_) {}
    }
    return buildDenyResult(options, gate.reason || `feature_disabled:${mapCategoryToFeature(category)}`);
  }
  return buildAllowResult(options, gate.reason || "multi_guild_tenant_feature");
}

function resolveOpenMediaPrefixBypass(guildId?, commandName?, options: Record<string, any> = {}) {
  return resolveTenantFeaturePrefixBypass(guildId, commandName, options);
}

export = {
  MUSIC_PREFIX_COMMANDS,
  TTS_PREFIX_COMMANDS,
  UTILITY_PREFIX_COMMANDS,
  BACHECA_PREFIX_COMMANDS,
  TENANT_ALWAYS_PREFIX_COMMANDS,
  MINIGAMES_PREFIX_COMMANDS,
  PARTNERSHIP_PREFIX_COMMANDS,
  MODERATION_PREFIX_COMMANDS,
  resolveTenantPrefixFeatureCategory,
  isTenantFeaturePrefixCommand,
  resolveOpenMediaPrefixBypass,
};