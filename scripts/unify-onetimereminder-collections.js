/**
 * Unifica le collection OneTimeReminder legacy/compact lasciando una sola compact:
 * - target: onetimereminderusers
 * - merge da: onetimereminderuser, onetimereminderusers, onetimereminder, onetimereminders
 * - cleanup: drop delle collection duplicate legacy/singolari
 *
 * Uso:
 *   node scripts/unify-onetimereminder-collections.js --dry-run
 *   node scripts/unify-onetimereminder-collections.js
 *   node scripts/unify-onetimereminder-collections.js --atlas
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const mongoose = require("mongoose");

const TARGET = "onetimereminderusers";
const SOURCES_COMPACT = ["onetimereminderuser", "onetimereminderusers"];
const SOURCES_LEGACY = ["onetimereminder", "onetimereminders"];

function resolveMongoUrl() {
  if (process.argv.includes("--atlas")) return process.env.MONGO_URL || process.env.MONGODB_URI;
  return (
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGODB_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URI
  );
}

function normalizeDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function pushEntry(byUser, userId, entry) {
  const uid = String(userId || "").trim();
  if (!uid) return;
  if (!byUser.has(uid)) byUser.set(uid, []);
  byUser.get(uid).push(entry);
}

function dedupeEntries(entries) {
  const map = new Map();
  for (const e of entries) {
    const k = `${String(e.key || "")}::${new Date(e.sendAt).toISOString()}`;
    const prev = map.get(k);
    if (!prev) {
      map.set(k, e);
      continue;
    }
    const prevSent = prev.sentAt ? new Date(prev.sentAt).getTime() : 0;
    const curSent = e.sentAt ? new Date(e.sentAt).getTime() : 0;
    if (curSent > prevSent) map.set(k, e);
  }
  return Array.from(map.values()).sort((a, b) => new Date(a.sendAt).getTime() - new Date(b.sendAt).getTime());
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const mongoUrl = resolveMongoUrl();
  if (!mongoUrl) throw new Error("Mongo URL mancante");

  await mongoose.connect(mongoUrl, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000 });
  const db = mongoose.connection.db;
  const existingCols = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => String(c.name || "")));

  const byUser = new Map();
  let sourceCompactDocs = 0;
  let sourceLegacyDocs = 0;

  for (const colName of SOURCES_COMPACT) {
    if (!existingCols.has(colName)) continue;
    const rows = await db.collection(colName).find({}).toArray();
    sourceCompactDocs += rows.length;
    for (const row of rows) {
      const userId = String(row?.userId || "").trim();
      const entries = Array.isArray(row?.entries) ? row.entries : [];
      for (const en of entries) {
        const key = String(en?.key || "").trim();
        const message = String(en?.message || "").trim();
        const sendAt = normalizeDate(en?.sendAt);
        if (!key || !message || !sendAt) continue;
        pushEntry(byUser, userId, {
          key,
          message,
          sendAt,
          sentAt: normalizeDate(en?.sentAt),
          createdAt: normalizeDate(en?.createdAt) || new Date(),
        });
      }
    }
  }

  for (const colName of SOURCES_LEGACY) {
    if (!existingCols.has(colName)) continue;
    const rows = await db.collection(colName).find({}).toArray();
    sourceLegacyDocs += rows.length;
    for (const row of rows) {
      const userId = String(row?.userId || "").trim();
      const key = String(row?.key || "").trim();
      const message = String(row?.message || "").trim();
      const sendAt = normalizeDate(row?.sendAt);
      if (!userId || !key || !message || !sendAt) continue;
      pushEntry(byUser, userId, {
        key,
        message,
        sendAt,
        sentAt: normalizeDate(row?.sentAt),
        createdAt: normalizeDate(row?.createdAt) || new Date(),
      });
    }
  }

  let mergedUsers = 0;
  let mergedEntries = 0;
  let upsertedUsers = 0;
  if (!dryRun) {
    await db.collection(TARGET).deleteMany({});
  }

  for (const [userId, entries] of byUser.entries()) {
    const deduped = dedupeEntries(entries);
    if (!deduped.length) continue;
    mergedUsers += 1;
    mergedEntries += deduped.length;
    if (!dryRun) {
      await db.collection(TARGET).updateOne(
        { userId: String(userId) },
        {
          $setOnInsert: { userId: String(userId) },
          $set: { entries: deduped, updatedAt: new Date() },
        },
        { upsert: true },
      );
      upsertedUsers += 1;
    }
  }

  const dropped = [];
  if (!dryRun) {
    for (const colName of [...SOURCES_COMPACT, ...SOURCES_LEGACY]) {
      if (colName === TARGET) continue;
      if (!existingCols.has(colName)) continue;
      await db.dropCollection(colName).catch(() => null);
      dropped.push(colName);
    }
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        target: TARGET,
        sourceCompactDocs,
        sourceLegacyDocs,
        mergedUsers,
        mergedEntries,
        upsertedUsers,
        droppedCollections: dropped,
      },
      null,
      2,
    ),
  );

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});