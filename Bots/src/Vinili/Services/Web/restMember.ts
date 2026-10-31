/** Client REST del sito: membri. */
const { Routes } = require("discord.js") as typeof import("discord.js");
const { asCacheMap, wrapLivePermissionBits, computeMemberGuildPermissionBits } = require("./restPermissions") as typeof import("./restPermissions");
const { wrapUser } = require("./restUserRole") as typeof import("./restUserRole");

function isRestSnowflakeId(value?) {
  return /^\d{17,22}$/.test(String(value || "").trim());
}

function expandRestRoleIds(roleOrRoles?) {
  const raw = Array.isArray(roleOrRoles) ? roleOrRoles : [roleOrRoles];
  const out = [];
  for (const item of raw) {
    if (item == null) continue;
    const asId =
      typeof item === "object" && item.id != null ? String(item.id) : String(item);
    for (const part of asId.split(/[,\s]+/)) {
      const id = part.trim();
      if (isRestSnowflakeId(id)) out.push(id);
    }
  }
  return [...new Set(out)];
}

function wrapMember(raw?, guild?, userObj?) {
  const user = userObj || wrapUser(raw.user, guild?.client);
  const roleIds = (raw.roles || []).map(String);
  const rolesCache = asCacheMap(
    roleIds.map((rid?) => {
      const role = guild.roles.cache.get(rid) || { id: rid, name: rid, position: 0 };
      return [rid, role];
    }),
  );
  const disabledUntil = raw.communication_disabled_until
    ? Date.parse(raw.communication_disabled_until)
    : null;
  return {
    id: user.id,
    user,
    nickname: raw.nick || null,
    displayName: raw.nick || user.globalName || user.username,
    joinedTimestamp: raw.joined_at ? Date.parse(raw.joined_at) : null,
    joinedAt: raw.joined_at ? new Date(raw.joined_at) : null,
    premiumSince: raw.premium_since ? new Date(raw.premium_since) : null,
    communicationDisabledUntil: Number.isFinite(disabledUntil) ? new Date(disabledUntil) : null,
    communicationDisabledUntilTimestamp: Number.isFinite(disabledUntil) ? disabledUntil : null,
    pending: Boolean(raw.pending),
    avatar: raw.avatar || null,
    displayAvatarURL: (opts: Record<string, any> = {}) => user.displayAvatarURL(opts),
    roles: {
      cache: rolesCache,
      highest: [...rolesCache.values()].sort((a?: any, b?: any) => (b.position || 0) - (a.position || 0))[0] || null,
      add: async (roleOrRoles?, reason?) => {
                const ids = expandRestRoleIds(roleOrRoles);
        const reasonOpt = reason ? String(reason).slice(0, 512) : undefined;
        for (const roleId of ids) {
          await guild.client._rest.put(Routes.guildMemberRole(guild.id, user.id, roleId), {
            reason: reasonOpt,
          });
          rolesCache.set(roleId, guild.roles.cache.get(roleId) || { id: roleId });
        }
      },
      remove: async (roleOrRoles?, reason?) => {
        const ids = expandRestRoleIds(roleOrRoles);
        const reasonOpt = reason ? String(reason).slice(0, 512) : undefined;
        for (const roleId of ids) {
          await guild.client._rest.delete(Routes.guildMemberRole(guild.id, user.id, roleId), {
            reason: reasonOpt,
          });
          rolesCache.delete(roleId);
        }
      },
      set: async (roleOrRoles?, reason?) => {
        const guildId = String(guild.id || "");
        const ids = expandRestRoleIds(roleOrRoles).filter((id?) => id && id !== guildId);
        await guild.client._rest.patch(Routes.guildMember(guild.id, user.id), {
          body: { roles: ids },
          reason: reason ? String(reason).slice(0, 512) : undefined,
        });
        for (const key of [...rolesCache.keys()]) {
          if (!ids.includes(key)) rolesCache.delete(key);
        }
        for (const roleId of ids) {
          rolesCache.set(roleId, guild.roles.cache.get(roleId) || { id: roleId });
        }
      },
    },
    guild,
    permissions: wrapLivePermissionBits(() => computeMemberGuildPermissionBits({ roles: { cache: rolesCache }, guild }, guild)),
    toString: () => `<@${user.id}>`,
    valueOf: () => String(user.id),
  };
}

export = { wrapMember };
