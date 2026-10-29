const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { listOperationalPartnershipGuildIds } = require("../../Utils/Partner/partnershipConfigResolver") as typeof import("../../Utils/Partner/partnershipConfigResolver");
const { getPartnerLeaderboardWeekBoundsUtc } = require("../Staff/weeklyStaffResocontoService") as typeof import("../Staff/weeklyStaffResocontoService");
const { resolvePartnerPointsShown, resolvePartnerTotalEarned, resolvePartnerHistoryAttributed, getPartnerServerResetMs, countPartnerCreateActions, legacyPartnerCountFloor } = require("../../Utils/Staff/partnerPointsDisplayUtils") as typeof import("../../Utils/Staff/partnerPointsDisplayUtils");
const { listJoinLeaderboardScores, getRomeDayKey } = require("./tenantPartnershipJoinStatsService") as typeof import("./tenantPartnershipJoinStatsService");
const {
  listConfiguredPartnershipGuildIds,
  refreshPartnershipConfigCache,
} = require("../../MultiGuild/core/tenantPartnershipSettings") as typeof import("../../MultiGuild/core/tenantPartnershipSettings");

const CACHE_TTL_MS = 45_000;
const cache = new Map();

function invalidateLeaderboardCache() {
  cache.clear();
}

function normalizePeriod(raw?) {
  const p = String(raw || "").trim().toLowerCase();
  if (p === "daily" || p === "d") return "daily";
  if (p === "weekly" || p === "w" || p === "week") return "weekly";
  return "total";
}

function normalizeCategory(raw?) {
  const c = String(raw || "").trim().toLowerCase();
  if (c === "join" || c === "joins") return "join";
  if (c === "partner" || c === "partners" || c === "pm") return "partners";
  if (c === "server" || c === "servers") return "servers";
  return "servers";
}

function cacheKey(parts?) {
  return Object.entries(parts)
    .map(([k, v]) => `${k}=${String(v ?? "")}`)
    .join("|");
}

