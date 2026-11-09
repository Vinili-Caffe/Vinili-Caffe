const { getBotState, setBotState } = require("../../../shared/botState/botStateStore") as typeof import("../../../shared/botState/botStateStore");
const { isMongoReady } = require("../../../shared/db/mongoConnect") as typeof import("../../../shared/db/mongoConnect");
const { getPartnerLeaderboardWeekBoundsUtc } = require("../../Staff/services/weeklyStaffResocontoService") as typeof import("../../Staff/services/weeklyStaffResocontoService");

const BOT_STATE_KEY = "tenantPartnershipJoinStats.v1";
const TIME_ZONE = "Europe/Rome";
const SYNC_CONCURRENCY = 6;

function normalizeGuildId(guildId?) {
  const id = String(guildId || "").trim();
  return /^\d{16,20}$/.test(id) ? id : null;
}

function getRomeDayKey(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

function getCurrentWeekKey(date = new Date()) {
  const bounds = getPartnerLeaderboardWeekBoundsUtc(date);
  return String(bounds.weekStart.getTime());
}

async function loadStatsMap() {
  if (!isMongoReady()) return {};
  const raw = await getBotState(BOT_STATE_KEY, null);
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

async function recordPartnershipInviteJoin(guildId?) {
  const gid = normalizeGuildId(guildId);
  if (!gid || !isMongoReady()) return { ok: false };

  const dayKey = getRomeDayKey();
  const weekKey = getCurrentWeekKey();
  const map = await loadStatsMap();
  const prev = map[gid] && typeof map[gid] === "object" ? map[gid] : { total: 0, daily: {}, weekly: {} };

  const daily = { ...(prev.daily || {}) };
  const weekly = { ...(prev.weekly || {}) };
  daily[dayKey] = Math.max(0, Number(daily[dayKey] || 0)) + 1;
  weekly[weekKey] = Math.max(0, Number(weekly[weekKey] || 0)) + 1;

  map[gid] = {
    total: Math.max(0, Number(prev.total || 0)) + 1,
    daily,
    weekly,
    updatedAt: Date.now(),
  };

  const saved = await setBotState(BOT_STATE_KEY, map);
  return { ok: Boolean(saved) };
}

/**
 * Allinea il totale agli `uses` Discord dell'invito partnership.
 * Se l'invito è stato ricreato (uses → 0) non abbassa il totale già salvato.
 * Delta=1 aggiorna anche daily/weekly; delta>1 = solo backfill del totale.
 */
async function syncPartnershipInviteUses(guildId?, currentUses?) {
  const gid = normalizeGuildId(guildId);
  if (!gid || !isMongoReady()) return { ok: false, synced: false };

  const uses = Math.max(0, Math.floor(Number(currentUses) || 0));
  const map = await loadStatsMap();
  const prev = map[gid] && typeof map[gid] === "object" ? map[gid] : { total: 0, daily: {}, weekly: {} };
  const prevTotal = Math.max(0, Number(prev.total || 0));
  if (uses <= prevTotal) return { ok: true, synced: false, total: prevTotal };

  const delta = uses - prevTotal;
  const daily = { ...(prev.daily || {}) };
  const weekly = { ...(prev.weekly || {}) };
  if (delta === 1) {
    const dayKey = getRomeDayKey();
    const weekKey = getCurrentWeekKey();
    daily[dayKey] = Math.max(0, Number(daily[dayKey] || 0)) + 1;
    weekly[weekKey] = Math.max(0, Number(weekly[weekKey] || 0)) + 1;
  }

  map[gid] = {
    total: uses,
    daily,
    weekly,
    updatedAt: Date.now(),
  };

  const saved = await setBotState(BOT_STATE_KEY, map);
  return { ok: Boolean(saved), synced: Boolean(saved), total: uses, delta };
}

async function syncPartnershipJoinTotalForGuild(guild?) {
  const gid = normalizeGuildId(guild?.id);
  if (!gid || !guild?.invites?.fetch) return { ok: false, synced: false };

  const {
    getPartnershipConfigSync,
  } = require("../core/tenantPartnershipSettings") as typeof import("../core/tenantPartnershipSettings");
  const code = String(getPartnershipConfigSync(gid)?.invite?.code || "").trim();
  if (!code) return { ok: false, synced: false, reason: "no_invite" };

  const invites = await guild.invites.fetch().catch(() => null);
  if (!invites) return { ok: false, synced: false, reason: "fetch_failed" };

  const inv =
    (typeof invites.get === "function" ? invites.get(code) : null) ||
    [...(typeof invites.values === "function" ? invites.values() : [])].find(
      (row?) => String(row?.code || "") === code,
    ) ||
    null;
  if (!inv || typeof inv.uses !== "number") return { ok: false, synced: false, reason: "invite_missing" };

  return syncPartnershipInviteUses(gid, inv.uses);
}

async function syncPartnershipJoinTotalsFromClient(client?) {
  if (!client?.guilds?.cache || !isMongoReady()) return { ok: false, updated: 0 };

  const {
    listConfiguredPartnershipGuildIds,
    getPartnershipConfigSync,
    refreshPartnershipConfigCache,
  } = require("../core/tenantPartnershipSettings") as typeof import("../core/tenantPartnershipSettings");

  await refreshPartnershipConfigCache().catch(() => null);
  const ids = (listConfiguredPartnershipGuildIds() || [])
    .map((id?) => normalizeGuildId(id))
    .filter(Boolean);
  if (!ids.length) return { ok: true, updated: 0 };

  let updated = 0;
  for (let i = 0; i < ids.length; i += SYNC_CONCURRENCY) {
    const chunk = ids.slice(i, i + SYNC_CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (gid?) => {
        const guild = client.guilds.cache.get(gid);
        if (!guild) return false;
        const code = String(getPartnershipConfigSync(gid)?.invite?.code || "").trim();
        if (!code) return false;
        const out = await syncPartnershipJoinTotalForGuild(guild).catch(() => null);
        return Boolean(out?.synced);
      }),
    );
    updated += results.filter(Boolean).length;
  }

  return { ok: true, updated };
}

function scoreRowForPeriod(row?, period?) {
  if (!row || typeof row !== "object") return 0;
  if (period === "daily") {
    return Math.max(0, Number(row.daily?.[getRomeDayKey()] || 0));
  }
  if (period === "weekly") {
    return Math.max(0, Number(row.weekly?.[getCurrentWeekKey()] || 0));
  }
  return Math.max(0, Number(row.total || 0));
}

async function listJoinLeaderboardScores(period = "total") {
  const map = await loadStatsMap();
  const out = [];
  for (const [guildId, row] of Object.entries(map)) {
    const score = scoreRowForPeriod(row, period);
    if (score > 0) out.push({ guildId, score });
  }
  out.sort((a?, b?) => b.score - a.score || String(a.guildId).localeCompare(String(b.guildId)));
  return out;
}

export = {
  recordPartnershipInviteJoin,
  syncPartnershipInviteUses,
  syncPartnershipJoinTotalForGuild,
  syncPartnershipJoinTotalsFromClient,
  listJoinLeaderboardScores,
  getRomeDayKey,
};
