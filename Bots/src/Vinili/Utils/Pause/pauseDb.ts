/** Pause: lettura e aggiornamento nel database, giorni usati. */
const mongoose = require("mongoose") as typeof import("mongoose");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { MS_PER_DAY, parseItalianDate, getPauseDaysBetween, getTodayUtc, getCurrentYearBoundsUtc, countEffectiveOverlapDays } = require("./pauseDates") as typeof import("./pauseDates");
const { HALF_DAY_WEIGHT, isHalfDayPause, halfDayScaledDays } = require("./pauseHalfDay") as typeof import("./pauseHalfDay");

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
  /* pauseHalfDay1: giorno → fasce (mattina/pomeriggio) scalate; due fasce = 1 giorno */
  const halves = new Map();

  for (const pause of pauses) {
    if (!pause) continue;
    if (isHalfDayPause(pause)) {
      const day = parseItalianDate(pause.dataRichiesta);
      if (day && halfDayScaledDays(pause, new Date(8.64e15)) > 0) {
        const slots = halves.get(day.getTime()) || new Set();
        slots.add(String(pause.halfDay));
        halves.set(day.getTime(), slots);
      }
      continue;
    }
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

  ranges.sort((a?, b?) => a[0] - b[0] || a[1] - b[1]);
  const merged = [];
  for (const [s, e] of ranges) {
    if (!merged.length || s > merged[merged.length - 1][1]) {
      merged.push([s, e]);
    } else {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e);
    }
  }
  let total = merged.reduce(
    (sum, [s, e]) => sum + countEffectiveOverlapDays(new Date(s), new Date(e), yearStart, yearEnd),
    0,
  );
  for (const [ms, slots] of halves) {
    if (merged.some(([s, e]) => ms >= s && ms <= e)) continue;
    const d = new Date(ms);
    total += countEffectiveOverlapDays(d, d, yearStart, yearEnd) * Math.min(1, slots.size * HALF_DAY_WEIGHT);
  }
  return total;
}

function computePauseScaledDaysThisYear(pause?, todayUtc?, yearStart?, yearEnd?) {
  const start = parseItalianDate(pause?.dataRichiesta);
  const plannedEnd = parseItalianDate(pause?.dataRitorno);
  if (!start || !plannedEnd) return 0;
  if (isHalfDayPause(pause)) {
    return halfDayScaledDays(pause, todayUtc, countEffectiveOverlapDays(start, start, yearStart, yearEnd));
  }

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
  if (isHalfDayPause(pause)) return HALF_DAY_WEIGHT;
  if (todayUtc > end) return totalScheduledDays;
  return Math.max(1, Math.floor(((todayUtc as any) - (start as any)) / MS_PER_DAY) + 1);
}

export = { updatePauseInDb, computeConsumedPauseDays, computePauseScaledDaysThisYear, computeConsumedDaysForCancelledPause };
