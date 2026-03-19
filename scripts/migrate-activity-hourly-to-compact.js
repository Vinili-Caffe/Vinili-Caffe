/**
 * Migra activityhourlies (1 doc per user/hour) verso activityhourlycompact (1 doc per guild/hour con users{}).
 *
 * SICUREZZA: senza --yes NON scrive nulla (solo conteggio).
 *
 * Uso:
 *   node scripts/migrate-activity-hourly-to-compact.js
 *   node scripts/migrate-activity-hourly-to-compact.js --yes
 *   node scripts/migrate-activity-hourly-to-compact.js --yes --force
 */
const path = require("path");
const mongoose = require("mongoose");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const MONGO_URL =
  process.env.MONGO_URL_LOCAL ||
  process.env.MONGODB_URI_LOCAL ||
  process.env.MONGO_URL ||
  process.env.MONGODB_URI;

const doRun = process.argv.includes("--yes");
const force = process.argv.includes("--force");
const BATCH_SIZE = 300;

function toObjectMap(raw = {}) {
  if (!raw) return {};
  if (raw instanceof Map) return Object.fromEntries(raw.entries());
  if (typeof raw === "object") return raw;
  return {};
}

function mergeNumberMap(target, source) {
  const src = toObjectMap(source);
  for (const [k, v] of Object.entries(src)) {
    const key = String(k || "");
    const amount = Math.max(0, Number(v || 0));
    if (!key || amount <= 0) continue;
    target[key] = (target[key] || 0) + amount;
  }
}

async function run() {
  if (!MONGO_URL) {
    console.error("Imposta MONGO_URL (o MONGO_URL_LOCAL) in .env");
    process.exit(1);
  }

  await mongoose.connect(MONGO_URL);
  const { ActivityHourly, ActivityHourlyCompact } = require("../Vinyls/Schemas/Community/communitySchemas");

  const totalLegacy = await ActivityHourly.countDocuments().catch(() => 0);
  const totalCompact = await ActivityHourlyCompact.countDocuments().catch(() => 0);
  const uniqueLegacyGroups = await ActivityHourly.aggregate([
    { $group: { _id: { guildId: "$guildId", hourKey: "$hourKey" } } },
    { $count: "n" },
  ]).catch(() => []);
  const targetDocs = Number(uniqueLegacyGroups?.[0]?.n || 0);

  console.log("[migrate-activity-hourly-compact] legacy docs:", totalLegacy);
  console.log("[migrate-activity-hourly-compact] compact docs attuali:", totalCompact);
  console.log("[migrate-activity-hourly-compact] docs compact attesi da legacy:", targetDocs);

  if (!doRun) {
    console.log("[migrate-activity-hourly-compact] Modalita SICURA: nessuna scrittura (manca --yes).");
    console.log("[migrate-activity-hourly-compact] Esegui: node scripts/migrate-activity-hourly-to-compact.js --yes");
    await mongoose.disconnect();
    return;
  }

  if (force) {
    const deleted = await ActivityHourlyCompact.deleteMany({}).catch(() => ({ deletedCount: 0 }));
    console.log("[migrate-activity-hourly-compact] --force: svuotata activityhourlycompact, rimossi:", Number(deleted?.deletedCount || 0));
  }

  const rows = await ActivityHourly.find({})
    .select("guildId hourKey userId textCount voiceSeconds textChannels voiceChannels")
    .lean()
    .catch(() => []);

  const grouped = new Map();
  for (const row of rows) {
    const guildId = String(row?.guildId || "");
    const hourKey = String(row?.hourKey || "");
    const userId = String(row?.userId || "");
    if (!guildId || !hourKey || !userId) continue;
    const docKey = `${guildId}\n${hourKey}`;
    const userKey = userId;
    if (!grouped.has(docKey)) grouped.set(docKey, { guildId, hourKey, users: {} });
    const entry = grouped.get(docKey);
    const user = entry.users[userKey] || { textCount: 0, voiceSeconds: 0, textChannels: {}, voiceChannels: {} };
    user.textCount += Math.max(0, Number(row?.textCount || 0));
    user.voiceSeconds += Math.max(0, Number(row?.voiceSeconds || 0));
    mergeNumberMap(user.textChannels, row?.textChannels || {});
    mergeNumberMap(user.voiceChannels, row?.voiceChannels || {});
    entry.users[userKey] = user;
  }

  const docs = Array.from(grouped.values());
  let written = 0;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = docs.slice(i, i + BATCH_SIZE);
    const ops = batch.map((d) => ({
      updateOne: {
        filter: { guildId: d.guildId, hourKey: d.hourKey },
        update: { $set: { users: d.users }, $setOnInsert: { guildId: d.guildId, hourKey: d.hourKey } },
        upsert: true,
      },
    }));
    const result = await ActivityHourlyCompact.bulkWrite(ops, { ordered: false }).catch(() => ({ upsertedCount: 0, modifiedCount: 0 }));
    written += Number(result?.upsertedCount || 0) + Number(result?.modifiedCount || 0);
  }

  try {
    await ActivityHourlyCompact.collection.createIndex({ guildId: 1, hourKey: 1 }, { unique: true, name: "guildId_1_hourKey_1_unique" });
  } catch (_) { }

  const afterCompact = await ActivityHourlyCompact.countDocuments().catch(() => 0);
  console.log("[migrate-activity-hourly-compact] write ops complete:", written);
  console.log("[migrate-activity-hourly-compact] compact docs finali:", afterCompact);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});