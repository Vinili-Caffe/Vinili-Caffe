const fs = require("fs");
for (const line of fs.readFileSync("/opt/bot/.env", "utf8").split(/\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq < 1) continue;
  const k = t.slice(0, eq).trim();
  let v = t.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (k && process.env[k] == null) process.env[k] = v;
}
const mongoose = require("/opt/bot/bots-ts/node_modules/mongoose");
const {
  getMinigameRankWeekKeyForPublish,
  getWeekKey,
  getLastSunday21BoundaryMsAtOrBefore,
} = require("/opt/bot/bots-ts/src/Vinili/Community/services/winnersTime.js");

(async () => {
  await mongoose.connect(process.env.MONGO_URL, { maxPoolSize: 2, serverSelectionTimeoutMS: 12000 });
  const gid = "1329080093599076474";
  const col = mongoose.connection.db.collection("activityuserprofiles");
  const now = new Date();
  const rankKey = getMinigameRankWeekKeyForPublish(now);
  const weekKeyNow = getWeekKey(now);
  const endMs = getLastSunday21BoundaryMsAtOrBefore(now);
  console.log(
    JSON.stringify(
      {
        now: now.toISOString(),
        rankKey,
        weekKeyNow,
        endIso: new Date(endMs).toISOString(),
      },
      null,
      2,
    ),
  );

  const topPrev = await col
    .find({ guildId: gid, "profile.totals.exp.minigame.prevWeekExp": { $gt: 0 } })
    .project({
      userId: 1,
      wk: "$profile.totals.exp.minigame.weeklyKey",
      we: "$profile.totals.exp.minigame.weeklyExp",
      pk: "$profile.totals.exp.minigame.prevWeekKey",
      pe: "$profile.totals.exp.minigame.prevWeekExp",
      te: "$profile.totals.exp.minigame.totalExp",
    })
    .sort({ "profile.totals.exp.minigame.prevWeekExp": -1 })
    .limit(20)
    .toArray();

  const topWeek = await col
    .find({ guildId: gid, "profile.totals.exp.minigame.weeklyExp": { $gt: 0 } })
    .project({
      userId: 1,
      wk: "$profile.totals.exp.minigame.weeklyKey",
      we: "$profile.totals.exp.minigame.weeklyExp",
      pk: "$profile.totals.exp.minigame.prevWeekKey",
      pe: "$profile.totals.exp.minigame.prevWeekExp",
    })
    .sort({ "profile.totals.exp.minigame.weeklyExp": -1 })
    .limit(10)
    .toArray();

  const forRank = await col
    .find({
      guildId: gid,
      $or: [
        { "profile.totals.exp.minigame.weeklyKey": rankKey, "profile.totals.exp.minigame.weeklyExp": { $gt: 0 } },
        { "profile.totals.exp.minigame.prevWeekKey": rankKey, "profile.totals.exp.minigame.prevWeekExp": { $gt: 0 } },
      ],
    })
    .project({
      userId: 1,
      wk: "$profile.totals.exp.minigame.weeklyKey",
      we: "$profile.totals.exp.minigame.weeklyExp",
      pk: "$profile.totals.exp.minigame.prevWeekKey",
      pe: "$profile.totals.exp.minigame.prevWeekExp",
    })
    .sort({ "profile.totals.exp.minigame.prevWeekExp": -1 })
    .limit(20)
    .toArray();

  const keyStats = await col
    .aggregate([
      { $match: { guildId: gid, "profile.totals.exp.minigame.prevWeekExp": { $gt: 0 } } },
      {
        $group: {
          _id: "$profile.totals.exp.minigame.prevWeekKey",
          n: { $sum: 1 },
          max: { $max: "$profile.totals.exp.minigame.prevWeekExp" },
        },
      },
      { $sort: { max: -1 } },
      { $limit: 10 },
    ])
    .toArray();

  console.log("topPrev", JSON.stringify(topPrev, null, 2));
  console.log("topWeek", JSON.stringify(topWeek, null, 2));
  console.log("forRankKey", rankKey, JSON.stringify(forRank, null, 2));
  console.log("prevWeekKeyStats", JSON.stringify(keyStats, null, 2));

  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
