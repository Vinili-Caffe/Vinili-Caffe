const mongoose = require("mongoose");
require("dotenv").config();
const {
  ActivityHourly,
  ExpUser,
  EventUserExpSnapshot,
  GlobalSettings,
} = require("../Vinyls/Schemas/Community/communitySchemas");
const {
  MESSAGE_EXP,
  VOICE_EXP_PER_MINUTE,
} = require("../Vinyls/Services/Community/expService");
const IDs = require("../Vinyls/Utils/Config/ids");
const {
  getEventWeekRomeDateKeys,
} = require("../Vinyls/Services/Community/activityEventRewardsService");

async function main() {
  const guildId = IDs.guilds?.main;
  if (!guildId) {
    console.error("[rebuildActivityExpForEvent] Nessun IDs.guilds.main configurato.");
    process.exit(1);
  }

  console.log("[rebuildActivityExpForEvent] Guild:", guildId);

  const settings = await GlobalSettings.findOne({ guildId }).lean().catch(() => null);
  if (!settings?.expEventStartedAt || !settings?.expEventMultiplierExpiresAt) {
    console.error("[rebuildActivityExpForEvent] Nessun evento activity configurato in GlobalSettings.");
    process.exit(1);
  }

  const weeks = [1, 2, 3, 4];
  const dateKeySet = new Set();

  for (const w of weeks) {
    const keys = getEventWeekRomeDateKeys(
      {
        eventStartedAt: settings.expEventStartedAt,
        eventExpiresAt: settings.expEventMultiplierExpiresAt,
      },
      w,
    );
    for (const k of keys) dateKeySet.add(k);
  }

  const allDateKeys = Array.from(dateKeySet.values());
  if (!allDateKeys.length) {
    console.error("[rebuildActivityExpForEvent] Nessuna dateKey trovata per le settimane evento.");
    process.exit(1);
  }

  const hourPrefixes = allDateKeys.map((d) => `${d}T`);
  console.log(
    "[rebuildActivityExpForEvent] Date keys totali:",
    allDateKeys.length,
  );

  const cursor = ActivityHourly.find({ guildId }).select("hourKey userId textCount voiceSeconds").lean().cursor();

  const perUser = new Map();
  for await (const row of cursor) {
    const hourKey = String(row?.hourKey || "");
    if (!hourPrefixes.some((p) => hourKey.startsWith(p))) continue;
    const userId = String(row?.userId || "");
    if (!userId) continue;
    const text = Math.max(0, Number(row?.textCount || 0));
    const voiceSeconds = Math.max(0, Number(row?.voiceSeconds || 0));
    const activityExp =
      text * MESSAGE_EXP +
      Math.floor((voiceSeconds / 60) * VOICE_EXP_PER_MINUTE);
    if (activityExp <= 0) continue;
    perUser.set(userId, (perUser.get(userId) || 0) + activityExp);
  }

  if (!perUser.size) {
    console.log("[rebuildActivityExpForEvent] Nessun activityExp calcolato.");
    process.exit(0);
  }

  console.log(
    "[rebuildActivityExpForEvent] Utenti con activityExp calcolata:",
    perUser.size,
  );

  const bulkExp = [];
  const bulkSnapshots = [];

  const existingSnapshots = await EventUserExpSnapshot.find({ guildId })
    .select("userId activityExpAtStart totalExpAtStart")
    .lean()
    .catch(() => []);
  const snapshotByUser = new Map(
    existingSnapshots.map((d) => [
      String(d.userId),
      {
        totalExpAtStart: Number(d.totalExpAtStart || 0),
        activityExpAtStart: Number(d.activityExpAtStart || 0),
      },
    ]),
  );

  for (const [userId, activityExpTotal] of perUser.entries()) {
    bulkExp.push({
      updateOne: {
        filter: { guildId, userId },
        update: {
          $setOnInsert: { guildId, userId },
          $max: { activityExpTotal },
        },
        upsert: true,
      },
    });

    const snap = snapshotByUser.get(userId) || null;
    if (snap && snap.activityExpAtStart != null) continue;

    const totalDoc = await ExpUser.findOne({ guildId, userId })
      .select("totalExp")
      .lean()
      .catch(() => null);
    const totalExp = Math.max(0, Number(totalDoc?.totalExp || 0));

    bulkSnapshots.push({
      updateOne: {
        filter: { guildId, userId },
        update: {
          $setOnInsert: {
            guildId,
            userId,
            totalExpAtStart: totalExp,
          },
          $set: {
            activityExpAtStart: Math.min(activityExpTotal, totalExp),
          },
        },
        upsert: true,
      },
    });
  }

  if (bulkExp.length) {
    await ExpUser.bulkWrite(bulkExp, { ordered: false }).catch((err) => {
      console.error(
        "[rebuildActivityExpForEvent] bulkWrite ExpUser failed:",
        err,
      );
    });
  }

  if (bulkSnapshots.length) {
    await EventUserExpSnapshot.bulkWrite(bulkSnapshots, {
      ordered: false,
    }).catch((err) => {
      console.error(
        "[rebuildActivityExpForEvent] bulkWrite EventUserExpSnapshot failed:",
        err,
      );
    });
  }

  console.log("[rebuildActivityExpForEvent] Done.");
}

if (require.main === module) {
  const uri =
    process.env.MONGO_URL_LOCAL_LOCAL ||
    process.env.MONGODB_URI_LOCAL ||
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    process.env.MONGO_URL_LOCAL;
  if (!uri) {
    console.error(
      "[rebuildActivityExpForEvent] MONGO_URI/MONGODB_URI/MONGO_URL (o MONGO_URL_LOCAL) mancante.",
    );
    process.exit(1);
  }
  mongoose
    .connect(uri)
    .then(() => main())
    .then(() => mongoose.disconnect())
    .catch((err) => {
      console.error("[rebuildActivityExpForEvent] Fatal error:", err);
      mongoose.disconnect();
    });
}