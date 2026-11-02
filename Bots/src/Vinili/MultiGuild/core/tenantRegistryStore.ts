const { getBotState, setBotState } = require("../../../shared/botState/botStateStore") as typeof import("../../../shared/botState/botStateStore");
const { isViniliProtectedGuild, normalizeGuildId } = require("./viniliProtectedGuilds") as typeof import("./viniliProtectedGuilds");
const { isMongoReady } = require("../../../shared/db/mongoConnect") as typeof import("../../../shared/db/mongoConnect");

function invalidateRegistryCache() {
  require("./guildRegistry").invalidateRegistryCache();
}

const BOT_STATE_KEY = "multiGuildTenantRegistry";

let dynamicGuildRowsCache = Object.freeze({});

function normalizeLabel(label?, guildId?) {
  const text = String(label || "").trim();
  if (text) return text.slice(0, 80);
  return `tenant_${guildId}`;
}

async function loadTenantRegistryMap() {
  if (!isMongoReady()) return {};
  const raw = await getBotState(BOT_STATE_KEY, null);
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

function mapToGuildRows(map?) {
  const guilds: Record<string, any> = {};
  for (const [guildId, row] of Object.entries(map || {})) {
    const gid = normalizeGuildId(guildId);
    if (!gid || isViniliProtectedGuild(gid)) continue;
    const label = normalizeLabel(row?.l ?? row?.label, gid);
    guilds[gid] = {
      label,
      mode: "tenant",
      enabled: row?.enabled !== false,
      features: row?.features && typeof row.features === "object" ? row.features : undefined,
      autoRegistered: true,
    };
  }
  return guilds;
}

async function refreshDynamicGuildRowsCache() {
  if (!isMongoReady()) return dynamicGuildRowsCache;
  const map = await loadTenantRegistryMap();
  dynamicGuildRowsCache = Object.freeze(mapToGuildRows(map));
  invalidateRegistryCache();
  return dynamicGuildRowsCache;
}

function getDynamicGuildRowsCache() {
  return dynamicGuildRowsCache;
}

async function registerTenantGuild(guildId?, label?) {
  const gid = normalizeGuildId(guildId);
  if (!gid || isViniliProtectedGuild(gid)) return false;
  if (!isMongoReady()) return false;
  const map = await loadTenantRegistryMap();
  const nextLabel = normalizeLabel(label, gid);
  const prev = map[gid];
  if (prev && String(prev.l || prev.label || "") === nextLabel) {
    await refreshDynamicGuildRowsCache();
    return false;
  }
  map[gid] = { l: nextLabel, t: Date.now() };
  await setBotState(BOT_STATE_KEY, map);
  await refreshDynamicGuildRowsCache();
  return true;
}

async function unregisterTenantGuild(guildId?) {
  const gid = normalizeGuildId(guildId);
  if (!gid || isViniliProtectedGuild(gid)) return false;
  if (!isMongoReady()) return false;
  const map = await loadTenantRegistryMap();
  if (!Object.prototype.hasOwnProperty.call(map, gid)) return false;
  delete map[gid];
  await setBotState(BOT_STATE_KEY, map);
  await refreshDynamicGuildRowsCache();
  return true;
}

async function setTenantGuildFeature(guildId?, featureKey?, enabled?) {
  const gid = normalizeGuildId(guildId);
  const key = String(featureKey || "").trim();
  if (!gid || !key || isViniliProtectedGuild(gid)) return false;
  if (!isMongoReady()) return false;
  const map = await loadTenantRegistryMap();
  const prev = map[gid] && typeof map[gid] === "object" ? map[gid] : { l: normalizeLabel(null, gid), t: Date.now() };
  const features =
    prev.features && typeof prev.features === "object" && !Array.isArray(prev.features)
      ? { ...prev.features }
      : {};
  features[key] = enabled === true;
  map[gid] = { ...prev, features, t: Date.now() };
  await setBotState(BOT_STATE_KEY, map);
  await refreshDynamicGuildRowsCache();
  return true;
}

async function bootstrapTenantRegistryFromClient(client?) {
  if (!client?.guilds?.cache) return [];
  const added = [];
  for (const guild of client.guilds.cache.values()) {
    if (!guild?.id || isViniliProtectedGuild(guild.id)) continue;
    const created = await registerTenantGuild(guild.id, guild.name);
    if (created) added.push(guild.id);
  }
  return added;
}

export = {
  BOT_STATE_KEY,
  getDynamicGuildRowsCache,
  refreshDynamicGuildRowsCache,
  loadTenantRegistryMap,
  registerTenantGuild,
  unregisterTenantGuild,
  setTenantGuildFeature,
  bootstrapTenantRegistryFromClient,
};