function readCache(key?) {
  const row = cache.get(key);
  if (!row) return null;
  if (Date.now() - row.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return row.value;
}

function writeCache(key?, value?) {
  cache.set(key, { at: Date.now(), value });
}

function isValidPartnerCreate(action?, period?, weekBounds?, afterMs = 0) {
  if (!action || String(action.action || "").toLowerCase() !== "create") return false;
  if (Array.isArray(action.auditPenaltyDates) && action.auditPenaltyDates.length > 0) return false;
  if (afterMs > 0) {
    const whenMs = action.date != null ? new Date(action.date).getTime() : 0;
    if (!Number.isFinite(whenMs) || whenMs < afterMs) return false;
  }
  if (period === "total") return true;
  const when = action.date != null ? new Date(action.date) : null;
  if (!when || Number.isNaN(when.getTime())) return false;
  if (period === "daily") return getRomeDayKey(when) === getRomeDayKey(new Date());
  const t = when.getTime();
  return t >= weekBounds.weekStart.getTime() && t < weekBounds.weekEndExclusive.getTime();
}

function resolvePartnerActionCreditUserId(action?, profileUserId?) {
  const managerId = String(action?.managerId || "").trim();
  if (/^\d{16,22}$/.test(managerId)) return managerId;
  const uid = String(profileUserId || "").trim();
  return /^\d{16,22}$/.test(uid) ? uid : null;
}

function scorePartnerPeriod(staff?, period?, weekBounds?) {
  const actions = Array.isArray(staff?.partnerActions) ? staff.partnerActions : [];
  const afterMs = getPartnerServerResetMs(staff);
  if (period === "total") {
        return resolvePartnerPointsShown(staff);
  }
  return actions.reduce(
    (total?, action?) => total + (isValidPartnerCreate(action, period, weekBounds, afterMs) ? 1 : 0),
    0,
  );
}

function accumulatePartnerProfileScores(scores?, profileUserId?, staff?, period?, weekBounds?) {
  const actions = Array.isArray(staff?.partnerActions) ? staff.partnerActions : [];
  const afterMs = getPartnerServerResetMs(staff);
  const hasManagerAttribution = actions.some((action?) => {
    const mid = String(action?.managerId || "").trim();
    return /^\d{16,22}$/.test(mid);
  });

  if (hasManagerAttribution) {
    for (const action of actions) {
      if (!isValidPartnerCreate(action, period, weekBounds, afterMs)) continue;
      const uid = resolvePartnerActionCreditUserId(action, profileUserId);
      if (!uid) continue;
      scores.set(uid, (scores.get(uid) || 0) + 1);
    }
    return;
  }

  const score = scorePartnerPeriod(staff, period, weekBounds);
  const uid = String(profileUserId || "").trim();
  if (score > 0 && /^\d{16,22}$/.test(uid)) {
    scores.set(uid, (scores.get(uid) || 0) + score);
  }
}

function computeUserPartnershipScoresFromRows(rows?, userId?, weekBounds?) {
  const uid = String(userId || "").trim();
  if (!/^\d{16,22}$/.test(uid)) {
    return { points: 0, total: 0, daily: 0, weekly: 0 };
  }

  const list = Array.isArray(rows) ? rows : [];
  const own = list.find((row?) => String(row.userId) === uid) || null;
  const ownStaff = own?.staff || null;

  /* Daily/weekly must match Discord classifica PM: creates on THIS user's profile.
     Do NOT reattribute to managerId — that zeroed weekly for every PM who tagged a manager
     (Fan #1: 3 creates this week → API showed weekly 0). */
  let daily = 0;
  let weekly = 0;
  const ownActions = Array.isArray(ownStaff?.partnerActions) ? ownStaff.partnerActions : [];
  const ownAfterMs = getPartnerServerResetMs(ownStaff);
  for (const action of ownActions) {
    if (isValidPartnerCreate(action, "daily", weekBounds, ownAfterMs)) daily += 1;
    if (isValidPartnerCreate(action, "weekly", weekBounds, ownAfterMs)) weekly += 1;
  }

  /* Manager-only credit (no own PM profile balance): still count creates attributed to them. */
  let totalFromActions = 0;
  for (const row of list) {
    const actions = Array.isArray(row?.staff?.partnerActions) ? row.staff.partnerActions : [];
    const afterMs = getPartnerServerResetMs(row?.staff);
    for (const action of actions) {
      const credited = resolvePartnerActionCreditUserId(action, row.userId);
      if (credited !== uid) continue;
      if (isValidPartnerCreate(action, "total", weekBounds, afterMs)) totalFromActions += 1;
    }
  }

  const ownShown = resolvePartnerPointsShown(ownStaff);
  const ownEarned = resolvePartnerTotalEarned(ownStaff);
  const ownCreates = countPartnerCreateActions(ownStaff?.partnerActions);
  const hasOwnBalance =
    ownEarned > 0 ||
    ownShown > 0 ||
    ownCreates > 0 ||
    legacyPartnerCountFloor(ownStaff) > 0;

  let points;
  let total;
  if (hasOwnBalance) {
    points = ownShown;
    total = Math.max(ownEarned, totalFromActions);
  } else if (totalFromActions > 0) {
    points = totalFromActions;
    total = totalFromActions;
  } else {
    points = 0;
    total = 0;
  }

  return { points, total, daily, weekly };
}

async function listTargetGuildIds() {
    await refreshPartnershipConfigCache().catch(() => null);
  const ids = new Set();
  for (const gid of listConfiguredPartnershipGuildIds()) ids.add(String(gid));
  for (const gid of listOperationalPartnershipGuildIds()) ids.add(String(gid));
  return Array.from(ids).filter((id?) => /^\d{16,20}$/.test((id as any)));
}

async function aggregateServerPartnershipScores(period?) {
      const guildIds = await listTargetGuildIds();
  const key = cacheKey({ kind: "servers", period, targets: guildIds.length });
  const cached = readCache(key);
  if (cached) return cached;

  if (!guildIds.length) return [];

  const weekBounds = period === "weekly" ? getPartnerLeaderboardWeekBoundsUtc(new Date()) : null;
  const rows = await ActivityUserProfile.find({ guildId: { $in: guildIds } })
    .select("guildId staff.partnerActions staff.partnerCount staff.partnerRedeemSpend staff.partnerServerResetAt")
    .lean();

  const scores = new Map();
  for (const row of rows) {
    const gid = String(row.guildId || "").trim();
    if (!gid) continue;
        const actions = Array.isArray(row?.staff?.partnerActions) ? row.staff.partnerActions : [];
    const afterMs = getPartnerServerResetMs(row?.staff);
    let score = 0;
    for (const action of actions) {
      if (isValidPartnerCreate(action, period, weekBounds, afterMs)) score += 1;
    }
    if (score <= 0) continue;
    scores.set(gid, (scores.get(gid) || 0) + score);
  }

  const out = Array.from(scores.entries())
    .map(([guildId, score]) => ({ guildId, score }))
    .sort((a?, b?) => b.score - a.score || String(a.guildId).localeCompare(String(b.guildId)));

  writeCache(key, out);
  return out;
}

async function aggregatePartnersScores(period?, targetGuildId = null) {
  const gidFilter = String(targetGuildId || "").trim();
  if (!/^\d{16,20}$/.test(gidFilter)) return [];

  const key = cacheKey({ kind: "partners", period, guild: gidFilter });
  const cached = readCache(key);
  if (cached) return cached;

  const weekBounds = getPartnerLeaderboardWeekBoundsUtc(new Date());
  const rows = await ActivityUserProfile.find({ guildId: gidFilter })
    .select("guildId userId staff.partnerActions staff.partnerCount staff.partnerRedeemSpend staff.partnerServerResetAt")
    .lean();

  let out;
  if (period === "total") {
    const uidSet = new Set();
    for (const row of Array.isArray(rows) ? rows : []) {
      const id = String(row.userId || "").trim();
      if (/^\d{16,22}$/.test(id)) uidSet.add(id);
      const actions = Array.isArray(row?.staff?.partnerActions) ? row.staff.partnerActions : [];
      for (const action of actions) {
        const mid = String(action?.managerId || "").trim();
        if (/^\d{16,22}$/.test(mid)) uidSet.add(mid);
      }
    }
    out = [];
    for (const uid of uidSet) {
      const s = computeUserPartnershipScoresFromRows(rows, uid, weekBounds);
      const score = Math.max(0, Math.floor(Number(s.total) || 0));
      if (score > 0) out.push({ userId: uid, guildId: gidFilter, score });
    }
    out.sort((a?, b?) => b.score - a.score || String(a.userId || "").localeCompare(String(b.userId || "")));
  } else {
    /* Fan#1 weeklyFix2: daily/weekly = create sul profilo esecutore, NON managerId.
       Altrimenti ogni partner con manager taggato sparisce dal conteggio PM (3→0). */
    const uidSet = new Set();
    for (const row of Array.isArray(rows) ? rows : []) {
      const id = String(row.userId || "").trim();
      if (/^\d{16,22}$/.test(id)) uidSet.add(id);
    }
    out = [];
    for (const uid of uidSet) {
      const s = computeUserPartnershipScoresFromRows(rows, uid, weekBounds);
      const score = Math.max(
        0,
        Math.floor(Number(period === "daily" ? s.daily : s.weekly) || 0),
      );
      if (score > 0) out.push({ userId: uid, guildId: gidFilter, score });
    }
    out.sort((a?, b?) => b.score - a.score || String(a.userId || "").localeCompare(String(b.userId || "")));
  }

  writeCache(key, out);
  return out;
}

async function aggregateJoinScores(period?) {
  const key = cacheKey({ kind: "join", period });
  const cached = readCache(key);
  if (cached) return cached;
  const out = await listJoinLeaderboardScores(period);
  writeCache(key, out);
  return out;
}

async function fetchLeaderboardRows(category?, period?, targetGuildId = null) {
  const cat = normalizeCategory(category);
  const per = normalizePeriod(period);
  if (cat === "join") return aggregateJoinScores(per);
  if (cat === "partners") return aggregatePartnersScores(per, targetGuildId);
  return aggregateServerPartnershipScores(per);
}

function findRankEntry(rows?, matcher?) {
  const index = rows.findIndex(matcher);
  if (index < 0) return null;
  return { rank: index + 1, row: rows[index] };
}

async function getGuildPartnershipScores(guildId?) {
  const gid = String(guildId || "").trim();
  if (!/^\d{16,20}$/.test(gid)) return { total: 0, daily: 0, weekly: 0 };

  const weekBounds = getPartnerLeaderboardWeekBoundsUtc(new Date());
  const rows = await ActivityUserProfile.find({ guildId: gid })
    .select("staff.partnerActions staff.partnerCount staff.partnerRedeemSpend staff.partnerServerResetAt")
    .lean();

  let total = 0;
  let daily = 0;
  let weekly = 0;
  for (const row of rows) {
    total += scorePartnerPeriod(row.staff, "total", weekBounds);
    daily += scorePartnerPeriod(row.staff, "daily", weekBounds);
    weekly += scorePartnerPeriod(row.staff, "weekly", weekBounds);
  }

  return { total, daily, weekly };
}

async function getUserPartnershipScores(userId?) {
  const uid = String(userId || "").trim();
  if (!/^\d{16,20}$/.test(uid)) {
    return { points: 0, earned: 0, partnerships: 0, total: 0, daily: 0, weekly: 0 };
  }

  const weekBounds = getPartnerLeaderboardWeekBoundsUtc(new Date());
  const rows = await ActivityUserProfile.find({
    userId: uid,
    $or: [
      { "staff.partnerActions.0": { $exists: true } },
      { "staff.partnerCount": { $gt: 0 } },
    ],
  })
    .select("staff.partnerActions staff.partnerCount staff.partnerRedeemSpend staff.partnerServerResetAt")
    .lean();

  let points = 0;
  let earned = 0;
  let partnerships = 0;
  let daily = 0;
  let weekly = 0;
  for (const row of rows) {
    const staff = row?.staff || null;
    const actions = Array.isArray(staff?.partnerActions) ? staff.partnerActions : [];
        const attributed = resolvePartnerHistoryAttributed(staff);
    partnerships += attributed;
    earned += attributed;
    points += resolvePartnerPointsShown(staff);
    for (const action of actions) {
      if (!isValidPartnerCreate(action, "daily", weekBounds, 0)) continue;
      daily += 1;
    }
    for (const action of actions) {
      if (!isValidPartnerCreate(action, "weekly", weekBounds, 0)) continue;
      weekly += 1;
    }
  }

  return { points, earned, partnerships, total: earned, daily, weekly };
}

async function aggregateGlobalPartnersScores(period?) {
  const per = normalizePeriod(period);
  const guildIds = await listTargetGuildIds();
  const key = cacheKey({ kind: "globalPartners", period: per, targets: guildIds.length });
  const cached = readCache(key);
  if (cached) return cached;

  if (!guildIds.length) return [];

  const weekBounds = getPartnerLeaderboardWeekBoundsUtc(new Date());
  const rows = await ActivityUserProfile.find({ guildId: { $in: guildIds } })
    .select("userId staff.partnerActions staff.partnerCount staff.partnerRedeemSpend staff.partnerServerResetAt")
    .lean();

  /* Fan#1 weeklyFix2: stesso criterio own-profile di aggregatePartnersScores */
  const uidSet = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const id = String(row.userId || "").trim();
    if (/^\d{16,22}$/.test(id)) uidSet.add(id);
    if (per === "total") {
      const actions = Array.isArray(row?.staff?.partnerActions) ? row.staff.partnerActions : [];
      for (const action of actions) {
        const mid = String(action?.managerId || "").trim();
        if (/^\d{16,22}$/.test(mid)) uidSet.add(mid);
      }
    }
  }
  const out = [];
  for (const userId of uidSet) {
    const s = computeUserPartnershipScoresFromRows(rows, userId, weekBounds);
    const score = Math.max(
      0,
      Math.floor(
        Number(per === "daily" ? s.daily : per === "weekly" ? s.weekly : s.total) || 0,
      ),
    );
    if (score > 0) out.push({ userId, score });
  }
  out.sort((a?, b?) => b.score - a.score || String(a.userId).localeCompare(String(b.userId)));

  writeCache(key, out);
  return out;
}

