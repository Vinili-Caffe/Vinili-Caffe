/** Permessi: comandi ammessi nei ticket aperti dal sito. */
const path = require("path") as typeof import("path");
const IDs: any = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { resolveRoleReference, normalizeRoleList } = require("./permStaffGuide") as typeof import("./permStaffGuide");
const { resolvePermissionReference, normalizePermissionList } = require("./permReferences") as typeof import("./permReferences");

const PERMISSIONS_CANDIDATES = [
  path.resolve(__dirname, "../../permissions.json"),
  path.join(process.cwd(), "permissions.json"),
];
const PERMISSIONS_CACHE_TTL_MS = 3000;
const WEB_TICKET_PREFIX_ALLOWED_COMMANDS = new Set([
  "description",
]);
const WEB_TICKET_PREFIX_CATEGORY_LIMIT = Object.freeze({
  description: Object.freeze(["partnership"]),
});
const VOICE_STANZA_PREFIX_CHANNEL_BYPASS_COMMANDS = new Set([
  "play",
  "pause",
  "resume",
  "skip",
  "stop",
  "volume",
  "shuffle",
  "clear",
  "repeat",
  "previous",
  "rewind",
  "restart",
  "now",
  "next",
  "queue",
  "lyrics",
  "requested",
  "upcoming",
  "join",
  "leave",
  "set",
  "voices",
]);
const WEB_TICKET_PREFIX_HIDDEN_COMMANDS = new Set([
  "ticket",
  ...VOICE_STANZA_PREFIX_CHANNEL_BYPASS_COMMANDS,
]);
const WEB_TICKET_SLASH_ALLOWED_COMMANDS = new Set([
  "partnership",
]);
const WEB_TICKET_SLASH_HIDDEN_COMMANDS = new Set(["music"]);
const WEB_TICKET_SLASH_CATEGORY_LIMIT = Object.freeze({
  partnership: Object.freeze(["partnership"]),
});

function resolveSlashRoles(data?, commandName?, groupName?, subcommandName?) {
  const cmd = data?.slash?.[commandName];
  if (!cmd) return null;
  if (Array.isArray(cmd)) return normalizeRoleList(cmd);
  if (typeof cmd !== "object") return null;
  const subcommands = cmd.subcommands || {};
  if (groupName && subcommandName) {
    const key = `${groupName}.${subcommandName}`;
    if (Array.isArray(subcommands[key]))
      return normalizeRoleList(subcommands[key]);
  }
  if (subcommandName && Array.isArray(subcommands[subcommandName])) {
    return normalizeRoleList(subcommands[subcommandName]);
  }
  if (Array.isArray(cmd.roles)) return normalizeRoleList(cmd.roles);
  if (typeof cmd.roles === "string") {
    const resolved = resolveRoleReference(cmd.roles);
    return resolved ? [resolved] : [];
  }
  return null;
}

function resolveSlashPermissions(data?, commandName?, groupName?, subcommandName?) {
  const cmd = data?.slash?.[commandName];
  if (!cmd || typeof cmd !== "object") return null;
  const subcommands = cmd.subcommands || {};
  if (groupName && subcommandName) {
    const key = `${groupName}.${subcommandName}`;
    const cfg = subcommands[key];
    if (cfg && typeof cfg === "object") {
      if (Array.isArray(cfg.permissions))
        return normalizePermissionList(cfg.permissions);
      if (typeof cfg.permissions === "string") {
        const resolved = resolvePermissionReference(cfg.permissions);
        return resolved != null ? [resolved] : [];
      }
    }
  }
  if (subcommandName) {
    const cfg = subcommands[subcommandName];
    if (cfg && typeof cfg === "object") {
      if (Array.isArray(cfg.permissions))
        return normalizePermissionList(cfg.permissions);
      if (typeof cfg.permissions === "string") {
        const resolved = resolvePermissionReference(cfg.permissions);
        return resolved != null ? [resolved] : [];
      }
    }
  }
  if (Array.isArray(cmd.permissions))
    return normalizePermissionList(cmd.permissions);
  if (typeof cmd.permissions === "string") {
    const resolved = resolvePermissionReference(cmd.permissions);
    return resolved != null ? [resolved] : [];
  }
  return null;
}

function resolvePrefixRoles(data?, commandName?, subcommandName = null) {
  const cmd = data?.prefix?.[commandName];
  if (!cmd) return null;
  if (Array.isArray(cmd)) return normalizeRoleList(cmd);
  if (typeof cmd !== "object") return null;
  const subcommands = cmd.subcommands || {};
  if (subcommandName && Array.isArray(subcommands[subcommandName])) {
    return normalizeRoleList(subcommands[subcommandName]);
  }
  if (Array.isArray(cmd.roles)) return normalizeRoleList(cmd.roles);
  if (typeof cmd.roles === "string") {
    const resolved = resolveRoleReference(cmd.roles);
    return resolved ? [resolved] : [];
  }
  return null;
}

function getDevIds(client?) {
  const rawIds = IDs?.developers ?? IDs?.guilds?.developers ?? "";
  const fromIds = Array.isArray(rawIds) ? rawIds.map((id?) => String(id).trim()).filter(Boolean) : String(rawIds).split(",").map((id?) => id.trim()).filter(Boolean);
  const raw = client?.config?.developers ?? "";
  const fromConfig = Array.isArray(raw) ? raw.map((id?) => String(id).trim()).filter(Boolean) : String(raw).split(",").map((id?) => id.trim()).filter(Boolean);
  return Array.from(new Set([...fromIds, ...fromConfig]));
}

function peekMainDashboardCommandAcl(guildId?, commandName?) {
  try {
    const { peekDashboardCommandAcl } = require("../../MultiGuild/core/tenantCommandAcl") as typeof import("../../MultiGuild/core/tenantCommandAcl");
    return peekDashboardCommandAcl(guildId, commandName);
  } catch (err) {
    global.logger?.warn?.("[commandPermissions] peek dashboard ACL:", err?.message || err);
    return null;
  }
}

export = { PERMISSIONS_CANDIDATES, PERMISSIONS_CACHE_TTL_MS, WEB_TICKET_PREFIX_ALLOWED_COMMANDS, WEB_TICKET_PREFIX_CATEGORY_LIMIT, VOICE_STANZA_PREFIX_CHANNEL_BYPASS_COMMANDS, WEB_TICKET_PREFIX_HIDDEN_COMMANDS, WEB_TICKET_SLASH_ALLOWED_COMMANDS, WEB_TICKET_SLASH_HIDDEN_COMMANDS, WEB_TICKET_SLASH_CATEGORY_LIMIT, resolveSlashRoles, resolveSlashPermissions, resolvePrefixRoles, getDevIds, peekMainDashboardCommandAcl };
