/**
 * Compatta eventuali duplicati in activitydailies per chiave (guildId, dateKey, userId),
 * verifica/crea indice unico e opzionalmente applica prune vecchi dati activity.
 *
 * SICUREZZA: senza --yes NON scrive nulla (solo audit).
 *
 * Uso:
 *   node scripts/compact-activity-dailies.js
 *   node scripts/compact-activity-dailies.js --yes
 *   RETENTION_DAILY=60 RETENTION_HOURLY=30 node scripts/compact-activity-dailies.js --yes
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
const retentionDaily = Math.max(31, Math.min(365, Number(process.env.RETENTION_DAILY) || Number(process.env.PRUNE_ACTIVITY_RETENTION_DAYS_DAILY) || 90));
const retentionHourly = Math.max(14, Math.min(90, Number(process.env.RETENTION_HOURLY) || Number(process.env.PRUNE_ACTIVITY_RETENTION_DAYS_HOURLY) || 60));
const BATCH_SIZE = 200;

function toPlainMap(value) {
  const out = {};
  if (!value) return out;
  if (value instanceof Map) {
    for (const [k, v] of value.entries()) {
      const key = String(k || "");
      const amount = Number(v || 0);
      if (!key || amount <= 0) continue;
      out[key] = (out[key] || 0) + amount;
    }
    return out;
  }
  for (const [k, v] of Object.entries(value || {})) {
    const key = String(k || "");
    const amount = Number(v || 0);
    if (!key || amount <= 0) continue;
    out[key] = (out[key] || 0) + amount;
  }
  return out;
}

function mergeChannelMaps(target, source) {
  const src = toPlainMap(source);
  for (const [k, v] of Object.entries(src)) {
    target[k] = (target[k] || 0) + v;
  }
}

function compareDocsForKeep(a, b) {
  const aTs = a?.createdAt ? new Date(a.createdAt).getTime() : Number.MAX_SAFE_INTEGER;
  const bTs = b?.createdAt ? new Date(b.createdAt).getTime() : Number.MAX_SAFE_INTEGER;
  if (aTs !== bTs) return aTs - bTs;
  return String(a?._id || "").localeCompare(String(b?._id || ""));
}

function pad2(n) {
  return String(Number(n)).padStart(2, "0");
}

function getDayKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

async function run() {
  if (!MONGO_URL) {
    console.error("Imposta MONGO_URL (o MONGO_URL_LOCAL) in .env");
    process.exit(1);
  }

  await mongoose.connect(MONGO_URL);
  const { ActivityDaily } = require("../Vinyls/Schemas/Community/communitySchemas");
  const { pruneOldActivityData } = require("../Vinyls/Services/Community/pruneOldActivityDataService");

  const totalDocs = await ActivityDaily.countDocuments().catch(() => 0);
  const minMaxRows = await ActivityDaily.aggregate([
    { $group: { _id: null, minDateKey: { $min: "$dateKey" }, maxDateKey: { $max: "$dateKey" } } },
  ]).catch(() => []);
  const minDateKey = minMaxRows?.[0]?.minDateKey || null;
  const maxDateKey = minMaxRows?.[0]?.maxDateKey || null;

  const duplicateStats = await ActivityDaily.aggregate([
    { $group: { _id: { guildId: "$guildId", dateKey: "$dateKey", userId: "$userId" }, c: { $sum: 1 } } },
    { $match: { c: { $gt: 1 } } },
    { $group: { _id: null, groups: { $sum: 1 }, extraDocs: { $sum: { $subtract: ["$c", 1] } } } },
  ]).catch(() => []);
  const duplicateGroups = Number(duplicateStats?.[0]?.groups || 0);
  const duplicateExtraDocs = Number(duplicateStats?.[0]?.extraDocs || 0);

  const indexes = await ActivityDaily.collection.indexes().catch(() => []);
  const hasUniqueTripletIndex = indexes.some((idx) => {
    const key = idx?.key || {};
    return idx?.unique === true && key.guildId === 1 && key.dateKey === 1 && key.userId === 1;
  });

  const cutoffDateKey = getDayKey(new Date(Date.now() - retentionDaily * 24 * 60 * 60 * 1000));
  const oldDailyCount = await ActivityDaily.countDocuments({ dateKey: { $lt: cutoffDateKey } }).catch(() => 0);

  console.log("[activitydailies] collection:", ActivityDaily.collection.collectionName);
  console.log("[activitydailies] documenti totali:", totalDocs);
  console.log("[activitydailies] range dateKey:", minDateKey || "-", "->", maxDateKey || "-");
  console.log("[activitydailies] gruppi duplicati:", duplicateGroups, "| documenti extra:", duplicateExtraDocs);
  console.log("[activitydailies] indice unico (guildId,dateKey,userId):", hasUniqueTripletIndex ? "OK" : "MANCANTE");
  console.log("[activitydailies] documenti vecchi oltre retention daily (" + retentionDaily + "gg):", oldDailyCount);

  if (!doRun) {
    console.log("\n[activitydailies] Modalita SICURA: nessuna scrittura (manca --yes).");
    console.log("[activitydailies] Per eseguire compattazione + indice + prune: node scripts/compact-activity-dailies.js --yes");
    await mongoose.disconnect();
    return;
  }

  let groupsProcessed = 0;
  let updatedDocs = 0;
  let deletedDocs = 0;
  const updateOps = [];
  const deleteIds = [];

  const duplicateGroupsCursor = ActivityDaily.aggregate([
    { $group: { _id: { guildId: "$guildId", dateKey: "$dateKey", userId: "$userId" }, c: { $sum: 1 } } },
    { $match: { c: { $gt: 1 } } },
    { $sort: { "_id.guildId": 1, "_id.dateKey": 1, "_id.userId": 1 } },
  ]).cursor({ batchSize: 100 }).exec();

  for await (const group of duplicateGroupsCursor) {
    const guildId = String(group?._id?.guildId || "");
    const dateKey = String(group?._id?.dateKey || "");
    const userId = String(group?._id?.userId || "");
    if (!guildId || !dateKey || !userId) continue;

    const docs = await ActivityDaily.find({ guildId, dateKey, userId })
      .select("_id createdAt textCount voiceSeconds textChannels voiceChannels")
      .lean()
      .catch(() => []);
    if (!Array.isArray(docs) || docs.length <= 1) continue;

    docs.sort(compareDocsForKeep);
    const keep = docs[0];
    const remove = docs.slice(1);
    const textChannels = {};
    const voiceChannels = {};
    let textCount = 0;
    let voiceSeconds = 0;

    for (const doc of docs) {
      textCount += Math.max(0, Number(doc?.textCount || 0));
      voiceSeconds += Math.max(0, Number(doc?.voiceSeconds || 0));
      mergeChannelMaps(textChannels, doc?.textChannels || {});
      mergeChannelMaps(voiceChannels, doc?.voiceChannels || {});
    }

    updateOps.push({
      updateOne: {
        filter: { _id: keep._id },
        update: {
          $set: {
            textCount,
            voiceSeconds,
            textChannels,
            voiceChannels,
          },
        },
      },
    });
    for (const doc of remove) deleteIds.push(doc._id);
    groupsProcessed += 1;

    if (updateOps.length >= BATCH_SIZE) {
      const [uRes, dRes] = await Promise.all([
        ActivityDaily.bulkWrite(updateOps, { ordered: false }).catch(() => ({ modifiedCount: 0 })),
        deleteIds.length ? ActivityDaily.deleteMany({ _id: { $in: deleteIds } }).catch(() => ({ deletedCount: 0 })) : Promise.resolve({ deletedCount: 0 }),
      ]);
      updatedDocs += Number(uRes?.modifiedCount || 0);
      deletedDocs += Number(dRes?.deletedCount || 0);
      updateOps.length = 0;
      deleteIds.length = 0;
    }
  }

  if (updateOps.length > 0 || deleteIds.length > 0) {
    const [uRes, dRes] = await Promise.all([
      updateOps.length ? ActivityDaily.bulkWrite(updateOps, { ordered: false }).catch(() => ({ modifiedCount: 0 })) : Promise.resolve({ modifiedCount: 0 }),
      deleteIds.length ? ActivityDaily.deleteMany({ _id: { $in: deleteIds } }).catch(() => ({ deletedCount: 0 })) : Promise.resolve({ deletedCount: 0 }),
    ]);
    updatedDocs += Number(uRes?.modifiedCount || 0);
    deletedDocs += Number(dRes?.deletedCount || 0);
  }

  console.log("[activitydailies] compattazione completata. gruppi:", groupsProcessed, "| update:", updatedDocs, "| delete:", deletedDocs);

  try {
    await ActivityDaily.collection.createIndex(
      { guildId: 1, dateKey: 1, userId: 1 },
      { unique: true, name: "guildId_1_dateKey_1_userId_1_unique" },
    );
    console.log("[activitydailies] indice unico assicurato.");
  } catch (err) {
    console.warn("[activitydailies] creazione indice unico fallita:", err?.message || err);
  }

  const { dailyDeleted, hourlyDeleted, retentionDaysDaily, retentionDaysHourly } = await pruneOldActivityData({
    retentionDaysDaily: retentionDaily,
    retentionDaysHourly: retentionHourly,
  });
  console.log("[activity] prune completato. ActivityDaily rimossi:", dailyDeleted, "(retention " + retentionDaysDaily + " gg)");
  console.log("[activity] prune completato. ActivityHourly rimossi:", hourlyDeleted, "(retention " + retentionDaysHourly + " gg)");

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});