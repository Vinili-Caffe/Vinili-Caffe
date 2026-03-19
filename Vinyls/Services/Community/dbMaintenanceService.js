const mongoose = require("mongoose");
const {
  ActivityDailyCompact,
  ActivityHourlyCompact,
} = require("../../Schemas/Community/communitySchemas");

const DB_MAINTENANCE_INTERVAL_MS = Number(process.env.DB_MAINTENANCE_INTERVAL_MS) || 6 * 60 * 60 * 1000;
const DB_MAINTENANCE_START_DELAY_MS = Number(process.env.DB_MAINTENANCE_START_DELAY_MS) || 5 * 60 * 1000;

function isNonEmptyObject(value) {
  return Boolean(value && typeof value === "object" && Object.keys(value).length > 0);
}

async function pruneEmptyCompactActivityDocs() {
  const [dailyRows, hourlyRows] = await Promise.all([
    ActivityDailyCompact.find({}).select("_id users").lean().catch(() => []),
    ActivityHourlyCompact.find({}).select("_id users").lean().catch(() => []),
  ]);
  const dailyEmptyIds = dailyRows
    .filter((row) => !isNonEmptyObject(row?.users))
    .map((row) => row._id);
  const hourlyEmptyIds = hourlyRows
    .filter((row) => !isNonEmptyObject(row?.users))
    .map((row) => row._id);
  const [dailyRes, hourlyRes] = await Promise.all([
    dailyEmptyIds.length
      ? ActivityDailyCompact.deleteMany({ _id: { $in: dailyEmptyIds } }).catch(() => ({ deletedCount: 0 }))
      : Promise.resolve({ deletedCount: 0 }),
    hourlyEmptyIds.length
      ? ActivityHourlyCompact.deleteMany({ _id: { $in: hourlyEmptyIds } }).catch(() => ({ deletedCount: 0 }))
      : Promise.resolve({ deletedCount: 0 }),
  ]);
  return {
    dailyDeleted: Number(dailyRes?.deletedCount || 0),
    hourlyDeleted: Number(hourlyRes?.deletedCount || 0),
  };
}

async function runDbMaintenanceSweep() {
  if (mongoose.connection?.readyState !== 1) {
    return { skipped: true };
  }
  const emptyCompact = await pruneEmptyCompactActivityDocs();
  return {
    skipped: false,
    emptyDailyCompactDeleted: Number(emptyCompact?.dailyDeleted || 0),
    emptyHourlyCompactDeleted: Number(emptyCompact?.hourlyDeleted || 0),
  };
}

function startDbMaintenanceLoop(client, options = {}) {
  if (client?._dbMaintenanceInterval) return client._dbMaintenanceInterval;
  const intervalRaw = Number(options.intervalMs ?? DB_MAINTENANCE_INTERVAL_MS) || DB_MAINTENANCE_INTERVAL_MS;
  const intervalMs = Math.max(30 * 60 * 1000, Math.min(7 * 24 * 60 * 60 * 1000, intervalRaw));
  const delayRaw = Number(options.startDelayMs ?? DB_MAINTENANCE_START_DELAY_MS) || DB_MAINTENANCE_START_DELAY_MS;
  const delayMs = Math.max(10_000, Math.min(24 * 60 * 60 * 1000, delayRaw));

  const runTick = async () => {
    const result = await runDbMaintenanceSweep();
    if (result?.skipped) return;
    const total = Number(result.emptyDailyCompactDeleted || 0)
      + Number(result.emptyHourlyCompactDeleted || 0);
    if (total > 0) {
      global.logger?.info?.(
        "[DB MAINTENANCE] emptyDailyCompactDeleted=" + result.emptyDailyCompactDeleted +
        ", emptyHourlyCompactDeleted=" + result.emptyHourlyCompactDeleted,
      );
    }
  };

  const firstTimer = setTimeout(() => {
    runTick().catch((err) => {
      global.logger?.warn?.("[DB MAINTENANCE] Initial sweep failed:", err?.message || err);
    });
  }, delayMs);
  firstTimer.unref?.();
  client._dbMaintenanceStartTimer = firstTimer;

  const interval = setInterval(() => {
    runTick().catch((err) => {
      global.logger?.warn?.("[DB MAINTENANCE] Sweep failed:", err?.message || err);
    });
  }, intervalMs);
  interval.unref?.();
  client._dbMaintenanceInterval = interval;
  return interval;
}

module.exports = {
  runDbMaintenanceSweep,
  startDbMaintenanceLoop,
};