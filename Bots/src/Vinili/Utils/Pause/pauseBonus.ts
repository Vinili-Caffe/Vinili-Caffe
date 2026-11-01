/** Pause: giorni bonus (miglior staffer, scambi). */
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { isValidGuildUserId } = require("../DB/validateWriteIds") as typeof import("../DB/validateWriteIds");
const { getTodayUtc, getStaffWeekKeyNow } = require("./pauseDates") as typeof import("./pauseDates");
const { getBasePauseLimit } = require("./pauseRoles") as typeof import("./pauseRoles");
const { getBestStaffPauseBonusDays, getValPosTradedPauseBonusDays, resolveStafferBonusMonthKey, listBestStaffWeekPauseGrants, computeWeekBonusDaysConsumed, getBestStaffWeekPauseBonusDaysRemaining } = require("./pauseMessages") as typeof import("./pauseMessages");
const { computeConsumedPauseDays } = require("./pauseDb") as typeof import("./pauseDb");

async function grantBestStaffPauseBonusYear(guildId?, userId?, year = null) {
  const g = String(guildId ?? "").trim();
  const u = String(userId ?? "").trim();
  if (!isValidGuildUserId(g, u)) return;
  const y = year == null ? getTodayUtc().getUTCFullYear() : Number(year);
  if (!Number.isFinite(y)) return;
  await ActivityUserProfile.findOneAndUpdate(
    { guildId: g, userId: u },
    { $setOnInsert: { guildId: g, userId: u }, $addToSet: { "staff.bestStaffPauseBonusYears": y } },
    { upsert: true, setDefaultsOnInsert: true },
  ).catch(() => null);
}

function allocateBestStaffWeekPauseBonusDays(staffDoc?, giorniRichiesti?) {
  const need = Math.max(0, Math.floor(Number(giorniRichiesti) || 0));
  if (!need) return 0;
  return Math.min(getBestStaffWeekPauseBonusDaysRemaining(staffDoc), need);
}

function computeStaffPauseDayBudget(member?, staffDoc?, roleChoice?) {
  const baseLimit = getBasePauseLimit(member, roleChoice);
  const annualBonus =
    getBestStaffPauseBonusDays(member, staffDoc) + getValPosTradedPauseBonusDays(staffDoc);
  const weekRemaining = getBestStaffWeekPauseBonusDaysRemaining(staffDoc);
  const pauses = Array.isArray(staffDoc?.staff?.pauses)
    ? staffDoc.staff.pauses
    : Array.isArray(staffDoc?.pauses)
      ? staffDoc.pauses
      : [];
  const usedRaw = computeConsumedPauseDays(pauses);
  const weekConsumedYear = computeWeekBonusDaysConsumed(pauses, null);
  const usedDays = Math.max(0, usedRaw - weekConsumedYear);
  const maxGiorni = baseLimit + annualBonus + weekRemaining;
  return {
    baseLimit,
    annualBonus,
    weekRemaining,
    usedRaw,
    usedDays,
    maxGiorni,
    remaining: maxGiorni - usedDays,
  };
}

async function grantBestStaffWeekPauseBonus(guildId?, userId?, options: Record<string, any> = {}) {
  const g = String(guildId ?? "").trim();
  const u = String(userId ?? "").trim();
  if (!isValidGuildUserId(g, u)) return { ok: false, reason: "bad_ids" };
  const weekKey = String(options.weekKey || getStaffWeekKeyNow()).trim();
  /* stafferMonthBridge1: mese = giovedì della weekKey (non calendario del grant). */
  const monthKey = resolveStafferBonusMonthKey({
    weekKey,
    monthKey: options.monthKey,
  });
  if (!weekKey || !monthKey) return { ok: false, reason: "bad_keys" };

  const entry = {
    weekKey,
    monthKey,
    days: 1,
    grantedAt: new Date(),
  };

  // Atomic: push solo se weekKey non è già in array (anti double-grant memberUpdate+audit).
  let result;
  try {
    result = await ActivityUserProfile.updateOne(
      {
        guildId: g,
        userId: u,
        "staff.bestStaffWeekPauseBonusWeeks": {
          $not: { $elemMatch: { weekKey } },
        },
      },
      {
        $setOnInsert: { guildId: g, userId: u },
        $push: { "staff.bestStaffWeekPauseBonusWeeks": entry },
      },
      { upsert: true, setDefaultsOnInsert: true },
    );
  } catch (err) {
    // Race su upsert unico guildId+userId: rileggi, non fingere successo.
    const after = await ActivityUserProfile.findOne(
      { guildId: g, userId: u },
      { "staff.bestStaffWeekPauseBonusWeeks": 1 },
    )
      .lean()
      .catch(() => null);
    if (
      listBestStaffWeekPauseGrants(after || {}).some(
        (row?) => String(row?.weekKey || "").trim() === weekKey,
      )
    ) {
      return { ok: true, already: true, weekKey, monthKey };
    }
    global.logger?.warn?.(
      "[PAUSE] grantBestStaffWeekPauseBonus failed",
      err?.message || err,
    );
    return { ok: false, reason: "db_error", weekKey, monthKey };
  }

  if (result.modifiedCount > 0 || result.upsertedCount > 0) {
    return { ok: true, already: false, weekKey, monthKey };
  }
  return { ok: true, already: true, weekKey, monthKey };
}

export = { grantBestStaffPauseBonusYear, allocateBestStaffWeekPauseBonusDays, computeStaffPauseDayBudget, grantBestStaffWeekPauseBonus };
