const { resolveSiteAvatarUrl } = require("../siteLiveAvatars") as typeof import("../siteLiveAvatars");
const {
  STAFF_ROLE_ID,
  HIGH_STAFF_ROLE_ID,
  STAFF_CACHE_TTL_MS,
} = require("./constants") as typeof import("./constants");
const { displayNameForMember } = require("./helpers") as typeof import("./helpers");

let staffCache = {
  guildId: "",
  expiresAt: 0,
  list: [],
  ids: new Set(),
};

let highStaffCache = {
  guildId: "",
  expiresAt: 0,
  userIds: [],
};

async function getStaffTargets(client?, guild?) {
  const guildId = String(guild?.id || "").trim();
  if (
    guildId &&
    staffCache.guildId === guildId &&
    staffCache.expiresAt > Date.now() &&
    Array.isArray(staffCache.list)
  ) {
    return staffCache;
  }

  if (!guild || (!STAFF_ROLE_ID && !HIGH_STAFF_ROLE_ID)) {
    staffCache = { guildId, expiresAt: Date.now() + STAFF_CACHE_TTL_MS, list: [], ids: new Set() };
    return staffCache;
  }

  try {
    const { ensureGuildMembersLoaded } = require("../../staff/siteStaffRosterCache") as typeof import("../../staff/siteStaffRosterCache");
    await ensureGuildMembersLoaded(guild);
  } catch (_) {}
  const byId = new Map();
  const roleIds = [STAFF_ROLE_ID, HIGH_STAFF_ROLE_ID].filter(Boolean);
  for (const roleId of roleIds) {
    const role = guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
    const members = role ? Array.from(role.members.values()) : [];
    for (const member of members) {
      if (!member || (member as any).user?.bot) continue;
      const id = String((member as any).id);
      if (byId.has(id)) continue;
      byId.set(id, {
        id,
        name: displayNameForMember(member),
        avatarUrl:
          resolveSiteAvatarUrl(guild, (member as any).id, "", { size: 128, preferAnimated: true }) || "",
      });
    }
  }
  const list = Array.from(byId.values()).sort((a?, b?) =>
    a.name.localeCompare(b.name, "it", { sensitivity: "base" }),
  );
  const ids = new Set(list.map((entry?) => entry.id));
  staffCache = { guildId, expiresAt: Date.now() + STAFF_CACHE_TTL_MS, list, ids };
  return staffCache;
}

async function getHighStaffUserIds(guild?) {
  const guildId = String(guild?.id || "").trim();
  if (guildId && highStaffCache.guildId === guildId && highStaffCache.expiresAt > Date.now()) {
    return Array.isArray(highStaffCache.userIds) ? highStaffCache.userIds : [];
  }
  if (!guild || !HIGH_STAFF_ROLE_ID) {
    highStaffCache = { guildId, expiresAt: Date.now() + STAFF_CACHE_TTL_MS, userIds: [] };
    return [];
  }
  try {
    const { ensureGuildMembersLoaded } = require("../../staff/siteStaffRosterCache") as typeof import("../../staff/siteStaffRosterCache");
    await ensureGuildMembersLoaded(guild);
  } catch (_) {}
  const role = guild.roles.cache.get(HIGH_STAFF_ROLE_ID) || (await guild.roles.fetch(HIGH_STAFF_ROLE_ID).catch(() => null));
  const userIds = role
    ? Array.from(role.members.values())
        .filter((member?: any) => member && !member.user?.bot)
        .map((member?: any) => String(member.id))
    : [];
  highStaffCache = { guildId, expiresAt: Date.now() + STAFF_CACHE_TTL_MS, userIds };
  return userIds;
}

export = { getStaffTargets, getHighStaffUserIds };
