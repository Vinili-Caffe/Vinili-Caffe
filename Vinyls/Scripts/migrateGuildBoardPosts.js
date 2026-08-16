/* eslint-disable no-console */
/**
 * Migra guildquoteboards + guildreposts → guildboardposts (type: quote|repost).
 * Idempotente: salta _id già presenti.
 *
 * Usage: node Vinyls/Scripts/migrateGuildBoardPosts.js
 */
const fs = require("fs");

function loadEnv() {
  const envPath = "/opt/bot/.env";
  const localEnv = require("path").join(__dirname, "..", "..", ".env");
  const path = fs.existsSync(envPath) ? envPath : localEnv;
  if (!fs.existsSync(path)) return;
  for (const line of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = val;
  }
}

function stripMeta(doc) {
  const out = { ...doc };
  delete out.__v;
  return out;
}

async function migrateKind(db, fromName, type) {
  const src = db.collection(fromName);
  const dest = db.collection("guildboardposts");
  const docs = await src.find({}).toArray();
  let inserted = 0;
  let skipped = 0;
  const batch = [];
  for (const doc of docs) {
    const id = doc._id;
    const exists = await dest.findOne({ _id: id }, { projection: { _id: 1 } });
    if (exists) {
      skipped += 1;
      continue;
    }
    const next = stripMeta(doc);
    next.type = type;
    batch.push(next);
  }
  if (batch.length) {
    const CHUNK = 200;
    for (let i = 0; i < batch.length; i += CHUNK) {
      const slice = batch.slice(i, i + CHUNK);
      const res = await dest.insertMany(slice, { ordered: false }).catch(async (err) => {
        if (err?.writeErrors || err?.code === 11000) {
          return { insertedCount: slice.length - (err.writeErrors?.length || 0) };
        }
        throw err;
      });
      inserted += Number(res.insertedCount || slice.length);
    }
  }
  return { from: fromName, type, sourceCount: docs.length, inserted, skipped };
}

async function main() {
  loadEnv();
  const dropOld = process.argv.includes("--drop-old");
  const mongoose = require("mongoose");
  const uri = process.env.MONGO_URL_LOCAL || process.env.MONGO_URL || process.env.MONGO_URI;
  if (!uri) {
    console.error("Missing MONGO_URL");
    process.exit(1);
  }
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const quote = await migrateKind(db, "guildquoteboards", "quote");
  const repost = await migrateKind(db, "guildreposts", "repost");
  console.log(JSON.stringify({ quote, repost }, null, 2));

  const byType = await db
    .collection("guildboardposts")
    .aggregate([{ $group: { _id: "$type", n: { $sum: 1 } } }])
    .toArray();
  console.log("guildboardposts_by_type", byType);

  if (dropOld) {
    const qCount = await db.collection("guildboardposts").countDocuments({ type: "quote" });
    const rCount = await db.collection("guildboardposts").countDocuments({ type: "repost" });
    const oldQ = await db.collection("guildquoteboards").estimatedDocumentCount();
    const oldR = await db.collection("guildreposts").estimatedDocumentCount();
    if (qCount >= oldQ && rCount >= oldR) {
      await db.collection("guildquoteboards").drop().catch(() => null);
      await db.collection("guildreposts").drop().catch(() => null);
      console.log("dropped_old_collections", { oldQ, oldR, qCount, rCount });
    } else {
      console.error("refusing drop: counts mismatch", { qCount, rCount, oldQ, oldR });
      process.exitCode = 2;
    }
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
