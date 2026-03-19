/**
 * Migrazione copy-only verso schema unificato activity user profile.
 * Non cancella o modifica le collection sorgenti.
 *
 * Sorgenti:
 * - activityusers
 * - activitydailycompact
 * - activityhourlycompact
 * - activityeventrewards
 *
 * Target:
 * - activityuserprofiles
 *
 * Uso:
 *   node scripts/migrate-activity-collections-to-profile.js --dry-run
 *   node scripts/migrate-activity-collections-to-profile.js --atlas
 *   node scripts/migrate-activity-collections-to-profile.js --guild=1329080093599076474
 *   node scripts/migrate-activity-collections-to-profile.js --user=123456789012345678
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const mongoose = require("mongoose");
const {
  ActivityUser,
  ActivityDailyCompact,
  ActivityHourlyCompact,
  ActivityEventReward,
  ActivityUserProfile,
} = require("../Vinyls/Schemas/Community/communitySchemas");
const IDs = require("../Vinyls/Utils/Config/ids");

const DEFAULT_GUILD_ID = IDs.guilds?.main || "1329080093599076474";

function getArg(name, fallback = "") {
  const hit = process.argv.find((a) => String(a).startsWith(`--${name}=`));
  if (!hit) return fallback;
  return String(hit.split("=").slice(1).join("=")).trim();
}

function resolveMongoUrl() {
  if (process.argv.includes("--atlas")) return process.env.MONGO_URL || process.env.MONGODB_URI;
  return (
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGODB_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URI
  );
}

function asEntries(maybeMapLike) {
  if (!maybeMapLike) return [];
  if (maybeMapLike instanceof Map) return Array.from(maybeMapLike.entries());
  if (typeof maybeMapLike === "object") return Object.entries(maybeMapLike);
  return [];
}

function toNonNegativeInt(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function normalizePerSlotRow(row) {
  const textChannels = Object.fromEntries(
    asEntries(row?.textChannels).map(([k, v]) => [String(k), toNonNegativeInt(v)]),
  );
  const voiceChannels = Object.fromEntries(
    asEntries(row?.voiceChannels).map(([k, v]) => [String(k), toNonNegativeInt(v)]),
  );
  return {
    textCount: toNonNegativeInt(row?.textCount),
    voiceSeconds: toNonNegativeInt(row?.voiceSeconds),
    textChannels,
    voiceChannels,
  };
}

function ensureUserBucket(map, guildId, userId) {
  const key = `${guildId}\t${userId}`;
  let row = map.get(key);
  if (row) return row;
  row = {
    guildId: String(guildId),
    userId: String(userId),
    totals: {
      messagesTotal: 0,
      messagesDaily: 0,
      messagesWeekly: 0,
      messagesDailyKey: "",
      messagesWeeklyKey: "",
      voiceTotalSeconds: 0,
      voiceDailySeconds: 0,
      voiceWeeklySeconds: 0,
      voiceDailyKey: "",
      voiceWeeklyKey: "",
      sessionStartedAt: null,
      sessionChannelId: null,
      expAwardedSeconds: 0,
    },
    daily: {},
    hourly: {},
    eventRewards: [],
  };
  map.set(key, row);
  return row;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const guildId = String(getArg("guild", DEFAULT_GUILD_ID));
  const userIdFilter = String(getArg("user", ""));
  const mongoUrl = resolveMongoUrl();
  if (!mongoUrl) throw new Error("Mongo URL mancante");

  await mongoose.connect(mongoUrl, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000 });

  const baseQuery = { guildId };
  if (userIdFilter) baseQuery.userId = userIdFilter;

  const profiles = new Map();

  const totalsRows = await ActivityUser.find(baseQuery).lean().catch(() => []);
  for (const row of totalsRows) {
    const bucket = ensureUserBucket(profiles, row.guildId, row.userId);
    bucket.totals = {
      messagesTotal: toNonNegativeInt(row?.messages?.total),
      messagesDaily: toNonNegativeInt(row?.messages?.daily),
      messagesWeekly: toNonNegativeInt(row?.messages?.weekly),
      messagesDailyKey: String(row?.messages?.dailyKey || ""),
      messagesWeeklyKey: String(row?.messages?.weeklyKey || ""),
      voiceTotalSeconds: toNonNegativeInt(row?.voice?.totalSeconds),
      voiceDailySeconds: toNonNegativeInt(row?.voice?.dailySeconds),
      voiceWeeklySeconds: toNonNegativeInt(row?.voice?.weeklySeconds),
      voiceDailyKey: String(row?.voice?.dailyKey || ""),
      voiceWeeklyKey: String(row?.voice?.weeklyKey || ""),
      sessionStartedAt: row?.voice?.sessionStartedAt || null,
      sessionChannelId: row?.voice?.sessionChannelId || null,
      expAwardedSeconds: toNonNegativeInt(row?.voice?.expAwardedSeconds),
    };
  }

  const dailyRows = await ActivityDailyCompact.find({ guildId }).lean().catch(() => []);
  for (const row of dailyRows) {
    const dateKey = String(row?.dateKey || "");
    if (!dateKey) continue;
    const userRows = asEntries(row?.users);
    for (const [uid, payload] of userRows) {
      const userId = String(uid || "");
      if (!userId || (userIdFilter && userId !== userIdFilter)) continue;
      const bucket = ensureUserBucket(profiles, guildId, userId);
      bucket.daily[dateKey] = normalizePerSlotRow(payload);
    }
  }

  const hourlyRows = await ActivityHourlyCompact.find({ guildId }).lean().catch(() => []);
  for (const row of hourlyRows) {
    const hourKey = String(row?.hourKey || "");
    if (!hourKey) continue;
    const userRows = asEntries(row?.users);
    for (const [uid, payload] of userRows) {
      const userId = String(uid || "");
      if (!userId || (userIdFilter && userId !== userIdFilter)) continue;
      const bucket = ensureUserBucket(profiles, guildId, userId);
      bucket.hourly[hourKey] = normalizePerSlotRow(payload);
    }
  }

  const eventRows = await ActivityEventReward.find(baseQuery).lean().catch(() => []);
  const rewardDedup = new Map();
  for (const row of eventRows) {
    const gid = String(row?.guildId || "");
    const uid = String(row?.userId || "");
    if (!gid || !uid) continue;
    const key = `${gid}\t${uid}\t${String(row?.rewardType || "")}\t${String(row?.tier ?? "null")}`;
    const prev = rewardDedup.get(key);
    const createdAt = row?.createdAt ? new Date(row.createdAt) : null;
    const updatedAt = row?.updatedAt ? new Date(row.updatedAt) : createdAt;
    if (!prev) {
      rewardDedup.set(key, { gid, uid, rewardType: String(row?.rewardType || ""), tier: row?.tier == null ? null : Number(row.tier), firstSeenAt: createdAt, lastSeenAt: updatedAt });
      continue;
    }
    const firstSeenAt =
      prev.firstSeenAt && createdAt ? (prev.firstSeenAt < createdAt ? prev.firstSeenAt : createdAt) : (prev.firstSeenAt || createdAt || null);
    const lastSeenAt =
      prev.lastSeenAt && updatedAt ? (prev.lastSeenAt > updatedAt ? prev.lastSeenAt : updatedAt) : (prev.lastSeenAt || updatedAt || null);
    rewardDedup.set(key, { ...prev, firstSeenAt, lastSeenAt });
  }
  for (const value of rewardDedup.values()) {
    const bucket = ensureUserBucket(profiles, value.gid, value.uid);
    bucket.eventRewards.push({
      rewardType: value.rewardType,
      tier: value.tier,
      firstSeenAt: value.firstSeenAt,
      lastSeenAt: value.lastSeenAt,
    });
  }

  let upserts = 0;
  if (!dryRun) {
    const ops = [];
    for (const row of profiles.values()) {
      ops.push({
        updateOne: {
          filter: { guildId: row.guildId, userId: row.userId },
          update: {
            $set: {
              totals: row.totals,
              daily: row.daily,
              hourly: row.hourly,
              eventRewards: row.eventRewards,
            },
            $setOnInsert: { guildId: row.guildId, userId: row.userId },
          },
          upsert: true,
        },
      });
      if (ops.length >= 500) {
        const res = await ActivityUserProfile.bulkWrite(ops, { ordered: false }).catch(() => null);
        upserts += Number(res?.upsertedCount || 0) + Number(res?.modifiedCount || 0);
        ops.length = 0;
      }
    }
    if (ops.length) {
      const res = await ActivityUserProfile.bulkWrite(ops, { ordered: false }).catch(() => null);
      upserts += Number(res?.upsertedCount || 0) + Number(res?.modifiedCount || 0);
    }
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        guildId,
        userId: userIdFilter || null,
        sourceCounts: {
          activityUsers: totalsRows.length,
          activityDailyCompact: dailyRows.length,
          activityHourlyCompact: hourlyRows.length,
          activityEventRewards: eventRows.length,
        },
        mergedProfiles: profiles.size,
        writes: dryRun ? 0 : upserts,
        targetCollection: "activityuserprofiles",
      },
      null,
      2,
    ),
  );

  await mongoose.disconnect().catch(() => null);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});