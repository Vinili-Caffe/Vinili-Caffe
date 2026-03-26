/**
 * Migrazione one-shot per nuova struttura ActivityUserProfile:
 * - minigame -> exp.minigame
 * - bumpVoteRewards -> exp.bumpVoteRewards
 * - supporterStatus -> profile.supporterStatus
 * - daily/hourly -> totals.daily/totals.hourly
 * - eventRewards/eventExpSnapshot/eventWeekWinners -> exp.event.{rewards,snapshot,weekWinners}
 *
 * Uso:
 *   node scripts/migrate-profile-structure-exp-totals.js
 */
const path = require("path");
const ROOT = path.join(__dirname, "..");
require("dotenv").config({ path: path.join(ROOT, ".env"), quiet: true });

function requireMongoose() {
  const attempts = [
    () => require("mongoose"),
    () => require(path.join(ROOT, "node_modules", "mongoose")),
    () => require(path.join(ROOT, "Vinyls", "node_modules", "mongoose")),
  ];
  for (const fn of attempts) {
    try {
      return fn();
    } catch {
      /* try next */
    }
  }
  throw new Error("Mongoose non trovato. Installa le dipendenze (npm install / npm ci).");
}

const mongoose = requireMongoose();
const { ActivityUserProfile } = require(path.join(ROOT, "Vinyls", "Schemas", "Community", "communitySchemas.js"));

function resolveMongoUrl() {
  return (
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGODB_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URI ||
    ""
  );
}

function pick(primary, fallback, defaultValue = null) {
  if (primary != null) return primary;
  if (fallback != null) return fallback;
  return defaultValue;
}

function pickObj(primary, fallback) {
  if (primary && typeof primary === "object" && !Array.isArray(primary)) return primary;
  if (fallback && typeof fallback === "object" && !Array.isArray(fallback)) return fallback;
  return {};
}

function pickArr(primary, fallback) {
  if (Array.isArray(primary)) return primary;
  if (Array.isArray(fallback)) return fallback;
  return [];
}

async function main() {
  const url = resolveMongoUrl();
  if (!url) {
    console.error("Nessun URL MongoDB in .env (MONGO_URL / MONGODB_URI / *_LOCAL).");
    process.exit(1);
  }
  await mongoose.connect(url);

  const collection = ActivityUserProfile.collection;
  const cursor = collection.find(
    {
      $or: [
        { minigame: { $exists: true } },
        { bumpVoteRewards: { $exists: true } },
        { supporterStatus: { $exists: true } },
        { daily: { $exists: true } },
        { hourly: { $exists: true } },
        { eventRewards: { $exists: true } },
        { eventExpSnapshot: { $exists: true } },
        { eventWeekWinners: { $exists: true } },
      ],
    },
    {
      _id: 1,
      minigame: 1,
      bumpVoteRewards: 1,
      supporterStatus: 1,
      daily: 1,
      hourly: 1,
      eventRewards: 1,
      eventExpSnapshot: 1,
      eventWeekWinners: 1,
      exp: 1,
      profile: 1,
      totals: 1,
    },
  );

  const ops = [];
  let scanned = 0;
  let migrated = 0;

  for await (const doc of cursor) {
    scanned += 1;

    const nextMinigame = pickObj(doc?.exp?.minigame, doc?.minigame);
    const nextBumpVoteRewards = pickObj(doc?.exp?.bumpVoteRewards, doc?.bumpVoteRewards);
    const nextSupporterStatus = pickObj(doc?.profile?.supporterStatus, doc?.supporterStatus);
    const nextDaily = pickObj(doc?.totals?.daily, doc?.daily);
    const nextHourly = pickObj(doc?.totals?.hourly, doc?.hourly);

    const nextEvent = {
      rewards: pickArr(doc?.exp?.event?.rewards, doc?.eventRewards),
      snapshot: pickObj(doc?.exp?.event?.snapshot, doc?.eventExpSnapshot),
      weekWinners: pickArr(doc?.exp?.event?.weekWinners, doc?.eventWeekWinners),
    };

    ops.push({
      updateOne: {
        filter: { _id: doc._id },
        update: {
          $set: {
            "exp.minigame": nextMinigame,
            "exp.bumpVoteRewards": nextBumpVoteRewards,
            "profile.supporterStatus": nextSupporterStatus,
            "totals.daily": nextDaily,
            "totals.hourly": nextHourly,
            "exp.event": nextEvent,
          },
          $unset: {
            minigame: "",
            bumpVoteRewards: "",
            supporterStatus: "",
            daily: "",
            hourly: "",
            eventRewards: "",
            eventExpSnapshot: "",
            eventWeekWinners: "",
          },
        },
      },
    });
    migrated += 1;

    if (ops.length >= 300) {
      await collection.bulkWrite(ops, { ordered: false });
      ops.length = 0;
    }
  }

  if (ops.length) await collection.bulkWrite(ops, { ordered: false });
  console.log(`[migrate-profile-structure] scanned=${scanned} migrated=${migrated} (legacy fields rimossi).`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});