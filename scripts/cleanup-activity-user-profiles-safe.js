/* eslint-disable no-console */
require("dotenv").config();
const mongoose = require("mongoose");
const { ActivityUserProfile } = require("../Vinyls/Schemas/Community/communitySchemas");

const APPLY = process.argv.includes("--apply");

function getMongoUri() {
  return (
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGODB_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    ""
  );
}

function getAtPath(obj, path) {
  const keys = String(path || "").split(".");
  let cur = obj;
  for (const k of keys) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[k];
  }
  return cur;
}

const LEGACY_ARRAY_PATHS = [
  "levelHistory",
  "levelHystory",
  "eventRewards",
  "eventWeekWinners",
  "reviewRewards",
  "discadiaVote.pendingVotes",
];

async function run() {
  const mongoUri = getMongoUri();
  if (!mongoUri) {
    throw new Error(
      "Mongo URI non trovata. Imposta una tra: MONGO_URL_LOCAL, MONGODB_URI_LOCAL, MONGO_URL, MONGO_URI, MONGODB_URI",
    );
  }

  await mongoose.connect(mongoUri);
  const collection = ActivityUserProfile.collection;

  const projection = { _id: 1 };
  for (const p of LEGACY_ARRAY_PATHS) projection[p] = 1;
  const cursor = collection.find({}, { projection });

  let scanned = 0;
  let touched = 0;
  const ops = [];

  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    scanned += 1;

    const unset = {};
    for (const path of LEGACY_ARRAY_PATHS) {
      const value = getAtPath(doc, path);
      if (Array.isArray(value) && value.length === 0) {
        unset[path] = "";
      }
    }

    const keys = Object.keys(unset);
    if (!keys.length) continue;
    touched += 1;

    if (APPLY) {
      ops.push({
        updateOne: {
          filter: { _id: doc._id },
          update: { $unset: unset },
        },
      });
      if (ops.length >= 500) {
        await collection.bulkWrite(ops, { ordered: false });
        ops.length = 0;
      }
    }
  }

  if (APPLY && ops.length) {
    await collection.bulkWrite(ops, { ordered: false });
  }

  console.log(
    `[cleanup-activity-user-profiles-safe] mode=${APPLY ? "apply" : "dry-run"} scanned=${scanned} matched=${touched}`,
  );
  if (!APPLY) {
    console.log(
      "[cleanup-activity-user-profiles-safe] Nessuna modifica applicata. Usa --apply per eseguire davvero.",
    );
  }

  await mongoose.disconnect();
}

run()
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error("[cleanup-activity-user-profiles-safe] error", err);
    try {
      await mongoose.disconnect();
    } catch (_) {}
    process.exit(1);
  });