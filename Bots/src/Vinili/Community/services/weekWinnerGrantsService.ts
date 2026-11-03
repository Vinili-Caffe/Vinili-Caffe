const { ActivityUserProfile } = require("../schemas/communitySchemas") as typeof import("../schemas/communitySchemas");

function weekWinnersListIncludesWeek(list?, week?) {
  if (!Array.isArray(list)) return false;
  const w = Number(week);
  if (!Number.isFinite(w)) return false;
  for (const entry of list) {
    const n = Number(entry);
    if (Number.isFinite(n) && n === w) return true;
  }
  return false;
}

async function hasEventWeekWinnerGrant(guildId?, userId?, week?) {
  if (!guildId || !userId || (week !== 2 && week !== 3)) return false;
  const g = String(guildId);
  const u = String(userId);
  const doc = await ActivityUserProfile.findOne({ guildId: g, userId: u }).select("profile.totals.exp.event.weekWinners").lean().catch(() => null);
  return weekWinnersListIncludesWeek(doc?.profile?.totals?.exp?.event?.weekWinners, week);
}

export = { hasEventWeekWinnerGrant };