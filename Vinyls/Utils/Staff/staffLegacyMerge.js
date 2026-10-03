const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");

function num(v) {
  return Math.max(0, Math.floor(Number(v) || 0));
}

function arr(v) {
  return Array.isArray(v) ? v : [];
}

function legacyStaffDocToEmbedded(legacy) {
  if (!legacy || typeof legacy !== "object") return null;
  return {
    rolesHistory: arr(legacy.rolesHistory),
    idCount: num(legacy.idCount),
    warnCount: num(legacy.warnCount),
    warnReasons: arr(legacy.warnReasons),
    firstWarnStaffAt: legacy.firstWarnStaffAt || null,
    positiveCount: num(legacy.positiveCount),
    negativeCount: num(legacy.negativeCount),
    positiveReasons: arr(legacy.positiveReasons),
    negativeReasons: arr(legacy.negativeReasons),
    positiveValutazioni: arr(legacy.positiveValutazioni),
    negativeValutazioni: arr(legacy.negativeValutazioni),
    valutazioniCount: num(legacy.valutazioniCount),
    autoValutazioni: arr(legacy.autoValutazioni),
    webTicketRatingSum: num(legacy.webTicketRatingSum),
    webTicketRatingCount: num(legacy.webTicketRatingCount),
    partnerCount: legacy.partnerCount,
    partnerRedeemSpend: num(legacy.partnerRedeemSpend),
    partnerServerResetAt: legacy.partnerServerResetAt || null,
    managerId: legacy.managerId,
    partnerActions: arr(legacy.partnerActions),
    partnerMilestoneDmSent: arr(legacy.partnerMilestoneDmSent),
    partnerManagerCustomPerksUntil: legacy.partnerManagerCustomPerksUntil || null,
    partnerManagerVipUntil: legacy.partnerManagerVipUntil || null,
    bestStaffPauseBonusYears: arr(legacy.bestStaffPauseBonusYears),
    bestStaffWeekPauseBonusWeeks: arr(legacy.bestStaffWeekPauseBonusWeeks),
    valPosTradedPauseBonusDays: num(legacy.valPosTradedPauseBonusDays),
    pauses: arr(legacy.pauses),
    serataFilmAttendanceSaturdayKey: legacy.serataFilmAttendanceSaturdayKey || null,
    serataFilmWillAttend: legacy.serataFilmWillAttend ?? null,
  };
}

function staffHasTrackData(staff) {
  if (!staff || typeof staff !== "object") return false;
  return (
    num(staff.positiveCount) > 0 ||
    num(staff.negativeCount) > 0 ||
    num(staff.warnCount) > 0 ||
    arr(staff.pauses).length > 0 ||
    arr(staff.positiveReasons).length > 0 ||
    arr(staff.negativeReasons).length > 0 ||
    arr(staff.rolesHistory).length > 0
  );
}

function staffHasPartnerData(staff) {
  if (!staff || typeof staff !== "object") return false;
  return (
    num(staff.partnerCount) > 0 ||
    num(staff.partnerRedeemSpend) > 0 ||
    arr(staff.partnerActions).length > 0 ||
    Boolean(String(staff.managerId || "").trim())
  );
}

function staffHasMergeableData(staff) {
  return staffHasTrackData(staff) || staffHasPartnerData(staff);
}

function mergeStaffEmbedded(primary, fallback) {
  const out = { ...(fallback || {}), ...(primary || {}) };
  const countFields = ["positiveCount", "negativeCount", "warnCount", "valutazioniCount", "idCount"];
  for (const key of countFields) {
    const a = num(primary?.[key]);
    const b = num(fallback?.[key]);
    out[key] = Math.max(a, b);
  }
  const listFields = [
    "positiveReasons",
    "negativeReasons",
    "warnReasons",
    "positiveValutazioni",
    "negativeValutazioni",
    "autoValutazioni",
    "rolesHistory",
    "pauses",
    "partnerActions",
    "bestStaffPauseBonusYears",
    "bestStaffWeekPauseBonusWeeks",
    "partnerMilestoneDmSent",
  ];
  for (const key of listFields) {
    const a = arr(primary?.[key]);
    const b = arr(fallback?.[key]);
        if (key === "rolesHistory" && primary && Object.prototype.hasOwnProperty.call(primary, "rolesHistory")) {
      out[key] = a;
      continue;
    }
    out[key] = a.length >= b.length ? a : b;
  }
  if (!out.firstWarnStaffAt && fallback?.firstWarnStaffAt) out.firstWarnStaffAt = fallback.firstWarnStaffAt;
  if (out.partnerCount == null && fallback?.partnerCount != null) out.partnerCount = fallback.partnerCount;
  else if (fallback?.partnerCount != null) out.partnerCount = Math.max(num(out.partnerCount), num(fallback.partnerCount));
  if (num(fallback?.partnerRedeemSpend) > num(out.partnerRedeemSpend)) {
    out.partnerRedeemSpend = num(fallback.partnerRedeemSpend);
  }
  if (!out.managerId && fallback?.managerId) out.managerId = fallback.managerId;
  return out;
}

async function loadLegacyStaffByUserIds(guildId, userIds) {
  const gid = String(guildId || "").trim();
  const ids = [...new Set((userIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
  const map = new Map();
  if (!gid || !ids.length) return map;
  try {
    const mongoose = require("mongoose");
    const rows = await mongoose.connection.db
      .collection("staffs")
      .find({ guildId: gid, userId: { $in: ids } })
      .toArray();
    for (const row of rows || []) {
      const uid = String(row?.userId || "").trim();
      if (!uid) continue;
      map.set(uid, legacyStaffDocToEmbedded(row));
    }
  } catch (_) {
      }
  return map;
}

async function loadStaffTrackStatsByUserIds(guildId, userIds) {
  const gid = String(guildId || "").trim();
  const ids = [...new Set((userIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
  const out = new Map();
  if (!gid || !ids.length) return out;

  const [docs, legacyMap] = await Promise.all([
    ActivityUserProfile.find(
      { guildId: gid, userId: { $in: ids } },
      {
        userId: 1,
        "staff.positiveCount": 1,
        "staff.negativeCount": 1,
        "staff.warnCount": 1,
        "staff.pauses": 1,
        "staff.positiveReasons": 1,
        "staff.negativeReasons": 1,
        "staff.rolesHistory": 1,
      },
    )
      .lean()
      .catch(() => []),
    loadLegacyStaffByUserIds(gid, ids),
  ]);

  for (const uid of ids) {
    const embedded = docs.find((d) => String(d.userId) === uid)?.staff || {};
    const legacy = legacyMap.get(uid) || null;
    const merged = legacy ? mergeStaffEmbedded(embedded, legacy) : embedded;
    out.set(uid, {
      positive: num(merged.positiveCount),
      negative: num(merged.negativeCount),
      warn: num(merged.warnCount),
      pauses: arr(merged.pauses),
    });
  }
  return out;
}

module.exports = {
  legacyStaffDocToEmbedded,
  staffHasTrackData,
  staffHasPartnerData,
  staffHasMergeableData,
  mergeStaffEmbedded,
  loadLegacyStaffByUserIds,
  loadStaffTrackStatsByUserIds,
};
