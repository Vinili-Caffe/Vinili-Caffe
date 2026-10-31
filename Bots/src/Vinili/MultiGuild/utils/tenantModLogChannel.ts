const { resolveGuildAccess } = require("../core/guildRegistry") as typeof import("../core/guildRegistry");
const { getTenantChannelMapSync } = require("../core/tenantGuildSettings") as typeof import("../core/tenantGuildSettings");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");

function normalizeModLogChannelId(value?) {
  const id = String(value || "").trim();
  return id && /^\d{16,20}$/.test(id) ? id : null;
}

function resolveModLogChannelId(guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return null;
  const mainId = String(IDs.guilds?.main || "").trim();
    if (mainId && gid === mainId) {
    return normalizeModLogChannelId(IDs.channels?.modLogs);
  }
  const fromTenantSettings = normalizeModLogChannelId((getTenantChannelMapSync(gid) as any).modLogs);
  if (fromTenantSettings) return fromTenantSettings;
  try {
    const access: any = resolveGuildAccess(gid);
    return normalizeModLogChannelId(access?.entry?.channelMap?.modLogs);
  } catch {
  }
  return null;
}

export = { resolveModLogChannelId };