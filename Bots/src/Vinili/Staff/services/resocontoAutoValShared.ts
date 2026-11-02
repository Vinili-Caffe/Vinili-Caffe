/** Resoconti settimanali: skip auto-val, ciclo settimana e lookup log. */
const { getRomeDateParts, createUtcFromRomeLocal, parseRomeWallClock, getResocontoClosingSundayUtc } = require("./resocontoTime") as typeof import("./resocontoTime");
const { hasStaffLimitsValutazioneForCycle, hasStaffSanctionsValutazioneForCycle } = require("./resocontoGrades") as typeof import("./resocontoGrades");

const STAFF_LIMITS_POSITIVE_MULTIPLIER = 2;

function shouldSkipLimitAutovalutazioniForStaffMember({
  graceNewStaffRole = false,
  wasPexedResocontoDay = false,
} = {}) {
  /* resoNewStaffGrace2: auto-val limiti solo skip per Member→staff (nuovo), non helper→mod */
  return Boolean(graceNewStaffRole || wasPexedResocontoDay);
}

function shouldSkipSanctionAutovalutazioniForStaffMember({
  graceNewStaffRole = false,
  wasPexedResocontoDay = false,
} = {}) {
  /* resoNewStaffGrace2: niente auto-val sanzioni ai nuovi in staff (Member→staff) */
  return Boolean(graceNewStaffRole || wasPexedResocontoDay);
}

function staffHasPositiveValutazioneNeedle(staffDoc?, needles?) {
  const list = Array.isArray(staffDoc?.positiveReasons) ? staffDoc.positiveReasons : [];
  const normalizedNeedles = (Array.isArray(needles) ? needles : [])
    .map((needle?) => String(needle || "").toLowerCase())
    .filter(Boolean);
  if (!normalizedNeedles.length) return false;
  return list.some((entry?) => {
    const normalized = String(entry || "").toLowerCase();
    return normalizedNeedles.some((needle?) => normalized.includes(needle));
  });
}

function staffHasNegativeValutazioneNeedle(staffDoc?, needles?) {
  const list = Array.isArray(staffDoc?.negativeReasons) ? staffDoc.negativeReasons : [];
  const normalizedNeedles = (Array.isArray(needles) ? needles : [])
    .map((needle?) => String(needle || "").toLowerCase())
    .filter(Boolean);
  if (!normalizedNeedles.length) return false;
  return list.some((entry?) => {
    const normalized = String(entry || "").toLowerCase();
    return normalizedNeedles.some((needle?) => normalized.includes(needle));
  });
}

function findLogForReasonNeedlesSince(
  staff?,
  needles?,
  type = "positive",
  sinceDate = null,
  { unlinkedOnly = false } = {},
) {
  const normalizedNeedles = (Array.isArray(needles) ? needles : [])
    .map((needle?) => String(needle || "").toLowerCase())
    .filter(Boolean);
  if (!normalizedNeedles.length) return null;
  const reasons =
    type === "negative"
      ? Array.isArray(staff?.negativeReasons)
        ? staff.negativeReasons
        : []
      : Array.isArray(staff?.positiveReasons)
        ? staff.positiveReasons
        : [];
  const logs =
    type === "negative"
      ? Array.isArray(staff?.negativeValutazioni)
        ? staff.negativeValutazioni
        : []
      : Array.isArray(staff?.positiveValutazioni)
        ? staff.positiveValutazioni
        : [];
  const autoEntries = Array.isArray(staff?.autoValutazioni) ? staff.autoValutazioni : [];
  const linkedMessageIds = new Set(
    autoEntries
      .filter((entry?) => String(entry?.messageId || ""))
      .map((entry?) => String(entry.messageId)),
  );
  const sinceMs = sinceDate ? new Date(sinceDate).getTime() : 0;
  for (let idx = reasons.length - 1; idx >= 0; idx -= 1) {
    const normalized = String(reasons[idx] || "").toLowerCase();
    if (!normalizedNeedles.some((needle?) => normalized.includes(needle))) continue;
    const log = logs[idx];
    if (!log?.messageId || !log?.channelId) continue;
    if (unlinkedOnly && linkedMessageIds.has(String(log.messageId))) continue;
    if (sinceMs) {
      const createdMs = log?.createdAt ? new Date(log.createdAt).getTime() : 0;
      if (!createdMs || createdMs < sinceMs) continue;
    }
    return { log, reason: String(reasons[idx] || "") };
  }
  return null;
}

