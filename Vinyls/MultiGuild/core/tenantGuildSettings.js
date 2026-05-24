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
  const quotes = normalizeChannelId(row.q ?? row.quotes ?? row?.cm?.quotes);
  return quotes ? { quotes } : {};
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

async function setTenantQuoteChannel(guildId, channelId) {
  const gid = normalizeGuildId(guildId);
  if (!gid || isViniliProtectedGuild(gid)) {
    return { ok: false, reason: "protected_guild" };
  }
  if (!isMongoReady()) {
    return { ok: false, reason: "mongo_not_ready" };
  }
  const map = await loadSettingsMap();
  const nextId = channelId ? normalizeChannelId(channelId) : null;
  if (channelId && !nextId) {
    return { ok: false, reason: "invalid_channel" };
  }
  const prev = map[gid] && typeof map[gid] === "object" ? { ...map[gid] } : {};
  if (!nextId) {
    delete prev.q;
    if (!Object.keys(prev).length) delete map[gid];
    else map[gid] = prev;
  } else {
    map[gid] = { ...prev, q: nextId };
  }
  await setBotState(BOT_STATE_KEY, map);
  await refreshTenantGuildSettingsCache();
  return { ok: true, channelId: nextId };
}

module.exports = {
  BOT_STATE_KEY,
  getTenantChannelMapSync,
  refreshTenantGuildSettingsCache,
  setTenantQuoteChannel,
};