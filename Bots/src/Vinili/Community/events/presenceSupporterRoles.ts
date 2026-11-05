const { PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const { getGuildMemberCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { ROLE_ID, PERK_ROLE_ID, isBotMember } = require("./presenceSupporterInviteState") as typeof import("./presenceSupporterInviteState");
const { refreshMember } = require("./presenceSupporterStateCache") as typeof import("./presenceSupporterStateCache");
/* stesso valore di presenceSupporterBootstrap: online da poco → il link nello status può non essere ancora visibile */
const LINK_WARMUP_MS = 2 * 60 * 1000;

function canManageRoles(member?) {
  const me = member.guild.members.me;
  if (!me) return false;
  return me.permissions.has(PermissionsBitField.Flags.ManageRoles);
}

async function addRoleIfPossible(member?) {
  if (!member || isBotMember(member)) return false;
  if (!ROLE_ID) return false;
  const me = member.guild.members.me;
  if (!me) {
    global.logger?.warn?.(
      "[presenceUpdate] Bot member not cached; cannot add supporter role.",
    );
    return false;
  }
  if (!canManageRoles(member)) {
    global.logger?.warn?.(
      "[presenceUpdate] Missing Manage Roles permission; cannot add supporter role.",
    );
    return false;
  }

  let role = member.guild.roles.cache.get(ROLE_ID) || await member.guild.roles.fetch(ROLE_ID).catch(() => null);
  if (!role) {
    global.logger?.warn?.("[presenceUpdate] Fan role not found:", ROLE_ID);
    return false;
  }
  if (role.position >= me.roles.highest.position) {
    global.logger?.warn?.(
      "[presenceUpdate] Bot role hierarchy prevents adding supporter role:",
      ROLE_ID,
    );
    return false;
  }
  if (member.roles.cache.has(ROLE_ID)) return false;

  const added = await member.roles.add(role).then(() => true).catch(() => false);
  if (!added) {
    const refreshedMember = await refreshMember(member.guild, member.id);
    if (!refreshedMember?.roles?.cache?.has(ROLE_ID)) return false;
  }
  return true;
}

async function addPerkRoleIfPossible(member?) {
  if (!member || isBotMember(member)) return false;
  if (!PERK_ROLE_ID) return false;
  const me = member.guild.members.me;
  if (!me) return false;
  if (!canManageRoles(member)) return false;

  const role = member.guild.roles.cache.get(PERK_ROLE_ID);
  if (!role) return false;
  if (role.position >= me.roles.highest.position) return false;
  if (member.roles.cache.has(PERK_ROLE_ID)) return false;

  const added = await member.roles.add(role).then(() => true).catch(() => false);
  if (added) return true;
  const refreshedMember = await refreshMember(member.guild, member.id);
  return Boolean(refreshedMember?.roles?.cache?.has(PERK_ROLE_ID));
}

async function removeRoleIfPossible(member?) {
  if (!ROLE_ID) return false;
  const me = member.guild.members.me;
  if (!me) {
    global.logger?.warn?.(
      "[presenceUpdate] Bot member not cached; cannot remove supporter role.",
    );
    return false;
  }
  if (!canManageRoles(member)) {
    global.logger?.warn?.(
      "[presenceUpdate] Missing Manage Roles permission; cannot remove supporter role.",
    );
    return false;
  }

  let role = member.guild.roles.cache.get(ROLE_ID) || await member.guild.roles.fetch(ROLE_ID).catch(() => null);
  if (!role) {
    global.logger?.warn?.("[presenceUpdate] Fan role not found:", ROLE_ID);
    return false;
  }
  if (role.position >= me.roles.highest.position) {
    global.logger?.warn?.(
      "[presenceUpdate] Bot role hierarchy prevents removing supporter role:",
      ROLE_ID,
    );
    return false;
  }
  if (!member.roles.cache.has(ROLE_ID)) return false;

  const removed = await member.roles.remove(role).then(() => true).catch(() => false);
  if (removed) return true;
  const refreshedMember = await refreshMember(member.guild, member.id);
  return !refreshedMember?.roles?.cache?.has(ROLE_ID);
}

function recentlyOnline(info?) {
  if (!info?.lastSeenOnlineAt) return false;
  return Date.now() - info.lastSeenOnlineAt < LINK_WARMUP_MS;
}

async function hasFanRole(member?) {
  if (member.roles?.cache?.has(ROLE_ID)) return true;
  const fresh = await getGuildMemberCached(member.guild, member.id, { preferFresh: true });
  return fresh?.roles?.cache?.has(ROLE_ID) || false;
}

export = {
  canManageRoles,
  addRoleIfPossible,
  addPerkRoleIfPossible,
  removeRoleIfPossible,
  hasFanRole,
};
