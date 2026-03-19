const { RolePersistUser } = require("../../Schemas/Moderation/rolePersistSchema");
const { getGuildRoleCached, getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache");

async function setRolePersist({ guildId, userId, roleId, setBy = null, reason = null }) {
  if (!guildId || !userId || !roleId) return null;
  const g = String(guildId);
  const u = String(userId);
  const r = String(roleId);
  const reasonStr = String(reason || "Nessun motivo fornito").slice(0, 512);
  const setByStr = setBy ? String(setBy) : null;
  const updated = await RolePersistUser.findOneAndUpdate(
    { guildId: g, userId: u, "roles.roleId": r },
    { $set: { "roles.$.setBy": setByStr, "roles.$.reason": reasonStr } },
    { new: true },
  ).catch(() => null);
  if (updated) return updated;
  return RolePersistUser.findOneAndUpdate(
    { guildId: g, userId: u },
    { $push: { roles: { roleId: r, setBy: setByStr, reason: reasonStr } } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
}

async function clearRolePersist({ guildId, userId, roleId }) {
  if (!guildId || !userId || !roleId) return null;
  return RolePersistUser.findOneAndUpdate(
    { guildId: String(guildId), userId: String(userId) },
    { $pull: { roles: { roleId: String(roleId) } } },
    { new: true },
  ).catch(() => null);
}

async function listRolePersistByUser(guildId, userId) {
  if (!guildId || !userId) return [];
  const doc = await RolePersistUser.findOne({ guildId: String(guildId), userId: String(userId) }).lean().catch(() => null);
  return doc?.roles || [];
}

async function applyRolePersistForMember(member) {
  if (!member?.guild?.id || !member?.id) return;
  const rows = await listRolePersistByUser(member.guild.id, member.id);
  if (!rows.length) return;
  const me = member.guild.members.me;
  if (!me?.permissions?.has?.("ManageRoles")) return;
  for (const row of rows) {
    const roleId = row?.roleId || row?.id;
    if (!roleId) continue;
    const role = await getGuildRoleCached(member.guild, roleId);
    if (!role) continue;
    if (role.position >= me.roles.highest.position) continue;
    if (member.roles.cache.has(role.id)) continue;
    await member.roles.add(role.id, "<:success:1461731530333229226> Rolepersist rejoin restore").catch(() => { });
    const refreshedMember = await getGuildMemberCached(member.guild, member.id, { preferFresh: true });
    if (!refreshedMember?.roles?.cache?.has(role.id)) {
      global.logger?.warn?.("[ROLEPERSIST] restore failed:", member.guild.id, member.id, role.id);
    }
  }
}

module.exports = { setRolePersist, clearRolePersist, listRolePersistByUser, applyRolePersistForMember };