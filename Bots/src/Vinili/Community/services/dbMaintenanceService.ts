const mongoose = require("mongoose") as typeof import("mongoose");
const { shouldStartExternalWorkerLoop } = require("../../../shared/runtime/externalWorkerGate") as typeof import("../../../shared/runtime/externalWorkerGate");

const DB_MAINTENANCE_INTERVAL_MS = Number(process.env.DB_MAINTENANCE_INTERVAL_MS) || 6 * 60 * 60 * 1000;
const DB_MAINTENANCE_START_DELAY_MS = Number(process.env.DB_MAINTENANCE_START_DELAY_MS) || 5 * 60 * 1000;

async function runDbMaintenanceSweep() {
  if (mongoose.connection?.readyState !== 1) {
    return { skipped: true };
  }
  return {
    skipped: false,
    emptyDailyCompactDeleted: 0,
    emptyHourlyCompactDeleted: 0,
  };
}

function startDbMaintenanceLoop(client?, options: Record<string, any> = {}) {
  if (!shouldStartExternalWorkerLoop("BOT_SCHEDULER")) return null;
  if (client?._dbMaintenanceInterval) return client._dbMaintenanceInterval;
  const intervalRaw = Number(options.intervalMs ?? DB_MAINTENANCE_INTERVAL_MS) || DB_MAINTENANCE_INTERVAL_MS;
  const intervalMs = Math.max(30 * 60 * 1000, Math.min(7 * 24 * 60 * 60 * 1000, intervalRaw));
  const delayRaw = Number(options.startDelayMs ?? DB_MAINTENANCE_START_DELAY_MS) || DB_MAINTENANCE_START_DELAY_MS;
  const delayMs = Math.max(10_000, Math.min(24 * 60 * 60 * 1000, delayRaw));

  const runTick = async () => {
    await runDbMaintenanceSweep();
  };

  const firstTimer = setTimeout(() => {
    runTick().catch((err?) => {
      global.logger?.warn?.("[DB MAINTENANCE] Initial sweep failed:", err?.message || err);
    });
  }, delayMs);
  firstTimer.unref?.();
  client._dbMaintenanceStartTimer = firstTimer;

  const interval = setInterval(() => {
    runTick().catch((err?) => {
      global.logger?.warn?.("[DB MAINTENANCE] Sweep failed:", err?.message || err);
    });
  }, intervalMs);
  interval.unref?.();
  client._dbMaintenanceInterval = interval;
  return interval;
}

export = {
  startDbMaintenanceLoop,
};