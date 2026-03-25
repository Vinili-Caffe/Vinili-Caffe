/**
 * Migra i documenti dalla collection MongoDB `staffs` al campo embedded `staff`
 * su `activityuserprofiles` (stesso guildId + userId).
 *
 * Uso (dalla root del workspace):
 *   node scripts/migrate-staff-into-activityprofile.js --dry-run
 *   node scripts/migrate-staff-into-activityprofile.js
 *   node scripts/migrate-staff-into-activityprofile.js --drop-staff-collection
 *
 * Richiede MONGODB_URI nel .env (o variabile d'ambiente).
 */
const fs = require("fs");
const path = require("path");
const { createRequire } = require("module");

const root = path.join(__dirname, "..");

function requireFromBotWorkspace(name) {
  const vinylsPkg = path.join(root, "Vinyls", "package.json");
  const rootPkg = path.join(root, "package.json");
  const anchor = fs.existsSync(vinylsPkg) ? vinylsPkg : rootPkg;
  if (!fs.existsSync(anchor)) {
    return require(name);
  }
  return createRequire(anchor)(name);
}

let mongoose;
try {
  mongoose = requireFromBotWorkspace("mongoose");
} catch (err) {
  console.error(
    "Impossibile caricare mongoose. Esegui `npm install` nella root del bot o in Vinyls (mongoose è una dipendenza di Vinyls).",
  );
  throw err;
}

try {
  requireFromBotWorkspace("dotenv").config({ path: path.join(root, ".env") });
} catch (_) {
  /* .env opzionale se MONGODB_URI è già nell'ambiente */
}

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error("Manca MONGODB_URI (o MONGO_URI) nel .env.");
    process.exit(1);
  }
  const dry = process.argv.includes("--dry-run");
  const dropStaff = process.argv.includes("--drop-staff-collection");

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const staffColl = db.collection("staffs");
  const profileColl = db.collection("activityuserprofiles");

  const total = await staffColl.countDocuments().catch(() => 0);
  let migrated = 0;
  let skipped = 0;

  const cursor = staffColl.find({});
  for await (const doc of cursor) {
    const gid = String(doc.guildId || "").trim();
    const uid = String(doc.userId || "").trim();
    if (!gid || !uid) {
      skipped += 1;
      continue;
    }
    const { _id, __v, guildId, userId, ...rest } = doc;
    if (dry) {
      migrated += 1;
      continue;
    }
    await profileColl.updateOne(
      { guildId: gid, userId: uid },
      { $set: { staff: rest }, $setOnInsert: { guildId: gid, userId: uid } },
      { upsert: true },
    );
    migrated += 1;
  }

  if (dry) {
    console.log(`[DRY-RUN] Documenti in staffs: ${total}. Sarebbero migrati: ${migrated}, saltati (senza guildId/userId): ${skipped}`);
  } else {
    console.log(`Migrati ${migrated} documenti da staffs → activityuserprofiles.staff (saltati: ${skipped}, totale in staffs: ${total})`);
  }

  if (!dry && dropStaff && total > 0) {
    await staffColl.drop();
    console.log("Collection staffs eliminata.");
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});