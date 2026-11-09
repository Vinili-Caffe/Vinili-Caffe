/**
 * Avvisi operativi della dashboard: eventi persistiti (es. bot uscito) + avvisi live
 * (premium in scadenza, bot assente, ticket fermi) calcolati sulle guild dell’utente.
 */
const { getBotState, setBotState } = require("../../../shared/botState/botStateStore") as typeof import("../../../shared/botState/botStateStore");
const { isMongoReady } = require("../../../shared/db/mongoConnect") as typeof import("../../../shared/db/mongoConnect");
const {
  getTenantPremiumSync,
  serializePremiumPublic,
  ensureTenantPremiumCacheFresh,
} = require("../../core/tenantPremium") as typeof import("../../core/tenantPremium");
const {
  getTicketSettingsSync,
  refreshTicketConfigCache,
} = require("../../tickets/tenant/tenantTicketSettings") as typeof import("../../tickets/tenant/tenantTicketSettings");

const EVENTS_KEY = "dashboardAlerts.v1";
const PREFS_KEY = "dashboardAlertPrefs.v1";
const MAX_EVENTS_PER_GUILD = 40;
const MAX_EVENTS_GLOBAL = 200;
const PREMIUM_WARN_MS = 7 * 24 * 60 * 60 * 1000;

function newId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeStore(raw?) {
  const byGuild = raw?.byGuild && typeof raw.byGuild === "object" ? raw.byGuild : {};
  return { byGuild };
}

function normalizePrefsStore(raw?) {
  const byUser = raw?.byUser && typeof raw.byUser === "object" ? raw.byUser : {};
  return { byUser };
}

async function loadEventsStore() {
  const raw = await getBotState(EVENTS_KEY, { byGuild: {} }).catch(() => ({ byGuild: {} }));
  return normalizeStore(raw);
}

async function saveEventsStore(store?) {
  if (!isMongoReady()) return false;
  return setBotState(EVENTS_KEY, normalizeStore(store));
}

async function loadPrefsStore() {
  const raw = await getBotState(PREFS_KEY, { byUser: {} }).catch(() => ({ byUser: {} }));
  return normalizePrefsStore(raw);
}

async function savePrefsStore(store?) {
  if (!isMongoReady()) return false;
  return setBotState(PREFS_KEY, normalizePrefsStore(store));
}

function guildHref(guildId?, section = "settings", tab?) {
  const gid = String(guildId || "").trim();
  if (!gid) return "/dashboard/";
  const qs = new URLSearchParams({ id: gid, s: section });
  if (tab) qs.set("t", String(tab));
  return `/dashboard/guild/?${qs.toString()}`;
}

function serializeEvent(row?, readAtMs = 0) {
  const at = Number(row?.at) || Date.now();
  return {
    id: String(row?.id || "").trim() || newId(),
    type: String(row?.type || "info"),
    title: String(row?.title || "Avviso").trim(),
    body: String(row?.body || "").trim(),
    at,
    read: Boolean(readAtMs && at <= readAtMs),
    href: row?.href ? String(row.href) : null,
    guildId: row?.guildId ? String(row.guildId) : null,
    guildName: row?.guildName ? String(row.guildName) : null,
    source: "event",
  };
}

async function recordBotLeftAlert(guild?) {
  const gid = String(guild?.id || guild?.guildId || "").trim();
  if (!/^\d{16,22}$/.test(gid)) return { ok: false, reason: "invalid_guild" };
  const name = String(guild?.name || "Server").trim() || "Server";
  const store = await loadEventsStore();
  const list = Array.isArray(store.byGuild[gid]) ? store.byGuild[gid].slice() : [];
  const last = list[0];
  if (last && last.type === "bot_left" && Date.now() - Number(last.at || 0) < 60_000) {
    return { ok: true, skipped: true };
  }
  const entry = {
    id: newId(),
    type: "bot_left",
    title: `Bot uscito da ${name}`,
    body: `Vinili non è più in «${name}». Se non l’hai rimosso tu, potrebbe essere stato kickato. Reinvitalo dalla dashboard.`,
    at: Date.now(),
    href: guildHref(gid, "settings"),
    guildId: gid,
    guildName: name,
  };
  list.unshift(entry);
  store.byGuild[gid] = list.slice(0, MAX_EVENTS_PER_GUILD);
  await saveEventsStore(store);
  return { ok: true, entry };
}

