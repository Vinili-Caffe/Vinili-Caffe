const { getBotState, setBotState } = require("../../Utils/BotState/botStateStore");
const { isMongoReady } = require("../../Utils/Database/mongoConnect");
const { getPartnerLeaderboardWeekBoundsUtc } = require("../Staff/weeklyStaffResocontoService");

const BOT_STATE_KEY = "tenantPartnershipJoinStats.v1";
const TIME_ZONE = "Europe/Rome";

function normalizeGuildId(guildId) {
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

async function recordPartnershipInviteJoin(guildId) {
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

function scoreRowForPeriod(row, period) {
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
  out.sort((a, b) => b.score - a.score || String(a.guildId).localeCompare(String(b.guildId)));
  return out;
}

module.exports = {
  recordPartnershipInviteJoin,
  listJoinLeaderboardScores,
  getRomeDayKey,
  getCurrentWeekKey,
};
