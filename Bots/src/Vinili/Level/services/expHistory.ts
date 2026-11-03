/** EXP: storico dei livelli e classifiche del periodo. */
const { ActivityUserProfile } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const { TIME_ZONE } = require("./expLevels") as typeof import("./expLevels");

const DAY_MS = 24 * 60 * 60 * 1000;

async function getTopExpGainsInPeriod(guildId?, lookbackDays?, limit = 100) {
  const safeGuildId = String(guildId || "").trim();
  if (!safeGuildId) return [];
  const safeLookback = Number(lookbackDays);
  if (!Number.isFinite(safeLookback) || safeLookback < 1) return [];
  const since = new Date(Date.now() - safeLookback * DAY_MS);
  const safeLimit = Math.max(1, Math.min(500, Number(limit || 100)));
  const agg = await ActivityUserProfile.aggregate([
    { $match: { guildId: safeGuildId } },
    { $unwind: "$profile.totals.exp.levelHistory" },
    { $match: { "profile.totals.exp.levelHistory.createdAt": { $gte: since }, "profile.totals.exp.levelHistory.deltaExp": { $gt: 0 } } },
    { $group: { _id: "$userId", expGain: { $sum: "$profile.totals.exp.levelHistory.deltaExp" } } },
    { $sort: { expGain: -1 } },
    { $limit: safeLimit },
  ]).catch(() => []);
  return agg.map((x?) => ({ userId: String(x._id || ""), expGain: Math.max(0, Math.floor(Number(x.expGain || 0))) }));
}

function getRomeOffsetMsForExp(utcDate?) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    timeZoneName: "shortOffset",
    hour: "2-digit",
  });
  const zoneName = formatter.formatToParts(utcDate).find((part?) => part.type === "timeZoneName")?.value;
  const match = String(zoneName || "GMT+0").match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/i);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return sign * (hours * 60 + minutes) * 60 * 1000;
}

function createUtcFromRomeLocalForExp(year?, month?, day?, hour?, minute?, second?) {
  const baseUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const firstOffsetMs = getRomeOffsetMsForExp(new Date(baseUtcMs));
  let utcMs = baseUtcMs - firstOffsetMs;
  const secondOffsetMs = getRomeOffsetMsForExp(new Date(utcMs));
  if (secondOffsetMs !== firstOffsetMs) utcMs = baseUtcMs - secondOffsetMs;
  return new Date(utcMs);
}

function getRomeDayUtcBoundsFromContestDayKey(dayKey?) {
  const m = String(dayKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  const start = createUtcFromRomeLocalForExp(y, mo, d, 0, 0, 0);
  const end = createUtcFromRomeLocalForExp(y, mo, d + 1, 0, 0, 0);
  return { start, end };
}

function getRomeActivityWindowUntil21UtcBounds(dayKey?) {
  const m = String(dayKey || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  const start = createUtcFromRomeLocalForExp(y, mo, d, 0, 0, 0);
  const end = createUtcFromRomeLocalForExp(y, mo, d, 21, 0, 0);
  return { start, end };
}

function levelHistoryEntryTimeMs(entry?) {
  const raw = entry?.createdAt;
  if (raw == null) return NaN;
  const t = raw instanceof Date ? raw.getTime() : new Date(raw).getTime();
  return Number.isFinite(t) ? t : NaN;
}

async function sumExpDeltaFromLevelHistoryForRomeDay(guildId?, dayKey?, userIds?, options: Record<string, any> = {}) {
  const safeGuildId = String(guildId || "").trim();
  const bounds = options?.until21
    ? getRomeActivityWindowUntil21UtcBounds(dayKey)
    : getRomeDayUtcBoundsFromContestDayKey(dayKey);
  const ids = [...new Set((Array.isArray(userIds) ? userIds : []).map((id?) => String(id || "").trim()).filter(Boolean))];
  const out = new Map();
  for (const id of ids) out.set(id, 0);
  if (!safeGuildId || !bounds || !ids.length) return out;
  const startMs = bounds.start.getTime();
  const endMs = bounds.end.getTime();
  const docs = await ActivityUserProfile.find({ guildId: safeGuildId, userId: { $in: ids } })
    .select("userId profile.totals.exp.levelHistory")
    .lean()
    .catch(() => []);
  for (const doc of docs || []) {
    const uid = String(doc?.userId || "");
    if (!uid) continue;
    const hist = doc?.profile?.totals?.exp?.levelHistory;
    if (!Array.isArray(hist) || !hist.length) continue;
    let sum = 0;
    for (const e of hist) {
      const t = levelHistoryEntryTimeMs(e);
      if (!Number.isFinite(t) || t < startMs || t >= endMs) continue;
      sum += Math.floor(Number(e?.deltaExp || 0));
    }
    out.set(uid, sum);
  }
  return out;
}

export = { getTopExpGainsInPeriod, sumExpDeltaFromLevelHistoryForRomeDay };
