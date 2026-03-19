/**
 * Riordina fisicamente la collection activityhourlycompact dal record più recente al più vecchio.
 *
 * Nota:
 * - MongoDB non garantisce ordine senza sort esplicito.
 * - Questo script riscrive i documenti in ordine decrescente di hourKey
 *   così, in visualizzazioni "naturali", i più recenti tendono a comparire per primi.
 *
 * Uso:
 *   node scripts/reorder-activityhourlycompact-recent-first.js --dry-run
 *   node scripts/reorder-activityhourlycompact-recent-first.js --atlas
 *   node scripts/reorder-activityhourlycompact-recent-first.js --guild=1329080093599076474
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const mongoose = require("mongoose");
const IDs = require("../Vinyls/Utils/Config/ids");

const SOURCE_COLLECTION = "activityhourlycompact";
const DEFAULT_GUILD_ID = IDs.guilds?.main || "1329080093599076474";

function getArg(name, fallback = "") {
  const hit = process.argv.find((a) => String(a).startsWith(`--${name}=`));
  if (!hit) return fallback;
  return String(hit.split("=").slice(1).join("=")).trim();
}

function resolveMongoUrl() {
  if (process.argv.includes("--atlas")) return process.env.MONGO_URL || process.env.MONGODB_URI;
  return (
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGODB_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URI
  );
}

async function cloneIndexes(source, target) {
  const indexes = await source.indexes().catch(() => []);
  for (const idx of indexes) {
    if (idx?.name === "_id_") continue;
    const key = idx.key || {};
    const options = { ...idx };
    delete options.v;
    delete options.key;
    delete options.ns;
    delete options.background;
    await target.createIndex(key, options).catch(() => null);
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const guildId = String(getArg("guild", DEFAULT_GUILD_ID || "")).trim();
  const mongoUrl = resolveMongoUrl();
  if (!mongoUrl) throw new Error("Mongo URL mancante");

  await mongoose.connect(mongoUrl, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000 });
  const db = mongoose.connection.db;

  const source = db.collection(SOURCE_COLLECTION);
  const filter = guildId ? { guildId } : {};

  const total = await source.countDocuments(filter).catch(() => 0);
  const previewNewest = await source.find(filter).sort({ hourKey: -1, _id: -1 }).limit(1).toArray().catch(() => []);
  const previewOldest = await source.find(filter).sort({ hourKey: 1, _id: 1 }).limit(1).toArray().catch(() => []);

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          collection: SOURCE_COLLECTION,
          guildId: guildId || null,
          matchedDocuments: total,
          newestHourKey: previewNewest?.[0]?.hourKey || null,
          oldestHourKey: previewOldest?.[0]?.hourKey || null,
        },
        null,
        2,
      ),
    );
    await mongoose.disconnect().catch(() => null);
    return;
  }

  const ts = Date.now();
  const tempName = `${SOURCE_COLLECTION}_tmp_${ts}`;
  const backupName = `${SOURCE_COLLECTION}_bak_${ts}`;
  const temp = db.collection(tempName);

  await cloneIndexes(source, temp);

  const cursor = source.find(filter).sort({ hourKey: -1, _id: -1 });
  let inserted = 0;
  const BATCH = 500;
  let batch = [];
  for await (const doc of cursor) {
    const out = { ...doc };
    batch.push(out);
    if (batch.length >= BATCH) {
      await temp.insertMany(batch, { ordered: true });
      inserted += batch.length;
      batch = [];
    }
  }
  if (batch.length) {
    await temp.insertMany(batch, { ordered: true });
    inserted += batch.length;
  }

  if (guildId) {
    await source.deleteMany({ guildId });
    const tempDocs = await temp.find({}).toArray();
    if (tempDocs.length) await source.insertMany(tempDocs, { ordered: true });
    await db.dropCollection(tempName).catch(() => null);
  } else {
    await source.rename(backupName, { dropTarget: true });
    await temp.rename(SOURCE_COLLECTION, { dropTarget: true });
    await db.dropCollection(backupName).catch(() => null);
  }

  const firstDoc = await db.collection(SOURCE_COLLECTION).find(filter).limit(1).toArray().catch(() => []);
  console.log(
    JSON.stringify(
      {
        dryRun: false,
        collection: SOURCE_COLLECTION,
        guildId: guildId || null,
        processed: total,
        inserted,
        firstHourKeyAfter: firstDoc?.[0]?.hourKey || null,
      },
      null,
      2,
    ),
  );

  await mongoose.disconnect().catch(() => null);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});