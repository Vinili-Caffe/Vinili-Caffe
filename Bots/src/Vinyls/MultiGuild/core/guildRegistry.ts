const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");
const { allowUnknownGuilds } = require("./env") as typeof import("./env");
const { isViniliProtectedGuild, normalizeGuildId } = require("./viniliProtectedGuilds") as typeof import("./viniliProtectedGuilds");
const { getDynamicGuildRowsCache } = require("./tenantRegistryStore") as typeof import("./tenantRegistryStore");
const { getTenantChannelMapSync } = require("./tenantGuildSettings") as typeof import("./tenantGuildSettings");

const REGISTRY_PATH = path.join(__dirname, "..", "config", "registry.json");
const DEFAULT_REGISTRY = Object.freeze({
  version: 1,
  defaults: { mode: "tenant", enabled: true, features: {} },
  guilds: {},
});

let cache = null;
let cacheMtimeMs = 0;
let protectedRegistryWarned = new Set();

function readRegistryFile() {
  try {
    if (!fs.existsSync(REGISTRY_PATH)) return { ...DEFAULT_REGISTRY, guilds: {} };
    const stat = fs.statSync(REGISTRY_PATH);
    if (cache && cacheMtimeMs === stat.mtimeMs) return cache;
    const parsed = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
    const base = parsed && typeof parsed === "object" ? parsed : { ...DEFAULT_REGISTRY, guilds: {} };
    const dynamicGuilds = getDynamicGuildRowsCache();
        cache = {
      ...base,
      guilds: {
        ...dynamicGuilds,
        ...(base.guilds && typeof base.guilds === "object" ? base.guilds : {}),
      },
    };
    cacheMtimeMs = stat.mtimeMs;
    warnProtectedGuildsInRegistry(cache);
    return cache;
  } catch (err) {
    global.logger?.warn?.("[MultiGuild] registry read failed:", err?.message || err);
    return { ...DEFAULT_REGISTRY, guilds: {} };
  }
}

function warnProtectedGuildsInRegistry(registry?) {
  const guilds = registry?.guilds;
  if (!guilds || typeof guilds !== "object") return;
  for (const guildId of Object.keys(guilds)) {
    const gid = normalizeGuildId(guildId);
    if (!gid || !isViniliProtectedGuild(gid)) continue;
    if (protectedRegistryWarned.has(gid)) continue;
    protectedRegistryWarned.add(gid);
    global.logger?.warn?.(
      `[MultiGuild] registry ignora guild protetta ${gid} (main/test/sponsor). Rimuovila da config/registry.json.`,
    );
  }
}

function mergeFeatureMaps(base: Record<string, any> = {}, override: Record<string, any> = {}) {
  const out = { ...(base && typeof base === "object" ? base : {}) };
  if (!override || typeof override !== "object") return out;
  for (const [key, value] of Object.entries(override)) {
    if (typeof value === "boolean") out[key] = value;
  }
  return out;
}

function mergeChannelMaps(...maps) {
  const out: Record<string, any> = {};
  for (const map of maps) {
    if (!map || typeof map !== "object") continue;
    for (const [key, value] of Object.entries(map)) {
      const id = String(value || "").trim();
      if (id && /^\d{16,20}$/.test(id)) out[key] = id;
    }
  }
  return out;
}

function buildProtectedAccess(guildId?) {
  return {
    allowed: true,
    managed: false,
    protected: true,
    mode: "protected",
    entry: {
      guildId: normalizeGuildId(guildId),
      label: "vinili_protected",
      mode: "protected",
      enabled: true,
      features: {},
      roleMap: {},
      channelMap: {},
      raw: null,
    },
    reason: "vinili_protected",
  };
}

function getGuildEntry(guildId?) {
  const gid = normalizeGuildId(guildId);
  if (!gid || isViniliProtectedGuild(gid)) return null;
  const registry = readRegistryFile();
  const row = registry.guilds?.[gid];
  if (!row || typeof row !== "object") return null;
  const defaults = registry.defaults || {};
  return {
    guildId: gid,
    label: String(row.label || gid),
    mode: String(row.mode || defaults.mode || "tenant").toLowerCase(),
    enabled: row.enabled !== false && defaults.enabled !== false,
    features: mergeFeatureMaps(defaults.features, row.features),
    roleMap: row.roleMap && typeof row.roleMap === "object" ? row.roleMap : {},
    channelMap: mergeChannelMaps(row.channelMap, getTenantChannelMapSync(gid)),
    raw: row,
  };
}

function listRegisteredGuildIds() {
  const registry = readRegistryFile();
  return Object.keys(registry.guilds || {})
    .map(normalizeGuildId)
    .filter((gid?) => gid && !isViniliProtectedGuild(gid));
}

function listTenantGuildIds() {
  return listRegisteredGuildIds();
}

function isGuildRegistered(guildId?) {
  return Boolean(getGuildEntry(guildId));
}

function resolveGuildAccess(guildId?) {
  const gid = normalizeGuildId(guildId);
  if (!gid) {
    return { allowed: false, managed: false, protected: false, mode: "unknown", entry: null, reason: "invalid_guild" };
  }
  if (isViniliProtectedGuild(gid)) {
    return buildProtectedAccess(gid);
  }
  const entry = getGuildEntry(gid);
  if (entry) {
    return {
      allowed: entry.enabled,
      managed: true,
      protected: false,
      mode: entry.mode,
      entry,
      reason: entry.enabled ? "tenant_registered" : "tenant_disabled",
    };
  }
  if (allowUnknownGuilds()) {
    const registry = readRegistryFile();
    const defaults = registry.defaults || {};
    return {
      allowed: defaults.enabled !== false,
      managed: true,
      protected: false,
      mode: String(defaults.mode || "tenant").toLowerCase(),
      entry: {
        guildId: gid,
        label: "unknown",
        mode: String(defaults.mode || "tenant").toLowerCase(),
        enabled: defaults.enabled !== false,
        features: mergeFeatureMaps({}, defaults.features),
        roleMap: {},
        channelMap: mergeChannelMaps(getTenantChannelMapSync(gid)),
        raw: null,
      },
      reason: "unknown_allowed",
    };
  }
  return { allowed: false, managed: false, protected: false, mode: "unknown", entry: null, reason: "not_registered" };
}

function invalidateRegistryCache() {
  cache = null;
  cacheMtimeMs = 0;
  protectedRegistryWarned = new Set();
}

export = {
  REGISTRY_PATH,
  readRegistryFile,
  getGuildEntry,
  listRegisteredGuildIds,
  listTenantGuildIds,
  isGuildRegistered,
  resolveGuildAccess,
  invalidateRegistryCache,
  normalizeGuildId,
};