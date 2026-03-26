/* eslint-disable no-console */
require("dotenv").config();
const mongoose = require("mongoose");
const { ActivityUserProfile } = require("../Vinyls/Schemas/Community/communitySchemas");

function isObj(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}

function mergeObjects(base, extra) {
  const out = isObj(base) ? { ...base } : {};
  if (!isObj(extra)) return out;
  for (const [k, v] of Object.entries(extra)) {
    if (isObj(v) && isObj(out[k])) {
      out[k] = mergeObjects(out[k], v);
      continue;
    }
    if (typeof out[k] === "undefined") out[k] = v;
  }
  return out;
}

async function run() {
  const mongoUri =
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGODB_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGO_URI ||
    process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error(
      "Mongo URI non trovata. Imposta una tra: MONGO_URL_LOCAL, MONGODB_URI_LOCAL, MONGO_URL, MONGO_URI, MONGODB_URI",
    );
  }
  await mongoose.connect(mongoUri);
  const collection = ActivityUserProfile.collection;

  const query = {
    $or: [
      { totals: { $exists: true } },
      { exp: { $exists: true } },
    ],
  };

  const cursor = collection.find(query, {
    projection: { _id: 1, profile: 1, totals: 1, exp: 1 },
  });

  const ops = [];
  let scanned = 0;
  let changed = 0;

  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    scanned += 1;

    const rootTotals = isObj(doc?.totals) ? doc.totals : {};
    const rootExp = isObj(doc?.exp) ? doc.exp : {};
    const profile = isObj(doc?.profile) ? doc.profile : {};
    const profileTotals = isObj(profile?.totals) ? profile.totals : {};
    const profileTotalsExp = isObj(profileTotals?.exp) ? profileTotals.exp : {};

    const mergedExp = mergeObjects(rootExp, profileTotalsExp);
    const mergedTotalsWithoutExp = mergeObjects(rootTotals, (() => {
      const t = { ...profileTotals };
      delete t.exp;
      return t;
    })());
    const mergedTotals = { ...mergedTotalsWithoutExp, exp: mergedExp };
    const mergedProfile = { ...profile, totals: mergedTotals };

    ops.push({
      updateOne: {
        filter: { _id: doc._id },
        update: {
          $set: { profile: mergedProfile },
          $unset: { totals: "", exp: "" },
        },
      },
    });
    changed += 1;

    if (ops.length >= 500) {
      await collection.bulkWrite(ops, { ordered: false });
      ops.length = 0;
    }
  }

  if (ops.length) await collection.bulkWrite(ops, { ordered: false });
  console.log(`[migrate-profile-totals-exp-nesting] scanned=${scanned} changed=${changed}`);
  await mongoose.disconnect();
}

run()
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error("[migrate-profile-totals-exp-nesting] error", err);
    try { await mongoose.disconnect(); } catch (_) {}
    process.exit(1);
  });