function shouldSkipManualResocontoVp(staffDoc?, resocontoWeekKey?, staffRoleId?, reason?) {
  const reasonNorm = String(reason || "").toLowerCase();
  const since = getResocontoCycleMessagesSince();
  if (reasonNorm.includes("limiti settimanali")) {
    if (/completati|rispettati/.test(reasonNorm) && !/doppio|triplo|×\s*2|x2/.test(reasonNorm)) {
      /* Mai VP automatica/manuale solo per 1×. */
      return true;
    }
    if (hasStaffLimitsValutazioneForCycle(staffDoc, resocontoWeekKey, staffRoleId)) return true;
    return Boolean(
      findLogForReasonNeedlesSince(
        staffDoc,
        ["limiti settimanali superati almeno del doppio"],
        "positive",
        since,
      ),
    );
  }
  if (reasonNorm.includes("compito sanzioni")) {
    if (hasStaffSanctionsValutazioneForCycle(staffDoc, resocontoWeekKey, staffRoleId)) return true;
    return Boolean(
      findLogForReasonNeedlesSince(staffDoc, ["compito sanzioni completato"], "positive", since),
    );
  }
  if (reasonNorm.includes("griglia")) {
    if (
      staffHasPositiveValutazioneNeedle(staffDoc, [
        "griglia attività/condotta",
        "valutazione positiva da griglia",
      ])
    ) {
      return true;
    }
    return Boolean(
      findLogForReasonNeedlesSince(
        staffDoc,
        ["griglia attività/condotta", "valutazione positiva da griglia"],
        "positive",
        since,
      ),
    );
  }
  return false;
}

function shouldSkipManualResocontoVn(staffDoc?, resocontoWeekKey?, staffRoleId?, reason?) {
  const reasonNorm = String(reason || "").toLowerCase();
  const since = getResocontoCycleMessagesSince();
  if (reasonNorm.includes("limiti settimanali")) {
    if (hasStaffLimitsValutazioneForCycle(staffDoc, resocontoWeekKey, staffRoleId)) return true;
    return Boolean(
      findLogForReasonNeedlesSince(
        staffDoc,
        ["limiti settimanali non raggiunti", "limiti settimanali non rispettati"],
        "negative",
        since,
      ),
    );
  }
  if (reasonNorm.includes("griglia")) {
    if (
      staffHasNegativeValutazioneNeedle(staffDoc, [
        "griglia attività/condotta",
        "valutazione negativa da griglia",
      ])
    ) {
      return true;
    }
    return Boolean(
      findLogForReasonNeedlesSince(
        staffDoc,
        ["griglia attività/condotta", "valutazione negativa da griglia"],
        "negative",
        since,
      ),
    );
  }
  return false;
}

function getResocontoCycleWeekKey(now = new Date()) {
            const r = parseRomeWallClock(now);
  if (r.weekday === "Sun") {
    return `${r.year}-${String(r.month).padStart(2, "0")}-${String(r.day).padStart(2, "0")}`;
  }
  const closingSunday = getResocontoClosingSundayUtc(now);
  const closingParts = getRomeDateParts(closingSunday);
  return `${closingParts.year}-${String(closingParts.month).padStart(2, "0")}-${String(closingParts.day).padStart(2, "0")}`;
}

function getResocontoCycleMessagesSince(now = new Date()) {
  const r = parseRomeWallClock(now);
  const wdMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const w = wdMap[r.weekday];

    if (w === 0) {
    return createUtcFromRomeLocal(r.year, r.month, r.day, 0, 0, 0);
  }

  const closingSunday = getResocontoClosingSundayUtc(now);
  const sunParts = getRomeDateParts(closingSunday);
  return createUtcFromRomeLocal(sunParts.year, sunParts.month, sunParts.day, 0, 0, 0);
}

export = {
  STAFF_LIMITS_POSITIVE_MULTIPLIER,
  shouldSkipLimitAutovalutazioniForStaffMember,
  shouldSkipSanctionAutovalutazioniForStaffMember,
  shouldSkipManualResocontoVp,
  shouldSkipManualResocontoVn,
  findLogForReasonNeedlesSince,
  getResocontoCycleWeekKey,
  getResocontoCycleMessagesSince,
};
