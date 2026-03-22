/**
 * Migra la collezione `mod_case_users` in `activityuserprofiles.moderation.modCases`.
 * Upsert su (guildId, userId): crea il profilo se non esiste.
 * Unisce per `caseId` se il profilo ha già `moderation.modCases` (mantiene la copia con updatedAt più recente).
 *
 *   node scripts/migrate-mod-case-users-into-activityuserprofiles.js
 *   node scripts/migrate-mod-case-users-into-activityuserprofiles.js --apply
 *   node scripts/migrate-mod-case-users-into-activityuserprofiles.js --apply --drop-legacy-collection
 *
 * Richiede .env: MONGO_URL_LOCAL | MONGODB_URI_LOCAL | MONGO_URL | MONGODB_URI
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const mongoose = require("mongoose");
const { ActivityUserProfile } = require("../Vinyls/Schemas/Community/communitySchemas");
const { MOD_CASES_PATH } = require("../Vinyls/Utils/Community/activityUserProfilePaths");

const MONGO_URL =
  process.env.MONGO_URL_LOCAL ||
  process.env.MONGODB_URI_LOCAL ||
  process.env.MONGO_URL ||
  process.env.MONGODB_URI;

function legacyModCaseUsersCollectionName() {
  const raw = process.env.MOD_CASE_USER_COLLECTION ? String(process.env.MOD_CASE_USER_COLLECTION).trim() : "";
  if (!raw || raw === "mod_case_user") return "mod_case_users";
  return raw;
}
const LEGACY_COLLECTION = legacyModCaseUsersCollectionName();

function argHas(flag) {
  return process.argv.includes(flag);
}

function toId(v) {
  if (v == null) return "";
  if (typeof v === "object" && v != null && typeof v.toString === "function") {
    return String(v.toString()).trim();
  }
  return String(v).trim();
}

function ts(c) {
  const u = c?.updatedAt || c?.createdAt;
  if (!u) return 0;
  const t = new Date(u).getTime();
  return Number.isFinite(t) ? t : 0;
}

function mergeCases(existingArr, incomingArr) {
  const map = new Map();
  for (const c of existingArr || []) {
    const id = Number(c?.caseId);
    if (!Number.isFinite(id)) continue;
    map.set(id, c);
  }
  for (const c of incomingArr || []) {
    const id = Number(c?.caseId);
    if (!Number.isFinite(id)) continue;
    const prev = map.get(id);
    if (!prev) {
      map.set(id, c);
      continue;
    }
    if (ts(c) >= ts(prev)) map.set(id, c);
  }
  return Array.from(map.values()).sort((a, b) => {
    const ca = ts(a);
    const cb = ts(b);
    if (cb !== ca) return cb - ca;
    return Number(b.caseId || 0) - Number(a.caseId || 0);
  });
}

async function main() {
  const apply = argHas("--apply");
  const dropLegacy = argHas("--drop-legacy-collection");

  if (!MONGO_URL) {
    console.error("Missing MONGO_URL_LOCAL|MONGODB_URI_LOCAL|MONGO_URL|MONGODB_URI in .env");
    process.exit(1);
  }

  await mongoose.connect(MONGO_URL);
  const db = mongoose.connection.db;

  const exists = await db.listCollections({ name: LEGACY_COLLECTION }).toArray();
  if (!exists.length) {
    console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", skipped: true, reason: "collection_missing", name: LEGACY_COLLECTION }, null, 2));
    await mongoose.disconnect();
    return;
  }

  const coll = db.collection(LEGACY_COLLECTION);
  const rows = await coll.find({}).toArray();
  let processed = 0;
  let merged = 0;

  for (const doc of rows) {
    const guildId = toId(doc.guildId);
    const userId = toId(doc.userId);
    const incoming = Array.isArray(doc.cases) ? doc.cases : [];
    if (!guildId || !userId) continue;
    processed += 1;
    if (!apply) continue;

    const cur = await ActivityUserProfile.findOne({ guildId, userId }).select(MOD_CASES_PATH).lean().catch(() => null);
    const existing = cur?.moderation?.modCases;
    let next = incoming;
    if (Array.isArray(existing) && existing.length) {
      next = mergeCases(existing, incoming);
      merged += 1;
    }

    await ActivityUserProfile.updateOne(
      { guildId, userId },
      { $set: { [`${MOD_CASES_PATH}`]: next } },
      { upsert: true, setDefaultsOnInsert: true },
    ).catch(() => null);
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        legacyCollection: LEGACY_COLLECTION,
        legacyRows: rows.length,
        processed,
        profilesWithMerge: merged,
      },
      null,
      2,
    ),
  );

  if (apply && dropLegacy) {
    await db.dropCollection(LEGACY_COLLECTION);
    console.log("Dropped collection:", LEGACY_COLLECTION);
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});