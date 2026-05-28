const { getBotState, setBotState } = require("../../Utils/BotState/botStateStore");
const { isMongoReady } = require("../../Utils/Database/mongoConnect");
const { isViniliProtectedGuild, normalizeGuildId } = require("./viniliProtectedGuilds");

const BOT_STATE_KEY = "multiGuildTenantSettings.v1";

let settingsCache = Object.freeze({});

function normalizeChannelId(value) {
  const id = String(value || "").trim();
  return id && /^\d{16,20}$/.test(id) ? id : null;
}

function rowToChannelMap(row) {
  if (!row || typeof row !== "object") return {};
  const out = {};
  const quotes = normalizeChannelId(row.q ?? row.quotes ?? row?.cm?.quotes);
  const modLogs = normalizeChannelId(row.ml ?? row.modLogs ?? row?.cm?.modLogs);
  const roulette = normalizeChannelId(row.r ?? row.roulette ?? row?.cm?.roulette);
  if (quotes) out.quotes = quotes;
  if (modLogs) out.modLogs = modLogs;
  if (roulette) out.roulette = roulette;
  return out;
}

async function loadSettingsMap() {
  if (!isMongoReady()) return {};
  const raw = await getBotState(BOT_STATE_KEY, null);
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

async function refreshTenantGuildSettingsCache() {
  if (!isMongoReady()) return settingsCache;
  settingsCache = Object.freeze(await loadSettingsMap());
  return settingsCache;
}

function getTenantChannelMapSync(guildId) {
  const gid = normalizeGuildId(guildId);
  if (!gid) return {};
  return rowToChannelMap(settingsCache[gid]);
}

async function setTenantChannelField(guildId, fieldKey, channelId) {
  const gid = normalizeGuildId(guildId);
  if (!gid || isViniliProtectedGuild(gid)) {
    return { ok: false, reason: "protected_guild" };
  }
  if (!isMongoReady()) {
    return { ok: false, reason: "mongo_not_ready" };
  }
  const key = String(fieldKey || "").trim();
  if (!key) return { ok: false, reason: "invalid_field" };
  const map = await loadSettingsMap();
  const nextId = channelId ? normalizeChannelId(channelId) : null;
  if (channelId && !nextId) {
    return { ok: false, reason: "invalid_channel" };
  }
  const prev = map[gid] && typeof map[gid] === "object" ? { ...map[gid] } : {};
  if (!nextId) {
    delete prev[key];
    if (!Object.keys(prev).length) delete map[gid];
    else map[gid] = prev;
  } else {
    map[gid] = { ...prev, [key]: nextId };
  }
  const saved = await setBotState(BOT_STATE_KEY, map);
  if (!saved) return { ok: false, reason: "persist_failed" };
  await refreshTenantGuildSettingsCache();
  const verifyKey =
    key === "q" ? "quotes" : key === "ml" ? "modLogs" : key === "r" ? "roulette" : null;
  if (verifyKey) {
    const persisted = getTenantChannelMapSync(gid)[verifyKey] || null;
    if (nextId && persisted !== nextId) {
      return { ok: false, reason: "persist_verify_failed" };
    }
    if (!nextId && persisted) {
      return { ok: false, reason: "persist_verify_failed" };
    }
  }
  return { ok: true, channelId: nextId };
}

async function setTenantQuoteChannel(guildId, channelId) {
  return setTenantChannelField(guildId, "q", channelId);
}

async function setTenantModLogChannel(guildId, channelId) {
  return setTenantChannelField(guildId, "ml", channelId);
}

async function setTenantRouletteChannel(guildId, channelId) {
  return setTenantChannelField(guildId, "r", channelId);
}

module.exports = {
  BOT_STATE_KEY,
  getTenantChannelMapSync,
  refreshTenantGuildSettingsCache,
  setTenantChannelField,
  setTenantQuoteChannel,
  setTenantModLogChannel,
  setTenantRouletteChannel,
};