/**
 * Riordina activitydailycompact per data decrescente (piu recente -> piu vecchia).
 *
 * NOTE:
 * - In MongoDB l'ordine "naturale" non e garantito: per avere il nuovo giorno in cima
 *   bisogna sempre usare sort({ dateKey: -1 }).
 * - Questo script puo anche ricostruire fisicamente la collezione in quell'ordine.
 *
 * SICUREZZA:
 * - Senza --yes non scrive nulla (solo preview + indici).
 * - Con --yes crea una backup collection e poi fa swap atomico.
 *
 * Uso:
 *   node scripts/order-activity-daily-compact.js
 *   node scripts/order-activity-daily-compact.js --yes
 *   node scripts/order-activity-daily-compact.js --yes --drop-backup
 */
const path = require("path");
const mongoose = require("mongoose");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const MONGO_URL =
  process.env.MONGO_URL_LOCAL ||
  process.env.MONGODB_URI_LOCAL ||
  process.env.MONGO_URL ||
  process.env.MONGODB_URI;

const doRun = process.argv.includes("--yes");
const dropBackup = process.argv.includes("--drop-backup");
const BATCH_SIZE = 300;

function timestampTag() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function ensureSortIndexes(col) {
  await col.createIndex({ guildId: 1, dateKey: -1 }, { name: "guildId_1_dateKey_-1" }).catch(() => null);
  await col.createIndex({ dateKey: -1 }, { name: "dateKey_-1" }).catch(() => null);
}

async function run() {
  if (!MONGO_URL) {
    console.error("Imposta MONGO_URL (o MONGO_URL_LOCAL) in .env");
    process.exit(1);
  }
  await mongoose.connect(MONGO_URL);

  const db = mongoose.connection.db;
  const sourceName = "activitydailycompact";
  const source = db.collection(sourceName);
  await ensureSortIndexes(source);

  const total = await source.countDocuments({});
  const preview = await source
    .find({}, { projection: { guildId: 1, dateKey: 1, updatedAt: 1 } })
    .sort({ dateKey: -1, updatedAt: -1, _id: -1 })
    .limit(10)
    .toArray();

  console.log("[order-activitydailycompact] totale documenti:", total);
  console.log("[order-activitydailycompact] preview top 10 (dateKey desc):");
  for (const row of preview) {
    console.log(`  - guildId=${String(row.guildId || "-")} dateKey=${String(row.dateKey || "-")} updatedAt=${row.updatedAt ? new Date(row.updatedAt).toISOString() : "-"}`);
  }

  if (!doRun) {
    console.log("\n[order-activitydailycompact] Modalita SICURA: nessuna scrittura (manca --yes).");
    console.log("[order-activitydailycompact] Per ricostruire fisicamente l'ordine: node scripts/order-activity-daily-compact.js --yes");
    await mongoose.disconnect();
    return;
  }

  const tag = timestampTag();
  const tmpName = `${sourceName}__reorder_tmp_${tag}`;
  const backupName = `${sourceName}__backup_${tag}`;
  const tmp = db.collection(tmpName);

  let inserted = 0;
  let batch = [];
  const cursor = source
    .find({})
    .sort({ dateKey: -1, updatedAt: -1, _id: -1 });

  for await (const doc of cursor) {
    batch.push(doc);
    if (batch.length >= BATCH_SIZE) {
      const res = await tmp.insertMany(batch, { ordered: false }).catch(() => ({ insertedCount: 0 }));
      inserted += Number(res?.insertedCount || 0);
      batch = [];
    }
  }
  if (batch.length > 0) {
    const res = await tmp.insertMany(batch, { ordered: false }).catch(() => ({ insertedCount: 0 }));
    inserted += Number(res?.insertedCount || 0);
  }

  await ensureSortIndexes(tmp);
  console.log("[order-activitydailycompact] inseriti in tmp:", inserted);

  await source.rename(backupName);
  await tmp.rename(sourceName);
  console.log("[order-activitydailycompact] swap completato.");
  console.log("[order-activitydailycompact] backup creato:", backupName);

  if (dropBackup) {
    await db.collection(backupName).drop().catch(() => null);
    console.log("[order-activitydailycompact] backup eliminato (--drop-backup).");
  } else {
    console.log("[order-activitydailycompact] backup mantenuto. Eliminalo dopo verifica se vuoi liberare spazio.");
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});