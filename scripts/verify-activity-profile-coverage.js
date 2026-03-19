/**
 * Verifica copertura migrazione activityuserprofiles rispetto alle sorgenti legacy.
 * Non modifica nulla.
 *
 * Uso:
 *   node scripts/verify-activity-profile-coverage.js --atlas
 *   node scripts/verify-activity-profile-coverage.js --guild=1329080093599076474
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const {
  ActivityUser,
  ActivityDailyCompact,
  ActivityHourlyCompact,
  ActivityEventReward,
  ExpUser,
  EventUserExpSnapshot,
  EventWeekWinner,
  LevelHistoryUser,
  ActivityUserProfile,
} = require("../Vinyls/Schemas/Community/communitySchemas");
const IDs = require("../Vinyls/Utils/Config/ids");

function getArg(name, fallback = "") {
  const hit = process.argv.find((a) => String(a).startsWith(`--${name}=`));
  if (!hit) return fallback;
  return String(hit.split("=").slice(1).join("=")).trim();
}

function resolveMongoUrl() {
  if (process.argv.includes("--atlas")) return process.env.MONGO_URL || process.env.MONGODB_URI;
  return process.env.MONGO_URL_LOCAL || process.env.MONGODB_URI_LOCAL || process.env.MONGO_URL || process.env.MONGODB_URI;
}

async function main() {
  const guildId = String(getArg("guild", IDs.guilds?.main || "1329080093599076474"));
  const mongoUrl = resolveMongoUrl();
  if (!mongoUrl) throw new Error("Mongo URL mancante");
  await mongoose.connect(mongoUrl, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000 });

  const q = { guildId };
  const [
    activityUsers,
    dailyCompact,
    hourlyCompact,
    eventRewards,
    expUsers,
    snapshots,
    weekWinners,
    levelHistoryUsers,
    profiles,
  ] = await Promise.all([
    ActivityUser.countDocuments(q).catch(() => 0),
    ActivityDailyCompact.countDocuments(q).catch(() => 0),
    ActivityHourlyCompact.countDocuments(q).catch(() => 0),
    ActivityEventReward.countDocuments(q).catch(() => 0),
    ExpUser.countDocuments(q).catch(() => 0),
    EventUserExpSnapshot.countDocuments(q).catch(() => 0),
    EventWeekWinner.countDocuments(q).catch(() => 0),
    LevelHistoryUser.countDocuments(q).catch(() => 0),
    ActivityUserProfile.countDocuments(q).catch(() => 0),
  ]);

  console.log(JSON.stringify({
    guildId,
    sourceCounts: {
      activityUsers,
      activityDailyCompact: dailyCompact,
      activityHourlyCompact: hourlyCompact,
      activityEventRewards: eventRewards,
      expUsers,
      eventUserExpSnapshots: snapshots,
      eventWeekWinners: weekWinners,
      levelHistoryUsers,
    },
    targetCount: {
      activityUserProfiles: profiles,
    },
  }, null, 2));

  await mongoose.disconnect().catch(() => null);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});