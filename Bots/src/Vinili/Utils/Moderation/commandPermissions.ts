
const { PermissionFlagsBits } = require("discord.js") as typeof import("discord.js");
const { buildPrefixLookupKeys } = require("./temporaryCommandPermissions") as typeof import("./temporaryCommandPermissions");
const { resolveRoleReference, normalizeRoleList } = require("./permStaffGuide") as typeof import("./permStaffGuide");
const { HIGH_STAFF_COMMANDS_ZONE_TOKEN, PM_COMMANDS_THREAD_ZONE_TOKEN } = require("./permReferences") as typeof import("./permReferences");
const { hasAllPermissions } = require("./permMemberChecks") as typeof import("./permMemberChecks");
const { buildGlobalPermissionDeniedEmbed, buildGlobalChannelDeniedEmbed, buildGlobalNotYourControlEmbed } = require("./permEmbeds") as typeof import("./permEmbeds");
const { WEB_TICKET_PREFIX_ALLOWED_COMMANDS, WEB_TICKET_PREFIX_CATEGORY_LIMIT, WEB_TICKET_PREFIX_HIDDEN_COMMANDS, WEB_TICKET_SLASH_ALLOWED_COMMANDS, WEB_TICKET_SLASH_HIDDEN_COMMANDS, WEB_TICKET_SLASH_CATEGORY_LIMIT, resolveSlashRoles, resolveSlashPermissions, resolvePrefixRoles, getDevIds, peekMainDashboardCommandAcl } = require("./permWebTicket") as typeof import("./permWebTicket");
const { loadPermissions, expandResolvedChannelReference, normalizeChannelList, channelMatchesPolicyChannelList, resolveCommandChannelPolicy, hasAnyRole, fetchLiveMember, checkSlashPermission } = require("./permSlash") as typeof import("./permSlash");
const { resolvePrefixCommandChannels, checkPrefixPermission } = require("./permPrefix") as typeof import("./permPrefix");
const { checkButtonPermission } = require("./permButton") as typeof import("./permButton");
const { checkStringSelectPermission, checkModalPermission } = require("./permSelectModal") as typeof import("./permSelectModal");



