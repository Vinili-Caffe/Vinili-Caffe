/**
 * Migra i documenti dalla collezione levelhistories (un doc per ogni evento)
 * alla collezione levelhistoryusers (un doc per utente con array entries, max 500).
 * Eseguire con: node scripts/migrate-level-history-to-user-docs.js
 * Richiede .env con MONGO_URL (o MONGO_URL_LOCAL / MONGODB_URI).
 * Dopo la migrazione puoi eliminare la collezione levelhistories se tutto è ok.
 */
const path = require("path");
const mongoose = require("mongoose");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const MONGO_URL =
  process.env.MONGO_URL_LOCAL ||
  process.env.MONGODB_URI_LOCAL ||
  process.env.MONGO_URL ||
  process.env.MONGODB_URI;

const LEVEL_HISTORY_MAX_ENTRIES = 500;

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
  if (existing > 0) {
    console.log(`[migrate] levelhistoryusers ha già ${existing} documenti. Per evitare duplicati lo script non sovrascrive. Esci o svuota levelhistoryusers e riprova.`);
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
    currentEntries.push({
      actorId: doc.actorId ?? null,
      action: String(doc.action || "update"),
      beforeExp: Number(doc.beforeExp || 0),
      afterExp: Number(doc.afterExp || 0),
      beforeLevel: Number(doc.beforeLevel || 0),
      afterLevel: Number(doc.afterLevel || 0),
      deltaExp: Number(doc.deltaExp || 0),
      note: doc.note ?? null,
      createdAt: doc.createdAt ? new Date(doc.createdAt) : new Date(),
    });
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
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});