/** Attività: ricostruzione delle righe orarie mancanti. */
const { ActivityUserProfile, ACTIVITY_LEGACY_HOURLY_DISABLED } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { chunkArray, sanitizeChannelsMap, toObjectMap, addNumericMapInto, loadDailyRows, loadHourlyRows } = require("./activityRows") as typeof import("./activityRows");

const BACKFILL_HOUR_SUFFIX = "T12";
const HOURLY_BACKFILL_BATCH = 500;
const HOURLY_BACKFILL_PREFIX_MAX_WAIT_MS = Math.max(
  0,
  Math.min(120_000, Number(process.env.HOURLY_BACKFILL_PREFIX_MAX_WAIT_MS ?? 0)),
);

function kickHourlyBackfillForGuild(guildId?) {
  ensureHourlyBackfillForGuild(guildId).catch(() => {});
}

async function maybeAwaitHourlyBackfillForGuild(guildId?) {
  if (HOURLY_BACKFILL_PREFIX_MAX_WAIT_MS > 0) {
    let timer;
    try {
      const timeoutP = new Promise((resolve?) => {
        timer = setTimeout(() => resolve(null), HOURLY_BACKFILL_PREFIX_MAX_WAIT_MS);
        timer.unref?.();
      });
      await Promise.race([ensureHourlyBackfillForGuild(guildId), timeoutP]);
    } finally {
      if (timer) clearTimeout(timer);
    }
    return;
  }
  kickHourlyBackfillForGuild(guildId);
}

function shouldSkipBackfillRow(hourKey?, hourSet?) {
  if (!hourKey || typeof hourKey !== "string") return false;
  if (!hourKey.endsWith(BACKFILL_HOUR_SUFFIX)) return false;
  const dateKey = hourKey.slice(0, -BACKFILL_HOUR_SUFFIX.length);
  return [...hourSet].some((k?) => k.startsWith(`${dateKey}T`) && k !== hourKey);
}
const hourlyBackfillByGuild = new Map();

/**
 * Compatta: riempie profile.totals.hourly/daily da ActivityGuildHourly (canali inclusi)
 * senza riscrivere i nested sul DB. Utile per custom voc / panel.
 */
async function hydrateProfileActivityBucketsFromGuild(guildId?, userId?, leanDoc = null, opts: Record<string, any> = {}) {
  const gid = String(guildId || "");
  const uid = String(userId || "");
  const base =
    leanDoc && typeof leanDoc === "object"
      ? leanDoc
      : { guildId: gid, userId: uid, profile: { totals: {} } };
  if (!gid || !uid) return base;
  const hourKeys = Array.isArray(opts.hourKeys) ? opts.hourKeys : null;
  const rows = await loadHourlyRows(gid, hourKeys, uid).catch(() => []);
  const hourly = { ...toObjectMap(base?.profile?.totals?.hourly) };
  const daily = { ...toObjectMap(base?.profile?.totals?.daily) };
  for (const r of rows) {
    const hk = String(r?.hourKey || "");
    if (!hk) continue;
    hourly[hk] = {
      textCount: Math.max(0, Number(r.textCount || 0)),
      voiceSeconds: Math.max(0, Number(r.voiceSeconds || 0)),
      textChannels: { ...toObjectMap(r.textChannels) },
      voiceChannels: { ...toObjectMap(r.voiceChannels) },
    };
    const dk = hk.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dk)) continue;
    if (!daily[dk]) {
      daily[dk] = { textCount: 0, voiceSeconds: 0, textChannels: {}, voiceChannels: {} };
    }
    daily[dk].textCount = Math.max(0, Number(daily[dk].textCount || 0)) + Math.max(0, Number(r.textCount || 0));
    daily[dk].voiceSeconds =
      Math.max(0, Number(daily[dk].voiceSeconds || 0)) + Math.max(0, Number(r.voiceSeconds || 0));
    addNumericMapInto(daily[dk].textChannels, r.textChannels);
    addNumericMapInto(daily[dk].voiceChannels, r.voiceChannels);
  }
  const out = {
    ...base,
    guildId: gid,
    userId: uid,
    profile: {
      ...(base.profile || {}),
      totals: {
        ...(base.profile?.totals || {}),
        hourly,
        daily,
      },
    },
  };
  return out;
}

async function ensureHourlyBackfillForGuild(guildId?) {
  /* compact: non ripopolare nested hourly sul profilo (fonte = guild hourly) */
  if (ACTIVITY_LEGACY_HOURLY_DISABLED) return false;
  const safeGuildId = String(guildId || "");
  if (!safeGuildId) return false;

  if (hourlyBackfillByGuild.has(safeGuildId)) {
    return hourlyBackfillByGuild.get(safeGuildId);
  }

  const task = (async () => {
    const dailyRows = await loadDailyRows(safeGuildId);
    if (!dailyRows.length) return false;

    const profileOps = [];

    for (const row of dailyRows) {
      const dateKey = String(row?.dateKey || "");
      const userId = String(row?.userId || "");
      if (!dateKey || !userId) continue;

      const hourKey = `${dateKey}${BACKFILL_HOUR_SUFFIX}`;
      const textChannels = sanitizeChannelsMap(row?.textChannels || {});
      const voiceChannels = sanitizeChannelsMap(row?.voiceChannels || {});
      const textCount = Math.max(0, Number(row?.textCount || 0));
      const voiceSeconds = Math.max(0, Number(row?.voiceSeconds || 0));

      const hourPath = `profile.totals.hourly.${hourKey}`;
      profileOps.push({
        updateOne: {
          filter: {
            guildId: safeGuildId,
            userId,
            [hourPath]: { $exists: false },
          },
          update: {
            $set: {
              [`${hourPath}.textCount`]: textCount,
              [`${hourPath}.voiceSeconds`]: voiceSeconds,
              [`${hourPath}.textChannels`]: textChannels,
              [`${hourPath}.voiceChannels`]: voiceChannels,
            },
            $setOnInsert: { guildId: safeGuildId, userId },
          },
          upsert: true,
        },
      });
    }

    if (!profileOps.length) return false;

    let insertedCount = 0;
    const chunks = chunkArray(profileOps, HOURLY_BACKFILL_BATCH);
    for (const ops of chunks) {
      const result = await ActivityUserProfile.bulkWrite(ops, { ordered: false }).catch(() => null,);
      insertedCount += Number(result?.upsertedCount || 0) + Number(result?.modifiedCount || 0);
    }

    return insertedCount > 0;
  })()
    .catch((error?) => {
      global.logger?.warn?.(
        `[ACTIVITY]Hourly backfill failed for guild ${safeGuildId}:`,
        error?.message || error,
      );
      return false;
    })
    .finally(() => {
      hourlyBackfillByGuild.delete(safeGuildId);
    });

  hourlyBackfillByGuild.set(safeGuildId, task);
  return task;
}

export = { maybeAwaitHourlyBackfillForGuild, shouldSkipBackfillRow, hydrateProfileActivityBucketsFromGuild };