async function clearBotLeftAlertsForGuild(guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return;
  const store = await loadEventsStore();
  const list = Array.isArray(store.byGuild[gid]) ? store.byGuild[gid] : [];
  const next = list.filter((row?) => row?.type !== "bot_left");
  if (next.length === list.length) return;
  if (next.length) store.byGuild[gid] = next;
  else delete store.byGuild[gid];
  await saveEventsStore(store);
}

async function listEventAlertsForGuildIds(guildIds?, limit = 40) {
  const ids = Array.isArray(guildIds)
    ? guildIds.map((id?) => String(id || "").trim()).filter(Boolean)
    : [];
  if (!ids.length) return [];
  const store = await loadEventsStore();
  const out = [];
  for (const gid of ids) {
    const list = Array.isArray(store.byGuild[gid]) ? store.byGuild[gid] : [];
    for (const row of list) out.push(row);
  }
  out.sort((a?, b?) => Number(b?.at || 0) - Number(a?.at || 0));
  return out.slice(0, Math.max(1, Math.min(MAX_EVENTS_GLOBAL, Number(limit) || 40)));
}

async function getUserAlertsReadAt(userId?) {
  const uid = String(userId || "").trim();
  if (!uid) return 0;
  const store = await loadPrefsStore();
  const row = store.byUser[uid];
  const ms = row?.alertsReadAt ? new Date(row.alertsReadAt).getTime() : 0;
  return Number.isFinite(ms) && ms > 0 ? ms : 0;
}

async function markUserAlertsRead(userId?) {
  const uid = String(userId || "").trim();
  if (!uid) return 0;
  const store = await loadPrefsStore();
  const now = Date.now();
  store.byUser[uid] = {
    ...(store.byUser[uid] && typeof store.byUser[uid] === "object" ? store.byUser[uid] : {}),
    alertsReadAt: now,
  };
  await savePrefsStore(store);
  return now;
}

async function countStaleOpenTickets(guildId?, waitMinutes = 120) {
  const gid = String(guildId || "").trim();
  if (!gid) return { count: 0, oldestAt: 0 };
  let Ticket;
  try {
    Ticket = require("../../tickets/data/guildFeatureBucketTicketModel");
  } catch {
    return { count: 0, oldestAt: 0 };
  }
  const waitMs = Math.max(15, Number(waitMinutes) || 120) * 60 * 1000;
  const cutoffMs = Date.now() - waitMs;
  const rows = await Ticket.find(
    { guildId: gid, open: true },
    { _id: 1, createdAt: 1, staleAlertMessageId: 1, ticketNumber: 1 },
  )
    .limit(80)
    .lean()
    .catch(() => []);
  const list = Array.isArray(rows) ? rows : [];
  let count = 0;
  let oldestAt = 0;
  for (const t of list) {
    const flagged = Boolean(String(t?.staleAlertMessageId || "").trim());
    const createdMs = t?.createdAt ? new Date(t.createdAt).getTime() : 0;
    const oldEnough = createdMs > 0 && createdMs <= cutoffMs;
    if (!flagged && !oldEnough) continue;
    count += 1;
    if (createdMs && (!oldestAt || createdMs < oldestAt)) oldestAt = createdMs;
  }
  return { count, oldestAt };
}

