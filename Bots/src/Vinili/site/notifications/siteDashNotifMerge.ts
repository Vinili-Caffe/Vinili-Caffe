/**
 * Avvisi dashboard (premium, bot assente, ticket, staff) → stesso feed della campanella sito.
 * Id sintetici `dash:…` (non sono ObjectId Mongo).
 */
const CACHE_TTL_MS = 30_000;
const cache = new Map();

function dashKind(type?) {
  const t = String(type || "").trim().toLowerCase();
  if (t === "staff") return "staff";
  if (t === "tickets_stale") return "web_ticket";
  if (t === "premium_expiring") return "info";
  if (t === "bot_missing" || t === "bot_left") return "mod";
  return "info";
}

function toSiteItem(row?) {
  const rawId = String(row?.id || "").trim();
  if (!rawId) return null;
  const id = rawId.startsWith("dash:") ? rawId : `dash:${rawId}`;
  const title = String(row?.title || "").trim() || "Avviso dashboard";
  const body = String(row?.body || title).trim();
  const href = String(row?.href || "").trim() || "/dashboard/";
  return {
    id,
    title,
    body,
    kind: dashKind(row?.type),
    channel: "dashboard",
    dedupeKey: id,
    at: Number(row?.at) || Date.now(),
    openUrl: href,
    ticketId: null,
    read: row?.read === true,
    readAt: row?.read === true ? Number(row?.at) || Date.now() : null,
    filtered: false,
  };
}

async function loadDashboardSiteItems(client?, accessToken?) {
  const token = String(accessToken || "").trim();
  if (!token || !client) return { items: [], unread: 0 };
  const now = Date.now();
  const hit = cache.get(token);
  if (hit && now - hit.at < CACHE_TTL_MS) {
    return { items: hit.items, unread: hit.unread };
  }
  try {
    const {
      listDashboardStaffNotifications,
    } = require("../../../MultiGuild/site/dashboard/siteDashboardStaffNotificationsApi") as typeof import("../../../MultiGuild/site/dashboard/siteDashboardStaffNotificationsApi");
    const res = await listDashboardStaffNotifications(client, token);
    if (!res?.ok || !Array.isArray(res.items)) {
      const empty = { items: [], unread: 0 };
      cache.set(token, { at: now, ...empty });
      return empty;
    }
    const items = res.items.map(toSiteItem).filter(Boolean);
    const unread = items.filter((x?) => !x.read).length;
    const out = { items, unread };
    cache.set(token, { at: now, ...out });
    if (cache.size > 400) {
      const cutoff = now - CACHE_TTL_MS * 2;
      for (const [k, v] of cache) {
        if (!v || v.at < cutoff) cache.delete(k);
      }
    }
    return out;
  } catch (err) {
    global.logger?.warn?.("[site-notif] dash merge:", err?.message || err);
    return { items: [], unread: 0 };
  }
}

function invalidateDashNotifCache(accessToken?) {
  const token = String(accessToken || "").trim();
  if (token) cache.delete(token);
}

function isDashNotifId(id?) {
  return String(id || "").trim().startsWith("dash:");
}

async function markDashboardAlertsRead(client?, accessToken?) {
  invalidateDashNotifCache(accessToken);
  try {
    const {
      markDashboardStaffNotificationsRead,
    } = require("../../../MultiGuild/site/dashboard/siteDashboardStaffNotificationsApi") as typeof import("../../../MultiGuild/site/dashboard/siteDashboardStaffNotificationsApi");
    await markDashboardStaffNotificationsRead(client, accessToken);
    return true;
  } catch (err) {
    global.logger?.warn?.("[site-notif] dash mark-read:", err?.message || err);
    return false;
  }
}

function mergeSiteAndDashItems(siteItems?, dashItems?, limit = 50) {
  const lim = Math.min(100, Math.max(1, Number(limit) || 50));
  const site = Array.isArray(siteItems) ? siteItems : [];
  const dash = Array.isArray(dashItems) ? dashItems : [];
  return [...dash, ...site]
    .sort((a?, b?) => Number(b?.at || 0) - Number(a?.at || 0))
    .slice(0, lim);
}

export = {
  loadDashboardSiteItems,
  invalidateDashNotifCache,
  isDashNotifId,
  markDashboardAlertsRead,
  mergeSiteAndDashItems,
};
