/**
 * Migrazione one-shot:
 * - da `voteRole.*` e `discadiaVote.*`
 * - a  `bumpVoteRewards.discadia_vote.*`
 *
 * Uso:
 *   node scripts/migrate-discadia-vote-into-bumpVoteRewards.js
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

function pickDate(primary, fallback) {
  if (primary != null) return primary;
  if (fallback != null) return fallback;
  return null;
}

function pickNumber(primary, fallback, defaultValue = 0) {
  if (Number.isFinite(Number(primary))) return Number(primary);
  if (Number.isFinite(Number(fallback))) return Number(fallback);
  return defaultValue;
}

function pickArray(primary, fallback) {
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
        { voteRole: { $exists: true } },
        { discadiaVote: { $exists: true } },
      ],
    },
    {
      _id: 1,
      voteRole: 1,
      discadiaVote: 1,
      "bumpVoteRewards.discadia_vote": 1,
    },
  );

  const ops = [];
  let scanned = 0;
  let migrated = 0;

  for await (const doc of cursor) {
    scanned += 1;
    const legacyVoteRole = doc?.voteRole || {};
    const legacyDiscadiaVote = doc?.discadiaVote || {};
    const current = doc?.bumpVoteRewards?.discadia_vote || {};

    const next = {
      lastVoteAt: pickDate(current?.lastVoteAt, legacyDiscadiaVote?.lastVoteAt),
      lastRemindedAt: pickDate(current?.lastRemindedAt, legacyDiscadiaVote?.lastRemindedAt),
      voteCount: pickNumber(current?.voteCount, legacyDiscadiaVote?.voteCount, 0),
      pendingVotes: pickArray(current?.pendingVotes, legacyDiscadiaVote?.pendingVotes),
      voteRole: {
        expiresAt: pickDate(current?.voteRole?.expiresAt, legacyVoteRole?.expiresAt),
        grantedAt: pickDate(current?.voteRole?.grantedAt, legacyVoteRole?.grantedAt),
      },
    };

    ops.push({
      updateOne: {
        filter: { _id: doc._id },
        update: {
          $set: { "bumpVoteRewards.discadia_vote": next },
          $unset: { voteRole: "", discadiaVote: "" },
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
    `[migrate-discadia-vote] scanned=${scanned} migrated=${migrated} (legacy fields rimossi).`,
  );

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});