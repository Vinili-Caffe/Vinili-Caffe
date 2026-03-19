/**
 * Unifica le collection role persist in una sola:
 * - target: rolepersistusers
 * - merge da: role_persist, role_persists, rolepersistuser, rolepersistusers
 * - cleanup: drop delle collection duplicate/singolari
 *
 * Uso:
 *   node scripts/unify-rolepersist-collections.js --dry-run
 *   node scripts/unify-rolepersist-collections.js
 *   node scripts/unify-rolepersist-collections.js --atlas
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const mongoose = require("mongoose");

const TARGET = "rolepersistusers";
const SOURCES = ["role_persist", "role_persists", "rolepersistuser", "rolepersistusers"];

function resolveMongoUrl() {
  if (process.argv.includes("--atlas")) return process.env.MONGO_URL || process.env.MONGODB_URI;
  return (
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGODB_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URI
  );
}

function normalizeRoleEntry(raw) {
  const roleId = String(raw?.roleId || "").trim();
  if (!roleId) return null;
  return {
    roleId,
    setBy: raw?.setBy ? String(raw.setBy) : null,
    reason: raw?.reason ? String(raw.reason) : "Nessun motivo fornito",
  };
}

function mergeRoles(rows) {
  const byRole = new Map();
  for (const r of rows) {
    const e = normalizeRoleEntry(r);
    if (!e) continue;
    if (!byRole.has(e.roleId)) byRole.set(e.roleId, e);
  }
  return Array.from(byRole.values());
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const mongoUrl = resolveMongoUrl();
  if (!mongoUrl) throw new Error("Mongo URL mancante");

  await mongoose.connect(mongoUrl, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000 });
  const db = mongoose.connection.db;

  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => String(c.name || "")));
  const activeSources = SOURCES.filter((s) => existing.has(s));
  const byUser = new Map();
  const countsBySource = {};

  for (const src of activeSources) {
    const docs = await db.collection(src).find({}).toArray();
    countsBySource[src] = docs.length;
    for (const doc of docs) {
      const guildId = String(doc?.guildId || "").trim();
      const userId = String(doc?.userId || "").trim();
      if (!guildId || !userId) continue;
      const key = `${guildId}\t${userId}`;
      if (!byUser.has(key)) byUser.set(key, []);

      if (Array.isArray(doc?.roles)) {
        byUser.get(key).push(...doc.roles);
      } else if (doc?.roleId) {
        byUser.get(key).push({
          roleId: doc.roleId,
          setBy: doc.setBy || null,
          reason: doc.reason || "Nessun motivo fornito",
        });
      }
    }
  }

  let upserts = 0;
  if (!dryRun) {
    await db.collection(TARGET).deleteMany({});
  }

  for (const [key, rolesRaw] of byUser.entries()) {
    const [guildId, userId] = key.split("\t");
    const roles = mergeRoles(rolesRaw);
    if (!roles.length) continue;
    if (!dryRun) {
      await db.collection(TARGET).updateOne(
        { guildId, userId },
        {
          $setOnInsert: { guildId, userId },
          $set: { roles, updatedAt: new Date() },
        },
        { upsert: true },
      );
    }
    upserts += 1;
  }

  const dropped = [];
  if (!dryRun) {
    for (const src of activeSources) {
      if (src === TARGET) continue;
      await db.dropCollection(src).catch(() => null);
      dropped.push(src);
    }
  }

  const targetCount = await db.collection(TARGET).countDocuments({}).catch(() => 0);
  console.log(
    JSON.stringify(
      {
        dryRun,
        target: TARGET,
        countsBySource,
        mergedUsers: upserts,
        targetCount,
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