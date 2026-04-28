const { CustomRole } = require("../../Schemas/Community/communitySchemas");
const { runExpiredCustomRolesSweep, } = require("../../Services/Community/customRoleExpiryService");
const { getGuildRoleCached } = require("../Interaction/interactionEntityCache");

function isExpired(doc) {
  const expiresAt = doc?.expiresAt ? new Date(doc.expiresAt) : null;
  if (!expiresAt || Number.isNaN(expiresAt.getTime())) return false;
  return expiresAt.getTime() <= Date.now();
}

async function resolveCustomRoleState({ guild, userId, client = null, cleanupExpired = true }) {
  if (!guild || !userId) {
    return { status: "invalid", doc: null, role: null };
  }

  const doc = await CustomRole.findOne({ guildId: guild.id, userId: String(userId), }).lean().catch(() => null);
  if (!doc?.roleId && !doc?.secondaryRoleId) {
    return { status: "none", doc: null, role: null };
  }

  if (isExpired(doc)) {
    if (cleanupExpired && client) {
      runExpiredCustomRolesSweep(client).catch(() => { });
    }
    return { status: "expired", doc, role: null };
  }

  let role = null;
  let secondaryRole = null;
  if (doc?.roleId) {
    role = guild.roles.cache.get(doc.roleId) || (await getGuildRoleCached(guild, doc.roleId));
  }
  if (doc?.secondaryRoleId) {
    secondaryRole = guild.roles.cache.get(doc.secondaryRoleId) || (await getGuildRoleCached(guild, doc.secondaryRoleId));
  }
  if (doc?.roleId && !role && doc?.secondaryRoleId && secondaryRole) {
    await CustomRole.updateOne(
      { guildId: guild.id, userId: String(userId) },
      { $set: { roleId: secondaryRole.id, secondaryRoleId: null } },
    ).catch(() => { });
    role = secondaryRole;
    secondaryRole = null;
  }
  if (!role && !secondaryRole) {
    await CustomRole.deleteOne({
      guildId: guild.id,
      userId: String(userId),
    }).catch(() => { });
    return { status: "missing_role", doc, role: null };
  }
  return { status: "active", doc, role: role || null, secondaryRole: secondaryRole || null };
}

function buildExpiryText(doc) {
  if (!doc?.expiresAt) return "Permanente";
  const ts = Math.floor(new Date(doc.expiresAt).getTime() / 1000);
  if (!Number.isFinite(ts) || ts <= 0) return "Permanente";
  return `<t:${ts}:F> (<t:${ts}:R>)`;
}

module.exports = { resolveCustomRoleState, buildExpiryText };