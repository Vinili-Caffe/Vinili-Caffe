/**
 * Centro notifiche dashboard: avvisi operativi (live + eventi) per chi ha accesso,
 * più le notifiche staff partner per l’alto staff (stesso feed).
 */
const IDs = require("../../../Vinili/Config/ids") as typeof import("../../../Vinili/Config/ids");
const {
  listTenantStaffNotifications,
} = require("../../../Vinili/Partner/services/tenantStaffNotificationService") as typeof import("../../../Vinili/Partner/services/tenantStaffNotificationService");
const {
  getTenantProfilePrefs,
  updateTenantProfilePrefs,
} = require("../../../Vinili/Partner/services/tenantProfilePreferencesService") as typeof import("../../../Vinili/Partner/services/tenantProfilePreferencesService");
const {
  listDashboardGuilds,
  resolveDashboardHighStaffFlag,
  fetchDiscordUser,
  getDashboardAccess,
} = require("./siteDashboardApi") as typeof import("./siteDashboardApi");
const {
  listEventAlertsForGuildIds,
  getUserAlertsReadAt,
  markUserAlertsRead,
  buildLiveAlertsForGuilds,
  serializeEvent,
  applyReadState,
  countUnread,
} = require("./dashboardAlertsService") as typeof import("./dashboardAlertsService");

const LIST_LIMIT = 40;

function mainGuildId(client?) {
  return String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
}

function serializeStaffNotification(row?, readAt?) {
  const createdAt = String(row?.createdAt || "").trim();
  const atMs = createdAt ? new Date(createdAt).getTime() : 0;
  const readMs = readAt ? new Date(readAt).getTime() : 0;
  const content = String(row?.content || "").trim();
  const title = content.length > 72 ? `${content.slice(0, 71)}…` : content || "Notifica staff";
  return {
    id: `staff:${String(row?.id || atMs || "").trim() || Math.random().toString(36).slice(2)}`,
    type: "staff",
    title,
    body: content,
    at: Number.isFinite(atMs) && atMs > 0 ? atMs : Date.now(),
    read: Boolean(readMs && Number.isFinite(atMs) && atMs <= readMs),
    href: null,
    guildId: null,
    guildName: null,
    source: "staff",
    authorId: row?.authorId ? String(row.authorId) : null,
  };
}

async function listDashboardStaffNotifications(client?, accessToken?) {
  const access = await getDashboardAccess(client, accessToken);
  if (!access.ok) return access;
  if (!access.allowed) {
    return {
      ok: false,
      status: 403,
      error: "dashboard_access_denied",
      message: "Non hai accesso alla dashboard.",
    };
  }

  const user = await fetchDiscordUser(accessToken);
  if (!user.ok) return user;
  const userId = String(user.userId || "").trim();

  const guildsRes = await listDashboardGuilds(client, accessToken);
  if (!guildsRes.ok) return guildsRes;
  const guilds = Array.isArray(guildsRes.guilds) ? guildsRes.guilds : [];
  const guildIds = guilds.map((g?) => String(g?.id || "").trim()).filter(Boolean);

  const alertsReadAt = await getUserAlertsReadAt(userId);

  const [liveRaw, eventsRaw] = await Promise.all([
    buildLiveAlertsForGuilds(guilds),
    listEventAlertsForGuildIds(guildIds, LIST_LIMIT),
  ]);
  const live = applyReadState(liveRaw, alertsReadAt);
  const events = eventsRaw.map((row?) => serializeEvent(row, alertsReadAt));

  let staffItems = [];
  const staffFlag = await resolveDashboardHighStaffFlag(client, accessToken);
  if (staffFlag.ok && staffFlag.highStaff) {
    const guildId = mainGuildId(client);
    if (guildId) {
      const [notifications, prefs] = await Promise.all([
        listTenantStaffNotifications(guildId, 20),
        getTenantProfilePrefs(guildId, userId),
      ]);
      staffItems = notifications.map((row?) => serializeStaffNotification(row, prefs.notificationsReadAt));
    }
  }

  const items = [...live, ...events, ...staffItems]
    .sort((a?, b?) => Number(b?.at || 0) - Number(a?.at || 0))
    .slice(0, LIST_LIMIT);

  return {
    ok: true,
    status: 200,
    unread: countUnread(items),
    items,
  };
}

async function markDashboardStaffNotificationsRead(client?, accessToken?) {
  const access = await getDashboardAccess(client, accessToken);
  if (!access.ok) return access;
  if (!access.allowed) {
    return {
      ok: false,
      status: 403,
      error: "dashboard_access_denied",
      message: "Non hai accesso alla dashboard.",
    };
  }

  const user = await fetchDiscordUser(accessToken);
  if (!user.ok) return user;
  const userId = String(user.userId || "").trim();

  await markUserAlertsRead(userId);

  const staffFlag = await resolveDashboardHighStaffFlag(client, accessToken);
  if (staffFlag.ok && staffFlag.highStaff) {
    const guildId = mainGuildId(client);
    if (guildId) {
      await updateTenantProfilePrefs(guildId, userId, { notificationsReadAt: new Date() });
    }
  }

  return listDashboardStaffNotifications(client, accessToken);
}

export = {
  listDashboardStaffNotifications,
  markDashboardStaffNotificationsRead,
};
