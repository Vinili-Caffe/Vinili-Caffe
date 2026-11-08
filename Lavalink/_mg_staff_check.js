const fs = require("fs");
process.chdir("/opt/bot");
for (const line of fs.readFileSync("/opt/bot/.env", "utf8").split(/\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq < 1) continue;
  const key = t.slice(0, eq).trim();
  let val = t.slice(eq + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
  if (key && process.env[key] == null) process.env[key] = val;
}
const mongoose = require("mongoose");
const SRC = "/opt/bot/bots-ts/src";
(async () => {
  await mongoose.connect(process.env.MONGO_URL, { maxPoolSize: 2 });
  const {
    getLastSunday21BoundaryMsAtOrBefore,
    getMinigameRankWeekKeyForPublish,
  } = require(`${SRC}/Vinili/Community/services/winnersTime.js`);
  const {
    WEEKLY_WINNERS_EXCLUDED_ROLE_IDS,
    wasStaffDuringWeeklyActivityWindow,
    effectiveMinigameWeeklyScoreForRankWeek,
  } = require(`${SRC}/Vinili/Community/services/winnersRows.js`);
  const { ActivityUserProfile } = require(`${SRC}/Vinili/Community/schemas/communitySchemas.js`);
  const now = new Date();
  const rankKey = getMinigameRankWeekKeyForPublish(now);
  const end = getLastSunday21BoundaryMsAtOrBefore(now);
  const start = end - 7 * 24 * 60 * 60 * 1000;
  const ids = [
    "989054923163439104",
    "1312812791253700669",
    "1397724990694101083",
    "470373387609571339",
    "1064092511372591185",
    "1147495356951695361",
  ];
  const docs = await ActivityUserProfile.find({ guildId: "1329080093599076474", userId: { $in: ids } })
    .select("userId profile.totals.exp.minigame staff.rolesHistory staffRolesHistoryRetention")
    .lean();
  for (const d of docs.sort(
    (a, b) =>
      effectiveMinigameWeeklyScoreForRankWeek(b, rankKey) - effectiveMinigameWeeklyScoreForRankWeek(a, rankKey),
  )) {
    const staff = wasStaffDuringWeeklyActivityWindow(
      d.staff,
      start,
      end,
      WEEKLY_WINNERS_EXCLUDED_ROLE_IDS,
      d.staffRolesHistoryRetention,
    );
    const mg = d.profile?.totals?.exp?.minigame || {};
    console.log(
      JSON.stringify({
        userId: d.userId,
        score: effectiveMinigameWeeklyScoreForRankWeek(d, rankKey),
        pe: mg.prevWeekExp,
        we: mg.weeklyExp,
        staff,
        histLen: (d.staff?.rolesHistory || []).length,
        retLen: (d.staffRolesHistoryRetention || []).length,
        lastRoles: (d.staff?.rolesHistory || []).slice(-3).map((r) => ({
          d: r.date,
          n: r.newRole,
          o: r.oldRole,
        })),
      }),
    );
  }
  console.log("excluded", [...WEEKLY_WINNERS_EXCLUDED_ROLE_IDS]);
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
