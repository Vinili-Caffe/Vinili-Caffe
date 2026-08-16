const { resolveGuildAccess } = require("../../MultiGuild/core/guildRegistry");
const { getTenantChannelMapSync } = require("../../MultiGuild/core/tenantGuildSettings");
const IDs = require("../Config/ids");

function normalizeModLogChannelId(value) {
  const id = String(value || "").trim();
  return id && /^\d{16,20}$/.test(id) ? id : null;
}

function resolveModLogChannelId(guildId) {
  const gid = String(guildId || "").trim();
  if (!gid) return null;
  const mainId = String(IDs.guilds?.main || "").trim();
  // Solo il main usa i canali catalogo del main: niente spillover da sponsor/tenant.
  if (mainId && gid === mainId) {
    return normalizeModLogChannelId(IDs.channels?.modLogs);
  }
  const fromTenantSettings = normalizeModLogChannelId(getTenantChannelMapSync(gid).modLogs);
  if (fromTenantSettings) return fromTenantSettings;
  try {
    const access = resolveGuildAccess(gid);
    return normalizeModLogChannelId(access?.entry?.channelMap?.modLogs);
  } catch {
  }
  return null;
}

module.exports = { resolveModLogChannelId };