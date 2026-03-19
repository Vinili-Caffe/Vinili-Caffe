/**
 * Elimina ActivityDaily e ActivityHourly più vecchi di X giorni (una tantum).
 * La stessa logica viene eseguita automaticamente all'avvio del bot (dopo ~2 min).
 *
 * Uso:
 *   node scripts/prune-old-activity-data.js              → retention default 90/60 giorni
 *   node scripts/prune-old-activity-data.js --dry-run    → solo conteggio, nessuna eliminazione
 *   RETENTION_DAILY=60 RETENTION_HOURLY=30 node scripts/prune-old-activity-data.js
 *
 * Richiede .env: MONGO_URL.
 */
const path = require("path");
const mongoose = require("mongoose");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const MONGO_URL =
  process.env.MONGO_URL_LOCAL ||
  process.env.MONGODB_URI_LOCAL ||
  process.env.MONGO_URL ||
  process.env.MONGODB_URI;

const dryRun = process.argv.includes("--dry-run");

async function run() {
  if (!MONGO_URL) {
    console.error("Imposta MONGO_URL in .env");
    process.exit(1);
  }
  await mongoose.connect(MONGO_URL);
  const { ActivityDaily, ActivityHourly } = require("../Vinyls/Schemas/Community/communitySchemas");
  const { pruneOldActivityData } = require("../Vinyls/Services/Community/pruneOldActivityDataService");
  const retentionDaily = Math.max(31, Math.min(365, Number(process.env.RETENTION_DAILY) || 90));
  const retentionHourly = Math.max(14, Math.min(90, Number(process.env.RETENTION_HOURLY) || 60));

  if (dryRun) {
    const now = new Date();
    const pad2 = (n) => String(Number(n)).padStart(2, "0");
    const getDayKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    const getHourKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}`;
    const cutDaily = new Date(now.getTime() - retentionDaily * 24 * 60 * 60 * 1000);
    const cutHourly = new Date(now.getTime() - retentionHourly * 24 * 60 * 60 * 1000);
    const cutoffDateKey = getDayKey(cutDaily);
    const cutoffHourKey = getHourKey(cutHourly);
    const [dailyCount, hourlyCount] = await Promise.all([
      ActivityDaily.countDocuments({ dateKey: { $lt: cutoffDateKey } }),
      ActivityHourly.countDocuments({ hourKey: { $lt: cutoffHourKey } }),
    ]);
    console.log("[prune] --dry-run: nessuna eliminazione.");
    console.log("[prune] ActivityDaily con dateKey < " + cutoffDateKey + " (>" + retentionDaily + " gg): " + dailyCount);
    console.log("[prune] ActivityHourly con hourKey < " + cutoffHourKey + " (>" + retentionHourly + " gg): " + hourlyCount);
    await mongoose.disconnect();
    return;
  }

  const { dailyDeleted, hourlyDeleted } = await pruneOldActivityData({
    retentionDaysDaily: retentionDaily,
    retentionDaysHourly: retentionHourly,
  });
  console.log("[prune] ActivityDaily rimossi:", dailyDeleted, "(retention " + retentionDaily + " gg)");
  console.log("[prune] ActivityHourly rimossi:", hourlyDeleted, "(retention " + retentionHourly + " gg)");
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});