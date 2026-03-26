/**
 * Migrazione one-shot:
 * - da `reviewReward.*` e `reviewRewards.*`
 * - a  `bumpVoteRewards.disboard_review.*`
 *
 * Uso:
 *   node scripts/migrate-review-reward-into-bumpVoteRewards.js
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
  throw new Error(
    "Mongoose non trovato. Installa le dipendenze del bot (npm install / npm ci).",
  );
}

const mongoose = requireMongoose();
const { ActivityUserProfile } = require(path.join(
  ROOT,
  "Vinyls",
  "Schemas",
  "Community",
  "communitySchemas.js",
));

function resolveMongoUrl() {
  return (
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGODB_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URI ||
    ""
  );
}

function pickDate(...candidates) {
  for (const candidate of candidates) {
    if (candidate != null) return candidate;
  }
  return null;
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
        { reviewReward: { $exists: true } },
        { reviewRewards: { $exists: true } },
      ],
    },
    {
      _id: 1,
      reviewReward: 1,
      reviewRewards: 1,
      "bumpVoteRewards.disboard_review": 1,
    },
  );

  const ops = [];
  let scanned = 0;
  let migrated = 0;

  for await (const doc of cursor) {
    scanned += 1;
    const current = doc?.bumpVoteRewards?.disboard_review || {};
    const legacySingle = doc?.reviewReward || {};
    const legacyPlural = doc?.reviewRewards || {};

    const next = {
      rewardedBy: pickDate(
        current?.rewardedBy,
        legacySingle?.rewardedBy,
        legacyPlural?.rewardedBy,
      ),
      rewardedAt: pickDate(
        current?.rewardedAt,
        legacySingle?.rewardedAt,
        legacyPlural?.rewardedAt,
      ),
    };

    ops.push({
      updateOne: {
        filter: { _id: doc._id },
        update: {
          $set: { "bumpVoteRewards.disboard_review": next },
          $unset: { reviewReward: "", reviewRewards: "" },
        },
      },
    });
    migrated += 1;

    if (ops.length >= 500) {
      await collection.bulkWrite(ops, { ordered: false });
      ops.length = 0;
    }
  }

  if (ops.length) {
    await collection.bulkWrite(ops, { ordered: false });
  }

  console.log(
    `[migrate-review-reward] scanned=${scanned} migrated=${migrated} (legacy fields rimossi).`,
  );

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});