function buildPremiumAlert(guild?) {
  const gid = String(guild?.id || "").trim();
  const name = String(guild?.name || "Server").trim() || "Server";
  if (!gid || guild?.isProtectedGuild) return null;
  const pub = serializePremiumPublic(getTenantPremiumSync(gid));
  if (!pub.active || pub.until == null) return null;
  const until = Number(pub.until);
  if (!Number.isFinite(until) || until <= Date.now()) return null;
  const left = until - Date.now();
  if (left > PREMIUM_WARN_MS) return null;
  const days = Math.max(1, Math.ceil(left / (24 * 60 * 60 * 1000)));
  const when = new Date(until).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  return {
    id: `live:premium:${gid}:${until}`,
    type: "premium_expiring",
    title: `Premium in scadenza · ${name}`,
    body: `Premium su «${name}» scade tra ${days} giorn${days === 1 ? "o" : "i"} (${when}). Rinnovalo per non perdere personalizzazioni.`,
    at: Math.max(until - PREMIUM_WARN_MS, until - left),
    href: "/dashboard/premium/",
    guildId: gid,
    guildName: name,
    source: "live",
  };
}

function buildBotMissingAlert(guild?) {
  const gid = String(guild?.id || "").trim();
  const name = String(guild?.name || "Server").trim() || "Server";
  if (!gid || guild?.botPresent === true) return null;
  return {
    id: `live:bot_missing:${gid}`,
    type: "bot_missing",
    title: `Bot assente · ${name}`,
    body: `Vinili non risulta in «${name}». Aprilo dalla dashboard e usa l’invito per aggiungerlo di nuovo.`,
    at: Date.now() - 60_000,
    href: guildHref(gid, "settings"),
    guildId: gid,
    guildName: name,
    source: "live",
  };
}

async function buildTicketsStaleAlert(guild?) {
  const gid = String(guild?.id || "").trim();
  const name = String(guild?.name || "Server").trim() || "Server";
  if (!gid || guild?.botPresent !== true) return null;
  const settings: any = getTicketSettingsSync(gid);
  if (!settings || settings.enabled !== true) return null;
  const minutes = Number(settings.staleAlertMinutes) || 120;
  const { count, oldestAt } = await countStaleOpenTickets(gid, minutes);
  if (!count) return null;
  return {
    id: `live:tickets_stale:${gid}:${count}`,
    type: "tickets_stale",
    title: `Ticket fermi · ${name}`,
    body:
      count === 1
        ? `C’è 1 ticket aperto su «${name}» in attesa da oltre ${minutes} minuti.`
        : `Ci sono ${count} ticket aperti su «${name}» in attesa da oltre ${minutes} minuti.`,
    at: oldestAt || Date.now() - minutes * 60_000,
    href: guildHref(gid, "tickets", "overview"),
    guildId: gid,
    guildName: name,
    source: "live",
  };
}

async function buildLiveAlertsForGuilds(guilds?) {
  const list = Array.isArray(guilds) ? guilds : [];
  await Promise.all([
    ensureTenantPremiumCacheFresh().catch(() => null),
    refreshTicketConfigCache().catch(() => null),
  ]);
  const out = [];
  for (const g of list) {
    const premium = buildPremiumAlert(g);
    if (premium) out.push(premium);
    const missing = buildBotMissingAlert(g);
    if (missing) out.push(missing);
  }
  const staleJobs = list.slice(0, 12).map((g?) => buildTicketsStaleAlert(g));
  const stale = await Promise.all(staleJobs);
  for (const row of stale) if (row) out.push(row);
  return out;
}

function applyReadState(items?, readAtMs = 0) {
  return (Array.isArray(items) ? items : []).map((row?) => ({
    ...row,
    read: Boolean(readAtMs && Number(row?.at || 0) <= readAtMs),
  }));
}

function countUnread(items?) {
  return (Array.isArray(items) ? items : []).filter((row?) => !row?.read).length;
}

export = {
  recordBotLeftAlert,
  clearBotLeftAlertsForGuild,
  listEventAlertsForGuildIds,
  getUserAlertsReadAt,
  markUserAlertsRead,
  buildLiveAlertsForGuilds,
  serializeEvent,
  applyReadState,
  countUnread,
  guildHref,
};
