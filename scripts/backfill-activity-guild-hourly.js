/**
 * Scrive in activityguildhourlys (un documento per guild, ore in `hours`) i dati hourly
 * già presenti sui profili o nei backup uscita, così +server / contest possono contarli
 * anche dopo cleanup profilo.
 *
 * Uso (da root repo, .env con MONGO_*):
 *   node scripts/backfill-activity-guild-hourly.js profiles [guildId]
 *   node scripts/backfill-activity-guild-hourly.js backups [guildId]
 *   node scripts/backfill-activity-guild-hourly.js all [guildId]
 *
 * guildId opzionale: se omesso, elabora tutte le guild (lento).
 */

const path = require("path");
const mongoose = require("mongoose");

const { loadEnvFiles } = require("../shared/runtime/fsRuntime");

const ROOT = path.join(__dirname, "..");
loadEnvFiles(ROOT);
loadEnvFiles(path.join(ROOT, "Vinyls"));

const { ActivityUserProfile, ActivityGuildHourly, UserLeaveBackup } = require("../Vinyls/Schemas/Community/communitySchemas");

function mongoUrlFromEnv() {
  return (
    process.env.MONGO_URL ||
    process.env.MONGODB_URI ||
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGODB_URI_LOCAL ||
    ""
  ).trim();
}

function toPlainMap(o) {
  if (!o || typeof o !== "object" || Array.isArray(o)) return {};
  return { ...o };
}

function extractHourlyRowsFromProfileDoc(doc) {
  const guildId = String(doc?.guildId || "");
  const userId = String(doc?.userId || "");
  if (!guildId || !userId) return [];
  const hourly = doc?.profile?.totals?.hourly;
  if (!hourly || typeof hourly !== "object") return [];
  const rows = [];
  for (const [hourKey, value] of Object.entries(hourly)) {
    const hk = String(hourKey || "");
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(hk)) continue;
    const clean = value && typeof value === "object" ? value : {};
    rows.push({
      guildId,
      hourKey: hk,
      userId,
      textCount: Math.max(0, Number(clean.textCount || 0)),
      voiceSeconds: Math.max(0, Number(clean.voiceSeconds || 0)),
      textChannels: toPlainMap(clean.textChannels),
      voiceChannels: toPlainMap(clean.voiceChannels),
    });
  }
  return rows;
}

function buildGuildIncUpdate(row) {
  const gid = String(row.guildId || "");
  const hk = String(row.hourKey || "");
  const uid = String(row.userId || "");
  if (!gid || !hk || !uid) return null;
  const $inc = {};
  const tc = Math.max(0, Number(row.textCount || 0));
  const vs = Math.max(0, Number(row.voiceSeconds || 0));
  if (tc) $inc[`hours.${hk}.users.${uid}.text`] = tc;
  if (vs) $inc[`hours.${hk}.users.${uid}.voice`] = vs;
  for (const [ch, v] of Object.entries(row.textChannels || {})) {
    const n = Math.max(0, Number(v || 0));
    if (n) $inc[`hours.${hk}.users.${uid}.textCh.${String(ch)}`] = n;
  }
  for (const [ch, v] of Object.entries(row.voiceChannels || {})) {
    const n = Math.max(0, Number(v || 0));
    if (n) $inc[`hours.${hk}.users.${uid}.voiceCh.${String(ch)}`] = n;
  }
  if (Object.keys($inc).length === 0) return null;
  return {
    updateOne: {
      filter: { guildId: gid },
      update: { $setOnInsert: { guildId: gid }, $inc },
      upsert: true,
    },
  };
}

const BULK_CHUNK = 400;

async function flushBulk(ops) {
  if (!ops.length) return 0;
  const res = await ActivityGuildHourly.bulkWrite(ops, { ordered: false }).catch(() => null);
  return Number(res?.matchedCount || 0) + Number(res?.modifiedCount || 0) + Number(res?.upsertedCount || 0);
}

async function backfillFromProfiles(guildFilter) {
  const filter = { "profile.totals.hourly": { $exists: true, $ne: {} } };
  if (guildFilter) filter.guildId = String(guildFilter);
  let totalRows = 0;
  let bulk = [];
  const cursor = ActivityUserProfile.find(filter).select("guildId userId profile.totals.hourly").lean().cursor();
  for await (const doc of cursor) {
    const rows = extractHourlyRowsFromProfileDoc(doc);
    for (const row of rows) {
      const op = buildGuildIncUpdate(row);
      if (!op) continue;
      bulk.push(op);
      totalRows += 1;
      if (bulk.length >= BULK_CHUNK) {
        await flushBulk(bulk);
        bulk = [];
      }
    }
  }
  await flushBulk(bulk);
  return totalRows;
}

function rowsFromBackupDoc(backup) {
  const b = backup?.backupDoc;
  if (!b || typeof b !== "object") return [];
  const synthetic = {
    guildId: String(backup.guildId || b.guildId || ""),
    userId: String(backup.userId || b.userId || ""),
    profile: b.profile,
  };
  return extractHourlyRowsFromProfileDoc(synthetic);
}

async function backfillFromBackups(guildFilter) {
  const filter = { backupDoc: { $exists: true, $ne: null } };
  if (guildFilter) filter.guildId = String(guildFilter);
  const docs = await UserLeaveBackup.find(filter).lean().catch(() => []);
  let totalRows = 0;
  let bulk = [];
  for (const backup of docs) {
    for (const row of rowsFromBackupDoc(backup)) {
      const op = buildGuildIncUpdate(row);
      if (!op) continue;
      bulk.push(op);
      totalRows += 1;
      if (bulk.length >= BULK_CHUNK) {
        await flushBulk(bulk);
        bulk = [];
      }
    }
  }
  await flushBulk(bulk);
  return totalRows;
}

async function main() {
  const mode = String(process.argv[2] || "").toLowerCase();
  const guildId = String(process.argv[3] || "").trim() || null;
  if (!["profiles", "backups", "all"].includes(mode)) {
    console.error("Uso: node scripts/backfill-activity-guild-hourly.js <profiles|backups|all> [guildId]");
    process.exit(1);
  }
  const url = mongoUrlFromEnv();
  if (!url) {
    console.error("Imposta MONGO_URL o MONGODB_URI.");
    process.exit(1);
  }
  mongoose.set("strictQuery", false);
  await mongoose.connect(url);
  let n = 0;
  if (mode === "profiles" || mode === "all") {
    const c = await backfillFromProfiles(guildId);
    console.log(`profiles: ${c} righe hourly processate.`);
    n += c;
  }
  if (mode === "backups" || mode === "all") {
    const c = await backfillFromBackups(guildId);
    console.log(`backups: ${c} righe hourly processate.`);
    n += c;
  }
  console.log(`Totale operazioni riga: ${n} (bulkWrite su activityguildhourlys, doc unico per guild).`);
  await mongoose.disconnect().catch(() => null);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});