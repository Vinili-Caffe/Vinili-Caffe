const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");

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

async function addEventWeekWinner(guildId?, userId?, week?) {
  if (!guildId || !userId || (week !== 2 && week !== 3)) return null;
  const g = String(guildId);
  const u = String(userId);
  await ActivityUserProfile.updateOne(
    { guildId: g, userId: u },
    { $addToSet: { "profile.totals.exp.event.weekWinners": week }, $setOnInsert: { guildId: g, userId: u } },
    { upsert: true },
  ).catch(() => null);
  return true;
}

async function hasEventWeekWinnerGrant(guildId?, userId?, week?) {
  if (!guildId || !userId || (week !== 2 && week !== 3)) return false;
  const g = String(guildId);
  const u = String(userId);
  const doc = await ActivityUserProfile.findOne({ guildId: g, userId: u }).select("profile.totals.exp.event.weekWinners").lean().catch(() => null);
  return weekWinnersListIncludesWeek(doc?.profile?.totals?.exp?.event?.weekWinners, week);
}

export = { addEventWeekWinner, hasEventWeekWinnerGrant };