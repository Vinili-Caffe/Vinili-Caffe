/** Pause: lettura e aggiornamento nel database, giorni usati. */
const mongoose = require("mongoose") as typeof import("mongoose");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { MS_PER_DAY, parseItalianDate, getPauseDaysBetween, getTodayUtc, getCurrentYearBoundsUtc, countEffectiveOverlapDays } = require("./pauseDates") as typeof import("./pauseDates");

async function getStaffAndPauseByRequestMessageId(guildId?, messageId?) {
  const g = String(guildId ?? "").trim();
  const msgId = String(messageId ?? "").trim();
  if (!g || !msgId) return null;
  const doc = await ActivityUserProfile.findOne({
    guildId: g,
    $or: [{ "staff.pauses.requestMessageId": msgId }, { "staff.pauses.requestMessageIdPm": msgId }],
  });
  if (!doc || !Array.isArray(doc.staff?.pauses)) return null;
  const pause = doc.staff.pauses.find(
    (p?) => String(p?.requestMessageId) === msgId || String(p?.requestMessageIdPm) === msgId,
  );
  return pause ? { stafferRecord: doc, pause } : null;
}

function normalizePauseIdForQuery(pauseId?) {
  if (!pauseId) return null;
  const str = String(pauseId).trim();
  if (!str) return null;
  if (mongoose.Types.ObjectId.isValid(str) && String(new mongoose.Types.ObjectId(str)) === str) {
    return new mongoose.Types.ObjectId(str);
  }
  return str;
}

async function updatePauseInDb(guildId?, userId?, pauseId?, setFields?) {
  const g = String(guildId ?? "").trim();
  const u = String(userId ?? "").trim();
  if (!g || !u || !pauseId || !setFields || typeof setFields !== "object") return { ok: false };
  const updates: Record<string, any> = {};
  for (const [key, value] of Object.entries(setFields)) {
    if (key && value !== undefined) updates[`staff.pauses.$.${key}`] = value;
  }
  if (Object.keys(updates).length === 0) return { ok: true };
  const pauseIdQuery = normalizePauseIdForQuery(pauseId);
  if (!pauseIdQuery) return { ok: false };
  const result = await ActivityUserProfile.updateOne(
    { guildId: g, userId: u, "staff.pauses._id": pauseIdQuery },
    { $set: updates },
  ).catch(() => null);
  return { ok: Boolean(result?.modifiedCount === 1 || result?.matchedCount === 1) };
}

function computeConsumedPauseDays(pauses?) {
  if (!Array.isArray(pauses)) return 0;
  const { yearStart, yearEnd } = getCurrentYearBoundsUtc();
  /* pauseBothSplit1: stessi giorni su Staff+PM non devono contare due volte */
  const ranges = [];

  for (const pause of pauses) {
    if (!pause) continue;
    const start = parseItalianDate(pause.dataRichiesta);
    const plannedEnd = parseItalianDate(pause.dataRitorno);

    if (pause.status === "accepted") {
      if (start && plannedEnd) ranges.push([start.getTime(), plannedEnd.getTime()]);
      continue;
    }

    if (pause.status === "cancelled") {
      let effectiveEnd = null;
      if (pause.cancelledAt) {
        const c = new Date(pause.cancelledAt);
        effectiveEnd = new Date(
          Date.UTC(c.getUTCFullYear(), c.getUTCMonth(), c.getUTCDate()),
        );
      } else if (start) {
        const consumed = Number(pause.giorniUsati);
        if (Number.isFinite(consumed) && consumed > 0) {
          effectiveEnd = new Date(start.getTime() + (consumed - 1) * MS_PER_DAY);
        }
      }
      if (plannedEnd && effectiveEnd && effectiveEnd > plannedEnd) effectiveEnd = plannedEnd;
      if (start && effectiveEnd) ranges.push([start.getTime(), effectiveEnd.getTime()]);
    }
  }

  if (!ranges.length) return 0;
  ranges.sort((a?, b?) => a[0] - b[0] || a[1] - b[1]);
  const merged = [];
  for (const [s, e] of ranges) {
    if (!merged.length || s > merged[merged.length - 1][1]) {
      merged.push([s, e]);
    } else {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e);
    }
  }
  return merged.reduce(
    (total, [s, e]) => total + countEffectiveOverlapDays(new Date(s), new Date(e), yearStart, yearEnd),
    0,
  );
}

function computePauseScaledDaysThisYear(pause?, todayUtc?, yearStart?, yearEnd?) {
  const start = parseItalianDate(pause?.dataRichiesta);
  const plannedEnd = parseItalianDate(pause?.dataRitorno);
  if (!start || !plannedEnd) return 0;

  if (pause.status === "cancelled") {
    let effectiveEnd = null;
    if (pause.cancelledAt) {
      const c = new Date(pause.cancelledAt);
      effectiveEnd = new Date(
        Date.UTC(c.getUTCFullYear(), c.getUTCMonth(), c.getUTCDate()),
      );
    } else {
      const consumed = Number(pause.giorniUsati);
      if (Number.isFinite(consumed) && consumed > 0) {
        effectiveEnd = new Date(start.getTime() + (consumed - 1) * MS_PER_DAY);
      }
    }
    if (plannedEnd && effectiveEnd && effectiveEnd > plannedEnd)
      effectiveEnd = plannedEnd;
    return countEffectiveOverlapDays(start, effectiveEnd, yearStart, yearEnd);
  }

  if (pause.status === "accepted") {
    if (todayUtc < start) return 0;
    const effectiveEnd = todayUtc > plannedEnd ? plannedEnd : todayUtc;
    return countEffectiveOverlapDays(start, effectiveEnd, yearStart, yearEnd);
  }

  return 0;
}

function computeConsumedDaysForCancelledPause(pause?) {
  const todayUtc = getTodayUtc();
  const start = parseItalianDate(pause?.dataRichiesta);
  const end = parseItalianDate(pause?.dataRitorno);
  const totalScheduledDays = getPauseDaysBetween(pause?.dataRichiesta, pause?.dataRitorno) || 0;
  if (!start || !end) return 0;
  if (todayUtc < start) return 0;
  if (todayUtc > end) return totalScheduledDays;
  return Math.max(1, Math.floor(((todayUtc as any) - (start as any)) / MS_PER_DAY) + 1);
}

export = { getStaffAndPauseByRequestMessageId, updatePauseInDb, computeConsumedPauseDays, computePauseScaledDaysThisYear, computeConsumedDaysForCancelledPause };
