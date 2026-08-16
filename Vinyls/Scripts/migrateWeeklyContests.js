/* eslint-disable no-console */
/**
 * Unisce weeklycontestbundles + weeklycontestmetas → weeklycontests.
 * Usage: node Vinyls/Scripts/migrateWeeklyContests.js [--drop-old]
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

function keyOf(doc) {
  return `${String(doc.guildId || "")}::${String(doc.eventKey || "")}`;
}

async function main() {
  loadEnv();
  const dropOld = process.argv.includes("--drop-old");
  const mongoose = require("mongoose");
  const uri = process.env.MONGO_URL_LOCAL || process.env.MONGO_URL;
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const dest = db.collection("weeklycontests");

  const cols = (await db.listCollections().toArray()).map((c) => c.name);
  const bundles = cols.includes("weeklycontestbundles")
    ? await db.collection("weeklycontestbundles").find({}).toArray()
    : [];
  const metas = cols.includes("weeklycontestmetas")
    ? await db.collection("weeklycontestmetas").find({}).toArray()
    : [];

  const map = new Map();
  for (const b of bundles) {
    const k = keyOf(b);
    if (!k.startsWith("::") && !k.endsWith("::")) {
      const { _id, __v, ...rest } = b;
      map.set(k, { ...rest });
    }
  }
  for (const m of metas) {
    const k = keyOf(m);
    if (k.startsWith("::") || k.endsWith("::")) continue;
    const { _id, __v, guildId, eventKey, createdAt, updatedAt, ...metaFields } = m;
    const prev = map.get(k) || { guildId: m.guildId, eventKey: m.eventKey };
    map.set(k, {
      ...prev,
      ...metaFields,
      guildId: prev.guildId || guildId,
      eventKey: prev.eventKey || eventKey,
      createdAt: prev.createdAt || createdAt,
      updatedAt: updatedAt || prev.updatedAt || new Date(),
    });
  }

  let upserted = 0;
  for (const doc of map.values()) {
    await dest.updateOne(
      { guildId: String(doc.guildId), eventKey: String(doc.eventKey) },
      { $set: doc },
      { upsert: true },
    );
    upserted += 1;
  }

  console.log({
    bundles: bundles.length,
    metas: metas.length,
    upserted,
    destCount: await dest.estimatedDocumentCount(),
  });

  if (dropOld) {
    if (cols.includes("weeklycontestbundles")) {
      await db.collection("weeklycontestbundles").drop();
      console.log("dropped weeklycontestbundles");
    }
    if (cols.includes("weeklycontestmetas")) {
      await db.collection("weeklycontestmetas").drop();
      console.log("dropped weeklycontestmetas");
    }
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
