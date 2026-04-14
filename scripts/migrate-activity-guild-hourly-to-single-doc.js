/**
 * Migra activityguildhourlys dal formato legacy (un documento per ora: guildId + hourKey + users)
 * al formato compatto: un documento per guild con `hours.{hourKey}.users.{userId}`.
 *
 * Consigliato con il bot fermo per evitare race con bumpHourly*.
 *
 * Uso (da root DiscordBot-1, .env con MONGO_*):
 *   node scripts/migrate-activity-guild-hourly-to-single-doc.js --dry-run [guildId]
 *   node scripts/migrate-activity-guild-hourly-to-single-doc.js --yes [guildId]
 */

const path = require("path");
const mongoose = require("mongoose");
const { loadEnvFiles } = require("../shared/runtime/fsRuntime");

const ROOT = path.join(__dirname, "..");
loadEnvFiles(ROOT);
loadEnvFiles(path.join(ROOT, "Vinyls"));

const COLLECTION = "activityguildhourlys";

function mongoUrlFromEnv() {
  return (
    process.env.MONGO_URL ||
    process.env.MONGODB_URI ||
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGODB_URI_LOCAL ||
    ""
  ).trim();
}

function mergeChMaps(a, b) {
  const o = { ...(a || {}) };
  for (const [k, v] of Object.entries(b || {})) {
    const n = Math.max(0, Math.floor(Number(v || 0)));
    if (!k || !n) continue;
    const key = String(k);
    o[key] = (Number(o[key]) || 0) + n;
  }
  return o;
}

function mergeUserPacks(t, s) {
  return {
    text: (Number(t?.text) || 0) + (Number(s?.text) || 0),
    voice: (Number(t?.voice) || 0) + (Number(s?.voice) || 0),
    textCh: mergeChMaps(t?.textCh, s?.textCh),
    voiceCh: mergeChMaps(t?.voiceCh, s?.voiceCh),
  };
}

function mergeHoursInto(target, from) {
  const src = from && typeof from === "object" && !Array.isArray(from) ? from : {};
  for (const [hk, block] of Object.entries(src)) {
    if (!hk) continue;
    if (!target[hk]) target[hk] = { users: {} };
    const bag = target[hk].users;
    const users = block?.users && typeof block.users === "object" && !Array.isArray(block.users) ? block.users : {};
    for (const [uid, pack] of Object.entries(users)) {
      if (!uid) continue;
      bag[uid] = mergeUserPacks(bag[uid] || {}, pack && typeof pack === "object" ? pack : {});
    }
  }
}

function mergeLegacyShardInto(target, doc) {
  const hk = String(doc?.hourKey || "").trim();
  if (!hk) return;
  if (!target[hk]) target[hk] = { users: {} };
  const bag = target[hk].users;
  const users = doc?.users && typeof doc.users === "object" && !Array.isArray(doc.users) ? doc.users : {};
  for (const [uid, pack] of Object.entries(users)) {
    if (!uid) continue;
    bag[uid] = mergeUserPacks(bag[uid] || {}, pack && typeof pack === "object" ? pack : {});
  }
}

function isLegacyShard(doc) {
  return typeof doc?.hourKey === "string" && String(doc.hourKey).trim() !== "";
}

async function dropOldCompoundIndexIfAny(coll) {
  const indexes = await coll.indexes().catch(() => []);
  for (const idx of indexes) {
    const name = String(idx?.name || "");
    if (name === "_id_") continue;
    const keys = idx?.key && typeof idx.key === "object" ? idx.key : {};
    const keyNames = Object.keys(keys);
    if (keyNames.includes("guildId") && keyNames.includes("hourKey")) {
      await coll.dropIndex(name).catch((e) => {
        console.warn(`dropIndex ${name}:`, e?.message || e);
      });
    }
  }
}

async function ensureGuildUniqueIndex(coll) {
  await coll.createIndex({ guildId: 1 }, { unique: true, name: "activityGuildHourly_guildId_unique" }).catch((e) => {
    console.warn("createIndex guildId:", e?.message || e);
  });
}

async function migrateGuild(coll, gid, dry) {
  const g = String(gid || "").trim();
  if (!g) return { guildId: g, skipped: true };
  const all = await coll.find({ guildId: g }).toArray();
  if (!all.length) return { guildId: g, skipped: true, reason: "nessun documento" };

  const merged = {};
  let legacyCount = 0;
  let rollupCount = 0;
  for (const doc of all) {
    if (isLegacyShard(doc)) {
      legacyCount += 1;
      mergeLegacyShardInto(merged, doc);
    } else {
      rollupCount += 1;
      mergeHoursInto(merged, doc.hours || {});
    }
  }

  const hourKeys = Object.keys(merged);
  if (dry) {
    return { guildId: g, dry: true, legacyShards: legacyCount, rollupDocs: rollupCount, hourBuckets: hourKeys.length };
  }

  await coll.deleteMany({ guildId: g });
  if (hourKeys.length) {
    const now = new Date();
    await coll.insertOne({ guildId: g, hours: merged, createdAt: now, updatedAt: now });
  }
  return { guildId: g, legacyShards: legacyCount, rollupDocs: rollupCount, hourBuckets: hourKeys.length, written: hourKeys.length > 0 };
}

async function main() {
  const dry = process.argv.includes("--dry-run");
  const yes = process.argv.includes("--yes");
  const guildArg = process.argv.map(String).find((a) => /^\d{17,22}$/.test(a.trim())) || "";
  const guildFilter = guildArg.trim() || null;

  if (!dry && !yes) {
    console.error("Specifica --dry-run (anteprima) oppure --yes (esegui migrazione).");
    process.exit(1);
  }

  const url = mongoUrlFromEnv();
  if (!url) {
    console.error("Imposta MONGO_URL o MONGODB_URI.");
    process.exit(1);
  }

  mongoose.set("strictQuery", false);
  await mongoose.connect(url);
  const coll = mongoose.connection.collection(COLLECTION);

  const filter = guildFilter ? { guildId: guildFilter } : {};
  const guildIds = await coll.distinct("guildId", filter);
  const sorted = [...guildIds].map(String).filter(Boolean).sort();

  let totalLegacy = 0;
  let totalRollup = 0;
  for (const gid of sorted) {
    const r = await migrateGuild(coll, gid, dry);
    if (r.skipped) continue;
    if (dry) {
      totalLegacy += r.legacyShards || 0;
      totalRollup += r.rollupDocs || 0;
      console.log(
        `[dry-run] guild ${r.guildId}: legacyShards=${r.legacyShards} rollupDocs=${r.rollupDocs} hourBuckets=${r.hourBuckets}`,
      );
    } else {
      totalLegacy += r.legacyShards || 0;
      totalRollup += r.rollupDocs || 0;
      console.log(
        `[ok] guild ${r.guildId}: rimossi legacyShards=${r.legacyShards} rollupDocs=${r.rollupDocs} -> hourBuckets=${r.hourBuckets} written=${Boolean(r.written)}`,
      );
    }
  }

  if (!dry) {
    await dropOldCompoundIndexIfAny(coll);
    await ensureGuildUniqueIndex(coll);
  }

  console.log(
    dry
      ? `Dry-run: ${sorted.length} guild, legacy shards total ~${totalLegacy}, rollup docs total ~${totalRollup}. Nessuna scrittura.`
      : `Migrazione completata per ${sorted.length} guild. Indice unico su guildId ricreato dove possibile.`,
  );

  await mongoose.disconnect().catch(() => null);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});