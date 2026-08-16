const { getBotState, setBotState } = require("../../Utils/BotState/botStateStore");
const { isMongoReady } = require("../../Utils/Database/mongoConnect");
const { isViniliProtectedGuild, normalizeGuildId } = require("../../MultiGuild/core/viniliProtectedGuilds");

const BOT_STATE_KEY = "botUsageBlacklist.v1";
const CACHE_TTL_MS = 15_000;

let cache = { at: 0, data: null };

function normalizeSnowflake(id) {
  const s = String(id || "").trim();
  if (!/^\d{16,22}$/.test(s)) return null;
  return s;
}

function emptyStore() {
  return { users: {}, guilds: {} };
}

function normalizeStore(raw) {
  const base = emptyStore();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const users = raw.users && typeof raw.users === "object" && !Array.isArray(raw.users) ? raw.users : {};
  const guilds = raw.guilds && typeof raw.guilds === "object" && !Array.isArray(raw.guilds) ? raw.guilds : {};
  for (const [id, row] of Object.entries(users)) {
    const uid = normalizeSnowflake(id);
    if (!uid) continue;
    base.users[uid] = {
      addedBy: String(row?.addedBy || "").trim(),
      note: String(row?.note || "").slice(0, 500),
      addedAt: row?.addedAt ? new Date(row.addedAt).toISOString() : new Date().toISOString(),
    };
  }
  for (const [id, row] of Object.entries(guilds)) {
    const gid = normalizeGuildId(id) || normalizeSnowflake(id);
    if (!gid) continue;
    base.guilds[gid] = {
      addedBy: String(row?.addedBy || "").trim(),
      note: String(row?.note || "").slice(0, 500),
      addedAt: row?.addedAt ? new Date(row.addedAt).toISOString() : new Date().toISOString(),
      guildName: String(row?.guildName || "").slice(0, 100) || null,
    };
  }
  return base;
}

async function loadStore({ force = false } = {}) {
  const now = Date.now();
  if (!force && cache.data && now - cache.at < CACHE_TTL_MS) return cache.data;
  if (!isMongoReady()) {
    cache = { at: now, data: emptyStore() };
    return cache.data;
  }
  const raw = await getBotState(BOT_STATE_KEY, null);
  const data = normalizeStore(raw);
  cache = { at: now, data };
  return data;
}

async function saveStore(store) {
  if (!isMongoReady()) return false;
  const ok = await setBotState(BOT_STATE_KEY, normalizeStore(store));
  if (ok) cache = { at: Date.now(), data: normalizeStore(store) };
  return ok;
}

function invalidateBotUsageBlacklistCache() {
  cache = { at: 0, data: null };
}

async function isUserBotUsageBlacklisted(userId) {
  const uid = normalizeSnowflake(userId);
  if (!uid) return false;
  const store = await loadStore();
  return Boolean(store.users[uid]);
}

async function isGuildBotUsageBlacklisted(guildId) {
  const gid = normalizeGuildId(guildId) || normalizeSnowflake(guildId);
  if (!gid) return false;
  const store = await loadStore();
  return Boolean(store.guilds[gid]);
}

async function listBotUsageBlacklist(kind = "all") {
  const store = await loadStore();
  const users = Object.entries(store.users).map(([id, row]) => ({ id, type: "user", ...row }));
  const guilds = Object.entries(store.guilds).map(([id, row]) => ({ id, type: "guild", ...row }));
  users.sort((a, b) => String(b.addedAt).localeCompare(String(a.addedAt)));
  guilds.sort((a, b) => String(b.addedAt).localeCompare(String(a.addedAt)));
  const k = String(kind || "all").toLowerCase();
  if (k === "user" || k === "users") return users;
  if (k === "guild" || k === "guilds" || k === "server" || k === "servers") return guilds;
  return [...users, ...guilds];
}

async function addUserBotUsageBlacklist(userId, addedBy, note = "") {
  const uid = normalizeSnowflake(userId);
  if (!uid) return { ok: false, reason: "invalid_id" };
  const store = await loadStore({ force: true });
  store.users[uid] = {
    addedBy: String(addedBy || "").trim(),
    note: String(note || "").slice(0, 500),
    addedAt: new Date().toISOString(),
  };
  const saved = await saveStore(store);
  if (!saved) return { ok: false, reason: "persist_failed" };
  return { ok: true, id: uid, type: "user" };
}

async function removeUserBotUsageBlacklist(userId) {
  const uid = normalizeSnowflake(userId);
  if (!uid) return { ok: false, reason: "invalid_id" };
  const store = await loadStore({ force: true });
  const existed = Boolean(store.users[uid]);
  delete store.users[uid];
  const saved = await saveStore(store);
  if (!saved) return { ok: false, reason: "persist_failed" };
  return { ok: true, deleted: existed, id: uid, type: "user" };
}

