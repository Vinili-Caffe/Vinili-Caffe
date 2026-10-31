const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const {
  listTenantStaffNotifications,
  countUnreadNotifications,
} = require("../../MultiGuild/services/Partner/tenantStaffNotificationService") as typeof import("../../MultiGuild/services/Partner/tenantStaffNotificationService");
const {
  getTenantProfilePrefs,
  updateTenantProfilePrefs,
} = require("../../MultiGuild/services/Partner/tenantProfilePreferencesService") as typeof import("../../MultiGuild/services/Partner/tenantProfilePreferencesService");
const { assertDashboardHighStaffAccess } = require("./siteDashboardApi") as typeof import("./siteDashboardApi");

const LIST_LIMIT = 20;

function mainGuildId(client?) {
  return String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
}

function serializeNotification(row?, readAt?) {
  const createdAt = String(row?.createdAt || "").trim();
  const atMs = createdAt ? new Date(createdAt).getTime() : 0;
  const readMs = readAt ? new Date(readAt).getTime() : 0;
  const content = String(row?.content || "").trim();
  const title = content.length > 72 ? `${content.slice(0, 71)}…` : content || "Notifica staff";
  return {
    id: String(row?.id || "").trim(),
    title,
    body: content,
    at: Number.isFinite(atMs) && atMs > 0 ? atMs : Date.now(),
    createdAt: createdAt || null,
    authorId: row?.authorId ? String(row.authorId) : null,
    read: Boolean(readMs && Number.isFinite(atMs) && atMs <= readMs),
  };
}

async function listDashboardStaffNotifications(client?, accessToken?) {
  const gate = await assertDashboardHighStaffAccess(client, accessToken);
  if (!gate.ok) return gate;

  const guildId = mainGuildId(client);
  if (!guildId) {
    return { ok: false, status: 503, error: "misconfigured", message: "Guild principale non configurata." };
  }

  const [notifications, prefs] = await Promise.all([
    listTenantStaffNotifications(guildId, LIST_LIMIT),
    getTenantProfilePrefs(guildId, gate.userId),
  ]);
  const items = notifications.map((row?) => serializeNotification(row, prefs.notificationsReadAt));
  const unread = countUnreadNotifications(notifications, prefs.notificationsReadAt);

  return {
    ok: true,
    status: 200,
    unread,
    items,
  };
}

async function markDashboardStaffNotificationsRead(client?, accessToken?) {
  const gate = await assertDashboardHighStaffAccess(client, accessToken);
  if (!gate.ok) return gate;

  const guildId = mainGuildId(client);
  if (!guildId) {
    return { ok: false, status: 503, error: "misconfigured", message: "Guild principale non configurata." };
  }

  await updateTenantProfilePrefs(guildId, gate.userId, { notificationsReadAt: new Date() });
  return listDashboardStaffNotifications(client, accessToken);
}

export = {
  listDashboardStaffNotifications,
  markDashboardStaffNotificationsRead,
};
