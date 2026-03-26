/**
 * Migrazione one-shot:
 * - da `levelHistory` (legacy root)
 * - a  `exp.levelHistory` (nuovo path canonico)
 *
 * Uso:
 *   node scripts/migrate-level-history-into-exp.js
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
const { ActivityUserProfile, LEVEL_HISTORY_MAX_ENTRIES } = require(path.join(
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

function normalizeEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  return {
    actorId: entry.actorId != null ? String(entry.actorId) : null,
    action: String(entry.action || "update"),
    beforeExp: Number(entry.beforeExp || 0),
    afterExp: Number(entry.afterExp || 0),
    beforeLevel: Number(entry.beforeLevel || 0),
    afterLevel: Number(entry.afterLevel || 0),
    deltaExp: Number(entry.deltaExp || 0),
    note: entry.note != null ? String(entry.note).slice(0, 500) : null,
    createdAt: entry.createdAt ? new Date(entry.createdAt) : new Date(),
  };
}

function normalizeList(value) {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeEntry).filter(Boolean);
}

async function main() {
  const url = resolveMongoUrl();
  if (!url) {
    console.error("Nessun URL MongoDB in .env (MONGO_URL / MONGODB_URI / *_LOCAL).");
    process.exit(1);
  }

  await mongoose.connect(url);

  const cap = Math.max(
    50,
    Math.min(500, Number(process.env.LEVEL_HISTORY_MAX_ENTRIES) || LEVEL_HISTORY_MAX_ENTRIES || 150),
  );
  const collection = ActivityUserProfile.collection;
  const cursor = collection.find(
    {
      $or: [
        { levelHistory: { $exists: true } },
        { levelHystory: { $exists: true } },
      ],
    },
    {
      _id: 1,
      levelHistory: 1,
      levelHystory: 1,
      "exp.levelHistory": 1,
    },
  );

  const ops = [];
  let scanned = 0;
  let migrated = 0;

  for await (const doc of cursor) {
    scanned += 1;
    const current = normalizeList(doc?.exp?.levelHistory);
    const legacy = normalizeList(doc?.levelHistory);
    const typoLegacy = normalizeList(doc?.levelHystory);

    const target = current.length
      ? current.slice(0, cap)
      : [...legacy, ...typoLegacy].slice(0, cap);

    ops.push({
      updateOne: {
        filter: { _id: doc._id },
        update: {
          $set: { "exp.levelHistory": target },
          $unset: { levelHistory: "", levelHystory: "" },
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
    `[migrate-level-history] scanned=${scanned} migrated=${migrated} (legacy fields rimossi).`,
  );

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});