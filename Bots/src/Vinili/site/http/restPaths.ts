/** Client REST del sito: percorsi delle API di Discord. */
const { Routes } = require("discord.js") as typeof import("discord.js");

function routeCall(name?, ...args) {
  const fn = Routes[name];
  if (typeof fn === "function") return fn(...args);
  throw new Error(`discord.js Routes.${name} missing`);
}

function guildActiveThreadsPath(guildId?) {
  try {
    return routeCall("guildActiveThreads", guildId);
  } catch {
    return `/guilds/${guildId}/threads/active`;
  }
}
function channelThreadsArchivedPublicPath(channelId?) {
  try {
    return routeCall("channelThreadsArchivedPublic", channelId);
  } catch {
    return `/channels/${channelId}/threads/archived/public`;
  }
}
function channelThreadsArchivedPrivatePath(channelId?) {
  try {
    return routeCall("channelThreadsArchivedPrivate", channelId);
  } catch {
    return `/channels/${channelId}/threads/archived/private`;
  }
}
function guildAutoModerationRulesPath(guildId?) {
  try {
    return routeCall("guildAutoModerationRules", guildId);
  } catch {
    return `/guilds/${guildId}/auto-moderation/rules`;
  }
}
function guildAutoModerationRulePath(guildId?, ruleId?) {
  try {
    return routeCall("guildAutoModerationRule", guildId, ruleId);
  } catch {
    return `/guilds/${guildId}/auto-moderation/rules/${ruleId}`;
  }
}
function guildAuditLogPath(guildId?) {
  try {
    return routeCall("guildAuditLog", guildId);
  } catch {
    return `/guilds/${guildId}/audit-logs`;
  }
}
function guildWebhooksPath(guildId?) {
  try {
    return routeCall("guildWebhooks", guildId);
  } catch {
    return `/guilds/${guildId}/webhooks`;
  }
}
function guildBansPath(guildId?) {
  try {
    return routeCall("guildBans", guildId);
  } catch {
    return `/guilds/${guildId}/bans`;
  }
}
function guildIntegrationsPath(guildId?) {
  try {
    return routeCall("guildIntegrations", guildId);
  } catch {
    return `/guilds/${guildId}/integrations`;
  }
}
function userGuildsPath() {
  try {
    return routeCall("userGuilds");
  } catch {
    return "/users/@me/guilds";
  }
}
function channelPermissionPath(channelId?, overwriteId?) {
  try {
    return routeCall("channelPermission", channelId, overwriteId);
  } catch {
    return `/channels/${channelId}/permissions/${overwriteId}`;
  }
}

export = { guildActiveThreadsPath, channelThreadsArchivedPublicPath, channelThreadsArchivedPrivatePath, guildAutoModerationRulesPath, guildAutoModerationRulePath, guildAuditLogPath, guildWebhooksPath, guildBansPath, guildIntegrationsPath, userGuildsPath, channelPermissionPath };
