/**
 * Migra in `activityuserprofiles` (ActivityUserProfile):
 * - `voicedisconnectcounters` → `totals.voiceDisconnectCount` (merge con max)
 * - `voicesessions` → `totals.sessionStartedAt` / `totals.sessionChannelId` (merge: data più recente)
 * - `voicestats` → campi numerici in `totals` (voiceTotalSeconds, voiceDailySeconds, … merge con max)
 *
 * Le collection legacy non vengono eliminate salvo --drop-legacy-collections (solo con --apply).
 *
 * Uso:
 *   node scripts/migrate-voice-legacy-into-activityuserprofiles.js
 *   node scripts/migrate-voice-legacy-into-activityuserprofiles.js --apply
 *   node scripts/migrate-voice-legacy-into-activityuserprofiles.js --apply --drop-legacy-collections
 *
 * Richiede .env: MONGO_URL_LOCAL | MONGODB_URI_LOCAL | MONGO_URL | MONGODB_URI
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const mongoose = require("mongoose");
const { isValidGuildUserId, isValidGuildUserIdChannelId } = require("../Vinyls/Utils/DB/validateWriteIds");
const { ActivityUserProfile } = require("../Vinyls/Schemas/Community/communitySchemas");
const { totals } = require("../Vinyls/Utils/Community/activityUserProfilePaths");

const MONGO_URL =
  process.env.MONGO_URL_LOCAL ||
  process.env.MONGODB_URI_LOCAL ||
  process.env.MONGO_URL ||
  process.env.MONGODB_URI;

const LEGACY_DISCONNECT = "voicedisconnectcounters";
const LEGACY_SESSIONS = "voicesessions";
const LEGACY_STATS = "voicestats";
const TARGET_COLL = "activityuserprofiles";

const TOTAL_NUM_KEYS = [
  "voiceTotalSeconds",
  "voiceDailySeconds",
  "voiceWeeklySeconds",
  "expAwardedSeconds",
  "voiceActivityBucketFlushSeconds",
];

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

function pickString(doc, keys) {
  for (const k of keys) {
    const v = k.includes(".") ? k.split(".").reduce((o, p) => (o == null ? null : o[p]), doc) : doc[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function pickDate(doc, keys) {
  for (const k of keys) {
    const v = k.includes(".") ? k.split(".").reduce((o, p) => (o == null ? null : o[p]), doc) : doc[k];
    if (v == null) continue;
    const d = v instanceof Date ? v : new Date(v);
    if (Number.isFinite(d.getTime())) return d;
  }
  return null;
}

function numMax(a, b) {
  const x = Number(a);
  const y = Number(b);
  const nx = Number.isFinite(x) ? x : 0;
  const ny = Number.isFinite(y) ? y : 0;
  return Math.max(nx, ny);
}

function extractGuildUser(doc) {
  const g = toId(doc.guildId ?? doc.guildID ?? doc.GuildID);
  const u = toId(doc.userId ?? doc.userID ?? doc.UserID);
  return { g, u };
}

function flattenTotalsLike(obj) {
  if (!obj || typeof obj !== "object") return {};
  const out = {};
  for (const k of TOTAL_NUM_KEYS) {
    if (obj[k] != null && Number.isFinite(Number(obj[k]))) out[k] = Number(obj[k]);
  }
  return out;
}

async function migrateDisconnectCounters(db, apply) {
  const coll = db.collection(LEGACY_DISCONNECT);
  const names = await db.listCollections({ name: LEGACY_DISCONNECT }).toArray();
  if (!names.length) {
    return { skipped: true, reason: "collection_missing", processed: 0 };
  }
  const rows = await coll.find({}).toArray();
  let processed = 0;
  let skipped = 0;
  for (const doc of rows) {
    const g = toId(doc.guildId);
    const u = toId(doc.userId);
    const count = Number(doc.count || 0);
    if (!isValidGuildUserId(g, u)) {
      skipped += 1;
      continue;
    }
    processed += 1;
    if (!apply) continue;
    await db.collection(TARGET_COLL).updateOne(
      { guildId: g, userId: u },
      [
        {
          $set: {
            guildId: { $literal: g },
            userId: { $literal: u },
            [totals("voiceDisconnectCount")]: {
              $max: [
                { $toDouble: { $ifNull: ["$" + totals("voiceDisconnectCount"), 0] } },
                { $literal: count },
              ],
            },
          },
        },
      ],
      { upsert: true },
    );
  }
  return { skipped: false, processed, skippedInvalid: skipped, legacyRows: rows.length };
}

async function migrateVoiceSessions(db, apply) {
  const coll = db.collection(LEGACY_SESSIONS);
  const names = await db.listCollections({ name: LEGACY_SESSIONS }).toArray();
  if (!names.length) {
    return { skipped: true, reason: "collection_missing", processed: 0 };
  }
  const rows = await coll.find({}).toArray();
  let processed = 0;
  let skipped = 0;
  for (const doc of rows) {
    let { g, u } = extractGuildUser(doc);
    let started = pickDate(doc, [
      "sessionStartedAt",
      "startedAt",
      "joinedAt",
      "voice.sessionStartedAt",
    ]);
    let channel = pickString(doc, [
      "sessionChannelId",
      "channelId",
      "voiceChannelId",
      "voice.sessionChannelId",
    ]);
    if (Array.isArray(doc.sessions) && doc.sessions.length) {
      const last = doc.sessions[doc.sessions.length - 1];
      if (last && typeof last === "object") {
        const sg = toId(last.guildId ?? g);
        const su = toId(last.userId ?? u);
        if (sg && su) {
          g = sg;
          u = su;
        }
        const sStarted = pickDate(last, ["sessionStartedAt", "startedAt", "joinedAt"]);
        const sCh = pickString(last, ["sessionChannelId", "channelId"]);
        if (sStarted) started = sStarted;
        if (sCh) channel = sCh;
      }
    }
    if (!isValidGuildUserId(g, u)) {
      skipped += 1;
      continue;
    }
    if (!started) {
      skipped += 1;
      continue;
    }
    processed += 1;
    if (!apply) continue;
    const cur = await ActivityUserProfile.findOne({ guildId: g, userId: u })
      .select("totals.sessionStartedAt totals.sessionChannelId")
      .lean()
      .catch(() => null);
    const curStart = cur?.totals?.sessionStartedAt ? new Date(cur.totals.sessionStartedAt).getTime() : 0;
    const nextStart = started.getTime();
    if (curStart && nextStart <= curStart) continue;
    const setDoc = { "totals.sessionStartedAt": started };
    if (channel && isValidGuildUserIdChannelId(g, u, channel)) {
      setDoc["totals.sessionChannelId"] = channel;
    }
    await ActivityUserProfile.findOneAndUpdate(
      { guildId: g, userId: u },
      { $set: setDoc },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).catch(() => null);
  }
  return { skipped: false, processed, skippedInvalid: skipped, legacyRows: rows.length };
}

async function migrateVoiceStats(db, apply) {
  const coll = db.collection(LEGACY_STATS);
  const names = await db.listCollections({ name: LEGACY_STATS }).toArray();
  if (!names.length) {
    return { skipped: true, reason: "collection_missing", processed: 0 };
  }
  const rows = await coll.find({}).toArray();
  let processed = 0;
  let skipped = 0;
  for (const doc of rows) {
    const { g, u } = extractGuildUser(doc);
    if (!isValidGuildUserId(g, u)) {
      skipped += 1;
      continue;
    }
    const flat = { ...flattenTotalsLike(doc), ...flattenTotalsLike(doc.totals) };
    if (!Object.keys(flat).length) {
      skipped += 1;
      continue;
    }
    processed += 1;
    if (!apply) continue;
    const cur = await ActivityUserProfile.findOne({ guildId: g, userId: u })
      .select("totals")
      .lean()
      .catch(() => null);
    const setDoc = {};
    for (const k of TOTAL_NUM_KEYS) {
      if (flat[k] == null) continue;
      const merged = numMax(cur?.totals?.[k], flat[k]);
      setDoc[`totals.${k}`] = merged;
    }
    if (!Object.keys(setDoc).length) continue;
    await ActivityUserProfile.findOneAndUpdate(
      { guildId: g, userId: u },
      { $set: setDoc },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).catch(() => null);
  }
  return { skipped: false, processed, skippedInvalid: skipped, legacyRows: rows.length };
}

async function main() {
  const apply = argHas("--apply");
  const dropLegacy = argHas("--drop-legacy-collections");

  if (!MONGO_URL) {
    console.error("Missing MONGO_URL_LOCAL|MONGODB_URI_LOCAL|MONGO_URL|MONGODB_URI in .env");
    process.exit(1);
  }

  await mongoose.connect(MONGO_URL);
  const db = mongoose.connection.db;

  const r1 = await migrateDisconnectCounters(db, apply);
  const r2 = await migrateVoiceSessions(db, apply);
  const r3 = await migrateVoiceStats(db, apply);

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        disconnect: r1,
        sessions: r2,
        stats: r3,
      },
      null,
      2,
    ),
  );

  if (apply && dropLegacy) {
    for (const name of [LEGACY_DISCONNECT, LEGACY_SESSIONS, LEGACY_STATS]) {
      const exists = await db.listCollections({ name }).toArray();
      if (!exists.length) continue;
      await db.dropCollection(name);
      console.log(`Dropped collection: ${name}`);
    }
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});