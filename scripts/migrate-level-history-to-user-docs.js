/**
 * Migra i documenti dalla collezione levelhistories (un doc per ogni evento)
 * alla collezione levelhistoryusers (un doc per utente con array entries, max 150 per default).
 *
 * SICUREZZA: senza --yes NON scrive nulla, solo conteggio. Con --yes esegue la migrazione e verifica.
 *
 * Uso:
 *   node scripts/migrate-level-history-to-user-docs.js           → solo conteggio, nessuna scrittura
 *   node scripts/migrate-level-history-to-user-docs.js --yes      → esegue migrazione + verifica
 *   node scripts/migrate-level-history-to-user-docs.js --yes --force → svuota levelhistoryusers e rifa la migrazione (per ri-migrare con nuovi parametri)
 *
 * Richiede .env con MONGO_URL (o MONGO_URL_LOCAL / MONGODB_URI).
 * Dopo la migrazione puoi eliminare la collezione levelhistories se la verifica è ok.
 */
const path = require("path");
const mongoose = require("mongoose");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const MONGO_URL =
  process.env.MONGO_URL_LOCAL ||
  process.env.MONGODB_URI_LOCAL ||
  process.env.MONGO_URL ||
  process.env.MONGODB_URI;

const LEVEL_HISTORY_MAX_ENTRIES = Math.max(50, Math.min(500, Number(process.env.LEVEL_HISTORY_MAX_ENTRIES) || 150));
const doRun = process.argv.includes("--yes");
const force = process.argv.includes("--force");

async function run() {
  if (!MONGO_URL) {
    console.error("Imposta MONGO_URL (o MONGO_URL_LOCAL) in .env");
    process.exit(1);
  }
  await mongoose.connect(MONGO_URL);
  const { LevelHistory, LevelHistoryUser } = require("../Vinyls/Schemas/Community/communitySchemas");
  const total = await LevelHistory.countDocuments().catch(() => 0);
  console.log(`[migrate] Documenti in levelhistories: ${total}`);
  if (total === 0) {
    console.log("[migrate] Nulla da migrare.");
    await mongoose.disconnect();
    return;
  }
  const existing = await LevelHistoryUser.countDocuments().catch(() => 0);
  if (existing > 0 && doRun && !force) {
    console.log(`[migrate] levelhistoryusers ha già ${existing} documenti. Per evitare duplicati lo script non sovrascrive.`);
    console.log("[migrate] Per ri-migrare: svuota la collezione a mano oppure usa --yes --force");
    await mongoose.disconnect();
    return;
  }
  if (existing > 0 && doRun && force) {
    const deleted = await LevelHistoryUser.deleteMany({}).catch(() => ({ deletedCount: 0 }));
    console.log(`[migrate] --force: svuotata levelhistoryusers (rimossi ${deleted?.deletedCount ?? 0} documenti). Proseguo con la migrazione.`);
  }
  if (!doRun) {
    const cursor = LevelHistory.find({}).sort({ guildId: 1, userId: 1, createdAt: -1 }).lean().cursor();
    let usersCount = 0;
    let prevKey = null;
    for await (const doc of cursor) {
      const key = `${String(doc.guildId || "")}\n${String(doc.userId || "")}`;
      if (!doc.guildId || !doc.userId) continue;
      if (key !== prevKey) {
        usersCount++;
        prevKey = key;
      }
    }
    console.log(`[migrate] Modalità SICURA: nessuna scrittura (manca --yes).`);
    console.log(`[migrate] Utenti che verrebbero migrati: ${usersCount}. Documenti totali in origine: ${total}.`);
    console.log("\n[migrate] Per eseguire la migrazione: node scripts/migrate-level-history-to-user-docs.js --yes");
    await mongoose.disconnect();
    return;
  }

  const cursor = LevelHistory.find({})
    .sort({ guildId: 1, userId: 1, createdAt: -1 })
    .lean()
    .cursor();
  let currentKey = null;
  let currentEntries = [];
  let usersProcessed = 0;
  const toInsert = [];
  const BATCH = 200;

  for await (const doc of cursor) {
    const guildId = String(doc.guildId || "");
    const userId = String(doc.userId || "");
    if (!guildId || !userId) continue;
    const key = `${guildId}\n${userId}`;
    if (key !== currentKey) {
      if (currentKey && currentEntries.length > 0) {
        const [g, u] = currentKey.split("\n");
        toInsert.push({
          guildId: g,
          userId: u,
          entries: currentEntries.slice(0, LEVEL_HISTORY_MAX_ENTRIES),
        });
        usersProcessed++;
        if (toInsert.length >= BATCH) {
          await LevelHistoryUser.insertMany(toInsert);
          toInsert.length = 0;
        }
      }
      currentKey = key;
      currentEntries = [];
    }
    const entry = {
      action: String(doc.action || "update"),
      beforeExp: Number(doc.beforeExp || 0),
      afterExp: Number(doc.afterExp || 0),
      beforeLevel: Number(doc.beforeLevel || 0),
      afterLevel: Number(doc.afterLevel || 0),
      deltaExp: Number(doc.deltaExp || 0),
      createdAt: doc.createdAt ? new Date(doc.createdAt) : new Date(),
    };
    if (doc.actorId) entry.actorId = String(doc.actorId);
    if (doc.note) entry.note = String(doc.note).slice(0, 500);
    currentEntries.push(entry);
  }
  if (currentKey && currentEntries.length > 0) {
    const [g, u] = currentKey.split("\n");
    toInsert.push({
      guildId: g,
      userId: u,
      entries: currentEntries.slice(0, LEVEL_HISTORY_MAX_ENTRIES),
    });
    usersProcessed++;
  }
  if (toInsert.length > 0) {
    await LevelHistoryUser.insertMany(toInsert);
  }
  console.log(`[migrate] Migrati ${usersProcessed} utenti in levelhistoryusers.`);

  const verifyCount = await LevelHistoryUser.countDocuments().catch(() => 0);
  const agg = await LevelHistoryUser.aggregate([{ $project: { n: { $size: "$entries" } } }, { $group: { _id: null, total: { $sum: "$n" } } }]).catch(() => [{ total: 0 }]);
  const totalEntriesNew = agg[0]?.total ?? 0;
  const ok = verifyCount === usersProcessed;
  console.log(`[migrate] Verifica: documenti in levelhistoryusers = ${verifyCount} (attesi ${usersProcessed}). Entry totali = ${totalEntriesNew}.`);
  if (!ok) {
    console.warn("[migrate] ATTENZIONE: il numero di documenti non coincide. Controlla prima di eliminare levelhistories.");
  } else {
    console.log("[migrate] Verifica ok. Puoi eliminare la collezione levelhistories se non ti serve più.");
  }
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});