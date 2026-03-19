const { ActivityDaily, ActivityHourly } = require("../../Schemas/Community/communitySchemas");

function pad2(n) {
  return String(Number(n)).padStart(2, "0");
}

function getDayKey(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${pad2(m)}-${pad2(day)}`;
}

function getHourKey(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const h = d.getHours();
  return `${y}-${pad2(m)}-${pad2(day)}T${pad2(h)}`;
}

/**
 * Elimina documenti ActivityDaily con dateKey precedente alla retention (giorni).
 * Elimina documenti ActivityHourly con hourKey precedente alla retention (giorni).
 * @param {{ retentionDaysDaily?: number, retentionDaysHourly?: number }} options - default 90 e 60 giorni
 * @returns {{ dailyDeleted: number, hourlyDeleted: number }}
 */
async function pruneOldActivityData(options = {}) {
  const retentionDaily = Math.max(31, Math.min(365, Number(options.retentionDaysDaily) || 90));
  const retentionHourly = Math.max(14, Math.min(90, Number(options.retentionDaysHourly) || 60));
  const now = new Date();
  const cutoffDaily = new Date(now.getTime() - retentionDaily * 24 * 60 * 60 * 1000);
  const cutoffHourly = new Date(now.getTime() - retentionHourly * 24 * 60 * 60 * 1000);
  const cutoffDateKey = getDayKey(cutoffDaily);
  const cutoffHourKey = getHourKey(cutoffHourly);

  const [dailyResult, hourlyResult] = await Promise.all([
    ActivityDaily.deleteMany({ dateKey: { $lt: cutoffDateKey } }).catch(() => ({ deletedCount: 0 })),
    ActivityHourly.deleteMany({ hourKey: { $lt: cutoffHourKey } }).catch(() => ({ deletedCount: 0 })),
  ]);
  const dailyDeleted = dailyResult?.deletedCount ?? 0;
  const hourlyDeleted = hourlyResult?.deletedCount ?? 0;
  return { dailyDeleted, hourlyDeleted, retentionDaysDaily: retentionDaily, retentionDaysHourly: retentionHourly };
}

module.exports = { pruneOldActivityData };