async function isGuildOwnerOrAdmin(interaction?) {
  if (!interaction?.inGuild?.()) return false;
  const userId = String(interaction?.user?.id || "");
  if (!userId) return false;

  const guild = interaction.guild || null;
  const ownerId = String(guild?.ownerId || "");
  if (ownerId && ownerId === userId) return true;

  const member = interaction.member;
  if (member?.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;

  const freshMember = await fetchLiveMember(interaction);
  if (freshMember?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
    return true;
  }

  if (guild && typeof guild.fetchOwner === "function") {
    const owner = await guild.fetchOwner().catch(() => null);
    if (owner?.id && String(owner.id) === userId) return true;
  }

  return false;
}

function getSlashRequiredRoles(interaction?) {
  const data = loadPermissions();
  const group = interaction.options?.getSubcommandGroup?.(false) || null;
  const sub = interaction.options?.getSubcommand?.(false) || null;
  return resolveSlashRoles(data, interaction.commandName, group, sub);
}

function getPrefixRequiredRoles(commandName?, subcommandName = null) {
  const data = loadPermissions();
  return resolvePrefixRoles(data, commandName, subcommandName);
}

function isPrefixCommandAllowedInWebTicket({
  member,
  userId,
  commandName,
  ticketCategory,
  client,
  guildId,
}: any = {}) {
  const safeCommand = String(commandName || "")
    .trim()
    .toLowerCase();
  if (!safeCommand) return false;
  if (WEB_TICKET_PREFIX_HIDDEN_COMMANDS.has(safeCommand)) return false;
  if (!WEB_TICKET_PREFIX_ALLOWED_COMMANDS.has(safeCommand)) return false;

  const isDev = getDevIds(client).includes(String(userId || ""));
  if ((safeCommand === "notify" || safeCommand === "quit") && !isDev) return false;

  const onlyCats = WEB_TICKET_PREFIX_CATEGORY_LIMIT[safeCommand];
  if (onlyCats) {
    const cat = String(ticketCategory || "").toLowerCase();
    if (!onlyCats.includes(cat)) return false;
  }

  const gid = String(guildId || "").trim();
  const dashAcl = gid ? peekMainDashboardCommandAcl(gid, safeCommand) : null;
  if (dashAcl && dashAcl.enabled === false) return false;

  const data = loadPermissions();
  const roles = resolvePrefixRoles(data, safeCommand);
  if (Array.isArray(roles) && roles.length && !hasAnyRole(member, roles)) return false;

  return true;
}

function isSlashCommandAllowedInWebTicket({
  member,
  userId,
  commandName,
  ticketCategory,
  client,
  guildId,
}: any = {}) {
  const safeCommand = String(commandName || "")
    .trim()
    .toLowerCase();
  if (!safeCommand) return false;
  if (WEB_TICKET_SLASH_HIDDEN_COMMANDS.has(safeCommand)) return false;
  if (!WEB_TICKET_SLASH_ALLOWED_COMMANDS.has(safeCommand)) return false;

  const isDev = getDevIds(client).includes(String(userId || ""));
  if (safeCommand === "say" && !isDev) return false;

  const onlyCats = WEB_TICKET_SLASH_CATEGORY_LIMIT[safeCommand];
  if (onlyCats) {
    const cat = String(ticketCategory || "").toLowerCase();
    if (!onlyCats.includes(cat)) return false;
  }

  const gid = String(guildId || "").trim();
  const dashAcl = gid ? peekMainDashboardCommandAcl(gid, `s:1:${safeCommand}`) : null;
  if (dashAcl && dashAcl.enabled === false) return false;

  const data = loadPermissions();
  const roles = resolveSlashRoles(data, safeCommand);
  if (Array.isArray(roles) && roles.length && !hasAnyRole(member, roles)) return false;
  const permissionFlags = resolveSlashPermissions(data, safeCommand);
  if (Array.isArray(permissionFlags) && permissionFlags.length && !hasAllPermissions(member, permissionFlags)) {
    return false;
  }

  return true;
}

function buildPrefixAclFromPermissionsJson(commandName?) {
  const cmd = String(commandName || "")
    .trim()
    .toLowerCase()
    .replace(/^\+/, "");
  if (!cmd) return null;
  const data = loadPermissions();
  const rolesRaw = resolvePrefixRoles(data, cmd);
  const channelsRaw =
    resolvePrefixCommandChannels(data, cmd) ??
    resolveCommandChannelPolicy(data, buildPrefixLookupKeys(cmd, null));
  const roleIds = Array.isArray(rolesRaw)
    ? [...new Set(rolesRaw.map((id?) => String(id || "").trim()).filter((id?) => /^\d{16,22}$/.test(id)))]
    : [];
  const channelIds = Array.isArray(channelsRaw)
    ? [
        ...new Set(
          channelsRaw
            .map((id?) => String(id || "").trim())
            .filter((id?) => /^\d{16,22}$/.test(id)),
        ),
      ]
    : [];
  if (!roleIds.length && !channelIds.length) return null;
  return {
    enabled: true,
    roleMode: roleIds.length ? "include" : null,
    roleIds,
    channelMode: channelIds.length ? "include" : null,
    channelIds,
  };
}

export = {
  checkSlashPermission,
  checkPrefixPermission,
  checkButtonPermission,
  checkStringSelectPermission,
  checkModalPermission,
  getSlashRequiredRoles,
  getPrefixRequiredRoles,
  isPrefixCommandAllowedInWebTicket,
  isSlashCommandAllowedInWebTicket,
  buildPrefixAclFromPermissionsJson,
  buildGlobalPermissionDeniedEmbed,
  buildGlobalChannelDeniedEmbed,
  buildGlobalNotYourControlEmbed,
  hasAnyRole,
  getDevIds,
  resolveRoleReference,
  normalizeRoleList,
  __test: {
    channelMatchesPolicyChannelList,
    normalizeChannelList,
    expandResolvedChannelReference,
    HIGH_STAFF_COMMANDS_ZONE_TOKEN,
    PM_COMMANDS_THREAD_ZONE_TOKEN,
  },
};