async function addGuildBotUsageBlacklist(guildId, addedBy, note = "", meta = {}) {
  const gid = normalizeGuildId(guildId) || normalizeSnowflake(guildId);
  if (!gid) return { ok: false, reason: "invalid_id" };
  if (isViniliProtectedGuild(gid)) return { ok: false, reason: "protected_guild" };
  const store = await loadStore({ force: true });
  const prev = store.guilds[gid] && typeof store.guilds[gid] === "object" ? store.guilds[gid] : null;
  store.guilds[gid] = {
    addedBy: String(addedBy || prev?.addedBy || "").trim(),
    note: String(note || prev?.note || "").slice(0, 500),
    addedAt: prev?.addedAt || new Date().toISOString(),
    guildName:
      String(meta?.guildName || prev?.guildName || "").slice(0, 100) || null,
  };
  const saved = await saveStore(store);
  if (!saved) return { ok: false, reason: "persist_failed" };
  return { ok: true, id: gid, type: "guild" };
}

/**
 * Aggiorna metadati display (es. nome recuperato da partnership) senza toccare note/addedBy.
 */
async function patchGuildBotUsageBlacklistMeta(guildId, meta = {}) {
  const gid = normalizeGuildId(guildId) || normalizeSnowflake(guildId);
  if (!gid) return { ok: false, reason: "invalid_id" };
  const store = await loadStore({ force: true });
  if (!store.guilds[gid]) return { ok: false, reason: "not_found" };
  const nextName = String(meta?.guildName || "").trim().slice(0, 100);
  if (nextName) store.guilds[gid].guildName = nextName;
  const saved = await saveStore(store);
  if (!saved) return { ok: false, reason: "persist_failed" };
  return { ok: true, id: gid, type: "guild", guildName: store.guilds[gid].guildName || null };
}

async function removeGuildBotUsageBlacklist(guildId) {
  const gid = normalizeGuildId(guildId) || normalizeSnowflake(guildId);
  if (!gid) return { ok: false, reason: "invalid_id" };
  const store = await loadStore({ force: true });
  const existed = Boolean(store.guilds[gid]);
  delete store.guilds[gid];
  const saved = await saveStore(store);
  if (!saved) return { ok: false, reason: "persist_failed" };
  return { ok: true, deleted: existed, id: gid, type: "guild" };
}

/**
 * Esce dal guild se il bot è presente. Non blacklist.
 */
async function leaveGuildIfPresent(client, guildId) {
  const gid = normalizeGuildId(guildId) || normalizeSnowflake(guildId);
  if (!gid) return { ok: false, reason: "invalid_id" };
  if (isViniliProtectedGuild(gid)) return { ok: false, reason: "protected_guild" };
  let guild = client?.guilds?.cache?.get(gid) || null;
  if (!guild && client?.guilds?.fetch) {
    guild = await client.guilds.fetch(gid).catch(() => null);
  }
  if (!guild) return { ok: true, left: false, reason: "not_in_guild", id: gid };
  const name = String(guild.name || "").trim() || null;
  await guild.leave();
  try {
    const { unregisterTenantGuild } = require("../../MultiGuild/core/tenantRegistryStore");
    await unregisterTenantGuild(gid).catch(() => null);
  } catch (_) {}
  return { ok: true, left: true, id: gid, guildName: name };
}

/**
 * All'avvio / dopo invite: esci da tutti i guild in blacklist.
 */
async function leaveAllBlacklistedGuilds(client) {
  if (!client?.guilds?.cache) return { ok: true, left: [] };
  const store = await loadStore({ force: true });
  const left = [];
  for (const gid of Object.keys(store.guilds)) {
    if (isViniliProtectedGuild(gid)) continue;
    const result = await leaveGuildIfPresent(client, gid);
    if (result?.left) left.push(gid);
  }
  return { ok: true, left };
}

module.exports = {
  BOT_STATE_KEY,
  normalizeSnowflake,
  invalidateBotUsageBlacklistCache,
  isUserBotUsageBlacklisted,
  isGuildBotUsageBlacklisted,
  listBotUsageBlacklist,
  addUserBotUsageBlacklist,
  removeUserBotUsageBlacklist,
  addGuildBotUsageBlacklist,
  patchGuildBotUsageBlacklistMeta,
  removeGuildBotUsageBlacklist,
  leaveGuildIfPresent,
  leaveAllBlacklistedGuilds,
};
