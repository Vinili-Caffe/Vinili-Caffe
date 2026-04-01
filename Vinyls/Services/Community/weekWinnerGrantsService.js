const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");

async function addEventWeekWinner(guildId, userId, week) {
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

async function hasEventWeekWinnerGrant(guildId, userId, week) {
  if (!guildId || !userId || (week !== 2 && week !== 3)) return false;
  const g = String(guildId);
  const u = String(userId);
  const doc = await ActivityUserProfile.findOne({ guildId: g, userId: u }).select("profile.totals.exp.event.weekWinners").lean().catch(() => null);
  return Array.isArray(doc?.profile?.totals?.exp?.event?.weekWinners) && doc.profile.totals.exp.event.weekWinners.includes(week);
}

module.exports = { addEventWeekWinner, hasEventWeekWinnerGrant };