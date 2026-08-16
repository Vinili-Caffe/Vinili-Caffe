/* eslint-disable no-console */
/**
 * Migra stanzauservoicetotals → activityuserprofiles.profile.stanzaVoiceTotalSeconds
 *
 * Usage: node Vinyls/Scripts/migrateStanzaVoiceTotals.js [--drop-old]
 */
const fs = require("fs");
const path = require("path");

function loadEnv() {
  const candidates = ["/opt/bot/.env", path.join(__dirname, "..", "..", ".env")];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[m[1]]) process.env[m[1]] = val;
    }
    break;
  }
}

async function migrateStanzaVoiceTotals(db) {
  const srcName = "stanzauservoicetotals";
  const names = (await db.listCollections({ name: srcName }).toArray()).map((c) => c.name);
  if (!names.includes(srcName)) return { skipped: true, reason: "missing", migrated: 0 };
  const docs = await db.collection(srcName).find({}).toArray();
  let migrated = 0;
  let unchanged = 0;
  for (const doc of docs) {
    const guildId = String(doc.guildId || "").trim();
    const userId = String(doc.userId || "").trim();
    const totalSeconds = Math.max(0, Math.floor(Number(doc.totalSeconds) || 0));
    if (!guildId || !userId || totalSeconds <= 0) continue;
    const existing = await db.collection("activityuserprofiles").findOne(
      { guildId, userId },
      { projection: { "profile.stanzaVoiceTotalSeconds": 1 } },
    );
    const have = Math.max(0, Math.floor(Number(existing?.profile?.stanzaVoiceTotalSeconds) || 0));
    const next = Math.max(have, totalSeconds);
    if (next === have && existing) {
      unchanged += 1;
      continue;
    }
    await db.collection("activityuserprofiles").updateOne(
      { guildId, userId },
      {
        $set: {
          guildId,
          userId,
          "profile.stanzaVoiceTotalSeconds": next,
        },
      },
      { upsert: true },
    );
    migrated += 1;
  }
  return { sourceCount: docs.length, migrated, unchanged };
}

async function main() {
  loadEnv();
  const dropOld = process.argv.includes("--drop-old");
  const mongoUrl =
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGO_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URI;
  if (!mongoUrl) {
    console.error("Missing MONGO_URL_LOCAL / MONGO_URL");
    process.exit(1);
  }
  const mongoose = require("mongoose");
  await mongoose.connect(mongoUrl);
  const db = mongoose.connection.db;
  console.log("DB:", db.databaseName);
  const result = await migrateStanzaVoiceTotals(db);
  console.log("stanzauservoicetotals → activityuserprofiles.profile.stanzaVoiceTotalSeconds:", result);
  if (dropOld && !result.skipped) {
    await db.collection("stanzauservoicetotals").drop().catch((e) => {
      console.warn("drop failed:", e?.message || e);
    });
    console.log("Dropped stanzauservoicetotals");
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