async function getUserPartnershipScoresForGuild(guildId?, userId?) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!/^\d{16,20}$/.test(gid) || !/^\d{16,20}$/.test(uid)) {
    return { points: 0, earned: 0, partnerships: 0, total: 0, daily: 0, weekly: 0 };
  }

  const weekBounds = getPartnerLeaderboardWeekBoundsUtc(new Date());
  const rows = await ActivityUserProfile.find({ guildId: gid })
    .select("userId staff.partnerActions staff.partnerCount staff.partnerRedeemSpend staff.partnerServerResetAt")
    .lean()
    .catch(() => []);

  return computeUserPartnershipScoresFromRows(rows, uid, weekBounds);
}

async function getUserPartnershipScoresGuildLocal(guildId?, userId?) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!/^\d{16,20}$/.test(gid) || !/^\d{16,20}$/.test(uid)) {
    return { points: 0, earned: 0, partnerships: 0, total: 0, daily: 0, weekly: 0 };
  }

  const weekBounds = getPartnerLeaderboardWeekBoundsUtc(new Date());
  const row = await ActivityUserProfile.findOne({ guildId: gid, userId: uid })
    .select("staff.partnerActions staff.partnerCount staff.partnerRedeemSpend staff.partnerServerResetAt")
    .lean()
    .catch(() => null);
  const staff = row?.staff || null;
  const actions = Array.isArray(staff?.partnerActions) ? staff.partnerActions : [];
  const afterMs = getPartnerServerResetMs(staff);
  const earned = resolvePartnerTotalEarned(staff);
  const points = resolvePartnerPointsShown(staff);
  let daily = 0;
  let weekly = 0;
  for (const action of actions) {
    if (isValidPartnerCreate(action, "daily", weekBounds, afterMs)) daily += 1;
    if (isValidPartnerCreate(action, "weekly", weekBounds, afterMs)) weekly += 1;
  }
  return { points, earned, partnerships: earned, total: earned, daily, weekly };
}

export = {
  normalizePeriod,
  normalizeCategory,
  fetchLeaderboardRows,
  findRankEntry,
  aggregateGlobalPartnersScores,
  listTargetGuildIds,
  getGuildPartnershipScores,
  getUserPartnershipScores,
  getUserPartnershipScoresForGuild,
  getUserPartnershipScoresGuildLocal,
  invalidateLeaderboardCache,
};
