const { getBotState, setBotState } = require("../../Utils/BotState/botStateStore");

const BOT_STATE_KEY = "tenantStaffNotifications.v1";
const MAX_STORED = 30;

function normalizeStore(raw) {
  const byGuild = raw?.byGuild && typeof raw.byGuild === "object" ? raw.byGuild : {};
  return { byGuild };
}

async function loadStore() {
  const raw = await getBotState(BOT_STATE_KEY).catch(() => null);
  return normalizeStore(raw);
}

async function saveStore(store) {
  await setBotState(BOT_STATE_KEY, normalizeStore(store)).catch(() => null);
}

async function recordTenantStaffNotification(guildId, content, authorId) {
  const gid = String(guildId || "").trim();
  const text = String(content || "").trim();
  const aid = String(authorId || "").trim();
  if (!gid || !text) return null;
  const store = await loadStore();
  const list = Array.isArray(store.byGuild[gid]) ? store.byGuild[gid].slice() : [];
  const entry = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    content: text.slice(0, 1800),
    authorId: aid || null,
    createdAt: new Date().toISOString(),
  };
  list.unshift(entry);
  store.byGuild[gid] = list.slice(0, MAX_STORED);
  await saveStore(store);
  return entry;
}

async function listTenantStaffNotifications(guildId, limit = 5) {
  const gid = String(guildId || "").trim();
  if (!gid) return [];
  const store = await loadStore();
  const list = Array.isArray(store.byGuild[gid]) ? store.byGuild[gid] : [];
  return list.slice(0, Math.max(1, Math.min(20, Number(limit) || 5)));
}

function countUnreadNotifications(notifications, readAt) {
  const readMs = readAt ? new Date(readAt).getTime() : 0;
  if (!readMs) return notifications.length;
  return notifications.filter((row) => new Date(row.createdAt).getTime() > readMs).length;
}

module.exports = {
  recordTenantStaffNotification,
  listTenantStaffNotifications,
  countUnreadNotifications,
};
