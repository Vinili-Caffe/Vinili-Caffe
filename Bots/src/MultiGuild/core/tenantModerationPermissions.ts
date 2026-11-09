const { PermissionFlagsBits } = require("discord.js") as typeof import("discord.js");

const MODERATION_PREFIX_COMMANDS = new Set([
  "ban",
  "softban",
  "unban",
  "kick",
  "mute",
  "unmute",
  "warn",
  "warnings",
  "modlogs",
  "case",
  "reason",
  "delwarn",
  "clearwarn",
  "duration",
  "moderations",
  "purge",
  "lock",
  "unlock",
]);

const COMMAND_PERMISSION_GROUPS = {
  ban: [PermissionFlagsBits.BanMembers],
  softban: [PermissionFlagsBits.BanMembers],
  unban: [PermissionFlagsBits.BanMembers],
  kick: [PermissionFlagsBits.KickMembers],
  mute: [PermissionFlagsBits.ModerateMembers],
  unmute: [PermissionFlagsBits.ModerateMembers],
  warn: [PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageMessages],
  warnings: [PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageMessages],
  modlogs: [PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageMessages],
  case: [PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageMessages],
  reason: [PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageMessages],
  delwarn: [PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageMessages],
  clearwarn: [PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageMessages],
  duration: [PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageMessages],
  moderations: [PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageMessages],
  purge: [PermissionFlagsBits.ManageMessages],
  lock: [PermissionFlagsBits.ManageChannels],
  unlock: [PermissionFlagsBits.ManageChannels],
};

function normalizeCommandName(commandName?) {
  return String(commandName || "").trim().toLowerCase();
}

function isTenantModerationPrefixCommand(commandName?) {
  return MODERATION_PREFIX_COMMANDS.has(normalizeCommandName(commandName));
}

function memberHasModeratorRole(member?) {
  try {
    const {
      getTenantModerationExtrasSync,
      ensureTenantModerationCacheFresh,
    } = require("./tenantModerationSettings") as typeof import("./tenantModerationSettings");
    ensureTenantModerationCacheFresh().catch(() => null);
    const ids = getTenantModerationExtrasSync(member?.guild?.id)?.moderatorRoleIds || [];
    if (!ids.length || !member?.roles?.cache) return false;
    return ids.some((id?) => member.roles.cache.has(String(id)));
  } catch (_) {
    return false;
  }
}

function memberHasTenantModerationPermission(member?, commandName?) {
  if (!member?.permissions) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (memberHasModeratorRole(member)) return true;
  const cmd = normalizeCommandName(commandName);
  const required = COMMAND_PERMISSION_GROUPS[cmd];
  if (!required?.length) return false;
  return required.some((flag?) => member.permissions.has(flag));
}

function resolveTenantModerationMemberCheck(member?, commandName?, options: Record<string, any> = {}) {
  const cmd = normalizeCommandName(commandName);
  if (!isTenantModerationPrefixCommand(cmd)) return null;
  const allowed = memberHasTenantModerationPermission(member, cmd);
  if (options?.returnDetails) {
    return {
      allowed,
      reason: allowed ? "multi_guild_tenant_mod_ok" : "multi_guild_tenant_mod_permission",
      requiredRoles: null,
      channels: null,
    };
  }
  return allowed;
}

export = {
  MODERATION_PREFIX_COMMANDS,
  isTenantModerationPrefixCommand,
  memberHasModeratorRole,
  memberHasTenantModerationPermission,
  resolveTenantModerationMemberCheck,
};