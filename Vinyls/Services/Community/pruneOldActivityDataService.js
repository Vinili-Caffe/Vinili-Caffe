const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");

const TIME_ZONE = "Europe/Rome";

function getRomeDayKey(date) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const map = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return `${map.year}-${map.month}-${map.day}`;
}

function getRomeHourKey(date) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const map = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return `${map.year}-${map.month}-${map.day}T${map.hour}`;
}

/**
 * Rimuove chiavi `profile.totals.daily` / `profile.totals.hourly` scadute dai profili (retention giorni, confronto stringa su dateKey/hourKey Roma).
 * @param {{ retentionDaysDaily?: number, retentionDaysHourly?: number }} options - default 90 e 60 giorni
 * @returns {{ dailyDeleted: number, hourlyDeleted: number }}
 */
async function pruneOldActivityData(options = {}) {
  const retentionDaily = Math.max(31, Math.min(365, Number(options.retentionDaysDaily) || 90));
  const retentionHourly = Math.max(14, Math.min(90, Number(options.retentionDaysHourly) || 60));
  const now = new Date();
  const cutoffDaily = new Date(now.getTime() - retentionDaily * 24 * 60 * 60 * 1000);
  const cutoffHourly = new Date(now.getTime() - retentionHourly * 24 * 60 * 60 * 1000);
  const cutoffDateKey = getRomeDayKey(cutoffDaily);
  const cutoffHourKey = getRomeHourKey(cutoffHourly);

  let dailyDeleted = 0;
  let hourlyDeleted = 0;
  const batch = [];
  const cursor = ActivityUserProfile.find({}).select("_id profile.totals.daily profile.totals.hourly").cursor();

  for await (const doc of cursor) {
    const daily = { ...(doc?.profile?.totals?.daily && typeof doc.profile.totals.daily === "object" ? doc.profile.totals.daily : {}) };
    const hourly = { ...(doc?.profile?.totals?.hourly && typeof doc.profile.totals.hourly === "object" ? doc.profile.totals.hourly : {}) };
    let changed = false;
    for (const k of Object.keys(daily)) {
      if (k < cutoffDateKey) {
        delete daily[k];
        changed = true;
        dailyDeleted += 1;
      }
    }
    for (const k of Object.keys(hourly)) {
      if (k < cutoffHourKey) {
        delete hourly[k];
        changed = true;
        hourlyDeleted += 1;
      }
    }
    if (changed) {
      batch.push({
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: { "profile.totals.daily": daily, "profile.totals.hourly": hourly } },
        },
      });
    }
    if (batch.length >= 200) {
      await ActivityUserProfile.bulkWrite(batch, { ordered: false }).catch(() => null);
      batch.length = 0;
    }
  }
  if (batch.length) {
    await ActivityUserProfile.bulkWrite(batch, { ordered: false }).catch(() => null);
  }

  return { dailyDeleted, hourlyDeleted, retentionDaysDaily: retentionDaily, retentionDaysHourly: retentionHourly };
}

const PRUNE_ACTIVITY_LOOP_DEFAULT_INTERVAL_MS = Number(process.env.PRUNE_ACTIVITY_INTERVAL_MS) || 12 * 60 * 60 * 1000;

function startPruneActivityLoop(client, options = {}) {
  if (client?._pruneActivityInterval) return client._pruneActivityInterval;
  const resolved = Number(options.intervalMs ?? PRUNE_ACTIVITY_LOOP_DEFAULT_INTERVAL_MS) || PRUNE_ACTIVITY_LOOP_DEFAULT_INTERVAL_MS;
  const safeInterval = Math.max(60 * 60 * 1000, Math.min(7 * 24 * 60 * 60 * 1000, resolved));

  const runTick = async () => {
    const retentionDaily = Number(process.env.PRUNE_ACTIVITY_RETENTION_DAYS_DAILY) || 90;
    const retentionHourly = Number(process.env.PRUNE_ACTIVITY_RETENTION_DAYS_HOURLY) || 60;
    const { dailyDeleted, hourlyDeleted } = await pruneOldActivityData({
      retentionDaysDaily: retentionDaily,
      retentionDaysHourly: retentionHourly,
    });
    if (dailyDeleted > 0 || hourlyDeleted > 0) {
      global.logger?.info?.("[PRUNE ACTIVITY] Rimossi " + dailyDeleted + " bucket daily embedded (>" + retentionDaily + " gg), " + hourlyDeleted + " bucket hourly embedded (>" + retentionHourly + " gg).");
    }
  };

  const timer = setInterval(() => {
    runTick().catch((err) => {
      global.logger?.warn?.("[PRUNE ACTIVITY] Loop prune failed:", err?.message || err);
    });
  }, safeInterval);
  if (timer?.unref) timer.unref();
  client._pruneActivityInterval = timer;
  return timer;
}

module.exports = { pruneOldActivityData, startPruneActivityLoop };