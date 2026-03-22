/**
 * Importa in `activityuserprofiles` (ActivityUserProfile):
 * - `automodbadusers` → doc con guildId ACTIVITY_MAIN_GUILD_ID (guild principale) e `moderation.automodBadUser`
 * - `suspiciousaccounts` → `moderation.joinGateSuspicious` sul doc (guildId + userId)
 * - `sponsormainleaves` → stesso doc principale e `profile.sponsorMainLeave`
 *
 * Uso:
 *   node scripts/migrate-moderation-into-activityuserprofiles.js
 *   node scripts/migrate-moderation-into-activityuserprofiles.js --apply
 *   node scripts/migrate-moderation-into-activityuserprofiles.js --apply --drop-legacy-collections
 *
 * Richiede .env: MONGO_URL_LOCAL | MONGODB_URI_LOCAL | MONGO_URL | MONGODB_URI
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const mongoose = require("mongoose");
const { ActivityUserProfile, ACTIVITY_MAIN_GUILD_ID } = require("../Vinyls/Schemas/Community/communitySchemas");
const { automodBadUser, joinGateSuspicious, sponsorMainLeave } = require("../Vinyls/Utils/Community/activityUserProfilePaths");

const MONGO_URL =
  process.env.MONGO_URL_LOCAL ||
  process.env.MONGODB_URI_LOCAL ||
  process.env.MONGO_URL ||
  process.env.MONGODB_URI;

const LEGACY_AUTOMOD = "automodbadusers";
const LEGACY_SUSPICIOUS = "suspiciousaccounts";
const LEGACY_SPONSOR = "sponsormainleaves";

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

function stripLegacyDoc(d) {
  if (!d || typeof d !== "object") return {};
  const { _id, __v, ...rest } = d;
  return rest;
}

async function migrateAutomod(db, apply) {
  const coll = db.collection(LEGACY_AUTOMOD);
  const exists = await db.listCollections({ name: LEGACY_AUTOMOD }).toArray();
  if (!exists.length) return { skipped: true, reason: "collection_missing", processed: 0 };
  const rows = await coll.find({}).toArray();
  let processed = 0;
  for (const doc of rows) {
    const rest = stripLegacyDoc(doc);
    const userId = toId(rest.userId);
    if (!userId) continue;
    processed += 1;
    if (!apply) continue;
    const sub = {
      totalTriggers: Number(rest.totalTriggers || 0),
      warnPoints: Number(rest.warnPoints || 0),
      activeStrikes: Number(rest.activeStrikes || 0),
      timeoutActions: Number(rest.timeoutActions || 0),
      lastTriggerAt: rest.lastTriggerAt || null,
      lastActionAt: rest.lastActionAt || null,
      lastGuildId: rest.lastGuildId != null ? String(rest.lastGuildId) : null,
      lastHeat: Number(rest.lastHeat || 0),
      lastAction: rest.lastAction != null ? String(rest.lastAction) : null,
      activeStrikeReasons: Array.isArray(rest.activeStrikeReasons) ? rest.activeStrikeReasons : [],
      reasons: Array.isArray(rest.reasons) ? rest.reasons : [],
    };
    await ActivityUserProfile.updateOne(
      { guildId: ACTIVITY_MAIN_GUILD_ID, userId },
      { $set: { [automodBadUser()]: sub } },
      { upsert: true, setDefaultsOnInsert: true },
    ).catch(() => null);
  }
  return { skipped: false, processed, legacyRows: rows.length };
}

async function migrateSuspicious(db, apply) {
  const coll = db.collection(LEGACY_SUSPICIOUS);
  const exists = await db.listCollections({ name: LEGACY_SUSPICIOUS }).toArray();
  if (!exists.length) return { skipped: true, reason: "collection_missing", processed: 0 };
  const rows = await coll.find({}).toArray();
  let processed = 0;
  for (const doc of rows) {
    const rest = stripLegacyDoc(doc);
    const guildId = toId(rest.guildId);
    const userId = toId(rest.userId);
    if (!guildId || !userId) continue;
    processed += 1;
    if (!apply) continue;
    const sub = {
      source: rest.source != null ? String(rest.source) : "joingate",
      reason: rest.reason != null ? String(rest.reason) : "",
      markedAt: rest.markedAt || new Date(),
      expiresAt: rest.expiresAt != null ? rest.expiresAt : null,
    };
    await ActivityUserProfile.updateOne(
      { guildId, userId },
      { $set: { [joinGateSuspicious()]: sub } },
      { upsert: true, setDefaultsOnInsert: true },
    ).catch(() => null);
  }
  return { skipped: false, processed, legacyRows: rows.length };
}

async function migrateSponsor(db, apply) {
  const coll = db.collection(LEGACY_SPONSOR);
  const exists = await db.listCollections({ name: LEGACY_SPONSOR }).toArray();
  if (!exists.length) return { skipped: true, reason: "collection_missing", processed: 0 };
  const rows = await coll.find({}).toArray();
  let processed = 0;
  for (const doc of rows) {
    const rest = stripLegacyDoc(doc);
    const userId = toId(rest.userId);
    if (!userId || !rest.leftAt || !rest.kickAt) continue;
    processed += 1;
    if (!apply) continue;
    await ActivityUserProfile.updateOne(
      { guildId: ACTIVITY_MAIN_GUILD_ID, userId },
      {
        $set: {
          [sponsorMainLeave("leftAt")]: rest.leftAt,
          [sponsorMainLeave("kickAt")]: rest.kickAt,
          [sponsorMainLeave("dmSent")]: Boolean(rest.dmSent),
          [sponsorMainLeave("dmFailed")]: Boolean(rest.dmFailed),
        },
      },
      { upsert: true, setDefaultsOnInsert: true },
    ).catch(() => null);
  }
  return { skipped: false, processed, legacyRows: rows.length };
}

async function main() {
  const apply = argHas("--apply");
  const dropLegacy = argHas("--drop-legacy-collections");

  if (!MONGO_URL) {
    console.error("Missing MONGO_URL_LOCAL|MONGODB_URI_LOCAL|MONGO_URL|MONGODB_URI in .env");
    process.exit(1);
  }

  if (!ACTIVITY_MAIN_GUILD_ID || ACTIVITY_MAIN_GUILD_ID === "__global__") {
    console.error(
      "ACTIVITY_MAIN_GUILD_ID mancante o __global__ (usa ids.guilds.main o env ACTIVITY_MAIN_GUILD_ID)",
    );
    process.exit(1);
  }

  await mongoose.connect(MONGO_URL);
  const db = mongoose.connection.db;

  const r1 = await migrateAutomod(db, apply);
  const r2 = await migrateSuspicious(db, apply);
  const r3 = await migrateSponsor(db, apply);

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        automod: r1,
        suspicious: r2,
        sponsor: r3,
      },
      null,
      2,
    ),
  );

  if (apply && dropLegacy) {
    for (const name of [LEGACY_AUTOMOD, LEGACY_SUSPICIOUS, LEGACY_SPONSOR]) {
      const ex = await db.listCollections({ name }).toArray();
      if (!ex.length) continue;
      await db.dropCollection(name);
      console.log("Dropped collection:", name);
    }
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});