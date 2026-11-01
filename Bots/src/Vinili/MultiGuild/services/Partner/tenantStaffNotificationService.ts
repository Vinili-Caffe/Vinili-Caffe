const { getBotState } = require("../../../Utils/BotState/botStateStore") as typeof import("../../../Utils/BotState/botStateStore");

const BOT_STATE_KEY = "tenantStaffNotifications.v1";
function normalizeStore(raw?) {
  const byGuild = raw?.byGuild && typeof raw.byGuild === "object" ? raw.byGuild : {};
  return { byGuild };
}

async function loadStore() {
  const raw = await getBotState(BOT_STATE_KEY).catch(() => null);
  return normalizeStore(raw);
}

async function listTenantStaffNotifications(guildId?, limit = 5) {
  const gid = String(guildId || "").trim();
  if (!gid) return [];
  const store = await loadStore();
  const list = Array.isArray(store.byGuild[gid]) ? store.byGuild[gid] : [];
  return list.slice(0, Math.max(1, Math.min(20, Number(limit) || 5)));
}

function countUnreadNotifications(notifications?, readAt?) {
  const readMs = readAt ? new Date(readAt).getTime() : 0;
  if (!readMs) return notifications.length;
  return notifications.filter((row?) => new Date(row.createdAt).getTime() > readMs).length;
}

export = {
  listTenantStaffNotifications,
  countUnreadNotifications,
};
